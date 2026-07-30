import { migrateToPhase2 } from "./phase2-state.ts";
import { sourceTextFingerprint } from "./source-fingerprint.ts";
import type {
  Phase2State,
  ReviewEvent,
  SourceItem,
} from "./phase2-types.ts";

const DATABASE_NAME = "bunki-phase2";
const DATABASE_VERSION = 3;
const ENVELOPE_STORE = "envelopes";
const BODY_STORE = "sourceBodies";
const REVIEW_STORE = "reviewEvents";
const LEGACY_ENVELOPE_KEY = "current";
const sourceFingerprintCache = new WeakMap<object, string>();

const scopeKey = (syncScope: string | null): string =>
  syncScope === null ? "scope:anonymous-device" : `scope:${syncScope}`;

type PersistedSource = Omit<SourceItem, "text"> & {
  readonly text: "";
  readonly bodyFingerprint: string | null;
};

type StateManifest = Omit<Phase2State, "sources"> & {
  readonly sources: readonly PersistedSource[];
};

interface SourceBodyRecord {
  readonly key: string;
  readonly sourceId: string;
  readonly fingerprint: string;
  readonly text: string;
  readonly byteLength: number;
  readonly createdAt: string;
}

interface PersistedConflict {
  readonly remote: StateManifest;
  readonly remoteRevision: number;
  readonly paths: readonly string[];
  readonly detectedAt: string;
}

interface PersistedEnvelope {
  readonly key: string;
  readonly format: "bunki-local-v2" | "bunki-local-v3";
  readonly current: StateManifest;
  readonly base: StateManifest | null;
  readonly syncScope: string | null;
  readonly localRevision?: number;
  readonly dirty: boolean;
  readonly acknowledgedServerRevision: number;
  readonly savedAt: string;
  readonly conflict: PersistedConflict | null;
}

export interface LocalPhase2Conflict {
  readonly remote: Phase2State;
  readonly remoteRevision: number;
  readonly paths: readonly string[];
  readonly detectedAt: string;
}

export interface LocalPhase2Snapshot {
  readonly current: Phase2State;
  readonly base: Phase2State | null;
  readonly syncScope: string | null;
  readonly localRevision: number;
  readonly dirty: boolean;
  readonly acknowledgedServerRevision: number;
  readonly savedAt: string;
  readonly conflict: LocalPhase2Conflict | null;
}

interface PersistedReviewRow {
  readonly id: string;
  readonly scope: string;
  readonly event: ReviewEvent;
}

const legacyBodyKey = (sourceId: string, fingerprint: string): string =>
  `${sourceId}\u0000${fingerprint}`;

const bodyKey = (
  syncScope: string | null,
  sourceId: string,
  fingerprint: string,
): string => `${scopeKey(syncScope)}\u0000${sourceId}\u0000${fingerprint}`;

function decompose(state: Phase2State, syncScope: string | null): {
  readonly manifest: StateManifest;
  readonly bodies: readonly SourceBodyRecord[];
} {
  const bodies: SourceBodyRecord[] = [];
  const sources = state.sources.map((source): PersistedSource => {
    if (source.text === "")
      return { ...source, text: "", bodyFingerprint: null };
    const fingerprint =
      sourceFingerprintCache.get(source) ??
      sourceTextFingerprint(source.text);
    sourceFingerprintCache.set(source, fingerprint);
    bodies.push({
      key: bodyKey(syncScope, source.id, fingerprint),
      sourceId: source.id,
      fingerprint,
      text: source.text,
      byteLength: new TextEncoder().encode(source.text).byteLength,
      createdAt: new Date().toISOString(),
    });
    return { ...source, text: "", bodyFingerprint: fingerprint };
  });
  return {
    manifest: {
      ...state,
      sources,
      reviewEvents: state.reviewEvents.slice(-120),
      lastUndo: null,
    },
    bodies,
  };
}

function hydrate(
  manifest: StateManifest,
  bodies: ReadonlyMap<string, SourceBodyRecord>,
  syncScope: string | null,
): Phase2State {
  const sources = manifest.sources.map((source) => {
    if (source.bodyFingerprint === null) return { ...source, text: "" };
    const body =
      bodies.get(bodyKey(syncScope, source.id, source.bodyFingerprint)) ??
      (syncScope === null
        ? bodies.get(legacyBodyKey(source.id, source.bodyFingerprint))
        : undefined);
    if (body === undefined)
      throw new Error(`MISSING_LOCAL_SOURCE_BODY:${source.id}`);
    return { ...source, text: body.text };
  });
  return migrateToPhase2({ ...manifest, sources });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed.")),
      { once: true },
    );
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () => reject(transaction.error ?? new Error("IndexedDB transaction aborted.")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
      { once: true },
    );
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener(
      "upgradeneeded",
      () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ENVELOPE_STORE))
          database.createObjectStore(ENVELOPE_STORE, { keyPath: "key" });
        if (!database.objectStoreNames.contains(BODY_STORE))
          database.createObjectStore(BODY_STORE, { keyPath: "key" });
        if (!database.objectStoreNames.contains(REVIEW_STORE)) {
          const reviews = database.createObjectStore(REVIEW_STORE, {
            keyPath: "id",
          });
          reviews.createIndex("reviewedAt", "reviewedAt");
        }
      },
      { once: true },
    );
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB could not open.")),
      { once: true },
    );
    request.addEventListener(
      "blocked",
      () => reject(new Error("IndexedDB upgrade is blocked by another tab.")),
      { once: true },
    );
  });
}

export async function loadLocalPhase2Snapshot(
  syncScope: string | null,
): Promise<LocalPhase2Snapshot | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      [ENVELOPE_STORE, BODY_STORE, REVIEW_STORE],
      "readonly",
    );
    const envelopeRequest = transaction
      .objectStore(ENVELOPE_STORE)
      .get(scopeKey(syncScope)) as IDBRequest<PersistedEnvelope | undefined>;
    const legacyEnvelopeRequest =
      syncScope === null
        ? (transaction
            .objectStore(ENVELOPE_STORE)
            .get(LEGACY_ENVELOPE_KEY) as IDBRequest<
            PersistedEnvelope | undefined
          >)
        : null;
    const bodiesRequest = transaction
      .objectStore(BODY_STORE)
      .getAll() as IDBRequest<SourceBodyRecord[]>;
    const reviewsRequest = transaction
      .objectStore(REVIEW_STORE)
      .getAll() as IDBRequest<Array<PersistedReviewRow | ReviewEvent>>;
    const [scopedEnvelope, legacyEnvelope, bodyRows, reviewRows] =
      await Promise.all([
      requestResult(envelopeRequest),
      legacyEnvelopeRequest === null
        ? Promise.resolve(undefined)
        : requestResult(legacyEnvelopeRequest),
      requestResult(bodiesRequest),
      requestResult(reviewsRequest),
      transactionDone(transaction),
    ]);
    const envelope = scopedEnvelope ?? legacyEnvelope;
    if (
      envelope === undefined ||
      !["bunki-local-v2", "bunki-local-v3"].includes(envelope.format)
    )
      return null;
    const bodies = new Map(bodyRows.map((body) => [body.key, body]));
    const current = hydrate(envelope.current, bodies, syncScope);
    const localReviews = reviewRows
      .flatMap((row) => {
        if ("event" in row && "scope" in row)
          return row.scope === scopeKey(syncScope) ? [row.event] : [];
        return syncScope === null ? [row] : [];
      })
      .sort((left, right) => left.reviewedAt.localeCompare(right.reviewedAt))
      .slice(-5_000);
    return {
      current: { ...current, reviewEvents: localReviews, lastUndo: null },
      base:
        envelope.base === null
          ? null
          : hydrate(envelope.base, bodies, syncScope),
      syncScope,
      localRevision:
        typeof envelope.localRevision === "number" &&
        Number.isSafeInteger(envelope.localRevision) &&
        envelope.localRevision >= 0
          ? envelope.localRevision
          : 0,
      dirty: envelope.dirty,
      acknowledgedServerRevision: envelope.acknowledgedServerRevision,
      savedAt: envelope.savedAt,
      conflict:
        envelope.conflict === null
          ? null
          : {
              remote: hydrate(envelope.conflict.remote, bodies, syncScope),
              remoteRevision: envelope.conflict.remoteRevision,
              paths: envelope.conflict.paths,
              detectedAt: envelope.conflict.detectedAt,
            },
    };
  } finally {
    database.close();
  }
}

export async function loadLocalSourceBody(
  syncScope: string | null,
  sourceId: string,
  fingerprint: string,
): Promise<string | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BODY_STORE, "readonly");
    const store = transaction.objectStore(BODY_STORE);
    const scopedRequest = store.get(
      bodyKey(syncScope, sourceId, fingerprint),
    ) as IDBRequest<SourceBodyRecord | undefined>;
    const legacyRequest =
      syncScope === null
        ? (store.get(
            legacyBodyKey(sourceId, fingerprint),
          ) as IDBRequest<SourceBodyRecord | undefined>)
        : null;
    const [scoped, legacy] = await Promise.all([
      requestResult(scopedRequest),
      legacyRequest === null
        ? Promise.resolve(undefined)
        : requestResult(legacyRequest),
      transactionDone(transaction),
    ]);
    return scoped?.text ?? legacy?.text ?? null;
  } finally {
    database.close();
  }
}

export async function saveLocalPhase2Snapshot(
  snapshot: Omit<LocalPhase2Snapshot, "localRevision">,
  expectedLocalRevision: number,
): Promise<number> {
  const current = decompose(snapshot.current, snapshot.syncScope);
  const base =
    snapshot.base === null
      ? null
      : decompose(snapshot.base, snapshot.syncScope);
  const conflict =
    snapshot.conflict === null
      ? null
      : decompose(snapshot.conflict.remote, snapshot.syncScope);
  const database = await openDatabase();
  try {
    const key = scopeKey(snapshot.syncScope);
    const nextLocalRevision = expectedLocalRevision + 1;
    return await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction(
        [ENVELOPE_STORE, BODY_STORE, REVIEW_STORE],
        "readwrite",
      );
      const envelopeStore = transaction.objectStore(ENVELOPE_STORE);
      const bodyStore = transaction.objectStore(BODY_STORE);
      const reviewStore = transaction.objectStore(REVIEW_STORE);
      const envelopeRequest = envelopeStore.get(key) as IDBRequest<
        PersistedEnvelope | undefined
      >;
      const reviewsRequest = reviewStore.getAll() as IDBRequest<
        Array<PersistedReviewRow | ReviewEvent>
      >;
      const bodyKeysRequest = bodyStore.getAllKeys() as IDBRequest<
        IDBValidKey[]
      >;
      let failure: Error | null = null;
      let envelopeReady = false;
      let reviewsReady = false;
      let bodyKeysReady = false;
      let existingEnvelope: PersistedEnvelope | undefined;
      let existingReviews: Array<PersistedReviewRow | ReviewEvent> = [];
      let existingBodyKeys = new Set<string>();

      const write = (): void => {
        if (
          !envelopeReady ||
          !reviewsReady ||
          !bodyKeysReady ||
          failure !== null
        )
          return;
        const storedLocalRevision =
          typeof existingEnvelope?.localRevision === "number" &&
          Number.isSafeInteger(existingEnvelope.localRevision) &&
          existingEnvelope.localRevision >= 0
            ? existingEnvelope.localRevision
            : 0;
        if (
          existingEnvelope !== undefined &&
          storedLocalRevision !== expectedLocalRevision
        ) {
          failure = new Error("LOCAL_REVISION_CONFLICT");
          transaction.abort();
          return;
        }
        if (existingEnvelope === undefined && expectedLocalRevision !== 0) {
          failure = new Error("LOCAL_REVISION_CONFLICT");
          transaction.abort();
          return;
        }
        for (const body of [
          ...current.bodies,
          ...(base?.bodies ?? []),
          ...(conflict?.bodies ?? []),
        ]) {
          if (existingBodyKeys.has(body.key)) continue;
          bodyStore.put(body);
          existingBodyKeys.add(body.key);
        }
        const desiredReviewIds = new Set(
          snapshot.current.reviewEvents.map(
            (event) => `${key}\u0000${event.id}`,
          ),
        );
        const storedReviewIds = new Set<string>();
        for (const row of existingReviews) {
          if ("event" in row && "scope" in row) {
            if (row.scope !== key) continue;
            storedReviewIds.add(row.id);
            if (!desiredReviewIds.has(row.id)) reviewStore.delete(row.id);
          } else if (snapshot.syncScope === null) {
            reviewStore.delete(row.id);
          }
        }
        for (const event of snapshot.current.reviewEvents) {
          const row: PersistedReviewRow = {
            id: `${key}\u0000${event.id}`,
            scope: key,
            event,
          };
          if (!storedReviewIds.has(row.id)) reviewStore.put(row);
        }
        const envelope: PersistedEnvelope = {
          key,
          format: "bunki-local-v3",
          current: current.manifest,
          base: base?.manifest ?? null,
          syncScope: snapshot.syncScope,
          localRevision: nextLocalRevision,
          dirty: snapshot.dirty,
          acknowledgedServerRevision: Math.max(
            0,
            Math.floor(snapshot.acknowledgedServerRevision),
          ),
          savedAt: snapshot.savedAt,
          conflict:
            snapshot.conflict === null || conflict === null
              ? null
              : {
                  remote: conflict.manifest,
                  remoteRevision: snapshot.conflict.remoteRevision,
                  paths: snapshot.conflict.paths,
                  detectedAt: snapshot.conflict.detectedAt,
                },
        };
        envelopeStore.put(envelope);
      };

      envelopeRequest.addEventListener("success", () => {
        existingEnvelope = envelopeRequest.result;
        envelopeReady = true;
        write();
      });
      reviewsRequest.addEventListener("success", () => {
        existingReviews = reviewsRequest.result;
        reviewsReady = true;
        write();
      });
      bodyKeysRequest.addEventListener("success", () => {
        existingBodyKeys = new Set(
          bodyKeysRequest.result.filter(
            (item): item is string => typeof item === "string",
          ),
        );
        bodyKeysReady = true;
        write();
      });
      transaction.addEventListener(
        "complete",
        () => resolve(nextLocalRevision),
        { once: true },
      );
      transaction.addEventListener(
        "abort",
        () =>
          reject(
            failure ??
              transaction.error ??
              new Error("IndexedDB transaction aborted."),
          ),
        { once: true },
      );
      transaction.addEventListener(
        "error",
        () => {
          failure ??=
            transaction.error ?? new Error("IndexedDB transaction failed.");
        },
        { once: true },
      );
    });
  } finally {
    database.close();
  }
}

import { headers } from "next/headers";

import { bunkiDatabase } from "../../lib/database";
import { compactPhase2State, migrateToPhase2 } from "../../lib/phase2-state";
import { validatePhase2StateForPersistence } from "../../lib/phase2-validation";
import { sourceTextFingerprint } from "../../lib/source-fingerprint";
import type { Phase2State } from "../../lib/phase2-types";

export const runtime = "edge";

const MAX_REQUEST_BYTES = 12_000_000;
const MAX_MANIFEST_BYTES = 3_000_000;
const MAX_SOURCE_BODY_BYTES = 2_000_000;

async function ownerId(): Promise<string | null> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("oai-authenticated-user-id") ??
    requestHeaders.get("oai-authenticated-user-email")
  );
}

const syncScope = (owner: string): string =>
  sourceTextFingerprint(`bunki-owner-scope:${owner}`);

async function ensureSchema(): Promise<void> {
  const database = await bunkiDatabase();
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS learner_states (
        owner_id TEXT PRIMARY KEY NOT NULL,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS learner_states_v2 (
        owner_id TEXT PRIMARY KEY NOT NULL,
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS learner_source_bodies (
        owner_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        body_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, source_id, fingerprint)
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS learner_review_events (
        owner_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        concept_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        skill TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        source_id TEXT,
        PRIMARY KEY (owner_id, event_id)
      )`,
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS learner_review_events_owner_time_idx ON learner_review_events(owner_id, reviewed_at)",
    ),
  ]);
}

interface StoredState {
  readonly stateJson: string;
  readonly updatedAt: string;
  readonly revision: number;
}

class MissingSourceBodyError extends Error {
  constructor(
    readonly sourceId: string,
    readonly fingerprint: string,
  ) {
    super("MISSING_SOURCE_BODY");
  }
}

async function loadStored(owner: string): Promise<StoredState | null> {
  const database = await bunkiDatabase();
  const current = await database
    .prepare(
      "SELECT state_json AS stateJson, updated_at AS updatedAt, revision FROM learner_states_v2 WHERE owner_id = ?",
    )
    .bind(owner)
    .first<StoredState>();
  if (current !== null) return current;
  const legacy = await database
    .prepare(
      "SELECT state_json AS stateJson, updated_at AS updatedAt FROM learner_states WHERE owner_id = ?",
    )
    .bind(owner)
    .first<Omit<StoredState, "revision">>();
  return legacy === null ? null : { ...legacy, revision: 0 };
}

const byteLength = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

interface SourceBodyReference {
  readonly sourceId: string;
  readonly fingerprint: string;
}

const sourceBodyKey = (reference: SourceBodyReference): string =>
  `${reference.sourceId}\u0000${reference.fingerprint}`;

async function loadSourceBodies(
  owner: string,
  references: readonly SourceBodyReference[],
): Promise<ReadonlyMap<string, string>> {
  const unique = [
    ...new Map(
      references.map((reference) => [sourceBodyKey(reference), reference]),
    ).values(),
  ];
  const database = await bunkiDatabase();
  const bodies = new Map<string, string>();
  for (let start = 0; start < unique.length; start += 50) {
    const chunk = unique.slice(start, start + 50);
    const results = await database.batch(
      chunk.map((reference) =>
        database
          .prepare(
            `SELECT body_text AS bodyText
             FROM learner_source_bodies
             WHERE owner_id = ? AND source_id = ? AND fingerprint = ?`,
          )
          .bind(owner, reference.sourceId, reference.fingerprint),
      ),
    );
    results.forEach((result, index) => {
      const row = result.results?.[0] as { bodyText?: unknown } | undefined;
      if (typeof row?.bodyText === "string")
        bodies.set(sourceBodyKey(chunk[index]), row.bodyText);
    });
  }
  return bodies;
}

interface SourceBodyWrite {
  readonly sourceId: string;
  readonly fingerprint: string;
  readonly text: string;
  readonly bytes: number;
}

async function decomposeState(
  input: unknown,
): Promise<{
  readonly canonical: Phase2State;
  readonly stateJson: string;
  readonly bodies: readonly SourceBodyWrite[];
}> {
  const canonical = compactPhase2State(migrateToPhase2(input));
  const manifest = structuredClone(canonical) as Phase2State & {
    sources: Array<
      Phase2State["sources"][number] & { bodyFingerprint?: string }
    >;
  };
  const bodies: SourceBodyWrite[] = [];
  manifest.sources = await Promise.all(
    manifest.sources.map(async (source) => {
      if (source.text === "") return source;
      const bytes = byteLength(source.text);
      if (bytes > MAX_SOURCE_BODY_BYTES)
        throw new Error("SOURCE_BODY_TOO_LARGE");
      const fingerprint = sourceTextFingerprint(source.text);
      bodies.push({
        sourceId: source.id,
        fingerprint,
        text: source.text,
        bytes,
      });
      return { ...source, text: "", bodyFingerprint: fingerprint };
    }),
  );
  const stateJson = JSON.stringify(manifest);
  if (byteLength(stateJson) > MAX_MANIFEST_BYTES)
    throw new Error("STATE_MANIFEST_TOO_LARGE");
  return { canonical, stateJson, bodies };
}

async function hydrateIncomingState(
  owner: string,
  input: unknown,
): Promise<{
  readonly hydrated: unknown;
  readonly missing: readonly {
    readonly sourceId: string;
    readonly fingerprint: string;
  }[];
}> {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    return { hydrated: input, missing: [] };
  const hydrated = structuredClone(input) as Record<string, unknown>;
  if (!Array.isArray(hydrated.sources))
    return { hydrated, missing: [] };
  const references = hydrated.sources.flatMap((sourceValue) => {
    if (
      sourceValue === null ||
      typeof sourceValue !== "object" ||
      Array.isArray(sourceValue)
    )
      return [];
    const source = sourceValue as Record<string, unknown>;
    const sourceId = typeof source.id === "string" ? source.id : "";
    const text = typeof source.text === "string" ? source.text : "";
    const fingerprint =
      typeof source.bodyFingerprint === "string"
        ? source.bodyFingerprint
        : "";
    return text === "" && sourceId !== "" && fingerprint !== ""
      ? [{ sourceId, fingerprint }]
      : [];
  });
  const bodies = await loadSourceBodies(owner, references);
  const missing: Array<{ sourceId: string; fingerprint: string }> = [];
  hydrated.sources = hydrated.sources.map((sourceValue) => {
      if (
        sourceValue === null ||
        typeof sourceValue !== "object" ||
        Array.isArray(sourceValue)
      )
        return sourceValue;
      const source = sourceValue as Record<string, unknown>;
      const sourceId = typeof source.id === "string" ? source.id : "";
      const text = typeof source.text === "string" ? source.text : "";
      const fingerprint =
        typeof source.bodyFingerprint === "string"
          ? source.bodyFingerprint
          : "";
      if (text !== "" || sourceId === "" || fingerprint === "") return source;
      const body = bodies.get(sourceBodyKey({ sourceId, fingerprint }));
      if (body === undefined) {
        missing.push({ sourceId, fingerprint });
        return source;
      }
      return { ...source, text: body };
    });
  return { hydrated, missing };
}

async function hydrateStoredState(
  owner: string,
  stateJson: string,
): Promise<unknown> {
  const parsed = JSON.parse(stateJson) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    return parsed;
  const row = parsed as Record<string, unknown>;
  if (!Array.isArray(row.sources)) return parsed;
  const references = row.sources.flatMap((sourceValue) => {
    if (
      sourceValue === null ||
      typeof sourceValue !== "object" ||
      Array.isArray(sourceValue)
    )
      return [];
    const source = sourceValue as Record<string, unknown>;
    const sourceId = typeof source.id === "string" ? source.id : "";
    const fingerprint =
      typeof source.bodyFingerprint === "string"
        ? source.bodyFingerprint
        : "";
    return sourceId !== "" && fingerprint !== ""
      ? [{ sourceId, fingerprint }]
      : [];
  });
  const bodies = await loadSourceBodies(owner, references);
  row.sources = row.sources.map((sourceValue) => {
      if (
        sourceValue === null ||
        typeof sourceValue !== "object" ||
        Array.isArray(sourceValue)
      )
        return sourceValue;
      const source = sourceValue as Record<string, unknown>;
      const sourceId = typeof source.id === "string" ? source.id : "";
      const fingerprint =
        typeof source.bodyFingerprint === "string"
          ? source.bodyFingerprint
          : "";
      if (sourceId === "" || fingerprint === "") return source;
      const body = bodies.get(sourceBodyKey({ sourceId, fingerprint }));
      if (body === undefined)
        throw new MissingSourceBodyError(sourceId, fingerprint);
      return {
        ...source,
        text: body,
      };
    });
  return row;
}

async function conflictPayload(
  owner: string,
  stored: StoredState | null,
): Promise<Record<string, unknown>> {
  if (stored === null) return { state: null, revision: 0, updatedAt: null };
  try {
    return {
      state: await hydrateStoredState(owner, stored.stateJson),
      revision: stored.revision,
      updatedAt: stored.updatedAt,
    };
  } catch (error) {
    if (error instanceof MissingSourceBodyError)
      return {
        code: "MISSING_SOURCE_BODY",
        manifest: JSON.parse(stored.stateJson) as unknown,
        sourceId: error.sourceId,
        fingerprint: error.fingerprint,
        revision: stored.revision,
        updatedAt: stored.updatedAt,
      };
    return {
      code: "CORRUPT_STATE",
      revision: stored.revision,
      updatedAt: stored.updatedAt,
    };
  }
}

export async function GET(request?: Request): Promise<Response> {
  const owner = await ownerId();
  if (owner === null) {
    return Response.json(
      { state: null, updatedAt: null, localOnly: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  await ensureSchema();
  const row = await loadStored(owner);
  const scopeOnly =
    request !== undefined &&
    new URL(request.url).searchParams.get("scopeOnly") === "1";
  if (row === null)
    return Response.json(
      {
        state: null,
        updatedAt: null,
        revision: 0,
        hasState: false,
        localOnly: false,
        syncScope: syncScope(owner),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  if (scopeOnly)
    return Response.json(
      {
        state: null,
        updatedAt: row.updatedAt,
        revision: row.revision,
        hasState: true,
        localOnly: false,
        syncScope: syncScope(owner),
        scopeOnly: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    return Response.json(
      {
        state: await hydrateStoredState(owner, row.stateJson),
        updatedAt: row.updatedAt,
        revision: row.revision,
        localOnly: false,
        syncScope: syncScope(owner),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MissingSourceBodyError)
      return Response.json(
        {
          error:
            "One saved source body is unavailable. Bunki did not return or rewrite an incomplete state.",
          code: "MISSING_SOURCE_BODY",
          sourceId: error.sourceId,
          fingerprint: error.fingerprint,
          manifest: JSON.parse(row.stateJson) as unknown,
          revision: row.revision,
          updatedAt: row.updatedAt,
          localOnly: false,
          syncScope: syncScope(owner),
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(
      { error: "Saved learner state is corrupt.", code: "CORRUPT_STATE" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  const raw = await request.text();
  if (byteLength(raw) > MAX_REQUEST_BYTES)
    return Response.json({ error: "Bunki state is too large to save." }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ error: "State must be valid JSON." }, { status: 400 });
  }
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !("state" in payload)
  )
    return Response.json(
      { error: "A valid version-2 learner state is required." },
      { status: 400 },
    );

  const owner = await ownerId();
  const expectedSyncScope =
    "expectedSyncScope" in payload &&
    typeof (payload as { expectedSyncScope?: unknown }).expectedSyncScope ===
      "string"
      ? (payload as { expectedSyncScope: string }).expectedSyncScope
      : null;
  if (owner === null) {
    if (expectedSyncScope !== null)
      return Response.json(
        {
          error: "The signed-in account changed before this state could be saved.",
          code: "SYNC_SCOPE_CHANGED",
          syncScope: null,
        },
        { status: 409 },
      );
    return Response.json({ saved: false, localOnly: true });
  }
  await ensureSchema();
  const database = await bunkiDatabase();
  const actualSyncScope = syncScope(owner);
  if (expectedSyncScope !== actualSyncScope)
    return Response.json(
      {
        error: "The signed-in account changed before this state could be saved.",
        code: "SYNC_SCOPE_CHANGED",
        syncScope: actualSyncScope,
      },
      { status: 409 },
    );
  const baseRevision =
    "baseRevision" in payload &&
    typeof (payload as { baseRevision?: unknown }).baseRevision === "number" &&
    Number.isInteger((payload as { baseRevision: number }).baseRevision)
      ? Math.max(0, (payload as { baseRevision: number }).baseRevision)
      : 0;
  const nextRevision = baseRevision + 1;
  const updatedAt = new Date().toISOString();
  const incoming = await hydrateIncomingState(
    owner,
    (payload as { state: unknown }).state,
  );
  if (incoming.missing.length > 0) {
    const current = await loadStored(owner);
    return Response.json(
      {
        error: "Upload the exact missing source bodies before saving the manifest.",
        code: "MISSING_SOURCE_BODIES",
        missing: incoming.missing,
        revision: current?.revision ?? 0,
        syncScope: actualSyncScope,
      },
      { status: 409 },
    );
  }
  if (!validatePhase2StateForPersistence(incoming.hydrated))
    return Response.json(
      { error: "A valid version-2 learner state is required." },
      { status: 400 },
    );
  let decomposed: Awaited<ReturnType<typeof decomposeState>>;
  try {
    decomposed = await decomposeState(incoming.hydrated);
  } catch (error) {
    const code = error instanceof Error ? error.message : "STATE_TOO_LARGE";
    return Response.json(
      {
        error:
          code === "SOURCE_BODY_TOO_LARGE"
            ? "One source is too large to save."
            : "Bunki’s compact learner state is too large to save.",
        code,
      },
      { status: 413 },
    );
  }
  const { stateJson, bodies } = decomposed;
  for (let start = 0; start < bodies.length; start += 50) {
    const chunk = bodies.slice(start, start + 50);
    await database.batch(
      chunk.map((body) =>
        database
          .prepare(
            `INSERT OR IGNORE INTO learner_source_bodies
             (owner_id, source_id, fingerprint, byte_length, body_text, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            owner,
            body.sourceId,
            body.fingerprint,
            body.bytes,
            body.text,
            updatedAt,
          ),
      ),
    );
  }
  const existing = await loadStored(owner);
  const persistReviewLog = async (removedUndoId: string | null): Promise<void> => {
    const statements = decomposed.canonical.reviewEvents.map((event) =>
      database
        .prepare(
          `INSERT OR IGNORE INTO learner_review_events
           (owner_id, event_id, card_id, concept_id, rating, skill, reviewed_at, source_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          owner,
          event.id,
          event.cardId,
          event.conceptId,
          event.rating,
          event.nextCard.skill,
          event.reviewedAt,
          event.nextCard.sourceId,
        ),
    );
    if (removedUndoId !== null)
      statements.push(
        database
          .prepare(
            "DELETE FROM learner_review_events WHERE owner_id = ? AND event_id = ?",
          )
          .bind(owner, removedUndoId),
      );
    if (statements.length > 0) await database.batch(statements);
  };
  const removedUndoId = (() => {
    if (existing === null) return null;
    try {
      const previous = JSON.parse(existing.stateJson) as {
        lastUndo?: { id?: unknown } | null;
      };
      const id =
        previous.lastUndo !== null &&
        typeof previous.lastUndo?.id === "string"
          ? previous.lastUndo.id
          : null;
      return id !== null &&
        !decomposed.canonical.reviewEvents.some((event) => event.id === id)
        ? id
        : null;
    } catch {
      return null;
    }
  })();

  if (existing === null || existing.revision === 0) {
    if (baseRevision !== 0)
      return Response.json(
        {
          error: "State changed elsewhere.",
          code: "REVISION_CONFLICT",
          ...(await conflictPayload(owner, existing)),
          syncScope: actualSyncScope,
        },
        { status: 409 },
      );
    const inserted = await database
      .prepare(
        `INSERT INTO learner_states_v2 (owner_id, state_json, revision, updated_at)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(owner_id) DO NOTHING`,
      )
      .bind(owner, stateJson, updatedAt)
      .run();
    const saved = await loadStored(owner);
    if (
      inserted.meta.changes === 0 ||
      saved?.revision !== 1 ||
      saved.stateJson !== stateJson
    )
      return Response.json(
        {
          error: "State changed elsewhere.",
          code: "REVISION_CONFLICT",
          ...(await conflictPayload(owner, saved)),
          syncScope: actualSyncScope,
        },
        { status: 409 },
      );
    await persistReviewLog(removedUndoId);
    return Response.json({
      saved: true,
      localOnly: false,
      revision: 1,
      updatedAt,
    });
  }

  const updated = await database
    .prepare(
      `UPDATE learner_states_v2
       SET state_json = ?, revision = ?, updated_at = ?
       WHERE owner_id = ? AND revision = ?`,
    )
    .bind(stateJson, nextRevision, updatedAt, owner, baseRevision)
    .run();
  if (updated.meta.changes === 0) {
    const latest = await loadStored(owner);
    return Response.json(
      {
        error: "State changed in another tab. Bunki kept the newer copy.",
        code: "REVISION_CONFLICT",
        ...(await conflictPayload(owner, latest)),
        syncScope: actualSyncScope,
      },
      { status: 409 },
    );
  }
  await persistReviewLog(removedUndoId);
  return Response.json({
    saved: true,
    localOnly: false,
    revision: nextRevision,
    updatedAt,
  });
}

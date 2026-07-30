import { headers } from "next/headers";

import { bunkiDatabase } from "../../lib/database";
import {
  isSourceTextFingerprint,
  sourceTextFingerprint,
} from "../../lib/source-fingerprint";

export const runtime = "edge";

async function ownerId(): Promise<string | null> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("oai-authenticated-user-id") ??
    requestHeaders.get("oai-authenticated-user-email")
  );
}

const syncScope = (owner: string): string =>
  sourceTextFingerprint(`bunki-owner-scope:${owner}`);

const byteLength = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

async function ensureSourceBodyTable(): Promise<void> {
  const database = await bunkiDatabase();
  await database
    .prepare(
      `CREATE TABLE IF NOT EXISTS learner_source_bodies (
        owner_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        body_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, source_id, fingerprint)
      )`,
    )
    .run();
}

export async function GET(request: Request): Promise<Response> {
  const owner = await ownerId();
  if (owner === null)
    return Response.json(
      { error: "Sign in to retrieve an older source version." },
      { status: 401 },
    );
  const url = new URL(request.url);
  const sourceId = url.searchParams.get("sourceId")?.slice(0, 200) ?? "";
  const fingerprint =
    url.searchParams.get("fingerprint")?.slice(0, 160) ?? "";
  if (
    sourceId === "" ||
    (!isSourceTextFingerprint(fingerprint) &&
      !/^fnv1a:[a-z0-9]+:\d+$/u.test(fingerprint))
  )
    return Response.json(
      { error: "A valid source version is required." },
      { status: 400 },
    );
  const database = await bunkiDatabase();
  await ensureSourceBodyTable();
  const body = await database
    .prepare(
      `SELECT body_text AS text
       FROM learner_source_bodies
       WHERE owner_id = ? AND source_id = ? AND fingerprint = ?`,
    )
    .bind(owner, sourceId, fingerprint)
    .first<{ text: string }>();
  if (body === null)
    return Response.json(
      { error: "That exact source version is not stored." },
      { status: 404 },
    );
  return Response.json(
    { text: body.text, sourceId, fingerprint },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PUT(request: Request): Promise<Response> {
  const owner = await ownerId();
  if (owner === null)
    return Response.json(
      { error: "Sign in to sync source text.", code: "SIGN_IN_REQUIRED" },
      { status: 401 },
    );
  const raw = await request.text();
  if (byteLength(raw) > 2_100_000)
    return Response.json(
      { error: "That source is too large to sync.", code: "SOURCE_BODY_TOO_LARGE" },
      { status: 413 },
    );
  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ error: "Source body must be valid JSON." }, { status: 400 });
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return Response.json({ error: "A source body is required." }, { status: 400 });
  const row = payload as Record<string, unknown>;
  const sourceId = typeof row.sourceId === "string" ? row.sourceId.slice(0, 200) : "";
  const fingerprint =
    typeof row.fingerprint === "string" ? row.fingerprint.slice(0, 160) : "";
  const text = typeof row.text === "string" ? row.text : "";
  const expectedSyncScope =
    typeof row.expectedSyncScope === "string" ? row.expectedSyncScope : null;
  const actualSyncScope = syncScope(owner);
  if (expectedSyncScope !== actualSyncScope)
    return Response.json(
      {
        error: "The signed-in account changed before this source could be saved.",
        code: "SYNC_SCOPE_CHANGED",
        syncScope: actualSyncScope,
      },
      { status: 409 },
    );
  const bytes = byteLength(text);
  if (
    sourceId === "" ||
    text === "" ||
    text.length > 500_000 ||
    bytes > 2_000_000 ||
    !isSourceTextFingerprint(fingerprint) ||
    sourceTextFingerprint(text) !== fingerprint
  )
    return Response.json(
      {
        error: "The source text does not match its exact identity.",
        code: "INVALID_SOURCE_BODY",
      },
      { status: 400 },
    );
  await ensureSourceBodyTable();
  const database = await bunkiDatabase();
  await database
    .prepare(
      `INSERT OR IGNORE INTO learner_source_bodies
       (owner_id, source_id, fingerprint, byte_length, body_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      owner,
      sourceId,
      fingerprint,
      bytes,
      text,
      new Date().toISOString(),
    )
    .run();
  return Response.json({
    stored: true,
    sourceId,
    fingerprint,
    syncScope: actualSyncScope,
  });
}

import { headers } from "next/headers";

import { bunkiDatabase } from "../../lib/database";
import type { ReadingLength } from "../../lib/reading-catalog";
import type { Level } from "../../lib/phase2-types";

export const runtime = "edge";

const MODEL = "gpt-5.6-terra";
const DAILY_LIMIT = 20;
const LEVELS = new Set<Level>(["N5", "N4", "N3", "N2", "N1", "N1+"]);
const LENGTHS = new Set<ReadingLength>(["short", "medium", "full"]);

async function ownerId(): Promise<string | null> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("oai-authenticated-user-id") ??
    requestHeaders.get("oai-authenticated-user-email")
  );
}

async function openAiKey(): Promise<string | null> {
  const { env } = await import("cloudflare:workers");
  const value = (env as unknown as Record<string, unknown>).OPENAI_API_KEY;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

async function reserve(owner: string): Promise<boolean> {
  const database = await bunkiDatabase();
  await database
    .prepare(
      `CREATE TABLE IF NOT EXISTS reader_daily_usage (
        owner_id TEXT NOT NULL,
        usage_day TEXT NOT NULL,
        generations INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (owner_id, usage_day)
      )`,
    )
    .run();
  const result = await database
    .prepare(
      `INSERT INTO reader_daily_usage (owner_id, usage_day, generations)
       VALUES (?, ?, 1)
       ON CONFLICT(owner_id, usage_day)
       DO UPDATE SET generations = generations + 1
       WHERE generations < ?`,
    )
    .bind(owner, new Date().toISOString().slice(0, 10), DAILY_LIMIT)
    .run();
  return result.meta.changes > 0;
}

function outputText(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  const output = (value as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (item === null || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content)
      if (
        part !== null &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      )
        return (part as { text: string }).text;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const owner = await ownerId();
  if (owner === null)
    return Response.json(
      { error: "Sign in with ChatGPT to generate a personal article.", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  const key = await openAiKey();
  if (key === null)
    return Response.json(
      { error: "Live article generation is ready but its model connection is not configured.", code: "AI_NOT_CONNECTED" },
      { status: 503 },
    );
  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    return Response.json({ error: "Generation request must be valid JSON." }, { status: 400 });
  }
  if (body === null || typeof body !== "object")
    return Response.json({ error: "Generation request is malformed." }, { status: 400 });
  const candidate = body as Record<string, unknown>;
  const level =
    typeof candidate.level === "string" && LEVELS.has(candidate.level as Level)
      ? (candidate.level as Exclude<Level, "zero">)
      : null;
  const length =
    typeof candidate.length === "string" &&
    LENGTHS.has(candidate.length as ReadingLength)
      ? (candidate.length as ReadingLength)
      : null;
  const topic =
    typeof candidate.topic === "string" ? candidate.topic.trim().slice(0, 180) : "";
  if (level === null || length === null || topic.length < 2)
    return Response.json({ error: "Choose a level, length, and concrete topic." }, { status: 400 });
  if (!(await reserve(owner)))
    return Response.json({ error: "Today’s article-generation limit has been reached." }, { status: 429 });
  const targetCharacters =
    length === "short" ? "500–750" : length === "medium" ? "1500–2300" : "3500–5500";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: length === "full" ? 6_000 : 3_200,
      input: [
        {
          role: "system",
          content:
            "Write an original, factual Japanese immersion article for one learner. Match the requested JLPT reading edge without flattening the prose. Use natural paragraphs and coherent recurrence of a small vocabulary set. Do not imitate or quote a living author or copyrighted article. Return only the requested JSON schema.",
        },
        {
          role: "user",
          content: JSON.stringify({
            topic,
            level,
            targetJapaneseCharacters: targetCharacters,
            requirements: [
              "natural Japanese",
              "clear title",
              "no English inside the article",
              "complete standalone article",
              "mark uncertain factual claims conservatively",
            ],
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "bunki_reading_article",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "text", "summary"],
            properties: {
              title: { type: "string", minLength: 1, maxLength: 120 },
              text: { type: "string", minLength: 180, maxLength: 12_000 },
              summary: { type: "string", minLength: 1, maxLength: 280 },
            },
          },
        },
        verbosity: "medium",
      },
    }),
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null);
  if (response === null)
    return Response.json({ error: "The article generator timed out." }, { status: 504 });
  if (!response.ok)
    return Response.json({ error: "The article generator is temporarily unavailable." }, { status: 502 });
  const text = outputText((await response.json()) as unknown);
  if (text === null)
    return Response.json({ error: "The article generator returned no usable text." }, { status: 502 });
  let article: unknown;
  try {
    article = JSON.parse(text) as unknown;
  } catch {
    return Response.json({ error: "The generated article was malformed." }, { status: 502 });
  }
  if (
    article === null ||
    typeof article !== "object" ||
    typeof (article as { title?: unknown }).title !== "string" ||
    typeof (article as { text?: unknown }).text !== "string" ||
    typeof (article as { summary?: unknown }).summary !== "string"
  )
    return Response.json({ error: "The generated article failed validation." }, { status: 502 });
  return Response.json({
    ...(article as { title: string; text: string; summary: string }),
    model: MODEL,
    generatedAt: new Date().toISOString(),
  });
}


import { headers } from "next/headers";
import { getVideoDetails } from "youtube-caption-extractor";

export const runtime = "edge";

const MAX_TRANSCRIPT_CHARACTERS = 500_000;
const JAPANESE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const KANA_SCRIPT = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const LETTER = /\p{Letter}/gu;

export function hasCredibleJapaneseTranscript(text: string): boolean {
  const japanese = text.match(JAPANESE_SCRIPT)?.length ?? 0;
  const kana = text.match(KANA_SCRIPT)?.length ?? 0;
  const letters = text.match(LETTER)?.length ?? 0;
  return japanese >= 12 && kana >= 6 && japanese / Math.max(1, letters) >= 0.15;
}

function youtubeVideoId(value: string): string | null {
  const trimmed = value.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (
      url.hostname.endsWith("youtube.com") ||
      url.hostname.endsWith("youtube-nocookie.com")
    ) {
      const parameter = url.searchParams.get("v");
      if (parameter !== null) return parameter;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed") return parts[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

async function isAuthenticated(): Promise<boolean> {
  const requestHeaders = await headers();
  return Boolean(
    requestHeaders.get("oai-authenticated-user-id") ??
      requestHeaders.get("oai-authenticated-user-email"),
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAuthenticated())) {
    return Response.json(
      { error: "Automatic caption import is available in the signed-in Bunki site." },
      { status: 401 },
    );
  }

  let input: unknown;
  try {
    input = (await request.json()) as unknown;
  } catch {
    return Response.json({ error: "A YouTube URL is required." }, { status: 400 });
  }
  const value =
    input !== null &&
    typeof input === "object" &&
    "url" in input &&
    typeof (input as { url?: unknown }).url === "string"
      ? (input as { url: string }).url
      : "";
  const videoID = youtubeVideoId(value);
  if (videoID === null || !/^[\w-]{11}$/.test(videoID)) {
    return Response.json({ error: "That does not look like a YouTube video URL." }, { status: 400 });
  }

  try {
    const details = await getVideoDetails({ videoID, lang: "ja" });
    if (details.subtitles.length === 0) {
      return Response.json(
        { error: "This video did not expose a public caption track. Keep the URL and paste a transcript later." },
        { status: 422 },
      );
    }
    let transcript = "";
    const segments: Array<{
      startSeconds: number;
      durationSeconds: number;
      startCharacter: number;
      endCharacter: number;
    }> = [];
    for (const subtitle of details.subtitles) {
      const value = subtitle.text
        .replace(/\[(?:音楽|拍手|Music|Applause)\]/gi, "")
        .trim();
      if (value === "") continue;
      const previous = transcript.at(-1) ?? "";
      const first = value.at(0) ?? "";
      const joiner =
        transcript === ""
          ? ""
          : /[。！？!?]$/u.test(transcript)
            ? "\n"
            : /[A-Za-z0-9]$/u.test(previous) && /^[A-Za-z0-9]/u.test(first)
              ? " "
              : "";
      if (transcript.length + joiner.length + value.length > MAX_TRANSCRIPT_CHARACTERS)
        break;
      transcript += joiner;
      const startCharacter = transcript.length;
      transcript += value;
      segments.push({
        startSeconds: Math.max(0, Number(subtitle.start) || 0),
        durationSeconds: Math.max(0, Number(subtitle.dur) || 0),
        startCharacter,
        endCharacter: transcript.length,
      });
    }
    const text = transcript;
    if (!hasCredibleJapaneseTranscript(text)) {
      return Response.json(
        {
          error:
            "This video did not expose a credible Japanese caption track. Keep the URL and paste a Japanese transcript later.",
          code: "NO_JAPANESE_CAPTIONS",
        },
        { status: 422 },
      );
    }
    return Response.json({
      title: details.title,
      text,
      segmentCount: segments.length,
      segments,
      videoID,
    });
  } catch {
    return Response.json(
      { error: "YouTube did not make the captions available from this server. The saved URL is still safe; paste captions later." },
      { status: 502 },
    );
  }
}

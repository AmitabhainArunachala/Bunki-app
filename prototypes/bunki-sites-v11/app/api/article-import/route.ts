import {
  allowedArticleUrl,
  readableTextFromHtml,
} from "../../lib/reading-feeds";

export const runtime = "edge";

const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

export async function POST(request: Request): Promise<Response> {
  let decoded: unknown;
  try {
    decoded = (await request.json()) as unknown;
  } catch {
    return Response.json({ error: "Article request must be valid JSON." }, { status: 400 });
  }
  const value =
    decoded !== null &&
    typeof decoded === "object" &&
    "url" in decoded &&
    typeof (decoded as { url?: unknown }).url === "string"
      ? (decoded as { url: string }).url
      : "";
  const url = allowedArticleUrl(value);
  if (url === null)
    return Response.json(
      { error: "This source is not in Bunki’s reviewed article allowlist." },
      { status: 400 },
    );
  let finalUrl = url;
  let response: Response | null = null;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    response = await fetch(finalUrl, {
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Bunki-Living-Japanese/1.0",
      },
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null);
    if (response === null) break;
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (location === null) break;
    let redirected: URL | null = null;
    try {
      redirected = allowedArticleUrl(new URL(location, finalUrl).toString());
    } catch {
      redirected = null;
    }
    if (redirected === null)
      return Response.json(
        { error: "The article redirected outside Bunki’s reviewed sources." },
        { status: 502 },
      );
    finalUrl = redirected;
    response = null;
  }
  if (response === null)
    return Response.json({ error: "The source did not respond." }, { status: 504 });
  if (response.status >= 300 && response.status < 400)
    return Response.json(
      { error: "The article redirected too many times." },
      { status: 502 },
    );
  if (!response.ok)
    return Response.json({ error: "The article could not be fetched." }, { status: 502 });
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_HTML_BYTES)
    return Response.json({ error: "The article page is too large to import safely." }, { status: 413 });
  const html = await response.text();
  if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES)
    return Response.json({ error: "The article page is too large to import safely." }, { status: 413 });
  const article = readableTextFromHtml(html);
  if (article.text.length < 80)
    return Response.json(
      { error: "Bunki could not isolate enough Japanese article text from this page." },
      { status: 422 },
    );
  return Response.json(
    {
      title: article.title,
      text: article.text,
      url: finalUrl.toString(),
      importedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=1800",
        "Content-Security-Policy": "default-src 'none'",
      },
    },
  );
}

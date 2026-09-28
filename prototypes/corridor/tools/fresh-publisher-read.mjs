/**
 * Build-time full-text intake for the two publishers that already have a
 * reviewed full reader in @bunki/feed — Global Voices 日本語 (CC BY 3.0) and
 * the ALMA telescope site of 国立天文台 (CC BY 4.0).
 *
 * Nothing here is a second implementation. The script compiles the canonical
 * feed core exactly as the app build does (scripts/build-reading-module.mjs),
 * then drives it through the UNMODIFIED Mac host glue: createFeedService
 * (registry feed URL, DNS-pinned transport, parseFeedXml) and
 * createPublisherReader (article URL derivation, licence/credit/template checks,
 * link fallback). Only entries the reader admits as `full-reader` are emitted;
 * every link fallback is reported with its reason.
 *
 * Output: one JSON object per line on stdout (or --out FILE) — the reader's
 * own title, body text, canonical URL, publication/update instants, credits,
 * licence and complete attribution string, plus response/content hashes.
 * feed_fresh.py mints these through build_articles like every other source.
 *
 * Usage:
 *   node tools/fresh-publisher-read.mjs --source global-voices --since 2026-09-14 [--limit 8] [--out FILE]
 *   node tools/fresh-publisher-read.mjs --source alma-ja --since 2026-09-01
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildCorridorModules, FEED_MODULE_PATH } from '../../../scripts/build-reading-module.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const require = createRequire(import.meta.url);
const { createFeedService } = require('../../bunki-desktop/lib/feed-service.cjs');
const { createPublisherReader } = require('../../bunki-desktop/lib/publisher-reader.cjs');

const SOURCES = new Set(['global-voices', 'alma-ja']);
const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const sourceId = arg('--source');
const since = arg('--since');
const limit = Number(arg('--limit', '12'));
const out = arg('--out');
if (!SOURCES.has(sourceId) || !/^\d{4}-\d{2}-\d{2}$/.test(since ?? '') || !Number.isInteger(limit) || limit < 1 || limit > 40) {
  console.error('Usage: node fresh-publisher-read.mjs --source global-voices|alma-ja --since YYYY-MM-DD [--limit N] [--out FILE]');
  process.exit(2);
}

const feedModule = buildCorridorModules(REPO).find((module) => module.path === FEED_MODULE_PATH);
const core = await import(`data:text/javascript;base64,${feedModule.bytes.toString('base64')}`);

// The feed service keeps request timing in a profile directory; a throwaway
// profile per run keeps build intake out of any learner's app profile.
const profile = mkdtempSync(join(tmpdir(), 'bunki-fresh-feed-'));
const lines = [];
const report = { sourceId, since, feed: null, emitted: 0, fallbacks: [] };
try {
  const service = createFeedService({ core, profile });
  const view = await service.refresh(sourceId);
  report.feed = { status: view.status, error: view.error, entries: view.entries.length, latestPublishedAt: view.latestPublishedAt };
  const sinceMs = Date.parse(`${since}T00:00:00+09:00`);
  const wanted = view.entries
    .filter((entry) => Date.parse(entry.publishedAt) >= sinceMs)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
  const reader = createPublisherReader({ core, resolveEntry: service.resolveEntry });
  for (const entry of wanted) {
    const result = await reader.read({ sourceId, entryId: entry.id, revisionId: entry.revisionId });
    if (result.status !== 'full-reader' || !result.sourceDocument) {
      report.fallbacks.push({ url: entry.canonicalUrl, reason: result.reason });
      continue;
    }
    const article = result.candidate.article;
    const doc = result.sourceDocument;
    lines.push(JSON.stringify({
      sourceId,
      entryId: entry.id,
      title: article.title,
      text: article.body.text,
      url: doc.canonicalUrl,
      publishedAt: doc.publishedAt,
      updatedAt: doc.updatedAt,
      fetchedAt: doc.fetchedAt,
      authors: doc.authors.map((credit) => credit.name),
      translators: (doc.translators ?? []).map((credit) => credit.name),
      attribution: article.source.attribution,
      licence: doc.license,
      modification: doc.modification ?? null,
      responseSha256: doc.responseSha256,
      contentSha256: doc.contentSha256,
      readerVersion: doc.parserVersion,
    }));
    report.emitted += 1;
  }
  await reader.close();
  await service.close();
} finally {
  rmSync(profile, { recursive: true, force: true });
}
const body = lines.length ? `${lines.join('\n')}\n` : '';
if (out) writeFileSync(out, body);
else process.stdout.write(body);
console.error(JSON.stringify(report));

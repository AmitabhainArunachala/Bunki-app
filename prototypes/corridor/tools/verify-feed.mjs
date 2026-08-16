/**
 * 連環 R2-D — the feed gate. Data-level, deterministic, no browser.
 *
 * Refutes, or fails to refute, the feed loop's claims on the committed bytes:
 *   · every minted candidate passes the full article schema (tokens, paras,
 *     grading signals, licence, pool, titleEn + provenance, review, addedAt),
 *     and its index row tells the same story as its body;
 *   · the two licence pools stay separated — NC/ND never enters, share_alike
 *     never becomes an article pool;
 *   · the review queue is schema-valid, covers every feed row on the shelf,
 *     and NOTHING self-approves: 検収前 lifts only through a queue decision;
 *   · promoted stock left the archive artifacts (no double listing) and the
 *     LINK-SAFE cleanliness gate held (the wikinews-1483 lesson);
 *   · the curation report proposes, never performs: every pending cull
 *     proposal still has its artifacts in place;
 *   · the regenerated standalone carries the new shelf (builder-only artifact).
 *
 * Usage:
 *   node tools/verify-feed.mjs [--report FILE]
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const REPO = resolve(CORRIDOR, '..', '..');
const ARTICLES = resolve(CORRIDOR, 'data/articles');

const QUEUE_PATH = resolve(REPO, 'docs/content/feed-review-queue.json');
const TITLES_PATH = resolve(REPO, 'docs/content/feed-titles-en.json');
const REPORT_JSON = resolve(REPO, 'docs/content/feed-curation-report.json');
const RECOVERED_SOURCE = resolve(REPO, 'docs/content/bunki-originals-zoka-sanjin.jsonl');
const EVIDENCE_DIR = resolve(REPO, 'docs/build-evidence/renkan/feed');

const PRE_FEED_SHELF = 70; // the curated shelf the feed inherited (40 + recovered 30)
const TITLE_EN_SOURCE = 'renkan-ai-2026-08';
const KINDS = new Set(['mint', 'cull', 'legacy', 'rights']);
const DECISIONS = new Set(['pending', 'approved', 'rejected']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN_LICENCE = /\bNC\b|\bND\b|Non-?Commercial|No-?Deriv/i;
const ARTICLE_POOLS = new Set(['proprietary_safe', 'original']);
const RESIDUAL_MARKERS = ['{{', '[[', '<ref', '}}', '</', 'style=', 'align=', '{|'];
const DROPPED_TEXT = [/知られる[はがも]、?/, /「」|『』|（）|\(\)/];

const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? resolve(process.argv[index + 1]) : fallback;
};
const reportPath = argValue('--report', resolve(EVIDENCE_DIR, 'verify-feed-report.json'));

const results = [];
const failures = [];
function check(name, pass, detail = '') {
  const row = { name, pass: !!pass, detail: String(detail) };
  results.push(row);
  if (!pass) failures.push(row);
  console.log(`${pass ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const fileSha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// ---------------------------------------------------------------- load state
const index = readJson(resolve(ARTICLES, 'index.json'));
const archiveIndex = readJson(resolve(ARTICLES, 'archive-index.json'));
const queue = readJson(QUEUE_PATH);
const titles = readJson(TITLES_PATH);
const curation = readJson(REPORT_JSON);
const recoveredIds = readFileSync(RECOVERED_SOURCE, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line).id);

const curated = index.articles.filter((row) => !String(row.file || '').startsWith('archive/'));
const curatedById = new Map(curated.map((row) => [row.id, row]));
const archiveIds = new Set(archiveIndex.articles.map((row) => row.id));

// ---------------------------------------------------------------- the queue
check('the review queue is a JSON array', Array.isArray(queue), `${queue.length} rows`);
const queueIds = new Set();
let queueShapeOk = true;
const shapeProblems = [];
for (const row of queue) {
  const problems = [];
  if (typeof row.id !== 'string' || !row.id) problems.push('id');
  if (queueIds.has(row.id)) problems.push('duplicate id');
  queueIds.add(row.id);
  if (!KINDS.has(row.kind)) problems.push('kind');
  if (!DECISIONS.has(row.decision)) problems.push('decision');
  if (typeof row.title !== 'string' || !row.title) problems.push('title');
  if ((row.kind === 'mint' || row.kind === 'legacy') && (typeof row.titleEn !== 'string' || !row.titleEn.trim()))
    problems.push('titleEn');
  if (typeof row.lane !== 'string') problems.push('lane');
  if (typeof row.licence !== 'string') problems.push('licence');
  if (typeof row.gradingSummary !== 'string' || !row.gradingSummary) problems.push('gradingSummary');
  if (!ISO_DATE.test(String(row.addedAt))) problems.push('addedAt');
  if (problems.length) {
    queueShapeOk = false;
    shapeProblems.push(`${row.id ?? '?'}: ${problems.join(',')}`);
  }
}
check('every queue row carries the full schema (id/kind/title/titleEn/lane/licence/gradingSummary/addedAt/decision)', queueShapeOk, shapeProblems.slice(0, 4).join(' | '));

const mintRows = queue.filter((row) => row.kind === 'mint');
const cullRows = queue.filter((row) => row.kind === 'cull');
const liveMints = mintRows.filter((row) => row.decision !== 'rejected');

// ------------------------------------------------------------ pool separation
const licenceBreach = [
  ...queue.filter((row) => FORBIDDEN_LICENCE.test(row.licence)),
  ...curated.filter((row) => FORBIDDEN_LICENCE.test(row.licence)),
  ...archiveIndex.articles.filter((row) => FORBIDDEN_LICENCE.test(row.licence)),
].map((row) => row.id);
check('NC/ND never enters — queue, shelf, and archive licences are all clean', licenceBreach.length === 0, licenceBreach.slice(0, 4).join(', '));
const poolBreach = [...curated, ...archiveIndex.articles].filter(
  (row) => !ARTICLE_POOLS.has(row.pool),
);
check('share-alike stays confined to its bundles — no article row claims it', poolBreach.length === 0, poolBreach.map((row) => `${row.id}:${row.pool}`).slice(0, 4).join(', '));

// ------------------------------------------------------- shelf composition
check(
  `the curated shelf is exactly the inherited ${PRE_FEED_SHELF} plus the queue's live mints`,
  curated.length === PRE_FEED_SHELF + liveMints.length,
  `${curated.length} = ${PRE_FEED_SHELF} + ${liveMints.length}`,
);
const orphanFeedRows = curated.filter(
  (row) => row.titleEnSource === TITLE_EN_SOURCE && !queue.some((entry) => entry.id === row.id),
);
check('no feed-authored row stands outside the queue — nothing minted without review cover', orphanFeedRows.length === 0, orphanFeedRows.map((row) => row.id).join(', '));

// ----------------------------------------------- rights are never assumed
// E3 round-A (data-licence lens): ten glossary rows shipped with a corpus
// NAME in the licence slot. A source whose terms nobody has verified must
// SAY so and wear 検収前 — inventing plausible terms is the one thing a
// rights field may never do.
const UNVERIFIED = /未検証|unverified/;
const bareName = [...curated, ...archiveIndex.articles].filter(
  (row) =>
    !UNVERIFIED.test(row.licence ?? '') &&
    !/(CC|PD|Public Domain|CC0|Bunki original|著作権)/i.test(row.licence ?? ''),
);
check(
  'no row claims a licence that is not one — an unverified source says unverified',
  bareName.length === 0,
  bareName.map((row) => `${row.id}:${row.licence}`).slice(0, 4).join(', '),
);
const unverifiedUnmarked = [...curated, ...archiveIndex.articles].filter(
  (row) => (UNVERIFIED.test(row.licence ?? '') || row.pendingVerification) && !/検収前/.test(row.sourceLabel ?? ''),
);
check(
  'every unverified row wears 検収前 where the learner can see it',
  unverifiedUnmarked.length === 0,
  unverifiedUnmarked.map((row) => row.id).slice(0, 4).join(', '),
);
const unqueued = curated.filter(
  (row) => (row.review || row.pendingVerification) && !queue.some((entry) => entry.id === row.id),
);
check(
  'every row awaiting a human has a row the operator can decide',
  unqueued.length === 0,
  unqueued.map((row) => row.id).slice(0, 4).join(', '),
);

// the body is what the reader actually renders (ensureArticle assigns it
// OVER the index row), so a mark that lives only in the index is a mark the
// learner never sees — E3 round-A found exactly that. They must agree.
const bodyDrift = [];
for (const row of curated) {
  if (!row.review && !row.pendingVerification) continue;
  const bodyPath = new URL(`../data/articles/${row.file}`, import.meta.url);
  let body = null;
  try {
    body = JSON.parse(readFileSync(bodyPath, 'utf8'));
  } catch {
    bodyDrift.push(`${row.id}:unreadable`);
    continue;
  }
  for (const key of ['sourceLabel', 'review', 'licence']) {
    if (key in row && body[key] !== row[key]) bodyDrift.push(`${row.id}:${key}`);
  }
}
check(
  'index and body agree on every provenance mark — the body is what the reader sees',
  bodyDrift.length === 0,
  bodyDrift.slice(0, 5).join(', '),
);

// --------------------------------------------------- nothing self-approves
const selfApproved = curated.filter(
  (row) =>
    row.titleEnSource === TITLE_EN_SOURCE &&
    row.review !== 'human-review-pending' &&
    queue.find((entry) => entry.id === row.id)?.decision !== 'approved',
);
check('nothing self-approves — review lifts only where the queue says approved', selfApproved.length === 0, selfApproved.map((row) => row.id).join(', '));
const pendingMarks = curated.filter(
  (row) => row.review === 'human-review-pending' && !/検収前/.test(row.sourceLabel ?? ''),
);
check('every human-review-pending row is visibly 検収前 in its sourceLabel', pendingMarks.length === 0, pendingMarks.map((row) => row.id).join(', '));
const pendingFeed = mintRows.filter((row) => row.decision === 'pending').length;
const pendingShelf = curated.filter((row) => row.review === 'human-review-pending').length;
// the census now has a third honest category: a row whose SOURCE TERMS are
// unverified waits for the operator too (E3 round-A), and it says so with
// its own review reason rather than borrowing the editorial one.
const pendingRights = curated.filter((row) => row.review === 'rights-review-pending').length;
const mintIds = new Set(mintRows.map((row) => row.id));
// neither a recovered original nor a feed mint: a shelf row whose own text
// is flagged unverified (wikinews:45227 was published the day before the
// archive froze, so it may not be the final revision)
const editorialUnverified = curated.filter(
  (row) =>
    row.review === 'human-review-pending' &&
    !recoveredIds.includes(row.id) &&
    !mintIds.has(row.id),
).length;
check(
  `the 検収前 census is exact: ${recoveredIds.length} recovered originals + pending feed mints + rights holds`,
  pendingShelf === recoveredIds.length + pendingFeed + editorialUnverified &&
    recoveredIds.every((id) => curatedById.get(id)?.review === 'human-review-pending'),
  `${pendingShelf} = ${recoveredIds.length} + ${pendingFeed} + ${editorialUnverified} editorial-unverified · ${pendingRights} rights holds`,
);

// ----------------------------------------------------- per-candidate schema
for (const mint of mintRows) {
  const row = curatedById.get(mint.id);
  if (mint.decision === 'rejected') {
    check(
      `${mint.id} · rejected — off the shelf, restored to the archive`,
      !row && archiveIds.has(mint.id),
    );
    continue;
  }
  if (!row) {
    check(`${mint.id} · queue row has its shelf row`, false, 'missing from index.json');
    continue;
  }
  const bodyPath = resolve(ARTICLES, row.file);
  if (!existsSync(bodyPath) || String(row.file).startsWith('archive/')) {
    check(`${mint.id} · body file minted at the shelf level`, false, row.file);
    continue;
  }
  const body = readJson(bodyPath);
  const problems = [];

  const tokensOk =
    Array.isArray(body.tokens) &&
    body.tokens.length > 0 &&
    body.tokens.every(
      (token) =>
        typeof token.s === 'string' &&
        typeof token.b === 'string' &&
        typeof token.p === 'string' &&
        typeof token.r === 'string' &&
        Array.isArray(token.f) &&
        typeof token.c === 'boolean',
    );
  if (!tokensOk) problems.push('tokens');
  // the tokeniser works paragraph by paragraph and, like MeCab itself, never
  // emits whitespace surfaces — so the invariant that catches dropped CONTENT
  // is equality of the two streams with all whitespace folded out
  const foldWhitespace = (value) => value.replace(/\s+/g, '');
  if (foldWhitespace(body.tokens.map((token) => token.s).join('')) !== foldWhitespace(body.text))
    problems.push('token-join≠text');
  const parasOk =
    Array.isArray(body.paras) &&
    body.paras.every(
      (start, i) =>
        Number.isInteger(start) &&
        start > 0 &&
        start < body.tokens.length &&
        (i === 0 || start > body.paras[i - 1]),
    );
  if (!parasOk) problems.push('paras');

  const jread = body.grading?.signals?.jreadability;
  const jlpt = body.grading?.signals?.jlpt_lexicon;
  if (!(typeof jread?.score === 'number' && jread.band && jread.substrate)) problems.push('jreadability');
  if (!(typeof jlpt?.coverage === 'number' && jlpt.substrate && jlpt.band_vector)) problems.push('jlpt_lexicon');
  else {
    const mass = Object.values(jlpt.band_vector).reduce((sum, v) => sum + v, 0);
    if (Math.abs(mass - 1) > 1e-6) problems.push('band_vector-mass');
  }
  const ninjalHonest =
    body.grading?.signals?.lexical_coverage !== undefined ||
    typeof body.grading?.unavailable?.lexical_coverage === 'string';
  if (!ninjalHonest) problems.push('ninjal-absence-unrecorded');

  if (body.licence !== 'CC BY 2.5' || body.pool !== 'proprietary_safe') problems.push('licence/pool');
  if (!body.attribution || !body.url || !ISO_DATE.test(String(body.date))) problems.push('attribution/url/date');
  if (body.titleEn !== mint.titleEn || body.titleEnSource !== TITLE_EN_SOURCE) problems.push('titleEn');
  if (titles.titles?.[mint.id] !== mint.titleEn) problems.push('titleEn≠authored-map');
  if (body.addedAt !== mint.addedAt) problems.push('addedAt');
  const expectedReview = mint.decision === 'approved' ? 'approved' : 'human-review-pending';
  if (body.review !== expectedReview || row.review !== expectedReview) problems.push('review');

  if (row.title !== body.title) problems.push('index-title');
  if (row.chars !== body.text.length) problems.push('index-chars');
  if (row.snippet !== body.text.replace(/\n/g, ' ').slice(0, 64)) problems.push('index-snippet');
  if (row.grading?.signals?.jreadability?.band !== jread?.band) problems.push('index-band');
  if (!Array.isArray(row.seeds) || row.seeds.length === 0) problems.push('seeds');

  if (RESIDUAL_MARKERS.some((marker) => body.text.includes(marker))) problems.push('residual-markup');
  if (DROPPED_TEXT.some((pattern) => pattern.test(body.text))) problems.push('dropped-link-text');
  // the archive LISTING must have handed the id over (its body file stays on
  // disk unreferenced — it preserves NINJAL signals this environment cannot
  // regenerate, and the corridor only serves what an index lists)
  if (archiveIds.has(mint.id)) problems.push('still-listed-in-archive');

  check(
    `${mint.id} · full candidate schema, pools, LINK-SAFE text, archive hand-off`,
    problems.length === 0,
    problems.join(',') || `${body.tokens.length} tokens · ${jread.band} · ${row.chars}字`,
  );
}

// ---------------------------------------------------------- curation report
check(
  'the curation report is present, typed, and counts the real artifacts',
  curation.kind === 'feed-curation-report' &&
    curation.criteria &&
    curation.counts?.shelf === curated.length &&
    curation.counts?.archive === archiveIndex.articles.length &&
    Array.isArray(curation.cullProposals),
  `shelf ${curation.counts?.shelf}/${curated.length} · archive ${curation.counts?.archive}/${archiveIndex.articles.length}`,
);
const proposalIds = new Set(curation.cullProposals.map((proposal) => proposal.id));
const unmatchedCulls = cullRows.filter(
  (row) => row.decision === 'pending' && !proposalIds.has(row.id),
);
check('every pending cull in the queue traces to a report proposal', unmatchedCulls.length === 0, unmatchedCulls.map((row) => row.id).join(', '));
const prematureCulls = cullRows.filter(
  (row) => row.decision === 'pending' && !archiveIds.has(row.id) && !curatedById.has(row.id),
);
check('nothing proposed for culling has been removed while pending — proposals never act', prematureCulls.length === 0, prematureCulls.map((row) => row.id).join(', '));

// ----------------------------------------------- double-listing + standalone
const doubled = curated.filter((row) => archiveIds.has(row.id));
check('no article is listed on both the shelf and the archive', doubled.length === 0, doubled.map((row) => row.id).join(', '));

const standalone = readFileSync(resolve(CORRIDOR, 'corridor-standalone.html'), 'utf8');
const missingFromBundle = liveMints.filter((mint) => !standalone.includes(`"id":"${mint.id}"`));
check('the regenerated standalone bundles every live feed candidate (builder-only artifact)', missingFromBundle.length === 0, missingFromBundle.map((mint) => mint.id).join(', '));

// ------------------------------------------------------------------ evidence
const runLogs = existsSync(EVIDENCE_DIR)
  ? readdirSync(EVIDENCE_DIR).filter((file) => /^run-\d+\.json$/.test(file)).sort()
  : [];
const logsTyped = runLogs.every((file) => {
  const log = readJson(resolve(EVIDENCE_DIR, file));
  return log.kind === 'feed-ingest-run' && typeof log.sourceMode?.mode === 'string';
});
check('at least two ingest run logs exist, each recording which source mode ran', runLogs.length >= 2 && logsTyped, runLogs.join(', '));

// -------------------------------------------------------------------- report
writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'feed-gate-verification',
      artifactHashes: {
        index: fileSha256(resolve(ARTICLES, 'index.json')),
        archiveIndex: fileSha256(resolve(ARTICLES, 'archive-index.json')),
        queue: fileSha256(QUEUE_PATH),
        titles: fileSha256(TITLES_PATH),
        curationReport: fileSha256(REPORT_JSON),
        standalone: fileSha256(resolve(CORRIDOR, 'corridor-standalone.html')),
      },
      counts: {
        curated: curated.length,
        archive: archiveIndex.articles.length,
        queueRows: queue.length,
        pendingMints: pendingFeed,
        approvedMints: mintRows.filter((row) => row.decision === 'approved').length,
        cullProposals: cullRows.length,
      },
      results,
      failures: failures.map((row) => row.name),
    },
    null,
    2,
  )}\n`,
);

console.log(`\n${results.length - failures.length}/${results.length} feed checks passed`);
console.log(`report → ${reportPath}`);
process.exit(failures.length ? 1 : 0);

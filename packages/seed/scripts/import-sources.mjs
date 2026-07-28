/**
 * Import real licensed dictionary data from primary sources (WP-04 follow-on).
 *
 * This script is the deliverable; the JSON it writes is only its output. It is a
 * re-runnable pipeline — fetch → verify licence → parse → subset → emit — and it
 * behaves identically whether asked for 500 records or 200,000. Anyone with
 * network access can reproduce or widen the shipped data with one command.
 *
 *   node packages/seed/scripts/import-sources.mjs --licences
 *       Stage 1 only: fetch every licence text verbatim from the licensor's own
 *       host and record its digest. Run this before trusting any import.
 *
 *   node packages/seed/scripts/import-sources.mjs --lexemes=3000
 *       Full pipeline at the given subset size. --lexemes=all imports every
 *       priority-tagged entry; there is no other switch to change.
 *
 *   node packages/seed/scripts/import-sources.mjs --check
 *       Offline. Re-derives digests of the committed output and compares them to
 *       data/dictionary/manifest.json. Never writes.
 *
 * Flags: --lexemes=N|all  --sentences=N  --strokes=N|all|none  --concurrency=N
 *        --cache=DIR  --offline  --licences  --check
 *
 * ── The licence gate ────────────────────────────────────────────────────────
 * `assertLicensed()` runs before a source's bytes are parsed, not after. A source
 * whose verbatim licence text is not on disk at the recorded digest does not ship:
 * it is skipped and written into the manifest's `deferred` list with the reason.
 * This is the one rule in this file that must never be softened — it is what stops
 * a future run from shipping data whose licence was written from memory.
 *
 * ── Why the raw downloads are not committed ─────────────────────────────────
 * JMdict_e.gz, kanjidic2.xml.gz and the Tatoeba exports total ~200 MB. They live
 * in `--cache` (default `packages/seed/.cache/`, gitignored). What is committed is
 * the emitted subset plus the manifest that says exactly which upstream bytes it
 * came from, so the chain from a shipped gloss back to a sha256'd download is
 * checkable without carrying the downloads in git.
 *
 * Not wired into `npm run test`: controller §17.5 must pass with no network. The
 * committed output is asserted offline by test/dictionary.test.ts.
 */

/*
 * ESLint's Node-globals block in `eslint.config.mjs` is scoped to the repository
 * root's `scripts/` directory and does not reach a script inside a package — the
 * same constraint fetch-kanjivg.mjs documents. Globals are declared locally
 * rather than widening that glob across a work-package boundary.
 */
/* global fetch, console, process, Buffer, URL, AbortController, setTimeout */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');
const LICENCE_DIR = join(PACKAGE_ROOT, 'licenses');
const LICENCE_MANIFEST = join(PACKAGE_ROOT, 'data', 'licences.json');
const OUT_DIR = join(PACKAGE_ROOT, 'data', 'dictionary');
const OUT_MANIFEST = join(OUT_DIR, 'manifest.json');
const STROKE_DIR = join(OUT_DIR, 'strokes');

/** Pinned KanjiVG revision — the same commit fetch-kanjivg.mjs pins for the §8 seed. */
export const KANJIVG_COMMIT = '61e39cfc29724132a6f8823b166296932985a0ff';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Every licence text this package ships, and where it was taken from.
 *
 * `url` is always the licensor's own host. The previous round had to take the
 * EDRDG statement from a redistributor (jamdict_data) because edrdg.org was
 * refused by egress policy; that copy said CC BY-SA 3.0, and the authoritative
 * statement fetched here says V4.0. Licence version is not a detail to inherit
 * from whoever happened to be reachable.
 */
export const LICENCE_TEXTS = {
  'licenses/EDRDG-licence-statement.html': {
    url: 'https://www.edrdg.org/edrdg/licence.html',
    describes: 'The EDRDG general dictionary licence statement, as served by the licensor.',
  },
  'licenses/CC-BY-SA-4.0.html': {
    url: 'https://creativecommons.org/licenses/by-sa/4.0/legalcode',
    describes: 'CC BY-SA 4.0 legal code, referenced by §3 of the EDRDG statement.',
  },
  'licenses/CC-BY-2.0-FR.html': {
    url: 'https://creativecommons.org/licenses/by/2.0/fr/legalcode',
    describes: 'CC BY 2.0 FR legal code — the licence Tatoeba sentence text is offered under.',
  },
};

/**
 * The sources this pipeline can import, each bound to the licence texts that must
 * be on disk before its bytes are parsed.
 */
export const SOURCES = {
  'edrdg-jmdict': {
    displayName: 'JMdict (EDRDG)',
    licence: 'CC BY-SA 4.0',
    licenceFiles: ['licenses/EDRDG-licence-statement.html', 'licenses/CC-BY-SA-4.0.html'],
    download: { url: 'https://www.edrdg.org/pub/Nihongo/JMdict_e.gz', cacheAs: 'JMdict_e.gz' },
    projectUrl: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
  },
  'edrdg-kanjidic2': {
    displayName: 'KANJIDIC2 (EDRDG)',
    licence: 'CC BY-SA 4.0',
    licenceFiles: ['licenses/EDRDG-licence-statement.html', 'licenses/CC-BY-SA-4.0.html'],
    download: {
      url: 'https://www.edrdg.org/pub/Nihongo/kanjidic2.xml.gz',
      cacheAs: 'kanjidic2.xml.gz',
    },
    projectUrl: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
  },
  'tatoeba-jpn': {
    displayName: 'Tatoeba',
    licence: 'CC BY 2.0 FR',
    licenceFiles: ['licenses/CC-BY-2.0-FR.html'],
    download: {
      url: 'https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences_detailed.tsv.bz2',
      cacheAs: 'jpn_sentences_detailed.tsv.bz2',
    },
    projectUrl: 'https://tatoeba.org',
  },
  'tatoeba-eng': {
    displayName: 'Tatoeba',
    licence: 'CC BY 2.0 FR',
    licenceFiles: ['licenses/CC-BY-2.0-FR.html'],
    download: {
      url: 'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2',
      cacheAs: 'eng_sentences_detailed.tsv.bz2',
    },
    projectUrl: 'https://tatoeba.org',
  },
  'tatoeba-links': {
    displayName: 'Tatoeba',
    licence: 'CC BY 2.0 FR',
    licenceFiles: ['licenses/CC-BY-2.0-FR.html'],
    download: { url: 'https://downloads.tatoeba.org/exports/links.tar.bz2', cacheAs: 'links.tar.bz2' },
    projectUrl: 'https://tatoeba.org',
  },
  kanjivg: {
    displayName: 'KanjiVG',
    licence: 'CC BY-SA 3.0',
    licenceFiles: ['licenses/KanjiVG-COPYING.txt', 'licenses/CC-BY-SA-3.0.txt'],
    download: null, // fetched per-file at a pinned commit
    projectUrl: 'https://kanjivg.tagaini.net',
  },
};

// ── argument parsing ────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const get = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit === undefined ? fallback : hit.slice(name.length + 3);
  };
  const count = (name, fallback) => {
    const raw = get(name, fallback);
    if (raw === 'all') return Number.POSITIVE_INFINITY;
    if (raw === 'none') return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a count, 'all' or 'none'`);
    return n;
  };
  return {
    lexemes: count('lexemes', '3000'),
    sentences: count('sentences', '2000'),
    strokes: count('strokes', 'all'),
    concurrency: Number(get('concurrency', '12')),
    cache: get('cache', join(PACKAGE_ROOT, '.cache')),
    offline: argv.includes('--offline'),
    licencesOnly: argv.includes('--licences'),
    check: argv.includes('--check'),
  };
}

// ── stage 0: download with cache + digest ───────────────────────────────────

async function download(url, cacheAs, { cache, offline }) {
  await mkdir(cache, { recursive: true });
  const path = join(cache, cacheAs);
  let body;
  let cached = false;
  try {
    body = await readFile(path);
    cached = true;
  } catch {
    body = null;
  }
  if (body === null) {
    if (offline) throw new Error(`--offline but ${cacheAs} is not in the cache`);
    process.stdout.write(`  fetching ${url}\n`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    body = Buffer.from(await response.arrayBuffer());
    await writeFile(path, body);
  }
  return {
    url,
    file: cacheAs,
    bytes: body.length,
    sha256: sha256(body),
    retrievedAt: today(),
    fromCache: cached,
    path,
    body,
  };
}

// ── stage 1: licences, before any data ──────────────────────────────────────

/**
 * Fetch every licence text verbatim from the licensor's own host and record its
 * digest in data/licences.json. Bytes are stored exactly as served — no HTML
 * stripping, no reflow — so the committed file is an exact copy of what the
 * licensor published, and .prettierignore keeps a formatter from rewriting it.
 */
export async function fetchLicences({ offline }) {
  if (offline) throw new Error('--licences needs the network; refusing to guess licence text');
  await mkdir(LICENCE_DIR, { recursive: true });
  const manifest = JSON.parse(await readFile(LICENCE_MANIFEST, 'utf8'));
  for (const [relPath, spec] of Object.entries(LICENCE_TEXTS)) {
    const response = await fetch(spec.url);
    if (!response.ok) {
      // Licence first, data second: an unobtainable licence is a deferral, never
      // a reason to ship the data anyway.
      throw new Error(`${spec.url} -> HTTP ${response.status}; refusing to ship its data`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    await writeFile(join(PACKAGE_ROOT, relPath), body);
    manifest.files[relPath] = {
      bytes: body.length,
      sha256: sha256(body),
      retrievedFrom: spec.url,
      retrievedAt: today(),
    };
    console.log(`  licence ${relPath} bytes=${body.length} sha256=${sha256(body)}`);
  }
  await writeFile(LICENCE_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

/**
 * The gate. Throws unless every licence text the source depends on is present at
 * the digest recorded in data/licences.json.
 */
export async function assertLicensed(sourceKey) {
  const source = SOURCES[sourceKey];
  if (!source) throw new Error(`unknown source ${sourceKey}`);
  const manifest = JSON.parse(await readFile(LICENCE_MANIFEST, 'utf8'));
  for (const relPath of source.licenceFiles) {
    const recorded = manifest.files[relPath];
    if (!recorded) throw new Error(`${sourceKey}: ${relPath} is not recorded in licences.json`);
    let body;
    try {
      body = await readFile(join(PACKAGE_ROOT, relPath));
    } catch {
      throw new Error(`${sourceKey}: licence text ${relPath} is missing from disk`);
    }
    if (sha256(body) !== recorded.sha256) {
      throw new Error(`${sourceKey}: ${relPath} does not match its recorded digest`);
    }
  }
  return true;
}

// ── stage 2: parsers ────────────────────────────────────────────────────────

const between = (xml, tag, from = 0) => {
  const open = xml.indexOf(`<${tag}>`, from);
  if (open === -1) return null;
  const close = xml.indexOf(`</${tag}>`, open);
  if (close === -1) return null;
  return { text: xml.slice(open + tag.length + 2, close), end: close + tag.length + 3 };
};

const allBetween = (xml, tag) => {
  const out = [];
  let cursor = 0;
  for (;;) {
    const hit = between(xml, tag, cursor);
    if (!hit) return out;
    out.push(hit.text);
    cursor = hit.end;
  }
};

const decodeXml = (text) =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');

/**
 * JMdict ships its part-of-speech vocabulary as XML entities (`<pos>&n;</pos>`)
 * declared in the internal DTD. Parsing without expanding them would emit `&n;`
 * as if it were a gloss, so the DTD's own declarations are read and used — the
 * labels are upstream's wording, not this project's paraphrase.
 */
export function parseEntities(xml) {
  const map = new Map();
  const dtdEnd = xml.indexOf(']>');
  const dtd = xml.slice(0, dtdEnd === -1 ? 0 : dtdEnd);
  for (const match of dtd.matchAll(/<!ENTITY\s+([\w-]+)\s+"([^"]*)">/g)) {
    map.set(match[1], match[2]);
  }
  return map;
}

/**
 * JMdict priority tags, turned into one sortable score.
 *
 * `nfXX` bands entries by corpus frequency (nf01 = the 500 most common), so it is
 * the primary key; ichi1/news1/spec1 mark separately-attested common words and
 * break ties. Entries carrying no priority tag at all are not ranked — importing
 * by document order would be arbitrary, which is exactly what "genuinely useful"
 * rules out.
 */
export function priorityScore(tags) {
  if (tags.length === 0) return null;
  let band = 99;
  let boost = 0;
  for (const tag of tags) {
    const nf = /^nf(\d+)$/.exec(tag);
    if (nf) band = Math.min(band, Number(nf[1]));
    if (tag === 'ichi1' || tag === 'news1' || tag === 'spec1') boost += 1;
    if (tag === 'gai1') boost += 0.5;
  }
  return band * 10 - boost;
}

export function parseJMdict(xml) {
  const entities = parseEntities(xml);
  const expand = (raw) => {
    const name = /^&(.+);$/.exec(raw.trim());
    if (!name) return decodeXml(raw.trim());
    return entities.get(name[1]) ?? name[1];
  };
  const entries = [];
  let cursor = 0;
  for (;;) {
    const entry = between(xml, 'entry', cursor);
    if (!entry) break;
    cursor = entry.end;
    const body = entry.text;
    const entSeq = between(body, 'ent_seq')?.text?.trim();
    if (!entSeq) continue;

    const kEles = allBetween(body, 'k_ele');
    const rEles = allBetween(body, 'r_ele');
    const headword = kEles.length > 0 ? between(kEles[0], 'keb')?.text : undefined;
    const reading = rEles.length > 0 ? between(rEles[0], 'reb')?.text : undefined;
    if (!reading) continue;

    // A tag usually appears on both the kanji and the reading element; the pair
    // carries no more information than one, so the set is deduped before it is
    // scored or shipped.
    const tags = [
      ...new Set(
        [
          ...(kEles[0] ? allBetween(kEles[0], 'ke_pri') : []),
          ...(rEles[0] ? allBetween(rEles[0], 're_pri') : []),
        ].map((t) => t.trim()),
      ),
    ];

    const senses = [];
    const pos = [];
    for (const sense of allBetween(body, 'sense')) {
      for (const p of allBetween(sense, 'pos')) {
        const label = expand(p);
        if (!pos.includes(label)) pos.push(label);
      }
      for (const gloss of allBetween(sense, 'gloss')) {
        // Non-English glosses carry xml:lang; JMdict_e is English-only, but the
        // guard keeps this correct if pointed at the multilingual JMdict.
        if (gloss.includes('xml:lang')) continue;
        senses.push(decodeXml(gloss));
      }
    }
    if (senses.length === 0) continue;

    entries.push({
      entSeq,
      headword: headword ? decodeXml(headword) : decodeXml(reading),
      reading: decodeXml(reading),
      hasKanji: Boolean(headword),
      partOfSpeech: pos,
      senses,
      priorityTags: tags,
      score: priorityScore(tags),
    });
  }
  return entries;
}

export function parseKanjidic2(xml) {
  const out = new Map();
  let cursor = 0;
  for (;;) {
    const character = between(xml, 'character', cursor);
    if (!character) break;
    cursor = character.end;
    const body = character.text;
    const literal = between(body, 'literal')?.text?.trim();
    if (!literal) continue;

    const readings = { on: [], kun: [] };
    for (const reading of body.matchAll(/<reading r_type="ja_(on|kun)"[^>]*>([^<]*)<\/reading>/g)) {
      readings[reading[1]].push(decodeXml(reading[2]));
    }
    // <meaning> without m_lang is English; with m_lang it is another language.
    const meanings = [...body.matchAll(/<meaning>([^<]*)<\/meaning>/g)].map((m) => decodeXml(m[1]));

    const num = (tag) => {
      const hit = between(body, tag)?.text?.trim();
      return hit === undefined ? null : Number(hit);
    };
    out.set(literal, {
      literal,
      strokeCount: num('stroke_count'),
      grade: num('grade'),
      frequency: num('freq'),
      jlpt: num('jlpt'),
      onReadings: readings.on,
      kunReadings: readings.kun,
      meanings,
    });
  }
  return out;
}

/** Stream a bzip2'd file through the system bunzip2, yielding lines. */
async function* bunzipLines(path, { tar = false } = {}) {
  const child = tar
    ? spawn('tar', ['-xjOf', path])
    : spawn('bunzip2', ['-c', path], { stdio: ['ignore', 'pipe', 'inherit'] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
  try {
    for await (const line of rl) yield line;
  } finally {
    child.kill();
  }
}

/** Tatoeba `*_sentences_detailed.tsv`: id, lang, text, username, added, modified. */
export async function parseTatoebaSentences(path, keep) {
  const out = new Map();
  for await (const line of bunzipLines(path)) {
    const parts = line.split('\t');
    if (parts.length < 4) continue;
    const id = parts[0];
    if (keep && !keep.has(id)) continue;
    out.set(id, { id, lang: parts[1], text: parts[2], username: parts[3] || null });
  }
  return out;
}

// ── stage 3: subset ─────────────────────────────────────────────────────────

/**
 * Rank by JMdict priority, keep entries written with kanji (a seed of kana-only
 * words would give the kanji layer nothing to point at), and cut at `limit`.
 */
export function selectLexemes(entries, limit) {
  return entries
    .filter((entry) => entry.score !== null && entry.hasKanji)
    .sort((a, b) => a.score - b.score || Number(a.entSeq) - Number(b.entSeq))
    .slice(0, limit === Number.POSITIVE_INFINITY ? undefined : limit);
}

const KANJI_RE = /[一-鿿]/u;
export const kanjiIn = (text) => [...new Set([...text].filter((c) => KANJI_RE.test(c)))];

// ── stage 4: emit ───────────────────────────────────────────────────────────

const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return sha256(await readFile(path));
};

async function fetchStrokes(characters, { concurrency, cache, offline }) {
  const wanted = [...characters];
  const written = [];
  let index = 0;
  const worker = async () => {
    for (;;) {
      const mine = index++;
      if (mine >= wanted.length) return;
      const character = wanted[mine];
      const hex = character.codePointAt(0).toString(16).padStart(5, '0');
      const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/${KANJIVG_COMMIT}/kanji/${hex}.svg`;
      try {
        const got = await download(url, join('kanjivg', `${hex}.svg`), { cache, offline });
        await mkdir(STROKE_DIR, { recursive: true });
        await writeFile(join(STROKE_DIR, `${hex}.svg`), got.body);
        written.push({
          character,
          file: `dictionary/strokes/${hex}.svg`,
          upstreamPath: `kanji/${hex}.svg`,
          url,
          bytes: got.bytes,
          sha256: got.sha256,
        });
      } catch {
        // KanjiVG does not cover every KANJIDIC2 literal. A missing file is
        // recorded by absence, never by a fabricated entry.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  written.sort((a, b) => a.file.localeCompare(b.file));
  return written;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.check) {
    const manifest = JSON.parse(await readFile(OUT_MANIFEST, 'utf8'));
    let bad = 0;
    for (const [relPath, recorded] of Object.entries(manifest.outputs)) {
      const body = await readFile(join(PACKAGE_ROOT, 'data', relPath)).catch(() => null);
      const ok = body !== null && sha256(body) === recorded.sha256 && body.length === recorded.bytes;
      if (!ok) bad += 1;
      console.log(`${ok ? 'MATCH ' : 'DIFFER'} ${relPath}`);
    }
    for (const key of Object.keys(manifest.sources)) await assertLicensed(key);
    console.log(`licence gate: every shipped source has verbatim licence text at its digest`);
    if (bad > 0) process.exitCode = 1;
    return;
  }

  console.log('stage 1: licences (fetched before any data is parsed)');
  if (!options.offline) await fetchLicences(options);

  const deferred = [];
  const usable = {};
  for (const key of Object.keys(SOURCES)) {
    try {
      await assertLicensed(key);
      usable[key] = SOURCES[key];
    } catch (error) {
      deferred.push({ source: key, reason: String(error.message) });
      console.log(`  DEFERRED ${key}: ${error.message}`);
    }
  }
  if (options.licencesOnly) return;

  console.log('stage 2: download + parse');
  const downloads = {};
  const need = (key) => {
    if (!usable[key]) throw new Error(`${key} is deferred: no verbatim licence on file`);
    return usable[key];
  };

  const jmdictGot = await download(
    need('edrdg-jmdict').download.url,
    SOURCES['edrdg-jmdict'].download.cacheAs,
    options,
  );
  downloads['edrdg-jmdict'] = jmdictGot;
  const jmdictEntries = parseJMdict(gunzipSync(jmdictGot.body).toString('utf8'));
  console.log(`  JMdict: ${jmdictEntries.length} entries parsed`);

  const kd2Got = await download(
    need('edrdg-kanjidic2').download.url,
    SOURCES['edrdg-kanjidic2'].download.cacheAs,
    options,
  );
  downloads['edrdg-kanjidic2'] = kd2Got;
  const kanjidic = parseKanjidic2(gunzipSync(kd2Got.body).toString('utf8'));
  console.log(`  KANJIDIC2: ${kanjidic.size} characters parsed`);

  console.log('stage 3: subset');
  const chosen = selectLexemes(jmdictEntries, options.lexemes);
  const neededKanji = new Set();
  for (const entry of chosen) for (const c of kanjiIn(entry.headword)) neededKanji.add(c);
  const shippedKanji = [...neededKanji].filter((c) => kanjidic.has(c)).sort();
  console.log(`  ${chosen.length} lexemes, ${shippedKanji.length} kanji they need`);

  // Sentences: only those whose Japanese contains a shipped headword, so every
  // sentence is attached to something the dictionary can explain.
  let sentences = [];
  if (options.sentences > 0 && usable['tatoeba-jpn'] && usable['tatoeba-links']) {
    const jpnGot = await download(
      SOURCES['tatoeba-jpn'].download.url,
      SOURCES['tatoeba-jpn'].download.cacheAs,
      options,
    );
    downloads['tatoeba-jpn'] = jpnGot;
    const jpn = await parseTatoebaSentences(jpnGot.path, null);
    console.log(`  Tatoeba jpn: ${jpn.size} sentences`);

    const headwords = new Map(chosen.map((e) => [e.headword, e.entSeq]));
    const candidates = new Map();
    for (const sentence of jpn.values()) {
      if (sentence.text.length > 60) continue;
      const hit = [...headwords.keys()].find((h) => h.length > 1 && sentence.text.includes(h));
      if (hit) candidates.set(sentence.id, { sentence, headword: hit });
    }
    console.log(`  ${candidates.size} candidate sentences contain a shipped headword`);

    const linksGot = await download(
      SOURCES['tatoeba-links'].download.url,
      SOURCES['tatoeba-links'].download.cacheAs,
      options,
    );
    downloads['tatoeba-links'] = linksGot;
    const jpnToEng = new Map();
    const engWanted = new Set();
    for await (const line of bunzipLines(linksGot.path, { tar: true })) {
      const tab = line.indexOf('\t');
      if (tab === -1) continue;
      const left = line.slice(0, tab);
      if (!candidates.has(left) || jpnToEng.has(left)) continue;
      const right = line.slice(tab + 1).trim();
      jpnToEng.set(left, right);
      engWanted.add(right);
    }
    const engGot = await download(
      SOURCES['tatoeba-eng'].download.url,
      SOURCES['tatoeba-eng'].download.cacheAs,
      options,
    );
    downloads['tatoeba-eng'] = engGot;
    const eng = await parseTatoebaSentences(engGot.path, engWanted);

    for (const [jpnId, candidate] of candidates) {
      const engId = jpnToEng.get(jpnId);
      const translation = engId ? eng.get(engId) : undefined;
      if (!translation) continue;
      sentences.push({
        id: `tatoeba-${jpnId}`,
        japanese: candidate.sentence.text,
        english: translation.text,
        headword: candidate.headword,
        entSeq: headwords.get(candidate.headword),
        tatoeba: {
          japaneseId: jpnId,
          japaneseContributor: candidate.sentence.username,
          englishId: engId,
          englishContributor: translation.username,
        },
      });
      if (sentences.length >= options.sentences) break;
    }
    console.log(`  ${sentences.length} sentences with an English translation`);
  } else {
    deferred.push({
      source: 'tatoeba',
      reason: 'sentences disabled by --sentences=none or licence gate not satisfied',
    });
  }

  console.log('stage 4: strokes');
  const strokeTargets =
    options.strokes === Number.POSITIVE_INFINITY ? shippedKanji : shippedKanji.slice(0, options.strokes);
  const strokes = usable.kanjivg ? await fetchStrokes(strokeTargets, options) : [];
  console.log(`  ${strokes.length} stroke files`);

  console.log('stage 5: emit');
  const strokeByChar = new Map(strokes.map((s) => [s.character, s.file]));
  const outputs = {};

  outputs['dictionary/lexemes.json'] = {
    sha256: await writeJson(join(OUT_DIR, 'lexemes.json'), {
      schemaVersion: 1,
      _comment: [
        'Imported JMdict entries. Emitted by scripts/import-sources.mjs; do not hand-edit —',
        'a hand-edit would make the record disagree with the ent_seq it claims.',
        'Provenance is by reference into data/provenance.json; every record names the',
        'real upstream ent_seq it was read from.',
      ],
      provenanceRef: 'edrdg-jmdict-primary',
      records: chosen.map((entry) => ({
        id: `jmdict-${entry.entSeq}`,
        headword: entry.headword,
        reading: entry.reading,
        partOfSpeech: entry.partOfSpeech,
        senses: entry.senses,
        kanjiUsed: kanjiIn(entry.headword),
        priorityTags: entry.priorityTags,
        sourceEntryId: entry.entSeq,
      })),
    }),
    bytes: 0,
  };

  outputs['dictionary/kanji.json'] = {
    sha256: await writeJson(join(OUT_DIR, 'kanji.json'), {
      schemaVersion: 1,
      _comment: [
        'Imported KANJIDIC2 characters, limited to those the imported lexemes actually use.',
        'strokeSvg points at a verbatim KanjiVG file under dictionary/strokes/ where one exists;',
        'KanjiVG does not cover every literal, and a missing file is recorded as null.',
      ],
      provenanceRef: 'edrdg-kanjidic2-primary',
      records: shippedKanji.map((character) => {
        const record = kanjidic.get(character);
        return {
          id: `kanji-${character.codePointAt(0).toString(16).padStart(5, '0')}`,
          character,
          codepoint: `U+${character.codePointAt(0).toString(16).toUpperCase()}`,
          strokeCount: record.strokeCount,
          grade: record.grade,
          frequency: record.frequency,
          jlpt: record.jlpt,
          onReadings: record.onReadings,
          kunReadings: record.kunReadings,
          meanings: record.meanings,
          strokeSvg: strokeByChar.get(character) ?? null,
          sourceEntryId: character,
        };
      }),
    }),
    bytes: 0,
  };

  outputs['dictionary/sentences.json'] = {
    sha256: await writeJson(join(OUT_DIR, 'sentences.json'), {
      schemaVersion: 1,
      _comment: [
        'Tatoeba sentence pairs. CC BY 2.0 FR requires attribution of the contributor,',
        'so japanese and english carry separate provenance: they are different works by',
        'different people, and collapsing them into one credit would misattribute both.',
      ],
      provenanceRef: 'tatoeba-sentence',
      records: sentences,
    }),
    bytes: 0,
  };

  outputs['dictionary/strokes.json'] = {
    sha256: await writeJson(join(OUT_DIR, 'strokes.json'), {
      schemaVersion: 1,
      _comment: ['Verbatim KanjiVG files for the imported kanji, pinned to one commit.'],
      upstream: {
        project: 'KanjiVG',
        repository: 'https://github.com/KanjiVG/kanjivg',
        commit: KANJIVG_COMMIT,
        license: 'CC BY-SA 3.0',
      },
      files: strokes,
    }),
    bytes: 0,
  };

  for (const relPath of Object.keys(outputs)) {
    const body = await readFile(join(PACKAGE_ROOT, 'data', relPath));
    outputs[relPath] = { bytes: body.length, sha256: sha256(body) };
  }

  const manifest = {
    schemaVersion: 1,
    _comment: [
      'What this import fetched and what it produced. Written by',
      'scripts/import-sources.mjs; re-checkable offline with --check, which',
      're-derives every digest below from the committed files.',
      '',
      'The raw downloads are NOT committed: they are ~200 MB and live in the',
      'gitignored cache. Their sha256 is recorded here so a shipped gloss can be',
      'traced back to the exact upstream bytes it came from.',
    ],
    generatedAt: today(),
    parameters: {
      lexemes: options.lexemes === Number.POSITIVE_INFINITY ? 'all' : options.lexemes,
      sentences: options.sentences === Number.POSITIVE_INFINITY ? 'all' : options.sentences,
      strokes: options.strokes === Number.POSITIVE_INFINITY ? 'all' : options.strokes,
    },
    scaleNote:
      'This is a subset, ranked by JMdict priority tags. Re-running with --lexemes=all ' +
      'imports every priority-tagged entry; the pipeline is unchanged by the size.',
    sources: Object.fromEntries(
      Object.entries(downloads).map(([key, got]) => [
        key,
        {
          displayName: SOURCES[key].displayName,
          license: SOURCES[key].licence,
          licenceFiles: SOURCES[key].licenceFiles,
          url: got.url,
          retrievedAt: got.retrievedAt,
          bytes: got.bytes,
          sha256: got.sha256,
        },
      ]),
    ),
    counts: {
      lexemes: chosen.length,
      kanji: shippedKanji.length,
      sentences: sentences.length,
      strokeFiles: strokes.length,
      jmdictEntriesAvailable: jmdictEntries.length,
      kanjidic2CharactersAvailable: kanjidic.size,
    },
    outputs,
    deferred,
  };
  await writeJson(OUT_MANIFEST, manifest);
  console.log(`  wrote ${OUT_MANIFEST}`);
  console.log(
    `done: ${chosen.length} lexemes, ${shippedKanji.length} kanji, ${sentences.length} sentences, ${strokes.length} strokes`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

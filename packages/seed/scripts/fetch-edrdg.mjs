/**
 * Import the EDRDG (JMdict / KANJIDIC2) fields of the Phase-0 seed (controller §8).
 *
 * WP-04 could not do this: every EDRDG host was refused by the egress proxy, so
 * readings, senses, parts of speech and kanji meanings were hand-assembled and
 * labelled `bunki-editorial / unreviewed` rather than fabricated as JMdict. This
 * script replaces those hand-assembled claims with the real entries, each
 * carrying its real upstream identifier — a JMdict `ent_seq`, a KANJIDIC2
 * literal.
 *
 * `www.edrdg.org` and `ftp.edrdg.org` are **still blocked**. The data therefore
 * comes from a pinned, hash-verified redistribution — `jamdict-data`, the data
 * package of the `jamdict` project (github.com/neocl/jamdict_data), published to
 * PyPI by that project. This is *not* a "verified from a mirror" claim, which
 * `LICENSES.md` still forbids: the artefact carries EDRDG's own licence
 * statement next to the bytes it governs, both are pinned by sha256, and
 * `LICENSES.md` records the distinction between the licensor's text and the
 * licensor's host in the state name itself.
 *
 *   node packages/seed/scripts/fetch-edrdg.mjs                 # download, extract, rewrite
 *   node packages/seed/scripts/fetch-edrdg.mjs --check         # verify, never write
 *   node packages/seed/scripts/fetch-edrdg.mjs --db <path>     # reuse an extracted jamdict.db
 *
 * Not wired into `npm run test`: the §17.5 check set must pass with no network.
 * What the offline suite asserts instead is that every field claiming an EDRDG
 * source carries a real upstream identifier and that the licence text backing
 * that claim is present on disk (`test/edrdg.test.ts`).
 */

/*
 * As in fetch-kanjivg.mjs: ESLint's Node-globals block is scoped to the
 * repository root's `scripts/` directory and does not reach a package-level
 * script, so the globals are declared locally rather than by editing WP-01's
 * config across a package boundary.
 */
/* global fetch, console, process, Buffer */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');
const DATA_DIR = join(PACKAGE_ROOT, 'data');

/**
 * The pinned upstream artefact. Bump deliberately, never silently: a bump
 * changes licensed third-party content and must be re-recorded in LICENSES.md
 * together with a fresh retrieval date.
 */
export const UPSTREAM = {
  package: 'jamdict-data',
  version: '1.5',
  publisher: 'the jamdict project (Le Tuan Anh) — https://github.com/neocl/jamdict_data',
  sdistUrl:
    'https://files.pythonhosted.org/packages/97/a5/075928aed2b3b70459fc1db396397dfa6714d266c143c51af9b648551a4e/jamdict_data-1.5.tar.gz',
  sdistSha256: 'a4247dd9bb3148ab17c1b32fc56d7a7f1c35293b0d6ff2838c811f896d13f415',
  dbXzSha256: '124577d8f2c44841f1f4ec43ac5413be81770ce3ed60ea917bae6c5944d88d39',
  licenseFile: 'licenses/EDRDG-licence-statement.md',
  licenseSha256: '1980bff8562ca1f4e83a5b4a5646de805da61e3409d288a8dea11dd7bb3a13f6',
  licenseUrl: 'https://raw.githubusercontent.com/neocl/jamdict_data/main/jamdict_data/LICENSE.md',
  retrievedAt: '2026-07-28',
};

/**
 * Seed lexeme id -> JMdict `ent_seq`, resolved once by matching the seed's
 * headword against the entry's *first* kanji element and its reading against the
 * entry's kana elements, then taking the lowest matching sequence. Pinned here
 * rather than re-resolved at run time so the mapping is reviewable in a diff:
 * 岐路, 分, 車, 点 and 道 each match more than one entry, and silently
 * re-resolving them would let a data update move a seed word to a different
 * word without anybody seeing it.
 */
export const LEXEME_ENT_SEQ = {
  'lex-bunki': 1503340,
  'lex-bunkiten': 1503370,
  'lex-kiro': 1219840,
  'lex-wakareru': 1606600,
  'lex-wakeru': 1503000,
  'lex-wakaru': 1606560,
  'lex-fun': 1502840,
  'lex-jibun': 1318610,
  'lex-bubun': 1499490,
  'lex-senro': 1391880,
  'lex-douro': 1454290,
  'lex-shadou': 1323210,
  'lex-kuruma': 1323080,
  'lex-eki': 1175140,
  'lex-ten': 1441390,
  'lex-michi': 1454080,
};

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const uniq = (values) => [...new Set(values.filter((value) => value && value.trim().length > 0))];

/**
 * Read one JMdict entry.
 *
 * Extraction rules, fixed here and restated in the provenance notes because they
 * are what makes the shipped list "derived" rather than "unmodified":
 *   - `reading` is the entry's FIRST kana element in upstream order;
 *   - `partOfSpeech` is the union of every sense's pos, upstream order, deduped;
 *   - `senses` is every English gloss of every sense, upstream order, deduped —
 *     flattened, because the seed schema stores senses as one string list, so
 *     sense boundaries are lost by the shape rather than by a judgement call.
 */
export function readEntry(db, entSeq) {
  const kanji = db
    .prepare('SELECT text FROM Kanji WHERE idseq = ? ORDER BY ID')
    .all(entSeq)
    .map((row) => row.text);
  const kana = db
    .prepare('SELECT text FROM Kana WHERE idseq = ? ORDER BY ID')
    .all(entSeq)
    .map((row) => row.text);
  const senseIds = db
    .prepare('SELECT ID FROM Sense WHERE idseq = ? ORDER BY ID')
    .all(entSeq)
    .map((row) => row.ID);

  const partOfSpeech = [];
  const senses = [];
  for (const sid of senseIds) {
    for (const row of db.prepare('SELECT text FROM pos WHERE sid = ?').all(sid)) {
      partOfSpeech.push(row.text);
    }
    const glosses = db
      .prepare(
        "SELECT text FROM SenseGloss WHERE sid = ? AND (lang IS NULL OR lang IN ('', 'eng')) ORDER BY rowid",
      )
      .all(sid);
    for (const row of glosses) senses.push(row.text);
  }

  if (kanji.length === 0 || kana.length === 0) {
    throw new Error(`ent_seq ${entSeq} has no kanji or no kana element`);
  }

  return {
    entSeq,
    headword: kanji[0],
    reading: kana[0],
    partOfSpeech: uniq(partOfSpeech),
    senses: uniq(senses),
  };
}

/**
 * Read one KANJIDIC2 character.
 *
 * `onReadings`/`kunReadings` are the `ja_on`/`ja_kun` readings across every
 * reading-meaning group, upstream order, deduped; `meanings` are the English
 * meanings the same way. Same flattening caveat as senses. `strokeCount` is
 * returned for cross-checking only — the shipped stroke count stays the one
 * derived from the KanjiVG SVG, which `test/strokes.test.ts` re-derives offline.
 */
export function readCharacter(db, literal) {
  const row = db.prepare('SELECT ID, stroke_count FROM character WHERE literal = ?').get(literal);
  if (!row) throw new Error(`KANJIDIC2 has no character ${literal}`);

  const groups = db
    .prepare('SELECT ID FROM rm_group WHERE cid = ? ORDER BY ID')
    .all(row.ID)
    .map((group) => group.ID);

  const onReadings = [];
  const kunReadings = [];
  const meanings = [];
  for (const gid of groups) {
    for (const reading of db
      .prepare('SELECT r_type, value FROM reading WHERE gid = ? ORDER BY rowid')
      .all(gid)) {
      if (reading.r_type === 'ja_on') onReadings.push(reading.value);
      if (reading.r_type === 'ja_kun') kunReadings.push(reading.value);
    }
    for (const meaning of db
      .prepare('SELECT value, m_lang FROM meaning WHERE gid = ? ORDER BY rowid')
      .all(gid)) {
      if (!meaning.m_lang || meaning.m_lang === '' || meaning.m_lang === 'en') {
        meanings.push(meaning.value);
      }
    }
  }

  return {
    literal,
    strokeCount: row.stroke_count,
    onReadings: uniq(onReadings),
    kunReadings: uniq(kunReadings),
    meanings: uniq(meanings),
  };
}

/** Download and unpack the pinned sdist, returning a path to `jamdict.db`. */
async function materialiseDatabase() {
  const work = mkdtempSync(join(tmpdir(), 'bunki-edrdg-'));
  const sdist = join(work, 'jamdict_data-1.5.tar.gz');

  console.log(`fetching ${UPSTREAM.sdistUrl}`);
  const response = await fetch(UPSTREAM.sdistUrl);
  if (!response.ok) throw new Error(`${UPSTREAM.sdistUrl} -> HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(sdist, bytes);
  console.log(`sdist bytes=${bytes.length} sha256=${sha256(bytes)}`);

  execFileSync('tar', ['xzf', sdist, '-C', work]);
  const xz = join(work, 'jamdict_data-1.5', 'jamdict_data', 'jamdict.db.xz');
  const xzDigest = sha256(readFileSync(xz));
  if (xzDigest !== UPSTREAM.dbXzSha256) {
    throw new Error(`jamdict.db.xz sha256 ${xzDigest} != pinned ${UPSTREAM.dbXzSha256}`);
  }
  console.log(`jamdict.db.xz sha256 matches pin`);

  const bundledLicence = join(work, 'jamdict_data-1.5', 'jamdict_data', 'LICENSE.md');
  const licenceDigest = sha256(readFileSync(bundledLicence));
  const committed = sha256(readFileSync(join(PACKAGE_ROOT, UPSTREAM.licenseFile)));
  if (licenceDigest !== UPSTREAM.licenseSha256 || committed !== UPSTREAM.licenseSha256) {
    throw new Error(
      `EDRDG licence text drifted: bundled=${licenceDigest} committed=${committed} pinned=${UPSTREAM.licenseSha256}`,
    );
  }
  console.log('EDRDG licence statement matches the committed copy byte-for-byte');

  execFileSync('xz', ['-dk', xz]);
  return join(work, 'jamdict_data-1.5', 'jamdict_data', 'jamdict.db');
}

const readJson = (file) => JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
const writeJson = (file, value) =>
  writeFileSync(join(DATA_DIR, file), `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const check = process.argv.includes('--check');
  const dbFlag = process.argv.indexOf('--db');
  const dbPath = dbFlag === -1 ? await materialiseDatabase() : process.argv[dbFlag + 1];

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const meta = Object.fromEntries(
    db
      .prepare('SELECT key, value FROM meta')
      .all()
      .map((row) => [row.key, row.value]),
  );

  const lexemes = readJson('lexemes.json');
  const kanji = readJson('kanji.json');
  let failures = 0;

  for (const record of lexemes.records) {
    const entSeq = LEXEME_ENT_SEQ[record.id];
    if (entSeq === undefined) throw new Error(`${record.id} has no pinned ent_seq`);
    const upstream = readEntry(db, entSeq);

    // The pin is only trustworthy if it still points at the same word.
    if (upstream.headword !== record.headword) {
      throw new Error(
        `${record.id}: ent_seq ${entSeq} is "${upstream.headword}", not "${record.headword}"`,
      );
    }

    const next = {
      reading: upstream.reading,
      partOfSpeech: upstream.partOfSpeech,
      senses: upstream.senses,
    };
    const matches = Object.entries(next).every(([key, value]) => same(record[key], value));
    if (check) {
      if (!matches) failures += 1;
      console.log(`${matches ? 'MATCH ' : 'DIFFER'} ${record.id} ent_seq=${entSeq}`);
    } else {
      Object.assign(record, next);
      for (const key of Object.keys(next)) {
        record.fieldProvenance[key] = { ref: 'edrdg-jmdict', source_entry_id: String(entSeq) };
      }
      console.log(`${record.id} <- ent_seq ${entSeq} (${upstream.senses.length} glosses)`);
    }
  }

  for (const record of kanji.records) {
    const upstream = readCharacter(db, record.character);
    if (upstream.strokeCount !== record.strokeCount) {
      // Not fatal and never overwritten: the shipped count is KanjiVG-derived.
      console.warn(
        `note: ${record.character} KANJIDIC2 stroke_count=${upstream.strokeCount} vs KanjiVG-derived ${record.strokeCount}`,
      );
    }
    const next = {
      onReadings: upstream.onReadings,
      kunReadings: upstream.kunReadings,
      meanings: upstream.meanings,
    };
    const matches = Object.entries(next).every(([key, value]) => same(record[key], value));
    if (check) {
      if (!matches) failures += 1;
      console.log(`${matches ? 'MATCH ' : 'DIFFER'} ${record.id} literal=${record.character}`);
    } else {
      Object.assign(record, next);
      for (const key of Object.keys(next)) {
        record.fieldProvenance[key] = {
          ref: 'edrdg-kanjidic2',
          source_entry_id: record.character,
        };
      }
      console.log(`${record.id} <- KANJIDIC2 ${record.character}`);
    }
  }

  const upstreamManifest = {
    schemaVersion: 1,
    _comment: [
      'Identity of the pinned upstream artefact the EDRDG-sourced fields came from.',
      'Mirrors the `upstream` block of strokes.json: the data files carry the values,',
      'this file carries the provenance of the artefact they were read out of.',
      'Re-verify with: node packages/seed/scripts/fetch-edrdg.mjs --check',
    ],
    upstream: UPSTREAM,
    databaseMeta: meta,
    entryCounts: {
      jmdictEntries: db.prepare('SELECT COUNT(*) AS n FROM Entry').get().n,
      kanjidic2Characters: db.prepare('SELECT COUNT(*) AS n FROM character').get().n,
    },
    lexemeEntSeq: LEXEME_ENT_SEQ,
    kanjidic2Literals: kanji.records.map((record) => record.character),
  };

  if (check) {
    const committed = readJson('edrdg-upstream.json');
    const metaMatches = same(committed.databaseMeta, meta);
    if (!metaMatches) failures += 1;
    console.log(`${metaMatches ? 'MATCH ' : 'DIFFER'} edrdg-upstream.json databaseMeta`);
    if (failures > 0) {
      console.error(`${failures} record(s) differ from pinned upstream`);
      process.exitCode = 1;
    }
  } else {
    writeJson('lexemes.json', lexemes);
    writeJson('kanji.json', kanji);
    writeJson('edrdg-upstream.json', upstreamManifest);
    console.log('wrote lexemes.json, kanji.json, edrdg-upstream.json');
  }

  db.close();
}

await main();

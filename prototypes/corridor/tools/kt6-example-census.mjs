/** KT-6 (Hfix-2e) · what the word-identity rule does to the whole example bank.
 * Runs the served corridor.js's own functions (exampleIdentity, exampleHoldsWord and the dictionary helpers they call,
 * extracted from the built site's corridor.js, never re-implemented) over every key of the bank, with the dictionary
 * index installed as the word page has it once its full detail has loaded. "Before" is the base: every bank sentence
 * filed under the key. "After" keeps the sentences that hold one of the word's own written forms.
 *   node prototypes/corridor/tools/kt6-example-census.mjs <site dir> [<out json>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const site = process.argv[2] || process.env.KAIRO_SITE_DIR;
if (!site) throw new Error('usage: kt6-example-census.mjs <site dir> [<out json>]');
const outPath = process.argv[3] || null;
const source = readFileSync(join(site, 'corridor.js'), 'utf8');
const json = (path) => JSON.parse(readFileSync(join(site, path), 'utf8'));

function topLevel(name) {
  const start = source.search(new RegExp(`\\n(?:async )?function ${name}\\(`));
  if (start < 0) throw new Error(`corridor.js has no function ${name}`);
  const end = source.indexOf('\n}\n', start + 1);
  return source.slice(start + 1, end + 2);
}
function constant(name) {
  const match = source.match(new RegExp(`\\nconst ${name} = [^\\n]*`));
  if (!match) throw new Error(`corridor.js has no const ${name}`);
  return match[0].slice(1);
}
// KT-6 round 2's helpers (the word's own entries and their sense check) are read when the served build has them, so the
// same census runs on the build before them and the counts compare
const optional = ['exampleKanji', 'exampleOwnRows', 'exampleSensesShared'].filter((name) => new RegExp(`\\nfunction ${name}\\(`).test(source));
const names = ['kataToHira', 'normalizeGloss', 'dictionaryReadingSummaries', 'dictionaryReadingSupportsForm', 'dictionaryCoreMatch',
  'dictionaryRowBySeq', 'dictionaryRowsForForm', 'dictionaryRowsFor', 'dictionaryDetailRowsFor', ...optional, 'exampleIdentity',
  'exampleTokenIsWord', 'exampleHoldsWord', 'inflateExampleToken'];
const code = [constant('KATA_TO_HIRA_OFFSET'), constant('GLOSS_MESSY'), constant('GLOSS_LEAD'), constant('READER_KANA'), ...names.map(topLevel),
  `return { ${names.join(', ')} };`].join('\n');
const D = {};
const fns = new Function('D', code)(D);

const index = json('data/share_alike/dict-v2/index.json');
Object.assign(D, {
  dict: json('data/share_alike/dict.json').words,
  dictionaryIndex: index, dictionaryMode: 'main',
  dictionaryBySeq: new Map(), dictionaryByForm: new Map(), dictionaryCompleteForms: new Set(),
});
// every entry's detail, as the word page has it once its shards are fetched (the sense check reads it)
D.dictionaryDetails = new Map();
for (let i = 0; i < index.shardCount; i += 1) {
  for (const entry of json(`data/share_alike/dict-v2/${i.toString(16).padStart(2, '0')}.json`).entries) D.dictionaryDetails.set(String(entry[0]), entry);
}
const dir = 'data/proprietary_safe/examples';
const manifest = json(`${dir}/manifest.json`);
const keys = {};
for (let i = 0; i < manifest.sharding.indexShards; i += 1) Object.assign(keys, json(`${dir}/ex-${String(i).padStart(2, '0')}.json`));
const sentences = [];
for (let i = 0; i < manifest.sharding.sentenceShards; i += 1) sentences.push(...json(`${dir}/s-${String(i).padStart(2, '0')}.json`));
const tokensOf = (sid) => sentences[sid][0].map(fns.inflateExampleToken);
const text = (sid) => sentences[sid][0].map((row) => row[0]).join('');

const tally = { keys: 0, unchanged: 0, loseSome: 0, loseAll: 0, links: 0, dropped: 0 };
const core = { keys: 0, unchanged: 0, loseSome: 0, loseAll: 0, links: 0, dropped: 0 };
const firstChanged = { all: 0, core: 0 };
const perKey = {};
for (const [key, sids] of Object.entries(keys)) {
  const identity = fns.exampleIdentity(key);
  const kept = sids.filter((sid) => fns.exampleHoldsWord(tokensOf(sid), identity));
  const isCore = !!D.dict[key];
  for (const t of isCore ? [tally, core] : [tally]) {
    t.keys += 1; t.links += sids.length; t.dropped += sids.length - kept.length;
    if (kept.length === sids.length) t.unchanged += 1;
    else if (kept.length) t.loseSome += 1;
    else t.loseAll += 1;
  }
  if (kept[0] !== sids[0]) { firstChanged.all += 1; if (isCore) firstChanged.core += 1; }
  perKey[key] = { before: sids.length, after: kept.length, forms: [...identity.forms], first: [sids[0], kept[0] ?? null],
    dropped: sids.filter((sid) => !kept.includes(sid)) };
}
// every key that changes, with what it loses (the receipt behind the counts)
const changed = Object.entries(perKey).filter(([, row]) => row.after !== row.before).map(([key, row]) => ({
  key, core: !!D.dict[key], alt: D.dict[key]?.alt || null, sense: (D.dict[key]?.m || []).slice(0, 2).join('; '),
  before: row.before, after: row.after, forms: row.forms,
  dropped: row.dropped.map((sid) => ({ sid, text: text(sid), lemmas: [...new Set(tokensOf(sid).filter((t) => t.c).map((t) => t.b))] })),
}));

// ten spot checks, each named for the class it stands for
const spots = [
  ['あい', 'the finding: 藍 (indigo), filed under the kana あい, held 愛 (love) sentences'],
  ['えっと', 'a kana-only word (no kanji form)'],
  ['歩く', 'an inflected verb (歩け, 歩き: dictionary form 歩く)'],
  ['こと', 'a kanji word whose bank key is kana (事, the core alt)'],
  ['くも', '蜘蛛 (spider) filed under くも held 雲 (cloud)'],
  ['ほうき', '箒 (broom) held 放棄 (abandonment)'],
  ['は', 'the topic particle held 歯 (tooth) and 葉 (leaf)'],
  ['ならう', '倣う (imitate) held 習う (learn)'],
  ['引きかえす', 'a variant spelling of its own entry (sentences write 引き返す): kept'],
  ['いる', 'kana key (core: 要る "to need") whose kana sentences are いる "to be": spelling cannot part them (left)'],
];
const spotRows = spots.map(([key, why]) => {
  const row = perKey[key];
  if (!row) return { key, why, missing: true };
  const sense = (D.dict[key]?.m || []).slice(0, 2).join('; ');
  return { key, why, sense, alt: D.dict[key]?.alt || null, forms: row.forms, before: row.before, after: row.after,
    firstBefore: row.first[0] != null ? text(row.first[0]) : null, firstAfter: row.first[1] != null ? text(row.first[1]) : null };
});

const report = { site, artifact: JSON.parse(readFileSync(join(site, 'build-identity.json'), 'utf8')).artifactSha256,
  rule: optional.length ? 'a bank sentence is a word\'s example only when a content token\'s dictionary form is one of the word\'s own written forms: key, core alt, the shown entry\'s spellings (kana forms only for an entry with no kanji), and the spellings of every entry that writes the key: with the key\'s kanji, or with other kanji when the entry has one sense or restricts none of its senses to some spellings'
    : 'a bank sentence is a word\'s example only when a content token\'s dictionary form is one of the word\'s own written forms (key, core alt, its own entry\'s spellings; kana forms only for an entry with no kanji)',
  helpers: optional,
  all: tally, core, firstExampleChanged: firstChanged, spots: spotRows, changed };
const fmt = (t) => `${t.keys} keys: ${t.unchanged} unchanged, ${t.loseSome} lose some, ${t.loseAll} lose all; ${t.dropped} of ${t.links} sentence links dropped`;
console.log(`whole bank   ${fmt(tally)}`);
console.log(`core words   ${fmt(core)}`);
console.log(`first bank example changes: ${firstChanged.all} keys (${firstChanged.core} core)`);
for (const s of spotRows) {
  if (s.missing) { console.log(`- ${s.key}: not in the bank`); continue; }
  console.log(`- ${s.key}${s.alt ? `（${s.alt}）` : ''} · ${s.sense} · ${s.before} → ${s.after} · first 「${s.firstBefore}」 → ${s.firstAfter ? `「${s.firstAfter}」` : 'none'}  [${s.why}]`);
}
if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 1));

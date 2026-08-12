/**
 * Build the official radical (部首) layer.
 *
 * The operator wants the real Japanese radical system: for every kanji, its ONE
 * official radical with a Japanese name, a position type, and a Kangxi number
 * (1–214) — the KKLD/Kodansha model, not the "family of shape-components" the
 * corridor already shows.
 *
 * Three inputs, joined here:
 *   1. Per-kanji Kangxi radical NUMBER — from KANJIDIC2's classical rad_value,
 *      extracted to corpus/datasets/kanji/kanjidic2_radicals.json
 *      (Electronic Dictionary Research and Development Group, CC BY-SA — the
 *      same licence and attribution already carried in kanji.json's `sources`).
 *   2. The radical GLYPH per number — by Unicode definition, Kangxi radical N is
 *      codepoint U+2F00+(N-1); NFKC folds that compatibility glyph (⽊) onto the
 *      normal CJK form (木). No external data needed.
 *   3. The radical NAME + POSITION — base names joined from the in-repo
 *      kanken_radicals.jsonl by glyph; the idiomatic positional name (きへん,
 *      さんずい, ごんべん…) and position type authored below from standard
 *      reference. Position is each radical's CANONICAL position — right for the
 *      vast majority of kanji, occasionally approximate when a radical sits in
 *      an unusual spot (operator-accepted; the app flags it as canonical).
 *
 * Outputs:
 *   - data/share_alike/radicals214.json : { "75": {n,c,var,name,base,pos,posEn} }
 *   - patches data/share_alike/kanji.json in place, adding `rad` (the number) to
 *     each kanji record. build_corridor.py carries the same line for durability.
 *
 * Usage: node build-radicals.mjs [--data DIR]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const REPO = resolve(CORRIDOR, '..', '..');
const dataArg = process.argv.indexOf('--data');
const DATA = dataArg >= 0 ? resolve(process.argv[dataArg + 1]) : resolve(CORRIDOR, 'data');
const SA = resolve(DATA, 'share_alike');

/**
 * Authored positional table, keyed by Kangxi number.
 *   [ posName, posType, variantGlyph? ]
 * posType ∈ へん(left) つくり(right) かんむり(top) あし(bottom) たれ(hanging)
 *           にょう(wrap) かまえ(enclosure) 独立(standalone/varies).
 * variantGlyph is the form the positional name actually names when it differs
 * from the base radical glyph (氵 for 水, 忄 for 心, 阝 for 邑/阜, …).
 */
const POS = {
  1: ['いち', '独立'], 2: ['たてぼう', '独立'], 3: ['てん', '独立'], 4: ['の', '独立'],
  5: ['おつ', '独立'], 6: ['はねぼう', '独立'], 7: ['に', '独立'], 8: ['なべぶた', 'かんむり'],
  9: ['にんべん', 'へん', '亻'], 10: ['ひとあし', 'あし'], 11: ['いる', 'かんむり'], 12: ['はち', 'かんむり'],
  13: ['どうがまえ', 'かまえ'], 14: ['わかんむり', 'かんむり'], 15: ['にすい', 'へん'], 16: ['きにょう', 'かまえ'],
  17: ['うけばこ', 'かまえ'], 18: ['りっとう', 'つくり', '刂'], 19: ['ちから', '独立'], 20: ['つつみがまえ', 'かまえ'],
  21: ['さじのひ', '独立'], 22: ['はこがまえ', 'かまえ'], 23: ['かくしがまえ', 'かまえ'], 24: ['じゅう', '独立'],
  25: ['ぼくのと', '独立'], 26: ['ふしづくり', 'つくり'], 27: ['がんだれ', 'たれ'], 28: ['む', '独立'],
  29: ['また', '独立'], 30: ['くちへん', 'へん'], 31: ['くにがまえ', 'かまえ'], 32: ['つちへん', 'へん'],
  33: ['さむらい', '独立'], 34: ['ふゆがしら', 'かんむり'], 35: ['すいにょう', 'にょう'], 36: ['ゆうべ', '独立'],
  37: ['だい', '独立'], 38: ['おんなへん', 'へん'], 39: ['こへん', 'へん'], 40: ['うかんむり', 'かんむり'],
  41: ['すん', '独立'], 42: ['しょうがしら', 'かんむり'], 43: ['まげあし', 'あし'], 44: ['しかばね', 'たれ'],
  45: ['てつ', '独立'], 46: ['やまへん', 'へん'], 47: ['かわ', '独立'], 48: ['たくみへん', 'へん'],
  49: ['おのれ', '独立'], 50: ['はばへん', 'へん'], 51: ['いちじゅう', '独立'], 52: ['いとがしら', 'かんむり'],
  53: ['まだれ', 'たれ'], 54: ['えんにょう', 'にょう'], 55: ['にじゅうあし', 'あし'], 56: ['しきがまえ', 'かまえ'],
  57: ['ゆみへん', 'へん'], 58: ['けいがしら', 'かんむり'], 59: ['さんづくり', 'つくり'], 60: ['ぎょうにんべん', 'へん'],
  61: ['りっしんべん', 'へん', '忄'], 62: ['ほこづくり', 'つくり'], 63: ['とだれ', 'たれ'], 64: ['てへん', 'へん', '扌'],
  65: ['しにょう', 'つくり'], 66: ['のぶん', 'つくり', '攵'], 67: ['ぶん', '独立'], 68: ['とます', 'つくり'],
  69: ['おのづくり', 'つくり'], 70: ['ほうへん', 'へん'], 71: ['むにょう', 'つくり'], 72: ['ひへん', 'へん'],
  73: ['ひらび', 'かんむり'], 74: ['つきへん', 'へん'], 75: ['きへん', 'へん'], 76: ['あくび', 'つくり'],
  77: ['とめへん', 'へん'], 78: ['がつへん', 'へん'], 79: ['るまた', 'つくり'], 80: ['なかれ', '独立'],
  81: ['ならびひ', '独立'], 82: ['け', '独立'], 83: ['うじ', '独立'], 84: ['きがまえ', 'かまえ'],
  85: ['さんずい', 'へん', '氵'], 86: ['ひへん', 'へん', '灬'], 87: ['つめかんむり', 'かんむり', '爫'], 88: ['ちち', '独立'],
  89: ['こう', '独立'], 90: ['しょうへん', 'へん'], 91: ['かたへん', 'へん'], 92: ['きば', '独立'],
  93: ['うしへん', 'へん'], 94: ['けものへん', 'へん', '犭'], 95: ['げん', '独立'], 96: ['おうへん', 'へん'],
  97: ['うり', '独立'], 98: ['かわら', '独立'], 99: ['あまい', '独立'], 100: ['うまれる', '独立'],
  101: ['もちいる', '独立'], 102: ['たへん', 'へん'], 103: ['ひきへん', 'へん'], 104: ['やまいだれ', 'たれ'],
  105: ['はつがしら', 'かんむり'], 106: ['しろへん', 'へん'], 107: ['けがわ', '独立'], 108: ['さら', 'あし'],
  109: ['めへん', 'へん'], 110: ['ほこへん', 'へん'], 111: ['やへん', 'へん'], 112: ['いしへん', 'へん'],
  113: ['しめすへん', 'へん', '礻'], 114: ['ぐうのあし', 'あし'], 115: ['のぎへん', 'へん'], 116: ['あなかんむり', 'かんむり'],
  117: ['たつへん', 'へん'], 118: ['たけかんむり', 'かんむり', '⺮'], 119: ['こめへん', 'へん'], 120: ['いとへん', 'へん'],
  121: ['ほとぎ', '独立'], 122: ['あみがしら', 'かんむり', '罒'], 123: ['ひつじ', '独立'], 124: ['はね', '独立'],
  125: ['おいかんむり', 'かんむり'], 126: ['しかして', '独立'], 127: ['らいすき', 'へん'], 128: ['みみへん', 'へん'],
  129: ['ふでづくり', '独立'], 130: ['にくづき', 'へん', '⺼'], 131: ['しん', '独立'], 132: ['みずから', '独立'],
  133: ['いたる', '独立'], 134: ['うす', '独立'], 135: ['したへん', 'へん'], 136: ['まいあし', 'あし'],
  137: ['ふねへん', 'へん'], 138: ['こんづくり', 'つくり'], 139: ['いろ', '独立'], 140: ['くさかんむり', 'かんむり', '艹'],
  141: ['とらがしら', 'たれ'], 142: ['むしへん', 'へん'], 143: ['ち', '独立'], 144: ['ぎょうがまえ', 'かまえ'],
  145: ['ころもへん', 'へん', '衤'], 146: ['おおいかんむり', 'かんむり'], 147: ['みる', '独立'], 148: ['つのへん', 'へん'],
  149: ['ごんべん', 'へん'], 150: ['たに', '独立'], 151: ['まめへん', 'へん'], 152: ['いのこ', '独立'],
  153: ['むじなへん', 'へん'], 154: ['かいへん', 'へん'], 155: ['あかへん', 'へん'], 156: ['そうにょう', 'にょう'],
  157: ['あしへん', 'へん', '⻊'], 158: ['みへん', 'へん'], 159: ['くるまへん', 'へん'], 160: ['からい', '独立'],
  161: ['しんのたつ', '独立'], 162: ['しんにょう', 'にょう', '辶'], 163: ['おおざと', 'つくり', '阝'], 164: ['とりへん', 'へん'],
  165: ['のごめへん', 'へん'], 166: ['さとへん', 'へん'], 167: ['かねへん', 'へん'], 168: ['ながい', '独立'],
  169: ['もんがまえ', 'かまえ'], 170: ['こざとへん', 'へん', '阝'], 171: ['れいづくり', 'つくり'], 172: ['ふるとり', 'つくり'],
  173: ['あめかんむり', 'かんむり'], 174: ['あお', '独立'], 175: ['あらず', '独立'], 176: ['めん', '独立'],
  177: ['かわへん', 'へん'], 178: ['なめしがわ', '独立'], 179: ['にら', '独立'], 180: ['おと', '独立'],
  181: ['おおがい', 'つくり'], 182: ['かぜ', '独立'], 183: ['とぶ', '独立'], 184: ['しょくへん', 'へん', '飠'],
  185: ['くび', '独立'], 186: ['かおり', '独立'], 187: ['うまへん', 'へん'], 188: ['ほねへん', 'へん'],
  189: ['たかい', '独立'], 190: ['かみがしら', 'かんむり'], 191: ['たたかいがまえ', 'かまえ'], 192: ['においざけ', '独立'],
  193: ['かなえ', '独立'], 194: ['きにょう', '独立'], 195: ['うおへん', 'へん'], 196: ['とりへん', 'へん'],
  197: ['しお', '独立'], 198: ['しか', '独立'], 199: ['ばくにょう', 'にょう'], 200: ['あさかんむり', 'たれ'],
  201: ['きいろ', '独立'], 202: ['きび', '独立'], 203: ['くろ', '独立'], 204: ['ふつへん', 'へん'],
  205: ['べん', '独立'], 206: ['かなえ', '独立'], 207: ['つづみ', '独立'], 208: ['ねずみ', '独立'],
  209: ['はな', '独立'], 210: ['せい', '独立'], 211: ['はへん', 'へん'], 212: ['りゅう', '独立'],
  213: ['かめ', '独立'], 214: ['ふえ', '独立'],
};

const POS_EN = {
  へん: 'left', つくり: 'right', かんむり: 'top', あし: 'bottom',
  たれ: 'hanging', にょう: 'wrap', かまえ: 'enclosure', 独立: 'standalone',
};

/* ---- base names from the in-repo kanken radical list, joined by glyph ---- */
const nfkc = (s) => s.normalize('NFKC');
const kanken = readFileSync(resolve(REPO, 'corpus/datasets/kanji/kanken_radicals.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const baseByGlyph = new Map();
for (const r of kanken) if (!baseByGlyph.has(nfkc(r.radical))) baseByGlyph.set(nfkc(r.radical), r.name);
baseByGlyph.set('夊', 'すいにょう'); // #35, merged away in the kanken list

/* ---------------------------- assemble the 214-row table --------------- */
const table = {};
for (let n = 1; n <= 214; n++) {
  const kx = String.fromCodePoint(0x2f00 + n - 1);
  const c = nfkc(kx);
  const authored = POS[n];
  if (!authored) throw new Error(`no authored position for radical ${n}`);
  const [name, pos, variant] = authored;
  table[n] = {
    n,
    c, // canonical CJK glyph, e.g. 木
    ...(variant ? { var: variant } : {}), // positional variant, e.g. 氵
    name, // positional name, e.g. きへん
    base: baseByGlyph.get(c) || null, // plain name, e.g. き
    pos, // position type in kana
    posEn: POS_EN[pos], // left / right / top / …
  };
}

/* ---------------------- patch kanji.json with `rad` -------------------- */
const radMap = JSON.parse(readFileSync(resolve(REPO, 'corpus/datasets/kanji/kanjidic2_radicals.json'), 'utf8'));
const kanjiDoc = JSON.parse(readFileSync(resolve(SA, 'kanji.json'), 'utf8'));
let tagged = 0;
let untagged = [];
for (const [ch, rec] of Object.entries(kanjiDoc.kanji)) {
  const num = radMap[ch];
  if (num && num >= 1 && num <= 214) {
    rec.rad = num;
    tagged += 1;
  } else {
    untagged.push(ch);
  }
}
// keep the source list in the attribution block so the addition is honest
if (!kanjiDoc.sources.some((s) => /classical radical/i.test(s.name || ''))) {
  kanjiDoc.sources.push({
    name: 'KANJIDIC2 classical radical (部首)',
    licence: 'CC BY-SA 4.0',
    attribution: 'Electronic Dictionary Research and Development Group, KANJIDIC2 (CC BY-SA)',
    url: 'https://www.edrdg.org/',
  });
}
writeFileSync(resolve(SA, 'kanji.json'), JSON.stringify(kanjiDoc));
writeFileSync(resolve(SA, 'radicals214.json'), JSON.stringify(table));

/* -------------------------------- report ------------------------------ */
const missingBase = Object.values(table).filter((r) => !r.base).map((r) => r.n);
console.log(`radicals214: 214 rows · base-name joined for ${214 - missingBase.length}/214` +
  (missingBase.length ? ` (missing ${missingBase.join(',')})` : ''));
console.log(`kanji.json: rad tagged ${tagged}/${tagged + untagged.length}` +
  (untagged.length ? ` · untagged: ${untagged.slice(0, 12).join('')}` : ''));
for (const n of [75, 149, 163, 32, 108, 85, 140, 9]) {
  const r = table[n];
  console.log(`  #${n} ${r.c}${r.var ? '(' + r.var + ')' : ''} ${r.name} — ${r.pos}/${r.posEn} (base ${r.base})`);
}

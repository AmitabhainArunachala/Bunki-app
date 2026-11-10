'use strict';

// The served Corridor keeps the 70k JMdict index entirely inside this worker.
// Messages return only complete search batches or the few compact rows needed
// for an opened form/sequence. The standalone handoff deliberately uses the
// embedded main-thread fallback in corridor.js and never creates this worker.

let dictionaryEntries = null;
let dictionaryMetadata = null;
let coreWords = null;
const formRowsCache = new Map();

const GLOSS_MESSY = /[(]|\s\s|[^\S ]/;
const GLOSS_LEAD = new Set(['the', 'a', 'an', 'to']);
const JLPT_RANK = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

function normalizeGloss(value) {
  let bare = String(value).toLowerCase();
  if (GLOSS_MESSY.test(bare)) {
    bare = bare.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
  }
  bare = bare.trim();
  const space = bare.indexOf(' ');
  if (space > 0 && GLOSS_LEAD.has(bare.slice(0, space))) return bare.slice(space + 1);
  return bare;
}

function kataToHira(value) {
  return String(value || '').replace(/[\u30a1-\u30f6]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60));
}

function jlptRank(level) {
  return JLPT_RANK[String(level || '').toUpperCase()] ?? 5;
}

function dictionaryReadingSummaries(row) {
  if (!Array.isArray(row)) return [];
  const defaultSummary = [row[2] || '', row[1] || '', row[3] || ''];
  const encoded = Array.isArray(row[9]) ? row[9] : [];
  const kana = Array.isArray(row[5]) ? row[5] : [];
  if (!encoded.length) return [defaultSummary];
  if (encoded.every((summary) => Array.isArray(summary) && summary.length >= 3)) {
    return encoded.map((summary) => [
      summary[0] || '',
      summary[1] || row[1] || '',
      summary[2] || row[3] || '',
    ]);
  }
  if (encoded.length !== kana.length) return [defaultSummary];
  return encoded.map((summary, index) => [
    kana[index] || '',
    Array.isArray(summary) && summary[0] ? summary[0] : row[1] || '',
    Array.isArray(summary) && summary[1] ? summary[1] : row[3] || '',
  ]);
}

function dictionaryGlossSummary(row, glossIndex) {
  if (!Array.isArray(row) || !Number.isInteger(glossIndex) || glossIndex < 0) return null;
  const glosses = Array.isArray(row[6]) ? row[6] : [];
  const kana = Array.isArray(row[5]) ? row[5] : [];
  const mapping = Array.isArray(row[10]) ? row[10][glossIndex] : null;
  if (
    glossIndex >= glosses.length ||
    !Array.isArray(mapping) ||
    !Number.isInteger(mapping[0]) ||
    mapping[0] < 0 ||
    mapping[0] >= kana.length
  ) {
    return null;
  }
  return [
    kana[mapping[0]] || row[2] || '',
    mapping[1] || row[1] || '',
    glosses[glossIndex] || row[3] || '',
  ];
}

function dictionaryReadingSupportsForm(row, reading, form) {
  if (!Array.isArray(row) || !form) return false;
  const kana = Array.isArray(row[5]) ? row[5] : [];
  const kanaIndex = kana.findIndex(
    (candidate) => kataToHira(candidate) === kataToHira(reading || ''),
  );
  if (kanaIndex < 0) return false;
  if (kataToHira(kana[kanaIndex]) === kataToHira(form) && kana.includes(form)) return true;
  const written = Array.isArray(row[4]) ? row[4] : [];
  const writtenIndex = written.indexOf(form);
  if (writtenIndex < 0) return false;
  const scope = Array.isArray(row[11]) ? row[11][kanaIndex] : null;
  if (scope === 0) return true;
  if (scope === 1) return false;
  return Array.isArray(scope) && scope.includes(writtenIndex);
}

function dictionaryCoreMatch(form, row) {
  const core = coreWords?.[form];
  if (!core) return { compatible: false, reading: false, gloss: false };
  const coreGlosses = new Set((core.m || []).map(normalizeGloss));
  const summaries = dictionaryReadingSummaries(row)
    .filter((summary) => dictionaryReadingSupportsForm(row, summary[0], form))
    .map((summary) => [summary[0], form, summary[2]]);
  const reading = summaries.some(
    (summary) => !!core.r && kataToHira(core.r) === kataToHira(summary[0]),
  );
  const gloss = summaries.some(
    (summary) => !!summary[2] && coreGlosses.has(normalizeGloss(summary[2])),
  );
  const compatible = summaries.some(
    (summary) =>
      !!core.r &&
      kataToHira(core.r) === kataToHira(summary[0]) &&
      !!summary[2] &&
      coreGlosses.has(normalizeGloss(summary[2])),
  );
  return { compatible, reading, gloss };
}

function validateSenseTagRows(row, vocabulary) {
  const senses = row[12];
  if (!Array.isArray(senses) || !senses.length) return false;
  let nextGloss = 0;
  for (const sense of senses) {
    if (
      !Array.isArray(sense) ||
      sense.length !== 5 ||
      sense[0] !== nextGloss ||
      !Number.isInteger(sense[1]) ||
      sense[1] < 1 ||
      !Array.isArray(sense[2]) ||
      !Array.isArray(sense[3]) ||
      !Array.isArray(sense[4])
    ) {
      return false;
    }
    for (const [category, tags] of [
      ['misc', sense[2]],
      ['field', sense[3]],
      ['dialect', sense[4]],
    ]) {
      if (tags.some((tag) => typeof vocabulary?.[category]?.[tag] !== 'string')) return false;
    }
    nextGloss += sense[1];
  }
  return nextGloss === row[6].length;
}

function validateRow(row, previousSeq, vocabulary) {
  if (
    !Array.isArray(row) ||
    row.length !== 13 ||
    !/^\d+$/.test(String(row[0])) ||
    !Array.isArray(row[4]) ||
    !Array.isArray(row[5]) ||
    !Array.isArray(row[6]) ||
    !Array.isArray(row[7]) ||
    !Array.isArray(row[9]) ||
    !Array.isArray(row[10]) ||
    !Array.isArray(row[11]) ||
    row[10].length !== row[6].length ||
    row[11].length !== row[5].length ||
    !validateSenseTagRows(row, vocabulary) ||
    Number(row[0]) <= previousSeq
  ) {
    throw new Error('dictionary index row is malformed');
  }
  return Number(row[0]);
}

async function fetchJson(url) {
  const fetchStarted = performance.now();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  const responseAt = performance.now();
  const text = await response.text();
  const textAt = performance.now();
  const value = JSON.parse(text);
  const parsedAt = performance.now();
  return {
    value,
    bytes: new TextEncoder().encode(text).byteLength,
    fetchMs: responseAt - fetchStarted,
    readMs: textAt - responseAt,
    parseMs: parsedAt - textAt,
    totalMs: parsedAt - fetchStarted,
  };
}

async function initialise(indexUrl, coreUrl) {
  const started = performance.now();
  const [indexLoad, coreLoad] = await Promise.all([
    fetchJson(indexUrl),
    fetchJson(coreUrl),
  ]);
  const index = indexLoad.value;
  if (
    index?.schemaVersion !== 3 ||
    index?.shardCount !== 16 ||
    index?.sharding?.id !== 'fnv1a32-ascii-seq-mask15' ||
    index.sharding.shardCount !== index.shardCount ||
    index?.layout?.indexEntry?.[12] !== 'senseTagRows' ||
    index?.layout?.senseTagRow?.join(',') !== 'glossStart,glossCount,misc,field,dialect' ||
    !index?.senseTagVocabulary?.misc ||
    !index?.senseTagVocabulary?.field ||
    !index?.senseTagVocabulary?.dialect ||
    !Array.isArray(index.entries) ||
    coreLoad.value?.schemaVersion !== 3 ||
    coreLoad.value?.senseTagLayout?.join(',') !==
      'glossStart,glossCount,misc,field,dialect' ||
    !coreLoad.value?.senseTags ||
    !coreLoad.value?.words
  ) {
    throw new Error('dictionary worker received an unsupported index');
  }
  let previousSeq = -1;
  for (const row of index.entries) {
    previousSeq = validateRow(row, previousSeq, index.senseTagVocabulary);
  }
  dictionaryEntries = index.entries;
  delete index.entries;
  dictionaryMetadata = index;
  coreWords = coreLoad.value.words;
  return {
    metadata: dictionaryMetadata,
    performance: {
      mode: 'worker',
      indexBytes: indexLoad.bytes,
      indexFetchMs: indexLoad.fetchMs,
      indexReadMs: indexLoad.readMs,
      indexParseMs: indexLoad.parseMs,
      coreBytes: coreLoad.bytes,
      coreParseMs: coreLoad.parseMs,
      readyMs: performance.now() - started,
      entries: dictionaryEntries.length,
      mainThreadIndexEntries: 0,
    },
  };
}

function rowBySeq(seq) {
  const target = Number(seq);
  if (!Number.isFinite(target) || !dictionaryEntries) return null;
  let low = 0;
  let high = dictionaryEntries.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const value = Number(dictionaryEntries[middle][0]);
    if (value === target) return dictionaryEntries[middle];
    if (value < target) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}

function formRowScore(form, row) {
  const [, head, , , written, kana, , , common] = row;
  const core = coreWords?.[form];
  const match = dictionaryCoreMatch(form, row);
  return (
    Number(match.compatible) * 32 +
    Number(match.gloss) * 16 +
    Number(match.reading) * 8 +
    Number(head === form) * 2 +
    Number(common) +
    Number(!!core?.alt && [...written, ...kana].includes(core.alt))
  );
}

function rowsForForm(form) {
  const key = String(form || '');
  if (!key || !dictionaryEntries) return [];
  if (formRowsCache.has(key)) return formRowsCache.get(key);
  const rows = [];
  for (const row of dictionaryEntries) {
    if (row[1] === key || row[4].includes(key) || row[5].includes(key)) rows.push(row);
  }
  rows.sort(
    (left, right) =>
      formRowScore(key, right) - formRowScore(key, left) ||
      Number(left[0]) - Number(right[0]),
  );
  formRowsCache.set(key, rows);
  return rows;
}

function collectFormRow(buckets, form, row) {
  const rows = buckets.get(form);
  // A form can be repeated across head, written, and kana columns. The old
  // rowsForForm predicate emitted a row once, so retain that exact behavior.
  if (rows && rows[rows.length - 1] !== row) rows.push(row);
}

function rowsForForms(forms) {
  const keys = [...new Set((forms || []).map((form) => String(form || '')).filter(Boolean))];
  const rowsByForm = new Map();
  const uncached = new Map();
  let cacheHits = 0;
  for (const key of keys) {
    if (formRowsCache.has(key)) {
      rowsByForm.set(key, formRowsCache.get(key));
      cacheHits += 1;
    } else {
      const rows = [];
      rowsByForm.set(key, rows);
      uncached.set(key, rows);
    }
  }

  let familyPassRows = 0;
  if (uncached.size && dictionaryEntries) {
    for (const row of dictionaryEntries) {
      familyPassRows += 1;
      collectFormRow(uncached, row[1], row);
      for (const form of row[4]) collectFormRow(uncached, form, row);
      for (const form of row[5]) collectFormRow(uncached, form, row);
    }
    for (const [key, rows] of uncached) {
      rows.sort(
        (left, right) =>
          formRowScore(key, right) - formRowScore(key, left) ||
          Number(left[0]) - Number(right[0]),
      );
      formRowsCache.set(key, rows);
    }
  }

  return {
    formRows: keys.map((key) => [key, rowsByForm.get(key)]),
    familyPassRows,
    familyCount: keys.length,
    familyCacheHits: cacheHits,
  };
}

// "Did you mean" (port of origin/agent/bunki-pillars-dict-srs 82d04591d, near-miss.ts and romaji.ts): asked only when a
// search found nothing. A romaji query is compared as Latin against romanised readings (jikna → jikan is one swap, but
// jikna read as kana is じkな, two edits from じかん); a kana query against readings; a kanji query against spellings.
// Damerau–Levenshtein (adjacent swaps count one), bounded: no suggestion for a query of one or two characters, one edit
// up to six, two beyond. English glosses are never compared: a gloss that misses has missed by meaning, not spelling.
const NEAR_MISS_LIMIT = 5;
const ROMA = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'wo', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'vu',
};
const SMALL_Y = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
const SMALL_V = { ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゎ: 'a' };
/** Hepburn as a learner types it (wapuro): しゃ sha, っか kka, っち tchi, ー repeats its vowel, を wo. */
function kanaToRomaji(value) {
  const kana = kataToHira(value);
  let out = '';
  let previous = '';
  let double = false;
  for (const character of kana) {
    const syllable = ROMA[character];
    if (syllable !== undefined) {
      out += double ? (syllable.startsWith('ch') ? 't' : syllable[0]) + syllable : syllable;
      previous = syllable;
      double = false;
      continue;
    }
    double = false;
    const y = SMALL_Y[character];
    const v = SMALL_V[character];
    if (y && previous.endsWith('i')) {
      // きゃ kya, but しゃ sha, ちゃ cha, じゃ ja
      out = out.slice(0, -1) + (previous === 'shi' || previous === 'chi' || previous === 'ji' ? y : `y${y}`);
    } else if (v && 'aiueo'.includes(previous.slice(-1)) && previous) {
      // ふぁ fa, てぃ ti, ちぇ che, but うぃ wi
      out = out.slice(0, -1) + (previous === 'u' ? `w${v}` : v);
    } else if (character === 'っ') double = true;
    else if (character === 'ー') out += 'aiueo'.includes(out.slice(-1)) ? out.slice(-1) : '';
    else out += y ? `y${y}` : v || character;
    previous = '';
  }
  return out;
}
const MACRONS = { ā: 'aa', ī: 'ii', ū: 'uu', ē: 'ee', ō: 'ou', â: 'aa', î: 'ii', û: 'uu', ê: 'ee', ô: 'ou' };

/** A string's characters as 32 bits (a letter, or a code point folded to 5 bits), and a second word for the characters
 * it holds twice. A character the other string lacks (or holds once where this one holds it twice) needs an edit of its
 * own, so more such bits than the edits allowed rule the pair out before any distance is measured. */
function letterMasks(text) {
  let once = 0;
  let twice = 0;
  for (let i = 0; i < text.length; i += 1) {
    const bit = 1 << (text.charCodeAt(i) & 31);
    twice |= once & bit;
    once |= bit;
  }
  return [once, twice];
}
function bitCount(value) {
  let x = value - ((value >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

const nearIndex = {};
/** One lane's strings filed by length, built once, on the first near-miss ask that needs it: every reading romanised
 * (latin), every reading (kana), every spelling with a kanji (written). */
function nearMissIndex(lane) {
  if (nearIndex[lane]) return nearIndex[lane];
  const buckets = new Map();
  const file = (text, at, form) => {
    if (!text || text.length > 40) return;
    let bucket = buckets.get(text.length);
    if (!bucket) buckets.set(text.length, (bucket = { text: [], at: [], form: [], once: [], twice: [] }));
    const [once, twice] = letterMasks(text);
    bucket.text.push(text);
    bucket.at.push(at);
    bucket.form.push(form);
    bucket.once.push(once);
    bucket.twice.push(twice);
  };
  dictionaryEntries.forEach((row, at) => {
    if (lane === 'written') {
      for (const form of new Set([row[1], ...row[4]])) if (/[\u3400-\u9fff]/.test(form)) file(form, at, form);
      return;
    }
    for (const reading of new Set(row[5].map(kataToHira))) file(lane === 'latin' ? kanaToRomaji(reading) : reading, at, reading);
  });
  nearIndex[lane] = buckets;
  return buckets;
}

const OSA = [new Int32Array(64), new Int32Array(64), new Int32Array(64)];
/** Optimal-string-alignment distance, abandoned (limit + 1) as soon as no path can stay within `limit`. */
function nearDistance(a, b, limit) {
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > limit || m >= 63) return limit + 1;
  let two = OSA[0];
  let previous = OSA[1];
  let current = OSA[2];
  for (let j = 0; j <= m; j += 1) previous[j] = j;
  for (let i = 1; i <= n; i += 1) {
    const ai = a.charCodeAt(i - 1);
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j <= m; j += 1) {
      const bj = b.charCodeAt(j - 1);
      let value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (ai === bj ? 0 : 1));
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj && two[j - 2] + 1 < value) value = two[j - 2] + 1;
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    const spent = two;
    two = previous;
    previous = current;
    current = spent;
  }
  return previous[m];
}

/** At most five entries a mistyped query probably meant, nearest first, then common words, then JLPT words. */
function nearMisses(context) {
  if (!dictionaryEntries) return [];
  const q = String(context?.q || '').trim();
  let lane = 'written';
  let needle = q;
  if (!context?.hasKanji && context?.hasKana) {
    lane = 'kana';
    needle = kataToHira(q);
  } else if (!context?.hasKanji) {
    lane = 'latin';
    needle = q.toLowerCase().replace(/[āīūēōâîûêô]/g, (c) => MACRONS[c]).replace(/[\s'-]/g, '');
    if (!/^[a-z]+$/.test(needle)) return [];
  }
  const edits = needle.length <= 2 ? 0 : needle.length <= 6 ? 1 : 2;
  if (!edits) return [];
  const index = nearMissIndex(lane);
  const best = new Map();
  const [once, twice] = letterMasks(needle);
  for (let length = needle.length - edits; length <= needle.length + edits; length += 1) {
    const bucket = index.get(length);
    if (!bucket) continue;
    const ones = bucket.once;
    const twos = bucket.twice;
    for (let k = 0; k < bucket.text.length; k += 1) {
      if (bitCount(once & ~ones[k]) + bitCount(twice & ~twos[k]) > edits ||
        bitCount(ones[k] & ~once) + bitCount(twos[k] & ~twice) > edits) continue;
      const distance = nearDistance(needle, bucket.text[k], edits);
      if (distance > edits) continue;
      const at = bucket.at[k];
      const prior = best.get(at);
      if (!prior || distance < prior.distance) best.set(at, { at, distance, form: bucket.form[k], text: bucket.text[k] });
    }
  }
  const prefix = (text) => { let i = 0; while (i < text.length && text[i] === needle[i]) i += 1; return i; };
  const ranked = [...best.values()].map((hit) => {
    const row = dictionaryEntries[hit.at];
    return { ...hit, row, common: row[8] ? 0 : 1, jlpt: jlptRank(coreWords?.[row[1]]?.jlpt), spread: Math.abs(hit.text.length - needle.length), shared: prefix(hit.text) };
  });
  ranked.sort((left, right) =>
    left.distance - right.distance || left.common - right.common || left.jlpt - right.jlpt ||
    left.spread - right.spread || right.shared - left.shared || Number(left.row[0]) - Number(right.row[0]));
  return ranked.slice(0, NEAR_MISS_LIMIT).map(({ row, form, distance }) => {
    const summaries = dictionaryReadingSummaries(row);
    const summary = lane === 'written'
      ? summaries.find((item) => dictionaryReadingSupportsForm(row, item[0], form))
      : summaries.find((item) => kataToHira(item[0]) === form);
    const [reading, displayHead, gloss] = summary
      ? (lane === 'written' ? [summary[0], form, summary[2]] : summary)
      : [row[2] || '', row[1] || '', row[3] || ''];
    const head = displayHead || row[1];
    return {
      result: { t: 'word', id: head, seq: row[0], reading: reading || row[2] || '', w: head, r: reading || row[2] || '', g: gloss || row[3] || '', matchedGloss: gloss || row[3] || '' },
      distance,
    };
  });
}

function scoreDictionary(context, matchingCoreIds) {
  if (!dictionaryEntries) throw new Error('dictionary worker is not ready');
  const started = performance.now();
  const { q, hasKanji, hasKana, qh, qk, ql, qn } = context;
  const coreIds = new Set(matchingCoreIds || []);
  const compatibleCoreIds = new Set();
  const scored = [];
  const inflections = new Set(
    (Array.isArray(context.inflections) ? context.inflections : [])
      .map((form) => String(form || ''))
      .filter(Boolean),
  );
  const inflected = [];
  let exact = false;
  for (const row of dictionaryEntries) {
    const [seq, head, reading, firstGloss, written, kana, glosses, normalGlosses, common] = row;
    const summaries = dictionaryReadingSummaries(row);
    const defaultSummary = [reading || '', head || '', firstGloss || ''];
    let matchedSummary = defaultSummary;
    let score = -1;
    let tie = common ? 0 : 6;
    if (hasKanji) {
      const matchedWritten =
        written.find((form) => form === q) ||
        written.find((form) => form.startsWith(q)) ||
        written.find((form) => form.includes(q));
      if (matchedWritten) {
        score = matchedWritten === q ? 100 : matchedWritten.startsWith(q) ? 80 : 60;
        const permitted = summaries.find((summary) =>
          dictionaryReadingSupportsForm(row, summary[0], matchedWritten));
        if (permitted) matchedSummary = [permitted[0], matchedWritten, permitted[2]];
      }
    } else if (hasKana) {
      const exact = summaries.find((summary) => kataToHira(summary[0]) === qh);
      const prefix = exact
        ? null
        : summaries.find((summary) => kataToHira(summary[0]).startsWith(qh));
      if (exact) {
        score = 100;
        matchedSummary = exact;
      } else if (prefix) {
        score = 80;
        matchedSummary = prefix;
      } else if (
        written.some((form) => form.includes(q)) ||
        kana.some((form) => form.includes(q) || form.includes(qh) || form.includes(qk))
      ) {
        score = 60;
        matchedSummary =
          summaries.find((summary) => kataToHira(summary[0]).includes(qh)) ||
          defaultSummary;
      }
    } else {
      if (qh) {
        const exact = summaries.find((summary) => kataToHira(summary[0]) === qh);
        const prefix = exact
          ? null
          : summaries.find((summary) => kataToHira(summary[0]).startsWith(qh));
        if (exact) {
          score = 95;
          matchedSummary = exact;
        } else if (prefix) {
          score = 75;
          matchedSummary = prefix;
        }
      }
      const glossIndex = qn ? normalGlosses.indexOf(qn) : -1;
      const glossExact = glossIndex >= 0 ? dictionaryGlossSummary(row, glossIndex) : null;
      const exact = glossIndex === 0 ? 92 : glossIndex > 0 ? 85 : -1;
      if (exact > score) {
        score = exact;
        if (glossExact) matchedSummary = glossExact;
        tie += glossIndex * 10 + jlptRank(coreWords?.[head]?.jlpt);
      }
      if (score < 92) {
        let boundaryIndex = -1;
        let anywhereIndex = -1;
        for (let glossIndex = 0; glossIndex < glosses.length; glossIndex += 1) {
          const gloss = glosses[glossIndex];
          const searchable = /[A-Z]/.test(gloss) ? gloss.toLowerCase() : gloss;
          const at = searchable.indexOf(ql);
          if (at === 0 || (at > 0 && ' ;('.includes(searchable[at - 1]))) {
            boundaryIndex = glossIndex;
            break;
          }
          if (at > 0 && anywhereIndex < 0) anywhereIndex = glossIndex;
        }
        if (boundaryIndex >= 0) {
          score = Math.max(score, 70);
          matchedSummary = dictionaryGlossSummary(row, boundaryIndex) || matchedSummary;
        } else if (anywhereIndex >= 0) {
          score = Math.max(score, 40);
          matchedSummary = dictionaryGlossSummary(row, anywhereIndex) || matchedSummary;
        }
      }
    }
    if (score < 0) {
      // The same finite candidate spellings the main thread sends for the
      // inline/core path; a candidate is kept only when this row actually has
      // that spelling or reading. No row, no result.
      if (inflections.size) {
        const matchedForm =
          (inflections.has(head) || inflections.has(kataToHira(head)) ? head : '') ||
          written.find((form) => inflections.has(form) || inflections.has(kataToHira(form))) ||
          kana.find((form) => inflections.has(kataToHira(form)) || inflections.has(form));
        if (matchedForm) {
          const [matchedReading, displayHead, matchedGloss] =
            summaries.find(([, summaryHead]) =>
              summaryHead === matchedForm || kataToHira(summaryHead) === matchedForm) ||
            summaries.find(([summaryReading]) => kataToHira(summaryReading) === matchedForm) ||
            defaultSummary;
          inflected.push({
            result: {
              t: 'word',
              id: displayHead || head,
              seq,
              reading: matchedReading || reading || '',
              w: displayHead || head,
              r: matchedReading || reading || '',
              g: matchedGloss || firstGloss || '',
              matchedGloss: matchedGloss || firstGloss || '',
              inflection: true,
            },
            score: 34,
            tie: common ? 0 : 6,
          });
        }
      }
      continue;
    }
    if (score >= 90) exact = true;

    if (coreIds.size) {
      const forms = new Set([head, ...written, ...kana]);
      for (const form of forms) {
        if (coreIds.has(form) && dictionaryCoreMatch(form, row).compatible) {
          compatibleCoreIds.add(form);
        }
      }
    }
    const [matchedReading, displayHead, matchedGloss] = matchedSummary;
    scored.push({
      result: {
        t: 'word',
        id: displayHead || head,
        seq,
        reading: matchedReading || reading || '',
        w: displayHead || head,
        r: matchedReading || reading || '',
        g: matchedGloss || firstGloss || '',
        matchedGloss: matchedGloss || firstGloss || '',
      },
      score,
      tie,
    });
  }
  if (!exact) scored.push(...inflected);
  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.tie - right.tie ||
      left.result.w.length - right.result.w.length,
  );
  const results = scored.slice(0, 40);
  const scannedAt = performance.now();
  const near = results.length ? [] : nearMisses(context);
  const nearMissMs = performance.now() - scannedAt;
  const forms = [...new Set([...results, ...near].map((item) => item.result.id))];
  const families = rowsForForms(forms);
  return {
    results,
    nearMisses: near,
    compatibleCoreIds: [...compatibleCoreIds],
    formRows: families.formRows,
    performance: {
      query: q,
      scanAndRankMs: scannedAt - started,
      nearMissMs,
      matchedEntries: scored.length,
      returnedEntries: results.length,
      returnedForms: forms.length,
      familyPassRows: families.familyPassRows,
      familyCount: families.familyCount,
      familyCacheHits: families.familyCacheHits,
    },
  };
}

function respond(id, generation, result) {
  self.postMessage({ id, generation, ok: true, result });
}

function reject(id, generation, error) {
  self.postMessage({
    id,
    generation,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  const { id, generation = 0, type } = message;
  try {
    if (type === 'init') {
      respond(id, generation, await initialise(message.indexUrl, message.coreUrl));
    } else if (type === 'search') {
      respond(id, generation, scoreDictionary(message.context, message.matchingCoreIds));
    } else if (type === 'rowBySeq') {
      respond(id, generation, { row: rowBySeq(message.seq) });
    } else if (type === 'rowsForForm') {
      respond(id, generation, { form: String(message.form || ''), rows: rowsForForm(message.form) });
    } else {
      throw new Error(`unknown dictionary worker request ${JSON.stringify(type)}`);
    }
  } catch (error) {
    reject(id, generation, error);
  }
});

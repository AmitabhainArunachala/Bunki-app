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

function validateRow(row, previousSeq) {
  if (
    !Array.isArray(row) ||
    row.length < 12 ||
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
    index?.schemaVersion !== 2 ||
    index?.shardCount !== 16 ||
    index?.sharding?.id !== 'fnv1a32-ascii-seq-mask15' ||
    index.sharding.shardCount !== index.shardCount ||
    !Array.isArray(index.entries) ||
    !coreLoad.value?.words
  ) {
    throw new Error('dictionary worker received an unsupported index');
  }
  let previousSeq = -1;
  for (const row of index.entries) previousSeq = validateRow(row, previousSeq);
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

function scoreDictionary(context, matchingCoreIds) {
  if (!dictionaryEntries) throw new Error('dictionary worker is not ready');
  const started = performance.now();
  const { q, hasKanji, hasKana, qh, qk, ql, qn } = context;
  const coreIds = new Set(matchingCoreIds || []);
  const compatibleCoreIds = new Set();
  const scored = [];
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
    if (score < 0) continue;

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
  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.tie - right.tie ||
      left.result.w.length - right.result.w.length,
  );
  const results = scored.slice(0, 40);
  const forms = [...new Set(results.map((item) => item.result.id))];
  const families = rowsForForms(forms);
  return {
    results,
    compatibleCoreIds: [...compatibleCoreIds],
    formRows: families.formRows,
    performance: {
      query: q,
      scanAndRankMs: performance.now() - started,
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

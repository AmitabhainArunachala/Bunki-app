/** G3 dictionary seam — declarations moved verbatim from ../corridor.js (pure move, no body edits). */
import { ANNOTATION_DIGITS, D, DICTIONARY_INDEX_PATH, DICTIONARY_SHARD_PATH, EXAMPLE_DIR, GLOSS_LEAD, GLOSS_MESSY, GODAN_ROW, GODAN_TE, JOYO_MARKS, KATA_TO_HIRA_OFFSET, LEMMA_NIDAN, LEMMA_ONBIN, LOOKUP_HELPER_POS, PARTICLE_BY_SURFACE, PART_WRITTEN, POS_FAMILY, POS_PLAIN, POS_SEGMENT_CODE, READER_KANA, REL, ROMAJI, ROOM_NAMES, S, SENSE_BY_ANCHOR, SENSE_CLASS, SENSE_GAVE_UP, SENSE_LATE, SENSE_MUST_END, SENSE_MUST_NOT, SENSE_NUMBER, SENSE_NUMBER_WORD, SENSE_TAG_EN, SENSE_TAG_JA, SENSE_WAIT_MS, SENSE_WEEKDAY, SHORT_EXAMPLE_CHARS, SLIP_OWN_MEANING, SOUND_PLAIN, SOUND_VOICED, TE_FORM_AUXILIARY, TE_FORM_NOTE, THES_RELS, TOKEN_CONTEXT, YOMI_DAKUTEN, YOMI_HANDAKU, afterPressLands, annotationKana, back, bi, boxLeadGloss, cacheDictionaryFormRows, cacheDictionaryRow, dictionaryQueryOpening, dictionaryReadingSummaries, dictionaryRowBySeq, dictionaryWorkerRequest, diveFromMini, el, ensureDictionaryIndex, ensureDictionaryShard, ensureSenseSidecar, fetchData, findLookupOccurrence, go, heroSource, installProseWordRoving, jaGroupSegments, kataToHira, lookupWordKey, nonEmptyString, openJapaneseLookup, ownSentenceExample, passage, placeKinsoku, proseWordRovers, quietUsageTags, readerReadingFits, readerTokenLead, refreshWordSheet, renderWordWeb, senseGlosses, senseLed, senseNumberBefore, sensePatch, senseWeekdayBracket, setGlossLine, setLookupStop, tx, waitForLookupNameReadings, wireReaderWordMenu, withEn, yomiVariantCache } from '../corridor.js';
import { readerQuickRecord, readerQuickRecordAsRead, readerTakeCurrent, seatGlossRow, seatInlineGloss, setTouchReadingShown } from './capture.mjs';
import { libraryDiscoverable, readerReadingMissText } from './library.mjs';
import { learnerSourceLabel } from './study-host.mjs';
import { aiTeachingSubject } from './teacher.mjs';
import { recordNoteExpected } from './voice.mjs';
import { note, wordSaveFacts } from './word-entry.mjs';
import { GRAMMARS, beyondJoyo } from './worlds.mjs';

function lookup(id, seq = null, requestedReading = '', requestedGloss = '') {
  const full = D.dict[id];
  // Reader and lesson tokens were editorially resolved into the boot core.
  // Opening the larger index must never make their immediate reading/meaning
  // jump to a different homograph merely because its ent_seq sorts first.
  // R · that holds with no reading asked, or the core's own. A reading the
  // text gives that the core does not carry (年 read ねん in 令和8年; the
  // core's 年 is とし) names the full dictionary's first entry read that way
  // once the form's rows are at hand; with none at hand the core answers, and
  // its caller sees that the two readings differ.
  const wanted = !seq && full && requestedReading ? kataToHira(String(requestedReading)) : '';
  const readAs = wanted && wanted !== kataToHira(String(full.r || ''))
    ? dictionaryRowsForForm(id).find((row) => dictionaryReadingSummaries(row).some((summary) =>
      kataToHira(summary[0]) === wanted && dictionaryReadingSupportsForm(row, summary[0], id))) || null
    : null;
  if (!seq && full && !readAs) {
    return { head: id, r: full.r, m: full.m, p: full.p, jlpt: full.jlpt, k: full.k || [], alt: full.alt };
  }
  const indexed = seq ? dictionaryRowBySeq(seq) : readAs || dictionaryRowsForForm(id)[0];
  if (indexed) {
    const [entrySeq, defaultHead, defaultReading, defaultGloss, written, kana, glosses] = indexed;
    const glossIndex = requestedGloss
      ? indexed[6]?.findIndex((gloss) => normalizeGloss(gloss) === normalizeGloss(requestedGloss))
      : -1;
    const glossSummary = glossIndex >= 0 ? dictionaryGlossSummary(indexed, glossIndex) : null;
    const requestedSummary =
      glossSummary && (!requestedReading || kataToHira(glossSummary[0]) === kataToHira(requestedReading))
        ? glossSummary
        : dictionarySummaryFor(indexed, requestedReading, id);
    const [reading, head, firstGloss] = requestedSummary ||
      dictionarySummaryFor(indexed, requestedReading, id) || [defaultReading, defaultHead, defaultGloss];
    const core = D.dict[id] || D.dict[head];
    const orderedMeanings = firstGloss
      ? [firstGloss, ...(glosses || []).filter((gloss) => gloss !== firstGloss)]
      : glosses || [];
    return {
      seq: entrySeq,
      head,
      r: reading,
      m: orderedMeanings,
      p: core?.p,
      jlpt: core?.jlpt,
      k: [...head].filter((c) => /[一-鿌々]/.test(c)),
      alt: written?.find((form) => form !== head) || null,
      written: written || [],
      kana: kana || [],
    };
  }
  // A word taken from the deep tier keeps a snapshot in the record itself, so
  // reviews and lists resolve it on any device without re-opening the index.
  const kept = !seq && S.deepWords ? S.deepWords[id] : null;
  if (kept) {
    return {
      head: id,
      r: kept.r || '',
      m: kept.m || [],
      p: kept.p,
      jlpt: kept.jlpt,
      k: kept.k || [...id].filter((c) => /[一-鿌々]/.test(c)),
      alt: kept.alt,
    };
  }
  // A stable JMdict sequence names one lexical entry, not merely its printed
  // spelling. Falling back to the spelling-keyed core here would silently
  // answer a homograph with whichever sense happened to win the legacy bundle.
  if (seq != null && seq !== '') return null;
  const old = D.words[id];
  if (old) return { head: id, r: old.r, m: old.g ? [old.g] : [], jlpt: old.jlpt, k: old.k || [] };
  return null;
}

function embeddedDictionaryJson(name) {
  const node = document.getElementById(`corridor-dictionary-${name}`);
  if (!node) return null;
  const parsed = JSON.parse(node.textContent);
  // The standalone keeps source bytes in inert nodes for self-containment.
  // Once a file has become real JS data, retaining the raw text as well would
  // nearly double its phone-memory cost.
  node.remove();
  return parsed;
}

async function loadDictionaryJson(name) {
  const embedded = embeddedDictionaryJson(name);
  if (embedded) return embedded;
  const path = name === 'index' ? DICTIONARY_INDEX_PATH : DICTIONARY_SHARD_PATH(name);
  const res = await fetchData(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function hasEmbeddedDictionaryIndex() {
  return window.__CORRIDOR_STANDALONE__ === true || !!document.getElementById('corridor-dictionary-index');
}

function dictionaryCoreMatch(form, row) {
  const core = D.dict?.[form];
  if (!core) return { compatible: false, reading: false, gloss: false };
  const coreGlosses = new Set((core.m || []).map(normalizeGloss));
  const summaries = dictionaryReadingSummaries(row)
    .filter((summary) => dictionaryReadingSupportsForm(row, summary[0], form))
    .map((summary) => [summary[0], form, summary[2]]);
  const reading = summaries.some((summary) => !!core.r && kataToHira(core.r) === kataToHira(summary[0]));
  const gloss = summaries.some((summary) => !!summary[2] && coreGlosses.has(normalizeGloss(summary[2])));
  const compatible = summaries.some(
    (summary) =>
      !!core.r &&
      kataToHira(core.r) === kataToHira(summary[0]) &&
      !!summary[2] &&
      coreGlosses.has(normalizeGloss(summary[2])),
  );
  return { compatible, reading, gloss };
}

function dictionaryGlossSummary(row, glossIndex) {
  if (!Array.isArray(row) || !Number.isInteger(glossIndex) || glossIndex < 0) return null;
  const glosses = Array.isArray(row[6]) ? row[6] : [];
  const kana = Array.isArray(row[5]) ? row[5] : [];
  const encoded = Array.isArray(row[10]) ? row[10] : [];
  const mapping = encoded[glossIndex];
  if (
    glossIndex >= glosses.length ||
    !Array.isArray(mapping) ||
    !Number.isInteger(mapping[0]) ||
    mapping[0] < 0 ||
    mapping[0] >= kana.length
  ) {
    return null;
  }
  return [kana[mapping[0]] || row[2] || '', mapping[1] || row[1] || '', glosses[glossIndex] || row[3] || ''];
}

function dictionaryReadingSupportsForm(row, reading, form) {
  if (!Array.isArray(row) || !form) return false;
  const kana = Array.isArray(row[5]) ? row[5] : [];
  const kanaIndex = kana.findIndex((candidate) => kataToHira(candidate) === kataToHira(reading || ''));
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

function dictionarySummaryFor(row, requestedReading = '', requestedHead = '') {
  const summaries = dictionaryReadingSummaries(row);
  if (!summaries.length) return null;
  const reading = kataToHira(requestedReading || '');
  if (reading) {
    const exact = summaries.find(
      (summary) =>
        kataToHira(summary[0]) === reading &&
        (!requestedHead || dictionaryReadingSupportsForm(row, summary[0], requestedHead)),
    );
    if (exact) return requestedHead ? [exact[0], requestedHead, exact[2]] : exact;
    return summaries.find((summary) => kataToHira(summary[0]) === reading) || summaries[0];
  }
  const forHead = requestedHead
    ? summaries.find((summary) => dictionaryReadingSupportsForm(row, summary[0], requestedHead))
    : null;
  return forHead ? [forHead[0], requestedHead, forHead[2]] : summaries[0];
}

function validDictionaryRow(row, previousSeq = -1) {
  return (
    Array.isArray(row) &&
    row.length >= 12 &&
    /^\d+$/.test(String(row[0])) &&
    Array.isArray(row[4]) &&
    Array.isArray(row[5]) &&
    Array.isArray(row[6]) &&
    Array.isArray(row[7]) &&
    Array.isArray(row[9]) &&
    Array.isArray(row[10]) &&
    Array.isArray(row[11]) &&
    row[10].length === row[6].length &&
    row[11].length === row[5].length &&
    Number(row[0]) > previousSeq
  );
}

function dictionaryRowsForForm(form) {
  if (!D.dictionaryIndex || !form) return [];
  const key = String(form);
  if (D.dictionaryCompleteForms?.has(key) && D.dictionaryByForm?.has(key)) {
    return D.dictionaryByForm.get(key);
  }
  if (!Array.isArray(D.dictionaryIndex.entries)) return [];
  const rows = [];
  for (const row of D.dictionaryIndex.entries) {
    if (row[1] === key || row[4].includes(key) || row[5].includes(key)) rows.push(row);
  }
  const core = D.dict?.[key];
  const score = (row) => {
    const [, head, , , written, kana, , , common] = row;
    const match = dictionaryCoreMatch(key, row);
    return (
      Number(match.compatible) * 32 +
      Number(match.gloss) * 16 +
      Number(match.reading) * 8 +
      Number(head === key) * 2 +
      Number(common) +
      Number(!!core?.alt && [...written, ...kana].includes(core.alt))
    );
  };
  rows.sort((left, right) => score(right) - score(left) || Number(left[0]) - Number(right[0]));
  D.dictionaryByForm.set(key, rows);
  D.dictionaryCompleteForms?.add(key);
  return rows;
}

async function ensureDictionaryRowBySeq(seq) {
  await ensureDictionaryIndex();
  const cached = dictionaryRowBySeq(seq);
  if (cached || D.dictionaryMode === 'main') return cached;
  const message = await dictionaryWorkerRequest('rowBySeq', { seq: String(seq) });
  return message.result.row ? cacheDictionaryRow(message.result.row) : null;
}

async function ensureDictionaryRowsForForm(form) {
  await ensureDictionaryIndex();
  const key = String(form || '');
  if (!key) return [];
  if (D.dictionaryCompleteForms?.has(key) || D.dictionaryMode === 'main') {
    return dictionaryRowsForForm(key);
  }
  const message = await dictionaryWorkerRequest('rowsForForm', { form: key });
  if (message.result.form !== key) throw new Error('dictionary worker returned the wrong form');
  return cacheDictionaryFormRows(key, message.result.rows);
}

async function ensureDictionaryRowsForNode(node) {
  if (!node) return [];
  if (node.seq) {
    const row = await ensureDictionaryRowBySeq(node.seq);
    return row ? [row] : [];
  }
  const rows = await ensureDictionaryRowsForForm(node.id);
  if (node.reading && rows.length) {
    const reading = kataToHira(node.reading);
    const chosen = rows.find((row) =>
      dictionaryReadingSummaries(row).some(
        (summary) =>
          kataToHira(summary[0]) === reading && dictionaryReadingSupportsForm(row, summary[0], node.id),
      ),
    );
    if (chosen) node.dictionaryResolvedSeq = String(chosen[0]);
  }
  // R · a core spelling's node carrying a reading the core does not becomes the entry that reading names (or the
  // closest), so its header, senses and Save agree once the rows are here (readingToken)
  if (!node.seq && D.dict?.[node.id] && readingAsksIndex(node.id, node.reading)) {
    const named = readingToken({ b: node.id, s: node.id, r: node.reading });
    if (named.seq) node.seq = named.seq;
  }
  return rows;
}

function dictionaryRowsFor(node) {
  if (!D.dictionaryIndex || !node) return [];
  if (node.seq) {
    const row = dictionaryRowBySeq(node.seq);
    return row ? [row] : [];
  }
  return dictionaryRowsForForm(node.id);
}

function dictionaryDetailRowsFor(node) {
  const rows = dictionaryRowsFor(node);
  if (node?.seq || !rows.length) return rows;
  const core = D.dict?.[node.id];
  const compatibleRows = core ? rows.filter((row) => dictionaryCoreMatch(node.id, row).compatible) : rows;
  if (core && !compatibleRows.length) return [];
  if (compatibleRows.length <= 1) return compatibleRows;
  const chosen =
    compatibleRows.find((row) => String(row[0]) === String(node.dictionaryResolvedSeq || '')) ||
    compatibleRows[0];
  if (chosen) node.dictionaryResolvedSeq = String(chosen[0]);
  return chosen ? [chosen] : [];
}

function dictionaryShardNumber(seq) {
  let hash = 0x811c9dc5;
  for (const character of String(seq)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash & (D.dictionaryIndex.shardCount - 1);
}

function dictionaryShardId(seq) {
  return dictionaryShardNumber(seq).toString(16).padStart(2, '0');
}

async function ensureDictionaryDetails(node) {
  await ensureDictionaryIndex();
  await ensureDictionaryRowsForNode(node);
  const rows = dictionaryDetailRowsFor(node);
  const shards = [...new Set(rows.map((row) => dictionaryShardId(row[0])))];
  await Promise.all(shards.map(ensureDictionaryShard));
  return rows.map((row) => D.dictionaryDetails?.get(String(row[0]))).filter(Boolean);
}

function dictionaryDetailsFor(node) {
  return dictionaryDetailRowsFor(node)
    .map((row) => D.dictionaryDetails?.get(String(row[0])))
    .filter(Boolean);
}

function dictionaryTag(tag) {
  const pos = POS_PLAIN[tag] || POS_FAMILY.find(([family]) => family.test(tag))?.[1];
  if (pos) return tx(pos[0], pos[1]);
  const description = D.dictionaryIndex?.tags?.[tag] || tag;
  return tx(SENSE_TAG_JA[tag] || description, SENSE_TAG_EN[tag] || description);
}

function posCode(tag) {
  return POS_PLAIN[tag] || POS_FAMILY.some(([family]) => family.test(tag)) ? tag : POS_SEGMENT_CODE[tag] || tag;
}

function posLine(tags) {
  const codes = tags.map(posCode);
  const verbClass = codes.some((code) => /^v5/u.test(code)) ? 'v5' : codes.some((code) => /^v1($|-)/u.test(code)) ? 'v1'
    : codes.some((code) => /^v2/u.test(code)) ? 'v2' : codes.some((code) => /^v4/u.test(code)) ? 'v4' : null;
  const transitivity = ['vi', 'vt'].filter((code) => codes.includes(code));
  const jaTrans = transitivity.map((code) => (code === 'vi' ? '自動詞' : '他動詞')).join('・');
  const enTrans = transitivity.map((code) => (code === 'vi' ? 'intransitive' : 'transitive')).join(' and ');
  const suru = codes.some((code) => /^vs($|-)/u.test(code));
  const kuru = codes.includes('vk');
  const zuru = codes.includes('vz');
  const auxVerb = codes.includes('aux-v');
  const JA_CLASS = { v5: '五段', v1: '一段', v2: '二段', v4: '四段' };
  const EN_CLASS = { v5: 'godan', v1: 'ichidan', v2: 'nidan', v4: 'yodan' };
  const classText = verbClass
    ? S.lang === 'ja'
      ? transitivity.length
        ? `動詞（${JA_CLASS[verbClass]}・${jaTrans}${verbClass === 'v2' || verbClass === 'v4' ? '・古語' : ''}）`
        : `${JA_CLASS[verbClass]}動詞${verbClass === 'v2' || verbClass === 'v4' ? '（古語）' : ''}`
      : `${verbClass === 'v2' || verbClass === 'v4' ? 'archaic ' : ''}${EN_CLASS[verbClass]} verb${transitivity.length ? `, ${enTrans}` : ''}`
    : null;
  const suruOwn = !verbClass && transitivity.length;
  const suruText = suru
    ? S.lang === 'ja'
      ? suruOwn ? `する動詞（${jaTrans}）` : 'する動詞'
      : `suru verb${suruOwn ? `, ${enTrans}` : ''}`
    : null;
  const kuruText = kuru
    ? S.lang === 'ja'
      ? transitivity.length ? `動詞（カ変・${jaTrans}）` : 'カ変動詞'
      : `kuru verb${transitivity.length ? `, ${enTrans}` : ''}`
    : null;
  const zuruText = zuru
    ? S.lang === 'ja'
      // Hfix-2d r3 · school grammar files 信ずる・感ずる under サ変; the label names the ずる form inside the
      // one pair of parens (no nesting, no wave dash: the JA label set is kana, kanji, parens, ・)
      ? transitivity.length ? `動詞（サ変・ずる・${jaTrans}）` : '動詞（サ変・ずる）'
      : `zuru verb${transitivity.length ? `, ${enTrans}` : ''}`
    : null;
  // 〜ていく・〜てみる: an aux-v with a class is the subsidiary verb, in that class, not a 助動詞
  const auxClass = auxVerb && (verbClass || suru || kuru || zuru)
    ? S.lang === 'ja'
      ? `補助動詞（${verbClass ? JA_CLASS[verbClass] : suru ? 'サ変' : kuru ? 'カ変' : 'サ変・ずる'}）`
      : `${verbClass ? EN_CLASS[verbClass] : suru ? 'suru' : kuru ? 'kuru' : 'zuru'} subsidiary verb`
    : null;
  const pieces = [];
  let verbsEmitted = false;
  for (const code of codes) {
    if (/^v[1254]/u.test(code) || /^vs($|-)/u.test(code) || code === 'vk' || code === 'vz') {
      if (!verbsEmitted) {
        // 〜ていく・〜てみる: the subsidiary verb stands instead of the class composite
        for (const text of auxClass ? [auxClass] : [classText, suruText, kuruText, zuruText]) if (text) pieces.push(text);
        verbsEmitted = true;
      }
      continue;
    }
    if (code === 'vi' || code === 'vt') {
      if (!verbsEmitted && !classText && !suruText && !kuruText && !zuruText && !auxClass) pieces.push(dictionaryTag(code));
      continue;
    }
    if (code === 'aux-v') {
      // alone it stays 助動詞; with a class it is the auxClass composite above; beside the copula the
      // copula's own line already says it (です・だ read 助動詞（断定） once, Hfix-2d r3)
      if (!auxClass && !codes.includes('cop')) pieces.push(dictionaryTag(code));
      continue;
    }
    if (code === 'adv' && codes.includes('adv-to')) continue; // one family once: 副詞（と） / to-adverb covers it
    pieces.push(dictionaryTag(code));
  }
  return [...new Set(pieces)].join(' · ');
}

function kanjiReadingsInWord(chars, reading, word = '') {
  const hira = String(reading || '').replace(/[\u30a1-\u30f6]/gu, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  const kata = String(reading || '').replace(/[\u3041-\u3096]/gu, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  // one candidate list per kanji, built once; w is the kana the word itself writes right after the kanji
  // (hiragana only; 々, another kanji, katakana or the word's end stop the run)
  const candLists = [];
  let wordPos = 0;
  for (const c of chars) {
    const k = D.kanji[c];
    const at = word ? word.indexOf(c, wordPos) : -1;
    const w = at < 0 ? '' : /^[ぁ-ゖ]+/u.exec(word.slice(at + 1))?.[0] || '';
    if (at >= 0) wordPos = at + 1;
    const list = [];
    if (k) {
      for (const on of k.on || []) list.push({ on: true, base: on, suffix: '', w });
      for (const kun of k.kun || []) {
        const dot = kun.indexOf('.');
        list.push({ on: false, base: dot < 0 ? kun : kun.slice(0, dot), suffix: dot < 0 ? '' : kun.slice(dot + 1), w });
      }
    }
    candLists.push(list);
  }
  // the fits at a position, longest first: a parenthesised written okurigana (書く か（く）, 三つ みっ（つ）,
  // 食べ物 た（べ） from た.べる), a plain reading, then a compound's unwritten span (試合 あい)
  const fitsFor = (i, pos) => {
    const fits = [];
    for (const cand of candLists[i]) {
      const space = (cand.on ? kata : hira).slice(pos);
      if (!cand.base || !space.startsWith(cand.base)) continue;
      if (cand.suffix) {
        if (cand.w) {
          // a dotted kun asks the word to write its okurigana — exactly it or its written first part when a
          // compound cuts it; the rest of the suffix is the stem's own grammar, not something this word writes
          if (!(cand.suffix === cand.w || cand.suffix.startsWith(cand.w))) continue;
          if (!space.startsWith(cand.w, cand.base.length)) continue;
          fits.push({ display: `${cand.base}（${cand.w}）`, consume: cand.base.length + cand.w.length, rank: 0, consumedW: true });
        } else {
          // nothing written after the kanji (a compound's inside, or 々): the kun may name the whole
          // span this kanji reads here, without claiming okurigana (試合 あい, never あ（い）)
          if (!space.startsWith(cand.suffix, cand.base.length)) continue;
          fits.push({ display: cand.base + cand.suffix, consume: cand.base.length + cand.suffix.length, rank: 2 });
        }
      } else {
        fits.push({ display: cand.base, consume: cand.base.length, rank: 1 });
      }
    }
    fits.sort((a, b) => b.consume - a.consume || a.rank - b.rank);
    const seen = new Set();
    return fits.filter((fit) => !seen.has(fit.display) && (seen.add(fit.display), true));
  };
  // a dotted kun's bare stem (死人 シ・ニン, 古巣 ふる・す, 一月 ひと・つき, 見本 み・ホン): never a greedy
  // choice — it stands only when every later kanji still matches (r4: a span may not eat the next kanji's kana)
  const stemsFor = (i, pos) => {
    const stems = [];
    for (const cand of candLists[i]) {
      if (cand.on || !cand.suffix || cand.w || !cand.base) continue;
      if (hira.slice(pos).startsWith(cand.base) && !stems.some((s) => s.display === cand.base)) stems.push({ display: cand.base, consume: cand.base.length });
    }
    return stems.sort((a, b) => b.consume - a.consume);
  };
  // the move after a fit: the reading position plus, when the fit didn't itself spend it, the kana the word
  // writes between this kanji and the next (男の人: おとこ steps の before ひと). No kana, no step.
  const advance = (i, pos, f) => {
    let mid = pos + f.consume;
    const w = candLists[i][0]?.w || '';
    if (!f.consumedW && w) {
      if (!hira.startsWith(w, mid)) return -1;
      mid += w.length;
    }
    return mid;
  };
  // a path is complete only at the end of the reading, and no kanji may match after a blank one
  // (r4 review: 男の人 is not お・と, 一生 is not い, 脱出 is not だ)
  const fullFrom = (i, pos, memo) => {
    if (i >= chars.length) return pos === hira.length;
    const key = `${i}:${pos}`;
    if (!memo.has(key)) memo.set(key, [...fitsFor(i, pos), ...stemsFor(i, pos)].some((f) => {
      const mid = advance(i, pos, f);
      return mid >= 0 && fullFrom(i + 1, mid, memo);
    }));
    return memo.get(key);
  };
  const out = [];
  let pos = 0;
  for (let i = 0; i < chars.length; i++) {
    const memo = new Map();
    const fits = hira ? fitsFor(i, pos) : [];
    let chosen = fits.find((f) => { const mid = advance(i, pos, f); return mid >= 0 && fullFrom(i + 1, mid, memo); });
    if (!chosen) chosen = stemsFor(i, pos).find((f) => { const mid = advance(i, pos, f); return mid >= 0 && fullFrom(i + 1, mid, memo); });
    if (chosen) pos = advance(i, pos, chosen);
    else if (fits[0]) pos += fits[0].consume; // no full path: the r3 greedy seat, unchanged
    out.push((chosen || fits[0]) ? (chosen || fits[0]).display : '');
  }
  return out;
}

function displayPairs(token) {
  const mode = S.dials.kanji;
  if (mode === 0) return token.f;
  if (mode === 2) {
    // all-kana converts KANJI runs to their readings and leaves kana runs
    // as written — flattening the whole token to its hiragana reading
    // rewrote katakana loanwords and proper nouns (みなみあふりか…),
    // misteaching standard orthography (P2, full-instrument review)
    if (!token.f) return [{ t: token.r || token.s }];
    return token.f.map((pair) => (pair.r ? { t: pair.r } : pair));
  }
  let before = '';
  return token.f.map((pair) => {
    let rare = false;
    for (const ch of pair.t) {
      const mark = JOYO_MARKS.test(ch);
      if (beyondJoyo(mark ? before : ch)) rare = true;
      if (!mark) before = ch;
    }
    if (!pair.r) return pair;
    return rare ? { t: pair.r } : pair;
  });
}

function inlineWordReading(anchor, reading) {
  const ruby = anchor.querySelector('ruby');
  if (ruby) {
    const hidden = [...ruby.querySelectorAll('rt.hidden-rt')];
    hidden.forEach(rt => setTouchReadingShown(rt, true));
    return () => hidden.forEach(rt => setTouchReadingShown(rt, false));
  }
  const children = [...anchor.childNodes];
  const row = el('ruby');
  row.dataset.r = reading; // the reader's floating reading paints this value
  row.append(...children);
  row.append(el('rt', null, reading));
  anchor.append(row);
  return () => { if (row.parentNode === anchor) row.replaceWith(...children); };
}

function inlineGlossLine(text, waiting = false) {
  const line = el('span', 'tok-en');
  line.append(el('span', 'tok-en-text'));
  setGlossLine(line, text, waiting);
  return line;
}

function inlineWordGloss(anchor, text) {
  return seatGlossRow(anchor, inlineGlossLine(text));
}

function inlineTokenGloss(anchor, token) {
  return seatGlossRow(anchor, tokenGlossLine(token));
}

function tokenGlossLine(token, painted = null) {
  const reading = readyTokenReading(token);
  const sensing = () => !SENSE_GAVE_UP.has(token) && !!senseChoice(token, readingTokenEntry(token))?.need;
  const settled = !reading && !sensing();
  const line = inlineGlossLine(settled ? readerTokenLead(token) : '', !settled);
  if (settled) return line;
  Promise.resolve(reading).then(() => ensureSense(token, readingTokenEntry(token))).catch(() => {}).then(() => {
    if (!line.isConnected) return;
    // what the box leads with now: the sense's gloss, or (a sense that cannot be had) the word's own meaning, as the box
    const found = readerTokenLead(token);
    setGlossLine(line, found);
    if (found) { seatInlineGloss(line); painted?.(line); }
  });
  return line;
}

function readingLine(rt) {
  // the block whose lines the word stands in: past every inline box, and past a block that is itself the inside of an
  // inline box (the reader's word is an inline-flex door around a block row: its line is the paragraph's)
  const inlineLevel = (node) => !!node && /^inline|^ruby|^contents$/.test(getComputedStyle(node).display);
  let block = rt.parentElement;
  while (block && block !== document.body && (inlineLevel(block) || inlineLevel(block.parentElement))) block = block.parentElement;
  if (!block) return null;
  const box = block.getBoundingClientRect(), cs = getComputedStyle(block);
  return { left: box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft),
    right: box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight), block };
}

function japaneseLookupRecord(text, { reading = '', pos = '', sense = null } = {}) {
  // R3 · the sense its text uses (senseChoice): an expression read whole (んだ, いけない), a name, another entry read
  // alike (もの the noun), or a sense of its own entry — its glosses first (senseRecord)
  if (sense?.door) {
    const door = sense.door;
    if (door.senseName) return senseRecord(null, door.sense);
    const rec = lookup(door.b, door.seq, door.r);
    return rec ? { ...senseRecord(rec, door.sense), head: door.b, r: door.r } : null;
  }
  const own = japaneseLookupEntryRecord(text, { reading, pos });
  if (!sense?.seq) return own;
  if (own?.seq ? String(own.seq) === sense.seq : senseIsQuick({ b: text, s: text, r: reading }, sense.seq)) return senseRecord(own, sense);
  return senseRecord(lookup(text, sense.seq, reading), sense);
}

function japaneseLookupEntryRecord(text, { reading = '', pos = '' } = {}) {
  const wanted = kataToHira(String(reading || ''));
  const fits = (value) => !wanted || kataToHira(String(value || '')) === wanted;
  if (D.dict[text] && fits(D.dict[text].r)) return lookup(text);
  const helper = LOOKUP_HELPER_POS.has(pos);
  const rows = dictionaryRowsForForm(text);
  const row = rows.find((candidate) => (candidate[1] === text || (!helper && candidate[4].includes(text))) &&
    (!wanted || dictionaryReadingSummaries(candidate).some((summary) =>
      fits(summary[0]) && dictionaryReadingSupportsForm(candidate, summary[0], text))));
  if (row) return lookup(text, row[0], wanted ? reading : '');
  if (rows.length) return null;
  const kept = lookup(text);
  return kept && fits(kept.r) ? kept : null;
}

function lookupBlockWords(block) {
  return [...block.querySelectorAll('.japanese-lookup-word')].filter(word => word.closest('[data-lookup-block]') === block);
}

function japaneseLookupHelpId() {
  let help = document.getElementById('japanese-lookup-help');
  if (!help) {
    help = el('span');
    help.id = 'japanese-lookup-help';
    help.hidden = true;
    document.body.append(help);
  }
  // G5 · Shift+F10 is a hold: it keeps the word and opens its strip, and the help says so
  help.textContent = tx('←→: 語を選ぶ · Enter: ひらく · Shift+F10: 保存とほかの操作', '←/→: choose a word · Enter: open · Shift+F10: save and more');
  return help.id;
}

function lookupOccurrence(word) {
  const item = word.dataset.lookupItem, block = word.closest('[data-lookup-block]');
  if (!item || !block) return null;
  const twins = lookupItemBlocks(item).filter(other => other.textContent === block.textContent);
  return { item, text: word.dataset.lookupText, blockText: block.textContent, block: twins.indexOf(block),
    word: lookupBlockWords(block).indexOf(word) };
}

function lookupItemBlocks(item) {
  const words = [...document.querySelectorAll('[data-lookup-item]')].filter(word => word.dataset.lookupItem === item);
  return [...new Set(words.map(word => word.closest('[data-lookup-block]')).filter(Boolean))];
}

function annotationPieceReadings(piece, tokenReadings = []) {
  const out = new Set(tokenReadings);
  if (D.dict?.[piece]?.r) out.add(annotationKana(D.dict[piece].r));
  if ([...piece].length === 1) {
    const k = D.kanji?.[piece];
    for (const name of D.annotationNameReadings?.[piece] || []) out.add(annotationKana(name));
    for (const on of k?.on || []) out.add(annotationKana(on));
    for (const kun of k?.kun || []) {
      const bare = String(kun).replace(/-/gu, '');
      out.add(annotationKana(bare.replace(/\./gu, '')));
      out.add(annotationKana(bare.split('.')[0]));
    }
    for (const reading of ANNOTATION_DIGITS[piece.replace(/[０-９]/u, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))] || []) out.add(reading);
    if (/^[\p{Script=Hiragana}\p{Script=Katakana}ー]$/u.test(piece)) out.add(annotationKana(piece));
  }
  out.delete('');
  return out;
}

function annotationReadsAs(text, end, wanted, tokenReadings, wordStarts) {
  if (!wanted) return false;
  const chars = [...text.slice(Math.max(0, end - 32), end)];
  let first = chars.length;
  while (first > 0 && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ0-9０-９]/u.test(chars[first - 1])) first--;
  const run = chars.slice(first);
  const offsets = [end];
  for (let i = run.length - 1; i >= 0; i--) offsets.unshift(offsets[0] - run[i].length);
  const reach = Array.from({ length: run.length + 1 }, () => new Set());
  reach[run.length].add(wanted.length);
  for (let i = run.length - 1; i >= 0; i--) {
    for (let k = i + 1; k <= run.length; k++) {
      if (!reach[k].size) continue;
      const own = (tokenReadings.get(offsets[i]) || []).filter(([stop]) => stop === offsets[k]).map(([, reading]) => reading);
      for (const reading of annotationPieceReadings(run.slice(i, k).join(''), own)) {
        for (const at of reach[k]) if (at >= reading.length && wanted.slice(at - reading.length, at) === reading) reach[i].add(at - reading.length);
      }
    }
    if (reach[i].has(0) && (wordStarts ? wordStarts.has(offsets[i]) : i === 0)) return true;
  }
  return false;
}

function phoneticAnnotationCandidates(text) {
  return [...String(text).matchAll(/[\p{Script=Han}々〆ヶ][（(]([\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+)[）)]/gu)]
    .map(match => [match.index + [...match[0]][0].length, match.index + match[0].length, match[1]]);
}

function phoneticAnnotationRanges(text, tokens = null) {
  const source = String(text);
  const matches = phoneticAnnotationCandidates(source);
  if (!matches.length) return [];
  const tokenReadings = new Map();
  let wordStarts = null;
  if (tokens) {
    wordStarts = new Set();
    let at = 0;
    for (const token of tokens) {
      const s = String(token.s || '');
      const reading = token.r || (/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(s) ? s : '');
      if (reading) tokenReadings.set(at, [...(tokenReadings.get(at) || []), [at + s.length, annotationKana(reading)]]);
      wordStarts.add(at);
      at += s.length;
    }
  } else if (typeof Intl.Segmenter === 'function') {
    wordStarts = new Set([...new Intl.Segmenter('ja', { granularity: 'word' }).segment(source)].map(part => part.index));
  }
  return matches
    .filter(([open, , inner]) => annotationReadsAs(source, open, annotationKana(inner), tokenReadings, wordStarts))
    .map(([open, close]) => [open, close]);
}

function phoneticAnnotationIndices(tokens) {
  const ranges = phoneticAnnotationRanges(tokens.map(token => token.s).join(''), tokens);
  const marked = new Set();
  let offset = 0;
  tokens.forEach((token, index) => {
    if (ranges.some(([start, end]) => offset >= start && offset < end)) marked.add(index);
    offset += token.s.length;
  });
  return marked;
}

function appendJapaneseLookup(container, text, context = {}) {
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
  const segments = segmenter ? [...segmenter.segment(String(text))].map(part => part.segment)
    : String(text).split(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+)/u);
  // Q · one door per segment, as before; the segments of one word (jaGroupSegments) share a no-break span, so a line
  // never ends inside a word (挑|ん|だ, 正|倉|院) or a number (２０２６); a word too long for a short line (over 12
  // characters) keeps its doors' own breaks
  const groups = segmenter ? jaGroupSegments(segments.filter(Boolean)) : segments.map((segment) => [segment]);
  const wrapper = el('span', 'japanese-lookup-text');
  wrapper.dataset.japaneseLookup = 'true';
  // A caller whose block is split across several calls (a prompt around its underlined
  // target) names it, so the block still keeps exactly one Tab stop.
  const block = context.block || (container.dataset ? container : wrapper);
  block.dataset.lookupBlock = 'true';
  const help = japaneseLookupHelpId();
  // G3 · a phonetic parenthetical (a name's reading set after it) is not a door; when the name readings are not loaded
  // yet and the text may hold one, the prose waits for them (waitForLookupNameReadings)
  const annotations = phoneticAnnotationRanges(text);
  if (!D.annotationNameReadings && phoneticAnnotationCandidates(text).length > annotations.length) {
    waitForLookupNameReadings(wrapper, text, context, block);
    container.append(wrapper);
    return wrapper;
  }
  // the groups hold the same segments in the same order (jaGroupSegments mends and splits only within them), so the
  // offset of each segment is its place in the text
  let offset = 0;
  for (const group of groups) {
    // a number or a Latin word set as text is one unit too (full-width digits otherwise break between them: ２０|２６)
    const whole = group.length > 1 || /^[0-9０-９A-Za-zＡ-Ｚａ-ｚ.．,，%％]{2,}$/u.test(group[0]);
    const unit = whole && [...group.join('')].length <= 12 ? el('span', 'ja-unit') : null;
    // a line may end between two words: WebKit offers no break between two no-break spans side by side (Guided's lede
    // ran 考え方をひらき、 off the phone), so a <wbr> stands between the words
    if (wrapper.lastChild && !/^\s/u.test(group[0]) && !/[ \u00a0]$/u.test(wrapper.lastChild.textContent || '')) wrapper.append(document.createElement('wbr'));
    if (unit) wrapper.append(unit);
    const place = (node, segment) => {
      if (unit) unit.append(node);
      else if (context.kinsoku) placeKinsoku(wrapper, node, segment);
      else wrapper.append(node);
    };
    for (const segment of group) {
      const annotation = annotations.some(([start, end]) => offset >= start && offset < end);
      offset += segment.length;
      if (annotation || !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(segment)) {
        place(document.createTextNode(segment), segment);
        continue;
      }
      // The visible word is its own accessible name; the shared help says what it does. G3 · a word is a span, not a
      // button: the paragraph is one VoiceOver stop, and its words rove (installProseWordRoving, below)
      const word = el('span', 'japanese-lookup-word', segment);
      word.lang = 'ja';
      word.dataset.lookupText = segment;
      if (context.itemId) word.dataset.lookupItem = context.itemId;
      word.setAttribute('aria-describedby', help);
      word.setAttribute('aria-haspopup', 'dialog');
      word.addEventListener('click', event => {
        event.stopPropagation();
        if (diveFromMini(word, event)) return;
        void openJapaneseLookup(word, segment, context);
      });
      word.addEventListener('keydown', event => lookupWordKey(event, word));
      word.addEventListener('focus', () => setLookupStop(word));
      let menuRecord = null;
      const occurrence = () => context.itemId ? lookupOccurrence(word) : null;
      let menuOccurrence = null;
      const current = () => word.isConnected ? word : menuOccurrence && findLookupOccurrence(menuOccurrence);
      const entry = () => menuRecord ? { t: 'word', id: menuRecord.head || segment, ...(menuRecord.seq ? { seq: menuRecord.seq, reading: menuRecord.r } : {}) }
        : [...segment].length === 1 && D.kanji[segment] ? { t: 'kanji', id: segment } : null;
      wireReaderWordMenu(word, {
        target: { kind: 'word', id: segment }, label: segment, copyText: segment,
        prepare: async () => {
          menuOccurrence = occurrence();
          if (context.beforeOpen && !(await context.admit?.())) return false;
          await ensureDictionaryRowsForForm(segment).catch(() => {});
          menuRecord = japaneseLookupRecord(segment, context);
        },
        resolveAnchor: current,
        get entryAvailable() { return !!entry(); },
        save: () => wordSaveFacts({ s: segment, b: menuRecord?.head || segment, r: menuRecord?.r || '', c: !!menuRecord,
          ...(menuRecord?.seq ? { seq: menuRecord.seq } : {}) }, { record: menuRecord }),
        quickLook: () => { const anchor = current(); if (anchor) void openJapaneseLookup(anchor, segment, context); },
        openEntry: async mode => {
          if (!entry() || (context.beforeOpen && !(await context.beforeOpen()))) return;
          const node = entry(), anchor = current();
          if (node && anchor) go(node, { invoker: anchor, instant: mode === 'keyboard' });
        },
      });
      place(word, segment);
    }
  }
  container.append(wrapper);
  installProseWordRoving(block, '.japanese-lookup-word');
  // A fragment or underlined assessment target may not be inside its named block yet.
  // Retire these newly created words directly; insertion order must not expose word controls.
  for (const word of wrapper.querySelectorAll('.japanese-lookup-word')) proseWordRovers.get(block).retire(word);
  return wrapper;
}

function inlineGloss(rec) {
  if (!rec?.m?.length) return null;
  const candidates = rec.m
    .slice(0, 3)
    .map((s) => s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!candidates.length) return rec.m[0];
  // THE FIRST SENSE WINS. JMdict orders senses by importance; picking the
  // shortest string across senses surfaced tag-stripped minor senses as THE
  // meaning — 半島 glossed "Korea" instead of "peninsula" (operator, on a
  // real phone, 2026-08-12). Shortening happens WITHIN the first sense
  // (comma cut); a later sense is a last resort only when the first cannot
  // be made to fit at all.
  let best = candidates[0];
  if (best.length > 18 && best.includes(',')) best = best.split(',')[0].trim();
  if (best.length > 24) {
    const shorter = candidates.slice(1).find((c) => c.length <= 18);
    if (shorter) best = shorter;
  }
  return best;
}

function readerWordNote(p, token) {
  const hit = (Array.isArray(p?.wordNotes) ? p.wordNotes : []).find((n) => n && n.surface === token?.s && typeof n.note?.en === 'string' && n.note.en);
  return hit ? hit.note : null;
}

function readerGlossMissText(form = '', reading = '', several = null) {
  if (form && D.dictionaryIndex && (D.dictionaryMode === 'main' || D.dictionaryCompleteForms?.has(String(form)))) {
    // R · asked, the full dictionary lists nothing for this spelling: the line says so, and promises no other look
    const rows = dictionaryRowsForForm(form);
    if (!rows.length) return tx('この表記の辞書項目はありません。', 'No dictionary entry for this spelling.');
    // R2 · asked and answered, it never says "Not in the quick dictionary" again: several entries read the text's way
    // stay the full entry's choice and are named (those the door narrowed to, when it did); none read so is said plainly
    const wanted = kataToHira(String(reading || ''));
    const read = wanted ? rows.filter((row) => row[5].some((kana, k) => kataToHira(kana) === wanted && readerReadingFits(row, k, form))) : [];
    if ((Array.isArray(several) && several.length > 1) || read.length > 1) {
      const heads = (Array.isArray(several) && several.length > 1 ? several : [...new Set(read.map((row) => row[1]))]).slice(0, 4);
      return tx(`複数の項目：${heads.join('・')}`, `Several entries: ${heads.join(' · ')}`);
    }
    if (wanted && !read.length) return tx('この読みの辞書項目はありません。', 'No dictionary entry for this reading.');
  }
  return tx('この語は簡易辞書にありません。「全項目」で全辞書を引けます。', 'Not in the quick dictionary. Full entry looks it up in the whole dictionary.');
}

function tokenReading(token) {
  return !token?.b || token.b === token.s ? String(token?.r || '') : lemmaReading(token);
}

function lemmaTakesForm(lemma, reading, pos = '', base = '') {
  const L = kataToHira(String(lemma || '')), r = kataToHira(String(reading || ''));
  if (!L || !r) return false;
  if (L === r) return true;
  const last = L.slice(-1), stem = L.slice(0, -1);
  const verb = ['動詞', '助動詞', '接尾辞', ''].includes(pos);
  const adjective = ['形容詞', '助動詞', '接尾辞', ''].includes(pos);
  const forms = [];
  if (adjective && last === 'い') forms.push(...['', 'く', 'かっ', 'けれ', 'かろ', 'き', 'し', 'かれ', 'から', 'かり', 'う', 'さ', 'け'].map((end) => stem + end));
  if (adjective && last === 'し') forms.push(...['', 'く', 'き', 'けれ', 'から', 'かり', 'かれ', 'かる', 'う'].map((end) => stem + end));
  if (verb) {
    if (/[すず]る$/u.test(L)) {
      const root = L.slice(0, -2);
      const ends = L.endsWith('ずる') ? ['じ', 'ざ', 'ぜ', 'ず', 'ずる', 'ずれ', 'じろ', 'ぜよ', 'じよう'] : ['し', 'さ', 'せ', 'す', 'する', 'すれ', 'しろ', 'せよ', 'しよう'];
      forms.push(...ends.map((end) => root + end));
    }
    if (L === 'くる' || (L.endsWith('くる') && /来る$/u.test(String(base)))) {
      forms.push(...['こ', 'き', 'く', 'くる', 'くれ', 'こい', 'こよ', 'こよう'].map((end) => L.slice(0, -2) + end));
    }
    const row = GODAN_ROW[last];
    if (row) {
      forms.push(...[...row, last, ...(LEMMA_ONBIN[last] || [])].map((kana) => stem + kana), `${stem}${row[3]}う`);
      if (/[いゆ]く$/u.test(L)) forms.push(`${stem}っ`);
    }
    if (last === 'る') {
      forms.push(...['', 'れ', 'ろ', 'よ', 'よう', 'ん'].map((end) => stem + end));
      const u = LEMMA_NIDAN[stem.slice(-1)];
      if (u) forms.push(...['', 'る', 'れ'].map((end) => stem.slice(0, -1) + u + end));
    }
    if (last === 'り') forms.push(...['ら', 'り', 'る', 'れ'].map((kana) => stem + kana));
  }
  return forms.includes(r);
}

function lemmaReading(token) {
  const s = String(token?.s || ''), b = String(token?.b || ''), r = kataToHira(String(token?.r || ''));
  if (!b || b === s || !r) return '';
  if (READER_KANA.test(b)) return b;
  const pos = String(token.p || '');
  const takes = (lemma) => lemmaTakesForm(lemma, r, pos, b);
  const listed = [...new Set([D.dict?.[b]?.r, ...dictionaryRowsForForm(b).flatMap((row) =>
    row[5].filter((kana, k) => readerReadingFits(row, k, b)))].filter(Boolean).map((kana) => kataToHira(String(kana))))];
  const surface = [...s], base = [...b];
  let shared = 0;
  while (shared < surface.length && shared < base.length && surface[shared] === base[shared]) shared += 1;
  const sTail = surface.slice(shared).join(''), bTail = base.slice(shared).join('');
  const kanaOnly = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]*$/u;
  const ending = kataToHira(sTail);
  const aligned = shared && kanaOnly.test(sTail) && kanaOnly.test(bTail) && r.endsWith(ending) && r.length > ending.length
    ? r.slice(0, r.length - ending.length) + kataToHira(bTail) : '';
  const confirmed = listed.includes(aligned);
  if (aligned && takes(aligned) && (confirmed || (!(sTail === '' && pos === '形容詞') && !listed.some(takes)))) return aligned;
  const read = listed.filter(takes);
  return read.length === 1 ? read[0] : '';
}

function kanaIru(token) {
  return token?.p === '動詞' && token.b === 'いる' && READER_KANA.test(String(token.s || ''));
}

function readingForm(token) {
  if (!token?.b || token.b === token.s) return kanaIru(token) ? { ...token, unfit: true } : token;
  const reading = lemmaReading(token);
  if (!reading) return { ...token, b: token.s };
  // a verb whose kana dictionary form the quick dictionary has only as a word of another class (かえる is 蛙 "frog", なす
  // 茄子 "eggplant", さる 猿 "monkey", かり 雁 "wild goose"), or as a verb of a class that cannot take the text's form (a
  // godan verb never stands as its bare stem: the い of ている is the ichidan 居る's, never the quick dictionary's godan
  // いる, 要る "to be needed"), is not that word: the form keeps its own reading — the label and the reading always name
  // the same form — and is marked unfit, so the quick dictionary's word never answers for it and its entry is chosen
  // among the verbs read so (readingToken: かえり → 帰る, なさ → 為す, い → いる 居る), or none (the quick dictionary's
  // class: its parts — "godan verb", "ichidan verb", a JMdict v… code)
  const core = D.dict?.[token.b];
  const parts = String(core?.p || '').split(' · ');
  const stemOnly = parts.some((part) => /^godan verb$|^v5/u.test(part)) && !parts.some((part) => /^ichidan verb$|^v1/u.test(part)) &&
    /る$/u.test(reading) && kataToHira(String(token.r || '')) === kataToHira(reading).slice(0, -1);
  const unfit = token.p === '動詞' && !!core?.p && kataToHira(String(core.r || '')) === kataToHira(reading) &&
    (!parts.some((part) => /verb/u.test(part) || /^v[0-9a-z]/u.test(part)) || stemOnly);
  return { ...token, s: token.b, r: reading, inflected: token.s, ...(unfit || kanaIru(token) ? { unfit: true } : {}) };
}

function teFormSenseGlosses(detail) {
  return (detail?.[3] || [])
    .filter((sense) => (sense?.[0] || []).some((pos) => pos === 'aux-v' || pos === 'exp')
      && (sense?.[8] || []).some((note) => TE_FORM_NOTE.test(String(note))))
    .map((sense) => (sense[10] || []).map((gloss) => String(gloss?.[0] || '')).filter(Boolean))
    .filter((glosses) => glosses.length);
}

function teFormAnswer(token, door = readingForm(token)) {
  if (!TE_FORM_AUXILIARY.has(token)) return null;
  const forms = [{ form: door.b, reading: tokenReading(door), lemma: true }];
  if (token.s !== door.b && D.dict?.[token.s]) forms.push({ form: token.s, reading: String(token.r || ''), lemma: false });
  for (const { form, reading, lemma } of forms) {
    if (!dictionaryAnsweredForm(form)) return { need: { forms: [form], shards: [] } };
    const read = dictionaryRowsReadAs(form, reading);
    const alt = D.dict?.[form]?.alt;
    const rows = lemma ? narrowLemmaEntries(read, reading, form, '動詞') : read.filter((row) => row[1] === form || (!!alt && row[4].includes(alt)));
    const missing = rows.filter((row) => !D.dictionaryDetails?.get(String(row[0])));
    if (missing.length) return { need: { forms: [], shards: [...new Set(missing.map((row) => dictionaryShardId(row[0])))] } };
    for (const row of rows) {
      const te = teFormSenseGlosses(D.dictionaryDetails.get(String(row[0])));
      if (!te.length) continue;
      if (lemma) return { door: { ...door, seq: String(row[0]), te } };
      // the text's own form is the word: no dictionary form rides beside it
      const written = { ...door, s: form, b: form, r: reading, seq: String(row[0]), te };
      delete written.inflected;
      delete written.unfit;
      return { door: written };
    }
  }
  return { none: true };
}

async function ensureTeFormAnswer(token, door) {
  for (let round = 0; round < 4; round += 1) {
    const need = teFormAnswer(token, door)?.need;
    if (!need) return;
    await Promise.all([...need.forms.map((form) => ensureDictionaryRowsForForm(form)), ...need.shards.map((id) => ensureDictionaryShard(id))]);
  }
}

function teFormRecord(rec, te) {
  if (!rec || !Array.isArray(te) || !te.length) return rec;
  const senses = te.flat();
  return { ...rec, m: [...new Set([...te.map((glosses) => glosses[0]), ...senses, ...(rec.m || []).filter((gloss) => !senses.includes(gloss))])] };
}

function senseNeighbours(token) {
  const at = TOKEN_CONTEXT.get(token);
  if (!at) return null;
  const { tokens, index } = at;
  return { prev: tokens[index - 1] || null, prev2: tokens[index - 2] || null, next: tokens[index + 1] || null,
    next2: tokens[index + 2] || null, before: tokens.slice(Math.max(0, index - 8), index), passage: at.passage, index,
    at: (offset) => tokens[index + offset] || null };
}

function sidecarSense(near) {
  const row = near?.passage ? D.senseSidecar?.[near.passage]?.[near.index] : null;
  if (!Array.isArray(row)) return null;
  if (row[0] === 'name') return { name: true, source: String(row[1] || '') };
  // a reading the text talks about, not a word (「いちちゅう」「さんちゅう」とは読まない): no dictionary meaning
  if (row[0] === 'reading') return { reading: true, source: String(row[1] || '') };
  return { seq: String(row[0]), k: Number(row[1]), source: String(row[2] || ''), ...(Number.isInteger(row[3]) ? { lead: row[3] } : {}) };
}

function senseNegation(token, near) {
  if (token.p !== '形容詞' || !['ない', '無い'].includes(String(token.b || '')) || !near?.prev) return false;
  const prev = String(near.prev.s || ''), prev2 = String(near.prev2?.s || '');
  // an adjective's く form, or an auxiliary's (たく: 行きたくない)
  const adjectiveKu = (t) => ['形容詞', '助動詞'].includes(t?.p) && /く$/u.test(String(t.s || ''));
  if (['で', 'じゃ', 'じゃあ'].includes(prev) || adjectiveKu(near.prev)) return true;
  // さも's: "if not so" (さもなくとも, さもなければ — 然もなければ is not in the shipped dictionary, and its ば is read
  // into the next word by the tokenizer: さも/なけれ/ばか)
  if (prev === 'さも') return true;
  return ['は', 'も', 'さえ'].includes(prev) && (['で', 'じゃ'].includes(prev2) || adjectiveKu(near.prev2));
}

function senseSpelledReading(token, near) {
  if (!near?.at || !READER_KANA.test(String(token?.s || ''))) return false;
  const kana = (t) => !!t && READER_KANA.test(String(t.s || ''));
  let open = -1, close = 1;
  while (kana(near.at(open))) open -= 1;
  while (kana(near.at(close))) close += 1;
  if (!/^[（(]$/u.test(String(near.at(open)?.s || '')) || !/^[）)]$/u.test(String(near.at(close)?.s || ''))) return false;
  let spelled = '';
  for (let k = open + 1; k < close; k += 1) spelled += String(near.at(k).s || '');
  spelled = kataToHira(spelled);
  let read = '';
  for (let back = 1; back <= 4 && near.at(open - back); back += 1) {
    const word = near.at(open - back);
    if (!word.r) return false;
    read = kataToHira(String(word.r)) + read;
    if (read === spelled) return true;
  }
  return false;
}

function senseMustRun(near, h) {
  const head = near.at(h);
  if (!head) return null;
  const s = String(head.s || ''), nai = ['ない', '無い'].includes(String(head.b || ''));
  const word = (k) => String(near.at(h + k)?.s || '');
  // the stem it follows: a verb's, an adjective's, an auxiliary's, or the copula's (でなければ, じゃなくちゃ)
  const before = near.at(h - 1);
  const stem = head.p === '助動詞' || ['動詞', '形容詞', '助動詞'].includes(before?.p) || ['で', 'じゃ'].includes(String(before?.s || ''));
  let verb, expression;
  if (nai && s === 'なく' && word(1) === 'て' && word(2) === 'は' && ['いけ', 'なら'].includes(word(3))) {
    verb = 3;
    expression = word(3) === 'いけ'
      ? { s: 'なくてはいけない', b: 'なくてはいけない', r: 'なくてはいけない', seq: '2255320', k: stem ? 1 : 0 }
      : { s: 'なくてはならない', b: 'なくてはならない', r: 'なくてはならない', seq: '2098150', k: stem ? 1 : 0 };
  } else if (nai && s === 'なく' && ['ちゃ', 'っちゃ'].includes(word(1))) {
    verb = ['いけ', 'なら'].includes(word(2)) ? 2 : null;
    // bare, it is "have to" only where the sentence ends on it (考えなくちゃ」); before a clause it is "unless"
    const must = stem && (verb !== null || !near.at(h + 2) || SENSE_MUST_END.test(word(2)));
    expression = { s: 'なくちゃ', b: 'なくちゃ', r: 'なくちゃ', seq: '2098160', k: must ? 1 : 0 };
  } else if (((nai && s === 'なけれ') || (head.b === 'ぬ' && s === 'ね')) && word(1) === 'ば' && ['なら', 'いけ', 'なり'].includes(word(2))) {
    verb = 2;
    expression = { s: 'なければならない', b: 'なければならない', r: 'なければならない', seq: '1632350', k: 0 };
  } else return null;
  // the verb is itself negated (ならない, ならぬ, ならん, なりません, いけません, ならなくなる)
  if (verb !== null && !SENSE_MUST_NOT.has(word(verb + 1))) return null;
  return { verb: verb === null ? null : h + verb, expression,
    ownHead: (head.p === '形容詞' && !stem) || (expression.seq === '2098160' && verb === null) };
}

function senseExpression(token, near) {
  if (!near) return null;
  const next = String(near.next?.s || ''), prev = String(near.prev?.s || ''), prev2 = String(near.prev2?.s || '');
  const word = (offset) => String(near.at(offset)?.s || '');
  // the must family (senseMustRun): the token is the run's verb, its existence ない or a bare なくちゃ; the run's ん is
  // ぬ "not" (しなければならん), never the interjection the tokenizer's む is
  for (let h = 0; h >= -4; h -= 1) {
    const run = senseMustRun(near, h);
    if (!run) continue;
    if (run.verb === 0 || (h === 0 && run.ownHead)) return run.expression;
    if (run.verb === -1 && token.s === 'ん' && token.b === 'む') return { s: 'ん', b: 'ん', r: 'ん', seq: '2441300', k: 0 };
  }
  // the explanatory ん is the particle (の); the auxiliary ん is negation (ませんでした, 知らん) and stays itself
  // (and before じゃ: いうんじゃア, the explanatory ん of んじゃ, as Grok's row has it)
  if (token.s === 'ん' && token.p !== '助動詞' && ['だ', 'だっ', 'だろ', 'だろう', 'じゃ', 'じゃあ', 'じゃア'].includes(next)) return { s: 'んだ', b: 'んだ', r: 'んだ', seq: '2849387' };
  if (token.s === 'ん' && token.p !== '助動詞' && ['です', 'でし', 'でしょ'].includes(next)) return { s: 'んです', b: 'んです', r: 'んです', seq: '2087820' };
  // いけない after ては/ちゃ is "must not" (its sense after the te-form); elsewhere "no good" (注意しないからいけない,
  // なかなかいけない) — never いける "to be good (at)"; いけ after に/へ (学校へはいけない) may be 行ける "can go", and stays
  if (token.b === 'いける' && token.s === 'いけ' && ['ない', 'ませ', 'ず'].includes(next)) {
    if (['ちゃ', 'じゃ'].includes(prev) || (prev === 'は' && ['て', 'で'].includes(prev2))) return { s: 'いけない', b: 'いけない', r: 'いけない', seq: '1000730' };
    const going = ['に', 'へ'].includes(prev) || (['は', 'も'].includes(prev) && ['に', 'へ'].includes(prev2));
    if (!going) return { s: 'いけない', b: 'いけない', r: 'いけない', seq: '1000730', k: 2 };
  }
  // 床に就く, "to go to bed; to be laid up" (床についていて, 床 read とこ), never 就く "to take (a seat)" nor 点く "to be lit"
  if (token.b === 'つく' && prev === 'に' && prev2 === '床' && kataToHira(String(near.prev2?.r || '')) === 'とこ') {
    return { s: '床につく', b: '床につく', r: 'とこにつく', seq: '1854590' };
  }
  // について, "about" (日本について), never つく "to be attached" or "to be lit"; 床について + いる (taken to bed) stays つく
  if (token.s === 'つい' && prev === 'に' && next === 'て' && !['い', 'いる', 'いた', 'いて', 'おり', 'おる'].includes(String(near.next2?.s || ''))) {
    return { s: 'について', b: 'について', r: 'について', seq: '1009780' };
  }
  // にとって, "to; for; concerning" (私にとって), never とる "to have (e.g. lunch)" or "to take (e.g. a joke)"
  if (token.s === 'とっ' && prev === 'に' && next === 'て') return { s: 'にとって', b: 'にとって', r: 'にとって', seq: '1009600' };
  // ない in its idioms: 勿体ない "wasteful", 違いない "sure", 間もなく "soon" — never "nonexistent"
  if (['ない', '無い'].includes(String(token.b || '')) && ['勿体', 'もったい'].includes(prev)) return { s: '勿体ない', b: '勿体ない', r: 'もったいない', seq: '1605250' };
  if (['ない', '無い'].includes(String(token.b || '')) && ['違い', 'ちがい'].includes(prev)) return { s: '違いない', b: '違いない', r: 'ちがいない', seq: '1610740' };
  if (token.s === 'なく' && prev === 'も' && prev2 === '間') return { s: '間もなく', b: '間もなく', r: 'まもなく', seq: '1215290' };
  // and more of them (Grok 2029): 相違ない "without doubt; certain", 間違いない "certain; sure", 何度となく "time after
  // time" (each of 何, 度 and なく), ともなく "without knowing (it)" (いつともなく), となく after a count the dictionary has no
  // entry for (何遍となく, いくつとなく), そこはかとなく "somehow; faintly" (そこ, かと and なく: the tokenizer's そこ/は/かと/なく)
  const nai = ['ない', '無い'].includes(String(token.b || ''));
  if (nai && prev === '相違') return { s: '相違ない', b: '相違ない', r: 'そういない', seq: '2027060' };
  if (nai && prev === '間違い') return { s: '間違いない', b: '間違いない', r: 'まちがいない', seq: '2006640', k: 0 };
  const nando = (h) => word(h) === '何' && word(h + 1) === '度' && word(h + 2) === 'と' && word(h + 3) === 'なく';
  if ([0, -1, -3].some(nando)) return { s: '何度となく', b: '何度となく', r: 'なんどとなく', seq: '2840609' };
  if (nai && token.s === 'なく' && prev === 'も' && prev2 === 'と') return { s: 'ともなく', b: 'ともなく', r: 'ともなく', seq: '2137120' };
  if (nai && token.s === 'なく' && prev === 'と' && (['何遍', '何回', 'いくつ', '幾つ'].includes(prev2)
    || (prev2 === 'つ' && ['いく', '幾'].includes(word(-3))))) return { s: 'となく', b: 'となく', r: 'となく', seq: '2208050' };
  const sokohaka = (h) => word(h) === 'そこ' && word(h + 1) === 'は' && word(h + 2) === 'かと' && word(h + 3) === 'なく';
  if ([0, -2, -3].some(sokohaka)) return { s: 'そこはかとなく', b: 'そこはかとなく', r: 'そこはかとなく', seq: '2569820' };
  // にかけて, a span (1月から3月にかけて), never かける "to hang up": かけ between に and て, with から before it
  if (token.s === 'かけ' && ['かける', '掛ける', '懸ける', '架ける'].includes(String(token.b || '')) && prev === 'に' && next === 'て'
    && (near.before || []).some((t) => t?.s === 'から')) return { s: 'にかけて', b: 'にかけて', r: 'にかけて', seq: '2034300', k: 0 };
  // につき, never つく "to be attached": "per" by a count (記事につき三行, １団体につき), につきまして "regarding" (never
  // 目につきました, "caught the eye")
  if (token.s === 'つき' && token.b === 'つく' && prev === 'に') {
    if (next === 'まし' && String(near.next2?.s || '') === 'て') return { s: 'につきまして', b: 'につきまして', r: 'につきまして', seq: '2872401' };
    const counted = (t) => !!t && (SENSE_NUMBER.test(String(t.s || '')) || SENSE_NUMBER_WORD.has(String(t.s || '')));
    if (counted(near.next) || counted(near.at(-3))) return { s: 'につき', b: 'につき', r: 'につき', seq: '1009850', k: 2 };
  }
  // 一発退場, sent off at once: 一発 "one try", never 発 the counter of gunshots; 性暴力, "sexual violence", never 性
  // "nature (of a person)"
  if (token.s === '発' && ['一', '１', '1'].includes(prev) && next === '退場') return { s: '一発', b: '一発', r: 'いっぱつ', seq: '1165730', k: 3 };
  if (token.s === '性' && next === '暴力') return { s: '性暴力', b: '性暴力', r: 'せいぼうりょく', seq: '2456730' };
  // 〜なりに, "in one's own way" (自分なりに), never the particle なり "or" nor 也's "sum of money"; a listing's last なり
  // before に (父母なり友なりに) is still the listing's
  if (token.s === 'なり' && ['接尾辞', '助詞'].includes(token.p) && next === 'に' && !(near.before || []).some((t) => t?.s === 'なり')) {
    return { s: 'なりに', b: 'なりに', r: 'なりに', seq: '2038230' };
  }
  // 一枚岩, the idiom (monolith; unity), never 枚 the counter of flat things
  if (token.s === '枚' && prev === '一' && next === '岩') return { s: '一枚岩', b: '一枚岩', r: 'いちまいいわ', seq: '1166750' };
  // 〜方がいい after a verb: "had better", after a negative "had better not" (しない方がいい), never one side of a comparison
  if (token.s === '方' && kataToHira(String(token.r || '')) === 'ほう' && next === 'が' && ['動詞', '助動詞'].includes(near.prev?.p)
    && ['いい', 'よい', '良い', 'よかっ', '良かっ'].includes(String(near.next2?.s || ''))) {
    return { s: '方がいい', b: '方がいい', r: 'ほうがいい', seq: '2160680', k: ['ない', 'ぬ', 'ん'].includes(prev) ? 1 : 0 };
  }
  return null;
}

function senseChoice(token, door) {
  if (!door || door.te || door.senseName) return null;
  const near = senseNeighbours(token);
  // a reading, not a word: the kana the text spells a word's reading in after it (悉曇（しったん）: never 知る "to know"
  // for しっ, nor "yes" for ん, whatever entry its kana could name), or one the sidecar names. It has no dictionary
  // meaning; its card shows the text's own form
  const asReading = (why) => ({ door: { ...door, s: token.s, b: token.s, r: token.r, seq: undefined, senseName: true, inflected: undefined,
    unfit: undefined, several: undefined, noFit: undefined, readMiss: undefined, sense: { name: true, reading: true, why: [why] } } });
  if (senseSpelledReading(token, near)) return asReading('reading');
  if (door.kanjiOnly || door.noFit) return null;
  // the sidecar is asked for with its article; a word tapped before it came waits for it (ensureSense)
  if (near?.passage && D.senseSidecar === undefined) return { need: { forms: [], shards: [] } };
  const side = sidecarSense(near);
  if (side?.reading) return asReading(`sidecar:${side.source}`);
  const expression = senseExpression(token, near);
  if (expression) {
    if (!dictionaryAnsweredForm(expression.b)) return { need: { forms: [expression.b], shards: [] } };
    const row = dictionaryRowsReadAs(expression.b, expression.r).find((candidate) => String(candidate[0]) === expression.seq);
    const detail = row ? D.dictionaryDetails?.get(expression.seq) : null;
    if (row && !detail) return { need: { forms: [], shards: [dictionaryShardId(expression.seq)] } };
    if (!detail) return null;
    // the sidecar's sense of the expression where it names one (一枚岩: the rock, or unity); else the expression's own
    // (方がいい after a negative: "had better not"), else the sense noted as following the te-form (いけない: "must
    // not"), else its first (んだ, んです: their one sense)
    const sided = side?.seq === expression.seq && detail[3][side.k] ? side : null;
    const k = sided ? sided.k : Number.isInteger(expression.k) ? expression.k
      : Math.max(0, detail[3].findIndex((sense) => (sense[8] || []).some((note) => TE_FORM_NOTE.test(String(note)))));
    const sense = { seq: expression.seq, k, glosses: senseLed(senseGlosses(detail[3][k]), sided?.lead),
      why: sided ? ['expression', `sidecar:${sided.source}`] : ['expression'], left: 1, entry: true };
    return { door: { ...door, s: expression.s, b: expression.b, r: expression.r, seq: expression.seq, sense, inflected: undefined, unfit: undefined, several: undefined } };
  }
  if (side?.name) return { door: { ...door, senseName: true, sense: { name: true, why: [`sidecar:${side.source}`] } } };
  const form = String(door.b || ''), reading = kataToHira(String(tokenReading(door) || ''));
  if (!form || !reading) return null;
  if (!dictionaryAnsweredForm(form)) return { need: { forms: [form], shards: [] } };
  // a grammar word (an auxiliary verb, a suffix, a prefix) is only ever an entry headed by its own spelling, as the
  // lookup door has always chosen (ます is never 升 "measuring container"), or — written in kana — one JMdict usually
  // writes in kana (the classical copula なり: 也); a counter after a number may be one written otherwise and read
  // alike (一つ's つ: 箇, the general counter)
  const helper = LOOKUP_HELPER_POS.has(token.p);
  const counting = token.p === '接尾辞' && senseNumberBefore(near);
  const read = dictionaryRowsReadAs(form, reading);
  const hasCounter = (row) => (D.dictionaryDetails?.get(String(row[0]))?.[3] || []).some((sense) => (sense[0] || []).includes('ctr'));
  // the door's own entry: the one it names, else the one whose meaning the quick dictionary gives (お: 御, the polite prefix)
  const shown = door.seq ? null : D.dict?.[form]?.m?.[0];
  const mine = (row) => (door.seq ? String(row[0]) === String(door.seq) : !!shown && (row[6] || []).includes(shown));
  const usuallyKana = (row) => READER_KANA.test(form) && (D.dictionaryDetails?.get(String(row[0]))?.[3] || []).some((sense) => (sense[7] || []).includes('uk'));
  const rows = read.filter((row) => !helper || row[1] === form || mine(row) || usuallyKana(row) || (counting && hasCounter(row)))
    .sort((a, b) => mine(b) - mine(a));
  const asked = helper || counting ? read : rows;
  const missing = asked.filter((row) => !D.dictionaryDetails?.get(String(row[0])));
  if (missing.length) return { need: { forms: [], shards: [...new Set(missing.map((row) => dictionaryShardId(row[0])))] } };
  if (!rows.length) return null;
  let pairs = rows.flatMap((row, r) => (D.dictionaryDetails.get(String(row[0]))[3] || [])
    .map((sense, k) => ({ row, r, k, sense, seq: String(row[0]) })));
  // the sense the slip has shown: the door's own entry's sense holding the meaning it shows (the quick dictionary's
  // first gloss for a spelling it has), else its first
  const own = (pair) => pair.r === 0 && mine(pair.row);
  const before = pairs.find((pair) => own(pair) && shown && senseGlosses(pair.sense).includes(shown)) || pairs.find(own) || pairs[0];
  // candidates: the senses the rules left, [entry, sense], in order (the sidecar's builder asks two models among these)
  const result = (pair, why) => ({ seq: pair.seq, k: pair.k, glosses: senseGlosses(pair.sense), why, left: pairs.length,
    entries: new Set(pairs.map((candidate) => candidate.seq)).size, entry: !own(pair),
    candidates: pairs.map((candidate) => [candidate.seq, candidate.k]) });
  if (side) {
    const hit = pairs.find((pair) => pair.seq === side.seq && pair.k === side.k);
    if (hit) {
      const chosen = result(hit, [`sidecar:${side.source}`]);
      return Number.isInteger(side.lead) ? { ...chosen, glosses: senseLed(chosen.glosses, side.lead), lead: side.lead } : chosen;
    }
  }
  // the rules, each a test a sense passes or fails; the shown sense stays while it passes them all
  const pos = (pair) => pair.sense[0] || [];
  const written = READER_KANA.test(form) ? '' : form;
  const bracket = senseWeekdayBracket(token, near);
  const weekday = (pair) => senseGlosses(pair.sense).some((gloss) => SENSE_WEEKDAY.test(gloss));
  // a month counted: 月 read つき after a number (一月 ひとつき) or before に and a number (月に五十円), never the Moon
  const month = form === '月' && reading === 'つき' && (senseNumberBefore(near)
    || (String(near?.next?.s || '') === 'に' && SENSE_NUMBER.test(String(near?.next2?.s || ''))));
  const rules = [
    ['reading', (pair) => {
      const kana = pair.sense[2] || [], kanji = pair.sense[1] || [];
      return (!kana.length || kana[0] === '*' || kana.some((r) => kataToHira(String(r)) === reading))
        && (!written || !kanji.length || kanji[0] === '*' || kanji.includes(written));
    }],
    ...(counting ? [['counter', (pair) => pos(pair).some((code) => code === 'ctr' || code === 'suf' || code === 'n-suf')]] : []),
    ['weekday', (pair) => (bracket ? weekday(pair) : !weekday(pair))],
    ...(month ? [['month', (pair) => senseGlosses(pair.sense).includes('month')]] : []),
    ...(senseNegation(token, near) ? [['negation', (pair) => pos(pair).includes('aux-adj')]] : []),
    ...(SENSE_CLASS[token.p] ? [['class', (pair) => SENSE_CLASS[token.p](pos(pair))]] : []),
  ];
  if (before && rules.every(([, test]) => test(before))) return result(before, []);
  // the shown sense fails: each rule narrows the senses in turn, keeping at least one; within an entry a late sense
  // (archaic, obsolete, rare, dated, slang, vulgar) comes after the others; across entries the door's own first, then —
  // for a word written in kana — an entry JMdict usually writes in kana
  const why = [];
  for (const [name, test] of rules) {
    const fit = pairs.filter(test);
    if (fit.length && fit.length < pairs.length) { pairs = fit; why.push(name); }
  }
  const late = (pair) => (pair.sense[7] || []).some((code) => SENSE_LATE.has(code));
  const kanaWord = (pair) => READER_KANA.test(String(token.s || '')) && (D.dictionaryDetails.get(pair.seq)[3] || []).some((sense) => (sense[7] || []).includes('uk'));
  pairs = pairs.map((pair, at) => ({ pair, at }))
    .sort((a, b) => (own(b.pair) - own(a.pair)) || (kanaWord(b.pair) - kanaWord(a.pair)) || a.pair.r - b.pair.r
      || late(a.pair) - late(b.pair) || a.at - b.at)
    .map(({ pair }) => pair);
  return result(pairs[0], why);
}

function senseDoor(token, door) {
  const choice = senseChoice(token, door);
  if (!choice || choice.need) return door;
  if (choice.door) return choice.door;
  if (door.several && choice.entries > 1) return door;
  // a door keeps its identity (the quick dictionary's word, or its named entry) unless a rule or the sidecar moved its
  // sense to another entry; a door that named several entries is named by the one left
  const renamed = door.several || (choice.why.length > 0 && choice.entry && !senseIsQuick(door, choice.seq));
  return { ...door, ...(renamed ? { seq: choice.seq, several: undefined } : {}), sense: choice };
}

function senseIsQuick(door, seq) {
  const shown = !door.seq && D.dict?.[door.b]?.m?.[0];
  if (!shown) return false;
  const row = dictionaryRowsReadAs(door.b, tokenReading(door)).find((candidate) => (candidate[6] || []).includes(shown));
  return !!row && String(row[0]) === String(seq);
}

function senseRecord(rec, sense) {
  if (!sense) return rec;
  if (sense.name) return { r: rec?.r || '', m: [sense.reading ? tx('この文では読み方', 'a reading in this text') : tx('この文では名前', 'a name in this text')], senseName: true,
    senseKind: sense.reading ? 'reading' : 'name' };
  if (!rec || !Array.isArray(sense.glosses) || !sense.glosses.length) return rec;
  return { ...rec, m: [...new Set([...sense.glosses, ...(rec.m || [])])], senseGlosses: sense.glosses, sense: { seq: sense.seq, k: sense.k } };
}

function senseNameHeldText(kind) {
  return kind === 'reading' ? tx('文中に引かれた読み方で、復習する語ではありません。', 'A reading quoted in the text, not a word to review.')
    : tx('この文の名前で、復習する語ではありません。', 'A name in this text, not a word to review.');
}

function senseMoreElement(text) {
  const more = el('span', 'mini-gloss-more', text);
  more.lang = 'en';
  more.title = text;
  Object.assign(more.style, { fontWeight: '400', color: 'var(--mini-head-ink-2)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden',
    textOverflow: 'ellipsis', maxWidth: '100%' });
  return more;
}

function senseMoreLine(glosses) {
  const more = [];
  for (const gloss of (glosses || []).slice(1, 3)) {
    if ([...more, gloss].join('; ').length > 64 && more.length) break;
    more.push(gloss);
  }
  return more.join('; ');
}

async function ensureSense(token, door) {
  await ensureSenseSidecar();
  for (let round = 0; round < 4; round += 1) {
    const need = senseChoice(token, door)?.need;
    if (!need) return;
    await Promise.all([...need.forms.map((form) => ensureDictionaryRowsForForm(form)), ...need.shards.map((id) => ensureDictionaryShard(id))]);
  }
}

function senseRefine(token, door, slip, redraw, anchor = null) {
  if (!slip || !senseChoice(token, door)?.need) return;
  slip.dataset.sense = 'pending';
  let touched = false, pressing = false;
  const touch = () => { touched = true; };
  const press = () => { touched = true; pressing = true; };
  const lift = () => { pressing = false; };
  slip.addEventListener('pointerdown', press, { capture: true });
  slip.addEventListener('keydown', touch, { capture: true });
  window.addEventListener('pointerup', lift, true);
  window.addEventListener('pointercancel', lift, true);
  const after = () => {
    // Hfix-1A · a press still down on the slip lands first (its click opens Save's menu or keeps the word); its meaning
    // arrives after it, in place
    if (pressing && slip.isConnected) { afterPressLands(after); return; }
    slip.removeEventListener('pointerdown', press, { capture: true });
    slip.removeEventListener('keydown', touch, { capture: true });
    window.removeEventListener('pointerup', lift, true);
    window.removeEventListener('pointercancel', lift, true);
    // a sense that cannot be had (the dictionary cannot answer) is not waited for again: the word's own meaning stands
    if (senseChoice(token, door)?.need) SENSE_GAVE_UP.add(token);
    if (!slip.isConnected) return;
    const waiting = !!slip.querySelector('[data-sense-wait]');
    // a word the sense leaves as it was (no sense chosen; several entries still named) keeps its slip untouched
    if (senseDoor(token, door) === door && !waiting) { delete slip.dataset.sense; return; }
    // brought up to its sense in place where its word and entry stay; drawn again only where they move — and a slip still
    // at its placeholder is never left there, touched or not. Hfix-1A (the lead's item 18): a slip a press has touched
    // (Save pressed, its menu open) is never drawn again; its meaning lands in place, the word's own where the sense
    // belongs to another door
    if ((!touched || waiting) && document.getElementById('mini') === slip && !sensePatch(slip, token, door, anchor)) {
      if (touched) senseFillInPlace(slip);
      else redraw();
    }
    else delete slip.dataset.sense;
  };
  ensureSense(token, door).then(after, after);
}

function senseFillInPlace(slip) {
  const wait = slip.querySelector('.mini-gloss[data-sense-wait]');
  const own = SLIP_OWN_MEANING.get(slip);
  delete slip.dataset.sense;
  if (!wait || !own) return;
  wait.className = 'mini-gloss';
  delete wait.dataset.senseWait;
  wait.style.removeProperty('font-weight');
  wait.style.removeProperty('color');
  if (!wait.getAttribute('style')) wait.removeAttribute('style');
  wait.textContent = own;
  slip.removeAttribute('aria-busy');
}

async function senseWithin(token, door, ms = SENSE_WAIT_MS) {
  if (!senseChoice(token, door)?.need) return true;
  let timer = null;
  await Promise.race([ensureSense(token, door).catch(() => {}), new Promise((resolve) => { timer = setTimeout(resolve, ms); })]);
  clearTimeout(timer);
  return !senseChoice(token, door)?.need;
}

function narrowLemmaEntries(rows, reading, form, pos = '') {
  const wanted = kataToHira(String(reading || ''));
  const level = (row) => Number(String(D.dict?.[row[1]]?.jlpt || '').match(/^N?([1-5])$/u)?.[1] || 0);
  const steps = [
    pos === '動詞' ? (row) => (row[6] || []).some((gloss) => /^to /u.test(String(gloss))) : null,
    pos === '形容詞' ? (row) => [row[1], ...row[4]].some((spelling) => /i-adjective|adj-ix|adj-ku/u.test(String(D.dict?.[spelling]?.p || ''))) : null,
    (row) => kataToHira(String(row[2] || '')) === wanted,
    (row) => row[1] === form,
    READER_KANA.test(String(form)) ? (row, kept) => level(row) > 0 && level(row) === Math.max(...kept.map(level)) : null,
  ];
  let kept = rows;
  for (const step of steps) {
    if (!step || kept.length < 2) continue;
    const fit = kept.filter((row) => step(row, kept));
    if (fit.length) kept = fit;
  }
  return kept;
}

function dictionaryRowsReadAs(form, reading) {
  const wanted = kataToHira(String(reading || ''));
  return wanted ? dictionaryRowsForForm(form).filter((row) => row[5].some((kana, k) => kataToHira(kana) === wanted && readerReadingFits(row, k, form))) : [];
}

function alternateLemmaDoor(door) {
  const pairs = [[/する$/u, 'す', /する$/u, 'す'], [/ずる$/u, 'じる', /ずる$/u, 'じる']];
  for (const [spelt, written, read, reading] of pairs) {
    if (!spelt.test(door.b) || !read.test(door.r)) continue;
    const b = door.b.replace(spelt, written), r = door.r.replace(read, reading);
    if (D.dict?.[b] && kataToHira(String(D.dict[b].r || '')) === kataToHira(r)) return { ...door, s: b, b, r };
    const rows = narrowLemmaEntries(dictionaryRowsReadAs(b, r), r, b, door.p);
    if (rows.length === 1) return { ...door, s: b, b, r, seq: String(rows[0][0]) };
  }
  return null;
}

function soundChangeReadings(reading, listed = []) {
  const r = kataToHira(String(reading || ''));
  const plain = (text) => { const at = SOUND_VOICED.indexOf(text[0]); return at >= 0 ? SOUND_PLAIN[at] + text.slice(1) : ''; };
  const undone = r.endsWith('っ') ? [...'ちつくきう'].map((end) => r.slice(0, -1) + end) : [];
  const out = [...new Set([...undone, plain(r), ...undone.map(plain)])].filter((text) => text && text !== r);
  return undone.some((text) => listed.includes(text)) ? out.filter((text) => undone.includes(text)) : out;
}

function kanjiReadingsOf(char) {
  const k = D.kanji?.[char];
  return k ? { on: (k.on || []).map((on) => kataToHira(String(on))), kun: (k.kun || []).map((kun) => String(kun).replace(/\./gu, '')) } : null;
}

function soundChangeDoor(door) {
  const own = kataToHira(String(door.r || ''));
  const lone = [...String(door.b || '')].length === 1 ? kanjiReadingsOf(door.b) : null;
  if (!own) return null;
  if (!lone || ![...lone.on, ...lone.kun].includes(own)) {
    for (const reading of soundChangeReadings(own, lone ? [...lone.on, ...lone.kun] : [])) {
      if (D.dict?.[door.b] && kataToHira(String(D.dict[door.b].r || '')) === reading) return { ...door, r: reading, shown: door.r };
      const named = D.dict?.[door.b] ? lookup(door.b, null, reading)?.seq : null;
      if (named) return { ...door, r: reading, shown: door.r, seq: String(named) };
      const rows = D.dict?.[door.b] ? [] : dictionaryRowsReadAs(door.b, reading);
      if (rows.length === 1) return { ...door, r: reading, shown: door.r, seq: String(rows[0][0]) };
    }
  }
  if (lone && [own, ...soundChangeReadings(own)].some((reading) => lone.on.includes(reading))) return { ...door, kanjiOnly: true };
  return null;
}

function readerLookupAnswer(text, context = {}) {
  const reading = String(context.reading || '');
  if (!reading || !dictionaryAnsweredForm(text) || japaneseLookupRecord(text, context)) return {};
  const lone = [...String(text)].length === 1 ? kanjiReadingsOf(text) : null;
  const own = kataToHira(reading);
  if (!lone || ![...lone.on, ...lone.kun].includes(own)) {
    for (const variant of soundChangeReadings(own, lone ? [...lone.on, ...lone.kun] : [])) {
      if (japaneseLookupRecord(text, { ...context, reading: variant })) return { reading: variant, shown: reading };
    }
  }
  if (lone && [own, ...soundChangeReadings(own)].some((variant) => lone.on.includes(variant))) return { kanjiOnly: true };
  return {};
}

function readingAsksIndex(form, reading) {
  if (!form || !reading) return false;
  const core = D.dict?.[form];
  return !core || kataToHira(String(core.r || '')) !== kataToHira(String(reading));
}

function readyTokenReading(token) {
  const door = readingForm(token);
  const forms = new Set();
  // R2 · a door the quick dictionary cannot answer for (another class's word read alike) asks the full one too
  if (readingAsksIndex(door.b, tokenReading(door)) || door.unfit) forms.add(door.b);
  // R2 · an inflected word the quick dictionary does not settle asks for its dictionary form's rows (they may read it, or
  // name its entry), and a する/ずる form the quick dictionary lacks for its other spelling too (解する → 解す)
  if (token?.b && token.b !== token.s && (!D.dict?.[token.b] || door.b !== token.b)) {
    forms.add(token.b);
    if (!D.dict?.[token.b]) forms.add(token.b.replace(/する$/u, 'す').replace(/ずる$/u, 'じる'));
  }
  const asked = [...forms].filter((form) => form && !dictionaryAnsweredForm(form));
  // N2 · a te-form auxiliary asks for the rows and the senses its answer needs (teFormAnswer)
  const auxiliary = teFormAnswer(token, door)?.need ? ensureTeFormAnswer(token, door) : null;
  if (!asked.length && !auxiliary) return null;
  return Promise.all([...asked.map((form) => ensureDictionaryRowsForForm(form)), ...(auxiliary ? [auxiliary] : [])])
    .then(() => undefined, () => undefined);
}

function readingToken(token) {
  // R3 · and the door carries the sense its text uses (senseDoor)
  return senseDoor(token, readingTokenEntry(token));
}

function readingTokenEntry(token) {
  // R2 · the door is the token as its dictionary form, read the way the text reads it (readingForm)
  const door = readingForm(token);
  // N2 · a te-form auxiliary is its auxiliary's entry, once JMdict's senses for it are at hand (teFormAnswer)
  const auxiliary = teFormAnswer(token, door)?.door;
  if (auxiliary) return auxiliary;
  const own = tokenReading(door);
  if (!own || (door.seq != null && door.seq !== '') || (!readingAsksIndex(door.b, own) && !door.unfit) || !D.dictionaryIndex) return door;
  const rows = dictionaryRowsForForm(door.b);
  // R2 · once the full dictionary has answered for the spelling, a word no entry is read so for may still be named: a
  // dictionary form's other spelling (解する → 解す), a sound change of an entry's reading (いっ → いち), a lone kanji (寺 じ)
  const unnamed = () => (!dictionaryAnsweredForm(door.b) ? door
    : door.inflected ? alternateLemmaDoor(door) || door : soundChangeDoor(door) || door);
  if (!rows.length) return unnamed();
  // N · an entry read otherwise counts as missing: the door names the full dictionary's entry read the token's way, or
  // none — never the form's first row, whose meaning belongs to another reading (訳 read やく is not わけ · reason)
  if (D.dict[door.b] && !door.unfit) {
    const named = lookup(door.b, null, own)?.seq;
    return named ? { ...door, seq: String(named) } : unnamed();
  }
  // a spelling the core lacks: only the one entry that lists this reading and permits it with this spelling, by that
  // reading's own restriction (readerReadingFits); several stay the full entry's explicit choice (D11's own matcher).
  // R2 · for a dictionary form, several narrow to the one that fits the token (おく: 置く, never 奥 or 億)
  let read = dictionaryRowsReadAs(door.b, own);
  // R2 · an unfit door's entry is a verb, never the noun read alike (かえる: 帰る, 変える, 返る, 替える — never 蛙)
  if (door.unfit) read = read.filter((row) => (row[6] || []).some((gloss) => /^to /u.test(String(gloss))));
  // N2 · and so does an unfit word itself (a kana いる: 居る, the entry headed いる, never 要る or 射る)
  if ((door.inflected || door.unfit) && read.length > 1) read = narrowLemmaEntries(read, own, door.b, door.p);
  // several left: the card names them (the narrowed ones: 炊く · 焚く for a verb, never the nouns 卓 · 宅)
  if (read.length === 1) return { ...door, seq: String(read[0][0]) };
  if (read.length) return { ...door, several: [...new Set(read.map((row) => row[1]))] };
  // an unfit door no verb is read so for (Kawaguchi's 同じかるべき: かり is only nouns) says so, never the nouns' names
  return door.unfit && dictionaryAnsweredForm(door.b) ? { ...door, noFit: true } : unnamed();
}

function readerTokenAtIndex(index, reader = document.getElementById('reader')) {
  const sourceIndex = Number(index);
  if (!reader || !Number.isInteger(sourceIndex) || sourceIndex < 0) return null;
  return reader.querySelector(`.tok[data-index="${sourceIndex}"]`) ||
    [...reader.querySelectorAll('.tok[data-index-end]')].find(token =>
      Number(token.dataset.index) <= sourceIndex && sourceIndex <= Number(token.dataset.indexEnd)) || null;
}

function readerRenderedTokens(p, crossRefs) {
  const result = [];
  const breaks = new Set(p.paras || []);
  const katakanaNoun = token => token?.p === '名詞' && /^[\p{Script=Katakana}ー]{2,}$/u.test(token.s || '');
  const bounded = index => breaks.has(index) || crossRefs?.doors.has(index) || crossRefs?.skip.has(index);
  for (let index = 0; index < p.tokens.length; index += 1) {
    const original = p.tokens[index];
    let end = index;
    if (katakanaNoun(original) && !crossRefs?.doors.has(index) && !crossRefs?.skip.has(index)) {
      while (end + 1 < p.tokens.length && !bounded(end + 1) && katakanaNoun(p.tokens[end + 1])) end += 1;
    }
    const pieces = p.tokens.slice(index, end + 1);
    if (end > index && pieces.some(piece => !piece.c)) {
      const surface = pieces.map(piece => piece.s).join('');
      result.push({ index, token: { s: surface, b: surface, p: '名詞', r: pieces.map(piece => piece.r || '').join(''),
        f: [{ t: surface }], c: false, readerSourceEnd: end } });
      index = end;
    } else result.push({ index, token: original });
  }
  return result;
}

function dictionaryAnsweredForm(form = '') {
  return !!form && !!D.dictionaryIndex && (D.dictionaryMode === 'main' || !!D.dictionaryCompleteForms?.has(String(form)));
}

function readerDoorGloss(door) {
  const kanji = door.kanjiOnly ? D.kanji?.[door.b] : null;
  if (kanji) return String(kanji.m || '').toLowerCase();
  const record = readerQuickRecordAsRead(door);
  return record?.m?.length ? inlineGloss(record) : '';
}

function readerDoorLead(door) {
  const kanji = door.kanjiOnly ? D.kanji?.[door.b] : null;
  if (kanji) return String(kanji.m || '').toLowerCase();
  return boxLeadGloss(readerQuickRecordAsRead(door));
}

function readerGlossLine(token) {
  // Ladder R2 · the sense its sentence uses, followed to its answer (tokenGlossLine); its spoken state follows the row
  return tokenGlossLine(token, (line) => {
    const word = line.closest('.tok[data-index]');
    if (word) nameReaderToken(word, token, Number(word.dataset.index), 'word');
  });
}

function tapLadderHint() {
  // G5 · a hold keeps the word (hold = seal) and opens its strip
  return tx('タップするたびに、読み、意味、詳しい項目へと進みます。長押し（または右クリック）で保存し、ほかの操作も。',
    'Tap for the reading, tap again for the meaning, then open the word. Press and hold to save it, and for more.');
}

function readerWordHint() {
  return tx('Enterで次の表示へ。Shift+F10で保存とほかの操作。Ctrl+Enterで詳しい項目。',
    'Enter: next word layer · Shift+F10: save and more · Ctrl+Enter: full entry');
}

function readerTokenState(token, index, kind) {
  if (kind === 'named') return S.revealed?.has(index) ? token.r || '' : '';
  if (kind !== 'word') return '';
  const showing = S.dials.furigana === 2 || S.revealed?.has(index);
  if (!showing && !S.glossed?.has(index)) return '';
  // R2 · the word's door (readingToken): an inflected word speaks for its dictionary form read the text's way
  const door = readingToken(token);
  const kanji = door.kanjiOnly ? D.kanji?.[door.b] : null;
  // N · as the text reads it: a word whose entry at hand is read otherwise says no meaning of another reading
  const quick = kanji ? null : readerQuickRecord(door);
  const record = kanji ? null : readerQuickRecordAsRead(door, quick);
  const parts = [];
  // R · the reading said is the one its ruby shows: the token's own, where its entry is read otherwise (R2: an inflected
  // word's ruby is its own reading too, never another row's reading of its dictionary form)
  const own = door.shown || tokenReading(door);
  const said = token.b && token.b !== token.s ? String(token.r || '')
    : own && !(record?.r && kataToHira(String(record.r)) === kataToHira(own)) ? own : record?.r;
  if (showing && said && said !== token.s) parts.push(said);
  if (S.glossed?.has(index)) parts.push(kanji ? String(kanji.m || '').toLowerCase() : record?.m?.length ? boxLeadGloss(record)
    : quick && !record ? readerReadingMissText(door.b) : readerGlossMissText(door.b, door.r, door.several));
  return parts.join(' · ');
}

function nameReaderToken(span, token, index, kind) {
  span.dataset.proseLabel = token.s || token.b;
  if (span.dataset.proseSelected === 'true') span.setAttribute('aria-label', token.s || token.b);
  else span.removeAttribute('aria-label');
  const state = readerTokenState(token, index, kind);
  const host = span.parentElement?.classList.contains('token-door') ? span.parentElement : null;
  let node = host?.querySelector(':scope > .tok-state') || null;
  if (state && host) {
    if (!node) { node = el('span', 'tok-state visually-hidden'); node.id = `tok-state-${index}`; host.append(node); }
    node.hidden = true;
    node.textContent = state;
  } else { node?.remove(); node = null; }
  const ids = kind === 'word' ? ['reader-help-kind', node?.id, 'reader-help-word']
    : [node?.id, kind === 'named' ? 'reader-help-named' : 'reader-help-lookup'];
  span.dataset.proseDescription = ids.filter(Boolean).join(' ');
  if (span.dataset.proseSelected === 'true') span.setAttribute('aria-describedby', span.dataset.proseDescription);
  else span.removeAttribute('aria-describedby');
}

function readerHelp() {
  const help = el('div', 'visually-hidden reader-help');
  for (const [id, text] of [['reader-help-kind', tx('語', 'word')], ['reader-help-word', readerWordHint()],
    ['reader-help-named', tx('Enterで次の表示へ。Shift+F10で保存とほかの操作。', 'Enter: next word layer · Shift+F10: save and more')],
    ['reader-help-lookup', tx('読みと意味', 'reading and meaning')]]) {
    const line = el('span', null, text); line.id = id; help.append(line);
  }
  return help;
}

function glossaryCrossRefPlan(p) {
  if (p.source !== 'isa-yasashii-glossary' || !p.tokens) return null;
  const skip = new Set();
  const doors = new Map();
  const toks = p.tokens;
  for (let i = 0; i + 4 < toks.length; i++) {
    if (toks[i].s !== '(' && toks[i].s !== '（') continue;
    if (toks[i + 1]?.s !== 'No' || toks[i + 2]?.s !== '.') continue;
    if (!/^[0-9]+$/.test(toks[i + 3]?.s || '')) continue;
    if (toks[i + 4].s !== ')' && toks[i + 4].s !== '）') continue;
    const target = D.passages.find((x) => x.id === `yasashii:${Number(toks[i + 3].s)}`);
    for (let k = i; k <= i + 4; k++) skip.add(k);
    if (target) doors.set(i, target);
    i += 4;
  }
  return skip.size ? { skip, doors } : null;
}

function readerLayerParagraph() {
  const paragraphs = [...document.querySelectorAll('#reader > [data-reader-prose]')].filter((node) => node.querySelector('.tok[data-index]'));
  if (!paragraphs.length) return null;
  const ceiling = Math.max(0, document.querySelector('#app > .chrome')?.getBoundingClientRect().bottom || 0);
  const floor = Math.min(innerHeight, document.getElementById('primary-tabs')?.getBoundingClientRect().top || innerHeight);
  const box = (node) => node.getBoundingClientRect();
  const onGlass = (node) => box(node).bottom > ceiling + 24 && box(node).top < floor - 24;
  const current = readerTakeCurrent();
  const own = current ? readerTokenAtIndex(current.index)?.closest('[data-reader-prose]') : null;
  if (own && onGlass(own)) return own;
  const line = ceiling + (floor - ceiling) / 3;
  return paragraphs.find((node) => box(node).top <= line && box(node).bottom >= line)
    || paragraphs.find((node) => box(node).top >= ceiling && onGlass(node)) || paragraphs.find(onGlass) || null;
}

function readerLayerReading(token) {
  const pairs = Array.isArray(token.f) && token.f.length ? token.f : null;
  return pairs ? pairs.map((pair) => pair.r || pair.t).join('') : String(token.s || '');
}

function readingExpected(view) {
  return view ? recordNoteExpected(view) : { heads: [], tombstones: [], activeRestoreGenerations: [] };
}

function readingPlaceFailure(status, error) {
  status.textContent = ['reading-position-superseded', 'reading-position-choice-required'].includes(error?.code)
    ? tx('保存した場所が変わった。表示を確認して、続ける場所を選ぶ。', 'Your saved places changed. Check the choices and choose where to continue.')
    : tx('この場所を確認できなかった。保存した場所は残っている。', 'This place could not be verified. Your saved places are preserved.');
}

function thesClusters() {
  const out = [];
  for (const [w, edges] of Object.entries(D.sem)) {
    const near = edges.filter((e) => THES_RELS.includes(e.rel));
    if (near.length) out.push({ w, near });
  }
  // a paper thesaurus orders by reading, not by codepoint
  const key = (c) => lookup(c.w)?.r || c.w;
  out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return out;
}

function renderThesaurus(main) {
  // the word-web room: the plate first (window.openWordWeb lands here), the
  // paper thesaurus beneath it as the room's index of hand-written clusters
  main.append(el('h1', 'view-title ww-room-title', tx(...ROOM_NAMES.rooms.thesaurus)));
  const web = renderWordWeb();
  if (web) main.append(web);
  main.append(withEn(el('p', 'eyebrow thes-eyebrow', '類語 · 使い分け'), 'synonyms — and how they differ', 'en-inline'));
  main.append(el('h2', 'view-title thes-title', tx('類語辞典', 'Thesaurus')));
  const clusters = thesClusters();
  const sub = el('p', 'shelf-snippet intro');
  sub.textContent = tx(
    `${clusters.length} 語群。どの語もそのまま項目へひらく。`,
    `${clusters.length} clusters, every note hand-written. Any word opens its full entry.`,
  );
  main.append(sub);
  for (const { w, near } of clusters) {
    const block = el('div', 'thes-block');
    const rec = lookup(w);
    const head = el('button', 'thes-head');
    head.type = 'button';
    head.dataset.thes = w;
    head.append(el('span', 'thes-word', w));
    if (rec?.r && rec.r !== w) head.append(el('span', 'thes-reading', rec.r));
    if (rec?.m?.length) head.append(el('span', 'thes-gloss', rec.m[0]));
    head.addEventListener('click', () => go({ t: 'word', id: w }));
    block.append(head);
    for (const edge of near) {
      const row = el('button', 'sem-row');
      row.type = 'button';
      row.dataset.thesRow = edge.w;
      row.append(el('span', 'sem-word', edge.w));
      if (edge.rel !== 'syn') row.append(el('span', 'thes-rel', tx(...REL[edge.rel])));
      row.append(el('span', 'sem-note', edge.note));
      row.addEventListener('click', () => go({ t: 'word', id: edge.w }));
      block.append(row);
    }
    main.append(block);
  }
}

function hiraToKata(s) {
  return String(s || '').replace(/[぀-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + KATA_TO_HIRA_OFFSET));
}

function normalizeGloss(s) {
  let bare = String(s).toLowerCase();
  // the regex work is the whole index-build cost, and ~80% of glosses are
  // already clean — so pay for it only when the string actually needs it.
  if (GLOSS_MESSY.test(bare)) {
    bare = bare.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
  }
  bare = bare.trim();
  const sp = bare.indexOf(' ');
  if (sp > 0 && GLOSS_LEAD.has(bare.slice(0, sp))) return bare.slice(sp + 1);
  return bare;
}

function dictionarySearchContext(query) {
  const q = String(query || '').trim();
  const hasKanji = /[一-鿌]/.test(q);
  const hasKana = /[぀-ゖァ-ヺ]/.test(q);
  const qh = hasKana ? kataToHira(q) : ROMAJI(q);
  return {
    q,
    hasKanji,
    hasKana,
    qh,
    qk: qh ? hiraToKata(qh) : null,
    ql: q.toLowerCase(),
    qn: hasKanji || hasKana ? '' : normalizeGloss(q),
  };
}

function dictionaryQueryKey(query) {
  return String(query || '').trim();
}

function dictionaryQueryError(query) {
  const key = dictionaryQueryKey(query);
  return D.dictionaryError || D.dictionarySearchErrors?.get(key) || null;
}

function dictionaryQueryToken(query) {
  const key = dictionaryQueryKey(query);
  if (dictionaryQueryError(key)) return 'error';
  if (dictionaryQueryOpening(key)) return 'opening';
  if (D.dictionarySearchCache?.has(key)) return 'full';
  return D.dictionaryState || 'core';
}

function activeDictionaryQuery() {
  const nav = document.getElementById('nav-search-input');
  if (nav?.value.trim()) return dictionaryQueryKey(nav.value);
  if (S.view === 'shelf') return dictionaryQueryKey(S.query);
  return '';
}

function readerTokenAt(articleId, index) {
  const p = D.passages?.find((entry) => entry.id === articleId);
  if (!p?.tokens || !Number.isInteger(index) || !p.tokens[index]) return null;
  const span = typeof document !== 'undefined' ? document.querySelector(`#reader .tok[data-index="${index}"]`) : null;
  const end = span?.dataset.indexEnd != null ? Number(span.dataset.indexEnd) : null;
  if (!Number.isInteger(end) || end <= index) return p.tokens[index];
  const pieces = p.tokens.slice(index, end + 1);
  const surface = pieces.map((piece) => piece.s).join('');
  return { s: surface, b: surface, p: '名詞', r: pieces.map((piece) => piece.r || '').join(''), f: [{ t: surface }], c: false, readerSourceEnd: end };
}

function readerTokenNode(token) {
  if (!token || !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(String(token.s || ''))) return null;
  if (!token.c && PARTICLE_BY_SURFACE[token.s]) return null;
  const door = readingToken(token);
  if (!door || door.kanjiOnly || !nonEmptyString(door.b)) return null;
  return { t: 'word', id: door.b, ...(door.seq != null && door.seq !== '' ? { seq: String(door.seq) } : {}), reading: tokenReading(door) || '' };
}

function dictionaryEpoch() {
  return `${D.dictionaryIndex ? 1 : 0}:${D.dictionaryMode || ''}:${D.dictionaryState || ''}:${D.dictionaryCompleteForms?.size || 0}:${D.dictionaryByForm?.size || 0}`;
}

function yomiVariantsOf(ch) {
  if (yomiVariantCache.has(ch)) return yomiVariantCache.get(ch);
  const k = D.kanji?.[ch];
  const out = [];
  const add = (reading, type) => {
    const base = kataToHira(reading).replace(/-/g, '');
    if (!base) return;
    const seen = new Set();
    const sokuon = base.length >= 2 && 'つちくき'.includes(base.at(-1)) ? base.slice(0, -1) + 'っ' : null;
    for (const v of sokuon ? [base, sokuon] : [base]) {
      for (const head of [v[0], YOMI_DAKUTEN[v[0]], YOMI_HANDAKU[v[0]]]) {
        if (!head) continue;
        const form = head + v.slice(1);
        if (!seen.has(form)) {
          seen.add(form);
          out.push([form, type]);
        }
      }
    }
  };
  for (const on of k?.on || []) add(on, 'on');
  for (const kun of k?.kun || []) {
    add(kun.split('.')[0], 'kun'); // the stem alone (compound position)
    if (kun.includes('.')) add(kun.replace('.', ''), 'kun'); // stem + okurigana
  }
  out.sort((a, b) => b[0].length - a[0].length); // greedy: longest first
  yomiVariantCache.set(ch, out);
  return out;
}

function yomiReadingType(word, reading) {
  const target = kataToHira(reading || '');
  if (!target) return '熟';
  const chars = [...word];
  const step = (ci, rest, sawOn, sawKun) => {
    if (ci === chars.length) return rest === '' ? { sawOn, sawKun } : null;
    const ch = chars[ci];
    if (!/[一-鿿々]/.test(ch)) {
      const lit = kataToHira(ch);
      return rest.startsWith(lit) ? step(ci + 1, rest.slice(lit.length), sawOn, sawKun) : null;
    }
    const source = ch === '々' ? chars[ci - 1] : ch;
    for (const [form, type] of source ? yomiVariantsOf(source) : []) {
      if (!rest.startsWith(form)) continue;
      const hit = step(ci + 1, rest.slice(form.length), sawOn || type === 'on', sawKun || type === 'kun');
      if (hit) return hit;
    }
    return null;
  };
  const parsed = step(0, target, false, false);
  if (!parsed) return '熟';
  if (parsed.sawOn && parsed.sawKun) return '混';
  return parsed.sawOn ? '音' : '訓';
}

function exampleIdentity(id, node = null) {
  const key = String(id || '');
  const forms = new Set(key ? [key] : []);
  const alt = D.dict?.[key]?.alt;
  if (alt) forms.add(alt);
  const own = node && node.id === key ? node : { t: 'word', id: key };
  const rows = key && D.dictionaryIndex ? dictionaryDetailRowsFor(own) : [];
  for (const row of rows) {
    const written = Array.isArray(row?.[4]) ? row[4] : [];
    for (const form of written.length ? written : Array.isArray(row?.[5]) ? row[5] : []) forms.add(form);
  }
  // KT-6 (the lead's final ruling, 05:4x): the word's own entry is the one entry that writes its key with the word's own
  // reading and sense (exampleOwnRows; never a homograph: 首's こうべ entry is 頭's, 才's sense is not 歳's). Of its
  // spellings only those written with the key's own kanji are the word's (another okurigana: 押さえる, 代わる, 或る): a
  // sentence written with other kanji does not hold this word's written form (依る is not 因る, 機械 is not 器械, 表す is
  // not 現す), whatever entry the dictionary files it under. Never another entry's spelling.
  for (const row of exampleOwnRows(key)) {
    for (const form of row[4]) if (!forms.has(form) && exampleKanji(form) === exampleKanji(key)) forms.add(form);
  }
  let readings = null;
  if (own === node && (node.seq || node.reading) && rows.length) {
    readings = new Set(rows.flatMap((row) => (Array.isArray(row?.[5]) ? row[5] : []).map((kana) => kataToHira(String(kana)))));
    if (node.reading) readings.add(kataToHira(String(node.reading)));
  }
  // a kana spelling is the same spelling in either kana: ドキドキ is どきどき, ガン is がん (癌)
  const kana = new Set([...forms].filter((form) => READER_KANA.test(form)).map((form) => kataToHira(form)));
  return { forms, kana, readings };
}

function exampleKanji(form) {
  return (String(form || '').match(/\p{Script=Han}/gu) || []).join('');
}

function exampleSenseKey(gloss) {
  return normalizeGloss(String(gloss || '')).replace(/[.…]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function exampleOwnRows(key) {
  const core = D.dict?.[key];
  if (!key || !core?.r || !D.dictionaryIndex || !exampleKanji(key)) return [];
  const reading = kataToHira(core.r);
  const senses = new Set((core.m || []).flatMap((gloss) => String(gloss).split(/;\s*/u)).map(exampleSenseKey).filter(Boolean));
  return dictionaryRowsForForm(key).filter((row) => Array.isArray(row?.[4]) && row[4].includes(key) &&
    (row[5] || []).some((kana) => kataToHira(kana) === reading && dictionaryReadingSupportsForm(row, kana, key)) &&
    (row[6] || []).some((gloss) => senses.has(exampleSenseKey(gloss))));
}

function exampleTokenIsWord(token, identity) {
  if (!token?.c) return false;
  const spelled = identity.forms.has(token.b) || (READER_KANA.test(String(token.b || '')) && identity.kana.has(kataToHira(String(token.b))));
  if (!spelled) return false;
  // an inflected token's reading is its ending's too: its dictionary spelling speaks for it
  return !identity.readings || token.s !== token.b || !token.r || identity.readings.has(kataToHira(String(token.r)));
}

function exampleHoldsWord(tokens, identity) {
  return Array.isArray(tokens) && tokens.some((token) => exampleTokenIsWord(token, identity));
}

function bankExamplesFor(id, node = null) {
  const banked = D.exampleBank?.get(id);
  if (!banked?.length) return [];
  const identity = exampleIdentity(id, node);
  return banked.filter((ex) => exampleHoldsWord(ex.tokens, identity));
}

function findExamples(id, cap = 4, node = null) {
  const out = [];
  const identity = node ? exampleIdentity(id, node) : null;
  for (const p of D.passages) {
    if (D.libraryDiscoverable?.(p) === false || !p.tokens) continue; // not yet fetched — prefetch fills these in
    let sentence = [];
    let start = 0;
    let hit = false;
    for (const [index, t] of p.tokens.entries()) {
      sentence.push(t);
      if (t.c && t.b === id && (!identity || exampleTokenIsWord(t, identity))) hit = true;
      if ('。！？'.includes(t.s)) {
        if (hit) out.push({ tokens: sentence, source: learnerSourceLabel(p), passage: p.id, start });
        sentence = [];
        start = index + 1;
        hit = false;
        if (out.length >= cap) return out;
      }
    }
    if (hit && sentence.length) out.push({ tokens: sentence, source: learnerSourceLabel(p), passage: p.id, start });
    if (out.length >= cap) return out;
  }
  // the bank fills what the shelf cannot — already-fetched sentences only
  // (ensureBankExamples warms this cache; callers refresh once it lands), and only the word's own (KT-6)
  const banked = bankExamplesFor(id, node);
  if (banked.length) {
    const seen = new Set(out.map((ex) => ex.tokens.map((t) => t.s).join('')));
    for (const ex of banked) {
      if (out.length >= cap) break;
      const text = ex.tokens.map((t) => t.s).join('');
      if (!seen.has(text)) {
        seen.add(text);
        out.push(ex);
      }
    }
  }
  return out;
}

function exampleFnv(word) {
  let h = 0x811c9dc5;
  const bytes = new TextEncoder().encode(word);
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h & 15;
}

async function fetchExampleJson(path) {
  const res = await fetchData(`${EXAMPLE_DIR}/${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function readingTargets(model) {
  const result = [];
  // Reserve a few natural encounters for recent practice before filling the
  // rest from the established frontier. Provisional keys express interest,
  // not a claim of a measured struggle; exact evidence refs remain attached.
  for (const item of model.assessments?.priorities?.targets || []) {
    if (item.suppressed || result.length >= 4) continue;
    const subject = aiTeachingSubject(item.subject);
    if (!subject || !['word', 'grammar'].includes(subject.kind) ||
        result.some(target => target.kind === subject.kind && target.form === subject.form)) continue;
    result.push({ ...subject, reason: item.provisionalMisses ? 'interest' : 'recent-struggle',
      evidenceRefs: item.evidence.slice(-8).map(row => row.evidenceId) });
  }
  for (const item of model.frontier || []) {
    const [kind, ...parts] = item.key.split(':');
    const id = parts.join(':');
    const form = kind === 'word' && lookup(id) ? id :
      kind === 'grammar' ? GRAMMARS().find((grammar) => grammar.id === id)?.p : null;
    if (!form || form.length > 80 || result.some((target) => target.kind === kind && target.form === form)) continue;
    result.push({ kind, form, reason: 'recent-struggle' });
    if (result.length >= 12) break;
  }
  for (const item of model.assessments?.focus || []) {
    if (result.length >= 12) break;
    const subject = aiTeachingSubject(item.subject);
    if (!subject || !['word', 'grammar'].includes(subject.kind) ||
        result.some(target => target.kind === subject.kind && target.form === subject.form)) continue;
    result.push({ ...subject, reason: 'recent-struggle', evidenceRefs: item.evidenceIds.slice(-8) });
  }
  return result;
}

function conjugations(word, pos) {
  if (!pos || !word) return null;
  if (/godan verb/.test(pos)) {
    const last = word.slice(-1);
    const row = GODAN_ROW[last];
    if (!row) return null;
    const stem = word.slice(0, -1);
    const [a, i, e, o] = row;
    const te = word.endsWith('行く') || word === '行く' ? `${stem}って` : stem + GODAN_TE[last];
    return [
      ['ます形', 'polite', `${stem}${i}ます`],
      ['て形', 'te-form', te],
      ['た形', 'past', te.replace(/て$/, 'た').replace(/で$/, 'だ')],
      ['ない形', 'negative', `${stem}${a}ない`],
      ['可能', 'potential', `${stem}${e}る`],
      ['ば形', 'conditional', `${stem}${e}ば`],
      ['意向形', 'volitional', `${stem}${o}う`],
      ['受身', 'passive', `${stem}${a}れる`],
      ['使役', 'causative', `${stem}${a}せる`],
      ['命令形', 'imperative', `${stem}${e}`],
    ];
  }
  if (/ichidan verb/.test(pos) && word.endsWith('る')) {
    const stem = word.slice(0, -1);
    return [
      ['ます形', 'polite', `${stem}ます`],
      ['て形', 'te-form', `${stem}て`],
      ['た形', 'past', `${stem}た`],
      ['ない形', 'negative', `${stem}ない`],
      ['可能・受身', 'potential / passive', `${stem}られる`],
      ['ば形', 'conditional', `${stem}れば`],
      ['意向形', 'volitional', `${stem}よう`],
      ['使役', 'causative', `${stem}させる`],
      ['命令形', 'imperative', `${stem}ろ`],
    ];
  }
  if (/suru verb/.test(pos) && !/godan|ichidan/.test(pos) && !/する$/.test(word)) {
    return [
      ['ます形', 'polite', `${word}します`],
      ['て形', 'te-form', `${word}して`],
      ['た形', 'past', `${word}した`],
      ['ない形', 'negative', `${word}しない`],
      ['可能', 'potential', `${word}できる`],
      ['ば形', 'conditional', `${word}すれば`],
      ['意向形', 'volitional', `${word}しよう`],
      ['受身', 'passive', `${word}される`],
    ];
  }
  if (/i-adjective/.test(pos) && word.endsWith('い') && !word.endsWith('いい')) {
    const stem = word.slice(0, -1);
    return [
      ['く形', 'adverbial', `${stem}く`],
      ['て形', 'te-form', `${stem}くて`],
      ['た形', 'past', `${stem}かった`],
      ['ない形', 'negative', `${stem}くない`],
      ['ば形', 'conditional', `${stem}ければ`],
    ];
  }
  return null;
}

function renderConjugation(sheet, word, pos) {
  const rows = conjugations(word, pos);
  if (!rows) return;
  sheet.append(withEn(el('p', 'eyebrow', '活用'), 'conjugation', 'en-inline'));
  const table = el('div', 'conj-table');
  for (const [ja, en, form] of rows) {
    const row = el('div', 'conj-row');
    const label = el('span', 'conj-label');
    label.append(document.createTextNode(ja));
    if (bi()) label.append(el('span', 'conj-en', en));
    row.append(label);
    row.append(el('span', 'conj-form', form));
    table.append(row);
  }
  sheet.append(table);
}

function relationTarget(tuple) {
  return Array.isArray(tuple) ? String(tuple[0] || '').replace(/・\d+$/, '') : '';
}

function relationReadingQualifier(value) {
  return typeof value === 'string' ? value.replace(/・\d+$/, '') : '';
}

function dictionaryRelationRoute(tuple, from) {
  const target = relationTarget(tuple);
  if (!target) return null;
  const rows = dictionaryRowsForForm(target);
  for (const qualifier of tuple.slice(1)) {
    const readingQualifier = relationReadingQualifier(qualifier);
    if (!readingQualifier) continue;
    for (const row of rows) {
      const summary = dictionaryReadingSummaries(row).find(
        (candidate) =>
          kataToHira(candidate[0]) === kataToHira(readingQualifier) &&
          dictionaryReadingSupportsForm(row, candidate[0], target),
      );
      if (summary) {
        return { t: 'word', id: target, seq: String(row[0]), reading: summary[0], from };
      }
    }
  }
  if (
    D.dictionaryMode === 'worker' &&
    D.dictionaryState === 'ready' &&
    !D.dictionaryCompleteForms?.has(target)
  ) {
    const reading = tuple.slice(1).map(relationReadingQualifier).find(Boolean) || '';
    return { t: 'word', id: target, from, dictionaryPendingLookup: true, ...(reading ? { reading } : {}) };
  }
  if (rows.length || lookup(target)) return { t: 'word', id: target, from };
  return null;
}

function renderDictionaryRelations(container, titleJa, titleEn, tuples, node) {
  if (!tuples?.length) return;
  const block = el('div', 'dictionary-relations');
  block.append(withEn(el('p', 'dictionary-rel-title', titleJa), titleEn, 'en-inline'));
  for (const tuple of tuples) {
    const target = relationTarget(tuple);
    if (!target) continue;
    const route = dictionaryRelationRoute(tuple, node.from);
    const routable = !!route;
    const row = el(routable ? 'button' : 'div', routable ? 'dictionary-rel' : 'dictionary-rel muted');
    if (routable) {
      row.type = 'button';
      row.addEventListener('click', async () => {
        let destination = route;
        if (route.dictionaryPendingLookup) {
          try {
            await ensureDictionaryRowsForForm(target);
            destination = dictionaryRelationRoute(tuple, node.from);
          } catch {
            return;
          }
        }
        if (!destination) return;
        const resolved = { ...destination };
        delete resolved.dictionaryPendingLookup;
        go(resolved);
      });
    }
    row.append(el('span', 'dictionary-rel-word', target));
    // The compact detail tuple may end with an internal source/sense integer.
    // Only JMdict's textual qualifiers belong in the visible relation note.
    const qualifier = tuple.slice(1).filter((value) => typeof value === 'string').join(' · ');
    if (qualifier) row.append(el('span', 'dictionary-rel-note', qualifier));
    if (routable) row.append(el('span', 'row-go', '›'));
    block.append(row);
  }
  container.append(block);
}

function renderDictionaryDetails(container, details, node) {
  details.forEach((entry, entryIndex) => {
    const [, kanjiForms, kanaForms, senses] = entry;
    const block = el('section', 'dictionary-entry');
    if (details.length > 1 || kanjiForms.length > 1 || kanaForms.length > 1) {
      const forms = el('div', 'dictionary-forms');
      const spellings = kanjiForms.map((form) => form[0]);
      if (spellings.length) forms.append(el('span', 'dictionary-spellings', spellings.join('・')));
      forms.append(el('span', 'dictionary-readings', kanaForms.map((form) => form[0]).join('・')));
      block.append(forms);
    }
    // a usage tag every sense of this entry carries (うかな書き on ため, 丁寧語 on よろしくお願いします): once, at the entry
    const usageOf = (sense) => [...(sense[5] || []), ...(sense[6] || []), ...(sense[7] || [])];
    const entryWideTags = senses.length
      ? [...new Set(usageOf(senses[0]).filter((tag) => senses.every((sense) => usageOf(sense).includes(tag))))]
      : [];
    if (entryWideTags.length) block.append(el('p', 'sense-usage dictionary-usage', quietUsageTags(entryWideTags)));
    let previousPos = '';
    senses.forEach((sense, senseIndex) => {
      const [
        partOfSpeech,
        appliesToKanji,
        appliesToKana,
        related,
        antonym,
        field,
        dialect,
        misc,
        info,
        languageSources,
        glosses,
      ] = sense;
      const section = el('div', 'dictionary-sense');
      section.append(el('span', 'dictionary-sense-number', String(senseIndex + 1)));
      const body = el('div', 'dictionary-sense-body');
      const pos = posLine(partOfSpeech);
      // Hfix-2d r2 · the part-of-speech line holds parts of speech only, printed when it changes (and always
      // on the sense this text uses); field, dialect and usage tags sit beside their own sense as quiet
      // bracketed tags, and a tag every sense carries shows once, at the entry
      const usageTags = [...new Set([...field, ...dialect, ...misc])].filter((tag) => !entryWideTags.includes(tag));
      const inText = node?.sense || SENSE_BY_ANCHOR.get(heroSource.get(node));
      const isTextSense = inText && String(inText.seq) === String(entry[0]) && Number(inText.k) === senseIndex;
      if (pos && (pos !== previousPos || isTextSense)) body.append(el('p', 'sense-pos', pos));
      if (pos) previousPos = pos;
      if (usageTags.length) body.append(el('p', 'sense-usage', quietUsageTags(usageTags)));
      const restrictions = [];
      if (appliesToKanji?.length && appliesToKanji[0] !== '*') {
        restrictions.push(tx(`${appliesToKanji.join('・')} の語義`, `for ${appliesToKanji.join('・')}`));
      }
      if (appliesToKana?.length && appliesToKana[0] !== '*') {
        restrictions.push(tx(`${appliesToKana.join('・')} の読み`, `with reading ${appliesToKana.join('・')}`));
      }
      if (restrictions.length) body.append(el('p', 'dictionary-restriction', restrictions.join(' · ')));
      const meanings = glosses.map((gloss) => {
        const [text, gender, type] = gloss;
        const marks = [type, gender].filter(Boolean);
        return marks.length ? `${text} (${marks.join(', ')})` : text;
      });
      if (meanings.length === 1) body.append(el('p', 'gloss', meanings[0]));
      else {
        const list = el('ul', 'dictionary-glosses');
        for (const meaning of meanings) list.append(el('li', null, meaning));
        body.append(list);
      }
      for (const note of info || []) body.append(el('p', 'dictionary-info', note));
      if (languageSources?.length) {
        const sources = languageSources
          .map(([lang, full, wasei, text]) =>
            [lang, text, full ? 'full form' : null, wasei ? 'wasei' : null].filter(Boolean).join(' · '),
          )
          .join('; ');
        body.append(el('p', 'dictionary-info', tx(`語源 ${sources}`, `source ${sources}`)));
      }
      renderDictionaryRelations(body, '関連する語', 'related words', related, node);
      renderDictionaryRelations(body, '対義語', 'opposites', antonym, node);
      // R3 · the sense the word's text uses, marked among them all (senseDoor): the node's, else the one the slip of the
      // word it was opened from showed
      if (isTextSense) {
        section.classList.add('dictionary-sense-in-text');
        section.setAttribute('aria-current', 'true');
        body.prepend(el('p', 'dictionary-info', tx('この文での意味', 'the meaning in this text')));
      }
      section.append(body);
      block.append(section);
    });
    if (entryIndex < details.length - 1) block.append(el('div', 'dictionary-entry-rule'));
    container.append(block);
  });
}

function dictionaryHomographChoices(form) {
  const choices = [];
  const seen = new Set();
  for (const row of dictionaryRowsForForm(form)) {
    for (const summary of dictionaryReadingSummaries(row)) {
      if (!dictionaryReadingSupportsForm(row, summary[0], form)) continue;
      const key = `${row[0]}\u0000${summary[0]}\u0000${summary[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      choices.push({ row, summary: [summary[0], form, summary[2]] });
    }
  }
  const enabledOnCore = !!D.dict?.[form];
  return choices.map((choice) => ({ ...choice, enabledOnCore }));
}

function homographLines(choices, isActive) {
  const lines = [];
  const byGloss = new Map();
  for (const choice of choices) {
    const gloss = String(choice.summary[2] || '').trim().toLowerCase();
    const key = gloss ? `${choice.row[0]}\u0000${gloss}` : null;
    const line = key ? byGloss.get(key) : null;
    if (line) { line.members.push(choice); continue; }
    const fresh = { members: [choice] };
    if (key) byGloss.set(key, fresh);
    lines.push(fresh);
  }
  return lines.map(({ members }) => {
    const active = members.find(isActive) || null;
    const head = active || members[0];
    return { head, also: members.filter((member) => member !== head), active: !!active };
  });
}

function dictionaryLoneDoor(node) {
  if (node.seq != null && node.seq !== '') return false;
  const choices = dictionaryHomographChoices(node.id);
  return choices.length === 1 && choices[0].enabledOnCore;
}

function renderDictionaryHomographs(container, node, { head = false } = {}) {
  const choices = dictionaryHomographChoices(node.id);
  const seqless = node.seq == null || node.seq === '';
  // a seq-less core sheet shows even a lone entry, as a door (D23 B2)
  const coreDoors = seqless && choices.some((choice) => choice.enabledOnCore);
  if (choices.length <= 1 && !coreDoors) return;
  // Hfix-1A · the lone door as the head of its entry's block: its spellings and reading, the senses under it say the rest
  head = head && choices.length === 1;
  const currentSeq = String(node.seq || node.dictionaryResolvedSeq || '');
  const currentReading = kataToHira(node.reading || lookup(node.id, node.seq)?.r || '');
  const block = el('div', head ? 'dictionary-homographs is-entry-head' : 'dictionary-homographs');
  block.append(
    choices.length === 1
      ? withEn(el('p', 'dictionary-rel-title', '辞書の項目'), 'Dictionary entry', 'en-inline')
      : withEn(
        el('p', 'dictionary-rel-title', `同じ形の ${choices.length} 項目`),
        `${choices.length} readings or entries share this form`,
        'en-inline',
      ),
  );
  // only an explicit sheet's own entry is no door to itself; on a seq-less core sheet the
  // resolved entry the senses below come from is still a door (D23, Codex 16:20:08Z)
  const isActive = ({ row, summary, enabledOnCore }) => !(seqless && enabledOnCore) && String(row[0]) === currentSeq &&
    (!currentReading || kataToHira(summary[0]) === currentReading);
  for (const { head, also, active } of homographLines(choices, isActive)) {
    const [seq] = head.row;
    const [reading, headForm, primaryGloss] = head.summary;
    const choice = el('button', active ? 'dictionary-homograph active' : 'dictionary-homograph');
    choice.type = 'button';
    choice.dataset.dictionaryEntry = String(seq);
    if (also.length) choice.dataset.alsoEntries = also.map((member) => String(member.row[0])).join(' ');
    choice.setAttribute('aria-pressed', String(active));
    const stack = el('span', 'row-stack');
    const top = el('span', 'row-word');
    top.append(document.createTextNode(headForm));
    if (reading) top.append(el('span', 'row-reading', reading));
    if (also.length) {
      const readings = also.map((member) => member.summary[0]).filter(Boolean);
      const more = el('span', 'row-also', tx('ほかに ', 'also '));
      const kana = el('span', null, readings.join(tx('、', ', ')));
      kana.lang = 'ja';
      more.append(kana);
      top.append(more);
    }
    stack.append(top);
    if (primaryGloss && !head) stack.append(el('span', 'row-gloss', primaryGloss));
    if (head) choice.setAttribute('aria-label', tx(`辞書の項目「${headForm}」${reading}をひらく`, `Open the dictionary entry ${headForm} ${reading}`));
    choice.append(stack, el('span', 'row-go', active ? '·' : '›'));
    choice.addEventListener('click', () => {
      // guard by CONTENT, not object identity — async dictionary resolution
      // can replace the stack-top object after this row rendered, and the
      // identity check made the tap a silent no-op
      const top = S.stack[S.stack.length - 1];
      if (active || !top || top.t !== 'word' || top.id !== node.id) return;
      // a homograph is a DOOR, not a correction: it PUSHES, so ← 戻る
      // returns to the entry the learner was reading (replacing the stack
      // top made back close the whole sheet — P1, full-instrument review). G1: it opens as every page does (go)
      go({ t: 'word', id: headForm, seq: String(seq), reading, from: node.from || null },
        { invoker: choice, from: choice.querySelector('.row-word') });
    });
    block.append(choice);
  }
  container.append(block);
}

function requestDictionaryDetails(node) {
  if (node.dictionaryPending || node.dictionaryReady) return;
  node.dictionaryPending = true;
  node.dictionaryError = null;
  ensureDictionaryDetails(node)
    .then(() => {
      node.dictionaryPending = false;
      node.dictionaryReady = true;
      refreshWordSheet(node);
    })
    .catch((err) => {
      node.dictionaryPending = false;
      node.dictionaryError = err;
      refreshWordSheet(node);
    });
}

function exampleOrder(node, examples) {
  const own = ownSentenceExample(node);
  const text = (ex) => ex.tokens.map((token) => token.s).join('');
  // the shelf's copy of the same sentence (its bounds may differ by a bracket) is the word's own one, not another example
  const index = node.from?.index;
  const rest = examples.filter((ex) => !own || !(ex.passage === own.passage && Number.isInteger(ex.start) &&
    ex.start <= index && index < ex.start + ex.tokens.length));
  const short = rest.find((ex) => ex.en && [...text(ex)].length <= SHORT_EXAMPLE_CHARS) || null;
  let first = [own, short].filter(Boolean);
  if (!first.length && rest.length) first = [[...rest].sort((a, b) => [...text(a)].length - [...text(b)].length)[0]];
  return { first, more: rest.filter((ex) => !first.includes(ex)) };
}

function partGloss(c, part) {
  const flesh = part === '月' && (D.kanji?.[c]?.parts || []).includes('肉');
  // a written form with no meaning of its own takes its standalone form's (亻 is person)
  return partMeaning(D.kanji?.[flesh ? '肉' : part]?.m) || partMeaning(D.kanji?.[(PART_WRITTEN[part] || [])[0]]?.m);
}

function partMeaning(text) {
  return String(text || '').split('(')[0].replace(/\s*\bradical\b.*$/iu, '').split(/[;,]/u)[0].replace(/\s{2,}/gu, ' ').trim().toLowerCase();
}

function displayKunReading(reading) {
  const value = String(reading || '');
  const dot = value.indexOf('.');
  return dot < 0 ? value : `${value.slice(0, dot)}（${value.slice(dot + 1)}）`;
}

export { lookup, embeddedDictionaryJson, loadDictionaryJson, hasEmbeddedDictionaryIndex, dictionaryCoreMatch, dictionaryGlossSummary, dictionaryReadingSupportsForm, dictionarySummaryFor, validDictionaryRow, dictionaryRowsForForm, ensureDictionaryRowBySeq, ensureDictionaryRowsForForm, ensureDictionaryRowsForNode, dictionaryRowsFor, dictionaryDetailRowsFor, dictionaryShardNumber, dictionaryShardId, ensureDictionaryDetails, dictionaryDetailsFor, dictionaryTag, posCode, posLine, kanjiReadingsInWord, displayPairs, inlineWordReading, inlineGlossLine, inlineWordGloss, inlineTokenGloss, tokenGlossLine, readingLine, japaneseLookupRecord, japaneseLookupEntryRecord, lookupBlockWords, japaneseLookupHelpId, lookupOccurrence, lookupItemBlocks, annotationPieceReadings, annotationReadsAs, phoneticAnnotationCandidates, phoneticAnnotationRanges, phoneticAnnotationIndices, appendJapaneseLookup, inlineGloss, readerWordNote, readerGlossMissText, tokenReading, lemmaTakesForm, lemmaReading, kanaIru, readingForm, teFormSenseGlosses, teFormAnswer, ensureTeFormAnswer, teFormRecord, senseNeighbours, sidecarSense, senseNegation, senseSpelledReading, senseMustRun, senseExpression, senseChoice, senseDoor, senseIsQuick, senseRecord, senseNameHeldText, senseMoreElement, senseMoreLine, ensureSense, senseRefine, senseFillInPlace, senseWithin, narrowLemmaEntries, dictionaryRowsReadAs, alternateLemmaDoor, soundChangeReadings, kanjiReadingsOf, soundChangeDoor, readerLookupAnswer, readingAsksIndex, readyTokenReading, readingToken, readingTokenEntry, readerTokenAtIndex, readerRenderedTokens, dictionaryAnsweredForm, readerDoorGloss, readerDoorLead, readerGlossLine, tapLadderHint, readerWordHint, readerTokenState, nameReaderToken, readerHelp, glossaryCrossRefPlan, readerLayerParagraph, readerLayerReading, readingExpected, readingPlaceFailure, thesClusters, renderThesaurus, hiraToKata, normalizeGloss, dictionarySearchContext, dictionaryQueryKey, dictionaryQueryError, dictionaryQueryToken, activeDictionaryQuery, readerTokenAt, readerTokenNode, dictionaryEpoch, yomiVariantsOf, yomiReadingType, exampleIdentity, exampleKanji, exampleSenseKey, exampleOwnRows, exampleTokenIsWord, exampleHoldsWord, bankExamplesFor, findExamples, exampleFnv, fetchExampleJson, readingTargets, conjugations, renderConjugation, relationTarget, relationReadingQualifier, dictionaryRelationRoute, renderDictionaryRelations, renderDictionaryDetails, dictionaryHomographChoices, homographLines, dictionaryLoneDoor, renderDictionaryHomographs, requestDictionaryDetails, exampleOrder, partGloss, partMeaning, displayKunReading };

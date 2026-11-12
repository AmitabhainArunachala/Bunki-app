/** study-host seam: split out of corridor.js (G3); now edited here directly. */
import { D, DOJO_DECKS, INK_DEPTH, KAGAMI_CODE_BAND, KAGAMI_MODEL_VERSION, LEARN_STAGE_DECKS, LESSON_SIZE, MINI_INK, NEW_PER_DAY_DEFAULT, PARTICLES, REVIEWS_PER_DAY_DEFAULT, ROOM_NAMES, S, SRS_KINDS, SRS_PREF_LADDERS, SRS_PRESETS, allAssessmentEvidence, bi, cardRecall, deckSummaries, el, finiteNumber, focusKanjiItem, guidedTaken, isLeech, jlptRank, kagamiBandFor, kagamiLevelOf, kagamiMockBand, kanjiAnswerAvailable, kataToHira, laneMembers, learnDeckSummary, learnStageFace, nonEmptyString, openDeck, openGuidedRoom, owns, placesLayout, plainRecord, proseWordRovers, renderReviewHall, renderStudyHall, retainedKanjiRecord, roomName, savedAnswerFor, srsDueItems, srsKey, srsParamsProblem, srsRoomBack, srsSchedulePolicy, studyHallDoors, todayQueue, tx, validNewPerDay, validPauseEvery, validPreset, validRetention, validReviewsPerDay, withEn } from '../corridor.js';
import { readerCaptureReasonText } from './capture.mjs';
import { lookup } from './dictionary.mjs';
import { dayKey, kagamiBand, kagamiEdge, kagamiNote, monthKey, monthLabel, startOfDay, todayDateline, todaySecondsPerCard } from './drift.mjs';
import { keepSentencePracticeFocusVisible } from './return.mjs';
import { wordCaptureHeldText, wordCaptureState, wordPresentationKey } from './word-entry.mjs';
import { GRAMMARS } from './worlds.mjs';

function sharedStudyActive() {
  return !!window.bunkiSharedStudyHost || new URLSearchParams(location.search).get('sharedStudy') === 'preview';
}

function sharedStudyFence(main) {
  main.append(el('p','card-kind',tx('この練習は共通の学習にまだ対応していません。記録は保持されています。','This practice is not mapped to shared study. Its existing history is preserved.')));
}

function learnerSourceLabel(p) {
  return String(p.sourceLabel || '').replace(/\s*·\s*検収前/gu, '').replace(/^N3書き換え\s*·\s*/u, '').trim();
}

function gradeTag(p) {
  const grade = p.readingFacets?.schoolGrade;
  if (!grade) return document.createTextNode('');
  // H2-fix (H2-8): plain words, not "Kanji secondary+". The measure: the school year by which nine in ten of the
  // story's kanji are taught (reading_facets.py), so "secondary" means more than one in ten come after elementary school
  const secondary = grade === 'secondary';
  const tag = el('span', 'grade-tag', secondary ? tx('中学以上の漢字', 'Kanji beyond elementary school') : tx(`漢字 小${grade}`, `Kanji grade ${grade}`));
  // a label, like the level beside it: not prose to look up
  tag.dataset.japaneseLookup = 'off';
  tag.title = secondary ? tx('小学校のあとで習う漢字が、1割より多く使われている', 'More than one in ten of its kanji are taught after elementary school')
    : tx(`漢字の9割は小学${grade}年までに習うもの`, `Nine in ten of its kanji are taught by school grade ${grade}`);
  return tag;
}

function focusProseWord(word, options = { preventScroll: true }) {
  const block = word?.closest?.('[data-prose-roving]');
  const rover = block && proseWordRovers.get(block);
  if (rover && word.matches(rover.selector)) rover.focus(word, options);
  else word?.focus?.(options);
}

function cardInk(card) {
  const box = card.getBoundingClientRect(), range = document.createRange(), spans = [];
  const add = (r) => { if (r.width > 0.5 && r.height > 0.5) spans.push([r.top - box.top + card.scrollTop, r.bottom - box.top + card.scrollTop]); };
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const host = text.parentElement;
    if (!text.nodeValue.trim() || !host?.getClientRects().length || host.closest('.visually-hidden, [hidden]')) continue;
    const style = getComputedStyle(host);
    if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    range.selectNodeContents(text);
    for (const r of range.getClientRects()) add(r);
  }
  for (const node of card.querySelectorAll(MINI_INK)) if (node.getClientRects().length) add(node.getBoundingClientRect());
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [top, bottom] of spans) {
    const last = merged.at(-1);
    if (last && top <= last[1]) last[1] = Math.max(last[1], bottom);
    else merged.push([top, bottom]);
  }
  return merged;
}

function markCardMore(card) {
  const more = card.style.overflowY === 'auto' && card.scrollHeight - card.scrollTop - card.clientHeight > 1;
  if (card.dataset.more !== String(more)) card.dataset.more = String(more);
  if (!more) return;
  const box = card.getBoundingClientRect(), cut = box.top + card.clientHeight + card.scrollTop - 1;
  const band = [...card.children].find((node) => { const b = node.getBoundingClientRect(); return b.top + card.scrollTop <= cut && b.bottom + card.scrollTop > cut; });
  const ground = band ? getComputedStyle(band).backgroundColor : '';
  if (ground && ground !== 'transparent' && !/[,/]\s*0\)$/u.test(ground)) card.style.setProperty('--mini-more-ground', ground);
  else card.style.removeProperty('--mini-more-ground');
}

function focusReturnMarkOnce(mark) {
  const release = () => mark.removeAttribute('tabindex');
  mark.addEventListener('blur', release, { once: true });
  mark.addEventListener('pointerdown', release, { once: true, capture: true });
}

function srsPresetState(prefs = S.srsPrefs) {
  if (validPreset(prefs?.preset)) {
    return { base: prefs.preset.replace(/^custom:/u, ''), custom: prefs.preset.startsWith('custom:'), label: prefs.preset };
  }
  const std = SRS_PRESETS.standard;
  const custom = (validNewPerDay(prefs?.newPerDay) && prefs.newPerDay !== std.newPerDay) ||
    (validReviewsPerDay(prefs?.reviewsPerDay) && prefs.reviewsPerDay !== std.reviewsPerDay) ||
    (validRetention(prefs?.retention) && prefs.retention !== std.retention);
  return { base: 'standard', custom, label: custom ? 'custom:standard' : 'standard' };
}

function srsPrefValue(prefs, key) {
  if (key === 'newPerDay') return validNewPerDay(prefs?.newPerDay) ? prefs.newPerDay : NEW_PER_DAY_DEFAULT;
  if (key === 'reviewsPerDay') return validReviewsPerDay(prefs?.reviewsPerDay) ? prefs.reviewsPerDay : REVIEWS_PER_DAY_DEFAULT;
  return Number.isInteger(prefs?.pauseEvery) && validPauseEvery(prefs.pauseEvery) ? prefs.pauseEvery : null;
}

function srsPrefStep(key, value, direction) {
  const ladder = SRS_PREF_LADDERS[key];
  const rank = (v) => (v === null ? -1 : v);
  if (direction > 0) return ladder.find((v) => rank(v) > rank(value)) ?? value;
  const lower = ladder.filter((v) => rank(v) < rank(value));
  return lower.length ? lower[lower.length - 1] : value;
}

function lessonLaneIds(kind, lvl) {
  return (kind === 'kanji' ? laneMembers().kanken[lvl] : laneMembers().jlpt[lvl]) || [];
}

function lessonPlan(kind, lvl) {
  const ids = lessonLaneIds(kind, lvl);
  const out = [];
  // K08 · a lane's last few items are a short lesson of their own (鹿 alone in 7級): never dropped, and the
  // lessons before keep their ids and items, so a kept score still names the same ten
  for (let i = 0; i < ids.length; i += LESSON_SIZE) {
    const words = ids.slice(i, i + LESSON_SIZE);
    out.push({ id: `${lvl}-${out.length + 1}`, lvl, kind, words });
  }
  return out;
}

function lessonMissedLast(lesson) {
  const done = S.lessonsDone?.[lesson.id];
  if (!done) return [];
  const kind = lesson.kind || 'word';
  const missed = new Set((S.obslog || [])
    .filter((row) => row[1] === 'lesson' && row[4] === lesson.id && row[0] === done.ts && row[3] === 1)
    .map((row) => row[2]));
  return lesson.words.filter((w) => missed.has(srsKey(kind, w)));
}

function lessonPreviousRuns() {
  const runs = new Map();
  for (const row of S.obslog || []) {
    if (row[1] !== 'lesson' || !S.lessonsDone?.[row[4]]) continue;
    const byTime = runs.get(row[4]) || new Map();
    const run = byTime.get(row[0]) || { score: 0, total: 0 };
    run.total += 1;
    if (row[3] === 3) run.score += 1;
    byTime.set(row[0], run);
    runs.set(row[4], byTime);
  }
  const previous = new Map();
  for (const [id, byTime] of runs) {
    const before = [...byTime.keys()].filter((ts) => ts < S.lessonsDone[id].ts).sort((a, b) => b - a)[0];
    if (before != null) previous.set(id, byTime.get(before));
  }
  return previous;
}

function lessonGloss(kind, id) {
  return kind === 'kanji' ? D.kanji[id]?.m || '' : lookup(id)?.m?.[0] || '';
}

function lessonChoices(run) {
  const word = run.words[run.ix];
  const right = lessonGloss(run.kind, word);
  const pool = lessonLaneIds(run.kind, run.lvl).filter((w) => w !== word);
  const wrong = new Set();
  while (wrong.size < 3 && wrong.size < pool.length) {
    const cand = lessonGloss(run.kind, pool[Math.floor(Math.random() * pool.length)]);
    if (cand && cand !== right) wrong.add(cand);
  }
  const opts = [right, ...wrong];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { right, opts };
}

function learningEnrollHeldText(node) {
  if (node?.t !== 'word') return null;
  const state = wordCaptureState(node);
  return state === 'conflict' || state === 'unavailable' ? wordCaptureHeldText(node) : null;
}

function practiceIdentity(prefix) {
  if (!globalThis.crypto?.randomUUID) throw new Error('Practice identity unavailable');
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

function mockSubjectKey(subject) {
  if (!nonEmptyString(subject)) return null;
  const cut = subject.indexOf(':');
  if (cut < 1) return null;
  const t = subject.slice(0, cut);
  const id = subject.slice(cut + 1);
  if (!id || !['word', 'kanji'].includes(t)) return null;
  const known = t === 'kanji' ? !!D.kanji?.[id] : !!lookup(id);
  if (!known && !S.taken.some((item) => item.t === t && item.id === id)) return null;
  return srsKey(t, id);
}

function learnerModel() {
  const state = S;
  const bands = {
    lexis: kagamiBand(),
    readings: kagamiBand(),
    syntax: kagamiBand(),
    production: kagamiBand(),
  };
  const nodes = {};
  const pairs = new Map();
  const unverifiedPractice = { rows: 0, byBand: { lexis: 0, readings: 0, syntax: 0, production: 0 } };
  const touch = (key, right, measured, kind) => {
    const node = nodes[key] || (nodes[key] = { seen: 0, right: 0, measured: 0, observed: 0, kinds: {} });
    node.kinds[kind] = (node.kinds[kind] || 0) + 1;
    if (right === null) return;
    node.seen += 1;
    if (right) node.right += 1;
    if (measured) node.measured += 1;
    else node.observed += 1;
  };

  // A drill undo is a bare [t,'dojo',key,0] row that revokes the most recent
  // standing dojo grade for that key (review round 10). Counting it as a
  // failure AND keeping the grade it withdrew made undoing practice lower the
  // mirror twice over. Both rows are struck here, in append order, so
  // repeated grades and repeated undos unwind the way they were made.
  const obslog = state.obslog || [];
  const struck = new Set();
  const standing = new Map();
  obslog.forEach((row, ix) => {
    if (!Array.isArray(row) || row[1] !== 'dojo' || !nonEmptyString(row[2])) return;
    const stack = standing.get(row[2]) || [];
    if (row[3] === 0) {
      struck.add(ix);
      if (stack.length) struck.add(stack.pop());
    } else {
      stack.push(ix);
    }
    standing.set(row[2], stack);
  });

  obslog.forEach((row, ix) => {
    if (!Array.isArray(row) || struck.has(ix)) return;
    const kind = row[1];
    const key = row[2];
    if (kind === 'note' || !nonEmptyString(key)) return;
    const level = kagamiLevelOf(key);
    if (kind === 'probe') {
      touch(key, row[3] === 3, true, kind);
      kagamiNote(bands.readings, level, row[3] === 3, true);
    } else if (kind === 'mock') {
      // Legacy rows contain no immutable form/item revision, editorial
      // decision, attempt identity or assistance record. Keep the encounter
      // and its modality, but never infer measured recall from that key.
      touch(key, null, false, kind);
      unverifiedPractice.rows += 1;
      const dimension = kagamiMockBand(row[4], key);
      if (owns(unverifiedPractice.byBand, dimension)) unverifiedPractice.byBand[dimension] += 1;
    } else if (kind === 'lesson' || kind === 'dojo') {
      // Again alone is the miss: Hard is a recall that came hard, as Anki's
      // buttons mean it (review round 11); lesson and mock rows use 1|3 and
      // read the same either way.
      const right = row[3] >= 2;
      touch(key, right, true, kind);
      const band = bands[kagamiBandFor(key)];
      if (band) kagamiNote(band, level, right, true);
    } else if (kind === 'sensei') {
      const right = row[3] === 3;
      const band = bands[KAGAMI_CODE_BAND[row[4]]];
      touch(key, right, false, kind);
      if (band) kagamiNote(band, level, right, false);
    } else if (kind === 'confuse') {
      const other = row[3];
      if (!nonEmptyString(other) || other === key) return;
      touch(key, null, false, kind);
      touch(other, null, false, kind);
      const pair = key < other ? `${key}\u0000${other}` : `${other}\u0000${key}`;
      pairs.set(pair, (pairs.get(pair) || 0) + 1);
    } else {
      // tap · reveal · drift — encounters and friction, never a verdict
      touch(key, null, true, kind);
    }
  });

  // Real reviews are the heaviest measured evidence there is. A revocation
  // names the row it undoes ([t, key, 0, revokedIndex]), so an undone grade
  // is not counted — the mirror shows what stands, not what was withdrawn.
  const revlog = state.revlog || [];
  const revoked = new Set();
  for (const row of revlog) if (Array.isArray(row) && row[2] === 0) revoked.add(row[3]);
  revlog.forEach((row, ix) => {
    if (!Array.isArray(row) || row[2] === 0 || revoked.has(ix)) return;
    const key = row[1];
    if (!nonEmptyString(key)) return;
    const right = row[2] >= 2;
    touch(key, right, true, 'review');
    const band = bands[kagamiBandFor(key)];
    if (band) kagamiNote(band, kagamiLevelOf(key), right, true);
  });

  for (const band of Object.values(bands)) band.edge = kagamiEdge(band);

  const edges = [...pairs.entries()]
    .map(([pair, n]) => {
      const [a, b] = pair.split('\u0000');
      return { a, b, n };
    })
    .sort((x, y) => y.n - x.n || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0))
    .slice(0, 12);

  // the frontier: nodes the learner has met and not yet settled — mixed or
  // failing evidence, hardest-looking first. These are the doors the drift
  // and the custom papers will pull from; here they are only shown.
  const frontier = Object.entries(nodes)
    .filter(([, node]) => node.seen >= 2 && node.right < node.seen)
    .map(([key, node]) => ({ key, seen: node.seen, right: node.right }))
    .sort(
      (x, y) =>
        x.right / x.seen - y.right / y.seen ||
        y.seen - x.seen ||
        (x.key < y.key ? -1 : x.key > y.key ? 1 : 0),
    )
    .slice(0, 12);

  const leeches = (state.taken || [])
    .filter((item) => isLeech(item))
    .map((item) => srsKey(item.t, item.id))
    .sort();

  const totals = Object.values(bands).reduce(
    (acc, band) => ({
      rows: acc.rows + band.evidence,
      measured: acc.measured + band.measured,
      observed: acc.observed + band.observed,
    }),
    { rows: 0, measured: 0, observed: 0 },
  );

  const assessments = allAssessmentEvidence(state);
  const assessmentEdges = [];
  for (const focus of assessments.focus) {
    if (!/^(word|kanji|grammar|particle):/u.test(focus.subject)) continue;
    const node = nodes[focus.subject] ||= { seen: 0, right: 0, measured: 0, observed: 0, kinds: {} };
    node.assessment = { misses: focus.misses, evidenceIds: [...focus.evidenceIds] };
    for (const evidenceId of focus.evidenceIds.slice(-8))
      assessmentEdges.push({ from: evidenceId, to: focus.subject, kind: 'assessment-miss', modality: 'observed' });
  }
  // Re-encounter suggestions remain a separate modality. In particular, a
  // provisional answer key cannot increment measured/observed right or seen.
  for (const target of assessments.priorities.targets) {
    if (target.suppressed || !/^(word|kanji|grammar|particle):/u.test(target.subject)) continue;
    const node = nodes[target.subject] ||= { seen: 0, right: 0, measured: 0, observed: 0, kinds: {} };
    node.practicePriority = { misses: target.misses, provisionalMisses: target.provisionalMisses,
      evidenceIds: target.evidence.map(row => row.evidenceId) };
    for (const evidence of target.evidence.slice(-8)) assessmentEdges.push({
      from: evidence.evidenceId, to: target.subject, kind: 'practice-reencounter',
      modality: evidence.provisional ? 'provisional' : 'practice',
    });
  }
  const model = { modelVersion: KAGAMI_MODEL_VERSION, admissionPolicyVersion: 'kagami-admission/2',
    bands, nodes, edges, frontier, leeches, totals, unverifiedPractice,
    assessments, assessmentEdges };
  return model;
}

function learningContextRef(item) {
  return item.sourceContextRef || S.taken.find((row) => row.t === item.t && row.id === item.id)?.sourceContextRef || null;
}

function learningItemNode(item) {
  const saved = S.taken.find((row) => row.t === item.t && row.id === item.id) || item;
  const sourceContextRef = learningContextRef(item);
  const context = S.teacherContexts?.entries.find((entry) => entry.id === sourceContextRef);
  return { t: item.t, id: item.id, from: saved.from || null,
    ...(saved.entrySeq ? { seq: saved.entrySeq } : {}),
    ...(saved.cueReading ? { reading: saved.cueReading } : {}),
    ...(context ? { sourceContext: context, sourceContextRef } : {}) };
}

function focusSentencePracticeTarget(id, state = S.sentencePracticeView) {
  requestAnimationFrame(() => {
    if (S.view !== 'sentence-practice' || S.sentencePracticeView !== state) return;
    const target = document.getElementById(id);
    target?.focus({ preventScroll: true }); keepSentencePracticeFocusVisible(target);
  });
}

function srsLearnerPolicy() {
  if (!D.pin) return null;
  const fitted = S.srsPrefs?.fsrs;
  const policy = srsSchedulePolicy(D.pin);
  return { w: fitted !== undefined && !srsParamsProblem(fitted) ? fitted.w.slice() : null, retention: policy.retention, learningSteps: policy.learningSteps };
}

function srsWhen(item) {
  if (S.suspended[srsKey(item.t, item.id)]) return tx('休み中', 'resting');
  const rec = S.srs[srsKey(item.t, item.id)];
  // an unstarted row tells the truth: it holds no card and owes no review
  if (!rec) return finiteNumber(item.started) ? tx('新規', 'new') : tx('未着手', 'not started');
  const now = new Date();
  const due = new Date(rec.due);
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return tx('いま', 'due now');
  const mins = Math.round(ms / 60000);
  if (mins < 60) return tx(`${mins} 分後`, `in ${mins} min`);
  const dayGap = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);
  if (dayGap === 0) return tx(`${Math.round(mins / 60)} 時間後`, `in ${Math.round(mins / 60)} h`);
  if (dayGap === 1) return tx('明日', 'tomorrow');
  return tx(`${dayGap} 日後`, `in ${dayGap} d`);
}

function srsForecast(now = new Date()) {
  const f = { today: 0, tomorrow: 0, week: 0, fresh: 0, unstarted: 0 };
  const DAY = 86400000;
  // Calendar buckets, the way a person counts: everything due before tonight's
  // midnight is TODAY (a card due in three hours is not 明日), tomorrow is
  // tomorrow's calendar day, and the week is the six days after that.
  const endToday = startOfDay(now) + DAY;
  const endTomorrow = endToday + DAY;
  const endWeek = endToday + 7 * DAY;
  for (const item of S.taken) {
    const key = srsKey(item.t, item.id);
    if (S.suspended[key]) continue;
    const rec = S.srs[key];
    if (!rec) {
      if (finiteNumber(item.started)) f.fresh += 1;
      else f.unstarted += 1;
      continue;
    }
    const due = new Date(rec.due).getTime();
    if (due < endToday) f.today += 1;
    else if (due < endTomorrow) f.tomorrow += 1;
    else if (due < endWeek) f.week += 1;
  }
  return f;
}

function reviewAnswerAvailable(item, record = S) {
  return item.t === 'word' ? savedAnswerFor(item, record)?.status === 'available' : kanjiAnswerAvailable(item, record);
}

function reviewCardBack(item, answer = null) {
  if (item.t !== 'word') return reviewBack(item);
  const resolved = answer || savedAnswerFor(item);
  return resolved?.status === 'available' ? { reading: resolved.reading, senses: resolved.meanings.slice(0, 4) } : null;
}

function presentReviewAnswer(rv, record = S) {
  const item = rv?.queue?.[rv.ix];
  if (!rv?.revealed || item?.t !== 'word') return null;
  const answer = savedAnswerFor(item, record);
  if (answer?.status !== 'available') return { state: 'unavailable', answer };
  const key = wordPresentationKey(item, answer);
  const bound = rv.presented;
  if (!bound || bound.item !== item || bound.ix !== rv.ix) {
    rv.presented = { item, ix: rv.ix, key };
    return { state: 'shown', answer };
  }
  return { state: bound.key === key ? 'shown' : 'changed', answer };
}

function reviewBack(item) {
  if (item.t === 'word') {
    const rec = lookup(item.id);
    if (rec) return { reading: rec.r || '', senses: (rec.m || []).slice(0, 4) };
  }
  if (item.t === 'kanji') {
    const k = retainedKanjiRecord(item.id) || D.kanji[item.id];
    if (k)
      return {
        reading: [...(k.on || []), ...(k.kun || [])].slice(0, 6).join('・'),
        senses: [k.m].filter(Boolean),
      };
  }
  if (item.t === 'radical') {
    const r = D.radicals[item.id];
    if (r) return { reading: '', senses: [r.name || tx('名称のない部品', 'an unnamed part')] };
  }
  if (item.t === 'idiom') {
    const i = D.idioms[item.id];
    if (i) return { reading: i.r || '', senses: (i.g || []).slice(0, 3) };
  }
  if (item.t === 'grammar') {
    const g = GRAMMARS().find((x) => x.id === item.id);
    if (g) {
      const ex = g.ex?.[0];
      return {
        reading: g.form || '',
        senses: [bi() ? g.mEn : g.mJa || g.mEn, ...(ex ? [`${ex.ja} — ${ex.en}`] : [])],
      };
    }
  }
  if (item.t === 'particle') {
    const pt = PARTICLES.find((x) => x.id === item.id);
    if (pt) {
      const ex = pt.ex?.[0];
      return {
        reading: pt.r && pt.r !== pt.p ? pt.r : '',
        senses: [bi() ? pt.role : pt.roleJa || pt.role, ...(ex ? [`${ex.ja} — ${ex.en}`] : [])],
      };
    }
  }
  return { reading: '', senses: [tx('この層に記録がない。', 'No record in this layer.')], unrecorded: true };
}

function srsCardKind(item) {
  const rec = S.srs[srsKey(item.t, item.id)];
  if (!rec || !rec.state) return 'new';
  return rec.state === 2 ? 'due' : 'learn';
}

function reviewCounts(rv) {
  const n = { new: 0, learn: 0, due: 0 };
  for (const item of rv.queue.slice(rv.ix)) n[srsCardKind(item)] += 1;
  const current = rv.queue[rv.ix] ? srsCardKind(rv.queue[rv.ix]) : null;
  const box = el('div', 'anki-counts');
  box.id = 'review-counts';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-label', tx(`残り — 新規 ${n.new}・学習中 ${n.learn}・復習 ${n.due}`,
    `left — ${n.new} new, ${n.learn} learning, ${n.due} to review`));
  for (const [kind, ja, en] of SRS_KINDS) {
    const c = el('span', `c-${kind}${current === kind ? ' now' : ''}`, String(n[kind]));
    c.title = tx(ja, en);
    box.append(c);
  }
  return box;
}

function deckCounts(today) {
  const n = { new: today.new.length, learn: today.learn.length, due: today.review.length };
  const row = el('div', 'deck-counts');
  row.id = 'deck-counts';
  for (const [kind, ja, en] of SRS_KINDS) {
    const cell = el('div', `deck-count c-${kind}`);
    cell.append(el('span', 'deck-count-n', String(n[kind])));
    cell.append(el('span', 'deck-count-l', tx(ja, en)));
    row.append(cell);
  }
  return row;
}

function srsDecks() {
  const buckets = new Map();
  for (const item of S.taken) {
    const key = monthKey(item.ts || 0);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  return [
    ...Object.entries(S.lists).map(([name, items]) => ({ name, items })),
    ...[...buckets.entries()].map(([name, items]) => ({ name, label: monthLabel(name), items })),
  ];
}

function renderSrsStats(main) {
  srsRoomBack(main);
  main.append(withEn(el('p', 'eyebrow', '統計'), 'statistics', 'en-inline'));
  main.append(el('h1', 'view-title', tx(...ROOM_NAMES.rooms['srs-stats'])));
  const DAY = 86400000;
  const now = new Date();
  const today = S.stats[dayKey(now)] || {};
  const todayN = today.n || 0;
  const todayAgain = today.again || 0;
  main.append(el('p', 'stats-today', todayN
    ? tx(`今日 ${todayN} 枚 · もう一度 ${todayAgain} · 正答 ${Math.round(((todayN - todayAgain) / todayN) * 100)}%`,
      `Today: ${todayN} card${todayN === 1 ? '' : 's'} studied · Again ${todayAgain} · ${Math.round(((todayN - todayAgain) / todayN) * 100)}% correct`)
    : tx('今日はまだ復習していない。', 'No reviews yet today.')));
  const counts = { new: 0, learn: 0, young: 0, mature: 0, rest: 0, unstarted: 0 };
  for (const item of S.taken) {
    const key = srsKey(item.t, item.id);
    const rec = S.srs[key];
    if (S.suspended[key]) counts.rest += 1;
    else if (!rec || !rec.state) counts[finiteNumber(item.started) ? 'new' : 'unstarted'] += 1;
    else if (rec.state === 1 || rec.state === 3) counts.learn += 1;
    else if ((rec.scheduled_days || 0) >= 21) counts.mature += 1;
    else counts.young += 1;
  }
  const standing = el('div', 'stats-standing');
  for (const [kind, ja, en] of [['new', '新規', 'New'], ['learn', '学習中', 'Learning'], ['young', '若い', 'Young'], ['mature', '定着', 'Mature'], ['rest', '休み中', 'Resting'], ['unstarted', '未着手', 'Not started']]) {
    if (kind === 'unstarted' && !counts.unstarted) continue;
    const cell = el('div', `stats-cell s-${kind}`);
    cell.append(el('span', 'stats-n', String(counts[kind])), el('span', 'stats-l', tx(ja, en)));
    standing.append(cell);
  }
  main.append(withEn(el('p', 'eyebrow list-head', '札の状態'), 'where your cards stand', 'en-inline'), standing);
  const bars = (title, en, values, labels, cls) => {
    main.append(withEn(el('p', 'eyebrow list-head', title), en, 'en-inline'));
    const chart = el('div', `stats-bars ${cls}`);
    const max = Math.max(1, ...values);
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', tx(`${title}: 合計 ${values.reduce((a, v) => a + v, 0)}、最大 ${Math.max(...values)}`,
      `${en}: ${values.reduce((a, v) => a + v, 0)} in all, at most ${Math.max(...values)} a day`));
    values.forEach((v, i) => {
      const col = el('div', 'stats-col');
      col.title = `${labels[i]}: ${v}`;
      const bar = el('i');
      bar.style.height = `${Math.round((v / max) * 100)}%`;
      col.append(bar);
      chart.append(col);
    });
    main.append(chart);
    main.append(el('p', 'fine stats-axis', `${labels[0]} … ${labels[labels.length - 1]} · ${tx('最大', 'max')} ${max}`));
  };
  // calendar days, never fixed 24-hour blocks: where the clocks change a day is 23 or 25 hours,
  // and stepping by 24 h skipped a day (or showed one twice); a DST-free zone is unchanged
  const pastDays = [];
  const pastLabels = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    pastDays.push(S.stats[dayKey(d)]?.n || 0);
    pastLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  bars('この30日', 'reviews, last 30 days', pastDays, pastLabels, 'past');
  const ahead = new Array(14).fill(0);
  const aheadLabels = [];
  const base = startOfDay(now);
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    aheadLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  for (const item of S.taken) {
    const key = srsKey(item.t, item.id);
    const rec = S.srs[key];
    if (!rec || S.suspended[key]) continue;
    // two midnights can be 23 or 25 hours apart: round, as srsWhen does — floor put a card due the
    // day after spring-forward one day early
    const i = Math.max(0, Math.round((startOfDay(new Date(rec.due)) - base) / DAY));
    if (i < 14) ahead[i] += 1;
  }
  bars('これから14日', 'due, next 14 days', ahead, aheadLabels, 'ahead');
  const revoked = new Set();
  for (const row of S.revlog || []) if (row[2] === 0 && Number.isInteger(row[3])) revoked.add(row[3]);
  let reviewed = 0;
  let remembered = 0;
  const since = now.getTime() - 30 * DAY;
  (S.revlog || []).forEach((row, i) => {
    if (revoked.has(i) || row[2] === 0 || row[0] < since || row[3] !== 2) return;
    reviewed += 1;
    if (row[2] > 1) remembered += 1;
  });
  main.append(withEn(el('p', 'eyebrow list-head', '定着率'), 'retention', 'en-inline'));
  main.append(el('p', 'stats-retention', reviewed
    ? tx(`この30日、復習 ${reviewed} 回のうち ${Math.round((remembered / reviewed) * 100)}% を思い出した。`,
      `In the last 30 days you remembered ${Math.round((remembered / reviewed) * 100)}% of ${reviewed} review${reviewed === 1 ? '' : 's'}.`)
    : tx('まだ復習（学習済みの札）の記録がない。', 'No reviews of learned cards yet.')));
}

function focusPool(mode) {
  if (mode === 'kanji') {
    const seen = new Set();
    const out = [];
    for (const i of S.taken) {
      if (i.t === 'kanji' && !seen.has(i.id)) { seen.add(i.id); out.push(i); }
    }
    const deck = Object.values(D.kanji)
      .filter((k) => D.kmeta?.[k.c]?.jlpt)
      .sort((a, b) => jlptRank(D.kmeta[a.c].jlpt) - jlptRank(D.kmeta[b.c].jlpt) || a.st - b.st);
    for (const k of deck) {
      if (!seen.has(k.c)) { seen.add(k.c); out.push(focusKanjiItem(k.c)); }
    }
    return out;
  }
  // Typed source clozes use the bounded recall room; the rapid drill has no typed-response contract.
  return srsDueItems().filter((item) => !['sentence', 'question'].includes(item.t));
}

function guidedCardStatus(node) {
  const word = node.t === 'word';
  const state = word ? wordCaptureState(node) : guidedTaken(node) ? 'taken' : 'take';
  if (state === 'taken') return { state: 'taken' };
  if (word && !D.dict?.[node.id]) return { state: 'held', reason: readerCaptureReasonText(node.id) };
  if (word && state !== 'take') return { state: 'held', reason: wordCaptureHeldText(node, { route: false }) };
  if (node.t === 'grammar' && !GRAMMARS().some((g) => g.id === node.id))
    return { state: 'held', reason: tx('この文法はまだ一覧にないため、札にできない。', 'This grammar pattern isn’t in KAIRO’s grammar list yet, so it can’t become a card.') };
  if (!word && node.t !== 'grammar') return { state: 'held', reason: tx('この種類の札は、ここでは覚えられない。', 'This kind of card can’t be memorized here.') };
  return { state: 'take' };
}

function guidedDoorInJlptRoom(main) {
  const lengths = main.querySelector('.exam-lengths');
  if (!lengths || main.querySelector('[data-guided-door]')) return;
  const row = el('div', 'study-hall guided-entry');
  const door = el('button', 'study-door');
  door.type = 'button';
  door.dataset.guidedDoor = 'mock';
  door.append(withEn(el('span', 'study-door-t', '案内つきの練習'), 'Guided test practice', 'en-inline'));
  door.append(el('span', 'study-door-sub', tx('N2 筆記 6問 · 解説と語の意味つき', 'N2 written · 6 questions · explanations and word meanings as you go')));
  door.addEventListener('click', () => openGuidedRoom('mock'));
  row.append(door);
  lengths.after(row);
}

function learnHead(n, ja, en, count) {
  const head = el('header', 'learn-head');
  const num = el('span', 'learn-n', n);
  num.setAttribute('aria-hidden', 'true');
  head.append(num, el('h2', 'learn-h', tx(ja, en)));
  if (count) head.append(el('span', 'learn-count', count));
  return head;
}

function renderLearnStage(main, doors) {
  const stage = el('section', 'learn-stage');
  stage.setAttribute('aria-labelledby', 'learn-stage-title');
  // the day, the stage's name, the first job; the room's own name stands in its tab, not again here (tighten pass)
  const places = placesLayout();
  const head = el('header', 'learn-stage-head');
  head.append(el('p', 'learn-stage-eyebrow', todayDateline()));
  const title = el('h1', 'view-title', tx(...roomName('dojo')));
  title.id = 'learn-stage-title';
  head.append(title);
  stage.append(head);

  const due = doors.due;
  // one practice, one home: Today's queue is reviewed on Today. When it holds cards and a deck
  // has a sitting ready, the stage belongs to that deck (the one with the most due, then new),
  // and the review stays one quiet line pointing home
  const sums = LEARN_STAGE_DECKS.map(([id, ja, en]) => [id, tx(ja, en), learnDeckSummary(id)]);
  const loaded = sums.filter(([, , sum]) => sum);
  const best = loaded.slice().sort((a, b) => b[2].due - a[2].due || b[2].fresh - a[2].fresh)[0];
  const sitting = best && (best[2].due || best[2].fresh) ? best : null;
  // Review is every card's home in the layout under test: the learner's own saved words lead when
  // they wait (the founding need: "I don't want to lose it"), else the deck with a sitting ready
  const deckStage = places ? !due && !!sitting : !!sitting;
  const order = due && !deckStage ? todayQueue().order : [];
  const face = deckStage ? { item: null } : due ? learnStageFace(order) : { item: null };
  const fan = el('div', 'learn-fan');
  for (const k of [0, 1]) {
    const ghost = el('span', `learn-ghost g${k}`);
    ghost.setAttribute('aria-hidden', 'true');
    fan.append(ghost);
  }
  const card = el('div', 'learn-card');
  const meta = el('p', 'learn-card-meta');
  const text = el('p', 'learn-card-text');
  if (deckStage) {
    const deck = DOJO_DECKS.find((d) => d.id === sitting[0]);
    meta.textContent = tx('次の一席 · デッキ', 'next sitting · deck');
    text.classList.add('is-deck');
    text.textContent = deck ? tx(deck.ja, deck.en) : sitting[1];
  } else if (face?.parts) {
    meta.textContent = tx('次の札 · 保存した文から', 'next card · your sentence');
    text.lang = 'ja';
    text.dataset.uiContent = 'learning';
    for (const part of face.parts) {
      if (part.text) text.append(document.createTextNode(part.text));
      if (part.at >= 0) {
        const gap = el('span', 'learn-gap', '　　');
        gap.setAttribute('aria-label', tx('空欄', 'blank'));
        text.append(gap);
      }
    }
  } else if (face?.label) {
    meta.textContent = face.item.t === 'kanji' ? tx('次の札 · 漢字', 'next card · kanji') : tx('次の札 · 語', 'next card · word');
    text.classList.add('is-word');
    text.lang = 'ja';
    text.dataset.uiContent = 'learning';
    text.textContent = face.label;
  } else if (due) {
    meta.textContent = tx('次の札', 'next card');
    text.classList.add('is-quiet');
    text.textContent = face === null ? tx('文を開いています…', 'Opening its sentence…') : tx('札はリストで待っている。', 'Your cards wait on the list.');
  } else {
    meta.textContent = tx('今日', 'today');
    text.classList.add('is-quiet');
    text.textContent = tx('復習を待つ札はまだない。', 'No saved words to review yet.');
  }
  card.prepend(meta);
  card.append(text);
  fan.append(card);
  stage.append(fan);

  // the count and the split: the big number is the sitting the primary opens
  // (todayQueue, the Line's own number); the decks keep their own ledgers, so
  // their split is named apart and never added in
  const row = el('div', 'learn-stage-row');
  const count = el('p', 'learn-due');
  if (deckStage) {
    const [, short, sum] = sitting;
    const n = sum.due || sum.fresh;
    count.append(el('b', 'learn-due-n', String(n)));
    count.append(el('span', 'learn-due-u', sum.due
      ? tx(`枚 · ${short} 復習待ち`, `${short} card${n === 1 ? '' : 's'} due`)
      : tx(`枚 · ${short} 新規`, `new ${short} card${n === 1 ? '' : 's'}`)));
  } else {
    count.append(el('b', 'learn-due-n', String(due)));
    count.append(el('span', 'learn-due-u', places
      ? tx('枚 · 今日', due === 1 ? 'card for today' : 'cards for today')
      : tx('枚 復習待ち', due === 1 ? 'card due today' : 'cards due today')));
  }
  row.append(count);
  if (loaded.length) {
    const anyDue = loaded.some(([, , sum]) => sum.due);
    const split = el('p', 'learn-split');
    split.append(el('span', 'learn-split-h', places
      ? anyDue ? tx('デッキ · 今日の復習', 'Decks · due today') : tx('デッキ · 今日の新しい札', 'Decks · new today')
      : anyDue ? tx('今日の復習', 'due today') : tx('今日の新しい札', 'new today')));
    const line = el('span', 'learn-split-line');
    for (const [id, name, sum] of loaded) {
      const cell = el('span', 'learn-split-cell');
      cell.dataset.stageDeck = id;
      cell.append(el('span', 'learn-split-name', name), el('b', 'learn-split-n', String(anyDue ? sum.due : sum.fresh)));
      line.append(cell);
    }
    split.append(line);
    row.append(split);
  }
  stage.append(row);

  // The ready deck's primary starts its sitting. Today's saved cards keep their own
  // quiet door; without a deck sitting, that review door leads the stage.
  const review = doors.review;
  review.classList.add('learn-go');
  if (due && !deckStage && places) {
    // the saved words' Begin, with the minutes the learner's own pace gives (gate 3)
    review.id = 'review-start';
    review.querySelector('.study-door-t').textContent = tx(`はじめる · ${due} 枚`, `Begin · ${due} card${due === 1 ? '' : 's'}`);
    const perCard = todaySecondsPerCard();
    const minutes = perCard ? Math.max(1, Math.round((due * perCard) / 60)) : 0;
    review.querySelector('.study-door-sub').textContent = minutes
      ? tx(`保存した語 · 約 ${minutes} 分`, `Your saved words · about ${minutes} min`)
      : tx('保存した語', 'Your saved words');
    stage.append(review);
  } else if (due && !deckStage) {
    review.querySelector('.study-door-t').textContent = tx(`${due} 枚を復習する`, `Review ${due} card${due === 1 ? '' : 's'}`);
    review.querySelector('.study-door-sub').textContent = tx('今日のリストから始める', 'starts from today’s list');
    stage.append(review);
  } else if (places) {
    if (sitting) stage.append(deckSittingButton(sitting));
    // no saved word waits: the door stays, quiet and closed, saying so
    review.classList.replace('learn-go', 'learn-go-quiet');
    review.disabled = true;
    stage.append(review);
  } else {
    if (sitting) {
      stage.append(deckSittingButton(sitting));
      review.classList.replace('learn-go', 'learn-go-quiet');
      if (due) {
        // Today's queue keeps its one home; here it is a line that points there
        review.classList.add('learn-go-home');
        review.querySelector('.study-door-t').textContent = tx(`今日に ${due} 枚が待っている`, `${due} card${due === 1 ? '' : 's'} waiting on Today`);
        review.querySelector('.study-door-sub').textContent = '';
      }
    }
    stage.append(review);
  }
  main.append(stage);
}

function deckSittingButton([id, short, sum]) {
  const go = el('button', 'learn-go learn-go-deck');
  go.type = 'button';
  go.dataset.stageDeck = id;
  const total = sum.total;
  go.append(el('span', 'learn-go-t', sum.due
    ? tx(`${short}の ${total} 枚を始める`, `Begin ${total} ${short} card${total === 1 ? '' : 's'}`)
    : tx(`${short}の新規 ${total} 枚を始める`, `Begin ${total} new ${short} card${total === 1 ? '' : 's'}`)));
  go.addEventListener('click', () => openDeck(id, { autoStart: true }));
  return go;
}

function deckWordsBegun(id) {
  if (sharedStudyActive() && ['n2','n1','senmon','kotoba-master','shared-grammar'].includes(id)) return deckSummaries[id]?.begun || 0;
  try {
    const raw = JSON.parse(localStorage.getItem(`bunki-cloze:${id}`) || 'null');
    const ids = raw && typeof raw.cards === 'object' && raw.cards ? Object.keys(raw.cards) : [];
    return new Set(ids.map((cardId) => cardId.replace(/-[^-]+$/, ''))).size;
  } catch {
    return 0;
  }
}

function renderFocus(main) {
  const doors = studyHallDoors();
  renderLearnStage(main, doors);
  if (placesLayout()) renderReviewHall(main);
  else renderStudyHall(main, doors);
}

function cardDepth(node, now = Date.now()) {
  if (!node?.id || (node.t !== 'word' && node.t !== 'kanji')) return 'unmet';
  const key = srsKey(node.t, node.id);
  const card = plainRecord(S.srs) && owns(S.srs, key) && plainRecord(S.srs[key]) ? S.srs[key] : null;
  const kept = (Array.isArray(S.taken) ? S.taken : []).find((row) => row?.t === node.t && row.id === node.id) || null;
  if (!card) return kept ? 'met' : 'unmet';
  const shown = nonEmptyString(node.reading) ? kataToHira(node.reading) : '';
  if ((shown && nonEmptyString(kept?.cueReading) && kataToHira(kept.cueReading) !== shown) ||
    (node.seq != null && node.seq !== '' && nonEmptyString(kept?.entrySeq) && kept.entrySeq !== String(node.seq))) return 'met';
  const state = Number.isInteger(card.state) ? card.state : 0;
  if (state === 0) return 'met';
  if (state !== 2) return 'again';
  const recall = cardRecall(card, now);
  const stability = Number.isFinite(card.stability) ? card.stability : 0;
  if (recall === null || recall < INK_DEPTH.recall) return 'again';
  return stability >= INK_DEPTH.owned ? 'owned' : stability >= INK_DEPTH.recalled ? 'recalled' : 'again';
}

export { sharedStudyActive, sharedStudyFence, learnerSourceLabel, gradeTag, focusProseWord, cardInk, markCardMore, focusReturnMarkOnce, srsPresetState, srsPrefValue, srsPrefStep, lessonLaneIds, lessonPlan, lessonMissedLast, lessonPreviousRuns, lessonGloss, lessonChoices, learningEnrollHeldText, practiceIdentity, mockSubjectKey, learnerModel, learningContextRef, learningItemNode, focusSentencePracticeTarget, srsLearnerPolicy, srsWhen, srsForecast, reviewAnswerAvailable, reviewCardBack, presentReviewAnswer, reviewBack, srsCardKind, reviewCounts, deckCounts, srsDecks, renderSrsStats, focusPool, guidedCardStatus, guidedDoorInJlptRoom, learnHead, renderLearnStage, deckSittingButton, deckWordsBegun, renderFocus, cardDepth };

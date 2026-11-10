/** G3 worlds seam — declarations moved verbatim from ../corridor.js (pure move, no body edits). */
import { BEYOND_JOYO, D, GLUE_STROKE, GRAMMAR, INK_TEMPO, INK_WORLDS, JOYO_JUDGEABLE, KANJI_QUEST_FAILED, KANJI_QUEST_STRUCTURAL, M4_COPY, MONTHS_EN, PARTICLES, PART_STROKES, PART_WRITTEN, ROMAJI, ROOM_NAMES, S, STROKE_SPEED_DEFAULT, STROKE_VIEWBOX, SVG_NS, THEME_UI, TOPIC_BLOCKS, TOPIC_KICKERS, TOPIC_ORDER, WW_CX, WW_CY, WW_KANJI_ANGLES, WW_REL, WW_RING2_ORDER, WW_RING2_SLOTS, WW_TRAIL_MAX, WW_WALK_KEY, _KDX_NPTS, _compsCache, _kdxDist, _kdxNorm, _kdxResample, _kdxTemplates, animcjkApproved, animcjkShards, bi, biLabel, chipsFor, closeWorldPicker, confusablesFor, currentJoyoKunNote, el, ensureArchiveIndex, ensureArticle, go, inkGroundFor, interaction, kanjiCourseApplyHelp, kanjiCourseRememberHelp, kanjiDisplayRecord, kanjiFamilyExposures, kanjiFamilyMounts, kanjiFamilyResolveExample, kanjiFamilyStamp, kanjiFamilyStampCurrent, kanjiFamilyTicket, kanjiFamilyTicketCurrent, kanjiFamilyViews, kanjiQuestFor, kanjiQuestLoading, kanjiQuestOwner, kanjiReadingsState, kanjiReferenceRows, kanjiStructureMounts, kanjiWorldEligible, kankenGradeLabel, kataToHira, keepNavigationReturn, loadReferenceExtra, motionEase, motionMs, openKanjiCourseUnit, openKanjiWorldEncounter, openPassage, openStrokePage, passage, recordReady, recordWritable, refreshStrokeReadings, removeMini, render, renderFamilyExampleNode, renderKanjiCourseDoor, renderKanjiFamily, renderKanjiStructure, renderKdxGrid, renderSentenceTokens, renderSourceKanjiDoor, renderStudyFold, renderWordWeb, retainedKanjiRecord, scaleOut, sentenceDraftBindings, sentenceDraftInputErrors, sentenceDraftWindowEdits, shelfDay, skipState, srsKey, strokePathsFor, strokeReduced, strokeSpeed, syncStrokeNumbers, tx, withEn, wordBrush, wordWeb, writtenFormNote, wwP, wwPartMembers, wwReduced, wwShort, wwSpread, wwTokenIndex, wwTrail } from '../corridor.js';
import { encounterTrail, setTouchReadingShown } from './capture.mjs';
import { bankExamplesFor, displayKunReading, displayPairs, ensureDictionaryRowsForForm, lookup, nameReaderToken, partGloss, partMeaning, readerGlossLine, readingLine, tapLadderHint } from './dictionary.mjs';
import { themeIx } from './learner.mjs';
import { catalogChip, levelChip, libraryDiscoverable, readerChoiceMatch, shelfDateLabel } from './library.mjs';
import { scaleNodeBelongs } from './return.mjs';
import { learnerSourceLabel } from './study-host.mjs';
import { teacherSentence } from './teacher.mjs';
import { note, openSlip, wordRow } from './word-entry.mjs';

function GRAMMARS() {
  return D.grammar || GRAMMAR;
}

function sentenceDraftInputMatches(input, view) {
  const binding = sentenceDraftBindings.get(input);
  return binding?.revision === (view.draft?.revision || null) &&
    binding.consumed === !!view.draft?.consumed && binding.displayText === input.value;
}

function sentenceDraftStatus(view, input) {
  if (sentenceDraftWindowEdits.has(input)) return tx('下書きはこの窓に残る。保存を利用できないため、閉じる前にコピーする。',
    'This draft stays in this window. Saving is unavailable; copy it before closing.');
  if (sentenceDraftInputErrors.has(input)) return tx('この編集を保存できない。下書きをコピーしてから確認する。',
    'This edit could not be kept. Copy the draft before checking it.');
  if (view.state === 'conflict') return tx('保存済みの文と復旧した下書きが異なる。下で続きを選ぶ。',
    'The saved text differs from the recovered draft. Choose which one to continue below.');
  if (view.error || view.state === 'unavailable') return tx('下書きの保存を確認できない。未保存の文をコピーしてから再読み込みする。',
    'Draft saving is unconfirmed. Copy any unsaved text before reloading.');
  if (view.state === 'pending' || view.state === 'saving') return tx('下書きを保存中…', 'Saving your draft…');
  if (!view.draft || view.state !== 'saved') return '';
  return view.draft.consumed ? tx('回答を保存した。次の文を書ける。', 'Response saved. You can write the next one.')
    : !view.draft.text && !view.draft.transcriptOpened ? tx('下書きを空にして、この端末に保存した。', 'Draft cleared on this device.')
    : tx('下書きをこの端末に保存した。閉じても続きを書ける。', 'Draft saved on this device. You can close the app and continue later.');
}

function sentenceDraftCopyButton(getText, note) {
  const button = biLabel('button', 'chip', '下書きをコピー', 'copy draft'); button.type = 'button';
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(getText()); note.textContent = tx('下書きをコピーした。', 'Draft copied.'); }
    catch { note.textContent = tx('文を選択してコピーする。', 'Select the draft text and copy it.'); }
  });
  return button;
}

function beyondJoyo(ch) {
  // kana, numerals and marks are never "beyond" anything on their own — the dial replaces
  // KANJI a learner at this level would not have met
  if (!JOYO_JUDGEABLE.test(ch)) return false;
  const k = D.kanken[ch];
  // …and a kanji the 漢検 table does not carry is not 常用. The table holds
  // 2,453 characters and every common one is in it; 硯, 蟹, 學, 國, 纂, 鐵 are
  // not. Reading "unknown" as jōyō made the dial inert for precisely the
  // characters it exists to replace (PR #77 b4d6b825, E3 round-D, reader lens).
  return !k || BEYOND_JOYO.has(k.kk);
}

function storySeries(p) {
  const cut = /^aozora:(\d+)(?:-(\d+))?$/u.exec(String(p?.id || ''));
  const author = /^青空文庫\s+([^\s「『]+)[「『]/u.exec(String(p?.attribution || ''))?.[1];
  return cut && author ? { key: author, work: cut[1], cut: Number(cut[2] || 1) } : null;
}

function storyLevel(p) {
  const authored = /^N[1-5]\+?$/u.test(p?.authorLevel || '') ? p.authorLevel : '';
  const level = authored || p?.readingFacets?.jlpt || '';
  return { level, authored, step: level.replace(/\+$/u, '') };
}

function storyTopicKey(p) {
  if (p.source === 'isa-yasashii-glossary') return 'glossary';
  if (TOPIC_KICKERS[p.topic]) return p.topic;
  const topics = p.readingFacets?.topics || [];
  for (const topic of TOPIC_ORDER) if (topics.includes(topic)) return topic;
  return ['essay', 'graded', 'primary'].includes(p.lane) ? p.lane : 'reading';
}

function storyTopic(p) {
  const key = storyTopicKey(p);
  if (key === 'glossary') return ['用語集', 'Glossary'];
  if (TOPIC_KICKERS[key]) return TOPIC_KICKERS[key];
  return { essay: ['随筆', 'Essay'], graded: ['読み物', 'Graded reading'], primary: ['資料', 'Source'] }[key] || ['読み物', 'Reading'];
}

function storyBlock(p) {
  return `var(--kicker-${TOPIC_BLOCKS[storyTopicKey(p)] || 'ai'})`;
}

function storyAccent(p) {
  return /^#[0-9a-f]{6}$/iu.test(p.accent || '') ? p.accent : storyBlock(p);
}

function storyPictureSource(p) {
  const pic = p.picture;
  if (!pic || typeof pic.src !== 'string' || !/^articles\/pictures\/[\w.-]+\.(webp|jpe?g|png|avif)$/u.test(pic.src)) return null;
  if (window.__CORRIDOR_STANDALONE__ === true) return null;
  return pic;
}

function storyHeroKanji(p) {
  return typeof p?.heroKanji === 'string' && /^[\p{Script=Han}々]{1,2}$/u.test(p.heroKanji) ? p.heroKanji : '';
}

function storyPicture(p, { eager = false, cls = 'story-picture' } = {}) {
  const frame = el('span', cls);
  const kanjiSheet = () => {
    const kanji = storyHeroKanji(p);
    if (!kanji) return false;
    frame.classList.add('is-kanji');
    frame.querySelector('.story-img')?.remove();
    const glyph = el('span', 'story-hero-kanji', kanji);
    glyph.lang = 'ja';
    glyph.dataset.uiContent = 'learning';
    glyph.setAttribute('aria-hidden', 'true');
    frame.prepend(glyph);
    return true;
  };
  const pic = storyPictureSource(p);
  if (!pic) return kanjiSheet() ? frame : null;
  const img = el('img', 'story-img');
  img.src = `data/${pic.src}`;
  if (pic.srcSmall && /^articles\/pictures\/[\w.-]+$/u.test(pic.srcSmall) && pic.wSmall && pic.w) {
    img.srcset = `data/${pic.srcSmall} ${pic.wSmall}w, data/${pic.src} ${pic.w}w`;
    img.sizes = '(max-width: 520px) 100vw, 50vw';
  }
  // inside a card the headline already names the story, so the picture is quiet to a screen reader
  img.alt = '';
  if (pic.w && pic.h) { img.width = pic.w; img.height = pic.h; }
  img.loading = eager ? 'eager' : 'lazy';
  img.decoding = 'async';
  // a picture that cannot load gives way to the key kanji, or takes its band with it
  img.addEventListener('error', () => { if (!kanjiSheet()) frame.remove(); }, { once: true });
  frame.append(img);
  return frame;
}

function storyKicker(p) {
  const [ja, en] = storyTopic(p);
  const kicker = el('span', 'story-kicker');
  kicker.append(el('span', 'l-ja', tx(ja, en)));
  return kicker;
}

function storyVersions(p) {
  const originalId = p.adaptation?.basedOn;
  if (originalId) {
    const original = D.passages.find((x) => x.id === originalId && D.libraryDiscoverable?.(x) !== false);
    return original ? { original, easy: p } : null;
  }
  const easy = D.passages.find((x) => x.adaptation?.basedOn === p.id && D.libraryDiscoverable?.(x) !== false);
  return easy ? { original: p, easy } : null;
}

function storyYourWords(p) {
  const forms = p.readingFacets?.forms;
  if (!Array.isArray(forms) || !forms.length) return 0;
  const inText = new Set(forms), seen = new Set();
  for (const t of S.taken) if (t.t === 'word' && inText.has(t.id)) seen.add(t.id);
  return seen.size;
}

function storyInstrument(p, full = false) {
  const line = el('div', 'story-instrument');
  line.append(levelChip(p), storyKicker(p));
  const fact = (text, cls = '') => {
    const span = el('span', `story-fact${cls ? ` ${cls}` : ''}`, text);
    line.append(span);
    return span;
  };
  if (full && p.chars) fact(tx(`${p.chars.toLocaleString('ja-JP')}字`, `${p.chars.toLocaleString('en-GB')} chars`), 'story-chars');
  const mine = full ? storyYourWords(p) : 0;
  if (mine) fact(tx(`保存した語 ${mine}`, `${mine} of your words`), 'story-mine');
  return line;
}

function storyLede(p) {
  const text = String(p.snippet || '').replace(/\s+/gu, ' ').trim();
  if (!text) return '';
  const end = text.search(/[。！？]/u);
  return end >= 0 ? text.slice(0, end + 1) : `${text}…`;
}

function storyDate(p, short = false) {
  const day = shelfDay(p);
  if (!day) return null;
  const stamp = el('time', 'story-date');
  stamp.dateTime = day;
  if (!short) stamp.textContent = shelfDateLabel(day);
  else {
    const [y, m, d] = day.split('-').map(Number);
    const thisYear = new Date().getFullYear() === y;
    stamp.textContent = bi() ? `${d} ${MONTHS_EN[m - 1]}${thisYear ? '' : ` ${y}`}` : `${thisYear ? '' : `${y}年`}${m}月${d}日`;
  }
  return stamp;
}

function paintTok(span, token, index) {
  // Ladder · ふりがな なし: a touched word shows its own reading too (the tap's first rung)
  const hasReading = S.dials.furigana === 2 || !!S.revealed?.has(index);
  const hasEn = S.glossed?.has(index);
  if (S.dials.furigana === 1) {
    for (const rt of span.querySelectorAll('rt')) setTouchReadingShown(rt, hasReading);
  } else if (S.dials.furigana === 0) {
    // Off never borrows the reveal rung. Replacing only the word row keeps
    // an explicitly requested English gloss in its original position.
    const built = span.querySelector('ruby');
    if (hasReading !== !!built) {
      const next = wordRow(displayPairs(token), {
        furigana: hasReading ? 1 : 0,
        revealed: hasReading,
      });
      const row = span.querySelector('.tok-word');
      if (row) {
        row.replaceWith(next);
      } else {
        span.querySelector('.tok-en')?.remove();
        span.textContent = '';
        span.append(next);
      }
    }
  }
  span.classList.toggle('lit', !!(S.revealed?.has(index) || hasEn));
  const existingEn = span.querySelector('.tok-en');
  if (hasEn && !existingEn) {
    span.classList.add('has-en');
    span.append(readerGlossLine(token));
  } else if (!hasEn && existingEn) {
    span.classList.remove('has-en');
    existingEn.remove();
  }
  // Ladder · while its English shows, this occurrence's depth dot steps aside (the DOTS slice's hook)
  if (hasEn) span.dataset.depthAside = 'meaning';
  else delete span.dataset.depthAside;
  nameReaderToken(span, token, index, 'word');
}

function kanjiSlipReading(k) {
  if (!k) return '';
  return kataToHira(String(k.on?.[0] || '')) || String(k.kun?.[0] || '').split('.')[0];
}

function kanjiCourseEvidencePatch(latest, evidence) {
  const seen = new Set((latest.obslog || []).map((row) => JSON.stringify(row)));
  const rows = evidence.obslog.filter((row) => !seen.has(JSON.stringify(row)));
  const lessonsDone = { ...latest.lessonsDone };
  for (const [id, result] of Object.entries(evidence.lessonsDone)) {
    if (!lessonsDone[id] || lessonsDone[id].ts <= result.ts) lessonsDone[id] = result;
  }
  return { lessonsDone, obslog: [...(latest.obslog || []), ...rows] };
}

function kanjiCourseNodeUnit(node) {
  const course = window.BunkiKanjiCourse;
  if (node?.t === 'kanji') return course?.unitForCharacter(node.id) || null;
  if (node?.t !== 'word' || typeof node.reading !== 'string') return null;
  return course?.unitForTask?.({ type: 'word', id: node.id, reading: node.reading }) || null;
}

function kanjiCourseTeachingHelp(visit, target) {
  if (visit?.unitId !== 'shiki-shoku' || !recordReady(visit.epoch)) return;
  const at = Date.now();
  return kanjiCourseRememberHelp(visit, [
    { what: 'teaching-card', about: { kind: 'kanji', literal: target.kanji }, reveals: ['meaning', 'form'], at },
    { what: 'teaching-card', about: { kind: 'word', term: target.wordKey, reading: target.readings[0] },
      reveals: ['reading', 'meaning', 'form'], at },
  ]);
}

function kanjiCourseReferenceHelp(visit, node) {
  if (visit?.unitId !== 'shiki-shoku' || !recordReady(visit.epoch) ||
      !['kanji', 'word'].includes(node?.t)) return;
  const about = node.t === 'kanji' ? { kind: 'kanji', literal: node.id }
    : typeof node.reading === 'string' && node.reading.trim()
      ? { kind: 'word', term: node.id, reading: node.reading } : null;
  const help = { what: 'dictionary-entry', ...(about ? { about } : {}),
    reveals: node.t === 'word' ? ['reading', 'meaning', 'form'] : ['meaning', 'form'], at: Date.now() };
  const kept = kanjiCourseRememberHelp(visit, [help]);
  visit.supportedPractice = true;
  if (kept?.then) return kept.then(() => kanjiCourseApplyHelp(visit));
  kanjiCourseApplyHelp(visit);
}

function kanjiCourseReturnFrame() {
  const frame = S.navigationReturns.at(-1);
  return frame?.destination === 'lessons' && frame.kanjiCourseReturn?.visit === S.kanjiCourse ? frame : null;
}

function kanjiCourseEntryNode(visit, target, type) {
  // A finder/Atlas detour can put generic frames above this course's caller.
  // Keep the nearest live capsule for this visit without rewriting older ones.
  // A visit's creation-time origin is not evidence of the current source.
  const live = visit && visit === S.kanjiCourse && recordReady(visit.epoch) &&
    !S.navigationReturns.some((frame) => frame.kanjiCourseReturn &&
      (!recordReady(frame.kanjiCourseReturn.epoch) ||
        (frame.view === 'review' && S.review !== frame.kanjiCourseReturn.review)));
  const frame = live ? [...S.navigationReturns].reverse().find((candidate) =>
    candidate.destination === 'lessons' && candidate.kanjiCourseReturn?.visit === visit) : null;
  const origin = frame?.kanjiCourseReturn.originNode;
  if (type === 'kanji' && origin?.t === 'kanji' && origin.id === target.kanji) return { ...origin };
  if (type === 'word' && origin?.t === 'word' && origin.id === target.wordKey &&
      target.readings?.includes(origin.reading)) return { ...origin };
  return { t: type, id: type === 'kanji' ? target.kanji : target.wordKey,
    ...(type === 'word' && target.readings?.length === 1 ? { reading: target.readings[0] } : {}) };
}

function kanjiCourseRunKind(run) {
  if (!run || run.complete || run.schemaVersion !== 2) return null;
  return run.targets.length === 1 ? run.targets[0] : 'mixed';
}

function kanjiRoomEntry(visit, entry) {
  const occupying = kanjiCourseRunKind(visit?.run);
  if (!occupying) return 'start';
  return occupying === entry ? 'resume' : `blocked-${occupying}`;
}

function kanjiChooseRoom(visit, room) {
  const entry = kanjiRoomEntry(visit, room);
  visit.chooser = false;
  visit.blocked = entry.startsWith('blocked-') ? entry.slice('blocked-'.length) : null;
  if (entry === 'start') Object.assign(visit, { room, stage: 'intro', index: 0, feedback: null });
}

function kanjiEnterCourseDoor(node, invoker) {
  if (!openKanjiCourseUnit(node, invoker)) return false;
  const visit = S.kanjiCourse, entry = kanjiRoomEntry(visit, 'mixed');
  visit.chooser = false;
  visit.blocked = entry.startsWith('blocked-') ? entry.slice('blocked-'.length) : null;
  if (entry === 'start' && visit.room) Object.assign(visit, { room: null, stage: 'intro', index: 0, feedback: null });
  render();
  return true;
}

function openKanjiRooms(node, invoker) {
  if (!openKanjiCourseUnit(node, invoker)) return false;
  Object.assign(S.kanjiCourse, { chooser: true, blocked: null, carried: node.t === 'word' ? node.id : null });
  render(); document.getElementById('kanji-course-title')?.focus();
  return true;
}

function renderKanjiRoomChooser(main, visit, redraw) {
  main.append(el('h2', 'list-head', tx(...M4_COPY['R-02'])));
  for (const [room, scope] of [['reading', 'R-04'], ['meaning', 'R-06']]) {
    const door = el('button', 'study-door');
    door.type = 'button'; door.id = `kanji-room-${room}`; door.dataset.studyDoor = `room-${room}`;
    door.append(el('span', 'study-door-t', tx(...ROOM_NAMES.rooms[`room-${room}`])), el('span', 'study-door-sub', tx(...M4_COPY[scope])));
    door.disabled = !!visit.pending;
    door.addEventListener('click', () => {
      if (S.kanjiCourse !== visit || visit.pending) return;
      kanjiChooseRoom(visit, room); redraw();
    });
    main.append(door);
  }
}

function kanjiQuestStructural(journey) {
  const view = journey.lifecycle.inspect();
  return !view.root || KANJI_QUEST_STRUCTURAL.includes(view.phase);
}

function kanjiQuestSeed(node, module) {
  // an imported source's context beside a passage index is conflicting provenance (W5 2000): no quest, never a passage seed
  if (node?.t !== 'word' || node.id !== '職業' || node.sourceContext != null) return null;
  const sentence = teacherSentence(node);
  const token = sentence?.p.tokens[sentence.index];
  if (!sentence || token?.b !== node.id) return null;
  const nth = kanjiQuestSentences(sentence.p).filter((s) => s.end <= sentence.start && s.quote === sentence.quote).length;
  return module.questSeed({ source: 'passage', passage: sentence.p.id, quote: sentence.quote, nth,
    offset: sentence.p.tokens.slice(sentence.start, sentence.index).map((t) => t.s).join('').length, surface: token.s, word: node.id });
}

function kanjiQuestSentences(p) {
  const sentences = [];
  for (let index = 0; index < p.tokens.length;) {
    const sentence = teacherSentence({ from: { passage: p.id, index } });
    if (!sentence || sentence.end <= index) break;
    sentences.push({ start: sentence.start, end: sentence.end, quote: sentence.quote });
    index = sentence.end;
  }
  return sentences;
}

function kanjiQuestQuote(seed) {
  const quote = seed?.sourceOccurrence?.quote;
  return typeof quote === 'string' ? quote : null;
}

function kanjiQuestStale(seed, redraw = null) {
  const at = seed?.sourceOccurrence;
  if (at?.source !== 'passage' || typeof at.quote !== 'string' || !Number.isInteger(at.nth) || !Number.isInteger(at.offset) ||
      typeof at.surface !== 'string' || at.quote.slice(at.offset, at.offset + at.surface.length) !== at.surface) return 'unverifiable';
  const load = (key, start) => {
    let entry = kanjiQuestLoading.get(key);
    if (!entry) {
      const loading = { state: 'pending', waiters: new Set() };
      kanjiQuestLoading.set(key, entry = loading);
      start().then(() => kanjiQuestLoading.delete(key), () => { loading.state = 'failed'; }).finally(() => {
        // each waiter is its own page's redraw, which draws nothing once that page is no longer current
        const waiters = [...loading.waiters];
        loading.waiters.clear();
        for (const wake of waiters) wake();
      });
    }
    if (entry.state === 'pending' && redraw) entry.waiters.add(redraw);
    return entry.state === 'failed' ? 'unverifiable' : null;
  };
  const p = D.passages?.find((entry) => entry.id === at.passage);
  // the main index boots first; an archive passage is known only once the archive index has loaded (the standalone build has none)
  if (!p) return D.archive || window.__CORRIDOR_STANDALONE__ === true || typeof ensureArchiveIndex !== 'function' ? 'unverifiable'
    : load('archive-index', () => ensureArchiveIndex());
  if (!p.tokens) return typeof ensureArticle === 'function' ? load(`passage:${p.id}`, () => ensureArticle(p)) : 'unverifiable';
  const sentence = kanjiQuestSentences(p).filter((s) => s.quote === at.quote)[at.nth];
  if (!sentence) return 'changed';
  // the selected word, recomputed in the current tokens: a token starting at the stored offset with the stored surface and base
  let offset = 0;
  for (let index = sentence.start; index < sentence.end; index += 1) {
    if (offset === at.offset) return p.tokens[index].s === at.surface && p.tokens[index].b === at.word ? false : 'unverifiable';
    offset += p.tokens[index].s.length;
  }
  return 'unverifiable';
}

function kanjiQuestLine(id, n = 0) {
  if (id === 'K-26') return tx('記録が切り替わったため、この練習は保存できません。', 'The learner record changed. This session cannot be saved.');
  return tx(...M4_COPY[id].map((text) => text.replace('${n}', n)));
}

function kanjiQuestLines(journey, action, out) {
  if (['published', 'already-completed', 'exists', 'absent', 'pool-full'].includes(out.kind)) return [];
  if (out.kind === 'owner-changed' || out.kind === 'structural') return action === 'retire' ? [] : [out.kind === 'structural' ? 'Q-17' : 'K-26'];
  const own = out.kind === 'uncertain' ? 'Q-21' : KANJI_QUEST_FAILED[action];
  const lines = own && action !== 'retire' ? [own] : [];
  const view = journey.lifecycle.inspect();
  if (view.phase === 'publication-hold' && Date.now() < view.holdUntil && !journey.quest.toldHold) {
    journey.quest.toldHold = true; lines.push('Q-25');
  }
  return lines;
}

function kanjiQuestBinding(journey, run) {
  const binding = journey.quest.state.sessions.get(run?.sessionId)?.binding;
  return binding?.goals.length ? binding : null;
}

function kanjiQuestBound(visit) {
  const journey = kanjiQuestFor(visit);
  return !!(journey && visit.run && kanjiQuestBinding(journey, visit.run));
}

function kanjiQuestWordsDone(run) {
  return run.attempts.filter((attempt, index) => run.responses[index]?.action === 'answer' && attempt.feedbackAt !== null &&
    attempt.selfCheck !== null).length;
}

function kanjiQuestRunStarted(visit) {
  const journey = kanjiQuestFor(visit);
  if (!journey) return;
  visit.questSettle = null;
  journey.quest.module.bindRun(journey.quest.state, journey.lifecycle, visit.run, { eligible: (goal) => kanjiQuestStale(goal.seed) === false });
}

function kanjiQuestSettle(visit) {
  const journey = kanjiQuestFor(visit), course = window.BunkiKanjiCourse, run = visit.run;
  const binding = journey && run ? kanjiQuestBinding(journey, run) : null;
  if (!binding || !journey.quest.module.runQualifies(run, binding, course)) return null;
  const settle = { sessionId: run.sessionId, pending: true, lines: [] };
  visit.questSettle = settle;
  const owned = kanjiQuestOwner(journey);
  return journey.quest.module.settleRun(journey.lifecycle, journey.quest.state, run, { course, owned }).then((results) => {
    // a binding made under another activation, journey or generation wrote nothing here, and the quest's state now is unknown
    // to this page (W12 2000 L3): Q-21, never "still in progress"
    if (!results.length) { settle.lines = owned() ? ['Q-21'] : ['K-26']; return; }
    for (const { goalId, complete, retire } of results) {
      const done = ['published', 'already-completed'].includes(complete.kind);
      if (done && visit.quest?.goalId === goalId) visit.quest.done = true;
      for (const id of done ? ['Q-12', ...(retire ? kanjiQuestLines(journey, 'retire', retire) : [])] : kanjiQuestLines(journey, 'complete', complete))
        if (!settle.lines.includes(id)) settle.lines.push(id);
    }
  }, () => { settle.lines = kanjiQuestLines(journey, 'complete', { kind: 'uncertain' }); }).finally(() => {
    settle.pending = false;
    kanjiQuestRedraw(visit);
  });
}

function kanjiQuestSelfCheck(visit, attemptId, choice) {
  if (!kanjiQuestBound(visit)) return false;
  visit.run = window.BunkiKanjiCourse.selfCheck(visit.run, attemptId, choice, Date.now());
  visit.hookOutcomes[attemptId] = { write: false, reason: 'hook-unavailable' };
  kanjiQuestSettle(visit);
  render();
  return true;
}

function kanjiQuestRedraw(visit) {
  if (S.kanjiCourse !== visit || S.view !== 'lessons' || !recordReady(visit.epoch)) return;
  render(); document.getElementById('kanji-course-title')?.focus({ preventScroll: true });
}

async function kanjiQuestAct(visit, act) {
  const journey = kanjiQuestFor(visit), quest = visit.quest;
  if (!journey || !quest || visit.pending) return null;
  visit.pending = true; quest.lines = []; render();
  let out;
  try { out = await act(journey.quest.module, journey.lifecycle, journey.quest.state, { owned: kanjiQuestOwner(journey) }); }
  catch { out = { kind: 'uncertain' }; }
  visit.pending = false;
  return visit.quest === quest ? { journey, quest, out } : null;
}

async function kanjiQuestCreate(visit) {
  const acted = await kanjiQuestAct(visit, (module, lc, state, opts) => module.createQuest(lc, state, visit.quest.seed, opts));
  if (acted) {
    const { journey, quest, out } = acted;
    if ((out.kind === 'published' && out.goalId != null) || (out.kind === 'exists' && out.status === 'unfinished'))
      Object.assign(quest, { goalId: out.goalId, view: 'page' });
    else if (out.kind === 'pool-full') quest.view = 'pool';
    // an End still pending for this occurrence, or a create already in flight that has not resolved, is not known either way
    else quest.lines = kanjiQuestLines(journey, 'create', out.kind === 'published' || out.kind === 'pending-end' ||
      out.reason === 'create-unresolved' ? { kind: 'uncertain' } : out);
  }
  kanjiQuestRedraw(visit);
}

async function kanjiQuestEnd(visit) {
  const acted = await kanjiQuestAct(visit, (module, lc, state, opts) => module.endQuest(lc, state, visit.quest.goalId, opts));
  if (acted) {
    const { journey, quest, out } = acted;
    quest.confirmEnd = false;
    if (out.kind === 'published' || out.kind === 'absent') Object.assign(quest, { view: 'ended', lines: out.kind === 'published' ? ['Q-24'] : [] });
    else quest.lines = kanjiQuestLines(journey, 'end', out);
  }
  kanjiQuestRedraw(visit);
}

async function kanjiQuestClear(visit, goalId) {
  const acted = await kanjiQuestAct(visit, (module, lc, state, opts) => module.clearCompleted(lc, state, goalId, opts));
  if (acted) acted.quest.lines = kanjiQuestLines(acted.journey, 'retire', acted.out);
  kanjiQuestRedraw(visit);
}

function kanjiQuestOpen(node, invoker, seed, goalId) {
  if (!openKanjiCourseUnit(node, invoker)) return false;
  Object.assign(S.kanjiCourse, { chooser: false, blocked: null,
    quest: { seed, goalId, view: goalId === null ? 'objective' : 'page', lines: [], confirmEnd: false, done: false } });
  render(); document.getElementById('kanji-course-title')?.focus();
  return true;
}

function kanjiQuestStage(visit) {
  const quest = visit.quest, journey = quest ? kanjiQuestFor(visit) : null;
  if (!journey) { if (quest) visit.quest = null; return null; }
  if (quest.view === 'page' && !quest.done &&
      !journey.quest.module.quests(journey.lifecycle.inspect().root).some((goal) => goal.id === quest.goalId)) quest.view = 'ended';
  return quest.view;
}

function kanjiQuestPool(main, visit, journey, button, redraw) {
  main.append(el('p', 'gloss', kanjiQuestLine('Q-13r')));
  const go = (goal, confirmEnd) => {
    visit.quest = { seed: goal.seed, goalId: goal.id, view: 'page', lines: [], confirmEnd, done: false }; redraw();
  };
  for (const goal of journey.quest.module.quests(journey.lifecycle.inspect().root)) {
    if (goal.status === 'unfinished') {
      main.append(el('p', 'fine', kanjiQuestLine('Q-08')));
      const sentence = kanjiQuestQuote(goal.seed);
      if (sentence) main.append(el('p', 'fine', sentence));
      main.append(button(`kanji-quest-resume-${goal.id}`, ...M4_COPY['Q-08b'], () => go(goal, false)),
        button(`kanji-quest-end-${goal.id}`, ...M4_COPY['Q-10'], () => go(goal, true)));
    } else if (goal.status === 'completed') {
      main.append(button(`kanji-quest-clear-${goal.id}`, ...M4_COPY['Q-26'], () => kanjiQuestClear(visit, goal.id)));
    }
  }
}

function kanjiQuestRender(main, visit, redraw, button) {
  const quest = visit.quest, journey = kanjiQuestFor(visit);
  if (!quest || !journey) return false;
  const { module } = journey.quest;
  const lines = (ids) => {
    for (const id of ids) { const line = el('p', 'gloss', kanjiQuestLine(id)); line.setAttribute('role', 'status'); main.append(line); }
  };
  if (journey.quest.restarted && quest.view === 'page') { journey.quest.restarted = false; lines(['Q-15r']); }
  lines(quest.lines);
  if (quest.view === 'room' || quest.view === 'ended') return false;
  main.append(el('h2', 'list-head', kanjiQuestLine('Q-02')));
  if (kanjiQuestStructural(journey)) { lines(['Q-17']); return true; }
  const root = journey.lifecycle.inspect().root;
  if (quest.view === 'pool') { kanjiQuestPool(main, visit, journey, button, redraw); return true; }
  if (quest.view === 'objective') {
    // no reading: the next thing asked is the reading (§2.1)
    main.append(el('p', 'gloss', kanjiQuestLine('Q-03')));
    const sentence = kanjiQuestQuote(quest.seed);
    if (sentence) main.append(el('p', 'fine', kanjiQuestLine('Q-04')), el('p', 'gloss', sentence));
    main.append(el('p', 'fine', kanjiQuestLine('Q-14')), el('p', 'fine', kanjiQuestLine('Q-06')));
    const goal = module.questFor(root, quest.seed);
    if (goal?.status === 'completed') {
      lines(['Q-12']);
      main.append(button('kanji-quest-clear', ...M4_COPY['Q-26'], () => kanjiQuestClear(visit, goal.id)));
    } else if (module.quests(root).length >= journey.module.LIMITS.goals) kanjiQuestPool(main, visit, journey, button, redraw);
    else main.append(button('kanji-quest-start', ...M4_COPY['Q-05'], () => kanjiQuestCreate(visit), 'take'));
    return true;
  }
  // the quest page: no score, only words done (§4)
  const goal = module.quests(root).find((g) => g.id === quest.goalId);
  if (quest.done || goal?.status === 'completed') {
    lines(['Q-12']);
    main.append(el('p', 'fine', tx('この回の練習結果です。習得・長期記憶を示す点数ではありません。', 'These results describe this practice session. They do not establish mastery or long-term retention.')));
    return true;
  }
  const occupying = kanjiCourseRunKind(visit.run);
  const bound = !!kanjiQuestBinding(journey, visit.run)?.goals.some((g) => g.id === quest.goalId);
  const toRoom = () => { quest.view = 'room'; quest.lines = []; quest.confirmEnd = false; Object.assign(visit, { chooser: false, blocked: null }); };
  const stale = goal ? kanjiQuestStale(goal.seed, redraw) : false;
  if (stale !== false) {
    // lead 2005: a changed sentence refuses to resume, with its line and End only (W12 2008); an unloaded passage can't be checked yet
    lines([{ changed: 'Q-27', unverifiable: 'Q-27u' }[stale] ?? 'Q-17']);
  } else if (occupying && !(occupying === 'reading' && bound)) {
    // §3.3: a pre-goal, Meaning or mixed run is never answered, bound or reset from here; R-11 goes back to it as it is
    lines(['Q-19']);
    main.append(button('kanji-room-return', ...M4_COPY['R-11'], () => { toRoom(); redraw(); }));
  } else {
    const door = el('button', 'study-door');
    door.type = 'button'; door.id = 'kanji-quest-reading'; door.dataset.studyDoor = 'room-reading';
    door.append(el('span', 'study-door-t', tx(...ROOM_NAMES.rooms['room-reading'])),
      el('span', 'study-door-sub', kanjiQuestLine('Q-09', occupying ? kanjiQuestWordsDone(visit.run) : 0)));
    door.disabled = !!visit.pending;
    door.addEventListener('click', () => {
      if (S.kanjiCourse !== visit || visit.pending) return;
      toRoom(); kanjiChooseRoom(visit, 'reading'); redraw();
    });
    main.append(door, button('kanji-quest-rooms', ...M4_COPY['R-01'], () => { toRoom(); visit.chooser = true; redraw(); }));
  }
  if (quest.confirmEnd) {
    main.append(el('p', 'fine', kanjiQuestLine('Q-11')));
    const [endJa, keepJa] = M4_COPY['Q-11b'][0].split(' · '), [endEn, keepEn] = M4_COPY['Q-11b'][1].split(' · ');
    main.append(button('kanji-quest-end-confirm', endJa, endEn, () => kanjiQuestEnd(visit)),
      button('kanji-quest-end-keep', keepJa, keepEn, () => { quest.confirmEnd = false; redraw(); }));
  } else main.append(button('kanji-quest-end', ...M4_COPY['Q-10'], () => { quest.confirmEnd = true; quest.lines = []; redraw(); }));
  return true;
}

function kanjiQuestSummary(main, visit, button, start) {
  if (!kanjiQuestBound(visit)) return;
  const settle = visit.questSettle?.sessionId === visit.run.sessionId ? visit.questSettle : null;
  const line = (id) => { const p = el('p', 'gloss', kanjiQuestLine(id)); p.setAttribute('role', 'status'); main.append(p); };
  if (!settle) { line('Q-18'); main.append(button('kanji-quest-again', ...M4_COPY['Q-18b'], () => start('check'), 'take')); return; }
  for (const id of settle.pending ? [] : settle.lines) line(id);
}

function sentenceKept(node) {
  const quote = node?.sourceContext?.quote || teacherSentence(node)?.quote || '';
  return !!quote && (S.teacherContexts?.entries || []).some((entry) => entry.quote === quote);
}

function kanjiFactsState() {
  if (!D.referenceExtra) return kanjiReadingsState();
  return window.BunkiReferenceCore?.validateKanjiFacts(D.referenceExtra) ? 'complete' : 'failed';
}

function kanjiFacts(id) {
  return kanjiFactsState() === 'complete' ? window.BunkiReferenceCore.kanjiReferenceFacts(D.referenceExtra, id) : null;
}

function kanjiReferenceView(id, fallback = null) {
  const facts = kanjiFacts(id);
  const state = kanjiFactsState();
  const meanings = facts?.completeMeanings || (fallback?.meanings?.length ? fallback.meanings : fallback?.m ? [fallback.m] : []);
  return { ...facts, meanings: [...meanings], state: facts ? 'complete' : state === 'complete' ? 'absent' : state };
}

function kanjiFactsStatus(host, state, retryId, refresh) {
  if (state !== 'pending' && state !== 'failed') return;
  const line = el('p', 'fine reading-source-note', state === 'failed'
    ? tx('辞書の意味・部首分類を読み込めませんでした。', 'Dictionary meanings and radical classifications could not load.')
    : tx('辞書の意味・部首分類を読み込み中…', 'Loading dictionary meanings and radical classifications…'));
  line.dataset.kanjiFactsState = state;
  line.setAttribute('role', 'status');
  host.append(line);
  if (state !== 'failed') return;
  const retry = biLabel('button', 'chip', '再試行', 'Try again');
  retry.type = 'button';
  retry.id = retryId;
  retry.addEventListener('click', () => {
    const task = loadReferenceExtra();
    refresh();
    void task.then(() => { if (host.isConnected) refresh(); });
  });
  host.append(retry);
}

function kanjiReference(id) {
  const rows = kanjiReferenceRows();
  const row = rows?.readings.get(id);
  const added = rows?.official.get(id) || [];
  const helpers = window.BunkiReferenceCore;
  const core = D.kanji?.[id];
  if (!helpers?.mergeReadings || !helpers?.joyoKunDisplay || !helpers?.joyoOnDisplay) {
    return core ? { ...core, lessonOn: [...(core.on || [])], lessonKun: [...(core.kun || [])], officialReadings: [], readingsState: 'failed' } : null;
  }
  const isOn = (reading) => helpers.readingKey(reading).startsWith('on:');
  const completeKun = helpers.mergeReadings(core?.kun, row?.[2], added.filter((reading) => !isOn(reading)));
  const kunView = helpers.joyoKunDisplay(core?.kun, rows?.joyoKun.get(id), row?.[2], id);
  const completeOn = helpers.mergeReadings(core?.on, row?.[1], added.filter(isOn));
  const onView = helpers.joyoOnDisplay(core?.on, rows?.joyoOn.get(id), completeOn);
  if (core) {
    return {
      ...core,
      ...onView,
      completeOn,
      ...kunView,
      completeKun,
      lessonOn: [...(core.on || [])],
      lessonKun: [...(core.kun || [])],
      officialReadings: added,
      readingsState: row ? 'complete' : rows ? 'listed' : kanjiReadingsState(),
    };
  }
  const record = rows?.records.get(id);
  if (!record) return null;
  return {
    c: id, ...onView, completeOn, ...kunView, completeKun, m: record[1].join('; '), meanings: [...record[1]],
    st: record[2], rad: record[3], parts: [], officialReadings: added, readingsState: 'complete', joyoOutsideCore: true,
  };
}

function joyoOnNote(id, shown, tag = 'p', className = 'fine') {
  const current = kanjiReference(id);
  if (!current?.joyoOn) return null;
  const parts = [];
  if (retainedKanjiRecord(id)) parts.push(tx('常用漢字表（2010年）の音読み', 'Jōyō on readings (2010 table)') +
    ' — ' + (current.joyoOn.join('・') || '—'));
  const outside = (shown || []).filter(reading => !current.joyoOn.includes(reading));
  if (outside.length) parts.push(tx('常用漢字表外の音読み', 'On readings outside the jōyō table') + ' — ' + outside.join('・'));
  if (!parts.length) return null;
  const note = el(tag, className, parts.join(' / '));
  note.dataset.joyoOnStatus = id;
  return note;
}

function kanjiFinderUniverse() {
  const rows = kanjiReferenceRows();
  const keys = Object.keys(D.kanji || {});
  return rows ? [...keys, ...[...rows.records.keys()].filter((glyph) => !D.kanji[glyph])] : keys;
}

function kanjiEntryRecord(id, reference = null) {
  return retainedKanjiRecord(id) || kanjiDisplayRecord(id, reference) || D.kanji[id] || window.BunkiSkipUI?.getKanji(S.skipUi, id) || null;
}

function strokeRoomRecord(id) {
  return kanjiEntryRecord(id, S.stack.findLast((node) => node.t === 'kanji' && node.id === id)?.referenceEntry);
}

function kdxGridShown(chars, cap, open) {
  return open ? chars : chars.slice(0, cap);
}

function kdxGlyphName(c, reading = '') {
  const gloss = kanjiReferenceView(c, D.kanji[c] || kanjiReference(c)).meanings.join('; ').toLowerCase();
  const head = reading ? `${c} ${reading}` : c;
  return gloss ? `${head} — ${gloss}` : head;
}

function kdxPartHits() {
  const sel = S.kdx.parts;
  let chars;
  if (sel.length) {
    chars = [...(D.radicals[sel[0]]?.kanji || [])];
    for (const p of sel.slice(1)) {
      const set = new Set(D.radicals[p]?.kanji || []);
      chars = chars.filter((c) => set.has(c));
    }
  } else {
    chars = S.kdx.st ? Object.keys(D.kanji) : [];
  }
  chars = chars.filter((c) => D.kanji[c] && (!S.kdx.st || D.kanji[c].st === S.kdx.st));
  chars.sort((a, b) => D.kanji[a].st - D.kanji[b].st || (a < b ? -1 : 1));
  return chars;
}

function classicalRadicalHits(radical) {
  if (kanjiFactsState() !== 'complete') return [];
  const rec = (c) => D.kanji[c] || kanjiReference(c);
  return kanjiFinderUniverse()
    .filter((c) => kanjiFacts(c)?.radicalSchemes.classical === radical)
    .sort((a, b) => (rec(a)?.st ?? 99) - (rec(b)?.st ?? 99) || (a < b ? -1 : 1));
}

function kdxRadicalResults() {
  const wrap = el('div');
  wrap.id = 'kdx-radical-results';
  const state = kanjiFactsState();
  kanjiFactsStatus(wrap, state, 'kdx-radical-retry', () => {
    document.getElementById('kdx-radical-results')?.replaceWith(kdxRadicalResults());
  });
  if (state !== 'complete' || !S.kdx.rad) return wrap;
  renderKdxGrid(wrap, classicalRadicalHits(S.kdx.rad), 300, `classical:${S.kdx.rad}`, {
    mark: (b) => { b.dataset.rad = String(S.kdx.rad); },
  });
  wrap.append(el('p', 'fine', tx('字引に収録した字の辞書分類です。見える部品で探すには「部品」へ。', 'Dictionary classification within this finder. Use “by its parts” to search visible components.')));
  return wrap;
}

function kdxFrequencyHits(lo, hi) {
  return kanjiFinderUniverse()
    .filter((c) => D.kanjiFreq?.[c] >= lo && D.kanjiFreq[c] <= hi)
    .sort((a, b) => D.kanjiFreq[a] - D.kanjiFreq[b]);
}

function kdxLoadFailed(host, id, ja, en, retry) {
  const line = el('p', 'sem-empty', tx(ja, en));
  line.dataset.kdxLoad = 'failed';
  line.setAttribute('role', 'status');
  const button = biLabel('button', 'chip', '再試行', 'Try again');
  button.type = 'button';
  button.id = id;
  button.addEventListener('click', () => {
    const pending = retry();
    render();
    pending.then(() => {
      if (S.view === 'search' || S.view === 'kanjidex') render();
    });
  });
  host.append(line, button);
}

function kankenLevels() {
  const seen = new Set();
  for (const c of Object.keys(D.kanji)) if (D.kanji[c].kk) seen.add(D.kanji[c].kk);
  const order = (s) => {
    const m = String(s).match(/(準)?(\d+)級/);
    if (!m) return 0;
    return Number(m[2]) * 2 + (m[1] ? 1 : 0);
  };
  return [...seen].sort((a, b) => order(b) - order(a));
}

function kkldNumberGlyphs(ed, number) {
  const table = ed === 'ed1999' ? D.kkld?.byNumber1999 : D.kkld?.byNumber2013;
  return [...(table?.[String(Number(number))] || [])];
}

function kkldOf(c) {
  return D.kkld?.entries?.[c] || null;
}

function kkldLine(c) {
  const k = kkldOf(c);
  if (!k) return '';
  const parts = [];
  if (k.ed2013) parts.push(tx(`2013年版 #${k.ed2013}`, `2013 ed. #${k.ed2013}`));
  if (k.ed1999) parts.push(tx(`1999年版 #${k.ed1999}`, `1999 ed. #${k.ed1999}`));
  return parts.join(' · ');
}

function kdxTextResults(kind) {
  const wrap = el('div');
  wrap.id = 'kdx-results';
  const q = ((kind === 'reading' ? S.kdx.reading : S.kdx.meaning) || '').trim();
  if (!q) return wrap;
  const strokesOf = (c) => (D.kanji[c] || kanjiReference(c))?.st ?? 99;
  if (kind === 'reading') {
    // K03 · the whole reading or its stem, one reading at a time (never concatenated — else 介 + い.う would read
    // かいう ⊇ かい), over every reading the kanji has (K01): たべる, taberu, タベル, ﾀﾍﾞﾙ and an IME's たべr all find
    // 食, and た still does; a reading that IS the query (whole or stem) comes before one that only begins with it.
    const helpers = window.BunkiReferenceCore;
    const qh = helpers.normalizeReadingQuery(q, ROMAJI);
    const rank = new Map();
    if (qh) {
      for (const c of kanjiFinderUniverse()) {
        const k = kanjiReference(c) || D.kanji[c];
        const level = helpers.readingMatch([...(k?.on || []), ...(k?.kun || [])], qh);
        if (level) rank.set(c, level);
      }
    }
    const chars = [...rank.keys()].sort((a, b) => rank.get(b) - rank.get(a) || strokesOf(a) - strokesOf(b) || (a < b ? -1 : 1));
    // until every reading has arrived the search runs over the lessons' readings only, and says so: a miss
    // then is not a "no match" (K06)
    const state = kanjiReadingsState();
    if (state !== 'complete') {
      const line = el('p', 'sem-empty', state === 'failed'
        ? tx('すべての読みを読み込めなかった。いまはレッスン用に選んだ読みだけで探している。', 'Every reading could not be loaded — searching only the readings chosen for lessons.')
        : tx('すべての読みを読み込み中。いまはレッスン用に選んだ読みだけで探している。', 'Loading every reading — searching only the readings chosen for lessons for now.'));
      line.dataset.kdxReadings = state;
      line.setAttribute('role', 'status');
      wrap.append(line);
      if (state === 'failed') {
        const retry = biLabel('button', 'chip', '再試行', 'Try again');
        retry.type = 'button';
        retry.id = 'kdx-readings-retry';
        retry.addEventListener('click', () => {
          const pending = loadReferenceExtra();
          document.getElementById('kdx-results')?.replaceWith(kdxTextResults(kind));
          pending.then(() => document.getElementById('kdx-results')?.replaceWith(kdxTextResults(kind)));
        });
        wrap.append(retry);
      }
    }
    // Hfix-2e (KT-3) · each glyph's name carries the reading it was found by (た.べる is said たべる)
    const readingOf = (c) => {
      const k = kanjiReference(c) || D.kanji[c];
      const hit = [...(k?.on || []), ...(k?.kun || [])].find((r) => helpers.readingMatch([r], qh) === rank.get(c));
      return hit ? String(hit).replace(/[.-]/gu, '') : '';
    };
    renderKdxGrid(wrap, chars, 200, `reading:${qh}`, { empty: state === 'complete', readingOf });
    return wrap;
  }
  const ql = q.toLowerCase();
  const chars = kanjiFinderUniverse()
    .filter((c) => kanjiReferenceView(c, D.kanji[c] || kanjiReference(c)).meanings.some((meaning) => meaning.toLowerCase().includes(ql)))
    .sort((a, b) => strokesOf(a) - strokesOf(b) || (a < b ? -1 : 1));
  const state = kanjiFactsState();
  kanjiFactsStatus(wrap, state, 'kdx-meanings-retry', () => {
    document.getElementById('kdx-results')?.replaceWith(kdxTextResults(kind));
  });
  if (state !== 'complete') wrap.append(el('p', 'fine', tx('いまはレッスン用の語義だけで検索しています。', 'Searching the lesson keywords only for now.')));
  renderKdxGrid(wrap, chars, 200, `meaning:${ql}`, { empty: state === 'complete' });
  return wrap;
}

function renderKdxDraw(main) {
  main.append(withEn(el('p', 'eyebrow', '手書き'), 'draw it — stroke order need not be perfect', 'en-inline'));
  const stage = el('div', 'kdx-draw');
  const canvas = el('canvas', 'kdx-canvas');
  stage.append(canvas);
  main.append(stage);
  const ctrl = el('div', 'kdx-draw-ctrl');
  const undo = el('button', 'kdx-clear', tx('一画消す', 'undo stroke'));
  const clear = el('button', 'kdx-clear', tx('消す', 'clear'));
  undo.type = clear.type = 'button';
  ctrl.append(undo, clear);
  main.append(ctrl);
  const results = el('div');
  results.id = 'kdx-results';
  main.append(results);

  const SIZE = 300;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const strokes = [];
  let cur = null;
  const inkColor = () => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#14181c';
  const redraw = () => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = inkColor();
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const draw = (s) => {
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x * SIZE, p.y * SIZE) : ctx.moveTo(p.x * SIZE, p.y * SIZE)));
      ctx.stroke();
    };
    strokes.forEach(draw);
    if (cur) draw(cur);
  };
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const recognize = () => {
    document.getElementById('kdx-results')?.replaceWith(kdxDrawResults(recognizeKanji(strokes)));
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    cur = [at(e)];
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return;
    e.preventDefault();
    cur.push(at(e));
    redraw();
  });
  const finish = () => {
    if (!cur) return;
    if (cur.length > 1) strokes.push(cur);
    cur = null;
    redraw();
    recognize();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  undo.addEventListener('click', () => {
    strokes.pop();
    redraw();
    if (strokes.length) recognize();
    else document.getElementById('kdx-results')?.replaceWith(Object.assign(el('div'), { id: 'kdx-results' }));
  });
  clear.addEventListener('click', () => {
    strokes.length = 0;
    cur = null;
    redraw();
    document.getElementById('kdx-results')?.replaceWith(Object.assign(el('div'), { id: 'kdx-results' }));
  });
}

function kdxDrawResults(chars) {
  const wrap = el('div');
  wrap.id = 'kdx-results';
  if (!chars.length) return wrap;
  wrap.append(withEn(el('p', 'eyebrow', 'にた字'), 'closest matches — tap to open', 'en-inline'));
  const grid = el('div', 'kdx-grid');
  for (const c of chars) {
    const b = el('button', 'kdx-glyph', c);
    b.type = 'button';
    b.setAttribute('aria-label', kdxGlyphName(c));
    b.addEventListener('click', () => go({ t: 'kanji', id: c }));
    grid.append(b);
  }
  wrap.append(grid);
  return wrap;
}

function recognizeKanji(strokes) {
  if (!strokes.length) return [];
  const user = _kdxNorm(strokes).map((s) => _kdxResample(s, _KDX_NPTS));
  const n = user.length;
  const cands = [];
  for (const dn of [n, n - 1, n + 1, n - 2, n + 2]) {
    if (dn < 1) continue;
    for (const t of _kdxTemplates(dn)) cands.push({ c: t.c, d: _kdxDist(user, t.strokes) });
  }
  cands.sort((a, b) => a.d - b.d);
  const seen = new Set();
  const out = [];
  for (const x of cands) {
    if (seen.has(x.c)) continue;
    seen.add(x.c);
    out.push(x.c);
    if (out.length >= 24) break;
  }
  return out;
}

function wwSaveTrail() {
  try { sessionStorage.setItem(WW_WALK_KEY, JSON.stringify(wordWeb.trail || [])); } catch { /* per-viewer convenience only */ }
}

function wwPush(node) {
  const trail = wwTrail();
  const at = trail.findIndex((n) => n.type === node.type && n.key === node.key);
  if (at >= 0) trail.splice(at + 1);
  else trail.push({ type: node.type, key: node.key, why: node.why || null });
  if (trail.length > WW_TRAIL_MAX) trail.splice(0, trail.length - WW_TRAIL_MAX);
  wwSaveTrail();
}

function wwKanjiOf(w) {
  const k = D.words[w]?.k?.length ? D.words[w].k : D.dict[w]?.k?.length ? D.dict[w].k : [...w];
  return [...new Set(k)].filter((c) => D.kanji[c]);
}

function wwParts(c) {
  const parts = [...new Set(D.kanji[c]?.parts || [])].filter((p) => p !== c);
  const sets = parts.map(wwPartMembers);
  const kept = parts.filter((p, i) => !parts.some((q, j) => {
    if (j === i) return false;
    const a = sets[j];
    const b = sets[i];
    if (!a.size || a.size > b.size || (a.size === b.size && j > i)) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }));
  // the most telling parts first: a part few kanji share (隹, 40) says more than 亻 (185)
  const size = new Map(parts.map((p, i) => [p, sets[i].size]));
  return kept.sort((a, b) => size.get(a) - size.get(b));
}

function wwWord(w) {
  let rec;
  try { rec = lookup(w); } catch { rec = null; }
  const graded = D.words[w];
  const senses = rec?.m?.length ? rec.m : graded?.g ? [graded.g] : [];
  return { reading: rec?.r || graded?.r || '', senses, jlpt: graded?.jlpt || null };
}

function wwMine() {
  const words = new Set();
  const kanji = new Set();
  for (const row of S.taken) {
    if (row.t === 'word') {
      words.add(row.id);
      for (const c of wwKanjiOf(row.id)) kanji.add(c);
    } else if (row.t === 'kanji') kanji.add(row.id);
  }
  return { words, kanji };
}

function wwDueToday(w) {
  if (!S.taken.some((row) => row.t === 'word' && row.id === w)) return false;
  const rec = S.srs[srsKey('word', w)];
  if (!rec) return true;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return Date.parse(rec.due) <= end.getTime();
}

function wwDefault() {
  const trail = wwTrail();
  if (trail.length) return trail.at(-1);
  const ok = (w) => w && (D.dict[w] || D.words[w]) && wwKanjiOf(w).length && !wwDueToday(w);
  const log = S.obslog || [];
  for (let i = log.length - 1; i >= 0 && i >= log.length - 400; i -= 1) {
    const row = log[i];
    if (row[1] === 'tap' && row[3] >= 2 && typeof row[2] === 'string' && row[2].startsWith('word:') && ok(row[2].slice(5))) {
      return { type: 'word', key: row[2].slice(5), why: 'looked' };
    }
  }
  for (let i = S.taken.length - 1; i >= 0; i -= 1) {
    const row = S.taken[i];
    if (row.t === 'word' && ok(row.id)) return { type: 'word', key: row.id, why: 'saved' };
  }
  const held = new Set(S.taken.filter((row) => row.t === 'word').map((row) => row.id));
  const heads = Object.keys(D.sem || {}).filter((w) => !held.has(w) && wwKanjiOf(w).length >= 2 && (D.dict[w] || D.words[w])).sort();
  if (heads.length) {
    const now = new Date();
    const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
    return { type: 'word', key: heads[day % heads.length], why: 'day' };
  }
  return null;
}

function wwPassageIndex(p) {
  let ix = wwTokenIndex.get(p.tokens);
  if (!ix) {
    const bases = new Set();
    let text = '';
    for (const t of p.tokens) {
      if (!t.c) continue;
      bases.add(t.b);
      text += t.s;
    }
    ix = { bases, text };
    wwTokenIndex.set(p.tokens, ix);
  }
  return ix;
}

function wwSentences(p, test, cap, out) {
  let sentence = [];
  let start = 0;
  let hit = -1;
  for (const [index, t] of p.tokens.entries()) {
    sentence.push(t);
    if (hit < 0 && t.c && test(t)) hit = sentence.length - 1;
    if ('。！？'.includes(t.s)) {
      if (hit >= 0 && sentence.length <= 80) {
        out.push({ tokens: sentence, source: learnerSourceLabel(p), passage: p.id, start, target: sentence[hit].b });
        if (out.length >= cap) return;
      }
      sentence = [];
      start = index + 1;
      hit = -1;
    }
  }
}

function wwPassages(w, cap = 2) {
  const out = [];
  for (const p of D.passages || []) {
    if (D.libraryDiscoverable?.(p) === false || !p.tokens || !wwPassageIndex(p).bases.has(w)) continue;
    wwSentences(p, (t) => t.b === w, cap, out);
    if (out.length >= cap) return out;
  }
  // KT-6 · only the word's own bank lines: a kana key's homophones are not its passages
  for (const ex of bankExamplesFor(w)) {
    if (out.length >= cap) break;
    out.push({ ...ex, target: w });
  }
  return out;
}

function wwKanjiPassage(c) {
  const out = [];
  for (const p of D.passages || []) {
    if (D.libraryDiscoverable?.(p) === false || !p.tokens || !wwPassageIndex(p).text.includes(c)) continue;
    wwSentences(p, (t) => String(t.s).includes(c), 1, out);
    if (out.length) return out[0];
  }
  return null;
}

function wwGrammarFor(w) {
  if ([...w].length < 2) return null;
  const norm = (p) => String(p).replace(/[〜～\s（）()]/g, '');
  const all = GRAMMARS();
  return all.find((g) => norm(g.p).split('／').includes(w)) || all.find((g) => (g.ex || []).some((e) => String(e.ja || '').includes(w))) || null;
}

function wwExcerpt(ex, target) {
  const text = ex.tokens.map((t) => t.s).join('');
  const ti = ex.tokens.findIndex((t) => t.b === target || String(t.s).includes(target));
  if (ti < 0) return { before: '', word: text.slice(0, 8), after: '' };
  const before = ex.tokens.slice(0, ti).map((t) => t.s).join('');
  const after = ex.tokens.slice(ti + 1).map((t) => t.s).join('');
  return { before: before.slice(-3), word: ex.tokens[ti].s, after: after.slice(0, 2), full: text, ti };
}

function wwOpenPassage(ex, target, invoker) {
  const home = ex.passage && D.passages.some((p) => p.id === ex.passage) ? ex.passage : null;
  if (home) {
    keepNavigationReturn('reader', invoker);
    const from = sentenceSource(ex.tokens, home, ex.start);
    const ti = ex.tokens.findIndex((t) => t.b === target);
    openPassage(home, from ? { index: from.index + Math.max(0, ti) } : null);
    return;
  }
  go({ t: 'sent', tokens: ex.tokens, en: ex.en || '', source: ex.source || '', passage: null, start: ex.start, target }, { invoker });
}

function wwKanjiCap(c) {
  const k = D.kanji[c];
  if (!k) return { en: '', ja: '' };
  // Q · a caption is a name: the plain meaning a part's row gives (partMeaning); the whole meaning is the slip's, a hold away
  return { en: partMeaning(kanjiReferenceView(c, k).meanings.join('; ')), ja: String((k.kun || [])[0] || (k.on || [])[0] || '').replace(/\..*$/, '') };
}

function wwPartName(p) {
  const official = D.radByGlyph?.[p]?.name;
  if (official) return official;
  const named = String(D.radicals?.[p]?.name || '');
  if (!named) return '';
  const k = D.kanji[p];
  const readings = new Set([...(k?.kun || []), ...(k?.on || [])].map((r) => String(r).replace(/\..*$/, '').replace(/-/g, '')));
  const kata = named.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  return readings.has(named) || readings.has(kata) ? '' : named;
}

function wwPartCap(p, mine) {
  const members = wwPartMembers(p);
  const count = D.radicals?.[p]?.kanjiCount || members.size;
  return {
    en: partGloss(null, p) || `${count} kanji`,
    ja: wwPartName(p),
    count,
    mine: [...members].filter((c) => mine.kanji.has(c)).length,
  };
}

function wwModel(centre, mine) {
  const nodes = [];
  const trail = wwTrail();
  const prev = trail.length > 1 ? trail.at(-2) : null;
  // ring 2 sits in fixed slots under the centre, so captions never collide
  const ring2 = (list, from) => {
    const use = WW_RING2_ORDER[Math.min(list.length, 5)] || [];
    use.forEach((slot, i) => {
      const [x, y] = WW_RING2_SLOTS[slot];
      nodes.push({ ...list[i], x, y, from: [from] });
    });
  };
  if (centre.type === 'word') {
    const w = centre.key;
    const info = wwWord(w);
    const ks = wwKanjiOf(w).slice(0, 4);
    const angles = WW_KANJI_ANGLES[ks.length] || [];
    const kpos = ks.map((c, i) => wwP(angles[i], 102, 92));
    ks.forEach((c, i) => {
      const cap = wwKanjiCap(c);
      nodes.push({ type: 'kanji', key: c, x: kpos[i][0], y: kpos[i][1], from: [[WW_CX, WW_CY]], cap: cap.en, capJa: cap.ja, mine: mine.kanji.has(c) });
    });
    // parts: one or two per kanji, a part two kanji share hung between them
    const owners = new Map();
    ks.forEach((c, i) => wwParts(c).slice(0, ks.length > 2 ? 1 : 2).forEach((p) => owners.set(p, [...(owners.get(p) || []), i])));
    const shared = [...owners.entries()].filter(([, o]) => o.length > 1).map(([p]) => p);
    let placed = 0;
    for (const [p, o] of owners) {
      if (placed >= 5) break;
      let x;
      let y;
      if (o.length > 1) {
        x = o.reduce((s, i) => s + kpos[i][0], 0) / o.length;
        y = Math.min(...o.map((i) => kpos[i][1])) - 76;
      } else {
        const i = o[0];
        const own = [...owners.entries()].filter(([, oo]) => oo.length === 1 && oo[0] === i).map(([q]) => q);
        const hasShared = shared.some((q) => owners.get(q).includes(i));
        const a = angles[i];
        const side = a < -90 ? -1 : a > -90 ? 1 : 0;
        let off = 0;
        if (own.length > 1) off = (own.indexOf(p) ? 1 : -1) * 22;
        else if (hasShared) off = side * 26;
        [x, y] = wwP(a + off, ks.length > 2 ? 158 : 164, ks.length > 2 ? 150 : 168);
      }
      const cap = wwPartCap(p, mine);
      nodes.push({ type: 'part', key: p, x, y, from: o.map((i) => kpos[i]), cap: cap.en, capJa: cap.ja, live: o.length > 1 });
      placed += 1;
    }
    // ring 2: hand-written neighbours first, then words that share a kanji
    const seen = new Set([w]);
    const below = [];
    for (const edge of D.sem[w] || []) {
      if (below.length >= 2) break;
      if (seen.has(edge.w) || [...edge.w].length > 4) continue;
      seen.add(edge.w);
      below.push({ type: 'word', key: edge.w, cap: tx(...(WW_REL[edge.rel] || ['関連', 'related'])), capJa: tx(...(WW_REL[edge.rel] || ['関連', 'related'])), rel: true, hi: ks, mine: mine.words.has(edge.w) });
    }
    const lists = ks.map((c) => (D.kanjiWords[c] || []).filter((x) => [...x].length <= 4));
    const siblings = new Set();
    for (const list of lists) for (const x of list) if (x !== w) siblings.add(x);
    for (let round = 0; below.length < 5 && round < 12; round += 1) {
      for (const list of lists) {
        const x = list.find((cand) => !seen.has(cand));
        if (!x || below.length >= 5) continue;
        seen.add(x);
        const wi = wwWord(x);
        below.push({ type: 'word', key: x, cap: wwShort(wi.senses[0]), capJa: wi.reading, hi: ks, mine: mine.words.has(x) });
      }
    }
    ring2(below, [WW_CX, WW_CY]);
    // side cards: a real passage (left) and a linked grammar point or a second passage (right)
    const ex = wwPassages(w, 2);
    const side = [];
    if (ex[0]) side.push({ type: 'passage', key: `${ex[0].passage || 'bank'}:${ex[0].start}`, ex: ex[0], target: w });
    const g = wwGrammarFor(w);
    if (g) side.push({ type: 'grammar', key: g.id, label: g.p, cap: wwShort(g.mEn), capJa: g.lv || '' });
    else if (ex[1]) side.push({ type: 'passage', key: `${ex[1].passage || 'bank'}:${ex[1].start}`, ex: ex[1], target: w });
    side.forEach((s, i) => {
      const [x, y] = wwP(i ? 0 : 180, 136, 0);
      nodes.push({ ...s, x, y: y - 4, from: [[WW_CX, WW_CY]], card: true });
    });
    const strokes = ks.reduce((s, c) => s + (D.kanji[c]?.st || 0), 0);
    const kk = ks.map((c) => D.kanji[c]?.kk).filter(Boolean);
    const kkOrder = (v) => { const n = parseFloat(String(v).replace('準', '')); return (Number.isFinite(n) ? n : 99) + (String(v).startsWith('準') ? 0.5 : 0); };
    const hardest = kk.sort((a, b) => kkOrder(a) - kkOrder(b))[0];
    const met = encounterTrail(srsKey('word', w));
    const saved = S.taken.find((row) => row.t === 'word' && row.id === w);
    const marks = [];
    if (info.reading) marks.push([tx('読み', 'Reading'), info.reading, true]);
    if (info.jlpt) marks.push(['JLPT', `N${info.jlpt}`]);
    if (ks.length) marks.push([tx('漢字', 'Kanji'), String(ks.length)]);
    if (strokes) marks.push([tx('画数', 'Strokes'), String(strokes)]);
    if (hardest) marks.push([tx('漢検', 'Kanken'), bi() ? kankenGradeLabel(hardest) : hardest]);
    if (shared.length) marks.push([tx('共通部品', 'Shared part'), shared[0], true]);
    if (siblings.size) marks.push([tx('仲間の語', 'Siblings'), String(siblings.size)]);
    if (met) marks.push([tx('初めて', 'First met'), new Date(met.first).toLocaleDateString()]);
    if (saved?.ts) marks.push([tx('覚え始め', 'Saved'), new Date(saved.ts).toLocaleDateString()]);
    const follow = shared.length ? { part: shared[0], kanji: owners.get(shared[0]).map((i) => ks[i]), ...wwPartCap(shared[0], mine) } : null;
    return { centre: { ...centre, glyph: w, reading: info.reading, gloss: bi() ? wwShort(info.senses[0]) : '', strokes }, nodes, marks, senses: info.senses, examples: ex, follow };
  }
  if (centre.type === 'kanji') {
    const c = centre.key;
    const k = D.kanji[c] || {};
    const parts = wwParts(c).slice(0, 4);
    const prevParts = prev?.type === 'word' ? new Set(wwKanjiOf(prev.key).filter((x) => x !== c).flatMap((x) => wwParts(x))) : new Set();
    const angles = WW_KANJI_ANGLES[parts.length] || [];
    parts.forEach((p, i) => {
      const [x, y] = wwP(angles[i], 124, parts.length > 2 ? 128 : 136);
      const cap = wwPartCap(p, mine);
      nodes.push({ type: 'part', key: p, x, y, from: [[WW_CX, WW_CY]], cap: cap.en, capJa: cap.ja, live: prevParts.has(p) || (prev?.type === 'part' && prev.key === p) });
    });
    const words = (D.kanjiWords[c] || []).filter((x) => [...x].length <= 4 && x !== c);
    const pick = [];
    if (prev?.type === 'word' && words.includes(prev.key)) pick.push(prev.key);
    for (const x of words) if (pick.length < 5 && !pick.includes(x)) pick.push(x);
    ring2(pick.map((x) => { const wi = wwWord(x); return { type: 'word', key: x, cap: wwShort(wi.senses[0]), capJa: wi.reading, hi: [c], mine: mine.words.has(x) }; }), [WW_CX, WW_CY]);
    const ex = wwKanjiPassage(c);
    if (ex) {
      const [x, y] = wwP(180, 136, 0);
      nodes.push({ type: 'passage', key: `${ex.passage}:${ex.start}`, ex, target: ex.target, x, y: y - 4, from: [[WW_CX, WW_CY]], card: true });
    }
    const facts = kanjiFacts(c);
    const rad = facts && D.radInfo?.[facts.radicalSchemes.classical];
    const inMine = [...mine.words].filter((x) => wwKanjiOf(x).includes(c)).length;
    const met = encounterTrail(srsKey('kanji', c));
    const marks = [];
    if (k.st) marks.push([tx('画数', 'Strokes'), String(k.st)]);
    if (k.kk) marks.push([tx('漢検', 'Kanken'), bi() ? kankenGradeLabel(k.kk) : k.kk]);
    if (k.on?.length) marks.push([tx('音読み', 'On'), k.on.slice(0, 2).join('・'), true]);
    if (k.kun?.length) marks.push([tx('訓読み', 'Kun'), k.kun.slice(0, 2).map((r) => r.replace(/\.(.+)$/, '($1)')).join('・'), true]);
    if (rad) marks.push([tx('伝統部首（KANJIDIC2）', 'Classical radical (KANJIDIC2)'), `${rad.c} ${rad.n}`, true]);
    if (D.kanjiWords[c]?.length) marks.push([tx('この字の語', 'Words with it'), String(D.kanjiWords[c].length)]);
    marks.push([tx('あなたの語', 'In your words'), String(inMine)]);
    if (D.kanjiFreq?.[c]) marks.push([tx('頻度順位', 'Frequency rank'), String(D.kanjiFreq[c])]);
    if (met) marks.push([tx('初めて', 'First met'), new Date(met.first).toLocaleDateString()]);
    const cap = wwKanjiCap(c);
    return { centre: { ...centre, glyph: c, reading: (k.on || [])[0] || '', gloss: bi() ? cap.en : cap.ja, strokes: k.st || 0 }, nodes, marks, senses: kanjiReferenceView(c, k).meanings, examples: ex ? [ex] : [] };
  }
  // a part: its family on one ring — your kanji first, the kanji you came from among them
  const p = centre.key;
  const members = [...wwPartMembers(p)];
  const words = (c) => D.kanjiWords[c]?.length || 0;
  members.sort((a, b) => (mine.kanji.has(b) - mine.kanji.has(a)) || (words(b) - words(a)) || (a < b ? -1 : 1));
  if (prev?.type === 'kanji' && members.includes(prev.key)) {
    members.splice(members.indexOf(prev.key), 1);
    members.unshift(prev.key);
  }
  const ring = members.slice(0, 10);
  const big = ring.length > 6;
  wwSpread(ring.length, -90, 270 - 360 / Math.max(ring.length, 1)).forEach((ang, i) => {
    const [x, y] = wwP(ang, big ? 136 : 112, big ? 142 : 116);
    const cap = wwKanjiCap(ring[i]);
    nodes.push({ type: 'kanji', key: ring[i], x, y, from: [[WW_CX, WW_CY]], cap: cap.en, capJa: cap.ja, mine: mine.kanji.has(ring[i]), live: prev?.key === ring[i] });
  });
  const cap = wwPartCap(p, mine);
  const st = D.radicals?.[p]?.st || D.kanji[p]?.st || 0;
  const rad = D.radByGlyph?.[p] || null;
  const marks = [];
  if (cap.ja) marks.push([tx('名前', 'Name'), cap.ja, true]);
  if (st) marks.push([tx('画数', 'Strokes'), String(st)]);
  // the family line above the marks already carries the count and how many are yours; the
  // marks hold only what it does not say
  if (rad) marks.push([tx('部首番号', 'Radical no.'), String(rad.n)]);
  if (D.kanji[p]?.m && bi()) marks.push(['Meaning', String(D.kanji[p].m).toLowerCase()]);
  if (D.kanji[p]?.kk) marks.push([tx('漢検', 'Kanken'), bi() ? kankenGradeLabel(D.kanji[p].kk) : D.kanji[p].kk]);
  if (D.kanjiFreq?.[p]) marks.push([tx('頻度順位', 'Frequency rank'), String(D.kanjiFreq[p])]);
  return {
    centre: { ...centre, glyph: p, reading: cap.ja, gloss: bi() ? partGloss(null, p) : '', strokes: st },
    nodes, marks, senses: [], examples: [], family: members, familyCount: cap.count, familyMine: cap.mine,
  };
}

function wwLearn(tag, cls, text) {
  const n = el(tag, cls, text);
  n.lang = 'ja';
  n.dataset.uiContent = 'learning';
  return n;
}

function wwInkLabel(text, hi) {
  const n = wwLearn('span', 'ww-g');
  for (const ch of [...text]) {
    if (hi?.includes(ch)) n.append(el('b', null, ch));
    else n.append(document.createTextNode(ch));
  }
  return n;
}

function wwReadingChoices(c) {
  const choices = el('div', 'ww-reading-choices');
  choices.dataset.japaneseLookup = 'off';
  const state = wordWeb.readingChoices;
  if (!state || c.type !== 'word' || state.key !== c.key || state.reading !== c.reading) return choices;
  if (state.rows === null && !state.error) {
    state.loading ||= ensureDictionaryRowsForForm(c.reading).then((rows) => {
      state.rows = readerChoiceMatch({ b: c.reading, s: c.reading, r: c.reading }, rows).rows;
    }).catch(() => { state.error = true; });
    state.loading.then(() => {
      if (choices.isConnected && wordWeb.readingChoices === state) choices.replaceWith(wwReadingChoices(c));
    });
    return choices;
  }
  if (state.error) {
    choices.append(el('p', 'note', tx('同じ読みのほかの語を読み込めなかった。読みをもう一度押すと再試行する。',
      'Other words with this reading could not load. Tap the reading again to retry.')));
    return choices;
  }
  if (state.rows.length < 2) return choices;
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', tx(`「${c.reading}」と読む語`, `Words read ${c.reading}`));
  choices.append(el('p', 'note', tx(`「${c.reading}」と読む語`, `Words read ${c.reading}`)));
  for (const match of state.rows) {
    const choice = wwLearn('button', 'chip ww-reading-choice', `${match.head} · ${match.reading}`);
    choice.type = 'button'; choice.dataset.seq = match.seq;
    choice.append(el('span', null, ` — ${match.gloss}`));
    choice.addEventListener('click', (click) => openSlip({ t: 'word', id: match.head, seq: match.seq, reading: match.reading }, {
      anchor: choice, from: 'lookup', focus: click.detail === 0, readingVisible: () => true,
    }));
    choices.append(choice);
  }
  return choices;
}

function wwSlipNode(n) {
  if (n.type === 'word') return { t: 'word', id: n.key };
  if (n.type === 'kanji' || (n.type === 'part' && D.kanji?.[n.key])) return { t: 'kanji', id: n.key };
  return null;
}

function wwValid(n) {
  if (n.type === 'word') return !!(D.dict[n.key] || D.words[n.key]);
  if (n.type === 'kanji') return !!D.kanji[n.key];
  return n.type === 'part' && (wwPartMembers(n.key).size > 0 || !!D.radicals?.[n.key]);
}

function wwRecentre(node, section, invoker) {
  if (!section?.isConnected) return;
  removeMini(); // the web moves under a slip: the slip goes with the plate it stood on
  const swap = () => {
    wwPush(node);
    const next = renderWordWeb();
    if (!next) return;
    const hadFocus = section.contains(document.activeElement);
    // read before writing: the new section lands exactly where the old one stood
    const top = section.getBoundingClientRect().top;
    section.replaceWith(next);
    if (top < 0) window.scrollBy(0, top - 64);
    const glyph = next.querySelector('.ww-c-glyph');
    if (glyph?.animate) glyph.animate(wwReduced()
      ? [{ opacity: 0.35 }, { opacity: 1 }]
      : [{ opacity: 0.55, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }],
      { duration: motionMs('--motion-ma', 120), easing: motionEase('--ease-enter') });
    if (hadFocus) next.querySelector('.ww-centre')?.focus({ preventScroll: true });
  };
  const from = invoker?.querySelector('.ww-g') || invoker?.querySelector('span');
  const to = section.querySelector('.ww-c-glyph');
  if (wwReduced() || !from || !to || !from.animate) {
    swap();
    return;
  }
  const r0 = from.getBoundingClientRect();
  const r1 = to.getBoundingClientRect();
  section.classList.add('ww-leaving');
  if (invoker.closest('.ww-detail')) section.classList.add('ww-leaving-detail');
  invoker.classList.add('ww-chosen');
  const scale = Math.min(3.2, r1.height / Math.max(r0.height, 1));
  from.animate(
    [{ transform: 'none' }, { transform: `translate(${(r1.left + r1.width / 2 - (r0.left + r0.width / 2)).toFixed(1)}px, ${(r1.top + r1.height / 2 - (r0.top + r0.height / 2)).toFixed(1)}px) scale(${scale.toFixed(2)})` }],
    { duration: motionMs('--motion-standard', 200), easing: motionEase('--ease-enter'), fill: 'forwards' },
  );
  setTimeout(swap, motionMs('--motion-standard', 200));
}

function renderParticleNode(sheet, node) {
  const pt = PARTICLES.find((x) => x.id === node.id);
  if (!pt) {
    sheet.append(el('div', 'sem-empty', tx('この助詞はまだない。', 'This particle page does not exist yet.')));
    return;
  }
  const head = el('h2', 'headword', pt.p);
  head.append(el('span', 'headword-alt', tx('　助詞', '　particle')));
  sheet.append(head);
  if (pt.r !== pt.p) sheet.append(el('p', 'reading', pt.r));
  sheet.append(el('p', 'sense-pos', bi() ? pt.role : pt.roleJa));
  const explanation = el('p', 'gloss', pt.exp);
  explanation.dataset.uiContentValue = (pt.exp.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) || []).join('|');
  sheet.append(explanation);
  sheet.append(withEn(el('p', 'eyebrow', '用例'), 'examples', 'en-inline'));
  for (const ex of pt.ex) {
    const line = el('div', 'example');
    line.append(el('p', 'example-ja', ex.ja));
    if (bi()) line.append(el('p', 'example-en', ex.en));
    sheet.append(line);
  }
  if (pt.see && GRAMMARS().some((g) => g.id === pt.see)) {
    sheet.append(withEn(el('p', 'eyebrow', '文法へ'), 'related grammar', 'en-inline'));
    const g = GRAMMARS().find((x) => x.id === pt.see);
    const row = el('button', 'entry-row');
    row.type = 'button';
    row.append(el('span', 'row-glyph', '文'));
    row.append(el('span', 'row-main grammar-related-content', `${g.p} — ${bi() ? g.mEn : g.mJa}`));
    row.append(el('span', 'row-go', '›'));
    row.addEventListener('click', () => go({ t: 'grammar', id: g.id }));
    sheet.append(row);
  }
}

function renderGrammarNode(sheet, node) {
  const g = GRAMMARS().find((x) => x.id === node.id);
  if (!g) {
    sheet.append(el('div', 'sem-empty', tx('この項目はまだない。', 'This entry does not exist yet.')));
    return;
  }
  sheet.append(el('h2', 'headword', g.p));
  sheet.append(el('p', 'sense-pos', g.lv));
  const meaning = bi() ? (g.mJa ? `${g.mEn} — ${g.mJa}` : g.mEn) : g.mJa || g.mEn;
  sheet.append(el('p', 'gloss grammar-meaning', meaning));
  sheet.append(withEn(el('p', 'eyebrow', '接続'), 'formation', 'en-inline'));
  sheet.append(el('p', 'formation', g.form));
  sheet.append(withEn(el('p', 'eyebrow', '用例'), 'examples', 'en-inline'));
  for (const ex of g.ex) {
    const line = el('div', 'example');
    line.append(el('p', 'example-ja', ex.ja));
    if (bi()) line.append(el('p', 'example-en', ex.en));
    sheet.append(line);
  }
  if (g.note) {
    sheet.append(withEn(el('p', 'eyebrow', '使い分け'), 'usage', 'en-inline'));
    sheet.append(el('p', 'sem-note grammar-note', g.note));
  }
}

function renderSentenceNode(sheet, node) {
  if (node.familyExample) { renderFamilyExampleNode(sheet, node); return; }
  sheet.append(withEn(el('p', 'eyebrow', '文'), 'one sentence, read closely', 'en-inline'));
  const line = el('p', 'sent-reader');
  // on its own page the sentence is ALL reader: the highlighted word keeps
  // its mark but joins the ladder like every neighbour
  renderSentenceTokens(line, node.tokens, {
    targetId: node.target || null,
    targetLive: true,
    contextId: node.passage || 'bank',
    start: node.start,
  });
  sheet.append(line);
  if (node.en) sheet.append(el('p', 'sent-reader-en', node.en));
  if (node.source) sheet.append(el('p', 'example-src', node.source));
  // …and on to the whole article. The rubric asks a review answer to return
  // the learner to the source sentence AND its article (§9.5); the C1
  // demonstration found the sentence half present and this half missing.
  // The door appears only when the sentence really came from a shelf
  // article — a bank example has no article to walk into, and an honest
  // absence beats a door onto nothing.
  const home = node.passage && D.passages.some((p) => p.id === node.passage) ? node.passage : null;
  if (home) {
    const doorRow = el('div', 'sent-home-row');
    const door = biLabel('button', 'chip sent-home', 'この記事を読む', 'read the source article');
    door.type = 'button';
    door.id = 'sent-home';
    door.addEventListener('click', () => {
      if (scaleNodeBelongs(node) && scaleOut()) return;
      keepNavigationReturn('reader', door);
      const from = sentenceSource(node.tokens, home, node.start);
      const targetIndex = Number.isInteger(node.targetOffset) ? node.targetOffset : node.tokens.findIndex((token) => token.b === node.target);
      openPassage(home, from ? { index: from.index + Math.max(0, targetIndex) } : null);
    });
    doorRow.append(door);
    sheet.append(doorRow);
  }
  sheet.append(el('p', 'gloss', tapLadderHint()));
}

function sentenceDoor(ex, target) {
  const door = el('button', 'sent-door', '▷');
  door.type = 'button';
  door.setAttribute('aria-label', tx('この文だけをひらく', 'open this sentence on its own page'));
  door.addEventListener('click', (ev) => {
    ev.stopPropagation();
    go({
      t: 'sent',
      tokens: ex.tokens,
      en: ex.en || '',
      source: ex.source || '',
      passage: ex.passage || null,
      start: ex.start,
      target: target || null,
    });
  });
  return door;
}

function sentencePracticeError(error) {
  if (!recordWritable()) return tx('この窓は保存を停止した。未保存の回答をコピーし、再読み込みして続ける。',
    'This window stopped saving. Copy any unsaved response, then reload to continue.');
  if (error?.message === 'sentence-practice-capacity') return tx(
    'この版の保存上限に達した。文章と前の記録は残っている。', 'This version’s practice storage is full. Your text and earlier records are kept.');
  if (/reading-cue|kanji-reading/u.test(`${error?.code || ''} ${error?.message || ''}`)) return tx(
    'この文の読みを確認できなかった。保存した出典と前の練習記録は残っている。元の文を開いて確認する。',
    'The reading for this word could not be verified. Your saved source and earlier practice are kept. Open the original sentence to check it.');
  if (/listening-(cue|audio)/u.test(error?.message || '')) return tx(
    'この文の音声を確認できなかった。出典と回答は残っている。接続を確認して、もう一度試す。',
    'The recording for this sentence could not be verified. Your source and responses are kept. Check your connection and try again.');
  return tx('練習を保存できなかった。文章はここに残っている。もう一度試す。',
    'Practice could not be saved. Your text is kept here. Try again.');
}

function sentenceSource(tokens, passageId, startHint) {
  const p = D.passages.find((entry) => entry.id === passageId);
  if (!tokens?.length || !p?.tokens?.length) return null;
  const matches = (start) => start >= 0 && start + tokens.length <= p.tokens.length &&
    tokens.every((token, offset) => token.s === p.tokens[start + offset].s && token.b === p.tokens[start + offset].b);
  if (Number.isInteger(startHint)) return matches(startHint) ? { passage: passageId, index: startHint } : null;
  let found = -1;
  for (let start = 0; start <= p.tokens.length - tokens.length; start += 1) {
    if (!matches(start)) continue;
    if (found !== -1) return null;
    found = start;
  }
  return found === -1 ? null : { passage: passageId, index: found };
}

function _strokeOf(x) {
  const k = D.kanji[x];
  if (k && k.st) return k.st;
  const r = D.radicals[x];
  if (r && r.st) return r.st;
  return null;
}

function _componentsOf(q) {
  if (_compsCache.has(q)) return _compsCache.get(q);
  const out = new Set();
  const kv = D.kanji[q];
  if (kv && kv.parts) for (const p of kv.parts) if (p !== q) out.add(p);
  const r = D.radicals[q];
  if (r && r.kanji && r.kanji.length >= 2 && r.kanji.length <= 12) {
    const lists = r.kanji.filter((x) => D.kanji[x]).map((x) => new Set(D.kanji[x].parts));
    if (lists.length >= 2) {
      const [first, ...rest] = lists;
      const qInK = !!D.kanji[q];
      const sq = _strokeOf(q);
      for (const p of first) {
        if (p === q || !rest.every((s) => s.has(p))) continue;
        const sp = _strokeOf(p);
        if (qInK && D.kanji[p] && sp != null && sq != null && sp > sq) continue;
        out.add(p);
      }
    }
  }
  out.delete(q);
  _compsCache.set(q, out);
  return out;
}

function _allSub(q) {
  const seen = new Set();
  const stack = [..._componentsOf(q)];
  while (stack.length) {
    const x = stack.pop();
    if (x !== q && !seen.has(x)) {
      seen.add(x);
      for (const y of _componentsOf(x)) stack.push(y);
    }
  }
  return seen;
}

function mainParts(c) {
  const k = D.kanji[c];
  if (!k || !k.parts || !k.parts.length) return [];
  const listed = [...new Set(k.parts)];
  // a part named twice, as written and as its standalone form, is the written one (first, so neither is taken for a
  // piece of the other)
  const P = listed.filter((p) => p !== c && !listed.some((v) => v !== p && (PART_WRITTEN[v] || []).includes(p)));
  const subs = new Map(P.map((q) => [q, _allSub(q)]));
  const st = P.map((p) => PART_STROKES[p] ?? _strokeOf(p));
  // the parts that make the kanji exactly, stroke for stroke, none inside another: the fewest (its own level: 総 = 糸 +
  // 忩, not 糸 + 公 + 心; 党 = 尚 + 儿), and of those the ones the list names first
  if (k.st && P.length > 1 && P.length <= 12) {
    let best = null;
    for (let mask = 1; mask < 1 << P.length; mask += 1) {
      const order = P.map((_, i) => i).filter((i) => mask & (1 << i));
      if (order.length < 2 || (best && order.length > best.length)) continue;
      if (order.some((i) => !st[i]) || order.reduce((sum, i) => sum + st[i], 0) !== k.st) continue;
      if (order.some((i) => order.some((j) => j !== i && subs.get(P[j]).has(P[i])))) continue;
      if (!best || order.length < best.length || order.join() < best.join()) best = order;
    }
    if (best) return best.map((i) => P[i]).slice(0, 3);
  }
  // no exact cover in the data: the top level by the lists alone, and the stroke budget (a part before its own parts:
  // one that would take the parts shown past the kanji's strokes is a piece of one already shown)
  let keep = P.filter((p) => !P.some((q) => q !== p && subs.get(q).has(p)));
  if (keep.length > 1) keep = keep.filter((p) => !GLUE_STROKE.has(p));
  if (k.st) {
    let strokes = 0;
    keep = keep.filter((p) => {
      if (strokes >= k.st) return false;
      const n = PART_STROKES[p] ?? _strokeOf(p);
      if (!n) return true;
      if (strokes + n > k.st) return false;
      strokes += n;
      return true;
    });
  }
  return keep.slice(0, 3);
}

function componentLabel(c) {
  const r = D.radicals[c];
  if (r?.name) return r.name;
  const n = r?.kanjiCount;
  if (n) return tx(`部品 — ${n} 字に使われる`, `component — used in ${n} kanji`);
  return tx('部品 — 漢検の部首表に名前がない', 'component — no name in the Kanji Kentei radical table');
}

function renderKanjiClassifications(sheet, id, node = {}) {
  const facts = kanjiFacts(id);
  if (!facts) return;
  const number = facts.radicalSchemes.classical;
  const rad = D.radInfo?.[number];
  const heading = el('h3', 'list-head', tx('辞書の部首分類', 'Dictionary classification'));
  sheet.append(heading);
  const door = el('button', 'rad-door');
  door.type = 'button';
  door.dataset.classicalRadical = String(number);
  door.append(el('span', 'rad-glyph', rad?.c || String(number)));
  const text = el('span', 'rad-text');
  text.append(el('span', 'rad-name', tx(`伝統部首 ${number}`, `Classical radical ${number}`)));
  text.append(el('span', 'rad-sub', `KANJIDIC2${rad?.name ? ` · ${rad.name}` : ''}`));
  door.append(text, el('span', 'row-go', '›'));
  door.addEventListener('click', () => go({
    t: 'catalog', id: `classical-radical:${number}`, by: 'classical-radical', value: number, from: node.from,
  }, { invoker: door }));
  sheet.append(door);
  const nelson = facts.radicalSchemes.nelson;
  if (nelson != null) {
    const label = D.radInfo?.[nelson]?.c || '';
    const line = el('p', 'fine', tx(`Nelson 部首 ${nelson} ${label} — KANJIDIC2`, `Nelson radical ${nelson} ${label} — KANJIDIC2`));
    line.dataset.nelsonRadical = String(nelson);
    sheet.append(line);
  }
}

function kanjiFamilyLiveVisit() {
  const visit = S.kanjiCourse;
  return visit?.unitId === 'shiki-shoku' && recordReady(visit.epoch) ? visit : null;
}

function kanjiFamilyHelpRow(row, at) {
  const about = row.about.type === 'word'
    ? { kind: 'word', term: row.about.id, reading: row.about.reading }
    : { kind: 'kanji', literal: row.about.id };
  return { what: row.what, about, reveals: [...row.reveals], at };
}

async function kanjiFamilyAuthorize(exposures, ticket) {
  if (!kanjiFamilyTicketCurrent(ticket)) return false;
  const visit = kanjiFamilyLiveVisit();
  if (!visit) return true;
  const at = Date.now();
  const outcome = await kanjiCourseRememberHelp(visit, exposures.map((row) => kanjiFamilyHelpRow(row, at)));
  if (!kanjiFamilyTicketCurrent(ticket) || !['kept', 'held'].includes(outcome?.status)) return false;
  kanjiCourseApplyHelp(visit);
  ticket.run = visit.run; // only this accepted projection may advance the captured run
  return true;
}

function kanjiFamilyHasExampleOrigin() {
  return S.stack.some((node) => !!kanjiFamilyResolveExample(node));
}

function activateKanjiFamily(sheet) {
  for (const section of sheet.querySelectorAll('[data-kanji-family-surface]')) kanjiFamilyMounts.get(section)?.();
}

function kanjiFamilyControlId(reference, suffix) {
  return `family-${encodeURIComponent(JSON.stringify(reference))}-${suffix}`;
}

function kanjiFamilyStatus(invoker, ja, en) {
  if (!invoker?.isConnected) return;
  let status = invoker.parentElement.querySelector('[data-family-status]');
  if (!status) {
    status = el('p', 'fine'); status.dataset.familyStatus = ''; status.setAttribute('role', 'status');
    invoker.after(status);
  }
  status.textContent = tx(ja, en);
}

function kanjiFamilyRefusal(invoker) {
  kanjiFamilyStatus(invoker, 'ヘルプの記録を確認できなかったため、内容はまだ表示していません。',
    'The help record could not be confirmed, so this content has not been shown.');
}

function kanjiFamilyCourseExpectation(reference) {
  const targets = window.BunkiKanjiCourse?.getUnit('shiki-shoku').targets || [];
  const target = targets.find((value) => value.teachingSentence?.reference?.id === reference.id && value.readings.length === 1);
  if (!target) return undefined;
  const sentence = target.teachingSentence;
  return { word: { type: 'word', id: target.wordKey, reading: target.readings[0] },
    sentence: sentence.text, english: sentence.english, sourceAttribution: sentence.sourceAttribution,
    ...(sentence.register ? { register: sentence.register } : {}) };
}

function renderKanjiFamilyDisclosure(section, node, exposures, renderFacts) {
  let state = kanjiFamilyViews.get(node);
  if (!state) { state = { stamp: null, busy: false }; kanjiFamilyViews.set(node, state); }
  const live = kanjiFamilyLiveVisit();
  if (!live) state.stamp = kanjiFamilyStamp();
  const panel = el('div', 'entry-rows');
  panel.id = kanjiFamilyControlId({ type: node.t, id: node.id }, 'facts');
  panel.hidden = !kanjiFamilyStampCurrent(state.stamp);
  kanjiFamilyExposures.set(section, { state, panel });
  if (!panel.hidden) renderFacts(panel);
  if (live) {
    const reveal = biLabel('button', 'chip', '出典と説明', 'Source and account');
    reveal.type = 'button'; reveal.id = kanjiFamilyControlId({ type: node.t, id: node.id }, 'disclose');
    reveal.setAttribute('aria-controls', panel.id); reveal.setAttribute('aria-expanded', String(!panel.hidden));
    state.control = reveal;
    reveal.disabled = !!state.busy;
    const explanation = el('p', 'fine', tx('開くと、ここにある読みや意味を、このコースで使ったヘルプとして扱います。',
      'Opening this counts the readings and meanings shown here as help for this course.'));
    reveal.addEventListener('click', async () => {
      if (state.busy) return;
      if (!panel.hidden) {
        state.stamp = null; panel.hidden = true; panel.replaceChildren(); reveal.setAttribute('aria-expanded', 'false');
        return;
      }
      const ticket = kanjiFamilyTicket(reveal);
      state.busy = ticket; reveal.disabled = true;
      try {
        const allowed = await kanjiFamilyAuthorize(exposures, ticket);
        if (!kanjiFamilyTicketCurrent(ticket)) return;
        if (!allowed) { kanjiFamilyRefusal(reveal); return; }
        state.stamp = kanjiFamilyStamp();
        panel.replaceChildren(); renderFacts(panel); panel.hidden = false; reveal.setAttribute('aria-expanded', 'true');
      } finally {
        if (state.busy === ticket) { state.busy = false; if (state.control?.isConnected) state.control.disabled = false; }
      }
    });
    section.append(reveal, explanation);
  }
  section.append(panel);
}

function kanjiFamilyCitations(parent, citations) {
  for (const citation of citations) {
    const source = citation.source;
    const label = `${source.title || source.id} · ${citation.locator}`;
    const line = el(/^https:\/\//u.test(source.url || '') ? 'a' : 'p', 'fine', label);
    if (line.tagName === 'A') { line.href = source.url; line.target = '_blank'; line.rel = 'noopener noreferrer'; }
    parent.append(line);
  }
}

function activateKanjiStructure(sheet) {
  for (const section of sheet.querySelectorAll('[data-kanji-structure]')) kanjiStructureMounts.get(section)?.();
}

function renderKanjiNode(sheet, node) {
  const retained = retainedKanjiRecord(node.id);
  const k = retained || D.kanji[node.id] || window.BunkiSkipUI?.getKanji(S.skipUi, node.id);
  if (!k) {
    // A wider SKIP entry can survive in the learner's existing list across
    // reloads. Reopen through this same sheet after lazy metadata resolves,
    // not a dead-end just because the optional index has not been used yet.
    if (window.BunkiSkipUI && !skipState().data) {
      const pending = el('div', 'skip-entry-pending');
      sheet.append(pending);
      const load = () => {
        pending.replaceChildren(el('p', 'skip-status', tx('漢字の項目を読み込み中…', 'Loading this kanji entry…')));
        window.BunkiSkipUI.ensureData(skipState()).then(() => {
          if (!pending.isConnected) return;
          pending.replaceChildren();
          renderKanjiNode(pending, node);
        }).catch(() => {
          if (!pending.isConnected) return;
          const retry = el('button', 'skip-retry', tx('漢字の項目を再読込', 'Retry this kanji entry'));
          retry.type = 'button';
          retry.addEventListener('click', load);
          pending.replaceChildren(el('p', 'skip-error', tx('項目を読み込めませんでした。', 'This entry could not load.')), retry);
        });
      };
      load();
      return;
    }
    sheet.append(el('div', 'sem-empty', tx('この字はこの層にない。', 'This kanji is not in this layer.')));
    return;
  }
  const hero = el('div', 'hero');
  hero.append(el('div', 'hero-glyph', k.c));
  const meta = el('div', 'hero-meta');
  const display = kanjiEntryRecord(node.id, node.referenceEntry) || k;
  const referenceView = kanjiReferenceView(node.id, display);
  meta.append(el('div', 'hero-mean', referenceView.meanings.join('; ') || tx('語義は未収録です。', 'Meaning not supplied.')));
  const chips = el('div', 'shelf-meta');
  if (Number.isInteger(k.st)) chips.append(catalogChip(`${k.st} 画`, `${k.st} strokes`, 'strokes', k.st, node.from));
  if (D.kanken[k.c]?.kk)
    chips.append(catalogChip(`漢検 ${D.kanken[k.c].kk}`, `Kanji Kentei ${kankenGradeLabel(D.kanken[k.c].kk)}`, 'kanken', D.kanken[k.c].kk, node.from));
  if (D.kmeta?.[k.c]?.jlpt)
    chips.append(catalogChip(`JLPT ${D.kmeta[k.c].jlpt}`, `JLPT ${D.kmeta[k.c].jlpt}`, 'jlpt', D.kmeta[k.c].jlpt, node.from));
  // the entry number in the operator's paper dictionary (Kodansha KKLD),
  // named by edition — the book on the desk and the sheet on the screen agree
  if (kkldOf(k.c)) {
    const kchip = el('span', 'pool-tag kkld-chip', `Kodansha ${kkldLine(k.c)}`);
    kchip.id = 'kanji-kkld';
    kchip.title = tx('講談社 漢字学習字典の番号（版ごと）', "Kodansha Kanji Learner's Dictionary entry number, by edition");
    chips.append(kchip);
  }
  if (window.BunkiSkipUI) {
    const shapeDoor = el('button', 'chip', tx('形と画数で引く', 'look up by shape and strokes'));
    shapeDoor.id = 'kanji-shape-lookup'; shapeDoor.type = 'button';
    shapeDoor.addEventListener('click', () => go({ t: 'skip', id: 'skip:*', from: node.from }, { invoker: shapeDoor }));
    chips.append(shapeDoor);
  }
  meta.append(chips);
  hero.append(meta);
  sheet.append(hero);
  // everything-on prototype (inventory block 26): the door also stands on five kanji that hold 門, and says whose scene it is
  const world = kanjiWorldEligible(node.id);
  if (world) {
    const worldDoor = el('button', 'chip kanji-world-door', world === node.id ? tx('羅城門へ · 試作', 'Visit Rajōmon · preview')
      : tx(`羅城門へ · 「${node.id}」の中の「${world}」 · 試作`, `Visit Rajōmon, the ${world} inside ${node.id} · preview`));
    worldDoor.id = 'kanji-world-door'; worldDoor.type = 'button';
    worldDoor.addEventListener('click', () => openKanjiWorldEncounter(worldDoor, node));
    sheet.append(worldDoor);
  }
  if (referenceView.state === 'complete') {
    const source = el('p', 'fine', tx(
      `辞書の全語義 — KANJIDIC2 ${referenceView.referenceSource.dictionaryDate}`,
      `Complete dictionary meanings — KANJIDIC2 ${referenceView.referenceSource.dictionaryDate}`,
    ));
    source.dataset.kanjiMeaningsSource = referenceView.referenceSource.release;
    sheet.append(source);
  } else {
    sheet.append(el('p', 'fine', tx('上の語義は保存済み・レッスン用の語義です。', 'The meanings above are the saved or lesson keywords.')));
    if (referenceView.state === 'absent') sheet.append(el('p', 'fine', tx('この字の辞書語義・部首分類は資料にありません。', 'This source does not supply dictionary meanings or classification for this form.')));
    kanjiFactsStatus(sheet, referenceView.state, 'kanji-facts-retry', () => { if (sheet.isConnected) render(); });
  }
  if (retained) {
    sheet.append(el('p', 'fine', tx(
      `保存した回答・以下の読みは KANJIDIC2 ${retained.sourceVersion.dictionaryDate} のままです。辞書を開いても書き換わりません。`,
      `Your saved answer and the readings below remain from KANJIDIC2 ${retained.sourceVersion.dictionaryDate}. Opening this dictionary does not rewrite them.`,
    )));
  }
  // K01 · an official Jōyō form kanji.json lacks (剝, 𠮟) says what it is; any other wider entry keeps its SKIP note
  const joyoForm = !D.kanji[k.c] && !!kanjiReferenceRows()?.records.has(k.c);
  if (k.skipFallback) sheet.append(el('p', 'skip-fallback-note', joyoForm
    ? tx('常用漢字表（2010年）の字形。読みと意味は KANJIDIC2 から。このアプリにはこの字の部品のデータがまだない。',
      'An official Jōyō form (2010). Its readings and meanings come from KANJIDIC2; this app has no component data for it yet.')
    : tx(
      'SKIP 索引の KANJIDIC2 項目。このアプリの部品・用例・筆順が未収録のことがあります。',
      'KANJIDIC2 entry from the SKIP index. This app may not yet have its components, example words or stroke diagram.',
    )));

  // K01 · every reading of the kanji (kanjiReference): the lessons' selection first, then the rest. A reading
  // only the official 2010 table gives is starred and named under the list. Until every reading has arrived the
  // list is the lessons' selection and says so; a failed load offers its retry.
  const kv = el('dl', 'kv');
  const readingsState = display.readingsState || (retained ? 'saved' : 'complete');
  kv.dataset.kanjiReadings = readingsState;
  if (retained) kv.dataset.currentJoyoKunState = kanjiReadingsState();
  const officialOnly = new Set(display.officialReadings || []);
  const readingLine = (list) => {
    const span = el('span', 'on');
    if (!list?.length) span.textContent = '—';
    // each reading stays whole on its line, its ・ kept with it, so a long list breaks only after a ・ (never
    // inside い.ける, never before a ・)
    (list || []).forEach((reading, i) => {
      const item = el('span', 'reading-item', reading);
      if (officialOnly.has(reading)) item.append(el('sup', 'reading-official-mark', '*'));
      if (i < list.length - 1) item.append(document.createTextNode('・'));
      span.append(item);
    });
    return span;
  };
  const on = el('dd');
  on.append(readingLine(display.on));
  kv.append(withEn(el('dt', null, '音'), 'on'), on);
  const kun = el('dd');
  kun.append(readingLine(display.kun));
  kv.append(withEn(el('dt', null, '訓'), 'kun'), kun);
  sheet.append(kv);
  const currentKun = currentJoyoKunNote(node.id);
  if (currentKun) sheet.append(currentKun);
  const tableStatus = joyoOnNote(node.id, display.on);
  if (tableStatus) sheet.append(tableStatus);
  if (officialOnly.size) {
    const official = el('p', 'fine reading-source-note', tx('* 常用漢字表（2010年）にある読み', '* a reading from the official Jōyō kanji table (2010)'));
    official.id = 'kanji-reading-official';
    sheet.append(official);
  }
  if (readingsState === 'pending' || readingsState === 'failed') {
    const line = el('p', 'fine reading-source-note', readingsState === 'failed'
      ? tx('すべての読みを読み込めなかった。いま見えているのはレッスン用に選んだ読みだけ。', 'Every reading could not be loaded — these are only the readings chosen for lessons.')
      : tx('いま見えているのはレッスン用に選んだ読み。すべての読みを読み込み中…', 'These are the readings chosen for lessons — loading every reading…'));
    line.id = 'kanji-readings-status';
    line.setAttribute('role', 'status');
    sheet.append(line);
    if (readingsState === 'failed') {
      const retry = biLabel('button', 'chip', '再試行', 'Try again');
      retry.type = 'button';
      retry.id = 'kanji-readings-retry';
      retry.addEventListener('click', () => {
        void loadReferenceExtra();
        render();
      });
      sheet.append(retry);
    }
  }
  renderSourceKanjiDoor(sheet, node);
  renderKanjiCourseDoor(sheet, node);

  renderKanjiClassifications(sheet, node.id, node);

  // まぎらわしい字 — the look-alikes, laid side by side to break the spell
  const twins = confusablesFor(k.c);
  if (twins.length) {
    sheet.append(withEn(el('p', 'eyebrow', 'まぎらわしい字'), 'easily confused with', 'en-inline'));
    const rows = el('div', 'entry-rows');
    for (const c of twins) {
      const row = el('button', 'entry-row');
      row.type = 'button';
      row.dataset.confusable = c;
      row.append(el('span', 'row-glyph', c));
      row.append(el('span', 'row-main', D.kanji[c].m));
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go({ t: 'kanji', id: c, from: node.from }, { invoker: row }));
      rows.append(row);
    }
    sheet.append(rows);
  }

  // STROKE ORDER — the diagram is a door, not a picture. It opens the
  // dedicated full-screen page where the strokes actually draw themselves.
  sheet.append(withEn(el('p', 'eyebrow', '筆順'), 'stroke order', 'en-inline'));
  sheet.append(strokeDoor(k));
  renderKanjiStructure(sheet, node);
  renderKanjiFamily(sheet, node);

  const parts = mainParts(k.c);
  if (parts.length) {
    sheet.append(withEn(el('p', 'eyebrow', '部品一覧'), 'listed components', 'en-inline'));
    const rows = el('div', 'entry-rows');
    for (const c of parts) {
      const row = el('button', 'entry-row');
      row.type = 'button';
      row.append(el('span', 'row-glyph', c));
      row.dataset.component = c;
      row.append(el('span', 'row-main', componentLabel(c)));
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go({ t: 'radical', id: c, from: node.from }, { invoker: row }));
      rows.append(row);
    }
    sheet.append(rows);
  }

  // COMMON COMPOUNDS — reading + first gloss per row, every row a door.
  // No silent cap: an initial page, then "show all" reveals the whole list
  // (Renzo shows "6 of 96" the same way). The count in the heading is the true
  // total, so the depth of the dictionary is visible at a glance.
  // K07 · then the words reached through a written alternative (しいたけ／椎茸, あい／藍), shown by the spelling
  // that holds this kanji and opening that very entry; a Jōyō kanji no shipped word list names carries up to ten
  // JMdict words chosen at build time (the reference sidecar), each opening its own entry by sequence and reading.
  const words = D.kanjiWords[k.c] || [];
  const listed = new Set(words);
  const alternates = (D.kanjiAltWords?.get(k.c) || []).filter(([id]) => !listed.has(id));
  const filled = !words.length && !alternates.length ? kanjiReferenceRows()?.words.get(k.c) || [] : [];
  const items = [
    ...words.map((id) => ({ id })),
    ...alternates.map(([id, form]) => ({ id, form })),
    ...filled.map(([seq, form, reading, gloss, tags]) => ({ id: form, form, seq: String(seq), reading, gloss, tags })),
  ];
  if (items.length) {
    sheet.append(filled.length
      ? withEn(el('p', 'eyebrow', `この字を含む語 — ${items.length} 語`), 'words that contain it', 'en-inline')
      : withEn(el('p', 'eyebrow', `よく使う語 — ${items.length} 語`), 'common compounds', 'en-inline'));
    const rows = el('div', 'entry-rows');
    const makeRow = (item) => {
      const g = item.seq ? { r: item.reading, m: [item.gloss] } : lookup(item.id);
      const row = el('button', 'entry-row compound');
      row.type = 'button';
      if (item.form) row.dataset.wordSpelling = item.form;
      if (item.seq) row.dataset.jmdictSeq = item.seq;
      const main = el('span', 'row-stack');
      const top = el('span', 'row-word');
      top.append(document.createTextNode(item.form || item.id));
      if (g?.r) top.append(el('span', 'row-reading', g.r));
      main.append(top);
      const gloss = [g?.m?.[0], writtenFormNote(item.tags)].filter(Boolean).join(' — ');
      if (gloss) main.append(el('span', 'row-gloss', gloss));
      row.append(main);
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go(item.seq
        ? { t: 'word', id: item.form, seq: item.seq, reading: item.reading, from: node.from }
        : { t: 'word', id: item.id, from: node.from }, { invoker: row }));
      return row;
    };
    const FIRST = 24;
    for (const item of (node.compoundsExpanded ? items : items.slice(0, FIRST))) rows.append(makeRow(item));
    sheet.append(rows);
    if (items.length > FIRST && !node.compoundsExpanded) {
      const more = el('button', 'more-row');
      more.type = 'button';
      const remain = items.length - FIRST;
      more.textContent = tx(`のこり ${remain} 語をすべて見る`, `show all ${items.length} — ${remain} more`);
      more.addEventListener('click', () => {
        node.compoundsExpanded = true;
        for (const item of items.slice(FIRST)) rows.append(makeRow(item));
        more.remove();
      });
      sheet.append(more);
    }
  } else {
    sheet.append(withEn(el('p', 'eyebrow', 'この字を含む語'), 'words that contain it', 'en-inline'));
    // K07 · a Jōyō kanji the build found in no shipped dictionary says so plainly
    const none = kanjiReferenceRows()?.wordless.has(k.c);
    const empty = el('div', 'sem-empty', none
      ? tx('この字を含む語は、このアプリの辞書にはない。', 'No word in this app’s dictionaries contains this kanji.')
      : tx('この字を含む語は辞書側にまだない。部品からは続けられる。', 'No listed word contains this kanji yet — the walk continues through its parts.'));
    if (none) empty.dataset.wordless = 'checked';
    sheet.append(empty);
  }

  // K05 · as many idioms as the heading counts are one tap away
  const idioms = D.idiomsByKanji[k.c] || [];
  if (idioms.length) {
    const heading = el('p', 'eyebrow');
    heading.textContent = tx(`熟語・慣用句 — ${idioms.length}`, `${idioms.length} idioms and set phrases`);
    sheet.append(heading);
    const FIRST_IDIOMS = 24;
    const chipOf = (w) => ({ label: w, sub: D.idioms[w]?.r || '' });
    const openIdiom = (item, invoker) => go({ t: 'idiom', id: item.label, from: node.from }, { invoker });
    const chips = chipsFor((node.idiomsExpanded ? idioms : idioms.slice(0, FIRST_IDIOMS)).map(chipOf), openIdiom, null, 'idiom');
    sheet.append(chips);
    if (idioms.length > FIRST_IDIOMS && !node.idiomsExpanded) {
      const more = el('button', 'more-row');
      more.type = 'button';
      more.id = 'kanji-idioms-more';
      const remain = idioms.length - FIRST_IDIOMS;
      more.textContent = tx(`のこり ${remain} 語をすべて見る`, `show all ${idioms.length} — ${remain} more`);
      more.addEventListener('click', () => {
        node.idiomsExpanded = true;
        chips.append(...chipsFor(idioms.slice(FIRST_IDIOMS).map(chipOf), openIdiom, null, 'idiom').children);
        more.remove();
      });
      sheet.append(more);
    }
  }


  renderStudyFold(sheet, node, null);
}

function strokeStart(d) {
  const m = /M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(d);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

function strokeThumb(paths) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', STROKE_VIEWBOX);
  svg.setAttribute('class', 'strokes');
  svg.setAttribute('aria-hidden', 'true');
  svg.id = 'strokes';
  // just the painted character — no stroke-numbers on the preview (operator
  // 2026-08-10: "no writing next to the stroke-order kanji; tap to open"). The
  // numbers still guide inside the full-screen 筆順 page.
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function strokeDoor(k) {
  const paths = strokePathsFor(k.c);
  const door = el('button', paths.length ? 'stroke-door' : 'stroke-door bare');
  door.type = 'button';
  door.id = 'strokes-door';
  door.dataset.action = 'entry.open';
  door.dataset.strokes = String(paths.length);
  door.setAttribute(
    'aria-label',
    paths.length
      ? tx(
          `${k.c} の筆順をひらく — ${paths.length} 画`,
          `open the stroke order for ${k.c} — ${paths.length} strokes`,
        )
      : tx(
          `${k.c} の筆順 — 筆順のデータはまだない`,
          `${k.c} stroke order — stroke data not yet available`,
        ),
  );
  // just the stroke-order glyph — tap the box and it opens (operator 2026-08-10:
  // "no writing next to the stroke-order kanji"). No side label, no chevron.
  if (paths.length) door.append(strokeThumb(paths));
  else door.append(el('span', 'stroke-door-glyph', k.c));

  door.addEventListener('click', (event) => {
    interaction(
      { kind: 'entry.open', target: { kind: 'kanji', id: k.c } },
      event.detail === 0 ? 'keyboard' : 'pointer',
      'strokes-door',
    );
    openStrokePage(k.c, { invoker: door });
  });
  return door;
}

function paintStrokes(page, shown, progress = 1) {
  const paths = [...page.querySelectorAll('.stroke-ink path')];
  const bleeds = [...page.querySelectorAll('.stroke-bleed path')];
  const total = paths.length;
  paths.forEach((path, i) => {
    const len = Number(path.dataset.len) || 0;
    let offset = len;
    if (i < shown - 1) offset = 0;
    else if (i === shown - 1) offset = len * (1 - progress);
    path.style.strokeDashoffset = String(offset);
    if (bleeds[i]) bleeds[i].style.strokeDashoffset = String(offset);
  });
  // Once living ink owns the stage, its first-splat callback owns the number
  // clock too. The hidden SVG rAF must never race ahead of the real brush.
  if (page.dataset.living !== 'on') {
    // At progress zero the pending SVG stroke is still fully dash-hidden.
    // Keep its number hidden for that frame too; both become visible on the
    // first positive drawing sample, matching the living-ink first-splat law.
    syncStrokeNumbers(page, progress > 0 ? shown : shown - 1);
  }
  const counter = page.querySelector('#stroke-count');
  if (counter) {
    const current = Math.max(0, Math.min(total, shown));
    counter.dataset.current = String(current);
    counter.dataset.total = String(total);
    counter.textContent = `${current} / ${total}`;
  }
  const prev = page.querySelector('#stroke-prev');
  const next = page.querySelector('#stroke-next');
  if (prev) prev.disabled = shown <= 1;
  if (next) next.disabled = shown >= total;
}

function strokeControl(id, ja, en) {
  const btn = el('button', 'stroke-btn');
  btn.type = 'button';
  btn.id = id;
  btn.append(el('span', 'l-ja', tx(ja, en)));
  if (!bi()) btn.setAttribute('aria-label', ja);
  return btn;
}

function strokeReadingRow(ja, en, values, kind = 'on', official = []) {
  const row = el('div', 'stroke-reading-row');
  const label = el('span', 'stroke-reading-label', tx(ja, en));
  const raw = values?.length ? values : [];
  // K01 · a reading only the official 2010 table gives carries the same star as on the kanji page; each reading
  // stays whole on its line, so a complete list breaks only between readings
  const value = el('span', 'stroke-reading-value');
  if (!raw.length) value.textContent = '—';
  raw.forEach((item, i) => {
    value.append(el('span', 'stroke-reading-item',
      (kind === 'kun' ? displayKunReading(item) : item) + (official.includes(item) ? '*' : '') + (i < raw.length - 1 ? '・' : '')));
  });
  value.lang = 'ja';
  if (kind === 'kun' && raw.length) {
    value.setAttribute('aria-label', raw.map((item) => item.replaceAll('.', '')).join('、'));
  }
  row.append(label, value);
  return row;
}

function strokeAwakeField(page, k) {
  // 四隅の間 (operator spec, 2026-08-15): the corners carry the controls —
  // worlds top-right on the seal, numbers bottom-right, speed bottom-left,
  // back top-left. The wake mark opens ONLY the readings, underneath the
  // glyph, so nothing crowds the sheet.
  const field = el('section', 'stroke-awake-field');
  field.id = 'stroke-awake-field';
  field.dataset.strokeChrome = '';
  field.setAttribute('aria-label', tx('読み', 'readings'));
  field.append(strokeReadingField(k));
  return field;
}

function strokeReadingField(k) {
  const readings = el('div', 'stroke-reading-field');
  readings.setAttribute('role', 'group');
  readings.setAttribute('aria-label', tx('読み', 'readings'));
  // what the lists are (unfinished, or carrying a starred reading) is said above them: below, the writing-speed
  // corner covers the field's left edge
  readings.append(...strokeReadingsStatus(k));
  if (k?.sourceVersion) {
    const saved = !!retainedKanjiRecord(k.c);
    readings.append(el('p', 'stroke-reading-note', saved ? tx(
      `保存した読み — KANJIDIC2 ${k.sourceVersion.dictionaryDate}`,
      `Saved readings — KANJIDIC2 ${k.sourceVersion.dictionaryDate}`,
    ) : tx(
      `辞書の読み — KANJIDIC2 ${k.sourceVersion.dictionaryDate}`,
      `Dictionary readings — KANJIDIC2 ${k.sourceVersion.dictionaryDate}`,
    )));
  }
  if (k?.officialReadings?.length) {
    readings.append(el('p', 'stroke-reading-note', tx('* 常用漢字表（2010年）にある読み', '* a reading from the official Jōyō kanji table (2010)')));
  }
  readings.append(
    strokeReadingRow('音読み', 'on', k?.on, 'on', k?.officialReadings),
    strokeReadingRow('訓読み', 'kun', k?.kun, 'kun', k?.officialReadings),
  );
  const tableStatus = joyoOnNote(k?.c, k?.on, 'p', 'stroke-reading-note');
  if (tableStatus) readings.append(tableStatus);
  const currentKun = currentJoyoKunNote(k?.c, 'p', 'stroke-reading-note');
  if (currentKun) readings.append(currentKun);
  return readings;
}

function strokeClassificationLine(id, k) {
  const radical = kanjiFacts(id)?.radicalSchemes.classical;
  const glyph = D.radInfo?.[radical]?.c;
  return `${k?.st ?? strokePathsFor(id).length}画${glyph
    ? tx(` · 伝統部首 ${glyph}（KANJIDIC2）`, ` · classical radical ${glyph} (KANJIDIC2)`) : ''}`;
}

function strokeReferenceStatus(id, k) {
  const note = el('div', 'stroke-reference-status');
  const view = kanjiReferenceView(id, k);
  if (view.state === 'complete') note.append(el('p', 'stroke-read-note', tx(
    `意味・部首分類 — KANJIDIC2 ${view.referenceSource.dictionaryDate}`,
    `Meanings and classification — KANJIDIC2 ${view.referenceSource.dictionaryDate}`,
  )));
  else {
    note.append(el('p', 'stroke-read-note', tx('語義は保存済み・レッスン用のものです。', 'Meanings shown are saved or lesson keywords.')));
    if (view.state === 'absent') note.append(el('p', 'stroke-read-note', tx('この資料には辞書語義・部首分類がありません。', 'This source supplies no dictionary meanings or classification for this form.')));
    kanjiFactsStatus(note, view.state, 'stroke-facts-retry', refreshStrokeReadings);
  }
  if (k?.sourceVersion) {
    const saved = !!retainedKanjiRecord(id);
    note.append(el('p', 'stroke-read-note', saved ? tx(
      `読み・保存した回答 — KANJIDIC2 ${k.sourceVersion.dictionaryDate}`,
      `Readings and saved answer — KANJIDIC2 ${k.sourceVersion.dictionaryDate}`,
    ) : tx(
      `辞書の読み — KANJIDIC2 ${k.sourceVersion.dictionaryDate}`,
      `Dictionary readings — KANJIDIC2 ${k.sourceVersion.dictionaryDate}`,
    )));
  }
  return note;
}

function strokeClassicReadings(k) {
  const readings = el('span', 'stroke-readings');
  const officialOnly = new Set(k?.officialReadings || []);
  const star = (reading) => (officialOnly.has(reading) ? '*' : '');
  if (k?.on?.length) {
    const row = el('span', 'stroke-read-row');
    row.append(el('span', 'stroke-read-label', '音'), el('span', 'stroke-on', k.on.map((reading) => reading + star(reading)).join('・')));
    readings.append(row);
  }
  if (k?.kun?.length) {
    const row = el('span', 'stroke-read-row');
    row.append(el('span', 'stroke-read-label', '訓'));
    k.kun.forEach((kn, i) => {
      const [stem, oku] = kn.split('.');
      if (i) row.append(document.createTextNode('・'));
      const reading = el('span', 'stroke-kun');
      reading.append(el('span', 'stroke-kun-stem', stem));
      if (oku) reading.append(document.createTextNode(oku));
      if (star(kn)) reading.append(document.createTextNode(star(kn)));
      row.append(reading);
    });
    readings.append(row);
  }
  if (officialOnly.size) readings.append(el('span', 'stroke-read-note', tx('* 常用漢字表（2010年）にある読み', '* a reading from the official Jōyō kanji table (2010)')));
  readings.append(...strokeReadingsStatus(k, 'span', 'stroke-read-note'));
  const tableStatus = joyoOnNote(k?.c, k?.on, 'span', 'stroke-read-note');
  if (tableStatus) readings.append(tableStatus);
  const currentKun = currentJoyoKunNote(k?.c, 'span', 'stroke-read-note');
  if (currentKun) readings.append(currentKun);
  return readings;
}

function strokeReadingsStatus(k, tag = 'p', className = 'stroke-reading-note') {
  const state = k?.readingsState;
  if (state !== 'pending' && state !== 'failed') return [];
  const line = el(tag, className, state === 'failed'
    ? tx('すべての読みを読み込めなかった。いま見えているのはレッスン用に選んだ読みだけ。', 'Every reading could not be loaded — these are only the readings chosen for lessons.')
    : tx('いま見えているのはレッスン用に選んだ読み。すべての読みを読み込み中…', 'These are the readings chosen for lessons — loading every reading…'));
  line.id = 'stroke-readings-status';
  line.dataset.strokeReadings = state;
  line.setAttribute('role', 'status');
  if (state !== 'failed') return [line];
  const retry = biLabel('button', 'chip stroke-readings-retry', '再試行', 'Try again');
  retry.type = 'button';
  retry.id = 'stroke-readings-retry';
  retry.addEventListener('click', () => {
    void loadReferenceExtra();
    refreshStrokeReadings();
  });
  return [line, retry];
}

function strokeMissing(page, id, k) {
  const box = el('div', 'stroke-missing');
  box.append(el('div', 'stroke-missing-glyph', id));
  const line = el('p', 'stroke-missing-line');
  line.id = 'stroke-missing';
  line.textContent = tx('筆順のデータはまだない。', 'Stroke data not yet available.');
  box.append(line);
  const note = el('p', 'stroke-missing-note');
  note.textContent = k?.st
    ? tx(
        `画数 — ${k.st} 画。このアプリにはこの字の筆順データが未収録です。`,
        `Stroke count — ${k.st}. This app does not bundle stroke paths for this character.`,
      )
    : tx(
        'このアプリにはこの字の筆順データが未収録です。',
        'This app does not bundle stroke paths for this character.',
      );
  box.append(note);
  box.append(el('p', 'stroke-meta-mean', kanjiReferenceView(id, k).meanings.join('; ')));
  box.append(strokeClassicReadings(k), strokeReferenceStatus(id, k));
  page.append(box);
}

async function animcjkGlyphFor(ch) {
  try {
    const approved = await animcjkApproved();
    if (!approved.has(ch)) return null;
    const sid = (ch.codePointAt(0) % 16).toString(16).padStart(2, '0');
    if (!animcjkShards.has(sid)) {
      animcjkShards.set(
        sid,
        fetch(`data/share_alike/animcjk/${sid}.json`).then((r) => (r.ok ? r.json() : null)),
      );
    }
    const shard = await animcjkShards.get(sid);
    return (shard && shard.entries && shard.entries[ch]) || null;
  } catch {
    return null;
  }
}

function inkSpecFor(INK, strokes) {
  const world = THEME_UI[themeIx()];
  const iw = INK_WORLDS[world.id] || INK_WORLDS.sumi;
  return {
    pal: iw.pal,
    wetScale: iw.wetScale,
    strokes,
    still: iw.still || world.ink,
    ground: (r, size) => inkGroundFor(world, size),
    gpuN: 1024,
    gl2Sim: 800,
  };
}

function inkStrokeMs(strokes, speed = strokeSpeed()) {
  if (!(strokes > 0)) return 0;
  return Math.max(INK_TEMPO.floor, Math.min(INK_TEMPO.ceiling, INK_TEMPO.budget / strokes)) * (STROKE_SPEED_DEFAULT / speed);
}

function inkCeremony(depth, deliberate, brush = wordBrush()) {
  const bare = depth === 'recalled' || depth === 'owned';
  const write = !!deliberate && !strokeReduced() &&
    (brush === 'always' || (brush === 'first' && (depth === 'unmet' || depth === 'met')));
  return { depth, bare, write };
}

function renderRadicalNode(sheet, node) {
  const r = D.radicals[node.id];
  if (!r) {
    sheet.append(el('div', 'sem-empty', tx('この部品はこの層にない。', 'This part is not in this layer.')));
    return;
  }
  // Is this component itself one of the 214 official radicals? If so, name it
  // as one — the operator's point: the radical system is real, not "up for
  // debate". If not, it is a shape-component and says so plainly.
  const official = D.radByGlyph?.[node.id];
  const posText =
    official && (official.pos === '独立' ? tx('独立', 'stands alone') : tx(official.pos, `${official.pos} · ${official.posEn}`));

  const hero = el('div', 'hero');
  hero.append(el('div', 'hero-glyph', r.c));
  const meta = el('div', 'hero-meta');
  meta.append(
    el(
      'div',
      'hero-mean',
      (official && official.name) || r.name || tx('（名称は漢検の部首表にない部品）', '(a part with no name in the Kanji Kentei radical table)'),
    ),
  );
  const chips = el('div', 'shelf-meta');
  if (official) {
    chips.append(el('span', 'pool-tag', tx(`部首 ${official.n}`, `radical ${official.n}`)));
    chips.append(el('span', 'pool-tag', posText));
  }
  if (r.st) chips.append(el('span', 'pool-tag', tx(`${r.st} 画`, `${r.st} strokes`)));
  chips.append(el('span', 'pool-tag', tx(`${r.kanjiCount} 字`, `${r.kanjiCount} kanji`)));
  meta.append(chips);
  hero.append(meta);
  sheet.append(hero);

  // RADK/KRAD membership is a shape grouping. A radical's canonical position
  // does not describe every member (火 also groups bottom 灬 and other forms).
  // Count this collection, not every kanji; the heading below reports the cap.
  const note = el('div', 'note');
  const count = r.kanjiCount || 0;
  note.textContent = tx(
    `この資料では、この形を部品に持つ字は全${count}字。`,
    `In this collection, this shape appears as a component in ${count} kanji.`,
  );
  sheet.append(note);

  if (r.isKanji && D.kanji[r.c]) {
    sheet.append(
      chipsFor(
        [{ label: r.c, sub: tx('字としても見る', 'view as a kanji') }],
        (item, invoker) => go({ t: 'kanji', id: item.label, from: node.from }, { invoker }),
        null,
        'kanji',
      ),
    );
  }

  sheet.append(
    withEn(
      el(
        'p',
        'eyebrow',
        r.kanjiCount > r.kanji.length
          ? `この部品を含む字 — ${r.kanjiCount} 字のうち ${r.kanji.length} 字`
          : `この部品を含む字 — ${r.kanjiCount} 字`,
      ),
      r.kanjiCount > r.kanji.length
        ? `kanji that contain this part — showing ${r.kanji.length} of ${r.kanjiCount}`
        : `kanji that contain this part — ${r.kanjiCount}`,
      'en-inline',
    ),
  );
  sheet.append(
    chipsFor(
      r.kanji.map((c) => ({ label: c, sub: D.kanken[c]?.kk ? tx(D.kanken[c].kk, kankenGradeLabel(D.kanken[c].kk)) : '' })),
      (item, invoker) => go({ t: 'kanji', id: item.label, from: node.from }, { invoker }),
      null,
      'kanji',
    ),
  );


  renderStudyFold(sheet, node, null);
}

function renderIdiomNode(sheet, node) {
  const idiom = D.idioms[node.id];
  if (!idiom) {
    sheet.append(el('div', 'sem-empty', tx('この句はこの層にない。', 'This phrase is not in this layer.')));
    return;
  }
  const head = el('h2', 'headword', idiom.w);
  sheet.append(head);
  sheet.append(el('p', 'reading', idiom.r));
  const meta = el('div', 'shelf-meta');
  if (idiom.yoji) meta.append(withEn(el('span', 'pool-tag', '四字熟語'), 'four-character idiom'));
  sheet.append(meta);
  for (const g of idiom.g) sheet.append(el('p', 'gloss', g));

  sheet.append(withEn(el('p', 'eyebrow', '字へ'), 'into the kanji', 'en-inline'));
  sheet.append(
    chipsFor(
      idiom.k.map((c) => ({ label: c, sub: D.kanken[c]?.kk ? tx(D.kanken[c].kk, kankenGradeLabel(D.kanken[c].kk)) : '' })),
      (item, invoker) => go({ t: 'kanji', id: item.label, from: node.from }, { invoker }),
      null,
      'kanji',
    ),
  );

  renderStudyFold(sheet, node, null);
}

function heroOf(page) {
  return page?.querySelector('.headword, .hero-glyph, h2') || null;
}

function storyHeroOnScreen(img) {
  if (!img?.isConnected || !img.complete || !img.naturalWidth) return false;
  const r = img.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
}

function storyHeroArriving(hero) {
  if (S.view !== hero.to || S.passageId !== hero.passageId) return null;
  const src = hero.img.getAttribute('src');
  const candidates = hero.to === 'reader'
    ? [document.querySelector('#app > main .reader-picture-img')]
    : [...document.querySelectorAll('#shelf-body .shelf-item[data-passage] .story-img')]
      .filter((img) => img.closest('.shelf-item')?.dataset.passage === hero.passageId)
      .sort((a, b) => Number(!(hero.rank && a.closest(`.${hero.rank}`))) - Number(!(hero.rank && b.closest(`.${hero.rank}`))));
  const img = candidates.find((node) => node && node.getAttribute('src') === src && node.getBoundingClientRect().height > 0);
  if (!img) return null;
  const r = img.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight ? img : null;
}

function nameStoryHero(img, id) {
  img.style.viewTransitionName = 'hero';
  img.dataset.storyHero = String(id);
}

function clearStoryHero(hero) {
  for (const img of [hero?.img, hero?.arrived]) {
    if (img?.dataset.storyHero === String(hero.id)) {
      img.style.removeProperty('view-transition-name');
      delete img.dataset.storyHero;
    }
  }
}

function worldPickerEsc(e) {
  if (e.key === 'Escape') closeWorldPicker();
}

function worldName(t) {
  return tx(t.name, {
    sumi: 'Ink on kozo paper', shu: 'Vermilion on shell white', iwa: 'Umber on persimmon paper',
    rokusho: 'Shell white on black lacquer', yoru: 'Gold on indigo', hokusai: 'Hokusai Prussian blue',
    akafuji: 'Red Fuji', nami: 'The Great Wave', keyblock: 'Woodblock ink',
    hakuu: 'Lightning below the summit', kaku: 'Electric phosphor',
  }[t.id]);
}

export { GRAMMARS, sentenceDraftInputMatches, sentenceDraftStatus, sentenceDraftCopyButton, beyondJoyo, storySeries, storyLevel, storyTopicKey, storyTopic, storyBlock, storyAccent, storyPictureSource, storyHeroKanji, storyPicture, storyKicker, storyVersions, storyYourWords, storyInstrument, storyLede, storyDate, paintTok, kanjiSlipReading, kanjiCourseEvidencePatch, kanjiCourseNodeUnit, kanjiCourseTeachingHelp, kanjiCourseReferenceHelp, kanjiCourseReturnFrame, kanjiCourseEntryNode, kanjiCourseRunKind, kanjiRoomEntry, kanjiChooseRoom, kanjiEnterCourseDoor, openKanjiRooms, renderKanjiRoomChooser, kanjiQuestStructural, kanjiQuestSeed, kanjiQuestSentences, kanjiQuestQuote, kanjiQuestStale, kanjiQuestLine, kanjiQuestLines, kanjiQuestBinding, kanjiQuestBound, kanjiQuestWordsDone, kanjiQuestRunStarted, kanjiQuestSettle, kanjiQuestSelfCheck, kanjiQuestRedraw, kanjiQuestAct, kanjiQuestCreate, kanjiQuestEnd, kanjiQuestClear, kanjiQuestOpen, kanjiQuestStage, kanjiQuestPool, kanjiQuestRender, kanjiQuestSummary, sentenceKept, kanjiFactsState, kanjiFacts, kanjiReferenceView, kanjiFactsStatus, kanjiReference, joyoOnNote, kanjiFinderUniverse, kanjiEntryRecord, strokeRoomRecord, kdxGridShown, kdxGlyphName, kdxPartHits, classicalRadicalHits, kdxRadicalResults, kdxFrequencyHits, kdxLoadFailed, kankenLevels, kkldNumberGlyphs, kkldOf, kkldLine, kdxTextResults, renderKdxDraw, kdxDrawResults, recognizeKanji, wwSaveTrail, wwPush, wwKanjiOf, wwParts, wwWord, wwMine, wwDueToday, wwDefault, wwPassageIndex, wwSentences, wwPassages, wwKanjiPassage, wwGrammarFor, wwExcerpt, wwOpenPassage, wwKanjiCap, wwPartName, wwPartCap, wwModel, wwLearn, wwInkLabel, wwReadingChoices, wwSlipNode, wwValid, wwRecentre, renderParticleNode, renderGrammarNode, renderSentenceNode, sentenceDoor, sentencePracticeError, sentenceSource, _strokeOf, _componentsOf, _allSub, mainParts, componentLabel, renderKanjiClassifications, kanjiFamilyLiveVisit, kanjiFamilyHelpRow, kanjiFamilyAuthorize, kanjiFamilyHasExampleOrigin, activateKanjiFamily, kanjiFamilyControlId, kanjiFamilyStatus, kanjiFamilyRefusal, kanjiFamilyCourseExpectation, renderKanjiFamilyDisclosure, kanjiFamilyCitations, activateKanjiStructure, renderKanjiNode, strokeStart, strokeThumb, strokeDoor, paintStrokes, strokeControl, strokeReadingRow, strokeAwakeField, strokeReadingField, strokeClassificationLine, strokeReferenceStatus, strokeClassicReadings, strokeReadingsStatus, strokeMissing, animcjkGlyphFor, inkSpecFor, inkStrokeMs, inkCeremony, renderRadicalNode, renderIdiomNode, heroOf, storyHeroOnScreen, storyHeroArriving, nameStoryHero, clearStoryHero, worldPickerEsc, worldName };

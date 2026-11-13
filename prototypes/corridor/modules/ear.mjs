/** The ear (2026-11-11; John chose "one gesture everywhere"): one gesture that speaks any Japanese on any screen, so
 * nothing is left silent, screens built later included. One layer for the whole document, no per-screen code.
 *
 *   off (the default)  耳 in a hairline box. Everything behaves as before; Option-click on Japanese speaks it.
 *   armed (one tap)    a red 耳 on paper. The next tap on Japanese speaks it and does nothing else; the ear goes off.
 *   held (long press)  a white 耳 on a vermilion seal. On a phone a tap on running text speaks it and does nothing else,
 *                      and the app's own controls (rows, buttons, tabs, the sky's words, web nodes) act as always (the
 *                      review's ruling R-a); on the Mac the pointer resting 0.4 s on Japanese speaks it and clicks behave
 *                      as usual.
 *   speaking           the seal with three arcs. A second tap on the same unit stops it.
 *   novoice            the mark struck once and one plain line for about four seconds (not paired, no connection,
 *                      budget used up); then it rests off.
 *
 * The unit that speaks: in running text the sentence under the pointer or finger; on a row, a label, a button or a web
 * node, that element's Japanese, sent as its kana reading where the element carries one; on a surface that draws its
 * own words (the sky, in WebGL), the word the surface says stands under the point, sent as its reading.
 *
 * This module holds the state machine (createEarMachine), the unit finding (findUnit, unitAt), the click verdict
 * (earClick) and the wiring (installEar). It speaks only through what installEar is handed, which is the voice seam
 * (voice-layer.mjs): the voice server when paired, otherwise silence and the plain line. The look is the Bunki design
 * lead's (design/ear/ear-states.html, 2026-11-11 00:30): colours from the look's own variables. */
import { isJapaneseEnough } from './nihongo-speech/audio/speech-text.mjs';
import { createBands, rangeBoxes } from './voice-bands.mjs';
import { VOICE_EAR_HELP, VOICE_LINE_STANDS_MS, VOICE_WORDS, voiceEarLabel, voiceLineOf } from './voice-lines.mjs';
import { sentencesOf, voiceKeyOf } from './voice-seam.mjs';
import { splitSentences } from './nihongo-speech/audio/speech-text.mjs';

export const REST_MS = 400;
/** The struck ear's line stands as long as a control's (modules/voice-lines.mjs). */
export const NOVOICE_MS = VOICE_LINE_STANDS_MS;
/** A press this long is a hold (the reader's hold saves a word at 500 ms): never the ear's tap. */
export const TAP_MAX_MS = 450;
export const LONG_PRESS_MS = 500;
const TAP_MOVE_PX = 9;
/** A read that ended this way had no voice: the ear is struck and says why. */
const QUIET_ENDS = new Set(['nothing-to-say', 'not-japanese', 'aborted']);
/** The ear's own limit ran out (voice-layer.mjs, EAR_FIRST_CLIP_MS): its sentence had not begun to sound. Not the server
 * saying it is busy: that is 'voice-unavailable', in the seam's own words. */
export const EAR_SLOW = 'ear-too-slow';

/* ------------------------------------------------------------------ the state machine */
/** `speak(unit, done)` starts one read and returns its handle ({ stop() }); `done(outcome, reason)` is called once when
 * it ends ('done' | 'stopped' | 'error'). `cannot(unit)` names why there is no voice right now, or null. */
export function createEarMachine({ speak, cannot = () => null, schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (timer) => clearTimeout(timer), restMs = REST_MS, noVoiceMs = NOVOICE_MS, onChange = () => {} } = {}) {
  let mode = 'off';            // off | armed | held
  let current = null;          // { key, handle, ended }
  let noVoice = null;          // { reason, timer }
  let rest = null;             // { key, timer, asked }
  const changed = () => { try { onChange(); } catch { /* a painter's own fault */ } };
  const clearRest = () => { if (rest?.timer) cancel(rest.timer); rest = null; };
  const clearNoVoice = () => { if (noVoice?.timer) cancel(noVoice.timer); noVoice = null; };
  const strike = (reason) => {
    clearNoVoice();
    mode = 'off';
    clearRest();
    const mine = { reason, timer: null };
    mine.timer = schedule(() => { if (noVoice === mine) { noVoice = null; changed(); } }, noVoiceMs);
    noVoice = mine;
  };
  function stopCurrent() {
    const was = current;
    current = null;
    if (was && !was.ended) { was.ended = true; try { was.handle?.stop?.(); } catch { /* already gone */ } }
  }
  /** One sound at a time: whatever the ear was saying ends, then this unit is asked for, or the ear is struck. */
  function start(unit) {
    stopCurrent();
    clearNoVoice();
    let why = null;
    try { why = cannot(unit); } catch { why = 'speak-failed'; }
    if (why) { strike(why); changed(); return; }
    const mine = { key: unit.key, handle: null, ended: false };
    current = mine;
    const done = (outcome, reason) => {
      if (mine.ended && current !== mine) return;
      mine.ended = true;
      if (current === mine) current = null;
      if (outcome === 'error' && reason && !QUIET_ENDS.has(reason)) strike(reason);
      changed();
    };
    try { mine.handle = speak(unit, done); } catch { done('error', 'speak-failed'); return; }
    changed();
  }
  const speakingNow = () => (current && !current.ended ? current : null);

  return {
    mode: () => mode,
    reason: () => noVoice?.reason ?? null,
    speaking: () => speakingNow()?.key ?? null,
    voice: () => !!speakingNow(),
    /** The one state the mark and the page show. Armed shows over a voice still speaking: he sees the ear waiting. */
    display() {
      if (noVoice) return 'novoice';
      if (mode === 'armed') return 'armed';
      if (speakingNow()) return 'speaking';
      return mode;
    },
    tapEar() {
      if (noVoice) { clearNoVoice(); mode = 'armed'; }
      else mode = mode === 'off' ? 'armed' : 'off';
      clearRest();
      changed();
    },
    holdEar() {
      clearNoVoice();
      mode = 'held';
      clearRest();
      changed();
    },
    /** A click or tap that landed on `unit` (null: nothing Japanese there). 'consume': the ear took it, and the app must
     * not see it; 'pass': it is the app's own. `control`: the tap landed on one of the app's own controls. Held on, on
     * the phone, the app's controls and a study card's front act as they always do and are never spoken by a tap (the
     * review's ruling R-a, as in Nihongo Study); an armed tap and Option-click still speak them. `dry`: only the verdict,
     * nothing done (the sky asks it as the finger lifts, before the click). */
    click({ unit, pointer = 'mouse', alt = false, control = false, dry = false } = {}) {
      if (!unit) return 'pass';
      // a card's question face where the ear may not read (CLOSED): its own gesture there (Option-click, an armed tap) is
      // taken and nothing is asked or played, so the card is not turned over by it; any other click is the app's
      if (unit.closed) {
        if (!alt && mode !== 'armed') return 'pass';
        if (!dry && mode === 'armed') { mode = 'off'; clearRest(); changed(); }
        return 'consume';
      }
      const touch = pointer !== 'mouse';
      const appTap = mode === 'held' && touch && !alt && (control || !!unit.front);
      const now = speakingNow();
      if (now && now.key === unit.key && mode !== 'armed' && !appTap) { if (!dry) { stopCurrent(); changed(); } return 'consume'; }
      if (mode === 'armed') { if (!dry) { mode = 'off'; start(unit); } return 'consume'; }
      if (mode === 'held' && touch && !appTap) { if (!dry) start(unit); return 'consume'; }
      if (alt) { if (!dry) start(unit); return 'consume'; }
      // a click is not a rest: the rest it lands in asks nothing (the app is about to act on that click)
      if (!dry && mode === 'held' && rest && !rest.asked) { cancel(rest.timer); rest.timer = null; rest.asked = true; }
      return 'pass';
    },
    /** The Mac's pointer over `unit` (null: over nothing Japanese). Held on, a rest of `restMs` on one unit speaks it
     * once; moving within the unit asks nothing more; a new rest cancels a read still in flight. */
    hover({ unit, pointer = 'mouse' } = {}) {
      if (mode !== 'held' || pointer !== 'mouse') { clearRest(); return; }
      // what the learner wrote, and a study card's front (hearing it would give the answer away), are read on a
      // deliberate act only, never from a resting pointer
      if (!unit || unit.typed || unit.front) { clearRest(); return; }
      if (rest && rest.key === unit.key) return;
      clearRest();
      const mine = { key: unit.key, timer: null, asked: false };
      mine.timer = schedule(() => {
        if (rest !== mine || mode !== 'held') return;
        mine.timer = null;
        mine.asked = true;
        start(unit);
      }, restMs);
      rest = mine;
    },
    /** The 読む chip: a selection, read now, whatever the ear's state. */
    speakNow(unit) { if (unit) start(unit); },
    /** The screen changed, or the app stopped every sound: the ear's read ends; its mode stays. */
    stop() { stopCurrent(); clearRest(); changed(); },
    /** A screen with no mark to turn the ear off: the ear rests off, silently (no struck line); a voice speaking goes on. */
    rest() { if (mode === 'off') return; mode = 'off'; clearRest(); changed(); },
  };
}

/* ------------------------------------------------------------------ the words it shows */
/** The ear's label for its state, in the interface language: the one vocabulary's words (modules/voice-lines.mjs); with no
 * voice, the short form of the cause, the same as the bar's (a pairing the server ended is "pair again" here as in the
 * line). */
export function earLabel(state, reason, tx) {
  return tx(...voiceEarLabel(state, reason));
}
/** The one plain line beside the struck mark, in the interface language: the cause's line, as a control says it.
 * `plain.line(reason)`: the voice layer's own (it knows when today's limit resets); without it the module's. */
export function noVoiceLine(reason, tx, plain = null) {
  const own = reason && plain?.line ? plain.line(reason) : '';
  return own || tx(...voiceLineOf(reason));
}

/* ------------------------------------------------------------------ the unit that speaks */
const SKIP_TAGS = new Set(['RT', 'RP', 'SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'DATALIST', 'CANVAS', 'IFRAME', 'TITLE', 'DESC', 'MATH', 'OBJECT', 'VIDEO', 'AUDIO']);
/** Fields: what is typed into them never leaves the device, whatever unit they stand in. */
const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'DATALIST']);
const CONTROL_TAGS = new Set(['BUTTON', 'A', 'SUMMARY', 'LABEL']);
const CONTROL_ROLES = new Set(['button', 'link', 'option', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'tab', 'treeitem', 'switch', 'checkbox', 'radio']);
const INLINE_TAGS = new Set(['RT', 'RP', 'RB', 'SPAN', 'A', 'B', 'I', 'EM', 'STRONG', 'RUBY', 'RB', 'SMALL', 'MARK', 'ABBR', 'CODE', 'SUB', 'SUP', 'TIME', 'Q', 'CITE', 'U', 'S', 'BR', 'WBR', 'BDI', 'BDO', 'DFN', 'KBD', 'SAMP', 'VAR', 'DATA', 'LABEL', 'IMG', 'FONT']);
const NO_HOST = new Set(['BODY', 'HTML']);
/** A class that names a reading: yomi, read, reading, kana, furigana, or a short name ending in -r (Today's dw-r). */
const READING_CLASS = /(?:^|[\s_-])(?:yomi|read|reading|kana|furigana)(?:$|[\s_-])|-r(?:$|\s)/i;
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・･·、，,\s]+$/u;
const JAPANESE_LETTER = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const JAPANESE_LETTERS = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu;
const JAPANESE_RUN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々〆ヶ、。・「」『』（）！？〜～…0-9０-９]+/gu;
const BARE_RUN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々〆ヶ]+/gu;

const tagOf = (node) => String(node?.tagName || '').toUpperCase();
const attr = (node, name) => (typeof node?.getAttribute === 'function' ? node.getAttribute(name) : null);
const hasClass = (node, name) => !!node?.classList?.contains?.(name);
const classText = (node) => (typeof node?.className === 'string' ? node.className : String(node?.className?.baseVal || ''));
const parentOf = (node) => node?.parentNode && node.parentNode.nodeType === 1 ? node.parentNode : null;
const inside = (outer, node) => { for (let at = node; at; at = at.parentNode) if (at === outer) return true; return false; };
const hasJapanese = (text) => JAPANESE_LETTER.test(String(text || ''));
const defaultDisplay = (node) => node?.style?.display || (INLINE_TAGS.has(tagOf(node)) ? 'inline' : tagOf(node) === 'BUTTON' ? 'inline-block' : 'block');
/** Inline in the flow of a line: the reader's word spans are inline-flex boxes, and still words of one sentence. */
const isInlineDisplay = (value) => /^(inline(-block|-flex|-grid|-table)?|contents|ruby|ruby-base|ruby-text)$/.test(String(value || ''));
const isControl = (node) => CONTROL_TAGS.has(tagOf(node)) || CONTROL_ROLES.has(String(attr(node, 'role') || '').toLowerCase());
const isOwn = (node) => attr(node, 'data-ear-own') !== null;
const isEditable = (node) => FIELD_TAGS.has(tagOf(node)) || ['', 'true', 'plaintext-only'].includes(attr(node, 'contenteditable') ?? 'no');
const isHiddenText = (node) => node.hidden || attr(node, 'aria-hidden') === 'true' || hasClass(node, 'visually-hidden');
const isNote = (node) => hasClass(node, 'say-note') || hasClass(node, 'voice-note') || attr(node, 'data-reader-annotation') === 'true';
/** The app's own controls inside a unit (a listen mark, a button, an icon's glyph): masked out of what is sent. A link
 * in running text is a word of its sentence and stays. */
const MASKED_ROLES = new Set(['button', 'switch', 'checkbox', 'radio', 'tab', 'option', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'treeitem']);
/** The app's listen controls: their glyph (音, 聞く) is an icon. */
const LISTEN_CLASSES = ['voice-say', 'play-mark', 'kp-listen', 'mini-voice', 'say'];
const MASKED_CLASSES = [...LISTEN_CLASSES, 'icon-button'];
const isAppControl = (node) => tagOf(node) === 'BUTTON' || MASKED_ROLES.has(String(attr(node, 'role') || '').toLowerCase()) ||
  MASKED_CLASSES.some((name) => hasClass(node, name));
/** What the learner wrote, shown back as text (his tutor turns, his spoken lines, his notes and drafts, his notes to the
 * prototype): read on a deliberate tap, never from a resting pointer. A later screen marks its own with data-ear-typed. */
const isTypedText = (node) => attr(node, 'data-ear-typed') !== null || (hasClass(node, 'chat-turn') && hasClass(node, 'me')) ||
  (hasClass(node, 'speak-line') && attr(node, 'data-who') === 'me') ||
  ['record-note-segment', 'teacher-draft-quote', 'pl-note-text'].some((name) => hasClass(node, name));
const typedAt = (node) => { for (let at = node; at && at.nodeType === 1; at = at.parentNode) if (isTypedText(at)) return true; return false; };
/** On a study card's front (the app says which: context.cardFront): read on a deliberate act, never from a rest. */
const frontAt = (node, context) => { try { return !!context.cardFront?.(node); } catch { return false; } };
/** On a study card's question face the only voice is the card's own control (the lead's ruling after the combine's
 * review, F1, 2026-11-12). The app says where such a face is: context.cardQuestion(element) answers null off a question
 * face; on one it answers { open, say }: `open` the element the ear may read there (the asked word where the face's
 * control stands, or that control itself) or null, and `say` what that control says ({ text, voiceKey }). On `open` the
 * ear says exactly that: one clip, the control's text under the control's voice key. Everywhere else on the face (a face
 * with no control: several readings, no stored reading, blanked, still settling, a sentence or a question card; on a face
 * with a control, every text that is not the asked word) the ear finds CLOSED: nothing is asked or played, and its own
 * gesture there (Option-click, an armed tap) is taken, so it does not also turn the card over. */
export const CLOSED = Object.freeze({ kind: 'closed', closed: true, front: true, typed: false, text: '', sentences: Object.freeze([]),
  key: 'closed', contains: () => false });
const elementOf = (node) => (node?.nodeType === 3 ? node.parentElement || node.parentNode : node);
const questionAt = (node, context) => {
  const element = elementOf(node);
  if (!element || element.nodeType !== 1) return null;
  try { return context.cardQuestion?.(element) || null; } catch { return CLOSED; }
};
/** What the ear finds at `node` on a card's question face: the control's own words on its asked word (or on the control),
 * CLOSED anywhere else on the face, or null off any question face. */
export function questionUnit(node, context = {}) {
  const face = questionAt(node, context);
  if (!face) return null;
  if (face === CLOSED) return CLOSED;
  const open = face.open;
  const text = String(face.say?.text ?? '').trim();
  if (!open || !text || !face.say?.voiceKey || !hasJapanese(text) || !inside(open, elementOf(node))) return CLOSED;
  return {
    kind: 'element', element: open, block: open, reading: KANA_ONLY.test(text) ? text : null,
    text, sentences: [{ text }],
    key: `q${idOf(open)}:${text}`,
    voiceKey: face.say.voiceKey,
    typed: false,
    front: true,
    contains: (other) => inside(open, other),
  };
}
/** A selection the 読む chip never offers to read: one that lies in, starts in, ends in or spans a card's question face
 * (the same ruling: on a question face the only voice is the card's own control). */
export function selectionClosed(range, context = {}) {
  if (!range) return false;
  const on = (node) => !!questionAt(node, context);
  if ([range.startContainer, range.endContainer, range.commonAncestorContainer].some(on)) return true;
  const common = range.commonAncestorContainer;
  const stack = [...((common?.nodeType === 3 ? common.parentNode : common)?.childNodes || [])];
  while (stack.length) {
    const node = stack.pop();
    if (node?.nodeType !== 1) continue;
    if (typeof range.intersectsNode === 'function' && !range.intersectsNode(node)) continue;
    if (on(node)) return true;
    stack.push(...(node.childNodes || []));
  }
  return false;
}

/** Japanese a voice can say: whole sentences when the text is Japanese through and through; from mixed text only its
 * Japanese runs; and a lone character ("門 Products") when that is all the Japanese there is. */
const JA_MARK = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー々〆ヶ、。・「」『』（）！？〜～…]';
const AROUND_JAPANESE = new RegExp(`\\s+(?=${JA_MARK})|(?<=${JA_MARK})\\s+`, 'gu');
/** Spaces the page sets between Japanese words (word spans, line joins) are not read. */
const tidy = (text) => String(text).replace(AROUND_JAPANESE, '');
export function speakable(text) {
  return speakableRaw(text).map((sentence) => ({ ...sentence, text: tidy(sentence.text) })).filter((sentence) => sentence.text);
}
function speakableRaw(text) {
  const raw = String(text ?? '');
  if (!hasJapanese(raw)) return [];
  const whole = sentencesOf(raw);
  if (whole.length && whole.every((sentence) => isJapaneseEnough(sentence.text))) return whole;
  const runs = (raw.match(JAPANESE_RUN) || []).filter((run) => (run.match(JAPANESE_LETTERS) || []).length >= 2)
    .flatMap((run) => sentencesOf(run)).filter((sentence) => isJapaneseEnough(sentence.text));
  if (runs.length) return runs;
  const bare = (raw.match(BARE_RUN) || []).join('、');
  return bare && isJapaneseEnough(bare) ? [{ text: bare }] : [];
}

/** The text nodes of `root` a learner reads as its words, in order: no readings above words, no notes, nothing hidden
 * (unless `keep` is inside it: what he touched is what he sees), never a field or anything in one, with `controls`
 * false nothing inside a control, and with `mask` nothing inside one of the app's own controls. */
function textNodes(root, { keep = null, controls = true, skip = null, mask = false } = {}) {
  const out = [];
  if (isEditable(root)) return out;
  const visit = (node) => {
    if (node.nodeType === 3) { if (node.nodeValue) out.push(node); return; }
    if (node.nodeType !== 1) return;
    if (node !== root) {
      if (SKIP_TAGS.has(tagOf(node)) || isEditable(node) || isOwn(node) || isNote(node) || (skip && skip(node))) return;
      if (isHiddenText(node) && !(keep && inside(node, keep))) return;
      if (!controls && isControl(node)) return;
      if (mask && isAppControl(node)) return;
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(root);
  return out;
}
const joined = (nodes) => nodes.map((node) => node.nodeValue).join('');
/** The words a selection holds, as the page shows them: no readings above words, no notes, nothing hidden. */
export function rangeText(range) {
  const common = range.commonAncestorContainer;
  const root = common?.nodeType === 3 ? common.parentNode : common;
  if (!root) return '';
  let out = '';
  for (const node of textNodes(root, { keep: common?.nodeType === 3 ? common : null, mask: true })) {
    if (typeof range.intersectsNode === 'function' && !range.intersectsNode(node)) continue;
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.nodeValue.length;
    out += node.nodeValue.slice(from, to);
  }
  return out;
}

/** The reading an element carries: a kana attribute, or one descendant whose class names a reading and holds kana. */
function readingOf(element) {
  for (const name of ['data-reading', 'data-kana', 'data-yomi']) {
    const value = attr(element, name);
    if (value && KANA_ONLY.test(value) && hasJapanese(value)) return { text: value, node: null };
  }
  const stack = [...(element.childNodes || [])];
  while (stack.length) {
    const node = stack.shift();
    if (node.nodeType !== 1 || SKIP_TAGS.has(tagOf(node)) || isOwn(node)) continue;
    if (READING_CLASS.test(classText(node))) {
      const value = joined(textNodes(node)).trim();
      if (value && hasJapanese(value) && KANA_ONLY.test(value)) return { text: value, node };
      continue;
    }
    stack.unshift(...(node.childNodes || []));
  }
  return null;
}
const readingSentence = (text) => String(text).replace(/\s*[・･·,，]\s*/gu, '、').replace(/、+$/u, '').replace(/\s+/gu, '');

/** A short string that names a text, for a voice key: stable, no spaces. */
function digest(text) {
  let a = 0x811c9dc5, b = 0x01000193;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b + code, 0x5bd1e995) >>> 0;
  }
  return a.toString(36) + b.toString(36).slice(0, 3);
}
/** The voice key, by the existing kinds: a sentence of an article keeps article:<id>; a listen mark's own key where the
 * text has one (a replay of what it said is free); a word or a row word:<word>; any other text one key per screen and
 * paragraph, so a replay is free and one paragraph keeps one narrator. */
function keyOf({ node, word, paragraph }, context) {
  let article = null;
  try { article = context.articleOf?.(node) || null; } catch { /* no article here */ }
  if (article) return voiceKeyOf('article', article);
  let mark = null;
  try { mark = context.keyFor?.(node) || null; } catch { /* no mark here */ }
  if (mark) return mark;
  if (word) return voiceKeyOf('word', word);
  return voiceKeyOf('word', `ear.${String(context.view || 'app').replace(/[^\w-]/g, '') || 'app'}.${digest(paragraph)}`);
}

let elementIds = new WeakMap();
let nextId = 1;
const idOf = (node) => { if (!elementIds.has(node)) elementIds.set(node, nextId++); return elementIds.get(node); };

/** A control that says what it reads (the review card's 音: data-voice-text, data-voice-word) is read as that, never as
 * its glyph. */
function declaredUnit(element, context, keep) {
  const text = attr(element, 'data-voice-text') || '';
  const word = attr(element, 'data-voice-word') || '';
  const sentences = speakable(text || word);
  if (!sentences.length) return null;
  return {
    kind: 'element', element, block: element, reading: text && KANA_ONLY.test(text) ? text : null,
    text: sentences.map((one) => one.text).join(''), sentences,
    key: `e${idOf(element)}:${word || text}`,
    voiceKey: keyOf({ node: element, word: word || null, paragraph: text || word }, context),
    typed: typedAt(element),
    front: frontAt(element, context),
    contains: (node) => inside(element, node),
    keep,
  };
}
function elementUnit(element, context, keep, reading = readingOf(element)) {
  if (attr(element, 'data-voice-text') !== null || attr(element, 'data-voice-word') !== null) {
    const declared = declaredUnit(element, context, keep);
    if (declared) return declared;
  }
  let nodes = textNodes(element, { mask: true, skip: reading?.node ? (node) => node === reading.node : null });
  if (!hasJapanese(joined(nodes))) nodes = textNodes(element, { keep: element, mask: true, skip: reading?.node ? (node) => node === reading.node : null });
  const own = joined(nodes);
  const word = (own.match(BARE_RUN) || []).join('');
  const sentences = reading ? [{ text: readingSentence(reading.text) }] : speakable(own);
  if (!sentences.length) return null;
  const wordLike = word && [...word].length <= 16 && !/[。！？]/u.test(own);
  return {
    kind: 'element', element, block: element, reading: reading?.text || null,
    text: sentences.map((s) => s.text).join(''), sentences,
    key: `e${idOf(element)}:${word || own}`,
    voiceKey: keyOf({ node: element, word: wordLike ? word : null, paragraph: own }, context),
    typed: typedAt(element),
    front: frontAt(element, context),
    contains: (node) => inside(element, node),
    keep,
  };
}

/** The sentence of `block` that the text position (node, offset) stands in. */
function sentenceUnit(block, target, offset, context) {
  const nodes = textNodes(block, { keep: target, mask: true });
  const text = joined(nodes);
  if (!hasJapanese(text)) return null;
  const starts = [];
  let total = 0;
  for (const node of nodes) { starts.push(total); total += node.nodeValue.length; }
  // where the touch is in the block's text: a text node it holds, else the first word after the touched element
  let at = -1;
  const index = nodes.indexOf(target);
  if (index >= 0) at = starts[index] + Math.max(0, Math.min(Number.isFinite(offset) ? offset : 0, nodes[index].nodeValue.length - 1));
  else {
    let from = target;
    // a reading above a word (rt) speaks the sentence that word stands in
    for (let up = target; up && up !== block; up = up.parentNode) if (tagOf(up) === 'RUBY') { from = up; break; }
    const first = nodes.findIndex((node) => inside(from, node));
    if (first >= 0) at = starts[first];
    else {
      const after = nodes.findIndex((node) => precedes(from, node));
      at = after >= 0 ? starts[after] : Math.max(0, total - 1);
    }
  }
  let pieces = [];
  try { pieces = earPieces(text); } catch { return null; }
  if (!pieces.length) return null;
  let piece = pieces.find((p) => at >= p.start && at < p.end);
  if (!piece) piece = pieces.reduce((best, p) => (Math.abs(p.start - at) < Math.abs(best.start - at) ? p : best), pieces[0]);
  const sentences = speakable(piece.text);
  if (!sentences.length) return null;
  const locate = (position, end) => {
    for (let i = 0; i < nodes.length; i += 1) {
      const from = starts[i], to = from + nodes[i].nodeValue.length;
      if (end ? position > from && position <= to : position >= from && position < to) return { node: nodes[i], offset: position - from };
    }
    const last = nodes[nodes.length - 1];
    return { node: last, offset: last.nodeValue.length };
  };
  const start = locate(piece.start, false), end = locate(piece.end, true);
  return {
    kind: 'sentence', element: block, block, reading: null,
    text: piece.text, sentences,
    range: { startNode: start.node, startOffset: start.offset, endNode: end.node, endOffset: end.offset },
    key: `s${idOf(block)}:${piece.start}:${piece.text}`,
    voiceKey: keyOf({ node: target.nodeType === 3 ? target.parentNode : target, word: null, paragraph: text }, context),
    typed: typedAt(block),
    front: frontAt(block, context),
    contains: (node) => inside(block, node),
  };
}
/** The sentences of a block's text with their places: the speech team's own splitting, and an English full stop
 * followed by a space ends a sentence too, so the English around Japanese in a mixed line is a sentence of its own. */
function earPieces(text) {
  const out = [];
  const push = (start, end) => {
    while (start < end && /\s/u.test(text[start])) start += 1;
    while (end > start && /\s/u.test(text[end - 1])) end -= 1;
    if (end > start) out.push({ start, end, text: text.slice(start, end).replace(/\s+/gu, ' ') });
  };
  for (const piece of splitSentences(text)) {
    let from = piece.start;
    const stop = /[.](?=\s)/gu;
    stop.lastIndex = piece.start;
    for (let match = stop.exec(text); match && match.index < piece.end; match = stop.exec(text)) { push(from, match.index + 1); from = match.index + 1; }
    push(from, piece.end);
  }
  return out;
}
/** True when `a` comes before `b` in the document (both under one root). */
function precedes(a, b) {
  if (typeof a.compareDocumentPosition === 'function') return !!(a.compareDocumentPosition(b) & 4);
  const path = (node) => { const out = []; for (let at = node; at; at = at.parentNode) out.unshift(at); return out; };
  const pa = path(a), pb = path(b);
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i += 1;
  if (i === 0 || i >= pa.length || i >= pb.length) return false;
  const siblings = pa[i - 1].childNodes || [];
  return siblings.indexOf(pa[i]) < siblings.indexOf(pb[i]);
}

/** The unit `target` (a text node or an element) stands in, or null when there is no Japanese to say there.
 * `offset`: the position in a text node. `display(element)`: its CSS display (the page's computed one). `context`:
 * { view, articleOf(node), keyFor(node) } for the voice key; cardQuestion(node) for a study card's question face (CLOSED
 * there, or the card's control's own words on its asked word: questionUnit). */
export function findUnit(target, { offset = null, display = defaultDisplay, context = {} } = {}) {
  if (!target) return null;
  const start = target.nodeType === 3 ? parentOf(target) : target;
  if (!start || start.nodeType !== 1) return null;
  const question = questionUnit(start, context);
  if (question) return question;
  for (let at = start; at; at = parentOf(at)) {
    if (isOwn(at) || isEditable(at)) return null;
    if (SKIP_TAGS.has(tagOf(at)) && tagOf(at) !== 'RT' && tagOf(at) !== 'RP') return null;
  }
  // a control: the row, label, button or web node is the unit, unless it is a word inside running text
  let control = null, outer = null;
  for (let at = start; at && !NO_HOST.has(tagOf(at)); at = parentOf(at)) if (isControl(at)) { control = at; break; }
  // one of the app's own listen controls (its glyph is an icon, 音 or 聞く) that does not say what it reads: the unit is
  // the one it stands in, with the control masked out
  if (control && LISTEN_CLASSES.some((name) => hasClass(control, name)) && attr(control, 'data-voice-text') === null &&
      attr(control, 'data-voice-word') === null && parentOf(control) && !NO_HOST.has(tagOf(parentOf(control)))) {
    // the nearest block around it that holds Japanese of its own (the word box's 音 stands in a row of marks; the
    // word is one block up)
    let holder = blockOf(parentOf(control), display);
    for (let up = 0; holder && up < 4; up += 1) {
      const unit = wordOrSentence(holder, control, null, context);
      if (unit) return unit;
      holder = parentOf(holder) && !NO_HOST.has(tagOf(parentOf(holder))) ? blockOf(parentOf(holder), display) : null;
    }
    return null;
  }
  if (control) {
    // a control is a word of running text only when it stands in the line (inline-level) among Japanese of its own
    // block; a button that stands as a block or a flex row (Today's word, a search row) is its own unit
    let shown = '';
    try { shown = display(control); } catch { shown = defaultDisplay(control); }
    outer = isInlineDisplay(shown) ? blockOf(parentOf(control), display) : null;
    const around = outer ? joined(textNodes(outer, { controls: false })) : '';
    if (!outer || (around.match(JAPANESE_LETTERS) || []).length < 2) return elementUnit(control, context, target);
  }
  // a control standing in running text (a link, a listen mark) is read as the sentence around it
  const block = outer || blockOf(start, display);
  if (!block) return null;
  return wordOrSentence(block, target, offset, context);
}
/** In a block: a word that carries its reading (the study card's 高学歴 こうがくれき) is one unit sent as its reading;
 * otherwise the sentence the touch stands in. */
function wordOrSentence(block, target, offset, context) {
  const reading = readingOf(block);
  // a block that names its own reading (data-reading) is that word too
  if (reading?.node || (reading && attr(block, 'data-reading') !== null)) {
    const word = joined(textNodes(block, { mask: true, skip: (node) => node === reading.node }));
    if (/\p{Script=Han}/u.test(word) && [...(word.match(BARE_RUN) || []).join('')].length <= 16 && !/[。！？]/u.test(word))
      return elementUnit(block, context, target, reading);
  }
  return sentenceUnit(block, target, offset, context);
}
const ATOMIC_INLINE = /^inline-(block|flex|grid|table)$/;
/** The block whose text is the line this node stands in. A box inside an inline-level box (the reader's word span is
 * inline-flex, and its own children are blockified flex items) is part of that box's line, not a block of its own. */
function blockOf(node, display) {
  const shown = (el) => { try { return display(el); } catch { return defaultDisplay(el); } };
  for (let at = node; at; at = parentOf(at)) {
    if (NO_HOST.has(tagOf(at))) return null;
    const value = shown(at);
    if (value === 'none' || isInlineDisplay(value)) continue;
    let inside = null;
    for (let up = parentOf(at); up && !NO_HOST.has(tagOf(up)); up = parentOf(up)) {
      const around = shown(up);
      if (ATOMIC_INLINE.test(around)) { inside = up; break; }
      if (!isInlineDisplay(around) && around !== 'none') break;
    }
    if (inside) { at = inside; continue; }
    return at;
  }
  return null;
}

/** The unit under a point of the page: what a tap or a resting pointer there would speak. `pointer`: the kind of pointer
 * ('mouse', 'touch', 'pen'), for a surface that draws its words (a finger's touch is wider). */
export function unitAt(doc, x, y, { through = true, pointer = 'mouse', ...options } = {}) {
  const view = doc.defaultView;
  const hit = doc.elementFromPoint(x, y);
  if (!hit) return null;
  // what lies under the point inside an open shadow tree (the sky draws in one): its own buttons and words
  const inner = innerAt(hit, x, y);
  // a canvas has no text: the surface that draws there says which word stands under the point
  if (tagOf(inner) === 'CANVAS' || typeof inner.earWordAt === 'function') {
    const surface = drawnSurface(inner);
    if (surface) return drawnUnit(surface, x, y, pointer, options.context || {});
  }
  let node = inner, offset = null;
  const caret = caretAt(doc, x, y);
  if (caret.node?.nodeType === 3 && inside(inner, caret.node) && caretTouches(doc, caret.node, caret.offset, x, y)) { node = caret.node; offset = caret.offset; }
  // Japanese the eye sees on a layer that lets touches pass (the first-open line, the sky's first cue): a tap there
  // lands on what is under it, but what he reads there is that line
  if (through) {
    const over = passThroughText(doc, x, y, hit);
    if (over) { node = over.node; offset = over.offset; }
  }
  return findUnit(node, { offset, display: (el) => view.getComputedStyle(el).display, ...options });
}
function caretAt(doc, x, y) {
  const caret = typeof doc.caretPositionFromPoint === 'function' ? doc.caretPositionFromPoint(x, y)
    : typeof doc.caretRangeFromPoint === 'function' ? doc.caretRangeFromPoint(x, y) : null;
  return { node: caret?.offsetNode ?? caret?.startContainer ?? null, offset: caret?.offset ?? caret?.startOffset ?? null };
}
/** Text drawn above `hit` on a layer that takes no pointer (pointer-events: none). For one look, every element takes
 * the pointer; the layers above the one a tap reaches are walked from the top, and the first whose own Japanese text
 * stands under the point is the text read. Asked once per tap, never per pointer move. */
function passThroughText(doc, x, y, hit) {
  const style = doc.createElement('style');
  style.textContent = '*, *::before, *::after { pointer-events: auto !important; }';
  let stack = [], caret = { node: null, offset: null };
  (doc.head || doc.documentElement).append(style);
  try { stack = doc.elementsFromPoint(x, y); caret = caretAt(doc, x, y); } catch { stack = []; } finally { style.remove(); }
  const shows = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    : doc.defaultView.getComputedStyle(el).visibility === 'visible');
  for (const el of stack) {
    if (el === hit || el.contains(hit) || hit.contains(el)) return null;
    // a word's reading the sky keeps at opacity 0 until it is touched is not what he sees there
    if (el.closest?.('[data-ear-own]') || !shows(el)) continue;
    if (caret.node?.nodeType === 3 && caret.node.parentNode === el && hasJapanese(caret.node.nodeValue) && caretTouches(doc, caret.node, caret.offset, x, y))
      return { node: caret.node, offset: caret.offset };
    for (const child of el.childNodes) {
      if (child.nodeType !== 3 || !hasJapanese(child.nodeValue)) continue;
      const range = doc.createRange();
      range.selectNodeContents(child);
      for (const box of range.getClientRects()) if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return { node: child, offset: 0 };
    }
  }
  return null;
}
/** A caret is placed at the nearest character even beside the text; it counts when its character's box is under the
 * point (or near it, for a gap between letters). */
function caretTouches(doc, node, offset, x, y) {
  try {
    const range = doc.createRange();
    const length = node.nodeValue.length;
    const from = Math.max(0, Math.min(offset, length - 1));
    range.setStart(node, from);
    range.setEnd(node, Math.min(length, from + 1));
    for (const box of range.getClientRects()) if (x >= box.left - 12 && x <= box.right + 12 && y >= box.top - 6 && y <= box.bottom + 6) return true;
  } catch { /* not measurable */ }
  return false;
}

/* ------------------------------------------------------------------ a surface that draws its own words */
/** The element under a point inside the open shadow trees `hit` hosts (the document answers with the host). */
function innerAt(hit, x, y) {
  let at = hit;
  for (let depth = 0; depth < 6; depth += 1) {
    const shadow = at.shadowRoot;
    if (!shadow || typeof shadow.elementFromPoint !== 'function') break;
    let inner = null;
    try { inner = shadow.elementFromPoint(x, y); } catch { inner = null; }
    if (!inner || inner === at || inner.nodeType !== 1) break;
    at = inner;
  }
  return at;
}
/** Up the tree, across shadow roots to their hosts. */
const composedParent = (node) => (node?.parentNode?.nodeType === 11 ? node.parentNode.host || null : parentOf(node));
/** The element that says which of its drawn words stands under a point: it carries earWordAt(x, y, { pointer }), which
 * answers { text, reading, id } or null (the sky's mount, sky/mount.mjs). */
function drawnSurface(node) {
  for (let at = node; at; at = composedParent(at)) if (typeof at.earWordAt === 'function') return at;
  return null;
}
/** The word a surface draws under a point, as a unit: sent as its kana reading where the surface gives one. A word the
 * surface draws is one of its controls (it opens on a tap): held on, a finger's tap on it is the surface's own (R-a). */
function drawnUnit(surface, x, y, pointer, context) {
  let said = null;
  try { said = surface.earWordAt(x, y, { pointer }); } catch { said = null; }
  const text = String(said?.text ?? '').trim();
  if (!text || !hasJapanese(text)) return null;
  const given = String(said.reading ?? '').trim();
  const reading = given && KANA_ONLY.test(given) && hasJapanese(given) ? readingSentence(given) : null;
  const sentences = reading ? [{ text: reading }] : speakable(text);
  if (!sentences.length) return null;
  return {
    kind: 'drawn', element: surface, block: surface, reading,
    text: sentences.map((one) => one.text).join(''), sentences,
    key: `d${idOf(surface)}:${said.id ?? text}`,
    voiceKey: keyOf({ node: surface, word: text, paragraph: text }, context),
    // a word the surface draws is one of its controls (R-a); running text it prints (the sky's sentence captions) is not
    typed: false, front: false, control: said.control !== false,
    contains: (node) => inside(surface, node),
  };
}

/* ------------------------------------------------------------------ the app's own controls */
const ACT_TAGS = new Set(['BUTTON', 'SUMMARY', 'LABEL', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);
/** The app's own control a finger lands on, or null: a button, a link, a field, a tab, a fold, a menu item, anything
 * with a button role or a click action of its own. A word of running text that the app makes a door (the reader's
 * words, data-action inline among the sentence's own Japanese) is text, not a control: held on, it speaks.
 * So is a word of running text that opens a lookup (.japanese-lookup-word, modules/dictionary.mjs): a span, not a
 * button, with no role and its click listener added in script, so nothing below names it a control. That is meant: it
 * is a word of its sentence, like a reader's word, and held on a finger's tap on it speaks (the review's fr1 census
 * found no other kind of listener-bearing Japanese outside the controls named here). */
export function appControlAt(target, { display = defaultDisplay } = {}) {
  const start = target?.nodeType === 3 ? parentOf(target) : target;
  const shown = (el) => { try { return display(el); } catch { return defaultDisplay(el); } };
  for (let at = start; at && at.nodeType === 1 && !NO_HOST.has(tagOf(at)); at = parentOf(at)) {
    if (isOwn(at)) return null;
    const tag = tagOf(at);
    if (ACT_TAGS.has(tag) || (tag === 'A' && attr(at, 'href') !== null)) return at;
    if (CONTROL_ROLES.has(String(attr(at, 'role') || '').toLowerCase())) return at;
    if (attr(at, 'onclick') !== null || typeof at.onclick === 'function') return at;
    if (attr(at, 'data-action') !== null) {
      // a door in the line, among Japanese of its own block, is a word of the sentence
      const block = isInlineDisplay(shown(at)) ? blockOf(parentOf(at), shown) : null;
      const around = block ? joined(textNodes(block, { controls: false })) : '';
      if (!block || (around.match(JAPANESE_LETTERS) || []).length < 2) return at;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ the click verdict */
/** What a click means to the ear. Off, with no Option key and nothing of the ear's speaking, it reads only the Option
 * key and returns: the click is the app's own, untouched. A press held as long as a hold (the reader's save) or moved
 * like a drag is the app's too. Only a real tap or click of a pointer is ever the ear's: a click the keyboard raised
 * (Space, Enter, the review's 1–4) or the app's own code dispatched (node.click()) is the app's, in every mode. Touch or
 * mouse is the pointer that went down for this tap (`press`, from its pointerdown): WebKit, the iPhone's engine, calls the
 * click after a touch a mouse click. `controlAt(target)`: the app's own control the finger landed on, if any. `dry`: the
 * verdict for a finger lifting now, nothing done (the event is its pointerup). */
export function earClick(event, { machine, unitAt: find, press = null, now = Date.now(), controlAt = null, dry = false }) {
  const alt = !!event.altKey;
  if (!alt && machine.mode() === 'off' && !machine.voice()) return 'pass';
  if (event.isTrusted === false) return 'pass';
  if (!dry && event.detail === 0) return 'pass';
  if (press) {
    if (now - press.at >= TAP_MAX_MS) return 'pass';
    if (Math.hypot((event.clientX ?? press.x) - press.x, (event.clientY ?? press.y) - press.y) > TAP_MOVE_PX) return 'pass';
  }
  const pointer = press?.pointerType || event.pointerType || 'mouse';
  let unit = null;
  try { unit = find(event); } catch { unit = null; }
  let control = false;
  // a word a surface draws (the sky's) is that surface's control, whatever element the event names
  if (unit && machine.mode() === 'held' && pointer !== 'mouse' && !alt) { try { control = unit.control === true || !!controlAt?.(event.target); } catch { control = false; } }
  return machine.click({ unit, pointer, alt, control, dry });
}

/** What a key means to the ear: Escape stops the ear's own voice, in every mode, and that press is the ear's alone (it
 * does not also close a sheet or leave a screen). Any other key, or Escape with no voice of the ear's speaking (or while
 * an input method is composing), is the app's own and is not touched. */
export function earKey(event, { machine }) {
  if (event.key !== 'Escape') return 'pass';
  if (!machine.voice()) return 'pass';
  if (event.isComposing) return 'pass';
  machine.stop();
  return 'consume';
}

/* ------------------------------------------------------------------ the colours a voice control takes */
/* One language of states for every voice control (the lead's ruling, 2026-11-12, after the print look came into the
 * build): a control takes its colours from the ground it really stands on, never from a guess about the look (under
 * the print look a night look's bars and cards are pale). At rest it looks like its neighbour (the 耳 like the gate
 * beside it); armed, a red 耳 on that plate, outlined in the same red; held on and speaking, the seal: the look's own
 * red, with a paper-coloured glyph on it and, while it speaks, the three arcs; waiting, dimmed; no voice, struck. The
 * reds are the look's own tokens (the red of the surface, the page's, the card's, the zen room's), taken in that order,
 * the first that meets the floor against what is really behind: 3:1 at rest and for a seal against its ground, 4.5:1 for
 * a glyph in any active state and for text. Where no token meets a floor the one that comes nearest is used. */
export const FLOOR = Object.freeze({ rest: 3, active: 4.5, plate: 3, text: 4.5 });
/* What a choice aims at: a little over each floor, because a glyph's thin strokes print a little lighter than its colour
 * (the floors are measured on the pixels, tools/verify-voice-legibility.mjs). */
const AIM = Object.freeze({ rest: 3.4, active: 5.2, plate: 3.3, text: 5 });
let colourProbe = null;
/** [r, g, b, a] (0-255, alpha 0-1) of a computed CSS colour; any form a browser computes (rgb, oklab, color()) is painted
 * once on a 1 px canvas and read back. null when it is not a colour. */
export function rgbaOf(text, doc = globalThis.document) {
  const value = String(text ?? '').trim();
  if (!value) return null;
  if (value === 'transparent') return [0, 0, 0, 0];
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/iu.exec(value);
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
  const h = /^#([0-9a-f]{3,8})$/iu.exec(value);
  if (h) {
    const x = h[1].length <= 4 ? [...h[1]].map((c) => c + c).join('') : h[1];
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1];
  }
  if (!doc?.createElement) return null;
  try {
    if (!colourProbe) { const c = doc.createElement('canvas'); c.width = 1; c.height = 1; colourProbe = c.getContext('2d', { willReadFrequently: true }); }
    const ctx = colourProbe;
    ctx.fillStyle = '#010203';
    ctx.fillStyle = value;
    if (ctx.fillStyle === '#010203' && value !== '#010203') return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  } catch { return null; }
}
/** `top` laid over an opaque `bottom`. */
export const over = (top, bottom) => (!top ? bottom : [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1));
const channel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = (c) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
/** WCAG contrast of two opaque colours. */
export const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
export const cssOf = (c) => `rgb(${c.slice(0, 3).map((v) => Math.round(v)).join(' ')})`;
/** The first candidate that passes, else the one that comes nearest. */
export function pick(candidates, passes, nearness) {
  const list = candidates.filter(Boolean);
  return list.find(passes) || list.slice().sort((a, b) => nearness(b) - nearness(a))[0] || null;
}
/** The colour a CSS custom property holds where `el` stands (scoped tokens included; the computed value has its var()
 * references resolved), or null when it is not set or not a colour. Read only: nothing is added to the page. */
function tokenAt(el, name) {
  const c = rgbaOf(el.ownerDocument.defaultView.getComputedStyle(el).getPropertyValue(name), el.ownerDocument);
  return c && c[3] > 0 ? c : null;
}
/** What lies behind the centre of `el`, `el` itself left out: the colours of the layers under that point, from the top
 * down to the first opaque one, laid over each other. A surface that draws its own ground (the sky, in WebGL) says
 * what it is with --voice-ground. */
export function groundOf(el) {
  const doc = el.ownerDocument, view = doc.defaultView, r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const inView = x >= 0 && y >= 0 && x < view.innerWidth && y < view.innerHeight;
  const layers = [];
  // out of view, nothing can be asked at its point: its own ancestors are its ground
  const under = inView ? doc.elementsFromPoint(x, y) : (() => { const up = []; for (let at = el.parentElement; at; at = at.parentElement) up.push(at); return up; })();
  for (const node of under) {
    if (node === el || el.contains(node)) continue;
    const own = node.style?.getPropertyValue('--voice-ground').trim();
    if (own) { const c = rgbaOf(own, doc); if (c) { layers.push([c[0], c[1], c[2], 1]); break; } }
    const bg = rgbaOf(view.getComputedStyle(node).backgroundColor, doc);
    if (bg && bg[3] > 0) { layers.push(bg); if (bg[3] >= 0.99) break; }
  }
  return layers.reverse().reduce((under, layer) => over(layer, under), [255, 255, 255, 1]);
}
/** The ground of `el` from its own ancestors only (cheap: no point asked of the page). */
export function groundUp(el) {
  const doc = el.ownerDocument, view = doc.defaultView, layers = [];
  for (let at = el.parentElement; at; at = at.parentElement) {
    const bg = rgbaOf(view.getComputedStyle(at).backgroundColor, doc);
    if (bg && bg[3] > 0) { layers.push(bg); if (bg[3] >= 0.99) break; }
  }
  return layers.reverse().reduce((under, layer) => over(layer, under), [255, 255, 255, 1]);
}
/** The colours of a voice control where it stands. `neighbour`: the control it looks like at rest (the gate beside the
 * 耳); without one it keeps its own rest colours. */
export function toneFor(el, { neighbour = null } = {}) {
  const doc = el.ownerDocument, view = doc.defaultView, root = doc.documentElement;
  const ground = groundOf(el);
  const cs = view.getComputedStyle(neighbour || el);
  const read = (text) => rgbaOf(text, doc);
  const drawn = (pseudo) => { const s = view.getComputedStyle(neighbour, pseudo); return s.content && s.content !== 'none' && s.content !== 'normal' ? s : null; };
  const layers = neighbour ? [drawn('::before'), cs] : [cs];
  const { fill, line } = plateOf(layers, read);
  const own = [tokenAt(el, '--red'), tokenAt(root, '--red'), tokenAt(el, '--card-red'), tokenAt(el, '--zen-red'), tokenAt(root, '--zen-red')];
  const papers = [tokenAt(root, '--print-white'), tokenAt(root, '--ground-0'), tokenAt(el, '--ground-0'), tokenAt(root, '--ink'), tokenAt(el, '--ink'), tokenAt(root, '--ground')];
  const choose = (plate) => chooseTone({ ground, plate, ink: read(cs.color), reds: own, papers });
  const tone = { ...choose(over(read(fill), ground)), fill, line };
  if (!neighbour) return tone;
  // at rest the mark looks like its neighbour wherever the neighbour draws its plate: its ::after (the first screen's
  // gate), its ::before or its own background, what is painted on top first. Armed, held on, speaking and struck keep
  // the colours above (the lead's ruling on the review's F1: they stay as they are)
  const top = plateOf([drawn('::after'), ...layers], read);
  return { ...tone, rest: { fill: top.fill, line: top.line, ink: choose(over(read(top.fill), ground)).restInk } };
}
/** A plate as a control's layers draw it, from plain computed styles listed top first (a neighbour's ::after, its
 * ::before, its own box; null for a layer it does not draw): the fill of the first that is filled, the line colour of the
 * first that has a line. `colour(text)` reads a CSS colour as [r, g, b, a]. */
export function plateOf(layers, colour = rgbaOf) {
  const filled = (text) => { const c = colour(text); return c && c[3] > 0 ? text : null; };
  const fillOf = layers.find((s) => s && filled(s.backgroundColor));
  const lineOf = layers.find((s) => s && parseFloat(s.borderTopWidth) > 0 && filled(s.borderTopColor));
  return { fill: fillOf ? fillOf.backgroundColor : 'transparent', line: lineOf ? lineOf.borderTopColor : null };
}
/** The choice itself, from plain colours ([r, g, b, a]): what lies behind (`ground`), the plate the control stands on at
 * rest (`plate`), its rest ink (`ink`), the look's reds in the order they are preferred, its papers and inks. */
export function chooseTone({ ground, plate, ink, reds: given = [], papers: paperTokens = [] }) {
  const seen = new Set();
  const reds = given.filter((c) => { if (!c || !(c[3] > 0)) return false; const k = c.slice(0, 3).map(Math.round).join(); if (seen.has(k)) return false; seen.add(k); return true; }).map((c) => over(c, ground));
  const papers = paperTokens.filter((c) => c && c[3] > 0).concat([plate]).map((c) => over(c, ground)).sort((a, b) => luminance(b) - luminance(a));
  let restInk = over(ink || [0, 0, 0, 1], plate);
  if (contrast(restInk, plate) < AIM.rest) restInk = pick(papers, (c) => contrast(c, plate) >= AIM.rest, (c) => contrast(c, plate));
  const red = pick(reds, (c) => contrast(c, plate) >= AIM.active, (c) => contrast(c, plate)) || restInk;
  // on the seal: the paper or ink of the look that stands furthest from it (paper on a deep red, ink on a light one)
  const inkOn = (seal) => papers.slice().sort((a, b) => contrast(b, seal) - contrast(a, seal))[0] || restInk;
  const seal = pick(reds, (c) => contrast(c, ground) >= AIM.plate && contrast(inkOn(c), c) >= AIM.active,
    (c) => Math.min(contrast(c, ground) / AIM.plate, contrast(inkOn(c), c) / AIM.active)) || red;
  const sealInk = inkOn(seal);
  // waiting: the rest ink faded toward its ground, never under the rest floor
  let waitInk = restInk;
  for (let t = 0.4; t > 0; t -= 0.05) {
    const c = [0, 1, 2].map((i) => restInk[i] * (1 - t) + plate[i] * t).concat(1);
    if (contrast(c, plate) >= AIM.rest) { waitInk = c; break; }
  }
  const whyInk = contrast(restInk, plate) >= AIM.text ? restInk : pick(papers.concat([restInk]), (c) => contrast(c, plate) >= AIM.text, (c) => contrast(c, plate));
  return { ground, plate, restInk, red, seal, sealInk, waitInk, whyInk };
}
/** The tone as the custom properties the voice controls' styles read. */
export function toneVars(t) {
  return {
    '--vt-ink': cssOf(t.restInk), '--vt-fill': t.fill, '--vt-line': t.line || `color-mix(in oklab, ${cssOf(t.restInk)} 30%, transparent)`,
    '--vt-plate': cssOf(t.plate), '--vt-red': cssOf(t.red), '--vt-seal': cssOf(t.seal), '--vt-seal-ink': cssOf(t.sealInk),
    '--vt-wait': cssOf(t.waitInk), '--vt-wait-opacity': '1', '--vt-why-ink': cssOf(t.whyInk),
    ...(t.rest ? { '--vt-rest-ink': cssOf(t.rest.ink), '--vt-rest-fill': t.rest.fill,
      '--vt-rest-line': t.rest.line || `color-mix(in oklab, ${cssOf(t.rest.ink)} 30%, transparent)` } : {}),
  };
}
/** Writes only what differs: a tone applied again with nothing changed touches no attribute. */
export function applyTone(target, t) {
  for (const [name, value] of Object.entries(toneVars(t))) if (target.style.getPropertyValue(name) !== value) target.style.setProperty(name, value);
}

/* ------------------------------------------------------------------ the look */
const RINGS ='<svg class="ear-rings" viewBox="0 0 26 30" aria-hidden="true" focusable="false"><path d="M4 9a8 8 0 0 1 0 12"/><path d="M10 5a14 14 0 0 1 0 20"/><path d="M16 1a20 20 0 0 1 0 28"/></svg>';
/** The design lead's CSS (design/ear/ear-states.html), on the app's own variables: --red, --ink, the paper white. */
export const EAR_CSS = `
.ear-mark { --ear-ink: var(--vt-ink, var(--color-bar-ink, var(--ink))); --ear-red: var(--vt-red, var(--red)); --ear-white: var(--print-white, var(--ground-0, var(--color-paper, var(--ground))));
  --ear-seal: var(--vt-seal, var(--ear-red)); --ear-seal-ink: var(--vt-seal-ink, var(--ear-white));
  position: relative; display: inline-grid; place-items: center; width: 44px; min-width: 44px; height: 44px; padding: 0; margin: 0; border: 0;
  background: transparent; color: var(--ear-ink); cursor: pointer; isolation: isolate; -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; }
.ear-mark::before { content: ''; position: absolute; inset: 7px; z-index: -1; border-radius: 3px;
  border: 1px solid var(--vt-line, color-mix(in oklab, var(--ear-ink) 30%, transparent)); background: var(--vt-fill, transparent);
  transition: background-color 120ms ease-out, border-color 120ms ease-out, box-shadow 120ms ease-out, border-radius 120ms ease-out; }
.ear-mark .ear-glyph { font: 500 16px/1 "Hiragino Mincho ProN", "Noto Serif JP", var(--serif, serif); color: var(--vt-ink, color-mix(in oklab, var(--ear-ink) 58%, transparent)); transition: color 120ms ease-out; pointer-events: none; }
.ear-mark:focus-visible { outline: 2px solid var(--ai, var(--ear-ink)); outline-offset: -4px; }
.ear-mark .ear-rings { position: absolute; left: calc(100% - 7px); top: 50%; width: 26px; height: 30px; transform: translate(2px, -50%); overflow: visible; display: none; pointer-events: none; }
.ear-mark .ear-rings path { fill: none; stroke: var(--ear-seal); stroke-width: 1.4; stroke-linecap: round; stroke-dasharray: 40; stroke-dashoffset: 0; }
.ear-mark .ear-rings path:nth-child(2) { opacity: .66; } .ear-mark .ear-rings path:nth-child(3) { opacity: .36; }
/* the one plain line beside a struck mark: under the bar, never over its controls, inside the screen with 16 px to spare
   on each side (it wraps), in the ink and on the plate the mark stands on (ear.mjs places it: --ear-why-left, -top) */
.ear-why { position: fixed; left: var(--ear-why-left, 16px); top: var(--ear-why-top, 56px); transform: none; z-index: 40; box-sizing: border-box;
  width: max-content; max-width: calc(100vw - 32px); padding: 6px 10px; border-radius: 3px; white-space: normal; overflow-wrap: anywhere;
  font: 13px/1.35 "Hiragino Sans", "Noto Sans JP", var(--sans, sans-serif); color: var(--vt-why-ink, color-mix(in oklab, var(--ear-ink, var(--ink)) 82%, transparent));
  background: var(--vt-plate, color-mix(in oklab, var(--print-white, var(--ground-0, var(--color-paper, var(--ground)))) 94%, transparent));
  box-shadow: 0 0 0 1px var(--vt-line, color-mix(in oklab, var(--ear-ink, var(--ink)) 26%, transparent)), 0 6px 14px -8px color-mix(in oklab, var(--ink) 40%, transparent); pointer-events: none; }
.ear-spot { position: absolute; width: 44px; height: 44px; }
/* where the mark stands: beside the floating gate of the first screen, and beside the gate of every bar; on a narrow
   screen on the gate's other side, where the bar's own doors (search, the language, Save) never reach */
#ginga-symbol + .ear-spot { position: fixed; top: calc(12px + env(safe-area-inset-top, 0px)); left: calc(50% + 24px); z-index: 30; }
:is(#app > .chrome, #sheet > .sheet-bar) > .bar-gate + .ear-spot { top: env(safe-area-inset-top, 0px); left: calc(50% + 22px); z-index: 1; }
:is(#app > .chrome, #sheet > .sheet-bar) > .bar-gate + .ear-spot + * { margin-left: auto; }
/* the first screen (the sky, sky/mount.mjs): the mark stands beside the floating gate and takes that gate's plate and
   ink at rest, as it takes a bar's gate's anywhere else (toneFor) */
@media (max-width: 640px) {
  #ginga-symbol + .ear-spot { left: calc(50% - 68px); }
  :is(#app > .chrome, #sheet > .sheet-bar) > .bar-gate + .ear-spot { left: calc(50% - 66px); }
  /* the mark stands on the gate's left here: its arcs open away from the gate, to the left */
  .ear-mark .ear-rings { left: auto; right: calc(100% - 7px); transform: translate(-2px, -50%) scaleX(-1); }
}
/* at rest: the neighbour's plate, line and ink wherever the neighbour draws its plate (toneFor's rest; the first screen's
   gate draws it with ::after) */
html[data-ear='off'] .ear-mark::before { border-color: var(--vt-rest-line, var(--vt-line, color-mix(in oklab, var(--ear-ink) 30%, transparent))); background: var(--vt-rest-fill, var(--vt-fill, transparent)); }
html[data-ear='off'] .ear-mark .ear-glyph { color: var(--vt-rest-ink, var(--vt-ink, color-mix(in oklab, var(--ear-ink) 58%, transparent))); }
/* armed: 朱文, a red character on paper */
html[data-ear='armed'] .ear-mark::before { border-color: var(--ear-red); background: var(--vt-fill, var(--ear-white)); box-shadow: 0 1px 0 color-mix(in oklab, var(--ink) 18%, transparent); }
html[data-ear='armed'] .ear-mark .ear-glyph { color: var(--ear-red); font-weight: 700; }
/* held on and speaking: 白文, the seal pressed */
html:is([data-ear='held'], [data-ear='speaking']) .ear-mark::before { background: var(--ear-seal); border-color: var(--ear-seal); border-radius: 2.5px 3.5px 3px 2px;
  box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--ear-seal) 70%, var(--ink)), inset 0 0 0 2.5px color-mix(in oklab, var(--ear-seal-ink) 55%, transparent), 0 1px 1px color-mix(in oklab, var(--ink) 30%, transparent);
  animation: ear-press 140ms ease-out; }
html:is([data-ear='held'], [data-ear='speaking']) .ear-mark .ear-glyph { color: var(--ear-seal-ink); font-weight: 700; }
html[data-ear='speaking'] .ear-mark .ear-rings, html[data-ear='armed'][data-ear-voice] .ear-mark .ear-rings { display: block; }
html[data-ear='speaking'] .ear-mark .ear-rings path, html[data-ear='armed'][data-ear-voice] .ear-mark .ear-rings path { animation: ear-ring 600ms ease-out infinite; }
.ear-mark .ear-rings path:nth-child(2) { animation-delay: 120ms !important; } .ear-mark .ear-rings path:nth-child(3) { animation-delay: 240ms !important; }
/* no voice: struck once, like a cancelled stamp */
html[data-ear='novoice'] .ear-mark .ear-glyph { color: var(--vt-ink, color-mix(in oklab, var(--ear-ink) 40%, transparent)); }
html[data-ear='novoice'] .ear-mark::before { border-color: var(--vt-line, color-mix(in oklab, var(--ear-ink) 26%, transparent)); }
html[data-ear='novoice'] .ear-mark::after { content: ''; position: absolute; left: 4px; right: 4px; top: 50%; height: 1.4px; background: color-mix(in oklab, var(--ear-ink) 70%, transparent); transform: rotate(-38deg); pointer-events: none; }
@keyframes ear-press { from { transform: scale(1.06); } to { transform: scale(1); } }
@keyframes ear-ring { 0% { stroke-dashoffset: 40; } 60%, 100% { stroke-dashoffset: 0; } }
/* what the page shows: the unit gets a red underline (armed), a wash along its foot (held on, speaking); nothing moves
   (the marks outrank a row's own hover background: they are the ear's, and last only as long as it points or reads) */
[data-ear-unit='armed'] { text-decoration-line: underline !important; text-decoration-color: var(--red) !important; text-decoration-thickness: 1.4px !important; text-underline-offset: 6px !important; }
[data-ear-unit='held'] { background-image: linear-gradient(transparent 62%, color-mix(in oklab, var(--red) 22%, transparent) 62%) !important; }
[data-ear-unit='speaking'] { background-image: linear-gradient(transparent 62%, color-mix(in oklab, var(--red) 34%, transparent) 62%) !important; }
/* a sentence in running text: the reader's own band painter (modules/voice-bands.mjs), one even band per line of its
   base text, in a layer of its own that takes no pointer and touches nothing in the text (the Custom Highlight API's
   text-decoration does not paint in WebKit, the engine of Safari and the iPhone): the underline just under the band
   when armed, the wash along its lower part when held on or speaking, as on an element */
.ear-bands { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 2147482000; pointer-events: none; }
.ear-band { position: absolute; display: block; pointer-events: none; }
.ear-band[data-state='armed']::after { content: ''; position: absolute; left: 0; right: 0; top: calc(100% + 1px); height: 1.4px; background: var(--red); }
.ear-band[data-state='held'] { background-image: linear-gradient(transparent 62%, color-mix(in oklab, var(--red) 22%, transparent) 62%); }
.ear-band[data-state='speaking'] { background-image: linear-gradient(transparent 62%, color-mix(in oklab, var(--red) 34%, transparent) 62%); }
/* select-then-読む */
.ear-chip { position: fixed; z-index: 2147483000; min-width: 44px; height: 32px; padding: 0 10px; border-radius: 3px; border: 1px solid var(--red);
  background: var(--print-white, var(--ground-0, var(--color-paper, var(--ground)))); color: var(--red); font: 500 15px/1 "Hiragino Mincho ProN", "Noto Serif JP", var(--serif, serif);
  box-shadow: 0 1px 0 color-mix(in oklab, var(--ink) 18%, transparent), 0 8px 18px -10px color-mix(in oklab, var(--ink) 50%, transparent); cursor: pointer; -webkit-user-select: none; user-select: none; }
@media (prefers-reduced-motion: reduce) {
  .ear-mark::before, .ear-mark .ear-glyph { transition: none; }
  html .ear-mark::before { animation: none !important; }
  html .ear-mark .ear-rings path { animation: none !important; stroke-dashoffset: 0; }
}
`;

/* ------------------------------------------------------------------ where the marks stand */
/** The gates a mark stands beside: the first screen's, and the gate of the room's bar and of a page's bar. */
export const EAR_GATES = '#ginga-symbol, :is(#app > .chrome, #sheet > .sheet-bar) > .bar-gate';
/** Where a gate stands: the first screen (sky), a page's bar (sheet) or the room's bar (bar). */
export const gateHome = (gate) => (gate.id === 'ginga-symbol' ? 'sky' : gate.parentElement?.matches?.('.sheet-bar') ? 'sheet' : 'bar');
/** The one rule for where the marks stand. `gates` are the gates now in the page; `marks` is the set of marks the ear
 * holds; `make()` makes a new one. A gate that has its mark is left as it is. A mark that left the page with its old bar
 * is given to a new gate of the same home, so a bar drawn again wears the mark its old bar had and two bars at once (a
 * room's bar under a page's) never trade marks. A mark no gate takes is let go. Plain inputs: tools/ear.test.mjs. */
export function placeMarks(gates, marks, make) {
  const spare = [];
  for (const spot of [...marks]) if (!spot.isConnected) { marks.delete(spot); spare.push(spot); }
  for (const gate of gates) {
    if (gate.nextElementSibling?.classList?.contains('ear-spot')) continue;
    const home = gateHome(gate);
    const at = spare.findIndex((spot) => spot.getAttribute('data-ear-home') === home);
    const spot = at >= 0 ? spare.splice(at, 1)[0] : make();
    spot.setAttribute('data-ear-home', home);
    marks.add(spot);
    gate.after(spot);
  }
}

/* ------------------------------------------------------------------ the wiring */
/** Install the ear in `doc`. `speak(unit, done)` reads a unit through the voice seam and returns its handle;
 * `cannot(unit)` names why there is no voice right now; `context()` gives { view, articleOf, keyFor } for voice keys.
 * Returns { mount, stop, machine }: mount() places a mark beside every gate (call it when the page changes). */
export function installEar({ doc, tx, speak, cannot, context = () => ({}), plain = null, highlight = () => true }) {
  const view = doc.defaultView;
  const root = doc.documentElement;
  if (!doc.getElementById('ear-style')) {
    const style = doc.createElement('style');
    style.id = 'ear-style';
    style.textContent = EAR_CSS;
    doc.head.append(style);
  }
  /* The marks on the unit, without moving it: an element takes an attribute its own CSS dresses (background and
   * text-decoration, which paint in every engine); a sentence of running text gets bands painted along its lines in a
   * layer of their own (an underline when armed, a wash along the foot when held on or speaking). */
  const bands = createBands(doc, { layerClass: 'ear-bands', bandClass: 'ear-band', attributes: { 'data-ear-own': '' } });
  let shown = null; // { unit, state, marked, range }
  const clearShown = () => {
    if (!shown) return;
    if (shown.marked?.isConnected) shown.marked.removeAttribute('data-ear-unit');
    if (shown.range) bands.hide();
    shown = null;
  };
  /** "Highlight what is being read" (Settings, 筆と声; the card audio's switch, 2026-11-11): off, the ear draws nothing
   * on text, armed, held on or speaking; its mark still shows its state (the combine's I1). */
  const lit = () => { try { return highlight() !== false; } catch { return true; } };
  function showUnit(unit, state) {
    if (unit && state && !lit()) { clearShown(); return; }
    if (shown && shown.unit?.key === unit?.key && shown.state === state) return;
    clearShown();
    if (!unit || !state) return;
    shown = { unit, state, marked: null, range: null };
    // a word a surface draws is lit by that surface itself (the sky wakes the word under the pointer)
    if (unit.kind === 'drawn') return;
    if (unit.kind === 'sentence' && unit.range) {
      try {
        const range = doc.createRange();
        range.setStart(unit.range.startNode, unit.range.startOffset);
        range.setEnd(unit.range.endNode, unit.range.endOffset);
        shown.range = range;
        // the painter follows the sentence when the page scrolls or the window changes size
        const parent = (node) => (node.nodeType === 3 ? node.parentElement : node);
        bands.show(() => (range.startContainer.isConnected ? rangeBoxes(range) : []), state,
          () => [parent(range.startContainer), parent(range.endContainer), parent(range.commonAncestorContainer), doc.body]);
        return;
      } catch { /* the page changed under it */ }
    }
    const marked = unit.element;
    if (marked?.isConnected) { marked.setAttribute('data-ear-unit', state); shown.marked = marked; }
  }

  const ctx = () => {
    let given = {};
    try { given = context() || {}; } catch { /* no context */ }
    return given;
  };
  const find = (x, y, through = true, pointer = 'mouse') => { try { return unitAt(doc, x, y, { through, pointer, context: ctx() }); } catch { return null; } };
  let speakingUnit = null;
  let hoverUnit = null;
  let askedLast = null;
  let chipEl = null; // the 読む chip (made below)
  const machine = createEarMachine({
    speak: (unit, done) => {
      speakingUnit = unit;
      return speak(unit, (outcome, reason) => { if (speakingUnit === unit) speakingUnit = null; done(outcome, reason); });
    },
    // every read starts here: the unit last asked for is where a line that names no voice belongs, when it is not under
    // a mark (asked by 読む, or where no mark is shown: a study card)
    cannot: (unit) => { askedLast = unit; return cannot(unit); },
    schedule: (fn, ms) => view.setTimeout(fn, ms),
    cancel: (timer) => view.clearTimeout(timer),
    onChange: () => paint(),
  });

  /* the mark */
  const setAttr = (el, name, value) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
  const setVar = (el, name, value) => { if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value); };
  const marks = new Set();
  function makeMark() {
    const spot = doc.createElement('span');
    spot.className = 'ear-spot';
    spot.setAttribute('data-ear-own', '');
    const mark = doc.createElement('button');
    mark.type = 'button';
    mark.className = 'ear-mark';
    mark.setAttribute('data-ear-own', '');
    mark.innerHTML = `<span class="ear-glyph" lang="ja" aria-hidden="true">耳</span>${RINGS}`;
    const why = doc.createElement('span');
    why.className = 'ear-why';
    why.setAttribute('role', 'status');
    why.setAttribute('data-ear-own', '');
    why.hidden = true;
    spot.append(mark, why);
    let timer = 0, held = false;
    mark.addEventListener('pointerdown', (event) => {
      if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      held = false;
      view.clearTimeout(timer);
      timer = view.setTimeout(() => { held = true; machine.holdEar(); }, LONG_PRESS_MS);
    });
    // a pointer or touch press leaves no focus on the mark, so Space and Enter go on doing what they did before it (the
    // card audio's rule for its controls; the combine's I8); a keyboard user who tabbed to it keeps it
    mark.addEventListener('mousedown', (event) => event.preventDefault());
    const end = () => view.clearTimeout(timer);
    mark.addEventListener('pointerup', end);
    mark.addEventListener('pointercancel', end);
    mark.addEventListener('pointerleave', end);
    mark.addEventListener('contextmenu', (event) => { event.preventDefault(); view.clearTimeout(timer); if (!held) { held = true; machine.holdEar(); } });
    mark.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.detail && doc.activeElement === mark) mark.blur();
      if (held) { held = false; return; }
      // the keyboard's way to hold it on: Shift with Enter or Space
      if (event.detail === 0 && event.shiftKey) { machine.holdEar(); return; }
      machine.tapEar();
    });
    marks.add(spot);
    paintMark(spot);
    return spot;
  }
  function paintMark(spot) {
    const state = machine.display();
    const mark = spot.firstElementChild, why = spot.lastElementChild;
    const label = earLabel(state, machine.reason(), tx);
    // only what differs is written: a mark painted again with nothing changed touches no node, attribute or text (each
    // write under body is a reason for the voice layer to look at the page again)
    setAttr(mark, 'aria-label', label);
    setAttr(mark, 'title', state === 'off' ? tx(...VOICE_EAR_HELP) : label);
    // struck by a read 読む asked for, the line stands by the chip instead (lineElsewhere); the mark still shows it is struck
    const struck = state === 'novoice' && !lineElsewhere(), line = struck ? noVoiceLine(machine.reason(), tx, plain) : '';
    if (why.textContent !== line) why.textContent = line;
    if (why.hidden === struck) why.hidden = !struck;
    // its colours, from the gate beside it and the ground it stands on (toneFor), each time it is drawn
    if (spot.isConnected && spot.getClientRects().length) {
      try { applyTone(spot, toneFor(mark, { neighbour: spot.previousElementSibling })); } catch { /* the styles' own fallbacks stand */ }
      if (!why.hidden) placeWhy(spot, why);
    }
  }
  /** Below `y`, past any bar held at the top right under it (a reading page's thread of places is sticky under the top
   * bar on a phone): the struck line never stands over a bar's controls. */
  function belowBars(x, y) {
    for (let step = 0; step < 4; step += 1) {
      let bar = null;
      for (const hit of doc.elementsFromPoint(x, Math.min(view.innerHeight - 1, y + 2))) {
        if (hit.closest('.ear-why')) continue;
        for (let at = hit; at && at !== doc.body && !bar; at = at.parentElement) {
          const pos = view.getComputedStyle(at).position, b = at.getBoundingClientRect();
          if ((pos === 'sticky' || pos === 'fixed') && b.top <= y + 2 && b.bottom > y + 2 && b.height <= 120) bar = b;
        }
        break;
      }
      if (!bar) return y;
      y = bar.bottom;
    }
    return y;
  }
  /** The struck mark's line: under the mark and below the bars under it (clear of their controls), inside the screen with
   * 16 px on each side, wrapped to that width. */
  function placeWhy(spot, why) {
    const r = spot.getBoundingClientRect(), side = 16, room = view.innerWidth - 2 * side;
    const x = Math.max(side, Math.min(view.innerWidth - side - 1, r.left + r.width / 2));
    // its width does not hang on where it stands (as wide as its words, at most the screen less 16 px a side)
    const width = Math.min(room, why.getBoundingClientRect().width || room);
    setVar(why, '--ear-why-top', `${Math.round(belowBars(x, r.bottom) + 6)}px`);
    setVar(why, '--ear-why-left', `${Math.round(Math.max(side, Math.min(r.left, view.innerWidth - side - width)))}px`);
  }
  /** A mark beside the first screen's gate and beside the gate of every bar, put there in the same turn as the gate.
   * The app draws a room's bar again several times while the room loads; the new bar takes the mark its old bar had,
   * with the colours and the state it wore, so the mark never leaves a bar that is on screen (the voice layer calls
   * this at each change to the page; the painting waits for mount). The rule itself is placeMarks, above. */
  function place() { placeMarks(doc.querySelectorAll(EAR_GATES), marks, makeMark); }
  /** The marks in their places, and each one that shows painted for where it now stands. */
  function mount() {
    place();
    // the ear is never left on where its mark is not shown (the review card and the deck card keep their own look, with
    // no mark): a screen without one turns it off, silently
    if (machine.mode() !== 'off' && ![...marks].some((spot) => spot.isConnected && spot.getClientRects().length)) machine.rest();
    // a mark on a screen that has just come up takes the colours of where it now stands
    for (const spot of marks) if (spot.isConnected && spot.getClientRects().length) paintMark(spot);
  }
  /** A read that found no voice says why where it was asked for (rule 6): under its mark, or, for 読む, beside the chip;
   * and where no mark is shown (a study card), beside the text it was asked for. */
  const markShown = () => [...marks].some((spot) => spot.isConnected && spot.getClientRects().length);
  const lineElsewhere = () => machine.display() === 'novoice' && (askedLast?.kind === 'selection' || !markShown());
  let loneWhy = null;
  function paintLoneLine(state) {
    const anchor = askedLast?.kind === 'selection' && chipEl && !chipEl.hidden && chipEl.isConnected ? chipEl
      : askedLast?.element?.isConnected ? askedLast.element : null;
    const line = state === 'novoice' && lineElsewhere() && anchor ? noVoiceLine(machine.reason(), tx, plain) : '';
    if (!line && !loneWhy) return;
    if (!loneWhy) {
      loneWhy = doc.createElement('span');
      loneWhy.className = 'ear-why';
      loneWhy.setAttribute('role', 'status');
      loneWhy.setAttribute('data-ear-own', '');
    }
    if (line && !loneWhy.isConnected) doc.body.append(loneWhy);
    if (loneWhy.textContent !== line) loneWhy.textContent = line;
    if (loneWhy.hidden === !!line) loneWhy.hidden = !line;
    if (!line) return;
    // under what was asked for, inside the screen with 16 px on each side, as the mark's own line stands
    const r = anchor.getBoundingClientRect(), side = 16;
    const width = Math.min(view.innerWidth - 2 * side, loneWhy.getBoundingClientRect().width || view.innerWidth);
    const below = r.bottom + 6 + 40 <= view.innerHeight ? r.bottom + 6 : Math.max(side, r.top - 46);
    setVar(loneWhy, '--ear-why-top', `${Math.round(below)}px`);
    setVar(loneWhy, '--ear-why-left', `${Math.round(Math.max(side, Math.min(r.left, view.innerWidth - side - width)))}px`);
  }
  function paint() {
    const state = machine.display();
    if (root.dataset.ear !== state) root.dataset.ear = state;
    const voiced = !!machine.voice();
    if (voiced !== ('earVoice' in root.dataset)) { if (voiced) root.dataset.earVoice = ''; else delete root.dataset.earVoice; }
    for (const spot of marks) if (spot.isConnected) paintMark(spot);
    paintLoneLine(state);
    // the unit: the one being read carries the wash; otherwise the one under the Mac's pointer shows what a tap would read
    if (speakingUnit && machine.voice()) showUnit(speakingUnit, 'speaking');
    else if (hoverUnit && (state === 'armed' || state === 'held')) showUnit(hoverUnit, state);
    else showUnit(null, null);
  }

  /* the page */
  let press = null;
  view.addEventListener('pointerdown', (event) => {
    if (event.isPrimary === false) return;
    press = { id: event.pointerId, at: Date.now(), x: event.clientX, y: event.clientY, pointerType: event.pointerType || 'mouse' };
  }, true);
  view.addEventListener('pointercancel', (event) => { if (press && press.id === event.pointerId) press = null; }, true);
  const shownDisplay = (el) => view.getComputedStyle(el).display;
  // One pick for one tap: what a surface asking as the finger lifts (takes, below) was told stands under the finger,
  // word or nothing, is what the click a moment later acts on, though the words drift between the two (the sky's
  // field moves every frame; the re-check's fr2, Q2)
  const verdictOf = (event, dry) => {
    const tap = press;
    return earClick(event, {
      machine, press, now: Date.now(), dry,
      controlAt: (target) => appControlAt(target, { display: shownDisplay }),
      unitAt: (e) => {
        if (!dry && tap?.lifted) return tap.lifted.unit;
        const unit = !e.clientX && !e.clientY ? findUnit(e.target, { display: shownDisplay, context: ctx() })
          : find(e.clientX, e.clientY, true, press?.pointerType || e.pointerType || 'mouse');
        if (dry && tap && e.type === 'pointerup' && e.pointerId === tap.id) tap.lifted = { unit };
        return unit;
      },
    });
  };
  view.addEventListener('click', (event) => {
    const verdict = verdictOf(event, false);
    press = null;
    if (verdict === 'consume') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  // A surface that acts as the finger lifts, before the click (the old first screen: its word unfolds, its first cue is
  // retired in his record; the new sky, sky/mount.mjs: its word opens), asks here first: true means the tap is the
  // ear's, and the surface does nothing with it. With the ear off and no Option key this answers false at once.
  view.__BUNKI_EAR = Object.freeze({ takes: (event) => { try { return verdictOf(event, true) === 'consume'; } catch { return false; } } });
  // Escape: on the window, before any of the app's own Escape (a sheet's Back, the word box, the save strip), so that
  // while the ear speaks one press stops it and does nothing else
  view.addEventListener('keydown', (event) => {
    if (earKey(event, { machine }) === 'consume') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  let frame = 0, last = null;
  view.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const state = machine.display();
    if (state !== 'armed' && state !== 'held' && !(state === 'speaking' && machine.mode() === 'held')) { if (hoverUnit) { hoverUnit = null; paint(); } return; }
    last = { x: event.clientX, y: event.clientY };
    if (frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      const unit = last ? find(last.x, last.y, false) : null;
      // held on, what the learner wrote and a card's front show no wash under a resting pointer: not read from there; a
      // closed card face shows nothing in any state (the ear reads nothing there)
      hoverUnit = unit?.closed || ((unit?.typed || unit?.front) && machine.mode() === 'held') ? null : unit;
      machine.hover({ unit: unit?.closed ? null : unit, pointer: 'mouse' });
      paint();
    });
  }, { capture: true, passive: true });
  root.addEventListener('pointerleave', () => { hoverUnit = null; machine.hover({ unit: null, pointer: 'mouse' }); paint(); });
  view.addEventListener('blur', () => { hoverUnit = null; machine.hover({ unit: null, pointer: 'mouse' }); });

  /* select-then-読む */
  const chip = doc.createElement('button');
  chipEl = chip;
  chip.type = 'button';
  chip.className = 'ear-chip';
  chip.setAttribute('data-ear-own', '');
  chip.setAttribute('lang', 'ja');
  chip.textContent = '読む';
  chip.hidden = true;
  let picked = null; // { text, node }
  chip.addEventListener('pointerdown', (event) => event.preventDefault());
  chip.addEventListener('mousedown', (event) => event.preventDefault());
  chip.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    // a card turned to its question side under the selection since the chip was offered: nothing is read there
    if (!picked || selectionClosed(picked.range, ctx())) { hideChip(); return; }
    const sentences = speakable(picked.text);
    if (!sentences.length) return;
    const context_ = ctx();
    const anchor = picked.node?.nodeType === 3 ? picked.node.parentNode : picked.node;
    const voiceKey = keyOf({ node: anchor, word: null, paragraph: picked.text }, context_);
    machine.speakNow({ kind: 'selection', element: anchor, text: picked.text, sentences, voiceKey, key: `sel:${picked.text}`, contains: () => false });
  });
  let chipTimer = 0;
  const hideChip = () => { chip.hidden = true; picked = null; };
  doc.addEventListener('selectionchange', () => {
    view.clearTimeout(chipTimer);
    chipTimer = view.setTimeout(() => {
      const selection = view.getSelection?.();
      if (!selection || selection.isCollapsed || !selection.rangeCount) { hideChip(); return; }
      const range = selection.getRangeAt(0);
      let text = '';
      try { text = rangeText(range); } catch { text = selection.toString(); }
      const node = range.commonAncestorContainer;
      const element = node?.nodeType === 3 ? node.parentNode : node;
      // a selection that lies in, starts in, ends in or spans a card's question face: no chip (the only voice there is the
      // card's own control)
      if (!hasJapanese(text) || !element || element.closest?.('[data-ear-own], input, textarea, select, [contenteditable=""], [contenteditable="true"]') || selectionClosed(range, ctx())) { hideChip(); return; }
      const boxes = [...range.getClientRects()].filter((box) => box.width || box.height);
      const box = boxes[boxes.length - 1] || range.getBoundingClientRect();
      if (!chip.isConnected) doc.body.append(chip);
      picked = { text, node, range };
      chip.setAttribute('aria-label', tx(...VOICE_WORDS.selection));
      chip.title = tx(...VOICE_WORDS.selection);
      chip.hidden = false;
      const width = chip.offsetWidth || 48, height = chip.offsetHeight || 32;
      const left = Math.max(8, Math.min(view.innerWidth - width - 8, box.right + 6));
      let top = box.bottom + 8;
      if (top + height > view.innerHeight - 8) top = Math.max(8, box.top - height - 8);
      chip.style.left = `${Math.round(left)}px`;
      chip.style.top = `${Math.round(top)}px`;
    }, 120);
  });
  view.addEventListener('scroll', () => { if (!chip.hidden) hideChip(); }, { capture: true, passive: true });

  mount();
  paint();
  // a look chosen, or the print look turned on or off: every mark takes its colours again
  try { new view.MutationObserver(() => paint()).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-live-depth', 'data-bunki-sky'] }); } catch { /* no observer: the marks keep the colours they had */ }
  return {
    machine,
    mount,
    place,
    /** The page was drawn again: the light on a sentence is measured again. */
    refresh: () => { if (bands.shown) bands.refresh(); },
    /** The highlight switch changed: what the ear draws on text is drawn again by the switch's rule. */
    repaint: () => paint(),
    stop: () => machine.stop(),
    /** The unit under a point: what a tap there would speak (the coverage walk asks this). */
    unitAt: (x, y) => find(x, y),
  };
}

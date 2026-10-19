/** Hfix-2b · KH1-3 — when a gloss is cut mid-word, and how to cut one honestly.
 *
 * The old extractor cut every gloss at exactly 32 characters, wherever that landed: 482 of the
 * 6,687 drift rows sit on that boundary, and most of them end inside a word ("…to confi",
 * "…filled with emotio"). A naive "32 characters means clipped" rule cannot be the test, because
 * eight of those rows are whole by coincidence — "government office, public office" is exactly 32
 * characters and perfectly correct, and truncating it again with an ellipsis would be a new bug.
 *
 * So the test asks what a reader asks: does this end on a real word? The vocabulary is built from
 * the corpus's own short glosses, which the 32-character cut never touched, so the oracle is
 * deterministic, lives in the repo, and needs no network or system dictionary.
 */

/** The legacy extractor's hard boundary. Only rows at the cap are suspect. */
export const CLIP_CAP = 32;

/** Words a one- or two-letter tail may legitimately be; anything else that short is a fragment. */
const SHORT_WORDS = new Set(['a', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'i', 'if', 'in', 'is', 'it',
  'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we', 'am', 'ox', 'pm', 'tv', 'us']);

const tokens = (text) => String(text || '').toLowerCase().match(/[a-z][a-z'-]*/gu) || [];

/** The corpus's own words, and every proper prefix of them.
 *
 * The last token of a capped row is the only token the cut can have damaged, so it is withheld
 * from the word set; every other token in the corpus is evidence of a real word. The prefix set
 * is what makes the judgement decisive: "surpr" is not a word the corpus uses, but it IS a proper
 * prefix of "surprise", so it is a fragment. "swoop" is not a word here either, but nothing longer
 * begins with it, so "…with a single swoop" is left alone. */
export function buildVocabulary(...sources) {
  const words = new Set(SHORT_WORDS);
  for (const rows of sources) {
    for (const gloss of rows) {
      const text = String(gloss || '');
      if (!text) continue;
      const list = tokens(text);
      // only the final token of a row sitting on the cap can be a fragment
      if (text.length >= CLIP_CAP) list.pop();
      for (const word of list) words.add(word);
    }
  }
  const prefixes = new Set();
  for (const word of words) for (let n = 3; n < word.length; n += 1) prefixes.add(word.slice(0, n));
  return { words, prefixes };
}

/** The oracle in force. The tools set it from the repo's own data before judging anything. */
let shared = null;
export function useVocabulary(oracle) { shared = oracle; return shared; }

/** Does this gloss stop in the middle of something?
 *
 * Two independent kinds of evidence, and the distinction matters:
 *
 *  · STRUCTURAL — a trailing space, a dangling separator, or a parenthesis opened and never
 *    closed. These are wrong at any length ("above (up, top" is 14 characters and still cut),
 *    so they are judged on every gloss.
 *
 *  · FRAGMENT — the last word is not a word. This is judged ONLY on glosses of exactly
 *    CLIP_CAP characters, because that is the only length the old extractor could produce.
 *    Applying it more widely was measurably wrong: it called "…to be restored; to heal" and
 *    "pros and cons" clipped, since "heal" and "cons" are proper prefixes of other corpus
 *    words. Those glosses are complete and longer than the cap, so the cut never touched them. */
export function looksClipped(text, oracle = shared) {
  const s = String(text ?? '');
  if (!s) return false;
  // structural, at any length
  if (/[\s([]$/u.test(s)) return true;
  if ((s.match(/\(/gu) || []).length > (s.match(/\)/gu) || []).length) return true;
  if (/[,;]$/u.test(s)) return true;
  // fragment, only where the extractor's cut can have landed
  if (s.length !== CLIP_CAP) return false;
  const last = tokens(s).at(-1);
  if (!last) return false;
  if (last.length <= 2) return !SHORT_WORDS.has(last);
  if (!oracle) return false;
  if (oracle.words.has(last)) return false;
  return oracle.prefixes.has(last);
}

/** Cut at a sense boundary when one fits, else at a word boundary, and say that it was cut with
 * "…". Never returns something ending mid-word, and never invents a word.
 *
 * A gloss already whole is returned untouched whatever its length: the ellipsis is a statement
 * that something was removed, so it is never added to a complete sentence. */
export function tidyGloss(text, oracle = shared) {
  const s = String(text ?? '').trim().replace(/\s+/gu, ' ');
  if (!s) return '';
  if (!looksClipped(s, oracle)) return s;
  const trim = (v) => v.replace(/[\s,;([]+$/u, '');
  /** Keep `head` if it stands on its own, marking that something was removed. */
  const keep = (head) => (head && !looksClipped(head, oracle) ? `${head}…` : null);

  // 1 · the cut left only a dangling separator or space. What precedes it is already whole,
  //     so keep ALL of it: "to point," is "to point…", never "to…".
  const trimmed = trim(s);
  const whole = keep(trimmed);
  if (whole) return whole;

  // 2 · the cut fell inside a parenthetical. Drop from the unmatched opener.
  let depth = 0, opener = -1;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '(') { if (depth === 0) opener = i; depth += 1; }
    else if (s[i] === ')') depth = Math.max(0, depth - 1);
  }
  if (depth > 0 && opener > 0) {
    const outside = keep(trim(s.slice(0, opener)));
    if (outside) return outside;
  }

  // 3 · fall back to sense boundaries, then to whole words
  for (const sep of ['; ', ', ']) {
    if (!s.includes(sep)) continue;
    const parts = s.split(sep);
    while (parts.length > 1) {
      parts.pop();
      const head = keep(trim(parts.join(sep)));
      if (head) return head;
    }
  }
  const words = trimmed.split(' ');
  while (words.length > 1) {
    words.pop();
    const head = keep(trim(words.join(' ')));
    if (head) return head;
  }
  return '';
}

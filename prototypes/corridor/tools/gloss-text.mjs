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
 *    so they are judged on every gloss. A final ';' counts unless it closes a complete entity
 *    reference (a sentence ending "…&amp;" is whole), and a cut that lands inside an entity
 *    leaves an unterminated tail, judged at the cap by strict entity-name prefix.
 *
 *  · FRAGMENT — the last word is not a word. This is judged ONLY on glosses of exactly
 *    CLIP_CAP characters, because that is the only length the old extractor could produce.
 *    Applying it more widely was measurably wrong: it called "…to be restored; to heal" and
 *    "pros and cons" clipped, since "heal" and "cons" are proper prefixes of other corpus
 *    words. Those glosses are complete and longer than the cap, so the cut never touched them. */
/** The standard HTML4 entity names, for the unterminated-entity fragment test below. */
const ENTITY_NAMES = ('amp lt gt quot apos nbsp ensp emsp thinsp zwnj zwj lrm rlm ndash mdash lsquo rsquo sbquo ldquo rdquo bdquo dagger Dagger permil prime Prime lsaquo rsaquo oline frasl euro'
  + ' alfa alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho Sigma Tau Upsilon Phi Chi Psi Omega'
  + ' forall part exist empty nabla isin notin ni prod sum minus lowast radic prop infin ang and or cap cup int there4 sim cong asymp ne equiv le ge sup sub nsup sube supe oplus otimes perp sdot lceil rceil lfloor rfloor lang rang loz spades clubs hearts diams'
  + ' cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup1 sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
  + ' OElig oelig Scaron scaron Yuml fnof circ tilde'
  + ' hellip trade alefsym image real weierp rarr larr uarr darr harr crarr lArr uArr rArr dArr hArr cong approx'
  + ' ominus sdote vprop ngt nles nges NotEqual misraq PlusMinus'
).split(' ');

/** Is `text`, as the extractor's clip left it, ending mid-word? Structural signs count at any
 * length; a tail fragment counts only at the cap the old extractor cut to. */
export function looksClipped(text, oracle = shared) {
  const s = String(text ?? '');
  if (!s) return false;
  // structural, at any length
  if (/[\s([]$/u.test(s)) return true;
  if ((s.match(/\(/gu) || []).length > (s.match(/\)/gu) || []).length) return true;
  if (/[,]$/u.test(s)) return true;
  // a gloss ending in ';' reads as a mid-list cut — unless that ';' closes a complete entity
  // reference (…&amp; is a whole sentence, not a clipped one; W2's at-cap ampersand control)
  if (/;$/u.test(s)) return !/&(?:#[0-9]{1,6}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,7});$/iu.test(s);
  // a cut that lands inside an HTML entity leaves an unterminated tail: at the cap only, '&'
  // followed by two or more letters that strictly begin a known entity name AND are not a real
  // word ("to&nbsp;&nbs" is a fragment; yes&no, and&or, or&not are not — "no", "or", "not" are
  // words, "&nbs" is not). The corpus's own vocabulary decides, never a guessed list.
  if (s.length === CLIP_CAP) {
    const tail = /&([A-Za-z]{2,8})$/.exec(s)?.[1];
    if (tail && !(oracle && oracle.words.has(tail.toLowerCase()))
      && ENTITY_NAMES.some((name) => name.length > tail.length && name.startsWith(tail))) return true;
  }
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

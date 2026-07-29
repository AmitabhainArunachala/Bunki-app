/**
 * Romaji → kana, so a learner can type `bunki` and find 分岐.
 *
 * ## Why this is not optional for a dictionary that stands alone
 *
 * Frozen §10 judges this build against renzo and 類義漢字, and the round-2
 * research's Migaku finding is about not breaking flow. Before this module the
 * only ways into the dictionary were a Japanese IME and an English gloss. A
 * learner who has heard a word, or read it in romaji, or is on a machine with no
 * Japanese input, could not look it up at all — which is not a ranking problem,
 * it is a locked door.
 *
 * ## What it is, precisely
 *
 * A **wāpuro** (word-processor) romaji transliterator: the input convention
 * every Japanese IME accepts, which is a superset of Hepburn. It converts to
 * hiragana and to nothing else. It makes no claim to be a romanisation
 * *standard* and never renders romaji back to the learner — it exists to turn a
 * query into candidate kana, and the kana is then matched by the same exact and
 * substring rules every other query uses.
 *
 * ## What it deliberately does not do
 *
 * **It does not guess.** A string that is not romaji converts to itself and
 * matches nothing new; there is no fuzzy fallback that would make `bunki` find
 * 分割 because they share a letter. A wrong match in a dictionary is worse than
 * a miss, because a miss is visibly a miss.
 *
 * **It does not produce katakana.** Every headword in the imported tier has
 * `hasKanji`, and readings in both JMdict and KANJIDIC2's `kun` field are
 * hiragana. A katakana pass would be dead code today and is better added with
 * the katakana entries it would serve (open item: the corpus filters them out).
 *
 * **It does not touch the dataset.** Nothing here is stored; the conversion runs
 * on the query only, which is one string per keystroke.
 */

/**
 * Longest-match first. The order of this table is load-bearing: `kya` must be
 * tried before `ka`, `shi` before `sh`, `tsu` before `tu`.
 *
 * Both Hepburn and Kunrei/wāpuro spellings are present for the sounds where they
 * differ (`shi`/`si`, `chi`/`ti`, `tsu`/`tu`, `fu`/`hu`, `ji`/`zi`), because a
 * learner types whichever one they learned and an IME accepts both.
 */
const ROMAJI_TO_KANA: readonly (readonly [string, string])[] = [
  // Three-letter digraphs first.
  ['kya', 'きゃ'],
  ['kyu', 'きゅ'],
  ['kyo', 'きょ'],
  ['gya', 'ぎゃ'],
  ['gyu', 'ぎゅ'],
  ['gyo', 'ぎょ'],
  ['sha', 'しゃ'],
  ['shu', 'しゅ'],
  ['sho', 'しょ'],
  ['shi', 'し'],
  ['sya', 'しゃ'],
  ['syu', 'しゅ'],
  ['syo', 'しょ'],
  ['ja', 'じゃ'],
  ['ju', 'じゅ'],
  ['jo', 'じょ'],
  ['ji', 'じ'],
  ['jya', 'じゃ'],
  ['jyu', 'じゅ'],
  ['jyo', 'じょ'],
  ['zya', 'じゃ'],
  ['zyu', 'じゅ'],
  ['zyo', 'じょ'],
  ['cha', 'ちゃ'],
  ['chu', 'ちゅ'],
  ['cho', 'ちょ'],
  ['chi', 'ち'],
  ['tya', 'ちゃ'],
  ['tyu', 'ちゅ'],
  ['tyo', 'ちょ'],
  ['tsu', 'つ'],
  ['tu', 'つ'],
  ['nya', 'にゃ'],
  ['nyu', 'にゅ'],
  ['nyo', 'にょ'],
  ['hya', 'ひゃ'],
  ['hyu', 'ひゅ'],
  ['hyo', 'ひょ'],
  ['bya', 'びゃ'],
  ['byu', 'びゅ'],
  ['byo', 'びょ'],
  ['pya', 'ぴゃ'],
  ['pyu', 'ぴゅ'],
  ['pyo', 'ぴょ'],
  ['mya', 'みゃ'],
  ['myu', 'みゅ'],
  ['myo', 'みょ'],
  ['rya', 'りゃ'],
  ['ryu', 'りゅ'],
  ['ryo', 'りょ'],
  ['dzu', 'づ'],
  ['dya', 'ぢゃ'],
  ['dyu', 'ぢゅ'],
  ['dyo', 'ぢょ'],
  ['fu', 'ふ'],
  ['hu', 'ふ'],
  ['ka', 'か'],
  ['ki', 'き'],
  ['ku', 'く'],
  ['ke', 'け'],
  ['ko', 'こ'],
  ['ga', 'が'],
  ['gi', 'ぎ'],
  ['gu', 'ぐ'],
  ['ge', 'げ'],
  ['go', 'ご'],
  ['sa', 'さ'],
  ['si', 'し'],
  ['su', 'す'],
  ['se', 'せ'],
  ['so', 'そ'],
  ['za', 'ざ'],
  ['zi', 'じ'],
  ['zu', 'ず'],
  ['ze', 'ぜ'],
  ['zo', 'ぞ'],
  ['ta', 'た'],
  ['ti', 'ち'],
  ['te', 'て'],
  ['to', 'と'],
  ['da', 'だ'],
  ['di', 'ぢ'],
  ['du', 'づ'],
  ['de', 'で'],
  ['do', 'ど'],
  ['na', 'な'],
  ['ni', 'に'],
  ['nu', 'ぬ'],
  ['ne', 'ね'],
  ['no', 'の'],
  ['ha', 'は'],
  ['hi', 'ひ'],
  ['he', 'へ'],
  ['ho', 'ほ'],
  ['ba', 'ば'],
  ['bi', 'び'],
  ['bu', 'ぶ'],
  ['be', 'べ'],
  ['bo', 'ぼ'],
  ['pa', 'ぱ'],
  ['pi', 'ぴ'],
  ['pu', 'ぷ'],
  ['pe', 'ぺ'],
  ['po', 'ぽ'],
  ['ma', 'ま'],
  ['mi', 'み'],
  ['mu', 'む'],
  ['me', 'め'],
  ['mo', 'も'],
  ['ya', 'や'],
  ['yu', 'ゆ'],
  ['yo', 'よ'],
  ['ra', 'ら'],
  ['ri', 'り'],
  ['ru', 'る'],
  ['re', 'れ'],
  ['ro', 'ろ'],
  ['wa', 'わ'],
  ['wo', 'を'],
  ['wi', 'ゐ'],
  ['we', 'ゑ'],
  ['va', 'ゔぁ'],
  ['vi', 'ゔぃ'],
  ['vu', 'ゔ'],
  ['ve', 'ゔぇ'],
  ['vo', 'ゔぉ'],
  ['a', 'あ'],
  ['i', 'い'],
  ['u', 'う'],
  ['e', 'え'],
  ['o', 'お'],
];

const SOKUON_CONSONANTS = 'kgsztdnhbpmyrwjfcv';
const LATIN_LETTER = /^[a-z]$/;

/**
 * Is this string entirely ASCII letters (plus `-`)?
 *
 * The gate on the whole feature. A query with a kana or a kanji in it is not a
 * romaji query, and running the converter over it would mangle a mixed query
 * like `分ki` into something neither half matches.
 */
export function looksLikeRomaji(query: string): boolean {
  return query.length > 0 && /^[a-z-]+$/i.test(query);
}

/**
 * Convert wāpuro romaji to hiragana.
 *
 * Total: an unconvertible character is emitted unchanged rather than dropped, so
 * the caller can always tell whether the conversion actually did anything by
 * comparing input and output.
 *
 * Three rules beyond the table:
 *
 *   - **`nn` and a terminal `n`** become ん. A medial `n` before a consonant is
 *     also ん (`bunki` → ぶんき), which is the rule that makes the common case
 *     work at all; before a vowel or `y` it stays part of the next mora
 *     (`nya` → にゃ, `nani` → なに).
 *   - **A doubled consonant** becomes っ plus the mora (`kitte` → きって).
 *   - **A trailing lone consonant** is kept as-is, because a learner typing
 *     `bunk` mid-word should still match ぶんき by prefix on the next keystroke
 *     rather than have the fragment silently disappear.
 */
export function romajiToKana(input: string): string {
  const source = input.toLocaleLowerCase('en-US');
  let out = '';
  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);

    /*
      ん, in the four shapes an IME has to tell apart.

      The awkward one is `nn` before a vowel or `y`: `konnyaku` is こんにゃく,
      not こんやく, because the ん comes from the *first* n and the second one
      begins にゃ. Consuming both — the obvious implementation — silently loses a
      mora on every word of that shape. `honn`, where the second n begins
      nothing, is the case that does consume both.
    */
    if (rest[0] === 'n') {
      const next = rest[1];
      const beginsAMora = (character: string | undefined): boolean =>
        character !== undefined && 'aiueoy'.includes(character);

      if (next === 'n') {
        out += 'ん';
        index += beginsAMora(rest[2]) ? 1 : 2;
        continue;
      }
      if (!beginsAMora(next)) {
        out += 'ん';
        index += 1;
        continue;
      }
    }

    // っ: a doubled consonant, except `nn`, which is handled above.
    const first = rest[0];
    if (
      first !== undefined &&
      first === rest[1] &&
      first !== 'n' &&
      SOKUON_CONSONANTS.includes(first)
    ) {
      out += 'っ';
      index += 1;
      continue;
    }

    const match = ROMAJI_TO_KANA.find(([romaji]) => rest.startsWith(romaji));
    if (match !== undefined) {
      out += match[1];
      index += match[0].length;
      continue;
    }

    // Unconvertible: a trailing consonant a learner is mid-way through typing,
    // a hyphen, anything else. Emitted verbatim; see this function's header.
    out += first ?? '';
    index += 1;
  }

  return out;
}

/**
 * The kana a romaji query should also be searched as, or `null`.
 *
 * `null` for anything that is not romaji, and for a conversion that produced
 * nothing but Latin letters back — that is the case where the converter had
 * nothing to say and searching for the same string twice would only cost time.
 */
export function kanaQueryFor(query: string): string | null {
  const trimmed = query.trim();
  if (!looksLikeRomaji(trimmed)) return null;
  const kana = romajiToKana(trimmed);
  if (kana === trimmed) return null;
  if ([...kana].every((character) => LATIN_LETTER.test(character))) return null;
  return kana;
}

/**
 * Kana → romaji, for comparing a *mistyped* romaji query against a reading.
 *
 * ## Why this direction is needed at all
 *
 * {@link romajiToKana} handles a correctly typed query. It cannot handle a
 * mistyped one, and the reason is structural rather than a missing case: `jikna`
 * — `jikan` with two letters swapped, the commonest typing error there is —
 * converts to `じkな`, because `kn` is not a mora and the `k` survives as a
 * literal. Edit distance between `じkな` and `じかん` is 2, and it is 2 for
 * reasons that have nothing to do with how close the learner was.
 *
 * Comparing in the *other* direction fixes it: `じかん` renders as `jikan`, and
 * `jikna` is one transposition away from that. So the readings are romanised
 * once and the raw Latin query is compared to them.
 *
 * It is never rendered to the learner. Bunki shows Japanese; this exists to be
 * compared against, which is why a single spelling per sound is enough and no
 * romanisation standard is claimed.
 */
const KANA_TO_ROMAJI: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  // First spelling wins, and the table is Hepburn-first, so `し` maps to `shi`
  // rather than to `si`. Either would compare correctly against a query typed
  // the other way — one edit — but a consistent choice keeps the distances
  // stable between two readings that share a mora.
  for (const [romaji, kana] of ROMAJI_TO_KANA) {
    if (!map.has(kana)) map.set(kana, romaji);
  }
  return map;
})();

/** The longest kana key, so the scan knows how far to look ahead. */
const LONGEST_KANA = [...KANA_TO_ROMAJI.keys()].reduce(
  (longest, key) => Math.max(longest, [...key].length),
  1,
);

export function kanaToRomaji(input: string): string {
  const characters = [...input];
  let out = '';
  let index = 0;

  while (index < characters.length) {
    const character = characters[index] ?? '';

    if (character === 'ん') {
      out += 'n';
      index += 1;
      continue;
    }
    if (character === 'っ') {
      // Doubles the consonant that follows, which is what a learner types.
      // A trailing っ has nothing to double and is dropped rather than guessed.
      const next = characters.slice(index + 1, index + 1 + LONGEST_KANA).join('');
      const following = romajiForKanaAt(next);
      out += following === null ? '' : following.romaji.slice(0, 1);
      index += 1;
      continue;
    }

    const window = characters.slice(index, index + LONGEST_KANA).join('');
    const match = romajiForKanaAt(window);
    if (match === null) {
      // Not kana — a kanji in a reading field, punctuation. Kept verbatim so the
      // comparison degrades to "no match" rather than to a wrong one.
      out += character;
      index += 1;
      continue;
    }
    out += match.romaji;
    index += match.consumed;
  }

  return out;
}

/** Longest kana prefix of `window` that has a romanisation. */
function romajiForKanaAt(window: string): { romaji: string; consumed: number } | null {
  const characters = [...window];
  for (let length = Math.min(LONGEST_KANA, characters.length); length >= 1; length -= 1) {
    const candidate = characters.slice(0, length).join('');
    const romaji = KANA_TO_ROMAJI.get(candidate);
    if (romaji !== undefined) return { romaji, consumed: length };
  }
  return null;
}

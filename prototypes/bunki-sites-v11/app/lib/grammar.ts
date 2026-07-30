export interface GrammarPattern {
  readonly id: string;
  readonly pattern: string;
  readonly level: "N5" | "N4" | "N3" | "N2" | "N1";
  readonly meaning: string;
  readonly formation: string;
  readonly example: string;
  readonly translation: string;
  readonly cues: readonly string[];
  readonly register?: string;
  readonly contrast?: string;
  readonly pitfall?: string;
}

const BASE_GRAMMAR_PATTERNS: readonly GrammarPattern[] = [
  {
    id: "n5-teiru",
    pattern: "〜ている",
    level: "N5",
    meaning: "an ongoing action or continuing state",
    formation: "verb て-form + いる",
    example: "毎朝、日本語のラジオを聞いている。",
    translation: "I listen to Japanese radio every morning.",
    cues: ["ている", "ています", "でいる", "でいます"],
  },
  {
    id: "n5-tai",
    pattern: "〜たい",
    level: "N5",
    meaning: "want to do",
    formation: "verb stem + たい",
    example: "この表現を会話で使ってみたい。",
    translation: "I want to try using this expression in conversation.",
    cues: ["たい", "たくない", "たかった"],
  },
  {
    id: "n4-nagara",
    pattern: "〜ながら",
    level: "N4",
    meaning: "while doing; at the same time",
    formation: "verb stem + ながら",
    example: "歩きながら長い動画を聞いた。",
    translation: "I listened to a long video while walking.",
    cues: ["ながら"],
  },
  {
    id: "n4-you-ni-naru",
    pattern: "〜ようになる",
    level: "N4",
    meaning: "come to be able to; reach a new state",
    formation: "plain verb + ようになる",
    example: "同じ表現に再会すると、自然に使えるようになる。",
    translation: "When you meet the same expression again, you become able to use it naturally.",
    cues: ["ようになる", "ようになった", "ようになり"],
  },
  {
    id: "n4-teiku",
    pattern: "〜ていく",
    level: "N4",
    meaning: "continue or change from now onward",
    formation: "verb て-form + いく",
    example: "出会った言葉から、学びの道が分岐していく。",
    translation: "The learning path branches outward from the words you encounter.",
    cues: ["ていく", "でいく", "ていき", "でいき"],
  },
  {
    id: "n3-koto-de",
    pattern: "〜ことで",
    level: "N3",
    meaning: "by doing; through the fact that",
    formation: "plain verb + ことで",
    example: "文脈ごと復習することで、言葉が使える知識になる。",
    translation: "By reviewing the whole context, words become usable knowledge.",
    cues: ["ことで"],
  },
  {
    id: "n3-dewa-naku",
    pattern: "〜ではなく",
    level: "N3",
    meaning: "not A, but B",
    formation: "noun / な-adjective + ではなく",
    example: "学びは単語の一覧ではなく、生きたつながりだ。",
    translation: "Learning is not a list of words, but a living web of connections.",
    cues: ["ではなく", "じゃなく"],
  },
  {
    id: "n3-you-ni",
    pattern: "〜ように",
    level: "N3",
    meaning: "so that; in such a way that",
    formation: "plain verb + ように",
    example: "忘れても戻れるように、元の文脈を残しておく。",
    translation: "I preserve the original context so I can return even if I forget.",
    cues: ["ように"],
  },
  {
    id: "n3-wake-dewa-nai",
    pattern: "〜わけではない",
    level: "N3",
    meaning: "it does not mean that; not necessarily",
    formation: "plain form + わけではない",
    example: "一度理解したからといって、使えるわけではない。",
    translation: "Understanding it once does not necessarily mean you can use it.",
    cues: ["わけではない", "わけじゃない"],
  },
  {
    id: "n3-ni-tsurete",
    pattern: "〜につれて",
    level: "N3",
    meaning: "as one thing changes, another changes with it",
    formation: "noun / plain verb + につれて",
    example: "理解が深まるにつれて、気づくニュアンスも増える。",
    translation: "As understanding deepens, the nuances you notice also increase.",
    cues: ["につれて"],
  },
  {
    id: "n3-koto-ni-naru",
    pattern: "〜ことになる",
    level: "N3",
    meaning: "it is decided or comes about that",
    formation: "plain verb + ことになる",
    example: "今日の会話も、明日の復習に戻ってくることになる。",
    translation: "Today's conversation will also come back in tomorrow's review.",
    cues: ["ことになる", "ことになった", "ことになり"],
  },
  {
    id: "n2-ni-oujite",
    pattern: "〜に応じて",
    level: "N2",
    meaning: "according to; in response to",
    formation: "noun + に応じて",
    example: "理解度に応じて、次に読む素材を変える。",
    translation: "Change the next material according to your comprehension.",
    cues: ["に応じて", "に応じた"],
  },
  {
    id: "n2-ue-de",
    pattern: "〜上で",
    level: "N2",
    meaning: "after doing; in the process of",
    formation: "past verb / noun の + 上で",
    example: "原文を理解した上で、別の文脈へ移す。",
    translation: "After understanding the original, move it into another context.",
    cues: ["上で", "うえで"],
  },
  {
    id: "n2-koto-naku",
    pattern: "〜ことなく",
    level: "N2",
    meaning: "without doing",
    formation: "dictionary-form verb + ことなく",
    example: "元の出典を失うことなく、文をカードに変える。",
    translation: "Turn the sentence into a card without losing its original source.",
    cues: ["ことなく"],
  },
  {
    id: "n2-mono-no",
    pattern: "〜ものの",
    level: "N2",
    meaning: "although; even though",
    formation: "plain form + ものの",
    example: "六割は理解したものの、知らない表現がまだ多かった。",
    translation: "Although I understood sixty percent, there were still many unknown expressions.",
    cues: ["ものの"],
  },
  {
    id: "n2-zaru-o-enai",
    pattern: "〜ざるを得ない",
    level: "N2",
    meaning: "cannot avoid doing; have no choice but to",
    formation: "negative verb stem + ざるを得ない",
    example: "文脈がなければ、訳だけに頼らざるを得ない。",
    translation: "Without context, you have no choice but to rely only on translation.",
    cues: ["ざるを得ない"],
  },
  {
    id: "n2-ni-suginai",
    pattern: "〜にすぎない",
    level: "N2",
    meaning: "nothing more than; merely",
    formation: "noun / plain form + にすぎない",
    example: "試験の級は、現在地を示す一つの目印にすぎない。",
    translation: "A test level is merely one marker showing your present position.",
    cues: ["にすぎない", "に過ぎない"],
  },
  {
    id: "n2-dokoroka",
    pattern: "〜どころか",
    level: "N2",
    meaning: "far from; not only not A, but B",
    formation: "noun / plain form + どころか",
    example: "忘れるどころか、別の文脈でも自然に使えた。",
    translation: "Far from forgetting it, I could use it naturally in another context.",
    cues: ["どころか"],
  },
  {
    id: "n1-ni-itaru-made",
    pattern: "〜に至るまで",
    level: "N1",
    meaning: "all the way to; even reaching",
    formation: "noun + に至るまで",
    example: "単語から話し方の癖に至るまで、素材の痕跡を残す。",
    translation: "Preserve traces of the material, from its words all the way to its speaking habits.",
    cues: ["に至るまで", "にいたるまで"],
  },
  {
    id: "n1-o-kawakiri-ni",
    pattern: "〜を皮切りに",
    level: "N1",
    meaning: "starting with; using as the beginning",
    formation: "noun + を皮切りに",
    example: "一つの動画を皮切りに、関連する一次資料へ広げていく。",
    translation: "Starting with one video, branch out into related primary sources.",
    cues: ["を皮切りに"],
  },
  {
    id: "n1-made-mo-nai",
    pattern: "〜までもない",
    level: "N1",
    meaning: "there is no need to; it goes without saying",
    formation: "dictionary-form verb + までもない",
    example: "すべてを暗記するまでもない。必要な糸だけを育てればいい。",
    translation: "There is no need to memorize everything; grow only the threads you need.",
    cues: ["までもない"],
  },
  {
    id: "n1-tari-tomo",
    pattern: "〜たりとも",
    level: "N1",
    meaning: "not even one; not for even",
    formation: "counter expression + たりとも",
    example: "出典の一行たりとも、勝手に自分の記憶として扱わない。",
    translation: "Do not treat even one line of a source as your own content without permission.",
    cues: ["たりとも"],
  },
  {
    id: "n1-zu-niwa-okanai",
    pattern: "〜ずにはおかない",
    level: "N1",
    meaning: "cannot help but cause; will inevitably",
    formation: "negative verb stem + ずにはおかない",
    example: "本物の物語は、学ぶ人の心を動かさずにはおかない。",
    translation: "A genuine story inevitably moves the learner's heart.",
    cues: ["ずにはおかない"],
  },
  {
    id: "n1-o-kinji-enai",
    pattern: "〜を禁じ得ない",
    level: "N1",
    meaning: "cannot suppress a feeling",
    formation: "emotion noun + を禁じ得ない",
    example: "再び自然に聞き取れた瞬間、喜びを禁じ得なかった。",
    translation: "At the moment I could understand it naturally again, I could not suppress my joy.",
    cues: ["を禁じ得ない", "を禁じえない"],
  },
] as const;

const EXPANDED_GRAMMAR_PATTERNS: readonly GrammarPattern[] = [
  {
    id: "n5-kara",
    pattern: "〜から",
    level: "N5",
    meaning: "because; since",
    formation: "plain form + から",
    example: "今日は時間があるから、少し復習します。",
    translation: "Because I have time today, I will review a little.",
    cues: ["から、", "から。"],
    register: "neutral; common in conversation",
    contrast: "ので is often softer and more explanatory.",
  },
  {
    id: "n5-koto-ga-dekiru",
    pattern: "〜ことができる",
    level: "N5",
    meaning: "can do; be able to",
    formation: "dictionary-form verb + ことができる",
    example: "このアプリで記事を読むことができる。",
    translation: "You can read articles with this app.",
    cues: ["ことができる", "ことができます", "ことができない"],
    contrast: "Potential verb forms are usually shorter in conversation.",
  },
  {
    id: "n5-tari-tari",
    pattern: "〜たり〜たりする",
    level: "N5",
    meaning: "do such things as A and B",
    formation: "past-form verb + り",
    example: "動画を見たり、記事を読んだりします。",
    translation: "I do things like watch videos and read articles.",
    cues: ["たり", "だり"],
    pitfall: "One たり alone can be valid, but two examples make the pattern clearer.",
  },
  {
    id: "n5-mae-ni",
    pattern: "〜前に",
    level: "N5",
    meaning: "before doing",
    formation: "dictionary-form verb + 前に",
    example: "寝る前に、五分だけ復習する。",
    translation: "Before sleeping, I review for just five minutes.",
    cues: ["前に"],
  },
  {
    id: "n5-ato-de",
    pattern: "〜後で",
    level: "N5",
    meaning: "after doing; later",
    formation: "past-form verb + 後で",
    example: "散歩した後で、保存した動画を確認する。",
    translation: "After my walk, I check the videos I saved.",
    cues: ["後で", "あとで"],
  },
  {
    id: "n4-sou-da-appearance",
    pattern: "〜そうだ",
    level: "N4",
    meaning: "looks as if; seems likely",
    formation: "verb stem / adjective stem + そうだ",
    example: "この文章は少し難しそうだ。",
    translation: "This text looks a little difficult.",
    cues: ["そうだ", "そうです", "そうな"],
    contrast: "Plain-form + そうだ can instead report hearsay.",
  },
  {
    id: "n4-te-miru",
    pattern: "〜てみる",
    level: "N4",
    meaning: "try doing",
    formation: "verb て-form + みる",
    example: "新しい表現を会話で使ってみる。",
    translation: "I will try using the new expression in conversation.",
    cues: ["てみる", "でみる", "てみた", "でみた"],
  },
  {
    id: "n4-shi",
    pattern: "〜し",
    level: "N4",
    meaning: "and; moreover; giving one or more reasons",
    formation: "plain form + し",
    example: "内容も面白いし、話し方も自然だ。",
    translation: "The content is interesting, and the way of speaking is natural too.",
    cues: ["し、", "し。"],
    pitfall: "The particle し has other uses; detection is only a hint.",
  },
  {
    id: "n4-nakereba-naranai",
    pattern: "〜なければならない",
    level: "N4",
    meaning: "must do",
    formation: "negative conditional + ならない",
    example: "全部を覚えなければならないわけではない。",
    translation: "It is not the case that you must remember everything.",
    cues: ["なければならない", "なければなりません"],
    contrast: "なくてもいい means it is not necessary.",
  },
  {
    id: "n4-kamoshirenai",
    pattern: "〜かもしれない",
    level: "N4",
    meaning: "might; perhaps",
    formation: "plain form + かもしれない",
    example: "この言葉は次の動画にも出てくるかもしれない。",
    translation: "This word might appear in the next video too.",
    cues: ["かもしれない", "かもしれません"],
  },
  {
    id: "n3-tame-ni",
    pattern: "〜ために",
    level: "N3",
    meaning: "in order to; because of",
    formation: "plain form / noun の + ために",
    example: "自然に話せるようになるために、文ごと覚える。",
    translation: "I learn whole sentences in order to speak naturally.",
    cues: ["ために"],
    pitfall: "The same form can express purpose or cause; read the clause relationship.",
  },
  {
    id: "n3-hazu-da",
    pattern: "〜はずだ",
    level: "N3",
    meaning: "should be; expected to be",
    formation: "plain form + はずだ",
    example: "一度保存したから、資料は残っているはずだ。",
    translation: "Since I saved it, the source should still be there.",
    cues: ["はずだ", "はずです", "はずがない"],
  },
  {
    id: "n3-bakari",
    pattern: "〜ばかり",
    level: "N3",
    meaning: "only; just did; keep doing",
    formation: "noun / verb form + ばかり",
    example: "辞書を引いてばかりでは、会話の流れが止まってしまう。",
    translation: "If you do nothing but consult the dictionary, the conversation flow stops.",
    cues: ["ばかり"],
    pitfall: "Meaning changes with the preceding verb form.",
  },
  {
    id: "n3-ni-chigai-nai",
    pattern: "〜に違いない",
    level: "N3",
    meaning: "must surely be",
    formation: "plain form + に違いない",
    example: "何度も現れるなら、重要な表現に違いない。",
    translation: "If it appears repeatedly, it must be an important expression.",
    cues: ["に違いない"],
    register: "strong inference",
  },
  {
    id: "n3-sae",
    pattern: "〜さえ",
    level: "N3",
    meaning: "even; if only",
    formation: "noun / particle + さえ",
    example: "URLさえ保存すれば、後で内容を取り込める。",
    translation: "If you save even just the URL, you can ingest the content later.",
    cues: ["さえ"],
  },
  {
    id: "n2-wake-da",
    pattern: "〜わけだ",
    level: "N2",
    meaning: "no wonder; it follows that",
    formation: "plain form + わけだ",
    example: "毎日耳にしているのだから、覚えているわけだ。",
    translation: "Since I hear it every day, no wonder I remember it.",
    cues: ["わけだ", "わけです"],
    contrast: "わけではない denies a general conclusion.",
  },
  {
    id: "n2-ni-kagiru",
    pattern: "〜に限る",
    level: "N2",
    meaning: "nothing beats; is best",
    formation: "noun / dictionary-form verb + に限る",
    example: "疲れた日は、短い復習に限る。",
    translation: "On a tiring day, nothing beats a short review.",
    cues: ["に限る", "にかぎる"],
  },
  {
    id: "n2-kagiri",
    pattern: "〜限り",
    level: "N2",
    meaning: "as long as; to the extent that",
    formation: "plain form / noun である + 限り",
    example: "学び続ける限り、知らない言葉には出会う。",
    translation: "As long as you keep learning, you will encounter unknown words.",
    cues: ["限り", "かぎり"],
  },
  {
    id: "n2-ni-tsuki",
    pattern: "〜につき",
    level: "N2",
    meaning: "due to; per",
    formation: "noun + につき",
    example: "調整中につき、この機能は現在使えません。",
    translation: "This feature is currently unavailable due to maintenance.",
    cues: ["につき"],
    register: "formal notices; also means per unit",
  },
  {
    id: "n2-kara-to-itte",
    pattern: "〜からといって",
    level: "N2",
    meaning: "just because",
    formation: "plain form + からといって",
    example: "一度正解したからといって、使えるとは限らない。",
    translation: "Just because you answered correctly once does not mean you can use it.",
    cues: ["からといって", "からと言って"],
  },
  {
    id: "n1-ni-hoka-naranai",
    pattern: "〜にほかならない",
    level: "N1",
    meaning: "nothing other than; precisely",
    formation: "noun + にほかならない",
    example: "この変化は、毎日の積み重ねの結果にほかならない。",
    translation: "This change is nothing other than the result of daily accumulation.",
    cues: ["にほかならない", "に他ならない"],
    register: "formal and emphatic",
  },
  {
    id: "n1-to-aimatte",
    pattern: "〜と相まって",
    level: "N1",
    meaning: "combined with; coupled with",
    formation: "noun + と相まって",
    example: "内容の面白さが話者の声と相まって、記憶に残った。",
    translation: "The interesting content, combined with the speaker’s voice, stayed in my memory.",
    cues: ["と相まって", "とあいまって"],
    register: "formal written language",
  },
  {
    id: "n1-nari",
    pattern: "〜なり",
    level: "N1",
    meaning: "as soon as; in one’s own way",
    formation: "dictionary-form verb / noun + なり",
    example: "家に帰るなり、保存した表現を確認した。",
    translation: "As soon as I returned home, I checked the expressions I had saved.",
    cues: ["るなり", "たなり"],
    pitfall: "Several distinct constructions use なり.",
  },
  {
    id: "n1-katagawa",
    pattern: "〜かたわら",
    level: "N1",
    meaning: "while also; alongside one’s main activity",
    formation: "dictionary-form verb / noun の + かたわら",
    example: "仕事をするかたわら、日本語の研究を続けている。",
    translation: "Alongside my work, I continue researching Japanese.",
    cues: ["かたわら", "傍ら"],
    register: "written; sustained parallel activities",
  },
  {
    id: "n1-wo-yoso-ni",
    pattern: "〜をよそに",
    level: "N1",
    meaning: "heedless of; ignoring",
    formation: "noun + をよそに",
    example: "周囲の心配をよそに、彼は一人で歩き続けた。",
    translation: "Ignoring the concern around him, he continued walking alone.",
    cues: ["をよそに"],
    register: "written narrative",
  },
] as const;

export const GRAMMAR_PATTERNS: readonly GrammarPattern[] = [
  ...BASE_GRAMMAR_PATTERNS,
  ...EXPANDED_GRAMMAR_PATTERNS,
];

const normalize = (value: string): string => value.trim().toLocaleLowerCase("en");

export function searchGrammar(query: string, limit = 8): readonly GrammarPattern[] {
  const needle = normalize(query);
  if (needle === "") return [];
  return GRAMMAR_PATTERNS.filter((item) =>
    [item.pattern, item.level, item.meaning, item.formation, item.example]
      .map(normalize)
      .some((value) => value.includes(needle)),
  ).slice(0, limit);
}

export interface GrammarTextMatch {
  readonly pattern: GrammarPattern;
  readonly cue: string;
  readonly start: number;
  readonly end: number;
}

const GRAMMAR_MINING_SAFE_IDS = new Set([
  "n5-teiru",
  "n5-mae-ni",
  "n4-you-ni-naru",
  "n4-teiku",
  "n3-koto-de",
  "n3-dewa-naku",
  "n3-wake-dewa-nai",
  "n3-koto-ni-naru",
  "n2-ni-oujite",
  "n2-ue-de",
  "n2-koto-naku",
  "n2-zaru-o-enai",
  "n2-ni-suginai",
  "n2-dokoroka",
  "n1-ni-itaru-made",
  "n1-o-kawakiri-ni",
  "n1-made-mo-nai",
  "n1-tari-tomo",
  "n1-zu-niwa-okanai",
  "n1-o-kinji-enai",
  "n5-koto-ga-dekiru",
  "n4-te-miru",
  "n4-nakereba-naranai",
  "n4-kamoshirenai",
  "n3-hazu-da",
  "n3-ni-chigai-nai",
  "n2-kara-to-itte",
  "n1-ni-hoka-naranai",
  "n1-to-aimatte",
  "n1-wo-yoso-ni",
]);

export function isGrammarMatchSafeToMine(match: GrammarTextMatch): boolean {
  return GRAMMAR_MINING_SAFE_IDS.has(match.pattern.id);
}

function cueFitsContext(
  pattern: GrammarPattern,
  text: string,
  cue: string,
  start: number,
): boolean {
  const before = text.slice(Math.max(0, start - 32), start);
  const after = text.slice(start + cue.length, start + cue.length + 12);
  if (pattern.id === "n2-ue-de") {
    return (
      /(?:した|いた|った|えた|んだ|された|できた|理解した|確認した)$/u.test(
        before,
      ) ||
      /(?:検討|理解|確認|合意|準備|判断|協議|承知|計画|調査|分析|選択|決定|使用|利用)の$/u.test(
        before,
      )
    );
  }
  if (pattern.id === "n5-mae-ni")
    return /(?:する|[うくぐすつぬぶむる])$/u.test(before);
  if (pattern.id === "n4-sou-da-appearance")
    return !/[うくぐすつぬぶむるだ]$/u.test(before);
  if (pattern.id === "n2-kagiri")
    return /(?:ない|である|[うくぐすつぬぶむるいな])$/u.test(before);
  if (pattern.id === "n3-you-ni")
    return !/^(?:なる|なった|なり)/u.test(after);
  return true;
}

export function grammarMatchesInText(
  text: string,
): readonly GrammarTextMatch[] {
  const matches: GrammarTextMatch[] = [];
  for (const pattern of GRAMMAR_PATTERNS) {
    let accepted: GrammarTextMatch | null = null;
    for (const cue of pattern.cues) {
      let from = 0;
      while (from <= text.length - cue.length) {
        const start = text.indexOf(cue, from);
        if (start < 0) break;
        if (cueFitsContext(pattern, text, cue, start)) {
          const candidate = {
            pattern,
            cue,
            start,
            end: start + cue.length,
          };
          if (accepted === null || candidate.start < accepted.start)
            accepted = candidate;
        }
        from = start + Math.max(1, cue.length);
      }
    }
    if (accepted !== null) matches.push(accepted);
  }
  return matches;
}

export function grammarInText(text: string): readonly GrammarPattern[] {
  return grammarMatchesInText(text).map((match) => match.pattern);
}

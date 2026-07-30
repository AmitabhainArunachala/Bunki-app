import type { Level } from "./phase2-types";

export type ReadingLength = "short" | "medium" | "full";
export type ReaderWordDepth = 0 | 1 | 2 | 3 | 4;
export type ReadingLane =
  | "graded"
  | "historical"
  | "literature"
  | "essay"
  | "primary";

export interface ReadingCatalogItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly level: Exclude<Level, "zero">;
  readonly lane: ReadingLane;
  readonly sourceName: string;
  readonly url: string;
  readonly real: boolean;
  readonly generated: boolean;
  readonly rightsNote: string;
  readonly topics: readonly string[];
  readonly text: string;
}

const BUNKI_N5 = `朝、七時に起きました。窓を開けると、空は青くて、風は少し冷たかったです。私は水を飲んで、近くのパン屋へ歩きました。

パン屋には、焼きたてのパンがたくさんありました。店の人が「おはようございます」と言いました。私は「この丸いパンを一つください」と言いました。

公園のベンチでパンを食べました。鳥の声を聞きながら、今日したいことをノートに書きました。短い時間でしたが、静かな朝になりました。

家へ帰る道で、昨日は分からなかった日本語の言葉を思い出しました。意味を全部覚えてはいません。でも、パン屋でその言葉をもう一度見ました。知っている場所で言葉に再会すると、少し自分の言葉になったように感じました。`;

const BUNKI_N4 = `駅の近くに、小さな古本屋があります。入口は狭く、初めて見る人は通り過ぎてしまうかもしれません。私は雨の日に、その店へ入りました。

店の奥で、一冊の古い旅行記を見つけました。前の持ち主が、ページの端に短い言葉を書いていました。「ここへもう一度行きたい」「この景色は朝がいい」。知らない人の記憶が、本の中に残っていたのです。

私は北海道のページを開きました。海の向こうに山が見える写真がありました。説明を全部読むことはできませんでしたが、地名と季節の言葉は分かりました。分からない言葉には小さな印をつけました。

家に帰ってから調べると、同じ言葉が別の記事にも出てきました。一度だけ見た言葉はすぐ消えます。しかし、違う場所で何度も会うと、その言葉は少しずつ道になります。`;

const BUNKI_N3 = `旅先の町を歩くとき、私はできるだけ地図を見ないようにしている。もちろん、道に迷うこともある。それでも、予定どおりの道だけを歩くより、偶然見つけた店や神社のほうが長く記憶に残る。

先月、山の近くの町で古い石段を見つけた。案内板には難しい漢字が多く、最初は半分ほどしか読めなかった。そこで、すべてを調べるのではなく、何度も出てくる言葉だけを選んだ。「参詣」「境内」「霊場」という三つの言葉である。

その日の夜、私は三つの言葉を使って短い日記を書いた。翌朝には一部を忘れていたが、次の寺で同じ表現に出会ったとき、意味がすぐに戻ってきた。

学習では、分からないものを一度に全部集めたくなる。しかし、本当に必要なのは、今の自分の理解の少し外側にあるものを見つけ、別の文脈で再会することなのかもしれない。`;

const BUNKI_N2 = `山道を長く歩いていると、考えを言葉にする速度が少しずつ落ちていく。最初の一時間は予定や仕事について考えていたのに、やがて足音と風の音だけが残る。その静けさの中で、普段は一つに見えていた問題が、実はいくつもの小さな選択からできていたことに気づく。

語学の学習にも似たところがある。難しい文章を前にすると、私たちは「理解できたか、できなかったか」という一つの判断を下しがちだ。しかし実際には、話題の流れは追えていても語彙の細部が曖昧だったり、漢字は読めても筆者の態度を取り違えていたりする。

だから、読後に必要なのは点数ではなく、理解の層を分けて眺めることだ。どこまで自然に読めたのか。どの表現で速度が落ちたのか。調べた言葉を別の場面で使えるのか。そうした小さな観察が、次に読むべきものを教えてくれる。

すべての未知語を保存する必要はない。今日の自分にとって意味のある数語を選び、元の文と一緒に残す。後日、その言葉が会話や別の記事に現れたとき、記憶は単独の札ではなく、複数の経験を結ぶ糸になる。`;

const BUNKI_N1 = `生成AIが大量の文章を瞬時に作れるようになったことで、知識を「持っている」ことの意味は変わりつつある。必要な情報を検索し、要約し、別の形式に変換するだけなら、人間がすべてを暗記しておく必然性は以前より小さい。

しかし、記憶の価値が失われたわけではない。むしろ、何を疑い、どの違いに気づき、どの問いを次に立てるかという判断は、長い時間をかけて内面化された知識に支えられている。文脈を持たない情報は比較できず、比較できない情報からは精密な問いも生まれにくい。

語学学習においても同様である。辞書や翻訳がいつでも使えるからといって、語彙を身につける必要がなくなるわけではない。ある表現を複数の場面で経験し、その語感や含意を身体的な速度で取り出せるようになることで、初めて会話や読解の流れを壊さずに判断できる。

重要なのは、暗記量を競うことではなく、経験の間にどのような接続を育てるかである。記事で出会った語が会話で別の顔を見せ、会話で間違えた文法が翌日のニュースで再び現れる。その反復が意図的に設計されれば、学習履歴そのものが個人に固有の教材へと変わる。

AIの役割は、正解を無限に供給することではない。学習者の既知と未知の境界を推定し、過去の経験を忘れたころに異なる文脈で差し出し、本人が自力で意味を再構成できる条件を整えることだろう。`;

const GOKAJO = `慶応四年三月十四日、明治天皇は新しい国の基本方針として五箇条の御誓文を示した。

一、広ク会議ヲ興シ万機公論ニ決スベシ。
一、上下心ヲ一ニシテ盛ニ経綸ヲ行フベシ。
一、官武一途庶民ニ至ル迄各其志ヲ遂ケ人心ヲシテ倦マザラシメン事ヲ要ス。
一、旧来ノ陋習ヲ破リ天地ノ公道ニ基クベシ。
一、智識ヲ世界ニ求メ大ニ皇基ヲ振起スベシ。

この文書は、政治を公の議論によって進めること、身分を越えて人々が志を実現できるようにすること、古い慣習を改め、世界から知識を求めることを掲げた。原文の表記は現代日本語と異なるが、近代日本が自らをどのように語り始めたかを読むための重要な一次資料である。`;

const HOJOKI = `ゆく河の流れは絶えずして、しかも、もとの水にあらず。よどみに浮かぶうたかたは、かつ消え、かつ結びて、久しくとどまりたるためしなし。世の中にある、人と栖と、またかくのごとし。

たましきの都のうちに、棟を並べ、甍を争へる、高き、卑しき、人の住まひは、世々を経て尽きせぬものなれど、これをまことかと尋ぬれば、昔ありし家はまれなり。

或は去年焼けて今年作れり。或は大家滅びて小家となる。住む人もこれに同じ。所も変らず、人も多かれど、いにしへ見し人は、二三十人が中に、わづかに一人二人なり。朝に死に、夕べに生るるならひ、ただ水の泡にぞ似たりける。`;

const TSUREZURE = `つれづれなるままに、日暮らし、硯にむかひて、心にうつりゆくよしなし事を、そこはかとなく書きつくれば、あやしうこそものぐるほしけれ。

いでや、この世に生まれては、願はしかるべき事こそ多かめれ。御門の御位はいともかしこし。竹の園生の末葉まで、人間の種ならぬぞやんごとなき。一の人の御有様はさらなり、ただ人も、舎人など賜はるきはは、ゆゆしと見ゆ。

現代の読者にとって、語彙や文法は古い。しかし、何もすることがないまま机に向かい、心に浮かぶことを書き留めるという冒頭の姿は、時代を越えて身近に感じられる。`;

export const READING_CATALOG: readonly ReadingCatalogItem[] = [
  {
    id: "bunki-graded-n5-morning",
    title: "静かな朝",
    subtitle: "A tiny everyday story with concrete actions.",
    level: "N5",
    lane: "graded",
    sourceName: "Bunki original",
    url: "",
    real: false,
    generated: true,
    rightsNote: "Original graded text created for Bunki.",
    topics: ["daily life", "beginnings"],
    text: BUNKI_N5,
  },
  {
    id: "bunki-graded-n4-bookshop",
    title: "雨の日の古本屋",
    subtitle: "A gentle JLPT-style story about words and memory.",
    level: "N4",
    lane: "graded",
    sourceName: "Bunki original",
    url: "",
    real: false,
    generated: true,
    rightsNote: "Original graded text; not an official JLPT question.",
    topics: ["books", "travel", "memory"],
    text: BUNKI_N4,
  },
  {
    id: "bunki-graded-n3-town",
    title: "知らない町を歩く",
    subtitle: "A graded essay about sacred places and repeated encounters.",
    level: "N3",
    lane: "graded",
    sourceName: "Bunki original",
    url: "",
    real: false,
    generated: true,
    rightsNote: "Original graded text created for Bunki.",
    topics: ["walking", "temples", "learning"],
    text: BUNKI_N3,
  },
  {
    id: "bunki-essay-n2-mountain",
    title: "山を歩きながら考えたこと",
    subtitle: "Layered comprehension, walking, and the value of selective mining.",
    level: "N2",
    lane: "essay",
    sourceName: "Bunki original",
    url: "",
    real: false,
    generated: true,
    rightsNote: "Original essay created for Bunki.",
    topics: ["mountains", "learning", "attention"],
    text: BUNKI_N2,
  },
  {
    id: "bunki-essay-n1-ai",
    title: "AI時代の知識と判断",
    subtitle: "A native-speed argument about memory, judgment, and AI.",
    level: "N1",
    lane: "essay",
    sourceName: "Bunki original",
    url: "",
    real: false,
    generated: true,
    rightsNote: "Original essay created for Bunki.",
    topics: ["AI", "philosophy", "memory"],
    text: BUNKI_N1,
  },
  {
    id: "real-gokajo",
    title: "五箇条の御誓文",
    subtitle: "A foundational 1868 primary source in its historical register.",
    level: "N1",
    lane: "primary",
    sourceName: "Historical primary source",
    url: "https://www.digital.archives.go.jp/",
    real: true,
    generated: false,
    rightsNote: "Public-domain historical text.",
    topics: ["history", "politics", "Meiji"],
    text: GOKAJO,
  },
  {
    id: "real-hojoki",
    title: "方丈記 · 冒頭",
    subtitle: "Kamo no Chōmei on impermanence, homes, and flowing water.",
    level: "N1+",
    lane: "literature",
    sourceName: "鴨長明 · 1212",
    url: "https://www.aozora.gr.jp/",
    real: true,
    generated: false,
    rightsNote: "Public-domain classical Japanese.",
    topics: ["impermanence", "history", "spirituality"],
    text: HOJOKI,
  },
  {
    id: "real-tsurezure",
    title: "徒然草 · 序段",
    subtitle: "Yoshida Kenkō’s famous opening and a short reading bridge.",
    level: "N1+",
    lane: "literature",
    sourceName: "吉田兼好 · 14th century",
    url: "https://www.aozora.gr.jp/",
    real: true,
    generated: false,
    rightsNote: "Public-domain classical Japanese.",
    topics: ["literature", "attention", "spirituality"],
    text: TSUREZURE,
  },
] as const;

const lengthLimit: Readonly<Record<ReadingLength, number>> = {
  short: 520,
  medium: 1_650,
  full: Number.POSITIVE_INFINITY,
};

export function textForReadingLength(
  text: string,
  length: ReadingLength,
): string {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const limit = lengthLimit[length];
  if (normalized.length <= limit) return normalized;
  const sentences =
    normalized.match(/[^。！？\n]+[。！？]?|\n+/g)?.map((part) => part.trim()) ??
    [normalized];
  let result = "";
  for (const sentence of sentences) {
    if (sentence === "") continue;
    const separator = result === "" ? "" : "\n\n";
    if (result.length + separator.length + sentence.length > limit) break;
    result += `${separator}${sentence}`;
  }
  if (result === "") result = normalized.slice(0, limit);
  return `${result.trim()}…`;
}

export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.replace(/\s/g, "").length / 380));
}

const levelRank: Readonly<Record<Level, number>> = {
  zero: 1,
  N5: 1,
  N4: 2,
  N3: 3,
  N2: 4,
  N1: 5,
  "N1+": 6,
};

export function suggestedReadingsForLevel(
  level: Level,
  interests: readonly string[],
  limit = 3,
): readonly ReadingCatalogItem[] {
  const interestSet = new Set(
    interests.map((interest) => interest.trim().toLocaleLowerCase("en")),
  );
  const target = levelRank[level];
  return READING_CATALOG.filter((item) => item.text.trim().length >= 120)
    .map((item) => ({
      item,
      distance: Math.abs(levelRank[item.level] - target),
      interestMatches: item.topics.filter((topic) =>
        interestSet.has(topic.toLocaleLowerCase("en")),
      ).length,
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        right.interestMatches - left.interestMatches ||
        Number(right.item.real) - Number(left.item.real) ||
        left.item.title.localeCompare(right.item.title, "ja"),
    )
    .slice(0, Math.max(0, limit))
    .map(({ item }) => item);
}

export function nextReaderWordDepth(
  current: ReaderWordDepth,
  sameWord: boolean,
): ReaderWordDepth {
  if (!sameWord) return 1;
  return Math.min(4, current + 1) as ReaderWordDepth;
}

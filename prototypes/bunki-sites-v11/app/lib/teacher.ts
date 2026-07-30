import type { VocabEntry } from "./types";
import type { LearnerState } from "./types";

export interface TeacherTurn {
  readonly text: string;
  readonly branches: readonly string[];
  readonly suggestedFront: string | null;
  readonly suggestedBack: string | null;
}

const includesAny = (text: string, needles: readonly string[]): boolean =>
  needles.some((needle) => text.toLocaleLowerCase().includes(needle));

export function buildTeacherTurn(
  input: string,
  entry: VocabEntry | null,
  state: LearnerState,
): TeacherTurn {
  const recentSource = state.sources.find((source) => source.id === state.activeSourceId);
  const interests = state.profile.interests.slice(0, 2).join("・");
  const word = entry?.word ?? "この表現";
  const reading = entry?.reading ?? "";
  const meaning = entry?.meanings.slice(0, 2).join("; ") ?? "the expression in context";

  if (includesAny(input, ["nuance", "違い", "difference", "使い分け"])) {
    return {
      text: `${word}${reading === "" ? "" : `（${reading}）`}の核は「${meaning}」です。辞書的な意味だけでなく、話し手が何を前景化しているかを見ます。たとえば「${word}という考え方は、単なる分類ではなく、次の道を選ぶ瞬間を表している」のように使うと、抽象的な文脈でも自然です。\n\n今のあなたには、似た表現との対比を一つ作り、そのあと元の文脈へ戻る学び方が合います。`,
      branches: ["似た表現と比較", "もっと自然な会話例", "元の文章に戻る"],
      suggestedFront: `${word} のニュアンスを文脈から説明してください。`,
      suggestedBack: `${meaning}。辞書訳だけでなく、話し手が何を前景化するかを見る。`,
    };
  }

  if (includesAny(input, ["kanji", "漢字", "部首", "成り立ち"])) {
    const characters = entry?.containsKanji.join("・") ?? [...word].filter((c) => /\p{Script=Han}/u.test(c)).join("・");
    return {
      text: `${word}を漢字の層から見ると、中心は ${characters || "表記そのもの"} です。ただ部品を暗記するのではなく、「${word}」を見た実際の場面、読み、意味、そして次に使いたい文を一つの束として覚えます。\n\n例：${word}を使って、${interests || "あなたの関心"}について一文作ってみてください。`,
      branches: ["書き取り練習", "同じ漢字の語彙", "一文を添削"],
      suggestedFront: `${word} を漢字・読み・実際の文脈を結びつけて思い出す。`,
      suggestedBack: `${reading} — ${meaning}`,
    };
  }

  if (includesAny(input, ["grammar", "文法", "pattern", "構文"])) {
    return {
      text: `この文脈では、単語だけでなく「Aではなく、B」「〜ことで、〜へ変わっていく」のような構文を一緒に取ると再利用しやすいです。${recentSource ? `「${recentSource.title}」` : "今の文章"}から短い一文を選び、主題だけを${interests || "別の関心"}へ置き換えてみましょう。`,
      branches: ["構文を分解", "穴埋めを作る", "別の話題へ転用"],
      suggestedFront: "「〜ことで、〜へ変わっていく」を使って自分の学習について一文作る。",
      suggestedBack: "文脈を変えても構文の働きを保つ。例：再会を重ねることで、知識が感覚へ変わっていく。",
    };
  }

  return {
    text: `${word}${reading === "" ? "" : `（${reading}）`}を、今の学習の糸に結びます。\n\n1. 意味：${meaning}\n2. 文脈：${recentSource ? `「${recentSource.title}」で出会った表現として扱います。` : "最近の関心と結びつけます。"}\n3. 再使用：「${word}を理解しただけで終わらず、別の文脈で使えるところまで育てたい。」\n\n次は、ニュアンス・漢字・文法のどこへ枝分かれしても、最後にこの文へ戻れます。`,
    branches: ["ニュアンスを深める", "漢字から見る", "文法へ枝分かれ"],
    suggestedFront: `${word} を使って、自分の学びについて自然な一文を作る。`,
    suggestedBack: `${word}（${reading}）— ${meaning}`,
  };
}

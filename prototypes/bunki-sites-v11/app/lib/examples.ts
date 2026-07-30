import type { VocabEntry } from "./types";

const PRACTICE_FRAMES = [
  (word: string) => `「${word}」という言葉を、今日の文脈でもう一度使ってみた。`,
  (word: string) => `「${word}」の意味は分かったが、自然に使えるかはまだ確信がない。`,
  (word: string) => `動画の中で「${word}」が出てきたとき、話の流れから意味を推測した。`,
  (word: string) => `次に「${word}」と出会ったら、訳を見る前に場面を思い出したい。`,
  (word: string) => `先生に「${word}」のニュアンスを、似た表現と比べて説明してもらった。`,
  (word: string) => `記事で見た「${word}」を、今度は自分の会話の中で使ってみる。`,
  (word: string) => `「${word}」を単独で覚えるのではなく、前後の文と一緒に残した。`,
  (word: string) => `知らなかった「${word}」が、別の資料にも現れて急につながった。`,
  (word: string) => `「${word}」を含む一文を声に出すと、読み方まで思い出しやすい。`,
  (word: string) => `今日の復習では、「${word}」を使って短い意見を一つ述べた。`,
  (word: string) => `「${word}」の漢字を見ると、最初に出会った文章が戻ってくる。`,
  (word: string) => `同じ「${word}」でも、話し手と場面が変わると響き方が違う。`,
] as const;

function hash(value: string): number {
  return [...value].reduce((total, character) => total + (character.codePointAt(0) ?? 0), 0);
}

export const PRACTICE_VARIANTS_PER_ENTRY = PRACTICE_FRAMES.length;

export function practiceExamples(entry: VocabEntry, count = 3): readonly string[] {
  const start = hash(entry.id) % PRACTICE_FRAMES.length;
  return Array.from(
    { length: Math.min(count, PRACTICE_FRAMES.length) },
    (_, index) => PRACTICE_FRAMES[(start + index) % PRACTICE_FRAMES.length](entry.word),
  );
}

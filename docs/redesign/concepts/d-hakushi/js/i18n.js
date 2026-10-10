// One active interface language. EN: zero Japanese chrome. JA: zero English chrome.
// Learned Japanese (words, passages, titles of Japanese sources) is content, never chrome.
export const LANG = (new URLSearchParams(location.search).get('lang') === 'ja') ? 'ja' : 'en';

const S = {
  today: ['Today', '今日'], read: ['Read', '読む'], learn: ['Learn', '学ぶ'], words: ['Words', '辞書'], me: ['Me', '私'],
  nav: ['Rooms', '部屋'],
  wotd: ['Word of the day', '今日の一語'],
  strokes: ['strokes', '画'],
  todaysLine: ["Today's line", '今日の路線'],
  stops: (n, m) => [`${n} stops · ${m} min`, `${n}駅・約${m}分`],
  cards: ['Cards', 'カード'], due: ['due', '件'], new: ['new', '新規'],
  dueN: n => [`${n} due`, `復習 ${n}`], newN: n => [`${n} new`, `新規 ${n}`],
  min: n => [`${n} min`, `${n}分`],
  walk: ['Walk the web', '語の網をたどる'],
  begin: n => [`Begin · ${n} cards`, `始める・${n}枚`],
  stopNow: ['Now', 'いま'], stopNext: ['Then', '次'], stopLast: ['Last', '最後'],
  sharedPart: ['Shared part', '共通の部品'], inDeckKanji: n => [`in ${n} deck kanji`, `デッキ内 ${n}字`],
  // read
  storiesN: n => [`${n} stories`, `${n}本`], allLevels: ['All levels', 'すべての級'],
  chars: n => [`${n} chars`, `${n}字`], deckWords: n => [`${n} of your words`, `既習語 ${n}`],
  essay: ['Essay', '随筆'], fiction: ['Fiction', '小説'],
  todaysPick: ["Today's pick", '今日の一本'],
  back: ['Back', '戻る'], backShelf: ['Back to the shelf', '棚へ戻る'],
  listen: ['Listen', '聴く'], pause: ['Pause', '止める'], voice: ['Voice · Kore', '声・Kore'],
  para: ['Paragraph', '段落'],
  // slip
  keep: ['Keep', '覚える'], kept: ['Kept', '覚えた'], openWeb: ['Open in Words', '辞書で開く'],
  close: ['Close', '閉じる'],
  inArticle: n => [`${n}× in this article`, `この記事に${n}回`],
  inPassages: n => [`${n} passages in your decks`, `デッキの文章に${n}件`],
  pos: { noun: ['noun', '名詞'], verb: ['verb', '動詞'], expression: ['expression', '表現'], adjective: ['adjective', '形容詞'], adverb: ['adverb', '副詞'] },
  // learn
  cardsDue: ['cards due', '枚が待っています'], start: n => [`Start · ${n} cards`, `始める・${n}枚`],
  focus: ['Focus sitting', '集中の座'], focusBody: n => [`family · ${n} kanji`, `の一族・${n}字`],
  tests: ['Tests', '試験'], mock: ['JLPT N1 mock', 'JLPT N1 模試'], short: ['Short', '短'], half: ['Half', '半'], full: ['Full', '本番'],
  guided: ['Guided', '案内'], guidedTitle: ['One sentence, understood more deeply', '一つの文を、もう少し深く'],
  questions: n => [`${n} questions`, `${n}問`],
  sec: ['Section', '部'],
  deck: { n1: ['N1', 'N1'], n2: ['N2', 'N2'], senmon: ['Fields', '専門'] },
  reveal: ['Reveal', '答えを見る'], showEn: ['Show English', '英語を見る'], hideEn: ['Hide English', '英語を隠す'],
  again: ['Again', '再'], hard: ['Hard', '難'], good: ['Good', '良'], easy: ['Easy', '易'],
  cardOf: (a, b) => [`${a} / ${b}`, `${a} / ${b}`],
  frontNote: ['Front · no readings', '表・読みなし'],
  anatomy: ['Anatomy', '字の解剖'], sharedBoth: ['In both kanji', '両方の字に'],
  cardId: ['card', 'カード'],
  // words
  search: ['Search words, kanji, readings', '語・漢字・読みで探す'],
  path: ['Path', '道筋'],
  kanji: ['Kanji', '漢字'], parts: ['Parts', '部品'], siblings: ['Family', '同族'], passages: ['Passages', '文章'],
  grammar: ['Grammar', '文法'], culture: ['Culture', '文化'],
  usedIn: n => [`in ${n} words`, `${n}語に`], inKanji: n => [`in ${n} kanji`, `${n}字に`],
  wordsWith: ['Words with this kanji', 'この字を含む語'], kanjiWith: ['Kanji built on this part', 'この部品を含む漢字'],
  seenIn: ['Seen in', '出てくる文章'], entry: ['Entry', '項目'],
  noResults: ['No match in your decks', 'デッキに見つかりません'],
  kanjiParts: (k, p) => [`${k} kanji · ${p} parts`, `${k}字・部品${p}`],
  reading: ['reading', '読み'],
  part: ['part', '部品'], word: ['word', '語'], meaning: ['meaning', '意味'],
  // me
  sinceDays: (d, n) => [`Since ${d} · ${n} days`, `${d}から・${n}日`],
  yourYear: ['Your year', 'あなたの一年'],
  daysRead: n => [`${n} days practised`, `稽古した日 ${n}`], recoveredDays: n => [`${n} days a lost word came back`, `失った語が戻った日 ${n}`],
  horizons: ['Four horizons', '四つの地平'],
  hN1: ['JLPT N1 · deck words held', 'JLPT N1・保持した語'],
  hFields: ['Your fields · words held', '専門分野・保持した語'],
  hKanji: ['Kanken 1 · kanji met', '漢検1級・出会った漢字'],
  hRead: ['Reading · characters read unaided', '読書・自力で読んだ字数'],
  of: n => [`of ${n}`, `/ ${n}`],
  gold: ['Mended in gold', '金継ぎ'], goldNote: ['Lost, then won back', '一度忘れ、取り戻した語'],
  lapsed: d => [`lapsed ${d}`, `${d} 忘却`], back2: d => [`held ${d}`, `${d} 回復`],
  nextDoor: ['Next', '次へ'], nextBody: (n, w) => [`${n} cards wait · tomorrow opens on ${w}`, `${n}枚・明日は「${w}」から`],
  settings: ['Settings', '設定'], language: ['Language', '言語'], light: ['Light', '明かり'], day: ['Day', '昼'], night: ['Night', '夜'],
  months: [['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']],
  wd: [['SUN','MON','TUE','WED','THU','FRI','SAT'], ['日','月','火','水','木','金','土']],
};

export function t(key, ...args) {
  let v = key.split('.').reduce((o, k) => o?.[k], S);
  if (typeof v === 'function') v = v(...args);
  if (!Array.isArray(v)) throw new Error('i18n missing: ' + key);
  const out = v[LANG === 'ja' ? 1 : 0];
  if (out == null) throw new Error('i18n missing ' + LANG + ': ' + key);
  return out;
}
export const fmt = n => n.toLocaleString(LANG === 'ja' ? 'ja-JP' : 'en-US');
export function dateLine(d) {
  const wd = t('wd')[d.getDay()], m = t('months')[d.getMonth()];
  return LANG === 'ja' ? `${d.getFullYear()}年${m}${d.getDate()}日（${wd}）` : `${wd} ${String(d.getDate()).padStart(2, '0')} ${m.toUpperCase()} ${d.getFullYear()}`;
}

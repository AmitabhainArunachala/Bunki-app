/**
 * 回廊 KAIRO — the corridor prototype.
 *
 * An instrument for making decisions, not a product. Six steps walk unbroken
 * on a phone: arrive → read → tap a word → walk the graph → take it → return.
 * Four open Wayfinder tickets are rendered as switchable variants rather than
 * silently decided (see VARIANTS below).
 *
 * Every value on screen comes from a committed corpus asset. The difficulty
 * signals are the real three-signal grader's output (PR #58) — three signals,
 * never averaged, with disagreement surfaced. The schedule preview is real
 * FSRS-6 (ts-fsrs 5.4.1) under packages/domain's pinned parameters.
 */

const DATA = {
  safe: ['kanken', 'sem'],
  sa: ['kanji', 'words', 'idioms', 'dict', 'strokes'],
  orig: ['grammar-v11'],
};

/** Corridor-authored + harvested grammar, corridor entries winning on
 * duplicate patterns. Populated at boot; falls back to the authored seed. */
function GRAMMARS() {
  return D.grammar || GRAMMAR;
}

function mergeGrammar(harvested) {
  const norm = (p) => p.replace(/[〜～\s（）()]/g, '');
  const have = new Set(GRAMMAR.map((g) => norm(g.p)));
  const extra = (harvested || []).filter((g) => !have.has(norm(g.p)));
  const order = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
  return [...GRAMMAR, ...extra].sort((a, b) => (order[a.lv] ?? 9) - (order[b.lv] ?? 9));
}

/** English titles for the committed shelf (authored translations of the
 * source titles — the sources themselves are CC BY / PD / glossary text). */
const TITLES_EN = {
  'wikinews:1403': 'Seven sites added to the World Natural Heritage list — including Shiretoko',
  'wikinews:6460': "Mariners' Ichiro reaches 2,500 career hits",
  'wikinews:12024': 'JR Osaka-Higashi Line partially opens',
  'wikinews:20090': 'Shigaraki Kōgen Railway crash: court finds JR West 30% at fault',
  'wikinews:45227': 'Wikinews closes the curtain on 21 years',
  'aozora:051034': 'The Wild Rose — Ogawa Mimei',
  'aozora:000628': 'Gon the Fox — Niimi Nankichi',
  'aozora:046605': 'Yamanashi — Miyazawa Kenji',
  'yasashii:1': 'Childcare leave',
  'yasashii:2': 'Childcare-leave benefit',
  'yasashii:3': "Basic survivor's pension",
  'yasashii:4': "Employees' survivor's pension",
  'yasashii:5': 'Medical insurance',
  'yasashii:6': 'Seal-registration certificate',
  'yasashii:7': 'Seal-registration card',
  'yasashii:8': 'Overstaying a visa',
  'yasashii:9': 'Landlord',
  'yasashii:10': 'Long-term care',
  'bunki-graded-n5-morning': 'A Quiet Morning',
  'bunki-graded-n4-bookshop': 'The Second-hand Bookshop on a Rainy Day',
  'bunki-graded-n3-town': 'Walking an Unknown Town',
  'bunki-essay-n2-mountain': 'Thoughts While Walking a Mountain',
  'bunki-essay-n1-ai': 'Knowledge and Judgment in the Age of AI',
  'real-gokajo': 'The Charter Oath (1868)',
  'real-hojoki': 'Hōjōki — the opening',
  'real-tsurezure': 'Tsurezuregusa — the opening passage',
};

/** Turn the grader's three signals into one sentence a learner can use.
 * The raw signals stay one 詳細 tap away — translated, not discarded. */
function levelPhrase(grading) {
  const band = grading.signals.jreadability.band || '';
  const levelMap = {
    初級前半: 'Beginner',
    初級後半: 'Upper beginner',
    中級前半: 'Intermediate',
    中級後半: 'Upper intermediate',
    上級前半: 'Advanced',
    上級後半: 'Upper advanced',
  };
  const level = levelMap[band] || 'Ungraded';
  // vocabulary-load phrasing prefers the NINJAL pair where it was measured;
  // otherwise the live JLPT-lexicon coverage (substrate named in the hint)
  const ninjal = grading.signals.lexical_coverage?.coverage;
  const jlpt = grading.signals.jlpt_lexicon?.coverage;
  const cov = ninjal ?? jlpt;
  let vocabNote = '';
  let vocabNoteJa = '';
  if (cov != null && cov < 1) {
    const oneIn = Math.max(2, Math.round(1 / (1 - cov)));
    const outside = ninjal != null ? 'the core' : 'the JLPT lists';
    const outsideJa = ninjal != null ? '基本語彙の外' : 'JLPT語彙の外';
    vocabNote = ` · ~1 in ${oneIn} words beyond ${outside}`;
    vocabNoteJa = `・約${oneIn}語に1語が${outsideJa}`;
  }
  return { level, ja: band, note: vocabNote, noteJa: vocabNoteJa };
}

/** The four open decisions. Crude and obvious on purpose — it is an instrument.
 * Each option carries [id, 日本語, english]; the strip renders both. `depth`
 * and `ui` are not Wayfinder tickets — they are operator feedback on v1.0
 * (2026-08-07): more separation between layers, and navigation a learner can
 * read before they can read Japanese. */
const VARIANTS = {
  cards: {
    ticket: 38,
    label: 'A 札の形 #38',
    en: 'card format',
    options: [
      ['mcd', 'MCD 文脈', 'MCD cloze'],
      ['word', '単語札', 'word card'],
    ],
  },
  difficulty: {
    ticket: 43,
    label: 'B 難易度 #43',
    en: 'difficulty',
    options: [
      ['three', '3信号', '3 signals'],
      ['band', '帯+不確実', 'band'],
    ],
  },
  contrast: {
    ticket: 47,
    label: 'C 可読性 #47',
    en: 'legibility',
    options: [
      ['wcag', 'WCAG 準拠', 'WCAG AA'],
      ['current', '現行の淡さ', 'soft fade'],
    ],
  },
  entry: {
    ticket: 37,
    label: 'D 入口 #37',
    en: 'entry',
    options: [
      ['drift', '墨流しの野', 'the Drift universe'],
      ['shelf', '読む棚', 'shelf'],
      ['field', '札の野（旧）', 'old placeholder'],
    ],
  },
  depth: {
    ticket: null,
    label: 'E 奥行 v1.1',
    en: 'depth',
    options: [
      ['layered', '層で分ける', 'layered'],
      ['flat', '現行の平ら', 'flat'],
    ],
  },
};

const REL = {
  syn: ['類義', 'everyday synonyms and near-neighbours'],
  ant: ['対義', 'opposites'],
  fam: ['同族', 'shares a kanji — the family around it'],
  col: ['共起', 'what it actually appears with'],
  thm: ['主題', 'the theme it lives in'],
};

/** Grammar seed — DoJG-CLASS coverage begins here (operator 2026-08-07: the
 * three Makino/Tsutsui volumes as the bar). Their text is copyrighted, so
 * every explanation and example below is ORIGINAL, authored for KAIRO; the
 * full ~600-point index is the roadmap, this is the first dozen. */
const GRAMMAR = [
  { id: 'niyoruto', p: '〜によると', lv: 'N3', mEn: 'according to …', mJa: '情報の出どころを示す', form: '名詞 + によると', ex: [{ ja: '天気予報によると、あしたは雨だ。', en: 'According to the forecast, it will rain tomorrow.' }, { ja: '新聞によると、会議は来月開かれる。', en: 'According to the paper, the meeting will be held next month.' }], note: 'Marks the source of reported information; usually paired with 〜そうだ or plain reported forms. The news texts on the shelf open with it constantly.' },
  { id: 'rareru', p: '〜られる／〜される', lv: 'N4', mEn: 'passive — is done (by …)', mJa: '受身', form: '動詞ナイ形 + れる／られる', ex: [{ ja: '会議は毎年ここで開かれる。', en: 'The meeting is held here every year.' }, { ja: '新しい駅が作られた。', en: 'A new station was built.' }], note: 'Everywhere in written news, where events happen without a named actor. Distinguish from potential られる by context.' },
  { id: 'kotoninaru', p: '〜ことになる', lv: 'N3', mEn: 'it has been decided that …; it follows that …', mJa: '決定・成り行き', form: '動詞辞書形／ナイ形 + ことになる', ex: [{ ja: '来年、大阪へ引っ越すことになった。', en: 'It has been decided that I will move to Osaka next year.' }, { ja: '規則では、ここで待つことになっている。', en: 'Under the rules, you are supposed to wait here.' }], note: 'The decision came from outside the speaker. 〜ことにする is the same shape with the speaker deciding.' },
  { id: 'toshite', p: '〜として', lv: 'N3', mEn: 'as …; in the capacity of …', mJa: '資格・立場', form: '名詞 + として', ex: [{ ja: '医者として意見を言う。', en: 'I give my opinion as a doctor.' }, { ja: 'この町は温泉の町として知られている。', en: 'This town is known as a hot-spring town.' }], note: 'Sets the role or capacity from which something is done or seen.' },
  { id: 'nitsuite', p: '〜について', lv: 'N4', mEn: 'about …; concerning …', mJa: '話題・対象', form: '名詞 + について', ex: [{ ja: '事故について説明した。', en: 'They explained about the accident.' }, { ja: '日本の歴史について本を書く。', en: 'To write a book about Japanese history.' }], note: 'The neutral way to mark a topic of discussion; 〜に関して is its formal sibling.' },
  { id: 'teiru', p: '〜ている', lv: 'N5', mEn: 'is …ing; has …ed (state)', mJa: '進行・結果の状態', form: '動詞テ形 + いる', ex: [{ ja: '雨が降っている。', en: 'It is raining.' }, { ja: '窓が開いている。', en: 'The window is open (someone opened it / it stands open).' }], note: 'Progressive with action verbs, resulting state with change verbs — the single most load-bearing form in the language.' },
  { id: 'souda-denbun', p: '〜そうだ（伝聞）', lv: 'N4', mEn: 'I hear that …; they say …', mJa: '伝聞', form: '普通形 + そうだ', ex: [{ ja: 'あの店はおいしいそうだ。', en: 'I hear that restaurant is good.' }, { ja: '半島も登録されたそうだ。', en: 'They say the peninsula was also registered.' }], note: 'Hearsay そうだ attaches to the plain form. The looks-like そうだ attaches to stems — same word, different door.' },
  { id: 'bakari', p: '〜ばかり', lv: 'N3', mEn: 'just did …; nothing but …', mJa: '直後・偏り', form: '動詞タ形 + ばかり／名詞 + ばかり', ex: [{ ja: '起きたばかりだ。', en: 'I just got up.' }, { ja: 'ゲームばかりしている。', en: 'All they do is play games.' }], note: 'After タ形: immediately after. After a noun or テ形: an unbalanced diet of one thing.' },
  { id: 'wa-ga', p: 'は と が', lv: 'N5', mEn: 'topic は vs subject が', mJa: '主題と主格', form: '名詞 + は／が', ex: [{ ja: '象は鼻が長い。', en: 'As for elephants, the nose is long.' }, { ja: 'だれが来たの？ — 田中さんが来た。', en: 'Who came? — Tanaka came.' }], note: 'は frames what the sentence is about; が picks out which one. New information leans が, known-topic leans は.' },
  { id: 'youda', p: '〜ようだ', lv: 'N4', mEn: 'it seems that …', mJa: '推量', form: '普通形 + ようだ（名詞 + のようだ）', ex: [{ ja: 'だれか来たようだ。', en: 'It seems someone came.' }, { ja: '夢のようだ。', en: 'It is like a dream.' }], note: 'Inference from evidence at hand; also the like-a simile. みたいだ is its spoken twin.' },
  { id: 'tame', p: '〜ため（に）', lv: 'N3', mEn: 'because of …; for the sake of …', mJa: '原因・目的', form: '名詞の／普通形 + ため（に）', ex: [{ ja: '事故のため、電車が止まっている。', en: 'Because of an accident, the trains are stopped.' }, { ja: '家族のために働く。', en: 'To work for one’s family.' }], note: 'Cause when the clause is settled fact, purpose when it is willed action — written Japanese leans on it hard.' },
  { id: 'ni-yotte', p: '〜によって', lv: 'N3', mEn: 'by means of …; depending on …; by (agent)', mJa: '手段・受身の動作主・相違', form: '名詞 + によって', ex: [{ ja: '国によって習慣が違う。', en: 'Customs differ depending on the country.' }, { ja: 'この寺は八世紀に建てられたと言われている。この寺は行基によって建てられた。', en: 'This temple is said to date from the 8th century — it was built by Gyōki.' }], note: 'Three doors in one form: instrument, variation, and the agent of a written passive.' },
  { id: 'tai', p: '〜たい', lv: 'N5', mEn: 'want to …', mJa: '願望', form: '動詞マス幹 + たい', ex: [{ ja: '日本へ行きたい。', en: 'I want to go to Japan.' }, { ja: '冷たい水が飲みたい。', en: 'I want to drink cold water.' }], note: 'Conjugates like an い-adjective. The wanted thing may take が. For someone else’s visible wish, 〜たがっている.' },
  { id: 'tekudasai', p: '〜てください', lv: 'N5', mEn: 'please do …', mJa: '依頼', form: '動詞テ形 + ください', ex: [{ ja: 'ここに名前を書いてください。', en: 'Please write your name here.' }, { ja: 'ゆっくり話してください。', en: 'Please speak slowly.' }], note: 'The everyday polite request. Dropping ください (〜て。) is casual; ないでください asks someone NOT to.' },
  { id: 'temoii', p: '〜てもいい', lv: 'N5', mEn: 'may …; it is okay to …', mJa: '許可', form: '動詞テ形 + もいい', ex: [{ ja: 'ここで写真を撮ってもいいですか。', en: 'May I take photos here?' }, { ja: '帰ってもいいよ。', en: 'You can go home, you know.' }], note: 'Permission. The mirror is 〜てはいけない. なくてもいい = you need not.' },
  { id: 'tewaikenai', p: '〜てはいけない', lv: 'N5', mEn: 'must not …', mJa: '禁止', form: '動詞テ形 + はいけない', ex: [{ ja: 'ここで泳いではいけない。', en: 'You must not swim here.' }, { ja: '忘れてはいけない日だ。', en: 'A day that must not be forgotten.' }], note: 'Spoken shortcut: 〜ちゃいけない／〜じゃいけない. Signs prefer 禁止.' },
  { id: 'nakerebanaranai', p: '〜なければならない', lv: 'N4', mEn: 'must …; have to …', mJa: '義務', form: '動詞ナイ形（-い）+ ければならない', ex: [{ ja: '明日までに出さなければならない。', en: 'It must be handed in by tomorrow.' }, { ja: 'もう行かなければ。', en: 'I really have to go.' }], note: 'Speech compresses it: 〜なきゃ／〜ないと. ならない leans written, いけない spoken.' },
  { id: 'kotogadekiru', p: '〜ことができる', lv: 'N5', mEn: 'can …; be able to …', mJa: '可能', form: '動詞辞書形 + ことができる', ex: [{ ja: '漢字を読むことができる。', en: 'I can read kanji.' }, { ja: 'ここでは切符を買うことができない。', en: 'Tickets cannot be bought here.' }], note: 'The transparent, slightly formal potential. Everyday speech prefers the potential form (読める).' },
  { id: 'takotogaaru', p: '〜たことがある', lv: 'N4', mEn: 'have (done) before', mJa: '経験', form: '動詞タ形 + ことがある', ex: [{ ja: '北海道へ行ったことがある。', en: 'I have been to Hokkaidō.' }, { ja: 'こんな景色は見たことがない。', en: 'I have never seen scenery like this.' }], note: 'Experience as a fact about you, not an event time — no 昨日 with this form.' },
  { id: 'nagara', p: '〜ながら', lv: 'N4', mEn: 'while …ing', mJa: '同時進行', form: '動詞マス幹 + ながら', ex: [{ ja: '音楽を聞きながら勉強する。', en: 'To study while listening to music.' }, { ja: '歩きながら考えた。', en: 'I thought it over as I walked.' }], note: 'One subject, two actions; the main act comes second. 残念ながら is a fossil: "regrettably".' },
  { id: 'maeni', p: '〜前に', lv: 'N5', mEn: 'before …ing', mJa: '時間の前後', form: '動詞辞書形／名詞の + 前に', ex: [{ ja: '寝る前に本を読む。', en: 'I read before sleeping.' }, { ja: '会議の前に資料を配った。', en: 'Handouts went out before the meeting.' }], note: 'Always dictionary form before 前に, even in the past. The mirror is 〜た後で.' },
  { id: 'atode', p: '〜た後で', lv: 'N5', mEn: 'after …ing', mJa: '時間の前後', form: '動詞タ形 + 後で／名詞の + 後で', ex: [{ ja: '食べた後で散歩した。', en: 'After eating, I took a walk.' }, { ja: '仕事の後でジムへ行く。', en: 'I go to the gym after work.' }], note: 'タ形 before 後で, whatever the tense. 〜てから adds "and then, from then on".' },
  { id: 'toki', p: '〜とき', lv: 'N5', mEn: 'when …', mJa: '時', form: '普通形 + とき', ex: [{ ja: '日本にいるとき、毎日新聞を読んだ。', en: 'When I was in Japan, I read the paper daily.' }, { ja: '出かけるとき、鍵を忘れた。', en: 'When leaving (before I left), I forgot the key.' }], note: 'Tense before とき is relative: 出かけるとき = on the way out; 出かけたとき = once already out.' },
  { id: 'tara', p: '〜たら', lv: 'N4', mEn: 'if …; when/once …', mJa: '条件・きっかけ', form: '動詞タ形 + ら', ex: [{ ja: '雨が降ったら、中止だ。', en: 'If it rains, it is called off.' }, { ja: '家に帰ったら、手紙が来ていた。', en: 'When I got home, a letter had come.' }], note: 'The most forgiving conditional — one-off ifs, whens, and discoveries all pass through たら.' },
  { id: 'nara', p: '〜なら', lv: 'N4', mEn: 'if that is the case', mJa: '主題条件', form: '普通形／名詞 + なら', ex: [{ ja: '京都へ行くなら、秋がいい。', en: 'If it’s Kyōto you’re going to, autumn is best.' }, { ja: '寿司なら、あの店だ。', en: 'If it’s sushi (you want), it’s that place.' }], note: 'Takes what the other person said as the premise and advises on it. It does not promise sequence like たら.' },
  { id: 'to-joken', p: '〜と（条件）', lv: 'N4', mEn: 'whenever …; if … (natural result)', mJa: '恒常条件', form: '動詞辞書形 + と', ex: [{ ja: '春になると、桜が咲く。', en: 'When spring comes, the cherries bloom.' }, { ja: 'このボタンを押すと、電気がつく。', en: 'Press this button and the light comes on.' }], note: 'Machine-like cause and effect. No requests or intentions in the second half — that is たら territory.' },
  { id: 'tsumori', p: '〜つもり', lv: 'N4', mEn: 'intend to …', mJa: '意図', form: '動詞辞書形／ナイ形 + つもりだ', ex: [{ ja: '来年、日本で働くつもりだ。', en: 'I intend to work in Japan next year.' }, { ja: '行かないつもりだった。', en: 'I had meant not to go.' }], note: 'A held plan, firmer than 〜ようと思う. 〜たつもり = under the (possibly wrong) impression of having done.' },
  { id: 'deshou', p: '〜でしょう', lv: 'N5', mEn: 'probably; right?', mJa: '推量・確認', form: '普通形 + でしょう', ex: [{ ja: '明日は晴れるでしょう。', en: 'It will probably be clear tomorrow.' }, { ja: '高かったでしょう？', en: 'That was expensive, right?' }], note: 'Falling pitch forecasts; rising pitch seeks agreement. だろう is its plain sibling.' },
  { id: 'kamoshirenai', p: '〜かもしれない', lv: 'N4', mEn: 'might …; may be', mJa: '可能性', form: '普通形 + かもしれない', ex: [{ ja: '来ないかもしれない。', en: 'They might not come.' }, { ja: '雨かもしれないから、傘を持って行こう。', en: 'It might rain, so let’s take umbrellas.' }], note: 'Lower confidence than でしょう. Speech clips it to かも.' },
  { id: 'sugiru', p: '〜すぎる', lv: 'N4', mEn: 'too …; overdo', mJa: '過度', form: '動詞マス幹／形容詞語幹 + すぎる', ex: [{ ja: '食べすぎた。', en: 'I ate too much.' }, { ja: 'この問題は難しすぎる。', en: 'This problem is too hard.' }], note: 'Attaches to verb stems and adjective stems alike (高すぎる); the result conjugates as a verb.' },
  { id: 'yasui-nikui', p: '〜やすい／〜にくい', lv: 'N4', mEn: 'easy to … / hard to …', mJa: '難易', form: '動詞マス幹 + やすい／にくい', ex: [{ ja: 'この字は読みやすい。', en: 'This character is easy to read.' }, { ja: '彼の名前は覚えにくい。', en: 'His name is hard to remember.' }], note: 'A property of the thing, not your ability — 読みにくい字 blames the print, not the reader.' },
  { id: 'tari', p: '〜たり〜たりする', lv: 'N4', mEn: 'do things like … and …', mJa: '例示', form: '動詞タ形 + り、…たりする', ex: [{ ja: '休みの日は、本を読んだり散歩したりする。', en: 'On days off I read, take walks, that sort of thing.' }, { ja: '泣いたり笑ったりの一日だった。', en: 'It was a day of crying and laughing by turns.' }], note: 'An open sample of activities — や for nouns, たり for verbs. Close with する.' },
  { id: 'tekara', p: '〜てから', lv: 'N5', mEn: 'after …ing; since …', mJa: '順序・起点', form: '動詞テ形 + から', ex: [{ ja: '手を洗ってから食べる。', en: 'Wash your hands, then eat.' }, { ja: '日本に来てから、三年になる。', en: 'It has been three years since I came to Japan.' }], note: 'Stronger sequencing than plain て — and with duration, "ever since".' },
  { id: 'hougaii', p: '〜たほうがいい', lv: 'N4', mEn: 'had better …', mJa: '助言', form: '動詞タ形 + ほうがいい', ex: [{ ja: '早く寝たほうがいい。', en: 'You had better get to bed early.' }, { ja: '行かないほうがいい。', en: 'Better not to go.' }], note: 'Advice with weight — consequences hover behind it. Negative advice keeps ナイ形.' },
  { id: 'yori-houga', p: '〜より〜のほうが', lv: 'N5', mEn: 'B more than A', mJa: '比較', form: 'AよりBのほうが + 形容詞', ex: [{ ja: '電車より自転車のほうが速い（この町では）。', en: 'Bikes are faster than trains (in this town).' }, { ja: '夏より冬のほうが好きだ。', en: 'I like winter better than summer.' }], note: 'ほう points at the winner. Questions compare with どちら, never どれ, for two things.' },
  { id: 'souda-youtai', p: '〜そうだ（様態）', lv: 'N4', mEn: 'looks about to …; looks …', mJa: '様態', form: '動詞マス幹／形容詞語幹 + そうだ', ex: [{ ja: '雨が降りそうだ。', en: 'It looks like rain (any moment).' }, { ja: 'このケーキはおいしそうだ。', en: 'This cake looks delicious.' }], note: 'Judged by sight, on the stem. The same word on the plain form is hearsay — the twin door in this dictionary.' },
  { id: 'teshimau', p: '〜てしまう', lv: 'N4', mEn: 'finish completely; end up …ing', mJa: '完了・遺憾', form: '動詞テ形 + しまう', ex: [{ ja: '全部読んでしまった。', en: 'I read the whole thing (done and dusted).' }, { ja: '財布を忘れてしまった。', en: 'I went and forgot my wallet.' }], note: 'Completion shading into regret; context picks. Speech melts it to 〜ちゃう／〜じゃう.' },
  { id: 'teoku', p: '〜ておく', lv: 'N4', mEn: 'do in advance; leave as is', mJa: '準備・放置', form: '動詞テ形 + おく', ex: [{ ja: '会議の資料を読んでおく。', en: 'I will read the materials ahead of the meeting.' }, { ja: '窓を開けておいてください。', en: 'Please leave the window open.' }], note: 'Doing now for later — preparation, or deliberately leaving a state in place. Speech: 〜とく.' },
  { id: 'temiru', p: '〜てみる', lv: 'N4', mEn: 'try …ing (and see)', mJa: '試行', form: '動詞テ形 + みる', ex: [{ ja: '一度食べてみてください。', en: 'Try it once (and see).' }, { ja: '辞書で調べてみた。', en: 'I tried looking it up in the dictionary.' }], note: 'Attempt with an eye on the result — not effort (that is 〜ようとする) but experiment.' },
  { id: 'age-kure-morau', p: '〜てあげる・くれる・もらう', lv: 'N4', mEn: 'do for someone / for me / have done for one', mJa: '授受', form: '動詞テ形 + あげる／くれる／もらう', ex: [{ ja: '友だちが手伝ってくれた。', en: 'A friend helped me (a favour inward).' }, { ja: '先生に見てもらった。', en: 'I had the teacher look at it.' }], note: 'The camera position of favours: あげる points away from me, くれる toward me, もらう has the receiver as subject. The politeness ladder (さしあげる・くださる・いただく) climbs from here.' },
];

const S = {
  ready: false,
  view: 'shelf',
  passageId: null,
  readerScroll: 0,
  stack: [],
  dials: { kanji: 0, furigana: 2, spacing: 0 },
  // entry: 'drift' — The Walk's first step is arriving in the living universe
  variants: { cards: 'mcd', difficulty: 'three', contrast: 'wcag', entry: 'drift', depth: 'layered' },
  /* UI language: 'bi' = navigation carries English alongside the Japanese
   * (default — a learner must be able to steer before they can read);
   * 'ja' = 日本語のみ, the opt-in immersion chrome for advanced use. */
  lang: 'bi',
  dialsOpen: false,
  query: '',
  taken: [],
  /** manual lists: { name: [{t,id,label,ts}] } — the operator's Renzo habit */
  lists: {},
  /** tokens whose English gloss is shown beneath (double-tap) */
  glossed: null,
  /** which shelf cards have their raw signals expanded (詳細) */
  detailsOpen: null,
  sourcesOpen: false,
  debugOpen: false,
  /** Semantic return point for a modal entry sheet across full DOM renders. */
  dialogInvoker: null,
};

/* ------------------------------------------------ persistence (localStorage) */
const STORE_KEY = 'kairo-corridor-v1';
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (Array.isArray(s.taken)) S.taken = s.taken;
    if (s.lists && typeof s.lists === 'object') S.lists = s.lists;
  } catch {
    /* a broken store never blocks the walk */
  }
}
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ taken: S.taken, lists: S.lists }));
  } catch {
    /* quota or private mode — the session keeps working unpersisted */
  }
}

/** Month bucket label for an epoch ms — the automatic Renzo-style list. */
function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

/** Full dictionary record for a written form: kotobako (all senses, most
 * common first) with the original 6,687-word layer as fallback. */
function lookup(id) {
  const full = D.dict[id];
  if (full) return { r: full.r, m: full.m, p: full.p, jlpt: full.jlpt, k: full.k || [], alt: full.alt };
  const old = D.words[id];
  if (old) return { r: old.r, m: old.g ? [old.g] : [], jlpt: old.jlpt, k: old.k || [] };
  return null;
}

const D = {};
let fsrsApi = null;
let scheduler = null;

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/* -------------------------------- substrate-neutral interaction adapter
 * The pure semantics live in @bunki/domain. This static prototype cannot
 * import TypeScript directly, so it emits the exact same action envelope and
 * keeps modality as provenance only. Renderers consume the action; no branch
 * below grants a modality extra learning or scheduling authority. */
const INTERACTION_ACTIONS = new Set([
  'target.activate',
  'quickLook.open',
  'entry.open',
  'selection.move',
  'constellation.lock',
  'tide.set',
  'judgment.nominate',
  'navigation.back',
  'layer.dismiss',
]);
const INTERACTION_MODALITIES = new Set([
  'pointer',
  'keyboard',
  'switch',
  'screenReader',
  'programmatic',
]);
const interactionReceipts = [];

function interaction(action, modality = 'programmatic', sourceId = 'corridor') {
  if (!INTERACTION_ACTIONS.has(action?.kind)) throw new Error(`unknown interaction ${action?.kind}`);
  if (!INTERACTION_MODALITIES.has(modality)) throw new Error(`unknown modality ${modality}`);
  const envelope = Object.freeze({
    action: Object.freeze({ ...action }),
    provenance: Object.freeze({ modality, sourceId }),
  });
  interactionReceipts.push(envelope);
  window.dispatchEvent(new CustomEvent('kairo:interaction', { detail: envelope }));
  return envelope;
}

window.__KAIRO_INTERACTION__ = Object.freeze({
  receipts: interactionReceipts,
  dispatch(action, provenance = {}) {
    return interaction(
      action,
      provenance.modality || 'programmatic',
      provenance.sourceId || 'programmatic',
    );
  },
});

/* ------------------------------------------------------------ ui language */
const bi = () => S.lang === 'bi';
/** Pick one rendering for prose: English when the chrome is bilingual,
 * the Japanese original in 日本語のみ mode. */
const tx = (ja, en) => (bi() && en != null ? en : ja);
/** Append a small english sub-label to a control or heading (bi mode only). */
function withEn(node, en, cls = 'en-sub') {
  if (bi() && en) node.append(el('span', cls, en));
  return node;
}
/** A label that stacks 日本語 over english inside buttons. */
function biLabel(tag, cls, ja, en) {
  const node = el(tag, cls);
  node.append(el('span', 'l-ja', ja));
  if (bi() && en) node.append(el('span', 'en-sub', en));
  return node;
}

/* ------------------------------------------------------------------ load */
async function boot() {
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(VARIANTS)) {
    const v = params.get(key);
    if (v && VARIANTS[key].options.some(([id]) => id === v)) S.variants[key] = v;
  }
  if (['bi', 'ja'].includes(params.get('ui'))) S.lang = params.get('ui');
  loadStore();
  if (params.get('dials')) {
    const [k, f, s] = params.get('dials').split(',').map(Number);
    if ([k, f, s].every((n) => n >= 0 && n <= 2)) S.dials = { kanji: k, furigana: f, spacing: s };
  }
  if (S.variants.entry === 'field') S.view = 'entry';
  if (S.variants.entry === 'drift') S.view = 'drift';

  render();

  // The standalone single-file build embeds the bundles instead of serving
  // them; everything else about the surface is byte-identical.
  const bundled = window.__CORRIDOR_BUNDLE__;
  const load = async (pool, name) => {
    if (bundled) return bundled[`${pool}/${name}`];
    const res = await fetch(`data/${pool}/${name}.json`);
    if (!res.ok) throw new Error(`data/${pool}/${name}.json → ${res.status}`);
    return res.json();
  };
  const loadArticleIndex = async () => {
    if (bundled) return bundled['articles/index'];
    const res = await fetch('data/articles/index.json');
    if (!res.ok) throw new Error(`data/articles/index.json → ${res.status}`);
    return res.json();
  };
  const [articleIndex, kanken, sem, kanji, words, idioms, dict, strokes, grammarV11, manifest, pin] =
    await Promise.all([
      loadArticleIndex(),
      ...DATA.safe.map((n) => load('proprietary_safe', n)),
      ...DATA.sa.map((n) => load('share_alike', n)),
      ...DATA.orig.map((n) => load('original', n)),
      bundled ? bundled.manifest : fetch('data/manifest.json').then((r) => r.json()),
      bundled ? bundled['fsrs-pin'] : fetch('data/fsrs-pin.json').then((r) => r.json()),
    ]);

  // The shelf boots from a light index; each article's text + tokens live in
  // their own file, fetched on first open (and prefetched quietly after boot)
  // — dozens of articles cost nothing until read.
  D.passages = articleIndex.articles;
  D.passageSources = articleIndex.sources.proprietary_safe;
  D.articleSources = articleIndex.sources;
  D.kanken = kanken.levels;
  D.sem = sem.edges;
  D.kanji = kanji.kanji;
  D.radicals = kanji.radicals;
  D.words = words.words;
  D.dict = dict.words;
  D.strokes = strokes.strokes;
  D.kmeta = strokes.meta;
  D.idioms = Object.fromEntries(idioms.idioms.map((i) => [i.w, i]));
  D.idiomsByKanji = idioms.byKanji;
  D.idiomMeta = { total: idioms.totalCandidates, cap: idioms.cap };
  D.manifest = manifest;
  D.pin = pin;
  D.grammar = mergeGrammar(grammarV11.entries);
  D.sources = {
    proprietary_safe: [...articleIndex.sources.proprietary_safe, ...kanken.sources, ...sem.sources],
    share_alike: [
      ...articleIndex.sources.share_alike,
      ...kanji.sources,
      ...words.sources,
      ...idioms.sources,
      ...dict.sources,
      ...strokes.sources,
    ],
    original: [...articleIndex.sources.original, ...grammarV11.sources],
  };

  // kanji → words containing it, derived here rather than shipped twice
  D.kanjiWords = {};
  for (const w of Object.values(D.words)) {
    for (const c of w.k || []) (D.kanjiWords[c] ||= []).push(w.w);
  }
  for (const c of Object.keys(D.kanjiWords)) {
    D.kanjiWords[c].sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  }
  D.wordCap = manifest.caps.kanjiWordCap;

  try {
    fsrsApi = window.__TSFSRS__ || (await import('./vendor/ts-fsrs.mjs'));
    scheduler = fsrsApi.fsrs(
      fsrsApi.generatorParameters({
        w: pin.w,
        request_retention: pin.requestRetention,
        maximum_interval: pin.maximumInterval,
        enable_fuzz: pin.enableFuzz,
        enable_short_term: pin.enableShortTerm,
        learning_steps: pin.learningSteps,
        relearning_steps: pin.relearningSteps,
      }),
    );
  } catch (err) {
    console.warn('FSRS unavailable', err);
  }

  S.ready = true;
  document.body.dataset.ready = '1';
  render();
  prefetchArticles();
}

/* ----------------------------------------------- lazy article loading
 * Each shelf row carries metadata + signals only. The article body (text,
 * tokens, paragraph starts) arrives from its own file on first open; a quiet
 * background queue warms the rest so search, examples, and the entry field
 * reach full strength without blocking the first paint. */
const bundledArticle = (p) => window.__CORRIDOR_BUNDLE__?.[`articles/${p.file.replace(/\.json$/, '')}`];

async function ensureArticle(p) {
  if (!p || p.tokens) return p;
  if (p._loading) return p._loading;
  const bundledBody = bundledArticle(p);
  p._loading = (
    bundledBody
      ? Promise.resolve(bundledBody)
      : fetch(`data/articles/${p.file}`).then((res) => {
          if (!res.ok) throw new Error(`data/articles/${p.file} → ${res.status}`);
          return res.json();
        })
  ).then((body) => {
    Object.assign(p, body);
    delete p._loading;
    return p;
  });
  return p._loading;
}

function prefetchArticles() {
  const queue = D.passages.filter((p) => !p.tokens);
  const next = () => {
    const p = queue.shift();
    if (!p) return;
    ensureArticle(p)
      .catch((err) => console.warn(`prefetch ${p.id}`, err))
      .then(() => setTimeout(next, 40));
  };
  setTimeout(next, 350);
}

/* ------------------------------------------------------- navigation state */
function invokerKey(node) {
  if (!node) return null;
  if (node.matches?.('#reader .tok[data-index]')) {
    return {
      kind: 'reader-token',
      index: node.dataset.index,
      targetKind: node.dataset.targetKind || 'word',
    };
  }
  if (node.id) return { kind: 'id', id: node.id };
  return null;
}

function restoreDialogInvoker() {
  const key = S.dialogInvoker;
  S.dialogInvoker = null;
  if (!key) return;
  requestAnimationFrame(() => {
    let target = null;
    if (key.kind === 'reader-token') {
      target = document.querySelector(
        `#reader .tok[data-index="${key.index}"][data-target-kind="${key.targetKind}"]`,
      );
    } else if (key.kind === 'id') {
      target = document.getElementById(key.id);
    }
    target?.focus({ preventScroll: true });
  });
}

function go(node, { invoker = null } = {}) {
  if (S.view === 'reader') S.readerScroll = window.scrollY;
  if (!S.stack.length && !S.dialogInvoker) {
    S.dialogInvoker = invokerKey(invoker || document.activeElement);
  }
  S.stack.push(node);
  render();
  const sheet = $('.sheet');
  if (sheet) sheet.scrollTop = 0;
}

function back() {
  if (S.stack.length) {
    S.stack.pop();
    render();
    if (!S.stack.length) {
      if (S.view === 'reader') window.scrollTo(0, S.readerScroll);
      restoreDialogInvoker();
    }
    return;
  }
  if (S.view === 'reader' || S.view === 'tray' || S.view === 'grammar') {
    S.view = 'shelf';
    render();
    return;
  }
  if (S.view === 'shelf' && S.variants.entry === 'field') {
    S.view = 'entry';
    render();
  }
  if (S.view === 'shelf' && S.variants.entry === 'drift') {
    S.view = 'drift';
    render();
  }
}

function dismissSheet() {
  if (!S.stack.length) return;
  S.stack = [];
  render();
  if (S.view === 'reader') window.scrollTo(0, S.readerScroll);
  restoreDialogInvoker();
}

function openPassage(id) {
  S.passageId = id;
  S.view = 'reader';
  S.readerScroll = 0;
  S.stack = [];
  S.loadError = false;
  render();
  window.scrollTo(0, 0);
  const p = passage();
  if (p && !p.tokens) {
    ensureArticle(p)
      .then(() => {
        if (S.view === 'reader' && S.passageId === id) render();
      })
      .catch((err) => {
        console.error(err);
        if (S.view === 'reader' && S.passageId === id) {
          S.loadError = true;
          render();
        }
      });
  }
}

/* --------------------------------------------------------------- helpers */
const passage = () => D.passages.find((p) => p.id === S.passageId);
const BEYOND_JOYO = new Set(['準1級', '1級']);

function beyondJoyo(ch) {
  const k = D.kanken[ch];
  return !!k && BEYOND_JOYO.has(k.kk);
}

function rubyNode(pairs, { furigana, revealed }) {
  const frag = document.createDocumentFragment();
  for (const pair of pairs) {
    if (!pair.r || furigana === 0) {
      frag.append(document.createTextNode(pair.t));
      continue;
    }
    const ruby = document.createElement('ruby');
    ruby.append(document.createTextNode(pair.t));
    const rt = document.createElement('rt');
    rt.textContent = pair.r;
    if (furigana === 1 && !revealed) rt.className = 'hidden-rt';
    ruby.append(rt);
    frag.append(ruby);
  }
  return frag;
}

/** Kanji dial: 0 as written · 1 above-常用 replaced by its reading · 2 all kana. */
function displayPairs(token) {
  const mode = S.dials.kanji;
  if (mode === 0) return token.f;
  if (mode === 2) return [{ t: token.r || token.s }];
  return token.f.map((pair) => {
    if (!pair.r) return pair;
    return [...pair.t].some(beyondJoyo) ? { t: pair.r } : pair;
  });
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseColor(str) {
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
}

/** Measured, not eyeballed: composite alpha over the ground, then WCAG ratio. */
function contrastOf(node) {
  const cs = getComputedStyle(node);
  const fg = parseColor(cs.color);
  const bg = parseColor(getComputedStyle(document.body).backgroundColor) || { rgb: [252, 251, 246], a: 1 };
  if (!fg) return null;
  const composited = fg.rgb.map((v, i) => v * fg.a + bg.rgb[i] * (1 - fg.a));
  const l1 = luminance(composited);
  const l2 = luminance(bg.rgb);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return Math.round(ratio * 100) / 100;
}

/* ----------------------------------------------------------- signals (B) */
const JREAD_MAX = 6.4;
const JREAD_MIN = 0.5;

function signalRows(grading) {
  const s = grading.signals;
  const jr = s.jreadability;
  const rows = [
    {
      name: 'jreadability',
      en: 'sentence ease',
      value: jr.score == null ? '—' : `${jr.score.toFixed(2)} ${jr.band}`,
      hint: tx('6.4 易 → 0.5 難（独自の尺度）', 'sentence-shape readability: 6.4 easy → 0.5 hard'),
      fill: jr.score == null ? 0 : (JREAD_MAX - jr.score) / (JREAD_MAX - JREAD_MIN),
    },
  ];
  if (s.jlpt_lexicon) {
    const jl = s.jlpt_lexicon;
    rows.push({
      name: 'JLPT語彙',
      en: 'JLPT vocab coverage',
      value: jl.coverage == null ? '—' : `${(jl.coverage * 100).toFixed(1)}%`,
      hint: tx(
        'JLPT対応 6,687 語に対する内容語の被覆（高いほど易・非公式リスト）',
        'share of content words inside a 6,687-word JLPT-tagged lexicon (higher = easier; unofficial list)',
      ),
      fill: jl.coverage == null ? 0 : 1 - jl.coverage,
    });
  }
  if (s.lexical_coverage) {
    rows.push({
      name: '語彙カバー率',
      en: 'vocab coverage',
      value: s.lexical_coverage.coverage == null ? '—' : `${(s.lexical_coverage.coverage * 100).toFixed(1)}%`,
      hint: tx(
        '国語研 6,103 語に対する内容語の被覆（高いほど易）',
        'share of content words inside the NINJAL 6,103-word core (higher = easier)',
      ),
      fill: s.lexical_coverage.coverage == null ? 0 : 1 - s.lexical_coverage.coverage,
    });
  }
  if (s.tmr) {
    const core = s.tmr.by_level['ninjal-kyoiku-kihon-goi:core'];
    rows.push({
      name: 'TMR（核）',
      en: 'rare-word load',
      value: core == null ? '—' : `${(core * 100).toFixed(1)}%`,
      hint: tx('◎ 2,071 語より上の語の割合（高いほど難）', 'share of words beyond the 2,071-word core (higher = harder)'),
      fill: core ?? 0,
    });
  }
  if (grading.unavailable?.lexical_coverage) {
    rows.push({
      name: '国語研語彙',
      en: 'NINJAL pair',
      value: tx('未測定', 'not measured'),
      hint: tx(
        'この版の構築環境から国語研基盤に到達できず、未測定のまま示す（偽の数値は出さない）',
        'the NINJAL substrate was unreachable from this build environment — shown as unmeasured, never faked',
      ),
      fill: 0,
      na: true,
    });
  }
  return rows;
}

function renderSignals(grading, { compact = false } = {}) {
  const wrap = el('div');
  const ordinals = grading.disagreement.detail.ordinals || {};
  const values = Object.values(ordinals);

  if (S.variants.difficulty === 'three') {
    const box = el('div', 'signals');
    for (const row of signalRows(grading)) {
      const line = el('div', 'sig');
      line.append(withEn(el('span', 'sig-name', row.name), row.en));
      if (row.na) {
        // an unmeasured signal draws no bar — a bar would be a fake reading
        line.append(el('div', 'sig-track sig-track-na'), el('span', 'sig-val', row.value));
      } else {
        const track = el('div', 'sig-track');
        const fill = el('div', 'sig-fill');
        fill.style.width = `${Math.max(2, Math.min(100, row.fill * 100))}%`;
        track.append(fill);
        line.append(track, el('span', 'sig-val', row.value));
      }
      line.title = row.hint;
      box.append(line);
    }
    wrap.append(box);
    const foot = el('div', 'shelf-meta');
    foot.style.marginTop = '8px';
    foot.append(el('span', null, tx('信号は別々に。平均しない。', 'Signals stay separate — never averaged.')));
    if (grading.disagreement.flag) {
      foot.append(
        withEn(el('span', 'disagree-tag', `不一致 gap ${grading.disagreement.detail.max_gap}`), 'signals disagree'),
      );
    }
    wrap.append(foot);
  } else {
    const box = el('div', 'band');
    const scale = el('div', 'band-scale');
    const lo = values.length ? Math.min(...values) : 0;
    const hi = values.length ? Math.max(...values) : 2;
    const span = el('div', 'band-span');
    span.style.left = `${(lo / 3) * 100}%`;
    span.style.width = `${((hi - lo + 1) / 3) * 100}%`;
    scale.append(span);
    const legend = el('div', 'band-legend');
    legend.append(
      el('span', null, tx('易', '易 easy')),
      el('span', null, tx('中', '中 mid')),
      el('span', null, tx('難', '難 hard')),
    );
    box.append(withEn(el('div', 'sig-name', '難易度の帯'), 'difficulty band'), scale, legend);
    if (grading.disagreement.flag) {
      const mark = el('div', 'uncertain');
      mark.append(
        el('span', null, '⁉'),
        el(
          'span',
          null,
          tx(
            `不確実 — 3信号が ${grading.disagreement.detail.max_gap} 段ずれている`,
            `uncertain — the 3 signals are ${grading.disagreement.detail.max_gap} step(s) apart`,
          ),
        ),
      );
      box.append(mark);
    }
    wrap.append(box);
  }

  if (!compact) {
    const note = el('div', 'note');
    note.textContent = tx(
      '#58 で測定済み：jreadability はやさしい日本語を「易しくない」と採点する（符号が逆、2 seed で再現）。' +
        'だから単一の数値は出さない。',
      'Measured on #58: jreadability grades Easy-Japanese as "not easy" (sign inverted, reproduced on 2 seeds). ' +
        'That is why no single number is shown.',
    );
    wrap.append(note);
  }
  return wrap;
}

/* ---------------------------------------------------------------- views */
function renderShelf(main) {
  main.append(withEn(el('p', 'eyebrow', '回廊 · 図書館'), 'KAIRO · the library', 'en-inline'));

  // the quiet field — kanji, kana, romaji, or English; four doors, one box
  const search = el('input', 'search-field');
  search.id = 'search';
  search.type = 'search';
  search.placeholder = tx('ことばをさがす', 'Look up a word — kanji · kana · romaji · English');
  search.autocomplete = 'off';
  search.value = S.query || '';
  let debounce = null;
  search.addEventListener('input', () => {
    S.query = search.value;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      // surgical swap — the field keeps focus, only the body below changes
      document.getElementById('shelf-body')?.replaceWith(renderShelfBody());
    }, 120);
  });
  main.append(search);
  main.append(renderShelfBody());
}

function renderShelfBody() {
  const main = el('div');
  main.id = 'shelf-body';
  if (S.query?.trim()) {
    renderSearchResults(main, S.query);
    return main;
  }
  const h = withEn(el('h1', 'view-title', '本棚'), 'the bookshelf', 'en-inline');
  main.append(h);
  const sub = el('p', 'shelf-snippet intro');
  sub.textContent = tx(
    `${D.passages.length} 本。触れてひらく。`,
    `${D.passages.length} real texts. Tap one to read it.`,
  );
  main.append(sub);

  const gram = el('button', 'grammar-link');
  gram.type = 'button';
  gram.id = 'grammar-link';
  gram.append(el('span', 'l-ja', '文法'), el('span', 'en-sub', bi() ? 'grammar' : ''));
  gram.addEventListener('click', () => {
    S.view = 'grammar';
    render();
    window.scrollTo(0, 0);
  });
  main.append(gram);

  for (const p of D.passages) {
    const item = el('button', 'shelf-item');
    item.type = 'button';
    item.dataset.passage = p.id;

    const head = el('div', 'shelf-head');
    head.append(el('div', 'shelf-title', p.title));
    if (bi() && TITLES_EN[p.id]) head.append(el('div', 'shelf-title-en', TITLES_EN[p.id]));
    const lv = levelPhrase(p.grading);
    const levelLine = el('div', 'level-line');
    levelLine.append(el('span', 'level-chip', bi() ? lv.level : lv.ja));
    levelLine.append(el('span', 'level-note', bi() ? `${lv.ja}${lv.note}` : lv.noteJa));
    if (p.grading.disagreement.flag) {
      levelLine.append(el('span', 'disagree-tag', tx('不一致', 'signals disagree')));
    }
    head.append(levelLine);
    item.append(head);

    const meta = el('div', 'shelf-meta');
    meta.append(el('span', null, p.sourceLabel));
    if (p.date) meta.append(el('span', null, p.date));
    meta.append(el('span', 'pool-tag', p.licence));
    item.append(meta);
    item.append(el('div', 'shelf-snippet', p.snippet ?? (p.text || '').slice(0, 64)));

    // the instrument stays one tap away: 詳細 unfolds the raw three signals
    const details = el('button', 'details-toggle');
    details.type = 'button';
    details.dataset.details = p.id;
    details.textContent = (S.detailsOpen?.has(p.id) ? '▾ ' : '▸ ') + tx('詳細', 'details · raw signals');
    details.addEventListener('click', (ev) => {
      ev.stopPropagation();
      (S.detailsOpen ||= new Set());
      if (S.detailsOpen.has(p.id)) S.detailsOpen.delete(p.id);
      else S.detailsOpen.add(p.id);
      render();
    });
    item.append(details);
    if (S.detailsOpen?.has(p.id)) item.append(renderSignals(p.grading, { compact: true }));

    item.addEventListener('click', () => openPassage(p.id));
    main.append(item);
  }

  // sources and licences: present, honest, folded
  const src = el('button', 'details-toggle');
  src.type = 'button';
  src.id = 'sources-toggle';
  src.textContent = (S.sourcesOpen ? '▾ ' : '▸ ') + tx('出典と licence', 'sources & licences');
  src.addEventListener('click', () => {
    S.sourcesOpen = !S.sourcesOpen;
    render();
  });
  main.append(src);
  if (S.sourcesOpen) main.append(licencePanel());
  return main;
}

function dialRow(labelJa, labelEn, key, options) {
  const row = el('div', 'dial');
  row.append(withEn(el('span', 'dial-label', labelJa), labelEn));
  const seg = el('div', 'seg');
  options.forEach(([ja, en], index) => {
    const b = biLabel('button', null, ja, en);
    b.type = 'button';
    b.dataset.dial = `${key}:${index}`;
    b.setAttribute('aria-pressed', String(S.dials[key] === index));
    b.addEventListener('click', () => {
      S.dials[key] = index;
      render();
    });
    seg.append(b);
  });
  row.append(seg);
  return row;
}

/* ------------------------------------------- the reader's click grammar
 * One discipline, carried from Drift (§8 of the design-language doc), tuned
 * by operator rounds 3–4 (2026-08-07). Taps are PROGRESSIVE, not timed:
 *   1st tap        → furigana above           (instant — no double-tap wait)
 *   2nd tap        → English beneath          (a later tap, not a fast pair)
 *   3rd tap        → carries into the full entry
 *   long-press     → floating mini-dictionary
 *   keep holding   → the mini window morphs into the full entry
 * A moved pointer is a scroll, never a gesture. Every action applies to the
 * DOM directly — no full re-render, so the reader never stutters. */
const GESTURE = { MINI_MS: 430, FULL_MS: 2100, MOVE_PX: 9 };

/* After a hold opens the full entry, the browser still synthesises a click
 * when the finger lifts — and it lands on whatever the new sheet put under
 * that spot, teleporting the reader a node deeper. Swallow that one click. */
let swallowClickUntil = 0;
document.addEventListener(
  'click',
  (ev) => {
    if (Date.now() < swallowClickUntil) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  },
  true,
);

function removeMini() {
  document.getElementById('mini')?.remove();
}

/* a tap anywhere outside the mini puts it away — easy to back out of */
document.addEventListener(
  'pointerdown',
  (ev) => {
    const mini = document.getElementById('mini');
    if (mini && !mini.contains(ev.target)) removeMini();
  },
  true,
);

function showMini(span, token, onEntry, { focusEntry = false } = {}) {
  removeMini();
  const g = lookup(token.b);
  const mini = el('div', null);
  mini.id = 'mini';
  mini.setAttribute('role', 'dialog');
  mini.setAttribute('aria-label', tx(`${token.b} の語釈`, `${token.b} quick look`));
  mini.append(el('span', 'mini-word', token.b));
  if (g?.r) mini.append(el('span', 'mini-reading', g.r));
  mini.append(el('span', 'mini-gloss', g?.m?.[0] || tx('（語釈なし）', '(no gloss yet)')));
  mini.append(el('span', 'mini-hint', tx('辞書の全項目へ進める', 'open the complete entry')));
  const entry = biLabel('button', 'mini-entry', '全項目', 'full entry');
  entry.type = 'button';
  entry.dataset.action = 'entry.open';
  entry.dataset.targetKind = 'word';
  entry.addEventListener('click', (event) => {
    event.stopPropagation();
    onEntry(event.detail === 0 ? 'keyboard' : 'pointer');
  });
  mini.append(entry);
  document.body.append(mini);
  const r = span.getBoundingClientRect();
  const m = mini.getBoundingClientRect();
  const above = r.top > m.height + 70;
  mini.style.left = `${Math.max(8, Math.min(window.innerWidth - m.width - 8, r.left + r.width / 2 - m.width / 2))}px`;
  mini.style.top = `${above ? r.top - m.height - 10 : r.bottom + 10}px`;
  if (focusEntry) entry.focus({ preventScroll: true });
  return mini;
}

function installTokenAlternatives(wrapper, span, target, { quickLook, openEntry }) {
  const actions = el('span', 'token-actions');
  actions.hidden = true;
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', tx(`${span.textContent} の操作`, `${span.textContent} actions`));

  if (quickLook) {
    const quick = biLabel('button', null, '語釈', 'quick look');
    quick.type = 'button';
    quick.dataset.action = 'quickLook.open';
    quick.dataset.targetKind = target.kind;
    quick.addEventListener('click', (event) => {
      event.stopPropagation();
      const modality = event.detail === 0 ? 'keyboard' : 'pointer';
      interaction({ kind: 'quickLook.open', target }, modality, 'reader-alternative');
      quickLook(modality);
    });
    quick.tabIndex = -1;
    actions.append(quick);
  }

  const full = biLabel('button', null, target.kind === 'particle' ? '助詞へ' : '全項目', 'full entry');
  full.type = 'button';
  full.dataset.action = 'entry.open';
  full.dataset.targetKind = target.kind;
  full.addEventListener('click', (event) => {
    event.stopPropagation();
    const modality = event.detail === 0 ? 'keyboard' : 'pointer';
    interaction({ kind: 'entry.open', target }, modality, 'reader-alternative');
    openEntry(modality);
  });
  full.tabIndex = -1;
  actions.append(full);

  const show = () => {
    if (!actions.isConnected) wrapper.append(actions);
    actions.hidden = false;
    for (const button of actions.querySelectorAll('button')) button.tabIndex = 0;
    actions.style.visibility = 'hidden';
    const targetBox = span.getBoundingClientRect();
    const actionBox = actions.getBoundingClientRect();
    const half = actionBox.width / 2;
    const centre = Math.max(half + 8, Math.min(window.innerWidth - half - 8, targetBox.left + targetBox.width / 2));
    const below = targetBox.bottom + 4;
    const top = below + actionBox.height <= window.innerHeight - 8
      ? below
      : Math.max(8, targetBox.top - actionBox.height - 4);
    actions.style.left = `${centre}px`;
    actions.style.top = `${top}px`;
    actions.style.visibility = '';
  };
  const hideAfterFocusLeaves = () => {
    setTimeout(() => {
      if (!wrapper.contains(document.activeElement)) {
        for (const button of actions.querySelectorAll('button')) button.tabIndex = -1;
        actions.hidden = true;
        actions.remove();
      }
    }, 0);
  };
  span.addEventListener('focus', show);
  wrapper.addEventListener('focusout', hideAfterFocusLeaves);
}

/** The inline gloss under a word must NEVER truncate (operator, morning
 * round). JMdict first senses are wordy; the most compact sense makes the
 * best hint — the full numbered senses are one hold away. Parentheticals
 * drop; if everything is long, the clause before the first comma wins. */
function inlineGloss(rec) {
  if (!rec?.m?.length) return null;
  const candidates = rec.m
    .slice(0, 3)
    .map((s) => s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!candidates.length) return rec.m[0];
  let best = candidates.reduce((a, b) => (b.length < a.length ? b : a));
  if (best.length > 18 && best.includes(',')) best = best.split(',')[0].trim();
  return best;
}

function tokenAccessibleLabel(token, index) {
  const record = lookup(token.b);
  const hasReading = S.dials.furigana === 2 || S.revealed?.has(index);
  const hasEnglish = S.glossed?.has(index);
  const parts = [token.s || token.b, tx('語', 'word')];
  if (hasReading && record?.r && record.r !== token.s) parts.push(record.r);
  if (hasEnglish && record?.m?.length) parts.push(inlineGloss(record));
  parts.push(tx('三回目で全項目。フォーカスで別の操作。', 'third activation opens the full entry; focus for more actions'));
  return parts.filter(Boolean).join(' · ');
}

/** Apply one token's reveal state straight to its DOM — no re-render. */
function paintTok(span, token, index) {
  const hasReading = S.dials.furigana === 2 || S.revealed?.has(index);
  const hasEn = S.glossed?.has(index);
  if (S.dials.furigana === 1) {
    for (const rt of span.querySelectorAll('rt')) rt.classList.toggle('hidden-rt', !hasReading);
  } else if (S.dials.furigana === 0) {
    // the dial says no ruby — a per-word reveal builds it on the spot
    const built = span.querySelector('ruby');
    if (hasReading && !built) {
      span.querySelector('.tok-en')?.remove();
      const frag = rubyNode(displayPairs(token), { furigana: 1, revealed: true });
      span.textContent = '';
      span.append(frag);
    } else if (!hasReading && built) {
      span.querySelector('.tok-en')?.remove();
      span.textContent = '';
      span.append(rubyNode(displayPairs(token), { furigana: 0, revealed: false }));
    }
  }
  span.classList.toggle('lit', !!(S.revealed?.has(index) || hasEn));
  const existingEn = span.querySelector('.tok-en');
  if (hasEn && !existingEn) {
    const g = lookup(token.b);
    if (g?.m?.length) {
      span.classList.add('has-en');
      span.append(el('span', 'tok-en', inlineGloss(g)));
    }
  } else if (!hasEn && existingEn) {
    span.classList.remove('has-en');
    existingEn.remove();
  }
  span.setAttribute('aria-label', tokenAccessibleLabel(token, index));
}

function wireTokenGestures(span, token, index, p) {
  let miniTimer = null;
  let fullTimer = null;
  let down = null;
  const target = { kind: 'word', id: token.b };
  const openFull = (modality = 'pointer', emitAction = true) => {
    removeMini();
    swallowClickUntil = Date.now() + 700;
    if (emitAction) interaction({ kind: 'entry.open', target }, modality, 'reader-token');
    go(
      { t: 'word', id: token.b, from: { passage: p.id, index } },
      { invoker: span },
    );
  };
  const quickLook = (modality = 'pointer', emitAction = false) => {
    if (emitAction) interaction({ kind: 'quickLook.open', target }, modality, 'reader-token');
    showMini(span, token, (entryModality) => openFull(entryModality, true), {
      focusEntry: modality !== 'pointer',
    });
  };
  const activate = (modality) => {
    interaction({ kind: 'target.activate', target }, modality, 'reader-token');
    (S.revealed ||= new Set());
    (S.glossed ||= new Set());
    const hasReading = S.dials.furigana === 2 || S.revealed.has(index);
    const hasEn = S.glossed.has(index);
    if (!hasReading) {
      S.revealed.add(index);
      paintTok(span, token, index);
      return;
    }
    if (!hasEn) {
      S.glossed.add(index);
      paintTok(span, token, index);
      return;
    }
    openFull(modality, false);
  };
  const clear = () => {
    clearTimeout(miniTimer);
    clearTimeout(fullTimer);
    miniTimer = fullTimer = null;
  };
  span.addEventListener('contextmenu', (ev) => ev.preventDefault());
  span.addEventListener('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY, at: Date.now() };
    miniTimer = setTimeout(() => quickLook('pointer', true), GESTURE.MINI_MS);
    fullTimer = setTimeout(() => openFull('pointer', true), GESTURE.FULL_MS);
  });
  span.addEventListener('pointermove', (ev) => {
    if (!down) return;
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > GESTURE.MOVE_PX) {
      clear();
      down = null;
    }
  });
  span.addEventListener('pointercancel', () => {
    clear();
    down = null;
  });
  span.addEventListener('pointerup', () => {
    if (!down) return;
    const held = Date.now() - down.at;
    down = null;
    clear();
    if (held >= GESTURE.MINI_MS) return; // mini stays up; tap it for the full entry
    activate('pointer');
  });
  span.addEventListener('click', (event) => {
    // Pointer activation was handled on pointerup so its reveal is immediate.
    // Native keyboard/switch/AT activation arrives as a click with detail 0.
    if (event.detail !== 0 || Date.now() < swallowClickUntil) return;
    activate('keyboard');
  });
  return {
    target,
    quickLook: (modality) => quickLook(modality, false),
    openEntry: (modality) => openFull(modality, false),
  };
}

function renderReader(main) {
  const p = passage();
  if (!p) {
    S.view = 'shelf';
    return renderShelf(main);
  }
  main.append(el('p', 'eyebrow', p.sourceLabel));
  main.append(el('h1', 'view-title', p.title));
  const lv = levelPhrase(p.grading);
  const levelLine = el('div', 'level-line');
  levelLine.append(el('span', 'level-chip', bi() ? lv.level : lv.ja));
  levelLine.append(el('span', 'level-note', bi() ? `${lv.ja}${lv.note}` : lv.noteJa));
  main.append(levelLine);

  // the dials fold away — the text is the point, the settings one tap away
  const dialsToggle = el('button', 'details-toggle');
  dialsToggle.type = 'button';
  dialsToggle.id = 'dials-toggle';
  dialsToggle.textContent = (S.dialsOpen ? '▾ ' : '▸ ') + tx('文字設定', 'text settings 文字設定');
  dialsToggle.addEventListener('click', () => {
    S.dialsOpen = !S.dialsOpen;
    render();
  });
  main.append(dialsToggle);
  if (S.dialsOpen) {
    const dials = el('div', 'dials');
    dials.append(
      dialRow('漢字', 'kanji', 'kanji', [
        ['そのまま', 'as written'],
        ['常用まで', 'jōyō only'],
        ['すべて仮名', 'all kana'],
      ]),
    );
    dials.append(
      dialRow('ふりがな', 'readings', 'furigana', [
        ['なし', 'off'],
        ['触れて', 'on touch'],
        ['つねに', 'always'],
      ]),
    );
    dials.append(
      dialRow('分かち', 'spacing', 'spacing', [
        ['なし', 'none'],
        ['語の間', 'words'],
        ['文節', 'phrases'],
      ]),
    );
    main.append(dials);
  }

  const grammarHint = el('p', 'gesture-hint');
  grammarHint.textContent = tx(
    '触れる＝ふりがな · もう一度＝英語 · 三回目＝全項目 · フォーカス＝長押し不要の操作',
    'activate = reading · again = English · third = full entry · focus = no-hold actions',
  );
  main.append(grammarHint);

  const reader = el('div', 'reader');
  reader.id = 'reader';
  if (S.dials.spacing === 1) reader.classList.add('sp-word');
  if (S.dials.spacing === 2) reader.classList.add('sp-bunsetsu');

  if (!p.tokens) {
    // the article body is still arriving from its own file
    const wait = el('div', 'note');
    wait.textContent = S.loadError
      ? tx('本文を読み込めなかった。もう一度ひらいてください。', 'The text failed to load — please open it again.')
      : tx('本文を読み込んでいる…', 'Fetching the text…');
    main.append(reader, wait);
    return;
  }

  const paraBreaks = new Set(p.paras || []);
  let group = null;
  for (const [index, token] of p.tokens.entries()) {
    if (index > 0 && paraBreaks.has(index)) {
      reader.append(el('span', 'para-break'));
      group = null;
    }
    const particle = !token.c ? PARTICLE_BY_SURFACE[token.s] : null;
    const interactive = !!token.c || !!particle;
    const span = el(interactive ? 'button' : 'span', token.c ? 'tok content' : 'tok plain');
    if (interactive) span.type = 'button';
    span.dataset.index = String(index);
    if (token.c) {
      span.dataset.word = token.b;
      span.dataset.action = 'target.activate';
      span.dataset.targetKind = 'word';
      span.setAttribute('aria-haspopup', 'dialog');
      span.setAttribute('aria-label', tokenAccessibleLabel(token, index));
    } else if (particle) {
      span.dataset.action = 'target.activate';
      span.dataset.targetKind = 'particle';
      span.setAttribute('aria-haspopup', 'dialog');
      span.setAttribute(
        'aria-label',
        tx(`${particle.p}、助詞。通常の操作は何もしない。フォーカスで助詞の項目へ。`, `${particle.p}, particle; ordinary activation is inert; focus for its full entry`),
      );
    }
    if (S.revealed && S.revealed.has(index)) span.classList.add('lit');
    span.append(
      rubyNode(displayPairs(token), {
        furigana: S.dials.furigana,
        revealed: S.dials.furigana === 2 || (S.revealed && S.revealed.has(index)),
      }),
    );
    if (token.c && S.glossed?.has(index)) {
      const g = lookup(token.b);
      if (g?.m?.length) {
        span.classList.add('has-en');
        span.append(el('span', 'tok-en', inlineGloss(g)));
      }
    }
    let rendered = span;
    if (interactive) {
      const wrapper = el('span', 'token-door');
      wrapper.append(span);
      if (token.c) {
        const adapter = wireTokenGestures(span, token, index, p);
        installTokenAlternatives(wrapper, span, adapter.target, adapter);
      } else if (particle) {
        const adapter = wireParticleGestures(span, particle);
        installTokenAlternatives(wrapper, span, adapter.target, adapter);
      }
      rendered = wrapper;
    }
    if (S.dials.spacing === 2) {
      if (token.c || !group) {
        group = el('span', 'bunsetsu');
        reader.append(group);
      }
      group.append(rendered);
    } else {
      reader.append(rendered);
    }
  }
  main.append(reader);

  if (p.truncated) {
    const note = el('div', 'note');
    note.textContent = tx(
      `原典からの抜粋（先頭 ${p.text.length} 字、文単位）。`,
      `Excerpt — the first ${p.text.length} characters of the source, cut at a sentence boundary.`,
    );
    if (p.url) {
      const a = el('a', null, tx(' 原典', ' source 原典'));
      a.href = p.url;
      a.rel = 'noreferrer';
      a.target = '_blank';
      a.className = 'inline-link';
      note.append(a);
    }
    main.append(note);
  }
  const attribution = el('div', 'note');
  attribution.textContent = p.attribution;
  main.append(attribution);
}

/* The Drift entry (Phase 2): the real 墨流し universe fills the viewport on
 * its own layer beneath the chrome; the corridor contributes exactly one
 * thing here — the door into the shelf. 藍 indigo, per the palette law:
 * "you can go here". */
function renderDrift(main) {
  main.style.padding = '0';
  const door = biLabel('button', 'drift-door', '本棚', 'the shelf');
  door.type = 'button';
  door.id = 'enter-shelf-door';
  door.addEventListener('click', () => {
    S.view = 'shelf';
    render();
    window.scrollTo(0, 0);
  });
  main.append(door);
}

function renderEntry(main) {
  main.style.padding = '0 16px 92px';
  const field = el('div', 'field');
  field.id = 'field';
  const seeds = [];
  for (const p of D.passages) {
    // index rows carry a seed list so the field is full before articles load
    for (const w of p.seeds || []) {
      if (seeds.length < 26 && !seeds.includes(w)) seeds.push(w);
    }
    for (const t of p.tokens || []) {
      if (t.c && t.s.length > 1 && seeds.length < 26 && !seeds.includes(t.b)) seeds.push(t.b);
    }
  }
  seeds.forEach((word, i) => {
    const node = el('div', 'field-word', word);
    // deterministic pseudo-scatter — no rng, so screenshots are reproducible
    const x = ((i * 37) % 78) + 4;
    const y = ((i * 53) % 82) + 4;
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
    node.style.fontSize = `${13 + ((i * 7) % 11)}px`;
    // the WCAG side lifts the field's floor too — at 0.35 the words all but vanish
    const floor = S.variants.contrast === 'wcag' ? 55 : 35;
    node.style.opacity = String((floor + ((i * 13) % (95 - floor))) / 100);
    node.style.animationDuration = `${9 + (i % 7)}s`;
    node.style.animationDelay = `-${i * 0.7}s`;
    node.addEventListener('click', () => go({ t: 'word', id: word }));
    field.append(node);
  });
  const enter = el('button', 'field-enter', tx('棚へ　→', '棚へ　to the shelf →'));
  enter.type = 'button';
  enter.id = 'enter-shelf';
  enter.addEventListener('click', () => {
    S.view = 'shelf';
    render();
  });
  field.append(enter);
  main.append(field);

  const note = el('div', 'note placeholder');
  note.innerHTML = tx(
    '<b>仮置き</b> — これは入口の位置を比べるための最小の野であって、Drift そのものではない。' +
      'Drift の物理とジェスチャ文法は #46 で未決のまま、触っていない。本物の Drift はサイトの root にある。',
    '<b>placeholder</b> — a minimal field for comparing where you land, not Drift itself. ' +
      "Drift's physics and gesture grammar stay untouched (#46). The real Drift lives at the site root.",
  );
  main.append(note);
}

function renderTray(main) {
  main.append(withEn(el('p', 'eyebrow', 'リスト'), 'your lists', 'en-inline'));
  main.append(
    el('h1', 'view-title', tx(`覚える ${S.taken.length} 件`, `Memorizing ${S.taken.length} item${S.taken.length === 1 ? '' : 's'}`)),
  );
  if (!S.taken.length) {
    main.append(
      el(
        'div',
        'sem-empty',
        tx(
          'まだ何もない。語・漢字・部品・熟語のページの「覚える」から入る。',
          'Nothing here yet. The 覚える memorize button on any word, kanji, part, or idiom page adds it — this month’s list fills itself.',
        ),
      ),
    );
    return;
  }

  // month buckets fill themselves; named lists sit above them
  const buckets = new Map();
  for (const item of S.taken) {
    const key = monthKey(item.ts || 0);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  const sections = [
    ...Object.entries(S.lists).map(([name, items]) => ({ name, items, manual: true })),
    ...[...buckets.entries()].map(([name, items]) => ({ name, items, manual: false })),
  ];
  for (const sec of sections) {
    const head = el('p', 'eyebrow list-head');
    head.append(document.createTextNode(`${sec.name} — ${sec.items.length}`));
    if (bi()) head.append(el('span', 'en-inline', sec.manual ? 'named list' : 'auto · monthly'));
    main.append(head);
    for (const item of sec.items) {
      const line = el('div', 'tray-line');
      line.append(el('span', 'w', item.label));
      line.append(el('span', 'pool-tag', tx(item.kind || '', item.kindEn || item.kind || '')));
      const preview = schedulePreview();
      line.append(el('span', 'when', preview ? preview.good.when : '—'));
      line.addEventListener('click', () => go({ t: item.t, id: item.id }));
      main.append(line);
    }
  }
}

/* ------------------------------------------------------------- particles
 * The structural law (design doc §4): particles are first-class doors, not
 * dead pixels between words. Original content, authored for KAIRO. */
const PARTICLES = [
  { id: 'wa', p: 'は', r: 'わ', role: 'topic', roleJa: '主題', exp: 'Frames what the sentence is about — everything after は is said ABOUT it. Contrast lives here too: 犬は好きだが猫は…', ex: [{ ja: '知床半島は北海道にある。', en: 'As for the Shiretoko Peninsula, it is in Hokkaidō.' }, { ja: '今日は寒い。', en: 'Today (at least) is cold.' }], see: 'wa-ga' },
  { id: 'ga', p: 'が', r: 'が', role: 'subject', roleJa: '主格', exp: 'Picks out WHICH one — the doer or the thing being described, often new information or the answer to a question word.', ex: [{ ja: '雨が降っている。', en: 'Rain is falling.' }, { ja: 'だれが来たの？', en: 'WHO came?' }], see: 'wa-ga' },
  { id: 'wo', p: 'を', r: 'を', role: 'direct object', roleJa: '対格', exp: 'Marks what the action is done TO — and the space moved THROUGH with motion verbs (空を飛ぶ).', ex: [{ ja: '本を読む。', en: 'To read a book.' }, { ja: '公園を歩く。', en: 'To walk through the park.' }] },
  { id: 'ni', p: 'に', r: 'に', role: 'target · time · location-of-being', roleJa: '着点・時点・存在場所', exp: 'The arrow-point: destination of motion, time of an event, place where something exists, and the receiver of giving.', ex: [{ ja: '七時に起きる。', en: 'To get up at seven.' }, { ja: '東京に住んでいる。', en: 'To live in Tokyo.' }] },
  { id: 'de', p: 'で', r: 'で', role: 'place-of-action · means', roleJa: '動作場所・手段', exp: 'Where an action happens, or the tool it happens BY: 会議はここで開かれる、バスで行く。Also the boundary of a total (三人で).', ex: [{ ja: 'ダーバンで開催中の会議', en: 'the conference being held in Durban' }, { ja: '箸で食べる。', en: 'To eat with chopsticks.' }] },
  { id: 'to', p: 'と', r: 'と', role: 'with · and · quotation', roleJa: '共同・並列・引用', exp: 'An exhaustive AND (A と B and that is the whole list), doing something WITH someone, and the mouth of a quote (…と言う).', ex: [{ ja: 'フィヨルドと知床半島が登録された。', en: 'The fjords and the Shiretoko Peninsula were registered.' }, { ja: '行くと言った。', en: 'They said they would go.' }] },
  { id: 'mo', p: 'も', r: 'も', role: 'also · even', roleJa: '同類・強調', exp: 'ALSO this one — and stretched, EVEN this one (子供もわかる). Replaces は・が・を; stacks after other particles (にも, でも).', ex: [{ ja: '知床半島も登録された。', en: 'The Shiretoko Peninsula was ALSO registered.' }, { ja: '一円もない。', en: 'I do not have even one yen.' }] },
  { id: 'no', p: 'の', r: 'の', role: 'of · belonging', roleJa: '連体・所有', exp: "Ties two nouns: B of A, A's B, B which is A. Also nominalizes (読むのが好き) and softens questions (行くの？).", ex: [{ ja: '日本の知床半島', en: "Japan's Shiretoko Peninsula" }, { ja: '泳ぐのが好きだ。', en: 'I like swimming.' }] },
  { id: 'e', p: 'へ', r: 'え', role: 'toward', roleJa: '方向', exp: 'The direction faced, softer than に about arriving: 東へ向かう cares about the heading, not the doorstep.', ex: [{ ja: '北へ向かう。', en: 'To head north.' }, { ja: '日本への手紙', en: 'a letter to Japan' }] },
  { id: 'kara', p: 'から', r: 'から', role: 'from · because', roleJa: '起点・理由', exp: 'The starting point in space or time — and, after a clause, the speaker’s reason (寒いから閉めて).', ex: [{ ja: '駅から歩く。', en: 'To walk from the station.' }, { ja: '寒いから、窓を閉めた。', en: 'Because it was cold, I shut the window.' }] },
  { id: 'made', p: 'まで', r: 'まで', role: 'until · as far as', roleJa: '限界点', exp: 'The far edge: up TO a place, UNTIL a time, and rhetorically even-as-far-as (子供にまで笑われた).', ex: [{ ja: '駅まで走った。', en: 'I ran as far as the station.' }, { ja: '五時まで働く。', en: 'To work until five.' }] },
  { id: 'yori', p: 'より', r: 'より', role: 'than · from (formal)', roleJa: '比較・起点', exp: 'The yardstick of comparison (AよりB), and a formal FROM in written Japanese (東京より).', ex: [{ ja: '飛行機は船より速い。', en: 'Planes are faster than ships.' }, { ja: '午後三時より開催。', en: 'Held from 3 p.m. (formal notice).' }] },
  { id: 'ka', p: 'か', r: 'か', role: 'question · or', roleJa: '疑問・選択', exp: 'The spoken question mark — and OR between choices (コーヒーか紅茶). Doubled, it shrugs: 行くかどうか.', ex: [{ ja: '行きますか。', en: 'Are you going?' }, { ja: 'コーヒーか紅茶にする。', en: 'I will have coffee or tea.' }] },
  { id: 'ne', p: 'ね', r: 'ね', role: 'shared feeling', roleJa: '確認・共感', exp: 'Reaches for agreement — "right?" It assumes the listener already half-knows.', ex: [{ ja: 'いい天気ですね。', en: 'Lovely weather, isn’t it?' }, { ja: 'また明日ね。', en: 'See you tomorrow, yeah?' }] },
  { id: 'yo', p: 'よ', r: 'よ', role: 'new information', roleJa: '告知', exp: 'Hands the listener something they did not know — friendly emphasis, not shouting.', ex: [{ ja: '電車、もう出ましたよ。', en: 'The train has already left, you know.' }, { ja: '大丈夫だよ。', en: 'It’s okay, really.' }] },
  { id: 'ba', p: 'ば', r: 'ば', role: 'if (conditional)', roleJa: '仮定', exp: 'The bare IF of the ば-form: 読めば分かる — if you read it, you will see. General truths and advice live here.', ex: [{ ja: '読めば分かる。', en: 'If you read it, you will understand.' }, { ja: '安ければ買う。', en: 'If it is cheap, I will buy it.' }] },
  { id: 'ya', p: 'や', r: 'や', role: 'and (open list)', roleJa: '例示並列', exp: 'A sampling AND: 本やペン — books, pens, that sort of thing. と closes the list; や leaves the door open.', ex: [{ ja: '屋久島や白神山地', en: 'Yakushima, Shirakami-Sanchi, and the like' }, { ja: '肉や野菜を買う。', en: 'To buy meat, vegetables, and so on.' }] },
  { id: 'shi', p: 'し', r: 'し', role: 'and what’s more', roleJa: '列挙・理由', exp: 'Stacks reasons with a nod that there are more: 安いし、近いし。', ex: [{ ja: '安いし、うまいし、また来る。', en: 'It’s cheap, it’s good — I’ll come again.' }, { ja: '雨だし、今日はやめよう。', en: 'It’s raining (among other things), let’s not today.' }] },
];
const PARTICLE_BY_SURFACE = Object.fromEntries(PARTICLES.map((p) => [p.p, p]));

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
  sheet.append(el('p', 'gloss', bi() ? pt.exp : pt.exp));
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
    row.append(el('span', 'row-main', `${g.p} — ${bi() ? g.mEn : g.mJa}`));
    row.append(el('span', 'row-go', '›'));
    row.addEventListener('click', () => go({ t: 'grammar', id: g.id }));
    sheet.append(row);
  }
}

/** Particles keep the reading rhythm: a tap does nothing, a long press
 * floats the mini, holding opens the particle page. */
function wireParticleGestures(span, particle) {
  let miniTimer = null;
  let fullTimer = null;
  let down = null;
  const target = { kind: 'particle', id: particle.id };
  const openFull = (modality = 'pointer', emitAction = true) => {
    removeMini();
    swallowClickUntil = Date.now() + 700;
    if (emitAction) interaction({ kind: 'entry.open', target }, modality, 'reader-particle');
    go({ t: 'particle', id: particle.id }, { invoker: span });
  };
  const quickLook = (modality = 'pointer', emitAction = false) => {
    if (emitAction) interaction({ kind: 'quickLook.open', target }, modality, 'reader-particle');
    removeMini();
    const mini = el('div', null);
    mini.id = 'mini';
    mini.setAttribute('role', 'dialog');
    mini.setAttribute('aria-label', tx(`${particle.p} の語釈`, `${particle.p} particle quick look`));
    mini.append(el('span', 'mini-word', particle.p));
    mini.append(el('span', 'mini-gloss', bi() ? particle.role : particle.roleJa));
    mini.append(el('span', 'mini-hint', tx('助詞の全項目へ進める', 'open the complete particle entry')));
    const entry = biLabel('button', 'mini-entry', '助詞へ', 'full entry');
    entry.type = 'button';
    entry.dataset.action = 'entry.open';
    entry.dataset.targetKind = 'particle';
    entry.addEventListener('click', (event) => {
      event.stopPropagation();
      openFull(event.detail === 0 ? 'keyboard' : 'pointer', true);
    });
    mini.append(entry);
    document.body.append(mini);
    const r = span.getBoundingClientRect();
    const m = mini.getBoundingClientRect();
    const above = r.top > m.height + 70;
    mini.style.left = `${Math.max(8, Math.min(window.innerWidth - m.width - 8, r.left + r.width / 2 - m.width / 2))}px`;
    mini.style.top = `${above ? r.top - m.height - 10 : r.bottom + 10}px`;
    if (modality !== 'pointer') entry.focus({ preventScroll: true });
  };
  const clear = () => {
    clearTimeout(miniTimer);
    clearTimeout(fullTimer);
    miniTimer = fullTimer = null;
  };
  span.classList.add('particle');
  span.addEventListener('contextmenu', (ev) => ev.preventDefault());
  span.addEventListener('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY, at: Date.now() };
    miniTimer = setTimeout(() => quickLook('pointer', true), GESTURE.MINI_MS);
    fullTimer = setTimeout(() => openFull('pointer', true), GESTURE.FULL_MS);
  });
  span.addEventListener('pointermove', (ev) => {
    if (!down) return;
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > GESTURE.MOVE_PX) {
      clear();
      down = null;
    }
  });
  span.addEventListener('pointercancel', () => {
    clear();
    down = null;
  });
  span.addEventListener('pointerup', () => {
    if (down && Date.now() - down.at < GESTURE.MINI_MS) {
      interaction({ kind: 'target.activate', target }, 'pointer', 'reader-particle');
    }
    clear();
    down = null;
  });
  span.addEventListener('click', (event) => {
    if (event.detail !== 0 || Date.now() < swallowClickUntil) return;
    interaction({ kind: 'target.activate', target }, 'keyboard', 'reader-particle');
    // Intentionally inert: the explicit adjacent entry.open control is the
    // keyboard/switch/screen-reader door without changing pointer rhythm.
  });
  return {
    target,
    quickLook: (modality) => quickLook(modality, false),
    openEntry: (modality) => openFull(modality, false),
  };
}

/* --------------------------------------------------------------- search
 * The Renzo lesson (design doc §7.2): one quiet field eating kanji, kana,
 * romaji, and English, answering while you type. Four doors, one box. */
const KATA_TO_HIRA_OFFSET = 0x30a1 - 0x3041;
function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - KATA_TO_HIRA_OFFSET));
}

/** Hepburn-ish romaji → hiragana, table-driven longest match. Returns null
 * when the input cannot be fully converted (then it is English, not romaji). */
const ROMAJI = (() => {
  const m = {
    kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
    cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
    hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
    rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
    ja: 'じゃ', ju: 'じゅ', jo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
    bya: 'びゃ', byu: 'びゅ', byo: 'びょ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
    shi: 'し', chi: 'ち', tsu: 'つ', dzu: 'づ',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
    sa: 'さ', si: 'し', su: 'す', se: 'せ', so: 'そ',
    ta: 'た', ti: 'ち', tu: 'つ', te: 'て', to: 'と',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
    ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
    ya: 'や', yu: 'ゆ', yo: 'よ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
    wa: 'わ', wo: 'を',
    ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    za: 'ざ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ', ji: 'じ',
    da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
    pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  };
  return (input) => {
    let s = input.toLowerCase().replace(/[^a-z']/g, '');
    if (!s) return null;
    let out = '';
    while (s.length) {
      if (s[0] === "'") {
        s = s.slice(1);
        continue;
      }
      // sokuon: doubled consonant (not n)
      if (s.length > 1 && s[0] === s[1] && 'kstcpgzdbfhjmyrw'.includes(s[0])) {
        out += 'っ';
        s = s.slice(1);
        continue;
      }
      // n before consonant or at end → ん
      if (s[0] === 'n' && (s.length === 1 || !'aiueoyn'.includes(s[1]))) {
        out += 'ん';
        s = s.slice(1);
        continue;
      }
      if (s.startsWith('nn') && (s.length === 2 || !'aiueoy'.includes(s[2]))) {
        out += 'ん';
        s = s.slice(2);
        continue;
      }
      let hit = null;
      for (const len of [3, 2, 1]) {
        const piece = s.slice(0, len);
        if (m[piece]) {
          hit = m[piece];
          s = s.slice(len);
          break;
        }
      }
      if (!hit) return null; // not romaji — treat the query as English
      out += hit;
    }
    return out || null;
  };
})();

/**
 * Normalise one English gloss (or one English query) to its bare head phrase,
 * so that a whole-gloss match can be recognised across the shapes JMdict-style
 * glosses actually take:
 *   · parenthetical qualifiers are dropped — "world (of haiku, art, etc.)" → "world",
 *     "water (esp. cool or cold)" → "water";
 *   · one leading article or infinitive marker is dropped — "the world" → "world",
 *     "to eat" → "eat" — but only when something survives, so the gloss "a" or
 *     the query "to" stays itself.
 * Applied to BOTH sides, so typing "the world" or "to eat" lands the same place.
 */
const GLOSS_MESSY = /[(]|\s\s|[^\S ]/; // parenthesis, doubled space, or exotic whitespace
const GLOSS_LEAD = new Set(['the', 'a', 'an', 'to']);
function normalizeGloss(s) {
  let bare = String(s).toLowerCase();
  // the regex work is the whole index-build cost, and ~80% of glosses are
  // already clean — so pay for it only when the string actually needs it.
  if (GLOSS_MESSY.test(bare)) {
    bare = bare.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
  }
  bare = bare.trim();
  const sp = bare.indexOf(' ');
  if (sp > 0 && GLOSS_LEAD.has(bare.slice(0, sp))) return bare.slice(sp + 1);
  return bare;
}

// commonness rank for the exact-gloss tiers: a graded (JLPT) word is the one a
// learner means. 0 = N5 … 4 = N1, 5 = ungraded.
const JLPT_RANK = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
const jlptRank = (lv) => JLPT_RANK[String(lv || '').toUpperCase()] ?? 5;

let searchIndex = null;
function buildSearchIndex() {
  if (searchIndex) return;
  searchIndex = [];
  for (const [w, rec] of Object.entries(D.dict)) {
    const glosses = rec.m || [];
    searchIndex.push({
      t: 'word', id: w, w,
      r: rec.r || '',
      rh: kataToHira(rec.r || ''),
      m: glosses.join('; ').toLowerCase(),
      g: glosses[0] || '',
      ng: glosses.map(normalizeGloss),
      j: jlptRank(rec.jlpt),
    });
  }
  for (const [c, k] of Object.entries(D.kanji)) {
    const readings = [...k.on, ...k.kun].join('・');
    searchIndex.push({
      t: 'kanji', id: c, w: c,
      r: readings,
      rh: kataToHira([...k.on, ...k.kun].join(' ')),
      m: String(k.m).toLowerCase(),
      g: k.m,
      ng: [normalizeGloss(k.m)],
      j: 5,
    });
  }
  for (const g of GRAMMARS()) {
    searchIndex.push({
      t: 'grammar', id: g.id, w: g.p, r: g.lv, rh: '',
      m: `${g.mEn} ${g.mJa}`.toLowerCase(), g: g.mEn,
      ng: [normalizeGloss(g.mEn)], j: jlptRank(g.lv),
    });
  }
  for (const pt of PARTICLES) {
    searchIndex.push({
      t: 'particle', id: pt.id, w: pt.p,
      r: '助詞',
      rh: pt.r,
      m: `${pt.role} ${pt.roleJa} particle`.toLowerCase(),
      g: pt.role,
      ng: [normalizeGloss(pt.role)],
      j: 5,
    });
  }
}

function searchResults(query) {
  buildSearchIndex();
  const q = query.trim();
  if (!q) return [];
  const hasKanji = /[一-鿌]/.test(q);
  const hasKana = /[぀-ゖァ-ヺ]/.test(q);
  const qh = hasKana ? kataToHira(q) : ROMAJI(q);
  const ql = q.toLowerCase();
  const qn = hasKanji || hasKana ? '' : normalizeGloss(q);
  const scored = [];
  for (const e of searchIndex) {
    let score = -1;
    // Only the English exact-gloss tiers set this; every other lane leaves it
    // at 0, so their relative order stays exactly what it was (score, then
    // shorter headword) — the kana, romaji and kanji doors are untouched.
    let tie = 0;
    if (hasKanji) {
      if (e.w === q) score = 100;
      else if (e.w.startsWith(q)) score = 80;
      else if (e.w.includes(q)) score = 60;
    } else if (hasKana) {
      if (e.rh === qh) score = 100;
      else if (e.rh.startsWith(qh)) score = 80;
      else if (e.w.includes(q)) score = 60;
    } else {
      // latin: try as romaji reading AND as english
      if (qh) {
        if (e.rh === qh) score = Math.max(score, 95);
        else if (e.rh.startsWith(qh)) score = Math.max(score, 75);
      }
      if (e.m) {
        // English priority tiers, above the old word-boundary/substring pair:
        //   92 · the query IS this entry's PRIMARY gloss   ("world" → 世界 "the world")
        //   85 · the query IS one of its later glosses     ("world" → 俗 "…; the world; …")
        // Both sit under the romaji-exact 95, so the reading door still wins
        // when a query is genuine romaji.
        const gi = qn ? e.ng.indexOf(qn) : -1;
        const exact = gi === 0 ? 92 : gi > 0 ? 85 : -1;
        if (exact > score) {
          score = exact;
          // within a tier: real words before single-kanji meaning-labels,
          // then earlier gloss position, then commonness, then shorter word.
          tie = (e.t === 'kanji' ? 1000 : 0) + gi * 10 + e.j;
        }
        const at = e.m.indexOf(ql);
        if (at === 0 || (at > 0 && ' ;('.includes(e.m[at - 1]))) score = Math.max(score, 70);
        else if (at > 0) score = Math.max(score, 40);
      }
    }
    if (score >= 0) scored.push({ e, score, tie });
  }
  scored.sort((a, b) => b.score - a.score || a.tie - b.tie || a.e.w.length - b.e.w.length);
  return scored.slice(0, 40).map((x) => x.e);
}

function renderSearchResults(main, query) {
  const results = searchResults(query);
  const box = el('div', 'entry-rows');
  box.id = 'search-results';
  for (const e of results) {
    const row = el('button', 'entry-row compound');
    row.type = 'button';
    row.dataset.result = `${e.t}:${e.id}`;
    if (e.t === 'kanji') {
      row.append(el('span', 'row-glyph', e.w));
      const stack = el('span', 'row-stack');
      stack.append(el('span', 'row-gloss', e.g));
      stack.append(el('span', 'row-gloss', e.r));
      row.append(stack);
    } else {
      const stack = el('span', 'row-stack');
      const top = el('span', 'row-word');
      top.append(document.createTextNode(e.w));
      if (e.r) top.append(el('span', 'row-reading', e.r));
      stack.append(top);
      if (e.g) stack.append(el('span', 'row-gloss', e.g));
      row.append(stack);
    }
    row.append(el('span', 'row-go', '›'));
    row.addEventListener('click', () => go({ t: e.t, id: e.id }));
    box.append(row);
  }
  if (!results.length) {
    box.append(el('div', 'sem-empty', tx('見つからない。', 'Nothing found for that yet.')));
  }
  main.append(box);
}

/* -------------------------------------------------------------- grammar */
function renderGrammar(main) {
  main.append(withEn(el('p', 'eyebrow', '文法辞典'), 'grammar dictionary', 'en-inline'));
  main.append(el('h1', 'view-title', tx('文法', 'Grammar')));
  const sub = el('p', 'shelf-snippet intro');
  sub.textContent = tx(
    `${GRAMMARS().length} 項目。全項目版はこれから育てる。`,
    `${GRAMMARS().length} entries, original content. The full dictionary-grade index grows from here.`,
  );
  main.append(sub);

  const levels = ['all', 'N5', 'N4', 'N3', 'N2', 'N1'];
  const chips = el('div', 'chips');
  for (const lv of levels) {
    const active = (S.grammarLevel || 'all') === lv;
    const chip = el('button', active ? 'chip wide on-list' : 'chip wide');
    chip.type = 'button';
    chip.dataset.glevel = lv;
    chip.append(el('span', 'big', lv === 'all' ? tx('すべて', 'all') : lv));
    chip.addEventListener('click', () => {
      S.grammarLevel = lv;
      render();
    });
    chips.append(chip);
  }
  main.append(chips);

  const rows = el('div', 'entry-rows');
  const shown = GRAMMARS().filter(
    (g) => (S.grammarLevel || 'all') === 'all' || g.lv === S.grammarLevel,
  );
  for (const g of shown) {
    const row = el('button', 'entry-row compound');
    row.type = 'button';
    row.dataset.grammar = g.id;
    const main2 = el('span', 'row-stack');
    const top = el('span', 'row-word');
    top.append(document.createTextNode(g.p));
    top.append(el('span', 'row-level', g.lv));
    main2.append(top);
    main2.append(el('span', 'row-gloss', bi() ? g.mEn : g.mJa || g.mEn));
    row.append(main2, el('span', 'row-go', '›'));
    row.addEventListener('click', () => go({ t: 'grammar', id: g.id }));
    rows.append(row);
  }
  main.append(rows);
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
  sheet.append(el('p', 'gloss', meaning));
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

/* ---------------------------------------------------------------- nodes */
function nodeTitle(node) {
  if (node.t === 'word') return node.id;
  if (node.t === 'kanji') return node.id;
  if (node.t === 'radical') return node.id;
  if (node.t === 'idiom') return node.id;
  if (node.t === 'grammar') return GRAMMARS().find((x) => x.id === node.id)?.p || node.id;
  if (node.t === 'particle') return PARTICLES.find((x) => x.id === node.id)?.p || node.id;
  return '';
}

function chipsFor(items, onTap, sub, kind) {
  const wrap = el('div', 'chips');
  for (const item of items) {
    const chip = el('button', kind ? `chip t-${kind}` : 'chip');
    chip.type = 'button';
    chip.append(el('span', 'big', item.label));
    const subText = sub ? sub(item) : item.sub;
    if (subText) chip.append(el('span', 'sub', subText));
    chip.addEventListener('click', () => onTap(item));
    wrap.append(chip);
  }
  return wrap;
}

const NODE_KIND = {
  word: ['語', 'word'],
  kanji: ['漢字', 'kanji'],
  radical: ['部品', 'part'],
  idiom: ['熟語', 'idiom'],
};

function takeButton(node, label) {
  const already = S.taken.some((t) => t.t === node.t && t.id === node.id);
  const btn = biLabel(
    'button',
    already ? 'take taken' : 'take',
    already ? '覚える ✓' : '覚える',
    already ? 'memorizing' : 'memorize',
  );
  btn.type = 'button';
  btn.id = 'take';
  btn.addEventListener('click', () => {
    if (already) return;
    S.taken.push({
      t: node.t,
      id: node.id,
      label,
      kind: NODE_KIND[node.t][0],
      kindEn: NODE_KIND[node.t][1],
      from: node.from || null,
      ts: Date.now(),
    });
    saveStore();
    render();
  });
  return btn;
}

/** After 覚える: the item lands in this month's bucket automatically (the
 * operator's Renzo habit, automated) and can join any named list too. */
function renderListPicker(sheet, node, label) {
  const item = S.taken.find((t) => t.t === node.t && t.id === node.id);
  if (!item) return;
  const wrap = el('div', 'list-picker');
  wrap.append(
    withEn(el('p', 'eyebrow', `リスト — ${monthKey(item.ts)} に自動追加ずみ`), `lists — already in ${monthKey(item.ts)}`, 'en-inline'),
  );
  const chips = el('div', 'chips');
  for (const name of Object.keys(S.lists)) {
    const inList = S.lists[name].some((x) => x.t === node.t && x.id === node.id);
    const chip = el('button', inList ? 'chip wide on-list' : 'chip wide');
    chip.type = 'button';
    chip.append(el('span', 'big', name));
    chip.append(el('span', 'sub', `${S.lists[name].length}`));
    chip.addEventListener('click', () => {
      if (inList) S.lists[name] = S.lists[name].filter((x) => !(x.t === node.t && x.id === node.id));
      else S.lists[name].push({ t: node.t, id: node.id, label, ts: item.ts });
      saveStore();
      render();
    });
    chips.append(chip);
  }
  const add = el('button', 'chip wide');
  add.type = 'button';
  add.id = 'new-list';
  add.append(el('span', 'big', tx('＋ 新規リスト', '＋ new list')));
  add.addEventListener('click', () => {
    const name = window.prompt(tx('リスト名', 'List name'));
    if (!name || S.lists[name]) return;
    S.lists[name] = [{ t: node.t, id: node.id, label, ts: item.ts }];
    saveStore();
    render();
  });
  chips.append(add);
  wrap.append(chips);
  sheet.append(wrap);
}

function schedulePreview() {
  if (!scheduler || !fsrsApi) return null;
  const now = new Date();
  const card = fsrsApi.createEmptyCard(now);
  const result = scheduler.repeat(card, now);
  const out = {};
  for (const grade of ['Again', 'Hard', 'Good', 'Easy']) {
    const next = result[fsrsApi.Rating[grade]].card;
    const ms = next.due.getTime() - now.getTime();
    const mins = Math.round(ms / 60000);
    const days = next.scheduled_days;
    out[grade.toLowerCase()] = {
      when: days >= 1 ? tx(`${days} 日後`, `in ${days} d`) : tx(`${mins} 分後`, `in ${mins} min`),
      due: next.due.toISOString().slice(0, 16).replace('T', ' '),
      stability: next.stability,
      difficulty: next.difficulty,
    };
  }
  return out;
}

function renderSchedule(container) {
  const preview = schedulePreview();
  container.append(
    withEn(
      el('p', 'card-kind', tx('予定される復習', 'if you reviewed this now') + ` — FSRS-6 · ${D.pin.parameterSetId}`),
      null,
    ),
  );
  if (!preview) {
    container.append(el('div', 'sem-empty', tx('スケジューラを読み込めなかった。', 'The scheduler failed to load.')));
    return;
  }
  const table = el('table', 'sched');
  const head = el('tr');
  const headers = [
    ['評価', 'your rating'],
    ['つぎ', 'next review'],
    ['日時', 'due'],
    ['安定度', 'stability'],
  ];
  for (const [ja, en] of headers) head.append(withEn(el('th', null, ja), en));
  table.append(head);
  const labels = {
    again: ['もう一度', 'again'],
    hard: ['難しい', 'hard'],
    good: ['ふつう', 'good'],
    easy: ['簡単', 'easy'],
  };
  for (const key of ['again', 'hard', 'good', 'easy']) {
    const row = el('tr');
    row.append(withEn(el('td', null, labels[key][0]), labels[key][1]));
    row.append(el('td', key === 'good' ? 'good' : null, preview[key].when));
    row.append(el('td', null, preview[key].due));
    row.append(el('td', null, preview[key].stability.toFixed(2)));
    table.append(row);
  }
  container.append(table);
  const note = el('div', 'note');
  note.textContent = tx('実計算のプレビュー。まだ何も保存されない。', 'A real FSRS-6 preview — nothing is saved yet.');
  container.append(note);
}

/** Variant A (#38): the SAME target word rendered both ways. */
function renderCardVariant(container, target) {
  const source = target.from ? D.passages.find((p) => p.id === target.from.passage) : null;
  let sentence = null;
  let sentenceTokens = null;
  if (source && !source.tokens) ensureArticle(source).then(() => render()).catch(() => {});
  if (source?.tokens) {
    const tokens = source.tokens;
    let start = target.from.index;
    let end = target.from.index;
    while (start > 0 && !'。！？'.includes(tokens[start - 1].s)) start -= 1;
    while (end < tokens.length - 1 && !'。！？'.includes(tokens[end].s)) end += 1;
    sentenceTokens = tokens.slice(start, end + 1);
    sentence = sentenceTokens.map((t) => t.s).join('');
  }

  const box = el('div', 'card-preview');
  const kind = S.variants.cards;
  box.append(
    el(
      'p',
      'card-kind',
      kind === 'mcd'
        ? tx('MCD — 文脈まるごと、一語だけ空ける', 'MCD card — the whole context, one word blanked')
        : tx('単語札 — 表は語だけ（Animecards）', 'Word card — the front is the word alone (Animecards)'),
    ),
  );
  const face = el('div', 'card-face');

  if (kind === 'mcd') {
    if (sentenceTokens) {
      for (const token of sentenceTokens) {
        if (token.b === target.id && token.c) {
          face.append(el('span', 'cloze', '　　'));
        } else {
          face.append(document.createTextNode(token.s));
        }
      }
    } else {
      face.append(document.createTextNode(`［${target.id}］の文脈がない`));
    }
  } else {
    face.append(el('span', 'target', target.id));
  }
  box.append(face);

  const back = el('div', 'card-back');
  const word = D.words[target.id];
  const reading = word?.r || '';
  const gloss = word?.g || '';
  if (kind === 'mcd') {
    back.textContent = `${target.id}${reading ? `（${reading}）` : ''}${gloss ? ` — ${gloss}` : ''}`;
  } else {
    back.textContent =
      `${reading}${gloss ? ` — ${gloss}` : ''}` + (sentence ? `\n${sentence}` : '');
    back.style.whiteSpace = 'pre-line';
  }
  box.append(back);

  if (!sentence) {
    const note = el('div', 'note placeholder');
    note.innerHTML = tx(
      '<b>仮置き</b> — このノードは本文から開いていないので文脈の文がない。MCD 側は文脈がないと成立しない、というのがこの比較の要点のひとつ。',
      '<b>placeholder</b> — this node was not opened from a text, so there is no context sentence. That an MCD card cannot exist without context is one of the points of this comparison.',
    );
    box.append(note);
  }
  container.append(box);
}

/** Real usages from the committed shelf: sentences containing the word. */
function findExamples(id, cap = 4) {
  const out = [];
  for (const p of D.passages) {
    if (!p.tokens) continue; // not yet fetched — prefetch fills these in
    let sentence = [];
    let hit = false;
    for (const t of p.tokens) {
      sentence.push(t);
      if (t.c && t.b === id) hit = true;
      if ('。！？'.includes(t.s)) {
        if (hit) out.push({ tokens: sentence, source: p.sourceLabel, passage: p.id });
        sentence = [];
        hit = false;
        if (out.length >= cap) return out;
      }
    }
    if (hit && sentence.length) out.push({ tokens: sentence, source: p.sourceLabel, passage: p.id });
    if (out.length >= cap) return out;
  }
  return out;
}

function renderWordNode(sheet, node) {
  const rec = lookup(node.id);
  const legacy = D.words[node.id];
  const label = node.id;
  const head = el('h2', 'headword');
  head.append(document.createTextNode(label));
  if (rec?.alt) head.append(el('span', 'headword-alt', `／${rec.alt}`));
  sheet.append(head);
  if (rec?.r) sheet.append(el('p', 'reading', rec.r));

  // TRANSLATION — every sense, most common first (JMdict order)
  if (rec?.m?.length) {
    const box = el('div', 'senses');
    if (rec.p) box.append(el('p', 'sense-pos', rec.p));
    if (rec.m.length === 1) {
      box.append(el('p', 'gloss', rec.m[0]));
    } else {
      const ol = el('ol', 'sense-list');
      for (const m of rec.m) ol.append(el('li', null, m));
      box.append(ol);
    }
    sheet.append(box);
  } else {
    const gloss = el('p', 'gloss absent');
    gloss.textContent = tx('この語の語釈はまだない。読みと接続は下にある。', 'No gloss for this word yet — its reading and connections continue below.');
    sheet.append(gloss);
  }
  const jlpt = rec?.jlpt || (legacy?.jlpt ? `N${legacy.jlpt}` : null);
  if (jlpt) {
    const meta = el('div', 'shelf-meta');
    meta.append(el('span', 'pool-tag', `JLPT ${String(jlpt).replace(/^N?/, 'N')}`));
    sheet.append(meta);
  }

  // KANJI IN THIS WORD — each row opens that kanji's full entry
  const rowChars = (rec?.k?.length ? rec.k : [...node.id]).filter((c) => D.kanji[c]);
  if (rowChars.length) {
    sheet.append(withEn(el('p', 'eyebrow', 'この語の漢字'), 'kanji in this word', 'en-inline'));
    const rows = el('div', 'entry-rows');
    for (const c of rowChars) {
      const row = el('button', 'entry-row');
      row.type = 'button';
      row.dataset.kanjirow = c;
      row.append(el('span', 'row-glyph', c));
      row.append(el('span', 'row-main', D.kanji[c].m));
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go({ t: 'kanji', id: c, from: node.from }));
      rows.append(row);
    }
    sheet.append(rows);
  }

  // EXAMPLES — real sentences from the shelf, target in red
  const examples = findExamples(node.id);
  if (examples.length) {
    sheet.append(withEn(el('p', 'eyebrow', '用例'), 'examples from the shelf', 'en-inline'));
    for (const ex of examples) {
      const line = el('div', 'example');
      const text = el('p', 'example-ja');
      for (const t of ex.tokens) {
        if (t.c && t.b === node.id) text.append(el('span', 'example-hit', t.s));
        else text.append(document.createTextNode(t.s));
      }
      line.append(text);
      line.append(el('span', 'example-src', ex.source));
      sheet.append(line);
    }
  }

  // the semantic neighbourhood — the single most important surface here
  const edges = D.sem[node.id];
  const semWrap = el('div');
  semWrap.append(
    withEn(el('p', 'eyebrow', '意味の近く — 使い分けつき'), 'nearby in meaning — and how they differ', 'en-inline'),
  );
  if (edges && edges.length) {
    const byRel = {};
    for (const edge of edges) (byRel[edge.rel] ||= []).push(edge);
    for (const [rel, [jp, en]] of Object.entries(REL)) {
      const group = byRel[rel];
      if (!group) continue;
      const block = el('div', 'sem-group');
      const heading = el('p', 'sem-head');
      heading.append(el('span', null, jp));
      heading.append(el('span', 'latin', en));
      block.append(heading);
      for (const edge of group) {
        const row = el('button', 'sem-row');
        row.type = 'button';
        row.dataset.sem = edge.w;
        row.append(el('span', 'sem-word', edge.w));
        row.append(el('span', 'sem-note', edge.note));
        row.addEventListener('click', () => go({ t: 'word', id: edge.w, from: node.from }));
        block.append(row);
      }
      semWrap.append(block);
    }
  } else {
    const empty = el('div', 'sem-empty');
    empty.textContent = tx(
      'この語の意味近傍はまだ書かれていない。書かれている語：',
      'Usage notes for this word are still being written. These words have them:',
    );
    semWrap.append(empty);
    const seeds = Object.keys(D.sem).slice(0, 6);
    semWrap.append(
      chipsFor(
        seeds.map((w) => ({ label: w, sub: tx('書かれている語', 'has notes') })),
        (item) => go({ t: 'word', id: item.label, from: node.from }),
        null,
        'word',
      ),
    );
  }
  sheet.append(semWrap);

  sheet.append(takeButton(node, label));
  renderListPicker(sheet, node, label);
  renderCardVariant(sheet, { id: node.id, from: node.from });
  renderSchedule(sheet);
}

function renderKanjiNode(sheet, node) {
  const k = D.kanji[node.id];
  if (!k) {
    sheet.append(el('div', 'sem-empty', tx('この字はこの層にない。', 'This kanji is not in this layer.')));
    return;
  }
  const hero = el('div', 'hero');
  hero.append(el('div', 'hero-glyph', k.c));
  const meta = el('div', 'hero-meta');
  meta.append(el('div', 'hero-mean', k.m));
  const chips = el('div', 'shelf-meta');
  chips.append(el('span', 'pool-tag', tx(`${k.st} 画`, `${k.st} strokes`)));
  if (D.kanken[k.c]?.kk) chips.append(el('span', 'pool-tag', `漢検 ${D.kanken[k.c].kk}`));
  if (D.kmeta?.[k.c]?.jlpt) chips.append(el('span', 'pool-tag', `JLPT ${D.kmeta[k.c].jlpt}`));
  meta.append(chips);
  hero.append(meta);
  sheet.append(hero);

  const kv = el('dl', 'kv');
  const on = el('dd');
  on.append(el('span', 'on', k.on.join('・') || '—'));
  kv.append(withEn(el('dt', null, '音'), 'on'), on);
  const kun = el('dd');
  kun.append(el('span', 'on', k.kun.join('・') || '—'));
  kv.append(withEn(el('dt', null, '訓'), 'kun'), kun);
  sheet.append(kv);

  // STROKE ORDER — KanjiVG paths, numbered at each stroke's start
  const paths = D.strokes?.[k.c];
  if (paths?.length) {
    sheet.append(withEn(el('p', 'eyebrow', '筆順'), 'stroke order', 'en-inline'));
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 109 109');
    svg.setAttribute('class', 'strokes');
    svg.id = 'strokes';
    paths.forEach((d, i) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
      const m = d.match(/M\s*([\d.]+)[\s,]+([\d.]+)/);
      if (m) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', m[1]);
        t.setAttribute('y', m[2]);
        t.textContent = String(i + 1);
        svg.append(t);
      }
    });
    sheet.append(svg);
  }

  if (k.parts.length) {
    sheet.append(withEn(el('p', 'eyebrow', '部品'), 'components', 'en-inline'));
    const rows = el('div', 'entry-rows');
    for (const c of k.parts) {
      const row = el('button', 'entry-row');
      row.type = 'button';
      row.append(el('span', 'row-glyph', c));
      row.append(el('span', 'row-main', D.radicals[c]?.name || tx('名称なし', 'unnamed part')));
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go({ t: 'radical', id: c, from: node.from }));
      rows.append(row);
    }
    sheet.append(rows);
  }

  // COMMON COMPOUNDS — reading + first gloss per row, every row a door
  const words = D.kanjiWords[k.c] || [];
  if (words.length) {
    sheet.append(withEn(el('p', 'eyebrow', `よく使う語 — ${words.length} 語`), 'common compounds', 'en-inline'));
    const rows = el('div', 'entry-rows');
    for (const w of words.slice(0, D.wordCap)) {
      const g = lookup(w);
      const row = el('button', 'entry-row compound');
      row.type = 'button';
      const main = el('span', 'row-stack');
      const top = el('span', 'row-word');
      top.append(document.createTextNode(w));
      if (g?.r) top.append(el('span', 'row-reading', g.r));
      main.append(top);
      if (g?.m?.[0]) main.append(el('span', 'row-gloss', g.m[0]));
      row.append(main);
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go({ t: 'word', id: w, from: node.from }));
      rows.append(row);
    }
    sheet.append(rows);
  } else {
    sheet.append(withEn(el('p', 'eyebrow', 'この字を含む語'), 'words that contain it', 'en-inline'));
    sheet.append(
      el('div', 'sem-empty', tx('この字を含む語は辞書側にまだない。部品からは続けられる。', 'No listed word contains this kanji yet — the walk continues through its parts.')),
    );
  }

  const idioms = D.idiomsByKanji[k.c] || [];
  if (idioms.length) {
    const heading = el('p', 'eyebrow');
    heading.append(document.createTextNode(`熟語・慣用句 — ${idioms.length}　`));
    if (bi()) heading.append(el('span', 'en-inline', 'idioms and set phrases'));
    sheet.append(heading);
    sheet.append(
      chipsFor(
        idioms.slice(0, 24).map((w) => ({ label: w, sub: D.idioms[w]?.r || '' })),
        (item) => go({ t: 'idiom', id: item.label, from: node.from }),
        null,
        'idiom',
      ),
    );
  }

  sheet.append(takeButton(node, k.c));
  renderListPicker(sheet, node, k.c);
  renderSchedule(sheet);
}

function renderRadicalNode(sheet, node) {
  const r = D.radicals[node.id];
  if (!r) {
    sheet.append(el('div', 'sem-empty', tx('この部品はこの層にない。', 'This part is not in this layer.')));
    return;
  }
  const hero = el('div', 'hero');
  hero.append(el('div', 'hero-glyph', r.c));
  const meta = el('div', 'hero-meta');
  meta.append(
    el('div', 'hero-mean', r.name || tx('（名称は漢検の部首表にない部品）', '(a part with no name in the 漢検 radical table)')),
  );
  const chips = el('div', 'shelf-meta');
  if (r.st) chips.append(el('span', 'pool-tag', tx(`${r.st} 画`, `${r.st} strokes`)));
  chips.append(el('span', 'pool-tag', tx(`${r.kanjiCount} 字`, `${r.kanjiCount} kanji`)));
  meta.append(chips);
  hero.append(meta);
  sheet.append(hero);

  const note = el('div', 'note');
  note.textContent = tx('「この部品を含む」族。康熙部首の分類ではない。', 'The family of characters containing this part — not the Kangxi radical classification.');
  sheet.append(note);

  if (r.isKanji && D.kanji[r.c]) {
    sheet.append(
      chipsFor(
        [{ label: r.c, sub: tx('字としても見る', 'view as a kanji') }],
        (item) => go({ t: 'kanji', id: item.label, from: node.from }),
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
      'kanji that contain this part',
      'en-inline',
    ),
  );
  sheet.append(
    chipsFor(
      r.kanji.map((c) => ({ label: c, sub: D.kanken[c]?.kk || '' })),
      (item) => go({ t: 'kanji', id: item.label, from: node.from }),
      null,
      'kanji',
    ),
  );

  sheet.append(takeButton(node, r.c));
  renderListPicker(sheet, node, r.c);
  renderSchedule(sheet);
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
      idiom.k.map((c) => ({ label: c, sub: D.kanken[c]?.kk || '' })),
      (item) => go({ t: 'kanji', id: item.label, from: node.from }),
      null,
      'kanji',
    ),
  );
  sheet.append(takeButton(node, idiom.w));
  renderListPicker(sheet, node, idiom.w);
  renderSchedule(sheet);
}

function renderSheet(root) {
  const node = S.stack[S.stack.length - 1];
  if (!node) return;
  const scrim = el('div', 'scrim');
  scrim.setAttribute('aria-hidden', 'true');
  scrim.addEventListener('click', () => {
    interaction({ kind: 'layer.dismiss' }, 'pointer', 'sheet-scrim');
    dismissSheet();
  });
  root.append(scrim);
  const sheet = el('div', 'sheet');
  sheet.id = 'sheet';
  sheet.dataset.node = `${node.t}:${node.id}`;
  sheet.tabIndex = -1;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', tx(`${nodeTitle(node)} の全項目`, `${nodeTitle(node)} full entry`));
  sheet.append(el('div', 'sheet-grip'));

  // the sheet carries its own way out — "NO BACK OPTION" (operator, on-device)
  const bar = el('div', 'sheet-bar');
  const backBtn = biLabel('button', 'sheet-back', '← 戻る', 'back');
  backBtn.type = 'button';
  backBtn.id = 'sheet-back';
  backBtn.dataset.action = 'navigation.back';
  backBtn.addEventListener('click', (event) => {
    interaction(
      { kind: 'navigation.back' },
      event.detail === 0 ? 'keyboard' : 'pointer',
      'sheet-back',
    );
    back();
  });
  bar.append(backBtn);
  if (S.stack.length > 1) {
    bar.append(el('span', 'sheet-depth', S.stack.map((n) => nodeTitle(n)).join(' › ')));
  }
  const closeBtn = el('button', 'sheet-close', '✕');
  closeBtn.type = 'button';
  closeBtn.id = 'sheet-close';
  closeBtn.title = tx('とじる', 'close');
  closeBtn.setAttribute('aria-label', tx('全項目をとじる', 'close full entry'));
  closeBtn.dataset.action = 'layer.dismiss';
  closeBtn.addEventListener('click', (event) => {
    interaction(
      { kind: 'layer.dismiss' },
      event.detail === 0 ? 'keyboard' : 'pointer',
      'sheet-close',
    );
    dismissSheet();
  });
  bar.append(closeBtn);
  sheet.append(bar);

  if (node.t === 'word') renderWordNode(sheet, node);
  else if (node.t === 'kanji') renderKanjiNode(sheet, node);
  else if (node.t === 'radical') renderRadicalNode(sheet, node);
  else if (node.t === 'idiom') renderIdiomNode(sheet, node);
  else if (node.t === 'grammar') renderGrammarNode(sheet, node);
  else if (node.t === 'particle') renderParticleNode(sheet, node);
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      interaction({ kind: 'layer.dismiss' }, 'keyboard', 'sheet-escape');
      dismissSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...sheet.querySelectorAll('button, a[href], input, [tabindex]')].filter(
      (item) => !item.disabled && item.tabIndex >= 0 && item.offsetParent !== null,
    );
    if (!focusable.length) {
      event.preventDefault();
      sheet.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  root.append(sheet);
  queueMicrotask(() => backBtn.focus({ preventScroll: true }));
}

function licencePanel() {
  const box = el('div', 'note');
  box.append(
    document.createTextNode(
      tx(
        '出典と licence。二つのプールは別ファイルに分けて配っている（corpus #51/#41）。' +
          'この試作は両方を読み込むので、成果物自体は ShareAlike 側に従う。' +
          'それを黙って混ぜるのではなく、こう表に出している。',
        'Sources and licences. The two pools ship as separate files (corpus #51/#41). ' +
          'This prototype loads both, so the artifact itself follows the ShareAlike side — ' +
          'stated here rather than mixed silently.',
      ),
    ),
  );
  for (const [pool, sources] of Object.entries(D.sources)) {
    const line = el('p');
    line.style.margin = '8px 0 0';
    line.append(el('span', pool === 'share_alike' ? 'pool-tag sa' : 'pool-tag', pool));
    line.append(document.createTextNode(' ' + sources.map((s) => `${s.name}（${s.licence}）`).join(' · ')));
    box.append(line);
  }
  return box;
}

/* --------------------------------------------------------- debug strip */
function renderVariants(root) {
  const bar = el('div');
  bar.id = 'variants';
  const top = el('div', 'vbar');
  const toggle = biLabel('button', 'vtoggle', S.debugOpen ? '変異 ▾' : '変異 ▴', 'variants');
  toggle.type = 'button';
  toggle.id = 'variants-toggle';
  toggle.addEventListener('click', () => {
    S.debugOpen = !S.debugOpen;
    render();
  });
  top.append(toggle);
  const summary = el('span', 'measure');
  summary.textContent = Object.entries(S.variants)
    .map(([k, v]) => {
      const opt = VARIANTS[k].options.find(([id]) => id === v);
      return bi() ? `${VARIANTS[k].en}: ${opt[2]}` : `${VARIANTS[k].label.split(' ')[0]}:${v}`;
    })
    .join(bi() ? ' · ' : '  ');
  top.append(summary);
  bar.append(top);

  if (S.debugOpen) {
    const body = el('div', 'vbody');
    for (const [key, spec] of Object.entries(VARIANTS)) {
      const row = el('div', 'vrow');
      const label = el('span', 'vlabel', spec.label);
      if (bi()) label.append(el('span', 'en-sub', spec.en));
      row.append(label);
      const seg = el('div', 'vseg');
      for (const [id, ja, en] of spec.options) {
        const b = biLabel('button', null, ja, en);
        b.type = 'button';
        b.dataset.variant = `${key}:${id}`;
        b.setAttribute('aria-pressed', String(S.variants[key] === id));
        b.addEventListener('click', () => {
          S.variants[key] = id;
          if (key === 'entry') {
            if (id === 'field' && S.view === 'shelf') S.view = 'entry';
            if (id === 'shelf' && S.view === 'entry') S.view = 'shelf';
          }
          render();
        });
        seg.append(b);
      }
      row.append(seg);
      body.append(row);
    }
    const measure = el('div', 'measure');
    measure.id = 'measure';
    body.append(measure);
    bar.append(body);
  }
  root.append(bar);
}

function updateMeasurements() {
  const out = $('#measure');
  if (!out) return;
  const probe = $('.shelf-snippet') || $('.sig-name') || $('.crumb');
  const reader = $('#reader') || $('.reader') || $('.shelf-title');
  const faint = probe ? contrastOf(probe) : null;
  const ink = $('.view-title') ? contrastOf($('.view-title')) : null;
  const readerPx = reader ? Math.round(parseFloat(getComputedStyle(reader).fontSize)) : null;
  const chromePx = Math.round(parseFloat(getComputedStyle(document.querySelector('.crumb')).fontSize));
  out.textContent = tx(
    `測定：淡色 ${faint ?? '—'}:1 · 本文墨 ${ink ?? '—'}:1 · 焦点 ${readerPx ?? '—'}px / 周辺 ${chromePx}px`,
    `measured: faint text ${faint ?? '—'}:1 · body ink ${ink ?? '—'}:1 · focus ${readerPx ?? '—'}px vs chrome ${chromePx}px`,
  );
}

/* --------------------------------------------------------------- render */
function render() {
  removeMini();
  const root = $('#app');
  root.textContent = '';
  document.body.classList.toggle('v-contrast-wcag', S.variants.contrast === 'wcag');
  document.body.classList.toggle('v-depth-layered', S.variants.depth === 'layered');
  document.body.classList.toggle('ui-bi', bi());

  const chrome = el('div', 'chrome');
  const backBtn = biLabel('button', null, '戻る', 'back');
  backBtn.type = 'button';
  backBtn.id = 'back';
  const atHome =
    !S.stack.length &&
    (S.view === 'entry' || S.view === 'drift' || (S.view === 'shelf' && S.variants.entry === 'shelf'));
  backBtn.disabled = atHome;
  backBtn.addEventListener('click', back);
  chrome.append(backBtn);

  const crumb = el('div', 'crumb');
  const parts = [];
  if (S.view === 'entry') parts.push(tx('野', 'field'));
  else if (S.view === 'drift') parts.push(tx('墨流し', 'the drift'));
  else parts.push(tx('本棚', 'bookshelf'));
  if (S.view === 'reader' && passage()) parts.push(passage().title);
  if (S.view === 'tray') parts.push(tx('リスト', 'lists'));
  if (S.view === 'grammar') parts.push(tx('文法', 'grammar'));
  for (const node of S.stack) parts.push(nodeTitle(node));
  crumb.innerHTML = parts.map((p, i) => (i === parts.length - 1 ? `<b>${p}</b>` : p)).join(' › ');
  chrome.append(crumb);

  // EN | 日本語 — two visible states, the active one lit
  const langSeg = el('div', 'lang-seg');
  langSeg.id = 'lang';
  langSeg.setAttribute('aria-pressed', String(bi()));
  for (const [id, label] of [
    ['bi', 'EN'],
    ['ja', '日本語'],
  ]) {
    const b = el('button', null, label);
    b.type = 'button';
    b.dataset.lang = id;
    b.setAttribute('aria-pressed', String(S.lang === id));
    b.addEventListener('click', () => {
      S.lang = id;
      render();
    });
    langSeg.append(b);
  }
  chrome.append(langSeg);

  const trayBtn = biLabel('button', null, `覚 ${S.taken.length}`, 'lists');
  trayBtn.type = 'button';
  trayBtn.id = 'tray';
  trayBtn.addEventListener('click', () => {
    S.stack = [];
    S.view = 'tray';
    render();
  });
  chrome.append(trayBtn);
  root.append(chrome);

  const main = el('main');
  root.append(main);

  if (!S.ready) {
    main.append(el('div', 'loading', tx('回廊 をひらいています…', 'opening the corridor…')));
    renderVariants(root);
    return;
  }

  // The Drift universe sleeps unless it is the active view — its layer sits
  // beneath the corridor chrome, so the one navigation fabric stays visible.
  if (window.__DRIFT__) {
    if (S.view === 'drift') window.__DRIFT__.show();
    else window.__DRIFT__.hide();
  }

  if (S.view === 'drift') renderDrift(main);
  else if (S.view === 'entry') renderEntry(main);
  else if (S.view === 'reader') renderReader(main);
  else if (S.view === 'tray') renderTray(main);
  else if (S.view === 'grammar') renderGrammar(main);
  else renderShelf(main);

  renderSheet(root);
  renderVariants(root);
  if (S.stack.length) {
    for (const child of root.children) {
      if (child.id === 'sheet' || child.classList.contains('scrim')) continue;
      child.inert = true;
      child.setAttribute('aria-hidden', 'true');
    }
  }
  updateMeasurements();
}

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((err) => {
    document.body.dataset.error = String(err);
    const root = $('#app');
    root.textContent = '';
    root.append(el('div', 'loading', `読み込めなかった could not load: ${err.message}`));
  });
});

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
  sa: ['kanji', 'words', 'idioms', 'dict', 'strokes', 'radicals214'],
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
    // the number is THIS card's measured coverage, never a floor or an
    // average (the #42 law). Below one-in-two the ratio phrasing stops
    // being true — say plainly that most words fall outside instead.
    const oneIn = Math.round(1 / (1 - cov));
    const outside = ninjal != null ? 'the core' : 'JLPT vocab';
    const outsideJa = ninjal != null ? '基本語彙の外' : 'JLPT語彙の外';
    if (oneIn < 2) {
      vocabNote = ` · most words beyond ${outside}`;
      vocabNoteJa = `・大半が${outsideJa}`;
    } else {
      vocabNote = ` · ~1 in ${oneIn} words beyond ${outside}`;
      vocabNoteJa = `・約${oneIn}語に1語が${outsideJa}`;
    }
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
  /* F and G are the Drift tap ladder. Both rows are open questions the
   * operator settles by feel — this strip states what each position does and
   * takes no position on which one is right. The Drift layer owns the
   * mechanism (see V_LADDER / V_SATTAP in prototypes/drift/drift-artifact.html);
   * the strip only names the setting and hands it across window.__DRIFT_TAP__. */
  ladder: {
    ticket: null,
    label: 'F 触れの段',
    en: 'tap ladder',
    options: [
      ['stage3', '三段', '3-stage'],
      ['stage4', '四段', '4-stage'],
    ],
  },
  sattap: {
    ticket: null,
    label: 'G 衛星の触れ',
    en: 'satellite tap',
    options: [
      ['staged', '段階', 'staged'],
      ['recenter', '即中心', 'instant recenter'],
    ],
  },
};

const REL = {
  syn: ['類義', 'everyday synonyms and near-neighbours'],
  ant: ['対義', 'opposites'],
  reg: ['語感', 'same meaning, different register'],
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
  { id: 'mashou', p: '〜ましょう', lv: 'N5', mEn: "let's …; shall I …?", mJa: '勧誘・申し出', form: '動詞マス幹 + ましょう', ex: [{ ja: 'いっしょに帰りましょう。', en: "Let's go home together." }, { ja: '窓を開けましょうか。', en: 'Shall I open the window?' }], note: 'Invitation when flat, offer when it ends in か. The casual twin is the volitional 〜よう（帰ろう）.' },
  { id: 'ndesu', p: '〜んです／〜のだ', lv: 'N5', mEn: 'it is that … (explaining)', mJa: '説明・事情', form: '普通形 + んです（な-adj・名詞は + なんです）', ex: [{ ja: 'おそくなってすみません。電車が止まったんです。', en: 'Sorry I am late — (the thing is) the train stopped.' }, { ja: 'あした来ないんですか。', en: 'So you are not coming tomorrow?' }], note: 'Wraps a statement as the reason or background the listener was waiting for. Questions with んです ask for the story behind what you see.' },
  { id: 'maeni-tekara', p: '〜前に／〜てから', lv: 'N5', mEn: 'before …; after …', mJa: '前後関係', form: '動詞辞書形 + 前に／動詞テ形 + から', ex: [{ ja: '寝る前に、歯をみがく。', en: 'Before sleeping, I brush my teeth.' }, { ja: '手を洗ってから、食べましょう。', en: "Let's eat after washing our hands." }], note: 'The two hinges of sequence. 前に always takes the dictionary form, whatever the tense of the whole; てから chains the second action onto a finished first.' },
  { id: 'hazuda', p: '〜はずだ', lv: 'N4', mEn: 'should be …; is supposed to …', mJa: '当然の推測', form: '普通形（名詞は + の）+ はずだ', ex: [{ ja: '荷物は今日届くはずだ。', en: 'The package should arrive today.' }, { ja: '彼が知らないはずがない。', en: 'There is no way he does not know.' }], note: 'A conclusion your evidence forces — the schedule, the promise, the math. はずがない slams the same door shut.' },
  { id: 'uchini', p: '〜うちに', lv: 'N3', mEn: 'while … still holds; before it changes', mJa: '状態の持続中', form: '動詞辞書形・テイル形／い形容詞／名詞の + うちに', ex: [{ ja: '熱いうちに食べてください。', en: 'Please eat it while it is hot.' }, { ja: '忘れないうちにメモする。', en: 'I will write it down before I forget.' }], note: 'A window that will close on its own — act inside it. ナイ形 + うちに reads "before the change arrives".' },
  { id: 'okagede-seide', p: '〜おかげで／〜せいで', lv: 'N3', mEn: 'thanks to …; because of … (blame)', mJa: '恩恵の原因・非難の原因', form: '名詞の／普通形 + おかげで・せいで', ex: [{ ja: '先生のおかげで合格できた。', en: 'Thanks to my teacher, I passed.' }, { ja: '渋滞のせいで遅れた。', en: 'I was late because of the traffic jam.' }], note: 'Two causes with opposite faces: おかげで credits, せいで blames. Said straight-faced in reverse, おかげで turns sarcastic.' },
  { id: 'tabini', p: '〜たびに', lv: 'N3', mEn: 'every time …', mJa: '反復', form: '動詞辞書形／名詞の + たびに', ex: [{ ja: 'この歌を聞くたびに、学生時代を思い出す。', en: 'Every time I hear this song, I remember my student days.' }, { ja: '引っ越しのたびに本が減る。', en: 'With every move, my books grow fewer.' }], note: 'Each occurrence drags the same consequence behind it. Unlike 〜と, it counts repetitions, not a rule.' },
  { id: 'tokoroda', p: '〜ところだ', lv: 'N3', mEn: 'about to; in the middle of; just did', mJa: '局面', form: '辞書形／テイル形／タ形 + ところだ', ex: [{ ja: 'いま出かけるところだ。', en: 'I am just about to leave.' }, { ja: 'いま駅に着いたところだ。', en: 'I have just arrived at the station.' }], note: 'A freeze-frame of the action: before it (辞書形), inside it (ている), a breath after it (タ形). 〜たばかり overlaps the last but stretches further from the moment.' },
  { id: 'kanenai', p: '〜かねない', lv: 'N2', mEn: 'might well … (something bad)', mJa: '悪い可能性', form: '動詞マス幹 + かねない', ex: [{ ja: 'そのやり方では、事故になりかねない。', en: 'Done that way, it could well end in an accident.' }, { ja: '彼なら言いかねない。', en: 'Knowing him, he might well say it.' }], note: 'A live risk the speaker disapproves of — never for welcome outcomes. The mirror 〜かねる means "cannot quite bring oneself to".' },
  { id: 'youganai', p: '〜ようがない', lv: 'N2', mEn: 'there is no way to …', mJa: '手段の不在', form: '動詞マス幹 + ようがない', ex: [{ ja: '連絡先が分からないので、知らせようがない。', en: 'I have no contact information, so there is no way to tell them.' }, { ja: 'ここまで壊れると、直しようがない。', en: 'Broken this far, there is no fixing it.' }], note: 'Not forbidden, not unable — the method itself is missing. The stem + よう here is "way of doing", not the volitional.' },
  { id: 'kotonisuru', p: '〜ことにする', lv: 'N3', mEn: 'decide to …', mJa: '自分の決定', form: '動詞辞書形／ナイ形 + ことにする', ex: [{ ja: '来月から早起きすることにした。', en: 'I have decided to get up early starting next month.' }, { ja: '聞かなかったことにしよう。', en: "Let's pretend I never heard that." }], note: 'The speaker\'s own decision — the mirror of ことになる, where the deciding came from outside. ことにしている marks a kept personal rule.' },
  { id: 'zuni', p: '〜ずに', lv: 'N3', mEn: 'without doing …', mJa: '不実行のまま', form: '動詞ナイ形（-ない）+ ずに（する → せずに）', ex: [{ ja: '朝ごはんを食べずに出かけた。', en: 'I left without eating breakfast.' }, { ja: '辞書を使わずに読んでみる。', en: 'I will try reading it without using a dictionary.' }], note: 'The written sibling of 〜ないで. する irregularly becomes せずに — the exam knows this and so do the newspapers.' },
  { id: 'bakaridenaku', p: '〜ばかりでなく〜も', lv: 'N3', mEn: 'not only … but also …', mJa: '累加', form: '普通形／名詞 + ばかりでなく + 〜も', ex: [{ ja: '彼は英語ばかりでなく中国語も話せる。', en: 'He speaks not only English but Chinese too.' }, { ja: '味ばかりでなく見た目も美しい。', en: 'Not only the taste — the presentation is beautiful too.' }], note: 'Stacks a second, often weightier fact on the first. だけでなく is its everyday twin; のみならず its formal elder.' },
  { id: 'gachi', p: '〜がち', lv: 'N3', mEn: 'tends to …; prone to …', mJa: '好ましくない傾向', form: '動詞マス幹／名詞 + がち', ex: [{ ja: '冬は風邪をひきがちだ。', en: 'In winter one tends to catch colds.' }, { ja: '最近、授業を休みがちになっている。', en: 'Lately they have been missing class a lot.' }], note: 'A leaning, and almost always an unwelcome one — 遅れがち, 忘れがち. Conjugates like a な-adjective.' },
  { id: 'ppoi', p: '〜っぽい', lv: 'N3', mEn: '-ish; looks/feels like …', mJa: '印象・傾向', form: '名詞／動詞マス幹／形容詞語幹 + っぽい', ex: [{ ja: 'その言い方は子供っぽい。', en: 'That way of talking is childish.' }, { ja: '彼は忘れっぽくなった。', en: 'He has gotten forgetful.' }], note: 'A casual impression stamped onto a word: 白っぽい whitish, 安っぽい cheap-looking. With verb stems it is a habit — 飽きっぽい, quick to tire of things.' },
  { id: 'nichigainai', p: '〜に違いない', lv: 'N2', mEn: 'must be …; no doubt …', mJa: '確信', form: '普通形（名詞・な-adj は語幹）+ に違いない', ex: [{ ja: 'かばんがない。電車に忘れたに違いない。', en: 'My bag is gone — I must have left it on the train.' }, { ja: 'あの店はいつも並んでいる。おいしいに違いない。', en: 'There is always a line at that place. It must be good.' }], note: 'Certainty argued from evidence, stronger than はずだ\'s "the pieces say so". Written reasoning leans on it; speech often softens to きっと〜だろう.' },
  { id: 'wakeniwaikanai', p: '〜わけにはいかない', lv: 'N2', mEn: "can't very well …; can't afford to …", mJa: '事情による不可', form: '動詞辞書形 + わけにはいかない（ナイ形 + わけにはいかない = 必ずする）', ex: [{ ja: '大事な会議だから、休むわけにはいかない。', en: "It's an important meeting — I can't very well skip it." }, { ja: 'ここで諦めるわけにはいかない。', en: 'Giving up here is not an option.' }], note: 'Not inability but social or moral impossibility — duty bars the door. The negative form flips it: 行かないわけにはいかない, I simply must go.' },
  { id: 'tsutsu', p: '〜つつ（も）', lv: 'N2', mEn: 'while …; even as … (formal)', mJa: '同時・逆接', form: '動詞マス幹 + つつ（も）', ex: [{ ja: '悪いと知りつつ、やってしまった。', en: 'Knowing it was wrong, I did it anyway.' }, { ja: '景色を眺めつつ、ゆっくり歩いた。', en: 'I walked slowly, taking in the view.' }], note: 'ながら in a suit: simultaneous action in writing, and with も a rueful "even while". 〜つつある is different — a change in progress.' },
  { id: 'amari', p: '〜あまり', lv: 'N2', mEn: 'so much … that …', mJa: '過度の結果', form: '名詞の／動詞辞書形・タ形 + あまり', ex: [{ ja: '心配のあまり、眠れなくなった。', en: 'From sheer worry, I could not sleep.' }, { ja: '急ぐあまり、財布を忘れた。', en: 'In my haste, I forgot my wallet.' }], note: 'An emotion or state overflows and drags a (usually bad) result behind it. The cause sits before あまり at full strength.' },
  { id: 'karatoitte', p: '〜からといって', lv: 'N2', mEn: 'just because … does not mean …', mJa: '理由の否定', form: '普通形 + からといって + 否定', ex: [{ ja: '日本に住んでいるからといって、日本語が話せるとは限らない。', en: 'Living in Japan does not necessarily mean one can speak Japanese.' }, { ja: '安いからといって、買いすぎないで。', en: "Just because it's cheap doesn't mean you should buy so much." }], note: 'Blocks a lazy inference; the tail is negative — とは限らない, わけではない. Speech clips it to からって.' },
  { id: 'nikagirazu', p: '〜に限らず', lv: 'N2', mEn: 'not limited to …', mJa: '範囲の拡張', form: '名詞 + に限らず', ex: [{ ja: 'この祭りは地元の人に限らず、旅行者にも人気だ。', en: 'The festival is popular not just with locals but with travelers too.' }, { ja: '平日に限らず、週末も開いている。', en: 'It is open not only on weekdays but on weekends as well.' }], note: 'Opens a stated category outward. Its cousin 〜に限って narrows instead — of all people, precisely this one.' },
  { id: 'monowo', p: '〜ものを', lv: 'N1', mEn: 'if only …; and yet …', mJa: '恨みがましい逆接', form: '普通形 + ものを', ex: [{ ja: '言ってくれれば手伝ったものを。', en: 'If only you had said something — I would have helped.' }, { ja: '休めばよかったものを、無理をして倒れた。', en: 'They should have rested, but they pushed on and collapsed.' }], note: 'A contrary-to-fact reproach with a sigh in it — the better outcome that never happened hangs before ものを.' },
  { id: 'beku', p: '〜べく', lv: 'N1', mEn: 'in order to … (formal)', mJa: '目的（文語）', form: '動詞辞書形 + べく（する → すべく）', ex: [{ ja: '新記録を出すべく、毎日練習を重ねた。', en: 'To set a new record, they trained day after day.' }, { ja: '真相を確かめるべく、現地へ向かった。', en: 'They headed to the site to confirm the truth.' }], note: 'ために in classical dress; the doer of both clauses is the same. Its negative cousin べからず still stands on prohibition signs.' },
  { id: 'nbakarini', p: '〜んばかりに', lv: 'N1', mEn: 'as if about to …', mJa: '寸前の様子', form: '動詞ナイ形（-ない）+ んばかりに（する → せんばかりに）', ex: [{ ja: '泣かんばかりの顔で謝った。', en: 'They apologized looking as if they were about to cry.' }, { ja: '早く帰れと言わんばかりに、時計を見た。', en: 'He glanced at the clock as if to say "go home already".' }], note: 'The action never quite happens — it trembles at the brink. 言わんばかり is the fossilized favourite: all but saying it.' },
  { id: 'gahayaika', p: '〜が早いか', lv: 'N1', mEn: 'no sooner had … than …', mJa: '間髪を入れず', form: '動詞辞書形 + が早いか', ex: [{ ja: 'ベルが鳴るが早いか、教室を飛び出した。', en: 'No sooner had the bell rung than they bolted from the classroom.' }, { ja: '席に着くが早いか、注文を始めた。', en: 'The moment they sat down, they started ordering.' }], note: 'Two events with no daylight between them, the second usually eager or abrupt. Written narration\'s tool; や否や is its twin.' },
  { id: 'yainaya', p: '〜や否や', lv: 'N1', mEn: 'the instant …; barely had … when …', mJa: '同時直後', form: '動詞辞書形 + や否や（や）', ex: [{ ja: 'ドアを開けるや否や、猫が飛び出した。', en: 'The instant the door opened, the cat shot out.' }, { ja: '発売されるや否や、売り切れた。', en: 'Barely on sale, it sold out.' }], note: 'The literary twin of が早いか; often just や in fiction. The second event is a fact that happened — no commands or intentions after it.' },
  { id: 'nari-chokugo', p: '〜なり', lv: 'N1', mEn: 'as soon as … (and stayed so)', mJa: '直後の意外な行動', form: '動詞辞書形 + なり', ex: [{ ja: '顔を見るなり、泣き出した。', en: 'The moment she saw his face, she burst into tears.' }, { ja: '帰ってくるなり、部屋にこもってしまった。', en: 'He came home and went straight to his room and stayed there.' }], note: 'Immediate sequel with a shade of surprise, the same subject in both clauses. 〜たなり is different — a state left as it was (座ったなり).' },
  { id: 'sobakara', p: '〜そばから', lv: 'N1', mEn: 'no sooner does one … than … (again and again)', mJa: 'いたちごっこ', form: '動詞辞書形・タ形 + そばから', ex: [{ ja: '覚えるそばから忘れていく。', en: 'No sooner do I memorize them than I forget them.' }, { ja: '片づけるそばから子供が散らかす。', en: 'The moment I tidy up, the kids scatter things again.' }], note: 'A repeating, losing race — the undoing follows every doing. が早いか is one sharp event; そばから is the treadmill.' },
  { id: 'towaie', p: '〜とはいえ', lv: 'N2', mEn: 'that said; even so', mJa: '譲歩の逆接', form: '普通形／名詞 + とはいえ', ex: [{ ja: '春とはいえ、朝はまだ寒い。', en: 'Spring, yes — but the mornings are still cold.' }, { ja: '仕事とはいえ、休みなしはつらい。', en: "It may be work, but no days off is hard." }], note: 'Grants the label, then walks back what it seems to promise. Written cousin of といっても.' },
  { id: 'toiedomo', p: '〜といえども', lv: 'N1', mEn: 'even …; even granting …', mJa: '強い譲歩（文語）', form: '名詞／普通形 + といえども', ex: [{ ja: '専門家といえども、間違うことはある。', en: 'Even experts make mistakes.' }, { ja: '一円といえども、無駄にはできない。', en: 'Not even a single yen can be wasted.' }], note: 'Ceremonial concession — the exception-proof claim follows. Legal and editorial prose keep it alive.' },
  { id: 'bakoso', p: '〜ばこそ', lv: 'N1', mEn: 'precisely because …', mJa: '理由の強調', form: '仮定形 + こそ', ex: [{ ja: '愛していればこそ、厳しく言うのだ。', en: 'It is precisely because I love you that I speak harshly.' }, { ja: '体が丈夫であればこそ、続けられる仕事だ。', en: 'Only because my body is strong can this work continue.' }], note: 'The reason, polished and held up — usually a good-hearted one behind an apparent unkindness. The sentence often ends のだ.' },
  { id: 'sura', p: '〜すら', lv: 'N1', mEn: 'even … (so extreme an example)', mJa: '極端な例示', form: '名詞（+ で・に）+ すら', ex: [{ ja: '自分の名前すら書けなかった。', en: 'He could not even write his own name.' }, { ja: '子供ですら知っている。', en: 'Even a child knows that.' }], note: 'さえ in formal ink: one extreme case stands for the whole scale. Negative predicates are its home ground.' },
  { id: 'dani', p: '〜だに', lv: 'N1', mEn: 'even to … (imagine, hear of)', mJa: '文語の極端例', form: '動詞辞書形／名詞 + だに', ex: [{ ja: '想像するだに恐ろしい。', en: 'Frightening even to imagine.' }, { ja: '微動だにしない。', en: 'It does not budge even a fraction.' }], note: 'A fossil that survives in set phrases — 想像するだに, 一顧だにしない, 微動だにせず. Learn the phrases, not the paradigm.' },
  { id: 'nimomashite', p: '〜にもまして', lv: 'N1', mEn: 'even more than …', mJa: '比較の上積み', form: '名詞 + にもまして', ex: [{ ja: '今年は例年にもまして暑い。', en: 'This year is hot even by comparison with an average year.' }, { ja: '何にもまして大切なのは健康だ。', en: 'More than anything else, health matters.' }], note: 'Takes a already-high benchmark and clears it. 何にもまして — above all — is the everyday survivor.' },
  { id: 'womotte', p: '〜をもって', lv: 'N1', mEn: 'with …; as of … (formal)', mJa: '手段・区切り（文語）', form: '名詞 + をもって', ex: [{ ja: '本日をもって閉店いたします。', en: 'As of today, this shop closes.' }, { ja: '実力をもって示す。', en: 'To demonstrate it by sheer ability.' }], note: 'Announcements and certificates: an instrument or a cut-off date held at arm\'s length. 身をもって — with one\'s own body — is its idiom.' },
  { id: 'yueni', p: '〜ゆえ（に）', lv: 'N1', mEn: 'because of … (archaic-formal)', mJa: '文語の理由', form: '名詞（の）／普通形 + ゆえ（に）', ex: [{ ja: '若さゆえの過ちだった。', en: 'It was a mistake born of youth.' }, { ja: '貧しさゆえに、学校へ行けなかった。', en: 'Because of poverty, she could not attend school.' }], note: 'The old because — dignified, a little tragic. それゆえ opens formal conclusions the way therefore does.' },
  { id: 'katawara', p: '〜かたわら', lv: 'N1', mEn: 'while also …; alongside …', mJa: '本業のかたわら', form: '動詞辞書形／名詞の + かたわら', ex: [{ ja: '会社勤めのかたわら、小説を書いている。', en: 'Alongside his office job, he writes novels.' }, { ja: '子育てのかたわら、大学に通った。', en: 'While raising children, she attended university.' }], note: 'Two long-running lives side by side, the first the main one. ながら is minutes; かたわら is years.' },
  { id: 'gatera', p: '〜がてら', lv: 'N2', mEn: 'while at it; taking the chance to …', mJa: 'ついでの同行', form: '動詞マス幹／名詞 + がてら', ex: [{ ja: '散歩がてら、パンを買ってきた。', en: 'Out for a walk, I picked up some bread while I was at it.' }, { ja: '見物がてら、寄ってみた。', en: 'Sightseeing anyway, I dropped in.' }], note: 'One outing, two purposes, the second riding along — usually with motion verbs. ついでに is its everyday cousin.' },
  { id: 'naimademo', p: '〜ないまでも', lv: 'N1', mEn: 'even if not …, at least …', mJa: '上限を譲って下限を守る', form: '動詞ナイ形 + までも', ex: [{ ja: '毎日とは言わないまでも、週に一度は電話してほしい。', en: 'If not every day, at least call once a week.' }, { ja: '優勝しないまでも、入賞はしたい。', en: 'Even if we do not win it all, I want to place.' }], note: 'Concedes the ideal, then plants a flag at the acceptable minimum. The second clause carries a wish, duty, or resolve.' },
  { id: 'haoroka', p: '〜はおろか', lv: 'N2', mEn: 'let alone …; to say nothing of …', mJa: '当然の上への否定', form: '名詞 + はおろか', ex: [{ ja: '漢字はおろか、ひらがなも読めなかった。', en: 'He could not read hiragana, let alone kanji.' }, { ja: '海外はおろか、隣の県にも行ったことがない。', en: 'I have never been to the next prefecture, to say nothing of abroad.' }], note: 'Dismisses the big thing as out of the question and then knocks down the small one too — the clause after it is usually negative with も.' },
  { id: 'tatotan', p: '〜たとたん', lv: 'N3', mEn: 'the moment …; just as …', mJa: '直後の予想外', form: '動詞タ形 + とたん（に）', ex: [{ ja: 'ドアを開けたとたん、風が吹き込んだ。', en: 'The moment I opened the door, the wind rushed in.' }, { ja: '立ち上がったとたん、めまいがした。', en: 'Just as I stood up, dizziness hit.' }], note: 'The second event surprises the speaker and is beyond their control — no plans or commands after とたん. や否や is its written elder.' },
  { id: 'okini', p: '〜おきに', lv: 'N3', mEn: 'at intervals of …', mJa: '間隔', form: '数量 + おきに', ex: [{ ja: 'この薬は四時間おきに飲む。', en: 'Take this medicine every four hours.' }, { ja: '一日おきにジョギングしている。', en: 'I jog every other day.' }], note: 'The gap between occurrences. 一日おき = every other day; compare ごとに, which counts every unit with no gap in mind.' },
  { id: 'hodo', p: '〜ほど', lv: 'N3', mEn: 'to the extent that …; so … that', mJa: '程度', form: '普通形／名詞 + ほど', ex: [{ ja: '泣きたいほど悔しかった。', en: 'I was frustrated to the point of tears.' }, { ja: '彼ほど親切な人はいない。', en: 'There is no one as kind as he is.' }], note: 'Measures a state by an image of its extreme. With a negative and a noun it builds the superlative-by-denial: 〜ほど〜はない.' },
  { id: 'saeba', p: '〜さえ〜ば', lv: 'N3', mEn: 'if only …; as long as …', mJa: '唯一条件', form: '名詞 + さえ + 仮定形', ex: [{ ja: '時間さえあれば、行きたい。', en: 'If only I had time, I would go.' }, { ja: '君さえよければ、それでいい。', en: 'As long as it is fine with you, that settles it.' }], note: 'Shrinks all conditions to one — meet this and everything follows. The ば clause carries the promise.' },
  { id: 'tagaru', p: '〜たがる', lv: 'N4', mEn: 'shows signs of wanting to … (third person)', mJa: '他者の願望', form: '動詞マス幹 + たがる', ex: [{ ja: '子供は何でも知りたがる。', en: 'Children want to know everything.' }, { ja: '彼は人前で話したがらない。', en: 'He does not like to speak in public.' }], note: "Someone else's wish, read from the outside — visible behaviour, not their inner report. Your own wish stays 〜たい." },
  { id: 'zurai', p: '〜づらい', lv: 'N3', mEn: 'hard to … (painful for the doer)', mJa: '心理的困難', form: '動詞マス幹 + づらい', ex: [{ ja: '本当のことは言いづらい。', en: 'The truth is hard to say.' }, { ja: 'この字は小さくて読みづらい。', en: 'These characters are small and hard on the eyes.' }], note: 'Difficulty with an ache in it — the doer suffers. にくい is neutral mechanics; がたい is near-impossibility in formal dress.' },
  { id: 'gatai', p: '〜がたい', lv: 'N2', mEn: 'hard to …; can hardly …', mJa: '困難（文語）', form: '動詞マス幹 + がたい', ex: [{ ja: '彼の話は信じがたい。', en: 'His story is hard to believe.' }, { ja: '忘れがたい一日になった。', en: 'It became an unforgettable day.' }], note: 'All but impossible, said formally — the set survivors are 信じがたい, 理解しがたい, 忘れがたい, 動かしがたい.' },
  { id: 'gimi', p: '〜気味', lv: 'N3', mEn: 'a touch of …; tending toward …', mJa: '軽い傾向', form: '動詞マス幹／名詞 + 気味（ぎみ）', ex: [{ ja: '少し風邪気味だ。', en: 'I have a touch of a cold.' }, { ja: '最近、太り気味だ。', en: 'I have been putting on a little weight lately.' }], note: 'A slight lean, usually unwelcome, felt in oneself or observed now — 遅れ気味, 疲れ気味. がち is the long-run habit; 気味 is the current shade.' },
  { id: 'muke-muki', p: '〜向け／〜向き', lv: 'N3', mEn: 'intended for … / suited to …', mJa: '対象・適性', form: '名詞 + 向け（意図）／向き（適性）', ex: [{ ja: '子供向けの番組を作る。', en: 'To make programs aimed at children.' }, { ja: 'この靴は初心者向きだ。', en: 'These shoes are well suited to beginners.' }], note: 'A maker aims 向け; a thing happens to suit 向き. The same word wears intention on one side and affinity on the other.' },
  { id: 'kotohanai', p: '〜ことはない', lv: 'N3', mEn: 'there is no need to …', mJa: '不必要', form: '動詞辞書形 + ことはない', ex: [{ ja: '急ぐことはない。ゆっくりどうぞ。', en: 'There is no need to hurry — take your time.' }, { ja: '君が謝ることはない。', en: 'You have nothing to apologize for.' }], note: 'Waves the worry away — gentler than 必要がない, often consoling. Distinct from 〜たことがある, the experience form.' },
  { id: 'nitotte', p: '〜にとって', lv: 'N3', mEn: 'for …; from …\'s standpoint', mJa: '立場からの評価', form: '名詞 + にとって', ex: [{ ja: '私にとって、家族が一番大切だ。', en: 'For me, family matters most.' }, { ja: '子供にとって遊びは勉強だ。', en: 'For a child, play is study.' }], note: 'Sets whose scales the judgement is weighed on — value, difficulty, meaning. Actions aimed AT someone take に対して instead.' },
  { id: 'nitaishite', p: '〜に対して', lv: 'N3', mEn: 'toward …; in contrast to …', mJa: '対象・対比', form: '名詞 + に対して', ex: [{ ja: 'お客様に対して失礼のないように。', en: 'Do not be rude toward customers.' }, { ja: '兄が静かなのに対して、弟はにぎやかだ。', en: 'Where the older brother is quiet, the younger is boisterous.' }], note: 'Two doors: the target an action or attitude faces, and the pivot between two contrasted clauses (〜のに対して).' },
  { id: 'nikurabete', p: '〜に比べて', lv: 'N3', mEn: 'compared with …', mJa: '比較の基準', form: '名詞 + に比べて', ex: [{ ja: '去年に比べて、今年は雨が多い。', en: 'Compared with last year, this year has more rain.' }, { ja: '都会に比べて、田舎は静かだ。', en: 'Compared with the city, the countryside is quiet.' }], note: 'Names the yardstick openly, then measures. より does the same work in fewer syllables but hides the verb of comparing.' },
  { id: 'warini', p: '〜わりに', lv: 'N3', mEn: 'considering …; for …', mJa: '釣り合わない印象', form: '名詞の／普通形 + わりに（は）', ex: [{ ja: 'この店は値段のわりにおいしい。', en: 'For the price, this place is good.' }, { ja: 'よく寝たわりには疲れが取れない。', en: 'Considering how much I slept, the tiredness will not lift.' }], note: 'The outcome does not match the premise, pleasantly or not. にしては points the same surprise at a specific case.' },
  { id: 'kuseni', p: '〜くせに', lv: 'N3', mEn: 'even though … (reproachful)', mJa: '非難の逆接', form: '名詞の／普通形 + くせに', ex: [{ ja: '知っているくせに、教えてくれない。', en: 'You know, and yet you will not tell me.' }, { ja: '自分もできないくせに、人のことを笑う。', en: 'He laughs at others though he cannot do it himself.' }], note: 'のに with a glare — the subject is someone else, and the speaker disapproves. Never for one\'s own actions in earnest.' },
  { id: 'ppanashi', p: '〜っぱなし', lv: 'N2', mEn: 'left …ing; left as is', mJa: '放置の継続', form: '動詞マス幹 + っぱなし', ex: [{ ja: '電気をつけっぱなしで寝てしまった。', en: 'I fell asleep with the lights left on.' }, { ja: '朝から立ちっぱなしだ。', en: 'I have been on my feet since morning.' }], note: 'A state someone started and never closed — usually with a sigh. ておく leaves things deliberately; っぱなし leaves them carelessly or helplessly.' },
  { id: 'kanoyouni', p: '〜かのように', lv: 'N2', mEn: 'as if …', mJa: '事実に反する見立て', form: '普通形 + かのように', ex: [{ ja: '何も知らないかのように、彼は笑った。', en: 'He smiled as if he knew nothing.' }, { ja: '冬が戻ったかのような寒さだ。', en: 'Cold as if winter had returned.' }], note: 'A stated resemblance the speaker knows is false — one shade more literary and more counterfactual than ように alone.' },
  { id: 'ueni', p: '〜上に', lv: 'N3', mEn: 'on top of …; in addition to …', mJa: '累加', form: '普通形／名詞の + 上に', ex: [{ ja: 'この部屋は狭い上に暗い。', en: 'This room is cramped, and dark on top of it.' }, { ja: '道に迷った上に、雨まで降ってきた。', en: 'On top of getting lost, it started to rain.' }], note: 'Stacks a second fact of the same colour — good on good, bad on bad, never mixed. 上で, one particle away, means "after / in the course of".' },
  { id: 'bahodo', p: '〜ば〜ほど', lv: 'N3', mEn: 'the more …, the more …', mJa: '比例', form: '仮定形 + 辞書形 + ほど', ex: [{ ja: '考えれば考えるほど分からなくなる。', en: 'The more I think, the less I understand.' }, { ja: '安ければ安いほどいい。', en: 'The cheaper, the better.' }], note: 'The same word twice, once in ば and once plain, and the scale slides. Adjectives may drop the first half in speech: 安いほどいい.' },
  { id: 'donnanitemo', p: 'どんなに〜ても', lv: 'N4', mEn: 'no matter how …', mJa: '全面譲歩', form: 'どんなに + テ形 + も', ex: [{ ja: 'どんなに急いでも、間に合わない。', en: 'No matter how much we hurry, we will not make it.' }, { ja: 'どんなに高くても、買うつもりだ。', en: 'However expensive it is, I intend to buy it.' }], note: 'Concedes every degree at once. いくら〜ても is its everyday twin; たとえ〜ても concedes a hypothesis instead of a degree.' },
  { id: 'tatoetemo', p: 'たとえ〜ても', lv: 'N3', mEn: 'even if … (hypothetically)', mJa: '仮定の譲歩', form: 'たとえ + テ形 + も', ex: [{ ja: 'たとえ雨が降っても、行きます。', en: 'Even if it rains, I will go.' }, { ja: 'たとえ冗談でも、言ってはいけないことがある。', en: 'Even as a joke, some things must not be said.' }], note: 'Concedes a whole hypothesis before refusing to bend to it. どんなに concedes degree; たとえ concedes the case itself.' },
  { id: 'nishitewa', p: '〜にしては', lv: 'N3', mEn: 'for …; considering it is …', mJa: '基準からの意外', form: '名詞／普通形 + にしては', ex: [{ ja: '初めてにしては上手だ。', en: 'For a first try, that is skillful.' }, { ja: '十二月にしては暖かい。', en: 'Warm, for December.' }], note: 'Takes one specific label and notes the mismatch. わりに measures against a vaguer expectation; both wear mild surprise.' },
  { id: 'nikanshite', p: '〜に関して', lv: 'N2', mEn: 'concerning …; with regard to …', mJa: '話題（改まり）', form: '名詞 + に関して', ex: [{ ja: 'この件に関しては、後ほどご説明します。', en: 'Concerning this matter, I will explain later.' }, { ja: '日本の教育に関して研究している。', en: 'She researches matters relating to Japanese education.' }], note: 'について in a jacket — meetings, papers, announcements. The connected noun form is 〜に関する + 名詞.' },
  { id: 'womegutte', p: '〜をめぐって', lv: 'N2', mEn: 'over …; surrounding … (dispute, discussion)', mJa: '争点の周り', form: '名詞 + をめぐって', ex: [{ ja: '遺産をめぐって兄弟が争った。', en: 'The brothers fought over the inheritance.' }, { ja: '新空港の建設をめぐって議論が続く。', en: 'Debate continues surrounding the new airport.' }], note: 'People circle a contested centre — disputes, rumours, negotiations. The centre is a noun; the verbs are ones of contention.' },
  { id: 'nisotte', p: '〜に沿って', lv: 'N2', mEn: 'along …; in line with …', mJa: '線・方針に従う', form: '名詞 + に沿って', ex: [{ ja: '川に沿って歩いた。', en: 'We walked along the river.' }, { ja: '方針に沿って計画を立てる。', en: 'To draw up plans in line with the policy.' }], note: 'A literal line or a laid-down policy — the path is followed, not questioned. に基づいて builds ON a foundation; に沿って keeps BESIDE a line.' },
  { id: 'wohajime', p: '〜をはじめ', lv: 'N2', mEn: 'starting with …; … among others', mJa: '代表を立てた列挙', form: '名詞 + をはじめ（として）', ex: [{ ja: '校長先生をはじめ、多くの先生が出席した。', en: 'Many teachers attended, starting with the principal.' }, { ja: '東京をはじめ、大都市は家賃が高い。', en: 'Rents are high in the big cities, Tokyo first among them.' }], note: 'Raises the most representative member, then gestures at the crowd behind it. Formal letters and speeches lean on it.' },
  { id: 'nimotozuite', p: '〜に基づいて', lv: 'N2', mEn: 'based on …', mJa: '根拠の上に', form: '名詞 + に基づいて', ex: [{ ja: '事実に基づいて書かれた小説だ。', en: 'A novel written on the basis of fact.' }, { ja: '調査結果に基づいて判断する。', en: 'To judge on the basis of the survey results.' }], note: 'The ground something is built on — data, law, experience. によると reports a source; に基づいて constructs from one.' },
  { id: 'darake', p: '〜だらけ', lv: 'N3', mEn: 'covered in …; full of …', mJa: '好ましくない充満', form: '名詞 + だらけ', ex: [{ ja: '泥だらけの靴で上がらないで。', en: 'Do not come in with those mud-covered shoes.' }, { ja: 'この作文は間違いだらけだ。', en: 'This essay is riddled with mistakes.' }], note: 'Too much of an unwelcome thing, scattered everywhere — 血だらけ, ほこりだらけ, 借金だらけ. いっぱい fills; だらけ contaminates.' },
  { id: 'kkonai', p: '〜っこない', lv: 'N2', mEn: 'no way that … (colloquial)', mJa: '可能性の否定（話し言葉）', form: '動詞マス幹 + っこない', ex: [{ ja: 'そんなに速く走れっこない。', en: 'No way anyone can run that fast.' }, { ja: '彼に分かりっこないよ。', en: 'There is no way he would understand.' }], note: 'Slams the possibility shut, casually — はずがない with its sleeves rolled up. Speech only; often with 潜在形 stems.' },
  { id: 'kaneru', p: '〜かねる', lv: 'N2', mEn: 'cannot quite bring oneself to … (polite refusal)', mJa: '婉曲の不可', form: '動詞マス幹 + かねる', ex: [{ ja: 'その質問にはお答えしかねます。', en: 'I am afraid I cannot answer that question.' }, { ja: '賛成しかねる点もある。', en: 'There are points I find hard to agree with.' }], note: 'The service counter\'s soft no — ability is not denied, willingness is withheld politely. Its mirror かねない warns of bad likelihood.' },
  { id: 'kotoni', p: '〜ことに', lv: 'N2', mEn: 'to my … (emotion first)', mJa: '感情の前置き', form: '感情の形容詞・動詞タ形 + ことに', ex: [{ ja: '残念なことに、雨で中止になった。', en: 'To my regret, it was cancelled for rain.' }, { ja: '驚いたことに、彼は無事だった。', en: 'To my astonishment, he was unharmed.' }], note: 'Hangs the feeling over the door before the fact walks in — 嬉しいことに, 困ったことに. Written narration\'s way of sighing first.' },
  { id: 'shidai', p: '〜次第', lv: 'N2', mEn: 'as soon as …; depending on …', mJa: '即時・依存', form: '動詞マス幹 + 次第／名詞 + 次第だ', ex: [{ ja: '決まり次第、ご連絡します。', en: 'The moment it is decided, we will contact you.' }, { ja: '行くかどうかは天気次第だ。', en: 'Whether we go depends on the weather.' }], note: 'Two doors: after a verb stem, the very moment something completes (business Japanese\'s promise); after a noun, the hinge everything hangs on.' },
  { id: 'ippouda', p: '〜一方だ', lv: 'N3', mEn: 'keeps on …ing (one direction only)', mJa: '一方向の進行', form: '動詞辞書形 + 一方だ', ex: [{ ja: '物価は上がる一方だ。', en: 'Prices just keep going up.' }, { ja: '町の人口は減る一方だ。', en: 'The town\'s population does nothing but shrink.' }], note: 'A change with no reverse gear, usually unwelcome. つつある merely reports motion; 一方だ complains about its direction.' },
  { id: 'tsutsuaru', p: '〜つつある', lv: 'N2', mEn: 'is in the process of …ing', mJa: '進行中の変化', form: '動詞マス幹 + つつある', ex: [{ ja: '町は復興しつつある。', en: 'The town is in the process of rebuilding.' }, { ja: '古い習慣は失われつつある。', en: 'The old customs are being lost.' }], note: 'A change caught mid-motion, formal register — where ている can mean a settled state, つつある insists the wheel is still turning.' },
  { id: 'buri', p: '〜ぶり', lv: 'N2', mEn: 'for the first time in …; manner of …', mJa: '経過時間・様子', form: '期間 + ぶり／動詞マス幹・名詞 + ぶり', ex: [{ ja: '十年ぶりに故郷へ帰った。', en: 'I went home for the first time in ten years.' }, { ja: '彼の話しぶりは落ち着いていた。', en: 'His manner of speaking was composed.' }], note: 'After a span: that much time since last time (久しぶり is the fossil). After a stem or noun: the visible manner of doing — 働きぶり, 枝ぶり.' },
  { id: 'ge', p: '〜げ', lv: 'N2', mEn: '-looking; with an air of …', mJa: '様子の形容', form: '形容詞語幹・動詞マス幹 + げ', ex: [{ ja: '子供たちは楽しげに遊んでいる。', en: 'The children are playing with a happy air.' }, { ja: '彼女は不安げな顔をした。', en: 'She looked anxious.' }], note: 'Reads an inner state off someone\'s surface — 悲しげ, 得意げ, 言いたげ. そう guesses what happens next; げ describes the air they wear.' },
  { id: 'mamire', p: '〜まみれ', lv: 'N2', mEn: 'smeared all over with …', mJa: '表面の付着', form: '名詞 + まみれ', ex: [{ ja: '汗まみれになって働いた。', en: 'We worked drenched in sweat.' }, { ja: '泥まみれのユニフォームが誇らしい。', en: 'The mud-caked uniform is a badge of honour.' }], note: 'Sticks to surfaces only — sweat, mud, blood, dust. だらけ can also count scattered things (間違いだらけ); まみれ cannot.' },
  { id: 'kiri', p: '〜きり', lv: 'N3', mEn: 'only; ever since … (nothing after)', mJa: '限定・それ以来', form: '名詞 + きり／動詞タ形 + きり', ex: [{ ja: '二人きりで話したい。', en: 'I want to talk just the two of us.' }, { ja: '彼とは去年会ったきりだ。', en: 'I have not seen him since we met last year.' }], note: 'Draws a line and nothing crosses it: only this many, or that event and silence after (タ形 + きり). 寝たきり — bedridden — is its hardest use.' },
  { id: 'kke', p: '〜っけ', lv: 'N3', mEn: 'was it …? (checking one\'s memory)', mJa: '記憶の確認', form: '普通形（タ形が多い）+ っけ', ex: [{ ja: '明日の会議、何時だったっけ。', en: 'What time was tomorrow\'s meeting again?' }, { ja: '君、田中さんだっけ。', en: 'You are Tanaka — right?' }], note: 'Asked half to oneself, patting pockets for a memory. Casual speech only; often on だった／たっけ.' },
  { id: 'naikotohanai', p: '〜ないことはない', lv: 'N2', mEn: 'it is not that … not …; not impossible', mJa: '二重否定の含み', form: 'ナイ形 + ことはない', ex: [{ ja: '納豆は食べないことはないが、好きではない。', en: 'It is not that I do not eat natto — I just do not like it.' }, { ja: '間に合わないことはないだろう。', en: 'It should not be impossible to make it.' }], note: 'Opens the door a reluctant crack — possibility admitted, enthusiasm withheld. The single-negative ことはない (no need to) is a different pattern entirely.' },
  { id: 'monoda', p: '〜ものだ', lv: 'N3', mEn: 'that is how things are; one should; how … it was', mJa: '本性・当為・回想', form: '普通形 + ものだ（回想はタ形 + ものだ）', ex: [{ ja: '人はだれでも間違えるものだ。', en: 'People make mistakes — that is how people are.' }, { ja: '子供のころ、よく川で泳いだものだ。', en: 'As a child, I used to swim in the river.' }], note: 'Three lives in one shape: the nature of things, the way one ought to behave (年上には敬語を使うものだ), and warm recollection on タ形. Context, not form, tells them apart.' },
  { id: 'monoka', p: '〜ものか', lv: 'N2', mEn: 'as if …!; no way …!', mJa: '強い否定の反語', form: '普通形 + ものか（もんか）', ex: [{ ja: 'あんな店、二度と行くものか。', en: 'As if I would ever go to that place again!' }, { ja: '負けるもんか。', en: 'No way am I losing.' }], note: 'A rhetorical question that slams a door — spoken with heat, often clipped to もんか. The polite shape ものですか keeps the fire under a jacket.' },
  { id: 'dokorodehanai', p: '〜どころではない', lv: 'N2', mEn: 'this is no time for …', mJa: '余裕の否定', form: '名詞／動詞辞書形 + どころではない', ex: [{ ja: '仕事が山積みで、旅行どころではない。', en: 'With work piled high, a trip is out of the question.' }, { ja: '熱があって、花見どころではなかった。', en: 'With a fever, blossom-viewing was the last thing possible.' }], note: 'The situation crowds the pleasant thing off the table entirely. どころか (far from) is its argumentative sibling.' },
  { id: 'mai', p: '〜まい', lv: 'N2', mEn: 'probably not; will not (resolve)', mJa: '否定推量・否定意志', form: '動詞辞書形 + まい（一段はマス幹も）', ex: [{ ja: '彼はもう来るまい。', en: 'He probably will not come now.' }, { ja: '二度と同じ失敗はするまい。', en: 'Never again will I make that mistake.' }], note: 'ないだろう and ないつもりだ folded into one literary auxiliary. 〜う（よう）か〜まいか weighs doing against not doing.' },
  { id: 'nuku', p: '〜抜く', lv: 'N2', mEn: 'do … through to the end', mJa: '完遂', form: '動詞マス幹 + 抜く', ex: [{ ja: '最後まで走り抜いた。', en: 'I ran it through to the very end.' }, { ja: '考え抜いた末の決断だ。', en: 'A decision reached after thinking it all the way through.' }], note: 'Endurance through difficulty to completion — 勝ち抜く, 生き抜く. 終わる merely ends; 抜く comes out the far side.' },
  { id: 'kake', p: '〜かけ', lv: 'N2', mEn: 'half-…ed; started and unfinished', mJa: '中断の途中', form: '動詞マス幹 + かけ（の／だ）／かける', ex: [{ ja: '読みかけの本が机に置いてある。', en: 'A half-read book lies on the desk.' }, { ja: '言いかけて、やめた。', en: 'He started to say something, then stopped.' }], note: 'The action broke off mid-arc and its trace remains — 食べかけ, 書きかけ. As a verb (〜かける) it can also mean about-to (倒れかける).' },
  { id: 'souninai', p: '〜そうにない', lv: 'N3', mEn: 'shows no sign of …ing', mJa: '様態の否定', form: '動詞マス幹 + そうにない（そうもない）', ex: [{ ja: '雨はやみそうにない。', en: 'The rain shows no sign of stopping.' }, { ja: '宿題は今夜中に終わりそうもない。', en: 'The homework looks nowhere near done by tonight.' }], note: 'The looks-like そうだ turned to face refusal — appearances say it will not happen. Stronger than a plain negative guess.' },
  { id: 'uru', p: '〜得る／〜得ない', lv: 'N2', mEn: 'can possibly … / cannot possibly …', mJa: '可能性の有無（文語）', form: '動詞マス幹 + 得る（うる・える）／得ない（えない）', ex: [{ ja: 'それはあり得る話だ。', en: 'That is a possible story.' }, { ja: 'あんな結末はあり得ない。', en: 'That ending is impossible.' }], note: 'Possibility in principle, not personal skill — a plan CAN fail, a case CAN occur. あり得る／あり得ない are the living heart of it.' },
  { id: 'youmononara', p: '〜ようものなら', lv: 'N1', mEn: 'if one so much as dared to …', mJa: '仮定の威嚇', form: '意向形 + ものなら', ex: [{ ja: '遅刻しようものなら、大目玉だ。', en: 'Dare to be late and there will be thunder.' }, { ja: '彼の前でその名を出そうものなら、大変なことになる。', en: 'So much as mention that name in front of him and things get ugly.' }], note: 'A hypothetical with a storm behind it — the consequence clause is always dire. The meeker cousin ものなら (if only one could) takes the potential form.' },
  { id: 'osoregaaru', p: '〜恐れがある', lv: 'N2', mEn: 'there is a risk of …', mJa: '悪い可能性の告知', form: '動詞辞書形／名詞の + 恐れがある', ex: [{ ja: '台風が上陸する恐れがある。', en: 'There is a risk the typhoon will make landfall.' }, { ja: '個人情報が漏れる恐れがあります。', en: 'There is a danger of personal data leaking.' }], note: 'The news broadcast\'s measured alarm — always an unwelcome outcome, never a hope. かねない suspects; 恐れがある announces.' },
  { id: 'nikotaete', p: '〜に応えて', lv: 'N2', mEn: 'in response to …', mJa: '期待・要望への応答', form: '名詞 + に応えて（こたえて）', ex: [{ ja: '観客の声援に応えて、手を振った。', en: 'He waved in response to the crowd\'s cheers.' }, { ja: '皆様のご要望に応えて、営業時間を延ばします。', en: 'In answer to your requests, we are extending our hours.' }], note: 'Answers hopes, cheers, demands — the reply is an act, not words. に対して merely faces something; に応えて rises to it.' },
  { id: 'wotsuujite', p: '〜を通じて／〜を通して', lv: 'N2', mEn: 'through …; throughout …', mJa: '媒介・全期間', form: '名詞 + を通じて／を通して', ex: [{ ja: '友人を通じて彼女と知り合った。', en: 'I came to know her through a friend.' }, { ja: 'この地方は一年を通して暖かい。', en: 'This region is warm throughout the year.' }], note: 'A channel things pass along, or a span covered end to end. 通して leans slightly toward deliberate use of the channel; 通じて toward circumstance.' },
  { id: 'niwatatte', p: '〜にわたって', lv: 'N2', mEn: 'spanning …; over a range of …', mJa: '範囲の広がり', form: '名詞 + にわたって（わたる + 名詞）', ex: [{ ja: '工事は十年にわたって続いた。', en: 'The construction went on for a span of ten years.' }, { ja: '詳細にわたって説明された。', en: 'It was explained down to the details.' }], note: 'Spreads over an expanse — time, area, topics — and quietly admires the breadth. を通じて passes through; にわたって covers.' },
  { id: 'wokomete', p: '〜を込めて', lv: 'N2', mEn: 'with … put into it', mJa: '感情の注入', form: '名詞 + を込めて', ex: [{ ja: '心を込めて作った料理です。', en: 'A meal made with heart.' }, { ja: '感謝を込めて、手紙を書いた。', en: 'I wrote the letter with gratitude folded in.' }], note: 'Pours a feeling into the act — 愛を込めて, 祈りを込めて. The verb after it is the vessel that carries the feeling.' },
  { id: 'nitomonatte', p: '〜に伴って', lv: 'N2', mEn: 'accompanying …; as … changes', mJa: '随伴の変化', form: '名詞／動詞辞書形（の）+ に伴って（ともなって）', ex: [{ ja: '高齢化に伴って、医療費が増えている。', en: 'With the aging of society, medical costs are rising.' }, { ja: '引っ越しに伴って、学校も変わった。', en: 'With the move came a change of schools too.' }], note: 'One large change walks and another follows in step — formal, written. につれて feels the drift; に伴って files the report.' },
  { id: 'dakeatte', p: '〜だけあって', lv: 'N2', mEn: 'as one would expect of …', mJa: '名に恥じない納得', form: '名詞／普通形 + だけあって', ex: [{ ja: 'さすが職人だけあって、仕上がりが美しい。', en: 'As you would expect of a craftsman, the finish is beautiful.' }, { ja: '十年住んでいただけあって、道に詳しい。', en: 'Having lived there ten years, no wonder she knows the streets.' }], note: 'Admiring confirmation — the quality matches the credential. Often opened with さすが; the cousin だけに can also carry bad outcomes.' },
  { id: 'karaniwa', p: '〜からには', lv: 'N2', mEn: 'now that …; since … (resolve follows)', mJa: '決意の根拠', form: '普通形 + からには', ex: [{ ja: '引き受けたからには、最後までやる。', en: 'Now that I have taken it on, I will see it through.' }, { ja: '日本に住むからには、日本語を学びたい。', en: 'Since I am to live in Japan, I want to learn the language.' }], note: 'The premise locks and duty or resolve follows — the tail carries つもり, べき, 意向. 以上（は） is its formal twin.' },
  { id: 'kotodakara', p: '〜ことだから', lv: 'N2', mEn: 'knowing …, surely …', mJa: '人柄からの推量', form: '人物名詞の + ことだから', ex: [{ ja: '几帳面な彼のことだから、もう準備できているだろう。', en: 'Knowing how meticulous he is, he is surely ready by now.' }, { ja: 'あなたのことだから、心配していると思った。', en: 'Knowing you, I figured you were worrying.' }], note: 'Reasons from a person\'s known character to a confident guess — the subject is someone both speakers know. Affectionate or exasperated, rarely neutral.' },
  { id: 'ageku', p: '〜あげく', lv: 'N2', mEn: 'after all that, … (bad end)', mJa: '経過の果ての悪い結果', form: '動詞タ形／名詞の + あげく（に）', ex: [{ ja: 'さんざん迷ったあげく、何も買わなかった。', en: 'After all that agonizing, I bought nothing.' }, { ja: '口論のあげく、二人は別れてしまった。', en: 'The quarrel ended with the two of them parting.' }], note: 'A long, draining process tips into an unwanted end. 末に walks the same road but may arrive somewhere good.' },
  { id: 'sueni', p: '〜末に', lv: 'N2', mEn: 'after long …; at the end of …', mJa: '長い経過の末', form: '動詞タ形／名詞の + 末（に）', ex: [{ ja: '議論を重ねた末に、結論が出た。', en: 'After rounds of discussion, a conclusion was reached.' }, { ja: '悩んだ末の決断だった。', en: 'It was a decision made after much agonizing.' }], note: 'The far end of a long road, outcome open — good or bad. あげく has already decided the ending is a sigh.' },
  { id: 'bekida', p: '〜べきだ', lv: 'N3', mEn: 'should …; ought to …', mJa: '当為', form: '動詞辞書形 + べきだ（する → すべきだ可）', ex: [{ ja: '約束は守るべきだ。', en: 'Promises ought to be kept.' }, { ja: 'あんなことを言うべきではなかった。', en: 'I should not have said that.' }], note: 'Duty argued from principle, said straight — stronger and more public than 〜たほうがいい\'s friendly advice. Not for rules already written down (that is なければならない).' },
  { id: 'wakeda', p: '〜わけだ', lv: 'N3', mEn: 'so that means …; no wonder …', mJa: '納得の帰結', form: '普通形 + わけだ', ex: [{ ja: '十年も住んでいたのか。日本語がうまいわけだ。', en: 'Ten years living there? No wonder your Japanese is good.' }, { ja: 'つまり、明日は休みというわけだ。', en: 'So that means tomorrow is a day off.' }], note: 'The click of things adding up — a conclusion the facts were already carrying. Its negations split: わけではない (not necessarily) and わけがない (impossible).' },
  { id: 'wakeganai', p: '〜わけがない', lv: 'N2', mEn: 'there is no way that …', mJa: '可能性の全否定', form: '普通形 + わけがない', ex: [{ ja: '彼がうそをつくわけがない。', en: 'There is no way he would lie.' }, { ja: 'こんな量、一日で終わるわけがない。', en: 'No way this amount gets done in a day.' }], note: 'Reasoned impossibility — the logic itself forbids it. はずがない argues from evidence; っこない says the same thing in sneakers.' },
  { id: 'seika', p: '〜せいか', lv: 'N2', mEn: 'perhaps because of …', mJa: '不確かな原因', form: '名詞の／普通形 + せいか', ex: [{ ja: '年のせいか、朝早く目が覚める。', en: 'Perhaps because of age, I wake early.' }, { ja: '気のせいか、部屋が明るく見える。', en: 'Maybe it is just me, but the room looks brighter.' }], note: 'A suspected cause with the blame softened by doubt — the outcome is usually unwelcome. 気のせいか — perhaps my imagination — is the fossil.' },
  { id: 'bakarini', p: '〜ばかりに', lv: 'N2', mEn: 'simply because … (regret)', mJa: '一因への悔い', form: '普通形 + ばかりに', ex: [{ ja: '一言多かったばかりに、彼を怒らせてしまった。', en: 'Because of one word too many, I made him angry.' }, { ja: 'お金がないばかりに、進学をあきらめた。', en: 'For want of money alone, she gave up on further schooling.' }], note: 'One small cause, one large regret — the speaker stares at the single hinge the misfortune turned on. Always a bad result.' },
  { id: 'nikimatteiru', p: '〜に決まっている', lv: 'N2', mEn: 'definitely …; bound to be …', mJa: '断定の確信', form: '普通形／名詞 + に決まっている', ex: [{ ja: 'そんな話、うそに決まっている。', en: 'That story is definitely a lie.' }, { ja: '毎日練習すれば、うまくなるに決まっている。', en: 'Practice every day and you are bound to improve.' }], note: 'Certainty declared as settled fact, with feeling — the spoken cousin of に違いない, less evidence, more conviction.' },
  { id: 'toiuyori', p: '〜というより', lv: 'N2', mEn: 'rather than …; more … than …', mJa: '言い直しの比較', form: '名詞／普通形 + というより（むしろ）', ex: [{ ja: '彼は歌手というより俳優だ。', en: 'He is less a singer than an actor.' }, { ja: '涼しいというより寒い。', en: 'Not so much cool as cold.' }], note: 'Rejects the first label mid-sentence and reaches for the truer one, often with むしろ waiting. A tool for precision, not comparison of two things.' },
  { id: 'marudeyouda', p: 'まるで〜ようだ', lv: 'N3', mEn: 'just like …; as if …', mJa: '直喩の強調', form: 'まるで + 名詞の／普通形 + ようだ（みたいだ）', ex: [{ ja: 'まるで夢のようだ。', en: 'It is just like a dream.' }, { ja: '彼女はまるで日本人のように話す。', en: 'She speaks just like a Japanese person.' }], note: 'まるで arms the simile in advance — the resemblance will be total. Pairs with ようだ in writing, みたいだ in speech; かのように pushes it counterfactual.' },
  { id: 'tebakariiru', p: '〜てばかりいる', lv: 'N4', mEn: 'does nothing but …', mJa: '偏った反復', form: '動詞テ形 + ばかりいる', ex: [{ ja: '弟は遊んでばかりいる。', en: 'My little brother does nothing but play.' }, { ja: '泣いてばかりいないで、話してごらん。', en: 'Stop just crying and try telling me.' }], note: 'One action crowding out all the rest, said with a frown. The noun version (ゲームばかり) weighs the diet; てばかりいる watches the behaviour.' },
  { id: 'zujimai', p: '〜ずじまい', lv: 'N1', mEn: 'ended up never …ing', mJa: '果たせぬまま終わる', form: '動詞ナイ形（-ない）+ ずじまい（する → せずじまい）', ex: [{ ja: '結局、彼に会えずじまいだった。', en: 'In the end, I never did get to see him.' }, { ja: '言いたいことを言えずじまいで帰った。', en: 'I went home without ever saying what I wanted to say.' }], note: 'The window closed with the thing undone — regret sealed in past tense. Usually 結局 stands nearby, shaking its head.' },
  { id: 'kata', p: '〜方', lv: 'N5', mEn: 'how to …; way of …ing', mJa: 'やり方の名詞化', form: '動詞マス幹 + 方（かた）', ex: [{ ja: 'この漢字の読み方を教えてください。', en: 'Please tell me how to read this kanji.' }, { ja: '彼の話し方が好きだ。', en: 'I like the way he talks.' }], note: 'Turns any action into its method — 使い方, 作り方, 考え方. The first question-forming tool a learner owns: 何と言いますか is far away, 言い方 is right here.' },
  { id: 'kadouka', p: '〜かどうか', lv: 'N4', mEn: 'whether or not …', mJa: '二者の不明', form: '普通形 + かどうか', ex: [{ ja: '行けるかどうか、まだ分からない。', en: 'I do not yet know whether I can go.' }, { ja: '本当かどうか、確かめよう。', en: 'Let us check whether it is true.' }], note: 'Folds a yes-no question whole into a sentence. With a question word (だれ, いつ), plain か alone does the folding — どうか only serves the yes-no kind.' },
  { id: 'garu', p: '〜がる', lv: 'N4', mEn: 'shows signs of feeling …', mJa: '他者の感情の外見', form: '形容詞語幹 + がる（恥ずかしがる・嫌がる）', ex: [{ ja: '犬は雷を怖がっている。', en: 'The dog is (visibly) afraid of the thunder.' }, { ja: '彼は寒がりだ。', en: 'He feels the cold badly.' }], note: 'Feelings read from the outside — Japanese reserves bare emotion words for the self. がり makes it a temperament: 寒がり, 恥ずかしがり屋. たがる is this same lens on wanting.' },
  { id: 'nagaramo', p: '〜ながらも', lv: 'N2', mEn: 'while …, nevertheless …', mJa: '逆接の同時', form: '動詞マス幹／形容詞／名詞 + ながらも', ex: [{ ja: '狭いながらも、楽しい我が家だ。', en: 'Cramped though it is, it is our happy home.' }, { ja: '悪いと知りながらも、やめられない。', en: 'Knowing it is bad, I still cannot stop.' }], note: 'ながら\'s contrary face made explicit by も — two truths that should not sit together, sitting together. 残念ながら (regrettably) is the everyday fossil of this ながら.' },
  { id: 'tehoshii', p: '〜てほしい', lv: 'N4', mEn: 'want (someone) to …', mJa: '他者への願望', form: '動詞テ形 + ほしい（相手は に）', ex: [{ ja: 'あなたにも来てほしい。', en: 'I want you to come too.' }, { ja: '分かってほしいことがある。', en: 'There is something I want you to understand.' }], note: 'たい wants to act; てほしい wants another to act. The negative splits meaningfully: 来ないでほしい (please do not) vs 来てほしくない (I do not wish it).' },
  { id: 'nasai', p: '〜なさい', lv: 'N4', mEn: 'do … (firm but not rough)', mJa: '柔らかい命令', form: '動詞マス幹 + なさい', ex: [{ ja: '早く寝なさい。', en: 'Go to bed now.' }, { ja: '次の問いに答えなさい。', en: 'Answer the following questions.' }], note: 'The parent\'s and the exam paper\'s imperative — authority with composure. おやすみなさい and ごめんなさい are its polished fossils.' },
  { id: 'sasetekudasai', p: '〜させてください', lv: 'N4', mEn: 'please let me …', mJa: '許可を求める使役', form: '使役テ形 + ください', ex: [{ ja: '少し考えさせてください。', en: 'Please let me think a moment.' }, { ja: 'この仕事は私にやらせてください。', en: 'Please let me be the one to do this job.' }], note: 'The causative turned humble: permission asked as a favour. Business Japanese breathes it — 休ませていただきます walks the same road further.' },
  { id: 'kotoka', p: '〜ことか', lv: 'N2', mEn: 'how …! (exclamation)', mJa: '詠嘆', form: '疑問詞 + 普通形 + ことか', ex: [{ ja: '何度言ったことか。', en: 'How many times have I said it!' }, { ja: 'どんなに心配したことか。', en: 'How I worried!' }], note: 'A question word with no question left in it — pure exhaled feeling. どれほど, どんなに, 何度 open it; the voice falls, not rises.' },
  { id: 'monogaaru', p: '〜ものがある', lv: 'N2', mEn: 'there is something … about it', mJa: '感じさせる何か', form: '普通形（連体）+ ものがある', ex: [{ ja: '彼の演奏には人を引きつけるものがある。', en: 'There is something in his playing that draws people.' }, { ja: '故郷の変わりように、寂しいものがある。', en: 'There is something lonely in how much home has changed.' }], note: 'Points at a quality felt but not fully named — the reviewer\'s tool. The something stays unspecified on purpose.' },
  { id: 'nikagiru', p: '〜に限る', lv: 'N2', mEn: 'nothing beats …', mJa: '最良の断定', form: '名詞／動詞辞書形 + に限る', ex: [{ ja: '夏は冷たいそばに限る。', en: 'In summer, nothing beats cold soba.' }, { ja: '疲れた日は早く寝るに限る。', en: 'On a tiring day, the best thing is simply to sleep early.' }], note: 'Personal best-in-class, declared with relish. Its stricter siblings: に限らず opens the set, に限って narrows to the worst possible case.' },
  { id: 'nishitemo', p: '〜にしても', lv: 'N2', mEn: 'even granting …; even for …', mJa: '譲歩しつつ物申す', form: '名詞／普通形 + にしても', ex: [{ ja: '冗談にしても、言いすぎだ。', en: 'Even as a joke, that goes too far.' }, { ja: '忙しいにしても、連絡ぐらいできるだろう。', en: 'Busy or not, surely a message was possible.' }], note: 'Accepts the excuse and objects anyway. Doubled (親にしても子にしても) it sweeps both cases under one verdict.' },
  { id: 'toshitara', p: '〜としたら', lv: 'N2', mEn: 'supposing that …', mJa: '仮定の入口', form: '普通形 + としたら／とすれば／とすると', ex: [{ ja: '引っ越すとしたら、どこがいい？', en: 'Supposing you moved, where would be good?' }, { ja: '彼の話が本当だとすれば、大変なことだ。', en: 'If his story is true, this is serious.' }], note: 'Steps inside a hypothesis to look around. たら awaits a real future; としたら entertains a pure supposition, true or not.' },
  { id: 'toshitemo', p: '〜としても', lv: 'N2', mEn: 'even if we suppose …', mJa: '仮定の譲歩', form: '普通形 + としても', ex: [{ ja: '今から急いだとしても、間に合わない。', en: 'Even supposing we hurried now, we would not make it.' }, { ja: '事実だとしても、言い方があるだろう。', en: 'Even if it is true, there are kinder ways to say it.' }], note: 'Grants the supposition its full weight, then holds the line. たとえ〜ても feels the concession; としても reasons it.' },
  { id: 'dakeni', p: '〜だけに', lv: 'N2', mEn: 'precisely because …; all the more since …', mJa: '相応の理由', form: '名詞／普通形 + だけに', ex: [{ ja: '期待していただけに、失望も大きかった。', en: 'Precisely because hopes were high, the disappointment cut deep.' }, { ja: 'プロだけに、目のつけどころが違う。', en: 'Being a professional, she sees what others miss.' }], note: 'The cause fits the effect like a key — and unlike admiring だけあって, it turns for bad outcomes too, where the height of hope measures the fall.' },
  { id: 'saichuuni', p: '〜最中に', lv: 'N2', mEn: 'in the very middle of …', mJa: '進行の真っ只中', form: '動詞テイル形／名詞の + 最中（さいちゅう）に', ex: [{ ja: '会議の最中に、電話が鳴った。', en: 'Right in the middle of the meeting, a phone rang.' }, { ja: '話している最中に、割り込まないで。', en: 'Do not cut in while someone is mid-sentence.' }], note: 'The peak of an ongoing act, usually pierced by an interruption. うちに watches a window close; 最中に stands at the busiest point of it.' },
  { id: 'tokoroni', p: '〜ところに／ところへ', lv: 'N2', mEn: 'just when …, (something arrives)', mJa: '場面への到来', form: '動詞辞書形・テイル形・タ形 + ところに／ところへ', ex: [{ ja: '出かけようとしたところに、雨が降り出した。', en: 'Just as I was about to leave, it started to rain.' }, { ja: '困っているところへ、友達が来てくれた。', en: 'Just when I was stuck, a friend showed up.' }], note: 'A scene at some stage of the ladder (about to / amid / just after), and something walks into it — welcome or not. ところだ states the stage; ところに lets an arrival change it.' },
  { id: 'tatokoro', p: '〜たところ', lv: 'N2', mEn: 'when I did …, (I found)', mJa: '行為の結果の発見', form: '動詞タ形 + ところ（、）', ex: [{ ja: '問い合わせたところ、在庫があるとのことだった。', en: 'When I inquired, they said it was in stock.' }, { ja: '開けてみたところ、中は空だった。', en: 'On opening it, I found it empty.' }], note: 'A formal hinge between an act and what it uncovered — no causation claimed, just sequence and discovery. Reports and business mail lean on it.' },
  { id: 'bakarida', p: '〜ばかりだ', lv: 'N2', mEn: 'does nothing but … (worsening)', mJa: '悪化の一途', form: '動詞辞書形 + ばかりだ', ex: [{ ja: '状況は悪くなるばかりだ。', en: 'The situation only keeps worsening.' }, { ja: '二人の距離は開くばかりだった。', en: 'The distance between them did nothing but grow.' }], note: 'One-way motion downhill — where 一方だ can climb or sink, ばかりだ only sinks. After タ形 it is a different word entirely (just did).' },
  { id: 'wokikkakeni', p: '〜をきっかけに', lv: 'N2', mEn: 'taking … as the occasion', mJa: '転機の名指し', form: '名詞 + をきっかけに（して）', ex: [{ ja: '病気をきっかけに、生活を見直した。', en: 'The illness became the occasion to rethink how I live.' }, { ja: '留学をきっかけに、日本語を始めた。', en: 'Studying abroad is what started me on Japanese.' }], note: 'Names the pebble that started the landslide — a change traces itself to one event. を機に is its suit-and-tie double.' },
  { id: 'womotoni', p: '〜をもとに', lv: 'N2', mEn: 'drawing on …; modelled on …', mJa: '素材・原型', form: '名詞 + をもとに（して）', ex: [{ ja: '実話をもとにした映画だ。', en: 'A film drawn from a true story.' }, { ja: 'アンケートをもとに、計画を立てた。', en: 'We built the plan from the survey.' }], note: 'Raw material shaped into something new. に基づいて obeys its ground; をもとに merely quarries it.' },
  { id: 'kotokara', p: '〜ことから', lv: 'N2', mEn: 'from the fact that …', mJa: '観察からの由来', form: '普通形 + ことから', ex: [{ ja: '窓が割れていたことから、泥棒に入られたと分かった。', en: 'From the broken window, we knew there had been a break-in.' }, { ja: '桜の名所であることから、この駅名がついた。', en: 'The station takes its name from the famous cherry blossoms here.' }], note: 'An observed fact becomes the spring of an inference or a name. から reasons privately; ことから points at public evidence.' },
  { id: 'monodakara', p: '〜ものだから', lv: 'N2', mEn: 'because … (excusing oneself)', mJa: '弁解の理由', form: '普通形 + ものだから（もんだから）', ex: [{ ja: '道が混んでいたものだから、遅れてしまった。', en: 'The roads were jammed, you see — that is why I am late.' }, { ja: 'あまりに安かったものだから、つい買ってしまった。', en: 'It was so cheap, I just ended up buying it.' }], note: 'A reason held up slightly pleadingly — the outcome was beyond me. Speech softens it to もんだから; つい often stands in the result clause.' },
  { id: 'hanmen', p: '〜反面', lv: 'N2', mEn: 'while on the other hand …', mJa: '同一物の裏表', form: '普通形（連体）+ 反面（はんめん）', ex: [{ ja: '都会は便利な反面、家賃が高い。', en: 'The city is convenient; on the flip side, rent is high.' }, { ja: 'この薬はよく効く反面、眠くなる。', en: 'This medicine works well but, on the other hand, makes you drowsy.' }], note: 'One thing, two faces — both true of the same subject. 一方で can contrast two different things; 反面 flips a single coin.' },
  { id: 'ippoude', p: '〜一方で', lv: 'N2', mEn: 'while …; whereas …', mJa: '並行する対比', form: '普通形（連体）+ 一方（で）', ex: [{ ja: '輸出が伸びる一方で、国内の消費は落ち込んでいる。', en: 'While exports grow, domestic consumption is slumping.' }, { ja: '彼は厳しい一方で、面倒見がいい。', en: 'He is strict, and at the same time takes good care of people.' }], note: 'Two currents running side by side — contrast or mere parallel. The one-way slide 一方だ is a different door on the same 一方.' },
  { id: 'kawarini', p: '〜かわりに', lv: 'N2', mEn: 'instead of …; in exchange for …', mJa: '代替・交換', form: '名詞の／普通形（連体）+ かわりに', ex: [{ ja: '電話のかわりにメールで連絡した。', en: 'I wrote instead of calling.' }, { ja: '手伝ってもらうかわりに、昼ごはんをおごるよ。', en: 'In exchange for your help, lunch is on me.' }], note: 'A swap: one thing steps aside and another takes its place, or a benefit is paid back in kind. 代わり alone also names the substitute person.' },
  { id: 'tsuideni', p: '〜ついでに', lv: 'N2', mEn: 'while one is at it', mJa: '便乗の行為', form: '動詞辞書形・タ形／名詞の + ついでに', ex: [{ ja: '買い物のついでに、図書館に寄った。', en: 'While out shopping, I stopped by the library.' }, { ja: '出かけたついでに、髪も切ってきた。', en: 'Since I was out anyway, I got a haircut too.' }], note: 'The main errand carries a passenger. がてら blends two purposes into one going; ついでに keeps the hierarchy — main first, rider second.' },
  { id: 'toorini', p: '〜とおりに', lv: 'N3', mEn: 'just as …; according to …', mJa: '一致の遂行', form: '動詞辞書形・タ形 + とおりに／名詞 + どおりに', ex: [{ ja: '先生が言ったとおりに、書いてみた。', en: 'I wrote it just as the teacher said.' }, { ja: '計画どおりに進んでいる。', en: 'It is going according to plan.' }], note: 'The copy matches the original — instructions, plans, predictions. After a noun the reading voices to どおり (予定どおり, 文字どおり).' },
  { id: 'mama', p: '〜まま', lv: 'N3', mEn: 'as it is; leaving … unchanged', mJa: '状態の保存', form: '動詞タ形／ナイ形／名詞の + まま', ex: [{ ja: 'くつをはいたまま、入らないでください。', en: 'Please do not come in with your shoes still on.' }, { ja: '昔のままの町並みが残っている。', en: 'The streets remain just as they were.' }], note: 'A state carried unchanged into the next scene — often one that ought to have changed. 〜たきり adds silence after; まま just holds the pose.' },
  { id: 'kigasuru', p: '〜気がする', lv: 'N3', mEn: 'have a feeling that …', mJa: '漠然とした感じ', form: '普通形 + 気がする', ex: [{ ja: 'どこかで会った気がする。', en: 'I have a feeling we have met somewhere.' }, { ja: '今日はうまくいく気がする。', en: 'I have a feeling today will go well.' }], note: 'A hunch below the level of evidence — weaker than と思う, warmer than かもしれない. 気がしない refuses at the same depth: する気がしない, I cannot summon the will.' },
  { id: 'nihanshite', p: '〜に反して', lv: 'N2', mEn: 'contrary to …', mJa: '予想・意向への背反', form: '名詞 + に反して（はんして）', ex: [{ ja: '予想に反して、試合は楽勝だった。', en: 'Contrary to expectations, the match was an easy win.' }, { ja: '親の意向に反して、彼は画家になった。', en: 'Against his parents\' wishes, he became a painter.' }], note: 'The outcome walks against a stated expectation, wish, or rule — 予想, 期待, 意向 are its usual partners. とは違って merely differs; に反して defies.' },
  { id: 'nikuwaete', p: '〜に加えて', lv: 'N2', mEn: 'in addition to …', mJa: '追加の累積', form: '名詞 + に加えて（くわえて）', ex: [{ ja: '強風に加えて、雨も降り出した。', en: 'On top of the strong wind, rain began to fall.' }, { ja: '英語に加えて、中国語も勉強している。', en: 'In addition to English, she is studying Chinese.' }], note: 'Stacks a second item onto a first of equal rank, neutrally — 上に colours the pile good or bad; に加えて just adds.' },
  { id: 'hamochiron', p: '〜はもちろん', lv: 'N2', mEn: 'not to mention …; to say nothing of …', mJa: '当然の起点', form: '名詞 + はもちろん（のこと）', ex: [{ ja: '平日はもちろん、週末も働いている。', en: 'He works weekends, never mind weekdays.' }, { ja: '子供はもちろん、大人も楽しめる映画だ。', en: 'A film adults can enjoy too — children go without saying.' }], note: 'Plants the obvious case first, then widens the circle. はおろか does the same walk in the dark — its clause ends negative.' },
  { id: 'nominarazu', p: '〜のみならず', lv: 'N1', mEn: 'not only … (formal)', mJa: '累加（文語）', form: '名詞／普通形 + のみならず', ex: [{ ja: '国内のみならず、海外でも高く評価された。', en: 'It was acclaimed not only at home but abroad.' }, { ja: '彼は学者のみならず、詩人でもあった。', en: 'He was not only a scholar but a poet.' }], note: 'ばかりでなく in ceremonial dress — editorials and citations. The second clause often carries も or さえ.' },
  { id: 'wotowazu', p: '〜を問わず', lv: 'N2', mEn: 'regardless of …', mJa: '不問', form: '名詞 + を問わず（とわず）', ex: [{ ja: '経験を問わず、応募できます。', en: 'You may apply regardless of experience.' }, { ja: '昼夜を問わず、工事が続いた。', en: 'The construction went on day and night.' }], note: 'The category is declared irrelevant — job ads and rules love it. Its partner nouns come in pairs or spans: 男女, 昼夜, 年齢.' },
  { id: 'nikakawarazu', p: '〜にかかわらず', lv: 'N2', mEn: 'irrespective of …; whether or not …', mJa: '左右されない', form: '名詞／辞書形・ナイ形の対 + にかかわらず', ex: [{ ja: '天候にかかわらず、大会は行われます。', en: 'The event will be held irrespective of weather.' }, { ja: '行く行かないにかかわらず、返事をください。', en: 'Whether you go or not, please reply.' }], note: 'The outcome refuses to be steered by the factor. を問わず waves a category aside; にかかわらず resists live alternatives (行く行かない).' },
  { id: 'mokamawazu', p: '〜もかまわず', lv: 'N1', mEn: 'heedless of …', mJa: '顧みない', form: '名詞（の）+ もかまわず', ex: [{ ja: '人目もかまわず、大声で泣いた。', en: 'Heedless of onlookers, she wept aloud.' }, { ja: '服がぬれるのもかまわず、川に入った。', en: 'Not caring that his clothes would soak, he waded in.' }], note: 'What should give pause, does not — emotion or urgency overrides propriety. 人目もかまわず is the phrase that carries it.' },
  { id: 'hatomokaku', p: '〜はともかく', lv: 'N2', mEn: 'setting … aside', mJa: '保留して先へ', form: '名詞 + はともかく（として）', ex: [{ ja: '味はともかく、見た目はいい。', en: 'Taste aside, it looks good.' }, { ja: '冗談はともかく、本題に入ろう。', en: 'Joking aside, to the matter at hand.' }], note: 'Parks one issue without ruling on it and moves to what matters now. 〜は別として parks harder; ともかく keeps a hand on the parked thing.' },
  { id: 'nishironishiro', p: '〜にしろ〜にしろ', lv: 'N1', mEn: 'whether … or …', mJa: '両案とも同断', form: '名詞／辞書形 + にしろ + 対になる語 + にしろ（にせよ）', ex: [{ ja: '行くにしろ行かないにしろ、早く決めてほしい。', en: 'Whether you go or not, please decide soon.' }, { ja: '賛成にせよ反対にせよ、理由を述べなさい。', en: 'For or against, state your reasons.' }], note: 'Both branches feed the same verdict. にせよ is its slightly stiffer twin; single にしろ scolds a lone case (冗談にしろ).' },
  { id: 'deare', p: '〜であれ', lv: 'N1', mEn: 'be it …; no matter what …', mJa: '文語の全譲歩', form: '名詞 + であれ（であろうと）', ex: [{ ja: '相手がだれであれ、全力で戦う。', en: 'Whoever the opponent, we fight with everything.' }, { ja: 'どんな理由であれ、暴力は許されない。', en: 'Whatever the reason, violence is not excused.' }], note: 'The classical imperative of である turned concessive — lofty, absolute. Doubled (雨であれ雪であれ) it sweeps all cases.' },
  { id: 'tokitara', p: '〜ときたら', lv: 'N1', mEn: 'when it comes to … (exasperated)', mJa: '呆れの取り立て', form: '名詞 + ときたら', ex: [{ ja: 'うちの息子ときたら、休みの日は寝てばかりだ。', en: 'That son of mine — on days off he does nothing but sleep.' }, { ja: 'この天気ときたら、洗濯もできない。', en: 'This weather! One cannot even do laundry.' }], note: 'Hauls a familiar offender to the front of the sentence and sighs at it. Complaint is the default; fond exasperation the warmest it gets.' },
  { id: 'nisaishite', p: '〜に際して', lv: 'N2', mEn: 'on the occasion of …', mJa: '節目の改まり', form: '名詞／動詞辞書形 + に際して（さいして）', ex: [{ ja: 'ご利用に際して、以下をお読みください。', en: 'On using this service, please read the following.' }, { ja: '開会に際して、一言ご挨拶申し上げます。', en: 'On the occasion of the opening, allow me a few words.' }], note: 'A formal threshold — ceremonies, contracts, announcements. とき in a morning coat; the moment is significant, not ordinary.' },
  { id: 'niatatte', p: '〜にあたって', lv: 'N2', mEn: 'at the (important) juncture of …', mJa: '重要な局面で', form: '名詞／動詞辞書形 + にあたって', ex: [{ ja: '新生活を始めるにあたって、部屋を借りた。', en: 'Setting out on a new life, I rented a room.' }, { ja: '受験にあたって、注意事項を確認した。', en: 'Ahead of the examination, I checked the instructions.' }], note: 'A positive undertaking at its outset — preparations and resolutions gather here. に際して presides; にあたって rolls up its sleeves.' },
  { id: 'nisakidatte', p: '〜に先立って', lv: 'N1', mEn: 'prior to … (formal)', mJa: '公式の前段', form: '名詞／動詞辞書形 + に先立って（さきだって）', ex: [{ ja: '公開に先立って、試写会が行われた。', en: 'Ahead of the release, a preview screening was held.' }, { ja: '工事に先立って、住民説明会を開いた。', en: 'Prior to construction, a residents\' briefing was held.' }], note: 'The official curtain-raiser — what happens first is itself an event. 前に states order; に先立って announces protocol.' },
  { id: 'teirai', p: '〜て以来', lv: 'N2', mEn: 'ever since …', mJa: '起点からずっと', form: '動詞テ形 + 以来（いらい）', ex: [{ ja: '卒業して以来、彼とは会っていない。', en: 'I have not seen him since graduation.' }, { ja: 'この店は開店して以来、行列が絶えない。', en: 'Ever since it opened, the line outside this shop has never broken.' }], note: 'A starting point and an unbroken state flowing from it — not for events that happened once in between. たきり shares the start but ends in silence.' },
  { id: 'tekaradenaito', p: '〜てからでないと', lv: 'N2', mEn: 'not until … has been done', mJa: '前提条件の順序', form: '動詞テ形 + からでないと（からでなければ）+ 否定', ex: [{ ja: '許可をもらってからでないと、入れません。', en: 'You cannot enter until you have permission.' }, { ja: '実物を見てからでないと、決められない。', en: 'I cannot decide before seeing the real thing.' }], note: 'One door must open before the next — the tail clause is always a cannot. The plain てから orders events; からでないと bars them.' },
  { id: 'kagiri', p: '〜限り', lv: 'N2', mEn: 'as long as …; while … holds', mJa: '条件の持続', form: '動詞辞書形・テイル形／名詞である + 限り（かぎり）', ex: [{ ja: '体が動く限り、働きたい。', en: 'As long as this body moves, I want to work.' }, { ja: '学生である限り、規則には従うこと。', en: 'While you are a student, the rules apply.' }], note: 'The condition is a floor the promise stands on — remove it and everything above goes. 力の限り (with all one\'s strength) shows its other face: the full extent.' },
  { id: 'kagirideha', p: '〜限りでは', lv: 'N2', mEn: 'as far as … goes', mJa: '知見の範囲内', form: '動詞辞書形・タ形 + 限りでは', ex: [{ ja: '私が知っている限りでは、彼は独身だ。', en: 'As far as I know, he is single.' }, { ja: '調べた限りでは、問題は見つからなかった。', en: 'As far as my checking went, no problems turned up.' }], note: 'Honesty about the edge of one\'s knowledge — the claim stops where the looking stopped. 知る, 見る, 聞く, 調べる are its usual verbs.' },
  { id: 'kanaikanouchini', p: '〜か〜ないかのうちに', lv: 'N1', mEn: 'scarcely had … when …', mJa: '重なり合う直後', form: '動詞辞書形／タ形 + か + ナイ形 + かのうちに', ex: [{ ja: 'ベルが鳴るか鳴らないかのうちに、彼は教室を出た。', en: 'The bell had scarcely rung when he was out of the classroom.' }, { ja: '横になるかならないかのうちに、眠ってしまった。', en: 'I was asleep almost before I lay down.' }], note: 'The two events overlap at the seam — did the first even finish? が早いか is sharp sequence; かのうちに blurs the boundary itself.' },
  { id: 'tagasaigo', p: '〜たが最後', lv: 'N1', mEn: 'once …, (there is no return)', mJa: '取り返しのつかない開始', form: '動詞タ形 + が最後（さいご）／たら最後', ex: [{ ja: '彼が話し出したが最後、止まらない。', en: 'Once he starts talking, there is no stopping him.' }, { ja: 'このボタンを押したが最後、取り消せません。', en: 'Press this button and there is no undoing it.' }], note: 'One act, then an irreversible slide — the consequence clause is long, dire, or both. たら最後 is the spoken variant.' },
  { id: 'wohete', p: '〜を経て', lv: 'N1', mEn: 'by way of …; after passing through …', mJa: '経由・経歴', form: '名詞 + を経て（へて）', ex: [{ ja: '十年の交際を経て、二人は結婚した。', en: 'After ten years together, the two married.' }, { ja: '厳しい審査を経て、選ばれた作品だ。', en: 'A work chosen after rigorous screening.' }], note: 'Stages passed through leave their mark on what arrives — careers, journeys, processes. を通じて is a channel; を経て is a road with milestones.' },
  { id: 'nukinishite', p: '〜抜きにして', lv: 'N2', mEn: 'leaving … out; without …', mJa: '除外しての進行', form: '名詞 + 抜きにして／抜きで（ぬき）', ex: [{ ja: '冗談抜きにして、真剣に考えてほしい。', en: 'All joking aside — I want you to think about this seriously.' }, { ja: 'わさび抜きでお願いします。', en: 'Without wasabi, please.' }], note: 'Removes an expected ingredient and proceeds — from sushi orders (〜抜きで) to discourse (冗談抜きにして). 〜は抜きにして opens meetings the way "let\'s skip the formalities" does.' },
  { id: 'hasateoki', p: '〜はさておき', lv: 'N1', mEn: 'leaving … aside for now', mJa: '一旦脇に置く', form: '名詞 + はさておき', ex: [{ ja: '結果はさておき、挑戦したことがすばらしい。', en: 'The result aside, the attempt itself is admirable.' }, { ja: '冗談はさておき、本題に入りましょう。', en: 'Joking aside, let us get to the point.' }], note: 'Lays a topic gently on the side table to reach the main dish. はともかく still glances at what it parked; はさておき has already turned away.' },
  { id: 'youdehanaika', p: '〜ようではないか', lv: 'N2', mEn: 'let us … (rallying)', mJa: '呼びかけの提案', form: '意向形 + ではないか（じゃないか）', ex: [{ ja: 'みんなで力を合わせようではないか。', en: 'Let us join forces, all of us.' }, { ja: 'もう一度考え直そうじゃないか。', en: 'Come, let us think it over once more.' }], note: 'The podium\'s invitation — a volitional held up for the room to join. Speeches and editorials; speech softens it to ようじゃないか.' },
  { id: 'katagata', p: '〜かたがた', lv: 'N1', mEn: 'combining … with … (formal calls)', mJa: '兼ねての訪問・挨拶', form: '名詞 + かたがた', ex: [{ ja: 'お礼かたがた、ご報告に伺いました。', en: 'I have come to report — and to thank you at the same time.' }, { ja: '散歩かたがた、様子を見てきた。', en: 'I took a walk and looked in on things while I was at it.' }], note: 'Two courtesies in one visit, both sincere — 挨拶, お礼, お詫び are its companions. がてら is the everyday stroll; かたがた bows.' },
  { id: 'toatte', p: '〜とあって', lv: 'N1', mEn: 'given that … (special circumstance)', mJa: '特別な事情ゆえ', form: '名詞／普通形 + とあって', ex: [{ ja: '連休とあって、どこも混んでいた。', en: 'It being the holidays, everywhere was crowded.' }, { ja: '無料とあって、店の前に行列ができた。', en: 'Free of charge — no wonder a line formed outside.' }], note: 'A special circumstance and its natural consequence, reported from outside — journalism\'s cadence. だから explains; とあって observes.' },
  { id: 'toareba', p: '〜とあれば', lv: 'N1', mEn: 'if it is (for) …, then', mJa: '特別な条件なら', form: '名詞／普通形 + とあれば', ex: [{ ja: '君の頼みとあれば、断れない。', en: 'If it is you asking, I cannot refuse.' }, { ja: '必要とあれば、いつでも駆けつけます。', en: 'Should the need arise, I will come at once.' }], note: 'One special condition unlocks full willingness — loyalty\'s grammar. The condition is usually a person, need, or honour worth rising for.' },
  { id: 'narini', p: '〜なりに', lv: 'N2', mEn: 'in one\'s own (limited) way', mJa: '分相応の努力', form: '名詞 + なりに（の）', ex: [{ ja: '子供なりに、いろいろ考えている。', en: 'In a child\'s own way, she thinks about much.' }, { ja: '私なりのやり方で頑張ります。', en: 'I will do my best in my own fashion.' }], note: 'Effort honest to its limits — modest about the level, sincere about the trying. それなりに (reasonably, for what it is) is the everyday fossil.' },
  { id: 'zukume', p: '〜ずくめ', lv: 'N1', mEn: 'nothing but …; all … through', mJa: '同一物の連続', form: '名詞 + ずくめ', ex: [{ ja: '今日はいいことずくめの一日だった。', en: 'Today was good news from start to finish.' }, { ja: '黒ずくめの服装の男が立っていた。', en: 'A man stood there dressed all in black.' }], note: 'One colour paints everything — events (いいことずくめ), rules (規則ずくめ), clothing (黒ずくめ). だらけ scatters; ずくめ saturates.' },
  { id: 'meku', p: '〜めく', lv: 'N1', mEn: 'take on the air of …', mJa: '気配の兆し', form: '名詞 + めく（めいた + 名詞）', ex: [{ ja: 'ようやく春めいてきた。', en: 'At last it is beginning to feel like spring.' }, { ja: '謎めいた微笑を浮かべた。', en: 'She wore an enigmatic smile.' }], note: 'A quality begins to show through — seasons turning (春めく), airs taken on (謎めいた, 皮肉めいた). The adjectival めいた is where it lives most.' },
  { id: 'kiwamarinai', p: '〜極まりない', lv: 'N1', mEn: 'utterly …; in the extreme', mJa: '極度の断定（負）', form: 'な形容詞語幹 + 極まりない（きわまりない）', ex: [{ ja: '彼の態度は失礼極まりない。', en: 'His attitude is rude in the extreme.' }, { ja: '危険極まりない運転だった。', en: 'It was driving dangerous beyond measure.' }], note: 'The scale runs out — and almost always on an unpleasant quality: 失礼, 危険, 不愉快. 極まる without ない is its rarer, equal twin.' },
  { id: 'nikoshitakotohanai', p: '〜に越したことはない', lv: 'N1', mEn: 'nothing better than …; best to …', mJa: '無難な最善', form: '動詞辞書形／形容詞 + に越したことはない（こしたことはない）', ex: [{ ja: '用心するに越したことはない。', en: 'One can never be too careful.' }, { ja: '安いに越したことはないが、質も大事だ。', en: 'Cheaper is always better — but quality matters too.' }], note: 'The safe best, stated as a truism — usually about caution, health, money. に限る relishes a favourite; に越したことはない hedges wisely.' },
  { id: 'madenokotoda', p: '〜までだ', lv: 'N1', mEn: 'will simply …; merely did …', mJa: '淡々とした選択・弁明', form: '動詞辞書形／タ形 + まで（のこと）だ', ex: [{ ja: '電車がなければ、歩いて帰るまでだ。', en: 'If there are no trains, I shall simply walk home.' }, { ja: '事実を言ったまでです。', en: 'I merely stated the facts.' }], note: 'Two calm faces: the fallback taken without drama (辞書形), and the deed explained down to nothing more (タ形). Both refuse to make a fuss.' },
  { id: 'basoremadeda', p: '〜ばそれまでだ', lv: 'N1', mEn: 'if …, it is all over', mJa: '一事で全て終わり', form: '仮定形 + それまでだ', ex: [{ ja: 'どんなに稼いでも、死んでしまえばそれまでだ。', en: 'However much one earns, die and it is all over.' }, { ja: 'パスワードを忘れればそれまでだ。', en: 'Forget the password and that is the end of it.' }], note: 'One condition erases everything accumulated before it. たら最後 starts an ordeal; ばそれまでだ simply ends the story.' },
  { id: 'zunihairarenai', p: '〜ずにはいられない', lv: 'N1', mEn: 'cannot help but …', mJa: '抑えられない衝動', form: '動詞ナイ形（-ない）+ ずにはいられない（する → せずには）', ex: [{ ja: 'あの映画を見ると、泣かずにはいられない。', en: 'Watching that film, I cannot help but cry.' }, { ja: '一言言わずにはいられなかった。', en: 'I simply had to say something.' }], note: 'The feeling overflows its dam — the self cannot hold the action back. ずにはおかない turns the same shape outward: the THING will not leave one unmoved.' },
  { id: 'woyoginakusareru', p: '〜を余儀なくされる', lv: 'N1', mEn: 'be forced into …', mJa: '不本意の強制', form: '名詞 + を余儀なくされる（よぎなくされる）', ex: [{ ja: '大雨で、大会は中止を余儀なくされた。', en: 'The heavy rain forced the event\'s cancellation.' }, { ja: '経営難で、店は閉店を余儀なくされた。', en: 'Financial straits forced the shop to close.' }], note: 'Circumstances leave no other road — the passive of dignity in news prose. The mirror 〜を余儀なくさせる pins the blame on the cause.' },
  { id: 'shimatsuda', p: '〜始末だ', lv: 'N1', mEn: 'ended up (deplorably) …', mJa: '呆れた成り行きの果て', form: '動詞辞書形 + 始末だ（しまつだ）', ex: [{ ja: '彼は遅刻を重ね、ついには無断欠勤する始末だ。', en: 'Late again and again — and in the end, not showing up at all.' }, { ja: '口論の末、皿を投げる始末だった。', en: 'The quarrel ended with plates being thrown, of all things.' }], note: 'A downhill story reaches its embarrassing final scene — この始末だ shakes its head at the wreckage. Always disapproving.' },
  { id: 'nitaru', p: '〜に足る', lv: 'N1', mEn: 'worthy of …; enough to merit …', mJa: '値する（文語）', form: '動詞辞書形／名詞 + に足る（たる）', ex: [{ ja: '信頼するに足る人物だ。', en: 'A person worthy of trust.' }, { ja: '語るに足る成果はまだない。', en: 'There is as yet no result worth the telling.' }], note: 'Clears the bar of worthiness, formally — 信頼, 尊敬, 満足 stand before it. The negative に足りない dismisses: 取るに足りない, beneath notice.' },
  { id: 'nitaenai', p: '〜に堪えない', lv: 'N1', mEn: 'unbearable to …; cannot fully express …', mJa: '見聞に堪えぬ・感情の極み', form: '動詞辞書形 + に堪えない（たえない）／感情名詞 + に堪えない', ex: [{ ja: '最近のニュースは見るに堪えない。', en: 'The recent news is unbearable to watch.' }, { ja: '感謝の念に堪えません。', en: 'I am filled with gratitude beyond expression.' }], note: 'Two doors from one gate: too painful to keep watching (見る・聞く + に堪えない), and a feeling too large for words (感謝・遺憾 + に堪えない) — ceremonial speech\'s deepest bow.' },
  { id: 'tobakarini', p: '〜とばかりに', lv: 'N1', mEn: 'as if to say …', mJa: '言わんばかりの態度', form: '引用句／普通形 + とばかりに', ex: [{ ja: '今がチャンスとばかりに、彼は駆け出した。', en: 'As if to say now is my chance, he broke into a run.' }, { ja: '帰れとばかりに、ドアを指さした。', en: 'She pointed at the door as much as to say get out.' }], note: 'The unspoken words are painted on the action — the quotation never leaves the mouth. 言わんばかり is its fixed twin.' },
  { id: 'ngatameni', p: '〜んがために', lv: 'N1', mEn: 'for the sake of …ing (archaic resolve)', mJa: '目的（古形）', form: '動詞ナイ形（-ない）+ んがため（に）（する → せんがため）', ex: [{ ja: '勝たんがために、あらゆる手を尽くした。', en: 'To win — for that alone — every measure was tried.' }, { ja: '生きんがための仕事だった。', en: 'It was work done to survive.' }], note: 'The old volitional ん pressed into a purpose — desperate or lofty, never casual. べく states purpose coolly; んがために burns.' },
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
  /** Where the shelf was standing when you last walked off it. The reader has
   * kept its place since v1; the shelf is its analog — leaving records the
   * offset, returning puts it back. Session-only: the store persists what you
   * took, never where you were. */
  shelfScroll: 0,
  /** The archive's analog of shelfScroll: the year-list offset when you last
   * walked into an article (or out to the shelf). Session-only, like its
   * sibling — 93 rows of 2016 keep their place while one of them is read. */
  archiveScroll: 0,
  stack: [],
  // 銀河 hero: the galaxy rests bare but for one symbol; navOpen reveals the
  // top bar and the two corner bubbles.
  navOpen: false,
  /** The 銀河 search session. The bar's input node dies with every render, so
   * the query lives here; navReturn marks a departure THROUGH a result, and
   * the walk back (in-app or device Back) reopens the bar — query, results,
   * and focus on the row you left from. A deliberate dismissal (scrim, the
   * symbol) clears both. Session-only, never persisted. */
  navQ: '',
  navReturn: false,
  /* 文字設定 — persisted (operator, 2026-08-12): a chosen setting must
   * survive the session, and the baseline is bare kanji with readings on
   * request (ふりがな タップで), not readings everywhere. */
  dials: { kanji: 0, furigana: 1, spacing: 0 },
  // entry: 'drift' — The Walk's first step is arriving in the living universe
  variants: {
    cards: 'mcd',
    difficulty: 'three',
    contrast: 'wcag',
    entry: 'drift',
    depth: 'layered',
    // F/G: the Drift tap ladder. Both start on the behaviour the field
    // already shipped with, so an untouched strip is the field as it was.
    ladder: 'stage3',
    sattap: 'staged',
  },
  /* UI language: 'bi' = navigation carries English alongside the Japanese
   * (default — a learner must be able to steer before they can read);
   * 'ja' = 日本語のみ, the opt-in immersion chrome for advanced use. */
  lang: 'bi',
  dialsOpen: false,
  query: '',
  taken: [],
  /** manual lists: { name: [{t,id,label,ts}] } — the operator's Renzo habit */
  lists: {},
  /** real FSRS-6 card state per memorized item, keyed `${t}:${id}` — dates
   * stored as ISO strings, revived at the scheduler boundary */
  srs: {},
  /** compact records for words taken from the deep 70k tier, keyed by written
   * form — the card's answer travels inside the learner's own store */
  deepWords: {},
  /** the review log: append-only, one row per grade, never rewritten. The
   * foundation for FSRS weight optimization, analytics and state recovery —
   * see the layout comment at srsReviewLogRow. */
  revlog: [],
  /** the observation log: append-only rows of encounters and assistance —
   * reader taps, dojo probes. Evidence for routing, never knownness: a tap
   * is friction, not a grade, and no row here touches FSRS state. See the
   * layout comment at obsLog. */
  obslog: [],
  /** storage protection: read-only quarantine when the stored envelope cannot
   * be read (never overwrite what we cannot read), plus the one quiet line */
  storeReadOnly: false,
  storeError: null,
  storeExtras: null,
  /** a running review session: { queue, ix, revealed, declared, done } —
   * null at rest. declared is the zen room's recall declaration for the
   * card that is up: 1 思い出した · 0 まだ · null before the card turns
   * over (kernel law ADR-002 T-06 — see the reveal obslog row) */
  review: null,
  /** a running yomi probe: { queue, ix, revealed, right, missed, minted } —
   * session-only; its evidence lives in the obslog, never in FSRS state */
  probe: null,
  /** zen review: whether the quiet … row (undo · rest · entry) is open */
  reviewMore: false,
  /** finished lessons: { 'N5-1': {score, total, ts} } */
  lessonsDone: {},
  /** a running lesson: { id, lvl, words, ix, phase, ... } — null at rest */
  lessonRun: null,
  /** where the lessons list was standing when a run began — the way back
   * out of a lesson puts the learner at the row they left, not the top of
   * the long N5–N1 list. Session-only, like shelfScroll. */
  lessonsScroll: 0,
  /** the tutor's custom reading: { text, lv, ts } — persisted; null until asked */
  aiReading: null,
  /** earlier readings, newest first, capped — a shelf, not a stream */
  aiReadings: [],
  /** cards resting outside the review cycle: { 't:id': ts } — Anki's
   * suspend, simplified. The item stays on its list; reviews skip it. */
  suspended: {},
  /** the conversation with the tutor: [{ role: 'user'|'tutor', text }] —
   * the bounded request window; the full transcript lives in the archive */
  aiChat: [],
  /** provider seam: optional { baseUrl, model } overrides for the AI door.
   * Empty means the built-in defaults at AI_DEFAULT_*; store-durable so a
   * future settings surface (or an imported record) can carry the choice. */
  ai: {},
  /** a running tutor quiz: { qs, ix, picked, correct, ts } — persisted
   * (POL-13): a mid-quiz reload resumes with the tutor's written questions
   * intact; null at rest. Closed only by the learner's own door. */
  aiQuiz: null,
  /** a quiz REQUEST in flight: { view, depth } naming the room it was asked
   * from — session-only, so a reload never comes back with the door sealed
   * by a request that no longer exists. Its note lives beside it. */
  aiQuizPending: null,
  /** 'ready' | 'failed' | null — what the last request left to say */
  aiQuizNote: null,
  /** in-flight AI requests by `surface|ref` — session-only, so 考え中
   * survives a repaint and a reload never resurrects a dead request */
  aiPending: null,
  /** the chat question half-typed — session-only, so the reply's own render
   * does not throw away what the learner wrote while waiting for it */
  aiChatDraft: '',
  /** the app's own quiet failure lines by `surface|ref` — session-only. A
   * failure is not an assistant turn and never reaches the archive, so a
   * repaint would otherwise replace it with silence. */
  aiNotes: null,
  /** how many chat turns the log unfolds before 前の会話 — session-only */
  aiChatShown: null,
  /** the review trace: { 'YYYY-MM-DD': { n, again } } — history accrues
   * from the first graded card onward; nothing is backfilled or invented */
  stats: {},
  /** the learner's own review pacing (R2-A): how many never-seen cards a day
   * may introduce, and how many due cards one ordinary sitting holds. Both
   * are learner-chosen on the lists surface, persisted, and validated
   * fail-closed like every other root. */
  srsPrefs: { newPerDay: 20, reviewLimit: 20 },
  /** whether the quiet ペース row on the lists surface is unfolded */
  srsPrefsOpen: false,
  /** articles marked finished: { passageId: ts } */
  readDone: {},
  /** where you left each article: { passageId: scrollY } */
  readerPos: {},
  /** tokens whose English gloss is shown beneath (double-tap) */
  glossed: null,
  /** the reader's current thing for the top-right capture door: the word the
   * learner last touched in the open article — { id, index, p }. Session-only
   * by design: the store persists what you took, never what you hovered. */
  readerTake: null,
  /** whether the top-right capture panel (scope stages + lists) is open */
  captureOpen: false,
  /** which shelf cards have their raw signals expanded (詳細) */
  detailsOpen: null,
  sourcesOpen: false,
  debugOpen: false,
  /** Semantic return point for a modal entry sheet across full DOM renders. */
  dialogInvoker: null,
  /** 筆順 · the full-screen stroke-order page, layered over the kanji sheet.
   * null when closed; { id, sheetScroll, invoker, step } when open. */
  strokes: null,
  /** The learner's stroke-number preference survives closing the page.
   * Off by default — the room opens on the clean finished sheet (the
   * design's law); 筆順の番号 is one tap away. */
  strokeNumbers: false,
  /** 書の間 is quiet by default: the page and all chrome recede until the
   * learner wakes the single purpose-built control field. `?minimal=0`
   * remains an internal comparison route for the historical framed room. */
  strokeMinimal: true,
  strokeChromeAwake: false,
  strokePaletteFocus: null,
  /** Sheet scrollTop to put back on the next render (returning from 筆順). */
  sheetScrollRestore: null,
  /** Element id inside the sheet that should take focus on the next render. */
  sheetFocus: null,
};

/* ------------------------------------------------ persistence (localStorage) */
const STORE_KEY = 'kairo-corridor-v1';
/** The keys this build knows how to carry. Anything else found in the stored
 * envelope is preserved verbatim across every save — a newer build's record
 * must survive a visit from an older one with not a byte dropped. */
const STORE_KNOWN_KEYS = [
  'v',
  'taken',
  'lists',
  'srs',
  'revlog',
  'obslog',
  'deepWords',
  'lessonsDone',
  'aiReading',
  'aiReadings',
  'suspended',
  'aiChat',
  'ai',
  'aiQuiz',
  'stats',
  'srsPrefs',
  'readDone',
  'readerPos',
  'dials',
];

function plainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  // Ordinary cross-realm records have a one-hop prototype whose own
  // prototype is null. Null-prototype dictionaries are safe too; class
  // instances and records whose prototype was replaced are not JSON records.
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

// grammar and particles joined the deck in 覚える stage 3 — the store's
// fail-closed envelope must admit what the capture door now offers
const STORE_ITEM_TYPES = new Set(['word', 'kanji', 'radical', 'idiom', 'grammar', 'particle']);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const nonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const validInstant = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

function safeJsonValue(value, depth = 0) {
  if (depth > 24) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (finiteNumber(value)) return true;
  if (Array.isArray(value)) return value.every((item) => safeJsonValue(item, depth + 1));
  if (!plainRecord(value)) return false;
  // JSON member names are data, including "__proto__", "constructor", and
  // "prototype". They are safe while retained as own data properties; a
  // blanket name ban corrupts legitimate list names and unknown future data.
  return Object.values(value).every((item) => safeJsonValue(item, depth + 1));
}

/** Define a dictionary entry without invoking Object.prototype.__proto__'s
 * legacy setter. All user-provided map keys cross this seam. */
function setOwnRecordValue(record, key, value) {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
  return value;
}

function optional(value, key, predicate) {
  return !owns(value, key) || predicate(value[key]);
}

function validTakenSource(value) {
  return (
    value === null ||
    (plainRecord(value) &&
      nonEmptyString(value.passage) &&
      Number.isInteger(value.index) &&
      value.index >= 0 &&
      safeJsonValue(value))
  );
}

function validTakenContext(value) {
  return (
    plainRecord(value) &&
    nonEmptyString(value.p) &&
    Number.isInteger(value.i) &&
    value.i >= 0 &&
    ['sent', 'para'].includes(value.scope) &&
    safeJsonValue(value)
  );
}

function validTakenItem(item) {
  return (
    plainRecord(item) &&
    STORE_ITEM_TYPES.has(item.t) &&
    nonEmptyString(item.id) &&
    optional(item, 'label', (value) => typeof value === 'string') &&
    optional(item, 'kind', (value) => typeof value === 'string') &&
    optional(item, 'kindEn', (value) => typeof value === 'string') &&
    optional(item, 'ts', finiteNumber) &&
    // the explicit promotion mark (R2-A, no-debt migration): when the
    // learner chose retrieval for this row. Absent on legacy and imported
    // rows, which stay cardless until 始める is pressed.
    optional(item, 'started', finiteNumber) &&
    optional(item, 'from', validTakenSource) &&
    optional(item, 'ctx', validTakenContext) &&
    optional(item, 'entrySeq', nonEmptyString) &&
    optional(item, 'cueReading', nonEmptyString) &&
    safeJsonValue(item)
  );
}

function validListItem(item) {
  return (
    plainRecord(item) &&
    STORE_ITEM_TYPES.has(item.t) &&
    nonEmptyString(item.id) &&
    optional(item, 'label', (value) => typeof value === 'string') &&
    optional(item, 'ts', finiteNumber) &&
    safeJsonValue(item)
  );
}

function validStoredCard(card) {
  if (!plainRecord(card) || !safeJsonValue(card) || !validInstant(card.due)) return false;
  if (!optional(card, 'last_review', (value) => value === undefined || validInstant(value))) return false;
  for (const key of ['stability', 'difficulty', 'elapsed_days', 'scheduled_days']) {
    if (!owns(card, key) || !finiteNumber(card[key]) || card[key] < 0) return false;
  }
  for (const key of ['reps', 'lapses', 'learning_steps']) {
    if (!owns(card, key) || !Number.isInteger(card[key]) || card[key] < 0) return false;
  }
  return owns(card, 'state') && Number.isInteger(card.state) && card.state >= 0 && card.state <= 3;
}

function validReviewRow(row) {
  if (!Array.isArray(row) || !finiteNumber(row[0]) || !nonEmptyString(row[1])) return false;
  if (row[2] === 0) return row.length === 4 && Number.isInteger(row[3]) && row[3] >= 0;
  return (
    row.length === 12 &&
    Number.isInteger(row[2]) &&
    row[2] >= 1 &&
    row[2] <= 4 &&
    Number.isInteger(row[3]) &&
    row[3] >= 0 &&
    row[3] <= 3 &&
    row.slice(4, 8).every((value) => value === null || finiteNumber(value)) &&
    row.slice(8, 10).every(finiteNumber) &&
    Number.isInteger(row[10]) &&
    row[10] >= 0 &&
    finiteNumber(row[11])
  );
}

function validObservationRow(row) {
  if (!Array.isArray(row) || !finiteNumber(row[0]) || !nonEmptyString(row[2])) return false;
  if (row[1] === 'tap') {
    return row.length === 5 && [1, 2, 3].includes(row[3]) && nonEmptyString(row[4]);
  }
  if (row[1] === 'probe') {
    return row.length === 5 && [1, 3].includes(row[3]) && [0, 1].includes(row[4]);
  }
  if (row[1] === 'drift') return row.length === 4 && [1, 3].includes(row[3]);
  if (row[1] === 'params') {
    // R3-D · the scheduler-parameter note: [t, 'params', 'fsrs', reason] —
    // a stored learner parameter set could not drive the scheduler, and why
    return row.length === 4 && row[2] === 'fsrs' && nonEmptyString(row[3]);
  }
  if (row[1] === 'reveal') return row.length === 4 && [0, 1].includes(row[3]);
  if (row[1] === 'lesson') {
    // PR70-P0-1 · a lesson quiz answer, practice evidence only:
    // [t, 'lesson', key, g, lessonId] — g 3 answered right · 1 answered wrong
    return row.length === 5 && [1, 3].includes(row[3]) && nonEmptyString(row[4]);
  }
  if (row[1] === 'dojo') {
    // four wide (older rows and undo's revocation), or five with the drill
    // room's name riding as the trailing mode
    if (row.length !== 4 && row.length !== 5) return false;
    if (row.length === 5 && !nonEmptyString(row[4])) return false;
    return Number.isInteger(row[3]) && row[3] >= 0 && row[3] <= 4;
  }
  return false;
}

function validDeepWord(word) {
  return (
    plainRecord(word) &&
    optional(word, 'r', (value) => typeof value === 'string') &&
    optional(word, 'm', (value) => Array.isArray(value) && value.every((item) => typeof item === 'string')) &&
    optional(word, 'jlpt', (value) => typeof value === 'string' || Number.isInteger(value)) &&
    optional(word, 'alt', (value) => typeof value === 'string') &&
    optional(word, 'k', (value) => Array.isArray(value) && value.every((item) => typeof item === 'string')) &&
    optional(word, 'seq', (value) => typeof value === 'string') &&
    safeJsonValue(word)
  );
}

function validLessonResult(result) {
  return (
    plainRecord(result) &&
    optional(result, 'score', finiteNumber) &&
    optional(result, 'total', finiteNumber) &&
    optional(result, 'ts', finiteNumber) &&
    safeJsonValue(result)
  );
}

function validAiReading(reading) {
  return (
    plainRecord(reading) &&
    typeof reading.text === 'string' &&
    optional(reading, 'lv', (value) => typeof value === 'string') &&
    optional(reading, 'ts', finiteNumber) &&
    safeJsonValue(reading)
  );
}

function validChatTurn(turn) {
  return (
    plainRecord(turn) &&
    ['user', 'tutor'].includes(turn.role) &&
    typeof turn.text === 'string' &&
    safeJsonValue(turn)
  );
}

/** One question the tutor wrote — the exact shape aiQuizParse accepts, so a
 * run the app itself persisted is never quarantined on the next boot. */
function validAiQuizQuestion(q) {
  return (
    plainRecord(q) &&
    typeof q.q === 'string' &&
    Array.isArray(q.opts) &&
    q.opts.length === 4 &&
    q.opts.every((o) => typeof o === 'string') &&
    Number.isInteger(q.right) &&
    q.right >= 0 &&
    q.right < 4 &&
    typeof q.why === 'string' &&
    safeJsonValue(q)
  );
}

/** POL-13 · the persisted quiz run: the tutor's written questions plus the
 * learner's place in them. ix may sit one past the last question — that is
 * the score screen, kept whole until the learner closes it. */
function validAiQuizRun(run) {
  return (
    plainRecord(run) &&
    Array.isArray(run.qs) &&
    run.qs.length >= 3 &&
    run.qs.length <= 5 &&
    run.qs.every(validAiQuizQuestion) &&
    Number.isInteger(run.ix) &&
    run.ix >= 0 &&
    run.ix <= run.qs.length &&
    optional(run, 'picked', (value) => value === null || (Number.isInteger(value) && value >= 0 && value < 4)) &&
    Number.isInteger(run.correct) &&
    run.correct >= 0 &&
    run.correct <= run.qs.length &&
    optional(run, 'ts', finiteNumber) &&
    safeJsonValue(run)
  );
}

function validAiConfig(config) {
  return (
    plainRecord(config) &&
    optional(config, 'baseUrl', nonEmptyString) &&
    optional(config, 'model', nonEmptyString) &&
    safeJsonValue(config)
  );
}

/** Review pacing the learner may choose (R2-A). The bounds are part of the
 * envelope's fail-closed contract, so the validator and the ペース surface
 * read the same numbers and can never drift apart. */
const NEW_PER_DAY_DEFAULT = 20;
const NEW_PER_DAY_MAX = 50;
const REVIEW_LIMIT_DEFAULT = 20;
const REVIEW_LIMIT_MIN = 5;
const REVIEW_LIMIT_MAX = 100;
const validNewPerDay = (value) => Number.isInteger(value) && value >= 0 && value <= NEW_PER_DAY_MAX;
const validReviewLimit = (value) =>
  Number.isInteger(value) && value >= REVIEW_LIMIT_MIN && value <= REVIEW_LIMIT_MAX;

function validSrsPrefs(prefs) {
  return (
    plainRecord(prefs) &&
    safeJsonValue(prefs) &&
    optional(prefs, 'newPerDay', validNewPerDay) &&
    optional(prefs, 'reviewLimit', validReviewLimit)
  );
}

/** R3-D · the learner's own fitted FSRS-6 weights ride inside srsPrefs as
 * srsPrefs.fsrs: { w: [...21 numbers], source, basedOnReviews } — written by
 * the import door from a tools/fsrs-optimize.mjs run. The envelope carries
 * the field VERBATIM (a newer build's fit must survive a visit from an older
 * one with not a byte dropped); USE is gated here, fail-closed: anything but
 * 21 finite numbers inside the vendored scheduler's own clamp ranges is
 * ignored — the pinned defaults rule and one quiet obslog note says why.
 * Bounds mirror ts-fsrs@5.4.1 clipParameters, the same table
 * tools/fsrs-optimize.mjs fits inside (PARAMETER_BOUNDS); the storage
 * verifier holds the two tables together so they can never drift apart. */
const FSRS_WEIGHT_BOUNDS = [
  [0.001, 100],
  [0.001, 100],
  [0.001, 100],
  [0.001, 100],
  [1, 10],
  [0.001, 4],
  [0.001, 4],
  [0.001, 0.75],
  [0, 4.5],
  [0, 0.8],
  [0.001, 3.5],
  [0.001, 5],
  [0.001, 0.25],
  [0.001, 0.9],
  [0, 4],
  [0, 1],
  [1, 6],
  [0, 2],
  [0, 2],
  [0.01, 0.8],
  [0.1, 0.8],
];

/** Why a stored parameter set cannot drive the scheduler — null when it can.
 * The reason string is the quiet obslog note's payload (never a crash). */
function srsParamsProblem(field) {
  if (!plainRecord(field) || !Array.isArray(field.w)) return 'shape';
  if (field.w.length !== FSRS_WEIGHT_BOUNDS.length) return 'length';
  for (let i = 0; i < field.w.length; i += 1) {
    if (!finiteNumber(field.w[i])) return 'not-finite';
    const [lo, hi] = FSRS_WEIGHT_BOUNDS[i];
    if (field.w[i] < lo || field.w[i] > hi) return 'bounds';
  }
  if (owns(field, 'source') && !nonEmptyString(field.source)) return 'source';
  if (
    owns(field, 'basedOnReviews') &&
    !(Number.isInteger(field.basedOnReviews) && field.basedOnReviews > 0)
  )
    return 'basedOnReviews';
  return null;
}

function validStats(stats) {
  if (!plainRecord(stats) || !safeJsonValue(stats)) return false;
  return Object.entries(stats).every(([key, value]) => {
    if (key === 'lastExportTs') return finiteNumber(value);
    // Legacy field: an earlier build read stats.fuzzOff as an app-level fuzz
    // override. ADR-003 removed that path — the pin's fuzz-off is the one
    // policy — but the envelope still admits the boolean so a record written
    // under that build is never quarantined for carrying it.
    if (key === 'fuzzOff') return typeof value === 'boolean';
    return (
      plainRecord(value) &&
      optional(value, 'n', finiteNumber) &&
      optional(value, 'again', finiteNumber) &&
      optional(value, 'nnew', finiteNumber) &&
      safeJsonValue(value)
    );
  });
}

const STORE_ROOT_VALIDATORS = {
  taken: (value) => Array.isArray(value) && value.every(validTakenItem),
  lists: (value) =>
    plainRecord(value) &&
    safeJsonValue(value) &&
    Object.values(value).every((items) => Array.isArray(items) && items.every(validListItem)),
  srs: (value) =>
    plainRecord(value) && safeJsonValue(value) && Object.values(value).every(validStoredCard),
  revlog: (value) => Array.isArray(value) && value.every(validReviewRow),
  obslog: (value) => Array.isArray(value) && value.every(validObservationRow),
  deepWords: (value) =>
    plainRecord(value) && safeJsonValue(value) && Object.values(value).every(validDeepWord),
  lessonsDone: (value) =>
    plainRecord(value) && safeJsonValue(value) && Object.values(value).every(validLessonResult),
  aiReading: (value) => value === null || validAiReading(value),
  aiReadings: (value) => Array.isArray(value) && value.every(validAiReading),
  suspended: (value) =>
    plainRecord(value) && safeJsonValue(value) && Object.values(value).every(finiteNumber),
  aiChat: (value) => Array.isArray(value) && value.every(validChatTurn),
  ai: validAiConfig,
  aiQuiz: (value) => value === null || validAiQuizRun(value),
  stats: validStats,
  srsPrefs: validSrsPrefs,
  readDone: (value) =>
    plainRecord(value) && safeJsonValue(value) && Object.values(value).every(finiteNumber),
  readerPos: (value) =>
    plainRecord(value) &&
    safeJsonValue(value) &&
    Object.values(value).every((item) => finiteNumber(item) && item >= 0),
  dials: (value) =>
    plainRecord(value) &&
    safeJsonValue(value) &&
    ['kanji', 'furigana', 'spacing'].every(
      (key) => !owns(value, key) || (Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 2),
    ),
};

function validStoreEnvelope(value) {
  if (!plainRecord(value) || value.v !== 1 || !safeJsonValue(value)) return false;
  return Object.entries(STORE_ROOT_VALIDATORS).every(
    ([key, validate]) => !owns(value, key) || validate(value[key]),
  );
}

/** Never overwrite what cannot be read. A store that fails to parse, or that
 * declares a future major version, flips this session to read-only: the app
 * keeps working in memory, the original bytes stay untouched on the device,
 * and one quiet alert says so in the active learner surface. */
let storeAlertNode = null;

function positionStoreAlert(node) {
  if (!node || typeof document === 'undefined') return;
  let lowerEdge = 0;
  for (const blocker of document.querySelectorAll(
    '.chrome, .nav-symbol, .zen-exit, .zen-more, .focus-hud',
  )) {
    const rect = blocker.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) lowerEdge = Math.max(lowerEdge, rect.bottom);
  }
  node.style.setProperty('--store-alert-top', `${Math.ceil(lowerEdge + 8)}px`);
}

/** One stable live region sits outside #app so a render never repeats the same
 * announcement and no Drift/dialog inert pass can hide a storage failure. */
function syncStoreAlert() {
  if (typeof document === 'undefined' || !document.body) return null;
  if (!storeAlertNode?.isConnected) {
    storeAlertNode = document.getElementById('store-alert');
    if (!storeAlertNode) {
      storeAlertNode = document.createElement('p');
      storeAlertNode.id = 'store-alert';
      storeAlertNode.className = 'store-warning store-warning-live';
      storeAlertNode.setAttribute('role', 'alert');
      storeAlertNode.setAttribute('aria-atomic', 'true');
      storeAlertNode.hidden = true;
      document.body.append(storeAlertNode);
    }
  }
  const message = S.storeError || '';
  if (message) {
    if (storeAlertNode.hidden) storeAlertNode.hidden = false;
    if (storeAlertNode.textContent !== message) storeAlertNode.textContent = message;
  } else {
    if (!storeAlertNode.hidden) storeAlertNode.hidden = true;
    if (storeAlertNode.textContent) storeAlertNode.textContent = '';
  }
  const sheet = document.getElementById('sheet');
  if (sheet) {
    const describedBy = new Set(
      (sheet.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean),
    );
    if (message) describedBy.add('store-alert');
    else describedBy.delete('store-alert');
    if (describedBy.size) sheet.setAttribute('aria-describedby', [...describedBy].join(' '));
    else sheet.removeAttribute('aria-describedby');
  }
  positionStoreAlert(storeAlertNode);
  return storeAlertNode;
}

/** Storage truth never depends on presentation code. DOM/layout failures are
 * deliberately swallowed at this seam and remain retryable on the next sync. */
function safelySyncStoreAlert() {
  try {
    return syncStoreAlert();
  } catch {
    return null;
  }
}

function protectStore(messageJa, messageEn) {
  S.storeReadOnly = true;
  S.storeError = tx(messageJa, messageEn);
  safelySyncStoreAlert();
}

function loadStore() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    protectStore(
      '端末の学習データにアクセスできない。元のデータを守るため、この回は保存しない。',
      'The saved learner record could not be accessed. Saving is paused so its original bytes stay safe.',
    );
    return;
  }
  if (raw === null) return;
  let s = null;
  try {
    s = JSON.parse(raw);
  } catch {
    protectStore(
      '端末の学習データを読めない。元のデータを守るため、この回は保存しない。',
      'The saved learner record could not be read. Saving is paused so its original bytes stay safe.',
    );
    return;
  }
  if (!plainRecord(s)) {
    protectStore(
      '端末の学習データの形が読めない。元のデータを守るため、この回は保存しない。',
      'The saved learner record has an unreadable shape. Saving is paused so its original bytes stay safe.',
    );
    return;
  }
  if (Number.isInteger(s.v) && s.v > 1) {
    protectStore(
      'このデータは新しい版のもの。古い版で上書きしないため、この回は保存しない。',
      'This record was written by a newer version of the app. Saving is paused so it is not rewritten by an older one.',
    );
    return;
  }
  if (!validStoreEnvelope(s)) {
    protectStore(
      '端末の学習データの中身が読めない。元のデータを守るため、この回は保存しない。',
      'The saved learner record contains invalid data. Saving is paused so its original bytes stay safe.',
    );
    return;
  }
  if (Array.isArray(s.taken)) S.taken = s.taken;
  if (plainRecord(s.lists)) S.lists = s.lists;
  if (plainRecord(s.srs)) S.srs = s.srs;
  if (Array.isArray(s.revlog)) S.revlog = s.revlog;
  if (Array.isArray(s.obslog)) S.obslog = s.obslog;
  if (plainRecord(s.deepWords)) S.deepWords = s.deepWords;
  if (plainRecord(s.lessonsDone)) S.lessonsDone = s.lessonsDone;
  if (plainRecord(s.aiReading)) S.aiReading = s.aiReading;
  if (Array.isArray(s.aiReadings)) S.aiReadings = s.aiReadings;
  if (plainRecord(s.suspended)) S.suspended = s.suspended;
  if (Array.isArray(s.aiChat)) S.aiChat = s.aiChat;
  if (plainRecord(s.ai)) S.ai = s.ai;
  if (plainRecord(s.aiQuiz)) S.aiQuiz = s.aiQuiz;
  if (plainRecord(s.stats)) S.stats = s.stats;
  if (plainRecord(s.srsPrefs)) {
    if (validNewPerDay(s.srsPrefs.newPerDay)) S.srsPrefs.newPerDay = s.srsPrefs.newPerDay;
    if (validReviewLimit(s.srsPrefs.reviewLimit)) S.srsPrefs.reviewLimit = s.srsPrefs.reviewLimit;
    // the learner's fitted weights ride verbatim — validity is judged where
    // the scheduler is built (srsParamsProblem), never by dropping bytes here
    if (owns(s.srsPrefs, 'fsrs')) S.srsPrefs.fsrs = s.srsPrefs.fsrs;
  }
  if (plainRecord(s.readDone)) S.readDone = s.readDone;
  if (plainRecord(s.readerPos)) S.readerPos = s.readerPos;
  if (plainRecord(s.dials)) {
    for (const key of ['kanji', 'furigana', 'spacing']) {
      if ([0, 1, 2].includes(s.dials[key])) S.dials[key] = s.dials[key];
    }
  }
  S.storeExtras = Object.fromEntries(
    Object.entries(s).filter(([key]) => !STORE_KNOWN_KEYS.includes(key)),
  );
}

function storeEnvelope(state) {
  return {
    ...(state.storeExtras || {}),
    v: 1,
    taken: state.taken,
    lists: state.lists,
    srs: state.srs,
    revlog: state.revlog || [],
    obslog: state.obslog || [],
    deepWords: state.deepWords || {},
    lessonsDone: state.lessonsDone,
    aiReading: state.aiReading,
    aiReadings: state.aiReadings.slice(0, 10),
    suspended: state.suspended,
    aiChat: state.aiChat.slice(-24),
    ai: state.ai || {},
    aiQuiz: state.aiQuiz || null,
    stats: state.stats,
    srsPrefs: state.srsPrefs || {},
    readDone: state.readDone,
    readerPos: state.readerPos,
    dials: state.dialsUrlOverride ? state.dialsStored : state.dials,
  };
}

/** localStorage.setItem returning is the synchronous durability boundary.
 * The caller's live learner roots are never published before that boundary. */
function writeStore(state) {
  if (state.storeReadOnly) {
    safelySyncStoreAlert();
    return false;
  }
  let bytes = null;
  try {
    bytes = JSON.stringify(storeEnvelope(state));
    // Validate the exact bytes that would cross the durability boundary. JSON
    // normalization intentionally removes undefined optionals, while any
    // envelope the next boot would quarantine is stopped before setItem.
    if (!validStoreEnvelope(JSON.parse(bytes))) throw new TypeError('invalid learner-store candidate');
  } catch {
    S.storeError = tx(
      '端末に保存できなかった。この端末の空きを確かめて、記録を書き出しておくと安全。',
      'This device could not save the change. Check free space, and export your record to keep it safe.',
    );
    safelySyncStoreAlert();
    return false;
  }
  try {
    localStorage.setItem(STORE_KEY, bytes);
  } catch {
    /* quota or private mode — the session keeps working unpersisted */
    S.storeError = tx(
      '端末に保存できなかった。この端末の空きを確かめて、記録を書き出しておくと安全。',
      'This device could not save the change. Check free space, and export your record to keep it safe.',
    );
    safelySyncStoreAlert();
    return false;
  }
  S.storeError = null;
  safelySyncStoreAlert();
  return true;
}

function saveStore() {
  return writeStore(S);
}

/** Persist copied learner roots as one envelope, then make them visible.
 * Patch values must be constructed off-side; mutating a live nested value
 * before this call would defeat the write-before-publish boundary. */
function commitStorePatch(patch) {
  const candidate = { ...S, ...patch };
  if (!writeStore(candidate)) return false;
  Object.assign(S, patch);
  return true;
}

/* ------------------------------------------------ the observation log
 * Append-only, one compact row per observation — the diagnosis backbone's
 * evidence stream. Rows share the revlog's discipline (never rewritten,
 * quarantine-protected, exported inside the envelope) but record encounters
 * and assistance, never knownness: a tap marks friction on a word, not a
 * grade, and nothing here ever writes FSRS state. Layouts:
 *
 *   [t, 'tap', key, depth, articleId]
 *       the reader's assistance ladder on a content token —
 *       depth 1 ふりがな revealed · 2 gloss shown (incl. the long-press
 *       mini) · 3 full entry opened; t is epoch ms, key "word:<base>"
 *   [t, 'probe', key, g, minted]
 *       a yomi-probe self-grade in the dojo — g 1 read it wrong · 3 read
 *       it right; minted 1 when the miss minted a card, else 0
 *   [t, 'dojo', key, g, mode?]
 *       a focus-drill grade that is practice, not a scheduled review: a
 *       card the learner never TOOK, or (POL-12) a second-lap pass in a
 *       timed block over a card whose one honest schedule grade this block
 *       already recorded. FSRS scale (g 1–4; a g 0 row is undo's
 *       revocation, filed beside the judgment); mode names the drill room
 *       ('kanji', 'due') on rows written since the room was recorded.
 *       Evidence only: no FSRS state, no revlog row, no daily new-card slot.
 *   [t, 'lesson', key, g, lessonId]
 *       a lesson quiz answer (PR70-P0-1) — practice evidence from the
 *       Duolingo-class lane: g 3 answered right · 1 answered wrong;
 *       lessonId names the run ('N5-1'). Completion writes these rows and
 *       the score, nothing else — no deck rows, no FSRS state: entering
 *       覚える is the learner's own explicit choice on the end screen.
 *   [t, 'reveal', key, declared]
 *       the zen review room's declared-recall gate (kernel law ADR-002
 *       T-06): before the answer turns over, the learner declares —
 *       declared 1 思い出した (recalled; all four grades open) · 0 まだ
 *       (not yet; Again is the only grade the schedule may record). The
 *       row is the declaration's evidence; the forcing itself rides the
 *       session state and the grade commit. The timed dojo keeps its bare
 *       reveal and stamps 'dojo' practice rows instead.
 *
 * Taps arrive in bursts mid-reading, so rows persist on a short trailing
 * debounce instead of a full envelope write per tap; pagehide flushes. */
let obsSaveTimer = null;
function obsFlush() {
  if (obsSaveTimer == null) return;
  clearTimeout(obsSaveTimer);
  obsSaveTimer = null;
  // P0-4 disposition (residual ledger): this flush persists rows already
  // published to the session ledger — the debounce IS the documented,
  // bounded (1.2s + pagehide) session-ahead-of-durability window for
  // burst-arriving observations. A rollback here would DROP evidence;
  // instead a failed save surfaces the storage alert and the rows stay in
  // S.obslog for the next flush or envelope write to carry.
  saveStore();
}
function obsLog(kind, key, ...detail) {
  (S.obslog ||= []).push([Date.now(), kind, key, ...detail]);
  clearTimeout(obsSaveTimer);
  obsSaveTimer = setTimeout(obsFlush, 1200);
}
/** R3-D · when a stored learner parameter set cannot drive the scheduler,
 * the pinned defaults rule and ONE quiet append-only row says why:
 * [t, 'params', 'fsrs', reason]. Deduped against the latest params note so
 * a thousand boots over the same broken field never write a thousand rows. */
function noteIgnoredSrsParams(reason) {
  const rows = S.obslog || [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i][1] !== 'params') continue;
    if (rows[i][3] === reason) return;
    break;
  }
  obsLog('params', 'fsrs', reason);
}
// 分流の橋 — the drift's flick judgments were persisting only to the drift's
// own store, which nothing in the corridor ever read (P0, full-instrument
// review). The water now hands each committed judgment to the observation
// ledger as an APPEND-ONLY EXPOSURE row [t, 'drift', key, j]: j 3 = flicked
// known, 1 = flicked unknown, the tap ladder's scale. Constitution holds —
// exposure is not mastery, so this never touches FSRS state, S.taken, or
// review debt; it makes the judgment visible to the one learner state
// (obslog is stored, exported, and read by evidence surfaces). Unlike taps,
// the commit is SYNCHRONOUS — no debounce: the returned ack is true only
// after the envelope crossed the durability boundary, and the water rolls
// its own store back on anything else, so the two records never disagree
// about what the learner said. Drift grades words, kanji glyphs, and
// particle satellites; each keeps its own modality-true target type.
window.bunkiDriftJudgment = (kind, key, dir) => {
  const t = kind === 'glyph' || kind === 'kanji' ? 'kanji' : kind === 'part' ? 'particle' : 'word';
  const obslog = [...(S.obslog || []), [Date.now(), 'drift', srsKey(t, key), dir > 0 ? 3 : 1]];
  return commitStorePatch({ obslog });
};
// 分流の岸 — the corridor names its fused chrome so a tap on the torii,
// seal, nav, bubbles, or any overlay is never read by the water as an
// open-water tap (which razed the learner's constellation — P1, review)
window.bunkiDriftChrome =
  '#ginga-symbol, #ginga-theme-seal, .ginga-seal, .nav-scrim, .nav-bar, .corner-bubble, .world-picker, .world-picker-scrim, #variants, #chrome';
// 深さの橋 — the water reports its dive depth so the fused chrome can offer
// a way OUT of a dive (the in-water return hint is chrome-hidden and the
// nav back arrow knew only the corridor stack — P1, review: "no visible
// way out of a dive"). Depth > 0 reveals the drift's own return hint
// (body.drift-dived) and arms the nav back arrow to surface one level.
window.bunkiDriftDepth = (depth) => {
  S.driftDepth = depth;
  document.body.classList.toggle('drift-dived', depth > 0);
  // diving arms the same-URL Back sentinel (the water renders itself, so the
  // corridor's render hook never sees the depth change); surfacing home
  // consumes it — device Back then means leave, as it should
  syncWalkSentinel();
  if (S.navOpen) render(); // the open nav's back arrow re-arms live
};
addEventListener('pagehide', obsFlush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') obsFlush();
});

/** Local calendar day for the review trace — the learner's day, not UTC's. */
function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Month bucket label for an epoch ms — the automatic Renzo-style list. */
function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

/** Full dictionary record for a written form: kotobako (all senses, most
 * common first) with the original 6,687-word layer as fallback. */
function lookup(id, seq = null, requestedReading = '', requestedGloss = '') {
  const full = D.dict[id];
  // Reader and lesson tokens were editorially resolved into the boot core.
  // Opening the larger index must never make their immediate reading/meaning
  // jump to a different homograph merely because its ent_seq sorts first.
  if (!seq && full) {
    return { head: id, r: full.r, m: full.m, p: full.p, jlpt: full.jlpt, k: full.k || [], alt: full.alt };
  }
  const indexed = seq ? dictionaryRowBySeq(seq) : dictionaryRowsForForm(id)[0];
  if (indexed) {
    const [entrySeq, defaultHead, defaultReading, defaultGloss, written, kana, glosses] = indexed;
    const glossIndex = requestedGloss
      ? indexed[6]?.findIndex((gloss) => normalizeGloss(gloss) === normalizeGloss(requestedGloss))
      : -1;
    const glossSummary = glossIndex >= 0 ? dictionaryGlossSummary(indexed, glossIndex) : null;
    const requestedSummary =
      glossSummary && (!requestedReading || kataToHira(glossSummary[0]) === kataToHira(requestedReading))
        ? glossSummary
        : dictionarySummaryFor(indexed, requestedReading, id);
    const [reading, head, firstGloss] = requestedSummary ||
      dictionarySummaryFor(indexed, requestedReading, id) || [defaultReading, defaultHead, defaultGloss];
    const core = D.dict[id] || D.dict[head];
    const orderedMeanings = firstGloss
      ? [firstGloss, ...(glosses || []).filter((gloss) => gloss !== firstGloss)]
      : glosses || [];
    return {
      seq: entrySeq,
      head,
      r: reading,
      m: orderedMeanings,
      p: core?.p,
      jlpt: core?.jlpt,
      k: [...head].filter((c) => /[一-鿌々]/.test(c)),
      alt: written?.find((form) => form !== head) || null,
      written: written || [],
      kana: kana || [],
    };
  }
  // A word taken from the deep tier keeps a snapshot in the record itself, so
  // reviews and lists resolve it on any device without re-opening the index.
  const kept = !seq && S.deepWords ? S.deepWords[id] : null;
  if (kept) {
    return {
      head: id,
      r: kept.r || '',
      m: kept.m || [],
      p: kept.p,
      jlpt: kept.jlpt,
      k: kept.k || [...id].filter((c) => /[一-鿌々]/.test(c)),
      alt: kept.alt,
    };
  }
  // A stable JMdict sequence names one lexical entry, not merely its printed
  // spelling. Falling back to the spelling-keyed core here would silently
  // answer a homograph with whichever sense happened to win the legacy bundle.
  if (seq != null && seq !== '') return null;
  const old = D.words[id];
  if (old) return { head: id, r: old.r, m: old.g ? [old.g] : [], jlpt: old.jlpt, k: old.k || [] };
  return null;
}

const D = {};
let fsrsApi = null;
let scheduler = null;
/** The exact generator parameters the scheduler was built with — kept so the
 * verification suites can read the policy actually in force (fuzz OFF, the
 * pin's numbers) instead of trusting a comment. */
let srsParams = null;
/** R3-D · non-null when the scheduler was built with the learner's own
 * fitted weights (srsPrefs.fsrs) instead of the pinned defaults —
 * { source, basedOnReviews }. The entry footer and the instrument handle
 * read this so the schedule shown is never passed off as the default's. */
let srsCustom = null;

/* --------------------------------------------- the deep dictionary (70k)
 * The boot core stays the small compatibility dictionary that powers the
 * Drift, the reader and the lessons. Behind it sits the full JMdict tier —
 * 69,996 entries, pinned and licensed — opened lazily: a search focus opens
 * the index (off the main thread, in a worker, on the served build), and a
 * word sheet then opens just the shard holding that entry's complete senses,
 * restrictions, cross-references and antonyms. Harvested from the codex line
 * (PR #70) and woven under this app's own surfaces. */
const DICTIONARY_INDEX_PATH = 'data/share_alike/dict-v2/index.json';
const DICTIONARY_CORE_PATH = 'data/share_alike/dict.json';
const DICTIONARY_SHARD_PATH = (id) => `data/share_alike/dict-v2/${id}.json`;
const DICTIONARY_SEARCH_SETTLE_MS = 320;
let dictionaryIndexPromise = null;
const dictionaryShardPromises = new Map();
let dictionaryWorker = null;
let dictionaryWorkerRequestId = 0;
let dictionarySearchGeneration = 0;
let dictionarySearchInFlight = null;
let dictionarySearchQueued = null;
let dictionarySearchTimer = null;
let navSearchRepaint = null;
const dictionaryWorkerRequests = new Map();

function embeddedDictionaryJson(name) {
  const node = document.getElementById(`corridor-dictionary-${name}`);
  if (!node) return null;
  const parsed = JSON.parse(node.textContent);
  // The standalone keeps source bytes in inert nodes for self-containment.
  // Once a file has become real JS data, retaining the raw text as well would
  // nearly double its phone-memory cost.
  node.remove();
  return parsed;
}

async function loadDictionaryJson(name) {
  const embedded = embeddedDictionaryJson(name);
  if (embedded) return embedded;
  const path = name === 'index' ? DICTIONARY_INDEX_PATH : DICTIONARY_SHARD_PATH(name);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function hasEmbeddedDictionaryIndex() {
  return window.__CORRIDOR_STANDALONE__ === true || !!document.getElementById('corridor-dictionary-index');
}

function dictionaryWorkerRequest(type, payload = {}, generation = 0) {
  if (!dictionaryWorker) return Promise.reject(new Error('dictionary worker is unavailable'));
  const id = ++dictionaryWorkerRequestId;
  return new Promise((resolve, reject) => {
    dictionaryWorkerRequests.set(id, { resolve, reject, type, generation });
    try {
      dictionaryWorker.postMessage({ id, type, generation, ...payload });
    } catch (error) {
      dictionaryWorkerRequests.delete(id);
      reject(error);
    }
  });
}

function stopDictionaryWorker(error) {
  const reason = error instanceof Error ? error : new Error(String(error || 'dictionary worker stopped'));
  for (const request of dictionaryWorkerRequests.values()) request.reject(reason);
  dictionaryWorkerRequests.clear();
  dictionaryWorker?.terminate();
  dictionaryWorker = null;
}

async function startDictionaryWorker() {
  if (dictionaryWorker) return dictionaryWorker;
  dictionaryWorker = new Worker(new URL('dictionary-worker.js', import.meta.url));
  dictionaryWorker.addEventListener('message', (event) => {
    const message = event.data || {};
    const request = dictionaryWorkerRequests.get(message.id);
    if (!request) return;
    dictionaryWorkerRequests.delete(message.id);
    if (message.ok) request.resolve(message);
    else request.reject(new Error(message.error || `dictionary worker ${request.type} failed`));
  });
  dictionaryWorker.addEventListener('error', (event) => {
    stopDictionaryWorker(new Error(event.message || 'dictionary worker failed'));
  });
  return dictionaryWorker;
}

function recordDictionaryPerformance(performanceRecord) {
  D.dictionaryPerformance = {
    ...(D.dictionaryPerformance || {}),
    ...performanceRecord,
    receivedAt: performance.now(),
  };
  window.__KAIRO_DICTIONARY_PERF__ = D.dictionaryPerformance;
  window.dispatchEvent(
    new CustomEvent('kairo:dictionary-performance', { detail: { ...D.dictionaryPerformance } }),
  );
}

function dictionaryCoreMatch(form, row) {
  const core = D.dict?.[form];
  if (!core) return { compatible: false, reading: false, gloss: false };
  const coreGlosses = new Set((core.m || []).map(normalizeGloss));
  const summaries = dictionaryReadingSummaries(row)
    .filter((summary) => dictionaryReadingSupportsForm(row, summary[0], form))
    .map((summary) => [summary[0], form, summary[2]]);
  const reading = summaries.some((summary) => !!core.r && kataToHira(core.r) === kataToHira(summary[0]));
  const gloss = summaries.some((summary) => !!summary[2] && coreGlosses.has(normalizeGloss(summary[2])));
  const compatible = summaries.some(
    (summary) =>
      !!core.r &&
      kataToHira(core.r) === kataToHira(summary[0]) &&
      !!summary[2] &&
      coreGlosses.has(normalizeGloss(summary[2])),
  );
  return { compatible, reading, gloss };
}

/** Decode the compact per-reading summaries without allocating an expanded
 * 70k index. Current data aligns row[9] with row[5]: the reading is inferred
 * from kanaForms and zero means "same as the default head/gloss". During the
 * schema transition we also accept the earlier explicit 3-cell tuples. */
function dictionaryReadingSummaries(row) {
  if (!Array.isArray(row)) return [];
  const defaultSummary = [row[2] || '', row[1] || '', row[3] || ''];
  const encoded = Array.isArray(row[9]) ? row[9] : [];
  const kana = Array.isArray(row[5]) ? row[5] : [];
  if (!encoded.length) return [defaultSummary];
  if (encoded.every((summary) => Array.isArray(summary) && summary.length >= 3)) {
    return encoded.map((summary) => [summary[0] || '', summary[1] || row[1] || '', summary[2] || row[3] || '']);
  }
  if (encoded.length !== kana.length) return [defaultSummary];
  return encoded.map((summary, index) => [
    kana[index] || '',
    Array.isArray(summary) && summary[0] ? summary[0] : row[1] || '',
    Array.isArray(summary) && summary[1] ? summary[1] : row[3] || '',
  ]);
}

/** Decode the restriction-compatible cue for one flattened English gloss.
 * Cell 10 is aligned 1:1 with cells 6/7; its kana index selects the exact
 * JMdict reading permitted by the source sense. */
function dictionaryGlossSummary(row, glossIndex) {
  if (!Array.isArray(row) || !Number.isInteger(glossIndex) || glossIndex < 0) return null;
  const glosses = Array.isArray(row[6]) ? row[6] : [];
  const kana = Array.isArray(row[5]) ? row[5] : [];
  const encoded = Array.isArray(row[10]) ? row[10] : [];
  const mapping = encoded[glossIndex];
  if (
    glossIndex >= glosses.length ||
    !Array.isArray(mapping) ||
    !Number.isInteger(mapping[0]) ||
    mapping[0] < 0 ||
    mapping[0] >= kana.length
  ) {
    return null;
  }
  return [kana[mapping[0]] || row[2] || '', mapping[1] || row[1] || '', glosses[glossIndex] || row[3] || ''];
}

/** Whether a source reading may be printed with this exact spelling. Cell 11
 * is aligned with kana forms: 0 means every written form, 1 means no written
 * form, and an array names the permitted row[4] indexes. */
function dictionaryReadingSupportsForm(row, reading, form) {
  if (!Array.isArray(row) || !form) return false;
  const kana = Array.isArray(row[5]) ? row[5] : [];
  const kanaIndex = kana.findIndex((candidate) => kataToHira(candidate) === kataToHira(reading || ''));
  if (kanaIndex < 0) return false;
  if (kataToHira(kana[kanaIndex]) === kataToHira(form) && kana.includes(form)) return true;
  const written = Array.isArray(row[4]) ? row[4] : [];
  const writtenIndex = written.indexOf(form);
  if (writtenIndex < 0) return false;
  const scope = Array.isArray(row[11]) ? row[11][kanaIndex] : null;
  if (scope === 0) return true;
  if (scope === 1) return false;
  return Array.isArray(scope) && scope.includes(writtenIndex);
}

function dictionarySummaryFor(row, requestedReading = '', requestedHead = '') {
  const summaries = dictionaryReadingSummaries(row);
  if (!summaries.length) return null;
  const reading = kataToHira(requestedReading || '');
  if (reading) {
    const exact = summaries.find(
      (summary) =>
        kataToHira(summary[0]) === reading &&
        (!requestedHead || dictionaryReadingSupportsForm(row, summary[0], requestedHead)),
    );
    if (exact) return requestedHead ? [exact[0], requestedHead, exact[2]] : exact;
    return summaries.find((summary) => kataToHira(summary[0]) === reading) || summaries[0];
  }
  const forHead = requestedHead
    ? summaries.find((summary) => dictionaryReadingSupportsForm(row, summary[0], requestedHead))
    : null;
  return forHead ? [forHead[0], requestedHead, forHead[2]] : summaries[0];
}

function validDictionaryRow(row, previousSeq = -1) {
  return (
    Array.isArray(row) &&
    row.length >= 12 &&
    /^\d+$/.test(String(row[0])) &&
    Array.isArray(row[4]) &&
    Array.isArray(row[5]) &&
    Array.isArray(row[6]) &&
    Array.isArray(row[7]) &&
    Array.isArray(row[9]) &&
    Array.isArray(row[10]) &&
    Array.isArray(row[11]) &&
    row[10].length === row[6].length &&
    row[11].length === row[5].length &&
    Number(row[0]) > previousSeq
  );
}

function installDictionaryIndex(index, { mode = 'main', performanceRecord = null } = {}) {
  const mainEntries = Array.isArray(index?.entries) ? index.entries : null;
  if (
    index?.schemaVersion !== 2 ||
    index?.shardCount !== 16 ||
    index?.sharding?.id !== 'fnv1a32-ascii-seq-mask15' ||
    index.sharding.shardCount !== index.shardCount ||
    (mode === 'main' && !mainEntries) ||
    (mode === 'worker' && mainEntries)
  ) {
    throw new Error('dictionary index has an unsupported shape');
  }
  if (mainEntries) {
    let previousSeq = -1;
    for (const row of mainEntries) {
      if (!validDictionaryRow(row, previousSeq)) throw new Error('dictionary index row is malformed');
      previousSeq = Number(row[0]);
    }
  }
  D.dictionaryIndex = index;
  D.dictionaryMode = mode;
  // In the served build these maps contain only rows returned for a complete
  // search/form/seq request. The 70k entry array never crosses the worker
  // boundary; the standalone fallback uses the embedded entries directly.
  D.dictionaryBySeq = new Map();
  D.dictionaryByForm = new Map();
  D.dictionaryCompleteForms = new Set();
  D.dictionarySearchCache = new Map();
  D.dictionarySearchPending = new Map();
  D.dictionarySearchErrors = new Map();
  D.dictionaryState = 'ready';
  D.dictionaryError = null;
  if (performanceRecord) recordDictionaryPerformance(performanceRecord);
  else {
    recordDictionaryPerformance({
      mode: 'embedded-main',
      entries: mainEntries?.length || 0,
      mainThreadIndexEntries: mainEntries?.length || 0,
    });
  }
  if (D.sources?.share_alike && !D.sources.share_alike.some((source) => source.name === index.source?.name)) {
    D.sources.share_alike.push({
      name: index.source.name,
      licence: index.source.licence,
      attribution: index.source.attribution,
      url: index.source.licenceUrl,
    });
  }
  // One genuine core→full transition refreshes the live result body once.
  queueMicrotask(refreshDictionaryBodies);
}

function cacheDictionaryRow(row) {
  if (!validDictionaryRow(row)) throw new Error('dictionary worker returned a malformed row');
  D.dictionaryBySeq ||= new Map();
  D.dictionaryBySeq.set(String(row[0]), row);
  return row;
}

function cacheDictionaryFormRows(form, rows) {
  const key = String(form || '');
  if (!key || !Array.isArray(rows)) throw new Error('dictionary worker returned malformed form rows');
  const seen = new Set();
  for (const row of rows) {
    if (
      !validDictionaryRow(row) ||
      seen.has(String(row[0])) ||
      !(row[1] === key || row[4].includes(key) || row[5].includes(key))
    ) {
      throw new Error(`dictionary worker returned malformed rows for ${key}`);
    }
    seen.add(String(row[0]));
    cacheDictionaryRow(row);
  }
  D.dictionaryByForm ||= new Map();
  D.dictionaryCompleteForms ||= new Set();
  D.dictionaryByForm.set(key, rows);
  D.dictionaryCompleteForms.add(key);
  return rows;
}

function dictionaryRowBySeq(seq) {
  if (!D.dictionaryIndex) return null;
  const key = String(seq);
  if (D.dictionaryBySeq?.has(key)) return D.dictionaryBySeq.get(key);
  if (!Array.isArray(D.dictionaryIndex.entries)) return null;
  const target = Number(key);
  if (!Number.isFinite(target)) return null;
  const entries = D.dictionaryIndex.entries;
  let low = 0;
  let high = entries.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const value = Number(entries[middle][0]);
    if (value === target) {
      D.dictionaryBySeq.set(key, entries[middle]);
      return entries[middle];
    }
    if (value < target) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}

function dictionaryRowsForForm(form) {
  if (!D.dictionaryIndex || !form) return [];
  const key = String(form);
  if (D.dictionaryCompleteForms?.has(key) && D.dictionaryByForm?.has(key)) {
    return D.dictionaryByForm.get(key);
  }
  if (!Array.isArray(D.dictionaryIndex.entries)) return [];
  const rows = [];
  for (const row of D.dictionaryIndex.entries) {
    if (row[1] === key || row[4].includes(key) || row[5].includes(key)) rows.push(row);
  }
  const core = D.dict?.[key];
  const score = (row) => {
    const [, head, , , written, kana, , , common] = row;
    const match = dictionaryCoreMatch(key, row);
    return (
      Number(match.compatible) * 32 +
      Number(match.gloss) * 16 +
      Number(match.reading) * 8 +
      Number(head === key) * 2 +
      Number(common) +
      Number(!!core?.alt && [...written, ...kana].includes(core.alt))
    );
  };
  rows.sort((left, right) => score(right) - score(left) || Number(left[0]) - Number(right[0]));
  D.dictionaryByForm.set(key, rows);
  D.dictionaryCompleteForms?.add(key);
  return rows;
}

function ensureDictionaryIndex() {
  if (D.dictionaryIndex) return Promise.resolve(D.dictionaryIndex);
  if (dictionaryIndexPromise) return dictionaryIndexPromise;
  D.dictionaryState = 'loading';
  const opening = hasEmbeddedDictionaryIndex()
    ? loadDictionaryJson('index').then((index) => {
        installDictionaryIndex(index, { mode: 'main' });
        return index;
      })
    : startDictionaryWorker()
        .then(() =>
          dictionaryWorkerRequest('init', {
            indexUrl: new URL(DICTIONARY_INDEX_PATH, document.baseURI).href,
            coreUrl: new URL(DICTIONARY_CORE_PATH, document.baseURI).href,
          }),
        )
        .then((message) => {
          installDictionaryIndex(message.result.metadata, {
            mode: 'worker',
            performanceRecord: message.result.performance,
          });
          return D.dictionaryIndex;
        });
  dictionaryIndexPromise = opening.catch((err) => {
    D.dictionaryState = 'error';
    D.dictionaryError = err;
    dictionaryIndexPromise = null;
    if (D.dictionaryMode !== 'main') stopDictionaryWorker(err);
    queueMicrotask(refreshDictionaryBodies);
    throw err;
  });
  return dictionaryIndexPromise;
}

async function ensureDictionaryRowBySeq(seq) {
  await ensureDictionaryIndex();
  const cached = dictionaryRowBySeq(seq);
  if (cached || D.dictionaryMode === 'main') return cached;
  const message = await dictionaryWorkerRequest('rowBySeq', { seq: String(seq) });
  return message.result.row ? cacheDictionaryRow(message.result.row) : null;
}

async function ensureDictionaryRowsForForm(form) {
  await ensureDictionaryIndex();
  const key = String(form || '');
  if (!key) return [];
  if (D.dictionaryCompleteForms?.has(key) || D.dictionaryMode === 'main') {
    return dictionaryRowsForForm(key);
  }
  const message = await dictionaryWorkerRequest('rowsForForm', { form: key });
  if (message.result.form !== key) throw new Error('dictionary worker returned the wrong form');
  return cacheDictionaryFormRows(key, message.result.rows);
}

async function ensureDictionaryRowsForNode(node) {
  if (!node) return [];
  if (node.seq) {
    const row = await ensureDictionaryRowBySeq(node.seq);
    return row ? [row] : [];
  }
  const rows = await ensureDictionaryRowsForForm(node.id);
  if (node.reading && rows.length) {
    const reading = kataToHira(node.reading);
    const chosen = rows.find((row) =>
      dictionaryReadingSummaries(row).some(
        (summary) =>
          kataToHira(summary[0]) === reading && dictionaryReadingSupportsForm(row, summary[0], node.id),
      ),
    );
    if (chosen) node.dictionaryResolvedSeq = String(chosen[0]);
  }
  return rows;
}

function dictionaryRowsFor(node) {
  if (!D.dictionaryIndex || !node) return [];
  if (node.seq) {
    const row = dictionaryRowBySeq(node.seq);
    return row ? [row] : [];
  }
  return dictionaryRowsForForm(node.id);
}

function dictionaryDetailRowsFor(node) {
  const rows = dictionaryRowsFor(node);
  if (node?.seq || !rows.length) return rows;
  const core = D.dict?.[node.id];
  const compatibleRows = core ? rows.filter((row) => dictionaryCoreMatch(node.id, row).compatible) : rows;
  if (core && !compatibleRows.length) return [];
  if (compatibleRows.length <= 1) return compatibleRows;
  const chosen =
    compatibleRows.find((row) => String(row[0]) === String(node.dictionaryResolvedSeq || '')) ||
    compatibleRows[0];
  if (chosen) node.dictionaryResolvedSeq = String(chosen[0]);
  return chosen ? [chosen] : [];
}

function dictionaryShardNumber(seq) {
  let hash = 0x811c9dc5;
  for (const character of String(seq)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash & (D.dictionaryIndex.shardCount - 1);
}

function dictionaryShardId(seq) {
  return dictionaryShardNumber(seq).toString(16).padStart(2, '0');
}

function ensureDictionaryShard(id) {
  if (D.dictionaryShards?.has(id)) return Promise.resolve(D.dictionaryShards.get(id));
  if (dictionaryShardPromises.has(id)) return dictionaryShardPromises.get(id);
  const promise = loadDictionaryJson(id)
    .then((shard) => {
      const shardNumber = Number.parseInt(id, 16);
      if (
        shard?.schemaVersion !== 2 ||
        shard?.shard !== shardNumber ||
        shard?.shardCount !== D.dictionaryIndex?.shardCount ||
        shard?.sharding?.id !== D.dictionaryIndex?.sharding?.id ||
        shard?.sourcePin !== D.dictionaryIndex?.source?.pin ||
        !Array.isArray(shard.entries) ||
        shard.entries.some((entry) => dictionaryShardNumber(entry?.[0]) !== shardNumber)
      ) {
        throw new Error(`dictionary shard ${id} has an unsupported shape`);
      }
      D.dictionaryShards ||= new Map();
      D.dictionaryDetails ||= new Map();
      D.dictionaryShards.set(id, shard);
      for (const entry of shard.entries) D.dictionaryDetails.set(String(entry[0]), entry);
      return shard;
    })
    .catch((err) => {
      dictionaryShardPromises.delete(id);
      throw err;
    });
  dictionaryShardPromises.set(id, promise);
  return promise;
}

async function ensureDictionaryDetails(node) {
  await ensureDictionaryIndex();
  await ensureDictionaryRowsForNode(node);
  const rows = dictionaryDetailRowsFor(node);
  const shards = [...new Set(rows.map((row) => dictionaryShardId(row[0])))];
  await Promise.all(shards.map(ensureDictionaryShard));
  return rows.map((row) => D.dictionaryDetails?.get(String(row[0]))).filter(Boolean);
}

function dictionaryDetailsFor(node) {
  return dictionaryDetailRowsFor(node)
    .map((row) => D.dictionaryDetails?.get(String(row[0])))
    .filter(Boolean);
}

function dictionaryTag(tag) {
  return D.dictionaryIndex?.tags?.[tag] || tag;
}

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
  // A reload cannot reconstruct the entry sheet until data has booted, so the
  // stroke room's marker goes: it names a room this boot cannot restore.
  //
  // The WALK sentinel is different, and stripping it was the bug. The entry
  // itself survives a reload; deleting only its marker left a live history
  // stop that nothing could recognise, so the first device Back after any
  // reload did nothing at all and the second one left the app — in a corridor
  // whose whole contract is that it never eats a press
  // (E3 round-B, dead-ends lens). The marker is ADOPTED instead: the first
  // render's syncWalkSentinel either keeps it armed, because there is
  // somewhere to walk, or spends it the same quiet way walking home does.
  try {
    if (history.state?.bunkiStrokeRoom) {
      const normalized = { ...history.state };
      delete normalized.bunkiStrokeRoom;
      history.replaceState(normalized, '', location.href);
    }
    if (history.state?.bunkiWalk) walkArmed = true;
    // The corridor owns every scroll restore (reader bookmarks, shelf and
    // archive offsets, sheet stacks). The platform's own traversal guess
    // would land the walk-back sentinel pops on a stale offset and fight
    // returnScroll — so the guess is switched off for this document.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  } catch {
    /* history may be unavailable in a constrained embedded preview */
  }
  S.strokeMinimal = params.get('minimal') !== '0';
  S.strokeChromeAwake = !S.strokeMinimal;
  let anyVariantParam = params.get('variants') === '1';
  for (const key of Object.keys(VARIANTS)) {
    const v = params.get(key);
    if (v && VARIANTS[key].options.some(([id]) => id === v)) {
      S.variants[key] = v;
      // 'entry' doubles as the documented navigation param (?entry=shelf).
      // Choosing a front door must never summon the operator debug strip —
      // the fixed strip swallows taps (filed by three review lanes). The
      // strip remains reachable explicitly via ?variants=1.
      if (key !== 'entry') anyVariantParam = true;
    }
  }
  S.variantsBar = anyVariantParam;
  if (['bi', 'ja'].includes(params.get('ui'))) S.lang = params.get('ui');
  loadStore();
  setKairoTheme(themeId());
  if (params.get('dials')) {
    const [k, f, s] = params.get('dials').split(',').map(Number);
    if ([k, f, s].every((n) => n >= 0 && n <= 2)) {
      // a URL override steers THIS session only — the learner's stored
      // choice stays untouched until they move a dial themselves
      S.dialsStored = { ...S.dials };
      S.dialsUrlOverride = true;
      S.dials = { kanji: k, furigana: f, spacing: s };
    }
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
  const [articleIndex, kanken, sem, kanji, words, idioms, dict, strokes, radicals214, grammarV11, manifest, pin] =
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
  D.dictionaryState = 'core';
  D.dictionaryMode = 'core';
  D.dictionaryShards = new Map();
  D.dictionaryDetails = new Map();
  D.dictionaryBySeq = new Map();
  D.dictionaryByForm = new Map();
  D.dictionaryCompleteForms = new Set();
  D.dictionarySearchCache = new Map();
  D.dictionarySearchPending = new Map();
  D.dictionarySearchErrors = new Map();
  D.strokes = strokes.strokes;
  D.kmeta = strokes.meta;
  // the official radical (部首) table, keyed by Kangxi number 1–214; each kanji
  // record carries its `rad` number and looks its identity up here. A reverse
  // map (canonical glyph and positional variant → the row) lets a component
  // page recognise when it is itself an official radical.
  D.radInfo = radicals214;
  D.radByGlyph = {};
  for (const r of Object.values(radicals214)) {
    D.radByGlyph[r.c] = r;
    if (r.var) D.radByGlyph[r.var] = r;
  }
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
      // AnimCJK ships in share_alike/ and its shards are FETCHED, not
      // imported, so its licence never reached the panel that claims to
      // state everything — the writing room painted Arphic-licensed glyph
      // data while the sources fold omitted it entirely
      // (E3 round-B, data-licence lens). Declared here because a lazily
      // fetched pool has no import to carry it; verify-corridor asserts this
      // block still matches data/share_alike/animcjk/index.json.
      {
        name: 'AnimCJK stroke graphics',
        licence: 'Arphic Public License',
        attribution:
          'AnimCJK (parsimonhi) — glyphs derived from Arphic PL KaitiM fonts and Makemeahanzi, redistributed under the Arphic Public License',
        url: 'https://github.com/parsimonhi/animCJK',
      },
    ],
    original: [...articleIndex.sources.original, ...grammarV11.sources],
  };

  // kanji → words containing it, from the FULL bundled dictionary (dict.json,
  // ~23k entries) unioned with the graded word list — NOT the 7,910-entry
  // subset that once fed this and showed only a paltry few compounds per kanji
  // (快 had 7 where a real kanji dictionary has dozens). Ordering is by
  // commonness: graded (JLPT-tagged) words first, most-common level first, then
  // shorter words, so the everyday compounds sit at the top like a paper
  // dictionary. The ceiling now scales automatically with a larger dictionary.
  D.kanjiWords = {};
  {
    const isKanji = (c) => c >= '一' && c <= '鿿';
    const buckets = {};
    const add = (c, w) => (buckets[c] ||= new Set()).add(w);
    for (const rec of Object.values(D.words)) {
      const chars = rec.k && rec.k.length ? rec.k : [...rec.w].filter(isKanji);
      for (const c of chars) add(c, rec.w);
    }
    for (const [w, rec] of Object.entries(D.dict)) {
      const chars = rec.k && rec.k.length ? rec.k : [...w].filter(isKanji);
      for (const c of chars) add(c, w);
    }
    const rank = (w) => {
      const g = D.words[w];
      const graded = g && g.jlpt ? 0 : 1;
      const jl = g && g.jlpt ? 5 - g.jlpt : 9;
      return graded * 100 + jl * 10 + Math.min([...w].length, 9);
    };
    for (const c of Object.keys(buckets)) {
      D.kanjiWords[c] = [...buckets[c]].sort(
        (a, b) => rank(a) - rank(b) || [...a].length - [...b].length || (a < b ? -1 : 1),
      );
    }
  }
  D.wordCap = manifest.caps.kanjiWordCap;

  try {
    fsrsApi = window.__TSFSRS__ || (await import('./vendor/ts-fsrs.mjs'));
    // R3-D · the learner's own fitted weights (srsPrefs.fsrs, written by the
    // import door from a tools/fsrs-optimize.mjs run) drive the scheduler
    // when — and only when — they pass the fail-closed gate srsParamsProblem.
    // Anything else is IGNORED: the pinned defaults rule, nothing crashes,
    // and one quiet obslog row says why. Everything but the weight vector
    // stays the pin's (fuzz OFF, retention, steps): one scheduler policy.
    const fitted = S.srsPrefs?.fsrs;
    const fittedProblem = fitted === undefined ? 'absent' : srsParamsProblem(fitted);
    if (fitted !== undefined && fittedProblem) noteIgnoredSrsParams(fittedProblem);
    srsCustom = fittedProblem
      ? null
      : { source: fitted.source ?? null, basedOnReviews: fitted.basedOnReviews ?? null };
    srsParams = fsrsApi.generatorParameters({
      w: srsCustom ? fitted.w.slice() : pin.w,
      request_retention: pin.requestRetention,
      maximum_interval: pin.maximumInterval,
      // One scheduler policy in both engines (ADR-003): fuzz is OFF, exactly
      // as the domain pin says. Any randomness inside the scheduler would
      // let two replays of one log disagree, which is what every evidence
      // claim rests on. If interval spreading is ever wanted, it belongs in
      // session planning, where it changes presentation, not memory state.
      enable_fuzz: pin.enableFuzz,
      enable_short_term: pin.enableShortTerm,
      learning_steps: pin.learningSteps,
      relearning_steps: pin.relearningSteps,
    });
    scheduler = fsrsApi.fsrs(srsParams);
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
  )
    .then((body) => {
      Object.assign(p, body);
      return p;
    })
    .finally(() => {
      delete p._loading;
    });
  return p._loading;
}

/* --------------------------------------------------- 新聞アーカイブ
 * The frozen ja.wikinews archive, minted through the same pipeline as the
 * shelf (tokens + level signals per body) but carried apart from it: a
 * light index fetched only when the stack is opened, bodies fetched one
 * at a time on read. Rows merge into D.passages so the reader, search and
 * examples treat an archive article exactly like a shelf one. The
 * standalone single-file build does not carry the stack. */
function ensureArchiveIndex() {
  if (D.archive) return Promise.resolve(D.archive);
  if (D.archiveLoading) return D.archiveLoading;
  D.archiveLoading = fetch('data/articles/archive-index.json')
    .then((res) => {
      if (!res.ok) throw new Error(`archive-index → ${res.status}`);
      return res.json();
    })
    .then((index) => {
      const known = new Set(D.passages.map((p) => p.id));
      D.archive = index.articles.filter((a) => !known.has(a.id));
      D.passages.push(...D.archive);
      delete D.archiveLoading;
      return D.archive;
    })
    .catch((err) => {
      delete D.archiveLoading;
      throw err;
    });
  return D.archiveLoading;
}

function renderArchive(main) {
  main.append(withEn(el('p', 'eyebrow', '回廊 · 図書館'), 'KAIRO · the library', 'en-inline'));
  main.append(withEn(el('h1', 'view-title', '新聞アーカイブ'), 'the newspaper archive', 'en-inline'));
  if (!D.archive) {
    main.append(el('p', 'gloss', tx('棚をひらいています…', 'Opening the stack…')));
    if (D.archiveError) {
      main.append(
        el('div', 'sem-empty', tx('アーカイブを読み込めなかった。', 'The archive could not be opened here.')),
      );
    } else {
      ensureArchiveIndex()
        .then(() => {
          if (S.view === 'archive') render();
        })
        .catch(() => {
          D.archiveError = true;
          if (S.view === 'archive') render();
        });
    }
    return;
  }
  const sub = el('p', 'shelf-snippet intro');
  const years = new Map();
  for (const a of D.archive) {
    const y = (a.date || '').slice(0, 4) || '？';
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(a);
  }
  sub.textContent = tx(
    `ウィキニュース ${D.archive.length} 本 · ${[...years.keys()].sort()[0]}–${[...years.keys()].sort().at(-1)} · CC BY 2.5 · 凍結アーカイブ`,
    `${D.archive.length} real news articles · ${[...years.keys()].sort()[0]}–${[...years.keys()].sort().at(-1)} · CC BY 2.5 · the frozen ja.wikinews archive`,
  );
  main.append(sub);
  S.archiveYears ||= new Set();
  for (const y of [...years.keys()].sort().reverse()) {
    const list = years.get(y);
    const open = S.archiveYears.has(y);
    const toggle = el('button', 'details-toggle archive-year');
    // every fold says whether it is open — four of the five did not, so a
    // screen reader could not tell (E3 round-A, a11y lens)
    toggle.setAttribute('aria-expanded', String(S.archiveYears.has(y)));
    toggle.type = 'button';
    toggle.dataset.year = y;
    toggle.textContent = `${open ? '▾' : '▸'} ${y} 年 · ${list.length} ${tx('本', '')}`.trim();
    toggle.addEventListener('click', () => {
      if (S.archiveYears.has(y)) S.archiveYears.delete(y);
      else S.archiveYears.add(y);
      keepScroll();
      render();
      returnScroll();
    });
    main.append(toggle);
    if (!open) continue;
    for (const a of list) {
      const row = el('button', 'archive-row');
      row.type = 'button';
      row.dataset.passage = a.id;
      const head = el('div', 'archive-row-head');
      head.append(el('span', 'archive-row-title', a.title));
      // archive rows read titleEn from the same schema as the shelf; the
      // frozen index carries none yet, so this stays silent until it does
      if (bi() && a.titleEn) head.append(el('span', 'archive-row-title-en', a.titleEn));
      const lv = levelPhrase(a.grading);
      const meta = el('div', 'archive-row-meta');
      meta.append(el('span', 'level-chip', bi() ? lv.level : lv.ja));
      meta.append(el('span', null, `${a.date || ''} · ${a.chars}字${S.readDone[a.id] ? ' · 読了 ✓' : ''}`));
      row.append(head, meta);
      row.addEventListener('click', () => openPassage(a.id));
      main.append(row);
    }
  }
}

function prefetchArticles() {
  // archive bodies are read-on-open only — never bulk-prefetched
  const queue = D.passages.filter((p) => !p.tokens && !String(p.file || '').startsWith('archive/'));
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
  // a 銀河 search row has no id and dies with the bar; its index survives so
  // the restored results can hand focus back to the row that was left
  if (node.matches?.('.nav-search-row')) return { kind: 'nav-row', ix: node.dataset.ix || '0' };
  if (node.id) return { kind: 'id', id: node.id };
  // …and every OTHER door into a sheet. Three recognised shapes covered the
  // reader and the search bar; every list row in the app — 字引's results,
  // the lists tray, the levels lanes, the thesaurus, the archive — carries
  // none of them, so closing a sheet opened from a list dropped the keyboard
  // to <body>: 27 to 45 Tab presses back to the row you were on
  // (E3 round-D, a11y lens). The same shape-and-text key the render restore
  // uses answers here too.
  const shape = focusShapeKey(node);
  return shape ? { kind: 'shape', ...shape } : null;
}

/** A control's shape and its own text — the last-resort identity used by both
 * the render focus restore and the sheet invoker. State classes are stripped:
 * the press that moved focus is usually the press that flips them. */
function focusShapeKey(node) {
  const cls = [...(node.classList || [])].filter((c) => !FOCUS_STATE_CLASSES.has(c));
  if (!cls.length) return null;
  const sel = cls.map((c) => `.${CSS.escape(c)}`).join('');
  const all = [...document.querySelectorAll(sel)];
  const ix = all.indexOf(node);
  if (ix < 0) return null;
  return { sel, ix, text: (node.textContent || '').trim().slice(0, 16) };
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
    } else if (key.kind === 'nav-row') {
      // the deep tier may still be settling; the input is the honest fallback
      target =
        document.querySelector(`.nav-search-row[data-ix="${key.ix}"]`) ||
        document.getElementById('nav-search-input');
    } else if (key.kind === 'id') {
      target = document.getElementById(key.id);
    } else if (key.kind === 'shape') {
      target = focusNodeFor(document, key);
    }
    target?.focus({ preventScroll: true });
  });
}

/** Record the page beneath before a layer or a new view covers it. A sheet is
 * fixed, so the page under it has not moved — re-recording is a no-op. */
function keepScroll() {
  if (S.view === 'reader') S.readerScroll = window.scrollY;
  else if (S.view === 'shelf') S.shelfScroll = window.scrollY;
  else if (S.view === 'archive') S.archiveScroll = window.scrollY;
}

/** Hand the current view back the offset it walked away from. */
function returnScroll() {
  if (S.view === 'reader') window.scrollTo(0, S.readerScroll);
  else if (S.view === 'shelf') window.scrollTo(0, S.shelfScroll);
  else if (S.view === 'archive') window.scrollTo(0, S.archiveScroll);
}

/* The reader remembers your place per article, surviving reloads — the
 * debounce keeps localStorage writes rare while a thumb is scrolling. */
let readerPosTimer = null;
addEventListener(
  'scroll',
  () => {
    if (S.view !== 'reader' || !S.passageId || S.stack.length) return;
    clearTimeout(readerPosTimer);
    readerPosTimer = setTimeout(() => {
      // re-checked at fire time: a sheet may have opened (and zeroed the
      // window scroll) in the 900ms since the scroll that armed this
      if (S.view !== 'reader' || !S.passageId || S.stack.length) return;
      // P0-4 disposition (residual ledger): readerPos is a reading-position
      // bookmark — a UI preference, not learner evidence; a lost write costs
      // one scroll offset, so the direct debounced save stays.
      S.readerPos[S.passageId] = Math.round(window.scrollY);
      saveStore();
    }, 900);
  },
  { passive: true },
);

function go(node, { invoker = null } = {}) {
  keepScroll();
  if (!S.stack.length && !S.dialogInvoker) {
    S.dialogInvoker = invokerKey(invoker || document.activeElement);
  }
  S.stack.push(node);
  render();
  const sheet = $('.sheet');
  if (sheet) sheet.scrollTop = 0;
}

function back() {
  // The chrome's own overlays are the topmost layers of all: an open nav,
  // the world stones, the capture panel. Device Back could not see them, so
  // a learner who opened one and pressed Back left the app entirely with it
  // still on the glass (E3 round-A, dead-ends lens). They dismiss in the
  // order they stack, before any room moves.
  // …and above all of them, the quick-look mini: a role="dialog" whose only
  // dismissal was a pointerdown somewhere else. Back walked the ROOM out from
  // under it and Escape did nothing, in a layer that names itself a dialog
  // (E3 round-D, dead-ends lens).
  if (document.getElementById('mini')) {
    removeMini();
    syncWalkSentinel();
    return;
  }
  if (worldPickerEls) {
    closeWorldPicker();
    return;
  }
  if (S.captureOpen) {
    S.captureOpen = false;
    render();
    return;
  }
  if (S.navOpen) {
    S.navOpen = false;
    S.navReturn = false;
    render();
    return;
  }
  // 筆順 is the topmost layer when it is open — it leaves before the sheet does
  if (S.strokes) {
    closeStrokePage();
    return;
  }
  if (S.stack.length) {
    S.stack.pop();
    if (!S.stack.length) {
      // a sheet opened from a 銀河 search result closes back INTO the search:
      // the bar reopens with its query, results, and the row that was left
      if (S.view === 'drift' && S.navReturn) S.navOpen = true;
      S.navReturn = false;
    }
    render();
    if (!S.stack.length) {
      returnScroll();
      restoreDialogInvoker();
    }
    return;
  }
  // inside a drift dive, back means SURFACE one level of the water first —
  // the same walk whether it arrives from the nav arrow or the device Back
  if (S.view === 'drift' && S.driftDepth > 0 && window.bunkiDriftSurface) {
    window.bunkiDriftSurface();
    render();
    return;
  }
  if (S.view === 'review') {
    // a focus block returns to the dojo it was started from; an ordinary
    // session returns to the list
    const toDojo = !!S.focus;
    if (S.focus) endFocus();
    S.review = null;
    S.view = toDojo ? 'dojo' : 'tray';
    render();
    return;
  }
  if (S.view === 'probe') {
    endFocus();
    S.probe = null;
    S.view = 'dojo';
    render();
    return;
  }
  if (S.view === 'dojo') {
    S.view = 'drift';
    render();
    return;
  }
  if (S.view === 'aiquiz') {
    // POL-13: stepping out mid-quiz discards nothing — the run stays durable
    // and the tray holds the way back in (and the quiet やめる to let it go)
    S.view = 'tray';
    render();
    return;
  }
  if (S.view === 'lessons' && S.lessonRun) {
    endLessonRun();
    return;
  }
  if (S.view === 'archive') {
    S.view = 'shelf';
    render();
    // the shelf gets its place back — its archive door stands ~20,000px deep,
    // and losing that offset dumped the learner at the top of 70 cards
    window.scrollTo(0, S.shelfScroll);
    return;
  }
  if (S.view === 'reader' || S.view === 'tray' || S.view === 'grammar' || S.view === 'levels' || S.view === 'ai' || S.view === 'lessons' || S.view === 'thesaurus' || S.view === 'airead' || S.view === 'kanjidex' || S.view === 'yoji') {
    // the bookmark records the exact line being left, not the debounce's
    // guess (readerPos is a UI preference — P0-4 residual-ledger disposition)
    if (S.view === 'reader' && S.passageId) {
      clearTimeout(readerPosTimer);
      S.readerPos[S.passageId] = Math.round(window.scrollY);
      saveStore();
    }
    // the lists tray opened from inside an article returns TO the article
    if (S.view === 'tray' && S.trayFrom === 'reader' && S.passageId) {
      S.trayFrom = null;
      S.view = 'reader';
      render();
      window.scrollTo(0, S.readerPos?.[S.passageId] || 0);
      return;
    }
    // …and every other room it can be opened from, at the offset it was
    // opened at
    if (S.view === 'tray' && plainRecord(S.trayFrom) && S.trayFrom.view) {
      const home = S.trayFrom;
      S.trayFrom = null;
      S.view = home.view;
      render();
      window.scrollTo(0, home.scroll || 0);
      return;
    }
    // an archive article returns to its stack, not the curated shelf — and to
    // the year-list offset it was opened from, not wherever the reading ended
    if (S.view === 'reader' && String(passage()?.file || '').startsWith('archive/')) {
      S.view = 'archive';
      render();
      window.scrollTo(0, S.archiveScroll);
      return;
    }
    S.view = 'shelf';
    render();
    // the shelf gets its place back the way the reader always has
    window.scrollTo(0, S.shelfScroll);
    return;
  }
  if (S.view === 'shelf' && S.variants.entry === 'field') {
    keepScroll();
    S.view = 'entry';
    render();
  }
  if (S.view === 'shelf' && S.variants.entry === 'drift') {
    keepScroll();
    S.view = 'drift';
    render();
  }
}

function dismissSheet() {
  if (S.strokes) {
    cancelStrokeAnimation();
    S.strokes = null;
  }
  S.sheetScrollRestore = null;
  S.sheetFocus = null;
  if (!S.stack.length) return;
  S.stack = [];
  // Escape/scrim from a result's sheet walks back into the search too
  if (S.view === 'drift' && S.navReturn) S.navOpen = true;
  S.navReturn = false;
  render();
  returnScroll();
  restoreDialogInvoker();
}

/* ------------------------------------------------ 筆順 · the stroke page */
let strokeHistorySerial = 0;

/** Open the dedicated full-screen stroke-order page over the kanji sheet.
 * The sheet stays exactly where it was: its scrollTop rides along in the
 * layer's own state and is put back, unchanged, when the page closes. */
function openStrokePage(id, { invoker = null, historyEntry = null } = {}) {
  const sheet = $('.sheet');
  S.strokeChromeAwake = !S.strokeMinimal;
  const sheetScroll = historyEntry?.sheetScroll ?? (sheet ? sheet.scrollTop : 0);
  const invokerKeyValue = historyEntry?.invoker ?? invoker?.id ?? null;
  let historyToken = historyEntry?.token ?? null;
  if (S.strokeMinimal && !historyEntry) {
    try {
      historyToken = `bunki-stroke-${Date.now().toString(36)}-${++strokeHistorySerial}`;
      const previous = history.state && typeof history.state === 'object' ? history.state : {};
      history.pushState(
        {
          ...previous,
          bunkiStrokeRoom: {
            token: historyToken,
            id,
            sheetScroll,
            invoker: invokerKeyValue,
          },
        },
        '',
        location.href,
      );
    } catch {
      historyToken = null;
    }
  }
  S.strokes = {
    id,
    step: 0,
    sheetScroll,
    invoker: invokerKeyValue,
    historyToken,
    closing: false,
  };
  render();
}

/** Finish closing and hand the sheet back untouched — same scroll, same focus. */
function finalizeStrokePageClose() {
  if (!S.strokes) return;
  const { sheetScroll, invoker } = S.strokes;
  cancelStrokeAnimation();
  stopInkRoom();
  S.strokes = null;
  S.sheetScrollRestore = sheetScroll;
  S.sheetFocus = invoker;
  render();
}

/** Request a close. Quiet mode consumes its same-URL history sentinel so the
 * platform Back gesture and the app's Escape path are the same operation. */
function closeStrokePage({ fromHistory = false } = {}) {
  if (!S.strokes) return;
  const marker = history.state?.bunkiStrokeRoom;
  const ownsHistory =
    !!S.strokes.historyToken && marker?.token === S.strokes.historyToken;
  if (!fromHistory && ownsHistory) {
    if (!S.strokes.closing) {
      S.strokes.closing = true;
      history.back();
    }
    return;
  }
  finalizeStrokePageClose();
}

/* ------------------------------------- 歩み — one history discipline (R3-B)
 * The writing room proved the shape (bunkiStrokeRoom): a same-URL history
 * entry so the platform Back gesture works the room instead of leaving the
 * app. This generalizes it to the whole corridor with ONE sentinel, not one
 * entry per surface: whenever any stacked context stands under the learner —
 * a sheet stack, a drift dive, the archive, review, any inner room — one
 * armed entry waits in the history. Device Back pops it, the app performs its
 * OWN back() (the same walk as 戻る: scroll returned, focus returned), and
 * the sentinel re-arms while there is anywhere left to walk. Walking home
 * in-app consumes the standing entry quietly, so from home the very next
 * Back leaves the app — it never eats a press. The context itself (stack,
 * scrolls, invokers, the search session) lives in S; the entry carries only
 * the marker, because a same-document pop never loses the module state. */
let walkArmed = false;
let walkConsuming = false;

/** Whether the app's own back() would still move — the mirror of the chrome's
 * atHome test, plus the layers back() itself handles first. */
function canWalkBack() {
  // the chrome overlays are walkable layers too — the sentinel must stay
  // armed while one is open, or Back would leave the app instead of it
  if (document.getElementById('mini')) return true;
  if (worldPickerEls || S.captureOpen || S.navOpen) return true;
  if (S.strokes || S.stack.length) return true;
  if (S.view === 'drift') return S.driftDepth > 0;
  if (S.view === 'entry') return false;
  if (S.view === 'shelf') return S.variants.entry !== 'shelf';
  return true; // every inner room walks back somewhere
}

/** Keep exactly one armed sentinel while there is anywhere to walk back to.
 * Called at the end of every render and on drift depth reports — both idle
 * no-ops unless the answer to canWalkBack() has actually changed. */
function syncWalkSentinel() {
  if (walkConsuming) return;
  const should = canWalkBack();
  if (should && !walkArmed) {
    try {
      const previous = history.state && typeof history.state === 'object' ? { ...history.state } : {};
      delete previous.bunkiStrokeRoom;
      history.pushState({ ...previous, bunkiWalk: { v: 1 } }, '', location.href);
      walkArmed = true;
    } catch {
      /* embedded previews without history keep the plain exit */
    }
  } else if (!should && walkArmed) {
    // the learner walked home in-app — consume the standing entry so the
    // next platform Back leaves the app instead of being swallowed
    walkConsuming = true;
    try {
      history.back();
    } catch {
      walkConsuming = false;
      walkArmed = false;
    }
  }
}

// iPhone Back and the edge-swipe are the corridor's invisible exit ramp. The
// stroke room's own sentinel stays the topmost layer's contract; beneath it
// the walk sentinel turns every device Back into the app's own back() until
// the stack is empty — only then does Back actually leave.
addEventListener('popstate', () => {
  // the stones are the topmost layer of all — a Back press with them open
  // belongs to THEM, whatever room stands underneath. Without this the press
  // closed the writing room and left the stones and their scrim stranded on
  // the glass over whatever came next (E3 round-B, writing-room lens).
  if (worldPickerEls && !walkConsuming) {
    walkArmed = false; // the press spent the standing entry…
    closeWorldPicker(); // …and closing re-arms it while there is still a walk
    return;
  }
  if (S.strokes?.historyToken) {
    closeStrokePage({ fromHistory: true });
    return;
  }
  const marker = history.state?.bunkiStrokeRoom;
  if (marker?.token && marker?.id) {
    openStrokePage(marker.id, { historyEntry: marker });
    return;
  }
  if (walkConsuming) {
    // our own quiet consume landed; re-check in case the learner moved on
    walkConsuming = false;
    walkArmed = false;
    syncWalkSentinel();
    return;
  }
  if (walkArmed) {
    walkArmed = false;
    if (canWalkBack()) back(); // render() re-arms while there is more to walk
    return;
  }
  // a stale sentinel (Forward, or one left below a reload) — adopt it so the
  // discipline holds instead of leaving a dead history stop
  if (history.state?.bunkiWalk) {
    walkArmed = true;
    syncWalkSentinel();
  }
});

function openPassage(id) {
  keepScroll();
  S.passageId = id;
  S.view = 'reader';
  // an article you have visited opens where you left it, like a bookmark
  S.readerScroll = S.readerPos[id] || 0;
  S.stack = [];
  S.loadError = false;
  render();
  window.scrollTo(0, S.readerScroll);
  const p = passage();
  if (p && !p.tokens) {
    ensureArticle(p)
      .then(() => {
        if (S.view === 'reader' && S.passageId === id) {
          render();
          // the text just grew under us — restore the bookmark now it can hold
          window.scrollTo(0, S.readerScroll);
        }
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

/** The token's word content as exactly ONE row.
 *
 * `.tok.content` is an inline-flex COLUMN (it keeps the glyph box identical
 * before and after English mounts — see corridor.css). rubyNode returns a
 * FRAGMENT, so a token whose ruby covers only the stem — 含め becomes
 * <ruby>含<rt>ふく</rt></ruby> plus a bare "め" text node — would drop the ruby
 * and its okurigana into that column as SIBLING flex items, and the word would
 * tear into stacked rows (含 over め). Wrapping the word in this single child
 * keeps the column at exactly [word row, optional .tok-en gloss row].
 */
function wordRow(pairs, opts) {
  const row = el('span', 'tok-word');
  row.append(rubyNode(pairs, opts));
  return row;
}

/** Kanji dial: 0 as written · 1 above-常用 replaced by its reading · 2 all kana. */
function displayPairs(token) {
  const mode = S.dials.kanji;
  if (mode === 0) return token.f;
  if (mode === 2) {
    // all-kana converts KANJI runs to their readings and leaves kana runs
    // as written — flattening the whole token to its hiragana reading
    // rewrote katakana loanwords and proper nouns (みなみあふりか…),
    // misteaching standard orthography (P2, full-instrument review)
    if (!token.f) return [{ t: token.r || token.s }];
    return token.f.map((pair) => (pair.r ? { t: pair.r } : pair));
  }
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
  const openFullDictionary = () => ensureDictionaryIndex().catch(() => {});
  search.addEventListener('focus', openFullDictionary, { once: true });
  search.addEventListener('input', () => {
    S.query = search.value;
    if (S.query.trim()) openFullDictionary();
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
  main.dataset.renderToken = shelfBodyToken();
  if (S.query?.trim()) {
    renderSearchResults(main, S.query);
    if (dictionaryQueryOpening(S.query)) {
      main.append(
        el('p', 'dictionary-opening', tx('辞書の奥をひらいています…', 'Opening the rest of the dictionary…')),
      );
    } else if (dictionaryQueryError(S.query)) {
      const retry = biLabel('button', 'dictionary-retry', '辞書をもう一度ひらく', 'try the full dictionary again');
      retry.type = 'button';
      retry.addEventListener('click', () => {
        D.dictionaryError = null;
        D.dictionarySearchErrors?.delete(dictionaryQueryKey(S.query));
        ensureDictionaryIndex().catch(() => {});
        refreshShelfBody();
      });
      main.append(
        el(
          'p',
          'dictionary-warning',
          tx(
            '手元の小辞書は使えるが、辞書の奥をまだ読めない。',
            'The immediate dictionary still works, but the full index could not be opened.',
          ),
        ),
        retry,
      );
    }
    return main;
  }
  const h = withEn(el('h1', 'view-title', '本棚'), 'the bookshelf', 'en-inline');
  main.append(h);
  const curated = D.passages.filter((p) => !String(p.file || '').startsWith('archive/'));
  // the count tells the truth: a one-sentence glossary definition is not a
  // real text, so the glossary is billed as itself, beside the readings
  const glossaryCount = curated.filter((p) => p.source === 'isa-yasashii-glossary').length;
  const readingCount = curated.length - glossaryCount;
  const sub = el('p', 'shelf-snippet intro');
  sub.textContent = glossaryCount
    ? tx(
        `読み物 ${readingCount} 本と用語集 ${glossaryCount} 項。触れてひらく。`,
        `${readingCount} real texts, and a ${glossaryCount}-entry glossary. Tap one to read it.`,
      )
    : tx(`${curated.length} 本。触れてひらく。`, `${curated.length} real texts. Tap one to read it.`);
  main.append(sub);

  // door order is the learner's order, not the build order: the lanes
  // that teach first, then the reference books, then the tutor
  const lanes = el('button', 'grammar-link');
  lanes.type = 'button';
  lanes.id = 'levels-link';
  lanes.append(el('span', 'l-ja', '級で学ぶ'), el('span', 'en-sub', bi() ? 'JLPT · 漢検 lanes' : ''));
  lanes.addEventListener('click', () => {
    keepScroll();
    S.view = 'levels';
    render();
    window.scrollTo(0, 0);
  });
  main.append(lanes);
  const les = el('button', 'grammar-link');
  les.type = 'button';
  les.id = 'lessons-link';
  les.append(el('span', 'l-ja', 'レッスン'), el('span', 'en-sub', bi() ? 'lessons' : ''));
  les.addEventListener('click', () => {
    keepScroll();
    S.view = 'lessons';
    render();
    window.scrollTo(0, 0);
  });
  main.append(les);
  const gram = el('button', 'grammar-link');
  gram.type = 'button';
  gram.id = 'grammar-link';
  gram.append(el('span', 'l-ja', '文法'), el('span', 'en-sub', bi() ? 'grammar' : ''));
  gram.addEventListener('click', () => {
    keepScroll();
    S.view = 'grammar';
    render();
    window.scrollTo(0, 0);
  });
  main.append(gram);
  const thes = el('button', 'grammar-link');
  thes.type = 'button';
  thes.id = 'thesaurus-link';
  thes.append(el('span', 'l-ja', '類語'), el('span', 'en-sub', bi() ? 'synonyms, side by side' : ''));
  thes.addEventListener('click', () => {
    keepScroll();
    S.view = 'thesaurus';
    render();
    window.scrollTo(0, 0);
  });
  main.append(thes);
  const yj = el('button', 'grammar-link');
  yj.type = 'button';
  yj.id = 'yoji-link';
  yj.append(el('span', 'l-ja', '四字熟語'), el('span', 'en-sub', bi() ? 'four-character idioms' : ''));
  yj.addEventListener('click', () => {
    keepScroll();
    S.view = 'yoji';
    render();
    window.scrollTo(0, 0);
  });
  main.append(yj);
  const kdx = el('button', 'grammar-link');
  kdx.type = 'button';
  kdx.id = 'kanjidex-link';
  kdx.append(el('span', 'l-ja', '字引'), el('span', 'en-sub', bi() ? 'find a kanji by shape' : ''));
  kdx.addEventListener('click', () => {
    keepScroll();
    S.view = 'kanjidex';
    render();
    window.scrollTo(0, 0);
  });
  main.append(kdx);
  const ai = el('button', 'grammar-link');
  ai.type = 'button';
  ai.id = 'ai-link';
  ai.append(el('span', 'l-ja', aiKey() ? '先生' : '先生を招く'), el('span', 'en-sub', bi() ? (aiKey() ? 'the tutor is here' : 'invite the tutor') : ''));
  ai.addEventListener('click', () => {
    keepScroll();
    S.view = 'ai';
    render();
    window.scrollTo(0, 0);
  });
  main.append(ai);

  // present only while the tutor is here — quietly absent without a key
  if (aiKey()) {
    const aread = el('button', 'grammar-link');
    aread.type = 'button';
    aread.id = 'airead-link';
    aread.append(el('span', 'l-ja', '私の読み物'), el('span', 'en-sub', bi() ? 'a reading written for you' : ''));
    aread.addEventListener('click', () => {
      keepScroll();
      S.view = 'airead';
      render();
      window.scrollTo(0, 0);
    });
    main.append(aread);
  }

  // one shelf, quiet sections: cards keep the index's own order inside each
  // section, and sections stand in the order the index first names them —
  // the categories gather without anything being reshuffled
  const sections = new Map();
  for (const p of curated) {
    const sec = shelfSection(p);
    if (!sections.has(sec.ja)) sections.set(sec.ja, { sec, items: [] });
    sections.get(sec.ja).items.push(p);
  }
  for (const { sec, items } of sections.values()) {
    main.append(withEn(el('p', 'eyebrow shelf-section', sec.ja), sec.en, 'en-inline'));
    for (const p of items) main.append(shelfCard(p));
  }

  // the deep stack: the frozen wikinews archive, its own quiet room —
  // absent from the single-file build, which does not carry the stack
  if (window.__CORRIDOR_STANDALONE__ !== true) {
    const arc = el('button', 'grammar-link');
    arc.type = 'button';
    arc.id = 'archive-link';
    arc.append(
      el('span', 'l-ja', '新聞アーカイブ'),
      el('span', 'en-sub', bi() ? 'the newspaper archive · 2005–2026' : 'ウィキニュース 2005–2026'),
    );
    arc.addEventListener('click', () => {
      keepScroll();
      S.view = 'archive';
      render();
      window.scrollTo(0, 0);
    });
    main.append(arc);
  }

  // sources and licences: present, honest, folded
  const src = el('button', 'details-toggle');
  src.setAttribute('aria-expanded', String(!!S.sourcesOpen));
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

/** The shelf's quiet sections, named from each record's own provenance —
 * no code-side canon that the data could contradict. */
function shelfSection(p) {
  if (p.source === 'ja.wikinews') return { ja: 'ニュース', en: 'news' };
  if (p.source === 'aozorabunko-clean') return { ja: '青空文庫', en: 'Aozora Bunko' };
  if (p.source === 'isa-yasashii-glossary') {
    return { ja: 'やさしい日本語 用語集', en: 'the plain-Japanese glossary — one-line definitions' };
  }
  const label = String(p.sourceLabel || '');
  if (label.startsWith('段階別読み物')) return { ja: '段階別読み物', en: 'graded readings' };
  if (label.startsWith('随筆')) return { ja: '随筆', en: 'essays' };
  return { ja: '古典・一次資料', en: 'classics & primary sources' };
}

/** One shelf card. The card is a small row of PARALLEL controls, never a
 * button holding a button (invalid HTML that hides the inner toggle from
 * assistive tech): the text is one whole door, 詳細 its own sibling door. */
function shelfCard(p) {
  const item = el('article', 'shelf-item');
  item.dataset.passage = p.id;

  const open = el('button', 'shelf-open');
  open.type = 'button';
  const head = el('div', 'shelf-head');
  head.append(el('div', 'shelf-title', p.title));
  // the English title travels with the record (titleEn + titleEnSource in
  // data/articles/index.json), never in a code-side map
  if (bi() && p.titleEn) head.append(el('div', 'shelf-title-en', p.titleEn));
  const lv = levelPhrase(p.grading);
  const levelLine = el('div', 'level-line');
  levelLine.append(el('span', 'level-chip', bi() ? lv.level : lv.ja));
  levelLine.append(el('span', 'level-note', bi() ? `${lv.ja}${lv.note}` : lv.noteJa));
  if (p.grading.disagreement.flag) {
    levelLine.append(el('span', 'disagree-tag', tx('不一致', 'signals disagree')));
  }
  head.append(levelLine);
  open.append(head);

  const meta = el('div', 'shelf-meta');
  meta.append(el('span', null, p.sourceLabel));
  // an absent date stays absent — a stringified null ("None") is data rot,
  // never provenance, and must not stand in the card's meta line (R3-E)
  if (p.date && p.date !== 'None') meta.append(el('span', null, p.date));
  meta.append(el('span', 'pool-tag', p.licence));
  // an honest kind on the rows that are not articles
  if (p.source === 'isa-yasashii-glossary') {
    meta.append(el('span', 'pool-tag', tx('用語集の項目', '用語集 glossary entry')));
  }
  // the shelf remembers with you: finished, or open to your bookmark
  if (S.readDone[p.id]) meta.append(el('span', 'pool-tag read-tag', tx('読了', '読了 finished')));
  else if ((S.readerPos[p.id] || 0) > 300) meta.append(el('span', 'pool-tag read-tag', tx('途中', '途中 in progress')));
  open.append(meta);
  open.append(el('div', 'shelf-snippet', p.snippet ?? (p.text || '').slice(0, 64)));
  open.addEventListener('click', () => openPassage(p.id));
  item.append(open);

  // the instrument stays one tap away: 詳細 unfolds the raw three signals
  const details = el('button', 'details-toggle');
  details.setAttribute('aria-expanded', String(!!S.detailsOpen?.has(p.id)));
  details.type = 'button';
  details.dataset.details = p.id;
  details.textContent = (S.detailsOpen?.has(p.id) ? '▾ ' : '▸ ') + tx('詳細', 'details');
  details.addEventListener('click', () => {
    (S.detailsOpen ||= new Set());
    if (S.detailsOpen.has(p.id)) S.detailsOpen.delete(p.id);
    else S.detailsOpen.add(p.id);
    render();
  });
  item.append(details);
  if (S.detailsOpen?.has(p.id)) item.append(renderSignals(p.grading, { compact: true }));
  return item;
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
      S.dialsUrlOverride = false; // a real hand on the dial IS the choice
      // the chosen setting survives the session; dials are display
      // preferences, not learner evidence (P0-4 residual-ledger disposition)
      saveStore();
      render();
    });
    seg.append(b);
  });
  row.append(seg);
  return row;
}

/* ------------------------------------------- the reader's click grammar
 * One discipline, carried from Drift (§8 of the design-language doc), tuned
 * by operator rounds 3–4 (2026-08-07) and the circle ruling (2026-08-12).
 * Taps are PROGRESSIVE, not timed, and they close a circle:
 *   1st tap        → furigana above           (instant — no double-tap wait)
 *   2nd tap        → English beneath          (a later tap, not a fast pair)
 *   3rd tap        → back to plain kanji      (the circle closes; no one-way reveals)
 * With ふりがな on つねに the first rung is already climbed, so the circle is
 * two taps: English, then plain again. tapLadderHint() says which.
 *   long-press     → floating mini-dictionary (the simple definition)
 *   keep holding   → the mini window morphs into the full entry
 *   tap the mini   → the full entry
 * A moved pointer is a scroll, never a gesture. Every action applies to the
 * DOM directly — no full re-render, so the reader never stutters. */
const GESTURE = { MINI_MS: 430, FULL_MS: 2100, MOVE_PX: 9 };

/* After a hold opens the full entry, the browser still synthesises a click
 * when the finger lifts — and it lands on whatever the new sheet put under
 * that spot, teleporting the reader a node deeper. Swallow exactly THAT
 * click and no other: a 700 ms blanket also ate the very next real tap —
 * 戻る pressed right after an entry opened simply died, and the retries
 * cascaded the whole stack down to the drift (operator, 2026-08-12). */
let swallowClickUntil = 0;
document.addEventListener(
  'click',
  (ev) => {
    if (Date.now() < swallowClickUntil) {
      swallowClickUntil = 0; // one ghost click, once
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
/* …and Escape, which every other dialog in the app answers to */
document.addEventListener(
  'keydown',
  (ev) => {
    if (ev.key !== 'Escape') return;
    const mini = document.getElementById('mini');
    if (!mini) return;
    ev.preventDefault();
    ev.stopPropagation();
    const opener = mini.dataset.openerIndex
      ? document.querySelector(`#reader .tok[data-index="${CSS.escape(mini.dataset.openerIndex)}"]`)
      : null;
    removeMini();
    syncWalkSentinel();
    opener?.focus?.({ preventScroll: true });
  },
  true,
);

function showMini(span, token, onEntry, { focusEntry = false, from = null } = {}) {
  removeMini();
  // the mini owns the moment: any lingering token-actions pill from an
  // earlier focus would double 全項目 beside it
  for (const pill of document.querySelectorAll('.token-actions:not([hidden])')) {
    pill.hidden = true;
    pill.remove();
  }
  const g = lookup(token.b);
  const mini = el('div', null);
  mini.id = 'mini';
  mini.setAttribute('role', 'dialog');
  mini.setAttribute('aria-label', tx(`${token.b} の語釈`, `${token.b} quick look`));
  // the token it was opened from, so Escape can hand the keyboard back to it
  if (span?.dataset?.index != null) mini.dataset.openerIndex = String(span.dataset.index);
  mini.append(el('span', 'mini-word', token.b));
  // 覚 — the capture door rides the mini too (directive §3): one tap takes
  // the word (with its sentence when held inside an article), one more tap
  // undoes a mis-take. The seal repaints in place so the mini never blinks.
  const miniTaken = () => S.taken.some((t) => t.t === 'word' && t.id === token.b);
  const seal = el('button', 'mini-take', '覚');
  seal.type = 'button';
  seal.id = 'mini-take';
  const paintSeal = () => {
    const on = miniTaken();
    seal.classList.toggle('taken', on);
    seal.setAttribute('aria-pressed', String(on));
    seal.setAttribute(
      'aria-label',
      on ? tx(`「${token.b}」の覚えるをやめる`, `stop memorizing ${token.b}`) : tx(`「${token.b}」を覚える`, `memorize ${token.b}`),
    );
  };
  paintSeal();
  seal.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleTaken(from ? { t: 'word', id: token.b, from, ctxScope: 'sent' } : { t: 'word', id: token.b }, token.b);
    paintSeal();
    // the reader's under-ink and the chrome seal follow without a re-render
    const on = miniTaken();
    span.classList.toggle('tok-learning', on);
    if (!on) span.classList.remove('tok-due');
    syncReaderTakeSeal();
  });
  mini.append(seal);
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
  // a walkable layer: arm the sentinel so device Back dismisses the mini
  // rather than walking the room out from under it
  syncWalkSentinel();
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
  // focus caused by PRESSING THIS TOKEN follows its own pointerdown within
  // a beat (touch focuses after release; a long-press after ~750ms). That
  // focus is the press — showing the pill there popped it over the next
  // prose line after every tap, doubled 全項目 beside the long-press mini,
  // and put a button under the lifting finger (P2 ×2, review). Keyboard,
  // switch, and screen-reader focus arrives with no press on this token
  // (AT cursor flicks target the screen, not the span) and keeps the pill.
  let ownPressAt = 0;
  wrapper.addEventListener('pointerdown', () => (ownPressAt = Date.now()), true);
  span.addEventListener('focus', () => {
    if (Date.now() - ownPressAt > 900 && !document.getElementById('mini')) show();
  });
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
  // THE FIRST SENSE WINS. JMdict orders senses by importance; picking the
  // shortest string across senses surfaced tag-stripped minor senses as THE
  // meaning — 半島 glossed "Korea" instead of "peninsula" (operator, on a
  // real phone, 2026-08-12). Shortening happens WITHIN the first sense
  // (comma cut); a later sense is a last resort only when the first cannot
  // be made to fit at all.
  let best = candidates[0];
  if (best.length > 18 && best.includes(',')) best = best.split(',')[0].trim();
  if (best.length > 24) {
    const shorter = candidates.slice(1).find((c) => c.length <= 18);
    if (shorter) best = shorter;
  }
  return best;
}

/** The tap ladder has one rung fewer when the ふりがな dial is つねに: the
 * reading is already on the page, so the first activation cannot reveal it and
 * goes straight to the English gloss (see activate(), below). The hint has to
 * describe the ladder the reader actually has under their finger. */
const readingsAlwaysOn = () => S.dials.furigana === 2;

function tapLadderHint() {
  if (readingsAlwaysOn()) {
    return tx(
      'ことばに触れると英語、もう一度で元どおり。長押しで辞書。',
      'tap a word for English — again to clear it; hold for the dictionary',
    );
  }
  return tx(
    '触れるとふりがな、もう一度で英語、三回目で元どおり。長押しで辞書。',
    'tap for the reading, again for English, a third time to clear — hold for the dictionary',
  );
}

function tokenAccessibleLabel(token, index) {
  const record = lookup(token.b);
  const hasReading = S.dials.furigana === 2 || S.revealed?.has(index);
  const hasEnglish = S.glossed?.has(index);
  const parts = [token.s || token.b, tx('語', 'word')];
  if (hasReading && record?.r && record.r !== token.s) parts.push(record.r);
  if (hasEnglish && record?.m?.length) parts.push(inlineGloss(record));
  parts.push(
    readingsAlwaysOn()
      ? tx('もう一度で元どおり。長押しで全項目。フォーカスで別の操作。', 'a further activation clears; hold for the full entry; focus for more actions')
      : tx('三回目で元どおり。長押しで全項目。フォーカスで別の操作。', 'a third activation clears; hold for the full entry; focus for more actions'),
  );
  return parts.filter(Boolean).join(' · ');
}

/** A name's accessible label. It says what it is and what pressing does —
 * and never implies the 語釈/全項目 a name has no entry to answer with. */
function namedAccessibleLabel(token, index, isName = true) {
  const shown = S.dials.furigana === 2 || S.revealed?.has(index);
  // 名前 only when it IS one. A 接尾辞 or 接頭辞 written in kanji keeps its
  // door — its reading is worth having — but calling 第 or 中 a proper name
  // taught the learner something false 818 times per corpus
  // (E3 round-C, reader lens).
  const parts = [token.s || token.b, isName ? tx('名前', 'name') : tx('読み', 'reading')];
  if (shown && token.r) parts.push(token.r);
  parts.push(
    shown
      ? tx('もう一度で読みを隠す。', 'activate again to hide the reading')
      : tx('読みを表示する。', 'activate to show its reading'),
  );
  return parts.filter(Boolean).join(' · ');
}

/** Apply one token's reveal state straight to its DOM — no re-render. */
function paintTok(span, token, index) {
  const hasReading = S.dials.furigana === 2 || S.revealed?.has(index);
  const hasEn = S.glossed?.has(index);
  if (S.dials.furigana === 1) {
    for (const rt of span.querySelectorAll('rt')) rt.classList.toggle('hidden-rt', !hasReading);
  } else if (S.dials.furigana === 0) {
    // the dial says no ruby — a per-word reveal builds it on the spot.
    // Swap the WORD ROW alone: the column must stay [word row, gloss row], so
    // wiping the whole span (and re-appending) would both drop the wrapper and
    // land a rebuilt word AFTER an existing gloss. replaceWith keeps the order
    // and leaves any mounted .tok-en untouched for the block below.
    const built = span.querySelector('ruby');
    if (hasReading !== !!built) {
      const next = wordRow(displayPairs(token), {
        furigana: hasReading ? 1 : 0,
        revealed: hasReading,
      });
      const row = span.querySelector('.tok-word');
      if (row) {
        row.replaceWith(next);
      } else {
        span.querySelector('.tok-en')?.remove();
        span.textContent = '';
        span.append(next);
      }
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
  const obsKey = srsKey('word', token.b);
  const openFull = (modality = 'pointer', emitAction = true) => {
    removeMini();
    setReaderTake(token.b, index, p.id);
    // a held finger's release will synthesize one click onto the new sheet —
    // arm the swallow only then (arming on a button click would eat the
    // user's NEXT real tap instead)
    if (down) swallowClickUntil = Date.now() + 700;
    obsLog('tap', obsKey, 3, p.id);
    if (emitAction) interaction({ kind: 'entry.open', target }, modality, 'reader-token');
    go(
      { t: 'word', id: token.b, from: { passage: p.id, index } },
      { invoker: span },
    );
  };
  const quickLook = (modality = 'pointer', emitAction = false) => {
    setReaderTake(token.b, index, p.id);
    obsLog('tap', obsKey, 2, p.id);
    if (emitAction) interaction({ kind: 'quickLook.open', target }, modality, 'reader-token');
    showMini(span, token, (entryModality) => openFull(entryModality, true), {
      focusEntry: modality !== 'pointer',
      from: { passage: p.id, index },
    });
  };
  const activate = (modality) => {
    interaction({ kind: 'target.activate', target }, modality, 'reader-token');
    setReaderTake(token.b, index, p.id);
    (S.revealed ||= new Set());
    (S.glossed ||= new Set());
    const hasReading = S.dials.furigana === 2 || S.revealed.has(index);
    const hasEn = S.glossed.has(index);
    if (!hasReading) {
      S.revealed.add(index);
      obsLog('tap', obsKey, 1, p.id);
      paintTok(span, token, index);
      return;
    }
    if (!hasEn) {
      S.glossed.add(index);
      obsLog('tap', obsKey, 2, p.id);
      paintTok(span, token, index);
      return;
    }
    // the third tap closes the circle (operator, 2026-08-12): back to plain
    // kanji, ladder reset. Definitions live on the holds — a short hold for
    // the mini, a long hold (or a tap on the mini) for the full entry.
    S.revealed.delete(index);
    S.glossed.delete(index);
    paintTok(span, token, index);
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
  let heldAt = 0;
  span.addEventListener('pointerup', () => {
    if (!down) return;
    const held = Date.now() - down.at;
    down = null;
    clear();
    // a hold's release still synthesises a click — mark it inert
    if (held >= GESTURE.MINI_MS) heldAt = Date.now();
  });
  span.addEventListener('click', (event) => {
    // Activation lives on the CLICK: inside scrollable surfaces iOS
    // pointercancels a plain tap and pointerup never arrives — activating
    // there left real fingers dead (operator's phone, 2026-08-12). The
    // click still fires after a cancel; scrolls fire no click at all.
    if (Date.now() < swallowClickUntil) return;
    if (heldAt && Date.now() - heldAt < 800) {
      heldAt = 0;
      return;
    }
    activate(event.detail === 0 ? 'keyboard' : 'pointer');
  });
  return {
    target,
    quickLook: (modality) => quickLook(modality, false),
    openEntry: (modality) => openFull(modality, false),
  };
}

function commitReadDone(articleId, now = Date.now()) {
  const readDone = { ...S.readDone };
  if (readDone[articleId]) delete readDone[articleId];
  else readDone[articleId] = now;
  return commitStorePatch({ readDone });
}

/* ------------------------------------------- 用語集の相互参照 (glossary)
 * The ISA glossary numbers its entries, and its definitions cite each other
 * by that number — 「印鑑登録証明書(No.6)」. Ten entries stand on this shelf
 * under the same numbers (yasashii:N); the rest of the glossary does not.
 * At render time a citation whose target stands here becomes a live door to
 * that entry; a citation into the missing rest drops its dead number and
 * keeps the term. The licensed text and tokens are untouched on disk —
 * this is presentation, not adaptation. */
function glossaryCrossRefPlan(p) {
  if (p.source !== 'isa-yasashii-glossary' || !p.tokens) return null;
  const skip = new Set();
  const doors = new Map();
  const toks = p.tokens;
  for (let i = 0; i + 4 < toks.length; i++) {
    if (toks[i].s !== '(' && toks[i].s !== '（') continue;
    if (toks[i + 1]?.s !== 'No' || toks[i + 2]?.s !== '.') continue;
    if (!/^[0-9]+$/.test(toks[i + 3]?.s || '')) continue;
    if (toks[i + 4].s !== ')' && toks[i + 4].s !== '）') continue;
    const target = D.passages.find((x) => x.id === `yasashii:${Number(toks[i + 3].s)}`);
    for (let k = i; k <= i + 4; k++) skip.add(k);
    if (target) doors.set(i, target);
    i += 4;
  }
  return skip.size ? { skip, doors } : null;
}

function renderReader(main) {
  const p = passage();
  if (!p) {
    S.view = 'shelf';
    return renderShelf(main);
  }
  main.append(el('p', 'eyebrow', p.sourceLabel));
  // the reader was the one view in bi mode that dropped the English title —
  // the handle the learner chose the text by (E3 round-A, reader lens). It
  // rides BESIDE the heading, the way the shelf card carries it, so the
  // heading itself still reads as the Japanese title alone.
  main.append(el('h1', 'view-title', p.title));
  if (bi() && p.titleEn) main.append(el('p', 'view-title-en', p.titleEn));
  const lv = levelPhrase(p.grading);
  const levelLine = el('div', 'level-line');
  levelLine.append(el('span', 'level-chip', bi() ? lv.level : lv.ja));
  levelLine.append(el('span', 'level-note', bi() ? `${lv.ja}${lv.note}` : lv.noteJa));
  main.append(levelLine);

  // the dials fold away — the text is the point, the settings one tap away
  const dialsToggle = el('button', 'details-toggle');
  dialsToggle.setAttribute('aria-expanded', String(!!S.dialsOpen));
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
  grammarHint.textContent = tapLadderHint();
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
  // the shared learner model, visible in the text itself: words on the
  // memorize list carry a quiet under-ink — deeper when the card is due
  // right now. The reader and the review pile never disagree about what
  // you are learning, because they read the same store.
  const learning = new Set();
  for (const t of S.taken) if (t.t === 'word') learning.add(t.id);
  const dueNow = new Date();
  const crossRefs = glossaryCrossRefPlan(p);
  let group = null;
  // set when the token just placed reaches FORWARD for what completes it —
  // a numeral for its counter, a 接頭辞 for its stem
  let groupHolds = false;
  for (const [index, token] of p.tokens.entries()) {
    if (index > 0 && paraBreaks.has(index)) {
      reader.append(el('span', 'para-break'));
      group = null;
    }
    if (crossRefs) {
      const refTarget = crossRefs.doors.get(index);
      if (refTarget) {
        const refDoor = el('button', 'sent-door glossary-ref', '▹');
        refDoor.type = 'button';
        refDoor.dataset.glossaryRef = refTarget.id;
        refDoor.setAttribute(
          'aria-label',
          tx(`用語集「${refTarget.title}」をひらく`, `open the glossary entry ${refTarget.title}`),
        );
        refDoor.addEventListener('click', () => openPassage(refTarget.id));
        if (S.dials.spacing === 2 && group) group.append(refDoor);
        else reader.append(refDoor);
      }
      if (crossRefs.skip.has(index)) continue;
    }
    const particle = !token.c ? PARTICLE_BY_SURFACE[token.s] : null;
    // A name is exactly what a learner cannot read. The `c` flag comes from
    // the GRADER, whose 固有名詞/数詞 exclusion means "do not count this as a
    // content word" — a readability rule that was doing double duty as the
    // reader's interactivity law, leaving 知床半島 and 藤田譲瑠チマ as dead
    // text with no reading, no gloss, no 覚える (E3 round-A, reader lens).
    // Any token written with kanji that carries a reading is now a door,
    // whatever the grader thinks of it; punctuation and bare kana are not.
    // …and only while there is something for the door to do. With ふりがな
    // always on, a name's whole offer is already on the page, so it stops
    // being a button rather than standing in the tab order promising
    // nothing (E3 round-B, a11y lens).
    // What the token IS — asked once, and never of the ふりがな dial. Keying
    // the 文節 rule below on the interactive form coupled two dials that
    // share no meaning: turning ふりがな to つねに silently redrew the phrase
    // boundaries (E3 round-C, reader lens).
    const pos = String(token.p || '');
    const suffix = pos === '接尾辞';
    const prefix = pos === '接頭辞';
    const kanjiWithReading =
      !token.c && !particle && !!token.r && /[一-鿌々〆ヶ]/.test(String(token.s || ''));
    // …and a name is a NOUN written in kanji. 接尾辞 and 接頭辞 are grammar —
    // 第, 未, 的, 館, 中, 国 — and the room was announcing 818 of them per
    // corpus as proper names (E3 round-C, reader lens). They keep their door,
    // because their reading is worth having; they lose the false title.
    // …and a NUMBER is not a name either. Round C narrowed the rule to
    // "a noun written in kanji", which is exactly what 一, 十, 百, 三十二 are —
    // so 383 bare numerals per corpus went on being announced as proper
    // names after the 818 affixes stopped (E3 round-D, reader lens).
    const numeral =
      /^[0-9０-９]+$/.test(String(token.s || '')) ||
      /^[〇零一二三四五六七八九十百千万億兆]+$/.test(String(token.s || ''));
    const properName = kanjiWithReading && !suffix && !prefix && !numeral;
    // …and only while there is something for the door to do. With ふりがな
    // always on, the whole offer is already on the page, so it stops being a
    // button rather than standing in the tab order promising nothing
    // (E3 round-B, a11y lens).
    const namedReading = kanjiWithReading && S.dials.furigana !== 2;
    const interactive = !!token.c || !!particle || namedReading;
    // its own class: a door, but never mistaken for a graded content word —
    // the app and its verifiers both select on .tok.content, and a name with
    // no dictionary entry answering to that name breaks both
    const span = el(
      interactive ? 'button' : 'span',
      token.c ? 'tok content' : namedReading ? 'tok named' : 'tok plain',
    );
    if (interactive) span.type = 'button';
    span.dataset.index = String(index);
    if (token.c) {
      span.dataset.word = token.b;
      span.dataset.action = 'target.activate';
      span.dataset.targetKind = 'word';
      if (learning.has(token.b)) {
        span.classList.add('tok-learning');
        const rec = S.srs[srsKey('word', token.b)];
        if (rec && new Date(rec.due) <= dueNow) span.classList.add('tok-due');
      }
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
    } else if (namedReading) {
      // round A made names doors and stopped there: 47 focusable buttons in
      // one article with no action, no name, and no way to reach the reading
      // they were given (E3 round-B, a11y lens). A name has no dictionary
      // entry, so it promises none — its whole truth is its READING, and the
      // door shows it. Two states, not the content word's three.
      span.dataset.action = 'target.activate';
      span.dataset.targetKind = 'name';
      span.setAttribute('aria-pressed', String(!!(S.revealed && S.revealed.has(index))));
      span.setAttribute('aria-label', namedAccessibleLabel(token, index, properName));
    }
    if (S.revealed && S.revealed.has(index)) span.classList.add('lit');
    span.append(
      wordRow(displayPairs(token), {
        // a per-word reveal survives a full re-render even at ふりがな なし
        // (mode 0 never prints rt, so a revealed token is promoted to 1 —
        // the same promotion paintTok applies on the spot)
        furigana: S.dials.furigana === 0 && S.revealed?.has(index) ? 1 : S.dials.furigana,
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
      } else if (namedReading) {
        wireNamedGestures(span, token, index, properName);
      }
      rendered = wrapper;
    }
    if (S.dials.spacing === 2) {
      // 文節 starts at a content word or a name — never at a 接尾辞, which
      // belongs to what precedes it, and never leaving a numeral stranded
      // from its counter. Keyed on token.c alone the dial cut names in half;
      // keyed on the interactive form it moved with ふりがな; blind to POS it
      // shattered every date into [2005] [年7] [月14] [日、]
      // (E3 rounds B and C, reader lens). 2005年 · 7月 · 14日、 now, and
      // 第29回 and 開催中の hold together as the one phrase each of them is.
      const opensPhrase = (token.c || properName || numeral) && !suffix && !groupHolds;
      if (opensPhrase || !group) {
        group = el('span', 'bunsetsu');
        reader.append(group);
      }
      // a numeral and a 接頭辞 both reach FORWARD for what completes them
      groupHolds = numeral || prefix;
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
  // the quiet close of a reading: mark it finished, or take the mark back
  const fin = el('div', 'read-done');
  const done = !!S.readDone[p.id];
  const finBtn = biLabel(
    'button',
    done ? 'chip read-fin finished' : 'chip read-fin',
    done ? '読了 ✓' : '読み終えた',
    done ? 'finished — tap to unmark' : 'mark as finished',
  );
  finBtn.type = 'button';
  finBtn.id = 'read-fin';
  finBtn.addEventListener('click', () => {
    if (!commitReadDone(p.id)) {
      render();
      return;
    }
    keepScroll();
    render();
    returnScroll();
  });
  fin.append(finBtn);
  main.append(fin);

  // …and it must appear wherever the MARK does. The block was gated on
  // pendingVerification, which only 11 of the 53 rows carrying 検収前 in their
  // source label actually have — so 42 rows (the 30 legacy originals and 12
  // fresh mints) wore the mark with no reason offered anywhere in the app
  // (E3 round-C, data-licence lens). A row under review explains itself.
  if (p.pendingVerification || p.review) {
    // one hardcoded sentence answered for every pending row, so the ten
    // やさしい日本語 glossary entries — whose open question is RIGHTS —
    // explained themselves with a Wikinews archive-freeze story that is
    // false of them (E3 round-B, data-licence and reader lenses). The mark
    // stays 検収前 either way; what changes is that it names its own reason.
    const pv = el('div', 'note');
    pv.textContent =
      p.review === 'rights-review-pending'
        ? tx(
            '出典の利用条件がまだ確認されていない。検収前。',
            'The terms this source may be used under are not yet verified. Pending review.',
          )
        : p.review === 'human-review-pending'
          ? tx(
              '人手による確認がまだ済んでいない。検収前。',
              'A human review of this text is still pending.',
            )
          : tx(
              '閉鎖前日の記事。凍結アーカイブとの最終版照合はまだ済んでいない。',
              'Published the day before the archive froze; the final-revision check against the frozen archive is still pending.',
            );
    main.append(pv);
  }

  const attribution = el('div', 'note');
  if (p.url) {
    const a = el('a', 'inline-link', p.attribution);
    a.href = p.url;
    a.rel = 'noreferrer';
    a.target = '_blank';
    attribution.append(a);
  } else {
    attribution.textContent = p.attribution;
  }
  main.append(attribution);
}

/* The Drift entry (Phase 2): the real 墨流し universe fills the viewport on
 * its own layer beneath the chrome; the corridor contributes exactly one
 * thing here — the door into the shelf. 藍 indigo, per the palette law:
 * "you can go here". */
function renderDrift(main) {
  // 銀河 is the hero: the galaxy fills the view and the corridor adds nothing
  // over it here. The way in to the shelf, the tutor, search and the dojo all
  // live behind the single symbol (buildGingaChrome) — the galaxy stays clear.
  main.style.padding = '0';
}

/* ------------------------------------------- the Drift card's study door
 * The drift universe is generated from its own source and knows nothing about
 * the corridor. It asks its host one question — "can you open this entry?" —
 * and draws the study door on a word card only if the answer is yes. Here the
 * answer comes from the corridor's own dictionary, and the door opens the
 * corridor's own full entry: the same sheet the shelf and the reader open,
 * with senses, 漢字 doors and 意味の近く. No app base, no href, no navigation
 * away — one app, one entry surface, and a word the corridor does not carry
 * simply keeps the card's honest note instead of a door onto nothing.
 *
 * The seam is installed at module scope, before boot resolves, because the
 * drift layer consults it lazily (on each card open) and never at load. */
window.__BUNKI_OPEN_ENTRY = {
  has(kind, key) {
    if (!S.ready || !key) return false;
    if (kind === 'word') return !!lookup(key);
    if (kind === 'kanji') return !!D.kanji[key];
    return false;
  },
  open(kind, key) {
    if (S.view !== 'drift' || !this.has(kind, key)) return;
    interaction({ kind: 'entry.open' }, 'pointer', `drift-study-${kind}`);
    go({ t: kind, id: key });
  },
};

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
    window.scrollTo(0, S.shelfScroll);
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

/* ペース — the learner's own review pacing, folded away until asked for (the
 * dials idiom): how many never-seen cards a day may introduce (0–50) and how
 * many due cards one ordinary sitting holds (5–100). Persisted as srsPrefs in
 * the envelope, validated fail-closed like every other root. LEECH_LAPSES
 * stays a constant — the rest offer is a design law, not a preference. */
function renderSrsPrefs(main) {
  const toggle = el('button', 'details-toggle');
  toggle.type = 'button';
  toggle.id = 'srs-prefs-toggle';
  toggle.setAttribute('aria-expanded', String(!!S.srsPrefsOpen));
  toggle.textContent = (S.srsPrefsOpen ? '▾ ' : '▸ ') + tx('ペース', 'pacing ペース');
  toggle.addEventListener('click', () => {
    S.srsPrefsOpen = !S.srsPrefsOpen;
    render();
  });
  main.append(toggle);
  if (!S.srsPrefsOpen) return;
  const rows = el('div', 'srs-prefs');
  const stepper = (labelJa, labelEn, key, value, min, max, step) => {
    const row = el('div', 'srs-pref-row');
    row.append(withEn(el('span', 'srs-pref-name', labelJa), labelEn, 'en-inline'));
    const commit = (next) => {
      const clamped = Math.min(max, Math.max(min, next));
      if (clamped === value) return;
      if (commitStorePatch({ srsPrefs: { ...S.srsPrefs, [key]: clamped } })) render();
    };
    // named controls: the by-name focus restore after a render can only find
    // what has a name, and these had none — so every press of a stepper
    // dropped the keyboard to the document (E3 round-B, a11y lens)
    const minus = el('button', 'rest-toggle srs-pref-step', '−');
    minus.type = 'button';
    minus.id = `pref-down-${key}`;
    minus.dataset.prefDown = key;
    minus.disabled = value <= min;
    minus.setAttribute('aria-label', tx(`${labelJa} を減らす`, `lower ${labelEn}`));
    minus.addEventListener('click', () => commit(value - step));
    const val = el('span', 'srs-pref-val', String(value));
    val.dataset.prefVal = key;
    const plus = el('button', 'rest-toggle srs-pref-step', '＋');
    plus.type = 'button';
    plus.id = `pref-up-${key}`;
    plus.dataset.prefUp = key;
    plus.disabled = value >= max;
    plus.setAttribute('aria-label', tx(`${labelJa} を増やす`, `raise ${labelEn}`));
    plus.addEventListener('click', () => commit(value + step));
    row.append(minus, val, plus);
    rows.append(row);
  };
  stepper('新規 / 日', 'new cards a day', 'newPerDay', srsNewPerDay(), 0, NEW_PER_DAY_MAX, 5);
  stepper('一回の枚数', 'cards a sitting', 'reviewLimit', srsReviewLimit(), REVIEW_LIMIT_MIN, REVIEW_LIMIT_MAX, 5);
  // R3-D · when the learner's own fitted weights rule the scheduler, this
  // fold — the scheduler-preferences surface — names it quietly, with the
  // honest basis. The raw parameter-set slug stays in exports/debug.
  if (srsCustom) {
    rows.append(
      el(
        'p',
        'card-kind',
        srsCustom.basedOnReviews
          ? tx(
              `復習の予定は自分の記録（${srsCustom.basedOnReviews} 回の復習）で調整済み`,
              `scheduling tuned from your own record (${srsCustom.basedOnReviews} reviews)`,
            )
          : tx('復習の予定は自分の記録で調整済み', 'scheduling tuned from your own record'),
      ),
    );
  }
  main.append(rows);
}

function renderTray(main) {
  main.append(withEn(el('p', 'eyebrow', 'リスト'), 'your lists', 'en-inline'));
  main.append(
    el('h1', 'view-title', tx(`覚える ${S.taken.length} 件`, `Memorizing ${S.taken.length} item${S.taken.length === 1 ? '' : 's'}`)),
  );
  // The stable global live region owns storage errors. This surface adds only
  // the quiet backup reminder when the record itself is healthy.
  if (!S.storeError) {
    const cardCount = S.taken.length + Object.keys(S.srs).length;
    const last = Number(S.stats?.lastExportTs) || 0;
    const stale = !last || Date.now() - last > 14 * 86400000;
    if (cardCount >= 20 && stale) {
      main.append(
        el(
          'p',
          'store-nudge',
          last
            ? tx(
                '最後の書き出しから二週間以上。下の「書き出す」で記録をひとつのファイルに。',
                'It has been over two weeks since your last export — 書き出す below keeps the whole record in one file.',
              )
            : tx(
                '記録はこの端末だけにある。下の「書き出す」でひとつのファイルに残せる。',
                'Your record lives only on this device so far — 書き出す below keeps it all in one file.',
              ),
        ),
      );
    }
  }
  if (S.taken.length && scheduler) {
    const due = srsDueItems();
    const f = srsForecast();
    // the two lines must tell one story: when nothing is due at this moment
    // but cards still ripen before midnight, the quiet door says "right now"
    // and the forecast's first bucket says WHEN — never a flat 予定なし
    // sitting directly above a bare 今日 2
    const laterToday = !due.length && f.today > 0;
    const btn = biLabel(
      'button',
      due.length ? 'take review-start' : 'take review-start quiet',
      due.length ? `復習する — ${due.length} 件` : laterToday ? '復習する — いまは予定なし' : '復習する — 予定なし',
      due.length ? `review now — ${due.length} due` : laterToday ? 'nothing due right now' : 'nothing due yet',
    );
    btn.type = 'button';
    btn.id = 'review-start';
    btn.disabled = !due.length;
    btn.addEventListener('click', startReview);
    main.append(btn);
    if (f.today + f.tomorrow + f.week + f.fresh + f.unstarted > 0) {
      // 未着手 appears only when no-debt rows exist: the backlog is named,
      // never hidden and never turned into due cards by anyone but the learner
      const unstartedJa = f.unstarted ? ` ・ 未着手 ${f.unstarted}` : '';
      const unstartedEn = f.unstarted ? ` · not started ${f.unstarted}` : '';
      main.append(
        el(
          'p',
          'srs-forecast',
          tx(
            `${laterToday ? '今日このあと' : '今日'} ${f.today} ・ 明日 ${f.tomorrow} ・ 一週間 ${f.week} ・ 新規 ${f.fresh}${unstartedJa}`,
            `${laterToday ? 'later today' : 'today'} ${f.today} · tomorrow ${f.tomorrow} · this week ${f.week} · new ${f.fresh}${unstartedEn}`,
          ),
        ),
      );
    }
    // the review trace: the last seven days as they actually happened
    const totalReviews = Object.values(S.stats).reduce((a, s) => a + (s.n || 0), 0);
    if (totalReviews > 0) {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        days.push(S.stats[dayKey(d)]?.n || 0);
      }
      main.append(
        el(
          'p',
          'srs-forecast srs-trace',
          tx(`この7日 ${days.join('・')} ｜ 計 ${totalReviews}`, `last 7 days ${days.join(' · ')} | all time ${totalReviews}`),
        ),
      );
    }
    renderSrsPrefs(main);
    // one layer of the tutor's testing — absent without a key, and folded
    // away while an unfinished quiz still holds the room (POL-13)
    if (!S.aiQuiz && aiKey() && S.taken.filter((t) => t.t === 'word').length >= 4) {
      const qb = biLabel('button', 'chip aiq-start', '先生の小テスト', 'a quiz from the tutor');
      qb.type = 'button';
      qb.id = 'aiq-start';
      const note = el('p', 'airead-note');
      // 願いは一つ — the request in flight is STATE, not a closure. Held only
      // on the button and its note, it died with the next render: one EN／日本語
      // press re-armed the door, and a second request overwrote the quiz the
      // learner was in the middle of, taking their answers with it
      // (E3 round-B, ai-surfaces lens). Session-only by design — a reload
      // must never come back with a door sealed by a request that is gone.
      qb.disabled = !!S.aiQuizPending;
      note.textContent = S.aiQuizPending
        ? tx('先生が問題を書いている…', 'the tutor is writing questions…')
        : S.aiQuizNote === 'ready'
          ? tx('小テストの用意ができた。', 'the quiz is ready')
          : S.aiQuizNote === 'failed'
            ? tx('いまは作れない。あとでもう一度。', 'The tutor could not write a quiz just now — try again in a moment.')
            : '';
      qb.addEventListener('click', async () => {
        if (S.aiQuizPending) return;
        // the room the learner asked from is the VIEW AND ITS DEPTH: an entry
        // sheet opened from the tray leaves S.view at 'tray', so watching the
        // view alone let the quiz take the room under an open sheet
        // (E3 round-B, ai-surfaces lens)
        S.aiQuizPending = { view: S.view, depth: S.stack.length };
        S.aiQuizNote = null;
        qb.disabled = true;
        note.textContent = tx('先生が問題を書いている…', 'the tutor is writing questions…');
        try {
          await aiQuizStart();
          const asked = S.aiQuizPending;
          S.aiQuizPending = null;
          // a reply can arrive ten seconds later, by which time the learner
          // may be deep in an article: the quiz waits for them where they
          // asked for it rather than seizing the room they walked to
          // (E3 round-A, AI lens). The written quiz is already durable, so
          // the resume row is the door back into it from anywhere.
          if (!asked || S.view !== asked.view || S.stack.length !== asked.depth) {
            S.aiQuizNote = 'ready';
            render();
            return;
          }
          S.view = 'aiquiz';
          render();
          window.scrollTo(0, 0);
          return;
        } catch {
          S.aiQuizPending = null;
          S.aiQuizNote = 'failed';
        }
        render();
      });
      main.append(qb, note);
    }
  }
  // POL-13 · a quiz that was left mid-run survives reload: the way back in
  // stands here — no new request, the tutor's written questions intact —
  // with a quiet やめる beside it. No key and no deck are needed to finish
  // what is already on the device, so the row lives outside every gate.
  if (S.aiQuiz) {
    const qrow = el('div', 'aiq-resume-row');
    const qb = biLabel('button', 'chip aiq-start', '先生の小テスト — 続きから', "resume the tutor's quiz");
    qb.type = 'button';
    qb.id = 'aiq-resume';
    qb.addEventListener('click', () => {
      S.view = 'aiquiz';
      render();
      window.scrollTo(0, 0);
    });
    const drop = biLabel('button', 'chip aiq-drop', 'やめる', 'let it go');
    drop.type = 'button';
    drop.id = 'aiq-drop';
    drop.addEventListener('click', () => {
      aiQuizCommit(null);
      render();
    });
    qrow.append(qb, drop);
    main.append(qrow);
  }
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
    // a fresh device is exactly where bringing a record back matters most
    renderPortRow(main);
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
  // つくる — a list is born HERE on the lists surface, with a quiet inline
  // field. window.prompt was the only door, and only from inside an entry
  // (P2, full-instrument review).
  const maker = el('div', 'list-maker');
  const nameField = el('input', 'list-maker-field');
  nameField.type = 'text';
  nameField.id = 'list-maker-field';
  nameField.placeholder = tx('新しいリストの名前', 'name a new list');
  nameField.setAttribute('aria-label', tx('新しいリストの名前', 'name for a new list'));
  const makeBtn = biLabel('button', 'chip list-maker-make', '＋ 作る', 'create');
  makeBtn.type = 'button';
  makeBtn.id = 'list-maker-make';
  const tryMake = () => {
    const name = nameField.value.trim();
    if (!name || owns(S.lists, name)) {
      nameField.setAttribute('aria-invalid', 'true');
      nameField.value = '';
      nameField.placeholder = name
        ? tx('その名はもうある', 'that name already exists')
        : tx('名前を入れて', 'give it a name');
      nameField.focus();
      return;
    }
    const next = { ...S.lists };
    setOwnRecordValue(next, name, []);
    if (commitStorePatch({ lists: next })) render();
  };
  makeBtn.addEventListener('click', tryMake);
  nameField.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') tryMake();
  });
  maker.append(nameField, makeBtn);
  main.append(maker);
  const dueKeys = new Set(srsDueItems().map((i) => srsKey(i.t, i.id)));
  for (const sec of sections) {
    const head = el('p', 'eyebrow list-head');
    head.append(document.createTextNode(`${sec.name} — ${sec.items.length}`));
    if (bi()) head.append(el('span', 'en-inline', sec.manual ? 'named list' : 'auto · monthly'));
    // the filtered deck, one tap wide: review only what is due in this list
    const dueHere = sec.items.filter((i) => dueKeys.has(srsKey(i.t, i.id)));
    if (dueHere.length && scheduler) {
      const only = el('button', 'chip list-review', tx(`この組だけ ${dueHere.length}`, `just these — ${dueHere.length}`));
      only.type = 'button';
      only.dataset.listReview = sec.name;
      only.addEventListener('click', () => startReview(sec.items));
      head.append(only);
    }
    if (sec.manual) {
      // 直す・消す — rename and delete live where the list lives; deleting a
      // list never touches its items' taken status (the list is curation,
      // the deck is the deck)
      const ren = el('button', 'list-op', '✎');
      ren.type = 'button';
      ren.setAttribute('aria-label', tx(`「${sec.name}」の名前を変える`, `rename ${sec.name}`));
      ren.addEventListener('click', () => {
        S.listRename = S.listRename === sec.name ? null : sec.name;
        render();
      });
      const armed = S.listDeleteArm === sec.name;
      const del = el('button', armed ? 'list-op armed' : 'list-op', armed ? tx('消す？', 'sure?') : '×');
      del.type = 'button';
      del.setAttribute(
        'aria-label',
        armed ? tx(`「${sec.name}」を本当に消す`, `really delete ${sec.name}`) : tx(`「${sec.name}」を消す`, `delete ${sec.name}`),
      );
      del.addEventListener('click', () => {
        if (S.listDeleteArm !== sec.name) {
          S.listDeleteArm = sec.name;
          render();
          setTimeout(() => {
            if (S.listDeleteArm === sec.name) {
              S.listDeleteArm = null;
              render();
            }
          }, 3200);
          return;
        }
        S.listDeleteArm = null;
        const next = { ...S.lists };
        delete next[sec.name];
        commitStorePatch({ lists: next });
        render();
      });
      head.append(ren, del);
    }
    main.append(head);
    if (sec.manual && S.listRename === sec.name) {
      const row = el('div', 'list-maker list-rename');
      const field = el('input', 'list-maker-field');
      field.type = 'text';
      field.value = sec.name;
      field.setAttribute('aria-label', tx('新しい名前', 'new name'));
      const save = biLabel('button', 'chip list-maker-make', '保存', 'save');
      save.type = 'button';
      const trySave = () => {
        const name = field.value.trim();
        if (!name || (name !== sec.name && owns(S.lists, name))) {
          field.setAttribute('aria-invalid', 'true');
          field.focus();
          return;
        }
        const next = {};
        for (const [k, v] of Object.entries(S.lists)) setOwnRecordValue(next, k === sec.name ? name : k, v);
        S.listRename = null;
        if (commitStorePatch({ lists: next })) render();
      };
      save.addEventListener('click', trySave);
      field.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') trySave();
        if (ev.key === 'Escape') {
          S.listRename = null;
          render();
        }
      });
      row.append(field, save);
      main.append(row);
    }
    for (const item of sec.items) {
      // the row IS the door to the entry, so it must answer a keyboard the
      // way every other door does — it was a click-handled div, invisible to
      // Tab and to a screen reader (E3 round-A, a11y lens). It stays a div
      // (it CONTAINS the rest/start button; a button inside a button is the
      // invalid nesting R2-C just repaired on the shelf) and takes the role,
      // the tab stop, and Enter/Space instead.
      const line = el('div', 'tray-line');
      line.tabIndex = 0;
      line.setAttribute('role', 'button');
      line.append(el('span', 'w', item.label));
      // rows stored before the kind fields existed heal at render time
      const kindJa = item.kind || NODE_KIND[item.t]?.[0] || '';
      const kindEn = item.kindEn || item.kind || NODE_KIND[item.t]?.[1] || '';
      line.append(el('span', 'pool-tag', tx(kindJa, kindEn)));
      if (isLeech(item)) line.append(el('span', 'pool-tag read-tag', tx('苦手', '苦手 struggling')));
      line.append(el('span', 'when', srsWhen(item)));
      const key = srsKey(item.t, item.id);
      if (!S.srs[key] && !finiteNumber(item.started) && !S.suspended[key]) {
        // a no-debt row (legacy or imported) wakes by hand: one quiet
        // affordance in the row itself, and only this press mints the card
        // into the review cycle — 始める is the explicit promotion
        const start = el('button', 'rest-toggle srs-start', tx('始める', 'start'));
        start.type = 'button';
        start.dataset.srsStart = key;
        start.setAttribute('aria-label', tx(`「${item.label}」の復習を始める`, `start learning ${item.label}`));
        start.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const taken = S.taken.map((t) => (t === item ? { ...t, started: Date.now() } : t));
          if (commitStorePatch({ taken })) render();
        });
        line.append(start);
      } else {
        // rest / wake — the card stays on the list, reviews skip it
        const rest = el('button', S.suspended[key] ? 'rest-toggle resting' : 'rest-toggle', S.suspended[key] ? '▶' : '⏸');
        rest.type = 'button';
        rest.setAttribute('aria-label', S.suspended[key] ? tx('復習にもどす', 'wake this card') : tx('休ませる', 'rest this card'));
        rest.addEventListener('click', (ev) => {
          ev.stopPropagation();
          // rest/wake is deck state: it rides the guarded boundary, so a
          // failed persist changes nothing (the alert names the failure)
          const suspended = { ...S.suspended };
          if (suspended[key]) delete suspended[key];
          else suspended[key] = Date.now();
          if (commitStorePatch({ suspended })) render();
        });
        line.append(rest);
      }
      const openRow = () => go({ t: item.t, id: item.id });
      line.setAttribute('aria-label', tx(`${item.label} の全項目`, `${item.label} — full entry`));
      line.addEventListener('click', openRow);
      line.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        // the row's own controls keep their keys
        if (ev.target !== line) return;
        ev.preventDefault();
        openRow();
      });
      main.append(line);
    }
  }

  renderPortRow(main);
}

/* The record is yours to carry: one plain JSON file out, the same file
 * back in on any device. The API key never travels — it lives outside
 * this store, and exporting must never leak it. Import replaces
 * wholesale (the honest semantic: the file IS the record), then the app
 * reboots clean on the imported state. */
function renderPortRow(main) {
  const port = el('div', 'port-row');
  const exp = biLabel('button', 'chip', '書き出す', 'export your record');
  exp.type = 'button';
  exp.id = 'export-store';
  exp.addEventListener('click', async () => {
    // 記録はまるごと — the file is the record, so it carries the AI archive
    // too. It did not: the archive lives in IndexedDB, outside the envelope,
    // while the import cleared it unconditionally. So a learner who exported
    // and imported their own record — the backup the tray nudges them to
    // make — lost every conversation they had ever had
    // (E3 round-C, ai-surfaces lens).
    const record = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    const archive = await aiLogAll().catch(() => []);
    if (archive.length) record.aiArchive = archive;
    const blob = new Blob([JSON.stringify(record)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kairo-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    // remember when the record last left the device — the tray's quiet backup
    // reminder counts from here; the copy-then-commit keeps the live stats
    // untouched when the device cannot save (the export itself already left)
    commitStorePatch({ stats: { ...(S.stats || {}), lastExportTs: Date.now() } });
  });
  const imp = biLabel('button', 'chip', '読み込む', 'import a record');
  imp.type = 'button';
  imp.id = 'import-store';
  const file = el('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.hidden = true;
  file.id = 'import-file';
  const portNote = el('p', 'airead-note');
  imp.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      // R3-D · the quiet counterpart door: a parameter file from
      // tools/fsrs-optimize.mjs (the dry-run report or its candidate pin)
      // lands as the learner's own scheduler weights — validated fail-closed
      // by the same gate the boot applies, committed through the guarded
      // boundary, then the app reboots so the scheduler is rebuilt on what
      // was accepted. Nothing else in the record is touched.
      const candidate = plainRecord(s) && plainRecord(s.candidatePin) ? s.candidatePin : s;
      if (plainRecord(candidate) && owns(candidate, 'w') && !owns(candidate, 'taken')) {
        const fitted = {
          w: candidate.w,
          source: `${nonEmptyString(candidate.parameterSetId) ? candidate.parameterSetId : 'fsrs-optimize'} @ ${new Date().toISOString()}`,
        };
        const reviews = s.input?.trainingReviews;
        if (Number.isInteger(reviews) && reviews > 0) fitted.basedOnReviews = reviews;
        if (candidate.algorithm !== 'FSRS-6' || srsParamsProblem(fitted)) {
          portNote.textContent = tx(
            'このパラメータは読めない。fsrs-optimize の出力をそのまま。',
            'Those parameters could not be read — use a tools/fsrs-optimize.mjs output, unchanged.',
          );
          return;
        }
        if (commitStorePatch({ srsPrefs: { ...S.srsPrefs, fsrs: fitted } })) location.reload();
        return;
      }
      // 検める前に消さない — the import gate must be the SAME gate the boot
      // applies. It checked only that `taken` was an array, so a file the
      // boot validator rejects (a future `v`, one malformed card) overwrote
      // a good record and the app came back read-only, holding an empty deck
      // with the learner's real record already gone
      // (E3 round-B, srs-wiring lens). Nothing is destroyed to find out that
      // the replacement is unreadable.
      if (!validStoreEnvelope(s)) {
        portNote.textContent = tx(
          'この記録はこのアプリでは読めない。取り込みは中止した — いまの記録はそのまま。',
          'This app cannot read that record, so nothing was imported — your current record is untouched.',
        );
        return;
      }
      // The file IS the record — so everything the old record owned goes with
      // it, and everything the FILE owns comes with it. The AI archive lives
      // in IndexedDB, outside the envelope: an import used to leave the
      // previous learner's conversations under the new record (round A), and
      // then to destroy conversations the file had never carried (round C).
      // Both ends are answered here, and the swap is a transaction — the old
      // words are held in memory until the new ones are safely in, and put
      // back untouched if anything fails.
      const incoming = Array.isArray(s.aiArchive) ? s.aiArchive : [];
      const record = { ...s };
      delete record.aiArchive; // the archive is not a learner-store root
      const previous = await aiLogAll().catch(() => null);
      try {
        await clearAiArchive();
      } catch {
        portNote.textContent = tx(
          '前の記録の会話を消せなかった。取り込みは中止した。',
          "The previous record's conversations could not be cleared, so nothing was imported.",
        );
        return;
      }
      try {
        await aiLogRestore(incoming);
      } catch {
        if (previous) await aiLogRestore(previous).catch(() => {});
        portNote.textContent = tx(
          'この記録の会話を書き戻せなかった。取り込みは中止した — 元の会話はそのまま。',
          "The conversations in that record could not be written back, so nothing was imported — your own are untouched.",
        );
        return;
      }
      localStorage.setItem(STORE_KEY, JSON.stringify(record));
      location.reload();
    } catch {
      portNote.textContent = tx('この形式は読めない。書き出したままの JSON を。', 'That file could not be read — use a record exported from here, unchanged.');
    }
  });
  port.append(exp, imp, file);
  main.append(port, portNote);
}

/* --------------------------------------------------- JLPT · 漢検 lanes
 * Training lanes over the layers the corridor already carries: JLPT words
 * from the dictionary's own levels, 漢検 kanji from the kanken table. Each
 * lane knows how much of it is already being memorized, opens its members
 * as ordinary entry sheets, and can hand the next twenty unmemorized items
 * to the tray — capture that becomes cards without labor.
 * N1 words are not in this layer yet; the lane says so instead of hiding. */
const JLPT_LANES = ['N5', 'N4', 'N3', 'N2', 'N1'];
const KANKEN_LANES = ['10級', '9級', '8級', '7級', '6級', '5級', '4級', '3級', '準2級', '2級', '準1級', '1級'];
let LANE_CACHE = null;
function laneMembers() {
  if (LANE_CACHE) return LANE_CACHE;
  const jlpt = Object.fromEntries(JLPT_LANES.map((l) => [l, []]));
  for (const [w, rec] of Object.entries(D.dict)) if (rec.jlpt && jlpt[rec.jlpt]) jlpt[rec.jlpt].push(w);
  for (const l of JLPT_LANES) jlpt[l].sort();
  const kanken = Object.fromEntries(KANKEN_LANES.map((l) => [l, []]));
  for (const [c, rec] of Object.entries(D.kanken)) if (kanken[rec.kk]) kanken[rec.kk].push(c);
  for (const l of KANKEN_LANES) kanken[l].sort();
  LANE_CACHE = { jlpt, kanken };
  return LANE_CACHE;
}
function renderLane(main, title, en, ids, t) {
  const takenSet = new Set(S.taken.map((i) => srsKey(i.t, i.id)));
  const mem = ids.filter((id) => takenSet.has(srsKey(t, id))).length;
  const head = el('p', 'eyebrow list-head');
  head.append(document.createTextNode(`${title} — ${ids.length}`));
  if (bi()) head.append(el('span', 'en-inline', en));
  main.append(head);
  if (!ids.length) {
    main.append(el('div', 'sem-empty', tx('この級の語はこの層にまだない。', 'Not in this layer yet.')));
    return;
  }
  main.append(
    el('p', 'card-kind', tx(`覚えている ${mem} / ${ids.length}`, `memorizing ${mem} of ${ids.length}`)),
  );
  // paper-dictionary chips: a kanji headword shows its reading; a kana
  // headword would just repeat itself, so it shows its first sense instead
  const hasKanji = (s) => [...s].some((c) => c >= '一' && c <= '鿿');
  const label = (id) => {
    if (t !== 'word') return D.kanji[id]?.m || '';
    const rec = lookup(id);
    if (!rec) return '';
    return hasKanji(id) ? rec.r || '' : (rec.m && rec.m[0]) || '';
  };
  main.append(
    chipsFor(
      ids.slice(0, 18).map((id) => ({ label: id, sub: label(id) })),
      (item) => go({ t, id: item.label }),
      null,
      t,
    ),
  );
  if (ids.length > 18)
    main.append(el('p', 'card-kind', tx(`ほか ${ids.length - 18} 件はページから`, `${ids.length - 18} more open from their pages`)));
  const fresh = ids.filter((id) => !takenSet.has(srsKey(t, id)));
  if (fresh.length) {
    const btn = biLabel(
      'button',
      'take',
      `この級から ${Math.min(20, fresh.length)} 件を覚える`,
      `memorize the next ${Math.min(20, fresh.length)}`,
    );
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const kindRow = NODE_KIND[t];
      // the twenty mint as ONE committed batch — the copy persists before
      // the live deck sees any of them (P0-4)
      const taken = [
        ...S.taken,
        ...fresh
          .slice(0, 20)
          .map((id) => ({ t, id, label: id, kind: kindRow[0], kindEn: kindRow[1], from: null, ts: Date.now(), started: Date.now() })),
      ];
      if (commitStorePatch({ taken })) render();
    });
    main.append(btn);
  }
}
/* --------------------------------------------------------------- lessons
 * The Duolingo-class lane: small lessons cut from the JLPT word levels and
 * the 漢検 kanji grades the dictionary already carries. Each lesson teaches
 * its items plainly and quizzes them. Completion writes practice EVIDENCE
 * only — one obslog row per word, the score in lessonsDone — and the end
 * screen offers the one explicit door into 覚える, per word or all at once
 * (PR70-P0-1: exposure is not mastery, and a lesson finishing itself is
 * not the learner choosing retrieval). No default action: choose nothing
 * and the deck gains nothing. One shared learner model; no separate
 * notion of "known". */
const LESSON_SIZE = 10;
function lessonLaneIds(kind, lvl) {
  return (kind === 'kanji' ? laneMembers().kanken[lvl] : laneMembers().jlpt[lvl]) || [];
}
function lessonPlan(kind, lvl) {
  const ids = lessonLaneIds(kind, lvl);
  const out = [];
  for (let i = 0; i < ids.length; i += LESSON_SIZE) {
    const words = ids.slice(i, i + LESSON_SIZE);
    if (words.length < 4) break;
    out.push({ id: `${lvl}-${out.length + 1}`, lvl, kind, words });
  }
  return out;
}
function startLesson(lesson) {
  S.lessonsScroll = window.scrollY; // the list keeps the learner's place
  S.lessonRun = { ...lesson, ix: 0, phase: 'learn', correct: 0, picked: null, choices: null };
  render();
  window.scrollTo(0, 0);
}
/** Leave a run for the list — restoring the scroll the run began from. */
function endLessonRun() {
  S.lessonRun = null;
  render();
  window.scrollTo(0, S.lessonsScroll || 0);
}
/** The one-line meaning an item is quizzed on, by kind. */
function lessonGloss(kind, id) {
  return kind === 'kanji' ? D.kanji[id]?.m || '' : lookup(id)?.m?.[0] || '';
}
function lessonChoices(run) {
  const word = run.words[run.ix];
  const right = lessonGloss(run.kind, word);
  const pool = lessonLaneIds(run.kind, run.lvl).filter((w) => w !== word);
  const wrong = new Set();
  while (wrong.size < 3 && wrong.size < pool.length) {
    const cand = lessonGloss(run.kind, pool[Math.floor(Math.random() * pool.length)]);
    if (cand && cand !== right) wrong.add(cand);
  }
  const opts = [right, ...wrong];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { right, opts };
}
function renderLessons(main) {
  const run = S.lessonRun;
  main.append(withEn(el('p', 'eyebrow', 'レッスン'), 'lessons', 'en-inline'));
  if (!run) {
    main.append(el('h1', 'view-title', tx('入り口から、順に', 'From the entrance, in order')));
    const section = (kind, lvl, label) => {
      const plan = lessonPlan(kind, lvl);
      if (!plan.length) return;
      const done = plan.filter((l) => S.lessonsDone[l.id]).length;
      const head = el('p', 'eyebrow list-head');
      head.append(document.createTextNode(`${label} — ${done} / ${plan.length}`));
      if (bi()) head.append(el('span', 'en-inline', `${plan.length} lessons`));
      main.append(head);
      const next = plan.filter((l) => !S.lessonsDone[l.id]).slice(0, 5);
      for (const lesson of next) {
        const row = el('button', 'entry-row lesson-row');
        row.type = 'button';
        row.append(el('span', 'row-glyph', lesson.id.split('-')[1]));
        row.append(el('span', 'row-main', lesson.words.slice(0, 4).join('・') + (lesson.words.length > 4 ? '…' : '')));
        row.append(el('span', 'row-go', '›'));
        row.addEventListener('click', () => startLesson(lesson));
        main.append(row);
      }
      if (!next.length) main.append(el('p', 'card-kind', tx('この級はぜんぶ終わった。', 'Every lesson at this level is done.')));
    };
    for (const lvl of JLPT_LANES) section('word', lvl, lvl);
    main.append(withEn(el('p', 'eyebrow', '漢検 — 字のレッスン'), 'kanji lessons, by 漢検 grade', 'en-inline'));
    for (const lvl of KANKEN_LANES) section('kanji', lvl, `漢検 ${lvl}`);
    return;
  }
  // learn phase: one word at a time, plainly
  if (run.phase === 'learn') {
    const word = run.words[run.ix];
    const backc = reviewBack({ t: run.kind || 'word', id: word });
    main.append(el('p', 'card-kind', `${run.id} — ${run.ix + 1} / ${run.words.length}`));
    const face = el('div', 'review-face');
    face.append(el('div', 'review-front', word));
    if (backc.reading) face.append(el('div', 'review-reading', backc.reading));
    for (const m of backc.senses.slice(0, 3)) face.append(el('div', 'review-sense', m));
    const door = biLabel('button', 'chip', 'ページへ', 'full entry');
    door.type = 'button';
    door.addEventListener('click', () => go({ t: run.kind || 'word', id: word }));
    face.append(door);
    main.append(face);
    const btn = biLabel('button', 'take', run.ix + 1 < run.words.length ? 'つぎへ' : '小テストへ', run.ix + 1 < run.words.length ? 'next word' : 'to the quiz');
    btn.type = 'button';
    btn.id = 'lesson-next';
    btn.addEventListener('click', () => {
      if (run.ix + 1 < run.words.length) run.ix += 1;
      else { run.phase = 'quiz'; run.ix = 0; run.choices = null; }
      render();
    });
    main.append(btn);
    return;
  }
  // quiz phase: pick the meaning, honest marking, then on
  if (run.phase === 'quiz') {
    const word = run.words[run.ix];
    const backc = reviewBack({ t: run.kind || 'word', id: word });
    if (!run.choices) run.choices = lessonChoices(run);
    main.append(el('p', 'card-kind', tx(`小テスト — ${run.ix + 1} / ${run.words.length}`, `quiz — ${run.ix + 1} / ${run.words.length}`)));
    const face = el('div', 'review-face');
    face.append(el('div', 'review-front', word));
    if (run.picked != null && backc.reading) face.append(el('div', 'review-reading', backc.reading));
    main.append(face);
    const list = el('div', 'lesson-options');
    run.choices.opts.forEach((opt) => {
      const b = el('button', 'lesson-option');
      b.type = 'button';
      b.textContent = opt;
      if (run.picked != null) {
        if (opt === run.choices.right) b.classList.add('right');
        else if (opt === run.picked) b.classList.add('wrong');
        b.disabled = true;
      } else {
        b.addEventListener('click', () => {
          run.picked = opt;
          if (opt === run.choices.right) run.correct += 1;
          render();
        });
      }
      list.append(b);
    });
    main.append(list);
    if (run.picked != null) {
      const btn = biLabel('button', 'take', run.ix + 1 < run.words.length ? 'つぎへ' : 'おわりへ', run.ix + 1 < run.words.length ? 'next' : 'finish');
      btn.type = 'button';
      btn.id = 'lesson-next';
      btn.addEventListener('click', () => {
        // each answered word leaves its honest mark in the session run —
        // the completion commit files them all as evidence rows
        (run.results ||= [])[run.ix] = run.picked === run.choices.right ? 3 : 1;
        if (run.ix + 1 < run.words.length) { run.ix += 1; run.picked = null; run.choices = null; }
        else {
          // 稽古は記録、入門は選択 (PR70-P0-1): completion writes the score
          // and one practice-evidence obslog row per word as ONE commit —
          // zero deck rows, zero FSRS state. The way into 覚える is the
          // explicit choice on the end screen. A failed persist ends
          // nothing — the run stays, the alert speaks.
          const kt = run.kind || 'word';
          const now = Date.now();
          const lessonsDone = { ...S.lessonsDone, [run.id]: { score: run.correct, total: run.words.length, ts: now } };
          const obslog = [
            ...(S.obslog || []),
            ...run.words.map((w, i) => [now, 'lesson', srsKey(kt, w), run.results[i] === 3 ? 3 : 1, run.id]),
          ];
          if (!commitStorePatch({ lessonsDone, obslog })) {
            render();
            return;
          }
          run.phase = 'end';
        }
        render();
      });
      main.append(btn);
    }
    return;
  }
  // end: the honest score, the evidence named — and the ONE explicit door
  // into the deck (PR70-P0-1). Nothing enrolled itself: the run's practice
  // stands in the observation ledger; 覚える is a quiet choice, per word
  // or all at once, and choosing nothing adds nothing.
  main.append(el('h1', 'view-title', tx(`${run.correct} / ${run.words.length}`, `${run.correct} of ${run.words.length}`)));
  main.append(
    el(
      'p',
      'gloss',
      tx(
        '稽古は記録に残った。札にするかどうかは、ここで選ぶ — 選ばなければ、何も増えない。',
        'The practice is on the record. Whether a word becomes a card is chosen here — choose nothing, and nothing is added.',
      ),
    ),
  );
  const kt = run.kind || 'word';
  const inDeck = new Set(S.taken.map((i) => srsKey(i.t, i.id)));
  // an enroll is the learner's explicit promotion: the row carries the
  // started mark the moment it is chosen (R2-A), one guarded commit each
  const enrollRow = (w) => ({ t: kt, id: w, label: w, kind: NODE_KIND[kt][0], kindEn: NODE_KIND[kt][1], from: null, ts: Date.now(), started: Date.now() });
  const list = el('div', 'lesson-enroll');
  run.words.forEach((w, i) => {
    const row = el('div', 'lesson-enroll-row');
    const right = (run.results || [])[i] === 3;
    row.append(el('span', 'lesson-enroll-mark' + (right ? ' right' : ' wrong'), right ? '○' : '×'));
    row.append(el('span', 'lesson-enroll-word', w));
    const have = inDeck.has(srsKey(kt, w));
    const b = biLabel('button', have ? 'chip lesson-enroll-one on' : 'chip lesson-enroll-one', have ? '覚える ✓' : '覚える', have ? 'memorizing' : 'memorize');
    b.type = 'button';
    b.dataset.enroll = w;
    b.disabled = have;
    if (!have) {
      b.addEventListener('click', () => {
        if (commitStorePatch({ taken: [...S.taken, enrollRow(w)] })) render();
      });
    }
    row.append(b);
    list.append(row);
  });
  main.append(list);
  const freshWords = run.words.filter((w) => !inDeck.has(srsKey(kt, w)));
  if (freshWords.length) {
    const all = biLabel(
      'button',
      'chip lesson-enroll-all',
      `ぜんぶ覚える — ${freshWords.length} 件`,
      `memorize all ${freshWords.length}`,
    );
    all.type = 'button';
    all.id = 'lesson-enroll-all';
    all.addEventListener('click', () => {
      // exactly the not-yet-chosen words, as ONE committed batch (P0-4)
      if (commitStorePatch({ taken: [...S.taken, ...freshWords.map(enrollRow)] })) render();
    });
    main.append(all);
  }
  const again = biLabel('button', 'take', 'レッスン一覧へ', 'back to lessons');
  again.type = 'button';
  again.addEventListener('click', endLessonRun);
  main.append(again);
}

/* The one place the app asks for a key — once, plainly, stored on-device. */
/* The tutor's quiz — the operator's 'many layers of testing', first layer.
 * The tutor writes five questions from the learner's own memorize list;
 * the app renders and scores them like a lesson quiz. Testing only:
 * nothing here writes to the SRS — FSRS alone schedules. The strict-JSON
 * contract is parsed defensively; a malformed reply degrades to the same
 * quiet one-line failure as every other tutor door. The RUN is durable
 * (POL-13): every step commits, so a mid-quiz reload resumes with not a
 * word of the tutor's lost; only the learner's own door closes it. */
function aiQuizParse(raw) {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return null;
  let qs;
  try {
    qs = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(qs)) return null;
  const ok = qs.filter(
    (q) =>
      q &&
      typeof q.q === 'string' &&
      Array.isArray(q.opts) &&
      q.opts.length === 4 &&
      q.opts.every((o) => typeof o === 'string') &&
      Number.isInteger(q.right) &&
      q.right >= 0 &&
      q.right < 4 &&
      typeof q.why === 'string',
  );
  return ok.length >= 3 ? ok.slice(0, 5) : null;
}
/** POL-13 · every quiz step crosses the durability boundary, so a reload
 * lands back exactly where the learner stood. A device that cannot save
 * keeps the quiz alive in memory — the storage alert speaks, the learner
 * still finishes; only durability is lost, never the words. */
function aiQuizCommit(next) {
  if (!commitStorePatch({ aiQuiz: next })) S.aiQuiz = next;
}
async function aiQuizStart() {
  const words = S.taken.filter((t) => t.t === 'word').slice(-14).map((t) => t.id);
  const raw = await aiAsk(
    'You write a short quiz inside a Japanese-learning app. Output ONLY a JSON array, no prose, no markdown fences. Five items, each exactly {"q": string, "opts": [4 strings], "right": 0-3, "why": string}. Each q is one short Japanese question or cloze sentence (with readings in parentheses for kanji above the learner\'s level) testing one of the given words in context; opts are four plausible answers in Japanese or English; right is the index of the correct one; why is one short English sentence explaining it. Vary the words tested.',
    `Learner level: about JLPT ${aiLevelGuess()}. Words to test: ${words.join('、')}.`,
    { surface: 'quiz' },
  );
  const qs = aiQuizParse(raw);
  if (!qs) throw new Error('shape');
  aiQuizCommit({ qs, ix: 0, picked: null, correct: 0, ts: Date.now() });
}
function renderAiQuiz(main) {
  const run = S.aiQuiz;
  main.append(withEn(el('p', 'eyebrow', '先生の小テスト'), "the tutor's quiz", 'en-inline'));
  if (!run) {
    S.view = 'tray';
    render();
    return;
  }
  if (run.ix >= run.qs.length) {
    main.append(el('h1', 'view-title', tx(`${run.correct} / ${run.qs.length}`, `${run.correct} of ${run.qs.length}`)));
    main.append(
      el('p', 'gloss', tx('採点だけ。予定は変わらない — 育てるのは復習のほう。', 'A score, nothing more — your review schedule is untouched. The reviews do the growing.')),
    );
    const out = biLabel('button', 'take', 'リストへ', 'back to lists');
    out.type = 'button';
    out.id = 'aiq-close';
    out.addEventListener('click', () => {
      // the learner's own door is the one thing that lets a quiz go
      aiQuizCommit(null);
      S.view = 'tray';
      render();
    });
    main.append(out);
    return;
  }
  const q = run.qs[run.ix];
  main.append(el('p', 'card-kind', tx(`${run.ix + 1} / ${run.qs.length}`, `${run.ix + 1} / ${run.qs.length}`)));
  main.append(el('div', 'review-face aiq-q', q.q));
  const list = el('div', 'lesson-options');
  q.opts.forEach((opt, i) => {
    const b = el('button', 'lesson-option');
    b.type = 'button';
    b.textContent = opt;
    if (run.picked != null) {
      if (i === q.right) b.classList.add('right');
      else if (i === run.picked) b.classList.add('wrong');
      b.disabled = true;
    } else {
      b.addEventListener('click', () => {
        // the pick commits before it shows (POL-13): a reload mid-question
        // reopens on the same marked answer and the same running score
        aiQuizCommit({ ...run, picked: i, correct: run.correct + (i === q.right ? 1 : 0) });
        render();
      });
    }
    list.append(b);
  });
  main.append(list);
  if (run.picked != null) {
    main.append(el('p', 'aiq-why', q.why));
    const btn = biLabel('button', 'take', run.ix + 1 < run.qs.length ? 'つぎへ' : 'おわりへ', run.ix + 1 < run.qs.length ? 'next' : 'finish');
    btn.type = 'button';
    btn.id = 'aiq-next';
    btn.addEventListener('click', () => {
      aiQuizCommit({ ...run, ix: run.ix + 1, picked: null });
      render();
    });
    main.append(btn);
  }
}

/* You speak to it — the operator's words. A small conversation with the
 * tutor on its own page: it knows your rough level and answers as a
 * teacher inside this app, not a search engine. The exchange is kept on
 * the device. The visible log renders from the durable archive — the old
 * 24-turn cap governs only the request window (and the localStorage
 * fallback), so turn 25 no longer destroys turn 1. */
const AI_CHAT_PAGE = 40; // turns unfolded per 前の会話 step
// pending lives beside the log, not in one render's closure: leaving the
// page mid-question and coming back must show the same 考え中 and the same
// sealed 送る, or the second send duplicates the question in the archive
const aiChatLog = { turns: null, loading: false, pending: false };

/** The log the chat renders: the archive once hydrated, else the store. */
function aiChatTurns() {
  return aiChatLog.turns || S.aiChat;
}

/** Hydrate the session's chat log from the archive, once. On the archive's
 * first-ever open, what survives of the old capped store seeds it — the
 * honest floor; turns the cap already destroyed are not backfilled. */
function aiChatHydrate() {
  if (aiChatLog.turns || aiChatLog.loading) return;
  aiChatLog.loading = true;
  aiLogAll('chat').then((rows) => {
    aiChatLog.loading = false;
    if (rows.length) {
      aiChatLog.turns = rows.map((r) => ({ role: r.role === 'user' ? 'user' : 'tutor', text: r.content }));
    } else {
      aiChatLog.turns = S.aiChat.map((t) => ({ role: t.role, text: t.text }));
      const { model } = aiProvider();
      for (const t of aiChatLog.turns) {
        aiLogAppend({ surface: 'chat', role: t.role, content: t.text, model, ts: Date.now() });
      }
    }
    // repaint only when the archive held more than the fallback window was
    // already showing — a same-length repaint would eat a half-typed draft
    if (S.view === 'ai' && aiChatLog.turns.length !== S.aiChat.length) render();
  });
}

function renderAiChat(main) {
  aiChatHydrate();
  const turns = aiChatTurns();
  main.append(withEn(el('p', 'eyebrow', '先生と話す'), 'talk with the tutor', 'en-inline'));
  const log = el('div', 'chat-log');
  // the whole transcript is at hand; the page renders the recent window and
  // unfolds earlier turns on request instead of re-inking hundreds at once
  const from = Math.max(0, turns.length - (S.aiChatShown || AI_CHAT_PAGE));
  if (from > 0) {
    const earlier = biLabel('button', 'chip chat-earlier', '前の会話', 'show earlier');
    earlier.type = 'button';
    earlier.id = 'chat-earlier';
    earlier.addEventListener('click', () => {
      S.aiChatShown = (S.aiChatShown || AI_CHAT_PAGE) + AI_CHAT_PAGE;
      render();
    });
    log.append(earlier);
  }
  for (const turn of turns.slice(from)) {
    log.append(el('p', turn.role === 'user' ? 'chat-turn me' : 'chat-turn tutor', turn.text));
  }
  if (!turns.length) {
    log.append(
      el(
        'p',
        'chat-empty',
        tx(
          'ことば・文法・勉強のことなら何でも。日本語でも英語でも。',
          'Ask anything about words, grammar, or how to study — in Japanese or English.',
        ),
      ),
    );
  }
  main.append(log);
  const row = el('div', 'chat-row');
  const input = el('input', 'search-field chat-field');
  input.type = 'text';
  input.id = 'chat-input';
  input.autocomplete = 'off';
  input.placeholder = tx('先生に聞く…', 'ask the tutor…');
  // a question typed while the tutor was thinking was destroyed the moment
  // the reply painted — the render rebuilt an empty field and handed focus
  // back to it (E3 round-B, ai-surfaces lens). The draft rides the render.
  if (S.aiChatDraft) input.value = S.aiChatDraft;
  input.addEventListener('input', () => {
    S.aiChatDraft = input.value;
  });
  const send = biLabel('button', 'take chat-send', '送る', 'send');
  send.type = 'button';
  send.id = 'chat-send';
  if (aiChatLog.pending) {
    send.disabled = true;
    const thinking = el('p', 'chat-turn tutor thinking', tx('考え中…', 'thinking…'));
    log.append(thinking);
  }
  const ask = async () => {
    const text = input.value.trim();
    if (!text || send.disabled || aiChatLog.pending) return;
    // the request-window copy commits BEFORE the turn travels; a device
    // that cannot save keeps the message in the field, told why by the alert
    if (!commitStorePatch({ aiChat: [...S.aiChat, { role: 'user', text }] })) return;
    if (aiChatLog.turns) aiChatLog.turns.push({ role: 'user', text });
    input.value = '';
    S.aiChatDraft = '';
    send.disabled = true;
    aiChatLog.pending = true;
    const thinking = el('p', 'chat-turn tutor thinking', tx('考え中…', 'thinking…'));
    log.append(thinking);
    thinking.scrollIntoView({ block: 'nearest' });
    try {
      // the REQUEST window stays bounded; the durable archive holds the whole
      const turns = S.aiChat.slice(-8).map((t) => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text }));
      const reply = await aiConverse(
        `You are the tutor inside a Japanese-learning app. The learner reads at about JLPT ${aiLevelGuess()}. Answer as a patient teacher in under 130 words of plain text — no headers, no markdown. Use Japanese the learner can read at their level (add readings in parentheses for hard kanji), and English where it helps. If asked something outside Japanese language or study, gently steer back.`,
        turns,
        { surface: 'chat' },
      );
      // if the window's commit fails the reply still stands in the durable
      // archive and the rendered transcript; only the bounded request
      // context misses it — the alert names the storage failure
      commitStorePatch({ aiChat: [...S.aiChat, { role: 'tutor', text: reply }] });
      if (aiChatLog.turns) aiChatLog.turns.push({ role: 'tutor', text: reply });
    } catch {
      const line = tx('いまは答えられない。あとでもう一度。', 'The tutor could not answer just now — try again in a moment.');
      commitStorePatch({ aiChat: [...S.aiChat, { role: 'tutor', text: line }] });
      if (aiChatLog.turns) aiChatLog.turns.push({ role: 'tutor', text: line });
      // the app's own line rides the archive too, marked as the app's
      aiLogAppend({ surface: 'chat', role: 'app', content: line, model: aiProvider().model, ts: Date.now() });
    }
    aiChatLog.pending = false;
    send.disabled = false;
    S.sheetFocus = 'chat-input';
    // whatever was typed while the tutor thought is still in the live field;
    // carry it into the render that is about to replace that field
    S.aiChatDraft = input.value;
    render();
    document.getElementById('chat-input')?.focus();
    document.querySelector('.chat-log')?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  };
  send.addEventListener('click', ask);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ask();
  });
  row.append(input, send);
  main.append(row);
}

function renderAiSetup(main) {
  main.append(withEn(el('p', 'eyebrow', '先生'), 'the tutor', 'en-inline'));
  if (aiKey()) {
    main.append(el('h1', 'view-title', '先生'));
    renderAiChat(main);
    main.append(withEn(el('p', 'eyebrow key-head', '鍵'), 'the key', 'en-inline'));
  } else {
    main.append(el('h1', 'view-title', tx('AIを招く', 'Invite the tutor')));
  }
  main.append(
    el(
      'p',
      'gloss',
      tx(
        '鍵はこの端末にだけ保存される。api.anthropic.com 以外へは送られない。鍵があると、語のページに「先生に聞く」の戸が現れる。',
        'Your API key is stored on this device only, and sent nowhere but api.anthropic.com. With a key, an "ask the tutor" door appears on every word page — without one, nothing changes.',
      ),
    ),
  );
  const input = el('input', 'search-field');
  input.type = 'password';
  input.id = 'ai-key-input';
  input.placeholder = 'sk-ant-…';
  input.autocomplete = 'off';
  input.value = aiKey();
  main.append(input);
  const save = biLabel('button', 'take', '保存する', 'save on this device');
  save.type = 'button';
  save.id = 'ai-key-save';
  save.addEventListener('click', () => {
    try {
      const v = input.value.trim();
      if (v) localStorage.setItem(AI_KEY_STORE, v);
      else localStorage.removeItem(AI_KEY_STORE);
    } catch {
      /* private mode — the key simply doesn't persist */
    }
    S.view = 'shelf';
    render();
  });
  main.append(save);
  if (aiKey()) {
    const rm = biLabel('button', 'take taken', '鍵を消す', 'remove the key');
    rm.type = 'button';
    rm.addEventListener('click', () => {
      try {
        localStorage.removeItem(AI_KEY_STORE);
      } catch {
        /* nothing to remove */
      }
      S.view = 'shelf';
      render();
    });
    main.append(rm);
  }
}

function renderLevels(main) {
  main.append(withEn(el('p', 'eyebrow', '級で学ぶ'), 'study by level', 'en-inline'));
  main.append(el('h1', 'view-title', tx('JLPT と 漢検', 'JLPT and 漢検 lanes')));
  const lanes = laneMembers();
  main.append(withEn(el('p', 'eyebrow', 'JLPT'), 'the five levels', 'en-inline'));
  for (const l of JLPT_LANES) renderLane(main, l, `JLPT ${l}`, lanes.jlpt[l], 'word');
  main.append(withEn(el('p', 'eyebrow', '漢検'), 'kanji kentei, 10級 → 1級', 'en-inline'));
  for (const l of KANKEN_LANES) renderLane(main, `漢検 ${l}`, l, lanes.kanken[l], 'kanji');
}

/* ------------------------------------------------------------ 四字熟語
 * The four-character idioms as their own shelf — 900 of them, ordered by
 * reading like a paper compendium, with one quiet filter box. Every row
 * opens the same idiom entry the kanji pages open. */
function renderYoji(main) {
  main.append(withEn(el('p', 'eyebrow', '四字熟語'), 'four-character idioms', 'en-inline'));
  main.append(el('h1', 'view-title', '四字熟語'));
  const all = Object.values(D.idioms)
    .filter((i) => i.yoji)
    .sort((a, b) => (a.r < b.r ? -1 : a.r > b.r ? 1 : 0));
  const sub = el('p', 'shelf-snippet intro');
  sub.textContent = tx(
    `${all.length} 語。読みの順。どの語も項目へひらく。`,
    `${all.length} idioms, in reading order — any row opens its full entry.`,
  );
  main.append(sub);
  const filter = el('input', 'search-field');
  filter.id = 'yoji-filter';
  filter.type = 'search';
  filter.placeholder = tx('しぼる — 字でも読みでも', 'narrow — by character or reading');
  filter.autocomplete = 'off';
  filter.value = S.yojiQ || '';
  let deb = null;
  filter.addEventListener('input', () => {
    S.yojiQ = filter.value;
    clearTimeout(deb);
    deb = setTimeout(() => {
      document.getElementById('yoji-body')?.replaceWith(renderYojiBody(all));
    }, 120);
  });
  main.append(filter);
  main.append(renderYojiBody(all));
}
function renderYojiBody(all) {
  const body = el('div');
  body.id = 'yoji-body';
  const q = (S.yojiQ || '').trim();
  const hits = q ? all.filter((i) => i.w.includes(q) || i.r.includes(q)) : all;
  const CAP = 80;
  if (q || hits.length !== all.length || hits.length > CAP) {
    body.append(
      el('p', 'card-kind', hits.length > CAP ? tx(`${hits.length} 語 — 先頭 ${CAP} 語`, `${hits.length} idioms — first ${CAP} shown`) : tx(`${hits.length} 語`, `${hits.length} idioms`)),
    );
  }
  for (const i of hits.slice(0, CAP)) {
    const row = el('button', 'entry-row compound');
    row.type = 'button';
    row.dataset.yoji = i.w;
    const stack = el('span', 'row-stack');
    const top = el('span', 'row-word');
    top.append(document.createTextNode(i.w));
    top.append(el('span', 'row-reading', i.r));
    stack.append(top);
    if (i.g?.[0]) stack.append(el('span', 'row-gloss', i.g[0]));
    row.append(stack, el('span', 'row-go', '›'));
    row.addEventListener('click', () => go({ t: 'idiom', id: i.w }));
    body.append(row);
  }
  if (!hits.length) body.append(el('div', 'sem-empty', tx('その形の語はない。', 'No idiom matches that.')));
  return body;
}

/* ------------------------------------------------------------- 字引
 * The paper kanji dictionary's defining tool: finding a character you can
 * see but cannot read. Two axes, combinable — the component it is built
 * from (ordered by the component's own stroke count, as the paper indexes
 * are) and the character's total stroke count. Every hit opens the same
 * kanji entry as everywhere else. */
function renderKanjidex(main) {
  S.kdx ||= {};
  if (typeof S.kdx.mode !== 'string') S.kdx.mode = 'parts';
  if (!Array.isArray(S.kdx.parts)) S.kdx.parts = S.kdx.part ? [S.kdx.part] : [];
  main.append(withEn(el('p', 'eyebrow', '字を引く'), 'find a kanji you cannot read', 'en-inline'));
  main.append(el('h1', 'view-title', '字引'));

  // one door, several lenses (operator 2026-08-10, KKLD tab model): the parts
  // picker, a draw canvas, reading, meaning, and stroke count — every hit
  // opens the same kanji entry as everywhere else.
  const LENSES = [
    ['parts', '部品', 'by its parts'],
    ['draw', '手書き', 'draw it'],
    ['reading', '音訓', 'by reading'],
    ['meaning', '意味', 'by meaning'],
    ['strokes', '画数', 'by strokes'],
  ];
  const lensRow = el('div', 'kdx-lenses');
  for (const [id, ja, en] of LENSES) {
    const b = el('button', S.kdx.mode === id ? 'kdx-lens on' : 'kdx-lens');
    // which one is chosen is STATE, not a colour — the tree reported plain
    // buttons (E3 round-C, a11y lens; the same defect round A fixed on one
    // control and round B on two more)
    b.setAttribute('aria-pressed', String(S.kdx.mode === id));
    // the selected lens said so only in a class and a colour — and that
    // colour fell to 2.85:1 in the dark worlds (E3 round-A, a11y lens).
    // The state is spoken now; the CSS carries the contrast.
    b.setAttribute('aria-pressed', String(S.kdx.mode === id));
    b.type = 'button';
    b.append(el('span', 'l-ja', ja));
    if (bi()) b.append(el('span', 'en-sub', en));
    b.addEventListener('click', () => {
      S.kdx.mode = id;
      render();
      window.scrollTo(0, 0);
    });
    lensRow.append(b);
  }
  main.append(lensRow);

  if (S.kdx.mode === 'draw') renderKdxDraw(main);
  else if (S.kdx.mode === 'reading') renderKdxText(main, 'reading');
  else if (S.kdx.mode === 'meaning') renderKdxText(main, 'meaning');
  else if (S.kdx.mode === 'strokes') renderKdxStrokes(main);
  else renderKdxParts(main);
}

/** The shared results grid — every hit opens the same kanji entry. */
function renderKdxGrid(host, chars, CAP = 200) {
  host.append(
    withEn(
      el('p', 'eyebrow', `見つかった字 — ${chars.length}`),
      chars.length > CAP ? `found — first ${CAP} shown` : 'found',
      'en-inline',
    ),
  );
  if (!chars.length) {
    host.append(el('div', 'sem-empty', tx('この条件の字はない。', 'No character matches that yet.')));
    return;
  }
  const grid = el('div', 'kdx-grid');
  for (const c of chars.slice(0, CAP)) {
    const b = el('button', 'kdx-glyph', c);
    b.type = 'button';
    b.dataset.kdxHit = c;
    if (D.kanji[c]) b.setAttribute('aria-label', D.kanji[c].m);
    b.addEventListener('click', () => go({ t: 'kanji', id: c }));
    grid.append(b);
  }
  host.append(grid);
}

/* 部品 — multi-radical. Tap several parts you can see; the set narrows to
 * kanji containing ALL of them, and components that can no longer co-occur
 * grey out. A filter names the grid — Jisho's single most-hated screen is its
 * unlabelled radical wall; this one you can search and it collapses as you go. */
function kdxPartHits() {
  const sel = S.kdx.parts;
  let chars;
  if (sel.length) {
    chars = [...(D.radicals[sel[0]]?.kanji || [])];
    for (const p of sel.slice(1)) {
      const set = new Set(D.radicals[p]?.kanji || []);
      chars = chars.filter((c) => set.has(c));
    }
  } else {
    chars = S.kdx.st ? Object.keys(D.kanji) : [];
  }
  chars = chars.filter((c) => D.kanji[c] && (!S.kdx.st || D.kanji[c].st === S.kdx.st));
  chars.sort((a, b) => D.kanji[a].st - D.kanji[b].st || (a < b ? -1 : 1));
  return chars;
}
function renderKdxParts(main) {
  if (S.kdx.parts.length) {
    const chosen = el('div', 'kdx-chosen');
    for (const p of S.kdx.parts) {
      // the chosen row is a REMOVE control, not a toggle — it says so
      const b = el('button', 'kdx-chip kdx-part on-list', `${p} ✕`);
      b.type = 'button';
      b.setAttribute('aria-label', tx(`${p} を外す`, `remove ${p}`));
      b.addEventListener('click', () => {
        S.kdx.parts = S.kdx.parts.filter((x) => x !== p);
        render();
      });
      chosen.append(b);
    }
    const clr = el('button', 'kdx-clear', tx('ぜんぶ消す', 'clear'));
    clr.type = 'button';
    clr.addEventListener('click', () => {
      S.kdx.parts = [];
      // clearing the filter destroys this very control — the chosen row goes
      // with it — so it hands the keyboard forward to the grid it just
      // reopened, rather than dropping it (E3 round-D, dead-ends lens)
      handKeyboardTo('#kdx-partfilter, .kdx-chip.kdx-part, .kdx-lens');
      render();
    });
    chosen.append(clr);
    main.append(chosen);
  }

  const hits = kdxPartHits();
  if (S.kdx.parts.length || S.kdx.st) renderKdxGrid(main, hits, 160);

  // which components still co-occur with the current hits? (the union of the
  // hits' own parts). Nothing selected → everything is available.
  let coPresent = null;
  if (S.kdx.parts.length) {
    coPresent = new Set(S.kdx.parts);
    for (const c of hits) for (const p of D.kanji[c].parts || []) coPresent.add(p);
  }

  main.append(withEn(el('p', 'eyebrow', '部品'), 'tap the parts you can see', 'en-inline'));
  const filt = el('input', 'kdx-field');
  filt.type = 'search';
  filt.id = 'kdx-partfilter';
  filt.placeholder = tx('部品をしぼる（名前・字）', 'filter parts — by name or shape');
  filt.value = S.kdx.partq || '';
  filt.autocomplete = 'off';
  filt.addEventListener('input', () => {
    S.kdx.partq = filt.value;
    document.getElementById('kdx-partgrid')?.replaceWith(kdxPartGrid(coPresent));
  });
  main.append(filt);
  main.append(kdxPartGrid(coPresent));
}
function kdxPartGrid(coPresent) {
  const wrap = el('div');
  wrap.id = 'kdx-partgrid';
  const q = (S.kdx.partq || '').trim().toLowerCase();
  let parts = Object.values(D.radicals).filter((r) => (r.kanjiCount || 0) >= 8);
  if (q) parts = parts.filter((r) => r.c === q || (r.name && r.name.toLowerCase().includes(q)));
  parts.sort((a, b) => (a.st || 99) - (b.st || 99) || b.kanjiCount - a.kanjiCount);
  const bySt = new Map();
  for (const r of parts) {
    const g = r.st || 99;
    if (!bySt.has(g)) bySt.set(g, []);
    bySt.get(g).push(r);
  }
  for (const [g, group] of bySt) {
    wrap.append(
      el('p', 'kdx-sthead', g === 99 ? tx('画数のない部品', 'uncounted') : tx(`${g} 画`, `${g} stroke${g === 1 ? '' : 's'}`)),
    );
    const row = el('div', 'kdx-row');
    for (const r of group) {
      const sel = S.kdx.parts.includes(r.c);
      const dead = coPresent && !sel && !coPresent.has(r.c);
      const b = el('button', `kdx-chip kdx-part${sel ? ' on-list' : ''}${dead ? ' dead' : ''}`, r.c);
      b.setAttribute('aria-pressed', String(sel));
      b.type = 'button';
      if (r.name) b.setAttribute('aria-label', r.name);
      if (dead) b.disabled = true;
      b.addEventListener('click', () => {
        S.kdx.parts = sel ? S.kdx.parts.filter((x) => x !== r.c) : [...S.kdx.parts, r.c];
        render();
        window.scrollTo(0, 0);
      });
      row.append(b);
    }
    wrap.append(row);
  }
  return wrap;
}

/* 画数 — the stroke-count index, on its own and as a filter shared with 部品. */
function renderKdxStrokes(main) {
  main.append(withEn(el('p', 'eyebrow', '画数'), 'total strokes', 'en-inline'));
  const stRow = el('div', 'kdx-row');
  for (let n = 1; n <= 30; n++) {
    const on = S.kdx.st === n;
    const b = el('button', on ? 'kdx-chip on-list' : 'kdx-chip', String(n));
    b.type = 'button';
    b.addEventListener('click', () => {
      S.kdx.st = on ? null : n;
      render();
      window.scrollTo(0, 0);
    });
    stRow.append(b);
  }
  main.append(stRow);
  if (S.kdx.st) {
    const chars = Object.keys(D.kanji)
      .filter((c) => D.kanji[c].st === S.kdx.st)
      .sort((a, b) => (a < b ? -1 : 1));
    renderKdxGrid(main, chars, 300);
  }
}

/* 音訓 / 意味 — reading (kana or romaji) and English-meaning lookup, straight
 * over the kanji layer, with the results swapped in place as you type. */
function renderKdxText(main, kind) {
  const inp = el('input', 'kdx-field');
  inp.type = 'search';
  inp.id = 'kdx-textfield';
  inp.autocomplete = 'off';
  inp.placeholder =
    kind === 'reading' ? tx('音・訓（かな か ローマ字）', 'reading — kana or romaji') : tx('英語の意味', 'English meaning');
  inp.value = (kind === 'reading' ? S.kdx.reading : S.kdx.meaning) || '';
  let deb = null;
  inp.addEventListener('input', () => {
    if (kind === 'reading') S.kdx.reading = inp.value;
    else S.kdx.meaning = inp.value;
    clearTimeout(deb);
    deb = setTimeout(() => document.getElementById('kdx-results')?.replaceWith(kdxTextResults(kind)), 120);
  });
  main.append(inp);
  main.append(kdxTextResults(kind));
}
function kdxTextResults(kind) {
  const wrap = el('div');
  wrap.id = 'kdx-results';
  const q = ((kind === 'reading' ? S.kdx.reading : S.kdx.meaning) || '').trim();
  if (!q) return wrap;
  let chars;
  if (kind === 'reading') {
    const hasKana = /[ぁ-んァ-ンー]/.test(q);
    const qh = (hasKana ? kataToHira(q) : ROMAJI(q) || q.toLowerCase()).replace(/[.\-・\s]/g, '');
    // match PER reading (never concatenated — else 介 + い.う spuriously reads
    // かいう ⊇ かい): a reading whose okurigana-stripped stem starts with the
    // query counts, so typing か…かい narrows the same way a paper index does.
    chars = Object.keys(D.kanji).filter((c) => {
      const k = D.kanji[c];
      return (
        qh &&
        [...k.on, ...k.kun].some((r) => {
          const rh = kataToHira(r).replace(/[.\-・\s].*$/, '').replace(/[.\-・\s]/g, '');
          return rh === qh || rh.startsWith(qh);
        })
      );
    });
  } else {
    const ql = q.toLowerCase();
    chars = Object.keys(D.kanji).filter((c) => String(D.kanji[c].m).toLowerCase().includes(ql));
  }
  chars.sort((a, b) => D.kanji[a].st - D.kanji[b].st || (a < b ? -1 : 1));
  renderKdxGrid(wrap, chars, 200);
  return wrap;
}

/* 手書き — draw the character. Recognition matches the ink against the KanjiVG
 * stroke templates we already ship, sampled through the DOM; it is stroke-
 * order- and (±) stroke-count-tolerant, re-ranking as you draw. Offline, open
 * data, exactly the "saw-it-on-a-sign" path the operator asked for. */
function renderKdxDraw(main) {
  main.append(withEn(el('p', 'eyebrow', '手書き'), 'draw it — stroke order need not be perfect', 'en-inline'));
  const stage = el('div', 'kdx-draw');
  const canvas = el('canvas', 'kdx-canvas');
  stage.append(canvas);
  main.append(stage);
  const ctrl = el('div', 'kdx-draw-ctrl');
  const undo = el('button', 'kdx-clear', tx('一画消す', 'undo stroke'));
  const clear = el('button', 'kdx-clear', tx('消す', 'clear'));
  undo.type = clear.type = 'button';
  ctrl.append(undo, clear);
  main.append(ctrl);
  const results = el('div');
  results.id = 'kdx-results';
  main.append(results);

  const SIZE = 300;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const strokes = [];
  let cur = null;
  const inkColor = () => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#14181c';
  const redraw = () => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = inkColor();
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const draw = (s) => {
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x * SIZE, p.y * SIZE) : ctx.moveTo(p.x * SIZE, p.y * SIZE)));
      ctx.stroke();
    };
    strokes.forEach(draw);
    if (cur) draw(cur);
  };
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const recognize = () => {
    document.getElementById('kdx-results')?.replaceWith(kdxDrawResults(recognizeKanji(strokes)));
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    cur = [at(e)];
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return;
    e.preventDefault();
    cur.push(at(e));
    redraw();
  });
  const finish = () => {
    if (!cur) return;
    if (cur.length > 1) strokes.push(cur);
    cur = null;
    redraw();
    recognize();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  undo.addEventListener('click', () => {
    strokes.pop();
    redraw();
    strokes.length ? recognize() : document.getElementById('kdx-results')?.replaceWith(Object.assign(el('div'), { id: 'kdx-results' }));
  });
  clear.addEventListener('click', () => {
    strokes.length = 0;
    cur = null;
    redraw();
    document.getElementById('kdx-results')?.replaceWith(Object.assign(el('div'), { id: 'kdx-results' }));
  });
}
function kdxDrawResults(chars) {
  const wrap = el('div');
  wrap.id = 'kdx-results';
  if (!chars.length) return wrap;
  wrap.append(withEn(el('p', 'eyebrow', 'にた字'), 'closest matches — tap to open', 'en-inline'));
  const grid = el('div', 'kdx-grid');
  for (const c of chars) {
    const b = el('button', 'kdx-glyph', c);
    b.type = 'button';
    if (D.kanji[c]) b.setAttribute('aria-label', D.kanji[c].m);
    b.addEventListener('click', () => go({ t: 'kanji', id: c }));
    grid.append(b);
  }
  wrap.append(grid);
  return wrap;
}

/* ---- handwriting recogniser: resample strokes to fixed point-counts, scale
 * each character into a unit box, and score by greedy order-tolerant stroke
 * pairing. Templates are the KanjiVG paths in D.strokes, sampled once through
 * a hidden SVG path element and cached by stroke count. */
const _KDX_NPTS = 12;
let _kdxTmpl = null;
function _kdxResample(points, n) {
  if (!points.length) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0] }));
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  const step = total / (n - 1);
  const out = [{ ...points[0] }];
  let prev = points[0];
  let i = 1;
  let acc = 0;
  for (let k = 1; k < n; k++) {
    const target = k * step;
    while (i < points.length) {
      const d = Math.hypot(points[i].x - prev.x, points[i].y - prev.y);
      if (acc + d >= target || i === points.length - 1) break;
      acc += d;
      prev = points[i];
      i++;
    }
    const seg = Math.hypot(points[i].x - prev.x, points[i].y - prev.y) || 1e-6;
    const t = Math.min(1, Math.max(0, (target - acc) / seg));
    out.push({ x: prev.x + (points[i].x - prev.x) * t, y: prev.y + (points[i].y - prev.y) * t });
  }
  return out;
}
function _kdxNorm(strokes) {
  let minx = 1e9,
    miny = 1e9,
    maxx = -1e9,
    maxy = -1e9;
  for (const s of strokes)
    for (const p of s) {
      if (p.x < minx) minx = p.x;
      if (p.y < miny) miny = p.y;
      if (p.x > maxx) maxx = p.x;
      if (p.y > maxy) maxy = p.y;
    }
  const w = Math.max(maxx - minx, 1e-6);
  const h = Math.max(maxy - miny, 1e-6);
  const sc = 1 / Math.max(w, h);
  const ox = (1 - w * sc) / 2;
  const oy = (1 - h * sc) / 2;
  return strokes.map((s) => s.map((p) => ({ x: (p.x - minx) * sc + ox, y: (p.y - miny) * sc + oy })));
}
function _kdxTemplates(n) {
  _kdxTmpl ||= new Map();
  if (_kdxTmpl.has(n)) return _kdxTmpl.get(n);
  const list = [];
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const path = document.createElementNS(NS, 'path');
  svg.appendChild(path);
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  document.body.appendChild(svg);
  for (const [c, paths] of Object.entries(D.strokes)) {
    if (!Array.isArray(paths) || paths.length !== n) continue;
    const strokes = [];
    for (const d of paths) {
      path.setAttribute('d', d);
      const L = path.getTotalLength();
      const pts = [];
      for (let i = 0; i < _KDX_NPTS; i++) {
        const q = path.getPointAtLength(L ? (i / (_KDX_NPTS - 1)) * L : 0);
        pts.push({ x: q.x / 109, y: q.y / 109 });
      }
      strokes.push(pts);
    }
    list.push({ c, strokes: _kdxNorm(strokes) });
  }
  svg.remove();
  _kdxTmpl.set(n, list);
  return list;
}
function _kdxStrokeDist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return s / a.length;
}
function _kdxDist(user, tmpl) {
  const [small, big] = user.length <= tmpl.length ? [user, tmpl] : [tmpl, user];
  const used = new Array(big.length).fill(false);
  let total = 0;
  for (const us of small) {
    let best = 1e9,
      bi = -1;
    for (let j = 0; j < big.length; j++) {
      if (used[j]) continue;
      const d = _kdxStrokeDist(us, big[j]);
      if (d < best) {
        best = d;
        bi = j;
      }
    }
    used[bi] = true;
    total += best;
  }
  return (total + (big.length - small.length) * 0.28) / big.length;
}
function recognizeKanji(strokes) {
  if (!strokes.length) return [];
  const user = _kdxNorm(strokes).map((s) => _kdxResample(s, _KDX_NPTS));
  const n = user.length;
  const cands = [];
  for (const dn of [n, n - 1, n + 1, n - 2, n + 2]) {
    if (dn < 1) continue;
    for (const t of _kdxTemplates(dn)) cands.push({ c: t.c, d: _kdxDist(user, t.strokes) });
  }
  cands.sort((a, b) => a.d - b.d);
  const seen = new Set();
  const out = [];
  for (const x of cands) {
    if (seen.has(x.c)) continue;
    seen.add(x.c);
    out.push(x.c);
    if (out.length >= 24) break;
  }
  return out;
}

/* ------------------------------------------------------------ thesaurus
 * 類語 — the synonym dictionary as its own page, not a footnote at the foot
 * of an entry. The clusters are the same hand-written edges that feed the
 * 意味の近く block inside entries; this page is the paper-thesaurus spread
 * of all of them at once: headword, near-neighbours, one line each on how
 * they actually differ. Only the near-in-meaning relations belong here —
 * kanji families, collocations and themes stay on the entry pages. */
const THES_RELS = ['syn', 'ant', 'reg'];

function thesClusters() {
  const out = [];
  for (const [w, edges] of Object.entries(D.sem)) {
    const near = edges.filter((e) => THES_RELS.includes(e.rel));
    if (near.length) out.push({ w, near });
  }
  // a paper thesaurus orders by reading, not by codepoint
  const key = (c) => lookup(c.w)?.r || c.w;
  out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return out;
}

function renderThesaurus(main) {
  main.append(withEn(el('p', 'eyebrow', '類語 · 使い分け'), 'synonyms — and how they differ', 'en-inline'));
  main.append(el('h1', 'view-title', '類語辞典'));
  const clusters = thesClusters();
  const sub = el('p', 'shelf-snippet intro');
  sub.textContent = tx(
    `${clusters.length} 語群。どの語もそのまま項目へひらく。`,
    `${clusters.length} clusters, every note hand-written. Any word opens its full entry.`,
  );
  main.append(sub);
  for (const { w, near } of clusters) {
    const block = el('div', 'thes-block');
    const rec = lookup(w);
    const head = el('button', 'thes-head');
    head.type = 'button';
    head.dataset.thes = w;
    head.append(el('span', 'thes-word', w));
    if (rec?.r && rec.r !== w) head.append(el('span', 'thes-reading', rec.r));
    if (rec?.m?.length) head.append(el('span', 'thes-gloss', rec.m[0]));
    head.addEventListener('click', () => go({ t: 'word', id: w }));
    block.append(head);
    for (const edge of near) {
      const row = el('button', 'sem-row');
      row.type = 'button';
      row.dataset.thesRow = edge.w;
      row.append(el('span', 'sem-word', edge.w));
      if (edge.rel !== 'syn') row.append(el('span', 'thes-rel', REL[edge.rel][0]));
      row.append(el('span', 'sem-note', edge.note));
      row.addEventListener('click', () => go({ t: 'word', id: edge.w }));
      block.append(row);
    }
    main.append(block);
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
/** A name's door: one press shows its reading, the next hides it again.
 * No mini, no full entry, no 語釈 — a name carries none of those, and the
 * label says so rather than opening an empty room. Nothing here writes the
 * learner's store: a name is not an item in any list, so meeting one creates
 * no card, no evidence row and no debt. */
function wireNamedGestures(span, token, index, isName = true) {
  const toggle = () => {
    (S.revealed ||= new Set());
    if (S.revealed.has(index)) S.revealed.delete(index);
    else S.revealed.add(index);
    paintTok(span, token, index);
    span.setAttribute('aria-pressed', String(!!S.revealed.has(index)));
    span.setAttribute('aria-label', namedAccessibleLabel(token, index, isName));
  };
  span.addEventListener('click', (event) => {
    event.preventDefault();
    toggle();
  });
}

function wireParticleGestures(span, particle) {
  let miniTimer = null;
  let fullTimer = null;
  let down = null;
  const target = { kind: 'particle', id: particle.id };
  const openFull = (modality = 'pointer', emitAction = true) => {
    removeMini();
    // arm only while a finger is down — its release ghosts one click
    if (down) swallowClickUntil = Date.now() + 700;
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
    syncWalkSentinel(); // the particle mini is a walkable layer too
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

function hiraToKata(s) {
  return String(s || '').replace(/[぀-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + KATA_TO_HIRA_OFFSET));
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
      core: true,
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

/* ------------------------------ the deep tier behind the one search box
 * The core index answers instantly, exactly as before. The full 70k index
 * answers behind it: on the served build a worker scans it off the main
 * thread and the visible results refresh once when it settles; on the
 * standalone the embedded entries are scanned inline. A deep row that is
 * fully compatible with a core word replaces that core row (the deep entry
 * is the superset — every sense, homographs, cross-references). */
function dictionarySearchContext(query) {
  const q = String(query || '').trim();
  const hasKanji = /[一-鿌]/.test(q);
  const hasKana = /[぀-ゖァ-ヺ]/.test(q);
  const qh = hasKana ? kataToHira(q) : ROMAJI(q);
  return {
    q,
    hasKanji,
    hasKana,
    qh,
    qk: qh ? hiraToKata(qh) : null,
    ql: q.toLowerCase(),
    qn: hasKanji || hasKana ? '' : normalizeGloss(q),
  };
}

function dictionaryQueryKey(query) {
  return String(query || '').trim();
}

function dictionaryQueryOpening(query) {
  const key = dictionaryQueryKey(query);
  return (
    D.dictionaryState === 'loading' ||
    !!D.dictionarySearchPending?.has(key) ||
    dictionarySearchQueued?.key === key
  );
}

function dictionaryQueryError(query) {
  const key = dictionaryQueryKey(query);
  return D.dictionaryError || D.dictionarySearchErrors?.get(key) || null;
}

function dictionaryQueryToken(query) {
  const key = dictionaryQueryKey(query);
  if (dictionaryQueryError(key)) return 'error';
  if (dictionaryQueryOpening(key)) return 'opening';
  if (D.dictionarySearchCache?.has(key)) return 'full';
  return D.dictionaryState || 'core';
}

function shelfBodyToken() {
  return `${S.query?.trim() || ''}\u0000${dictionaryQueryToken(S.query)}`;
}

function refreshShelfBody() {
  const live = document.getElementById('shelf-body');
  if (!live || live.dataset.renderToken === shelfBodyToken()) return;
  live.replaceWith(renderShelfBody());
}

function refreshDictionaryBodies() {
  if (S.view === 'shelf' && S.query?.trim()) refreshShelfBody();
  if (typeof navSearchRepaint === 'function') navSearchRepaint();
}

function activeDictionaryQuery() {
  const nav = document.getElementById('nav-search-input');
  if (nav?.value.trim()) return dictionaryQueryKey(nav.value);
  if (S.view === 'shelf') return dictionaryQueryKey(S.query);
  return '';
}

function clearDictionarySearchTimer() {
  if (dictionarySearchTimer != null) clearTimeout(dictionarySearchTimer);
  dictionarySearchTimer = null;
}

function dispatchQueuedDictionarySearch() {
  clearDictionarySearchTimer();
  if (dictionarySearchInFlight || !dictionarySearchQueued) return;
  const queued = dictionarySearchQueued;
  if (
    activeDictionaryQuery() !== queued.key ||
    D.dictionaryMode !== 'worker' ||
    D.dictionaryState !== 'ready' ||
    D.dictionarySearchCache?.has(queued.key)
  ) {
    dictionarySearchQueued = null;
    queueMicrotask(refreshDictionaryBodies);
    return;
  }
  const remaining = queued.eligibleAt - performance.now();
  if (remaining > 0) {
    dictionarySearchTimer = setTimeout(dispatchQueuedDictionarySearch, remaining);
    return;
  }

  dictionarySearchQueued = null;
  const generation = ++dictionarySearchGeneration;
  const flight = { key: queued.key, generation };
  dictionarySearchInFlight = flight;
  D.dictionarySearchPending.set(queued.key, generation);
  D.dictionarySearchErrors.delete(queued.key);
  recordDictionaryPerformance({
    workerSearchDispatches: (D.dictionaryPerformance?.workerSearchDispatches || 0) + 1,
    lastDispatchedQuery: queued.key,
    searchConcurrency: 1,
  });

  const release = () => {
    if (dictionarySearchInFlight !== flight) return;
    dictionarySearchInFlight = null;
    if (D.dictionarySearchPending.get(queued.key) === generation) {
      D.dictionarySearchPending.delete(queued.key);
    }
  };

  dictionaryWorkerRequest(
    'search',
    { context: queued.context, matchingCoreIds: [...queued.matchingCoreIds] },
    generation,
  )
    .then((message) => {
      release();
      // A worker reply belongs only to the exact query that is still visible.
      // Stale rows never enter the cache maps and therefore can never render.
      if (message.generation !== generation || activeDictionaryQuery() !== queued.key) return;
      const result = message.result;
      if (
        !Array.isArray(result?.results) ||
        !Array.isArray(result?.compatibleCoreIds) ||
        !Array.isArray(result?.formRows)
      ) {
        throw new Error('dictionary worker returned a malformed search result');
      }
      for (const pair of result.formRows) {
        if (!Array.isArray(pair) || pair.length !== 2) {
          throw new Error('dictionary worker returned malformed result families');
        }
        cacheDictionaryFormRows(pair[0], pair[1]);
      }
      const scored = result.results.map((item) => {
        const row = dictionaryRowBySeq(item?.result?.seq);
        if (!row || !Number.isFinite(item.score) || !Number.isFinite(item.tie)) {
          throw new Error('dictionary worker result is missing its compact row');
        }
        return { e: { ...item.result, dictionaryRow: row }, score: item.score, tie: item.tie };
      });
      D.dictionarySearchCache.set(queued.key, {
        scored,
        compatibleCoreIds: result.compatibleCoreIds,
      });
      while (D.dictionarySearchCache.size > 12) {
        D.dictionarySearchCache.delete(D.dictionarySearchCache.keys().next().value);
      }
      recordDictionaryPerformance({
        lastSearch: result.performance,
        cachedRows: D.dictionaryBySeq.size,
        cachedForms: D.dictionaryCompleteForms.size,
      });
      refreshDictionaryBodies();
    })
    .catch((error) => {
      release();
      if (activeDictionaryQuery() !== queued.key) return;
      D.dictionarySearchErrors.set(queued.key, error);
      refreshDictionaryBodies();
    })
    .finally(() => {
      release();
      dispatchQueuedDictionarySearch();
    });
}

function requestDictionarySearch(context, matchingCoreIds) {
  const key = context.q;
  if (
    !key ||
    D.dictionaryMode !== 'worker' ||
    D.dictionaryState !== 'ready' ||
    D.dictionarySearchCache?.has(key) ||
    dictionarySearchInFlight?.key === key
  ) {
    return;
  }
  // Exactly one replaceable request waits behind the active worker call. A
  // natural typing stream continuously replaces this slot; only 320ms of
  // quiet makes the latest visible query eligible to cross the worker seam.
  dictionarySearchQueued = {
    key,
    context,
    matchingCoreIds: new Set(matchingCoreIds),
    eligibleAt: performance.now() + DICTIONARY_SEARCH_SETTLE_MS,
  };
  if (!dictionarySearchInFlight) {
    clearDictionarySearchTimer();
    dictionarySearchTimer = setTimeout(dispatchQueuedDictionarySearch, DICTIONARY_SEARCH_SETTLE_MS);
  }
}

function searchResults(query) {
  buildSearchIndex();
  const context = dictionarySearchContext(query);
  const { q, hasKanji, hasKana, qh, qk, ql, qn } = context;
  if (!q) return [];
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
  const matchingCoreIds = new Set(scored.filter(({ e }) => e.core).map(({ e }) => e.id));
  const workerSearch = D.dictionarySearchCache?.get(q) || null;
  if (workerSearch) scored.push(...workerSearch.scored);
  else requestDictionarySearch(context, matchingCoreIds);

  // The full dictionary index stays in its compact source tuples. Search all
  // spellings, all readings and every English gloss without materialising a
  // second expanded index. Each hit carries ent_seq into the canonical sheet,
  // so homographs no longer disappear behind a first-wins written key.
  for (const row of D.dictionaryIndex?.entries || []) {
    const [seq, head, reading, firstGloss, written, kana, glosses, normalGlosses, common] = row;
    const summaries = dictionaryReadingSummaries(row);
    const defaultSummary = [reading || '', head || '', firstGloss || ''];
    let matchedSummary = defaultSummary;
    let score = -1;
    let tie = common ? 0 : 6;
    if (hasKanji) {
      const matchedWritten =
        written.find((form) => form === q) ||
        written.find((form) => form.startsWith(q)) ||
        written.find((form) => form.includes(q));
      if (matchedWritten) {
        score = matchedWritten === q ? 100 : matchedWritten.startsWith(q) ? 80 : 60;
        const permitted = summaries.find((summary) =>
          dictionaryReadingSupportsForm(row, summary[0], matchedWritten),
        );
        if (permitted) matchedSummary = [permitted[0], matchedWritten, permitted[2]];
      }
    } else if (hasKana) {
      const exact = summaries.find((summary) => kataToHira(summary[0]) === qh);
      const prefix = exact ? null : summaries.find((summary) => kataToHira(summary[0]).startsWith(qh));
      if (exact) {
        score = 100;
        matchedSummary = exact;
      } else if (prefix) {
        score = 80;
        matchedSummary = prefix;
      } else if (
        written.some((form) => form.includes(q)) ||
        kana.some((form) => form.includes(q) || form.includes(qh) || form.includes(qk))
      ) {
        score = 60;
        matchedSummary = summaries.find((summary) => kataToHira(summary[0]).includes(qh)) || defaultSummary;
      }
    } else {
      if (qh) {
        const exact = summaries.find((summary) => kataToHira(summary[0]) === qh);
        const prefix = exact ? null : summaries.find((summary) => kataToHira(summary[0]).startsWith(qh));
        if (exact) {
          score = 95;
          matchedSummary = exact;
        } else if (prefix) {
          score = 75;
          matchedSummary = prefix;
        }
      }
      const gi = qn ? normalGlosses.indexOf(qn) : -1;
      const glossExact = gi >= 0 ? dictionaryGlossSummary(row, gi) : null;
      const exact = gi === 0 ? 92 : gi > 0 ? 85 : -1;
      if (exact > score) {
        score = exact;
        if (glossExact) matchedSummary = glossExact;
        tie += gi * 10 + jlptRank(D.dict[head]?.jlpt);
      }
      if (score < 92) {
        let boundaryIndex = -1;
        let anywhereIndex = -1;
        for (let glossIndex = 0; glossIndex < glosses.length; glossIndex += 1) {
          const gloss = glosses[glossIndex];
          // JMdict English glosses are overwhelmingly lowercase. Avoid making
          // a fresh lowercase string for every gloss on every keystroke; pay
          // that cost only for the minority that actually contain capitals.
          const searchable = /[A-Z]/.test(gloss) ? gloss.toLowerCase() : gloss;
          const at = searchable.indexOf(ql);
          if (at === 0 || (at > 0 && ' ;('.includes(searchable[at - 1]))) {
            boundaryIndex = glossIndex;
            break;
          }
          if (at > 0 && anywhereIndex < 0) anywhereIndex = glossIndex;
        }
        if (boundaryIndex >= 0) {
          score = Math.max(score, 70);
          matchedSummary = dictionaryGlossSummary(row, boundaryIndex) || matchedSummary;
        } else if (anywhereIndex >= 0) {
          score = Math.max(score, 40);
          matchedSummary = dictionaryGlossSummary(row, anywhereIndex) || matchedSummary;
        }
      }
    }
    if (score >= 0) {
      const [matchedReading, displayHead, matchedGloss] = matchedSummary;
      scored.push({
        e: {
          t: 'word',
          id: displayHead || head,
          seq,
          reading: matchedReading || reading || '',
          w: displayHead || head,
          r: matchedReading || reading || '',
          g: matchedGloss || firstGloss || '',
          matchedGloss: matchedGloss || firstGloss || '',
          dictionaryRow: row,
        },
        score,
        tie,
      });
    }
  }
  scored.sort(
    (a, b) =>
      b.score - a.score || Number(!a.e.seq) - Number(!b.e.seq) || a.tie - b.tie || a.e.w.length - b.e.w.length,
  );
  const coreIds = new Set(scored.filter(({ e }) => e.core).map(({ e }) => e.id));
  const compatibleCoreIds = new Set(workerSearch?.compatibleCoreIds || []);
  for (const { e } of scored) {
    if (!e.dictionaryRow) continue;
    const forms = new Set([e.dictionaryRow[1], ...e.dictionaryRow[4], ...e.dictionaryRow[5]]);
    for (const form of forms) {
      if (coreIds.has(form) && dictionaryCoreMatch(form, e.dictionaryRow).compatible) {
        compatibleCoreIds.add(form);
      }
    }
  }
  const results = [];
  for (const { e } of scored) {
    if (e.core && compatibleCoreIds.has(e.id)) continue;
    results.push(e);
    if (results.length >= 40) break;
  }
  return results;
}

function renderSearchResults(main, query) {
  const results = searchResults(query);
  const box = el('div', 'entry-rows');
  box.id = 'search-results';
  for (const e of results) {
    const row = el('button', 'entry-row compound');
    row.type = 'button';
    row.dataset.result = `${e.t}:${e.id}${e.seq ? `:${e.seq}` : ''}`;
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
    row.addEventListener('click', () =>
      go(
        e.seq
          ? { t: e.t, id: e.id, seq: String(e.seq), reading: e.reading || '', matchedGloss: e.matchedGloss || '' }
          : { t: e.t, id: e.id },
      ),
    );
    box.append(row);
  }
  if (!results.length) {
    box.append(el('div', 'sem-empty', tx('見つからない。', 'Nothing found for that yet.')));
  }
  main.append(box);

  // the weave: a searched word that has a hand-written cluster shows its
  // near-in-meaning neighbours right here — the thesaurus meets you where
  // you look things up, instead of waiting behind its own door.
  const clustered = results.find(
    (e) => e.t === 'word' && (D.sem[e.id] || []).some((x) => THES_RELS.includes(x.rel)),
  );
  if (clustered) {
    const near = D.sem[clustered.id].filter((x) => THES_RELS.includes(x.rel)).slice(0, 4);
    const wrap = el('div', 'search-syn');
    wrap.append(
      withEn(el('p', 'eyebrow', `${clustered.id} の類語`), 'nearby in meaning — and how they differ', 'en-inline'),
    );
    for (const edge of near) {
      const row = el('button', 'sem-row');
      row.type = 'button';
      row.dataset.searchSyn = edge.w;
      row.append(el('span', 'sem-word', edge.w));
      if (edge.rel !== 'syn') row.append(el('span', 'thes-rel', REL[edge.rel][0]));
      row.append(el('span', 'sem-note', edge.note));
      row.addEventListener('click', () => go({ t: 'word', id: edge.w }));
      wrap.append(row);
    }
    const door = biLabel('button', 'chip search-syn-door', '類語辞典へ', 'the synonym dictionary');
    door.type = 'button';
    door.addEventListener('click', () => {
      keepScroll();
      S.view = 'thesaurus';
      render();
      window.scrollTo(0, 0);
    });
    wrap.append(door);
    main.append(wrap);
  }
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
  if (node.t === 'catalog') return catalogLabel(node.by, node.value);
  // the crumb idiom for a content-shaped node: 日本語 first, english beside
  // it — never a stray lowercase 'sentence' standing alone mid-crumb
  if (node.t === 'sent') return tx('文', '文 sentence');
  return '';
}

/* ------------------------------------------- 文 · the minimum reader
 * Every example sentence opens into its own small reading page (operator,
 * 2026-08-12): the sentence alone, large, every token carrying the full
 * gesture grammar — the tap circle, the hold for the simple definition,
 * the long hold for the entry. The translation and the source sit beneath,
 * quiet. It rides the sheet stack, so 戻る returns exactly one step. */
function renderSentenceNode(sheet, node) {
  sheet.append(withEn(el('p', 'eyebrow', '文'), 'one sentence, read closely', 'en-inline'));
  const line = el('p', 'sent-reader');
  // on its own page the sentence is ALL reader: the highlighted word keeps
  // its mark but joins the ladder like every neighbour
  renderSentenceTokens(line, node.tokens, {
    targetId: node.target || null,
    targetLive: true,
    contextId: node.passage || 'bank',
  });
  sheet.append(line);
  if (node.en) sheet.append(el('p', 'sent-reader-en', node.en));
  if (node.source) sheet.append(el('p', 'example-src', node.source));
  // …and on to the whole article. The rubric asks a review answer to return
  // the learner to the source sentence AND its article (§9.5); the C1
  // demonstration found the sentence half present and this half missing.
  // The door appears only when the sentence really came from a shelf
  // article — a bank example has no article to walk into, and an honest
  // absence beats a door onto nothing.
  const home = node.passage && D.passages.some((p) => p.id === node.passage) ? node.passage : null;
  if (home) {
    const doorRow = el('div', 'sent-home-row');
    const door = biLabel('button', 'chip sent-home', 'この記事を読む', 'read the source article');
    door.type = 'button';
    door.id = 'sent-home';
    door.addEventListener('click', () => {
      dismissSheet();
      openPassage(home);
    });
    doorRow.append(door);
    sheet.append(doorRow);
  }
  sheet.append(el('p', 'gloss', tapLadderHint()));
}

/** The quiet door every example line carries into its own reading page. */
function sentenceDoor(ex, target) {
  const door = el('button', 'sent-door', '▹');
  door.type = 'button';
  door.setAttribute('aria-label', tx('この文だけをひらく', 'open this sentence on its own page'));
  door.addEventListener('click', (ev) => {
    ev.stopPropagation();
    go({
      t: 'sent',
      tokens: ex.tokens,
      en: ex.en || '',
      source: ex.source || '',
      passage: ex.passage || null,
      target: target || null,
    });
  });
  return door;
}

/* ------------------------------------------------------ category catalogs
 * Operator (2026-08-10): a level or count on an entry should be a door — tap
 * 漢検 3級 / JLPT N1 / 12 画 and see EVERY kanji in that group, exhaustively.
 * The same node opens the same way everywhere the chip appears. */
function catalogLabel(by, value) {
  if (by === 'strokes') return tx(`${value} 画`, `${value} strokes`);
  if (by === 'kanken') return `漢検 ${value}`;
  if (by === 'jlpt') return `JLPT ${value}`;
  return String(value);
}
function catalogEn(by, value) {
  if (by === 'strokes') return `${value}-stroke kanji`;
  if (by === 'kanken') return `Kanken ${value} kanji`;
  if (by === 'jlpt') return `JLPT ${value} kanji`;
  return '';
}
/** Every kanji in a category, ordered common-first (by 漢検 rank) then simpler. */
function catalogMatch(by, value) {
  const out = [];
  for (const [c, k] of Object.entries(D.kanji)) {
    const hit =
      by === 'strokes'
        ? k.st === value
        : by === 'kanken'
          ? k.kk === value
          : by === 'jlpt'
            ? D.kmeta?.[c]?.jlpt === value
            : false;
    if (hit) out.push(c);
  }
  out.sort(
    (a, b) =>
      (D.kanji[a].kr || 9999) - (D.kanji[b].kr || 9999) || D.kanji[a].st - D.kanji[b].st || a.localeCompare(b),
  );
  return out;
}
/** A tappable chip that opens the catalog for its category. */
function catalogChip(ja, en, by, value, from) {
  const chip = el('button', 'pool-tag cat-chip', bi() && en ? en : ja);
  chip.type = 'button';
  chip.setAttribute('aria-label', tx(`${ja} の漢字をすべて見る`, `see every ${en} kanji`));
  chip.addEventListener('click', () => go({ t: 'catalog', id: `${by}:${value}`, by, value, from }));
  return chip;
}
function renderCatalogNode(sheet, node) {
  const { by, value } = node;
  const chars = catalogMatch(by, value);
  sheet.append(withEn(el('h1', 'view-title', catalogLabel(by, value)), catalogEn(by, value), 'en-inline'));
  sheet.append(
    el('p', 'gloss', tx(`このくくりの漢字 — 全 ${chars.length} 字`, `every kanji in this group — all ${chars.length}`)),
  );
  if (!chars.length) {
    sheet.append(el('div', 'sem-empty', tx('この層に該当する字がない。', 'No kanji in this layer match.')));
    return;
  }
  const grid = el('div', 'cat-grid');
  for (const c of chars) {
    const cell = el('button', 'cat-cell');
    cell.type = 'button';
    cell.append(el('span', 'cat-glyph', c));
    cell.append(el('span', 'cat-mean', D.kanji[c].m));
    cell.addEventListener('click', () => go({ t: 'kanji', id: c, from: node.from }));
    grid.append(cell);
  }
  sheet.append(grid);
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
  // 覚える stage 3 (operator directive §3): grammar patterns and particles
  // can enter the SRS — their card backs read from the same records the
  // entry sheets read, so the session and the dictionary never disagree
  grammar: ['文法', 'grammar'],
  particle: ['助詞', 'particle'],
};

/** The context a learner chose at capture — resolved fresh from the article
 * each time (the store carries only {p, i, scope}; the text stays in its
 * source file, never duplicated into the envelope). */
function takenContext(item) {
  const ctx = item.ctx;
  if (!ctx) return null;
  const p = D.passages.find((x) => x.id === ctx.p);
  if (!p) {
    // an archive capture on a fresh boot: pull the stack's index in quietly
    if (!D.archive && !D.archiveLoading && window.__CORRIDOR_STANDALONE__ !== true) {
      ensureArchiveIndex()
        .then(() => {
          if (S.view === 'review') render();
        })
        .catch(() => {});
    }
    return null;
  }
  if (!p.tokens) {
    ensureArticle(p)
      .then(() => {
        if (S.view === 'review') render();
      })
      .catch(() => {});
    return null;
  }
  let start = 0;
  let end = p.tokens.length;
  if (ctx.scope === 'para' && Array.isArray(p.paras) && p.paras.length) {
    for (const ps of p.paras) {
      if (ps <= ctx.i) start = ps;
      else {
        end = ps;
        break;
      }
    }
  } else {
    for (let k = ctx.i - 1; k >= 0; k--) {
      if ('。！？'.includes(p.tokens[k].s)) {
        start = k + 1;
        break;
      }
    }
    for (let k = ctx.i; k < p.tokens.length; k++) {
      if ('。！？'.includes(p.tokens[k].s)) {
        end = k + 1;
        break;
      }
    }
  }
  return { tokens: p.tokens.slice(start, end), source: p.sourceLabel, passage: p.id };
}

function commitCapture(node, label, now = Date.now()) {
  const item = {
    t: node.t,
    id: node.id,
    label,
    kind: NODE_KIND[node.t][0],
    kindEn: NODE_KIND[node.t][1],
    from: node.from || null,
    ts: now,
    // 覚える is the explicit choice to memorize, so the row is started the
    // moment it is taken. Rows that arrive any other way — import, legacy
    // stores — carry no mark and wait for the learner's 始める.
    started: now,
  };
  // Capture that arrives from inside the reading flow carries the sentence
  // it was met in (ctxScope rides the node): the top-right door and the mini
  // take the word AS ENCOUNTERED. The scope stages (語だけ・この文・段落)
  // stay one tap away to widen or shed it — same ctx record, same validator.
  if (node.ctxScope && node.from?.passage && node.from.index != null) {
    item.ctx = { p: node.from.passage, i: Number(node.from.index), scope: node.ctxScope };
  }
  let deepWord = null;
  // A word taken from the deep tier writes its own compact record into the
  // learner's store: the card must answer on any device, offline, without
  // re-opening the 70k index. The exact entry (ent_seq) and the reading the
  // learner actually met ride along as provenance.
  if (node.t === 'word' && !D.dict[node.id]) {
    const rec = lookup(node.id, node.seq, node.reading, node.matchedGloss);
    if (rec?.seq) item.entrySeq = String(rec.seq);
    if (rec?.r) item.cueReading = rec.r;
    if (rec) {
      deepWord = {
        r: rec.r || '',
        m: (rec.m || []).slice(0, 8),
        ...(rec.jlpt ? { jlpt: rec.jlpt } : {}),
        ...(rec.alt ? { alt: rec.alt } : {}),
        ...(rec.k?.length ? { k: rec.k } : {}),
        ...(rec.seq ? { seq: String(rec.seq) } : {}),
      };
    }
  }
  const patch = { taken: [...S.taken, item] };
  if (deepWord) patch.deepWords = { ...(S.deepWords || {}), [node.id]: deepWord };
  return commitStorePatch(patch);
}

/** Capture is a DOOR THAT SWINGS BOTH WAYS (operator directive §3): taking
 * adds the card; taking again removes it from the deck while its FSRS
 * history and revlog stay whole, so a re-take resumes the schedule instead
 * of pretending the card is new. Both directions ride the guarded
 * transactional store path. */
function toggleTaken(node, label) {
  const ix = S.taken.findIndex((t) => t.t === node.t && t.id === node.id);
  if (ix < 0) return commitCapture(node, label);
  return commitStorePatch({ taken: S.taken.filter((_, i) => i !== ix) });
}

function takeButton(node, label) {
  const already = S.taken.some((t) => t.t === node.t && t.id === node.id);
  const btn = biLabel(
    'button',
    already ? 'take taken' : 'take',
    already ? '覚える ✓ — やめる' : '覚える',
    already ? 'memorizing — tap to stop' : 'memorize',
  );
  btn.type = 'button';
  btn.id = 'take';
  btn.setAttribute('aria-pressed', String(already));
  btn.addEventListener('click', () => {
    toggleTaken(node, label);
    render();
  });
  return btn;
}

/* ------------------------------------------- 覚える top-right (directive §3)
 * One button in the top-right corner of every capture-eligible surface. The
 * entry sheets carry their own seal in the sheet bar; the reader's lives in
 * the chrome and takes the CURRENT THING — the word the learner last touched
 * in the open article, with the sentence it was met in. Surfaces that show
 * no capturable thing (the shelf, the tray, the dojo, the galaxy — they are
 * navigation and curation, not content) honestly carry none, and 書の間
 * keeps its total quiet: its kanji's seal waits on the sheet beneath. */
function readerTakeCurrent() {
  if (S.view !== 'reader' || !S.passageId) return null;
  const cur = S.readerTake;
  if (!cur || cur.p !== S.passageId) return null;
  return cur;
}

/** The capture node the reader's door commits: the word as encountered —
 * provenance and the sentence scope travel with it. */
function readerTakeNode(cur) {
  return { t: 'word', id: cur.id, from: { passage: cur.p, index: cur.index }, ctxScope: 'sent' };
}

function readerTakeLabel(cur, takenNow) {
  if (!cur) return tx('語に触れると、ここから覚えられる', 'touch a word, then memorize it here');
  return takenNow
    ? tx(`「${cur.id}」を覚えている — ひらいて調整・やめる`, `memorizing ${cur.id} — open to adjust or stop`)
    : tx(`「${cur.id}」を覚える`, `memorize ${cur.id}`);
}

/** Remember the word under the learner's finger and repaint the chrome seal
 * in place — token taps deliberately never trigger a full re-render. */
function setReaderTake(id, index, passageId) {
  S.readerTake = { id, index, p: passageId };
  syncReaderTakeSeal();
}

function syncReaderTakeSeal() {
  const btn = document.getElementById('reader-take');
  if (!btn) return;
  const cur = readerTakeCurrent();
  const takenNow = !!cur && S.taken.some((t) => t.t === 'word' && t.id === cur.id);
  btn.disabled = !cur;
  btn.classList.toggle('taken', takenNow);
  btn.setAttribute('aria-pressed', String(takenNow));
  btn.setAttribute('aria-expanded', String(!!S.captureOpen));
  btn.setAttribute('aria-label', readerTakeLabel(cur, takenNow));
}

/* a tap anywhere outside the capture panel puts it away — the mini's law.
 * The panel node leaves on the spot (no full render, so the tap underneath
 * still lands where it was aimed) and the seal repaints in place. */
document.addEventListener(
  'pointerdown',
  (ev) => {
    if (!S.captureOpen) return;
    const panel = document.getElementById('capture-panel');
    const seal = document.getElementById('reader-take');
    if (panel && !panel.contains(ev.target) && !(seal && seal.contains(ev.target))) {
      S.captureOpen = false;
      panel.remove();
      syncReaderTakeSeal();
    }
  },
  true,
);

/** After 覚える: the item lands in this month's bucket automatically (the
 * operator's Renzo habit, automated) and can join any named list too. */
/** The capture's context scope — 語だけ, この文, or 段落. Only offered when
 * the word was taken from a real passage (the provenance {passage, index}
 * rides on the node); the choice stores {p, i, scope} on the taken item and
 * the review card resolves the text fresh from the article every time. */
function renderContextPicker(sheet, node) {
  const item = S.taken.find((t) => t.t === node.t && t.id === node.id);
  if (!item || node.t !== 'word') return;
  const from = node.from || item.from;
  if (!from?.passage || from.index == null) return;
  const wrap = el('div', 'list-picker context-picker');
  wrap.append(
    withEn(el('p', 'eyebrow', '札の文脈'), 'how much context the card carries', 'en-inline'),
  );
  const chips = el('div', 'chips');
  const scopes = [
    [null, '語だけ', 'the word alone'],
    ['sent', 'この文', 'this sentence'],
    ['para', '段落ごと', 'the whole paragraph'],
  ];
  const current = item.ctx?.scope ?? null;
  for (const [scope, ja, en] of scopes) {
    const on = current === scope;
    const chip = biLabel('button', on ? 'chip on-list' : 'chip', ja, en);
    chip.type = 'button';
    // which scope the card carries lived only in a CSS class, so the
    // accessibility tree showed three identical buttons and no state at all
    // — every other toggle in the app sets this (E3 round-B, a11y lens)
    chip.setAttribute('aria-pressed', String(on));
    chip.dataset.ctxScope = scope ?? 'word';
    chip.dataset.chip = `ctx-${scope ?? 'word'}`;
    chip.addEventListener('click', () => {
      // the card's context is deck state: replace the row on a COPY and
      // commit — the live item never changes on a failed persist
      const changed = { ...item };
      if (scope === null) delete changed.ctx;
      else changed.ctx = { p: from.passage, i: Number(from.index), scope };
      const taken = S.taken.map((t) => (t === item ? changed : t));
      if (commitStorePatch({ taken })) render();
    });
    chips.append(chip);
  }
  wrap.append(chips);
  sheet.append(wrap);
}

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
    // …and the same for which lists the item is in
    chip.setAttribute('aria-pressed', String(inList));
    chip.dataset.chip = `list-${name}`;
    chip.append(el('span', 'big', name));
    chip.append(el('span', 'sub', `${S.lists[name].length}`));
    chip.addEventListener('click', () => {
      // membership rides the same guarded path as list creation below:
      // prototype-safe writes on a COPY, one commit, no live mutation
      const next = { ...S.lists };
      setOwnRecordValue(
        next,
        name,
        inList
          ? S.lists[name].filter((x) => !(x.t === node.t && x.id === node.id))
          : [
              ...S.lists[name],
              {
                t: node.t,
                id: node.id,
                label,
                // the kind pill was stripped at store time and named-list rows
                // rendered an empty grey pill (P2, full-instrument review)
                kind: NODE_KIND[node.t]?.[0],
                kindEn: NODE_KIND[node.t]?.[1],
                ts: item.ts,
              },
            ],
      );
      if (commitStorePatch({ lists: next })) render();
    });
    chips.append(chip);
  }
  const add = el('button', 'chip wide');
  add.type = 'button';
  add.id = 'new-list';
  add.append(el('span', 'big', tx('＋ 新規リスト', '＋ new list')));
  add.addEventListener('click', () => {
    S.sheetListMaker = !S.sheetListMaker;
    render();
  });
  chips.append(add);
  if (S.sheetListMaker) {
    const row = el('div', 'list-maker');
    const field = el('input', 'list-maker-field');
    field.type = 'text';
    field.placeholder = tx('新しいリストの名前', 'name a new list');
    field.setAttribute('aria-label', tx('新しいリストの名前', 'name for a new list'));
    const make = biLabel('button', 'chip list-maker-make', '＋ 作る', 'create');
    make.type = 'button';
    const tryMake = () => {
      const name = field.value.trim();
      if (!name) {
        field.setAttribute('aria-invalid', 'true');
        field.focus();
        return;
      }
      const next = { ...S.lists };
      // an existing name simply receives the item — friendlier than a
      // silent no-op (P2, review)
      const items = owns(S.lists, name) ? next[name] : [];
      if (!items.some((x) => x.t === node.t && x.id === node.id)) {
        setOwnRecordValue(next, name, [...items, { t: node.t, id: node.id, label, kind: NODE_KIND[node.t]?.[0], kindEn: NODE_KIND[node.t]?.[1], ts: item.ts }]);
      }
      S.sheetListMaker = false;
      if (commitStorePatch({ lists: next })) render();
    };
    make.addEventListener('click', tryMake);
    field.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') tryMake();
    });
    row.append(field, make);
    chips.append(row);
  }
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

/* --------------------------------------------------- real review sessions
 * The tray's schedule table stops being a demonstration here: every memorized
 * item carries a real FSRS-6 card, a session walks the due queue, and each
 * grade is scheduled and saved. All of Anki's core loop, simplified — no
 * decks, no options screens: one queue, four honest buttons. */
/* ---------------- card identity: the scheduler is content-blind ----------
 * A card is any opaque "type:id" string; the engine never looks inside it.
 * Today the app mints one recognition card per item (word:安堵 · kanji:海 ·
 * radical:氵 · idiom:一期一会). The key grammar deliberately leaves room for
 * the Japanese card families to come — kanji:海:on / kanji:海:kun (reading
 * cards), word:安堵:prod (production), sent:<sourceId>#<n> (mined sentence
 * cards) — each its own card with its own FSRS state and its own revlog
 * rows, sharing the item's content record. Adding them touches capture and
 * rendering only; srsCardOf / srsStoredRecord / srsDueItems / the revlog need no
 * changes. */
const srsKey = (t, id) => `${t}:${id}`;
function srsCardOf(item, now) {
  const rec = S.srs[srsKey(item.t, item.id)];
  if (!rec) return fsrsApi.createEmptyCard(now);
  const c = { ...rec, due: new Date(rec.due) };
  if (rec.last_review) c.last_review = new Date(rec.last_review);
  return c;
}
function srsStoredRecord(card) {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : undefined,
  };
}
/** append-order-monotonic-clamp-v1 — the review-time policy the domain pin
 * names (data/fsrs-pin.json), now held in this engine too. The per-card
 * scheduler instant never decreases: a card's stored last_review is its
 * scheduler anchor (the effective instant of its previous grade), and a wall
 * clock that has moved behind it is clamped up to that anchor before FSRS
 * sees it — ts-fsrs throws on a negative day delta, and a backward device
 * clock must neither crash nor corrupt grading. Raw wall-clock truth is not
 * rewritten: the revlog row keeps the actual press time as audit truth; only
 * the instant handed to the scheduler is monotonic. */
function srsSchedulerInstant(card, now) {
  return card.last_review && card.last_review.getTime() > now.getTime()
    ? new Date(card.last_review.getTime())
    : now;
}
/* --------------------------------------------------- the review log
 * Append-only, one compact row per grade, never rewritten. Layout:
 *
 *   [t, key, g, stBefore, elapsed, r, sBefore, dBefore, sAfter, dAfter, ivl, dueAfter]
 *
 *   t        press time, epoch MILLISECONDS — the RAW device clock, kept as
 *            audit truth even when it has moved backward; the scheduler's own
 *            clamped instant is recoverable as max(t, last_review before)
 *            under append-order-monotonic-clamp-v1
 *   key      "type:id" scheduler key
 *   g        FSRS Rating pressed (1 Again · 2 Hard · 3 Good · 4 Easy);
 *            g = 0 is a revocation (undo): the row is [t, key, 0, revokedIndex]
 *   stBefore card state before (0 New · 1 Learning · 2 Review · 3 Relearning)
 *   elapsed  days since last_review at the CLAMPED scheduler instant (3 dp;
 *            null on a first press; never negative — what the engine priced)
 *   r        engine retrievability at the clamped instant (4 dp; null
 *            without last_review)
 *   sBefore/dBefore  memory state before (4 dp; null on a first press)
 *   sAfter/dAfter    memory state after
 *   ivl      scheduled_days of the stored result
 *   dueAfter stored due, epoch ms
 *
 * This is sufficient for the FSRS optimizer (per-card sequences of
 * (elapsed, rating)), for analytics, and — with the pinned parameters —
 * for full deterministic state reconstruction by replay. */
function srsReviewLogRow(key, before, after, rating, now, schedNow = now) {
  const rnd = (v, p) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(p)));
  let elapsed = null;
  let r = null;
  if (before.last_review) {
    elapsed = rnd((schedNow.getTime() - before.last_review.getTime()) / 86400000, 3);
    try {
      r = rnd(scheduler.get_retrievability(before, schedNow, false), 4);
    } catch {
      r = null;
    }
  }
  const first = !before.last_review;
  return [
    now.getTime(),
    key,
    rating,
    before.state ?? 0,
    elapsed,
    r,
    first ? null : rnd(before.stability, 4),
    first ? null : rnd(before.difficulty, 4),
    rnd(after.stability, 4),
    rnd(after.difficulty, 4),
    after.scheduled_days,
    after.due.getTime(),
  ];
}

/* 道場の礼 — is THIS grade practice, or does it touch the schedule?
 *
 * A row that has LEFT 覚える is not in the deck at all (round C). Inside a
 * focus block, a second-lap draw, a kanji-run card the queue would not have
 * surfaced, and a captured-but-never-STARTED row are all practice (rounds A
 * and B). Everything else is a real review, and a real review answers to
 * T-06: the declaration is the door and まだ means Again.
 *
 * One predicate, asked in three places — the front face, the seals, and the
 * commit — because they were disagreeing: the face offered a bare reveal on
 * cards the commit then scheduled for real. */
function practiceOnlyGrade(item) {
  const takenRow = S.taken.find((t) => t.t === item.t && t.id === item.id);
  return (
    !takenRow ||
    (!!S.focus &&
      (item.drillPass === true ||
        item.practiceOnly === true ||
        (S.srs[srsKey(item.t, item.id)] === undefined && !finiteNumber(takenRow.started))))
  );
}

function advanceReviewSession(rv, item, next, entry) {
  if ((next.state === 1 || next.state === 3) && next.scheduled_days < 1) {
    rv.queue.push(item);
    entry.reinserted = true;
  }
  rv.history.push(entry);
  rv.done[entry.key] += 1;
  rv.ix += 1;
  rv.revealed = false;
  // the next card asks its own question — no declaration carries over
  rv.declared = null;
  // …and neither does いま見る: the next ripening card gets its own wait
  rv.showEarly = false;
}

function commitDrillGrade({ rv, item, next, key, skey, rating, mode, now }) {
  // practice evidence, never deck state: the row carries the drill room
  // ('kanji') when the caller names one — see the obslog layout comment
  const row = [now.getTime(), 'dojo', skey, rating];
  if (typeof mode === 'string' && mode) row.push(mode);
  const obslog = [...(S.obslog || []), row];
  if (!commitStorePatch({ obslog })) return false;
  advanceReviewSession(rv, item, next, { key, drill: true });
  return true;
}

function commitStandardGrade({ rv, item, card, next, key, skey, rating, now, schedNow, day, prevRec }) {
  const revlog = [...(S.revlog || []), srsReviewLogRow(skey, card, next, rating, now, schedNow || now)];
  const logIx = revlog.length - 1;
  const srs = { ...S.srs, [skey]: srsStoredRecord(next) };
  const dayStats = { ...(S.stats?.[day] || { n: 0, again: 0 }) };
  const entry = { key, prev: prevRec, day, logIx };
  if (prevRec === undefined) {
    dayStats.nnew = (dayStats.nnew || 0) + 1;
    entry.introduced = true;
  }
  dayStats.n = (dayStats.n || 0) + 1;
  if (key === 'again') dayStats.again = (dayStats.again || 0) + 1;
  const stats = { ...(S.stats || {}), [day]: dayStats };
  if (!commitStorePatch({ srs, revlog, stats })) return false;
  advanceReviewSession(rv, item, next, entry);
  return true;
}

/** Items ready to review: real reviews ordered most-overdue first, then
 * never-seen cards — capped a DAY (default 20, the learner's own number via
 * ペース), so a long list arrives as days of honest work instead of one
 * avalanche. The count of cards introduced today lives in S.stats[day].nnew,
 * written on a card's first grade and honoured across every session of the
 * day. */
const srsNewPerDay = () =>
  validNewPerDay(S.srsPrefs?.newPerDay) ? S.srsPrefs.newPerDay : NEW_PER_DAY_DEFAULT;
/** How many due cards one ordinary sitting freezes (PR70-P1-2). The timed
 * dojo keeps its own refill and never reads this. */
const srsReviewLimit = () =>
  validReviewLimit(S.srsPrefs?.reviewLimit) ? S.srsPrefs.reviewLimit : REVIEW_LIMIT_DEFAULT;
/** How many pool items a dojo refill draws at once — session pacing only,
 * unrelated to the daily new-card cap. */
const FOCUS_BATCH = 20;
/* Anki's leech, simplified and softened: a card that keeps lapsing is
 * named 苦手 and offered a rest — surfaced, never auto-hidden. Partial
 * knowledge is first-class; the learner decides what rests. */
const LEECH_LAPSES = 6;
function isLeech(item) {
  const key = srsKey(item.t, item.id);
  const rec = S.srs[key];
  return !!rec && (rec.lapses || 0) >= LEECH_LAPSES && !S.suspended[key];
}
function srsDueItems(now = new Date()) {
  const reviews = [];
  const fresh = [];
  for (const item of S.taken) {
    const key = srsKey(item.t, item.id);
    if (S.suspended[key]) continue;
    const rec = S.srs[key];
    if (!rec) {
      // no-debt migration (PR70-P1-1): a cardless row joins the queue only
      // when the learner explicitly started it. Legacy and imported rows
      // carry no `started` mark and wait for 始める — capture, import, and
      // migration never schedule anything by themselves.
      if (finiteNumber(item.started)) fresh.push(item);
    } else if (new Date(rec.due) <= now) {
      reviews.push(item);
    }
  }
  // Most overdue first — the same total order the domain planner uses
  // (plan.ts compareDueContracts): the earliest due instant wins and the
  // scheduler key breaks ties, so two loads of one store never disagree.
  // Never-seen cards keep their capture order and stay after every real due.
  reviews.sort((a, b) => {
    const dueA = Date.parse(S.srs[srsKey(a.t, a.id)].due);
    const dueB = Date.parse(S.srs[srsKey(b.t, b.id)].due);
    if (dueA !== dueB) return dueA - dueB;
    const keyA = srsKey(a.t, a.id);
    const keyB = srsKey(b.t, b.id);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
  const introducedToday = S.stats[dayKey(now)]?.nnew || 0;
  const room = Math.max(0, srsNewPerDay() - introducedToday);
  return [...reviews, ...fresh.slice(0, room)];
}
/** Midnight at the start of a date, in the learner's own calendar. */
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
/** Relative due label for a tray line — the row tells the truth per item,
 * in calendar terms a person uses: minutes, hours, 明日, then real days. */
function srsWhen(item) {
  if (S.suspended[srsKey(item.t, item.id)]) return tx('休み中', 'resting');
  const rec = S.srs[srsKey(item.t, item.id)];
  // an unstarted row tells the truth: it holds no card and owes no review
  if (!rec) return finiteNumber(item.started) ? tx('新規', 'new') : tx('未着手', 'not started');
  const now = new Date();
  const due = new Date(rec.due);
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return tx('いま', 'due now');
  const mins = Math.round(ms / 60000);
  if (mins < 60) return tx(`${mins} 分後`, `in ${mins} min`);
  const dayGap = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);
  if (dayGap === 0) return tx(`${Math.round(mins / 60)} 時間後`, `in ${Math.round(mins / 60)} h`);
  if (dayGap === 1) return tx('明日', 'tomorrow');
  return tx(`${dayGap} 日後`, `in ${dayGap} d`);
}
/** Anki's stats screen, reduced to one honest line: what today, tomorrow
 * and the coming week actually hold, plus the untouched new cards. */
function srsForecast(now = new Date()) {
  const f = { today: 0, tomorrow: 0, week: 0, fresh: 0, unstarted: 0 };
  const DAY = 86400000;
  // Calendar buckets, the way a person counts: everything due before tonight's
  // midnight is TODAY (a card due in three hours is not 明日), tomorrow is
  // tomorrow's calendar day, and the week is the six days after that.
  const endToday = startOfDay(now) + DAY;
  const endTomorrow = endToday + DAY;
  const endWeek = endToday + 7 * DAY;
  for (const item of S.taken) {
    const key = srsKey(item.t, item.id);
    if (S.suspended[key]) continue;
    const rec = S.srs[key];
    if (!rec) {
      if (finiteNumber(item.started)) f.fresh += 1;
      else f.unstarted += 1;
      continue;
    }
    const due = new Date(rec.due).getTime();
    if (due < endToday) f.today += 1;
    else if (due < endTomorrow) f.tomorrow += 1;
    else if (due < endWeek) f.week += 1;
  }
  return f;
}
/* Anki's filtered deck, simplified: pass a scope (one list's items) and
 * the session holds only what is due inside it — same cards, same FSRS
 * schedule, just a narrower door. No scope reviews everything due. */
function startReview(scope) {
  let queue = srsDueItems();
  if (Array.isArray(scope)) {
    const keys = new Set(scope.map((i) => srsKey(i.t, i.id)));
    queue = queue.filter((i) => keys.has(srsKey(i.t, i.id)));
  }
  // bounded standard review (PR70-P1-2): an ordinary sitting freezes at most
  // the learner's own bound — the most overdue cards, since the queue is
  // already ordered — and the rest is an honest count on the goodbye screen,
  // never a queue growing behind the glass. The timed dojo keeps its refill.
  const limit = srsReviewLimit();
  const deferred = Math.max(0, queue.length - limit);
  if (deferred) queue = queue.slice(0, limit);
  if (!queue.length) return;
  S.review = { queue, ix: 0, revealed: false, declared: null, done: { again: 0, hard: 0, good: 0, easy: 0 }, history: [], deferred };
  S.view = 'review';
  handKeyboardTo('#declare-recalled, #reveal, #zen-more');
  render();
}
/* An instrument handle for the verification suites (the __KAIRO_* idiom):
 * read-only access to the scheduler policy actually in force, the clamp,
 * the ordered due queue, and the bounded session — so acceptance checks
 * exercise the real code instead of a re-implementation. */
window.__KAIRO_SRS__ = Object.freeze({
  policy: () => ({
    enableFuzz: srsParams ? srsParams.enable_fuzz : null,
    pinFuzz: D.pin?.enableFuzz ?? null,
    reviewTimePolicyId: D.pin?.reviewTimePolicyId ?? null,
  }),
  // R3-D · the parameter set actually in force: the learner's own fitted
  // weights when srsPrefs.fsrs passed the gate, the pinned defaults otherwise
  params: () => ({
    custom: !!srsCustom,
    source: srsCustom ? srsCustom.source : null,
    basedOnReviews: srsCustom ? srsCustom.basedOnReviews : null,
    w: srsParams ? Array.from(srsParams.w) : null,
  }),
  schedulerInstant: (lastReviewIso, nowMs) =>
    srsSchedulerInstant(
      lastReviewIso ? { last_review: new Date(lastReviewIso) } : {},
      new Date(nowMs),
    ).toISOString(),
  dueKeys: () => srsDueItems().map((i) => srsKey(i.t, i.id)),
  prefs: () => ({ newPerDay: srsNewPerDay(), reviewLimit: srsReviewLimit() }),
  session: () =>
    S.review
      ? { queue: S.review.queue.length, ix: S.review.ix, deferred: S.review.deferred ?? 0 }
      : null,
});
/** The card back, by kind — reading and meaning from the same records the
 * entry sheets read, so the session and the dictionary never disagree. */
function reviewBack(item) {
  if (item.t === 'word') {
    const rec = lookup(item.id);
    if (rec) return { reading: rec.r || '', senses: (rec.m || []).slice(0, 4) };
  }
  if (item.t === 'kanji') {
    const k = D.kanji[item.id];
    if (k)
      return {
        reading: [...(k.on || []), ...(k.kun || [])].slice(0, 6).join('・'),
        senses: [k.m].filter(Boolean),
      };
  }
  if (item.t === 'radical') {
    const r = D.radicals[item.id];
    if (r) return { reading: '', senses: [r.name || tx('名称のない部品', 'an unnamed part')] };
  }
  if (item.t === 'idiom') {
    const i = D.idioms[item.id];
    if (i) return { reading: i.r || '', senses: (i.g || []).slice(0, 3) };
  }
  if (item.t === 'grammar') {
    const g = GRAMMARS().find((x) => x.id === item.id);
    if (g) {
      const ex = g.ex?.[0];
      return {
        reading: g.form || '',
        senses: [bi() ? g.mEn : g.mJa || g.mEn, ...(ex ? [`${ex.ja} — ${ex.en}`] : [])],
      };
    }
  }
  if (item.t === 'particle') {
    const pt = PARTICLES.find((x) => x.id === item.id);
    if (pt) {
      const ex = pt.ex?.[0];
      return {
        reading: pt.r && pt.r !== pt.p ? pt.r : '',
        senses: [bi() ? pt.role : pt.roleJa || pt.role, ...(ex ? [`${ex.ja} — ${ex.en}`] : [])],
      };
    }
  }
  return { reading: '', senses: [tx('この層に記録がない。', 'No record in this layer.')] };
}
function renderReview(main) {
  const rv = S.review;
  // a focus block keeps the queue full: when the cards run dry before the
  // clock, draw the next lap from the pool so drilling never stalls — and
  // laps after the first are PRACTICE (POL-12): the schedule already took
  // its one honest grade per card this block; repeats stamp 稽古 evidence
  // rows, never a second mutation
  if (rv && S.focus && !S.focus.ended && rv.ix >= rv.queue.length && Date.now() < S.focus.deadline) {
    refillFocusQueue(rv);
  }
  if (!rv || !scheduler || !fsrsApi) {
    main.append(withEn(el('p', 'eyebrow', S.focus ? '集中' : '復習'), S.focus ? 'focus' : 'review', 'en-inline'));
    main.append(el('div', 'sem-empty', tx('復習を始められない。', 'No session to run.')));
    return;
  }
  if (rv.ix >= rv.queue.length) {
    main.append(withEn(el('p', 'eyebrow', S.focus ? '集中' : '復習'), S.focus ? 'focus' : 'review', 'en-inline'));
    // count grades pressed, not queue rows — re-inserted learning passes
    // would otherwise inflate the goodbye number
    const n = rv.done.again + rv.done.hard + rv.done.good + rv.done.easy;
    main.append(el('h1', 'view-title', tx(`復習おわり — ${n} 件`, `Session done — ${n} card${n === 1 ? '' : 's'}`)));
    const sum = el('div', 'review-summary');
    const labels = { again: ['もう一度', 'again'], hard: ['難しい', 'hard'], good: ['ふつう', 'good'], easy: ['簡単', 'easy'] };
    for (const key of ['again', 'hard', 'good', 'easy'])
      if (rv.done[key]) sum.append(el('span', 'pool-tag', `${tx(labels[key][0], labels[key][1])} ${rv.done[key]}`));
    main.append(sum);
    // the bounded sitting's honest remainder: what the freeze left for the
    // next sitting, said quietly, never queued behind the glass
    if (!S.focus && rv.deferred) {
      main.append(
        el('p', 'srs-forecast review-deferred', tx(`あと ${rv.deferred} 件`, `${rv.deferred} more waiting`)),
      );
    }
    // the struggling cards, by name (each once) — a rest offered, never imposed
    const leechSeen = new Set();
    const leeches = rv.queue.filter((i) => {
      const k = srsKey(i.t, i.id);
      if (leechSeen.has(k)) return false;
      leechSeen.add(k);
      return true;
    }).filter(isLeech);
    if (leeches.length) {
      main.append(withEn(el('p', 'eyebrow list-head', '苦手な札'), 'cards that keep slipping', 'en-inline'));
      main.append(
        el(
          'p',
          'gloss',
          tx(
            '何度も戻ってくる札。休ませるのも手 — リストから、いつでも起こせる。',
            'These keep coming back. Letting one rest is a fair move — you can wake it from the list whenever you like.',
          ),
        ),
      );
      for (const item of leeches) {
        const row = el('div', 'leech-row');
        row.append(el('span', 'w', item.label));
        const rest = biLabel('button', 'chip', '休ませる', 'let it rest');
        rest.type = 'button';
        rest.dataset.leechRest = item.id;
        rest.addEventListener('click', () => {
          // a rest is deck state — commit the copy, then show it (P0-4)
          const suspended = { ...S.suspended, [srsKey(item.t, item.id)]: Date.now() };
          if (commitStorePatch({ suspended })) render();
        });
        row.append(rest);
        main.append(row);
      }
    }
    renderAiCoach(main, rv);
    const out = biLabel('button', 'take', 'リストへ', 'back to lists');
    out.type = 'button';
    out.addEventListener('click', () => {
      S.review = null;
      S.view = 'tray';
      render();
    });
    main.append(out);
    renderReviewUndo(main, rv);
    return;
  }
  // A re-inserted learning card may not have ripened yet. The nearest-ripening
  // card comes forward (a ready card is always nearest). A short beat — the
  // 1-minute step — is honoured with a quiet countdown: that pause IS the
  // step. A longer gap is pulled early instead of parking the learner
  // (Anki's learn-ahead), and the engine's same-day math prices early passes
  // correctly. The dojo skips all of this — drilling early is its point.
  if (!S.focus) {
    const nowMs = Date.now();
    const dueAt = (q) => {
      const rec = S.srs[srsKey(q.t, q.id)];
      return rec ? new Date(rec.due).getTime() : 0; // never-seen cards are always ready
    };
    if (dueAt(rv.queue[rv.ix]) > nowMs) {
      let best = rv.ix;
      for (let k = rv.ix + 1; k < rv.queue.length; k++) {
        if (dueAt(rv.queue[k]) < dueAt(rv.queue[best])) best = k;
      }
      if (best !== rv.ix) {
        const held = rv.queue[rv.ix];
        rv.queue[rv.ix] = rv.queue[best];
        rv.queue[best] = held;
      }
      const left = dueAt(rv.queue[rv.ix]) - nowMs;
      if (left > 0 && left <= REVIEW_WAIT_HOLD_MS && !rv.showEarly) {
        renderReviewWait(main, rv, dueAt(rv.queue[rv.ix]));
        return;
      }
      // いま見る holds for the WHOLE card, not for one render. Clearing it as
      // the front face painted meant the next render — the one the learner's
      // own 思い出した/まだ triggers — fell back into the countdown and hid
      // the answer they had just asked for. advanceReviewSession retires the
      // flag when the card is done.
    }
  }
  const item = rv.queue[rv.ix];
  // ZEN — while a card is up there is nothing on the glass but the card.
  // Progress is a hairline, not a count. One quiet way out. Everything
  // secondary (undo · rest · the full entry) waits behind one faint mark.
  const progress = el('div', 'zen-progress');
  const fill = el('i');
  fill.style.width = `${Math.min(100, Math.round((rv.ix / rv.queue.length) * 100))}%`;
  progress.append(fill);
  main.append(progress);
  if (!S.focus) {
    // the dojo has its own quiet clock and door; plain review gets one ×
    const exit = el('button', 'zen-exit', '×');
    exit.type = 'button';
    exit.id = 'zen-exit';
    exit.setAttribute('aria-label', tx('復習を閉じる', 'leave the session'));
    exit.addEventListener('click', () => {
      S.review = null;
      S.view = 'tray';
      render();
    });
    main.append(exit);
  }
  const moreBtn = el('button', 'zen-more' + (S.reviewMore ? ' open' : ''), '…');
  moreBtn.type = 'button';
  moreBtn.id = 'zen-more';
  moreBtn.setAttribute('aria-expanded', String(!!S.reviewMore));
  moreBtn.setAttribute('aria-label', tx('その他', 'more'));
  moreBtn.addEventListener('click', () => {
    S.reviewMore = !S.reviewMore;
    render();
  });
  main.append(moreBtn);

  // Anki's cloze, fed by the corpus: every other repetition of a word that
  // lives in real sentences is asked inside one — the blank holds the
  // word's place, the context does the asking. A context the learner chose
  // at capture (この文 / 段落) outranks the corpus draw and shows every
  // time. No hand-made cards; the schedule is the same one card either way.
  let cloze = null;
  if (item.t === 'word') {
    // warm the bank; if it lands while THIS answer face is up, repaint once
    // so the reveal never sits on an emptiness the corpus could fill
    if (!D.exampleBank?.has(item.id)) {
      ensureBankExamples(item.id).then((entries) => {
        if (entries.length && S.view === 'review' && S.review?.queue[S.review.ix] === item && S.review.revealed) {
          render();
        }
      });
    }
    cloze = takenContext(item);
    if (!cloze && (S.srs[srsKey('word', item.id)]?.reps || 0) % 2 === 1) {
      cloze = findExamples(item.id, 1)[0] || null;
    }
  }
  const face = el('div', 'review-face');
  if (cloze) {
    const line = el('p', 'review-cloze');
    // the card's sentence carries the reader's full gesture grammar — every
    // word tap-circles, holds float its definition
    renderSentenceTokens(line, cloze.tokens, {
      targetId: item.id,
      hideTarget: !rv.revealed,
      contextId: cloze.passage || 'bank',
    });
    if (rv.revealed) line.append(sentenceDoor(cloze, item.id));
    face.append(line);
    if (rv.revealed) face.append(el('div', 'review-front', item.label));
  } else {
    face.append(el('div', 'review-front', item.label));
  }
  if (rv.revealed) {
    const backc = reviewBack(item);
    if (backc.reading) face.append(el('div', 'review-reading', backc.reading));
    for (const s of backc.senses) face.append(el('div', 'review-sense', s));
    // the answer face carries the word in the wild: up to two real
    // sentences, every token ladder-live (operator's law — a card never
    // opens onto zero examples where the corpus holds any)
    if (item.t === 'word') {
      const clozeText = cloze ? cloze.tokens.map((t) => t.s).join('') : null;
      const exs = findExamples(item.id, 3)
        .filter((ex) => ex.tokens.map((t) => t.s).join('') !== clozeText)
        .slice(0, 2);
      for (const ex of exs) {
        const line = el('p', 'review-example');
        renderSentenceTokens(line, ex.tokens, { targetId: item.id, contextId: ex.passage || 'bank' });
        line.append(sentenceDoor(ex, item.id));
        face.append(line);
      }
    }
  }
  main.append(face);

  if (S.reviewMore) {
    const moreRow = el('div', 'zen-more-row');
    renderReviewUndo(moreRow, rv);
    const rest2 = biLabel('button', 'chip review-rest', '休ませる', 'rest this card');
    rest2.type = 'button';
    rest2.id = 'review-rest';
    rest2.addEventListener('click', () => {
      const key = srsKey(item.t, item.id);
      // the rest commits before the session moves — a failed persist keeps
      // the card up and the alert speaks (P0-4)
      const suspended = { ...S.suspended, [key]: Date.now() };
      if (!commitStorePatch({ suspended })) {
        render();
        return;
      }
      rv.history.push({ key: 'suspend' });
      rv.ix += 1;
      rv.revealed = false;
      rv.declared = null;
      S.reviewMore = false;
      render();
    });
    moreRow.append(rest2);
    if (rv.revealed) {
      const door = biLabel('button', 'chip', 'ページへ', 'full entry');
      door.type = 'button';
      door.addEventListener('click', () => go({ t: item.t, id: item.id }));
      moreRow.append(door);
    }
    main.append(moreRow);
  }

  if (!rv.revealed) {
    // 想起の二道 applies wherever the SCHEDULE is at stake. The exemption was
    // keyed on being inside a focus block, and gave its own reason: "a
    // drill-only grade is practice evidence, not a scheduled review". That
    // reason is true of a drill pass and false of lap one in 覚えるの札 —
    // the dojo's DEFAULT mode, where focusPool('due') returns real due cards
    // and commitStandardGrade writes srs, revlog and stats. So a card due now
    // went out 34 days on a grade pressed after reading the answer, with
    // nothing in the durable record to tell it from an honest Easy
    // (E3 round-D, srs-wiring lens).
    //
    // The exemption now follows its own stated reason: a bare turn-over
    // belongs to PRACTICE. Where the grade is real, the declaration is the
    // door — in every room.
    if (practiceOnlyGrade(item)) {
      // the dojo keeps its single turn-over for practice — drilling early is
      // its point, and a practice grade promises the schedule nothing.
      const turnOver = () => {
        rv.revealed = true;
        handKeyboardTo('.grade-row .grade');
        render();
      };
      face.addEventListener('click', turnOver);
      const btn = biLabel('button', 'take review-reveal', '答えを見る', 'show the answer');
      btn.type = 'button';
      btn.id = 'reveal';
      btn.addEventListener('click', turnOver);
      main.append(btn);
      return;
    }
    // 想起の二道 — the kernel law (ADR-002 T-06): a learner who saw the
    // answer before recalling did not recall it. So the front face asks the
    // only honest question first — did it come back? — and the answer is
    // what turns the card over: 思い出した opens all four grades; まだ
    // opens the back for study with Again as the one grade the schedule
    // will record. There is no bare reveal in this room — the declaration
    // IS the door. It lands in the observation ledger like the reader's
    // tap ladder (debounce-persisted); the forcing itself rides rv.declared
    // in session state and the synchronous grade commit.
    const declare = (declared) => {
      rv.declared = declared;
      rv.revealed = true;
      obsLog('reveal', srsKey(item.t, item.id), declared);
      // まだ leaves Again as the one grade the schedule will record, so that
      // is where the keyboard lands; 思い出した opens all four and lands on
      // the first of them.
      handKeyboardTo(declared ? '.grade-row .grade' : '.grade.g-again');
      render();
    };
    const declRow = el('div', 'declare-row');
    const notyet = biLabel('button', 'take declare-notyet', 'まだ', 'not yet');
    notyet.type = 'button';
    notyet.id = 'declare-notyet';
    notyet.addEventListener('click', () => declare(0));
    const recalled = biLabel('button', 'take declare-recalled', '思い出した', 'I recalled it');
    recalled.type = 'button';
    recalled.id = 'declare-recalled';
    recalled.addEventListener('click', () => declare(1));
    declRow.append(notyet, recalled);
    main.append(declRow);
    return;
  }
  const now = new Date();
  const card = srsCardOf(item, now);
  // the monotonic clamp (srsSchedulerInstant): the four previews and the
  // committed grade all price the card at the same never-decreasing instant
  const schedNow = srsSchedulerInstant(card, now);
  const result = scheduler.repeat(card, schedNow);
  // 道場の礼 — a focus drill on a card the learner never TOOK is exposure,
  // not deck membership (P0, full-instrument review): grading it must not
  // mint FSRS state the due queue can never surface (srsDueItems walks
  // S.taken only), must not write revlog rows for a card that does not
  // exist, and must not burn one of the day's new-card slots. The same
  // rite covers the refill's second lap (POL-12): a card this block
  // already graded took its one honest schedule grade — a repeat pass
  // (item.drillPass, stamped by refillFocusQueue) is practice, never a
  // same-minute remutation of the long-term schedule. The drill still
  // behaves like a session — short ratings repeat in-session, the
  // judgment lands in the observation ledger as evidence (the drill room
  // rides the row), and undo takes it back.
  // …and the same is true of a row the learner captured but never STARTED.
  // The no-debt law (PR70-P1-1) says a cardless 覚える row joins the deck only
  // through its own 始める; srsDueItems honours that, so a dojo grade on such
  // a row would mint FSRS state the review queue can never surface — the very
  // orphan this predicate exists to prevent, one step further out. Practice
  // it, record the evidence, leave the enrolment to the learner.
  // …and above both: a row that has LEFT 覚える is not in the deck at all.
  // The rite keyed on FSRS-state absence and on being inside a focus block,
  // so it could not see a card the learner un-memorised mid-session — through
  // ページへ, one chip away from 休ませる. Grading it did all three prohibited
  // things at once: advanced a schedule, wrote a revlog row, and spent a
  // new-card slot, for a key srsDueItems can never surface again. Worse, the
  // pushed-forward due date survived a re-take, so the word came back months
  // late (E3 round-C, srs-wiring lens). Deck membership is now the first
  // question, and it is asked in every room, not only the dojo.
  const drillOnly = practiceOnlyGrade(item);
  const row = el('div', 'grade-row');
  if (drillOnly) row.setAttribute('data-practice', '');
  // S4 hanko: each grade is stamped as a seal — 再難良易 — with its EN key and
  // honest FSRS interval kept beneath (suites and screen readers select
  // those). A drill-only card schedules nothing, so its seals promise no
  // next-due — each stamps 稽古, practice, and that is the whole truth.
  const grades = [
    ['Again', 'again', 'もう一度', '再'],
    ['Hard', 'hard', '難しい', '難'],
    ['Good', 'good', 'ふつう', '良'],
    ['Easy', 'easy', '簡単', '易'],
  ];
  // まだ was declared: the answer was seen before recall, so Again is the
  // only grade this room may record (T-06). The row holds the one honest
  // seal instead of three dead promises — and the commit below derives the
  // rating from the DECLARATION, never from the button, so no later tap
  // can outrun the law even if a stray node were clicked.
  // …and the forcing itself was switched off inside a focus block for the
  // same false reason. It follows the schedule now: まだ means Again wherever
  // a grade is real, and a practice grade needs no forcing because it
  // promises the schedule nothing (E3 round-D, srs-wiring lens).
  const notRecalled = !drillOnly && rv.declared === 0;
  if (!S.focus && rv.declared != null) {
    row.setAttribute('data-declared', notRecalled ? 'notyet' : 'recalled');
  }
  for (const [rating, key, ja, sealChar] of grades) {
    if (notRecalled && rating !== 'Again') continue;
    const next = result[fsrsApi.Rating[rating]].card;
    const ms = next.due.getTime() - schedNow.getTime();
    const when = drillOnly
      ? tx('稽古', 'practice')
      : next.scheduled_days >= 1
        ? tx(`${next.scheduled_days} 日`, `${next.scheduled_days} d`)
        : tx(`${Math.max(1, Math.round(ms / 60000))} 分`, `${Math.max(1, Math.round(ms / 60000))} min`);
    const b = el('button', `grade hanko g-${key}`);
    b.type = 'button';
    b.append(el('span', 'g-seal', sealChar));
    b.append(el('span', 'g-label', tx(ja, key)));
    b.append(el('span', 'g-when', when));
    b.addEventListener('click', () => {
      // the stamp that was just pressed goes with the card it graded, so the
      // by-name restore cannot find it — the keyboard is handed to whatever
      // face comes next: a card's own first gate, or the session's summary
      handKeyboardTo('#declare-recalled, #reveal, #zen-more');
      const day = dayKey();
      const skey = srsKey(item.t, item.id);
      // T-06 forcing at the commit: after まだ, the declaration names the
      // grade — whatever was tapped, Again is what the schedule records
      const effRating = notRecalled ? 'Again' : rating;
      const effKey = notRecalled ? 'again' : key;
      const next = result[fsrsApi.Rating[effRating]].card;
      const prevRec = S.srs[skey];
      if (drillOnly) {
        if (
          !commitDrillGrade({
            rv,
            item,
            next,
            key: effKey,
            skey,
            rating: fsrsApi.Rating[effRating],
            mode: S.focus?.mode,
            now,
          })
        ) {
          render();
          return;
        }
        render();
        return;
      }
      if (
        !commitStandardGrade({
          rv,
          item,
          card,
          next,
          key: effKey,
          skey,
          rating: fsrsApi.Rating[effRating],
          now,
          schedNow,
          day,
          prevRec,
        })
      ) {
        render();
        return;
      }
      render();
    });
    row.append(b);
  }
  main.append(row);
  // rest · undo · the full entry live behind the … mark — the zen glass
  // holds only the card and the four honest buttons
}
/* The quiet beat between learning steps: every remaining card is a short
 * step that hasn't ripened. The glass keeps its zen — a soft count, one way
 * out — and turns the next card over by itself the moment the step matures.
 * Beats longer than this are pulled early instead of held. */
const REVIEW_WAIT_HOLD_MS = 90000;
let reviewWaitTimer = null;
function renderReviewWait(main, rv, nearestDueMs) {
  const progress = el('div', 'zen-progress');
  const fill = el('i');
  fill.style.width = `${Math.min(100, Math.round((rv.ix / rv.queue.length) * 100))}%`;
  progress.append(fill);
  main.append(progress);
  const exit = el('button', 'zen-exit', '×');
  exit.type = 'button';
  exit.id = 'zen-exit';
  exit.setAttribute('aria-label', tx('復習を閉じる', 'leave the session'));
  exit.addEventListener('click', () => {
    clearTimeout(reviewWaitTimer);
    S.review = null;
    S.view = 'tray';
    render();
  });
  main.append(exit);
  const face = el('div', 'review-face zen-wait');
  const left = Math.max(0, nearestDueMs - Date.now());
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  face.append(el('div', 'zen-wait-clock', `${mm}:${String(ss).padStart(2, '0')}`));
  face.append(
    el('p', 'zen-wait-note', tx('つぎの札が熟すまで、ひと息。', 'The next card is ripening — one breath.')),
  );
  const early = biLabel('button', 'chip zen-wait-skip', 'いま見る', 'show it now');
  early.type = 'button';
  early.id = 'zen-wait-skip';
  early.addEventListener('click', () => {
    clearTimeout(reviewWaitTimer);
    rv.showEarly = true;
    render();
  });
  face.append(early);
  face.setAttribute('data-review-wait', '');
  main.append(face);
  clearTimeout(reviewWaitTimer);
  reviewWaitTimer = setTimeout(
    () => {
      if (S.view === 'review' && S.review === rv) render();
    },
    Math.min(1000, Math.max(120, left)),
  );
}

/* Anki's most-used safety: the last grade can always be taken back — the
 * previous card state is restored exactly, never recomputed. Reachable from
 * every state of the session, the summary included. */
function renderReviewUndo(main, rv) {
  if (!rv.history.length) return;
  const undo = biLabel('button', 'chip review-undo', 'ひとつ戻す', 'undo last grade');
  undo.type = 'button';
  undo.addEventListener('click', () => {
    const last = rv.history[rv.history.length - 1];
    const prevItem = rv.queue[rv.ix - 1];
    if (!last || !prevItem) return;
    const key = srsKey(prevItem.t, prevItem.id);
    // the take-back is built off-side and committed as ONE envelope; only a
    // durable undo moves the session back — a failed persist keeps the
    // grade, the history entry, and the glass exactly as they were (P0-4)
    const patch = {};
    if (last.key === 'suspend') {
      // a rest is taken back whole: wake the card, no schedule was touched
      const suspended = { ...S.suspended };
      delete suspended[key];
      patch.suspended = suspended;
    } else if (last.drill) {
      // a dojo drill is taken back from the observation ledger, never from
      // FSRS state — detail 0 files the revocation beside the judgment
      patch.obslog = [...(S.obslog || []), [Date.now(), 'dojo', key, 0]];
    } else {
      const srs = { ...S.srs };
      if (last.prev === undefined) delete srs[key];
      else srs[key] = last.prev;
      patch.srs = srs;
      // the log is append-only: an undo never erases the row it takes back —
      // it files a revocation pointing at it, so history stays whole
      if (last.logIx != null) {
        patch.revlog = [...(S.revlog || []), [Date.now(), key, 0, last.logIx]];
      }
      const st = last.day && S.stats?.[last.day];
      if (st) {
        const day = { ...st, n: Math.max(0, (st.n || 0) - 1) };
        if (last.key === 'again') day.again = Math.max(0, (st.again || 0) - 1);
        if (last.introduced && st.nnew) day.nnew = st.nnew - 1;
        patch.stats = { ...S.stats, [last.day]: day };
      }
    }
    if (!commitStorePatch(patch)) {
      render();
      return;
    }
    rv.history.pop();
    if (last.key !== 'suspend') {
      rv.done[last.key] -= 1;
      // if this grade re-queued a learning step, remove that pending copy
      if (last.reinserted) {
        const tail = rv.queue.lastIndexOf(prevItem);
        if (tail > rv.ix - 1) rv.queue.splice(tail, 1);
      }
    }
    rv.ix -= 1;
    rv.revealed = false;
    rv.declared = null;
    render();
  });
  main.append(undo);
}

/* ------------------------------------------------------------- 集中道場
 * A focus room: pick a Pomodoro length (5·10·20·40) and what to drill — the
 * cards due across your list, or a kanji-only study run — and the corridor's
 * real FSRS session runs inside a countdown. When the cards run dry before the
 * clock, it keeps drilling; when the clock runs out, the block ends gently.
 * S.focus is session-only; nothing here changes how a card is scheduled. */
const FOCUS_MINUTES = [5, 10, 20, 40];
let focusTicker = null;

function fmtClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function stopFocusTicker() {
  if (focusTicker) {
    clearInterval(focusTicker);
    focusTicker = null;
  }
}
function startFocusTicker() {
  stopFocusTicker();
  focusTicker = setInterval(() => {
    if (!S.focus || (S.view !== 'review' && S.view !== 'probe')) {
      stopFocusTicker();
      return;
    }
    const left = S.focus.deadline - Date.now();
    const clock = document.getElementById('focus-clock');
    if (clock) clock.textContent = fmtClock(left);
    if (left <= 0 && !S.focus.ended) {
      S.focus.ended = true;
      stopFocusTicker();
      render();
    }
  }, 1000);
}
function endFocus() {
  stopFocusTicker();
  S.focus = null;
}
const focusKanjiItem = (ch) => ({ t: 'kanji', id: ch, label: ch, kind: '漢字', kindEn: 'kanji' });

/** The card pool for a mode: due cards from the list, or a kanji study run
 * (your taken kanji first, then common kanji easiest-first). */
function focusPool(mode) {
  if (mode === 'kanji') {
    // 漢字だけ is a STUDY RUN, not a review queue: it draws in kanji order and
    // ignores dueness by design, so it must never regrade or mint what the
    // queue was not going to surface. Pre-fix it did both — a 30-day mature
    // card met here fell to relearning, and a started row minted FSRS state
    // straight past the learner's 新規/日 (E3 round-B, srs-wiring lens).
    // A card the queue WOULD have drawn at this instant still schedules, so
    // no real work is lost; everything else is practice and stamps 稽古.
    const dueNow = new Set(srsDueItems().map((i) => srsKey(i.t, i.id)));
    const asDrawn = (item) =>
      dueNow.has(srsKey(item.t, item.id)) ? item : { ...item, practiceOnly: true };
    const seen = new Set();
    const out = [];
    for (const i of S.taken) if (i.t === 'kanji' && !seen.has(i.id)) (seen.add(i.id), out.push(asDrawn(i)));
    const deck = Object.values(D.kanji)
      .filter((k) => D.kmeta?.[k.c]?.jlpt)
      .sort((a, b) => jlptRank(D.kmeta[a.c].jlpt) - jlptRank(D.kmeta[b.c].jlpt) || a.st - b.st);
    for (const k of deck) if (!seen.has(k.c)) (seen.add(k.c), out.push(asDrawn(focusKanjiItem(k.c))));
    return out;
  }
  return srsDueItems();
}
function refillFocusQueue(rv) {
  const f = S.focus;
  if (!f || !f.pool.length) return false;
  for (let i = 0; i < FOCUS_BATCH; i++) {
    const item = f.pool[f.cursor % f.pool.length];
    // 二周目からは稽古 (POL-12): once the cursor has walked the whole pool,
    // every further draw is a PRACTICE pass — the block's first grade stays
    // the only one that touched the long-term schedule. The copy marks the
    // lap, the seals stamp 稽古, and the grade path files a 'dojo' evidence
    // row instead of regrading a card that is no longer due.
    rv.queue.push(f.cursor >= f.pool.length ? { ...item, drillPass: true } : item);
    f.cursor += 1;
  }
  return true;
}
function startFocus(min, mode) {
  if (mode === 'yomi') return startProbe(min);
  const pool = focusPool(mode);
  if (!pool.length) {
    S.focusEmpty = mode;
    render();
    return;
  }
  S.focusEmpty = null;
  const first = pool.slice(0, Math.min(pool.length, FOCUS_BATCH));
  S.focus = { min, mode, deadline: Date.now() + min * 60000, ended: false, pool, cursor: first.length };
  S.review = { queue: first.slice(), ix: 0, revealed: false, declared: null, done: { again: 0, hard: 0, good: 0, easy: 0 }, history: [] };
  S.view = 'review';
  startFocusTicker();
  handKeyboardTo('#declare-recalled, #reveal, #zen-more');
  render();
}

/** The fixed countdown strip shown while a focus block runs. */
function renderFocusHud(root) {
  if (!S.focus || (S.view !== 'review' && S.view !== 'probe')) return;
  const hud = el('div', 'focus-hud' + (S.focus.ended ? ' done' : ''));
  hud.setAttribute('data-drift-chrome', '');
  const left = el('span', 'focus-hud-left');
  if (S.focus.ended) {
    left.append(el('span', 'focus-badge', tx('集中おわり', 'block complete')));
  } else {
    left.append(el('span', 'focus-badge', tx('集中', 'focus')));
    left.append(el('span', 'focus-clock-el', ''));
    left.querySelector('.focus-clock-el').id = 'focus-clock';
    left.querySelector('#focus-clock').textContent = fmtClock(S.focus.deadline - Date.now());
  }
  hud.append(left);
  const end = biLabel('button', 'focus-hud-end', S.focus.ended ? '道場へ' : '終わる', S.focus.ended ? 'dojo' : 'end');
  end.type = 'button';
  end.addEventListener('click', () => {
    endFocus();
    S.probe = null;
    keepScroll();
    S.view = 'dojo';
    render();
  });
  hud.append(end);
  root.append(hud);
}

/** The dojo lobby: choose a length and what to drill. */
function renderFocus(main) {
  main.append(withEn(el('h1', 'view-title', '集中道場'), 'the focus dojo', 'en-inline'));
  main.append(
    el(
      'p',
      'gloss',
      tx(
        '時間を決めて、静かに札と向き合う。時間が来たら、そっと終わる。',
        'Set a length and sit with the cards. When the time is up, the block ends on its own.',
      ),
    ),
  );

  main.append(withEn(el('p', 'eyebrow', '時間'), 'how long', 'en-inline'));
  const mins = el('div', 'focus-choices');
  S.focusMin = S.focusMin || 20;
  for (const m of FOCUS_MINUTES) {
    const b = el('button', 'focus-chip' + (S.focusMin === m ? ' on' : ''));
    b.setAttribute('aria-pressed', String(S.focusMin === m));
    b.type = 'button';
    b.append(el('span', 'focus-chip-n', String(m)));
    b.append(el('span', 'focus-chip-u', tx('分', 'min')));
    b.addEventListener('click', () => {
      S.focusMin = m;
      render();
    });
    mins.append(b);
  }
  main.append(mins);

  main.append(withEn(el('p', 'eyebrow', '何を'), 'what to drill', 'en-inline'));
  // the lobby counts what はじめる will actually draw. The forecast counts
  // every card ripening before tonight's midnight and every started-but-new
  // row; the POOL admits only what is due at this instant, sliced by the
  // learner's ペース room. Reading the label off the forecast advertised
  // cards the block could not draw — "3 waiting" and then "No cards are
  // waiting" (E3 round-B, srs-wiring lens). The tray's two lines were fixed
  // for exactly this (POL-8); the dojo says it the same way now.
  const forecast = srsForecast();
  const duePool = srsDueItems();
  const laterToday = !duePool.length && forecast.today > 0;
  const dueSub = duePool.length
    ? tx(`${duePool.length} 枚 待っている ・ 二周目からは稽古`, `${duePool.length} waiting · after the first lap, practice`)
    : laterToday
      ? tx(`いまは待っていない ・ 今夜までに ${forecast.today}`, `nothing waiting right now · ${forecast.today} ripen before tonight`)
      : tx('いまは待っていない', 'nothing waiting right now');
  const modes = el('div', 'focus-modes');
  const modeDefs = [
    // the sub tells the whole truth (POL-12): the block reviews each waiting
    // card once; when the clock outlasts the pool, further laps are practice
    ['due', '覚えるの札', 'your due cards', dueSub],
    ['kanji', '漢字だけ', 'kanji only', tx('やさしい順に', 'easiest first')],
    ['yomi', '読み探査', 'yomi probe', tx('まだ取っていない熟語を測る', 'sound out compounds you never took')],
  ];
  S.focusMode = S.focusMode || 'due';
  for (const [id, ja, en, sub] of modeDefs) {
    const b = el('button', 'focus-mode' + (S.focusMode === id ? ' on' : ''));
    b.setAttribute('aria-pressed', String(S.focusMode === id));
    b.type = 'button';
    b.append(withEn(el('span', 'focus-mode-t', ja), en, 'en-inline'));
    b.append(el('span', 'focus-mode-sub', sub));
    b.addEventListener('click', () => {
      S.focusMode = id;
      render();
    });
    modes.append(b);
  }
  main.append(modes);

  if (S.focusEmpty) {
    main.append(
      el(
        'div',
        'sem-empty',
        S.focusEmpty === 'due'
          ? tx('いま待っている札がない。覚えるリストに足すか、漢字だけで始めよう。', 'No cards are waiting. Add some to your list, or start a kanji-only run.')
          : S.focusEmpty === 'yomi'
            ? tx('探査できる熟語が見つからない。', 'No compounds left to probe.')
            : tx('漢字が見つからない。', 'No kanji to drill yet.'),
      ),
    );
  }

  const start = biLabel('button', 'take focus-start', 'はじめる', 'begin the block');
  start.type = 'button';
  start.addEventListener('click', () => startFocus(S.focusMin, S.focusMode));
  main.append(start);
}

/* ------------------------------------------------------------- 読み探査
 * The yomi probe: measure what was never captured. Compounds the learner
 * has NOT taken are sampled stratified across Kanken band × reading type ×
 * head kanji, shown bare (sentence context from the shelf when it has one),
 * and self-graded on one question only — could you read it. A probe is an
 * observation, never a grade: rows land in the obslog, FSRS state is never
 * written. A miss mints the word into 覚える (subject to the same daily
 * cap as any capture); a hit costs nothing. Everything here runs offline
 * from the committed data: dict core + KANJIDIC2 readings + kanken table. */

/** Katakana on-readings and dotted kun-readings become matchable variants:
 * the plain form, the rendaku'd form (first mora voiced), and the sokuon
 * form (final つ/ち/く/き → っ) — enough to recognize 学+校 = がっこう and
 * 人+人 = ひとびと without pretending to be a full morphophonology. */
const YOMI_DAKUTEN = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
  さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
  は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};
const YOMI_HANDAKU = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };
const yomiVariantCache = new Map();
function yomiVariantsOf(ch) {
  if (yomiVariantCache.has(ch)) return yomiVariantCache.get(ch);
  const k = D.kanji?.[ch];
  const out = [];
  const add = (reading, type) => {
    const base = kataToHira(reading).replace(/-/g, '');
    if (!base) return;
    const seen = new Set();
    const sokuon = base.length >= 2 && 'つちくき'.includes(base.at(-1)) ? base.slice(0, -1) + 'っ' : null;
    for (const v of sokuon ? [base, sokuon] : [base]) {
      for (const head of [v[0], YOMI_DAKUTEN[v[0]], YOMI_HANDAKU[v[0]]]) {
        if (!head) continue;
        const form = head + v.slice(1);
        if (!seen.has(form)) {
          seen.add(form);
          out.push([form, type]);
        }
      }
    }
  };
  for (const on of k?.on || []) add(on, 'on');
  for (const kun of k?.kun || []) {
    add(kun.split('.')[0], 'kun'); // the stem alone (compound position)
    if (kun.includes('.')) add(kun.replace('.', ''), 'kun'); // stem + okurigana
  }
  out.sort((a, b) => b[0].length - a[0].length); // greedy: longest first
  yomiVariantCache.set(ch, out);
  return out;
}

/** Classify how a compound is read against its kanji's own readings:
 * 音 (all on), 訓 (all kun), 混 (湯桶/重箱 mixes), 熟 (no per-kanji parse —
 * jukujikun, gikun, or readings beyond the variant model). Honest about
 * its limits: 熟 means "not resolvable here", never a claim about origin. */
function yomiReadingType(word, reading) {
  const target = kataToHira(reading || '');
  if (!target) return '熟';
  const chars = [...word];
  const step = (ci, rest, sawOn, sawKun) => {
    if (ci === chars.length) return rest === '' ? { sawOn, sawKun } : null;
    const ch = chars[ci];
    if (!/[一-鿿々]/.test(ch)) {
      const lit = kataToHira(ch);
      return rest.startsWith(lit) ? step(ci + 1, rest.slice(lit.length), sawOn, sawKun) : null;
    }
    const source = ch === '々' ? chars[ci - 1] : ch;
    for (const [form, type] of source ? yomiVariantsOf(source) : []) {
      if (!rest.startsWith(form)) continue;
      const hit = step(ci + 1, rest.slice(form.length), sawOn || type === 'on', sawKun || type === 'kun');
      if (hit) return hit;
    }
    return null;
  };
  const parsed = step(0, target, false, false);
  if (!parsed) return '熟';
  if (parsed.sawOn && parsed.sawKun) return '混';
  return parsed.sawOn ? '音' : '訓';
}

/** The probe pool: every core-dictionary compound (2+ kanji) the learner has
 * neither taken nor probed, carrying its hardest kanji's Kanken band and its
 * reading type. Built once per session, on first use. */
function buildYomiPool() {
  const takenWords = new Set(S.taken.filter((i) => i.t === 'word').map((i) => i.id));
  const probed = new Set(
    (S.obslog || []).filter((r) => r[1] === 'probe').map((r) => String(r[2]).slice('word:'.length)),
  );
  const pool = [];
  for (const [w, rec] of Object.entries(D.dict)) {
    if (takenWords.has(w) || probed.has(w) || !rec.r || !rec.m?.length) continue;
    const marks = [...w].filter((c) => /[一-鿿々]/.test(c));
    if (marks.length < 2) continue; // 熟語 — compounds are the probe's subject
    let kr = 0;
    let band = null;
    for (const c of new Set(marks.filter((c) => c !== '々'))) {
      const kb = D.kanken?.[c];
      if (!kb) {
        band = null;
        break;
      }
      if (kb.kr > kr) {
        kr = kb.kr;
        band = kb.kk;
      }
    }
    if (!band) continue; // no honest band — leave it out rather than guess
    pool.push({ w, r: rec.r, m: rec.m, band, kr, rt: yomiReadingType(w, rec.r), head: marks[0] });
  }
  return pool;
}

/** One stratified batch: bands round-robin (hardest first), reading types
 * cycled within each band, no head kanji repeated within the batch. */
function drawYomiBatch(pool, drawn, n = FOCUS_BATCH) {
  const byBand = new Map();
  for (const it of pool) {
    if (drawn.has(it.w)) continue;
    if (!byBand.has(it.band)) byBand.set(it.band, { kr: it.kr, cell: [] });
    byBand.get(it.band).cell.push(it);
  }
  const bands = [...byBand.entries()].sort((a, b) => b[1].kr - a[1].kr).map(([name]) => name);
  const usedHeads = new Set();
  const rtCycle = ['音', '訓', '混', '熟'];
  const out = [];
  let rtIx = 0;
  while (out.length < n && bands.length) {
    let advanced = false;
    for (const band of [...bands]) {
      if (out.length >= n) break;
      const cell = byBand.get(band).cell;
      let pick = -1;
      for (let pass = 0; pass < rtCycle.length && pick < 0; pass++) {
        const rt = rtCycle[(rtIx + pass) % rtCycle.length];
        const fits = cell.map((it, ix) => ({ it, ix })).filter(({ it }) => it.rt === rt && !usedHeads.has(it.head));
        if (fits.length) pick = fits[Math.floor(Math.random() * fits.length)].ix;
      }
      if (pick < 0) {
        const fits = cell.map((it, ix) => ({ it, ix })).filter(({ it }) => !usedHeads.has(it.head));
        if (fits.length) pick = fits[Math.floor(Math.random() * fits.length)].ix;
      }
      if (pick < 0 && cell.length) pick = Math.floor(Math.random() * cell.length);
      if (pick >= 0) {
        const it = cell.splice(pick, 1)[0];
        usedHeads.add(it.head);
        drawn.add(it.w);
        out.push(it);
        rtIx += 1;
        advanced = true;
      }
      if (!cell.length) bands.splice(bands.indexOf(band), 1);
    }
    if (!advanced) break;
  }
  return out;
}

const YOMI_RT_LABEL = { 音: ['音読み', 'on'], 訓: ['訓読み', 'kun'], 混: ['混読', 'mixed'], 熟: ['熟字訓など', 'irregular'] };

/* An instrument handle for the verification suites (the __KAIRO_* idiom):
 * read-only access to the probe's classifier and sampler, so acceptance
 * checks exercise the real code instead of a re-implementation. */
window.__KAIRO_PROBE__ = Object.freeze({
  readingType: (w, r) => yomiReadingType(w, r),
  poolStats: () => {
    const pool = buildYomiPool();
    const bands = {};
    const rts = {};
    for (const it of pool) {
      bands[it.band] = (bands[it.band] || 0) + 1;
      rts[it.rt] = (rts[it.rt] || 0) + 1;
    }
    return { n: pool.length, bands, rts };
  },
  drawStats: (n = FOCUS_BATCH) => {
    const batch = drawYomiBatch(buildYomiPool(), new Set(), n);
    return {
      n: batch.length,
      heads: new Set(batch.map((b) => b.head)).size,
      bands: new Set(batch.map((b) => b.band)).size,
      words: batch.map((b) => `${b.w}:${b.band}:${b.rt}`),
    };
  },
});

function startProbe(min) {
  D.yomiPool ||= buildYomiPool();
  const drawn = new Set();
  const queue = drawYomiBatch(D.yomiPool, drawn, FOCUS_BATCH);
  if (!queue.length) {
    S.focusEmpty = 'yomi';
    render();
    return;
  }
  S.focusEmpty = null;
  S.focus = { min, mode: 'yomi', deadline: Date.now() + min * 60000, ended: false, drawn };
  S.probe = { queue, ix: 0, revealed: false, right: 0, missed: [], minted: 0 };
  S.view = 'probe';
  startFocusTicker();
  render();
}

/** The probe room: the same zen glass as 復習 — the word alone, a shelf
 * sentence when one exists, one reveal, two honest answers. */
function renderProbe(main) {
  const pr = S.probe;
  if (!pr) {
    S.view = 'dojo';
    return renderFocus(main);
  }
  // the clock keeps the queue full; once it ends the batch in hand plays out
  if (pr.ix >= pr.queue.length && S.focus && !S.focus.ended && Date.now() < S.focus.deadline) {
    const more = drawYomiBatch(D.yomiPool || [], S.focus.drawn, FOCUS_BATCH);
    if (more.length) pr.queue.push(...more);
  }
  if (pr.ix >= pr.queue.length) {
    main.append(withEn(el('p', 'eyebrow', '読み探査'), 'yomi probe', 'en-inline'));
    const n = pr.right + pr.missed.length;
    main.append(el('h1', 'view-title', tx(`探査おわり — ${n} 語`, `Probe done — ${n} word${n === 1 ? '' : 's'}`)));
    const sum = el('div', 'review-summary');
    sum.append(el('span', 'pool-tag', tx(`読めた ${pr.right}`, `read ${pr.right}`)));
    sum.append(el('span', 'pool-tag', tx(`読めなかった ${pr.missed.length}`, `missed ${pr.missed.length}`)));
    main.append(sum);
    if (pr.missed.length) {
      main.append(
        el(
          'p',
          'gloss',
          tx(
            `落ちた ${pr.minted} 語は札になって、明日からの新しい札に混ざる。`,
            `The ${pr.minted} misses became cards — they join the daily stream of new ones.`,
          ),
        ),
      );
      for (const it of pr.missed) {
        const row = el('div', 'leech-row');
        row.append(el('span', 'w', `${it.w}（${it.r}）`));
        const door = biLabel('button', 'chip', 'ページへ', 'full entry');
        door.type = 'button';
        door.addEventListener('click', () => go({ t: 'word', id: it.w }));
        row.append(door);
        main.append(row);
      }
    }
    const out = biLabel('button', 'take', '道場へ', 'back to the dojo');
    out.type = 'button';
    out.addEventListener('click', () => {
      endFocus();
      S.probe = null;
      S.view = 'dojo';
      render();
    });
    main.append(out);
    return;
  }
  const it = pr.queue[pr.ix];
  const progress = el('div', 'zen-progress');
  const fill = el('i');
  fill.style.width = `${Math.min(100, Math.round((pr.ix / pr.queue.length) * 100))}%`;
  progress.append(fill);
  main.append(progress);

  const face = el('div', 'review-face');
  face.append(el('div', 'review-front', it.w));
  const context = findExamples(it.w, 1)[0];
  if (context) {
    const line = el('p', 'probe-context');
    // full ladder on the neighbours; the probed word itself stays sealed —
    // its reading is the question, and afterward it lives on the answer face
    renderSentenceTokens(line, context.tokens, {
      targetId: it.w,
      contextId: context.passage || 'bank',
    });
    if (pr.revealed) line.append(sentenceDoor(context, it.w));
    face.append(line);
  } else if (!D.exampleBank?.has(it.w) && window.__CORRIDOR_STANDALONE__ !== true) {
    ensureBankExamples(it.w).then((entries) => {
      if (entries.length && S.view === 'probe' && S.probe?.queue[S.probe.ix] === it && !S.probe.revealed) render();
    });
  }
  if (pr.revealed) {
    face.append(el('div', 'review-reading', it.r));
    face.append(el('div', 'review-sense', it.m.slice(0, 3).join('; ')));
    const rt = YOMI_RT_LABEL[it.rt] || YOMI_RT_LABEL['熟'];
    face.append(el('div', 'probe-meta', `漢検${it.band} · ${tx(rt[0], rt[1])}`));
  }
  main.append(face);

  if (!pr.revealed) {
    face.addEventListener('click', () => {
      pr.revealed = true;
      render();
    });
    const btn = biLabel('button', 'take review-reveal', '読みを見る', 'show the reading');
    btn.type = 'button';
    btn.id = 'probe-reveal';
    btn.addEventListener('click', () => {
      pr.revealed = true;
      render();
    });
    main.append(btn);
    return;
  }
  const row = el('div', 'grade-row probe-row');
  const answers = [
    ['again', '読めなかった', 'missed it', false],
    ['good', '読めた', 'read it', true],
  ];
  for (const [tone, ja, en, ok] of answers) {
    const b = el('button', `grade g-${tone}`);
    b.type = 'button';
    b.dataset.probe = ok ? 'right' : 'wrong';
    b.append(el('span', 'g-label', tx(ja, en)));
    b.addEventListener('click', () => {
      const key = srsKey('word', it.w);
      let minted = 0;
      const patch = {};
      if (!ok && !S.taken.some((t) => t.t === 'word' && t.id === it.w)) {
        patch.taken = [
          ...S.taken,
          {
            t: 'word',
            id: it.w,
            label: it.w,
            kind: NODE_KIND.word[0],
            kindEn: NODE_KIND.word[1],
            from: null,
            ts: Date.now(),
            // the learner's own 読めなかった is the choice that mints this
            // card — the probe told them so before they pressed it
            started: Date.now(),
          },
        ];
        minted = 1;
      }
      // the probe is an observation: one obslog row, zero FSRS writes. The
      // mint and its evidence land as ONE commit — a minted card must not
      // wait on the tap debounce, and a failed persist mints nothing
      patch.obslog = [...(S.obslog || []), [Date.now(), 'probe', key, ok ? 3 : 1, minted]];
      if (!commitStorePatch(patch)) {
        render();
        return;
      }
      if (minted) pr.minted += 1;
      if (ok) pr.right += 1;
      else pr.missed.push(it);
      pr.ix += 1;
      pr.revealed = false;
      render();
    });
    row.append(b);
  }
  main.append(row);
}

function renderSchedule(container) {
  const preview = schedulePreview();
  container.append(
    withEn(
      // the scheduler is named for the learner; its internal parameter-set
      // slug (bunki-fsrs6-…) is provenance and stays in exports/debug —
      // it leaked into every entry footer (P2, full-instrument review).
      // When the learner's own fitted weights rule (R3-D), the footer says
      // so: the schedule shown is never passed off as the default's.
      el(
        'p',
        'card-kind',
        tx('予定される復習', 'if you reviewed this now') +
          ' — FSRS-6' +
          (srsCustom ? tx('・自分の記録で調整済み', ' · tuned from your record') : ''),
      ),
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
  // the bank fills what the shelf cannot — already-fetched sentences only
  // (ensureBankExamples warms this cache; callers refresh once it lands)
  const banked = D.exampleBank?.get(id);
  if (banked) {
    const seen = new Set(out.map((ex) => ex.tokens.map((t) => t.s).join('')));
    for (const ex of banked) {
      if (out.length >= cap) break;
      const text = ex.tokens.map((t) => t.s).join('');
      if (!seen.has(text)) {
        seen.add(text);
        out.push(ex);
      }
    }
  }
  return out;
}

/* ------------------------------------------------- 用例の蔵 (example bank)
 * SNOW T15/T23 sentences (CC BY 4.0), tokenised at build time into the
 * corridor's own token grammar and sharded for lazy fetch: a word's index
 * shard names its sentence ids; sentence shards carry [tokens, english].
 * Served build only — the single file keeps shelf sentences and stays
 * honest about the rest. See tools/build_examples.py. */
const EXAMPLE_DIR = 'data/proprietary_safe/examples';
function exampleFnv(word) {
  let h = 0x811c9dc5;
  const bytes = new TextEncoder().encode(word);
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h & 15;
}
function inflateExampleToken(row) {
  const [s, b, r, c, p, f] = row;
  return { s, b, r, c: !!c, p, f: (f || []).map((pair) => (pair[1] ? { t: pair[0], r: pair[1] } : { t: pair[0] })) };
}
async function fetchExampleJson(path) {
  const res = await fetch(`${EXAMPLE_DIR}/${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}
async function ensureBankExamples(word) {
  if (window.__CORRIDOR_STANDALONE__ === true) return [];
  D.exampleBank ||= new Map();
  if (D.exampleBank.has(word)) return D.exampleBank.get(word);
  D.examplePending ||= new Map();
  if (D.examplePending.has(word)) return D.examplePending.get(word);
  const job = (async () => {
    try {
      D.exampleManifest ||= await fetchExampleJson('manifest.json');
      D.exampleIndexShards ||= new Map();
      const ix = exampleFnv(word);
      if (!D.exampleIndexShards.has(ix)) {
        D.exampleIndexShards.set(ix, await fetchExampleJson(`ex-${String(ix).padStart(2, '0')}.json`));
      }
      const sids = D.exampleIndexShards.get(ix)[word] || [];
      const per = D.exampleManifest.sharding.sentsPerShard;
      D.exampleSentShards ||= new Map();
      const entries = [];
      for (const sid of sids) {
        const shard = Math.floor(sid / per);
        if (!D.exampleSentShards.has(shard)) {
          D.exampleSentShards.set(shard, await fetchExampleJson(`s-${String(shard).padStart(2, '0')}.json`));
        }
        const row = D.exampleSentShards.get(shard)[sid - shard * per];
        if (row) {
          const src = D.exampleManifest.sources?.[row[2]] || null;
          entries.push({
            tokens: row[0].map(inflateExampleToken),
            en: row[1] || '',
            source: src ? tx(src.labelJa, src.labelEn) : tx('用例', 'examples corpus'),
            bank: true,
          });
        }
      }
      D.exampleBank.set(word, entries);
      return entries;
    } catch {
      D.exampleBank.set(word, []); // absence recorded — never retried this session
      return [];
    } finally {
      D.examplePending.delete(word);
    }
  })();
  D.examplePending.set(word, job);
  return job;
}

/* ---------------------------------- the reader's ladder, outside the reader
 * Any sentence the app shows — a sheet's 用例, a review cloze, a probe's
 * context line — carries the reader's click grammar, and starts BARE:
 * no furigana until it is asked for (operator's law, 2026-08-12 — the
 * sentence is the exercise; readings on request only, whatever the
 * reader's own dial says). Taps circle exactly as in the reader: first
 * tap ふりがな, second tap the English gloss beneath, third tap closes
 * the circle back to plain kanji. The full entry lives on the holds —
 * a short hold floats the simple definition, a long hold (or a tap on
 * the mini) opens the entry. Each sentence keeps its own quiet ladder
 * state; taps land in the obslog. */
function renderSentenceTokens(container, tokens, opts = {}) {
  const target = opts.targetId || null;
  const contextId = opts.contextId || 'sentence';
  const revealed = new Set();
  const glossed = new Set();
  tokens.forEach((token, index) => {
    if (!token.c || !token.f?.length) {
      container.append(document.createTextNode(token.s));
      return;
    }
    const isTarget = target && token.b === target;
    if (isTarget && opts.hideTarget) {
      container.append(document.createTextNode('＿＿＿'));
      return;
    }
    if (isTarget && !opts.targetLive) {
      // the asked/answered word stands bare and sealed — its reading lives
      // on the answer face, never one accidental tap away
      container.append(el('span', 'example-hit', token.s));
      return;
    }
    // A sentence outside the reader is still a sentence: 用例, the 文 page and
    // the review answer face all ride this ladder, and all three were
    // pointer-only spans — no tab stop, no name, nothing a screen reader
    // could reach, while the reader's own tokens are labelled buttons
    // (E3 round-A, dead-ends lens; CONFIRMED on the head). Same element,
    // same grammar.
    const span = el(
      'button',
      'tok content sentence-tok' + (isTarget ? ' example-hit' : ''),
    );
    span.type = 'button';
    span.setAttribute('aria-haspopup', 'dialog');
    span.setAttribute(
      'aria-label',
      tx(
        `${token.s} · 語 · もう一度で戻る、長押しで全項目`,
        `${token.s} · word · a third activation clears; hold for the full entry`,
      ),
    );
    const paint = () => {
      span.textContent = '';
      span.append(
        wordRow(displayPairs(token), {
          furigana: revealed.has(index) ? 1 : 0,
          revealed: revealed.has(index),
        }),
      );
      if (glossed.has(index)) {
        const g = lookup(token.b);
        if (g?.m?.length) span.append(el('span', 'tok-en', inlineGloss(g)));
      }
    };
    paint();
    // the reader's full gesture grammar, in miniature: taps circle
    // ふりがな → English → plain again; a short hold floats the simple
    // definition, a long hold (or a tap on it) opens the full entry
    const openEntry = () => {
      removeMini();
      if (down) swallowClickUntil = Date.now() + 700; // held release → one ghost click
      obsLog('tap', srsKey('word', token.b), 3, contextId);
      go({ t: 'word', id: token.b });
    };
    const cycle = () => {
      if (!revealed.has(index)) {
        revealed.add(index);
        obsLog('tap', srsKey('word', token.b), 1, contextId);
        paint();
        return;
      }
      if (!glossed.has(index)) {
        glossed.add(index);
        obsLog('tap', srsKey('word', token.b), 2, contextId);
        paint();
        return;
      }
      revealed.delete(index);
      glossed.delete(index);
      paint();
    };
    let miniTimer = null;
    let fullTimer = null;
    let down = null;
    const clearHold = () => {
      clearTimeout(miniTimer);
      clearTimeout(fullTimer);
      miniTimer = fullTimer = null;
    };
    span.addEventListener('contextmenu', (ev) => ev.preventDefault());
    span.addEventListener('pointerdown', (ev) => {
      down = { x: ev.clientX, y: ev.clientY, at: Date.now() };
      miniTimer = setTimeout(() => showMini(span, token, openEntry), GESTURE.MINI_MS);
      fullTimer = setTimeout(openEntry, GESTURE.FULL_MS);
    });
    span.addEventListener('pointermove', (ev) => {
      if (!down) return;
      if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > GESTURE.MOVE_PX) {
        clearHold();
        down = null;
      }
    });
    span.addEventListener('pointercancel', () => {
      clearHold();
      down = null;
    });
    let heldAt = 0;
    span.addEventListener('pointerup', () => {
      if (!down) return;
      const held = Date.now() - down.at;
      down = null;
      clearHold();
      if (held >= GESTURE.MINI_MS) heldAt = Date.now(); // release click stays inert
    });
    span.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // activation on the CLICK — it survives the pointercancel a scrollable
      // sheet hands a plain tap on iOS (the pointerup path never fires there)
      if (Date.now() < swallowClickUntil) return;
      if (heldAt && Date.now() - heldAt < 800) {
        heldAt = 0;
        return;
      }
      cycle();
    });
    container.append(span);
  });
}

/* ------------------------------------------------------------- AI in the app
 * Phase 3 of the operator's order: the AI lives IN the app. The app asks once
 * for an API key, stored on this device only (localStorage — it is sent to
 * api.anthropic.com and nowhere else). With a key present, AI doors appear;
 * without one they are quietly absent — never broken, never nagging. */
const AI_KEY_STORE = 'kairo-ai-key';
function aiKey() {
  try {
    return localStorage.getItem(AI_KEY_STORE) || '';
  } catch {
    return '';
  }
}
/** The learner's rough level, read from what they are actually memorizing. */
function aiLevelGuess() {
  const counts = {};
  for (const item of S.taken) {
    if (item.t !== 'word') continue;
    const l = lookup(item.id)?.jlpt;
    if (l) counts[l] = (counts[l] || 0) + 1;
  }
  let best = 'N5';
  let n = 0;
  for (const [l, c] of Object.entries(counts)) if (c > n) { best = l; n = c; }
  return best;
}
/* The provider seam (ledger: "provider lock-in"): endpoint and model are
 * data with defaults, not code. S.ai carries optional durable { baseUrl,
 * model } overrides — no UI yet; the validated store key is the contract. */
const AI_DEFAULT_BASE_URL = 'https://api.anthropic.com';
const AI_DEFAULT_MODEL = 'claude-opus-5';
/** One request budget, mirroring packages/ai/src/runtime.ts
 * DEFAULT_TIMEOUT_MS (controller §9): ten seconds, enforced by aborting the
 * in-flight request — never by racing a promise and walking away from a
 * live socket. A stalled request used to leave 考え中… on screen until the
 * browser gave up the socket; now it takes each caller's quiet failure line. */
const AI_TIMEOUT_MS = 10000;
function aiProvider() {
  const config = plainRecord(S.ai) ? S.ai : {};
  return {
    baseUrl: nonEmptyString(config.baseUrl) ? config.baseUrl : AI_DEFAULT_BASE_URL,
    model: nonEmptyString(config.model) ? config.model : AI_DEFAULT_MODEL,
  };
}

/* --------------------------------------------------- AIの記録 (the archive)
 * "Not a word is lost" (ledger P1): every learner message and every reply,
 * on every AI surface, lands in an append-only IndexedDB archive — beside
 * the localStorage envelope, whose quota whole transcripts would eat. The
 * archive is memory, never authority: nothing here grades, schedules, or
 * touches FSRS state. And it must never cost a conversation — a failed
 * write is swallowed and counted (the storage layer's never-block posture),
 * the call itself proceeds. Rows are
 * { surface, role: 'user'|'assistant'|'tutor'|'app', content, model, ts,
 *   contextRef? } — 'app' marks the app's own quiet failure line, 'tutor'
 * marks turns migrated from the old capped chat store, whose provenance
 * (reply or failure line) the old shape never recorded. */
const AI_LOG_DB = 'kairo-ai-log';
const AI_LOG_TURNS = 'turns';
let aiLogDbPromise = null;
let aiLogDropped = 0; // turns the archive could not keep — honesty counter

function aiLogOpen() {
  if (aiLogDbPromise) return aiLogDbPromise;
  aiLogDbPromise = new Promise((done) => {
    try {
      const req = indexedDB.open(AI_LOG_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(AI_LOG_TURNS)) {
          req.result.createObjectStore(AI_LOG_TURNS, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null); // private mode etc. — the call goes on
      req.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
  return aiLogDbPromise;
}

/** Empty the archive. Called on IMPORT only: the file is the record, so the
 * conversations of the record being replaced must not outlive it. Unlike the
 * append path this one may NOT be swallowed — importing a record on top of
 * another learner's words is the failure it exists to prevent — so it
 * rejects, and the import stops. */
async function clearAiArchive() {
  const db = await aiLogOpen();
  if (!db) {
    // no archive to clear is the same outcome as an empty one — but a
    // database we cannot open MIGHT hold the old words, so say so
    if (typeof indexedDB === 'undefined') return true;
    throw new Error('archive unavailable');
  }
  await new Promise((done, fail) => {
    try {
      const tx = db.transaction(AI_LOG_TURNS, 'readwrite');
      tx.objectStore(AI_LOG_TURNS).clear();
      tx.oncomplete = () => done(true);
      tx.onerror = () => fail(tx.error || new Error('archive clear failed'));
      tx.onabort = () => fail(tx.error || new Error('archive clear aborted'));
    } catch (err) {
      fail(err);
    }
  });
  aiLogDropped = 0;
  return true;
}

/** Append one turn. Fire-and-forget on the request path — the returned
 * promise (true = durably written) exists for the verification suites. */
async function aiLogAppend(row) {
  try {
    const db = await aiLogOpen();
    if (!db) {
      aiLogDropped += 1;
      return false;
    }
    return await new Promise((done) => {
      const t = db.transaction(AI_LOG_TURNS, 'readwrite');
      t.objectStore(AI_LOG_TURNS).add(row);
      t.oncomplete = () => done(true);
      t.onabort = t.onerror = () => {
        aiLogDropped += 1;
        done(false);
      };
    });
  } catch {
    aiLogDropped += 1;
    return false;
  }
}

/** Put a set of archived turns back — the counterpart of clearAiArchive, so
 * an exported record can carry the learner's conversations home with it.
 * Rows are appended in file order; a row the store refuses is skipped rather
 * than failing the whole restore, and the count of what landed is returned. */
async function aiLogRestore(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const db = await aiLogOpen();
  if (!db) throw new Error('archive unavailable');
  let landed = 0;
  for (const row of rows) {
    if (!plainRecord(row)) continue;
    const copy = { ...row };
    delete copy.id; // the store mints its own key
    // eslint-disable-next-line no-await-in-loop
    if (await aiLogAppend(copy)) landed += 1;
  }
  return landed;
}

/** Every archived turn, oldest first — optionally one surface's. */
async function aiLogAll(surface) {
  try {
    const db = await aiLogOpen();
    if (!db) return [];
    return await new Promise((done) => {
      const rows = [];
      const t = db.transaction(AI_LOG_TURNS, 'readonly');
      const walk = t.objectStore(AI_LOG_TURNS).openCursor();
      walk.onsuccess = () => {
        const cursor = walk.result;
        if (!cursor) {
          done(rows);
          return;
        }
        if (!surface || cursor.value.surface === surface) rows.push(cursor.value);
        cursor.continue();
      };
      t.onabort = t.onerror = () => done(rows);
    });
  } catch {
    return [];
  }
}

async function aiConverse(system, messages, meta = {}) {
  const { baseUrl, model } = aiProvider();
  const surface = meta.surface || 'ai';
  const ref = meta.ref ? { contextRef: meta.ref } : {};
  // the outbound delta: everything after the last assistant turn is new ink —
  // earlier turns were archived when they were first sent or received
  let newFrom = messages.length;
  while (newFrom > 0 && messages[newFrom - 1].role !== 'assistant') newFrom -= 1;
  for (const m of messages.slice(newFrom)) {
    aiLogAppend({ surface, role: m.role, content: m.content, model, ts: Date.now(), ...ref });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let data;
  try {
    // one budget covers headers AND body — a stalled stream is the same stall
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': aiKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        output_config: { effort: 'low' },
        system,
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (data.stop_reason === 'refusal') throw new Error('refusal');
  const reply = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  aiLogAppend({ surface, role: 'assistant', content: reply, model, ts: Date.now(), ...ref });
  return reply;
}
async function aiAsk(system, prompt, meta = {}) {
  return aiConverse(system, [{ role: 'user', content: prompt }], meta);
}

/* An instrument handle for the verification suites (the __KAIRO_* idiom):
 * read-only access to the archive, the provider seam, and the budget, so
 * acceptance checks exercise the real code instead of a re-implementation. */
window.__KAIRO_AI__ = Object.freeze({
  logAll: (surface) => aiLogAll(surface),
  // the suites drive the archive's two lifecycle edges directly
  __seed: (row) => aiLogAppend(row),
  __clear: () => clearAiArchive(),
  dropped: () => aiLogDropped,
  provider: () => aiProvider(),
  timeoutMs: AI_TIMEOUT_MS,
});
/** The newest archived reply for one surface and one word — the read-back
 * seam: an answer that arrived after its sheet closed is not lost, it waits
 * in the archive and the reopened sheet shows it. */
async function aiLastReply(surface, ref) {
  const rows = await aiLogAll(surface);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].role === 'assistant' && rows[i].contextRef === ref) return rows[i].content;
  }
  return null;
}

/** The tutor door on a word entry — present only when a key is stored. */
/* 考え中 is STATE, not a closure. A sheet's tutor and its examples held
 * their in-flight mark only on the button and its box, so any repaint while
 * the tutor was thinking — an EN／日本語 press, a 覚える, a re-render from
 * anywhere — wiped the spinner, re-armed the door, and left the arriving
 * reply painting into a node no longer on the page. The learner saw a bare
 * button and paid for a second request (E3 round-B, ai-surfaces lens).
 * Session-only: a reload must never resurrect a request that is gone. */
const aiPendingKey = (surface, ref) => `${surface}|${ref}`;
const aiPendingOn = (surface, ref) => !!S.aiPending?.[aiPendingKey(surface, ref)];
const aiPendingSet = (surface, ref, on) => {
  S.aiPending ||= {};
  if (on) S.aiPending[aiPendingKey(surface, ref)] = true;
  else delete S.aiPending[aiPendingKey(surface, ref)];
};
/* The reply landed. If the box that asked for it is still on the page, paint
 * it there; if the surface was rebuilt underneath, ask for one more render so
 * the archive read-back can put it back where it belongs. */
const aiSettle = (box, paint) => {
  if (document.contains(box)) paint();
  else if ($('.sheet')) render();
};
/* …and a FAILURE has no archive to be read back from. aiSettle's detached
 * branch asked for a re-render on the assumption the archive would restore
 * what was lost — true of a reply, false of the app's own quiet failure
 * line, which is not an assistant turn and is never archived. So a repaint
 * during a request that then timed out left the learner with silence and a
 * re-armed button instead of "could not answer just now"
 * (E3 round-C, ai-surfaces lens). The line waits here for the next render. */
const aiNoteSet = (surface, ref, text) => {
  S.aiNotes ||= {};
  if (text) S.aiNotes[aiPendingKey(surface, ref)] = text;
  else delete S.aiNotes[aiPendingKey(surface, ref)];
};
const aiNoteFor = (surface, ref) => S.aiNotes?.[aiPendingKey(surface, ref)] || '';

function renderAiTutor(sheet, node, rec) {
  if (!aiKey()) return;
  const wrap = el('div', 'ai-tutor');
  const btn = biLabel('button', 'chip ai-ask', '先生に聞く', 'ask the tutor');
  btn.type = 'button';
  const out = el('div', 'ai-answer');
  const ref = `word:${node.id}`;
  const thinking = tx('考え中…', 'thinking…');
  if (aiPendingOn('word-tutor', ref)) {
    btn.disabled = true;
    out.textContent = thinking;
  } else if (aiNoteFor('word-tutor', ref)) {
    out.textContent = aiNoteFor('word-tutor', ref);
  } else {
    aiLastReply('word-tutor', ref).then((prev) => {
      if (prev && !out.textContent) out.textContent = prev;
    });
  }
  btn.addEventListener('click', async () => {
    if (aiPendingOn('word-tutor', ref)) return;
    aiPendingSet('word-tutor', ref, true);
    aiNoteSet('word-tutor', ref, '');
    btn.disabled = true;
    out.textContent = thinking;
    try {
      const senses = (rec?.m || []).slice(0, 4).join('; ');
      const answer = await aiAsk(
        'You are a Japanese tutor inside a dictionary app. In under 120 words: explain the word\'s nuance and typical use, pitched to the learner\'s level, then give two natural example sentences, each on its own line as: Japanese sentence — reading in kana — English. Plain text only, no headers or markdown.',
        `Word: ${node.id}${rec?.r ? ` (${rec.r})` : ''}. Dictionary senses: ${senses || 'none recorded'}. Learner level: about JLPT ${aiLevelGuess()}.`,
        { surface: 'word-tutor', ref },
      );
      aiPendingSet('word-tutor', ref, false);
      aiSettle(out, () => {
        out.textContent = answer;
      });
    } catch {
      aiPendingSet('word-tutor', ref, false);
      const line = tx('いまは答えられない。あとでもう一度。', 'The tutor could not answer just now — try again in a moment.');
      aiNoteSet('word-tutor', ref, line);
      aiSettle(out, () => {
        out.textContent = line;
      });
    }
    btn.disabled = false;
  });
  wrap.append(btn, out);
  sheet.append(wrap);
}

/* Copious example sentences at every applicable level — generated on demand
 * (operator: "every single word needs copious example sentences at all
 * applicable levels"). Present on every entry when a key is set; quietly
 * absent without one, per the Phase-3 rule. The shelf's own 用例 above stay
 * the always-on, key-free baseline; these layer graded, made-to-order
 * sentences on top, from N5 up to the word's own level. */
function renderAiExamples(sheet, node, rec) {
  if (!aiKey()) return;
  sheet.append(withEn(el('p', 'eyebrow', '例文 — レベル別'), 'examples at every level', 'en-inline'));
  const wrap = el('div', 'ai-tutor');
  const btn = biLabel('button', 'chip ai-ask', '例文をつくる', 'write examples at my level');
  btn.type = 'button';
  const out = el('div', 'ai-examples');
  const wordLv = rec?.jlpt ? String(rec.jlpt).replace(/^N?/, 'N') : aiLevelGuess();
  const paint = (raw) => {
    out.textContent = '';
    let shown = 0;
    for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 4) continue;
      const [lv, ja, read, en] = parts;
      const card = el('div', 'ai-ex');
      const head = el('p', 'ai-ex-ja');
      if (/^N[1-5]$/i.test(lv)) head.append(el('span', 'ai-ex-lv', lv.toUpperCase()));
      head.append(document.createTextNode(ja));
      card.append(head);
      if (read) card.append(el('p', 'ai-ex-read', read));
      if (bi() && en) card.append(el('p', 'ai-ex-en', en));
      out.append(card);
      shown += 1;
    }
    return shown;
  };
  const exRef = `word:${node.id}`;
  const writing = () => {
    out.textContent = '';
    out.append(el('p', 'ai-ex-note', tx('つくっています…', 'writing examples…')));
  };
  if (aiPendingOn('examples', exRef)) {
    btn.disabled = true;
    writing();
  } else if (aiNoteFor('examples', exRef)) {
    out.append(el('p', 'ai-ex-note', aiNoteFor('examples', exRef)));
  } else {
    aiLastReply('examples', exRef).then((prev) => {
      if (prev && !out.childElementCount && !btn.disabled) paint(prev);
    });
  }
  btn.addEventListener('click', async () => {
    if (aiPendingOn('examples', exRef)) return;
    aiPendingSet('examples', exRef, true);
    aiNoteSet('examples', exRef, '');
    btn.disabled = true;
    writing();
    try {
      const senses = (rec?.m || []).slice(0, 4).join('; ');
      const raw = await aiAsk(
        'You are a Japanese tutor inside a dictionary app. Write natural example sentences for the given word across a range of JLPT levels, from N5 up to the word\'s own level, easiest first, 6 to 8 sentences. Output ONE sentence per line and nothing else. Each line MUST be exactly: Nx | Japanese sentence | full reading of the sentence in hiragana | English. No numbering, no markdown, no extra commentary.',
        `Word: ${node.id}${rec?.r ? ` (${rec.r})` : ''}. The word's JLPT level: ${wordLv}. Dictionary senses: ${senses || 'none recorded'}.`,
        { surface: 'examples', ref: exRef },
      );
      aiPendingSet('examples', exRef, false);
      aiSettle(out, () => {
        const shown = paint(raw);
        if (!shown) out.append(el('p', 'ai-ex-note', tx('うまく作れなかった。もう一度どうぞ。', 'Could not format the examples — try once more.')));
      });
    } catch {
      aiPendingSet('examples', exRef, false);
      const line = tx('いまは作れない。あとでもう一度。', 'The tutor could not write examples just now — try again in a moment.');
      aiNoteSet('examples', exRef, line);
      aiSettle(out, () => {
        out.textContent = '';
        out.append(el('p', 'ai-ex-note', line));
      });
    }
    btn.disabled = false;
  });
  wrap.append(btn, out);
  sheet.append(wrap);
}

/* The coach at the end of a review session — the tutor reads the grades
 * and says where to press next. Advice only: the canon's line is AI
 * proposing, never scheduling — FSRS alone decides when cards return, and
 * nothing here writes to the SRS state. Absent without a key. */
function renderAiCoach(main, rv) {
  if (!aiKey()) return;
  const wrap = el('div', 'ai-tutor');
  const btn = biLabel('button', 'chip ai-ask', '先生の一言', 'a word from the tutor');
  btn.type = 'button';
  btn.id = 'ai-coach';
  const out = el('div', 'ai-answer');
  // round B made 考え中 state on the word sheet and stopped there; the coach
  // and the reading room kept theirs in a closure, so a repaint killed the
  // spinner, re-armed the door and lost the arriving reply
  // (E3 round-C, ai-surfaces lens)
  const thinking = tx('考え中…', 'thinking…');
  if (aiPendingOn('coach', 'session')) {
    btn.disabled = true;
    out.textContent = thinking;
  }
  btn.addEventListener('click', async () => {
    if (aiPendingOn('coach', 'session')) return;
    aiPendingSet('coach', 'session', true);
    btn.disabled = true;
    out.textContent = thinking;
    try {
      // history is queue-ordered (grades push sequentially, undo pops)
      const lines = rv.queue.map((item, i) => `${item.label} (${item.t}): ${rv.history[i]?.key || 'ungraded'}`);
      const said = await aiAsk(
        "You are a Japanese tutor inside a flashcard app, speaking just after a review session. In under 110 words of plain text (no headers, no markdown): one sentence on what the session shows, then name the items graded 'again' or 'hard' that deserve another look, then ONE concrete memory hook for the single hardest item. You only advise — the app's scheduler alone decides when cards return, so never promise timings.",
        `Learner level: about JLPT ${aiLevelGuess()}. Session grades:\n${lines.join('\n')}`,
        { surface: 'coach' },
      );
      aiPendingSet('coach', 'session', false);
      aiSettle(out, () => {
        out.textContent = said;
      });
    } catch {
      aiPendingSet('coach', 'session', false);
      aiSettle(out, () => {
        out.textContent = tx('いまは答えられない。あとでもう一度。', 'The tutor could not answer just now — try again in a moment.');
      });
    }
    btn.disabled = false;
  });
  wrap.append(btn, out);
  main.append(wrap);
}

/* The tutor's reading room — 私の読み物. The operator's words for phase 3:
 * the AI "creates custom readings at your level." The passage arrives with
 * readings in full-width parentheses after every kanji word (学校（がっこう）);
 * that single convention is parsed into real ruby, and any base the
 * dictionary knows becomes a door into its entry — the same tap the reader
 * teaches. Persisted, so the reading survives reloads; the whole room is
 * quietly absent without a key. */
function aiReadingSegments(text) {
  const out = [];
  const re = /([㐀-鿿豈-﫿々〆ヶ]+[ぁ-ゖー]*)（([ぁ-ゖァ-ヶー・]+)）/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ base: m[1], ruby: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderAiReading(main) {
  main.append(withEn(el('p', 'eyebrow', '先生の読み物'), 'written for you, at your level', 'en-inline'));
  main.append(el('h1', 'view-title', '私の読み物'));
  const lv = aiLevelGuess();
  const sub = el('p', 'shelf-snippet intro');
  sub.textContent = tx(
    `覚えている語から見て、いまは ${lv} あたり。その高さで先生が短い文章を書く。`,
    `Judging from what you are memorizing, you read at about ${lv}. The tutor writes a short passage at that height.`,
  );
  main.append(sub);

  const btn = biLabel(
    'button',
    'take',
    S.aiReading ? '新しく書いてもらう' : '書いてもらう',
    S.aiReading ? 'ask for a new one' : 'ask the tutor to write one',
  );
  btn.type = 'button';
  btn.id = 'airead-make';
  const note = el('p', 'airead-note');
  // …and the reading room, the third surface round B's fix did not reach
  const writing = tx('先生が書いている…', 'the tutor is writing…');
  if (aiPendingOn('reading', 'room')) {
    btn.disabled = true;
    note.textContent = writing;
  }
  btn.addEventListener('click', async () => {
    if (aiPendingOn('reading', 'room')) return;
    aiPendingSet('reading', 'room', true);
    btn.disabled = true;
    note.textContent = writing;
    try {
      const woven = S.taken.filter((t) => t.t === 'word').slice(-8).map((t) => t.id);
      const text = await aiAsk(
        'You write one short Japanese reading passage inside a learning app. Output ONLY the passage: four to six short sentences of natural Japanese. No title, no translation, no romaji, no commentary, no markdown. Keep vocabulary and grammar at or below the JLPT level the user names. Immediately after every word written with kanji, give its reading in hiragana inside full-width parentheses, like 学校（がっこう） or 食べる（たべる）. Use full-width parentheses for readings and for nothing else.',
        `Level: JLPT ${aiLevelGuess()}. A small scene from everyday life, quietly pleasant.${woven.length ? ` If it stays natural, weave in a few of these words the learner is memorizing: ${woven.join('、')}.` : ''}`,
        { surface: 'reading' },
      );
      // a model may emit a literal backslash-n; never show it as ink.
      // The reading being replaced joins the shelf of earlier ones — built
      // on copies and committed whole; a device that cannot save shows the
      // storage alert and re-arms the button (P0-4)
      const aiReadings = S.aiReading ? [S.aiReading, ...S.aiReadings].slice(0, 10) : S.aiReadings;
      const aiReading = { text: text.replace(/\\n/g, '\n'), lv: aiLevelGuess(), ts: Date.now() };
      aiPendingSet('reading', 'room', false);
      if (commitStorePatch({ aiReading, aiReadings })) {
        render();
        return;
      }
      note.textContent = '';
    } catch {
      aiPendingSet('reading', 'room', false);
      note.textContent = tx('いまは書けない。あとでもう一度。', 'The tutor could not write just now — try again in a moment.');
      render();
    }
    btn.disabled = false;
  });
  main.append(btn, note);

  if (S.aiReading) {
    const body = el('div', 'airead-body');
    for (const para of S.aiReading.text.split(/\n+/)) {
      if (!para.trim()) continue;
      const p = el('p', 'airead-para');
      for (const seg of aiReadingSegments(para)) {
        if (typeof seg === 'string') {
          p.append(document.createTextNode(seg));
          continue;
        }
        const ruby = document.createElement('ruby');
        ruby.append(document.createTextNode(seg.base));
        const rt = document.createElement('rt');
        rt.textContent = seg.ruby;
        ruby.append(rt);
        if (lookup(seg.base)) {
          const hit = el('button', 'airead-hit');
          hit.type = 'button';
          hit.dataset.aireadHit = seg.base;
          hit.append(ruby);
          hit.addEventListener('click', () => go({ t: 'word', id: seg.base }));
          p.append(hit);
        } else {
          p.append(ruby);
        }
      }
      body.append(p);
    }
    main.append(body);
    main.append(
      el(
        'p',
        'airead-meta',
        tx(
          `${S.aiReading.lv} のつもりで先生が書いた文。まちがいもありうる。`,
          `Written by the tutor, pitched at ${S.aiReading.lv}. It can be wrong — it is a machine.`,
        ),
      ),
    );
  }

  // the shelf of earlier readings — re-reading at level is the point
  if (S.aiReadings.length) {
    main.append(withEn(el('p', 'eyebrow', '前の読み物'), 'earlier readings — tap to reopen', 'en-inline'));
    S.aiReadings.forEach((r, ix) => {
      const row = el('button', 'entry-row compound');
      row.type = 'button';
      row.dataset.aireadPast = String(ix);
      const stack = el('span', 'row-stack');
      const top = el('span', 'row-word airead-past-head');
      top.append(document.createTextNode(r.text.replace(/（[^）]*）/g, '').slice(0, 16) + '…'));
      top.append(el('span', 'row-level', r.lv));
      stack.append(top);
      stack.append(el('span', 'row-gloss', new Date(r.ts).toLocaleDateString()));
      row.append(stack, el('span', 'row-go', '›'));
      row.addEventListener('click', () => {
        // swap: the current reading takes this one's place on the shelf —
        // on copies, one commit, nothing moves on a failed persist (P0-4)
        const chosen = S.aiReadings[ix];
        const others = S.aiReadings.filter((_, i) => i !== ix);
        const aiReadings = S.aiReading ? [S.aiReading, ...others].slice(0, 10) : others;
        if (!commitStorePatch({ aiReading: chosen, aiReadings })) return;
        keepScroll();
        render();
        window.scrollTo(0, 0);
      });
      main.append(row);
    });
  }
}

/* ------------------------------------------------------------- 活用
 * Conjugation, computed — every dictionary app's table, derived from the
 * headword and its part of speech, no data shipped. Godan rows and the
 * euphonic te-forms are the whole of it; the two honest exclusions are
 * いい-type adjectives and lone する／来る (irregular beyond their worth
 * here — their entries still show everything else). */
const GODAN_ROW = {
  う: ['わ', 'い', 'え', 'お'], く: ['か', 'き', 'け', 'こ'], ぐ: ['が', 'ぎ', 'げ', 'ご'],
  す: ['さ', 'し', 'せ', 'そ'], つ: ['た', 'ち', 'て', 'と'], ぬ: ['な', 'に', 'ね', 'の'],
  ぶ: ['ば', 'び', 'べ', 'ぼ'], む: ['ま', 'み', 'め', 'も'], る: ['ら', 'り', 'れ', 'ろ'],
};
const GODAN_TE = { う: 'って', つ: 'って', る: 'って', ぬ: 'んで', ぶ: 'んで', む: 'んで', く: 'いて', ぐ: 'いで', す: 'して' };
function conjugations(word, pos) {
  if (!pos || !word) return null;
  if (/godan verb/.test(pos)) {
    const last = word.slice(-1);
    const row = GODAN_ROW[last];
    if (!row) return null;
    const stem = word.slice(0, -1);
    const [a, i, e, o] = row;
    const te = word.endsWith('行く') || word === '行く' ? `${stem}って` : stem + GODAN_TE[last];
    return [
      ['ます形', 'polite', `${stem}${i}ます`],
      ['て形', 'te-form', te],
      ['た形', 'past', te.replace(/て$/, 'た').replace(/で$/, 'だ')],
      ['ない形', 'negative', `${stem}${a}ない`],
      ['可能', 'potential', `${stem}${e}る`],
      ['ば形', 'conditional', `${stem}${e}ば`],
      ['意向形', 'volitional', `${stem}${o}う`],
      ['受身', 'passive', `${stem}${a}れる`],
      ['使役', 'causative', `${stem}${a}せる`],
      ['命令形', 'imperative', `${stem}${e}`],
    ];
  }
  if (/ichidan verb/.test(pos) && word.endsWith('る')) {
    const stem = word.slice(0, -1);
    return [
      ['ます形', 'polite', `${stem}ます`],
      ['て形', 'te-form', `${stem}て`],
      ['た形', 'past', `${stem}た`],
      ['ない形', 'negative', `${stem}ない`],
      ['可能・受身', 'potential / passive', `${stem}られる`],
      ['ば形', 'conditional', `${stem}れば`],
      ['意向形', 'volitional', `${stem}よう`],
      ['使役', 'causative', `${stem}させる`],
      ['命令形', 'imperative', `${stem}ろ`],
    ];
  }
  if (/suru verb/.test(pos) && !/godan|ichidan/.test(pos) && !/する$/.test(word)) {
    return [
      ['ます形', 'polite', `${word}します`],
      ['て形', 'te-form', `${word}して`],
      ['た形', 'past', `${word}した`],
      ['ない形', 'negative', `${word}しない`],
      ['可能', 'potential', `${word}できる`],
      ['ば形', 'conditional', `${word}すれば`],
      ['意向形', 'volitional', `${word}しよう`],
      ['受身', 'passive', `${word}される`],
    ];
  }
  if (/i-adjective/.test(pos) && word.endsWith('い') && !word.endsWith('いい')) {
    const stem = word.slice(0, -1);
    return [
      ['く形', 'adverbial', `${stem}く`],
      ['て形', 'te-form', `${stem}くて`],
      ['た形', 'past', `${stem}かった`],
      ['ない形', 'negative', `${stem}くない`],
      ['ば形', 'conditional', `${stem}ければ`],
    ];
  }
  return null;
}

function renderConjugation(sheet, word, pos) {
  const rows = conjugations(word, pos);
  if (!rows) return;
  sheet.append(withEn(el('p', 'eyebrow', '活用'), 'conjugation', 'en-inline'));
  const table = el('div', 'conj-table');
  for (const [ja, en, form] of rows) {
    const row = el('div', 'conj-row');
    const label = el('span', 'conj-label');
    label.append(document.createTextNode(ja));
    if (bi()) label.append(el('span', 'conj-en', en));
    row.append(label);
    row.append(el('span', 'conj-form', form));
    table.append(row);
  }
  sheet.append(table);
}

/* ------------------------------- complete JMdict senses on the word sheet
 * The deep tier's shard holds the entry's full record: numbered senses with
 * usage tags, spelling/reading restrictions, source-language notes, and
 * JMdict's own cross-references and antonyms. Those relations are the
 * dictionary's voice, kept apart from the hand-written 類語 clusters — a
 * JMdict xref is never dressed up as an authored synonym note. */
function relationTarget(tuple) {
  return Array.isArray(tuple) ? String(tuple[0] || '').replace(/・\d+$/, '') : '';
}

function relationReadingQualifier(value) {
  return typeof value === 'string' ? value.replace(/・\d+$/, '') : '';
}

function dictionaryRelationRoute(tuple, from) {
  const target = relationTarget(tuple);
  if (!target) return null;
  const rows = dictionaryRowsForForm(target);
  for (const qualifier of tuple.slice(1)) {
    const readingQualifier = relationReadingQualifier(qualifier);
    if (!readingQualifier) continue;
    for (const row of rows) {
      const summary = dictionaryReadingSummaries(row).find(
        (candidate) =>
          kataToHira(candidate[0]) === kataToHira(readingQualifier) &&
          dictionaryReadingSupportsForm(row, candidate[0], target),
      );
      if (summary) {
        return { t: 'word', id: target, seq: String(row[0]), reading: summary[0], from };
      }
    }
  }
  if (
    D.dictionaryMode === 'worker' &&
    D.dictionaryState === 'ready' &&
    !D.dictionaryCompleteForms?.has(target)
  ) {
    const reading = tuple.slice(1).map(relationReadingQualifier).find(Boolean) || '';
    return { t: 'word', id: target, from, dictionaryPendingLookup: true, ...(reading ? { reading } : {}) };
  }
  if (rows.length || lookup(target)) return { t: 'word', id: target, from };
  return null;
}

function renderDictionaryRelations(container, titleJa, titleEn, tuples, node) {
  if (!tuples?.length) return;
  const block = el('div', 'dictionary-relations');
  block.append(withEn(el('p', 'dictionary-rel-title', titleJa), titleEn, 'en-inline'));
  for (const tuple of tuples) {
    const target = relationTarget(tuple);
    if (!target) continue;
    const route = dictionaryRelationRoute(tuple, node.from);
    const routable = !!route;
    const row = el(routable ? 'button' : 'div', routable ? 'dictionary-rel' : 'dictionary-rel muted');
    if (routable) {
      row.type = 'button';
      row.addEventListener('click', async () => {
        let destination = route;
        if (route.dictionaryPendingLookup) {
          try {
            await ensureDictionaryRowsForForm(target);
            destination = dictionaryRelationRoute(tuple, node.from);
          } catch {
            return;
          }
        }
        if (!destination) return;
        const { dictionaryPendingLookup, ...resolved } = destination;
        go(resolved);
      });
    }
    row.append(el('span', 'dictionary-rel-word', target));
    // The compact detail tuple may end with an internal source/sense integer.
    // Only JMdict's textual qualifiers belong in the visible relation note.
    const qualifier = tuple.slice(1).filter((value) => typeof value === 'string').join(' · ');
    if (qualifier) row.append(el('span', 'dictionary-rel-note', qualifier));
    if (routable) row.append(el('span', 'row-go', '›'));
    block.append(row);
  }
  container.append(block);
}

function renderDictionaryDetails(container, details, node) {
  details.forEach((entry, entryIndex) => {
    const [, kanjiForms, kanaForms, senses] = entry;
    const block = el('section', 'dictionary-entry');
    if (details.length > 1 || kanjiForms.length > 1 || kanaForms.length > 1) {
      const forms = el('div', 'dictionary-forms');
      const spellings = kanjiForms.map((form) => form[0]);
      if (spellings.length) forms.append(el('span', 'dictionary-spellings', spellings.join('・')));
      forms.append(el('span', 'dictionary-readings', kanaForms.map((form) => form[0]).join('・')));
      block.append(forms);
    }
    senses.forEach((sense, senseIndex) => {
      const [
        partOfSpeech,
        appliesToKanji,
        appliesToKana,
        related,
        antonym,
        field,
        dialect,
        misc,
        info,
        languageSources,
        glosses,
      ] = sense;
      const section = el('div', 'dictionary-sense');
      section.append(el('span', 'dictionary-sense-number', String(senseIndex + 1)));
      const body = el('div', 'dictionary-sense-body');
      const tags = [...partOfSpeech, ...field, ...dialect, ...misc].map(dictionaryTag);
      if (tags.length) body.append(el('p', 'sense-pos', [...new Set(tags)].join(' · ')));
      const restrictions = [];
      if (appliesToKanji?.length && appliesToKanji[0] !== '*') {
        restrictions.push(tx(`${appliesToKanji.join('・')} の語義`, `for ${appliesToKanji.join('・')}`));
      }
      if (appliesToKana?.length && appliesToKana[0] !== '*') {
        restrictions.push(tx(`${appliesToKana.join('・')} の読み`, `with reading ${appliesToKana.join('・')}`));
      }
      if (restrictions.length) body.append(el('p', 'dictionary-restriction', restrictions.join(' · ')));
      const meanings = glosses.map((gloss) => {
        const [text, gender, type] = gloss;
        const marks = [type, gender].filter(Boolean);
        return marks.length ? `${text} (${marks.join(', ')})` : text;
      });
      if (meanings.length === 1) body.append(el('p', 'gloss', meanings[0]));
      else {
        const list = el('ul', 'dictionary-glosses');
        for (const meaning of meanings) list.append(el('li', null, meaning));
        body.append(list);
      }
      for (const note of info || []) body.append(el('p', 'dictionary-info', note));
      if (languageSources?.length) {
        const sources = languageSources
          .map(([lang, full, wasei, text]) =>
            [lang, text, full ? 'full form' : null, wasei ? 'wasei' : null].filter(Boolean).join(' · '),
          )
          .join('; ');
        body.append(el('p', 'dictionary-info', tx(`語源 ${sources}`, `source ${sources}`)));
      }
      renderDictionaryRelations(body, '辞書内の関連項目', 'dictionary cross-references', related, node);
      renderDictionaryRelations(body, '対義語', 'antonyms', antonym, node);
      section.append(body);
      block.append(section);
    });
    if (entryIndex < details.length - 1) block.append(el('div', 'dictionary-entry-rule'));
    container.append(block);
  });
}

function renderDictionaryHomographs(container, node) {
  const rows = dictionaryRowsForForm(node.id);
  const choices = [];
  const seen = new Set();
  for (const row of rows) {
    for (const summary of dictionaryReadingSummaries(row)) {
      if (!dictionaryReadingSupportsForm(row, summary[0], node.id)) continue;
      const key = `${row[0]}\u0000${summary[0]}\u0000${summary[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      choices.push({ row, summary: [summary[0], node.id, summary[2]] });
    }
  }
  if (choices.length <= 1) return;
  const currentSeq = String(node.seq || node.dictionaryResolvedSeq || '');
  const currentReading = kataToHira(node.reading || lookup(node.id, node.seq)?.r || '');
  const block = el('div', 'dictionary-homographs');
  block.append(
    withEn(
      el('p', 'dictionary-rel-title', `同じ形の ${choices.length} 項目`),
      `${choices.length} readings or entries share this form`,
      'en-inline',
    ),
  );
  for (const { row, summary } of choices) {
    const [seq] = row;
    const [reading, headForm, primaryGloss] = summary;
    const active = String(seq) === currentSeq && (!currentReading || kataToHira(reading) === currentReading);
    const choice = el('button', active ? 'dictionary-homograph active' : 'dictionary-homograph');
    choice.type = 'button';
    choice.dataset.dictionaryEntry = String(seq);
    choice.setAttribute('aria-pressed', String(active));
    const stack = el('span', 'row-stack');
    const top = el('span', 'row-word');
    top.append(document.createTextNode(headForm));
    if (reading) top.append(el('span', 'row-reading', reading));
    stack.append(top);
    if (primaryGloss) stack.append(el('span', 'row-gloss', primaryGloss));
    choice.append(stack, el('span', 'row-go', active ? '·' : '›'));
    choice.addEventListener('click', () => {
      // guard by CONTENT, not object identity — async dictionary resolution
      // can replace the stack-top object after this row rendered, and the
      // identity check made the tap a silent no-op
      const top = S.stack[S.stack.length - 1];
      if (active || !top || top.t !== 'word' || top.id !== node.id) return;
      // a homograph is a DOOR, not a correction: it PUSHES, so ← 戻る
      // returns to the entry the learner was reading (replacing the stack
      // top made back close the whole sheet — P1, full-instrument review)
      S.stack.push({
        t: 'word',
        id: headForm,
        seq: String(seq),
        reading,
        from: node.from || null,
      });
      render();
      const live = document.getElementById('sheet');
      if (live) live.scrollTop = 0;
    });
    block.append(choice);
  }
  container.append(block);
}

function requestDictionaryDetails(node) {
  if (node.dictionaryPending || node.dictionaryReady) return;
  node.dictionaryPending = true;
  node.dictionaryError = null;
  ensureDictionaryDetails(node)
    .then(() => {
      node.dictionaryPending = false;
      node.dictionaryReady = true;
      if (S.stack[S.stack.length - 1] !== node) return;
      const live = document.getElementById('sheet');
      S.sheetScrollRestore = live?.scrollTop || 0;
      S.sheetFocus = document.activeElement?.id || null;
      render();
    })
    .catch((err) => {
      node.dictionaryPending = false;
      node.dictionaryError = err;
      if (S.stack[S.stack.length - 1] !== node) return;
      const live = document.getElementById('sheet');
      S.sheetScrollRestore = live?.scrollTop || 0;
      render();
    });
}

function renderWordNode(sheet, node) {
  const rec = lookup(node.id, node.seq, node.reading, node.matchedGloss);
  const legacy = D.words[node.id];
  const label = rec?.head || node.id;
  const details = dictionaryDetailsFor(node);
  const head = el('h2', 'headword');
  head.append(document.createTextNode(label));
  const alternateSpellings = (rec?.written || []).filter((form) => form !== label).slice(0, 5);
  if (alternateSpellings.length) {
    head.append(el('span', 'headword-alt', `／${alternateSpellings.join('・')}`));
  } else if (rec?.alt) head.append(el('span', 'headword-alt', `／${rec.alt}`));
  sheet.append(head);
  if (rec?.r) sheet.append(el('p', 'reading', rec.r));
  renderDictionaryHomographs(sheet, node);

  // TRANSLATION — every sense, most common first (JMdict order). Once the
  // word's shard arrives, the full source senses take this spot: homographs,
  // restrictions, usage fields, cross-references and antonyms. Until then the
  // immediate record stays useful instead of becoming a spinner.
  if (details.length) {
    const box = el('div', 'senses dictionary-senses');
    if (rec?.p) box.append(el('p', 'sense-pos', rec.p));
    renderDictionaryDetails(box, details, node);
    sheet.append(box);
  } else if (rec?.m?.length) {
    const box = el('div', 'senses');
    if (rec.p) box.append(el('p', 'sense-pos', rec.p));
    const immediate = rec.seq ? rec.m.slice(0, 1) : rec.m;
    if (immediate.length === 1) {
      box.append(el('p', 'gloss', immediate[0]));
    } else {
      const ol = el('ol', 'sense-list');
      for (const m of immediate) ol.append(el('li', null, m));
      box.append(ol);
    }
    sheet.append(box);
  } else {
    const gloss = el('p', 'gloss absent');
    gloss.textContent = tx('この語の語釈はまだない。読みと接続は下にある。', 'No gloss for this word yet — its reading and connections continue below.');
    sheet.append(gloss);
  }
  if (!details.length && !node.dictionaryError && !node.dictionaryReady && D.dictionaryState !== 'error') {
    sheet.append(
      el('p', 'dictionary-opening', tx('語義と用法をひらいています…', 'Opening complete senses and usage…')),
    );
    queueMicrotask(() => requestDictionaryDetails(node));
  } else if (node.dictionaryError) {
    const warning = el(
      'p',
      'dictionary-warning',
      tx('手元の語釈は読めるが、詳しい語義をまだひらけない。', 'The immediate gloss is available, but the complete entry could not be opened.'),
    );
    const retry = biLabel('button', 'dictionary-retry', 'もう一度ひらく', 'try the complete entry again');
    retry.type = 'button';
    retry.addEventListener('click', () => {
      node.dictionaryError = null;
      node.dictionaryReady = false;
      requestDictionaryDetails(node);
      render();
    });
    sheet.append(warning, retry);
  }
  if (details.length) {
    const credit = el('p', 'dictionary-credit');
    credit.append(document.createTextNode('JMdict · EDRDG · '));
    const licence = el('a', null, 'CC BY-SA 4.0');
    licence.href = 'https://www.edrdg.org/edrdg/licence.html';
    licence.target = '_blank';
    licence.rel = 'noreferrer';
    credit.append(licence);
    sheet.append(credit);
  }
  const jlpt = rec?.jlpt || (legacy?.jlpt ? `N${legacy.jlpt}` : null);
  if (jlpt) {
    const meta = el('div', 'shelf-meta');
    meta.append(el('span', 'pool-tag', `JLPT ${String(jlpt).replace(/^N?/, 'N')}`));
    sheet.append(meta);
  }
  renderConjugation(sheet, node.id, rec?.p);
  renderAiTutor(sheet, node, rec);

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

  // EXAMPLES — real sentences, shelf first, the bank behind them; every
  // token carries the reader's ladder (ふりがな → gloss → full entry)
  if (!D.exampleBank?.has(node.id) && window.__CORRIDOR_STANDALONE__ !== true) {
    ensureBankExamples(node.id).then((entries) => {
      if (!entries.length) return;
      const top = S.stack[S.stack.length - 1];
      if (top && top.t === 'word' && top.id === node.id) {
        keepScroll();
        render();
        returnScroll();
      }
    });
  }
  const examples = findExamples(node.id, 6);
  if (examples.length) {
    // the eyebrow says the whole gesture, in both tongues: the hold that
    // opens the dictionary was the ladder's unspoken rung (review P2)
    sheet.append(
      withEn(
        el('p', 'eyebrow', '用例 — ことばは長押しで辞書へ'),
        'examples — tap a word to climb its ladder; hold it to open the dictionary',
        'en-inline',
      ),
    );
    for (const ex of examples) {
      const line = el('div', 'example');
      const text = el('p', 'example-ja');
      renderSentenceTokens(text, ex.tokens, {
        targetId: node.id,
        contextId: ex.passage || 'bank',
      });
      text.append(sentenceDoor(ex, node.id));
      line.append(text);
      if (ex.en) line.append(el('p', 'example-en', ex.en));
      line.append(el('span', 'example-src', ex.source));
      sheet.append(line);
    }
  }
  renderAiExamples(sheet, node, rec);

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
  renderContextPicker(sheet, node);
  renderListPicker(sheet, node, label);
  renderCardVariant(sheet, { id: node.id, from: node.from });
  renderSchedule(sheet);
}

/* The MAIN components of a kanji — its official radical and the one or two
 * other major pieces, not every nested shape fragment (operator 2026-08-10,
 * with WaniKani/Renzo examples: 快 → 忄+夬, not 忄・心・夬・大・人). The kanji data
 * ships a flattened bag of every sub-shape, so this recovers the top level: a
 * part is dropped when it sits inside another listed part. Containment has two
 * sources — a component that is itself a kanji carries its own parts; a
 * component that is not (夬, 咅, 袁) is resolved by co-occurrence, where a
 * fragment that appears in EVERY kanji built from that component is a piece of
 * it. The co-occurrence is guarded two ways: only for rare components (≤12
 * host kanji, so a common radical's noise can't merge real siblings), and a
 * smaller kanji may never absorb a larger standalone one (or 五 would swallow
 * 吾 in 語). Radical variants written in place (忄 for 心, 氵 for 水) fold onto
 * the form actually used, and lone connecting strokes drop once a real piece
 * survives. Applied to every kanji entry. */
const RADICAL_VARIANT = {
  忄: '心', 氵: '水', 艹: '艸', 扌: '手', 犭: '犬', 礻: '示', 衤: '衣',
  '⺍': '小', 纟: '糸', 讠: '言', 饣: '食', 阝: '邑', 亻: '人',
};
const GLUE_STROKE = new Set(['丶', '丿', '乀', '乁', '乛', '乚']);
const _compsCache = new Map();
function _strokeOf(x) {
  const k = D.kanji[x];
  if (k && k.st) return k.st;
  const r = D.radicals[x];
  if (r && r.st) return r.st;
  return null;
}
function _componentsOf(q) {
  if (_compsCache.has(q)) return _compsCache.get(q);
  const out = new Set();
  const kv = D.kanji[q];
  if (kv && kv.parts) for (const p of kv.parts) if (p !== q) out.add(p);
  const r = D.radicals[q];
  if (r && r.kanji && r.kanji.length >= 2 && r.kanji.length <= 12) {
    const lists = r.kanji.filter((x) => D.kanji[x]).map((x) => new Set(D.kanji[x].parts));
    if (lists.length >= 2) {
      const [first, ...rest] = lists;
      const qInK = !!D.kanji[q];
      const sq = _strokeOf(q);
      for (const p of first) {
        if (p === q || !rest.every((s) => s.has(p))) continue;
        const sp = _strokeOf(p);
        if (qInK && D.kanji[p] && sp != null && sq != null && sp > sq) continue;
        out.add(p);
      }
    }
  }
  out.delete(q);
  _compsCache.set(q, out);
  return out;
}
function _allSub(q) {
  const seen = new Set();
  const stack = [..._componentsOf(q)];
  while (stack.length) {
    const x = stack.pop();
    if (x !== q && !seen.has(x)) {
      seen.add(x);
      for (const y of _componentsOf(x)) stack.push(y);
    }
  }
  return seen;
}
function mainParts(c) {
  const k = D.kanji[c];
  if (!k || !k.parts || !k.parts.length) return [];
  const P = [...new Set(k.parts)];
  const subs = new Map(P.map((q) => [q, _allSub(q)]));
  let keep = P.filter((p) => !P.some((q) => q !== p && subs.get(q).has(p)));
  const present = new Set(keep);
  keep = keep.filter((p) => ![...present].some((v) => RADICAL_VARIANT[v] === p));
  if (keep.length > 1) keep = keep.filter((p) => !GLUE_STROKE.has(p));
  return keep.slice(0, 3);
}

/** The label on a 部品 row. 729 of the 926 components in the KANJIDIC/漢検
 * layer carry an empty `name` — they are shape components, not Kangxi radicals,
 * and the 漢検 table never named them. "unnamed part" said only that we had
 * nothing, and made a live door look like a dead one. The honest line says what
 * IS known and what the door actually opens: the family of kanji built from
 * this shape, which is exactly what renderRadicalNode() shows on the far side. */
function componentLabel(c) {
  const r = D.radicals[c];
  if (r?.name) return r.name;
  const n = r?.kanjiCount;
  if (n) return tx(`部品 — ${n} 字に使われる`, `component — used in ${n} kanji`);
  return tx('部品 — 漢検の部首表に名前がない', 'component — no name in the 漢検 radical table');
}

/* まぎらわしい字 — the margin note every paper kanji dictionary keeps:
 * characters that look alike enough to be misread. Hand-authored sets of
 * classic confusions; only members the layer actually carries render, and
 * a set survives only if at least one OTHER member is present. */
const CONFUSABLE_SETS = [
  ['末', '未'], ['土', '士'], ['人', '入'], ['木', '本'], ['大', '太', '犬'],
  ['王', '玉'], ['千', '干'], ['午', '牛'], ['白', '百'], ['目', '自'],
  ['田', '由', '申'], ['休', '体'], ['買', '貝'], ['石', '右'], ['名', '各'],
  ['刀', '力'], ['問', '間'], ['幸', '辛'], ['待', '持'], ['授', '受'],
  ['複', '復', '腹'], ['講', '構', '購'], ['績', '積'], ['義', '議'],
  ['象', '像'], ['険', '検', '験'], ['招', '紹'], ['折', '析'],
  ['暑', '署'], ['微', '徴'], ['綱', '網'], ['壊', '懐'],
  ['薄', '簿'], ['防', '妨'], ['師', '帥'], ['官', '宮'],
];
let CONFUSABLE_MAP = null;
function confusablesFor(c) {
  if (!CONFUSABLE_MAP) {
    CONFUSABLE_MAP = {};
    for (const set of CONFUSABLE_SETS) {
      const here = set.filter((ch) => D.kanji[ch]);
      if (here.length < 2) continue;
      for (const ch of here) (CONFUSABLE_MAP[ch] ||= new Set()) && here.forEach((o) => o !== ch && CONFUSABLE_MAP[ch].add(o));
    }
  }
  return [...(CONFUSABLE_MAP[c] || [])];
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
  chips.append(catalogChip(`${k.st} 画`, `${k.st} strokes`, 'strokes', k.st, node.from));
  if (D.kanken[k.c]?.kk)
    chips.append(catalogChip(`漢検 ${D.kanken[k.c].kk}`, `漢検 ${D.kanken[k.c].kk}`, 'kanken', D.kanken[k.c].kk, node.from));
  if (D.kmeta?.[k.c]?.jlpt)
    chips.append(catalogChip(`JLPT ${D.kmeta[k.c].jlpt}`, `JLPT ${D.kmeta[k.c].jlpt}`, 'jlpt', D.kmeta[k.c].jlpt, node.from));
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

  // 部首 — the ONE official radical (the Kangxi classification), with its
  // Japanese name, position, and number. This is the dictionary's radical, not
  // up for debate; the shape-components further down are a different thing.
  const rad = k.rad && D.radInfo ? D.radInfo[k.rad] : null;
  if (rad) {
    sheet.append(withEn(el('p', 'eyebrow', '部首'), 'radical', 'en-inline'));
    const door = el('button', 'rad-door');
    door.type = 'button';
    const glyph = el('span', 'rad-glyph', rad.c);
    if (rad.var && rad.var !== rad.c) glyph.append(el('span', 'rad-var', rad.var));
    door.append(glyph);
    const text = el('span', 'rad-text');
    text.append(el('span', 'rad-name', rad.name));
    const posLabel =
      rad.pos === '独立' ? tx('独立', 'stands alone') : tx(rad.pos, `${rad.pos} · ${rad.posEn}`);
    text.append(el('span', 'rad-sub', tx(`${posLabel}・部首 ${rad.n}`, `${posLabel} · radical ${rad.n}`)));
    door.append(text);
    door.append(el('span', 'row-go', '›'));
    door.addEventListener('click', () => go({ t: 'radical', id: rad.c, from: node.from }));
    sheet.append(door);
  }

  // まぎらわしい字 — the look-alikes, laid side by side to break the spell
  const twins = confusablesFor(k.c);
  if (twins.length) {
    sheet.append(withEn(el('p', 'eyebrow', 'まぎらわしい字'), 'easily confused with', 'en-inline'));
    const rows = el('div', 'entry-rows');
    for (const c of twins) {
      const row = el('button', 'entry-row');
      row.type = 'button';
      row.dataset.confusable = c;
      row.append(el('span', 'row-glyph', c));
      row.append(el('span', 'row-main', D.kanji[c].m));
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go({ t: 'kanji', id: c, from: node.from }));
      rows.append(row);
    }
    sheet.append(rows);
  }

  // STROKE ORDER — the diagram is a door, not a picture. It opens the
  // dedicated full-screen page where the strokes actually draw themselves.
  sheet.append(withEn(el('p', 'eyebrow', '筆順'), 'stroke order', 'en-inline'));
  sheet.append(strokeDoor(k));

  const parts = mainParts(k.c);
  if (parts.length) {
    sheet.append(withEn(el('p', 'eyebrow', '部品'), 'main components', 'en-inline'));
    const rows = el('div', 'entry-rows');
    for (const c of parts) {
      const row = el('button', 'entry-row');
      row.type = 'button';
      row.append(el('span', 'row-glyph', c));
      row.append(el('span', 'row-main', componentLabel(c)));
      row.append(el('span', 'row-go', '›'));
      row.addEventListener('click', () => go({ t: 'radical', id: c, from: node.from }));
      rows.append(row);
    }
    sheet.append(rows);
  }

  // COMMON COMPOUNDS — reading + first gloss per row, every row a door.
  // No silent cap: an initial page, then "show all" reveals the whole list
  // (Renzo shows "6 of 96" the same way). The count in the heading is the true
  // total, so the depth of the dictionary is visible at a glance.
  const words = D.kanjiWords[k.c] || [];
  if (words.length) {
    sheet.append(withEn(el('p', 'eyebrow', `よく使う語 — ${words.length} 語`), 'common compounds', 'en-inline'));
    const rows = el('div', 'entry-rows');
    const makeRow = (w) => {
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
      return row;
    };
    const FIRST = 24;
    for (const w of words.slice(0, FIRST)) rows.append(makeRow(w));
    sheet.append(rows);
    if (words.length > FIRST) {
      const more = el('button', 'more-row');
      more.type = 'button';
      const remain = words.length - FIRST;
      more.textContent = tx(`のこり ${remain} 語をすべて見る`, `show all ${words.length} — ${remain} more`);
      more.addEventListener('click', () => {
        for (const w of words.slice(FIRST)) rows.append(makeRow(w));
        more.remove();
      });
      sheet.append(more);
    }
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

/* ==================================================== 筆順 · stroke order ===
 * A kanji is written, not drawn — so the stroke diagram gets a page of its
 * own instead of a thumbnail in a list. On that page the KanjiVG paths draw
 * themselves in order, one after another, the way a hand moves: each path is
 * dashed to its own measured length (getTotalLength) and its dashoffset walks
 * to zero.
 *
 * 448 of the 2,582 kanji in this layer carry no KanjiVG path data. Their door
 * still opens — it shows the character large and says, in both languages,
 * that the stroke order is not known here. An empty frame would be a lie.
 *
 * Every colour on the page is a theme token (--ink / --ground / --ground-0 /
 * --line / --faint / --ai). Nothing here names a colour, so both the flat and
 * the layered treatment — and either contrast variant — carry through intact.
 */
const STROKE_VIEWBOX = '0 0 109 109';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Does this character have real KanjiVG path data in the shipped layer? */
const strokePathsFor = (ch) => D.strokes?.[ch] || [];

/** The learner asked the platform not to animate — we obey it at the source,
 * never by playing the animation faster. */
const strokeReduced = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let strokeFrame = null;
function cancelStrokeAnimation() {
  if (strokeFrame != null) cancelAnimationFrame(strokeFrame);
  strokeFrame = null;
}

/** KanjiVG stores each stroke's start as its path's first moveto. */
function strokeStart(d) {
  const m = /M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(d);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

/** The sheet's small diagram — unchanged geometry, now wrapped in a door. */
function strokeThumb(paths) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', STROKE_VIEWBOX);
  svg.setAttribute('class', 'strokes');
  svg.setAttribute('aria-hidden', 'true');
  svg.id = 'strokes';
  // just the painted character — no stroke-numbers on the preview (operator
  // 2026-08-10: "no writing next to the stroke-order kanji; tap to open"). The
  // numbers still guide inside the full-screen 筆順 page.
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** The door on the kanji sheet. It exists for every kanji, with data or
 * without — the corridor has no dead ends, only honest rooms. */
function strokeDoor(k) {
  const paths = strokePathsFor(k.c);
  const door = el('button', paths.length ? 'stroke-door' : 'stroke-door bare');
  door.type = 'button';
  door.id = 'strokes-door';
  door.dataset.action = 'entry.open';
  door.dataset.strokes = String(paths.length);
  door.setAttribute(
    'aria-label',
    paths.length
      ? tx(
          `${k.c} の筆順をひらく — ${paths.length} 画`,
          `open the stroke order for ${k.c} — ${paths.length} strokes`,
        )
      : tx(
          `${k.c} の筆順 — 筆順のデータはまだない`,
          `${k.c} stroke order — stroke data not yet available`,
        ),
  );
  // just the stroke-order glyph — tap the box and it opens (operator 2026-08-10:
  // "no writing next to the stroke-order kanji"). No side label, no chevron.
  if (paths.length) door.append(strokeThumb(paths));
  else door.append(el('span', 'stroke-door-glyph', k.c));

  door.addEventListener('click', (event) => {
    interaction(
      { kind: 'entry.open', target: { kind: 'kanji', id: k.c } },
      event.detail === 0 ? 'keyboard' : 'pointer',
      'strokes-door',
    );
    openStrokePage(k.c, { invoker: door });
  });
  return door;
}

/** One clock for the numbered overlay. The page remembers how many strokes
 * have actually begun even while numbers are switched off, so waking the
 * option never invents a future marker. */
/* ゆっくり governs the LIVING ink's speed and nothing else — the SVG diagram
 * the room falls back to carries no speed term at all. Round B removed the
 * corner under reduced motion and stopped there, so on a device with no
 * WebGL/WebGPU the control still stood in the corner reporting itself
 * pressed while the writing ran at exactly one speed
 * (E3 round-C, writing-room lens). The corner now follows the engine: it is
 * there while the ink is alive, and gone the moment it is not. */
function syncSpeedCorner(page) {
  if (!page) return;
  const corner = page.querySelector('#stroke-speed');
  if (corner && page.dataset.living !== 'on') corner.remove();
}

function syncStrokeNumbers(page, shown = Number(page.dataset.strokeShown || 0)) {
  const markerRoot = inkRoom?.page === page && inkRoom?.lift ? inkRoom.lift : page;
  const markers = [...markerRoot.querySelectorAll('.stroke-num')];
  const current = Math.max(0, Math.min(markers.length, Math.floor(Number(shown) || 0)));
  page.dataset.strokeShown = String(current);
  const enabled = page.dataset.numbers === 'on';
  markers.forEach((marker, i) => {
    marker.style.opacity = enabled && i < current ? '0.92' : '0';
  });
  const status = page.querySelector('#stroke-live-status');
  if (status)
    status.textContent = tx(
      `${current} / ${markers.length} 画`,
      `stroke ${current} of ${markers.length}`,
    );
}

/** Put the page into a definite state: `shown` strokes complete, the last of
 * them `progress` of the way drawn. Called by the animation every frame and
 * by the step-through control once per press. */
function paintStrokes(page, shown, progress = 1) {
  const paths = [...page.querySelectorAll('.stroke-ink path')];
  const bleeds = [...page.querySelectorAll('.stroke-bleed path')];
  const total = paths.length;
  paths.forEach((path, i) => {
    const len = Number(path.dataset.len) || 0;
    let offset = len;
    if (i < shown - 1) offset = 0;
    else if (i === shown - 1) offset = len * (1 - progress);
    path.style.strokeDashoffset = String(offset);
    if (bleeds[i]) bleeds[i].style.strokeDashoffset = String(offset);
  });
  // Once living ink owns the stage, its first-splat callback owns the number
  // clock too. The hidden SVG rAF must never race ahead of the real brush.
  if (page.dataset.living !== 'on') {
    // At progress zero the pending SVG stroke is still fully dash-hidden.
    // Keep its number hidden for that frame too; both become visible on the
    // first positive drawing sample, matching the living-ink first-splat law.
    syncStrokeNumbers(page, progress > 0 ? shown : shown - 1);
  }
  const counter = page.querySelector('#stroke-count');
  if (counter) {
    const current = Math.max(0, Math.min(total, shown));
    counter.dataset.current = String(current);
    counter.dataset.total = String(total);
    counter.textContent = `${current} / ${total}`;
  }
  const prev = page.querySelector('#stroke-prev');
  const next = page.querySelector('#stroke-next');
  if (prev) prev.disabled = shown <= 1;
  if (next) next.disabled = shown >= total;
}

/** Draw the strokes in order. Each path's duration follows its own measured
 * length, so a long sweep takes longer than a tick — handwriting, not a
 * metronome. */
function startStrokeAnimation(page) {
  cancelStrokeAnimation();
  const paths = [...page.querySelectorAll('.stroke-ink path')];
  const bleeds = [...page.querySelectorAll('.stroke-bleed path')];
  if (!paths.length) return;
  paths.forEach((path, i) => {
    const len = path.getTotalLength();
    path.dataset.len = String(len);
    path.style.strokeDasharray = `${len} ${len}`;
    path.style.strokeDashoffset = String(len);
    if (bleeds[i]) {
      bleeds[i].style.strokeDasharray = `${len} ${len}`;
      bleeds[i].style.strokeDashoffset = String(len);
    }
  });
  const total = paths.length;

  if (strokeReduced()) {
    // Reduced motion is a mode, not a faster animation: the finished glyph is
    // there at once and the learner walks it stroke by stroke by hand.
    S.strokes.step = total;
    page.dataset.state = 'static';
    paintStrokes(page, total, 1);
    return;
  }

  const GAP = 90;
  const durations = paths.map((path) =>
    Math.min(1000, Math.max(260, (Number(path.dataset.len) || 0) * 9)),
  );
  const starts = [];
  let acc = 0;
  for (const d of durations) {
    starts.push(acc);
    acc += d + GAP;
  }
  const span = acc;

  page.dataset.state = 'drawing';
  paintStrokes(page, 1, 0);

  let t0 = null;
  const frame = (ts) => {
    if (t0 == null) t0 = ts;
    const t = ts - t0;
    if (t >= span) {
      paintStrokes(page, total, 1);
      page.dataset.state = 'done';
      S.strokes.step = total;
      strokeFrame = null;
      return;
    }
    let index = 0;
    while (index < total - 1 && t >= starts[index + 1]) index += 1;
    const local = Math.max(0, Math.min(1, (t - starts[index]) / durations[index]));
    paintStrokes(page, index + 1, local);
    S.strokes.step = index + 1;
    strokeFrame = requestAnimationFrame(frame);
  };
  strokeFrame = requestAnimationFrame(frame);
}

function strokeControl(id, ja, en) {
  const btn = el('button', 'stroke-btn');
  btn.type = 'button';
  btn.id = id;
  btn.append(el('span', 'l-ja', ja));
  if (bi() && en) btn.append(el('span', 'en-sub', en));
  if (!bi()) btn.setAttribute('aria-label', ja);
  return btn;
}

/** KANJIDIC writes okurigana after a dot (なが.い). Keep that boundary
 * visible without making a screen reader pronounce the punctuation. */
function displayKunReading(reading) {
  const value = String(reading || '');
  const dot = value.indexOf('.');
  return dot < 0 ? value : `${value.slice(0, dot)}（${value.slice(dot + 1)}）`;
}

function strokeReadingRow(ja, en, values, kind = 'on') {
  const row = el('div', 'stroke-reading-row');
  const label = el('span', 'stroke-reading-label', ja);
  label.append(el('span', 'en-sub', en));
  const raw = values?.length ? values : [];
  const value = el(
    'span',
    'stroke-reading-value',
    raw.length
      ? raw.map((item) => (kind === 'kun' ? displayKunReading(item) : item)).join('・')
      : '—',
  );
  value.lang = 'ja';
  if (kind === 'kun' && raw.length) {
    value.setAttribute('aria-label', raw.map((item) => item.replaceAll('.', '')).join('、'));
  }
  row.append(label, value);
  return row;
}

/** The quiet room has one learning option. Enabling it starts a fresh write,
 * guaranteeing that marker n rises with stroke n rather than appearing over
 * an already-finished character. */
function strokeNumbersControl(page, reduced) {
  const numbers = strokeControl('stroke-numbers', '筆順の番号', 'stroke order numbers');
  numbers.setAttribute('aria-pressed', String(S.strokeNumbers));
  numbers.addEventListener('click', () => {
    S.strokeNumbers = !S.strokeNumbers;
    numbers.setAttribute('aria-pressed', String(S.strokeNumbers));
    page.dataset.numbers = S.strokeNumbers ? 'on' : 'off';
    if (!S.strokeNumbers) {
      syncStrokeNumbers(page);
      return;
    }

    syncStrokeNumbers(page, 0);
    if (reduced) {
      const total = page.querySelectorAll('.stroke-num').length;
      S.strokes.step = total;
      paintStrokes(page, total, 1);
    } else if (page.dataset.living === 'on' && inkRoom?.handle) {
      inkRoom.handle.rewrite(strokeRewriteOptions());
    } else {
      startStrokeAnimation(page);
    }
  });
  return numbers;
}

/** Minimal mode is an allowlist, not legacy chrome made transparent. */
function strokeAwakeField(page, k) {
  // 四隅の間 (operator spec, 2026-08-15): the corners carry the controls —
  // worlds top-right on the seal, numbers bottom-right, speed bottom-left,
  // back top-left. The wake mark opens ONLY the readings, underneath the
  // glyph, so nothing crowds the sheet.
  const field = el('section', 'stroke-awake-field');
  field.id = 'stroke-awake-field';
  field.dataset.strokeChrome = '';
  field.setAttribute('aria-label', tx('読み', 'readings'));

  const readings = el('div', 'stroke-reading-field');
  readings.setAttribute('role', 'group');
  readings.setAttribute('aria-label', tx('読み', 'readings'));
  readings.append(
    strokeReadingRow('音読み', 'on', k?.on, 'on'),
    strokeReadingRow('訓読み', 'kun', k?.kun, 'kun'),
  );

  field.append(readings);
  return field;
}

/** ゆっくり — the speed corner (bottom-left). The stored slow preference
 * used to apply silently with no way to see or undo it (P1, review). */
function strokeSpeedControl(page) {
  const speed = strokeControl('stroke-speed', 'ゆっくり', 'slowly');
  speed.setAttribute('aria-pressed', String(!!S.strokeSlow));
  speed.addEventListener('click', () => {
    S.strokeSlow = !S.strokeSlow;
    speed.setAttribute('aria-pressed', String(!!S.strokeSlow));
    if (page.dataset.living === 'on' && inkRoom?.handle) {
      inkRoom.handle.rewrite(strokeRewriteOptions());
    }
  });
  return speed;
}

/** The honest room: a character we can show but whose order we do not know. */
function strokeMissing(page, id, k) {
  const box = el('div', 'stroke-missing');
  box.append(el('div', 'stroke-missing-glyph', id));
  const line = el('p', 'stroke-missing-line');
  line.id = 'stroke-missing';
  line.textContent = tx('筆順のデータはまだない。', 'Stroke data not yet available.');
  box.append(line);
  const note = el('p', 'stroke-missing-note');
  note.textContent = k?.st
    ? tx(
        `分かっているのは画数だけ — ${k.st} 画。この字の筆順は KanjiVG にまだ入っていない。`,
        `What is known is the count — ${k.st} strokes. KanjiVG does not carry this character's stroke paths yet.`,
      )
    : tx(
        'この字の筆順は KanjiVG にまだ入っていない。',
        'KanjiVG does not carry this character’s stroke paths yet.',
      );
  box.append(note);
  page.append(box);
}

/* ------------------------------------------------- 書の間 · the living ink
 * The stroke page's hero: the kanji WRITTEN in real fluid ink by the same
 * D2Q9 lattice engine that made the design renders (corridor-ink.js — the
 * canonical home of the physics). The ink follows the public ten-world
 * canon; the historical 殻 pigment remains loadable for saved state.
 * The sheet's paper is grown
 * by the same painters as the app ground. The engine mounts when the page
 * opens and stops when it leaves; reduced motion gets a hand-painted still;
 * no GPU at all keeps the SVG diagram alone. */
const INK_WORLDS = {
  // 藍 ベロ藍 — Prussian blue, TUNED against ink-hoku-berlin.png (mean Δ ≤ 6/255)
  hokusai: {
    pal: { mode: 0, low: [0.33, 0.43, 0.6], high: [0.08, 0.17, 0.35], sheen: [0.05, 0.06, 0.08] },
    wetScale: 1.0,
    still: '#1f3766',
  },
  // 墨 — the canon, stroke-art-v5's exact numbers
  sumi: {
    pal: {
      mode: 0,
      low: [0.512, 0.448, 0.352],
      high: [0.16, 0.16, 0.24],
      sheen: [0.05, 0.055, 0.06],
    },
    wetScale: 1.0,
    still: '#1c1913',
  },
  // 朱 — shrine vermilion, verbatim from stroke-art-iro
  shu: {
    pal: { mode: 0, low: [0.95, 0.52, 0.38], high: [0.62, 0.14, 0.1], sheen: [0.06, 0.05, 0.05] },
    wetScale: 1.0,
    still: '#a8281e',
  },
  // 赤 赤富士の錆 — rust, TUNED against ink-hoku-akafuji.png (mean Δ ≤ 4/255)
  akafuji: {
    pal: { mode: 0, low: [0.76, 0.44, 0.3], high: [0.55, 0.18, 0.09], sheen: [0.055, 0.05, 0.045] },
    wetScale: 1.0,
    still: '#8c351f',
  },
  // 柿 焦茶 — the iro card verbatim
  iwa: {
    pal: { mode: 0, low: [0.7, 0.52, 0.38], high: [0.3, 0.16, 0.08], sheen: [0.05, 0.045, 0.04] },
    wetScale: 1.0,
    still: '#3e2410',
  },
  // 漆 胡粉 — the iro card verbatim (additive shell-white)
  rokusho: {
    pal: {
      mode: 1,
      low: [0.3, 0.28, 0.25],
      high: [0.94, 0.91, 0.85],
      sheen: [0.14, 0.13, 0.12],
      spark: [1.0, 0.98, 0.92],
      metal: 0.25,
    },
    wetScale: 0.9,
    still: '#efe9dc',
  },
  // 金 金泥 — the canon, kept no matter what
  yoru: {
    pal: {
      mode: 1,
      low: [0.42, 0.3, 0.1],
      high: [1.0, 0.83, 0.45],
      sheen: [0.1, 0.12, 0.2],
      spark: [1.0, 0.9, 0.6],
      metal: 1,
    },
    wetScale: 0.85,
    still: '#d9b25f',
  },
  // 浪 波の泡 — spindrift, TUNED against ink-hoku-nami.png (light end exact)
  nami: {
    pal: {
      mode: 1,
      low: [0.5, 0.58, 0.66],
      high: [0.9, 0.94, 0.97],
      sheen: [0.1, 0.12, 0.16],
      spark: [0.95, 1.0, 1.0],
      metal: 0.35,
    },
    wetScale: 0.9,
    still: '#eae6d8',
  },
  // 板 — canonical keyblock sumi on print cream
  keyblock: {
    pal: {
      mode: 0,
      low: [0.512, 0.448, 0.352],
      high: [0.16, 0.16, 0.24],
      sheen: [0.05, 0.055, 0.06],
    },
    wetScale: 1.0,
    still: '#26221c',
  },
  // 雷 — canonical gold carried onto 山下白雨's storm paper
  hakuu: {
    pal: {
      mode: 1,
      low: [0.42, 0.3, 0.1],
      high: [1.0, 0.83, 0.45],
      sheen: [0.1, 0.12, 0.2],
      spark: [1.0, 0.9, 0.6],
      metal: 1,
    },
    wetScale: 0.85,
    still: '#d9a93f',
  },
  // 殻 燐光 — phosphor, TUNED against ink-cyber-ghost.png (light end exact)
  kaku: {
    pal: {
      mode: 1,
      low: [0.12, 0.52, 0.42],
      high: [0.36, 1.0, 0.82],
      sheen: [0.08, 0.14, 0.12],
      spark: [0.6, 1.0, 0.85],
      metal: 0.6,
    },
    wetScale: 0.9,
    still: '#50f0c3',
  },
};
let inkModulePromise = null;
function ensureInkModule() {
  return (inkModulePromise ||= import('./corridor-ink.js'));
}
/* AnimCJK true brush outlines (data/share_alike/animcjk, Arphic Public
 * License) — the gallery-quality glyph data, covering 2,581 of the 2,582
 * corridor kanji. Fetched by shard on first need, cached for the session. */
const animcjkShards = new Map();
async function animcjkGlyphFor(ch) {
  try {
    const sid = (ch.codePointAt(0) % 16).toString(16).padStart(2, '0');
    if (!animcjkShards.has(sid)) {
      animcjkShards.set(
        sid,
        fetch(`data/share_alike/animcjk/${sid}.json`).then((r) => (r.ok ? r.json() : null)),
      );
    }
    const shard = await animcjkShards.get(sid);
    return (shard && shard.entries && shard.entries[ch]) || null;
  } catch {
    return null;
  }
}
let inkRoom = null; // { handle, canvas, page, stage, lift, syncLift, unsync } — one sheet
const strokeRewriteOptions = () => ({ speed: S.strokeSlow ? 0.7 : 1.1 });
function stopInkRoom() {
  if (!inkRoom) return;
  try {
    if (inkRoom.handle) inkRoom.handle.stop();
  } catch {
    /* engine already gone */
  }
  try {
    if (inkRoom.unsync) inkRoom.unsync();
    if (inkRoom.lift) inkRoom.lift.remove();
  } catch {
    /* overlay already gone */
  }
  inkRoom = null;
}
/** The ink sheet's paper at DESIGN strength — the full-amplitude grounds the
 * original renders sat on (the app ground's ±3% quiet law protects text; the
 * sheet holds no text, so it gets the real paper back: strong fiber, true
 * vignette, visible tooth). Ported from the design pages' painters. */
function inkGroundFor(world, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const S = size;
  const u = S / 920;
  const r = paperRng(
    {
      cream: 13,
      shell: 17,
      kozo: 11,
      dawn: 19,
      kaki: 29,
      urushi: 41,
      kon: 23,
      sea: 31,
      storm: 43,
      terminal: 59,
    }[world.paper] || 7,
  );
  const grad = (stops, slant) => {
    const base = g.createLinearGradient(0, 0, S * (slant ?? 0.7), S);
    stops.forEach((col, i) => base.addColorStop(i / (stops.length - 1), col));
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
  };
  const fibers = (n, dark, light) => {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = r() * S,
        y = r() * S,
        len = (10 + r() * 70) * u;
      const along = r() < 0.72;
      const a = (along ? 0 : Math.PI / 2) + (r() - 0.5) * (along ? 0.42 : 0.72);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 16 * u, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.strokeStyle = r() < 0.8 ? dark(r) : light(r);
      g.lineWidth = (0.32 + r() * 0.82) * u;
      g.stroke();
    }
  };
  const vignette = (rgba) => {
    const v = g.createRadialGradient(S / 2, S / 2, S * 0.38, S / 2, S / 2, S * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, rgba);
    g.fillStyle = v;
    g.fillRect(0, 0, S, S);
  };
  const kind = world.paper;
  if (kind === 'cream') {
    grad(['#f3ecd8', '#eee5cc', '#e4d8b8'], 0.9);
    fibers(2000, (r) => `rgba(170,150,110,${0.03 + r() * 0.06})`, (r) => `rgba(252,248,232,${0.08 + r() * 0.09})`);
    vignette('rgba(85,70,42,0.15)');
  } else if (kind === 'shell') {
    grad(['#faf6ec', '#f4eede', '#ebe2cc'], 0.9);
    fibers(
      2200,
      (r) => `rgba(180,158,116,${0.03 + r() * 0.06})`,
      (r) => `rgba(252,246,228,${0.08 + r() * 0.09})`,
    );
    vignette('rgba(90,70,40,0.14)');
  } else if (kind === 'kozo') {
    grad(['#f6f0e1', '#efe7d2', '#e5d8ba'], 0.9);
    fibers(2400, (r) => `rgba(180,158,116,${0.03 + r() * 0.07})`, (r) => `rgba(252,246,228,${0.08 + r() * 0.09})`);
    vignette('rgba(90,70,40,0.16)');
  } else if (kind === 'dawn') {
    grad(['#f6e8d2', '#f1ddc4', '#e6cbaa'], 0.5);
    const glow = g.createRadialGradient(S * 0.75, S * 0.2, 10, S * 0.75, S * 0.2, S * 0.55);
    glow.addColorStop(0, 'rgba(220,140,90,0.10)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, S, S);
    fibers(1800, (r) => `rgba(180,140,100,${0.03 + r() * 0.05})`, (r) => `rgba(255,246,230,${0.07 + r() * 0.08})`);
    vignette('rgba(110,70,40,0.15)');
  } else if (kind === 'kaki') {
    grad(['#e0b587', '#d5a672', '#c2915c'], 0.8);
    for (let i = 0; i < 36; i++) {
      const x = r() * S, y = r() * S, rad = (30 + r() * 110) * u;
      const cl = g.createRadialGradient(x, y, 2, x, y, rad);
      cl.addColorStop(0, r() < 0.55 ? `rgba(130,74,32,${0.07 + r() * 0.1})` : `rgba(230,180,120,${0.06 + r() * 0.08})`);
      cl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = cl;
      g.beginPath();
      g.arc(x, y, rad, 0, 7);
      g.fill();
    }
    fibers(1400, (r) => `rgba(120,70,30,${0.03 + r() * 0.05})`, (r) => `rgba(240,200,150,${0.04 + r() * 0.05})`);
    vignette('rgba(70,38,12,0.2)');
  } else if (kind === 'urushi') {
    grad(['#1c1713', '#151110', '#0e0b09'], 0.6);
    const sheen = g.createRadialGradient(S * 0.3, S * 0.22, 10, S * 0.3, S * 0.22, S * 0.75);
    sheen.addColorStop(0, 'rgba(90,80,66,0.13)');
    sheen.addColorStop(0.5, 'rgba(40,34,28,0.05)');
    sheen.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 420; i++) {
      const x = r() * S, y = r() * S, len = (6 + r() * 38) * u, a = -0.6 + (r() - 0.5) * 0.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.strokeStyle = `rgba(70,60,48,${0.03 + r() * 0.05})`;
      g.lineWidth = (0.3 + r() * 0.5) * u;
      g.stroke();
    }
  } else if (kind === 'kon') {
    grad(['#161e38', '#111830', '#0b1122'], 0.7);
    fibers(1400, (r) => `rgba(90,110,170,${0.015 + r() * 0.04})`, (r) => `rgba(140,160,220,${0.02 + r() * 0.04})`);
    for (let i = 0; i < 200; i++) {
      const b = r();
      g.fillStyle = `rgba(${(200 + b * 40) | 0},${(205 + b * 30) | 0},${(235 + b * 20) | 0},${0.06 + r() * 0.45})`;
      g.beginPath();
      g.arc(r() * S, r() * S, (0.4 + r() * 1.1) * u, 0, 7);
      g.fill();
    }
  } else if (kind === 'sea') {
    grad(['#16324a', '#102940', '#0a1e30'], 0.5);
    for (let i = 0; i < 14; i++) {
      const y0 = r() * S;
      g.beginPath();
      g.moveTo(0, y0);
      for (let x = 0; x <= S; x += S / 24) g.lineTo(x, y0 + Math.sin((x / S) * 12.56 + i) * 10 * u);
      g.strokeStyle = `rgba(130,170,205,${0.02 + r() * 0.045})`;
      g.lineWidth = (0.6 + r() * 1.2) * u;
      g.stroke();
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(220,232,240,${0.04 + r() * 0.2})`;
      g.beginPath();
      g.arc(r() * S, r() * S, (0.3 + r() * 1.0) * u, 0, 7);
      g.fill();
    }
  } else if (kind === 'storm') {
    grad(['#2a2117', '#1e1710', '#14100a'], 0.4);
    for (let i = 0; i < 22; i++) {
      const x = r() * S,
        y = r() * S,
        len = (30 + r() * 120) * u;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - len * 0.25, y + len);
      g.strokeStyle = `rgba(120,102,70,${0.02 + r() * 0.04})`;
      g.lineWidth = (0.5 + r() * 0.9) * u;
      g.stroke();
    }
    g.beginPath();
    let lx = S * 0.12,
      ly = S * 0.55;
    g.moveTo(lx, ly);
    for (let i = 0; i < 7; i++) {
      lx += (r() - 0.3) * 60 * u;
      ly += (18 + r() * 46) * u;
      g.lineTo(lx, ly);
    }
    g.strokeStyle = 'rgba(217,169,63,0.14)';
    g.lineWidth = 2.2 * u;
    g.stroke();
  } else {
    grad(['#081218', '#050d12', '#03080c'], 0.3);
    g.font = `${9 * u}px monospace`;
    for (let col = 0; col < 16; col++) {
      const x = ((col + 0.5) * S) / 16;
      let y = r() * S;
      const n = 3 + ((r() * 7) | 0);
      for (let i = 0; i < n; i++) {
        const ch = PAPER_KATA[(r() * PAPER_KATA.length) | 0];
        g.fillStyle = `rgba(55,232,176,${(0.03 + r() * 0.09) * (1 - (i / n) * 0.6)})`;
        g.fillText(ch, x, y + i * 12 * u);
      }
    }
    for (let i = 0; i < 3; i++) {
      const y = r() * S;
      g.fillStyle = 'rgba(120,255,210,0.015)';
      g.fillRect(0, y, S, 8 * u);
    }
  }
  return c;
}

function inkSpecFor(INK, strokes) {
  const world = THEME_UI[themeIx()];
  const iw = INK_WORLDS[world.id] || INK_WORLDS.sumi;
  return {
    pal: iw.pal,
    wetScale: iw.wetScale,
    strokes,
    still: iw.still || world.ink,
    ground: (r, size) => inkGroundFor(world, size),
    gpuN: 1024,
    gl2Sim: 800,
  };
}
async function mountInkRoom(room2, ch, paths, reduced) {
  stopInkRoom();
  const { page, stage, pips } = room2;
  const canvas = el('canvas', 'ink-sheet');
  canvas.setAttribute('aria-hidden', 'true'); // the backends set the backing 1:1 to the lattice
  stage.prepend(canvas); // beneath the SVG overlay (numbers ride on the ink)
  const room = (inkRoom = {
    handle: null,
    canvas,
    page,
    stage,
    lift: null,
    syncLift: null,
    unsync: null,
  });
  const fillPips = (upto) => {
    if (!pips) return;
    [...pips.children].forEach((p, i) => p.classList.toggle('filled', i < upto));
  };
  try {
    const [INK, glyph] = await Promise.all([ensureInkModule(), animcjkGlyphFor(ch)]);
    if (inkRoom !== room || !document.contains(canvas)) return;
    // TRUE brush outlines when AnimCJK carries the character (gallery
    // quality); the KanjiVG-synthesized body only for the rare rest
    const strokes = glyph ? INK.deriveStrokes(glyph.strokes, glyph.medians) : INK.strokesFromKanjiVG(paths);
    const spec = inkSpecFor(INK, strokes);
    // the stroke pips and number positions follow the glyph actually written
    if (pips && pips.children.length !== strokes.length) {
      pips.textContent = '';
      for (let i = 0; i < strokes.length; i++) pips.append(el('i', 'stroke-pip'));
    }
    if (glyph) {
      // AnimCJK is the living hand's authority. A small number of glyphs have
      // a different stroke count from KanjiVG (for example 衷: 10 vs 9), so
      // rebuild the marker group rather than silently dropping the last
      // number from the live sequence.
      const nums = page.querySelector('.stroke-nums');
      if (nums) {
        nums.textContent = '';
        strokes.forEach((stroke, i) => {
          const marker = document.createElementNS(SVG_NS, 'text');
          marker.setAttribute('class', 'stroke-num');
          marker.setAttribute('x', String((stroke.medPts[0][0] * 109) / 1024));
          marker.setAttribute('y', String((stroke.medPts[0][1] * 109) / 1024));
          marker.textContent = String(i + 1);
          nums.append(marker);
        });
      }
    }
    if (reduced) {
      // stillness by choice: one finished sheet, hand-painted, no engine
      INK.paintStillFor(canvas, spec);
      page.dataset.living = 'still';
      page.dataset.inkReady = 'still';
      fillPips(strokes.length);
      syncStrokeNumbers(page, strokes.length);
      return;
    }
    // the room opens WRITING, exactly as the design gallery did on promote:
    // wall-clock hand, one lattice pass per displayed frame, freeze at
    // finish. No hidden fast-forward — a fast-forward trades away the very
    // simulation density that makes the ink dense and detailed.
    spec.first = strokeRewriteOptions();
    spec.freshCanvas = () => {
      const nu = room.canvas.cloneNode(false);
      room.canvas.replaceWith(nu);
      room.canvas = nu;
      return nu;
    };
    spec.onStroke = (ix) => {
      const shown = Math.min(strokes.length, ix + 1);
      fillPips(shown);
      syncStrokeNumbers(page, shown);
    };
    spec.onPhase = (phase) => {
      if (phase === 'writing') {
        fillPips(0);
        syncStrokeNumbers(page, 0);
      }
      if (phase === 'done') {
        fillPips(strokes.length);
        syncStrokeNumbers(page, strokes.length);
      }
    };
    const handle = await INK.startInk(canvas, spec);
    if (inkRoom !== room) {
      handle.stop();
      return;
    }
    room.handle = handle;
    handle.ondead = () => {
      // Device loss returns the numbered SVG to the stage before classic
      // drawing resumes. The page therefore never loses its honest fallback.
      if (inkRoom === room) {
        try {
          if (room.unsync) room.unsync();
          if (room.lift) {
            const liftedSvg = room.lift.querySelector('svg.stroke-canvas');
            if (liftedSvg) stage.append(liftedSvg);
            room.lift.remove();
            room.lift = null;
            room.syncLift = null;
          }
        } catch {
          /* overlay already gone */
        }
        if (room.canvas?.isConnected) room.canvas.remove();
        page.dataset.living = 'off';
        page.dataset.inkReady = 'fallback';
        syncSpeedCorner(page);
        syncStrokeNumbers(page);
      }
    };
    page.dataset.living = 'on';
    page.dataset.inkReady = handle.kind;
    page.dataset.inkKind = handle.kind;
    const tag = page.querySelector('#stroke-engine');
    if (tag) tag.textContent = handle.kind === 'gpu' ? '筆 WebGPU' : '筆 WebGL';
    // A positioned sibling over the live WebGL canvas can blank that canvas
    // in Safari. Move only the numbered SVG to a body-level fixed layer and
    // keep it aligned to the stage; the world picker already proves this
    // compositor path is safe. The SVG fallback and reduced still stay put.
    const numsSvg = page.querySelector('svg.stroke-canvas');
    if (numsSvg) {
      const lift = el('div', 'stroke-nums-lift');
      lift.setAttribute('aria-hidden', 'true');
      lift.style.setProperty(
        '--stroke-ink',
        getComputedStyle(page).getPropertyValue('--stroke-ink'),
      );
      lift.append(numsSvg);
      document.body.append(lift);
      const sync = () => {
        const rect = stage.getBoundingClientRect();
        lift.style.top = `${rect.top}px`;
        lift.style.left = `${rect.left}px`;
        lift.style.width = `${rect.width}px`;
        lift.style.height = `${rect.height}px`;
      };
      sync();
      page.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      room.lift = lift;
      room.syncLift = sync;
      room.unsync = () => {
        page.removeEventListener('scroll', sync);
        window.removeEventListener('resize', sync);
      };
      syncStrokeNumbers(page);
    }
  } catch (e) {
    console.warn('書の間: living ink unavailable —', e && e.message);
    if (inkRoom === room) {
      page.dataset.living = 'off';
      page.dataset.inkReady = 'fallback';
      syncSpeedCorner(page);
      canvas.remove(); // no engine and no still — the SVG diagram stands alone
    }
  }
}

/** Sleep or wake the quiet room's single allowed field. Visibility alone is
 * not enough: inert + aria-hidden remove the sleeping controls from keyboard
 * and screen-reader navigation while the kanji stands by itself. */
function setStrokeChrome(page, awake) {
  S.strokeChromeAwake = !!awake;
  page.dataset.chrome = S.strokeChromeAwake ? 'awake' : 'sleeping';
  const trigger = page.querySelector('.stroke-chrome-trigger');
  if (trigger) {
    trigger.setAttribute('aria-expanded', String(S.strokeChromeAwake));
    trigger.setAttribute(
      'aria-label',
      tx(
        S.strokeChromeAwake ? '操作を隠す' : '操作を表示',
        S.strokeChromeAwake ? 'hide controls' : 'show controls',
      ),
    );
  }
  for (const field of page.querySelectorAll('[data-stroke-chrome]')) {
    field.inert = !S.strokeChromeAwake;
    if (S.strokeChromeAwake) field.removeAttribute('aria-hidden');
    else field.setAttribute('aria-hidden', 'true');
  }
  requestAnimationFrame(() => {
    if (inkRoom?.page === page && inkRoom.syncLift) inkRoom.syncLift();
  });
}

function renderStrokePage(root) {
  const st = S.strokes;
  if (!st) {
    stopInkRoom(); // the page is gone however it left — never orphan an engine
    return;
  }
  const k = D.kanji[st.id];
  const paths = strokePathsFor(st.id);
  const reduced = strokeReduced();

  const page = el('div', 'stroke-page');
  page.id = 'stroke-page';
  page.tabIndex = -1;
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-modal', 'true');
  page.setAttribute('aria-label', tx(`${st.id} の筆順`, `${st.id} — stroke order`));
  page.dataset.kanji = st.id;
  page.dataset.strokes = String(paths.length);
  page.dataset.motion = reduced ? 'reduced' : 'full';
  page.dataset.numbers = S.strokeNumbers ? 'on' : 'off';
  page.dataset.strokeShown = '0';
  page.dataset.state = paths.length ? 'drawing' : 'nodata';
  page.dataset.inkReady = paths.length ? 'pending' : 'missing';
  page.dataset.ink = S.strokeInk || 'sumi';
  page.dataset.world = themeId();
  page.dataset.minimal = S.strokeMinimal ? 'on' : 'off';
  page.dataset.chrome = S.strokeChromeAwake ? 'awake' : 'sleeping';
  if (S.strokeMinimal) {
    const exitDescription = el(
      'p',
      'visually-hidden',
      tx(
        '書の間を出るには、ブラウザまたは端末の戻る操作を使います。',
        'Use the browser or device Back command to leave the writing room.',
      ),
    );
    exitDescription.id = 'stroke-exit-description';
    page.setAttribute('aria-describedby', exitDescription.id);
    page.append(exitDescription);
  }

  const bar = el('div', 'stroke-bar');
  const backBtn = biLabel('button', 'stroke-back', '← 戻る', 'back');
  backBtn.type = 'button';
  backBtn.id = 'strokes-back';
  // NOT part of the sleeping-inert chrome sweep: the back door must stay
  // tappable while the room sleeps (operator, 2026-08-15: "no functioning
  // back button" — a learner may never be trapped behind a history gesture)
  backBtn.dataset.action = 'navigation.back';
  backBtn.addEventListener('click', (event) => {
    interaction(
      { kind: 'navigation.back' },
      event.detail === 0 ? 'keyboard' : 'pointer',
      'strokes-back',
    );
    closeStrokePage();
  });
  bar.append(backBtn);

  const title = el('span', 'stroke-title');
  title.append(el('span', 'stroke-title-word', tx('書の間', 'the writing room')));
  bar.append(title);

  // the world seal, top right — the room re-dresses AND re-inks on a world
  // change (the design's chrome-row: ← 戻る · 書の間 · seal)
  const seal = el('button', 'theme-seal stroke-seal', THEME_UI[themeIx()].seal);
  seal.type = 'button';
  seal.id = 'stroke-world-seal';
  // NOT part of the sleeping-inert chrome sweep: the seal is the top-right
  // corner of the quiet room (operator spec) and must answer while sleeping
  seal.setAttribute('aria-label', tx('世界を選ぶ', 'choose a world'));
  attachWorldPicker(seal);
  bar.append(seal);
  // The bar mounts in BOTH modes. In the quiet room CSS pares it to one
  // faint, always-live 戻る (44px) — the visible back door beside the ⋯
  // trigger; title and seal stay awake-field concerns there.
  page.append(bar);

  if (!paths.length) {
    if (S.strokeMinimal) {
      const body = el('div', 'stroke-body');
      const stage = el('div', 'stroke-stage stroke-missing-stage');
      stage.setAttribute('role', 'img');
      stage.setAttribute('aria-label', st.id);
      stage.append(el('span', 'stroke-missing-glyph', st.id));
      body.append(stage, strokeAwakeField(page, k));
      page.append(body);
    } else {
      strokeMissing(page, st.id, k);
    }
  } else {
    const body = el('div', 'stroke-body');
    // the glyph header — 永 五画 · 水部, readings to the right, the kun stem
    // in the world's red (the design's khead, from real kanji data)
    const khead = el('div', 'stroke-khead');
    const kleft = el('span', 'stroke-k', st.id);
    const radC = D.radInfo?.[k?.rad]?.c;
    kleft.append(
      el('span', 'stroke-k-meta', `${k?.st ?? paths.length}画${radC ? ` · ${radC}部` : ''}`),
    );
    const readings = el('span', 'stroke-readings');
    if (k?.on?.length) {
      const row = el('span', 'stroke-read-row');
      row.append(el('span', 'stroke-read-label', '音'), el('span', 'stroke-on', k.on.join('・')));
      readings.append(row);
    }
    if (k?.kun?.length) {
      const row = el('span', 'stroke-read-row');
      row.append(el('span', 'stroke-read-label', '訓'));
      k.kun.forEach((kn, i) => {
        const [stem, oku] = kn.split('.');
        if (i) row.append(document.createTextNode('・'));
        const reading = el('span', 'stroke-kun');
        reading.append(el('span', 'stroke-kun-stem', stem));
        if (oku) reading.append(document.createTextNode(oku));
        row.append(reading);
      });
      readings.append(row);
    }
    khead.append(kleft, readings);
    if (!S.strokeMinimal) body.append(khead);
    const stage = el('div', 'stroke-stage');
    stage.id = 'ink-stage';
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', tx(`${st.id} の筆順`, `${st.id} stroke order`));
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', STROKE_VIEWBOX);
    svg.setAttribute('class', 'stroke-canvas');
    svg.id = 'stroke-canvas';
    svg.setAttribute('aria-hidden', 'true');

    // 界 — the writing guide: quarters of the square, the way squared paper
    // teaches balance. Drawn from --line, so it fades with the theme.
    const grid = document.createElementNS(SVG_NS, 'g');
    grid.setAttribute('class', 'stroke-grid');
    for (const [x1, y1, x2, y2] of [
      [54.5, 0, 54.5, 109],
      [0, 54.5, 109, 54.5],
    ]) {
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', String(x1));
      l.setAttribute('y1', String(y1));
      l.setAttribute('x2', String(x2));
      l.setAttribute('y2', String(y2));
      grid.append(l);
    }
    svg.append(grid);

    // the whole glyph, very faint: where the hand is going
    const guide = document.createElementNS(SVG_NS, 'g');
    guide.setAttribute('class', 'stroke-guide');
    for (const d of paths) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      guide.append(p);
    }
    svg.append(guide);

    // 滲み — the ink's soft bleed into the paper, a wider ghost of each
    // stroke beneath the crisp line. Two passes read as sumi on washi where
    // one uniform line reads as marker on cardboard.
    const bleed = document.createElementNS(SVG_NS, 'g');
    bleed.setAttribute('class', 'stroke-bleed');
    for (const d of paths) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      bleed.append(p);
    }
    svg.append(bleed);

    const ink = document.createElementNS(SVG_NS, 'g');
    ink.setAttribute('class', 'stroke-ink');
    for (const d of paths) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      ink.append(p);
    }
    svg.append(ink);

    const nums = document.createElementNS(SVG_NS, 'g');
    nums.setAttribute('class', 'stroke-nums');
    paths.forEach((d, i) => {
      const start = strokeStart(d);
      if (!start) return;
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('class', 'stroke-num');
      t.setAttribute('x', String(start.x));
      t.setAttribute('y', String(start.y));
      t.textContent = String(i + 1);
      nums.append(t);
    });
    svg.append(nums);
    stage.append(svg);
    body.append(stage);

    // the stroke pips — one dot per stroke, pressed as the hand writes
    const pips = el('div', 'stroke-pips');
    pips.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < paths.length; i++) pips.append(el('i', 'stroke-pip'));
    if (!S.strokeMinimal) body.append(pips);

    const hint = el('p', 'stroke-hint', '触れて、もう一度 — 二度と同じ書にならない');
    if (bi()) hint.append(el('span', 'en-sub', 'touch — it writes again, never the same twice'));
    if (!S.strokeMinimal) body.append(hint);

    // the living sheet mounts beneath the SVG overlay; the page's data-living
    // attribute decides which layers show (the ink, or the classic diagram)
    page.dataset.living = 'off';
    mountInkRoom({ page, stage, pips }, st.id, paths, reduced);
    // 触れて、もう一度 — live and honest SVG fallback share the same silent
    // touch-to-rewrite gesture. Reduced motion remains a finished still.
    stage.addEventListener('click', () => {
      if (reduced) return;
      if (page.dataset.living === 'on' && inkRoom?.page === page && inkRoom.handle)
        inkRoom.handle.rewrite(strokeRewriteOptions());
      else startStrokeAnimation(page);
    });

    const liveStatus = el('span', 'visually-hidden');
    liveStatus.id = 'stroke-live-status';
    liveStatus.setAttribute('role', 'status');
    liveStatus.setAttribute('aria-live', 'polite');
    body.append(liveStatus);

    const readout = el('div', 'stroke-readout');
    const counter = el('span', 'stroke-count', `0 / ${paths.length}`);
    counter.id = 'stroke-count';
    counter.dataset.current = '0';
    counter.dataset.total = String(paths.length);
    if (reduced) {
      counter.setAttribute('role', 'status');
      counter.setAttribute('aria-live', 'polite');
    }
    readout.append(counter);
    readout.append(el('span', 'stroke-count-unit', tx('画', 'strokes')));
    if (!S.strokeMinimal) body.append(readout);

    if (S.strokeMinimal) {
      body.append(strokeAwakeField(page, k));
    } else {
      const controls = el('div', 'stroke-controls');
      if (reduced) {
        const prev = strokeControl('stroke-prev', '← 前の画', 'previous stroke');
        prev.addEventListener('click', () => {
          S.strokes.step = Math.max(1, S.strokes.step - 1);
          paintStrokes(page, S.strokes.step, 1);
        });
        const next = strokeControl('stroke-next', '次の画 →', 'next stroke');
        next.addEventListener('click', () => {
          S.strokes.step = Math.min(paths.length, S.strokes.step + 1);
          paintStrokes(page, S.strokes.step, 1);
        });
        controls.append(prev, next);
      } else {
        const replay = strokeControl('stroke-replay', 'もう一度', 'replay');
        replay.classList.add('primary');
        replay.addEventListener('click', () => {
          if (page.dataset.living === 'on' && inkRoom?.handle)
            inkRoom.handle.rewrite(strokeRewriteOptions());
          else startStrokeAnimation(page);
        });
        controls.append(replay);
        // ゆっくり — the next writing goes at a learner's pace
        const slow = strokeControl('stroke-slow', 'ゆっくり', 'slowly');
        slow.setAttribute('aria-pressed', String(!!S.strokeSlow));
        slow.addEventListener('click', () => {
          S.strokeSlow = !S.strokeSlow;
          slow.setAttribute('aria-pressed', String(!!S.strokeSlow));
          if (page.dataset.living === 'on' && inkRoom?.handle)
            inkRoom.handle.rewrite(strokeRewriteOptions());
        });
        controls.append(slow);
      }

      // 顔料 — four inks. A quiet row of pigment dots; the page holds the choice.
      const inks = el('div', 'stroke-inks');
      inks.setAttribute('role', 'group');
      inks.setAttribute('aria-label', tx('墨の色', 'ink color'));
      for (const [id, name] of [
        ['sumi', '墨'],
        ['bengara', '弁柄'],
        ['ai', '藍'],
        ['rokusho', '緑青'],
      ]) {
        const dot = el('button', 'ink-dot');
        dot.type = 'button';
        dot.dataset.ink = id;
        dot.setAttribute('aria-label', name);
        dot.setAttribute('aria-pressed', String((S.strokeInk || 'sumi') === id));
        dot.addEventListener('click', () => {
          S.strokeInk = id;
          page.dataset.ink = id;
          for (const d of inks.querySelectorAll('.ink-dot'))
            d.setAttribute('aria-pressed', String(d.dataset.ink === id));
        });
        inks.append(dot);
      }
      body.append(inks);

      controls.append(strokeNumbersControl(page, reduced));
      body.append(controls);

      const meta = el('p', 'stroke-meta');
      // 漢検 · JLPT · 画数 are doors here too: each opens the exhaustive list of
      // every kanji in that group. The stroke page is not a sheet, so close it
      // first, then open the catalog over the kanji entry it came from.
      const metaLink = (label, by, value) => {
        const b = el('button', 'stroke-meta-link', label);
        b.type = 'button';
        b.addEventListener('click', () => {
          closeStrokePage();
          go({ t: 'catalog', id: `${by}:${value}`, by, value });
        });
        return b;
      };
      const links = [];
      if (D.kanken[st.id]?.kk)
        links.push(metaLink(`漢検 ${D.kanken[st.id].kk}`, 'kanken', D.kanken[st.id].kk));
      if (D.kmeta?.[st.id]?.jlpt)
        links.push(metaLink(`JLPT ${D.kmeta[st.id].jlpt}`, 'jlpt', D.kmeta[st.id].jlpt));
      links.push(
        metaLink(
          tx(`${k?.st ?? paths.length} 画`, `${k?.st ?? paths.length} strokes`),
          'strokes',
          k?.st ?? paths.length,
        ),
      );
      if (k) meta.append(el('span', 'stroke-meta-mean', k.m), document.createTextNode('　·　'));
      links.forEach((b, i) => {
        if (i) meta.append(document.createTextNode(' · '));
        meta.append(b);
      });
      // honest engineering: name the engine actually drawing the ink, so a
      // fallback never masquerades as the real lattice (筆 WebGPU / WebGL / 図)
      const engineTag = el('span', 'stroke-engine');
      engineTag.id = 'stroke-engine';
      meta.append(document.createTextNode(' · '), engineTag);
      body.append(meta);
    }
    page.append(body);
  }

  if (S.strokeMinimal) {
    // the wake mark is an ensō — one brush circle, not three dots
    // (operator: "a more artistic symbol… it should open up elegantly")
    const wake = el('button', 'stroke-chrome-trigger');
    wake.type = 'button';
    wake.innerHTML =
      '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M25 7 C 35.5 7.6, 42 15, 41.8 24.4 C 41.6 34, 33.8 41.2, 24 41 C 14.4 40.8, 6.8 33.4, 7 23.8 C 7.2 15, 13.6 8.4, 21.4 7.2" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/><path d="M25 7 C 30 7.3, 34 9, 37 12" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" opacity="0.85"/></svg>';
    wake.setAttribute('aria-controls', 'stroke-awake-field');
    wake.addEventListener('click', () => setStrokeChrome(page, !S.strokeChromeAwake));
    page.append(wake);
    if (paths.length) {
      // 四隅 — numbers bottom-right, speed bottom-left; always in reach,
      // faint until touched, never crowding the sheet (operator spec)
      const numbersCorner = strokeNumbersControl(page, reduced);
      numbersCorner.classList.add('stroke-corner', 'stroke-corner-br');
      page.append(numbersCorner);
      // ゆっくり governs the SPEED OF THE WRITING, and under
      // prefers-reduced-motion nothing here writes — the room shows a still
      // hand. The corner was appended anyway, reporting itself pressed while
      // it could never change a pixel (E3 round-B, writing-room lens). A
      // control with nothing to control does not belong in the room; the
      // framed room already makes the same swap for its replay strip.
      if (!reduced) {
        const speedCorner = strokeSpeedControl(page);
        speedCorner.classList.add('stroke-corner', 'stroke-corner-bl');
        page.append(speedCorner);
      }
    }
    setStrokeChrome(page, S.strokeChromeAwake);
  }

  page.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (S.strokeMinimal && S.strokeChromeAwake) {
        setStrokeChrome(page, false);
        page.querySelector('.stroke-chrome-trigger')?.focus({ preventScroll: true });
        return;
      }
      interaction({ kind: 'layer.dismiss' }, 'keyboard', 'strokes-escape');
      closeStrokePage();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...page.querySelectorAll('button, a[href], [tabindex]')].filter(
      (item) =>
        !item.disabled &&
        !item.closest('[inert]') &&
        item.tabIndex >= 0 &&
        // offsetParent is null for a POSITION:FIXED element, and both of this
        // room's corner controls — 筆順の番号 and ゆっくり — are fixed. Using it
        // as the visibility test dropped them from the trap, so Tab wrapped
        // past the two controls the operator placed by hand (E3 round-A,
        // writing-room lens). A rendered box is the honest test.
        item.getClientRects().length > 0 &&
        getComputedStyle(item).visibility !== 'hidden',
    );
    if (!focusable.length) {
      event.preventDefault();
      page.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // …and the ring must also catch focus that is inside the dialog but not
    // ON the ring. Both rooms open with focus on their own container — it IS
    // the dialog — which is neither first nor last, so one Shift+Tab walked
    // straight out to <body>, and Escape, bound to that element, then did
    // nothing: in the quiet room that is the §6 sleep/exit key, dead
    // (E3 round-C, writing-room lens).
    const here = document.activeElement;
    if (!focusable.includes(here)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && here === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && here === last) {
      event.preventDefault();
      first.focus();
    }
  });

  root.append(page);
  if (paths.length) startStrokeAnimation(page);
  queueMicrotask(() => {
    const paletteFocus = S.strokePaletteFocus;
    S.strokePaletteFocus = null;
    if (S.strokeMinimal && paletteFocus && S.strokeChromeAwake) {
      const choice = page.querySelector(`.stroke-palette-choice[data-world='${paletteFocus}']`);
      if (choice) {
        choice.focus({ preventScroll: true });
        return;
      }
    }
    (S.strokeMinimal ? page : backBtn).focus({ preventScroll: true });
  });
}

function renderRadicalNode(sheet, node) {
  const r = D.radicals[node.id];
  if (!r) {
    sheet.append(el('div', 'sem-empty', tx('この部品はこの層にない。', 'This part is not in this layer.')));
    return;
  }
  // Is this component itself one of the 214 official radicals? If so, name it
  // as one — the operator's point: the radical system is real, not "up for
  // debate". If not, it is a shape-component and says so plainly.
  const official = D.radByGlyph?.[node.id];
  const posText =
    official && (official.pos === '独立' ? tx('独立', 'stands alone') : tx(official.pos, `${official.pos} · ${official.posEn}`));

  const hero = el('div', 'hero');
  hero.append(el('div', 'hero-glyph', r.c));
  const meta = el('div', 'hero-meta');
  meta.append(
    el(
      'div',
      'hero-mean',
      (official && official.name) || r.name || tx('（名称は漢検の部首表にない部品）', '(a part with no name in the 漢検 radical table)'),
    ),
  );
  const chips = el('div', 'shelf-meta');
  if (official) {
    chips.append(el('span', 'pool-tag', tx(`部首 ${official.n}`, `radical ${official.n}`)));
    chips.append(el('span', 'pool-tag', posText));
  }
  if (r.st) chips.append(el('span', 'pool-tag', tx(`${r.st} 画`, `${r.st} strokes`)));
  chips.append(el('span', 'pool-tag', tx(`${r.kanjiCount} 字`, `${r.kanjiCount} kanji`)));
  meta.append(chips);
  hero.append(meta);
  sheet.append(hero);

  const note = el('div', 'note');
  note.textContent = official
    ? tx(
        `康熙部首の第 ${official.n} 番「${official.name}」。位置は${posText}。下は、この部品を含む字。`,
        `Official Kangxi radical no. ${official.n} — ${official.name} (${posText}). Below: the characters that contain this part.`,
      )
    : tx('「この部品を含む」族。康熙部首ではない部品。', 'The family of characters containing this part — a shape component, not one of the Kangxi radicals.');
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

/** 出会い — the observation ledger, read back at last (P2-19).
 *
 * The obslog has been written richly since the first build and read by
 * nothing but probe dedup. This is its first honest consumer: on an entry
 * sheet, the item's own encounters, distilled — when it was first met, how
 * many times, and what the last practice actually said.
 *
 * It is EVIDENCE DISPLAY, never a level claim: exposure is not mastery
 * (constitution §4), so this section states counts and dates and the words
 * the learner's own actions used. It never computes a knownness, never
 * colours the item, and never touches FSRS state. When an item has no
 * history the section is absent rather than showing a hopeful zero. */
const TRAIL_KINDS = new Set(['tap', 'probe', 'dojo', 'lesson', 'reveal', 'drift']);
function encounterTrail(key) {
  const rows = (S.obslog || []).filter((row) => TRAIL_KINDS.has(row[1]) && row[2] === key);
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const counts = {};
  for (const row of rows) counts[row[1]] = (counts[row[1]] || 0) + 1;
  // ひとつ戻す files a REVOCATION into the same append-only ledger —
  // ['dojo', key, 0] — because the log never erases what it takes back. The
  // trail read it as one more practice row, so undoing a drill made the
  // sheet claim MORE practice than before (E3 round-B, srs-wiring lens).
  // A revocation is not an encounter, and it cancels the row it points at.
  const revoked = (counts.dojo && rows.filter((row) => row[1] === 'dojo' && row[3] === 0).length) || 0;
  const practised = (counts.dojo || 0) - revoked;
  const cancelled = Math.min(practised, revoked);
  counts.dojo = Math.max(0, practised - cancelled);
  const met = Math.max(1, rows.length - revoked - cancelled);
  return { rows, first: rows[0][0], last, counts, met };
}
/** The last row, said in the learner's own terms — never a verdict. */
function trailLastPhrase(row) {
  const kind = row[1];
  const g = row[3];
  if (kind === 'tap') {
    if (g === 3) return tx('全項目をひらいた', 'opened the full entry');
    if (g === 2) return tx('語釈を見た', 'looked at the meaning');
    return tx('ふりがなを出した', 'revealed the reading');
  }
  if (kind === 'drift') return g === 3 ? tx('水で「わかる」', 'flicked as known in the water') : tx('水で「まだ」', 'flicked as not yet in the water');
  if (kind === 'probe') return g === 3 ? tx('読めた（試し読み）', 'read it right in the probe') : tx('読めなかった（試し読み）', 'missed it in the probe');
  if (kind === 'lesson') return g === 3 ? tx('レッスンで正解', 'answered right in a lesson') : tx('レッスンで不正解', 'answered wrong in a lesson');
  if (kind === 'reveal') return g === 1 ? tx('復習で「思い出した」', 'declared recall in review') : tx('復習で「まだ」', 'declared not-yet in review');
  if (kind === 'dojo') {
    // detail 0 is the revocation ひとつ戻す files, not a grade
    if (g === 0) return tx('道場の稽古を取り消した', 'took back a dojo practice record');
    const seal = { 1: '再', 2: '難', 3: '良', 4: '易' }[g];
    return seal ? tx(`道場の稽古 — ${seal}`, `practised in the dojo — ${['', 'again', 'hard', 'good', 'easy'][g]}`) : tx('道場の稽古', 'practised in the dojo');
  }
  return tx('出会った', 'met it');
}
function renderEncounterTrail(sheet, node) {
  if (!['word', 'kanji', 'radical', 'idiom'].includes(node.t)) return;
  const trail = encounterTrail(srsKey(node.t, node.id));
  if (!trail) return;
  const box = el('div', 'encounter-trail');
  box.append(withEn(el('p', 'eyebrow', '出会い'), 'your encounters', 'en-inline'));
  const day = (t) => new Date(t).toLocaleDateString();
  const n = trail.met;
  box.append(
    el(
      'p',
      'trail-line',
      tx(
        `初めて ${day(trail.first)} ・ これまで ${n}回`,
        `first met ${day(trail.first)} · ${n} ${n === 1 ? 'encounter' : 'encounters'} so far`,
      ),
    ),
  );
  box.append(
    el('p', 'trail-line', tx(`直近 ${day(trail.last[0])} — ${trailLastPhrase(trail.last)}`, `last ${day(trail.last[0])} — ${trailLastPhrase(trail.last)}`)),
  );
  // the third line only when practice actually happened — a reading tapped
  // in the reader is assistance, not practice, and must not be dressed as it
  const practice = (trail.counts.dojo || 0) + (trail.counts.probe || 0) + (trail.counts.lesson || 0);
  if (practice) {
    box.append(
      el(
        'p',
        'trail-line trail-quiet',
        tx(`稽古 ${practice}回（記録であって、習熟ではない）`, `${practice} practice ${practice === 1 ? 'record' : 'records'} — evidence, not mastery`),
      ),
    );
  }
  sheet.append(box);
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
  // 覚 top-right on EVERY capturable sheet (operator directive §3: one
  // button, top right corner, on every screen). The sentence page captures
  // the word it is built around — the sentence itself is not a card kind,
  // and its seal says whose it is. A catalog is a grouping, not a thing,
  // and honestly carries none.
  const capNode = NODE_KIND[node.t]
    ? node
    : node.t === 'sent' && node.target
      ? { t: 'word', id: node.target }
      : null;
  if (capNode) {
    const takenNow = S.taken.some((t) => t.t === capNode.t && t.id === capNode.id);
    const capture = el('button', takenNow ? 'sheet-take taken' : 'sheet-take', '覚');
    capture.type = 'button';
    capture.id = 'sheet-take';
    capture.setAttribute('aria-pressed', String(takenNow));
    capture.setAttribute(
      'aria-label',
      capNode === node
        ? tx(takenNow ? '覚えるをやめる' : '覚える', takenNow ? 'stop memorizing' : 'memorize')
        : tx(
            takenNow ? `「${capNode.id}」の覚えるをやめる` : `「${capNode.id}」を覚える`,
            takenNow ? `stop memorizing ${capNode.id}` : `memorize ${capNode.id}`,
          ),
    );
    capture.addEventListener('click', () => {
      toggleTaken(capNode, nodeTitle(capNode));
      render();
    });
    bar.append(capture);
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
  else if (node.t === 'catalog') renderCatalogNode(sheet, node);
  else if (node.t === 'sent') renderSentenceNode(sheet, node);
  renderEncounterTrail(sheet, node);
  // reading position survives the doors: the sheet remembers where each
  // stack entry was scrolled and restores it when that entry returns —
  // back no longer teleports a ~2,700px entry to its top (P1, review).
  // Tracked continuously (passive) onto the node; session-only by design.
  sheet.addEventListener(
    'scroll',
    () => {
      if (S.stack[S.stack.length - 1] === node) node.sheetScroll = sheet.scrollTop;
    },
    { passive: true },
  );
  if (node.sheetScroll) requestAnimationFrame(() => (sheet.scrollTop = node.sheetScroll));
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
    // …and the ring must also catch focus that is inside the dialog but not
    // ON the ring. Both rooms open with focus on their own container — it IS
    // the dialog — which is neither first nor last, so one Shift+Tab walked
    // straight out to <body>, and Escape, bound to that element, then did
    // nothing: in the quiet room that is the §6 sleep/exit key, dead
    // (E3 round-C, writing-room lens).
    const here = document.activeElement;
    if (!focusable.includes(here)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && here === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && here === last) {
      event.preventDefault();
      first.focus();
    }
  });
  root.append(sheet);

  // The sheet keeps its place across a full re-render: 筆順 carries the
  // scrollTop it left with and hands it straight back.
  const restore = S.strokes ? S.strokes.sheetScroll : S.sheetScrollRestore;
  if (restore != null) sheet.scrollTop = restore;
  S.sheetScrollRestore = null;

  if (S.strokes) return; // the stroke page above owns focus
  const focusId = S.sheetFocus;
  S.sheetFocus = null;
  // 戻る is where a sheet OPENS, not where every press inside it ends. This
  // ran unconditionally, so 覚える, a context chip, a list chip — every
  // in-sheet state change — threw the keyboard to the corner and announced
  // nothing (E3 round-B, a11y lens). A control that survives its own press
  // keeps the keyboard; only a genuinely new sheet starts at 戻る.
  const held = sheetFocusKey;
  sheetFocusKey = null;
  queueMicrotask(() => {
    const target =
      (focusId && sheet.querySelector(`#${CSS.escape(focusId)}`)) ||
      (held && focusNodeFor(sheet, held)) ||
      backBtn;
    target.focus({ preventScroll: true });
  });
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
  // The variants strip is an operator's instrument, not part of the app. It
  // taped a black band of developer vocabulary across every surface — the
  // reader, the drift, the entry sheets. It now appears only when summoned:
  // ?variants=1 (or any variant/debug URL parameter already present).
  if (!S.variantsBar) return;
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
            if (id === 'field' && S.view === 'shelf') {
              keepScroll();
              S.view = 'entry';
            }
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
/** The view rendered by the previous render() pass — lets a re-render of
 * the SAME view keep the walker's place (see the restore at the bottom). */
let lastRenderedView = null;
/* A control that destroys itself by its own press cannot be found again by
 * name after the rebuild, so the by-name restore below cannot help it: the
 * review room's two gates (start, then 思い出した/まだ) dropped the keyboard
 * to <body> on every card, 21 tabs from the first gate and 56 from the
 * second (E3 round-B, a11y lens). A press that replaces its own control
 * names its successor here, and the next render hands the keyboard forward. */
let focusNextKey = null;
/* …and the sheet manages its own focus after every rebuild, so the restore
 * above cannot reach it. It gets the same courtesy through its own key. */
let sheetFocusKey = null;
/** What each room is called in a crumb — the tray borrows its origin's. */
const VIEW_CRUMB = {
  reader: ['本棚', 'bookshelf'],
  shelf: ['本棚', 'bookshelf'],
  archive: ['新聞アーカイブ', 'archive'],
  levels: ['級', 'levels'],
  lessons: ['レッスン', 'lessons'],
  kanjidex: ['字引', 'kanji finder'],
  grammar: ['文法', 'grammar'],
  thesaurus: ['類語', 'synonyms'],
  airead: ['読み物', 'reading'],
  ai: ['先生', 'tutor'],
  drift: ['銀河', 'galaxy'],
  dojo: ['銀河', 'galaxy'],
  yoji: ['四字熟語', 'four-character idioms'],
  entry: ['野', 'field'],
  review: ['リスト', 'lists'],
  archiveYear: ['新聞アーカイブ', 'archive'],
};
const trayFromView = (from) => (from === 'reader' ? 'reader' : plainRecord(from) ? from.view : null);
/* classes a press FLIPS — excluded from the last-resort focus key, or the
 * control could never be found again by the very press that moved focus */
const FOCUS_STATE_CLASSES = new Set(['on', 'on-list', 'dead', 'active', 'lit', 'primary', 'quiet']);
/** Resolve a focus key back to a node inside `root`, text before position. */
function focusNodeFor(root, key) {
  if (!root || !key?.sel) return null;
  if (key.ix == null && key.text == null) return root.querySelector(key.sel);
  const all = [...root.querySelectorAll(key.sel)];
  if (key.text) {
    const byText = all.find((n) => (n.textContent || '').trim().slice(0, 16) === key.text);
    if (byText) return byText;
  }
  return key.ix == null ? all[0] || null : all[key.ix] || null;
}
const handKeyboardTo = (selector) => {
  focusNextKey = selector;
};
/* ------------------------------------------------------ corridor paper worlds
 * The restored ten public worlds from the carousel (2026-08-15,
 * "keep 墨・楮紙; default 藍 ベロ藍・浪") — three families, one token law,
 * applied across the WHOLE corridor. The seal in the chrome cycles them,
 * day worlds first, then the nights; the choice persists on-device. The ids
 * are the HISTORICAL world keys where one existed so saved preferences keep
 * working — the values in corridor.css are the standard. The Drift layer's
 * matching worlds follow via its own build (generated file; next slice).
 * Default :root is ベロ藍・浪. */
/* Each world carries its preview colours (g/ink/red MIRROR the corridor.css
 * token blocks — change both together) and the paper its ground is grown
 * from (S1 living paper, the painter key). */
const THEME_UI = [
  // ベロ藍・浪 — Prussian blue on print cream (DEFAULT)
  { id: 'hokusai', seal: '藍', name: 'ベロ藍・浪', g: '#f1e9d3', ink: '#1c2f42', red: '#b03a2e', paper: 'cream' },
  // 墨・楮紙 — sumi on kōzo
  {
    id: 'sumi',
    seal: '墨',
    name: '墨・楮紙',
    g: '#f5efe0',
    ink: '#211e17',
    red: '#a02a1e',
    paper: 'kozo',
  },
  // 朱・胡粉 — vermilion on shell white
  {
    id: 'shu',
    seal: '朱',
    name: '朱・胡粉',
    g: '#f9f5eb',
    ink: '#2b2620',
    red: '#b02318',
    paper: 'shell',
  },
  // 凱風快晴 — Red Fuji on dawn paper
  { id: 'akafuji', seal: '赤', name: '凱風快晴', g: '#f3e3cf', ink: '#45291a', red: '#a03a20', paper: 'dawn' },
  // 焦茶・柿渋 — umber on persimmon tannin
  { id: 'iwa', seal: '柿', name: '焦茶・柿渋', g: '#ddb083', ink: '#2e1a0c', red: '#7e2410', paper: 'kaki' },
  // 胡粉・黒漆 — shell white on lacquer
  { id: 'rokusho', seal: '漆', name: '胡粉・黒漆', g: '#171310', ink: '#f2ecdf', red: '#e0796b', paper: 'urushi' },
  // 紺紙金泥 — sutra gold on indigo
  { id: 'yoru', seal: '金', name: '紺紙金泥', g: '#131a30', ink: '#f4ecd9', red: '#ef8079', paper: 'kon' },
  // 神奈川沖浪裏 — foam on the deep sea
  {
    id: 'nami',
    seal: '浪',
    name: '神奈川沖浪裏',
    g: '#11273b',
    ink: '#eae6d8',
    red: '#e08a6e',
    paper: 'sea',
  },
  // 板木・墨 — keyblock sumi on print cream
  {
    id: 'keyblock',
    seal: '板',
    name: '板木・墨',
    g: '#f2ead6',
    ink: '#26221c',
    red: '#b03a2e',
    paper: 'cream',
  },
  // 山下白雨 — lightning-gold on storm paper
  {
    id: 'hakuu',
    seal: '雷',
    name: '山下白雨',
    g: '#221b12',
    ink: '#efe5cf',
    red: '#e0796b',
    paper: 'storm',
  },
  // 攻殻・燐光 — phosphor on terminal black
  { id: 'kaku', seal: '殻', name: '攻殻・燐光', g: '#050d12', ink: '#d8efe9', red: '#ff6b4a', paper: 'terminal' },
];
// Every public picker follows the reference strip exactly. 殻 remains a
// complete internal world so an existing saved preference never breaks.
const PUBLIC_THEME_IDS = [
  'sumi',
  'shu',
  'iwa',
  'rokusho',
  'yoru',
  'hokusai',
  'akafuji',
  'nami',
  'keyblock',
  'hakuu',
];
const THEME_STORE = 'kairo-theme';
function themeId() {
  let stored = '';
  try {
    stored = localStorage.getItem(THEME_STORE) || '';
  } catch {
    stored = '';
  }
  if (THEME_UI.some((t) => t.id === stored)) return stored;
  try {
    if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) return 'yoru';
  } catch {
    /* no matchMedia */
  }
  return 'hokusai';
}
function themeIx() {
  return Math.max(0, THEME_UI.findIndex((t) => t.id === themeId()));
}
function setKairoTheme(id) {
  const t = THEME_UI.find((x) => x.id === id) || THEME_UI[0];
  // 北斎 is the bare :root default — no attribute, so nothing overrides it
  document.documentElement.setAttribute('data-theme', t.id === 'hokusai' ? '' : t.id);
  const night = ['rokusho', 'yoru', 'nami', 'hakuu', 'kaku'].includes(t.id);
  document.documentElement.style.colorScheme = night ? 'dark' : 'light';
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', night ? 'dark' : 'light');
  try {
    localStorage.setItem(THEME_STORE, t.id);
  } catch {
    /* private mode — the theme still applies for this session */
  }
  applyPaper(t.id);
  syncDriftTheme();
}
/** Drift owns five atmospheric families. Map by identity so adding or
 * reordering paper worlds cannot send an unrelated raw index into it. */
const DRIFT_THEME_BY_WORLD = {
  hokusai: 0,
  keyblock: 1,
  sumi: 1,
  shu: 2,
  akafuji: 2,
  iwa: 2,
  rokusho: 4,
  yoru: 4,
  nami: 4,
  hakuu: 4,
  kaku: 4,
};
function syncDriftTheme() {
  try {
    if (window.__DRIFT__ && window.__DRIFT__.setTheme) {
      window.__DRIFT__.setTheme(DRIFT_THEME_BY_WORLD[themeId()] ?? 0);
    }
  } catch {
    /* drift not mounted yet — render() re-syncs when it first shows */
  }
}
/** A world change recolours through what setKairoTheme has already moved —
 * the data-theme tokens, the grown paper, the drift sync. The ONLY rendered
 * DOM that bakes the world in is the seal glyphs, so swap those in place
 * instead of rebuilding the whole room: a full render() cost a measured
 * 100–200 ms main-thread block per stone tap (console-perf lens, round 2).
 * The writing room is the one surface that re-inks from its world spec —
 * while it is open, the full render stays the honest path. */
function applyWorldSwap() {
  if (S.strokes) {
    render();
    return;
  }
  const glyph = THEME_UI[themeIx()].seal;
  for (const node of document.querySelectorAll('#theme-seal, .ginga-seal')) {
    node.textContent = glyph;
  }
  const ginga = document.querySelector('.ginga-seal');
  if (ginga) {
    // play the wake exactly as a rebuild would — and only where the galaxy
    // seal exists; elsewhere the flag waits for the next 銀河 build
    ginga.classList.remove('awake');
    void ginga.offsetWidth;
    ginga.classList.add('awake');
    S.sealWake = false;
  }
}
// (the old tap-to-cycle retired 2026-08-14 — the worlds are direct choices;
// wants the stones one tap away on every screen; see attachWorldPicker)

/* ---------------------------------------------------- S1 living paper ground
 * The ground is grown, not painted flat: each world gets its own procedural
 * paper — kōzo strokes, print-cream grain, dawn fiber, tannin clouds, lacquer
 * polish-lines, indigo and stars, sea swells, terminal rain — grown ONCE per
 * world+viewport on an offscreen canvas, cached as a data-URL and hung behind
 * the app through the `--paper-url` token (body::before in corridor.css).
 * Amplitude law (rebuild spec §2 S1): texture luminance stays within ±3% of
 * `--ground`, MEASURED by the accessibility verifier — the paper may breathe
 * but the measured contrast ratios never move. Growth happens off the
 * interaction beat and never per-frame, so the reading loop keeps its 60fps. */
const PAPER_SEED = {
  cream: 13,
  shell: 17,
  kozo: 11,
  dawn: 19,
  kaki: 29,
  urushi: 41,
  kon: 23,
  sea: 31,
  storm: 43,
  terminal: 59,
};
const PAPER_KATA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789';
const PAPER_MAX_PIXELS = 1.6e6;
const paperCache = new Map();
let paperGrowToken = 0;
let paperViewKey = '';

function paperRng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Texture size: the viewport at a capped scale, bucketed to 64px so the tiny
 * iOS chrome-bar resizes don't force a regrow (cover absorbs the stretch). */
function paperSize() {
  const vw = Math.max(320, window.innerWidth || 390);
  const vh = Math.max(480, window.innerHeight || 844);
  let scale = Math.min(1.5, window.devicePixelRatio || 1);
  if (vw * vh * scale * scale > PAPER_MAX_PIXELS) scale = Math.sqrt(PAPER_MAX_PIXELS / (vw * vh));
  const bucket = (n) => Math.ceil((n * scale) / 64) * 64;
  return { w: bucket(vw), h: bucket(vh) };
}

function paintPaper(g, w, h, world, base) {
  const r = paperRng(PAPER_SEED[world.paper] || 7);
  const u = w / 390; // stroke unit — the painters were tuned on the phone width
  g.fillStyle = base || world.g;
  g.fillRect(0, 0, w, h);
  const wash = (stops, slant) => {
    const lg = g.createLinearGradient(0, 0, w * (slant ?? 0.7), h);
    for (const [p, c] of stops) lg.addColorStop(p, c);
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);
  };
  const fibers = (n, dark, light, darkBias = 0.8) => {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = r() * w;
      const y = r() * h;
      const len = (10 + r() * 70) * u;
      const along = r() < 0.72;
      const a = (along ? 0 : Math.PI / 2) + (r() - 0.5) * (along ? 0.42 : 0.72);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 14 * u, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.strokeStyle = r() < darkBias ? dark(r) : light(r);
      g.lineWidth = (0.32 + r() * 0.82) * u;
      g.stroke();
    }
  };
  const vignette = (rgba) => {
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, rgba);
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  };
  const glow = (cx, cy, radius, rgba) => {
    const gl = g.createRadialGradient(w * cx, h * cy, 6, w * cx, h * cy, h * radius);
    gl.addColorStop(0, rgba);
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, w, h);
  };
  if (world.paper === 'cream') {
    // 藍 print cream — the woodblock sheet's even grain
    wash(
      [
        [0, 'rgba(255,252,240,0.04)'],
        [1, 'rgba(60,45,20,0.016)'],
      ],
      0.9,
    );
    fibers(
      2150,
      (r) => `rgba(170,150,110,${0.02 + r() * 0.035})`,
      (r) => `rgba(252,248,232,${0.06 + r() * 0.07})`,
      0.5,
    );
    vignette('rgba(85,70,42,0.032)');
  } else if (world.paper === 'shell') {
    // 朱 shell white — smooth gofun paper with pale shell fibers
    wash(
      [
        [0, 'rgba(255,253,246,0.035)'],
        [1, 'rgba(80,70,55,0.012)'],
      ],
      0.9,
    );
    fibers(
      2300,
      (r) => `rgba(190,175,150,${0.016 + r() * 0.03})`,
      (r) => `rgba(255,252,244,${0.05 + r() * 0.055})`,
      0.5,
    );
    vignette('rgba(80,70,55,0.028)');
  } else if (world.paper === 'kozo') {
    // 墨 kōzo washi — long mulberry strokes
    wash(
      [
        [0, 'rgba(255,250,238,0.04)'],
        [1, 'rgba(70,55,25,0.016)'],
      ],
      0.9,
    );
    fibers(
      2550,
      (r) => `rgba(180,158,116,${0.02 + r() * 0.035})`,
      (r) => `rgba(252,246,228,${0.06 + r() * 0.07})`,
      0.5,
    );
    vignette('rgba(90,70,40,0.032)');
  } else if (world.paper === 'dawn') {
    // 赤 dawn paper — warm fiber with the first light in one corner
    wash([[0, 'rgba(255,245,230,0.045)'], [1, 'rgba(120,70,35,0.012)']], 0.5);
    glow(0.75, 0.18, 0.5, 'rgba(220,140,90,0.05)');
    fibers(
      1900,
      (r) => `rgba(180,140,100,${0.02 + r() * 0.03})`,
      (r) => `rgba(255,246,230,${0.05 + r() * 0.06})`,
      0.5,
    );
    vignette('rgba(110,70,40,0.024)');
  } else if (world.paper === 'kaki') {
    // 柿 persimmon tannin — the dye settles in clouds
    wash([[0, 'rgba(240,205,160,0.045)'], [1, 'rgba(90,50,20,0.02)']], 0.8);
    for (let i = 0; i < 30; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = (30 + r() * 100) * u;
      const cl = g.createRadialGradient(x, y, 2, x, y, rad);
      cl.addColorStop(0, r() < 0.45 ? `rgba(130,74,32,${0.025 + r() * 0.03})` : `rgba(235,190,130,${0.035 + r() * 0.035})`);
      cl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = cl;
      g.beginPath();
      g.arc(x, y, rad, 0, 7);
      g.fill();
    }
    fibers(
      1320,
      (r) => `rgba(120,70,30,${0.02 + r() * 0.03})`,
      (r) => `rgba(240,200,150,${0.04 + r() * 0.045})`,
      0.5,
    );
    vignette('rgba(70,38,12,0.034)');
  } else if (world.paper === 'urushi') {
    // 漆 black lacquer — polish lines catching one soft sheen
    wash([[0, 'rgba(255,240,210,0.02)'], [1, 'rgba(0,0,0,0.05)']], 0.6);
    glow(0.3, 0.22, 0.75, 'rgba(120,105,85,0.05)');
    for (let i = 0; i < 420; i++) {
      const x = r() * w;
      const y = r() * h;
      const len = (6 + r() * 38) * u;
      const a = -0.6 + (r() - 0.5) * 0.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.strokeStyle = `rgba(70,60,48,${0.03 + r() * 0.04})`;
      g.lineWidth = (0.3 + r() * 0.5) * u;
      g.stroke();
    }
  } else if (world.paper === 'kon') {
    // 金 紺紙 — indigo fiber, and the sutra's scattered stars
    wash([[0, 'rgba(80,100,170,0.03)'], [1, 'rgba(0,0,10,0.05)']], 0.7);
    fibers(1200, (r) => `rgba(90,110,170,${0.015 + r() * 0.03})`, (r) => `rgba(140,160,220,${0.02 + r() * 0.03})`);
    for (let i = 0; i < 150; i++) {
      const b = r();
      g.fillStyle = `rgba(${(200 + b * 40) | 0},${(205 + b * 30) | 0},${(235 + b * 20) | 0},${0.05 + r() * 0.28})`;
      g.beginPath();
      g.arc(r() * w, r() * h, (0.4 + r() * 1.0) * u, 0, 7);
      g.fill();
    }
  } else if (world.paper === 'sea') {
    // 浪 the deep Prussian sea — long swells, a little spindrift
    wash([[0, 'rgba(120,170,210,0.03)'], [1, 'rgba(0,10,20,0.05)']], 0.5);
    for (let i = 0; i < 16; i++) {
      const y0 = r() * h;
      g.beginPath();
      g.moveTo(0, y0);
      for (let x = 0; x <= w; x += w / 24) g.lineTo(x, y0 + Math.sin((x / w) * 12.56 + i) * 10 * u);
      g.strokeStyle = `rgba(130,170,205,${0.02 + r() * 0.035})`;
      g.lineWidth = (0.6 + r() * 1.1) * u;
      g.stroke();
    }
    for (let i = 0; i < 110; i++) {
      g.fillStyle = `rgba(220,232,240,${0.04 + r() * 0.14})`;
      g.beginPath();
      g.arc(r() * w, r() * h, (0.3 + r() * 1.0) * u, 0, 7);
      g.fill();
    }
  } else if (world.paper === 'storm') {
    // 雷 山下白雨 — diagonal rain in brown-black air, one quiet flash
    wash(
      [
        [0, 'rgba(90,70,40,0.025)'],
        [1, 'rgba(0,0,0,0.045)'],
      ],
      0.4,
    );
    for (let i = 0; i < 22; i++) {
      const x = r() * w;
      const y = r() * h;
      const len = (30 + r() * 120) * u;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - len * 0.25, y + len);
      g.strokeStyle = `rgba(120,102,70,${0.012 + r() * 0.025})`;
      g.lineWidth = (0.45 + r() * 0.75) * u;
      g.stroke();
    }
    g.beginPath();
    let lx = w * 0.12;
    let ly = h * 0.55;
    g.moveTo(lx, ly);
    for (let i = 0; i < 7; i++) {
      lx += (r() - 0.3) * 60 * u;
      ly += (18 + r() * 46) * u;
      g.lineTo(lx, ly);
    }
    g.strokeStyle = 'rgba(217,169,63,0.055)';
    g.lineWidth = 1.3 * u;
    g.stroke();
    vignette('rgba(0,0,0,0.025)');
  } else {
    // 殻 terminal black — faint glyph rain and scanlines
    wash([[0, 'rgba(30,70,80,0.03)'], [1, 'rgba(0,0,0,0.05)']], 0.3);
    g.font = `${9 * u}px monospace`;
    for (let col = 0; col < 16; col++) {
      const x = ((col + 0.5) * w) / 16;
      let y = r() * h;
      const n = 3 + ((r() * 7) | 0);
      for (let i = 0; i < n; i++) {
        const ch = PAPER_KATA[(r() * PAPER_KATA.length) | 0];
        g.fillStyle = `rgba(55,232,176,${(0.02 + r() * 0.05) * (1 - (i / n) * 0.6)})`;
        g.fillText(ch, x, y + i * 12 * u);
      }
    }
    for (let i = 0; i < 3; i++) {
      const y = r() * h;
      g.fillStyle = 'rgba(120,255,210,0.012)';
      g.fillRect(0, y, w, 8 * u);
    }
  }
}

/** Hang the active world's paper. Cached growth applies at once; a fresh
 * world grows off the interaction beat — the seal press paints the tokens
 * immediately and the paper follows a breath later. */
let paperBase = '';
function applyPaper(id) {
  const world = THEME_UI.find((t) => t.id === id) || THEME_UI[0];
  const root = document.documentElement;
  const { w, h } = paperSize();
  paperViewKey = `${w}x${h}`;
  // the paper grows on the surface the body ACTUALLY shows — variant E's
  // layered depth grounds the app on --ground-2, not --ground, and the
  // amplitude law is measured against the real ground
  const base = document.body ? getComputedStyle(document.body).backgroundColor : '';
  paperBase = base;
  const key = `${world.id}:${base}:${paperViewKey}`;
  if (paperCache.has(key)) {
    root.style.setProperty('--paper-url', paperCache.get(key));
    return;
  }
  // never leave the OLD world's paper hanging over the NEW world's ground
  root.style.setProperty('--paper-url', 'none');
  const token = ++paperGrowToken;
  const grow = () => {
    if (token !== paperGrowToken) return; // superseded by a newer world/viewport
    try {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const g = cv.getContext('2d');
      if (!g) return;
      paintPaper(g, w, h, world, base);
      const url = `url("${cv.toDataURL('image/png')}")`;
      paperCache.set(key, url);
      if (paperCache.size > THEME_UI.length + 2) paperCache.delete(paperCache.keys().next().value);
      if (token === paperGrowToken) root.style.setProperty('--paper-url', url);
    } catch {
      /* canvas denied — the flat ground stands */
    }
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 30)))(grow);
}

/** Called by render() after the body classes settle: if a variant moved the
 * body onto a different ground, the paper regrows to match it. A no-op
 * whenever the resolved ground is unchanged. */
function syncPaper() {
  if (!document.body || !paperBase) return;
  if (getComputedStyle(document.body).backgroundColor !== paperBase) applyPaper(themeId());
}

// a REAL viewport change (rotation, split view) regrows the paper; the 64px
// bucket in paperSize() already swallows the iOS chrome-bar jitter
let paperResizeT = 0;
window.addEventListener('resize', () => {
  safelySyncStoreAlert();
  clearTimeout(paperResizeT);
  paperResizeT = setTimeout(() => {
    const { w, h } = paperSize();
    if (`${w}x${h}` !== paperViewKey) applyPaper(themeId());
  }, 250);
});

/* -------------------------------------------------------- the ten world-stones
 * The colour options are ONE TAP away on every screen (operator redirect,
 * 2026-08-14): tapping a theme seal opens the eight stones for a direct
 * jump; a long-press opens the same picker (muscle memory from the P1
 * mechanic keeps working). iOS war-scars honored: activation is on CLICK,
 * and the one-shot swallow that keeps the hold's release from re-opening
 * the picker is armed only while the pointer is down on the seal. */
let worldPickerEls = null;
let worldPickerOpener = null;
function worldPickerEsc(e) {
  if (e.key === 'Escape') closeWorldPicker();
}
/* The stones are role=dialog over a scrim, but nothing contained the
 * keyboard: Tab walked straight past them into the page underneath and Enter
 * there navigated the whole app while the picker floated on
 * (E3 round-B, dead-ends lens). The sheet's own containment is the pattern —
 * inert the room beneath, and wrap the ring so it cannot be left by Tab. */
let worldPickerInerted = [];
function worldPickerTab(e) {
  if (e.key !== 'Tab' || !worldPickerEls) return;
  const stones = [...worldPickerEls[1].querySelectorAll('button')];
  if (!stones.length) return;
  const first = stones[0];
  const last = stones[stones.length - 1];
  const here = document.activeElement;
  if (e.shiftKey && (here === first || !worldPickerEls[1].contains(here))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (here === last || !worldPickerEls[1].contains(here))) {
    e.preventDefault();
    first.focus();
  }
}
/* The stones are a walkable layer under the ONE sentinel (歩み) — not a
 * surface with its own history entry; the writing room's contract is that
 * rerendering the palette adds none, and it is right. What was missing was
 * the sync at both ends: opening armed nothing, so Back left the app from
 * the front door in one press and abandoned an article in two, and closing
 * never re-armed the entry the press had just spent
 * (E3 round-B, dead-ends lens). */
function closeWorldPicker() {
  if (!worldPickerEls) return;
  for (const n of worldPickerEls) n.remove();
  worldPickerEls = null;
  document.removeEventListener('keydown', worldPickerEsc, true);
  document.removeEventListener('keydown', worldPickerTab, true);
  // the room beneath comes back to the keyboard and the screen reader
  for (const n of worldPickerInerted) n.removeAttribute('inert');
  worldPickerInerted = [];
  // hand focus back to the seal that opened the stones (keyboard walkers)
  if (worldPickerOpener && document.contains(worldPickerOpener)) worldPickerOpener.focus();
  worldPickerOpener = null;
  syncWalkSentinel();
}
function openWorldPicker(anchor) {
  closeWorldPicker();
  const scrim = el('div', 'world-picker-scrim');
  const pop = el('div', 'world-picker');
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', tx('世界を選ぶ', 'choose a world'));
  let activeStone = null;
  for (const id of PUBLIC_THEME_IDS) {
    const t = THEME_UI.find((world) => world.id === id);
    if (!t) continue;
    const b = el('button', 'world-stone', t.seal);
    b.type = 'button';
    // each stone previews its own world — the colours mirror corridor.css
    b.style.background = t.g;
    b.style.color = t.ink;
    b.style.setProperty('--stone-red', t.red);
    b.setAttribute('aria-label', t.name);
    const active = t.id === themeId();
    b.setAttribute('aria-pressed', String(active));
    if (active) {
      b.classList.add('active');
      activeStone = b;
    }
    b.addEventListener('click', () => {
      closeWorldPicker();
      setKairoTheme(t.id);
      S.sealWake = true; // the 銀河 seal plays its wake on a world change
      applyWorldSwap();
    });
    pop.append(b);
  }
  worldPickerOpener = anchor;
  scrim.addEventListener('click', closeWorldPicker);
  document.body.append(scrim, pop);
  // hang beneath the seal, held inside the viewport
  const rect = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  pop.style.top = `${Math.round(Math.min(rect.bottom + 8, window.innerHeight - pop.offsetHeight - 8))}px`;
  pop.style.left = `${Math.round(Math.min(Math.max(8, rect.right - pw), window.innerWidth - pw - 8))}px`;
  document.addEventListener('keydown', worldPickerEsc, true);
  document.addEventListener('keydown', worldPickerTab, true);
  pop.setAttribute('aria-modal', 'true');
  // everything that is not the stones or their scrim leaves the tab order
  // and the accessibility tree for as long as they are open
  worldPickerInerted = [...document.body.children].filter(
    (n) => n !== scrim && n !== pop && !n.hasAttribute('inert'),
  );
  for (const n of worldPickerInerted) n.setAttribute('inert', '');
  worldPickerEls = [scrim, pop];
  // the stones are now a walkable layer: arm the standing sentinel if the
  // surface beneath had none (the front door), and leave it alone if it did
  syncWalkSentinel();
  (activeStone || pop.firstChild).focus();
}
const WORLD_PICKER_HOLD_MS = 480;
/** A seal button opens the stones on TAP; a hold opens them early. */
function attachWorldPicker(sealBtn) {
  let holdT = 0;
  let swallow = false;
  sealBtn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    swallow = false;
    clearTimeout(holdT);
    holdT = setTimeout(() => {
      swallow = true; // the press became a hold — the release must not re-open
      openWorldPicker(sealBtn);
    }, WORLD_PICKER_HOLD_MS);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    sealBtn.addEventListener(ev, () => clearTimeout(holdT));
  }
  sealBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  sealBtn.addEventListener('click', () => {
    if (swallow) {
      swallow = false;
      return;
    }
    openWorldPicker(sealBtn);
  });
}

/* ------------------------------------------------------------ 銀河 hero nav
 * The galaxy is the app's hero. At rest it carries one mark; tapping it opens a
 * top bar (back · forward · EN⇄日本語 · search · 集中道場) and two corner
 * bubbles (本棚 bottom-left, 先生 bottom-right). Everything hides again on
 * dismiss, leaving the galaxy uncovered. Only on 銀河 — inner pages keep the
 * ordinary top bar. */
// the 鳥居 gate (operator's pick) with a single star above — a threshold into
// the galaxy: the two lintels (笠木・貫), two pillars, and one point of light.
const GINGA_SYMBOL_SVG =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 15.5C20 13 28 13 40 15.5M11.5 21H36.5M16.5 21V37M31.5 21V37" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="8.5" r="1.7" fill="currentColor"/></svg>';

function navBackFromGinga() {
  // one walk: back() itself surfaces a dive one level (R3-B), so the arrow
  // and the device Back gesture are the same operation. At the true galaxy
  // home there is nowhere back; the arrow is disabled there.
  S.navOpen = false;
  back();
}

/** The EN⇄日本語 pill: a sliding knob, not two buttons. */
function buildLangSlider() {
  const seg = el('button', 'lang-slide');
  seg.type = 'button';
  seg.id = 'lang';
  seg.dataset.lang = S.lang; // 'bi' (EN) | 'ja'
  seg.setAttribute('aria-label', tx('言語を切り替える', 'switch language'));
  seg.append(el('span', 'lang-opt en', 'EN'));
  seg.append(el('span', 'lang-opt ja', '日本語'));
  seg.append(el('span', 'lang-knob'));
  seg.addEventListener('click', () => {
    S.lang = S.lang === 'ja' ? 'bi' : 'ja';
    render();
  });
  return seg;
}

/** The search field lives inside the bar; results drop in place, opening the
 * same entry sheets as everywhere. It updates its own results node directly so
 * a keystroke never triggers a full re-render (which would drop focus). */
function buildNavSearch() {
  const wrap = el('div', 'nav-search');
  const input = el('input', 'nav-search-input');
  input.type = 'search';
  input.id = 'nav-search-input';
  // the bar squeezes this input to ~71px on a 390px phone — a long
  // placeholder truncated to "searc" (P2, review); 検索 fits at any width
  // and the aria-label keeps the bilingual name
  input.placeholder = '検索';
  input.setAttribute('aria-label', tx('検索', 'search'));
  const results = el('div', 'nav-search-results');
  const paint = () => {
    // the deep tier repaints these rows when its worker batch settles; if a
    // row holds focus at that moment (a restored session, or a keyboard
    // walk), the rebuild must hand focus back instead of dropping it on body
    const focusedRow = document.activeElement?.closest?.('.nav-search-row');
    const focusIx = focusedRow && results.contains(focusedRow) ? focusedRow.dataset.ix : null;
    results.textContent = '';
    const q = input.value.trim();
    if (!q) return;
    const hits = searchResults(q).slice(0, 8);
    if (!hits.length) {
      results.append(el('div', 'nav-search-empty', tx('見つからない。', 'Nothing found.')));
      return;
    }
    hits.forEach((e, ix) => {
      const row = el('button', 'nav-search-row');
      row.type = 'button';
      row.dataset.ix = String(ix);
      row.append(el('span', 'nsr-glyph', e.w));
      const stack = el('span', 'nsr-stack');
      if (e.r) stack.append(el('span', 'nsr-read', e.r));
      if (e.g) stack.append(el('span', 'nsr-gloss', e.g));
      row.append(stack);
      row.addEventListener('click', () => {
        // leaving THROUGH a result keeps the session: the walk back reopens
        // the bar with this query, these results, and focus on this row
        S.navQ = input.value;
        S.navReturn = true;
        S.navOpen = false;
        go(
          e.seq
            ? { t: e.t, id: e.id, seq: String(e.seq), reading: e.reading || '', matchedGloss: e.matchedGloss || '' }
            : { t: e.t, id: e.id },
          { invoker: row },
        );
      });
      results.append(row);
    });
    if (focusIx != null) {
      const again = results.querySelector(`.nav-search-row[data-ix="${focusIx}"]`);
      (again || input).focus({ preventScroll: true });
    }
  };
  // The deep tier answers here too: the first touch opens the 70k index, and
  // when the worker's batch for the visible query settles, the same rows
  // repaint once — the field itself never loses focus.
  navSearchRepaint = () => {
    if (!document.body.contains(input)) {
      navSearchRepaint = null;
      return;
    }
    paint();
  };
  input.addEventListener('focus', () => ensureDictionaryIndex().catch(() => {}), { once: true });
  input.addEventListener('input', () => {
    S.navQ = input.value; // the input node dies with every render; S carries it
    if (input.value.trim()) ensureDictionaryIndex().catch(() => {});
    paint();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const first = results.querySelector('.nav-search-row');
      if (first) first.click();
    }
  });
  wrap.append(input, results);
  // a surviving session repaints in place — same query, same rows
  if (S.navQ) {
    input.value = S.navQ;
    if (S.navQ.trim()) ensureDictionaryIndex().catch(() => {});
    paint();
  }
  return wrap;
}

/** Build the whole 銀河 chrome (symbol, and when open the bar + bubbles). */
function buildGingaChrome(root) {
  const symbol = el('button', 'nav-symbol' + (S.navOpen ? ' open' : ''));
  symbol.type = 'button';
  symbol.id = 'ginga-symbol';
  symbol.setAttribute('aria-expanded', String(!!S.navOpen));
  symbol.setAttribute(
    'aria-label',
    S.navOpen ? tx('ナビを閉じる', 'close navigation') : tx('ナビをひらく', 'open navigation'),
  );
  symbol.innerHTML = GINGA_SYMBOL_SVG;
  symbol.addEventListener('click', () => {
    S.navOpen = !S.navOpen;
    // closing by hand is a deliberate dismissal — the search session ends
    if (!S.navOpen) {
      S.navQ = '';
      S.navReturn = false;
    }
    render();
  });
  root.append(symbol);

  // a ghost of a seal in the upper-right: barely there on the galaxy until you
  // touch it, when it comes to life and turns the world to the next nihonga
  // palette (operator 2026-08-10). The drift's own seal stays hidden here.
  const seal = el('button', 'ginga-seal' + (S.sealWake ? ' awake' : ''), THEME_UI[themeIx()].seal);
  seal.type = 'button';
  seal.id = 'ginga-theme-seal';
  seal.setAttribute('aria-label', tx('世界を選ぶ', 'choose a world'));
  attachWorldPicker(seal);
  root.append(seal);
  if (S.sealWake) S.sealWake = false;

  if (!S.navOpen) return;

  const scrim = el('div', 'nav-scrim');
  scrim.addEventListener('click', () => {
    S.navOpen = false;
    // tapping the water away is a deliberate dismissal too
    S.navQ = '';
    S.navReturn = false;
    render();
  });
  root.append(scrim);

  const bar = el('div', 'nav-bar');
  bar.setAttribute('data-drift-chrome', '');
  const arrows = el('div', 'nav-arrows');
  const backB = el('button', 'nav-arrow', '‹');
  backB.type = 'button';
  backB.setAttribute('aria-label', tx('もどる', 'back'));
  backB.disabled = !S.stack.length && S.view === 'drift' && !S.driftDepth;
  backB.addEventListener('click', navBackFromGinga);
  // The › arrow was dead chrome: nothing in the app ever assigned S.fwd, so
  // it was rendered disabled on every screen and could never be pressed
  // (E3 round-C, dead-ends lens). A real forward step needs a forward stack
  // that every other navigation invalidates — worth building, but not worth
  // half-building, and a control that cannot act does not belong in the bar.
  // The walk back is the one the corridor actually offers.
  arrows.append(backB);
  bar.append(arrows);
  bar.append(buildLangSlider());
  bar.append(buildNavSearch());
  const dojo = biLabel('button', 'nav-dojo', '集中道場', 'focus');
  dojo.type = 'button';
  dojo.addEventListener('click', () => {
    S.navOpen = false;
    keepScroll();
    S.view = 'dojo';
    render();
  });
  bar.append(dojo);
  root.append(bar);

  const shelf = biLabel('button', 'corner-bubble bubble-shelf', '本棚', 'bookshelf');
  shelf.type = 'button';
  shelf.setAttribute('data-drift-chrome', '');
  shelf.addEventListener('click', () => {
    S.navOpen = false;
    S.view = 'shelf';
    render();
    window.scrollTo(0, S.shelfScroll);
  });
  const sensei = biLabel('button', 'corner-bubble bubble-sensei', '先生', 'sensei');
  sensei.type = 'button';
  sensei.setAttribute('data-drift-chrome', '');
  sensei.addEventListener('click', () => {
    S.navOpen = false;
    keepScroll();
    S.view = 'ai';
    render();
  });
  root.append(shelf, sensei);
}

function render() {
  removeMini();
  // Rebuilding #app empties the page for a moment, and the browser clamps
  // window scroll to 0 — so a double-tap for a gloss, opening a sheet, or
  // any other in-place re-render of the reader threw the walker back to
  // the top of the article. Snapshot before the rebuild; restore after,
  // but only for a same-view re-render of the reader — every view CHANGE
  // keeps its existing behaviour (callers set their own scroll, and cards
  // like review want the top of each new face).
  const restoreY = lastRenderedView === S.view && S.view === 'reader' ? window.scrollY : null;
  // The same rebuild that clamps the scroll also throws focus back to
  // <body>, so a keyboard walker lost their place on EVERY state-changing
  // press — a dial, a grade, a capture (E3 round-A, a11y lens). Controls
  // that name themselves are found again by that name after the rebuild;
  // the sheet's own focus management still wins where it runs.
  // a named successor wins over the by-name restore, and is spent either way
  const focusNext = focusNextKey;
  focusNextKey = null;
  // …and the two keys are taken here and the NODE is not kept: holding
  // document.activeElement in this scope pinned the whole previous render's
  // chrome behind the listener closures declared below, so the detached tree
  // could never be collected while focus sat on a control
  // (E3 round-C, performance lens).
  const keyOf = (node) => {
    if (!node || node === document.body) return null;
    if (node.id) return { sel: `#${CSS.escape(node.id)}` };
    const action = node.dataset?.action;
    if (action) return { sel: `[data-action="${CSS.escape(action)}"]` };
    const chip = node.dataset?.chip;
    if (chip) return { sel: `[data-chip="${CSS.escape(chip)}"]` };
    // …and any other single data-* the control already carries. The chrome's
    // EN / 日本語 pair has no id, no action and no class of its own — only
    // data-lang — so it was the one control the net could not key, and every
    // keyboard press of it dropped focus (E3 round-D, dead-ends lens).
    for (const [key, value] of Object.entries(node.dataset || {})) {
      const attr = `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      return { sel: `[${attr}="${CSS.escape(String(value))}"]` };
    }
    // Last resort — a control that names itself in no other way is found by
    // its SHAPE and its place among siblings of that shape. Filter chips in
    // 字引, 文法 and the dojo lobby carry no id and no data-action, so every
    // press of one dropped the keyboard to <body>: 77 Tab presses back into
    // the radical grid (E3 round-C, a11y lens). State classes are stripped,
    // because the press that moved the focus is usually the press that
    // flips them.
    const cls = [...node.classList].filter((c) => !FOCUS_STATE_CLASSES.has(c));
    if (!cls.length) return null;
    const sel = cls.map((c) => `.${CSS.escape(c)}`).join('');
    const ix = [...$('#app').querySelectorAll(sel)].indexOf(node);
    if (ix < 0) return null;
    // its own text first, its place second: pressing a radical chip narrows
    // the grid, so the index moves out from under the very control that was
    // pressed — the keyboard landed on 卜 when it had been on 匕
    return { sel, ix, text: (node.textContent || '').trim().slice(0, 16) };
  };
  // the sheet re-focuses itself after this render, so it needs its own key
  sheetFocusKey = (() => {
    const node = document.activeElement;
    return node?.closest?.('.sheet') ? keyOf(node) : null;
  })();
  const focusKey = (() => {
    const node = document.activeElement;
    if (!node || node === document.body || !$('#app').contains(node)) return null;
    return keyOf(node);
  })();
  // leaving the galaxy for a ROOM ends the search round-trip: only a walk
  // that stays on the drift (sheets keep S.view === 'drift') reopens the bar
  if (lastRenderedView !== S.view) S.navReturn = false;
  const root = $('#app');
  root.textContent = '';
  document.body.classList.toggle('v-contrast-wcag', S.variants.contrast === 'wcag');
  document.body.classList.toggle('v-depth-layered', S.variants.depth === 'layered');
  syncPaper();
  // F/G ride across to the Drift layer, which owns the tap ladder itself. Sent
  // on every render (not only on a click) so the layer carries the strip's
  // reading whenever it finishes loading, and unknown values are ignored there.
  if (window.__DRIFT_TAP__)
    window.__DRIFT_TAP__.set({ ladder: S.variants.ladder, satTap: S.variants.sattap });
  document.body.classList.toggle('ui-bi', bi());
  // the reading measure is per-view: a column for the texts, the full window
  // for the landscapes (野 and 墨流し). CSS reads this, nothing else does.
  document.body.dataset.view = S.view;

  // 銀河 hero: at home on the drift the galaxy stands alone but for its symbol;
  // the ordinary top bar is replaced by the tap-to-open nav, and the drift's
  // own brand/depth/counters recede (CSS reads body.ginga). Inner pages — and
  // the drift with a sheet open — keep the normal chrome.
  const heroMode = S.ready && S.view === 'drift' && !S.stack.length;
  document.body.classList.toggle('ginga', heroMode);
  document.body.classList.toggle('ginga-open', heroMode && !!S.navOpen);
  if (!heroMode && S.navOpen) S.navOpen = false;
  if (heroMode) buildGingaChrome(root);

  // 復習 is zen: while a card is up, the whole world recedes — no top bar, no
  // crumb, no counters. Just the card, the answer, the four honest buttons.
  // The session summary at the end brings the ordinary room back.
  const focusLive = S.focus && !S.focus.ended && Date.now() < S.focus.deadline && S.focus.pool?.length;
  const zenReview =
    S.ready &&
    S.view === 'review' &&
    !!S.review &&
    !!scheduler &&
    !!fsrsApi &&
    (S.review.ix < S.review.queue.length || !!focusLive);
  // the probe room keeps the same glass: word up → world recedes
  const zenProbe = S.ready && S.view === 'probe' && !!S.probe && S.probe.ix < S.probe.queue.length;
  document.body.classList.toggle('zen', !!zenReview || !!zenProbe);
  if (!zenReview) S.reviewMore = false;

  const chrome = el('div', 'chrome');
  // the drift's spatial arbiter reads this tag: words recede under the top bar
  // instead of printing through it half-cut
  chrome.setAttribute('data-drift-chrome', '');
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
  // the crumb names the TRUE origin — the room 戻る actually reopens. The
  // dojo family (dojo, its probe, its focus blocks) is entered from the
  // galaxy and its backs walk galaxy-ward, never through the bookshelf.
  const dojoFamily = S.view === 'dojo' || S.view === 'probe' || (S.view === 'review' && S.focus);
  // …and the tray is opened from EVERY room, so its root is wherever it was
  // opened from — it said 本棚 even when 戻る walked back to the reader, the
  // archive or the levels room (E3 round-C, dead-ends lens).
  const trayHome = S.view === 'tray' && S.trayFrom ? VIEW_CRUMB[trayFromView(S.trayFrom)] : null;
  if (S.view === 'entry') parts.push(tx('野', 'field'));
  else if (trayHome) parts.push(tx(trayHome[0], trayHome[1]));
  else if (S.view === 'drift' || dojoFamily) parts.push(tx('銀河', 'galaxy'));
  else parts.push(tx('本棚', 'bookshelf'));
  if (S.view === 'reader' && passage()) {
    // an archive read names the stack it came from — its back door
    if (String(passage().file || '').startsWith('archive/')) parts.push(tx('新聞アーカイブ', 'archive'));
    parts.push(passage().title);
  }
  if (S.view === 'tray') parts.push(tx('リスト', 'lists'));
  // the quiz and the review summary are entered from the lists tray and
  // their 戻る reopens it — the crumb said 本棚 › 小テスト and skipped the
  // room the press actually goes to (E3 round-B, dead-ends lens). Round B
  // wrote that rule and then applied it to the quiz alone: a plain review's
  // crumb still said 本棚 › 復習 while 戻る opened the tray
  // (E3 round-C, dead-ends lens).
  if (S.view === 'aiquiz' || (S.view === 'review' && !S.focus)) parts.push(tx('リスト', 'lists'));
  if (S.view === 'review' && S.focus) parts.push(tx('集中道場', 'focus'));
  if (S.view === 'review') parts.push(tx(S.focus ? '集中' : '復習', S.focus ? 'focus block' : 'review'));
  if (S.view === 'dojo') parts.push(tx('集中道場', 'focus'));
  if (S.view === 'probe') parts.push(tx('集中道場', 'focus'), tx('読み探査', 'yomi probe'));
  if (S.view === 'archive') parts.push(tx('新聞アーカイブ', 'archive'));
  if (S.view === 'aiquiz') parts.push(tx('小テスト', 'quiz'));
  if (S.view === 'levels') parts.push(tx('級', 'levels'));
  if (S.view === 'ai') parts.push(tx('先生', 'tutor'));
  if (S.view === 'lessons') parts.push(tx('レッスン', 'lessons'));
  if (S.view === 'thesaurus') parts.push(tx('類語', 'synonyms'));
  if (S.view === 'airead') parts.push(tx('読み物', 'reading'));
  if (S.view === 'kanjidex') parts.push(tx('字引', 'kanji finder'));
  if (S.view === 'yoji') parts.push(tx('四字熟語', 'idioms'));
  if (S.view === 'grammar') parts.push(tx('文法', 'grammar'));
  for (const node of S.stack) parts.push(nodeTitle(node));
  crumb.innerHTML = parts.map((p, i) => (i === parts.length - 1 ? `<b>${p}</b>` : p)).join(' › ');
  chrome.append(crumb);

  // EN | 日本語 — two visible states, the active one lit
  const seal = el('button', 'theme-seal', THEME_UI[themeIx()].seal);
  seal.type = 'button';
  seal.id = 'theme-seal';
  seal.setAttribute('aria-label', tx('世界を選ぶ', 'choose a world'));
  attachWorldPicker(seal);
  chrome.append(seal);

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

  // 覚える — the one capture button, top-right of every capture-eligible
  // surface (operator directive §3). The reader's takes the current thing:
  // the word last touched, carrying the sentence it was met in; its panel
  // holds the scope stages, the lists, and the way back out of a mis-tap.
  // Entry sheets carry their own seal in the sheet bar; surfaces with no
  // capturable current thing carry none.
  if (S.captureOpen && (S.stack.length || !readerTakeCurrent())) S.captureOpen = false;
  if (S.view === 'reader' && S.passageId) {
    const cur = readerTakeCurrent();
    const curTaken = !!cur && S.taken.some((t) => t.t === 'word' && t.id === cur.id);
    const capBtn = biLabel('button', curTaken ? 'chrome-take taken' : 'chrome-take', '覚える', 'memorize');
    capBtn.type = 'button';
    capBtn.id = 'reader-take';
    capBtn.disabled = !cur;
    capBtn.setAttribute('aria-pressed', String(curTaken));
    capBtn.setAttribute('aria-expanded', String(!!S.captureOpen));
    capBtn.setAttribute('aria-label', readerTakeLabel(cur, curTaken));
    capBtn.addEventListener('click', () => {
      const now = readerTakeCurrent();
      if (!now) return;
      if (S.captureOpen) {
        S.captureOpen = false;
        render();
        return;
      }
      // first touch takes the word as encountered — sentence and all; the
      // panel that opens holds the undo, the scope stages, and the lists
      if (!S.taken.some((t) => t.t === 'word' && t.id === now.id)) toggleTaken(readerTakeNode(now), now.id);
      S.captureOpen = true;
      render();
    });
    chrome.append(capBtn);
  }

  const trayBtn = biLabel('button', null, `覚 ${S.taken.length}`, 'lists');
  trayBtn.type = 'button';
  trayBtn.id = 'tray';
  trayBtn.addEventListener('click', () => {
    // pressing 覚 while already IN the tray changes nothing — and a press
    // that changes nothing must not erase where the tray came from. It did,
    // and 戻る then abandoned the article mid-read and landed on the shelf
    // (E3 round-B, dead-ends lens).
    if (S.view === 'tray') return;
    keepScroll();
    S.stack = [];
    // the tray remembers its door — WHICHEVER door it was. It is the one
    // control present in the chrome of every surface, so returning always to
    // the shelf threw away the archive year-list, the levels room, the
    // lessons list… every room but the reader (E3 round-A, dead-ends lens).
    // The origin is the view and its offset, not a single special case.
    S.trayFrom =
      S.view === 'reader' && S.passageId
        ? 'reader'
        : { view: S.view, scroll: Math.round(window.scrollY) };
    if (S.trayFrom === 'reader') {
      // readerPos bookmark — UI preference, not learner evidence (P0-4
      // residual-ledger disposition, same as the reader's own two writers)
      clearTimeout(readerPosTimer);
      S.readerPos[S.passageId] = Math.round(window.scrollY);
      saveStore();
    }
    S.view = 'tray';
    render();
    // every other room door lands at its own top; the one door present on
    // EVERY surface did not, so the tray opened at the previous surface's
    // offset — often past its own end (E3 round-A, dead-ends lens)
    window.scrollTo(0, 0);
  });
  chrome.append(trayBtn);
  if (!heroMode && !zenReview) root.append(chrome);

  // the capture panel — anchored under the chrome's top-right seal. It
  // reuses the sheet's own instruments verbatim: the reversible 覚える
  // button, the scope stages (語だけ・この文・段落), and the list picker
  // with its inline maker — so the door and the deep flow never disagree.
  if (S.captureOpen) {
    const cur = readerTakeCurrent();
    const capNode = readerTakeNode(cur);
    const panel = el('div', 'capture-panel');
    panel.id = 'capture-panel';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', tx(`「${cur.id}」を覚える`, `memorize ${cur.id}`));
    panel.setAttribute('data-drift-chrome', '');
    const head = el('div', 'capture-head');
    head.append(el('span', 'capture-word', cur.id));
    head.append(el('span', 'pool-tag', tx(NODE_KIND.word[0], NODE_KIND.word[1])));
    panel.append(head);
    panel.append(takeButton(capNode, cur.id));
    renderContextPicker(panel, capNode);
    renderListPicker(panel, capNode, cur.id);
    root.append(panel);
    requestAnimationFrame(() => {
      const bar = document.querySelector('.chrome');
      if (bar && panel.isConnected) panel.style.top = `${Math.ceil(bar.getBoundingClientRect().bottom + 8)}px`;
    });
  }

  const main = el('main');
  root.append(main);

  if (!S.ready) {
    main.append(el('div', 'loading', tx('回廊 をひらいています…', 'opening the corridor…')));
    renderVariants(root);
    safelySyncStoreAlert();
    return;
  }

  // The Drift universe sleeps unless it is the active view — its layer sits
  // beneath the corridor chrome, so the one navigation fabric stays visible.
  // It also sleeps under an open entry sheet: the layer is a sibling of #app,
  // so the inert pass below cannot reach it, and its six window-level pointer
  // listeners would read every tap on the sheet as a tap on open water and
  // raze the constellation underneath. Sleeping is not forgetting — the stack,
  // the centre and its satellites are all held in the layer's own state, so
  // closing the sheet hands the field back exactly as it was left.
  if (window.__DRIFT__) {
    syncDriftTheme();
    // …and a page nobody is looking at is the same as a room they have left.
    // The galaxy is the DEFAULT entry, so on the front door its loop held
    // 94-96% of the main thread for as long as the page existed, backgrounded
    // or not (E3 round-B, performance lens). This rides the drift's own public
    // seam — the same show/hide the view switch uses — so its physics and its
    // gesture grammar are untouched (#46), and sleeping is not forgetting:
    // the stack, the centre and its satellites are held in the layer's state.
    if (S.view === 'drift' && !S.stack.length && !document.hidden) window.__DRIFT__.show();
    else window.__DRIFT__.hide();
  }

  if (S.view === 'drift') renderDrift(main);
  else if (S.view === 'entry') renderEntry(main);
  else if (S.view === 'reader') renderReader(main);
  else if (S.view === 'tray') renderTray(main);
  else if (S.view === 'review') renderReview(main);
  else if (S.view === 'probe') renderProbe(main);
  else if (S.view === 'archive') renderArchive(main);
  else if (S.view === 'dojo') renderFocus(main);
  else if (S.view === 'aiquiz') renderAiQuiz(main);
  else if (S.view === 'levels') renderLevels(main);
  else if (S.view === 'ai') renderAiSetup(main);
  else if (S.view === 'lessons') renderLessons(main);
  else if (S.view === 'thesaurus') renderThesaurus(main);
  else if (S.view === 'airead') renderAiReading(main);
  else if (S.view === 'kanjidex') renderKanjidex(main);
  else if (S.view === 'yoji') renderYoji(main);
  else if (S.view === 'grammar') renderGrammar(main);
  else renderShelf(main);

  renderSheet(root);
  renderStrokePage(root);
  renderFocusHud(root);
  renderVariants(root);

  // Exactly one layer is live at a time. 筆順 sits above the sheet, so when it
  // is open even the sheet goes inert — nothing behind the top layer is
  // reachable by finger, keyboard, or screen reader.
  if (S.strokes || S.stack.length) {
    for (const child of root.children) {
      const live = S.strokes
        ? child.id === 'stroke-page'
        : child.id === 'sheet' || child.classList.contains('scrim');
      if (live) {
        child.inert = false;
        child.removeAttribute('aria-hidden');
        continue;
      }
      child.inert = true;
      child.setAttribute('aria-hidden', 'true');
    }
  }
  safelySyncStoreAlert();
  updateMeasurements();
  if (restoreY != null) window.scrollTo(0, restoreY);
  // give the keyboard its place back, if the control that had it still
  // exists under the same name. A sheet or the writing room manages its own
  // focus and must not be overruled, so this only reaches into #app, and it
  // never steals focus from whatever the rebuild legitimately moved it to.
  // a successor may name several candidates — they are tried in the order
  // WRITTEN, not the order they happen to sit in the document
  if (document.activeElement === document.body) {
    // a named successor wins, and its candidates are tried in the order
    // WRITTEN, not the order they happen to sit in the document
    const candidates = focusNext
      ? String(focusNext)
          .split(',')
          .map((one) => ({ sel: one.trim() }))
      : focusKey
        ? [focusKey]
        : [];
    for (const key of candidates) {
      const again = focusNodeFor($('#app'), key);
      if (again && typeof again.focus === 'function') {
        again.focus({ preventScroll: true });
        break;
      }
    }
  }
  lastRenderedView = S.view;
  // every navigation passes through here — keep the Back sentinel honest
  syncWalkSentinel();
}

// Coming back to the app wakes the galaxy; leaving it sleeps it. Through the
// drift's own seam ONLY — never a render(). A full render rebuilds #app, and
// visibility can flip while a finger (or a probe) is mid-gesture, so waking
// the galaxy that way tore elements out from under whoever was holding them:
// drift-fast lost a chain-hop to `detached`, native-readings to `Element is
// not attached to the DOM`. The verifiers were reporting a real hazard, and
// the smallest act that does the job is the one that belongs here.
document.addEventListener('visibilitychange', () => {
  if (!window.__DRIFT__ || document.body?.dataset?.ready !== '1') return;
  if (document.hidden) window.__DRIFT__.hide();
  else if (S.view === 'drift' && !S.stack.length) window.__DRIFT__.show();
});

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((err) => {
    document.body.dataset.error = String(err);
    const root = $('#app');
    root.textContent = '';
    root.append(el('div', 'loading', `読み込めなかった could not load: ${err.message}`));
  });
});

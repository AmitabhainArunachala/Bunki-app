/** UNREVIEWED original N1 written-section draft, revision r3. Not admitted; requires the build pipeline and an independent, different-family re-review of these bytes. */
const q = (skill, task, prompt, options, answer, rationale, extra = {}) => ({
  skill,
  task,
  prompt,
  options,
  answer,
  rationale,
  ...extra,
});
const v = (task, prompt, options, answer, rationale, target) =>
  q('vocabulary', task, prompt, options, answer, rationale, { target });
const g = (task, prompt, options, answer, rationale) =>
  q('grammar', task, prompt, options, answer, rationale);
const r = (task, passage, prompt, options, answer, rationale) =>
  q('reading', task, prompt, options, answer, rationale, { passage });
// Author's own self-check notes; the pipeline ignores this field and it is not review evidence.
const withDoubts = (item, doubts) => ({ ...item, doubts });

export const n1WrittenDraftStatus = Object.freeze({
  status: 'unreviewed-draft',
  level: 'N1',
  authoredOn: '2026-09-25',
  authorModelFamily: 'anthropic-claude',
  reviewed: false,
  revision: Object.freeze({
    id: 'r3',
    supersedes: Object.freeze({
      id: 'r2',
      path: '/Users/dhyana/.dharma/bunki_review/2026-09-25/n1/n1-practice-originals.r2.draft.mjs',
      sha256: '2963e09b4676ed431968d831da2a31ced4096a3c9afcaf393b7e6f21efeb2b22',
    }),
    history: Object.freeze([
      Object.freeze({
        id: 'r1',
        path: '/Users/dhyana/.dharma/bunki_review/2026-09-25/n1/n1-practice-originals.draft.mjs',
        sha256: 'bce7692cae18933d7b78847e64b4177ab2f2673fc4080692bce26fc065472d89',
      }),
    ]),
    respondsTo: Object.freeze([
      Object.freeze({
        reviews: 'r1',
        path: '/Users/dhyana/.dharma/bunki_review/2026-09-25/n1/REVIEW-CODEX-ITEMS.md',
        sha256: '459f8582c91d1db2ed50881c091237ba01d55fa2080f29ecfa5124896c49b7ed',
        reviewerModelFamily: 'openai-codex',
        disposition: 'REVISE',
      }),
      Object.freeze({
        reviews: 'r2',
        path: '/Users/dhyana/.dharma/bunki_review/2026-09-25/n1/REVIEW-CODEX-ITEMS-r2.md',
        sha256: 'a855bbdf7cf0647439a6c3ae47e5ca52eaf6494d7df5c9915814a67d2e8acc0f',
        reviewerModelFamily: 'openai-codex',
        disposition: 'REVISE (item 8 opening sentence only)',
      }),
    ]),
    // Items 11 and 12 use non-official task ids on purpose: a ~400-character shared essay is compact practice, not the official short or claim-reading task.
    nonOfficialTaskIds: Object.freeze(['compact-comprehension', 'compact-main-idea']),
  }),
});

export const n1WrittenPassages = {
  grantNotice:
    '地域文化活動助成　募集のご案内\n市内で文化・芸術活動に取り組む団体を対象に、事業に要する経費の一部を助成します。\n【対象団体】市内に活動拠点を置き、構成員が五人以上の団体。ただし、営利を目的とする団体は除きます。\n【助成区分と助成額】\nＡ　新規事業：団体がこれまでに実施したことのない事業を、今年度新たに始めるもの。対象経費の三分の二以内、上限三十万円。\nＢ　継続事業：過去に本助成を受けた事業を、発展させて実施するもの。対象経費の二分の一以内、上限二十万円。\n※過去に実施した事業のうち、本助成を受けていないものは、Ａ・Ｂのいずれにも該当しません。\n【対象経費】会場使用料、外部講師への謝礼、広報物の印刷費など。飲食費および団体の構成員に支払う謝礼は対象となりません。\n【申請方法】申請は一団体につき一件に限ります。所定の申請書に事業計画書と収支予算書を添えて、五月三十一日（必着）までに文化振興課へ郵送または持参してください。なお、過去に本助成を受けた団体は、その事業の実績報告書を提出済みであることが申請の条件となります。\n【選考】書類審査のうえ、必要に応じて面接を行います。結果は七月上旬までに文書で通知します。',
  wayfindingEssay:
    '道に迷うことがなくなって久しい。行き先を入力すれば、手元の端末が最短の経路を示してくれる。限られた時間で目的地にたどり着かなければならないとき、これほど心強いものはない。\n　だが、そうして効率よく移動するうちに、私は訪れた町のことをほとんど覚えていないことに気づいた。画面上の矢印を追っているあいだ、私が見ていたのは町ではなく、町を縮めた図にすぎなかったのである。一方、かつて見知らぬ町で、曲がるべき角を何度も通り過ぎ、同じ通りを行きつ戻りつしたときのことは、今でも妙に鮮明に覚えている。遠回りを強いられた分だけ、坂の傾きや店の並びが否応なく体に刻まれたのだろう。\n　迷うことは、無駄な時間として切り捨てられがちだ。しかし、ある土地を知るとは、本来、自分の誤りを通して少しずつその地形を確かめていく営みではなかったか。便利な道具を手放せと言うつもりはない。ただ、目的地に着くことと、その土地を知ることとは、似ているようでいて別の事柄なのである。',
};

export const n1WrittenItems = [
  withDoubts(
    v(
      'kanji-reading',
      '【　】の言葉の読み方を選んでください。\nこの私設図書館は、運営にかかる費用の大半を、地域の人々からの寄付で【賄って】いる。',
      ['おぎなって', 'まかなって', 'つぐなって', 'あがなって'],
      1,
      '賄うは「まかなう」と読み、必要な費用や物をととのえて用を満たすこと。「運営費を寄付で賄う」は典型的な結びつき。「おぎなう」は「補う」（足りない分を足す）、「つぐなう」は「償う」（損害や罪の埋め合わせをする）、「あがなう」は「贖う」（罪を償う、代価を払って手に入れる）の読みで、いずれも「賄」の読みではない。',
      '賄う',
    ),
    [
      'The three distractors are real -なう verbs (補う・償う・贖う) with nearby meanings, so a learner may choose by meaning rather than reading; the reviewer judged this acceptable for a reading task.',
      'あがなう (贖う) is rare even for advanced learners; recognising the target reading does not require knowing it.',
      'N1 suitability is a qualitative judgement; there is no official N1 word list and no learner calibration.',
    ],
  ),
  withDoubts(
    v(
      'contextual-expression',
      '（　）に入る最もよいものを選んでください。\n大型の台風が通り過ぎた翌朝、海岸には（　）数の流木が打ち上げられていた。',
      ['あわただしい', 'けたたましい', 'おびただしい', 'ものものしい'],
      2,
      'おびただしいは数や量が非常に多いことを表し、「おびただしい数の〜」は定型的な結びつき。台風の後に打ち上げられた流木の多さに合う。あわただしいは物事に追われて落ち着かない様子（あわただしい朝）、けたたましいは音が大きく鋭いこと（けたたましいサイレン）、ものものしいは厳重で重々しいこと（ものものしい警備）で、いずれも数量の多さを表さない。',
      'おびただしい',
    ),
    [
      'r2 replaced はなはだしい, which is attested with 数 (review item 2), with あわただしい, which describes busyness and does not express quantity.',
      'All three distractors are now form-similar -しい adjectives with no same-meaning rival, so the item tests word knowledge cleanly but may be easier than a real N1 item.',
    ],
  ),
  withDoubts(
    v(
      'paraphrase',
      '【　】の言葉に意味が最も近いものを選んでください。\n担当者は、事故が起きた日の作業記録を【つぶさに】調べ直し、手順が一つだけ飛ばされていたことを突き止めた。',
      ['ざっと', '手早く', 'ひそかに', '詳しく'],
      3,
      'つぶさには、細かい点まで詳しく、という意味。記録を細かく見たからこそ、一つだけ飛ばされていた手順を突き止められたので、「詳しく」が最も近い。ざっとは細部に立ち入らず大まかに見ること、手早くは時間をかけずに素早く、ひそかには人に知られないように、という意味で、いずれも細部まで見るという意味を持たない。',
      'つぶさに',
    ),
    [
      'r2 replaced 一通り, which overlaps with the coverage sense of つぶさに (review item 3), with ざっと, and added a clause that makes detail, not coverage, decisive.',
      'The added clause also lets a learner infer 詳しく from context without knowing つぶさに; that is normal for a paraphrase item but lowers difficulty.',
    ],
  ),
  withDoubts(
    v(
      'usage',
      '「携わる」の使い方として、最もよいものを選んでください。',
      [
        '父は定年を迎えるまでの三十年余り、橋の設計に携わってきた。',
        '雨になりそうだったので、折りたたみの傘を携わって家を出た。',
        '彼女の誠実な人柄も携わって、難しい交渉は思いのほか円満にまとまった。',
        'この報告書には、現場で働く人たちの声が十分に携わっていない。',
      ],
      0,
      '携わるは、ある仕事や分野に関係して従事するという意味で、「設計に携わる」が正しい。傘を身につけて持っていくのは「携える」（傘を携えて）、人柄が結果を後押ししたのは「手伝う」（人柄も手伝って）、報告書に意見が現れていないのは「反映される」（声が反映されていない）が適切。',
      '携わる',
    ),
    [
      'Unchanged from r1. The reviewer noted that several distractors are far from the target, so discrimination may be low.',
    ],
  ),
  withDoubts(
    g(
      'grammar-form',
      '（　）に入る最もよいものを選んでください。\n彼女は度重なる怪我（　）、三年ぶりに日本代表の座を取り戻した。',
      ['にひきかえ', 'にかこつけて', 'をかわきりに', 'をものともせず'],
      3,
      '「〜をものともせず」は、困難や障害を問題にしないで、という意味で、度重なる怪我にひるまずに代表の座を取り戻したという文脈に合う。「〜にひきかえ」は二つのものを対比する表現、「〜にかこつけて」は何かを口実にする表現、「〜をかわきりに」は物事の始まりを示す表現で、いずれも怪我と代表復帰の関係を表せない。',
    ),
    [
      '「〜をよそに」 was deliberately excluded: 「怪我をよそに」 is marginally attested and could be argued as a second answer.',
      'All three distractors are semantically far from the context, so this may be easier than a real N1 grammar-form item.',
      'r2 rationale no longer implies that ものともせず guarantees a completed recovery (review item 5 note).',
    ],
  ),
  withDoubts(
    g(
      'grammar-form',
      '（　）に入る最もよいものを選んでください。\nこの程度の床の傷みなら、わざわざ業者を呼ぶ（　）。自分で十分に直せる。',
      ['に越したことはない', 'までもない', '始末だ', 'に値する'],
      1,
      '「〜までもない」は、そうする必要はないという意味で、「わざわざ」とともに使われ、「自分で十分に直せる」という話し手の判断に合う。「〜に越したことはない」は、そうするのが最も望ましいという勧めを表すので、業者を呼ぶ必要を認めていないこの話し手の評価と合わない。「〜始末だ」は、悪い経過をたどった末の結果を述べる表現で、「この程度の傷みなら」という仮定の判断には合わない。「〜に値する」は、そうするだけの価値があるという評価を表し、「この程度」「わざわざ」という軽い見方と合わない。',
    ),
    [
      '「〜に越したことはない」 could be defensible in a different setup (preferring professional help even when self-repair is possible); here it is excluded by this speaker\'s stated evaluation, not by logic.',
      '「にはあたらない」 was deliberately excluded: 「呼ぶにはあたらない」 can be read as "no need to call", which would be a second answer.',
      'Local cues (わざわざ, the self-repair sentence) and remote distractors make this a relatively easy form judgement; N1 calibration is unknown.',
    ],
  ),
  withDoubts(
    g(
      'sentence-composition',
      '★に入るものを選んでください。\nその写真家は、____ ____ ★ ____ で、町の何気ない日常を撮り続けている。',
      ['視点', '地元に', 'ならではの', '暮らす者'],
      2,
      '「地元に暮らす者ならではの視点で」の順になる。★は三番目の「ならではの」。「〜ならではの」は名詞（暮らす者）に付き、その人やその場にしかない特徴を表して、後ろの名詞（視点）を修飾する。「地元に」は動詞「暮らす」にかかるので先頭に置き、「視点」は後の「で」に続くので最後に置く。',
    ),
    [
      'Unchanged from r1. The reviewer confirmed the order 地元に→暮らす者→ならではの→視点 is unique but holds a difficulty reservation: the chunks leave little competing structure and ★ is the grammar point itself.',
    ],
  ),
  withDoubts(
    g(
      'text-grammar',
      '（　）に入る最もよいものを選んでください。\n新しい薬が本当に効くのかを確かめる方法の一つに、薬を使う集団と使わない集団とを比べる試験がある。例えば、ある患者がその薬を飲み、数日後に回復したとする。この事実から、薬が効いたと（　）。病気によっては、何もしなくても時間とともに快方に向かうことがあるし、薬を飲んだという安心感が症状を和らげることもあるからだ。一人の回復のような、比べる相手を持たない観察は、それだけでは効き目の証拠として弱いのである。',
      ['言い切れるものではない', '言ってしかるべきだ', '言うまでもない', '言わざるを得ない'],
      0,
      '空欄の文だけを見れば、四つとも文法的に成り立ち、意味も通る。決め手は前後の論の流れである。文章は、薬の効き目を確かめる方法の一つとして、薬を使う集団と使わない集団とを比べる試験を挙げ、一人の患者が回復した例を示す。空欄の後の「からだ」で、自然に快方に向かうことや安心感による効果という別の説明を理由として挙げ、一人の回復のような比べる相手のない観察は、それだけでは証拠として弱いとまとめている。したがって、一人の回復という事実から効いたと断定はできないという意味の「言い切れるものではない」が入る。「言ってしかるべきだ」「言うまでもない」「言わざるを得ない」は、いずれも効いたと認める方向の判断で、「からだ」で示される理由や最後の結論とつながらない。',
    ),
    [
      'r2 redesign (review item 8): the gap sentence alone admits all four options; the following からだ reasons and the closing sentence decide. A reviewer should re-run that ablation.',
      'r3 (r2 review): the opening now presents a treated-vs-untreated comparison as one method, not an indispensable one (ICH E10 dose-response designs are a counterexample); the closing sentence is narrowed to a single-case observation, which on its own is weak evidence. The answer key is unchanged.',
      'The three distractors all affirm the inference, so the item tests the stance of the argument rather than three distinct errors. Three options end in ない-forms, so picking the only negative-looking option does not work.',
      'Options test sentence-final judgement forms; 〜てしかるべきだ and 〜ものではない are advanced, but N1 calibration is unknown.',
      'Medical statements are hedged (方法の一つ, 病気によっては, 〜こともある, それだけでは); a reviewer should confirm that no factual overstatement remains.',
    ],
  ),
  withDoubts(
    r(
      'information-retrieval',
      'grantNotice',
      '市内に拠点を置き、営利を目的としない構成員八人の団体が、昨年度この助成を受けて開いた朗読会を、今年度は規模を広げて開催する。その朗読会の実績報告書は提出済みである。対象経費が六十万円の場合、採択されたときに受けられる助成額は最大でいくらですか。',
      ['二十万円', '三十万円', '四十万円', '助成は受けられない'],
      0,
      '昨年度に本助成を受けた朗読会を発展させて開くので、継続事業（Ｂ）にあたる。これまでに実施したことのある事業なので、新規事業（Ａ）にはあたらない。実績報告書は提出済みなので、申請の条件も満たす。採択された場合、対象経費六十万円の二分の一は三十万円だが、Ｂの上限は二十万円なので、最大で二十万円。三十万円は二分の一で計算して上限を見落とした額。四十万円は新規事業（Ａ）の三分の二で計算し、上限も見落とした額。過去に助成を受けた団体でも、実績報告書を提出していれば申請できるので、「受けられない」は誤り。',
    ),
    [
      'r2 notice defines A as a project the group has never run and states that a past project without this grant is neither A nor B; the question now says 採択されたとき (review item 9).',
      'The notice is still well short of an official N1 information-retrieval text (~700 characters), and the two-step lookup (classify, then apply the cap) is strongly cued; compact practice, not a demonstrated N1 retrieval load.',
    ],
  ),
  withDoubts(
    r(
      'information-retrieval',
      'grantNotice',
      '次のうち、この助成に申請できる団体はどれですか。なお、各団体について書かれていない点は、募集の条件を満たしているものとします。',
      [
        '市内に拠点を置き、営利を目的としない構成員四人の朗読グループが、これまで行ったことのない朗読会を新たに開く。',
        '市内に拠点を置き、営利を目的とする社員十五人のイベント会社が、これまで行ったことのない音楽祭を新たに開く。',
        '市内に拠点を置き、営利を目的としない構成員十二人の劇団が、これまで行ったことのない野外公演を新たに行う。',
        '市内に拠点を置き、営利を目的としない構成員七人の書道会が、以前本助成を受けた作品展を発展させて開く。その作品展の実績報告書は、まだ提出していない。',
      ],
      2,
      '対象団体は、市内に活動拠点を置き、構成員が五人以上で、営利を目的としない団体。劇団はこの三つの条件をすべて満たし、これまで行ったことのない公演を新たに始めるので新規事業（Ａ）にあたる。朗読グループは構成員が四人で、五人以上という条件を満たさない。イベント会社は営利を目的とする団体なので対象外。書道会は、以前本助成を受けた事業の実績報告書を提出していないため、申請の条件を満たさない。',
    ),
    [
      'r2 states the purpose of every applicant explicitly (non-profit for the key, profit-making for option 2) and adds a common premise that unstated conditions are met, so no premise is guessed (review item 10).',
      'The common-premise sentence is an exam device; a reviewer should confirm it creates no new ambiguity (e.g. for option 2, which names 社員 rather than 構成員 but fails on purpose regardless).',
      'Each wrong option fails exactly one explicit condition.',
    ],
  ),
  withDoubts(
    r(
      'compact-comprehension',
      'wayfindingEssay',
      '「町を縮めた図にすぎなかった」とあるが、どういうことですか。',
      [
        '端末の地図は縮尺が小さく、細い道までは表示されなかったということ',
        '案内に従って移動していた筆者は、町そのものを見ていなかったということ',
        '最短の経路をたどったため、町のごく一部しか通らなかったということ',
        '実際の町は、画面で見るよりもはるかに複雑だったということ',
      ],
      1,
      '直前に「画面上の矢印を追っているあいだ」とあり、「私が見ていたのは町ではなく」と続く。案内の画面ばかり見ていて、町そのものを見ていなかったという意味。地図の縮尺や表示の細かさ、通った範囲の広さ、実際の町の複雑さについては、本文で述べていない。',
    ),
    [
      'r2 relabels this as compact-comprehension (a non-official task id): the essay is about 400 characters and shared with item 12, so it is not the official ~200-character short-reading task (review item 11).',
      'The question largely restates an adjacent clause; it is a compact comprehension drill, not a demonstration of N1 short-passage difficulty.',
      'r2 smooths the anecdote (曲がるべき角を何度も通り過ぎ、同じ通りを行きつ戻りつした). Navigation apps versus getting lost is a common theme; originality is the author\'s statement, not independently proven.',
    ],
  ),
  withDoubts(
    r(
      'compact-main-idea',
      'wayfindingEssay',
      '筆者が最も言いたいことはどれですか。',
      [
        '土地をよく知るためには、端末の案内に頼らずに移動するべきだ',
        '道に迷わないよう、出かける前に地図で地形を確かめておくべきだ',
        '迷った経験は時間の無駄なので、早く忘れてしまったほうがよい',
        '効率よく目的地に着けても、それでその土地を知ったことにはならない',
      ],
      3,
      '最後の段落で、目的地に着くことと土地を知ることは「似ているようでいて別の事柄」だとまとめており、これが筆者の中心的な主張である。「端末の案内に頼らずに移動するべきだ」は、筆者が述べていない行動の指示を加えている。筆者は「便利な道具を手放せと言うつもりはない」とし、どう移動すべきかを指示するのではなく、二つの事柄の区別を述べるにとどめている。出かける前に地図で地形を確かめるという話は本文になく、筆者はむしろ、自分の誤りを通して地形を確かめると述べている。迷った経験は今も鮮明に覚えているものとして描かれており、早く忘れたほうがよいという考えとは逆である。',
    ),
    [
      'r2 relabels this as compact-main-idea (a non-official task id): a ~400-character essay lacks the sustained argument of N1 claim-reading (review item 12).',
      'Option 1 is a possible subsidiary inference; r2 rejects it for adding a prescription the author does not assert, not for contradicting him.',
    ],
  ),
];

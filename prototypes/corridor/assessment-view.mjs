/** JLPT room. Persistence and editorial admission belong to the host.
 * All exam/source strings are text nodes, including private imported content. */
const SKILLS = { vocabulary: ['文字・語彙', 'Vocabulary'], grammar: ['文法', 'Grammar'],
  reading: ['読解', 'Reading'], listening: ['聴解', 'Listening'] };
const PAPER_LABEL_EN = {
  '言語知識（文字・語彙・文法）・読解': 'Language knowledge (vocabulary & grammar) · Reading',
  '言語知識（文字・語彙・文法）': 'Language knowledge (vocabulary & grammar)',
  '言語知識（文字・語彙）': 'Language knowledge (vocabulary)',
  '言語知識（文法）': 'Grammar', '言語知識': 'Language knowledge',
  '言語知識（文法）・読解': 'Grammar · Reading', '聴解': 'Listening', '読解': 'Reading',
};
const LENGTHS = { short: ['ショート', 'Short'], medium: ['ミディアム', 'Medium'], full: ['フル模試', 'Full mock'] };
// Model families named in machine-checked provenance (the review record keeps exact model ids).
const FAMILIES = { 'anthropic-claude': 'Claude', 'zhipu-glm': 'GLM', 'moonshot-kimi': 'Kimi', deepseek: 'DeepSeek', minimax: 'MiniMax' };
const familyName = id => FAMILIES[id] || id;
const node = (tag, className, text) => {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const button = (text, id, run, className = 'chip') => {
  const result = node('button', className, text); result.type = 'button';
  if (id) result.id = id;
  result.addEventListener('click', run); return result;
};
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
async function mediaSource(bytes, mimeType) {
  // Keep playback usable if connectivity changes after preparation. WebKit can
  // stop resolving an already-created Blob URL when its network goes offline.
  const value = new Uint8Array(bytes), parts = [];
  for (let offset = 0; offset < value.length; offset += 32768)
    parts.push(String.fromCharCode(...value.subarray(offset, offset + 32768)));
  return `data:${mimeType};base64,${btoa(parts.join(''))}`;
}
// Printed features of a real paper, carried as private-use marks in its text (see
// tools/assessment/official-paper.mjs): underline, ruby base/reading, a boxed item number.
const PAPER_MARKS = /[\uE000-\uE006]/u;
function paperNodes(text) {
  const fragment = document.createDocumentFragment();
  let target = fragment, buffer = '';
  const flush = () => { if (buffer) { target.append(document.createTextNode(buffer)); buffer = ''; } };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '\uE000') { flush(); const span = node('span', 'paper-underline'); fragment.append(span); target = span; }
    else if (char === '\uE001') { flush(); target = fragment; }
    else if (char === '\uE002') {
      flush();
      const split = text.indexOf('\uE003', index), close = text.indexOf('\uE004', split);
      if (split < 0 || close < 0) continue;
      const ruby = document.createElement('ruby');
      ruby.append(document.createTextNode(text.slice(index + 1, split)), node('rt', '', text.slice(split + 1, close)));
      target.append(ruby); index = close;
    } else if (char === '\uE005') {
      flush();
      const close = text.indexOf('\uE006', index);
      if (close < 0) continue;
      target.append(node('span', 'paper-box', text.slice(index + 1, close))); index = close;
    } else if (!PAPER_MARKS.test(char)) buffer += char;
  }
  flush(); return fragment;
}
const paperPlain = text => text.replace(/\uE002([^\uE003]*)\uE003[^\uE004]*\uE004/gu, '$1').replace(/[\uE000-\uE006]/gu, '');
const minutes = ms => Math.max(0, Math.ceil(ms / 60_000));
const clockText = ms => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
/** Display structure comes from the retained item; no answer key is read. */
export function assessmentQuestionLayout(form, question) {
  const groups = [];
  for (const item of form.items) {
    if (groups.at(-1)?.task !== item.task || groups.at(-1)?.skill !== item.skill)
      groups.push({ task: item.task, skill: item.skill, ids: [] });
    groups.at(-1).ids.push(item.id);
  }
  const lines = question.prompt.split('\n');
  return { group: groups.findIndex(row => row.ids.includes(question.id)) + 1,
    number: form.items.findIndex(item => item.id === question.id) + 1,
    task: DAIMON[question.task]?.[0] || SKILLS[question.skill]?.[0] || '',
    instruction: lines.length > 1 ? lines.shift().replace(/【[\s\u3000]*】/gu, '＿＿＿') : '',
    text: lines.join('\n'), fullLength: form.scope === 'full-candidate' };
}

/* ---------------------------------------------------------------- the paper
 * A JLPT form sits the way the printed paper does: its 試験科目 (paper), 問題 headers with the
 * official instruction, one continuous item number per paper, underlined targets, （ ） blanks
 * and the ★ row. Wording is the 2018 公式問題集 booklets' (N1–N3 〜なさい, N4/N5 〜てください,
 * their spacing kept). Only an information-retrieval header is ours: the paper names its own
 * document (右のページは、…である。). Rendering never changes an item: its prompt, options and
 * key stay the exact form version. */
export const DAIMON = Object.freeze({
  'kanji-reading': ['漢字読み', 'Kanji reading'], orthography: ['表記', 'Orthography'],
  'word-formation': ['語形成', 'Word formation'], 'contextual-expression': ['文脈規定', 'Words in context'],
  paraphrase: ['言い換え類義', 'Paraphrase'], usage: ['用法', 'Usage'],
  'grammar-form': ['文法形式の判断', 'Grammar form'], 'sentence-composition': ['文の組み立て', 'Sentence building (★)'],
  'text-grammar': ['文章の文法', 'Text grammar'], 'short-reading': ['内容理解（短文）', 'Short passages'],
  'mid-reading': ['内容理解（中文）', 'Mid-size passages'], 'long-reading': ['内容理解（長文）', 'Long passage'],
  'integrated-reading': ['統合理解', 'Integrated reading'], 'claim-reading': ['主張理解（長文）', 'Thematic reading'],
  'information-retrieval': ['情報検索', 'Information retrieval'],
});
const ONE_TO_FOUR = '１・２・３・４';
const WIDE = n => String(n).replace(/[0-9]/gu, d => String.fromCharCode(0xff10 + Number(d)));
// segments: strings are text; {u} an underlined blank, {b} a （ ） blank, {star} the ★ slot, {box} a numbered gap
const U = { kind: 'underline' }, B = { kind: 'blank' }, STAR = { kind: 'star' };
const box = n => ({ kind: 'box', n });
const counted = (ctx, one, two, many) => ctx.passages <= 1 ? one : ctx.passages === 2 ? two : many(ctx.passages);
// text grammar names its numbered gaps: [41]から[45]の中に…; one gap [41]に…; a gap printed in the stem （ ）に…
const gapRange = (ctx, from, within) => ctx.first === undefined ? [B] : ctx.first === ctx.last ? [box(ctx.first)]
  : [box(ctx.first), from, box(ctx.last), ...(within ? [within] : [])];
const INSTRUCTIONS = {
  // N1 and N2 share the paper's wording; N1 text grammar reads 趣旨を踏まえて, N2 内容を考えて.
  upper: (level) => ({
    'kanji-reading': () => [U, `の言葉の読み方として最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    orthography: () => [U, `の言葉を漢字で書くとき、最もよいものを${ONE_TO_FOUR}から一つ選びなさい。`],
    'word-formation': () => [B, `に入れるのに最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    'contextual-expression': () => [B, `に入れるのに最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    paraphrase: () => [U, `の言葉に意味が最も近いものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    usage: () => [`次の言葉の使い方として最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    'grammar-form': () => ['次の文の', B, `に入れるのに最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    'sentence-composition': () => ['次の文の', STAR, `に入る最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    'text-grammar': ctx => [`次の文章を読んで、文章全体の${level === 'N1' ? '趣旨を踏まえて' : '内容を考えて'}、`,
      ...gapRange(ctx, 'から', 'の中'), `に入る最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    'short-reading': ctx => [`${counted(ctx, '次の文章', '次の（１）と（２）の文章', n => `次の（１）から（${WIDE(n)}）の文章`)}を読んで、後の問いに対する答えとして最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    'mid-reading': ctx => [`${counted(ctx, '次の文章', '次の（１）と（２）の文章', n => `次の（１）から（${WIDE(n)}）の文章`)}を読んで、後の問いに対する答えとして最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    'long-reading': () => [`次の文章を読んで、後の問いに対する答えとして最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    'integrated-reading': () => [`次のＡとＢの文章を読んで、後の問いに対する答えとして最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    'claim-reading': () => [`次の文章を読んで、後の問いに対する答えとして最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
    'information-retrieval': () => [`次の文書を読んで、下の問いに対する答えとして最もよいものを、${ONE_TO_FOUR}から一つ選びなさい。`],
  }),
  N3: () => ({
    'kanji-reading': () => [U, `のことばの読み方として最もよいものを、${ONE_TO_FOUR}から一つえらびなさい。`],
    orthography: () => [U, `のことばを漢字で書くとき、最もよいものを、${ONE_TO_FOUR}から一つえらびなさい。`],
    'contextual-expression': () => [B, `に入れるのに最もよいものを、${ONE_TO_FOUR}から一つえらびなさい。`],
    paraphrase: () => [U, `に意味が最も近いものを、${ONE_TO_FOUR}から一つえらびなさい。`],
    usage: () => [`つぎのことばの使い方として最もよいものを、${ONE_TO_FOUR}から一つえらびなさい。`],
    'grammar-form': () => ['つぎの文の', B, `に入れるのに最もよいものを、${ONE_TO_FOUR}から一つえらびなさい。`],
    'sentence-composition': () => ['つぎの文の', STAR, `に入る最もよいものを、${ONE_TO_FOUR}から一つえらびなさい。`],
    'text-grammar': ctx => ['つぎの文章を読んで、文章全体の内容を考えて、', ...gapRange(ctx, 'から', 'の中'),
      `に入る最もよいものを、${ONE_TO_FOUR}から一つえらびなさい。`],
    'short-reading': ctx => [`${counted(ctx, 'つぎの文章', 'つぎの（１）と（２）の文章', n => `つぎの（１）から（${WIDE(n)}）の文章`)}を読んで、質問に答えなさい。答えは、${ONE_TO_FOUR}から最もよいものを一つえらびなさい。`],
    'mid-reading': ctx => [`${counted(ctx, 'つぎの文章', 'つぎの（１）と（２）の文章', n => `つぎの（１）から（${WIDE(n)}）の文章`)}を読んで、質問に答えなさい。答えは、${ONE_TO_FOUR}から最もよいものを一つえらびなさい。`],
    'long-reading': () => [`つぎの文章を読んで、質問に答えなさい。答えは、${ONE_TO_FOUR}から最もよいものを一つえらびなさい。`],
    'information-retrieval': () => [`つぎの文書を読んで、下の質問に答えなさい。答えは、${ONE_TO_FOUR}から最もよいものを一つえらびなさい。`],
  }),
  lower: (level) => ({
    'kanji-reading': () => [U, `の ことばは ひらがなで どう かきますか。${ONE_TO_FOUR}から いちばん いい ものを ひとつ えらんで ください。`],
    orthography: () => [U, `の ことばは どう かきますか。${ONE_TO_FOUR}から いちばん いい ものを ひとつ えらんで ください。`],
    'contextual-expression': () => [B, `に ${level === 'N5' ? 'なにが はいりますか' : 'なにを いれますか'}。${ONE_TO_FOUR}から いちばん いい ものを ひとつ えらんで ください。`],
    paraphrase: () => [U, `の ぶんと だいたい おなじ いみの ぶんが あります。${ONE_TO_FOUR}から いちばん いい ものを ひとつ えらんで ください。`],
    usage: () => [`つぎの ことばの つかいかたで いちばん いい ものを ${ONE_TO_FOUR}から ひとつ えらんで ください。`],
    'grammar-form': () => [B, `に 何を 入れますか。${ONE_TO_FOUR}から いちばん いい ものを 一つ えらんで ください。`],
    'sentence-composition': () => [STAR, `に 入る ものは どれですか。${ONE_TO_FOUR}から いちばん いい ものを 一つ えらんで ください。`],
    'text-grammar': ctx => [...gapRange(ctx, 'から', ''), level === 'N5'
      ? `に 何を 入れますか。ぶんしょうの いみを かんがえて、${ONE_TO_FOUR}から いちばん いい ものを 一つ えらんで ください。`
      : `に 何を 入れますか。文章の 意味を 考えて、${ONE_TO_FOUR}から いちばん いい ものを 一つ えらんで ください。`],
    'short-reading': ctx => [level === 'N5'
      ? `${counted(ctx, 'つぎの', 'つぎの （１）と（２）の', n => `つぎの （１）から（${WIDE(n)}）の`)} ぶんしょうを 読んで、しつもんに こたえて ください。こたえは、${ONE_TO_FOUR}から いちばん いい ものを 一つ えらんで ください。`
      : `${counted(ctx, 'つぎの文章', 'つぎの（１）と（２）の文章', n => `つぎの（１）から（${WIDE(n)}）の文章`)}を読んで、質問に答えてください。答えは、${ONE_TO_FOUR}から、いちばんいいものを一つえらんでください。`],
    'mid-reading': () => [level === 'N5'
      ? `つぎの ぶんしょうを 読んで、しつもんに こたえて ください。こたえは、${ONE_TO_FOUR}から いちばん いい ものを 一つ えらんで ください。`
      : `つぎの文章を読んで、質問に答えてください。答えは、${ONE_TO_FOUR}から、いちばんいいものを一つえらんでください。`],
    'information-retrieval': () => [level === 'N5'
      ? `つぎの ページを 見て、下の しつもんに こたえて ください。こたえは、${ONE_TO_FOUR}から いちばん いい ものを 一つ えらんで ください。`
      : `つぎのページを見て、下の質問に答えてください。答えは、${ONE_TO_FOUR}から、いちばんいいものを一つえらんでください。`],
  }),
};
/** The official instruction for one 大問, as segments; null for a task this level's paper lacks. */
export function officialInstruction(level, task, context = {}) {
  const table = level === 'N1' || level === 'N2' ? INSTRUCTIONS.upper(level)
    : level === 'N3' ? INSTRUCTIONS.N3() : level === 'N4' || level === 'N5' ? INSTRUCTIONS.lower(level) : null;
  // a compact practice task (not an official 大問) reads like one passage with its questions
  const make = table?.[task] ?? (/^compact-/u.test(task) ? table?.['claim-reading'] ?? table?.['mid-reading'] : null);
  return make ? make({ passages: 1, ...context }) : null;
}
export const mondaiLabel = (level, number) => `${level === 'N4' || level === 'N5' ? 'もんだい' : '問題'}${WIDE(number)}`;

/** Marks in authored text, as segments: 【X】 an underlined target (【 】 an underlined
 * blank), （ ） a blank, ＿★＿ the star slot, ＿＿＿ a slot, and （n） a numbered gap when
 * `gaps` maps it to a paper number. */
export function paperSegments(text, { gaps = null } = {}) {
  const segments = [];
  const pattern = /【([^】]*)】|（[\u3000 ]+）|＿★＿|＿＿＿|_{2,}|★|（([０-９0-9]+)）/gu;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const [whole, target, gap] = match;
    let segment;
    if (target !== undefined) segment = target.trim() ? { kind: 'target', text: target } : U;
    else if (whole === '＿★＿' || whole === '★') segment = STAR;
    else if (whole === '＿＿＿' || whole.startsWith('_')) segment = { kind: 'slot' };
    else if (gap !== undefined) {
      const n = Number(gap.normalize('NFKC'));
      if (!gaps?.has(n)) continue;
      segment = box(gaps.get(n));
    } else segment = B;
    if (match.index > at) segments.push(text.slice(at, match.index));
    segments.push(segment);
    at = match.index + whole.length;
  }
  if (at < text.length) segments.push(text.slice(at));
  return segments;
}
const PASSAGE_TASKS = new Set(['text-grammar', 'short-reading', 'mid-reading', 'long-reading',
  'integrated-reading', 'claim-reading', 'information-retrieval']);
/** The printed stem: an item's own instruction line is replaced by its 問題 header. */
export function paperStem(item) {
  // a gap numbered in its passage prints as the item number alone
  if (item.task === 'text-grammar' && item.passages.length) return [];
  const lines = item.prompt.split('\n');
  const stem = (PASSAGE_TASKS.has(item.task) && item.passages.length) || /^compact-/u.test(item.task) || lines.length < 2
    ? item.prompt : lines.slice(1).join('\n');
  // 用法 prints the word itself as the stem, not underlined: 【手際】, or 「携わる」の使い方として…
  if (item.task === 'usage')
    return [{ kind: 'word', text: stem.match(/^「(.+?)」の使い方/u)?.[1] ?? stem.replace(/^【(.*)】$/u, '$1') }];
  return paperSegments(stem);
}
/** Whether the printed stem leaves out the item's own first line, its authored instruction. */
const paperStemDropsLine = item => !(item.task === 'text-grammar' && item.passages.length) &&
  !((PASSAGE_TASKS.has(item.task) && item.passages.length) || /^compact-/u.test(item.task) || item.prompt.split('\n').length < 2);
/** The text-grammar gap an item asks about: 「文章の（２）に…」 → 2. */
export const textGrammarGap = item => {
  const gap = item.task === 'text-grammar' ? item.prompt.match(/（([０-９0-9]+)）/u)?.[1] : null;
  return gap ? Number(gap.normalize('NFKC')) : null;
};

/** One paper (試験科目) laid out: 問題 groups in order and each item's continuous number. */
export function paperLayout(form, blockId) {
  const block = form.timingBlocks.find(row => row.id === blockId);
  if (!block) throw new Error(`paper-layout: no block ${blockId}`);
  const items = block.sectionIds.flatMap(id => form.sections.find(row => row.id === id).itemIds)
    .map(id => form.items.find(row => row.id === id));
  const groups = [], byItem = new Map();
  items.forEach((item, index) => {
    let group = groups.at(-1);
    if (group?.task !== item.task) {
      group = { mondai: groups.length + 1, task: item.task, itemIds: [], numbers: [], passageIds: [] };
      groups.push(group);
    }
    group.itemIds.push(item.id); group.numbers.push(index + 1);
    for (const reference of item.passages) if (!group.passageIds.includes(reference.id)) group.passageIds.push(reference.id);
    byItem.set(item.id, { number: index + 1, group });
  });
  for (const group of groups) {
    if (group.task !== 'text-grammar' || !group.passageIds.length) continue;
    group.gaps = new Map(group.itemIds.map((id, index) => [textGrammarGap(form.items.find(row => row.id === id)), group.numbers[index]]));
  }
  return { blockId, paper: block.authority.kind === 'official-fact' ? block.authority.blockId : null, groups, byItem };
}

/** Raw results by the official 得点区分, with the published facts beside them. No conversion. */
export function officialSectionResults(facts, form, scoreItems) {
  return facts.sections.map(section => {
    const rows = scoreItems.filter(row => section.skills.includes(row.skill));
    const byTask = [];
    for (const row of rows) {
      const task = form.items.find(item => item.id === row.itemId)?.task;
      let entry = byTask.find(value => value.task === task);
      if (!entry) byTask.push(entry = { task, correct: 0, total: 0 });
      entry.total += 1; if (row.result === 'correct') entry.correct += 1;
    }
    return { ...section, total: rows.length, correct: rows.filter(row => row.result === 'correct').length, byTask };
  });
}

export function createAssessmentView(host) {
  // the room opens where the learner last chose to stand; with no choice yet it opens at N2
  let level = host.initialLevel?.() || 'N2', length = 'short', catalog = null, failed = false, loading = false;
  let selectedId = null, historyOpen = false, notice = null, legacyOpen = false, focusItemId = null;
  let activeAudio = null, audioKey = null, audioUrl = null, audioLoading = false;
  let lifecycle = 0, playbackEpoch = 0, advancingAudio = false, deliveryLoading = false;
  let resumeOnEntry = false, entryResumePending = false;
  // why-sheet: which item's sheet is open (view-only), and where focus goes after the next render
  let whyOpenItemId = null, focusAfterRender = null;
  const deliveryFailures = new Set();
  const imageUrls = new Map();
  let confirmation = null;
  const tx = (ja, en) => host.english() ? en : ja;
  const paperLabel = ja => tx(ja, PAPER_LABEL_EN[ja] || ja);
  // Room headings follow the active interface language.
  const sectionHeading = (ja, en, jaAlone = ja) => {
    const heading = node('h2', 'exam-section-heading', tx(jaAlone, en)); heading.lang = host.english() ? 'en' : 'ja';
    return heading;
  };
  // 未確認 — one quiet chip where no person has reviewed the questions yet, its reason in the
  // tooltip (and, with withReason, beside it). The review label stays in the record, not on screen.
  const reviewMark = (label, withReason = false, className = 'exam-machine-label') => {
    const mark = node('p', className);
    const reason = tx('AIが作成・検証した問題です。まだ人は確認していません。', 'Written and checked by AI models; not yet reviewed by a person.');
    const chip = node('span', 'status-chip', tx('未確認', 'Unreviewed'));
    chip.title = reason; chip.setAttribute('aria-label', `${tx('未確認', 'Unreviewed')} — ${reason}`);
    mark.append(chip);
    if (withReason) mark.append(node('span', 'exam-review-reason', tx('人による確認の前', 'not yet reviewed by a person')));
    mark.dataset.reviewLabel = label;
    return mark;
  };
  const titleOf = entry => host.english() ? entry.titleEn : entry.titleJa;
  const hasListening = entry => Number(entry.skillCounts?.listening) > 0;
  const isOfficial = entry => entry?.sourceClass === 'official-private';
  const officialOf = selected => (selected ? host.officialEntry?.(selected) || null : null);
  // Real-paper text keeps its printed underlines, ruby and boxed numbers; other forms stay plain text.
  const textNode = (tag, className, text, official) => {
    if (!official) return node(tag, className, text);
    const element = node(tag, className); element.append(paperNodes(text)); return element;
  };
  let importing = false, importNotice = null;
  const pageUrls = new Set();
  const refresh = () => host.render();
  const selection = () => host.selection(selectedId);
  const owned = () => host.owned?.() !== false;
  const alive = generation => generation === lifecycle && owned();
  const deliveryUnits = selected => host.delivery?.(selected)?.units || [];
  async function beforeLookup(attemptId, itemId) {
    const current = selection();
    if (!owned() || !current || current.attempt.attemptId !== attemptId) return false;
    if (current.attempt.status !== 'in-progress') return true;
    if (current.attempt.mode !== 'practice' || current.attempt.cursor.itemId !== itemId) return false;
    if (host.assistance?.(current, itemId)) return true;
    if (!await command({ kind: 'dictionary-lookup', itemId })) return false;
    const after = selection();
    return owned() && after?.attempt.attemptId === attemptId && after.attempt.status === 'in-progress' &&
      after.attempt.cursor.itemId === itemId && !!host.assistance?.(after, itemId);
  }
  function appendText(container, text, selected, itemId, role, block = container) {
    const assistanceAllowed = selected.attempt.mode === 'practice' || selected.attempt.status !== 'in-progress';
    if (assistanceAllowed && host.appendLookupText) host.appendLookupText(container, text, {
      surface: 'assessment', attemptId: selected.attempt.attemptId, itemId, role, block,
      furigana: 'on-demand', beforeOpen: () => beforeLookup(selected.attempt.attemptId, itemId),
    });
    else container.append(document.createTextNode(text));
  }
  function questionText(container, text, selected, itemId, role) {
    let cursor = 0;
    for (const match of text.matchAll(/【([^】]+)】/gu)) {
      appendText(container, text.slice(cursor, match.index), selected, itemId, role);
      const target = node('span', 'exam-target');
      // the underlined target stays part of its prompt's one keyboard stop
      appendText(target, match[1], selected, itemId, role, container); container.append(target);
      cursor = match.index + match[0].length;
    }
    appendText(container, text.slice(cursor), selected, itemId, role);
  }
  // The printed-paper facts belong to the machine-checked JLPT forms; other classes keep the plain sheet.
  const paperMode = selected => !!host.machineCheckLabel?.(selected) && selected.form.exam.family === 'jlpt';
  const officialFacts = level => host.officialFacts?.(level) || null;
  // Paper segments onto the sheet. Words go through `write` (the study-mode lookup, plain text when
  // timed); a target or printed word stays part of its parent's one keyboard stop.
  function appendSegments(parent, segments, current = null, write = (into, text) => into.append(document.createTextNode(text))) {
    for (const segment of segments) {
      if (typeof segment === 'string') { write(parent, segment, parent); continue; }
      const kind = segment.kind;
      const span = node('span', kind === 'underline' ? 'exam-underline-blank' : kind === 'blank' ? 'exam-blank'
        : kind === 'star' ? 'exam-slot exam-star-slot' : kind === 'slot' ? 'exam-slot' : kind === 'target' ? 'exam-target'
          : kind === 'box' ? 'exam-gap-box' : 'exam-word');
      if (kind === 'target' || kind === 'word') write(span, segment.text, parent);
      else span.textContent = kind === 'underline' ? '\u3000\u3000\u3000\u3000' : kind === 'blank' ? '（\u3000\u3000\u3000）'
        : kind === 'star' ? '★' : kind === 'slot' ? '\u3000' : String(segment.n);
      if (kind === 'box' && segment.n === current) span.dataset.current = 'true';
      parent.append(span);
    }
    return parent;
  }
  // 試験科目: a written paper's official name and its minutes and questions, from the entry
  function entryPapers(entry) {
    const facts = officialFacts(entry.level);
    if (entry.timingAuthority !== 'official-fact' || !facts?.blueprint) return [];
    return facts.blueprint.timingBlocks.filter(block => block.duration === 'fixed' && !block.skills.includes('listening'))
      .map(block => ({ label: paperLabel(facts.score.papers[block.id]), minutes: block.minutes,
        questions: block.skills.reduce((total, skill) => total + Number(entry.skillCounts?.[skill] || 0), 0) }));
  }
  const paperName = (selected, blockId) => {
    const spec = selected.form.timingBlocks.find(row => row.id === blockId);
    return spec?.authority.kind === 'official-fact' ? paperLabel(officialFacts(selected.form.exam.track)?.score.papers[spec.authority.blockId]) || null : null;
  };
  function blockUnits(selected) {
    const open = selected.attempt.blocks.find(row => row.status === 'open');
    const spec = selected.form.timingBlocks.find(row => row.id === open?.blockId);
    const ids = spec?.sectionIds.flatMap(id => selected.form.sections.find(row => row.id === id)?.itemIds || []) || [];
    return deliveryUnits(selected).filter(unit => unit.itemIds.some(id => ids.includes(id)));
  }
  const nextUnit = selected => blockUnits(selected).find(unit =>
    selected.attempt.audio.find(row => row.media.sha256 === unit.media.sha256)?.status !== 'ended');
  function canVisit(selected, itemId) {
    if (selected.attempt.mode !== 'timed') return true;
    const units = blockUnits(selected), pending = nextUnit(selected);
    const target = units.find(unit => unit.kind === 'question' && unit.itemIds.includes(itemId));
    return !target || !pending || units.indexOf(target) <= units.indexOf(pending) ||
      (pending.kind === 'example' && pending.itemIds.includes(itemId));
  }
  async function verifiedBytes(selected, media) {
    const asset = host.mediaBytes ? await host.mediaBytes(selected, media.assetId)
      : { bytes: await (await host.mediaBlob(selected, media.assetId)).arrayBuffer(), mimeType: media.mimeType };
    if (asset.mimeType !== media.mimeType || await digest(asset.bytes) !== media.bytesSha256)
      throw new Error('media-version-mismatch');
    return asset.bytes;
  }

  async function loadCatalog() {
    if (loading || catalog) return;
    loading = true; failed = false;
    try { catalog = await host.catalog(); }
    catch { failed = true; }
    finally { loading = false; refresh(); }
  }
  function stopAudio() {
    if (activeAudio) { activeAudio.onended = null; activeAudio.onerror = null; activeAudio.pause(); activeAudio.removeAttribute('src'); activeAudio.load(); }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    activeAudio = null; audioKey = null; audioUrl = null;
  }
  function cancelPendingPlayback() {
    playbackEpoch += 1; audioLoading = false; advancingAudio = false;
  }
  async function resumeAttempt(generation) {
    const current = selection();
    if (!alive(generation) || !current || current.attempt.status !== 'in-progress') return false;
    if (!current.attempt.clock.interrupted) return true;
    const ok = await host.action({ kind: 'resume' });
    if (!alive(generation)) return false;
    const updated = selection();
    if (!ok) notice = tx('再開を保存できませんでした。もう\u4E00度お試しください。', 'Couldn’t resume the test. Please try again.');
    return ok && updated?.attempt.attemptId === current.attempt.attemptId && updated.attempt.status === 'in-progress';
  }
  async function command(action, internal = false) {
    if (!owned() || host.pending() || (!internal && advancingAudio && action.kind === 'visit')) return false;
    if (action.kind === 'visit' && selection() && !canVisit(selection(), action.itemId)) return false;
    if (action.kind === 'close-block' && selection()?.attempt.mode === 'timed' && nextUnit(selection())) return false;
    const generation = lifecycle;
    notice = null;
    if (action.kind === 'visit') whyOpenItemId = null;
    if (!internal && ['answer', 'visit', 'flag', 'assistance', 'dictionary-lookup'].includes(action.kind) && !await resumeAttempt(generation)) { refresh(); return false; }
    if (['close-block', 'abandon', 'submit', 'interruption'].includes(action.kind)) {
      cancelPendingPlayback(); await suspendAudio();
    }
    if (action.kind === 'visit' && activeAudio && !activeAudio.paused) {
      const current = selection();
      const item = current?.form.items.find(row => row.id === action.itemId);
      if (current?.attempt.mode !== 'timed' &&
          !item?.media.some(row => `${current.attempt.attemptId}:${row.sha256}` === audioKey)) await suspendAudio();
    }
    if (!alive(generation)) return false;
    const ok = await host.action(action);
    if (!alive(generation)) return false;
    const current = selection();
    if (activeAudio && (!current || current.attempt.status !== 'in-progress' ||
        !current.attempt.blocks.some(row => row.status === 'open'))) stopAudio();
    if (!ok) notice = tx('保存できませんでした。もう\u4E00度お試しください。', 'Couldn’t save that change. Please try again.');
    refresh(); return ok;
  }
  async function audioFact(attemptId, mediaId, action, positionMs, generation = lifecycle) {
    if (!alive(generation) || host.selection()?.attempt.attemptId !== attemptId ||
        host.selection()?.attempt.status !== 'in-progress') return false;
    const ok = await host.action({ kind: 'audio', mediaId, action, positionMs: Math.max(0, Math.floor(positionMs)) });
    if (!alive(generation)) return false;
    if (!ok) notice = tx('再生の記録を保存できませんでした。', 'Couldn’t save the playback record.');
    refresh(); return ok;
  }
  async function suspendAudio() {
    if (!owned()) { stopAudio(); return; }
    if (!activeAudio || activeAudio.paused) return;
    const current = host.selection();
    const media = current?.form.media.find(row => `${current.attempt.attemptId}:${row.sha256}` === audioKey);
    const position = activeAudio.currentTime * 1000;
    activeAudio.pause();
    if (media) await audioFact(current.attempt.attemptId, media.id, 'pause', position);
  }
  function sourceDetails(container, entry, form = null) {
    const details = node('details', 'exam-sources');
    details.append(node('summary', '', tx('出典・問題の確認方法', 'Sources and question review')));
    details.append(node('p', '', entry?.sourceClass === 'original-ai'
      ? tx('JLPTの出題形式に沿って作成したオリジナル問題です。', 'Original questions written to follow the JLPT format.')
      : tx('出典と利用条件を以下に示します。', 'Sources and usage details are listed below.')));
    const reviewed = entry?.review?.status === 'ai-reviewed';
    if (entry?.review?.status === 'machine-checked') {
      const check = entry.machineCheck || {};
      const author = familyName(check.authorFamily || ''), verifiers = (check.verifierFamilies || []).map(familyName);
      details.append(reviewMark(entry.review.label, true));
      details.append(node('p', '', tx(
        `作成：${author}（AI）。検証：${verifiers.join('・')}。どのモデルも答えを見ずに全問を解き、全員が同じ答えを選んで不備を指摘しなかった問題だけを残しています。まだ人による確認はしていません。JLPT公式問題ではありません。`,
        `Written by ${author} (AI). Checked by ${verifiers.join(', ')}: each model solved every question without seeing the answer, and only questions where all of them chose the same answer and flagged no problem were kept. Not yet reviewed by a person. Not an official JLPT paper.`)));
    } else details.append(node('p', '', reviewed
      ? tx('複数の独立したAIモデルが解答と日本語を確認しています。JLPT公式問題ではありません。',
        'The answers and Japanese have been checked by independent AI models. This is not an official JLPT paper.')
      : tx('問題の確認が終わるまで、模試として公開しません。', 'This form will be available after question and audio review.')));
    for (const sourceId of entry?.sourceIds || []) {
      const source = (catalog?.sources || []).find(row => row.id === sourceId);
      if (!source?.url || !/^https:\/\//u.test(source.url)) continue;
      const link = node('a', '', source.title || sourceId); link.href = source.url;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link);
    }
    if (form) details.append(node('p', 'exam-version', `${tx('問題番号', 'Form')} ${form.id}`));
    container.append(details);
  }
  // A level with no checked test is not a dead end: its older sets are named here, each
  // marked 未確認 (answers not yet checked). No date is promised; nothing is called reviewed.
  function renderOlderSets(main, hasTests = false) {
    const older = host.olderSets?.(level) || { state: 'failed', sets: [] };
    const sets = older.sets;
    const block = node('section', 'exam-older'); block.dataset.examOlder = level; block.dataset.olderState = older.state;
    if (hasTests) block.append(sectionHeading('以前の練習セット', 'Older practice sets'));
    if (older.state === 'loading') { block.append(node('p', 'exam-status', tx('以前の練習セットを読み込み中…', 'Loading the older practice sets…'))); main.append(block); return; }
    if (older.state === 'failed') {
      block.append(node('p', 'exam-status', hasTests
        ? tx('以前の練習セットを読み込めませんでした。', 'The older practice sets couldn’t load.')
        : tx(`${level}の確認済みテストは、まだありません。以前の練習セットを読み込めませんでした。`, `No checked ${level} tests yet, and the older practice sets couldn’t load.`)));
      block.append(button(tx('もう\u4E00度読み込む', 'Try loading again'), 'exam-older-retry', () => host.retryOlderIndex?.()));
      main.append(block); return;
    }
    // 未確認 is said once for the section when none of its sets is checked; a mixed list marks rows
    const allUnchecked = sets.length > 0 && sets.every(set => !set.approved);
    if (allUnchecked) {
      const mark = node('p', 'exam-machine-label exam-older-mark'); mark.dataset.olderMark = '';
      const reason = tx('答えはまだ人が確認していません', 'answers not yet checked by a person');
      const chip = node('span', 'status-chip', tx('未確認', 'Unreviewed')); chip.title = reason; chip.setAttribute('aria-label', `${tx('未確認', 'Unreviewed')} — ${reason}`);
      mark.append(chip, node('span', 'exam-review-reason', reason));
      block.append(mark);
    }
    block.append(node('p', '', hasTests
      ? tx(`アプリの単語表と例文から自動で作った、${level}の短い練習セットです（${sets.length}つ）。`,
        `${sets.length} short ${level} sets, made automatically from the app’s word lists and example sentences.`)
      : sets.length
        ? tx(`${level}の確認済みテストは、まだありません。アプリの単語表と例文から自動で作った${level}の短い練習セットが${sets.length}つあり、今すぐ使えます。`,
          `No reviewed ${level} tests yet. ${sets.length} short ${level} sets, made automatically from the app’s word lists and example sentences, are ready now.`)
        : tx(`${level}の確認済みテストは、まだありません。`, `No reviewed ${level} tests yet.`)));
    if (sets.length) block.append(node('p', 'exam-older-limits', tx('語彙・文法・読解のみ。聴解と時間制限はありません。', 'Vocabulary, grammar and reading only — no listening, no timer.')));
    for (const set of sets) {
      const door = button(host.english() ? (set.title.en || set.title.ja) : set.title.ja, null, () => host.startOlder(set.setId), 'entry-row exam-older-set');
      door.dataset.legacySet = set.setId;
      door.append(node('span', 'exam-older-meta', tx(`${set.items}問`, `${set.items} questions`)));
      if (!set.approved && !allUnchecked) door.append(node('span', 'status-chip', '未確認'));
      door.disabled = !!host.olderSetLoading?.(set.setId);
      block.append(door);
      if (host.olderSetFailed?.(set.setId)) {
        const failure = node('p', 'exam-status exam-older-failed', tx('このセットを読み込めませんでした。もう\u4E00度押すと再試行します。', 'This set couldn’t load. Press it again to retry.'));
        failure.dataset.olderFailed = set.setId; block.append(failure);
      }
    }
    main.append(block);
  }
  function renderCatalog(main) {
    const heading = node('h1', 'view-title', tx('JLPT 模試・練習', 'JLPT tests & practice')); heading.lang = host.english() ? 'en' : 'ja';
    main.append(heading);
    main.append(node('p', 'exam-intro', tx('級と長さを選んで、今できることを確かめよう。', 'Choose your level and how much time you have.')));
    const levels = node('div', 'exam-levels'); levels.setAttribute('role', 'group'); levels.setAttribute('aria-label', tx('級', 'Level'));
    // each level is a card in its own colour: how many tests it holds, how many you finished, and
    // your last score there (accuracy on that test, never an official JLPT score)
    const library = host.library(), taken = library?.attempts || [];
    const trackOf = attempt => library?.forms.find(row => row.sha256 === attempt.form.sha256)?.exam.track;
    for (const value of ['N5', 'N4', 'N3', 'N2', 'N1']) {
      const control = button('', null, () => { level = value; host.rememberLevel?.(value); refresh(); }, 'chip exam-level-card');
      control.setAttribute('aria-pressed', String(value === level)); control.dataset.examLevel = value; control.dataset.level = value;
      const tests = catalog ? catalog.entries.filter(entry => entry.level === value && entry.availability.ready).length : null;
      const mine = taken.filter(attempt => trackOf(attempt) === value);
      const finished = mine.filter(attempt => attempt.status !== 'in-progress' && attempt.status !== 'abandoned');
      const last = finished.at(-1) && host.selection(finished.at(-1).attemptId)?.score;
      control.dataset.last = last ? 'score' : mine.some(attempt => attempt.status === 'in-progress') ? 'in-progress' : 'none';
      const progress = node('span', 'exam-level-progress');
      progress.style.setProperty('--done', String(tests ? Math.min(1, new Set(finished.map(row => row.form.sha256)).size / tests) : 0));
      control.append(node('span', 'exam-level-name', value),
        node('span', 'exam-level-tests', tests === null ? '' : tx(`テスト ${tests} 本`, `${tests} ${tests === 1 ? 'test' : 'tests'}`)),
        node('span', 'exam-level-last', last ? tx(`前回 ${last.correct}/${last.totalItems}`, `last ${last.correct}/${last.totalItems}`)
          : mine.some(attempt => attempt.status === 'in-progress') ? tx('途中のテストあり', 'one in progress') : tx('まだ受けていません', 'not taken yet')),
        progress);
      control.setAttribute('aria-label', [value, control.querySelector('.exam-level-tests').textContent, control.querySelector('.exam-level-last').textContent].filter(Boolean).join(' · '));
      levels.append(control);
    }
    main.append(levels);
    const lengths = node('div', 'exam-lengths'); lengths.setAttribute('role', 'group'); lengths.setAttribute('aria-label', tx('長さ', 'Test length'));
    for (const value of ['short', 'medium', 'full']) {
      const control = button(tx(...LENGTHS[value]), null, () => { length = value; refresh(); }, 'exam-length');
      control.setAttribute('aria-pressed', String(value === length)); control.dataset.examLength = value;
      control.append(node('span', 'exam-length-time', value === 'short' ? tx('約20分', 'About 20 min') : value === 'medium'
        ? tx('約60分', 'About 60 min') : tx('本番と同じ時間配分', 'Full exam timing'))); lengths.append(control);
    }
    main.append(lengths);
    if (!catalog) {
      main.append(node('p', 'exam-status', failed ? tx('問題\u4E00覧を読み込めませんでした。', 'Couldn’t load the tests.') : tx('読み込み中…', 'Loading tests…')));
      if (failed) main.append(button(tx('再試行', 'Try again'), 'exam-retry', loadCatalog));
      else if (!loading) void loadCatalog();
      return;
    }
    renderOfficial(main);
    const written = catalog.entries.filter(entry => entry.level === level && entry.mode === 'written' && !isOfficial(entry));
    if (written.length) {
      const group = node('section', 'exam-written'); group.dataset.examWritten = level;
      group.append(sectionHeading('筆記テスト', 'Written tests: vocabulary, grammar, reading', '筆記テスト（文字・語彙・文法・読解）'));
      group.append(reviewMark(written[0].review.label, true));
      group.append(node('p', 'exam-status', tx('オリジナル問題です。聴解はありません。出典と確認方法は各テストの下にあります。',
        'Original questions, no listening. Each test lists its sources and how it was checked.')));
      for (const entry of written) renderCard(group, entry, { marked: written.every(row => row.review?.status === 'machine-checked') });
      main.append(group);
    }
    const entries = catalog.entries.filter(entry => entry.level === level && entry.mode === length && !isOfficial(entry));
    const sections = catalog.entries.filter(entry => entry.level === level && entry.mode === 'section' && !isOfficial(entry));
    const levelChecked = catalog.entries.some(entry => entry.level === level && entry.mode !== 'written' && !isOfficial(entry));
    if (levelChecked && !entries.length) main.append(node('p', '', tx('この長さの確認済みテストは、まだありません。', 'No checked test of this length yet.')));
    for (const [index, entry] of [...entries, ...sections].entries()) {
      if (index === entries.length && sections.length) main.append(sectionHeading('分野別の練習', 'Practice by skill'));
      renderCard(main, entry);
    }
    // The older corpus-built sets stay reachable below every level's tests.
    if (!levelChecked || written.length) renderOlderSets(main, written.length > 0);
    const attempts = host.library()?.attempts || [];
    if (attempts.length || host.received?.().length) main.append(button(tx('これまでの結果', 'Test history'), 'exam-history', () => { historyOpen = true; refresh(); }));
    main.append(button(tx('以前の短い練習セット（全レベル）', 'All older practice sets, every level'), 'exam-legacy', () => { legacyOpen = true; refresh(); }));
  }
  // Real JLPT papers the learner imported on this device. Never mixed with the original tests.
  function renderOfficial(main) {
    const group = node('section', 'exam-official'); group.dataset.examOfficial = level;
    group.append(sectionHeading('本物の試験', 'Real JLPT papers, this device only', '本物の試験（この端末だけ）'));
    const imported = catalog.entries.filter(entry => isOfficial(entry) && entry.level === level);
    group.append(node('p', 'exam-status', imported.length
      ? tx('日本語能力試験の公式問題集から、この端末に読み込んだ問題です。個人学習用で、バックアップ・同期・外部のAIには送りません。',
        'Questions from the official JLPT workbooks, imported on this device for personal study. They never go into backups, sync or an outside AI.')
      : tx(`${level}の本物の試験は、まだありません。公式問題集から Mac で作ったファイル（.kairo-private-pack）を読み込むと、この端末だけで使えます。`,
        `No real ${level} paper added yet. Add one from the file you make on your Mac from an official workbook (.kairo-private-pack); it stays on this device.`)));
    for (const entry of imported) renderOfficialCard(group, entry);
    const label = node('label', 'chip exam-official-import');
    label.append(node('span', '', importing ? tx('確認して保存しています…', 'Checking and saving…') : tx('本物の試験を読み込む', 'Import a real test')));
    const input = node('input'); input.type = 'file'; input.multiple = true; input.id = 'exam-official-file';
    input.accept = '.kairo-private-pack,application/json,audio/mpeg,image/jpeg'; input.disabled = importing || !host.importPrivatePack;
    input.className = 'exam-official-file';
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])]; if (!files.length || importing) return;
      importing = true; importNotice = null; refresh();
      const result = await host.importPrivatePack(files);
      importing = false;
      importNotice = { code: result.ok ? 'imported' : `${result.code}:${result.detail || ''}`, text: result.ok ? tx(`「${result.entry.titleJa}」を読み込みました（${result.entry.questionCount}問）。`, `Imported "${result.entry.titleEn}" (${result.entry.questionCount} questions).`)
        : result.code === 'private-pack-changed' ? tx('ファイルの中身が作成時と\u4E00致しません。Macで作り直してください。', 'The file does not match what was built. Rebuild it on your Mac.')
          : result.code === 'private-pack-quota' || result.code === 'private-pack-storage' ? tx('この端末に保存できませんでした。空き容量を確認してください。', 'Couldn’t store it on this device. Check your free space.')
            : tx('本物の試験のファイルとして読めませんでした。', 'That file isn’t a real-test pack.') };
      if (result.ok) { catalog = null; level = result.entry.level || level; }
      refresh();
    });
    label.append(input); group.append(label);
    if (importNotice) {
      const status = node('p', 'exam-status exam-official-notice', importNotice.text); status.setAttribute('role', 'status');
      if (importNotice.code) status.dataset.importCode = importNotice.code;
      group.append(status);
    }
    main.append(group);
  }
  function officialBadge(entry) {
    const badge = node('p', 'exam-official-badge'); badge.lang = 'ja';
    badge.append(node('span', 'exam-official-mark', entry.review.label), node('span', 'exam-official-byline', entry.review.byline || ''));
    return badge;
  }
  function renderOfficialCard(main, entry) {
    const card = node('article', 'exam-form exam-official-form'); card.dataset.examForm = entry.id; card.dataset.officialForm = entry.id;
    card.append(officialBadge(entry), node('h2', '', titleOf(entry)));
    const listeningMinutes = Math.ceil((entry.listeningTiming?.recordedDurationMs || 0) / 60_000);
    card.append(node('p', 'exam-form-meta', tx(`${entry.questionCount}問 · 言語知識・読解 ${entry.durationMinutes - Math.ceil((entry.listeningTiming?.scheduledDurationMs || 0) / 60_000)}分 · 聴解 約${listeningMinutes}分`,
      `${entry.questionCount} questions · language knowledge and reading ${entry.durationMinutes - Math.ceil((entry.listeningTiming?.scheduledDurationMs || 0) / 60_000)} min · listening about ${listeningMinutes} min`)));
    card.append(node('p', 'exam-skills', Object.entries(SKILLS).filter(([skill]) => Number(entry.skillCounts?.[skill]) > 0)
      .map(([, labels]) => tx(...labels)).join(' · ')));
    const start = button(tx('本番と同じ条件で始める', 'Start under exam conditions'), null, () => { confirmation = { kind: 'start', entry }; refresh(); }, 'take');
    start.dataset.examStart = entry.id; start.disabled = host.pending(); card.append(start);
    const remove = button(tx('この端末から削除', 'Remove from this device'), null, () => { confirmation = { kind: 'remove', entry }; refresh(); });
    remove.dataset.officialRemove = entry.id; card.append(remove);
    main.append(card);
  }
  function renderCard(main, entry, { marked = false } = {}) {
    const card = node('article', 'exam-form'); card.dataset.examForm = entry.id;
    card.append(node('h2', '', titleOf(entry)), node('p', 'exam-form-meta',
      tx(`${entry.questionCount}問 · 約${entry.durationMinutes}分`, `${entry.questionCount} questions · about ${entry.durationMinutes} min`)));
    // a section that already says 未確認 in its header does not repeat it on every card
    if (entry.review?.status === 'machine-checked' && !marked) card.append(reviewMark(entry.review.label));
    const papers = entryPapers(entry);
    if (papers.length) card.append(node('p', 'exam-form-timing', tx(
      `本試験と同じ時間割：${papers.map(row => `${row.label} ${row.minutes}分`).join('／')}`,
      `Timed like the real exam: ${papers.map(row => `${row.label} ${row.minutes} min`).join(' / ')}`)));
    else if (entry.review?.status === 'machine-checked') card.append(node('p', 'exam-form-timing', tx(
      `${entry.questionCount}問の練習（模試ではありません）`, `${entry.questionCount}-question practice, not a mock test`)));
    card.append(node('p', 'exam-skills', Object.entries(SKILLS)
      .filter(([skill]) => Number(entry.skillCounts?.[skill]) > 0)
      .map(([, labels]) => tx(...labels)).join(' · ')));
    if (entry.mode === 'section') card.append(node('p', 'exam-status',
      tx('この練習は聴解を含みません。分野ごとの正答数と、復習する内容を確認できます。',
        'Written practice without listening. See your results by skill and what to review next.')));
    if (entry.availability.ready) {
      const start = button(['section', 'written'].includes(entry.mode) ? tx('練習を始める', 'Start practice') : tx('始める', 'Start test'), null, async () => {
        confirmation = { kind: 'start', entry }; refresh();
      }, 'take'); start.dataset.examStart = entry.id; start.disabled = host.pending(); card.append(start);
    } else card.append(node('p', 'exam-status', hasListening(entry)
      ? tx('問題・音声の確認中', 'Question and audio review in progress')
      : tx('問題の確認中', 'Question review in progress')));
    sourceDetails(card, entry); main.append(card);
  }
  function renderConfirmation(main, value) {
    const section = node('section', 'exam-confirm'); section.setAttribute('aria-labelledby', 'exam-confirm-title');
    section.append(node('h2', '', value.kind === 'start' ? titleOf(value.entry) : value.kind === 'remove'
      ? tx('この端末から削除しますか？', 'Remove from this device?') : tx('このパートを終了しますか？', 'Finish this section?')));
    section.firstChild.id = 'exam-confirm-title';
    if (value.kind === 'start' && isOfficial(value.entry)) {
      section.prepend(officialBadge(value.entry));
      section.append(node('p', '', tx('本番と同じ条件で受けます。言語知識・読解は時間を計り、聴解は公式の音声を最初から最後まで\u4E00度だけ続けて流します。聴解の音声は止めたり、戻したり、もう\u4E00度聞いたりできません。',
        'This runs like the real exam: the language-knowledge and reading paper is timed, and the listening plays the official recordings once, straight through. Listening can’t be paused, rewound or replayed.')));
      section.append(node('p', '', tx('結果は、公式の得点区分ごとの正答数で表示します。尺度得点への換算や合否の予測はしません。',
        'Results show your raw correct answers for each official score section. No conversion to a scaled score and no pass prediction.')));
      section.append(node('p', 'exam-download-note', tx('この端末に保存した問題と音声を確認してから計時を始めます。', 'The questions and audio stored on this device are checked before the timer starts.')));
      section.append(button(tx('本番モードで始める', 'Start exam mode'), 'exam-confirm-start', async () => {
        if (!owned()) return; const generation = lifecycle;
        const ok = await host.start(value.entry, 'timed'); if (!alive(generation)) return;
        if (ok) confirmation = null; refresh();
      }, 'take'));
    } else if (value.kind === 'remove') {
      section.prepend(officialBadge(value.entry));
      section.append(node('p', '', tx('この端末から問題と音声を削除します。これまでの結果は残ります。もう\u4E00度使うときは、ファイルを読み込み直してください。',
        'This deletes the questions and audio from this device. Your past results stay. Import the file again to use it.')));
      section.append(button(tx('削除する', 'Remove'), 'exam-confirm-remove', async () => {
        if (!owned()) return; const generation = lifecycle;
        const ok = await host.removePrivatePack?.(value.entry.packId); if (!alive(generation)) return;
        confirmation = null; if (ok) catalog = null;
        importNotice = { code: ok ? 'removed' : 'remove-failed', text: ok ? tx('この端末から削除しました。', 'Removed from this device.') : tx('削除できませんでした。', 'Couldn’t remove it.') };
        refresh();
      }));
    } else if (value.kind === 'start') {
      const writtenSection = ['section', 'written'].includes(value.entry.mode), audio = hasListening(value.entry);
      if (value.entry.review?.status === 'machine-checked') section.append(reviewMark(value.entry.review.label, true));
      if (writtenSection) section.append(node('p', 'exam-scope-note', tx(
        `${value.entry.questionCount}問・${value.entry.durationMinutes}分の短縮練習です。JLPT本試験の全問題・全科目ではありません。${audio ? '' : '聴解は含みません。'}`,
        `${value.entry.questionCount} questions · ${value.entry.durationMinutes} minutes: a shorter practice set, not a complete JLPT examination.${audio ? '' : ' Listening is not included.'}`)));
      // the official papers this test sits (its 試験科目 and their real minutes); a level without them
      // still names the real format, so a short set is never mistaken for the whole examination
      const papers = entryPapers(value.entry);
      if (papers.length) {
        const sitting = node('div', 'exam-papers'); sitting.dataset.examPapers = String(papers.length);
        sitting.append(node('p', '', papers.length > 1
          ? tx(`本試験と同じく、筆記は${papers.length}つの試験科目に分かれています。1つ目が終わると2つ目の時間が始まります。`,
            `As in the real test, the written part is ${papers.length} papers. The second paper's time starts when the first ends.`)
          : tx('本試験と同じ試験科目・時間です。', 'The same paper and time as the real test.')));
        const list = node(papers.length > 1 ? 'ol' : 'ul', 'exam-paper-list');
        for (const row of papers) {
          const line = node('li', ''); line.lang = 'ja';
          line.append(node('span', 'exam-paper-name', row.label), node('span', 'exam-paper-time',
            tx(` ${row.minutes}分 · ${row.questions}問`, ` ${row.minutes} min · ${row.questions} questions`)));
          list.append(line);
        }
        sitting.append(list, node('p', 'exam-paper-note', tx(
          '時間は本試験と同じですが、問題数は本試験のおよそ半分です。聴解はまだありません。',
          'The time is the real test’s; the number of questions is about half the real paper’s. Listening is not included yet.')));
        section.append(sitting);
      } else if (value.entry.level === 'N1') {
        const official = node('p', 'exam-official-format', tx('本試験N1：言語知識・読解110分、聴解55分。',
          'Official N1: Language Knowledge / Reading 110 min; Listening 55 min.'));
        const source = node('a', '', tx('公式の試験構成', 'Official test structure'));
        source.href = 'https://www.jlpt.jp/e/guideline/testsections.html'; source.target = '_blank'; source.rel = 'noopener noreferrer';
        official.append(document.createTextNode(' '), source); section.append(official);
      }
      section.append(node('p', 'exam-study-help', tx(
        '学習モードでは時間制限なし。日本語を押すと読みや意味を確認できます。調べた問題は「助けあり」と保存します。解説は回答後に開けます。',
        'Study mode is untimed. Tap Japanese to see its reading and meaning. Looking up a word marks that question assisted; explanations open after you answer.')));
      section.append(node('p', 'exam-timed-help', tx(
        '本番形式モードでは時間制限があり、辞書・ふりがな・訳・解説は表示しません。終了したパートには戻れません。',
        'Timed exam mode has no dictionary, furigana, translations or explanations. A finished section cannot be reopened.')));
      section.append(node('p', 'exam-bookmark-note', tx(
        '不正解は「あとで見直す」を押さなくても自動保存し、ほかの練習でその語にまた出会えるようにします。「あとで見直す」は目印です。未確認の問題の結果は、仮のものとして区別します。',
        'Wrong answers are saved automatically, even without a bookmark, so those words come back in your other practice. A bookmark is just your reminder. Results from Unreviewed questions are kept apart as provisional.')));
      section.append(node('p', 'exam-download-note', host.pending()
        ? audio ? tx('問題と音声を保存しています…', 'Downloading questions and audio…') : tx('問題を保存しています…', 'Downloading questions…')
        : audio ? tx('始める前に問題と音声を保存します。保存が終わってから計時を始めます。', 'Questions and audio download before the timer starts.')
          : tx('始める前に問題を保存します。保存が終わってから計時を始めます。', 'Questions download before the timer starts.')));
      section.append(button(tx('学習モードで始める', 'Start study mode'), 'exam-practice-start', async () => {
        if (!owned()) return; const generation = lifecycle;
        const ok = await host.start(value.entry, 'practice'); if (!alive(generation)) return;
        if (ok) confirmation = null; refresh();
      }, 'take'));
      section.append(button(tx('本番形式・時間制限あり', 'Start timed exam mode'), 'exam-confirm-start', async () => {
        if (!owned()) return; const generation = lifecycle;
        const ok = await host.start(value.entry, 'timed'); if (!alive(generation)) return;
        if (ok) confirmation = null; refresh();
      }));
    } else if (value.kind === 'stop') {
      section.firstChild.textContent = tx('この模試を中止しますか？', 'Stop this test?');
      section.append(node('p', '', tx('回答は保存します。この結果は弱点の判定やカードの自動追加に使いません。',
        'Your answers will be saved. This stopped test won’t create weakness reports or automatic review cards.')));
      section.append(button(tx('中止する', 'Stop test'), 'exam-confirm-stop', async () => {
        if (await command({ kind: 'abandon' })) { confirmation = null; stopAudio(); refresh(); }
      }));
    } else {
      const selected = selection(), block = selected?.attempt.blocks.find(row => row.blockId === value.blockId);
      const spec = selected?.form.timingBlocks.find(row => row.id === value.blockId);
      const ids = spec?.sectionIds.flatMap(id => selected.form.sections.find(row => row.id === id)?.itemIds || []) || [];
      const left = selected?.attempt.answers.filter(row => ids.includes(row.item.id) && row.response.kind === 'unanswered').length || 0;
      section.append(node('p', '', left ? tx(`${left}問が未回答です。終了すると、このパートの回答は変更できません。`,
        `${left} questions are unanswered. You won’t be able to change this section afterward.`) : tx('終了すると、このパートの回答は変更できません。', 'You won’t be able to change this section afterward.')));
      section.append(button(tx('終了する', 'Finish section'), 'exam-confirm-finish', async () => {
        confirmation = null;
        if (block?.status === 'open') await command({ kind: 'close-block', blockId: value.blockId });
        else refresh();
      }, 'take'));
    }
    section.append(button(tx('戻る', 'Back'), 'exam-confirm-back', () => { confirmation = null; refresh(); }));
    for (const control of section.querySelectorAll('button')) control.disabled = host.pending();
    main.append(section);
  }
  function renderHistory(main) {
    main.append(node('h1', 'view-title', tx('これまでの結果', 'Test history')));
    for (const attempt of [...(host.library()?.attempts || [])].reverse()) {
      const form = host.library().forms.find(row => row.sha256 === attempt.form.sha256);
      const row = button(`${form?.exam.track || ''} · ${new Date(attempt.startedAt).toLocaleDateString()} · ${attempt.status === 'in-progress'
        ? tx('途中', 'In progress') : attempt.status === 'abandoned' ? tx('中断', 'Stopped') : tx('完了', 'Completed')}`, null,
      () => { selectedId = attempt.attemptId; historyOpen = false; refresh(); }, 'entry-row');
      row.dataset.examAttempt = attempt.attemptId; main.append(row);
    }
    const localIds = new Set((host.library()?.attempts || []).map(row => row.attemptId));
    for (const view of host.received?.() || []) {
      if (localIds.has(view.attemptId) || !view.headResults.length || view.projection.tombstones.length) continue;
      const section = node('section', 'exam-received');
      if (view.projection.requiresChoice || view.headResults.length !== 1) {
        section.append(node('p', '', tx('別の端末から異なる結果が届きました。確認が済むまで学習に反映しません。',
          'Different versions arrived from another device. These results won’t guide learning until the conflict is resolved.')));
      } else {
        const result = view.headResults[0].payload;
        section.append(node('h2', '', tx('別の端末での結果', 'Result from another device')),
          node('p', '', new Date(result.endedAt).toLocaleDateString()));
        if (result.outcome === 'abandoned') section.append(node('p', '', tx('中断した模試', 'Test stopped')));
        else section.append(node('p', '', tx(`保存された結果：${result.items.filter(row => row.result === 'correct').length} / ${result.items.length}問正解`,
          `Saved result: ${result.items.filter(row => row.result === 'correct').length} of ${result.items.length} correct`)));
      }
      main.append(section);
    }
    if (host.reconciliation?.()?.state === 'pending') main.append(node('p', '', tx('\u4E00部の結果は、対応する問題を読み込んでから復習に反映します。',
      'Some results are waiting for their question pack before review cards can be prepared.')));
    main.append(button(tx('模試に戻る', 'Back to tests'), 'exam-history-back', () => { historyOpen = false; refresh(); }));
  }
  async function finishAudio(selected, media, element, key, generation, epoch) {
    const continuing = () => alive(generation) && epoch === playbackEpoch;
    if (!continuing() || activeAudio !== element || audioKey !== key) return;
    advancingAudio = true; audioLoading = true;
    try {
      if (!await audioFact(selected.attempt.attemptId, media.id, 'ended', media.durationMs, generation)) return;
      const current = selection();
      if (!continuing() || !current || current.attempt.status !== 'in-progress' || current.attempt.clock.interrupted) return;
      if (current.attempt.mode !== 'timed') return;
      const next = nextUnit(current);
      if (!next) return;
      if (!next.itemIds.includes(current.attempt.cursor.itemId) &&
          !await command({ kind: 'visit', itemId: next.itemIds[0] }, true)) return;
      if (!continuing()) return;
      const updated = selection();
      const nextMedia = updated.form.media.find(row => row.sha256 === next.media.sha256);
      await playAudio(updated, nextMedia, { automatic: true });
    } finally {
      if (continuing()) { advancingAudio = false; audioLoading = false; refresh(); }
    }
  }
  async function playAudio(selected, media, { automatic = false } = {}) {
    if (!owned() || (audioLoading && !automatic) || host.pending() || !media) return;
    const pendingUnit = nextUnit(selected);
    if (selected.attempt.mode === 'timed' && pendingUnit?.media.sha256 !== media.sha256) return;
    const generation = lifecycle, epoch = playbackEpoch;
    const continuing = () => alive(generation) && epoch === playbackEpoch;
    audioLoading = true; notice = null;
    try {
      if (!automatic && !await resumeAttempt(generation)) { stopAudio(); return; }
      if (!continuing() || selection()?.attempt.clock.interrupted) return;
      const key = `${selected.attempt.attemptId}:${media.sha256}`;
      if (key !== audioKey) {
        if (!automatic) await suspendAudio();
        if (!continuing()) return;
        // Keep the same element across the fixed listening sequence so WebKit
        // retains the user's playback grant. Blob bytes are never reread.
        activeAudio ||= new Audio();
        const bytes = await verifiedBytes(selected, media);
        if (!continuing() || selection()?.attempt.attemptId !== selected.attempt.attemptId) return;
        activeAudio.onended = null; activeAudio.onerror = null; activeAudio.pause();
        const oldUrl = audioUrl;
        const source = await mediaSource(bytes, media.mimeType);
        if (!continuing()) { URL.revokeObjectURL(source); return; }
        audioUrl = source;
        activeAudio.src = audioUrl; audioKey = key;
        if (oldUrl) URL.revokeObjectURL(oldUrl);
      }
      if (!continuing() || !activeAudio) return;
      // A resumed element needs handlers for this playback generation, including
      // when its verified source and the native element can be reused.
      const element = activeAudio;
      element.preload = 'auto';
      element.onended = () => { void finishAudio(selected, media, element, key, generation, epoch).catch(error => {
        if (continuing()) { host.onMediaError?.(error); notice = tx('音声が中断しました。再生を再開してください。', 'Audio paused. Resume playback to continue.'); refresh(); }
      }); };
      element.onerror = () => {
        if (continuing() && activeAudio === element && audioKey === key)
          void audioFact(selected.attempt.attemptId, media.id, 'error', element.currentTime * 1000, generation);
      };
      const playback = selection()?.attempt.audio.find(row => row.media.id === media.id);
      const replay = playback?.status === 'ended';
      const position = replay ? 0 : playback?.positionMs || 0;
      if (!await audioFact(selected.attempt.attemptId, media.id, replay ? 'replay' : 'start', position, generation)) return;
      if (!continuing() || !activeAudio) return;
      // A successful persistence transaction can close an expired block instead
      // of accepting its requested audio start. Recheck the committed state.
      const committed = selection();
      if (!committed || committed.attempt.attemptId !== selected.attempt.attemptId ||
          committed.attempt.status !== 'in-progress' || committed.attempt.clock.interrupted ||
          committed.attempt.audio.find(row => row.media.id === media.id)?.status !== 'playing' ||
          !blockUnits(committed).some(unit => unit.media.sha256 === media.sha256)) {
        stopAudio(); return;
      }
      activeAudio.currentTime = position / 1000; await activeAudio.play();
    } catch (error) {
      if (!continuing()) return;
      host.onMediaError?.(error);
      if (activeAudio && audioKey === `${selected.attempt.attemptId}:${media.sha256}`)
        await audioFact(selected.attempt.attemptId, media.id, 'error', activeAudio.currentTime * 1000, generation);
      if (automatic && continuing()) await command({ kind: 'interruption', reason: 'audio-autoplay-blocked' }, true);
      if (alive(generation)) { notice = tx('音声が中断しました。再生を再開してください。', 'Audio paused. Resume playback to continue.'); refresh(); }
    } finally { if (continuing()) { audioLoading = false; refresh(); } }
  }
  function renderAudio(main, selected, media, example = false) {
    const playback = selected.attempt.audio.find(row => row.media.id === media.id);
    const played = !!playback?.starts, finished = playback?.status === 'ended';
    const playingHere = playback?.status === 'playing' && audioKey === `${selected.attempt.attemptId}:${media.sha256}` && activeAudio && !activeAudio.paused;
    const next = nextUnit(selected);
    const play = button(playingHere ? tx('再生中', 'Playing') : audioLoading ? tx('音声を準備中…', 'Loading audio…') : finished ? tx('もう\u4E00度聴く', 'Play again') : played
      ? tx('音声を続ける', 'Resume audio') : tx('音声を再生', 'Play audio'), example ? 'exam-example-audio-play' : 'exam-audio-play', () => playAudio(selected, media));
    play.disabled = !owned() || host.pending() || audioLoading || playingHere ||
      (selected.attempt.mode === 'timed' && (finished || next?.media.sha256 !== media.sha256));
    main.append(play, node('p', 'exam-audio-status', selected.attempt.mode === 'timed'
      ? tx('音声は順番に、\u4E00度ずつ続けて流れます。', 'Recordings play in order, once each, without pauses between them.')
      : tx('音量を確認してから再生してください。', 'Check your volume before playing.')));
  }
  // The printed page for checking the typed question against the paper.
  function renderOfficialPages(main, selected, itemId) {
    const details = node('details', 'exam-official-pages'); details.dataset.officialPages = itemId;
    details.append(node('summary', '', tx('原本のページを見る', 'See the printed page')));
    const generation = lifecycle;
    details.addEventListener('toggle', () => {
      if (!details.open || details.dataset.loaded) return;
      details.dataset.loaded = 'true';
      void host.officialPages(selected, itemId).then(pages => {
        if (!alive(generation) || !details.isConnected) return;
        if (!pages.length) details.append(node('p', 'exam-status', tx('この問題のページはありません。', 'No page is stored for this question.')));
        for (const page of pages) {
          const url = URL.createObjectURL(page.blob); pageUrls.add(url);
          const image = node('img', 'exam-official-page'); image.src = url; image.alt = tx(`原本 ${page.sheet}`, `Printed page ${page.sheet}`);
          details.append(image);
        }
      }).catch(() => { if (details.isConnected) details.append(node('p', 'exam-status', tx('ページを読み込めませんでした。', 'Couldn’t load the page.'))); });
    });
    main.append(details);
  }
  function renderLeaveControls(main) {
    const controls = node('div', 'exam-leave-controls');
    controls.append(button(tx('中断して保存', 'Save and leave'), 'exam-leave', async () => {
      await suspendAudio();
      if (await command({ kind: 'interruption', reason: 'user-pause' })) { stopAudio(); resumeOnEntry = true; host.leave(); }
    }));
    controls.append(button(tx('ここで終了', 'Stop here'), 'exam-stop', () => { confirmation = { kind: 'stop' }; refresh(); }));
    main.append(controls);
  }
  async function preparePresentation(selected) {
    if (deliveryLoading || !owned()) return;
    const generation = lifecycle; deliveryLoading = true;
    try {
      const media = selected.form.media.find(row => row.kind === 'audio');
      if (media) await verifiedBytes(selected, media);
      if (alive(generation) && !host.delivery?.(selected)) throw new Error('assessment-delivery-unavailable');
    } catch (error) {
      if (alive(generation)) { deliveryFailures.add(selected.form.sha256); host.onMediaError?.(error); }
    } finally { if (alive(generation)) { deliveryLoading = false; refresh(); } }
  }
  // The review wording comes from this attempt's own editorial record, never a fixed label.
  function explanationProvenance(status) {
    return status === 'ai-reviewed-full' ? tx('AIモデルが確認した解説です。人による確認はまだです。', 'Checked by AI models; not yet reviewed by a person.')
      : status === 'ai-reviewed-practice' ? tx('練習用としてAIモデルが確認した解説です。人による確認はまだです。', 'Checked by AI models for practice; not yet reviewed by a person.')
        : tx('この解説は、まだ確認されていません。', 'This explanation hasn’t been checked yet.');
  }
  // Machine-checked forms: the class label and this question's author and verifier families.
  function questionProvenance(selected, itemId) {
    const label = selected && host.machineCheckLabel?.(selected);
    if (!label) return [];
    const check = host.itemCheck?.(selected, itemId);
    if (!check) { host.ensureDelivery?.(selected); return [reviewMark(label)]; }
    const line = node('p', 'exam-item-provenance', tx(
      `この問題：作成 ${familyName(check.author)}・検証 ${check.verifiers.join('／')}（${check.agreed}/${check.verifiers.length} \u4E00致）`,
      `This question: written by ${familyName(check.author)}, checked by ${check.verifiers.join(', ')} (${check.agreed}/${check.verifiers.length} agreed)`));
    line.dataset.itemProvenance = itemId;
    return [reviewMark(label), line];
  }
  function closeWhy() { whyOpenItemId = null; focusAfterRender = '#exam-why'; refresh(); }
  async function openWhy(itemId) {
    const current = selection();
    const answer = current?.attempt.answers.find(row => row.item.id === itemId);
    if (!current || current.attempt.status !== 'in-progress' || !answer) return;
    if (!answer.assistance) {
      // durable before reveal: the key appears only once the mark is saved
      if (!await command({ kind: 'assistance', itemId, reason: 'explanation' })) return;
      if (!selection()?.attempt.answers.find(row => row.item.id === itemId)?.assistance) return;
    }
    whyOpenItemId = itemId; focusAfterRender = '#exam-why-title'; refresh();
  }
  function renderWhySheet(main, explanation, selected, question) {
    const sheet = node('section', 'exam-why-sheet'); sheet.id = 'exam-why-sheet';
    sheet.setAttribute('role', 'region'); sheet.setAttribute('aria-labelledby', 'exam-why-title');
    const title = node('h2', '', tx('解説', 'Explanation')); title.id = 'exam-why-title'; title.tabIndex = -1;
    const rule = node('p', 'exam-rationale');
    appendText(rule, explanation.rule || tx('この問題の解説はまだありません。', 'No explanation has been written for this question yet.'), selected, question.id, 'explanation');
    if (explanation.rule) rule.lang = 'ja';
    const verdict = node('p', 'exam-why-verdict', explanation.verdict === 'correct' ? tx('正解。', 'Correct.') : tx('不正解。', 'Incorrect.'));
    verdict.dataset.verdict = explanation.verdict;
    const chosen = node('p', '', `${tx('あなたの回答', 'Your answer')}: `);
    appendText(chosen, explanation.chosen.text, selected, question.id, 'choice');
    const key = node('p', '', `${tx('正解', 'Correct answer')}: `);
    appendText(key, explanation.key.text, selected, question.id, 'choice');
    sheet.append(title, verdict, chosen, key, rule,
      node('p', 'exam-why-absent', tx('ほかの選択肢が違う理由は、まだ書かれていません。', 'Why the other choices are wrong hasn’t been written yet.')),
      // a machine-checked form names its own class and checks instead of the generic AI line
      ...(host.machineCheckLabel?.(selection()) ? questionProvenance(selection(), explanation.itemId)
        : [node('p', 'exam-why-provenance', explanationProvenance(explanation.editorial))]),
      button(tx('閉じる', 'Close'), 'exam-why-close', closeWhy));
    sheet.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeWhy(); } });
    main.append(sheet);
  }
  // Untimed practice only, after a committed selected answer. Timed attempts get no door at all.
  function renderWhy(main, selected, question, answer) {
    if (selected.attempt.mode !== 'practice' || question.response.kind !== 'selected' ||
        (!answer.assistance && answer.response.kind !== 'selected')) return;
    const line = node('p', 'exam-why');
    if (answer.assistance) {
      const locked = node('span', 'exam-why-locked', tx('助けあり · 解説を見たので、この回答は確定しています', 'Assisted · you opened the explanation, so this answer is locked'));
      locked.id = 'exam-why-locked'; line.append(locked);
    }
    const door = button(answer.assistance ? tx('解説をもう\u4E00度見る', 'See the explanation again') : tx('なぜ？— 解説を見る', 'Why? — See the explanation'),
      'exam-why', () => openWhy(question.id), 'chip exam-why-door');
    door.disabled = host.pending(); line.append(door);
    if (!answer.assistance) {
      const cost = node('span', 'exam-why-cost', tx('見ると、この回答は確定し「助けあり」になります', 'Opening it locks this answer and marks it assisted'));
      cost.id = 'exam-why-cost'; door.setAttribute('aria-describedby', 'exam-why-cost'); line.append(cost);
    }
    main.append(line);
    const explanation = whyOpenItemId === question.id && answer.assistance
      ? host.explanation?.(selected.attempt.attemptId, question.id) : null;
    if (explanation) renderWhySheet(main, explanation, selected, question);
  }
  function renderScoreSections(main, selected, facts, assistedItem) {
    const { form, score } = selected;
    const rows = officialSectionResults(facts, form, score.items);
    // its own class: .exam-official / data-exam-official name the room's real-paper import group
    const box = node('section', 'exam-official-results'); box.dataset.examOfficialResults = form.exam.track;
    box.append(node('h2', 'exam-official-title', tx('得点区分別の結果（素点）', 'By official score section (raw count)')));
    for (const row of rows) {
      const part = node('div', 'exam-official-row'); part.dataset.scoreSection = row.id;
      const label = node('p', 'exam-official-label', paperLabel(row.label)); label.lang = host.english() ? 'en' : 'ja';
      const helped = score.items.filter(item => row.skills.includes(item.skill) && assistedItem(item.itemId)).length;
      const spent = minutes(score.items.filter(item => row.skills.includes(item.skill)).reduce((n, item) => n + item.elapsedMs, 0));
      const raw = node('p', 'exam-official-raw', row.total
        ? tx(`${row.correct} / ${row.total} 問正解${helped ? `（助けあり ${helped}）` : ''} · ${spent}分`,
          `${row.correct} of ${row.total} correct${helped ? ` (${helped} assisted)` : ''} · ${spent} min`)
        : tx('この練習にはありません', 'Not in this practice'));
      raw.dataset.raw = row.total ? `${row.correct}/${row.total}` : 'none';
      const fact = node('p', 'exam-official-fact', tx(
        `本試験：尺度得点 ${row.range[0]}〜${row.range[1]}点 · 基準点 ${row.sectionalMinimum}点`,
        `Real test: scaled ${row.range[0]}–${row.range[1]} · sectional minimum ${row.sectionalMinimum}`));
      part.append(label, raw, fact);
      if (row.byTask.length) {
        const list = node('ul', 'exam-official-daimon');
        for (const entry of row.byTask) {
          const line = node('li', ''); line.dataset.task = entry.task;
          const title = node('span', 'exam-daimon-name', tx(...(DAIMON[entry.task] || [entry.task, entry.task]))); title.lang = host.english() ? 'en' : 'ja';
          line.append(title, node('span', 'exam-daimon-count', ` ${entry.correct}/${entry.total}`));
          list.append(line);
        }
        part.append(list);
      }
      box.append(part);
    }
    const ranges = facts.sections.every(row => row.range[1] === 60) ? tx('各0〜60点', 'each 0–60')
      : facts.sections.map(row => `${paperLabel(row.label)} ${row.range[0]}–${row.range[1]}`).join(tx('、', ', '));
    box.append(node('p', 'exam-official-pass', tx(
      `本試験の合格点は ${facts.passMark}点（0〜180点）で、すべての得点区分が基準点以上であることも必要です。`,
      `The real test's pass mark is ${facts.passMark} of 180, and every score section must also reach its minimum.`)),
    node('p', 'exam-official-note', tx(
      `本試験の得点は項目応答理論による尺度得点（${ranges}）で、素点からは換算できません。この結果は合否の予測ではありません。`,
      `Real scores are scaled by item response theory (${ranges}); a raw count cannot be converted into them. This is not a pass prediction.`)));
    main.append(box);
  }
  function renderQuestion(main, selected) {
    const { form, attempt } = selected;
    main.dataset.examMode = attempt.mode;
    const block = attempt.blocks.find(row => row.status === 'open');
    // the level the paper is at stands in its own colour at the head of the sheet (FEEL pass
    // 2026-10-02: "the level displayed on each screen"); the heading's words are unchanged
    const heading = node('h1', 'exam-heading');
    const track = String(form.exam.track || '');
    const trackChip = node('span', /^N[1-5]$/u.test(track) ? 'level-chip exam-level-chip' : 'exam-level-text', track);
    if (/^N[1-5]$/u.test(track)) trackChip.dataset.level = track;
    heading.append(trackChip, ` ${form.scope === 'full-candidate' ? tx('模試', 'mock test') : tx('練習', 'practice')}`);
    main.append(heading);
    main.append(node('p', 'exam-mode-badge', attempt.mode === 'practice'
      ? tx('学習モード · 辞書と読みの確認', 'Study mode · lookup available')
      : tx('本番形式 · 時間制限あり · ヒントなし', 'Timed exam mode · no hints')));
    if (form.scope !== 'full-candidate') main.append(node('p', 'exam-scope-note', tx(
      `${form.items.length}問の短縮練習 · 本試験の全科目ではありません`,
      `${form.items.length}-question practice set · not a complete JLPT examination`)));
    const machineLabel = host.machineCheckLabel?.(selected);
    if (machineLabel) main.append(reviewMark(machineLabel));
    const official = officialOf(selected);
    if (official) main.append(officialBadge(official));
    if (!block) {
      const pending = attempt.blocks.find(row => row.status === 'pending');
      main.append(node('p', '', tx('このパートは終了しました。準備ができたら次のパートへ進んでください。',
        'This section is finished. Start the next section when you’re ready.')));
      const nextPaper = pending && paperName(selected, pending.blockId);
      if (nextPaper && paperMode(selected)) {
        const spec = form.timingBlocks.find(row => row.id === pending.blockId);
        const line = node('p', 'exam-next-paper', tx(`次の試験科目：${nextPaper}（${minutes(spec.durationMs)}分）`,
          `Next paper: ${nextPaper} (${minutes(spec.durationMs)} min)`)); line.dataset.examNextPaper = spec.authority.blockId;
        main.append(line);
      }
      if (pending) main.append(button(tx('次のパートを始める', 'Start next section'), 'exam-next-block', () => command({ kind: 'start-next-block' }), 'take'));
      return;
    }
    const question = form.items.find(row => row.id === attempt.cursor.itemId);
    const answer = attempt.answers.find(row => row.item.id === question?.id);
    const spec = form.timingBlocks.find(row => row.id === block.blockId);
    const ids = spec.sectionIds.flatMap(id => form.sections.find(row => row.id === id).itemIds);
    const index = ids.indexOf(question?.id);
    const top = node('div', 'exam-progress');
    top.append(node('span', '', tx(`${index + 1} / ${ids.length} 問`, `Question ${index + 1} of ${ids.length}`)));
    const timer = node('span', 'exam-timer', attempt.mode === 'timed' ? clockText(host.remaining(selected)) : tx('時間制限なし', 'Untimed'));
    timer.id = 'exam-timer'; top.append(timer); main.append(top);
    const save = node('p', 'exam-save', host.pending() ? tx('保存中…', 'Saving…') : tx('保存済み', 'Saved'));
    save.setAttribute('role', 'status'); main.append(save);
    if (!question) return;
    if (question.skill === 'listening' && !host.delivery?.(selected)) {
      const failed = deliveryFailures.has(form.sha256);
      main.append(node('p', 'exam-status', failed
        ? tx('音声の準備を確認できませんでした。', 'Couldn’t load the listening instructions.')
        : tx('音声の準備を確認しています…', 'Loading listening instructions…')));
      if (failed) main.append(button(tx('再試行', 'Try again'), 'exam-delivery-retry', () => {
        deliveryFailures.delete(form.sha256); void preparePresentation(selected);
      }));
      else if (!deliveryLoading) void preparePresentation(selected);
      renderLeaveControls(main); return;
    }
    const pending = nextUnit(selected);
    const example = attempt.mode === 'timed' && pending?.kind === 'example' ? pending
      : deliveryUnits(selected).find(unit => unit.kind === 'example' && unit.itemIds.includes(question.id) &&
        attempt.audio.find(row => row.media.sha256 === unit.media.sha256)?.status !== 'ended');
    if (example) {
      top.firstChild.textContent = tx('説明と例題・採点なし', 'Instructions and example · not scored');
      main.append(node('h2', 'exam-example-title', tx('聞き方を確認しよう', 'Listen to the instructions and example')),
        node('p', 'exam-instruction', tx('例題が終わると、最初の問題が表示されます。', 'The first question appears when the example finishes.')));
      renderAudio(main, selected, form.media.find(row => row.sha256 === example.media.sha256), true);
      renderLeaveControls(main); return;
    }
    // One sheet for every form. A machine-checked JLPT form sits the real paper on it: the official
    // 試験科目 name, 問題 numbers and item numbers that restart with each paper, the official
    // instruction wording, underlined targets, blanks, ★ and numbered gaps. A real paper imported
    // on this device prints its own section title and text with their printed marks. Other forms
    // keep their retained instruction line and whole-form numbering.
    const level = form.exam.track;
    const place = paperMode(selected) ? paperLayout(form, block.blockId).byItem.get(question.id) || null : null;
    const layout = assessmentQuestionLayout(form, question);
    const write = role => (into, text, stop) => appendText(into, text, selected, question.id, role, stop);
    const paper = node('article', 'exam-paper'); paper.lang = 'ja';
    paper.setAttribute('aria-labelledby', 'exam-task-title'); main.append(paper);
    const paperHeader = node('header', 'exam-paper-header');
    const skillHeading = node('p', 'exam-skill');
    appendText(skillHeading, (place && paperName(selected, block.blockId)) || (question.skill === 'listening' ? tx('聴解', 'Listening')
      : ['N1', 'N2'].includes(level) ? paperLabel('言語知識（文字・語彙・文法）・読解')
        : tx(...(SKILLS[question.skill] || [question.skill,question.skill]))), selected, question.id, 'instruction'); paperHeader.append(skillHeading);
    const taskHeading = node('h2', 'exam-task-heading'); taskHeading.lang = host.english() ? 'en' : 'ja';
    const printed = official ? form.sections.find(row => row.itemIds.includes(question.id)) : null;
    if (place) {
      taskHeading.dataset.mondai = String(place.group.mondai); taskHeading.dataset.task = place.group.task;
      const number = node('span', 'exam-mondai-no');
      taskHeading.append(number, document.createTextNode('\u3000'));
      write('instruction')(number, tx(mondaiLabel(level, place.group.mondai), `Question ${place.group.mondai}`), taskHeading);
      const name = node('span', 'exam-daimon');
      taskHeading.append(name);
      write('instruction')(name, tx(...(DAIMON[place.group.task] || SKILLS[question.skill] || [question.task,question.task])), taskHeading);
    } else {
      const number = printed ? spec.sectionIds.indexOf(printed.id) + 1 : layout.group;
      const task = tx(...(DAIMON[question.task] || SKILLS[question.skill] || [question.task,question.task]));
      appendText(taskHeading, `${tx(`問題 ${number}`, `Question ${number}`)}\u3000${task}`, selected, question.id, 'instruction');
    }
    taskHeading.id = 'exam-task-title'; paperHeader.append(taskHeading);
    const officialLine = place ? officialInstruction(level, place.group.task, { passages: place.group.passageIds.length,
      ...(place.group.gaps ? { first: place.group.numbers[0], last: place.group.numbers.at(-1) } : {}) }) : null;
    if (printed) {
      const instruction = textNode('p', 'exam-task-instruction exam-official-instruction', printed.title, true); instruction.lang = 'ja'; instruction.dataset.uiContent = 'learning';
      paperHeader.append(instruction);
    } else if (officialLine) {
      const instruction = node('p', 'exam-task-instruction exam-mondai-instruction');
      instruction.dataset.uiContent = 'learning';
      appendSegments(instruction, officialLine, null, write('instruction')); paperHeader.append(instruction);
    } else if (layout.instruction && !official && (!place || paperStemDropsLine(question))) {
      const instruction = node('p', 'exam-task-instruction');
      instruction.dataset.uiContent = 'learning';
      appendText(instruction, layout.instruction, selected, question.id, 'instruction'); paperHeader.append(instruction);
    }
    paper.append(paperHeader);
    for (const reference of question.passages) {
      const passage = form.passages.find(row => row.sha256 === reference.sha256);
      const text = node('section', 'exam-passage'); text.lang = 'ja';
      if (place && ['short-reading', 'mid-reading'].includes(place.group.task) && place.group.passageIds.length > 1)
        text.append(node('p', 'exam-passage-label', `（${place.group.passageIds.indexOf(reference.id) + 1}）`));
      if (passage?.title) {
        const heading = official ? textNode('h3', '', passage.title, true) : node('h3', '');
        heading.dataset.uiContent = 'learning';
        if (!official) appendText(heading, passage.title, selected, question.id, 'passage'); text.append(heading);
      }
      // a real paper keeps its printed underlines, ruby and boxed numbers
      const body = official ? textNode('p', '', passage?.text || '', true) : node('p', '');
      if (!official && place?.group.gaps) appendSegments(body, paperSegments(passage?.text || '', { gaps: place.group.gaps }), place.number, write('passage'));
      else if (!official) appendText(body, passage?.text || '', selected, question.id, 'passage');
      text.append(body); paper.append(text);
    }
    // A real paper's prompt opens with its own printed number box; the sheet adds none.
    const prompt = official ? textNode('p', 'mock-question exam-prompt', question.prompt, true)
      : node('p', place ? 'mock-question exam-prompt exam-paper-question' : 'mock-question exam-prompt');
    prompt.lang = 'ja';
    if (!official) prompt.append(node('span', 'exam-question-number', String(place ? place.number : layout.number)));
    if (place) { prompt.dataset.paperNumber = String(place.number); appendSegments(prompt, paperStem(question), null, write('prompt')); }
    else if (!official) questionText(prompt, layout.text, selected, question.id, 'prompt');
    paper.append(prompt);
    if (attempt.mode === 'practice' && host.english() && question.translatedInstruction)
      paper.append(node('p', 'exam-instruction', question.translatedInstruction));
    for (const reference of question.media) {
      const media = form.media.find(row => row.sha256 === reference.sha256);
      if (media?.kind === 'audio') {
        if (deliveryUnits(selected).find(unit => unit.media.sha256 === media.sha256)?.kind !== 'example')
          renderAudio(main, selected, media);
      } else if (media?.kind === 'image') {
        const image = node('img', 'exam-image'); image.alt = media.alt; main.append(image);
        if (imageUrls.has(media.sha256)) image.src = imageUrls.get(media.sha256);
        else { const generation = lifecycle; void verifiedBytes(selected, media).then(async bytes => {
          if (!alive(generation)) return;
          const source = await mediaSource(bytes, media.mimeType);
          if (!alive(generation) || imageUrls.has(media.sha256)) { URL.revokeObjectURL(source); return; }
          imageUrls.set(media.sha256, source);
          if (image.isConnected) image.src = imageUrls.get(media.sha256);
        }).catch(() => { if (alive(generation) && image.isConnected) image.replaceWith(node('p', 'exam-notice', tx('画像を読み込めませんでした。', 'Couldn’t load the image.'))); }); }
      }
    }
    if (question.response.kind === 'selected') {
      const options = node('div', 'mock-opts'); options.setAttribute('role', 'group'); options.setAttribute('aria-label', tx('解答', 'Answer choices'));
      // short choices print across the page, as on the paper
      if (paperMode(selected) && question.response.options.every(option => [...option.text].length <= 9)) options.classList.add('exam-opts-row');
      question.response.options.forEach((option, number) => {
        const unit = deliveryUnits(selected).find(row => row.kind === 'question' && row.itemIds.includes(question.id));
        const audioOnly = question.skill === 'listening' && (!unit || !unit.printedOptions || !!unit.spokenOptionItemIds?.includes(question.id));
        const lookupChoice = attempt.mode === 'practice' && !audioOnly && !official && !!host.appendLookupText;
        const control = button(audioOnly || lookupChoice ? String(number + 1) : official ? `${number + 1}\u3000` : `${number + 1}\u3000${option.text}`, null, () => {
          // keep keyboard focus on the chosen option across the re-render (one Tab then reaches the why-door)
          focusAfterRender = `[data-exam-option="${CSS.escape(option.id)}"]`;
          return command({ kind: 'answer', itemId: question.id, response: { kind: 'selected', optionId: option.id } });
        }, lookupChoice ? 'mock-opt exam-option-number' : 'mock-opt');
        if (official && !audioOnly) control.append(paperNodes(option.text));
        control.lang = 'ja'; control.dataset.uiContentValue = option.text; control.dataset.examOption = option.id;
        control.setAttribute('aria-pressed', String(answer.response.kind === 'selected' && answer.response.optionId === option.id));
        control.disabled = host.pending() || !!answer.assistance;
        if (lookupChoice) {
          control.setAttribute('aria-label', tx(`回答 ${number + 1}: ${option.text}`, `Answer ${number + 1}: ${option.text}`));
          const row = node('div', 'exam-option-row'); row.dataset.selected = control.getAttribute('aria-pressed');
          const text = node('span', 'exam-option-text'); text.dataset.uiContent = 'learning';
          appendText(text, option.text, selected, question.id, 'choice'); row.append(control, text); options.append(row);
        } else options.append(control);
      });
      if (answer.assistance) options.setAttribute('aria-describedby', 'exam-why-locked');
      if (attempt.mode === 'practice') paper.append(node('p', 'exam-study-help', tx(
        '番号を押して回答。日本語を押すと読みと意味を確認できます。',
        'Select a number to answer. Tap Japanese to look up its reading and meaning.')));
      paper.append(options);
    }
    if (!answer.assistance && host.assistance?.(selected, question.id)) main.append(node('p', 'exam-lookup-assisted', tx(
      '助けあり · 辞書を使った問題です。回答は変更できます。', 'Assisted · dictionary used on this question. You can still change your answer.')));
    renderWhy(main, selected, question, answer);
    if (official && host.officialPages) renderOfficialPages(main, selected, question.id);
    const flag = button(answer.flagged ? tx('目印を外す', 'Remove bookmark') : tx('あとで見直す', 'Bookmark for later'), 'exam-flag',
      () => command({ kind: 'flag', itemId: question.id, flagged: !answer.flagged }));
    flag.setAttribute('aria-pressed', String(answer.flagged)); flag.disabled = host.pending(); main.append(flag);
    main.append(node('p', 'exam-bookmark-note', tx('不正解は目印なしでも、終了時に自動保存されます。',
      'Wrong answers are saved automatically when you finish, with or without a bookmark.')));
    const nav = node('div', 'mock-nav');
    if (index > 0) { const previous = button(tx('前へ', 'Previous'), 'exam-prev', () => command({ kind: 'visit', itemId: ids[index - 1] })); previous.dataset.examVisit = ids[index - 1]; nav.append(previous); }
    if (index + 1 < ids.length) { const next = button(tx('次へ', 'Next'), 'exam-next', () => command({ kind: 'visit', itemId: ids[index + 1] }), 'take'); next.dataset.examVisit = ids[index + 1]; nav.append(next); }
    else nav.append(button(tx('このパートを終了', 'Finish section'), 'exam-finish-block', () => { confirmation = { kind: 'finish', blockId: block.blockId }; refresh(); }, 'take'));
    for (const control of nav.querySelectorAll('button')) control.disabled = host.pending() || advancingAudio ||
      (!!control.dataset.examVisit && !canVisit(selected, control.dataset.examVisit)) ||
      (control.id === 'exam-finish-block' && attempt.mode === 'timed' && !!nextUnit(selected)); main.append(nav);
    const map = node('details', 'exam-question-map'); map.append(node('summary', '', tx('解答\u4E00覧・見直し', 'All questions and your bookmarks')));
    const grid = node('div', 'exam-question-grid');
    ids.forEach((id, i) => {
      const saved = attempt.answers.find(row => row.item.id === id);
      const control = button(`${i + 1}${saved.flagged ? ' ⚑' : saved.response.kind !== 'unanswered' ? ' ✓' : ''}${saved.assistance ? ' 助' : ''}`, null,
        () => command({ kind: 'visit', itemId: id }));
      control.setAttribute('aria-label', tx(`${i + 1}問目${saved.flagged ? '、要見直し' : ''}${saved.assistance ? '、助けあり' : ''}`,
        `Question ${i + 1}${saved.flagged ? ', flagged' : ''}${saved.assistance ? ', assisted' : ''}`));
      control.dataset.examVisit = id;
      control.disabled = host.pending() || advancingAudio || !canVisit(selected, id); grid.append(control);
    }); map.append(grid); main.append(map);
    renderLeaveControls(main);
  }
  // Raw correct answers per official score section, beside the published pass marks. No conversion.
  function renderOfficialSections(main, entry, score) {
    const table = node('section', 'exam-official-sections'); table.setAttribute('aria-labelledby', 'exam-official-sections-title');
    const heading = node('h2', '', tx('得点区分ごとの正答数', 'Correct answers by official score section')); heading.id = 'exam-official-sections-title';
    table.append(heading);
    const list = node('dl', 'exam-official-section-list');
    for (const section of entry.officialSections) {
      const rows = score.items.filter(row => section.skills.includes(row.skill));
      const correct = rows.filter(row => row.result === 'correct').length;
      const item = node('div'); item.dataset.officialSection = section.id;
      item.append(node('dt', '', tx(section.titleJa, section.titleEn)),
        node('dd', 'exam-official-raw', tx(`${correct} / ${rows.length} 問正解`, `${correct} of ${rows.length} correct`)),
        node('dd', 'exam-official-mark', tx(`基準点 ${section.sectionMinimum}点（${section.scaledRange[0]}〜${section.scaledRange[1]}点の尺度得点）`,
          `Sectional minimum ${section.sectionMinimum} (on a ${section.scaledRange[0]}–${section.scaledRange[1]} scaled score)`)));
      list.append(item);
    }
    table.append(list);
    if (entry.passMark) table.append(node('p', 'exam-official-pass', tx(`合格点 ${entry.passMark.total}点 / ${entry.passMark.maximum}点（尺度得点の合計）`,
      `Pass mark ${entry.passMark.total} of ${entry.passMark.maximum} (total of scaled scores)`)));
    const note = node('p', 'exam-score-note exam-official-scale', tx('本試験の得点は項目応答理論による尺度得点（各0–60）で、素点からは換算できません。', 'Real JLPT scores are scaled by item response theory (0–60 per section); raw counts can’t be converted.')); note.lang = host.english() ? 'en' : 'ja';
    table.append(note);
    main.append(table);
  }
  function renderResult(main, selected) {
    const { form, attempt, score } = selected;
    const stopped = attempt.status === 'abandoned';
    const independence = host.independence?.(selected) || null;
    const assistedItem = itemId => !!host.assistance?.(selected, itemId) || !!attempt.answers.find(row => row.item.id === itemId)?.assistance;
    main.append(node('h1', 'view-title', stopped ? tx('中断した練習', 'Attempt stopped') : tx('結果', 'Your results')));
    const machineLabel = host.machineCheckLabel?.(selected);
    if (machineLabel) main.append(reviewMark(machineLabel, true));
    const official = officialOf(selected);
    if (official) main.append(officialBadge(official));
    if (stopped) main.append(node('p', '', tx('回答を保存しました。中断した結果は弱点の判定に使いません。', 'Your answers are saved. A stopped test won’t be treated as evidence of weaknesses.')));
    else {
      // an assisted answer was committed before its explanation opened; the headline says how many
      main.append(node('p', 'exam-score', tx(`${score.correct} / ${score.totalItems} 問正解`, `${score.correct} of ${score.totalItems} correct`) +
        (independence?.assistedCorrect ? tx(`（うち助けあり ${independence.assistedCorrect}）`, `, including ${independence.assistedCorrect} assisted`) : '')));
      main.append(node('p', 'exam-score-note', tx('この模試の正答数です。JLPT公式の換算点や合否予測ではありません。', 'This is your accuracy on this test, not an official JLPT score or pass prediction.')));
      if (independence) main.append(node('p', 'exam-independence', independence.independent === null
        ? tx(`問題ごとの助けの記録なし ${independence.answered - independence.assisted} · 助けあり ${independence.assisted} · 未回答 ${independence.unanswered}`,
          `No item-level help recorded ${independence.answered - independence.assisted} · Assisted ${independence.assisted} · Unanswered ${independence.unanswered}`)
        : tx(`自力 ${independence.independent} · 助けあり ${independence.assisted} · 未回答 ${independence.unanswered}`,
          `Independent ${independence.independent} · Assisted ${independence.assisted} · Unanswered ${independence.unanswered}`)));
      const counts = node('dl', 'exam-counts');
      for (const [label, count] of [[tx('不正解', 'Incorrect'), score.incorrect], [tx('未回答', 'Unanswered'), score.unanswered], [tx('未到達', 'Not reached'), score.notReached]]) {
        const item = node('div'); item.append(node('dt', '', label), node('dd', '', String(count))); counts.append(item);
      } main.append(counts);
      // A machine-checked JLPT form reports raw counts by the published 得点区分; a real paper by its
      // pack's official sections; everything else by skill.
      const facts = paperMode(selected) ? officialFacts(form.exam.track)?.score : null;
      if (facts) renderScoreSections(main, selected, facts, assistedItem);
      else {
        if (official) renderOfficialSections(main, official, score);
        const skills = node('div', 'exam-results-skills');
        for (const [skill, labels] of Object.entries(SKILLS)) {
          const rows = score.items.filter(row => row.skill === skill); if (!rows.length) continue;
          const correct = rows.filter(row => row.result === 'correct').length;
          const helped = rows.filter(row => assistedItem(row.itemId)).length;
          skills.append(node('p', '', `${tx(...labels)} · ${correct}/${rows.length}${helped ? tx(`（助けあり ${helped}）`, ` (${helped} assisted)`) : ''} · ${minutes(rows.reduce((n, row) => n + row.elapsedMs, 0))} ${tx('分', 'min')}`));
        } main.append(skills);
      }
      const conditions = node('details', 'exam-conditions');
      conditions.append(node('summary', '', tx('受験時の状況', 'Test conditions')));
      conditions.append(node('p', '', attempt.mode === 'timed' ? tx('時間制限あり', 'Timed attempt') : tx('時間制限なし', 'Untimed practice')));
      if (attempt.priorExposure === 'reported') conditions.append(node('p', '', tx('以前に見た問題を含みます。初回の結果とは分けて比べてください。', 'Includes previously seen questions. Compare separately from first attempts.')));
      if (attempt.priorExposure === 'unknown') conditions.append(node('p', '', tx('以前に同じ問題を見たかどうか：未記録', 'Previous exposure: not recorded')));
      if (attempt.conditions.some(value => value !== 'assisted')) conditions.append(node('p', '', tx('途中の中断などを含む結果です。', 'Includes interruptions or changes to test conditions.')));
      if (independence?.assisted) conditions.append(node('p', '', tx(`辞書・解説を使った問題：${independence.assisted}問`,
        `Help used on ${independence.assisted} question${independence.assisted === 1 ? '' : 's'}`)));
      if (independence?.attribution === 'unknown') conditions.append(node('p', '', tx('問題を特定できない助けの記録があります。', 'Includes help that isn’t tied to a specific question.')));
      main.append(conditions);
      const followup = host.followup(attempt.attemptId);
      if (followup) {
        const missed = followup.evidence.filter(row => row.outcome === 'incorrect').length;
        main.append(node('p', 'exam-bookmark-note', tx(
          `不正解${missed}問の記録を保存しました。目印の有無に関わらず、関連する言葉や文法との次の出会いに引き継ぎます。未回答は、言葉を知らないという判定には使いません。`,
          `${missed} wrong answers saved, with or without bookmarks. Related words and grammar can reappear in later study. Unanswered questions are pacing evidence, not vocabulary weaknesses.`)));
        if (followup.status === 'pending-review' || followup.editorialAtStart?.policyVersion === 'bunki-machine-check/1')
          main.append(node('p', 'exam-provisional-note', tx(
            '検収前の問題です。結果と出典は残し、復習の手がかりとして使います。確定した弱点・習得度の判定ではありません。',
            'These questions are provisional. Their results and sources remain attached to practice suggestions; they do not establish a confirmed weakness or mastery level.')));
        const historical = followup.actions.filter(row => row.status === 'added').length;
        const { currentCount, removableCount } = host.removableAdditions?.(followup) ||
          { currentCount: historical, removableCount: historical };
        main.append(node('p', 'exam-followup', currentCount ? tx(`${currentCount}件が覚えるリストに入っています。復習はいつものペースで始まります。`,
          `${currentCount} items from this test are in Learn. They’ll enter review at your usual pace.`) : official
          ? tx('結果をこの端末に保存しました。', 'Results saved on this device.')
          : tx('結果を保存しました。先生との学習にも引き継がれます。', 'Results saved for your next study session with Sensei.')));
        if (followup.status === 'pending-mapping') main.append(node('p', '', tx('\u4E00部の復習カードを準備中です。結果は保存済みです。', 'Some review cards still need preparation. Your results are safely saved.')));
        if (removableCount) main.append(button(tx('自動追加を取り消す', 'Undo automatic additions'), 'exam-undo-additions', async () => {
          if (!owned() || host.pending()) return; const generation = lifecycle;
          const ok = await host.undo(followup.id); if (!alive(generation)) return;
          notice = ok ? currentCount > removableCount
            ? tx('未学習の自動追加を取り消しました。学習済みの項目は残しています。', 'Automatic additions removed. Items you’ve already studied are kept.')
            : tx('自動追加を取り消しました。結果は保存されています。', 'Automatic additions removed. Your results are still saved.')
            : tx('取り消しを保存できませんでした。もう\u4E00度お試しください。', 'Couldn’t save the removal. Please try again.'); refresh();
        }));
      }
      // A real question never goes to an outside AI model.
      if (official) main.append(node('p', 'exam-status exam-official-private', tx('本物の問題は先生（外部のAI）には送りません。', 'Real questions are never sent to Sensei (an outside AI).')));
      else main.append(button(tx('先生と復習する', 'Review with Sensei'), 'exam-sensei', () => host.sensei(attempt.attemptId)));
    }
    for (const result of score.items) {
      const question = form.items.find(row => row.id === result.itemId);
      const details = node('details', `exam-answer ${result.result}`);
      details.dataset.examItem = result.itemId;
      if (result.itemId === focusItemId) {
        // arrived from "return to this sentence": this question, open and in view, once
        details.open = true; focusItemId = null;
        requestAnimationFrame(() => details.scrollIntoView({ block: 'center' }));
      }
      const helped = assistedItem(result.itemId);
      if (helped) details.dataset.examAssisted = 'true';
      const plain = official ? paperPlain : text => text;
      const daimon = paperMode(selected) && DAIMON[question.task] ? tx(...DAIMON[question.task]) : null;
      // A real paper's prompt opens with its printed number; the list already numbers each question.
      const promptLine = official ? plain(question.prompt.replace(/^\uE005\d+\uE006\u3000?/u, '')).split('\n').at(-1) || tx('本文の空欄', 'Blank in the passage')
        : question.prompt.split('\n').at(-1);
      const summary = node('summary', '', `${form.items.indexOf(question) + 1}. ${daimon ? `〔${daimon}〕 ` : ''}${promptLine}${helped ? tx(' · 助けあり', ' · Assisted') : ''}`);
      summary.dataset.uiContentValue = promptLine; details.append(summary);
      const choice = id => { const index = question.response.options.findIndex(row => row.id === id);
        return index < 0 ? '' : official ? `${index + 1}　${plain(question.response.options[index].text)}` : question.response.options[index].text; };
      const selectedOption = question.response.kind === 'selected' && result.response.kind === 'selected'
        ? choice(result.response.optionId) : tx('未回答', 'No answer');
      const sourcePrompt = official ? textNode('p', 'exam-result-prompt', question.prompt, true) : node('p', 'exam-result-prompt');
      if (!official) questionText(sourcePrompt, question.prompt, selected, question.id, 'prompt');
      details.append(sourcePrompt);
      const response = node('p', '', `${tx('あなたの回答', 'Your answer')}: `);
      appendText(response, selectedOption || '', selected, question.id, 'choice'); details.append(response);
      if (question.response.kind === 'selected') {
        const key = node('p', '', `${tx('正解', 'Correct answer')}: `);
        appendText(key, choice(question.response.answerOptionId), selected, question.id, 'choice'); details.append(key);
      }
      const rationale = node('p', 'exam-rationale'); appendText(rationale, question.rationale, selected, question.id, 'explanation'); details.append(rationale);
      if (machineLabel) details.append(...questionProvenance(selected, question.id).slice(1));
      main.append(details);
      if (!official) details.append(button(tx('先生にこの問題を聞く', 'Ask Sensei about this question'), null,
        () => host.sensei(attempt.attemptId, question.id)));
    }
    main.append(button(tx('模試に戻る', 'Back to tests'), 'exam-done', async () => {
      selectedId = null; await host.dismiss(attempt.attemptId); refresh();
    }, 'take'));
  }
  // A window that cannot write the record still owes the learner a room that
  // says so. An empty main here was the blank JLPT room of 2026-09-24.
  function renderUnowned(main) {
    const state = host.recordState?.() || { kind: 'blocked', message: '' };
    const card = node('section', 'room-state'); card.dataset.roomState = state.kind;
    card.setAttribute('role', 'status');
    card.append(node('h1', 'view-title', tx('JLPT 模試・練習', 'JLPT tests & practice')));
    if (state.kind === 'booting') card.append(node('p', '', tx('記録を開いています…', 'Opening your notebook…')));
    else if (state.kind === 'busy') card.append(node('p', '', state.message || tx('記録を読み込んでいます…', 'Restoring your notebook…')));
    else {
      card.append(node('p', '', tx('この窓では練習を始められません。', 'You can’t practise in this window right now.')));
      if (state.message) card.append(node('p', 'room-state-why', state.message));
      card.append(button(tx('この窓を再読み込み', 'Reload this window'), 'room-state-reload', () => host.reload ? host.reload() : location.reload()));
    }
    main.append(card);
  }
  return {
    render(main) {
      if (focusAfterRender) {
        // applied after the rebuilt room is in the document; a missing target is a no-op
        const target = focusAfterRender; focusAfterRender = null;
        requestAnimationFrame(() => document.querySelector(target)?.focus());
      }
      if (!owned()) { stopAudio(); renderUnowned(main); return true; }
      if (legacyOpen) {
        main.append(button(tx('模試に戻る', 'Back to mock tests'), 'exam-close-legacy', () => { legacyOpen = false; refresh(); }));
        return false;
      }
      main.classList.add('assessment-room'); main.lang = host.english() ? 'en' : 'ja';
      if (notice || host.notice()) { const status = node('p', 'exam-notice', notice || host.notice()); status.setAttribute('role', 'alert'); main.append(status); }
      const current = selection();
      if (resumeOnEntry && current?.attempt.status === 'in-progress' && !confirmation && !historyOpen) {
        resumeOnEntry = false; entryResumePending = true;
        const generation = lifecycle;
        void resumeAttempt(generation).finally(() => {
          if (alive(generation)) { entryResumePending = false; refresh(); }
        });
      }
      if (entryResumePending) {
        main.append(node('p', 'exam-save', tx('模試を再開しています…', 'Resuming your test…'))); return true;
      }
      if (confirmation) renderConfirmation(main, confirmation);
      else if (historyOpen) renderHistory(main);
      else if (current) {
        if (current.attempt.status === 'in-progress') renderQuestion(main, current);
        else { main.dataset.examAttempt = current.attempt.attemptId; renderResult(main, current); }
      }
      else renderCatalog(main);
      return true;
    },
    open(attemptId, itemId) {
      selectedId = attemptId; focusItemId = itemId || null; whyOpenItemId = null;
      historyOpen = false; legacyOpen = false; confirmation = null;
      if (!selection()) { selectedId = null; focusItemId = null; notice = tx('その問題はもう表示できません。', 'That question is no longer available.'); }
    },
    tick() {
      if (!owned()) { stopAudio(); return; }
      const selected = host.selection();
      if (!selected || selected.attempt.status !== 'in-progress') return;
      const timer = document.getElementById('exam-timer');
      if (timer && selected.attempt.mode === 'timed') timer.textContent = clockText(host.remaining(selected));
      if (selected.attempt.mode === 'timed' && selected.attempt.blocks.some(row => row.status === 'open') && host.remaining(selected) <= 0)
        void command({ kind: 'tick' });
    },
    async interrupt() { cancelPendingPlayback(); await suspendAudio(); if (!owned()) return false; return host.action({ kind: 'interruption', reason: 'background' }); },
    async suspend() { cancelPendingPlayback(); await suspendAudio(); resumeOnEntry = true; },
    dispose() { lifecycle += 1; cancelPendingPlayback(); deliveryLoading = false; entryResumePending = false; whyOpenItemId = null; focusAfterRender = null; stopAudio(); for (const url of imageUrls.values()) URL.revokeObjectURL(url); imageUrls.clear(); for (const url of pageUrls) URL.revokeObjectURL(url); pageUrls.clear(); },
  };
}

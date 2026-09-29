/** JLPT room. Persistence and editorial admission belong to the host.
 * All exam/source strings are text nodes, including private imported content. */
const SKILLS = { vocabulary: ['文字・語彙', 'Vocabulary'], grammar: ['文法', 'Grammar'],
  reading: ['読解', 'Reading'], listening: ['聴解', 'Listening'] };
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
const minutes = ms => Math.max(0, Math.ceil(ms / 60_000));
const clockText = ms => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const TASKS = { 'kanji-reading': '漢字読み', 'orthography': '表記', 'contextual-expression': '文脈規定',
  paraphrase: '言い換え類義', usage: '用法', 'grammar-form': '文法形式の判断',
  'sentence-composition': '文の組み立て', 'text-grammar': '文章の文法' };
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
    task: TASKS[question.task] || SKILLS[question.skill]?.[0] || '',
    instruction: lines.length > 1 ? lines.shift().replace(/【[\s\u3000]*】/gu, '＿＿＿') : '',
    text: lines.join('\n'), fullLength: form.scope === 'full-candidate' };
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
  const titleOf = entry => host.english() ? entry.titleEn : entry.titleJa;
  const hasListening = entry => Number(entry.skillCounts?.listening) > 0;
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
    if (!ok) notice = tx('再開を保存できませんでした。もう一度お試しください。', 'Couldn’t resume the test. Please try again.');
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
    if (!ok) notice = tx('保存できませんでした。もう一度お試しください。', 'Couldn’t save that change. Please try again.');
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
      details.append(node('p', 'exam-machine-label', entry.review.label));
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
  // marked 検収前 (answers not yet checked). No date is promised; nothing is called reviewed.
  function renderOlderSets(main, hasTests = false) {
    const older = host.olderSets?.(level) || { state: 'failed', sets: [] };
    const sets = older.sets;
    const block = node('section', 'exam-older'); block.dataset.examOlder = level; block.dataset.olderState = older.state;
    if (hasTests) block.append(node('h2', 'exam-section-heading', tx('以前の練習セット', 'Older practice sets')));
    if (older.state === 'loading') { block.append(node('p', 'exam-status', tx('以前の練習セットを読み込み中…', 'Loading the older practice sets…'))); main.append(block); return; }
    if (older.state === 'failed') {
      block.append(node('p', 'exam-status', hasTests
        ? tx('以前の練習セットを読み込めませんでした。', 'The older practice sets couldn’t load.')
        : tx(`${level}の確認済みテストは、まだありません。以前の練習セットを読み込めませんでした。`, `No checked ${level} tests yet, and the older practice sets couldn’t load.`)));
      block.append(button(tx('もう一度読み込む', 'Try loading again'), 'exam-older-retry', () => host.retryOlderIndex?.()));
      main.append(block); return;
    }
    block.append(node('p', '', hasTests
      ? tx(`コーパスから自動で作った${level}の短い練習セットです（${sets.length}つ）。答えは未確認です。`,
        `${sets.length} short ${level} sets built automatically from the corpus. Their answers haven't been checked.`)
      : sets.length
        ? tx(`${level}の確認済みテストは、まだありません。以前の${level}練習セットが${sets.length}つあり、今すぐ使えます。答えは未確認です。`,
          `No checked ${level} tests yet. ${sets.length} older ${level} sets are ready now. Their answers haven't been checked.`)
        : tx(`${level}の確認済みテストは、まだありません。`, `No checked ${level} tests yet.`)));
    if (sets.length) block.append(node('p', 'exam-older-limits', tx('語彙・文法・読解のみ。聴解と時間制限はありません。', 'Vocabulary, grammar and reading only — no listening, no timer.')));
    for (const set of sets) {
      const door = button(host.english() ? (set.title.en || set.title.ja) : set.title.ja, null, () => host.startOlder(set.setId), 'entry-row exam-older-set');
      door.dataset.legacySet = set.setId;
      door.append(node('span', 'exam-older-meta', tx(`${set.items}問`, `${set.items} questions`)));
      if (!set.approved) door.append(node('span', 'mock-pending', '検収前'));
      door.disabled = !!host.olderSetLoading?.(set.setId);
      block.append(door);
      if (host.olderSetFailed?.(set.setId)) {
        const failure = node('p', 'exam-status exam-older-failed', tx('このセットを読み込めませんでした。もう一度押すと再試行します。', 'This set couldn’t load. Press it again to retry.'));
        failure.dataset.olderFailed = set.setId; block.append(failure);
      }
    }
    main.append(block);
  }
  function renderCatalog(main) {
    const heading = node('h1', 'view-title', 'JLPT 模試・練習'); heading.lang = 'ja';
    if (host.english()) { const en = node('span', 'en-inline', 'JLPT tests & practice'); en.lang = 'en'; heading.append(en); }
    main.append(heading);
    main.append(node('p', 'exam-intro', tx('級と長さを選んで、今できることを確かめよう。', 'Choose your level and how much time you have.')));
    const levels = node('div', 'exam-levels'); levels.setAttribute('role', 'group'); levels.setAttribute('aria-label', tx('級', 'Level'));
    for (const value of ['N5', 'N4', 'N3', 'N2', 'N1']) {
      const control = button(value, null, () => { level = value; host.rememberLevel?.(value); refresh(); });
      control.setAttribute('aria-pressed', String(value === level)); control.dataset.examLevel = value; levels.append(control);
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
      main.append(node('p', 'exam-status', failed ? tx('問題一覧を読み込めませんでした。', 'Couldn’t load the tests.') : tx('読み込み中…', 'Loading tests…')));
      if (failed) main.append(button(tx('再試行', 'Try again'), 'exam-retry', loadCatalog));
      else if (!loading) void loadCatalog();
      return;
    }
    const written = catalog.entries.filter(entry => entry.level === level && entry.mode === 'written');
    if (written.length) {
      const group = node('section', 'exam-written'); group.dataset.examWritten = level;
      group.append(node('h2', 'exam-section-heading', tx('筆記テスト（文字・語彙・文法・読解）', 'Written tests (vocabulary, grammar, reading)')));
      group.append(node('p', 'exam-machine-label', written[0].review.label));
      group.append(node('p', 'exam-status', tx('オリジナル問題です。聴解はありません。出典と確認方法は各テストの下にあります。',
        'Original questions, no listening. Each test lists its sources and how it was checked.')));
      for (const entry of written) renderCard(group, entry);
      main.append(group);
    }
    const entries = catalog.entries.filter(entry => entry.level === level && entry.mode === length);
    const sections = catalog.entries.filter(entry => entry.level === level && entry.mode === 'section');
    const levelChecked = catalog.entries.some(entry => entry.level === level && entry.mode !== 'written');
    if (levelChecked && !entries.length) main.append(node('p', '', tx('この長さの確認済みテストは、まだありません。', 'No checked test of this length yet.')));
    for (const [index, entry] of [...entries, ...sections].entries()) {
      if (index === entries.length && sections.length) main.append(node('h2', 'exam-section-heading', tx('分野別の練習', 'Practice by skill')));
      renderCard(main, entry);
    }
    // The older corpus-built sets stay reachable below every level's tests.
    if (!levelChecked || written.length) renderOlderSets(main, written.length > 0);
    const attempts = host.library()?.attempts || [];
    if (attempts.length || host.received?.().length) main.append(button(tx('これまでの結果', 'Test history'), 'exam-history', () => { historyOpen = true; refresh(); }));
    main.append(button(tx('以前の短い練習問題', 'Earlier practice exercises'), 'exam-legacy', () => { legacyOpen = true; refresh(); }));
  }
  function renderCard(main, entry) {
    const card = node('article', 'exam-form'); card.dataset.examForm = entry.id;
    card.append(node('h2', '', titleOf(entry)), node('p', 'exam-form-meta',
      tx(`${entry.questionCount}問 · 約${entry.durationMinutes}分`, `${entry.questionCount} questions · about ${entry.durationMinutes} min`)));
    if (entry.review?.status === 'machine-checked') card.append(node('p', 'mock-pending exam-machine-label', entry.review.label));
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
    section.append(node('h2', '', value.kind === 'start' ? titleOf(value.entry) : tx('このパートを終了しますか？', 'Finish this section?')));
    section.firstChild.id = 'exam-confirm-title';
    if (value.kind === 'start') {
      const writtenSection = ['section', 'written'].includes(value.entry.mode), audio = hasListening(value.entry);
      if (value.entry.review?.status === 'machine-checked') section.append(node('p', 'mock-pending exam-machine-label', value.entry.review.label));
      if (writtenSection) section.append(node('p', 'exam-scope-note', tx(
        `${value.entry.questionCount}問・${value.entry.durationMinutes}分の短縮練習です。JLPT本試験の全問題・全科目ではありません。${audio ? '' : '聴解は含みません。'}`,
        `${value.entry.questionCount} questions · ${value.entry.durationMinutes} minutes: a shorter practice set, not a complete JLPT examination.${audio ? '' : ' Listening is not included.'}`)));
      if (value.entry.level === 'N1') {
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
        '不正解は「あとで見直す」を押さなくても自動保存し、ほかの学習で再会する手がかりになります。「あとで見直す」は目印です。検収前の問題の結果は、仮の手がかりとして区別します。',
        'Wrong answers are saved automatically, even without a bookmark, and guide later encounters across Bunki. A bookmark is your reminder. Results from provisional questions stay labelled as provisional.')));
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
    if (host.reconciliation?.()?.state === 'pending') main.append(node('p', '', tx('一部の結果は、対応する問題を読み込んでから復習に反映します。',
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
    const play = button(playingHere ? tx('再生中', 'Playing') : audioLoading ? tx('音声を準備中…', 'Loading audio…') : finished ? tx('もう一度聴く', 'Play again') : played
      ? tx('音声を続ける', 'Resume audio') : tx('音声を再生', 'Play audio'), example ? 'exam-example-audio-play' : 'exam-audio-play', () => playAudio(selected, media));
    play.disabled = !owned() || host.pending() || audioLoading || playingHere ||
      (selected.attempt.mode === 'timed' && (finished || next?.media.sha256 !== media.sha256));
    main.append(play, node('p', 'exam-audio-status', selected.attempt.mode === 'timed'
      ? tx('音声は順番に、一度ずつ続けて流れます。', 'Recordings play in order, once each, without pauses between them.')
      : tx('音量を確認してから再生してください。', 'Check your volume before playing.')));
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
    if (!check) { host.ensureDelivery?.(selected); return [node('p', 'exam-machine-label', label)]; }
    const line = node('p', 'exam-item-provenance', tx(
      `この問題：作成 ${familyName(check.author)}・検証 ${check.verifiers.join('／')}（${check.agreed}/${check.verifiers.length} 一致）`,
      `This question: written by ${familyName(check.author)}, checked by ${check.verifiers.join(', ')} (${check.agreed}/${check.verifiers.length} agreed)`));
    line.dataset.itemProvenance = itemId;
    return [node('p', 'exam-machine-label', label), line];
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
    const door = button(answer.assistance ? tx('解説をもう一度見る', 'See the explanation again') : tx('なぜ？— 解説を見る', 'Why? — See the explanation'),
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
  function renderQuestion(main, selected) {
    const { form, attempt } = selected;
    main.dataset.examMode = attempt.mode;
    const block = attempt.blocks.find(row => row.status === 'open');
    main.append(node('h1', 'exam-heading', `${form.exam.track} ${form.scope === 'full-candidate'
      ? tx('模試', 'mock test') : tx('練習', 'practice')}`));
    main.append(node('p', 'exam-mode-badge', attempt.mode === 'practice'
      ? tx('学習モード · 辞書と読みの確認', 'Study mode · lookup available')
      : tx('本番形式 · 時間制限あり · ヒントなし', 'Timed exam mode · no hints')));
    if (form.scope !== 'full-candidate') main.append(node('p', 'exam-scope-note', tx(
      `${form.items.length}問の短縮練習 · 本試験の全科目ではありません`,
      `${form.items.length}-question practice set · not a complete JLPT examination`)));
    const machineLabel = host.machineCheckLabel?.(selected);
    if (machineLabel) main.append(node('p', 'mock-pending exam-machine-label', machineLabel));
    if (!block) {
      const pending = attempt.blocks.find(row => row.status === 'pending');
      main.append(node('p', '', tx('このパートは終了しました。準備ができたら次のパートへ進んでください。',
        'This section is finished. Start the next section when you’re ready.')));
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
    const paper = node('article', 'exam-paper'); paper.lang = 'ja';
    paper.setAttribute('aria-labelledby', 'exam-task-title'); main.append(paper);
    const layout = assessmentQuestionLayout(form, question);
    const paperHeader = node('header', 'exam-paper-header');
    const skillHeading = node('p', 'exam-skill');
    appendText(skillHeading, question.skill === 'listening' ? '聴解'
      : ['N1', 'N2'].includes(form.exam.track) ? '言語知識（文字・語彙・文法）・読解'
        : SKILLS[question.skill]?.[0] || question.skill, selected, question.id, 'instruction'); paperHeader.append(skillHeading);
    const taskHeading = node('h2', 'exam-task-heading');
    appendText(taskHeading, `問題 ${layout.group}　${layout.task}`, selected, question.id, 'instruction');
    taskHeading.id = 'exam-task-title'; paperHeader.append(taskHeading);
    if (layout.instruction) {
      const instruction = node('p', 'exam-task-instruction');
      appendText(instruction, layout.instruction, selected, question.id, 'instruction'); paperHeader.append(instruction);
    }
    paper.append(paperHeader);
    for (const reference of question.passages) {
      const passage = form.passages.find(row => row.sha256 === reference.sha256);
      const text = node('section', 'exam-passage'); text.lang = 'ja';
      if (passage?.title) { const heading = node('h3', ''); appendText(heading, passage.title, selected, question.id, 'passage'); text.append(heading); }
      const body = node('p', ''); appendText(body, passage?.text || '', selected, question.id, 'passage');
      text.append(body); paper.append(text);
    }
    const prompt = node('p', 'mock-question exam-prompt'); prompt.lang = 'ja';
    prompt.append(node('span', 'exam-question-number', String(layout.number)));
    questionText(prompt, layout.text, selected, question.id, 'prompt'); paper.append(prompt);
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
      question.response.options.forEach((option, number) => {
        const unit = deliveryUnits(selected).find(row => row.kind === 'question' && row.itemIds.includes(question.id));
        const audioOnly = question.skill === 'listening' && (!unit || !unit.printedOptions);
        const lookupChoice = attempt.mode === 'practice' && !audioOnly && !!host.appendLookupText;
        const control = button(audioOnly || lookupChoice ? String(number + 1) : `${number + 1}\u3000${option.text}`, null, () => {
          // keep keyboard focus on the chosen option across the re-render (one Tab then reaches the why-door)
          focusAfterRender = `[data-exam-option="${CSS.escape(option.id)}"]`;
          return command({ kind: 'answer', itemId: question.id, response: { kind: 'selected', optionId: option.id } });
        }, lookupChoice ? 'mock-opt exam-option-number' : 'mock-opt');
        control.lang = 'ja'; control.dataset.examOption = option.id;
        control.setAttribute('aria-pressed', String(answer.response.kind === 'selected' && answer.response.optionId === option.id));
        control.disabled = host.pending() || !!answer.assistance;
        if (lookupChoice) {
          control.setAttribute('aria-label', tx(`回答 ${number + 1}: ${option.text}`, `Answer ${number + 1}: ${option.text}`));
          const row = node('div', 'exam-option-row'); row.dataset.selected = control.getAttribute('aria-pressed');
          const text = node('span', 'exam-option-text');
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
    const map = node('details', 'exam-question-map'); map.append(node('summary', '', tx('解答一覧・見直し', 'Questions and flags')));
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
  function renderResult(main, selected) {
    const { form, attempt, score } = selected;
    const stopped = attempt.status === 'abandoned';
    const independence = host.independence?.(selected) || null;
    const assistedItem = itemId => !!host.assistance?.(selected, itemId) || !!attempt.answers.find(row => row.item.id === itemId)?.assistance;
    main.append(node('h1', 'view-title', stopped ? tx('中断した練習', 'Attempt stopped') : tx('結果', 'Your results')));
    const machineLabel = host.machineCheckLabel?.(selected);
    if (machineLabel) main.append(node('p', 'mock-pending exam-machine-label', machineLabel));
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
      const skills = node('div', 'exam-results-skills');
      for (const [skill, labels] of Object.entries(SKILLS)) {
        const rows = score.items.filter(row => row.skill === skill); if (!rows.length) continue;
        const correct = rows.filter(row => row.result === 'correct').length;
        const helped = rows.filter(row => assistedItem(row.itemId)).length;
        skills.append(node('p', '', `${tx(...labels)} · ${correct}/${rows.length}${helped ? tx(`（助けあり ${helped}）`, ` (${helped} assisted)`) : ''} · ${minutes(rows.reduce((n, row) => n + row.elapsedMs, 0))} ${tx('分', 'min')}`));
      } main.append(skills);
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
          `${currentCount} items from this test are in Learn. They’ll enter review at your usual pace.`) : tx('結果を保存しました。先生との学習にも引き継がれます。', 'Results saved for your next study session with Sensei.')));
        if (followup.status === 'pending-mapping') main.append(node('p', '', tx('一部の復習カードを準備中です。結果は保存済みです。', 'Some review cards still need preparation. Your results are safely saved.')));
        if (removableCount) main.append(button(tx('自動追加を取り消す', 'Undo automatic additions'), 'exam-undo-additions', async () => {
          if (!owned() || host.pending()) return; const generation = lifecycle;
          const ok = await host.undo(followup.id); if (!alive(generation)) return;
          notice = ok ? currentCount > removableCount
            ? tx('未学習の自動追加を取り消しました。学習済みの項目は残しています。', 'Automatic additions removed. Items you’ve already studied are kept.')
            : tx('自動追加を取り消しました。結果は保存されています。', 'Automatic additions removed. Your results are still saved.')
            : tx('取り消しを保存できませんでした。もう一度お試しください。', 'Couldn’t save the removal. Please try again.'); refresh();
        }));
      }
      main.append(button(tx('先生と復習する', 'Review with Sensei'), 'exam-sensei', () => host.sensei(attempt.attemptId)));
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
      details.append(node('summary', '', `${form.items.indexOf(question) + 1}. ${question.prompt.split('\n').at(-1)}${helped ? tx(' · 助けあり', ' · Assisted') : ''}`));
      const selectedOption = question.response.kind === 'selected' && result.response.kind === 'selected'
        ? question.response.options.find(row => row.id === result.response.optionId)?.text : tx('未回答', 'No answer');
      const sourcePrompt = node('p', 'exam-result-prompt');
      questionText(sourcePrompt, question.prompt, selected, question.id, 'prompt'); details.append(sourcePrompt);
      const response = node('p', '', `${tx('あなたの回答', 'Your answer')}: `);
      appendText(response, selectedOption || '', selected, question.id, 'choice'); details.append(response);
      if (question.response.kind === 'selected') {
        const key = node('p', '', `${tx('正解', 'Correct answer')}: `);
        appendText(key, question.response.options.find(row => row.id === question.response.answerOptionId)?.text || '', selected, question.id, 'choice'); details.append(key);
      }
      const rationale = node('p', 'exam-rationale'); appendText(rationale, question.rationale, selected, question.id, 'explanation'); details.append(rationale);
      if (machineLabel) details.append(...questionProvenance(selected, question.id).slice(1));
      main.append(details);
      details.append(button(tx('先生にこの問題を聞く', 'Ask Sensei about this question'), null,
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
    dispose() { lifecycle += 1; cancelPendingPlayback(); deliveryLoading = false; entryResumePending = false; whyOpenItemId = null; focusAfterRender = null; stopAudio(); for (const url of imageUrls.values()) URL.revokeObjectURL(url); imageUrls.clear(); },
  };
}

/** JLPT room. Persistence and editorial admission belong to the host.
 * All exam/source strings are text nodes, including private imported content. */
const SKILLS = { vocabulary: ['文字・語彙', 'Vocabulary'], grammar: ['文法', 'Grammar'],
  reading: ['読解', 'Reading'], listening: ['聴解', 'Listening'] };
const LENGTHS = { short: ['ショート', 'Short'], medium: ['ミディアム', 'Medium'], full: ['フル模試', 'Full mock'] };
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

export function createAssessmentView(host) {
  let level = 'N2', length = 'short', catalog = null, failed = false, loading = false;
  let selectedId = null, historyOpen = false, notice = null, legacyOpen = false;
  let activeAudio = null, audioKey = null, audioUrl = null, audioLoading = false;
  let lifecycle = 0, playbackEpoch = 0, advancingAudio = false, deliveryLoading = false;
  let resumeOnEntry = false, entryResumePending = false;
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
    if (!internal && ['answer', 'visit', 'flag'].includes(action.kind) && !await resumeAttempt(generation)) { refresh(); return false; }
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
    details.append(node('p', '', reviewed
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
  function renderCatalog(main) {
    main.append(node('h1', 'view-title', tx('JLPT 模試・練習', 'JLPT tests & practice')));
    main.append(node('p', 'exam-intro', tx('級と長さを選んで、今できることを確かめよう。', 'Choose your level and how much time you have.')));
    const levels = node('div', 'exam-levels'); levels.setAttribute('role', 'group'); levels.setAttribute('aria-label', tx('級', 'Level'));
    for (const value of ['N5', 'N4', 'N3', 'N2', 'N1']) {
      const control = button(value, null, () => { level = value; refresh(); });
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
    const entries = catalog.entries.filter(entry => entry.level === level && entry.mode === length);
    if (!entries.length) main.append(node('p', '', tx('この級の問題を準備しています。', 'Tests for this level are being prepared.')));
    const sections = catalog.entries.filter(entry => entry.level === level && entry.mode === 'section');
    for (const [index, entry] of [...entries, ...sections].entries()) {
      if (index === entries.length && sections.length) main.append(node('h2', 'exam-section-heading', tx('分野別の練習', 'Practice by skill')));
      const card = node('article', 'exam-form'); card.dataset.examForm = entry.id;
      card.append(node('h2', '', titleOf(entry)), node('p', 'exam-form-meta',
        tx(`${entry.questionCount}問 · 約${entry.durationMinutes}分`, `${entry.questionCount} questions · about ${entry.durationMinutes} min`)));
      card.append(node('p', 'exam-skills', Object.entries(SKILLS)
        .filter(([skill]) => Number(entry.skillCounts?.[skill]) > 0)
        .map(([, labels]) => tx(...labels)).join(' · ')));
      if (entry.mode === 'section') card.append(node('p', 'exam-status',
        tx('この練習は聴解を含みません。分野ごとの正答数と、復習する内容を確認できます。',
          'Written practice without listening. See your results by skill and what to review next.')));
      if (entry.availability.ready) {
        const start = button(entry.mode === 'section' ? tx('練習を始める', 'Start practice') : tx('始める', 'Start test'), null, async () => {
          confirmation = { kind: 'start', entry }; refresh();
        }, 'take'); start.dataset.examStart = entry.id; start.disabled = host.pending(); card.append(start);
      } else card.append(node('p', 'exam-status', hasListening(entry)
        ? tx('問題・音声の確認中', 'Question and audio review in progress')
        : tx('問題の確認中', 'Question review in progress')));
      sourceDetails(card, entry); main.append(card);
    }
    const attempts = host.library()?.attempts || [];
    if (attempts.length || host.received?.().length) main.append(button(tx('これまでの結果', 'Test history'), 'exam-history', () => { historyOpen = true; refresh(); }));
    main.append(button(tx('以前の短い練習問題', 'Earlier practice exercises'), 'exam-legacy', () => { legacyOpen = true; refresh(); }));
  }
  function renderConfirmation(main, value) {
    const section = node('section', 'exam-confirm'); section.setAttribute('aria-labelledby', 'exam-confirm-title');
    section.append(node('h2', '', value.kind === 'start' ? titleOf(value.entry) : tx('このパートを終了しますか？', 'Finish this section?')));
    section.firstChild.id = 'exam-confirm-title';
    if (value.kind === 'start') {
      const writtenSection = value.entry.mode === 'section', audio = hasListening(value.entry);
      section.append(node('p', '', writtenSection
        ? tx(`${value.entry.durationMinutes}分の練習です。ヒントは表示されません。時間制限なしでも練習できます。`,
          `You have ${value.entry.durationMinutes} minutes, with no hints. You can also practice without a timer.`)
        : tx('本番モードでは時間制限があり、ヒントは表示されません。終了したパートには戻れません。',
          'Exam mode has a time limit and no hints. Once you finish a section, you can’t return to it.')));
      section.append(node('p', '', tx('間違えた内容は結果と一緒に保存し、覚えるリストと先生との学習に引き継ぎます。',
        'Your results will guide your Learn list, review cards and Sensei. You can remove automatic additions afterward.')));
      section.append(node('p', 'exam-download-note', host.pending()
        ? audio ? tx('問題と音声を保存しています…', 'Downloading questions and audio…') : tx('問題を保存しています…', 'Downloading questions…')
        : audio ? tx('始める前に問題と音声を保存します。保存が終わってから計時を始めます。', 'Questions and audio download before the timer starts.')
          : tx('始める前に問題を保存します。保存が終わってから計時を始めます。', 'Questions download before the timer starts.')));
      section.append(button(writtenSection ? tx('時間を計って練習', 'Start timed practice') : tx('本番モードで始める', 'Start exam mode'), 'exam-confirm-start', async () => {
        if (!owned()) return; const generation = lifecycle;
        const ok = await host.start(value.entry, 'timed'); if (!alive(generation)) return;
        if (ok) confirmation = null; refresh();
      }, 'take'));
      section.append(button(tx('時間制限なしで練習', 'Practice without a timer'), 'exam-practice-start', async () => {
        if (!owned()) return; const generation = lifecycle;
        const ok = await host.start(value.entry, 'practice'); if (!alive(generation)) return;
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
  function renderQuestion(main, selected) {
    const { form, attempt } = selected;
    const block = attempt.blocks.find(row => row.status === 'open');
    main.append(node('h1', 'exam-heading', `${form.exam.track} ${form.scope === 'section-practice'
      ? tx('練習', 'practice') : tx('模試', 'mock test')}`));
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
    main.append(node('p', 'exam-skill', tx(...(SKILLS[question.skill] || ['', question.skill]))));
    for (const reference of question.passages) {
      const passage = form.passages.find(row => row.sha256 === reference.sha256);
      const text = node('section', 'exam-passage'); text.lang = 'ja';
      if (passage?.title) text.append(node('h2', '', passage.title));
      text.append(node('p', '', passage?.text || '')); main.append(text);
    }
    const prompt = node('p', 'mock-question exam-prompt', question.prompt); prompt.lang = 'ja'; main.append(prompt);
    if (host.english() && question.translatedInstruction) main.append(node('p', 'exam-instruction', question.translatedInstruction));
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
        const control = button(audioOnly ? String(number + 1) : `${number + 1}\u3000${option.text}`, null, () => command({ kind: 'answer', itemId: question.id, response: { kind: 'selected', optionId: option.id } }), 'mock-opt');
        control.lang = 'ja'; control.dataset.examOption = option.id;
        control.setAttribute('aria-pressed', String(answer.response.kind === 'selected' && answer.response.optionId === option.id));
        control.disabled = host.pending(); options.append(control);
      }); main.append(options);
    }
    const flag = button(answer.flagged ? tx('見直しを解除', 'Unflag question') : tx('あとで見直す', 'Flag for review'), 'exam-flag',
      () => command({ kind: 'flag', itemId: question.id, flagged: !answer.flagged }));
    flag.setAttribute('aria-pressed', String(answer.flagged)); flag.disabled = host.pending(); main.append(flag);
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
      const control = button(`${i + 1}${saved.flagged ? ' ⚑' : saved.response.kind !== 'unanswered' ? ' ✓' : ''}`, null,
        () => command({ kind: 'visit', itemId: id }));
      control.setAttribute('aria-label', tx(`${i + 1}問目${saved.flagged ? '、要見直し' : ''}`, `Question ${i + 1}${saved.flagged ? ', flagged' : ''}`));
      control.dataset.examVisit = id;
      control.disabled = host.pending() || advancingAudio || !canVisit(selected, id); grid.append(control);
    }); map.append(grid); main.append(map);
    renderLeaveControls(main);
  }
  function renderResult(main, selected) {
    const { form, attempt, score } = selected;
    const stopped = attempt.status === 'abandoned';
    main.append(node('h1', 'view-title', stopped ? tx('中断した練習', 'Attempt stopped') : tx('結果', 'Your results')));
    if (stopped) main.append(node('p', '', tx('回答を保存しました。中断した結果は弱点の判定に使いません。', 'Your answers are saved. A stopped test won’t be treated as evidence of weaknesses.')));
    else {
      main.append(node('p', 'exam-score', tx(`${score.correct} / ${score.totalItems} 問正解`, `${score.correct} of ${score.totalItems} correct`)));
      main.append(node('p', 'exam-score-note', tx('この模試の正答数です。JLPT公式の換算点や合否予測ではありません。', 'This is your accuracy on this test, not an official JLPT score or pass prediction.')));
      const counts = node('dl', 'exam-counts');
      for (const [label, count] of [[tx('不正解', 'Incorrect'), score.incorrect], [tx('未回答', 'Unanswered'), score.unanswered], [tx('未到達', 'Not reached'), score.notReached]]) {
        const item = node('div'); item.append(node('dt', '', label), node('dd', '', String(count))); counts.append(item);
      } main.append(counts);
      const skills = node('div', 'exam-results-skills');
      for (const [skill, labels] of Object.entries(SKILLS)) {
        const rows = score.items.filter(row => row.skill === skill); if (!rows.length) continue;
        const correct = rows.filter(row => row.result === 'correct').length;
        skills.append(node('p', '', `${tx(...labels)} · ${correct}/${rows.length} · ${minutes(rows.reduce((n, row) => n + row.elapsedMs, 0))} ${tx('分', 'min')}`));
      } main.append(skills);
      const conditions = node('details', 'exam-conditions');
      conditions.append(node('summary', '', tx('受験時の状況', 'Test conditions')));
      conditions.append(node('p', '', attempt.mode === 'timed' ? tx('時間制限あり', 'Timed attempt') : tx('時間制限なし', 'Untimed practice')));
      if (attempt.priorExposure === 'reported') conditions.append(node('p', '', tx('以前に見た問題を含みます。初回の結果とは分けて比べてください。', 'Includes previously seen questions. Compare separately from first attempts.')));
      if (attempt.priorExposure === 'unknown') conditions.append(node('p', '', tx('以前に同じ問題を見たかどうか：未記録', 'Previous exposure: not recorded')));
      if (attempt.conditions.length) conditions.append(node('p', '', tx('途中の中断などを含む結果です。', 'Includes interruptions or changes to test conditions.')));
      main.append(conditions);
      const followup = host.followup(attempt.attemptId);
      if (followup) {
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
      details.append(node('summary', '', `${form.items.indexOf(question) + 1}. ${question.prompt.split('\n').at(-1)}`));
      const selectedOption = question.response.kind === 'selected' && result.response.kind === 'selected'
        ? question.response.options.find(row => row.id === result.response.optionId)?.text : tx('未回答', 'No answer');
      details.append(node('p', '', `${tx('あなたの回答', 'Your answer')}: ${selectedOption}`));
      if (question.response.kind === 'selected') details.append(node('p', '', `${tx('正解', 'Correct answer')}: ${question.response.options.find(row => row.id === question.response.answerOptionId)?.text}`));
      details.append(node('p', 'exam-rationale', question.rationale)); main.append(details);
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
      card.append(button(tx('この窓を再読み込み', 'Reload this window'), null, () => location.reload()));
    }
    main.append(card);
  }
  return {
    render(main) {
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
        else renderResult(main, current);
      }
      else renderCatalog(main);
      return true;
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
    dispose() { lifecycle += 1; cancelPendingPlayback(); deliveryLoading = false; entryResumePending = false; stopAudio(); for (const url of imageUrls.values()) URL.revokeObjectURL(url); imageUrls.clear(); },
  };
}

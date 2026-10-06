/** One admitted question revisited in the existing review queue. The scheduler
 * remains the host's responsibility; this view reports an actual new answer. */
import { questionReviewFace, verifyAssessmentQuestionMedia } from './assessment-question-practice.mjs';

const element = (tag, className = '', text = '') => {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
};
const button = (text, id, action) => {
  const node = element('button', 'chip', text); node.type = 'button'; node.id = id;
  node.addEventListener('click', action); return node;
};
// A question uses only its few exact media assets. Byte-derived data URLs
// keep them playable when connectivity changes after preparation, including
// WebKit's offline mode where an already-created Blob URL can stop resolving.
function mediaSource(bytes, mimeType, current) {
  if (!current()) return null;
  const value = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts = [];
  for (let offset = 0; offset < value.length; offset += 32768)
    parts.push(String.fromCharCode(...value.subarray(offset, offset + 32768)));
  return `data:${mimeType};base64,${btoa(parts.join(''))}`;
}
const releaseUrl = url => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); };
export function createAssessmentQuestionView({ plan, loadMedia, current, tx = (_ja, en) => en }) {
  const startedAt = performance.now(), urls = new Map(), plays = new Map();
  for (const media of plan.media.filter(row => row.kind === 'audio'))
    plays.set(media.assetId, { assetId: media.assetId, startedPlays: 0, completedPlays: 0, interrupted: false, transcriptOpened: false });
  let surface = null, options = null, disposed = false, epoch = 0, pending = false;
  let proof = null, preparation = null, mediaError = '', selected = null, ordered = [], written = '';
  let nativeAudio = null, playing = null, playbackPending = false, replayIndex = null;
  const active = token => !disposed && token === epoch && current() && !!surface?.isConnected && !document.hidden;
  const audioUnits = plan.presentation?.units || [];
  const mediaReady = () => !plan.media.length || !!proof;
  const heard = () => [...plays.values()].every(row => row.completedPlays > 0);
  const inUse = () => pending || options?.busy || playbackPending || !!playing;
  const response = () => {
    const spec = plan.item.response;
    if (spec.kind === 'selected') return selected ? { kind: 'selected', optionId: selected } : null;
    if (spec.kind === 'ordered') return ordered.length === spec.tokens.length ? { kind: 'ordered', tokenIds: [...ordered] } : null;
    return written.trim() ? { kind: 'written', text: written } : null;
  };
  function halt() {
    epoch++;
    if (playing) plays.get(playing.assetId).interrupted = true;
    playing = null; playbackPending = false;
    if (nativeAudio) {
      nativeAudio.onended = null; nativeAudio.onerror = null; nativeAudio.pause();
      nativeAudio.removeAttribute('src'); nativeAudio.load(); nativeAudio = null;
    }
  }
  function suspend() { halt(); }
  function interrupted() { halt(); if (surface?.isConnected) paint(); }
  const onVisibility = () => { if (document.hidden) interrupted(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', interrupted);

  async function prepare() {
    if (proof || preparation || !plan.media.length || disposed) return;
    const mediaCurrent = () => !disposed && current() && !!surface?.isConnected;
    preparation = (async () => {
      try {
        const assets = await loadMedia(plan);
        if (!mediaCurrent()) return;
        const verified = await verifyAssessmentQuestionMedia(plan, assets);
        if (!mediaCurrent()) return;
        for (const asset of assets) {
          const url = await mediaSource(asset.bytes, asset.mimeType, mediaCurrent);
          if (!url || !mediaCurrent()) { releaseUrl(url); return; }
          releaseUrl(urls.get(asset.assetId)); urls.set(asset.assetId, url);
        }
        proof = verified; mediaError = '';
      } catch { if (mediaCurrent()) mediaError = tx('問題の音声や画像を読み込めません。', 'The recording or image is unavailable. Try loading it again.'); }
      finally { preparation = null; if (mediaCurrent()) paint(); }
    })();
    await preparation;
  }
  async function play(unit) {
    if (disposed || !current() || document.hidden || inUse() || options?.revealed || !proof) return;
    const media = plan.media.find(row => row.sha256 === unit.media.sha256), row = plays.get(media?.assetId);
    if (!row || !urls.has(media.assetId)) return;
    const token = epoch;
    if (heard() && replayIndex === null) replayIndex = audioUnits.indexOf(unit);
    playbackPending = true; mediaError = ''; paint();
    try {
      nativeAudio = new Audio(); nativeAudio.preload = 'auto'; nativeAudio.src = urls.get(media.assetId);
      nativeAudio.onended = () => {
        if (!active(token) || !playing) return;
        row.completedPlays++;
        if (replayIndex !== null) replayIndex = replayIndex + 1 < audioUnits.length ? replayIndex + 1 : null;
        playing = null; nativeAudio.onended = null; nativeAudio.onerror = null;
        nativeAudio = null; paint();
      };
      nativeAudio.onerror = () => {
        if (!active(token)) return;
        mediaError = tx('音声を再生できません。もう一度試してください。', 'The recording could not play. Please try again.');
        halt(); paint();
      };
      row.startedPlays++; playing = { assetId: media.assetId };
      await nativeAudio.play();
      if (!active(token)) return;
      playbackPending = false; paint();
    } catch {
      if (!active(token)) return;
      mediaError = tx('音声を再生できません。もう一度試してください。', 'The recording could not play. Please try again.');
      halt(); paint();
    }
  }
  async function submit(revealed) {
    if (!current() || inUse() || options?.revealed || !mediaReady() || !heard() || (!revealed && !response())) return;
    const input = { response: response(), revealed, latencyMs: Math.min(604800000, Math.max(0, Math.round(performance.now() - startedAt))),
      audio: [...plays.values()].map(row => ({ ...row })) };
    pending = true; paint();
    try { await options.onSubmit(input, proof); }
    finally { pending = false; if (current() && surface?.isConnected) paint(); }
  }
  function paint() {
    if (disposed || !surface || !options) return;
    surface.replaceChildren(); surface.classList.add('assessment-question-review');
    surface.dataset.questionPlan = plan.id;
    const face = questionReviewFace(plan, { revealed: !!options.revealed });
    surface.append(element('p', 'eyebrow', tx('模試の問題を復習', 'Review a test question')),
      element('p', 'teacher-note', tx('前に解いた問題です。問題の復習として記録します。', 'You’ve seen this question before. This review measures recall of this question.')));
    for (const passage of face.passages) {
      const paragraph = element('p', 'assessment-question-passage', passage.text); paragraph.lang = 'ja'; surface.append(paragraph);
    }
    const prompt = element('p', 'assessment-question-prompt', face.prompt); prompt.lang = 'ja'; surface.append(prompt);
    for (const media of face.media.filter(row => row.kind === 'image')) {
      if (!urls.has(media.assetId)) continue;
      const image = document.createElement('img'); image.src = urls.get(media.assetId);
      image.alt = media.alt || tx('問題の図', 'Question illustration'); image.className = 'assessment-question-image'; surface.append(image);
    }
    if (audioUnits.length && !options.revealed) {
      const unit = replayIndex !== null ? audioUnits[replayIndex] : audioUnits.find(unit => {
        const media = plan.media.find(row => row.sha256 === unit.media.sha256);
        return !plays.get(media.assetId).completedPlays;
      }) || audioUnits[0];
      const allHeard = heard() && replayIndex === null;
      const playButton = button(playing || playbackPending ? tx('再生中…', 'Playing…') : allHeard
        ? tx('もう一度聞く', 'Listen again')
        : tx(`音声を聞く ${audioUnits.indexOf(unit) + 1}/${audioUnits.length}`, `Play recording ${audioUnits.indexOf(unit) + 1} of ${audioUnits.length}`),
      'assessment-question-play', () => play(unit));
      playButton.disabled = inUse() || !proof; surface.append(playButton);
      if (allHeard) surface.append(element('p', 'teacher-note', tx('聞き直した場合は「もう一度」として復習します。', 'If you listen again, this card will be scheduled for another pass.')));
    }
    const examplePending = !options.revealed && audioUnits.some(unit => unit.kind === 'example' &&
      !plays.get(plan.media.find(row => row.sha256 === unit.media.sha256).assetId).completedPlays);
    const disabled = inUse() || options.revealed || !mediaReady() || examplePending;
    if (face.response.kind === 'selected' && !examplePending) {
      const choices = element('fieldset', 'assessment-question-options');
      choices.append(element('legend', 'sentence-recall-label', tx('答えを選ぶ', 'Choose your answer')));
      face.response.options.forEach((option, index) => {
        const label = element('label', 'assessment-question-option'), input = document.createElement('input');
        input.type = 'radio'; input.name = 'assessment-question-answer'; input.value = option.id;
        input.checked = selected === option.id; input.disabled = disabled;
        input.addEventListener('change', () => { selected = option.id; refreshSubmit(); });
        label.append(input, document.createTextNode(`${index + 1}${option.text ? `\u3000${option.text}` : ''}`));
        if (options.revealed && option.id === face.response.answerOptionId)
          label.append(element('span', 'assessment-question-key', tx('正解', 'Correct answer')));
        choices.append(label);
      }); surface.append(choices);
    } else if (face.response.kind === 'ordered') {
      surface.append(element('p', 'sentence-recall-label', tx('順番に選ぶ', 'Choose the words in order')));
      const tokens = element('div', 'teacher-actions');
      for (const token of face.response.tokens) {
        const pick = button(`${ordered.includes(token.id) ? `${ordered.indexOf(token.id) + 1}. ` : ''}${token.text}`, '', () => {
          ordered = ordered.includes(token.id) ? ordered.filter(id => id !== token.id) : [...ordered, token.id]; paint();
        }); pick.disabled = disabled; tokens.append(pick);
      } surface.append(tokens);
      if (options.revealed) surface.append(element('p', 'teacher-note', face.response.answerOrder.map(id => face.response.tokens.find(token => token.id === id).text).join(' ')));
    } else if (face.response.kind === 'written') {
      const label = element('label', 'sentence-recall-label', tx('自分の回答', 'Your answer'));
      label.htmlFor = 'assessment-question-written';
      const field = element('textarea', 'sentence-response'); field.id = label.htmlFor; field.lang = 'ja';
      field.value = written; field.maxLength = face.response.maxChars; field.disabled = disabled;
      field.addEventListener('input', () => { written = field.value; refreshSubmit(); }); surface.append(label, field);
      if (options.revealed) surface.append(element('p', 'teacher-note', face.response.marking.accepted.join(' / ')));
    }
    if (options.revealed) {
      const feedback = element('p', 'teacher-note', options.mustRepeat
        ? tx('もう一度復習しましょう。', 'This question needs another pass.') : tx('正解です。', 'Correct.'));
      feedback.id = 'assessment-question-feedback'; feedback.tabIndex = -1; surface.append(feedback);
      const rationale = element('p', 'assessment-question-rationale', face.rationale); rationale.lang = 'ja'; surface.append(rationale);
      for (const media of face.media.filter(row => row.kind === 'audio' && row.transcript)) {
        const detail = element('details', 'assessment-question-transcript');
        detail.append(element('summary', '', tx('スクリプト', 'Transcript')), element('p', '', media.transcript)); surface.append(detail);
      }
    } else {
      const actions = element('div', 'teacher-actions');
      actions.append(button(tx('答え合わせ', 'Check answer'), 'assessment-question-check', () => submit(false)),
        button(tx('思い出せない — 答えを見る', 'I don’t know · show answer'), 'assessment-question-reveal', () => submit(true)));
      surface.append(actions); refreshSubmit();
    }
    const status = element('p', 'teacher-note', options.error || mediaError || (!mediaReady()
      ? tx('音声と画像を読み込み中…', 'Loading the recording and images…') : ''));
    status.id = 'assessment-question-status'; status.setAttribute('role', 'status'); surface.append(status);
    if (mediaError) {
      const retry = button(tx('再読み込み', 'Load again'), 'assessment-question-retry', () => { mediaError = ''; void prepare(); paint(); });
      retry.disabled = !!preparation || inUse(); surface.append(retry);
    }
    const skip = button(tx('評価せずに次へ', 'Skip without grading'), 'assessment-question-skip', () => {
      if (inUse()) return; halt(); options.onSkip();
    }); skip.disabled = inUse(); surface.append(skip);
  }
  function refreshSubmit() {
    if (!surface || options?.revealed) return;
    const check = surface.querySelector('#assessment-question-check'), reveal = surface.querySelector('#assessment-question-reveal');
    const blocked = inUse() || !mediaReady() || !heard();
    if (check) check.disabled = blocked || !response(); if (reveal) reveal.disabled = blocked;
  }
  return {
    mount(node, next) { surface = node; options = next; paint(); void prepare(); },
    suspend,
    mediaProof: () => proof,
    dispose() {
      if (disposed) return; disposed = true; halt();
      document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', interrupted);
      for (const url of urls.values()) releaseUrl(url); urls.clear(); surface = null;
    },
  };
}

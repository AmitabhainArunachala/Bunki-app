/** One ephemeral learning encounter. The host owns entry, return and all records.
 * No scheduler, storage, analytics, audio, network request or mastery inference.
 * Content is supplied by the host from its attributed lesson packet.
 */
export function createKanjiWorldEncounter({ container, content, imageUrl, onReturn, language = 'en', isCurrent = () => true }) {
  if (!container?.ownerDocument || typeof onReturn !== 'function') {
    throw new TypeError('An encounter needs a container and an onReturn callback.');
  }
  const character = content?.kanji?.character;
  const meaning = content?.kanji?.teaching_meaning?.en;
  const word = content?.word?.id;
  const reading = content?.word?.reading;
  const recall = content?.steps?.find(step => step.id === 'plain-recall');
  if (![character, meaning, word, reading, recall?.answer?.en].every(value => typeof value === 'string' && value.trim())) {
    throw new TypeError('The encounter needs sourced character, word, reading and recall content.');
  }
  const document = container.ownerDocument;
  const copy = (en, ja) => language === 'ja' ? ja : en;
  const fromPacket = value => value?.[language] || value?.en || '';
  const normalizeMeaning = value => String(value).normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ').replace(/[.!?。！？」]+$/u, '').trim();
  const normalizeReading = value => String(value).normalize('NFKC').trim().replace(/[\u30a1-\u30f6]/gu, letter => String.fromCharCode(letter.charCodeAt(0) - 0x60));
  const suppliedAnswers = recall.answer.accepted_answers || recall.accepted_answers || [recall.answer.en];
  const meaningAnswers = new Set(suppliedAnswers.map(normalizeMeaning));
  meaningAnswers.add(normalizeMeaning(recall.answer.en));
  const root = document.createElement('section');
  root.className = 'kw-encounter';
  root.setAttribute('aria-label', copy('Kanji World practice', '漢字の風景で練習'));
  let stage = 0, feedback = null, draft = '', destroyed = false, returned = false, imageFailed = !imageUrl;
  let answerInput = null;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function button(action, text, secondary = false) {
    const element = node('button', secondary ? 'kw-button kw-button--quiet' : 'kw-button', text);
    element.type = 'button';
    element.dataset.kwAction = action;
    return element;
  }
  function glyph(text, className = 'kw-glyph') {
    const element = node('p', className, text);
    element.lang = 'ja';
    return element;
  }
  function finishReturn() {
    if (destroyed || returned) return;
    returned = true;
    const completed = stage === 5;
    destroy();
    onReturn({ completed });
  }
  function render(focus = true) {
    if (destroyed) return;
    root.dataset.kwStage = String(stage);
    root.replaceChildren();
    answerInput = null;
    const top = node('header', 'kw-top');
    top.append(button('return', copy('‹ Back', '‹ 戻る'), true));
    top.append(node('span', 'kw-progress', stage === 5 ? copy('Practice complete', '練習完了') : `${Math.min(stage + 1, 5)} / 5`));
    root.append(top);
    const body = node('div', `kw-body${stage === 0 ? ' kw-body--place' : ''}`);
    const heading = node('h1', 'kw-title');
    heading.tabIndex = -1;
    let nextFocus = heading;
    if (stage === 0) {
      const figure = node('figure', 'kw-place');
      if (!imageFailed) {
        const image = node('img', 'kw-image');
        image.src = imageUrl;
        image.alt = fromPacket(content.scene?.memory_hook) || copy('A gate in the rain.', '雨の中の門。');
        image.decoding = 'async';
        figure.append(image);
      } else {
        figure.append(node('p', 'kw-image-fallback', copy('The scene is unavailable. You can still practise the character.', '風景を表示できません。漢字の練習は続けられます。')));
      }
      figure.append(node('figcaption', 'kw-candidate', copy('Rajōmon · art candidate', '羅城門 · 画像候補')));
      body.append(figure);
      heading.textContent = copy('Look through the rain.', '雨の向こうを、見てみよう。');
      body.append(heading, node('p', 'kw-hook', fromPacket(content.scene?.memory_hook)), node('p', 'kw-note', fromPacket(content.scene?.label)));
      body.append(button('next', fromPacket(content.steps?.find(step => step.id === 'see-place')?.action) || copy('See the character', '字を見る')));
    } else if (stage === 1) {
      heading.textContent = copy('The shape becomes a character.', '風景の形が、文字になる。');
      body.append(heading, glyph(character), node('p', 'kw-meaning', meaning));
      body.append(node('p', 'kw-note', copy('Keep this shape and meaning together.', 'この形と意味を、一緒に覚えよう。')));
      body.append(button('next', copy('See it in a word', 'ことばで見る')));
    } else if (stage === 2) {
      heading.textContent = copy('A word you can use.', '使える、ひとつのことば。');
      const pronunciation = glyph(reading, 'kw-reading');
      body.append(heading, glyph(word, 'kw-word'), pronunciation, node('p', 'kw-meaning', content.word.teaching_copy?.en || content.word.gloss));
      body.append(node('p', 'kw-note', copy('Notice 門 at the end of the word.', 'ことばの最後にある「門」を見てみよう。')));
      body.append(button('next', copy('Try the reading', '読みを思い出す')));
    } else if (stage === 3 || stage === 4) {
      const isReading = stage === 3;
      heading.textContent = isReading ? copy('How do you read this word?', 'このことばは、どう読みますか。') : fromPacket(recall.prompt);
      body.append(heading, glyph(isReading ? word : character, isReading ? 'kw-word' : 'kw-glyph'));
      const form = node('form', 'kw-answer-form');
      form.dataset.kwForm = 'answer';
      const label = node('label', 'kw-answer-label', isReading ? copy('Reading in hiragana', 'ひらがなで入力') : copy('Meaning in English', '英語の意味を入力'));
      const input = node('input', 'kw-answer');
      input.type = 'text';
      input.name = 'answer';
      input.value = draft;
      input.autocomplete = 'off';
      input.autocapitalize = 'none';
      input.spellcheck = false;
      input.lang = isReading ? 'ja' : 'en';
      input.enterKeyHint = 'done';
      input.maxLength = 80;
      input.setAttribute('aria-label', label.textContent);
      label.append(input);
      answerInput = input;
      form.append(label);
      if (!feedback || feedback === 'wrong' || feedback === 'empty') {
        const check = button('check', copy('Check', '確認する'));
        check.type = 'submit';
        form.append(check);
        body.append(form);
        const status = node('p', 'kw-feedback');
        status.setAttribute('role', 'status');
        status.textContent = feedback === 'wrong' ? copy('Not quite. Try once more, or reveal the answer.', 'もう一度考えてみよう。答えを見ることもできます。') : feedback === 'empty' ? copy('Type an answer first, or reveal it below.', '答えを入力するか、下のボタンで答えを見てみよう。') : '';
        body.append(status, button('reveal', copy('Show answer', '答えを見る'), true));
        nextFocus = input;
      } else {
        const status = node('p', 'kw-feedback kw-feedback--answer');
        status.setAttribute('role', 'status');
        status.textContent = feedback === 'correct' ? copy('That’s right.', 'そのとおり。') : `${copy('Answer', '答え')}: ${isReading ? reading : recall.answer.en}`;
        if (feedback === 'correct') {
          body.append(node('p', 'kw-response', draft), status);
          nextFocus = button('next', isReading ? copy('Now, just the character', '最後は、文字だけで') : copy('Finish practice', '練習を終える'));
        } else {
          body.append(status, node('p', 'kw-note', copy('Read it, then try again without the answer.', '答えを見たら、もう一度、見ずに答えてみよう。')));
          nextFocus = button('retry', copy('Try again', 'もう一度'));
        }
        body.append(nextFocus);
      }
    } else {
      heading.textContent = copy('Practice complete.', '練習完了。');
      body.append(heading, node('p', 'kw-complete-copy', copy('You connected a place, a character and a word. Come back later and see what stays.', '風景、漢字、ことばをつなげました。時間をおいて、また思い出してみよう。')));
      body.append(node('p', 'kw-note', copy('This was a short practice, not a mastery test.', 'これは短い練習です。習得度の判定ではありません。')));
      body.append(button('return', copy('Return to learning', '学習に戻る')));
    }
    root.append(body);
    if (focus) nextFocus.focus({ preventScroll: true });
  }
  function checkAnswer() {
    if (destroyed || (stage !== 3 && stage !== 4) || feedback === 'correct' || feedback === 'revealed') return;
    draft = answerInput?.value || '';
    if (!draft.trim()) feedback = 'empty';
    else feedback = (stage === 3 ? normalizeReading(draft) === normalizeReading(reading) : meaningAnswers.has(normalizeMeaning(draft))) ? 'correct' : 'wrong';
    render();
  }
  function click(event) {
    if (destroyed || !root.contains(event.target)) return;
    if (!isCurrent()) { finishReturn(); return; }
    const control = event.target.closest?.('[data-kw-action]');
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.kwAction;
    if (action === 'return') { finishReturn(); return; }
    if (action === 'next' && (stage < 3 || feedback === 'correct')) {
      stage = Math.min(stage + 1, 5); feedback = null; draft = ''; render();
    } else if (action === 'reveal' && (stage === 3 || stage === 4) && feedback !== 'correct') {
      feedback = 'revealed'; draft = ''; render();
    } else if (action === 'retry' && feedback === 'revealed') {
      feedback = null; draft = ''; render();
    }
  }
  function submit(event) {
    if (destroyed || !root.contains(event.target) || event.target.dataset.kwForm !== 'answer') return;
    event.preventDefault();
    if (!isCurrent()) { finishReturn(); return; }
    checkAnswer();
  }
  function keydown(event) {
    if (!destroyed && event.key === 'Escape' && !event.isComposing) { event.preventDefault(); finishReturn(); }
  }
  function imageError(event) {
    if (!destroyed && stage === 0 && event.target.classList?.contains('kw-image')) {
      if (!isCurrent()) { finishReturn(); return; }
      imageFailed = true;
      // Keep the heading and controls intact so an asynchronous image failure
      // does not remove the keyboard user's focused element.
      event.target.replaceWith(node('p', 'kw-image-fallback', copy('The scene is unavailable. You can still practise the character.', '風景を表示できません。漢字の練習は続けられます。')));
    }
  }
  const listeners = [['click', click, false], ['submit', submit, false], ['keydown', keydown, false], ['error', imageError, true]];
  for (const [type, listener, capture] of listeners) root.addEventListener(type, listener, capture);
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const [type, listener, capture] of listeners) root.removeEventListener(type, listener, capture);
    root.remove();
    answerInput = null;
  }
  container.append(root);
  render();
  return { destroy };
}

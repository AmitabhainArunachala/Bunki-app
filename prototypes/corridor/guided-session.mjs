/**
 * 案内つきの稽古 — the guided session room (S.view === 'guided').
 *
 * Codex's living-thread prototype (bunki_experience/2026-09-23/guided-session) in the fused
 * study's register (bunki_review/2026-09-23/designs/living-thread-fused), carried into the app:
 * arrival → six written questions → optional explanations and word/grammar branches that
 * return to the same place → results and Learn → a fresh context → an optional sentence of
 * one's own → the return field.
 *
 * What is real here
 *   - 覚える: every card the room adds or removes goes through host.deck, which corridor.js
 *     implements with toggleTaken — the reader's own 覚える door. The room never writes the
 *     learner record itself.
 *   - Learn and the return field read the learner's real deck rows back (in the deck, new,
 *     ready to review, removed), not a local copy.
 *   - Session progress (answers, place, drafts, Learn rows) persists on this device under
 *     `kairo-guided-session-v1:<set id>`, loaded and saved through guided-session-engine.mjs.
 */

import { loadGuidedState, reduceGuidedState, saveGuidedState } from './guided-session-engine.mjs';
import { loadGuidedIndex, loadGuidedSet } from './guided-session-content.mjs';

const STATE_PREFIX = 'kairo-guided-session-v1';
/* A sibling's address, or the one the single-file handoff supplies: there this module runs from
 * a blob: URL, which no relative address resolves against (build-standalone.mjs). */
const sibling = (path, supplied) => globalThis[supplied] || new URL(path, import.meta.url).href;
const KIND = {
  vocabulary: ['文字・語彙', 'vocabulary'],
  grammar: ['文法', 'grammar'],
  reading: ['読解', 'reading'],
};
const GAP_ORDER = ['読み', '語義', '文法', '表記', '読解'];
const NODE_SPOTS = [
  [20, 14],
  [76, 26],
  [18, 48],
  [76, 62],
  [24, 80],
  [74, 90],
];
const MODE_LABELS = {
  quiet: ['静か', 'quiet'],
  playful: ['遊び', 'playful'],
  dramatic: ['劇的', 'dramatic'],
};

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
/** The set's level as the app's level capsule, in its own colour (FEEL pass 2026-10-02). */
const levelChip = (level) =>
  /^N[1-5]$/u.test(String(level))
    ? `<span class="level-chip" data-level="${esc(level)}">${esc(level)}</span>`
    : esc(level);
const keyOf = (node) => `${node.t}:${node.id}`;
const nodeOf = (key) => {
  const at = key.indexOf(':');
  return { t: key.slice(0, at), id: key.slice(at + 1) };
};

let stylesheet = null;
function ensureStylesheet() {
  if (stylesheet) return stylesheet;
  stylesheet = new Promise((resolve, reject) => {
    const present = document.querySelector('link[data-guided-style]');
    if (present?.sheet) {
      resolve(true);
      return;
    }
    const link = present || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = sibling('./guided-session.css', '__KAIRO_GUIDED_STYLE_URL__');
    link.dataset.guidedStyle = '';
    link.addEventListener('load', () => resolve(true), { once: true });
    link.addEventListener(
      'error',
      () => {
        link.remove();
        stylesheet = null;
        reject(new Error('guided-style-unavailable'));
      },
      { once: true },
    );
    if (!present) document.head.append(link);
  });
  return stylesheet;
}

function defaultFetchJson(path) {
  return fetch(new URL(path, document.baseURI)).then((response) => {
    if (!response.ok) throw new Error(`${path} → ${response.status}`);
    return response.json();
  });
}

export function createGuidedSession(host) {
  const english = () => host.english();
  const t = (ja, en) => (english() ? en : ja);
  /** Chrome uses the chosen language; Japanese exercises keep their own markup. */
  const bi = (ja, en) =>
    english()
      ? `<span lang="en">${en}</span>`
      : `<span lang="ja">${ja}</span>`;
  const storage = (() => {
    try {
      return host.storage();
    } catch {
      return null;
    }
  })();
  const fetchJson = host.fetchJson || defaultFetchJson;
  /** The samurai, the rematch and the crane (guided-moments.mjs) are presentation only: the
   * room works the same without them, so a module that cannot load leaves only the cut. */
  let moments = null;
  const loadMoments = () =>
    Promise.resolve()
      .then(() => import(sibling('./guided-moments.mjs', '__KAIRO_GUIDED_MOMENTS_URL__')))
      .then((module) =>
        module.loadMoments({ storage, english, openReport: host.openReport || null }),
      )
      .catch(() => null);

  let set = null;
  let Q = [];
  let loading = null;
  let failure = null;
  let state = null;
  let saveError = null;
  let previousSession = null;
  let setAside = false;
  let storageKey = '';
  let previousKey = '';
  let words = {};
  let wordPattern = null;
  let wordForSurface = new Map();
  let root = null;

  const selected = {};
  const freshSelected = {};
  let branch = null;
  let branchOpener = null;
  let branchScroll = 0;
  let wordDetail = null;
  let wordSourceId = null;
  let wordReturnScroll = 0;
  let wordOpener = null;
  let wordOpenerIndex = 0;
  let showReadings = false;
  let notice = '';
  let confirmingReset = false;
  let deckBusy = false;
  let enrolling = false;
  let after = null;

  /* ------------------------------------------------------------------ state */
  function load() {
    loading ||= Promise.all([
      ensureStylesheet(),
      loadGuidedIndex(fetchJson).then((entries) => loadGuidedSet(entries[0], fetchJson)),
      moments ? Promise.resolve(moments) : loadMoments(),
    ])
      .then(([, loaded, loadedMoments]) => {
        moments = loadedMoments;
        set = loaded;
        Q = set.questions;
        words = set.words;
        const keys = Object.keys(words).sort(
          (a, b) => words[b].surface.length - words[a].surface.length,
        );
        const pattern = keys.map((key) =>
          words[key].surface.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
        );
        wordPattern = new RegExp(`(${pattern.join('|')})`, 'gu');
        wordForSurface = new Map(keys.map((key) => [words[key].surface, key]));
        storageKey = `${STATE_PREFIX}:${set.id}`;
        previousKey = `${storageKey}:previous`;
        const ids = Q.map((q) => q.id);
        const stored = loadGuidedState(storage, storageKey, set.id, ids);
        state = stored.state;
        saveError = null;
        if (stored.error === 'invalid-state') {
          // never overwrite what cannot be read: the unreadable bytes are kept aside
          try {
            storage?.setItem(`${storageKey}:unreadable`, storage.getItem(storageKey));
            setAside = true;
          } catch {
            saveError = 'storage-unavailable';
          }
        } else if (stored.error) saveError = stored.error;
        try {
          if (storage?.getItem(previousKey)) {
            const previous = loadGuidedState(storage, previousKey, set.id, ids);
            if (!previous.error) previousSession = previous.state;
          }
        } catch {
          previousSession = null;
        }
        failure = null;
        void moments?.preload();
        // enrolment starts before the draw, so the draw already holds 外す while cards are written
        if (
          state.learn.some(
            (row) => !row.removed && row.cards.some((card) => card.status === 'pending'),
          )
        ) {
          void enrolPending();
        }
        after = { top: true };
        host.render();
      })
      .catch((error) => {
        failure = error;
        loading = null;
        host.render();
      });
    return loading;
  }

  function emit(type, fields = {}) {
    const next = reduceGuidedState(state, { type, ...fields });
    if (next === state) return false;
    state = next;
    const result = saveGuidedState(storage, storageKey, state);
    saveError = result.error;
    return true;
  }

  const current = () => Q[Math.max(0, Math.min(state.index, Q.length - 1))];
  const answer = (q) => state.answers[q.id];
  /** Help before the first answer: an explanation opened, or a word looked up. */
  const assisted = (a) => a.helpBefore || a.lookupBefore === true;
  const activeLearn = () => state.learn.filter((row) => !row.removed);
  const learnRow = (id) => state.learn.find((row) => row.id === id);
  const target = () => Q.find((q) => q.id === state.selectedTarget) || preferred();
  const preferred = () =>
    Q.find(
      (q) => activeLearn().some((row) => row.id === q.id && !row.reviewed) && q.kind === 'grammar',
    ) ||
    Q.find((q) => activeLearn().some((row) => row.id === q.id && !row.reviewed)) ||
    Q[Math.min(2, Q.length - 1)];
  const fresh = () =>
    set.fresh.byTarget[target().target.key] || set.fresh.byKind[target().kind] || set.fresh.default;
  const answered = () => Q.filter((q) => answer(q).choice !== null).length;
  const countRight = () => Q.filter((q) => answer(q).correct === true).length;
  const last = () => state.index >= Q.length - 1;
  const kindLabel = (q) => KIND[q.kind] || [q.kind, q.kind];
  const wordNode = (key) => ({ t: 'word', id: words[key].surface });
  const saveText = () =>
    saveError
      ? t(
          'この端末に保存できない · このタブを開いたままに',
          'Saving unavailable · keep this tab open',
        )
      : t('この端末に保存', 'Saved on this device');

  function announce(text) {
    let region = document.getElementById('guided-announcement');
    if (!region) {
      region = document.createElement('p');
      region.id = 'guided-announcement';
      region.className = 'gs-sr-only';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.append(region);
    }
    region.textContent = '';
    requestAnimationFrame(() => {
      region.textContent = text;
    });
  }

  /** Draw again through the app, then apply one follow-up (scroll, focus, a moment). */
  function redraw(then = null) {
    // a late answer (a deck write, a copy) after the learner left the room draws nothing
    if (root && !root.isConnected && !document.querySelector('.guided-room')) {
      after = null;
      return;
    }
    after = then;
    host.render();
  }
  function go(view, fields = {}) {
    branch = null;
    wordDetail = null;
    notice = '';
    emit('NAVIGATE', { view, ...fields });
    redraw({ top: true });
  }
  function clearSelections() {
    for (const values of [selected, freshSelected])
      Object.keys(values).forEach((key) => delete values[key]);
    branch = null;
    branchOpener = null;
    branchScroll = 0;
    wordDetail = null;
  }

  /* ------------------------------------------------------------------- deck */
  function cardInfo(keys) {
    const infos = host.deck.info(keys.map(nodeOf));
    return new Map(keys.map((key, index) => [key, infos[index]]));
  }
  function deckLine(key, status, info) {
    const node = nodeOf(key);
    const title = esc(host.deck.title(node));
    let text;
    let kind;
    if (info?.taken) {
      kind = info.ready ? 'ready' : 'held-in-deck';
      text = `${t('デッキにある', 'in your deck')} · ${esc(info.when)}`;
    } else if (status === 'held') {
      kind = 'held';
      text = esc(
        host.deck.status(node).reason || t('ここでは覚えられない', 'can’t be learned here'),
      );
    } else if (status === 'failed') {
      kind = 'failed';
      text = t('デッキに入れられなかった', 'couldn’t be added to your deck');
    } else if (status === 'pending') {
      kind = 'pending';
      text = t('デッキに入れている…', 'adding to your deck…');
    } else if (status === 'removed') {
      kind = 'removed';
      text = t('デッキから外した', 'taken out of your deck');
    } else {
      kind = 'gone';
      text = t('いまはデッキにない', 'no longer in your deck');
    }
    return `<span class="gs-card" data-card="${esc(key)}" data-deck="${kind}"><b><span>${t('覚','Learn')}</span> <span lang="ja" data-ui-content="learning">${title}</span></b> <span>${text}</span></span>`;
  }

  /* Every write re-reads the live rows: emit replaces the state, so a walk over the rows it
   * started with never saw a later change, and a call made while a walk runs was dropped — the
   * rows a later FINISH gathered stayed "adding to your deck…" until a reload. Each card is tried
   * once per walk. 外す waits while the walk runs (toggleRow), so no card lands on a removed row. */
  async function enrolPending() {
    const tried = new Set();
    const nextPending = () => {
      for (const row of state.learn) {
        if (row.removed) continue;
        const card = row.cards.find(
          (entry) => entry.status === 'pending' && !tried.has(`${row.id}|${entry.key}`),
        );
        if (card) return { id: row.id, key: card.key };
      }
      return null;
    };
    if (enrolling || !nextPending()) return;
    enrolling = true;
    let added = 0;
    try {
      for (let next = nextPending(); next; next = nextPending()) {
        tried.add(`${next.id}|${next.key}`);
        const node = nodeOf(next.key);
        const status = await host.deck.add(node, host.deck.title(node));
        emit('CARD_RESULT', { id: next.id, card: next.key, status });
        if (status === 'added') added += 1;
      }
    } finally {
      enrolling = false;
    }
    if (added)
      announce(
        t(
          `覚えるデッキに${added}枚入れた。`,
          `${added} card${added === 1 ? '' : 's'} added to your review deck.`,
        ),
      );
    host.render();
  }

  async function toggleRow(id) {
    const row = learnRow(id);
    if (!row || row.reviewed || deckBusy || enrolling) return;
    deckBusy = true;
    notice = '';
    try {
      const infos = cardInfo(row.cards.map((card) => card.key));
      if (!row.removed) {
        let kept = false;
        for (const card of row.cards) {
          if (!infos.get(card.key)?.taken || !['added', 'existing'].includes(card.status)) continue;
          if (card.status === 'existing' || infos.get(card.key)?.studied) {
            kept = true;
            continue;
          }
          const ok = await host.deck.remove(nodeOf(card.key));
          if (!ok) {
            notice = t(
              'この窓では札を外せなかった。行はそのまま。',
              'The card couldn’t be taken out in this window. The row stays.',
            );
            return;
          }
          emit('CARD_RESULT', { id, card: card.key, status: 'removed' });
        }
        emit('UNDO', { id });
        if (kept) {
          notice = t(
            '稽古の前からあった札と、もう復習した札は、デッキに残した。',
            'Cards that were in your deck before this session, or that you have reviewed, stay in your deck.',
          );
        }
        announce(t('覚から外した。', 'Removed from Learn.'));
      } else {
        for (const card of row.cards) {
          if (!['removed', 'failed', 'pending'].includes(card.status)) continue;
          const node = nodeOf(card.key);
          const status = await host.deck.add(node, host.deck.title(node));
          emit('CARD_RESULT', {
            id,
            card: card.key,
            status: status === 'existing' ? 'existing' : status,
          });
        }
        emit('UNDO', { id });
        announce(t('覚に戻した。', 'Restored to Learn.'));
      }
    } finally {
      deckBusy = false;
      redraw({ focus: `[data-action="undo"][data-id="${cssEscape(id)}"]` });
    }
  }

  async function retryCard(id, key) {
    const row = learnRow(id);
    const card = row?.cards.find((entry) => entry.key === key);
    if (!card || deckBusy) return;
    deckBusy = true;
    try {
      const node = nodeOf(key);
      const status = await host.deck.add(node, host.deck.title(node));
      emit('CARD_RESULT', { id, card: key, status });
    } finally {
      deckBusy = false;
      redraw({ focus: `[data-action="retry-card"][data-card="${cssEscape(key)}"]` });
    }
  }

  async function saveWord() {
    const word = words[wordDetail];
    if (!word || deckBusy) return;
    const node = wordNode(wordDetail);
    deckBusy = true;
    notice = '';
    let status;
    try {
      status = await host.deck.add(node, word.surface);
    } finally {
      deckBusy = false;
    }
    if (status === 'added' || status === 'existing') {
      emit('SAVE_WORD', { wordId: wordDetail, id: wordSourceId, status });
      const text =
        status === 'added'
          ? t(
              `${word.surface} · 覚えるデッキに入れた`,
              `${word.surface} · added to your review deck`,
            )
          : t(`${word.surface} · もうデッキにある`, `${word.surface} · already in your deck`);
      redraw({
        focus: '[data-action="close-word"]',
        crane: status === 'added' ? text : null,
        say: text,
      });
      return;
    }
    notice =
      status === 'held'
        ? host.deck.status(node).reason ||
          t('この語はここでは覚えられない。', 'This word can’t be learned here.')
        : t(
            'この窓では保存できなかった。もう一度試すか、再読み込みする。',
            'This window couldn’t save it. Try again, or reload.',
          );
    redraw({ focus: '[data-action="save-word"]' });
  }

  async function removeWord(wordId) {
    const row = state.savedWords.find((entry) => entry.wordId === wordId);
    if (!row || deckBusy) return;
    deckBusy = true;
    notice = '';
    try {
      const key = keyOf(wordNode(wordId));
      const info = cardInfo([key]).get(key);
      if (row.status === 'added' && info?.taken && !info.studied) {
        const ok = await host.deck.remove(wordNode(wordId));
        if (!ok) {
          notice = t(
            'この窓では札を外せなかった。',
            'The card couldn’t be taken out in this window.',
          );
          return;
        }
      } else if (info?.taken) {
        notice = t(
          'この札は稽古の前からあったか、もう復習したので、デッキに残した。',
          'That card was in your deck before this session, or you have reviewed it, so it stays.',
        );
      }
      emit('REMOVE_WORD', { wordId });
      announce(t('言葉の行を外した。', 'Word removed from this list.'));
    } finally {
      deckBusy = false;
      redraw({ focus: '[data-view="learn"]' });
    }
  }

  const cssEscape = (value) =>
    window.CSS?.escape ? CSS.escape(value) : String(value).replace(/"/gu, '\\"');

  /* ------------------------------------------------------------ fragments */
  const btn = (label, action, cls = '', attrs = '') =>
    `<button type="button" class="gs-button ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
  const textBtn = (label, action, attrs = '') =>
    `<button type="button" class="gs-text" data-action="${action}" ${attrs}>${label}</button>`;
  const nav = (label, view) =>
    `<button type="button" class="gs-nav" data-action="nav" data-view="${view}" ${state.view === view && !branch && !wordDetail ? 'aria-current="page"' : ''}>${label}</button>`;

  function itemState(q, infos) {
    const row = state.learn.find((entry) => entry.id === q.id && !entry.removed);
    if (row?.reviewed) return ['practised', t('もう一度練習した', 'Practised again')];
    if (row) {
      const inDeck = row.cards.some((card) => infos.get(card.key)?.taken);
      const ready = row.cards.some((card) => infos.get(card.key)?.ready);
      if (ready) return ['saved due', t('いま復習できる', 'Ready to review')];
      return ['saved', inDeck ? t('デッキにある', 'In your deck') : t('覚にある', 'In Learn')];
    }
    // no Learn row, but the learner's deck already holds this target's card (from here or
    // from anywhere else in Bunki): the field says so, from the real rows
    const keys = q.cards.map(keyOf);
    if (keys.some((key) => infos.get(key)?.ready))
      return ['saved due', t('いま復習できる', 'Ready to review')];
    if (keys.some((key) => infos.get(key)?.taken))
      return ['saved', t('デッキにある', 'In your deck')];
    if (answer(q).choice !== null) return ['encountered', t('出会った', 'Encountered')];
    return ['', t('これから', 'Still ahead')];
  }
  /** The cards this session put into Learn: its active rows' targets and its saved words. */
  function sessionKeys() {
    const keys = new Set();
    for (const row of activeLearn()) for (const card of row.cards) keys.add(card.key);
    for (const row of state.savedWords) keys.add(keyOf(wordNode(row.wordId)));
    return [...keys].filter((key) => nodeOf(key).id);
  }
  /** Everything the field stands for: every question's target cards and the saved words,
   * whether the card came from this session or from anywhere else in the learner's deck. */
  function fieldKeys() {
    const keys = new Set(Q.flatMap((q) => q.cards.map(keyOf)));
    for (const key of sessionKeys()) keys.add(key);
    return [...keys].filter((key) => nodeOf(key).id);
  }
  function fieldMap(infos) {
    return `<div class="gs-field-map ${state.started ? '' : 'gs-empty-field'}">
      <svg viewBox="0 0 500 400" preserveAspectRatio="none" aria-hidden="true"><path d="M90 65 C245 45 220 95 390 110 S230 195 80 195 S200 260 390 260 S260 330 110 330 S230 400 390 375"/><path d="M80 195 C215 255 220 335 390 375"/></svg>
      ${Q.map((q, i) => {
        const [cls, status] = itemState(q, infos);
        const seen = answer(q).choice !== null || answer(q).explained;
        const [left, top] = NODE_SPOTS[i] || [
          i % 2 ? 76 : 20,
          Math.round(10 + (i * 80) / Math.max(1, Q.length - 1)),
        ];
        const label = seen ? q.target.label : t(q.hint.ja, q.hint.en);
        const small = state.started ? status : t(kindLabel(q)[0], kindLabel(q)[1]);
        const aria = seen
          ? `${q.target.label}, ${status}, ${t('元の問題をひらく', 'open the original question')}`
          : `${t(kindLabel(q)[0], kindLabel(q)[1])}, ${t(`問${i + 1}`, `question ${i + 1}`)}, ${t('これから', 'still ahead')}`;
        return `<button type="button" class="gs-node ${cls}" style="left:${left}%;top:${top}%" data-action="source" data-index="${i}" ${seen ? '' : 'disabled'} aria-label="${esc(aria)}" ${seen ? `data-ui-content-value="${esc(q.target.label)}"` : ''}><span ${seen ? 'lang="ja" data-ui-content="learning"' : ''}>${esc(label)}</span><small>${esc(small)}</small></button>`;
      }).join('')}
    </div>`;
  }

  function returnDoor(infos) {
    const ready = [...infos.entries()].filter(([, info]) => info?.ready);
    if (!ready.length) return '';
    const labels = ready.map(([key]) => host.deck.title(nodeOf(key)));
    return `<div class="gs-duecard"><button type="button" data-action="review" data-scope="field"><b>${bi(`復習 · ${ready.length} 件`, `ready to review now · ${ready.length}`)}</b><small lang="ja" data-ui-content="learning">${esc(labels.slice(0, 4).join(' · '))}${labels.length > 4 ? ' …' : ''}</small><span class="gs-go">${bi('始める', 'begin')} →</span></button><button type="button" class="gs-light" data-action="results"><b>${bi(`${set.level} · 前回`, 'last time')}</b><small>${countRight()} / ${answered()} ${bi('正解', 'correct')} · ${activeLearn().length} ${bi('覚に', 'in Learn')}</small></button></div>`;
  }

  function roomBar() {
    return `<nav class="gs-bar" aria-label="${esc(t('案内つきの稽古', 'Guided session'))}"><span class="gs-bar-name">${bi('案内つきの稽古', 'guided session')}</span><span class="gs-bar-doors">${nav(bi('場', 'your field'), 'field')}${nav(bi('覚', 'learn'), 'learn')}${nav(bi('先生', 'sensei'), 'sensei')}${nav(bi('出典', 'about'), 'about')}</span></nav>`;
  }

  function home() {
    const returning = state.finished;
    const infos = cardInfo(fieldKeys());
    const inDeck = [...infos.values()].filter((info) => info?.taken).length;
    return `<section class="gs-arrival"><div class="gs-intro"><span class="gs-eyebrow"><span class="gs-brand-mark" lang="ja">回廊</span> KAIRO <span class="gs-dot">/</span> ${bi('案内つきの練習', 'guided practice')}</span>
      <h1 class="gs-title gs-hero" tabindex="-1">${returning ? t('糸の続きを、<br>たどろう。', 'Pick up<br>your thread.') : t('十五分、<br>日本語と<br>ともに。', 'Spend fifteen<br>minutes with<br>Japanese.')}</h1>
      <p class="gs-lede">${
        returning
          ? t(
              '出会った言葉は、まだここにある。問題に戻るか、見直したいところを練習するか、自分で作った文から始めよう。',
              'The words you met are still here. Return to a question, practise what needs attention, or begin with the sentence you made your own.',
            )
          : t(
              '六つの問題に答え、その奥にある考え方をひらき、ひとつを次の稽古へ持ち帰る。',
              'Try six questions, open the ideas behind them, and carry one into your next visit.',
            )
      }</p>
      ${returning ? returnDoor(infos) : ''}
      <div class="gs-actions">${btn(returning ? bi('場へ', 'explore your field') : state.started ? bi('続きへ', 'continue your session') : bi('はじめる', 'begin a guided session'), returning ? 'field' : state.started ? 'resume' : 'setup', 'primary')}</div>
      <p class="gs-meta">${
        returning
          ? t(
              `${answered()}問に出会った · デッキに${inDeck}枚`,
              `${answered()} questions encountered · ${inDeck} in your deck`,
            )
          : t(
              `${set.level} 筆記の練習 · 約${set.minutes}分 · 自分のペースで`,
              `${set.level} written practice · about ${set.minutes} minutes · at your pace`,
            )
      }</p>
      ${state.draft ? `<div class="gs-personal-line" lang="ja">${esc(state.draft)}</div>` : ''}
    </div><div class="gs-field-preview"><span class="gs-eyebrow">${returning ? bi('あなたの場', 'your return field') : bi('戻ってくる場所', 'a place to return to')}</span>${fieldMap(infos)}<div class="gs-field-caption"><strong>${returning ? t('どの点にも元の問題がある。', 'Each point holds its original question.') : t('場は、いくつかの出会いから始まる。', 'A field begins with a few encounters.')}</strong><span>${returning ? t('点をひらく', 'Open any point') : t('練習するほど育つ', 'Yours grows as you practise')}</span></div></div></section>
    <div class="gs-journey-strip"><div><span class="gs-step">01</span><strong>${bi('出会う', 'encounter')}</strong><p>${t('まず自分の答えを出す。', 'Give the question your own first answer.')}</p></div><div><span class="gs-step">02</span><strong>${bi('糸をたどる', 'follow a thread')}</strong><p>${t('場所を失わずに、意味を探る。', 'Explore the meaning without losing your place.')}</p></div><div><span class="gs-step">03</span><strong>${bi('違う形で戻る', 'return differently')}</strong><p>${t('新しい文で試し、何かを持ち帰る。', 'Try a new context. Bring something with you.')}</p></div></div>`;
  }

  function setup() {
    const perKind = Q.length / 3;
    return `<section class="gs-narrow"><span class="gs-eyebrow">${levelChip(set.level)} ${bi('案内つきの稽古', 'a guided session')}</span><h1 class="gs-title" tabindex="-1">${t('わかるための、<br>小さな部屋。', 'A little room<br>to understand.')}</h1><p class="gs-lede">${t('言葉、文法、短いお知らせ。先に答えても、必要なときに解説をひらいてもいい。', 'Words, grammar, and a short notice. Answer first, or ask for an explanation whenever you need one.')}</p><div class="gs-facts"><div><strong>${t(`${Q.length}問`, `${Q.length} questions`)}</strong><span>${Number.isInteger(perKind) ? t(`各分野${perKind}問`, `${perKind === 2 ? 'Two' : perKind} of each kind`) : t('三つの分野', 'Three kinds')}</span></div><div><strong>${t(`${set.minutes}分`, `${set.minutes} minutes`)}</strong><span>${t('目安で、時間制限ではない', 'A guide, not a timer')}</span></div><div><strong>${t('一本の糸', 'One thread')}</strong><span>${t('次へ持っていく', 'To carry forward')}</span></div></div><p>${t('終わると、間違えた問題と旗を立てた問題が「覚」に入り、その言葉は実際の覚えるデッキの札になる。外すことも、元の問題に戻ることも、新しい例で試すこともできる。', 'At the end, missed and flagged questions go into Learn, and their words become cards in your real review deck. You can remove them, revisit the source, or try a new example.')}</p><details class="gs-details"><summary>${bi('この問題について', 'about these questions')}</summary><p>${esc(t(set.sourceNote.ja, set.sourceNote.en))}</p></details><div class="gs-actions">${btn(bi('最初の問題へ', 'start with the first question'), 'start', 'primary')}${textBtn(bi('戻る', 'back'), 'home')}</div></section>`;
  }

  function rail(phase) {
    return `<nav class="gs-rail" aria-label="${esc(t('稽古の段階', 'Session stages'))}"><span class="gs-rail-item ${phase === 'question' ? 'current' : ''}">01 · ${t('出会う', 'Encounter')}<small>${t('最初の答えを選ぶ', 'Make your first choice')}</small></span><span class="gs-rail-item ${phase === 'insight' ? 'current' : ''}">02 · ${t('わかる', 'Understand')}<small>${t('考えをたどる', 'Follow an idea')}</small></span><span class="gs-rail-item">03 · ${t('持っていく', 'Carry forward')}<small>${t(`${Q.length}問のあとで`, `After ${Q.length} questions`)}</small></span></nav>`;
  }

  function sessionTop() {
    const [ja, en] = kindLabel(current());
    return `<div class="gs-session-top"><span class="gs-eyebrow">${levelChip(set.level)} · ${t(ja,en)}</span><p class="exam-progress gs-count"><span>${state.index + 1} / ${Q.length}</span></p><nav class="gs-progress" aria-label="${esc(t('問題', 'Questions'))}">${Q.map((q, i) => `<button type="button" data-action="source" data-index="${i}" class="${answer(q).choice !== null ? 'done' : ''}" ${i === state.index ? 'aria-current="step"' : ''} aria-label="${esc(t(`問${i + 1}${answer(q).choice !== null ? '・回答済み' : ''}`, `Question ${i + 1}${answer(q).choice !== null ? ', answered' : ''}`))}">${i + 1}</button>`).join('')}</nav></div>`;
  }

  function aside(q) {
    const a = answer(q);
    return `<aside class="gs-aside"><div><h2 class="gs-aside-title">${bi('ここに戻れます。', 'your place is held')}</h2><p>${
      a.choice !== null
        ? t(
            '解説をひらいても、言葉をたどってもいい。最初の答えはこの問題に残る。',
            'You can open an explanation or follow a word. Your first response stays with this question.',
          )
        : t(
            'ゆっくり見ていい。必要なら解説がある。',
            'There is time to look closely. An explanation is here if you need it.',
          )
    }</p>${textBtn(a.flagged ? bi('旗を外す', 'flagged · remove the flag') : bi('あとで見直す', 'flag for another look'), 'flag', `aria-pressed="${a.flagged}"`)}${textBtn(bi('保存して離れる', 'save and leave · your place is kept'), 'leave')}</div><div class="gs-rule"><span class="gs-eyebrow">${t(`問 ${state.index + 1} / ${Q.length}`, `Question ${state.index + 1} of ${Q.length}`)}</span><p>${t('回廊オリジナルの練習', 'Original KAIRO practice')}<br>${set.level} · ${t('筆記', 'written')}</p><details class="gs-details"><summary>${bi('出典', 'source details')}</summary><p>${esc(q.source.label)}<br>${t(`元の問題: ${esc(q.source.status)}（AI審査済みの練習）。追加の解説: 下書き。`, `Original item: ${esc(q.source.status)} (AI-reviewed practice). Added teaching copy: authored draft.`)}</p><p class="gs-source-id">${esc(q.source.ref)}</p></details>${state.finished ? textBtn(bi('場へ戻る', 'back to your field'), 'field') : ''}</div></aside>`;
  }

  function choices(options, value, locked, name, correct) {
    return `<fieldset class="gs-choices"><legend class="gs-instruction ${locked ? '' : 'gs-sr-only'}">${locked ? bi('結果', 'your result') : esc(t('答えを選ぶ。', 'Choose the best answer.'))}</legend><div class="gs-choice-list">${options
      .map((option, i) => {
        const wrong = locked && value === i && i !== correct;
        const right = locked && i === correct;
        const outcome = right
          ? `<small class="gs-outcome" lang="${english() ? 'en' : 'ja'}">${value === i ? t('あなたの答え · 正解', 'Your answer · correct') : t('正解', 'Correct answer')}</small>`
          : wrong
            ? `<small class="gs-outcome" lang="${english() ? 'en' : 'ja'}">${t('あなたの答え · 不正解', 'Your answer · incorrect')}</small>`
            : '';
        return `<label class="gs-choice ${right ? 'is-answer' : wrong ? 'is-wrong' : ''}"><input type="radio" name="${name}" value="${i}" ${value === i ? 'checked' : ''} ${locked ? 'disabled' : ''}><span class="gs-choice-num">${i + 1}</span><span lang="ja" data-ui-content="learning">${esc(option)}</span>${outcome}</label>`;
      })
      .join('')}</div></fieldset>`;
  }

  function verdict(options, choice, correct, detail = '') {
    const ok = choice === correct;
    const icon = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true"><path d="${ok ? 'M4 12l5 5L20 6' : 'M6 6l12 12M18 6L6 18'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const word = ok ? t('正解。', 'Correct.') : t('不正解。', 'Incorrect.');
    return `<div class="gs-feedback ${ok ? 'gs-correct' : 'gs-incorrect'}" role="status" aria-atomic="true" data-verdict="${ok ? 'correct' : 'incorrect'}"><strong class="gs-verdict">${icon}<span>${word}</span></strong>${english() ? `<span class="gs-verdict-ja" lang="ja" aria-hidden="true">${ok ? '正解' : '不正解'}</span>` : ''}<p class="gs-comparison">${t('あなたの答え', 'your answer')}: <span lang="ja" data-ui-content="learning">${esc(options[choice])}</span>${ok ? '' : `<br>${t('正解', 'correct')}: <span lang="ja" data-ui-content="learning">${esc(options[correct])}</span>`}</p>${detail ? `<p>${esc(detail)}</p>` : ''}${!ok && moments ? textBtn(bi('侍をもう一度', 'replay the samurai'), 'samurai-replay') : ''}</div>`;
  }

  function question() {
    const q = current();
    const a = answer(q);
    const locked = a.choice !== null;
    const parts = q.prompt.split('\n');
    const prompt = parts.length > 1 ? parts.slice(1).join('\n') : q.prompt;
    const heading =
      q.kind === 'reading'
        ? bi('お知らせを読む', 'read the notice')
        : q.kind === 'vocabulary'
          ? bi('言葉とその場', 'a word in its world')
          : bi('文を完成させる', 'complete the sentence');
    const next = last() ? bi('終える', 'finish') : bi('次へ', 'next');
    const actions = locked
      ? a.correct
        ? `${btn(next, 'next', 'primary')}${textBtn(bi('なぜ？ — 解説を見る', 'see why'), 'explain')}`
        : `${btn(a.explained ? bi('解説をもう一度', 'read the explanation again') : bi('なぜ？ — 解説を見る', 'see why'), 'explain', 'primary')}${btn(next, 'next', 'quiet')}`
      : `${btn(bi('答える', 'check answer'), 'check', 'primary', selected[q.id] === undefined ? 'disabled' : '')}${textBtn(bi('先に解説を見る（助けありと記録）', 'explanation first · marked assisted'), 'explain')}`;
    const detail = locked
      ? a.helpBefore
        ? t('答える前に解説をひらいた。', 'You opened an explanation before answering.')
        : a.lookupBefore
          ? t('答える前に語を調べた。', 'You looked up a word before answering.')
          : ''
      : '';
    return `${sessionTop()}<div class="gs-thread">${rail('question')}<article class="gs-sheet" data-question="${esc(q.id)}"><span class="gs-eyebrow">${bi('出会い', 'encounter')} ${String(state.index + 1).padStart(2, '0')}</span><h1 class="gs-title" tabindex="-1">${heading}</h1>${q.passage ? `<div class="gs-passage" lang="ja">${esc(q.passage)}</div>` : ''}${parts.length > 1 ? `<p class="gs-instruction" lang="ja">${esc(parts[0])}</p>` : ''}<p class="gs-question" lang="ja">${esc(prompt)}</p>${choices(q.options, locked ? a.choice : selected[q.id], locked, 'answer', q.correct)}${locked ? verdict(q.options, a.choice, q.correct, detail) : a.helpBefore ? `<p class="gs-side-note">${t('解説をひらいた · この答えは「助けあり」と記録される。', 'Explanation opened · this answer will be marked as assisted.')}</p>` : a.lookupBefore ? `<p class="gs-side-note">${t('語を調べた · この答えは「助けあり」と記録される。', 'Word looked up · this answer will be marked as assisted.')}</p>` : ''}<div class="gs-actions">${actions}</div>${state.index > 0 ? `<div class="gs-return-link">${textBtn(`← ${bi('前の問題', 'previous')}`, 'previous')}</div>` : ''}</article>${aside(q)}</div>`;
  }

  function teachingText(text, q = current()) {
    return String(text)
      .split(wordPattern)
      .map((part) => {
        const key = wordForSurface.get(part);
        const word = words[key];
        if (!word) return esc(part);
        const reading = showReadings || q.target.label.includes(word.surface);
        return `<button type="button" class="gs-word" data-ui-content="learning" data-action="word" data-word="${key}" lang="ja">${esc(part)}${reading ? `<span class="gs-reading">（${esc(word.reading)}）</span>` : ''}</button>`;
      })
      .join('');
  }
  function targetLine(q) {
    return `<p class="gs-target"><span lang="ja">${esc(q.target.label)}${q.target.reading !== q.target.label ? `<span class="gs-reading">（${esc(q.target.reading)}）</span>` : ''}</span><span>${esc(q.target.meaning)}</span></p>`;
  }
  function completeSentence(q) {
    const sentence = q.prompt.split('\n').slice(-1)[0];
    return teachingText(
      sentence.replace('（　）', q.options[q.correct]).replace('【', '').replace('】', ''),
      q,
    );
  }

  function explanation() {
    const q = current();
    const a = answer(q);
    const x = q.explanation;
    const anchor =
      a.choice === null
        ? t(
            `問${state.index + 1} · 答える前の解説`,
            `Question ${state.index + 1} · Explanation before answering`,
          )
        : `${t(`問${state.index + 1} · 最初の答え`, `Question ${state.index + 1} · Your first answer`)}: <strong lang="ja">${esc(q.options[a.choice])}</strong>${assisted(a) ? t(' · 助けあり', ' · assisted') : ''}`;
    const primary =
      a.choice === null
        ? btn(bi('問題に戻る', 'return to your answer'), 'question', 'primary')
        : btn(last() ? bi('終える', 'finish') : bi('次へ', 'next'), 'next', 'primary');
    return `${sessionTop()}<div class="gs-thread">${rail('insight')}<article class="gs-sheet gs-lacquer" data-question="${esc(q.id)}"><div class="gs-anchor">${anchor}</div><span class="gs-eyebrow">${bi('解説', 'understand')}</span><h1 class="gs-title" tabindex="-1" data-ui-content="learning">${esc(q.title)}</h1>${targetLine(q)}<div class="gs-reading-controls">${textBtn(showReadings ? bi('読みを隠す', 'hide supporting readings') : bi('読みを表示', 'show supporting readings'), 'readings', `aria-pressed="${showReadings}"`)}<span>${t('語をひらくと、読みと意味が出る。', 'Open a word for its reading and meaning.')}</span></div>${q.passage ? `<div class="gs-passage" lang="ja">${teachingText(q.passage, q)}</div><p class="gs-question" lang="ja">${teachingText(q.options[q.correct], q)}</p>` : `<p class="gs-completed" lang="ja">${completeSentence(q)}</p>`}<p class="gs-meaning">${esc(x.meaning)}</p><div class="gs-teaching"><p>${teachingText(x.rule, q)}</p><p>${teachingText(x.contrast, q)}</p></div><div class="gs-example"><span class="gs-eyebrow">${bi('もう一文', 'in another sentence')}</span><p lang="ja">${teachingText(x.exampleJa, q)}</p><small>${esc(x.exampleEn)}</small></div>${q.branches.length ? `<span class="gs-eyebrow">${bi('言葉の扉', 'every word is a door')}</span><div class="gs-branch-links">${q.branches.map((key) => `<button type="button" data-action="branch" data-key="${esc(key)}" lang="ja" data-ui-content="learning">${esc(set.branches[key].title)} <span aria-hidden="true">↗</span></button>`).join('')}</div>` : ''}<div class="gs-actions">${primary}${a.choice !== null ? textBtn(bi('問題へ', 'back to the question'), 'question') : ''}${state.finished ? textBtn(bi('先生に聞く', 'ask Sensei'), 'sensei-current') : ''}</div></article>${aside(q)}</div>`;
  }

  function branchView() {
    const b = set.branches[branch];
    return `${sessionTop()}<div class="gs-thread">${rail('insight')}<article class="gs-sheet gs-lacquer gs-branch"><div class="gs-branch-back">${textBtn(`← ${bi('文へ戻る', 'return to the sentence')}`, 'close-branch')}</div><span class="gs-eyebrow">${bi('言葉の扉', `a branch of question ${state.index + 1}`)}</span><h1 class="gs-title" tabindex="-1" lang="ja" data-ui-content="learning">${esc(b.title)}<span class="gs-branch-reading">${esc(b.reading)}</span></h1><p class="gs-meaning">${esc(b.meaning)}</p><p class="gs-teaching">${teachingText(b.body)}</p><div class="gs-example"><p lang="ja">${teachingText(b.exampleJa)}</p><small>${esc(b.exampleEn)}</small></div><p class="gs-side-note">${bi('答えも場所もそのままです。', 'your answer and place are unchanged')}</p></article>${aside(current())}</div>`;
  }

  function wordView() {
    const word = words[wordDetail];
    const q = Q.find((entry) => entry.id === wordSourceId) || current();
    const node = wordNode(wordDetail);
    const status = host.deck.status(node);
    const key = keyOf(node);
    const info = cardInfo([key]).get(key);
    const taken = status.state === 'taken';
    const learn = taken
      ? btn(bi('覚える ✓', 'in your deck'), 'save-word', 'primary', 'disabled aria-disabled="true"')
      : btn(
          bi('覚える', 'learn this word'),
          'save-word',
          'primary',
          status.state === 'held' || deckBusy ? 'disabled' : '',
        );
    return `<section class="gs-narrow gs-word-room"><div class="gs-branch-back">${textBtn(`← ${bi('元の場所へ', 'back to where you were')}`, 'close-word')}</div><h1 class="gs-title" tabindex="-1" lang="ja" data-ui-content="learning">${esc(word.surface)}<span class="gs-branch-reading">${esc(word.reading)}</span></h1><p class="gs-meaning">${esc(word.meaning)}</p><p class="gs-side-note">${esc(word.source)} · ${t('辞書の意味。文脈は元の文にある。', 'Dictionary meaning. The original sentence provides its context.')}</p>${notice ? `<p class="gs-notice" role="status">${esc(notice)}</p>` : ''}<div class="gs-actions">${learn}${textBtn(bi('文へ戻る', 'return to the sentence'), 'close-word')}${textBtn(bi('辞書で開く', 'open the full entry'), 'entry')}</div>${taken ? `<p class="gs-deck-line">${deckLine(key, 'added', info)}</p>` : status.state === 'held' ? `<p class="gs-side-note" data-held>${esc(status.reason)}</p>` : ''}<p class="gs-side-note gs-spaced">${t(`出典: ${esc(q.source.label)}。「覚える」を押すと、実際の覚えるデッキに札が一枚加わる。答えの記録は変わらない。`, `From ${esc(q.source.label)}. Learning a word adds one card to your real review deck. Your recorded answer is unchanged.`)}</p></section>`;
  }

  function summary() {
    const n = answered();
    return `<section class="gs-narrow"><span class="gs-eyebrow">${bi('続ける前に', 'before you carry on')}</span><h1 class="gs-title" tabindex="-1">${bi('最後にもう一度。', 'take one last look')}</h1><p class="gs-lede">${t(`${Q.length}問中${n}問に答えた。`, `${n} of ${Q.length} answered.`)} ${n < Q.length ? t('未回答の問題は、そのまま残る。', 'Unanswered questions will stay unanswered.') : t('どの問題にも戻れる。それから、持っていくものを集めよう。', 'You can revisit any question, then gather what you want to carry forward.')}</p>${Q.map(
      (q, i) => {
        const a = answer(q);
        const outcome =
          a.choice === null
            ? bi('未回答', 'not answered')
            : a.correct
              ? bi('正解', 'correct')
              : bi('不正解', 'incorrect');
        return `<div class="gs-row ${a.correct === false ? 'missed' : ''}"><span class="gs-row-number">${String(i + 1).padStart(2, '0')}</span><div><h2 class="gs-row-title">${bi(kindLabel(q)[0], kindLabel(q)[1])}</h2><p>${outcome}${assisted(a) ? ` · ${bi('助けあり', 'assisted')}` : ''}${a.flagged ? ` · ${bi('旗', 'flagged')}` : ''}</p></div><div class="gs-row-actions">${textBtn(bi('見直す', 'revisit'), 'source', `data-index="${i}"`)}</div></div>`;
      },
    ).join(
      '',
    )}<div class="gs-actions">${btn(bi('まとめる', 'gather this session'), 'finish', 'primary')}${textBtn(bi('続ける', 'keep practising'), 'question')}</div></section>`;
  }

  function gapLine() {
    const missed = Q.filter((q) => answer(q).correct === false);
    if (!missed.length) return '';
    const counts = {};
    for (const q of missed) counts[q.gap.ja] = (counts[q.gap.ja] || 0) + 1;
    const order = [...GAP_ORDER, ...Object.keys(counts).filter((gap) => !GAP_ORDER.includes(gap))];
    return `<p class="gs-gap-line">${order
      .filter((gap) => counts[gap])
      .map((gap) => `<span><b>${esc(t(gap,Q.find(q=>q.gap.ja===gap).gap.en))}</b> ${counts[gap]}</span>`)
      .join(
        '<i>·</i>',
      )}${english() ? '<small class="gs-gloss">where the misses were</small>' : ''}</p>`;
  }

  function followups() {
    if (!state.learn.length) {
      return `<p class="gs-rule gs-muted">${t('この稽古で間違えた問題や旗を立てた問題はない。問題は場に残っている。', 'No missed or flagged items from this session. Your questions are still in the return field.')}</p>`;
    }
    const infos = cardInfo([
      ...new Set(state.learn.flatMap((row) => row.cards.map((card) => card.key))),
    ]);
    return state.learn
      .map((row) => {
        const q = Q.find((entry) => entry.id === row.id);
        if (!q) return '';
        const i = Q.indexOf(q);
        const missed = answer(q).correct === false;
        const cls = row.removed
          ? 'removed'
          : row.reviewed
            ? 'practised'
            : missed
              ? 'missed'
              : 'flagged';
        const status = row.removed
          ? t('覚から外した', 'Removed from Learn')
          : row.reviewed
            ? t('この稽古でもう一度練習した', 'Practised again in this session')
            : `${missed ? t('この稽古で間違えた', 'Missed in this session') : t('旗を立てた', 'Flagged by you')} · ${t('見直せる', 'ready to revisit')}`;
        const cards = row.cards.length
          ? row.cards
              .map((card) => {
                const info = infos.get(card.key);
                const retry =
                  !row.removed &&
                  (card.status === 'failed' ||
                    (!info?.taken && ['added', 'existing'].includes(card.status)))
                    ? textBtn(
                        bi('もう一度覚える', 'learn it again'),
                        'retry-card',
                        `data-id="${esc(row.id)}" data-card="${esc(card.key)}"`,
                      )
                    : '';
                return `<span class="gs-card-line">${deckLine(card.key, card.status, info)}${retry}</span>`;
              })
              .join('')
          : `<span class="gs-card-line"><span class="gs-card" data-deck="none">${t('この型の札は、まだ回廊にない。行が元の問題を覚えている。', 'KAIRO has no card for this pattern yet. The row keeps your question.')}</span></span>`;
        const practise = !row.removed
          ? textBtn(
              row.reviewed ? bi('もう一度', 'revisit practice') : bi('練習', 'practise'),
              'practice',
              `data-id="${esc(q.id)}"`,
            )
          : '';
        const undo = !row.reviewed
          ? textBtn(
              row.removed ? bi('戻す', 'restore') : bi('外す', 'remove'),
              'undo',
              `data-id="${esc(q.id)}" ${deckBusy || enrolling ? 'disabled' : ''}`,
            )
          : '';
        return `<div class="gs-row ${cls}" data-learn-row="${esc(q.id)}"><span class="gs-row-number">${i + 1}</span><div><h3><span lang="ja" data-ui-content="learning">${esc(q.target.label)}</span> <span class="gs-gap-tag"><b>${esc(t(q.gap.ja,q.gap.en))}</b></span></h3><p>${status}</p><p class="gs-cards">${cards}</p>${textBtn(bi('元の問題へ', 'open original question'), 'source', `data-index="${i}"`)}</div><div class="gs-row-actions">${practise}${undo}</div></div>`;
      })
      .join('');
  }

  function results() {
    const q = preferred();
    const help = Q.filter((entry) => assisted(answer(entry))).length;
    const wrong = Q.filter(
      (entry) => answer(entry).correct === false && !assisted(answer(entry)),
    ).length;
    return `<section class="gs-results"><div><span class="gs-eyebrow">${bi('今日の結果', 'what you met today')}</span><h1 class="gs-title gs-score" tabindex="-1">${countRight()} <span class="gs-of">${t(`/ ${answered()}`, `of ${answered()}`)}</span><small class="gs-h-sub">${bi('最初の答えが正解', 'correct first answers')}</small></h1><p class="gs-lede">${activeLearn().length ? t('見直したいところを下に集めた。文脈がまだ近いうちに、一つから始めよう。', 'The places that need another look are gathered below. Begin with one, while the context is still close.') : t('小さな問題のまとまり。もっと深く行ける。文法を、違う場面でもう一度試してみよう。', 'A small set of questions, with room to go deeper. Try the grammar once more in a different situation.')}</p><div class="gs-results-facts"><div><strong>${wrong}</strong><span>${bi('不正解', 'incorrect')}</span></div><div><strong>${help}</strong><span>${bi('助けあり', 'assisted')}</span></div><div><strong>${Q.length - answered()}</strong><span>${bi('未回答', 'unanswered')}</span></div></div>${gapLine()}<p class="gs-side-note">${t('案内つきの筆記練習で、JLPT の得点やレベルの判定ではない。', 'This is guided written practice, not a JLPT score or level estimate.')}</p><div class="gs-spaced"><h2>${bi('覚に入ったもの', 'kept in Learn')}</h2>${notice ? `<p class="gs-notice" role="status">${esc(notice)}</p>` : ''}${followups()}</div><div class="gs-actions">${textBtn(bi('場へ', 'your return field'), 'field')}</div></div><aside class="gs-focus"><span class="gs-eyebrow">${bi('次の一歩', 'one useful next step')}</span><div class="gs-focus-target" lang="ja">${esc(q.target.label)}</div><p>${esc(q.target.meaning)}. ${t('解説なしで、違う文で試してみよう。', 'Try it in a different context, without the explanation beside you.')}</p>${btn(bi('新しい文で試す', 'try a fresh context'), 'practice', 'primary', `data-id="${esc(q.id)}"`)}<div class="gs-spaced gs-rule"><p>${t('先生と話してみる？', 'Want to talk it through?')}</p>${textBtn(bi('先生への質問を用意する', 'prepare a question for Sensei'), 'sensei-target', `data-id="${esc(q.id)}"`)}</div></aside></section>`;
  }

  function savedWordsView() {
    if (!state.savedWords.length) return '';
    const infos = cardInfo(state.savedWords.map((row) => keyOf(wordNode(row.wordId))));
    return `<div class="gs-spaced"><h2>${bi('覚えるに入れた言葉', 'words you learned')}</h2>${state.savedWords
      .map((row) => {
        const word = words[row.wordId];
        if (!word) return '';
        const key = keyOf(wordNode(row.wordId));
        const index = Q.findIndex((q) => q.id === row.sourceId);
        return `<div class="gs-row" data-saved-word="${esc(row.wordId)}"><span class="gs-row-number">${t('覚','Learn')}</span><div><h3><button type="button" class="gs-text" lang="ja" data-ui-content="learning" data-action="word" data-word="${esc(row.wordId)}" data-source="${esc(row.sourceId)}">${esc(word.surface)}<span class="gs-reading">（${esc(word.reading)}）</span></button></h3><p>${esc(word.meaning)}</p><p class="gs-cards"><span class="gs-card-line">${deckLine(key, row.status, infos.get(key))}</span></p>${textBtn(bi('元の問題へ', 'open original question'), 'source', `data-index="${index}"`)}</div><div class="gs-row-actions">${textBtn(bi('外す', 'remove'), 'remove-word', `data-word="${esc(row.wordId)}" ${deckBusy ? 'disabled' : ''}`)}</div></div>`;
      })
      .join('')}</div>`;
  }

  function deckSummary() {
    const infos = cardInfo(sessionKeys());
    const inDeck = [...infos.values()].filter((info) => info?.taken).length;
    const ready = [...infos.values()].filter((info) => info?.ready).length;
    return `<div class="gs-deck-summary gs-spaced"><p>${t(`この稽古の札: デッキに${inDeck}枚 · いま復習できる${ready}枚`, `This session’s cards: ${inDeck} in your deck · ${ready} ready to review now`)}</p><div class="gs-actions">${ready ? btn(bi(`復習する · ${ready}`, `review these now · ${ready}`), 'review', 'primary', 'data-scope="session"') : ''}${btn(bi('覚えるデッキを開く', 'open your review deck'), 'deck', ready ? 'quiet' : '')}</div></div>`;
  }

  function learn() {
    return `<section class="gs-narrow"><span class="gs-eyebrow">${bi('覚', 'learn')} <span class="gs-dot">/</span> ${bi('覚える', 'oboeru')}</span><h1 class="gs-title" tabindex="-1">${bi('もう一度、会いに行く。', 'worth another visit')}</h1><p class="gs-lede">${t('間違えた問題と旗を立てた問題は、最初に出会った場所とつながったまま。', 'Missed questions and the ones you flagged stay connected to where you first met them.')}</p>${notice ? `<p class="gs-notice" role="status">${esc(notice)}</p>` : ''}<div class="gs-spaced"><h2 class="gs-sr-only">${t('見直す問題', 'Questions to revisit')}</h2>${followups()}</div>${savedWordsView()}${deckSummary()}<p class="gs-side-note gs-spaced">${t('ここで加えた札は、ほかの札と同じ覚えるデッキに入る。行を外すと、この稽古で加え、まだ復習していない札だけが抜ける。', 'Cards added here join your review deck with every other card. Removing a row takes out only a card this session added and you have not reviewed yet.')}</p><div class="gs-actions">${btn(bi('場へ戻る', 'back to your field'), 'field', 'primary')}${!state.finished ? textBtn(state.started ? bi('続きへ', 'continue session') : bi('はじめる', 'begin session'), state.started ? 'resume' : 'setup') : textBtn(bi('結果へ', 'session results'), 'results')}</div></section>`;
  }

  function freshView() {
    const q = target();
    const f = fresh();
    const a = state.fresh;
    const value = a.choice ?? freshSelected[q.id];
    const body = a.revealed
      ? `${verdict(f.options, a.choice, f.correct, f.explanation)}<div class="gs-actions">${btn(bi('自分の言葉で', 'carry it into your own words'), 'expression', 'primary')}${textBtn(bi('場へ', 'return to your field'), 'record-return')}</div>`
      : `<div class="gs-actions">${btn(bi('答える', 'check this first try'), 'check-fresh', 'primary', a.choice === null && freshSelected[q.id] === undefined ? 'disabled' : '')}</div>`;
    return `<section class="gs-narrow"><span class="gs-eyebrow">${bi('持っていく', 'carry forward')} <span class="gs-dot">/</span> ${bi('新しい文', 'a fresh context')}</span><h1 class="gs-title" tabindex="-1">${t('もう一度、その考えに出会う。', 'Meet the idea again.')}</h1><p class="gs-lede">${t('解説なしの、新しい場面。ゆっくりでいい。', 'A new situation, without the explanation alongside it. Take your time.')}</p><article class="gs-sheet gs-spaced" data-fresh="${esc(q.target.key)}"><p class="gs-question gs-pre" lang="ja">${esc(f.prompt)}</p>${choices(f.options, value, a.revealed, 'fresh-answer', f.correct)}${body}</article><p class="gs-side-note gs-spaced">${t('この練習は解説のあとのもの。元の答えは変わらず、長期の記憶を測るものでもない。新しい文は下書きの教材。', 'This new practice follows the explanation. It does not change your original answer or measure long-term recall. The fresh sentence is authored draft material.')}</p>${textBtn(bi('覚へ', 'back to Learn'), 'learn')}</section>`;
  }

  function expression() {
    const q = target();
    return `<section class="gs-narrow"><div class="gs-end-mark"></div><span class="gs-eyebrow">${bi('少しだけ自分のものに', 'make a little of it yours')}</span><h1 class="gs-title" tabindex="-1">${t('あなたなら、どう言う？', 'What would you say?')}</h1><p class="gs-lede">${
      q.kind === 'reading'
        ? t(
            '誰かに残すお知らせを考えてみよう。役に立つ指示を一つ、またはその理由を書く。',
            'Think of a notice you might leave for someone. Write one useful instruction or explain the reason behind it.',
          )
        : t(
            `${esc(q.target.label)} を使って、自分の生活のことを一文書いてみよう。`,
            `Try a sentence with ${esc(q.target.label)} about something in your own life.`,
          )
    }</p><label class="gs-draft-label" for="guided-draft">${bi('あなたの文', 'your sentence · optional')}</label><textarea id="guided-draft" class="gs-draft" lang="ja" placeholder="${esc(t('日本語で、自分のペースで。', 'Write in Japanese, at your own pace.'))}">${esc(state.draft)}</textarea><p id="guided-draft-status" class="gs-side-note">${state.draft ? saveText() : t('この端末だけの下書き。自動の添削や採点はない。', 'A private draft on this device. No automatic correction or grading.')}</p><div class="gs-actions">${btn(bi('場へ持ち帰る', 'bring this back to my field'), 'record-return', 'primary')}${textBtn(bi('新しい文へ', 'revisit the fresh question'), 'fresh')}</div></section>`;
  }

  function field() {
    const infos = cardInfo(fieldKeys());
    const inDeck = [...infos.values()].filter((info) => info?.taken).length;
    const ready = [...infos.values()].filter((info) => info?.ready).length;
    return `<section class="gs-field-layout"><div><span class="gs-eyebrow">${bi('あなたの場', 'your return field')}</span><h1 class="gs-title" tabindex="-1">${t('見慣れたもの。<br>少し深く。', 'Familiar things.<br>A little more depth.')}</h1><p class="gs-lede">${state.started ? t('どの点にも一つの出会いがある。点をひらくと、答えがついたままの元の問題に戻る。', 'Each point holds an encounter. Open one to return to the exact question, with your answer still attached.') : t('場は練習するほど形になる。稽古を始めて、最初の跡を残そう。', 'Your field takes shape as you practise. Begin a session to leave your first traces.')}</p><div class="gs-legend"><span>${t('出会った', 'Encountered')}</span><span>${t('覚・デッキ', 'In Learn · your deck')}</span><span>${t('いま復習できる', 'Ready to review')}</span><span>${t('もう一度練習', 'Practised again')}</span></div>${state.draft ? `<div class="gs-personal-line" lang="ja">${esc(state.draft)}</div><p class="gs-side-note">${t('自分の言葉 · 採点なし', 'Your own words · ungraded')}</p>` : ''}<div class="gs-actions">${ready ? btn(bi(`復習する · ${ready}`, `review what is ready · ${ready}`), 'review', 'primary', 'data-scope="field"') : ''}${btn(state.started ? bi('覚を開く', 'open Learn') : bi('はじめる', 'begin a guided session'), state.started ? 'learn' : 'setup', ready ? 'quiet' : 'primary')}${textBtn(bi('戻る', 'home'), state.finished ? 'return-home' : 'home')}</div><p class="gs-side-note gs-spaced">${t('これはこの稽古の跡で、習熟の地図ではない。', 'These are traces of this session, not a map of mastery.')}</p></div><div>${fieldMap(infos)}<div class="gs-field-caption"><strong>${t(`${answered()}問に出会った`, `${answered()} questions encountered`)}</strong><span>${t(`デッキに${inDeck}枚 · もう一度練習${state.reviewed.length}`, `${inDeck} in your deck · ${state.reviewed.length} practised again`)}</span></div></div></section>`;
  }

  function senseiText() {
    const q = target();
    const a = answer(q);
    return `Help me understand this ${set.level} practice question.\n\n${q.passage ? `${q.passage}\n\n` : ''}${q.prompt}\n${q.options.map((option, i) => `${i + 1}. ${option}`).join('\n')}\n\nMy first answer: ${a.choice === null ? 'Not answered' : q.options[a.choice]}.\nExplanation before answering: ${a.helpBefore ? 'yes' : 'no'}.\nWord looked up before answering: ${a.lookupBefore ? 'yes' : 'no'}.\nExplanation opened: ${a.explained ? 'yes' : 'no'}.\nSource: ${q.source.ref}\n\nPlease explain the distinction, then invite me to try a different sentence. Do not infer my JLPT level from this question.`;
  }
  function sensei() {
    const q = target();
    const a = answer(q);
    return `<section class="gs-narrow"><span class="gs-eyebrow">${bi('先生', 'sensei')} <span class="gs-dot">/</span> ${bi('用意した質問', 'a prepared conversation')}</span><h1 class="gs-title" tabindex="-1">${t('問題が残した場所から、<br>始める。', 'Begin where<br>the question left you.')}</h1><p class="gs-lede">${t('文と、自分の答えと、もう調べたことを持っていこう。自分の場所を一から説明し直さなくていい。', 'Bring the sentence, your answer, and what you have already explored. You should not have to explain your place all over again.')}</p><div class="gs-sensei-context"><p class="gs-question" lang="ja">${esc(q.prompt.split('\n').slice(-1)[0])}</p><dl><dt>${t('最初の答え', 'Your first answer')}</dt><dd ${a.choice !== null ? 'data-ui-content="learning" lang="ja"' : ''}>${a.choice === null ? t('未回答', 'Not answered') : esc(q.options[a.choice])}</dd><dt>${t('解説', 'Explanation')}</dt><dd>${a.explained ? (a.helpBefore ? t('答える前にひらいた', 'Opened before answering') : t('答えたあとにひらいた', 'Opened after answering')) : t('ひらいていない', 'Not opened')}</dd><dt>${t('出典', 'Source')}</dt><dd>${esc(q.source.label)}</dd></dl></div><label for="guided-sensei-prompt" class="gs-draft-label">${bi('用意した質問', 'prepared question · ready to copy')}</label><textarea id="guided-sensei-prompt" class="gs-draft" readonly>${esc(senseiText())}</textarea><div class="gs-actions">${btn(bi('質問と文脈をコピー', 'copy question and context'), 'copy', 'primary')}${host.openTutor ? textBtn(bi('先生の部屋へ', 'open the tutor room'), 'tutor') : ''}${textBtn(bi('元の問題へ', 'open original question'), 'source', `data-index="${Q.indexOf(q)}"`)}</div><p class="gs-copy-message" id="guided-copy-message" role="status"></p><p class="gs-side-note">${t('コピーしても会話は始まらない。先生の部屋で、送るかどうかを自分で決める。', 'Copying starts no conversation. In the tutor room you decide whether to send it.')}</p>${textBtn(bi('場へ戻る', 'back to your field'), 'field')}</section>`;
  }

  function about() {
    const source = set.source;
    return `<section class="gs-narrow"><span class="gs-eyebrow">${bi('出典', 'about these questions')}</span><h1 class="gs-title" tabindex="-1">${t('生きた糸。<br>戻ってくる場所。', 'A living thread.<br>A place to return.')}</h1><p class="gs-lede">${esc(t(set.title.ja, set.title.en))}</p><p>${esc(t(set.sourceNote.ja, set.sourceNote.en))}</p><p>${t('答え、解説の使い方、下書きはこの端末に残る。「覚」と覚えるは実際のデッキに書き込む。復習の部屋と同じ札になる。場が示すのは出会いで、習熟ではない。', 'Answers, explanation use and your draft stay on this device. Learn and Memorize write to your real deck: the same cards the review room uses. The return field shows encounters, not mastery.')}</p><p>${t('元の問題には AI 審査の記録がある。新しい文の問題と英語の解説は下書きで、編集の確認を待っている。JLPT の公式問題、模試一回分、聴解の評価ではない。', 'Original items have AI review evidence. Fresh questions and English teaching text are authored drafts, pending editorial review. This is not an official JLPT paper, a full mock or a listening assessment.')}</p><details class="gs-details"><summary>${bi('出典の記録', 'source receipt')}</summary><p>${esc(source.formId)} · ${esc(source.status)}</p><p class="gs-source-id">${esc(source.formRevisionId || '')}</p><p>${esc(set.dictionary.name || '')} · ${esc(set.dictionary.license)} · ${esc(set.dictionary.attribution)}</p><p>${esc(set.teaching.note || '')}</p></details>${setAside ? `<p class="gs-notice">${t('以前の稽古の記録を読めなかったため、別に保管した。', 'An earlier session on this device could not be read, so it was kept aside, untouched.')}</p>` : ''}<div class="gs-actions">${btn(bi('戻る', 'return home'), 'home', 'primary')}${confirmingReset ? `${btn(bi('消す', 'clear it'), 'reset-confirm', 'quiet')}${textBtn(bi('やめる', 'keep it'), 'reset-cancel')}` : textBtn(bi('この端末の記録を消す', 'reset this session on this device'), 'reset')}</div>${confirmingReset ? `<p class="gs-notice" role="status">${t('この稽古の答え、覚の行、下書きをこの端末から消す。デッキの札はそのまま残る。', 'This clears this session’s answers, Learn rows and draft on this device. Cards in your deck stay.')}</p>` : ''}</section>`;
  }

  function momentControls() {
    if (!moments) return '';
    const reduced = moments.reducedMotion();
    const on = moments.enabled();
    return `<div class="gs-moments"><span class="gs-footer-label">${bi('動き', 'moments')}</span>${textBtn(on ? bi('あり', 'on') : bi('なし', 'off'), 'moments-toggle', `aria-pressed="${on}" aria-label="${esc(on ? t('動き: あり', 'Moments: on') : t('動き: なし', 'Moments: off'))}"`)}<label class="gs-effect">${bi('型', 'style')} <select data-moment-mode aria-label="${esc(t('動きの型', 'Moment style'))}">${moments.modes.map((mode) => `<option value="${mode}" ${moments.mode() === mode ? 'selected' : ''}>${esc(t(...MODE_LABELS[mode]))}</option>`).join('')}</select></label><label class="gs-effect"><input type="checkbox" data-moment-sound ${moments.soundEnabled() ? 'checked' : ''}> ${bi('音', 'sound')}</label>${reduced ? `<small class="gs-footer-note">${t('端末の設定で、自動の動きは止めている', 'Automatic motion paused by your device preference')}</small>` : ''}<span class="gs-footer-demos">${textBtn(bi('侍を見る', 'watch the samurai'), 'samurai-demo')}${textBtn(bi('再戦を見る', 'watch the rematch'), 'samurai-rematch-demo')}</span></div>`;
  }
  function footer() {
    return `<footer class="gs-footer">${momentControls()}<div class="gs-session-controls">${textBtn(bi('最初から', 'start again'), 'restart')}${previousSession ? textBtn(bi('前の回に戻す', 'restore previous session'), 'restore-session') : ''}<span id="guided-save-status" class="gs-save-status ${saveError ? 'gs-error' : ''}">${saveText()}</span></div></footer>`;
  }

  /* ----------------------------------------------------------------- render */
  function renderLoading(main) {
    const section = document.createElement('section');
    section.className = 'gs-room-state';
    section.dataset.guidedState = failure ? 'failed' : 'loading';
    section.innerHTML = failure
      ? `<h1 class="view-title">${bi('案内つきの稽古', 'guided session')}</h1><p>${t('この稽古を開けなかった。保存した記録はそのまま残っている。', 'This session could not open. Nothing you saved is affected.')}</p><button type="button" class="chip" data-guided-retry>${t('もう一度', 'Try again')}</button>`
      : `<h1 class="view-title">${bi('案内つきの稽古', 'guided session')}</h1><p>${t('稽古を開いています…', 'Opening the session…')}</p>`;
    section.querySelector('[data-guided-retry]')?.addEventListener('click', () => {
      failure = null;
      host.render();
    });
    main.append(section);
  }

  function renderRoom(main) {
    const views = {
      home,
      setup,
      question,
      insight: explanation,
      summary,
      results,
      fresh: freshView,
      expression,
      field,
      return: field,
      learn,
      sensei,
      about,
    };
    const stage = wordDetail ? 'word' : branch ? 'branch' : state.view;
    root = document.createElement('div');
    root.className = 'guided-room';
    root.dataset.stage = stage;
    root.dataset.set = set.id;
    root.innerHTML = `${roomBar()}<div class="gs-main">${wordDetail ? wordView() : branch ? branchView() : (views[state.view] || home)()}</div>${footer()}`;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    main.append(root);
  }

  function applyAfter() {
    const request = after;
    after = null;
    if (!request || !root?.isConnected) return;
    if (request.top) window.scrollTo(0, 0);
    if (Number.isFinite(request.scroll)) window.scrollTo(0, request.scroll);
    const focus = request.focus
      ? typeof request.focus === 'function'
        ? request.focus()
        : root.querySelector(request.focus)
      : request.top
        ? root.querySelector('h1')
        : null;
    focus?.focus?.({ preventScroll: true });
    if (request.cut) cutWrongChoice();
    if (request.reveal) root.querySelector(request.reveal)?.scrollIntoView({ block: 'center' });
    if (request.say) announce(request.say);
    // a moment starts after the app has finished drawing this frame: the rest of render()
    // still appends to #app, and a moment ends itself on any later change there
    if (request.samurai || request.crane) {
      setTimeout(() => {
        if (!root?.isConnected) return;
        if (request.samurai) moments?.play({ ...request.samurai, returnFocus: focus || undefined });
        if (request.crane) moments?.carry({ text: request.crane, target: '#tray' });
      }, 0);
    }
  }

  function cutWrongChoice() {
    const wrong = root?.querySelector('.gs-choice.is-wrong');
    if (!wrong || wrong.querySelector('.gs-slash')) return;
    const mark = document.createElement('span');
    mark.className = 'gs-slash';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML =
      '<svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M2 34.5 C 26 29.5, 56 17, 96 4 C 97.5 3.6, 98.6 4.8, 97.4 6.2 C 60 20, 30 31, 4 36.5 C 2.4 36.9, 1.2 35.4, 2 34.5 Z"/></svg>';
    wrong.classList.add('cut');
    wrong.append(mark);
  }

  /* ----------------------------------------------------------------- events */
  function onChange(event) {
    const node = event.target;
    if (node.matches('[data-moment-mode]')) {
      moments?.setMode(node.value);
      return;
    }
    if (node.matches('[data-moment-sound]')) {
      moments?.setSoundEnabled(node.checked);
      return;
    }
    if (node.name === 'answer') {
      selected[current().id] = Number(node.value);
      const check = root.querySelector('[data-action="check"]');
      if (check) check.disabled = false;
    }
    if (node.name === 'fresh-answer' && state.fresh.choice === null) {
      freshSelected[target().id] = Number(node.value);
      const check = root.querySelector('[data-action="check-fresh"]');
      if (check) check.disabled = false;
    }
  }
  function onInput(event) {
    if (event.target.id !== 'guided-draft') return;
    emit('DRAFT', { text: event.target.value });
    const status = root.querySelector('#guided-draft-status');
    if (status) status.textContent = saveText();
    const saved = root.querySelector('#guided-save-status');
    if (saved) saved.textContent = saveText();
  }

  function restartSession() {
    if (state.started || state.draft || answered()) {
      const backup = saveGuidedState(storage, previousKey, state);
      if (!backup.ok) {
        saveError = backup.error;
        redraw({
          say: t(
            'この稽古を保管できなかったので、やり直さなかった。',
            'Could not preserve this session. It was not restarted.',
          ),
        });
        return;
      }
      previousSession = state;
    }
    clearSelections();
    notice = '';
    confirmingReset = false;
    emit('RESET');
    emit('START');
    redraw({
      top: true,
      say: t(
        '問1からやり直した。前の回は戻せる。',
        'Started again at question 1. Your previous session can be restored.',
      ),
    });
  }

  function restoreSession() {
    const restore = previousSession;
    if (!restore) return;
    const saved = saveGuidedState(storage, storageKey, restore);
    if (!saved.ok) {
      saveError = saved.error;
      redraw({
        say: t(
          '前の回を戻せなかった。保管はそのまま残っている。',
          'Could not restore the session. Your saved backup is still available.',
        ),
      });
      return;
    }
    clearSelections();
    state = restore;
    previousSession = null;
    saveError = null;
    try {
      storage?.removeItem(previousKey);
    } catch {
      /* the restored session is already saved */
    }
    redraw({ top: true, say: t('前の回を戻した。', 'Previous session restored.') });
  }

  function onClick(event) {
    const b = event.target.closest('[data-action]');
    if (!b || b.disabled || !root.contains(b)) return;
    const action = b.dataset.action;
    const q = current();
    switch (action) {
      case 'moments-toggle':
        moments?.setEnabled(!moments.enabled());
        redraw({ focus: '[data-action="moments-toggle"]' });
        return;
      case 'samurai-replay':
      case 'samurai-demo':
      case 'samurai-rematch-demo':
        moments?.play({
          force: true,
          outcome: action === 'samurai-rematch-demo' ? 'rematch' : 'incorrect',
          demo: action !== 'samurai-replay',
          returnFocus: b,
        });
        return;
      case 'readings':
        showReadings = !showReadings;
        redraw({ focus: '[data-action="readings"]' });
        return;
      case 'word': {
        const key = b.dataset.word;
        if (!words[key]) return;
        wordDetail = key;
        wordSourceId = b.dataset.source || (state.view === 'fresh' ? target().id : q.id);
        wordReturnScroll = window.scrollY;
        wordOpener = key;
        wordOpenerIndex = [
          ...root.querySelectorAll(`[data-action="word"][data-word="${cssEscape(key)}"]`),
        ].indexOf(b);
        notice = '';
        redraw({ top: true });
        return;
      }
      case 'close-word':
        wordDetail = null;
        notice = '';
        redraw({
          scroll: wordReturnScroll,
          focus: () =>
            root.querySelectorAll(`[data-action="word"][data-word="${cssEscape(wordOpener)}"]`)[
              wordOpenerIndex
            ],
        });
        return;
      case 'save-word':
        void saveWord();
        return;
      case 'entry':
        if (words[wordDetail]) host.openEntry(wordNode(wordDetail));
        return;
      case 'remove-word':
        void removeWord(b.dataset.word);
        return;
      case 'restart':
        restartSession();
        return;
      case 'restore-session':
        restoreSession();
        return;
      case 'nav':
        if (b.dataset.view === 'sensei' && !state.selectedTarget)
          emit('SELECT_TARGET', { id: preferred().id });
        go(b.dataset.view);
        return;
      case 'home':
      case 'setup':
      case 'question':
      case 'field':
      case 'learn':
      case 'results':
      case 'fresh':
      case 'about':
        confirmingReset = false;
        go(action);
        return;
      case 'start':
      case 'resume':
        branch = null;
        emit('START');
        redraw({ top: true });
        return;
      case 'check': {
        if (selected[q.id] === undefined) return;
        emit('COMMIT', { id: q.id, choice: selected[q.id], correct: selected[q.id] === q.correct });
        const wrong = answer(q).correct === false;
        redraw({
          cut: wrong,
          reveal: '.gs-feedback',
          focus: '[data-action="explain"]',
          samurai: wrong ? {} : null,
        });
        return;
      }
      case 'explain':
        emit('HELP', { id: q.id });
        go('insight');
        return;
      case 'flag':
        emit('FLAG', { id: q.id });
        redraw({
          focus: '[data-action="flag"]',
          say: answer(q).flagged
            ? t('旗を立てた。', 'Flagged for another look.')
            : t('旗を外した。', 'Flag removed.'),
        });
        return;
      case 'leave':
        emit('SAVE_EXIT');
        branch = null;
        redraw({ top: true });
        return;
      case 'source':
        branch = null;
        wordDetail = null;
        emit('GO_TO', { index: Number(b.dataset.index), count: Q.length });
        redraw({ top: true });
        return;
      case 'previous':
        branch = null;
        emit('PREVIOUS');
        redraw({ top: true });
        return;
      case 'next':
        branch = null;
        emit('NAVIGATE', { view: 'question' });
        emit('NEXT', { count: Q.length });
        redraw({ top: true });
        return;
      case 'branch':
        branch = b.dataset.key;
        branchOpener = branch;
        branchScroll = window.scrollY;
        redraw({ top: true });
        return;
      case 'close-branch':
        branch = null;
        redraw({ scroll: branchScroll, focus: `[data-key="${cssEscape(branchOpener)}"]` });
        return;
      case 'finish':
        emit('FINISH', {
          questions: Q.map((entry) => ({
            id: entry.id,
            target: entry.target.label,
            cards: entry.cards.map(keyOf),
          })),
        });
        void enrolPending();
        redraw({ top: true });
        return;
      case 'undo':
        void toggleRow(b.dataset.id);
        return;
      case 'retry-card':
        void retryCard(b.dataset.id, b.dataset.card);
        return;
      case 'practice':
        emit('FRESH_RESET', { id: b.dataset.id });
        go('fresh');
        return;
      case 'check-fresh': {
        if (state.fresh.choice === null && freshSelected[target().id] === undefined) return;
        emit('FRESH_SELECT', { choice: freshSelected[target().id] });
        emit('FRESH_REVEAL', { correct: state.fresh.choice === fresh().correct });
        const right = state.fresh.choice === fresh().correct;
        const rematch = right && answer(target()).correct === false;
        redraw({
          focus: '[data-action="expression"]',
          reveal: '.gs-feedback',
          samurai: !right ? {} : rematch ? { outcome: 'rematch' } : null,
        });
        return;
      }
      case 'expression':
        go('expression');
        return;
      case 'record-return':
        if (state.fresh.revealed) emit('REVIEW', { id: target().id });
        go('field');
        return;
      case 'return-home':
        emit('RETURN');
        redraw({ top: true });
        return;
      case 'sensei-current':
      case 'sensei-target':
        emit('FRESH_RESET', { id: action === 'sensei-current' ? q.id : b.dataset.id });
        go('sensei');
        return;
      case 'copy': {
        const message = root.querySelector('#guided-copy-message');
        navigator.clipboard
          ?.writeText(senseiText())
          .then(() => {
            if (message)
              message.textContent = t('質問と文脈をコピーした。', 'Question and context copied.');
          })
          .catch(() => {
            const area = root.querySelector('#guided-sensei-prompt');
            area?.focus();
            area?.select();
            if (message)
              message.textContent = t(
                '上の文を選んでコピーする。',
                'Select and copy the prepared text above.',
              );
          });
        return;
      }
      case 'tutor':
        host.openTutor?.();
        return;
      case 'review':
        if (
          !host.deck.review(
            (b.dataset.scope === 'session' ? sessionKeys() : fieldKeys()).map(nodeOf),
          )
        ) {
          notice = t('いま復習できる札はない。', 'No cards are ready to review right now.');
          redraw();
        }
        return;
      case 'deck':
        host.deck.open();
        return;
      case 'reset':
        confirmingReset = true;
        redraw({ focus: '[data-action="reset-cancel"]' });
        return;
      case 'reset-cancel':
        confirmingReset = false;
        redraw({ focus: '[data-action="reset"]' });
        return;
      case 'reset-confirm':
        confirmingReset = false;
        emit('RESET');
        clearSelections();
        redraw({
          top: true,
          say: t('この端末の稽古の記録を消した。', 'This session was cleared on this device.'),
        });
        return;
      default:
    }
  }

  return {
    /** Arriving through a door: the room opens at its top with the heading focused. */
    enter() {
      after = { top: true };
    },
    /** A word looked up inside an unanswered question is help before its first answer. The
     * app shows the reading only once this returns true: the help is saved on that question. */
    recordLookup(questionId) {
      const q = Q.find((entry) => entry.id === questionId);
      if (!state || !q || !root?.isConnected || current().id !== questionId ||
          !['question', 'insight'].includes(root.dataset.stage)) return false;
      const next = answer(q).choice === null
        ? reduceGuidedState(state, { type: 'LOOKUP', id: q.id })
        : state;
      if (next === state && !saveError) return true;
      // Commit the help before exposing it. A refused write leaves the answer untouched,
      // and a later tap can retry once storage recovers without inventing another event.
      const saved = saveGuidedState(storage, storageKey, next);
      saveError = saved.error;
      if (saved.ok) state = next;
      redraw();
      return saved.ok && root?.isConnected && current().id === questionId &&
        ['question', 'insight'].includes(root.dataset.stage);
    },
    render(main) {
      if (!set || !state) {
        renderLoading(main);
        if (!failure) void load();
        return;
      }
      renderRoom(main);
      applyAfter();
    },
    /** The app's 戻る inside the room: word → sentence, branch → sentence, an attempt or an
     * inner page → the room's front. Returns false at the front, so the app walks on out. */
    back() {
      if (!set || !state) return false;
      moments?.stop();
      if (wordDetail) {
        wordDetail = null;
        notice = '';
        redraw({
          scroll: wordReturnScroll,
          focus: () =>
            root?.querySelectorAll(`[data-action="word"][data-word="${cssEscape(wordOpener)}"]`)[
              wordOpenerIndex
            ],
        });
        return true;
      }
      if (branch) {
        branch = null;
        redraw({ scroll: branchScroll, focus: `[data-key="${cssEscape(branchOpener)}"]` });
        return true;
      }
      if (state.view !== 'home') {
        confirmingReset = false;
        if (['question', 'insight'].includes(state.view)) emit('SAVE_EXIT');
        else emit('NAVIGATE', { view: 'home' });
        redraw({ top: true });
        return true;
      }
      return false;
    },
    /** Leaving the room: stop any moment on the glass. Progress is already saved. */
    suspend() {
      moments?.stop();
    },
    /** For the verifier and for the app's own checks: the state as stored, read-only. */
    snapshot() {
      return state ? JSON.parse(JSON.stringify(state)) : null;
    },
  };
}

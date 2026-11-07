/** Display-only Worldcraft UI. The owner-bound host admits every path and outcome.
 * No catalog, record, lifecycle, storage, network, grading or animation authority.
 * Mount element before use; render only authenticated DTOs. Destroy on departure
 * or owner replacement. biLabel is the existing single-language host helper.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const LEFT = Object.freeze({ 職: '耳', 識: '言', 織: '糸' });
const COPY = Object.freeze({
  'W-02': ['字を組み立てる', 'Build a character'],
  'W-03': ['ここでは、職・識・織を、それぞれの字の部品から組み立てられます。', 'Here you can build 職, 識 and 織, each from its own parts.'],
  'W-06': ['組み立ては試験ではなく、復習には記録されません。今日このあと職・識・織を練習するとき、組み立てた字やその字を使うことばについての答えは、ヘルプを使った答えとして扱われます。', 'Building isn’t a test, and it never records a review. Later today, when you practise 職・識・織, answers about a character you built, or a word that uses it, count as answered with help.'],
  'W-08': ['この字を残す', 'Keep this build'],
  'W-09': ['残しました。「残した字」に入っています。', 'Kept. It’s now in Kept characters.'],
  'W-10': ['この字を保存できませんでした。組み立てた字は、このページに表示されたままです。', 'This build couldn’t be saved. It is still shown on this page.'],
  'W-11': ['「残した字」への変更が保存されたか確かめられませんでした。読み込み直すと、いまの状態がわかります。練習はこのまま続けられます。', 'We couldn’t confirm the change to Kept characters was saved. Reload to see where it stands; practice still works.'],
  'W-12': ['「残した字」には、すでに16件あります。新しく残すには、どれかを外してください。', 'There are already 16 builds in Kept characters. Remove one to keep another.'],
  'W-13': ['「残した字」から外す', 'Remove from Kept characters'],
  'W-14': ['外しても復習には影響しません。あとでまた組み立てられます。', 'Removing it changes no review. You can build it again later.'],
  'W-15': ['「残した字」から外しました。', 'Removed from Kept characters.'],
  'W-16': ['いま組み立てられるのは、職・識・織だけです。', 'For now, only 職, 識 and 織 can be built.'],
  'W-17': ['この字はまだ残していません。離れると、残りません。', 'This build isn’t kept yet. If you leave, it won’t stay.'],
  'W-18': ['いまは組み立てた字を残せません。練習はこのまま続けられます。', 'Builds can’t be kept right now. Practice still works.'],
  'W-19': ['外せませんでした。「残した字」にまだあります。', 'It couldn’t be removed, so it is still in Kept characters.'],
  'W-20': ['この字は残せませんでした。組み立てた字は、このページに表示されたままです。', 'This build couldn’t be kept. It is still shown on this page.'],
  'W-21': ['バックアップから復元すると、「残した字」は空から始まります。以前に残した字は引き継がれません。', 'After a backup restore, nothing is in Kept characters: earlier builds aren’t carried over.'],
});
const OUTCOMES = new Set(['W-09', 'W-10', 'W-11', 'W-12', 'W-15', 'W-16', 'W-18', 'W-19', 'W-20', 'W-21']);
const ACTIONS = ['assemble', 'keep', 'inspect', 'requestRemove', 'confirmRemove', 'cancelRemove', 'leave'];
let instance = 0;
const check = (condition, message) => { if (!condition) throw new TypeError(message); };
function copyPaths(paths) {
  if (paths === null) return null;
  check(Array.isArray(paths) && paths.length > 0 && paths.length <= 64 &&
    paths.every(path => typeof path === 'string' && path.length > 0 && path.length <= 16384), 'Worldcraft display paths');
  return paths.slice();
}
function snapshot(dto) {
  check(dto && typeof dto.host === 'string' && ['new', 'assembling', 'assembled', 'saved'].includes(dto.phase) &&
    typeof dto.busy === 'boolean' && typeof dto.uncertain === 'boolean', 'Worldcraft display state');
  check(dto.message === null || (dto.message && OUTCOMES.has(dto.message.code)), 'Worldcraft outcome code');
  check(Array.isArray(dto.parts) && Array.isArray(dto.kept) && dto.kept.length <= 16, 'Worldcraft display lists');
  const supported = Object.hasOwn(LEFT, dto.host);
  check(!supported || (dto.parts.length === 2 && dto.parts[0].label === LEFT[dto.host] && dto.parts[1].label === '戠'), 'Worldcraft own-host parts');
  const ids = new Set();
  const kept = dto.kept.map(row => {
    check(row && typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 1024 &&
      !ids.has(row.id) && typeof row.host === 'string' && typeof row.actionable === 'boolean', 'Worldcraft kept row');
    ids.add(row.id);
    return { id: row.id, host: row.host, paths: copyPaths(row.paths), actionable: row.actionable };
  });
  return { host: dto.host, supported, phase: dto.phase, busy: dto.busy, uncertain: dto.uncertain,
    message: dto.message?.code ?? null,
    parts: supported ? dto.parts.map(part => ({ label: part.label, paths: copyPaths(part.paths) })) : [],
    assembledPaths: copyPaths(dto.assembledPaths), kept };
}

/**
 * createWorldcraftView({document, biLabel}) -> {element, render(dto, actions), destroy()}.
 * message is null or {code: W-09/10/11/12/15/16/18/19/20/21} from the host.
 * requestRemove/cancelRemove notify local intent only; confirmRemove alone removes.
 * Mutations latch through their promise AND a newer host render. Promise values
 * are ignored. A host must render the authoritative outcome even after refusal.
 * Every host render dismisses local confirmation, so intent cannot cross owners.
 */
export function createWorldcraftView({ document, biLabel }) {
  check(document?.createElement && document?.createElementNS && typeof biLabel === 'function', 'Worldcraft DOM host');
  const element = document.createElement('section');
  element.className = 'worldcraft-view';
  const prefix = `worldcraft-${++instance}`;
  let version = 0, hostRender = 0, disposed = false, state = null, actions = null;
  let confirmation = null, pending = null, buttons = [], leaving = false;
  const label = (tag, cls, ja, en) => biLabel(tag, cls, ja, en);
  const line = (code, tag = 'p', cls = 'gloss') => {
    const node = label(tag, cls, ...COPY[code]);
    node.dataset.worldcraftCopy = code;
    return node;
  };
  const blocked = () => !!pending || state.busy || state.uncertain;
  const hasResult = () => state.supported && ['assembled', 'saved'].includes(state.phase) && !!state.assembledPaths;
  const canKeep = () => hasResult() && state.phase === 'assembled' && !blocked();
  function updateDisabled() {
    element.setAttribute('aria-busy', String(!!pending || state.busy));
    for (const row of buttons) row.node.disabled = !row.allowed();
  }
  function invoke(name, args = [], mutation = false) {
    if (mutation) {
      if (pending) return;
      const ticket = { render: hostRender, settled: false };
      pending = ticket;
      updateDisabled();
      let result;
      try { result = actions[name](...args); } catch { ticket.settled = true; return; }
      const settled = () => {
        ticket.settled = true;
        if (!disposed && pending === ticket && hostRender > ticket.render) {
          pending = null;
          updateDisabled();
        }
      };
      // A rejection is not nonpublication. No copy or result is inferred here.
      Promise.resolve(result).then(settled, settled);
    } else {
      try { Promise.resolve(actions[name](...args)).catch(() => {}); } catch { /* Host supplies any outcome. */ }
    }
  }
  function leave() {
    if (leaving) return;
    leaving = true;
    invoke('leave');
  }
  function button(parent, action, texts, allowed, callback, id = '') {
    const node = label('button', 'chip', ...texts), generation = version;
    node.type = 'button';
    node.dataset.worldcraftAction = action;
    if (id) node.dataset.worldcraftId = id;
    node.addEventListener('click', () => {
      if (disposed || generation !== version || !element.isConnected || !allowed()) return;
      callback();
    });
    buttons.push({ node, allowed });
    parent.append(node);
    return node;
  }
  function diagram(paths) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 109 109');
    svg.setAttribute('class', 'strokes');
    svg.setAttribute('width', '160'); svg.setAttribute('height', '160');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    for (const d of paths) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d); path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
    }
    return svg;
  }
  function paint(focusAction = null, focusId = '') {
    version++;
    buttons = [];
    element.replaceChildren();
    const title = line('W-02', 'h1', 'view-title');
    title.id = `${prefix}-title`;
    element.setAttribute('aria-labelledby', title.id);
    element.append(title, line('W-03'));
    if (!state.supported) element.append(line('W-16'));
    else {
      const parts = document.createElement('div');
      parts.className = 'worldcraft-parts';
      for (const part of state.parts) {
        const figure = document.createElement('figure'), caption = document.createElement('figcaption');
        caption.textContent = part.label;
        if (part.paths) figure.append(diagram(part.paths));
        figure.append(caption); parts.append(figure);
      }
      element.append(parts);
      button(element, 'assemble', [`部品を組み合わせる：${LEFT[state.host]}と戠`, `Put the parts together: ${LEFT[state.host]} and 戠`],
        () => !blocked() && state.phase === 'new' && state.parts.every(part => part.paths), () => invoke('assemble', [], true));
      if (hasResult()) {
        const result = label('p', 'gloss', `組み立てました：${state.host}`, `Built: ${state.host}`);
        result.dataset.worldcraftCopy = 'W-05'; result.setAttribute('role', 'status');
        element.append(result, diagram(state.assembledPaths), line('W-06'));
      }
      button(element, 'keep', COPY['W-08'], canKeep, () => invoke('keep', [], true));
    }
    if (state.message) {
      const status = line(state.message); status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite'); element.append(status);
    }
    const keptTitle = label('h2', 'section-rule', '残した字', 'Kept characters');
    keptTitle.id = `${prefix}-kept`;
    const list = document.createElement('ul'); list.setAttribute('aria-labelledby', keptTitle.id);
    for (const row of state.kept) {
      const item = document.createElement('li'); item.dataset.worldcraftId = row.id;
      const known = Object.hasOwn(LEFT, row.host), actionable = known && row.actionable && !!row.paths;
      const name = document.createElement('p'); name.textContent = row.host; item.append(name);
      if (known && row.paths) item.append(diagram(row.paths));
      button(item, 'inspect', ['この字を見る', 'View this character'], () => actionable && !blocked(), () => invoke('inspect', [row.id]), row.id);
      button(item, 'request-remove', COPY['W-13'], () => actionable && !blocked(), () => {
        confirmation = { kind: 'remove', id: row.id };
        paint('cancel-remove', row.id);
        invoke('requestRemove', [row.id]);
      }, row.id);
      if (confirmation?.kind === 'remove' && confirmation.id === row.id) {
        const group = document.createElement('div'), note = line('W-14');
        note.id = `${prefix}-remove-note`; group.setAttribute('role', 'group'); group.setAttribute('aria-labelledby', note.id); group.append(note);
        button(group, 'confirm-remove', ['外す', 'Remove'], () => actionable && !blocked(), () => invoke('confirmRemove', [row.id], true), row.id);
        button(group, 'cancel-remove', ['残す', 'Keep'], () => !pending, () => {
          confirmation = null; paint('request-remove', row.id); invoke('cancelRemove');
        }, row.id);
        const promptVersion = version;
        group.addEventListener('keydown', event => {
          if (disposed || promptVersion !== version || !element.isConnected || event.key !== 'Escape' || pending) return;
          event.preventDefault();
          confirmation = null; paint('request-remove', row.id); invoke('cancelRemove');
        });
        item.append(group);
      }
      list.append(item);
    }
    element.append(keptTitle, list);
    button(element, 'leave', ['離れる', 'Leave'], () => true, () => {
      if (hasResult() && state.phase === 'assembled' && !blocked()) {
        confirmation = { kind: 'leave' }; paint('keep-before-leave');
      } else leave();
    });
    if (confirmation?.kind === 'leave') {
      const group = document.createElement('div'), note = line('W-17');
      note.id = `${prefix}-leave-note`; group.setAttribute('role', 'group'); group.setAttribute('aria-labelledby', note.id); group.append(note);
      button(group, 'keep-before-leave', COPY['W-08'], canKeep, () => invoke('keep', [], true));
      button(group, 'confirm-leave', ['離れる', 'Leave'], () => !pending, leave);
      const promptVersion = version;
      group.addEventListener('keydown', event => {
        if (disposed || promptVersion !== version || !element.isConnected || event.key !== 'Escape' || pending) return;
        event.preventDefault(); confirmation = null; paint('leave');
      });
      element.append(group);
    }
    updateDisabled();
    if (focusAction) buttons.find(row => row.node.dataset.worldcraftAction === focusAction &&
      (row.node.dataset.worldcraftId || '') === focusId)?.node.focus();
  }
  return Object.freeze({
    element,
    render(dto, callbacks) {
      check(!disposed, 'Worldcraft view destroyed');
      const active = document.activeElement;
      const focused = active && element.contains(active) ? {
        action: active.dataset.worldcraftAction, id: active.dataset.worldcraftId || '',
      } : null;
      // Invalidate detached controls even if a malformed replacement is refused.
      version++;
      for (const row of buttons) row.node.disabled = true;
      element.replaceChildren(); confirmation = null;
      const next = snapshot(dto);
      check(callbacks && ACTIONS.every(name => typeof callbacks[name] === 'function'), 'Worldcraft action bindings');
      leaving = false;
      state = next; actions = Object.fromEntries(ACTIONS.map(name => [name, callbacks[name]]));
      hostRender++;
      if (pending?.settled) pending = null;
      paint(focused?.action, focused?.id);
    },
    destroy() {
      disposed = true; version++; confirmation = null; pending = null;
      for (const row of buttons) row.node.disabled = true;
      buttons = []; actions = null; state = null; element.replaceChildren();
    },
  });
}

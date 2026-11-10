/**
 * Worldcraft preview host: prototype wiring of 2026-11-10 (John: every built feature on tonight, rough screens
 * allowed when they are labelled). It connects the tested model (m4-worldcraft.mjs) and its display
 * (worldcraft-view.mjs) to a door on the 職 / 識 / 織 kanji pages.
 *
 * This is NOT the production host the design pass asks for (M4-WORLDCRAFT-PASSAGE.md, decisions 3, 4 and 9):
 *  - "Kept characters" live in a journey root held in this page's memory. Nothing reaches the learner record,
 *    IndexedDB, localStorage or the network, and a reload starts empty. corridor.js's JOURNEY_WRITES is neither
 *    read nor changed; `journeyWrites: true` below is true of the memory journey only.
 *  - A build keeps no help row, so W-06's "count as answered with help" is not in effect. The dialog says so.
 *  - No visit is counted. Nothing is graded, enrolled or scheduled.
 * The model still does every admission: the five source files are hashed against its pins, and each Keep and
 * Remove goes through its lifecycle port, answered here by the memory stand-in.
 */
import * as world from './m4-worldcraft.mjs';
import { createWorldcraftView } from './worldcraft-view.mjs';
import * as structureModule from './kanji-structure.js';

const structureAPI = structureModule.default ?? globalThis.BunkiKanjiStructure;
const FORMS = Object.freeze({ 職: '耳', 識: '言', 織: '糸' });
const POOL = 16;
const good = (result) => { if (!result.ok) throw new Error(result.reason); return result.value; };
const plain = (value) => JSON.parse(JSON.stringify(value));

/** The memory journey: only the root fields the model reads, and journey-lifecycle.mjs's work/retire for projects. */
function createMemoryJourney(digest) {
  const id = 'worldcraft-preview', generation = 'page-memory', refusals = new WeakMap();
  let root = { version: 1, protocol: 'journey-r2', id, generation, revision: 1, projects: [], nextProject: 0,
    progress: { retiredProjects: 0 } };
  const refuse = (operation, action, source, reason, error = new Error(reason)) => {
    refusals.set(operation, { error, action, source, reason });
    throw error;
  };
  const publish = (action, next, observe) => {
    next.revision++; root = next;
    const hash = digest(root);
    observe(Object.freeze({ action, outcome: 'published', acknowledged: true, rootHash: hash, proposedHash: hash }));
  };
  const lifecycle = {
    async tick() {},
    inspect: () => Object.freeze({ phase: 'page-memory', projects: root.projects.length }),
    holdUnconfirmed() {}, // a memory write is never unconfirmed
    preDispatchRefusal(operation, error) {
      const row = refusals.get(operation);
      return row?.error === error
        ? Object.freeze({ action: row.action, collection: 'projects', source: row.source, reason: row.reason }) : null;
    },
    async work(collection, data, { observe, operation, admit }) {
      if (collection !== 'projects') refuse(operation, 'work', 'lifecycle-guard', 'work-kind');
      const next = plain(root);
      // as the lifecycle does: the caller's own recheck sees the root this write would replace
      try { admit?.(plain(next)); } catch (error) { refuse(operation, 'work', 'admission', null, error); }
      if (next.projects.length >= POOL) refuse(operation, 'work', 'lifecycle-guard', 'work-bound');
      next.nextProject++;
      next.projects.push({ ...plain(data), id: `${id}/projects/${next.nextProject}`, status: data.status ?? 'unfinished' });
      publish('work', next, observe);
    },
    async retire(collection, projectId, decision, { observe, operation }) {
      const next = plain(root), index = next.projects.findIndex(project => project.id === projectId);
      if (collection !== 'projects' || index < 0) refuse(operation, 'retire-work', 'lifecycle-guard', 'work-missing');
      if (decision !== 'retire-completed' || next.projects[index].status !== 'completed') {
        refuse(operation, 'retire-work', 'lifecycle-guard', 'explicit-retirement');
      }
      next.projects.splice(index, 1); next.progress.retiredProjects++;
      publish('retire-work', next, observe);
    },
  };
  return { id, generation, root: () => root, lifecycle };
}

/**
 * One per page load. `bytes` are the five source files the model pins (SOURCE_PINS); `digest` is the journey
 * lifecycle's. Rejects with the model's own reason, such as `crypto-unavailable` or `source-hash-mismatch:<field>`.
 * visit(form, { render, close }) → the seven view actions plus paint() and end().
 */
export async function createWorldcraftPreviewHost({ bytes, digest }) {
  const catalog = good(await world.createWorldcraftCatalog(bytes));
  const decode = (field) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes[field]));
  const structure = structureAPI.createModel({ kanji: decode('kanjiBytes').kanji, strokes: decode('strokesBytes').strokes,
    grouping: decode('structureBytes') });
  const journey = createMemoryJourney(digest);
  const identity = { owner: {}, record: {}, boot: {}, navigation: {} };
  let viewToken = {}; // replaced when a visit ends, so its tickets read view-stale afterwards
  const owner = good(world.createWorldOwner(catalog, {
    read: () => ({ owner: identity.owner, record: identity.record, epoch: 0, generation: journey.generation,
      boot: identity.boot, journeyId: journey.id, view: viewToken, navigation: identity.navigation, visit: null,
      carried: null, root: journey.root(), journeyWrites: true, worldcraftEnabled: true }),
    // Decision 4's help row is not kept in this preview: the result is shown and nothing is recorded.
    capture: async (request, proof) => { proof.held(); },
    lifecycle: journey.lifecycle,
    digest,
    settledRead: async (target, settled) => { settled(target); },
  }));
  const shapes = new Map();
  /** A form's two parts as occurrences inside it, from its own stroke groups, and the whole they make. */
  function shape(form) {
    if (!shapes.has(form)) {
      const built = good(world.resolveBuild(catalog, { host: form, left: FORMS[form], right: '戠' }));
      const parts = built.ref.slots.map(slot => ({ label: slot.part,
        paths: structure.project(form, slot.occurrenceId).paths.slice() }));
      const whole = built.recipe.paths.slice();
      if (JSON.stringify(parts.flatMap(part => part.paths)) !== JSON.stringify(whole)) throw new Error('whole-path-parity');
      shapes.set(form, { parts, whole });
    }
    return shapes.get(form);
  }
  const keptRows = () => good(world.keptBuilds(journey.root(), catalog));

  function visit(form, { render, close }) {
    const supported = Object.hasOwn(FORMS, form);
    const state = good(world.createWorldcraftState(owner)), ticket = good(world.createWorldView(owner));
    let draft = null, draftProject = null, viewing = null, message = null, uncertain = false, ended = false;
    const begin = () => { draftProject = null; draft = supported ? good(world.beginBuild(state, catalog, form)) : null; };
    begin();
    function dto() {
      const rows = keptRows(), shown = viewing ? rows.find(row => row.projectId === viewing && row.actionable) : null;
      if (!shown) viewing = null;
      const subject = shown ? shown.recipe.host : form, known = Object.hasOwn(FORMS, subject);
      const phase = shown ? 'saved' : draft ? good(world.inspectBuild(state, draft)).phase : 'new';
      return {
        host: subject, phase, busy: false, uncertain, message: message ? { code: message } : null,
        parts: known ? shape(subject).parts : [],
        assembledPaths: known && ['assembled', 'saved'].includes(phase) ? shape(subject).whole : null,
        kept: rows.map(row => ({ id: row.projectId, host: row.recipe?.host ?? '', actionable: row.actionable,
          paths: row.actionable ? shape(row.recipe.host).whole : null })),
        viewing: shown ? subject : null, // for the host's own line; the view ignores it
      };
    }
    const paint = () => { if (!ended) render(dto()); };
    // An outcome this preview has no line for (the owner or view changed under it) ends the visit.
    const over = () => { if (!ended) close(); };
    function removed(projectId) {
      if (viewing === projectId) viewing = null;
      if (draftProject === projectId) begin(); // W-14: "You can build it again later."
    }
    const actions = {
      async assemble() {
        if (ended || !draft || viewing) return;
        const result = await world.assembleBuild(state, draft, ticket);
        if (ended) return;
        if (!result.ok) { over(); return; }
        message = null; paint();
      },
      async keep() {
        if (ended || !draft || viewing) return;
        const outcome = await world.keepBuild(state, draft);
        if (ended) return;
        if (outcome.kind === 'published' || outcome.kind === 'exists') { draftProject = outcome.projectId; message = 'W-09'; }
        else if (outcome.kind === 'not-published') message = 'W-10';
        else if (outcome.kind === 'uncertain') { message = 'W-11'; uncertain = true; }
        else if (outcome.kind === 'structural') message = 'W-18';
        else if (outcome.kind === 'refused') message = journey.root().projects.length >= POOL ? 'W-12' : 'W-20';
        else { over(); return; }
        paint();
      },
      inspect(projectId) {
        if (ended) return;
        viewing = projectId === draftProject ? null : projectId; message = null; paint();
      },
      requestRemove() {},
      cancelRemove() {},
      async confirmRemove(projectId) {
        if (ended) return;
        const outcome = await world.removeBuild(state, projectId);
        if (ended) return;
        if (outcome.kind === 'published') { message = 'W-15'; removed(projectId); }
        else if (outcome.kind === 'absent') { message = null; removed(projectId); } // gone already: no removal is claimed
        else if (outcome.kind === 'uncertain') { message = 'W-11'; uncertain = true; }
        else if (outcome.kind === 'owner-changed') { over(); return; }
        else message = 'W-19';
        paint();
      },
      // From a kept character back to this page's own build first; from the build, out of the dialog.
      leave() {
        if (ended) return;
        if (viewing) { viewing = null; message = null; paint(); } else close();
      },
    };
    return { actions, paint, dto,
      end() {
        if (ended) return;
        ended = true; world.discardWorldcraftState(state); viewToken = {};
      } };
  }
  return Object.freeze({ visit, kept: () => keptRows().length });
}

/* ------------------------------------------------------------------ the dialog (browser only) */
let page = null; // this page load's host, admitted on the first visit
let visiting = false;

function styles(document) {
  if (document.getElementById('worldcraft-styles')) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.id = 'worldcraft-styles'; link.rel = 'stylesheet';
    link.href = new URL('./worldcraft.css', import.meta.url).href;
    // a preview without its stylesheet still works, so a failed load is not an error here
    link.addEventListener('load', resolve, { once: true }); link.addEventListener('error', resolve, { once: true });
    document.head.append(link);
  });
}

async function admit() {
  const [lifecycle, entries] = await Promise.all([
    import('./journey-lifecycle.mjs'),
    Promise.all(Object.entries(world.SOURCE_PINS).map(async ([field, pin]) => {
      const response = await fetch(new URL(`./data/share_alike/${pin.file}`, import.meta.url));
      if (!response.ok) throw new Error('source-unavailable');
      return [field, await response.arrayBuffer()];
    })),
  ]);
  return createWorldcraftPreviewHost({ bytes: Object.fromEntries(entries), digest: lifecycle.digest });
}

/**
 * Opens the builder over the kanji page that holds `invoker`, and returns to it. `isCurrent` is the page's own
 * test that it is still the page the door was pressed on; any host render that replaces the door ends the visit.
 */
export async function openWorldcraftPreview({ document, invoker, form, biLabel, tx, isCurrent }) {
  if (visiting) return;
  const window = document.defaultView;
  const make = (tag, cls, text) => { const node = document.createElement(tag); node.className = cls; if (text) node.textContent = text; return node; };
  const dialog = make('dialog', 'wc-dialog');
  dialog.id = 'worldcraft-dialog';
  dialog.setAttribute('aria-label', tx('字を組み立てる · 試作', 'Build a character · preview'));
  const shell = make('div', 'wc-shell'), body = make('div', 'wc-body');
  const note = make('p', 'wc-preview');
  note.id = 'worldcraft-preview-note';
  note.append(make('b', 'wc-preview-mark', tx('試作', 'Preview')), tx(
    'ここでは学習記録に何も保存されません。残した字は再読み込みすると消え、下にあるヘルプの扱いもまだ適用されません。',
    'Nothing here is saved to your record. Kept characters last until you reload, and the help rule described below is not applied yet.',
  ));
  const context = make('p', 'wc-context'); context.setAttribute('role', 'status'); context.hidden = true;
  shell.append(note, context, body); dialog.append(shell);
  const back = make('button', 'chip', tx('戻る', 'Return')); back.type = 'button';
  const origin = { x: window.scrollX, y: window.scrollY }, oldOverflow = document.body.style.overflow;
  let closed = false, view = null, session = null;
  const current = () => !closed && isCurrent();
  function close(restore = true) {
    if (closed) return;
    const ownsOrigin = current();
    closed = true; visiting = false; watcher.disconnect(); session?.end(); view?.destroy();
    dialog.close(); dialog.remove(); document.body.style.overflow = oldOverflow;
    if (restore && ownsOrigin) { window.scrollTo(origin.x, origin.y); invoker.focus({ preventScroll: true }); }
  }
  const watcher = new window.MutationObserver(() => { if (!closed && !isCurrent()) close(false); });
  back.addEventListener('click', () => close());
  // Escape asks the view's own Leave, so an unkept build still gets W-17 before it is lost.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    const leave = view && dialog.querySelector('.worldcraft-view > [data-worldcraft-action="leave"]');
    if (leave) leave.click(); else close();
  });
  // A browser may close a dialog over a prevented cancel (a second Escape): never leave the page locked behind it.
  dialog.addEventListener('close', () => close());
  body.append(make('p', 'wc-loading', tx('読み込み中…', 'Loading…')), back);
  visiting = true;
  document.body.append(dialog); dialog.showModal(); document.body.style.overflow = 'hidden';
  watcher.observe(document.body, { childList: true, subtree: true });
  try {
    await styles(document);
    page ||= admit();
    const host = await page.catch((error) => { page = null; throw error; });
    if (!current()) { close(false); return; }
    view = createWorldcraftView({ document, biLabel });
    let shown = null;
    session = host.visit(form, {
      render(dto) {
        context.hidden = !dto.viewing;
        context.textContent = dto.viewing ? tx(
          `残した字「${dto.viewing}」を見ています。「離れる」で「${form}」の組み立てに戻ります。`,
          `Viewing a kept character: ${dto.viewing}. Leave returns to building ${form}.`) : '';
        view.render(dto, session.actions);
        // The character changes at the top while the press was in the list below: bring the top into sight.
        if (dto.viewing !== shown) { shown = dto.viewing; dialog.scrollTop = 0; }
      },
      close: () => close(),
    });
    body.replaceChildren(view.element);
    session.paint();
    (dialog.querySelector('[data-worldcraft-action="assemble"]:not(:disabled)') ||
      dialog.querySelector('.worldcraft-view > [data-worldcraft-action="leave"]'))?.focus();
  } catch (error) {
    if (closed) return;
    if (!current()) { close(false); return; }
    session?.end(); view?.destroy(); session = null; view = null;
    body.replaceChildren(make('p', 'wc-loading', error?.message === 'crypto-unavailable'
      ? tx('この試作は、https か、このパソコン自身のアドレス（localhost）でだけ開けます。',
        'This preview opens only over https, or on this computer’s own address (localhost).')
      : tx('この試作を読み込めませんでした。戻って、もう一度お試しください。', 'This preview could not load. Return and try again.')), back);
    back.focus();
  }
}

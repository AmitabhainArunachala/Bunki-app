/**
 * WORLDCRAFT-3A finite, page-memory Passage model. No host, owner, navigation,
 * capture, storage, renderer or scheduler integration. No timers are started.
 * Capabilities are local to this module and their admitted catalog. Sharing an
 * actual token shares its model authority; it is not a learner-owner credential.
 */
import { inspectWorldcraftCatalog, resolveWorldcraftHop, readWorldOwner } from './m4-worldcraft.mjs';

const routes = new WeakMap();
const pages = new WeakMap();
const ownerPages = new WeakMap(), returns = new WeakMap();
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const ok = value => Object.freeze({ ok: true, value });
const no = reason => Object.freeze({ ok: false, reason });
const token = () => Object.freeze(Object.create(null));
const stopIds = ['職', '戠', '識', '戠', '織', '糸', '織'];
const edgeIds = ['戠:phonetic-component-of:職', '戠:phonetic-component-of:識',
  '戠:phonetic-component-of:識', '戠:phonetic-component-of:織',
  '糸:semantic-component-of:織', '糸:semantic-component-of:織'];
const directions = ['incoming', 'outgoing', 'incoming', 'outgoing', 'incoming', 'outgoing'];
const ref = id => ({ type: 'kanji', id });
function record(value, required, optional = []) {
  try {
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (!Reflect.ownKeys(descriptors).every(key => typeof key === 'string' &&
      [...required, ...optional].includes(key) && Object.hasOwn(descriptors[key], 'value')) ||
      !required.every(key => Object.hasOwn(descriptors, key))) return null;
    return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
  } catch { return null; }
}
function live(page) {
  const value = pages.get(page);
  return value && !value.discarded ? value : null;
}
function cursor(motion) {
  return { routeId: 'shiki-shoku-source-route', revision: 1, index: 0,
    phase: 0, status: 'paused', motion };
}

/** Fixed itinerary only; no caller-defined edges, source stamps or revisions. */
export function resolvePassage(catalog) {
  if (!inspectWorldcraftCatalog(catalog).ok) return no('catalog-not-admitted');
  const hops = [];
  for (let index = 0; index < edgeIds.length; index++) {
    const result = resolveWorldcraftHop(catalog, { edgeId: edgeIds[index],
      from: ref(stopIds[index]), to: ref(stopIds[index + 1]), direction: directions[index] });
    if (!result.ok) return no('route-edge-invalid');
    hops.push(result.value);
  }
  const route = token();
  routes.set(route, { catalog, snapshot: freeze({
    id: 'shiki-shoku-source-route', revision: 1,
    stops: stopIds.map((id, index) => ({ stopId: 'shiki-shoku-source-route/1/' + index, reference: ref(id) })),
    hops,
  }) });
  return ok(route);
}
export function inspectRoute(catalog, route) {
  const value = routes.get(route);
  if (!value || value.catalog !== catalog || !inspectWorldcraftCatalog(catalog).ok) return no('route-not-admitted');
  return ok(value.snapshot);
}
export function createPassage(owner, route, options) {
  const owned = readWorldOwner(owner);
  if (!owned.ok) return no('owner-not-live');
  if (!inspectRoute(owned.value.catalog, route).ok) return no('route-not-admitted');
  options = record(options, ['motion']);
  if (!options || !['full', 'reduced'].includes(options.motion)) return no('motion-unsupported');
  const currentOwner = readWorldOwner(owner);
  if (!currentOwner.ok) return no('owner-not-live');
  if (live(ownerPages.get(owner))) return no('existing-ride-use-resume');
  const page = token();
  pages.set(page, { owner, route: routes.get(route).snapshot, carried: currentOwner.value.carried,
    current: cursor(options.motion), ticket: null, pending: null, discarded: false });
  ownerPages.set(owner, page);
  return ok(page);
}
function snapshot(value) {
  return freeze({ cursor: { ...value.current }, stop: value.route.stops[value.current.index],
    incomingHop: value.current.index ? value.route.hops[value.current.index - 1] : null,
    motionTicket: value.ticket, carried: value.carried, interrupted: value.pending !== null });
}
export function inspectPassage(page) {
  const value = live(page);
  if (!value) return no('page-not-live');
  const current = value.current;
  if (!readWorldOwner(value.owner).ok || live(page) !== value || value.current !== current) return no('page-state-changed');
  return ok(snapshot(value));
}
function nextStop(current) {
  return current.index === stopIds.length - 1
    ? { ...current, status: 'complete', phase: 1 }
    : { ...current, index: current.index + 1, phase: 0 };
}

/**
 * Commands: play, pause, next, progress(ticket,phase), finish-step(ticket),
 * motion(motion), replay/start. Refusal makes no outer transition; a completed
 * reentrant action is retained rather than overwritten or rolled back.
 * progress(1) only updates phase; finish-step requires phase1 and consumes the
 * current ticket. This preserves JM's distinction between progress and next.
 */
export function reducePassage(page, command) {
  const value = live(page);
  if (!value) return no('page-not-live');
  if (value.pending) return no('continuation-pending');
  const initialCurrent = value.current;
  // Every accepted reduction replaces current, even if its visible values are
  // unchanged. Its private identity fences reflection-triggered reentrancy.
  const unchanged = () => live(page) === value && value.current === initialCurrent;
  command = record(command, ['type'], ['ticket', 'phase', 'motion']);
  if (!command || typeof command.type !== 'string') return no('command-shape');
  const required = {
    play: ['type'], pause: ['type'], next: ['type'], replay: ['type'], start: ['type'],
    progress: ['type', 'ticket', 'phase'], 'finish-step': ['type', 'ticket'], motion: ['type', 'motion'],
  };
  if (!Object.hasOwn(required, command.type) || !record(command, required[command.type])) return no('command-shape');
  if (!readWorldOwner(value.owner).ok) return no('owner-not-live');
  if (!unchanged()) return no('page-state-changed');
  const current = initialCurrent;
  let next = { ...current }, ticket = value.ticket;
  switch (command.type) {
    case 'play':
      if (current.status === 'complete') return no('ride-complete');
      if (current.status !== 'playing') {
        next.status = 'playing';
        ticket = current.motion === 'full' ? token() : null;
      }
      break;
    case 'pause':
      if (current.status !== 'complete') next.status = 'paused';
      ticket = null;
      break;
    case 'next':
      if (current.status === 'complete') return no('ride-complete');
      next = nextStop(current);
      ticket = next.status === 'playing' && next.motion === 'full' ? token() : null;
      break;
    case 'progress':
    case 'finish-step':
      if (current.motion !== 'full' || current.status !== 'playing') return no('motion-progress-refused');
      if (!ticket || command.ticket !== ticket) return no('motion-ticket-stale');
      if (command.type === 'progress') {
        if (typeof command.phase !== 'number' || !Number.isFinite(command.phase) ||
          command.phase < current.phase || command.phase < 0 || command.phase > 1) return no('phase-invalid');
        next.phase = command.phase;
      } else {
        if (current.phase !== 1) return no('phase-incomplete');
        next = nextStop(current);
        ticket = next.status === 'playing' ? token() : null;
      }
      break;
    case 'motion':
      if (!['full', 'reduced'].includes(command.motion)) return no('motion-unsupported');
      next.motion = command.motion;
      if (current.status !== 'complete') next.status = 'paused';
      ticket = null;
      break;
    case 'start':
    case 'replay':
      if (current.status !== 'complete') return no('existing-ride-use-resume');
      next = cursor(current.motion);
      ticket = null;
      break;
    default:
      return no('command-shape');
  }
  if (!readWorldOwner(value.owner).ok) return no('owner-not-live');
  if (!unchanged()) return no('page-state-changed');
  value.current = next;
  value.ticket = ticket;
  // Model changes describe no learner/host/timer operation.
  return ok(freeze({ page, snapshot: snapshot(value), effects: [] }));
}

/** A continuation binds the owned live navigation frame and actual visit. */
export function interruptPassage(page) {
  const value = live(page);
  if (!value) return no('page-not-live');
  if (value.pending) return no('continuation-pending');
  const current = value.current;
  const owned = readWorldOwner(value.owner);
  if (!owned.ok) return no('owner-not-live');
  if (live(page) !== value || value.current !== current || value.pending) return no('page-state-changed');
  const capability = token(), retained = { ...current, status: 'paused' };
  returns.set(capability, { owner: value.owner, page, navigation: owned.value.navigation, visit: owned.value.visit,
    retained, consumed: false, adopted: false });
  value.current = retained; value.ticket = null; value.pending = capability;
  return ok(capability);
}
function returnAccess(page, capability, owner) {
  const value = live(page), held = returns.get(capability);
  if (!value || !held || held.page !== page || held.owner !== owner || value.owner !== owner ||
    held.consumed || value.pending !== capability) return no('return-not-owned');
  const current = value.current;
  const owned = readWorldOwner(owner);
  if (!owned.ok) return no('owner-not-live');
  if (live(page) !== value || value.current !== current || value.pending !== capability || held.consumed) return no('page-state-changed');
  if (owned.value.navigation !== held.navigation) return no('navigation-stale');
  return ok({ value, held, current, owned: owned.value });
}
/** Explicit null→new visit adoption; never replaces an existing visit. */
export function adoptPassageVisit(page, capability, owner) {
  const a = returnAccess(page, capability, owner);
  if (!a.ok) return a;
  const { value, held, current, owned } = a.value;
  if (held.visit !== null || held.adopted || owned.visit === null) return no('visit-adoption-refused');
  const b = returnAccess(page, capability, owner);
  if (!b.ok || b.value.current !== current || b.value.owned.visit !== owned.visit) return no('page-state-changed');
  held.visit = owned.visit; held.adopted = true; value.current = { ...value.current };
  return ok(page);
}
export function resumePassage(page, capability, owner) {
  const a = returnAccess(page, capability, owner);
  if (!a.ok) return a;
  const { value, held, current, owned } = a.value;
  if (owned.visit !== held.visit) return no('visit-stale');
  const b = returnAccess(page, capability, owner);
  if (!b.ok || b.value.current !== current || b.value.owned.visit !== held.visit) return no('page-state-changed');
  // Consume and restore together. No callback-bearing inspector after commit.
  held.consumed = true; value.pending = null;
  value.current = { ...held.retained, status: 'paused' };
  value.ticket = null;
  return ok(Object.freeze({ page, snapshot: snapshot(value), visit: owned.visit, effects: Object.freeze([]) }));
}

/** Page-memory teardown only. No restore, durable checkpoint or host return. */
export function discardPassage(page) {
  const value = live(page);
  if (!value) return false;
  value.discarded = true;
  value.ticket = null;
  if (value.pending) returns.get(value.pending).consumed = true;
  value.pending = null;
  if (ownerPages.get(value.owner) === page) ownerPages.delete(value.owner);
  return true;
}

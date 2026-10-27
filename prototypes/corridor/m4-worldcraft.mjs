/**
 * WORLDCRAFT-3A: source admission and identity only (lease 1705, 2026-10-27).
 * 3A-2 adds isolated adapter-driven model operations, never a real host adapter.
 * No persistence implementation, UI, network, timers or learner authority.
 * Existing UMD implementations are trusted packaged code; the verifier binds
 * their bytes. Callers cannot inject models, implementations or expected hashes.
 */
import * as familyModule from './kanji-family.js';
import * as structureModule from './kanji-structure.js';

const familyAPI = familyModule.default ?? globalThis.BunkiKanjiFamily;
const structureAPI = structureModule.default ?? globalThis.BunkiKanjiStructure;
const catalogs = new WeakMap();
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const ok = value => Object.freeze({ ok: true, value });
const no = reason => Object.freeze({ ok: false, reason });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameRef = (a, b) => a.type === b.type && a.id === b.id;
const samePlain = (a, b) => {
  const canonical = value => JSON.stringify(value, (key, row) => row && typeof row === 'object' && !Array.isArray(row)
    ? Object.fromEntries(Object.keys(row).sort().map(k => [k, row[k]])) : row);
  return canonical(a) === canonical(b);
};
const check = (condition, reason) => { if (!condition) throw new Error(reason); };
const token = () => Object.freeze(Object.create(null));
const ref = id => ({ type: 'kanji', id });
const hosts = freeze({ 職: '耳', 識: '言', 織: '糸' });
const fields = ['familyBytes', 'structureBytes', 'kanjiBytes', 'wordsBytes', 'strokesBytes'];
export const SOURCE_PINS = freeze({
  familyBytes: { file: 'kanji-family.json', sha256: 'd164ec7b2fe39c5920d7fc05f4731c79db535815c5495aea7c2904b59532499b' },
  structureBytes: { file: 'kanji-structure.json', sha256: '1d20c18a662734f84eb6b718457de35536d51952b56328cefa7eaa111251537a' },
  kanjiBytes: { file: 'kanji.json', sha256: '8ce7ad0151a2bf487bda72c384460eca908fc1bdc2a4073042b9e3db7342d2ce' },
  wordsBytes: { file: 'words.json', sha256: 'd21ff76508a3ed88cec9c096510feac9b5ff2df639061a3be46cb85c6fdf985b' },
  strokesBytes: { file: 'strokes.json', sha256: '435c37c0063fba4180d3cb444ef54cfa2430e71a650a4032cc481ada29627f2b' },
});

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
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const typedName = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
const typedBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const typedLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
function arrayBufferSize(value) {
  try { return bufferLength.call(value); } catch { return null; }
}
function bytes(value) {
  let view;
  const bufferSize = arrayBufferSize(value);
  // Internal brands precede conversion: forged prototypes must never reach
  // Uint8Array's iterable/array-like overloads or invoke caller callbacks.
  if (bufferSize !== null) {
    view = new Uint8Array(value);
  } else {
    check(typedName.call(value) === 'Uint8Array' &&
      arrayBufferSize(typedBuffer.call(value)) !== null, 'source-bytes-required');
    view = value;
  }
  const length = typedLength.call(view);
  check(length > 0 && length <= 4 * 1024 * 1024, 'source-size');
  // Copy internal bytes, never caller-controlled slice/species/accessor methods.
  // Buffer and nonzero-offset views are supported; shared backing is refused.
  return new Uint8Array(view);
}
async function sha256(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
function compileRecipe(model, structure, strokes, host) {
  const view = structure.inspect(host);
  const root = view.occurrences.find(o => o.groupPath === '$/0');
  check(root?.reference?.type === 'kanji' && root.reference.id === host, 'glyph-root');
  const whole = structure.project(host, root.id);
  const slots = [hosts[host], '戠'].map((part, index) => {
    const relation = index ? 'phonetic-component' : 'semantic-component';
    const roles = model.edgesFor(ref(host), relation).filter(e => e.from.id === part && e.to.id === host);
    check(roles.length === 1, 'role-join');
    const nodes = model.catalog().nodes.filter(n => n.reference.type === 'component-occurrence' &&
      n.host.id === host && n.component.id === part);
    check(nodes.length === 1, 'occurrence-join');
    const node = nodes[0], occurrence = structure.occurrence(host, node.reference.id);
    const projection = structure.project(host, node.reference.id);
    const joins = model.edgesFor(ref(part), 'source-component-occurrence').filter(e => e.to.id === node.reference.id);
    check(joins.length === 1 && roles[0].evidence.length && joins[0].evidence.length, 'occurrence-edge');
    check(occurrence.parentId === root.id && occurrence.groupPath === (index ? '$/0/1' : '$/0/0') &&
      occurrence.sourceAttributes['{http://kanjivg.tagaini.net}position'] === (index ? 'right' : 'left'), 'slot-position');
    check(node.sourceSha256 === whole.source.sha256 && projection.source.sha256 === whole.source.sha256 &&
      same(model.geometry(node.reference)?.projection, projection), 'projection-parity');
    return { side: index ? 'right' : 'left', part, roleEdgeId: roles[0].id,
      occurrenceEdgeId: joins[0].id, occurrenceId: node.reference.id,
      occurrence, projection };
  });
  const indices = slots.flatMap(s => s.projection.pathIndices);
  check(new Set(indices).size === indices.length && same(indices, whole.pathIndices) &&
    same(slots.flatMap(s => s.projection.paths), whole.paths) && same(whole.paths, strokes[host]), 'whole-path-parity');
  const recipe = { kanji: ref(host), rootOccurrenceId: root.id, sourceSHA256: whole.source.sha256,
    strokeIndices: whole.pathIndices, paths: whole.paths, scope: 'whole-character-source-stroke-inventory' };
  return { recipe, slots };
}

/**
 * Accept exactly five original byte inputs; returns Promise<Result<Catalog>>.
 * All spans are copied synchronously before the first await. The opaque token
 * proves this module's source admission, NOT record ownership or user consent.
 */
export async function createWorldcraftCatalog(input) {
  let copies;
  try {
    input = record(input, fields);
    if (!input) return no('source-input-shape');
    copies = Object.fromEntries(fields.map(field => [field, bytes(input[field])]));
  } catch { return no('source-bytes-required'); }
  if (!globalThis.crypto?.subtle) return no('crypto-unavailable');
  try {
    const hashes = await Promise.all(fields.map(field => sha256(copies[field])));
    for (let i = 0; i < fields.length; i++) {
      const expected = SOURCE_PINS[fields[i]].sha256;
      if (hashes[i] !== expected) return no('source-hash-mismatch:' + fields[i]);
    }
    const decode = field => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(copies[field]));
    const data = decode('familyBytes'), grouping = decode('structureBytes');
    const kanji = decode('kanjiBytes').kanji, words = decode('wordsBytes').words, strokes = decode('strokesBytes').strokes;
    const structure = structureAPI.createModel({ kanji, strokes, grouping });
    const model = familyAPI.createModel({ data, kanji, words, structure });
    check(model.family().id === 'shiki-shoku' && same(model.family().members.map(r => r.id), Object.keys(hosts)), 'family-members');
    const navigation = familyAPI.createNavigation({ model });
    const recipes = new Map();
    for (const host of Object.keys(hosts)) {
      const built = compileRecipe(model, structure, strokes, host);
      const recipeSHA256 = await sha256(new TextEncoder().encode(JSON.stringify(built.recipe)));
      const slots = built.slots.map(({ side, part, roleEdgeId, occurrenceEdgeId, occurrenceId }) =>
        ({ side, part, roleEdgeId, occurrenceEdgeId, occurrenceId }));
      recipes.set(host, freeze({ recipe: built.recipe, ref: {
        schema: 1, catalogSHA256: SOURCE_PINS.familyBytes.sha256, host,
        rootOccurrenceId: built.recipe.rootOccurrenceId, sourceSHA256: built.recipe.sourceSHA256,
        recipeSHA256, slots,
      } }));
    }
    const capability = token();
    catalogs.set(capability, { model, navigation, recipes });
    return ok(capability);
  } catch { return no('source-model-invalid'); }
}

export function inspectWorldcraftCatalog(catalog) {
  const data = catalogs.get(catalog);
  if (!data) return no('catalog-not-admitted');
  return ok(freeze({ family: data.model.family(),
    forms: Object.keys(hosts), words: data.model.catalog().nodes.filter(n => n.reference.type === 'word').map(n => n.reference) }));
}

/** Optional occurrenceIds are an explicit left/right witness, never an override. */
export function resolveBuild(catalog, request) {
  const data = catalogs.get(catalog);
  if (!data) return no('catalog-not-admitted');
  request = record(request, ['host', 'left', 'right'], ['occurrenceIds']);
  if (!request) return no('build-request-shape');
  if (typeof request.host !== 'string' || !Object.hasOwn(hosts, request.host)) return no('unsupported-host');
  if (request.left !== hosts[request.host] || request.right !== '戠') return no('part-host-role-mismatch');
  const built = data.recipes.get(request.host);
  if (Object.hasOwn(request, 'occurrenceIds')) {
    // Descriptor values avoid executing an accessor in the optional witness.
    try {
      const ids = request.occurrenceIds, descriptors = Object.getOwnPropertyDescriptors(ids);
      if (!Array.isArray(ids) || descriptors.length.value !== 2 ||
        !built.ref.slots.every((slot, index) => descriptors[index]?.value === slot.occurrenceId)) {
        return no('occurrence-host-mismatch');
      }
    } catch { return no('occurrence-host-mismatch'); }
  }
  return ok(built);
}

/** Authored typed-role edge with explicit direction and exact endpoints. */
export function resolveWorldcraftHop(catalog, request) {
  const data = catalogs.get(catalog);
  if (!data) return no('catalog-not-admitted');
  request = record(request, ['edgeId', 'from', 'to', 'direction']);
  if (!request) return no('hop-request-shape');
  request.from = record(request.from, ['type', 'id']);
  request.to = record(request.to, ['type', 'id']);
  if (!request.from || !request.to ||
    request.from.type !== 'kanji' || request.to.type !== 'kanji' ||
    typeof request.from.id !== 'string' || !request.from.id ||
    typeof request.to.id !== 'string' || !request.to.id ||
    typeof request.edgeId !== 'string' || !['incoming', 'outgoing'].includes(request.direction)) return no('hop-request-shape');
  const edge = data.model.catalog().edges.find(e => e.id === request.edgeId);
  if (!edge || !['phonetic-component', 'semantic-component'].includes(edge.relation)) return no('unsupported-edge');
  const from = request.direction === 'incoming' ? edge.to : edge.from;
  const to = request.direction === 'incoming' ? edge.from : edge.to;
  if (!sameRef(from, request.from) || !sameRef(to, request.to)) return no('edge-direction-mismatch');
  const target = data.navigation.destination(edge.id, from);
  if (target.status !== 'available' || !same(target.reference, to)) return no('edge-unavailable');
  return ok(freeze({ edgeId: edge.id, relation: edge.relation, direction: request.direction,
    from, to, evidence: edge.evidence }));
}

/** Preserve real word+reading and attributed examples; no task/attempt is made. */
export function resolveWorldcraftWord(catalog, reference) {
  const data = catalogs.get(catalog);
  if (!data) return no('catalog-not-admitted');
  reference = record(reference, ['type', 'id', 'reading']);
  if (!reference || reference.type !== 'word' ||
    typeof reference.id !== 'string' || !reference.id ||
    typeof reference.reading !== 'string' || !reference.reading) return no('word-reference-shape');
  const node = data.model.node(reference);
  if (!node) return no('word-not-in-family');
  return ok(freeze({ reference: node.reference, evidence: node.evidence,
    examples: data.model.catalog().examples.filter(e => same(e.word, node.reference)) }));
}

// The configured callbacks are the trust boundary. Model tokens prove custody,
// not actual host authority. See the external 3A-2 ADAPTER-CONTRACT receipt.
const owners = new WeakMap(), views = new WeakMap(), states = new WeakMap(), drafts = new WeakMap();
const identityFields = ['owner', 'record', 'epoch', 'generation', 'boot', 'journeyId'];
const isObject = value => value !== null && typeof value === 'object';
function plainCopy(value, depth = 0, seen = new Set()) {
  check(depth <= 22, 'depth-bound');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { check(value.length <= 262144, 'byte-bound'); return value; }
  if (typeof value === 'number') { check(Number.isFinite(value) && !Object.is(value, -0), 'plain-required'); return value; }
  check(isObject(value) && !seen.has(value), 'plain-required');
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
  check(proto === Object.prototype || proto === null || (array && proto === Array.prototype), 'plain-required');
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(ds).filter(k => !(array && k === 'length'));
  check(keys.length <= 32768 && (!array || keys.length === ds.length.value), 'plain-required');
  seen.add(value);
  const result = array ? [] : {};
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index], d = ds[key];
    check(typeof key === 'string' && d.enumerable && Object.hasOwn(d, 'value') &&
      (!array || key === String(index)), 'plain-required');
    Object.defineProperty(result, key, { value: plainCopy(d.value, depth + 1, seen), enumerable: true, writable: true, configurable: true });
  }
  seen.delete(value);
  if (depth === 0) check(new TextEncoder().encode(JSON.stringify(result)).length <= 262144, 'byte-bound');
  return result;
}
function copyCarried(catalog, raw) {
  if (raw === null) return null;
  const c = record(plainCopy(raw), ['word', 'sourceOccurrence', 'sense']);
  check(c && resolveWorldcraftWord(catalog, c.word).ok, 'carried-word');
  const source = c.sourceOccurrence, span = source?.sentence;
  check(source && !Array.isArray(source) && source.source === 'passage' &&
    typeof source.passage === 'string' && source.passage.length > 0 &&
    !Object.hasOwn(source, 'article') && !Object.hasOwn(source, 'span') &&
    Number.isSafeInteger(source.token) && source.token >= 0 &&
    Array.isArray(span) && span.length === 2 && span.every(Number.isSafeInteger) &&
    span[0] >= 0 && span[1] > span[0] && source.token >= span[0] && source.token < span[1], 'carried-occurrence');
  return freeze(c);
}
function sample(owner) {
  const o = owners.get(owner);
  if (!o?.active || o.reading) return no('owner-unavailable');
  const revision = o.revision;
  o.reading = true;
  try {
    const s = record(o.ports.read(), ['owner', 'record', 'epoch', 'generation', 'boot', 'journeyId',
      'view', 'navigation', 'visit', 'carried', 'root'], ['journeyWrites', 'worldcraftEnabled']);
    check(s && ['owner', 'record', 'boot', 'view', 'navigation'].every(k => isObject(s[k])) &&
      Number.isSafeInteger(s.epoch) && s.epoch >= 0 &&
      ['generation', 'journeyId'].every(k => s[k] === null || (typeof s[k] === 'string' && s[k].length > 0)) &&
      (s.visit === null || isObject(s.visit)), 'owner-snapshot');
    if (o.identity && identityFields.some(k => s[k] !== o.identity[k])) {
      o.active = false; o.revision++; return no('owner-changed');
    }
    const carried = copyCarried(o.catalog, s.carried);
    if (!o.active || o.revision !== revision) return no('owner-changed');
    if (!o.identity) o.identity = Object.fromEntries(identityFields.map(k => [k, s[k]]));
    return ok({ ...s, carried, journeyWrites: s.journeyWrites === true, worldcraftEnabled: s.worldcraftEnabled === true });
  } catch { return no('owner-unavailable'); }
  finally { o.reading = false; }
}
export function createWorldOwner(catalog, ports) {
  if (!catalogs.has(catalog)) return no('catalog-not-admitted');
  ports = record(ports, ['read'], ['capture', 'lifecycle', 'digest', 'settledRead']);
  if (!ports || typeof ports.read !== 'function') return no('adapter-shape');
  const owner = token();
  owners.set(owner, { catalog, ports, active: true, reading: false, revision: 0, identity: null });
  const s = sample(owner);
  if (!s.ok) { owners.delete(owner); return s; }
  return ok(owner);
}
export function revokeWorldOwner(owner) {
  const o = owners.get(owner);
  if (!o?.active) return false;
  o.active = false; o.revision++; return true;
}
export function readWorldOwner(owner) {
  const result = sample(owner);
  if (!result.ok) return result;
  const { view, navigation, visit, carried, journeyWrites, worldcraftEnabled } = result.value;
  // Shallow only: visit and navigation are live identities owned by the host.
  return ok(Object.freeze({ catalog: owners.get(owner).catalog, view, navigation, visit, carried, journeyWrites, worldcraftEnabled }));
}
export function createWorldView(owner) {
  const s = sample(owner);
  if (!s.ok) return s;
  const ticket = token(); views.set(ticket, { owner, view: s.value.view }); return ok(ticket);
}
function worldAccess(state, draft = null, requireView = false) {
  const s = states.get(state), d = draft === null ? null : drafts.get(draft);
  if (!s?.active || (draft !== null && (!d || d.state !== state))) return no('state-or-draft-not-owned');
  const r = sample(s.owner);
  if (!r.ok || !s.active) return no('owner-changed');
  if (!r.value.journeyWrites || !r.value.worldcraftEnabled) return no('worldcraft-off');
  if (requireView && (!d || views.get(d.view)?.owner !== s.owner || views.get(d.view)?.view !== r.value.view)) return no('view-stale');
  return ok({ s, d, snapshot: r.value, ports: owners.get(s.owner).ports });
}
export function createWorldcraftState(owner) {
  const r = sample(owner);
  if (!r.ok) return r;
  if (!r.value.journeyWrites || !r.value.worldcraftEnabled) return no('worldcraft-off');
  const state = token();
  states.set(state, { owner, active: true, prefix: crypto.randomUUID(), serial: 0, liveDrafts: 0,
    inflight: new Map(), removals: new Map() });
  return ok(state);
}
export function discardWorldcraftState(state) {
  const s = states.get(state);
  if (!s?.active) return false;
  s.active = false; return true;
}
export function beginBuild(state, catalog, host) {
  const a = worldAccess(state);
  if (!a.ok) return a;
  const { s } = a.value;
  if (owners.get(s.owner).catalog !== catalog) return no('catalog-not-owned');
  if (typeof host !== 'string' || !Object.hasOwn(hosts, host)) return no('unsupported-host');
  const built = resolveBuild(catalog, { host, left: hosts[host], right: '戠' });
  if (!built.ok) return built;
  if (s.liveDrafts >= 16 || !Number.isSafeInteger(s.serial + 1)) return no('draft-bound');
  const draft = token();
  drafts.set(draft, { state, catalog, built: built.value, key: s.prefix + '/' + (++s.serial),
    phase: 'new', placement: null, view: null, version: token(), uncertain: false, target: null, released: false });
  s.liveDrafts++; return ok(draft);
}
export function inspectBuild(state, draft) {
  const a = worldAccess(state, draft);
  if (!a.ok) return a;
  const d = a.value.d;
  return ok(freeze({ buildKey: d.key, host: d.built.ref.host, phase: d.phase,
    placement: d.placement, uncertain: d.uncertain, recipe: d.built.ref }));
}
export async function assembleBuild(state, draft, view) {
  const d = drafts.get(draft);
  if (!d || d.state !== state || d.phase !== 'new') return no('draft-not-new');
  const version = token(); d.phase = 'assembling'; d.version = version; d.view = view;
  const a = worldAccess(state, draft, true);
  let proof = null, open = true, failed = false;
  try {
    if (!a.ok || typeof a.value.ports.capture !== 'function') throw new Error('capture-unavailable');
    const settle = kind => { if (open && proof === null) proof = kind; };
    await a.value.ports.capture(freeze({ host: d.built.ref.host, recipe: d.built.ref, buildKey: d.key }),
      Object.freeze({ kept: () => settle('kept'), held: () => settle('held') }));
  } catch { failed = true; }
  finally { open = false; }
  const valid = worldAccess(state, draft, true);
  if (!valid.ok || d.version !== version || d.phase !== 'assembling' || failed || !proof) {
    if (d.version === version) { d.phase = 'new'; d.view = null; d.version = token(); }
    return !valid.ok ? valid : no('disclosure-unproved');
  }
  d.phase = 'assembled'; d.version = token(); return ok(draft);
}
export function placeBuild(state, draft, placement) {
  const d = drafts.get(draft), witness = d?.version;
  if (!d || d.state !== state || d.phase !== 'assembled' || d.uncertain || states.get(state)?.inflight.has(d.key)) return no('draft-not-placeable');
  const a = worldAccess(state, draft, true);
  if (!a.ok) return a;
  if (placement !== null) {
    placement = record(placement, ['x', 'y']);
    if (!placement || !['x', 'y'].every(k => typeof placement[k] === 'number' && Number.isFinite(placement[k]) && !Object.is(placement[k], -0) && Math.abs(placement[k]) <= 1000)) return no('placement-invalid');
  }
  if (!worldAccess(state, draft, true).ok || d.version !== witness || d.phase !== 'assembled' || states.get(state)?.inflight.has(d.key)) return no('draft-changed');
  d.placement = placement === null ? null : freeze(placement); d.version = token(); return ok(draft);
}
function rootRead(state) {
  const a = worldAccess(state);
  if (!a.ok) return a;
  try {
    const root = plainCopy(a.value.snapshot.root);
    check(root && root.version === 1 && root.protocol === 'journey-r2' && root.id === a.value.snapshot.journeyId && root.generation === a.value.snapshot.generation &&
      Number.isSafeInteger(root.revision) && root.revision >= 1 && Array.isArray(root.projects) && root.projects.length <= 16 &&
      Number.isSafeInteger(root.nextProject) && Number.isSafeInteger(root.progress?.retiredProjects) &&
      root.nextProject === root.projects.length + root.progress.retiredProjects, 'root-structure');
    check(new Set(root.projects.map(p => p.id)).size === root.projects.length && root.projects.every(p =>
      typeof p.id === 'string' && p.id.startsWith(root.id + '/projects/') &&
      /^[1-9]\d*$/.test(p.id.split('/').at(-1)) && Number(p.id.split('/').at(-1)) <= root.nextProject), 'project-identity');
    if (!worldAccess(state).ok) return no('owner-changed');
    return ok(root);
  } catch { return no('structural'); }
}
function projectData(d) { return { status: 'completed', recipe: d.built.ref, buildKey: d.key, placement: d.placement }; }
function ownedProject(root, d) { return root.projects.find(p => p.buildKey === d.key && p.status === 'completed' && samePlain(p.recipe, d.built.ref) && samePlain(p.placement, d.placement)); }
function outcome(kind, reason = null, observed = null, extra = {}) { return freeze({ kind, reason, observed, ...extra }); }
function releaseDraft(s, d) { if (!d.released) { d.released = true; s.liveDrafts--; } }
// C2 proves the exact lifecycle invocation refused before target dispatch. Local
// admission additionally needs our own error identity, target and draft version.
const admissionRefusals = new WeakMap(), duplicateAdmissions = new WeakMap();
function lifecyclePort(ports) {
  const p = record(ports.lifecycle, ['tick', 'inspect', 'work', 'retire', 'holdUnconfirmed', 'preDispatchRefusal']);
  check(p && Object.values(p).every(v => typeof v === 'function') && typeof ports.digest === 'function', 'lifecycle-unavailable');
  return p;
}
async function writeProject(state, target, start, requireView = null) {
  let observed = null, count = 0, thrown = false, caught, lc, ports;
  const a = worldAccess(state);
  if (!a.ok) return outcome('refused', a.reason);
  ports = a.value.ports;
  try { lc = lifecyclePort(ports); } catch { return outcome('refused', 'lifecycle-unavailable'); }
  if (!worldAccess(state).ok) return outcome('owner-changed', 'owner-changed');
  const observe = raw => {
    count++;
    const r = record(raw, ['action', 'outcome', 'acknowledged', 'rootHash', 'proposedHash']);
    observed = r && Object.values(r).every(v => v === null || ['string', 'boolean'].includes(typeof v)) ? freeze(r) : null;
  };
  let open = true;
  try { await start(lc, raw => { if (open) observe(raw); }); } catch (error) {
    thrown = true; caught = error; // Do not inspect an escaping value for publication authority.
  }
  finally { open = false; }
  const owner = worldAccess(state);
  if (!owner.ok) return outcome('owner-changed', owner.reason, observed);
  const root = rootRead(state);
  let exact = false;
  try {
    exact = !thrown && count === 1 && observed?.action === target.action && observed.outcome === 'published' &&
      observed.acknowledged === true && /^[a-f0-9]{64}$/.test(observed.rootHash) &&
      observed.rootHash === observed.proposedHash && root.ok && ports.digest(root.value) === observed.proposedHash;
  } catch { /* failed digest is not acknowledgement */ }
  if (!worldAccess(state).ok) return outcome('owner-changed', 'owner-changed', observed);
  if (exact) return outcome('published', null, observed, { display: requireView === null || worldAccess(state, requireView, true).ok });
  if (count === 1 && observed?.action === target.action && observed.outcome === 'not-published') {
    // C2's observed nonpublication makes change() throw publication-hold. Keep
    // that diagnostic without reading a possibly replaced escaping error.
    return outcome('not-published', thrown ? 'publication-hold' : null, observed);
  }
  if (count === 0 && thrown) {
    let proof = null;
    if (!worldAccess(state).ok) return outcome('owner-changed', 'owner-changed', observed);
    try { proof = record(lc.preDispatchRefusal(target.operation, caught), ['action', 'collection', 'source', 'reason']); }
    catch { /* Missing or throwing evidence after start cannot prove nonpublication. */ }
    if (!worldAccess(state).ok) return outcome('owner-changed', 'owner-changed', observed); // after query and reflection
    if (proof?.action === target.action && proof.collection === 'projects') {
      if (proof.source === 'lifecycle-guard' && typeof proof.reason === 'string') {
        return outcome(['root-invalid', 'byte-bound', 'root-unavailable'].includes(proof.reason) ? 'structural' : 'refused', proof.reason);
      }
      const own = admissionRefusals.get(caught), d = drafts.get(requireView);
      if (proof.source === 'admission' && proof.reason === null && own?.target === target &&
        own.draft === requireView && own.version === d?.version && d.state === state) {
        const result = outcome('refused', own.reason);
        if (own.reason === 'project-exists') duplicateAdmissions.set(result, target);
        return result;
      }
    }
  }
  if (!worldAccess(state).ok) return outcome('owner-changed', 'owner-changed', observed);
  try { lc.holdUnconfirmed(); } catch { /* preserve uncertain target */ }
  return outcome('uncertain', 'publication-unproved', observed);
}
function reserved(s, key, run) {
  if (s.inflight.has(key)) return s.inflight.get(key);
  // Schedule after reservation; even a synchronous callback sees the joined call.
  const pending = Promise.resolve().then(run);
  s.inflight.set(key, pending);
  pending.finally(() => { if (s.inflight.get(key) === pending) s.inflight.delete(key); }).catch(() => {});
  return pending;
}
export function keepBuild(state, draft) {
  const s = states.get(state), d = drafts.get(draft);
  if (!s?.active || !d || d.state !== state) return Promise.resolve(outcome('refused', 'state-or-draft-not-owned'));
  return reserved(s, d.key, async () => {
    const a = worldAccess(state, draft, true);
    if (!a.ok) return outcome('refused', a.reason);
    if (!['assembled', 'saved'].includes(d.phase)) return outcome('refused', 'disclosure-unproved');
    if (d.uncertain) return outcome('uncertain', 'reconcile-required');
    const root = rootRead(state);
    if (!root.ok) return outcome('structural', root.reason);
    const prior = ownedProject(root.value, d);
    if (prior) { d.phase = 'saved'; releaseDraft(s, d); return outcome('exists', null, null, { projectId: prior.id }); }
    if (d.phase === 'saved') return outcome('refused', 'saved-project-absent');
    const version = d.version, target = freeze({ action: 'work', buildKey: d.key, projectId: null, operation: token() });
    d.target = target;
    const reject = reason => {
      const error = new Error(reason);
      admissionRefusals.set(error, { target, draft, version, reason });
      throw error;
    };
    const result = await writeProject(state, target, (lc, observe) => lc.work('projects', projectData(d), { observe, operation: target.operation,
      admit(proposed) {
        const access = worldAccess(state, draft, true);
        if (!access.ok) reject(access.reason);
        if (d.version !== version || d.phase !== 'assembled') reject('draft-changed');
        const next = plainCopy(proposed);
        if (next.id !== access.value.snapshot.journeyId || next.generation !== access.value.snapshot.generation) reject('owner-epoch');
        if (next.projects.some(p => p.buildKey === d.key)) reject('project-exists');
        if (!worldAccess(state, draft, true).ok || d.version !== version) reject('draft-changed');
      } }), draft);
    if (result.kind === 'published' || (result.kind === 'refused' && duplicateAdmissions.get(result) === target)) {
      const current = rootRead(state), found = current.ok && ownedProject(current.value, d);
      const final = worldAccess(state, draft);
      if (found && final.ok) {
        d.phase = 'saved'; releaseDraft(s, d);
        return outcome(result.kind === 'published' ? 'published' : 'exists', null, result.observed, { projectId: found.id, display: result.display === true && views.get(d.view)?.view === final.value.snapshot.view });
      }
      d.uncertain = true;
      return final.ok ? outcome('uncertain', 'project-unconfirmed', result.observed) : outcome('owner-changed', final.reason, result.observed);
    }
    d.uncertain = ['uncertain', 'owner-changed'].includes(result.kind);
    return result;
  });
}
async function settledRoot(state, target) {
  const a = worldAccess(state);
  if (!a.ok) return a;
  let signalled = false, open = true;
  try {
    if (typeof a.value.ports.settledRead !== 'function') return no('settlement-unavailable');
    await a.value.ports.settledRead(target, settled => { if (open && settled === target) signalled = true; });
  } catch { return no('settlement-unresolved'); }
  finally { open = false; }
  if (!signalled || !worldAccess(state).ok) return no('settlement-unresolved');
  try {
    const lc = lifecyclePort(a.value.ports);
    if (!worldAccess(state).ok) return no('owner-changed');
    await lc.tick();
  } catch { return no('settlement-unresolved'); }
  return rootRead(state);
}
export function reconcileBuild(state, draft) {
  const s = states.get(state), d = drafts.get(draft);
  if (!s?.active || !d || d.state !== state) return Promise.resolve(outcome('refused', 'state-or-draft-not-owned'));
  if (s.inflight.has(d.key)) return Promise.resolve(outcome('unresolved', 'target-inflight'));
  return reserved(s, d.key, async () => {
    const root = d.uncertain ? await settledRoot(state, d.target) : rootRead(state);
    if (!root.ok) return outcome('unresolved', root.reason);
    if (!worldAccess(state, draft).ok) return outcome('refused', 'owner-changed');
    const found = ownedProject(root.value, d);
    if (found) { d.uncertain = false; d.phase = 'saved'; releaseDraft(s, d); return outcome('present', null, null, { projectId: found.id }); }
    if (root.value.projects.some(p => p.buildKey === d.key)) return outcome('unresolved', 'stored-recipe-mismatch');
    d.uncertain = false;
    return outcome('absent');
  });
}
export function removeBuild(state, projectId) {
  const s = states.get(state);
  if (!s?.active || typeof projectId !== 'string') return Promise.resolve(outcome('refused', 'state-or-project-not-owned'));
  return reserved(s, 'remove:' + projectId, async () => {
    const a = worldAccess(state);
    if (!a.ok) return outcome('refused', a.reason);
    const pending = s.removals.get(projectId);
    const root = pending ? await settledRoot(state, pending) : rootRead(state);
    if (!root.ok) return outcome(pending ? 'unresolved' : 'structural', root.reason);
    const listing = keptBuilds(root.value, owners.get(s.owner).catalog);
    if (!listing.ok) return outcome('structural', listing.reason);
    const row = listing.value.find(p => p.projectId === projectId);
    if (!row) { s.removals.delete(projectId); return outcome('absent'); }
    if (!row.actionable) return outcome('refused', 'stored-recipe-unadmitted');
    if (!worldAccess(state).ok) return outcome('owner-changed', 'owner-changed');
    const target = freeze({ action: 'retire-work', buildKey: row.buildKey, projectId, operation: token() });
    const result = await writeProject(state, target, (lc, observe) => lc.retire('projects', projectId, 'retire-completed', { observe, operation: target.operation }));
    if (['uncertain', 'owner-changed'].includes(result.kind)) s.removals.set(projectId, target);
    else s.removals.delete(projectId);
    return result;
  });
}
export function keptBuilds(root, catalog) {
  const c = catalogs.get(catalog);
  if (!c) return no('catalog-not-admitted');
  try {
    root = plainCopy(root);
    check(Array.isArray(root.projects) && root.projects.length <= 16, 'root-structure');
    return ok(freeze(root.projects.map(p => {
      const known = c.recipes.get(p.recipe?.host);
      const placement = p.placement === null || (record(p.placement, ['x', 'y']) &&
        ['x', 'y'].every(k => typeof p.placement[k] === 'number' && Number.isFinite(p.placement[k]) && !Object.is(p.placement[k], -0) && Math.abs(p.placement[k]) <= 1000));
      const actionable = p.status === 'completed' && typeof p.buildKey === 'string' && p.buildKey.length <= 512 &&
        p.buildKey.length > 0 && known && samePlain(p.recipe, known.ref) && placement;
      return { projectId: p.id, buildKey: p.buildKey ?? null, actionable: !!actionable,
        reason: actionable ? null : 'stored-recipe-unadmitted', recipe: actionable ? known.ref : null, placement: actionable ? p.placement : null };
    })));
  } catch { return no('structural'); }
}

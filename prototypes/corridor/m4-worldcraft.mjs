/**
 * WORLDCRAFT-3A: source admission and identity only (lease 1705, 2026-10-27).
 * No capture, projects, persistence, UI, network, timers or learner authority.
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
const typedBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const typedLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
function bytes(value) {
  let view;
  if (value instanceof ArrayBuffer) {
    view = new Uint8Array(value);
  } else {
    check(value instanceof Uint8Array && typedBuffer.call(value) instanceof ArrayBuffer, 'source-bytes-required');
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

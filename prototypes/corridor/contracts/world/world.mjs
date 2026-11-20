/** One world model (G7; SPEC S6-R8, S7-R2, S7-R3, S7-R15): a world is a view over the shared graph, with one state layer.
 *
 *  The shared graph is read, never copied: entries through the G13 entry catalog (G9 entry, reading and sense ids), kanji
 *  and their components through the G5 parts graph (part ids). A world of any kind — Worldcraft, Passage, a quest, a kanji
 *  world, or M3's design as an instance — opens on an entry id and sees the same view. One state layer holds what the
 *  three rescued models kept apart: Worldcraft's projects, Passage's interruptible continuation, the quest and journey
 *  lifecycle. Every entrance, direct or from another mode, writes a G4 return record. No Japanese is written in this file
 *  or its stubs: every character a world shows comes from the shipped data through the graph (S7-R15). Pure: no DOM,
 *  store, clock or network. */
import { createEntryCatalog } from '../word-entry/entry.mjs';
import { createPartsGraph } from '../parts/parts.mjs';
import { createReturnRecord } from '../return/return.mjs';

export const WORLD_KINDS = Object.freeze(['worldcraft', 'passage', 'quest', 'kanji-world', 'm3-design']);
export const ENTRANCES = Object.freeze(['direct', 'reader', 'word', 'kanji', 'voice', 'drift']);
export const STATE_KEYS = Object.freeze(['continuation', 'journeys', 'projects', 'version']);
const IDEOGRAPH = /\p{Script=Han}/u;
const ENTRY_ID = /^entry:[^:|]+:([^|]+)\|.+$/u;

export class WorldContractError extends TypeError { constructor(reason, detail) { super(detail ? `${reason}: ${detail}` : reason); this.name = 'WorldContractError'; this.reason = reason; } }
const refuse = (reason, detail) => { throw new WorldContractError(reason, detail); };
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const filled = (v) => typeof v === 'string' && v.trim() !== '';
const int0 = (v) => Number.isSafeInteger(v) && v >= 0;
const freeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };

/** the shared graph as a world reads it: dictionary entries (G13 over dict-v2) and kanji parts (G5 over KanjiVG) */
export function createSharedGraph({ dictionary, parts } = {}) {
  if (!dictionary || !parts || !parts.graph) refuse('invalid-graph', 'createSharedGraph({dictionary: the dict-v2 data, parts: {graph, unmapped}})');
  const entries = createEntryCatalog(dictionary), partsGraph = createPartsGraph(parts);
  // a relation runs from the whole to its component: components(whole) and family(part) are the two readings of it
  const components = new Map(), family = new Map();
  for (const relation of parts.graph.relations) {
    if (relation.kind !== 'component') continue;
    components.set(relation.from, [...(components.get(relation.from) || []), relation.to]);
    family.set(relation.to, [...(family.get(relation.to) || []), relation.from]);
  }
  const seqOf = (id) => { const m = /^entry:([^:|]+):/u.exec(id); if (!m) refuse('invalid-entry', 'a G9 entry id is required'); return m[1]; };
  return freeze({
    /** the one entry object (G13) for a G9 entry id */
    entry(id) {
      const seq = seqOf(id); let obj;
      try { obj = entries.fromCard({ seq }); } catch (error) { refuse('unknown-entry', `${id}: ${error.message}`); }
      if (obj.entry !== id) refuse('unknown-entry', `${id} is not the entry under seq ${seq}`);
      return obj;
    },
    /** the kanji written in an entry's spelling, each with its G5 part id, its components and the kanji it is used in */
    kanjiOf(id) {
      const m = ENTRY_ID.exec(id); if (!m) refuse('invalid-entry', 'a G9 entry id is required');
      return [...m[1]].filter((ch) => IDEOGRAPH.test(ch)).map((literal) => this.kanji(literal));
    },
    kanji(literal) {
      const part = partsGraph.queryPart('world', literal);
      return { literal, partId: part ? part.id : null, parts: part ? [...(components.get(part.id) || [])] : [], family: part ? [...(family.get(part.id) || [])] : [], provenance: part ? { ...part.provenance } : null };
    },
    provenance: { dictionary: { dataset: dictionary.index.source.name, version: dictionary.index.source.pin, licence: dictionary.index.source.licence }, parts: 'per part, from the G5 graph' },
  });
}
/** a world: a view over the shared graph at an entry; the same view for every kind */
export function openWorld(graph, { kind, entry, id } = {}) {
  if (!graph || typeof graph.entry !== 'function') refuse('invalid-graph', 'a shared graph is required');
  if (!WORLD_KINDS.includes(kind)) refuse('invalid-world-kind', `one of ${WORLD_KINDS.join(', ')}`);
  if (!filled(id)) refuse('invalid-world', 'a world carries its id');
  const object = graph.entry(entry), kanji = graph.kanjiOf(entry);
  return freeze({ id, kind, root: entry, view: { entry: object, kanji, parts: [...new Set(kanji.flatMap((k) => k.parts))], family: [...new Set(kanji.flatMap((k) => k.family))], provenance: graph.provenance } });
}
/** the one state layer: Worldcraft's projects, Passage's continuation, the quest and journey lifecycle */
export function createWorldState() { return freeze({ version: 1, projects: [], continuation: null, journeys: [] }); }
function state(raw) {
  if (!plain(raw) || raw.version !== 1 || Object.keys(raw).sort().join(',') !== STATE_KEYS.join(',') || !Array.isArray(raw.projects) || !Array.isArray(raw.journeys)) refuse('invalid-world-state', 'the state layer is {version: 1, projects, continuation, journeys}');
  return raw;
}
export function saveProject(raw, { worldId, projectId, placed, at } = {}) {
  const s = state(raw);
  if (!filled(worldId) || !filled(projectId) || !Array.isArray(placed) || !placed.every(filled) || !int0(at)) refuse('invalid-project', '{worldId, projectId, placed: part ids, at}');
  const previous = s.projects.find((p) => p.projectId === projectId);
  if (previous && previous.worldId !== worldId) refuse('project-conflict', `${projectId} belongs to ${previous.worldId}`);
  const project = { worldId, projectId, placed: [...placed], savedAt: at };
  return freeze({ ...s, projects: previous ? s.projects.map((p) => (p.projectId === projectId ? project : p)) : [...s.projects, project] });
}
export function continueAt(raw, { worldId, position, at } = {}) {
  const s = state(raw);
  if (!filled(worldId) || !plain(position) || !int0(at)) refuse('invalid-continuation', '{worldId, position, at}');
  return freeze({ ...s, continuation: { worldId, position: { ...position }, at } });
}
export function startJourney(raw, { worldId, journeyId, at } = {}) {
  const s = state(raw);
  if (!filled(worldId) || !filled(journeyId) || !int0(at)) refuse('invalid-journey', '{worldId, journeyId, at}');
  if (s.journeys.some((j) => j.journeyId === journeyId)) refuse('journey-exists', journeyId);
  return freeze({ ...s, journeys: [...s.journeys, { worldId, journeyId, step: 0, startedAt: at, status: 'open' }] });
}
export function advanceJourney(raw, { journeyId, at } = {}) {
  const s = state(raw), j = s.journeys.find((x) => x.journeyId === journeyId);
  if (!j) refuse('unknown-journey', journeyId); if (!int0(at)) refuse('invalid-journey', 'at'); if (j.status !== 'open') refuse('journey-closed', journeyId);
  return freeze({ ...s, journeys: s.journeys.map((x) => (x === j ? { ...x, step: x.step + 1, advancedAt: at } : x)) });
}
/** entering a world, directly or from another mode, writes a G4 return record for where the learner came from */
export function enterWorld(world, { from, place = null } = {}) {
  if (!plain(world) || !filled(world.id) || !filled(world.root)) refuse('invalid-world');
  if (!ENTRANCES.includes(from)) refuse('invalid-entrance', `one of ${ENTRANCES.join(', ')}`);
  const origin = from === 'direct' ? { surface: 'direct', paragraph: 0 } : { surface: from, passageId: place?.passageId ?? null, paragraph: place?.paragraph };
  const anchor = from === 'direct' ? { kind: 'token', index: 0 } : place?.anchor, scroll = from === 'direct' ? { x: 0, y: 0 } : place?.scroll;
  const focus = from === 'direct' ? { target: `world:${world.id}` } : place?.focus;
  const returnRecord = createReturnRecord({ origin, object: world.root, anchor, scroll, focus, drafts: place?.drafts ?? [], runs: place?.runs ?? [], purpose: { kind: 'world', question: null }, distinction: world.kind });
  return freeze({ world, returnRecord });
}

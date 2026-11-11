/* Where a saved word lives (the SAVE task, John on his iPhone, 2026-11-11: "where it goes should be a conscious choice";
 * "still don't know where it went? do i have ZERO lists now?"). A saved word has one place it is named by: Review (the
 * study queue: every saved word comes back as a card, as it always has) or the list he put it on. The record remembers,
 * in one optional root, when he last put a word on each list (so the chooser offers his recent lists first) and how many
 * times each word's box was opened (kept, shown nowhere yet). Pure: plain records in, plain values out; nothing here
 * touches a card or when it is due. */

export const SAVE_MEMORY_VERSION = 1;

const savePlain = (value) => !!value && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(Object.getPrototypeOf(value)) === null);
const saveCount = (value) => Number.isSafeInteger(value) && value > 0;
const saveOwn = (record, key) => Object.prototype.hasOwnProperty.call(record, key);
/** A user's list name is data, "__proto__" included: never assigned through the prototype's setter. */
const savePut = (record, key, value) => Object.defineProperty(record, key, { configurable: true, enumerable: true, writable: true, value });
const saveCopy = (record) => { const next = {}; for (const [key, value] of Object.entries(record)) savePut(next, key, value); return next; };
const saveSame = (node) => (row) => !!row && row.t === node.t && row.id === node.id;

export function emptySaveMemory() {
  return { version: SAVE_MEMORY_VERSION, listUsed: {}, opened: {} };
}

/** This build's own version, read strictly. */
export function saveMemoryReadable(value) {
  if (!savePlain(value) || value.version !== SAVE_MEMORY_VERSION) return false;
  if (Object.keys(value).some((key) => !['version', 'listUsed', 'opened'].includes(key))) return false;
  const counts = (map) => savePlain(map) && Object.entries(map).every(([key, n]) => key.length > 0 && saveCount(n));
  return counts(value.listUsed) && counts(value.opened);
}

/** The root's validator: absent, or this version read strictly, or a later version kept exactly as it is. */
export function validSaveMemory(value) {
  if (value == null) return true;
  if (!savePlain(value) || !Number.isInteger(value.version) || value.version < 1) return false;
  return value.version > SAVE_MEMORY_VERSION ? true : saveMemoryReadable(value);
}

/** The memory to read from a record: its own when readable, else an empty one (an older record, or a later version). */
export function memoryOf(record) {
  return saveMemoryReadable(record?.saveMemory) ? record.saveMemory : emptySaveMemory();
}

/** A memory this build may write: absent (a fresh one) or its own version. A later version is never written over. */
function saveWritable(memory) {
  if (memory == null) return emptySaveMemory();
  return saveMemoryReadable(memory) ? memory : null;
}

export function withListUsed(memory, name, now) {
  const base = saveWritable(memory);
  if (!base || typeof name !== 'string' || !name || !saveCount(now)) return null;
  const listUsed = saveCopy(base.listUsed);
  savePut(listUsed, name, now);
  return { ...base, listUsed };
}

export function withListRenamed(memory, from, to) {
  const base = saveWritable(memory);
  if (!base || !saveOwn(base.listUsed, from)) return base;
  const listUsed = {};
  for (const [key, value] of Object.entries(base.listUsed)) savePut(listUsed, key === from ? to : key, value);
  return { ...base, listUsed };
}

export function withListDropped(memory, name) {
  const base = saveWritable(memory);
  if (!base || !saveOwn(base.listUsed, name)) return base;
  const listUsed = {};
  for (const [key, value] of Object.entries(base.listUsed)) if (key !== name) savePut(listUsed, key, value);
  return { ...base, listUsed };
}

export function withBoxOpened(memory, key) {
  const base = saveWritable(memory);
  if (!base || typeof key !== 'string' || !key) return null;
  const opened = saveCopy(base.opened);
  savePut(opened, key, (saveOwn(opened, key) ? opened[key] : 0) + 1);
  return { ...base, opened };
}

export function timesOpened(record, key) {
  const memory = memoryOf(record);
  return saveOwn(memory.opened, key) ? memory.opened[key] : 0;
}

/** His lists, the one he put a word on last first; lists never used since this build follow in the record's order. */
export function listsByRecency(lists, memory) {
  const names = Object.keys(lists || {});
  const used = saveMemoryReadable(memory) ? memory.listUsed : {};
  const at = (name) => (saveOwn(used, name) ? used[name] : 0);
  return names.map((name, index) => ({ name, index })).sort((a, b) => (at(b.name) - at(a.name)) || (a.index - b.index))
    .map((row) => row.name);
}

export function listsHolding(node, lists) {
  return Object.entries(lists || {}).filter(([, rows]) => Array.isArray(rows) && rows.some(saveSame(node))).map(([name]) => name);
}

/** The one place a saved item is named by: the list it is on (the one used last, if an older record put it on two),
 * else Review while it is saved; null when it is saved nowhere. */
export function placeOf(node, record) {
  const on = listsHolding(node, record?.lists);
  if (on.length) return { kind: 'list', name: listsByRecency(Object.fromEntries(on.map((name) => [name, []])), memoryOf(record))[0] };
  return (record?.taken || []).some(saveSame(node)) ? { kind: 'review' } : null;
}

/** A move: the item off every list it is on, then onto the list picked (made if new); Review means on no list. */
export function moveLists(lists, row, to) {
  const next = {};
  for (const [name, rows] of Object.entries(lists || {})) savePut(next, name, Array.isArray(rows) ? rows.filter((item) => !saveSame(row)(item)) : rows);
  if (to?.kind === 'list' && to.name) {
    const was = Array.isArray(lists?.[to.name]) && saveOwn(lists, to.name) ? lists[to.name] : null;
    const at = was ? was.findIndex(saveSame(row)) : -1;
    if (at >= 0) savePut(next, to.name, was);
    else savePut(next, to.name, [...(saveOwn(next, to.name) ? next[to.name] : []), row]);
  }
  return next;
}

/** The items saved in [from, to), newest first, each with its place. */
export function savedBetween(record, from, to) {
  return (record?.taken || []).filter((item) => Number.isFinite(item?.ts) && item.ts >= from && item.ts < to)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.ts - a.item.ts) || (b.index - a.index))
    .map(({ item }) => ({ item, place: placeOf(item, record) }));
}

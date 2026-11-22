/** Exact slot-level difference between two replica snapshots.
 * A slot is one top-level state key, one local/canonical record, one top-level
 * projection key, or one entry/element of a dictionary/array-valued projection
 * key. The delta is a description of the candidate, never a second authority:
 * the storage layer rebuilds the candidate from its own validated previous
 * state and applies every existing transition check to the result. */
const RECORD_MAPS = new Set(['local', 'canonical']);
const dictionary = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// Same rule as the native bridge's whole-candidate encoding: a value JSON would
// drop or change is refused, never silently rewritten.
function guard(key, value) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' ||
      (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)))) throw new Error('Invalid native CAS JSON');
  return value;
}
// An inherited toJSON is invisible to a replacer and rewrites JSON.stringify
// output after a value was compared. Refuse the fast path while one exists.
export function jsonEncodingIntact() {
  return [Object.prototype, Array.prototype, String.prototype, Number.prototype, Boolean.prototype]
    .every(prototype => !('toJSON' in prototype));
}
// JSON rewrites anything that is not a plain record, array or scalar (a Date
// becomes a string, a Map an empty record). Such a value cannot be described
// slot by slot and kept as it is: the write goes as the whole candidate.
const NOT_PLAIN = Symbol('not-plain');
const plainRecord = value => { const proto = Object.getPrototypeOf(value); return proto === Object.prototype || proto === null; };
function requirePlain(value) {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const item of value) requirePlain(item); return; }
  if (!plainRecord(value)) throw NOT_PLAIN;
  for (const key of Object.keys(value)) requirePlain(value[key]);
}
const encode = value => { requirePlain(value); return JSON.stringify(value, guard); };
/** UTF-8 length of well-formed JSON text (JSON.stringify never emits a lone surrogate). */
export function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}
/** Structural JSON equality. Numbers compare with Object.is, so -0 and 0 differ. */
export function sameJSON(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const list = Array.isArray(a);
  if (list !== Array.isArray(b)) return false;
  if (!list && (!plainRecord(a) || !plainRecord(b))) throw NOT_PLAIN;
  if (list) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameJSON(a[i], b[i])) return false;
    return true;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) if (!Object.hasOwn(b, key) || !sameJSON(a[key], b[key])) return false;
  return true;
}
const commas = count => count > 1 ? count - 1 : 0;

/** Returns {delta, bytes}: `delta` is the JSON text of the ordered operations
 * and `bytes` the exact change in UTF-8 length of JSON.stringify(next) relative
 * to JSON.stringify(previous). Returns null when the change cannot be expressed
 * at slot granularity; the caller then sends the whole candidate. */
export function diffSnapshot(previous, next) {
  try { return difference(previous, next); }
  catch (error) { if (error === NOT_PLAIN) return null; throw error; }
}
function difference(previous, next) {
  if (!dictionary(previous) || !dictionary(next) || !jsonEncodingIntact()) return null;
  const ops = []; let bytes = 0;
  const set = (path, value, old, present) => {
    const text = encode(value);
    ops.push(`{"p":${JSON.stringify(path)},"v":${text}}`);
    bytes += utf8Length(text) - (present ? utf8Length(JSON.stringify(old)) : 0);
  };
  const remove = (path, old) => { ops.push(`{"p":${JSON.stringify(path)},"d":1}`); bytes -= utf8Length(JSON.stringify(old)); };
  const keyBytes = key => utf8Length(JSON.stringify(key)) + 1;
  // Entries of one dictionary. Key text and separating commas are counted here.
  const entries = (path, before, after) => {
    for (const key of Object.keys(after)) {
      const present = Object.hasOwn(before, key);
      if (present && sameJSON(before[key], after[key])) continue;
      set([...path, key], after[key], before[key], present);
      if (!present) bytes += keyBytes(key);
    }
    for (const key of Object.keys(before)) if (!Object.hasOwn(after, key)) { remove([...path, key], before[key]); bytes -= keyBytes(key); }
    bytes += commas(Object.keys(after).length) - commas(Object.keys(before).length);
  };
  const elements = (path, before, after) => {
    const shared = Math.min(before.length, after.length);
    for (let i = 0; i < shared; i++) if (!sameJSON(before[i], after[i])) set([...path, i], after[i], before[i], true);
    for (let i = shared; i < after.length; i++) set([...path, i], after[i], undefined, false);
    if (after.length < before.length) {
      ops.push(`{"p":${JSON.stringify(path)},"n":${after.length}}`);
      for (let i = shared; i < before.length; i++) bytes -= utf8Length(JSON.stringify(before[i]));
    }
    bytes += commas(after.length) - commas(before.length);
  };
  const projection = (before, after) => {
    for (const key of Object.keys(after)) {
      const present = Object.hasOwn(before, key), old = before[key], value = after[key];
      if (!present) { set(['projection', key], value, undefined, false); bytes += keyBytes(key); continue; }
      if (Array.isArray(old) && Array.isArray(value)) elements(['projection', key], old, value);
      else if (dictionary(old) && dictionary(value)) entries(['projection', key], old, value);
      else if (!sameJSON(old, value)) set(['projection', key], value, old, true);
    }
    for (const key of Object.keys(before)) if (!Object.hasOwn(after, key)) { remove(['projection', key], before[key]); bytes -= keyBytes(key); }
    bytes += commas(Object.keys(after).length) - commas(Object.keys(before).length);
  };
  const keys = Object.keys(next);
  // The stored state has a fixed key set. A different set is a whole-candidate write.
  if (keys.length !== Object.keys(previous).length || keys.some(key => !Object.hasOwn(previous, key))) return null;
  for (const key of keys) {
    const old = previous[key], value = next[key];
    if (Object.is(old, value)) continue; // the same object: nothing in it changed
    if (RECORD_MAPS.has(key) && dictionary(old) && dictionary(value)) entries([key], old, value);
    else if (key === 'projection' && dictionary(old) && dictionary(value)) projection(old, value);
    else if (!sameJSON(old, value)) set([key], value, old, true);
  }
  return { delta: '[' + ops.join(',') + ']', bytes, count: ops.length };
}

/** Reference application of a delta, sharing every untouched slot with `state`.
 * Storage doubles and tests use it; malformed operations throw. */
export function applyDelta(state, delta) {
  const ops = typeof delta === 'string' ? JSON.parse(delta) : delta;
  if (!dictionary(state) || !Array.isArray(ops)) throw new Error('Invalid native delta.');
  const result = { ...state }, copied = new Set();
  // Every key is data, "__proto__" included.
  const put = (holder, key, value) => Object.defineProperty(holder, key, { value, writable: true, enumerable: true, configurable: true });
  const clone = value => { const copy = Object.create(Object.getPrototypeOf(value)); for (const key of Object.keys(value)) put(copy, key, value[key]); return copy; };
  const own = (holder, key) => {
    const value = holder[key], id = holder === result ? key : 'projection\u0000' + key;
    if (!copied.has(id)) { put(holder, key, Array.isArray(value) ? value.slice() : clone(value)); copied.add(id); }
    return holder[key];
  };
  for (const op of ops) {
    const path = op?.p, write = Object.hasOwn(op ?? {}, 'v'), erase = op?.d === 1, cut = Object.hasOwn(op ?? {}, 'n');
    if (!Array.isArray(path) || path.length < 1 || path.length > 3 || [write, erase, cut].filter(Boolean).length !== 1 ||
        typeof path[0] !== 'string' || !Object.hasOwn(result, path[0])) throw new Error('Invalid native delta.');
    if (path.length === 1) {
      if (!write) throw new Error('Invalid native delta.');
      result[path[0]] = op.v; copied.add(path[0]); continue;
    }
    if (path.length === 2 && RECORD_MAPS.has(path[0])) {
      if (cut || typeof path[1] !== 'string' || !dictionary(result[path[0]])) throw new Error('Invalid native delta.');
      const map = own(result, path[0]);
      if (write) put(map, path[1], op.v);
      else { if (!Object.hasOwn(map, path[1])) throw new Error('Invalid native delta.'); delete map[path[1]]; }
      continue;
    }
    if (path[0] !== 'projection' || typeof path[1] !== 'string' || !dictionary(result.projection)) throw new Error('Invalid native delta.');
    const view = own(result, 'projection');
    if (path.length === 2) {
      if (write) put(view, path[1], op.v);
      else if (erase) { if (!Object.hasOwn(view, path[1])) throw new Error('Invalid native delta.'); delete view[path[1]]; }
      else {
        if (!Array.isArray(view[path[1]]) || !Number.isSafeInteger(op.n) || op.n < 0 || op.n >= view[path[1]].length) throw new Error('Invalid native delta.');
        own(view, path[1]).length = op.n;
      }
      copied.add('projection\u0000' + path[1]); continue;
    }
    if (cut || !Object.hasOwn(view, path[1])) throw new Error('Invalid native delta.');
    const holder = view[path[1]];
    if (Array.isArray(holder)) {
      if (!write || !Number.isSafeInteger(path[2]) || path[2] < 0 || path[2] > holder.length) throw new Error('Invalid native delta.');
      own(view, path[1])[path[2]] = op.v;
    } else if (dictionary(holder) && typeof path[2] === 'string') {
      const map = own(view, path[1]);
      if (write) put(map, path[2], op.v);
      else { if (!Object.hasOwn(map, path[2])) throw new Error('Invalid native delta.'); delete map[path[2]]; }
    } else throw new Error('Invalid native delta.');
  }
  return result;
}

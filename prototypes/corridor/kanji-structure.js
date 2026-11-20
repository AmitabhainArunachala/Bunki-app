/* Pure KanjiVG structure projection. No DOM, network, learner state or scheduler.
 *
 * createModel({kanji, strokes, grouping?}) accepts the runtime kanji/stroke MAPS
 * and the optional generated kanji-structure.json document.
 *   inspect(literal) -> immutable reference, listedMembership, grouping, occurrences, tree
 *   occurrence(literal, occurrenceId) -> immutable occurrence or null
 *   project(literal, occurrenceId) -> original ordered pathIndices/paths or null
 *
 * Missing grouping is explicitly absent. Supplied invalid grouping or any exact
 * stroke-path mismatch throws; never borrow another glyph's geometry. "available"
 * means schema/tree and runtime path parity passed, not a fresh XML/source audit.
 * The offline extractor/check binds each projection to retained upstream bytes.
 * Unlabelled groups, nesting, split parts and repeated labels are kept separately.
 * Source attributes are evidence only: no semantic or phonetic role is assigned.
 */
/* global module:readonly -- Optional CommonJS export, guarded for browsers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BunkiKanjiStructure = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COMMIT = '61e39cfc29724132a6f8823b166296932985a0ff';
  const REPOSITORY = 'https://github.com/KanjiVG/kanjivg';
  const NAMESPACE = 'http://kanjivg.tagaini.net';
  const ELEMENT = `{${NAMESPACE}}element`;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const fail = message => { throw new Error(`Kanji structure: ${message}`); };
  function requireThat(ok, message) { if (!ok) fail(message); }
  function literalKey(value) {
    requireThat(typeof value === 'string' && [...value].length === 1 &&
      !/[\uD800-\uDFFF]/u.test(value), 'literal must be one Unicode scalar');
    return value;
  }
  function strings(value, name) {
    requireThat(Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0),
      `${name} must be an array of nonempty strings`);
    return value.slice();
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function attributes(value, name) {
    requireThat(object(value) && Object.values(value).every(item => typeof item === 'string'),
      `${name} attributes must retain source strings`);
    return Object.fromEntries(Object.entries(value));
  }
  function indices(value, count, name) {
    requireThat(Array.isArray(value) && value.every((n, i) => Number.isInteger(n) &&
      n >= 0 && n < count && (i === 0 || value[i - 1] < n)), `${name} indices invalid`);
    return value.slice();
  }
  function occurrenceId(literal, sourceSha256, groupPath) {
    return JSON.stringify(['kanjivg-occurrence', COMMIT, literal, sourceSha256, groupPath]);
  }
  function compile(literal, record, runtimePaths) {
    literalKey(literal);
    const hex = literal.codePointAt(0).toString(16).padStart(5, '0');
    requireThat(object(record) && object(record.source), `${literal} source missing`);
    const source = record.source;
    requireThat(source.path === `kanji/${hex}.svg` &&
      source.url === `https://raw.githubusercontent.com/KanjiVG/kanjivg/${COMMIT}/${source.path}` &&
      /^[0-9a-f]{64}$/u.test(source.sha256 || '') && Number.isSafeInteger(source.bytes) &&
      source.bytes > 0, `${literal} source identity invalid`);
    requireThat(record.viewBox === '0 0 109 109', `${literal} unsupported viewBox`);
    const paths = strings(record.paths, `${literal} source paths`);
    requireThat(paths.length > 0 && runtimePaths && paths.length === runtimePaths.length,
      `${literal} stroke count differs (source ${paths.length}, runtime ${runtimePaths?.length ?? 'absent'})`);
    paths.forEach((path, index) => requireThat(path === runtimePaths[index],
      `${literal} stroke ${index} differs from runtime`));
    requireThat(Array.isArray(record.groups) && record.groups.length > 0,
      `${literal} groups missing`);
    const byPath = new Map();
    const sourceIds = new Set();
    const directOwners = new Map();
    const groups = record.groups.map((group, index) => {
      requireThat(object(group) && /^\$(?:\/(?:0|[1-9][0-9]*))*$/u.test(group.path || '') &&
        !byPath.has(group.path), `${literal} duplicate/invalid group path`);
      const attrs = attributes(group.attributes, `${literal}/${group.path}`);
      requireThat(!own(attrs, 'transform'), `${literal}/${group.path} transformed geometry unsupported`);
      requireThat(typeof attrs.id === 'string' && attrs.id.length > 0 && !sourceIds.has(attrs.id),
        `${literal}/${group.path} duplicate/missing source id`);
      sourceIds.add(attrs.id);
      const element = own(attrs, ELEMENT) ? attrs[ELEMENT] : null;
      requireThat(group.element === element && (element === null || element.length > 0),
        `${literal}/${group.path} source label differs`);
      requireThat((index === 0 && group.path === '$' && group.parentPath === null) ||
        (index > 0 && typeof group.parentPath === 'string' && byPath.has(group.parentPath) &&
          group.path.slice(0, group.path.lastIndexOf('/')) === group.parentPath),
      `${literal}/${group.path} ancestry invalid`);
      const children = strings(group.childPaths, `${literal}/${group.path} child paths`);
      requireThat(new Set(children).size === children.length, `${literal}/${group.path} duplicate child`);
      const direct = indices(group.directStrokeIndices, paths.length, `${literal}/${group.path} direct`);
      const all = indices(group.strokeIndices, paths.length, `${literal}/${group.path} descendant`);
      direct.forEach(stroke => {
        requireThat(!directOwners.has(stroke), `${literal} stroke ${stroke} has multiple direct owners`);
        directOwners.set(stroke, group.path);
      });
      const result = {
        path: group.path, parentPath: group.parentPath, childPaths: children,
        sourceGroupId: attrs.id, element, sourceAttributes: attrs,
        directStrokeIndices: direct, strokeIndices: all,
      };
      byPath.set(group.path, result);
      return result;
    });
    requireThat(groups[0].sourceGroupId === `kvg:StrokePaths_${hex}`,
      `${literal} stroke wrapper differs`);
    const preorder = [];
    function walk(path) {
      const group = byPath.get(path);
      requireThat(group && !preorder.includes(path), `${literal} cyclic/missing child ${path}`);
      preorder.push(path);
      const children = groups.filter(item => item.parentPath === path);
      requireThat(same(group.childPaths, children.map(item => item.path)),
        `${literal}/${path} child order/ancestry differs`);
      requireThat(children.every((item, i) => i === 0 ||
        Number(children[i - 1].path.split('/').at(-1)) < Number(item.path.split('/').at(-1))),
      `${literal}/${path} source child order differs`);
      const descendants = group.directStrokeIndices.slice();
      children.forEach(child => descendants.push(...walk(child.path)));
      descendants.sort((a, b) => a - b);
      requireThat(same(descendants, group.strokeIndices), `${literal}/${path} stroke ownership differs`);
      return descendants;
    }
    const all = walk('$');
    requireThat(same(preorder, groups.map(group => group.path)), `${literal} group traversal differs`);
    requireThat(same(all, paths.map((_, index) => index)), `${literal} incomplete stroke ownership`);
    requireThat(groups.some(group => group.sourceGroupId === `kvg:${hex}` && group.element === literal),
      `${literal} source glyph root missing`);
    const occurrences = groups.map(group => ({
      id: occurrenceId(literal, source.sha256, group.path),
      groupPath: group.path,
      parentId: group.parentPath === null ? null : occurrenceId(literal, source.sha256, group.parentPath),
      childIds: group.childPaths.map(path => occurrenceId(literal, source.sha256, path)),
      reference: group.element === null ? null : {
        type: group.sourceGroupId === `kvg:${hex}` ? 'kanji' : 'part', id: group.element,
      },
      sourceGroupId: group.sourceGroupId, sourceAttributes: group.sourceAttributes,
      directStrokeIndices: group.directStrokeIndices, strokeIndices: group.strokeIndices,
    }));
    const byId = new Map(occurrences.map(item => [item.id, item]));
    function branch(id) {
      const item = byId.get(id);
      return { ...item, children: item.childIds.map(branch) };
    }
    return freeze({
      grouping: {
        status: 'available', strokeParity: 'exact', repository: REPOSITORY, commit: COMMIT,
        license: 'CC BY-SA 3.0',
        source: { path: source.path, url: source.url, sha256: source.sha256, bytes: source.bytes },
        viewBox: record.viewBox,
        rootOccurrenceId: occurrences[0].id,
      },
      paths, occurrences, tree: branch(occurrences[0].id),
    });
  }
  function createModel({ kanji = {}, strokes = {}, grouping = null } = {}) {
    requireThat(object(kanji) && object(strokes), 'kanji and strokes must be maps');
    const memberships = new Map(Object.entries(kanji).map(([literal, entry]) => [
      literal, strings(entry?.parts ?? [], `${literal} listed parts`),
    ]));
    const strokeMap = new Map(Object.entries(strokes).map(([literal, paths]) => [
      literal, strings(paths, `${literal} runtime paths`),
    ]));
    const compiled = new Map();
    if (grouping !== null) {
      requireThat(object(grouping) && grouping.schemaVersion === 1 && grouping.source?.name === 'KanjiVG' &&
        grouping.source.repository === REPOSITORY && grouping.source.commit === COMMIT &&
        grouping.source.license === 'CC BY-SA 3.0' && object(grouping.characters),
      'grouping schema/source differs');
      Object.entries(grouping.characters).forEach(([literal, record]) => {
        compiled.set(literal, compile(literal, record, strokeMap.get(literal)));
      });
    }
    function inspect(literal) {
      literalKey(literal);
      const entry = compiled.get(literal);
      return freeze({
        reference: { type: 'kanji', id: literal },
        listedMembership: (memberships.get(literal) || []).map(id => ({
          relation: 'listed-component', reference: { type: 'part', id },
          source: 'kanji.json:parts', occurrenceId: null,
        })),
        strokeCount: strokeMap.get(literal)?.length ?? null,
        grouping: entry?.grouping || { status: 'absent', strokeParity: null, rootOccurrenceId: null },
        occurrences: entry?.occurrences || [],
        tree: entry?.tree || null,
      });
    }
    function occurrence(literal, id) {
      literalKey(literal);
      return compiled.get(literal)?.occurrences.find(item => item.id === id) || null;
    }
    function project(literal, id) {
      const selected = occurrence(literal, id);
      if (!selected) return null;
      const entry = compiled.get(literal);
      return freeze({
        reference: { type: 'kanji', id: literal }, occurrenceId: id,
        viewBox: entry.grouping.viewBox, source: { ...entry.grouping.source },
        pathIndices: selected.strokeIndices.slice(),
        paths: selected.strokeIndices.map(index => entry.paths[index]),
      });
    }
    return Object.freeze({ inspect, occurrence, project });
  }
  return Object.freeze({ createModel, occurrenceId, KANJIVG_COMMIT: COMMIT });
});

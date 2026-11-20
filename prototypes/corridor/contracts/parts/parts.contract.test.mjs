// Immutable G5 structural/provenance contract. No Japanese semantic or UI claims.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DATA = new URL('../../data/parts-graph/', import.meta.url);
const ROOT = new URL('../../../../', import.meta.url);
const INPUT_SHA = '768cb830e8fc4106ad1ae5b7dc78148ef73e17dc7e820f0dfb07aed1e42b7c12';
const VERSION = '70a0b7ae0c18ceb5cb358274b029cce0234a43bc';
const ARCHIVE_SHA = 'd6a17d77902b863d7524e24d11c44ae628c5d5ba4f09cb3af90c1190bf78bcca';
const COUNTS = { joyo: 2136, kanken_rows: 6787, upper_unique: 3806, upper_source_gaps: 371 };
const GRADES = ['準1級', '1級', '1/準1級'];
const VIEWS = ['course', 'parts-search', 'world'];
const KINDS = ['component', 'radical', 'phonetic', 'semantic'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const owns = (object, key) => Object.hasOwn(object, key);

function object(value, label) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label}: object required`);
}

function nonempty(value, label) {
  assert.ok(typeof value === 'string' && value.trim().length > 0, `${label}: nonempty string required`);
}

function scalar(value, label) {
  assert.equal(typeof value, 'string', `${label}: string required`);
  assert.equal([...value].length, 1, `${label}: exactly one Unicode scalar required`);
  const code = value.codePointAt(0);
  assert.ok(code < 0xd800 || code > 0xdfff, `${label}: surrogate is not a Unicode scalar`);
}

function provenance(value, label) {
  object(value, label);
  for (const key of ['dataset', 'version', 'licence']) nonempty(value[key], `${label}.${key}`);
}

// JSON.parse alone silently discards duplicate mapping/alias keys. Validate JSON
// syntax first, then walk its tokens to reject duplicate keys in every object.
function parseJSON(bytes, label) {
  const source = bytes.toString('utf8');
  const parsed = JSON.parse(source);
  const tokens = source.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]|[^\s{}\[\],:]+/gu) ?? [];
  let cursor = 0;
  function value() {
    const token = tokens[cursor++];
    if (token === '{') {
      const keys = new Set();
      if (tokens[cursor] !== '}') {
        for (;;) {
          const key = JSON.parse(tokens[cursor++]);
          assert.ok(!keys.has(key), `${label}: duplicate JSON key ${key}`);
          keys.add(key);
          assert.equal(tokens[cursor++], ':');
          value();
          if (tokens[cursor] !== ',') break;
          cursor++;
        }
      }
      assert.equal(tokens[cursor++], '}');
    } else if (token === '[') {
      if (tokens[cursor] !== ']') {
        for (;;) {
          value();
          if (tokens[cursor] !== ',') break;
          cursor++;
        }
      }
      assert.equal(tokens[cursor++], ']');
    }
  }
  value();
  assert.equal(cursor, tokens.length, `${label}: complete JSON value required`);
  return parsed;
}

function sourceIDs(rows, count, label) {
  assert.ok(Array.isArray(rows), `${label}: array required`);
  assert.equal(rows.length, count, `${label}: fixed source count`);
  const ids = new Set();
  for (const row of rows) {
    object(row, label);
    nonempty(row.id, `${label}.id`);
    assert.ok(!ids.has(row.id), `${label}: duplicate source ID ${row.id}`);
    ids.add(row.id);
  }
  return ids;
}

let inputsCache;
function inputs() {
  if (inputsCache) return inputsCache;
  const bytes = readFileSync(new URL('g5-inputs.json', DATA));
  assert.equal(sha256(bytes), INPUT_SHA, 'g5-inputs.json trust root');
  // Only after authenticating the manifest may its pins be consulted.
  const manifest = parseJSON(bytes, 'g5-inputs.json');
  assert.equal(manifest.schema, 'bunki.g5.inputs/1');
  assert.deepEqual(manifest.counts, COUNTS);
  assert.equal(manifest.upstream.dataset, 'KanjiVG');
  assert.equal(manifest.upstream.version, VERSION);
  assert.equal(manifest.upstream.licence, 'CC BY-SA 3.0');
  assert.equal(manifest.upstream.bytes, 24094874);
  assert.equal(manifest.upstream.sha256, ARCHIVE_SHA);
  object(manifest.pins, 'input pins');
  const pinned = new Map();
  for (const [name, digest] of Object.entries(manifest.pins)) {
    assert.match(name, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'pin must name a local file');
    assert.match(digest, /^[a-f0-9]{64}$/);
    const content = readFileSync(new URL(name, DATA));
    assert.equal(sha256(content), digest, `pinned input ${name}`);
    pinned.set(name, content);
  }
  const coverage = parseJSON(pinned.get('g5-coverage.json'), 'coverage');
  const bricks = parseJSON(pinned.get('bricks.json'), 'bricks');
  const worlds = parseJSON(pinned.get('worlds-300.json'), 'worlds');
  assert.equal(coverage.schema, 'bunki.g5.coverage/1');
  assert.deepEqual(coverage.counts, COUNTS);
  assert.equal(typeof coverage.joyo, 'string');
  const joyo = [...coverage.joyo];
  assert.equal(joyo.length, 2136);
  assert.equal(new Set(joyo).size, 2136);
  for (const literal of joyo) scalar(literal, 'jōyō literal');
  object(coverage.upper, 'upper grades');
  assert.deepEqual(Object.keys(coverage.upper).sort(), [...GRADES].sort());
  const upper = new Set();
  for (const grade of GRADES) {
    nonempty(coverage.upper[grade], grade);
    const literals = [...coverage.upper[grade]];
    assert.equal(new Set(literals).size, literals.length, `${grade}: unique glyphs`);
    for (const literal of literals) {
      scalar(literal, grade);
      nonempty(literal, grade);
      upper.add(literal);
    }
  }
  assert.equal(upper.size, 3806, 'full upper-grade corpus, not the 288 runtime glyphs');
  assert.ok(Array.isArray(coverage.source_gaps));
  assert.equal(coverage.source_gaps.length, 371, 'blank source rows remain separately declared');
  const blankRows = new Set();
  for (const row of coverage.source_gaps) {
    object(row, 'blank source row');
    nonempty(row.entry_id, 'blank row entry_id');
    assert.ok(!blankRows.has(row.entry_id), 'duplicate blank source row');
    blankRows.add(row.entry_id);
    assert.ok(GRADES.includes(row.level), 'blank row upper grade');
    nonempty(row.reason, 'blank row reason');
  }
  provenance(coverage.sources.joyo, 'jōyō source');
  provenance(coverage.sources.upper, 'upper source');
  const sources = {
    bricks: sourceIDs(bricks.components, 263, 'bricks'),
    worlds: sourceIDs(worlds.worlds, 300, 'worlds'),
  };
  object(bricks.canonical_aliases, 'canonical aliases');
  assert.equal(bricks.canonical_aliases['氵'], '水');
  inputsCache = { coverage, bricks, sources, required: new Set([...joyo, ...upper]) };
  return inputsCache;
}

// Constant stdlib-only reader. It authenticates the entire read-only archive
// before constructing ZipFile; XML parsing cannot retrieve external resources.
// No extraction, generated files, shell interpolation, or network access.
const READ_ARCHIVE = String.raw`
import hashlib, io, json, os, re, stat, sys, zipfile
import xml.etree.ElementTree as ET

limit = 32 * 1024 * 1024
flags = os.O_RDONLY | os.O_NONBLOCK | getattr(os, 'O_NOFOLLOW', 0)
with os.fdopen(os.open(sys.argv[1], flags), 'rb') as archive:
    info = os.fstat(archive.fileno())
    if not stat.S_ISREG(info.st_mode):
        raise ValueError('upstream archive must be a regular file')
    if info.st_size > limit or info.st_size != 24094874:
        raise ValueError('upstream archive byte count mismatch')
    raw = archive.read(limit + 1)
if len(raw) != 24094874 or hashlib.sha256(raw).hexdigest() != 'd6a17d77902b863d7524e24d11c44ae628c5d5ba4f09cb3af90c1190bf78bcca':
    raise ValueError('upstream archive SHA256 mismatch')

prefix = 'kanjivg-70a0b7ae0c18ceb5cb358274b029cce0234a43bc/kanji/'
result = {}
with zipfile.ZipFile(io.BytesIO(raw), 'r') as z:
    members = z.infolist()
    if len(members) > 20000 or sum(m.file_size for m in members) > 128 * 1024 * 1024:
        raise ValueError('upstream member budget exceeded')
    for member in members:
        if member.file_size > 1024 * 1024:
            raise ValueError('upstream member too large')
        if not member.filename.startswith(prefix):
            continue
        name = member.filename[len(prefix):]
        if not re.fullmatch(r'[0-9a-f]{5,6}\.svg', name):
            continue
        code = int(name[:-4], 16)
        if code > 0x10ffff or 0xd800 <= code <= 0xdfff or name != format(code, '05x') + '.svg':
            continue
        if name in result:
            raise ValueError('duplicate canonical SVG')
        svg = z.read(member)
        if len(svg) != member.file_size:
            raise ValueError('SVG byte count mismatch')
        xml = ET.fromstring(svg)
        result[name] = {
            'paths': [p.attrib['d'] for p in xml.findall('.//{http://www.w3.org/2000/svg}path')],
            'svg_sha256': hashlib.sha256(svg).hexdigest(),
        }
if not result:
    raise ValueError('no canonical SVG members')
json.dump(result, sys.stdout, ensure_ascii=True, separators=(',', ':'))
`;

let upstreamCache;
function upstream() {
  if (upstreamCache) return upstreamCache;
  inputs();
  const path = process.env.BUNKI_G5_UPSTREAM_ZIP
    ?? fileURLToPath(new URL('../../data/kanjivg/upstream.zip', import.meta.url));
  const output = execFileSync('python3', ['-I', '-B', '-c', READ_ARCHIVE, path], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  upstreamCache = new Map(Object.entries(JSON.parse(output)));
  return upstreamCache;
}

const svgName = literal => `${literal.codePointAt(0).toString(16).padStart(5, '0')}.svg`;

let dataCache;
function data() {
  if (dataCache) return dataCache;
  inputs();
  const graph = parseJSON(readFileSync(new URL('graph.json', DATA)), 'graph.json');
  const unmapped = parseJSON(readFileSync(new URL('unmapped.json', DATA)), 'unmapped.json');
  object(graph, 'graph');
  assert.equal(graph.schemaVersion, 1, 'graph schemaVersion');
  assert.ok(Array.isArray(graph.parts), 'graph.parts array');
  assert.ok(Array.isArray(graph.relations), 'graph.relations array');
  assert.ok(Array.isArray(unmapped), 'unmapped array');
  object(graph.aliases, 'graph.aliases');
  object(graph.mappings, 'graph.mappings');
  const byId = new Map();
  const byLiteral = new Map();
  for (const part of graph.parts) {
    object(part, 'part');
    nonempty(part.id, 'part.id');
    scalar(part.literal, `part ${part.id} literal`);
    assert.ok(!byId.has(part.id), `duplicate part ID ${part.id}`);
    assert.ok(!byLiteral.has(part.literal), `duplicate literal ${part.literal}`);
    byId.set(part.id, part);
    byLiteral.set(part.literal, part);
  }
  dataCache = { graph, unmapped, byId, byLiteral };
  return dataCache;
}

async function exerciseImplementation(check) {
  const { graph, unmapped } = data();
  const input = structuredClone({ graph, unmapped });
  const before = structuredClone(input);
  const { createPartsGraph } = await import(new URL('./parts.mjs', import.meta.url));
  assert.equal(typeof createPartsGraph, 'function', 'createPartsGraph export required');
  try {
    const api = createPartsGraph(input);
    object(api, 'parts graph API');
    assert.equal(typeof api.queryPart, 'function', 'queryPart API');
    assert.equal(typeof api.relate, 'function', 'relate API');
    await check(api, createPartsGraph);
  } finally {
    assert.deepEqual(input, before, 'factory and API must not mutate graph or unmapped input');
  }
}

function validRelation(relation, byId) {
  object(relation, 'stored relation');
  assert.ok(KINDS.includes(relation.kind), 'stored relation kind');
  assert.ok(byId.has(relation.from), 'stored relation from endpoint');
  assert.ok(byId.has(relation.to), 'stored relation to endpoint');
  provenance(relation.provenance, 'stored relation provenance');
}

test('Bunki G5 immutable parts graph contract', async t => {
  // Keep all data and implementation loads inside subtests so missing artifacts
  // produce ordinary test failures and all six checks remain registered.
  await t.test('input pins: authenticated manifest and every pinned source', () => {
    inputs();
  });

  await t.test('1. all 2136 jōyō and 3806 upper-grade glyphs have provenance and stroke/gap evidence', () => {
    const { required } = inputs();
    const { graph, byLiteral } = data();
    const retained = upstream();
    for (const literal of required) assert.ok(byLiteral.has(literal), `coverage missing ${literal}`);
    for (const part of graph.parts) {
      provenance(part.provenance, `${part.id} provenance`);
      const hasPaths = owns(part, 'paths');
      const hasGap = owns(part, 'gap');
      assert.notEqual(hasPaths, hasGap, `${part.id}: exactly one of paths or gap`);
      const original = retained.get(svgName(part.literal));
      if (hasPaths) {
        assert.ok(original, `${part.id}: geometry needs a canonical upstream SVG`);
        assert.ok(Array.isArray(part.paths) && part.paths.length > 0, `${part.id}: stroke paths required`);
        for (const path of part.paths) nonempty(path, `${part.id} stroke path`);
        assert.match(part.svg_sha256, /^[a-f0-9]{64}$/, `${part.id}: raw SVG SHA256 required`);
        assert.equal(part.provenance.dataset, 'KanjiVG');
        assert.equal(part.provenance.version, VERSION);
        assert.equal(part.provenance.licence, 'CC BY-SA 3.0');
      } else {
        object(part.gap, `${part.id} gap`);
        assert.equal(part.gap.code, 'missing-upstream');
        nonempty(part.gap.reason, `${part.id} gap reason`);
        assert.ok(!original, `${part.id}: canonical SVG exists; unfinished work is not an upstream gap`);
        assert.ok(!owns(part, 'svg_sha256'), `${part.id}: gap cannot claim retained SVG bytes`);
      }
    }
  });

  await t.test('2. course, parts-search and world share every canonical ID and alias', async () => {
    const { graph, byId, byLiteral } = data();
    for (const [alias, target] of Object.entries(graph.aliases)) {
      scalar(alias, 'alias literal');
      assert.ok(byId.has(target), `alias ${alias}: existing canonical target required`);
    }
    for (const [alias, literal] of Object.entries(inputs().bricks.canonical_aliases)) {
      const canonical = byLiteral.get(literal);
      if (canonical) assert.equal(graph.aliases[alias], canonical.id, `canonical alias ${alias} → ${literal}`);
    }
    await exerciseImplementation(api => {
      const queries = [...byId.keys()].map(id => [id, id]).concat(Object.entries(graph.aliases));
      let unknown = 'g5:unknown-part';
      while (byId.has(unknown) || owns(graph.aliases, unknown)) unknown += '?';
      for (const view of VIEWS) {
        const seen = new Set();
        for (const [query, expected] of queries) {
          const found = api.queryPart(view, query);
          object(found, `${view}/${query}: existing record required`);
          assert.equal(found.id, expected, `${view}/${query}: canonical identity`);
          assert.deepEqual(found, byId.get(expected), `${view}/${query}: existing record contents`);
          seen.add(found.id);
        }
        assert.equal(seen.size, byId.size, `${view}: all distinct parts must be queryable`);
        assert.ok(seen.size > 1, 'constant query answers cannot satisfy the contract');
        assert.equal(api.queryPart(view, unknown), null, `${view}: unknown ID must return null`);
      }
      assert.throws(() => api.queryPart('g5:unknown-view', graph.parts[0].id), 'unknown view must throw');
      assert.throws(() => api.queryPart('g5:unknown-view', unknown), 'unknown view must throw even for absent ID');
    });
  });

  await t.test('3. all 263 bricks and 300 worlds map once or have a reasoned unmapped row', () => {
    const { graph, unmapped, byId } = data();
    const { sources } = inputs();
    assert.deepEqual(Object.keys(graph.mappings).sort(), ['bricks', 'worlds']);
    const accounted = { bricks: new Set(), worlds: new Set() };
    for (const source of Object.keys(sources)) {
      object(graph.mappings[source], `mappings.${source}`);
      for (const [sourceId, target] of Object.entries(graph.mappings[source])) {
        assert.ok(sources[source].has(sourceId), `${source}: unknown source ID ${sourceId}`);
        assert.ok(byId.has(target), `${source}/${sourceId}: unknown canonical part ${target}`);
        accounted[source].add(sourceId);
      }
    }
    for (const row of unmapped) {
      object(row, 'unmapped row');
      assert.ok(owns(sources, row.source), 'unmapped source must be bricks or worlds');
      nonempty(row.source_id, 'unmapped source_id');
      nonempty(row.reason, `${row.source}/${row.source_id} unmapped reason`);
      assert.ok(sources[row.source].has(row.source_id), 'unknown unmapped source ID');
      assert.ok(!accounted[row.source].has(row.source_id), 'duplicate unmapped row or mapped/unmapped overlap');
      accounted[row.source].add(row.source_id);
    }
    for (const source of Object.keys(sources)) {
      assert.deepEqual(accounted[source], sources[source], `${source}: exact disjoint source coverage required`);
    }
  });

  await t.test('4. component, radical, phonetic and semantic claims stay distinct and require provenance', async () => {
    const { graph, unmapped, byId } = data();
    for (const relation of graph.relations) validRelation(relation, byId);
    await exerciseImplementation((api, createPartsGraph) => {
      const ids = [...byId.keys()];
      // Explicitly synthetic fixture provenance: these probes make no Japanese
      // linguistic claim about the arbitrarily selected endpoint records.
      const synthetic = { dataset: 'Bunki G5 synthetic API fixture; no linguistic claim', version: '1', licence: 'CC0-1.0' };
      const probe = { from: ids[0], to: ids.at(-1), kind: 'component', provenance: synthetic };
      function accepts(input) {
        const before = structuredClone(input);
        try {
          const relation = api.relate(input);
          object(relation, 'relate result');
          for (const key of ['kind', 'from', 'to']) assert.equal(relation[key], before[key], `relate preserves ${key}`);
          assert.deepEqual(relation.provenance, before.provenance, 'relate preserves explicit provenance');
        } finally {
          assert.deepEqual(input, before, 'relate must not mutate its input');
        }
      }
      function refuses(input) {
        const before = structuredClone(input);
        try {
          assert.throws(() => api.relate(input), 'invalid or unsourced relation must throw');
        } finally {
          assert.deepEqual(input, before, 'rejected relation must not be mutated');
        }
      }
      for (const [index, kind] of KINDS.entries()) {
        accepts({ ...probe, kind, from: ids[index], to: ids.at(-index - 1), provenance: { ...synthetic } });
        const unsourced = { from: probe.from, to: probe.to, kind };
        refuses(unsourced);
        for (const missing of ['dataset', 'version', 'licence']) {
          const partial = { ...synthetic };
          delete partial[missing];
          refuses({ ...probe, kind, provenance: partial });
          for (const empty of ['', ' \t ', null, 42, false]) {
            refuses({ ...probe, kind, provenance: { ...synthetic, [missing]: empty } });
          }
        }
        for (const absent of [undefined, null, {}, []]) refuses({ ...probe, kind, provenance: absent });
      }
      for (const kind of ['derived', 'Radical', '', null, undefined]) refuses({ ...probe, kind });
      let unknown = 'g5:unknown-endpoint';
      while (byId.has(unknown) || owns(graph.aliases, unknown)) unknown += '?';
      for (const endpoint of ['from', 'to']) {
        for (const invalid of [unknown, '', null, undefined]) refuses({ ...probe, [endpoint]: invalid });
      }

      // Constructor validation must reject stored bad claims, not merely guard
      // calls to relate(). Clone the graph so neither fixtures nor inputs change.
      const invalidStored = KINDS.map(kind => ({ from: probe.from, to: probe.to, kind }));
      invalidStored.push(
        { ...probe, provenance: { dataset: synthetic.dataset, version: '1' } },
        { ...probe, kind: 'derived' },
        { ...probe, from: unknown },
        { ...probe, to: unknown },
      );
      for (const relation of invalidStored) {
        const broken = structuredClone(graph);
        broken.relations.push(structuredClone(relation));
        const input = { graph: broken, unmapped: structuredClone(unmapped) };
        const before = structuredClone(input);
        try {
          assert.throws(() => createPartsGraph(input), 'constructor must reject invalid stored relations');
        } finally {
          assert.deepEqual(input, before, 'rejected graph must not be mutated');
        }
      }
    });
  });

  await t.test('5. every geometry retains exact ordered upstream paths, raw SVG hash and licence', () => {
    const { graph } = data();
    const retained = upstream();
    const licence = readFileSync(new URL('packages/seed/licenses/KanjiVG-COPYING.txt', ROOT), 'utf8');
    assert.match(licence, /Creative\s+Commons/i);
    assert.match(licence, /\b3\.0\b/);
    assert.match(licence, /Share[\s-]*Alike/i);
    // Includes extra parts outside the required coverage, without normalizing,
    // sorting, trimming, or approximating the retained path strings.
    for (const part of graph.parts) {
      const original = retained.get(svgName(part.literal));
      if (owns(part, 'paths')) {
        assert.ok(original, `${part.id}: no canonical upstream SVG for provided geometry`);
        assert.deepEqual(part.paths, original.paths, `${part.id}: exact path data and order`);
        assert.equal(part.svg_sha256, original.svg_sha256, `${part.id}: retained raw SVG bytes`);
      } else {
        assert.ok(!original, `${part.id}: present upstream geometry cannot be silently gapped`);
      }
    }
  });
});

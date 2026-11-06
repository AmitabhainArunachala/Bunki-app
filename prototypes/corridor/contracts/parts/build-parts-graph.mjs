// Rebuild the G5 parts graph from the pinned Bunki inputs and the KanjiVG
// archive. This script is the only writer of data/parts-graph/graph.json and
// data/parts-graph/unmapped.json; the contract test only reads them.
//
// Usage:
//   BUNKI_G5_UPSTREAM_ZIP=/path/to/upstream.zip \
//     node prototypes/corridor/contracts/parts/build-parts-graph.mjs
//
// The archive itself is never committed. Its bytes, SHA256, version and
// licence are pinned in data/parts-graph/g5-inputs.json.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA = new URL('../../data/parts-graph/', import.meta.url);
const VERSION = '70a0b7ae0c18ceb5cb358274b029cce0234a43bc';
const ARCHIVE_SHA = 'd6a17d77902b863d7524e24d11c44ae628c5d5ba4f09cb3af90c1190bf78bcca';
const ARCHIVE_BYTES = 24094874;
const LICENCE = 'CC BY-SA 3.0';

const provenance = Object.freeze({ dataset: 'KanjiVG', version: VERSION, licence: LICENCE });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const scalar = value => typeof value === 'string' && [...value].length === 1;
const svgName = literal => `${literal.codePointAt(0).toString(16).padStart(5, '0')}.svg`;

// Constant stdlib-only reader, modelled on the contract's reader. It returns
// every canonical raw path `d` string, the raw SVG SHA256 and the kvg:element
// attributes in document order. It never extracts to disk.
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
NS = '{http://www.w3.org/2000/svg}'
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
        paths = [p.attrib['d'] for p in xml.findall('.//' + NS + 'path')]
        elements = []
        for group in xml.findall('.//' + NS + 'g'):
            element = None
            for key, value in group.attrib.items():
                if key.endswith('}element'):
                    element = value
                    break
            if element is not None:
                elements.append(element)
        result[name] = [paths, hashlib.sha256(svg).hexdigest(), elements]
if not result:
    raise ValueError('no canonical SVG members')
json.dump(result, sys.stdout, ensure_ascii=True, separators=(',', ':'))
`;

function readPinned(name) {
  const bytes = readFileSync(new URL(name, DATA));
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}

function main() {
  const archivePath = process.env.BUNKI_G5_UPSTREAM_ZIP
    ?? fileURLToPath(new URL('../../data/kanjivg/upstream.zip', import.meta.url));

  const coverage = readPinned('g5-coverage.json').value;
  const bricks = readPinned('bricks.json').value;
  const worlds = readPinned('worlds-300.json').value;

  const output = execFileSync('python3', ['-I', '-B', '-c', READ_ARCHIVE, archivePath], {
    encoding: 'utf8', timeout: 120000, maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const upstream = new Map(Object.entries(JSON.parse(output)));
  const byLiteral = new Map();
  for (const [name, record] of upstream) {
    byLiteral.set(String.fromCodePoint(parseInt(name.slice(0, -4), 16)), record);
  }

  const required = new Set();
  for (const literal of [...coverage.joyo]) required.add(literal);
  for (const grade of Object.values(coverage.upper)) {
    for (const literal of [...grade]) required.add(literal);
  }

  // Source identities outside the grade corpus still become parts when the
  // upstream archive has geometry for them. This lets every brick, world and
  // canonical alias resolve without inventing glyphs.
  const extras = new Set();
  for (const brick of bricks.components) {
    if (scalar(brick.id) && byLiteral.has(brick.id)) extras.add(brick.id);
  }
  for (const world of worlds.worlds) {
    if (scalar(world.id) && byLiteral.has(world.id)) extras.add(world.id);
  }
  for (const literal of Object.values(bricks.canonical_aliases)) {
    if (scalar(literal) && byLiteral.has(literal)) extras.add(literal);
  }

  const literals = [...new Set([...required, ...extras])]
    .sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const parts = [];
  const partByLiteral = new Map();
  for (const literal of literals) {
    const id = `kanjivg:${literal.codePointAt(0).toString(16).padStart(5, '0')}`;
    const record = byLiteral.get(literal);
    let part;
    if (record) {
      const [paths, rawSha] = record;
      part = {
        id,
        literal,
        paths,
        svg_sha256: rawSha,
        provenance: { ...provenance },
      };
    } else {
      part = {
        id,
        literal,
        gap: {
          code: 'missing-upstream',
          reason: `no canonical SVG member for ${literal} in KanjiVG ${VERSION}`,
        },
        provenance: { ...provenance },
      };
    }
    parts.push(part);
    partByLiteral.set(literal, part);
  }

  const aliases = {};
  for (const [alias, literal] of Object.entries(bricks.canonical_aliases)) {
    const canonical = partByLiteral.get(literal);
    if (canonical) aliases[alias] = canonical.id;
  }

  const relationKey = relation => `${relation.kind}\u0000${relation.from}\u0000${relation.to}`;
  const relations = [];
  const seenRelations = new Set();
  for (const part of parts) {
    const record = byLiteral.get(part.literal);
    if (!record) continue;
    const elements = record[2];
    for (const element of elements) {
      if (!scalar(element) || element === part.literal) continue;
      const component = partByLiteral.get(element);
      if (!component) continue;
      const relation = {
        kind: 'component',
        from: part.id,
        to: component.id,
        provenance: { ...provenance },
      };
      const key = relationKey(relation);
      if (seenRelations.has(key)) continue;
      seenRelations.add(key);
      relations.push(relation);
    }
  }

  const mappings = { bricks: {}, worlds: {} };
  const unmapped = [];
  function resolve(source, sourceId, reason) {
    if (partByLiteral.has(sourceId)) return partByLiteral.get(sourceId).id;
    const canonical = bricks.canonical_aliases[sourceId];
    if (canonical && partByLiteral.has(canonical)) return partByLiteral.get(canonical).id;
    unmapped.push({ source, source_id: sourceId, reason });
    return null;
  }

  for (const brick of bricks.components) {
    const target = resolve('bricks', brick.id,
      scalar(brick.id)
        ? 'no upstream KanjiVG geometry or canonical alias for this single-glyph brick'
        : 'stroke-sequence brick id is not a single Unicode scalar and has no canonical alias');
    if (target) mappings.bricks[brick.id] = target;
  }
  for (const world of worlds.worlds) {
    const target = resolve('worlds', world.id,
      'no upstream KanjiVG geometry or canonical alias for this world glyph');
    if (target) mappings.worlds[world.id] = target;
  }

  const graph = { schemaVersion: 1, parts, relations, aliases, mappings };
  const graphBytes = Buffer.from(JSON.stringify(graph), 'utf8');
  const unmappedBytes = Buffer.from(JSON.stringify(unmapped), 'utf8');
  writeFileSync(new URL('graph.json', DATA), graphBytes);
  writeFileSync(new URL('unmapped.json', DATA), unmappedBytes);

  process.stdout.write(JSON.stringify({
    parts: parts.length,
    geometry: parts.filter(part => Array.isArray(part.paths)).length,
    gaps: parts.filter(part => part.gap).length,
    relations: relations.length,
    bricks: Object.keys(mappings.bricks).length,
    worlds: Object.keys(mappings.worlds).length,
    unmapped: unmapped.length,
    graphBytes: graphBytes.length,
    graphSha256: sha256(graphBytes),
    unmappedBytes: unmappedBytes.length,
    unmappedSha256: sha256(unmappedBytes),
    archiveBytes: ARCHIVE_BYTES,
  }, null, 2) + '\n');
}

main();

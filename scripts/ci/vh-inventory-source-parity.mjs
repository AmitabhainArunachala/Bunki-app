/** Read-only inventory comparison. Producer code is parsed, never imported or evaluated.
 * Static admission lists remain authoritative. Unsupported expansion/closure blocks admission.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import { gateEvidenceDeclaration } from './gate-evidence.mjs';
import { frameworkGateRoster } from './framework-rosters.mjs';
import { commandChecks } from './command-check-contracts.mjs';
import { pythonReportRosters } from './vh-python-report-contracts.mjs';
import { retainedReportContracts } from './vh-retained-report-contracts.mjs';
import { existingReportContracts } from './vh-existing-report-contracts.mjs';
import { mediaReportContracts } from './vh-media-report-contracts.mjs';
import { visualReportContracts } from './vh-visual-report-contracts.mjs';
import { learningReportContracts } from './vh-learning-report-contracts.mjs';
import { assessmentReportContracts } from './vh-assessment-report-contracts.mjs';
import { miscReportContracts } from './vh-misc-report-contracts.mjs';
import { deckReportContracts } from './vh-deck-report-contracts.mjs';
import { voiceReportContracts } from './vh-voice-report-contracts.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const P = 'prototypes/corridor/tools/';
// These pins protect copied expansion semantics; changing producer selection requires review.
const PRODUCER_PINS = Object.freeze({
  [`${P}verify-corridor-accessibility.mjs`]:
    '91974d35c3c352cf013e29798d298ba44c0d25d41a0f32b0fd6c90176ed13064',
  [`${P}build-standalone.mjs`]: 'f12afe0cfce59c5cc35b99adf2df4dba3e0bc3356ba18e9de8487781e0411557',
  [`${P}verify-sense-truth.mjs`]:
    '315786beb7763d8d847d5eb04a8e399df769aa1a07ece364a15795181c6854f6',
  [`${P}sense-grok-case.mjs`]: 'f968617684b38ece18d40cde2d645ae3f8c2de0eb0e59d5b7f7f0e5e3eaab367',
  [`${P}vh-voice-contracts.mjs`]:
    '9e25ca9e0b4e2365db3f9d26a51ae14cd53a787de9d450995225e50d82dc7a3e',
});
const parse = (source, file = 'inventory.mjs') => {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, `Unparseable source: ${file}`);
  return ast;
};
function nodes(ast, predicate) {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}
function initializer(ast, name) {
  const matches = nodes(
    ast,
    (node) =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name,
  );
  assert.equal(matches.length, 1, `Missing/ambiguous declaration: ${name}`);
  assert(matches[0].initializer, `Uninitialized declaration: ${name}`);
  return matches[0].initializer;
}
function literal(node, ast, env = {}) {
  assert(node, 'Missing literal expression');
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((n) => literal(n, ast, env));
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties.map((p) => {
        assert(
          ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)),
          'Unsupported property',
        );
        return [p.name.text, literal(p.initializer, ast, env)];
      }),
    );
  if (ts.isIdentifier(node))
    return Object.hasOwn(env, node.text)
      ? env[node.text]
      : literal(initializer(ast, node.text), ast, env);
  if (ts.isPropertyAccessExpression(node))
    return literal(node.expression, ast, env)[node.name.text];
  if (ts.isConditionalExpression(node))
    return literal(node.condition, ast, env)
      ? literal(node.whenTrue, ast, env)
      : literal(node.whenFalse, ast, env);
  if (ts.isTemplateExpression(node))
    return (
      node.head.text +
      node.templateSpans
        .map((s) => String(literal(s.expression, ast, env)) + s.literal.text)
        .join('')
    );
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === 'Object.freeze' &&
    node.arguments.length === 1
  )
    return literal(node.arguments[0], ast, env);
  throw new Error(`Unsupported static expression: ${node.getText(ast).slice(0, 120)}`);
}
function pinnedSource(root, file) {
  const source = readFileSync(resolve(root, file), 'utf8');
  assert.equal(digest(source), PRODUCER_PINS[file], `Unreviewed producer expansion: ${file}`);
  return source;
}
export function compareInventory(
  expected,
  observed,
  ordering = 'unordered-exact',
  label = 'inventory',
) {
  assert(Array.isArray(expected) && Array.isArray(observed), `${label}: missing inventory`);
  assert(expected.length > 0 && observed.length > 0, `${label}: empty inventory`);
  assert(
    [...expected, ...observed].every((id) => typeof id === 'string' && id.length > 0),
    `${label}: invalid inventory ID`,
  );
  if (ordering === 'unordered-exact') {
    assert.equal(new Set(expected).size, expected.length, `${label}: duplicate expected name`);
    assert.equal(new Set(observed).size, observed.length, `${label}: duplicate observed name`);
    assert.deepEqual(
      [...observed].sort(),
      [...expected].sort(),
      `${label}: source/admission mismatch`,
    );
  } else {
    assert(
      ['ordered', 'indexed-occurrence', 'file-level'].includes(ordering),
      `${label}: unknown ordering`,
    );
    assert.deepEqual(observed, expected, `${label}: ordered source/admission mismatch`);
  }
  return true;
}
export function accessibilitySourceInventory(root) {
  const source = pinnedSource(root, `${P}verify-corridor-accessibility.mjs`),
    ast = parse(source);
  const rows = [],
    diagnostics = [];
  for (const call of nodes(
    ast,
    (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'check',
  )) {
    if (call.arguments[1]?.kind === ts.SyntaxKind.FalseKeyword) {
      const name = literal(call.arguments[0], ast);
      assert.equal(
        name,
        'a pointer touch reaches its intended control',
        'Unknown failure-only check',
      );
      diagnostics.push(name);
      continue;
    }
    let contexts = [{}];
    if (ts.isTemplateExpression(call.arguments[0])) {
      const loops = [];
      for (let ancestor = call.parent; ancestor; ancestor = ancestor.parent)
        if (ts.isForOfStatement(ancestor)) loops.unshift(ancestor);
      for (const loop of loops) {
        assert(
          ts.isVariableDeclarationList(loop.initializer) &&
            loop.initializer.declarations.length === 1,
          'Unknown loop binding',
        );
        const binding = loop.initializer.declarations[0].name;
        assert(ts.isIdentifier(binding), 'Unknown destructured loop');
        contexts = contexts.flatMap((env) =>
          literal(loop.expression, ast, env).map((value) => ({ ...env, [binding.text]: value })),
        );
      }
    }
    rows.push(...contexts.map((env) => literal(call.arguments[0], ast, env)));
  }
  assert.equal(diagnostics.length, 1);
  assert.equal(rows.length, 66);
  assert.equal(new Set(rows).size, rows.length);
  return { rows, ordering: 'unordered-exact', diagnostics, sourceSha256: digest(source) };
}
export function standaloneModuleSourceInventory(root) {
  const source = pinnedSource(root, `${P}build-standalone.mjs`),
    ast = parse(source);
  const expression = initializer(ast, 'recordImports');
  assert(
    ts.isNewExpression(expression) &&
      expression.expression.getText(ast) === 'Map' &&
      expression.arguments.length === 1,
  );
  const rows = literal(expression.arguments[0], ast).map((pair) => {
    assert.equal(pair.length, 2);
    return pair[0];
  });
  const receiver = parse(readFileSync(resolve(root, 'scripts/verify-release-gates.mjs'), 'utf8'));
  const expected = literal(initializer(receiver, 'STANDALONE_RECORD_MODULES'), receiver);
  compareInventory(expected, rows, 'ordered', 'standalone record modules');
  assert.equal(rows.length, 9);
  return { rows, ordering: 'ordered', sourceSha256: digest(source) };
}
export function senseShardEntry(shards, sequence) {
  let hash = 0x811c9dc5;
  for (const character of String(sequence)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return shards.get((hash & 15).toString(16).padStart(2, '0'))?.get(String(sequence)) || null;
}
export function senseSourceInventory(root) {
  const source = pinnedSource(root, `${P}verify-sense-truth.mjs`),
    ast = parse(source);
  for (const file of [`${P}sense-grok-case.mjs`, `${P}vh-voice-contracts.mjs`])
    pinnedSource(root, file);
  const inputs = new Map();
  const json = (path) => {
    const bytes = readFileSync(resolve(root, 'prototypes/corridor', path));
    inputs.set(path, digest(bytes));
    return JSON.parse(bytes);
  };
  const shelf = json('data/articles/index.json').articles;
  assert.equal(
    new Set(shelf.map((row) => row.id)).size,
    shelf.length,
    'Duplicate article identity',
  );
  const entries = json('data/share_alike/dict-v2/index.json').entries;
  const details = new Map();
  for (let shard = 0; shard < 16; shard++) {
    const id = shard.toString(16).padStart(2, '0');
    details.set(
      id,
      new Map(
        json(`data/share_alike/dict-v2/${id}.json`).entries.map((entry) => [
          String(entry[0]),
          entry,
        ]),
      ),
    );
  }
  const hira = (s) =>
    String(s || '').replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const byKana = new Map(),
    byForm = new Map();
  for (const entry of entries) {
    for (const kana of entry[5]) {
      const key = hira(kana);
      if (!byKana.has(key)) byKana.set(key, []);
      byKana.get(key).push(entry);
    }
    for (const form of new Set([entry[1], ...entry[4], ...entry[5]])) {
      if (!byForm.has(form)) byForm.set(form, []);
      byForm.get(form).push(entry);
    }
  }
  const senses = (entry) => senseShardEntry(details, entry[0])?.[3] || [];
  const classes = new Map(),
    occurrences = [];
  const add = (cls, at, index, token, key) => {
    if (!classes.has(key)) classes.set(key, { cls, at, index, key });
    if (key === 'C2|日|にち') occurrences.push({ at, index, token });
  };
  const bodies = new Map();
  for (const row of shelf) {
    const body = json(`data/articles/${row.file}`);
    bodies.set(row.id, body);
    body.tokens.forEach((token, index, tokens) => {
      const prev = tokens[index - 1],
        prev2 = tokens[index - 2],
        form = token.b || token.s;
      const headed = (byKana.get(hira(form)) || []).filter(
        (entry) =>
          entry[1] === form || senses(entry).some((sense) => (sense[7] || []).includes('uk')),
      );
      if (
        token.p === '助動詞' &&
        headed.some((entry) =>
          senses(entry).some((sense) =>
            sense[0].some((code) => /^(?:aux|aux-v|aux-adj|cop)$/u.test(code)),
          ),
        )
      )
        add('C1', row.id, index, token, `C1|${token.s}|${token.b}`);
      const idiom =
        (token.s === '枚' && tokens[index + 1]?.s === '岩') ||
        (token.s === '発' && tokens[index + 1]?.s === '退場');
      if (
        token.p === '接尾辞' &&
        !idiom &&
        prev &&
        (/^[0-9０-９〇一二三四五六七八九十百千万億兆]+$/u.test(prev.s) ||
          ['ひと', 'ふた', 'いく', '幾', '何', '数'].includes(prev.s)) &&
        (byForm.get(token.s) || []).some(
          (entry) =>
            (entry[1] === token.s || entry[4].includes(token.s)) &&
            entry[5].some((kana) => hira(kana) === hira(token.r || token.s)) &&
            senses(entry).some((sense) =>
              sense[0].some((code) => /^(?:ctr|suf|n-suf)$/u.test(code)),
            ),
        )
      )
        add('C2', row.id, index, token, `C2|${token.s}|${token.r}`);
      const ku = (t) => ['形容詞', '助動詞'].includes(t?.p) && /く$/u.test(String(t?.s || ''));
      if (
        ['ない', '無い'].includes(token.b) &&
        (token.p === '助動詞' ||
          (token.p === '形容詞' &&
            (['で', 'じゃ', 'じゃあ'].includes(prev?.s) ||
              ku(prev) ||
              (['は', 'も'].includes(prev?.s) &&
                (['で', 'じゃ'].includes(prev2?.s) || ku(prev2))))))
      )
        add('C3', row.id, index, token, `C3|${token.s}|${token.p}|${prev?.s}`);
    });
  }
  for (const [at, list] of Object.entries(json('data/articles/senses.json').articles || {}))
    for (const index of Object.keys(list)) {
      assert(bodies.get(at)?.tokens[Number(index)]);
      add('C4', at, Number(index), null, `C4|${at}|${index}`);
    }
  const tables = {};
  for (const name of [
    'RULES',
    'RECHECK',
    'CONTROLS',
    'MORE',
    'IMPRECISE',
    'SIDECAR',
    'GLOSSED',
    'NAMES',
    'READINGS',
  ]) {
    const init = initializer(ast, name);
    assert(
      ts.isCallExpression(init) &&
        init.expression.getText(ast) === 'Object.freeze' &&
        init.arguments.length === 1 &&
        ts.isArrayLiteralExpression(init.arguments[0]),
    );
    tables[name] = init.arguments[0].elements.map((call) => {
      assert(ts.isCallExpression(call) && call.expression.getText(ast) === 'fx');
      const more = call.arguments[7];
      let interaction;
      if (more) {
        assert(ts.isObjectLiteralExpression(more));
        const field = more.properties.find((p) => p.name?.getText(ast) === 'expectedInteraction');
        if (field) interaction = literal(field.initializer, ast);
      }
      return { name: literal(call.arguments[0], ast), interaction };
    });
  }
  const page = initializer(ast, 'PAGE');
  assert(ts.isNewExpression(page) && page.expression.getText(ast) === 'Set');
  const pageNames = literal(page.arguments[0], ast);
  const flash = initializer(ast, 'FLASH');
  assert(
    ts.isCallExpression(flash) &&
      ts.isPropertyAccessExpression(flash.expression) &&
      flash.expression.name.text === 'map',
  );
  const flashNames = literal(flash.expression.expression, ast);
  const data = [
    ...['RULES', 'RECHECK', 'CONTROLS', 'MORE', 'IMPRECISE'].flatMap((k) =>
      tables[k].map((f) => `data/F0.${f.name}`),
    ),
    ...tables.SIDECAR.map((f) => `data/F0.sidecar.${f.name}`),
    ...tables.GLOSSED.map((f) => `data/F0.gloss.${f.name}`),
    ...tables.NAMES.map((f) => `data/F0.name.${f.name}`),
    ...tables.READINGS.map((f) => `data/F0.reading.${f.name}`),
    'data/F0.sidecar',
  ];
  const grok = [
    'RULES',
    'RECHECK',
    'CONTROLS',
    'MORE',
    'SIDECAR',
    'IMPRECISE',
    'GLOSSED',
    'NAMES',
    'READINGS',
  ].flatMap((k) => tables[k]);
  for (const name of flashNames)
    assert.equal(
      ['RULES', 'RECHECK', 'SIDECAR', 'GLOSSED']
        .flatMap((k) => tables[k])
        .filter((f) => f.name === name).length,
      1,
    );
  const browser = [
    ...grok.flatMap((f) => [
      `G.${f.name}`,
      ...(f.interaction === 'reading-card' ? [`G.${f.name}.classification`] : []),
      ...(pageNames.includes(f.name) ? [`P.${f.name}`] : []),
    ]),
    'g.page-errors',
    ...flashNames.flatMap((name) =>
      [true, false].flatMap((hold) =>
        [...(hold ? ['held'] : []), 'settled', 'never-taken-back', 'page-errors'].map(
          (suffix) => `W.${hold ? 'held' : 'free'}.${name}.${suffix}`,
        ),
      ),
    ),
    ...[...classes.values()].map((c) => `C.case.${c.cls}.${c.at}.${c.index}`),
    'C1',
    'C2',
    'C3',
    'C4',
    'c.page-errors',
  ];
  assert.equal(data.length, 135);
  assert.equal(browser.length, 1490);
  assert.equal(new Set(browser).size, browser.length);
  const receiptsPath = `${P}sense-sidecar-receipts.json`;
  inputs.set(receiptsPath, digest(readFileSync(resolve(root, receiptsPath))));
  return {
    data,
    browser,
    classes: [...classes.values()],
    occurrences,
    inputs: [...inputs].map(([path, sha256]) => ({ path, sha256 })),
    ordering: 'unordered-exact',
    selection: 'first eligible occurrence in shelf order then token order',
    sourceSha256: digest(source),
  };
}

const ADAPTER_FAMILIES = [
  ['retained', retainedReportContracts],
  ['existing', existingReportContracts],
  ['media', mediaReportContracts],
  ['visual', visualReportContracts],
  ['learning', learningReportContracts],
  ['assessment', assessmentReportContracts],
  ['misc', miscReportContracts],
  ['deck', deckReportContracts],
  ['voice', voiceReportContracts],
];
const INLINE_LISTS = {
  'shelf-search': 'SHELF_SEARCH_GATE_CASES',
  'record-note-views': 'NOTE_VIEW_GATE_CASES',
  'record-note-create': 'NOTE_CREATE_GATE_CASES',
  'record-note-lifecycle': 'NOTE_LIFECYCLE_GATE_CASES',
  'record-note-restore': 'NOTE_RESTORE_GATE_CASES',
  'record-practice-finalize': 'PRACTICE_FINALIZE_GATE_CASES',
  'alma-reading': 'ALMA_READING_GATE_CASES',
  'prefetch-lifecycle': 'PREFETCH_LIFECYCLE_GATE_CASES',
  'drift-hunt': 'HUNT_GATE_CASES',
  native: 'NATIVE_GATE_CASES',
  practice: 'PRACTICE_HISTORY_CASES',
  offline: 'OFFLINE_GATE_CASES',
  'standalone-journey': 'STANDALONE_JOURNEY_STATIONS',
};
const JSON_ROSTERS = {
  hfix2c: 'scripts/ci/vh-hfix2c-rosters.json',
  'hfix2c-three-state-contrast': 'scripts/ci/vh-hfix2c-rosters.json',
  hfix2d: 'scripts/ci/vh-hfix2d-roster.json',
};
/** Preserve declaration order and duplicate occurrences; never flatten a roster into a Set. */
export function inventoryCensus(root, gates, out = '/inventory-census/no-execution') {
  assert.equal(gates.length, 216, 'Required descriptor count changed');
  assert.equal(new Set(gates.map((g) => g.name)).size, 216, 'Duplicate descriptor');
  const required = JSON.parse(
    readFileSync(resolve(root, 'scripts/ci/vh-required-gate-roster.json'), 'utf8'),
  );
  compareInventory(
    required.requiredNames,
    gates.map((g) => g.name),
    'unordered-exact',
    'required gates',
  );
  const sourceCache = new Map(),
    closures = {};
  function scan(path) {
    if (sourceCache.has(path)) return sourceCache.get(path);
    const absolute = resolve(root, path);
    assert(!relative(root, absolute).startsWith('..'), 'Source escapes repository');
    if (!existsSync(absolute)) {
      const row = { path, missing: true, imports: [], external: [], dynamic: [], environment: [] };
      sourceCache.set(path, row);
      return row;
    }
    const bytes = readFileSync(absolute),
      row = {
        path,
        sha256: digest(bytes),
        imports: [],
        external: [],
        dynamic: [],
        environment: [],
      };
    sourceCache.set(path, row);
    if (!/\.[cm]?[jt]sx?$/u.test(path)) return row;
    const ast = ts.createSourceFile(
      path,
      bytes.toString('utf8'),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    );
    if (ast.parseDiagnostics.length)
      row.dynamic.push('source parse diagnostics; closure unresolved');
    const imports = [];
    for (const node of nodes(ast, () => true)) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
        imports.push(node.moduleSpecifier);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(ast) === 'require')
      ) {
        if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]))
          imports.push(node.arguments[0]);
        else row.dynamic.push(node.getText(ast).slice(0, 160));
      }
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(ast) === 'URL' &&
        node.arguments?.length === 2 &&
        node.arguments[1].getText(ast) === 'import.meta.url'
      )
        imports.push(node.arguments[0]);
      if (ts.isPropertyAccessExpression(node) && node.expression.getText(ast) === 'process.env')
        row.environment.push(node.name.text);
      if (ts.isElementAccessExpression(node) && node.expression.getText(ast) === 'process.env') {
        if (ts.isStringLiteralLike(node.argumentExpression))
          row.environment.push(node.argumentExpression.text);
        else row.dynamic.push(`environment: ${node.getText(ast)}`);
      }
    }
    for (const specifier of imports) {
      if (!ts.isStringLiteralLike(specifier)) {
        row.dynamic.push(specifier.getText(ast).slice(0, 160));
        continue;
      }
      const name = specifier.text;
      if (!name.startsWith('.')) {
        row.external.push(name);
        continue;
      }
      const base = resolve(dirname(absolute), name);
      const candidates = [
        base,
        ...['.ts', '.mjs', '.js', '/index.ts', '/index.js'].map((ext) => base + ext),
      ];
      const match = candidates.find((p) => existsSync(p));
      const rel = relative(root, match || base)
        .split('\\')
        .join('/');
      if (rel.startsWith('..')) row.dynamic.push(`external relative import: ${name}`);
      else row.imports.push(rel);
    }
    for (const field of ['imports', 'external', 'dynamic', 'environment'])
      row[field] = [...new Set(row[field])];
    return row;
  }
  function closure(path) {
    if (closures[path]) return path;
    const seen = new Set(),
      queue = [path],
      missing = [],
      dynamic = [],
      external = [],
      environment = [];
    while (queue.length) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      assert(seen.size < 2000, 'Static closure cap exceeded');
      seen.add(file);
      const item = scan(file);
      if (item.missing) missing.push(file);
      dynamic.push(...item.dynamic.map((expression) => ({ path: file, expression })));
      external.push(...item.external.map((specifier) => ({ path: file, specifier })));
      environment.push(...item.environment);
      queue.push(...item.imports);
    }
    closures[path] = {
      files: [...seen].map((file) => ({ path: file, sha256: scan(file).sha256 || null })),
      missing,
      dynamic,
      external,
      environment: [...new Set(environment)].sort(),
      scope:
        'static local imports and literal import.meta.url inputs only; copied/generated/dynamic/package closure is not certified',
    };
    return path;
  }
  const receiverSource = 'scripts/verify-release-gates.mjs';
  const receiver = parse(readFileSync(resolve(root, receiverSource), 'utf8'));
  let a11y, sense, standalone;
  const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const rows = gates.map((gate, index) => {
    const row = {
      name: gate.name,
      descriptorIndex: index,
      declaration: null,
      producerPaths: [],
      declarationSources: [],
      reviewedRoster: { status: 'UNRESOLVED', ordering: 'UNRESOLVED', rows: null },
      sourceSchedule: { status: 'UNRESOLVED', rows: null },
      expansion: {
        engine: gate.report?.engine || gate.env?.KAIRO_BROWSER || null,
        engines: gate.report?.engines || null,
        data: 'UNRESOLVED',
      },
      selectors: {
        declaredEnvironment: gate.env || {},
        argv: gate.args,
        sourceEnvironmentKeys: [],
        status: 'UNRESOLVED',
      },
      closure: { references: [], copiedSources: 'UNRESOLVED', status: 'UNRESOLVED' },
      blockers: [],
    };
    try {
      row.declaration = gateEvidenceDeclaration(gate, root, out);
      const kind = row.declaration.kind;
      let family, contract;
      if (kind === 'adapter') {
        for (const [name, map] of ADAPTER_FAMILIES) {
          const found =
            map[gate.name] ||
            (name === 'voice' && gate.name.endsWith('-webkit')
              ? map[gate.name.slice(0, -7)]
              : null);
          if (found) {
            family = name;
            contract = found;
            break;
          }
        }
        assert(contract, `Unknown adapter mapping: ${gate.name}`);
        row.declarationSources.push(`scripts/ci/vh-${family}-report-contracts.mjs`);
        if (contract.producer) row.producerPaths.push(contract.producer);
        row.reviewedRoster.rows = contract.expectedCases(row.expansion.engine || 'chromium', {});
        row.reviewedRoster.status = 'DECLARED';
      } else if (kind === 'retained-report') {
        row.declarationSources.push(receiverSource);
        const type = gate.report.type;
        const jsonPath =
          JSON_ROSTERS[type] ||
          (type.startsWith('batch3-') ? 'scripts/ci/vh-batch3-rosters.json' : null);
        if (jsonPath) {
          row.declarationSources.push(jsonPath);
          row.reviewedRoster.rawDocument = readJson(jsonPath);
          row.reviewedRoster.status = 'DECLARED_DOCUMENT';
          row.reviewedRoster.ordering = type === 'hfix2d' ? 'indexed-occurrence' : 'ordered';
          row.blockers.push('JSON engine/suite projection not independently derived');
        } else if (INLINE_LISTS[type]) {
          row.reviewedRoster.rows = literal(initializer(receiver, INLINE_LISTS[type]), receiver);
          row.reviewedRoster.status = 'DECLARED';
          row.reviewedRoster.ordering = [
            'standalone-journey',
            'record-note-restore',
            'record-practice-finalize',
          ].includes(type)
            ? 'ordered'
            : 'unordered-exact';
        } else {
          row.blockers.push(`Unmapped inline/count-only admission: ${type}`);
        }
      } else if (kind === 'framework') {
        const spec = frameworkGateRoster(gate.name);
        row.declarationSources.push('scripts/ci/framework-rosters.json');
        row.reviewedRoster = {
          status: 'DECLARED',
          ordering: 'file-level',
          rows: spec.files,
          universe: spec.universe,
        };
        row.producerPaths.push(...spec.files);
        row.blockers.push(
          'Framework metadata is file-level; producer case schedule not independently derived',
        );
      } else if (kind === 'node-test') {
        row.declarationSources.push('scripts/ci/gate-evidence.mjs');
        row.reviewedRoster = {
          status: 'DECLARED',
          ordering: 'file-level',
          rows: row.declaration.files,
        };
        row.producerPaths.push(...row.declaration.files);
        row.blockers.push(
          'Node descriptor is file-level; dynamic test registration not independently derived',
        );
      } else if (kind === 'command-check') {
        row.declarationSources.push('scripts/ci/command-check-contracts.mjs');
        row.reviewedRoster = {
          status: 'DECLARED',
          ordering: 'not-case-based',
          rows: null,
          rule: commandChecks[gate.name],
        };
        row.producerPaths.push(...commandChecks[gate.name].inputs);
        row.blockers.push(
          'Command input/output discovery and copied closure not independently proven',
        );
      } else if (kind === 'python') {
        row.declarationSources.push('scripts/ci/vh-python-report-rosters.json');
        row.reviewedRoster = {
          status: 'DECLARED_DOCUMENT',
          ordering: 'UNRESOLVED',
          rawDocument: pythonReportRosters[gate.name],
          rows: null,
        };
        row.blockers.push('Python named schedule not independently derived');
      } else if (kind === 'reference-core') {
        row.declarationSources.push('scripts/ci/vh-reference-case-roster.json');
        row.reviewedRoster = {
          status: 'DECLARED',
          ordering: 'unordered-exact',
          rows: readJson('scripts/ci/vh-reference-case-roster.json'),
        };
      } else if (kind === 'release-runner') {
        row.declarationSources.push('scripts/ci/vh-release-check-roster.json');
        row.reviewedRoster = {
          status: 'DECLARED_DOCUMENT',
          ordering: 'unordered-exact-by-group',
          rows: null,
          rawDocument: readJson('scripts/ci/vh-release-check-roster.json'),
        };
      } else if (kind === 'word-grammar') {
        row.declarationSources.push(`${P}vh-word-grammar-contracts.mjs`);
        row.blockers.push('Grammar width/engine schedule not independently expanded');
      } else if (kind === 'official-content') {
        row.declarationSources.push('scripts/ci/gate-evidence.mjs');
        row.blockers.push('Repository scan is not a fixed case list; discovery closure unproved');
      } else throw new Error(`Unknown declaration kind: ${kind}`);
      if (gate.name === 'corridor-a11y') {
        a11y ||= accessibilitySourceInventory(root);
        compareInventory(row.reviewedRoster.rows, a11y.rows, a11y.ordering, gate.name);
        row.sourceSchedule = { status: 'VERIFIED', rows: a11y.rows };
        row.reviewedRoster.ordering = a11y.ordering;
        row.expansion.data = 'source literals; two widths and eleven worlds';
      }
      if (gate.name === 'sense-truth' || gate.name === 'sense-truth-webkit') {
        sense ||= senseSourceInventory(root);
        const engine = row.expansion.engine || 'chromium';
        const actual = [...sense.data, ...sense.browser.map((id) => `${engine}/${id}`)];
        compareInventory(row.reviewedRoster.rows, actual, sense.ordering, gate.name);
        row.sourceSchedule = { status: 'VERIFIED', rows: actual };
        row.reviewedRoster.ordering = sense.ordering;
        row.expansion.data = { shared: 135, perEngine: 1490, inputs: sense.inputs };
      }
      if (gate.name === 'standalone-journey') {
        standalone ||= standaloneModuleSourceInventory(root);
        row.sourceSchedule.moduleInventory = { status: 'VERIFIED', ...standalone };
        row.blockers.push(
          'Standalone module parity verified; journey station schedule still needs independent extraction',
        );
      }
    } catch (error) {
      row.blockers.push(error.message);
    }
    row.producerPaths.push(
      ...gate.args.filter(
        (arg) =>
          /\.(?:mjs|cjs|js|py)$/u.test(arg) &&
          !arg.startsWith('-') &&
          !arg.startsWith('node_modules/'),
      ),
    );
    row.producerPaths = [...new Set(row.producerPaths)];
    for (const path of [...new Set([...row.producerPaths, ...row.declarationSources])]) {
      try {
        row.closure.references.push(closure(path));
      } catch (error) {
        row.blockers.push(`Closure ${path}: ${error.message}`);
      }
    }
    row.selectors.sourceEnvironmentKeys = [
      ...new Set(row.closure.references.flatMap((path) => closures[path].environment)),
    ].sort();
    if (row.sourceSchedule.status !== 'VERIFIED')
      row.blockers.push('Producer schedule parity UNPROVEN');
    if (row.reviewedRoster.ordering === 'UNRESOLVED')
      row.blockers.push('Ordering/occurrence semantics UNRESOLVED');
    row.blockers.push(
      'Copied/generated/dynamic/package closure and selector admission not independently certified',
    );
    for (const path of row.closure.references)
      if (closures[path].missing.length)
        row.blockers.push(`Missing source inputs: ${closures[path].missing.join(', ')}`);
    row.parity = row.blockers.length ? 'BLOCKED' : 'VERIFIED';
    return row;
  });
  return {
    schema: 'W3-inventory-source-census/1',
    scope: 'source-only; no producer, browser, build or FULL executed',
    count: rows.length,
    rows,
    closures,
    files: [...sourceCache.values()].map(({ path, sha256, missing }) => ({
      path,
      sha256: sha256 || null,
      missing: !!missing,
    })),
    unresolved: rows
      .filter((r) => r.parity !== 'VERIFIED')
      .map((r) => ({ name: r.name, blockers: r.blockers })),
    status: rows.every((r) => r.parity === 'VERIFIED') ? 'VERIFIED' : 'BLOCKED',
  };
}
/** Consistency check of this source-only census, never a launch key or proof authenticator. */
export function requireInventoryCensusReady(census) {
  assert.equal(census.count, 216, 'Census is incomplete');
  assert.equal(census.rows.length, 216, 'Census rows missing');
  assert.equal(new Set(census.rows.map((row) => row.name)).size, 216, 'Duplicate census row');
  const blocked = census.rows.filter((row) => row.parity !== 'VERIFIED' || row.blockers.length);
  assert.equal(
    blocked.length,
    0,
    `Inventory admission blocked: ${blocked.map((r) => r.name).join(', ')}`,
  );
  // Clearing the summary flags cannot certify an unresolved sub-obligation.
  for (const row of census.rows) {
    assert.equal(row.sourceSchedule.status, 'VERIFIED', `${row.name}: unproven producer schedule`);
    assert.equal(row.selectors.status, 'VERIFIED', `${row.name}: unproven selectors`);
    assert.equal(row.closure.status, 'VERIFIED', `${row.name}: unproven closure`);
    assert(
      Array.isArray(row.reviewedRoster.rows) && row.reviewedRoster.rows.length,
      `${row.name}: no independently mapped roster`,
    );
    compareInventory(
      row.reviewedRoster.rows,
      row.sourceSchedule.rows,
      row.reviewedRoster.ordering,
      row.name,
    );
  }
  assert.equal(census.status, 'VERIFIED');
  return true;
}

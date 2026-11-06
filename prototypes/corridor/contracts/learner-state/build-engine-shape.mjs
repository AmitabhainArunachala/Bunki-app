/** Generates w4-engine-shape.json (G6a; SPEC S1-R12, S1-R20) from the canonical engine as vendored in this checkout:
 *  event types and per-type field lists from client/schema/event.mjs, the replay's registry and config field lists from
 *  client/replay.mjs, the engine source commit and reducer digest from engine-manifest.json, the scheduler pin from
 *  data/fsrs-pin.json and client/engine.mjs, and the answer union from srs-core.mjs validAnswer. Everything is read with
 *  the TypeScript parser or as JSON: nothing here is typed by hand, and the file records the sha256 of every source it
 *  was generated from. Run: node build-engine-shape.mjs [--write | --stdout] */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..', '..');
const VENDOR = join(CORRIDOR, 'vendor', 'shared-study-engine');
export const SOURCES = Object.freeze({
  'client/schema/event.mjs': join(VENDOR, 'client', 'schema', 'event.mjs'),
  'client/replay.mjs': join(VENDOR, 'client', 'replay.mjs'),
  'client/engine.mjs': join(VENDOR, 'client', 'engine.mjs'),
  'engine-manifest.json': join(VENDOR, 'engine-manifest.json'),
  'data/fsrs-pin.json': join(CORRIDOR, 'data', 'fsrs-pin.json'),
  'srs-core.mjs': join(CORRIDOR, 'srs-core.mjs'),
});
export const OUTPUT = join(HERE, 'w4-engine-shape.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function parse(file) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}
/** every `const NAME = <array of string literals>` in a file, top level or nested */
function stringArrays(sf) {
  const out = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isArrayLiteralExpression(node.initializer)
      && node.initializer.elements.length && node.initializer.elements.every((e) => ts.isStringLiteral(e))) out.set(node.name.text, node.initializer.elements.map((e) => e.text));
    ts.forEachChild(node, visit);
  };
  visit(sf); return out;
}
/** the object literal `const NAME = { key: [...] | IDENT }`, identifiers resolved through the string arrays */
function stringArrayObject(sf, name, arrays) {
  let found = null;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && ts.isObjectLiteralExpression(node.initializer)) found = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) throw new Error(`${name} not found`);
  const out = {};
  for (const prop of found.properties) {
    if (!ts.isPropertyAssignment(prop)) throw new Error(`${name}: unexpected property`);
    const key = ts.isIdentifier(prop.name) ? prop.name.text : ts.isStringLiteral(prop.name) ? prop.name.text : null;
    if (key === null) throw new Error(`${name}: unexpected key`);
    if (ts.isArrayLiteralExpression(prop.initializer)) out[key] = prop.initializer.elements.map((e) => { if (!ts.isStringLiteral(e)) throw new Error(`${name}.${key}: non-string`); return e.text; });
    else if (ts.isIdentifier(prop.initializer) && arrays.has(prop.initializer.text)) out[key] = arrays.get(prop.initializer.text);
    else throw new Error(`${name}.${key}: unresolved value`);
  }
  return out;
}
/** every `fields(<expr>, [ 'a', 'b' ])` call: the receiver's text → the union of its key lists */
function fieldsCalls(sf) {
  const out = {};
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fields' && node.arguments.length === 2 && ts.isArrayLiteralExpression(node.arguments[1])
      && node.arguments[1].elements.every((e) => ts.isStringLiteral(e))) {
      const receiver = node.arguments[0].getText(sf), keys = node.arguments[1].elements.map((e) => e.text);
      out[receiver] = [...new Set([...(out[receiver] || []), ...keys])];   // one receiver may be read in two calls (config); keep every key once, in order
    }
    ts.forEachChild(node, visit);
  };
  visit(sf); return out;
}
/** the `validAnswer` function's exact text, and the forms it accepts, read from its body */
function answerUnion(sf) {
  let fn = null;
  const visit = (node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'validAnswer') fn = node; ts.forEachChild(node, visit); };
  visit(sf);
  if (!fn) throw new Error('validAnswer not found');
  const text = fn.getText(sf);
  const literals = (re) => [...text.matchAll(re)].map((m) => m[1]);
  const ratings = (text.match(/\[([0-9, ]+)\]\.includes\(answer\.rating\)/u) || [, ''])[1].split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
  const selfChecks = literals(/answer\.selfCheck === '(\w+)'/gu);
  const claim = /answer\.claim === true/u.test(text);
  if (!ratings.length || !selfChecks.length || !claim) throw new Error('validAnswer: union not recognised');
  return { source: text, sha256: sha256(text), forms: [{ key: 'rating', values: ratings }, { key: 'selfCheck', values: selfChecks }, { key: 'claim', values: [true] }], exactlyOneKey: /keys\.length !== 1/u.test(text) };
}
function schedulerLiteral(sf, key) {
  let value = null;
  const visit = (node) => { if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === key && ts.isStringLiteral(node.initializer)) value = node.initializer.text; ts.forEachChild(node, visit); };
  visit(sf); if (value === null) throw new Error(`${key} not found in engine.mjs`); return value;
}
function eventFields(sf) {
  // the `fields` list inside validateEvent: const fields = ['v','id',...]
  const arrays = stringArrays(sf); if (!arrays.has('fields')) throw new Error('validateEvent fields not found'); return arrays.get('fields');
}

export function buildEngineShape() {
  const event = parse(SOURCES['client/schema/event.mjs']); const replay = parse(SOURCES['client/replay.mjs']); const engine = parse(SOURCES['client/engine.mjs']); const srs = parse(SOURCES['srs-core.mjs']);
  const manifest = JSON.parse(readFileSync(SOURCES['engine-manifest.json'], 'utf8')); const pin = JSON.parse(readFileSync(SOURCES['data/fsrs-pin.json'], 'utf8'));
  const arrays = stringArrays(event);
  const deviceTypes = arrays.get('DEVICE_TYPES'), serverTypes = arrays.get('SERVER_TYPES');
  const fieldsByType = stringArrayObject(event, 'fieldsByType', arrays);
  for (const type of [...deviceTypes, ...serverTypes]) if (!fieldsByType[type]) throw new Error(`fieldsByType lacks ${type}`);
  const calls = fieldsCalls(replay);
  const shape = {
    generatedBy: 'prototypes/corridor/contracts/learner-state/build-engine-shape.mjs',
    engine: { sourceCommit: manifest.source.commit, sourceRepository: manifest.source.repository, api: manifest.api, eventVersion: manifest.eventVersion, policyId: manifest.policyId,
      reducerPin: manifest.reducerSha256.slice(0, 7), reducerSha256: manifest.reducerSha256, closureSha256: manifest.closureSha256, sharedFiles: manifest.files.length },
    scheduler: { parameterSetId: pin.parameterSetId, algorithm: pin.algorithm, package: pin.package, pinnedVersion: pin.pinnedVersion, requestRetention: pin.requestRetention,
      engineParameterSetId: schedulerLiteral(engine, 'parameterSetId'), pinPayloadHash: schedulerLiteral(engine, 'pinPayloadHash') },
    eventFields: eventFields(event), deviceTypes, serverTypes, fieldsByType,
    scheduledContracts: arrays.get('SCHEDULED_CONTRACTS'),
    replay: { config: calls.config || null, registry: calls.registry || null, task: calls.row || null, player: calls['task.player'] || null },
    answerUnion: answerUnion(srs),
    sources: Object.fromEntries(Object.entries(SOURCES).map(([name, file]) => [name, sha256(readFileSync(file))])),
  };
  return shape;
}
export const render = (shape) => `${JSON.stringify(shape, null, 2)}\n`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = render(buildEngineShape());
  if (process.argv.includes('--write')) { writeFileSync(OUTPUT, out); console.log(`wrote ${OUTPUT} (${out.length} bytes)`); }
  else process.stdout.write(out);
}

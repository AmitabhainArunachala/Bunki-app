import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const draftDirectory = 'prototypes/corridor/data/inquiry/manifest-draft';
const testFile = 'prototypes/corridor/tools/inquiry-manifest.test.mjs';
const unitsFile = `${draftDirectory}/units.json`;
const schemaFile = `${draftDirectory}/unit.schema.json`;
const manifestFile = `${draftDirectory}/MANIFEST.md`;

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

const units = readJson(unitsFile);
const schema = readJson(schemaFile);
const manifestMarkdown = readText(manifestFile);

const clone = (value) => JSON.parse(JSON.stringify(value));
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function resolveReference(rootSchema, reference) {
  assert.ok(reference.startsWith('#/'), `Only local schema references are supported: ${reference}`);
  return reference.slice(2).split('/').reduce((value, token) => {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    return value[key];
  }, rootSchema);
}

function validateSchemaNode(currentSchema, value, rootSchema, location) {
  if (currentSchema.$ref) {
    validateSchemaNode(resolveReference(rootSchema, currentSchema.$ref), value, rootSchema, location);
    return;
  }

  if (Object.hasOwn(currentSchema, 'const')) {
    assert.ok(Object.is(value, currentSchema.const), `${location}: expected ${JSON.stringify(currentSchema.const)}, got ${JSON.stringify(value)}`);
  }
  if (currentSchema.enum) {
    assert.ok(currentSchema.enum.some((candidate) => Object.is(candidate, value)), `${location}: ${JSON.stringify(value)} is not in the allowed enum`);
  }
  if (currentSchema.type) {
    const allowedTypes = Array.isArray(currentSchema.type) ? currentSchema.type : [currentSchema.type];
    const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
    const typePasses = allowedTypes.some((type) => type === actualType || (type === 'number' && (actualType === 'integer' || actualType === 'number')) || (type === 'integer' && actualType === 'integer'));
    assert.ok(typePasses, `${location}: expected type ${allowedTypes.join(' or ')}, got ${actualType}`);
  }

  if (typeof value === 'string') {
    if (currentSchema.minLength !== undefined) {
      assert.ok(value.length >= currentSchema.minLength, `${location}: string is shorter than ${currentSchema.minLength}`);
    }
    if (currentSchema.pattern) {
      assert.ok(new RegExp(currentSchema.pattern, 'u').test(value), `${location}: ${JSON.stringify(value)} does not match ${currentSchema.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    if (currentSchema.minItems !== undefined) {
      assert.ok(value.length >= currentSchema.minItems, `${location}: expected at least ${currentSchema.minItems} item(s), got ${value.length}`);
    }
    if (currentSchema.uniqueItems) {
      const serialised = value.map((item) => JSON.stringify(item));
      assert.equal(new Set(serialised).size, value.length, `${location}: items must be unique`);
    }
    if (currentSchema.items) {
      value.forEach((item, index) => validateSchemaNode(currentSchema.items, item, rootSchema, `${location}[${index}]`));
    }
  }

  if (plainObject(value)) {
    if (currentSchema.required) {
      for (const key of currentSchema.required) {
        assert.ok(Object.hasOwn(value, key), `${location}: required property ${key} is missing`);
      }
    }
    if (currentSchema.additionalProperties === false) {
      const allowed = new Set(Object.keys(currentSchema.properties ?? {}));
      for (const key of Object.keys(value)) {
        assert.ok(allowed.has(key), `${location}: additional property ${key} is not allowed`);
      }
    }
    for (const [key, propertySchema] of Object.entries(currentSchema.properties ?? {})) {
      if (Object.hasOwn(value, key)) {
        validateSchemaNode(propertySchema, value[key], rootSchema, `${location}.${key}`);
      }
    }
  }
}

function assertManifestSchema(candidate, candidateSchema = schema) {
  const headerSchema = {
    ...candidateSchema,
    properties: {
      ...candidateSchema.properties,
      units: { type: 'array', minItems: 1 }
    }
  };
  validateSchemaNode(headerSchema, candidate, candidateSchema, '$');

  const unitIds = new Set();
  candidate.units.forEach((unit, index) => {
    const label = plainObject(unit) && typeof unit.id === 'string' && unit.id ? unit.id : `units[${index}]`;
    try {
      validateSchemaNode(candidateSchema.properties.units.items, unit, candidateSchema, `$.units[${index}]`);
    } catch (error) {
      throw new Error(`${label}: ${error.message}`);
    }
    assert.ok(!unitIds.has(unit.id), `${unit.id}: duplicate unit id`);
    unitIds.add(unit.id);

    unit.outcomes.forEach((outcome) => {
      if (outcome.kind === 'can-do') {
        assert.match(outcome.text, /^Can\s+.+\.$/su, `${unit.id}: can-do outcome must be a complete can-do sentence`);
      } else {
        assert.match(outcome.text, /\?$/u, `${unit.id}: inquiry outcome must be a complete question`);
      }
    });
  });
}

function assertHeader(candidate) {
  assert.equal(candidate.manifest, 'inquiry', 'A1: manifest marker');
  assert.equal(candidate.version, 1, 'A1: version');
  assert.match(candidate.draft_date, /^\d{4}-\d{2}-\d{2}$/u, 'A1: draft_date must be ISO YYYY-MM-DD');
  assert.equal(new Date(`${candidate.draft_date}T00:00:00.000Z`).toISOString().slice(0, 10), candidate.draft_date, 'A1: draft_date must be a real calendar date');
  assert.equal(candidate.frozen, false, 'A1: this is the pre-MF5 draft');
  assert.equal(candidate.freeze_date, null, 'A1: only MF5 may set freeze_date');
  assert.equal(candidate.author_family, 'moonshot', 'A1: author family');
  assert.equal(candidate.unit_count, candidate.units.length, 'A1: unit_count must equal units[] length');
  for (const key of Object.keys(candidate)) {
    assert.doesNotMatch(key, /hash/iu, `A1: draft header must not carry a manifest hash (${key})`);
  }
}

function assertPrerequisiteGraph(candidate) {
  const positions = new Map(candidate.units.map((unit, index) => [unit.id, index]));
  for (const unit of candidate.units) {
    for (const prerequisite of unit.prerequisites) {
      assert.ok(positions.has(prerequisite), `A3 ${unit.id}: prerequisite ${prerequisite} does not resolve to a unit in units.json`);
    }
  }

  const state = new Map();
  function visit(unitId) {
    if (state.get(unitId) === 'done') return;
    assert.notEqual(state.get(unitId), 'visiting', `A3 ${unitId}: prerequisite cycle detected`);
    state.set(unitId, 'visiting');
    const unit = candidate.units[positions.get(unitId)];
    for (const prerequisite of unit.prerequisites) visit(prerequisite);
    state.set(unitId, 'done');
  }
  for (const unit of candidate.units) visit(unit.id);

  for (const unit of candidate.units) {
    const unitPosition = positions.get(unit.id);
    for (const prerequisite of unit.prerequisites) {
      assert.ok(positions.get(prerequisite) < unitPosition, `A3 ${unit.id}: prerequisite ${prerequisite} is listed after the unit that needs it`);
    }
  }
}

const requiredCompoundingSteps = [
  'earlier_reading_record',
  'later_linked_evidence',
  'change_with_reason',
  'transfer_evidence'
];

function assertUnitContent(candidate) {
  for (const unit of candidate.units) {
    assert.ok(unit.sources.length >= 1, `A4 ${unit.id}: at least one named source is required`);
    const sourceIds = new Set(unit.sources.map((source) => source.id));
    for (const source of unit.sources) {
      assert.ok(source.kind.trim(), `A4 ${unit.id}: source ${source.id} needs a kind`);
      assert.ok(source.title.trim(), `A4 ${unit.id}: source ${source.id} needs a name`);
      assert.match(source.route, /^S3-R8: .+/u, `A4 ${unit.id}: source ${source.id} needs an S3-R8 route`);
    }

    const obligations = new Map(unit.compounding_obligations.map((obligation) => [obligation.step, obligation]));
    assert.equal(obligations.size, unit.compounding_obligations.length, `A4 ${unit.id}: compounding steps must be unique`);
    for (const step of requiredCompoundingSteps) {
      assert.ok(obligations.has(step), `A4 ${unit.id}: missing S3-R16 obligation ${step}`);
      assert.ok(obligations.get(step).check.trim(), `A4 ${unit.id}: ${step} needs a check`);
    }
    const earlier = obligations.get('earlier_reading_record');
    const later = obligations.get('later_linked_evidence');
    assert.ok(sourceIds.has(earlier.source_id), `A4 ${unit.id}: earlier-reading record must resolve to a unit source`);
    assert.ok(sourceIds.has(later.source_id), `A4 ${unit.id}: later evidence must resolve to another unit source`);
    assert.notEqual(later.source_id, earlier.source_id, `A4 ${unit.id}: later linked evidence must come from another source`);
    assert.equal(obligations.get('transfer_evidence').evidence_store, 'transfer_evidence_apart_from_review_grades', `A4 ${unit.id}: transfer evidence must be stored apart from review grades`);
    assert.equal(unit.schedule_key, null, 'A4 ' + unit.id + ': inquiry threads are outside the vocabulary schedule (S3-R12)');
    assert.ok(unit.review_obligations.some((obligation) => obligation.actor_class === 'native_reviewer_X4'), `A4 ${unit.id}: native-review obligation X4 is required`);
  }
}

function assertCompoundingCoverage(candidate) {
  const threads = new Map();
  for (const unit of candidate.units) {
    if (!threads.has(unit.thread_id)) threads.set(unit.thread_id, []);
    threads.get(unit.thread_id).push(unit);
  }
  const compoundable = [...threads.entries()].filter(([, threadUnits]) => {
    const sources = new Set(threadUnits.flatMap((unit) => unit.sources.map((source) => source.id)));
    const steps = threadUnits.reduce((count, unit) => count + unit.compounding_obligations.length, 0);
    return sources.size >= 2 && steps >= 3;
  });
  assert.ok(compoundable.length >= 1, 'A5: at least one thread needs >=2 sources and >=3 compounding steps');
  assert.equal(candidate.thread_count, threads.size, 'A5: thread_count must equal the declared thread set size');
  assert.ok(threads.has(candidate.j11_example_thread_id), `A5: J11 example ${candidate.j11_example_thread_id} must name an existing thread`);
}

function insideDirectory(relativePath, directory) {
  const relative = path.relative(path.resolve(repoRoot, directory), path.resolve(repoRoot, relativePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertWriteSet(candidate, changedFiles) {
  assert.ok(Number.isInteger(candidate.version) && candidate.draft_date, 'A6: version and draft_date are required');
  assert.deepEqual(candidate.write_set, [`${draftDirectory}/`], 'A6: draft write set must be manifest-draft/ only');
  const filesToCheck = changedFiles ?? (process.env.L3B_CHANGED_FILES
    ? process.env.L3B_CHANGED_FILES.split(/\r?\n|,/u).map((file) => file.trim()).filter(Boolean)
    : candidate.write_set);
  for (const file of filesToCheck) {
    assert.ok(!path.isAbsolute(file), `A6: changed path must be repository-relative: ${file}`);
    assert.ok(insideDirectory(file, draftDirectory) || path.normalize(file) === testFile, `A6: file outside the allowed write set changed: ${file}`);
  }
  assert.ok(insideDirectory(unitsFile, draftDirectory), 'A6: units.json is outside manifest-draft/');
  assert.ok(insideDirectory(schemaFile, draftDirectory), 'A6: unit.schema.json is outside manifest-draft/');
  assert.ok(insideDirectory(manifestFile, draftDirectory), 'A6: MANIFEST.md is outside manifest-draft/');
  assert.deepEqual(fs.readdirSync(path.join(repoRoot, draftDirectory)).sort(), ['MANIFEST.md', 'unit.schema.json', 'units.json'], 'A6: unexpected draft file set');
}

function fencedManifestBlock(markdown) {
  const allJsonOpenings = markdown.match(/^```json(?:[ \t]+[^\r\n]*)?[ \t]*$/gmu) ?? [];
  const blocks = [...markdown.matchAll(/^```json manifest[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gmu)];
  assert.equal(allJsonOpenings.length, 1, `A7 MANIFEST.md: expected exactly one fenced json block, found ${allJsonOpenings.length}`);
  assert.equal(blocks.length, 1, `A7 MANIFEST.md: expected exactly one complete block with info string "json manifest", found ${blocks.length}`);
  try {
    return JSON.parse(blocks[0][1]);
  } catch (error) {
    throw new Error(`A7 MANIFEST.md: fenced JSON does not parse: ${error.message}`);
  }
}

function firstDifference(expected, actual, location = '$') {
  if (Object.is(expected, actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${location}.length: expected ${expected.length}, got ${actual.length}`;
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstDifference(expected[index], actual[index], `${location}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (plainObject(expected) && plainObject(actual)) {
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) return `${location}.${key}: missing from fenced block`;
      const difference = firstDifference(expected[key], actual[key], `${location}.${key}`);
      if (difference) return difference;
    }
    for (const key of Object.keys(actual)) {
      if (!Object.hasOwn(expected, key)) return `${location}.${key}: unexpected field in fenced block`;
    }
    return null;
  }
  return `${location}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
}

function assertFenceEquality(markdown, expected = units) {
  const parsed = fencedManifestBlock(markdown);
  const difference = firstDifference(expected, parsed);
  assert.equal(difference, null, `A7 MANIFEST.md differs from units.json at ${difference ?? 'unknown field'}`);
  assert.deepEqual(parsed, expected, 'A7: fenced JSON must deep-equal units.json in the same order');
}

function expectMutantRed(run, expectedMessageParts) {
  let failure = null;
  try {
    run();
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, 'Mutant unexpectedly passed');
  for (const expected of expectedMessageParts) {
    assert.ok(failure.message.includes(expected), `Mutant failure ${JSON.stringify(failure.message)} does not name ${JSON.stringify(expected)}`);
  }
}

test('A1: versioned, dated, unfrozen header has no hash and a truthful unit_count', () => {
  assertHeader(units);
});

test('A2: schema-checked units have outcomes, prerequisites, reviews, and assessments', () => {
  assertManifestSchema(units);
  const ids = new Set(units.units.map((unit) => unit.id));
  for (const unit of units.units) {
    for (const prerequisite of unit.prerequisites) {
      assert.ok(ids.has(prerequisite), `A2 ${unit.id}: unresolved prerequisite ${prerequisite}`);
    }
  }
});

test('A3: prerequisites resolve, are acyclic, and precede dependents in declared order', () => {
  assertPrerequisiteGraph(units);
});

test('A4: every unit names S3-R8 sources, S3-R16 obligations, X4 review, and no schedule key', () => {
  assertUnitContent(units);
});

test('A5: the named J11 example thread is large enough to demonstrate compounding', () => {
  assertCompoundingCoverage(units);
});

test('A6: draft version/date and repository write set stay inside the allowed paths', () => {
  assertWriteSet(units);
});

test('A7: exactly one parseable json manifest fence deep-equals units.json', () => {
  assertFenceEquality(manifestMarkdown);
});

test('negative controls: in-memory mutants go red with the unit id or difference', async (t) => {
  await t.test('deleting assessments[] names the unit and missing field', () => {
    const mutant = clone(units);
    const unitId = mutant.units[0].id;
    delete mutant.units[0].assessments;
    expectMutantRed(() => assertManifestSchema(mutant), [unitId, 'assessments']);
  });

  await t.test('empty assessments[] names the unit and array minimum', () => {
    const mutant = clone(units);
    const unitId = mutant.units[0].id;
    mutant.units[0].assessments = [];
    expectMutantRed(() => assertManifestSchema(mutant), [unitId, 'assessments', 'at least 1']);
  });

  await t.test('an unknown prerequisite id goes red in the DAG check', () => {
    const mutant = clone(units);
    const unitId = mutant.units[1].id;
    const missingId = 'inquiry:unit:keigo-in-context:missing';
    mutant.units[1].prerequisites.push(missingId);
    expectMutantRed(() => assertPrerequisiteGraph(mutant), [unitId, missingId, 'does not resolve']);
  });

  await t.test('a prerequisite cycle goes red naming a unit in the cycle', () => {
    const mutant = clone(units);
    const unitId = mutant.units[0].id;
    mutant.units[0].prerequisites = [mutant.units[2].id];
    expectMutantRed(() => assertPrerequisiteGraph(mutant), [unitId, 'cycle']);
  });

  await t.test('a prerequisite declared after its dependent goes red naming the unit', () => {
    const mutant = clone(units);
    const unitId = mutant.units[2].id;
    [mutant.units[0], mutant.units[2]] = [mutant.units[2], mutant.units[0]];
    expectMutantRed(() => assertPrerequisiteGraph(mutant), [unitId, 'listed after']);
  });

  await t.test('an out-of-write-set changed path goes red', () => {
    expectMutantRed(() => assertWriteSet(units, ['docs/outside-write-set.md']), ['A6', 'docs/outside-write-set.md']);
  });

  await t.test('one changed fenced outcome names its exact difference path', () => {
    const mutantMarkdown = manifestMarkdown.replace('Can locate お知らせ', 'Can notice お知らせ');
    assert.notEqual(mutantMarkdown, manifestMarkdown, 'The outcome plant must change the in-memory Markdown copy');
    expectMutantRed(() => assertFenceEquality(mutantMarkdown), ['$.units[0].outcomes[0].text', 'Can notice']);
  });

  await t.test('removing the fence goes red', () => {
    const mutantMarkdown = manifestMarkdown.replace('```json manifest\n', '').replace(/\n```\s*$/u, '\n');
    expectMutantRed(() => assertFenceEquality(mutantMarkdown), ['MANIFEST.md', 'exactly one']);
  });

  await t.test('two JSON fences go red', () => {
    const mutantMarkdown = `${manifestMarkdown}\n\`\`\`json manifest\n{}\n\`\`\`\n`;
    expectMutantRed(() => assertFenceEquality(mutantMarkdown), ['MANIFEST.md', 'found 2']);
  });

  await t.test('an unparseable fenced block goes red', () => {
    const mutantMarkdown = manifestMarkdown.replace('"manifest": "inquiry",', '"manifest": "inquiry" BROKEN,');
    expectMutantRed(() => assertFenceEquality(mutantMarkdown), ['MANIFEST.md', 'does not parse']);
  });
});

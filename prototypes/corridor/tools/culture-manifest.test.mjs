import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const draftRelative = 'prototypes/corridor/data/culture/manifest-draft';
const testRelative = 'prototypes/corridor/tools/culture-manifest.test.mjs';
const unitsRelative = `${draftRelative}/units.json`;
const schemaRelative = `${draftRelative}/unit.schema.json`;
const markdownRelative = `${draftRelative}/MANIFEST.md`;
const deliveredFiles = [unitsRelative, schemaRelative, markdownRelative, testRelative];
const unitsPath = path.resolve(unitsRelative);
const schemaPath = path.resolve(schemaRelative);
const markdownPath = path.resolve(markdownRelative);
const manifest = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));
const unitSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const markdown = fs.readFileSync(markdownPath, 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateSchema(value, schema, location = '$') {
  const fail = (message) => {
    throw new Error(`${location} ${message}`);
  };

  if (schema.type) {
    const valid = schema.type === 'array'
      ? Array.isArray(value)
      : schema.type === 'object'
        ? isObject(value)
        : schema.type === 'integer'
          ? Number.isInteger(value)
          : schema.type === 'null'
            ? value === null
            : typeof value === schema.type;
    if (!valid) fail(`must be ${schema.type}`);
  }
  if (schema.enum && !schema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) {
    fail(`must be exactly one of ${schema.enum.join(', ')}`);
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    fail(`must equal ${JSON.stringify(schema.const)}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(`must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      fail(`must match ${schema.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(`must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      fail('must contain unique items');
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchema(item, schema.items, `${location}[${index}]`));
    }
    if (schema.contains && !value.some((item) => {
      try {
        validateSchema(item, schema.contains, location);
        return true;
      } catch {
        return false;
      }
    })) {
      fail('must contain a native-reviewer obligation');
    }
  }

  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) fail(`is missing required property "${key}"`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) fail(`has undeclared property "${key}"`);
      }
    }
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) validateSchema(value[key], propertySchema, `${location}.${key}`);
    }
  }
}

function assertUnitsAgainstSchema(document) {
  assert.ok(Array.isArray(document.units), 'units must be an array');
  const ids = new Set();
  document.units.forEach((unit, index) => {
    const id = isObject(unit) && typeof unit.id === 'string' && unit.id ? unit.id : `unit at index ${index}`;
    try {
      validateSchema(unit, unitSchema, `$.units[${index}]`);
    } catch (error) {
      throw new Error(`${id}: schema validation failed: ${error.message}`);
    }
    assert.ok(!ids.has(unit.id), `${unit.id}: duplicate unit id`);
    ids.add(unit.id);
  });
}

function assertIsoDate(value) {
  assert.equal(typeof value, 'string', 'draft_date must be a string');
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/u, 'draft_date must be an ISO calendar date');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  assert.ok(!Number.isNaN(parsed.getTime()), `draft_date is invalid: ${value}`);
  assert.equal(parsed.toISOString().slice(0, 10), value, `draft_date is not a real calendar date: ${value}`);
}

function assertHeader(document) {
  assert.equal(document.manifest, 'culture');
  assert.equal(document.version, 1);
  assertIsoDate(document.draft_date);
  assert.equal(document.frozen, false, 'S13.8: only MF6 freezes this draft');
  assert.equal(document.freeze_date, null, 'S13.8: the draft has no freeze date');
  assert.equal(document.author_family, 'moonshot');
  assert.ok(Array.isArray(document.units), 'units[] must be present');
  assert.equal(document.unit_count, document.units.length, 'unit_count must equal units[] length read from units.json');
  for (const key of Object.keys(document)) {
    assert.ok(!/hash/iu.test(key), `draft header must not carry a manifest hash: ${key}`);
  }
}

function assertPrerequisiteDag(document) {
  const units = document.units;
  const positions = new Map(units.map((unit, index) => [unit.id, index]));

  for (const unit of units) {
    for (const prerequisite of unit.prerequisites) {
      assert.ok(positions.has(prerequisite), `${unit.id}: prerequisite does not resolve: ${prerequisite}`);
    }
  }
  for (const unit of units) {
    for (const prerequisite of unit.prerequisites) {
      assert.ok(
        positions.get(prerequisite) < positions.get(unit.id),
        `${unit.id}: prerequisite ${prerequisite} occurs after the unit that needs it in declared order`
      );
    }
  }

  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === 'done') return;
    assert.notEqual(state.get(id), 'visiting', `${id}: prerequisite cycle detected`);
    state.set(id, 'visiting');
    const unit = units.find((candidate) => candidate.id === id);
    for (const prerequisite of unit.prerequisites) visit(prerequisite);
    state.set(id, 'done');
  };
  for (const unit of units) visit(unit.id);
}

function assertNoAuthorityField(value, location = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoAuthorityField(entry, `${location}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    assert.ok(
      !/(?:cultural.?authority|single.?authority|sole.?authority)/iu.test(key),
      `${location}.${key}: no field may claim a single cultural authority`
    );
    assertNoAuthorityField(entry, `${location}.${key}`);
  }
}

function assertContent(document) {
  const labels = new Set(unitSchema.properties.evidence_status.enum);
  assert.deepEqual([...labels].sort(), ['attested-history', 'mnemonic', 'uncertain-etymology']);
  for (const unit of document.units) {
    assert.equal(typeof unit.evidence_status, 'string', `${unit.id}: evidence_status must carry exactly one label`);
    assert.ok(labels.has(unit.evidence_status), `${unit.id}: unknown evidence-status label`);
    assert.ok(unit.sources.length >= 1, `${unit.id}: at least one named source is required`);
    for (const source of unit.sources) {
      assert.ok(source.name.trim().length > 0, `${unit.id}: source name must be present`);
      assert.ok(source.citation.trim().length > 0, `${unit.id}: source citation must be specific`);
    }
    const nativeReviews = unit.review_obligations.filter(
      (obligation) => obligation.actor_class === 'native-reviewer' && /\bX4\b/u.test(obligation.check)
    );
    assert.ok(nativeReviews.length >= 1, `${unit.id}: an X4 native-review obligation is required`);
    assert.ok(unit.review_rubric_id.trim().length > 0, `${unit.id}: a review-rubric id is required`);
  }
  assertNoAuthorityField(document);
  assert.equal(typeof document.stratified_sample_rule, 'string');
  assert.ok(document.stratified_sample_rule.length > 0, 'header must name the stratified-sample rule');
  for (const label of labels) {
    assert.ok(document.stratified_sample_rule.includes(label), `stratified-sample rule must name ${label}`);
  }
  assert.ok(document.reviewer_provenance_fields.includes('reviewer_family'));
  assert.ok(document.reviewer_provenance_fields.includes('model_id'));
  assert.deepEqual(document.reviewer_family_rule.allowed_families, ['zhipu', 'deepseek', 'openai']);
  assert.equal(document.reviewer_family_rule.must_differ_from_author_family, true);
  assert.equal(document.reviewer_family_rule.certifies_japanese_truth, false);
  assert.deepEqual(document.reviewer_family_rule.verdict_scope, ['structure', 'prerequisites', 'coverage']);
}

function assertWriteSetPaths(files) {
  const allowed = new Set(deliveredFiles);
  for (const file of files) {
    assert.ok(allowed.has(file), `file changed outside the declared write set: ${file}`);
    if (file !== testRelative) {
      assert.ok(file.startsWith(`${draftRelative}/`), `draft file is outside manifest-draft/: ${file}`);
    }
  }
}

function parseSingleFencedBlock(text) {
  const jsonOpenings = text.match(/^```json(?:[ \t]+[^\r\n]*)?[ \t]*\r?$/gmu) ?? [];
  const blocks = [...text.matchAll(/^```json manifest[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gmu)];
  assert.equal(
    blocks.length,
    1,
    `MANIFEST.md must contain exactly one fenced json manifest block; found ${blocks.length} (json openings: ${jsonOpenings.length})`
  );
  assert.equal(jsonOpenings.length, 1, `MANIFEST.md must contain no other json fence; found ${jsonOpenings.length}`);
  try {
    return JSON.parse(blocks[0][1]);
  } catch (error) {
    throw new Error(`fenced json manifest block does not parse: ${error.message}`);
  }
}

function firstDifference(actual, expected, location = '$') {
  if (Object.is(actual, expected)) return null;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      return `${location}.length: fenced=${actual.length}, units.json=${expected.length}`;
    }
    for (let index = 0; index < actual.length; index += 1) {
      const difference = firstDifference(actual[index], expected[index], `${location}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (isObject(actual) && isObject(expected)) {
    const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
    for (const key of keys) {
      if (!Object.hasOwn(actual, key)) return `${location}.${key}: missing from fenced block`;
      if (!Object.hasOwn(expected, key)) return `${location}.${key}: unexpected in fenced block`;
      const difference = firstDifference(actual[key], expected[key], `${location}.${key}`);
      if (difference) return difference;
    }
    return null;
  }
  return `${location}: fenced=${JSON.stringify(actual)}, units.json=${JSON.stringify(expected)}`;
}

function assertFencedBlockEquals(text, expected) {
  const parsed = parseSingleFencedBlock(text);
  const difference = firstDifference(parsed, expected);
  assert.ok(difference === null, `fenced block differs from units.json at ${difference}`);
  assert.deepStrictEqual(parsed, expected);
}

test('A1: header identifies an unhashed, unfrozen moonshot draft', () => {
  assertHeader(manifest);
});

test('A2: every real unit passes unit.schema.json', () => {
  assertUnitsAgainstSchema(manifest);
});

test('A3: prerequisites resolve, precede dependents, and form a DAG', () => {
  assertPrerequisiteDag(manifest);
});

test('A4: content carries sources, native review, rubrics, and reviewer provenance', () => {
  assertContent(manifest);
});

test('A5: every unit has exactly one unmerged evidence-status label', () => {
  const used = new Set(manifest.units.map((unit) => unit.evidence_status));
  assert.deepEqual([...used].sort(), ['attested-history', 'mnemonic', 'uncertain-etymology']);
  assertUnitsAgainstSchema(manifest);
});

test('A6: versioned draft files remain inside the declared write set', () => {
  assert.equal(manifest.version, 1);
  assertIsoDate(manifest.draft_date);
  assertWriteSetPaths(deliveredFiles);
  assert.deepEqual(fs.readdirSync(path.resolve(draftRelative)).sort(), ['MANIFEST.md', 'unit.schema.json', 'units.json']);
  for (const file of deliveredFiles) assert.ok(fs.existsSync(path.resolve(file)), `missing delivered file: ${file}`);
});

test('A7: the sole fenced JSON block deep-equals units.json', () => {
  assertFencedBlockEquals(markdown, manifest);
});

test('negative controls: in-memory mutants go red with the unit id or difference', async (t) => {
  await t.test('missing and empty assessments fail schema with the unit id', () => {
    const missing = clone(manifest);
    delete missing.units[0].assessments;
    assert.throws(() => assertUnitsAgainstSchema(missing), /culture:unit:seasonal-calendar.*assessments/u);

    const empty = clone(manifest);
    empty.units[0].assessments = [];
    assert.throws(() => assertUnitsAgainstSchema(empty), /culture:unit:seasonal-calendar.*assessments.*at least 1/u);
  });

  await t.test('an unknown prerequisite fails DAG resolution with both ids', () => {
    const mutant = clone(manifest);
    mutant.units[1].prerequisites.push('culture:unit:not-present');
    assert.throws(
      () => assertPrerequisiteDag(mutant),
      /culture:unit:new-year-cards.*does not resolve: culture:unit:not-present/u
    );
  });

  await t.test('an out-of-order prerequisite names the dependent unit', () => {
    const mutant = clone(manifest);
    mutant.units[2].prerequisites.push('culture:unit:gift-season-mnemonic');
    assert.throws(
      () => assertPrerequisiteDag(mutant),
      /culture:unit:gift-seasons.*culture:unit:gift-season-mnemonic.*after/u
    );
  });

  await t.test('a prerequisite cycle names a participating unit', () => {
    const mutant = clone(manifest);
    mutant.units[0].prerequisites.push('culture:unit:new-year-cards');
    assert.throws(() => assertPrerequisiteDag(mutant), /culture:unit:seasonal-calendar/u);
  });

  await t.test('mixed evidence labels fail schema with the unit id', () => {
    const mutant = clone(manifest);
    mutant.units[0].evidence_status = ['attested-history', 'mnemonic'];
    assert.throws(() => assertUnitsAgainstSchema(mutant), /culture:unit:seasonal-calendar.*evidence_status.*string/u);
  });

  await t.test('one changed fenced outcome names its exact path', () => {
    const original = manifest.units[0].outcomes[0];
    const mutant = markdown.replace(original, '季語の意味を資料に頼らず断定できる。');
    assert.throws(() => assertFencedBlockEquals(mutant, manifest), /\$\.units\[0\]\.outcomes\[0\].*fenced=/u);
  });

  await t.test('removing the fence goes red', () => {
    const mutant = markdown.replace('```json manifest\n', '').replace(/\n```\s*$/u, '\n');
    assert.throws(() => assertFencedBlockEquals(mutant, manifest), /exactly one.*found 0/u);
  });

  await t.test('two fenced blocks go red', () => {
    const mutant = `${markdown}\n\`\`\`json manifest\n{}\n\`\`\`\n`;
    assert.throws(() => assertFencedBlockEquals(mutant, manifest), /exactly one.*found 2/u);
  });

  await t.test('an unparseable fenced block goes red', () => {
    const mutant = markdown.replace('"manifest": "culture",', '"manifest": "culture",,,');
    assert.throws(() => assertFencedBlockEquals(mutant, manifest), /does not parse/u);
  });

  await t.test('an in-memory path outside the write set goes red', () => {
    assert.throws(() => assertWriteSetPaths([...deliveredFiles, 'prototypes/corridor/outside.txt']), /outside.*write set/u);
  });

  assert.equal(manifest.units[0].assessments.length, 1);
  assert.equal(manifest.units[1].prerequisites.includes('culture:unit:not-present'), false);
  assert.ok(fs.existsSync(unitsPath));
  assert.ok(fs.existsSync(markdownPath));
});

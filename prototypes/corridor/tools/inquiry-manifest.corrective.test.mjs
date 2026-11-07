import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const draftDirectory = 'prototypes/corridor/data/inquiry/manifest-draft';
const judgeFile = 'prototypes/corridor/tools/inquiry-manifest.test.mjs';
const manifestFile = `${draftDirectory}/MANIFEST.md`;
const unitsFile = `${draftDirectory}/units.json`;
const schemaFile = `${draftDirectory}/unit.schema.json`;
const realTouchedFiles = [manifestFile, schemaFile, unitsFile, judgeFile];

const units = JSON.parse(fs.readFileSync(path.join(repoRoot, unitsFile), 'utf8'));
const manifestMarkdown = fs.readFileSync(path.join(repoRoot, manifestFile), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));

function insideDirectory(relativePath, directory) {
  const relative = path.relative(path.resolve(repoRoot, directory), path.resolve(repoRoot, relativePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertWriteSet(candidate, changedFiles) {
  assert.deepEqual(candidate.write_set, [`${draftDirectory}/`], 'A6: draft write set must be manifest-draft/ only');
  assert.ok(Array.isArray(changedFiles), 'A6: the real changed-file list is required');
  for (const file of changedFiles) {
    assert.ok(!path.isAbsolute(file), `A6: changed path must be repository-relative: ${file}`);
    assert.ok(insideDirectory(file, draftDirectory) || path.normalize(file) === judgeFile, `A6: file outside the allowed write set changed: ${file}`);
  }
}

function assertEarlierReadingLineage(candidate) {
  const unitsById = new Map(candidate.units.map((unit) => [unit.id, unit]));
  for (const unit of candidate.units) {
    if (unit.prerequisites.length === 0) continue;
    const earlier = unit.compounding_obligations.find((obligation) => obligation.step === 'earlier_reading_record');
    const earlierSourceIds = new Set(unit.prerequisites.flatMap((prerequisite) => {
      const earlierUnit = unitsById.get(prerequisite);
      assert.ok(earlierUnit, `A4 ${unit.id}: referenced earlier unit does not exist: ${prerequisite}`);
      return earlierUnit.sources.map((source) => source.id);
    }));
    assert.ok(earlierSourceIds.has(earlier.source_id), `A4 ${unit.id}: earlier_reading_record.source_id ${earlier.source_id} does not belong to referenced earlier unit(s): ${unit.prerequisites.join(', ')}`);
  }
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

test('A6: the real draft and judge files stay inside the contract write set', () => {
  assertWriteSet(units, realTouchedFiles);
});

test('A6 negative control: a planted file outside the real touched set goes red naming the file', () => {
  const outsideFile = 'docs/outside-write-set.md';
  expectMutantRed(() => assertWriteSet(units, [...realTouchedFiles, outsideFile]), ['A6', outsideFile]);
});

test('MANIFEST.md declares the experience class, schema-and-review check, and no device walk', () => {
  assert.ok(manifestMarkdown.includes("This node's class is `experience`; it receives a schema-and-review check and no device walk."), 'MANIFEST.md must state the experience class and its schema-and-review-only check');
});

test('MANIFEST.md distinguishes MF5 read paths and declares one json block equal to units.json', () => {
  assert.ok(manifestMarkdown.includes("A different MF5 read path is fixed on MF5's contract, while this node exposes exactly one ```json block equal to `units.json`."), 'MANIFEST.md must state the fixed MF5 read path and the single json block contract');
});

test('A4: earlier-reading source ids belong to the referenced earlier units', () => {
  assertEarlierReadingLineage(units);
});

test('A4 negative control: a source absent from the referenced earlier unit goes red naming the unit', () => {
  const mutant = clone(units);
  const unit = mutant.units.find((candidate) => candidate.id === 'inquiry:unit:keigo-in-context:03-transfer');
  const earlier = unit.compounding_obligations.find((obligation) => obligation.step === 'earlier_reading_record');
  earlier.source_id = 'source:bccwj';
  expectMutantRed(() => assertEarlierReadingLineage(mutant), [unit.id, 'source:bccwj', 'inquiry:unit:keigo-in-context:02-compare']);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expectedTestNames,
  nativeBootstrapTestNames,
  readSwiftTestReport,
} from './swift-test-report.mjs';

const assessmentEnvelopeTestName =
  'assessmentEnvelopeVersionIsExplicitAndFutureVersionsRemainRejected()';
const xml = `<testsuites><testsuite tests="53" errors="0" failures="0" skipped="0">${expectedTestNames.map((name) => `<testcase name="${name}" />`).join('')}</testsuite></testsuites>`;
const extraCases = {
  'canonicallyEquivalentUnicodeIDsRemainDistinctOpaqueProfiles(variant:)': 2,
  'lateSuccessfulResponseAfterInvalidationIsRejected(push:)': 2,
  'lossOrPhysicalDeletionRequiresRecoveryAndDoesNotReturnAnAdvancedCheckpoint(reason:)': 3,
  'unavailableSDKAccountStatusesCannotEstablishACloudIdentity(status:)': 4,
};
const output =
  expectedTestNames
    .map(
      (name) =>
        `✔ Test ${name}${extraCases[name] ? ` with ${extraCases[name]} test cases` : ''} passed after 0.001 seconds.`,
    )
    .join('\n') + '\n✔ Test run with 53 tests in 1 suite passed after 0.001 seconds.\n';
test('derives invocation count from complete actual-style summaries', () => {
  const report = readSwiftTestReport(xml, output);
  assert.equal(report.groups, 53);
  assert.equal(report.invocations, 60);
});
test('rejects a current receipt missing the required assessment envelope version test', () => {
  const incompleteXML = xml
    .replace(`<testcase name="${assessmentEnvelopeTestName}" />`, '')
    .replace('tests="53"', 'tests="52"');
  const incompleteOutput = output
    .split('\n')
    .filter((line) => !line.startsWith(`✔ Test ${assessmentEnvelopeTestName} `))
    .join('\n')
    .replace('with 53 tests', 'with 52 tests');
  assert.throws(() => readSwiftTestReport(incompleteXML, incompleteOutput), {
    code: 'test-receipt-incomplete',
  });
});
test('rejects an XML subset even when the summary claims completeness', () => {
  assert.throws(() =>
    readSwiftTestReport(xml.replace(`<testcase name="${expectedTestNames[0]}" />`, ''), output),
  );
});
test('rejects duplicate or wrong XML group names', () => {
  assert.throws(() =>
    readSwiftTestReport(xml.replace(expectedTestNames[0], expectedTestNames[1]), output),
  );
  assert.throws(() => readSwiftTestReport(xml.replace(expectedTestNames[0], 'unknown()'), output));
});
test('rejects partial parameter execution and missing pass summaries', () => {
  assert.throws(() =>
    readSwiftTestReport(xml, output.replace('with 4 test cases', 'with 3 test cases')),
  );
  assert.throws(() =>
    readSwiftTestReport(
      xml,
      output.replace('✔ Test run with 53 tests', '✔ Test run with 52 tests'),
    ),
  );
  assert.throws(() => readSwiftTestReport(xml, output.split('\n').slice(1).join('\n')));
});
test('rejects failure and skip receipts even with passing summary text', () => {
  assert.throws(() => readSwiftTestReport(xml.replace('failures="0"', 'failures="1"'), output));
  assert.throws(() =>
    readSwiftTestReport(xml.replace('</testsuite>', '<skipped /></testsuite>'), output),
  );
});

test('rejects old transport-only receipts without any RPC groups', () => {
  const oldNames = expectedTestNames.filter(
    (name) =>
      name !== assessmentEnvelopeTestName &&
      !name.startsWith('rpc') &&
      !nativeBootstrapTestNames.includes(name),
  );
  assert.equal(oldNames.length, 19);
  const oldXML = `<testsuites><testsuite tests="19" errors="0" failures="0" skipped="0">${oldNames.map((name) => `<testcase name="${name}" />`).join('')}</testsuite></testsuites>`;
  const oldOutput = output
    .split('\n')
    .filter((line) => !line.startsWith(`✔ Test ${assessmentEnvelopeTestName} `))
    .filter((line) => !line.startsWith('✔ Test rpc'))
    .filter((line) => !nativeBootstrapTestNames.some((name) => line.startsWith(`✔ Test ${name} `)))
    .join('\n')
    .replace('with 53 tests', 'with 19 tests');
  assert.throws(() => readSwiftTestReport(oldXML, oldOutput));
});

test('rejects the complete former RPC receipt without native bootstrap coverage', () => {
  const oldNames = expectedTestNames.filter(
    (name) => name !== assessmentEnvelopeTestName && !nativeBootstrapTestNames.includes(name),
  );
  assert.equal(oldNames.length, 31);
  const oldXML = `<testsuites><testsuite tests="31" errors="0" failures="0" skipped="0">${oldNames.map((name) => `<testcase name="${name}" />`).join('')}</testsuite></testsuites>`;
  const oldOutput = output
    .split('\n')
    .filter((line) => !line.startsWith(`✔ Test ${assessmentEnvelopeTestName} `))
    .filter((line) => !nativeBootstrapTestNames.some((name) => line.startsWith(`✔ Test ${name} `)))
    .join('\n')
    .replace('with 53 tests', 'with 31 tests');
  assert.throws(() => readSwiftTestReport(oldXML, oldOutput));
});

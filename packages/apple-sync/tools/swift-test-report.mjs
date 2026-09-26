export const nativeBootstrapTestNames = Object.freeze([
  'nativeBootstrapRemainsDormantUntilExplicitBeginAndConfirmation()',
  'nativePairingPersistsExactScopeAndReconnectNeverReprovisions()',
  'nativePairingRejectsDifferentAccountAndUnavailableAccountWithoutAdoption()',
  'nativeAccountChangeBeforeConfirmationCannotPersistOrOpen()',
  'nativeAccountNotificationSynchronouslyRevokesPendingAndActiveLeases()',
  'nativePendingAccountAndZoneWorkCannotSurviveProfileRevocation()',
  'nativeStorageRefusalAndCorruptionNeverPublishAGrantOrLease()',
  'nativeRevocationDuringProtectedWriteCannotPublishLateConnection()',
  'nativeOpaqueUnicodeScopesAndCompetingPairingsNeverAlias()',
  'nativeConnectionRevocationIsIdempotentAndOldOwnerCannotRevokeReplacement()',
  'nativeForgetRevokesEvenWhenProtectedDeletionFails()',
  'nativeCandidateTransferAndListingNeverImportAuthority()',
  'nativeControlFramingAndReadyBindEveryOwnerField()',
  'nativeControlRejectsDuplicateKeysAuthorityFieldsAndForeignRevocation()',
  'nativeEntitlementAdmissionRequiresActualConfiguredCloudKitCapability()',
  'nativeZoneBootstrapCreatesOnlyTheExactFirstPairingZone()',
  'nativeZoneLookupAfterRevocationCannotStartANewCloudWrite()',
  'nativeZoneFailuresAndUnexpectedResultsDoNotPretendProvisioningSucceeded()',
  'nativeDirectOperationsUseTheCapturedTransportAndRevokeOnAccountLoss()',
  'nativeDirectOperationsRejectLateSuccessAndRetainOriginalBounds()',
  'nativeJavaScriptCandidateBytesRoundTripWithoutCanonicalChanges()',
]);

export const expectedTestNames = Object.freeze(
  [
    ...nativeBootstrapTestNames,
    'rpcCanonicalTypeScriptBytesRoundTrip()',
    'rpcCannotCreateNativeAuthority()',
    'rpcConnectionAndLeaseIsolation()',
    'rpcStrictFrameAdmission()',
    'rpcExactPartialAcknowledgements()',
    'rpcLostReplyRetriesImmutableBytes()',
    'rpcRevocationRejectsHeldLateSuccess()',
    'rpcCancellationCannotPublishLateResults()',
    'rpcPullCursorFailuresRetainPrevious()',
    'rpcOutputAndInputBounds()',
    'rpcFixedFailureCodesOnly()',
    'rpcRealFileHandleFraming()',
    'actualSDKSaveResultAdmissionPreservesPartialsAndProvesImmutableDuplicates()',
    'assessmentEnvelopeVersionIsExplicitAndFutureVersionsRemainRejected()',
    'authenticAccountSwitchIsDetectedEvenWithoutNotificationAndCancelledResponsesDoNotAcknowledge()',
    'canonicalTypeScriptEnvelopeAndEncryptedSDKRecordRoundTrip()',
    'canonicallyEquivalentUnicodeIDsRemainDistinctOpaqueProfiles(variant:)',
    'countAndByteLimitsRejectWithoutTruncation()',
    'cursorRejectsTamperingForeignAccountScopeAndArbitraryArchiveBytes()',
    'distinguishesCloudAccountAuthenticationFromLearnerScopeAuthorization()',
    'encryptedCodecRejectsWrongZonePlaintextMissingCipherFieldAndWrongRecordIdentity()',
    'failedPerRecordFetchRejectsWholePageInsteadOfSkippingIt()',
    'immutableDuplicatesAcknowledgeExactlyAndConflictsNeverOverwrite()',
    'lateSuccessfulResponseAfterInvalidationIsRejected(push:)',
    'lossOrPhysicalDeletionRequiresRecoveryAndDoesNotReturnAnAdvancedCheckpoint(reason:)',
    'nativeEnvelopeChecksScopeReferenceAndBytesWithoutReimplementingMerge()',
    'partialAndMissingPerRecordResultsAcknowledgeOnlyExactSuccessfulReferences()',
    'rejectsForeignScopeAndDuplicateBatchBeforeAnyCloudWrite()',
    'returnsOpaqueScopedCursorWithoutMutatingCallerCheckpoint()',
    'revokedLearnerAuthorizationDiscardsLateSuccessAndInvalidatesTheLease()',
    'unavailableAccountAfterSessionOpenCannotWrite()',
    'unavailableSDKAccountStatusesCannotEstablishACloudIdentity(status:)',
  ].sort(),
);

function requireReport(condition, code) {
  if (condition) return;
  const error = new Error(code);
  error.code = code;
  throw error;
}
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** `swift test --xunit-output <dir>/tests.xml` writes XCTest results there and,
 * since Swift 6.1, Swift Testing results beside it as `tests-swift-testing.xml`.
 * This package's suites are Swift Testing, so the cases live in the sibling
 * file; an older toolchain writes them into the requested name. Return the one
 * report that carries test cases; two carrying cases or none is a defect. */
export function discoverSwiftTestReport(dir, { existsSync, readFileSync, join }) {
  const candidates = ['tests-swift-testing.xml', 'tests.xml']
    .map((name) => ({ name, path: join(dir, name) }))
    .filter((entry) => existsSync(entry.path))
    .map((entry) => ({ ...entry, xml: readFileSync(entry.path, 'utf8') }))
    .filter((entry) => /<testcase\b/u.test(entry.xml));
  requireReport(candidates.length === 1, 'test-report-missing');
  return candidates[0];
}

/** XML names and actual per-group Swift summaries must independently agree. */
export function readSwiftTestReport(xml, output) {
  const names = [...xml.matchAll(/<testcase\s+[^>]*name="([^"]+)"/gu)]
    .map((match) => match[1])
    .sort();
  requireReport(same(names, expectedTestNames), 'test-receipt-incomplete');
  requireReport(!/<failure\b|<error\b|<skipped\b/u.test(xml), 'test-receipt-failure');
  const suites = [...xml.matchAll(/<testsuite\b([^>]+)>/gu)];
  requireReport(suites.length === 1, 'test-receipt-incomplete');
  const attributes = Object.fromEntries(
    [...suites[0][1].matchAll(/(\w+)="([^"]*)"/gu)].map((match) => [match[1], match[2]]),
  );
  requireReport(
    attributes.errors === '0' && attributes.failures === '0' && attributes.skipped === '0',
    'test-receipt-failure',
  );
  requireReport(Number(attributes.tests) === names.length, 'test-receipt-incomplete');
  const perGroup = [
    ...output.matchAll(
      /^✔ Test ([A-Za-z0-9_]+\([^)]*\))(?: with (\d+) test cases)? passed after /gmu,
    ),
  ]
    .map((match) => ({
      name: match[1],
      invocations: match[2] === undefined ? 1 : Number(match[2]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  requireReport(
    same(perGroup.map((item) => item.name).sort(), expectedTestNames),
    'test-summary-incomplete',
  );
  const counts = {
    'canonicallyEquivalentUnicodeIDsRemainDistinctOpaqueProfiles(variant:)': 2,
    'lateSuccessfulResponseAfterInvalidationIsRejected(push:)': 2,
    'lossOrPhysicalDeletionRequiresRecoveryAndDoesNotReturnAnAdvancedCheckpoint(reason:)': 3,
    'unavailableSDKAccountStatusesCannotEstablishACloudIdentity(status:)': 4,
  };
  requireReport(
    perGroup.every((item) => item.invocations === (counts[item.name] ?? 1)),
    'test-summary-mismatch',
  );
  const summaries = [
    ...output.matchAll(/^✔ Test run with (\d+) tests in 1 suite passed after /gmu),
  ];
  requireReport(
    summaries.length === 1 && Number(summaries[0][1]) === names.length,
    'test-summary-incomplete',
  );
  return {
    groups: names.length,
    invocations: perGroup.reduce((sum, item) => sum + item.invocations, 0),
    names,
    perGroup,
  };
}

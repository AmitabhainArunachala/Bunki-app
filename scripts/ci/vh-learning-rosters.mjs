/** Reviewed report-delivery obligations at 5f6c2055: admission law, never imported from the producer's helpers. */
export const PUBLIC_DISCLOSURE = Object.freeze({
  en: 'This opens GitHub with your words and this screen filled in. Tap “Submit new issue” there to send it. Issues in this repository are public, so leave out anything private. A copy stays on this device.',
  ja: '報告は、アプリを直す人が読む GitHub の公開ページに、あなたの言葉とこの画面の欄を入れて開く。そこで「Submit new issue」を押すと送られる。公開されるので、個人的なことは書かない。写しはこの端末に残る。',
});
const ENGINE_CHECKS = Object.freeze([
  ' · the sheet says GitHub issues are public before anything is sent',
  " · the tap opens GitHub's new-issue page for this repository",
  ' · the issue is titled from the first line and carries the fixer label',
  ' · the body holds the marker, the words, the expectation, the version and the screen',
  ' · one saved report, named in the issue and marked as opened on GitHub',
  ' · the saved report says so and can be sent again to the same issue text',
  ' · no console errors (sent)',
  " · a long report fits GitHub's address limit and says it was shortened",
  ' · the device keeps the full words',
  ' · no console errors (long)',
  ' · GitHub is offered only after the probe confirms there is no service',
  ' · a blocked window leaves the report saved with a clear next step',
  " · the saved report's link opens the prefilled issue and records it",
  ' · My reports lists it as opened on GitHub',
  ' · no console errors (blocked window)',
  ' · Settings refuses text that is not a setup link',
  ' · pasting the setup link in Settings sets up this device',
  ' · a report from before setup whose first delivery fails stays listed, bound to the relay',
  ' · the report saved before setup is filed once GitHub answers',
  ' · with the relay set up, the sheet sends reports itself',
  '/relay-copy',
  ' · before sending, the sheet says the report and its screenshots become a public GitHub issue',
  ' · the report becomes a labelled issue, linked from the app',
  ' · the screenshot is in the issue, served by the relay',
  ' · the device stores the screenshot as bytes, not as a Blob',
  " · the fixer's status and comment appear on the report",
  ' · a reply from the app becomes an issue comment',
  ' · no console errors (relay)',
  ' · without Blob storage, the report and its screenshot are saved and filed',
  ' · no console errors (no Blob storage)',
  ' · an opened setup link changes nothing by itself: it leaves the address and waits in Settings, naming its host',
  ' · Set up is focused, one tap away',
  ' · Set up stores the opened link on the device, and the address stays clean',
  ' · Settings says reports go to GitHub automatically, with no link waiting',
  ' · no console errors (setup link)',
]);
const CHROMIUM_ONLY_CHECKS = Object.freeze([
  'chromium · Copy report text copies the same title and body',
]);
const LOCALE_CHECKS = Object.freeze([
  'pending-copy',
  'fallback-copy',
  'public-disclosure',
  'copy-page-errors',
]);
export const REPORT_LOCALES = Object.freeze(['en', 'ja']);
export const REPORT_DELIVERY_SCENARIOS = Object.freeze([
  'copy en',
  'copy ja',
  'prefilled issue',
  'long report',
  'blocked window',
  'relay',
  'no Blob storage',
  'setup link',
]);
const shown = (o) => o.visibleShown === true;
export const REPORT_COPY_CONTROL_SPECS = Object.freeze({
  'fallback-copy-empty': Object.freeze({
    kill: 'label',
    witness: (o) => o.visible === '' && shown(o),
  }),
  'fallback-copy-wrong': Object.freeze({
    kill: 'label',
    witness: (o) => o.visible === 'Wrong send label' && shown(o),
  }),
  'fallback-accessible-name-wrong': Object.freeze({
    kill: 'label',
    witness: (o, label) => o.visible === label && shown(o) && o.accessible !== label,
  }),
  'fallback-advertised-before-probe': Object.freeze({
    kill: 'delivery',
    pending: true,
    witness: (o) => o.delivery === 'github',
  }),
  'public-disclosure-removed': Object.freeze({ kill: 'disclosure', disclosure: true }),
});
export function reportDeliveryChecks(engines) {
  return engines.flatMap((engine) => [
    ...ENGINE_CHECKS.map((name) => `${engine}${name}`),
    ...(engine === 'chromium' ? CHROMIUM_ONLY_CHECKS : []),
    ...REPORT_LOCALES.flatMap((locale) => [
      ...LOCALE_CHECKS.map((name) => `${engine}/${locale}/${name}`),
      ...Object.keys(REPORT_COPY_CONTROL_SPECS).map((name) => `${engine}/${locale}/C.${name}`),
    ]),
  ]);
}
export const sendLabel = ({ locale, pending }) =>
  pending ? 'Send report' : locale === 'ja' ? '送る' : locale === 'en' ? 'Send' : null;
export function reportCopyState(observed, { locale, pending = false }) {
  const label = sendLabel({ locale, pending });
  const complete =
    typeof label === 'string' &&
    observed !== null &&
    typeof observed === 'object' &&
    typeof observed.visible === 'string' &&
    typeof observed.accessible === 'string' &&
    typeof observed.visibleShown === 'boolean' &&
    typeof observed.delivery === 'string' &&
    typeof observed.disabled === 'boolean';
  if (!complete) return { complete: false };
  return {
    complete: true,
    label:
      observed.visible === label && observed.accessible === label && observed.visibleShown === true,
    delivery: observed.delivery === (pending ? 'service' : 'github'),
    enabled: observed.disabled === false,
  };
}
export function publicDisclosureState(observed, locale) {
  const expected = Object.hasOwn(PUBLIC_DISCLOSURE, locale) ? PUBLIC_DISCLOSURE[locale] : null;
  const complete =
    typeof expected === 'string' &&
    observed !== null &&
    typeof observed === 'object' &&
    observed.expected === expected &&
    typeof observed.pass === 'boolean' &&
    typeof observed.text === 'string' &&
    observed.text.length > 0;
  return complete
    ? { complete: true, pass: observed.pass, present: observed.text.includes(expected) }
    : { complete: false };
}

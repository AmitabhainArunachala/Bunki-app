import assert from 'node:assert/strict';
export const RECORD_ROWS = Object.freeze({
  A: ['A.upgrade','A.look-up','A.known','A.finish','A.round-trip','A.page-errors'],
  A2: ['A2.later-met','A2.page-errors'],
  R: ['R.list','R.sky','R.mirror','R.reader','R.page-errors'],
  'R-cold': ['R.cold','R-cold.page-errors'], T: ['T.archive','T.page-errors'],
});
export const RECORD_CONTROLS = Object.freeze({ 'kagami-spelling-only': { case: 'R', kill: 'R.mirror' }, 'tutor-spelling-key': { case: 'T', kill: 'T.archive' } });
export function parseRecordArgs(argv) {
  const out = { only: null, control: null, controls: false };
  const seen = new Set();
  for (let i=0; i<argv.length; i++) {
    const key=argv[i];
    assert(['--only','--control','--controls'].includes(key), `unknown argument ${key}`);
    assert(!seen.has(key), `duplicate selector ${key}`); seen.add(key);
    if (key==='--controls') { out.controls=true; continue; }
    const value=argv[++i]; assert(value && !value.startsWith('--'), `${key} requires a nonempty value`);
    if(key==='--only') {
      out.only=value.split(',');
      assert(out.only.every(name=>Object.hasOwn(RECORD_ROWS,name)), 'unknown or empty case selection');
      assert(new Set(out.only).size===out.only.length, 'duplicate case selection');
    } else { assert(Object.hasOwn(RECORD_CONTROLS,value), 'unknown control'); out.control=value; }
  }
  assert(!(out.controls && (out.only || out.control)), '--controls cannot be narrowed');
  assert(!out.control || !out.only || (out.only.length===1 && out.only[0]===RECORD_CONTROLS[out.control].case), 'control requires its declared case');
  return out;
}
export function recordCompletion(rows, engines, cases=Object.keys(RECORD_ROWS)) {
  const expected=engines.flatMap(engine=>cases.flatMap(name=>RECORD_ROWS[name].map(id=>`${engine}/${id}`)));
  const ids=rows.map(row=>row.id);
  const complete=expected.length>0 && ids.length===expected.length && new Set(ids).size===ids.length && expected.every(id=>ids.includes(id));
  return { expectedRows: expected, observedRows: ids, scheduleComplete: complete, diagnosticPass: complete && rows.every(row=>row.ok===true) };
}
export function recordControlVerdict({ name, engine, candidate, mutant, restore }) {
  const spec=RECORD_CONTROLS[name];
  if(!spec) return { verdict:'incomplete', reason:'unknown control' };
  const clean=(receipt,cases)=>receipt && !receipt.terminalError && recordCompletion(receipt.rows,[engine],cases).diagnosticPass;
  if(!clean(candidate,Object.keys(RECORD_ROWS)) || !clean(restore,[spec.case])) return { verdict:'incomplete', reason:'candidate or restore not clean' };
  const completed=recordCompletion(mutant?.rows || [],[engine],[spec.case]);
  if(!completed.scheduleComplete || mutant.terminalError || mutant.control?.setupError) return {verdict:'incomplete',reason:'mutant schedule/setup failed'};
  const served=mutant.control?.served || [];
  if(!served.length || served.some(row=>row.baseSha256===row.mutantSha256 || row.applied?.length!==1)) return {verdict:'incomplete',reason:'served edit not proved'};
  const kill=`${engine}/${spec.kill}`, reds=mutant.rows.filter(row=>!row.ok);
  if(reds.length!==1 || reds[0].id!==kill) return {verdict:'contaminated',reason:'expected exact named red only'};
  const witness=reds[0].observed;
  const witnessed=name==='kagami-spelling-only' ? witness?.rowReading==='ねん' && witness?.mirror?.toshi===true
    : witness?.head?.startsWith('訳') && witness.reading==='やく' && witness.tutor===true && /STALE_WAKE_REASON/u.test(witness.page || '');
  return witnessed ? {verdict:'killed',reason:kill,witness} : {verdict:'contaminated',reason:'fault-specific witness absent'};
}
export function reportCopyObservation(observed, { locale='en', pending=false, relay=false }={}) {
  const label=pending || relay ? 'Send report' : locale==='ja' ? '送る' : 'Send';
  const delivery=pending || relay ? 'service' : 'github';
  return { label: observed.visible===label && observed.accessible===label && observed.visibleShown===true,
    delivery: observed.delivery===delivery, enabled: observed.disabled===false };
}

export function escapeObligations(rows) {
  return {
    premise: rows.length===3 && rows.every(row=>row.premise?.inside===true && row.premise.source===false && row.premise.connected===true),
    exactSource: rows.length===3 && rows.every(row=>row.back===true),
    popupAbsent: rows.length===3 && rows.every(row=>row.popupGone===true),
  };
}

// Independently reviewed full report-delivery assertion roster; do not infer from observed results.
const REPORT_ENGINE_CHECKS = [
  " · the sheet says GitHub issues are public before anything is sent",
  " · the tap opens GitHub's new-issue page for this repository",
  " · the issue is titled from the first line and carries the fixer label",
  " · the body holds the marker, the words, the expectation, the version and the screen",
  " · one saved report, named in the issue and marked as opened on GitHub",
  " · the saved report says so and can be sent again to the same issue text",
  " · no console errors (sent)",
  " · a long report fits GitHub's address limit and says it was shortened",
  " · the device keeps the full words",
  " · no console errors (long)",
  " · GitHub is offered only after the probe confirms there is no service",
  " · a blocked window leaves the report saved with a clear next step",
  " · the saved report's link opens the prefilled issue and records it",
  " · My reports lists it as opened on GitHub",
  " · no console errors (blocked window)",
  " · Settings refuses text that is not a setup link",
  " · pasting the setup link in Settings sets up this device",
  " · a report from before setup whose first delivery fails stays listed, bound to the relay",
  " · the report saved before setup is filed once GitHub answers",
  " · with the relay set up, the sheet sends reports itself",
  "/relay-copy",
  " · before sending, the sheet says the report and its screenshots become a public GitHub issue",
  " · the report becomes a labelled issue, linked from the app",
  " · the screenshot is in the issue, served by the relay",
  " · the device stores the screenshot as bytes, not as a Blob",
  " · the fixer's status and comment appear on the report",
  " · a reply from the app becomes an issue comment",
  " · no console errors (relay)",
  " · without Blob storage, the report and its screenshot are saved and filed",
  " · no console errors (no Blob storage)",
  " · an opened setup link changes nothing by itself: it leaves the address and waits in Settings, naming its host",
  " · Set up is focused, one tap away",
  " · Set up stores the opened link on the device, and the address stays clean",
  " · Settings says reports go to GitHub automatically, with no link waiting",
  " · no console errors (setup link)"
];
export const REPORT_COPY_CONTROLS = Object.freeze(['fallback-copy-empty','fallback-copy-wrong','fallback-accessible-name-wrong','fallback-advertised-before-probe','public-disclosure-removed']);
export function expectedReportChecks(engines) {
 return engines.flatMap(engine=>[...REPORT_ENGINE_CHECKS.map(name=>engine+name), ...(engine==='chromium'?['chromium · Copy report text copies the same title and body']:[]), ...['en','ja'].flatMap(locale=>[...['pending-copy','fallback-copy','public-disclosure','copy-page-errors'].map(name=>`${engine}/${locale}/${name}`),...REPORT_COPY_CONTROLS.map(name=>`${engine}/${locale}/C.${name}`)])]);
}
export function exactNamedCompletion(rows, expected, id='name', passed='pass') {
 const names=rows.map(row=>row[id]);
 return expected.length>0 && names.length===expected.length && new Set(names).size===names.length && expected.every(name=>names.includes(name)) && rows.every(row=>row[passed]===true);
}

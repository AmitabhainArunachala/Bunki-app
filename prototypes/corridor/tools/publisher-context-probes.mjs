// Diagnostic-only probes for keepSelection (corridor.js), served by verify-publisher-reading in
// KAIRO_PUBLISHER_CONTEXT_DIAGNOSTICS=1 mode. Each probe records and nothing else: no await, no branch,
// no state change. Every anchor must occur exactly once; the served source differs from the original
// only by the inserted probe text (checked by probeOnlyDiff).

const record = (id, extra = '') =>
  `(window.__ctxDiag ||= []).push({ id: ${JSON.stringify(id)}, t: performance.now(), discuss, ` +
  `serialNow: teacherContextSelectionSerial${extra ? `, ${extra}` : ''} });`;

export const PROBES = Object.freeze([
  { id: 'enter',
    from: '  const keepSelection = async (discuss, control) => {\n    const selected = selection;\n',
    insert: 'after', text: `    ${record('enter', 'selected: !!selected, pending, writable: recordWritable()')}\n` },
  { id: 'x-guard',
    from: '    if (!selected || pending || !recordWritable()) return false;\n    const epoch = recordEpoch, serial = discuss ? ++teacherContextSelectionSerial : null;\n',
    insert: 'replace',
    text: `    if (!selected || pending || !recordWritable()) { ${record('x-guard', 'selected: !!selected, pending, writable: recordWritable()')} return false; }\n` +
      `    const epoch = recordEpoch, serial = discuss ? ++teacherContextSelectionSerial : null;\n    ${record('serial', 'serial')}\n` },
  { id: 'awaits',
    from: '      const module = await ensureTeacherContextModule();\n      const context = await makeContext(selected);\n      await resolveTeacherSource(context);\n      if (!recordWritable(epoch)) return false;\n',
    insert: 'replace',
    text: `      const module = await ensureTeacherContextModule();\n      ${record('a-module', 'serial')}\n` +
      `      const context = await makeContext(selected);\n      ${record('a-context', 'serial')}\n` +
      `      await resolveTeacherSource(context);\n      ${record('a-source', 'serial')}\n` +
      `      if (!recordWritable(epoch)) { ${record('x-writable1', 'serial')} return false; }\n` },
  { id: 'x-kept',
    from: '      if (!kept || !recordWritable(epoch) || !control.isConnected) return false;\n      keptAt = selectionKey(selected);\n      if (discuss && serial === teacherContextSelectionSerial) {\n',
    insert: 'replace',
    text: `      ${record('commit', 'serial, kept')}\n` +
      `      if (!kept || !recordWritable(epoch) || !control.isConnected) { ${record('x-kept', 'serial, kept, writable: recordWritable(epoch), connected: control.isConnected')} return false; }\n` +
      `      keptAt = selectionKey(selected);\n      ${record('branch', 'serial, match: serial === teacherContextSelectionSerial')}\n` +
      `      if (discuss && serial === teacherContextSelectionSerial) {\n        ${record('nav', 'serial')}\n` },
  { id: 'else',
    from: "      } else status.textContent = tx('出典と一緒に保存した。', 'Saved with its source.');\n      return true;\n    } catch (error) {\n      if (recordReady(epoch) && section.isConnected) status.textContent = teacherSourceError(error);\n",
    insert: 'replace',
    text: `      } else { ${record('else', 'serial')} status.textContent = tx('出典と一緒に保存した。', 'Saved with its source.'); }\n` +
      `      return true;\n    } catch (error) {\n      ${record('x-catch', "serial, code: error?.code || String(error?.message || error)")}\n` +
      `      if (recordReady(epoch) && section.isConnected) status.textContent = teacherSourceError(error);\n` },
]);

export function applyProbes(source) {
  let out = source;
  const applied = [];
  for (const probe of PROBES) {
    const count = out.split(probe.from).length - 1;
    if (count !== 1) throw new Error(`probe ${probe.id}: anchor occurs ${count} times`);
    const replacement = probe.insert === 'after' ? probe.from + probe.text : probe.text;
    out = out.replace(probe.from, () => replacement);
    applied.push(probe.id);
  }
  return { source: out, applied };
}

/** True when undoing each probe's own inserted text, exactly once and in reverse order, gives back the
 * original byte for byte: the served source carries no edit beyond the probes. */
export function probeOnlyDiff(original, probed) {
  let out = probed;
  for (const probe of [...PROBES].reverse()) {
    const inserted = probe.insert === 'after' ? probe.from + probe.text : probe.text;
    if (out.split(inserted).length - 1 !== 1) return false;
    out = out.replace(inserted, () => probe.from);
  }
  return out === original;
}

// Exit-labelling mutants: each forces exactly one exit on the open path (discuss) only, so a run under it
// must name that exit. Applied to the probed source; every anchor is exact-once.
export const MUTANTS = Object.freeze({
  'x-guard': { from: '    if (!selected || pending || !recordWritable()) { (window.__ctxDiag',
    to: '    if (discuss || !selected || pending || !recordWritable()) { (window.__ctxDiag' },
  'x-catch': { from: '      if (!recordWritable(epoch)) { (window.__ctxDiag ||= []).push({ id: "x-writable1"',
    to: "      if (discuss) throw Object.assign(new Error('diag-mutant'), { code: 'diag-mutant' }); if (!recordWritable(epoch)) { (window.__ctxDiag ||= []).push({ id: \"x-writable1\"" },
  'x-kept': { from: '      if (!kept || !recordWritable(epoch) || !control.isConnected) { (window.__ctxDiag',
    to: '      if (discuss || !kept || !recordWritable(epoch) || !control.isConnected) { (window.__ctxDiag' },
  else: { from: '      if (discuss && serial === teacherContextSelectionSerial) {\n',
    to: '      if (discuss && serial === teacherContextSelectionSerial + 1) {\n' },
});

export function applyMutant(probed, name) {
  const mutant = MUTANTS[name];
  if (!mutant) throw new Error(`unknown context mutant ${name}`);
  const count = probed.split(mutant.from).length - 1;
  if (count !== 1) throw new Error(`mutant ${name}: anchor occurs ${count} times`);
  return probed.replace(mutant.from, () => mutant.to);
}

/** The keepSelection closure's own text, for the Node exit-labelling harness. */
export function keepSelectionText(source) {
  const start = source.indexOf('  const keepSelection = async (discuss, control) => {');
  const endMark = '    } finally { pending = false; refresh(); }\n  };\n';
  const end = source.indexOf(endMark, start);
  if (start < 0 || end < 0 || source.indexOf('  const keepSelection = async (discuss, control) => {', start + 1) >= 0)
    throw new Error('keepSelection must occur exactly once');
  return source.slice(start, end + endMark.length);
}

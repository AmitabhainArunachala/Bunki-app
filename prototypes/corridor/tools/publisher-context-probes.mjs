// Diagnostic-only probes for keepSelection (corridor.js), served by verify-publisher-reading in
// KAIRO_PUBLISHER_CONTEXT_DIAGNOSTICS=1 mode: diagnostic writes to window.__ctxDiag and branch
// instrumentation only — no await, no app state change (recordWritable() is a pure read). A version line
// at the top proves the probed bytes executed. Every anchor must occur exactly once; the served source
// differs from the original only by the inserted probe text (checked by probeOnlyDiff).

export const PROBE_VERSION = 'publisher-context-probes/1';
const VERSION_LINE = `window.__ctxDiagVersion = ${JSON.stringify(PROBE_VERSION)};\n`;

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

// Event-delivery probes (1830/1834, KAIRO_PUBLISHER_EVENT_DIAGNOSTICS=1, on top of the context probes): each
// build of the section, each Save/Open listener registration and the Open listener's own entry are recorded
// with the recorder's private per-node ids (window.__diagId, a WeakMap installed before the app runs), so the
// node that holds the listener can be told from a same-id node that replaced it. Diagnostic writes only.
export const EVENT_PROBE_VERSION = 'publisher-context-probes/1+events/2';
const EVENT_VERSION_LINE = `window.__ctxDiagVersion = ${JSON.stringify(EVENT_PROBE_VERSION)};\n`;
const nodeId = (name) => `(window.__diagId ? window.__diagId(${name}) : null)`;
const push = (id, fields) => `(window.__ctxDiag ||= []).push({ id: ${JSON.stringify(id)}, t: performance.now(), ${fields} });`;

export const EVENT_PROBES = Object.freeze([
  { id: 'render',
    from: "  const section = el('section', 'publisher-context-selection');\n",
    insert: 'after', text: `  ${push('render', `personal, section: ${nodeId('section')}`)}\n` },
  { id: 'reg-save',
    from: '  controls.push(keepSave); actions.append(keepSave);\n',
    insert: 'after', text: `  ${push('reg-save', `node: ${nodeId('keepSave')}, section: ${nodeId('section')}`)}\n` },
  { id: 'reg-open',
    from: "  openSaved.addEventListener('click', () => { void keepSelection(true, openSaved); });\n",
    insert: 'replace',
    text: `  ${push('reg-open', `node: ${nodeId('openSaved')}, section: ${nodeId('section')}`)}\n` +
      `  openSaved.addEventListener('click', (event) => { ${push('listener-open',
        `node: ${nodeId('openSaved')}, current: ${nodeId('event.currentTarget')}, target: ${nodeId('event.target')}, event: (window.__diagEventId ? window.__diagEventId(event) : null), trusted: event.isTrusted, phase: event.eventPhase`)} void keepSelection(true, openSaved); });\n` },
]);

const probeSets = (events) => (events ? [...PROBES, ...EVENT_PROBES] : PROBES);
const versionLine = (events) => (events ? EVENT_VERSION_LINE : VERSION_LINE);

export function applyProbes(source, { events = false } = {}) {
  let out = source;
  const applied = [];
  for (const probe of probeSets(events)) {
    const count = out.split(probe.from).length - 1;
    if (count !== 1) throw new Error(`probe ${probe.id}: anchor occurs ${count} times`);
    const replacement = probe.insert === 'after' ? probe.from + probe.text : probe.text;
    out = out.replace(probe.from, () => replacement);
    applied.push(probe.id);
  }
  if (out.includes(VERSION_LINE) || out.includes(EVENT_VERSION_LINE)) throw new Error('version witness already present');
  return { source: versionLine(events) + out, applied: ['version', ...applied] };
}

/** True when undoing the version line and then each probe's own inserted text, exactly once and in
 * reverse order, gives back the original byte for byte: the served source carries no other edit. */
export function probeOnlyDiff(original, probed, { events = false } = {}) {
  const line = versionLine(events);
  if (!probed.startsWith(line) || probed.split(line).length - 1 !== 1) return false;
  let out = probed.slice(line.length);
  for (const probe of [...probeSets(events)].reverse()) {
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

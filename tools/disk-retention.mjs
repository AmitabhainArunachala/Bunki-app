/**
 * Conservative, local gate-footprint settlement. No browser/provider interaction.
 * Keep the original snapshot object in this process: copied inventories are not
 * authority to delete files. Snapshots reject links; settlement records introduced
 * links without following them. Cleanup blocks on links; keep-all preserves them.
 * Required evidence remains link-free in both modes. All paths are root-relative.
 */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const snapshots = new WeakMap();
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
// Bounded for later native reports; pure fixtures remain only a few kilobytes.
// Oversized captured receipts or individual journal writes fail closed.
const MAX_JOURNAL_BYTES = 64 * 1024 * 1024;
const JOURNAL_PREFIX = '.gate-footprint-';
const byteSemantics = 'Logical bytes in new or changed regular payload files present at settlement before cleanup, relative to before; not cumulative OS write I/O. Current journal overhead is separate.';

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function relative(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\') ||
      path.isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..')) {
    throw fail('unsafe-relative-path', `Unsafe root-relative path: ${String(value)}`);
  }
  return value;
}

async function rootInfo(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw fail('unsafe-root');
  const absolute = path.resolve(root);
  const stat = await fs.lstat(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(absolute) !== absolute) {
    throw fail('unsafe-root', 'Root must be a real directory with no symlink ancestors');
  }
  return { root: absolute, identity: identity(stat) };
}

function identity(stat) {
  return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
}

function sameIdentity(a, b, directory = false) {
  return a && b && a.dev === b.dev && a.ino === b.ino && (directory ||
    (a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs));
}

async function checkedPath(root, rel, kind) {
  relative(rel);
  await rootInfo(root);
  let target = root;
  const segments = rel.split('/');
  for (let index = 0; index < segments.length; index++) {
    target = path.join(target, segments[index]);
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) throw fail('symlink-refused', `Symlink refused: ${rel}`);
    if (index < segments.length - 1 && !stat.isDirectory()) throw fail('unsafe-ancestor', rel);
    if (index === segments.length - 1 && kind === 'file' && !stat.isFile()) throw fail('not-regular-file', rel);
    if (index === segments.length - 1 && kind === 'directory' && !stat.isDirectory()) throw fail('not-directory', rel);
  }
  if (await fs.realpath(target) !== target) throw fail('path-escaped-root', rel);
  return target;
}

async function inspectFile(root, rel, { sync = false, capture = false } = {}) {
  const target = await checkedPath(root, rel, 'file');
  const handle = await fs.open(target, constants.O_RDONLY | NOFOLLOW);
  try {
    const first = await handle.stat();
    if (!first.isFile()) throw fail('not-regular-file', rel);
    if (capture && first.size > MAX_JOURNAL_BYTES) throw fail('receipt-too-large', rel);
    const hash = createHash('sha256');
    const chunks = [];
    const buffer = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      if (capture) chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      offset += bytesRead;
    }
    if (sync) await handle.sync();
    const last = await handle.stat();
    const onPath = await fs.lstat(await checkedPath(root, rel, 'file'));
    if (!sameIdentity(identity(first), identity(last)) || !sameIdentity(identity(last), identity(onPath))) {
      throw fail('file-changed-during-read', rel);
    }
    return {
      entry: { path: rel, size: last.size, sha256: hash.digest('hex') },
      identity: identity(last),
      ...(capture ? { text: Buffer.concat(chunks).toString('utf8') } : {}),
    };
  } finally {
    await handle.close();
  }
}

async function inspectTree(root, { allowLinks = false, allowSpecial = false, exclude = null } = {}) {
  const info = await rootInfo(root);
  const inventory = { version: 1, root: info.root, files: [], dirs: [], links: [], specialFiles: [] };
  const identities = { root: info.identity, files: new Map(), dirs: new Map(), links: new Map() };
  async function walk(dir = '') {
    const target = dir ? await checkedPath(root, dir, 'directory') : root;
    const entries = (await fs.readdir(target, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const item of entries) {
      const rel = dir ? `${dir}/${item.name}` : item.name;
      relative(rel);
      if (exclude && (rel === exclude || rel.startsWith(`${exclude}/`))) continue;
      const stat = await fs.lstat(path.join(root, rel));
      if (stat.isSymbolicLink()) {
        if (!allowLinks) throw fail('symlink-refused', `Symlink refused: ${rel}`);
        const target = await fs.readlink(path.join(root, rel));
        const after = await fs.lstat(path.join(root, rel));
        if (!sameIdentity(identity(stat), identity(after))) throw fail('link-changed-during-read', rel);
        inventory.links.push({ path: rel, size: stat.size, target });
        identities.links.set(rel, identity(after));
      } else if (stat.isDirectory()) {
        inventory.dirs.push(rel);
        identities.dirs.set(rel, identity(stat));
        await walk(rel);
      } else if (stat.isFile()) {
        const inspected = await inspectFile(root, rel);
        inventory.files.push(inspected.entry);
        identities.files.set(rel, inspected.identity);
      } else if (allowSpecial) {
        inventory.specialFiles.push({ path: rel, type: stat.isSocket() ? 'socket' : stat.isFIFO() ? 'fifo' : 'special', logicalBytes: null });
      } else {
        throw fail('special-file-refused', rel);
      }
    }
  }
  await walk();
  const end = await rootInfo(root);
  if (!sameIdentity(info.identity, end.identity, true)) throw fail('root-changed');
  inventory.files.sort((a, b) => a.path.localeCompare(b.path));
  inventory.dirs.sort();
  inventory.links.sort((a, b) => a.path.localeCompare(b.path));
  inventory.specialFiles.sort((a, b) => a.path.localeCompare(b.path));
  return { inventory, identities };
}

function freezeInventory(inventory) {
  for (const entry of [...inventory.files, ...inventory.links, ...inventory.specialFiles]) Object.freeze(entry);
  Object.freeze(inventory.files);
  Object.freeze(inventory.dirs);
  Object.freeze(inventory.links);
  Object.freeze(inventory.specialFiles);
  return Object.freeze(inventory);
}

/** Returns immutable, process-authenticated {version,root,files,dirs,links:[],specialFiles:[]}. */
export async function snapshotGate(root) {
  const inspected = await inspectTree(root);
  const inventory = freezeInventory(inspected.inventory);
  snapshots.set(inventory, inspected.identities);
  return inventory;
}

function within(rel, dir) { return rel === dir || rel.startsWith(`${dir}/`); }
function isTrace(rel) { return /^trace(?:-.*)?\.zip$/.test(path.posix.basename(rel)); }
function isProfile(rel) {
  return /^(?:profile(?:-.+)?|browser-profile|legacy-browser-profile|restored-profile)$/.test(path.posix.basename(rel));
}
function protectedPassRecord(rel) {
  // Native cache profiles legitimately contain LevelDB .log files and PNG icons.
  // Producer evidence is explicitly pinned; recognizable pass receipts also win.
  return /(?:^|[\/_.-])(?:pass(?:ed)?|receipts?|battery|attempt)(?:$|[\/_.-])/i.test(rel);
}

async function registeredProfiles(root, source, evidence) {
  const formats = new Map([
    ['assessment-app.json', ['kairo-assessment-instrumented-app-verification', 'name']],
    ['assessment-standalone.json', ['kairo-assessment-standalone-verification', 'variant']],
    ['written-section-results.json', ['kairo-public-written-section-walk', 'name']],
  ]);
  const registered = new Map();
  for (const pin of evidence) {
    const schema = formats.get(path.posix.basename(pin.path));
    if (!schema) continue;
    const inspected = await inspectFile(root, pin.path, { capture: true });
    if (inspected.entry.sha256 !== pin.sha256 || inspected.entry.size !== pin.size) throw fail('evidence-changed', pin.path);
    let receipt;
    try { receipt = JSON.parse(inspected.text); } catch { continue; }
    if (receipt?.format !== schema[0] || !Array.isArray(receipt.results) || !receipt.results.length) continue;
    const parent = path.posix.dirname(pin.path);
    for (const row of receipt.results) {
      const identifier = row?.[schema[1]];
      if (!['chromium', 'webkit'].includes(row?.engine) || typeof identifier !== 'string' || !identifier ||
          identifier.length > 240 || /[\/\\\0]/.test(identifier) || identifier.includes('..') ||
          (schema[1] === 'variant' && !['public', 'synthetic'].includes(identifier))) continue;
      const prefix = `${row.engine}-${identifier}-`;
      for (const dir of source.dirs) {
        if (path.posix.dirname(dir) !== parent) continue;
        const name = path.posix.basename(dir);
        if (name.startsWith(prefix) && /^[A-Za-z0-9]{6}$/.test(name.slice(prefix.length))) {
          registered.set(dir, { receipt: pin.path, receiptSha256: pin.sha256, prefix });
        }
      }
    }
  }
  return registered;
}

function makePlan(source, before, evidencePaths, registered) {
  const baselineFiles = new Set(before.files.map(file => file.path));
  const baselineDirs = new Set(before.dirs);
  const protectedPaths = new Set(evidencePaths);
  const files = new Map();
  const dirs = new Set();
  const skipped = [];
  const profiles = source.dirs.filter(dir => isProfile(dir) || registered.has(dir)).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  const handledProfiles = [];
  for (const dir of profiles) {
    if (handledProfiles.some(parent => within(dir, parent))) continue;
    handledProfiles.push(dir);
    const children = source.files.filter(file => within(file.path, dir));
    let reason;
    if (baselineDirs.has(dir) || children.some(file => baselineFiles.has(file.path))) reason = 'preexisting-profile';
    else if (children.some(file => protectedPaths.has(file.path) || protectedPassRecord(file.path.slice(dir.length + 1)))) reason = 'protected-evidence-in-profile';
    if (reason) { skipped.push({ path: dir, reason }); continue; }
    for (const file of children) files.set(file.path, { ...file, reason: 'scratch-profile' });
    for (const child of source.dirs) if (within(child, dir)) dirs.add(child);
  }
  for (const file of source.files.filter(file => isTrace(file.path))) {
    if (files.has(file.path) || handledProfiles.some(dir => within(file.path, dir))) continue;
    const reason = baselineFiles.has(file.path) ? 'preexisting-trace' :
      protectedPaths.has(file.path) ? 'protected-evidence' : null;
    if (reason) skipped.push({ path: file.path, reason });
    else files.set(file.path, { ...file, reason: 'passing-trace' });
  }
  return {
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    dirs: [...dirs].sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b)),
    skipped,
    registeredProfiles: [...registered].map(([path, registration]) => ({ path, ...registration })),
  };
}

async function syncDir(root, rel = '') {
  const target = rel ? await checkedPath(root, rel, 'directory') : (await rootInfo(root)).root;
  const handle = await fs.open(target, constants.O_RDONLY | NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function evidenceRecords(root, paths, source, passed) {
  if (!Array.isArray(paths)) throw fail('invalid-evidence-paths');
  if (passed && !paths.length) throw fail('missing-final-evidence');
  const lookup = new Map(source.files.map(file => [file.path, file]));
  const records = [];
  let finalBattery = false;
  for (const rel of [...new Set(paths)]) {
    relative(rel);
    const expected = lookup.get(rel);
    if (!expected) throw fail('evidence-not-regular-file', rel);
    const battery = path.posix.basename(rel) === 'battery.json';
    const inspected = await inspectFile(root, rel, { sync: true, capture: battery && passed });
    if (JSON.stringify(expected) !== JSON.stringify(inspected.entry)) throw fail('evidence-changed', rel);
    if (battery && passed) {
      let receipt;
      try { receipt = JSON.parse(inspected.text); } catch { throw fail('invalid-final-battery-receipt', rel); }
      if (receipt?.kind !== 'kairo-required-battery' || receipt.status !== 'passed' || receipt.exitCode !== 0 ||
          typeof receipt.completedAt !== 'string' || !Number.isFinite(Date.parse(receipt.completedAt)) ||
          !Array.isArray(receipt.gates) || !receipt.gates.length || receipt.gates.some(gate =>
            gate?.status !== 'passed' || gate.exitCode !== 0 || gate.processExitCode !== 0)) {
        throw fail('final-battery-receipt-not-passed', rel);
      }
      finalBattery = true;
    }
    records.push({ ...inspected.entry });
    let parent = path.posix.dirname(rel);
    while (parent !== '.') {
      await syncDir(root, parent);
      parent = path.posix.dirname(parent);
    }
  }
  await syncDir(root);
  if (passed && !finalBattery) throw fail('missing-final-battery-receipt');
  return records;
}

function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function codeOf(error) { return error?.code || error?.message || 'unknown-error'; }
function sum(inventory) { return inventory.files.reduce((total, file) => total + file.size, 0); }
function written(before, settlement) {
  const baseline = new Map(before.files.map(file => [file.path, file]));
  return settlement.files.reduce((total, file) => {
    const old = baseline.get(file.path);
    return total + (!old || old.size !== file.size || old.sha256 !== file.sha256 ? file.size : 0);
  }, 0);
}
function sameTree(first, second) {
  if (JSON.stringify(first.inventory) !== JSON.stringify(second.inventory)) return false;
  if (!sameIdentity(first.identities.root, second.identities.root, true)) return false;
  for (const [rel, id] of first.identities.files) if (!sameIdentity(id, second.identities.files.get(rel))) return false;
  for (const [rel, id] of first.identities.dirs) if (!sameIdentity(id, second.identities.dirs.get(rel), true)) return false;
  for (const [rel, id] of first.identities.links) if (!sameIdentity(id, second.identities.links.get(rel))) return false;
  return true;
}

async function writeNew(root, rel, contents) {
  if (Buffer.byteLength(contents) > MAX_JOURNAL_BYTES) throw fail('journal-size-limit');
  relative(rel);
  const parent = path.posix.dirname(rel);
  await checkedPath(root, parent, 'directory');
  const handle = await fs.open(path.join(root, rel), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
  try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
  await syncDir(root, parent);
}

function closureSummary(value) {
  if (!value || typeof value !== 'object') return { closed: false };
  try {
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded) <= 32768) return { ...JSON.parse(encoded), closed: value.closed === true };
  } catch { /* An unrecordable diagnostic never grants closure. */ }
  return { closed: false, reason: 'closure-result-not-recordable' };
}

/**
 * Cleanup requires the exact snapshot object, native passed=true, a durable final
 * battery receipt in evidencePaths, and closureCheck() => {closed:true,...}.
 * Invalid caller authority/unsafe root throws. Filesystem/receipt/closure blocks
 * produce status='blocked' and a durable journal when the root remains writable.
 * Failed attempts return status='retained' and never execute deletion operations.
 */
export async function finalizeGateFootprint({ root, before, passed, evidencePaths = [], closureCheck, retentionMode = 'cleanup' } = {}) {
  if (!['cleanup', 'keep-all'].includes(retentionMode)) throw fail('invalid-retention-mode');
  const keepAll = retentionMode === 'keep-all';
  const authority = before && snapshots.get(before);
  if (!authority) throw fail('unauthenticated-inventory', 'Use the original object returned by snapshotGate in this process');
  const info = await rootInfo(root);
  if (info.root !== before.root || !sameIdentity(authority.root, info.identity, true)) throw fail('inventory-root-mismatch');
  if (typeof passed !== 'boolean') throw fail('invalid-passed-boolean');
  const startedAt = new Date().toISOString();
  let inspected = null;
  let issue = null;
  let evidence = [];
  try {
    inspected = await inspectTree(info.root, { allowLinks: true, allowSpecial: true });
    if (passed && !keepAll && inspected.inventory.links.length) throw fail('symlink-refused');
    if (passed && inspected.inventory.specialFiles.length) throw fail('special-file-refused');
    evidence = await evidenceRecords(info.root, evidencePaths, inspected.inventory, passed);
  } catch (error) { issue = codeOf(error); }
  const originalInventory = inspected?.inventory ?? null;
  const originalLinkIdentities = inspected?.identities.links ?? new Map();
  const emptyPlan = { files: [], dirs: [], skipped: [], registeredProfiles: [] };
  let plan = emptyPlan;
  if (passed && !issue && !keepAll) {
    try {
      const registered = await registeredProfiles(info.root, inspected.inventory, evidence);
      plan = makePlan(inspected.inventory, before, evidence.map(file => file.path), registered);
    } catch (error) { issue = codeOf(error); }
  }
  await rootInfo(info.root);
  const journalAbsolute = await fs.mkdtemp(path.join(info.root, JOURNAL_PREFIX));
  const journal = path.basename(journalAbsolute);
  await syncDir(info.root);
  const ledgerPath = path.join(journalAbsolute, 'ledger.json');
  const writeAhead = {
    version: 1, root: info.root, startedAt, passed, retentionMode, initialBlock: issue,
    inventory: inspected?.inventory ?? null,
    evidenceBefore: evidence,
    deletionPlan: plan,
    rules: { existingPathsPreserved: true, symlinksFollowed: false, finalReceiptRequired: 'battery.json', closureRequired: true },
  };
  await writeNew(info.root, `${journal}/plan.json`, json(writeAhead));
  await writeNew(info.root, `${journal}/operations.jsonl`, '');
  const removedFiles = [];
  const removedDirs = [];
  let closure = { closed: false, reason: passed ? 'not-checked' : 'failed-attempt-retained' };
  async function event(record) {
    const rel = `${journal}/operations.jsonl`;
    const target = await checkedPath(info.root, rel, 'file');
    const handle = await fs.open(target, constants.O_WRONLY | constants.O_APPEND | NOFOLLOW);
    try { await handle.writeFile(`${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`); await handle.sync(); }
    finally { await handle.close(); }
  }
  if (passed && !issue) {
    try {
      if (typeof closureCheck !== 'function') throw fail('missing-closure-check');
      closure = closureSummary(await closureCheck());
      await event({ action: 'closure-check', result: closure });
      const checkpoint = await inspectTree(info.root, { allowLinks: true, allowSpecial: true, exclude: journal });
      if (!sameTree(inspected, checkpoint)) {
        inspected = checkpoint; // Report actual settlement bytes; no deletion has occurred.
        throw fail('gate-content-changed-before-cleanup');
      }
      if (closure.closed !== true) throw fail('gate-not-closed');
      if (!keepAll) {
        for (const file of plan.files) {
          const current = await inspectFile(info.root, file.path);
          if (current.entry.sha256 !== file.sha256 || current.entry.size !== file.size ||
              !sameIdentity(inspected.identities.files.get(file.path), current.identity)) throw fail('planned-file-changed', file.path);
          await event({ action: 'before-unlink', path: file.path, size: file.size, sha256: file.sha256 });
          const checked = await checkedPath(info.root, file.path, 'file');
          if (!sameIdentity(current.identity, identity(await fs.lstat(checked)))) throw fail('planned-file-changed', file.path);
          await fs.unlink(checked);
          removedFiles.push({ path: file.path, size: file.size, sha256: file.sha256 });
          await event({ action: 'unlinked', path: file.path, size: file.size });
        }
        for (const dir of plan.dirs) {
          const target = await checkedPath(info.root, dir, 'directory');
          if (!sameIdentity(inspected.identities.dirs.get(dir), identity(await fs.lstat(target)), true)) throw fail('planned-directory-changed', dir);
          if ((await fs.readdir(target)).length) throw fail('planned-directory-not-empty', dir);
          await event({ action: 'before-rmdir', path: dir });
          await checkedPath(info.root, dir, 'directory');
          await fs.rmdir(target);
          removedDirs.push(dir);
          await event({ action: 'removed-directory', path: dir });
        }
        // Persist directory-entry removals before the final ledger reports them.
        const touched = new Set(['']);
        for (const entry of [...removedFiles.map(file => file.path), ...removedDirs]) {
          let parent = path.posix.dirname(entry);
          while (parent !== '.') {
            if (!removedDirs.includes(parent)) touched.add(parent);
            parent = path.posix.dirname(parent);
          }
        }
        for (const dir of touched) await syncDir(info.root, dir);
      }
    } catch (error) {
      issue = codeOf(error);
      await event({ action: 'blocked', reason: issue }).catch(() => {});
    }
  }
  let after = null;
  try { after = await inspectTree(info.root, { allowLinks: true, allowSpecial: true, exclude: journal }); }
  catch (error) { issue ??= codeOf(error); }
  const afterByPath = new Map(after?.inventory.files.map(file => [file.path, file]) ?? []);
  const evidenceHashes = evidence.map(file => ({
    path: file.path,
    before: { size: file.size, sha256: file.sha256 },
    after: afterByPath.has(file.path) ? { size: afterByPath.get(file.path).size, sha256: afterByPath.get(file.path).sha256 } : null,
  }));
  if (evidenceHashes.some(file => !file.after || file.before.size !== file.after.size || file.before.sha256 !== file.after.sha256)) issue ??= 'protected-evidence-changed';
  if (passed && !keepAll && after?.inventory.links.length) issue ??= 'symlink-refused';
  if (passed && after?.inventory.specialFiles.length) issue ??= 'special-file-refused';
  const removedPaths = new Set(removedFiles.map(file => file.path));
  const originalPaths = new Set(originalInventory?.files.map(file => file.path) ?? []);
  const retainedOriginal = originalInventory?.files.filter(file => !removedPaths.has(file.path)) ?? [];
  const mismatches = retainedOriginal.filter(file => {
    const current = afterByPath.get(file.path);
    return !current || current.size !== file.size || current.sha256 !== file.sha256;
  }).map(file => ({ path: file.path, before: { size: file.size, sha256: file.sha256 }, after: afterByPath.get(file.path) ?? null }));
  const unexpectedFiles = after?.inventory.files.filter(file => !originalPaths.has(file.path)).map(file => file.path) ?? [];
  const payloadIntegrity = {
    verified: originalInventory && after ? mismatches.length === 0 && unexpectedFiles.length === 0 : null,
    retainedFileCount: retainedOriginal.length, mismatches, unexpectedFiles,
  };
  if (payloadIntegrity.verified === false) issue ??= 'retained-payload-changed';
  const linksBefore = originalInventory?.links ?? [];
  const linksAfter = after?.inventory.links ?? [];
  const linkIntegrity = {
    verified: originalInventory && after ? JSON.stringify(linksBefore) === JSON.stringify(linksAfter)
      && linksBefore.every(link => sameIdentity(originalLinkIdentities.get(link.path), after.identities.links.get(link.path))) : null,
    before: linksBefore, after: linksAfter,
  };
  if (keepAll && passed && linkIntegrity.verified === false) issue ??= 'retained-symlink-changed';

  const confirmedRemovedBytes = removedFiles.reduce((total, file) => total + file.size, 0);
  const payloadBefore = inspected ? sum(inspected.inventory) : null;
  const payloadAfter = after ? sum(after.inventory) : null;
  const measuredRemoval = payloadBefore !== null && payloadAfter !== null ? payloadBefore - payloadAfter : null;
  if (measuredRemoval !== null && measuredRemoval !== confirmedRemovedBytes) issue ??= 'unaccounted-payload-change';
  const ledger = {
    version: 1, status: issue ? 'blocked' : passed && !keepAll ? 'cleaned' : 'retained',
    reason: issue ?? (passed ? keepAll ? 'keep-all-policy' : 'validated-passing-gate' : 'failed-attempt-retained'),
    retentionMode,
    root: info.root, passed, startedAt, settledAt: new Date().toISOString(), closure,
    journalPath: journalAbsolute, ledgerPath,
    inventoryPath: path.join(journalAbsolute, 'plan.json'), operationsPath: path.join(journalAbsolute, 'operations.jsonl'),
    bytesWritten: inspected ? written(before, inspected.inventory) : null,
    bytesWrittenSemantics: byteSemantics,
    bytesBeforeCleanup: payloadBefore,
    bytesKept: payloadAfter,
    bytesKeptSemantics: 'Final logical regular-file payload bytes under root; current journal overhead is separate; symlink targets are never counted or followed.',
    bytesRemoved: measuredRemoval === confirmedRemovedBytes ? measuredRemoval : null,
    confirmedRemovedBytes,
    plannedRemovalBytes: plan.files.reduce((total, file) => total + file.size, 0),
    journalOverheadBytes: 0, totalBytesKept: null,
    evidence: evidenceHashes, payloadIntegrity, linkIntegrity, removedFiles, removedDirs, keptCandidates: plan.skipped,
    symlinks: after?.inventory.links ?? inspected?.inventory.links ?? [],
    unmeasuredPaths: after?.inventory.specialFiles ?? inspected?.inventory.specialFiles ?? [],
  };
  const overhead = (await fs.stat(path.join(journalAbsolute, 'plan.json'))).size + (await fs.stat(path.join(journalAbsolute, 'operations.jsonl'))).size;
  let encoded;
  for (let index = 0; index < 16; index++) {
    encoded = json(ledger);
    const next = overhead + Buffer.byteLength(encoded);
    if (next === ledger.journalOverheadBytes) break;
    ledger.journalOverheadBytes = next;
    ledger.totalBytesKept = payloadAfter === null ? null : payloadAfter + next;
  }
  encoded = json(ledger);
  if (overhead + Buffer.byteLength(encoded) !== ledger.journalOverheadBytes) throw fail('ledger-size-did-not-converge');
  const temporary = `${journal}/ledger-${randomUUID()}.tmp`;
  await writeNew(info.root, temporary, encoded);
  await fs.rename(path.join(info.root, temporary), ledgerPath);
  await syncDir(info.root, journal);
  return ledger;
}

/**
 * B2a-hint (D4, first slice): a window that lost the boot race LOOKS at the record lock
 * (navigator.locks.query) and offers a retry when it looks free. It never requests the lock; only
 * the unchanged boot ifAvailable request acquires. Design: B2-handoff-protocol v5 with the
 * B2-CODEX-SIGNATURE-v5 amendments; this rewrite answers B2-TEST-REVIEW-r1, B2-LIFECYCLE-REVIEW-r1/r2,
 * B2-ROUTE-REVIEW-r1 and B2-MUTANT-REVIEW-r2. D4's remote hand-off (B2c) and in-place acquisition
 * (B2b) stay open; this suite claims neither. Engine scope: Chromium only; WebKit is not covered.
 *
 * IDENTITY (W0, before any case). The base artifact is selected and verified by
 * resolveCorridorSite() inside the terminal lifecycle. A release run serves it and requires the
 * served build-identity.json and corridor.js to be those verified bytes, with no mutation marker.
 * A mutant is accepted ONLY through KAIRO_TEST_MUTANT_DIR + KAIRO_TEST_MUTANT_SHA256: its
 * `kairo-test-mutation` record is recomputed from the verified base and its literal edits
 * (make-corridor-mutant.mjs verifyTestMutant), pinned, hashed file by file and served; W0 then
 * shows the explicit mutant identity and never calls those bytes a clean build. Every corridor.js
 * response used by an observed app document is bound by role/navigation/docId and hashed (auto row
 * `<case>.served-script-identity`); any missing/unreadable required response is inconclusive. Service workers are blocked in every context, base and mutant
 * alike, so each load is the host's verified bytes (the worker would install for the base and
 * refuse the mutant, a difference other than the mutation).
 *
 * ONE ORDERED INIT. Each app page gets exactly one init script (installRecordHintProbe) carrying its
 * role and scenario flags and all instrumentation, in a fixed order; there are no context-level
 * probe scripts and no sessionStorage flag hand-off. It runs only on the app origin's top document.
 * silenceBrowserAudio's separate context script touches only media/speech prototypes, so its
 * relative order is immaterial. Each injection counts its firing and the cases assert those counts.
 * Scenario controls that change after boot (defer, transform, hidden, session refusal, the clock)
 * live on the documented mutable `window.__hintProbe.control`.
 *
 * AUTHORITY ORACLE. The probe records every navigator.locks.request with its name, options and
 * whether native granted it. The boot request is the first request named RECORD_LOCK, made before
 * any query, exactly {mode:'exclusive', ifAvailable:true}; every other RECORD_LOCK request is an
 * observer acquisition attempt and must number zero. Client identities come from a raw self-lock
 * query and must be non-empty. Ownership = the page's boot was granted AND the exact-name held list
 * is exactly its client id; "blocked" = its boot was refused and its id is not held (being QUEUED is
 * an observer acquisition attempt, asserted by its own rows).
 * Where the protocol says "writable", the page also grades a card and the grade is read back from
 * the native store. Store-alert text is never used as an ownership or writability oracle. (A
 * granted boot is the only place the app sets recordOwner, so a refused boot also means
 * recordOwner/recordRecovered/recordApp were never set in that document.)
 *
 * CASES (rows are named `<case>.<assertion>`; every declared row that is not evaluated is
 * `unreached`, which fails a run; `unavailable` is a distinct status, never counted as passed):
 *   W1  owner closes → offer ≤ 4 s; before the tap one boot request, zero observer attempts, never
 *       queued or held (m2's held interval captured through its gate); tap → new document, named
 *       owner, revlog/srs exactly the owner's acknowledged ones, then a durable grade.
 *   W2  the owner reloads 20 times beside a visible blocked window: named owner after every reload.
 *   W3  two blocked windows tap together: exactly one named owner, the other refused and looking
 *       again; persisted history equals the single-window one; the winner writes.
 *   W4  renderer crash: unavailable in this suite (not exercised, not passed).
 *   W5  the owner navigates away → offer; Back: a fresh document re-acquires and the offer
 *       withdraws, or a bfcache restore stays departed (whichever the engine produced; the other
 *       branch is recorded unavailable).
 *   W6a durable ACK read natively (row + card identity captured) → close → retry → exactly that row
 *       and card, then a write.
 *   W6b grade tap racing the close (a race, not a held commit): the settled native store holds
 *       either no change or one coherent row for the tapped card; B's boot preserves it exactly.
 *   W7a a note draft edited just before the tap survives the retry.
 *   W7b session storage refused at the tap: no reload, a role=alert reason, the text intact.
 *   W7c reader passage X: a genuine free offer, another client takes the real lock, the real retry
 *       boots and loses on X (exact passage id), then a second genuine retry owns and is on X.
 *   W7d route validation through real owner reloads: a valid reader route restores and is spent;
 *       malformed, wrong-version, expired, future, non-finite, over-long, bad-character and
 *       unknown-view records land on the front door and are deleted; an unknown attempt lands in the
 *       room; ten restores leave the learner and assessment roots unchanged. Assessment result/item
 *       targets, kept targets and deliberate navigation: verify-assessment-app.mjs retry-route-*.
 *   W8  no locks.query: no offer, no hint timer or channel, the manual reload remains.
 *   W9  hidden: no looks; visible again: the offer arrives.
 *   L1  a deferred FREE look in flight across hide, and across pagehide, then resolved: nothing
 *       published; the same deferred free look resolved while visible does publish (control).
 *   L2  hidden→visible ABA: an old free look resolved after another client took the lock does not
 *       publish and at most one look is out; an old look rejected after the return does not stop
 *       the new period.
 *   L3  a visible offer retires when a crossing beacon makes the window stale; no looks while stale;
 *       an abort resumes; a pre-crossing free look landing after the abort does not publish.
 *   L4  focus inside the window does not extend it: past ten minutes (controlled clock) looking stops,
 *       focus does not restart it, a real hidden→visible return does.
 *   L5  a focus/advisory burst: bounded look starts, at most one wake timer, one look in flight.
 *   L6  a failing look: exactly one failed look, none later, no offer, manual reload, no unhandled
 *       rejection.
 *   L7  locks.query getter throws / bind throws: no hint, no timer, the manual reload remains.
 *   L8  pending-only (real pending request, named held row hidden by the probe) → no offer, with a
 *       matching positive; unrelated and prefix-sharing names held/pending → offer.
 *   L9  a free offer, then a never-settling look carried past the deadline by the controlled clock
 *       alone: offer hidden, channel closed, no overlapping look; resolving or rejecting the old
 *       look (separate windows) revives nothing.
 *   L10 a query that throws synchronously: no unhandled rejection or page error, the hint retires,
 *       the manual reload remains, zero record requests beyond the boot.
 *
 * CONTROLLED CLOCK (L4, L9). With flags.clock the probe offsets performance.now (the app's hintNow)
 * and advances only the hint's own timers — those set directly by wakeRecordHint or
 * armRecordHintDeadline, identified by their immediate caller frame — when the offset passes their
 * due time. corridor.js is not changed; other app timers keep real time.
 *
 * MUTATION CONTROLS: record-hint-mutants.mjs (m0–m13 with their named rows) and
 * adjudicate-record-hint-mutants.mjs, whose kill needs a passed baseline, valid mutation provenance,
 * a passed setup and the named rows evaluated and failed. Nothing here is a kill by itself.
 *
 * RECEIPT: <evidence>/record-hint.json, rewritten as `incomplete` before setup (a stale pass cannot
 * survive a crashed rerun) and after every case: artifact identity (base and mutant), verifier and
 * support hashes, browser version, selection, required and omitted rows, counts, bounded cleanup.
 * A watchdog writes `incomplete` if no terminal outcome arrives. Evidence-directory resolution and
 * imports stay process-level failures that cannot always emit JSON.
 *
 * Environment: KAIRO_SITE_DIR / KAIRO_ARTIFACT_SHA256 (base, as resolveCorridorSite reads them),
 * KAIRO_TEST_MUTANT_DIR + KAIRO_TEST_MUTANT_SHA256 (explicit mutant), KAIRO_RECORD_HINT_ONLY
 * (comma-separated cases; a partial run can never be an adjudicated baseline),
 * KAIRO_RECORD_HINT_DEADLINE_MS (watchdog, default 30 min).
 * Visibility is emulated by the probe; this tests the app's logic, not an engine's tab throttling.
 *
 * Usage: node verify-record-hint.mjs
 */

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { chromium } from 'playwright-core';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { MUTANT_PRODUCT, MUTATION_FORMAT, verifyTestMutant } from './make-corridor-mutant.mjs';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
import { RECORD_HINT_CASE_SCHEMA, RECORD_HINT_HARNESS_PATHS, RECORD_HINT_AUTO_ROWS } from './record-hint-mutants.mjs';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SELF = fileURLToPath(import.meta.url);
const TOOLS = dirname(SELF);
const REPO = resolve(TOOLS, '../../..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value);
const same = (a, b) => isDeepStrictEqual(a, b);
const sorted = (values) => [...values].sort();

const RECORD_LOCK = 'kairo-record:kairo-corridor-v1:kairo-ai-log';
const STORE_KEY = 'kairo-corridor-v1';
const BINDING_KEY = 'kairo-local-record-binding-v1';
const CROSSING_KEY = 'kairo-crossing-v1';
const HINT_CHANNEL = 'kairo-record-hint-v1';
const ROUTE_KEY = 'kairo-retry-route-v1';
const HINT_WINDOW_MS = 10 * 60_000;
const OFFER_MS = 4000;
// the served source must still carry what this suite reaches for, or its assertions go vacuous
const SOURCE_ANCHORS = [
  `const RECORD_LOCK = '${RECORD_LOCK}';`, `const STORE_KEY = '${STORE_KEY}';`, `const CROSSING_KEY = '${CROSSING_KEY}';`,
  `const RECORD_HINT_CHANNEL = '${HINT_CHANNEL}';`, 'const RECORD_HINT_WINDOW_MS = 10 * 60_000;', `'${BINDING_KEY}'`,
  'function wakeRecordHint(delay) {', 'function armRecordHintDeadline() {', "retry.id = 'record-hint-retry';",
  `const RECORD_RETRY_ROUTE_KEY = '${ROUTE_KEY}';`, 'const RECORD_RETRY_ROUTE_TTL_MS = 120_000;',
];
const DEADLINE_MS = Number(process.env.KAIRO_RECORD_HINT_DEADLINE_MS || 30 * 60_000);

/* ------------------------------------------------------------------ receipt */

const EVIDENCE = resolveCorridorEvidence();
const RECEIPT_PATH = join(EVIDENCE, 'record-hint.json');
const fileSha = (path) => { try { return sha256(readFileSync(path)); } catch { return null; } };
const receipt = {
  format: 'kairo-record-hint-verification', v: 3, runId: randomUUID(), status: 'incomplete',
  startedAt: new Date().toISOString(), finishedAt: null,
  verifier: { path: 'prototypes/corridor/tools/verify-record-hint.mjs', sha256: fileSha(SELF),
    support: Object.fromEntries(RECORD_HINT_HARNESS_PATHS.map((path) => [path, fileSha(join(REPO, path))])) },
  setup: { status: 'pending', error: null },
  artifact: { kind: null, base: null, mutant: null, served: null },
  browser: null,
  environment: { node: process.versions.node, platform: process.platform, arch: process.arch, engine: 'chromium', serviceWorkers: 'blocked in every context', visibility: 'emulated by the probe',
    webkit: 'not covered', clock: 'L4/L9 advance only the hint timers and the hint clock' },
  selection: null,
  cases: { required: [], omitted: [] },
  coveragePending: ['assessment retry item/removed/inaccessible/protected-answer matrix and native no-write proof; no assessment receipt is consumed here'],
  counts: null,
  results: [],
  cleanup: [],
};
const results = receipt.results;
function writeReceipt() {
  const temporary = `${RECEIPT_PATH}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`);
  renameSync(temporary, RECEIPT_PATH);
}
function record(caseId, id, status, detail = '', evidence = null) {
  results.push({ id, case: caseId, status, detail: String(detail).slice(0, 4000), ...(evidence ? { evidence } : {}) });
  const mark = { passed: 'ok  ', failed: 'FAIL', unreached: 'SKIP', unavailable: 'N/A ', inconclusive: 'INC ' }[status] || status;
  console.log(`  ${mark} ${id}${detail ? `  — ${String(detail).slice(0, 300)}` : ''}`);
}
let finished = false;
function finish(forced = null, reason = null) {
  if (finished) return receipt.status === 'passed' ? 0 : 1;
  finished = true;
  const required = results.filter((row) => row.status !== 'unavailable');
  const count = (status) => required.filter((row) => row.status === status).length;
  receipt.cases.required = required.map((row) => row.id);
  receipt.cases.omitted = [
    ...results.filter((row) => row.status === 'unavailable').map((row) => ({ id: row.id, reason: row.detail })),
    ...(receipt.selection?.unselected || []).map((id) => ({ id, reason: 'case not selected (KAIRO_RECORD_HINT_ONLY)' })),
  ];
  receipt.counts = { required: required.length, passed: count('passed'), failed: count('failed'), unreached: count('unreached'), inconclusive: count('inconclusive'),
    unavailable: results.length - required.length };
  const cleanupTimedOut = receipt.cleanup.some((row) => row.outcome === 'timeout');
  const cleanupFailed = receipt.cleanup.some((row) => row.outcome !== 'closed');
  receipt.status = forced ?? (receipt.setup.status !== 'passed' ? 'failed'
    : cleanupTimedOut ? 'incomplete'
      : required.length && count('passed') === required.length && !cleanupFailed ? 'passed' : 'failed');
  if (reason) receipt.terminalReason = reason;
  receipt.finishedAt = new Date().toISOString();
  writeReceipt();
  console.log(`\n${receipt.status.toUpperCase()} · ${receipt.counts.passed}/${receipt.counts.required} required rows passed · `
    + `${receipt.counts.unavailable} unavailable (not counted) · ${RECEIPT_PATH}`);
  return receipt.status === 'passed' ? 0 : 1;
}
async function bounded(label, action, ms) {
  let timer;
  try {
    const outcome = await Promise.race([
      Promise.resolve().then(action).then(() => 'closed', (error) => `error: ${error?.message || error}`),
      new Promise((done) => { timer = setTimeout(() => done('timeout'), ms); }),
    ]);
    return { label, outcome };
  } finally { clearTimeout(timer); }
}

/* ------------------------------------------------------------------ the probe (runs in the page) */

// Installed by page.addInitScript(installRecordHintProbe, config): self-contained, serialized.
function installRecordHintProbe(config) {
  if (location.origin !== config.origin || window.top !== window || Object.hasOwn(window, '__hintProbe')) return;
  const flags = config.flags || {};
  const nativeNow = performance.now.bind(performance);
  const nativeSetTimeout = window.setTimeout;
  const nativeClearTimeout = window.clearTimeout;
  const NativeChannel = window.BroadcastChannel;
  const probe = {
    docId: crypto.randomUUID(), role: config.role, flags,
    fired: { seed: 0, queryAbsentReads: 0, queryGetterThrows: 0, queryBindThrows: 0, querySyncThrows: 0, queryFailures: 0,
      deferred: 0, transformed: 0, sessionRefused: 0, clockAdvances: 0, wakeTimerSets: 0, deadlineTimerSets: 0 },
    requests: [], queries: [], queryStarts: 0, inFlight: 0, maxInFlight: 0,
    timers: new Map(), maxWakeTimers: 0, channels: [], unhandled: [], advisory: null,
    control: { defer: false, transform: null, fail: flags.queryFail === 'always' ? 'always' : 'none', hidden: false,
      refuseSession: false, clockOffsetMs: 0 },
    gate: { entered: 0, holding: 0, released: 0, waiters: [] }, crossingEvents: [],
    raw: { setTimeout: (handler, ms) => Reflect.apply(nativeSetTimeout, window, [handler, ms]) },
  };
  Object.defineProperty(window, '__hintProbe', { value: probe });
  addEventListener('storage', (event) => {
    if (event.key === config.crossingKey) probe.crossingEvents.push(event.newValue);
  });
  addEventListener('unhandledrejection', (event) => {
    if (probe.unhandled.length < 50) probe.unhandled.push(String(event.reason?.message ?? event.reason));
  });

  // 1. seed: a first-install v1 legacy record (a legitimate migration input), only on a fresh origin
  if (config.seed && localStorage.getItem(config.storeKey) === null && localStorage.getItem(config.bindingKey) === null) {
    const t = 1700000000000;
    localStorage.setItem(config.storeKey, JSON.stringify({ v: 1,
      taken: [{ t: 'word', id: '会う', label: '会う', ts: t, started: t }, { t: 'word', id: '青', label: '青', ts: t + 1, started: t + 1 }],
      srs: {}, revlog: [], obslog: [] }));
    probe.fired.seed = 1;
  }

  // 2. the controlled clock: performance.now (the app's hintNow) plus an offset that only grows
  if (flags.clock) {
    Object.defineProperty(performance, 'now', { configurable: true, writable: true,
      value: function now() { return nativeNow() + probe.control.clockOffsetMs; } });
  }

  // 3. the hint's two timer sites, by their immediate caller frame; tracked, and advanced with the clock
  if (flags.clock || flags.traceTimers) {
    const SITE = /^\s*at (wakeRecordHint|armRecordHintDeadline) \(/;
    const run = (timer) => {
      if (timer.done) return;
      timer.done = true;
      probe.timers.delete(timer.id);
      nativeClearTimeout(timer.real);
      if (typeof timer.handler === 'function') timer.handler(...timer.args);
    };
    window.setTimeout = function setTimeout(handler, ms, ...args) {
      const site = SITE.exec((new Error().stack || '').split('\n')[2] || '')?.[1];
      if (!site) return Reflect.apply(nativeSetTimeout, window, [handler, ms, ...args]);
      const delay = Math.max(0, Number(ms) || 0);
      const timer = { site, handler, args, due: performance.now() + delay, done: false, id: 0, real: 0 };
      timer.real = Reflect.apply(nativeSetTimeout, window, [() => run(timer), delay]);
      timer.id = timer.real;
      probe.timers.set(timer.id, timer);
      probe.fired[site === 'wakeRecordHint' ? 'wakeTimerSets' : 'deadlineTimerSets'] += 1;
      probe.maxWakeTimers = Math.max(probe.maxWakeTimers, [...probe.timers.values()].filter((row) => row.site === 'wakeRecordHint').length);
      return timer.id;
    };
    window.clearTimeout = function clearTimeout(id) {
      const timer = probe.timers.get(id);
      if (timer) { timer.done = true; probe.timers.delete(id); }
      return Reflect.apply(nativeClearTimeout, window, [id]);
    };
    probe.advanceClock = (delta) => {
      if (!flags.clock || !Number.isFinite(delta) || delta <= 0) throw new Error('probe: the clock only moves forward, and only when installed');
      probe.control.clockOffsetMs += delta;
      probe.fired.clockAdvances += 1;
      const now = performance.now();
      const due = [...probe.timers.values()].filter((timer) => timer.due <= now).sort((a, b) => a.due - b.due);
      for (const timer of due) {
        nativeClearTimeout(timer.real);
        Reflect.apply(nativeSetTimeout, window, [() => run(timer), 0]);
      }
      return due.map((timer) => timer.site);
    };
  }

  // 4. channel custody: which record-hint channels are open, observed rather than inferred
  if (NativeChannel) {
    const rows = new WeakMap();
    window.BroadcastChannel = class BroadcastChannel extends NativeChannel {
      constructor(name) {
        super(name);
        const row = { name: String(name), closed: false };
        probe.channels.push(row);
        rows.set(this, row);
      }
      close() {
        const row = rows.get(this);
        if (row) row.closed = true;
        return super.close();
      }
    };
    probe.postAdvisory = (count = 1) => {
      probe.advisory ||= new NativeChannel(config.channel);
      for (let i = 0; i < count; i += 1) probe.advisory.postMessage({ v: 1, type: 'released' });
      return count;
    };
  }

  // 5. the m2 mutant's started/held/released handshake; production never calls it
  Object.defineProperty(window, '__recordHintMutantGate', { value: Object.freeze({
    enter: () => {
      probe.gate.entered += 1;
      probe.gate.holding += 1;
      return new Promise((release) => probe.gate.waiters.push(release));
    },
  }) });
  probe.releaseGate = () => {
    const waiters = probe.gate.waiters.splice(0);
    probe.gate.holding -= waiters.length;
    probe.gate.released += waiters.length;
    waiters.forEach((release) => release());
    return waiters.length;
  };

  // 6. the lock manager: every request (name, options, native grant); the page's query per scenario
  const locks = navigator.locks;
  if (locks) {
    const rawRequest = locks.request.bind(locks);
    const rawQuery = locks.query.bind(locks);
    probe.raw.request = rawRequest;
    probe.raw.query = rawQuery;
    Object.defineProperty(locks, 'request', { configurable: true, writable: true, value: function request(name, ...rest) {
      const options = rest.length > 1 && rest[0] !== null && typeof rest[0] === 'object' ? rest[0] : {};
      const entry = { name: String(name), mode: options.mode === undefined ? 'exclusive' : String(options.mode),
        ifAvailable: options.ifAvailable === true, steal: options.steal === true, signal: options.signal !== undefined,
        at: nativeNow(), queriesBefore: probe.queryStarts, granted: null };
      probe.requests.push(entry);
      const callback = rest[rest.length - 1];
      if (typeof callback === 'function') {
        rest[rest.length - 1] = function granted(lock) {
          entry.granted = lock !== null && lock !== undefined;
          return callback.call(this, lock);
        };
      }
      return rawRequest(name, ...rest);
    } });
    const named = (rows) => rows.filter((row) => row?.name === config.lock).length;
    const probeQuery = function query() {
      const entry = { n: probe.queryStarts + 1, at: nativeNow(), deferred: false, free: null, nativeFree: null,
        viewNamedHeld: null, viewNamedPending: null, settled: null };
      probe.queryStarts = entry.n;
      probe.queries.push(entry);
      if (probe.queries.length > 400) probe.queries.shift();
      probe.inFlight += 1;
      probe.maxInFlight = Math.max(probe.maxInFlight, probe.inFlight);
      let pending;
      if (probe.control.fail === 'always') {
        probe.fired.queryFailures += 1;
        pending = Promise.reject(new DOMException('probe: query refused', 'InvalidStateError'));
      } else {
        pending = rawQuery().then((snapshot) => {
          let view = snapshot;
          if (probe.control.transform === 'hide-named-held') {
            probe.fired.transformed += 1;
            view = { held: snapshot.held.filter((row) => row.name !== config.lock), pending: snapshot.pending };
          }
          entry.nativeFree = named(snapshot.held) === 0 && named(snapshot.pending) === 0;
          entry.viewNamedHeld = named(view.held);
          entry.viewNamedPending = named(view.pending);
          entry.free = entry.viewNamedHeld === 0 && entry.viewNamedPending === 0;
          if (!probe.control.defer) return view;
          probe.fired.deferred += 1;
          return new Promise((release, fail) => {
            entry.release = () => release(view);
            entry.fail = () => fail(new DOMException('probe: deferred query refused', 'AbortError'));
            entry.deferred = true;
          });
        });
      }
      return pending.then(
        (value) => { entry.settled = 'resolved'; probe.inFlight -= 1; return value; },
        (error) => { entry.settled = 'rejected'; probe.inFlight -= 1; throw error; },
      );
    };
    const variant = flags.query || 'native';
    if (variant === 'native') Object.defineProperty(locks, 'query', { configurable: true, writable: true, value: probeQuery });
    else if (variant === 'absent') {
      Object.defineProperty(locks, 'query', { configurable: true, get() { probe.fired.queryAbsentReads += 1; return undefined; } });
    } else if (variant === 'getter-throws') {
      Object.defineProperty(locks, 'query', { configurable: true, get() { probe.fired.queryGetterThrows += 1; throw new Error('probe: query getter refused'); } });
    } else if (variant === 'bind-throws') {
      const query = function query() { return probeQuery(); };
      Object.defineProperty(query, 'bind', { value() { probe.fired.queryBindThrows += 1; throw new Error('probe: query bind refused'); } });
      Object.defineProperty(locks, 'query', { configurable: true, writable: true, value: query });
    } else if (variant === 'sync-throws') {
      Object.defineProperty(locks, 'query', { configurable: true, writable: true,
        value: function query() { probe.fired.querySyncThrows += 1; throw new Error('probe: query threw synchronously'); } });
    } else throw new Error(`probe: unknown query variant ${variant}`);
  }

  // 7. visibility, emulated: 'visible' unless the harness hides this document
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return probe.control.hidden ? 'hidden' : 'visible'; } });
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return probe.control.hidden; } });
  probe.setHidden = (hidden) => {
    probe.control.hidden = !!hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  // 8. session storage refusal, installed only where a case asks for it
  if (flags.sessionRefusal) {
    for (const method of ['setItem', 'removeItem']) {
      const native = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (probe.control.refuseSession && this === window.sessionStorage) {
          probe.fired.sessionRefused += 1;
          throw new DOMException('probe: refused', 'QuotaExceededError');
        }
        return Reflect.apply(native, this, args);
      };
    }
  }

  // 9. reading helpers for the harness
  probe.offerVisible = () => {
    const node = document.getElementById('record-hint');
    const text = node?.querySelector('.record-hint-text')?.textContent || '';
    return !!node && !node.hidden && !!document.getElementById('record-hint-retry') && /seems to have closed|閉じたよう/u.test(text);
  };
  probe.settle = (n, how) => {
    const entry = probe.queries.find((row) => row.n === n);
    if (!entry?.deferred || !entry.release) return false;
    const act = how === 'reject' ? entry.fail : entry.release;
    entry.release = null;
    entry.fail = null;
    act();
    return true;
  };
  probe.state = () => ({
    docId: probe.docId, role: probe.role, flags: probe.flags, fired: { ...probe.fired },
    requests: probe.requests.map((row) => ({ ...row })),
    queryStarts: probe.queryStarts, inFlight: probe.inFlight, maxInFlight: probe.maxInFlight,
    queries: probe.queries.map(({ release, fail, ...row }) => ({ ...row, awaiting: !!release })),
    wakeTimersLive: [...probe.timers.values()].filter((row) => row.site === 'wakeRecordHint').length,
    deadlineTimersLive: [...probe.timers.values()].filter((row) => row.site === 'armRecordHintDeadline').length,
    maxWakeTimers: probe.maxWakeTimers,
    channels: probe.channels.map((row) => ({ ...row })),
    unhandled: [...probe.unhandled], crossingEvents: [...probe.crossingEvents],
    gate: { entered: probe.gate.entered, holding: probe.gate.holding, released: probe.gate.released },
    ready: document.body?.dataset.ready === '1', offer: probe.offerVisible(),
    hintNode: !!document.getElementById('record-hint'),
    failure: document.querySelector('#record-hint .record-hint-failure')?.textContent || '',
    view: document.body?.dataset.view ?? null,
  });
}

/* ------------------------------------------------------------------ harness helpers */

let host = null;
let origin = null;
let browser = null;
const EXPECTED = { script: null };

class CaseStop extends Error {
  constructor(row) { super(`required row failed: ${row}`); this.row = row; }
}

const DOCUMENTS = new WeakMap();
async function newContext(env) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
  env.contexts.push(context);
  await silenceBrowserAudio(context);
  return context;
}
function trackAppDocuments(env, page, role) {
  const slot = { current: null, pendingNavigation: null, byId: new Map(), requests: new WeakMap(), serial: 0 };
  DOCUMENTS.set(page, slot);
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    // pushState/replaceState also emit framenavigated. They carry no new navigation request.
    if (slot.current && !slot.pendingNavigation) { slot.current.url = frame.url(); return; }
    const doc = { role, navigation: ++slot.serial, url: frame.url(), docId: null, required: false, checks: [] };
    env.documents.push(doc);
    slot.current = doc;
    slot.pendingNavigation = null;
  });
  const isScript = (request) => {
    try { const url = new URL(request.url()); return request.frame() === page.mainFrame()
      && url.origin === origin && url.pathname === '/corridor.js'; } catch { return false; }
  };
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) slot.pendingNavigation = request;
    if (!isScript(request)) return;
    const doc = slot.current;
    if (!doc) { env.identityErrors.push({ role, reason: 'script request without committed document' }); return; }
    const check = { result: null, promise: null };
    doc.checks.push(check);
    slot.requests.set(request, check);
  });
  page.on('requestfailed', (request) => {
    const check = slot.requests.get(request);
    if (check) check.result = { ok: null, error: request.failure()?.errorText || 'script request failed' };
  });
  page.on('response', (response) => {
    if (!isScript(response.request())) return;
    const check = slot.requests.get(response.request());
    if (!check) { env.identityErrors.push({ role, reason: 'script response without bound request' }); return; }
    check.promise = response.body().then((body) => ({ ok: sha256(body) === EXPECTED.script, sha256: sha256(body) }),
      (error) => ({ ok: null, error: error.message })).then((result) => { check.result = result; return result; });
  });
}
function bindObservedDocument(page, state) {
  const slot = DOCUMENTS.get(page);
  assert(slot?.current && typeof state.docId === 'string' && state.docId, 'observed document has no navigation identity');
  // A genuine bfcache return carries the same random probe docId and reuses its prior byte evidence.
  const prior = slot.byId.get(state.docId);
  if (prior && prior !== slot.current) {
    assert(slot.current.checks.length === 0, 'a restored document unexpectedly loaded another script');
    slot.current.restoredFrom = prior.navigation;
    slot.current = prior;
  }
  const doc = slot.current;
  assert(doc.docId === null || doc.docId === state.docId, 'navigation and observed probe identity disagree');
  assert(doc.role === state.role, 'navigation and observed probe role disagree');
  doc.docId = state.docId;
  doc.required = true;
  slot.byId.set(state.docId, doc);
}

async function booted(page, previousDocId) {
  await page.waitForFunction(({ previous, lock }) => {
    const probe = window.__hintProbe;
    if (!probe || probe.docId === previous || document.body?.dataset.ready !== '1') return false;
    const boot = probe.requests.find((row) => row.name === lock);
    return !!boot && boot.granted !== null;
  }, { previous: previousDocId, lock: RECORD_LOCK }, { timeout: 45_000 });
  const state = await page.evaluate(() => window.__hintProbe.state());
  bindObservedDocument(page, state);
  return state;
}

async function openApp(env, context, { role, seed = false, flags = {}, path = '?entry=shelf' }) {
  const page = await context.newPage();
  trackAppDocuments(env, page, role);
  page.on('pageerror', (error) => env.errors.push({ role, message: error.message }));
  page.on('crash', () => env.errors.push({ role, message: 'renderer crashed' }));
  await page.addInitScript(installRecordHintProbe, {
    origin, role, seed, flags, lock: RECORD_LOCK, storeKey: STORE_KEY, bindingKey: BINDING_KEY, channel: HINT_CHANNEL, crossingKey: CROSSING_KEY,
  });
  env.apps.push(page);
  await page.goto(`${origin}/index.html${path}`, { waitUntil: 'load', timeout: 45_000 });
  const state = await booted(page, null);
  assert.equal(state.role, role, `the probe did not install for ${role}`);
  assert(same(state.flags, flags), `${role}: the probe carries other flags than the case's`);
  if (seed) assert.equal(state.fired.seed, 1, `${role}: the seed did not install on a fresh origin`);
  return page;
}

/** A same-origin document that is not the app (a stylesheet shown as text): no probe, no app. */
async function openHarness(env, context) {
  const page = await context.newPage();
  page.on('pageerror', (error) => env.errors.push({ role: 'harness', message: error.message }));
  await page.goto(`${origin}/fonts.css`, { waitUntil: 'load' });
  assert.equal(await page.evaluate(() => location.origin), origin, 'the harness document is not on the app origin');
  assert(await page.evaluate(() => !!navigator.locks && !window.__hintProbe), 'the harness document must be a plain same-origin page');
  await page.evaluate(() => { window.__harness = { holds: new Map(), aborts: new Map() }; });
  return page;
}
const hold = (page, name) => page.evaluate((name) => new Promise((granted, failed) => {
  navigator.locks.request(name, { mode: 'exclusive' }, () => {
    granted(true);
    return new Promise((release) => window.__harness.holds.set(name, release));
  }).catch(failed);
}), name);
const queueRequest = (page, name, key) => page.evaluate(({ name, key }) => {
  const controller = new AbortController();
  window.__harness.aborts.set(key, controller);
  navigator.locks.request(name, { mode: 'exclusive', signal: controller.signal },
    () => new Promise((release) => window.__harness.holds.set(key, release))).catch(() => {});
  return true;
}, { name, key });
const releaseHold = (page, key) => page.evaluate((key) => {
  const release = window.__harness.holds.get(key);
  window.__harness.holds.delete(key);
  release?.();
  return !!release;
}, key);
const abortQueued = (page, key) => page.evaluate((key) => { window.__harness.aborts.get(key)?.abort(); return true; }, key);
const writeStorage = (page, key, value) => page.evaluate(([key, value]) => { localStorage.setItem(key, value); }, [key, value]);

async function observe(env, page) {
  const state = await page.evaluate(() => window.__hintProbe?.state() ?? null);
  assert(state, 'the page has no record-hint probe');
  bindObservedDocument(page, state);
  env.maxInFlight = Math.max(env.maxInFlight, state.maxInFlight);
  return state;
}
function authority(state) {
  const named = state.requests.filter((row) => row.name === RECORD_LOCK);
  const boot = named[0];
  const bootShape = !!boot && boot.mode === 'exclusive' && boot.ifAvailable === true && !boot.steal && !boot.signal && boot.queriesBefore === 0;
  return { bootShape, bootGranted: boot?.granted ?? null, namedRequests: named.length,
    observerAttempts: named.length - (bootShape ? 1 : 0),
    otherNames: [...new Set(state.requests.filter((row) => row.name !== RECORD_LOCK).map((row) => row.name))] };
}
/** The page's own lock client id, through the native methods; never empty. */
async function clientId(page) {
  const id = await page.evaluate(async () => {
    const request = window.__hintProbe?.raw.request ?? navigator.locks.request.bind(navigator.locks);
    const query = window.__hintProbe?.raw.query ?? navigator.locks.query.bind(navigator.locks);
    const name = `record-hint-self:${crypto.randomUUID()}`;
    return request(name, { mode: 'exclusive' }, async () => (await query()).held.find((row) => row.name === name)?.clientId ?? null);
  });
  assert(typeof id === 'string' && id.length > 0, 'the page has no lock client identity');
  return id;
}
/** Exact-name held/pending client ids, read natively. */
const lockView = (page) => page.evaluate(async (name) => {
  const query = window.__hintProbe?.raw.query ?? navigator.locks.query.bind(navigator.locks);
  const snapshot = await query();
  return {
    held: snapshot.held.filter((row) => row.name === name).map((row) => row.clientId),
    pending: snapshot.pending.filter((row) => row.name === name).map((row) => row.clientId),
    heldNames: snapshot.held.map((row) => row.name), pendingNames: snapshot.pending.map((row) => row.name),
  };
}, RECORD_LOCK);
async function ownership(env, page) {
  const state = await observe(env, page);
  const id = await clientId(page);
  const view = await lockView(page);
  const auth = authority(state);
  return { docId: state.docId, clientId: id, ...auth, held: view.held, pending: view.pending,
    owns: auth.bootShape && auth.bootGranted === true && auth.observerAttempts === 0 && same(view.held, [id]),
    // refused at boot and not holding; queueing (an observer attempt) is asserted separately where it matters
    blocked: auth.bootShape && auth.bootGranted === false && !view.held.includes(id) };
}

const waitOffer = (page, timeout = OFFER_MS) =>
  page.waitForFunction(() => window.__hintProbe?.offerVisible() === true, null, { timeout }).then(() => true, () => false);
const waitNoOffer = (page, timeout) =>
  page.waitForFunction(() => window.__hintProbe?.offerVisible() === false, null, { timeout }).then(() => true, () => false);
const waitQueries = (page, above, timeout) =>
  page.waitForFunction((n) => (window.__hintProbe?.queryStarts ?? 0) > n, above, { timeout }).then(() => true, () => false);
const waitLockFree = (page, timeout) => page.waitForFunction(async (name) => {
  const snapshot = await window.__hintProbe.raw.query();
  return !snapshot.held.some((row) => row.name === name);
}, RECORD_LOCK, { timeout, polling: 100 }).then(() => true, () => false);
const setHidden = (page, hidden) => page.evaluate((hidden) => window.__hintProbe.setHidden(hidden), hidden);
const setControl = (page, patch) => page.evaluate((patch) => { Object.assign(window.__hintProbe.control, patch); }, patch);
async function settle(page, n, how) {
  assert(await page.evaluate(([n, how]) => window.__hintProbe.settle(n, how), [n, how]), `look #${n} is not a held deferred look`);
}
const advance = (page, ms) => page.evaluate((ms) => window.__hintProbe.advanceClock(ms), ms);
const focusEvent = (page) => page.evaluate(() => { window.dispatchEvent(new FocusEvent('focus')); });
const advisory = (page, count = 1) => page.evaluate((count) => window.__hintProbe.postAdvisory(count), count);
const pagehideEvent = (page) => page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })); });
const openHintChannels = (state) => state.channels.filter((row) => row.name === HINT_CHANNEL && !row.closed).length;
const manualReload = (page) => page.evaluate(() => {
  const alert = document.getElementById('store-alert');
  const reload = document.getElementById('record-reload');
  return !!alert && !alert.hidden && !!reload && alert.contains(reload);
});

/** The next deferred look of the wanted kind; looks of the other kind are let through as they come. */
async function nextDeferred(env, page, { wantFree, timeoutMs = 12_000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const handle = await page.waitForFunction(() => window.__hintProbe.queries.find((row) => row.deferred && row.release)?.n ?? false,
      null, { timeout: Math.max(1, deadline - Date.now()) }).catch(() => null);
    if (!handle) break;
    const n = await handle.jsonValue();
    const entry = (await observe(env, page)).queries.find((row) => row.n === n);
    if (entry.free === wantFree) return entry;
    await settle(page, n, 'resolve');
  }
  throw new Error(`no deferred ${wantFree ? 'free' : 'held'} look within ${timeoutMs} ms`);
}

/** Tap the visible offer (never a manual reload) and wait for a NEW document's completed boot. */
async function retryFromOffer(env, page) {
  const before = await observe(env, page);
  assert(before.offer, 'there is no visible offer to tap');
  await Promise.all([page.waitForEvent('load', { timeout: 20_000 }), page.locator('#record-hint-retry').click({ timeout: 5_000 })]);
  return booted(page, before.docId);
}

async function gradeOnce(page) {
  await page.locator('#tray').click({ timeout: 10_000 });
  const key = await page.evaluate(() => window.__KAIRO_SRS__.dueKeys()[0] ?? null);
  assert(key, 'no due card to grade');
  await page.locator('#review-start').click({ timeout: 10_000 });
  await page.locator('#declare-notyet').click({ timeout: 10_000 });
  await page.locator('.grade.g-again').click({ timeout: 10_000 });
  return key;
}
const pick = (row) => ({ taken: row.taken, revlog: row.revlog || [], srs: row.srs || {} });
/** One grade row for `key` on top of `before`, its card stamped by that grade, nothing else moved. */
function gradeCoherence(before, after, key) {
  const baseRevlog = before.revlog || [];
  const revlog = after.revlog || [];
  const baseSrs = before.srs || {};
  const srs = after.srs || {};
  const added = revlog.slice(baseRevlog.length);
  const others = [...new Set([...Object.keys(srs), ...Object.keys(baseSrs)])].filter((name) => name !== key);
  const coherent = revlog.length === baseRevlog.length + 1 && same(revlog.slice(0, baseRevlog.length), baseRevlog)
    && added[0]?.[1] === key && srs[key] !== undefined && Date.parse(srs[key].last_review) === added[0][0]
    && others.every((name) => same(srs[name], baseSrs[name])) && same(after.taken, before.taken);
  return { coherent, key, added, card: srs[key] ?? null };
}
async function provesWritable(page, before) {
  const key = await gradeOnce(page);
  const after = await waitForAppRecord(page, (row) => (row.revlog || []).length === before.length + 1,
    { timeout: 10_000, description: 'a grade written after the retry' }).catch(() => null);
  return { ok: !!after && same(after.revlog.slice(0, before.length), before) && after.revlog.at(-1)?.[1] === key,
    key, revlog: after?.revlog.length ?? null };
}
async function seededOwner(env, t, rowId, page) {
  const state = await observe(env, page);
  const own = await ownership(env, page);
  const snapshot = await readAppRecordSnapshot(page);
  const taken = sorted((snapshot.record.taken || []).map((row) => `${row.t}:${row.id}`));
  t.require(rowId, state.fired.seed === 1 && own.owns && same(taken, sorted(['word:会う', 'word:青']))
    && (snapshot.record.revlog || []).length === 0 && Object.keys(snapshot.record.srs || {}).length === 0,
    json({ seed: state.fired.seed, owns: own.owns, taken, revlog: (snapshot.record.revlog || []).length }));
  return snapshot.record;
}
/** Read the native store until three reads 250 ms apart agree (pending transactions settled). */
async function settledRecord(page, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let agreeing = 0;
  while (Date.now() < deadline) {
    const row = (await readAppRecordSnapshot(page)).record;
    const text = JSON.stringify(pick(row));
    agreeing = text === last ? agreeing + 1 : 1;
    last = text;
    if (agreeing >= 3) return row;
    await page.waitForTimeout(250);
  }
  return null;
}
const placeOf = (page) => page.evaluate(() => ({ view: document.body.dataset.view ?? null,
  passages: [...document.querySelectorAll('.listen-row')].map((node) => node.dataset.passage) }));
async function onPassage(page, passageId) {
  await page.waitForFunction((id) => document.body.dataset.view === 'reader'
    && [...document.querySelectorAll('.listen-row')].some((node) => node.dataset.passage === id), passageId, { timeout: 5_000 }).catch(() => null);
  const place = await placeOf(page);
  return { ok: place.view === 'reader' && same(place.passages, [passageId]), place };
}

/* ------------------------------------------------------------------ cases */

const CASES = new Map();
const AUTO_ROWS = RECORD_HINT_AUTO_ROWS;
function defineCase(id, { rows = [], optional = {}, browser: usesBrowser = true }, run) {
  const schema = RECORD_HINT_CASE_SCHEMA[id];
  assert(schema, `no receipt schema for ${id}`);
  assert.deepEqual(rows, schema.rows, `${id}: required rows differ from the shared schema`);
  assert.deepEqual(Object.keys(optional), schema.optional, `${id}: optional rows differ from the shared schema`);
  assert.equal(usesBrowser, schema.browser, `${id}: browser scope differs from the shared schema`);
  CASES.set(id, { id, rows, optional, browser: usesBrowser, run });
}
function caseContext(spec) {
  const recorded = new Set();
  const auto = spec.browser ? AUTO_ROWS.map((name) => `${spec.id}.${name}`) : [`${spec.id}.completed`];
  const put = (id, status, detail, evidence = null) => {
    assert(spec.rows.includes(id) || Object.hasOwn(spec.optional, id) || auto.includes(id), `undeclared row ${id}`);
    assert(!recorded.has(id), `row ${id} recorded twice`);
    recorded.add(id);
    record(spec.id, id, status, detail, evidence);
  };
  return {
    recorded,
    row(id, pass, detail = '', evidence = null) { put(id, pass ? 'passed' : 'failed', detail, evidence); return !!pass; },
    inconclusive(id, detail, evidence) { put(id, 'inconclusive', detail, evidence); },
    witness(id, violated, kind, detail = '', extra = {}) {
      put(id, violated ? 'failed' : 'passed', detail, { ...extra, kind, observed: !!violated });
      return !!violated;
    },
    requireWitness(id, violated, kind, detail = '') {
      put(id, violated ? 'failed' : 'passed', detail, { kind, observed: !!violated });
      if (violated) throw new CaseStop(id);
    },
    require(id, pass, detail = '') { put(id, pass ? 'passed' : 'failed', detail); if (!pass) throw new CaseStop(id); },
    unavailable(id, reason) { assert(Object.hasOwn(spec.optional, id), `only an optional row can be unavailable: ${id}`); put(id, 'unavailable', reason); },
  };
}
async function settledChecks(checks, ms) {
  let timer;
  const late = new Promise((done) => { timer = setTimeout(() => done({ ok: null, error: 'timeout' }), ms); });
  try { return await Promise.all(checks.map((check) => Promise.race([check, late]))); } finally { clearTimeout(timer); }
}
async function runCase(spec) {
  console.log(`\n${spec.id}`);
  const t = caseContext(spec);
  const env = { contexts: [], apps: [], errors: [], documents: [], identityErrors: [], maxInFlight: 0 };
  let completed = true;
  let detail = '';
  try { await spec.run(t, env); } catch (error) {
    completed = false;
    detail = error instanceof CaseStop ? `stopped: ${error.row} failed` : String(error?.stack || error);
  }
  if (spec.browser) {
    for (const page of env.apps) {
      if (page.isClosed()) continue;
      try { await observe(env, page); } catch { /* navigating or already gone */ }
    }
    t.row(`${spec.id}.max-one-outstanding-query`, env.maxInFlight <= 1, `max in flight ${env.maxInFlight}`);
    const documents = [];
    for (const doc of env.documents.filter((entry) => entry.required)) {
      const checks = await settledChecks(doc.checks.map((check) => check.promise || Promise.resolve(check.result
        || { ok: null, error: 'no completed script response' })), 15_000);
      documents.push({ role: doc.role, navigation: doc.navigation, docId: doc.docId, url: doc.url, checks });
    }
    const allChecks = documents.flatMap((doc) => doc.checks);
    const evidence = { kind: 'document-script-identity', documents, errors: env.identityErrors };
    const incomplete = documents.length === 0 || documents.some((doc) => doc.checks.length === 0)
      || allChecks.some((check) => check.ok === null) || env.identityErrors.length > 0;
    if (incomplete) t.inconclusive(`${spec.id}.served-script-identity`, 'a behavior-bearing document lacks complete byte evidence', evidence);
    else t.row(`${spec.id}.served-script-identity`, allChecks.every((check) => check.ok === true),
      `${documents.length} observed documents, ${allChecks.length} verified responses`, evidence);
    for (const context of env.contexts) receipt.cleanup.push({ case: spec.id, ...(await bounded('context', () => context.close(), 10_000)) });
    t.row(`${spec.id}.no-page-errors`, env.errors.length === 0, json(env.errors.slice(0, 10)), { kind: 'page-errors', errors: env.errors });
  }
  t.row(`${spec.id}.completed`, completed, detail);
  for (const id of spec.rows) if (!t.recorded.has(id)) record(spec.id, id, 'unreached', 'the case stopped before this assertion');
  for (const [id, reason] of Object.entries(spec.optional)) if (!t.recorded.has(id)) record(spec.id, id, 'unavailable', reason);
  writeReceipt();
}

defineCase('W1', { rows: [
  'W1.owner-still-held', 'W1.owner-query-established', 'W1.lock-free-after-owner-close',
  'W1.seed-and-owner-before-first-grade', 'W1.owner-grade-durable', 'W1.blocked-boot-lost', 'W1.no-offer-while-owner-lives',
  'W1.observer-never-queued', 'W1.observer-held-identity', 'W1.zero-observer-acquisition-attempts', 'W1.offer-within-4s-of-close',
  'W1.retry-new-document-and-ownership', 'W1.owner-revlog-exact', 'W1.writable-after-retry',
], optional: { 'W1.mutant-held-gate-established': 'only the deliberately held m2 callback uses this control' } }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  await seededOwner(env, t, 'W1.seed-and-owner-before-first-grade', a);
  const key = await gradeOnce(a);
  const acked = await waitForAppRecord(a, (row) => (row.revlog || []).length === 1, { description: 'the owner grade' });
  t.require('W1.owner-grade-durable', acked.revlog[0][1] === key, json({ key, row: acked.revlog[0] }));
  const ownerId = await clientId(a);
  const b = await openApp(env, context, { role: 'B' });
  const blocked = await ownership(env, b);
  t.require('W1.blocked-boot-lost', blocked.blocked && same(blocked.held, [ownerId]), json(blocked));
  await b.waitForTimeout(3600);
  const early = await observe(env, b);
  const queued = await lockView(b);
  t.require('W1.owner-still-held', same(queued.held, [ownerId]), json(queued));
  t.row('W1.owner-query-established', early.queryStarts >= 1, json({ looks: early.queryStarts }));
  t.witness('W1.no-offer-while-owner-lives', early.offer, 'offer-while-native-owner-held', json({ offer: early.offer, looks: early.queryStarts }));
  t.row('W1.observer-never-queued', !queued.pending.includes(blocked.clientId) && !queued.held.includes(blocked.clientId), json(queued));
  await a.close();
  const closedAt = Date.now();
  // whichever comes first: the offer, or a mutant observer holding the lock through its gate
  const first = await b.waitForFunction(() => {
    const probe = window.__hintProbe;
    return probe.offerVisible() ? 'offer' : probe.gate.holding > 0 ? 'gate' : false;
  }, null, { timeout: OFFER_MS }).then((handle) => handle.jsonValue(), () => 'none');
  const firstAt = Date.now();
  const sample = await lockView(b);
  t.row('W1.lock-free-after-owner-close', sample.held.length === 0 && sample.pending.length === 0, json(sample));
  const gate = (await observe(env, b)).gate;
  if (receipt.artifact.mutant?.name === 'm2') {
    t.row('W1.mutant-held-gate-established', first === 'gate' && gate.entered >= 1 && gate.holding >= 1
      && same(sample.held, [blocked.clientId]), json({ gate, sample }));
  } else t.unavailable('W1.mutant-held-gate-established', 'only the deliberately held m2 callback uses this control');
  t.witness('W1.observer-held-identity', sample.held.includes(blocked.clientId), 'observer-native-held', json({ first, gate, held: sample.held, blocked: blocked.clientId }));
  const released = await b.evaluate(() => window.__hintProbe.releaseGate());
  const offered = first === 'offer' || await waitOffer(b, Math.max(250, OFFER_MS - (Date.now() - closedAt)));
  const elapsed = (first === 'offer' ? firstAt : Date.now()) - closedAt;
  const beforeTap = authority(await observe(env, b));
  t.witness('W1.zero-observer-acquisition-attempts', beforeTap.observerAttempts > 0, 'observer-record-request', json(beforeTap));
  t.requireWitness('W1.offer-within-4s-of-close', !offered || elapsed > OFFER_MS, 'offer-deadline-missed', json({ elapsed, first, gateReleased: released }));
  await retryFromOffer(env, b);
  const after = await ownership(env, b);
  t.require('W1.retry-new-document-and-ownership', after.owns && after.docId !== blocked.docId, json(after));
  const native = (await readAppRecordSnapshot(b)).record;
  t.row('W1.owner-revlog-exact', same(native.revlog, acked.revlog) && same(native.srs, acked.srs), json({ revlog: native.revlog }));
  const writable = await provesWritable(b, native.revlog || []);
  t.row('W1.writable-after-retry', writable.ok, json(writable));
});

defineCase('W2', { rows: ['W2.blocked-at-start', 'W2.owner-every-reload', 'W2.blocked-never-held-or-queued',
  'W2.blocked-zero-observer-attempts', 'W2.blocked-kept-looking'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B' });
  const blocked = await ownership(env, b);
  t.require('W2.blocked-at-start', blocked.blocked, json(blocked));
  const looksAtStart = (await observe(env, b)).queryStarts;
  let failure = null;
  let seen = null;
  try {
    for (let reload = 1; reload <= 20 && !failure; reload += 1) {
      const previous = (await observe(env, a)).docId;
      await a.reload({ waitUntil: 'load', timeout: 45_000 });
      await booted(a, previous);
      const own = await ownership(env, a);
      if (!own.owns) failure = { reload, own };
      const view = await lockView(b);
      if (!seen && (view.held.includes(blocked.clientId) || view.pending.includes(blocked.clientId))) seen = { reload, view };
    }
  } finally { await b.evaluate(() => window.__hintProbe.releaseGate()).catch(() => 0); }
  t.row('W2.owner-every-reload', !failure, failure ? json(failure) : '20/20 reloads named A the owner');
  t.row('W2.blocked-never-held-or-queued', !seen, json(seen));
  const state = await observe(env, b);
  const auth = authority(state);
  t.row('W2.blocked-zero-observer-attempts', auth.bootShape && auth.namedRequests === 1 && auth.observerAttempts === 0, json(auth));
  t.row('W2.blocked-kept-looking', state.queryStarts > looksAtStart, json({ looksAtStart, looks: state.queryStarts }));
});

defineCase('W3', { rows: ['W3.both-offered', 'W3.both-rebooted', 'W3.exactly-one-named-owner', 'W3.loser-blocked',
  'W3.loser-hint-restarted', 'W3.history-equals-single-window', 'W3.winner-writable'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const history = (await readAppRecordSnapshot(a)).record;
  const b = await openApp(env, context, { role: 'B' });
  const c = await openApp(env, context, { role: 'C' });
  const docs = { b: (await observe(env, b)).docId, c: (await observe(env, c)).docId };
  await a.close();
  const offered = await Promise.all([waitOffer(b), waitOffer(c)]);
  t.require('W3.both-offered', offered.every(Boolean), json(offered));
  await Promise.all([retryFromOffer(env, b), retryFromOffer(env, c)]);
  const rb = await ownership(env, b);
  const rc = await ownership(env, c);
  t.require('W3.both-rebooted', rb.docId !== docs.b && rc.docId !== docs.c, json({ b: rb.docId, c: rc.docId }));
  const owners = [rb, rc].filter((row) => row.owns);
  t.require('W3.exactly-one-named-owner', owners.length === 1 && [rb, rc].filter((row) => row.bootGranted === true).length === 1, json({ b: rb, c: rc }));
  const [winner, loser, winnerPage, loserPage] = rb.owns ? [rb, rc, b, c] : [rc, rb, c, b];
  t.row('W3.loser-blocked', loser.blocked && loser.observerAttempts === 0 && !loser.pending.includes(loser.clientId)
    && same(loser.held, [winner.clientId]), json(loser));
  const restarted = await waitQueries(loserPage, 0, 4000);
  await loserPage.waitForTimeout(3600);
  const loserState = await observe(env, loserPage);
  t.row('W3.loser-hint-restarted', restarted && !loserState.offer, json({ looks: loserState.queryStarts, offer: loserState.offer }));
  const after = (await readAppRecordSnapshot(winnerPage)).record;
  t.row('W3.history-equals-single-window', same(pick(after), pick(history)), json({ after: pick(after), history: pick(history) }));
  const writable = await provesWritable(winnerPage, after.revlog || []);
  t.row('W3.winner-writable', writable.ok, json(writable));
});

defineCase('W4', { browser: false, optional: {
  'W4.renderer-crash': 'not exercised: no renderer-crash scenario is implemented in this suite (Chromium CDP Page.crash could share a renderer process with the blocked window); unavailable, not passed',
} }, async (t) => {
  t.unavailable('W4.renderer-crash', 'not exercised in this suite; unavailable, not passed');
});

defineCase('W5', { rows: ['W5.offer-after-owner-navigates-away', 'W5.back-outcome', 'W5.offer-follows-lock'], optional: {
  'W5.bfcache-restore-stays-departed': 'Back produced a fresh document, so the persisted-pageshow fence was not exercised',
  'W5.fresh-document-reacquires': 'Back restored the document from bfcache, so fresh re-acquisition was not exercised',
} }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B' });
  const before = await observe(env, a);
  await a.goto('about:blank');
  t.require('W5.offer-after-owner-navigates-away', await waitOffer(b), '');
  await a.goBack({ waitUntil: 'load', timeout: 30_000 });
  await a.waitForFunction(() => !!window.__hintProbe && document.body?.dataset.ready === '1', null, { timeout: 45_000 });
  const back = await observe(env, a);
  if (back.docId !== before.docId) {
    await booted(a, before.docId);
    const own = await ownership(env, a);
    t.row('W5.fresh-document-reacquires', own.owns, json(own));
    t.row('W5.back-outcome', own.owns, `fresh document: ${json(own)}`);
    t.unavailable('W5.bfcache-restore-stays-departed', 'Back produced a fresh document (no bfcache restore in this engine configuration)');
    t.row('W5.offer-follows-lock', await waitNoOffer(b, 4500), 'the offer withdraws once A holds the lock again');
  } else {
    const auth = authority(back);
    const view = await lockView(b);
    const id = await clientId(a);
    const departed = auth.namedRequests === authority(before).namedRequests && !view.held.includes(id) && back.queryStarts === 0;
    t.row('W5.bfcache-restore-stays-departed', departed, json({ auth, view, looks: back.queryStarts }));
    t.row('W5.back-outcome', departed, 'bfcache restore');
    t.unavailable('W5.fresh-document-reacquires', 'Back restored the document from bfcache');
    t.row('W5.offer-follows-lock', (await observe(env, b)).offer, 'nobody holds the lock, so the offer stays');
  }
});

defineCase('W6a', { rows: ['W6a.seed-and-owner-before-first-grade', 'W6a.acknowledged-row-and-card-coherent', 'W6a.blocked-before-close',
  'W6a.offer', 'W6a.retry-new-document-and-ownership', 'W6a.row-present-exactly-once', 'W6a.writable-after-retry'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const seeded = await seededOwner(env, t, 'W6a.seed-and-owner-before-first-grade', a);
  const key = await gradeOnce(a);
  const acked = await waitForAppRecord(a, (row) => (row.revlog || []).length === 1, { description: 'the durable ACK' });
  const grade = gradeCoherence(seeded, acked, key);
  t.require('W6a.acknowledged-row-and-card-coherent', grade.coherent, json(grade));
  const b = await openApp(env, context, { role: 'B' });
  const blocked = await ownership(env, b);
  t.require('W6a.blocked-before-close', blocked.blocked, json(blocked));
  await a.close();
  t.require('W6a.offer', await waitOffer(b), '');
  await retryFromOffer(env, b);
  const own = await ownership(env, b);
  t.require('W6a.retry-new-document-and-ownership', own.owns && own.docId !== blocked.docId, json(own));
  const native = (await readAppRecordSnapshot(b)).record;
  t.row('W6a.row-present-exactly-once', same(pick(native), pick(acked)), json({ revlog: native.revlog, card: native.srs?.[key] ?? null }));
  const writable = await provesWritable(b, native.revlog || []);
  t.row('W6a.writable-after-retry', writable.ok, json(writable));
});

defineCase('W6b', { rows: ['W6b.seed-and-owner-before-first-grade', 'W6b.blocked-before-race', 'W6b.settled-store-read',
  'W6b.absent-or-one-coherent-row', 'W6b.offer', 'W6b.retry-new-document-and-ownership', 'W6b.boot-preserved-settled-record'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const baseline = await seededOwner(env, t, 'W6b.seed-and-owner-before-first-grade', a);
  await a.locator('#tray').click({ timeout: 10_000 });
  const key = await a.evaluate(() => window.__KAIRO_SRS__.dueKeys()[0] ?? null);
  await a.locator('#review-start').click({ timeout: 10_000 });
  await a.locator('#declare-notyet').click({ timeout: 10_000 });
  await a.locator('.grade.g-again').waitFor({ state: 'visible', timeout: 10_000 });
  const b = await openApp(env, context, { role: 'B' });
  const blocked = await ownership(env, b);
  t.require('W6b.blocked-before-race', blocked.blocked && !!key, json({ blocked, key }));
  // a race, not a held commit: the tap and the close are not ordered against the IDB commit
  await a.locator('.grade.g-again').click({ timeout: 5_000 });
  await a.close();
  const settled = await settledRecord(b);
  t.require('W6b.settled-store-read', !!settled, 'three agreeing native reads after the owner closed');
  const unchanged = same(pick(settled), pick(baseline));
  const grade = gradeCoherence(baseline, settled, key);
  t.row('W6b.absent-or-one-coherent-row', unchanged || grade.coherent, json({ outcome: unchanged ? 'absent' : grade.coherent ? 'present-once' : 'incoherent', grade }));
  t.require('W6b.offer', await waitOffer(b), '');
  await retryFromOffer(env, b);
  const own = await ownership(env, b);
  t.require('W6b.retry-new-document-and-ownership', own.owns && own.docId !== blocked.docId, json(own));
  const after = (await readAppRecordSnapshot(b)).record;
  t.row('W6b.boot-preserved-settled-record', same(pick(after), pick(settled)), json({ after: pick(after), settled: pick(settled) }));
});

defineCase('W7a', { rows: ['W7a.offer', 'W7a.retry-new-document-and-ownership', 'W7a.note-draft-survives'], optional: {
  'W7a.chat-draft-survives': 'the teacher chat input needs a conversation fixture this suite does not build; the teacher-draft verifiers own that surface',
} }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B' });
  const docId = (await observe(env, b)).docId;
  await b.locator('#tray').click({ timeout: 10_000 });
  await b.fill('#note-input', 'Bの筆');
  await a.close();
  t.require('W7a.offer', await waitOffer(b), '');
  await b.fill('#note-input', 'Bの筆・直前の追記');
  await retryFromOffer(env, b);
  const own = await ownership(env, b);
  t.require('W7a.retry-new-document-and-ownership', own.owns && own.docId !== docId, json(own));
  await b.locator('#tray').click({ timeout: 10_000 });
  const value = await b.inputValue('#note-input', { timeout: 10_000 });
  t.row('W7a.note-draft-survives', value === 'Bの筆・直前の追記', json(value));
  t.unavailable('W7a.chat-draft-survives', 'no teacher conversation fixture in this suite');
});

defineCase('W7b', { rows: ['W7b.offer', 'W7b.refusal-injected', 'W7b.no-reload', 'W7b.visible-alert', 'W7b.text-intact'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B', flags: { sessionRefusal: true } });
  await b.locator('#tray').click({ timeout: 10_000 });
  await b.fill('#note-input', '残すべき文');
  await a.close();
  t.require('W7b.offer', await waitOffer(b), '');
  const before = await observe(env, b);
  let loads = 0;
  b.on('load', () => { loads += 1; });
  await setControl(b, { refuseSession: true });
  await b.locator('#record-hint-retry').click({ timeout: 5_000 });
  await b.waitForTimeout(1500);
  const after = await observe(env, b);
  t.row('W7b.refusal-injected', after.fired.sessionRefused >= 1, json(after.fired));
  t.row('W7b.no-reload', after.docId === before.docId && loads === 0, json({ loads }));
  const alert = b.locator('#record-hint .record-hint-failure[role="alert"]');
  t.row('W7b.visible-alert', after.failure.length > 0 && await alert.isVisible(), json(after.failure));
  t.row('W7b.text-intact', await b.inputValue('#note-input') === '残すべき文', '');
});

defineCase('W7c', { rows: ['W7c.passage-opened', 'W7c.first-offer-genuine', 'W7c.holder-acquired', 'W7c.offer-still-shown-while-held',
  'W7c.losing-boot-new-document', 'W7c.losing-boot-blocked', 'W7c.losing-boot-same-passage', 'W7c.losing-boot-no-offer-while-held',
  'W7c.second-offer', 'W7c.second-retry-ownership', 'W7c.second-retry-same-passage', 'W7c.writable-after-second-retry'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B' });
  const holder = await openHarness(env, context);
  const passageId = await b.evaluate(() => [...document.querySelectorAll('.shelf-item:not([data-recommendation])')]
    .map((node) => node.dataset.passage).find((id) => typeof id === 'string' && /^[\w:.\-]{1,160}$/u.test(id)) ?? null);
  if (passageId !== null) {
    await b.evaluate((id) => [...document.querySelectorAll('.shelf-item')].find((node) => node.dataset.passage === id)
      .querySelector('.shelf-open').click(), passageId);
  }
  t.require('W7c.passage-opened', passageId !== null && (await onPassage(b, passageId)).ok, json({ passageId }));
  await a.close();
  const offered = await waitOffer(b);
  const look = (await observe(env, b)).queries.filter((row) => row.settled === 'resolved').at(-1);
  t.require('W7c.first-offer-genuine', offered && look?.free === true && look?.nativeFree === true, json(look));
  // later looks stay in flight, so this genuine free offer stands while another client takes the lock
  await setControl(b, { defer: true });
  await hold(holder, RECORD_LOCK);
  const holderId = await clientId(holder);
  const held = await lockView(b);
  t.require('W7c.holder-acquired', same(held.held, [holderId]), json(held));
  const standing = await observe(env, b);
  t.require('W7c.offer-still-shown-while-held', standing.offer, '');
  await retryFromOffer(env, b); // the real retry path; its boot must lose
  const lost = await ownership(env, b);
  t.require('W7c.losing-boot-new-document', lost.docId !== standing.docId, json(lost));
  t.require('W7c.losing-boot-blocked', lost.blocked && lost.observerAttempts === 0 && !lost.pending.includes(lost.clientId)
    && same(lost.held, [holderId]), json(lost));
  const lostPlace = await onPassage(b, passageId);
  t.witness('W7c.losing-boot-same-passage', !lostPlace.ok, 'losing-retry-wrong-passage', json(lostPlace.place));
  const restarted = await waitQueries(b, 0, 4000);
  await b.waitForTimeout(3600);
  t.row('W7c.losing-boot-no-offer-while-held', restarted && !(await observe(env, b)).offer, json({ restarted }));
  await releaseHold(holder, RECORD_LOCK);
  t.require('W7c.second-offer', await waitOffer(b, 6000), '');
  await retryFromOffer(env, b);
  const own = await ownership(env, b);
  t.require('W7c.second-retry-ownership', own.owns && own.docId !== lost.docId, json(own));
  const wonPlace = await onPassage(b, passageId);
  t.row('W7c.second-retry-same-passage', wonPlace.ok, json(wonPlace.place));
  const native = (await readAppRecordSnapshot(b)).record;
  const writable = await provesWritable(b, native.revlog || []);
  t.row('W7c.writable-after-second-retry', writable.ok, json(writable));
});

defineCase('W7d', { rows: ['W7d.valid-reader-route-restores-and-is-spent', 'W7d.malformed-json-dropped', 'W7d.wrong-version-dropped',
  'W7d.expired-dropped', 'W7d.future-timestamp-dropped', 'W7d.non-finite-timestamp-dropped', 'W7d.over-long-id-dropped',
  'W7d.bad-character-id-dropped', 'W7d.unknown-view-dropped', 'W7d.unknown-attempt-lands-in-room', 'W7d.restore-writes-no-record-state'] }, async (t, env) => {
  // the boot's route validation, through real reloads of an owner window (assessment result/item
  // targets, kept targets and deliberate navigation: verify-assessment-app.mjs retry-route-* cases)
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const passageId = await a.evaluate(() => [...document.querySelectorAll('.shelf-item:not([data-recommendation])')]
    .map((node) => node.dataset.passage).find((id) => typeof id === 'string' && /^[\w:.\-]{1,160}$/u.test(id)) ?? null);
  assert(passageId, 'no shelf passage with a route-safe id');
  const roots = (row) => ({ ...pick(row), assessmentLibraryV2: row.assessmentLibraryV2 ?? null,
    assessmentLearning: row.assessmentLearning ?? null, assessmentQuestionPractice: row.assessmentQuestionPractice ?? null });
  const before = roots((await readAppRecordSnapshot(a)).record);
  const bootWith = async (value) => {
    const previous = (await observe(env, a)).docId;
    await a.evaluate(([key, text]) => { sessionStorage.setItem(key, text); }, [ROUTE_KEY, value]);
    await a.reload({ waitUntil: 'load', timeout: 45_000 });
    await booted(a, previous);
    return a.evaluate((key) => ({ view: document.body.dataset.view ?? null,
      passages: [...document.querySelectorAll('.listen-row')].map((node) => node.dataset.passage),
      attempt: document.querySelector('#app main')?.dataset.examAttempt ?? null, route: sessionStorage.getItem(key) }), ROUTE_KEY);
  };
  const route = (fields) => JSON.stringify({ v: 1, view: 'reader', passageId, ts: Date.now(), ...fields });
  const frontDoor = (place) => place.view === 'shelf' && place.route === null;
  const valid = await bootWith(route({}));
  t.row('W7d.valid-reader-route-restores-and-is-spent', valid.view === 'reader' && same(valid.passages, [passageId]) && valid.route === null, json(valid));
  const cases = [
    ['W7d.malformed-json-dropped', '{"v":1,"view":"reader"'],
    ['W7d.wrong-version-dropped', route({ v: 2 })],
    ['W7d.expired-dropped', route({ ts: Date.now() - 121_000 })],
    ['W7d.future-timestamp-dropped', route({ ts: Date.now() + 60_000 })],
    ['W7d.non-finite-timestamp-dropped', route({ ts: null })],
    ['W7d.over-long-id-dropped', route({ passageId: 'a'.repeat(161) })],
    ['W7d.bad-character-id-dropped', route({ passageId: `${passageId}/../x` })],
    ['W7d.unknown-view-dropped', route({ view: 'tray' })],
  ];
  for (const [id, value] of cases) {
    const place = await bootWith(value);
    t.row(id, frontDoor(place), json(place));
  }
  const room = await bootWith(JSON.stringify({ v: 1, view: 'mock', attemptId: 'record-hint-no-such-attempt', ts: Date.now() }));
  t.row('W7d.unknown-attempt-lands-in-room', room.view === 'mock' && room.attempt !== 'record-hint-no-such-attempt' && room.route === null, json(room));
  const after = roots((await readAppRecordSnapshot(a)).record);
  t.row('W7d.restore-writes-no-record-state', same(after, before), 'learner and assessment roots are unchanged by ten route restores');
});

defineCase('W8', { rows: ['W8.injection-fired', 'W8.no-offer', 'W8.no-hint-timer-or-channel', 'W8.manual-reload-remains'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B', flags: { query: 'absent', traceTimers: true } });
  await a.close();
  await b.waitForTimeout(5000);
  const state = await observe(env, b);
  t.row('W8.injection-fired', state.fired.queryAbsentReads >= 1, json(state.fired));
  t.row('W8.no-offer', !state.offer && !state.hintNode && state.queryStarts === 0, json({ offer: state.offer, node: state.hintNode }));
  t.row('W8.no-hint-timer-or-channel', state.fired.wakeTimerSets === 0 && state.fired.deadlineTimerSets === 0 && openHintChannels(state) === 0, json(state.fired));
  t.row('W8.manual-reload-remains', await manualReload(b), '');
});

defineCase('W9', { rows: ['W9.hidden-no-queries', 'W9.visible-wakes-offer'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B' });
  await setHidden(b, true);
  const hiddenAt = (await observe(env, b)).queryStarts;
  await a.close();
  await b.waitForTimeout(5000);
  const later = await observe(env, b);
  t.row('W9.hidden-no-queries', later.queryStarts === hiddenAt && !later.offer, json({ hiddenAt, later: later.queryStarts }));
  await setHidden(b, false);
  t.row('W9.visible-wakes-offer', await waitOffer(b, 2500), '');
});

defineCase('L1', { rows: ['L1.visible-free-result-publishes', 'L1.hide-retires-offer', 'L1.late-free-result-after-hide-not-published',
  'L1.no-queries-while-hidden', 'L1.return-looks-afresh', 'L1.pagehide-retires-offer',
  'L1.late-free-result-after-pagehide-not-published', 'L1.no-queries-after-pagehide'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B' });
  await setControl(b, { defer: true });
  await a.close();
  // the positive control: a deferred free look resolved while visible publishes
  const first = await nextDeferred(env, b, { wantFree: true });
  await settle(b, first.n, 'resolve');
  t.require('L1.visible-free-result-publishes', await waitOffer(b, 1500), `look #${first.n}`);
  // hidden with a free look in flight, then the look lands
  const second = await nextDeferred(env, b, { wantFree: true });
  await setHidden(b, true);
  t.row('L1.hide-retires-offer', !(await observe(env, b)).offer, '');
  await settle(b, second.n, 'resolve');
  await b.waitForTimeout(1500);
  t.row('L1.late-free-result-after-hide-not-published', !(await observe(env, b)).offer, `look #${second.n}`);
  await b.waitForTimeout(4000);
  const hidden = await observe(env, b);
  t.row('L1.no-queries-while-hidden', hidden.queryStarts === second.n && !hidden.offer, json({ looks: hidden.queryStarts, last: second.n }));
  // a real return looks again before offering anything
  await setHidden(b, false);
  const third = await nextDeferred(env, b, { wantFree: true });
  const quiet = await observe(env, b);
  await settle(b, third.n, 'resolve');
  t.row('L1.return-looks-afresh', third.n > second.n && !quiet.offer && await waitOffer(b, 1500), json({ third: third.n, quiet: quiet.offer }));
  // pagehide with a free look in flight (dispatched, so the document survives to observe the late result)
  const fourth = await nextDeferred(env, b, { wantFree: true });
  await pagehideEvent(b);
  t.row('L1.pagehide-retires-offer', !(await observe(env, b)).offer, '');
  await settle(b, fourth.n, 'resolve');
  await b.waitForTimeout(1500);
  t.row('L1.late-free-result-after-pagehide-not-published', !(await observe(env, b)).offer, `look #${fourth.n}`);
  await focusEvent(b);
  await advisory(b, 3);
  await b.waitForTimeout(4000);
  const gone = await observe(env, b);
  t.row('L1.no-queries-after-pagehide', gone.queryStarts === fourth.n && openHintChannels(gone) === 0, json({ looks: gone.queryStarts, channels: openHintChannels(gone) }));
});

defineCase('L2', { rows: [
  'L2.old-free-look-and-new-holder-established', 'L2.old-rejection-established','L2.single-outstanding-across-generations', 'L2.old-free-result-not-published',
  'L2.completion-rechecks-current-generation', 'L2.current-held-result-no-offer', 'L2.old-rejection-does-not-stop',
  'L2.after-old-rejection-offer-returns'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B' });
  const holder = await openHarness(env, context);
  await setControl(b, { defer: true });
  await a.close();
  const stale = await nextDeferred(env, b, { wantFree: true });
  await setHidden(b, true);
  await hold(holder, RECORD_LOCK);
  await setHidden(b, false);
  t.require('L2.old-free-look-and-new-holder-established', stale.nativeFree === true && stale.deferred && stale.awaiting
    && same((await lockView(b)).held, [await clientId(holder)]), json(stale));
  await b.waitForTimeout(1500);
  const waiting = await observe(env, b);
  t.row('L2.single-outstanding-across-generations', waiting.queryStarts === stale.n && waiting.inFlight === 1 && !waiting.offer,
    json({ looks: waiting.queryStarts, stale: stale.n, inFlight: waiting.inFlight }));
  await settle(b, stale.n, 'resolve');
  const rechecked = await waitQueries(b, stale.n, 3000);
  await b.waitForTimeout(500);
  t.witness('L2.old-free-result-not-published', (await observe(env, b)).offer, 'old-free-result-published', `look #${stale.n}`);
  t.row('L2.completion-rechecks-current-generation', rechecked, '');
  const current = await nextDeferred(env, b, { wantFree: false });
  await settle(b, current.n, 'resolve');
  await b.waitForTimeout(1000);
  t.row('L2.current-held-result-no-offer', !(await observe(env, b)).offer, `look #${current.n}`);
  // the rejection variant: an old look rejected after a hidden→visible return
  await releaseHold(holder, RECORD_LOCK);
  const staleReject = await nextDeferred(env, b, { wantFree: true });
  await setHidden(b, true);
  await setHidden(b, false);
  await settle(b, staleReject.n, 'reject');
  const restartedAfterReject = await waitQueries(b, staleReject.n, 3000);
  const rejected = (await observe(env, b)).queries.find((row) => row.n === staleReject.n);
  t.require('L2.old-rejection-established', staleReject.nativeFree === true && staleReject.deferred && rejected?.settled === 'rejected', json(rejected));
  t.requireWitness('L2.old-rejection-does-not-stop', !restartedAfterReject, 'old-rejection-stopped-new-period', `look #${staleReject.n}`);
  const next = await nextDeferred(env, b, { wantFree: true });
  await settle(b, next.n, 'resolve');
  t.row('L2.after-old-rejection-offer-returns', await waitOffer(b, 1500), `look #${next.n}`);
});

defineCase('L3', { rows: [
  'L3.crossing-event-observed','L3.offer-before-crossing', 'L3.stale-retires-offer', 'L3.no-queries-while-stale', 'L3.abort-resumes-looking',
  'L3.pre-crossing-result-not-published', 'L3.abort-looks-afresh', 'L3.fresh-result-after-abort-publishes'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B' });
  const other = await openHarness(env, context);
  await a.close();
  t.require('L3.offer-before-crossing', await waitOffer(b), '');
  // another tab's crossing beacon makes this window stale
  await writeStorage(other, CROSSING_KEY, 'record-hint-l3');
  const crossingObserved = await b.waitForFunction(() => window.__hintProbe.crossingEvents.includes('record-hint-l3'), null,
    { timeout: 2000 }).then(() => true, () => false);
  t.require('L3.crossing-event-observed', crossingObserved, json((await observe(env, b)).crossingEvents));
  t.witness('L3.stale-retires-offer', !(await waitNoOffer(b, 2000)), 'offer-survived-crossing', '');
  const staleAt = (await observe(env, b)).queryStarts;
  await b.waitForTimeout(4000);
  const stale = await observe(env, b);
  t.row('L3.no-queries-while-stale', stale.queryStarts === staleAt && openHintChannels(stale) === 0, json({ staleAt, looks: stale.queryStarts }));
  await writeStorage(other, CROSSING_KEY, 'record-hint-l3-aborted');
  t.row('L3.abort-resumes-looking', await waitQueries(b, staleAt, 3000) && await waitOffer(b, 3000), '');
  // a free look from before a crossing round trip lands after the abort
  await setControl(b, { defer: true });
  const inflight = await nextDeferred(env, b, { wantFree: true });
  await writeStorage(other, CROSSING_KEY, 'record-hint-l3b');
  await waitNoOffer(b, 2000);
  await writeStorage(other, CROSSING_KEY, 'record-hint-l3b-aborted');
  await b.waitForTimeout(500);
  await settle(b, inflight.n, 'resolve');
  await b.waitForTimeout(1000);
  t.row('L3.pre-crossing-result-not-published', !(await observe(env, b)).offer, `look #${inflight.n}`);
  const fresh = await nextDeferred(env, b, { wantFree: true });
  t.row('L3.abort-looks-afresh', fresh.n > inflight.n, json({ fresh: fresh.n, old: inflight.n }));
  await settle(b, fresh.n, 'resolve');
  t.row('L3.fresh-result-after-abort-publishes', await waitOffer(b, 1500), '');
});

defineCase('L4', { rows: ['L4.clock-and-timers-installed', 'L4.looking-before-deadline', 'L4.deadline-stops-looking',
  'L4.focus-after-deadline-does-not-restart', 'L4.visibility-return-restarts'] }, async (t, env) => {
  const context = await newContext(env);
  await openApp(env, context, { role: 'A', seed: true }); // stays the owner: no offer, ordinary polling
  const b = await openApp(env, context, { role: 'B', flags: { clock: true, traceTimers: true } });
  await waitQueries(b, 0, 5000);
  const start = await observe(env, b);
  t.require('L4.clock-and-timers-installed', start.fired.wakeTimerSets >= 1 && start.fired.deadlineTimerSets >= 1, json(start.fired));
  await advance(b, 9 * 60_000);
  await focusEvent(b); // inside the window: may ask for a look, must not extend the window
  const at9 = (await observe(env, b)).queryStarts;
  t.row('L4.looking-before-deadline', await waitQueries(b, at9, 4500), json({ at9 }));
  const fired = await advance(b, 2 * 60_000); // eleven minutes of continuous visibility
  await b.waitForTimeout(300);
  const at11 = (await observe(env, b)).queryStarts;
  await b.waitForTimeout(7000);
  const after = await observe(env, b);
  t.witness('L4.deadline-stops-looking', after.queryStarts !== at11 || after.wakeTimersLive !== 0 || after.deadlineTimersLive !== 0
    || openHintChannels(after) !== 0, 'deadline-still-active', json({ fired, at11, looks: after.queryStarts, wake: after.wakeTimersLive, deadline: after.deadlineTimersLive }));
  await focusEvent(b);
  await b.waitForTimeout(2000);
  t.row('L4.focus-after-deadline-does-not-restart', (await observe(env, b)).queryStarts === at11, '');
  await setHidden(b, true);
  await setHidden(b, false);
  t.row('L4.visibility-return-restarts', await waitQueries(b, at11, 2500), '');
});

defineCase('L5', { rows: ['L5.timer-tracer-live', 'L5.burst-query-starts-bounded', 'L5.one-wake-timer', 'L5.max-one-outstanding'] }, async (t, env) => {
  const context = await newContext(env);
  await openApp(env, context, { role: 'A', seed: true }); // stays the owner: every look sees it held
  const b = await openApp(env, context, { role: 'B', flags: { traceTimers: true } });
  const live = await b.waitForFunction(() => window.__hintProbe.queryStarts >= 1 && window.__hintProbe.fired.wakeTimerSets >= 1,
    null, { timeout: 8000 }).then(() => true, () => false);
  t.require('L5.timer-tracer-live', live, json((await observe(env, b)).fired));
  const burst = await b.evaluate(async () => {
    const probe = window.__hintProbe;
    const startLooks = probe.queryStarts;
    const began = performance.now();
    for (let i = 0; i < 40; i += 1) {
      window.dispatchEvent(new FocusEvent('focus'));
      probe.postAdvisory(1);
      await new Promise((done) => probe.raw.setTimeout(done, 25));
    }
    await new Promise((done) => probe.raw.setTimeout(done, 1200));
    return { starts: probe.queryStarts - startLooks, ms: performance.now() - began, maxWake: probe.maxWakeTimers, maxInFlight: probe.maxInFlight };
  });
  const bound = Math.floor(burst.ms / 1000) + 2;
  t.witness('L5.burst-query-starts-bounded', burst.starts > bound, 'burst-look-bound-exceeded', json({ ...burst, bound }));
  t.row('L5.one-wake-timer', burst.maxWake <= 1, json(burst));
  t.row('L5.max-one-outstanding', burst.maxInFlight <= 1, json(burst));
});

defineCase('L6', { rows: ['L6.injection-fired', 'L6.one-failed-query-then-none', 'L6.no-offer-manual-reload', 'L6.no-unhandled-rejection'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B', flags: { queryFail: 'always' } });
  await waitQueries(b, 0, 5000);
  await a.close();
  await focusEvent(b);
  await advisory(b, 2);
  await b.waitForTimeout(7000);
  const state = await observe(env, b);
  t.require('L6.injection-fired', state.fired.queryFailures === state.queryStarts && state.queryStarts >= 1
    && state.queries[0]?.settled === 'rejected', json(state.fired));
  t.witness('L6.one-failed-query-then-none', state.queryStarts > 1, 'look-after-current-query-rejection', json({ looks: state.queryStarts }));
  t.row('L6.no-offer-manual-reload', !state.offer && openHintChannels(state) === 0 && await manualReload(b), '');
  t.row('L6.no-unhandled-rejection', state.unhandled.length === 0, json(state.unhandled));
});

defineCase('L7', { rows: ['L7.getter-throw-fired', 'L7.getter-throw-no-hint', 'L7.bind-throw-fired', 'L7.bind-throw-no-hint',
  'L7.manual-reload-remains'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const getter = await openApp(env, context, { role: 'G', flags: { query: 'getter-throws', traceTimers: true } });
  const binder = await openApp(env, context, { role: 'K', flags: { query: 'bind-throws', traceTimers: true } });
  await a.close();
  await getter.waitForTimeout(5000);
  const noHint = (state) => !state.offer && !state.hintNode && state.queryStarts === 0 && state.fired.wakeTimerSets === 0
    && state.fired.deadlineTimerSets === 0 && openHintChannels(state) === 0;
  const g = await observe(env, getter);
  const k = await observe(env, binder);
  t.row('L7.getter-throw-fired', g.fired.queryGetterThrows >= 1, json(g.fired));
  t.row('L7.getter-throw-no-hint', noHint(g), json({ offer: g.offer, node: g.hintNode, looks: g.queryStarts }));
  t.row('L7.bind-throw-fired', k.fired.queryBindThrows >= 1, json(k.fired));
  t.row('L7.bind-throw-no-hint', noHint(k), json({ offer: k.offer, node: k.hintNode, looks: k.queryStarts }));
  t.row('L7.manual-reload-remains', await manualReload(getter) && await manualReload(binder), '');
});

defineCase('L8', { rows: ['L8.pending-only-control-established', 'L8.pending-only-no-offer', 'L8.transform-can-offer',
  'L8.unrelated-rows-present', 'L8.unrelated-names-offer'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B' });
  const other = await openHarness(env, context);
  // a REAL pending request behind the owner; the probe hides only the owner's named held row from B
  await queueRequest(other, RECORD_LOCK, 'pending');
  await setControl(b, { transform: 'hide-named-held' });
  const from = (await observe(env, b)).queryStarts;
  await waitQueries(b, from + 1, 8000);
  const state = await observe(env, b);
  const looks = state.queries.filter((row) => row.n > from && row.settled === 'resolved');
  t.require('L8.pending-only-control-established', looks.length >= 1 && state.fired.transformed >= 1
    && looks.every((row) => row.viewNamedHeld === 0 && row.viewNamedPending === 1), json(looks));
  t.witness('L8.pending-only-no-offer', state.offer || await waitOffer(b, 3500), 'offer-with-native-pending-row', '');
  await abortQueued(other, 'pending');
  t.row('L8.transform-can-offer', await waitOffer(b, 4500), 'the same transformed view without the pending row offers');
  await setControl(b, { transform: null });
  await waitNoOffer(b, 4500);
  await hold(other, 'kairo-unrelated-lock');
  await hold(other, `${RECORD_LOCK}:shadow`);
  await queueRequest(other, 'kairo-unrelated-lock', 'unrelated-pending');
  await a.close();
  await waitLockFree(b, 5000);
  const view = await lockView(b);
  t.require('L8.unrelated-rows-present', view.held.length === 0 && view.pending.length === 0
    && view.heldNames.includes('kairo-unrelated-lock') && view.heldNames.includes(`${RECORD_LOCK}:shadow`)
    && view.pendingNames.includes('kairo-unrelated-lock'), json(view));
  t.witness('L8.unrelated-names-offer', !(await waitOffer(b, 4500)), 'unrelated-locks-suppressed-offer', '');
});

defineCase('L9', { rows: [
  'L9.held-free-looks-established', 'L9.deadline-timers-fired','L9.free-offer', 'L9.deadline-hides-offer', 'L9.channel-stopped', 'L9.no-overlapping-query',
  'L9.resolved-old-look-does-not-revive', 'L9.rejected-old-look-does-not-revive', 'L9.no-unhandled-rejection'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const one = await openApp(env, context, { role: 'B1', flags: { clock: true, traceTimers: true } });
  const two = await openApp(env, context, { role: 'B2', flags: { clock: true, traceTimers: true } });
  await a.close();
  t.require('L9.free-offer', (await Promise.all([waitOffer(one), waitOffer(two)])).every(Boolean), '');
  await setControl(one, { defer: true });
  await setControl(two, { defer: true });
  const look1 = await nextDeferred(env, one, { wantFree: true });
  const look2 = await nextDeferred(env, two, { wantFree: true });
  t.require('L9.held-free-looks-established', look1.nativeFree === true && look2.nativeFree === true
    && look1.deferred && look2.deferred && look1.awaiting && look2.awaiting, json({ look1, look2 }));
  // from here only the controlled clock moves: no focus, visibility, storage or advisory event
  const fired1 = await advance(one, HINT_WINDOW_MS + 1000);
  const fired2 = await advance(two, HINT_WINDOW_MS + 1000);
  await one.waitForTimeout(500);
  const [s1, s2] = [await observe(env, one), await observe(env, two)];
  t.require('L9.deadline-timers-fired', fired1.includes('armRecordHintDeadline') && fired2.includes('armRecordHintDeadline'), json({ fired1, fired2 }));
  t.witness('L9.deadline-hides-offer', s1.offer || s2.offer, 'offer-survived-deadline', json({ offers: [s1.offer, s2.offer] }));
  t.row('L9.channel-stopped', openHintChannels(s1) === 0 && openHintChannels(s2) === 0, '');
  await one.waitForTimeout(4000);
  const [l1, l2] = [await observe(env, one), await observe(env, two)];
  t.row('L9.no-overlapping-query', l1.queryStarts === look1.n && l2.queryStarts === look2.n && l1.inFlight === 1 && l2.inFlight === 1,
    json({ one: [l1.queryStarts, look1.n, l1.inFlight], two: [l2.queryStarts, look2.n, l2.inFlight] }));
  await settle(one, look1.n, 'resolve');
  await settle(two, look2.n, 'reject');
  await one.waitForTimeout(2000);
  const [e1, e2] = [await observe(env, one), await observe(env, two)];
  t.row('L9.resolved-old-look-does-not-revive', !e1.offer && e1.queryStarts === look1.n && openHintChannels(e1) === 0, json({ looks: e1.queryStarts }));
  t.row('L9.rejected-old-look-does-not-revive', !e2.offer && e2.queryStarts === look2.n && openHintChannels(e2) === 0, json({ looks: e2.queryStarts }));
  t.row('L9.no-unhandled-rejection', e1.unhandled.length === 0 && e2.unhandled.length === 0, json([e1.unhandled, e2.unhandled]));
});

defineCase('L10', { rows: [
  'L10.no-unexpected-errors','L10.sync-throw-fired', 'L10.no-unhandled-rejection', 'L10.hint-retired-manual-reload',
  'L10.no-later-queries', 'L10.zero-record-requests-beyond-boot'] }, async (t, env) => {
  const context = await newContext(env);
  const a = await openApp(env, context, { role: 'A', seed: true });
  const b = await openApp(env, context, { role: 'B', flags: { query: 'sync-throws' } });
  const threw = await b.waitForFunction(() => window.__hintProbe.fired.querySyncThrows >= 1, null, { timeout: 5000 }).then(() => true, () => false);
  t.require('L10.sync-throw-fired', threw, json((await observe(env, b)).fired));
  await a.close();
  await focusEvent(b);
  await advisory(b, 2);
  await b.waitForTimeout(6000);
  const state = await observe(env, b);
  const pageErrors = env.errors.filter((row) => row.role === 'B');
  const expectedError = 'probe: query threw synchronously';
  const unexpectedErrors = [...state.unhandled.filter((message) => message !== expectedError),
    ...pageErrors.filter((row) => row.message !== expectedError)];
  t.require('L10.no-unexpected-errors', unexpectedErrors.length === 0, json(unexpectedErrors));
  t.witness('L10.no-unhandled-rejection', state.unhandled.includes(expectedError) || pageErrors.some((row) => row.message === expectedError),
    'expected-sync-query-rejection', json({ unhandled: state.unhandled, pageErrors }), { unexpectedErrors });
  t.row('L10.hint-retired-manual-reload', !state.offer && openHintChannels(state) === 0 && await manualReload(b), '');
  t.row('L10.no-later-queries', state.fired.querySyncThrows === 1, json(state.fired));
  const auth = authority(state);
  t.row('L10.zero-record-requests-beyond-boot', auth.bootShape && auth.namedRequests === 1 && auth.observerAttempts === 0, json(auth));
});

/* ------------------------------------------------------------------ setup (W0) and the run */

function playwrightVersion() {
  try { return require('playwright-core/package.json').version; } catch { return null; }
}
const w0 = (id, pass, detail = '') => record('W0', id, pass ? 'passed' : 'failed', detail);
async function setup() {
  assert(Object.values(receipt.verifier.support).every((hash) => /^[a-f0-9]{64}$/.test(hash || '')), 'required harness source unavailable');
  const only = process.env.KAIRO_RECORD_HINT_ONLY;
  const all = [...CASES.keys()];
  const chosen = only === undefined ? all : only.split(',').map((id) => id.trim()).filter(Boolean);
  for (const id of chosen) assert(CASES.has(id), `unknown case ${id}`);
  receipt.selection = { full: only === undefined, cases: all.filter((id) => chosen.includes(id)), unselected: all.filter((id) => !chosen.includes(id)) };

  const site = resolveCorridorSite(); // inside the terminal lifecycle: a rejection is a failed setup receipt
  const baseBytes = readFileSync(join(site, 'build-identity.json'));
  const base = JSON.parse(baseBytes.toString('utf8'));
  const pinned = process.env.KAIRO_ARTIFACT_SHA256;
  receipt.artifact.base = { site, product: base.product, gitSha: base.gitSha, sourceDirty: base.sourceDirty,
    sourceAssetSha256: base.sourceAssetSha256, artifactSha256: base.artifactSha256, manifestSha256: sha256(baseBytes),
    selection: pinned === undefined ? 'source-compared' : 'pinned-bundled', sourceCompared: pinned === undefined };
  const markers = ['mutant', 'testMutation', 'format', 'mutationSha256'].filter((key) => Object.hasOwn(base, key));
  w0('W0.base-artifact-verified', base.product === 'KAIRO' && markers.length === 0,
    json({ artifactSha256: base.artifactSha256, sourceDirty: base.sourceDirty, sourceCompared: pinned === undefined, markers }));

  const mutantDir = process.env.KAIRO_TEST_MUTANT_DIR;
  const mutantPin = process.env.KAIRO_TEST_MUTANT_SHA256;
  assert.equal(mutantDir === undefined, mutantPin === undefined, 'KAIRO_TEST_MUTANT_DIR and KAIRO_TEST_MUTANT_SHA256 go together');
  let served = site;
  let mutant = null;
  if (mutantDir !== undefined) {
    try { mutant = verifyTestMutant({ baseSite: site, mutantSite: mutantDir, expectedMutationSha256: mutantPin }); } catch (error) {
      record('W0', 'W0.mutation-provenance-verified', 'failed', error.message);
      throw error;
    }
    record('W0', 'W0.mutation-provenance-verified', 'passed', json({ name: mutant.name, mutationSha256: mutant.mutationSha256 }));
    served = mutant.site;
    receipt.artifact.kind = 'test-mutation';
    receipt.artifact.mutant = { name: mutant.name, site: mutant.site, mutationSha256: mutant.mutationSha256,
      mutantFilesSha256: mutant.mutantFilesSha256, identitySha256: mutant.identitySha256,
      edits: mutant.edits.map(({ file, fromSha256, toSha256, offset }) => ({ file, fromSha256, toSha256, offset })), results: mutant.results };
    EXPECTED.script = mutant.files.get('corridor.js');
  } else {
    receipt.artifact.kind = 'release-artifact';
    EXPECTED.script = base.files.find((row) => row.path === 'corridor.js')?.sha256 ?? null;
  }

  host = await startStaticHost({ site: served, port: 0 });
  origin = host.origin;
  const fetchBytes = async (path) => {
    const response = await fetch(`${origin}/${path.split('/').map(encodeURIComponent).join('/')}`);
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const identityBytes = await fetchBytes('build-identity.json');
  const script = await fetchBytes('corridor.js');
  receipt.artifact.served = { site: served, origin, identitySha256: sha256(identityBytes), corridorJsSha256: sha256(script) };
  if (mutant) {
    const identity = JSON.parse(identityBytes.toString('utf8'));
    w0('W0.served-identity-is-declared-mutation', sha256(identityBytes) === mutant.identitySha256
      && identity.product === MUTANT_PRODUCT && identity.format === MUTATION_FORMAT && identity.cleanBuild === false
      && identity.name === mutant.name && identity.base?.artifactSha256 === base.artifactSha256,
    json({ product: identity.product, name: identity.name, cleanBuild: identity.cleanBuild, base: identity.base?.artifactSha256 }));
    const touched = [];
    for (const row of mutant.results) touched.push({ path: row.path, ok: sha256(await fetchBytes(row.path)) === row.after.sha256 });
    w0('W0.served-script-is-mutant-bytes', touched.every((row) => row.ok) && sha256(script) === EXPECTED.script, json(touched));
  } else {
    w0('W0.served-identity-is-base-manifest', identityBytes.equals(baseBytes), 'the served identity is the verified manifest, byte for byte');
    w0('W0.served-script-matches-manifest', !!EXPECTED.script && sha256(script) === EXPECTED.script, sha256(script));
  }
  const text = script.toString('utf8');
  const missing = SOURCE_ANCHORS.filter((anchor) => !text.includes(anchor));
  w0('W0.constants-match-served-source', missing.length === 0, json(missing));
  if (results.some((row) => row.case === 'W0' && row.status !== 'passed')) throw new Error('W0 identity failed; no case runs');

  browser = await chromium.launch();
  receipt.browser = { engine: 'chromium', version: browser.version(), playwrightCore: playwrightVersion() };
}

writeReceipt(); // an older receipt in a reused evidence directory is replaced before anything runs
const watchdog = setTimeout(() => {
  finish('incomplete', `no terminal outcome within ${DEADLINE_MS} ms`);
  process.exit(1);
}, DEADLINE_MS);
watchdog.unref();
let exitCode = 1;
try {
  console.log('W0');
  await setup();
  receipt.setup.status = 'passed';
  writeReceipt();
  for (const id of receipt.selection.cases) await runCase(CASES.get(id));
} catch (error) {
  if (receipt.setup.status === 'pending') {
    receipt.setup.status = 'failed';
    receipt.setup.error = String(error?.stack || error);
    console.log(`  FAIL setup — ${error?.message || error}`);
  } else record('terminal', 'terminal', 'failed', String(error?.stack || error));
} finally {
  if (browser) receipt.cleanup.push(await bounded('browser', () => browser.close(), 20_000));
  if (host) receipt.cleanup.push(await bounded('host', () => host.close(), 10_000));
  exitCode = finish();
}
process.exit(exitCode);

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createFeedNetwork } = require('./feed-network.cjs');

/** A personal device service. Publisher responses never enter durable storage. */
function createFeedService({ core, profile, network = createFeedNetwork(), now = Date.now, onEvent = () => {} }) {
  if (!path.isAbsolute(profile)) throw new Error('feed-profile-must-be-absolute');
  const stateFile = path.join(profile, 'feed-request-state-v1.json');
  const states = new Map();
  const snapshots = new Map();
  const inFlight = new Map();
  const aborts = new Set();
  const waiters = [];
  let running = 0;
  let closed = false;
  let storageError = null;
  try {
    fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
    if (!fs.lstatSync(profile).isDirectory() || fs.lstatSync(profile).isSymbolicLink()) throw new Error('feed-profile-invalid');
    if (fs.existsSync(stateFile)) {
      const stat = fs.lstatSync(stateFile);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128_000) throw new Error('invalid-feed-state-file');
      const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (JSON.stringify(Object.keys(saved).sort()) !== JSON.stringify(['format', 'sources', 'v'])
        || saved.format !== 'kairo-feed-request-state' || saved.v !== 1
        || !saved.sources || typeof saved.sources !== 'object' || Array.isArray(saved.sources)
        || Object.keys(saved.sources).length > 100) throw new Error('invalid-feed-state-file');
      for (const [id, state] of Object.entries(saved.sources)) {
        core.getFeedSource(id);
        states.set(id, core.parseFeedRequestState(state));
      }
    }
  } catch { storageError = 'feed-state-unavailable'; }

  function save() {
    if (storageError) throw new Error(storageError);
    const temp = path.join(profile, `.feed-request-${randomUUID()}.tmp`);
    let fd;
    try {
      if (fs.existsSync(stateFile) && (!fs.lstatSync(stateFile).isFile() || fs.lstatSync(stateFile).isSymbolicLink())) throw new Error('invalid-feed-state-file');
      fd = fs.openSync(temp, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ format: 'kairo-feed-request-state', v: 1, sources: Object.fromEntries(states) }));
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      fs.renameSync(temp, stateFile);
    } catch {
      storageError = 'feed-state-unavailable';
      throw new Error(storageError);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }

  function view(source, status, error = null, snapshot = snapshots.get(source.id)) {
    const state = states.get(source.id) || core.initialFeedState();
    return core.deepFreeze({ sourceId: source.id, status, entries: snapshot?.entries || [],
      checkedAt: state.lastAttemptAt === null ? null : new Date(state.lastAttemptAt).toISOString(),
      lastSuccessAt: state.lastSuccessAt === null ? null : new Date(state.lastSuccessAt).toISOString(),
      nextCheckAt: new Date(state.nextCheckAt).toISOString(),
      latestPublishedAt: state.latestPublishedAt, freshness: core.feedFreshness(source, state, now()), error });
  }

  async function perform(source) {
    if (running >= 2) await new Promise((resolve) => waiters.push(resolve));
    else running += 1;
    let controller;
    try {
      if (closed) return view(source, 'unavailable', 'feed-service-closed');
      if (storageError) return view(source, 'unavailable', storageError);
      const previous = states.get(source.id) || core.initialFeedState();
      const plan = core.planFeedRequest(source, previous, now(), snapshots.has(source.id));
      if (plan.kind === 'unavailable') return view(source, 'publisher-window', plan.reason);
      if (plan.kind === 'deferred') return view(source, 'deferred');
      const attemptedAt = now();
      // Record the request before networking: a crash cannot erase cadence and
      // cause automatic repeated requests after the next app launch.
      states.set(source.id, { ...previous, lastAttemptAt: attemptedAt, nextCheckAt: attemptedAt + source.cadence.minIntervalMs });
      try { save(); } catch { return view(source, 'unavailable', storageError); }
      controller = new AbortController();
      aborts.add(controller);
      let response;
      let snapshot;
      let error = null;
      try {
        response = await network.fetchSource(source, plan.headers, controller.signal);
        if (response.status === 200) snapshot = core.parseFeedXml(response.xml, { sourceId: source.id, finalUrl: response.finalUrl, fetchedAt: new Date(now()).toISOString() });
        else if (response.status === 304 && !snapshots.has(source.id)) error = 'feed-304-without-snapshot';
      } catch (failure) { error = typeof failure.code === 'string' && /^[a-z0-9-]{1,80}$/u.test(failure.code) ? failure.code : 'feed-response-invalid'; }
      const applied = core.applyFeedResult(source, previous, { status: response?.status || 0, headers: response?.headers || {}, snapshot, ...(error ? { error } : {}) }, now());
      states.set(source.id, applied.state);
      if (snapshot) {
        if (applied.state.cacheable) snapshots.set(source.id, snapshot);
        else snapshots.delete(source.id);
      } else if (!applied.state.cacheable) snapshots.delete(source.id);
      try { save(); } catch { return view(source, 'unavailable', storageError, snapshot); }
      onEvent({ sourceId: source.id, status: applied.status, error, httpStatus: response?.status || null,
        contentType: response?.headers['content-type'] || null, finalUrl: response?.finalUrl || null,
        bytes: response?.bytes || 0, responseSha256: response?.responseSha256 || null, durationMs: response?.durationMs || null,
        format: snapshot?.format || null, itemCount: snapshot?.entries.length || 0,
        rejectedItems: snapshot?.rejectedItems || 0, duplicateItems: snapshot?.duplicateItems || 0, futureItems: snapshot?.futureItems || 0 });
      return view(source, applied.status, error, snapshot || snapshots.get(source.id));
    } finally {
      if (controller) aborts.delete(controller);
      const next = waiters.shift();
      if (next) next();
      else running -= 1;
    }
  }

  function refresh(id) {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/u.test(id)) throw new Error('invalid-feed-source-id');
    const source = core.getFeedSource(id);
    if (!inFlight.has(id)) {
      const pending = perform(source).finally(() => inFlight.delete(id));
      inFlight.set(id, pending);
    }
    return inFlight.get(id);
  }
  function resolveEntry(raw) {
    const selection = core.parsePublisherReadSelection(raw);
    if (closed) return null;
    return snapshots.get(selection.sourceId)?.entries.find((entry) =>
      entry.id === selection.entryId && entry.revisionId === selection.revisionId) || null;
  }
  return Object.freeze({ listSources: () => core.SOURCE_REGISTRY, refresh,
    resolveEntry,
    async close() { closed = true; for (const controller of aborts) controller.abort(); await Promise.allSettled(inFlight.values()); },
  });
}

module.exports = { createFeedService };

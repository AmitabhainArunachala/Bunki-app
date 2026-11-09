/** Shared study playback and source projection for the audio resource contract.
 *
 * The module resolves a canonical selection into a privately branded ready
 * result and plays only exact verified clip bytes. Playback mirrors the
 * existing trial WebAudio session/resume/dual-decode/cancel patterns: resume
 * happens synchronously on the gesture, every await is fenced by a generation
 * token, and a cancelled generation never starts a source or leaks a stale
 * error. There is no trial/device/voice fallback and no synthesis.
 */
import {createAudioReleaseReader, hashAudioBytes} from './audio-release.mjs';
import {planCardSpeech} from '../audio/card-speech-plan.mjs';
import {passageReadingRules,passageReadingLedgerSha256} from '../player/passage-reading-rules.mjs';

const frozenField = (fieldId, text, language) => Object.freeze({fieldId, text, language,pronunciationDirectives:Object.freeze([]),pendingReasons:Object.freeze([])});

/** Project the actual mounted source fields of a vocabulary or grammar entry.
 *
 * Every grammar example is its own field (`examples[i].ja`/`.en`), never just
 * the example selected by the task. Grammar formation/nuance and text-only
 * related references stay language-null because their language cannot be
 * inferred; mixed vocabulary notes/collocations stay null rather than being
 * guessed. Returned fields are detached and frozen.
 */
export function studyAudioSourceFields(entry) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return Object.freeze([]);
  }
  const fields = [];
  const see = new Set();
  const push = (fieldId, text, language) => {
    if (typeof text !== 'string' || text.trim().length === 0 || see.has(fieldId)) return;
    see.add(fieldId);
    fields.push(frozenField(fieldId, text, language));
  };
  const grammar = entry.grammarRecord && typeof entry.grammarRecord === 'object'
    ? entry.grammarRecord : null;
  if (grammar && typeof entry.contractId === 'string' && entry.contractId.startsWith('grammar.')) {
    push('pattern', grammar.pattern, null);
    push('meaning', grammar.meaning, 'en');
    push('formation', grammar.formation, null);
    push('nuance', grammar.nuance, null);
    const examples = Array.isArray(grammar.examples) ? grammar.examples : [];
    for (let i = 0; i < examples.length; i++) {
      const example = examples[i];
      if (!example || typeof example !== 'object') continue;
      push(`examples[${i}].ja`, example.ja, 'ja');
      push(`examples[${i}].en`, example.en, 'en');
    }
    const references = Array.isArray(grammar.relatedReferences) ? grammar.relatedReferences : [];
    for (let i = 0; i < references.length; i++) {
      const reference = references[i];
      if (!reference || typeof reference !== 'object') continue;
      push(`relatedReferences[${i}].text`, reference.text, null);
    }
  } else {
    push('term', entry.term, 'ja');
    push('reading', entry.reading, 'ja');
    push('ja', entry.ja, 'ja');
    push('defJa', entry.defJa, 'ja');
    push('meaning', entry.meaning, 'en');
    push('note', entry.note, null);
    push('en', entry.en, 'en');
    const collocations = Array.isArray(entry.collocations) ? entry.collocations : [];
    for (let i = 0; i < collocations.length; i++) {
      if (typeof collocations[i] !== 'string') continue;
      push(`collocations[${i}]`, collocations[i], 'ja');
    }
  }
  return Object.freeze(fields);
}

/** One mounted accepted entry, exact current correction overlay, no provider/profile work.
 * The mount caches by exact source snapshot, so mutable QA inputs cannot retain stale directives. */
export function studyAudioSourcePlan(entry, assignments = {}) {
  const selected = (rows = {}) => {
    if (rows === null || typeof rows !== 'object' || Array.isArray(rows)) throw new TypeError('study-audio-assignments');
    return Object.hasOwn(rows, entry.taskKey) ? {[entry.taskKey]: rows[entry.taskKey]} : {};
  };
  const task=planCardSpeech({catalog:[entry],grammarRecords:entry.grammarRecord?[entry.grammarRecord]:[],readingRules:passageReadingRules,sourceRevision:'runtime-projection',correctionLedgerRevision:passageReadingLedgerSha256,profiles:{},languageAssignments:selected(assignments.languageAssignments),readingAssignments:selected(assignments.readingAssignments),scope:{accessScope:'runtime-projection',licenseScope:'runtime-projection'}}).tasks[0];
  const sourceFields=Object.freeze(task.fields.map(field=>Object.freeze({fieldId:field.sourcePath,text:field.sourceText,language:typeof field.language==='string'?field.language:null,pronunciationDirectives:Object.freeze(field.readingEvidence.map(({start,end,reading})=>Object.freeze({start,end,reading}))),pendingReasons:Object.freeze(field.pendingReasons.filter(reason=>!['profile-unassigned','profile-conflict','reading-review-pending'].includes(reason)))})));
  const plan=Object.freeze({audioContentRevision:task.audioContentRevision,sourceFields});
  return plan;
}

function browserContext() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) throw Error('study-audio-context-unavailable');
  return new Ctor();
}

function audioError(code, message) {
  const error = Error(message);
  error.audioCode = code;
  return error;
}

function decodeAudio(target, buffer) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = value => { if (!settled) { settled = true; resolve(value); } };
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    try {
      const result = target.decodeAudioData(buffer, done, fail);
      if (result && typeof result.then === 'function') result.then(done, fail);
      else if (result !== undefined) done(result);
    } catch (error) {
      fail(error);
    }
  });
}

function copyRef(ref) {
  return Object.freeze({key: ref.key, sha256: ref.sha256, bytes: ref.bytes});
}

function snapshotReady(result) {
  const segments = result.segments.map(segment => Object.freeze({
    fieldId: segment.fieldId,
    packId: segment.packId,
    supportedReadingId: segment.supportedReadingId,
    start: segment.start,
    end: segment.end,
    inputKey: segment.inputKey,
    profileId: segment.profileId,
    ref: copyRef(segment.ref),
  }));
  return Object.freeze({
    status: 'ready',
    releaseId: result.releaseId,
    projectionId: result.projectionId,
    contentRelease: result.contentRelease,
    taskKey: result.taskKey,
    contentRevision: result.contentRevision,
    audioContentRevision: result.audioContentRevision,
    profileId: result.profileId,
    supportedReadingId: result.supportedReadingId,
    localState: result.localState,
    segments: Object.freeze(segments),
  });
}

/** Create a study-audio player over a declared capability.
 *
 * `authorize` is consulted before and after every await and immediately before
 * each source start; returning false cancels playback quietly. Optional
 * `preflight` gates each decoded segment with the immutable snapshot and ref.
 * `audioSession` is claimed for actual playback and restored on stop, end,
 * failure or disposal. Without a capability the player stays explicitly
 * unavailable; it never constructs the legacy trial player.
 */
export function createStudyAudio({
  capability,
  createContext = browserContext,
  audioSession = globalThis.navigator?.audioSession,
  authorize,
  preflight,
} = {}) {
  let reader = null;
  let readerError = null;
  try {
    reader = createAudioReleaseReader({capability});
  } catch (error) {
    readerError = error;
  }

  const snapshots = new WeakMap();
  let disposed = false;
  let context = null;
  let generation = 0;
  let activeToken = null;
  let resolveController = null;
  let resolutionEpoch = 0;
  let sessionClaimed = false;
  let sessionPrevious;

  function authorized() {
    if (typeof authorize !== 'function') return true;
    try { return Boolean(authorize()); } catch { return false; }
  }

  function ensureContext() {
    if (disposed) throw audioError('cancelled', 'study-audio-disposed');
    if (context && context.state !== 'closed') return context;
    const created = createContext();
    if (!created || typeof created.decodeAudioData !== 'function' ||
        typeof created.createBufferSource !== 'function') {
      throw audioError('invalid', 'study-audio-context');
    }
    context = created;
    return context;
  }

  function resumeContext(target) {
    try {
      if (target.state !== 'closed') {
        const resumed = target.resume?.();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      }
    } catch { /* A start or decode reports an unusable context. */ }
  }

  function claimSession() {
    if (sessionClaimed) return;
    try {
      if (!audioSession || typeof audioSession.type !== 'string') return;
      const previous = audioSession.type;
      audioSession.type = 'playback';
      sessionPrevious = previous;
      sessionClaimed = true;
    } catch { /* Unsupported sessions keep the platform default. */ }
  }

  function releaseSession() {
    if (!sessionClaimed) return;
    const previous = sessionPrevious;
    sessionClaimed = false;
    sessionPrevious = undefined;
    try { audioSession.type = previous; } catch { /* Ignore unsupported sessions. */ }
  }

  function makeToken() {
    const token = {
      gen: ++generation,
      cancelled: false,
      source: null,
      wake: null,
      controller: typeof AbortController === 'function' ? new AbortController() : null,
    };
    token.done = new Promise(resolve => { token.finish = resolve; });
    return token;
  }

  function cancelled(token) {
    return disposed || token.cancelled || token.gen !== generation;
  }

  function cancelToken(token) {
    if (!token || token.cancelled) return;
    token.cancelled = true;
    try { token.controller?.abort(); } catch { /* Cancellation is synchronous. */ }
    const source = token.source;
    token.source = null;
    if (source) {
      try { source.stop(); } catch { /* A stopped source may throw. */ }
      try { source.disconnect(); } catch { /* The context may be closed. */ }
    }
    try { token.finish?.(); } catch { /* Only one wake is needed. */ }
    try { token.wake?.(); } catch { /* Only one wake is needed. */ }
  }

  async function run(token, snapshot, target) {
    for (const segment of snapshot.segments) {
      if (cancelled(token)) return;
      if (!authorized()) { cancelToken(token); return; }
      let bytes;
      try {
        bytes = await Promise.race([
          reader.readClip(segment.ref, {signal: token.controller?.signal}),
          token.done,
        ]);
      } catch (error) {
        if (cancelled(token)) return;
        throw error;
      }
      if (!bytes || cancelled(token)) return;
      if (!authorized()) { cancelToken(token); return; }
      if (bytes.byteLength !== segment.ref.bytes) {
        throw audioError('integrity', 'study-audio-clip-length');
      }
      let digest;
      try {
        digest = await Promise.race([hashAudioBytes(bytes), token.done]);
      } catch (error) {
        if (cancelled(token)) return;
        throw error;
      }
      if (cancelled(token)) return;
      if (digest !== segment.ref.sha256) {
        throw audioError('integrity', 'study-audio-clip-digest');
      }
      if (!authorized()) { cancelToken(token); return; }
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      let decoded;
      try {
        decoded = await Promise.race([decodeAudio(target, buffer), token.done]);
      } catch (error) {
        if (cancelled(token)) return;
        throw error;
      }
      if (!decoded || cancelled(token)) return;
      if (!authorized()) { cancelToken(token); return; }
      if (typeof preflight === 'function') {
        try {
          await Promise.race([
            preflight(snapshot, {signal: token.controller?.signal, ref: segment.ref, segment}),
            token.done,
          ]);
        } catch (error) {
          if (cancelled(token)) return;
          throw error;
        }
        if (cancelled(token)) return;
        if (!authorized()) { cancelToken(token); return; }
      }
      const source = target.createBufferSource();
      token.source = source;
      source.buffer = decoded;
      const ended = new Promise(resolve => { token.wake = resolve; });
      source.onended = () => {
        const wake = token.wake;
        token.wake = null;
        wake?.();
      };
      source.connect(target.destination);
      try {
        source.start();
      } catch (error) {
        token.source = null;
        try { source.disconnect(); } catch { /* Nothing was connected. */ }
        if (cancelled(token)) return;
        throw error;
      }
      await Promise.race([ended, token.done]);
      if (token.source === source) token.source = null;
      try { source.disconnect(); } catch { /* The context may be closed. */ }
      if (cancelled(token)) return;
    }
  }

  async function resolve(selection) {
    if (disposed) return {status: 'cancelled'};
    if (readerError) {
      return {status: readerError.audioCode === 'unsupported'
        ? 'unsupported-capability' : 'integrity-invalid'};
    }
    if (!authorized()) return {status: 'face-hidden'};
    try { resolveController?.abort(); } catch {}
    const epoch=++resolutionEpoch;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    resolveController = controller;
    let result;
    try {
      result = await reader.resolve(selection, {signal: controller?.signal});
    } catch (error) {
      if (disposed || controller?.signal.aborted || epoch!==resolutionEpoch) return {status: 'cancelled'};
      return {status: error?.audioCode === 'unsupported'
        ? 'unsupported-capability' : 'integrity-invalid'};
    } finally {
      if (resolveController === controller) resolveController = null;
    }
    if (disposed || controller?.signal.aborted || epoch!==resolutionEpoch) return {status: 'cancelled'};
    if (!authorized()) return {status: 'face-hidden'};
    if (result && result.status === 'ready') {
      snapshots.set(result, snapshotReady(result));
    }
    return result;
  }

  function play(readyResult) {
    if (disposed) return Promise.reject(audioError('cancelled', 'study-audio-disposed'));
    const snapshot = snapshots.get(readyResult);
    if (!snapshot || readyResult?.status !== 'ready') {
      return Promise.reject(audioError('invalid', 'study-audio-ready-invalid'));
    }
    if (!authorized()) return Promise.reject(audioError('hidden', 'study-audio-face-hidden'));
    let target;
    try {
      target = ensureContext();
    } catch (error) {
      return Promise.reject(error);
    }
    const previous = activeToken;
    const token = makeToken();
    activeToken = token;
    if (previous) cancelToken(previous);
    claimSession();
    resumeContext(target);
    return run(token, snapshot, target).catch(error => {
      if (cancelled(token)) return;
      throw error;
    }).finally(() => {
      if (activeToken !== token) return;
      activeToken = null;
      releaseSession();
    });
  }

  function stop() {
    if (disposed) return;
    generation++;resolutionEpoch++;
    const token = activeToken;
    activeToken = null;
    if (token) cancelToken(token);
    try { resolveController?.abort(); } catch { /* Abort is best effort. */ }
    resolveController = null;
    releaseSession();
  }

  function load(options) {
    if (disposed) return Promise.reject(audioError('cancelled', 'study-audio-disposed'));
    if (readerError) {
      return Promise.reject(readerError.audioCode === 'unsupported'
        ? audioError('unsupported', 'study-audio-unsupported')
        : audioError('integrity', 'study-audio-integrity'));
    }
    return reader.load(options);
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    generation++;resolutionEpoch++;
    const token = activeToken;
    activeToken = null;
    if (token) cancelToken(token);
    try { resolveController?.abort(); } catch { /* Abort is best effort. */ }
    resolveController = null;
    releaseSession();
    try { await reader?.dispose(); } catch { /* Disposal still closes audio. */ }
    const target = context;
    context = null;
    if (target) {
      try { await target.close?.(); } catch { /* The context may already be shut. */ }
    }
  }

  return Object.freeze({load, resolve, play, stop, dispose});
}

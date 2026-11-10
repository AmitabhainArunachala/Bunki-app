/** Explicit host startup, never module-import storage or learner access. */
import {payloadHash} from '../schema/event.mjs';
import {passageReadingRules, passageReadingLedgerSha256} from '../player/passage-reading-rules.mjs';
import {createAcceptedAudioObserver} from '../audio/accepted-demand.mjs';
import {selectAudioDemandSink} from './private-audio-demand.mjs';
import {createAcceptedAudioExporter} from './accepted-audio-export.mjs';

export function acceptedAudioSourceRevision({build, catalog, grammarRecords}) {
  const identity = {format: 'nihongo-accepted-audio-source', version: 1};
  if (build !== undefined && build !== null) {
    const names = ['catalog.json', 'grammar.json', 'registry.json'];
    if ((build.contentRevision !== undefined && (!Number.isSafeInteger(build.contentRevision) || build.contentRevision < 0 || Object.is(build.contentRevision, -0))) ||
        names.some(name => typeof build.files?.[name] !== 'string' || !/^[a-f0-9]{64}$/.test(build.files[name]))) {
      throw new TypeError('invalid accepted audio build source identity');
    }
    return payloadHash({...identity, contentRevision: build.contentRevision ?? null,
      files: Object.fromEntries(names.map(name => [name, build.files[name]]))});
  }
  if (!Array.isArray(catalog) || !Array.isArray(grammarRecords)) throw new TypeError('unpinned audio source arrays required');
  return payloadHash({...identity, catalog, grammarRecords});
}

export function startAcceptedAudioHost({store, catalog, grammarRecords, sourceRevision, native = false,
  nativeCapability = globalThis.nihongoAudioDemandStore, indexedDB = globalThis.indexedDB,
  getAssignments = () => ({}), unsupportedSources = () => [], observerOptions = {}}) {
  let observer, exporter, sink, disposed = false;
  let unavailable = {state: 'error', error: 'accepted-audio-host-start-failed', coverage: null};
  try {
    const selected = selectAudioDemandSink({native, nativeCapability, indexedDB});
    sink = selected.sink;
    if (!sink) unavailable = {state: 'persistence-unavailable', error: null, coverage: null};
    else {
      if (typeof sourceRevision !== 'string' || !sourceRevision.trim() || !Array.isArray(catalog) || !Array.isArray(grammarRecords)) {
        throw new TypeError('accepted audio source identity required');
      }
      const getOptions = state => ({sourceRevision, grammarRecords, readingRules: passageReadingRules,
        correctionLedgerRevision: passageReadingLedgerSha256,
        scope: {accessScope: `private:${payloadHash([store.scope.environment, store.scope.learner, state.epoch])}`,
          licenseScope: 'pending:learner-source-license'},
        assignments: getAssignments(), unsupportedSources: unsupportedSources()});
      observer = createAcceptedAudioObserver({...observerOptions, store, catalog, sink, getOptions});
      exporter = createAcceptedAudioExporter({store, catalog, sink, getOptions, isDisposed: () => disposed});
    }
  } catch { /* Advisory audio failure cannot abort an already durable study host. */ }
  const status = () => observer?.status() ?? {...unavailable};
  const lifecycle = globalThis.window;
  const onHide = event => { if (!event.persisted) dispose(); };
  const onShow = event => { if (event.persisted && !disposed) observer?.flush(); };
  function dispose() {
    if (disposed) return;
    disposed = true; observer?.dispose();
    lifecycle?.removeEventListener('pagehide', onHide);
    lifecycle?.removeEventListener('pageshow', onShow);
    try { Promise.resolve(sink?.close?.()).catch(() => {}); } catch { /* optional host close */ }
  }
  lifecycle?.addEventListener('pagehide', onHide);
  lifecycle?.addEventListener('pageshow', onShow);
  return Object.freeze({status, flush: () => observer?.flush() ?? Promise.resolve(status()),
    exportCurrentSource(options) {
      if (disposed || !exporter) return Promise.reject(Error(`accepted-audio-export-pending: ${disposed ? 'disposed' : 'persistence unavailable'}`));
      return exporter.exportCurrentSource(options);
    },
    dispose});
}

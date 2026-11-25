/* global structuredClone */
/** A Bunki host that brings no voice keeps the canonical study screen silent, and that screen
 * asks the network nothing: Bunki's origin serves none of Nihongo Study's Kore trial clips, so the
 * frame names an origin that is none. The real frame entry runs here with its imports replaced;
 * the real canonical trial player judges the origin the frame hands over. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL, URLSearchParams } from 'node:url';
import { TextDecoder, TextEncoder } from 'node:util';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createTrialAudio } from '../prototypes/corridor/vendor/shared-study-engine/client/app/trial-audio.mjs';

const frameURL = new URL('../prototypes/corridor/decks/player/shared-frame.mjs', import.meta.url),
  appURL = new URL(
    '../prototypes/corridor/vendor/shared-study-engine/client/app/app.mjs',
    import.meta.url,
  ),
  digest = 'a'.repeat(64),
  PAGE_ORIGIN = 'https://bunki.qa.invalid';
/** The origin the canonical screen gives its trial player: the host's, else the page's own. */
const trialOriginFor = (platform) => platform.audioOrigin ?? PAGE_ORIGIN;
/** The platform the adapter gives an unpaired host with no audio (study-engine-adapter.mjs). */
const hostPlatform = (extra = {}) =>
  Object.freeze({
    storageKind: 'bunki-shared',
    isOnline: () => true,
    startedOffline: false,
    activitySince: 0,
    presentation: 'phone',
    isPaired: () => false,
    canRequestNewCards: () => false,
    ...extra,
  });

/** Run the frame entry as written and return what it hands to the canonical mount. */
async function mountedBy(platform) {
  let mounted = null;
  const frameBinding = {
    dictionary: { buildSha256: digest },
    grammarAssets: {
      'registry.json': digest,
      'grammar.json': digest,
      'grammar-reviews.json': digest,
    },
    counts: { vocabulary: 0, grammar: 0 },
  };
  const data = {
    'registry.json': {},
    'grammar.json': {},
    'grammar-reviews.json': {},
    'tokens.json': {},
    'BUILD.json': {},
  };
  const root = {
    replaceChildren() {},
    append(value) {
      throw Error(`Frame failed to mount: ${value.textContent}`);
    },
    querySelector: () => null,
  };
  const context = vm.createContext({
    URL,
    URLSearchParams,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    structuredClone,
    location: { search: '?deck=n2&ui=en' },
    localStorage: { getItem: () => null, setItem() {} },
    document: { querySelector: () => root, createElement: () => ({ setAttribute() {} }) },
    crypto: { subtle: { digest: async () => new Uint8Array(32).fill(0xaa).buffer } },
    fetch: async (url) => {
      const value = data[new URL(url).pathname.split('/').at(-1)];
      assert.notEqual(value, undefined, String(url));
      return {
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(value)).buffer,
      };
    },
  });
  vm.runInContext(
    'globalThis.window=globalThis;globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};',
    context,
  );
  // No audio port on the frame and no pack host on the adapter: the trial host as it is today.
  context.frameElement = {
    bunkiStudyPort: {
      binding: frameBinding,
      adapter: { catalog: [], backend: {}, store: {}, platform, now: () => 0 },
      onCardStart() {},
    },
  };
  const imports = {
    '../../vendor/shared-study-engine/client/app/app.mjs': {
      mountStudyApp(_root, options) {
        mounted = options;
        return { dispose() {} };
      },
    },
    '../../vendor/shared-study-engine/client/grammar/renderer.mjs': {
      prepareGrammarModule: async () => ({ records: [], tasks: [] }),
    },
    '../../vendor/shared-study-engine/client/app/dictionary-loader.mjs': {
      loadOfflineDictionary: async () => ({}),
    },
    '../../vendor/shared-study-engine/client/player/dictionary.mjs': {
      prepareOfflineDictionary: async (dictionary) => dictionary,
    },
    '../../shared-study-presentation.mjs': {
      bindStudyPresentation: (backend) => backend,
      bindSharedStudyViewport: () => () => {},
    },
    '../../shared-study-content.mjs': {
      moduleForSharedDeck: (id) => id,
      sharedDictionaryBuild: () => ({}),
    },
  };
  const compiled = ts.transpileModule(readFileSync(frameURL, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    transformers: {
      before: [
        (transform) => (node) =>
          ts.visitNode(node, function visit(value) {
            if (ts.isMetaProperty(value) && value.keywordToken === ts.SyntaxKind.ImportKeyword)
              return ts.factory.createIdentifier('__frameImportMeta');
            return ts.visitEachChild(value, visit, transform);
          }),
      ],
    },
  }).outputText;
  await vm.runInContext(
    `(async function(exports,require,__frameImportMeta){${compiled}\n})`,
    context,
  )(
    {},
    (key) => {
      assert(Object.hasOwn(imports, key), key);
      return imports[key];
    },
    { url: frameURL.href },
  );
  assert(mounted, 'The frame entry must reach the canonical mount');
  return mounted;
}

/** The canonical trial player on an origin, with a fetch that only counts what it is asked. */
async function trialRequests(origin) {
  const asked = [];
  const trial = createTrialAudio({
    origin,
    fetch: async (url) => {
      asked.push(String(url));
      throw Error('no network in this test');
    },
    caches: undefined,
    createContext() {
      throw Error('no sound in this test');
    },
    audioSession: undefined,
  });
  const failure = await trial.load().then(
    () => null,
    (error) => error.message,
  );
  return { asked, failure, member: trial.has('nsrs-v-000000000000') };
}

describe('a Bunki host with no voice keeps the canonical study screen silent', () => {
  it('rests on the canonical screen taking the host audio origin before the page origin', () => {
    expect(readFileSync(appURL, 'utf8')).toContain(
      'createTrialAudio({origin:platform.audioOrigin??win.nihongoNativeSync?.origin??win.location?.origin})',
    );
  });

  it('hands the canonical screen an origin the trial player asks nothing of', async () => {
    const platform = hostPlatform(),
      mounted = await mountedBy(platform);
    // Neither shared audio nor a failed download is declared: the screen builds its trial player.
    expect(mounted.platform.audio).toBeUndefined();
    expect(mounted.platform.audioDownloadFailure).toBeUndefined();
    expect(await trialRequests(trialOriginFor(mounted.platform))).toEqual({
      asked: [],
      failure: 'trial-audio-origin',
      member: false,
    });
    // Everything the adapter said about the host still reaches the screen, unchanged.
    for (const [key, value] of Object.entries(platform)) expect(mounted.platform[key]).toBe(value);
  });

  it('would ask the page origin for the trial manifest with the adapter platform as it is (the control)', async () => {
    expect(await trialRequests(trialOriginFor(hostPlatform()))).toEqual({
      asked: [`${PAGE_ORIGIN}/audio/kore-20261103/manifest.json`],
      failure: 'trial-audio-network',
      member: false,
    });
  });

  it('keeps an audio origin that a host names itself', async () => {
    const mounted = await mountedBy(hostPlatform({ audioOrigin: 'https://voice.qa.invalid' }));
    expect(mounted.platform.audioOrigin).toBe('https://voice.qa.invalid');
  });
});

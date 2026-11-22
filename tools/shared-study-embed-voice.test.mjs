/* global process, URL, Buffer, window, document, setTimeout, bunkiSharedStudy */
/** Embedded single-chrome mode, 11-look visual harmony, and paired/unpaired study voice
 * (ENGINE-ONE.2 Slice 2 + ENGINE-ONE.6). Local loopback mock server + muted browser only. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startStaticHost } from '../prototypes/bunki-desktop/lib/static-host.cjs';
import { silenceBrowserAudio } from '../prototypes/corridor/tools/browser-audio-silence.mjs';
import {
  createClipStore,
  createMemoryClipStorage,
} from '../prototypes/corridor/modules/voice-clip-store.mjs';
import {
  clipKeyForSpeak,
  createStudyVoiceBridge,
  isValidVoiceCredential,
} from '../prototypes/corridor/modules/shared-study-voice.mjs';
import { createSpeechInput } from '../prototypes/corridor/modules/nihongo-speech/audio/speech-input.mjs';
import { SPEAK_PROFILE } from '../prototypes/corridor/modules/nihongo-speech/audio/speak-keys.mjs';

const { test } = await import(
  process.env.VITEST === 'true' && !process.env.NODE_TEST_CONTEXT ? 'vitest' : 'node:test'
);

const acceptance = Boolean(process.env.CI || process.env.KAIRO_SITE_DIR);
const siteDir =
  process.env.KAIRO_SITE_DIR || fileURLToPath(new URL('../prototypes/corridor', import.meta.url));

/** Build a valid tiny 80ms silent PCM WAV buffer so real browsers decode it cleanly. */
function silentWavBytes() {
  const samples = 640;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const put = (at, text) => {
    for (let i = 0; i < text.length; i += 1) bytes[at + i] = text.charCodeAt(i);
  };
  put(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  put(36, 'data');
  view.setUint32(40, samples * 2, true);
  return bytes;
}

function mintVoiceToken({
  environment = 'prod',
  learner = 'test-voice-learner',
  installation = `bunki-${randomBytes(16).toString('hex')}`,
} = {}) {
  const tuple = Buffer.from(JSON.stringify([environment, learner, installation])).toString(
    'base64url',
  );
  return {
    token: `nsrs_${environment === 'prod' ? 'prod' : 'dev'}_${tuple}.${randomBytes(32).toString('hex')}`,
    scope: { environment, learner, installation },
  };
}

/** Local loopback mock voice server matching Worker CORS + /v1/audio/speak contract. */
async function startMockVoiceServer({ allowedOrigin }) {
  const wav = Buffer.from(silentWavBytes());
  const { token, scope } = mintVoiceToken();
  const requests = [];
  let holdNext = false;
  let heldAborted = 0;
  const heldResponses = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const origin = req.headers.origin || '';
    const cors =
      origin && origin === allowedOrigin
        ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Expose-Headers':
              'X-NSRS-Audio-Voice-Id, X-NSRS-Audio-Cache, Retry-After',
            Vary: 'Origin',
          }
        : {};
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let body;
      try {
        body = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        body = null;
      }
      if (url.pathname === '/v1/audio/budget' && req.method === 'GET') {
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json', Connection: 'close' });
        res.end(
          JSON.stringify({
            capCents: 10000,
            spentCents: 10,
            reservedCents: 0,
            remainingCents: 9990,
            dayCapCents: 1000,
            daySpentCents: 10,
          }),
        );
        return;
      }
      if (url.pathname === '/v1/audio/speak' && req.method === 'POST') {
        const entry = {
          path: url.pathname,
          authorization: req.headers.authorization || '',
          body,
        };
        requests.push(entry);
        if (req.headers.authorization !== `Bearer ${token}`) {
          res.writeHead(401, { ...cors, 'Content-Type': 'application/json', Connection: 'close' });
          res.end(JSON.stringify({ error: 'authentication-required' }));
          return;
        }
        if (holdNext) {
          holdNext = false;
          req.on('close', () => {
            if (!res.writableEnded) heldAborted += 1;
          });
          heldResponses.push(res);
          return;
        }
        res.writeHead(200, {
          ...cors,
          'Content-Type': 'audio/wav',
          'Content-Length': String(wav.length),
          'X-NSRS-Audio-Voice-Id': 'qa-voice-1',
          'X-NSRS-Audio-Cache': 'miss',
          Connection: 'close',
        });
        res.end(wav);
        return;
      }
      res.writeHead(404, { ...cors, 'Content-Type': 'application/json', Connection: 'close' });
      res.end(JSON.stringify({ error: 'not-found' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    token,
    scope,
    requests,
    setHoldNext(value) {
      holdNext = value;
    },
    get heldAborted() {
      return heldAborted;
    },
    releaseHeld() {
      for (const res of heldResponses.splice(0)) {
        if (!res.writableEnded) res.destroy();
      }
    },
    close: () =>
      new Promise((resolve) => {
        for (const res of heldResponses.splice(0)) {
          if (!res.writableEnded) res.destroy();
        }
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

test('voice credential check accepts real scoped bunki- tokens and rejects placeholders or study tokens', () => {
  const real = mintVoiceToken();
  assert.equal(isValidVoiceCredential(real.token, real.scope), true);
  // Synthetic placeholder token (non-JSON tuple) is rejected.
  assert.equal(isValidVoiceCredential(`nsrs_prod_AAAA.${'a'.repeat(64)}`, real.scope), false);
  // Full study device token (bunkiweb-) is not a speak-only voice token.
  const study = mintVoiceToken({ installation: `bunkiweb-${'b'.repeat(32)}` });
  assert.equal(isValidVoiceCredential(study.token, study.scope), false);
  // Scope mismatch is rejected.
  assert.equal(
    isValidVoiceCredential(real.token, { ...real.scope, learner: 'other-learner' }),
    false,
  );
});

test('clipKeyForSpeak normalizes bare card GUIDs and voice keys to shared Bunki clip keys', () => {
  const input = createSpeechInput({
    segments: [{ language: 'ja', text: '日本語を勉強する。', pronunciationDirectives: [] }],
    profile: SPEAK_PROFILE,
  });
  assert.equal(
    clipKeyForSpeak('nsrs-v-ee75dc6b2412', input),
    'card:nsrs-v-ee75dc6b2412|日本語を勉強する。',
  );
  assert.equal(
    clipKeyForSpeak('card:nsrs-v-ee75dc6b2412', input),
    'card:nsrs-v-ee75dc6b2412|日本語を勉強する。',
  );
  assert.equal(clipKeyForSpeak('word:一本', input), 'word:一本|日本語を勉強する。');
});

test('study voice bridge arbitrates parent voice, caches locally, handles 401/forget, and aborts on dispose', async () => {
  const wav = silentWavBytes();
  const clips = createClipStore({ storage: createMemoryClipStorage() });
  const input = createSpeechInput({
    segments: [
      { language: 'ja', text: 'メール一本書くにも時間がかかる。', pronunciationDirectives: [] },
    ],
    profile: SPEAK_PROFILE,
  });
  let beforeSpeakCalls = 0;
  let authEndedCalls = 0;
  let networkCalls = 0;
  let isOnline = true;
  let nextMode = 'ok';
  let abortedSignals = 0;
  const seenBodies = [];

  const bridge = createStudyVoiceBridge({
    origin: 'http://127.0.0.1:19999',
    clips,
    online: () => isOnline,
    getCredential: async () => 'nsrs_prod_test.token',
    onBeforeSpeak: () => {
      beforeSpeakCalls += 1;
    },
    onAuthEnded: () => {
      authEndedCalls += 1;
    },
    fetch: async (url, init) => {
      networkCalls += 1;
      assert.equal(url, 'http://127.0.0.1:19999/v1/audio/speak');
      assert.equal(init.headers.Authorization, 'Bearer nsrs_prod_test.token');
      assert.deepEqual(Object.keys(init.headers).sort(), ['Authorization', 'Content-Type']);
      seenBodies.push(JSON.parse(init.body));
      if (nextMode === 'hang') {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            'abort',
            () => {
              abortedSignals += 1;
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            },
            { once: true },
          );
        });
      }
      if (nextMode === '401') {
        return {
          status: 401,
          headers: new Map(),
          json: async () => ({ error: 'authentication-required' }),
        };
      }
      const headers = new Map([
        ['Content-Type', 'audio/wav'],
        ['X-NSRS-Audio-Voice-Id', 'voice-a'],
        ['X-NSRS-Audio-Cache', 'miss'],
      ]);
      return {
        status: 200,
        headers: { get: (k) => headers.get(k) ?? null },
        arrayBuffer: async () => wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength),
      };
    },
  });

  // 1. Bare card GUID sends cardGuid and returns base64 bytes + cache miss.
  const first = await bridge.speak('nsrs-v-ee75dc6b2412', input);
  assert.equal(first.ok, true);
  assert.equal(first.contentType, 'audio/wav');
  assert.equal(first.voice, 'voice-a');
  assert.equal(first.cache, 'miss');
  assert.equal(beforeSpeakCalls, 1);
  assert.equal(networkCalls, 1);
  assert.equal(seenBodies[0].cardGuid, 'nsrs-v-ee75dc6b2412');
  assert.equal(seenBodies[0].voiceKey, undefined);

  // 2. Second request (even via card: voiceKey and offline) hits local clip store with 0 network calls.
  await clips.idle();
  isOnline = false;
  const cached = await bridge.speak('card:nsrs-v-ee75dc6b2412', input);
  assert.equal(cached.ok, true);
  assert.equal(cached.cache, 'local');
  assert.equal(cached.bytes, first.bytes);
  assert.equal(networkCalls, 1);
  assert.equal(beforeSpeakCalls, 2);

  // 3. forget() drops cached clip so next speak hits network again with voiceKey.
  await bridge.forget('card:nsrs-v-ee75dc6b2412', input);
  isOnline = true;
  const refetched = await bridge.speak('card:nsrs-v-ee75dc6b2412', input);
  assert.equal(refetched.ok, true);
  assert.equal(networkCalls, 2);
  assert.equal(seenBodies[1].voiceKey, 'card:nsrs-v-ee75dc6b2412');
  assert.equal(seenBodies[1].cardGuid, undefined);

  // 4. 401 ends pairing cleanly without throwing.
  nextMode = '401';
  const unauth = await bridge.speak('word:新規語', input);
  assert.deepEqual(unauth, { ok: false, error: 'authentication-required' });
  assert.equal(authEndedCalls, 1);

  // 5. abortAll() aborts in-flight fetch and rejects future speaks cleanly.
  nextMode = 'hang';
  const pending = bridge.speak('word:中断テスト', input);
  await new Promise((resolve) => setTimeout(resolve, 20));
  bridge.abortAll();
  const aborted = await pending;
  assert.deepEqual(aborted, { ok: false, error: 'aborted' });
  assert.equal(abortedSignals, 1);
  assert.deepEqual(await bridge.speak('word:中断テスト', input), { ok: false, error: 'aborted' });
});

test(
  'browser: embedded single-chrome mode, 11-look visual harmony, silent unpaired study, and paired voice E2E',
  { skip: !acceptance && !process.env.BUNKI_TEST_CHROME, timeout: 180000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)('playwright-core');
    const host = await startStaticHost({ site: siteDir, port: 0 });
    const voiceServer = await startMockVoiceServer({ allowedOrigin: host.origin });
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.CHROMIUM_PATH ||
          (!acceptance && process.env.BUNKI_TEST_CHROME !== '1'
            ? process.env.BUNKI_TEST_CHROME
            : undefined),
      });

      // --- 1 & 2: Unpaired browser — embedded single-chrome, 11-look sync, language sync, 100% silent ---
      const silentContext = await browser.newContext({
        viewport: { width: 1280, height: 820 },
        serviceWorkers: 'block',
      });
      await silenceBrowserAudio(silentContext);
      const speechSynthCalls = [];
      const externalRequests = [];
      await silentContext.addInitScript(() => {
        window.__speechSynthCalls = 0;
        try {
          Object.defineProperty(window, 'speechSynthesis', {
            value: {
              speak() {
                window.__speechSynthCalls += 1;
              },
              cancel() {},
              getVoices: () => [],
            },
            configurable: true,
          });
        } catch {
          /* ignore */
        }
      });
      const silentPage = await silentContext.newPage();
      const pageErrors = [];
      silentPage.on('pageerror', (err) => pageErrors.push(err.message));
      silentPage.on('request', (req) => {
        const url = req.url();
        if (
          !url.startsWith(`${host.origin}/`) ||
          url.includes('/v1/audio/') ||
          url.includes('/audio/kore-')
        ) {
          externalRequests.push(url);
        }
      });

      await silentPage.goto(`${host.origin}/?deck=n2&sharedStudy=preview&ui=en`, {
        waitUntil: 'domcontentloaded',
      });
      await silentPage.locator('[data-shared-study="ready"] [data-shared-study-frame]').waitFor({
        timeout: 60000,
      });
      const frame = await (
        await silentPage.locator('[data-shared-study-frame]').elementHandle()
      ).contentFrame();
      await frame.waitForFunction(() => !!window.bunkiSharedStudy, null, { timeout: 60000 });

      // Single-chrome assertions.
      const chrome = await frame.evaluate(() => ({
        embedded: document.documentElement.dataset.embedded,
        headers: document.querySelectorAll('.app-header').length,
        banners: document.querySelectorAll('.qa-banner').length,
        navs: document.querySelectorAll('nav').length,
        footers: document.querySelectorAll('footer').length,
        ears: document.querySelectorAll('.ear-mark').length,
        hasSpeak: 'nihongoSpeak' in window,
        bunkiTheme: document.documentElement.dataset.bunkiTheme,
        baseTheme: document.documentElement.dataset.theme,
        scheme: document.documentElement.style.colorScheme,
        lang: bunkiSharedStudy.app.read().interfaceLanguage,
      }));
      assert.deepEqual(chrome, {
        embedded: '1',
        headers: 0,
        banners: 0,
        navs: 0,
        footers: 0,
        ears: 1,
        hasSpeak: false,
        bunkiTheme: 'hokusai',
        baseTheme: 'washi',
        scheme: 'light',
        lang: 'en',
      });
      assert.equal(
        await silentPage.locator('[data-shared-study="ready"] > .shared-study-back').count(),
        1,
      );

      // Dynamic 11-look visual harmony sync (all 6 day + all 5 night looks without reloading iframe).
      const looks = [
        ['rokusho', 'dark', 'dark'],
        ['yoru', 'ai', 'dark'],
        ['nami', 'ai', 'dark'],
        ['hakuu', 'dark', 'dark'],
        ['kaku', 'dark', 'dark'],
        ['sumi', 'washi', 'light'],
        ['shu', 'washi', 'light'],
        ['akafuji', 'washi', 'light'],
        ['iwa', 'washi', 'light'],
        ['keyblock', 'washi', 'light'],
        ['', 'washi', 'light'],
      ];
      for (const [attr, expectedBase, expectedScheme] of looks) {
        await silentPage.evaluate((value) => {
          document.documentElement.setAttribute('data-theme', value);
        }, attr);
        const expectedLook = attr || 'hokusai';
        await frame.waitForFunction(
          (look) => document.documentElement.dataset.bunkiTheme === look,
          expectedLook,
          { timeout: 5000 },
        );
        const synced = await frame.evaluate(() => ({
          bunkiTheme: document.documentElement.dataset.bunkiTheme,
          baseTheme: document.documentElement.dataset.theme,
          scheme: document.documentElement.style.colorScheme,
          ground: document.documentElement.style.getPropertyValue('--ground').trim(),
          texture: document.documentElement.style.getPropertyValue('--texture').trim(),
        }));
        const parentGround = await silentPage.evaluate(() =>
          window.getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
        );
        assert.equal(synced.bunkiTheme, expectedLook);
        assert.equal(synced.baseTheme, expectedBase);
        assert.equal(synced.scheme, expectedScheme);
        assert.equal(synced.ground, parentGround);
        assert.equal(synced.texture, 'none');
      }

      // Dynamic language sync without reload on Today.
      await silentPage.evaluate(() => {
        document.body.classList.remove('ui-bi');
        document.documentElement.setAttribute('lang', 'ja');
      });
      await frame.waitForFunction(
        () => bunkiSharedStudy.app.read().interfaceLanguage === 'ja',
        null,
        {
          timeout: 5000,
        },
      );
      await silentPage.evaluate(() => {
        document.body.classList.add('ui-bi');
        document.documentElement.setAttribute('lang', 'en');
      });
      await frame.waitForFunction(
        () => bunkiSharedStudy.app.read().interfaceLanguage === 'en',
        null,
        {
          timeout: 5000,
        },
      );

      // Unpaired study interaction: start, reveal, tap ear, press P -> 0 audio requests, 0 speechSynthesis calls.
      await frame.locator('[data-start]:not(:disabled)').click();
      await frame.locator('[data-reveal]').click();
      await frame.waitForSelector('[data-study=back]');
      await frame.locator('.ear-mark').click();
      await frame.locator('[data-card]').press('p');
      await silentPage.waitForTimeout(200);
      speechSynthCalls.push(
        await silentPage.evaluate(() => window.__speechSynthCalls || 0),
        await frame.evaluate(() => window.__speechSynthCalls || 0),
      );
      assert.deepEqual(speechSynthCalls, [0, 0]);
      assert.deepEqual(externalRequests, []);
      assert.deepEqual(pageErrors, []);
      await silentContext.close();

      // --- 3: Paired voice browser — card speaker, speak-on-reveal, ear tap, and clean abort on leave ---
      const voiceContext = await browser.newContext({
        viewport: { width: 1280, height: 820 },
        serviceWorkers: 'block',
      });
      await silenceBrowserAudio(voiceContext);
      const voicePage = await voiceContext.newPage();
      const voiceErrors = [];
      voicePage.on('pageerror', (err) => voiceErrors.push(err.message));

      // Seed Bunki's paired voice credential in bunki-voice IndexedDB using a real scoped bunki- token.
      await voicePage.goto(`${host.origin}/?ui=en`, { waitUntil: 'domcontentloaded' });
      await voicePage.evaluate(
        `(async ({ server, token, scope }) => {
          const { createDeviceTokenStore } = await import('/modules/voice-client.mjs');
          await createDeviceTokenStore(globalThis).write({ server, token, scope });
        })(${JSON.stringify({
          server: voiceServer.origin,
          token: voiceServer.token,
          scope: voiceServer.scope,
        })})`,
      );

      await voicePage.goto(`${host.origin}/?deck=n2&sharedStudy=preview&ui=en`, {
        waitUntil: 'domcontentloaded',
      });
      await voicePage.locator('[data-shared-study="ready"] [data-shared-study-frame]').waitFor({
        timeout: 60000,
      });
      const vFrame = await (
        await voicePage.locator('[data-shared-study-frame]').elementHandle()
      ).contentFrame();
      await vFrame.waitForFunction(() => !!window.bunkiSharedStudy, null, { timeout: 60000 });

      assert.equal(
        await vFrame.evaluate(
          () =>
            window.nihongoSpeak?.web === true && typeof window.nihongoSpeak?.speak === 'function',
        ),
        true,
        'Paired voice bridge must expose window.nihongoSpeak inside the embedded frame',
      );

      // Start & reveal a card -> speak-on-reveal / card speaker calls POST /v1/audio/speak with cardGuid.
      await vFrame.locator('[data-start]:not(:disabled)').click();
      await vFrame.locator('[data-reveal]').waitFor({ state: 'visible' });
      await vFrame.locator('[data-reveal]').click();
      await vFrame.waitForSelector('[data-study=back]');

      // Also click answer speaker control explicitly if present, or press P.
      const answerAudio = vFrame.locator('[data-card-audio="answer"]');
      if (await answerAudio.count()) {
        await answerAudio.first().click();
      } else {
        await vFrame.locator('[data-card]').press('p');
      }
      await voicePage.waitForTimeout(350);
      assert(
        voiceServer.requests.length >= 1,
        `Expected at least 1 /v1/audio/speak call on reveal/card speaker, got ${voiceServer.requests.length}`,
      );
      const firstSpeak = voiceServer.requests[0];
      assert.equal(firstSpeak.authorization, `Bearer ${voiceServer.token}`);
      assert.equal(firstSpeak.body?.format, 'nihongo-speech-input');
      assert(
        typeof firstSpeak.body?.cardGuid === 'string' ||
          typeof firstSpeak.body?.voiceKey === 'string',
        `Expected cardGuid or voiceKey in speak payload: ${JSON.stringify(firstSpeak.body)}`,
      );

      // Arm ear mark and tap a revealed word in the passage -> invokes /v1/audio/speak with a voiceKey.
      const beforeEar = voiceServer.requests.length;
      await vFrame.locator('.ear-mark').click();
      const targetWord = vFrame.locator('[data-passage=passage] [data-word]').first();
      await targetWord.click();
      await voicePage.waitForTimeout(350);
      assert(
        voiceServer.requests.length > beforeEar,
        'Ear tap on passage word must invoke /v1/audio/speak',
      );
      const earSpeak = voiceServer.requests.at(-1);
      assert.equal(earSpeak.authorization, `Bearer ${voiceServer.token}`);
      assert.match(earSpeak.body?.voiceKey || '', /^(?:card|word|record):/);

      // Hold the next /v1/audio/speak call and click Back to Bunki -> in-flight request aborts cleanly.
      voiceServer.setHoldNext(true);
      const beforeLeave = voiceServer.requests.length;
      const pendingSpeak = vFrame
        .evaluate(() =>
          window.nihongoSpeak.speak('word:離脱確認', {
            format: 'nihongo-speech-input',
            version: 1,
            inputKey: '0'.repeat(64),
            segments: [{ language: 'ja', text: '離脱確認', pronunciationDirectives: [] }],
            profile: {
              provider: 'google-cloud-tts',
              voice: 'ja-JP-Chirp3-HD-Leda',
              language: 'ja-JP',
              encoding: 'MP3',
              speakingRate: 1,
              pitch: 0,
              volumeGainDb: 0,
              sampleRateHertz: 24000,
            },
          }),
        )
        .catch(() => null);
      const deadline = Date.now() + 5000;
      while (voiceServer.requests.length === beforeLeave && Date.now() < deadline) {
        await voicePage.waitForTimeout(30);
      }
      assert.equal(voiceServer.requests.length, beforeLeave + 1);
      await voicePage.locator('[data-shared-study="ready"] > .shared-study-back').click();
      await voicePage
        .locator('[data-shared-study-frame]')
        .waitFor({ state: 'detached', timeout: 10000 });
      await pendingSpeak.catch(() => null);
      await voicePage.waitForTimeout(200);
      assert(
        voiceServer.heldAborted >= 1,
        'Leaving shared study must abort in-flight voice requests cleanly',
      );
      assert.deepEqual(voiceErrors, []);
      await voiceContext.close();
    } finally {
      await browser?.close();
      await voiceServer.close();
      await host.close();
    }
  },
);

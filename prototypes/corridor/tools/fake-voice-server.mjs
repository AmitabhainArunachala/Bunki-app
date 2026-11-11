/** A local stand-in for the voice server (the Nihongo Worker's three speak routes), for tests and muted proofs only.
 *
 * Built from the client contract v1 (2026-11-10) and the Worker's own judges (nihongo-srs tests/worker/
 * speak-bunki-cases.mjs at 41af9e7): exact-origin CORS on /v1/pair/redeem-speak, /v1/audio/speak and /v1/audio/budget,
 * a one-time 12-character code that pairs a `bunki-<32 hex>` installation, a speak-only bearer token, one voice per
 * voice key, the shared caps, and the contract's error codes. It makes no sound and calls no provider: a 200 carries a
 * short silent WAV. Nothing here is a real credential; tokens are random and live only in this process.
 *
 *   const fake = await startFakeVoiceServer({ origins: ['http://127.0.0.1:19471'] });
 *   const code = fake.issue({ learner: 'test-learner' });      // a pairing code, as release would hand over
 *   fake.failNext({ status: 503, error: 'voice-unavailable' }); // script the next speak answer
 *   fake.log                                                    // every request, without its token
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createSpeechInput } from '../modules/nihongo-speech/audio/speech-input.mjs';
import { SPEAK_PROFILE } from '../modules/nihongo-speech/audio/speak-keys.mjs';
import { MAX_DYNAMIC_CODEPOINTS, isJapaneseEnough, isNormalSpeechText, isVoiceKey, voiceSeed } from '../modules/nihongo-speech/audio/speech-text.mjs';
import { canonicalStringify } from '../modules/nihongo-speech/schema/event.mjs';

const ROUTES = new Set(['/v1/pair/redeem-speak', '/v1/audio/speak', '/v1/audio/budget']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CODE = /^[A-F0-9]{12}$/;
const ROSTER = ['fake-voice-a', 'fake-voice-b', 'fake-voice-c', 'fake-voice-d'];
const hex = (bytes) => randomBytes(bytes).toString('hex');
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** A silent 16-bit mono WAV of the given length: real audio a browser plays, with nothing to hear. */
export function silentWav(seconds = 0.6, rate = 8000) {
  const samples = Math.max(1, Math.round(seconds * rate));
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples * 2, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

export async function startFakeVoiceServer({ origins = [], port = 0, capCents = 2500, dayCents = 300, missesPerMinute = 20,
  centsPer1k = 8, clipSeconds = (text) => Math.min(1.6, 0.35 + [...text].length * 0.04), now = () => Date.now(),
  // a clip that arrives late: `holdMs(text, n)` (n counts speak requests from 1) is how long its good answer is held back
  holdMs = () => 0 } = {}) {
  const allowed = new Set(origins);
  const codes = new Map();          // code → { learner, installation }
  const tokens = new Map();         // token → { learner, installation }
  const paired = new Set();         // installations that hold a token
  const cache = new Set();          // `${inputKey}|${voice}` already paid for
  const misses = [];                // times of the uncached speaks
  const scripted = [];
  const log = [];
  let spentCents = 0, daySpent = 0, pairingOff = false, pairLimited = false, dayFields = false, speakCount = 0;

  const cors = (req) => {
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) return null;
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Expose-Headers': 'X-NSRS-Audio-Voice-Id, Retry-After' };
  };
  const send = (req, res, status, body, headers = {}) => {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    res.writeHead(status, { 'Content-Type': Buffer.isBuffer(body) ? 'audio/wav' : 'application/json', 'Cache-Control': 'no-store',
      ...(cors(req) || {}), ...headers, 'Content-Length': payload.length });
    res.end(payload);
    return status;
  };
  const readJson = (req) => new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(undefined); } });
    req.on('error', () => resolve(undefined));
  });
  const bearer = (req) => {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    return match && tokens.has(match[1]) ? tokens.get(match[1]) : null;
  };
  const jsonBody = (req) => /^application\/json(?:;|$)/i.test(req.headers['content-type'] || '');

  async function handle(req, res) {
    const url = new URL(req.url, 'http://fake.invalid');
    const row = { method: req.method, path: url.pathname, origin: req.headers.origin || null, authorized: !!bearer(req) };
    log.push(row);
    const done = (status, body, headers) => { row.status = send(req, res, status, body, headers); if (body && body.error) row.error = body.error; };
    if (req.method === 'OPTIONS') {
      const grant = ROUTES.has(url.pathname) ? cors(req) : null;
      if (!grant) { row.status = 403; res.writeHead(403); res.end(); return; }
      row.status = 204;
      res.writeHead(204, { ...grant, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Max-Age': '600' });
      res.end();
      return;
    }
    if (url.pathname === '/v1/pair/redeem-speak' && req.method === 'POST') {
      if (pairingOff) return done(503, { error: 'pairing-unavailable' });
      if (pairLimited) return done(429, { error: 'authentication-rate-limit' }, { 'Retry-After': '60' });
      const body = jsonBody(req) ? await readJson(req) : undefined;
      row.bodyKeys = body && typeof body === 'object' ? Object.keys(body).sort() : null;
      row.sentAuthorization = !!req.headers.authorization;
      if (!body || Object.keys(body).sort().join('|') !== 'code|environment|learner' || body.environment !== 'prod' ||
          typeof body.learner !== 'string' || !ID.test(body.learner) || /^nsrs_/i.test(body.learner) ||
          typeof body.code !== 'string' || !CODE.test(body.code)) return done(400, { error: 'invalid-pairing' });
      const issued = codes.get(body.code);
      if (!issued || issued.learner !== body.learner) return done(401, { error: 'authentication-required' });
      if (paired.has(issued.installation)) return done(409, { error: 'installation-exists' });
      codes.delete(body.code);
      const scope = { environment: 'prod', learner: issued.learner, installation: issued.installation };
      const tuple = Buffer.from(JSON.stringify([scope.environment, scope.learner, scope.installation])).toString('base64url');
      const token = `nsrs_prod_${tuple}.${hex(32)}`;
      tokens.set(token, scope);
      paired.add(scope.installation);
      row.installation = scope.installation;
      return done(200, { scope, token });
    }
    if (url.pathname === '/v1/audio/budget' && req.method === 'GET') {
      if (!bearer(req)) return done(401, { error: 'authentication-required' });
      return done(200, { capCents, spentCents, reservedCents: 0, remainingCents: Math.max(0, capCents - spentCents),
        // the day's own figures are not in the Worker tonight; a later build adds them
        ...(dayFields ? { dayCapCents: dayCents, daySpentCents: daySpent } : {}) });
    }
    if (url.pathname === '/v1/audio/speak' && req.method === 'POST') {
      const body = jsonBody(req) ? await readJson(req) : undefined;
      row.bodyKeys = body && typeof body === 'object' ? Object.keys(body).sort() : null;
      row.voiceKey = body?.voiceKey ?? null;
      row.text = body?.segments?.[0]?.text ?? null;
      row.nth = ++speakCount;
      if (!bearer(req)) return done(401, { error: 'authentication-required' });
      if (scripted.length) { const next = scripted.shift(); return done(next.status, { error: next.error }, next.headers); }
      if (!body || Object.keys(body).sort().join('|') !== 'format|inputKey|profile|segments|version|voiceKey') return done(400, { error: 'speech-input-invalid' });
      let input;
      try { input = createSpeechInput({ segments: body.segments, profile: body.profile }); } catch { return done(400, { error: 'speech-input-invalid' }); }
      if (body.format !== input.format || body.version !== input.version || body.inputKey !== input.inputKey ||
          input.segments.length !== 1 || input.segments[0].language !== 'ja' || input.segments[0].pronunciationDirectives.length ||
          !isVoiceKey(body.voiceKey)) return done(400, { error: 'speech-input-invalid' });
      row.inputKeyMatches = true;
      if (canonicalStringify(input.profile) !== canonicalStringify(SPEAK_PROFILE)) return done(400, { error: 'profile-not-approved' });
      const text = input.segments[0].text;
      if (!isNormalSpeechText(text)) return done(400, { error: 'speech-input-not-normal' });
      if (!isJapaneseEnough(text)) return done(400, { error: 'japanese-only' });
      if ([...text].length > MAX_DYNAMIC_CODEPOINTS) return done(413, { error: 'speech-input-too-large' });
      const voice = ROSTER[parseInt(sha256(voiceSeed(body.voiceKey)).slice(0, 8), 16) % ROSTER.length];
      const key = `${input.inputKey}|${voice}`;
      row.cached = cache.has(key);
      if (!row.cached) {
        const cost = Math.ceil(([...text].length * centsPer1k) / 1000);
        if (spentCents + cost > capCents) return done(402, { error: 'budget-exhausted' });
        if (daySpent + cost > dayCents) return done(429, { error: 'day-budget' });
        const since = now() - 60000;
        while (misses.length && misses[0] < since) misses.shift();
        if (misses.length >= missesPerMinute) return done(429, { error: 'request-rate-limit' }, { 'Retry-After': '60' });
        misses.push(now());
        spentCents += cost; daySpent += cost;
        cache.add(key);
      }
      row.voice = voice;
      const late = Number(holdMs(text, row.nth)) || 0;
      if (late > 0) { row.heldMs = late; await new Promise((resolve) => setTimeout(resolve, late)); }
      return done(200, silentWav(clipSeconds(text)), { 'X-NSRS-Audio-Voice-Id': voice });
    }
    // every other route refuses a speak-only token, sync included
    return done(bearer(req) ? 401 : 404, { error: bearer(req) ? 'authentication-required' : 'not-found' });
  }

  const server = createServer((req, res) => { handle(req, res).catch(() => { try { res.writeHead(500); res.end(); } catch { /* closed */ } }); });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, log,
    /** A one-time pairing code for a fresh Bunki installation, as release would issue it. */
    issue({ learner = 'test-learner', installation = `bunki-${hex(16)}` } = {}) {
      const code = hex(6).toUpperCase();
      codes.set(code, { learner, installation });
      return code;
    },
    allow(origin) { allowed.add(origin); },
    failNext(...answers) { scripted.push(...answers.flat()); },
    revokeAll() { tokens.clear(); },
    set({ pairingOff: off, pairLimited: limited, spentCents: spent, daySpent: day, dayFields: fields } = {}) {
      if (fields !== undefined) dayFields = fields;
      if (off !== undefined) pairingOff = off;
      if (limited !== undefined) pairLimited = limited;
      if (spent !== undefined) spentCents = spent;
      if (day !== undefined) daySpent = day;
    },
    speaks: () => log.filter((row) => row.path === '/v1/audio/speak' && row.method === 'POST'),
    /** What the stand-in has charged so far, in cents. */
    money: () => ({ spentCents, daySpent }),
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}

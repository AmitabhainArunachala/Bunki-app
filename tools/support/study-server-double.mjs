/* global Buffer, URL */
/** A stand-in for the Nihongo Study server on this machine, for the paired-study browser proofs (ENGINE-ONE.3).
 *
 * It listens on a loopback port and answers the routes a study device uses, the way the server answers a browser
 * at a listed study origin: `POST /v1/pair` ({ scope, code } for the installation the code was minted for),
 * `GET` and `POST /v1/events`, `POST /v1/permits`. A preflight is answered for a listed origin only, with exactly
 * the methods and request headers of that route. A token paired from a listed origin belongs to that origin: the
 * same token presented from another origin answers 401 `origin-mismatch`; a `bunkiweb-` token paired with no listed
 * origin answers every page that way (the server fails closed); with no Origin (a client that is no page) a token
 * answers as before. It keeps one test learner's ledger in memory, mints its own made-up pairing codes, and can
 * revoke a device, lose one upload reply, or go silent. It is not the server: the proofs against the real local
 * server are scripts/verify-paired-study-real-server.mjs (this harness page) and scripts/verify-paired-study-browser.mjs
 * (a built site). Never deployed. */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  dayBounds,
  payloadHash,
  SYNC_COMPATIBILITY,
} from '../../prototypes/corridor/vendor/shared-study-engine/client/engine.mjs';

const hex = (bytes) => randomBytes(bytes).toString('hex');
const BROWSER_CLASS = /^bunkiweb-[a-f0-9]{32}$/;
/** The server's own table: what a page at a listed origin may send to each route, and nothing else. */
const ROUTES = new Map([
  [
    '/v1/events',
    { methods: 'GET, POST', headers: 'authorization, content-type, x-nsrs-reducer-sha256' },
  ],
  [
    '/v1/permits',
    { methods: 'POST', headers: 'authorization, content-type, x-nsrs-reducer-sha256' },
  ],
  ['/v1/pair', { methods: 'POST', headers: 'content-type, x-nsrs-reducer-sha256' }],
]);

export async function startStudyServerDouble({
  allowedOrigins = [],
  learner = 'test-paired-learner',
  environment = 'dev',
  port = 0,
  now = Date.now,
} = {}) {
  const rows = [];
  const codes = new Map();
  const tokens = new Map();
  const grants = new Map();
  const log = [];
  const knobs = {
    reducer: SYNC_COMPATIBILITY.reducerSha256,
    loseUploadReply: false,
    silent: false,
  };

  // the server's own events are numbered along the server's own stream, as every device's are along its own:
  // a grant that comes after a device's review is still the next server event, not the next row of the ledger
  let serverEvents = 0;
  function grant(installation, count) {
    const seq = rows.length + 1;
    const dseq = ++serverEvents;
    const event = {
      v: 4,
      id: `@server:${dseq}`,
      learner,
      install: '@server',
      dseq,
      base: seq - 1,
      ts: now(),
      epoch: 0,
      policy: 'nsrs-policy-v1',
      type: 'permit-grant',
      data: {
        install: installation,
        permitIds: Array.from({ length: count }, (_, index) => `double-${seq}-${index}`),
        ...dayBounds(now(), 'Asia/Tokyo'),
      },
    };
    rows.push({ seq, rt: now(), authority: 'server', event, bodyHash: payloadHash(event) });
    return seq;
  }
  const mintToken = (scope) => {
    const tuple = Buffer.from(
      JSON.stringify([scope.environment, scope.learner, scope.installation]),
    ).toString('base64url');
    return `nsrs_${scope.environment === 'prod' ? 'prod' : 'dev'}_${tuple}.${hex(32)}`;
  };
  const readBody = (request) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      request.on('data', (chunk) => {
        size += chunk.length;
        if (size > 512 * 1024) reject(new Error('too-large'));
        else chunks.push(chunk);
      });
      request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      request.on('error', reject);
    });

  /** One request, after CORS: answers [status, body], or null for a reply that is lost on the way. */
  async function route(request, url, origin, listed) {
    const stale = () =>
      request.headers['x-nsrs-reducer-sha256'] === knobs.reducer
        ? null
        : [426, { error: 'update-required' }];
    if (url.pathname === '/v1/pair' && request.method === 'POST') {
      const refused = stale();
      if (refused) return refused;
      let body;
      try {
        body = JSON.parse(await readBody(request));
      } catch {
        return [400, { error: 'invalid-pairing' }];
      }
      const scope = body?.scope;
      if (
        !body ||
        Object.keys(body).sort().join('|') !== 'code|scope' ||
        Object.keys(scope || {})
          .sort()
          .join('|') !== 'environment|installation|learner' ||
        scope.environment !== environment
      )
        return [400, { error: 'invalid-pairing' }];
      const code = codes.get(body.code);
      if (
        !code ||
        code.consumed ||
        code.expiresAt <= now() ||
        code.learner !== scope.learner ||
        code.installation !== scope.installation
      )
        return [401, { error: 'authentication-required' }];
      if ([...tokens.values()].some((row) => row.scope.installation === code.installation))
        return [409, { error: 'installation-exists' }];
      code.consumed = true;
      const token = mintToken(scope);
      // a token paired by a page at a listed origin belongs to that origin; any other pairing is unbound
      tokens.set(token, { scope, revoked: false, origin: listed ? origin : null });
      return [200, { scope, token }];
    }
    const bearer = /^Bearer (.+)$/.exec(request.headers.authorization || '')?.[1];
    const device = bearer ? tokens.get(bearer) : null;
    const admit = () => {
      if (!device || device.revoked) return [401, { error: 'authentication-required' }];
      // as the server does: a token answers the origin it was paired from, and a browser-class token paired with no
      // listed origin (or restored without one) answers no page at all; a request with no Origin is not checked
      if (
        origin &&
        (device.origin ? origin !== device.origin : BROWSER_CLASS.test(device.scope.installation))
      )
        return [401, { error: 'origin-mismatch' }];
      return stale();
    };
    if (url.pathname === '/v1/events' && ['GET', 'POST'].includes(request.method)) {
      const refused = admit();
      if (refused) return refused;
      const scope = device.scope;
      if (request.method === 'POST') {
        const body = JSON.parse(await readBody(request));
        for (const row of body.events) {
          const existing = rows.find((kept) => kept.event.id === row.event.id);
          if (existing && existing.bodyHash !== row.bodyHash) return [409, { error: 'conflict' }];
          if (!existing)
            rows.push({ ...row, seq: rows.length + 1, rt: now(), authority: 'device' });
        }
        if (knobs.loseUploadReply) {
          knobs.loseUploadReply = false;
          return null;
        }
        return [
          200,
          {
            scope,
            head: rows.length,
            acks: body.events.map(({ event, bodyHash }) => ({
              id: event.id,
              bodyHash,
              seq: rows.find((kept) => kept.event.id === event.id).seq,
            })),
          },
        ];
      }
      const after = Number(url.searchParams.get('after'));
      return [200, { scope, head: rows.length, events: rows.filter((row) => row.seq > after) }];
    }
    if (url.pathname === '/v1/permits' && request.method === 'POST') {
      const refused = admit();
      if (refused) return refused;
      const body = JSON.parse(await readBody(request));
      const key = `${device.scope.installation}|${body.requestId}`;
      const earlier = grants.get(key);
      if (earlier && earlier.count !== body.count) return [409, { error: 'conflict' }];
      if (!earlier)
        grants.set(key, { count: body.count, seq: grant(device.scope.installation, body.count) });
      return [
        200,
        {
          scope: device.scope,
          grant: { seq: grants.get(key).seq, count: body.count },
          head: rows.length,
        },
      ];
    }
    return [404, { error: 'not-found' }];
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const origin = request.headers.origin ?? null;
    const study = ROUTES.get(url.pathname) ?? null;
    const listed = !!study && origin !== null && allowedOrigins.includes(origin);
    log.push({
      method: request.method,
      path: url.pathname,
      origin,
      authorized: Boolean(request.headers.authorization),
      at: now(),
    });
    if (knobs.silent) {
      request.socket.destroy();
      return;
    }
    const send = (status, body, headers = {}) => {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        // One connection per request: a loaded CI runner otherwise lets Node's fetch reuse a kept-alive
        // socket this server is closing, and the next request fails with ECONNRESET (seen on GitHub).
        Connection: 'close',
        // errors too: a page must read 401, 409, 426 and 429 to act on them
        ...(listed
          ? {
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Expose-Headers': 'Retry-After',
              Vary: 'Origin',
            }
          : {}),
        ...headers,
      });
      response.end(body === null ? '' : JSON.stringify(body));
    };
    if (request.method === 'OPTIONS') {
      if (!listed) return send(403, { error: 'origin-not-allowed' });
      return send(204, null, {
        'Access-Control-Allow-Methods': study.methods,
        'Access-Control-Allow-Headers': study.headers,
        'Access-Control-Max-Age': '600',
      });
    }
    route(request, url, origin, listed).then(
      (answer) => {
        if (answer === null) request.socket.destroy();
        else send(answer[0], answer[1]);
      },
      () => send(500, { error: 'server-failed' }),
    );
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    learner,
    environment,
    rows,
    log,
    knobs,
    /** An admin mints a code for one named installation of the learner; `line` is what the learner pastes. */
    mint({ installation = `bunkiweb-${hex(16)}`, lastsMs = 600000 } = {}) {
      const code = hex(6).toUpperCase();
      codes.set(code, { learner, installation, expiresAt: now() + lastsMs, consumed: false });
      return {
        code,
        installation,
        line: `Bunki study code: ${code} (10 minutes) · learner: ${learner} · device: ${installation} · server: ${origin} · environment: ${environment}`,
      };
    },
    revoke(installation) {
      for (const row of tokens.values())
        if (row.scope.installation === installation) row.revoked = true;
    },
    tokenOf(installation) {
      for (const [token, row] of tokens) if (row.scope.installation === installation) return token;
      return null;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

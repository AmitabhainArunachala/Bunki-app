/* global Request, URL */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import worker from '../worker.mjs';
import { memoryKv, PIXEL_PNG, startMockGithub } from '../test-support.mjs';

const KEY = 'k'.repeat(20) + '_test-key';
const APP = 'https://amitabhainarunachala.github.io';
let github;
let env;

before(async () => {
  github = await startMockGithub();
});
after(() => github.close());
beforeEach(() => {
  github.state.issues.length = 0;
  github.state.comments.length = 0;
  github.state.failCreate = false;
  env = {
    REPORTS: memoryKv(),
    GITHUB_TOKEN: 'test-github-token',
    REPORT_KEY: KEY,
    GITHUB_REPO: 'AmitabhainArunachala/Bunki-app',
    GITHUB_API: github.origin,
  };
});

const call = (path, { method = 'GET', body, token, origin = APP, raw } = {}) =>
  worker.fetch(
    new Request(`https://relay.example.workers.dev${path}`, {
      method,
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined || raw ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(raw ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    env,
  );
const api = (path) => `/k/${KEY}/api${path}`;

async function signIn() {
  const response = await call(api('/session'), { method: 'POST', body: {} });
  assert.equal(response.status, 201);
  return response.json();
}

function report(actor, overrides = {}) {
  return {
    schema_version: 'bunki.maintenance/v1',
    id: 'report_0123456789abcdef0123456789abcdef',
    revision: 1,
    created_at: '2026-10-13T03:00:00.000Z',
    origin: { kind: 'user', actor_ref: actor, model_ref: null },
    context: {
      app_id: 'bunki',
      surface: 'corridor/reader',
      route: '/Bunki-app/index.html',
      build: { git_sha: null, artifact_sha256: null },
      content_ids: ['passage-01'],
      locale: 'en',
    },
    evidence: [
      {
        id: 'evidence_1',
        kind: 'user_quote',
        summary: 'The popup covers 天気.',
        artifact_ref: null,
      },
      {
        id: 'evidence_2',
        kind: 'action_trace',
        summary: JSON.stringify({
          viewport: { width: 390, height: 844 },
          app_version: '1.1.0',
          action_trace: [{ action: 'view', target: 'reader' }],
        }),
        artifact_ref: null,
      },
    ],
    execution_authority: 'none',
    kind: 'learner_report',
    category: 'bug',
    user_words: 'The popup covers 天気.\nIt hides the word.',
    expected: 'The popup sits below the word.',
    actual: 'The popup covers 天気.',
    reproduction_steps: [],
    attachment_ids: [],
    ...overrides,
  };
}

async function file(session, payload) {
  const raw = JSON.stringify(payload);
  const response = await call(api('/reports'), { method: 'POST', token: session.token, raw });
  return { response, raw, view: await response.json() };
}

test('the key gates every report endpoint; health and config answer', async () => {
  assert.equal((await call('/health')).status, 200);
  assert.equal((await call('/k/wrong-key-wrong-key-x/api/config')).status, 404);
  const config = await (await call(api('/config'))).json();
  assert.equal(config.schema_version, 'bunki.maintenance/v1');
  assert.equal(config.ai.status, 'none');
  assert.equal(
    (
      await call(api('/reports'), {
        token: 'actor_00000000000000000000000000000000.' + '0'.repeat(64),
      })
    ).status,
    401,
  );
});

test('a report becomes one labelled GitHub issue with screenshots, and the receipt matches the exact bytes', async () => {
  const session = await signIn();
  const payload = {
    idempotency_key: 'delivery_0123456789',
    report: report(session.actor_ref, { attachment_ids: ['attachment_0123456789abcdef'] }),
    attachments: [
      {
        id: 'attachment_0123456789abcdef',
        name: 'shot.png',
        mime_type: 'image/png',
        data_base64: PIXEL_PNG.toString('base64'),
      },
    ],
  };
  const { response, raw, view } = await file(session, payload);
  assert.equal(response.status, 201);
  assert.equal(view.receipt.payload_sha256, createHash('sha256').update(raw).digest('hex'));
  assert.equal(view.receipt.report_id, payload.report.id);
  assert.equal(view.status, 'received');
  assert.equal(view.issue.number, 1);
  const issue = github.state.issues[0];
  assert.equal(issue.title, '[KAIRO] The popup covers 天気.');
  assert.deepEqual(
    issue.labels.map((label) => label.name),
    ['kairo-report'],
  );
  assert(issue.body.startsWith('<!-- kairo-report v1 -->\n<!-- kairo-relay v1 -->'));
  for (const text of [
    'It hides the word.',
    'The popup sits below the word.',
    '- App: KAIRO 1.1.0',
    '- Screen: `corridor/reader`',
    '- Viewport: 390×844',
    `- Report ID on the device: \`${payload.report.id}\``,
  ]) {
    assert(issue.body.includes(text), text);
  }
  const shotUrl =
    /!\[shot\.png\]\((https:\/\/relay\.example\.workers\.dev\/v1\/shots\/shot_[a-f0-9]{32})\)/.exec(
      issue.body,
    )?.[1];
  assert(shotUrl, 'the issue links the screenshot');
  const image = await call(new URL(shotUrl).pathname, { origin: null });
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), PIXEL_PNG);
  const viaApp = await call(
    api(`/reports/${payload.report.id}/attachments/attachment_0123456789abcdef`),
    { token: session.token },
  );
  assert.equal(viaApp.status, 200);
});

test('a retry with the same request returns the same receipt; a changed payload under that ID is refused', async () => {
  const session = await signIn();
  const payload = {
    idempotency_key: 'delivery_retry_0001',
    report: report(session.actor_ref),
    attachments: [],
  };
  const first = await file(session, payload);
  const again = await file(session, payload);
  assert.equal(again.response.status, 200);
  assert.deepEqual(again.view.receipt, first.view.receipt);
  assert.equal(github.state.issues.length, 1);
  const changed = await file(session, {
    ...payload,
    report: report(session.actor_ref, { user_words: 'Different words.' }),
  });
  assert.equal(changed.response.status, 409);
});

test('bad input is refused before anything is filed', async () => {
  const session = await signIn();
  const wrongImage = await file(session, {
    idempotency_key: 'delivery_bad_image_1',
    report: report(session.actor_ref, { attachment_ids: ['attachment_0123456789abcdef'] }),
    attachments: [
      {
        id: 'attachment_0123456789abcdef',
        name: 'x.png',
        mime_type: 'image/png',
        data_base64: Buffer.from('not an image').toString('base64'),
      },
    ],
  });
  assert.equal(wrongImage.response.status, 400);
  const otherActor = await file(session, {
    idempotency_key: 'delivery_actor_0001',
    report: report('actor_' + 'f'.repeat(32)),
    attachments: [],
  });
  assert.equal(otherActor.response.status, 400);
  const empty = await file(session, {
    idempotency_key: 'delivery_empty_0001',
    report: report(session.actor_ref, { user_words: '   ' }),
    attachments: [],
  });
  assert.equal(empty.response.status, 400);
  assert.equal(github.state.issues.length, 0);
});

test('a GitHub outage leaves nothing recorded, so the same request succeeds later', async () => {
  const session = await signIn();
  const payload = {
    idempotency_key: 'delivery_outage_001',
    report: report(session.actor_ref),
    attachments: [],
  };
  github.state.failCreate = true;
  assert.equal((await file(session, payload)).response.status, 502);
  github.state.failCreate = false;
  assert.equal((await file(session, payload)).response.status, 201);
  assert.equal(github.state.issues.length, 1);
});

test('views follow the fixer: labels set the status, its comments appear, the app can reply and reopen', async () => {
  const session = await signIn();
  const { view } = await file(session, {
    idempotency_key: 'delivery_thread_001',
    report: report(session.actor_ref),
    attachments: [],
  });
  const id = view.report.id;
  const read = async () => (await call(api(`/reports/${id}`), { token: session.token })).json();
  github.label(1, 'fixer:needs-info');
  github.comment(1, 'Which article were you reading?');
  let current = await read();
  assert.equal(current.status, 'needs_info');
  assert.deepEqual(current.conversation.at(-1).actor, 'service');
  assert.equal(current.conversation.at(-1).text, 'Which article were you reading?');
  const reply = await call(api(`/reports/${id}/messages`), {
    method: 'POST',
    token: session.token,
    body: { idempotency_key: 'message_reply_0001', text: 'The rain essay.' },
  });
  current = await reply.json();
  assert.equal(current.conversation.at(-1).actor, 'user');
  assert.equal(current.conversation.at(-1).text, 'The rain essay.');
  assert(github.state.comments.at(-1).body.startsWith('<!-- kairo-app-message -->'));
  await call(api(`/reports/${id}/messages`), {
    method: 'POST',
    token: session.token,
    body: { idempotency_key: 'message_reply_0001', text: 'The rain essay.' },
  });
  assert.equal(
    github.state.comments.filter((item) => item.body.includes('The rain essay.')).length,
    1,
    'a retried message is posted once',
  );
  github.state.issues[0].labels = [{ name: 'kairo-report' }, { name: 'fixer:pr-open' }];
  assert.equal((await read()).status, 'ready_for_review');
  github.state.issues[0].state = 'closed';
  assert.equal((await read()).status, 'closed');
  const reopened = await (
    await call(api(`/reports/${id}/reopen`), {
      method: 'POST',
      token: session.token,
      body: {
        idempotency_key: 'reopen_0000000001',
        text: '',
        context: { surface: 'corridor/reader', route: '/x' },
      },
    })
  ).json();
  assert.equal(github.state.issues[0].state, 'open');
  assert.notEqual(reopened.status, 'closed');
  assert(github.state.comments.at(-1).body.includes('**Still happening**'));
});

test('each device sees only its own reports', async () => {
  const phone = await signIn();
  const mac = await signIn();
  await file(phone, {
    idempotency_key: 'delivery_phone_0001',
    report: report(phone.actor_ref),
    attachments: [],
  });
  const phoneList = await (await call(api('/reports'), { token: phone.token })).json();
  const macList = await (await call(api('/reports'), { token: mac.token })).json();
  assert.equal(phoneList.reports.length, 1);
  assert.equal(macList.reports.length, 0);
});

test('only the app origins get CORS access', async () => {
  const allowed = await call(api('/config'), { method: 'OPTIONS' });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), APP);
  const other = await call(api('/config'), { method: 'OPTIONS', origin: 'https://example.com' });
  assert.equal(other.status, 403);
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(
    (await call(api('/config'), { origin: 'http://localhost:8000' })).headers.get(
      'Access-Control-Allow-Origin',
    ),
    null,
  );
  env.ALLOW_LOOPBACK = '1';
  assert.equal(
    (await call(api('/config'), { origin: 'http://localhost:8000' })).headers.get(
      'Access-Control-Allow-Origin',
    ),
    'http://localhost:8000',
  );
});

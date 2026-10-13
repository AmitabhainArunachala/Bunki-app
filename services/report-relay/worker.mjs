/**
 * Bunki report relay: a Cloudflare Worker that receives in-app problem reports
 * and files each one as a GitHub issue, with its screenshots.
 *
 * It implements the report-service contract the app's report client already
 * speaks (prototypes/corridor/maintenance/README-backend.md, "Browser API"):
 * config, guest session, idempotent report intake, report views, follow-ups,
 * reopen and attachments. The app reaches it at
 *
 *   https://<worker>.workers.dev/k/<REPORT_KEY>
 *
 * so only devices set up with the key can file reports. The GitHub token never
 * leaves the Worker and only needs Issues read/write on one repository.
 *
 * Bindings: REPORTS (KV), GITHUB_TOKEN and REPORT_KEY (secrets), GITHUB_REPO
 * (var, "owner/name"). Optional: GITHUB_API (tests), ALLOW_LOOPBACK ("1" lets
 * http://localhost and http://127.0.0.1 pages call it, for local verification).
 */
/* global Response, URL, crypto, TextEncoder, fetch, atob */

const SCHEMA = 'bunki.maintenance/v1';
const SERVICE_VERSION = 'report-relay/1';
const LIMITS = { attachment_bytes: 2097152, attachment_count: 4, total_attachment_bytes: 6291456 };
const MAX_REQUEST_BYTES = 9 * 1024 * 1024;
const APP_ORIGINS = new Set(['https://amitabhainarunachala.github.io']);
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
const CATEGORIES = new Set(['bug', 'content', 'experience', 'idea']);
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const REPORT_LABEL = 'kairo-report';
const APP_MESSAGE = '<!-- kairo-app-message -->';
const MAX_LISTED = 20;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const encoder = new TextEncoder();
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
const randomId = (prefix) => `${prefix}_${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
const clip = (value, length) =>
  typeof value === 'string' ? Array.from(value).slice(0, length).join('') : '';
const isString = (value, max, min = 0) =>
  typeof value === 'string' && Array.from(value).length <= max && value.length >= min;

function sameText(a, b) {
  // Constant-time comparison for secrets of equal length.
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length)
    return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1)
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  if (!APP_ORIGINS.has(origin) && !(env.ALLOW_LOOPBACK === '1' && LOOPBACK.test(origin))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function json(status, value, extra = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

function decodeBase64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new HttpError(400, 'invalid_attachment', 'An attachment is not valid base64.');
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function imageMatches(type, bytes) {
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  if (type === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (type === 'image/jpeg') return starts(0xff, 0xd8, 0xff);
  if (type === 'image/webp')
    return (
      starts(0x52, 0x49, 0x46, 0x46) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  return false;
}

function validateReport(report, actor, attachments) {
  const bad = (message) => {
    throw new HttpError(400, 'invalid_report', message);
  };
  if (!report || typeof report !== 'object' || Array.isArray(report)) bad('The report is missing.');
  if (report.schema_version !== SCHEMA || report.kind !== 'learner_report' || report.revision !== 1)
    bad('The report schema is not supported.');
  if (!/^report_[a-f0-9]{8,64}$/.test(report.id || '')) bad('The report ID is invalid.');
  if (
    report.origin?.kind !== 'user' ||
    report.origin.actor_ref !== actor ||
    report.origin.model_ref !== null
  )
    bad('The report origin does not match this session.');
  if (report.execution_authority !== 'none') bad('A report cannot carry execution authority.');
  if (!isString(report.user_words, 12000, 1) || !report.user_words.trim())
    bad('Describe the problem.');
  if (!isString(report.expected, 4000) || !isString(report.actual, 4000))
    bad('A text field is too long.');
  if (!CATEGORIES.has(report.category)) bad('The category is not supported.');
  if (!isString(report.created_at, 40, 10) || Number.isNaN(Date.parse(report.created_at)))
    bad('The report time is invalid.');
  const context = report.context;
  if (!context || typeof context !== 'object') bad('The screen context is missing.');
  if (
    !isString(context.surface, 160, 1) ||
    !isString(context.route, 500, 1) ||
    !isString(context.locale, 32)
  )
    bad('The screen context is invalid.');
  if (
    !Array.isArray(context.content_ids) ||
    context.content_ids.length > 32 ||
    !context.content_ids.every((value) => isString(value, 160, 1))
  )
    bad('The content IDs are invalid.');
  if (
    !Array.isArray(report.evidence) ||
    report.evidence.length > 40 ||
    !report.evidence.every(
      (item) => item && isString(item.kind, 40, 1) && isString(item.summary, 8000),
    )
  )
    bad('The evidence list is invalid.');
  if (
    !Array.isArray(report.attachment_ids) ||
    report.attachment_ids.length > LIMITS.attachment_count
  )
    bad('Too many screenshots.');
  const ids = attachments.map((item) => item.id);
  if (
    ids.length !== report.attachment_ids.length ||
    !report.attachment_ids.every((value, index) => value === ids[index])
  )
    bad('The screenshots do not match the report.');
}

function readAttachments(raw) {
  if (!Array.isArray(raw) || raw.length > LIMITS.attachment_count)
    throw new HttpError(400, 'invalid_attachment', 'Too many screenshots.');
  let total = 0;
  return raw.map((item) => {
    if (
      !item ||
      !/^attachment_[a-f0-9]{8,64}$/.test(item.id || '') ||
      !isString(item.name, 160, 1) ||
      !IMAGE_TYPES.has(item.mime_type)
    ) {
      throw new HttpError(
        400,
        'invalid_attachment',
        'A screenshot is not a PNG, JPEG or WebP image.',
      );
    }
    const bytes = decodeBase64(item.data_base64);
    total += bytes.length;
    if (bytes.length > LIMITS.attachment_bytes || total > LIMITS.total_attachment_bytes)
      throw new HttpError(413, 'attachment_too_large', 'The screenshots are too large.');
    if (!imageMatches(item.mime_type, bytes))
      throw new HttpError(400, 'invalid_attachment', 'A screenshot does not match its image type.');
    return { id: item.id, name: item.name, type: item.mime_type, bytes };
  });
}

function code(value) {
  return `\`${String(value).replace(/`/g, "'")}\``;
}

export function issueContent(report, shots) {
  const context = report.context;
  let diagnostics = {};
  try {
    diagnostics =
      JSON.parse(report.evidence.find((item) => item.kind === 'action_trace')?.summary || '{}') ||
      {};
  } catch {
    // The screen lines below still identify where the report came from.
  }
  const first = report.user_words.split(/\r?\n/).find((line) => line.trim()) || 'Problem report';
  const viewport = diagnostics.viewport;
  const body = [
    '<!-- kairo-report v1 -->',
    '<!-- kairo-relay v1 -->',
    '### What happened',
    '',
    report.user_words,
    '',
    '### What I expected',
    '',
    report.expected || 'Not specified',
    '',
    '### Where',
    '',
    `- App: KAIRO ${clip(typeof diagnostics.app_version === 'string' ? diagnostics.app_version : '', 40) || '(version unknown)'}`,
    `- Screen: ${code(context.surface)}`,
    `- Path: ${code(context.route)}`,
    ...(context.content_ids.length
      ? [`- Content: ${context.content_ids.map(code).join(', ')}`]
      : []),
    `- Interface language: ${context.locale || 'unknown'}`,
    ...(viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height)
      ? [`- Viewport: ${viewport.width}×${viewport.height}`]
      : []),
    `- Category: ${report.category}`,
    `- Reported: ${report.created_at}`,
    `- Report ID on the device: ${code(report.id)}`,
    ...(shots.length
      ? [
          '',
          '### Screenshots',
          '',
          ...shots.map((shot) => `![${shot.name.replace(/[[\]]/g, '')}](${shot.url})`),
        ]
      : []),
    '',
    '<details><summary>Recent screens</summary>',
    '',
    '```json',
    JSON.stringify(
      Array.isArray(diagnostics.action_trace) ? diagnostics.action_trace.slice(-8) : [],
    ),
    '```',
    '',
    '</details>',
  ].join('\n');
  return { title: `[KAIRO] ${clip(first.trim(), 72)}`, body };
}

async function github(env, path, init = {}) {
  const base = (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'bunki-report-relay',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await response.text();
  if (!response.ok)
    throw new HttpError(
      502,
      'github_unavailable',
      `GitHub answered ${response.status}. The report stays on your device and will be retried.`,
    );
  return text ? JSON.parse(text) : null;
}

const repoPath = (env) => {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(env.GITHUB_REPO || ''))
    throw new HttpError(500, 'misconfigured', 'The relay has no repository configured.');
  return `/repos/${env.GITHUB_REPO}`;
};

const labelNames = (issue) =>
  (issue.labels || []).map((label) => (typeof label === 'string' ? label : label.name));

function statusOf(issue) {
  const labels = new Set(labelNames(issue));
  if (issue.state === 'closed')
    return { status: 'closed', reason: 'This report is closed on GitHub.' };
  if (labels.has('fixer:pr-open'))
    return {
      status: 'ready_for_review',
      reason: 'A fix is ready for review. It reaches the app after it is merged and released.',
    };
  if (labels.has('fixer:needs-info'))
    return {
      status: 'needs_info',
      reason: 'The fixer asked a question below. Reply here to answer it.',
    };
  if (labels.has('fixer:working'))
    return { status: 'preparing_fix', reason: 'The fixer is working on this report.' };
  return {
    status: 'received',
    reason: 'Filed on GitHub. The fixer checks new reports every hour.',
  };
}

function appMessage(text) {
  return text.includes(APP_MESSAGE)
    ? text
        .replace(APP_MESSAGE, '')
        .replace(/^\s*\*\*[^*]+\*\*\s*/, '')
        .trim()
    : null;
}

async function buildView(env, record) {
  const path = repoPath(env);
  const [issue, comments] = await Promise.all([
    github(env, `${path}/issues/${record.issue_number}`),
    github(env, `${path}/issues/${record.issue_number}/comments?per_page=100`),
  ]);
  const { status, reason } = statusOf(issue);
  const conversation = [
    {
      id: 'msg_report',
      actor: 'user',
      text: record.report.user_words,
      created_at: record.report.created_at,
      context: null,
    },
    ...(comments || []).map((comment) => {
      const own = appMessage(comment.body || '');
      return {
        id: `msg_${comment.id}`,
        actor: own === null ? 'service' : 'user',
        text: clip(own === null ? comment.body || '' : own, 4000),
        created_at: comment.created_at,
        context: null,
      };
    }),
  ];
  return {
    receipt: record.receipt,
    report: record.report,
    generation: conversation.filter((item) => item.actor === 'user').length,
    status,
    triage: { state: status === 'received' ? 'pending' : 'complete', reason },
    conversation,
    proposals: [],
    issue: { number: issue.number, url: issue.html_url, state: issue.state },
  };
}

async function readBody(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_REQUEST_BYTES) throw new HttpError(413, 'too_large', 'The report is too large.');
  const text = await request.text();
  if (encoder.encode(text).length > MAX_REQUEST_BYTES)
    throw new HttpError(413, 'too_large', 'The report is too large.');
  if (!/^application\/json\b/.test(request.headers.get('Content-Type') || ''))
    throw new HttpError(415, 'json_required', 'Send JSON.');
  try {
    return { text, value: JSON.parse(text) };
  } catch {
    throw new HttpError(400, 'invalid_json', 'The request is not valid JSON.');
  }
}

async function session(request, env) {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer (actor_[a-f0-9]{32})\.([a-f0-9]{64})$/.exec(header);
  if (!match || !sameText(await hmac(env.REPORT_KEY, match[1]), match[2]))
    throw new HttpError(401, 'unauthorized', 'This device is not signed in to the report relay.');
  return match[1];
}

async function loadRecord(env, actor, reportId) {
  if (!/^report_[a-f0-9]{8,64}$/.test(reportId))
    throw new HttpError(404, 'not_found', 'Report not found.');
  const record = await env.REPORTS.get(`report:${actor}:${reportId}`, 'json');
  if (!record) throw new HttpError(404, 'not_found', 'Report not found.');
  return record;
}

async function createReport(request, env, actor, origin) {
  const { text, value } = await readBody(request);
  if (!isString(value?.idempotency_key, 200, 8))
    throw new HttpError(400, 'invalid_request', 'An idempotency key is required.');
  const payloadSha = await sha256(text);
  const idemKey = `idem:${actor}:${value.idempotency_key}`;
  const previous = await env.REPORTS.get(idemKey, 'json');
  if (previous) {
    if (previous.payload_sha256 !== payloadSha)
      throw new HttpError(
        409,
        'idempotency_conflict',
        'This request ID was already used for a different report.',
      );
    return json(200, await buildView(env, await loadRecord(env, actor, previous.report_id)));
  }
  const attachments = readAttachments(value.attachments || []);
  validateReport(value.report, actor, attachments);
  const report = value.report;
  if (await env.REPORTS.get(`report:${actor}:${report.id}`))
    throw new HttpError(409, 'duplicate_report', 'This report was already filed.');
  const shots = [];
  for (const attachment of attachments) {
    const shotId = randomId('shot');
    await env.REPORTS.put(`shot:${shotId}`, attachment.bytes, {
      metadata: { type: attachment.type },
    });
    shots.push({
      attachment_id: attachment.id,
      id: shotId,
      name: attachment.name,
      url: `${origin}/v1/shots/${shotId}`,
    });
  }
  const content = issueContent(report, shots);
  const issue = await github(env, `${repoPath(env)}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: content.title, body: content.body, labels: [REPORT_LABEL] }),
  });
  const record = {
    report,
    issue_number: issue.number,
    shots,
    receipt: {
      receipt_id: `receipt_issue_${issue.number}`,
      report_id: report.id,
      received_at: new Date().toISOString(),
      payload_sha256: payloadSha,
    },
  };
  await env.REPORTS.put(`report:${actor}:${report.id}`, JSON.stringify(record));
  await env.REPORTS.put(
    idemKey,
    JSON.stringify({ payload_sha256: payloadSha, report_id: report.id }),
  );
  return json(201, await buildView(env, record));
}

async function addMessage(request, env, actor, reportId, reopen) {
  const record = await loadRecord(env, actor, reportId);
  const { value } = await readBody(request);
  if (!isString(value?.idempotency_key, 200, 8))
    throw new HttpError(400, 'invalid_request', 'An idempotency key is required.');
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  if (!isString(text, 4000, reopen ? 0 : 1))
    throw new HttpError(400, 'invalid_request', 'Write a message of up to 4,000 characters.');
  const key = `msg:${actor}:${value.idempotency_key}`;
  if (!(await env.REPORTS.get(key))) {
    // Hand the report back to the fixer first; repeating this is harmless. An
    // answer clears the fixer's question, and "Still happening" reopens the issue
    // and clears every fixer label, so the fixer picks the report up again.
    const issuePath = `${repoPath(env)}/issues/${record.issue_number}`;
    const issue = await github(env, issuePath);
    const labels = labelNames(issue);
    const kept = labels.filter((name) =>
      reopen ? !name.startsWith('fixer:') : name !== 'fixer:needs-info',
    );
    if ((reopen && issue.state !== 'open') || kept.length !== labels.length)
      await github(env, issuePath, {
        method: 'PATCH',
        body: JSON.stringify({ ...(reopen ? { state: 'open' } : {}), labels: kept }),
      });
    const where =
      reopen && value.context?.surface
        ? `\n\nScreen: ${code(clip(value.context.surface, 160))}${value.context.route ? `, path ${code(clip(value.context.route, 500))}` : ''}`
        : '';
    const heading = reopen ? '**Still happening** (from the app)' : '**From the app**';
    await github(env, `${repoPath(env)}/issues/${record.issue_number}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: `${APP_MESSAGE}\n${heading}\n\n${text || 'Still happening.'}${where}`,
      }),
    });
    await env.REPORTS.put(key, '1', { expirationTtl: 60 * 60 * 24 * 30 });
  }
  return json(200, await buildView(env, record));
}

async function listReports(env, actor) {
  const listed = await env.REPORTS.list({ prefix: `report:${actor}:` });
  const records = (
    await Promise.all(listed.keys.map((key) => env.REPORTS.get(key.name, 'json')))
  ).filter(Boolean);
  records.sort((a, b) => String(b.report.created_at).localeCompare(String(a.report.created_at)));
  const reports = [];
  for (const record of records.slice(0, MAX_LISTED)) reports.push(await buildView(env, record));
  return json(200, { reports });
}

async function serveShot(env, shotId) {
  if (!/^shot_[a-f0-9]{32}$/.test(shotId)) return new Response('Not found', { status: 404 });
  const item = await env.REPORTS.getWithMetadata(`shot:${shotId}`, 'arrayBuffer');
  if (!item?.value || !IMAGE_TYPES.has(item.metadata?.type))
    return new Response('Not found', { status: 404 });
  return new Response(item.value, {
    headers: {
      'Content-Type': item.metadata.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health')
    return json(200, { ok: true, service_version: SERVICE_VERSION });
  const shot = /^\/v1\/shots\/([^/]+)$/.exec(url.pathname);
  if (shot && request.method === 'GET') return serveShot(env, shot[1]);

  const keyed = /^\/k\/([A-Za-z0-9_-]{16,128})(\/api\/.*)$/.exec(url.pathname);
  if (!keyed || !env.REPORT_KEY || !sameText(keyed[1], env.REPORT_KEY))
    return json(404, { error: { code: 'not_found', message: 'Not found.' } });
  const api = keyed[2];
  const origin = url.origin;

  if (request.method === 'GET' && api === '/api/config') {
    return json(200, {
      schema_version: SCHEMA,
      service_version: SERVICE_VERSION,
      build: null,
      content_ids: [],
      limits: LIMITS,
      ai: { status: 'none' },
    });
  }
  if (request.method === 'POST' && api === '/api/session') {
    await readBody(request);
    const actor = randomId('actor');
    return json(201, { token: `${actor}.${await hmac(env.REPORT_KEY, actor)}`, actor_ref: actor });
  }
  const actor = await session(request, env);
  if (api === '/api/reports' && request.method === 'POST')
    return createReport(request, env, actor, origin);
  if (api === '/api/reports' && request.method === 'GET') return listReports(env, actor);
  const one = /^\/api\/reports\/([^/]+)(?:\/(messages|reopen|propose|attachments\/([^/]+)))?$/.exec(
    api,
  );
  if (!one) return json(404, { error: { code: 'not_found', message: 'Not found.' } });
  const [, reportId, action, attachmentId] = one;
  if (!action && request.method === 'GET')
    return json(200, await buildView(env, await loadRecord(env, actor, reportId)));
  if (action === 'messages' && request.method === 'POST')
    return addMessage(request, env, actor, reportId, false);
  if (action === 'reopen' && request.method === 'POST')
    return addMessage(request, env, actor, reportId, true);
  if (action === 'propose' && request.method === 'POST') {
    await loadRecord(env, actor, reportId);
    return json(200, { queued: false, report_id: reportId });
  }
  if (attachmentId && request.method === 'GET') {
    const record = await loadRecord(env, actor, reportId);
    const shotRecord = record.shots.find((item) => item.attachment_id === attachmentId);
    return shotRecord
      ? serveShot(env, shotRecord.id)
      : json(404, { error: { code: 'not_found', message: 'Not found.' } });
  }
  return json(405, { error: { code: 'method_not_allowed', message: 'Not allowed.' } });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: cors['Access-Control-Allow-Origin'] ? 204 : 403,
        headers: cors,
      });
    let response;
    try {
      response = await route(request, env);
    } catch (error) {
      const known = error instanceof HttpError;
      response = json(known ? error.status : 500, {
        error: {
          code: known ? error.code : 'internal',
          message: known
            ? error.message
            : 'The relay failed. The report stays on your device and will be retried.',
        },
      });
    }
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  },
};

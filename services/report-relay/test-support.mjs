/** Local stand-ins for the relay's world: an in-memory KV, a mock GitHub REST API,
 * and a Node HTTP adapter that serves the Worker. Used by the relay's unit tests
 * and the app's browser verifier; nothing here runs in production. */
/* global URL, Request */
import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import worker from './worker.mjs';

export function memoryKv() {
  const items = new Map();
  const decode = (entry, type) => {
    if (!entry) return null;
    if (type === 'json')
      return JSON.parse(
        typeof entry.value === 'string' ? entry.value : Buffer.from(entry.value).toString(),
      );
    if (type === 'arrayBuffer') {
      const bytes =
        typeof entry.value === 'string' ? Buffer.from(entry.value) : Buffer.from(entry.value);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    return typeof entry.value === 'string' ? entry.value : Buffer.from(entry.value).toString();
  };
  return {
    items,
    async get(key, type) {
      return decode(items.get(key), type);
    },
    async getWithMetadata(key, type) {
      const entry = items.get(key);
      return { value: decode(entry, type), metadata: entry?.metadata ?? null };
    },
    async put(key, value, options = {}) {
      items.set(key, {
        value: typeof value === 'string' ? value : new Uint8Array(value),
        metadata: options.metadata ?? null,
      });
    },
    async list({ prefix = '' } = {}) {
      return {
        keys: [...items.keys()]
          .filter((name) => name.startsWith(prefix))
          .sort()
          .map((name) => ({ name })),
        list_complete: true,
      };
    },
  };
}

/** A small GitHub REST stand-in: issues, labels and comments for one repository. */
export async function startMockGithub({
  repo = 'AmitabhainArunachala/Bunki-app',
  token = 'test-github-token',
  failCreate = false,
} = {}) {
  const state = { issues: [], comments: [], failCreate, requests: [] };
  let commentId = 1000;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    state.requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
    });
    const send = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (request.headers.authorization !== `Bearer ${token}`)
      return send(401, { message: 'Bad credentials' });
    const base = `/repos/${repo}/issues`;
    const url = new URL(request.url, 'http://mock');
    const issueMatch = new RegExp(`^${base}/(\\d+)(/comments)?$`).exec(url.pathname);
    if (url.pathname === base && request.method === 'POST') {
      if (state.failCreate) return send(503, { message: 'Unavailable' });
      const issue = {
        number: state.issues.length + 1,
        title: body.title,
        body: body.body,
        labels: (body.labels || []).map((name) => ({ name })),
        state: 'open',
        html_url: `https://github.com/${repo}/issues/${state.issues.length + 1}`,
        user: { login: 'AmitabhainArunachala' },
      };
      state.issues.push(issue);
      return send(201, issue);
    }
    if (issueMatch) {
      const issue = state.issues[Number(issueMatch[1]) - 1];
      if (!issue) return send(404, { message: 'Not Found' });
      if (issueMatch[2] && request.method === 'GET')
        return send(
          200,
          state.comments.filter((item) => item.issue === issue.number),
        );
      if (issueMatch[2] && request.method === 'POST') {
        const comment = {
          id: (commentId += 1),
          issue: issue.number,
          body: body.body,
          created_at: new Date().toISOString(),
          user: { login: 'AmitabhainArunachala' },
          author_association: 'OWNER',
        };
        state.comments.push(comment);
        return send(201, comment);
      }
      if (request.method === 'GET') return send(200, issue);
      if (request.method === 'PATCH') {
        if (body.state) issue.state = body.state;
        if (body.labels) issue.labels = body.labels.map((name) => ({ name }));
        return send(200, issue);
      }
    }
    return send(404, { message: 'Not Found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    state,
    comment(issueNumber, text, { login = 'AmitabhainArunachala', association = 'OWNER' } = {}) {
      const comment = {
        id: (commentId += 1),
        issue: issueNumber,
        body: text,
        created_at: new Date().toISOString(),
        user: { login },
        author_association: association,
      };
      state.comments.push(comment);
      return comment;
    },
    label(issueNumber, name) {
      state.issues[issueNumber - 1].labels.push({ name });
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Serve the Worker over HTTP on 127.0.0.1, with the given bindings. */
export async function startRelay(env) {
  const server = createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = new Request(new URL(incoming.url, origin), {
      method: incoming.method,
      headers: Object.entries(incoming.headers).flatMap(([name, value]) =>
        Array.isArray(value) ? value.map((item) => [name, item]) : [[name, value]],
      ),
      body: ['GET', 'HEAD'].includes(incoming.method) ? undefined : Buffer.concat(chunks),
    });
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** A one-pixel PNG, for screenshot tests. */
export const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /Bunki/);
  assert.match(html, /Living Japanese/);
  assert.match(html, /Start with one clear thread/);
  assert.match(html, /Your best next action/);
  for (const destination of ["Today", "Immerse", "Review", "Coach", "Library"]) {
    assert.match(html, new RegExp(`>${destination}<`));
  }
  assert.doesNotMatch(html, /Good (morning|afternoon|evening), John/);
});

test("keeps unauthenticated state device-local", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("state-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/state"),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    state: null,
    updatedAt: null,
    localOnly: true,
  });
});

test("blocks an old account scope from falling through into signed-out storage", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("scope-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: {},
        baseRevision: 0,
        expectedSyncScope: "sha256:old-account:1",
      }),
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "SYNC_SCOPE_CHANGED");
});

test("does not expose transcript extraction without a signed-in owner", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("caption-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/youtube-transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://youtu.be/7GeFt8suV8E" }),
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 401);
});

test("does not expose the live teacher without a signed-in owner", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("teacher-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/teacher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "AUTH_REQUIRED");
});

test("keeps AI generation private while public readers can request allowlisted articles", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("reading-security-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const environment = {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const articleResponse = await worker.fetch(
    new Request("http://localhost/api/article-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.riken.jp/press/" }),
    }),
    environment,
    context,
  );
  assert.notEqual(articleResponse.status, 401);

  const generationResponse = await worker.fetch(
    new Request("http://localhost/api/reading-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "N2",
        length: "short",
        topic: "山岳信仰",
      }),
    }),
    environment,
    context,
  );
  assert.equal(generationResponse.status, 401);
  assert.equal((await generationResponse.json()).code, "AUTH_REQUIRED");
});

test("does not expose immutable source bodies without a signed-in owner", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("source-body-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request(
      "http://localhost/api/source-body?sourceId=source-a&fingerprint=fnv1a%3Aabc%3A10",
    ),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 401);
});

test("does not accept source-body writes without a signed-in owner", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("source-body-put-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/source-body", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 401);
});

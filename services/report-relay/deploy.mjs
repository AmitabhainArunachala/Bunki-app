#!/usr/bin/env node
/**
 * Deploy the report relay to Cloudflare Workers. Run by .github/workflows/report-relay.yml.
 *
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (for wrangler),
 * REPORT_GITHUB_TOKEN (a fine-grained token with Issues read/write on the
 * repository) and REPORT_KEY (16–128 characters of A–Z, a–z, 0–9, _ or -).
 * It finds or creates the KV namespace, deploys the Worker, stores the two
 * secrets, and checks the live relay. Secrets are never printed.
 */
/* global fetch, console, setTimeout */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WRANGLER = 'wrangler@4.141.0';
const NAME = 'bunki-report-relay';
const NAMESPACE = 'bunki-report-relay-reports';
const REPO = process.env.REPORT_GITHUB_REPO || 'AmitabhainArunachala/Bunki-app';
const here = dirname(fileURLToPath(import.meta.url));

for (const name of [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'REPORT_GITHUB_TOKEN',
  'REPORT_KEY',
]) {
  assert(process.env[name], `${name} is not set`);
}
assert.match(
  process.env.REPORT_KEY,
  /^[A-Za-z0-9_-]{16,128}$/,
  'REPORT_KEY must be 16–128 characters of A–Z, a–z, 0–9, _ or -',
);
assert.match(REPO, /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, 'REPORT_GITHUB_REPO must be owner/name');

// Run wrangler from an empty directory so no other configuration is picked up.
const work = mkdtempSync(join(tmpdir(), 'report-relay-'));
const wrangler = (args, input) =>
  execFileSync('npx', ['--yes', WRANGLER, ...args], {
    cwd: work,
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });

try {
  const listNamespaces = () => {
    const output = wrangler(['kv', 'namespace', 'list']);
    return JSON.parse(output.slice(output.indexOf('['), output.lastIndexOf(']') + 1));
  };
  const findNamespace = () =>
    listNamespaces().find(
      (item) => item.title === NAMESPACE || item.title.endsWith(`-${NAMESPACE}`),
    );
  let namespace = findNamespace();
  if (!namespace) {
    wrangler(['kv', 'namespace', 'create', NAMESPACE]);
    namespace = findNamespace();
  }
  assert(namespace?.id, 'The KV namespace could not be found or created');

  const config = join(work, 'wrangler.toml');
  writeFileSync(
    config,
    [
      `name = "${NAME}"`,
      `main = ${JSON.stringify(join(here, 'worker.mjs'))}`,
      'compatibility_date = "2025-09-01"',
      'workers_dev = true',
      '',
      '[vars]',
      `GITHUB_REPO = "${REPO}"`,
      '',
      '[[kv_namespaces]]',
      'binding = "REPORTS"',
      `id = "${namespace.id}"`,
      '',
    ].join('\n'),
  );
  const deployed = wrangler(['deploy', '--config', config]);
  const url = /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/.exec(deployed)?.[0];
  assert(
    url,
    'The deployment did not report a workers.dev address. Register a workers.dev subdomain in the Cloudflare dashboard (Workers & Pages) and run again.',
  );

  const secrets = join(work, 'secrets.json');
  writeFileSync(
    secrets,
    JSON.stringify({
      GITHUB_TOKEN: process.env.REPORT_GITHUB_TOKEN,
      REPORT_KEY: process.env.REPORT_KEY,
    }),
    { mode: 0o600 },
  );
  try {
    wrangler(['secret', 'bulk', secrets, '--config', config]);
  } finally {
    rmSync(secrets, { force: true });
  }

  // A new deployment can take a few seconds to answer everywhere.
  let healthy = false;
  for (let attempt = 0; attempt < 12 && !healthy; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt ? 5000 : 0));
    try {
      const health = await fetch(`${url}/health`);
      const keyed = await fetch(`${url}/k/${process.env.REPORT_KEY}/api/config`);
      healthy =
        health.ok && keyed.ok && (await keyed.json()).schema_version === 'bunki.maintenance/v1';
    } catch {
      healthy = false;
    }
  }
  assert(healthy, `The relay at ${url} did not answer its health and configuration checks.`);

  console.log(`Report relay live at ${url}`);
  // A notice annotation keeps the address readable from the check run's API.
  if (process.env.GITHUB_ACTIONS === 'true')
    console.log(`::notice title=Report relay live::${url}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Report relay deployed\n\n- Address: ${url}\n- Issues are filed in ${REPO}.\n\nSet up each device once by opening the app with \`?report-relay=${url}&report-key=<REPORT_KEY>\`.\n`,
    );
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

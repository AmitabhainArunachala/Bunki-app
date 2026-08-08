/**
 * Reproducible local diagnostic for KAIRO's production performance contract.
 *
 * This receipt is intentionally unable to promote the 1.5s / 100ms / 50ms /
 * ~60fps targets: loopback desktop Chrome is not target iPhone hardware, a
 * declared mobile network, or the production-compressed artifact. It records
 * current bytes and diagnostic samples while keeping every product threshold
 * explicitly UNPROVEN.
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const REPO = resolve(CORRIDOR_DIR, '..', '..');
const RECEIPT = resolve(
  REPO,
  'docs/build-evidence/kairo-a05-accessibility/performance-receipt.json',
);
const VIEWPORT = { width: 390, height: 844 };
const DIAGNOSTIC_BOOT_RUNS = 5;
const DIAGNOSTIC_LOOKUP_RUNS = 10;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

function startServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(CORRIDOR_DIR, rel);
    if (!file.startsWith(CORRIDOR_DIR) || !existsSync(file)) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(file));
  });
  return new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      accept({ server, base: `http://127.0.0.1:${address.port}` });
    });
  });
}

function percentile(samples, fraction) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return Math.round(sorted[index] * 10) / 10;
}

function summarize(samples) {
  return {
    count: samples.length,
    min: samples.length ? Math.round(Math.min(...samples) * 10) / 10 : null,
    median: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: samples.length ? Math.round(Math.max(...samples) * 10) / 10 : null,
    unit: 'ms',
  };
}

function resourceBytes(paths) {
  return paths.map((path) => ({
    path,
    bytes: statSync(resolve(CORRIDOR_DIR, path)).size,
  }));
}

async function main() {
  const { server, base } = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const browserVersion = browser.version();
  const bootSamples = [];
  const lookupSamples = [];
  let bootResources = [];
  let afterArticleResources = [];
  let userAgent = '';

  try {
    for (let run = 0; run < DIAGNOSTIC_BOOT_RUNS; run += 1) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      await page.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
      await page.waitForFunction(
        'document.body.dataset.ready === "1" && document.querySelectorAll(".shelf-item").length >= 24',
        null,
        { timeout: 30_000 },
      );
      bootSamples.push(await page.evaluate('performance.now()'));

      if (run === 0) {
        userAgent = await page.evaluate('navigator.userAgent');
        bootResources = await page.evaluate(`performance.getEntriesByType('resource').map((entry) => ({
          path: new URL(entry.name).pathname.replace(/^\\/+/, ''),
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize,
        }))`);

        for (let sample = 0; sample < DIAGNOSTIC_LOOKUP_RUNS; sample += 1) {
          const query = sample % 2 === 0 ? 'kaisai' : 'peninsula';
          const elapsed = await page.evaluate(async (value) => {
            const input = document.getElementById('search');
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((accept) => setTimeout(accept, 150));
            const started = performance.now();
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return new Promise((accept, reject) => {
              const timeout = setTimeout(() => {
                clearInterval(probe);
                reject(new Error(`lookup timeout: ${value}`));
              }, 2_000);
              const probe = setInterval(() => {
                if (!document.querySelector('[data-result]')) return;
                clearTimeout(timeout);
                clearInterval(probe);
                accept(performance.now() - started);
              }, 4);
            });
          }, query);
          lookupSamples.push(elapsed);
        }

        await page.fill('#search', '');
        await page.waitForTimeout(180);
        await page.locator('.shelf-item').first().click();
        await page.waitForSelector('#reader .tok');
        afterArticleResources = await page.evaluate(
          `performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname.replace(/^\\/+/, ''))`,
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const coreFiles = resourceBytes([
    'index.html',
    'corridor.css',
    'corridor.js',
    'drift-layer.css',
    'drift-layer.js',
    'vendor/ts-fsrs.mjs',
    'data/articles/index.json',
    'data/proprietary_safe/kanken.json',
    'data/proprietary_safe/sem.json',
    'data/share_alike/kanji.json',
    'data/share_alike/words.json',
    'data/share_alike/idioms.json',
    'data/share_alike/dict.json',
    'data/share_alike/strokes.json',
    'data/original/grammar-v11.json',
    'data/manifest.json',
    'data/fsrs-pin.json',
  ]);
  const totalCoreBytes = coreFiles.reduce((total, item) => total + item.bytes, 0);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  const boot = summarize(bootSamples);
  const lookup = summarize(lookupSamples);
  const receipt = {
    schemaVersion: 1,
    kind: 'kairo-performance-protocol-receipt',
    verifiedCodeSha: head,
    verdict: 'unproven',
    promotionRule:
      'A threshold becomes proven only from its declared production profile; local diagnostic numbers have no promotion authority.',
    targetProfile: {
      device: 'target iPhone model — not yet selected',
      os: 'target iOS version — not yet selected',
      runtime: 'production Safari/PWA or native shell — not yet frozen',
      build: 'production, minified, cache headers and compression recorded',
      viewportDpr: 'device-native; exact profile not yet frozen',
      cache: ['cold', 'warm'],
      compression: 'production content encoding must be recorded',
      network: 'mobile latency/bandwidth/loss profile — not yet declared',
      samples: { boot: 30, lookup: 100, gesture: 100, frameWindowSeconds: 300 },
    },
    thresholds: [
      {
        id: 'boot-to-readable-shelf',
        statistic: 'p95',
        comparator: '<=',
        threshold: 1500,
        unit: 'ms',
        status: 'unproven',
        blocker: 'target device, production artifact, compression, and mobile network profile are unfrozen',
      },
      {
        id: 'warm-lookup-answer',
        statistic: 'p95',
        comparator: '<',
        threshold: 100,
        unit: 'ms',
        status: 'unproven',
        blocker: 'only loopback desktop diagnostics exist; current UI also has a 120ms debounce',
      },
      {
        id: 'gesture-to-visible-response',
        statistic: 'p95',
        comparator: '<',
        threshold: 50,
        unit: 'ms',
        status: 'unproven',
        blocker: 'no target-device input-to-present instrumentation receipt exists',
      },
      {
        id: 'drift-frame-pacing',
        statistic: 'p95 frame time plus dropped-frame rate',
        comparator: 'approximately 60fps',
        threshold: null,
        unit: 'ms_and_ratio',
        status: 'unproven',
        blocker: 'exact dropped-frame threshold and target-device five-minute profile are unfrozen',
      },
    ],
    localDiagnostic: {
      authority: 'diagnostic_only',
      environment: {
        device: `${process.platform} ${process.arch} development host`,
        os: process.platform,
        runtime: `Chrome ${browserVersion}`,
        executable: process.env.CHROMIUM_PATH || 'playwright-default',
        build: 'unbundled static source served with cache-control:no-store',
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        cache: 'new browser context per boot; no-store loopback responses',
        compression: 'none',
        network: '127.0.0.1 loopback; no shaping',
        userAgent,
      },
      measurements: {
        bootToReadableShelf: boot,
        warmLookupAnswer: {
          ...lookup,
          diagnosticThresholdResult:
            lookup.p95 !== null && lookup.p95 < 100 ? 'diagnostic_only_below' : 'diagnostic_only_not_below',
          productClaim: 'unproven',
        },
        gestureToVisibleResponse: { status: 'not_measured', productClaim: 'unproven' },
        driftFramePacing: { status: 'not_measured', productClaim: 'unproven' },
      },
    },
    bytes: {
      basis: 'committed decoded filesystem bytes; local server has no compression',
      totalCoreBytes,
      files: coreFiles,
      browserBootResources: bootResources,
    },
    lazyLoadBoundaries: {
      bootResourcePaths: bootResources.map((resource) => resource.path),
      articleBodiesAbsentAtImmediateReady: !bootResources.some((resource) =>
        /data\/articles\/(?!index\.json)/.test(resource.path),
      ),
      resourcesAfterOpeningFirstArticle: afterArticleResources,
      currentGap:
        'dictionary, kanji, word, idiom, stroke, grammar, and Drift bundles remain boot-critical; A4 sharding is not yet achieved',
    },
    protocolSource: 'KAIRO_EXCELLENCE_SPEC_2026-08-08.md §3 P1-P3, §4 rule 8, §5 A0.5/A4',
  };

  mkdirSync(dirname(RECEIPT), { recursive: true });
  writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`boot diagnostic p95: ${boot.p95}ms (${boot.count} samples)`);
  console.log(`warm lookup diagnostic p95: ${lookup.p95}ms (${lookup.count} samples)`);
  console.log('production verdict: UNPROVEN');
  console.log(`receipt → ${relative(REPO, RECEIPT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

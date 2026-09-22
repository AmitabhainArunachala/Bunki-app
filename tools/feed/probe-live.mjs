#!/usr/bin/env node
/** Explicit personal-device metadata smoke; never a shared RSS ingestion job. */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { externalPath } = require('../../prototypes/bunki-desktop/lib/paths.cjs');
const { verifyBundledArtifact } = require('../../prototypes/bunki-desktop/lib/artifact.cjs');
const { createFeedService } = require('../../prototypes/bunki-desktop/lib/feed-service.cjs');
let service;
let output;
const receipt = {
  schemaVersion: 1,
  mode: 'personal-device-live-metadata-smoke',
  status: 'pending',
  startedAt: new Date().toISOString(),
  publishers: [],
};

try {
  const args = process.argv.slice(2);
  assert(
    args[0] === '--live' &&
      [7, 9].includes(args.length) &&
      args[1] === '--site' &&
      args[3] === '--profile' &&
      args[5] === '--out' &&
      (args.length === 7 || args[7] === '--sources'),
    'Usage: node tools/feed/probe-live.mjs --live --site <canonical-site> --profile <isolated-external-profile> --out <fresh-external-evidence> [--sources source,source]',
  );
  const site = resolve(args[2]);
  const profile = externalPath(args[4]);
  output = externalPath(args[6], { fresh: true });
  const identity = verifyBundledArtifact(site);
  assert(
    identity.files.some((row) => row.path === 'modules/feed-core.mjs'),
    'A compiled feed module is required',
  );
  const core = await import(pathToFileURL(join(site, 'modules/feed-core.mjs')).href);
  mkdirSync(output, { recursive: true });
  receipt.artifactSha256 = identity.artifactSha256;
  receipt.module = identity.files.find((row) => row.path === 'modules/feed-core.mjs');
  receipt.registryCoverage = core.sourceCoverage();
  receipt.profile = profile;
  receipt.limits = [
    'Only direct unauthenticated personal-device RSS metadata is requested.',
    'No publisher article body, title, description, image, audio or raw XML is stored in this receipt.',
    'A successful feed response does not establish full-reader, AI, redistribution, retention or sync rights.',
    'Freshness is measured from publication dates; availability alone is not freshness.',
  ];
  const publishers = new Set();
  const sources = args[8]
    ? args[8].split(',').map(core.getFeedSource)
    : core.SOURCE_REGISTRY.filter((source) => {
        if (publishers.has(source.publisherId)) return false;
        publishers.add(source.publisherId);
        return true;
      });
  assert(
    new Set(sources.map((source) => source.id)).size === sources.length,
    'Duplicate source requests are not useful',
  );
  const events = new Map();
  service = createFeedService({
    core,
    profile,
    onEvent: (event) => events.set(event.sourceId, event),
  });
  // One selected channel per publisher by default. No retries or parallel
  // bursts; subsequent runs must use the same persisted request policy.
  for (const source of sources) {
    const result = await service.refresh(source.id);
    const row = {
      sourceId: source.id,
      publisherId: source.publisherId,
      mode: source.mode,
      status: result.status,
      itemCount: result.entries.length,
      freshness: result.freshness,
      latestPublishedAt: result.latestPublishedAt,
      checkedAt: result.checkedAt,
      lastSuccessAt: result.lastSuccessAt,
      nextCheckAt: result.nextCheckAt,
      error: result.error,
      response: events.get(source.id) || null,
      personalBasis: source.rights['personal-fetch'],
      fullReaderBasis: source.rights['display-body'].status,
    };
    receipt.publishers.push(row);
    writeFileSync(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(
      JSON.stringify({
        sourceId: source.id,
        status: row.status,
        itemCount: row.itemCount,
        freshness: row.freshness,
        error: row.error,
      }),
    );
  }
  // Read the actual durable file to catch accidental metadata/body persistence
  // in the real service, without copying its content to a second location.
  if (receipt.publishers.some((source) => source.response)) {
    const state = JSON.parse(readFileSync(join(profile, 'feed-request-state-v1.json'), 'utf8'));
    for (const value of Object.values(state.sources)) core.parseFeedRequestState(value);
  }
  receipt.status = receipt.publishers.every(
    (source) =>
      source.mode !== 'personal-feed' || ['updated', 'not-modified'].includes(source.status),
  )
    ? 'passed'
    : 'failed';
  if (receipt.status === 'failed') process.exitCode = 1;
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await service?.close();
  receipt.finishedAt = new Date().toISOString();
  if (output) writeFileSync(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
}

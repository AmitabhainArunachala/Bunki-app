#!/usr/bin/env node
/**
 * WP-01 placeholder for a root script whose real implementation belongs to a
 * later work package (controller §18).
 *
 * Controller WP-01 requires every script name it cites to be *defined* at
 * scaffold time — "undefined script names in this controller are a WP-01
 * defect". It does not require them to be implemented at scaffold time.
 *
 * This process exits 0 deliberately: a red CI on WP-01 for work that WP-01 is
 * explicitly told not to do would be a false signal. It prints loudly enough
 * that nobody can mistake the placeholder for a passing suite.
 *
 * Usage: node scripts/not-implemented.mjs <script-name> <owning-WP>
 */

const [, , scriptName = '<unknown script>', owningWorkPackage = '<unknown WP>'] = process.argv;

const lines = [
  '',
  '  ┌───────────────────────────────────────────────────────────────┐',
  '  │  PLACEHOLDER — NOT A PASSING TEST SUITE                       │',
  '  └───────────────────────────────────────────────────────────────┘',
  '',
  `  npm run ${scriptName}: not yet implemented (${owningWorkPackage}).`,
  '',
  `  WP-01 defines this script name so the controller's check set (§17.5)`,
  `  resolves. ${owningWorkPackage} replaces this placeholder with the real`,
  '  implementation and its assertions.',
  '',
  '  This exits 0 because there is nothing to fail yet. Do not read that as',
  '  evidence of anything working.',
  '',
];

process.stdout.write(`${lines.join('\n')}\n`);

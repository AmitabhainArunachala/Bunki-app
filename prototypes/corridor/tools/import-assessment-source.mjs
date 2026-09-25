#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { importSource } from './assessment/source-import.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--request') {
  console.error(
    'Usage: node prototypes/corridor/tools/import-assessment-source.mjs --request request.json',
  );
  process.exitCode = 1;
} else {
  try {
    const request = JSON.parse(await readFile(args[1], 'utf8'));
    console.log(JSON.stringify(await importSource(request), null, 2));
  } catch (error) {
    console.error(`Assessment source import failed: ${error.message}`);
    process.exitCode = 1;
  }
}

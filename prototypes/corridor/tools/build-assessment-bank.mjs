#!/usr/bin/env node
import { buildAssessmentBank, loadAudioManifest } from './assessment/bank.mjs';

const args = process.argv.slice(2);
if (args.length % 2 || args.some((arg, index) => index % 2 === 0 && arg !== '--audio-manifest')) {
  console.error(
    'Usage: node prototypes/corridor/tools/build-assessment-bank.mjs [--audio-manifest manifest.json ...]',
  );
  process.exitCode = 1;
} else {
  try {
    const assets = new Map();
    for (let index = 1; index < args.length; index += 2) {
      for (const [scriptId, asset] of await loadAudioManifest(args[index])) {
        if (assets.has(scriptId)) throw new Error(`Duplicate rendered script: ${scriptId}`);
        assets.set(scriptId, asset);
      }
    }
    const catalog = await buildAssessmentBank({ assets });
    console.log(
      JSON.stringify(
        {
          forms: catalog.entries.length,
          ready: catalog.entries.filter((entry) => entry.availability.ready).length,
          levels: catalog.levels,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(`Assessment bank build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

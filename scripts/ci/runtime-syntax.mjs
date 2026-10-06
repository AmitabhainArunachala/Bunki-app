import { execFileSync } from 'node:child_process';
for (const file of [
  'reference-core.js',
  'reference-ui.js',
  'corridor.js',
  'skip-core.js',
  'skip-ui.js',
])
  execFileSync(process.execPath, ['--check', `prototypes/corridor/${file}`], { stdio: 'inherit' });

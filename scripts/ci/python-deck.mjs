import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const file = process.argv[2];
assert(['test_gloss_ja.py', 'test_export_mcd.py'].includes(file));
execFileSync('python3', [`decks/kotoba-mine/tools/${file}`], { stdio: 'inherit' });

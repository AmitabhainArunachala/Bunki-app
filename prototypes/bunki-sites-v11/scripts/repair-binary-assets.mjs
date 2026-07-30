// The Sites->GitHub export mangled every binary public asset (gzip magic
// bytes became 0x59 0xAA...). The authoritative bytes ship in npm packages;
// this restores them so the snapshot is actually runnable/deployable.
// Evidence: docs/build-evidence/SITES_V11_LOCAL_EVIDENCE_ROUND1_2026-07-30.md
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dictSrc = path.join(root, "node_modules/kuromoji/dict");
const dictDst = path.join(root, "public/kuromoji");
let repaired = 0;
for (const file of fs.readdirSync(dictSrc)) {
  if (!file.endsWith(".dat.gz")) continue;
  fs.copyFileSync(path.join(dictSrc, file), path.join(dictDst, file));
  repaired += 1;
}
fs.copyFileSync(
  path.join(root, "node_modules/kotobako-data/kotobako-static.json"),
  path.join(root, "public/kotobako-static.json"),
);
const head = fs.readFileSync(path.join(dictDst, "base.dat.gz")).subarray(0, 2);
if (head[0] !== 0x1f || head[1] !== 0x8b) throw new Error("gzip magic still wrong");
console.log(`repaired ${repaired} kuromoji dictionaries + kotobako-static.json`);

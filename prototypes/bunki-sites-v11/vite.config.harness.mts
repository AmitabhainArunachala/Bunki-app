import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirnameHarness = path.dirname(fileURLToPath(import.meta.url));
import react from "@vitejs/plugin-react";

// Local evidence harness: mounts the real BunkiPhase2 client component with the
// real CSS and public assets, but stubs the Cloudflare API routes so the app
// runs in its designed offline/local-sync fallback mode. Interaction evidence
// gathered here covers client behavior only; server-backed flows (live feeds,
// article import, teacher, cloud sync) are exercised separately.
export default defineConfig({
  root: "harness",
  publicDir: "../public",
  plugins: [
    react(),
    {
      name: "bunki-api-stubs",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith("/kotobako-static.json")) {
            // The snapshot's public copy of this asset is binary-mangled; the
            // authoritative JSON ships in the kotobako-data npm package.
            const real = path.resolve(__dirnameHarness, "node_modules/kotobako-data/kotobako-static.json");
            res.setHeader("content-type", "application/json");
            fs.createReadStream(real).pipe(res);
            return;
          }
          const gzMatch = req.url?.match(/^\/(kuromoji\/[\w.-]+\.gz)(\?.*)?$/);
          if (gzMatch) {
            // Serve pre-gzipped tokenizer dictionaries as opaque binary, the
            // way the production host does — kuromoji inflates them itself.
            const fname = gzMatch[1].replace("kuromoji/", "");
            const npmCopy = path.resolve(__dirnameHarness, "node_modules/kuromoji/dict", fname);
            const file = fs.existsSync(npmCopy) ? npmCopy : path.resolve(__dirnameHarness, "public", gzMatch[1]);
            if (fs.existsSync(file)) {
              res.setHeader("content-type", "application/octet-stream");
              res.removeHeader("content-encoding");
              fs.createReadStream(file).pipe(res);
              return;
            }
          }
          if (!req.url?.startsWith("/api/")) {
            next();
            return;
          }
          res.setHeader("content-type", "application/json");
          if (req.url.startsWith("/api/reading-feed")) {
            res.end(JSON.stringify({ items: [], sources: [] }));
            return;
          }
          res.statusCode = 503;
          res.end(JSON.stringify({ error: "offline-harness" }));
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});

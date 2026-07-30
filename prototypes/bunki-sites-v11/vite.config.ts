import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import { sites } from "./build/sites-vite-plugin";

// kuromoji downloads its .dat.gz dictionaries with XHR and inflates them
// itself. The dev static server marks .gz files with Content-Encoding: gzip,
// so the browser pre-inflates the bytes and kuromoji's own gunzip fails with
// "invalid file signature". Serve them as opaque binary, like production does.
const rawGzipDictionaries = (): Plugin => ({
  name: "bunki-raw-gzip-dictionaries",
  configureServer(server) {
    const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "public");
    server.middlewares.use((req, res, next) => {
      const match = req.url?.match(/^\/(kuromoji\/[\w.-]+\.gz)(?:\?.*)?$/);
      if (!match) {
        next();
        return;
      }
      const file = path.join(publicDir, match[1]);
      if (!fs.existsSync(file)) {
        next();
        return;
      }
      res.setHeader("content-type", "application/octet-stream");
      res.removeHeader("content-encoding");
      fs.createReadStream(file).pipe(res);
    });
  },
});

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  d1_databases: [
    {
      binding: "DB",
      database_name: "bunki-local",
      database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
    },
  ],
  r2_buckets: [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      rawGzipDictionaries(),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});

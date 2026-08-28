# Bunki desktop (Mac)

A thin Electron shell that shows the **current integrated Bunki prototype —
the Corridor (掌 TENOHIRA line)** — in a phone-proportioned Mac window,
serving it exactly as GitHub Pages does: the corridor IS the site.

Source resolution order at launch:

1. `BUNKI_SRC_DIR` (env override)
2. `~/Bunki-app/prototypes/corridor` — the workspace checkout on `main`
3. `site/corridor` beside this file — a snapshot of `origin/main`

A corridor only qualifies if it ships `sw.js` (the TENOHIRA PWA marker), so a
stale checkout can never be shown by accident. Static server on
`127.0.0.1:5198` (override with `BUNKI_PORT`), byte-range support for the
recorded voices, SPA fallback to the front door — no child processes.

## Run from the repo

```bash
cd prototypes/bunki-desktop
npm install
npm start
```

## Build the double-clickable app

```bash
npm run dist   # release/mac-arm64/Bunki.app (ad-hoc signed, launch shim included)
```

Copy `Bunki.app` to `/Applications` if you want it in Launchpad.

The launch shim (`tools/add-launch-shim.cjs`) strips `ELECTRON_RUN_AS_NODE`
from the environment before exec — Electron-host terminals (Cursor, VS Code,
Claude Desktop) leak it, and with it set an Electron binary silently boots as
plain node and exits.

## Refresh the bundled snapshot

```bash
gh api repos/AmitabhainArunachala/Bunki-app/tarball/main > /tmp/bunki-main.tar.gz
rm -rf site/corridor && mkdir -p site/corridor
tar -xzf /tmp/bunki-main.tar.gz -C site/corridor --strip-components 3 '*/prototypes/corridor/*'
```

(Only needed if the workspace checkout is not on `main`.)

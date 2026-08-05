# Bunki Living Japanese

Bunki is an offline-first Japanese learning app that joins reading, dictionary
lookup, kanji, sentence mining, SRS review, and an AI conversation coach around
the learner’s real encounters.

This directory contains the complete v11 web application. It is ordinary source
code: it can be cloned, tested, run in GitHub Codespaces, and deployed from
GitHub Actions. It is no longer dependent on a private Codex workspace snapshot.

## Open from GitHub

[Open Bunki in GitHub Codespaces](https://codespaces.new/AmitabhainArunachala/Bunki-app?quickstart=1)

The repository’s dev container installs this app, starts it, forwards port
`5173`, and opens the preview. In a normal clone:

```bash
cd prototypes/bunki-sites-v11
npm ci
npm run dev
```

Requirements: Node.js `>=22.13.0` and Linux/macOS with `bash`.

## Verified commands

```bash
npm run lint
npm run test:unit
npx playwright install chromium webkit
npm run test:e2e
npm run build
```

`test:unit` includes a production Vinext build and the deterministic engine,
persistence, reading, and rendering tests. `test:e2e` runs the real hydrated app
in mobile Chromium, mobile WebKit, and desktop Chromium. The critical paths
cover onboarding, article-card opening, non-empty reader bodies, centered mobile
geometry, Zen appearance, explicit Back, and browser Back.

## GitHub-driven public deployment

The repository workflow `.github/workflows/bunki-v11.yml` verifies every pull
request. A verified push to `main` deploys this same Vinext Worker to Cloudflare
when these GitHub repository secrets are present:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The first deploy creates a public `*.workers.dev` URL and records it in the
GitHub deployment. No source is copied from an unpublished site during this
process; GitHub is the source of truth.

GitHub Pages is intentionally not used for the primary app. Pages is a static
host and cannot run Bunki’s server-side RSS/article import, AI, transcript, or
sync routes. Presenting a reduced static shell as the full app would be
misleading.

## Runtime modes

- Anonymous public use stores learning state in IndexedDB on the current device.
- RSS discovery and publisher article import run through server routes.
- AI teacher/generation, automatic YouTube transcript import, and cross-device
  cloud sync require a production identity layer and server configuration.
- Export JSON before changing domains. Use Library → Memory → Restore JSON on
  the new domain to migrate the device’s sources, cards, and review history.

`OPENAI_API_KEY` belongs only in the Worker’s secret store. Never put it in
GitHub, client code, or a public environment variable.

## Main source map

- `app/components/bunki-phase2.tsx` — product interaction surface
- `app/phase2.css` — responsive and Zen presentation
- `app/lib/reading-catalog.ts` — packaged graded and public-domain readings
- `app/lib/reading-feeds.ts` — reviewed live publisher feeds and extraction
- `app/lib/mining-engine.ts` — source analysis and contextual card proposals
- `app/lib/phase2-scheduler.ts` — FSRS review behavior
- `app/api/` — state, reader import, teacher, generation, and transcript routes
- `tests/e2e/` — browser acceptance paths
- `wrangler.jsonc` — standalone Cloudflare Worker deployment

## Data and attribution

JMdict/KANJIDIC2 © EDRDG, CC BY-SA 4.0. KanjiVG is CC BY-SA 3.0. Kuromoji is
Apache 2.0. JLPT labels are editorial estimates; JLPT does not publish a
canonical vocabulary or grammar inventory. AI-generated text is marked as
generated, and publisher summaries are explicitly distinguished from imported
full pages.

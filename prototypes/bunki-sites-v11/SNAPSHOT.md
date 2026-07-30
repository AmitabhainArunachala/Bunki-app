# Bunki Sites v11 source snapshot

This directory is the complete runnable source snapshot of the public Bunki Sites prototype
that John tested on 2026-07-30.

- Original Sites source commit: `4ab7d293dc5c89a4b55f44995e6225fe1a2e0440`
- Immutable Sites checkpoint: version 11
- Public URL: https://bunki-living-japanese.amitabha1982.chatgpt.site
- Snapshot destination: `prototypes/bunki-sites-v11`

## Run and verify

```bash
cd prototypes/bunki-sites-v11
npm ci
npm test
```

The snapshot includes the pinned package lock, app and API source, migrations, tests,
Kotobako dictionary data, and Kuromoji browser tokenizer assets. It intentionally excludes
only generated/cache/install directories: `.vinext/`, `.sites-runtime/`, `node_modules/`,
`dist/`, and `.wrangler/`.

This is a historical baseline, not an assertion that the v11 mobile experience is acceptable.
Continue from the interaction-recovery handoff in
`docs/handoffs/BUNKI_SITES_V11_INTERACTION_REDESIGN_HANDOFF_2026-07-30.md`.

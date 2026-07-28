# Self-hosted faces — licences and attribution

**Scope.** Every font byte in `apps/app/src/theme/fonts/`. Both families are
**SIL Open Font License 1.1**, which is the reason they are here rather than a
platform font stack: the OFL exists to permit bundling and redistribution,
including of subsets, so shipping these faces needs no operator licence decision
(unlike the share-alike _content_ sources, which `packages/seed/LICENSES.md`
keeps confined to that package).

This file follows the seed package's rule: **VERIFIED** means the licence text
was retrieved over HTTPS from the font project's own repository during this build
session and is reproduced here byte-for-byte, with URL, retrieval date and a
SHA-256 of the retrieved file recorded. There is no "verified from memory" state.

Everything below was retrieved on **2026-07-28** with `curl` through this
session's egress proxy.

---

## 1. Shippori Mincho — VERIFIED

**Used for:** `shippori-mincho-400.ts` — the reading face. Named in the frozen
working spec §8 by the operator ("Shippori Mincho for reading surfaces"), so this
is the face the design language asked for rather than a substitute.

- **Copyright:** `Copyright 2021 The Shippori Mincho Project Authors
(https://github.com/fontdasu/ShipporiMincho)`
- **Licence:** SIL Open Font License, Version 1.1
- **Licence text:** `OFL-ShipporiMincho.txt` in this directory
- **Retrieved from:** `https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/shipporimincho/OFL.txt`
- **SHA-256 of retrieved file:** `41fba056279be5f45ff9a99e44b7b53897b42732f5806d8e666e0ab49ac6bd38`
- **Font bytes retrieved from:** the Google Fonts CSS API
  (`https://fonts.googleapis.com/css2?family=Shippori+Mincho&text=…`), which
  returns a woff2 subset of the same OFL release. Per-chunk SHA-256 values are
  recorded in the generated module.

## 2. Noto Sans JP — VERIFIED

**Used for:** `noto-sans-jp-400.ts` and `noto-sans-jp-700.ts` — the UI face.

- **Copyright:** the notice carries no separate copyright line; the licence text
  itself is the notice shipped by the Noto CJK project.
- **Licence:** SIL Open Font License, Version 1.1
- **Licence text:** `OFL-NotoSansJP.txt` in this directory
- **Retrieved from:** `https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/LICENSE`
- **SHA-256 of retrieved file:** `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`
- **Font bytes retrieved from:** the Google Fonts CSS API
  (`https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400&text=…`, and
  the same for 700).

---

## Why the family names are unchanged

OFL clause 3 forbids a Modified Version from using a **Reserved Font Name**, and
a subset is a Modified Version. Both notices above were checked for a
reservation: in each, the string "Reserved Font Name" occurs only in the
definitions section of the licence, and neither declares one after the copyright
line. With no name reserved, clause 3 does not bite, and the faces keep the names
their authors gave them — which is also the honest thing to render in an
attribution footer.

## What is shipped, and what is not

The modules carry **subsets**, not the full families: the coverage contract is
`coverage.mjs` + `joyo.mjs` in this directory, and `generate-faces.mjs` is the
script that cuts it. Characters outside the contract fall back through the
platform stack declared in `../typography.ts`. Nothing here is sold, nothing is
distributed on its own, and the licence texts travel with the bytes — which is
the whole of what the OFL asks.

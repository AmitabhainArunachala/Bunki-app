# Self-hosted type — SIL Open Font License 1.1

All font files in this directory are woff2 chunks mirrored from Google
Fonts (fonts.gstatic.com) on 2026-08-20, referenced by
`prototypes/corridor/fonts.css` with their original unicode-range maps.

| Family | Files | Copyright | License |
| --- | --- | --- | --- |
| Shippori Mincho B1 (800) | `shippori-*.woff2` | The Shippori Mincho B1 Project Authors (FONTDASU) | OFL 1.1 |
| Yuji Syuku (400, kana chunks only) | `yuji-*.woff2` | The Yuji Project Authors (Kataoka Yuji) | OFL 1.1 |
| Kaisei Tokumin (800, 再難良易 micro-subset) | `kaisei-*.woff2` | The Kaisei Project Authors (FONTWORKS, Font Kai) | OFL 1.1 |

## Text faces (added 2026-10-10)

The three faces above are specialised: titles and headwords, the brush
reading, the four grade seals. The interface, the reading text and the
figures use the four families below, so no room depends on a face the
device happens to have.

| Family | Role | Files | License text |
| --- | --- | --- | --- |
| Noto Sans JP (variable 400–700) | interface | `noto-sans-jp-*.woff2` (124) | `licenses/noto-sans-jp-OFL.txt` |
| Noto Serif JP (variable 400–700) | reading text | `noto-serif-jp-*.woff2` (124) | `licenses/noto-serif-jp-OFL.txt` |
| Noto Serif (variable 400–700, normal and italic) | Latin glosses | `noto-serif-latin-*.woff2` (16) | `licenses/noto-serif-latin-OFL.txt` |
| Roboto Mono (variable 400–600) | figures and identifiers | `roboto-mono-*.woff2` (6) | `licenses/roboto-mono-OFL.txt` |

These 270 files are the unmodified subsets served by the Google Fonts
CSS2 API on 2026-10-09, with their upstream unicode-range maps in
`fonts.css`; nothing was re-encoded or renamed inside the files.
`PROVENANCE.json` records each file's source URL, size and SHA-256, and
the Google Fonts commit (`bd8f81ddb5c74d5c8897b36ad88b440266245103`)
the license texts and metadata were read from. Each `licenses/*.txt` is
the family's complete OFL 1.1 text with its copyright notice.

The service worker does not precache this pool: a page fetches the
chunks its own text uses, and each is checked against the build
manifest before it is cached. The system names that follow a bundled
family in a stack only stand in while a chunk is still loading.

The OFL 1.1 text: https://openfontlicense.org — the fonts are used and
redistributed unmodified (subset selection only, which OFL permits);
they are not sold on their own. This pool is licence-separated from the
content pools per the corridor's rights discipline (fonts are software
under OFL, not learner content).

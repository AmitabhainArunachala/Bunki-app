# Frozen canonical deck reproduction

The N2, N1, senmon and kotoba-master deck/token files were produced by Nihongo
`2602ec65f79154616abb2f3666f3928929a93413`. `canonical-decks-source.json` pins the
four source files by byte length and SHA-256. This content identity is separate
from the current shared study engine/UI identity; do not replace one with the other.

The Nihongo repository is private. Bunki currently has no approved CI path to
read that source. The anonymous downloader fails closed; it does not solve the
access requirement. An operator must first approve and provision a narrowly
scoped read path into an external directory. Never copy the private master corpus
into this repository, publish it as an artifact, or broaden credentials to make
this check green. Source/cache and generated output must remain outside the checkout.

After authorized provisioning, run from a complete Bunki checkout:

```sh
BUNKI_CANONICAL_SOURCE=/absolute/external/verified-source \
BUNKI_CANONICAL_PYTHON=/absolute/python \
node scripts/ci/deck-frozen.mjs
```

The selected Python needs the existing `scripts/ci/deck-requirements.txt`
dependencies, including fugashi 1.5.2 and unidic-lite 1.0.8. The two legacy Kotoba
builds retain their existing `python3` invocation, so that executable also needs
the repository's existing deck dependencies. The canonical helper verifies all
four source pins before execution, writes to a fresh external directory, and
compares all eight outputs byte-for-byte with the frozen packs. It never repairs
a tampered cache or writes canonical outputs into the checkout. The existing git
diff/untracked checks still inspect Kotoba generation; APKG restoration remains.
A cache must not be modified concurrently while a build reads it.

The pinned canonical producer imports `decks/n2n1/tools/build_n2n1.py` as a
library. That module remains an evidence input together with the new canonical
helper and source pin. Only its obsolete standalone invocation is removed; the
legacy Kotoba builder and its evidence input remain unchanged.

## Behavioral judge fixture

```sh
BUNKI_CANONICAL_SOURCE=/absolute/external/verified-source \
BUNKI_CANONICAL_PYTHON=/absolute/python \
node --test scripts/ci/canonical-decks.test.mjs \
  scripts/ci/canonical-inputs.test.mjs \
  scripts/ci/canonical-library-input.test.mjs
```

Run this from the complete pinned Bunki checkout, not a partial source export.
The immutable judge executes the real canonical producer, checks source tamper,
missing input and output mismatch rejection, then runs the real old N2 producer
in an isolated fixture and requires its output to be rejected. Its copied fixture
requires these repository paths:

- `decks/n2n1`
- `decks/kotoba-mine/tools` and `decks/kotoba-mine/source`
- `prototypes/corridor/tools`
- `prototypes/corridor/data/share_alike/kanji.json` and `dict.json`
- `prototypes/drift/data/wbig.json` and `sem.json`
- `docs/content`
- `corpus/src`

A missing path is an infrastructure failure and fails the judge; it is never a
skip or a passing negative control. These are the old producer's actual inputs,
not substitute expected outputs. Keep the judge unchanged when reviewing this
routing change. A local pass does not establish authenticated CI source access.

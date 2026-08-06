# corpus/ — content spine + difficulty grading

Data pipelines for the app's corpus and the three-signal difficulty grader.
Python subtree, self-contained: it never touches the Node build. Spec lives in
Wayfinder #32 and tickets #41 (sources + legal boundaries), #42 (grading), #45
(kanji). **No product decisions are made here** — records are raw ingestion
rows, not the #35 atom/graph model.

## The licence law (from #41 — read before adding any source)

Two pools, separated from day one, enforced by `corpus.provenance`:

1. **proprietary_safe** — CC0 / CC BY / PD / permissive (MIT, BSD, PDM, PDL,
   government open terms). May ship in a proprietary build. CC BY requires
   attribution text recorded in the asset's `PROVENANCE.yml`.
2. **share_alike** — CC BY-SA and kin (JMdict/KANJIDIC2, Wikipedia, KanjiVG,
   kanjium). Copyleft infects derivatives; anything merged with this pool
   ships under the same licence. Keep the boundary deliberate.

**NC or ND anywhere in a licence is a hard error** (Tadoku, livedoor,
WLSP-familiarity, JEV…). Research-only terms are rejected. No mainstream
Japanese news is fetched here, ever — 朝日/毎日/読売/日経/産経/中日/共同/時事
block ClaudeBot by name and several ban RAG and 要約 in contract (#41).

Every asset directory carries a `PROVENANCE.yml` (name, upstream URLs,
retrieved date, licence, pool, attribution, restrictions, upstream pin,
artifact sha256s). `python -m corpus.provenance` regenerates `REGISTRY.md`.

## Layout

```
corpus/
  src/corpus/            package: provenance, records, sources/*, grading/*
  tests/                 pytest; CI runs `-m "not realdata"`
  samples/               small committed outputs, regenerable from upstream
  data/                  downloads (gitignored, never committed)
```

## Running

```
cd corpus
uv venv && uv pip install -e ".[dev]"
uv run pytest tests -q -m "not realdata"   # unit tier (CI)
uv run pytest tests -q                     # + realdata tier (needs downloads)
```

## Verification law

Named verifier before code; runtime proof over the real data, not inspection;
worker ≠ judge (a separate agent re-runs from a fresh checkout); sampling and
skips stated explicitly in the PR body. See
`docs/audits/DRIFT_V10_RED_TEAM_LEDGER_2026-08-06.md` for the estate's
proxy-verification failure mode.

Level labels are honest: any level emitted here names the substrate it was
derived from (e.g. a NINJAL-derived band) — never presented as official JLPT.

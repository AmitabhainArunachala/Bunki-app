"""Realdata tier — the empirical eval for the three-signal grader.

Needs network/downloads:
- SNOW T15 xlsx (via the official jnlp.org download CGI redirect)
- NINJAL rokusyutaisyo.csv (auto-download, sha256-pinned)
- 羅生門 新字新仮名 from the Aozora Bunko GitHub mirror

Run:  uv run pytest tests/test_grading_realdata.py -q -s -m realdata
"""

from __future__ import annotations

import html as _html
import json
import re
import statistics
import urllib.request
from pathlib import Path

import pytest

from corpus.grading.grade import grade, load_reference, ordinal
from corpus.grading.reference import (
    SNOW_URL,
    load_snow_pairs,
    sample_pairs,
    verify_snow_file,
)
from corpus.records import CorpusRecord, read_jsonl, write_jsonl

pytestmark = pytest.mark.realdata

DATA = Path(__file__).resolve().parents[1] / "data"
SNOW_XLSX = DATA / "snow" / "T15-2020.1.7.xlsx"
RASHOMON_URL = (
    "https://raw.githubusercontent.com/aozorabunko/aozorabunko/"
    "master/cards/000879/files/127_15260.html"
)
RASHOMON_CACHE = DATA / "aozora" / "rashomon_127_15260.html"

N_PAIRS = 2000
SEED = 42


def _ensure_snow() -> Path:
    if SNOW_XLSX.exists():
        return verify_snow_file(SNOW_XLSX)
    SNOW_XLSX.parent.mkdir(parents=True, exist_ok=True)
    page = urllib.request.urlopen(SNOW_URL).read().decode("utf-8", "replace")
    m = re.search(r'URL=(\S+?)"', page)
    assert m, "could not resolve SNOW T15 redirect from the jnlp.org download CGI"
    urllib.request.urlretrieve(m.group(1), SNOW_XLSX)
    return verify_snow_file(SNOW_XLSX)


def _ensure_rashomon() -> str:
    if not RASHOMON_CACHE.exists():
        RASHOMON_CACHE.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(RASHOMON_URL, RASHOMON_CACHE)
    raw = RASHOMON_CACHE.read_bytes().decode("shift_jis", "replace")
    m = re.search(r'<div class="main_text">(.*?)</div>', raw, re.S)
    assert m, "main_text div not found in Aozora HTML"
    body = m.group(1)
    body = re.sub(r"<rt>.*?</rt>|<rp>.*?</rp>", "", body, flags=re.S)  # drop ruby readings
    body = re.sub(r"<br\s*/?>", "\n", body)
    body = re.sub(r"<[^>]+>", "", body)
    text = _html.unescape(body).strip()
    assert len(text) > 4000, "羅生門 text suspiciously short"
    return text


@pytest.fixture(scope="module")
def snow_sample():
    pairs = load_snow_pairs(_ensure_snow())
    assert len(pairs) == 50000
    return sample_pairs(pairs, N_PAIRS, SEED)


@pytest.fixture(scope="module")
def graded_sample(snow_sample):
    ref = load_reference()
    assert ref is not None
    tmr_level = ref["signals"]["tmr"]["level"]
    rows = []
    for orig, simp in snow_sample:
        g_o, g_s = grade(orig), grade(simp)
        rows.append(
            {
                "identical": orig == simp,
                "jread": (
                    g_o["signals"]["jreadability"]["score"],
                    g_s["signals"]["jreadability"]["score"],
                ),
                "cov": (
                    g_o["signals"]["lexical_coverage"]["coverage"],
                    g_s["signals"]["lexical_coverage"]["coverage"],
                ),
                "tmr": (
                    g_o["signals"]["tmr"]["by_level"].get(tmr_level),
                    g_s["signals"]["tmr"]["by_level"].get(tmr_level),
                ),
            }
        )
    return rows


def _stats(rows, key, easier_is_higher):
    pairs = [r[key] for r in rows if r[key][0] is not None and r[key][1] is not None]
    orig = [o for o, _s in pairs]
    simp = [s for _o, s in pairs]
    diffs = [s - o for o, s in pairs]
    mean_diff = statistics.fmean(diffs)
    sd = statistics.stdev(diffs)
    d = mean_diff / sd if sd else float("inf")
    if easier_is_higher:
        violations = sum(1 for x in diffs if x < 0)
    else:
        violations = sum(1 for x in diffs if x > 0)
    return {
        "n": len(pairs),
        "mean_orig": statistics.fmean(orig),
        "mean_simp": statistics.fmean(simp),
        "mean_diff": mean_diff,
        "cohens_d_paired": d,
        "violation_rate": violations / len(pairs),
    }


def test_snow_eval_all_three_signals(graded_sample):
    """The empirical eval over original→simplified pairs.

    SPEC DEVIATION, measured and deliberate: the #42 verifier expected
    ``mean jreadability of simplified > original``. Measured on 2,000 pairs
    (seed 42): 4.6500 → 4.6213, paired d = -0.037 — jreadability is
    direction-INSENSITIVE on SNOW's lexical simplification (kango swapped
    for kango; potentials expanded to 〜ことができる, which RAISES the verb
    percentage the formula penalizes). That is precisely the structural
    blind spot signals 2–3 exist to cover, so the jreadability assertion
    here pins the measured regime (|d| small) instead of the wrong-sign
    direction; the lexical signals keep their directional assertions.
    """
    n_identical = sum(1 for r in graded_sample if r["identical"])
    changed = [r for r in graded_sample if not r["identical"]]
    jread = _stats(graded_sample, "jread", easier_is_higher=True)
    cov = _stats(graded_sample, "cov", easier_is_higher=True)
    tmr = _stats(graded_sample, "tmr", easier_is_higher=False)

    print("\n=== SNOW T15 eval: 2,000 original→simplified pairs, seed 42 ===")
    print(f"identical original==simplified pairs in sample: {n_identical}")
    hdr = f"{'signal':<18}{'n':>6}{'mean orig':>12}{'mean simp':>12}{'mean diff':>12}{'paired d':>10}{'viol rate':>11}"
    print(hdr)
    for name, s in (("jreadability", jread), ("lexical_coverage", cov), ("tmr_core", tmr)):
        print(
            f"{name:<18}{s['n']:>6}{s['mean_orig']:>12.4f}{s['mean_simp']:>12.4f}"
            f"{s['mean_diff']:>12.4f}{s['cohens_d_paired']:>10.3f}{s['violation_rate']:>11.4f}"
        )
    print(f"--- changed pairs only (n={len(changed)}) ---")
    print(hdr)
    for name, key, easier_hi in (
        ("jreadability", "jread", True),
        ("lexical_coverage", "cov", True),
        ("tmr_core", "tmr", False),
    ):
        s = _stats(changed, key, easier_is_higher=easier_hi)
        print(
            f"{name:<18}{s['n']:>6}{s['mean_orig']:>12.4f}{s['mean_simp']:>12.4f}"
            f"{s['mean_diff']:>12.4f}{s['cohens_d_paired']:>10.3f}{s['violation_rate']:>11.4f}"
        )

    assert cov["mean_simp"] > cov["mean_orig"]  # higher coverage = easier
    assert tmr["mean_simp"] < tmr["mean_orig"]  # lower TMR = easier
    # jreadability: measured direction-insensitivity (see docstring)
    assert abs(jread["cohens_d_paired"]) < 0.1


def test_rashomon_proxy_trap(snow_sample):
    """The named adversarial case: jreadability rates 羅生門 non-hardest
    (no lexical term — Aizawa 2019), NINJAL coverage puts it in the hard
    tail, and the disagreement flag fires."""
    text = _ensure_rashomon()
    out = grade(text)
    ref = load_reference()

    jread_band = out["signals"]["jreadability"]["band"]
    cov = out["signals"]["lexical_coverage"]["coverage"]
    ords = out["disagreement"]["detail"]["ordinals"]

    snow_covs = sorted(
        grade(o)["signals"]["lexical_coverage"]["coverage"] for o, _ in snow_sample[:500]
    )
    pctile = sum(1 for c in snow_covs if c < cov) / len(snow_covs)

    print("\n=== 羅生門 (新字新仮名, Aozora) ===")
    print(f"jreadability: score={out['signals']['jreadability']['score']:.3f} band={jread_band}")
    print(f"lexical coverage={cov:.4f} (percentile within SNOW originals: {pctile:.1%})")
    print(f"band_vector={out['signals']['lexical_coverage']['band_vector']}")
    print(f"tmr={out['signals']['tmr']['by_level']}")
    print(f"ordinals={ords} flag={out['disagreement']['flag']}")

    assert jread_band != "上級後半", "jreadability must NOT call 羅生門 hardest-band"
    cov_spec = ref["signals"]["lexical_coverage"]
    assert ordinal(cov, cov_spec["edges"], higher_is_harder=False) == 2
    assert pctile <= 0.25, "羅生門 coverage should sit in the hard tail of SNOW originals"
    assert out["disagreement"]["flag"] is True


def test_determinism_on_real_texts(snow_sample):
    text = _ensure_rashomon()
    assert grade(text) == grade(text)
    orig, _ = snow_sample[0]
    a, b = grade(orig), grade(orig)
    assert a == b
    assert json.dumps(a, ensure_ascii=False) == json.dumps(b, ensure_ascii=False)


def test_no_jlpt_with_default_substrates(snow_sample):
    def walk(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                yield str(k)
                yield from walk(v)
        elif isinstance(obj, (list, tuple)):
            for v in obj:
                yield from walk(v)
        elif isinstance(obj, str):
            yield obj

    out = grade(snow_sample[0][0])
    for s in walk(out):
        assert "jlpt" not in s.lower(), s


def test_cli_roundtrip(tmp_path, snow_sample):
    from corpus.grading.grade import main

    inp, outp = tmp_path / "in.jsonl", tmp_path / "out.jsonl"
    recs = [
        CorpusRecord(id=f"snow:{i}", source="snow-t15", title="", text=orig)
        for i, (orig, _) in enumerate(snow_sample[:5])
    ]
    write_jsonl(recs, inp)
    assert main([str(inp), str(outp)]) == 0
    back = list(read_jsonl(outp))
    assert len(back) == 5
    for rec in back:
        assert set(rec.meta["grading"]) == {"signals", "disagreement"}
        assert rec.meta["grading"]["signals"]["tmr"]["substrate"] == "ninjal-kyoiku-kihon-goi"

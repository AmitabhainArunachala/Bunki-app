import pytest

from corpus.provenance import Pool, ProvenanceError, discover, load, registry_markdown

VALID = """\
name: ja-wikinews
upstream:
  - https://dumps.wikimedia.org/jawikinews/latest/jawikinews-latest-pages-articles.xml.bz2
retrieved: "2026-08-07"
licence: CC BY 4.0
licence_url: https://creativecommons.org/licenses/by/4.0/
pool: proprietary_safe
attribution: "Wikinews contributors, ja.wikinews.org, CC BY 4.0"
artifact_sha256:
  jawikinews-latest-pages-articles.xml.bz2: abc123
"""


def _write(tmp_path, body, name="PROVENANCE.yml", sub="asset"):
    d = tmp_path / sub
    d.mkdir(parents=True, exist_ok=True)
    p = d / name
    p.write_text(body, encoding="utf-8")
    return p


def test_valid_loads(tmp_path):
    p = load(_write(tmp_path, VALID))
    assert p.name == "ja-wikinews"
    assert p.pool is Pool.PROPRIETARY_SAFE
    assert p.artifact_sha256


@pytest.mark.parametrize("missing", ["name", "upstream", "retrieved", "licence", "pool"])
def test_missing_required_field_rejected(tmp_path, missing):
    body = "\n".join(
        line for line in VALID.splitlines() if not line.startswith(missing + ":")
    )
    if missing == "upstream":
        body = body.replace(
            "  - https://dumps.wikimedia.org/jawikinews/latest/jawikinews-latest-pages-articles.xml.bz2\n",
            "",
        )
    with pytest.raises(ProvenanceError, match="missing required"):
        load(_write(tmp_path, body))


@pytest.mark.parametrize(
    "licence", ["CC BY-NC-SA 4.0", "CC BY-ND 4.0", "CC BY-NC-ND 4.0", "CC BY-NC 3.0"]
)
def test_nc_nd_hard_error(tmp_path, licence):
    body = VALID.replace("licence: CC BY 4.0", f"licence: {licence}").replace(
        "pool: proprietary_safe", "pool: share_alike"
    )
    with pytest.raises(ProvenanceError, match="NC/ND"):
        load(_write(tmp_path, body))


def test_research_only_rejected(tmp_path):
    body = VALID.replace("licence: CC BY 4.0", "licence: research-only")
    with pytest.raises(ProvenanceError, match="research-only"):
        load(_write(tmp_path, body))


def test_sharealike_must_be_in_sharealike_pool(tmp_path):
    body = VALID.replace("licence: CC BY 4.0", "licence: CC BY-SA 4.0")
    with pytest.raises(ProvenanceError, match="share_alike"):
        load(_write(tmp_path, body))


def test_sharealike_pool_accepts_sa(tmp_path):
    body = VALID.replace("licence: CC BY 4.0", "licence: CC BY-SA 4.0").replace(
        "pool: proprietary_safe", "pool: share_alike"
    )
    assert load(_write(tmp_path, body)).pool is Pool.SHARE_ALIKE


def test_cc_by_requires_attribution(tmp_path):
    body = VALID.replace(
        'attribution: "Wikinews contributors, ja.wikinews.org, CC BY 4.0"\n', ""
    )
    with pytest.raises(ProvenanceError, match="attribution"):
        load(_write(tmp_path, body))


def test_cc0_needs_no_attribution(tmp_path):
    body = VALID.replace("licence: CC BY 4.0", "licence: CC0-1.0").replace(
        'attribution: "Wikinews contributors, ja.wikinews.org, CC BY 4.0"\n', ""
    )
    assert load(_write(tmp_path, body)).licence == "CC0-1.0"


def test_unknown_licence_in_safe_pool_needs_notes(tmp_path):
    body = VALID.replace("licence: CC BY 4.0", "licence: 政府標準利用規約 2.0").replace(
        'attribution: "Wikinews contributors, ja.wikinews.org, CC BY 4.0"\n', ""
    )
    with pytest.raises(ProvenanceError, match="legal basis"):
        load(_write(tmp_path, body))
    ok = body + 'notes: "Government open terms, CC BY 4.0-compatible per Wayfinder #41."\n'
    assert load(_write(tmp_path, ok, sub="asset2")).notes


def test_bad_date_rejected(tmp_path):
    body = VALID.replace('retrieved: "2026-08-07"', 'retrieved: "07/08/2026"')
    with pytest.raises(ProvenanceError, match="YYYY-MM-DD"):
        load(_write(tmp_path, body))


def test_discover_rejects_duplicate_names(tmp_path):
    _write(tmp_path, VALID, sub="a")
    _write(tmp_path, VALID, sub="b")
    with pytest.raises(ProvenanceError, match="duplicate"):
        discover(tmp_path)


def test_registry_markdown_pools(tmp_path):
    _write(tmp_path, VALID, sub="a")
    sa = VALID.replace("licence: CC BY 4.0", "licence: CC BY-SA 4.0").replace(
        "pool: proprietary_safe", "pool: share_alike"
    ).replace("name: ja-wikinews", "name: jmdict")
    _write(tmp_path, sa, sub="b")
    md = registry_markdown(discover(tmp_path))
    assert "ja-wikinews" in md and "jmdict" in md
    assert md.index("ja-wikinews") < md.index("Pool 2") < md.index("jmdict")

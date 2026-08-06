"""Licence provenance registry for corpus assets.

Two pools, separated from day one (Wayfinder #41 — "an architectural decision,
not a footnote"):

- ``proprietary_safe``: CC0 / CC BY / public domain / permissive (MIT, BSD,
  PDM, PDL, government open terms). May ship inside a proprietary build.
  CC BY entries must carry their attribution text.
- ``share_alike``: CC BY-SA and kin (JMdict/KANJIDIC2, Wikipedia, KanjiVG,
  kanjium, MJ list). Copyleft infects derivatives: anything merged with this
  pool ships under the same licence. The boundary is deliberate.

NC or ND anywhere in a licence is a hard error — those assets may not enter
the shippable corpus at all (Tadoku CC BY-NC-ND, livedoor CC BY-ND,
WLSP-familiarity CC BY-NC-SA, JEV research-only…). Research-only terms are
likewise rejected.

Every ingested asset directory carries a ``PROVENANCE.yml`` next to its code.
``python -m corpus.provenance <root>`` regenerates ``corpus/REGISTRY.md``.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import yaml


class Pool(str, Enum):
    PROPRIETARY_SAFE = "proprietary_safe"
    SHARE_ALIKE = "share_alike"


class ProvenanceError(ValueError):
    pass


_REQUIRED = ("name", "upstream", "retrieved", "licence", "pool")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Licence families we recognise without further justification.
_KNOWN_SAFE_TOKENS = {"CC0", "PD", "PDM", "PDL", "MIT", "BSD", "UNICODE"}
_FORBIDDEN_TOKENS = {"NC", "ND"}


def _tokens(licence: str) -> set[str]:
    return {t.upper() for t in re.split(r"[^A-Za-z0-9.]+", licence) if t}


@dataclass(frozen=True)
class Provenance:
    name: str
    upstream: tuple[str, ...]
    retrieved: str
    licence: str
    pool: Pool
    licence_url: str = ""
    attribution: str = ""
    restrictions: tuple[str, ...] = ()
    upstream_pin: str = ""
    artifact_sha256: dict[str, str] = field(default_factory=dict)
    notes: str = ""
    path: str = ""


def _validate(raw: dict, origin: str) -> Provenance:
    missing = [k for k in _REQUIRED if not raw.get(k)]
    if missing:
        raise ProvenanceError(f"{origin}: missing required field(s) {missing}")

    retrieved = str(raw["retrieved"])
    if not _DATE_RE.match(retrieved):
        raise ProvenanceError(f"{origin}: retrieved must be YYYY-MM-DD, got {retrieved!r}")

    try:
        pool = Pool(raw["pool"])
    except ValueError:
        raise ProvenanceError(
            f"{origin}: pool must be one of {[p.value for p in Pool]}, got {raw['pool']!r}"
        ) from None

    licence = str(raw["licence"])
    toks = _tokens(licence)

    if forbidden := toks & _FORBIDDEN_TOKENS:
        raise ProvenanceError(
            f"{origin}: licence {licence!r} carries {sorted(forbidden)} — "
            "NC/ND assets may not enter the corpus (Wayfinder #41)"
        )
    if "RESEARCH" in toks or "研究" in licence:
        raise ProvenanceError(f"{origin}: research-only terms may not enter the corpus")

    if "SA" in toks and pool is not Pool.SHARE_ALIKE:
        raise ProvenanceError(
            f"{origin}: licence {licence!r} is ShareAlike but pool is {pool.value} — "
            "copyleft must live in the share_alike pool"
        )

    attribution = str(raw.get("attribution") or "")
    if "BY" in toks and not attribution:
        raise ProvenanceError(
            f"{origin}: licence {licence!r} requires attribution text in 'attribution'"
        )

    if pool is Pool.PROPRIETARY_SAFE and not (toks & _KNOWN_SAFE_TOKENS or "BY" in toks):
        if not str(raw.get("notes") or ""):
            raise ProvenanceError(
                f"{origin}: unrecognised licence {licence!r} in proprietary_safe pool — "
                "state the legal basis in 'notes'"
            )

    upstream = raw["upstream"]
    if isinstance(upstream, str):
        upstream = [upstream]
    if not all(isinstance(u, str) and u for u in upstream):
        raise ProvenanceError(f"{origin}: upstream must be a non-empty list of URLs")

    return Provenance(
        name=str(raw["name"]),
        upstream=tuple(upstream),
        retrieved=retrieved,
        licence=licence,
        pool=pool,
        licence_url=str(raw.get("licence_url") or ""),
        attribution=attribution,
        restrictions=tuple(raw.get("restrictions") or ()),
        upstream_pin=str(raw.get("upstream_pin") or ""),
        artifact_sha256=dict(raw.get("artifact_sha256") or {}),
        notes=str(raw.get("notes") or ""),
        path=origin,
    )


def load(path: str | Path) -> Provenance:
    path = Path(path)
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ProvenanceError(f"{path}: not a mapping")
    return _validate(raw, str(path))


def discover(root: str | Path) -> list[Provenance]:
    provs = [load(p) for p in sorted(Path(root).rglob("PROVENANCE.yml"))]
    names = [p.name for p in provs]
    if len(names) != len(set(names)):
        dupes = sorted({n for n in names if names.count(n) > 1})
        raise ProvenanceError(f"duplicate provenance names: {dupes}")
    return provs


def registry_markdown(provs: list[Provenance]) -> str:
    lines = [
        "# Corpus asset registry",
        "",
        "Generated by `python -m corpus.provenance` — do not edit by hand.",
        "",
    ]
    for pool, title in (
        (Pool.PROPRIETARY_SAFE, "Pool 1 — shippable proprietarily (CC0 / CC BY / PD / permissive)"),
        (Pool.SHARE_ALIKE, "Pool 2 — ShareAlike (copyleft; infects derivatives)"),
    ):
        members = [p for p in provs if p.pool is pool]
        lines += [f"## {title}", ""]
        if not members:
            lines += ["(none)", ""]
            continue
        lines += ["| asset | licence | retrieved | pin | restrictions |", "|---|---|---|---|---|"]
        for p in members:
            lines.append(
                f"| {p.name} | {p.licence} | {p.retrieved} | {p.upstream_pin or '—'} | "
                f"{'; '.join(p.restrictions) or '—'} |"
            )
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    root = Path(args[0]) if args else Path(__file__).resolve().parents[2]
    out = root / "REGISTRY.md"
    provs = discover(root)
    out.write_text(registry_markdown(provs), encoding="utf-8")
    print(f"{len(provs)} asset(s) → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

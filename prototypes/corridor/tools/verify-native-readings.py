#!/usr/bin/env python3
"""Static acceptance for the 30 native Bunki originals added to 本棚.

The verifier deliberately knows nothing about a "pack". It compares the
five-field authored source, non-runtime editorial sidecar, native generated
records, lean shelf index, standalone bundle, and the immutable ca07a8e
first-40 receipt. ``--rebuild`` proves that the current standalone builder is
byte-deterministic; the ca07 article builders currently know only 26/40 shelf
records, so that honest data-pipeline gap is reported rather than patched here.

Human editorial approval is a separate publication gate. The ordinary run
reports it without pretending that an automated check can grant it;
``--publication`` fails until all 30 sidecar statuses are approved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORRIDOR = HERE.parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "corpus" / "src"))

import build_articles as ba  # noqa: E402
from corpus.grading._mecab import get_tagger, is_punct  # noqa: E402

SOURCE = REPO / "docs/content/bunki-originals-zoka-sanjin.jsonl"
EDITORIAL = REPO / "docs/content/bunki-originals-zoka-sanjin.editorial.json"
BASELINE = REPO / "docs/build-evidence/kairo-feel-lock/native-readings/first40-baseline.json"
ARTICLES = CORRIDOR / "data/articles"
MANIFEST = CORRIDOR / "data/manifest.json"
WORDS = CORRIDOR / "data/share_alike/words.json"
IDIOMS = CORRIDOR / "data/share_alike/idioms.json"
SEM = CORRIDOR / "data/proprietary_safe/sem.json"
STANDALONE = CORRIDOR / "corridor-standalone.html"
ARCHIVE = ARTICLES / "archive"
ARCHIVE_INDEX = ARTICLES / "archive-index.json"
EXAMPLES = CORRIDOR / "data/proprietary_safe/examples"
BASE_COMMIT = "ca07a8e5b1dc6d45ff70ad0feec3c7333285eff9"
SOURCE_RECORD = {
    "name": "bunki-original-reading-catalog",
    "licence": "Bunki original",
    "attribution": "Bunki original text",
    "url": "",
}
RUNTIME_FILES = [
    CORRIDOR / "corridor.js",
    CORRIDOR / "corridor.css",
    HERE / "build_articles.py",
]

# The editorial matrix is an executable contract: exact order, identity,
# authored band, Japanese title, and one primary inspiration source.
MATRIX = [
    ("bunki-graded-n3-zoka-sanjin-morning", "N3", "造化三神に出会う朝", "V1"),
    ("bunki-graded-n3-nakaima-diary", "N3", "「中今」を感じる一日", "V1"),
    ("bunki-graded-n3-world-beginning", "N3", "世界のはじまりに現れた三柱", "V2"),
    ("bunki-graded-n3-hidden-deity", "N3", "姿を隠した神さま", "V2"),
    ("bunki-graded-n3-kojiki-book", "N3", "『古事記』はどんな本？", "V3"),
    ("bunki-graded-n3-hashira-counter", "N3", "神さまを「一柱」と数えるわけ", "V3"),
    ("bunki-graded-n3-feel-jingu-forest", "N3", "伊勢神宮の森を映像で歩く", "V4"),
    ("bunki-graded-n3-musubi-visual", "N3", "天・地・祈りをつなぐ「むすひ」", "V4"),
    ("bunki-graded-n3-gratitude-week", "N3", "一週間、感謝の言葉を唱えてみた", "V5"),
    ("bunki-graded-n3-thanks-before-help", "N3", "「助けて」より先に「ありがとう」？", "V5"),
    ("bunki-essay-n2-zoka-as-one", "N2", "三柱の神を一つの働きとして読む", "V1"),
    ("bunki-essay-n2-nakaima-time", "N2", "過去・現在・未来と「中今」", "V1"),
    ("bunki-essay-n2-creator-god", "N2", "「創造神」という言葉はどこまで正しいか", "V2"),
    ("bunki-essay-n2-silent-amenominakanushi", "N2", "天之御中主神――語られない神をどう読むか", "V2"),
    ("bunki-essay-n2-kojiki-myth-history", "N2", "『古事記』は神話か、歴史か", "V3"),
    ("bunki-essay-n2-myth-to-book", "N2", "語りから書物へ――神話を編む", "V3"),
    ("bunki-essay-n2-feel-jingu-musubi", "N2", "映像が伝える「むすひ」", "V4"),
    ("bunki-essay-n2-prayer-on-screen", "N2", "映像の中で祈りはどう見えるか", "V4"),
    ("bunki-essay-n2-thanks-first", "N2", "「ありがとうございます」を先に言う心理", "V5"),
    ("bunki-essay-n2-testimony-literacy", "N2", "体験談をどう受け取るか", "V5"),
    ("bunki-essay-n1-cosmic-analogy", "N1", "造化三神を宇宙論として読む誘惑", "V1"),
    ("bunki-essay-n1-nakaima-time-theory", "N1", "「中今」は時間論になり得るか", "V1"),
    ("bunki-essay-n1-first-versus-supreme", "N1", "原初神を「最高神」と呼ぶときの問題", "V2"),
    ("bunki-essay-n1-silent-god-theology", "N1", "沈黙する神と不在の神学", "V2"),
    ("bunki-essay-n1-kojiki-power", "N1", "『古事記』編纂と権力の物語", "V3"),
    ("bunki-essay-n1-beyond-fact-fiction", "N1", "神話を「事実か虚構か」で裁かないために", "V3"),
    ("bunki-essay-n1-sacred-media", "N1", "「感じる」映像は神聖さをどう構成するか", "V4"),
    ("bunki-essay-n1-ise-time", "N1", "産霊・自然・反復――伊勢の時間", "V4"),
    ("bunki-essay-n1-miracle-testimony", "N1", "奇跡の体験談と認識の責任", "V5"),
    ("bunki-essay-n1-prayer-reality", "N1", "祈りの言葉は誰の現実を変えるのか", "V5"),
]

PRIMARY_VIDEO_IDS = {
    "V1": "cGIOm0txsgo",
    "V2": "5vEtGV5y5ZE",
    "V3": "jidCDQCJGT0",
    "V4": "IprA5aUY9oI",
    "V5": "tX_UZOfEYA",
}
TARGETS = {"N3": (500, 650), "N2": (650, 800), "N1": (800, 1000)}
REQUIRED_EDITORIAL = {
    "articleId",
    "primaryVideo",
    "inspirationSources",
    "factSources",
    "inspirationAngle",
    "claimsRequiringReview",
    "fictionOrCompositeDisclosure",
    "originalityReview",
    "humanReviewStatus",
}
FICTION_IDS = {
    "bunki-graded-n3-nakaima-diary",
    "bunki-graded-n3-hidden-deity",
    "bunki-graded-n3-gratitude-week",
    "bunki-graded-n3-thanks-before-help",
    "bunki-essay-n1-prayer-reality",
}


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text("utf-8").splitlines() if line.strip()]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compact_json(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()


def tree_receipt(root: Path) -> dict:
    files = sorted(path for path in root.rglob("*") if path.is_file())
    rows = b"".join(
        path.relative_to(root).as_posix().encode()
        + b"\0"
        + sha256(path.read_bytes()).encode()
        + b"\0"
        + str(path.stat().st_size).encode()
        + b"\n"
        for path in files
    )
    return {
        "fileCount": len(files),
        "sha256": sha256(rows),
        "bytes": sum(path.stat().st_size for path in files),
    }


def normalized_text(text: str) -> str:
    return re.sub(r"[\s\u3000、。！？「」『』（）・――…：；,.!?\-]", "", text)


def longest_shared_run(records: list[tuple[str, str]], ceiling: int = 89, floor: int = 20):
    """Find the longest shared exact run with rolling substring sets.

    A 90-character collision is the enforcement threshold. Searching downward
    from 89 gives a useful receipt without the quadratic dynamic-programming
    cost of comparing all 435 article pairs character by character.
    """
    for size in range(ceiling, floor - 1, -1):
        seen: dict[str, str] = {}
        for article_id, text in records:
            for start in range(max(0, len(text) - size + 1)):
                fragment = text[start : start + size]
                owner = seen.get(fragment)
                if owner is not None and owner != article_id:
                    return size, owner, article_id
                seen[fragment] = article_id
    return 0, "", ""


def standalone_bundle(path: Path) -> dict:
    html = path.read_text("utf-8")
    match = re.search(
        r'<script type="application/json" id="corridor-bundle">([\s\S]*?)</script>',
        html,
    )
    if not match:
        raise ValueError("corridor bundle script not found")
    return json.loads(match.group(1))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rebuild", action="store_true")
    parser.add_argument("--publication", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    checks: list[dict] = []
    failures: list[str] = []

    def check(name: str, condition: bool, detail="") -> None:
        passed = bool(condition)
        checks.append({"name": name, "pass": passed, "detail": str(detail)})
        if not passed:
            failures.append(name)
        print(f"{' ok ' if passed else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))

    source = read_jsonl(SOURCE)
    editorial = json.loads(EDITORIAL.read_text("utf-8"))
    index = json.loads((ARTICLES / "index.json").read_text("utf-8"))
    baseline = json.loads(BASELINE.read_text("utf-8"))
    by_editorial = {record["articleId"]: record for record in editorial}
    by_row = {record["id"]: record for record in index["articles"]}
    expected_ids = [row[0] for row in MATRIX]
    expected_shape = [
        {"id": article_id, "level": level, "title": title, "primary": primary}
        for article_id, level, title, primary in MATRIX
    ]

    check("exactly 30 authored source records", len(source) == 30, len(source))
    check("source records use exactly the native five-field shape", all(set(r) == {"id", "level", "lane", "title", "text"} for r in source))
    actual_shape = [
        {
            "id": row["id"],
            "level": row["level"],
            "title": row["title"],
            "primary": by_editorial.get(row["id"], {}).get("primaryVideo"),
        }
        for row in source
    ]
    check("IDs, titles, authored levels, order, and primary mappings match the matrix", actual_shape == expected_shape)
    check("10 N3, 10 N2, and 10 N1", Counter(r["level"] for r in source) == {"N3": 10, "N2": 10, "N1": 10})
    check("native lane convention", all(r["lane"] == ("graded" if r["level"] == "N3" else "essay") for r in source))
    check("editorial sidecar has exactly the same 30 IDs in order", [r.get("articleId") for r in editorial] == expected_ids)
    check("every sidecar record carries the required editorial fields", all(REQUIRED_EDITORIAL <= set(r) for r in editorial))
    check("six primary articles per video", Counter(r["primaryVideo"] for r in editorial) == {f"V{i}": 6 for i in range(1, 6)})
    youtube_fact_boundary = True
    for record in editorial:
        for fact in record["factSources"]:
            if "youtu" not in str(fact.get("url", "")).lower():
                continue
            # V4 is the primary object of film criticism, so its official
            # upload may evidence only observable image/sound/editing choices.
            # It must never serve as ancient, historical, or scientific proof.
            youtube_fact_boundary &= bool(
                fact.get("url", "").endswith("IprA5aUY9oI")
                and "observation-only-not-ancient-authority" in fact.get("role", "")
            )
    check("YouTube in factSources is limited to explicit V4 film-object observation, never ancient/scientific authority", youtube_fact_boundary)
    check("every primary video is explicitly present in inspirationSources", all(any(s.get("videoId") == PRIMARY_VIDEO_IDS[r["primaryVideo"]] for s in r["inspirationSources"]) for r in editorial))
    check("fictional diaries, dialogues, and composite voices are disclosed", all(by_editorial[x].get("fictionOrCompositeDisclosure") not in (None, "", "none") for x in FICTION_IDS))

    v5_ok = True
    for record in editorial:
        if record["primaryVideo"] != "V5":
            continue
        source_record = next((s for s in record["inspirationSources"] if s.get("videoId") == "tX_UZOfEYA"), None)
        v5_ok &= bool(
            source_record
            and source_record.get("role") == "recovered-devotional-inspiration"
            and source_record.get("availability") == "unavailable-2026-08-12"
            and source_record.get("contentVerified") is False
            and source_record.get("playable") is False
        )
    check("all six V5 records preserve the unavailable/unverified boundary", v5_ok)

    tagger = get_tagger()
    jlpt_maps = ba.load_jlpt_lexicon()
    from corpus.grading.jread import jread_signal

    article_report = []
    generated_ok = True
    for matrix_row, authored in zip(MATRIX, source, strict=True):
        article_id, level, title, primary = matrix_row
        sidecar = by_editorial[article_id]
        row = by_row.get(article_id)
        if not row:
            generated_ok = False
            continue
        body_path = ARTICLES / row["file"]
        if not body_path.exists():
            generated_ok = False
            continue
        body = json.loads(body_path.read_text("utf-8"))
        tokens, paras = ba.tokenise_paragraphs(authored["text"], tagger)
        jread = jread_signal(authored["text"], tagger=tagger)
        jlpt = ba.jlpt_signal(tokens, *jlpt_maps)
        count = sum(not is_punct(token) for token in tagger(authored["text"]))
        low, high = TARGETS[level]
        expected_label = "段階別読み物 · Bunki" if level == "N3" else "随筆 · Bunki"
        expected_file = ba.slugify(article_id) + ".json"
        seeds: list[str] = []
        for token in tokens:
            if token["c"] and len(token["s"]) > 1 and token["b"] not in seeds:
                seeds.append(token["b"])
            if len(seeds) >= 6:
                break
        expected_row = {
            key: value
            for key, value in body.items()
            if key not in {"text", "tokens", "paras", "grading", "truncated"}
        }
        expected_row.update(
            {
                "chars": len(authored["text"]),
                "snippet": authored["text"].replace("\n", " ")[:64],
                "grading": body["grading"],
                "seeds": seeds,
                "truncated": False,
            }
        )
        record_ok = all(
            [
                row == expected_row,
                row.get("file") == expected_file,
                "text" not in row and "tokens" not in row and "paras" not in row,
                body.get("id") == article_id,
                body.get("title") == title,
                body.get("text") == authored["text"],
                body.get("tokens") == tokens,
                body.get("paras") == paras,
                body.get("grading", {}).get("signals", {}).get("jreadability") == jread,
                body.get("grading", {}).get("signals", {}).get("jlpt_lexicon") == jlpt,
                body.get("grading", {}).get("unavailable", {}).get("error")
                == "UnavailableByBuildPolicy",
                body.get("sourceLabel") == expected_label,
                body.get("source") == SOURCE_RECORD["name"],
                body.get("pool") == "original",
                body.get("licence") == "Bunki original",
                body.get("attribution") == "Bunki original text",
                body.get("url") == "",
                body.get("authorLevel") == level,
                body.get("lane") == authored["lane"],
                body.get("date") == "",
                body.get("truncated") is False,
                "packVersion" not in body,
                500 <= count <= 1000,
                low <= count <= high,
                sidecar.get("unidicLexicalTokenCount") == count,
            ]
        )
        generated_ok &= record_ok
        article_report.append(
            {
                "id": article_id,
                "level": level,
                "title": title,
                "primaryVideo": primary,
                "unidicLexicalTokens": count,
                "paragraphs": len(paras) + 1,
                "generatedFile": row["file"],
                "pass": record_ok,
            }
        )
    check("all 30 meet their UniDic target ranges and agree source → index → generated tokens/ruby/paragraphs/grading", generated_ok)

    source_registry_ok = all(
        SOURCE_RECORD in registry.get("original", [])
        for registry in (index.get("sources", {}), ba.SOURCES)
    )
    check(
        "the native catalog is registered in both the committed index and current article builder",
        source_registry_ok,
    )

    source_by_name = {
        record["name"]: (pool, record)
        for pool, records in index.get("sources", {}).items()
        for record in records
    }
    rights_ok = True
    for row in index["articles"]:
        source_entry = source_by_name.get(row.get("source"))
        rights_ok &= all(str(row.get(key, "")).strip() for key in ("pool", "licence", "attribution", "source", "file"))
        rights_ok &= "url" in row and source_entry is not None
        if source_entry is None:
            continue
        pool, registry_row = source_entry
        rights_ok &= pool == row.get("pool")
        if registry_row.get("url", "").strip():
            rights_ok &= bool(row.get("url", "").strip())
        body = json.loads((ARTICLES / row["file"]).read_text("utf-8"))
        rights_ok &= all(
            body.get(key) == row.get(key)
            for key in ("pool", "licence", "attribution", "url", "source")
        )
    check("all 70 shelf rows satisfy the fail-closed rights contract", rights_ok)

    check("shelf index has exactly 70 lean rows", len(index["articles"]) == 70 and all("text" not in row and "tokens" not in row for row in index["articles"]), len(index["articles"]))
    first40_ok = len(baseline["articles"]) == 40
    first40_bodies: list[dict] = []
    for receipt, row in zip(baseline["articles"], index["articles"][:40], strict=True):
        body_bytes = (ARTICLES / row["file"]).read_bytes()
        body = json.loads(body_bytes)
        first40_bodies.append(body)
        first40_ok &= all(
            [
                receipt["id"] == row["id"],
                receipt["file"] == row["file"],
                receipt["indexRowSha256"] == sha256(compact_json(row)),
                receipt["articleFileSha256"] == sha256(body_bytes),
                receipt["sourceTextSha256"] == sha256(body["text"].encode()),
            ]
        )
    check(
        "first 40 IDs, order, index rows, source texts, and generated records match ca07a8e",
        first40_ok and baseline.get("baselineHead") == BASE_COMMIT,
    )

    # The old readers also reach shared word, semantic, and idiom layers.  A
    # shelf append must not overwrite an existing lookup or evict an idiom
    # merely because the capped graph was re-ranked with more article text.
    # New word records are allowed only after the exact ca07a8e dictionary
    # prefix, and every base occurring in the first 40 must still project to
    # the same record (including an intentional absence).
    runtime_receipt = baseline["runtimeLayers"]
    words = json.loads(WORDS.read_text("utf-8"))["words"]
    base_count = runtime_receipt["wordsBaseCount"]
    words_prefix = dict(list(words.items())[:base_count])
    first40_bases = sorted(
        {
            token["b"]
            for body in first40_bodies
            for token in body["tokens"]
            if token["c"]
        }
    )
    lookup_projection = {base: words.get(base) for base in first40_bases}
    runtime_layers_ok = all(
        [
            len(words) >= base_count,
            sha256(compact_json(words_prefix)) == runtime_receipt["wordsRecordsSha256"],
            len(first40_bases) == runtime_receipt["first40ContentBaseCount"],
            sha256(compact_json(lookup_projection))
            == runtime_receipt["first40LookupProjectionSha256"],
            sha256(SEM.read_bytes()) == runtime_receipt["semFileSha256"],
            sha256(IDIOMS.read_bytes()) == runtime_receipt["idiomsFileSha256"],
        ]
    )
    check(
        "the 7,910-word prefix and first-40 lookup behavior preserve ca07a8e",
        runtime_layers_ok,
        f"{len(first40_bases)} lookup bases; {base_count} compatibility word records",
    )

    protected = baseline["protectedTrunkAssets"]
    protected_ok = all(
        [
            tree_receipt(ARCHIVE) == protected["archive"],
            sha256(ARCHIVE_INDEX.read_bytes()) == protected["archiveIndexSha256"],
            tree_receipt(EXAMPLES) == protected["examples"],
            all(
                sha256((REPO / path).read_bytes()) == digest
                for path, digest in protected["appFiles"].items()
            ),
        ]
    )
    check(
        "archive, examples bank, forbidden app files, drift data, and Pages workflow are ca07a8e-identical",
        protected_ok,
        f"{protected['archive']['fileCount']} archive bodies; {protected['examples']['fileCount']} example-bank files",
    )

    js = (CORRIDOR / "corridor.js").read_text("utf-8")
    check(
        "no forbidden app-side English-title wiring was added",
        not any(re.search(rf"['\"]{re.escape(article_id)}['\"]\s*:", js) for article_id in expected_ids),
        "Japanese titles render from index data; TITLES_EN wiring is left to the trunk keeper",
    )
    forbidden_runtime = [
        "bunki-pack-v1",
        "bunki-original-reading-pack-v1",
        "packVersion",
        "Practice draft",
        ".draft-tag",
        ".editorial-",
    ]
    runtime_text = "\n".join(path.read_text("utf-8") for path in RUNTIME_FILES)
    check("no reading-pack runtime identity, component, badge, or CSS remains", not any(term in runtime_text for term in forbidden_runtime))
    competing = [
        REPO / "deliverables/Bunki-Reading-Pack-iPhone.html",
        REPO / "deliverables/Bunki-Reading-Pack-iPhone.zip",
        REPO / "deliverables/build_bunki_reading_preview.mjs",
    ]
    check("no competing reader deliverable exists", not any(path.exists() for path in competing))

    manifest = json.loads(MANIFEST.read_text("utf-8"))
    check("manifest reports 70 passages and article files", manifest.get("counts", {}).get("passages") == 70 and manifest.get("counts", {}).get("articleFiles") == 70)
    try:
        bundle = standalone_bundle(STANDALONE)
        standalone_index = bundle.get("articles/index", {}).get("articles", [])
        standalone_ok = len(standalone_index) == 70 and [row["id"] for row in standalone_index] == [row["id"] for row in index["articles"]]
        standalone_ok &= all(f"articles/{by_row[article_id]['file'][:-5]}" in bundle for article_id in expected_ids)
        standalone_ok &= "articles/archive-index" not in bundle
        standalone_ok &= not any(key.startswith("proprietary_safe/examples") for key in bundle)
    except (OSError, ValueError, json.JSONDecodeError):
        standalone_ok = False
    check(
        "current standalone carries the same 70-entry shelf while excluding archive/examples data",
        standalone_ok,
    )

    normalized = [(row["id"], normalized_text(row["text"])) for row in source]
    # First enforce the >=90 character near-copy threshold in one pass, then
    # search below it only to make the evidence report informative.
    collision = longest_shared_run(normalized, ceiling=90, floor=90)
    worst = collision if collision[0] else longest_shared_run(normalized)
    check("cross-article near-copy tripwire", worst[0] < 90, f"longest shared normalized run: {worst[0]} chars ({worst[1]} / {worst[2]})")

    if args.rebuild:
        with tempfile.TemporaryDirectory(prefix="bunki-native-readings-") as tmp:
            env = dict(**__import__("os").environ)
            env["CORPUS_DATA_DIR"] = str(Path(tmp) / "empty-corpus-data")
            rebuilt_standalone = Path(tmp) / "corridor-standalone.html"
            standalone_process = subprocess.run(
                [
                    "node",
                    str(HERE / "build-standalone.mjs"),
                    str(rebuilt_standalone),
                ],
                cwd=REPO,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            # Record the current data-pipeline boundary without mutating it:
            # canonical build_articles knows 26 rows, and its established WP9b
            # wrapper knows 40. Per the work order, this is reported as a gap
            # rather than solved by porting the old builder consolidation.
            canonical_out = Path(tmp) / "canonical"
            canonical_process = subprocess.run(
                [
                    sys.executable,
                    str(HERE / "build_articles.py"),
                    "--out",
                    str(canonical_out),
                ],
                cwd=REPO,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            wp9b_out = Path(tmp) / "wp9b"
            wp9b_process = subprocess.run(
                [
                    sys.executable,
                    str(REPO / "docs/build-evidence/kairo-feel-lock/wp9b/build_wp9b_articles.py"),
                    "--out",
                    str(wp9b_out),
                ],
                cwd=REPO,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            canonical_count = 0
            wp9b_count = 0
            if (canonical_out.joinpath("index.json").exists()):
                canonical_count = len(json.loads(canonical_out.joinpath("index.json").read_text())["articles"])
            if (wp9b_out.joinpath("index.json").exists()):
                wp9b_count = len(json.loads(wp9b_out.joinpath("index.json").read_text())["articles"])
            rebuild_ok = all(
                [
                    standalone_process.returncode == 0,
                    rebuilt_standalone.exists(),
                    rebuilt_standalone.read_bytes() == STANDALONE.read_bytes(),
                    canonical_process.returncode == 0,
                    wp9b_process.returncode == 0,
                    canonical_count == 26,
                    wp9b_count == 40,
                ]
            )
            check(
                "current standalone rebuild is byte-identical and the unpatched 26/40 article-builder gap is measured",
                rebuild_ok,
                f"standalone exit {standalone_process.returncode}; canonical={canonical_count}; wp9b={wp9b_count}",
            )

    review_counts = Counter(record.get("humanReviewStatus") for record in editorial)
    publication_ready = review_counts == {"approved": 30}
    if args.publication:
        check("human Japanese editorial publication gate", publication_ready, dict(review_counts))
    else:
        checks.append(
            {
                "name": "human Japanese editorial publication gate",
                "pass": None,
                "detail": f"blocked until approved: {dict(review_counts)}",
            }
        )
        print(f"INFO  human Japanese editorial publication gate — blocked: {dict(review_counts)}")

    report = {
        "schemaVersion": 1,
        "kind": "native-bunki-readings-verification",
        "baselineCommit": BASE_COMMIT,
        "builderGap": {
            "canonicalRows": 26,
            "wp9bRows": 40,
            "committedShelfRows": 70,
            "status": "reported-not-patched-per-work-order",
        },
        "articles": article_report,
        "primaryVideoCounts": dict(sorted(Counter(r["primaryVideo"] for r in editorial).items())),
        "humanReviewStatus": dict(review_counts),
        "publicationReady": publication_ready,
        "checks": checks,
        "failures": failures,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")

    print(f"\n{sum(item['pass'] is True for item in checks)}/{sum(item['pass'] is not None for item in checks)} enforceable checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

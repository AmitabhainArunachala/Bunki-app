#!/usr/bin/env bash
# Exact packaged assertions extracted from the previous CI build job.
set -euo pipefail
port_file=$(mktemp "$RUNNER_TEMP/corridor-port.XXXXXX")
python3 - "$KAIRO_SITE_DIR" "$port_file" >"$RUNNER_TEMP/corridor-smoke.log" 2>&1 <<'PYEOF' &
import functools, http.server, pathlib, sys
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=sys.argv[1])
with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
    pathlib.Path(sys.argv[2]).write_text(str(server.server_port))
    server.serve_forever()
PYEOF
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; rm -f "$port_file"' EXIT
for _ in {1..50}; do
  [ -s "$port_file" ] && break
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat "$RUNNER_TEMP/corridor-smoke.log" >&2
    exit 1
  fi
  sleep 0.1
done
[ -s "$port_file" ] || { echo 'Smoke server did not become ready' >&2; exit 1; }
port=$(cat "$port_file")

# curl, not node fetch: unconsumed keep-alive bodies trip an undici
# internal assertion at process exit on some Node lines (seen live:
# "assert(!this.paused)" AFTER every path had already printed 200)
for path in '' 'apple-touch-icon.png' 'corridor.css' 'fonts.css' 'corridor.js' \
            'corridor-ink.js' 'dictionary-worker.js' 'reading-controller.mjs' 'feed-controller.mjs' 'assessment-controller.mjs' 'record-controller.mjs' 'record-host.mjs' 'record-app.mjs' 'record-binding.mjs' 'publisher-controller.mjs' 'modules/reading-core.mjs' 'modules/feed-core.mjs' 'modules/assessment-core.mjs' 'modules/record-core.mjs' \
            'manifest.webmanifest' 'sw.js' 'icon-192.png' 'icon-512.png' 'build-identity.json' \
            'drift-layer.css' 'drift-layer.js' 'vendor/ts-fsrs.mjs' \
            'data/manifest.json' 'data/articles/index.json' \
            'data/mock/index.json' 'data/mock/sets/n5-01.json' \
            'data/articles/archive-index.json' \
            'data/share_alike/dict-v2/index.json' \
            'data/share_alike/animcjk/index.json' \
            'data/share_alike/animcjk/00.json' \
            'data/share_alike/animcjk/equivalence.json' \
            'data/share_alike/dict-v2/00.json' \
            'data/share_alike/dict-v2/0f.json' \
            'decks/context-dense/mount.js' \
            'decks/context-dense/engine.js' \
            'decks/context-dense/deck.json' \
            'decks/context-dense/context-deck.css' \
            'decks/context-dense/standalone.html' \
            'decks/player/engine.js' \
            'decks/player/mount.js' \
            'decks/player/player.css' \
            'decks/personal/engine.mjs' \
            'decks/personal/mount.mjs' \
            'decks/personal/schema.mjs' \
            'decks/personal/host-bridge.mjs' \
            'decks/personal/enrichment.mjs' \
            'decks/personal/store.mjs' \
            'decks/personal/personal.css' \
            'decks/kotoba-mine/deck.json' \
            'decks/kotoba-mcd/deck.json'; do
  code=""
  for _ in 1 2 3 4 5; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/$path" || true)
    [ "$code" = "200" ] && break
    sleep 0.2
  done
  if [ "$code" != "200" ]; then
    echo "FAIL $code /$path" >&2
    exit 1
  fi
  echo "200 /$path"
done

# the deep dictionary the site ships must be the pinned, sharded one
python3 - "$KAIRO_SITE_DIR" <<'PYEOF'
import json, sys
site = sys.argv[1]
index = json.load(open(f"{site}/data/share_alike/dict-v2/index.json"))
assert index["schemaVersion"] == 3, "dict-v2 schema (sense tags, DICT_TAGS_CONTRACT_2026-08-12)"
assert index["shardCount"] == 16, "dict-v2 shard count"
assert index["sharding"]["id"] == "fnv1a32-ascii-seq-mask15", "dict-v2 shard algorithm"
assert index["source"]["pin"] == "3.6.2+20260803141815", "dict-v2 source pin"
counts = index["sharding"]["entryCounts"]
assert len(counts) == 16 and all(c > 0 for c in counts), "dict-v2 entry counts"
assert len(index["entries"]) == sum(counts), "dict-v2 index entry total"
for shard_id in ("00", "07", "0f"):
    shard = json.load(open(f"{site}/data/share_alike/dict-v2/{shard_id}.json"))
    assert shard["sourcePin"] == index["source"]["pin"], f"shard {shard_id} pin"
    assert len(shard["entries"]) == counts[int(shard_id, 16)], f"shard {shard_id} count"
print(f"dict-v2 verified: {len(index['entries'])} entries across 16 shards")
PYEOF

# rights are fail-closed: no shelf item ships without complete,
# registry-consistent licence metadata (round-3 review, 2026-08-11 —
# this very check would have caught the live CC BY 4.0 mislabel)
python3 - "$KAIRO_SITE_DIR" <<'PYEOF'
import json, sys
site = sys.argv[1]
base = f"{site}/data/articles"
idx = json.load(open(f"{base}/index.json"))
source_by_name = {}
for pool, records in idx["sources"].items():
    for s in records:
        for k in ("name", "licence", "attribution"):
            assert s.get(k, "").strip(), f"source record missing {k}: {s}"
        assert "url" in s, f"source record {s['name']!r} missing url field"
        source_by_name[s["name"]] = (pool, s)
for a in idx["articles"]:
    aid = a.get("id", "?")
    for k in ("pool", "licence", "attribution", "source", "file"):
        assert a.get(k, "").strip(), f"{aid}: missing {k}"
    assert "url" in a, f"{aid}: missing url field"
    pool, src = source_by_name.get(a["source"], (None, None))
    assert src is not None, f"{aid}: source {a['source']!r} not in the sources registry"
    assert pool == a["pool"], f"{aid}: pool {a['pool']!r} != registry pool {pool!r}"
    if src["url"].strip():
        assert a["url"].strip(), f"{aid}: source has a home URL but the item has no per-item url"
    if a["source"] == "ja.wikinews":
        assert a["licence"] == "CC BY 2.5", f"{aid}: ja.wikinews content is CC BY 2.5, labeled {a['licence']!r}"
        assert "CC BY 2.5" in a["attribution"], f"{aid}: attribution must state CC BY 2.5"
    body = json.load(open(f"{base}/{a['file']}"))
    for k in ("pool", "licence", "attribution", "url", "source"):
        assert body.get(k) == a.get(k), f"{aid}: body {k!r} disagrees with the index"
print(f"rights verified: {len(idx['articles'])} shelf items — licensed, attributed, pooled, linked where a source home exists")

# the newspaper archive answers to the same law: every item fully
# labeled, registry-consistent, body agreeing with its index row
arc = json.load(open(f"{base}/archive-index.json"))
seen_ids = {a["id"] for a in idx["articles"]}
for a in arc["articles"]:
    aid = a.get("id", "?")
    assert aid not in seen_ids, f"{aid}: archive duplicates a shelf item"
    for k in ("pool", "licence", "attribution", "source", "file", "url", "date"):
        assert a.get(k, "").strip(), f"{aid}: archive row missing {k}"
    pool, src = source_by_name.get(a["source"], (None, None))
    assert src is not None and pool == a["pool"], f"{aid}: archive source/pool not registry-consistent"
    assert a["licence"] == "CC BY 2.5" and "CC BY 2.5" in a["attribution"], f"{aid}: archive licence must be CC BY 2.5"
    assert a["file"].startswith("archive/"), f"{aid}: archive body must live under archive/"
    body = json.load(open(f"{base}/{a['file']}"))
    for k in ("pool", "licence", "attribution", "url", "source"):
        assert body.get(k) == a.get(k), f"{aid}: archive body {k!r} disagrees with its row"
    assert body.get("tokens"), f"{aid}: archive body carries no tokens"
print(f"rights verified: {len(arc['articles'])} archive items — same law, same gate")
PYEOF

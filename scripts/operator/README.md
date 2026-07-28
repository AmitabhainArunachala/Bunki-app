# Operator tooling

Three scripts that exist because a container restart destroyed them once. They
are not part of the build or the check set — nothing in `npm run *` calls them —
but each encodes something that took a wrong turn to learn, and each is worth
more in the repository than in a scratch directory.

## `bundle-artifact.mjs`

Folds `apps/app/dist` into one self-contained HTML file for publishing the app as
a link.

```
(cd apps/app && npx expo export --platform web)
node scripts/operator/bundle-artifact.mjs /tmp/bunki.html
```

The three non-obvious parts are documented in the file: the router reads the
hosting URL unless a shim rewrites it, the bundle cannot live in an inline
`<script>` body because it contains the literal `</script>`, and base64 alone
inflates the file by a third where gzip-then-base64 shrinks it (10.8 MB → 4.0 MB).

## `shoot.mjs`

Serves the export the way the e2e harness does — static file, dynamic-route
fallback, SPA index fallback — and photographs routes in both schemes at phone
width.

```
(cd apps/app && npx expo export --platform web)
node scripts/operator/shoot.mjs /tmp/shots / /map /guide /read
SHOT_H=9000 node scripts/operator/shoot.mjs /tmp/shots /style-guide   # tall page
SHOT_SCHEMES=dark node scripts/operator/shoot.mjs /tmp/shots /map     # one scheme
```

`file://` does not work — the export uses absolute asset paths — which is why
this serves over HTTP rather than opening the file. `fullPage` also does not
capture a react-native-web `ScrollView`'s overflow, so long pages need `SHOT_H`
rather than a full-page flag.

## `resolve-capsule.py`

Resolves an append-only `CAPSULE.md` merge conflict by keeping **both** sides in
order.

```
python3 scripts/operator/resolve-capsule.py docs/build-evidence/CAPSULE.md
```

A conflict in that file is never a disagreement — it is two lanes having appended
at the same offset — so the resolution is always "ours, then theirs". It exits
non-zero if any marker survives, so a caller cannot stage a half-resolved file.

The marker check is **line-anchored**. A substring test for `<<<<<<<`
false-positives on prose that quotes a conflict marker, and that is precisely how
markers reached an integration branch on this project once already.

---

## Two habits worth keeping, learned the same way

**Run a parser after any hand edit to a data-literal module.** Resolving
`navigation.ts` by keeping both sides silently truncated the preceding entry's
closing brace — twice — and the file stopped parsing. Both times it was caught by
`prettier`, not by reading the diff.

**Measure layout, do not eyeball it.** Seven lanes shipped 309px of horizontal
overflow on every route at iPhone width because nothing in the suite compared
`scrollWidth` to `clientWidth`. A screenshot of an overflowing page looks like a
screenshot of a page.

#!/bin/zsh
# Fold the live depth design into the app's own code: one file, prototypes/corridor/depth.css.
#
#   ./fold-depth.sh <worktree>        writes <worktree>/prototypes/corridor/depth.css from the two design files
#
# The design files stay the source: design/depth/depth.css (the surface system, the depth engineer's) and
# design/depth/lead.css (the lead's trials). Edit those, never the folded file; run this again to re-fold.
# This script only writes the one stylesheet. Linking it in index.html after tighten.css, setting
# data-live-depth="1" on <html>, and any list of assets the build or the service worker keeps, are done
# once in the repository by the integrator (the same places the commit that added tighten.css touched).
set -euo pipefail
DIR="${0:A:h}"
WT="${1:?usage: fold-depth.sh <worktree>}"
OUT="$WT/prototypes/corridor/depth.css"
[[ -d "$WT/prototypes/corridor" ]] || { print -u2 -- "no prototypes/corridor in $WT"; exit 1 }
for f in depth/depth.css depth/lead.css; do
  [[ -s "$DIR/$f" ]] || { print -u2 -- "missing $DIR/$f"; exit 1 }
done
ver="$(cat "$DIR/depth/version.txt" 2>/dev/null || print unknown)"
{
  print -r -- "/* depth.css · the app's surfaces: ground, sheet, slip, well, and the night windows its subjects stand in."
  print -r -- "   FOLDED FILE. Do not edit here. Sources: ~/.dharma/bunki/PROGRAM/design/depth/depth.css and lead.css"
  print -r -- "   (design version $ver, folded $(date '+%Y-%m-%d %H:%M JST')). Re-fold: ~/.dharma/bunki/PROGRAM/design/fold-depth.sh <worktree>."
  print -r -- "   Every rule is scoped under html[data-live-depth='1']; index.html sets that attribute. */"
  print
  cat "$DIR/depth/depth.css"
  print
  # blocks between "@no-fold-start" and "@no-fold-end" are live trials only: they hide controls that tests still use
  awk '/@no-fold-start/{skip=1} !skip{print} /@no-fold-end/{skip=0}' "$DIR/depth/lead.css"
} > "$OUT"
rules="$(grep -c "data-live-depth='1'" "$OUT" || true)"
if grep -q -E "chrome-dojo|#tray" "$OUT"; then print -u2 -- "[fold-depth] STOP: the folded file still names #chrome-dojo or #tray"; exit 1; fi
print -r -- "[fold-depth] wrote $OUT: $(wc -l < "$OUT" | tr -d ' ') lines, $rules scoped selectors, design version $ver"

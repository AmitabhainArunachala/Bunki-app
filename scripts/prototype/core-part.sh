#!/usr/bin/env bash
# Report one part of the `next / core` job that ran beside the unit tests.
#
#   core-part.sh <part> <title> <first-error pattern>
#
# The part wrote $CORE_OUT/<part>.log while it ran and $CORE_OUT/<part>.exit when it ended. This
# waits for the end (at most ten minutes), prints the log, and on a failure names the first line
# that matches the pattern as the error, so the reason is readable from the check itself.
set -uo pipefail
part="$1"
title="$2"
pattern="$3"
log="$CORE_OUT/$part.log"
for _ in $(seq 1 600); do
  [ -f "$CORE_OUT/$part.exit" ] && break
  sleep 1
done
[ -f "$log" ] && cat "$log"
code="$(cat "$CORE_OUT/$part.exit" 2>/dev/null || echo 'did not finish in ten minutes')"
if [ "$code" != "0" ]; then
  first="$(grep -m1 -E "$pattern" "$log" 2>/dev/null || tail -n 1 "$log" 2>/dev/null || true)"
  echo "::error title=$title failed (exit $code)::${first:-no output}"
  exit 1
fi
echo "$title: passed"

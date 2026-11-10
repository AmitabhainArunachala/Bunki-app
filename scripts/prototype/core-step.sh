#!/usr/bin/env bash
# One part of the `next / core` job, with its first error line named when it fails.
#
#   core-step.sh start  <name> <command...>             run the command beside the next step
#   core-step.sh report <name> <title> <error pattern>  wait for a started part and report it
#   core-step.sh run    <name> <title> <error pattern> <command...>   run and report in one go
#
# Every part keeps its output in $CORE_OUT/<name>.log. On a failure the first line that matches the
# pattern (colour codes removed; else the last line) becomes the step's error, so the reason is
# readable from the check itself without opening the log.
set -uo pipefail
mode="$1"
name="$2"
shift 2
log="$CORE_OUT/$name.log"
status="$CORE_OUT/$name.exit"

report() {
  local title="$1" pattern="$2" code="$3"
  if [ "$code" != "0" ]; then
    local first
    first="$(sed -E $'s/\x1b\\[[0-9;]*m//g' "$log" 2>/dev/null | grep -m1 -E "$pattern" || tail -n 1 "$log" 2>/dev/null || true)"
    echo "::error title=$title failed (exit $code)::${first:-no output}"
    exit 1
  fi
  echo "$title: passed"
}

case "$mode" in
  start)
    rm -f "$status"
    # nothing of the step's own output stays open in the background part
    (
      "$@" > "$log" 2>&1
      echo $? > "$status"
    ) > /dev/null 2>&1 < /dev/null &
    ;;
  report)
    for _ in $(seq 1 900); do
      [ -f "$status" ] && break
      sleep 1
    done
    [ -f "$log" ] && cat "$log"
    report "$1" "$2" "$(cat "$status" 2>/dev/null || echo 'did not finish in fifteen minutes')"
    ;;
  run)
    title="$1"
    pattern="$2"
    shift 2
    "$@" 2>&1 | tee "$log"
    report "$title" "$pattern" "${PIPESTATUS[0]}"
    ;;
  *)
    echo "usage: core-step.sh start|report|run ..." >&2
    exit 2
    ;;
esac

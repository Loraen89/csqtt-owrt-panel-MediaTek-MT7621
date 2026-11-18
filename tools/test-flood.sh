#!/bin/sh
set -eu
project=$(CDPATH='' cd -- "${1:-.}" && pwd)
work=$(mktemp -d)
runner=''
cleanup() { [ -z "$runner" ] || { kill "$runner" 2>/dev/null || :; wait "$runner" 2>/dev/null || :; }; rm -rf "$work"; }
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
mkdir -p "$work/bin" "$work/run"
cat > "$work/bin/sleep" <<'EOF'
#!/bin/sh
ticks=$(cat "$CLOCK")
ticks=$((ticks + $1))
printf '%s\n' "$ticks" > "$CLOCK"
if [ -f "$CHANGE_MARKER" ] && [ "$ticks" -ge 130 ]; then
 echo changed > "$CSQTT_RUN_DIR/flood-blocked"
 rm -f "$CHANGE_MARKER"
fi
/bin/sleep 0.01
EOF
cat > "$work/controller" <<'EOF'
#!/bin/sh
echo "$(cat "$CLOCK")" >> "$LAUNCHES"
if [ "$MODE" = log-only ]; then echo 'VK Flood control error 9' >&2; exit 42; fi
if [ "$MODE" = healthy ]; then
 echo '{"connectivity":{"session_established":true}}' > "$CSQTT_RUN_DIR/status.json"
else
 echo '{"error_code":9}' > "$CSQTT_RUN_DIR/flood-blocked"
fi
trap 'exit 0' TERM INT
while :; do /bin/sleep 0.01; done
EOF
chmod +x "$work/bin/sleep" "$work/controller"
export PATH="$work/bin:$PATH" CLOCK="$work/clock" LAUNCHES="$work/launches"
export CHANGE_MARKER="$work/change" CSQTT_RUN_DIR="$work/run" CSQTT_UPTIME_PATH="$work/clock"
export CSQTT_FLOOD_RETRY_DELAY=60 CSQTT_FLOOD_RETRY_LIMIT=2 CSQTT_FLOOD_AUTO_CLEAR=1 MODE=flood
export CSQTT_FLOOD_POLL=30
start() { sh "$project/luci-app-csqtt/package/root/usr/libexec/csqtt/run-core253.sh" "$work/controller" > "$work/log" 2>&1 & runner=$!; }
stop_runner() { kill "$runner" 2>/dev/null || :; wait "$runner" 2>/dev/null || :; runner=''; }
wait_clock() {
 i=0
 while [ "$(cat "$CLOCK")" -lt "$1" ]; do
  kill -0 "$runner" 2>/dev/null || { cat "$work/log"; fail 'supervisor exited'; }
  i=$((i+1)); [ "$i" -lt 800 ] || fail 'clock did not advance'
  /bin/sleep 0.02
 done
}
echo 100 > "$CLOCK"
echo initial > "$work/run/flood-blocked"
touch "$CHANGE_MARKER"
start
wait_clock 750
stop_runner
[ "$(wc -l < "$LAUNCHES" | tr -d ' ')" -eq 2 ] || fail 'retry budget must be bounded'
first=$(sed -n '1p' "$LAUNCHES"); second=$(sed -n '2p' "$LAUNCHES")
[ "$first" -ge 190 ] || fail 'a changed marker must restart the cooldown'
[ $((second-first)) -ge 120 ] || fail 'second cooldown must double'
[ -f "$work/run/flood-blocked" ] || fail 'retry exhaustion must leave the marker intact'
[ "$(cat "$work/run/flood-attempts")" = 2 ] || fail 'retry budget must survive procd respawn'
start; wait_clock 1100; stop_runner
[ "$(wc -l < "$LAUNCHES" | tr -d ' ')" -eq 2 ] || fail 'respawn must not reset the retry limit'
rm "$work/run/flood-attempts"
export CSQTT_FLOOD_AUTO_CLEAR=0
start; wait_clock 1400; stop_runner
[ "$(wc -l < "$LAUNCHES" | tr -d ' ')" -eq 2 ] || fail 'disabled recovery must not start the controller'
[ -f "$work/run/flood-blocked" ] || fail 'disabled recovery must retain the marker'
rm "$work/run/flood-blocked"
export MODE=log-only
code=0
sh "$project/luci-app-csqtt/package/root/usr/libexec/csqtt/run-core253.sh" "$work/controller" > "$work/log" 2>&1 || code=$?
[ "$code" -eq 42 ] || fail 'a log line must not trigger flood recovery'
[ ! -f "$work/run/flood-attempts" ] || fail 'log-only failure must not consume a flood retry'
export MODE=healthy
echo 2 > "$work/run/flood-attempts"
start; wait_clock 2500; stop_runner
[ "$(cat "$work/run/flood-attempts")" = 0 ] || fail '15 minutes of a live session must reset the budget'
[ ! -e "$work/run/flood-retry.json" ] || fail 'stop must clean transient retry state'
echo 'PASS: marker changes, cooldown, exponential backoff, limit persistence, disabled recovery, log isolation, stable reset and stop'

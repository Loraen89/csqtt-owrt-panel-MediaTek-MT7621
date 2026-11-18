#!/bin/sh
# Run the 2.5.3 controller and handle its structured, terminal VK error 9 marker.
# A text match in the journal never triggers a retry.
set -u
umask 077
RUN_DIR=${CSQTT_RUN_DIR:-/var/run/csqtt}
MARKER="$RUN_DIR/flood-blocked"
STATE="$RUN_DIR/flood-retry.json"
ATTEMPTS="$RUN_DIR/flood-attempts"
AUTO=${CSQTT_FLOOD_AUTO_CLEAR:-1}
DELAY=${CSQTT_FLOOD_RETRY_DELAY:-3600}
LIMIT=${CSQTT_FLOOD_RETRY_LIMIT:-3}
POLL=${CSQTT_FLOOD_POLL:-5}
UPTIME=${CSQTT_UPTIME_PATH:-/proc/uptime}
case "$DELAY" in ''|*[!0-9]*) exit 2;; esac
case "$LIMIT" in ''|*[!0-9]*) exit 2;; esac
[ "$DELAY" -ge 60 ] && [ "$DELAY" -le 86400 ] || exit 2
[ "$LIMIT" -ge 1 ] && [ "$LIMIT" -le 10 ] || exit 2
[ "$#" -gt 0 ] || exit 2
mkdir -p "$RUN_DIR" || exit 1
child=''
sleeper=''
stop_child() {
 if [ -n "$child" ]; then
  kill -TERM "$child" 2>/dev/null || true
  n=0
  while kill -0 "$child" 2>/dev/null && [ "$n" -lt 10 ]; do
   sleep 1
   n=$((n + 1))
  done
  kill -KILL "$child" 2>/dev/null || true
  wait "$child" 2>/dev/null || true
  child=''
 fi
}
cleanup() {
 [ -z "$sleeper" ] || kill "$sleeper" 2>/dev/null || true
 stop_child
 rm -f "$STATE" "$STATE.tmp.$$"
}
trap 'exit 0' INT TERM HUP
trap cleanup EXIT
now() { read -r ticks rest < "$UPTIME"; printf '%s\n' "${ticks%%.*}"; }
signature() { sha256sum "$MARKER" 2>/dev/null | awk '{print $1}'; }
attempts=$(cat "$ATTEMPTS" 2>/dev/null || echo 0)
case "$attempts" in ''|*[!0-9]*) attempts=0;; esac
[ "$attempts" -le 10 ] || attempts=10
seen=''
since=0
stable=0
while :; do
 tick=$(now) || exit 1
 if [ -f "$MARKER" ]; then
  stop_child
  stable=0
  current=$(signature)
  if [ -z "$seen" ] || [ "$current" != "$seen" ]; then
   seen=$current
   since=$tick
   echo 'csqtt: VK Flood control; controller paused' >&2
  fi
  delay=$DELAY
  n=0
  while [ "$n" -lt "$attempts" ] && [ "$delay" -lt 86400 ]; do
   delay=$((delay * 2)); n=$((n + 1))
  done
  [ "$delay" -le 86400 ] || delay=86400
  remaining=$((delay - tick + since))
  [ "$remaining" -ge 0 ] || remaining=0
  retry=false
  [ "$AUTO" = 1 ] && [ "$attempts" -lt "$LIMIT" ] && retry=true
  printf '{"blocked":true,"auto_clear":%s,"attempts":%s,"limit":%s,"retry_in":%s}\n' \
   "$retry" "$attempts" "$LIMIT" "$remaining" > "$STATE.tmp.$$"
  mv -f "$STATE.tmp.$$" "$STATE"
  if [ "$retry" = true ] && [ "$remaining" -eq 0 ] && [ -n "$seen" ] && [ "$(signature)" = "$seen" ]; then
   attempts=$((attempts + 1))
   printf '%s\n' "$attempts" > "$ATTEMPTS" || exit 1
   rm -f "$MARKER" || exit 1
   seen=''
   echo "csqtt: VK Flood cooldown elapsed; retry $attempts/$LIMIT" >&2
  fi
 else
  seen=''
  rm -f "$STATE"
  if [ -n "$child" ] && ! kill -0 "$child" 2>/dev/null; then
   wait "$child"; code=$?; child=''
   # A marker may have been committed immediately before child exit.
   [ -f "$MARKER" ] && continue
   exit "$code"
  fi
  if [ -z "$child" ]; then
   rm -f "$RUN_DIR/status.json" "$RUN_DIR/access-check.json" "$RUN_DIR/cpu-sample.json"
   "$@" & child=$!
  fi
  # Reset the bounded retry budget only after 15 minutes of a live session.
  if grep -Eq '"session_established"[[:space:]]*:[[:space:]]*true' "$RUN_DIR/status.json" 2>/dev/null; then
   [ "$stable" -ne 0 ] || stable=$tick
   if [ $((tick - stable)) -ge 900 ]; then
    attempts=0; printf '0\n' > "$ATTEMPTS"
   fi
  else
   stable=0
  fi
 fi
 sleep "$POLL" & sleeper=$!
 wait "$sleeper" || true
 sleeper=''
done

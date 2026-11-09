#!/bin/sh

set -eu

# Every procd respawn must discard the previous process's session evidence.
rm -f /var/run/csqtt/status.json /var/run/csqtt/access-check.json /var/run/csqtt/cpu-sample.json

startup_wait="${CSQTT_STARTUP_WAIT:-180}"
case "$startup_wait" in ''|*[!0-9]*) startup_wait=180;; esac

elapsed=0
while ! /sbin/ip -4 route show default 2>/dev/null | grep -q '^default '; do
	if [ "$elapsed" -ge "$startup_wait" ]; then
		echo "csqtt: no IPv4 default route after ${startup_wait}s; retrying through procd" >&2
		exit 75
	fi
	[ "$elapsed" -eq 0 ] && echo "csqtt: waiting for an IPv4 default route" >&2
	sleep 2
	elapsed=$((elapsed + 2))
done

if [ -n "${CSQTT_VK_JS_TOKEN:-}" ]; then
	payload="$(printf '{\"token\":\"%s\"}' "$CSQTT_VK_JS_TOKEN" | base64 | tr -d '\n')"
	printf 'VK_JS_BOOTSTRAP:%s\n' "$payload" | "$@"
else
	exec "$@"
fi

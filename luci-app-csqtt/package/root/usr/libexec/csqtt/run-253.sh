#!/bin/sh
set -eu

# 2.5.3 uses a supervisor and a Unix TUN socket, not the legacy TUN CLI.
# Give it only the selected profile so its failover cannot change core versions.
profile="$1"
runtime=/var/run/csqtt/core253
umask 077
mkdir -p "$runtime"
cp /etc/config/csqtt "$runtime/csqtt"
uci253() { /sbin/uci -c "$runtime" -P "$runtime/.uci" "$@"; }
child=''
cleanup() {
	trap - EXIT INT TERM
	if [ -n "$child" ]; then kill "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi
	rm -f "$runtime/csqtt"
}
trap cleanup EXIT
trap 'exit 0' INT TERM

. /lib/functions.sh
config_load csqtt
disable_other() { [ "$1" = "$profile" ] || uci253 set "csqtt.$1.enabled=0"; }
config_foreach disable_other server
for field in vk vk_js_token vk_hash_mode vk_auth_mode workers obfs turn_transport srtp_mode fingerprint captcha_mode client_ids tun_mtu tun_address dns runtime_threads; do
	config_get value "$profile" "$field"
	if [ -z "$value" ]; then
		config_get value main "$field"
		[ -z "$value" ] || uci253 set "csqtt.$profile.$field=$value"
	fi
done
uci253 set csqtt.main.schema_version=3
uci253 set csqtt.main.selection_mode=manual
uci253 set "csqtt.main.active_profile=$profile"
uci253 set csqtt.main.failover=0
uci253 set csqtt.main.failback=0
uci253 set "csqtt.$profile.core_version=2.5.3"
uci253 commit csqtt

/usr/libexec/csqtt/csqtt-control-2.5.3 run --config "$runtime/csqtt" \
	--status /var/run/csqtt/status.json --log /var/log/csqtt.log --helper-port 8443 &
child=$!
wait "$child"

#!/bin/sh
set -eu
project=$(CDPATH= cd -- "${1:-.}" && pwd)
sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT INT TERM
fail() { echo "FAIL: $*" >&2; exit 1; }
mkdir -p "$sandbox/bin"
for name in csqtt-core-2.1.9 csqtt-core-2.5.0 csqtt-control-2.5.3 csqtt-2.5.3; do
	printf '#!/bin/sh\nexit 0\n' >"$sandbox/bin/$name"
done
# Windows/MSYS gives script files executable mode; Linux needs chmod.
if command -v chmod >/dev/null 2>&1; then chmod +x "$sandbox"/bin/*; fi
touch "$sandbox/tun"
sed "s@/usr/libexec/csqtt/csqtt-@$sandbox/bin/csqtt-@g;s@/usr/bin/csqtt-2.5.3@$sandbox/bin/csqtt-2.5.3@g;s@/dev/net/tun@$sandbox/tun@g" \
	"$project/luci-app-csqtt/package/root/etc/init.d/csqtt" >"$sandbox/init.sh"
. "$sandbox/init.sh"
requested_core=2.1.9
requested_workers=126
profile_token='vk1.profile_token='
config_load() { :; }
config_get() {
	value=${4:-}
	case "$2.$3" in
	main.enabled|server.enabled) value=1;; main.selection_mode) value=manual;;
	main.active_profile) value=server;; server.TYPE) value=server;;
	server.core_version) value=$requested_core;; server.peer) value=test.invalid:46000;;
	server.password) value=password-secret;; server.workers) value=$requested_workers;;
	server.vk_hash_mode|server.vk_auth_mode) value=auto_js;; server.vk_js_token) value=$profile_token;;
	main.vk_js_token) value=shared-token;;
	esac
	eval "$1=\$value"
}
config_get_bool() { config_get "$@"; }
config_foreach() { "$1" server; }
logger() { :; }
procd_open_instance() { command_args=''; environment=''; }
procd_close_instance() { :; }
procd_set_param() {
	key=$1; shift
	case "$key" in command) command_args="$*";; env) environment="$*";; esac
}
procd_append_param() { key=$1; shift; [ "$key" != command ] || command_args="$command_args $*"; }
for requested_core in 2.1.9 2.5.1 2.5.3; do
	SELECTED_PROFILE=''
	requested_workers=90
	start_service || fail "start $requested_core"
	case "$requested_core" in
	2.1.9)
		case "$command_args" in *csqtt-core-2.1.9*--password*) :;; *) fail '2.1.9 command';; esac
		case "$command_args" in *--srtp-mode*|*--runtime-threads*) fail 'new flags sent to legacy';; esac;;
	2.5.1)
		case "$command_args" in *csqtt-core-2.5.0*--srtp-mode*) :;; *) fail '2.5.1 command';; esac
		case "$command_args" in *--password*|*--device-id*) fail 'legacy flags sent to 2.5.1';; esac;;
	2.5.3)
		case "$command_args" in *run-253.sh*server) :;; *) fail '2.5.3 must launch its supervisor adapter';; esac
		case "$command_args" in *--tun*|*--ignore-stdin-eof*) fail 'legacy CLI sent to 2.5.3';; esac;;
	esac
	if [ "$requested_core" != 2.5.3 ]; then
		case "$environment" in *CSQTT_VK_JS_TOKEN=vk1.profile_token=*) :;; *) fail 'profile token must win';; esac
	fi
done
requested_core=2.1.9 requested_workers=126 SELECTED_PROFILE=''
start_service || fail 'legacy must accept 126 workers'
requested_core=2.5.1 requested_workers=126 SELECTED_PROFILE=''
if start_service 2>/dev/null; then fail '2.5.1 must reject more than 100 workers'; fi
requested_core=2.5.3 SELECTED_PROFILE=server
rm "$sandbox/bin/csqtt-control-2.5.3"
resolve_core
[ "$CSQTT_BIN" = "$sandbox/bin/csqtt-control-2.5.3" ] || fail 'explicit missing core must not fall back'
echo 'PASS: three exact core paths, distinct CLIs, profile token precedence, worker limits, no protocol fallback'

#!/bin/sh
set -eu
project=$(CDPATH='' cd -- "${1:-.}" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/etc/config" "$work/usr/lib/csqtt/core-2.5.3/bin" "$work/bin"
cp "$project/luci-app-csqtt/package/root/etc/config/csqtt" "$work/etc/config/csqtt"
cat > "$work/usr/lib/csqtt/core-2.5.3/bin/csqtt-control" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$CALLS"
exit 0
EOF
cat > "$work/bin/uci" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$CALLS"
EOF
chmod +x "$work/usr/lib/csqtt/core-2.5.3/bin/csqtt-control" "$work/bin/uci"
export PATH="$work/bin:$PATH" CALLS="$work/calls"
sed "s@/usr/lib/@$work/usr/lib/@g;s@/var/run/@$work/var/run/@g;s@/etc/config/@$work/etc/config/@g" \
 "$project/luci-app-csqtt/package/root/etc/init.d/csqtt" > "$work/init.sh"
. "$work/init.sh"
SELECTED_PROFILE=fixture
WORKERS=10
config_get() {
 value=${4:-}
 case "$3" in workers) value=$WORKERS;; flood_retry_delay) value=3600;; flood_retry_limit) value=3;; esac
 eval "$1=\$value"
}
config_get_bool() { config_get "$@"; }
procd_open_instance() { :; }
procd_set_param() { printf '%s\n' "$*" >> "$CALLS"; }
procd_close_instance() { :; }
start_core253
grep -q 'run-core253.sh .*csqtt-control run --config' "$CALLS"
grep -q 'csqtt.fixture.core_version=2.5.3' "$CALLS"
grep -q 'csqtt.main.workers=10' "$CALLS"
grep -q 'csqtt.main.install_routes=0' "$CALLS"
grep -q 'CSQTT_FLOOD_RETRY_DELAY=3600' "$CALLS"
! grep -q -- '--password\|--peer\|--device-id' "$CALLS"
cmp "$project/luci-app-csqtt/package/root/etc/config/csqtt" "$work/etc/config/csqtt"
case "$(uname -s)" in
 MSYS*|MINGW*) : ;; # NTFS does not implement Unix mode bits.
 *) [ "$(stat -c '%a' "$work/var/run/csqtt/core253/csqtt")" = 600 ] ;;
esac
: > "$CALLS"
WORKERS=9
if start_core253 >/dev/null 2>&1; then echo 'FAIL: invalid workers accepted'; exit 1; fi
[ ! -s "$CALLS" ]
echo 'PASS: 2.5.3 controller arguments, private config, network isolation, flood policy, invalid workers and original configuration preservation'

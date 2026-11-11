#!/bin/sh
set -eu
project=$(CDPATH= cd -- "${1:-.}" && pwd)
ORIGINAL_PATH=$PATH
sandbox=$(mktemp -d /tmp/csqtt-r10-tests.XXXXXX)
trap 'rm -rf "$sandbox"' EXIT INT TERM
fail() { echo "FAIL: $*" >&2; exit 1; }

# Source only function definitions; UCI/procd operations are mocked.
. "$project/luci-app-csqtt/package/root/etc/init.d/csqtt"
config_get() {
 value=${4:-}
 case "$2.$3" in
 main.selection_mode) value=manual;; main.active_profile) value=incomplete;;
 main.core_version) value=2.5.0;;
 incomplete.TYPE|fallback.TYPE) value=server;;
 incomplete.enabled|fallback.enabled) value=1;;
 incomplete.peer|incomplete.password) value=;;
 fallback.peer) value=test.invalid:46000;; fallback.password) value=test;;
 fallback.priority) value=20;; fallback.core_version) value=2.1.9;;
 esac
 eval "$1=\$value"
}
config_get_bool() { config_get "$@"; }
config_foreach() { "$1" fallback; }
select_profile
[ "$SELECTED_PROFILE" = fallback ] || fail 'init must skip an incomplete manual profile'
resolve_core
[ "$CSQTT_BIN" = /usr/libexec/csqtt/csqtt-core-2.1.9 ] || fail 'selected profile must determine core'

mkdir -p "$sandbox/runtime" "$sandbox/bin" "$sandbox/install" "$sandbox/etc/config"
for name in status.json access-check.json cpu-sample.json; do echo stale >"$sandbox/runtime/$name"; done
sed "s@/var/run/csqtt@$sandbox/runtime@g" "$project/luci-app-csqtt/package/root/usr/libexec/csqtt/run-core.sh" >"$sandbox/wrapper.sh"
CSQTT_STARTUP_WAIT=0 sh "$sandbox/wrapper.sh" /bin/true
for name in status.json access-check.json cpu-sample.json; do
 [ ! -e "$sandbox/runtime/$name" ] || fail 'wrapper must remove stale session evidence'
done

cat >"$sandbox/bin/apk" <<'EOF'
#!/bin/sh
if [ "$1" = info ]; then [ "$3" = luci-app-csqtt ]; exit; fi
echo "$*" >>"$TEST_APK_LOG"
if [ "$1" = del ]; then
 [ "${FAIL_DELETE:-0}" != 1 ] && [ "$#" = 2 ] && [ "$2" = luci-app-csqtt ]
else
 exit 0
fi
EOF
cat >"$sandbox/bin/uci" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod 755 "$sandbox/bin/apk" "$sandbox/bin/uci"
export TEST_APK_LOG="$sandbox/apk.log"
export PATH="$sandbox/bin:$PATH"
sed "s@/etc/@$sandbox/etc/@g;s@/tmp/luci-indexcache@$sandbox/luci-indexcache@g" "$project/install-csqtt.sh" >"$sandbox/install/install.sh"
echo panel >"$sandbox/install/luci-app-csqtt-2.0-openwrt-25.12.apk"
echo core >"$sandbox/install/csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk"
if sh "$sandbox/install/install.sh" --core 2.1.9 --dry-run >/dev/null 2>&1; then fail 'missing checksum file must fail'; fi
[ ! -e "$TEST_APK_LOG" ] || fail 'unverified packages must not reach apk'
echo 'invalid  luci-app-csqtt-2.0-openwrt-25.12.apk' >"$sandbox/install/SHA256SUMS"
if sh "$sandbox/install/install.sh" --core 2.1.9 --dry-run >/dev/null 2>&1; then fail 'checksum mismatch must fail'; fi
(cd "$sandbox/install" && sha256sum ./*.apk | sed 's@  ./@  @' >SHA256SUMS)
sh "$sandbox/install/install.sh" --core 2.1.9 --dry-run >/dev/null
[ ! -e "$TEST_APK_LOG" ] || fail 'dry run must not install packages'

sed "s@/etc/@$sandbox/etc/@g;s@/var/run/@$sandbox/var/run/@g;s@/tmp/luci-indexcache@$sandbox/luci-indexcache@g" "$project/uninstall-csqtt.sh" >"$sandbox/uninstall.sh"
echo fixture-config >"$sandbox/etc/config/csqtt"
chmod 600 "$sandbox/etc/config/csqtt"
sh "$sandbox/uninstall.sh" >/dev/null
grep -qx 'del luci-app-csqtt' "$TEST_APK_LOG" || fail 'uninstall must select only installed packages'
cmp "$sandbox/etc/config/csqtt" "$sandbox/etc/config/csqtt.backup" || fail 'uninstall must keep configuration backup'
if FAIL_DELETE=1 sh "$sandbox/uninstall.sh" --purge >/dev/null 2>&1; then fail 'apk deletion failure must propagate'; fi
[ -f "$sandbox/etc/config/csqtt" ] || fail 'failed purge must not delete configuration'

# --- Тот же цикл для OpenWrt 24.10 (opkg/IPK) ---
mkdir -p "$sandbox/bin-opkg" "$sandbox/install-opkg" "$sandbox/etc-opkg/config"
cat >"$sandbox/bin-opkg/opkg" <<'EOF'
#!/bin/sh
echo "$*" >>"$TEST_OPKG_LOG"
case "$1" in
	status) [ "$2" = luci-app-csqtt ] && echo 'Status: install user installed' ;;
	remove) return 0 ;;
esac
exit 0
EOF
cp "$sandbox/bin/uci" "$sandbox/bin-opkg/uci"
chmod 755 "$sandbox/bin-opkg/opkg" "$sandbox/bin-opkg/uci"
export TEST_OPKG_LOG="$sandbox/opkg.log"
export PATH="$sandbox/bin-opkg:$ORIGINAL_PATH"
sed "s@/etc/@$sandbox/etc-opkg/@g;s@/tmp/luci-indexcache@$sandbox/luci-indexcache@g" "$project/install-csqtt.sh" >"$sandbox/install-opkg/install.sh"
echo panel >"$sandbox/install-opkg/luci-app-csqtt-2.0-openwrt-24.10.ipk"
echo core >"$sandbox/install-opkg/csqtt-core-2.1.9-openwrt-24.10-mipsel_24kc.ipk"
(cd "$sandbox/install-opkg" && sha256sum ./*.ipk | sed 's@  ./@  @' >SHA256SUMS)
sh "$sandbox/install-opkg/install.sh" --core 2.1.9 --dry-run >/dev/null
[ ! -e "$TEST_OPKG_LOG" ] || fail 'dry run must not install packages via opkg'
grep -q '^add' "$TEST_OPKG_LOG" && fail 'dry run must not install packages via opkg' || true
sh "$sandbox/install-opkg/install.sh" --core 2.1.9 >/dev/null
grep -q 'add --allow-untrusted' "$TEST_OPKG_LOG" && fail 'opkg must not use apk-style flags' || true
grep -q 'install' "$TEST_OPKG_LOG" || fail 'install via opkg must be logged'
[ -e "$sandbox/luci-indexcache" ] && fail 'install must clear the luci index cache' || true
[ -d "$sandbox/etc-opkg/config" ] || fail 'sed mapping must keep config dir intact'
export TEST_APK_LOG="$sandbox/apk-opkg.log"
sed "s@/etc/@$sandbox/etc-opkg/@g;s@/var/run/@$sandbox/var-run-opkg/@g;s@/tmp/luci-indexcache@$sandbox/luci-indexcache@g" "$project/uninstall-csqtt.sh" >"$sandbox/uninstall-opkg.sh"
sh "$sandbox/uninstall-opkg.sh" >/dev/null
grep -qx 'remove luci-app-csqtt' "$TEST_OPKG_LOG" || fail 'uninstall must select only installed opkg packages'
export PATH="$sandbox/bin:$PATH"

echo 'PASS: init selection, core choice, stale session cleanup, checksum enforcement, dry-run, uninstall and failed-purge safety (apk + opkg/IPK)'

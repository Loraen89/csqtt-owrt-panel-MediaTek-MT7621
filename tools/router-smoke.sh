#!/bin/sh
# Read-only hardware preflight. Never prints UCI credentials or changes services.
set -u
echo '=== Platform ==='
[ ! -f /etc/openwrt_release ] || cat /etc/openwrt_release
command -v ubus >/dev/null 2>&1 && ubus call system board 2>/dev/null || true
uname -m
echo '=== Space and memory ==='
df -k /overlay /tmp 2>/dev/null || true
sed -n '/^MemTotal:/p;/^MemAvailable:/p' /proc/meminfo
echo '=== Packages ==='
if command -v apk >/dev/null 2>&1; then
 apk --print-arch
 apk info -v 2>/dev/null | grep -E '^(csqtt|luci-app-csqtt)' || true
fi
if command -v opkg >/dev/null 2>&1; then
 opkg print-architecture
 opkg list-installed 2>/dev/null | grep -E '^(csqtt|luci-app-csqtt)' || true
fi
echo '=== Configuration fingerprint (no credentials) ==='
[ ! -f /etc/config/csqtt ] || sha256sum /etc/config/csqtt
if command -v uci >/dev/null 2>&1; then
 for key in enabled core_version ifname selection_mode; do
  value=$(uci -q get "csqtt.main.$key" 2>/dev/null || true)
  printf '%s=%s\n' "$key" "$value"
 done
fi
echo '=== Runtime ==='
for file in /usr/bin/csqtt-2.5.3 /usr/lib/csqtt/core-2.5.3/bin/csqtt-control /usr/libexec/csqtt/panel-init.sh /dev/net/tun; do
 [ ! -e "$file" ] || printf 'present: %s\n' "$file"
done
if [ -x /usr/lib/csqtt/core-2.5.3/bin/csqtt-control ]; then
 /usr/lib/csqtt/core-2.5.3/bin/csqtt-control version
fi
[ ! -f /var/run/csqtt/flood-blocked ] || echo 'VK Flood marker is present'
echo 'No service or configuration changes were made.'

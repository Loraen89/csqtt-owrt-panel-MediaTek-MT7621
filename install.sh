#!/bin/sh
# Pinned upstream installer for the official MT7621 2.5.3 distribution.
set -eu
REV=724f5855515a4501135590f479ee5b9fd66f3307
SHA=bf034e9196b329b0b23dded920afca2acdbbf35e546c229a422d5590e80e3f30
URL="https://raw.githubusercontent.com/starkugz/csqtt-openwrt/$REV/router/install-csqtt.sh"
DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/csqtt-bootstrap.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
command -v sha256sum >/dev/null 2>&1 || { echo 'sha256sum is required' >&2; exit 1; }
if [ -f "$DIR/vendor/upstream/install-csqtt.sh" ]; then
 cp "$DIR/vendor/upstream/install-csqtt.sh" "$WORK/install-csqtt.sh"
elif command -v curl >/dev/null 2>&1; then
 curl -fsSL --connect-timeout 15 --max-time 120 -o "$WORK/install-csqtt.sh" "$URL"
elif command -v wget >/dev/null 2>&1; then
 wget -T 30 -qO "$WORK/install-csqtt.sh" "$URL"
else
 echo 'curl or wget is required' >&2; exit 1
fi
actual=$(sha256sum "$WORK/install-csqtt.sh" | awk '{print $1}')
[ "$actual" = "$SHA" ] || { echo 'Installer SHA-256 mismatch; stopped' >&2; exit 1; }
export CSQTT_RELEASE_OWNER=${CSQTT_RELEASE_OWNER:-starkugz}
export CSQTT_RELEASE_REPO=${CSQTT_RELEASE_REPO:-csqtt-openwrt}
export CSQTT_RELEASE_TAG=${CSQTT_RELEASE_TAG:-v2.5.3}
export CSQTT_RELEASE_DISCOVER=${CSQTT_RELEASE_DISCOVER:-0}
[ "$#" -gt 0 ] || set -- install --set core
# The core activation helper replaces /etc/init.d/csqtt. Keep our panel's
# dispatcher when installing only a core, including on failed transactions.
ROOT=${CSQTT_ROOT:-}
PANEL_INIT="$ROOT/usr/libexec/csqtt/panel-init.sh"
restore=0
dry=0
set_value=''
previous=''
for arg in "$@"; do
 [ "$previous" != --set ] || set_value=$arg
 case "$arg" in --set=*) set_value=${arg#--set=};; --dry-run) dry=1;; esac
 previous=$arg
done
if [ "$set_value" = core ] && [ -f "$PANEL_INIT" ]; then
 restore=1
 for arg in "$@"; do
  case "$arg" in check|inventory|status|verify|help|--help|-h) restore=0;; esac
 done
fi
if [ "$restore" -eq 1 ] && [ "$dry" -eq 0 ]; then
 mkdir -p "$ROOT/etc/init.d"
 set -- "$@" --no-restart
fi
code=0
sh "$WORK/install-csqtt.sh" "$@" || code=$?
if [ "$restore" -eq 1 ] && [ "$dry" -eq 0 ]; then
 cp "$PANEL_INIT" "$ROOT/etc/init.d/csqtt" || exit 31
 chmod 755 "$ROOT/etc/init.d/csqtt"
 # Keep service state as chosen by the installer/user. Start only explicitly.
 echo 'CSQTT-PANEL dispatcher restored. Start the selected profile from LuCI.'
fi
exit "$code"

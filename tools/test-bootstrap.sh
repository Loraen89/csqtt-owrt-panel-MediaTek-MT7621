#!/bin/sh
set -eu
project=$(CDPATH='' cd -- "${1:-.}" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
sh "$project/install.sh" help > "$work/help"
grep -q -- '--core-version 2.1.9|2.5.3' "$work/help"
mkdir -p "$work/vendor/upstream"
cp "$project/install.sh" "$work/install.sh"
printf 'echo executed > "%s"\n' "$work/executed" > "$work/vendor/upstream/install-csqtt.sh"
if sh "$work/install.sh" help > "$work/result" 2>&1; then echo 'FAIL: tampered installer accepted'; exit 1; fi
[ ! -f "$work/executed" ]
grep -q 'SHA-256 mismatch' "$work/result"
echo 'PASS: pinned upstream installer help and rejection of modified executable content'

#!/bin/sh
set -eu
step=${1:?Pass the shell body from the workflow Publish release assets step}
sandbox=$(mktemp -d /tmp/csqtt-release-tests.XXXXXX)
trap 'rm -rf "$sandbox"' EXIT INT TERM
mkdir -p "$sandbox/bin"
cat >"$sandbox/bin/gh" <<'EOF'
#!/bin/sh
if [ "$1 $2" = 'release view' ]; then exit "$VIEW_EXIT"; fi
printf '%s\n' "$*" >>"$CALL_LOG"
EOF
chmod 755 "$sandbox/bin/gh"
export PATH="$sandbox/bin:$PATH"
for existing in 0 1; do
 for suffix in r10-rc1 r11-alpha1 r11-beta2 r11; do
  export VIEW_EXIT=$existing CALL_LOG="$sandbox/calls.log" GITHUB_REF_NAME="v2.0-mt7621-$suffix"
  : >"$CALL_LOG"
  sh "$step"
  case "$suffix" in
   *-rc*|*-alpha*|*-beta*) expected='--prerelease=true --latest=false';;
   *) expected='--prerelease=false --latest=true';;
  esac
  grep -q -- "$expected" "$CALL_LOG" || { echo "FAIL: release flags for $suffix"; exit 1; }
  grep -q -- '--notes-file README.md' "$CALL_LOG" || { echo 'FAIL: installation notes missing'; exit 1; }
  if [ "$existing" = 0 ]; then
   grep -q 'release upload' "$CALL_LOG"
   grep -q 'release edit' "$CALL_LOG"
  else
   grep -q 'release create' "$CALL_LOG"
  fi
 done
done
echo 'PASS: existing/new rc, alpha, beta and stable releases keep correct prerelease/Latest flags and README notes'

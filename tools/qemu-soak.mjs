// Offline OpenWrt/MIPS smoke and process-lifecycle soak. No router hardware is emulated.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'qemu-results');
const fixtures = process.env.CSQTT_QEMU_FIXTURES || 'D:/csqtt-tooling/qemu-test/release';
const qemu = process.env.CSQTT_QEMU_EXE || 'C:/Program Files/qemu/qemu-system-mipsel.exe';
const seconds = Number(process.env.CSQTT_SOAK_SECONDS || 60);
if (!Number.isInteger(seconds) || seconds < 30 || seconds > 3600) throw Error('Invalid soak duration');
fs.mkdirSync(out, { recursive: true });
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const pad = data => Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4)]);
let ino = 1;
function entry(name, data = Buffer.alloc(0), mode = 0o100644, major = 0, minor = 0) {
  const nb = Buffer.from(name + '\0');
  const fields = [ino++, mode, 0, 0, 1, 0, data.length, 0, 0, major, minor, nb.length, 0];
  const header = Buffer.from('070701' + fields.map(n => n.toString(16).padStart(8, '0')).join(''));
  return Buffer.concat([pad(Buffer.concat([header, nb])), pad(data)]);
}

const script = `#!/bin/sh
exec </dev/null >/dev/console 2>&1
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
fails=0
check() {
  name="$1"; shift
  "$@"
  rc=$?
  echo "QCHECK|$name|$rc"
  [ "$rc" = 0 ] || fails=$((fails + 1))
}
pid_of() { pidof "$1" | awk '{print $1}'; }
wait_pid() {
  n=0
  while [ "$n" -lt 25 ]; do
    got="$(pid_of "$1")"
    [ -n "$got" ] && [ "$got" != "$2" ] && return 0
    sleep 1; n=$((n + 1))
  done
  return 1
}
wait_tun() {
  n=0
  while [ "$n" -lt 20 ]; do
    [ -d /sys/class/net/csqtt0 ] && return 0
    sleep 1; n=$((n + 1))
  done
  return 1
}
running_status() {
  ubus -t 15 call csqtt status '{}' >/tmp/qemu-status.json || return 1
  cat /tmp/qemu-status.json
  [ "$(jsonfilter -i /tmp/qemu-status.json -e '@.status.connectivity.process_running')" = true ]
}
echo 'QEMU_SOAK_BEGIN'
cat /opt/profile
uname -a
cat /etc/openwrt_release
check offline_install apk add --no-network --allow-untrusted --force-non-repository /opt/apk/*.apk
[ "$fails" -eq 0 ] || { echo "QEMU_SOAK_DONE|failures=$fails"; sync; poweroff -f; exit 1; }
check default_disabled test "$(uci -q get csqtt.main.enabled)" = 0
modprobe tun
check tun_device test -c /dev/net/tun
check core_hashes sh -c 'cd /usr/libexec/csqtt && sha256sum -c /opt/core-SHA256SUMS'
for binary in csqtt-core-2.1.9 csqtt-core-2.5.0; do
  check "version_$binary" /usr/libexec/csqtt/$binary --version
  check "selftest_$binary" /usr/libexec/csqtt/$binary --self-test
done
for file in /etc/init.d/csqtt /usr/libexec/csqtt/*.sh; do
  check "syntax_$(basename "$file")" sh -n "$file"
done
/etc/init.d/rpcd restart
sleep 3
check rpc_registration sh -c 'ubus -t 10 list csqtt | grep -qx csqtt'
check rpc_status ubus -t 15 call csqtt status '{}'
check rpc_regression ucode /opt/rpc-regression.uc
# The stock fixture requires the same LuCI ucode mapping as luci-base postinstall.
uci -q get uhttpd.main.ucode_prefix | grep -q /cgi-bin/luci || {
  uci add_list uhttpd.main.ucode_prefix='/cgi-bin/luci=/usr/share/ucode/luci/uhttpd.uc'
  uci commit uhttpd
}
/etc/init.d/uhttpd restart
sleep 2
http_code="$(curl --max-time 15 -s -o /tmp/luci.html -w '%{http_code}' http://127.0.0.1/cgi-bin/luci/)"
echo "HTTP_CODE=$http_code"
check luci_http sh -c 'case "$1" in 200|302|403) exit 0;; *) exit 1;; esac' sh "$http_code"
check luci_view test -s /www/luci-static/resources/view/csqtt/status.js
# A loopback route lets run-core.sh start without permitting any external traffic.
ip -4 route show default | grep -q '^default ' || ip route add default dev lo
uci batch <<'CONFIG'
set csqtt.main.enabled='1'
set csqtt.main.vk='qemu-offline-test'
set csqtt.main.vk_hash_mode='manual'
set csqtt.main.workers='3'
set csqtt.main.runtime_threads='1'
set csqtt.main.startup_wait='0'
set csqtt.profile1.enabled='1'
set csqtt.profile1.peer='192.0.2.1:51820'
set csqtt.profile1.password='qemu-synthetic-password'
commit csqtt
CONFIG
for version in 2.5.1 2.1.9; do
  case "$version" in 2.5.1) binary=csqtt-core-2.5.0;; *) binary=csqtt-core-2.1.9;; esac
  uci set csqtt.main.core_version="$version"
  uci commit csqtt
  /etc/init.d/csqtt start
  check "start_$version" wait_pid "$binary" ''
  first="$(pid_of "$binary")"
  echo "QEMU_START_DIAGNOSTICS|$version"
  logread | grep -i csqtt | tail -12
  check "tun_$version" wait_tun
  check "mtu_$version" sh -c '[ "$(cat /sys/class/net/csqtt0/mtu)" = 1300 ]'
  elapsed=0
  while [ "$elapsed" -lt ${seconds} ]; do
    sleep 10; elapsed=$((elapsed + 10))
    current="$(pid_of "$binary")"
    rss="$(awk '/^VmRSS:/ {print $2}' /proc/$current/status 2>/dev/null)"
    available="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
    echo "QSAMPLE|$version|$elapsed|pid=$current|rss_kib=$rss|available_kib=$available"
    check "stable_\${version}_$elapsed" test -n "$current"
    check "same_pid_\${version}_$elapsed" test "$current" = "$first"
  done
  check "rpc_running_$version" running_status
  check "offline_no_session_$version" sh -c '[ "$(jsonfilter -i /tmp/qemu-status.json -e "@.status.connectivity.session_established")" = false ]'
  if [ -n "$first" ]; then
    kill -KILL "$first"
    check "respawn_$version" wait_pid "$binary" "$first"
    sleep 3
    check "respawn_tun_$version" wait_tun
  fi
  /etc/init.d/csqtt stop
  sleep 3
  check "stop_$version" sh -c '! pidof "$1" >/dev/null' sh "$binary"
  check "cleanup_tun_$version" test ! -d /sys/class/net/csqtt0
done
echo 'QEMU_KERNEL_DIAGNOSTICS'
dmesg | tail -30
check kernel_health sh -c '! dmesg | grep -E "Out of memory:|Killed process|Kernel panic|Oops:"'
echo 'QEMU_SERVICE_LOG'
logread | grep -i csqtt | tail -35
echo "QEMU_SOAK_DONE|failures=$fails"
sync
poweroff -f
`;
fs.writeFileSync(path.join(out, 'guest-test.sh'), script);

const manifest = {
  sourceRevision: process.env.CSQTT_SOURCE_REVISION || spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout?.trim() || 'unknown',
  source: 'https://github.com/Loraen89/csqtt-owrt-panel-MediaTek-MT7621',
  initScriptSha256: sha(fs.readFileSync(path.join(root, 'luci-app-csqtt/package/root/etc/init.d/csqtt'))),
  localFix: 'Map unsupported shared unified obfuscation to audio for the 2.1.9 core; preserve audio/video and newer cores.',
  built: new Date().toISOString(),
  coreCompilation: 'Reused existing compiled cores with verified SHA256; APK/IPK packaging rebuilt.',
  machine: 'malta', cpu: '24Kc', memoryMiB: 256, secondsPerCore: seconds,
  scope: 'MIPS userspace simulation only; neither MT7621 board, Wi-Fi, switch, bootloader nor flash emulated.',
  network: 'No NIC. Synthetic credentials, loopback default route, no real VK/tunnel traffic.',
  packages: [], profiles: [],
};
const files = [];
for (const n of fs.readdirSync(path.join(fixtures, 'apks')).filter(n => n.endsWith('.apk'))) {
  files.push(entry('opt/apk/' + n, fs.readFileSync(path.join(fixtures, 'apks', n))));
}
const atomic = path.join(fixtures, '..', 'serve', 'libatomic1-14.3.0-r5.apk');
files.push(entry('opt/apk/libatomic1-14.3.0-r5.apk', fs.readFileSync(atomic)));
for (const n of fs.readdirSync(path.join(root, 'dist')).filter(n => n.endsWith('.apk'))) {
  const data = fs.readFileSync(path.join(root, 'dist', n));
  manifest.packages.push({ name: n, bytes: data.length, sha256: sha(data) });
  files.push(entry('opt/apk/' + n, data));
}
const coreSums = [
  ['core219/dist/csqtt-core-2.1.9-mt7621-r1-mipsel_24kc', 'csqtt-core-2.1.9'],
  ['core251/dist/csqtt-core-2.5.1-mt7621-r1-mipsel_24kc', 'csqtt-core-2.5.0'],
].map(([file, name]) => sha(fs.readFileSync(path.join(root, file))) + '  ' + name).join('\n') + '\n';
const rootfs = fs.readFileSync(path.join(fixtures, 'rootfs-rel.cpio'));
manifest.rootfsSha256 = sha(rootfs);
manifest.kernelSha256 = sha(fs.readFileSync(path.join(fixtures, 'vmlinux-initramfs.elf')));

let overallFailure = false;
let interrupted = false;
for (const profile of ['Xiaomi3Gv1', 'NetisN6v1']) {
  const initrd = path.join(out, profile + '.cpio');
  const entries = [entry('opt', undefined, 0o40755), entry('opt/apk', undefined, 0o40755), ...files,
    entry('dev/console', undefined, 0o20600, 5, 1),
    entry('dev/null', undefined, 0o20666, 1, 3),
    entry('etc/rc.local', Buffer.from('/opt/qemu-test.sh &\nexit 0\n'), 0o100755),
    entry('opt/qemu-test.sh', Buffer.from(script), 0o100755),
    entry('opt/profile', Buffer.from(profile + '\n')),
    entry('opt/rpc-regression.uc', fs.readFileSync(path.join(out, 'rpc-regression.uc'))),
    entry('opt/core-SHA256SUMS', Buffer.from(coreSums)), entry('TRAILER!!!')];
  fs.writeFileSync(initrd, Buffer.concat([rootfs, ...entries]));
  const logFile = path.join(out, profile + '.log');
  const log = fs.createWriteStream(logFile);
  const args = ['-M', 'malta', '-cpu', '24Kc', '-m', '256M', '-display', 'none', '-monitor', 'none',
    '-serial', 'stdio', '-nic', 'none', '-no-reboot', '-kernel', path.join(fixtures, 'vmlinux-initramfs.elf'),
    '-initrd', initrd, '-append', 'console=ttyS0,115200n8 rdinit=/sbin/init panic=1'];
  console.log('START ' + profile);
  const started = Date.now();
  let output = '';
  let timedOut = false;
  const child = spawn(qemu, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const timeout = setTimeout(() => { timedOut = true; child.kill(); }, (seconds * 2 + 240) * 1000);
  let lineBuffer = '';
  const interrupt = () => { interrupted = true; child.kill(); };
  process.once('SIGINT', interrupt);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
    log.write(data); output += data;
    lineBuffer += data.toString();
    const lines = lineBuffer.split(/\r?\n/);
    lineBuffer = lines.pop();
    for (const line of lines) {
      if (/QEMU_SOAK_|^QCHECK\||^QSAMPLE\||HTTP_CODE=/.test(line)) console.log(profile + ' ' + line.trim());
    }
  });
  let spawnError = null;
  child.on('error', e => { spawnError = String(e); });
  const exitCode = await new Promise(resolve => child.on('close', resolve));
  process.removeListener('SIGINT', interrupt);
  clearTimeout(timeout);
  await new Promise(resolve => log.end(resolve));
  const failures = [...output.matchAll(/QCHECK\|([^|\r\n]+)\|(\d+)/g)].filter(m => m[2] !== '0').map(m => ({check: m[1], code: Number(m[2])}));
  const done = /QEMU_SOAK_DONE\|failures=0\b/.test(output);
  const passed = done && exitCode === 0 && !timedOut && !spawnError && failures.length === 0;
  const result = { profile, passed, exitCode, timedOut, spawnError, durationSeconds: Math.round((Date.now() - started) / 1000),
    checks: [...output.matchAll(/QCHECK\|/g)].length, failures, log: logFile, command: [qemu, ...args] };
  manifest.profiles.push(result);
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(manifest, null, 2) + '\n');
  overallFailure ||= !passed;
  console.log('FINISH ' + profile + ' ' + JSON.stringify({passed, exitCode, failures, timedOut, spawnError}));
  if (interrupted) break;
}
process.exitCode = overallFailure ? 1 : 0;

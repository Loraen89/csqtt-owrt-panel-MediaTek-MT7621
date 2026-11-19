import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function parsePartitions(text) {
  const partitions = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^(mtd\d+)\|([a-z0-9_-]+)\|(\d+)\|(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid MTD inventory: ${line}`);
    const size = Number(match[3]);
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Invalid MTD size');
    if (partitions.some(p => p.device === match[1])) throw new Error('Duplicate MTD device');
    partitions.push({ device: match[1], type: match[2], size, name: match[4] });
  }
  return partitions;
}

export function dumpCommand(partition) {
  if (!/^mtd\d+$/.test(partition.device)) throw new Error('Invalid device');
  if (['nand', 'mlc-nand'].includes(partition.type)) {
    // Logical, ECC-corrected image with bad blocks padded; OOB is not included.
    return `nanddump --bb=padbad --omitoob --length=${partition.size} /dev/${partition.device}`;
  }
  if (partition.type !== 'nor') throw new Error(`Unsupported MTD type: ${partition.type}`);
  return `dd if=/dev/${partition.device} bs=65536`;
}

// Binary stdout is streamed directly to disk, never through PowerShell text output.
export async function transfer(executable, args, destination, timeoutMs = 300000) {
  const temporary = `${destination}.partial`;
  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '', timedOut = false;
  child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-8192); });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(
      timedOut ? 'SSH transfer timed out' : `Command exited ${code}: ${stderr.trim()}`)));
  });
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  const hash = createHash('sha256');
  let size = 0;
  child.stdout.on('data', data => { hash.update(data); size += data.length; });
  try {
    await Promise.all([done, pipeline(child.stdout, fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))]);
    fs.renameSync(temporary, destination);
    return { size, sha256: hash.digest('hex') };
  } catch (error) {
    child.kill();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function verifyImage(result, partition, remoteHash) {
  if (result.size !== partition.size) throw new Error(`Size mismatch for ${partition.device}: ${result.size} != ${partition.size}`);
  if (!/^[a-f0-9]{64}$/.test(remoteHash) || result.sha256 !== remoteHash) {
    throw new Error(`SHA-256 mismatch for ${partition.device}; flash may have changed during backup`);
  }
}

async function main() {
  const host = process.argv[2] || '192.168.7.1';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host)) throw new Error('Expected an IPv4 address or hostname');
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const directory = path.join(project, 'backups', `${host}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const manifest = { host, started: new Date().toISOString(), complete: false,
    format: 'Logical MTD images; NAND uses ECC correction and bad-block padding, without OOB', files: [] };
  const save = () => fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  const options = ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3', '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `UserKnownHostsFile=${path.join(project, 'backups', 'known_hosts')}`, `root@${host}`];
  const fetch = async (name, command) => {
    const result = await transfer('ssh', [...options, command], path.join(directory, name));
    manifest.files.push({ name, ...result });
    save();
    return result;
  };
  save();
  try {
    console.log(`Backup destination: ${directory}`);
    await fetch('board.json', 'ubus call system board');
    const board = JSON.parse(fs.readFileSync(path.join(directory, 'board.json'), 'utf8'));
    if (!/ramips\/mt7621/.test(board.release?.target || '')) throw new Error('Expected OpenWrt ramips/mt7621; no flash was read');
    await fetch('inventory.txt', 'set -eu; for d in /sys/class/mtd/mtd[0-9]*; do [ -f "$d/type" ] || continue; printf "%s|%s|%s|%s\\n" "${d##*/}" "$(cat "$d/type")" "$(cat "$d/size")" "$(cat "$d/name")"; done');
    const partitions = parsePartitions(fs.readFileSync(path.join(directory, 'inventory.txt'), 'utf8'));
    manifest.partitions = partitions;
    // Reject unsupported devices before collecting any flash images.
    for (const partition of partitions) dumpCommand(partition);
    const disk = fs.statfsSync(directory);
    const required = partitions.reduce((sum, p) => sum + p.size, 0) + 64 * 1024 * 1024;
    if (disk.bavail * disk.bsize < required) throw new Error(`Insufficient local disk space: need at least ${required} bytes`);
    if (partitions.some(p => ['nand', 'mlc-nand'].includes(p.type))) {
      await fetch('nanddump-help.txt', 'command -v nanddump >/dev/null && nanddump --help 2>&1');
      const help = fs.readFileSync(path.join(directory, 'nanddump-help.txt'), 'utf8');
      if (!['--bb', '--omitoob', '--length', 'padbad'].every(flag => help.includes(flag))) {
        throw new Error('nanddump must support --bb=padbad, --omitoob and --length; backup is incomplete');
      }
    }
    await fetch('openwrt-release.txt', 'cat /etc/openwrt_release');
    await fetch('proc-mtd.txt', 'cat /proc/mtd');
    await fetch('mounts.txt', 'cat /proc/mounts');
    await fetch('packages.txt', 'if command -v apk >/dev/null; then apk info; else opkg list-installed; fi');
    await fetch('sysupgrade.tar.gz', 'set -eu; d=$(mktemp -d /tmp/csqtt-backup.XXXXXX); trap \'rm -f "$d/config.tar.gz"; rmdir "$d"\' EXIT HUP INT TERM; sysupgrade -b "$d/config.tar.gz" >/dev/null; cat "$d/config.tar.gz"');
    for (const partition of partitions) {
      console.log(`Reading ${partition.device} (${partition.size} bytes)`);
      const command = dumpCommand(partition);
      const result = await fetch(`${partition.device}.bin`, command);
      // Pipe status is checked by comparing the exact byte count and digest as well.
      await fetch(`${partition.device}.remote-sha256`, `${command} | sha256sum`);
      const remoteHash = fs.readFileSync(path.join(directory, `${partition.device}.remote-sha256`), 'utf8').trim().split(/\s+/)[0];
      verifyImage(result, partition, remoteHash);
      manifest.files.find(f => f.name === `${partition.device}.bin`).verified = true;
      save();
    }
    fs.writeFileSync(path.join(directory, 'SHA256SUMS'), manifest.files.map(f => `${f.sha256}  ${f.name}\n`).join(''));
    manifest.complete = true;
    manifest.finished = new Date().toISOString();
    save();
    console.log('PASS: configuration and all exposed MTD partitions saved and verified. No packages installed.');
  } catch (error) {
    manifest.error = error.message;
    save();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`BACKUP INCOMPLETE: ${error.message}`); process.exitCode = 1; });
}

// CSQTT for MediaTek MT7621 — Сборка APK-пакетов OpenWrt 25.12 (apk v2 формат)
// и IPK-пакетов OpenWrt 24.10 (opkg).
// Собирает шесть пакетов в ../dist:
//   csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk  (pkg csqtt-core-2.1.9)
//   csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk  (pkg csqtt-core-2.5.0, отображается как «2.5.1»)
//   luci-app-csqtt-2.0-openwrt-25.12.apk            (pkg luci-app-csqtt, arch noarch)
//   csqtt-core-2.1.9-openwrt-24.10-mipsel_24kc.ipk  (pkg csqtt-core-2.1.9)
//   csqtt-core-2.5.1-openwrt-24.10-mipsel_24kc.ipk  (pkg csqtt-core-2.5.0, отображается как «2.5.1»)
//   luci-app-csqtt-2.0-openwrt-24.10.ipk            (pkg luci-app-csqtt, arch all)
// Запуск: node luci-app-csqtt/build-package.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const project = path.dirname(base);
const REPO_URL = 'https://github.com/Loraen89/csqtt-owrt-panel-MediaTek-MT7621';

function readBinary(relativePath) {
	const full = path.join(project, relativePath);
	if (!fs.existsSync(full)) throw new Error(`CSQTT MIPS binary is missing: ${relativePath}`);
	const data = fs.readFileSync(full);
	const hashFile = full + '.sha256';
	if (fs.existsSync(hashFile)) {
		const expected = fs.readFileSync(hashFile, 'utf8').trim().split(/\s+/)[0];
		const actual = crypto.createHash('sha256').update(data).digest('hex');
		if (expected && actual !== expected)
			throw new Error(`Hash mismatch for ${relativePath}: ${actual} != ${expected}`);
	}
	return data;
}

function tar(files, checksums = false) {
	const blocks = [];
	function entry(name, data, mode = 0o644, type = '0') {
		const buf = Buffer.from(data), header = Buffer.alloc(512);
		if (Buffer.byteLength(name) > 100)
			throw new Error(`tar path too long: ${name}`);
		header.write(name);
		for (const [offset, size, value] of [[100, 8, mode], [108, 8, 0], [116, 8, 0], [124, 12, buf.length], [136, 12, 1793577600]])
			header.write(value.toString(8).padStart(size - 1, '0') + '\0', offset, size);
		header.fill(32, 148, 156);
		header.write(type, 156);
		header.write('ustar\0', 257);
		header.write('00', 263);
		const sum = header.reduce((total, byte) => total + byte, 0);
		header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
		blocks.push(header, buf, Buffer.alloc((512 - buf.length % 512) % 512));
	}
	if (checksums) {
		const directories = new Set();
		for (const [name] of files) {
			const parts = name.split('/');
			for (let i = 1; i < parts.length; i++)
				directories.add(parts.slice(0, i).join('/'));
		}
		for (const directory of [...directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)))
			entry(directory + '/', Buffer.alloc(0), 0o755, '5');
	}
	for (const [name, data, mode = 0o644, type] of files) {
		if (checksums) {
			const content = 'APK-TOOLS.checksum.SHA1=' + crypto.createHash('sha1').update(data).digest('hex') + '\n';
			let length = Buffer.byteLength(content) + 3;
			while (length !== Buffer.byteLength(content) + String(length).length + 1)
				length = Buffer.byteLength(content) + String(length).length + 1;
			entry('.pax/' + crypto.createHash('sha1').update(name).digest('hex'), `${length} ${content}`, 0o644, 'x');
		}
		entry(name, data, mode, type == null ? '0' : type);
	}
	return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

function buildApk({ pkgname, pkgver, pkgdesc, arch, depends, files, lifecycle, upgradeLifecycle = lifecycle }) {
	const data = zlib.gzipSync(tar(files, true), { level: 9 });
	const datahash = crypto.createHash('sha256').update(data).digest('hex');
	const installedSize = files.reduce((total, file) => total + file[1].length, 0);
	let metadata = `pkgname = ${pkgname}\npkgver = ${pkgver}\npkgdesc = ${pkgdesc}\nurl = ${REPO_URL}\nbuilddate = 1793577600\npackager = Local verified MT7621 build\nsize = ${installedSize}\narch = ${arch}\nlicense = PolyForm-Noncommercial-1.0.0\n`;
	for (const dep of depends) metadata += `depend = ${dep}\n`;
	metadata += `datahash = ${datahash}\n`;
	const controlEntries = [['.PKGINFO', metadata]];
	if (lifecycle) {
		controlEntries.push(['.post-install', lifecycle, 0o755]);
		controlEntries.push(['.post-upgrade', upgradeLifecycle, 0o755]);
	}
	const control = tar(controlEntries);
	return Buffer.concat([
		zlib.gzipSync(control.subarray(0, control.length - 1024), { level: 9 }),
		data,
	]);
}

// --- IPK (opkg, OpenWrt 24.10) ---
// ipk = ar-архив: debian-binary, control.tar.gz, data.tar.gz.
// Путь внутри tar задаётся с префиксом './', как делает ipkg-build.
const IPK_MTIME = 1793577600;

function arHeader(name, size, mode = 0o100644) {
	const header = Buffer.alloc(60);
	header.write(name.padEnd(16, ' '), 0, 16, 'ascii');
	header.write(IPK_MTIME.toString(8).padStart(11, '0') + ' ', 16, 12, 'ascii');
	header.write('0'.padEnd(6, ' '), 28, 6, 'ascii');
	header.write('0'.padEnd(6, ' '), 34, 6, 'ascii');
	header.write(mode.toString(8).padStart(7, '0') + ' ', 40, 8, 'ascii');
	header.write(size.toString(8).padStart(10, '0') + ' ', 48, 10, 'ascii');
	header.write('`\n', 58, 2, 'ascii');
	return header;
}

function ar(members) {
	const blocks = [Buffer.from('!<arch>\n')];
	for (const [name, data, mode] of members) {
		blocks.push(arHeader(name, data.length, mode), data);
		if (data.length % 2) blocks.push(Buffer.from('\n'));
	}
	return Buffer.concat(blocks);
}

function buildIpk({ pkgname, pkgver, pkgdesc, arch, depends, files, postinst, prerm, postrm, conffiles }) {
	const installedSize = files.reduce((total, file) => total + file[1].length, 0);
	let control = `Package: ${pkgname}\n`
		+ `Version: ${pkgver}\n`
		+ `Depends: ${depends.join(', ')}\n`
		+ `Architecture: ${arch}\n`
		+ `Installed-Size: ${installedSize}\n`
		+ `Section: ${pkgname.startsWith('luci-') ? 'luci' : 'net'}\n`
		+ `Priority: optional\n`
		+ `Maintainer: Loraen89\n`
		+ `License: PolyForm-Noncommercial-1.0.0\n`
		+ `Description: ${pkgdesc}\n`;
	const controlMembers = [['./control', Buffer.from(control), 0o644]];
	if (conffiles && conffiles.length) {
		controlMembers.push(['./conffiles', Buffer.from(conffiles.map((name) => '/' + name.replace(/^\.?\//, '')).join('\n') + '\n'), 0o644]);
	}
	for (const [member, text] of [['./postinst', postinst], ['./prerm', prerm], ['./postrm', postrm]]) {
		if (text) controlMembers.push([member, Buffer.from(text.replace(/\r\n?/g, '\n')), 0o755]);
	}
	const controlGz = zlib.gzipSync(tar(controlMembers), { level: 9 });
	const dataFiles = files.map(([name, data, mode]) => ['./' + name, data, mode]);
	const dataGz = zlib.gzipSync(tar([['./', Buffer.alloc(0), 0o755, '5'], ...dataFiles]), { level: 9 });
	return Buffer.concat([ar([
		['debian-binary', Buffer.from('2.0\n'), 0o100644],
		['control.tar.gz', controlGz, 0o100644],
		['data.tar.gz', dataGz, 0o100644],
	])]);
}

// Lifecycle для opkg. opkg upgrade: prerm (старого пакета) -> удаление файлов ->
// распаковка нового -> postinst (нового); postrm выполняется только при полном удалении.
// Аналог apk .post-install (enable на новой установке) и .post-upgrade (сохранение
// включённости): prerm запоминает наличие автозапуска в /var/run, postinst восстанавливает.
const panelPostinst = `#!/bin/sh
autostart=1
if [ -f /var/run/csqtt-autostart-flag ]; then
	state="$(cat /var/run/csqtt-autostart-flag 2>/dev/null)"
	[ "\`printf '%s' "$state" | tr -d '[:space:]'\`" = "1" ] || autostart=0
	rm -f /var/run/csqtt-autostart-flag
fi
if [ "$autostart" = 1 ]; then
	/etc/init.d/csqtt enable >/dev/null 2>&1 || true
fi
rm -rf /tmp/luci-indexcache* 2>/dev/null || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
exit 0
`;
const panelPrerm = `#!/bin/sh
enabled=0
if [ -x /etc/init.d/csqtt ]; then
	for link in /etc/rc.d/*csqtt*; do
		if [ -e "$link" ]; then
			enabled=1
			break
		fi
	done
fi
printf '%d\\n' "$enabled" > /var/run/csqtt-autostart-flag
/etc/init.d/csqtt stop >/dev/null 2>&1 || true
exit 0
`;
const panelPostrm = `#!/bin/sh
rm -f /var/run/csqtt-autostart-flag
exit 0
`;

function walkFiles(directory, prefix, files, skip = new Set()) {
	for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
		const relative = prefix + item.name;
		const full = path.join(directory, item.name);
		if (item.isDirectory()) {
			walkFiles(full, relative + '/', files, skip);
		} else {
			if (skip.has(relative)) continue;
			let mode = 0o644;
			if (relative.startsWith('etc/init.d/') || relative.startsWith('usr/libexec/') && relative.endsWith('.sh')) mode = 0o755;
			if (relative === 'etc/config/csqtt') mode = 0o600;
			let data = fs.readFileSync(full);
			// APK can be assembled on Windows, where the worktree may contain CRLF
			// even though Git stores LF. OpenWrt executes these files directly and
			// interprets a CR in "#!/bin/sh\r" as part of the interpreter path.
			if (relative.startsWith('etc/') || relative.startsWith('usr/share/') || relative.endsWith('.sh') || relative.startsWith('www/'))
				data = Buffer.from(data.toString('utf8').replace(/\r\n?/g, '\n'));
			files.push([relative, data, mode]);
		}
	}
}

const outputDirectory = path.join(project, 'dist');
fs.mkdirSync(outputDirectory, { recursive: true });
const results = [];
function licenseFiles(pkgname) {
	return ['LICENSE', 'NOTICE.md'].map(name => [
		`usr/share/licenses/${pkgname}/${name}`,
		Buffer.from(fs.readFileSync(path.join(project, name), 'utf8').replace(/\r\n?/g, '\n')), 0o644
	]);
}

// --- РЇРґСЂРѕ 2.1.9 ---
const core219 = readBinary('core219/dist/csqtt-core-2.1.9-mt7621-r1-mipsel_24kc');
// --- РЇРґСЂРѕ 2.5.1 (РїР°РєРµС‚ csqtt-core-2.5.0) ---
const core251 = readBinary('core251/dist/csqtt-core-2.5.1-mt7621-r1-mipsel_24kc');

for (const spec of [
	{
		pkgname: 'csqtt-core-2.1.9', pkgver: '2.1.9-r1',
		pkgdesc: 'CSQTT core 2.1.9 (static musl, MIPS32r2 soft-float) for MediaTek MT7621',
		file: 'usr/libexec/csqtt/csqtt-core-2.1.9', data: core219,
		out: 'csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk',
	},
	{
		pkgname: 'csqtt-core-2.5.0', pkgver: '2.5.1-r1',
		pkgdesc: 'CSQTT core 2.5.1 (static musl, MIPS32r2 soft-float) for MediaTek MT7621',
		file: 'usr/libexec/csqtt/csqtt-core-2.5.0', data: core251,
		out: 'csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk',
	},
]) {
	const apk = buildApk({
		pkgname: spec.pkgname,
		pkgver: spec.pkgver,
		pkgdesc: spec.pkgdesc,
		arch: 'mipsel_24kc',
		depends: ['kmod-tun'],
		files: [[spec.file, spec.data, 0o755], ...licenseFiles(spec.pkgname)],
	});
	fs.writeFileSync(path.join(outputDirectory, spec.out), apk);
	results.push({ output: spec.out, bytes: apk.length, sha256: crypto.createHash('sha256').update(apk).digest('hex') });
}

// --- РџР°РЅРµР»СЊ LuCI (arch noarch) ---
const panelFiles = [];
walkFiles(path.join(base, 'package', 'root'), '', panelFiles);
walkFiles(path.join(base, 'package', 'htdocs'), 'www/', panelFiles);
panelFiles.push(...licenseFiles('luci-app-csqtt'));
const panelLifecycle = Buffer.from(`#!/bin/sh
[ -x /etc/init.d/csqtt ] || exit 0
/etc/init.d/csqtt enable >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache 2>/dev/null || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
exit 0
`);
const panelApk = buildApk({
	pkgname: 'luci-app-csqtt',
	pkgver: '2.0-r12',
	pkgdesc: 'CSQTT-PANEL v2.0: LuCI panel for MediaTek MT7621 (CSQTT 2.1.9 / 2.5.1)',
	arch: 'noarch',
	depends: ['luci-base', 'rpcd-mod-ucode', 'ucode-mod-fs', 'ucode-mod-uci', 'curl'],
	files: panelFiles,
	lifecycle: panelLifecycle,
	upgradeLifecycle: Buffer.from(panelLifecycle.toString().replace('/etc/init.d/csqtt enable >/dev/null 2>&1 || true\n', '')),
});
fs.writeFileSync(path.join(outputDirectory, 'luci-app-csqtt-2.0-openwrt-25.12.apk'), panelApk);
results.push({ output: 'luci-app-csqtt-2.0-openwrt-25.12.apk', bytes: panelApk.length, sha256: crypto.createHash('sha256').update(panelApk).digest('hex') });

// --- OpenWrt 24.10: opkg/IPK ---
for (const spec of [
	{
		pkgname: 'csqtt-core-2.1.9', pkgver: '2.1.9-r1',
		pkgdesc: 'CSQTT core 2.1.9 (static musl, MIPS32r2 soft-float) for MediaTek MT7621',
		data: core219,
		file: 'usr/libexec/csqtt/csqtt-core-2.1.9',
		out: 'csqtt-core-2.1.9-openwrt-24.10-mipsel_24kc.ipk',
		arch: 'mipsel_24kc',
	},
	{
		pkgname: 'csqtt-core-2.5.0', pkgver: '2.5.1-r1',
		pkgdesc: 'CSQTT core 2.5.1 (static musl, MIPS32r2 soft-float) for MediaTek MT7621',
		data: core251,
		file: 'usr/libexec/csqtt/csqtt-core-2.5.0',
		out: 'csqtt-core-2.5.1-openwrt-24.10-mipsel_24kc.ipk',
		arch: 'mipsel_24kc',
	},
]) {
	const ipk = buildIpk({
		pkgname: spec.pkgname,
		pkgver: spec.pkgver,
		pkgdesc: spec.pkgdesc,
		arch: spec.arch,
		depends: ['kmod-tun'],
		files: [[spec.file, spec.data, 0o755], ...licenseFiles(spec.pkgname)],
	});
	fs.writeFileSync(path.join(outputDirectory, spec.out), ipk);
	results.push({ output: spec.out, bytes: ipk.length, sha256: crypto.createHash('sha256').update(ipk).digest('hex') });
}

const panelIpk = buildIpk({
	pkgname: 'luci-app-csqtt',
	pkgver: '2.0-r12',
	pkgdesc: 'CSQTT-PANEL v2.0: LuCI panel for MediaTek MT7621 (CSQTT 2.1.9 / 2.5.1)',
	arch: 'all',
	depends: ['luci-base', 'rpcd-mod-ucode', 'ucode-mod-fs', 'ucode-mod-uci', 'curl'],
	files: panelFiles,
	postinst: panelPostinst,
	prerm: panelPrerm,
	postrm: panelPostrm,
	conffiles: ['etc/config/csqtt'],
});
fs.writeFileSync(path.join(outputDirectory, 'luci-app-csqtt-2.0-openwrt-24.10.ipk'), panelIpk);
results.push({ output: 'luci-app-csqtt-2.0-openwrt-24.10.ipk', bytes: panelIpk.length, sha256: crypto.createHash('sha256').update(panelIpk).digest('hex') });

const sums = results.map((r) => `${r.sha256}  ${r.output}`).join('\n') + '\n';
fs.writeFileSync(path.join(outputDirectory, 'SHA256SUMS'), sums);
console.log(JSON.stringify(results, null, 2));

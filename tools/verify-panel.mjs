// verify-panel.mjs — локальная проверка панели: формат двух gzip-потоков,
// arch, datahash, pax-SHA1 всех файлов, соответствие SHA256SUMS.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');
const PANEL = path.join(DIST, 'luci-app-csqtt-2.0-openwrt-25.12.apk');

const apk = fs.readFileSync(PANEL);
console.log('размер:', apk.length, 'магия:', apk.subarray(0, 3).toString('hex'));

// граница второго gzip-потока: ищем заголовок 1f 8b 08 после начала
// надёжнее: распаковать первый поток через zlib с info — узнать consumed
function splitStreams(buf) {
	// кандидаты на начало gzip-потока: байты 1f 8b 08
	const candidates = [];
	for (let i = 0; i < buf.length - 2; i++)
		if (buf[i] === 0x1f && buf[i + 1] === 0x8b && buf[i + 2] === 0x08) candidates.push(i);
	// ищем точку разреза: обе части должны разжиматься
	for (const c of candidates.slice(1)) {
		try { zlib.gunzipSync(buf.subarray(0, c)); } catch { continue; }
		try { zlib.gunzipSync(buf.subarray(c)); } catch { continue; }
		return [buf.subarray(0, c), buf.subarray(c)];
	}
	return [buf]; // единый поток
}

const streams = splitStreams(apk);
console.log('gzip-потоков:', streams.length, streams.map(s => s.length));

if (streams.length !== 2) { console.error('ОЖИДАЛОСЬ 2 ПОТОКА!'); process.exit(1); }

const [controlGz, dataGz] = streams;
const control = zlib.gunzipSync(controlGz);
const data = zlib.gunzipSync(dataGz);
console.log('control tar:', control.length, ' data tar:', data.length);

function members(tar) {
	const out = [];
	let off = 0;
	while (off + 512 <= tar.length) {
		const h = tar.subarray(off, off + 512);
		if (h.every(b => b === 0)) break;
		const name = h.subarray(0, 100).toString().replace(/\0.*$/, '');
		const size = parseInt(h.subarray(124, 136).toString().replace(/[\0 ]/g, ''), 8) || 0;
		const type = String.fromCharCode(h[156]);
		out.push({ name, size, type, dataOff: off + 512 });
		const dataLen = (type === '5') ? 0 : size; // каталоги без данных; '0','x','g' — с данными
		off += 512 + Math.ceil(dataLen / 512) * 512;
	}
	return out;
}

const cm = members(control);
console.log('control члены:', cm.map(m => m.name).join(', '));

const pkginfo = control.subarray(cm[0].dataOff, cm[0].dataOff + cm[0].size).toString();
console.log('--- .PKGINFO ---\n' + pkginfo);
const archLine = pkginfo.match(/^arch = (.+)$/m);
console.log('ARCH:', archLine[1]);
if (archLine[1] !== 'noarch') { console.error('ARCH НЕ noarch!'); process.exit(1); }

// datahash
const declared = pkginfo.match(/^datahash = ([0-9a-f]+)$/m)[1];
const actual = crypto.createHash('sha256').update(dataGz).digest('hex');
console.log('datahash объявлен:', declared);
console.log('datahash фактич. :', actual);
if (declared !== actual) { console.error('DATAHASH НЕ СХОДИТСЯ!'); process.exit(1); }

// pax SHA1 по файлам data-потока
const dm = members(data);
let checked = 0, failed = 0;
let pendingSha1 = null;
for (const m of dm) {
	if (m.name.startsWith('.pax/')) {
		const rec = data.subarray(m.dataOff, m.dataOff + m.size).toString();
		const mm = rec.match(/APK-TOOLS\.checksum\.SHA1=([0-9a-f]+)/);
		pendingSha1 = mm ? mm[1] : null;
		continue;
	}
	if (m.type === '0' || m.type === '\0') {
		const fileData = data.subarray(m.dataOff, m.dataOff + m.size);
		if ((m.name.startsWith('etc/init.d/') || m.name.endsWith('.sh')) && fileData.includes(0x0d)) {
			console.error('CRLF в исполняемом shell-файле:', m.name);
			failed++;
		}
		if (pendingSha1) {
			const h = crypto.createHash('sha1').update(fileData).digest('hex');
			if (h !== pendingSha1) { console.error('SHA1 mismatch:', m.name); failed++; }
			pendingSha1 = null;
		}
		checked++;
	}
}
console.log(`data-файлов: ${checked}, pax-провалов: ${failed}`);
if (failed) process.exit(1);

// SHA256SUMS
const sums = fs.readFileSync(path.join(DIST, 'SHA256SUMS'), 'utf8');
console.log('--- SHA256SUMS (байт ' + Buffer.byteLength(sums) + ', LF: ' + !/\r/.test(sums) + ') ---');
let sumsOk = true;
for (const line of sums.trim().split('\n')) {
	const [hash, name] = line.split(/\s+/);
	const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, name))).digest('hex');
	const ok = h === hash;
	if (!ok) sumsOk = false;
	console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
}
if (!sumsOk) process.exit(1);
const panelUpgrade = cm.find(m => m.name === '.post-upgrade');
if (!panelUpgrade || control.subarray(panelUpgrade.dataOff, panelUpgrade.dataOff + panelUpgrade.size).toString().includes('/etc/init.d/csqtt enable'))
	throw new Error('An upgrade must preserve the existing boot-autostart setting');
for (const [filename, pkgname, corePath, expectedBinary] of [
	['luci-app-csqtt-2.0-openwrt-25.12.apk', 'luci-app-csqtt', null, null],
	['csqtt-core-2.1.9-openwrt-25.12-mipsel_24kc.apk', 'csqtt-core-2.1.9', 'usr/libexec/csqtt/csqtt-core-2.1.9', '../core219/dist/csqtt-core-2.1.9-mt7621-r1-mipsel_24kc'],
	['csqtt-core-2.5.1-openwrt-25.12-mipsel_24kc.apk', 'csqtt-core-2.5.0', 'usr/libexec/csqtt/csqtt-core-2.5.0', '../core251/dist/csqtt-core-2.5.1-mt7621-r1-mipsel_24kc'],
]) {
	const parts = splitStreams(fs.readFileSync(path.join(DIST, filename)));
	if (parts.length !== 2) throw new Error('Invalid APK streams: ' + filename);
	const payload = zlib.gunzipSync(parts[1]);
	const entries = members(payload);
	for (const notice of ['LICENSE', 'NOTICE.md']) {
		const member = entries.find(m => m.name === `usr/share/licenses/${pkgname}/${notice}`);
		if (!member || member.size === 0) throw new Error('Missing license notice in ' + filename);
	}
	if (corePath) {
		const member = entries.find(m => m.name === corePath);
		if (!member || !payload.subarray(member.dataOff, member.dataOff + member.size).equals(fs.readFileSync(path.resolve(HERE, expectedBinary))))
			throw new Error('Core executable changed: ' + filename);
	}
}
console.log('OK   license notices, unchanged core executables and preserved autostart on upgrade');

// IPK (OpenWrt 24.10, opkg): проверяем только если ipk-набор собран.
const ipkNames = [
	'luci-app-csqtt-2.0-openwrt-24.10.ipk',
	'csqtt-core-2.1.9-openwrt-24.10-mipsel_24kc.ipk',
	'csqtt-core-2.5.1-openwrt-24.10-mipsel_24kc.ipk',
];
if (ipkNames.every((name) => fs.existsSync(path.join(DIST, name)))) {
	function parseAr(buf) {
		if (buf.subarray(0, 8).toString() !== '!<arch>\n') throw new Error('Not an ipk (ar): ' + buf.subarray(0, 8).toString('hex'));
		const entries = [];
		let pos = 8;
		while (pos < buf.length) {
			const header = buf.subarray(pos, pos + 60);
			const name = header.subarray(0, 16).toString().trimEnd();
			const size = parseInt(header.subarray(48, 58).toString().trim(), 8);
			entries.push([name, buf.subarray(pos + 60, pos + 60 + size)]);
			pos += 60 + size + (size % 2);
		}
		return entries;
	}
	function tarEntries(buf) {
		const out = [];
		let pos = 0;
		while (pos + 512 <= buf.length) {
			let zero = true;
			for (let i = pos; i < pos + 512; i++) if (buf[i] !== 0) { zero = false; break; }
			if (zero) { pos += 512; continue; }
			const name = buf.subarray(pos, pos + 100).toString().replace(/\0.*$/, '');
			const type = buf.subarray(pos + 156, pos + 157).toString();
			const size = parseInt(buf.subarray(pos + 124, pos + 136).toString().replace(/\0.*$/, '').trim(), 8) || 0;
			const data = buf.subarray(pos + 512, pos + 512 + size);
			pos += 512 + size + ((512 - (size % 512)) % 512);
			out.push([name, type, data]);
		}
		return out;
	}
	for (const [filename, pkgname, corePath, expectedBinary] of [
		['luci-app-csqtt-2.0-openwrt-24.10.ipk', 'luci-app-csqtt', null, null],
		['csqtt-core-2.1.9-openwrt-24.10-mipsel_24kc.ipk', 'csqtt-core-2.1.9', './usr/libexec/csqtt/csqtt-core-2.1.9', '../core219/dist/csqtt-core-2.1.9-mt7621-r1-mipsel_24kc'],
		['csqtt-core-2.5.1-openwrt-24.10-mipsel_24kc.ipk', 'csqtt-core-2.5.0', './usr/libexec/csqtt/csqtt-core-2.5.0', '../core251/dist/csqtt-core-2.5.1-mt7621-r1-mipsel_24kc'],
	]) {
		const arEntries = parseAr(fs.readFileSync(path.join(DIST, filename)));
		const names = arEntries.map(([name]) => name);
		if (names[0] !== 'debian-binary') throw new Error('ipk: first ar member must be debian-binary: ' + filename);
		if (arEntries[0][1].toString() !== '2.0\n') throw new Error('ipk: debian-binary content expected "2.0": ' + filename);
		if (!(names.includes('control.tar.gz') && names.includes('data.tar.gz'))) throw new Error('ipk: missing tar members: ' + filename);
		const control = tarEntries(zlib.gunzipSync(arEntries.find(([n]) => n === 'control.tar.gz')[1]));
		const data = tarEntries(zlib.gunzipSync(arEntries.find(([n]) => n === 'data.tar.gz')[1]));
		const controlField = (field) => {
			const member = control.find(([n]) => n.replace(/^\.\//, '') === 'control');
			const match = member[2].toString().match(new RegExp(`^${field}: (.*)$`, 'm'));
			if (!match) throw new Error(`ipk: control missing ${field}: ${filename}`);
			return match[1];
		};
		if (controlField('Package') !== pkgname) throw new Error('ipk: Package mismatch: ' + filename);
		const arch = controlField('Architecture');
		if (pkgname === 'luci-app-csqtt' ? arch !== 'all' : arch !== 'mipsel_24kc') throw new Error('ipk: Architecture mismatch: ' + filename);
		if (filename === 'luci-app-csqtt-2.0-openwrt-24.10.ipk') {
			const prerm = control.find(([n]) => n.replace(/^\.\//, '') === 'prerm');
			const postinst = control.find(([n]) => n.replace(/^\.\//, '') === 'postinst');
			if (!prerm || !postinst) throw new Error('ipk: panel must ship prerm and postinst');
			const conffiles = control.find(([n]) => n.replace(/^\.\//, '') === 'conffiles');
			if (!conffiles || !conffiles[2].toString().includes('/etc/config/csqtt'))
				throw new Error('ipk: panel must declare /etc/config/csqtt as conffile');
			for (const script of [postinst, prerm]) {
				const text = script[2].toString();
				if (!/^#!\/bin\/sh/.test(text)) throw new Error('ipk: lifecycle script must start with #!/bin/sh');
			}
		}
		for (const notice of ['LICENSE', 'NOTICE.md']) {
			const member = data.find(([n]) => n.replace(/^\.\//, '') === `usr/share/licenses/${pkgname}/${notice}`);
			if (!member || member[2].length === 0) throw new Error('ipk: missing license notice in ' + filename);
		}
		if (corePath) {
			const member = data.find(([n]) => n.replace(/^\.\//, '') === corePath.replace(/^\.\//, ''));
			if (!member || !member[2].equals(fs.readFileSync(path.resolve(HERE, expectedBinary))))
				throw new Error('ipk: core executable missing or changed: ' + filename);
		}
	}
	console.log('OK   ipk: ar structure, control fields, conffiles, lifecycle scripts, licenses, unchanged core executables');
}
console.log('ПАКЕТ_ВАЛИДЕН');

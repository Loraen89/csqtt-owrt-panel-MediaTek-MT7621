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
console.log('ПАКЕТ_ВАЛИДЕН');

// Общая SSH-библиотека для работы с роутером (root, пустой пароль).
import { Client } from 'ssh2';
import fs from 'node:fs';

export let HOST = process.env.ROUTER_HOST || '192.168.5.1';
export function setHost(h) { HOST = h; }

export function connect(timeoutMs = 20000) {
	return new Promise((resolve, reject) => {
		const conn = new Client();
		const timer = setTimeout(() => { conn.end(); reject(new Error('timeout')); }, timeoutMs);
		conn.on('ready', () => { clearTimeout(timer); resolve(conn); });
		conn.on('keyboard-interactive', (n, i, l, prompts, finish) => finish(prompts.map(() => '')));
		conn.on('error', (e) => { clearTimeout(timer); reject(e); });
		conn.connect({ host: HOST, port: 22, username: 'root', password: '', tryKeyboard: true });
	});
}

export function exec(conn, command, timeoutMs = 120000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`exec timeout: ${command.slice(0, 60)}`)), timeoutMs);
		conn.exec(command, (err, stream) => {
			if (err) { clearTimeout(timer); return reject(err); }
			let stdout = '', stderr = '';
			stream.on('data', (d) => { stdout += d; });
			stream.stderr.on('data', (d) => { stderr += d; });
			stream.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
		});
	});
}

// Передача файлов через exec-канал + base64 (Dropbear на OpenWrt не имеет SFTP).
export function upload(conn, local, remote) {
	return new Promise((resolve, reject) => {
		const data = fs.readFileSync(local);
		const b64 = data.toString('base64');
		conn.exec(`base64 -d > ${remote}`, (err, stream) => {
			if (err) return reject(err);
			let stderr = '';
			stream.stderr.on('data', (d) => { stderr += d; });
			stream.on('close', (code) => {
				if (code !== 0) return reject(new Error(`upload rc=${code}: ${stderr}`));
				resolve({ bytes: data.length, size: data.length });
			});
			// Пишем кусками, чтобы не забить буфер
			const chunk = 256 * 1024;
			let off = 0;
			(function pump() {
				while (off < b64.length) {
					const part = b64.slice(off, off + chunk);
					off += chunk;
					if (!stream.write(part)) { stream.once('drain', pump); return; }
				}
				stream.end();
			})();
		});
	});
}

export function download(conn, remote, local) {
	return new Promise((resolve, reject) => {
		conn.exec(`cat ${remote} | base64`, (err, stream) => {
			if (err) return reject(err);
			const chunks = [];
			stream.on('data', (d) => chunks.push(d));
			stream.on('close', (code) => {
				if (code !== 0) return reject(new Error(`download rc=${code}`));
				const buf = Buffer.from(Buffer.concat(chunks).toString('utf8').replace(/\s+/g, ''), 'base64');
				fs.writeFileSync(local, buf);
				resolve({ bytes: buf.length });
			});
		});
	});
}

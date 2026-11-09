// finish9.mjs — панель + конфиг csqtt + запуск всей цепочки.
import { connect, exec, setHost } from './router-lib.mjs';
import fs from 'node:fs';

const KEEP = 'D:\\mt7621-emu\\backups\\keep';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '<GITHUB_TOKEN>';
setHost('192.168.5.1');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withConn(fn, tries = 5) {
	for (let i = 1; i <= tries; i++) {
		let c;
		try { c = await connect(10000); const out = await fn(c); try { c.end(); } catch {}; return out; }
		catch (e) { try { c && c.end(); } catch {}; console.log(`(попытка ${i}: ${e.message})`); await sleep(4000); }
	}
	throw new Error('нет связи');
}
function heredoc(path, content) {
	const body = content.replace(/\r\n/g, '\n').replace(/\n+$/, '');
	return `cat > ${path} << 'CSQTT_EOF'\n${body}\nCSQTT_EOF\n`;
}

// 1. Панель (при остановленном clash, чтобы DNS работал)
console.log('=== установка панели ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'/etc/init.d/clash stop 2>&1 | tail -1; sleep 2',
		'ping -c1 -W4 api.github.com 2>&1 | tail -1',
		'rm -rf /tmp/csqtt-install',
		`GITHUB_TOKEN=${GITHUB_TOKEN} ash /tmp/ifg.sh --core both 2>&1 | tail -12`,
	].join('\n'), 600000);
	return r.stdout + r.stderr;
}));

// 2. Восстановление конфига csqtt
console.log('=== конфиг csqtt ===');
console.log(await withConn(async (c) => {
	const content = fs.readFileSync(`${KEEP}\\csqtt`, 'utf8');
	const r = await exec(c, heredoc('/etc/config/csqtt', content) + 'chmod 600 /etc/config/csqtt\nuci show csqtt | head -6\nuci get csqtt.main.active_profile\nuci get csqtt.prof_lv_velopit_ru.peer', 60000);
	return r.stdout + r.stderr;
}));

// 3. Запуск csqtt
console.log('=== запуск csqtt ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'/etc/init.d/csqtt enable 2>&1 | tail -1',
		'/etc/init.d/csqtt start 2>&1 | tail -2',
		'sleep 12',
		'/etc/init.d/csqtt status 2>&1 | head -3',
		'ps | grep -v grep | grep csqtt | head -3',
		'ip link show csqtt0 2>&1 | head -2',
		'netstat -lnt 2>/dev/null | grep 9000',
		'logread | grep -i csqtt | tail -8',
		'tail -5 /var/log/csqtt.log 2>/dev/null',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));

// 4. Запуск clash и проверка цепочки
console.log('=== запуск clash + проверка ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'/etc/init.d/clash start 2>&1 | tail -1',
		'sleep 10',
		'pidof clash >/dev/null && echo clash_alive',
		'echo "--- DNS через цепочку ---"; nslookup google.com 127.0.0.1 2>&1 | tail -3',
		'echo "--- API Main Proxy ---"; curl -s --max-time 5 "http://127.0.0.1:9090/proxies/Main%20Proxy" | head -c 300; echo',
		'echo "--- CSQTT proxy ---"; curl -s --max-time 5 "http://127.0.0.1:9090/proxies/CSQTT" | head -c 200; echo',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ГОТОВО_ФИНИШ9');

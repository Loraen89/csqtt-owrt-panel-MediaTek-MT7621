// diag-csqtt2.mjs — статус туннеля через ubus-панель + полный event-лог.
import { connect, exec, setHost } from './router-lib.mjs';
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
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'echo "=== методы ubus csqtt ==="; ubus -v list csqtt 2>&1 | head -20',
		'echo "=== события без шума ==="; logread | grep "run-core" | grep -vE "DTLS-хендшейк|STATS" | tail -25',
		'echo "=== процесс ядра ==="; ps | grep -v grep | grep csqtt-core',
		'echo "=== uptime процесса/рестарты ==="; logread | grep -c "run-core" ; logread | grep -iE "reconnect|restart|join|call|vk|captcha|error|fail" | grep -i csqtt | tail -10',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_CSQTT2_ОК');

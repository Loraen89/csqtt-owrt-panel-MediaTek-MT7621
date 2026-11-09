// back-251.mjs — вернуть ядро 2.5.1, ubus-статус, полный лог с рестарта.
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
		"uci set csqtt.main.core_version='2.5.1' && uci commit csqtt",
		'/etc/init.d/csqtt restart',
		'echo "--- жду 25 сек ---"',
		'sleep 25',
		'echo "=== процесс ==="; ps | grep -v grep | grep csqtt-core | head -1 | cut -c1-100',
		'echo "=== ubus методы ==="; ubus -v list csqtt 2>&1 | head -25',
		'echo "=== лог с рестарта (без шума) ==="; logread | grep "run-core" | grep -viE "DTLS-хендшейк успешен|TURN" | tail -20',
		'echo "=== csqtt0 ==="; ip -4 addr show csqtt0 2>&1 | head -3',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('НАЗАД_251_ОК');

// try-219.mjs — переключение на ядро 2.1.9 и наблюдение за установлением туннеля.
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

console.log('=== cmdline текущего ядра ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, "cat /proc/$(pidof csqtt-core-2.5.0)/cmdline 2>/dev/null | tr '\\0' ' '; echo", 30000);
	return r.stdout;
}));

console.log('=== переключаю на 2.1.9 ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		"uci set csqtt.main.core_version='2.1.9' && uci commit csqtt",
		'/etc/init.d/csqtt restart',
		'sleep 20',
		'ps | grep -v grep | grep csqtt-core | head -2',
		'ip -4 addr show csqtt0 2>&1 | head -3',
		'logread | grep "run-core" | grep -viE "DTLS|STATS|TURN" | tail -15',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));

console.log('=== проверка ноги clash ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'sleep 10',
		'curl -s --max-time 14 "http://127.0.0.1:9090/proxies/CSQTT/delay?url=https://www.gstatic.com/generate_204&timeout=10000" | head -c 120; echo',
		'nslookup google.com 127.0.0.1 2>&1 | tail -2',
		'logread | grep "run-core" | grep -viE "TURN" | tail -12',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ТРАЙ219_ОК');

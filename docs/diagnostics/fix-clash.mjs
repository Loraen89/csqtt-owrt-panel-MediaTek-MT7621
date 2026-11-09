// fix-clash.mjs — вернуть clash в enabled+running, проверить csqtt0 и цепочку.
import { connect, exec, setHost } from './router-lib.mjs';
setHost('192.168.5.1');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withConn(fn, tries = 4) {
	for (let i = 1; i <= tries; i++) {
		let c;
		try { c = await connect(10000); const out = await fn(c); try { c.end(); } catch {}; return out; }
		catch (e) { try { c && c.end(); } catch {}; console.log(`(попытка ${i}: ${e.message})`); await sleep(4000); }
	}
	throw new Error('нет связи');
}

console.log('=== состояние csqtt0 и сервиса ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'ip link show csqtt0 2>&1 | head -2',
		'ip -4 addr show csqtt0 2>&1 | head -3',
		'/etc/init.d/csqtt status 2>&1 | head -1',
		'logread | grep "run-core" | grep -vcE "DTLS|STATS" | head -1',
		'logread | grep "run-core" | grep -vE "DTLS-хендшейк успешен|STATS" | tail -6',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));

console.log('=== включаю и запускаю clash ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'/etc/init.d/clash enable 2>&1 | tail -1',
		'/etc/init.d/clash start 2>&1 | tail -1',
		'sleep 12',
		'pidof clash >/dev/null && echo clash_alive || echo "CLASH НЕ ПОДНЯЛСЯ"',
		'curl -s --max-time 5 "http://127.0.0.1:9090/proxies/Main%20Proxy" | grep -oE "\\"(now|alive)\\":(\\"[^\\"]*\\"|true|false)" | head -2',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));

console.log('=== проверка ноги CSQTT (вдруг сервер ожил?) ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'curl -s --max-time 14 "http://127.0.0.1:9090/proxies/CSQTT/delay?url=https://www.gstatic.com/generate_204&timeout=10000" | head -c 120; echo',
		'ip -4 addr show csqtt0 2>/dev/null | grep inet || echo "IPv4 на csqtt0 нет"',
		'logread | grep -E "ТУННЕЛЬ|Tunnel IP" | tail -2',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ФИКС_CLASH_ОК');

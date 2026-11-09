// restore-251.mjs — убрать тест 2.1.9, вернуть сервис 2.5.1, глянуть бутстрап-последовательность.
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

console.log('=== убираю тест, возвращаю сервис ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'kill $(pidof csqtt-core-2.1.9) 2>/dev/null; sleep 2',
		'pidof csqtt-core-2.1.9 && echo "ещё жив" || echo "2.1.9 убит"',
		'ip link del csqtt0 2>/dev/null; rm -f /tmp/c219.log',
		'/etc/init.d/csqtt start 2>&1 | tail -1',
		'sleep 8',
		'pidof csqtt-core-2.5.0 >/dev/null && echo "сервис 2.5.1 запущен" || echo "СЕРВИС НЕ ПОДНЯЛСЯ"',
		'ip link show csqtt0 >/dev/null 2>&1 && echo csqtt0_UP',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));

console.log('=== бутстрап: как ядро контактирует с peer lv.velopit.ru ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		// ищем в кольцевом буфере строки о peer/вызове/bootstrap за всё время
		'logread | grep -iE "velopit|bootstrap|join|call|vk.ru|peer|сигнал|комнат" | grep -v "CSQTT_EVENT" | tail -20',
		'echo "--- прямой прогрев peer: UDP 46000 достижим? ---"',
		'(echo -n "x" | nc -u -w3 lv.velopit.ru 46000) 2>&1 | head -2; echo "nc udp rc=$?"',
		'nslookup lv.velopit.ru 2>&1 | tail -3',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ВОССТАНОВЛЕНИЕ_ОК');

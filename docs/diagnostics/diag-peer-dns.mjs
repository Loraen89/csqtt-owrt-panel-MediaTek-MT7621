// diag-peer-dns.mjs — резолв lv.velopit.ru напрямую (минуя битую DNS-цепочку).
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
		'echo "=== через Яндекс напрямую ==="; nslookup lv.velopit.ru 77.88.8.8 2>&1 | tail -4',
		'echo "=== через Google напрямую ==="; nslookup lv.velopit.ru 8.8.8.8 2>&1 | tail -4',
		'echo "=== через апстрим-провайдер ==="; nslookup lv.velopit.ru 192.168.0.1 2>&1 | tail -4',
		'echo "=== сам домен velopit.ru ==="; nslookup velopit.ru 77.88.8.8 2>&1 | tail -4',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_PEER_DNS_ОК');

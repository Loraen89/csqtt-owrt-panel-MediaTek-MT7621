// diag-dns2.mjs — состояние прокси-провайдера и API clash.
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
		'echo "=== proxy_providers ==="; ls -la /opt/clash/proxy_providers/ 2>/dev/null; wc -c /opt/clash/proxy_providers/* 2>/dev/null; head -5 /opt/clash/proxy_providers/lastdep.yaml 2>/dev/null',
		'echo "=== порты clash ==="; netstat -lnt 2>/dev/null | grep -E "9090|7890|7891|7892|7894" | head -6',
		'echo "=== external-controller ==="; grep -E "external|secret|tproxy|mixed-port|port:" /opt/clash/config.yaml | head -10',
		'echo "=== API proxies (кратко) ==="; curl -s --max-time 5 "http://127.0.0.1:9090/proxies" 2>&1 | head -c 400; echo',
		'echo "=== тест DoH 77.88.8.8 ==="; curl -s --max-time 8 "https://77.88.8.8/dns-query?name=google.com&type=A" -H "accept: application/dns-json" 2>&1 | head -c 200; echo',
		'echo "=== резолв подписки напрямую ==="; nslookup sub.vpnburger.ru 77.88.8.8 2>&1 | tail -3',
		'echo "=== logread провайдеры ==="; logread | grep -iE "provider|burger|proxy" | tail -6',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_DNS2_ОК');

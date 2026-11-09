// diag-clash-groups.mjs — состояние групп clash, живость членов, провайдер подписки.
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
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'curl -s --max-time 5 http://127.0.0.1:9090/proxies -o /tmp/px.json; wc -c /tmp/px.json',
		'echo "=== Main Proxy ==="; grep -oE "\\"Main Proxy\\".{0,400}" /tmp/px.json | head -c 500; echo',
		'echo "=== Sub Proxy (now/alive) ==="; grep -oE "\\"Sub Proxy\\".{0,200}" /tmp/px.json | head -c 300; echo',
		'echo "=== считаем живых ==="; grep -oE "\\"alive\\":true" /tmp/px.json | wc -l; grep -oE "\\"alive\\":false" /tmp/px.json | wc -l',
		'echo "=== провайдер ==="; ls -la /opt/clash/proxy_providers/ 2>/dev/null; head -3 /opt/clash/proxy_providers/lastdep.yaml 2>/dev/null',
		'echo "=== delay Sub Proxy ==="; curl -s --max-time 12 "http://127.0.0.1:9090/proxies/Sub%20Proxy/delay?url=https://www.gstatic.com/generate_204&timeout=8000" | head -c 100; echo',
		'echo "=== members Sub Proxy ==="; curl -s --max-time 5 "http://127.0.0.1:9090/proxies/Sub%20Proxy" | grep -oE "\\"now\\":\\"[^\\"]*\\""',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_ГРУППЫ_ОК');

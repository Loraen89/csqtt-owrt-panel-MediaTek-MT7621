// diag-subproxy.mjs — члены Sub Proxy и их реальная живость (delay-тесты).
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
// список членов Sub Proxy
const membersRaw = await withConn(async (c) => {
	const r = await exec(c, `curl -s --max-time 5 "http://127.0.0.1:9090/proxies/Sub%20Proxy" | tr ',' '\\n' | grep -A30 '"all"' | grep -oE '"[^"]{2,60}"' | head -25`, 60000);
	return r.stdout;
});
console.log('члены Sub Proxy:', membersRaw);
const members = [...membersRaw.matchAll(/"([^"]{2,60})"/g)].map(m => m[1]).filter(n => !['all'].includes(n));

for (const name of members.slice(0, 12)) {
	const enc = encodeURIComponent(name);
	const res = await withConn(async (c) => {
		const r = await exec(c, `curl -s --max-time 10 "http://127.0.0.1:9090/proxies/${enc}/delay?url=https://www.gstatic.com/generate_204&timeout=6000" | head -c 80`, 30000);
		return r.stdout.trim();
	});
	console.log(`${res.padEnd(30)} ${name}`);
}
console.log('ДИАГ_САБПРОКСИ_ОК');

// diag-dns3.mjs — какие группы есть, что выбрано в Main Proxy, живы ли члены.
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
		'curl -s --max-time 5 "http://127.0.0.1:9090/proxies" -o /tmp/prox.json; wc -c /tmp/prox.json',
		// имена групп и текущий выбор
		'grep -oE "\\"(name|now|type)\\":\\"[^\\"]*\\"" /tmp/prox.json | head -60',
	].join('\n'), 60000);
	return r.stdout + r.stderr;
}));
console.log('---');
console.log(await withConn(async (c) => {
	// ucode есть на роутере — распарсим аккуратно
	const r = await exec(c, `ucode -e '
import * as fs from "fs";
import * as json from "json";
const j = json.parse(fs.read("all", "/tmp/prox.json"));
for (let name in j.proxies) {
  const p = j.proxies[name];
  if (p.type == "Selector" || p.type == "URLTest" || p.type == "Fallback" || p.type == "LoadBalance") {
    printf("ГРУППА %-22s тип=%-9s выбран=%s (живых опций: ", name, p.type, p.now);
    let alive = 0;
    for (let o in p.all) { const q = j.proxies[o]; if (q && q.alive) alive++; }
    printf("%d/%d)\\n", alive, length(p.all));
  }
}
' 2>&1 | head -30`, 60000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_DNS3_ОК');

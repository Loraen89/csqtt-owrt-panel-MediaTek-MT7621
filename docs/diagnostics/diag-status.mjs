// diag-status.mjs — /var/run/csqtt/status.json + лог ядра.
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
		'echo "=== status.json ==="; cat /var/run/csqtt/status.json 2>/dev/null || echo "нет файла"; ls -la /var/run/csqtt/ 2>/dev/null',
		'echo "=== лог ядра ==="; ls -la /var/log/csqtt.log 2>/dev/null; tail -30 /var/log/csqtt.log 2>/dev/null',
		'echo "=== все типы событий ==="; logread | grep -oE "CSQTT_EVENT__\\|[A-Z_]+" | sort | uniq -c',
		'echo "=== дата на роутере ==="; date',
		'echo "=== порт 9000 ещё раз ==="; netstat -lnt 2>/dev/null | grep 9000 || echo "9000 не слушается"',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_СТАТУС_ОК');

// diag-mid.mjs — окно лога вокруг DTLS-успеха из середины журнала.
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
		// вторая половина: взять DTLS-успех ~на 60% файла и показать 45 строк после
		'L=$(grep -n "DTLS-.*успешен" /tmp/core.log | awk -F: "NR==int(NR*0.6)+1 {print \\$1}"); echo "окно от строки $L"; [ -n "$L" ] && tail -n +$L /tmp/core.log | grep -v STATS | head -45',
		'echo "=== счётчик типов сообщений (без STATS) ==="; grep -v STATS /tmp/core.log | grep -oE "run-core.sh\\[[0-9]+\\]: .{0,45}" | sort | uniq -c | sort -rn | head -25',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_МИД_ОК');

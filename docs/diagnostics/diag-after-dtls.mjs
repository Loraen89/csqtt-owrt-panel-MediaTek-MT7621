// diag-after-dtls.mjs — полный лог ядра после последнего успешного DTLS, без фильтров.
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
		// последний успешный DTLS и 40 строк после него
		'logread | grep "run-core" > /tmp/core.log; wc -l /tmp/core.log',
		'L=$(grep -n "DTLS-.*успешен" /tmp/core.log | tail -1 | cut -d: -f1); echo "last DTLS ok at line $L"; tail -n +$L /tmp/core.log | head -50',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_ПОСЛЕ_DTLS_ОК');

// diag-captcha.mjs — состояние туннеля: капча? ошибки? события.
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
		'echo "=== события CSQTT ==="; logread | grep "CSQTT_EVENT" | grep -vE "STATS" | tail -15',
		'echo "=== капча/ошибки в логе ==="; grep -iE "captcha|error|fail|vk" /var/log/csqtt.log 2>/dev/null | tail -10',
		'echo "=== статус из панели (ubus) ==="; ubus list 2>/dev/null | grep -i csqtt; ubus call csqtt status 2>/dev/null | head -20',
		'echo "=== трафик на csqtt0 ==="; ip -s link show csqtt0 2>/dev/null | tail -4',
		'echo "=== e2e: https через цепочку с роутера ==="; curl -s --max-time 10 -o /dev/null -w "gstatic: %{http_code} %{time_total}s\\n" https://www.gstatic.com/generate_204; curl -s --max-time 10 https://api.ipify.org 2>&1 | head -c 50; echo " <- ip через цепочку"',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_CAPTCHA_ОК');

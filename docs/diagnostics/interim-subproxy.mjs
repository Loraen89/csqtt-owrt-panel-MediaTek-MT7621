// interim-subproxy.mjs — временно переключить Main Proxy на Sub Proxy (живой),
// чтобы LAN/DNS работали, пока CSQTT ждёт сервер. Конфиг clash не меняется (runtime-выбор).
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
		'echo "--- переключаю Main Proxy ---"',
		`curl -s --max-time 5 -X PUT -H "Content-Type: application/json" -d '{"name":"Sub Proxy"}' http://127.0.0.1:9090/proxies/Main%20Proxy -w "http=%{http_code}\\n" -o /dev/null`,
		'sleep 2',
		'curl -s --max-time 5 "http://127.0.0.1:9090/proxies/Main%20Proxy" | grep -oE "\\"now\\":\\"[^\\"]*\\""',
		'echo "--- DNS через цепочку ---"',
		'nslookup google.com 127.0.0.1 2>&1 | tail -3',
		'nslookup lv.velopit.ru 127.0.0.1 2>&1 | tail -3',
		'echo "--- e2e с роутера ---"',
		'curl -s --max-time 10 -o /dev/null -w "gstatic=%{http_code} " https://www.gstatic.com/generate_204; curl -s --max-time 10 https://api.ipify.org; echo " <- внешний IP"',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ИНТЕРИМ_ОК');

// diag-csqtt-leg.mjs — как clash ходит в CSQTT, состояние туннеля и панели.
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
		'echo "=== proxies в конфиге ==="; grep -B2 -A12 "^proxies:" /opt/clash/config.yaml | head -40',
		'echo "=== csqtt0 адреса ==="; ip addr show csqtt0 2>&1; ip route show dev csqtt0 2>/dev/null | head -5',
		'echo "=== порт 9000 ==="; netstat -lntup 2>/dev/null | grep -E "9000|csqtt" | head -4',
		'echo "=== лог ядра ==="; wc -c /var/log/csqtt.log 2>/dev/null; tail -20 /var/log/csqtt.log 2>/dev/null',
		'echo "=== ubus csqtt ==="; ubus list | grep -i csqtt; ls /usr/share/rpcd/ucode/ 2>/dev/null | grep -i csqtt',
		'echo "=== delay к ya.ru через CSQTT ==="; curl -s --max-time 14 "http://127.0.0.1:9090/proxies/CSQTT/delay?url=https://ya.ru&timeout=10000" | head -c 120; echo',
		'echo "=== delay к cloudflare через CSQTT ==="; curl -s --max-time 14 "http://127.0.0.1:9090/proxies/CSQTT/delay?url=http://cp.cloudflare.com/generate_204&timeout=10000" | head -c 120; echo',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_НОГА_ОК');

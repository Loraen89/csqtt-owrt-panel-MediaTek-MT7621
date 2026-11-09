// finish10.mjs — финальная выверка: прогрев туннеля, e2e DNS, статусы сервисов.
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

console.log('=== прогрев 30 сек ===');
await sleep(30000);

console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'echo "--- delay-тест CSQTT через API ---"; curl -s --max-time 12 "http://127.0.0.1:9090/proxies/CSQTT/delay?url=https://www.gstatic.com/generate_204&timeout=8000" | head -c 200; echo',
		'echo "--- Main Proxy now ---"; curl -s --max-time 5 "http://127.0.0.1:9090/proxies/Main%20Proxy" | grep -oE "\\"now\\":\\"[^\\"]*\\""',
		'echo "--- DNS ---"; nslookup ya.ru 127.0.0.1 2>&1 | tail -3',
		'echo "--- трафик через туннель (STATS) ---"; logread | grep "CSQTT_EVENT__|STATS" | tail -2',
		'echo "--- сервисы ---"; for s in csqtt clash ttyd; do /etc/init.d/$s enabled 2>/dev/null && echo "$s enabled" || echo "$s DISABLED"; done',
		'echo "--- процессы ---"; pidof clash >/dev/null && echo clash_alive; pidof ttyd >/dev/null && echo ttyd_alive; ps | grep -v grep | grep csqtt-core | wc -l',
		'echo "--- версия ядра ---"; uci get csqtt.main.core_version 2>/dev/null || echo "default (2.5.1)"',
		'echo "--- LuCI csqtt view ---"; ls /www/luci-static/resources/view/csqtt/ | tr "\n" " "; echo',
		'echo "--- rpcd acl ---"; ls /usr/share/rpcd/acl.d/ | grep -i csqtt',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ФИНИШ10_ОК');

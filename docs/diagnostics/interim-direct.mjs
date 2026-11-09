// interim-direct.mjs — остановить clash, вернуть dnsmasq на прямой DNS (WAN),
// чтобы LAN имел рабочий интернет, пока оба прокси-пути мертвы.
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
		'/etc/init.d/clash stop 2>&1 | tail -1',
		'/etc/init.d/clash disable 2>&1 | tail -1',
		'sleep 4',
		'echo "=== dnsmasq upstream ==="; cat /tmp/resolv.conf.d/resolv.conf.auto 2>/dev/null | head -3; uci get dhcp.@dnsmasq[0].server 2>/dev/null || echo "(server не задан — по умолчанию WAN)"',
		'echo "=== процессы ==="; pidof clash >/dev/null && echo "clash ЕЩЁ ЖИВ" || echo clash_stopped; pidof dnsmasq >/dev/null && echo dnsmasq_ok; pidof csqtt-core-2.5.0 >/dev/null && echo csqtt_ok',
		'echo "=== DNS ==="; nslookup google.com 127.0.0.1 2>&1 | tail -3',
		'echo "=== e2e ==="; curl -s --max-time 10 -o /dev/null -w "gstatic=%{http_code} " https://www.gstatic.com/generate_204; curl -s --max-time 10 https://api.ipify.org; echo " <- внешний IP (должен быть IP провайдера)"',
		'echo "=== csqtt жив и ретраит ==="; logread | grep "run-core" | tail -2 | cut -c1-110',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ИНТЕРИМ_DIRECT_ОК');

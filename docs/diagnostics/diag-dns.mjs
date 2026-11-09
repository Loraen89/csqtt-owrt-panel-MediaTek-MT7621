// diag-dns.mjs — почему под clash SERVFAIL.
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
		'echo "=== pidof clash ==="; pidof clash',
		'echo "=== dnsmasq процесс ==="; ps | grep -v grep | grep dnsmasq | head -2',
		'echo "=== dnsmasq upstream ==="; cat /tmp/resolv.conf.d/resolv.conf.auto 2>/dev/null; uci get dhcp.@dnsmasq[0].server 2>/dev/null; uci get dhcp.@dnsmasq[0].noresolv 2>/dev/null',
		'echo "=== кто слушает 53/7874 ==="; netstat -lnup 2>/dev/null | grep -E ":53 |:7874|:1053" | head -6',
		'echo "=== DNS секция конфига ==="; grep -A22 "^dns:" /opt/clash/config.yaml',
		'echo "=== прямой запрос к clash DNS (7874) ==="; nslookup google.com 127.0.0.1:7874 2>&1 | tail -4',
		'echo "=== прямой запрос к Яндексу ==="; nslookup google.com 77.88.8.8 2>&1 | tail -4',
		'echo "=== через dnsmasq (53) ==="; nslookup google.com 127.0.0.1 2>&1 | tail -4',
		'echo "=== logread dns ==="; logread | grep -iE "dnsmasq\\[|clash\\[" | tail -8',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_DNS_ОК');

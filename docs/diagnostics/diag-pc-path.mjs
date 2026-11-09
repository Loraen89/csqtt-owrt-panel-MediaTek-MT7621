// diag-pc-path.mjs — почему LAN-клиент не выходит в интернет после остановки clash.
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
		'echo "=== tproxy остатки в nft ==="; nft list ruleset 2>/dev/null | grep -iE "tproxy|7894|7892" | head -10 || echo "чисто"',
		'echo "=== ip rule ==="; ip rule list | head -8',
		'echo "=== NAT маскарад WAN ==="; nft list table inet nat 2>/dev/null | grep -iE "masquerade" | head -4; nft list ruleset 2>/dev/null | grep -c masquerade',
		'echo "=== forwarding ==="; sysctl net.ipv4.ip_forward',
		'echo "=== ping ПК с роутера ==="; ping -c2 -W3 192.168.5.109 2>&1 | tail -2',
		'echo "=== пинг наружу с роутера ==="; ping -c2 -W3 77.88.8.8 2>&1 | tail -2',
		'echo "=== остатки процессов clash ==="; pidof clash || echo "clash мёртв"',
		'echo "=== таблица маршрутов ==="; ip route | head -6',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_PC_ПУТЬ_ОК');

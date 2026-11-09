// probe-state.mjs — сверка текущего состояния роутера с целевым.
import { connect, exec, setHost } from './router-lib.mjs';
setHost('192.168.5.1');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withConn(fn, tries = 4) {
	for (let i = 1; i <= tries; i++) {
		let c;
		try { c = await connect(10000); const out = await fn(c); try { c.end(); } catch {}; return out; }
		catch (e) { try { c && c.end(); } catch {}; console.log(`(попытка ${i}: ${e.message})`); await sleep(4000); }
	}
	throw new Error('нет связи с роутером');
}
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'echo "=== прошивка ==="; grep DISTRIB_DESCRIPTION /etc/openwrt_release; uptime | cut -d, -f1',
		'echo "=== пакеты csqtt/ssclash/ttyd ==="; apk info 2>/dev/null | grep -iE "csqtt|ssclash|ttyd" || echo "НЕТ"',
		'echo "=== сервисы ==="; for s in csqtt clash ttyd; do E=$(/etc/init.d/$s enabled 2>/dev/null && echo on || echo off); R=$(pidof ${s/ttyd/ttyd} >/dev/null 2>&1 && echo run || echo -); echo "$s:$E"; done',
		'echo "=== процессы ядер ==="; pidof csqtt-core-2.5.0 >/dev/null && echo core2.5_run; pidof csqtt-core-2.1.9 >/dev/null && echo core2.1_run; pidof clash >/dev/null && echo clash_run; pidof ttyd >/dev/null && echo ttyd_run',
		'echo "=== сеть ==="; uci get network.lan.ipaddr 2>/dev/null; ip -4 addr show br-lan 2>/dev/null | grep inet; pidof hostapd >/dev/null && echo wifi_up',
		'echo "=== csqtt0 ==="; ip -4 addr show csqtt0 2>/dev/null | grep -E "inet |csqtt0" | head -2 || echo "нет csqtt0"',
		'echo "=== конфиг csqtt ==="; uci get csqtt.main.active_profile 2>/dev/null; uci get csqtt.prof_lv_velopit_ru.peer 2>/dev/null',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ПРОБА_ОК');

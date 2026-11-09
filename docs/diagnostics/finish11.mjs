// finish11.mjs — уборка /tmp + финальная проверка всего.
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

console.log('=== уборка /tmp ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'ls -la /tmp/*.bin /tmp/*.gz /tmp/*.apk /tmp/ifg.sh 2>/dev/null',
		'rm -rf /tmp/sysupgrade.bin /tmp/mihomo.gz /tmp/ssclash.apk /tmp/keep-net.tar.gz /tmp/ifg.sh /tmp/csqtt-install /tmp/prox.json /tmp/panel-noarch.apk',
		'echo "--- /tmp после ---"; df -h /tmp | tail -1',
		'echo "--- overlay ---"; df -h /overlay | tail -1',
	].join('\n'), 60000);
	return r.stdout + r.stderr;
}));

console.log('=== финальная сверка ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'echo "--- система ---"; grep DISTRIB_DESCRIPTION /etc/openwrt_release; uptime',
		'echo "--- пакеты ---"; apk info 2>/dev/null | grep -iE "csqtt|ssclash|ttyd|kmod-tun|kmod-nft-tproxy"',
		'echo "--- сервисы ---"; for s in csqtt clash ttyd dnsmasq; do /etc/init.d/$s enabled 2>/dev/null && echo "$s enabled" || echo "$s DISABLED"; done',
		'echo "--- процессы ---"; pidof clash >/dev/null && echo clash_alive; pidof ttyd >/dev/null && echo ttyd_alive; pidof csqtt-core-2.5.0 >/dev/null && echo csqtt_alive; pidof hostapd >/dev/null && echo wifi_alive',
		'echo "--- туннель ---"; ip link show csqtt0 >/dev/null 2>&1 && echo csqtt0_UP || echo csqtt0_DOWN; logread | grep -c "DTLS-хендшейк успешен"',
		'echo "--- CSQTT delay ---"; curl -s --max-time 12 "http://127.0.0.1:9090/proxies/CSQTT/delay?url=https://www.gstatic.com/generate_204&timeout=8000" | head -c 120; echo',
		'echo "--- Main Proxy ---"; curl -s --max-time 5 "http://127.0.0.1:9090/proxies/Main%20Proxy" | grep -oE "\\"(alive|now)\\":(\\"[^\\"]*\\"|true|false)" | head -3',
		'echo "--- DNS ---"; nslookup google.com 127.0.0.1 2>&1 | tail -2',
		'echo "--- сеть ---"; uci get network.lan.ipaddr; uci show wireless | grep -E "\.ssid=" ',
		'echo "--- пароль root ---"; grep -q "root:[!*]*:" /etc/shadow && echo "ПАРОЛЬ НЕ ЗАДАН (пустой)" || echo "пароль задан"',
	].join('\n'), 120000);
	return r.stdout + r.stderr;
}));
console.log('ФИНИШ11_ОК');

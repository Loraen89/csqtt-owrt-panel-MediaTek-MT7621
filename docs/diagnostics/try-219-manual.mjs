// try-219-manual.mjs — ручной запуск ядра 2.1.9 с корректными флагами.
// Цель: проверить, отвечает ли сервер TUNCONF/DENIED на формат 2.1.9 (с device_id).
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

console.log('=== env текущего ядра 2.5.0 (проверка пароля) ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, "PID=$(pidof csqtt-core-2.5.0); echo pid=$PID; tr '\\0' '\\n' < /proc/$PID/environ | grep -iE 'CSQTT|PASS' | sed 's/=\\(....\\).*/=\\1…/'", 30000);
	return r.stdout + r.stderr;
}));

console.log('=== останавливаю сервис 2.5.1, запускаю 2.1.9 вручную ===');
console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'/etc/init.d/csqtt stop 2>&1 | tail -1',
		'sleep 3',
		'pidof csqtt-core-2.5.0 && echo "ЕЩЁ ЖИВ!" || echo "2.5.0 остановлен"',
		'ip link del csqtt0 2>/dev/null; echo "csqtt0 убран"',
		`setsid env CSQTT_PASSWORD='<ПАРОЛЬ_ПОДКЛЮЧЕНИЯ>' /usr/libexec/csqtt/csqtt-core-2.1.9 --peer lv.velopit.ru:46000 --vk "https://vk.ru/call/join/<VK_CALL_HASH>" --workers 3 --listen 127.0.0.1:9000 --tun csqtt0 --tun-mtu 1300 --obfs audio --turn-transport udp --fingerprint chrome --captcha-mode auto --vk-hash-mode manual --vk-auth-mode vkcalls --password '<ПАРОЛЬ_ПОДКЛЮЧЕНИЯ>' --ignore-stdin-eof >/tmp/c219.log 2>&1 &`,
		'echo "запущен pid $!"',
		'sleep 2',
		'pidof csqtt-core-2.1.9 && echo "2.1.9 работает" || { echo "2.1.9 УПАЛ:"; head -20 /tmp/c219.log; }',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));

console.log('=== жду 40 секунд (хендшейки + GETCONF) ===');
await sleep(40000);

console.log(await withConn(async (c) => {
	const r = await exec(c, [
		'echo "=== итоговый лог 2.1.9 (без TURN-шума) ==="',
		'grep -vE "^\\[TURN\\]|Refresh" /tmp/c219.log | tail -40',
		'echo "=== TUNCONF/DENIED/NOCONF ==="',
		'grep -aE "TUNCONF|DENIED|NOCONF|GETCONF|FATAL" /tmp/c219.log | tail -10 || echo "ни одного ответа сервера"',
		'echo "=== csqtt0 ==="',
		'ip -4 addr show csqtt0 2>&1 | head -3',
		'echo "=== процесс ==="',
		'pidof csqtt-core-2.1.9 && echo alive || echo dead',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ТРАЙ_219_РУЧНОЙ_ОК');

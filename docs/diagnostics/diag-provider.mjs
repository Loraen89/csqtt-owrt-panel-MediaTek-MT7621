// diag-provider.mjs — что сейчас в файле подписки lastdep.yaml.
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
		'echo "=== файл подписки ==="; wc -c /opt/clash/proxy_providers/lastdep.yaml; ls -la /opt/clash/proxy_providers/',
		'echo "=== узлы (имена) ==="; grep -oE "name: [^,]{1,60}" /opt/clash/proxy_providers/lastdep.yaml | head -15',
		'echo "=== типы узлов ==="; grep -oE "type: [a-z]+" /opt/clash/proxy_providers/lastdep.yaml | sort | uniq -c',
		'echo "=== весь конфиг групп в config.yaml ==="; grep -A6 "name: Sub Proxy" /opt/clash/config.yaml',
		'echo "=== дата файла и возраст ==="; date; stat -c "%y" /opt/clash/proxy_providers/lastdep.yaml 2>/dev/null || ls -la /opt/clash/proxy_providers/lastdep.yaml',
	].join('\n'), 90000);
	return r.stdout + r.stderr;
}));
console.log('ДИАГ_ПРОВАЙДЕР_ОК');

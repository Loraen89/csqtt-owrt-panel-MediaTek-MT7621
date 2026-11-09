// update-release.mjs — заменяет ассеты luci-app-csqtt и SHA256SUMS в релизе v2.0-mt7621-r1.
import fs from 'node:fs';

const TOKEN = process.env.GITHUB_TOKEN || '<GITHUB_TOKEN>';
const REPO = 'Loraen89/csqtt-owrt-panel-MediaTek-MT7621';
const DIST = 'C:\\Users\\dom\\Downloads\\OpenCodev1\\csqtt-owrt-panel-MediaTek-MT7621\\dist';
const H = { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json' };

const rel = await (await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: H })).json();
console.log('релиз:', rel.tag_name, 'id:', rel.id);
const assets = rel.assets;
for (const a of assets) console.log('  ассет:', a.id, a.name, a.size);

async function replaceAsset(name, filePath) {
	const old = assets.find(a => a.name === name);
	if (old) {
		const d = await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${old.id}`, { method: 'DELETE', headers: H });
		console.log(`удалён ${name}: ${d.status}`);
	}
	const body = fs.readFileSync(filePath);
	const u = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, {
		method: 'POST',
		headers: { ...H, 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length) },
		body,
	});
	const j = await u.json();
	if (u.status !== 201) { console.error(`ОШИБКА загрузки ${name}:`, u.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
	console.log(`загружен ${name}: ${j.size} байт`);
}

await replaceAsset('luci-app-csqtt-2.0-openwrt-25.12.apk', `${DIST}\\luci-app-csqtt-2.0-openwrt-25.12.apk`);
await replaceAsset('SHA256SUMS', `${DIST}\\SHA256SUMS`);
console.log('РЕЛИЗ_ОБНОВЛЁН');

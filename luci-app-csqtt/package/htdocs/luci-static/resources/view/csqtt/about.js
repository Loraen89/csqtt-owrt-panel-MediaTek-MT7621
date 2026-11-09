'use strict';
'require view';
'require rpc';
'require view.csqtt.i18n as i18n';'require view.csqtt.theme as cqtTheme';

var _ = i18n.t;
var callStatus = rpc.declare({ object: 'csqtt', method: 'status' });
var CSS = [
	'.csqtt-about{width:100%;max-width:60em;box-sizing:border-box;line-height:1.5}',
	'.csqtt-about *{box-sizing:border-box}',
	'.csqtt-brand{display:flex;flex-wrap:wrap;align-items:baseline;gap:.6em;margin:0 0 1em;padding:0 0 .7em;border-bottom:1px solid rgba(127,127,127,.3)}',
	'.csqtt-brand-name{font-size:1.35em;font-weight:700}',
	'.csqtt-brand-tag{font-size:.85em;opacity:.72}',
	'.csqtt-section{margin:0 0 1.3em}',
	'.csqtt-section h3{font-size:1em;margin:.2em 0 .7em;padding-bottom:.35em;border-bottom:1px solid rgba(127,127,127,.25)}',
	'.csqtt-kv{display:grid;grid-template-columns:15em 1fr;gap:.45em .9em;margin:0}',
	'.csqtt-kv dt{opacity:.7}.csqtt-kv dd{margin:0;font-weight:600;overflow-wrap:anywhere}',
	'.csqtt-note{font-size:.88em;opacity:.8;padding:.7em .9em;border:1px solid rgba(127,127,127,.28);border-radius:9px;background:rgba(127,127,127,.05)}',
	'@media(max-width:560px){.csqtt-kv{grid-template-columns:1fr}.csqtt-kv dd{margin-bottom:.5em}}'
].join('');

function row(label, value) {
	return [ E('dt', {}, label), E('dd', {}, value) ];
}

return view.extend({
	load: function() {
		return i18n.load().then(function() {
			return callStatus().catch(function() { return null; });
		});
	},

	render: function(result) {
		var status = result && result.status || {};
		var version = status.version || 'csqtt-client (ядро не установлено)';
		var rows = [];
		rows = rows.concat(row(_('LuCI panel'), 'CSQTT-PANEL v2.0 2.0-r9'));
		rows = rows.concat(row(_('Core version'), version));
		rows = rows.concat(row('Архитектура', 'mipsel_24kc / MediaTek MT7621'));
		rows = rows.concat(row('Прошивка', 'OpenWrt 25.12'));
		rows = rows.concat(row('Платформа', 'ramips/mt7621 (Netis N6, Xiaomi Mi Router 3G и др.)'));
		rows = rows.concat(row('Интерфейс', status.tunnel && status.tunnel.interface || 'csqtt0'));
		return E('div', { class: 'csqtt-about' }, [
			E('style', {}, CSS),
			E('div', { class: 'csqtt-brand' }, [
				E('span', { class: 'csqtt-brand-name' }, 'CSQTT-PANEL v2.0'),
				E('span', { class: 'csqtt-brand-tag' }, 'полный интерфейс LuCI, ядра 2.1.9 / 2.5.1')
			]),
			E('div', { class: 'csqtt-section' }, [
				E('h3', {}, _('Versions')),
				E('dl', { class: 'csqtt-kv' }, rows)
			]),
			E('div', { class: 'csqtt-section' }, [
				E('h3', {}, 'Совместимость'),
				E('p', { class: 'csqtt-note' }, 'Открытые ссылки csqtt://connect используют ядро 2.1.9, зашифрованные — 2.5.1. Ядро сохраняется в профиле и выбирается перед запуском службы. Транспорт TURN по умолчанию — UDP.')
			]),
			E('div', { class: 'csqtt-section' }, [
				E('h3', {}, 'Безопасность сети'),
				E('p', { class: 'csqtt-note' }, 'Пакет не меняет firewall, таблицу маршрутизации, WAN, LAN или системный DNS. Туннель csqtt0 создаётся только процессом ядра после успешной проверки настроек.')
			])
		]);
	},

	handleSave: null,
	handleReset: null,
	handleSaveApply: null
});

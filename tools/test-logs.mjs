import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../luci-app-csqtt/package/htdocs/luci-static/resources/view/csqtt/logs.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function logMessage('),source.indexOf('const CATEGORIES='))+
 source.slice(source.indexOf('function categoryOf('),source.indexOf('function matchesCategory('));
const logs=new Function('E',body+'return {categoryOf,highlight};')((tag,attrs,children)=>({tag,attrs,children}));
const prefix='Mon Nov 9 17:00:00 2026 daemon.err run-core.sh[42]: ';
assert.equal(logs.categoryOf(prefix+'[СТАТИСТИКА] Активных: 18 | Трафик: 2 МБ'),'conn');
assert.equal(logs.categoryOf(prefix+'[TURN] Refresh аллокации подтверждён ✓'),'conn');
assert.equal(logs.categoryOf(prefix+'[СЕССИЯ] DTLS: таймаут рукопожатия'),'errors');
assert.equal(logs.categoryOf(prefix+'ERROR: connection failed'),'errors');
assert.equal(logs.categoryOf('daemon.err another-process: failed'),'errors','native errors from other processes must remain errors');
assert(!logs.highlight(prefix+'[STATS] active=18').some(part=>part?.attrs?.class==='logerr'),'stderr prefix alone must not be highlighted as a core error');
assert(logs.highlight(prefix+'ERROR connection failed').some(part=>part?.attrs?.class==='logerr'));
console.log('PASS: stderr severity does not create false CSQTT errors; genuine failures remain errors');

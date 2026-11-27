import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
fs.mkdirSync(path.join(root,'.cache'),{recursive:true});
const dir=fs.mkdtempSync(path.join(root,'.cache','wrapper-'));
const unix=p=>p.replaceAll('\\','/');
const quote=s=>"'"+unix(s).replaceAll("'","'\\''")+"'";
let shell=process.env.CSQTT_TEST_SHELL||'sh';
if(process.platform==='win32'&&!process.env.CSQTT_TEST_SHELL){
 const gitexec=execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim();
 shell=path.resolve(gitexec,'../../../usr/bin/sh.exe');
}
const log=path.join(dir,'calls'),config=path.join(dir,'original'),runtime=path.join(dir,'runtime');
function write(name,text){const p=path.join(dir,name);fs.writeFileSync(p,text,{mode:0o755});return p;}
try{
 fs.writeFileSync(config,'original UCI fixture\n');
 const functions=write('functions.sh',`config_load() { :; }
config_foreach() { "$1" selected; "$1" other; }
config_get() {
 value=''
 case "$2.$3" in selected.vk_js_token) value=profile-secret;; main.vk_js_token) value=shared-secret;; main.workers) value=40;; main.turn_transport) value=tcp_tls;; esac
 eval "$1=\\$value"
}
`);
 const uci=write('uci',`#!/bin/sh
printf '%s\\n' "$*" >>${quote(log)}
`);
 const supervisor=write('supervisor',`#!/bin/sh
printf 'RUN %s\\n' "$*" >>${quote(log)}
exit "\${FIXTURE_EXIT:-0}"
`);
 let source=fs.readFileSync(new URL('../luci-app-csqtt/package/root/usr/libexec/csqtt/run-253.sh',import.meta.url),'utf8');
 source=source.replace('/var/run/csqtt/core253',unix(runtime))
  .replace('/etc/config/csqtt',quote(config)).replace('/sbin/uci',quote(uci))
  .replace('/lib/functions.sh',quote(functions)).replace('/usr/libexec/csqtt/csqtt-control-2.5.3',quote(supervisor));
 const wrapper=write('wrapper.sh',source);
 for(const exit of [0,75]){
  fs.writeFileSync(log,'');
  const env={...process.env,FIXTURE_EXIT:String(exit),PATH:path.dirname(shell)+path.delimiter+process.env.PATH};
  const result=spawnSync(shell,[wrapper,'selected'],{env,encoding:'utf8'});
  assert.equal(result.status,exit,result.stderr);
  const calls=fs.readFileSync(log,'utf8');
  for(const value of ['csqtt.other.enabled=0','csqtt.main.selection_mode=manual','csqtt.main.failover=0','csqtt.main.failback=0','csqtt.selected.core_version=2.5.3','csqtt.selected.workers=40','RUN run --config'])assert(calls.includes(value),value+'\n'+calls);
  assert(!calls.includes('csqtt.selected.enabled=0'));
  assert(!calls.includes('vk_js_token=shared-secret'),'profile secret must never be replaced by the shared token');
  assert(!fs.existsSync(path.join(runtime,'csqtt')),'snapshot must be deleted on exit');
  assert.equal(fs.readFileSync(config,'utf8'),'original UCI fixture\n','original config is immutable');
 }
 console.log('PASS: 2.5.3 snapshot isolates selected profile, copies fallbacks, keeps profile credentials, disables cross-core failover, cleans secrets and propagates child failure');
}finally{fs.rmSync(dir,{recursive:true,force:true});}

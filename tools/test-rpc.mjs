// Generate isolated ucode regressions from the actual RPC implementation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(process.argv[3] || new URL('../luci-app-csqtt/package/root/usr/share/rpcd/ucode/csqtt',import.meta.url),'utf8');
const output=process.argv[2];
assert(output,'Usage: node tools/test-rpc.mjs <output.uc>; run the output with ucode');
const starts=[...source.matchAll(/^function (\w+)\(/gm)];
const skip=new Set(['run','readText','writeJson','uciConfig','binaryVersion','processInfo','fileExists']);
const constants=source.slice(source.indexOf('const BIN ='),starts[0].index);
let body='';
for(let i=0;i<starts.length;i++){
 if(skip.has(starts[i][1])) continue;
 const end=i+1<starts.length?starts[i+1].index:source.lastIndexOf('\nreturn {');
 body+=source.slice(starts[i].index,end);
}
const fixtures=`
let config={main:{enabled:'1',ifname:'csqtt0',selection_mode:'manual',active_profile:'profile1',core_version:'2.1.9',vk:'hash-secret'},
 profile1:{'.type':'server',enabled:'1',peer:'private.example:46000',password:'password-secret',name:'private.example',priority:'10',core_version:'2.1.9'}};
let process={running:true,pid:'42'}, files={}, calls=[];
files[STATUS_PATH]=sprintf('%J',{started_at:1,uptime_secs:5,connectivity:{session_established:true},workers:{active:3}});
function readText(path) { return files[path]; }
function writeJson(path,value) { files[path]=sprintf('%J',value); return true; }
function uciConfig() { return config; }
function processInfo() { return process; }
function binaryVersion() { return 'fixture-core'; }
function fileExists(path) { return path=='/dev/net/tun'||path=='/sys/class/net/csqtt0'||path==BIN_219||path==BIN_250; }
function run(args) {
 push(calls,args);
 if(args[0]=='/sbin/ip') return {code:0,out:'inet 10.66.67.9 peer 10.66.67.1/32'};
 if(args[0]==LOGREAD) return {code:0,out:'run-core.sh: connected\\n'};
 return {code:0,out:''};
}
function check(ok,message) { if(!ok){printf('FAIL: %s\\n',message);exit(1);} }
`;
const tests=`
config.main.vk_hash_mode='auto_js'; config.main.vk=''; config.main.vk_js_token='token-secret';
let status=statusObject();
check(status.configured,'auto_js token is a configured credential');
check(status.status.tunnel.address=='10.66.67.9','address comes from actual tunnel');
config.main.vk_hash_mode='manual'; config.main.vk='hash-secret';
let exported=mProfileExport({args:{id:'profile1'}});
check(exported.ok&&exported.core_version=='2.1.9'&&exported.link!=null&&exported.payload==null,'2.1.9 exports plain link');
config.profile1.core_version='2.5.0';
exported=mProfileExport({args:{id:'profile1'}});
check(exported.ok&&exported.core_version=='2.5.0'&&exported.link==null&&exported.payload!=null,'2.5 export must be encrypted by UI');
let decoded=mProfileImport({args:{link:'csqtt://connect?v=2&host=test.invalid&peer=46000&password=test'}});
check(decoded.ok&&decoded.core_version=='2.1.9','plain import selects 2.1.9');
let diag=sprintf('%J',mDiag({args:{}}));
check(index(diag,'private.example')<0&&index(diag,'password-secret')<0&&index(diag,'hash-secret')<0&&index(diag,'token-secret')<0,'diagnostics omit endpoint and credentials');
check(index(diag,'log_tail')<0,'raw logs are not silently included in sanitized diagnostics');
let logs=mLogs({args:{source:'syslog',lines:10,grep:''}});
check(length(logs.lines)==1&&length(calls[length(calls)-1])==1,'core messages are filtered in ucode rather than logread basic regex');
config.profile1.password='';
config.fallback={'.type':'server',enabled:'1',peer:'fallback.invalid:46000',password:'test',priority:'20',core_version:'2.1.9'};
check(chooseProfile(config)=='fallback','incomplete manual profile falls back');
function metrics(ticks,total,start) {
 let fields=['S',1,1,1,0,0,0,0,0,0,0,ticks,0,0,0,0,0,4,0,start];
 files['/proc/42/stat']='42 (name with ) spaces) '+join(' ',fields);
 files['/proc/42/status']='Name: test\\nVmRSS:\\t2048 kB\\n';
 files['/proc/stat']='cpu '+total+' 0 0 0 0 0 0 0 0 0\\ncpu0 0\\ncpu1 0\\ncpu2 0\\ncpu3 0\\n';
}
metrics(10,400,7);let first=processResources(process);
check(first.process_cpu_percent==null&&first.process_rss_kb==2048,'first CPU sample and RSS');
metrics(110,800,7);check(processResources(process).process_cpu_percent==100,'one logical CPU is 100%');
metrics(310,1200,7);check(processResources(process).process_cpu_percent==200,'multiple logical CPUs can exceed 100%');
check(processResources(process).process_cpu_percent==200,'same-tick reads keep last CPU sample');
metrics(1,1600,8);check(processResources(process).process_cpu_percent==null,'PID reuse resets baseline');
let stopped=processResources({running:false,pid:''});check(stopped.process_cpu_percent==null&&stopped.process_rss_kb==null,'stopped process has no stale resources');
printf('PASS: RPC credentials, address, export protocol, import, diagnostic privacy, logs, profile selection, CPU/RSS\\n');
`;
fs.writeFileSync(output,constants+fixtures+body+tests);

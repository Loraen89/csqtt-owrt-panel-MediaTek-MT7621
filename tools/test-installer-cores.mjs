import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=fs.mkdtempSync(path.join(root,'.cache','installer-'));
const quote=s=>"'"+s.replaceAll('\\','/').replaceAll("'","'\\''")+"'";
let shell=process.env.CSQTT_TEST_SHELL||'sh';
if(process.platform==='win32'&&!process.env.CSQTT_TEST_SHELL)shell=path.resolve(execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(),'../../../usr/bin/sh.exe');
try{
 const checker=path.join(dir,'sha.mjs');
 fs.writeFileSync(checker,`import fs from 'node:fs';import crypto from 'node:crypto';
const name=process.argv[2];console.log(crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')+'  '+name);
`);
 fs.writeFileSync(path.join(dir,'sha256sum'),`#!/bin/sh\nexec ${quote(process.execPath)} ${quote(checker)} "$@"\n`,{mode:0o755});
 for(const manager of ['opkg','apk']){
  const stub=path.join(dir,manager);fs.writeFileSync(stub,'#!/bin/sh\necho "Unexpected install during dry-run" >&2\nexit 90\n',{mode:0o755});
  for(const [choice,expected] of [['2.1.9',['2.1.9']],['2.5.1',['2.5.1']],['2.5.3',['2.5.3']],['both',['2.1.9','2.5.1']],['all',['2.1.9','2.5.1','2.5.3']]]){
   const result=spawnSync(shell,[path.join(root,'install-csqtt.sh'),'--core',choice,'--dry-run'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:[dir,path.dirname(shell),process.env.PATH].join(path.delimiter)}});
   assert.equal(result.status,0,result.stdout+result.stderr);
   assert(result.stdout.includes('dry-run'));
   const plan=result.stdout.split('\n').find(line=>line.startsWith('Будут установлены:'));
   assert(plan,'missing installation plan: '+result.stdout);
   for(const version of ['2.1.9','2.5.1','2.5.3'])assert.equal(plan.includes('csqtt-core-'+version),expected.includes(version),choice+' '+version);
   assert(plan.includes(manager==='apk'?'25.12':'24.10'));
  }
  fs.unlinkSync(stub);
 }
 console.log('PASS: verified dry-run package plans for each core, old both pair and all three (APK and IPK)');
}finally{fs.rmSync(dir,{recursive:true,force:true});}

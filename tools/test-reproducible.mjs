import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const saved=new Map();
function remember(dir){
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,item.name);
  if(item.isDirectory())remember(full);else saved.set(full,fs.readFileSync(full));
 }
}
remember(path.join(root,'luci-app-csqtt/package'));
for(const name of ['LICENSE','NOTICE.md'])saved.set(path.join(root,name),fs.readFileSync(path.join(root,name)));
function build(){
 execFileSync(process.execPath,['luci-app-csqtt/build-package.mjs'],{cwd:root,stdio:'pipe'});
 return fs.readdirSync(path.join(root,'dist')).filter(name=>name.endsWith('.apk')).map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist',name))).digest('hex')]);
}
try{
 for(const [name,bytes] of saved)fs.writeFileSync(name,bytes.toString('utf8').replace(/\r\n?/g,'\n'));
 const lf=build();
 for(const [name,bytes] of saved)fs.writeFileSync(name,bytes.toString('utf8').replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n'));
 assert.deepEqual(build(),lf,'APK output must be identical with LF and CRLF working trees');
 console.log('PASS: all three APKs are identical for LF and CRLF source trees');
}finally{
 for(const [name,bytes] of saved)fs.writeFileSync(name,bytes);
 build();
}

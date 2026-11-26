// Recover the existing cores from this checkout's packages and import pinned 2.5.3.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function tar(data){
 const entries=new Map();
 for(let pos=0;pos+512<=data.length;){
  const header=data.subarray(pos,pos+512);
  if(header.every(byte=>byte===0))break;
  const name=header.subarray(0,100).toString().replace(/\0.*$/,'').replace(/^\.\//,'');
  const size=parseInt(header.subarray(124,136).toString().replace(/[\0 ]/g,''),8)||0;
  if(pos+512+size>data.length)throw Error('Truncated tar');
  entries.set(name,data.subarray(pos+512,pos+512+size));
  pos+=512+Math.ceil(size/512)*512;
 }
 return entries;
}
function payload(data){
 let entries;
 if(data.subarray(0,8).toString()==='!<arch>\n'){
  entries=new Map();
  for(let pos=8;pos+60<=data.length;){
   const name=data.subarray(pos,pos+16).toString().trim().replace(/\/$/,'');
   const sizeField=data.subarray(pos+48,pos+58).toString().trim();
   // r13 wrote octal sizes into ar headers; read those shipped packages too.
   const size=parseInt(sizeField,/^0[0-7]+$/.test(sizeField)?8:10);
   entries.set(name,data.subarray(pos+60,pos+60+size));pos+=60+size+size%2;
  }
 }else entries=tar(zlib.gunzipSync(data));
 const archive=entries.get('data.tar.gz');if(!archive)throw Error('Missing data.tar.gz');
 return tar(zlib.gunzipSync(archive));
}
function save(dir,name,bytes){
 if(!bytes)throw Error('Missing member: '+name);
 const destination=path.join(root,dir,name);fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.writeFileSync(destination,bytes);
 fs.writeFileSync(destination+'.sha256',sha(bytes)+'  '+name+'\n');
}
const sums=fs.readFileSync(path.join(root,'dist/SHA256SUMS'),'utf8');
for(const [version,dir] of [['2.1.9','core219'],['2.5.1','core251']]){
 const name=`csqtt-core-${version}-openwrt-24.10-mipsel_24kc.ipk`;
 const bytes=fs.readFileSync(path.join(root,'dist',name));
 if(!sums.includes(sha(bytes)+'  '+name))throw Error('Checksum mismatch: '+name);
 const member=version==='2.1.9'?'2.1.9':'2.5.0';
 save(dir+'/dist',`csqtt-core-${version}-mt7621-r1-mipsel_24kc`,payload(bytes).get('usr/libexec/csqtt/csqtt-core-'+member));
}
const name='csqtt-core-2.5.3-openwrt-24.10.8-ramips-mt7621-mipsel_24kc.ipk';
const url='https://github.com/starkugz/csqtt-openwrt/releases/download/v2.5.3/'+name;
const cache=path.join(root,'.cache',name);
const supplied=process.argv[2];
let bytes;
if(supplied)bytes=fs.readFileSync(supplied);
else if(fs.existsSync(cache))bytes=fs.readFileSync(cache);
else{
 const response=await fetch(url,{signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error(`Download failed: ${response.status}`);
 bytes=Buffer.from(await response.arrayBuffer());
}
if(sha(bytes)!=='e40b69b393b0d9a4b8a42e3184d08c7e02da6ca1eeab8cb5815ebdbbf08d022b')throw Error('Pinned 2.5.3 package checksum mismatch');
fs.mkdirSync(path.dirname(cache),{recursive:true});fs.writeFileSync(cache,bytes);
const entries=payload(bytes);
for(const [source,destination] of [
 ['usr/bin/csqtt-2.5.3','csqtt-2.5.3'],
 ['usr/lib/csqtt/core-2.5.3/bin/csqtt-control','csqtt-control-2.5.3'],
 ...['LICENSE','NOTICE.md','gooby/LICENSE','gooby/NOTICE'].map(name=>['usr/share/licenses/csqtt-core-2.5.3/'+name,'licenses/'+name]),
])save('core253/dist',destination,entries.get(source));
console.log('PASS: prepared cores 2.1.9, 2.5.1 and checksum-pinned 2.5.3 (transport, supervisor, notices)');

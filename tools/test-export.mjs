import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const root=new URL('../luci-app-csqtt/package/htdocs/luci-static/resources/view/csqtt/',import.meta.url);
const linkSource=fs.readFileSync(new URL('link.js',root),'utf8');
const profileSource=fs.readFileSync(process.argv[2] || new URL('profiles.js',root),'utf8');
let exported, modal, notifications=[];
const context=vm.createContext({crypto:webcrypto,window:{isSecureContext:true},TextEncoder,TextDecoder,btoa,atob,
 baseclass:{extend:value=>value},view:{extend:value=>value},uci:{},cqtTheme:{},
 i18n:{t:value=>value},L:{},
 E:(tag,attrs,children)=>({tag,attrs,children}),
 ui:{showModal:(title,children)=>{modal={title,children};},hideModal:()=>{},addTimeLimitedNotification:(...args)=>notifications.push(args)},
 rpc:{declare:spec=>()=>Promise.resolve(spec.method==='profile_export'?exported:{ok:false})}});
vm.runInContext("String.prototype.format=function(...args){let i=0;return this.replace(/%s/g,()=>String(args[i++]));};",context);
context.csqttLink=vm.compileFunction(linkSource,[],{parsingContext:context})();
const profiles=vm.compileFunction(profileSource,[],{parsingContext:context})();
const plain='csqtt://connect?v=2&host=test.invalid&peer=46000&password=test%26secret';
context.window.isSecureContext=false;
context.crypto={getRandomValues:array=>webcrypto.getRandomValues(array)};
exported={ok:true,core_version:'2.1.9',link:plain,payload:null};
await profiles.handleExport('fixture');
assert.equal(modal.children.find(value=>value.tag==='input').attrs.value,plain,'legacy export must stay plain and work over HTTP');
modal=null;notifications=[];
context.window.isSecureContext=true;context.crypto=webcrypto;
exported={ok:true,core_version:'2.5.0',link:null,payload:plain};
await profiles.handleExport('fixture');
const encrypted=modal.children.find(value=>value.tag==='input').attrs.value;
assert.match(encrypted,/^csqtt:\/\/[A-Za-z0-9_-]+$/);
const decoded=await context.csqttLink.decode(encrypted);
assert(decoded.ok&&!decoded.plain);
assert.equal(decoded.payload,plain.slice(8),'encrypted export round-trips through the shared crypto module');
if(process.env.CSQTT_TEST_LINK_OUTPUT)fs.writeFileSync(process.env.CSQTT_TEST_LINK_OUTPUT,encrypted);
modal=null;notifications=[];
context.window.isSecureContext=false;
context.crypto={getRandomValues:array=>webcrypto.getRandomValues(array)};
await profiles.handleExport('fixture');
assert.equal(modal,null,'HTTP must not offer an incompatible plaintext link for 2.5');
assert.equal(notifications.length,1,'HTTP encrypted export must explain secure-context requirement');
console.log('PASS: 2.1.9 HTTP export, 2.5.1 encrypted round-trip, HTTP encryption error handling');

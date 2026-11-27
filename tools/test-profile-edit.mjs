import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const base=new URL('../luci-app-csqtt/package/htdocs/luci-static/resources/view/csqtt/',import.meta.url);
let modal,changes=[],notifications=[];
const controls=new Map();
function E(tag,attrs={},children=[]){
 const e={tag,attrs,children,value:attrs.value||'',checked:!!attrs.checked,addEventListener(){},classList:{add(...names){attrs.class=[attrs.class||'',...names].join(' ');}}};
 if(tag==='select')e.value=children.find(c=>c.attrs.selected)?.attrs.value??children[0]?.attrs.value??'';
 if(attrs.id)controls.set(attrs.id,e);
 return e;
}
let config={main:{workers:'18',turn_transport:'udp',core_version:'2.5.0'},profile1:{name:'fixture',enabled:'1',peer:'example.org:46000',core_version:'2.5.0',vk_hash_mode:'auto_js',vk_js_token:'vk1.stored_secret'}};
const ctx=vm.createContext({E,view:{extend:v=>v},baseclass:{extend:v=>v},i18n:{t:v=>v},cqtTheme:{theme:()=> 'light',css:()=> ''},
 uci:{get:(pkg,id)=>config[id],add:(...a)=>changes.push(['add',...a]),set:(...a)=>changes.push(['set',...a]),unset:(...a)=>changes.push(['unset',...a]),save:()=>Promise.resolve(),apply:()=>Promise.resolve()},
 rpc:{declare:spec=>()=>Promise.resolve(spec.method==='profile_import'?{ok:true,core_version:'2.5.0',link_type:'encrypted',payload:'connect?v=2&host=example.org&peer=46000&password=secret&token=vk1.import-secret=&power=40'}:{ok:true})},L:{bind:(f,t,...a)=>f.bind(t,...a)},
 ui:{showModal:(title,children)=>{modal={title,children,classList:{add(name){modal.dialogClass=name;}}};return modal;},hideModal(){},addTimeLimitedNotification:(...a)=>notifications.push(a)},
 document:{getElementById:id=>controls.get(id)},
});
vm.runInContext("String.prototype.format=function(...args){let i=0;return this.replace(/%s/g,()=>String(args[i++]));};",ctx);
ctx.csqttLink=vm.compileFunction(fs.readFileSync(new URL('link.js',base),'utf8'),[],{parsingContext:ctx})();
const profiles=vm.compileFunction(fs.readFileSync(new URL('profiles.js',base),'utf8'),[],{parsingContext:ctx})();
profiles.reload=()=>Promise.resolve();
function open(){changes=[];notifications=[];controls.clear();profiles.openEditor('profile1');}
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.children].flat()){const match=find(child,predicate);if(match)return match;}return null;}
const save=()=>find(modal,node=>node.tag==='button'&&node.children==='Save').attrs.click();
open();
assert.equal(modal.dialogClass,'csqtt-profile-dialog');
assert(find(modal,node=>node.attrs?.class?.includes('csqtt-modal-body')),'editor body scrolls separately from actions');
assert(find(modal,node=>node.tag==='details'&&node.attrs.class==='panel editor'),'advanced fields use progressive disclosure');
assert.equal(controls.get('csqtt-ed-core').value,'2.5.1','old UCI alias is shown as the actual 2.5.1 core');
assert.equal(controls.get('csqtt-ed-token').value,'','stored tokens are not prefilled');
controls.get('csqtt-ed-gooby').value='embedded';
save();assert.equal(changes.length,0,'unsupported Gooby must fail before any UCI writes');
open();controls.get('csqtt-ed-workers').value='126';save();assert.equal(changes.length,0,'invalid worker limit must fail before writes');
open();controls.get('csqtt-ed-core').value='2.5.3';controls.get('csqtt-ed-gooby').value='embedded';controls.get('csqtt-ed-transport').value='tcp_tls';
save();await new Promise(resolve=>setTimeout(resolve,0));
assert(changes.some(a=>a[0]==='set'&&a[3]==='core_version'&&a[4]==='2.5.3'));
assert(changes.some(a=>a[0]==='set'&&a[3]==='gooby_mode'&&a[4]==='embedded'));
assert(!changes.some(a=>a[3]==='vk_js_token'),'empty secret must preserve the existing token');
changes=[];profiles.plannedDeviceId=()=> 'fixtureDevice';profiles.openImport();
controls.get('csqtt-imp-link').value='csqtt://encryptedFixture';
controls.get('csqtt-imp-id').value='imported';controls.get('csqtt-imp-name').value='Imported';
assert.equal(modal.dialogClass,'csqtt-import-dialog');
find(modal,node=>node.tag==='button'&&node.children==='Save (commit)').attrs.click();
await new Promise(resolve=>setTimeout(resolve,0));
assert(changes.some(a=>a[0]==='set'&&a[2]==='imported'&&a[3]==='core_version'&&a[4]==='2.5.3'),'import must use the explicit UI core, not inferred encryption metadata');
assert(changes.some(a=>a[0]==='set'&&a[2]==='imported'&&a[3]==='vk_js_token'&&a[4]==='vk1.import-secret='));
assert(!changes.some(a=>a[0]==='set'&&a[2]==='main'&&(a[3]==='vk_js_token'||a[3]==='vk')),'imported credentials must not replace the global account');
console.log('PASS: profile editor preserves 2.5.1 alias and stored secrets, rejects incompatible Gooby/workers before writes, saves explicit 2.5.3 with TCP/TLS');

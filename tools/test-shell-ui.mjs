import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const dir=new URL('../luci-app-csqtt/package/htdocs/luci-static/resources/view/csqtt/',import.meta.url);
let selectedTheme=null;
const context=vm.createContext({
 baseclass:{extend:x=>x},view:{extend:x=>x},i18n:{t:x=>x},
 window:{localStorage:{getItem:()=>selectedTheme,setItem:(key,value)=>{selectedTheme=value;}},setTimeout:()=>{}},
 document:{querySelectorAll:()=>[],getElementById:()=>null},
 uci:{get:()=>({}),sections:()=>[]},ui:{},
 rpc:{declare:()=>()=>Promise.resolve({})},
 L:{bind:(fn,self,...args)=>fn.bind(self,...args),url:(...parts)=>parts.join('/')},
 E:(tag,attrs,children)=>({tag,attrs:attrs||{},children:children==null?[]:(Array.isArray(children)?children:[children]),querySelector:()=>null})
});
vm.runInContext("String.prototype.format=function(...args){let i=0;return this.replace(/%[sd]/g,()=>String(args[i++]));};",context);
context.cqtTheme=vm.compileFunction(fs.readFileSync(new URL('theme.js',dir),'utf8'),[],{parsingContext:context})();
for(const name of context.cqtTheme.themes){
 assert.equal(context.cqtTheme.setTheme(name),name);
 assert.equal(context.cqtTheme.theme(),name);
 assert.match(context.cqtTheme.css(),/\.cqt\{/);
 assert(!context.cqtTheme.css().includes('undefined'),'all theme tokens must be defined');
}
const view=vm.compileFunction(fs.readFileSync(new URL('status.js',dir),'utf8'),[],{parsingContext:context})();
view.startRefresh=()=>{};
const tree=view.render();
const ids=new Map();const nodes=[];
function walk(node){if(!node||typeof node!=='object')return;nodes.push(node);if(node.attrs?.id){assert(!ids.has(node.attrs.id),'status IDs must stay unique: '+node.attrs.id);ids.set(node.attrs.id,node);}for(const child of node.children||[])walk(child);}
walk(tree);
for(const id of ['csqtt-active','csqtt-state','csqtt-name','csqtt-uptime','csqtt-speed','csqtt-traffic','csqtt-cpu','csqtt-mem','csqtt-indicators','csqtt-flood','csqtt-flood-box'])assert(ids.has(id),'existing RPC update target must remain: '+id);
assert.match(tree.attrs.class,/csqtt-dash/,'upstream dashboard styles are scoped to this view');
assert.match(ids.get('csqtt-card').attrs.class,/csqtt-hero/);
const metrics=nodes.find(n=>n.attrs?.class==='csqtt-grid');
assert.equal(metrics.children.length,3,'speed/traffic, CPU and memory use the upstream three-card grouping');
for(const action of ['start','stop','restart','clear_flood'])assert(view._svc[action],'local service action must remain: '+action);
console.log('PASS: upstream themes, dashboard layout, unique RPC update targets and local Flood controls');

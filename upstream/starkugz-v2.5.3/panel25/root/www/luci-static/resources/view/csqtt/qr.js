'use strict';'require baseclass';var QR_ECM=[[10,1,16,0,0],[16,1,28,0,0],[26,1,44,0,0],[18,2,32,0,0],[24,2,43,0,0],[16,4,27,0,0],[18,4,31,0,0],[22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44],];var QR_ALIGN=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],];var QR_EXP=new Array(512),QR_LOG=new Array(256);(function(){var x=1;for(var i=0;i<255;i++){QR_EXP[i]=x;QR_LOG[x]=i;x<<=1;if(x&0x100)
x^=0x11d;}
for(var i=255;i<512;i++)
QR_EXP[i]=QR_EXP[i-255];})();function qrGfMul(a,b){if(a===0||b===0)
return 0;return QR_EXP[QR_LOG[a]+QR_LOG[b]];}
function qrRsGen(n){var g=[1];for(var i=0;i<n;i++){var a=QR_EXP[i],r=new Array(g.length+1).fill(0);for(var j=0;j<g.length;j++){r[j]^=g[j];r[j+1]^=qrGfMul(g[j],a);}
g=r;}
return g;}
function qrRsEncode(data,ecLen){var gen=qrRsGen(ecLen),res=new Array(ecLen).fill(0);for(var i=0;i<data.length;i++){var factor=data[i]^res[0];res.shift();res.push(0);if(factor!==0)
for(var j=0;j<ecLen;j++)
res[j]^=qrGfMul(gen[j+1],factor);}
return res;}
function qrFmtBits(mask){var d=mask,r=d<<10;for(var i=14;i>=10;i--)
if((r>>>i)&1)
r^=0x537<<(i-10);return((d<<10)|r)^0x5412;}
function qrVerBits(v){var r=v<<12;for(var i=17;i>=12;i--)
if((r>>>i)&1)
r^=0x1f25<<(i-12);return(v<<12)|r;}
function qrUtf8(str){var out=[];for(var i=0;i<str.length;i++){var c=str.charCodeAt(i);if(c<0x80){out.push(c);}
else if(c<0x800){out.push(0xc0|(c>>6),0x80|(c&0x3f));}
else if(c>=0xd800&&c<0xdc00&&i+1<str.length){var cp=0x10000+((c&0x3ff)<<10)+(str.charCodeAt(++i)&0x3ff);out.push(0xf0|(cp>>18),0x80|((cp>>12)&0x3f),0x80|((cp>>6)&0x3f),0x80|(cp&0x3f));}
else{out.push(0xe0|(c>>12),0x80|((c>>6)&0x3f),0x80|(c&0x3f));}}
return out;}
function qrPenalty(mod,size){var p=0,i,j;for(var k=0;k<2;k++){for(i=0;i<size;i++){var run=1;for(j=1;j<size;j++){var a=k?mod[j][i]:mod[i][j],b=k?mod[j-1][i]:mod[i][j-1];if(a===b)
run++;else{if(run>=5)
p+=3+(run-5);run=1;}}
if(run>=5)
p+=3+(run-5);}}
for(i=0;i<size-1;i++)
for(j=0;j<size-1;j++){var v=mod[i][j];if(v===mod[i][j+1]&&v===mod[i+1][j]&&v===mod[i+1][j+1])
p+=3;}
var pat1=[true,false,true,true,true,false,true,false,false,false,false],pat2=pat1.slice().reverse();function countPat(get,pat){var n=0;for(var s=0;s+pat.length<=size;s++){var hit=true;for(var t=0;t<pat.length;t++)
if(get(s+t)!==pat[t]){hit=false;break;}
if(hit)
n++;}
return n;}
for(i=0;i<size;i++)
p+=40*(countPat(function(t){return mod[i][t];},pat1)+
countPat(function(t){return mod[i][t];},pat2)+
countPat(function(t){return mod[t][i];},pat1)+
countPat(function(t){return mod[t][i];},pat2));var dark=0;for(i=0;i<size;i++)
for(j=0;j<size;j++)
if(mod[i][j])
dark++;p+=10*Math.floor(Math.abs(2*dark-size*size)*10/(size*size));return p;}
function qrMatrix(text,opts){opts=opts||{};var bytes=qrUtf8(text),ver=opts.version,cap,dataCw;if(!ver){for(ver=1;ver<=10;ver++){cap=QR_ECM[ver-1];dataCw=cap[1]*cap[2]+cap[3]*cap[4];if(4+(ver<10?8:16)+bytes.length*8<=dataCw*8)
break;}
if(ver>10)
throw new Error('QR: data too long');}
cap=QR_ECM[ver-1];dataCw=cap[1]*cap[2]+cap[3]*cap[4];var bits=[];function put(val,n){for(var i=n-1;i>=0;i--)
bits.push((val>>>i)&1);}
put(4,4);put(bytes.length,ver<10?8:16);for(var i=0;i<bytes.length;i++)
put(bytes[i],8);put(0,Math.min(4,dataCw*8-bits.length));while(bits.length%8)
bits.push(0);var data=[];for(i=0;i<bits.length;i+=8){var b=0;for(var j=0;j<8;j++)
b=(b<<1)|bits[i+j];data.push(b);}
var pad=[0xec,0x11],pi=0;while(data.length<dataCw)
data.push(pad[pi++%2]);var ecLen=cap[0],blocks=[],off=0;for(i=0;i<cap[1];i++,off+=cap[2])
blocks.push(data.slice(off,off+cap[2]));for(i=0;i<cap[3];i++,off+=cap[4])
blocks.push(data.slice(off,off+cap[4]));var ecBlocks=blocks.map(function(bl){return qrRsEncode(bl,ecLen);}),final=[],maxD=Math.max(cap[2],cap[4]);for(i=0;i<maxD;i++)
for(var bi=0;bi<blocks.length;bi++)
if(i<blocks[bi].length)
final.push(blocks[bi][i]);for(i=0;i<ecLen;i++)
for(bi=0;bi<ecBlocks.length;bi++)
final.push(ecBlocks[bi][i]);var size=17+4*ver,mod=[],res=[];for(i=0;i<size;i++){mod.push(new Array(size).fill(false));res.push(new Array(size).fill(false));}
function setF(y,x,v){mod[y][x]=v;res[y][x]=true;}
for(i=0;i<size;i++){setF(6,i,i%2===0);setF(i,6,i%2===0);}
function finder(cy,cx){for(var dy=-4;dy<=4;dy++)
for(var dx=-4;dx<=4;dx++){var y=cy+dy,x=cx+dx;if(y<0||y>=size||x<0||x>=size)
continue;var d=Math.max(Math.abs(dy),Math.abs(dx));setF(y,x,d!==2&&d!==4);}}
finder(3,3);finder(3,size-4);finder(size-4,3);var ac=QR_ALIGN[ver-1];for(i=0;i<ac.length;i++)
for(j=0;j<ac.length;j++){var ay=ac[i],ax=ac[j];if((ay===6&&ax===6)||(ay===6&&ax===size-7)||(ay===size-7&&ax===6))
continue;for(var dy=-2;dy<=2;dy++)
for(var dx=-2;dx<=2;dx++)
setF(ay+dy,ax+dx,Math.max(Math.abs(dy),Math.abs(dx))!==1);}
for(i=0;i<=8;i++){if(i!==6){res[8][i]=true;res[i][8]=true;}}
for(i=0;i<8;i++){res[8][size-1-i]=true;res[size-1-i][8]=true;}
if(ver>=7)
for(i=0;i<6;i++)
for(j=0;j<3;j++){res[size-11+j][i]=true;res[i][size-11+j]=true;}
var bitIdx=0,totalBits=final.length*8;for(var right=size-1;right>=1;right-=2){if(right===6)
right=5;for(var vert=0;vert<size;vert++)
for(j=0;j<2;j++){var x=right-j,upward=((right+1)&2)===0,y=upward?size-1-vert:vert;if(!res[y][x]&&bitIdx<totalBits){mod[y][x]=((final[bitIdx>>3]>>>(7-(bitIdx&7)))&1)===1;bitIdx++;}}}
function applyMask(mask){for(var y2=0;y2<size;y2++)
for(var x2=0;x2<size;x2++){if(res[y2][x2])
continue;var inv=false;switch(mask){case 0:inv=((x2+y2)%2)===0;break;case 1:inv=(y2%2)===0;break;case 2:inv=(x2%3)===0;break;case 3:inv=((x2+y2)%3)===0;break;case 4:inv=(Math.floor(x2/3)+Math.floor(y2/2))%2===0;break;case 5:inv=((x2*y2)%2+(x2*y2)%3)===0;break;case 6:inv=(((x2*y2)%2+(x2*y2)%3)%2)===0;break;case 7:inv=((((x2+y2)%2)+(x2*y2)%3)%2)===0;break;}
if(inv)
mod[y2][x2]=!mod[y2][x2];}}
function drawFormat(mask){var bits2=qrFmtBits(mask);function bit(i){return((bits2>>>i)&1)===1;}
for(i=0;i<=5;i++)
setF(i,8,bit(i));setF(7,8,bit(6));setF(8,8,bit(7));setF(8,7,bit(8));for(i=9;i<15;i++)
setF(8,14-i,bit(i));for(i=0;i<8;i++)
setF(8,size-1-i,bit(i));for(i=8;i<15;i++)
setF(size+i-15,8,bit(i));setF(size-8,8,true);}
if(ver>=7){var vb=qrVerBits(ver);for(i=0;i<18;i++){var vbit=((vb>>>i)&1)===1,a=size-11+i%3,bb=Math.floor(i/3);setF(bb,a,vbit);setF(a,bb,vbit);}}
var best=(opts.mask!=null)?opts.mask:0,bestPen=null;for(var m=0;m<8;m++){if(opts.mask!=null&&m!==opts.mask)
continue;applyMask(m);drawFormat(m);var pen=qrPenalty(mod,size);if(bestPen===null||pen<bestPen){bestPen=pen;best=m;}
applyMask(m);}
applyMask(best);drawFormat(best);return{size:size,modules:mod,version:ver,mask:best};}
function qrSvg(q,scale){scale=scale||4;var s=q.size,d='';for(var y=0;y<s;y++)
for(var x=0;x<s;x++)
if(q.modules[y][x])
d+='M'+x+' '+y+'h1v1h-1z';return'<svg xmlns="http://www.w3.org/2000/svg" width="'+(s*scale)+'" height="'+(s*scale)+'" viewBox="-1 -1 '+(s+2)+' '+(s+2)+'" shape-rendering="crispEdges"><rect x="-1" y="-1" width="'+(s+2)+'" height="'+(s+2)+'" fill="#fff"/><path d="'+d+'" fill="#000"/></svg>';}
return baseclass.extend({qrMatrix:qrMatrix,qrSvg:qrSvg});
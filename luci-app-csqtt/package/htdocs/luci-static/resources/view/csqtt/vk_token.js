'use strict';'require baseclass';function extractTokenParameter(v){var access=null,token=null,parts=v.split(/[?#&]/),eq,key,val;for(var i=0;i<parts.length;i++){eq=parts[i].indexOf('=');if(eq<=0)
continue;key=parts[i].slice(0,eq);val=parts[i].slice(eq+1);if(val==='')
continue;if(key==='access_token')
access=val;else if(key==='token')
token=val;}
return access!==null?access:token;}
function isPlausibleToken(t){if(!t||/\s/.test(t))
return false;if(/^vk1\./.test(t))
return t.length>8&&/^[A-Za-z0-9._=-]+$/.test(t.slice(4));return t.length>=80&&/^[0-9A-Fa-f]+$/.test(t);}
function percentDecode(v){try{return decodeURIComponent(v);}catch(e){return v;}}
function normalizeVkToken(raw){var v=String(raw==null?'':raw).trim();if(v==='')
return'';var param=extractTokenParameter(v),t;if(param!==null){t=percentDecode(param).trim();return isPlausibleToken(t)?t:null;}
var i=v.indexOf('vk1.');if(i>=0){t=v.slice(i).split(/[&#?\s]/)[0].trim();return isPlausibleToken(t)?t:null;}
return isPlausibleToken(v)?v:null;}
return baseclass.extend({normalize:normalizeVkToken});

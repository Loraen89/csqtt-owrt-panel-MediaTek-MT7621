'use strict';'require baseclass';'require rpc';var CIPHER_KEY_SEED='csqtt-chiper-key';var IV_BYTES=12;var TAG_BYTES=16;var MIN_BYTES=IV_BYTES+TAG_BYTES;var MAX_PAYLOAD_CHARS=4096;var BASE64URL_RE=/^[A-Za-z0-9_-]+$/;var aesKeyPromise=null;var hmacKeyPromise=null;var callLinkDecrypt=rpc.declare({object:'csqtt',method:'link_decrypt',params:['link']});function subtle(){return(typeof crypto!=='undefined'&&crypto&&crypto.subtle)?crypto.subtle:null;}
function secureContext(){return(typeof window!=='undefined'&&window.isSecureContext===true);}
function available(){return secureContext()&&!!subtle();}
function utf8Encode(text){return new TextEncoder().encode(text);}
function utf8Decode(buffer){return new TextDecoder().decode(buffer);}
function base64UrlEncode(buffer){var bytes=new Uint8Array(buffer),binary='',i;for(i=0;i<bytes.length;i++)
binary+=String.fromCharCode(bytes[i]);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function base64UrlDecode(input){if(!BASE64URL_RE.test(input))
return null;var base64=input.replace(/-/g,'+').replace(/_/g,'/'),binary,bytes,i;while(base64.length%4)
base64+='=';try{binary=atob(base64);}catch(e){return null;}
bytes=new Uint8Array(binary.length);for(i=0;i<binary.length;i++)
bytes[i]=binary.charCodeAt(i);return bytes;}
function digestKey(){return subtle().digest('SHA-256',utf8Encode(CIPHER_KEY_SEED));}
function aesKey(){if(!aesKeyPromise){aesKeyPromise=digestKey().then(function(digest){return subtle().importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);});}
return aesKeyPromise;}
function hmacKey(){if(!hmacKeyPromise){hmacKeyPromise=digestKey().then(function(digest){return subtle().importKey('raw',digest,{name:'HMAC',hash:'SHA-256'},false,['sign']);});}
return hmacKeyPromise;}
function isPlainPayload(payload){var low=payload.toLowerCase();if(low.indexOf('connect?')===0)
return true;return payload.indexOf('@')!==-1||payload.indexOf(':')!==-1||payload.indexOf('?')!==-1||payload.indexOf('&')!==-1||payload.indexOf('=')!==-1;}
function normalizePayload(text){var value=String(text==null?'':text).trim(),low=value.toLowerCase();if(low.indexOf('csqtt://connect?')===0)
return value;if(low.indexOf('connect?')===0)
return'csqtt://'+value;if(low.indexOf('csqtt://')===0){var rest=value.substring(8);if(rest.indexOf('host=')!==-1||/^v=\d/i.test(rest))
return'csqtt://connect?'+rest;return'csqtt://'+rest;}
if(value.indexOf('host=')!==-1||value.indexOf('?')!==-1||value.indexOf('&')!==-1)
return'csqtt://connect?'+value.replace(/^\?/,'');return'csqtt://'+value;}
function decode(raw){var trimmed=String(raw==null?'':raw).trim(),payload;if(!/^csqtt:\/\//i.test(trimmed))
return Promise.resolve({ok:true,plain:true,link:trimmed,payload:''});payload=trimmed.substring(8).replace(/\s+/g,'');if(!payload)
return Promise.resolve({ok:false,error:'bad-format'});if(isPlainPayload(payload))
return Promise.resolve({ok:true,plain:true,link:trimmed,payload:payload});if(!available())
return Promise.resolve({ok:false,error:'no-webcrypto'});if(payload.length>MAX_PAYLOAD_CHARS)
return Promise.resolve({ok:false,error:'too-long'});var bytes=base64UrlDecode(payload);if(!bytes||bytes.length<MIN_BYTES)
return Promise.resolve({ok:false,error:'bad-format'});return aesKey().then(function(key){return subtle().decrypt({name:'AES-GCM',iv:bytes.subarray(0,IV_BYTES),tagLength:128,},key,bytes.subarray(IV_BYTES));}).then(function(plain){var text=utf8Decode(plain);if(!text||text.indexOf('\u0000')!==-1)
return{ok:false,error:'bad-payload'};return{ok:true,plain:false,payload:text,link:normalizePayload(text)};}).catch(function(){return{ok:false,error:'decrypt'};});}
function decryptRemote(raw){var trimmed=String(raw==null?'':raw).trim();if(!/^csqtt:\/\//i.test(trimmed))
return Promise.resolve({ok:true,plain:true,link:trimmed,payload:''});if(trimmed.length>MAX_PAYLOAD_CHARS+8)
return Promise.resolve({ok:false,error:'too-long'});return callLinkDecrypt(trimmed).then(function(res){if(!res||!res.ok||!res.link)
return{ok:false,error:res&&res.ok===false?'decrypt':'remote-unavailable'};return{ok:true,plain:false,payload:'',link:normalizePayload(res.link)};}).catch(function(){return{ok:false,error:'remote-unavailable'};});}
function resolve(raw){return decode(raw).then(function(res){if(res&&res.ok)
return res;if(res&&res.error==='no-webcrypto')
return decryptRemote(raw);return res;});}
function encrypt(link){var raw=String(link==null?'':link).trim();if(!raw||!available())
return Promise.resolve(null);var payload=raw.replace(/^csqtt:\/\//i,''),data=utf8Encode(payload);return Promise.all([aesKey(),hmacKey()]).then(function(keys){return subtle().sign('HMAC',keys[1],data).then(function(mac){var iv=new Uint8Array(mac).slice(0,IV_BYTES);return subtle().encrypt({name:'AES-GCM',iv:iv,tagLength:128},keys[0],data).then(function(ciphertext){var combined=new Uint8Array(IV_BYTES+ciphertext.byteLength);combined.set(iv,0);combined.set(new Uint8Array(ciphertext),IV_BYTES);return'csqtt://'+base64UrlEncode(combined);});});}).catch(function(){return null;});}
return baseclass.extend({__name__:'CsqttLink',available:available,secureContext:secureContext,decode:decode,decryptRemote:decryptRemote,resolve:resolve,encrypt:encrypt,normalizePayload:normalizePayload,});

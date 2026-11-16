'use strict';
const KEY='ct-campeador-control-pistas-v1-3';
const SHELL=['./','./index.html','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(KEY).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ct-campeador-control-pistas-')&&k!==KEY).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;e.respondWith(fetch(r).then(response=>{if(response.ok)caches.open(KEY).then(cache=>cache.put(r,response.clone())).catch(()=>{});return response}).catch(()=>caches.match(r)))});

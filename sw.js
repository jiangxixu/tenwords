const CACHE='tenwords-v9';
const ASSETS=['./','./index.html','./styles.css?v=9','./app.js?v=9','./manifest.webmanifest','./favicon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tenwords-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin) return;
  const url=new URL(e.request.url);
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const key=url.pathname.includes('/data/')?url.pathname:e.request;
    try{
      const response=await fetch(e.request,{cache:'no-store'});
      if(response.ok) await cache.put(key,response.clone());
      return response;
    }catch(error){
      const cached=await cache.match(key);
      if(cached) return cached;
      if(e.request.mode==='navigate'){const shell=await cache.match('./index.html');if(shell)return shell}
      throw error;
    }
  })());
});

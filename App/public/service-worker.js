const CACHE='benza-bullion-1.0.0-build-125';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-512-maskable.png','./vendor/supabase.js','./privacy.html','./terms.html','./support.html'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('benza-bullion-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(async()=>await caches.match(e.request)||await caches.match('./index.html')));return;}e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request)));});

self.addEventListener('push',event=>{
  let payload={};
  try{payload=event.data?.json()||{};}catch(_){payload={body:event.data?.text()||''};}
  const notice=payload.notification||payload;
  const title=notice.title||payload.title||'Benza Bullion';
  const url=notice.url||notice.data?.url||payload.url||payload.data?.url||'./';
  const options={
    body:notice.body||payload.body||'A Benza Bullion alert is ready.',
    icon:notice.icon||payload.icon||'./icon-192.png',
    badge:notice.badge||payload.badge||'./icon-192.png',
    tag:notice.tag||payload.tag||'benza-bullion-alert',
    renotify:Boolean(notice.renotify??payload.renotify),
    data:{...(payload.data||{}),...(notice.data||{}),url}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  let destination=self.location.origin;
  try{
    const requested=new URL(event.notification.data?.url||'./',self.location.origin);
    if(requested.origin===self.location.origin)destination=requested.href;
  }catch(_){ }
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){
      return existing.focus().then(client=>typeof client.navigate==='function'?client.navigate(destination):client);
    }
    return clients.openWindow?clients.openWindow(destination):undefined;
  }));
});

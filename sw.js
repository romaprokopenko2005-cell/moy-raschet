var V='mr-v13-1';
var FILES=['./','index.html','style.css','app.js','categories.js','parser.js','features.js','deep.js','vendor/chart.js','vendor/pdf.min.js','vendor/pdf.worker.min.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(V).then(function(c){return c.addAll(FILES)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==V}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(caches.open(V).then(function(c){return c.match(e.request,{ignoreSearch:true}).then(function(hit){
    var net=fetch(e.request).then(function(r){if(r.ok)c.put(e.request,r.clone());return r});
    if(hit){net.catch(function(){});return hit}
    return net.catch(function(){return c.match('index.html')});
  })}));
});

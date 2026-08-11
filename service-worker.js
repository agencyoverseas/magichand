/* ============================================================
   service-worker.js — Magic Hands (offline app-shell)
   Cache-first pour les assets statiques, network-first pour la
   navigation (toujours essayer la dernière version en ligne,
   fallback sur le cache si hors-ligne). Ne touche jamais aux
   requêtes Supabase (cross-origin, jamais interceptées).
   ============================================================ */
var CACHE_VERSION = 'mh-shell-v9';
var PRECACHE = [
  './',
  './index.html',
  './signer.html',
  './manifest.json',
  './config.js',
  './assets/app.css',
  './assets/emargement.css',
  './assets/responsive.css',
  './assets/app.js',
  './assets/dashboard.js',
  './assets/mh-api.js',
  './assets/sync.js',
  './assets/emargement.js',
  './assets/signer.js',
  './assets/notif.js',
  './assets/pwa.js',
  './assets/logo-full.png',
  './assets/logo-mi.png',
  './assets/logo-magic-hands.png',
  './assets/cert-bg.png',
  './assets/attest-bg.png',
  './assets/sign.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-512-maskable.png',
  './assets/lib/jspdf.umd.min.js',
  './assets/lib/html2canvas.min.js',
  './assets/lib/chart.min.js',
  './assets/lib/supabase.min.js',
  './assets/lib/qrcode.min.js',
  './assets/fonts/open-sans-latin-400-normal.woff2',
  './assets/fonts/open-sans-latin-600-normal.woff2',
  './assets/fonts/open-sans-latin-700-normal.woff2',
  './assets/fonts/prompt-latin-400-normal.woff2',
  './assets/fonts/prompt-latin-700-normal.woff2',
  './assets/fonts/vollkorn-latin-500-italic.woff2',
  './assets/fonts/vollkorn-latin-600-normal.woff2',
  './assets/fonts/vollkorn-latin-700-normal.woff2'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then(function(cache){
    return Promise.all(PRECACHE.map(function(url){
      return cache.add(url).catch(function(){ /* asset optionnel manquant, on ignore */ });
    }));
  }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE_VERSION}).map(function(k){return caches.delete(k)}));
    }).then(function(){return self.clients.claim()})
  );
});

function isSameOrigin(url){
  try{ return new URL(url).origin === self.location.origin; }catch(e){ return false; }
}

/* version.json : toujours réseau, jamais de cache */
self.addEventListener('fetch', function(e){
  if(e.request.url.indexOf('version.json')>-1){
    e.respondWith(fetch(e.request,{cache:'no-store'}).catch(function(){
      return new Response('{}',{headers:{'Content-Type':'application/json'}});
    }));
  }
}, false);

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  if(!isSameOrigin(req.url)) return; /* Supabase & CDN externes : jamais interceptés */

  /* navigation (chargement de page) : network-first, fallback cache, fallback index.html */
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function(c){c.put(req,copy)});
        return res;
      }).catch(function(){
        return caches.match(req).then(function(c){return c || caches.match('./index.html')});
      })
    );
    return;
  }

  /* assets statiques : cache-first, fallback réseau + mise en cache */
  e.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        if(res && res.status===200){
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function(c){c.put(req,copy)});
        }
        return res;
      }).catch(function(){ return cached; });
    })
  );
});

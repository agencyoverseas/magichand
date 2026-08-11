/* ============================================================
   pwa.js — Installation PWA discrète + offline + resync auto
   - Enregistre le service worker (app-shell offline)
   - Capture beforeinstallprompt -> bannière discrète après usage
   - iOS (pas de beforeinstallprompt) -> mini-instructions
   - Au retour réseau ('online') -> relance MHsync (pull+merge+push)
   ============================================================ */
(function(){
"use strict";
var LS_DISMISS='mh_install_dismiss_v1';
var DISMISS_DAYS=7;
var deferredPrompt=null;

/* ---------- service worker ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./service-worker.js').then(function(reg){
      reg.update();
      setInterval(function(){ reg.update(); }, 10*60000);
    }).catch(function(){});
  });
  /* le nouveau service worker prend la main -> on recharge une seule fois */
  var reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    if(reloaded) return; reloaded=true; location.reload();
  });
}

/* ============================================================
   Mise à jour automatique
   version.json est réécrit à chaque déploiement. Si le numéro
   a changé, on vide TOUS les caches (Cache Storage) puis on
   recharge. Les données locales (localStorage) ne sont JAMAIS
   touchées : c'est la base de l'app, la vider perdrait le
   travail non synchronisé.
   ============================================================ */
var LS_BUILD='mh_build_v1';
function purgerCaches(){
  if(!window.caches || !caches.keys) return Promise.resolve();
  return caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){ return caches.delete(k); }));
  }).catch(function(){});
}
function verifierMaj(){
  if(!navigator.onLine) return;
  fetch('./version.json?_='+Date.now(),{cache:'no-store'})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(v){
      if(!v||!v.build) return;
      var connu=localStorage.getItem(LS_BUILD);
      if(!connu){ localStorage.setItem(LS_BUILD,v.build); return; }   /* 1re visite : on note, on ne recharge pas */
      if(connu===v.build) return;
      localStorage.setItem(LS_BUILD,v.build);
      if(window.MH&&window.MH.toast) window.MH.toast('Nouvelle version — mise à jour…');
      purgerCaches().then(function(){
        if('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations){
          return navigator.serviceWorker.getRegistrations().then(function(rs){
            return Promise.all(rs.map(function(r){ return r.unregister(); }));
          }).catch(function(){});
        }
      }).then(function(){ setTimeout(function(){ location.reload(); },400); });
    })
    .catch(function(){});
}
window.addEventListener('load',function(){ setTimeout(verifierMaj,1500); });
document.addEventListener('visibilitychange',function(){ if(!document.hidden) verifierMaj(); });
window.addEventListener('online',verifierMaj);
setInterval(verifierMaj,10*60000);
window.MHmaj=verifierMaj;

/* ---------- utils ---------- */
function isStandalone(){
  return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
}
function isIOS(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function dismissedRecently(){
  var t=parseInt(localStorage.getItem(LS_DISMISS)||'0');
  return t && (Date.now()-t) < DISMISS_DAYS*86400000;
}
function setDismissed(){try{localStorage.setItem(LS_DISMISS,String(Date.now()))}catch(e){}}

/* ---------- bannière discrète ---------- */
function ensureBar(){
  var b=document.getElementById('installBar');
  if(b)return b;
  b=document.createElement('div');
  b.id='installBar';
  b.className='installbar';
  b.innerHTML=''
    +'<div class="ib-ic"><img src="assets/icon-192.png" alt=""></div>'
    +'<div class="ib-tx"><b id="ibTitle">Installer Magic Hands</b><span id="ibSub">Accès rapide depuis ton écran d\'accueil</span></div>'
    +'<button class="ib-go" id="ibGo">Installer</button>'
    +'<button class="ib-x" id="ibClose" aria-label="Fermer">✕</button>';
  document.body.appendChild(b);
  document.getElementById('ibClose').onclick=function(){hideBar();setDismissed()};
  return b;
}
function showBar(mode){
  if(isStandalone()||dismissedRecently())return;
  var b=ensureBar();
  var go=document.getElementById('ibGo');
  if(mode==='ios'){
    document.getElementById('ibSub').textContent='Partage ⬆️ puis "Sur l\'écran d\'accueil"';
    go.style.display='none';
  }else{
    document.getElementById('ibSub').textContent='Accès rapide depuis ton écran d\'accueil';
    go.style.display='inline-flex';
    go.onclick=function(){
      hideBar();
      if(!deferredPrompt)return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(choice){
        if(choice.outcome==='accepted'){ if(window.MH&&window.MH.toast)window.MH.toast('App installée ✓'); }
        deferredPrompt=null;
      });
    };
  }
  requestAnimationFrame(function(){b.classList.add('show')});
}
function hideBar(){var b=document.getElementById('installBar');if(b)b.classList.remove('show')}

window.addEventListener('beforeinstallprompt',function(e){
  e.preventDefault();
  deferredPrompt=e;
  setTimeout(function(){showBar('android')},6000);
});
window.addEventListener('appinstalled',function(){hideBar();setDismissed()});

/* iOS : pas d'event natif -> on propose après un court délai si pas déjà en standalone */
if(isIOS() && !isStandalone()){
  setTimeout(function(){showBar('ios')},7000);
}

/* ---------- resync auto au retour réseau ---------- */
window.addEventListener('online',function(){
  if(window.MH&&window.MH.toast)window.MH.toast('Connexion rétablie — synchronisation…');
  if(window.MHsync&&window.MHsync.connect)window.MHsync.connect(null,function(){});
});
window.addEventListener('offline',function(){
  if(window.MH&&window.MH.toast)window.MH.toast('Hors-ligne — tes données restent en local');
});
})();

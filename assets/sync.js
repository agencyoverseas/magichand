/* ============================================================
   sync.js — Synchronisation offline-first (Supabase par RPC)
   Ne lit/écrit plus la table directement : tout passe par
   mh_state_get / mh_state_put / mh_state_rev, protégées par le
   code atelier (saisi une fois par appareil, jamais dans le dépôt).
   Le temps réel est remplacé par un sondage léger (mh_state_rev),
   car une table verrouillée ne diffuse plus d'événements Realtime.
   ============================================================ */
(function(){
"use strict";
var KEYS={cat:'mh_catalog_v3',cli:'mh_clients_v3',gen:'mh_gencount_v3',set:'mh_settings_v1',con:'mh_contacts_v1'};
var TS_KEY='mh_ts';
var POLL_MS=15000;
var applying=false, pushTimer=null, pollTimer=null, ready=false, lastRev=-1;

function api(){ return window.MHapi; }
function configured(){ return !!(api()&&api().configured()); }
function now(){ return Date.now(); }
function lsGet(k,f){ try{ var v=JSON.parse(localStorage.getItem(k)); return v==null?f:v; }catch(e){ return f; } }

function localState(){
  if(window.MH&&window.MH.data){
    var d=window.MH.data();
    return {cat:d.cat,clients:d.clients,contacts:d.contacts,gencount:d.gencount,settings:d.settings,
            ts:parseInt(localStorage.getItem(TS_KEY)||'0')||0};
  }
  return {cat:lsGet(KEYS.cat,null),clients:lsGet(KEYS.cli,[]),contacts:lsGet(KEYS.con,[]),
          gencount:lsGet(KEYS.gen,0),settings:lsGet(KEYS.set,{}),
          ts:parseInt(localStorage.getItem(TS_KEY)||'0')||0};
}

/* ---------- badge UI ---------- */
function setDot(state,msg){
  var d=document.getElementById('syncDot');
  if(d){ d.className='syncdot '+state; d.title=msg||state; }
  renderBox();
}

/* ---------- fusion best-effort ---------- */
function clientId(c){
  return c.id||('cl_'+(((c.prenom||'')+'|'+(c.nom||'')+'|'+(c.formation||'')).toLowerCase().replace(/\s+/g,'')));
}
function mergeListById(a,b,idf,tsf){
  var map={},out=[],seen=[];
  (a||[]).concat(b||[]).forEach(function(x){
    var id=idf(x);
    if(seen.indexOf(id)<0){ map[id]=x; seen.push(id); }
    else if(tsf(x)>=tsf(map[id])) map[id]=x;
  });
  seen.forEach(function(id){ out.push(map[id]); });
  return out;
}
function merge(local,remote){
  if(!remote) return local; if(!local) return remote;
  var contacts=mergeListById(local.contacts,remote.contacts,function(c){return c.id;},function(c){return c.ts||0;});
  var clients=mergeListById(local.clients,remote.clients,clientId,function(c){return c.ts||c._ts||0;});
  var newer=(remote.ts||0)>(local.ts||0)?remote:local;
  return {
    cat:newer.cat||local.cat||remote.cat,
    settings:newer.settings||local.settings||remote.settings,
    gencount:Math.max(local.gencount||0,remote.gencount||0),
    clients:clients, contacts:contacts,
    ts:Math.max(local.ts||0,remote.ts||0)
  };
}

/* ---------- application du distant vers le local ---------- */
function fireStorage(key,val){
  try{ window.dispatchEvent(new StorageEvent('storage',{key:key,newValue:val,storageArea:localStorage})); }
  catch(e){
    try{ var ev=document.createEvent('StorageEvent');
      ev.initStorageEvent('storage',false,false,key,null,val,location.href,localStorage);
      window.dispatchEvent(ev); }catch(_){}
  }
}
function applyState(st){
  if(!st) return;
  applying=true;
  function put(key,val){ var s=JSON.stringify(val); localStorage.setItem(key,s); fireStorage(key,s); }
  if(st.cat!=null)      put(KEYS.cat,st.cat);
  if(st.clients!=null)  put(KEYS.cli,st.clients);
  if(st.contacts!=null) put(KEYS.con,st.contacts);
  if(st.gencount!=null) put(KEYS.gen,st.gencount);
  if(st.settings!=null) put(KEYS.set,st.settings);
  applying=false;
}

/* ---------- entrées / sorties ---------- */
function pull(){
  if(!configured()||!api().hasCode()) return Promise.resolve(null);
  return api().admin.stateGet().then(function(d){ return d||null; })
    .catch(function(e){ setDot('err',e.message||'Erreur lecture'); return null; });
}
function push(){
  /* Le pont mh-bridge.js est devenu la source de vérité : les
     données partent maintenant dans les tables par module.
     mh_state n'est plus alimenté pour ne pas avoir deux copies
     qui divergent. La lecture reste possible en secours. */
  if(window.MH_BRIDGE_ON) return Promise.resolve();
  if(!configured()||!api().hasCode()||!ready) return Promise.resolve();
  var st=localState(); st.ts=now();
  try{ localStorage.setItem(TS_KEY,String(st.ts)); }catch(e){}
  setDot('sync','Envoi…');
  return api().admin.statePut(st).then(function(rev){
    lastRev=(rev==null?lastRev:rev); setDot('ok','Synchronisé');
  }).catch(function(e){ setDot('err',e.message||'Erreur écriture'); });
}
function schedulePush(){
  if(applying||!ready) return;
  clearTimeout(pushTimer); pushTimer=setTimeout(push,900);
}

/* ---------- sondage (remplace le temps réel) ---------- */
function startPoll(){
  clearInterval(pollTimer);
  pollTimer=setInterval(function(){
    if(!ready||document.hidden||!navigator.onLine) return;
    api().admin.stateRev().then(function(rev){
      if(rev==null||rev===lastRev) return;
      lastRev=rev;
      return pull().then(function(remote){
        if(!remote) return;
        applyState(merge(localState(),remote));
        setDot('ok','À jour');
      });
    }).catch(function(){});
  },POLL_MS);
}

/* ---------- connexion ---------- */
function connect(code,cb){
  if(!configured()){ setDot('off','Non configuré'); return cb&&cb(false); }
  var suite=function(){
    setDot('sync','Connexion…');
    pull().then(function(remote){
      applyState(merge(localState(),remote));
      ready=true;
      return push();
    }).then(function(){
      startPoll(); setDot('ok','Synchronisé');
      if(window.MHemarg&&window.MHemarg.refresh) window.MHemarg.refresh();
      cb&&cb(true);
    }).catch(function(e){ setDot('err',e.message||'Erreur'); cb&&cb(false,e.message); });
  };
  if(code){
    api().testCode(code).then(function(){ api().setCode(code); suite(); })
      .catch(function(e){ setDot('err',e.message||'Code refusé'); cb&&cb(false,e.message); });
  } else {
    if(!api().hasCode()){ setDot('off','Code atelier requis'); return cb&&cb(false); }
    suite();
  }
}

/* ---------- interception des écritures locales ---------- */
var _set=localStorage.setItem.bind(localStorage);
localStorage.setItem=function(k,v){
  _set(k,v);
  if(!applying&&ready&&/^mh_/.test(k)&&k!==TS_KEY&&k!=='mh_ws'&&k!=='mh_code_v1'&&k!=='mh_em_seen_v1') schedulePush();
};

/* ---------- bloc de l'écran Compte ---------- */
function renderBox(){
  var box=document.getElementById('syncBox'); if(!box) return;
  var a=api();
  var st=document.getElementById('syncDot'); var label=st?st.title:'—';
  if(!configured()){
    box.innerHTML='<div class="subttl">☁️ Synchronisation</div>'
      +'<div class="note">Pas encore configuré : colle l\'URL + la clé anon dans <b>config.js</b>, puis redéploie.</div>';
    return;
  }
  if(a.hasCode()){
    box.innerHTML='<div class="subttl">☁️ Synchronisation tel ⇄ ordinateur</div>'
      +'<div class="note">Cet appareil est autorisé. Les données restent en local (hors-ligne) et se resynchronisent au retour du réseau.</div>'
      +'<div class="acts"><button class="btn cta" id="wsConnect">🔄 Resynchroniser</button>'
      +'<button class="btn gold" id="wsForget">Oublier ce code</button></div>'
      +'<div class="note" style="margin-top:10px">Statut : <b id="syncLabel">'+(label||'—')+'</b></div>';
    document.getElementById('wsConnect').onclick=function(){
      connect(null,function(ok){ toastSafe(ok?'Synchronisé ✓':'Vérifie le réseau'); });
    };
    document.getElementById('wsForget').onclick=function(){
      a.clearCode(); ready=false; clearInterval(pollTimer);
      setDot('off','Code atelier requis'); toastSafe('Code oublié sur cet appareil');
    };
    return;
  }
  box.innerHTML='<div class="subttl">☁️ Synchronisation tel ⇄ ordinateur</div>'
    +'<div class="note">Saisis le <b>code atelier</b> une seule fois sur cet appareil. Il n\'est jamais publié sur le site : il reste dans ce navigateur et est vérifié côté serveur.</div>'
    +'<div class="fld"><label>Code atelier</label><input id="wsInput" type="password" placeholder="code fourni par NexusAI" autocomplete="off"></div>'
    +'<div class="acts"><button class="btn cta" id="wsConnect">🔗 Autoriser cet appareil</button></div>'
    +'<div class="note" style="margin-top:10px">Statut : <b id="syncLabel">'+(label||'—')+'</b></div>';
  document.getElementById('wsConnect').onclick=function(){
    var v=(document.getElementById('wsInput').value||'').trim();
    if(!v){ toastSafe('Entre le code atelier'); return; }
    connect(v,function(ok,msg){ toastSafe(ok?'Appareil autorisé ✓':(msg||'Code refusé')); });
  };
}
function toastSafe(m){ if(window.MH&&window.MH.toast) window.MH.toast(m); }

/* ---------- exposition ---------- */
window.MHsync={connect:connect,push:push,pull:pull,merge:merge,_apply:applyState,_local:localState,
  status:function(){ return {ready:ready,configured:configured(),code:!!(api()&&api().hasCode())}; }};

/* ---------- démarrage ---------- */
function boot(){
  renderBox();
  if(!configured()){ setDot('off','Local (non configuré)'); return; }
  if(api().hasCode()) connect(null);
  else setDot('off','Code atelier requis');
}
window.addEventListener('online',function(){ if(ready) push(); });
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();

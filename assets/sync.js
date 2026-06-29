/* ============================================================
   sync.js — Synchronisation offline-first (Supabase)
   Découplé d'app.js : intercepte localStorage pour pousser,
   et ré-injecte le distant via l'event 'storage' qu'app.js écoute.
   Sans config (config.js vide) => l'app reste 100% locale.
   ============================================================ */
(function(){
"use strict";
var KEYS={cat:'mh_catalog_v3',cli:'mh_clients_v3',gen:'mh_gencount_v3',set:'mh_settings_v1',con:'mh_contacts_v1'};
var WS_KEY='mh_ws', TS_KEY='mh_ts';
var cfg=window.MH_SUPABASE||{};
var sb=null, channel=null, applying=false, pushTimer=null, ready=false;

function ws(){return ((cfg.workspace==null?'':(''+cfg.workspace)).trim())||(localStorage.getItem(WS_KEY)||'').trim();}
function setWs(v){localStorage.setItem(WS_KEY,(v||'').trim());}
function now(){return Date.now();}
function lsGet(k,f){try{var v=JSON.parse(localStorage.getItem(k));return v==null?f:v;}catch(e){return f;}}
function localState(){
  if(window.MH&&window.MH.data){var d=window.MH.data();
    return {cat:d.cat,clients:d.clients,contacts:d.contacts,gencount:d.gencount,settings:d.settings,ts:parseInt(localStorage.getItem(TS_KEY)||'0')||0};}
  return {cat:lsGet(KEYS.cat,null),clients:lsGet(KEYS.cli,[]),contacts:lsGet(KEYS.con,[]),gencount:lsGet(KEYS.gen,0),settings:lsGet(KEYS.set,{}),ts:parseInt(localStorage.getItem(TS_KEY)||'0')||0};
}

/* ---------- badge UI ---------- */
function setDot(state,msg){var d=document.getElementById('syncDot');if(d){d.className='syncdot '+state;d.title=msg||state;}renderBox();}

/* ---------- merge best-effort ---------- */
function clientId(c){return c.id||('cl_'+(((c.prenom||'')+'|'+(c.nom||'')+'|'+(c.formation||'')).toLowerCase().replace(/\s+/g,'')));}
function mergeListById(a,b,idf,tsf){
  var map={},out=[],seen=[];
  (a||[]).concat(b||[]).forEach(function(x){var id=idf(x);
    if(seen.indexOf(id)<0){map[id]=x;seen.push(id);}else{if(tsf(x)>=tsf(map[id]))map[id]=x;}});
  seen.forEach(function(id){out.push(map[id]);});return out;
}
function merge(local,remote){
  if(!remote)return local; if(!local)return remote;
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

/* ---------- apply remote -> local (sans toucher app.js) ---------- */
function fireStorage(key,val){
  try{window.dispatchEvent(new StorageEvent('storage',{key:key,newValue:val,storageArea:localStorage}));}
  catch(e){try{var ev=document.createEvent('StorageEvent');ev.initStorageEvent('storage',false,false,key,null,val,location.href,localStorage);window.dispatchEvent(ev);}catch(_){}}
}
function applyState(st){
  applying=true;
  function put(key,val){var s=JSON.stringify(val);localStorage.setItem(key,s);fireStorage(key,s);}
  if(st.cat!=null)put(KEYS.cat,st.cat);
  if(st.clients!=null)put(KEYS.cli,st.clients);
  if(st.contacts!=null)put(KEYS.con,st.contacts);
  if(st.gencount!=null)put(KEYS.gen,st.gencount);
  if(st.settings!=null)put(KEYS.set,st.settings);
  applying=false;
}

/* ---------- Supabase IO ---------- */
function pull(cb){
  if(!sb||!ws())return cb&&cb(null);
  sb.from('mh_state').select('data,updated_at').eq('workspace',ws()).maybeSingle().then(function(r){
    if(r.error){setDot('err','Erreur lecture');return cb&&cb(null);}
    var d=r.data?r.data.data:null;
    if(d&&!d.ts&&r.data.updated_at)d.ts=Date.parse(r.data.updated_at);
    cb&&cb(d);
  },function(){setDot('err','Réseau');cb&&cb(null);});
}
function push(){
  if(!sb||!ws())return;
  var st=localState(); st.ts=now(); localStorage.setItem(TS_KEY,String(st.ts));
  setDot('sync','Envoi…');
  sb.from('mh_state').upsert({workspace:ws(),data:st,updated_at:new Date().toISOString()},{onConflict:'workspace'}).then(function(r){
    if(r.error){setDot('err','Erreur écriture');}else{setDot('ok','Synchronisé');}
  },function(){setDot('err','Réseau');});
}
function schedulePush(){if(applying||!sb||!ws())return;clearTimeout(pushTimer);pushTimer=setTimeout(push,900);}

/* ---------- realtime ---------- */
function subscribe(){
  if(!sb||!ws())return; if(channel){try{sb.removeChannel(channel);}catch(e){}channel=null;}
  channel=sb.channel('mh_'+ws())
    .on('postgres_changes',{event:'*',schema:'public',table:'mh_state',filter:'workspace=eq.'+ws()},function(payload){
      var d=payload['new']&&payload['new'].data; if(!d)return;
      if(!d.ts&&payload['new'].updated_at)d.ts=Date.parse(payload['new'].updated_at);
      applyState(merge(localState(),d)); setDot('ok','À jour');
    }).subscribe();
}

/* ---------- connect ---------- */
function connect(code,cb){
  if(!(cfg.url&&cfg.anonKey)){setDot('off','Non configuré');return cb&&cb(false);}
  if(code!=null)setWs(code);
  if(!ws()){setDot('off','Aucun code atelier');return cb&&cb(false);}
  if(!sb){try{sb=window.supabase.createClient(cfg.url,cfg.anonKey,{realtime:{params:{eventsPerSecond:3}}});}catch(e){setDot('err','SDK indisponible');return cb&&cb(false);}}
  setDot('sync','Connexion…');
  pull(function(remote){
    applyState(merge(localState(),remote));
    ready=true; push(); subscribe();
    setDot('ok','Synchronisé'); cb&&cb(true);
  });
}

/* ---------- intercept localStorage writes ---------- */
var _set=localStorage.setItem.bind(localStorage);
localStorage.setItem=function(k,v){_set(k,v);
  if(!applying&&ready&&/^mh_/.test(k)&&k!==TS_KEY&&k!==WS_KEY)schedulePush();
};

/* ---------- settings box (écran Compte) ---------- */
function renderBox(){
  var box=document.getElementById('syncBox'); if(!box)return;
  var on=!!(cfg.url&&cfg.anonKey);
  var fixed=!!(cfg.workspace&&(''+cfg.workspace).trim());
  var st=document.getElementById('syncDot'); var label=st?st.title:'—';
  if(fixed){
    box.innerHTML=''
      +'<div class="subttl">☁️ Synchronisation tel ⇄ ordinateur</div>'
      +(on?'<div class="note">Activée automatiquement — espace partagé, aucun code à saisir.</div>'
          :'<div class="note">Pas encore configuré : colle l\'URL + la clé anon dans <b>config.js</b>, puis redéploie.</div>')
      +'<div class="acts"><button class="btn cta" id="wsConnect">🔄 Resynchroniser</button></div>'
      +'<div class="note" style="margin-top:10px">Statut : <b id="syncLabel">'+(label||'—')+'</b>. Les données restent en local (hors-ligne) et se resynchronisent au retour du réseau.</div>';
    var bf=document.getElementById('wsConnect');
    if(bf)bf.onclick=function(){connect(null,function(ok){toastSafe(ok?'Synchronisé ✓':'Vérifie config.js / le réseau');});};
    return;
  }
  box.innerHTML=''
    +'<div class="subttl">☁️ Synchronisation tel ⇄ ordinateur</div>'
    +(on?'':'<div class="note">Pas encore configuré : ouvre <b>config.js</b> (racine du site) et colle l\'URL + la clé anon de ton projet Supabase, puis redéploie.</div>')
    +'<div class="fld"><label>Code atelier — le même code = les mêmes données partout</label>'
    +'<input id="wsInput" placeholder="ex : magic-hands-2026" value="'+(ws()||'')+'"></div>'
    +'<div class="acts"><button class="btn cta" id="wsConnect">'+(ready?'🔄 Resynchroniser':'🔗 Connecter')+'</button></div>'
    +'<div class="note" style="margin-top:10px">Statut : <b id="syncLabel">'+(label||'—')+'</b>. Les données restent en local (hors-ligne) et se resynchronisent au retour du réseau.</div>';
  var b=document.getElementById('wsConnect');
  if(b)b.onclick=function(){var v=(document.getElementById('wsInput').value||'').trim();
    if(!v){toastSafe('Entre un code atelier');return;}
    connect(v,function(ok){toastSafe(ok?'Synchronisé ✓':'Vérifie config.js / le réseau');});};
}
function toastSafe(m){if(window.MH&&window.MH.toast)window.MH.toast(m);}

/* ---------- expose (tests + manuel) ---------- */
window.MHsync={connect:connect,push:push,pull:pull,merge:merge,_apply:applyState,_local:localState,
  status:function(){return {ready:ready,ws:ws(),configured:!!(cfg.url&&cfg.anonKey)};}};

/* ---------- boot ---------- */
function boot(){ renderBox();
  if(cfg.url&&cfg.anonKey){ if(ws())connect(null); else setDot('off','Entre un code atelier'); }
  else setDot('off','Local (non configuré)');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

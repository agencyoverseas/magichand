/* ============================================================
   notif.js — Cloche de notifications (mobile + desktop)
   Écoute window.MH.toast() sans modifier app.js : chaque toast
   devient une notif horodatée dans la liste déroulante.
   ============================================================ */
(function(){
"use strict";
var LS_KEY='mh_notifs_v1';
var list=[];
try{list=JSON.parse(localStorage.getItem(LS_KEY))||[]}catch(e){list=[]}

function save(){try{localStorage.setItem(LS_KEY,JSON.stringify(list.slice(0,20)))}catch(e){}}
function esc(s){return (''+(s||'')).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])})}
function timeAgo(ts){
  var d=Date.now()-ts;
  if(d<60000)return 'à l\'instant';
  if(d<3600000)return Math.floor(d/60000)+' min';
  if(d<86400000)return Math.floor(d/3600000)+' h';
  return Math.floor(d/86400000)+' j';
}
function iconFor(kind){
  if(kind==='sync')return '#ic-sync';
  if(kind==='ok')return '#ic-check';
  return '#ic-doc';
}
function push(msg,kind){
  if(!msg)return;
  list.unshift({msg:msg,ts:Date.now(),kind:kind||'doc',read:false});
  list=list.slice(0,20);
  save();render();
}
function render(){
  var unread=list.filter(function(n){return !n.read}).length;
  ['bellDot','bellDotD'].forEach(function(id){var d=document.getElementById(id);if(d)d.style.display=unread?'block':'none'});
  var html=list.length
    ? list.map(function(n){return '<div class="nitem-row"><span class="ic"><svg><use href="'+iconFor(n.kind)+'"/></svg></span><div class="tx"><b>'+esc(n.msg)+'</b><span>'+timeAgo(n.ts)+'</span></div></div>'}).join('')
    : '<div class="notif-empty">Aucune notification pour l\'instant.</div>';
  ['notifList','notifListD'].forEach(function(id){var e=document.getElementById(id);if(e)e.innerHTML=html});
}
function markRead(){list.forEach(function(n){n.read=true});save();render()}

/* hook sur MH.toast sans le remplacer côté app.js (wrap) */
function attach(){
  if(!window.MH||!window.MH.toast||window.MH.toast._notifWrapped)return false;
  var orig=window.MH.toast;
  var wrapped=function(m){
    var kind='doc';
    if(/synchron/i.test(m))kind='sync';
    if(/✓|ajouté|export|import/i.test(m))kind='ok';
    push(m,kind);
    return orig(m);
  };
  wrapped._notifWrapped=true;
  window.MH.toast=wrapped;
  return true;
}
var tries=0;
(function wait(){ if(attach())return; if(tries++>60)return; setTimeout(wait,120); })();

document.addEventListener('click',function(e){
  if(e.target.closest('#btnBell')||e.target.closest('#btnBellD'))setTimeout(markRead,400);
});

render();
window.MHnotif={push:push,list:function(){return list}};
})();

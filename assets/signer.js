/* ============================================================
   signer.js — Page élève. Ne connaît QUE le token de sa feuille.
   Aucun accès aux données de l'agence : tout passe par les RPC
   mh_em_get / mh_em_sign, qui ne renvoient que cette feuille.
   ============================================================ */
(function(){
"use strict";

var token=(new URLSearchParams(location.search)).get('t')||'';
var feuille=null;

function byId(id){ return document.getElementById(id); }
function esc(s){ return (''+(s==null?'':s)).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])}); }
function today(){
  var d=new Date(), p=function(n){return (n<10?'0':'')+n};
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
function fmt(iso){ if(!iso) return '—'; var p=(''+iso).split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):(''+iso); }
function toast(m){
  var t=byId('toast'); if(!t) return;
  t.textContent=m; t.classList.add('show');
  clearTimeout(t._); t._=setTimeout(function(){ t.classList.remove('show'); },2600);
}
function ecran(html){ byId('sgMain').innerHTML=html; }

/* ---------- chargement ---------- */
function charger(){
  if(!token){ return ecran(erreur('Lien incomplet','Ouvre le lien exact reçu de ta formatrice.')); }
  if(!window.MHapi||!MHapi.configured()){ return ecran(erreur('Service indisponible','Réessaie dans un moment.')); }
  MHapi.eleve.get(token).then(function(f){ feuille=f; rendre(); })
    .catch(function(e){ ecran(erreur('Lien invalide', e.message||'Demande un nouveau lien à ta formatrice.')); });
}
function erreur(t,s){ return '<div class="sg-card sg-err"><b>'+esc(t)+'</b><p>'+esc(s)+'</p></div>'; }

/* ---------- rendu ---------- */
function creneauxDuJour(){
  var d=feuille.data||{}, c=d.cols||{}, t=today(), out=[];
  (d.lignes||[]).forEach(function(l){
    if(l.date!==t) return;
    if(c.stagiaireM) out.push({ligne:l,slot:'matin',label:'Matin',horaire:(d.horaires&&d.horaires.matin)||''});
    if(c.stagiaireA) out.push({ligne:l,slot:'aprem',label:'Après-midi',horaire:(d.horaires&&d.horaires.aprem)||''});
  });
  return out;
}
function signature(lid,slot){
  var sg=(feuille.data&&feuille.data.sign)||{};
  return (sg[lid]&&sg[lid][slot])||null;
}
function rendre(){
  var d=feuille.data||{}, e=d.entete||{};
  var jours=creneauxDuJour();

  var recap=(d.lignes||[]).map(function(l){
    var c=d.cols||{}, cells=[];
    if(c.stagiaireM) cells.push(etat(l,'matin','Matin'));
    if(c.stagiaireA) cells.push(etat(l,'aprem','Après-midi'));
    return '<div class="sg-row"><b>'+esc(fmt(l.date))+'</b><div class="sg-cells">'+cells.join('')+'</div></div>';
  }).join('')||'<div class="sg-muted">Aucune journée programmée.</div>';

  var bloc;
  if(feuille.locked){
    bloc='<div class="sg-card sg-info"><b>Feuille clôturée</b><p>Tu ne peux plus signer. Contacte ta formatrice si besoin.</p></div>';
  } else if(!jours.length){
    bloc='<div class="sg-card sg-info"><b>Rien à signer aujourd\'hui</b>'
        +'<p>On ne peut signer que le jour même de la formation. Reviens sur ce lien le jour J.</p></div>';
  } else {
    bloc='<div class="sg-card"><b>Aujourd\'hui — '+esc(fmt(today()))+'</b>'
      + jours.map(function(j){
          var s=signature(j.ligne.id,j.slot);
          if(s&&s.valide) return '<div class="sg-slot done"><span>'+esc(j.label)+'</span><em>signé et validé ✓</em></div>';
          if(s) return '<div class="sg-slot done"><span>'+esc(j.label)+'</span>'
             +'<em>signé à '+esc((s.ts||'').slice(11,16))+'</em>'
             +'<button class="btn gold" data-sign="'+j.ligne.id+'|'+j.slot+'">Refaire</button></div>';
          return '<div class="sg-slot"><span>'+esc(j.label)+'<small>'+esc(j.horaire)+'</small></span>'
             +'<button class="btn cta" data-sign="'+j.ligne.id+'|'+j.slot+'">Signer</button></div>';
        }).join('')
      +'</div>';
  }

  ecran(''
    +'<div class="sg-card sg-id">'
      +'<b>'+esc(e.stagiaire||'Stagiaire')+'</b>'
      +'<p>'+esc(feuille.formation||'')+'</p>'
      +(e.periode?'<p class="sg-muted">Période : '+esc(e.periode)+'</p>':'')
      +(e.lieu?'<p class="sg-muted">Lieu : '+esc(e.lieu)+'</p>':'')
    +'</div>'
    + bloc
    +'<div class="sg-card"><b>Mes émargements</b><div class="sg-recap">'+recap+'</div></div>'
    +'<div class="sg-legal">Signature électronique horodatée. En signant, tu certifies ta présence sur le créneau concerné.</div>'
  );

  Array.prototype.slice.call(document.querySelectorAll('[data-sign]')).forEach(function(b){
    b.onclick=function(){ var p=b.getAttribute('data-sign').split('|'); ouvrirPad(p[0],p[1]); };
  });
}
function etat(l,slot,label){
  var s=signature(l.id,slot);
  var abs=l.absent&&l.absent[slot];
  var cls=abs?'abs':(s?(s.valide?'ok':'sig'):'no');
  var txt=abs?'absent':(s?(s.valide?'validé':'signé'):'—');
  return '<span class="sg-cell '+cls+'">'+esc(label)+' : '+esc(txt)+'</span>';
}

/* ---------- pad de signature ---------- */
function ouvrirPad(lid,slot){
  var m=document.createElement('div'); m.className='confirm-bg show sg-pad';
  m.innerHTML='<div class="confirm-box">'
    +'<p>Signe dans le cadre</p>'
    +'<canvas id="sgC" class="sig-canvas" width="900" height="300"></canvas>'
    +'<label class="em-cb"><input type="checkbox" id="sgOk"> Je certifie ma présence sur ce créneau</label>'
    +'<div class="acts"><button class="btn gold" id="sgClr">Effacer</button>'
    +'<button class="btn gold" id="sgNo">Annuler</button>'
    +'<button class="btn cta" id="sgGo">Valider</button></div></div>';
  document.body.appendChild(m);

  var pad=makePad(m.querySelector('#sgC'));
  m.querySelector('#sgClr').onclick=function(){ pad.clear(); };
  m.querySelector('#sgNo').onclick=function(){ m.remove(); };
  m.querySelector('#sgGo').onclick=function(){
    if(pad.vide()){ toast('La signature est vide'); return; }
    if(!m.querySelector('#sgOk').checked){ toast('Coche la case de certification'); return; }
    var b=m.querySelector('#sgGo'); b.disabled=true; b.textContent='Envoi…';
    MHapi.eleve.sign(token,lid,slot,pad.png(),pad.pts()).then(function(){
      m.remove(); toast('Présence enregistrée ✓');
      return MHapi.eleve.get(token).then(function(f){ feuille=f; rendre(); });
    }).catch(function(e){
      b.disabled=false; b.textContent='Valider'; toast(e.message||'Échec de l\'envoi');
    });
  };
}
function makePad(canvas){
  var ctx=canvas.getContext('2d'), on=false, vide=true, pts=[], cur=null;
  function fond(){ ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); }
  fond(); ctx.lineWidth=3.2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#12251f';
  function pos(e){
    var r=canvas.getBoundingClientRect(), t=(e.touches&&e.touches[0])||e;
    return {x:(t.clientX-r.left)*(canvas.width/r.width), y:(t.clientY-r.top)*(canvas.height/r.height)};
  }
  function down(e){ e.preventDefault(); on=true; vide=false; cur=[]; pts.push(cur);
    var p=pos(e); cur.push([Math.round(p.x),Math.round(p.y)]); ctx.beginPath(); ctx.moveTo(p.x,p.y); }
  function move(e){ if(!on) return; e.preventDefault(); var p=pos(e);
    cur.push([Math.round(p.x),Math.round(p.y)]); ctx.lineTo(p.x,p.y); ctx.stroke(); }
  function up(){ on=false; }
  canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move);
  window.addEventListener('mouseup',up);
  canvas.addEventListener('touchstart',down,{passive:false});
  canvas.addEventListener('touchmove',move,{passive:false});
  canvas.addEventListener('touchend',up);
  return { clear:function(){ fond(); vide=true; pts=[]; }, vide:function(){ return vide; },
           png:function(){ return canvas.toDataURL('image/png'); }, pts:function(){ return pts; } };
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',charger); else charger();
})();

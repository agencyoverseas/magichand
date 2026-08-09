/* ============================================================
   emargement.js — Feuilles d'émargement (côté gérante)
   - 1 feuille par élève + formation, créée automatiquement
   - Édition WYSIWYG : PC = édition dans la case, mobile = mini-fiche
   - PDF (multi-pages), lien WhatsApp, QR code, export CSV
   - Validation case par case, clôture, archivage
   Toutes les écritures passent par MHapi (RPC + code atelier).
   ============================================================ */
(function(){
"use strict";

var SEEN_KEY = 'mh_em_seen_v1';
var sheets = [], loaded = false, busyLoad = false, curId = null;

/* ---------- utils ---------- */
function byId(id){ return document.getElementById(id); }
function $(s,r){ return (r||document).querySelector(s); }
function $$(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
function esc(s){ return (''+(s==null?'':s)).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])}); }
function toast(m){ if(window.MH&&window.MH.toast) window.MH.toast(m); }
function today(){ return new Date().toISOString().slice(0,10); }
function fmt(iso){ if(!iso) return '—'; var p=(''+iso).split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):(''+iso); }
function isDesktop(){ return window.matchMedia ? window.matchMedia('(min-width:981px)').matches : window.innerWidth>=981; }
function lid(){ return 'L'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function settings(){ return (window.MH&&window.MH.data)?(window.MH.data().settings||{}):{}; }
function catalogue(){ return (window.MH&&window.MH.data)?(window.MH.data().cat||{modules:[],offers:[],sessions:[]}):{modules:[],offers:[],sessions:[]}; }
function fiches(){ return (window.MH&&window.MH.fiches)?window.MH.fiches():[]; }
function seen(){ try{ return JSON.parse(localStorage.getItem(SEEN_KEY))||{}; }catch(e){ return {}; } }
function setSeen(o){ try{ localStorage.setItem(SEEN_KEY,JSON.stringify(o)); }catch(e){} }

/* ---------- modèle par défaut d'une feuille ---------- */
function sessionPour(formation){
  var ses=(catalogue().sessions||[]).slice().sort(function(a,b){return (a.s||'').localeCompare(b.s||'')});
  var t=today(),futur=ses.filter(function(s){return (s.e||'')>=t});
  return (futur[0]||ses[ses.length-1]||null);
}
function joursEntre(d1,d2){
  var out=[]; if(!d1) return out;
  var a=new Date(d1+'T00:00:00'), b=new Date((d2||d1)+'T00:00:00'), g=0;
  while(a<=b && g<60){ out.push(a.toISOString().slice(0,10)); a.setDate(a.getDate()+1); g++; }
  return out;
}
function defautData(fiche,formation){
  var s=settings(), ses=sessionPour(formation);
  var jours=ses?joursEntre(ses.s,ses.e):[today()];
  return {
    entete:{
      organisme: s.emOrganisme || ((s.etab||'MAGIC HANDS (SARL)')+"\n22, chemin Dupuis Vert\n95000 Cergy\nTél : 06.66.63.12.59\nSiret : 913 485 413 00037\nMail : jordan@magichands-massage.fr"),
      titre:'FEUILLE D\'EMARGEMENT',
      stagiaire:((fiche.prenom||'')+' '+((fiche.nom||'').toUpperCase())).trim(),
      formation:formation||'',
      periode: ses?(fmt(ses.s)+' au '+fmt(ses.e)):'',
      lieu: s.emLieu || (s.lieuDef||'Paris')
    },
    horaires:{ matin:'10H00 à 13H00', aprem:'14H00 à 18H00', fmatin:'09H00 à 13H00', faprem:'14H00 à 18H00' },
    cols:{ stagiaireM:true, stagiaireA:true, formateurM:true, formateurA:true },
    formateur:{ nom:(s.formateur||'Jordan LY-PINTO'), signature:null },
    pied:{
      bloc: s.emPied || ((s.etab||'MAGIC HANDS (SARL)')+"\n22, chemin Dupuis Vert\n95000 Cergy"),
      maj: today(),
      organisme: s.emOrgBloc || ("L'organisme de formation\n"+(s.etab||'MAGIC HANDS (SARL)')+"\n"+(s.formateur||'Jordan LY-PINTO')+" (Gérant)")
    },
    lignes: jours.map(function(d){ return {id:lid(), date:d, formateur:(s.formateur||'Jordan LY-PINTO'), absent:{}}; }),
    sign:{}
  };
}

/* ---------- statut calculé ---------- */
function attendues(d){
  var n=(d.lignes||[]).length, k=0;
  if(d.cols&&d.cols.stagiaireM)k++; if(d.cols&&d.cols.stagiaireA)k++;
  return n*k;
}
function signees(d){
  var n=0, sg=d.sign||{};
  (d.lignes||[]).forEach(function(l){
    ['matin','aprem'].forEach(function(sl){
      var actif=(sl==='matin')?(d.cols&&d.cols.stagiaireM):(d.cols&&d.cols.stagiaireA);
      if(actif && sg[l.id] && sg[l.id][sl] && sg[l.id][sl].img) n++;
    });
  });
  return n;
}
function statutDe(s){
  var d=s.data||{}, a=attendues(d), n=signees(d);
  if(a===0) return 'a_signer';
  if(n===0) return 'a_signer';
  return (n>=a) ? 'complete' : 'partielle';
}
var STATUT_L={a_signer:'À signer',partielle:'Partiellement signée',complete:'Complète'};

/* ---------- chargement + création automatique ---------- */
function charger(){
  if(!window.MHapi || !MHapi.configured()) return Promise.reject(new Error('Supabase non configuré'));
  if(!MHapi.hasCode()) return Promise.reject(new Error('Code atelier manquant'));
  if(busyLoad) return Promise.resolve(sheets);
  busyLoad=true;
  return MHapi.admin.list().then(function(rows){
    sheets=rows||[]; loaded=true; busyLoad=false;
    return autoCreer().then(function(){ notifierCompletes(); return sheets; });
  }).catch(function(e){ busyLoad=false; throw e; });
}
function trouver(eid,formation){
  for(var i=0;i<sheets.length;i++)
    if(sheets[i].eleve_id===eid && (sheets[i].formation||'')===(formation||'')) return sheets[i];
  return null;
}
function autoCreer(){
  var manquants=[];
  fiches().forEach(function(f){
    if(!f.eid) return;
    var forms=(f.formations&&f.formations.length)?f.formations:[''];
    forms.forEach(function(fo){ if(!trouver(f.eid,fo)) manquants.push({f:f,fo:fo}); });
  });
  if(!manquants.length) return Promise.resolve();
  manquants=manquants.slice(0,30); /* garde-fou : pas plus de 30 créations d'un coup */
  return manquants.reduce(function(p,m){
    return p.then(function(){
      return MHapi.admin.save(m.f.eid, m.fo, defautData(m.f,m.fo), {statut:'a_signer'})
        .then(function(row){ if(row) sheets.unshift(row); })
        .catch(function(){});
    });
  }, Promise.resolve());
}
function notifierCompletes(){
  var vu=seen(), chg=false;
  sheets.forEach(function(s){
    var st=statutDe(s);
    if(st==='complete' && vu[s.id]!=='complete'){
      var nom=nomDe(s);
      if(vu[s.id]!==undefined && window.MHnotif){
        MHnotif.push('✓ '+nom+' — '+(s.formation||'formation')+' : feuille complète · '+lienDe(s),'ok');
      }
      vu[s.id]='complete'; chg=true;
    } else if(st!=='complete' && vu[s.id]!==st){ vu[s.id]=st; chg=true; }
  });
  if(chg) setSeen(vu);
}
function nomDe(s){
  var d=s.data||{};
  if(d.entete&&d.entete.stagiaire) return d.entete.stagiaire;
  var f=ficheDe(s.eleve_id);
  return f?((f.prenom||'')+' '+(f.nom||'').toUpperCase()).trim():'Élève';
}
function ficheDe(eid){ var all=fiches(); for(var i=0;i<all.length;i++) if(all[i].eid===eid) return all[i]; return null; }
function lienDe(s){ return location.origin+location.pathname.replace(/[^\/]*$/,'')+'signer.html?t='+encodeURIComponent(s.token); }

/* ---------- sauvegarde ---------- */
function sauver(s,opt){
  return MHapi.admin.save(s.eleve_id, s.formation||'', s.data, opt||{}).then(function(row){
    if(row){ for(var i=0;i<sheets.length;i++) if(sheets[i].id===row.id) sheets[i]=row; }
    return row;
  });
}

/* ================= ÉCRAN LISTE ================= */
var LIST_HTML=''
+'<div class="em-kpis">'
 +'<div class="em-k"><b id="emKSign">0</b><span>signatures posées</span></div>'
 +'<div class="em-k wait"><b id="emKWait">0</b><span>en attente</span></div>'
 +'<div class="em-k ok"><b id="emKTaux">—</b><span>taux de présence</span></div>'
+'</div>'
+'<div class="clients-bar"><input id="emSearch" placeholder="Rechercher un élève…">'
 +'<button class="btn gold" id="emCsv" style="flex:0 0 auto;min-width:130px">⬇️ Export CSV</button></div>'
+'<div class="filters-bar">'
 +'<select id="emFiltForm"><option value="">Toutes formations</option></select>'
 +'<select id="emFiltStat"><option value="">Tous statuts</option><option value="a_signer">À signer</option><option value="partielle">Partielle</option><option value="complete">Complète</option></select>'
 +'<select id="emSort"><option value="recent">Plus récentes</option><option value="old">Plus anciennes</option><option value="az">A → Z</option></select>'
 +'<label class="em-arch"><input type="checkbox" id="emShowArch"> Archivées</label>'
+'</div>'
+'<div id="emGroups"></div>';

function mount(sel){
  var m=$(sel); if(!m||m._mounted) return; m.innerHTML=LIST_HTML; m._mounted=true;
  byId('emSearch').oninput=renderList;
  byId('emFiltForm').onchange=renderList;
  byId('emFiltStat').onchange=renderList;
  byId('emSort').onchange=renderList;
  byId('emShowArch').onchange=renderList;
  byId('emCsv').onclick=exportCsv;
  rafraichir();
}
function rafraichir(){
  var host=byId('emGroups'); if(!host) return;
  if(!window.MHapi||!MHapi.configured()){ host.innerHTML=vide('Synchronisation non configurée.'); return; }
  if(!MHapi.hasCode()){ host.innerHTML=vide('Entre le code atelier dans l\'onglet Compte pour activer l\'émargement.'); return; }
  host.innerHTML='<div class="empty"><b>Chargement…</b></div>';
  charger().then(renderList).catch(function(e){ host.innerHTML=vide(e.message||'Erreur'); });
}
function vide(msg){ return '<div class="empty"><b>'+esc(msg)+'</b></div>'; }

function renderList(){
  var host=byId('emGroups'); if(!host) return;
  remplirFiltreForm();
  var q=(byId('emSearch').value||'').toLowerCase();
  var ff=byId('emFiltForm').value, fs=byId('emFiltStat').value;
  var sort=byId('emSort').value, arch=byId('emShowArch').checked;

  var vis=sheets.filter(function(s){
    if(!!s.archived!==!!arch) return false;
    if(ff && (s.formation||'')!==ff) return false;
    if(fs && statutDe(s)!==fs) return false;
    return (nomDe(s)+' '+(s.formation||'')).toLowerCase().indexOf(q)>=0;
  });
  vis.sort(function(a,b){
    if(sort==='az') return nomDe(a).localeCompare(nomDe(b));
    var da=Date.parse(a.updated_at||0)||0, db=Date.parse(b.updated_at||0)||0;
    return sort==='old'?(da-db):(db-da);
  });

  majKpi();
  if(!vis.length){ host.innerHTML=vide(arch?'Aucune feuille archivée.':'Aucune feuille — elles se créent avec les fiches élèves.'); return; }

  var groupes=['a_signer','partielle','complete'], html='';
  groupes.forEach(function(g){
    var items=vis.filter(function(s){return statutDe(s)===g});
    if(!items.length) return;
    html+='<div class="em-grp"><div class="em-grph"><b>'+STATUT_L[g]+'</b><span>'+items.length+'</span></div>'
       + items.map(carte).join('')+'</div>';
  });
  host.innerHTML=html;
}
function remplirFiltreForm(){
  var sel=byId('emFiltForm'); if(!sel) return; var cur=sel.value, forms=[];
  sheets.forEach(function(s){ var f=s.formation||''; if(f&&forms.indexOf(f)<0)forms.push(f); });
  sel.innerHTML='<option value="">Toutes formations</option>'+forms.map(function(f){return '<option>'+esc(f)+'</option>'}).join('');
  sel.value=cur;
}
function carte(s){
  var d=s.data||{}, a=attendues(d), n=signees(d), st=statutDe(s);
  return '<div class="em-card" data-em="'+s.id+'">'
   +'<div class="em-ci"><b>'+esc(nomDe(s))+'</b><span>'+esc(s.formation||'—')+'</span></div>'
   +'<span class="em-prog '+st+'">'+n+'/'+a+'</span>'
   +(s.locked?'<span class="em-lock" title="Clôturée">🔒</span>':'')
   +'</div>';
}
function majKpi(){
  var actives=sheets.filter(function(s){return !s.archived});
  var tot=0,sg=0;
  actives.forEach(function(s){ tot+=attendues(s.data||{}); sg+=signees(s.data||{}); });
  if(byId('emKSign')) byId('emKSign').textContent=sg;
  if(byId('emKWait')) byId('emKWait').textContent=Math.max(tot-sg,0);
  if(byId('emKTaux')) byId('emKTaux').textContent= tot? (Math.round(sg*100/tot)+' %') : '—';
  majKpiAccueil(sg,Math.max(tot-sg,0),tot);
}
/* KPI présence sur le tableau de bord */
function majKpiAccueil(sg,wait,tot){
  var kp=$('#scr-home .kpis'); if(!kp) return;
  var box=byId('kpiEmarg');
  if(!box){
    box=document.createElement('div'); box.className='kpi cream'; box.id='kpiEmarg';
    box.innerHTML='<span class="ki">✍️</span><div class="kl">Présence émargée</div><div class="kv" id="kpiEmargV">—</div>';
    box.style.cursor='pointer';
    box.addEventListener('click',function(){ if(window.__showScr) window.__showScr('emarg'); });
    kp.appendChild(box);
  }
  var v=byId('kpiEmargV'); if(v) v.textContent= tot? (Math.round(sg*100/tot)+' % · '+wait+' en attente') : '—';
}

document.addEventListener('click',function(e){
  var c=e.target.closest&&e.target.closest('[data-em]');
  if(c&&!e.target.closest('.em-panel')){ ouvrir(c.getAttribute('data-em')); }
});

/* ================= FEUILLE (WYSIWYG) ================= */
function sheetById(id){ for(var i=0;i<sheets.length;i++) if(sheets[i].id===id) return sheets[i]; return null; }
function fermer(){ var bg=byId('emBg'); if(bg) bg.remove(); curId=null; }

function ouvrir(id){
  var s=sheetById(id); if(!s) return;
  fermer(); curId=id;
  var bg=document.createElement('div'); bg.className='em-bg'; bg.id='emBg';
  bg.innerHTML='<div class="em-panel">'
    +'<div class="em-head">'
      +'<button class="x" id="emClose">✕</button>'
      +'<b id="emTitle">'+esc(nomDe(s))+'</b>'
      +'<span class="em-badge" id="emBadge"></span>'
    +'</div>'
    +'<div class="em-body"><div class="em-scroll"><div class="em-sheet-wrap" id="emWrap"><div class="em-sheet" id="emSheet"></div></div></div></div>'
    +'<div class="em-acts" id="emActs"></div>'
  +'</div>';
  document.body.appendChild(bg);
  requestAnimationFrame(function(){ bg.classList.add('show'); });
  bg.addEventListener('click',function(e){ if(e.target===bg) fermer(); });
  byId('emClose').onclick=fermer;
  dessinerFeuille();
}

function setPath(s,path,val){
  var o=s.data, k=path.split('.');
  for(var i=0;i<k.length-1;i++){ if(o[k[i]]==null||typeof o[k[i]]!=='object') o[k[i]]={}; o=o[k[i]]; }
  o[k[k.length-1]]=val;
}
function getPath(s,path){
  var o=s.data, k=path.split('.');
  for(var i=0;i<k.length;i++){ if(o==null) return ''; o=o[k[i]]; }
  return o==null?'':o;
}

function dessinerFeuille(){
  var s=sheetById(curId); if(!s) return;
  var d=s.data||{}, sg=d.sign||{}, c=d.cols||{}, ro=!!s.locked;
  var nbStag=(c.stagiaireM?1:0)+(c.stagiaireA?1:0);
  var nbForm=(c.formateurM?1:0)+(c.formateurA?1:0);

  var th=''
   +'<tr><th rowspan="2" class="c-date">Date</th>'
   +(nbStag?'<th colspan="'+nbStag+'">Signature Stagiaire</th>':'')
   +'<th rowspan="2">Nom Formateur</th>'
   +(nbForm?'<th colspan="'+nbForm+'">Signature Formateur</th>':'')
   +'</tr><tr>'
   +(c.stagiaireM?'<th>Matin<br><small data-ed="horaires.matin">'+esc(d.horaires&&d.horaires.matin||'')+'</small></th>':'')
   +(c.stagiaireA?'<th>Après-midi<br><small data-ed="horaires.aprem">'+esc(d.horaires&&d.horaires.aprem||'')+'</small></th>':'')
   +(c.formateurM?'<th>Matin<br><small data-ed="horaires.fmatin">'+esc(d.horaires&&d.horaires.fmatin||'')+'</small></th>':'')
   +(c.formateurA?'<th>Après-midi<br><small data-ed="horaires.faprem">'+esc(d.horaires&&d.horaires.faprem||'')+'</small></th>':'')
   +'</tr>';

  var rows=(d.lignes||[]).map(function(l,i){
    function caseStag(slot){
      var o=sg[l.id]&&sg[l.id][slot];
      var abs=l.absent&&l.absent[slot];
      if(abs) return '<td class="c-sig abs">Absent</td>';
      if(!o) return '<td class="c-sig vide" data-abs="'+l.id+'|'+slot+'">—</td>';
      return '<td class="c-sig'+(o.valide?' ok':'')+'" data-val="'+l.id+'|'+slot+'">'
        +'<img src="'+o.img+'" alt="signature">'
        +'<em>'+esc((o.ts||'').replace('T',' ').slice(0,16))+(o.valide?' ✓':'')+'</em></td>';
    }
    function caseForm(){
      var sig=d.formateur&&d.formateur.signature;
      return '<td class="c-sig">'+(sig?'<img src="'+sig+'" alt="signature formateur">':'<span class="mut">—</span>')+'</td>';
    }
    return '<tr>'
      +'<td class="c-date"><span data-date="'+l.id+'">'+esc(fmt(l.date))+'</span></td>'
      +(c.stagiaireM?caseStag('matin'):'')
      +(c.stagiaireA?caseStag('aprem'):'')
      +'<td class="c-form" data-lf="'+l.id+'">'+esc(l.formateur||'')+'</td>'
      +(c.formateurM?caseForm():'')
      +(c.formateurA?caseForm():'')
      +'<td class="c-del no-pdf"><button class="icon-btn" data-delrow="'+l.id+'" title="Supprimer la ligne">🗑</button></td>'
      +'</tr>';
  }).join('');

  var sigF=d.formateur&&d.formateur.signature;
  byId('emSheet').innerHTML=''
    +'<div class="em-top">'
      +'<div class="em-org" data-ed="entete.organisme">'+esc(d.entete&&d.entete.organisme||'').replace(/\n/g,'<br>')+'</div>'
      +'<div class="em-logo"><img src="'+((window.MH_ASSETS&&window.MH_ASSETS.logoFull)||'assets/logo-full.png')+'" alt="logo"></div>'
    +'</div>'
    +'<h1 class="em-title" data-ed="entete.titre">'+esc(d.entete&&d.entete.titre||'')+'</h1>'
    +'<div class="em-rule"></div>'
    +'<div class="em-meta">'
      +'<div class="em-stag" data-ed="entete.stagiaire">'+esc(d.entete&&d.entete.stagiaire||'')+'</div>'
      +'<div>Emargement pour la période du <b data-ed="entete.periode">'+esc(d.entete&&d.entete.periode||'')+'</b></div>'
      +'<div>Intitulé de la formation : <b data-formation="1">'+esc(s.formation||'—')+'</b></div>'
      +'<div>Lieu(x) de la formation : <span data-ed="entete.lieu">'+esc(d.entete&&d.entete.lieu||'')+'</span></div>'
    +'</div>'
    +'<table class="em-table"><thead>'+th+'</thead><tbody>'+rows+'</tbody></table>'
    +'<div class="em-addrow no-pdf"><button class="btn gold" id="emAddRow">+ Ajouter une ligne</button></div>'
    +'<div class="em-foot">'
      +'<div class="em-foot-l" data-ed="pied.bloc">'+esc(d.pied&&d.pied.bloc||'').replace(/\n/g,'<br>')
        +'<div class="em-maj">MAJ le <span data-ed="pied.maj">'+esc(fmt(d.pied&&d.pied.maj||''))+'</span></div></div>'
      +'<div class="em-foot-r"><div data-ed="pied.organisme">'+esc(d.pied&&d.pied.organisme||'').replace(/\n/g,'<br>')+'</div>'
        +(sigF?'<img class="em-sigf" src="'+sigF+'" alt="signature">':'<div class="em-nosig">— pas de signature —</div>')+'</div>'
    +'</div>'
    +'<div class="em-mention">Document signé électroniquement. Chaque signature est horodatée (fuseau Europe/Paris) et conservée avec l\'appareil utilisé.</div>';

  if(ro) byId('emSheet').classList.add('ro'); else byId('emSheet').classList.remove('ro');
  brancherEdition();
  ajusterEchelle();
  majBadge();
  dessinerActions();
}
function majBadge(){
  var s=sheetById(curId); if(!s) return;
  var b=byId('emBadge'); if(!b) return;
  var st=statutDe(s), d=s.data||{};
  b.className='em-badge '+st;
  b.textContent=STATUT_L[st]+' · '+signees(d)+'/'+attendues(d)+(s.sent_at?' · envoyée':'');
}
function ajusterEchelle(){
  var wrap=byId('emWrap'), sh=byId('emSheet'); if(!wrap||!sh) return;
  sh.style.transform='none';
  var cw=wrap.clientWidth, sw=760;
  var sc=Math.min(cw/sw,1);
  sh.style.transformOrigin='top left';
  sh.style.transform='scale('+sc+')';
  wrap.style.height=(sh.offsetHeight*sc)+'px';
}
window.addEventListener('resize',function(){ if(curId) ajusterEchelle(); });

/* ---------- édition des zones ---------- */
function brancherEdition(){
  var s=sheetById(curId); if(!s||s.locked) return;
  var sheet=byId('emSheet');

  $$('[data-ed]',sheet).forEach(function(el){
    el.classList.add('ed');
    if(isDesktop()){
      el.setAttribute('contenteditable','true');
      el.addEventListener('blur',function(){
        var v=el.innerText.replace(/\u00a0/g,' ').trim();
        if(el.getAttribute('data-ed')==='pied.maj') v=isoDepuisFr(v)||v;
        setPath(s,el.getAttribute('data-ed'),v); sauverDouce();
      });
      el.addEventListener('keydown',function(ev){ if(ev.key==='Enter'&&!ev.shiftKey){ ev.preventDefault(); el.blur(); } });
    }else{
      el.addEventListener('click',function(){
        miniFiche(el.getAttribute('data-ed'), el.innerText.trim(), function(v){
          if(el.getAttribute('data-ed')==='pied.maj') v=isoDepuisFr(v)||v;
          setPath(s,el.getAttribute('data-ed'),v); sauverDouce(true);
        });
      });
    }
  });

  /* formation : liste du catalogue */
  var fo=$('[data-formation]',sheet);
  if(fo) fo.addEventListener('click',function(){ choisirFormation(); });

  /* dates : agenda natif */
  $$('[data-date]',sheet).forEach(function(el){
    el.classList.add('ed');
    el.addEventListener('click',function(){ choisirDate(el.getAttribute('data-date')); });
  });
  /* nom formateur par ligne */
  $$('[data-lf]',sheet).forEach(function(el){
    el.classList.add('ed');
    el.addEventListener('click',function(){
      miniFiche('Nom du formateur', el.innerText.trim(), function(v){
        var l=ligne(el.getAttribute('data-lf')); if(l){ l.formateur=v; sauverDouce(true); }
      });
    });
  });
  /* valider / dévalider une signature */
  $$('[data-val]',sheet).forEach(function(el){
    el.addEventListener('click',function(){
      var p=el.getAttribute('data-val').split('|');
      basculerValidation(p[0],p[1]);
    });
  });
  /* marquer absent une case vide */
  $$('[data-abs]',sheet).forEach(function(el){
    el.addEventListener('click',function(){
      var p=el.getAttribute('data-abs').split('|');
      var l=ligne(p[0]); if(!l) return;
      l.absent=l.absent||{}; l.absent[p[1]]=true; sauverDouce(true); toast('Marqué absent');
    });
  });
  var add=byId('emAddRow');
  if(add) add.onclick=ajouterLigne;
  $$('[data-delrow]',sheet).forEach(function(b){
    b.addEventListener('click',function(ev){ ev.stopPropagation(); supprimerLigne(b.getAttribute('data-delrow')); });
  });
}
function ligne(id){ var s=sheetById(curId); var L=(s.data.lignes||[]); for(var i=0;i<L.length;i++) if(L[i].id===id) return L[i]; return null; }
function isoDepuisFr(v){
  var m=(''+v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m?(m[3]+'-'+m[2]+'-'+m[1]):null;
}

/* mini-fiche d'édition (mobile) */
function miniFiche(titre,valeur,onOk){
  var m=document.createElement('div'); m.className='confirm-bg show';
  var multi=/organisme|bloc|pied/.test(titre);
  m.innerHTML='<div class="confirm-box"><p>'+esc(libelle(titre))+'</p>'
    +(multi?'<div class="fld"><textarea id="mfV" rows="5"></textarea></div>'
           :'<div class="fld"><input id="mfV"></div>')
    +'<div class="acts"><button class="btn gold" id="mfNo">Annuler</button><button class="btn cta" id="mfOk">Valider</button></div></div>';
  document.body.appendChild(m);
  var inp=m.querySelector('#mfV'); inp.value=valeur||''; inp.focus();
  m.querySelector('#mfNo').onclick=function(){ m.remove(); };
  m.querySelector('#mfOk').onclick=function(){ var v=inp.value.trim(); m.remove(); onOk(v); };
  m.addEventListener('click',function(e){ if(e.target===m) m.remove(); });
}
function libelle(p){
  var L={'entete.organisme':'Coordonnées de l\'organisme','entete.titre':'Titre du document',
    'entete.stagiaire':'Nom du stagiaire','entete.periode':'Période d\'émargement','entete.lieu':'Lieu de la formation',
    'horaires.matin':'Horaire stagiaire matin','horaires.aprem':'Horaire stagiaire après-midi',
    'horaires.fmatin':'Horaire formateur matin','horaires.faprem':'Horaire formateur après-midi',
    'pied.bloc':'Bloc bas de page','pied.maj':'Date de mise à jour (JJ/MM/AAAA)','pied.organisme':'Bloc organisme de formation'};
  return L[p]||p;
}
function choisirFormation(){
  var s=sheetById(curId), c=catalogue();
  var all=(c.modules||[]).concat(c.offers||[]);
  var m=document.createElement('div'); m.className='confirm-bg show';
  m.innerHTML='<div class="confirm-box"><p>Intitulé de la formation</p>'
    +'<div class="fld"><select id="cfF">'+all.map(function(o){return '<option'+(o.n===s.formation?' selected':'')+'>'+esc(o.n)+'</option>'}).join('')+'</select></div>'
    +'<div class="acts"><button class="btn gold" id="cfN">Annuler</button><button class="btn cta" id="cfO">Valider</button></div></div>';
  document.body.appendChild(m);
  m.querySelector('#cfN').onclick=function(){ m.remove(); };
  m.querySelector('#cfO').onclick=function(){
    var v=m.querySelector('#cfF').value; m.remove();
    if(v===s.formation) return;
    /* la formation fait partie de la clé unique : on crée/déplace proprement */
    MHapi.admin.save(s.eleve_id, v, s.data, {statut:s.statut}).then(function(row){
      return MHapi.admin.del(s.id).then(function(){
        sheets=sheets.filter(function(x){return x.id!==s.id});
        if(row) sheets.unshift(row);
        curId=row?row.id:null;
        if(curId) dessinerFeuille(); else fermer();
        renderList(); toast('Formation modifiée');
      });
    }).catch(function(e){ toast(e.message); });
  };
}
function choisirDate(lid_){
  var l=ligne(lid_); if(!l) return;
  var m=document.createElement('div'); m.className='confirm-bg show';
  m.innerHTML='<div class="confirm-box"><p>Date de la ligne</p>'
    +'<div class="fld"><input type="date" id="cdV" value="'+esc(l.date||'')+'"></div>'
    +'<div class="acts"><button class="btn gold" id="cdN">Annuler</button><button class="btn cta" id="cdO">Valider</button></div></div>';
  document.body.appendChild(m);
  var inp=m.querySelector('#cdV');
  if(inp.showPicker) try{ inp.showPicker(); }catch(e){}
  m.querySelector('#cdN').onclick=function(){ m.remove(); };
  m.querySelector('#cdO').onclick=function(){ var v=inp.value; m.remove(); if(!v) return; l.date=v; sauverDouce(true); };
  m.addEventListener('click',function(e){ if(e.target===m) m.remove(); });
}
function ajouterLigne(){
  var s=sheetById(curId); if(!s) return;
  var L=s.data.lignes||(s.data.lignes=[]);
  var last=L[L.length-1], d=today();
  if(last&&last.date){ var n=new Date(last.date+'T00:00:00'); n.setDate(n.getDate()+1); d=n.toISOString().slice(0,10); }
  L.push({id:lid(),date:d,formateur:(s.data.formateur&&s.data.formateur.nom)||settings().formateur||'',absent:{}});
  sauverDouce(true);
}
function supprimerLigne(id){
  var s=sheetById(curId); if(!s) return;
  var go=function(){
    s.data.lignes=(s.data.lignes||[]).filter(function(l){return l.id!==id});
    if(s.data.sign) delete s.data.sign[id];
    sauverDouce(true);
  };
  if(window.MH&&window.MH.confirmModal) window.MH.confirmModal('Supprimer cette ligne et ses signatures ?',go); else go();
}
function basculerValidation(l,slot){
  var s=sheetById(curId); if(!s) return;
  var cur=s.data.sign&&s.data.sign[l]&&s.data.sign[l][slot];
  var on=!(cur&&cur.valide);
  MHapi.admin.valider(s.id,l,slot,on).then(function(row){
    if(row){ for(var i=0;i<sheets.length;i++) if(sheets[i].id===row.id) sheets[i]=row; }
    dessinerFeuille(); renderList(); toast(on?'Signature validée':'Validation retirée');
  }).catch(function(e){ toast(e.message); });
}

/* sauvegarde différée */
var tSave=null;
function sauverDouce(redraw){
  var s=sheetById(curId); if(!s) return;
  clearTimeout(tSave);
  tSave=setTimeout(function(){
    sauver(s,{statut:statutDe(s)}).then(function(){
      if(redraw) dessinerFeuille();
      renderList();
    }).catch(function(e){ toast(e.message); });
  },400);
  if(redraw) dessinerFeuille();
}

/* ---------- actions ---------- */
function dessinerActions(){
  var s=sheetById(curId); if(!s) return;
  var host=byId('emActs'); if(!host) return;
  host.innerHTML=''
    +'<button class="btn gold" id="acPdf">⬇️ PDF</button>'
    +'<button class="btn cta" id="acWa">WhatsApp</button>'
    +'<button class="btn gold" id="acCopy">Copier le lien</button>'
    +'<button class="btn gold" id="acQr">QR code</button>'
    +'<button class="btn gold" id="acSig">'+((s.data.formateur&&s.data.formateur.signature)?'Retirer ma signature':'Ajouter ma signature')+'</button>'
    +'<button class="btn gold" id="acCols">Colonnes</button>'
    +'<button class="btn gold" id="acLock">'+(s.locked?'Rouvrir':'Clôturer')+'</button>'
    +'<button class="btn gold" id="acArch">'+(s.archived?'Désarchiver':'Archiver')+'</button>'
    +(s.archived?'<button class="btn gold danger" id="acDel">Supprimer définitivement</button>':'');
  byId('acPdf').onclick=function(e){ pdf(e.currentTarget); };
  byId('acWa').onclick=function(){ whatsapp(s, !!s.sent_at); };
  byId('acCopy').onclick=function(){ copier(lienDe(s)); };
  byId('acQr').onclick=function(){ qr(s); };
  byId('acSig').onclick=function(){ signatureFormateur(); };
  byId('acCols').onclick=function(){ reglerColonnes(); };
  byId('acLock').onclick=function(){
    sauver(s,{locked:!s.locked}).then(function(){ dessinerFeuille(); renderList(); toast(s.locked?'Feuille clôturée':'Feuille rouverte'); })
      .catch(function(e){ toast(e.message); });
  };
  byId('acArch').onclick=function(){
    sauver(s,{archived:!s.archived}).then(function(){ renderList(); fermer(); toast(s.archived?'Archivée':'Désarchivée'); })
      .catch(function(e){ toast(e.message); });
  };
  var del=byId('acDel');
  if(del) del.onclick=function(){
    var go=function(){ MHapi.admin.del(s.id).then(function(){
      sheets=sheets.filter(function(x){return x.id!==s.id}); fermer(); renderList(); toast('Feuille supprimée');
    }).catch(function(e){ toast(e.message); }); };
    if(window.MH&&window.MH.confirmModal) window.MH.confirmModal('Supprimer définitivement cette feuille ? Cette preuve de présence sera perdue.',go); else go();
  };
}
function reglerColonnes(){
  var s=sheetById(curId); if(!s) return; var c=s.data.cols||{};
  var m=document.createElement('div'); m.className='confirm-bg show';
  function cb(k,l){ return '<label class="em-cb"><input type="checkbox" data-c="'+k+'"'+(c[k]?' checked':'')+'> '+l+'</label>'; }
  m.innerHTML='<div class="confirm-box"><p>Colonnes affichées</p>'
    +cb('stagiaireM','Stagiaire — matin')+cb('stagiaireA','Stagiaire — après-midi')
    +cb('formateurM','Formateur — matin')+cb('formateurA','Formateur — après-midi')
    +'<div class="acts"><button class="btn gold" id="ccN">Annuler</button><button class="btn cta" id="ccO">Valider</button></div></div>';
  document.body.appendChild(m);
  m.querySelector('#ccN').onclick=function(){ m.remove(); };
  m.querySelector('#ccO').onclick=function(){
    $$('[data-c]',m).forEach(function(i){ c[i.getAttribute('data-c')]=i.checked; });
    s.data.cols=c; m.remove(); sauverDouce(true);
  };
}
function signatureFormateur(){
  var s=sheetById(curId); if(!s) return;
  if(s.data.formateur&&s.data.formateur.signature){
    s.data.formateur.signature=null; sauverDouce(true); toast('Signature retirée'); return;
  }
  var st=settings();
  var m=document.createElement('div'); m.className='confirm-bg show';
  m.innerHTML='<div class="confirm-box"><p>Signature du formateur</p>'
    +(st.emSignature?'<div class="acts" style="margin-bottom:10px"><button class="btn gold" id="sfSaved">Utiliser ma signature enregistrée</button></div>':'')
    +'<canvas id="sfC" class="sig-canvas" width="600" height="200"></canvas>'
    +'<div class="acts"><button class="btn gold" id="sfClr">Effacer</button><button class="btn gold" id="sfN">Annuler</button><button class="btn cta" id="sfO">Valider</button></div></div>';
  document.body.appendChild(m);
  var pad=signaturePad(m.querySelector('#sfC'));
  var sv=m.querySelector('#sfSaved');
  if(sv) sv.onclick=function(){ s.data.formateur=s.data.formateur||{}; s.data.formateur.signature=st.emSignature; m.remove(); sauverDouce(true); };
  m.querySelector('#sfClr').onclick=function(){ pad.clear(); };
  m.querySelector('#sfN').onclick=function(){ m.remove(); };
  m.querySelector('#sfO').onclick=function(){
    if(pad.vide()){ toast('Signature vide'); return; }
    s.data.formateur=s.data.formateur||{}; s.data.formateur.signature=pad.png();
    m.remove(); sauverDouce(true);
  };
}
function copier(txt){
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ toast('Lien copié'); },function(){ prompt('Copie le lien :',txt); });
  } else prompt('Copie le lien :',txt);
}
function whatsapp(s,relance){
  var f=ficheDe(s.eleve_id), tel=(f&&f.tel)||'';
  var num=(''+tel).replace(/[^\d]/g,'');
  if(num&&num.charAt(0)==='0') num='33'+num.slice(1);
  var txt=relance
    ? 'Bonjour '+nomDe(s)+', petit rappel : il reste des cases à signer sur ta feuille d\'émargement '+(s.formation||'')+'. '+lienDe(s)
    : 'Bonjour '+nomDe(s)+', voici ta feuille d\'émargement pour '+(s.formation||'la formation')+(s.data.entete&&s.data.entete.periode?(' ('+s.data.entete.periode+')'):'')+'. Signe directement ici : '+lienDe(s);
  var url='https://wa.me/'+(num||'')+'?text='+encodeURIComponent(txt);
  sauver(s,{sent:true}).catch(function(){});
  window.open(url,'_blank');
}
function qr(s){
  var m=document.createElement('div'); m.className='confirm-bg show';
  m.innerHTML='<div class="confirm-box"><p>QR à afficher en salle — '+esc(nomDe(s))+'</p><div id="qrBox" class="qr-box"></div>'
    +'<div class="acts"><button class="btn cta" id="qrN">Fermer</button></div></div>';
  document.body.appendChild(m);
  try{
    var q=window.qrcode(0,'M'); q.addData(lienDe(s)); q.make();
    m.querySelector('#qrBox').innerHTML=q.createImgTag(6,8);
  }catch(e){ m.querySelector('#qrBox').textContent=lienDe(s); }
  m.querySelector('#qrN').onclick=function(){ m.remove(); };
  m.addEventListener('click',function(e){ if(e.target===m) m.remove(); });
}

/* ---------- PDF (portrait, multi-pages si le tableau s'étire) ---------- */
function pdf(btn){
  var s=sheetById(curId); if(!s) return;
  var t=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span> PDF…';
  var src=byId('emSheet');
  var clone=src.cloneNode(true);
  clone.classList.add('pdf');
  clone.style.transform='none';
  $$('.no-pdf',clone).forEach(function(x){ x.remove(); });
  $$('.ed',clone).forEach(function(x){ x.classList.remove('ed'); x.removeAttribute('contenteditable'); });
  var holder=document.createElement('div');
  holder.style.cssText='position:fixed;left:-99999px;top:0;width:760px;background:#fff';
  holder.appendChild(clone); document.body.appendChild(holder);

  var fini=function(){ holder.remove(); btn.disabled=false; btn.innerHTML=t; };
  var go=function(){
    html2canvas(clone,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false,
      width:760,windowWidth:760,height:clone.scrollHeight}).then(function(cv){
      var p=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      var pw=210, ph=297, mm=cv.width/pw;          /* pixels par mm */
      var pagePx=Math.floor(ph*mm);
      var y=0, first=true;
      while(y<cv.height){
        var h=Math.min(pagePx,cv.height-y);
        var part=document.createElement('canvas');
        part.width=cv.width; part.height=h;
        part.getContext('2d').drawImage(cv,0,y,cv.width,h,0,0,cv.width,h);
        if(!first) p.addPage('a4','portrait');
        p.addImage(part.toDataURL('image/jpeg',0.94),'JPEG',0,0,pw,h/mm);
        first=false; y+=h;
      }
      p.save('Emargement_'+nomDe(s).replace(/[^\w\-]+/g,'_')+'.pdf');
      toast('Feuille téléchargée'); fini();
    }).catch(function(e){ console.error(e); toast('Erreur PDF'); fini(); });
  };
  var fp=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve();
  fp.then(function(){ setTimeout(go,60); },function(){ setTimeout(go,60); });
}

/* ---------- export CSV des présences ---------- */
function exportCsv(){
  if(!sheets.length){ toast('Aucune feuille'); return; }
  var head=['Élève','Formation','Date','Créneau','Signé','Validé','Horodatage','Appareil','Statut feuille'];
  var rows=[];
  sheets.forEach(function(s){
    var d=s.data||{}, c=d.cols||{}, sg=d.sign||{}, st=STATUT_L[statutDe(s)];
    (d.lignes||[]).forEach(function(l){
      [['matin',c.stagiaireM],['aprem',c.stagiaireA]].forEach(function(pair){
        if(!pair[1]) return;
        var o=sg[l.id]&&sg[l.id][pair[0]];
        var abs=l.absent&&l.absent[pair[0]];
        rows.push([nomDe(s),s.formation||'',l.date||'',pair[0]==='matin'?'Matin':'Après-midi',
          abs?'Absent':(o?'Oui':'Non'), (o&&o.valide)?'Oui':'Non', (o&&o.ts)||'', (o&&o.ua)||'', st]);
      });
    });
  });
  var csv='\ufeff'+head.join(',')+'\n'+rows.map(function(r){
    return r.map(function(v){ return '"'+(''+(v==null?'':v)).replace(/"/g,'""')+'"'; }).join(',');
  }).join('\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='emargements_magic_hands.csv'; a.click();
  toast('Export CSV');
}

/* ---------- pad de signature réutilisable ---------- */
function signaturePad(canvas){
  var ctx=canvas.getContext('2d'), dessine=false, vide=true, pts=[], cur=null;
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.lineWidth=2.6; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#12251f';
  function pos(e){
    var r=canvas.getBoundingClientRect();
    var t=(e.touches&&e.touches[0])||e;
    return {x:(t.clientX-r.left)*(canvas.width/r.width), y:(t.clientY-r.top)*(canvas.height/r.height)};
  }
  function down(e){ e.preventDefault(); dessine=true; vide=false; cur=[]; pts.push(cur);
    var p=pos(e); cur.push([Math.round(p.x),Math.round(p.y)]); ctx.beginPath(); ctx.moveTo(p.x,p.y); }
  function move(e){ if(!dessine) return; e.preventDefault(); var p=pos(e);
    cur.push([Math.round(p.x),Math.round(p.y)]); ctx.lineTo(p.x,p.y); ctx.stroke(); }
  function up(){ dessine=false; }
  canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move);
  window.addEventListener('mouseup',up);
  canvas.addEventListener('touchstart',down,{passive:false});
  canvas.addEventListener('touchmove',move,{passive:false});
  canvas.addEventListener('touchend',up);
  return {
    clear:function(){ ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); vide=true; pts=[]; },
    vide:function(){ return vide; },
    png:function(){ return canvas.toDataURL('image/png'); },
    pts:function(){ return pts; }
  };
}

/* ---------- API publique ---------- */
function openForEleve(eid,formation){
  if(window.__showScr) window.__showScr('emarg');
  var go=function(){
    var s=trouver(eid,formation||'');
    if(!s){ var alt=sheets.filter(function(x){return x.eleve_id===eid}); s=alt[0]; }
    if(s) ouvrir(s.id); else toast('Feuille en cours de création…');
  };
  if(loaded) { renderList(); go(); }
  else charger().then(function(){ renderList(); go(); }).catch(function(e){ toast(e.message); });
}
window.MHemarg={
  mount:mount, refresh:rafraichir, openForEleve:openForEleve,
  signaturePad:signaturePad,
  stats:function(){ var t=0,s=0; sheets.forEach(function(x){ if(x.archived) return; t+=attendues(x.data||{}); s+=signees(x.data||{}); }); return {total:t,signees:s}; }
};

/* montage auto */
function auto(){ if($('[data-mount="emargement"]')) mount('[data-mount="emargement"]'); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',auto); else auto();
})();

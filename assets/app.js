/* ===================== NexusAI × Magic Hands — app.js =====================
   Cerveau partagé : données + localStorage + sync inter-fichiers + PDF + rendus.
   Le markup (générateur, catalogue, élèves, closing, réglages) est injecté ici
   pour éviter toute duplication entre dashboard/admin/closing/offline.        */
(function(){
"use strict";
var A = window.MH_ASSETS || {};
var CERT_BG = A.certBg || 'assets/cert-bg.png';
var ATT_BG  = A.attBg  || 'assets/attest-bg.png';
var SIGN    = A.sign   || 'assets/sign.jpg';

/* ---------- storage ---------- */
var LS={cat:'mh_catalog_v3',cli:'mh_clients_v3',gen:'mh_gencount_v3',set:'mh_settings_v1',con:'mh_contacts_v1',pre:'mh_prefill_v1'};
var DEFAULT_CAT={
  modules:[{n:'Mix Massage Arts',p:2000},{n:'Deep Stretching',p:2000},{n:'Drain & Sculpt',p:2000},{n:'Magic Face',p:2000},{n:'Massage Future Maman',p:2000},{n:'Drainage de Récupération',p:2000}],
  offers:[{n:'Pack Incontournable',p:4900},{n:'Magic Voyage + Pack',p:8000},{n:'Magic Voyage (seul)',p:5000},{n:'Sensei Express',p:15000},{n:'Pack Incontournable PROMO',p:2500},{n:'Module au choix PROMO',p:950}],
  sessions:[{l:'Paris · Pack & Modules',s:'2026-08-03',e:'2026-08-09'},{l:'Paris · Pack & Modules',s:'2026-09-07',e:'2026-09-13'},{l:'Paris · Pack & Modules',s:'2026-10-05',e:'2026-10-11'},{l:'Paris · Pack & Modules',s:'2026-11-02',e:'2026-11-08'},{l:'Magic Voyage · Chiang Mai',s:'2026-11-15',e:'2026-11-27'}]
};
var DEFAULT_SET={formateur:'Jordan Ly Pinto',etab:'Magic Hands School',lieuDef:'Paris',dureeDef:'1 jour (8 heures)'};
var DEFAULT_CON=[
  {id:'c1',n:'Sophie Bernard',tel:'0690 12 34 56',form:'Mix Massage Arts',stage:'won',amt:2000,ts:Date.now()-86400000*1},
  {id:'c2',n:'Kévin Durand',tel:'0696 88 21 09',form:'Pack Incontournable',stage:'won',amt:4900,ts:Date.now()-86400000*2},
  {id:'c3',n:'Laura Petit',tel:'0691 45 78 02',form:'Magic Face',stage:'rdv',amt:2000,ts:Date.now()-86400000*3},
  {id:'c4',n:'Marc Olivier',tel:'0694 33 11 90',form:'Magic Voyage + Pack',stage:'contact',amt:8000,ts:Date.now()-86400000*4},
  {id:'c5',n:'Nadia Rivière',tel:'0690 77 65 43',form:'Deep Stretching',stage:'new',amt:2000,ts:Date.now()-86400000*5},
  {id:'c6',n:'Yann Lefebvre',tel:'0696 09 88 12',form:'Sensei Express',stage:'won',amt:15000,ts:Date.now()-86400000*6}
];
function load(k,f){try{var v=JSON.parse(localStorage.getItem(k));return v==null?f:v}catch(e){return f}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
var cat=load(LS.cat,JSON.parse(JSON.stringify(DEFAULT_CAT)));
var clients=load(LS.cli,[]);
var gencount=load(LS.gen,0);
var settings=Object.assign({},DEFAULT_SET,load(LS.set,{}));
var contacts=load(LS.con,null); if(contacts==null){contacts=JSON.parse(JSON.stringify(DEFAULT_CON));save(LS.con,contacts);}
var selSession=null;

/* ---------- helpers ---------- */
function $(s,r){return (r||document).querySelector(s)}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function byId(id){return document.getElementById(id)}
function setText(id,v){var e=byId(id);if(e)e.textContent=v}
function setHTML(sel,h){var e=$(sel);if(e)e.innerHTML=h}
function esc(s){return (s||'').replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])})}
function fmt(iso){if(!iso)return '—';var p=iso.split('-');return p[2]+'/'+p[1]+'/'+p[0]}
function euro(p){return (p||0).toLocaleString('fr-FR')+' €'}
function nfmt(n){return (n||0).toLocaleString('fr-FR')}
var MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function today(){return new Date().toISOString().slice(0,10)}
function upcoming(){var t=today();return cat.sessions.filter(function(s){return s.e>=t}).sort(function(a,b){return a.s.localeCompare(b.s)})}
function toast(m){var t=byId('toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t)}t.textContent=m;t.classList.add('show');clearTimeout(t._);t._=setTimeout(function(){t.classList.remove('show')},2100)}
var STAGES=[{k:'new',l:'Nouveau',c:'#8fa39b'},{k:'contact',l:'Contacté',c:'#D5B56F'},{k:'rdv',l:'RDV',c:'#E8954C'},{k:'won',l:'Gagné',c:'#5fd39a'},{k:'lost',l:'Perdu',c:'#c96f6f'}];
function stC(k){for(var i=0;i<STAGES.length;i++)if(STAGES[i].k===k)return STAGES[i].c;return '#8fa39b'}
function stL(k){for(var i=0;i<STAGES.length;i++)if(STAGES[i].k===k)return STAGES[i].l;return k}
function caSum(){return contacts.filter(function(c){return c.stage==='won'}).reduce(function(s,c){return s+(c.amt||0)},0)}

/* ================= MARKUP (injecté) ================= */
var GEN_HTML=''
+'<style>.generator{display:grid;grid-template-columns:1fr 1fr;gap:18px}.gen-docs{min-width:0}@media(max-width:980px){.generator{grid-template-columns:1fr}}</style>'
+'<div class="generator">'
+' <div class="gen-inputs">'
+'  <div class="lab">Élève</div>'
+'  <div class="grid2"><div class="fld"><label>Prénom</label><input id="prenom" placeholder="Sophie"></div>'
+'  <div class="fld"><label>Nom</label><input id="nom" placeholder="Bernard"></div></div>'
+'  <div class="fld"><label>Adresse</label><input id="adresse" placeholder="Adresse postale"></div>'
+'  <div class="fld"><label>Formation</label><select id="formation"></select></div>'
+'  <div class="lab" style="margin-top:6px">Session (clique une date)</div>'
+'  <div class="calwrap"><div id="calendar"></div><div class="chips" id="sessChips"></div></div>'
+'  <div class="grid2" style="margin-top:12px"><div class="fld"><label>Du</label><input type="date" id="dstart"></div>'
+'  <div class="fld"><label>Au</label><input type="date" id="dend"></div></div>'
+'  <div class="grid2"><div class="fld"><label>Durée</label><input id="duree" placeholder="35 heures"></div>'
+'  <div class="fld"><label>Lieu</label><input id="lieu" placeholder="Paris"></div></div>'
+'  <div class="fld"><label>Date d\'émission</label><input type="date" id="demit"></div>'
+' </div>'
+' <div class="gen-docs">'
+'  <div class="stage"><div class="cap"><span class="tag lock">🔒 Officiel · figé</span> Certificat professionnel</div>'
+'   <div class="docwrap" id="wrapCert"><div class="cert" id="cert">'
+'    <div class="f f-nom" id="c_nom">NOM Prénom</div><div class="f f-form" id="c_form">Formation</div>'
+'    <div class="f f-date" id="c_date">—</div><div class="f f-tit" id="c_tit">NOM Prénom</div></div></div></div>'
+'  <div class="stage"><div class="cap"><span class="tag edit">✎ Éditable</span> Attestation de formation</div>'
+'   <div class="docwrap" id="wrapAtt"><div class="attest" id="attest"><div class="att-pad">'
+'    <div class="att-h">Attestation de formation</div><div class="att-rule"></div>'
+'    <div class="gap" style="height:42px"></div>'
+'    <div class="l2"><span class="lb">Nous attestons que</span><span class="vl" id="a_nom">Prénom NOM</span></div>'
+'    <div class="gap" style="height:10px"></div>'
+'    <div class="l2"><span class="lb">Domicilié(e) au</span><span class="vl" id="a_adr">—</span></div>'
+'    <div class="gap" style="height:36px"></div>'
+'    <div class="att-full">A suivi avec assiduité la totalité de la formation</div>'
+'    <div class="gap" style="height:26px"></div><div class="att-form" id="a_form">Formation</div>'
+'    <div class="gap" style="height:36px"></div>'
+'    <div class="l2"><span class="lb">Formateur</span><span class="vl" id="a_formateur">Jordan Ly Pinto</span></div>'
+'    <div class="gap" style="height:10px"></div>'
+'    <div class="l2"><span class="lb">Aux dates suivantes</span><span class="vl" id="a_dates">—</span></div>'
+'    <div class="gap" style="height:10px"></div>'
+'    <div class="l2"><span class="lb">Soit une durée totale de</span><span class="vl" id="a_duree">—</span></div>'
+'    <div class="gap" style="height:36px"></div>'
+'    <div class="att-full">Cette attestation est délivrée pour servir et valoir ce que de droit</div>'
+'    <div class="gap" style="height:14px"></div>'
+'    <div class="att-full" style="font-weight:700" id="a_made">Fait à Paris le —</div>'
+'    <div class="att-sign"><div class="who">Fondateur et Responsable formation</div><div class="nm" id="a_signnm">Jordan Ly Pinto</div><img src="'+SIGN+'" alt="signature"></div>'
+'   </div></div></div></div>'
+'  <div class="acts"><button class="btn gold" id="btnCert">⬇️ Certificat</button><button class="btn gold" id="btnAtt">⬇️ Attestation</button><button class="btn cta" id="btnBoth">⬇️ Les 2 (1 PDF)</button></div>'
+' </div>'
+'</div>';

var CATALOGUE_HTML=''
+'<div class="subttl">📚 Modules <span style="color:var(--grey);font-weight:600;text-transform:none;letter-spacing:0">/ 2000 € par défaut</span></div><div class="lst" id="modList"></div>'
+'<div class="addrow"><input id="modName" placeholder="Nouveau module"><input id="modPrice" placeholder="€" inputmode="numeric" style="max-width:110px"><button class="icon-btn add" id="modAdd">＋</button></div>'
+'<div class="subttl">🎁 Packs & offres</div><div class="lst" id="offList"></div>'
+'<div class="addrow"><input id="offName" placeholder="Nouvelle offre"><input id="offPrice" placeholder="€" inputmode="numeric" style="max-width:110px"><button class="icon-btn add" id="offAdd">＋</button></div>'
+'<div class="subttl">📅 Sessions</div><div class="lst" id="sesList"></div>'
+'<div class="addrow"><input id="sesLabel" placeholder="Intitulé (ex: Paris · Pack)"><input type="date" id="sesStart"><input type="date" id="sesEnd"><button class="icon-btn add" id="sesAdd">＋</button></div>';

var ELEVES_HTML=''
+'<div class="clients-bar"><input id="cliSearch" placeholder="Rechercher un élève…"><button class="btn gold" id="cliExport" style="flex:0 0 auto;min-width:130px">⬇️ Export CSV</button></div>'
+'<div class="lst" id="cliList"></div>';

var SETTINGS_HTML=''
+'<div class="subttl">👤 Identité des documents</div>'
+'<div class="fld"><label>Formateur / signataire</label><input id="setFormateur"></div>'
+'<div class="fld"><label>Établissement</label><input id="setEtab"></div>'
+'<div class="subttl">📍 Valeurs par défaut</div>'
+'<div class="grid2"><div class="fld"><label>Lieu</label><input id="setLieu"></div><div class="fld"><label>Durée</label><input id="setDuree"></div></div>'
+'<div class="subttl">💾 Données</div>'
+'<div class="acts"><button class="btn gold" id="btnExport">⬆️ Exporter (.json)</button><button class="btn gold" id="btnImport">⬇️ Importer (.json)</button></div>'
+'<input type="file" id="impFile" accept="application/json" style="display:none">'
+'<div class="note" style="margin-top:14px">Sauvegarde complète : catalogue, élèves, contacts closing et réglages. À garder hors-ligne.</div>';

var CLOSING_HTML=''
+'<div class="crm-stats"><div class="cs"><div class="n" id="cTotal">0</div><div class="t">Contacts</div></div>'
+'<div class="cs"><div class="n" id="cRdv">0</div><div class="t">RDV planifiés</div></div>'
+'<div class="cs win"><div class="n" id="cWon">0</div><div class="t">Gagnés</div></div>'
+'<div class="cs win"><div class="n"><span id="cCa">0</span> €</div><div class="t">CA encaissé</div></div></div>'
+'<div class="crm-head" style="margin-bottom:12px"><h2 style="font-size:16px">Pipeline</h2>'
+'<div class="vtoggle" id="vtoggle"><button class="on" data-v="kanban">▦ Kanban</button><button data-v="list">☰ Liste</button></div>'
+'<button class="addc" id="addContact">＋ Contact</button></div>'
+'<div class="kanban" id="kanban"></div>'
+'<div class="listview" id="listview"><div class="lrow h"><span>Contact</span><span class="formh">Formation</span><span class="telh">Tél</span><span>Statut</span><span>Montant</span><span>Action</span></div><div id="listRows"></div></div>';

/* ================= GENERATOR ================= */
function mountGenerator(sel){var m=$(sel);if(!m||m._mounted)return;m.innerHTML=GEN_HTML;m._mounted=true;
  var c=byId('cert'),a=byId('attest');if(c)c.style.backgroundImage='url('+CERT_BG+')';if(a)a.style.backgroundImage='url('+ATT_BG+')';
  byId('lieu').value=settings.lieuDef||'Paris';byId('duree').value=settings.dureeDef||'';byId('demit').value=today();
  fillFormation();buildCal();buildChips();
  ['prenom','nom','adresse','formation','dstart','dend','duree','lieu','demit'].forEach(function(id){var e=byId(id);if(e)e.addEventListener('input',function(){if(id==='dstart'||id==='dend')selSession=null;render()})});
  byId('btnCert').onclick=function(e){pdf('cert',e.currentTarget)};
  byId('btnAtt').onclick=function(e){pdf('att',e.currentTarget)};
  byId('btnBoth').onclick=function(e){pdf('both',e.currentTarget)};
  render();requestAnimationFrame(scaleDocs);
  loadPrefill();
}
function fillFormation(){var sel=byId('formation');if(!sel)return;var cur=sel.value;
  sel.innerHTML='<optgroup label="Modules">'+cat.modules.map(function(m){return '<option>'+esc(m.n)+'</option>'}).join('')+'</optgroup><optgroup label="Packs & offres">'+cat.offers.map(function(o){return '<option>'+esc(o.n)+'</option>'}).join('')+'</optgroup>';
  if($$('#formation option').some(function(o){return o.value===cur}))sel.value=cur;render()}
function render(){if(!byId('cert'))return;
  var pre=val('prenom'),no=val('nom'),NOM=no.toUpperCase();
  var certName=(NOM+' '+pre).trim()||'NOM Prénom',attName=(pre+' '+NOM).trim()||'Prénom NOM';
  var form=val('formation')||'—',ds=val('dstart'),de=val('dend'),em=val('demit');
  var lieu=val('lieu')||'Paris',duree=val('duree')||'—',adr=val('adresse')||'—';
  setText('c_nom',certName);setText('c_form',form);setText('c_date',em?fmt(em):'—');setText('c_tit',certName);
  setText('a_nom',attName);setText('a_adr',adr);setText('a_form',form);
  setText('a_dates','du '+fmt(ds)+' au '+fmt(de));setText('a_duree',duree);setText('a_made','Fait à '+lieu+' le '+(em?fmt(em):'—'));
  setText('a_formateur',settings.formateur);setText('a_signnm',settings.formateur);
  fitCert()}
function val(id){var e=byId(id);return e?e.value.trim():''}
function fitCert(){['c_nom','c_form'].forEach(function(id){var el=byId(id);if(!el)return;el.style.fontSize='51px';var fs=51,g=0;while(el.scrollWidth>860&&fs>9&&g<80){fs-=1;el.style.fontSize=fs+'px';g++}})}
function scaleOne(wrapId,docId,w,h){var wrap=byId(wrapId),doc=byId(docId);if(!wrap||!doc)return;var s=wrap.clientWidth/w;doc.style.transform='scale('+s+')';wrap.style.height=(h*s)+'px'}
function scaleDocs(){scaleOne('wrapCert','cert',1000,707);scaleOne('wrapAtt','attest',720,1016)}
window.addEventListener('resize',scaleDocs);

/* calendar */
var calRef=new Date(2026,7,1);
function buildCal(){var host=byId('calendar');if(!host)return;
  var y=calRef.getFullYear(),mo=calRef.getMonth();
  var start=(new Date(y,mo,1).getDay()+6)%7,days=new Date(y,mo+1,0).getDate(),prev=new Date(y,mo,0).getDate();
  var cells=[],i;for(i=0;i<start;i++)cells.push({d:prev-start+1+i,out:1});
  for(var d=1;d<=days;d++)cells.push({d:d,iso:y+'-'+String(mo+1).padStart(2,'0')+'-'+String(d).padStart(2,'0')});
  while(cells.length%7)cells.push({out:1,tail:1});
  var rows='';for(i=0;i<cells.length;i+=7){rows+='<tr>'+cells.slice(i,i+7).map(function(c){
    if(c.out)return '<td class="out"><div class="d">'+(c.tail?'':c.d)+'</div></td>';
    var cls='',sid=-1;cat.sessions.forEach(function(s,idx){if(c.iso>=s.s&&c.iso<=s.e){cls='s';sid=idx;if(c.iso===s.s)cls+=' s0';if(c.iso===s.e)cls+=' s1'}});
    if(sid>=0&&selSession===sid)cls+=' sel';if(c.iso===today())cls+=' today';
    return '<td class="'+cls+'" '+(sid>=0?'data-sid="'+sid+'"':'')+'><div class="d">'+c.d+'</div></td>'}).join('')+'</tr>'}
  host.innerHTML='<div class="nav-c"><button id="calPrev">‹</button><b>'+MONTHS[mo]+' '+y+'</b><button id="calNext">›</button></div><table><thead><tr>'+['L','M','M','J','V','S','D'].map(function(x){return '<th>'+x+'</th>'}).join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
  byId('calPrev').onclick=function(){calRef=new Date(y,mo-1,1);buildCal()};byId('calNext').onclick=function(){calRef=new Date(y,mo+1,1);buildCal()};
  $$('#calendar td[data-sid]').forEach(function(td){td.querySelector('.d').onclick=function(){pickSession(+td.dataset.sid)}})}
function buildChips(){var host=byId('sessChips');if(!host)return;
  host.innerHTML=cat.sessions.map(function(s,i){return '<button class="chip '+(selSession===i?'on':'')+'" data-sid="'+i+'">'+esc(s.l.split('·')[0].trim())+' <small>'+fmt(s.s).slice(0,5)+'→'+fmt(s.e).slice(0,5)+'</small></button>'}).join('');
  $$('#sessChips .chip').forEach(function(c){c.onclick=function(){pickSession(+c.dataset.sid)}})}
function pickSession(i){selSession=i;var s=cat.sessions[i];byId('dstart').value=s.s;byId('dend').value=s.e;byId('lieu').value=/chiang|voyage/i.test(s.l)?'Chiang Mai':'Paris';calRef=new Date(+s.s.slice(0,4),+s.s.slice(5,7)-1,1);buildCal();buildChips();render()}

/* ================= PDF ================= */
function captureNode(srcId,w,h){
  var orig=byId(srcId);return new Promise(function(res,rej){
    var clone=orig.cloneNode(true);clone.style.transform='none';
    var holder=document.createElement('div');holder.style.cssText='position:fixed;left:-99999px;top:0;width:'+w+'px;height:'+h+'px;overflow:hidden';
    holder.appendChild(clone);document.body.appendChild(holder);
    var go=function(){
      if(srcId==='cert')$$('.f-nom,.f-form',clone).forEach(function(el){el.style.fontSize='51px';var fs=51,g=0;while(el.scrollWidth>860&&fs>9&&g<80){fs-=1;el.style.fontSize=fs+'px';g++}});
      html2canvas(clone,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false,width:w,height:h,windowWidth:w,windowHeight:h}).then(function(cv){holder.remove();res(cv)}).catch(function(e){holder.remove();rej(e)});
    };
    var fp=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve();
    fp.then(function(){setTimeout(go,60)},function(){setTimeout(go,60)});
  });
}
function guard(){if(!val('prenom')||!val('nom')){toast('Prénom et nom requis');return false}return true}
function slug(){return ((val('nom')+'_'+val('prenom'))||'document').replace(/[^\w\-]+/g,'_')}
function busy(btn,fn){var t=btn.innerHTML;btn.disabled=true;btn.innerHTML='⏳ Génération…';
  Promise.resolve().then(fn).then(function(){},function(e){console.error(e);toast('Erreur : '+(e&&e.message||e))}).then(function(){btn.disabled=false;btn.innerHTML=t})}
function jpdf(){return new window.jspdf.jsPDF(arguments[0])}
function pdf(kind,btn){if(!guard())return;busy(btn,function(){
  if(kind==='cert')return captureNode('cert',1000,707).then(function(c){var p=jpdf({orientation:'landscape',unit:'mm',format:'a4'});p.addImage(c.toDataURL('image/jpeg',0.95),'JPEG',0,0,297,210);p.save('Certificat_'+slug()+'.pdf');afterGen('Certificat téléchargé')});
  if(kind==='att')return captureNode('attest',720,1016).then(function(a){var p=jpdf({orientation:'portrait',unit:'mm',format:'a4'});p.addImage(a.toDataURL('image/jpeg',0.95),'JPEG',0,0,210,297);p.save('Attestation_'+slug()+'.pdf');afterGen('Attestation téléchargée')});
  return captureNode('cert',1000,707).then(function(c){return captureNode('attest',720,1016).then(function(a){var p=jpdf({orientation:'landscape',unit:'mm',format:'a4'});p.addImage(c.toDataURL('image/jpeg',0.95),'JPEG',0,0,297,210);p.addPage('a4','portrait');p.addImage(a.toDataURL('image/jpeg',0.95),'JPEG',0,0,210,297);p.save('Documents_'+slug()+'.pdf');afterGen('Les 2 documents téléchargés')})});
})}
function afterGen(msg){saveClient();gencount++;save(LS.gen,gencount);refreshAll();toast(msg)}

/* ================= CATALOGUE ================= */
function mountCatalogue(sel){var m=$(sel);if(!m||m._mounted)return;m.innerHTML=CATALOGUE_HTML;m._mounted=true;
  byId('modAdd').onclick=function(){var n=val('modName');if(!n)return;cat.modules.push({n:n,p:parseInt(byId('modPrice').value)||0});byId('modName').value=byId('modPrice').value='';persistCat()};
  byId('offAdd').onclick=function(){var n=val('offName');if(!n)return;cat.offers.push({n:n,p:parseInt(byId('offPrice').value)||0});byId('offName').value=byId('offPrice').value='';persistCat()};
  byId('sesAdd').onclick=function(){var l=val('sesLabel'),s=byId('sesStart').value,e=byId('sesEnd').value;if(!l||!s||!e)return toast('Intitulé + 2 dates requis');cat.sessions.push({l:l,s:s,e:e});byId('sesLabel').value='';persistCat();toast('Session ajoutée')};
  renderCat()}
function renderCat(){
  setHTML('#modList',cat.modules.map(function(m,i){return itemRow('mod',i,m)}).join('')||emptyRow());
  setHTML('#offList',cat.offers.map(function(o,i){return itemRow('off',i,o)}).join('')||emptyRow());
  setHTML('#sesList',cat.sessions.map(function(s,i){return '<div class="item"><span class="nm">'+esc(s.l)+'</span><span class="pr">'+fmt(s.s)+' → '+fmt(s.e)+'</span><button class="icon-btn" data-del="ses" data-i="'+i+'">🗑</button></div>'}).join('')||emptyRow())}
function itemRow(t,i,o){return '<div class="item"><input class="nm-in" data-edit="'+t+'" data-f="n" data-i="'+i+'" value="'+esc(o.n)+'"><input class="pr-in" data-edit="'+t+'" data-f="p" data-i="'+i+'" value="'+(o.p||'')+'" inputmode="numeric"><button class="icon-btn" data-del="'+t+'" data-i="'+i+'">🗑</button></div>'}
function emptyRow(){return '<div class="empty">Vide</div>'}
function persistCat(){save(LS.cat,cat);renderCat();fillFormation();buildCal();buildChips();updateStats()}
document.addEventListener('change',function(e){var inp=e.target.closest&&e.target.closest('[data-edit]');if(!inp)return;var arr=inp.dataset.edit==='mod'?cat.modules:cat.offers;if(inp.dataset.f==='n')arr[inp.dataset.i].n=inp.value.trim();else arr[inp.dataset.i].p=parseInt(inp.value)||0;persistCat()});
document.addEventListener('click',function(e){var del=e.target.closest&&e.target.closest('[data-del]');if(del){var k=del.dataset.del;(k==='mod'?cat.modules:k==='off'?cat.offers:cat.sessions).splice(+del.dataset.i,1);if(k==='ses')selSession=null;persistCat();return}});

/* ================= ÉLÈVES ================= */
function mountEleves(sel){var m=$(sel);if(!m||m._mounted)return;m.innerHTML=ELEVES_HTML;m._mounted=true;
  byId('cliSearch').oninput=function(e){renderClients(e.target.value)};
  byId('cliExport').onclick=exportCsv;renderClients()}
function renderClients(filter){
  if(filter==null){var cs=byId('cliSearch');filter=cs?cs.value:''}
  var f=String(filter).toLowerCase();
  var rows=clients.filter(function(c){return (c.nom+' '+c.prenom+' '+c.formation).toLowerCase().indexOf(f)>=0}).sort(function(a,b){return b.ts-a.ts});
  var html=rows.length?rows.map(function(c){return '<div class="cl"><div class="ci"><b>'+esc(c.prenom)+' '+esc((c.nom||'').toUpperCase())+'</b><span>'+esc(c.formation)+' · '+(c.ds?'du '+fmt(c.ds)+' au '+fmt(c.de):'—')+' · émis '+fmt(c.em)+'</span></div><button class="icon-btn add" title="Recharger" data-load="'+c.id+'">↺</button><button class="icon-btn" data-cdel="'+c.id+'">🗑</button></div>'}).join(''):'<div class="empty">Aucun élève pour le moment.</div>';
  setHTML('#cliList',html)}
document.addEventListener('click',function(e){
  var ld=e.target.closest&&e.target.closest('[data-load]');if(ld){loadClient(ld.dataset.load);return}
  var cd=e.target.closest&&e.target.closest('[data-cdel]');if(cd){clients=clients.filter(function(x){return x.id!=cd.dataset.cdel});save(LS.cli,clients);renderClients();updateStats();return}});
function loadClient(id){var c=null;clients.forEach(function(x){if(x.id==id)c=x});if(!c)return;
  if(!byId('cert')){setPrefillFromClient(c);location.href='dashboard.html';return}
  setIf('prenom',c.prenom);setIf('nom',c.nom);setIf('adresse',c.adresse||'');setIf('formation',c.formation);setIf('dstart',c.ds||'');setIf('dend',c.de||'');setIf('duree',c.duree||settings.dureeDef);setIf('lieu',c.lieu||settings.lieuDef);setIf('demit',c.em||'');selSession=null;render();if(window.MHgoGenerate)window.MHgoGenerate();toast('Élève rechargé')}
function setIf(id,v){var e=byId(id);if(e)e.value=v}
function saveClient(){var pre=val('prenom'),no=val('nom');if(!pre||!no)return;
  var rec={id:Date.now()+''+Math.floor(Math.random()*99),ts:Date.now(),prenom:pre,nom:no,adresse:val('adresse'),formation:val('formation'),ds:val('dstart'),de:val('dend'),duree:val('duree'),lieu:val('lieu'),em:val('demit')};
  var dup=null;clients.forEach(function(c){if(c.nom.toLowerCase()===rec.nom.toLowerCase()&&c.prenom.toLowerCase()===rec.prenom.toLowerCase()&&c.formation===rec.formation)dup=c});
  if(dup)Object.assign(dup,rec);else clients.unshift(rec);save(LS.cli,clients);renderClients();updateStats()}
function exportCsv(){if(!clients.length)return toast('Base vide');
  var head=['Prénom','Nom','Formation','Du','Au','Durée','Lieu','Émission','Adresse'];
  var rows=clients.map(function(c){return [c.prenom,c.nom,c.formation,c.ds,c.de,c.duree,c.lieu,c.em,c.adresse].map(function(v){return '"'+(v||'').replace(/"/g,'""')+'"'}).join(',')});
  dl(new Blob(['\ufeff'+head.join(',')+'\n'+rows.join('\n')],{type:'text/csv'}),'eleves_magic_hands.csv')}
function dl(blob,name){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click()}

/* ================= STATS / ADMIN ================= */
function updateStats(){
  setText('stEleves',clients.length);setText('stForm',cat.modules.length+cat.offers.length);
  var up=upcoming();setText('stSess',up.length?up.length+' · '+fmt(up[0].s).slice(0,5):'0');setText('stDocs',gencount);
  setText('nbEleves',clients.length);renderAdminHero();renderActivity();renderSideContacts();renderCloserStats();renderClosing()}
function renderAdminHero(){var el=byId('caNum');if(el)countUp(el,caSum());var el2=byId('caNum2');if(el2)countUp(el2,caSum())}
function countUp(el,to){var d=900,t0=performance.now();(function f(t){var p=Math.min((t-t0)/d,1),e=1-Math.pow(1-p,3);el.textContent=nfmt(Math.round(to*e));if(p<1)requestAnimationFrame(f)})(performance.now())}
function recentItems(){
  var won=contacts.filter(function(c){return c.stage==='won'}).map(function(c){return {ts:c.ts||0,type:'win',t:c.n,s:c.form+' · gagné',a:'+'+nfmt(c.amt)+'€'}});
  var docs=clients.slice(0,6).map(function(c){return {ts:c.ts||0,type:'doc',t:'Doc — '+c.prenom+' '+(c.nom||'').toUpperCase(),s:c.formation,a:'PDF'}});
  return won.concat(docs).sort(function(a,b){return b.ts-a.ts}).slice(0,6)}
function renderActivity(){var host=byId('activity');if(!host)return;
  host.innerHTML=recentItems().map(function(x){return '<div class="tx"><div class="ic '+x.type+'">'+(x.type==='win'?'✓':'📄')+'</div><div class="mid"><b>'+esc(x.t)+'</b><small>'+esc(x.s)+'</small></div><div class="amt '+(x.type==='doc'?'pdf':'')+'">'+x.a+'</div></div>'}).join('')||'<div class="empty">Rien pour le moment.</div>'}
function renderSideContacts(){var host=byId('sideContacts');if(!host)return;
  host.innerHTML=contacts.slice().sort(function(a,b){return (b.ts||0)-(a.ts||0)}).slice(0,5).map(function(c){return '<div class="ct"><span class="dot" style="color:'+stC(c.stage)+'">●</span><div class="mid"><b>'+esc(c.n)+'</b><small>'+esc(c.form)+' · '+stL(c.stage)+'</small></div><span class="mt">'+nfmt(c.amt)+'€</span></div>'}).join('')}
function renderCloserStats(){setText('csDocs',gencount);setText('csCa',nfmt(caSum()));setText('csDeals',contacts.filter(function(c){return c.stage==='won'}).length)}

/* ================= RÉGLAGES ================= */
function mountSettings(sel){var m=$(sel);if(!m||m._mounted)return;m.innerHTML=SETTINGS_HTML;m._mounted=true;
  byId('setFormateur').value=settings.formateur;byId('setEtab').value=settings.etab;byId('setLieu').value=settings.lieuDef;byId('setDuree').value=settings.dureeDef;
  ['setFormateur','setEtab','setLieu','setDuree'].forEach(function(id){byId(id).addEventListener('input',function(){
    settings.formateur=val('setFormateur');settings.etab=val('setEtab');settings.lieuDef=val('setLieu');settings.dureeDef=val('setDuree');save(LS.set,settings);render()})});
  byId('btnExport').onclick=exportJSON;byId('btnImport').onclick=function(){byId('impFile').click()};
  byId('impFile').onchange=importJSON}
function exportJSON(){var data={v:1,exported:new Date().toISOString(),catalogue:cat,clients:clients,contacts:contacts,settings:settings,gencount:gencount};
  dl(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'magic-hands-data.json');toast('Export .json')}
function importJSON(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();
  r.onload=function(){try{var d=JSON.parse(r.result);
    if(d.catalogue){cat=d.catalogue;save(LS.cat,cat)}if(d.clients){clients=d.clients;save(LS.cli,clients)}
    if(d.contacts){contacts=d.contacts;save(LS.con,contacts)}if(d.settings){settings=Object.assign({},DEFAULT_SET,d.settings);save(LS.set,settings)}
    if(typeof d.gencount==='number'){gencount=d.gencount;save(LS.gen,gencount)}
    fillFormation();renderCat();renderClients();refreshAll();toast('Données importées')}catch(err){toast('Fichier invalide')}};
  r.readAsText(f);e.target.value=''}

/* ================= CLOSING ================= */
function mountClosing(sel){var m=$(sel);if(!m||m._mounted)return;m.innerHTML=CLOSING_HTML;m._mounted=true;
  byId('addContact').onclick=addContact;
  byId('vtoggle').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;$$('#vtoggle button').forEach(function(x){x.classList.remove('on')});b.classList.add('on');var list=b.dataset.v==='list';byId('listview').classList.toggle('on',list);byId('kanban').classList.toggle('off',list)});
  renderClosing()}
function renderClosing(){var k=byId('kanban');if(!k)return;
  setText('cTotal',contacts.length);setText('cRdv',contacts.filter(function(c){return c.stage==='rdv'}).length);
  setText('cWon',contacts.filter(function(c){return c.stage==='won'}).length);var ca=byId('cCa');if(ca)countUp(ca,caSum());
  k.innerHTML=STAGES.map(function(st){var items=contacts.filter(function(c){return c.stage===st.k});
    return '<div class="col"><div class="colh"><b><span class="ac" style="background:'+st.c+'"></span>'+st.l+'</b><span class="cnt">'+items.length+'</span></div>'+(items.map(cardHtml).join('')||'<div style="font-size:11px;color:#7d8f88;text-align:center;padding:18px 0">—</div>')+'</div>'}).join('');
  var lr=byId('listRows');if(lr)lr.innerHTML=contacts.map(function(c){return '<div class="lrow"><b>'+esc(c.n)+'</b><span class="form formc">'+esc(c.form)+'</span><span class="telc">'+esc(c.tel||'')+'</span><span class="st" style="background:'+stC(c.stage)+'22;color:'+stC(c.stage)+'">'+stL(c.stage)+'</span><span class="mt">'+nfmt(c.amt)+'€</span><select data-cid="'+c.id+'" class="js-stage">'+STAGES.map(function(s){return '<option value="'+s.k+'"'+(s.k===c.stage?' selected':'')+'>'+s.l+'</option>'}).join('')+'</select></div>'}).join('')}
function cardHtml(c){var won=c.stage==='won';
  return '<div class="card '+(won?'won':'')+'" data-cid="'+c.id+'"><div class="top"><b>'+esc(c.n)+'</b><span class="mt">'+nfmt(c.amt)+'€</span></div>'
  +'<div class="form">'+esc(c.form)+'</div><div class="meta"><span class="tel">'+esc(c.tel||'')+'</span></div>'
  +'<div class="acts2">'+(won
    ?'<button class="mini gen" data-gen="'+c.id+'">⬇️ Générer le doc</button>'
    :'<button class="mini adv" data-adv="'+c.id+'">Avancer →</button><button class="mini lose" data-lose="'+c.id+'">Perdu</button>')
  +'</div></div>'}
var ORDER=['new','contact','rdv','won'];
document.addEventListener('click',function(e){
  var adv=e.target.closest&&e.target.closest('[data-adv]');if(adv){stageMove(adv.dataset.adv,1);var card=adv.closest('.card');if(card)card.classList.add('moving');return}
  var lo=e.target.closest&&e.target.closest('[data-lose]');if(lo){setStage(lo.dataset.lose,'lost');return}
  var gn=e.target.closest&&e.target.closest('[data-gen]');if(gn){winGenerate(gn.dataset.gen);return}});
document.addEventListener('change',function(e){var s=e.target.closest&&e.target.closest('.js-stage');if(s){setStage(s.dataset.cid,s.value)}});
function findC(id){for(var i=0;i<contacts.length;i++)if(contacts[i].id==id)return contacts[i];return null}
function stageMove(id,dir){var c=findC(id);if(!c)return;var i=ORDER.indexOf(c.stage);if(i<0)i=0;c.stage=ORDER[Math.min(i+dir,ORDER.length-1)];c.ts=Date.now();persistContacts();if(c.stage==='won')toast(c.n+' gagné · +'+nfmt(c.amt)+'€')}
function setStage(id,st){var c=findC(id);if(!c)return;c.stage=st;c.ts=Date.now();persistContacts()}
function persistContacts(){save(LS.con,contacts);renderClosing();updateStats()}
function addContact(){var n=prompt('Nom du contact ?');if(!n)return;var form=prompt('Formation visée ?')||cat.modules[0].n;var amt=parseInt(prompt('Montant (€) ?')||'0')||0;var tel=prompt('Téléphone ?')||'';
  contacts.unshift({id:'c'+Date.now(),n:n.trim(),tel:tel,form:form,stage:'new',amt:amt,ts:Date.now()});persistContacts();toast('Contact ajouté')}
function winGenerate(id){var c=findC(id);if(!c)return;
  var parts=c.n.trim().split(' ');var prenom=parts.shift()||c.n;var nom=parts.join(' ')||prenom;
  var rec={prenom:prenom,nom:nom,adresse:'',formation:c.form,ds:'',de:'',duree:settings.dureeDef,lieu:settings.lieuDef,em:today()};
  save(LS.pre,rec);
  if(byId('cert')){applyPrefill(rec);if(window.MHgoGenerate)window.MHgoGenerate();toast('Pré-rempli — vérifie puis génère')}
  else{location.href='dashboard.html'}}

/* ================= PREFILL (closing → générateur) ================= */
function setPrefillFromClient(c){save(LS.pre,{prenom:c.prenom,nom:c.nom,adresse:c.adresse||'',formation:c.formation,ds:c.ds||'',de:c.de||'',duree:c.duree||settings.dureeDef,lieu:c.lieu||settings.lieuDef,em:c.em||today()})}
function applyPrefill(rec){['prenom','nom','adresse','formation','dstart','dend','duree','lieu','demit'].forEach(function(id){});
  setIf('prenom',rec.prenom);setIf('nom',rec.nom);setIf('adresse',rec.adresse);setIf('formation',rec.formation);setIf('dstart',rec.ds);setIf('dend',rec.de);setIf('duree',rec.duree);setIf('lieu',rec.lieu);setIf('demit',rec.em);render()}
function loadPrefill(){var rec=load(LS.pre,null);if(rec&&byId('cert')){applyPrefill(rec);try{localStorage.removeItem(LS.pre)}catch(e){}if(window.MHgoGenerate)window.MHgoGenerate()}}

/* ================= SYNC inter-fichiers ================= */
window.addEventListener('storage',function(e){if(!e.key)return;
  if(e.key===LS.cat)cat=load(LS.cat,cat);
  else if(e.key===LS.cli)clients=load(LS.cli,clients);
  else if(e.key===LS.con)contacts=load(LS.con,contacts);
  else if(e.key===LS.gen)gencount=load(LS.gen,gencount);
  else if(e.key===LS.set)settings=Object.assign({},DEFAULT_SET,load(LS.set,{}));
  else return;
  fillFormation();renderCat();renderClients();refreshAll()});

/* ================= REFRESH + AUTO-INIT ================= */
function refreshAll(){updateStats();renderClosing();renderActivity();renderSideContacts();renderCloserStats();if(byId('cert'))requestAnimationFrame(scaleDocs)}
function autoInit(){
  if($('[data-mount="generator"]'))mountGenerator('[data-mount="generator"]');
  if($('[data-mount="catalogue"]'))mountCatalogue('[data-mount="catalogue"]');
  if($('[data-mount="eleves"]'))mountEleves('[data-mount="eleves"]');
  if($('[data-mount="settings"]'))mountSettings('[data-mount="settings"]');
  if($('[data-mount="closing"]'))mountClosing('[data-mount="closing"]');
  updateStats();
}
/* API publique (pour les shells) */
window.MH={mountGenerator:mountGenerator,mountCatalogue:mountCatalogue,mountEleves:mountEleves,mountSettings:mountSettings,mountClosing:mountClosing,
  scaleDocs:scaleDocs,refreshAll:refreshAll,render:render,toast:toast,exportJSON:exportJSON,
  data:function(){return {cat:cat,clients:clients,contacts:contacts,settings:settings,gencount:gencount,ca:caSum()}}};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',autoInit);else autoInit();
})();

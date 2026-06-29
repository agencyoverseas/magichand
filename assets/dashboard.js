/* ============================================================
   dashboard.js — Tableau de bord Magic Hands (NexusAI)
   Lit window.MH.data() (catalogue, élèves, contacts, gencount, CA)
   et alimente KPI + tableau + 3 graphes Chart.js (vraies données).
   Découplé : ne modifie pas app.js. Se met à jour sur navigation
   (showScr 'home') et sur synchronisation (event 'storage').
   ============================================================ */
(function(){
  var MS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  var STAGES=[
    {k:'new',l:'Nouveau',c:'#8fa39b'},
    {k:'contact',l:'Contacté',c:'#D5B56F'},
    {k:'rdv',l:'RDV',c:'#E8954C'},
    {k:'won',l:'Gagné',c:'#5fd39a'},
    {k:'lost',l:'Perdu',c:'#c96f6f'}
  ];
  var charts={};
  function byId(id){return document.getElementById(id)}
  function nfmt(n){return (n||0).toLocaleString('fr-FR')}
  function euro(n){return nfmt(n)+' €'}
  function esc(s){return (''+(s||'')).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])})}
  function fmtD(iso){if(!iso)return '—';var p=(''+iso).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:(''+iso)}
  function monthKeys(n){var out=[],now=new Date();for(var i=n-1;i>=0;i--){var d=new Date(now.getFullYear(),now.getMonth()-i,1);out.push({y:d.getFullYear(),m:d.getMonth(),label:MS[d.getMonth()]});}return out}
  function sameM(ts,k){if(!ts)return false;var d=new Date(ts);return d.getFullYear()===k.y&&d.getMonth()===k.m}
  function initials(p,n){var a=(p||'').trim(),b=(n||'').trim();var s=((a?a[0]:'')+(b?b[0]:'')).toUpperCase();return s||'·'}

  function destroy(id){if(charts[id]){try{charts[id].destroy()}catch(e){}charts[id]=null}}
  function make(id,cfg){var c=byId(id);if(!c||!window.Chart)return;destroy(id);charts[id]=new window.Chart(c.getContext('2d'),cfg)}

  var GRID={color:'#eef3f1'}, TICK={color:'#8a9a93',font:{size:11}};

  function render(){
    if(!window.MH||!window.MH.data)return;
    var d=window.MH.data();
    var cat=d.cat||{},clients=d.clients||[],contacts=d.contacts||[];

    /* ---- KPI ---- */
    if(byId('kpiDocs'))byId('kpiDocs').textContent=nfmt(d.gencount||0);
    if(byId('kpiElv'))byId('kpiElv').textContent=nfmt(clients.length);
    if(byId('kpiCa'))byId('kpiCa').textContent=euro(d.ca||0);

    /* ---- Prochaine session (sidebar) ---- */
    var sess=(cat.sessions||[]).slice().sort(function(a,b){return (a.s||'').localeCompare(b.s||'')});
    var today=new Date().toISOString().slice(0,10);
    var next=sess.filter(function(s){return (s.e||s.s)>=today})[0];
    if(byId('sideNextL'))byId('sideNextL').textContent=next?(next.l||'Session'):'Aucune à venir';
    if(byId('sideNextD'))byId('sideNextD').textContent=next?(fmtD(next.s)+' → '+fmtD(next.e)):'';

    /* ---- Tableau derniers documents ---- */
    var tb=byId('recentDocs');
    if(tb){
      var rows=clients.slice().sort(function(a,b){return (b.ts||0)-(a.ts||0)}).slice(0,6);
      if(!rows.length){
        tb.innerHTML='<tr><td colspan="4" class="empty-td">Aucun document généré pour le moment.</td></tr>';
      }else{
        tb.innerHTML=rows.map(function(c){
          return '<tr><td><div class="who"><div class="av">'+esc(initials(c.prenom,c.nom))+'</div>'+
            '<b>'+esc(c.prenom)+' '+esc((c.nom||'').toUpperCase())+'</b></div></td>'+
            '<td>'+esc(c.formation||'—')+'</td>'+
            '<td class="hide-sm">'+fmtD(c.em)+'</td>'+
            '<td><span class="pill">PDF</span></td></tr>';
        }).join('');
      }
    }

    /* ---- Graphe barres : élèves / mois ---- */
    var keys=monthKeys(6);
    var labels=keys.map(function(k){return k.label});
    var elvByMonth=keys.map(function(k){return clients.filter(function(c){return sameM(c.ts,k)}).length});
    make('chartBars',{
      type:'bar',
      data:{labels:labels,datasets:[{label:'Élèves',data:elvByMonth,backgroundColor:'#C9A85F',hoverBackgroundColor:'#B79750',borderRadius:7,maxBarThickness:34}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{backgroundColor:'#0F4A3C'}},
        scales:{x:{grid:{display:false},ticks:TICK},y:{beginAtZero:true,grid:GRID,ticks:Object.assign({precision:0},TICK)}}}
    });

    /* ---- Donut : répartition pipeline ---- */
    var counts=STAGES.map(function(s){return contacts.filter(function(c){return c.stage===s.k}).length});
    var hasAny=counts.some(function(v){return v>0});
    make('chartDonut',{
      type:'doughnut',
      data:{labels:STAGES.map(function(s){return s.l}),
        datasets:[{data:hasAny?counts:[1,1,1,1,1],backgroundColor:STAGES.map(function(s){return s.c}),borderColor:'#fff',borderWidth:3,hoverOffset:6}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
        plugins:{legend:{position:'bottom',labels:{boxWidth:10,boxHeight:10,usePointStyle:true,font:{size:11},color:'#566a62',padding:12}},
          tooltip:{enabled:hasAny,backgroundColor:'#0F4A3C'}}}
    });

    /* ---- Courbe : CA encaissé / mois ---- */
    var caByMonth=keys.map(function(k){return contacts.filter(function(c){return c.stage==='won'&&sameM(c.ts,k)}).reduce(function(s,c){return s+(c.amt||0)},0)});
    make('chartLine',{
      type:'line',
      data:{labels:labels,datasets:[{label:'CA',data:caByMonth,borderColor:'#0F4A3C',backgroundColor:'rgba(15,74,60,.10)',fill:true,tension:.4,borderWidth:2.5,pointBackgroundColor:'#C9A85F',pointBorderColor:'#0F4A3C',pointRadius:4,pointHoverRadius:6}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{backgroundColor:'#0F4A3C',callbacks:{label:function(ctx){return euro(ctx.parsed.y)}}}},
        scales:{x:{grid:{display:false},ticks:TICK},y:{beginAtZero:true,grid:GRID,ticks:Object.assign({callback:function(v){return v>=1000?(v/1000)+'k':v}},TICK)}}}
    });
  }

  function resize(){for(var k in charts){if(charts[k]){try{charts[k].resize()}catch(e){}}}}

  window.MHdash={render:render,resize:resize};

  /* boot : home visible par défaut */
  if(document.readyState!=='loading')setTimeout(render,60);
  else document.addEventListener('DOMContentLoaded',function(){setTimeout(render,60)});

  /* maj live après synchronisation (sync.js redéclenche 'storage') */
  var _t;window.addEventListener('storage',function(){clearTimeout(_t);_t=setTimeout(function(){var h=byId('scr-home');if(h&&h.classList.contains('on'))render();},300);});
})();

/* ============================================================
   shell.js — Comportements de la coquille refondue :
   thème clair/sombre, badge hors ligne, barre à pills,
   écran Analytics, bannière d'installation au 2e passage.
   ============================================================ */
(function (w, d) {
  'use strict';
  function byId(i) { return d.getElementById(i); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  /* ---------- thème ---------- */
  var KEY_THEME = 'mh.theme';
  function applyTheme(t) {
    d.documentElement.setAttribute('data-theme', t);
    var m = d.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#0A1A16' : '#0F4A3C');
    try { localStorage.setItem(KEY_THEME, t); } catch (e) {}
  }
  try { applyTheme(localStorage.getItem(KEY_THEME) || 'light'); } catch (e) {}
  on(byId('mhTheme'), 'click', function () {
    applyTheme(d.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  /* ---------- barre à pills : même comportement que la nav du bas ---------- */
  d.addEventListener('click', function (e) {
    var p = e.target.closest && e.target.closest('.mhpill');
    if (!p) return;
    d.querySelectorAll('.mhpill').forEach(function (x) { x.classList.toggle('on', x === p); });
  });

  /* ---------- badge hors ligne ---------- */
  function syncOffline() {
    var b = byId('mhOffline');
    if (b) b.classList.toggle('show', !navigator.onLine);
  }
  w.addEventListener('online', syncOffline);
  w.addEventListener('offline', syncOffline);
  syncOffline();

  /* ---------- bannière d'installation : au 2e passage ---------- */
  var KEY_VISITS = 'mh.visits', KEY_PWA = 'mh.pwa.vu';
  var deferred = null;
  w.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; maybeShow(); });

  function visits() {
    var n = 0;
    try { n = parseInt(localStorage.getItem(KEY_VISITS) || '0', 10) + 1; localStorage.setItem(KEY_VISITS, n); } catch (e) {}
    return n;
  }
  var V = visits();

  function maybeShow() {
    var vu = false;
    try { vu = localStorage.getItem(KEY_PWA) === '1'; } catch (e) {}
    var standalone = w.matchMedia('(display-mode: standalone)').matches || w.navigator.standalone;
    if (vu || standalone || V < 2) return;
    var el = byId('mhPwa');
    if (el) setTimeout(function () { el.classList.add('show'); }, 1200);
  }
  maybeShow();

  w.mhPwaInstall = function () {
    if (deferred) { deferred.prompt(); deferred = null; }
    else {
      alert("Pour installer : menu du navigateur, puis « Ajouter à l'écran d'accueil ».\n\nSur iPhone, il faut passer par Safari — c'est la seule façon de recevoir les notifications.");
    }
    w.mhPwaHide();
  };
  w.mhPwaHide = function () {
    var el = byId('mhPwa'); if (el) el.classList.remove('show');
    try { localStorage.setItem(KEY_PWA, '1'); } catch (e) {}
  };

  /* ---------- écran Analytics ---------- */
  var periode = 'annee';
  function debut() {
    var n = new Date();
    if (periode === 'mois') return new Date(n.getFullYear(), n.getMonth(), 1);
    if (periode === 'douze') return new Date(n.getFullYear(), n.getMonth() - 11, 1);
    return new Date(n.getFullYear(), 0, 1);
  }
  function eur(n) { return Math.round(n).toLocaleString('fr-FR').replace(/\u202f/g, ' ') + ' €'; }

  function renderAna() {
    var host = d.querySelector('[data-mount="analytics"]');
    if (!host || !w.MHData) return;
    var D = w.MHData.data, t = w.MHData.totaux(debut());

    // pédagogique
    var eleves = (D.eleves || []).filter(function (e) { return !e.archived; }).length;
    var docs = (D.documents || []).length;
    var em = D.emargements || [];
    var presence = '—';
    if (w.MHemarg && typeof w.MHemarg.tauxPresence === 'function') presence = w.MHemarg.tauxPresence() + ' %';

    // répartition par offre
    var parOffre = {};
    (D.calls || []).forEach(function (c) {
      if (!c.resultat || c.resultat.indexOf('signed') !== 0) return;
      if (new Date(c.date_appel) < debut()) return;
      var k = c.offre || 'Autre';
      parOffre[k] = (parOffre[k] || 0) + Number(c.montant || 0);
    });
    var lignes = Object.keys(parOffre).sort(function (a, b) { return parOffre[b] - parOffre[a]; });

    host.innerHTML =
      '<div class="ana-per">' +
      ['mois:Ce mois', 'annee:Cette année', 'douze:12 mois'].map(function (o) {
        var k = o.split(':')[0];
        return '<button data-per="' + k + '" class="' + (periode === k ? 'on' : '') + '">' + o.split(':')[1] + '</button>';
      }).join('') +
      '<button data-exp="csv">Export CSV</button><button data-exp="pdf">Export PDF</button>' +
      '</div>' +

      '<div class="ana-sec"><div class="ana-t">Business</div><div class="ana-k">' +
      card('CA encaissé', eur(t.encaisse), t.ventes + ' ventes signées') +
      card('Commissions', eur(t.commissions), t.aQualifier ? t.aQualifier + ' vente(s) à qualifier' : 'toutes qualifiées') +
      card('Panier moyen', t.ventes ? eur(t.ca / t.ventes) : '—', 'sur la période') +
      '</div></div>' +

      (lignes.length ? '<div class="ana-sec"><div class="ana-t">Répartition par offre</div>' +
        lignes.map(function (k) {
          return '<div class="ana-c" style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px">' +
                 '<b style="font-weight:700">' + esc(k) + '</b><span style="font-family:var(--serif);color:var(--gold-d)">' + eur(parOffre[k]) + '</span></div>';
        }).join('') + '</div>' : '') +

      '<div class="ana-sec"><div class="ana-t">Pédagogique</div><div class="ana-k">' +
      card('Taux de présence', presence, 'indicateur Qualiopi') +
      card('Élèves actifs', String(eleves), (D.eleves || []).length + ' fiches au total') +
      card('Documents émis', String(docs), 'certificats et attestations') +
      '</div></div>';

    host.querySelectorAll('[data-per]').forEach(function (b) {
      b.onclick = function () { periode = b.getAttribute('data-per'); renderAna(); };
    });
    host.querySelectorAll('[data-exp]').forEach(function (b) {
      b.onclick = function () { exporter(b.getAttribute('data-exp'), t, parOffre); };
    });
  }

  function card(l, v, s) {
    return '<div class="ana-c"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function exporter(kind, t, parOffre) {
    if (kind === 'csv') {
      var rows = [['Indicateur', 'Valeur']];
      rows.push(['CA encaissé', Math.round(t.encaisse)]);
      rows.push(['Commissions', Math.round(t.commissions)]);
      rows.push(['Ventes signées', t.ventes]);
      Object.keys(parOffre).forEach(function (k) { rows.push(['Offre — ' + k, Math.round(parOffre[k])]); });
      var csv = rows.map(function (r) { return r.join(';'); }).join('\n');
      var a = d.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'analytics-magic-hands.csv'; a.click();
      return;
    }
    if (!w.jspdf) { alert('Le module PDF n’est pas chargé.'); return; }
    var p = new w.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    p.setFont('helvetica', 'bold'); p.setFontSize(16);
    p.text('Magic Hands — Analytics', 20, 22);
    p.setFont('helvetica', 'normal'); p.setFontSize(11);
    var y = 36;
    [['CA encaissé', eur(t.encaisse)], ['Commissions', eur(t.commissions)],
     ['Ventes signées', String(t.ventes)]].forEach(function (r) {
      p.text(r[0], 20, y); p.text(r[1], 120, y); y += 8;
    });
    y += 4; p.setFont('helvetica', 'bold'); p.text('Répartition par offre', 20, y); y += 8;
    p.setFont('helvetica', 'normal');
    Object.keys(parOffre).forEach(function (k) { p.text(k, 20, y); p.text(eur(parOffre[k]), 120, y); y += 7; });
    p.save('analytics-magic-hands.pdf');
  }

  w.MHana = { render: renderAna };
  if (w.MHData) w.MHData.onChange(function () {
    if (byId('scr-ana') && byId('scr-ana').classList.contains('on')) renderAna();
  });
  d.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-scr="ana"]');
    if (b) setTimeout(renderAna, 30);
  });

  /* ---------- neutraliser le verre pendant la capture PDF ---------- */
  var _hc = w.html2canvas;
  if (_hc) {
    w.html2canvas = function () {
      d.body.classList.add('capturing');
      var r = _hc.apply(this, arguments);
      return r && r.finally ? r.finally(function () { d.body.classList.remove('capturing'); }) : r;
    };
  }
})(window, document);

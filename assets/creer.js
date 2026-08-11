/* ============================================================
   creer.js — Le bouton central de la barre du bas.

   Il ouvrait directement l'écran Documents. Il ouvre maintenant
   un menu de création à quatre choix :

     Certificat · Attestation · Feuille d'émargement · Nouvel élève

   La feuille d'émargement peut être créée seule, sans qu'une
   fiche élève existe : on saisit le nom du stagiaire, la feuille
   vit par elle-même et pourra être rattachée plus tard.

   Le menu de navigation (Catalogue, Closing, Analytics…) reste
   sur le bouton ☰ en haut à gauche.
   ============================================================ */
(function (w, d) {
  'use strict';

  function byId(i) { return d.getElementById(i); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function toast(m) {
    if (w.toast) return w.toast(m);
    var t = byId('toast');
    if (t) { t.textContent = m; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2400); }
  }

  /* ---------- le panneau ---------- */
  function panneau() {
    var el = byId('creerSheet');
    if (el) return el;

    var bg = d.createElement('div');
    bg.className = 'creer-bg'; bg.id = 'creerBg';
    bg.addEventListener('click', fermer);
    d.body.appendChild(bg);

    el = d.createElement('div');
    el.className = 'creer-sheet'; el.id = 'creerSheet';
    el.setAttribute('role', 'menu');
    el.innerHTML =
      '<div class="grab"></div>' +
      '<div class="creer-t">Créer</div>' +
      item('cert',  'ic-doc',  'Certificat',            'Certificat professionnel') +
      item('attest','ic-doc',  'Attestation',           'Attestation de formation') +
      item('emarg', 'ic-sign', "Feuille d'émargement",  'Sans passer par une fiche élève') +
      item('eleve', 'ic-users','Nouvel élève',          'Fiche complète') +
      '<div class="creer-libre" id="creerLibre">' +
        '<label>Nom du stagiaire</label>' +
        '<input id="clNom" placeholder="Prénom NOM" autocomplete="off">' +
        '<label>Formation</label>' +
        '<select id="clForm"></select>' +
        '<div class="creer-acts">' +
          '<button class="btn-sec" id="clAnnul">Annuler</button>' +
          '<button class="btn-pri" id="clOk">Créer la feuille</button>' +
        '</div>' +
      '</div>';
    d.body.appendChild(el);

    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-creer]');
      if (b) choisir(b.getAttribute('data-creer'));
    });
    byId('clAnnul').addEventListener('click', function () { byId('creerLibre').classList.remove('on'); });
    byId('clOk').addEventListener('click', validerLibre);
    return el;
  }

  function item(cle, icone, titre, sous) {
    return '<button class="creer-item" data-creer="' + cle + '" role="menuitem">' +
      '<span class="ic"><svg><use href="#' + icone + '"/></svg></span>' +
      '<span class="tx"><b>' + esc(titre) + '</b><span>' + esc(sous) + '</span></span></button>';
  }

  function ouvrir() {
    panneau();
    byId('creerLibre').classList.remove('on');
    byId('creerBg').classList.add('show');
    byId('creerSheet').classList.add('on');
  }
  function fermer() {
    var s = byId('creerSheet'), b = byId('creerBg');
    if (s) s.classList.remove('on');
    if (b) b.classList.remove('show');
  }

  /* ---------- les quatre choix ---------- */
  function choisir(quoi) {
    if (quoi === 'emarg') { ouvrirLibre(); return; }
    fermer();

    if (quoi === 'eleve') {
      if (typeof w.showScr === 'function') w.showScr('elv');
      setTimeout(function () {
        var b = d.querySelector('[data-new-eleve], #btnNewEleve, .btn-new-eleve');
        if (b) b.click(); else toast('Ajoute l’élève depuis la liste');
      }, 220);
      return;
    }

    // certificat ou attestation : écran Documents, sur le bon onglet
    if (typeof w.showScr === 'function') w.showScr('docs');
    setTimeout(function () {
      var idx = (quoi === 'attest') ? 1 : 0;
      var t = d.querySelector('.doctab[data-i="' + idx + '"]');
      if (t && !t.classList.contains('on')) t.click();
      var champ = d.querySelector('#docPrenom, #cPrenom, .doc-form input');
      if (champ) champ.focus();
    }, 240);
  }

  /* ---------- feuille d'émargement vierge ---------- */
  function ouvrirLibre() {
    var sel = byId('clForm');
    sel.innerHTML = '<option value="">— aucune formation —</option>' +
      formations().map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('');
    byId('creerLibre').classList.add('on');
    setTimeout(function () { byId('clNom').focus(); }, 120);
  }

  function formations() {
    var out = [];
    try {
      var cat = JSON.parse(localStorage.getItem('mh_catalog_v3')) || {};
      (cat.offers || []).forEach(function (o) { if (o && o.n) out.push(o.n); });
      (cat.modules || []).forEach(function (m) { if (m && m.n) out.push(m.n); });
    } catch (e) {}
    return out;
  }

  function validerLibre() {
    var nom = (byId('clNom').value || '').trim();
    var form = byId('clForm').value || '';
    if (!nom) { byId('clNom').focus(); toast('Indique le nom du stagiaire'); return; }
    if (!w.MHemarg || !w.MHemarg.creerLibre) { toast('Module émargement non chargé'); return; }

    var b = byId('clOk');
    b.disabled = true; b.textContent = 'Création…';
    w.MHemarg.creerLibre(nom, form).then(function (row) {
      b.disabled = false; b.textContent = 'Créer la feuille';
      fermer();
      byId('clNom').value = '';
      if (typeof w.showScr === 'function') w.showScr('emarg');
      toast(row ? 'Feuille créée pour ' + nom : 'Feuille enregistrée hors ligne');
    }).catch(function (e) {
      b.disabled = false; b.textContent = 'Créer la feuille';
      toast('Création impossible : ' + (e && e.message ? e.message : 'erreur'));
    });
  }

  /* ---------- branchement ---------- */
  d.addEventListener('click', function (e) {
    var f = e.target.closest && e.target.closest('.fab-btn');
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    ouvrir();
  }, true);   // en capture : on passe avant le gestionnaire d'origine

  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') fermer();
    if (e.key === 'Enter' && byId('creerLibre') && byId('creerLibre').classList.contains('on')) validerLibre();
  });

  w.MHcreer = { ouvrir: ouvrir, fermer: fermer };
})(window, document);

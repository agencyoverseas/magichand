/* ============================================================
   mh-ui.js — Les écrans ajoutés au cadrage du 17/08.

     1. Bibliothèque : tous les documents, tous élèves confondus,
        du plus récent, avec recherche et filtres. C'est elle que
        l'onglet « Docs » de la barre du bas ouvre désormais ; le
        générateur reste accessible par le bouton « Nouveau
        document » en haut de la liste.
     2. Envoi groupé : bouton sous « Feuille d'émargement » de la
        fiche élève, sélection un par un ou tout d'un coup, puis
        Mail, WhatsApp ou Téléchargement.
     3. Création d'élève : la fiche part en base immédiatement,
        sans passer par la génération d'un document.

   Rien n'est réécrit dans app.js : ce fichier s'accroche aux
   écrans existants et ajoute les siens.
   ============================================================ */
(function (w, d) {
  'use strict';

  function M() { return w.MHData || null; }
  function byId(x) { return d.getElementById(x); }
  function toast(m) { if (w.MH && w.MH.toast) w.MH.toast(m); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function jour(v) {
    if (!v) return '';
    var p = String(v).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(v);
  }
  function normName(p, n) {
    if (w.normName) return w.normName(p, n);
    return ((p || '') + ' ' + (n || '')).normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function libelleType(t) {
    return { cert: 'Certificat', att: 'Attestation', attest: 'Attestation',
      emarg: 'Émargement', fiche: 'Inscription' }[t] || 'Document';
  }

  /* ============================================================
     1. BIBLIOTHÈQUE
     ============================================================ */

  function ecranBiblio() {
    var s = byId('scr-biblio');
    if (s) return s;
    s = d.createElement('section');
    s.className = 'scr';
    s.id = 'scr-biblio';
    s.innerHTML =
      '<div class="card-sec">'
      + '<div class="biblio-bar">'
      + '  <input id="bibSearch" class="inp" placeholder="Rechercher un document, un élève…">'
      + '  <button class="btn cta" id="bibNouveau">+ Nouveau document</button>'
      + '</div>'
      + '<div class="biblio-filtres">'
      + '  <select id="bibForm" class="inp"><option value="">Toutes formations</option></select>'
      + '  <select id="bibType" class="inp">'
      + '    <option value="">Tous les types</option>'
      + '    <option value="cert">Certificats</option>'
      + '    <option value="att">Attestations</option>'
      + '    <option value="emarg">Émargements</option>'
      + '  </select>'
      + '  <select id="bibPeriode" class="inp">'
      + '    <option value="">Toutes périodes</option>'
      + '    <option value="30">30 derniers jours</option>'
      + '    <option value="90">3 derniers mois</option>'
      + '    <option value="365">12 derniers mois</option>'
      + '  </select>'
      + '</div>'
      + '<div id="bibListe" class="biblio-liste"></div>'
      + '</div>';

    var main = byId('main') || d.querySelector('.main') || d.body;
    var ancre = byId('scr-elv');
    if (ancre && ancre.parentNode) ancre.parentNode.insertBefore(s, ancre);
    else main.appendChild(s);

    byId('bibNouveau').onclick = function () { if (w.showScr) w.showScr('docs'); };
    ['bibSearch', 'bibForm', 'bibType', 'bibPeriode'].forEach(function (id) {
      var e = byId(id); if (!e) return;
      e.addEventListener(id === 'bibSearch' ? 'input' : 'change', rendBiblio);
    });
    return s;
  }

  /** Les documents, enrichis du nom de leur élève. */
  function documents() {
    var api = M(); if (!api) return [];
    var data = api.data || {};
    var parId = {};
    (data.eleves || []).forEach(function (e) { parId[e.id] = e; });
    return (data.documents || []).map(function (doc) {
      var e = parId[doc.eleve_id] || {};
      return {
        id: doc.id, type: doc.type || 'cert',
        prenom: e.prenom || '', nom: e.nom || '',
        formation: doc.formation || e.formation || '',
        date: doc.date_emise || doc.date_debut || (doc.created_at || '').slice(0, 10),
        pdf: doc.pdf_path || '',
        ts: doc.created_at ? Date.parse(doc.created_at) : 0
      };
    }).sort(function (a, b) { return b.ts - a.ts; });
  }

  function rendBiblio() {
    var zone = byId('bibListe'); if (!zone) return;
    var q = ((byId('bibSearch') || {}).value || '').toLowerCase().trim();
    var fF = (byId('bibForm') || {}).value || '';
    var fT = (byId('bibType') || {}).value || '';
    var fP = (byId('bibPeriode') || {}).value || '';
    var limite = fP ? Date.now() - (parseInt(fP, 10) * 86400000) : 0;

    var tous = documents();

    // le menu des formations se remplit à partir de ce qui existe
    var sel = byId('bibForm');
    if (sel) {
      var forms = [];
      tous.forEach(function (x) { if (x.formation && forms.indexOf(x.formation) < 0) forms.push(x.formation); });
      var garde = sel.value;
      sel.innerHTML = '<option value="">Toutes formations</option>'
        + forms.sort().map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('');
      sel.value = garde;
    }

    var vus = tous.filter(function (x) {
      if (fF && x.formation !== fF) return false;
      if (fT && x.type !== fT && !(fT === 'att' && x.type === 'attest')) return false;
      if (limite && x.ts && x.ts < limite) return false;
      if (q) {
        var tout = (x.prenom + ' ' + x.nom + ' ' + x.formation + ' ' + libelleType(x.type)).toLowerCase();
        if (tout.indexOf(q) < 0) return false;
      }
      return true;
    });

    if (!vus.length) {
      zone.innerHTML = '<div class="empty"><b>Aucun document</b>'
        + '<span>' + (tous.length ? 'Aucun résultat pour ce filtre.' : 'Génère ton premier document.') + '</span></div>';
      return;
    }

    zone.innerHTML = vus.map(function (x) {
      var vignette = x.pdf
        ? '<span class="bib-vig pret"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">'
        + '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg></span>'
        : '<span class="bib-vig arefaire" title="PDF pas encore archivé">à régénérer</span>';
      return '<button type="button" class="bib-l" data-cle="' + esc(normName(x.prenom, x.nom)) + '">'
        + vignette
        + '<span class="bib-t"><b>' + esc((x.prenom + ' ' + x.nom).trim() || 'Sans nom') + '</b>'
        + '<span>' + esc(libelleType(x.type)) + ' · ' + esc(x.formation || '—') + '</span></span>'
        + '<span class="bib-d">' + esc(jour(x.date)) + '</span>'
        + '</button>';
    }).join('');

    zone.querySelectorAll('[data-cle]').forEach(function (b) {
      b.onclick = function () {
        var cle = b.getAttribute('data-cle');
        if (w.openFiche) { if (w.showScr) w.showScr('elv'); w.openFiche(cle); }
        else toast('Fiche indisponible');
      };
    });
  }

  /** L'onglet « Docs » du bas ouvre la bibliothèque, plus le générateur. */
  function detourneOngletDocs() {
    var b = d.querySelector('.bottomnav [data-scr="docs"]');
    if (b) b.setAttribute('data-scr', 'biblio');
    var pill = d.querySelector('.topnav [data-scr="docs"]');
    if (pill) pill.setAttribute('data-scr', 'biblio');
    if (w.TITLES) w.TITLES.biblio = ['Documents', 'Tous les documents générés'];
  }

  /** Le bloc « Documents générés » du tableau de bord y mène aussi. */
  function blocDocsCliquable() {
    var kpi = byId('kpiDocs');
    var carte = kpi && kpi.closest ? kpi.closest('.kpi') : null;
    if (!carte || carte.dataset.mhClic) return;
    carte.dataset.mhClic = '1';
    carte.style.cursor = 'pointer';
    carte.setAttribute('role', 'button');
    carte.addEventListener('click', function () { if (w.showScr) w.showScr('biblio'); });
  }


  /* ============================================================
     Compteurs du tableau de bord
     « Documents générés » ne doit compter que les PDF réellement
     produits. Les inscriptions et les élèves sans document
     circulent dans la même liste côté app.js (sinon ils
     disparaîtraient de la base élèves) mais n'en sont pas.
     ============================================================ */
  function majCompteurs() {
    var api = M(); if (!api) return;
    var data = api.data || {};
    var pdf = (data.documents || []).filter(function (x) {
      return x.type === 'cert' || x.type === 'att' || x.type === 'attest';
    }).length;
    var e = byId('kpiDocs');
    if (e) e.textContent = pdf;
    var el = byId('kpiElv');
    if (el) el.textContent = (data.eleves || []).length;
  }

  /* ============================================================
     2. ENVOI GROUPÉ
     ============================================================ */

  var selection = {};

  function messageDefaut() {
    var api = M(), st = (api && api.data && api.data.settings) || {};
    var legacy = st.legacy || {};
    var org = ((api && api.data && api.data.org) || [])[0] || {};
    var nom = org.raison || (legacy.etab && legacy.etab.raison) || 'Magic Hands';
    return (legacy.mailModele) || (
      'Bonjour,\n\n'
      + 'Vous trouverez ci-joint vos documents de formation.\n\n'
      + 'Bonne continuation,\n\n'
      + nom + '\n'
      + (org.tel || '') + (org.email ? ' · ' + org.email : '')
    );
  }

  function boutonEnvoi(fiche) {
    var ancre = byId('ficheEmarg');
    if (!ancre || byId('ficheEnvoi')) return;
    var b = d.createElement('button');
    b.className = 'btn gold';
    b.id = 'ficheEnvoi';
    b.style.cssText = 'width:100%;margin:0 0 14px';
    b.textContent = 'Envoyer les documents';
    ancre.parentNode.insertBefore(b, ancre.nextSibling);
    b.onclick = function () { ouvreSelection(); };
  }

  /** Fait apparaître les cases à cocher sur les documents de la fiche. */
  function ouvreSelection() {
    var liste = byId('ficheDocs');
    if (!liste) { toast('Aucun document'); return; }
    // app.js rend chaque document ainsi : <div class="fdoc-row" data-opendoc="id">
    var lignes = liste.querySelectorAll('.fdoc-row');
    if (!lignes.length) { toast('Aucun document à envoyer'); return; }

    selection = {};
    if (byId('ficheSelBar')) return;

    var barre = d.createElement('div');
    barre.id = 'ficheSelBar';
    barre.className = 'sel-bar';
    barre.innerHTML = '<label class="sel-tout"><input type="checkbox" id="selTout" checked> Tout sélectionner</label>'
      + '<span id="selCompte"></span>';
    liste.parentNode.insertBefore(barre, liste);

    Array.prototype.forEach.call(lignes, function (l, i) {
      var id = l.getAttribute('data-opendoc') || ('i' + i);
      selection[id] = true;
      var c = d.createElement('input');
      c.type = 'checkbox'; c.className = 'sel-case'; c.checked = true;
      c.addEventListener('click', function (e) { e.stopPropagation(); });
      c.addEventListener('change', function () {
        selection[id] = c.checked; majCompte();
      });
      l.classList.add('en-selection');
      l.insertBefore(c, l.firstChild);
      // en mode sélection, cliquer la ligne coche au lieu d'ouvrir le document
      if (!l.dataset.mhClicSel) {
        l.dataset.mhClicSel = '1';
        l.addEventListener('click', function (ev) {
          if (!l.classList.contains('en-selection')) return;
          if (ev.target.classList.contains('sel-case')) return;
          ev.stopPropagation(); ev.preventDefault();
          c.checked = !c.checked;
          selection[id] = c.checked;
          majCompte();
        }, true);
      }
    });

    byId('selTout').addEventListener('change', function () {
      var on = this.checked;
      liste.querySelectorAll('.sel-case').forEach(function (c) { c.checked = on; });
      Object.keys(selection).forEach(function (k) { selection[k] = on; });
      majCompte();
    });

    var actions = d.createElement('div');
    actions.className = 'sel-actions';
    actions.innerHTML = '<button class="btn cta" id="selEnvoyer">Envoyer</button>'
      + '<button class="btn gh" id="selAnnuler">Annuler</button>';
    liste.parentNode.insertBefore(actions, liste.nextSibling);
    byId('selAnnuler').onclick = fermeSelection;
    byId('selEnvoyer').onclick = choixCanal;
    majCompte();
  }

  function majCompte() {
    var n = Object.keys(selection).filter(function (k) { return selection[k]; }).length;
    var e = byId('selCompte');
    if (e) e.textContent = n + ' document' + (n > 1 ? 's' : '') + ' sélectionné' + (n > 1 ? 's' : '');
    var b = byId('selEnvoyer');
    if (b) b.disabled = !n;
  }

  function fermeSelection() {
    ['ficheSelBar'].forEach(function (id) { var e = byId(id); if (e) e.remove(); });
    var a = d.querySelector('.sel-actions'); if (a) a.remove();
    d.querySelectorAll('.sel-case').forEach(function (c) { c.remove(); });
    d.querySelectorAll('.en-selection').forEach(function (l) { l.classList.remove('en-selection'); });
    selection = {};
  }

  function choixCanal() {
    var n = Object.keys(selection).filter(function (k) { return selection[k]; }).length;
    if (!n) { toast('Sélectionne au moins un document'); return; }

    var bg = d.createElement('div');
    bg.className = 'canal-bg';
    bg.innerHTML = '<div class="canal-panel">'
      + '<b>Envoyer ' + n + ' document' + (n > 1 ? 's' : '') + '</b>'
      + '<button class="btn cta" data-canal="mail">Par mail</button>'
      + '<button class="btn gold" data-canal="wa">Par WhatsApp</button>'
      + '<button class="btn" data-canal="dl">Télécharger</button>'
      + '<button class="btn gh" data-canal="non">Annuler</button>'
      + '</div>';
    d.body.appendChild(bg);
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-canal]');
      if (!b && e.target !== bg) return;
      var canal = b ? b.getAttribute('data-canal') : 'non';
      bg.remove();
      if (canal && canal !== 'non') envoie(canal);
    });
  }

  /** L'envoi lui-même. Les PDF ne sont pas encore archivés dans
      Storage : tant que ce chantier n'est pas livré, on prépare le
      message et on prévient honnêtement pour les pièces jointes. */
  function envoie(canal) {
    var api = M();
    var fiche = byId('ficheBg');
    var mail = (fiche && (fiche.querySelector('#ficheMail') || {}).value) || '';
    var tel = (fiche && (fiche.querySelector('#ficheTel') || {}).value) || '';
    var texte = messageDefaut();

    if (canal === 'mail') {
      if (!mail) { toast('Cette fiche n\'a pas d\'email'); return; }
      var lien = 'mailto:' + encodeURIComponent(mail)
        + '?subject=' + encodeURIComponent('Vos documents de formation')
        + '&body=' + encodeURIComponent(texte);
      w.location.href = lien;
      toast('Mail préparé — ajoute les PDF depuis ta boîte');
      fermeSelection();
      return;
    }
    if (canal === 'wa') {
      var num = api ? api.waNumber(tel, '33') : tel.replace(/\D/g, '');
      if (!num) { toast('Cette fiche n\'a pas de téléphone'); return; }
      w.open('https://wa.me/' + num + '?text=' + encodeURIComponent(texte), '_blank');
      fermeSelection();
      return;
    }
    if (canal === 'dl') {
      toast('Les PDF archivés arrivent au prochain chantier');
      fermeSelection();
    }
  }


  /* ============================================================
     Suppression d'un élève — chemin direct
     Le bouton d'origine passe par localStorage, et l'élève
     réapparaissait dès que le pont relisait le serveur. On parle
     donc directement à la base, puis on referme la fiche.
     ============================================================ */
  function trouveEleve(prenom, nom) {
    var api = M(); if (!api) return null;
    var cle = normName(prenom, nom);
    if (!cle) return null;
    return (api.data.eleves || []).find(function (e) {
      return normName(e.prenom, e.nom) === cle;
    }) || null;
  }

  /** Identifie ce que la fiche ouverte représente réellement.
      On part des documents affichés plutôt que du titre : une
      fiche sans nom (document orphelin, reste d'un essai) n'a
      aucun élève à retrouver, et il faut quand même pouvoir la
      faire disparaître. */
  function cibleFiche() {
    var api = M(); if (!api) return { type: 'rien' };
    var data = api.data || {};
    var panneau = d.querySelector('.fiche-panel') || d;

    // 1. par les documents affichés : le plus fiable
    var ids = [];
    panneau.querySelectorAll('[data-opendoc]').forEach(function (l) {
      ids.push(l.getAttribute('data-opendoc'));
    });
    for (var i = 0; i < ids.length; i++) {
      var doc = (data.documents || []).find(function (x) { return x.id === ids[i]; });
      if (!doc) continue;
      if (doc.eleve_id) {
        var e = (data.eleves || []).find(function (x) { return x.id === doc.eleve_id; });
        if (e) return { type: 'eleve', id: e.id, nom: ((e.prenom || '') + ' ' + (e.nom || '')).trim() };
      }
      // document sans élève rattaché : c'est lui qu'il faut supprimer
      return { type: 'orphelins', ids: ids.filter(function (x) { return !!x; }) };
    }

    // 2. par le titre de la fiche
    var titre = panneau.querySelector('.fiche-nom, h3, h2');
    var nomComplet = ((titre && titre.textContent) || '').trim();
    if (nomComplet) {
      var mots = nomComplet.split(/\s+/);
      var nom = mots.length > 1 ? mots.pop() : nomComplet;
      var el = trouveEleve(mots.join(' '), nom);
      if (el) return { type: 'eleve', id: el.id, nom: nomComplet };
    }

    // 3. plus rien à quoi se raccrocher : nettoyage local
    return { type: 'locale', ids: ids.filter(function (x) { return !!x; }) };
  }

  function brancheSuppression() {
    var b = byId('ficheDelAll');
    if (!b || b.dataset.mhDel) return;
    b.dataset.mhDel = '1';

    b.addEventListener('click', function (ev) {
      ev.stopPropagation();
      ev.preventDefault();

      var api = M(); if (!api) { toast('Données indisponibles'); return; }
      var cible = cibleFiche();

      function termine(message) {
        var bg = byId('ficheBg'); if (bg) bg.remove();
        if (w.MHBridge) w.MHBridge.hydrate();
        if (w.MHrefresh) w.MHrefresh();
        rendBiblio(); majCompteurs();
        toast(message);
      }

      if (cible.type === 'eleve') {
        confirme('Mettre ' + (cible.nom || 'cet élève') + ' à la corbeille, avec ses documents ?', function () {
          api.trash('eleve', cible.id, 'Suppression ' + cible.nom)
            .then(function () { return api.pull(); })
            .then(function () { termine('Élève mis à la corbeille'); });
        });
        return;
      }

      if (cible.type === 'orphelins' && cible.ids.length) {
        confirme('Cette fiche n\'est rattachée à aucun élève. Supprimer ses '
          + cible.ids.length + ' document(s) ?', function () {
          Promise.all(cible.ids.map(function (id) { return api.trash('document', id, 'Document orphelin'); }))
            .then(function () { return api.pull(); })
            .then(function () { termine('Fiche supprimée'); });
        });
        return;
      }

      // rien en base : la fiche ne vit que dans cet appareil
      confirme('Cette fiche n\'existe pas en base. La retirer de cet appareil ?', function () {
        try {
          var cli = JSON.parse(localStorage.getItem('mh_clients_v3')) || [];
          var restants = cli.filter(function (c) { return cible.ids.indexOf(c.id) < 0; });
          localStorage.setItem('mh_clients_v3', JSON.stringify(restants));
        } catch (e) { }
        termine('Fiche retirée de cet appareil');
      });
    }, true);
  }

  function confirme(question, suite) {
    var bg = d.createElement('div');
    bg.className = 'canal-bg';
    bg.innerHTML = '<div class="canal-panel"><b>' + esc(question) + '</b>'
      + '<button class="btn cta" data-ok="1">Confirmer</button>'
      + '<button class="btn gh" data-ok="0">Annuler</button></div>';
    d.body.appendChild(bg);
    bg.addEventListener('click', function (e) {
      var t = e.target.closest('[data-ok]');
      if (!t && e.target !== bg) return;
      bg.remove();
      if (t && t.getAttribute('data-ok') === '1') suite();
    });
  }

  /* ============================================================
     3. CRÉATION D'ÉLÈVE — part en base tout de suite
     ============================================================ */

  function formulaireEleve() {
    if (byId('nvEleveBg')) return;
    var api = M(); if (!api) { toast('Données indisponibles'); return; }
    var cat = api.data || {};
    var formations = []
      .concat((cat.offers || []).map(function (o) { return o.nom; }))
      .concat((cat.modules || []).map(function (m) { return m.nom; }))
      .filter(Boolean);

    var bg = d.createElement('div');
    bg.className = 'canal-bg';
    bg.id = 'nvEleveBg';
    bg.innerHTML = '<div class="canal-panel large">'
      + '<b>Nouvel élève</b>'
      + '<div class="fld"><label>Nom et prénom *</label><input id="nvNom" placeholder="Prénom NOM"></div>'
      + '<div class="fld"><label>Email *</label><input id="nvMail" type="email" placeholder="prenom@mail.fr"></div>'
      + '<div class="fld"><label>Formation *</label><input id="nvForm" list="nvFormListe" placeholder="Choisis ou saisis">'
      + '<datalist id="nvFormListe">' + formations.map(function (f) { return '<option value="' + esc(f) + '">'; }).join('') + '</datalist></div>'
      + '<div class="fld"><label>Téléphone (facultatif)</label><input id="nvTel" placeholder="+590 690 00 00 00"></div>'
      + '<div class="acts"><button class="btn cta" id="nvOk">Créer</button>'
      + '<button class="btn gh" id="nvNon">Annuler</button></div>'
      + '</div>';
    d.body.appendChild(bg);

    byId('nvNon').onclick = function () { bg.remove(); };
    byId('nvOk').onclick = function () {
      var brut = (byId('nvNom').value || '').trim();
      var mail = (byId('nvMail').value || '').trim();
      var form = (byId('nvForm').value || '').trim();
      var tel = (byId('nvTel').value || '').trim();

      if (!brut) { toast('Le nom est obligatoire'); return; }
      if (!mail) { toast('L\'email est obligatoire'); return; }
      if (!form) { toast('La formation est obligatoire'); return; }

      // « Prénom NOM » : le dernier mot est pris pour le nom.
      // Un nom en un seul mot reste un nom, sans prénom recopié.
      var mots = brut.split(/\s+/);
      var nom = mots.length > 1 ? mots.pop() : brut;
      var prenom = mots.length > 1 || (mots.length === 1 && mots[0] !== nom) ? mots.join(' ') : '';

      bg.remove();
      toast('Élève créé');

      api.saveEleve({
        prenom: prenom, nom: nom, email: mail, tel: tel,
        formation: form, a_completer: !tel
      }).then(function () { return api.pull(); })
        .then(function () { if (w.MHrefresh) w.MHrefresh(); rendBiblio(); });
    };
  }

  function boutonCreerEleve() {
    var hote = byId('cliExport');
    if (!hote || byId('cliNouveau')) return;
    var b = d.createElement('button');
    b.className = 'btn cta';
    b.id = 'cliNouveau';
    b.textContent = '+ Nouvel élève';
    hote.parentNode.insertBefore(b, hote);
    b.onclick = formulaireEleve;
  }

  /* ============================================================
     Accrochage
     ============================================================ */

  function accroche() {
    ecranBiblio();
    detourneOngletDocs();
    blocDocsCliquable();
    boutonCreerEleve();
    rendBiblio();
    majCompteurs();
  }

  /* La fiche élève est construite à la volée par app.js : on
     surveille son apparition pour y greffer le bouton d'envoi. */
  var observateur = new MutationObserver(function () {
    if (byId('ficheEmarg')) { boutonEnvoi(); brancheSuppression(); }
    if (!byId('ficheBg')) selection = {};
    blocDocsCliquable();
    boutonCreerEleve();
  });

  function boot() {
    accroche();
    if (d.body) observateur.observe(d.body, { childList: true, subtree: true });
    if (M()) M().onChange(function () { rendBiblio(); majCompteurs(); });
    w.addEventListener('mh:distant', function () { rendBiblio(); majCompteurs(); });
    // le tableau de bord se redessine tout seul : on repasse derrière
    setInterval(majCompteurs, 3000);
  }

  w.MHui = { biblio: rendBiblio, nouvelEleve: formulaireEleve, message: messageDefaut };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);

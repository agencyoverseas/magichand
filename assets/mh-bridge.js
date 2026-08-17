/* ============================================================
   mh-bridge.js — Rebranchement de l'app sur les tables par
   module.

   app.js conserve son fonctionnement interne : il lit et écrit
   dans localStorage. Ce pont fait deux choses :

     1. au démarrage, il remplit localStorage à partir des
        tables Supabase, au format que app.js attend ;
     2. à chaque écriture de app.js, il détecte ce qui a changé
        et le renvoie dans la bonne table.

   Ce que cette version corrige :

     · seules les CRÉATIONS remontaient. Une fiche corrigée, un
       téléphone ajouté, un document supprimé : rien ne partait
       en base. C'est la cause principale des écarts entre le
       téléphone et l'ordinateur ;
     · le téléphone et l'email n'étaient jamais transmis, d'où
       les fiches « à compléter » vides ;
     · l'état de référence n'était pas rafraîchi après une
       relecture du serveur. Une écriture suivante pouvait donc
       être lue comme une suppression de tout ce qui venait
       d'arriver.

   Conflit : chaque ligne porte son updated_at, le plus récent
   gagne. Hors ligne : les écritures sont mises en file par
   mh-data.js et rejouées à la reconnexion.
   ============================================================ */
(function (w, d) {
  'use strict';

  var LS = { cat: 'mh_catalog_v3', cli: 'mh_clients_v3', set: 'mh_settings_v1', con: 'mh_contacts_v1' };
  var ready = false, applying = false;
  var _setItem = localStorage.setItem.bind(localStorage);

  function D() { return w.MHData ? w.MHData.data : null; }
  function num(v) { return Number(v || 0); }
  function iso(v) { return v ? String(v).slice(0, 10) : ''; }

  /* ============================================================
     1. TABLES  ->  FORMAT app.js
     ============================================================ */

  /** Les documents émis, au format « clients » attendu par app.js.
      Le téléphone et l'email viennent de la fiche élève : côté app
      ils sont portés par chaque document. */
  function toClients(data) {
    var byId = {};
    (data.eleves || []).forEach(function (e) { byId[e.id] = e; });
    return (data.documents || []).map(function (doc) {
      var e = byId[doc.eleve_id] || {};
      return {
        id: doc.id,
        eid: doc.eleve_id || '',
        prenom: e.prenom || '',
        nom: e.nom || '',
        tel: e.tel || '',
        email: e.email || '',
        adresse: doc.adresse || e.adresse || '',
        formation: doc.formation || e.formation || '',
        ds: iso(doc.date_debut),
        de: iso(doc.date_fin),
        duree: doc.duree || '',
        lieu: doc.lieu || '',
        em: iso(doc.date_emise),
        type: doc.type || 'cert',
        pdf: doc.pdf_path || '',
        ts: doc.created_at ? Date.parse(doc.created_at) : Date.now()
      };
    }).sort(function (a, b) { return b.ts - a.ts; });
  }

  function toContacts(data) {
    return (data.prospects || []).map(function (p) {
      return {
        id: p.id,
        n: p.nom || '',
        tel: p.tel || '',
        form: p.formation || '',
        stage: p.stage || 'new',
        amt: num(p.montant),
        src: p.source || 'autre',
        temp: p.temperature || 'warm',
        ts: p.created_at ? Date.parse(p.created_at) : Date.now()
      };
    });
  }

  function toCat(data) {
    return {
      offers: (data.offers || []).map(function (o) {
        return { id: o.id, n: o.nom, p: num(o.prix), d: o.duree || '', l: o.lieu || '', c: o.certifs || 0 };
      }),
      modules: (data.modules || []).map(function (m) {
        return { id: m.id, n: m.nom, p: num(m.prix), d: m.duree || '' };
      }),
      sessions: (data.sessions || []).map(function (s) {
        return { id: s.id, l: s.libelle || '', s: iso(s.date_debut), e: iso(s.date_fin) };
      })
    };
  }

  function toSettings(data) {
    var org = (data.org || [])[0] || {};
    var legacy = (data.settings && data.settings.legacy) || {};
    return Object.assign({}, legacy, {
      etab: {
        raison: org.raison || (legacy.etab && legacy.etab.raison) || 'MAGIC HANDS (SARL)',
        adresse: org.adresse || (legacy.etab && legacy.etab.adresse) || '',
        siret: org.siret || (legacy.etab && legacy.etab.siret) || '',
        tel: org.tel || (legacy.etab && legacy.etab.tel) || '',
        mail: org.email || (legacy.etab && legacy.etab.mail) || ''
      },
      formateur: org.formateur || legacy.formateur || '',
      emLieux: (data.lieux || []).map(function (l) { return { nom: l.nom, adresse: l.adresse || '' }; }),
      lieuDef: ((data.lieux || []).find(function (l) { return l.par_defaut; }) || {}).nom || legacy.lieuDef || ''
    });
  }

  /* ---------- état de référence ----------
     `last` est la photo de ce que le pont a déjà vu. Toute écriture
     est comparée à cette photo. Elle DOIT être rafraîchie chaque
     fois que le pont écrit lui-même dans localStorage, sinon la
     comparaison suivante voit des suppressions imaginaires. */
  var last = {};

  function memorise(key, val) {
    try { last[key] = JSON.parse(JSON.stringify(val)); } catch (e) { last[key] = val; }
  }

  function put(key, val) {
    applying = true;
    try { _setItem(key, JSON.stringify(val)); } catch (e) { }
    applying = false;
    memorise(key, val);          // ← le correctif : la photo suit l'écriture
  }

  function hydrate() {
    var data = D(); if (!data) return;
    put(LS.cli, toClients(data));
    put(LS.con, toContacts(data));
    var cat = toCat(data);
    if (cat.offers.length || cat.modules.length) put(LS.cat, cat);
    put(LS.set, toSettings(data));
    ready = true;
    try { w.dispatchEvent(new StorageEvent('storage', { key: LS.cli, storageArea: localStorage })); } catch (e) { }
    if (w.MHrefresh) w.MHrefresh();
    else if (w.refreshAll) w.refreshAll();
  }

  /* ============================================================
     2. FORMAT app.js  ->  TABLES
     ============================================================ */

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** Champs qui appartiennent au document. */
  function empreinteDoc(c) {
    return [c.type || 'cert', c.formation || '', c.ds || '', c.de || '',
      c.duree || '', c.lieu || '', c.em || '', c.adresse || ''].join('|');
  }
  /** Champs qui appartiennent à l'élève. */
  function empreinteEleve(c) {
    return [c.prenom || '', c.nom || '', c.tel || '', c.email || '', c.adresse || ''].join('|');
  }

  function ligneDoc(c, avecId) {
    var row = {
      eleve_id: c.eid || '',
      type: c.type || 'cert', formation: c.formation || '',
      date_debut: c.ds || '', date_fin: c.de || '', duree: c.duree || '',
      lieu: c.lieu || '', date_emise: c.em || '', adresse: c.adresse || ''
    };
    if (avecId && UUID.test(c.id || '')) row.id = c.id;
    return row;
  }

  /** Nouveau document : crée l'élève au besoin, puis le document. */
  function pushClient(c) {
    var M = w.MHData, data = D();
    var eleve = null;

    if (c.eid && UUID.test(c.eid)) {
      eleve = (data.eleves || []).find(function (e) { return e.id === c.eid; });
    }
    if (!eleve) eleve = M.matchEleve((c.prenom || '') + ' ' + (c.nom || ''));

    var chain;
    if (eleve) {
      chain = Promise.resolve(eleve.id);
    } else {
      chain = M.saveEleve({
        prenom: c.prenom || '', nom: c.nom || '', adresse: c.adresse || '',
        formation: c.formation || '',
        tel: c.tel || '', email: c.email || '',
        a_completer: !(c.tel && c.email)
      });
    }

    return chain.then(function (eleveId) {
      var row = ligneDoc(c, false);
      row.eleve_id = eleveId || (eleve && eleve.id) || '';
      return M.saveDoc(row);
    });
  }

  /* Côté app.js, le téléphone d'une fiche est recopié sur chacun de
     ses documents : saisir un numéro sur une fiche de 9 documents
     déclencherait 9 fois le même envoi. On retient donc la dernière
     version envoyée par élève. */
  var derniereFiche = {};

  /** Document modifié : on met à jour la ligne, et la fiche élève
      si ce sont ses coordonnées qui ont changé. */
  function majClient(avant, apres) {
    var M = w.MHData, jobs = [];

    if (empreinteDoc(avant) !== empreinteDoc(apres) && UUID.test(apres.id || '')) {
      jobs.push(M.saveDoc(ligneDoc(apres, true)));
    }

    if (empreinteEleve(avant) !== empreinteEleve(apres)) {
      var id = apres.eid;
      if (!UUID.test(id || '')) {
        var e = M.matchEleve((apres.prenom || '') + ' ' + (apres.nom || ''));
        id = e && e.id;
      }
      var sig = empreinteEleve(apres);
      if (UUID.test(id || '') && derniereFiche[id] !== sig) {
        derniereFiche[id] = sig;
        jobs.push(M.saveEleve({
          id: id,
          prenom: apres.prenom || '', nom: apres.nom || '',
          tel: apres.tel || '', email: apres.email || '',
          adresse: apres.adresse || '', formation: apres.formation || '',
          a_completer: !((apres.tel || '').trim() && (apres.email || '').trim())
        }));
      }
    }
    return Promise.all(jobs);
  }

  /** Documents disparus de la liste : mise à la corbeille.
      Si TOUS les documents d'un élève disparaissent d'un coup,
      c'est la fiche entière qui a été supprimée : on met l'élève
      à la corbeille, ce qui emporte ses documents. */
  function supprimeClients(partis, restants) {
    var M = w.MHData, data = D() || {};
    var vivantsParEleve = {};
    restants.forEach(function (c) {
      if (!c.eid) return;
      vivantsParEleve[c.eid] = (vivantsParEleve[c.eid] || 0) + 1;
    });

    var elevesVides = {}, docsSeuls = [];
    partis.forEach(function (c) {
      if (c.eid && UUID.test(c.eid) && !vivantsParEleve[c.eid]) elevesVides[c.eid] = 1;
      else docsSeuls.push(c);
    });

    var jobs = [];
    Object.keys(elevesVides).forEach(function (id) {
      var e = (data.eleves || []).find(function (x) { return x.id === id; });
      var nom = e ? ((e.prenom || '') + ' ' + (e.nom || '')).trim() : '';
      jobs.push(M.trash('eleve', id, 'Suppression élève ' + nom));
    });
    docsSeuls.forEach(function (c) {
      if (UUID.test(c.id || '')) jobs.push(M.trash('document', c.id, 'Suppression document'));
    });
    return Promise.all(jobs);
  }

  function pushContact(p) {
    return w.MHData.saveProspect({
      id: UUID.test(p.id || '') ? p.id : '',
      legacy_id: UUID.test(p.id || '') ? null : (p.id || null),
      nom: p.n || '', tel: p.tel || '', formation: p.form || '',
      source: p.src || '', temperature: p.temp || 'warm',
      stage: p.stage || 'new', montant: num(p.amt)
    });
  }

  /* Ne renvoyer le catalogue que s'il a réellement changé. */
  var catSignature = '';
  function pushCat(cat) {
    var sig = JSON.stringify(cat);
    if (sig === catSignature) return Promise.resolve();
    catSignature = sig;
    var M = w.MHData, jobs = [];
    (cat.offers || []).forEach(function (o, i) {
      jobs.push(M.saveOffer({
        id: UUID.test(o.id || '') ? o.id : '', nom: o.n, prix: num(o.p),
        duree: o.d || '', lieu: o.l || '', certifs: o.c || 0, ordre: i
      }));
    });
    (cat.modules || []).forEach(function (m, i) {
      jobs.push(M.saveModule({
        id: UUID.test(m.id || '') ? m.id : '', nom: m.n, prix: num(m.p), duree: m.d || '', ordre: i
      }));
    });
    (cat.sessions || []).forEach(function (s) {
      if (!s || (!s.s && !s.e)) return;
      jobs.push(M.saveSession({
        id: UUID.test(s.id || '') ? s.id : '', libelle: s.l || '',
        date_debut: s.s || '', date_fin: s.e || ''
      }));
    });
    return Promise.all(jobs);
  }

  var setSignature = '';
  function pushSettings(st) {
    var sig = JSON.stringify(st);
    if (sig === setSignature) return Promise.resolve();
    setSignature = sig;
    var M = w.MHData, data = D(), jobs = [];
    var org = (data.org || [])[0];
    var e = st.etab || {};
    jobs.push(M.saveOrg({
      id: org ? org.id : '', raison: e.raison || e.nom || 'MAGIC HANDS (SARL)',
      adresse: e.adresse || '', siret: e.siret || '', tel: e.tel || '',
      email: e.mail || '', formateur: st.formateur || '', par_defaut: true
    }));
    (st.emLieux || []).forEach(function (l) {
      var nom = l.nom || l.n || l;
      var ex = (data.lieux || []).find(function (x) { return x.nom === nom; });
      jobs.push(M.saveLieu({
        id: ex ? ex.id : '', nom: nom, adresse: l.adresse || '',
        par_defaut: nom === st.lieuDef
      }));
    });
    jobs.push(M.setSetting('legacy', st));
    return Promise.all(jobs);
  }

  /* ---------- détection des changements ---------- */

  function diffPush(key, val) {
    if (!ready || !w.MHData || !w.MHData.code()) return;
    var prev = last[key] || [];
    memorise(key, val);

    if (key === LS.cli && Array.isArray(val)) {
      var avantParId = {}, apresParId = {};
      prev.forEach(function (c) { avantParId[c.id] = c; });
      val.forEach(function (c) { apresParId[c.id] = c; });

      // créations et modifications
      val.forEach(function (c) {
        var a = avantParId[c.id];
        if (!a) { pushClient(c); return; }
        if (JSON.stringify(a) !== JSON.stringify(c)) majClient(a, c);
      });

      // suppressions
      var partis = prev.filter(function (c) { return !apresParId[c.id]; });
      if (partis.length) supprimeClients(partis, val);
      return;
    }

    if (key === LS.con && Array.isArray(val)) {
      var kn = {}; prev.forEach(function (c) { kn[c.id] = JSON.stringify(c); });
      val.forEach(function (c) { if (kn[c.id] !== JSON.stringify(c)) pushContact(c); });
      var vids = {}; val.forEach(function (c) { vids[c.id] = 1; });
      prev.forEach(function (c) {
        if (!vids[c.id] && UUID.test(c.id || '')) w.MHData.deleteProspect(c.id);
      });
      return;
    }

    if (key === LS.cat) { pushCat(val); return; }
    if (key === LS.set) { pushSettings(val); return; }
  }

  /* ---------- interception de localStorage ---------- */
  localStorage.setItem = function (k, v) {
    _setItem(k, v);
    if (applying) return;
    if (k !== LS.cli && k !== LS.con && k !== LS.cat && k !== LS.set) return;
    var parsed; try { parsed = JSON.parse(v); } catch (e) { return; }
    try { diffPush(k, parsed); } catch (e) { console.warn('[bridge] renvoi impossible', e); }
  };

  /* ---------- démarrage ---------- */
  function boot() {
    if (!w.MHData) { setTimeout(boot, 200); return; }
    [LS.cli, LS.con, LS.cat, LS.set].forEach(function (k) {
      try { memorise(k, JSON.parse(localStorage.getItem(k)) || []); } catch (e) { last[k] = []; }
    });
    if (!w.MHData.code()) return;   // pas encore connecté : le pont s'activera après
    w.MHData.pull().then(function () { hydrate(); });
    w.MHData.onChange(function () { if (ready) hydrate(); });
  }

  /* mh_state et sync.js ont été retirés : ce pont est l'unique
     chemin vers la base. Le drapeau reste exposé pour le code
     ancien qui le teste encore. */
  w.MH_BRIDGE_ON = true;

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

  d.addEventListener('mh:code', boot);
  var attente = setInterval(function () {
    if (ready) { clearInterval(attente); return; }
    if (w.MHData && w.MHData.code()) { clearInterval(attente); boot(); }
  }, 1500);

  w.MHBridge = {
    hydrate: hydrate, boot: boot,
    toClients: toClients, toContacts: toContacts,
    /** Renvoi complet, pour le bouton « Tout renvoyer » des Réglages. */
    toutRenvoyer: function () {
      var cli = []; try { cli = JSON.parse(localStorage.getItem(LS.cli)) || []; } catch (e) { }
      var jobs = cli.map(function (c) { return pushClient(c); });
      return Promise.all(jobs).then(function () { return w.MHData.pull(); });
    }
  };
})(window, document);

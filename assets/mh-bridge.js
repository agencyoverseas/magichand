/* ============================================================
   mh-bridge.js — Rebranchement de l'app sur les tables par
   module.

   app.js conserve son fonctionnement interne (il lit et écrit
   dans localStorage). Ce pont fait deux choses :

     1. au démarrage, il remplit localStorage à partir des
        tables Supabase, au format que app.js attend ;
     2. à chaque écriture de app.js, il détecte ce qui a changé
        et le renvoie dans la bonne table via les RPC.

   Résultat : plus rien ne transite par mh_state, sans avoir eu
   à réécrire la logique métier existante.

   Conflit : chaque ligne porte son updated_at, le plus récent
   gagne. Hors ligne : les écritures sont mises en file par
   mh-data.js et rejouées à la reconnexion.
   ============================================================ */
(function (w, d) {
  'use strict';

  var LS = { cat: 'mh_catalog_v3', cli: 'mh_clients_v3', set: 'mh_settings_v1', con: 'mh_contacts_v1' };
  var ready = false, applying = false;

  function D() { return w.MHData ? w.MHData.data : null; }
  function num(v) { return Number(v || 0); }
  function iso(v) { return v ? String(v).slice(0, 10) : ''; }

  /* ============================================================
     1. TABLES  ->  FORMAT app.js
     ============================================================ */

  /** Les documents émis, au format « clients » attendu par app.js. */
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
        adresse: doc.adresse || e.adresse || '',
        formation: doc.formation || e.formation || '',
        ds: iso(doc.date_debut),
        de: iso(doc.date_fin),
        duree: doc.duree || '',
        lieu: doc.lieu || '',
        em: iso(doc.date_emise),
        type: doc.type || 'cert',
        ts: doc.created_at ? Date.parse(doc.created_at) : Date.now()
      };
    }).sort(function (a, b) { return b.ts - a.ts; });
  }

  /** Les prospects, au format « contacts ». */
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

  /** Le catalogue, au format { offers, modules, sessions }. */
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

  /** Les réglages : organisme, lieux, formateur. */
  function toSettings(data) {
    var org = (data.org || [])[0] || {};
    var legacy = (data.settings && data.settings.legacy) || {};
    return Object.assign({}, legacy, {
      etab: {
        raison: org.raison || legacy.etab && legacy.etab.raison || 'MAGIC HANDS (SARL)',
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

  /** Écrit dans localStorage sans déclencher le renvoi vers la base. */
  function put(key, val) {
    applying = true;
    try { _setItem.call(localStorage, key, JSON.stringify(val)); } catch (e) {}
    applying = false;
  }

  function hydrate() {
    var data = D(); if (!data) return;
    put(LS.cli, toClients(data));
    put(LS.con, toContacts(data));
    var cat = toCat(data);
    if (cat.offers.length || cat.modules.length) put(LS.cat, cat);
    put(LS.set, toSettings(data));
    ready = true;
    // app.js se recharge depuis localStorage via l'événement storage
    try { w.dispatchEvent(new StorageEvent('storage', { key: LS.cli, storageArea: localStorage })); } catch (e) {}
    if (w.MHrefresh) w.MHrefresh();
    else if (w.refreshAll) w.refreshAll();
  }

  /* ============================================================
     2. FORMAT app.js  ->  TABLES
     ============================================================ */

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** Un document nouvellement généré : crée l'élève au besoin, puis le document. */
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
      // création automatique : nom et téléphone suffisent, la fiche est marquée à compléter
      chain = M.saveEleve({
        prenom: c.prenom || '', nom: c.nom || '', adresse: c.adresse || '',
        formation: c.formation || '', a_completer: !c.tel
      });
    }

    return chain.then(function (eleveId) {
      return M.saveDoc({
        eleve_id: eleveId || (eleve && eleve.id) || '',
        type: c.type || 'cert', formation: c.formation || '',
        date_debut: c.ds || '', date_fin: c.de || '', duree: c.duree || '',
        lieu: c.lieu || '', date_emise: c.em || '', adresse: c.adresse || ''
      });
    });
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

  function pushCat(cat) {
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
      jobs.push(M.saveSession({
        id: UUID.test(s.id || '') ? s.id : '', libelle: s.l || '', date_debut: s.s || '', date_fin: s.e || ''
      }));
    });
    return Promise.all(jobs);
  }

  function pushSettings(st) {
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
  var last = {};

  function diffPush(key, val) {
    if (!ready || !w.MHData || !w.MHData.code()) return;
    var prev = last[key] || [];
    last[key] = val;

    if (key === LS.cli && Array.isArray(val)) {
      var known = {}; prev.forEach(function (c) { known[c.id] = 1; });
      val.filter(function (c) { return !known[c.id]; }).forEach(pushClient);
      return;
    }
    if (key === LS.con && Array.isArray(val)) {
      var kn = {}; prev.forEach(function (c) { kn[c.id] = JSON.stringify(c); });
      val.forEach(function (c) { if (kn[c.id] !== JSON.stringify(c)) pushContact(c); });
      // suppressions
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
  var _setItem = localStorage.setItem;
  localStorage.setItem = function (k, v) {
    _setItem.call(localStorage, k, v);
    if (applying) return;
    if (k !== LS.cli && k !== LS.con && k !== LS.cat && k !== LS.set) return;
    var parsed; try { parsed = JSON.parse(v); } catch (e) { return; }
    try { diffPush(k, parsed); } catch (e) { console.warn('[bridge] renvoi impossible', e); }
  };

  /* ---------- démarrage ---------- */
  function boot() {
    if (!w.MHData) { setTimeout(boot, 200); return; }
    // état de référence avant toute écriture
    [LS.cli, LS.con, LS.cat, LS.set].forEach(function (k) {
      try { last[k] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { last[k] = []; }
    });
    if (!w.MHData.code()) return;   // pas encore connecté : le pont s'activera après
    w.MHData.pull().then(function () {
      hydrate();
      [LS.cli, LS.con, LS.cat, LS.set].forEach(function (k) {
        try { last[k] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) {}
      });
    });
    w.MHData.onChange(function () { if (ready) hydrate(); });
  }

  /* L'ancienne synchronisation mh_state est neutralisée : deux
     sources de vérité finiraient par diverger. */
  w.MH_BRIDGE_ON = true;

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* Si le code atelier est saisi après le chargement, on démarre à ce
     moment-là plutôt que d'attendre un rechargement de la page. */
  var _si = localStorage.setItem;
  d.addEventListener('mh:code', boot);
  var attente = setInterval(function () {
    if (ready) { clearInterval(attente); return; }
    if (w.MHData && w.MHData.code()) { clearInterval(attente); boot(); }
  }, 1500);

  w.MHBridge = { hydrate: hydrate, boot: boot, toClients: toClients, toContacts: toContacts };
})(window, document);

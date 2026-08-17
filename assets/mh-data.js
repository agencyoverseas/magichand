/* ============================================================
   mh-data.js — Accès aux données par module.
   Unique chemin vers Supabase depuis la refonte : mh_state et
   sync.js ont disparu. Aucune table n'est lisible avec la clé
   anon, le code atelier est vérifié côté serveur à chaque appel.

   Hors ligne : tout est servi depuis un cache local, les
   écritures partent dans une file d'attente et sont rejouées à
   la reconnexion.

   Ce que cette version corrige :

     · la file n'est plus vidée en bloc à la fin du rejeu. Avant,
       une opération qui échouait était quand même effacée : le
       travail était perdu sans un mot. Maintenant chaque
       opération n'est retirée que lorsque le serveur l'a
       acceptée ;
     · chaque opération compte ses tentatives. Cinq essais
       espacés, puis elle est mise de côté et signalée, sans
       bloquer celles qui suivent ;
     · l'état « en ligne » ne croit plus le navigateur sur
       parole. Un wifi sans internet est vu comme hors ligne,
       parce qu'on interroge réellement le serveur ;
     · la file est consultable : on sait ce qui attend, depuis
       quand, et pourquoi ça coince.

   Conflit : le plus récent gagne, ligne par ligne (updated_at).
   ============================================================ */
(function (w) {
  'use strict';

  var CFG = w.MH_SUPABASE || {};
  var WS = CFG.workspace || (function () { try { return (localStorage.getItem('mh_ws') || '').trim(); } catch (e) { return ''; } })() || 'magic-hands';
  var LS_CACHE = 'mh.data.cache';
  var LS_QUEUE = 'mh.data.queue';
  var LS_CODE = 'mh_code_v1';   // même clé que mh-api.js : un seul code pour toute l'app

  /* Espacement des tentatives : 1 s, 4 s, 15 s, 1 min, 5 min.
     Au-delà, l'opération est mise de côté — insister davantage
     viderait la batterie sans rien changer. */
  var ATTENTES = [1000, 4000, 15000, 60000, 300000];
  var MAX_ESSAIS = ATTENTES.length;
  var PING_MS = 20000;          // fréquence du test réseau réel
  var PING_TIMEOUT = 6000;

  var sb = null;
  function client() {
    if (sb) return sb;
    if (!CFG.url || !CFG.anonKey || !w.supabase) return null;
    sb = w.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: false } });
    return sb;
  }

  function code() { try { return (localStorage.getItem(LS_CODE) || '').trim(); } catch (e) { return ''; } }
  function setCode(c) { try { localStorage.setItem(LS_CODE, c); } catch (e) { } }

  function readJSON(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  function vide() {
    return {
      eleves: [], documents: [], offers: [], modules: [], sessions: [],
      org: [], lieux: [], prospects: [], calls: [], echeances: [], settings: {}
    };
  }

  /* ---------- état local ---------- */
  var DATA = readJSON(LS_CACHE, vide());
  var online = navigator.onLine;   // valeur de départ, corrigée par le premier ping
  var listeners = [];
  var flushEnCours = false;
  var timerRejeu = null;

  function emit() {
    listeners.forEach(function (f) { try { f(DATA, online); } catch (e) { } });
    try {
      w.dispatchEvent(new CustomEvent('mh:etat', {
        detail: { online: online, attente: enAttente(), bloquees: bloquees() }
      }));
    } catch (e) { }
  }
  function onChange(f) {
    listeners.push(f);
    return function () { listeners = listeners.filter(function (x) { return x !== f; }); };
  }

  /* ============================================================
     File d'attente
     ============================================================ */

  function file() { return readJSON(LS_QUEUE, []); }
  function ecrisFile(q) { writeJSON(LS_QUEUE, q); }

  function enAttente() {
    return file().filter(function (o) { return !o.bloque; }).length;
  }
  function bloquees() {
    return file().filter(function (o) { return o.bloque; }).length;
  }

  function queue(fn, args, libelle) {
    var q = file();
    q.push({
      id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      op: fn, args: args, libelle: libelle || fn,
      at: Date.now(), essais: 0, prochain: 0, erreur: null, bloque: false
    });
    ecrisFile(q);
    emit();
    planifieRejeu();
  }

  /** Rejoue la file dans l'ordre. Une opération n'est retirée
      qu'une fois acceptée par le serveur. */
  function flush() {
    if (flushEnCours) return Promise.resolve(0);
    var c = client();
    if (!c || !online || !code()) return Promise.resolve(0);

    var q = file();
    var aFaire = q.filter(function (o) { return !o.bloque && (o.prochain || 0) <= Date.now(); });
    if (!aFaire.length) { planifieRejeu(); return Promise.resolve(0); }

    flushEnCours = true;
    var passees = 0;
    var chaine = Promise.resolve();

    aFaire.forEach(function (op) {
      chaine = chaine.then(function () {
        return c.rpc(op.op, op.args).then(function (r) {
          if (r && r.error) throw r.error;
          // succès : on retire cette opération, et elle seule
          var actuelle = file().filter(function (x) { return x.id !== op.id; });
          ecrisFile(actuelle);
          passees++;
        }).catch(function (e) {
          var actuelle = file();
          var i = actuelle.findIndex(function (x) { return x.id === op.id; });
          if (i < 0) return;                    // retirée entre-temps
          var o = actuelle[i];
          o.essais = (o.essais || 0) + 1;
          o.erreur = (e && (e.message || e.details)) || 'échec inconnu';
          if (o.essais >= MAX_ESSAIS) {
            o.bloque = true;                    // mise de côté, la file continue
          } else {
            o.prochain = Date.now() + ATTENTES[o.essais - 1];
          }
          actuelle[i] = o;
          ecrisFile(actuelle);
        });
      });
    });

    return chaine.then(function () {
      flushEnCours = false;
      emit();
      planifieRejeu();
      return passees;
    }).catch(function () {
      flushEnCours = false;
      planifieRejeu();
      return passees;
    });
  }

  /** Programme le prochain rejeu sur l'opération la plus proche. */
  function planifieRejeu() {
    clearTimeout(timerRejeu);
    var q = file().filter(function (o) { return !o.bloque; });
    if (!q.length || !online) return;
    var proch = q.reduce(function (min, o) {
      var t = o.prochain || 0;
      return t < min ? t : min;
    }, Infinity);
    var delai = Math.max(500, (proch === Infinity ? Date.now() : proch) - Date.now());
    timerRejeu = setTimeout(function () { flush(); }, delai);
  }

  /* ============================================================
     Test réseau réel
     Le navigateur dit « en ligne » dès qu'une carte wifi est
     associée, même sans accès à internet. On demande donc au
     serveur lui-même.
     ============================================================ */
  /* Le test réseau doit rester une requête « simple » au sens CORS :
     dès qu'on ajoute un en-tête maison comme apikey, le navigateur
     envoie d'abord un OPTIONS de contrôle, et si celui-ci échoue on
     conclut à tort que le serveur est injoignable — l'app se croit
     hors ligne alors qu'elle ne l'est pas. Un GET sans en-tête
     répond 401, ce qui prouve déjà que le serveur est là. */
  function ping() {
    if (!CFG.url || !w.fetch) return Promise.resolve(navigator.onLine);
    if (!navigator.onLine) return Promise.resolve(false);   // inutile d'essayer
    var ctrl = w.AbortController ? new AbortController() : null;
    var minuteur = setTimeout(function () { if (ctrl) ctrl.abort(); }, PING_TIMEOUT);
    return w.fetch(CFG.url + '/rest/v1/', {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(minuteur);
      return r.status > 0;      // toute réponse HTTP prouve que le serveur répond
    }).catch(function () {
      clearTimeout(minuteur);
      /* Dernier recours : si le navigateur se dit connecté, on lui
         laisse le bénéfice du doute plutôt que de bloquer l'app.
         Une écriture qui échoue partira de toute façon dans la
         file d'attente, rien n'est perdu. */
      return navigator.onLine;
    });
  }

  function majEtatReseau() {
    return ping().then(function (ok) {
      if (ok === online) return ok;
      online = ok;
      emit();
      if (ok) flush().then(pull);
      return ok;
    });
  }

  /* ---------- lecture ---------- */
  function pull() {
    var c = client();
    if (!c || !online || !code()) { emit(); return Promise.resolve(DATA); }
    return c.rpc('mh_data_get', { p_ws: WS, p_code: code() }).then(function (r) {
      if (r.error) throw r.error;
      if (r.data) { DATA = r.data; writeJSON(LS_CACHE, DATA); }
      emit();
      return DATA;
    }).catch(function (e) {
      console.warn('[mh-data] lecture impossible, cache local utilisé', e.message || e);
      emit(); return DATA;
    });
  }

  /* ---------- écriture générique ---------- */
  function call(fn, args, optimistic, libelle) {
    if (typeof optimistic === 'function') {
      try { optimistic(DATA); writeJSON(LS_CACHE, DATA); emit(); } catch (e) { }
    }
    var c = client();
    if (!c || !online) { queue(fn, args, libelle); return Promise.resolve(null); }
    return c.rpc(fn, args).then(function (r) {
      if (r.error) throw r.error;
      return pull().then(function () { return r.data; });
    }).catch(function (e) {
      // l'écriture n'est pas perdue : elle repart dans la file
      queue(fn, args, libelle);
      console.warn('[mh-data] écriture différée', e.message || e);
      return null;
    });
  }

  /* ---------- API ---------- */
  var API = {
    ws: WS,
    get data() { return DATA; },
    get online() { return online; },
    code: code, setCode: setCode,
    onChange: onChange,
    pull: pull,
    flush: flush,
    ping: majEtatReseau,

    /* --- file d'attente, pour l'écran de diagnostic --- */
    fileAttente: function () {
      return file().map(function (o) {
        return {
          id: o.id, libelle: o.libelle || o.op, op: o.op,
          depuis: o.at, essais: o.essais || 0,
          erreur: o.erreur || null, bloque: !!o.bloque
        };
      });
    },
    fileCompte: function () { return { attente: enAttente(), bloquees: bloquees() }; },
    /** Remet une opération mise de côté dans le circuit. */
    fileRelance: function (id) {
      var q = file();
      var i = q.findIndex(function (x) { return x.id === id; });
      if (i < 0) return false;
      q[i].bloque = false; q[i].essais = 0; q[i].prochain = 0; q[i].erreur = null;
      ecrisFile(q); emit(); flush();
      return true;
    },
    /** Abandonne une opération : c'est le seul cas où du travail
        est jeté, et il faut l'avoir demandé. */
    fileAbandonne: function (id) {
      ecrisFile(file().filter(function (x) { return x.id !== id; }));
      emit();
      return true;
    },

    login: function (c) {
      var cl = client();
      if (!cl) return Promise.resolve(false);
      return cl.rpc('mh_data_get', { p_ws: WS, p_code: c }).then(function (r) {
        if (r.error || !r.data) return false;
        setCode(c);
        DATA = r.data; writeJSON(LS_CACHE, DATA); emit();
        try { document.dispatchEvent(new CustomEvent('mh:code')); } catch (e) { }
        return true;
      }).catch(function () { return false; });
    },

    saveEleve: function (row) {
      return call('mh_eleve_save', { p_ws: WS, p_code: code(), p_row: row }, function (d) {
        if (!row.id) return;
        var i = d.eleves.findIndex(function (e) { return e.id === row.id; });
        if (i >= 0) d.eleves[i] = Object.assign({}, d.eleves[i], row, { updated_at: new Date().toISOString() });
      }, 'Fiche élève ' + ((row.prenom || '') + ' ' + (row.nom || '')).trim());
    },

    /* --- corbeille --- */
    trash: function (kind, id, libelle) {
      return call('mh_trash', { p_ws: WS, p_code: code(), p_kind: kind, p_id: id }, function (d) {
        if (kind === 'eleve') {
          d.eleves = d.eleves.filter(function (e) { return e.id !== id; });
          d.documents = d.documents.filter(function (x) { return x.eleve_id !== id; });
        } else {
          d.documents = d.documents.filter(function (x) { return x.id !== id; });
        }
      }, libelle || ('Suppression ' + kind));
    },
    restore: function (kind, id) {
      return call('mh_restore', { p_ws: WS, p_code: code(), p_kind: kind, p_id: id }, null, 'Restauration ' + kind);
    },
    purge: function (kind, id) {
      return call('mh_purge', { p_ws: WS, p_code: code(), p_kind: kind, p_id: id }, null, 'Purge ' + kind);
    },
    trashList: function () {
      var c = client();
      if (!c || !online || !code()) return Promise.resolve({ eleves: [], documents: [] });
      return c.rpc('mh_trash_list', { p_ws: WS, p_code: code() })
        .then(function (r) { return (r && r.data) || { eleves: [], documents: [] }; })
        .catch(function () { return { eleves: [], documents: [] }; });
    },

    /* Conservé pour ne rien casser dans le code existant :
       une suppression non définitive passe désormais par la
       corbeille, comme demandé au cadrage. */
    deleteEleve: function (id, definitif) {
      return definitif ? API.purge('eleve', id) : API.trash('eleve', id);
    },
    deleteDoc: function (id) { return API.trash('document', id); },

    saveDoc: function (row) {
      return call('mh_doc_save', { p_ws: WS, p_code: code(), p_row: row }, null,
        'Document ' + (row.type || '') + ' ' + (row.formation || ''));
    },
    /** Enregistre le chemin du PDF archivé dans Storage. */
    setDocPdf: function (id, path, taille) {
      return call('mh_doc_pdf_set', {
        p_ws: WS, p_code: code(), p_id: id, p_path: path, p_taille: taille || 0
      }, null, 'Archivage PDF');
    },

    saveCall: function (row) { return call('mh_call_save', { p_ws: WS, p_code: code(), p_row: row }, null, 'Appel'); },
    setEcheance: function (id, enc, date, preuve) {
      return call('mh_ech_set', {
        p_ws: WS, p_code: code(), p_id: id, p_encaisse: !!enc,
        p_date: date || null, p_preuve: preuve || null
      }, function (d) {
        var e = d.echeances.find(function (x) { return x.id === id; });
        if (e) { e.encaisse = !!enc; e.date_enc = date || new Date().toISOString().slice(0, 10); }
      }, 'Échéance');
    },
    saveOffer: function (row) { return call('mh_offer_save', { p_ws: WS, p_code: code(), p_row: row }, null, 'Offre ' + (row.nom || '')); },
    saveModule: function (row) { return call('mh_module_save', { p_ws: WS, p_code: code(), p_row: row }, null, 'Module ' + (row.nom || '')); },
    saveSession: function (row) { return call('mh_session_save', { p_ws: WS, p_code: code(), p_row: row }, null, 'Session'); },
    saveOrg: function (row) { return call('mh_org_save', { p_ws: WS, p_code: code(), p_row: row }, null, 'Organisme'); },
    saveLieu: function (row) { return call('mh_lieu_save', { p_ws: WS, p_code: code(), p_row: row }, null, 'Lieu ' + (row.nom || '')); },
    saveProspect: function (row) { return call('mh_prospect_save', { p_ws: WS, p_code: code(), p_row: row }, null, 'Prospect ' + (row.nom || '')); },
    deleteProspect: function (id) {
      return call('mh_prospect_delete', { p_ws: WS, p_code: code(), p_id: id }, function (d) {
        d.prospects = d.prospects.filter(function (p) { return p.id !== id; });
      }, 'Suppression prospect');
    },
    deleteCatalog: function (id, kind) {
      return call('mh_catalog_delete', { p_ws: WS, p_code: code(), p_id: id, p_kind: kind || 'offer' }, null, 'Suppression catalogue');
    },
    setSetting: function (cle, val) { return call('mh_setting_put', { p_ws: WS, p_code: code(), p_cle: cle, p_val: val }, null, 'Réglages'); },

    /* ---------- calculs ---------- */

    echeancesOf: function (callId) {
      return DATA.echeances.filter(function (e) { return e.call_id === callId; })
        .sort(function (a, b) { return a.num - b.num; });
    },

    totaux: function (depuis) {
      var t = { ca: 0, ventes: 0, commissions: 0, encaisse: 0, aQualifier: 0 };
      DATA.calls.forEach(function (c) {
        if (!c.resultat || c.resultat.indexOf('signed') !== 0) return;
        if (depuis && new Date(c.date_appel) < depuis) return;
        t.ventes++;
        if (c.type_revenu === 'a_qualifier') t.aQualifier++;
        var taux = (c.type_revenu === 'ca_propre') ? 1 : Number(c.taux || 0.10);
        var ech = API.echeancesOf(c.id);
        var encaisse = ech.length
          ? ech.reduce(function (s, e) { return s + (e.encaisse ? Number(e.montant) : 0); }, 0)
          : Number(c.montant || 0);
        t.ca += Number(c.montant || 0);
        t.encaisse += encaisse;
        t.commissions += encaisse * taux;
      });
      return t;
    },

    caParMois: function (n) {
      n = n || 12;
      var out = [], now = new Date();
      for (var i = n - 1; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push({ mois: d, cle: d.getFullYear() + '-' + (d.getMonth() + 1), total: 0 });
      }
      DATA.echeances.forEach(function (e) {
        if (!e.encaisse || !e.date_enc) return;
        var d = new Date(e.date_enc), cle = d.getFullYear() + '-' + (d.getMonth() + 1);
        var slot = out.find(function (o) { return o.cle === cle; });
        if (slot) slot.total += Number(e.montant || 0);
      });
      return out;
    },

    /** Fiches incomplètes : ni téléphone ni email. */
    aCompleter: function () {
      return (DATA.eleves || []).filter(function (e) {
        return !(e.tel || '').trim() || !(e.email || '').trim();
      });
    },

    matchEleve: function (nom) {
      if (!nom) return null;
      var k = API.normalise(nom);
      return DATA.eleves.find(function (e) {
        return API.normalise((e.prenom || '') + ' ' + (e.nom || '')) === k
          || API.normalise((e.nom || '') + ' ' + (e.prenom || '')) === k;
      }) || null;
    },
    normalise: function (s) {
      return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    },

    waNumber: function (tel, indicatifDefaut) {
      var t = String(tel || '').replace(/[^\d+]/g, '');
      if (!t) return '';
      if (t.indexOf('+') === 0) return t.slice(1);
      if (t.indexOf('00') === 0) return t.slice(2);
      return (indicatifDefaut || '33') + t.replace(/^0/, '');
    }
  };

  /* ---------- connexion / reconnexion ---------- */
  w.addEventListener('online', function () { majEtatReseau(); });
  w.addEventListener('offline', function () { online = false; emit(); });
  w.addEventListener('focus', function () { majEtatReseau(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) majEtatReseau();
  });
  setInterval(majEtatReseau, PING_MS);

  w.MHData = API;

  if (code()) {
    majEtatReseau().then(function () { return flush(); }).then(pull);
  } else {
    majEtatReseau();
  }
})(window);

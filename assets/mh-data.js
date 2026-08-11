/* ============================================================
   mh-data.js — Accès aux données par module.
   Remplace la lecture/écriture du JSON monobloc mh_state par
   des appels RPC (mh_data_get, mh_eleve_save, …). Aucune table
   n'est lisible avec la clé anon : le code atelier est vérifié
   côté serveur à chaque appel.

   Hors ligne : tout est servi depuis un cache local, les
   écritures sont mises en file et rejouées à la reconnexion.
   Conflit : le plus récent gagne, ligne par ligne (updated_at).
   ============================================================ */
(function (w) {
  'use strict';

  var CFG = w.MH_SUPABASE || {};
  var WS = CFG.workspace || (function(){ try{ return (localStorage.getItem('mh_ws')||'').trim(); }catch(e){ return ''; } })() || 'magic-hands';
  var LS_CACHE = 'mh.data.cache';
  var LS_QUEUE = 'mh.data.queue';
  var LS_CODE = 'mh_code_v1';   // même clé que mh-api.js : un seul code pour toute l'app

  var sb = null;
  function client() {
    if (sb) return sb;
    if (!CFG.url || !CFG.anonKey || !w.supabase) return null;
    sb = w.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: false } });
    return sb;
  }

  function code() { try { return (localStorage.getItem(LS_CODE) || '').trim(); } catch (e) { return ''; } }
  function setCode(c) { try { localStorage.setItem(LS_CODE, c); } catch (e) {} }

  function readJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- état local ---------- */
  var DATA = readJSON(LS_CACHE, {
    eleves: [], documents: [], offers: [], modules: [], sessions: [],
    org: [], lieux: [], prospects: [], calls: [], echeances: [], settings: {}
  });
  var online = navigator.onLine;
  var listeners = [];

  function emit() { listeners.forEach(function (f) { try { f(DATA, online); } catch (e) {} }); }
  function onChange(f) { listeners.push(f); return function () { listeners = listeners.filter(function (x) { return x !== f; }); }; }

  /* ---------- file d'attente hors ligne ---------- */
  function queue(op) {
    var q = readJSON(LS_QUEUE, []);
    q.push({ op: op.fn, args: op.args, at: Date.now() });
    writeJSON(LS_QUEUE, q);
  }

  function flush() {
    var c = client(); if (!c || !online) return Promise.resolve(0);
    var q = readJSON(LS_QUEUE, []);
    if (!q.length) return Promise.resolve(0);
    // rejeu dans l'ordre de saisie : la dernière écriture d'une ligne l'emporte
    var chain = Promise.resolve(), done = 0;
    q.forEach(function (item) {
      chain = chain.then(function () {
        return c.rpc(item.op, item.args).then(function () { done++; });
      }).catch(function () { /* on garde l'ordre, on ignore l'échec isolé */ });
    });
    return chain.then(function () { writeJSON(LS_QUEUE, []); return done; });
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
  function call(fn, args, optimistic) {
    if (typeof optimistic === 'function') { try { optimistic(DATA); writeJSON(LS_CACHE, DATA); emit(); } catch (e) {} }
    var c = client();
    if (!c || !online) { queue({ fn: fn, args: args }); return Promise.resolve(null); }
    return c.rpc(fn, args).then(function (r) {
      if (r.error) throw r.error;
      return pull().then(function () { return r.data; });
    }).catch(function (e) {
      queue({ fn: fn, args: args });
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

    /**
     * Vérifie le code atelier côté serveur.
     * On passe par mh_data_get plutôt que mh_check : la fonction de
     * vérification n'est pas exposée à la clé anon, et un appel qui
     * réussit vaut validation tout en chargeant les données.
     */
    login: function (c) {
      var cl = client();
      if (!cl) return Promise.resolve(false);
      return cl.rpc('mh_data_get', { p_ws: WS, p_code: c }).then(function (r) {
        if (r.error || !r.data) return false;
        setCode(c);
        DATA = r.data; writeJSON(LS_CACHE, DATA); emit();
        return true;
      }).catch(function () { return false; });
    },

    saveEleve: function (row) {
      return call('mh_eleve_save', { p_ws: WS, p_code: code(), p_row: row }, function (d) {
        if (!row.id) return;
        var i = d.eleves.findIndex(function (e) { return e.id === row.id; });
        if (i >= 0) d.eleves[i] = Object.assign({}, d.eleves[i], row, { updated_at: new Date().toISOString() });
      });
    },
    deleteEleve: function (id, definitif, avecDocs) {
      return call('mh_eleve_delete', {
        p_ws: WS, p_code: code(), p_id: id,
        p_definitif: !!definitif, p_avec_docs: !!avecDocs
      }, function (d) {
        if (definitif) d.eleves = d.eleves.filter(function (e) { return e.id !== id; });
        else { var e = d.eleves.find(function (x) { return x.id === id; }); if (e) e.archived = true; }
      });
    },
    saveDoc: function (row) { return call('mh_doc_save', { p_ws: WS, p_code: code(), p_row: row }); },
    saveCall: function (row) { return call('mh_call_save', { p_ws: WS, p_code: code(), p_row: row }); },
    setEcheance: function (id, enc, date, preuve) {
      return call('mh_ech_set', {
        p_ws: WS, p_code: code(), p_id: id, p_encaisse: !!enc,
        p_date: date || null, p_preuve: preuve || null
      }, function (d) {
        var e = d.echeances.find(function (x) { return x.id === id; });
        if (e) { e.encaisse = !!enc; e.date_enc = date || new Date().toISOString().slice(0, 10); }
      });
    },
    saveOffer: function (row) { return call('mh_offer_save', { p_ws: WS, p_code: code(), p_row: row }); },
    saveModule: function (row) { return call('mh_module_save', { p_ws: WS, p_code: code(), p_row: row }); },
    saveSession: function (row) { return call('mh_session_save', { p_ws: WS, p_code: code(), p_row: row }); },
    saveOrg: function (row) { return call('mh_org_save', { p_ws: WS, p_code: code(), p_row: row }); },
    saveLieu: function (row) { return call('mh_lieu_save', { p_ws: WS, p_code: code(), p_row: row }); },
    saveProspect: function (row) { return call('mh_prospect_save', { p_ws: WS, p_code: code(), p_row: row }); },
    deleteProspect: function (id) {
      return call('mh_prospect_delete', { p_ws: WS, p_code: code(), p_id: id }, function (d) {
        d.prospects = d.prospects.filter(function (p) { return p.id !== id; });
      });
    },
    deleteCatalog: function (id, kind) { return call('mh_catalog_delete', { p_ws: WS, p_code: code(), p_id: id, p_kind: kind || 'offer' }); },
    setSetting: function (cle, val) { return call('mh_setting_put', { p_ws: WS, p_code: code(), p_cle: cle, p_val: val }); },

    /* ---------- calculs ---------- */

    /** Échéances d'un appel, triées. */
    echeancesOf: function (callId) {
      return DATA.echeances.filter(function (e) { return e.call_id === callId; })
                           .sort(function (a, b) { return a.num - b.num; });
    },

    /**
     * Chiffres du tableau de bord.
     * Une vente marquée « commission » rapporte son taux (10 %) ;
     * une vente « ca_propre » rapporte le montant encaissé entier.
     * Les ventes « a_qualifier » restent traitées en commission,
     * comme avant la refonte, et sont comptées à part.
     */
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

    /** CA encaissé mois par mois, sur n mois glissants. */
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

    /** Rapproche un nom de prospect d'une fiche élève (tolérant à la casse et aux accents). */
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

    /** Numéro au format wa.me : indicatif conservé, zéro initial retiré. */
    waNumber: function (tel, indicatifDefaut) {
      var t = String(tel || '').replace(/[^\d+]/g, '');
      if (!t) return '';
      if (t.indexOf('+') === 0) return t.slice(1);
      if (t.indexOf('00') === 0) return t.slice(2);
      return (indicatifDefaut || '33') + t.replace(/^0/, '');
    }
  };

  /* ---------- connexion / reconnexion ---------- */
  w.addEventListener('online', function () {
    online = true; emit();
    flush().then(pull);
  });
  w.addEventListener('offline', function () { online = false; emit(); });

  w.MHData = API;
  if (code()) { flush().then(pull); }
})(window);

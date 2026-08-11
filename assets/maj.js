/* ============================================================
   maj.js — Mise à jour automatique.

   À chaque push, le script de déploiement réécrit version.json
   avec l'empreinte des fichiers. Cette page l'interroge
   régulièrement ; dès que l'empreinte change, elle vide le
   cache, met à jour le service worker et recharge.

   Deux comportements selon ce que tu es en train de faire :

     · rien en cours  → rechargement silencieux, tu ne vois rien
                        d'autre qu'un écran qui se rafraîchit
     · saisie en cours, feuille ouverte, hors ligne
                      → un bandeau discret « Mise à jour
                        disponible · Rafraîchir », et rien ne
                        bouge tant que tu ne l'as pas décidé

   Jamais de rechargement pendant que tu remplis un formulaire :
   tu perdrais ce que tu es en train de taper.
   ============================================================ */
(function (w, d) {
  'use strict';

  var URL_VERSION   = 'version.json';
  var INTERVALLE    = 90 * 1000;   // vérification toutes les 90 s
  var CLE_VERSION   = 'mh.version.vue';
  var CLE_REPORT    = 'mh.maj.reportee';

  var versionCourante = null;
  var majEnAttente    = false;
  var timer           = null;

  function log() { if (w.MH_DEBUG) console.log.apply(console, ['[maj]'].concat([].slice.call(arguments))); }

  /* ------------------------------------------------------------
     Peut-on recharger sans rien casser ?
     ------------------------------------------------------------ */
  function momentSur() {
    if (!navigator.onLine) return false;

    // un champ est en cours de saisie
    var a = d.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
    if (a && a.isContentEditable) return false;

    // un panneau est ouvert : feuille, fiche, formulaire, menu
    if (d.querySelector('.fiche-bg.show, .em-bg.show, .modal.show, .ov.show, .creer-sheet.on')) return false;
    var ps = d.getElementById('plusSheet');
    if (ps && ps.style.display === 'block') return false;

    // une signature est en cours
    if (d.querySelector('.sigpad.on, canvas.signing')) return false;

    // des écritures attendent d'être envoyées
    try {
      var q = JSON.parse(localStorage.getItem('mh.data.queue') || '[]');
      if (q.length) return false;
    } catch (e) {}

    // un formulaire porte des valeurs saisies mais non enregistrées
    var champs = d.querySelectorAll('.scr.on input[type="text"], .scr.on textarea');
    for (var i = 0; i < champs.length; i++) {
      if ((champs[i].value || '').trim() && !champs[i].readOnly) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------
     Appliquer la mise à jour
     ------------------------------------------------------------ */
  function appliquer(silencieux) {
    log('application', silencieux ? '(silencieuse)' : '(demandée)');
    try { localStorage.setItem(CLE_VERSION, versionCourante || ''); } catch (e) {}
    try { localStorage.removeItem(CLE_REPORT); } catch (e) {}

    var taches = [];

    // vider les caches du service worker
    if (w.caches && caches.keys) {
      taches.push(caches.keys().then(function (cles) {
        return Promise.all(cles.map(function (k) { return caches.delete(k); }));
      }).catch(function () {}));
    }

    // forcer le service worker à reprendre la main
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      taches.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) {
          if (r.waiting) { try { r.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {} }
          return r.update().catch(function () {});
        }));
      }).catch(function () {}));
    }

    Promise.all(taches).then(function () {
      // paramètre anti-cache : certains navigateurs Android servent
      // encore l'ancienne page sur un simple reload
      var u = new URL(w.location.href);
      u.searchParams.set('v', (versionCourante || Date.now()).toString().slice(-10));
      w.location.replace(u.toString());
    });
  }

  /* ------------------------------------------------------------
     Bandeau « Mise à jour disponible »
     ------------------------------------------------------------ */
  function bandeau() {
    if (d.getElementById('majBar')) return;
    var el = d.createElement('div');
    el.className = 'maj-bar'; el.id = 'majBar';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<span class="maj-ic">' +
        '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></span>' +
      '<span class="maj-tx"><b>Mise à jour disponible</b><span>Rafraîchis pour avoir la dernière version</span></span>' +
      '<button class="maj-go" id="majGo">Rafraîchir</button>' +
      '<button class="maj-x" id="majX" aria-label="Plus tard">✕</button>';
    d.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('on'); });

    d.getElementById('majGo').onclick = function () { appliquer(false); };
    d.getElementById('majX').onclick = function () {
      el.classList.remove('on');
      setTimeout(function () { el.remove(); }, 300);
      try { localStorage.setItem(CLE_REPORT, String(Date.now())); } catch (e) {}
      // on redemandera dans 10 minutes
      setTimeout(function () { if (majEnAttente) bandeau(); }, 10 * 60 * 1000);
    };
  }

  /* ------------------------------------------------------------
     Vérification
     ------------------------------------------------------------ */
  function verifier() {
    if (!navigator.onLine) return Promise.resolve();
    return fetch(URL_VERSION + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        // on compare l'empreinte des fichiers, pas l'horodatage :
        // un envoi sans modification ne doit rien déclencher
        var v = String(j.hash || j.build || j.version || '');
        if (!v) return;

        if (versionCourante === null) {
          // premier passage : on mémorise sans rien faire
          versionCourante = v;
          var vue = null;
          try { vue = localStorage.getItem(CLE_VERSION); } catch (e) {}
          if (!vue) { try { localStorage.setItem(CLE_VERSION, v); } catch (e) {} }
          log('version en place', v);
          return;
        }

        if (v === versionCourante) return;

        log('nouvelle version', v, '(avant :', versionCourante + ')');
        versionCourante = v;
        majEnAttente = true;

        if (momentSur()) appliquer(true);
        else bandeau();
      })
      .catch(function () { /* réseau capricieux : on retentera */ });
  }

  /* ------------------------------------------------------------
     Rythme des vérifications
     ------------------------------------------------------------ */
  function demarrer() {
    verifier();
    clearInterval(timer);
    timer = setInterval(verifier, INTERVALLE);
  }

  // au retour sur l'onglet : on vérifie tout de suite
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'visible') {
      verifier();
      // si une mise à jour attendait et que le moment est devenu sûr
      if (majEnAttente && momentSur()) appliquer(true);
    }
  });
  w.addEventListener('online', verifier);

  // le service worker peut aussi signaler qu'il a une nouvelle version
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'NEW_VERSION') { majEnAttente = true; verifier(); }
    });
    navigator.serviceWorker.ready.then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', function () {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            majEnAttente = true;
            if (momentSur()) appliquer(true); else bandeau();
          }
        });
      });
    }).catch(function () {});
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();

  w.MHmaj = {
    verifier: verifier,
    appliquer: function () { appliquer(false); },
    version: function () { return versionCourante; },
    enAttente: function () { return majEnAttente; }
  };
})(window, document);

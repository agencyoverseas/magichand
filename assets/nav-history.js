/* ============================================================
   nav-history.js — Bouton retour Android.

   Sans ça, appuyer sur retour quitte l'application, même après
   avoir simplement ouvert une fiche élève. Ici, chaque écran et
   chaque panneau ajoute une étape dans l'historique du
   navigateur : le retour ferme ce qui est ouvert, puis remonte
   d'écran en écran, et ne quitte l'app que depuis l'accueil,
   après une confirmation.

   Chargé en dernier : il enveloppe showScr() une fois que
   index.html l'a définie.
   ============================================================ */
(function (w, d) {
  'use strict';

  var ACCUEIL = 'home';
  var pile = [];          // écrans visités
  var interne = false;    // navigation déclenchée par le retour lui-même
  var sortie = 0;         // horodatage du premier appui sur l'accueil

  function byId(i) { return d.getElementById(i); }

  /* ------------------------------------------------------------
     Ce qui est ouvert par-dessus l'écran, du plus récent au plus
     ancien. Chaque entrée sait se fermer.
     ------------------------------------------------------------ */
  function couches() {
    var out = [];

    // panneaux créés à la volée (fiche élève, feuille, modales)
    d.querySelectorAll('.fiche-bg.show, .em-bg.show, .mh-modal.show, .modal.show, .ov.show')
      .forEach(function (el) {
        out.push({ el: el, close: function () {
          el.classList.remove('show');
          setTimeout(function () { if (el.parentNode && !el.classList.contains('show')) el.remove(); }, 260);
        }});
      });

    // menu du bouton central
    var ps = byId('plusSheet');
    if (ps && ps.style.display !== 'none' && ps.style.display !== '') {
      out.push({ el: ps, close: function () {
        var b = byId('plusBg'); if (b) b.classList.remove('show');
        ps.style.display = 'none';
      }});
    }

    // tiroir latéral
    var dr = d.querySelector('.drawer.on, .side.open');
    if (dr) out.push({ el: dr, close: function () { dr.classList.remove('on', 'open'); } });

    // panneau de notifications
    ['notifPanel', 'notifPanelD'].forEach(function (id) {
      var p = byId(id);
      if (p && p.classList.contains('show')) out.push({ el: p, close: function () { p.classList.remove('show'); } });
    });

    // bannière d'installation
    var pwa = byId('mhPwa');
    if (pwa && pwa.classList.contains('show')) out.push({ el: pwa, close: function () { if (w.mhPwaHide) w.mhPwaHide(); } });

    return out;
  }

  /* ------------------------------------------------------------
     showScr est appelée depuis l'intérieur de sa propre closure :
     l'envelopper ne suffirait pas, les appels internes passeraient
     à côté. On observe donc l'écran réellement affiché.
     ------------------------------------------------------------ */
  function ecranActif() {
    var el = d.querySelector('.scr.on');
    return el ? el.id.replace(/^scr-/, '') : null;
  }

  function surChangementEcran() {
    var e = ecranActif();
    if (!e || interne) return;
    if (pile[pile.length - 1] === e) return;
    var i = pile.lastIndexOf(e);
    if (i >= 0 && i < pile.length - 1) {
      // retour sur un écran déjà visité : on remonte au lieu d'empiler
      pile = pile.slice(0, i + 1);
      return;
    }
    pile.push(e);
    try { history.pushState({ mh: 1, scr: e }, '', location.href); } catch (e2) {}
  }

  /* ------------------------------------------------------------
     Ouverture d'un panneau : on ajoute une étape pour que le
     premier retour le referme au lieu de changer d'écran.
     ------------------------------------------------------------ */
  /* L'observateur se déclenche à chaque mutation, y compris pendant
     les animations. On regroupe les appels sur une frame pour ne pas
     ralentir l'affichage sur mobile. */
  var profondeur = 0, planifie = false;
  function examiner() {
    planifie = false;
    surChangementEcran();
    var n = couches().length;
    if (n > profondeur) {
      for (var i = profondeur; i < n; i++) {
        try { history.pushState({ mh: 1, couche: i + 1 }, '', location.href); } catch (e) {}
      }
    }
    profondeur = n;
  }
  var observateur = new MutationObserver(function () {
    if (planifie) return;
    planifie = true;
    requestAnimationFrame(examiner);
  });

  /* ------------------------------------------------------------
     Le retour lui-même.
     ------------------------------------------------------------ */
  w.addEventListener('popstate', function () {
    // 1. fermer ce qui est ouvert par-dessus
    var c = couches();
    if (c.length) {
      c[0].close();
      profondeur = Math.max(0, profondeur - 1);
      return;
    }

    // 2. remonter d'un écran
    if (pile.length > 1) {
      pile.pop();
      var precedent = pile[pile.length - 1];
      interne = true;
      try { if (typeof w.showScr === 'function') w.showScr(precedent); } finally { interne = false; }
      // on remet une étape : sinon le retour suivant sortirait de l'app
      try { history.pushState({ mh: 1, scr: precedent }, '', location.href); } catch (e) {}
      return;
    }

    // 3. on est sur l'accueil : deux appuis rapprochés pour sortir
    var t = Date.now();
    if (t - sortie < 2200) { history.back(); return; }
    sortie = t;
    try { history.pushState({ mh: 1, scr: ACCUEIL }, '', location.href); } catch (e) {}
    if (w.toast) w.toast('Appuie encore pour quitter');
    else {
      var el = byId('toast');
      if (el) { el.textContent = 'Appuie encore pour quitter'; el.classList.add('show');
                setTimeout(function () { el.classList.remove('show'); }, 2000); }
    }
  });

  /* ------------------------------------------------------------
     Démarrage : on attend que showScr existe.
     ------------------------------------------------------------ */
  function demarrer(essais) {
    if (typeof w.showScr !== 'function' || !ecranActif()) {
      if ((essais || 0) < 40) return setTimeout(function () { demarrer((essais || 0) + 1); }, 150);
    }
    pile = [ecranActif() || ACCUEIL];
    try { history.replaceState({ mh: 1, scr: pile[0] }, '', location.href); } catch (e) {}
    try { history.pushState({ mh: 1, scr: pile[0] }, '', location.href); } catch (e) {}
    profondeur = couches().length;
    observateur.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { demarrer(0); });
  else demarrer(0);

  w.MHnav = { pile: function () { return pile.slice(); }, couches: couches };
})(window, document);

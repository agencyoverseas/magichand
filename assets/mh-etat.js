/* ============================================================
   mh-etat.js — Remplace sync.js.

   sync.js portait l'ancienne synchronisation par mh_state : un
   seul gros JSON pour toute l'app, où le dernier appareil qui
   écrivait effaçait le travail de l'autre. Il est retiré. Tout
   passe désormais par mh-data.js et le pont.

   Ce fichier ne synchronise rien lui-même. Il montre ce qui se
   passe :

     · la pastille et le bandeau hors ligne ;
     · le bloc « Synchronisation » de l'écran Compte, avec la
       saisie du code atelier ;
     · la liste de ce qui attend d'être envoyé, relançable ;
     · le diagnostic local / base et l'auto-test ;
     · le bouton « Tout renvoyer ».
   ============================================================ */
(function (w, d) {
  'use strict';

  function M() { return w.MHData || null; }
  function byId(x) { return d.getElementById(x); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function toast(m) { if (w.MH && w.MH.toast) w.MH.toast(m); }

  function ilya(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'il y a ' + s + ' s';
    if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
    return 'il y a ' + Math.round(s / 86400) + ' j';
  }

  /* ============================================================
     Pastille et bandeau
     ============================================================ */

  function bandeau() {
    var b = byId('mhBandeauEtat');
    if (b) return b;
    b = d.createElement('div');
    b.id = 'mhBandeauEtat';
    b.className = 'mh-bandeau-etat';
    b.setAttribute('role', 'status');
    if (d.body) d.body.appendChild(b);
    return b;
  }

  function peintEtat(e) {
    var online = e ? e.online : (M() ? M().online : navigator.onLine);
    var attente = e ? e.attente : 0;
    var bloquees = e ? e.bloquees : 0;

    // pastille du haut (élément déjà présent dans index.html)
    var off = byId('mhOffline');
    if (off) off.classList.toggle('show', !online);

    // pastilles de l'écran Compte
    ['syncDot', 'syncDotD'].forEach(function (id) {
      var p = byId(id); if (!p) return;
      p.className = 'syncdot ' + (!online ? 'off' : (bloquees ? 'err' : (attente ? 'sync' : 'ok')));
      p.title = !online ? 'Hors ligne'
        : bloquees ? (bloquees + ' à reprendre')
          : attente ? (attente + ' en cours d\'envoi') : 'Synchronisé';
    });
    var tx = byId('syncTxt');
    if (tx) tx.textContent = !online ? 'Hors ligne' : (attente || bloquees ? 'Envoi…' : 'Synchronisé');

    var b = bandeau();
    if (!online) {
      b.className = 'mh-bandeau-etat show hors-ligne';
      b.innerHTML = '<span class="pastille"></span><b>Hors ligne</b>'
        + '<span class="detail">Tu peux continuer : '
        + (attente ? attente + ' modification' + (attente > 1 ? 's' : '') + ' en attente d\'envoi' : 'tout est enregistré sur cet appareil')
        + '</span>';
    } else if (bloquees) {
      b.className = 'mh-bandeau-etat show alerte';
      b.innerHTML = '<span class="pastille"></span><b>' + bloquees + ' envoi' + (bloquees > 1 ? 's' : '') + ' à reprendre</b>'
        + '<span class="detail">Réglages · Synchronisation</span>';
    } else {
      b.className = 'mh-bandeau-etat';
      b.innerHTML = '';
    }
    majBoite();
  }

  w.addEventListener('mh:etat', function (ev) { peintEtat(ev.detail || null); });

  /* ============================================================
     Bloc « Synchronisation » de l'écran Compte
     ============================================================ */

  function majBoite() {
    var box = byId('syncBox'); if (!box) return;
    var api = M();

    if (!api) {
      box.innerHTML = '<div class="subttl">Synchronisation</div>'
        + '<div class="note">Module de données non chargé.</div>';
      return;
    }
    if (!api.code()) {
      box.innerHTML = '<div class="subttl">Synchronisation tel ⇄ ordinateur</div>'
        + '<div class="note">Saisis le <b>code atelier</b> une seule fois sur cet appareil. '
        + 'Il reste dans ce navigateur et il est vérifié côté serveur.</div>'
        + '<div class="fld"><label>Code atelier</label>'
        + '<input id="wsInput" type="password" placeholder="code fourni par NexusAI" autocomplete="off"></div>'
        + '<div class="acts"><button class="btn cta" id="wsConnect">Autoriser cet appareil</button></div>';
      byId('wsConnect').onclick = function () {
        var v = (byId('wsInput').value || '').trim();
        if (!v) { toast('Entre le code atelier'); return; }
        api.login(v).then(function (ok) {
          toast(ok ? 'Appareil autorisé' : 'Code refusé');
          if (ok) { majBoite(); if (w.MHBridge) w.MHBridge.boot(); }
        });
      };
      return;
    }

    var f = api.fileAttente();
    var attente = f.filter(function (o) { return !o.bloque; });
    var bloquees = f.filter(function (o) { return o.bloque; });

    var html = '<div class="subttl">Synchronisation tel ⇄ ordinateur</div>'
      + '<div class="note">État : <b>' + (api.online ? 'en ligne' : 'hors ligne') + '</b>'
      + ' · ' + attente.length + ' en attente'
      + (bloquees.length ? ' · <b>' + bloquees.length + ' à reprendre</b>' : '')
      + '</div>';

    if (f.length) {
      html += '<div class="mh-file">';
      f.forEach(function (o) {
        html += '<div class="mh-file-l' + (o.bloque ? ' bloque' : '') + '">'
          + '<div class="t"><b>' + esc(o.libelle) + '</b>'
          + '<span>' + ilya(o.depuis) + (o.essais ? ' · ' + o.essais + ' tentative' + (o.essais > 1 ? 's' : '') : '') + '</span>'
          + (o.erreur ? '<span class="err">' + esc(o.erreur) + '</span>' : '')
          + '</div>'
          + (o.bloque
            ? '<button class="btn mini" data-relance="' + o.id + '">Réessayer</button>'
            + '<button class="btn mini gh" data-abandon="' + o.id + '">Abandonner</button>'
            : '')
          + '</div>';
      });
      html += '</div>';
    }

    html += '<div class="acts">'
      + '<button class="btn cta" id="wsSync">Resynchroniser</button>'
      + '<button class="btn gold" id="wsRenvoi">Tout renvoyer</button>'
      + '<button class="btn" id="wsDiag">Diagnostic</button>'
      + '<button class="btn" id="wsExport">Export de secours</button>'
      + '<button class="btn gh" id="wsForget">Oublier ce code</button>'
      + '</div><div id="wsDiagBox"></div>';

    box.innerHTML = html;

    box.querySelectorAll('[data-relance]').forEach(function (b) {
      b.onclick = function () { api.fileRelance(b.getAttribute('data-relance')); majBoite(); };
    });
    box.querySelectorAll('[data-abandon]').forEach(function (b) {
      b.onclick = function () {
        api.fileAbandonne(b.getAttribute('data-abandon'));
        toast('Opération abandonnée'); majBoite();
      };
    });

    byId('wsSync').onclick = function () {
      api.ping().then(function () { return api.flush(); }).then(function () { return api.pull(); })
        .then(function () { toast('À jour'); majBoite(); });
    };
    byId('wsRenvoi').onclick = function () {
      if (!w.MHBridge || !w.MHBridge.toutRenvoyer) { toast('Pont indisponible'); return; }
      toast('Renvoi en cours…');
      w.MHBridge.toutRenvoyer().then(function () { toast('Renvoi terminé'); majBoite(); });
    };
    byId('wsDiag').onclick = diagnostic;
    byId('wsExport').onclick = exporte;
    byId('wsForget').onclick = function () {
      try { localStorage.removeItem('mh_code_v1'); } catch (e) { }
      toast('Code oublié sur cet appareil'); majBoite();
    };
  }

  /* ============================================================
     Diagnostic : ce que j'ai ici, ce qu'il y a là-bas
     ============================================================ */

  function compteLocal(cle) {
    try { return (JSON.parse(localStorage.getItem(cle)) || []).length; } catch (e) { return 0; }
  }

  function diagnostic() {
    var api = M(), zone = byId('wsDiagBox');
    if (!api || !zone) return;
    zone.innerHTML = '<div class="note">Lecture du serveur…</div>';

    api.pull().then(function (data) {
      var docsLocal = compteLocal('mh_clients_v3');
      var docsBase = (data.documents || []).length;
      var elevesBase = (data.eleves || []).length;
      var sansContact = api.aCompleter().length;
      var f = api.fileCompte();

      function ligne(nom, ici, base) {
        var ok = ici === base;
        return '<div class="mh-diag-l' + (ok ? '' : ' ecart') + '">'
          + '<b>' + nom + '</b><span>' + ici + ' ici · ' + base + ' en base</span>'
          + '<i>' + (ok ? 'identique' : 'écart de ' + Math.abs(ici - base)) + '</i></div>';
      }

      zone.innerHTML = '<div class="mh-diag">'
        + ligne('Documents', docsLocal, docsBase)
        + '<div class="mh-diag-l"><b>Élèves en base</b><span>' + elevesBase + '</span><i></i></div>'
        + '<div class="mh-diag-l' + (sansContact ? ' ecart' : '') + '"><b>Fiches à compléter</b><span>'
        + sansContact + '</span><i>' + (sansContact ? 'téléphone ou email manquant' : 'complètes') + '</i></div>'
        + '<div class="mh-diag-l' + (f.bloquees ? ' ecart' : '') + '"><b>File d\'attente</b><span>'
        + f.attente + ' en attente · ' + f.bloquees + ' à reprendre</span><i></i></div>'
        + '</div>'
        + '<div class="acts"><button class="btn" id="wsAutotest">Lancer l\'auto-test</button></div>'
        + '<div id="wsTestBox"></div>';

      byId('wsAutotest').onclick = autotest;
    });
  }

  /** Écrit une ligne d'essai, la relit, la compare, puis l'efface. */
  function autotest() {
    var api = M(), zone = byId('wsTestBox');
    if (!api || !zone) return;
    var nom = 'ESSAI-SYNCHRO-' + Date.now().toString(36).toUpperCase();
    zone.innerHTML = '<div class="note">Test en cours…</div>';

    api.saveLieu({ nom: nom, adresse: 'ligne de test, effacée aussitôt', par_defaut: false })
      .then(function () { return api.pull(); })
      .then(function (data) {
        var trouve = (data.lieux || []).find(function (l) { return l.nom === nom; });
        if (!trouve) {
          zone.innerHTML = '<div class="note err">Écriture non retrouvée en base. '
            + 'Vérifie le code atelier et le réseau.</div>';
          return;
        }
        return api.deleteCatalog(trouve.id, 'lieu').then(function () { return api.pull(); })
          .then(function (apres) {
            var reste = (apres.lieux || []).some(function (l) { return l.nom === nom; });
            zone.innerHTML = '<div class="note">Écriture : OK · Relecture : OK · Effacement : '
              + (reste ? 'à vérifier' : 'OK') + '<br>La synchronisation fonctionne dans les deux sens.</div>';
          });
      })
      .catch(function (e) {
        zone.innerHTML = '<div class="note err">Test interrompu : ' + esc(e.message || e) + '</div>';
      });
  }

  /* ============================================================
     Export / import de secours
     ============================================================ */

  function exporte() {
    var api = M(); if (!api) return;
    var paquet = {
      version: 1, le: new Date().toISOString(), workspace: api.ws,
      base: api.data,
      local: {
        clients: JSON.parse(localStorage.getItem('mh_clients_v3') || '[]'),
        contacts: JSON.parse(localStorage.getItem('mh_contacts_v1') || '[]'),
        catalogue: JSON.parse(localStorage.getItem('mh_catalog_v3') || 'null'),
        reglages: JSON.parse(localStorage.getItem('mh_settings_v1') || 'null')
      },
      fileAttente: api.fileAttente()
    };
    var blob = new Blob([JSON.stringify(paquet, null, 2)], { type: 'application/json' });
    var a = d.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'magic-hands-secours-' + new Date().toISOString().slice(0, 10) + '.json';
    d.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Export téléchargé');
  }

  /* ============================================================
     Démarrage
     ============================================================ */

  function boot() {
    peintEtat(null);
    majBoite();
    if (M()) M().ping();
  }

  w.MHetat = { refresh: function () { peintEtat(null); majBoite(); }, diagnostic: diagnostic, exporte: exporte };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);

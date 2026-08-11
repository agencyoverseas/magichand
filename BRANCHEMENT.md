# Magic Hands — rebranchement sur Supabase

## Ce qui a changé

Avant, tout l'état de l'app (élèves, documents, catalogue, réglages,
prospects) tenait dans **une seule ligne JSON** : `mh_state`. Le dernier
appareil qui écrivait écrasait tout le reste — c'est la cause probable
des pertes déjà constatées.

Maintenant, chaque module a sa table. La synchronisation se fait ligne
par ligne : deux appareils peuvent modifier deux élèves différents en
même temps sans que l'un efface l'autre.

## Le chemin des données

    écran (app.js)
      ↓ écrit dans localStorage
    mh-bridge.js          ← détecte ce qui a changé
      ↓ appelle
    mh-data.js            ← file d'attente si hors ligne
      ↓ RPC
    Supabase              ← le code atelier est vérifié côté serveur

`sync.js` n'écrit plus dans `mh_state` : la fonction `push()` rend la
main immédiatement quand le pont est actif. Deux sources de vérité
finiraient par diverger.

## Les tables

| Table | Contenu |
|---|---|
| `mh_eleves` | fiches élèves |
| `mh_documents` | certificats et attestations émis |
| `mh_offers` `mh_modules` `mh_sessions` | catalogue |
| `mh_org` `mh_lieux` | organisme et lieux de formation |
| `mh_prospects` `mh_calls` `mh_echeances` | closing et commissions |
| `mh_settings` | réglages |
| `mh_emargements` `mh_eleve_tokens` | émargement (inchangé) |
| `mh_state_backup` | sauvegarde avant migration |

Aucune n'est lisible avec la clé anon. Tout passe par des fonctions
`SECURITY DEFINER` qui vérifient le code atelier.

## Hors ligne

Les écritures sont mises en file dans `localStorage` et rejouées dans
l'ordre à la reconnexion. Le badge en haut à droite indique l'état.

## Commissions

Chaque vente porte un `type_revenu` :

- `commission` — 10 % pour toi
- `ca_propre` — tu encaisses le montant entier
- `a_qualifier` — ventes importées avant la refonte, traitées en
  commission comme avant, et comptées à part sur le tableau de bord

## Ce qui reste à faire

- Intégrer le Closing Tool comme onglet (il me faut les 8 fichiers
  `mh-closing-*.js` du site)
- Notifications push (clés VAPID + Edge Function)

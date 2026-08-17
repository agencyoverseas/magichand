# Magic Hands — projet complet, version synchro du 17/08/2026

Ce zip contient **tout le projet**, correctifs inclus. Il remplace
le contenu de ton dépôt, il ne s'ajoute pas à côté.

## Installation

    cd ~
    unzip -o /sdcard/Download/magichand-complet-20260817.zip
    cd magichand
    bash appliquer-synchro.sh

Le script sauvegarde ce qu'il remplace dans `.sauvegarde-<date>/`
à l'intérieur du dépôt, puis commite et pousse sur
https://github.com/agencyoverseas/magichand

Si ton dépôt est ailleurs : `bash appliquer-synchro.sh ~/ton/chemin`
Pour appliquer sans pousser : `bash appliquer-synchro.sh --sans-push`

## Ce qui change par rapport à ta version en ligne

Fichiers remplacés :

    assets/mh-data.js       file d'attente fiable, test réseau, corbeille
    assets/mh-bridge.js     créations + MODIFICATIONS + SUPPRESSIONS
    assets/pwa.js           n'appelle plus MHsync, qui n'existe plus
    index.html              sync.js retiré, mh-etat.js et etat.css ajoutés
    service-worker.js       precache corrigé, nouvelle version de cache

Fichiers ajoutés :

    assets/mh-etat.js       bandeau hors ligne, file, diagnostic, auto-test
    assets/etat.css         bandeau, file, diagnostic, barre latérale

Fichier supprimé :

    assets/sync.js          ancienne synchro par mh_state, remplacée

Tout le reste (app.js, emargement.js, shell.js, les documents, les
polices, les images) est identique à ta version actuelle.

## Après le push

1. Attendre la fin du déploiement Vercel.
2. Recharger **deux fois**, en forçant : Ctrl+Maj+R sur PC.
   La première récupère le nouveau service worker, la seconde
   l'active.
3. Réglages → Synchronisation.
   - S'il demande le **code atelier** : cet appareil n'est pas
     encore autorisé, saisis-le. C'est normal et attendu.
   - Sinon, vérifier « en ligne » puis **Diagnostic** : les
     compteurs local et base doivent être identiques.
4. **Lancer l'auto-test** : il écrit une ligne d'essai, la relit,
   l'efface, et confirme que les deux sens fonctionnent.

## Retour en arrière

    cd ~/magichand
    cp .sauvegarde-<date>/assets/* assets/
    cp .sauvegarde-<date>/index.html .
    cp .sauvegarde-<date>/service-worker.js .

## Côté base — déjà appliqué, rien à faire

- doublons supprimés : 77 → 21 documents, sauvegarde conservée
  dans la table `mh_documents_backup_20260817`
- index unique + `mh_doc_save` idempotente : un doublon exact est
  désormais impossible, même en cas d'écritures simultanées
- `mh_doc_save` accepte un identifiant et met à jour un document
  existant (aucune modification ne remontait avant)
- colonnes `deleted_at` (corbeille) sur les élèves et documents
- colonnes `pdf_path`, `pdf_taille`, `pdf_maj` pour l'archivage
- fonctions `mh_trash`, `mh_restore`, `mh_purge`, `mh_trash_list`,
  `mh_doc_pdf_set`
- `mh_data_get` ne renvoie plus la corbeille : un élément supprimé
  ne réapparaît plus à la synchro suivante
- bucket privé `mh-documents` créé (PDF, 20 Mo max)

## Reste à faire

- calendrier : une seule date au premier clic, plage au second
- archivage des PDF dans le bucket (fonction serveur d'envoi)
- bouton d'envoi groupé des certificats, sélection tout ou un par un
- dépôt GitHub à passer en privé, puis rotation de la clé anon

# Magic Hands — Studio de documents

Application web (HTML/CSS/JS statique) pour générer **certificats** et **attestations**
de formation, avec gestion catalogue / élèves / closing.
Propulsé par **NexusAI**.

## Déploiement (Vercel)
Site **statique pur** : aucun build.
1. Importer ce dépôt dans Vercel.
2. Framework Preset : **Other** — Build Command : *(vide)* — Output Directory : `./`
3. Deploy. Le site est servi depuis `index.html` à la racine.

## Synchronisation (Supabase)
- `config.js` contient l'URL + la clé **anon** du projet Supabase `nexusai-suite`.
- `schema.sql` (table `mh_state`) est **déjà appliqué** sur ce projet.
- Mode **sans code** : `workspace` fixe = `magic-hands` → tous les appareils
  partagent automatiquement le même espace (offline-first + temps réel).
- Voir `GUIDE_SYNC.md`.

## Sécurité
- Dépôt **privé** : la clé anon n'est pas exposée publiquement.
- Sur le site déployé, la clé anon reste visible côté navigateur (normal pour Supabase).
  La vraie protection des données passe par le **RLS** côté Supabase.
- À durcir : activer le RLS sur les tables sans politique (ex. `prospects_guadeloupe`),
  ou passer la sync en authentification utilisateur.

## Version hors-ligne
Un fichier autonome `magic-hands-clair.html` (tout-en-un, **sans** sync) est fourni
séparément pour un usage 100% local.

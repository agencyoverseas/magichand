# Magic Hands — Studio de documents

Application web statique (HTML/CSS/JS, aucun build) : certificats, attestations,
**feuilles d'émargement avec signature électronique**, catalogue, élèves, closing.
Propulsé par **NexusAI**.

## Déploiement (Vercel)
1. Importer le dépôt dans Vercel.
2. Framework Preset : **Other** — Build Command : *(vide)* — Output Directory : `./`
3. Deploy. Le site est servi depuis `index.html` à la racine.

## Première mise en route (important)
1. Déployer le site.
2. Ouvrir l'app → onglet **Compte** → saisir le **code atelier**.
   Le code n'est jamais écrit dans le dépôt : il est saisi une fois par appareil
   et conservé en local. Sans lui, l'app fonctionne mais ne synchronise plus.
3. Une fois le code saisi et la synchro vérifiée, exécuter
   `schema-durcissement.sql` dans Supabase → SQL Editor.
   Cette étape coupe l'accès direct de la clé anon aux données.

## Émargement
- Une feuille est créée automatiquement pour chaque élève × formation.
- Écran **Émargement** (barre latérale sur PC, menu ⋯ sur mobile) ou depuis la fiche élève.
- Tous les champs de la feuille sont modifiables (tap sur mobile, clic sur PC).
- Boutons : PDF, envoi du lien par WhatsApp, relance, QR code à scanner en salle,
  colonnes affichées, signature formateur, clôture, archivage, export CSV des présences.
- L'élève signe via `signer.html?t=<token>` : il ne voit que sa feuille, rien d'autre.
  Il ne peut signer que **le jour de la ligne** ; il peut recommencer tant que la
  gérante n'a pas validé la case.
- Statuts calculés : À signer / Partiellement signée / Complète.
  Une notification (cloche) apparaît quand une feuille devient complète.

## Sécurité — modèle actuel
- Aucune table n'est lue ou écrite directement : tout passe par des fonctions
  SQL `SECURITY DEFINER` (`mh_state_*`, `mh_em_*`) qui vérifient soit le
  **code atelier** (côté gérante), soit le **token de la feuille** (côté élève).
- `mh_emargements` et `mh_keys` : RLS active, **aucune policy** → inaccessibles
  directement avec la clé anon.
- `mh_state` : à verrouiller via `schema-durcissement.sql` après déploiement.
- Le code atelier est stocké en base sous forme de **hash bcrypt**, jamais en clair.

## Hors-ligne
Offline-first : les données restent en local et se resynchronisent au retour du
réseau. La signature élève, elle, exige une connexion (elle s'enregistre côté serveur).

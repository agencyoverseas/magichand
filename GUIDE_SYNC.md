# Synchronisation tel ⇄ ordinateur — mise en route

Sans configuration, le site marche en **local** (chaque appareil garde ses propres données).
Pour partager les données entre téléphone et ordinateur :

## 1. Projet Supabase
- Va sur https://supabase.com → un projet existant **ou** « New project ».
- Note : 1 projet peut héberger plusieurs ateliers (séparés par le code atelier).

## 2. Créer la table
- Supabase → **SQL Editor** → New query → colle tout `schema.sql` → **Run**.

## 3. Brancher le site
- Supabase → **Project Settings → API** : copie **Project URL** et la clé **anon public**.
- Ouvre `config.js` (racine du site) et colle-les :
  ```js
  window.MH_SUPABASE = {
    url: "https://xxxx.supabase.co",
    anonKey: "eyJhbGciOi..."
  };
  ```
- Redéploie (Vercel) ou recharge le site.

## 4. Connecter les appareils
- Onglet **Compte** → bloc « Synchronisation » → entre un **code atelier**
  (ex : `magic-hands-2026`) → **Connecter**.
- Mets **le même code** sur le téléphone ET l'ordinateur. C'est tout.

## Comment ça marche
- **Offline-first** : tout reste en local ; dès qu'il y a du réseau, ça se resynchronise tout seul.
- **Temps réel** : un ajout sur le tel apparaît sur le PC (et inverse) en direct.
- Badge en haut à droite : gris = local, **or pulsant** = en cours, vert = synchronisé, rouge = erreur réseau.

## Fusion (à savoir)
- Les **élèves** et les **contacts** des deux appareils sont **réunis** (jamais écrasés).
- Le **catalogue** et les **réglages** : la version **la plus récente** gagne.
- Limite : si deux appareils modifient **le même contact hors-ligne en même temps**,
  c'est la dernière écriture qui l'emporte (les listes, elles, ne perdent rien).

## Sécurité — trade-off actuel
- Accès = **clé anon (publique)** + **code atelier**. Quiconque a les deux peut lire/écrire cet espace.
- Convient à un atelier de confiance. Pour **cloisonner par personne** (login),
  on remplacera les policies `using(true)` de `schema.sql` par de l'authentification Supabase.
  → me le demander quand tu veux durcir.

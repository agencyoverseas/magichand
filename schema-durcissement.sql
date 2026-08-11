-- ============================================================
-- ÉTAPE FINALE — à exécuter UNIQUEMENT après avoir déployé le
-- nouveau site ET saisi le code atelier sur au moins un appareil.
--
-- Elle supprime l'accès direct de la clé anon à mh_state.
-- Avant : n'importe qui possédant la clé anon (visible dans le
-- navigateur, et partagée avec les autres apps du même projet
-- Supabase) pouvait lire et écrire toutes les données.
-- Après : seules les fonctions mh_state_* y accèdent, et elles
-- exigent le code atelier.
--
-- ⚠️ Si tu l'exécutes AVANT de déployer, l'ancien site ne pourra
-- plus se synchroniser (les données locales restent intactes).
-- ============================================================

drop policy if exists "mh anon select" on public.mh_state;
drop policy if exists "mh anon insert" on public.mh_state;
drop policy if exists "mh anon update" on public.mh_state;

revoke all on public.mh_state from anon, authenticated;

-- Le temps réel ne peut plus diffuser une table sans policy de lecture :
-- l'app bascule automatiquement sur le sondage (voir sync.js).
alter publication supabase_realtime drop table public.mh_state;

-- Vérification : doit renvoyer 0 policy et rowsecurity = true
select relrowsecurity as rls_active,
       (select count(*) from pg_policies where tablename='mh_state') as nb_policies
  from pg_class where relname='mh_state';

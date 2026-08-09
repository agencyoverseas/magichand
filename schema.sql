-- ============================================================
-- Magic Hands — Schéma de synchronisation (Supabase / Postgres)
-- À exécuter dans : Supabase > SQL Editor > New query > Run
-- Modèle : 1 espace partagé = 1 ligne (clé = code atelier),
-- tout l'état applicatif est stocké en JSON.
-- ============================================================

create table if not exists public.mh_state (
  workspace   text primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  rev         bigint      not null default 0
);

-- Activer la sécurité au niveau ligne
alter table public.mh_state enable row level security;

-- ------------------------------------------------------------
-- Accès "espace partagé sans login" : la clé anon (publique)
-- peut lire/écrire. La séparation se fait par le code atelier.
-- /!\ Tout porteur de la clé anon + d'un code peut accéder à
--     cet espace. Pour cloisonner par utilisateur, remplacer
--     ces policies par de l'auth (voir GUIDE_SYNC.md).
-- ------------------------------------------------------------
drop policy if exists "mh anon select" on public.mh_state;
drop policy if exists "mh anon insert" on public.mh_state;
drop policy if exists "mh anon update" on public.mh_state;

create policy "mh anon select" on public.mh_state
  for select using (true);

create policy "mh anon insert" on public.mh_state
  for insert with check (true);

create policy "mh anon update" on public.mh_state
  for update using (true) with check (true);

-- Maj auto de updated_at
create or replace function public.mh_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.rev = coalesce(old.rev, 0) + 1;
  return new;
end $$;

drop trigger if exists mh_touch_trg on public.mh_state;
create trigger mh_touch_trg before update on public.mh_state
  for each row execute function public.mh_touch();

-- Temps réel (sync instantanée entre appareils)
alter publication supabase_realtime add table public.mh_state;

-- ============================================================
-- ÉMARGEMENT — v1 (déjà appliqué sur nexusai-suite le 09/08/2026)
-- Conservé ici pour pouvoir recréer le projet à l'identique.
-- Aucune table n'est accessible directement par la clé anon :
-- tout passe par des fonctions RPC (SECURITY DEFINER).
-- ============================================================
-- Voir les migrations appliquées :
--   mh_emargement_v1, mh_emargement_rpc_v1,
--   mh_emargement_rpc_v2_fix_jsonb_parents, mh_state_rpc_v1
--
-- Résumé des objets créés :
--   table  public.mh_keys         (workspace, code_hash)  -- code atelier haché (bcrypt)
--   table  public.mh_emargements  (id, workspace, eleve_id, formation, token,
--                                  data jsonb, statut, archived, locked, sent_at, rev)
--   fn     mh_check(ws, code)                 -- vérifie le code atelier
--   fn     mh_em_list / mh_em_save / mh_em_delete / mh_em_validate   -- côté gérante
--   fn     mh_em_get(token) / mh_em_sign(token, ligne, slot, img, pts, ua) -- côté élève
--   fn     mh_state_get / mh_state_put / mh_state_rev                -- sync de l'app
--
-- Règles appliquées côté serveur (non contournables depuis le navigateur) :
--   * l'élève ne peut lire QUE sa feuille, via son token ;
--   * il ne peut signer que le jour exact de la ligne (fuseau Europe/Paris) ;
--   * il ne peut pas réécrire une signature déjà validée par la gérante ;
--   * une feuille clôturée (locked) n'accepte plus aucune signature ;
--   * toute action de la gérante exige le code atelier.

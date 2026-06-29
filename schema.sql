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

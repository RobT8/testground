-- ============================================================================
--  Diabetes Night Alert — database setup
--
--  ✅ ALREADY DONE: this has been applied to the Supabase project the app is
--     wired to (project "boatyardjobs", table "night_alerts"). You do NOT need
--     to run it again for the current setup.
--
--  Keep this file for the "move to its own project later" case: create a fresh
--  Supabase project, run this once (SQL Editor -> paste -> Run), then update the
--  URL + key in config.js (web) and Config.kt (Android).
--
--  Note: the table is named `night_alerts` (not `alerts`) so it can live safely
--  alongside other tables in a shared project.
-- ============================================================================

create table if not exists public.night_alerts (
  id                uuid primary key default gen_random_uuid(),
  group_id          text        not null,
  status            text        not null default 'active',  -- 'active' | 'confirmed' | 'cancelled'
  created_at        timestamptz not null default now(),
  created_by        text        not null,
  also_requested_by text[]      not null default '{}',
  confirmed_at      timestamptz,
  confirmed_by      text,
  confirmed_note    text
);

create index if not exists night_alerts_group_status_idx
  on public.night_alerts (group_id, status, created_at desc);

-- Realtime: let clients receive INSERT/UPDATE events live.
alter table public.night_alerts replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.night_alerts;
  exception when duplicate_object then null;
  end;
end $$;

-- Security (RLS): access is gated by the family GROUP CODE (shared secret).
alter table public.night_alerts enable row level security;
drop policy if exists "family read"   on public.night_alerts;
drop policy if exists "family insert" on public.night_alerts;
drop policy if exists "family update" on public.night_alerts;
create policy "family read"   on public.night_alerts for select using (true);
create policy "family insert" on public.night_alerts for insert with check (true);
create policy "family update" on public.night_alerts for update using (true) with check (true);

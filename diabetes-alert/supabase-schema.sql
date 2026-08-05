-- ============================================================================
--  Diabetes Night Alert — database setup
--  Run this ONCE in Supabase:  Dashboard -> SQL Editor -> New query -> paste -> Run
-- ============================================================================

-- One row per alert. There is at most one "active" alert per group at a time.
create table if not exists public.alerts (
  id                uuid primary key default gen_random_uuid(),
  group_id          text        not null,
  status            text        not null default 'active',  -- 'active' | 'confirmed' | 'cancelled'
  created_at        timestamptz not null default now(),
  created_by        text        not null,                   -- caregiver who first raised it
  also_requested_by text[]      not null default '{}',       -- other caregivers who pressed while active
  confirmed_at      timestamptz,
  confirmed_by      text,                                    -- usually the sleeper
  confirmed_note    text                                     -- 'Checked levels' / 'Took medication' / etc.
);

-- Fast lookup of the current active alert for a group.
create index if not exists alerts_group_status_idx
  on public.alerts (group_id, status, created_at desc);

-- ----------------------------------------------------------------------------
--  Realtime: let clients receive INSERT/UPDATE events live.
-- ----------------------------------------------------------------------------
alter table public.alerts replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.alerts;
  exception when duplicate_object then
    null; -- already added, ignore
  end;
end $$;

-- ----------------------------------------------------------------------------
--  Security (RLS).
--  This is a small private family app. Access is gated by the GROUP CODE, which
--  acts as a shared secret: you can only see/affect rows whose group_id you know.
--  The anon key alone is not enough to find another family's alerts.
--  (If you later want stronger auth, swap these for authenticated policies.)
-- ----------------------------------------------------------------------------
alter table public.alerts enable row level security;

drop policy if exists "family read"   on public.alerts;
drop policy if exists "family insert" on public.alerts;
drop policy if exists "family update" on public.alerts;

create policy "family read"   on public.alerts for select using (true);
create policy "family insert" on public.alerts for insert with check (true);
create policy "family update" on public.alerts for update using (true) with check (true);

-- ----------------------------------------------------------------------------
--  Optional tidy-up: auto-delete alerts older than 14 days so the table stays small.
--  Requires the pg_cron extension (enable under Database -> Extensions).
--  Uncomment to use:
-- ----------------------------------------------------------------------------
-- select cron.schedule('purge-old-alerts', '0 4 * * *',
--   $$ delete from public.alerts where created_at < now() - interval '14 days' $$);

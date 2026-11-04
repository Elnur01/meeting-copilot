-- Meeting Copilot · veritabanı şeması
-- Supabase > SQL Editor'da bir kez çalıştırın. Ardından seed.sql'i çalıştırın.

create table if not exists sessions (
  id text primary key,
  name text not null,
  time text,
  focus text,
  who text,
  ord int not null default 0
);

create table if not exists questions (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  type text not null check (type in ('core','deep')),
  step int,
  stage text,
  text text not null,
  priority text,
  ord int not null default 0,
  source text not null default 'bank',          -- 'bank' = Excel, 'added' = sonradan eklenen
  status text not null default 'open' check (status in ('open','partial','answered','skipped')),
  answer text not null default '',
  quote text not null default '',
  updated_by text,
  updated_at timestamptz
);
create index if not exists questions_session_idx on questions(session_id);

create table if not exists segments (
  id bigint generated always as identity primary key,
  session_id text not null references sessions(id),
  t timestamptz not null default now(),
  text text not null,
  is_note boolean not null default false,
  author text,
  processed boolean not null default false
);
create index if not exists segments_pending_idx on segments(processed, id);

create table if not exists notes (
  id bigint generated always as identity primary key,
  session_id text not null references sessions(id),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists app_state (
  id int primary key default 1 check (id = 1),
  active_session text references sessions(id),
  auto_session boolean not null default true,
  mic_holder text,
  mic_heartbeat timestamptz,
  analyzing_until timestamptz,
  last_analysis text
);

-- Erişim: yalnızca giriş yapmış kullanıcılar okur ve yazar. Silme yok.
alter table sessions  enable row level security;
alter table questions enable row level security;
alter table segments  enable row level security;
alter table notes     enable row level security;
alter table app_state enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sessions','questions','segments','notes','app_state'] loop
    execute format('drop policy if exists "auth read" on %I', t);
    execute format('drop policy if exists "auth insert" on %I', t);
    execute format('drop policy if exists "auth update" on %I', t);
    execute format('create policy "auth read" on %I for select to authenticated using (true)', t);
    execute format('create policy "auth insert" on %I for insert to authenticated with check (true)', t);
    execute format('create policy "auth update" on %I for update to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Canlı güncellemeler (Realtime)
do $$
declare t text;
begin
  foreach t in array array['questions','segments','notes','app_state'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename=t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

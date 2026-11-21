-- Phố Mới: nhóm cạnh tranh (giai đoạn C của city/MULTIPLAYER.md).
-- Mỗi nhóm là một dòng: data = toàn bộ trạng thái nhóm (thành viên, bản tóm tắt cuối, nguồn nông thôn, phần chia mấy ngày gần nhất).
-- Gateway là nơi duy nhất ghi (secret key, bỏ qua RLS); người chơi chỉ đọc nhóm của mình.

create table if not exists public.city_leagues (
  id text primary key,
  season integer not null,
  members integer not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists city_leagues_open_idx on public.city_leagues (season, members);

create table if not exists public.city_league_members (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  league_id text not null references public.city_leagues (id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table public.city_leagues enable row level security;
alter table public.city_league_members enable row level security;
drop policy if exists "city_league_members: chủ đọc" on public.city_league_members;
create policy "city_league_members: chủ đọc" on public.city_league_members for select to authenticated using (owner_id = auth.uid());
drop policy if exists "city_leagues: thành viên đọc" on public.city_leagues;
create policy "city_leagues: thành viên đọc" on public.city_leagues for select to authenticated using (exists (select 1 from public.city_league_members m where m.league_id = id and m.owner_id = auth.uid()));

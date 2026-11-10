-- Nền tảng game tương tác TikTok Live — bảng dùng chung cho MỌI game (luôn có game_id).
-- Bảng riêng của game: games/<id>/supabase/migrations, tên bắt buộc tiền tố g_<id>_.
-- Gateway dùng secret key (bỏ qua RLS) và tự kiểm tra quyền chủ kênh; RLS dưới đây chặn mọi truy cập trực tiếp khác.

create extension if not exists pgcrypto;

-- Hồ sơ streamer (tạo tự động khi đăng ký)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

-- Kênh TikTok của streamer; overlay_key là bí mật của link overlay
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'tiktok' check (platform in ('tiktok')),
  username text not null check (username ~ '^[A-Za-z0-9._]{2,30}$'),
  overlay_key text not null unique default encode(gen_random_bytes(18), 'hex'),
  active_game text not null default 'doantu',
  created_at timestamptz not null default now()
);
create index if not exists channels_owner_idx on public.channels (owner_id);

-- Cấu hình từng game của kênh: cài đặt (theo settings.schema.json), bindings (trigger → action), ghim phiên bản
create table if not exists public.channel_games (
  channel_id uuid not null references public.channels (id) on delete cascade,
  game_id text not null,
  version_pin text,
  settings jsonb not null default '{}'::jsonb,
  bindings jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (channel_id, game_id)
);

-- Trạng thái game để khôi phục khi reload overlay (serialize() của game)
create table if not exists public.game_state (
  channel_id uuid not null references public.channels (id) on delete cascade,
  game_id text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (channel_id, game_id)
);

-- Kết quả từng ván
create table if not exists public.rounds (
  id bigserial primary key,
  channel_id uuid not null references public.channels (id) on delete cascade,
  game_id text not null,
  result jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rounds_channel_idx on public.rounds (channel_id, created_at desc);

-- Bảng xếp hạng tuần (week = thứ Hai theo giờ VN); game_id '' = tổng mọi game
create table if not exists public.leaderboard (
  channel_id uuid not null references public.channels (id) on delete cascade,
  game_id text not null default '',
  week date not null,
  viewer_id text not null,
  name text,
  avatar text,
  points bigint not null default 0,
  wins integer not null default 0,
  primary key (channel_id, game_id, week, viewer_id)
);
create index if not exists leaderboard_rank_idx on public.leaderboard (channel_id, week, points desc);

-- Buổi live (số phút — để giới hạn gói miễn phí sau này)
create table if not exists public.live_sessions (
  id bigserial primary key,
  channel_id uuid not null references public.channels (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes integer not null default 0,
  stats jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.channel_games enable row level security;
alter table public.game_state enable row level security;
alter table public.rounds enable row level security;
alter table public.leaderboard enable row level security;
alter table public.live_sessions enable row level security;

drop policy if exists "profiles: chủ đọc / sửa" on public.profiles;
create policy "profiles: chủ đọc / sửa" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "channels: chủ kênh" on public.channels;
create policy "channels: chủ kênh" on public.channels for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- bảng con: chủ kênh chỉ ĐỌC (ghi đi qua gateway)
do $$
declare t text;
begin
  foreach t in array array['channel_games', 'game_state', 'rounds', 'leaderboard', 'live_sessions'] loop
    execute format('drop policy if exists "%s: chủ kênh đọc" on public.%I', t, t);
    execute format('create policy "%s: chủ kênh đọc" on public.%I for select to authenticated using (exists (select 1 from public.channels c where c.id = channel_id and c.owner_id = auth.uid()))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RPC
-- Cộng điểm nguyên tử (gateway gom điểm rồi gọi theo lô); ghi cả dòng của game và dòng tổng ('').
create or replace function public.add_points(
  p_channel uuid, p_game text, p_week date, p_viewer text, p_name text, p_avatar text, p_points bigint, p_wins integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.leaderboard as l (channel_id, game_id, week, viewer_id, name, avatar, points, wins)
  values (p_channel, p_game, p_week, p_viewer, p_name, p_avatar, p_points, p_wins),
         (p_channel, '', p_week, p_viewer, p_name, p_avatar, p_points, p_wins)
  on conflict (channel_id, game_id, week, viewer_id) do update
    set points = l.points + excluded.points,
        wins = l.wins + excluded.wins,
        name = coalesce(excluded.name, l.name),
        avatar = coalesce(excluded.avatar, l.avatar);
end $$;
revoke all on function public.add_points(uuid, text, date, text, text, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.add_points(uuid, text, date, text, text, text, bigint, integer) to service_role;

-- Tạo hồ sơ khi có người đăng ký
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

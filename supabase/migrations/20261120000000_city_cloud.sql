-- Phố Mới: lưu thành phố lên đám mây (giai đoạn B của city/MULTIPLAYER.md).
-- Mỗi tài khoản 4 ô lưu: auto (tự lưu 5 phút một lần), slot1..slot3. data = JSON của sim.serialize nén gzip, base64.
-- Gateway ghi bằng secret key (bỏ qua RLS) sau khi kiểm tra token; RLS cho chủ tài khoản chỉ đọc bản lưu của mình.

create table if not exists public.city_saves (
  owner_id uuid not null references auth.users (id) on delete cascade,
  slot text not null check (slot in ('auto', 'slot1', 'slot2', 'slot3')),
  name text not null default 'Phố Mới',
  pop integer not null default 0,
  day integer not null default 0,
  size integer not null default 0,
  data text not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, slot)
);

alter table public.city_saves enable row level security;
drop policy if exists "city_saves: chủ đọc" on public.city_saves;
create policy "city_saves: chủ đọc" on public.city_saves for select to authenticated using (owner_id = auth.uid());

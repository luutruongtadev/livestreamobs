#!/usr/bin/env bash
# Áp dụng migration Supabase: supabase/migrations/*.sql (nền tảng) + games/*/supabase/migrations/*.sql (bảng g_<id>_ của game).
# Mỗi file chạy MỘT lần, trong một transaction, theo thứ tự tên file (đặt tên bắt đầu bằng thời gian YYYYMMDDHHMMSS_).
#   SUPABASE_DB_URL=postgresql://... bash deploy/migrate.sh
set -euo pipefail
: "${SUPABASE_DB_URL:?Thiếu SUPABASE_DB_URL}"
cd "$(dirname "$0")/.."
PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q)
"${PSQL[@]}" -c "create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now()); alter table public._migrations enable row level security;"
mapfile -t files < <(ls supabase/migrations/*.sql games/*/supabase/migrations/*.sql 2>/dev/null | awk -F/ '{ print $NF "\t" $0 }' | sort | cut -f2)
applied=0
for f in "${files[@]}"; do
  [[ "$f" =~ ^[A-Za-z0-9_./-]+\.sql$ ]] || { echo "Bỏ qua tên file lạ: $f"; continue; }
  if [[ "$("${PSQL[@]}" -tA -c "select 1 from public._migrations where name = '$f'")" == "1" ]]; then continue; fi
  echo "==> $f"
  "${PSQL[@]}" -1 -f "$f" -c "insert into public._migrations (name) values ('$f')"
  applied=$((applied + 1))
done
echo "Migration: áp dụng $applied file mới (tổng ${#files[@]})."

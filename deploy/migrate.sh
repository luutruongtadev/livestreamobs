#!/usr/bin/env bash
# Áp dụng migration Supabase: supabase/migrations/*.sql (nền tảng) + games/*/supabase/migrations/*.sql (bảng g_<id>_ của game).
# Mỗi file chạy MỘT lần, trong một transaction, theo thứ tự tên file (đặt tên bắt đầu bằng thời gian YYYYMMDDHHMMSS_).
#   SUPABASE_DB_URL=postgresql://... bash deploy/migrate.sh
set -euo pipefail
: "${SUPABASE_DB_URL:?Thiếu SUPABASE_DB_URL}"
cd "$(dirname "$0")/.."

# Tách chuỗi kết nối thành biến PG* (không đưa URI cho psql): mật khẩu có ký tự đặc biệt như @ : / # ? vẫn chạy,
# không cần mã hoá. Tách theo dấu @ CUỐI CÙNG; mật khẩu đã mã hoá kiểu %40 thì tự giải mã.
parse_db_url() {
  local u="${1#*://}"
  local creds="${u%@*}" hostpart="${u##*@}"
  [[ "$creds" == "$u" ]] && { echo "SUPABASE_DB_URL thiếu phần user:mật-khẩu@" >&2; return 1; }
  export PGUSER="${creds%%:*}"
  local pass="${creds#*:}"
  if [[ "$pass" =~ %[0-9A-Fa-f]{2} ]]; then pass="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(sys.argv[1]), end="")' "$pass")"; fi
  export PGPASSWORD="$pass"
  local hostport="${hostpart%%/*}" db="postgres"
  [[ "$hostpart" == */* ]] && db="${hostpart#*/}"
  db="${db%%\?*}"
  export PGDATABASE="${db:-postgres}"
  export PGHOST="${hostport%:*}"
  if [[ "$hostport" == *:* ]]; then export PGPORT="${hostport##*:}"; else export PGPORT=5432; fi
  export PGSSLMODE="${PGSSLMODE:-require}"
}
parse_db_url "$SUPABASE_DB_URL"
echo "Kết nối $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)
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

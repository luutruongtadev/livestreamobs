#!/usr/bin/env bash
# Cài & chạy Chùa Online bằng Docker trên VPS Linux (chạy bằng root).
#   bash deploy/docker-init.sh phone    # mặc định: server + HTTPS cho điện thoại
#   bash deploy/docker-init.sh server   # chỉ server (OBS ở máy khác qua SSH tunnel)
#   bash deploy/docker-init.sh stream   # server + VPS tự phát RTMP 24/7 (cần STREAM_KEY)
# Biến tuỳ chọn: TIKTOK_USERNAME, DOMAIN
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-phone}"

command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
[[ -f .env ]] || cp .env.example .env

set_env() { if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
get_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }

[[ -n "${TIKTOK_USERNAME:-}" ]] && set_env TIKTOK_USERNAME "${TIKTOK_USERNAME#@}"
TOKEN="$(get_env ADMIN_TOKEN)"
if [[ ${#TOKEN} -lt 12 || "$TOKEN" == "doi-mat-khau-nay" ]]; then
  TOKEN="$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  set_env ADMIN_TOKEN "$TOKEN"
fi

PROFILES=()
case "$MODE" in
  phone)
    D="${DOMAIN:-$(get_env DOMAIN)}"
    [[ -z "$D" ]] && D="$(curl -fsS4 https://api.ipify.org | tr . -).sslip.io"
    set_env DOMAIN "$D"
    PROFILES=(--profile https) ;;
  stream) PROFILES=(--profile stream) ;;
  server) ;;
  *) echo "Chế độ không hợp lệ: $MODE (phone | server | stream)"; exit 1 ;;
esac

docker compose "${PROFILES[@]}" up -d --build
echo
docker compose ps
echo
if [[ "$MODE" == "phone" ]]; then
  echo "Điện thoại:  https://$D/doantu?phone=1"
  echo "Admin:       https://$D/admin?token=$TOKEN"
  echo "(Cần mở cổng 80 và 443 trên tường lửa nhà cung cấp VPS)"
else
  echo "Admin (qua SSH tunnel: ssh -L 8686:127.0.0.1:8686 root@IP_VPS):"
  echo "  http://localhost:8686/admin?token=$TOKEN"
  [[ "$MODE" == "stream" ]] && echo "Log phát: docker compose logs -f streamer"
fi

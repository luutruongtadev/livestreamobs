#!/usr/bin/env bash
# Chạy TRÊN VPS (GitHub Actions gọi qua SSH sau khi chép file lên).
#   bash remote-deploy.sh <thư mục> <chế độ: phone | server | stream>
# - Cài Docker nếu chưa có, bật Docker tự chạy khi VPS khởi động.
# - Nạp image đã build sẵn (image-*.tar.gz), chạy docker compose với restart: unless-stopped
#   → VPS tắt / mở lại thì app tự chạy lại.
set -euo pipefail
DIR="${1:-/opt/chua-online}"
MODE="${2:-phone}"
SUDO=""
[[ $(id -u) -ne 0 ]] && SUDO="sudo -n"
cd "$DIR"

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | $SUDO sh
fi
$SUDO systemctl enable --now docker >/dev/null 2>&1 || true
$SUDO systemctl enable containerd >/dev/null 2>&1 || true
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="$SUDO docker"

echo "==> Tắt bản cài systemd cũ (nếu có) để không tranh cổng 8686 / 80 / 443"
for s in chua-stream chua-app; do
  if systemctl list-unit-files "$s.service" >/dev/null 2>&1 && systemctl is-enabled "$s" >/dev/null 2>&1; then
    $SUDO systemctl disable --now "$s" || true
  fi
done
if [[ "$MODE" == "phone" ]] && systemctl is-active caddy >/dev/null 2>&1; then
  echo "    Caddy cài trực tiếp đang chiếm cổng 80/443 → tắt, dùng Caddy trong Docker"
  $SUDO systemctl disable --now caddy || true
fi

echo "==> File .env"
if [[ -s env.deploy ]]; then
  mv env.deploy .env          # lấy từ secret VPS_ENV_FILE trên GitHub
else
  rm -f env.deploy
  [[ -f .env ]] || cp .env.example .env
fi
chmod 600 .env
set_env() { if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
get_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }
TOKEN="$(get_env ADMIN_TOKEN)"
if [[ ${#TOKEN} -lt 12 || "$TOKEN" == "doi-mat-khau-nay" ]]; then
  TOKEN="$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  set_env ADMIN_TOKEN "$TOKEN"
  echo "    Đã tạo ADMIN_TOKEN mới"
fi
PROFILES=()
case "$MODE" in
  phone)
    D="$(get_env DOMAIN)"
    if [[ -z "$D" ]]; then D="$(curl -fsS4 https://api.ipify.org | tr . -).sslip.io"; set_env DOMAIN "$D"; fi
    PROFILES=(--profile https) ;;
  stream) PROFILES=(--profile stream) ;;
  server) ;;
  *) echo "Chế độ không hợp lệ: $MODE"; exit 1 ;;
esac

echo "==> Nạp image"
for f in image-*.tar.gz; do
  [[ -e "$f" ]] || continue
  gunzip -c "$f" | $DOCKER load
  rm -f "$f"
done

echo "==> Chạy"
mkdir -p public/assets
$DOCKER compose "${PROFILES[@]}" up -d --no-build --remove-orphans
$DOCKER image prune -f >/dev/null || true
$DOCKER compose "${PROFILES[@]}" ps

echo
if [[ "$MODE" == "phone" ]]; then
  echo "Điện thoại:  https://$D/chanhdien?phone=1  |  /keoco  |  /doantu"
  echo "Admin:       https://$D/admin?token=<ADMIN_TOKEN trong $DIR/.env>"
else
  echo "Admin qua SSH tunnel: ssh -L 8686:127.0.0.1:8686 <user>@<VPS>  →  http://localhost:8686/admin?token=..."
fi

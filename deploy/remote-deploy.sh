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

# Docker cài từ gói docker.io của Ubuntu không kèm plugin compose → cài thêm
if ! $DOCKER compose version >/dev/null 2>&1; then
  echo "==> Cài docker compose"
  if command -v apt-get >/dev/null; then
    $SUDO apt-get update -qq || true
    $SUDO apt-get install -y -qq docker-compose-plugin >/dev/null 2>&1 \
      || $SUDO apt-get install -y -qq docker-compose-v2 >/dev/null 2>&1 || true
  fi
  if ! $DOCKER compose version >/dev/null 2>&1; then
    $SUDO mkdir -p /usr/local/lib/docker/cli-plugins
    $SUDO curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
      "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)"
    $SUDO chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi
  $DOCKER compose version
fi

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
# Secret riêng trên GitHub (SIGN_API_KEY, SUPABASE_*…) → secrets.deploy (mỗi dòng TÊN=giá trị) → ghi vào .env, đè dòng cũ cùng tên
if [[ -s secrets.deploy ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    NAME="${line%%=*}"
    [[ "$NAME" =~ ^[A-Z][A-Z0-9_]*$ ]] || continue
    { grep -v "^${NAME}=" .env || true; printf '%s\n' "$line"; } > .env.tmp && mv .env.tmp .env
    echo "    Đã cập nhật $NAME từ GitHub secret"
  done < secrets.deploy
  chmod 600 .env
fi
rm -f secrets.deploy sign.deploy
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
    PD="$(get_env PLAY_DOMAIN)"
    if [[ -z "$PD" ]]; then PD="play.$D"; set_env PLAY_DOMAIN "$PD"; fi
    # tên đăng nhập dashboard = <tên>@AUTH_USERNAME_DOMAIN trong Supabase Auth — đặt MỘT lần, không đổi theo tên miền sau này
    [[ -n "$(get_env AUTH_USERNAME_DOMAIN)" ]] || set_env AUTH_USERNAME_DOMAIN "$PD"
    PROFILES=(--profile https) ;;
  stream) PROFILES=(--profile stream) ;;
  server) ;;
  *) echo "Chế độ không hợp lệ: $MODE"; exit 1 ;;
esac

echo "==> Dọn image cũ không dùng (giải phóng ổ trước khi nạp image mới)"
$DOCKER image prune -af 2>/dev/null | tail -1 || true

echo "==> Nạp image"
for f in image-*.tar.gz; do
  [[ -e "$f" ]] || continue
  gunzip -c "$f" | $DOCKER load
  rm -f "$f"
done

echo "==> Thư mục dữ liệu ./data (xem / sao lưu được ngay trên VPS)"
mkdir -p data
# (dữ liệu cũ trong volume chua-data được chép sang ./data ở bước GitHub Actions trước bước này)
# app chạy bằng user node (uid 1000) → cho quyền ghi
# (chown chạy trong container root để không cần sudo trên VPS)
$DOCKER run --rm --user root --entrypoint chown -v "$DIR/data":/d chua-online:app -R 1000:1000 /d

echo "==> Chạy"
mkdir -p public/assets
$DOCKER compose "${PROFILES[@]}" up -d --no-build --remove-orphans
echo "==> Xoá image cũ của bản trước + cache build"
$DOCKER image prune -af 2>/dev/null | tail -1 || true
$DOCKER builder prune -af >/dev/null 2>&1 || true
$DOCKER images --format '    {{.Repository}}:{{.Tag}}  {{.Size}}'
$DOCKER compose "${PROFILES[@]}" ps

echo
if [[ "$MODE" == "phone" ]]; then
  echo "Điện thoại:  https://$D/doantu?phone=1"
  echo "Admin:       https://$D/admin?token=<ADMIN_TOKEN trong $DIR/.env>"
  echo "Nền tảng:    https://$PD  (dashboard https://$PD/app)"
else
  echo "Admin qua SSH tunnel: ssh -L 8686:127.0.0.1:8686 <user>@<VPS>  →  http://localhost:8686/admin?token=..."
fi

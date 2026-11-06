#!/usr/bin/env bash
# Mở chánh điện ra internet qua HTTPS (Caddy + chứng chỉ Let's Encrypt miễn phí).
# Dùng cho chế độ phát bằng điện thoại.
#   sudo bash deploy/setup-https.sh              # tự dùng tên miền miễn phí <ip>.sslip.io
#   sudo bash deploy/setup-https.sh chua.vidu.com  # hoặc tên miền riêng đã trỏ về IP VPS
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  IP="$(curl -fsS4 https://api.ipify.org)"
  DOMAIN="${IP//./-}.sslip.io"
fi
echo "==> Tên miền: $DOMAIN"

# Trang admin sẽ lộ ra internet nên bắt buộc có mật khẩu mạnh
[[ -f .env ]] || cp .env.example .env
TOKEN="$(grep -E '^ADMIN_TOKEN=' .env | head -1 | cut -d= -f2- || true)"
if [[ -z "$TOKEN" || "$TOKEN" == "doi-mat-khau-nay" || ${#TOKEN} -lt 12 ]]; then
  TOKEN="$(openssl rand -hex 12)"
  if grep -qE '^ADMIN_TOKEN=' .env; then sed -i "s/^ADMIN_TOKEN=.*/ADMIN_TOKEN=$TOKEN/" .env; else echo "ADMIN_TOKEN=$TOKEN" >> .env; fi
  echo "==> Đã tạo ADMIN_TOKEN mới trong .env"
fi

echo "==> Cài Caddy"
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

cat >/etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8686
}
CADDY

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp && ufw allow 443/tcp
fi

systemctl reload caddy || systemctl restart caddy
systemctl restart chua-app 2>/dev/null || true

echo
echo "XONG (chứng chỉ HTTPS có thể mất ~30 giây cho lần đầu)."
echo "  Điện thoại mở:  https://$DOMAIN/doantu?phone=1"
echo "  Trang admin:    https://$DOMAIN/admin?token=$TOKEN"
echo "Nếu không vào được: mở cổng 80 và 443 trong tường lửa của nhà cung cấp VPS."

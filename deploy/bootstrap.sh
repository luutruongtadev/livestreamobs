#!/usr/bin/env bash
# Cài trọn gói Chùa Online lên VPS Ubuntu bằng một lệnh (chạy bằng root).
#   Chế độ điện thoại (mặc định):  bash bootstrap.sh
#   Chế độ VPS tự phát 24/7:       MODE=stream bash bootstrap.sh
# Biến tuỳ chọn: TIKTOK_USERNAME, DOMAIN (tên miền riêng), GITHUB_TOKEN (nếu repo private)
set -euo pipefail
REPO="${REPO:-luutruongtadev/livestreamobs}"
DIR="${DIR:-/opt/livestreamobs}"
MODE="${MODE:-phone}"
[[ $EUID -eq 0 ]] || { echo "Hãy chạy bằng root (sudo -i)"; exit 1; }

echo "==> Tải code về $DIR"
apt-get update
apt-get install -y git curl ca-certificates
if [[ -d "$DIR/.git" ]]; then
  git -C "$DIR" pull --ff-only
else
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" "$DIR"
    git -C "$DIR" remote set-url origin "https://github.com/${REPO}.git"   # không lưu token trên VPS
  else
    git clone "https://github.com/${REPO}.git" "$DIR"
  fi
fi
cd "$DIR"

if [[ "$MODE" == "stream" ]]; then
  bash deploy/install-ubuntu.sh
else
  bash deploy/install-ubuntu.sh --phone
fi

if [[ -n "${TIKTOK_USERNAME:-}" ]]; then
  U="${TIKTOK_USERNAME#@}"
  if grep -qE '^TIKTOK_USERNAME=' .env; then sed -i "s/^TIKTOK_USERNAME=.*/TIKTOK_USERNAME=$U/" .env; else echo "TIKTOK_USERNAME=$U" >> .env; fi
fi

if [[ "$MODE" == "stream" ]]; then
  systemctl restart chua-app
  echo "Điền STREAM_SERVER, STREAM_KEY vào $DIR/.env rồi: systemctl enable --now chua-stream"
else
  bash deploy/setup-https.sh ${DOMAIN:-}
fi

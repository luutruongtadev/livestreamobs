#!/usr/bin/env bash
# Cài Chùa Online lên VPS Ubuntu 22.04/24.04 (chạy bằng root): sudo bash deploy/install-ubuntu.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER=chua

echo "==> Gói hệ thống: Node.js 22, ffmpeg, Xvfb, PulseAudio, font"
apt-get update
apt-get install -y curl ca-certificates gnupg ffmpeg xvfb pulseaudio pulseaudio-utils \
  fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> Google Chrome (bản .deb, không dùng snap)"
if ! command -v google-chrome >/dev/null; then
  curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y /tmp/chrome.deb
  rm -f /tmp/chrome.deb
fi

echo "==> User $APP_USER + thư viện Node"
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
cd "$APP_DIR"
[[ -f .env ]] || cp .env.example .env
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev

echo "==> Dịch vụ systemd"
cat >/etc/systemd/system/chua-app.service <<UNIT
[Unit]
Description=Chua Online - server overlay + TikTok listener
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=HOST=127.0.0.1
ExecStart=$(command -v node) server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/systemd/system/chua-stream.service <<UNIT
[Unit]
Description=Chua Online - phat live 24/7 (Chrome + ffmpeg -> RTMP)
After=chua-app.service
Requires=chua-app.service

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=CHROME_BIN=/usr/bin/google-chrome
Environment=XDG_RUNTIME_DIR=/tmp/chua-runtime
ExecStart=/bin/bash $APP_DIR/deploy/stream.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now chua-app.service
echo
echo "Xong. Việc tiếp theo:"
echo "  1) nano $APP_DIR/.env       # điền TIKTOK_USERNAME, ADMIN_TOKEN, STREAM_SERVER, STREAM_KEY"
echo "  2) systemctl restart chua-app && systemctl enable --now chua-stream"
echo "  3) Xem log: journalctl -u chua-stream -f"

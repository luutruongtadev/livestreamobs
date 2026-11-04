#!/bin/bash
# Hẹn giờ tắt MacBook sau khi kết thúc live (chạy MỘT LẦN trên máy Mac, mỗi ngày tự chạy).
#
#   bash hen-gio-tat-may.sh            # mặc định 01:02 mỗi ngày (server chào tạm biệt lúc 01:00, dừng game 01:01)
#   bash hen-gio-tat-may.sh 01:30      # đổi giờ
#   bash hen-gio-tat-may.sh huy        # gỡ hẹn giờ
#   bash hen-gio-tat-may.sh thu        # thử ngay: tắt app phát live rồi TẮT MÁY sau 15 giây
#
# Tới giờ: tắt TikTok LIVE Studio / OBS / Streamlabs (mất tín hiệu → TikTok tự kết thúc live sau ~1–3 phút) rồi tắt máy.
# Nếu lúc đó máy đang ngủ, macOS sẽ chạy bù khi mở máy → script tự bỏ qua nếu đã quá giờ hẹn 20 phút (không tắt máy bất ngờ).
set -euo pipefail

LABEL="vn.livestream.tat-may"
DIR="$HOME/Library/Application Support/livestream-tat-may"
JOB="$DIR/tat-may.sh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SUDOERS="/etc/sudoers.d/livestream-tat-may"
ARG="${1:-01:02}"

uninstall() {
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  rm -rf "$DIR"
  if [ -f "$SUDOERS" ]; then echo "Cần mật khẩu máy để gỡ quyền tắt máy:"; sudo rm -f "$SUDOERS"; fi
}

if [ "$ARG" = "huy" ]; then uninstall; echo "✅ Đã gỡ hẹn giờ tắt máy."; exit 0; fi
if [ "$ARG" = "thu" ]; then
  [ -x "$JOB" ] || { echo "Chưa cài. Chạy: bash $0 trước."; exit 1; }
  echo "Thử: tắt app phát live rồi tắt máy sau 15 giây (Ctrl+C để huỷ)…"; sleep 5
  FORCE=1 "$JOB"; exit 0
fi

if ! [[ "$ARG" =~ ^([01]?[0-9]|2[0-3]):([0-5][0-9])$ ]]; then echo "Giờ không hợp lệ: $ARG (dạng HH:MM, vd 01:02)"; exit 1; fi
H=$((10#${BASH_REMATCH[1]})); M=$((10#${BASH_REMATCH[2]}))

mkdir -p "$DIR" "$HOME/Library/LaunchAgents"

# 1) Script chạy lúc hẹn giờ
cat > "$JOB" <<EOF
#!/bin/bash
# Tự sinh bởi hen-gio-tat-may.sh — tắt app phát live rồi tắt máy
TARGET=$((H * 60 + M))
NOW=\$((10#\$(date +%H) * 60 + 10#\$(date +%M)))
DIFF=\$(( (NOW - TARGET + 1440) % 1440 ))
if [ -z "\${FORCE:-}" ] && [ "\$DIFF" -gt 20 ]; then
  echo "\$(date) bỏ qua: đã quá giờ hẹn \$DIFF phút (máy vừa thức dậy)"; exit 0
fi
echo "\$(date) kết thúc live: tắt app phát live + tắt máy"
for app in "TikTok LIVE Studio" "OBS" "Streamlabs" "Streamlabs Desktop"; do pkill -TERM -f "\$app" 2>/dev/null; done
pkill -TERM -x obs 2>/dev/null
sleep 15
sudo -n /sbin/shutdown -h now || osascript -e 'tell application "System Events" to shut down'
EOF
chmod +x "$JOB"

# 2) Cho phép tắt máy không cần nhập mật khẩu (chỉ lệnh shutdown)
echo "Cần mật khẩu máy MỘT LẦN để cho phép hẹn giờ tắt máy:"
TMP="$(mktemp)"
echo "$(id -un) ALL=(root) NOPASSWD: /sbin/shutdown" > "$TMP"
sudo visudo -cf "$TMP" >/dev/null
sudo install -m 0440 -o root -g wheel "$TMP" "$SUDOERS"
rm -f "$TMP"

# 3) Hẹn giờ mỗi ngày bằng launchd
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$JOB</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>$H</integer><key>Minute</key><integer>$M</integer></dict>
  <key>StandardOutPath</key><string>$DIR/log.txt</string>
  <key>StandardErrorPath</key><string>$DIR/log.txt</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

printf '✅ Xong! Mỗi ngày %02d:%02d MacBook sẽ tắt app phát live rồi tắt máy.\n' "$H" "$M"
echo "   Nhớ: cắm sạc và không gập máy (máy ngủ thì không tự tắt được)."
echo "   Thử ngay: bash $0 thu   ·   Gỡ: bash $0 huy   ·   Nhật ký: $DIR/log.txt"

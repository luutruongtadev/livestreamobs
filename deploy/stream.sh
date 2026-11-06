#!/usr/bin/env bash
# Phát live 24/7 không cần máy tính: Xvfb (màn hình ảo) + Chromium hiển thị game Đoán từ
# + PulseAudio (thu tiếng mõ/chuông) + ffmpeg đẩy RTMP lên TikTok.
set -uo pipefail

PAGE_URL="${PAGE_URL:-http://127.0.0.1:8686/${PAGE:-doantu}?phone=0}"
W="${STREAM_WIDTH:-1080}"
H="${STREAM_HEIGHT:-1920}"
FPS="${STREAM_FPS:-30}"
VB="${VIDEO_BITRATE:-4500k}"
AB="${AUDIO_BITRATE:-128k}"
PRESET="${X264_PRESET:-veryfast}"
DISP="${DISPLAY_NUM:-99}"
CHROME="${CHROME_BIN:-$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)}"
PROFILE="${CHROME_PROFILE:-/tmp/chua-chrome}"

# Đích phát: RTMP_URL đầy đủ, hoặc STREAM_SERVER + STREAM_KEY, hoặc TEST_OUTPUT (ghi ra file để thử)
if [[ -z "${RTMP_URL:-}" && -n "${STREAM_SERVER:-}" && -n "${STREAM_KEY:-}" ]]; then
  RTMP_URL="${STREAM_SERVER%/}/${STREAM_KEY}"
fi
if [[ -n "${TEST_OUTPUT:-}" ]]; then
  OUT=(-t "${TEST_SECONDS:-20}" -f flv "$TEST_OUTPUT")
elif [[ -n "${RTMP_URL:-}" ]]; then
  OUT=(-f flv "$RTMP_URL")
else
  echo "[stream] Chưa có STREAM_SERVER + STREAM_KEY (hoặc RTMP_URL) trong .env — chưa phát. Chờ 10 phút rồi thoát."
  sleep 600; exit 1
fi
[[ -x "$CHROME" ]] || { echo "[stream] Không tìm thấy Chromium (đặt CHROME_BIN)"; exit 1; }

export DISPLAY=":$DISP"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/chua-runtime}"
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"

PIDS=()
cleanup() { echo "[stream] dừng"; kill "${PIDS[@]}" 2>/dev/null; pulseaudio --kill 2>/dev/null; exit 0; }
trap cleanup INT TERM

echo "[stream] Màn hình ảo ${W}x${H}"
rm -f "/tmp/.X${DISP}-lock"
Xvfb "$DISPLAY" -screen 0 "${W}x${H}x24" -nolisten tcp -ac >/dev/null 2>&1 &
PIDS+=($!)
sleep 1

echo "[stream] PulseAudio sink 'chua'"
pulseaudio --kill >/dev/null 2>&1 || true
pulseaudio -D --exit-idle-time=-1 --disallow-exit --log-target=stderr >/dev/null 2>&1
for _ in 1 2 3 4 5; do pactl info >/dev/null 2>&1 && break; sleep 1; done
pactl load-module module-null-sink sink_name=chua sink_properties=device.description=chua >/dev/null
pactl set-default-sink chua

# Chờ server sẵn sàng
for _ in $(seq 1 60); do curl -fsS -o /dev/null "$PAGE_URL" && break; echo "[stream] chờ $PAGE_URL ..."; sleep 2; done

echo "[stream] Mở $PAGE_URL"
rm -rf "$PROFILE"
"$CHROME" --kiosk --app="$PAGE_URL" \
  --window-position=0,0 --window-size="${W},${H}" \
  --user-data-dir="$PROFILE" \
  --autoplay-policy=no-user-gesture-required \
  --no-first-run --no-default-browser-check --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --disable-translate --disable-features=Translate,MediaRouter \
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \
  --lang=vi --hide-scrollbars --password-store=basic --use-gl=swiftshader --enable-unsafe-swiftshader \
  ${CHROME_FLAGS:-} >/tmp/chua-chrome.log 2>&1 &
CHROME_PID=$!
PIDS+=($CHROME_PID)
sleep "${WARMUP_SECONDS:-8}"

echo "[stream] Bắt đầu phát ${W}x${H}@${FPS} ${VB} → ${RTMP_URL:-$TEST_OUTPUT}" | sed -E 's#(rtmps?://[^ ]*/)[^ /]+$#\1*****#'
while true; do
  if ! kill -0 "$CHROME_PID" 2>/dev/null; then echo "[stream] Chromium đã tắt — khởi động lại toàn bộ"; cleanup; exit 1; fi
  ffmpeg -hide_banner -loglevel warning -stats_period 30 \
    -thread_queue_size 1024 -f x11grab -draw_mouse 0 -video_size "${W}x${H}" -framerate "$FPS" -i "$DISPLAY" \
    -thread_queue_size 1024 -f pulse -i chua.monitor \
    -c:v libx264 -preset "$PRESET" -pix_fmt yuv420p -r "$FPS" -g "$((FPS * 2))" -keyint_min "$((FPS * 2))" \
    -b:v "$VB" -maxrate "$VB" -bufsize "$(( ${VB%k} * 2 ))k" \
    -c:a aac -b:a "$AB" -ar 44100 -ac 2 \
    "${OUT[@]}"
  code=$?
  [[ -n "${TEST_OUTPUT:-}" ]] && { echo "[stream] Đã ghi thử $TEST_OUTPUT (mã $code)"; cleanup; }
  echo "[stream] ffmpeg thoát (mã $code) — nối lại sau 5s"
  sleep 5
done

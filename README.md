# ☸ Chùa Online — TikTok Live tương tác "Xây Chùa"

Overlay livestream tương tác kiểu **Viếng chùa / Xây chùa online**, chạy self-hosted, mã nguồn mở, không tốn phí.
Người xem thả tim, bình luận, chia sẻ, tặng quà → tích **công đức** → chùa được **xây dần qua 8 cấp** ngay trên live.

```
TikTok Live ──(WebSocket, tiktok-live-connector)──► Node.js server ──(WebSocket)──► Overlay Canvas ──► OBS ──RTMP──► TikTok
                                                        │
                                                        └── /admin: kết nối, giả lập sự kiện, reset
```

## Tính năng

| Tương tác người xem | Hiệu ứng trên live | Công đức mặc định |
|---|---|---|
| Thả tim ❤️ | Gõ mõ (tiếng mõ gỗ) | +1 / tim |
| Bình luận `gõ mõ` | Gõ mõ | +3 |
| Bình luận `thắp nhang` | Cắm thêm nén nhang, khói bay | +3 |
| Bình luận `thỉnh chuông` | Đại hồng chung đung đưa, ngân vang | +3 |
| Bình luận `xin quẻ` | Hiện thẻ quẻ ngẫu nhiên | +3 |
| Bình luận `cầu an …`, `cầu nguyện …` | Thả đèn trời mang lời nguyện bay lên | +3 |
| Bình luận thường | +1 bay lên | +1 |
| Chia sẻ | Thỉnh chuông | +10 |
| Theo dõi | Treo đèn lồng đỏ có tên người theo dõi | +20 |
| Tặng quà 🎁 | Thông báo vinh danh + hiệu ứng theo giá trị: hoa rơi → hoa sen → hào quang vàng → **tượng Phật hiện hào quang** | +10 / kim cương |

- **8 cấp chùa** tự vẽ bằng Canvas (không cần ảnh): Đất phát tâm → Am tranh → Chùa gỗ → Chùa ngói → Gác chuông → Bảo tháp → Đại chùa ba tầng mái → Đại tùng lâm. Lên cấp có hiệu ứng xây dựng + chuông lớn.
- **Bảng vàng công đức** top 6, có avatar TikTok.
- Trời **ngày / hoàng hôn / đêm** theo giờ thật (hoặc cố định qua URL).
- Âm thanh **tự tổng hợp bằng WebAudio** (mõ, đại hồng chung, chuông nhỏ). Có thể thay bằng file mp3 riêng.
- Chống spam: mỗi người chỉ được cộng công đức bình luận 1 lần / 3 giây.
- Combo quà (Rose x10…) chỉ tính một lần khi kết thúc combo, đúng số lượng.
- Công đức **lưu vào `data/state.json`**, tắt máy mở lại vẫn còn.
- Tự kết nối lại khi rớt mạng / khi live kết thúc / khi chủ kênh chưa lên live.

## Hai giao diện

| Trang | Mô tả |
|---|---|
| `/chanhdien` | **Chánh điện**: tượng Phật lớn, bàn thờ, lư hương. Mỗi người xem tương tác thành một phật tử chibi quỳ trên sàn, có thẻ tên + avatar, bình luận hiện thành bong bóng trên đầu. Bảng công đức bên trái, bảng "Cách tham gia" bên phải, dòng "N phật tử đang lễ Phật trong chánh điện". |
| `/overlay` | **Xây chùa**: chùa ngoài trời được xây qua 8 cấp theo tổng công đức. |

### Chánh điện hoạt động thế nào

- **Bình luận bất kỳ** → vào chùa (đi từ dưới lên chỗ ngồi), lời bình luận hiện trên đầu 6 giây.
- **Thắp hương** → cúi lạy, nén hương bay lên cắm vào lư, khói bốc lên trước tượng.
- **Xin xăm / xin quẻ** → thẻ quẻ hiện giữa màn hình (có thể đọc to với `?tts=1`).
- **Nam mô… / cầu…** → thả đèn lồng mang lời khấn bay lên.
- **Thả tim** → gõ mõ, **Follow / Chia sẻ** → thỉnh chuông.
- **Mọi món quà** → nén hương lên bàn thờ + thông báo "Xướng danh công đức". **Rose / Love you so much** → hoa sen bay lên đặt dưới toà sen. **Finger Heart** → mưa hoa. **≥100 xu** → hào quang vàng. **≥1000 xu** → hào quang rực rỡ + mưa hoa sen.
- Phật tử **xếp chỗ theo công đức**: người đứng đầu ngồi **đài sen vàng** ngay trước bàn thờ ("Đệ nhất công đức"), các hàng trên gần Phật hơn.
- Ai không tương tác quá `hall.presenceMinutes` phút (mặc định 15) sẽ lặng lẽ rời chánh điện. Tối đa `hall.maxWorshippers` người (mặc định 60).

Tuỳ chọn URL riêng: `?tts=1` (đọc tên người dâng quà bằng giọng tiếng Việt của trình duyệt, OBS có thể không hỗ trợ), `?bg=assets/chanh-dien.jpg` (dùng ảnh nền tự vẽ/AI thay cho cảnh vẽ bằng code, đặt file trong `public/assets/`), `?guide=0`, `?board=0`, `?mute=1`, `?debug=1`, `?phone=1` / `?phone=0` (bật / tắt hẳn chế độ điện thoại; trang tự bật khi mở toàn màn hình nên OBS/Chrome kiosk trên VPS cần `?phone=0`).

Nội dung bảng "Cách tham gia", tiêu đề bảng công đức, quà nào ra hiệu ứng gì đều chỉnh trong `config.json` → `hall.guide`, `hall.giftGuide`, `hall.leaderboardTitle`, `giftEffects` (`{"Tên quà gốc tiếng Anh": "petals" | "lotus" | "golden" | "buddha"}`).

## Cài đặt

Yêu cầu: **Node.js 22+** (bản cũ hơn sẽ báo lỗi `Invalid regular expression flags`), OBS Studio.

```bash
git clone https://github.com/luutruongtadev/livestreamobs.git
cd livestreamobs
npm install
npm start
```

Mở:

- Bảng điều khiển: <http://127.0.0.1:8686/admin>
- Chánh điện: <http://127.0.0.1:8686/chanhdien>
- Xây chùa: <http://127.0.0.1:8686/overlay>

Ở trang admin, nhập TikTok username (không cần `@`) và bấm **Kết nối** — tài khoản phải **đang phát live**.
Chưa live vẫn test được bằng các nút **Giả lập sự kiện** (hoặc bật *Tự động bắn sự kiện ngẫu nhiên*).

## Đưa lên OBS → TikTok

1. OBS → *Settings → Video*: Base/Output resolution **1080×1920** (dọc).
2. *Sources → + → Browser*:
   - URL: `http://127.0.0.1:8686/chanhdien` (hoặc `/overlay`)
   - Width **1080**, Height **1920**
   - Tích **Control audio via OBS** (để thu tiếng mõ/chuông vào live).
3. Phát lên TikTok: dùng **TikTok LIVE Studio** (thêm nguồn từ OBS Virtual Camera / cửa sổ OBS) hoặc dùng **Stream Key (RTMP)** nếu tài khoản được cấp: *OBS → Settings → Stream → Custom*, dán Server URL và Stream Key lấy từ TikTok.

### Tuỳ chọn URL overlay

| Tham số | Ý nghĩa |
|---|---|
| `?sky=day` / `dusk` / `night` | Cố định bầu trời (mặc định theo giờ máy) |
| `?transparent=1` | Bỏ trời & núi (nền trong suốt, ghép lên video/camera riêng) |
| `?scene=0` | Chỉ hiện HUD + hiệu ứng, không vẽ chùa |
| `?mute=1` | Tắt âm thanh |
| `?hints=0` | Ẩn dòng hướng dẫn lệnh bình luận |
| `?debug=1` | Hiện FPS và trạng thái kết nối |

Có thể ghép: `/overlay?sky=night&hints=0`.

## Triển khai lên VPS & phát live 24/7

Có 2 cách dùng VPS:

| Cách | Ai phát lên TikTok | Khi nào dùng |
|---|---|---|
| **A. Phát 24/7 từ VPS** | VPS tự mở Chrome ẩn hiển thị chánh điện, ffmpeg quay lại và đẩy RTMP lên TikTok | Muốn chùa live liên tục, tắt máy tính vẫn chạy |
| **B. VPS chỉ chạy server** | OBS trên máy bạn (Browser Source trỏ tới VPS) | Muốn ghép camera/micro, chỉnh cảnh trong OBS |

Hai cách dùng chung một bộ cài; cách B chỉ không bật dịch vụ phát.

```
VPS ─┬─ chua-app     (Node: nghe TikTok, tính công đức, phục vụ /chanhdien, /admin)
     └─ chua-stream  (Xvfb + Chrome hiển thị /chanhdien + PulseAudio + ffmpeg ──RTMP──► TikTok)
```

### 1. Chuẩn bị

- **VPS**: Ubuntu 22.04/24.04. Phát 1080×1920@30fps cần **4 vCPU / 4 GB RAM** (x264 mã hoá bằng CPU). VPS 2 vCPU thì đặt `STREAM_WIDTH=720`, `STREAM_HEIGHT=1280`, `VIDEO_BITRATE=2500k`. Upload ổn định ≥ 6 Mbps. Nên chọn VPS ở Singapore/Việt Nam cho gần máy chủ TikTok.
- **Stream key TikTok**: mở TikTok LIVE Studio / LIVE Producer, chọn phát bằng phần mềm bên thứ ba (OBS), copy **Server URL** và **Stream Key**.
  - Không phải tài khoản nào cũng được TikTok cấp stream key (tuỳ khu vực, số follower, lịch sử tài khoản).
  - Stream key thường **đổi mỗi phiên live**: lần nào tạo phiên mới thì cập nhật `.env` rồi khởi động lại dịch vụ phát.

### 2. Cài đặt (Ubuntu + systemd)

```bash
ssh root@IP_VPS
git clone https://github.com/luutruongtadev/livestreamobs.git /opt/livestreamobs
cd /opt/livestreamobs
sudo bash deploy/install-ubuntu.sh      # cài Node 22, Chrome, ffmpeg, Xvfb, PulseAudio, font, tạo dịch vụ
nano .env                               # điền TIKTOK_USERNAME, ADMIN_TOKEN, STREAM_SERVER, STREAM_KEY
systemctl restart chua-app
systemctl enable --now chua-stream      # bắt đầu phát (bỏ qua bước này nếu dùng cách B)
journalctl -u chua-stream -f            # xem log phát
```

### 2'. Hoặc dùng Docker (khuyên dùng)

```bash
git clone https://github.com/luutruongtadev/livestreamobs.git && cd livestreamobs
TIKTOK_USERNAME=ten_kenh bash deploy/docker-init.sh phone    # hoặc: server | stream
```

`docker-init.sh` tự cài Docker nếu thiếu, tạo `.env`, sinh `ADMIN_TOKEN`, rồi chạy `docker compose`:

| Chế độ | Container | Dùng khi |
|---|---|---|
| `phone` | `app` + `caddy` (HTTPS, tên miền miễn phí `IP.sslip.io` hoặc `DOMAIN` riêng) | Phát bằng điện thoại |
| `server` | `app` (chỉ mở `127.0.0.1:8686`) | OBS / LIVE Studio ở máy khác qua SSH tunnel |
| `stream` | `app` + `streamer` (Chromium + ffmpeg → RTMP) | Có stream key, VPS tự phát 24/7 |

- Image `app` chỉ có Node (nhẹ); `streamer` mới cài Chromium/ffmpeg.
- Công đức lưu trong volume `chua-data` (không mất khi cập nhật). Sửa `config.json` rồi `docker compose restart app`.
- Container `app` không chạy nếu `ADMIN_TOKEN` trống/yếu (vì trang admin có thể lộ ra internet qua HTTPS).
- Cập nhật: `git pull && bash deploy/docker-init.sh <chế độ>`. Xem log: `docker compose logs -f app`.

### Phát bằng điện thoại (không cần stream key, không cần Windows)

VPS Linux chạy server và mở trang chánh điện qua HTTPS. Điện thoại Android mở trang đó toàn màn hình, rồi dùng app TikTok chia sẻ màn hình lên live.

**Cài đặt bằng một lệnh**, SSH vào VPS bằng root rồi chạy:

```bash
export TIKTOK_USERNAME=ten_kenh            # không cần @
export GITHUB_TOKEN=github_pat_xxx         # chỉ cần khi repo đang private
curl -fsSL -H "Authorization: token $GITHUB_TOKEN" \
  https://raw.githubusercontent.com/luutruongtadev/livestreamobs/master/deploy/bootstrap.sh | bash
```

Lệnh này lần lượt:
- tải code về `/opt/livestreamobs`,
- cài Node.js và dịch vụ `chua-app`,
- cài Caddy và xin chứng chỉ HTTPS cho tên miền miễn phí `IP-VPS.sslip.io` (muốn dùng tên miền riêng thì thêm `export DOMAIN=chua.vidu.com`),
- tạo mật khẩu admin.

Cuối cùng lệnh in ra hai đường link: link cho điện thoại và link trang admin. Nhà cung cấp VPS phải mở cổng **80 và 443**.

**Trên điện thoại** (Android):

1. Mở Chrome vào `https://IP-VPS.sslip.io/chanhdien?phone=1`. Bấm menu ⋮ → **Thêm vào màn hình chính** để trang chạy toàn màn hình, không có thanh địa chỉ.
2. Mở trang từ biểu tượng *Chánh điện* vừa tạo, rồi bấm **🙏 Bắt đầu**. Nút này bật toàn màn hình, bật âm thanh và giữ màn hình luôn sáng.
3. Bật **Không làm phiền** và cắm sạc.
4. Mở app TikTok → **LIVE** → chọn **Mobile gaming / Chia sẻ màn hình** → Go LIVE, rồi quay lại trang Chánh điện.

Có thể thu được tiếng mõ/chuông qua chia sẻ màn hình hay không là tuỳ máy và phiên bản Android. Nếu live không có tiếng, bật loa ngoài để micro thu lại.

### VPS Windows (dùng TikTok LIVE Studio, không cần stream key)

Trên Windows, mọi thứ chạy trên cùng một VPS:

```
Server Node (công đức, /chanhdien)
  → OBS Browser Source 1080×1920
  → OBS Virtual Camera + âm thanh qua VB-CABLE
  → TikTok LIVE Studio
  → TikTok
```

**Cấu hình VPS**: Windows Server 2019/2022 hoặc Windows 10/11, tối thiểu **4 vCPU / 8 GB RAM**. VPS không có GPU thì OBS và LIVE Studio phải dựng hình bằng CPU, có thể giật. Nếu OBS báo *"Failed to initialize video"* thì cần VPS có GPU.

**1. Cài đặt** (đăng nhập VPS bằng Remote Desktop):

1. Cài [Google Chrome](https://www.google.com/chrome/) và [Git](https://git-scm.com/download/win). Có thể bỏ qua Git nếu tải repo dạng ZIP: trên GitHub bấm *Code → Download ZIP*.
2. Lấy code: `git clone https://github.com/luutruongtadev/livestreamobs.git C:\livestreamobs`
3. Vào thư mục `C:\livestreamobs\deploy\windows`, chuột phải **`install.bat` → Run as administrator**. Script sẽ:
   - bật dịch vụ âm thanh,
   - cài Node.js 22,
   - chạy `npm ci`,
   - tạo file `.env`,
   - đặt server tự chạy khi đăng nhập Windows.
4. Mở `C:\livestreamobs\.env` bằng Notepad, điền `TIKTOK_USERNAME` và `ADMIN_TOKEN`.
5. Chạy **`start-chua.bat`** (giữ cửa sổ này mở). Kiểm tra bằng cách mở `http://localhost:8686/admin?token=...` trong Chrome.
   - Khi có `TIKTOK_USERNAME`, server tự kết nối và tự thử lại cho tới khi kênh lên live.

**2. OBS: dựng hình chánh điện**

1. Cài [OBS Studio](https://obsproject.com/) và [VB-CABLE](https://vb-audio.com/Cable/). Cài VB-CABLE xong thì khởi động lại VPS.
2. OBS → *Settings → Video*: Base và Output đều là **1080x1920**, FPS 30.
3. Thêm **Browser Source**:
   - URL `http://localhost:8686/chanhdien`
   - Width 1080, Height 1920
   - tích **Control audio via OBS**
4. Đưa âm thanh sang LIVE Studio:
   - *Settings → Audio → Advanced → Monitoring Device* = **CABLE Input**.
   - Trong Audio Mixer, bấm ⚙ của Browser Source → *Advanced Audio Properties* → *Audio Monitoring* = **Monitor and Output**.
5. Bấm **Start Virtual Camera**.

**3. TikTok LIVE Studio: phát lên TikTok**

1. Tải từ nút *Get LIVE Studio* trong LIVE Center rồi đăng nhập.
2. Chọn khung **dọc (Portrait)**.
3. Thêm nguồn **Camera / Video capture device → OBS Virtual Camera**, kéo cho đầy khung.
4. Thêm âm thanh: chọn micro là **CABLE Output (VB-Audio Virtual Cable)**. Tắt micro thật nếu không dùng.
5. Đặt tiêu đề rồi bấm **Go LIVE**.

Tài khoản đã có stream key thì bỏ qua LIVE Studio: dùng OBS → *Settings → Stream → Custom*, dán Server URL + Stream Key, rồi *Start Streaming*.

**4. Thoát Remote Desktop mà vẫn giữ live**

Đừng bấm X để đóng Remote Desktop. Hãy chuột phải **`deploy\windows\disconnect-keep-live.bat` → Run as administrator**. Script này ngắt kết nối nhưng giữ màn hình VPS hoạt động, để OBS và LIVE Studio không bị đen hình. Lần sau cứ Remote Desktop vào lại bình thường.

### 3. Điều khiển từ xa (trang admin)

Server chỉ mở trên `127.0.0.1` của VPS, không lộ ra internet. Vào admin bằng SSH tunnel từ máy bạn:

```bash
ssh -L 8686:127.0.0.1:8686 root@IP_VPS
```

Rồi mở <http://localhost:8686/admin?token=ADMIN_TOKEN> trên máy bạn. Trang này dùng để kết nối TikTok, giả lập sự kiện và xem trước.

**Cách B (OBS ở nhà)**: giữ SSH tunnel đó và đặt Browser Source trong OBS là `http://localhost:8686/chanhdien`.

### 4. Vận hành hằng ngày

| Việc | Lệnh (systemd) | Lệnh (Docker) |
|---|---|---|
| Đổi stream key | sửa `.env` → `systemctl restart chua-stream` | sửa `.env` → `docker compose up -d` |
| Dừng phát | `systemctl stop chua-stream` | `docker compose stop streamer` |
| Sửa `config.json` | `systemctl restart chua-app` | `docker compose restart app` |
| Cập nhật code | `git pull && npm ci --omit=dev && systemctl restart chua-app chua-stream` | `git pull && docker compose up -d --build` |
| Thử luồng phát, ghi ra file 20 giây | `sudo -u chua env TEST_OUTPUT=/tmp/test.flv CHROME_BIN=/usr/bin/google-chrome bash deploy/stream.sh` | |

Dịch vụ phát tự nối lại khi RTMP rớt (5 giây), tự khởi động lại toàn bộ khi Chrome bị tắt, và tự chạy lại khi VPS reboot.

### Lưu ý khi phát 24/7

- TikTok có thể hạn chế phòng live chạy lặp hoặc không có người dẫn ("unoriginal / static content"). Nên có người trực tương tác, đổi cảnh/âm thanh định kỳ, và không để phòng trống hàng giờ.
- Âm thanh lấy trực tiếp từ trang (tiếng mõ, chuông, nhạc nền nếu đặt `sounds.ambient`). Muốn có tiếng tụng kinh nền thì đặt file vào `public/assets/` và khai báo trong `config.json`.

## Cấu hình (`config.json`)

Muốn chỉnh mà không sửa file gốc, tạo `config.local.json` (đã gitignore) chỉ chứa phần cần ghi đè, ví dụ:

```json
{
  "tiktokUsername": "ten_kenh_cua_ban",
  "templeName": "Chùa Phúc Lâm Online",
  "merit": { "perDiamond": 20 }
}
```

| Khoá | Ý nghĩa |
|---|---|
| `tiktokUsername`, `autoConnect` | Tự kết nối khi khởi động server |
| `signApiKey` | API key Euler Stream (không bắt buộc, giúp kết nối ổn định hơn khi bị giới hạn) |
| `server.host` / `server.port` | Mặc định `127.0.0.1:8686`. Chạy VPS thì đặt `0.0.0.0` **và** đặt `adminToken` |
| `hall` | Cấu hình chánh điện (xem phần trên); `joinOnMember: true` để người vừa vào phòng live cũng hiện trong chánh điện (dễ quá tải với phòng đông) |
| `server.adminToken` | Bảo vệ API admin. Mở admin bằng `/admin?token=...` |
| `merit` | Điểm công đức cho từng loại tương tác |
| `commentCooldownSec` | Giãn cách cộng công đức bình luận / người |
| `commands` | Lệnh bình luận: keyword so khớp **không dấu, nguyên từ** (`mo` khớp "gõ mõ" nhưng không khớp "một") |
| `levels` | Tên và mốc công đức của từng cấp chùa (8 cấp ứng với 8 kiểu hình vẽ) |
| `giftTiers` | Mốc kim cương → hiệu ứng (`petals`, `lotus`, `golden`, `buddha`) và động từ hiển thị |
| `giftNames` | Việt hoá tên quà |
| `fortunes` | Danh sách quẻ |
| `sounds` | Đường dẫn file âm thanh tuỳ chỉnh, đặt trong `public/` (vd `"mo": "assets/mo.mp3"`). Có `ambient` để phát nhạc nền tụng kinh lặp lại |

Biến môi trường cũng được hỗ trợ: `TIKTOK_USERNAME`, `SIGN_API_KEY`, `HOST`, `PORT`, `ADMIN_TOKEN`.

## Cấu trúc mã

```
server/
  index.js    HTTP + WebSocket hub, API admin, lưu state
  tiktok.js   Kết nối TikTok Live, chuẩn hoá payload, tự kết nối lại
  temple.js   Luật game: công đức, cấp chùa, bảng vàng, lệnh bình luận
  text.js     Bỏ dấu tiếng Việt, so khớp keyword
public/
  overlay.html, js/overlay.js   Vòng lặp vẽ, hiệu ứng, HUD
  js/scene.js                   Vẽ trời, núi, chùa 8 cấp, lư hương, mõ, chuông
  js/sound.js                   Âm thanh WebAudio
  chanhdien.html, js/hall.js    Chánh điện: phật tử, bảng công đức, hiệu ứng
  js/hall-scene.js              Vẽ tượng Phật, khám thờ, bàn thờ, sàn, phật tử chibi
  admin.html                    Bảng điều khiển
test/temple.test.js             npm test
deploy/stream.sh                Phát 24/7: Xvfb + Chrome + PulseAudio + ffmpeg -> RTMP
deploy/bootstrap.sh             Cài trọn gói một lệnh (mặc định: chế độ điện thoại)
deploy/install-ubuntu.sh        Cài lên VPS Ubuntu + dịch vụ systemd (--phone: chỉ server)
deploy/setup-https.sh           Caddy + HTTPS (tên miền miễn phí sslip.io) cho điện thoại
deploy/windows/                 Cài và chạy trên VPS Windows (install.bat, start-chua.bat, disconnect-keep-live.bat)
Dockerfile, docker-compose.yml  Docker: app (nhẹ) / caddy (HTTPS) / streamer (RTMP), xem deploy/docker-init.sh
```

## Khi TikTok đổi giao thức

Thư viện [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector) là API không chính thức (reverse-engineered). Khi bị đứt kết nối hàng loạt:

1. `npm update tiktok-live-connector` (thường được vá nhanh).
2. Nếu bị giới hạn ký (sign) → đăng ký API key miễn phí ở Euler Stream và điền `signApiKey`.
3. Payload chỉ được đọc trong `server/tiktok.js` (`normalizeUser`, `normalizeGift`) — sửa ở đó nếu tên trường thay đổi.

## Lưu ý

- Dùng API không chính thức có thể vi phạm điều khoản TikTok; tự cân nhắc rủi ro tài khoản.
- Nội dung tâm linh nên giữ sự trang nghiêm, minh bạch về việc quà tặng là ủng hộ kênh, không phải cúng dường thật cho một ngôi chùa cụ thể.

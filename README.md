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

## Cài đặt

Yêu cầu: **Node.js 20+**, OBS Studio.

```bash
git clone https://github.com/luutruongtadev/livestreamobs.git
cd livestreamobs
npm install
npm start
```

Mở:

- Bảng điều khiển: <http://127.0.0.1:8686/admin>
- Overlay: <http://127.0.0.1:8686/overlay>

Ở trang admin, nhập TikTok username (không cần `@`) và bấm **Kết nối** — tài khoản phải **đang phát live**.
Chưa live vẫn test được bằng các nút **Giả lập sự kiện** (hoặc bật *Tự động bắn sự kiện ngẫu nhiên*).

## Đưa lên OBS → TikTok

1. OBS → *Settings → Video*: Base/Output resolution **1080×1920** (dọc).
2. *Sources → + → Browser*:
   - URL: `http://127.0.0.1:8686/overlay`
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
  admin.html                    Bảng điều khiển
test/temple.test.js             npm test
```

## Khi TikTok đổi giao thức

Thư viện [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector) là API không chính thức (reverse-engineered). Khi bị đứt kết nối hàng loạt:

1. `npm update tiktok-live-connector` (thường được vá nhanh).
2. Nếu bị giới hạn ký (sign) → đăng ký API key miễn phí ở Euler Stream và điền `signApiKey`.
3. Payload chỉ được đọc trong `server/tiktok.js` (`normalizeUser`, `normalizeGift`) — sửa ở đó nếu tên trường thay đổi.

## Lưu ý

- Dùng API không chính thức có thể vi phạm điều khoản TikTok; tự cân nhắc rủi ro tài khoản.
- Nội dung tâm linh nên giữ sự trang nghiêm, minh bạch về việc quà tặng là ủng hộ kênh, không phải cúng dường thật cho một ngôi chùa cụ thể.

# Studio — widget + âm thanh dùng chung mọi game

Studio là "phòng điều khiển" của kênh, nằm **ngoài** game:
- **Widget**: mục tiêu, thông báo quà, bảng xếp hạng, bảng quà, bình luận, bộ đếm, chữ / banner. Streamer kéo thả các widget này lên khung 9:16.
- **Luật âm thanh**: "khi … thì phát …".

Đổi game không mất bố cục. Thêm widget mới không phải sửa game hay nền tảng.

## Luồng dữ liệu
```
TikTok → gateway ─┬─ ev (overlay chính) ──► game + widget + luật âm thanh
                  ├─ sx (overlay khác: xem trước, chỉ-widget) ──► widget
                  └─ st (~2 lần/giây khi đổi) số liệu phiên: xu, tim, follow, share, bình luận, top tặng quà, BXH tuần
dashboard ── studio (lưu) ──► gateway kiểm tra (checkStudio) ──► channels.studio ──► {t:'studio'} tới overlay (game KHÔNG nạp lại)
```
- **Ai đếm:** gateway đếm số liệu phiên (`SessionStats`), nên mọi overlay thấy cùng một con số. Nút "Đặt lại số liệu" (`stats-reset`) đưa về 0.
- **Bảng âm thanh (soundboard):** nút trên tab Điều khiển gọi thao tác `sfx` → gateway gửi `{t:'sfx'}` → overlay chính phát ngay. Giới hạn 5 âm mỗi giây mỗi kênh. Thư viện có 46 âm chia 6 nhóm (`SOUND_GROUPS` trong `web/js/sounds.js`).
- **Nơi phát âm thanh:** chỉ overlay chính, tức thứ OBS / LIVE Studio thu. Overlay "chỉ widget" phát âm thanh khi thêm `&sound=1`. Giới hạn tối đa 4 âm mỗi giây.
- **Luật âm thanh dùng lại trigger của SDK** (`createTriggers`): một món quà khớp tối đa một luật quà, theo tên trước rồi theo số xu. Riêng `{ type: 'goal', goal? }` kích hoạt khi một widget Mục tiêu đạt.

## Link overlay theo lớp
| Link | Nội dung |
|---|---|
| `/o/<key>` | Game và widget |
| `/o/<key>?layer=game` | Chỉ game |
| `/o/<key>?layer=widgets` | Chỉ widget, nền trong suốt; overlay này không chạy game và không làm leader, nhưng vẫn giữ kết nối TikTok |
| `/o/<key>?widgets=0` | Ẩn widget (trình chỉnh Studio dùng làm nền) |

## Chuẩn widget (`widgets/<id>/`)
```
widgets/<id>/widget.json   { id (= tên thư mục), name, icon, description, size {w,h}, minSize {w,h}, schema (JSON Schema, mọi trường có default) }
widgets/<id>/index.js      export function mount(el, { config, editing, signal }) → { update(data), event(e), destroy() }
```
- **Import được phép:** chỉ `../_lib/ui.js` (gồm `h`, `css`, `avatar`, `fmt`, `color`, `clip`) và `#sdk`. Không đụng DOM khi import; CSS chèn trong `mount`.
- **Kích thước:** `el` là một ô tính theo toạ độ khung 1080×1920 (nền tảng tự co giãn), widget lấp đầy 100%.
- **`update(data)`** nhận `data = { stats: { diamonds, gifts, likes, follows, shares, comments, members, gifters[] }, lb: [{ name, avatar, points }] | null, legend: [{ icon, text, label }] }`.
- **`event(e)`** nhận sự kiện chuẩn hoá: `comment`, `gift`, `follow`, `share`, `member`; không có `like`.
- **`editing: true`** khi widget nằm trong trình chỉnh trên dashboard: hiện dữ liệu mẫu, không báo `signal`.
- **`signal('goal')`** báo nền tảng phát luật âm thanh "Đạt mục tiêu".
- **Cài đặt:** form trên dashboard sinh từ `schema`, gồm `enumNames` (nhãn cho lựa chọn) và `format: "color"` (ô chọn màu). Màu do streamer nhập chỉ nhận dạng `#rgb`, `#rrggbb`, `#rrggbbaa`.
- **Test** (`test/studio.test.js`, tự chạy cho mọi widget): manifest hợp lệ, default qua được validate, import được ở Node, chỉ import thư viện được phép.

## Meme (tab 😂 Meme, dùng chung mọi game)
Mỗi luật: **khi** <quà / tim / follow / share / vào live / từ khoá / sự kiện của game> → **hình** (tự tìm GIF trên GIPHY theo từ khoá, link GIF, hoặc không) + **tiếng** (âm có sẵn, link mp3, tự tìm trên Freesound, hoặc không) + **chữ** (nhiều câu cách nhau `|`, chọn ngẫu nhiên) + số giây hiện.
- **Sự kiện của game:** `action:<id>` (quà / tương tác khai báo trong `manifest.actions`, ví dụ "Sếp đến soi") hoặc id trong `manifest.events` (ví dụ Đoán cờ `solved`, Nằm Vùng `caught`). Nút **Thêm bộ meme mặc định** lấy từ `manifest.memes` của game đang chơi.
- **Chạy ở đâu:** overlay chính khớp luật (sự kiện TikTok, `host.onAction`, hiệu ứng của game khớp `manifest.events`), phát meme rồi gửi `{t:'memefx', shot}` cho các overlay khác qua gateway. Shot có số ngẫu nhiên `r` nên mọi overlay hiện cùng một clip. Âm thanh chỉ phát ở overlay chính. Tối đa 6 meme / 10 giây, 3 meme xếp hàng.
- **Tìm kiếm:** overlay hỏi gateway `{t:'meme', kind: 'gif' | 'sound', q}`; gateway giữ key (`GIPHY_API_KEY`, `FREESOUND_API_KEY`), lưu kết quả theo từ khoá. Dashboard xem trước bằng op `memesearch`, phát thử bằng op `memetest` (không cần lưu).
- Game có meme riêng (Deadline Dí) nhường cho luật Studio khi trùng sự kiện (`ctx.memes.covered(action)`).
- Code: `web/js/meme-layer.js`, `gateway/memes.js`, `checkMemeRule` trong `gateway/studio.js`.

## Giới hạn và lưu trữ
- **Gói miễn phí:** tối đa 12 widget, 20 luật âm thanh và 40 luật meme (`STUDIO_LIMITS` trong `gateway/studio.js`).
- **Lưu trữ:** cột `channels.studio` (jsonb), migration `20261111000000_studio.sql`.

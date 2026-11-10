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

## Giới hạn và lưu trữ
- **Gói miễn phí:** tối đa 12 widget và 20 luật âm thanh (`STUDIO_LIMITS` trong `gateway/studio.js`).
- **Lưu trữ:** cột `channels.studio` (jsonb), migration `20261111000000_studio.sql`.

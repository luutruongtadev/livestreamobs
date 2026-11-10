# Chuẩn Game Module (SDK 1.x)

Nền tảng chạy nhiều game tương tác TikTok Live. **Mỗi game là một thư mục độc lập trong `games/`**, nói chuyện với nền tảng qua một hợp đồng cố định (`@platform/sdk`, import bằng `#sdk`). Thêm game mới không phải sửa nền tảng hay game khác.

```
TikTok ─WS─► gateway ─WS─► overlay shell ─► createHost(game) ─► game.handle / game.action ─► effects + snapshot ─► render
                 ▲                                   │
                 └──── ctx.server.request(op) ◄──────┘  (chỉ game có phần server)
```

## 1. Cấu trúc thư mục

```
games/<id>/
  manifest.json            bắt buộc — định danh, inputs, actions, commands, data, secrets
  settings.schema.json     bắt buộc — JSON Schema của cài đặt, MỌI trường có default
  engine/index.js          bắt buộc — export createGame(ctx); logic thuần
  render/index.js          bắt buộc — export mount(el, ctx); canvas + âm thanh
  server/index.js          tuỳ chọn — export createServer(ctx); chạy trong gateway (API key, cache dùng chung)
  data/                    dữ liệu soạn sẵn (khai báo trong manifest.data)
  supabase/migrations/     bảng riêng, tên bắt buộc tiền tố g_<id>_
  i18n/vi.json             bắt buộc — chuỗi hiển thị
  assets/                  thumbnail, ảnh, âm thanh
  test/conformance.test.js bắt buộc — runConformance(new URL('..', import.meta.url))
  README.md                bắt buộc — luật chơi, actions, lệnh
```

Tạo nhanh: `npm run new-game <id> "Tên hiển thị"`.

## 2. `manifest.json`

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `id` | ✔ | `a-z0-9-`, 2–32 ký tự, trùng tên thư mục, không đổi sau khi phát hành |
| `name`, `description` | ✔ / – | hiện ở danh mục game |
| `version` | ✔ | semver của game (kênh có thể ghim phiên bản) |
| `sdk` | ✔ | vd `"^1.0.0"` — phải tương thích `SDK_VERSION` |
| `status` | ✔ | `dev` (chỉ tài khoản thử) · `beta` · `live` · `retired` |
| `canvas` | ✔ | `{ width, height }` — overlay tạo canvas đúng kích thước này |
| `inputs` | ✔ | loại sự kiện game nhận qua `handle()`: `comment gift like follow share member` |
| `actions` | – | việc người xem kích hoạt được: `{ id, label, icon?, params?, defaultTriggers: [trigger] }` |
| `commands` | – | nút cho streamer: `{ id, label }`. Không khai báo `pause` / `resume` (nền tảng lo) |
| `data` | – | `{ tên: "data/x.json" }` — nền tảng nạp sẵn vào `ctx.data` (không ra ngoài thư mục game) |
| `server` | – | `true` nếu có `server/index.js` |
| `secrets` | – | tên biến môi trường phần server được nhận (vd `ANTHROPIC_API_KEY`) |
| `restore` | – | `full` (reload overlay khôi phục nguyên ván) · `partial` (chỉ giữ dữ liệu bền) |

**Trigger** (streamer gán lại trong dashboard; một action có thể có nhiều trigger):
```jsonc
{ "type": "gift", "giftName": "Rose" }                 // theo tên quà (mỗi món kích hoạt 1 lần)
{ "type": "gift", "gifts": ["Rose", "TikTok"], "every": 5 }   // gom đủ 5 món (cả phòng) = 1 lần
{ "type": "gift", "minDiamonds": 30 }                  // theo số xu: chọn ngưỡng cao nhất đạt được; combo chỉ tính khi vừa vượt ngưỡng
{ "type": "like", "every": 1000 }
{ "type": "follow" } | { "type": "share", "every": 2 } | { "type": "member" }
{ "type": "keyword", "text": "đội đỏ", "cooldownSec": 5 }    // bình luận chứa cụm từ (không phân biệt dấu, nguyên từ)
```
Một món quà khớp tối đa một trigger: theo tên trước, sau đó theo số xu.

**Tuỳ chọn:** `demo/index.js` khai báo người xem mô phỏng cho trang demo / trang chủ, dạng `export function bot(snapshot, rand, data) → sự kiện | null`. Nền tảng gọi khoảng 1,4 lần mỗi giây.

## 3. Engine — `createGame(ctx)`

```js
ctx = {
  manifest, settings,            // settings đã điền default; trường sai kiểu / ngoài khoảng → default
  data,                          // dữ liệu khai báo trong manifest.data
  now(), random(),               // BẮT BUỘC dùng thay Date.now / Math.random (test tái lập được)
  server: { request(op, payload) → Promise },   // gọi phần server của chính game này
  storage: { get(k), set(k, v) },               // khoá–giá trị theo (kênh, game)
  report: { round(result), points(user, n) },   // kết quả ván / điểm cho BXH chung
  bindings: { view(), reset() },                // trạng thái trigger (vẽ chip quà); reset() đầu vòng
                                                // tiến độ gom được nền tảng lưu kèm serialize() dưới khoá $triggers (game không thấy)
  log,
}
// game trả về:
{
  handle(event) → effects[]          // sự kiện thuộc manifest.inputs
  action(actionId, event, binding) → effects[] | false   // false = không áp dụng được → nền tảng trả lượt (bộ đếm every)
  progress?(actionId, { count, every, binding, event }) → effects[]   // tiến độ gom (tuỳ chọn)
  command(commandId, args) → effects[]
  tick(now) → effects[]              // ~4 lần / giây
  pause?(reason), resume?()          // nếu game hỗ trợ tạm dừng (dùng makePausable của SDK)
  snapshot() → object                // cho renderer; có thể ẩn bí mật; PHẢI tuần tự hoá JSON được
  serialize() → object               // trạng thái để lưu / khôi phục
  restore(saved)                     // chịu được dữ liệu hỏng
  on('effects', fn)                  // hiệu ứng đến sau (vd điểm chấm xong)
  destroy()
}
```
- **Game không tự đọc quà / tim.** Nền tảng so trigger rồi gọi `action()`; quà vẫn được chuyển vào `handle()` nếu game khai báo `gift` trong `inputs` (vd để cảm ơn).
- Đường đi nóng: `handle()` phải đồng bộ và nhanh (p95 < 1 ms). Việc chậm (gọi API) → `ctx.server.request()` rồi `emit('effects')`.
- Vẽ bảng "quà → tác dụng": dùng `triggerText(trigger)` / `triggerIcon(trigger)` của SDK ("5 Hoa hồng", "300 tim", "Quà ≥ 10 xu" · 🌹 ❤️ 🎁) trên kết quả `ctx.bindings.view()`.
- Sự kiện chuẩn hoá: `{ type, user: { id, name, avatar }, text?, giftName?, giftId?, diamonds?, count?, streakTotal?, seq, sentAt, gwAt }`.

## 4. Renderer — `mount(el, ctx)`

```js
mount(el, { canvas, sound?, options?, i18n? }) → { update(snapshot), effect(fx), resumeAudio?(), resize(), destroy() }
```
Không đụng DOM khi import (mọi thứ trong `mount`). Nền tảng lo kết nối, nút bật âm thanh, chế độ điện thoại, lớp UI chung (trạng thái kết nối, BXH, bảng quà).

## 5. Phần server — `createServer(ctx)` (tuỳ chọn)

```js
createServer({ secrets, dataDir, log, config }) → { ops: { async <op>(payload, channel) }, save?(), destroy?() }
```
Chạy trong gateway; mỗi op có timeout + giới hạn tần suất theo kênh; lỗi của op chỉ làm hỏng request đó. Được dùng `node:*` và thư viện npm. Chỉ nhận secret khai báo trong `manifest.secrets`.

## 6. Luật cách ly (bộ test chuẩn kiểm tra tự động)

1. `engine/`, `render/` chỉ import `#sdk` và file trong chính thư mục game; không import `server/`.
2. Không game nào import game khác hay code nền tảng (`server/`, `gateway/`, `apps/`).
3. Engine không dùng `document`, `window`, `fetch`, `WebSocket`, `setTimeout`, `setInterval`, `Date.now`, `Math.random`, `process.env`.
4. Lỗi trong game bị host bắt lại; lỗi lặp lại (5 lần / 10 giây) → game dừng ("crashed"), nền tảng vẫn chạy, có thể `recover()` hoặc đổi game.
5. Dữ liệu: bảng chung có cột `game_id`; bảng riêng tiền tố `g_<id>_`; `ctx.storage` tự tách theo (kênh, game).

## 7. Bộ test chuẩn (`runConformance`)

Manifest + schema hợp lệ · mọi trường cài đặt có default · đủ file bắt buộc · luật cách ly · render import được ở Node · engine chịu dữ liệu rác (comment rỗng, emoji, chuỗi 5000 ký tự, quà xu âm, loại sự kiện lạ) · mọi action / command chạy được · không có lỗi nào lọt ra host · **tái lập** (cùng seed + cùng sự kiện → cùng snapshot) · snapshot / serialize tuần tự hoá JSON · restore chịu dữ liệu hỏng (`full`: khôi phục đúng trạng thái) · `handle()` p95 < 1 ms ở 50 sự kiện / giây.

## 8. Quy trình thêm game

1. `npm run new-game <id> "Tên"` → viết engine + render (+ server).
2. `node --test games/<id>/test` xanh (CI chạy test của mọi game khi SDK / nền tảng đổi).
3. Thử bằng Giả lập trên dashboard với `status: "dev"` → `beta` cho vài kênh → `live`.

## 9. Phiên bản

- Game: semver riêng; kênh có thể ghim `version_pin`.
- SDK: `SDK_VERSION` theo semver; đổi phá vỡ hợp đồng → tăng major, giữ adapter cho game `sdk: ^1`.

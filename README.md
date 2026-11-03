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

Bố cục: tượng Phật trên cùng · **quà gần đây** góc trái · **TÂM LÒNG THÀNH** (top 3) góc phải · **băng rôn lời nguyện** giữa màn hình · **6 bục lễ** trước bàn thờ · phật tử mặc áo tràng (lam / nâu / trắng) đứng hai bên thảm đỏ · **bảng giá** dưới cùng.

- **Bình luận bất kỳ** → vào chùa (đi từ cửa vào chỗ đứng), lời bình luận hiện thành bong bóng trên đầu 6 giây.
- **Thắp hương** → cúi lạy, nén hương bay lên cắm vào lư.
- **Xin xăm / xin quẻ** → lời quẻ hiện trên băng rôn (đọc to với `?tts=1`).
- **Nam mô… / cầu…** → bong bóng lời khấn + đèn lồng bay lên.
- **Thả tim** → gõ mõ, **Follow / Chia sẻ** → thỉnh chuông.
- **Mọi món quà** → bong bóng "🙏 dâng Rose x1", nén hương lên bàn thờ, hiện ở thanh quà góc trái. Rose / Love you so much → hoa sen dâng lên Phật; Finger Heart → mưa hoa; ≥100 xu → hào quang vàng; ≥1000 xu → băng rôn "đại cúng dường".
- **Từ 5 xu → lên bục lễ**: người tặng đi dọc thảm đỏ lên một trong 6 bục, quỳ lạy trước tượng; băng rôn đọc lời nguyện ("X thành tâm dâng Rose, lên bục quỳ trước Tam Bảo. Nguyện…" hoặc "X đã dâng lễ 9 lần, mời lên bục lễ Phật…"). Giữ bục 60 giây + 4 giây mỗi xu thêm (tối đa 5 phút); tặng tiếp thì được gia hạn; hết bục thì người sắp hết giờ nhất nhường chỗ.
- Phật tử **xếp chỗ theo công đức**: người nhiều công đức đứng hàng trên, gần bàn thờ hơn.
- Ai không tương tác quá `hall.presenceMinutes` phút (mặc định 15) sẽ rời chánh điện. Tối đa `hall.maxWorshippers` người (mặc định 60).

Chỉnh trong `config.json` → `hall`: `platform` (số bục, số xu tối thiểu, thời gian, danh sách lời nguyện `wishes`), `priceTags` (bảng giá dưới cùng), `leaderboardTitle`.

Tuỳ chọn URL riêng: `?tts=1` (đọc tên người dâng quà bằng giọng tiếng Việt của trình duyệt, OBS có thể không hỗ trợ), `?bg=assets/chanh-dien.jpg` (dùng ảnh nền tự vẽ/AI thay cho cảnh vẽ bằng code, đặt file trong `public/assets/`), `?guide=0`, `?board=0`, `?mute=1`, `?debug=1`, `?phone=1` / `?phone=0` (bật / tắt hẳn chế độ điện thoại; trang tự bật khi mở toàn màn hình nên OBS/Chrome kiosk trên VPS cần `?phone=0`).

**Ảnh tượng Phật**: mặc định dùng ảnh `public/assets/buddha.webp`, đặt trong khung vòm sau bàn thờ (tường, bàn thờ, phật tử, hiệu ứng vẫn vẽ bằng code). Đổi ảnh khác: chép ảnh vào `public/assets/` rồi sửa `config.json` → `hall.buddhaImage`:

```json
"buddhaImage": { "src": "assets/anh-cua-ban.jpg", "headTop": 0.264, "base": 0.765, "centerX": 0.5 }
```

`headTop`, `base`, `centerX` là vị trí (tỉ lệ 0–1 theo chiều cao/rộng ảnh) của đỉnh đầu tượng, chân toà sen và tâm tượng, để ảnh tự căn đúng chỗ. Xoá `buddhaImage` hoặc thêm `?buddha=draw` vào URL để quay lại tượng vẽ bằng code.

Nội dung bảng "Cách tham gia", tiêu đề bảng công đức, quà nào ra hiệu ứng gì đều chỉnh trong `config.json` → `hall.guide`, `hall.giftGuide`, `hall.leaderboardTitle`, `giftEffects` (`{"Tên quà gốc tiếng Anh": "petals" | "lotus" | "golden" | "buddha"}`).

## 🔤 Game Đoán từ (`/doantu`)

Mỗi vòng có một **từ bí mật** (chỉ hiện số chữ của từng tiếng: `_ _ _  _ _ _ _`). Người xem bình luận một từ (tối đa 4 tiếng), từ đó hiện lên kèm **điểm gần nghĩa 1–100** so với từ bí mật; bảng **GẦN NGHĨA NHẤT** xếp 8 từ điểm cao nhất (thanh màu đỏ → vàng → xanh). Đoán trúng (không phân biệt dấu, hoa thường) = **100 điểm, thắng vòng**.

- **Chấm điểm bằng Claude** (hiểu nghĩa tiếng Việt, kể cả gõ không dấu). Đặt `ANTHROPIC_API_KEY` trong `.env` (lấy ở console.anthropic.com). Model mặc định `claude-opus-5-5`, đổi bằng `WORDGAME_MODEL` hoặc `config.json` → `wordgame.model`.
- **Tiết kiệm chi phí**: mỗi cặp (từ bí mật, từ đoán) chỉ chấm **một lần** rồi lưu cache (`data/wordscore-cache.json`), nhiều người đoán trùng không tốn thêm; từ đoán được gom lô ~1 giây/lần; tối đa `maxScoredPerRound` (500) từ khác nhau mỗi vòng.
- **Không có API key** → tự chuyển sang chấm đơn giản theo chữ (không hiểu nghĩa, chỉ để test).
- **Gợi ý**: tự mở sau 60 / 150 / 230 giây (chủ đề → chữ đầu mỗi tiếng → lộ một tiếng).
- **Quà mở khoá** (hiện thành dòng chip dưới ô chữ, kèm tiến độ gom quà):

  | Quà | Mở khoá |
  |---|---|
  | 🌹 Hoa hồng / TikTok / Heart Me / Ice Cream (1 xu) | gom đủ 5 món (cộng dồn cả phòng trong vòng) = lộ 1 chữ cái |
  | 🫰 Tim tay (Finger Heart) | lộ 1 chữ cái (combo x3 = 3 chữ) |
  | 🎁 từ 10 xu | mở gợi ý tiếp theo |
  | 🍩 từ 30 xu | +60 giây cho vòng |
  | 💎 từ 99 xu | lộ cả một tiếng |

  Chữ đã lộ hiện màu vàng trong ô; luôn chừa lại ít nhất 1 chữ. Quà khớp theo **tên quà** trước (tên tiếng Anh của TikTok), không khớp thì theo **số xu**. Đổi trong `config.json` → `wordgame.giftUnlocks` (`action`: `letter` | `hint` | `time` | `syllable`, `every`: số món cần gom, `gifts`: danh sách tên quà, `minDiamonds`: ngưỡng xu).
- **Nhiều bộ từ, chuyển qua lại trong trang admin** (ô *Bộ từ* → *Chuyển bộ từ*, bắt đầu vòng mới ngay):
  - `Đoán từ (từ vựng)`: kho từ Claude sinh + 140 từ mẫu trộn nhiều chủ đề.
  - `Đoán tướng LMHT`: 92 tướng Liên Minh Huyền Thoại (`wordsets/lmht.json`). Mỗi tướng có 5 gợi ý riêng mở dần (vùng đất → cốt truyện / ngoại hình → chiêu thức), có biệt danh tính là trúng (`ez`, `mf`, `tf`, `j4`, `lee`…), gõ liền không dấu nháy vẫn trúng (`kaisa` = Kai'Sa). Có API key thì Claude chấm theo ngữ cảnh LMHT (anh em / kẻ thù / cùng vùng đất / đặc điểm của tướng).
  - **✨ Tạo bằng Claude** (trang admin → mục Đoán từ, cần `ANTHROPIC_API_KEY`):
    - **Tạo bộ từ mới theo chủ đề bất kỳ** (vd "Cầu thủ bóng đá", "Phim hoạt hình Disney"): chọn 30 / 50 / 100 từ, Claude soạn tên bộ, nhãn, mỗi từ 5 gợi ý + biệt danh. Mất khoảng 1–3 phút, xong là có trong ô *Bộ từ*.
    - **Tạo lại gợi ý** cho một từ / tướng (có ô "yêu cầu thêm", vd "tập trung vào chiêu thức"), hoặc cho **từ đang chơi** — gợi ý trên màn hình đổi ngay.
    - Bộ tạo mới / đã sửa lưu ở `data/wordsets/` (volume Docker, không mất khi deploy). Nút **Xoá bộ đã tạo / khôi phục bản gốc**: bộ tạo mới thì xoá, bộ có sẵn (vd LMHT) thì quay về bản trong repo.
  - Màn hình hiện **📚 Chủ đề** của bộ dưới nhãn từ bí mật (trường `topic` trong file bộ từ).
  - Thêm bộ bằng tay: tạo file `wordsets/<tên>.json` cùng định dạng (`title`, `topic`, `secretLabel`, `scoreContext`, `words: [{ word, aliases, hints }]`), push lên là có trong danh sách.
- Mỗi vòng 5 phút; hết giờ lộ từ, 12 giây sau sang vòng mới. Bảng 🥇🥈🥉 cao thủ đếm số vòng thắng.
- Mỗi người đoán tối đa 1 từ / 2 giây.
- Trang admin: xem từ bí mật (không hiện trên live), đặt từ riêng, mở gợi ý, sang vòng mới, giả lập đoán.
- **Từ bí mật do Claude sinh theo lô 100 từ** (kèm chủ đề gợi ý), lưu ở `data/wordbank.json`, không lặp lại từ đã chơi. Kho còn dưới 10 từ chưa dùng thì tự tạo lô mới. Tạo thủ công: trang admin → ô chủ đề (ví dụ "Tết", "Đồ ăn", để trống = trộn) → **✨ Tạo 100 từ mới**, hoặc `npm run gen-words -- "Tết" 100`. Model sinh từ: `WORDGAME_GEN_MODEL` / `wordgame.generatorModel` (mặc định `claude-opus-5-5`).
- Độ khó khi Claude sinh lô mới: `"difficulty": "hard"` (mặc định — tránh từ quá phổ biến, ưu tiên từ ghép ít gặp, khái niệm trừu tượng, hiện tượng, đồ vật xưa; chủ đề gợi ý rộng) | `"medium"` | `"easy"` trong khối `wordgame` của `config.json`, hoặc biến môi trường `WORDGAME_DIFFICULTY`.
- Không có API key → dùng 140 từ mẫu trong `config.json` → `wordgame.words` (động vật, món ăn, trái cây, đồ vật, thiên nhiên, nghề nghiệp, thể thao, phương tiện, lễ hội, công nghệ, cảm xúc). Đoán bỏ từ chỉ loại vẫn trúng ("chó" = "con chó").
- OBS: `http://localhost:8686/doantu?phone=0`. Điện thoại: `https://<tên miền>/doantu?phone=1`.

### ⏸ Tạm dừng game (Đoán từ, Kéo co & Đua thú)

- **Tự tạm dừng khi chưa live**: khi server chưa kết nối được phiên live TikTok, cả hai game đứng yên —
  đồng hồ không chạy, không tự mở gợi ý, không sang vòng mới nên **không tốn từ bí mật**. Kênh lên live là game tự chạy tiếp
  từ đúng chỗ đã dừng. Màn hình hiện “⏸ TẠM DỪNG — Chờ kênh lên live…”.
- **Nút trong admin** (mục Kết nối TikTok Live): ⏸ Tạm dừng game / ▶ Tiếp tục — dùng bất cứ lúc nào, kể cả đang live.
  Bấm “Tiếp tục” khi chưa live để chơi thử bằng giả lập (lần mất live sau sẽ lại tự dừng).
- Tắt tự dừng: `"autoPauseOffline": false` trong `config.json` hoặc biến môi trường `AUTO_PAUSE_OFFLINE=0`.

## 🏁 Game Đua thú (`/duathu`)

- **Comment `OK`** (oke, okay, oki… đều được) để nhận một con vật và một làn đua. **Tối đa 6 con / vòng**;
  người đến sau (hoặc comment OK lúc đang đua) được **đăng ký vòng sau** và tự vào đua khi mở vòng mới.
- Sảnh chờ **30 giây**. Hết giờ mà chưa đủ 6 người thì **tự thêm 🤖 bot** cho đủ 6 con (bot tự chạy theo từng đợt, không lên bảng Vua tốc độ); không ai vào thì 6 bot vẫn đua để màn hình luôn chạy. Đủ 6 người thật thì xuất phát sau 5 giây. Đếm ngược 3‑2‑1 → CHẠY!
- **Bot có phong độ ngẫu nhiên** (0,75–1,25 lần tốc độ chuẩn) nên con nhanh con chậm, và **tự ném 🍌 chuối / 💣 bom ngẫu nhiên** vào con dẫn đầu sau 8 giây đầu (5 bot ≈ 1 quả chuối / 10 giây, 1 quả bom / 40 giây; chỉnh trong `race.bots`).
- **Người đua**: **bình luận không làm con vật chạy** — thả tim = chạy (2 đơn vị / tim), tặng quà = phóng. **Tặng quà theo mức** (tính theo giá một món, combo thì nhân lên):

  | Quà | Tác dụng |
  |---|---|
  | 🌹 1 xu (Rose…) | Tăng tốc (+25 / bông). Mỗi **10 bông** cho cùng một con → **🌹 Mưa hoa** phóng thêm 120 |
  | 💖 5 xu (Finger Heart…) | Tăng tốc mạnh hơn + **hồi phục** ngay nếu đang bị choáng |
  | 🛡️ 10 xu | **Khiên** 20 giây: chặn 1 chướng ngại vật (khiên vỡ) |
  | 🍌 30 xu | Ném **chuối** vào con dẫn đầu (không phải con mình): trượt chân, xoay vòng 2,5 giây |
  | 💣 99 xu | Ném **bom**: nổ tung, hất lên, cháy đen, bị đẩy lùi 6% đường, choáng 3,5 giây |
  | 🚀 299 xu | **Siêu tốc** 6 giây: chạy nhanh gấp đôi, bật dậy nếu đang choáng, **né** mọi chướng ngại vật |

  **🎯 Chọn mục tiêu**: comment `ném 3` (hoặc `chuối 3`, `bom 3`, `ném ngựa`) rồi tặng quà chuối / bom trong 30 giây → bay vào con làn 3 thay vì con dẫn đầu (nhắm con mình thì vẫn ném con dẫn đầu). Khán giả chưa cổ vũ ai cũng ném được.

  Mọi quà đều đẩy thêm quãng đường (1 xu = 12 đơn vị, đường dài 1000, một lần tặng tối đa 320). Mức xu chỉnh trong khối `race` của `config.json`.
- **Thanh 💡 MẸO tự xoay vòng** dưới đường đua (6 giây / mẹo): lúc chờ thì xen kẽ mẹo vào đua, giữ chỗ, cổ vũ; lúc đua thì xoay qua bình luận, tim, từng mức quà, khiên, chuối, bom, siêu tốc. Thêm mẹo riêng bằng `"tips": ["…"]` trong khối `race` của `config.json`.
- Đường đua dựng theo phối cảnh 3D (làn xa nhỏ, làn gần to, bóng đổ, bụi, khán đài, cờ đích); chướng ngại vật bay theo đường cong tới mục tiêu rồi mới phát nổ.
- **Khán giả không đua**: gõ số làn (`1`–`6`) hoặc tên con vật để chọn con cổ vũ (kể cả bot); tim / quà sau đó đều tính cho con đó.
- Vòng **chỉ kết thúc khi có con chạm vạch đích**. Sau 90 giây mà chưa ai về đích → **⚡ NƯỚC RÚT**: tốc độ nền của tất cả nhân 3 cho tới khi có con về đích (chỉnh `raceSeconds`, `sprintMultiplier`). Bục 1‑2‑3, rồi nghỉ 12 giây sang vòng mới.
- **Lưu thành tích theo người** (số lần thắng, lên bục, số vòng đã đua) vào `data/race.json` → bảng 🏆 Vua tốc độ, không mất khi deploy.
- Tự tạm dừng khi chưa live như Đoán từ / Kéo co. Admin có nút giả lập (OK, bình luận, cổ vũ, tim, quà, chuối) và ⏭ xuất phát ngay / kết thúc / vòng mới.
- Phát bằng OBS: `http://localhost:8686/duathu?phone=0`. Điện thoại: `https://<tên miền>/duathu?phone=1`. Chỉnh luật trong khối `race` của `config.json`.

## 🪢 Game Kéo co (`/keoco`)

Game kéo co hai đội, mỗi ván 3 phút, dùng chung server / admin / cách triển khai với Chánh điện.

| Người xem làm | Kết quả |
|---|---|
| Bình luận **"đỏ"** / **"xanh"** | Vào đội (đổi được khi chưa kéo lần nào) |
| Thả tim | Kéo 1 lực / tim. Chưa chọn đội thì được xếp vào đội ít người hơn |
| Chia sẻ / Follow | Kéo 15 / 25 lực |
| Tặng quà | Kéo mạnh: **1 xu = 5 lực**. Mỗi món quà kéo tối đa nửa quãng đường nên ván không kết thúc ngay |
| Tặng nhiều xu nhất ván | Lên **👑 Ngai vàng** giữa màn hình; bị vượt thì bị "hất khỏi ngai" |

- Dây qua vạch đích là thắng ngay; hết giờ thì đội đang kéo lệch về phía mình thắng (đứng giữa là hoà). Màn hình kết thúc hiện đội thắng và **MVP**, nghỉ 15 giây rồi tự sang ván mới.
- Tỉ số các ván lưu trong `data/tugwar.json`.
- Trang admin có nút giả lập vào đội, kéo, tặng quà và điều khiển ván (kết thúc / chơi lại / xoá tỉ số).
- Đổi tên đội, màu, từ khoá, thời gian ván, lực của từng tương tác trong `config.json` → `tugwar` (ví dụ đội "Phở" / "Bún": đổi `name` và `keywords`).
- Phát bằng OBS: Browser Source `http://localhost:8686/keoco?phone=0`. Phát bằng điện thoại: `https://<tên miền>/keoco?phone=1`.

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

### Tự động deploy bằng GitHub Actions (SSH user + mật khẩu)

File `.github/workflows/deploy.yml`: mỗi lần push lên `master` (hoặc bấm *Run workflow* trong tab **Actions**):

1. Chạy `npm test`.
2. Build image Docker trên GitHub, nén thành `image-app.tar.gz`.
3. Chép image + `docker-compose.yml`, `config.json`, `public/assets`, `deploy/` lên VPS bằng SSH (user + mật khẩu).
4. Trên VPS chạy `deploy/remote-deploy.sh`: cài Docker nếu chưa có, bật Docker chạy cùng hệ thống, nạp image, `docker compose up -d`. Container có `restart: unless-stopped` → **VPS tắt / khởi động lại thì app tự chạy lại**, không cần deploy lại. Công đức, bảng xếp hạng lưu trong volume `chua-data`, không mất khi deploy.

**Cài đặt một lần** — GitHub repo → **Settings → Secrets and variables → Actions**:

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `VPS_HOST` | IP VPS, ví dụ `103.82.27.60` |
| Secret | `VPS_USER` | `root` (hoặc user có `sudo` không cần mật khẩu) |
| Secret | `VPS_PASSWORD` | mật khẩu SSH |
| Secret (tuỳ chọn) | `VPS_PORT` | cổng SSH nếu khác 22 |
| Secret (tuỳ chọn) | `VPS_ENV_FILE` | toàn bộ nội dung file `.env` (TIKTOK_USERNAME, ADMIN_TOKEN, ANTHROPIC_API_KEY, DOMAIN…). Bỏ trống thì giữ `.env` đang có trên VPS (lần đầu tự tạo từ `.env.example`, tự sinh `ADMIN_TOKEN`) |
| Variable (tuỳ chọn) | `DEPLOY_MODE` | `phone` (mặc định: app + Caddy HTTPS), `server` (chỉ app), `stream` (app + VPS tự phát RTMP) |
| Variable (tuỳ chọn) | `VPS_DIR` | thư mục trên VPS, mặc định `/opt/chua-online` |

Lưu ý:

- VPS phải cho phép đăng nhập SSH bằng mật khẩu. An toàn hơn: đổi sang SSH key sau khi chạy ổn.
- Script tự tắt bản cài systemd cũ (`chua-app`, `chua-stream`, Caddy cài trực tiếp) để không tranh cổng.
- Chế độ `phone` cần mở cổng 80 / 443 trên tường lửa nhà cung cấp VPS.
- Docker Hub báo lỗi `429 Too Many Requests` khi build? Thêm `--build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-bookworm-slim`.

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
  keoco.html, js/tug.js         Game kéo co (server/tugwar.js là luật chơi)
  duathu.html, js/race.js       Game đua thú (server/race.js là luật chơi)
  doantu.html, js/wordgame.js   Game đoán từ (server/wordgame.js luật chơi, server/scorer.js chấm điểm, server/wordbank.js sinh từ,
                                server/setgen.js tạo bộ / gợi ý bằng Claude, server/wordsets.js lưu bộ từ)
  admin.html                    Bảng điều khiển
test/temple.test.js             npm test
deploy/stream.sh                Phát 24/7: Xvfb + Chrome + PulseAudio + ffmpeg -> RTMP
deploy/bootstrap.sh             Cài trọn gói một lệnh (mặc định: chế độ điện thoại)
deploy/install-ubuntu.sh        Cài lên VPS Ubuntu + dịch vụ systemd (--phone: chỉ server)
deploy/setup-https.sh           Caddy + HTTPS (tên miền miễn phí sslip.io) cho điện thoại
deploy/remote-deploy.sh         Chạy trên VPS khi GitHub Actions deploy (.github/workflows/deploy.yml)
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

# 🔤 Đoán từ — game đoán từ tương tác cho TikTok Live

Game livestream self-hosted: người xem **bình luận để đoán từ bí mật**, Claude chấm **độ gần nghĩa** từng từ đoán,
gợi ý mở dần (emoji → chủ đề → từ liên quan), quà mở chữ / thêm giờ, giọng MC trêu đùa khi có người trúng hoặc tặng quà,
bảng xếp hạng tuần, chế độ đấu đội.

```
TikTok Live ──(tiktok-live-connector)──► Node.js server ──(WebSocket)──► /doantu (canvas 1080×1920) ──► OBS / LIVE Studio / điện thoại ──► TikTok
                                             │
                                             └── /admin: kết nối, đặt / thêm từ, giả lập, hẹn giờ kết thúc live
```

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
  - `Đoán từ (từ vựng)`: kho từ Claude sinh (nếu có) + 468 từ có sẵn trộn nhiều chủ đề.
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
- **Bộ "Đoán trend MXH"** (`wordsets/trend-mxh.json`, 82 từ): từ lóng Gen Z, trend, đồ hot, thuật ngữ mạng xã hội (sống ảo, flex, trà xanh, hóng biến, chữa lành, red flag, Labubu, pickleball, cà phê muối…). Mỗi từ có 2 gợi ý từ liên quan + 3 emoji, kèm cách gõ khác vẫn tính trúng ("healing" = "chữa lành", "flashsale" = "flash sale"); Claude chấm theo nghĩa trên mạng xã hội. Chọn trong admin → 🔤 Đoán từ → Bộ từ.
- **🏆 Bảng xếp hạng tuần**: đoán đúng = **100 điểm + thưởng tốc độ** (tối đa +100, đoán càng sớm càng nhiều). **Chia sẻ live** (+20/lượt, tối đa 5) và **tặng quà** (+2/xu, tối đa 300) tích điểm thưởng, cộng vào lần đoán đúng tiếp theo trong tuần. Tuần tính từ thứ 2 00:00 giờ VN; hết tuần người nhất được ghim tên **"👑 Vua tuần trước"** trên banner đầu màn hình cả tuần sau. Màn hình hiện top tuần, điểm chi tiết khi đoán trúng; admin có bảng top 20, lịch sử các tuần (để trao quà) và nút chốt tuần thủ công. Chỉnh mức điểm ở `wordgame.weekly` trong `config.json`; dữ liệu lưu `data/weekly.json`.
- **👥 Chế độ đấu đội** (admin → 🔤 Đoán từ → bật / tắt): người xem comment **"đội đỏ" / "đội xanh"** (hoặc "team đỏ", "phe xanh") để vào đội; chưa chọn mà đoán thì tự vào đội ít người hơn. Đoán trúng: đội +100 + thưởng tốc độ; quà của thành viên +1 điểm đội/xu; chia sẻ +5. Mỗi trận 10 vòng (chỉnh trong admin); trong trận đã vào đội thì không đổi được; hết trận công bố đội thắng, tỉ số và MVP rồi **xoá hết thành viên 2 đội** — mọi người chọn lại đội cho trận mới (trong lúc màn công bố đang hiện). Màn hình: thanh tỉ số 2 đội thay banner Vua tuần khi bật; viền avatar theo màu đội. Điểm tuần cá nhân vẫn tính bình thường. Chỉnh ở `wordgame.team` trong `config.json`.
- **➕ Admin tự thêm từ mới** (admin → 🔤 Đoán từ → Thêm từ mới): nhập từ, cách gõ khác, gợi ý 1, gợi ý 2, 3 emoji → **▶ Thêm & chơi ngay** (bắt đầu vòng mới với từ đó) hoặc **⏭ Thêm vào hàng ưu tiên** (các vòng sau lấy lần lượt từ hàng này trước). Từ được lưu vào bộ đang chơi — bộ riêng thì ghi ở `data/added-words.json` (không bị bản cập nhật bộ trong repo ghi đè), bộ từ vựng thì vào kho (lô "admin"). Gợi ý lộ chữ của đáp án sẽ bị từ chối kèm lời nhắc.
- **Gợi ý kiểu mới cho từ vựng**: **3 lần gợi ý**: lần 1 là **3 emoji**, lần 2 là **chủ đề của từ**, lần 3 là **các từ / cụm từ liên quan gần nghĩa** (vd "ống nhòm": 👀 🦅 🔭 → `Chủ đề: Đồ vật` → `nhìn xa · hai mắt · phóng to`); từ trừu tượng không có emoji thì: chủ đề → gợi ý xa → gợi ý gần. Bộ riêng (trend…) cũng mở gợi ý emoji trước. 468 từ có sẵn đã có đủ gợi ý; lô Claude sinh mới cũng có sẵn; từ cũ trong kho thì bấm **📝 Bổ sung gợi ý mô tả + emoji cho từ cũ** trong admin. Từ chưa có vẫn dùng gợi ý kiểu cũ (chủ đề → chữ đầu → lộ chữ).
- **Cảm ơn người tặng quà**: ai tặng quà (kể cả lúc nghỉ giữa vòng) đều hiện thẻ **CẢM ƠN + tên + avatar + món quà**, tim bay; quà ≥ 30 xu thêm pháo giấy, ≥ 99 xu "CẢM ƠN ĐẠI GIA" + lóe sáng. Máy có giọng tiếng Việt (điện thoại Android / iPhone thường có) sẽ **đọc tên**: "Cảm ơn Lan Chi đã tặng 5 bông hồng"; tắt giọng đọc bằng `?tts=0`.
- 468 từ có sẵn trong `config.json` → `wordgame.words`: 140 từ phổ thông + 218 từ khó hơn + 78 từ tuổi thơ 8x 9x, phim / hoạt hình tuổi thơ, ẩm thực ba miền (có cách gõ khác, vd "đô rê mon" = "doraemon") + 32 từ gắn với trend / sự kiện tháng 8–11/2026 (hoa sữa, gánh hàng rong, BIGBANG, đi bão, triều cường, hoa hậu, nhóm chat, biến hình…) (đồ vật xưa, hiện tượng thiên nhiên, món ăn vùng miền, nghề đặc thù, văn hoá dân gian, khái niệm trừu tượng…). `"autoGenerate": false`: dùng hết kho Claude thì chuyển sang danh sách này (bật `true` thì kho tự sinh lô mới khi sắp hết và danh sách có sẵn chỉ là dự phòng). Đoán bỏ từ chỉ loại vẫn trúng ("chó" = "con chó").
- OBS: `http://localhost:8686/doantu?phone=0`. Điện thoại: `https://<tên miền>/doantu?phone=1`.

### 🔁 3 kiểu chơi luân phiên + mở chữ bằng tim

Game xoay vòng giữa các kiểu chơi, mặc định **mỗi kiểu 2 vòng**: Gần nghĩa → Thuộc tính → Gợi ý tiếng Anh → … Bật/tắt từng kiểu và chỉnh số vòng mỗi kiểu ở admin → 🔤 Đoán từ → **Kiểu chơi** (hoặc `wordgame.modes`, `wordgame.alternateEvery` trong `config.json`). Hai kiểu dưới cần `ANTHROPIC_API_KEY`; không có key hoặc Claude lỗi thì vòng đó tự quay về kiểu Gần nghĩa.

- **🎯 Gần nghĩa** (kiểu gốc): mỗi từ đoán được chấm 1–100.
- **🧩 Thuộc tính**: hệ thống có **26 thuộc tính**, chỉ dùng thuộc tính khách quan (đã bỏ "trẻ em thích", "cảm giác").
  - Thuộc tính nghĩa (24, Claude xếp hoặc soạn sẵn): loại, ở đâu, kích thước, màu (1–2 màu), chất liệu, có sự sống, ăn được, dùng điện, thời đại, giá tiền, cân nặng, nóng/lạnh, tự di chuyển, cầm/sờ được, phát ra tiếng, có mùi, liên quan nước, có trong Tết, ca dao tục ngữ, đặc trưng VN, mùa, số chân, từ loại, nguồn gốc từ (thuần Việt / Hán Việt / mượn).
  - Thuộc tính mặt chữ (2, tự tính, không tốn Claude): **thanh điệu** các tiếng, **chữ cái đầu**.
  - Mỗi vòng có 6 cột: Loại, 4 thuộc tính bốc thăm theo trọng số (thuộc tính chia đôi kho từ tốt hay được chọn hơn, thuộc tính "bất ngờ" như ca dao, Tết thỉnh thoảng mới có; tối đa 2 cột Có/Không), và cột **🔒 Chữ cái đầu** bị khoá, mở khi đủ 10 từ được đoán (`wordgame.attrUnlockAfter`).
  - Cách hiện ô: **xanh** là trúng; **vàng** là gần (lệch 1 bậc) hoặc trùng một phần (màu, thanh điệu); xám là khác. Thuộc tính có thứ bậc (kích thước, giá, cân nặng, nóng/lạnh, số chân, chữ cái đầu) có thêm mũi tên **↑ / ↓**: đáp án cao / thấp hơn, hoặc đứng sau / trước trong bảng chữ cái.
  - Hàng **ĐÃ BIẾT** gom những thuộc tính đã đoán trúng. Claude xếp thuộc tính mỗi từ một lần rồi lưu ở `data/attributes.json` (bản ghi cũ thiếu thuộc tính mới thì tự xếp lại). Model: `WORDGAME_ATTR_MODEL` / `wordgame.attrModel`.
- **🇬🇧 Gợi ý tiếng Anh**: từ bí mật vẫn là tiếng Việt, gợi ý là các từ hoặc cụm mô tả ngắn tiếng Anh đơn giản (trình độ A2, vd "lives in the sea", "you can eat it"), xếp từ xa đến gần, không bao giờ là bản dịch thẳng. Hệ thống **tự mở 3 từ** theo thời gian. Từ thứ 4 và 5 chỉ mở khi cả phòng **thả đủ 2000 tim** (mỗi lần mở 1 từ) hoặc tặng quà mở gợi ý; tối đa 5 từ. Mở đủ 5 từ rồi thì thả tim quay về luật chung: 1000 tim lộ 1 chữ cái. Từ đoán vẫn chấm gần nghĩa 1–100. Gợi ý của mỗi từ lưu ở `data/english-hints.json`. Số tim chỉnh ở admin hoặc `wordgame.englishLikeEvery`.
- **Kho từ soạn sẵn** (`modewords/`): 234 từ cho chế độ Thuộc tính (đủ 24 thuộc tính nghĩa + emoji + gợi ý) và 200 từ cho chế độ Tiếng Anh (5 gợi ý A2). Vòng của chế độ nào thì lấy từ chưa chơi trong kho của chế độ đó trước, nên không tốn Claude cho từ bí mật. Admin hiện số từ còn lại; hết kho thì lấy từ kho chung và Claude soạn thuộc tính / gợi ý. Thêm từ bằng tay: sửa file JSON cùng định dạng.
- **❤️ Thả tim mở chữ**: cả phòng thả đủ **1000 tim** (đổi ở admin hoặc `wordgame.likeEvery`) thì lộ 1 chữ cái. Tiến độ hiện thành chip đầu tiên dưới ô chữ, và luôn chừa lại ít nhất 1 chữ.

### 🎙️ Giọng MC trêu đùa (ElevenLabs)

- **Đoán trúng**: đọc câu chúc mừng trêu đùa **không có tên** theo mức (⚡ thần đồng, 🔥 không gợi ý, 💡 1 gợi ý, ⏱️ phút chót, 👍 2 gợi ý, 🎉 3 gợi ý). Mỗi mức một **thư viện 12 câu** (48 câu soạn sẵn + Claude Haiku viết thêm cho đủ): câu đọc lần đầu được lưu mp3 (`data/voice/lib`), các lần sau **phát lại miễn phí**, không lặp câu vừa nói. Bấm admin → 📚 *Tạo sẵn thư viện* để tạo trước (≈ 3.000 credit một lần).
- **Tặng quà**: Claude Haiku viết câu cảm ơn **có tên** (≤ 18 chữ, trêu theo giá quà), ElevenLabs đọc. Quà liên tiếp của cùng người trong 4 giây gom thành 1 câu.
- **Tiết kiệm credit**: model `eleven_flash_v2_5` (0,5 credit / ký tự), câu tối đa 130 ký tự, `dailyCredits` credit / ngày (mặc định 5.000), ngừng khi tài khoản còn dưới `reserveCredits` (1.000); quà dưới `minGiftDiamonds` xu không gọi ElevenLabs. Hết ngân sách → trang game tự đọc bằng giọng trình duyệt (miễn phí), câu đoán trúng vẫn phát từ thư viện.
- Admin → Đoán từ: credit hôm nay / tổng, **số credit còn lại trên tài khoản ElevenLabs** (key cần quyền đọc thông tin tài khoản), số câu trong thư viện, nút thử giọng.
- Bật: `ELEVENLABS_API_KEY=...` trong `.env` trên VPS. Chỉnh trong khối `voice` của `config.json` (`voiceId`, `claudeModel`, `libraryPerTier`, `minGiftDiamonds`, `dailyCredits`, `reserveCredits`, `maxPerHour`). `?tts=0` / `?mute=1` trên trang game để tắt tiếng đọc.

### 🎆 Hiệu ứng đoán trúng theo mức

Đoán càng sớm, càng ít gợi ý thì màn chúc mừng càng hoành tráng (chữ đóng dấu từng chữ, avatar to giữa màn hình, âm thanh riêng):

| Mức | Khi nào | Hiệu ứng |
|---|---|---|
| ⚡ THẦN ĐỒNG! | Trúng trong **10 giây đầu** | Màn tối, sét đánh liên tục, tia vàng quay, mưa xu vàng, rung màn hình, sấm + cồng |
| 🔥 KHÔNG CẦN GỢI Ý! | Chưa mở gợi ý nào | Bùng lửa, tàn lửa bốc lên, vòng sóng cam, tiếng nổ |
| 💡 CHỈ CẦN 1 GỢI Ý! | Sau gợi ý 1 | Lấp lánh xanh, sao nhấp nháy, chuỗi chuông |
| ⏱️ PHÚT CHÓT! | Còn ≤ 10 giây là hết giờ | Viền đỏ đập theo nhịp tim, chữ rung |
| 👍 ĐOÁN HAY! / 🎉 ĐOÁN TRÚNG! | Sau gợi ý 2 / đủ gợi ý | Pháo giấy như cũ |

Thẻ kết quả cũng đổi màu + tiêu đề theo mức (vd "⚡ THẦN ĐỒNG! · 3s"). Chỉnh mốc bằng `wordgame.flashSeconds` (mặc định 10) và `wordgame.clutchSeconds` (10).

### ⏸ Tạm dừng game

- **Tự tạm dừng khi chưa live**: khi server chưa kết nối được phiên live TikTok, cả hai game đứng yên —
  đồng hồ không chạy, không tự mở gợi ý, không sang vòng mới nên **không tốn từ bí mật**. Kênh lên live là game tự chạy tiếp
  từ đúng chỗ đã dừng. Màn hình hiện “⏸ TẠM DỪNG — Chờ kênh lên live…”.
- **Nút trong admin** (mục Kết nối TikTok Live): ⏸ Tạm dừng game / ▶ Tiếp tục — dùng bất cứ lúc nào, kể cả đang live.
  Bấm “Tiếp tục” khi chưa live để chơi thử bằng giả lập (lần mất live sau sẽ lại tự dừng).
- Tắt tự dừng: `"autoPauseOffline": false` trong `config.json` hoặc biến môi trường `AUTO_PAUSE_OFFLINE=0`.

## 🌙 Hẹn giờ kết thúc live (mặc định 01:00)

- **01:00 (giờ VN)**: mọi trang game hiện màn **“Chúc cả nhà ngủ ngon”** (trăng, sao, tim bay) + lời cảm ơn + đếm ngược 60 giây, đọc lời chào bằng giọng tiếng Việt của máy (`?tts=0` để tắt).
- **Hết đếm ngược**: tạm dừng mọi game (màn hình “Live đã kết thúc · Hẹn gặp lại”). **Lần lên live sau game tự chạy lại**, không cần bấm Tiếp tục. VPS vẫn chạy bình thường, không cần tắt.
- Admin → mục Kết nối TikTok Live → **🌙 Hẹn giờ kết thúc live**: bật / tắt, đổi giờ, số giây đếm ngược, lời chào; nút **Chào tạm biệt ngay** và **Huỷ**. Mặc định ở khối `goodbye` của `config.json`.
- **Tắt MacBook + kết thúc live**: chạy một lần trên Mac (cần mật khẩu máy một lần):
  ```bash
  bash deploy/macos/hen-gio-tat-may.sh          # mỗi ngày 01:02: tắt TikTok LIVE Studio / OBS rồi tắt máy
  bash deploy/macos/hen-gio-tat-may.sh 01:30    # đổi giờ · "huy" để gỡ · "thu" để thử ngay
  ```
  App phát live bị tắt → TikTok tự kết thúc live sau ~1–3 phút. Máy cần cắm sạc và không gập (máy ngủ thì không tự tắt; mở máy lại sau đó cũng không bị tắt bất ngờ).

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
- Màn hình game: <http://127.0.0.1:8686/doantu>

Ở trang admin, nhập TikTok username (không cần `@`) và bấm **Kết nối** — tài khoản phải **đang phát live**.
Chưa live vẫn test được bằng các nút **Giả lập sự kiện** (hoặc bật *Tự động bắn sự kiện ngẫu nhiên*).

## Đưa lên OBS → TikTok

1. OBS → *Settings → Video*: Base/Output resolution **1080×1920** (dọc).
2. *Sources → + → Browser*:
   - URL: `http://127.0.0.1:8686/doantu?phone=0`
   - Width **1080**, Height **1920**
   - Tích **Control audio via OBS** (để thu tiếng hiệu ứng + giọng MC vào live).
3. Phát lên TikTok: dùng **TikTok LIVE Studio** (thêm nguồn từ OBS Virtual Camera / cửa sổ OBS) hoặc dùng **Stream Key (RTMP)** nếu tài khoản được cấp: *OBS → Settings → Stream → Custom*, dán Server URL và Stream Key lấy từ TikTok.

### Tuỳ chọn URL

| Tham số | Ý nghĩa |
|---|---|
| `?phone=1` / `?phone=0` | Chế độ điện thoại (nút Bắt đầu, toàn màn hình) / OBS (nền trong suốt) |
| `?mute=1` | Tắt âm thanh |
| `?tts=0` | Tắt giọng đọc (giọng MC / trình duyệt) |
| `?debug=1` | Hiện FPS và trạng thái kết nối |

## Triển khai lên VPS & phát live 24/7

Có 2 cách dùng VPS:

| Cách | Ai phát lên TikTok | Khi nào dùng |
|---|---|---|
| **A. Phát 24/7 từ VPS** | VPS tự mở Chrome ẩn hiển thị game Đoán từ, ffmpeg quay lại và đẩy RTMP lên TikTok | Muốn live liên tục, tắt máy tính vẫn chạy |
| **B. VPS chỉ chạy server** | OBS trên máy bạn (Browser Source trỏ tới VPS) | Muốn ghép camera/micro, chỉnh cảnh trong OBS |

Hai cách dùng chung một bộ cài; cách B chỉ không bật dịch vụ phát.

```
VPS ─┬─ chua-app     (Node: nghe TikTok, chạy game, phục vụ /doantu, /admin)
     └─ chua-stream  (Xvfb + Chrome hiển thị /doantu + PulseAudio + ffmpeg ──RTMP──► TikTok)
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

VPS Linux chạy server và mở trang game qua HTTPS. Điện thoại Android mở trang đó toàn màn hình, rồi dùng app TikTok chia sẻ màn hình lên live.

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

1. Mở Chrome vào `https://IP-VPS.sslip.io/doantu?phone=1`. Bấm menu ⋮ → **Thêm vào màn hình chính** để trang chạy toàn màn hình, không có thanh địa chỉ.
2. Mở trang từ biểu tượng *Đoán từ* vừa tạo, rồi bấm **Bắt đầu**. Nút này bật toàn màn hình, bật âm thanh và giữ màn hình luôn sáng.
3. Bật **Không làm phiền** và cắm sạc.
4. Mở app TikTok → **LIVE** → chọn **Mobile gaming / Chia sẻ màn hình** → Go LIVE, rồi quay lại trang game.

Có thể thu được tiếng game qua chia sẻ màn hình hay không là tuỳ máy và phiên bản Android. Nếu live không có tiếng, bật loa ngoài để micro thu lại.

### VPS Windows (dùng TikTok LIVE Studio, không cần stream key)

Trên Windows, mọi thứ chạy trên cùng một VPS:

```
Server Node (game Đoán từ, /doantu)
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

**2. OBS: dựng hình game**

1. Cài [OBS Studio](https://obsproject.com/) và [VB-CABLE](https://vb-audio.com/Cable/). Cài VB-CABLE xong thì khởi động lại VPS.
2. OBS → *Settings → Video*: Base và Output đều là **1080x1920**, FPS 30.
3. Thêm **Browser Source**:
   - URL `http://localhost:8686/doantu?phone=0`
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

**Cách B (OBS ở nhà)**: giữ SSH tunnel đó và đặt Browser Source trong OBS là `http://localhost:8686/doantu?phone=0`.

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
- Âm thanh lấy trực tiếp từ trang game (hiệu ứng + giọng MC).

## Cấu hình (`config.json`)

Muốn chỉnh mà không sửa file gốc, tạo `config.local.json` (đã gitignore) chỉ chứa phần cần ghi đè, ví dụ:

```json
{
  "tiktokUsername": "ten_kenh_cua_ban",
  "wordgame": { "roundSeconds": 240 }
}
```

| Khoá | Ý nghĩa |
|---|---|
| `tiktokUsername`, `autoConnect` | Tự kết nối khi khởi động server |
| `signApiKey` | API key Euler Stream (không bắt buộc, giúp kết nối ổn định hơn khi bị giới hạn) |
| `server.host` / `server.port` | Mặc định `127.0.0.1:8686`. Chạy VPS thì đặt `0.0.0.0` **và** đặt `adminToken` |
| `server.adminToken` | Bảo vệ API admin. Mở admin bằng `/admin?token=...` |
| `autoPauseOffline` | Tự tạm dừng game khi chưa live (mặc định bật) |
| `wordgame` | Luật game Đoán từ: thời gian vòng, gợi ý, kho từ, chấm điểm, điểm tuần (`weekly`), đấu đội (`team`), 468 từ có sẵn (`words`) |
| `voice` | Giọng MC ElevenLabs (xem phần Giọng MC) |
| `goodbye` | Hẹn giờ chào tạm biệt / kết thúc live |

Biến môi trường cũng được hỗ trợ: `TIKTOK_USERNAME`, `SIGN_API_KEY`, `HOST`, `PORT`, `ADMIN_TOKEN`.

## Cấu trúc mã

```
server/
  index.js      HTTP + WebSocket hub, API admin, lưu state
  tiktok.js     Kết nối TikTok Live, chuẩn hoá payload, tự kết nối lại
  wordgame.js   Luật game Đoán từ (vòng, gợi ý, quà, thắng / thua)
  scorer.js     Chấm độ gần nghĩa (Claude) + nhận đáp án
  wordbank.js   Kho từ: sinh từ bằng Claude, từ có sẵn, đánh dấu từ đã chơi, chống trùng
  wordsets.js   Bộ từ riêng (trend MXH…) · setgen.js tạo bộ / gợi ý bằng Claude
  weekly.js     Bảng xếp hạng tuần · teams.js đấu đội
  voice.js      Giọng MC ElevenLabs · goodbye.js hẹn giờ kết thúc live · pause.js tạm dừng
  text.js       Bỏ dấu tiếng Việt
public/
  doantu.html, js/wordgame.js   Màn hình game (canvas 1080×1920)
  js/sound.js, js/goodbye.js    Âm thanh WebAudio · màn "Chúc cả nhà ngủ ngon"
  admin.html                    Bảng điều khiển
wordsets/                       Bộ từ có sẵn (trend MXH…)
test/                           npm test
deploy/stream.sh                Phát 24/7: Xvfb + Chrome + PulseAudio + ffmpeg -> RTMP
deploy/bootstrap.sh             Cài trọn gói một lệnh (mặc định: chế độ điện thoại)
deploy/install-ubuntu.sh        Cài lên VPS Ubuntu + dịch vụ systemd (--phone: chỉ server)
deploy/setup-https.sh           Caddy + HTTPS (tên miền miễn phí sslip.io) cho điện thoại
deploy/remote-deploy.sh         Chạy trên VPS khi GitHub Actions deploy (.github/workflows/deploy.yml)
deploy/macos/                   Hẹn giờ tắt MacBook sau khi kết thúc live
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
- Minh bạch với người xem rằng quà tặng là ủng hộ kênh; phần thưởng top tuần do chủ kênh tự trao.

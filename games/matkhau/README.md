# Mật Khẩu Lầy (`matkhau`)

Đặt mật khẩu mới thoả một chuỗi luật hiện dần, càng về sau càng oái oăm: cộng chữ số cho đúng, có tên món ăn, có thứ hôm nay, có giờ hiện tại (đồng hồ chạy!), cấm chữ cái, đúng N chữ in hoa, độ dài là số nguyên tố… Robot **Bé Bảo Mật** chấm và cà khịa từng lần thử.

## Hai chế độ (cài đặt `mode`)

| Chế độ | Ai gõ | Cách chơi |
|---|---|---|
| `host` (mặc định) | Streamer, trong **cửa sổ chơi** (`/o/<mã>?play=1`) | Gõ mật khẩu → **Enter**. Thoả hết luật đang hiện thì hiện luật kế tiếp; qua luật cuối là qua màn. |
| `viewer` | Người xem, bằng **bình luận** | Mỗi bình luận là một lượt thử. Ai thoả hết luật đang hiện thì mở luật mới (+điểm), ai qua luật cuối thì thắng màn. Mỗi người 1 lượt / 1,5 giây. |

Luật luôn có lời giải: bộ giải (`engine/rules.js` → `solve`) dựng thử một mật khẩu trước khi thêm luật mới.

## Tương tác của người xem

- **Tự đặt luật bằng lời (AI duyệt)**: mặc định phải tặng quà **Đặt luật AI** (Tim tay, 5 xu) rồi bình luận luật; tắt `aiRuleNeedsGift` thì ai cũng đặt được bằng bình luận `luật: <gì cũng được>` — vd `luật: phải có tên cầu thủ VN`, `luật: đúng 3 chữ a`, `luật: nghe phải dễ thương`.
  Phần server (`server/index.js`, Claude Haiku, không suy nghĩ) dịch câu đó thành **spec kiểm tra an toàn** (`engine/custom.js`: chứa / không chứa / bắt đầu / kết thúc / một trong danh sách / đếm ký tự / độ dài / tổng chữ số / regex đã lọc an toàn) — engine tự kiểm tra tại chỗ, không gọi API mỗi lần gõ. Kết quả cache theo nội dung luật (bỏ dấu, hoa thường) trong `rule-cache.json`, dùng chung mọi kênh.
  Luật không kiểm tra bằng máy được → **AI chấm** khi host Enter / khi một lượt thử của người xem đã thoả hết luật khác (cache theo luật + mật khẩu).
  AI loại luật tục tĩu, xúc phạm, đòi thông tin cá nhân, không nói về mật khẩu; engine loại thêm luật có từ cấm, trùng hoặc mâu thuẫn với luật đang có (bộ giải không dựng được mật khẩu).
  Giới hạn `freeRulesPerLevel` luật miễn phí mỗi màn, mỗi người chờ `ruleCooldownSeconds`. Quà **Ra luật** đặt thêm không giới hạn. Không có `ANTHROPIC_API_KEY` (hoặc tắt `aiRules`) → luật của người xem chỉ là 1 từ như cũ.

- **Bình chọn luật**: cứ `voteEvery` luật, hai luật ứng viên hiện ra — gõ `1` hoặc `2`.
- **Từ bình luận thành luật**: cứ `viewerRuleEvery` luật, một từ ngắn ai đó vừa bình luận thành luật “Có chữ …” (lọc `bannedWords`).
- **Quà** (gán lại trong dashboard):

| Action | Mặc định | Tác dụng |
|---|---|---|
| 📝 `raluat` | Rose (1 xu) | Bình luận kế tiếp (1 từ) của người tặng thành luật “Có chữ …” — không gọi AI |
| 🤖 `luatai` | Finger Heart (5 xu) | Bình luận kế tiếp là luật BẤT KỲ, AI duyệt và tự kiểm tra |
| 😈 `luatac` | Cap | Thêm ngay 1 luật siêu khó |
| 💻 `hacker` | Doughnut | Xoá sạch mật khẩu host đang gõ (chỉ chế độ host) |
| 🐱 `meo` | Ice Cream Cone | Chèn ký tự lung tung (chỉ chế độ host) |
| 🚫 `camchu` | Perfume | Cấm 1 chữ cái (ưu tiên chữ đang có trong mật khẩu) |
| ⏰ `rutgio` | GG | Bớt `cutSeconds` giây |
| ⇪ `capslock` | TikTok | 15 giây gõ gì cũng ngược hoa / thường (chỉ chế độ host) |
| 🔁 `doiluat` | Hat and Mustache | Đổi 1 luật đã qua thành luật mới |
| 💡 `goiy` | Heart Me, 800 tim | Gợi ý cho luật đang sai |
| ⏳ `themgio` | Rosa | Thêm `addSeconds` giây |
| 🧽 `xoaluat` | Hand Hearts | Xoá 1 luật đang sai |
| 🛡️ `khien` | Sunglasses | Chặn quà phá tiếp theo (tích tối đa 3) |
| 🏆 `qualuon` | Galaxy | Qua màn ngay |

Lệnh của streamer: Xoá 1 luật · +30 giây · Màn tiếp / bắt đầu · Chơi lại từ màn đầu · Xoá bảng điểm.

## Màn chơi

Số luật = `baseRules` + (màn − 1) × `rulesPerLevel` (tối đa `maxRules`); thời gian = `baseSeconds` + `secondsPerRule` × số luật. Hết giờ: tài khoản bị khoá, bị phạt theo cài đặt `punishment`: mặc định **án phạt trong game** cho màn sau (thêm 1 luật siêu khó / bớt 20 giây / cấm sẵn 1 chữ, không cần camera), hoặc phạt bằng giọng nói qua micro (hát, đọc to…), hoặc tắt, lùi 1 màn (`dropLevelOnFail`).

Bảng có thể kéo / phóng / ẩn trong Studio: Bảng quà, Bình chọn luật, Bảng xếp hạng (chế độ người xem).

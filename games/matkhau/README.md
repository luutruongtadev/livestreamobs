# Mật Khẩu Lầy (`matkhau`)

Đặt mật khẩu mới thoả một chuỗi luật hiện dần, càng về sau càng oái oăm: cộng chữ số cho đúng, có tên món ăn, có thứ hôm nay, có giờ hiện tại (đồng hồ chạy!), cấm chữ cái, đúng N chữ in hoa, độ dài là số nguyên tố… Robot **Bé Bảo Mật** chấm và cà khịa từng lần thử.

## Hai chế độ (cài đặt `mode`)

| Chế độ | Ai gõ | Cách chơi |
|---|---|---|
| `host` (mặc định) | Streamer, trong **cửa sổ chơi** (`/o/<mã>?play=1`) | Gõ mật khẩu → **Enter**. Thoả hết luật đang hiện thì hiện luật kế tiếp; qua luật cuối là qua màn. |
| `viewer` | Người xem, bằng **bình luận** | Mỗi bình luận là một lượt thử. Ai thoả hết luật đang hiện thì mở luật mới (+điểm), ai qua luật cuối thì thắng màn. Mỗi người 1 lượt / 1,5 giây. |

Luật luôn có lời giải: bộ giải (`engine/rules.js` → `solve`) dựng thử một mật khẩu trước khi thêm luật mới.

## Tương tác của người xem

- **Bình chọn luật**: cứ `voteEvery` luật, hai luật ứng viên hiện ra — gõ `1` hoặc `2`.
- **Từ bình luận thành luật**: cứ `viewerRuleEvery` luật, một từ ngắn ai đó vừa bình luận thành luật “Có chữ …” (lọc `bannedWords`).
- **Quà** (gán lại trong dashboard):

| Action | Mặc định | Tác dụng |
|---|---|---|
| 📝 `raluat` | Rose | Bình luận kế tiếp của người tặng thành luật bắt buộc |
| 😈 `luatac` | Finger Heart | Thêm ngay 1 luật siêu khó |
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

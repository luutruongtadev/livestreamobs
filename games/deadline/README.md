# 📅 Deadline Dí (`deadline`)

Game văn phòng: streamer phải xong việc trước deadline. Người xem tặng quà để làm sếp soi việc (ping, đến soi, gọi họp, thả virus…) hoặc để cứu (cà phê, gia hạn deadline, thực tập sinh làm hộ). Quà lớn phát meme.

## Hai chế độ (cài đặt `mode`)
- **Máy tính giả lập** (`desktop`, mặc định): game vẽ một cửa sổ máy tính, streamer **tự gõ phím, bấm chuột** để làm mini-việc.
  - Trong dashboard, tab Điều khiển, bấm **Mở cửa sổ chơi** (`/o/<mã>?play=1`). Trong OBS / LIVE Studio, thêm **Window Capture** cửa sổ đó, hoặc giữ Browser Source vì nó tự hiện theo.
  - Cửa sổ chơi tự nhận làm overlay chính và giữ nguyên ván đang chơi.
  - Gõ tiếng Việt bằng Unikey / Telex bình thường. Mặc định gõ không dấu cũng được (`strictAccents`).
- **Camera** (`camera`): streamer làm việc thật trước camera, ví dụ gấp 10 máy bay giấy (đặt việc riêng ở `cameraTask`).
  - Giữa màn hình để trong suốt cho camera.
  - Mỗi bước xong, bấm **+1 bước** trên dashboard hoặc phím **Space / →** trong cửa sổ chơi (**←** để lùi).

## Luật
1. **Mỗi ca** có một nhiệm vụ `steps` bước (mặc định 10) và một deadline `shiftSeconds` (mặc định 5:00). Chức càng cao thì deadline càng ngắn: −8% mỗi bậc, tối thiểu 60%.
2. **Mini-việc** (chế độ máy tính, xoay vòng; mỗi việc xong là +1 bước):
   - ✉️ **Mail:** gõ lại câu rồi Enter.
   - 📥 **Hộp thư:** bấm Lưu hoặc Spam cho 4 thư.
   - 📊 **Bảng tính:** gõ tổng các ô rồi Enter.
   - 📁 **File:** bấm file, rồi bấm đúng thư mục (Ảnh / Tài liệu / Thùng rác).
3. **Xong đủ bước:** hiện **XONG VIỆC!** và lên chức (Thực tập sinh → … → Chủ tịch).
4. **Hết giờ:** hiện **TRỄ DEADLINE!**, kèm hình phạt vui (`punishments`) và xuống 1 chức (`demoteOnFail`).
5. Thẻ kết quả có hai bảng **👔 Sếp soi nhất** và **🤝 Đồng nghiệp tận tâm** (tính theo số xu).

## Sếp ping: câu sếp nhắn do người xem gõ
- Tặng quà ping xong, popup hiện "đang gõ…".
- **Bình luận đầu tiên của chính người tặng** trong `pingWaitSeconds` giây (mặc định 10) thành câu sếp nhắn.
  - Câu được cắt còn 80 ký tự; từ trong `bannedWords` bị thay bằng ***.
  - Không ai gõ thì dùng câu có sẵn.
- Chế độ máy tính: popup che màn hình, streamer phải bấm ✕ mới làm tiếp.
- Chế độ camera: thông báo tự tắt sau `pingSeconds` giây.

## Actions (gán trong dashboard)
| id | Tác dụng (máy tính / camera) | Mặc định |
|---|---|---|
| `ping` | 🔔 Popup sếp nhắn (câu do người tặng gõ) | Rose (1 xu) |
| `soi` | 👀 Sếp ló đầu soi 15 giây, cứ 4,5 giây hỏi một câu | Finger Heart (5) |
| `ban` | 🎯 Ném bút: rung màn hình, mất 3 chữ đang gõ | Doughnut (30) |
| `mayin` | 🖨️ Kẹt máy in: bấm "Gỡ kẹt" 8 lần / chip 12 giây | Perfume (20) |
| `buzz` | 🗣️ Sếp nói trend: gõ đúng nguyên văn câu vào chat team / đọc to | Hat and Mustache (99) |
| `hop` | 🚨 Họp đột xuất: khoá màn hình 20 giây | Money Gun (500) |
| `cattg` | 📄 Cắt giảm nhân sự: −3 bước | Galaxy (1000) |
| `virus` | 👾 Dính virus: xoá 5 mối đe doạ mới làm tiếp | Corgi (299) |
| `lamlai` | 🔁 "Sửa chút": xoá sạch việc đang làm / −1 bước | Cap (99) |
| `cafe` | ☕ +20 giây | Heart Me, 1000 tim |
| `giahan` | 📅 +60 giây | Hand Hearts (100) |
| `intern` | 🧑‍💼 Làm hộ việc đang mở / +1 bước | Sunglasses (199) |
| `thangchuc` | 🏆 Xong ca ngay | Lion (29999) |

Lệnh: `step` (+1 bước), `undo-step`, `next` (ca mới), `clear-board`. `pause` / `resume` do nền tảng cung cấp.

## Meme khi quà lớn
- Meme hoạt hình có sẵn: quà từ `memeMinCoins` xu trở lên (mặc định 5) phát ngay sau chữ lớn. Tối đa 3 meme xếp hàng chờ.
- **Meme có sẵn:** hoạt hình tự vẽ, gồm biểu cảm, câu meme tiếng Việt và âm thanh theo từng loại quà.
- **Video meme của bạn:** dán link vào ô `memeClip_<id>` trong Cài đặt game (mp4 / webm / gif, phát tối đa 6 giây). Quà đã có link thì **luôn phát**, không cần đủ `memeMinCoins` xu.
  - Repo công khai nên game không kèm clip có bản quyền.
  - Cách lấy link: mở [Tenor](https://tenor.com/vi) hoặc [Giphy](https://giphy.com), tìm clip, chuột phải chọn **Sao chép địa chỉ video** sẽ được link `media.tenor.com/….mp4`.
  - Gợi ý từ khoá:

    | Quà | Từ khoá |
    |---|---|
    | Sếp đến soi | "ủa alo", "suspicious" |
    | Họp đột xuất | "meeting", "bored" |
    | Cắt giảm nhân sự | "toang", "fired" |
    | Dính virus | "ét o ét", "panic" |
    | Gia hạn deadline | "relief", "phew" |
    | Thăng chức | "giàu rồi", "money rain" |

  - Link hỏng thì tự quay về meme có sẵn.

## Dữ liệu
`data/office.json`: các chức, nhiệm vụ, câu sếp ping / soi, câu Mail, câu trend văn phòng, thư thường / thư rác, file, virus, hình phạt, câu meme. Sửa trực tiếp file để thêm nội dung.

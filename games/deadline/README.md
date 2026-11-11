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

## 📖 Cốt truyện (cài đặt `story`, bật mặc định, áp dụng cho cả 2 chế độ)
Streamer là nhân viên mới của **Công ty TNHH Deadline Dí**. **Mỗi chức là một chương**, tổng cộng 7 chương:

| Chương | Chức | Tên chương | Nhân vật chính |
|---|---|---|---|
| 1 | Thực tập sinh | Ngày đầu đi làm | 👩‍💼 Chị Hạnh |
| 2 | Nhân viên | Khách hàng khó tính | 🧔 Anh Long |
| 3 | Chuyên viên | Dự án bí mật | 👩‍🔬 Chị Mai |
| 4 | Trưởng nhóm | Lần đầu làm sếp | 🧑‍🎓 Bin và Na |
| 5 | Trưởng phòng | Cuộc họp không hồi kết | 👨‍💼 Giám đốc Phương |
| 6 | Giám đốc | Đối thủ chơi xấu | 🧓 Chủ tịch Bảo |
| 7 | Chủ tịch | Ghế chủ tịch | 🧐 Hội đồng cổ đông |

- **Sang chương mới:**
  - Thẻ mở đầu hiện tên chương, nhân vật chính, lời dẫn và nhiệm vụ riêng của chương.
  - Chế độ máy tính dùng `desktopTask` của chương, chế độ camera dùng `cameraTask`.
  - Thẻ hiện trong `storyBriefSeconds` giây (mặc định 10).
  - Làm lại chương cũ thì chỉ hiện thẻ ngắn.
- **Trong ca:** đến mốc thời gian, các nhân vật (đồng nghiệp, khách hàng, bác bảo vệ…) nhắn tin. Có tin chỉ để kể chuyện, có tin kéo theo một sự kiện:
  - Gây khó: sếp đến soi, họp đột xuất, virus, máy in kẹt, bắt gõ câu trend, xoá việc đang làm.
  - Giúp đỡ: cà phê, gia hạn, làm hộ.
  - Sự kiện chạy giống quà, nhưng nhân vật không được tính vào bảng xếp hạng.
- **Hết ca:** thẻ kết quả có lời kết riêng của chương, khác nhau khi thắng và khi thua.
- **Thắng ca ở chức Chủ tịch:** hiện đoạn kết **KẾT THÚC MÙA N**, rồi bắt đầu **mùa mới** từ chức khởi đầu.
- Sửa nội dung ở `data/office.json` → `story` (`chapters[]`: `title`, `boss`, `intro`, `desktopTask`, `cameraTask`, `events[]` gồm `at` (0–1, theo deadline gốc), `from`, `icon`, `text`, `effect`, `phrase`; `win`, `fail`; `ending[]`).
- Tắt `story` thì game chạy như bản cũ.

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

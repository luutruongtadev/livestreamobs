# 🧠 Nhớ số (`memory`)

Game mẫu thứ hai của nền tảng, dùng để kiểm chứng chuẩn module: không có phần server, chỉ nhận bình luận.

## Luật chơi
1. **Ghi nhớ**: dãy số hiện lên rất nhanh. Chỉnh trong Cài đặt game:
   - **Cách hiện** (`showStyle`):
     - **Từng chữ số loé lên rồi tắt** (mặc định, khó): mỗi lúc chỉ thấy 1 chữ số, ô khác để trống.
     - **Cả dãy cùng lúc** (dễ hơn).
   - **Tốc độ** (`speed`):
     - Chậm: 0,7 giây / chữ số.
     - Vừa: 0,45 giây / chữ số.
     - Nhanh: 0,3 giây / chữ số (mặc định).
     - Siêu tốc: 0,18 giây / chữ số.
     - Tuỳ chỉnh: `msPerDigit`, từ 80 ms trở lên.
   - **Mỗi cấp nhanh thêm** `speedUpPerLevel` % (mặc định 4%), sàn 80 ms / chữ số.
   - **Nhiễu** (`mask`, bật mặc định): sau khi ẩn, các ô nhấp nháy số ngẫu nhiên 1,2 giây để xoá trí nhớ hình ảnh, rồi mới nhận trả lời.
   - Mặc định khó hơn trước: bắt đầu 4 chữ số, mỗi cấp thêm 1 chữ số (`startDigits`, `levelsPerDigit`).
2. **Trả lời**: dãy số ẩn đi, người xem gõ lại vào bình luận. Khoảng trắng / dấu phân cách được bỏ qua, nhận cả chữ số không phải Latin (toàn chiều rộng, Ả Rập…). Bình luận có chữ cái không tính là câu trả lời. Mỗi người **1 lần / vòng**.
3. **Đáp án**: lộ dãy số và danh sách người đúng. Điểm = 50–100% `basePoints`, trả lời càng sớm càng nhiều.
4. Có người đúng → **lên cấp** (cứ `levelsPerDigit` cấp thêm 1 chữ số). Sai liên tiếp `failsToLevelDown` vòng → xuống 1 cấp.

## Màn hình
Header (logo · **cấp** · **số chữ số** · **vòng**) → nhãn pha (👀 ghi nhớ / ⌨️ gõ lại / ✅ đáp án) → **màn số**: ô chữ số lớn (rơi xuống khi vào vòng, lật úp khi ẩn, xanh khi lộ đáp án; dãy dài chia 2 hàng, nhóm 3) + thanh thời gian có vạch từng giây → chip trạng thái (đã trả lời · đúng · sai · còn lượt hiện lại · thêm giờ) → khu giữa theo pha: **ai nhớ đúng nhanh nhất** (thời gian + điểm), lời nhắc + avatar người vừa trả lời (không lộ số / đúng sai), **bục vinh danh** top 3, hoặc **vòng trước** + kỷ lục cấp → **bảng điểm** + **bảng tương tác** (quà → tác dụng, lấy từ trigger streamer gán, có thanh tiến độ gom tim). Âm thanh tổng hợp bằng WebAudio (tắt bằng `?mute=1`).

## Actions (streamer gán quà / tim trong dashboard)
| id | Tác dụng | Mặc định |
|---|---|---|
| `flash` | Hiện lại dãy số một lần trong lúc trả lời (1 lần / vòng) | quà Rose |
| `digit` | Lộ 1 chữ số ngẫu nhiên (tối đa 1/3 dãy; mỗi chữ lộ làm người đúng nhận ít hơn 15% điểm) | quà Finger Heart |
| `time` | +3 giây trả lời (tối đa +9 giây / vòng) | mỗi 300 tim |
| `shield` | Khiên: lần thua tiếp theo không bị giảm cấp (tích tối đa 3) | quà Doughnut |

Chuỗi đúng: ai đúng nhiều vòng liền được cộng thêm 10% điểm mỗi vòng (tối đa +100%), hiện 🔥 trên bảng điểm. Phá kỷ lục cấp trong buổi live thì có banner 🏆.

## Lệnh
`next` (bước tiếp), `restart` (về cấp bắt đầu), `clear-board` (xoá bảng điểm). `pause` / `resume` do nền tảng cung cấp.

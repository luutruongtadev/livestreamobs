# 🧠 Nhớ số (`memory`)

Game mẫu thứ hai của nền tảng, dùng để kiểm chứng chuẩn module: không có phần server, chỉ nhận bình luận.

## Luật chơi
1. **Ghi nhớ**: một dãy số hiện lên trong thời gian ngắn (mặc định 2 giây cho 4 chữ số, tỉ lệ theo độ dài).
2. **Trả lời**: dãy số ẩn đi, người xem gõ lại vào bình luận. Khoảng trắng / dấu phân cách được bỏ qua, nhận cả chữ số không phải Latin (toàn chiều rộng, Ả Rập…). Bình luận có chữ cái không tính là câu trả lời. Mỗi người **1 lần / vòng**.
3. **Đáp án**: lộ dãy số và danh sách người đúng. Điểm = 50–100% `basePoints`, trả lời càng sớm càng nhiều.
4. Có người đúng → **lên cấp** (cứ `levelsPerDigit` cấp thêm 1 chữ số). Sai liên tiếp `failsToLevelDown` vòng → xuống 1 cấp.

## Màn hình
Header (logo · **cấp** · **số chữ số** · **vòng**) → nhãn pha (👀 ghi nhớ / ⌨️ gõ lại / ✅ đáp án) → **màn số**: ô chữ số lớn (rơi xuống khi vào vòng, lật úp khi ẩn, xanh khi lộ đáp án; dãy dài chia 2 hàng, nhóm 3) + thanh thời gian có vạch từng giây → chip trạng thái (đã trả lời · đúng · sai · còn lượt hiện lại · thêm giờ) → khu giữa theo pha: **ai nhớ đúng nhanh nhất** (thời gian + điểm), lời nhắc + avatar người vừa trả lời (không lộ số / đúng sai), **bục vinh danh** top 3, hoặc **vòng trước** + kỷ lục cấp → **bảng điểm** + **bảng tương tác** (quà → tác dụng, lấy từ trigger streamer gán, có thanh tiến độ gom tim). Âm thanh tổng hợp bằng WebAudio (tắt bằng `?mute=1`).

## Actions (streamer gán quà / tim trong dashboard)
| id | Tác dụng | Mặc định |
|---|---|---|
| `flash` | Hiện lại dãy số một lần trong lúc trả lời (1 lần / vòng) | quà Rose |
| `time` | +3 giây trả lời (tối đa +9 giây / vòng) | mỗi 300 tim |

## Lệnh
`next` (bước tiếp), `restart` (về cấp bắt đầu), `clear-board` (xoá bảng điểm). `pause` / `resume` do nền tảng cung cấp.

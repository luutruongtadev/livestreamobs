# ✈️ Đoán cờ vòng quanh thế giới (`flagtrip`)

Cả phòng lái chung một chiếc máy bay. Mỗi chặng hiện một lá cờ, người xem gõ tên nước vào bình luận để bay tiếp.

## Luật chơi
1. **Đoán:** gõ tên nước bằng tiếng Việt, tiếng Anh hoặc tên gọi khác (Mỹ, USA, Hoa Kỳ…).
   - Có dấu hay không dấu đều được; gõ sai 1–2 chữ ở tên dài vẫn nhận.
   - Câu dài hơn 5 từ coi là nói chuyện, không tính.
   - Mỗi người được tính 1 lần mỗi cờ.
   - Mỗi người đoán sai tối đa `maxGuesses` lần mỗi cờ (mặc định 3, 0 = không giới hạn). Hết lượt thì chờ cờ sau. Chỉ tính những lần gõ ra một tên nước; nói chuyện không bị trừ lượt.
2. **Phóng to lá cờ:**
   - Mỗi cờ bắt đầu phóng to (mặc định `zoomStart` ×3,5) vào 1 trong 5 điểm: 4 góc hoặc chính giữa. Cờ sau luôn phóng vào điểm khác cờ trước.
   - Cờ thu nhỏ dần và hiện đủ sau `zoomFullAt`% thời gian đoán (mặc định 75%).
   - Càng về cuối chuyến, độ phóng ban đầu càng lớn, tối đa +50%.
   - Đoán đúng lúc cờ còn phóng to được thưởng điểm tới ×1,5.
   - Quà **Thu nhỏ cờ** tua nhanh 1/3 quá trình; cờ đã hiện đủ thì +5 giây.
   - Tắt bằng cài đặt `zoom`.
3. **Đúng:** người đầu tiên đúng thì đồng hồ còn `lastCallSeconds` giây chốt sổ cho người khác.
   - Điểm: người đầu nhận `basePoints`, mỗi người sau ít hơn 20%.
   - Đã lộ chữ cái hoặc châu lục thì điểm giảm.
4. **Lộ đáp án:** hiện thẻ du lịch gồm thủ đô, 2 danh thắng, món ngon và một điều thú vị.
   - Máy bay bay tới nước đó, đóng dấu hộ chiếu.
   - Nước đó được thắp sáng trên bản đồ suốt buổi live.
   - Có người đúng: máy bay bay tới thủ đô, bản đồ phóng sát vào thủ đô rồi chuyển sang **cảnh thủ đô low poly**:
     - công trình biểu tượng của nước đó dựng dần từ chân lên (khoảng 30 kiểu: tháp Eiffel, Big Ben, chùa Một Cột, kim tự tháp, Taj Mahal, nhà hát Sydney…);
     - phố xá, cây cối và màu đất theo vùng và khí hậu;
     - bầu trời ngày, hoàng hôn hoặc đêm (đêm thì đèn cửa sổ sáng);
     - máy bay bay ngang kéo vệt khói, pháo hoa, băng rôn tên thủ đô.
   - Bảng công trình theo nước nằm ở `render/lowpoly.js` (`LANDMARK`, `LANDMARK_NAME`). Nước chưa có trong bảng thì chọn theo vùng.
   - Thời gian xem thẻ và cảnh: `revealSeconds` (mặc định 10).
5. **Không ai đúng:**
   - Phòng im, không ai đoán: chờ thêm. Im 2 lần thì đổi cờ, không phạt.
   - Có người đoán nhưng sai: máy bay sắp rơi về điểm mốc gần nhất (mỗi `checkpointEvery` chặng). Ai tặng quà **Khiên / cứu** trong `rescueSeconds` giây thì cứu được. Đã tích khiên thì tự đỡ.
   - Đang đứng đúng điểm mốc thì không mất gì.
6. **Hạ cánh:** đủ `tripLength` chặng thì hạ cánh về Hà Nội, tổng kết chuyến (số tem, top phi hành đoàn), rồi bắt đầu chuyến mới.

## Actions (gán trong dashboard)
| id | Tác dụng | Mặc định |
|---|---|---|
| `letter` | Lộ 1 chữ cái, luôn chừa ≥ 1 chữ. Hết lượt thì +3 giây | Rose, 300 tim |
| `time` | +10 giây. Đoán xong sớm thì giây dư để dành cho cờ sau | Finger Heart, follow |
| `zoom` | Thu nhỏ cờ thêm 1/3 quá trình. Cờ đã hiện đủ thì +5 giây | Ice Cream Cone |
| `region` | Chỉ châu lục trên bản đồ. Đã chỉ rồi thì +5 giây | Doughnut |
| `skip` | Đổi cờ khác, giữ nguyên chặng | Perfume |
| `shield` | Đang cứu máy bay thì cứu ngay; lúc khác thì tích khiên (tối đa 3) | Hand Hearts |
| `tailwind` / `storm` / `jet` | Tiến 1 / lùi 1 / tiến 5 chặng | Cap / Hat and Mustache / Money Gun |

## Lệnh
`next`, `skip`, `new-trip`, `clear-board`. `pause` / `resume` do nền tảng cung cấp.

## Dữ liệu
- **`data/countries.json`:** 195 nước (193 thành viên Liên Hợp Quốc, Vatican, Palestine). Mỗi nước gồm tên tiếng Việt, tên gọi khác, thủ đô, toạ độ, châu lục, độ khó 1–3, danh thắng, món ăn, điều thú vị.
- **Cờ:** `assets/flags/*.svg` từ [flag-icons](https://github.com/lipis/flag-icons), giấy phép MIT.
- **Bản đồ:** `data/world-110m.json` từ [world-atlas](https://github.com/topojson/world-atlas), giấy phép ISC, dữ liệu Natural Earth (public domain).

# Rô-bốt Dọn Nhà (`donnha`)

Game 3D tương tác TikTok Live thể loại "hút để lớn": một rô-bốt hút bụi tí hon dọn căn nhà Việt đón Tết. Món nào nhỏ hơn rô-bốt thì hút được và rô-bốt to ra; món to hơn thì chặn đường. Render bằng three.js (bản r160 chép sẵn trong `render/vendor/`, giấy phép MIT).

## Căn nhà
- **Phòng ngủ**: tất, bút chì, đồ chơi, gấu bông, quạt cây, tủ quần áo, giường.
- **Bếp**: chén, cốc, vỏ chai, nồi cơm điện, bánh chưng, bếp ga, ghế nhựa đỏ, tủ lạnh, bàn ăn.
- **Phòng khách**: kẹo Tết, loa, chậu quất, ti vi, bàn trà, sofa.
- **Sân**: dép tổ ong, xô nước, chậu cây, xe đạp, xe máy, cây mai.

## Cấp của rô-bốt
Rô-bốt tí hon → Hút tất dép → Hút nồi niêu → Hút ghế nhựa → Hút bàn ghế → Hút cả sofa → Hút cả xe máy → Siêu rô-bốt. Mỗi ván `roundSeconds` giây, chấm theo % nhà sạch (tính theo diện tích đồ đã hút) và cỡ rô-bốt; có kỷ lục.

## Người xem
- **Lái**: bình luận `trái` / `phải` / `lên` / `xuống` (hoặc `t p l x`, `a d w s`, mũi tên). Cả phòng cùng lái: phiếu trong `steerSeconds` giây gần nhất cộng lại thành hướng đi. Không ai lái thì rô-bốt tự đi hút món gần, đáng giá nhất (`autopilot`).
- **Thả đồ mang tên**: bình luận khác (lần đầu trong ván) thả một món đồ có tên bạn vào nhà; rô-bốt hút trúng thì hiện "Hút luôn chiếc dép của …".
- **Tim**: mỗi `likesPerDust` tim rơi thêm bụi / kẹo quanh rô-bốt.

## Actions (quà mặc định)
| id | Tác dụng | Quà |
|---|---|---|
| `turbo` | Chạy nhanh ×1,8 trong `turboSeconds` giây | Rose |
| `namcham` | Nam châm kéo đồ hút được lại gần | Finger Heart |
| `dicho` | Mẹ đi chợ về: rơi 10 món quanh rô-bốt | Perfume |
| `phinhto` | Phình to ngay +15% | Hand Hearts |
| `sieuhut` | Siêu hút: hút được đồ to gấp 1,6 trong `superSeconds` giây | Galaxy |
| `meo` | Mèo nghịch đuổi theo; đụng là rô-bốt nhả 3 món + choáng (rô-bốt to hơn mèo thì hút luôn mèo) | Doughnut |
| `hetpin` | Hết pin: chạy chậm | Cap |
| `daochieu` | Đảo chiều điều khiển | Sunglasses |
| `bayra` | Chó làm đổ: nhả ra 5 món vừa hút + choáng | Corgi |

## Chế độ streamer (`mode: host`)
Mở **cửa sổ chơi** (`?play=1`): bấm / giữ chuột chỗ muốn tới hoặc dùng WASD / mũi tên. Bình luận vẫn thả đồ mang tên, quà vẫn giúp / phá.

## Lệnh streamer
`next` Nhà mới · `end` Kết thúc ván · `clear-board` Xoá bảng

## Demo
`/demo?game=donnha`.

# Phố Mới

Game xây thành phố 3D chơi một mình trên trình duyệt. Không nối TikTok / livestream, không thuộc `games/`.

- Địa chỉ: `https://<PLAY_DOMAIN>/city` (gateway phục vụ thư mục này ở `/city`). Chạy thử trên máy: `node gateway/index.js` rồi mở `http://localhost:8787/city`.
- Bản lưu nằm trong `localStorage` của trình duyệt: tự lưu 20 giây một lần, 3 ô lưu tay, xuất / nhập file `.json`. Server không giữ gì.

## Cách chơi

1. **Đường**: bấm điểm đầu rồi điểm cuối (hoặc kéo chuột). Chế độ *Cong* thêm một điểm uốn. Ba loại: đường nhỏ 2 làn, đại lộ 4 làn, đường một chiều. *Nâng cấp* đổi loại một đoạn có sẵn, bấm lần nữa lên đường một chiều để đảo chiều. Đường cắt nhau tự sinh nút giao.
2. **Quy hoạch**: hai bên đường tự có 2 hàng ô đất; tô khu dân cư / thương mại / công nghiệp lên đó, nhà tự mọc theo nhu cầu.
3. **Điện, nước**: đường dẫn điện và ống ngầm. Nhà máy đặt trong 2 ô cạnh đường là tự nối; ở xa thì kéo dây điện / ống nước. Mỗi cụm đường nối liền nhau là một mạng có cung cầu riêng. Cần đủ điện, nước sạch và chỗ xả nước thải thì nhà mới mọc; thiếu thì bị bỏ hoang dần.
4. **Dịch vụ**: bãi rác, y tế, trường, công an, cứu hoả, công viên đều có bán kính phục vụ, ảnh hưởng giá trị đất và độ hài lòng. Nhà ngoài vùng cứu hoả có thể cháy.
5. **Tiền**: thuế riêng cho từng loại khu, phí bảo trì hằng tháng, vay tối đa 3 khoản. Nợ quá 30.000 ₫ hoặc âm tiền 180 ngày liền thì phá sản.

## Mã nguồn

| File | Việc |
| --- | --- |
| `js/sim.js` | Mô phỏng: heightmap, graph đường (nút + đoạn Bezier bậc 2, tự cắt tạo nút giao), ô quy hoạch tự sinh, mạng điện nước, nhu cầu, giá trị đất, thu chi, vay nợ. Không đụng DOM, test ở `test/city.test.js` |
| `js/models.js` | Mô hình 3D dựng bằng code (nhà, công trình, cây, xe, cột điện) |
| `js/render.js` | Cảnh three.js: địa hình, nước, mặt đường và nút giao sinh từ graph, bóng đổ, xe chạy theo làn, lớp phủ |
| `js/main.js` | Vòng lặp, chuột / bàn phím, giao diện |
| `vendor/` | three.js r160 (giấy phép MIT) |

Đường nằm tự do (thẳng, chéo, cong) nhưng ô đất vẫn theo một lưới chung 96 × 96: ô nào bị mặt đường đè thì bị chặn, ô trong 2 hàng sát đường thành ô quy hoạch. Nhà quay theo 4 hướng chính về phía đường gần nhất.

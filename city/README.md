# Phố Mới

Game xây thành phố 3D chơi một mình trên trình duyệt. Không nối TikTok / livestream, không thuộc `games/`.

- Địa chỉ: `https://<PLAY_DOMAIN>/city` (gateway phục vụ thư mục này ở `/city`). Chạy thử trên máy: `node gateway/index.js` rồi mở `http://localhost:8787/city`.
- Bản lưu nằm trong `localStorage` của trình duyệt: tự lưu 20 giây một lần, 3 ô lưu tay, xuất / nhập file `.json`. Server không giữ gì. Bản lưu đời trước vẫn mở được: bản chưa có người dân thì đường và nhà giữ nguyên, dân tự dọn về lại; bản chưa có mua đất thì cả bản đồ coi như đã mua, địa hình giữ kiểu cũ (không có núi), điểm phát triển tính bù theo mốc dân số đã đạt.

## Cách chơi

1. **Đường**: bấm điểm đầu rồi điểm cuối (hoặc kéo chuột). Chế độ *Cong* thêm một điểm uốn. Ba loại: đường nhỏ 2 làn, đại lộ 4 làn, đường một chiều. *Nâng cấp* đổi loại một đoạn có sẵn, bấm lần nữa lên đường một chiều để đảo chiều. Đường cắt nhau tự sinh nút giao; ngã tư và ngã ba có đại lộ tự có đèn.
2. **Quy hoạch**: hai bên đường tự có 2 hàng ô đất. Bảy loại khu: nhà ở, chung cư, hỗn hợp, cửa hàng, trung tâm thương mại, văn phòng, công nghiệp. Nhà tự mọc theo nhu cầu và lên tới cấp 5.
3. **Điện, nước**: đường dẫn điện và ống ngầm. Nhà máy đặt trong 2 ô cạnh đường là tự nối; ở xa thì kéo dây điện / ống nước. Cần đủ điện, nước sạch và chỗ xả nước thải thì nhà mới mọc.
4. **Người dân**: mỗi người có tuổi, học vấn, nhà, chỗ làm, tiền, sức khoẻ. Họ dọn tới khi có nhà trống và việc làm, sáng đi làm, chiều về, cuối tuần đi mua sắm; sinh con, đi học, nghỉ hưu, qua đời. Một ngày trong game dài 2 phút ở tốc độ 1 và mỗi ngày là một tuổi.
5. **Giao thông**: xe tìm đường nhanh nhất theo thời gian đi, bám làn, giữ khoảng cách, đổi làn, dừng đèn đỏ. Đường quá tải thì kẹt, người đi làm muộn và kém vui. Chuyến ngắn thì đi bộ trên vỉa hè, chuyến dài đi xe máy hoặc ô tô; mọi chuyến đều hiện ra đường cho tới giới hạn 380 ô tô, 380 xe máy và 500 người đi bộ cùng lúc, vượt quá thì chỉ tính thời gian đi. Ca làm kéo dài 9 giờ tính từ lúc tới nơi, nên đường có người qua lại suốt ngày. Lớp xem *giao thông* tô đỏ đoạn đang kẹt.
6. **Xe dịch vụ**: xe rác, xe cứu thương, xe cứu hoả xuất phát từ công trình và phải chạy tới nơi; kẹt xe thì tới muộn, nhà có thể cháy rụi.
7. **Xe buýt, metro**: vẽ tuyến bằng cách đặt trạm; thêm bớt xe và chỉnh giá vé ở bảng 👥. Người dân tự chọn đi tuyến khi nhanh hơn tự lái.
8. **Doanh nghiệp và hàng hoá**: mỗi cửa hàng, nhà máy, văn phòng có tiền, kho, lương, có thể phá sản. Hàng đi theo chuỗi nguyên liệu → nhà máy → cửa hàng bằng xe tải; thiếu thì nhập, thừa thì xuất qua đường cao tốc ở mép bắc hoặc qua cảng. Mỗi nhà máy chuyên một loại nguyên liệu (nông sản, gỗ, khoáng sản, dầu, cá), không có nguồn trong thành phố thì nhập với giá đắt hơn.
9. **Học vấn**: tiểu học, trung học, đại học có số chỗ và bán kính. Cửa hàng lớn, nhà máy cấp cao và nhất là văn phòng cần lao động có trình độ.
10. **Môi trường**: bốn lớp ô nhiễm riêng (không khí, đất, nước, tiếng ồn). Ô nhiễm làm dân ốm và giảm giá đất; cây xanh và công viên lọc bớt bụi và tiếng ồn.
11. **Tiền**: thuế riêng cho dân cư / thương mại / công nghiệp thu theo lương và doanh thu thật, tiền vé, phí bảo trì mỗi ngày, vay tối đa 3 khoản. Nợ quá 30.000 ₫ hoặc âm tiền 4 ngày liền thì phá sản.
12. **Địa hình và tài nguyên**: ngoài sông, hồ, biển và đồi thoải, bản đồ mới có dãy núi ở xa điểm xuất phát (ô quá dốc chỉ làm đường được). Mỗi vùng có tài nguyên riêng: đất màu mỡ ven nước, rừng, khoáng sản trên núi, dầu, vùng nước có cá. Lớp xem 🗺️ *tài nguyên* chỉ ra chỗ nào có gì.
13. **Khu chuyên biệt** (nhóm ⛏️): nông trại, lâm trường, mỏ, giếng dầu, bến cá. Mỗi khu chỉ mọc trên ô có đúng loại tài nguyên, bán nguyên liệu cho nhà máy cùng ngành trong thành phố, thừa thì xuất khẩu. Mỏ và giếng dầu gây ô nhiễm; nông trại, bến cá gần như không.
14. **Mua đất** (🧭): lúc đầu thành phố chỉ có 9 ô đất 12 × 12 quanh đường dẫn vào (nới thêm nếu chưa chạm bờ nước). Đường, quy hoạch, công trình chỉ đặt được trên đất đã mua. Mua thêm ô kề bên; càng có nhiều đất, ô sau càng đắt, ô nhiều nước thì rẻ hơn.
15. **Điểm phát triển và cây công nghệ** (🔬): bắt đầu có 3 điểm, mỗi mốc dân số thưởng thêm. Tiêu điểm để mở khu chuyên biệt, module, công trình biểu tượng và ba chính sách (mua đất rẻ hơn, khai thác nhanh hơn, xuất khẩu được giá). Tổng điểm không đủ mở hết.
16. **Module**: bấm vào một công trình đã xây để gắn thêm module (tổ máy phụ, bộ lọc khói, bể chứa, dãy phòng học, khoa nội trú, chốt trực, tầng đỗ xe, vườn hoa…). Module tăng công suất, số xe hoặc bán kính, giá và phí bằng một phần công trình gốc.
17. **Công trình biểu tượng** (🗽): tượng đài, chợ trung tâm, nhà hát lớn, tháp truyền hình, Tháp Phố Mới. Mỗi thành phố xây một cái mỗi loại; chúng cộng hài lòng, thuế thương mại hoặc sức hút dân cho cả thành phố.

## Mã nguồn

| File | Việc |
| --- | --- |
| `js/base.js` | Hằng số, bảng định nghĩa (khu, tài nguyên, đường, công trình, module, cây công nghệ, giá hàng), hàm thuần dùng chung |
| `js/sim.js` | Lõi: heightmap và núi, bản đồ tài nguyên, đất đã mua, graph đường (nút + đoạn Bezier bậc 2), ô quy hoạch, mạng điện nước, ô nhiễm, giá đất, xây / lên cấp, module, cây công nghệ, thu chi, lưu nạp |
| `js/people.js` | Từng người dân (vòng đời, việc làm, lịch đi lại, sức khoẻ) và từng doanh nghiệp (kho, lương, lãi lỗ, giao hàng), xe dịch vụ, cháy |
| `js/traffic.js` | Tìm đường Dijkstra theo thời gian, xe bám làn, đèn tín hiệu, kẹt xe |
| `js/transit.js` | Tuyến xe buýt và metro, khách chờ ở trạm, chọn tuyến |
| `js/models.js` | Mô hình 3D dựng bằng code (nhà 12 khu × 5 cấp, công trình, công trình biểu tượng, khối module, xe, trạm) |
| `js/render.js` | Cảnh three.js: địa hình, đường, xe, đèn, ray metro, lớp phủ |
| `js/main.js` | Vòng lặp, chuột / bàn phím, giao diện |
| `vendor/` | three.js r160 (giấy phép MIT) |

Các module mô phỏng không đụng DOM và có test ở `test/city.test.js`.

Đường nằm tự do (thẳng, chéo, cong) nhưng ô đất vẫn theo một lưới chung 96 × 96: ô nào bị mặt đường đè thì bị chặn, ô trong 2 hàng sát đường thành ô quy hoạch. Nhà quay theo 4 hướng chính về phía đường gần nhất.

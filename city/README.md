# Phố Mới

Game xây thành phố 3D chơi một mình trên trình duyệt. Không nối TikTok / livestream, không thuộc `games/`.

- Địa chỉ: `https://<PLAY_DOMAIN>/city` (gateway phục vụ thư mục này ở `/city`). Chạy thử trên máy: `node gateway/index.js` rồi mở `http://localhost:8787/city`.
- Cách chơi: kéo đường, tô khu dân cư / thương mại / công nghiệp cạnh đường, đặt nguồn điện và nước, rồi thêm công viên, trường, y tế, công an, cứu hoả để nhà lên cấp. Thu thuế hằng tháng, đạt mốc dân số thì được thưởng và mở khoá công trình mới.
- Bản lưu nằm trong `localStorage` của trình duyệt (tự lưu 20 giây một lần), server không giữ gì.

| File | Việc |
| --- | --- |
| `js/sim.js` | Mô phỏng: địa hình, đường, quy hoạch, nhu cầu, điện nước, giá trị đất, thu chi. Không đụng DOM, test ở `test/city.test.js` |
| `js/models.js` | Mô hình 3D dựng bằng code (nhà, công trình, cây, xe) |
| `js/render.js` | Cảnh three.js: địa hình, nước, đường, bóng đổ, xe chạy, lớp phủ |
| `js/main.js` | Vòng lặp, chuột / bàn phím, giao diện |
| `vendor/` | three.js r160 (giấy phép MIT) |

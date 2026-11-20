# Phố Mới — kế hoạch chơi nhiều người

Trạng thái: **đang bàn, chưa làm**. Ghi lại các quyết định và việc cần làm từ buổi bàn ngày 2026-11-20.

## 1. Đã chốt

- **Mỗi người chơi giữ thành phố riêng**, cạnh tranh về kinh tế và dân cư. Có bảng hạng theo mùa; không cần online cùng lúc.
- **Không có hành động nhắm vào đối thủ** (không chiêu mộ, không phá giá chủ động, không "đánh" thành phố khác). Cạnh tranh chỉ đến từ cơ chế game:
  - chính sách tốt (việc làm, nhà ở, dịch vụ, thuế hợp lý) thì dân tự chuyển tới;
  - tự hạ giá bán trên chợ chung là phá giá;
  - giảm thuế doanh nghiệp, thuế nhập khẩu nguyên liệu thì doanh nghiệp tới;
  - khai thác du lịch tốt thì khách tự đến.
- **Kinh tế khép kín** (ba định luật bảo toàn):
  1. **Người chỉ sinh ra từ người.** Tổng dân của nhóm chỉ đổi vì sinh và mất; người nhập cư đến từ vùng nông thôn hoặc thành phố khác, và nơi đó mất đúng số người đó. Du khách là dân thành phố khác đi chơi rồi về.
  2. **Tiền không in thêm.** Mọi khoản tiền nằm trong một ví (ngân sách thành phố, hộ dân, doanh nghiệp, ngân hàng trung ương); mọi giao dịch là chuyển giữa các ví.
  3. **Hàng hoá và năng lượng phải được sản xuất.** Tài nguyên có trữ lượng và cạn dần; rừng và cá hồi lại theo tốc độ riêng; điện than và điện dầu đốt nhiên liệu thật.
- **Máy chủ chia nguồn chung** (dân chuyển nhà, doanh nghiệp mới, du khách, nhu cầu của chợ) theo sức hút của từng thành phố. Máy chủ chỉ đóng vai những người muốn chuyển đi, mỗi người tự chọn nơi đến theo chính sách của thành phố.

## 2. Hiện trạng mã (để biết phải sửa gì)

- Game chạy hoàn toàn trong trình duyệt; bản lưu nằm trong `localStorage` (`main.js`, khoá `phomoi.v2.*`).
- **Tiền tự sinh ra:**
  - thuế tính như một phần lương nhưng lương không bị trừ từ ai (`people.js`, `hourInc.r`);
  - tiền vé xe buýt và tàu (`transit.js`, `ships.js`);
  - thưởng mốc dân số (`sim.js`, `m.reward`);
  - tài trợ và nhà đầu tư từ hội đồng (`council.js`);
  - vay ngân hàng (`takeLoan`).
- **Tiền tự biến mất:** phí bảo trì, tiền xây dựng, mua đất. Các khoản này trừ khỏi `c.money` nhưng không tới ai.
- **Người tự xuất hiện:** người nhập cư và du khách tính riêng từng thành phố, không có tổng chung (`econ.js` `tourismScore`, `intl.js` `immigPer`).
- **Tài nguyên** (`c.res`) khai thác mãi không cạn.
- **Có sẵn để dùng lại:**
  - gateway có WebSocket `/ws` và Supabase (Auth, PostgREST, `supabase/migrations`);
  - `sim.js` chạy được trên Node (bộ test đang dùng), nên máy chủ có thể nạp bản lưu để tính lại;
  - các chỗ nối "thế giới bên ngoài" có sẵn: cổng mép bản đồ, cảng, sân bay, đường sắt, giá thị trường (`econ.js`).

## 3. Việc cần làm

### Giai đoạn A — chuẩn bị trong game (chưa cần máy chủ)

1. **Sổ cái kinh tế khép kín.** Mọi khoản tiền là chuyển giữa các ví:

   | Khoản | Từ | Tới |
   |---|---|---|
   | Thuế | hộ dân, doanh nghiệp | ngân sách |
   | Bảo trì | ngân sách | lương công chức, công ty bảo trì |
   | Xây dựng | ngân sách | công ty xây dựng (rồi thành lương) |
   | Mua đất | ngân sách | ngân hàng trung ương / nông thôn |
   | Xuất nhập khẩu | doanh nghiệp bên mua | doanh nghiệp bên bán |
   | Vay | dự trữ có hạn của ngân hàng trung ương | trả lại kèm lãi |
   | Vé xe, phòng khách sạn | hộ dân / du khách | ngân sách |

   Thưởng mốc dân số chỉ cho điểm phát triển, không cho tiền. Tài trợ và nhà đầu tư lấy từ một ví có hạn.
2. **Sổ dân.** Mỗi người đến hoặc đi đều có nơi xuất phát và nơi đến. Thêm vùng **nông thôn** có sinh và mất, là nguồn dân ban đầu.
3. **Tài nguyên có trữ lượng.** Mỏ cạn dần; rừng và cá hồi lại; nhà máy điện than, dầu tiêu tốn nhiên liệu.
4. **Tách "thế giới bên ngoài" thành một bộ phận thay được:**
   - "thế giới máy" có ví và dân hữu hạn, dùng cho chơi một mình;
   - "máy chủ vùng", dùng cho chơi nhiều người.
5. **Bản tóm tắt mỗi ngày game** của thành phố:
   - số nhà trống, số chỗ làm trống, mức lương, thuế, mức hài lòng, giá đất, dịch vụ, ô nhiễm;
   - số người muốn rời đi, chia theo nhóm;
   - hàng chào bán hoặc cần mua kèm giá;
   - sức hút du lịch.
6. **Chạy bù khi mở lại:** thành phố tự chạy nhanh quãng thời gian đã qua lúc offline, có giới hạn.
7. Cân bằng và thử kỹ trong chế độ chơi một mình (test gộp, ít mà đủ).

### Giai đoạn B — tài khoản và lưu đám mây

8. Đăng nhập bằng Supabase Auth có sẵn; thêm bảng `profiles`.
9. Lưu thành phố lên Supabase Storage (nén), khoảng 5 phút một lần; mở được trên máy khác. Bảng `cities` giữ thông tin thành phố và đường dẫn tới bản lưu.

### Giai đoạn C — nhóm cạnh tranh và nguồn chung

10. **Nhóm cạnh tranh** khoảng 20–50 thành phố, ghép theo điểm gần nhau. Mùa dài 2 tuần. Chế độ cạnh tranh dùng đồng hồ thật, không tua nhanh.
11. **Máy chủ chia nguồn mỗi ngày game.** Một vòng gồm:
    1. Thành phố gửi bản tóm tắt (bảng `city_reports`).
    2. Máy chủ gom người chuyển nhà: dân dư ở nông thôn, người muốn rời các thành phố, người hôm qua chưa có chỗ.
    3. Mỗi nhóm người chọn nơi đến theo điểm riêng:
       - sinh viên: trường đại học, nhà rẻ;
       - người học vấn cao: lương, việc văn phòng;
       - người già: y tế, yên tĩnh.
    4. Chia tỷ lệ với điểm, theo hàm giảm dần (căn hoặc log). Mỗi thành phố nhận tối đa bằng số nhà trống; số dư để sang hôm sau.
    5. Kết quả gửi về thành phố. Người rời đi bị xoá đúng lúc người đến được thêm vào nơi mới.

    Sinh con vẫn tính ngay trong từng thành phố, không qua máy chủ. Doanh nghiệp mới và du khách chia theo cùng cách.
12. **Chợ chung:**
    - nhu cầu mua từ ngoài mỗi ngày có hạn;
    - giá tính theo tổng cung của cả nhóm;
    - người chào giá thấp được bán trước;
    - bán dưới giá vốn thì lỗ thật, nhà máy phá sản dần.

    Giao dịch ghi vào sổ `trades` với cả hai bên.
13. **Thành phố đang offline:** máy chủ dùng bản tóm tắt cuối cùng của họ. Họ vẫn nhận người nếu còn nhà trống, vẫn mất người bất mãn; khi mở lại thì chạy bù.
14. **Thành phố bị bỏ** khoảng 7 ngày: dân và tiền chảy dần về nông thôn; người chơi quay lại thì thành phố nhỏ đi nhưng vẫn còn.
15. **Bảng dữ liệu:** `profiles`, `groups`, `group_members`, `cities`, `city_reports`, `trades`, `seasons`, kèm Row Level Security theo người chơi. Bản tóm tắt và chia nguồn đi qua HTTP thường; thông báo và ai đang online đi qua `/ws`.

### Giai đoạn D — chống gian lận

16. Mỗi thành phố có sổ tiền vào ra và dân vào ra. Máy chủ kiểm tra tổng tiền và tổng dân của nhóm luôn khớp với sổ.
17. Định kỳ khoảng 1 giờ thật, máy chủ nạp bản lưu và tính lại bằng `sim.js` để đối chiếu. Số liệu không khớp thì khoá giao dịch và không cho nhận nguồn chung.
18. Lượng hàng chào bán bị giới hạn theo năng lực sản xuất thật của thành phố.

### Giai đoạn E — hiển thị và cảm giác cạnh tranh

19. **Báo cáo mỗi ngày:** bao nhiêu người đến từ đâu, đi đâu, vì sao. Ví dụ: "đi vì thất nghiệp 12%, đến TP X vì lương cao hơn 15%".
20. **Bảng hạng theo điểm thịnh vượng** (dân số, GDP, mức hài lòng). Các bậc: Làng, Thị trấn, Thị xã, Thành phố, Đô thị loại I, Siêu đô thị. Có thưởng cuối mùa.
21. **Bảng so sánh chính sách** với các thành phố trong nhóm: thuế, giá bán, sức hút.
22. **Đi thăm 3D thành phố người khác** (chỉ xem).
23. Xe tải, tàu, máy bay chở hàng và khách từ thành phố khác hiện ở cổng, có ghi tên thành phố.

### Để sau

- Liên minh: buôn bán ưu đãi, tặng hàng, đua nhóm.
- Bán điện, nước cho thành phố khác.
- Chat.

## 4. Luật cân bằng cần có từ đầu

- **Không đua hạ thuế xuống đáy:** thuế thấp thì thu ít, không đủ nuôi dịch vụ, mức hài lòng giảm. Thuế 0% không được là cách thắng.
- **Không để giàu càng giàu:** lợi thế giảm dần trong công thức chia; thành phố to thì đông đúc, đất đắt, kẹt xe nên sức hút giảm.
- **Phần riêng không phải tranh** (sinh con, khách trong vùng, xưởng nhỏ địa phương) để không thành phố nào bị đói hẳn.
- **Không ôm tiền:** thuế, bảo trì và lãi tiết kiệm thấp đẩy tiền ra lưu thông; nếu chưa đủ thì thêm phí giữ tiền nhỏ trên ngân sách quá lớn.
- **Khởi đầu không buồn tẻ:** nhóm dân khởi đầu (lấy từ nông thôn) và khoản vay khởi nghiệp phải đủ để vài giờ đầu vẫn vui.
- **Nhịp mùa:** đầu mùa nông thôn đông người, ai cũng lớn được; cuối mùa nguồn chính là người rời từ thành phố khác, cạnh tranh gay gắt hơn.

## 5. Còn cần quyết

| # | Câu hỏi | Đề xuất |
|---|---|---|
| 1 | Ai là người chơi: streamer với tài khoản có sẵn, hay người chơi thường? | chưa chọn |
| 2 | Chế độ chơi một mình giữ như hiện tại, hay cũng chuyển sang kinh tế khép kín? | khép kín, với "thế giới máy" hữu hạn |
| 3 | Tổng tiền cố định tuyệt đối, hay tăng chậm? | tăng khoảng 2% mỗi mùa theo mức tăng dân |
| 4 | Tốc độ đồng hồ cạnh tranh | 1 ngày game = 1 giờ thật |
| 5 | Tỷ lệ tăng dân: phần riêng / nguồn chung | khoảng 35% / 65% |
| 6 | Mức sàn mất dân và ưu tiên người mới vào giữa mùa | tối đa khoảng 3% dân mỗi ngày; người mới được ưu tiên nhận dân từ nông thôn vài ngày đầu |
| 7 | Thành phố bị bỏ: dân và tiền tự chảy đi sau bao lâu | khoảng 7 ngày |
| 8 | Cỡ nhóm cạnh tranh | 20–50 thành phố, ghép theo điểm |

## 6. Ước lượng

- **Bản lưu:** khoảng 100–300 KB mỗi thành phố (chưa đo). Gói miễn phí của Supabase đủ cho vài chục người chơi.
- **Phần nặng nhất:** giai đoạn A (viết lại dòng tiền và dòng người trong toàn bộ mô phỏng). Nên làm trước, vì không cần máy chủ và chế độ chơi một mình cũng được lợi.

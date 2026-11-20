# Phố Mới — kế hoạch chơi nhiều người

Trạng thái: **đang bàn, chưa làm**. Ghi lại các quyết định và việc cần làm từ các buổi bàn ngày 2026-11-20.

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

- **Thuế nhập khẩu theo loại hàng** do mỗi thành phố tự đặt, áp lên hàng từ thành phố khác (xem mục 3, việc 12b).
- **Mô hình kinh tế** thật nhất mà vẫn là game, chia ba nhóm ưu tiên A, B, C (xem mục 5).
- **Cuối game** (đất đã kín, công trình đã đủ), xem mục 4:
  - điểm mùa tính theo mức cải thiện và chất lượng sống, không theo tổng dân;
  - thêm nhà cấp 6–7 và cải tạo đô thị để tăng mật độ;
  - hết mùa thì giữ thành phố, chỉ reset điểm mùa.

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

**Tiến độ** (giai đoạn A xong; còn lại các điểm ghi chú bên dưới)

- [x] **A1 — sổ cái tiền** (`js/ledger.js`): mọi khoản tiền vào / ra đều ghi sổ với bên đối ứng; bảo toàn: tổng tiền trong thành phố + bên ngoài = mốc (có test). Bảng ngân sách có mục "Dòng tiền hôm qua".
- [x] **A2 — khép vòng tiền bên trong:**
  - tiền của dân, doanh nghiệp nhân hệ số `MK` (base.js) để thuế thu đúng phần trăm thu nhập thật mà ngân sách vẫn như cũ;
  - thuế = đúng phần trừ vào lương / doanh thu; tiền nhà về chủ nhà (ví toà nhà), chủ nhà nộp thuế nhà đất và thuê sửa chữa;
  - bảo trì, xây dựng, chi phí cố định của doanh nghiệp thành hợp đồng cho doanh nghiệp trong thành phố (`procure`, phần vượt năng lực thì thuê ngoài);
  - dân mua hàng qua nhu cầu gộp bị trừ ví thật; doanh nghiệp có lãi chia lợi nhuận cho dân.
  - Cân bằng sau 21 ngày thử: dân số, ngân sách gần như cũ.
- [x] **A3 — sổ dân:** người đến từ nông thôn (12.000 người, tự sinh / mất) hoặc nước ngoài, người đi về nông thôn; nông thôn cạn thì hết người chuyển đến. Bảo toàn tuyệt đối (có test). Bảng dân cư có mục "Dân đến, đi".
- [x] **A4 — tài nguyên có trữ lượng** (`js/reserve.js`): khoáng sản, dầu cạn hẳn và biến khỏi bản đồ; rừng, cá, đất màu tự hồi mỗi ngày; lưu lại được; trữ lượng hiện khi bấm cơ sở khai thác.
- [x] **A5 — thế giới bên ngoài thay được** (`js/world.js`): provider `ai` (thế giới máy) và `registerWorld` cho provider khác; bản tóm tắt mỗi ngày (`dailyReport`: nhà, việc trống, lương, thuế, hài lòng, người muốn đi và lý do, hàng chào bán, du lịch, GDP); điểm thịnh vượng thử (`prosperity`); chạy bù `catchUp` có giới hạn.

- [x] **A6 — thế giới máy có hạn** (chốt 2026-11-20: chơi một mình cũng khép kín; tổng tiền tăng chậm):
  - ví thế giới bên ngoài có số dư (4 triệu ₫ lúc đầu, lưu theo bản lưu), mỗi ngày phát hành thêm khoảng 2% mỗi mùa 14 ngày;
  - xuất khẩu, du khách, khách vãng lai, văn phòng bán ra ngoài, tiền phòng, vốn toà nhà mới, tiền người mới mang theo, thưởng mốc đều lấy từ ví này và giảm theo sức mua (`worldK`) khi ví còn dưới một nửa;
  - ngân hàng không cho vay khi thế giới cạn tiền; người nước ngoài nhập cư có hạn (8.000 người);
  - vé xe buýt, tàu điện trừ ví người đi; phí đường, vé tàu thuỷ trừ chung ví dân;
  - bảng ngân sách hiện số dư thế giới bên ngoài; bấm ô 💰 mở bảng ngân sách.

**Còn để sau:**
- Dịch vụ công chưa cần nhân viên thật (mục 5.1 điểm 6); lương chưa theo cung cầu (điểm 3); giá cả, lạm phát (điểm 4).
- Chạy bù chưa gắn vào giao diện (chỉ dùng khi có chế độ cạnh tranh với đồng hồ thật).

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
12b. **Thuế nhập khẩu giữa các thành phố** (mỗi thành phố tự đặt, theo từng loại hàng):
    - Giá thành phố B phải trả = giá chào của A × (1 + thuế của B với loại hàng đó). Chợ chung ghép người mua với nơi bán có giá sau thuế rẻ nhất.
    - Tiền thuế vào ngân sách của B (nơi nhập), tức là chuyển từ doanh nghiệp của B sang ngân sách của B, nên tổng tiền của nhóm vẫn khớp.
    - **Cái được:** thêm thu ngân sách; bảo vệ nhà máy và việc làm trong nước.
    - **Cái giá:** nhà máy cần nguyên liệu ngoài phải mua đắt hơn; hàng tiêu dùng đắt làm mức hài lòng giảm nhẹ; điểm "môi trường kinh doanh" giảm nên ít doanh nghiệp mới chọn đến.
    - **Hệ quả tự nhiên:** nơi thuế thấp thành trung tâm thương mại; thuế trả đũa và chiến tranh thương mại tự nổi lên từ chính sách, không cần cơ chế tấn công.
    - **Luật chặn:** trần thuế khoảng 50%; đổi thuế có hiệu lực sau 1 ngày game, mỗi loại hàng đổi tối đa 1 lần mỗi ngày; thuế của mọi thành phố hiện công khai trên bảng so sánh chính sách.
    - Trong chế độ chơi một mình, thuế áp lên hàng của "thế giới máy".
13. **Thành phố đang offline:** máy chủ dùng bản tóm tắt cuối cùng của họ. Họ vẫn nhận người nếu còn nhà trống, vẫn mất người bất mãn; khi mở lại thì chạy bù.
14. **Thành phố bị bỏ** khoảng 7 ngày: dân và tiền chảy dần về nông thôn; người chơi quay lại thì thành phố nhỏ đi nhưng vẫn còn.
15. **Bảng dữ liệu:** `profiles`, `groups`, `group_members`, `cities`, `city_reports`, `trades`, `seasons`, kèm Row Level Security theo người chơi. Bản tóm tắt và chia nguồn đi qua HTTP thường; thông báo và ai đang online đi qua `/ws`.

### Giai đoạn D — chống gian lận

16. Mỗi thành phố có sổ tiền vào ra và dân vào ra. Máy chủ kiểm tra tổng tiền và tổng dân của nhóm luôn khớp với sổ.
17. Định kỳ khoảng 1 giờ thật, máy chủ nạp bản lưu và tính lại bằng `sim.js` để đối chiếu. Số liệu không khớp thì khoá giao dịch và không cho nhận nguồn chung.
18. Lượng hàng chào bán bị giới hạn theo năng lực sản xuất thật của thành phố.

### Giai đoạn E — hiển thị và cảm giác cạnh tranh

19. **Báo cáo mỗi ngày:** bao nhiêu người đến từ đâu, đi đâu, vì sao. Ví dụ: "đi vì thất nghiệp 12%, đến TP X vì lương cao hơn 15%".
20. **Bảng hạng theo điểm mùa** (cách tính ở mục 4.1), chia theo cỡ thành phố. Các bậc: Làng, Thị trấn, Thị xã, Thành phố, Đô thị loại I, Siêu đô thị. Có thưởng cuối mùa.
21. **Bảng so sánh chính sách** với các thành phố trong nhóm: thuế, giá bán, sức hút.
22. **Đi thăm 3D thành phố người khác** (chỉ xem).
23. Xe tải, tàu, máy bay chở hàng và khách từ thành phố khác hiện ở cổng, có ghi tên thành phố.

### Để sau

- Liên minh: buôn bán ưu đãi, tặng hàng, đua nhóm.
- Bán điện, nước cho thành phố khác.
- Chat.

## 4. Cuối game: khi đất đã kín, công trình đã đủ

Giới hạn hiện có: bản đồ cố định (96, 128 hoặc 160 ô mỗi cạnh) và mua đất tối đa hết bản đồ; nhà tối đa cấp 5 (`MAX_LEVEL`); các mốc dân số và cây công nghệ đều có điểm cuối. Hướng chung: khi hết chỗ mở rộng, mục tiêu đổi từ **làm to hơn** sang **làm tốt hơn**.

### 4.1 Điểm mùa (đã chốt)

- Điểm mỗi mùa tính trên **mức cải thiện trong mùa** và **chất lượng sống**, không tính tổng dân tuyệt đối:
  - GDP trên đầu người, mức hài lòng, tuổi thọ;
  - thời gian đi làm, ô nhiễm, tội phạm, nợ công.
- Bảng hạng chia theo cỡ thành phố: thành phố nhỏ chỉ đua với thành phố nhỏ.
- Thành phố đã đầy vẫn lên hạng được bằng cách làm cho dân sống tốt hơn.

### 4.2 Tăng mật độ thay cho tăng diện tích (đã chốt)

- **Nhà cấp 6–7:** cao ốc và tháp chọc trời. Chỉ lên được khi giá đất cao, có metro và đủ lao động có trình độ.
- **Cải tạo đô thị:** phá khu nhà thấp tầng cũ để xây cao hơn. Trong lúc cải tạo, dân phải tạm chuyển đi và có thể sang thành phố khác; đây là quyết định có cái giá thật.
- **Lấn biển, san núi** bằng công cụ địa hình có sẵn, nhưng rất đắt và tốn tài nguyên.

### 4.3 Hết mùa (đã chốt)

- **Giữ thành phố, chỉ reset điểm mùa.** Không ai mất công xây; nhờ điểm tính theo mức cải thiện nên người chơi lâu năm và người mới vẫn đua công bằng.

### 4.4 Áp lực không bao giờ dừng

Để thành phố đầy không tự chạy một mình:

- **Hạ tầng già đi:** đường xuống cấp (đã có); thêm ống nước, cầu và công trình xuống cấp, phải duy tu hoặc xây lại.
- **Dân già đi:** thành phố cũ đông người già, ít người lao động; phải có chính sách hút người trẻ, mà trong kinh tế khép kín người trẻ phải giành từ thành phố khác.
- **Tài nguyên cạn:** ngành khai thác chết dần, buộc chuyển sang chế biến, văn phòng, du lịch.
- **Người dân đòi hỏi cao dần:** tiêu chuẩn "đủ tốt" tăng theo mùa.
- **Chu kỳ kinh tế và thiên tai:** giá thị trường biến động, các loại thiên tai hiện có.

### 4.5 Mục tiêu dài hơi

- **Đại công trình:** sân bay quốc tế lớn, khu công nghệ cao, cảng nước sâu, lễ hội quốc tế. Cần rất nhiều tiền, hàng hoá và lao động trong nhiều ngày; cho điểm và sức hút lớn, nhưng làm cạn nguồn lực trong lúc xây.
- **Lập thành phố mới** khi đã đạt bậc cao nhất:
  - mang theo điểm danh tiếng (mở sẵn vài công nghệ, thêm dân khởi đầu);
  - thành phố cũ vẫn còn, làm "thành phố chị em" để giao thương.

### 4.6 Việc cần làm cho phần cuối game

1. Công thức điểm mùa và bảng hạng chia theo cỡ thành phố (gộp vào giai đoạn E).
2. Nhà cấp 6–7 và điều kiện lên cấp; công cụ cải tạo đô thị với dân tạm chuyển đi (làm được ngay trong chế độ chơi một mình, cùng giai đoạn A).
3. Xuống cấp cho ống nước, cầu, công trình; dân già đi; tiêu chuẩn hài lòng tăng theo mùa.
4. Đại công trình và lập thành phố mới mang theo điểm danh tiếng (để sau, khi đã có máy chủ).

## 5. Mô hình kinh tế: thật nhất mà vẫn là game

Mục tiêu: mỗi đồng tiền và mỗi người đều có nguồn gốc và lý do rõ ràng, nhưng người chơi chỉ điều khiển bằng chính sách, không quản lý từng người.

### 5.1 Nhóm A — bắt buộc để kinh tế khép kín chạy được (làm cùng giai đoạn A)

1. **Ngân sách hộ gia đình.**
   - Thu: lương, lương hưu, trợ cấp thất nghiệp (nếu thành phố chi).
   - Chi: tiền nhà, ăn uống, đi lại, điện nước, giải trí, thuế; phần còn lại là tiết kiệm.
   - Tiền chi tiêu của dân là doanh thu của cửa hàng, nhà hàng, xe buýt; dân nghèo đi thì thương mại co lại.
   - Đã có tiền từng người (`pp.money`); cần thêm phần chi tiêu.
2. **Lãi lỗ doanh nghiệp.**
   - Thu: bán cho dân, cho doanh nghiệp khác, xuất khẩu.
   - Chi: lương, thuê mặt bằng, nguyên liệu, điện nước, thuế, vận chuyển.
   - Có lãi thì mở rộng hoặc lên cấp; lỗ lâu thì phá sản.
   - Đã có `biz.money`, `biz.eff`; cần đủ các khoản chi thật.
3. **Thị trường lao động.** Lương theo cung và cầu từng nhóm học vấn. Lương cao hút dân từ thành phố khác (gắn với máy chủ chia dân) nhưng làm doanh nghiệp tốn kém hơn.
4. **Giá cả và lạm phát trong thành phố.** Mức giá chung theo lượng tiền lưu thông so với lượng hàng có sẵn. Ngân sách tiêu nhiều mà hàng không tăng thì giá tăng, lương thực tế giảm, dân bất mãn. Đây là cái phanh tự nhiên cho việc tiêu tiền ngân sách bừa bãi.
5. **Thị trường nhà đất.** Tiền thuê nhà theo cung và cầu: thiếu nhà thì thuê đắt, dân nghèo bị đẩy đi. Khả năng chi trả tiền nhà là một yếu tố của sức hút dân cư.
6. **Dịch vụ công cần người làm thật.**
   - Bệnh viện, trường học, công an cần nhân viên lấy từ dân của thành phố, trả lương từ ngân sách; thiếu người thì dịch vụ yếu đi.
   - Chi bảo trì là lương công chức, tiền quay lại vòng kinh tế.
7. **Chi phí vận chuyển.** Hàng đi xa, qua cổng, qua cảng đều tốn tiền và có giới hạn công suất; kẹt xe làm hàng đến chậm và tăng giá. Gắn vào xe tải chạy thật đã có.

### 5.2 Nhóm B — nên có, làm cho chính sách có nhiều lựa chọn (sau khi chợ chung chạy)

8. **Nhiều loại thuế, mỗi loại tác động khác nhau:**
   - thuế thu nhập: đánh vào dân;
   - thuế doanh nghiệp: ảnh hưởng mở rộng và việc doanh nghiệp mới chọn đến;
   - thuế tiêu dùng (VAT): làm giá tăng;
   - thuế đất / bất động sản: khuyến khích dùng đất hiệu quả, chống bỏ đất trống;
   - thuế nhập khẩu: xem việc 12b.
9. **Tín dụng và lãi suất.**
   - Doanh nghiệp vay để mở rộng; lãi suất cao thì kinh tế chậm lại, thấp thì dễ nóng lên.
   - Thành phố phát hành **trái phiếu** cho thành phố khác mua: vay mượn giữa người chơi mà tổng tiền vẫn khớp.
10. **Năng suất.** Sản lượng mỗi lao động theo học vấn, công nghệ đã mở, thời gian đi làm, sức khoẻ. Đây là cách thành phố đã đầy đất vẫn tăng GDP.
11. **Chuỗi cung ứng có tồn kho.** Nguyên liệu, chế biến, hàng hoá, bán lẻ, mỗi khâu có kho. Thiếu một khâu thì cả chuỗi chậm lại; gián đoạn (thiên tai, chiến tranh thuế) lan dần qua chuỗi, không xảy ra tức thì.

### 5.3 Nhóm C — để sau, làm sâu thêm (mùa sau)

12. **Chu kỳ kinh tế:** tín dụng dễ dẫn tới bùng nổ rồi suy thoái; cú sốc giá lan sang thành phố khác.
13. **Bất bình đẳng (chỉ số Gini):** khoảng cách giàu nghèo cao thì tội phạm và bất mãn tăng; chính sách phân phối lại có tác dụng thật.
14. **Thị trường cổ phần:** dân và thành phố khác đầu tư vào doanh nghiệp, cổ tức chảy về chủ sở hữu.

### 5.4 Nguyên tắc để vẫn là game

- **Tính theo nhóm, không theo từng người:** gom theo ô, theo loại doanh nghiệp, theo nhóm học vấn. Máy chạy nổi, và máy chủ tính lại để đối chiếu được.
- **Mỗi chỉ số có lý do đọc được**, ví dụ "Giá tăng 8% vì ngân sách chi nhiều hơn sản xuất".
- **Người chơi chỉ điều khiển chính sách:** thuế, chi tiêu, quy hoạch, lãi suất. Không điều khiển từng doanh nghiệp.
- **Trễ có kiểm soát:** chính sách có hiệu lực sau vài ngày game, nhưng không chậm tới mức không thấy kết quả.
- **Kết quả tính chắc chắn:** cùng đầu vào thì cùng kết quả; ngẫu nhiên lấy từ seed để máy chủ tính lại được.
- **Bảng chỉ số kinh tế:** GDP, lạm phát, thất nghiệp, cán cân thương mại, nợ công, lương trung bình, giá nhà, kèm biểu đồ.

## 6. Luật cân bằng cần có từ đầu

- **Không đua hạ thuế xuống đáy:** thuế thấp thì thu ít, không đủ nuôi dịch vụ, mức hài lòng giảm. Thuế 0% không được là cách thắng.
- **Không để giàu càng giàu:** lợi thế giảm dần trong công thức chia; thành phố to thì đông đúc, đất đắt, kẹt xe nên sức hút giảm.
- **Phần riêng không phải tranh** (sinh con, khách trong vùng, xưởng nhỏ địa phương) để không thành phố nào bị đói hẳn.
- **Không ôm tiền:** thuế, bảo trì và lãi tiết kiệm thấp đẩy tiền ra lưu thông; nếu chưa đủ thì thêm phí giữ tiền nhỏ trên ngân sách quá lớn.
- **Khởi đầu không buồn tẻ:** nhóm dân khởi đầu (lấy từ nông thôn) và khoản vay khởi nghiệp phải đủ để vài giờ đầu vẫn vui.
- **Nhịp mùa:** đầu mùa nông thôn đông người, ai cũng lớn được; cuối mùa nguồn chính là người rời từ thành phố khác, cạnh tranh gay gắt hơn.

## 7. Còn cần quyết

| # | Câu hỏi | Đề xuất |
|---|---|---|
| 1 | Ai là người chơi: streamer với tài khoản có sẵn, hay người chơi thường? | chưa chọn |
| 2 | Chế độ chơi một mình giữ như hiện tại, hay cũng chuyển sang kinh tế khép kín? | **đã chốt:** khép kín, "thế giới máy" hữu hạn |
| 3 | Tổng tiền cố định tuyệt đối, hay tăng chậm? | **đã chốt:** tăng chậm, khoảng 2% mỗi mùa |
| 4 | Tốc độ đồng hồ cạnh tranh | 1 ngày game = 1 giờ thật |
| 5 | Tỷ lệ tăng dân: phần riêng / nguồn chung | khoảng 35% / 65% |
| 6 | Mức sàn mất dân và ưu tiên người mới vào giữa mùa | tối đa khoảng 3% dân mỗi ngày; người mới được ưu tiên nhận dân từ nông thôn vài ngày đầu |
| 7 | Thành phố bị bỏ: dân và tiền tự chảy đi sau bao lâu | khoảng 7 ngày |
| 8 | Cỡ nhóm cạnh tranh | 20–50 thành phố, ghép theo điểm |

## 8. Ước lượng

- **Bản lưu:** khoảng 100–300 KB mỗi thành phố (chưa đo). Gói miễn phí của Supabase đủ cho vài chục người chơi.
- **Phần nặng nhất:** giai đoạn A (viết lại dòng tiền và dòng người trong toàn bộ mô phỏng). Nên làm trước, vì không cần máy chủ và chế độ chơi một mình cũng được lợi.

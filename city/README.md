# Phố Mới

Game xây thành phố 3D chơi một mình trên trình duyệt. Không nối TikTok / livestream, không thuộc `games/`.

- Địa chỉ: `https://<PLAY_DOMAIN>/city` (gateway phục vụ thư mục này ở `/city`). Chạy thử trên máy: `node gateway/index.js` rồi mở `http://localhost:8787/city`.
- Bản lưu nằm trong `localStorage` của trình duyệt: tự lưu 20 giây một lần, 3 ô lưu tay, xuất / nhập file `.json`. Server không giữ gì. Bản lưu đời trước vẫn mở được: bản chưa có người dân thì đường và nhà giữ nguyên, dân tự dọn về lại; bản đồ 96 × 96 của các bản lưu cũ vẫn mở đúng cỡ, kiểu Sông và biển; bản chưa có núi thì địa hình giữ kiểu cũ (không có núi), điểm phát triển tính bù theo mốc dân số đã đạt.

## Cách chơi

1. **Đường**: bấm điểm đầu rồi điểm cuối (hoặc kéo chuột). Chế độ *Cong* thêm một điểm uốn. Năm loại: đường nhỏ 2 làn, đại lộ 4 làn, đường một chiều, cầu vượt 2 làn (400 dân) và cao tốc 6 làn (1.000 dân). Cầu vượt và cao tốc chạy trên cao: bắc qua đường dưới đất mà không tạo nút giao, hai đầu dốc xuống nối vào đường có sẵn, không có nhà hai bên. *Nâng cấp* đổi loại một đoạn có sẵn (chỉ trong cùng tầng), bấm lần nữa lên đường một chiều để đảo chiều. Đường cắt nhau tự sinh nút giao; ngã tư và ngã ba có đại lộ tự có đèn. Công cụ ⭕ *Vòng xuyến* đổi ngã ba, ngã tư thành vòng một chiều không đèn; 🚦 *Đèn / biển* đổi nút giao lần lượt: tự động → luôn có đèn → biển dừng.
   - Đồ hoạ: cầu (trên cao hoặc qua nước) có dầm, lan can, trụ và xà mũ; đường dưới đất qua sông vồng lên khỏi mặt nước 3,5–7 m (nhịp càng dài càng cao) với dốc dẫn hai đầu, nhịp từ 4 ô trở lên có thêm vòm thép hai bên, giằng ngang và dây treo; ngã tư có cột đèn tín hiệu với đèn đỏ / vàng / xanh xếp dọc, biển dừng có cột; đường dưới đất có đèn đường dọc vỉa hè và vạch qua đường ở ngã ba, ngã tư.
   - **Vẽ đường kiểu Cities: Skylines:**
     - *Ẩn nhà* (🏚️, phím `H`, bật sẵn): cầm công cụ đường thì nhà và công trình tạm ẩn. Mặt đất hiện lưới ô xây nhà: ô mặt tiền trống màu trắng, ô đã có nhà tô màu khu nhạt, ô công trình màu xám. Ô **hồng** là dải đất hẹp (≤ 4 ô) kẹp giữa các dãy mặt tiền, sông, dốc: hẹp quá không chen được đường nên bị bỏ sót.
     - *Vòng nút:* cầm công cụ đường thì mỗi nút hiện vòng xanh (đầu cụt màu vàng) để thấy chỗ bắt, chỗ nối.
     - *Xem trước khi kéo:* ô **xanh** là đất sẽ có mặt tiền, ô **đỏ** là nhà / trang trí sẽ bị giải toả. Gợi ý dưới đáy ghi số ô của từng loại.
     - *Bắt góc:* từ điểm đầu, lệch dưới ~6° thì tự kéo vào đúng hướng 📐 *nối thẳng* đường cũ, *vuông góc* / *song song* với đường đang bám, *thẳng trục* hoặc *chéo 45°*. Độ dài tròn theo ô khi bật bám lưới. Bắt nút, thân đường rộng hơn theo bề rộng đường.
     - *Nối gọn:* lỡ kéo quá đường kia vài mét thì tự cắt bỏ đoạn cụt và dừng ở nút giao. Chỗ cắt nằm sát nút có sẵn (dưới 11 m) thì nhập vào nút đó, không tạo hai ngã tư dính nhau.
     - **Độ cao tuỳ chỉnh từng nhịp** (như Cities: Skylines 2), với công cụ 🛣️ Đường nhỏ:
       - Bấm `PageUp` / `PageDown` (hoặc `+` / `-`, hoặc ô 🔽 ⬍ 🔼 phía trên thanh công cụ) để nâng / hạ điểm cuối đoạn đang vẽ từng bậc 2,5 m, cao nhất 30 m. Dưới mặt đất là hầm chui.
       - Mỗi nút đường giữ độ cao riêng. Mặt cầu nội suy mượt giữa hai nút và khớp độ dốc ở nút chung, nên nhiều nhịp nối nhau không gãy khúc.
       - Dốc tối đa 12%; nhịp quá dốc thì gợi ý chiều dài cần thêm. Giá và mốc mở khoá theo độ cao (≤ 9 m: cầu vượt; ≤ 16 m: tầng 2; cao hơn: tầng 3).
       - Hai mặt đường cách nhau từ 5 m thì bắc qua nhau. Cùng độ cao thì thành nút giao. Lưng chừng thì không làm được.
       - Bắt điểm chỉ bắt vào nút / đường gần độ cao đang vẽ, nên vòng trên không bắt nhầm vòng dưới.
     - **🌀 Cong liền:** bấm liên tiếp các điểm. Mỗi nhịp tự cong tiếp đúng hướng nhịp trước (tiếp tuyến liên tục, không lệch góc), mỗi nhịp ngoặt tối đa 120°.
     - **Cầu xoắn ốc:** chọn 🌀 Cong liền và bấm 4 điểm mỗi vòng, giữa mỗi lần bấm nhấn `PageUp` 2 lần (+5 m). Các vòng chồng lên nhau, nút giữa hai nhịp không có mặt nút giao (mặt cầu liền). Trụ bị vòng dưới che thì dựng lệch ra mép ngoài, có xà công-xôn.
     - Dải xem trước nổi đúng độ cao từng đoạn, có dốc hai đầu và màn mờ xuống đất. Dấu bắt điểm cũng ở đúng độ cao.
   - **Nhiều tầng:** mỗi loại đường thuộc một tầng — 🕳️ hầm chui (dưới đất 6,5 m, có tường chắn, đường bên trên thành cầu nhỏ bắc qua), mặt đất, 🌉 cầu vượt / cao tốc tầng 1 (7 m) và 🌁 cầu vượt tầng 2 (14 m, bắc qua cả tầng 1). Đường khác tầng đi qua nhau không tạo nút giao, nối vào nhau thì có dốc lên xuống; chỗ gặp nằm trên đoạn dốc (hai mặt đường còn sát nhau) thì bị từ chối. Ghép các tầng lại làm được nút giao lồng nhau.
   - **Nâng / hạ tầng** (chế độ ⏫ ⏬ trong nhóm 🛣️ Đường): bấm vào đoạn đường 2 làn, cầu vượt hoặc hầm để đổi một tầng (hầm ← mặt đất → cầu tầng 1 (7 m) → tầng 2 (14 m) → 🏙️ tầng 3 (21 m)); rê chuột xem trước giá và lý do nếu không được (cắt ngang đường cùng tầng, dốc quá sát chỗ bắc qua). Kết hợp vòng xuyến, hầm chui, cầu nhiều tầng và cầu cong để dựng nút giao lớn.
   - **Hầm chui qua sông:** vẽ hầm cắt ngang sông, hồ như cầu: đoạn dưới nước là hầm kín đi ngầm dưới đáy (mặt nước giữ nguyên, tàu thuyền vẫn qua), hai bờ có cửa hầm. Dốc hầm (~40 m) còn sát nước thì game **tự đắp đất cửa hầm** (lấn bờ quanh dốc hầm cho khô) và **tự nạo vét lòng sông** dưới hầm cho đủ sâu (đáy ít nhất 3,2 m), tính thêm tiền đào đắp; sông phải còn lòng nước ở giữa, hẹp quá (đắp sẽ lấp kín sông) thì báo bắt đầu hầm xa bờ hơn. Đoạn dưới nước tính giá như cầu. Hạ một cầu 2 làn qua sông thành hầm (⏬) cũng được nếu đủ dài.
   - **Cầu vượt giữa đại lộ:** vẽ cầu vượt dọc theo đại lộ 4 làn (bắt đầu và kết thúc trên đại lộ) để vượt qua ngã tư: trụ cầu đứng ở dải phân cách, hai bên vẫn có làn xe chạy dưới đất (xe chỉ đi làn ngoài ở đoạn đó), ngã tư bên dưới giữ nguyên đèn; chân dốc là chỗ nhập làn, không đèn. Đường nhỏ không đủ chỗ (bị chặn kèm lời nhắc nâng cấp), hầm chui chưa chạy dọc dưới lòng đường được. Trụ cầu tự né mặt đường, nút giao, lòng hầm và mặt cầu tầng dưới; nút giao trên cao có thành dầm và trụ đỡ.
   - **✋ Di chuyển** (nhóm 🛠️ Công cụ, phím `M`): bấm công trình hoặc nút đường để nhấc lên, bấm chỗ mới để đặt. Dời công trình mất 10% giá xây và giữ nguyên mọi thứ gắn với nó; dời nút đường miễn phí, các đoạn nối vào uốn theo, bị từ chối nếu đường mới cắt ngang đường khác cùng tầng. Không dời được nút thuộc vòng xuyến và cửa ngõ ra ngoài thành phố.
2. **Quy hoạch**: hai bên đường tự có 2 hàng ô đất. Mười bốn loại khu: nhà riêng, nhà liền kề, nhà phố mật độ trung bình, chung cư, hỗn hợp, nhà dưỡng lão (chỉ người từ 65 tuổi), ký túc xá (chỉ sinh viên đại học), cửa hàng, trung tâm thương mại, ăn uống – giải trí (không cần hàng, sống nhờ khách tới chơi), văn phòng, văn phòng công nghệ (làm ăn tốt hơn gần viện nghiên cứu), văn phòng tài chính, công nghiệp. Nhà tự mọc theo nhu cầu và lên tới cấp 5.
3. **Điện, nước**: gió, mặt trời, nhiệt điện, hạt nhân (6.000 dân, phải sát bờ nước). Đường dẫn điện và ống ngầm. Nhà máy đặt trong 2 ô cạnh đường là tự nối; ở xa thì kéo dây điện / ống nước. Cần đủ điện, nước sạch và chỗ xả nước thải thì nhà mới mọc.
4. **Người dân**: mỗi người có tuổi, học vấn, nhà, chỗ làm, tiền, sức khoẻ. Họ dọn tới khi có nhà trống và việc làm, sáng đi làm, chiều về, cuối tuần đi mua sắm; sinh con, đi học, nghỉ hưu, qua đời. Một ngày trong game dài 2 phút ở tốc độ 1 và mỗi ngày là một tuổi.
5. **Giao thông**: xe tìm đường nhanh nhất theo thời gian đi, bám làn, giữ khoảng cách, đổi làn, dừng đèn đỏ. Đường quá tải thì kẹt, người đi làm muộn và kém vui. Chuyến ngắn thì đi bộ trên vỉa hè, chuyến dài đi xe máy hoặc ô tô; mọi chuyến đều hiện ra đường cho tới giới hạn 380 ô tô, 380 xe máy và 500 người đi bộ cùng lúc, vượt quá thì chỉ tính thời gian đi. Ca làm kéo dài 9 giờ tính từ lúc tới nơi, nên đường có người qua lại suốt ngày. Lớp xem *giao thông* tô đỏ đoạn đang kẹt.
6. **Xe dịch vụ**: xe rác, xe cứu thương, xe cứu hoả, xe tang, xe công an, xe cứu hộ xuất phát từ công trình và phải chạy tới nơi; kẹt xe thì tới muộn, nhà có thể cháy rụi.
7. **Xe buýt, tàu điện, metro**: vẽ tuyến bằng cách đặt trạm; thêm bớt xe và chỉnh giá vé ở bảng 👥. Tàu điện (1.000 dân) chạy trên ray giữa lòng đường, chở gần gấp ba xe buýt. Chưa có 🚏 bến xe thì xe buýt + tàu điện chạy chung tối đa 4 xe, mỗi bến cho thêm 12. Người dân tự chọn đi tuyến khi nhanh hơn tự lái. Ngoài cao tốc và cảng hàng còn có ga tàu hoả, sân bay (cửa ngõ xuất nhập khẩu, hút dân) và bến tàu khách. ⛴️ Bến tàu khách chở khách thật và thu vé (chỉnh giá riêng ở bảng 👥): từ 2 bến cùng một vùng nước thì tự thành tuyến tàu qua lại như xe buýt, dân tự chọn đi tàu khi nhanh hơn; chỉ một bến thì tàu tìm cửa biển (nước chảy ra mép bản đồ) để chạy ra ngoài, chở dân đi chơi xa và đưa du khách về tiêu tiền ở quán, cửa hàng. Bến nằm một mình trong hồ kín thì có tàu du ngoạn ra góc xa của hồ rồi quay về, chở dân đi ngắm cảnh và vẫn thu vé; bấm vào bến sẽ có nút ⛏️ Đào kênh ra biển: game tự tìm lối kênh ngắn nhất (qua đất đã mua, tránh đường và nhà), báo giá, rê chuột để xem tuyến, bấm là đào và tàu chuyển sang chạy ra biển; ao quá nhỏ thì không chạy tàu. Xây, dời, phá bến là tuyến tàu dựng lại ngay. Cảng hàng có tàu container ra vào; tàu ưu tiên chạy giữa dòng.
   - **🏝️ Tàu ra đảo:** đảo là vùng đất không liền với đất liền chính (bản đồ *Vịnh và đảo*, *Hồ lớn*, *Đảo* có sẵn đảo). Tuyến tàu có cả bến đất liền và bến trên đảo thì du khách đang ở thành phố mua vé ra đảo chơi trong ngày, tiêu tiền rồi đi tàu về. Mỗi đảo có tàu ra cộng sức hút du lịch cho thành phố (cảnh đẹp sẵn có, thêm công trình du lịch, bãi biển, khu vui chơi trên đảo; tối đa +12); du khách khen "đi tàu ra đảo". Bấm vào bến trên đảo để xem sức hút và số khách đang chơi trên đảo.
   - **🎫 Giá vé tàu:** vé đắt thì ít khách (4 ₫ ≈ đủ khách, 10 ₫ còn khoảng 2/3, 20 ₫ chỉ còn 15%); thu nhiều nhất quanh 10 ₫. Bảng 👥 hiện hệ số khách theo giá vé.
   - **🌊 Chuyến ra biển cho tuyến nhiều bến:** bấm vào một bến của tuyến, nút *Bật* ở mục 🌊 Chuyến ra biển. Tuyến nối thêm chặng từ đầu tuyến gần biển nhất ra cửa biển (thêm 1 tàu): vẫn chở dân giữa các bến như cũ, cộng thêm đón du khách từ biển vào, chở dân đi chơi xa, và tính là cửa ngõ đón khách. Mặt nước không thông ra biển thì báo để đào kênh. Tắt ở bến nào cũng tắt cả tuyến; lưu theo bản lưu.
   - **✈️ Sân bay nội địa / quốc tế:** sân bay mới xây là sân bay nội địa: chuyến bay trong nước (Hà Nội, TP. Hồ Chí Minh, Đà Nẵng, Phú Quốc…) chở khách trong nước tới tiêu tiền và chở người dân bay đi chơi, công tác (dân bay đi càng nhiều càng vui, tối đa +2,5); thu phí mỗi khách theo mức phí hạ cánh. Gắn module 🌏 *Nhà ga quốc tế* (từ 12.000 dân, 80% giá sân bay) để thành sân bay quốc tế; sân bay tự mở rộng từ 5×5 thành **8×8 ô**, tự giải toả nhà dân, dỡ đường, đường ray, dây điện, ống nước nằm trong lô mở rộng (chọn hướng phải giải toả ít nhất; sau khi dỡ vẫn phải còn đường sát lô); chỉ không lấp sông nước, không phá công trình khác, không lên đất quá dốc. Sân bay quốc tế có đường băng dài, rộng (vạch ngưỡng, vạch chạm bánh, điểm ngắm, đèn lề, đèn đầu và cuối đường băng), đường lăn song song có hai lối thoát nhanh, sân đỗ với máy bay thân rộng, nhà ga hai tầng mái sóng và ống lồng, đường trên cao cho tầng đi, nhà xe nhiều tầng, bãi đỗ, đài kiểm soát cao, khu hàng hoá, nhà chứa máy bay, bồn nhiên liệu, ra-đa; máy bay thân hẹp hạ cánh, máy bay thân rộng lăn ra cất cánh. Sân bay quốc tế: đón thêm chuyến bay quốc tế bên dưới, dân bay ra nước ngoài, mở được hợp đồng hãng bay. Sân bay trong bản lưu cũ đã là sân bay quốc tế.
   - **Khách quốc tế ✈️ 🚢:** lâu lâu có chuyến bay quốc tế tới sân bay quốc tế, hoặc tàu du lịch nước ngoài tới cảng / bến tàu khách ra được biển, chở du khách và người nhập cư.
     - **Máy bay:** từ ngoài bản đồ bay ngang qua thành phố (nghiêng cánh khi vòng), vào thẳng hướng đường băng, hạ độ cao, chạm bánh, giảm tốc rồi rẽ vào sân đỗ.
     - **Tàu:** chạy từ biển vào bến, neo vài giờ rồi ra khơi.
     - **Khi tới nơi:** du khách ở khách sạn (nếu còn phòng) và tiêu tiền ở quán, cửa hàng. Người nhập cư dọn vào nhà trống, hết nhà thì phải quay về. Thành phố thu phí hạ cánh / cập cảng mỗi khách. Có thông báo mỗi chuyến.
     - **Tác động** (bảng 📊, mục Khách quốc tế):
       - 🛂 Thị thực: hạn chế, bình thường hoặc mở cửa. Mở cửa thì nhiều chuyến, nhiều khách, gấp đôi người nhập cư, nhưng cần sẵn nhà và việc.
       - 📣 Quảng bá du lịch quốc tế: 4 mức, tốn tiền mỗi ngày.
       - 🛬 Phí hạ cánh: phí cao thì thu nhiều mỗi khách nhưng ít hãng ghé.
     - **Yếu tố khác:** số sân bay / cảng, sức hút du lịch (điểm tham quan), dân có vui không, thành phố có đang hút dân không (nếu không thì chẳng ai tới định cư).
     - Bảng còn cho ước tính số chuyến mỗi ngày, số liệu hôm qua và danh sách chuyến đang tới. Bấm vào sân bay / cảng để xem chuyến nào đang tới.
   - **Đồ hoạ công trình giao thông lớn** (có chuyển động):
     - ⚓ **Cảng container:** 3 cẩu giàn STS chạy trên ray, cần vươn ra biển, xe con cẩu bốc container từ tàu về xe tải; bãi container có cẩu RTG chạy qua lại, xe đầu kéo, ray tàu hàng.
     - ✈️ **Sân bay:** đường băng có vạch ngưỡng và đèn lề, đường lăn, nhà ga kính có ống lồng, đài kiểm soát, nhà chứa máy bay. Máy bay đỗ ở sân đỗ; một chiếc bay vào hạ cánh, lăn về đầu đường băng rồi cất cánh bay đi.
     - 🚆 **Ga tàu hoả:** nhà ga mái ngói, 2 sân ga có mái, cầu bộ hành, 3 đường ray có tà vẹt và cột điện lưới. Tàu khách hai chiều vào ga đỗ rồi chạy tiếp, tàu hàng (container, bồn) chạy suốt.
     - 🚇 **Metro:** tàu 3 toa có vạch theo màu tuyến; ga trên cao có 2 sân ga, mái cong, vách kính, tháp thang.
8. **Doanh nghiệp và hàng hoá**: mỗi cửa hàng, nhà máy, văn phòng có tiền, kho, lương, có thể phá sản. Hàng đi theo chuỗi nguyên liệu → nhà máy → cửa hàng bằng xe tải; thiếu thì nhập, thừa thì xuất qua đường cao tốc ở mép bắc hoặc qua cảng. Mỗi nhà máy chuyên một loại nguyên liệu (nông sản, gỗ, khoáng sản, dầu, cá), không có nguồn trong thành phố thì nhập với giá đắt hơn.
9. **Học vấn**: tiểu học, trung học, đại học có số chỗ và bán kính. Cửa hàng lớn, nhà máy cấp cao và nhất là văn phòng cần lao động có trình độ.
10. **Môi trường**: bốn lớp ô nhiễm riêng (không khí, đất, nước, tiếng ồn). Ô nhiễm làm dân ốm và giảm giá đất; cây xanh và công viên lọc bớt bụi và tiếng ồn.
11. **Tiền**: thuế riêng cho dân cư / thương mại / công nghiệp thu theo lương và doanh thu thật (thuế ngày thường giữ lại 2/7 chia đều cho cuối tuần, thứ bảy chủ nhật không hụt thu), tiền vé, phí bảo trì mỗi ngày, vay tối đa 3 khoản. Nợ quá 30.000 ₫ hoặc âm tiền 4 ngày liền thì phá sản.
12. **Địa hình và tài nguyên**: ngoài sông, hồ, biển và đồi thoải, bản đồ mới có dãy núi ở xa điểm xuất phát (ô quá dốc chỉ làm đường được). Mỗi vùng có tài nguyên riêng: đất màu mỡ ven nước, rừng, khoáng sản trên núi, dầu, vùng nước có cá. Lớp xem 🗺️ *tài nguyên* chỉ ra chỗ nào có gì.
13. **Khu chuyên biệt** (nhóm ⛏️): nông trại, lâm trường, mỏ, giếng dầu, bến cá. Mỗi khu chỉ mọc trên ô có đúng loại tài nguyên, bán nguyên liệu cho nhà máy cùng ngành trong thành phố, thừa thì xuất khẩu. Mỏ và giếng dầu gây ô nhiễm; nông trại, bến cá gần như không.
13b. **Lễ hội và mùa mưa bão** (bấm vào ô ngày giờ trên cùng để mở bảng 🎎):
   - **Lịch âm rút gọn:** 10 ngày game là 1 tháng âm, 120 ngày là 1 năm. Thành phố mới bắt đầu từ tháng 3 âm. Ô ngày giờ hiện ngày âm và biểu tượng lễ.
   - **Các dịp lễ, tác động thật:**
     - 🌸 Chợ Tết: cửa hàng đắt khách.
     - 🧧 Tết Nguyên Đán: nhà máy nghỉ (năng suất ×0,3), du khách ×1,5, khách quốc tế ×1,6 (Việt kiều về), dân vui +6, pháo hoa đêm giao thừa.
     - 🧳 Sau Tết: xưởng thiếu người.
     - 🏮 Rằm tháng Giêng, 🪷 Vu Lan: đi chùa.
     - 🏯 Giỗ Tổ Hùng Vương.
     - 🚣 Tết Đoan Ngọ: đua thuyền.
     - 🥮 Trung Thu: rước đèn, pháo hoa.
   - **Tổ chức lễ hội:** chi 4.000 / 12.000 / 30.000 ₫ (quy mô nhỏ / vừa / lớn) để tăng du khách, khách quốc tế, thuế thương mại, dân vui. Quy mô vừa trở lên có pháo hoa.
     - Cần nơi tổ chức: quảng trường, sân vận động, chùa, bãi biển, bảo tàng hoặc công trình biểu tượng. Đúng nơi hợp lễ (chùa cho lễ chùa, bãi biển cho đua thuyền) thì khách ×1,3.
     - Nơi tổ chức không có công an phủ tới thì chen lấn, dân chỉ vui một nửa.
   - **Mùa mưa bão (tháng 8–11 âm):** mưa nhiều hơn.
     - **Bão:** báo trước 12 giờ, có trạm cảnh báo sớm thì 30 giờ. Bão đổ bộ làm cây đổ, nhà yếu xuống cấp, huỷ chuyến bay / tàu quốc tế, tăng tai nạn.
     - **Triều cường:** chiều tối rằm tháng 9–11, nước dâng ở vùng thấp ven sông biển.
     - **Ngập:** mưa, bão, triều cường làm ngập đất thấp sát nước. Nhà ngập không lên cấp, xưởng gần như đứng máy, dân khó chịu; ngập quá 30 giờ thì nhà xuống cấp. Đường ngập thì xe lội nước chậm và tìm đường khác.
     - **Chống ngập:** 🌀 trạm bơm (vùng quanh trạm ít ngập, rút rất nhanh) và 🧱 kè ven bờ (chặn nước dâng), trong nhóm 💧 Nước.
13c. **📨 Hộp thư thị trưởng** (nút 📨 góc trái dưới, có số việc đang chờ). Lời văn do Claude viết từ số liệu thật của thành phố; mọi con số và hậu quả do game tính. Server chưa có `ANTHROPIC_API_KEY` thì dùng lời soạn sẵn.
   - **⚖️ Tình huống khó xử:** thỉnh thoảng có việc cần quyết, chỉ xuất hiện khi thành phố có điều kiện tương ứng: nhà máy xin xả thải, hàng rong lấn vỉa hè, vùng trũng bị ngập đòi di dời, hộ dân không chịu giải toả, lễ hội ồn ào, du khách bị chặt chém, nắng hạn thiếu nước.
     - Mỗi phương án có hậu quả thật: tiền, dân vui, sức hút dân, thuế thương mại, du khách, đánh giá du khách. Rê chuột vào phương án để xem.
     - Quá 3 ngày không quyết thì thành phố tự chọn phương án ít tiền nhất (gần 0 nhất), và khoản thu nếu có chỉ còn một nửa. Phương án tốn tiền hơn số tiền đang có thì không chọn được.
     - **22 loại tình huống đậm chất Việt Nam**, nhiều loại xuất hiện ngay từ khi thành phố còn vài chục dân:
       - *Đời sống khu phố:* karaoke loa kéo tới khuya, đám cưới dựng rạp chiếm đường, loa phường 6 giờ sáng, cả phố "đi bão" khi đội tuyển vô địch, mồ mả tổ tiên trên đất quy hoạch.
       - *Kinh tế:* thưởng Tết công nhân (tháng Chạp), xe ôm truyền thống phản đối xe công nghệ, quán bún đậu nổi tiếng trên mạng gây kẹt phố, giá lúa rớt, làng nghề gốm mở rộng.
       - *Thiên tai, môi trường:* nắng nóng 40 độ, cát tặc làm sạt lở bờ sông, sốt xuất huyết mùa mưa.
       - *Phòng cháy, tôn giáo:* chung cư mini không đạt phòng cháy (làm ngơ thì có nhà cháy thật), chùa xin đất mở rộng.
   - **🤝 Đàm phán:** đối tác gửi đề nghị và bạn gõ lời mặc cả; Claude đóng vai đối tác có tính cách riêng, nhượng bộ khi bạn có lý lẽ. Đề nghị luôn bị game ép vào khung cho phép, mỗi lượt đối tác nhượng tối đa 10% khung, sau 6 lượt là mức cuối. Bấm Ký để chốt; quá 5 ngày thì họ đi.
     - **Nhà đầu tư nước ngoài:** góp tiền ngay, đổi lại miễn một phần thuế thương mại và công nghiệp; dân tới ở đông hơn trong thời gian đó.
     - **Bộ / trung ương:** hỗ trợ tiền ngay, kèm cam kết xây thêm trạm bơm chống ngập trong hạn (4 kè tính bằng 1 trạm); không đạt thì hoàn trả gấp 1,5 lần.
     - **Hãng bay (cần sân bay):** thành phố trợ giá mỗi ngày, đổi lại thêm chuyến bay quốc tế.
     - Bảng đàm phán có ước tính lời / lỗ cho thành phố.
   - **⭐ Đánh giá du khách:** mỗi tối vài du khách viết đánh giá. Số sao do game chấm từ trải nghiệm thật: điểm tham quan, bãi biển, lễ hội, kẹt xe, ngập, bão, móc túi, ô nhiễm, hết phòng, dân thân thiện. Điểm trung bình 30 bài gần nhất nhân lượng du khách và khách quốc tế từ ×0,7 (1 sao) tới ×1,3 (5 sao).
   - **Bật / tắt AI:** ô ✍️ ở đầu hộp thư (nhớ trong trình duyệt, mặc định bật). Tắt thì dùng lời soạn sẵn, không gọi server, không tốn lượt.
   - **Máy chủ:** `POST /api/city/ai` (`gateway/city-ai.js`): model `claude-haiku-5-5` (đổi bằng `CITY_AI_MODEL`, ví dụ `claude-opus-5-5`), mỗi máy tối đa 12 lượt / phút, cả server `CITY_AI_DAILY` lượt / ngày.
13d. **🛵 Đường phố và xe cộ** (bảng 👥, mục cuối). Các chính sách đều có đánh đổi:
   - **Vỉa hè:**
     - 🍜 *Để tự do*: quán cóc, ghế nhựa, xe đẩy bày kín vỉa hè; thuế thương mại +4%, du khách ×1,08 (đánh giá khen ẩm thực vỉa hè), dân vui +1; nhưng xe chạy chậm 10% trên đường phố.
     - 🪧 *Cấp phép theo giờ*: cân bằng, tốn 300 ₫/ngày.
     - 🚧 *Dẹp vỉa hè*: đường thông, nhưng thuế thương mại −3%, du khách giảm, dân kém vui 20 ngày đầu, tốn 500 ₫/ngày.
     - Hàng quán trên vỉa hè hiện theo chính sách.
   - **Xe máy hay ô tô:** mỗi người đi xe riêng bằng xe máy hoặc ô tô tuỳ học vấn và thu nhập (kiểu Việt Nam: phần lớn xe máy). Thành phố giàu lên thì ô tô nhiều, đường tắc hơn.
   - **Nội đô:** vùng quanh khu thương mại, văn phòng, tự tính lại mỗi ngày.
     - 🛵 *Cấm xe máy vào nội đô* (400 ₫/ngày): người đi xe máy chuyển sang buýt, metro, đi bộ. Chỗ chưa có tuyến thì họ gọi taxi (thêm ô tô) và bực bội.
     - 💳 *Phí ô tô vào nội đô* (0–20 ₫ mỗi lượt): từ 6 ₫, người có ô tô chuyển sang công cộng nếu có tuyến; còn lại trả phí vào ngân sách.
   - 🚌 **Làn riêng xe buýt** (200 ₫/ngày): trên đại lộ, buýt nhanh hơn 30% (nhiều người chọn buýt hơn); xe khác chậm hơn 12%.
   - 🏘️ **Quy hoạch hẻm:** nhà ở được mọc sâu tới hàng thứ ba sau mặt đường (thêm chỗ ở). Trong hẻm chỉ có nhà ở; dân trong hẻm kém vui vì chật chội.
   - 🌫️ **Bụi mịn AQI:** tính mỗi ngày từ số chuyến xe máy, ô tô trên tổng chiều dài đường và ô nhiễm nhà máy. Trên 100 thì dân ốm nhiều hơn và kém vui; trên 150 thì du khách chê, du khách giảm. Trời mù xám theo AQI.
   - 🎎 Nút lễ hội góc trái dưới (trên 📨) cho biết lễ gần nhất và mở bảng lễ hội. Bấm vào ô ngày giờ trên cùng cũng mở được.
13e. **🏖️ Bãi biển tô theo ô** (nhóm 🧳 Du lịch): kéo chuột tô vùng bãi tuỳ ý, hình dạng bất kỳ.
   - **Chỉ trên đất trống cách biển tối đa 6 ô.** Game tự nhận ra biển (vùng nước rộng chạm mép bản đồ); sông, kênh, hồ không tính, riêng đoạn cửa sông sát biển thì được.
   - **Địa hình tự thoải:** tô xong, đất hạ dần từ trong ra tới mép nước (mỗi ô khoảng 0,35 m), vành đất sau bãi hạ theo dốc thoải, nước sát bờ thành nước nông. Không còn bờ dốc bậc thang.
   - **Đồ trên bãi:** cát sáng, cát ướt ở mép nước, dù, ghế nằm, khăn, dừa, chòi cứu hộ, quán nước mái lá, lưới bóng chuyền, phao bơi.
   - **Chi phí:** 250 ₫ / ô, phí 4 ₫ / ô / ngày.
   - **Tác dụng:** sức hút du lịch +0,3 mỗi ô (tối đa +18), dân cả thành phố vui hơn (tối đa +3), du khách khen bãi biển đẹp.
   - Không xây nhà, công trình trên bãi; làm đường qua thì bỏ phần bãi dưới đường. 🧽 *Xoá bãi* để bỏ ô bãi (địa hình giữ nguyên).
   - Bãi biển kiểu cũ (khối 3 × 3) trong bản lưu cũ vẫn giữ nguyên.
13g. **🌳 Trang trí thành phố** (nhóm 🌳 Công viên): kéo chuột tô theo ô, như quy hoạch. Code: `js/decor.js`.
   - 🌳 **Cây xanh** (90 ₫ / ô): một cây bóng mát mỗi ô (phượng, dừa, cây tán), bụi cây dưới gốc; lọc bụi, giảm ồn mạnh nhất.
   - 🟩 **Thảm cỏ** (30 ₫ / ô): bãi cỏ xanh, rẻ nhất.
   - 🚶 **Lối đi bộ** (70 ₫ / ô): đường lát gạch, ô kề nhau tự nối thành lối, nối cả ra đường; ghế đá, đèn, thùng rác. Dân ra đi dạo, ban đêm vắng hơn.
   - 🌷 **Bồn hoa** (80 ₫ / ô): bồn hoa nhiều màu, viền gạch, bụi cây bốn góc; tăng giá đất nhiều nhất.
   - **Chỉ trên đất trống** (không đường, nhà, công trình, nước, bãi biển, đất quá dốc). Ô đã trang trí không quy hoạch, không mọc nhà. Tô loại khác lên thì đổi loại.
   - **Tác dụng:** giá đất trong 3 ô quanh đó tăng, cây lọc bụi và tiếng ồn, dân cả thành phố vui hơn (tối đa +2, cần nhiều ô hơn khi thành phố đông).
   - **Phí chăm sóc** mỗi ô mỗi ngày (0,4–1,2 ₫), cộng vào mục chi 🌳 Công viên. 🧹 *Xoá t.trí* để bỏ, làm đường hay đặt công trình lên thì tự bỏ.
13h. **🛤️ Đường sắt ra cửa khẩu** (nhóm 🚌 Vận tải, sau 🚆 Ga tàu hoả). Code: `js/rail.js`.
   - **Cửa khẩu:** mỗi cạnh bản đồ có đất liền một cửa khẩu (cổng hai tháp, trạm kiểm soát, barie) ở chỗ thấp gần giữa cạnh; cạnh bắc chừa lối cao tốc.
   - **Vẽ ray:** bấm vào đầu ga tàu hoả (hai đầu ray giữa của ga), bấm thêm các điểm uốn, bấm vào cửa khẩu để nối (hoặc vào đầu ga khác, đầu một đường ray có sẵn). Chuột phải / Enter để dừng ở điểm cuối, vẽ tiếp sau. Góc được bo tròn; góc gắt quá thì báo.
   - **Độ dốc tối đa 3,5%:** ray giữ thấp. Gặp núi, đồi cao hơn mặt ray quá 4 m thì khoét hầm (cửa hầm bê tông); đồi thấp thì xẻ đất hai bên ray; qua sông, hồ thì bắc cầu cao 5,5 m cho tàu thuyền qua, có giàn thép; thung lũng thì cầu cạn nhiều trụ hoặc đắp nền. Cửa khẩu nằm trong núi thì ray chui hầm qua biên.
   - **Giá:** 90 ₫ / ô trên mặt đất, 340 ₫ / ô cầu, 520 ₫ / ô hầm, cộng tiền xẻ đất. Phí bảo trì theo mét, cầu và hầm đắt hơn (mục chi 🚌).
   - **Ga thông ra cửa khẩu** (bấm vào ga để xem): tàu liên vận vào ga lúc 7, 11, 15, 19 giờ. Mỗi chuyến chở du khách (theo sức hút du lịch), người tới định cư (khi thành phố hút dân), dân lên tàu đi chơi; thu 6 ₫ vé mỗi khách. Bão thì huỷ chuyến.
   - **Thưởng:** mỗi ga thông ra cửa khẩu (tối đa 2) hút dân +4%, thuế thương mại +2%; hàng xuất khẩu bán được giá thêm 8%; dân được đi tàu vui hơn một chút.
   - Tàu khách xanh và tàu hàng vàng thay nhau chạy từ cửa khẩu vào ga, dừng ở sân ga rồi chạy ra. Ô có ray không quy hoạch, không xây được; 🚜 san ủi lên ray để dỡ cả đoạn. Ga chưa có ray vẫn là cửa ngõ xuất nhập khẩu như cũ.
13l. **🎣 Ngư nghiệp trên biển** (quy hoạch 🐟 Ngư nghiệp, nhóm ⛏️ Tài nguyên; code `js/fishery.js`):
   - **Tô lên mặt nước có cá** (biển, sông, hồ; lớp xem 🗺️ tài nguyên màu lam) thì thành **ngư trường**: phao cam đánh dấu ranh giới, tàu cá kiểu Việt Nam (thân xanh viền đỏ, mắt thuyền, ca-bin, cột, lưới) chạy tới chỗ này chỗ kia trong ngư trường, dừng thả lưới, thỉnh thoảng về cập bến cá; ban đêm thắp dàn đèn câu mực sáng rực.
   - **Tô lên ô đất cạnh đường sát vùng nước có cá** thì vẫn là **bến cá** như cũ (ngư dân làm việc, cá cập bến, xe chở cá đi bán).
   - Bến cá có ngư trường trong 16 ô quanh nó thì ra nhiều cá hơn (tối đa ×2,6, mỗi ô ngư trường +5%); nước ở ngư trường bị ô nhiễm thì cá ít đi. Ngư trường càng rộng, có bến cá gần thì càng nhiều tàu (tối đa 14 tàu mỗi vùng).
   - Bấm vào bến cá để xem hệ số sản lượng, bấm vào ngư trường để xem thông tin. 🧽 Bỏ quy hoạch tô lên ngư trường thì xoá; lấn biển thành đất thì ngư trường ở đó mất.
13k. **💦 Thác nước tô theo ô** (nhóm 🧳 Du lịch, từ 400 dân; code `js/falls.js`). Kéo chuột tô một dải ô **từ đỉnh dốc xuống chân dốc**, như tô bãi biển:
   - Vùng tô phải chênh cao ít nhất 3 m (chỗ phẳng báo "Thác cần sườn dốc"). Tô nối thêm vào thác có sẵn được; 🧽 *Xoá thác* để bỏ.
   - Nước chảy từ ô cao nhất xuống ô kề thấp nhất trong vùng tô: đoạn thoải thành suối bám mặt đất; chỗ hụt độ cao trên 1,5 m thành **bậc thác**: nước vọt ra khỏi mép đá rồi rơi theo đường cong, loe rộng dần; ô thấp nhất thành **hồ chân thác** (mặt nước thật).
   - Hiệu ứng: màn nước hai lớp (nền trong xanh viền mờ + vệt sáng trôi nhanh), bọt trắng loang ở chân thác, tia nước li ti bắn lên rồi rơi, bụi nước phập phồng, cầu vồng mờ trong bụi nước ở thác cao từ 5 m (ban ngày), đá chắn mép thác, vách đá dọc dòng, đá quanh hồ.
   - 220 ₫ / ô, phí 2 ₫ / ô / ngày. Sức hút du lịch theo độ cao, số bậc, cỡ thác (tối đa +16); giá đất quanh thác tăng như bồn hoa. Làm đường, đặt công trình lên thì bỏ phần thác ở đó.
   - Màn nước xả của đập thuỷ điện cũng dùng hiệu ứng hai lớp mới. Thác kiểu cũ (khối 2 × 2) trong bản lưu cũ vẫn giữ.
13j. **💧 Mực nước theo vùng trũng** (code: `js/water.js`). Nước không còn chung một mực cố định:
   - **Chảy từ cao xuống thấp, lấp đầy chỗ trũng:** mỗi chỗ trũng có "miệng" (yên ngựa thấp nhất trên đường ra). Nước mưa trên lưu vực (các ô đổ dốc về nó) đọng lại theo **thể tích**: ít nước thì chỉ đọng dưới đáy, đủ nước thì đầy tới miệng. Mùa mưa ao hồ đầy, mùa khô cạn bớt; bão mưa nhiều hơn.
   - **Đầy thì tràn:** nước dư chảy qua miệng xuống dốc thành dòng suối tới chỗ trũng thấp hơn (cũng được đổ thêm nước) hoặc ra sông, biển, mép bản đồ. Dòng tràn hiện trên bản đồ, chỗ dốc thành thác.
   - **Đào ao trên đồi** có nước mưa đọng, mặt ao cao hơn mực sông biển. **Hố đào thấp hơn mực biển nhưng không thông ra sông** không còn tự đầy nước tới mực biển: chỉ đọng nước mưa. Đào kênh thông ra sông, biển thì nước ở mực biển.
   - **Chặn sông:** đắp đất ngang sông thì nước phía thượng nguồn dâng lên tới khi tràn qua chỗ thấp nhất của bờ. Đầu nguồn sông (chỗ sông chảy vào bản đồ) là nguồn nước, không phải lối thoát.
   - **Hồ đập là nước thật:** thân đập kèm hai vai đập tựa vào bờ đến chỗ đất đủ cao; nước phía trên dâng tới ngưỡng tràn (hoặc tới chỗ thấp nhất của bờ hồ nếu thấp hơn), ngập vùng trũng ven sông thành lòng hồ (nhà bị giải toả, có thông báo). Tàu thuyền đi được trong hồ, đặt bến, trạm bơm ven hồ được; làm đường, ray qua hồ thì thành cầu.
   - Đất trũng tự nhiên của bản đồ coi như đã thấm nước ổn định nên không tự thành hồ; bản đồ, bản lưu cũ giữ nguyên mặt nước.
   - **Ngập mùa mưa chảy theo địa hình:** mưa rơi khắp nơi, nước ngập dồn từ ô cao xuống ô thấp và thoát vào sông hồ, nên đọng ở chỗ trũng; trạm bơm, kè, nạo vét cống giảm ngập như trước.
   - Không đào đắp được trên hầm đường sắt, bãi biển, thân đập.
13i. **🌊 Dòng chảy, đập thuỷ điện, thác nước.** Code: `js/hydro.js`.
   - **Nước chảy từ cao xuống thấp:** mỗi ô nước có hướng và tốc độ chảy. Sông chảy ra biển; sông không ra biển chảy về mép bản đồ phía bờ thấp hơn. Lòng sông hẹp, bờ dốc thì chảy xiết, sông rộng chậm hơn, hồ và biển gần như lặng. Mùa mưa bão (tháng 8–11 âm) nước lớn chảy nhanh hơn 30%, mùa khô (tháng 1–4) chậm lại. Mặt nước có sóng trôi theo dòng, chỗ xiết có vệt bọt kéo dài, ghềnh trắng xoá. Bấm vào ô nước để xem dòng chảy (lặng, chậm, vừa, nhanh, xiết).
   - **🏞️ Đập thuỷ điện** (nhóm ⚡, từ 2.500 dân, 60.000 ₫): đặt nhà máy sát bờ sông, thân đập tự chắn ngang tới bờ bên kia (dài tối đa 16 ô). Chỉ chắn được sông có dòng chảy (không phải biển, hồ lặng).
     - **Công suất** = lưu lượng (bề rộng × tốc độ chảy qua đập) × cột nước (đập tựa vào bờ: núi hai bên càng cao, đập càng cao, 8–36 m). Sông hẹp xiết giữa thung lũng sâu ra nhiều điện nhất, có thể hơn nhà máy nhiệt điện, mà không có khói. Mùa mưa nhiều điện hơn, mùa khô ít hơn.
     - **Hồ chứa:** xây xong, mặt nước phía thượng nguồn dâng cao hơn hạ nguồn rõ rệt (2,5–5,5 m theo cột nước), tràn lên các bãi trũng ven sông thành lòng hồ: nhà trên đất ngập bị giải toả, không quy hoạch, không xây được trong lòng hồ. Nước hồ lặng, chỗ xả dưới đập xiết.
     - **Nước tràn qua đập:** mặt hồ chảy qua ngưỡng tràn, đổ theo đường cong xuống chân đập bậc thoải, bọt trắng loang mờ dần hoà vào dòng sông phía dưới, tia nước li ti văng lên, bụi nước.
     - Trên đập thành hồ lặng, ngay dưới đập nước xả xiết. **Tàu thuyền không qua được đập**, tuyến tàu khách bị cắt đôi.
     - Hình: thân đập bê tông có chân bậc, đường trên đập, lan can, đèn, cửa van xả tràn với màn nước trắng đổ xuống, bụi nước; nhà máy bên bờ có gian máy, cửa xả tua-bin, trạm biến áp, cột điện.
   - **💦 Thác nước** (nhóm 🧳, từ 400 dân, 16.000 ₫): đặt trên sườn dốc (chênh cao trong lô từ 4 m). Nước từ suối trên đỉnh đổ xuống hồ dưới chân, vách đá hai bên, bụi nước, đài ngắm cảnh trên đỉnh. Sức hút du lịch +5, dân vui hơn, giá đất quanh đó tăng.
13f. **🏙️ Quận và chủ tịch quận** (nút 🏙️ góc trái dưới, trên 🎎; mở từ 400 dân, chế độ Open thì mở ngay). Code: `js/districts.js`.
   - **Chia quận:** chọn số quận (2 tới 8, nhiều hơn khi đông dân) rồi bấm *Chia quận*. Game tự chia theo nơi dân ở và việc làm; Quận 1 ở trung tâm. Mỗi ô thuộc quận có trụ sở gần nhất. Trụ sở là toà 🏛️ UBND quận (nhà vàng, sảnh cột, cột cờ) tự xây trên đất trống gần trung tâm quận, không phá nhà dân. *📍 Dời trụ sở* rồi bấm lên bản đồ (hoặc ✋ Di chuyển toà UBND) để chỉnh ranh giới; phá toà UBND thì quận xây lại, giải thể quận thì dỡ hết. Lớp xem 🏙️ *Quận* tô màu từng quận, viền đậm là ranh giới. Bấm vào nhà để xem nó thuộc quận nào.
   - **Chủ tịch quận:** mỗi quận một người, có tên, năng lực (hiệu quả 75–120%) và tính cách: gần dân, mát tay kinh tế, kỷ cương, xanh – sạch, tiết kiệm (chỉ tiêu khoảng 60% ngân sách), chạy thành tích. *🔄 Thay chủ tịch* được 5 ngày một lần.
   - **Chương trình quận** (mức 0–3, tốn tiền mỗi ngày theo cỡ quận, cộng vào mục chi 🏙️ *Chương trình các quận*). Tác dụng chỉ trong quận:
     - 👮 Dân phòng, an ninh trật tự: tội phạm giảm.
     - 🌳 Trồng cây, chỉnh trang đô thị: bớt bụi và tiếng ồn, giá đất tăng.
     - 🕳️ Nạo vét cống, chống ngập: nước dâng ít hơn, rút nhanh hơn.
     - 🎭 Văn hoá, thể thao phường: dân vui hơn.
     - 🏪 Hỗ trợ hộ kinh doanh: cửa hàng, văn phòng mọc nhanh hơn, doanh nghiệp có thêm vốn mỗi ngày.
     - 🏠 Hỗ trợ an cư: nhà ở mọc nhanh hơn.
   - **Ba cách điều hành, chọn riêng cho từng quận:**
     - 🖐️ *Tự làm:* thị trưởng tự chỉnh mức từng chương trình, hiệu quả 100%.
     - 📋 *Giao việc:* gõ lệnh, ví dụ "giảm trộm cắp quanh chợ trong 10 ngày". Chủ tịch trả lời nhận lệnh, chọn mức chương trình trong trần ngân sách, số ngày (3–15) và chỉ tiêu để chấm (dân số, mức vui, tội phạm, ô nhiễm, giá đất, nhà ngập, việc làm). Tới hạn game chấm *đạt* / *chưa đạt* bằng số liệu thật và cộng vào thành tích của chủ tịch. Lệnh có đòi xây công trình quận ("xây trạm y tế cho bà con") thì xây ngay ở chỗ tốt nhất, không cần duyệt và không tính vào quỹ quận. Lệnh vượt quyền quận (xây đường, nhà máy, đổi thuế) thì chủ tịch nói là ngoài thẩm quyền.
     - 🤖 *Tự chủ:* chủ tịch tự lập kế hoạch 4 ngày một lần trong trần ngân sách, theo chỗ quận đang yếu và theo tính cách. Tình huống khó xử của quận (mỗi tình huống mới được giao cho một quận, quận đông dân dễ nhận hơn) do chủ tịch tự quyết khi gần hết hạn (khoảng 18 giờ trước hạn). Trong lúc đó thị trưởng vẫn quyết thay được trong 📨.
   - **🏗️ Xây công trình:** quận được xây công viên, quảng trường, trường tiểu học, trạm y tế, đồn công an, trạm cứu hoả, trạm bơm chống ngập. Chủ tịch chọn *loại*, game chọn *chỗ*: ô trống (không phá nhà) trong quận, phủ được nhiều dân đang thiếu loại công trình đó nhất. Mỗi quận có quyền xây 🚫 *Không xây* / ✋ *Xin duyệt* (mặc định) / ✅ *Tự xây* và *quỹ xây dựng 7 ngày* (mặc định 20.000 ₫; người tiết kiệm chỉ tiêu ~60%); quỹ phải đủ cả tiền xây lẫn phí vận hành 7 ngày, thành phố đang lỗ thì chủ tịch không xây thêm, bác một đề xuất thì 20 ngày không đề xuất lại loại đó. Khi 🤖 tự chủ, 3 ngày một lần chủ tịch xem quận thiếu gì (chỗ tốt nhất phải phủ thêm ít nhất 40 dân, quỹ thành phố còn trên 5.000 ₫); xin duyệt thì đề xuất nằm trong bảng 🏙️ (nút ✋ trên 🏙️), 3 ngày không duyệt thì hết hạn. Công trình quận ghi "🏗️ Quận X xây" khi bấm vào; tiền xây và phí vận hành tính vào ngân sách thành phố như công trình thường.
   - **Báo cáo:** 6 ngày một lần (và khi tới hạn việc giao), chủ tịch gửi báo cáo kèm số liệu thật và thay đổi so với kỳ trước. Người "chạy thành tích" nói hoa mỹ hơn nhưng không được đổi số.
   - **AI:** Claude đóng vai chủ tịch qua `POST /api/city/ai` với `kind: 'district'` (`task`: `plan`, `order`, `report`, `pick`, `build`). Mức chương trình bị ép về 0–3 và cắt cho vừa trần ngân sách, số ngày 3–15, phương án lạ và công trình ngoài danh sách bị bỏ, lệnh của thị trưởng nằm trong thẻ `<mayor>`. Không có AI thì chủ tịch dùng kế hoạch soạn sẵn theo nhu cầu × tính cách, lệnh được hiểu theo từ khoá, báo cáo theo mẫu.
14. **Bản đồ** (🗺️ Chọn bản đồ ở màn chào, hoặc khi chơi mới): cả bản đồ thuộc thành phố từ đầu, không còn mua đất.
   - **7 kiểu:** 🏞️ Sông và biển, 🌾 Đồng bằng châu thổ (sông chia nhánh, đất phẳng màu mỡ), 🏝️ Vịnh và đảo (bờ biển dài, vịnh, đảo ngoài khơi), ⛰️ Cao nguyên (núi, hồ thuỷ điện, không biển), 💧 Hồ lớn (đảo giữa hồ, sông thoát ra biển), 🌊 Đảo (biển bao quanh, lối nối phía bắc), 🏔️ Thung lũng (sông giữa hai dãy núi).
   - **3 cỡ:** Vừa 96 × 96, Lớn 128 × 128, Rất lớn 160 × 160.
   - Mỗi kiểu có ảnh xem trước theo mã bản đồ (🎲 đổi mã để sinh bản đồ khác); chọn chế độ Thường hoặc 🎨 Open.
   - Đổi cỡ bản đồ thì trang tự tải lại để dựng cảnh theo cỡ mới (thành phố không mất).
15. **Điểm phát triển và cây công nghệ** (🔬): bắt đầu có 3 điểm, mỗi mốc dân số thưởng thêm. Tiêu điểm để mở khu chuyên biệt, module, công trình biểu tượng và ba chính sách (xúc tiến du lịch: quảng bá quốc tế rẻ hơn 30%, khai thác nhanh hơn, xuất khẩu được giá). Tổng điểm không đủ mở hết.
16. **Module**: bấm vào một công trình đã xây để gắn thêm module (tổ máy phụ, bộ lọc khói, bể chứa, dãy phòng học, khoa nội trú, chốt trực, tầng đỗ xe, vườn hoa…). Module tăng công suất, số xe hoặc bán kính, giá và phí bằng một phần công trình gốc.
17. **Công trình biểu tượng** (🗽): tượng đài, chợ trung tâm, nhà hát lớn, tháp truyền hình, Tháp Phố Mới. Mỗi thành phố xây một cái mỗi loại; chúng cộng hài lòng, thuế thương mại hoặc sức hút dân cho cả thành phố.
18. **Y tế, tang lễ**: trạm y tế, bệnh viện (người ốm trong vùng ít tử vong, người già sống lâu hơn). Từ 400 dân, người mất phải được xe tang đưa về nghĩa trang (đầy thì thôi nhận) hoặc đài hoá thân (30 người / ngày); chờ lâu thì cả nhà buồn.
19. **Tội phạm, nghiên cứu**: từ 400 dân, mỗi ô có mức tội phạm theo thất nghiệp và giá đất; công an giảm, mạnh gấp đôi khi trại giam còn chỗ. Lớp xem *tội phạm* chỉ ra chỗ nóng. Viện nghiên cứu (2.500 dân) dùng người học đại học làm ra điểm phát triển đều đặn.
20. **Sự cố, thiên tai** (nhóm 🚨 Khẩn cấp): thời tiết đổi mỗi ngày (quang, mưa, khô hạn, bão đá). Xe có thể gặp tai nạn, nhiều hơn khi trời mưa, ban đêm, mặt đường mòn; tai nạn có thể liên hoàn hoặc bốc cháy, chắn làn tới khi xe công an và xe cứu hộ (hoặc cứu hoả nếu cháy) tới dọn. 🚧 Trạm bảo trì sửa dần mặt đường trong bán kính. Cháy nhà do chập điện (nhà thiếu điện dễ cháy hơn) lan sang nhà sát vách. Cướp giật ở nơi tội phạm cao: công an tới trong 3 giờ thì bắt được. Khô hạn dễ cháy rừng, lửa lan qua cây vào nhà; 🗼 tháp canh lửa kìm lại. Bão đá làm nhà tụt cấp. Lốc xoáy (ngẫu nhiên từ 1.000 dân) càn qua phá nhà; 🛖 hầm trú ẩn và 📡 trạm cảnh báo sớm (báo trước 1 giờ) giảm thương vong. Bảng 👥 có nút thử từng loại thiên tai.
21. **Địa hình** (nhóm ⛰️, phím `T`): giữ chuột để ⛏️ đào, ⛰️ đắp, 📐 san phẳng (về cao độ của điểm bấm đầu tiên) hoặc 🌊 dẫn nước (đào kênh tới dưới mực nước). Cọ 1, 2, 3 hoặc 5 ô (phím `[` `]`); giá theo khối đất đào đắp. Đào sâu quá mực nước thì thành ao hồ, đắp lên lòng sông thì có thêm đất. Đất trống cạnh kênh, ao tự đào thành đất màu mỡ; trạm bơm, cống xả, bến tàu đặt được cạnh kênh. Không đào đắp được dưới đường, nhà, công trình và trên đất chưa mua.
22. **Đồ hoạ**: mặt nước có sóng, phản chiếu trời, ánh nắng và bọt viền bờ, nước nông trong hơn nước sâu; trời có mây trôi, mặt trời, mặt trăng, sao; 🌙 chu kỳ ngày đêm theo giờ trong game (phím `N` bật / tắt): phố lên đèn, cửa sổ sáng ngẫu nhiên, đèn đường và đèn pha xe rọi xuống mặt đường. Đèn đêm theo mật độ đô thị: trung tâm phố (thương mại, văn phòng, hỗn hợp dày đặc) có biển hộp đèn màu trước cửa hàng, quầng sáng màu hắt xuống vỉa hè, dây đèn màu giăng dọc và ngang phố nhấp nháy so le, cửa sổ sáng nhiều; làng quê, ruộng đồng ít cửa sổ sáng, chỉ khoảng 3/10 cột đèn đường bật và sáng yếu hơn. Xe có đèn pha trắng ấm, đèn hậu đỏ và vệt đỏ hắt xuống đường phía sau. Cây theo vùng (tán tròn, tán xoè, phượng đỏ, thông trên cao, dừa ven nước, bụi cây) đung đưa theo gió, đá rải trên sườn dốc. Nhà, cao ốc, cửa hàng, nhà máy có thêm chi tiết (bậc thềm, cửa chớp, ban công, dàn lạnh, tủ kính, mái bạt, hàng rào, ống khói sọc, xe đỗ). Bảng 🗺️ lớp xem dạng lưới, bản đồ nhỏ ở góc phải dưới (bấm để tới nơi).
23. **Kiểu cầu**: thanh công cụ 🛣️ Đường có 5 kiểu cầu cho đường mới qua sông: tự chọn, 🧱 dầm bê tông (rẻ nhất, nhiều trụ), 🌈 vòm thép (×1,3), 📐 dây văng tháp chữ A (×1,6), 🌁 cầu treo hai tháp cổng có cáp chủ và khối neo (×2). Hệ số nhân vào giá phần qua nước; phí bảo trì cầu tính theo mét qua sông. Chế độ 🌉 Đổi cầu: bấm vào cầu có sẵn để đổi kiểu (trả phần chênh). Cầu có đèn hai bên.
24. **Công trường**: công trình dịch vụ mới xây dần trong vài giờ đến hơn một ngày tuỳ cỡ (chỉ để xem, công trình vẫn chạy ngay): nền đất, hàng rào tôn, giàn giáo lưới xanh, lán trại, vật liệu; xe công trình theo cỡ và giai đoạn (máy xúc, máy ủi, xe ben đào móng; xe bồn bê tông, xe cẩu, cần cẩu tháp dựng khung; xe lu, máy kéo chở vật liệu). Xây xong có thông báo.
25. **Ngân sách chi tiết**: mỗi nhóm chi bấm mở ra từng công trình, cầu, loại đường, tuyến xe, khoản vay tốn bao nhiêu mỗi ngày (xếp từ đắt tới rẻ, bấm để bay tới chỗ đó); mục "Tốn nhiều nhất" và danh sách công trình đang xây kèm tiến độ. Bình minh, hoàng hôn có dải sáng cam hồng sát chân trời, mây nhuộm nắng, quầng và tia nắng quanh mặt trời, nắng xiên bóng dài, tán cây ngược sáng sáng viền.
26. **Kinh tế khép kín** (giai đoạn A của [kế hoạch chơi nhiều người](MULTIPLAYER.md)): sổ cái ghi mọi đồng tiền vào / ra (`js/ledger.js`, bảng ngân sách có "Dòng tiền hôm qua"); thuế là phần trừ thật vào lương, doanh thu; tiền nhà về chủ nhà; bảo trì, xây dựng thành hợp đồng cho doanh nghiệp trong thành phố; doanh nghiệp chia lãi cho dân. Dân mới đến lấy từ vùng nông thôn có hạn (tự sinh / mất), người đi về nông thôn (bảng dân cư có "Dân đến, đi"). Mỏ khoáng sản, dầu cạn dần rồi hết; rừng, cá, đất màu tự hồi (`js/reserve.js`). Mỗi ngày thành phố lập bản tóm tắt cho "thế giới bên ngoài" thay được (`js/world.js`).
27. **Lưu đám mây**: bảng 💾 → "☁️ Đám mây": đăng nhập bằng tài khoản của nền tảng (như dashboard) để lưu thành phố lên máy chủ (4 ô, tự lưu 5 phút một lần) và mở trên máy khác. Chỉ có khi mở game qua gateway (`/api/city/saves`, `gateway/city-cloud.js`); cần chạy migration `supabase/migrations/20261120000000_city_cloud.sql`.
28. **Nhóm cạnh tranh** (nút 🏆, cần đăng nhập): thi với thành phố của người chơi khác mà không ai đụng được vào thành phố của mình. Mỗi ngày giải (1 giờ thật) máy chủ chia dân chuyển đến, du khách, đầu tư mới và giá chợ chung theo sức hút của từng thành phố; bảng xếp hạng theo điểm thịnh vượng. Mua bán giữa các thành phố theo hợp đồng giá mỗi ngày: tự đặt giá chào bán và thuế nhập khẩu từng loại hàng (thuế vào ngân sách; thuế cao thì doanh nghiệp mua của thế giới máy). Tiền mua bán đi thẳng giữa các thành phố qua máy chủ (trả trước, đối chiếu ngày giải sau, hoàn phần không giao). 🏆 và 💸 Dòng tiền là cửa sổ riêng (3 cột, thu nhỏ được để xem bản đồ). Trong nhóm, 1 ngày game = 1 giờ thật (không tua nhanh), mở lại thì chạy bù tối đa 7 ngày (`js/league.js`, `gateway/city-league.js`, migration `20261121000000_city_league.sql`).
29. **Chuỗi sản xuất nhiều tầng**: nhà máy làm một thành phẩm cố định theo vị trí (bấm vào để xem): tầng 1 🥫 thực phẩm (nông sản / cá), 👕 quần áo (nông sản), 🪑 nội thất (gỗ), 🔩 thép (khoáng sản), 🧪 nhựa (dầu); tầng 2 cần đủ hai nguyên liệu: 🚗 máy móc (thép + nhựa), 💻 điện tử (khoáng sản + nhựa). Xưởng chế biến chỉ làm thực phẩm, quần áo, nội thất. Cửa hàng bán hàng tiêu dùng theo giá từng loại (hàng đắt bán được giá hơn), thép và nhựa chỉ bán cho nhà máy khác hoặc xuất khẩu. Mỗi thành phẩm có giá chợ riêng (biểu đồ trong 📊, chợ chung và hợp đồng trong 🏆). Máy móc có lãi khi có thép, nhựa làm ngay trong thành phố.

## Tầng lớp dân cư

Mỗi người lớn thuộc một trong ba tầng, tính từ lương chỗ làm (chưa có việc thì theo học vấn): 🏚️ **thu nhập thấp** (lương dưới 1,25 MK/giờ), 🏠 **trung lưu** (dưới 1,9), 🏡 **khá giả** (từ 1,9). Nhà ở cũng chia ba mức theo tiền nhà mỗi ngày: rẻ (dưới 2,2 MK, kiểu nhà trọ), vừa, cao cấp (từ 3,5 MK; giá đất và cấp công trình càng cao thì tiền nhà càng cao).

- **Chọn nhà theo túi tiền:** người mới đến, người vô gia cư xem vài căn trống, lấy căn đắt nhất vẫn chịu được (tiền nhà tối đa 40% thu nhập), không căn nào chịu được thì lấy căn rẻ nhất.
- **Gánh nặng tiền nhà** (tiền nhà / thu nhập mỗi ngày): trên 50% thì giảm hài lòng (tối đa −16), mỗi ngày có 20% cơ hội dọn xuống căn rẻ hơn ít nhất 15% nếu còn chỗ; trên 90% thì có thể bỏ đi (8% mỗi ngày). Nhiều hộ bị đè nặng làm thành phố bớt hút người (tối đa −0,3 sức hút).
- **Dọn lên:** người trung lưu, khá giả ở nhà quá rẻ so với thu nhập (tiền nhà dưới 18%) thỉnh thoảng dọn lên nhà đắt hơn ít nhất 25%, nhường nhà rẻ lại cho người khác.
- **Chi tiêu theo tầng:** người khá giả chi nhiều hơn khi mua sắm (×1,35) và ăn uống, giải trí (×1,5); người thu nhập thấp chi ít hơn (×0,75 và ×0,7).
- **Bảng 👥 → "Tầng lớp dân cư":** tỷ lệ từng tầng, độ vui, chỗ trống của nhà rẻ / vừa / cao cấp, số hộ bị tiền nhà đè nặng, số hộ dọn xuống / dọn lên hôm qua. Cảnh báo khi nhà rẻ cạn mà nhiều hộ bị đè nặng, khi thiếu nhà cao cấp cho người khá giả, hoặc khi nhà cao cấp ế.
- Mọi thứ suy ra từ lương, học vấn, tiền nhà hiện tại nên không thêm gì vào bản lưu; bản lưu cũ chơi tiếp bình thường. Tham số ở `city/js/tiers.js` (`TIER_CFG`).

## Khí hậu theo vùng Việt Nam và bản đồ cỡ 256

Mỗi kiểu bản đồ gắn với một vùng và một khí hậu (lịch âm), hiện trong màn chọn bản đồ. Khí hậu quyết định số cơn bão và tháng có bão, mùa mưa / mùa khô, tháng nóng và độ nóng, triều cường, lũ do mưa ở đất thấp (`CLIMATES` trong `city/js/base.js`):

| Bản đồ | Vùng | Khí hậu |
|---|---|---|
| Sông và biển | Cửa sông ven biển | Cân bằng (giữ đúng số cũ) |
| Đồng bằng châu thổ | Đồng bằng sông Cửu Long | Nam Bộ: mùa mưa tháng 4–10, mùa khô nắng gắt, ít bão, triều cường mạnh (×1,7) |
| Vịnh và đảo | Duyên hải miền Trung | Bão nhiều và muộn (×1,7, tháng 9–12), lũ nhanh (×1,3), nắng nóng gay gắt (×1,6) |
| Cao nguyên | Tây Nguyên | Mưa tháng 4–9, khô hạn dài, ít bão (×0,25), không có triều cường |
| Hồ lớn | Đồng bằng Bắc Bộ (vùng hồ) | Bão sớm (tháng 6–9), mưa nhiều hè thu, dễ ngập (×1,15) |
| Đảo | Hải đảo (kiểu Phú Quốc, Cô Tô) | Gió bão, nước dâng, triều cường cao quanh đảo |
| Thung lũng | Tây Bắc | Lũ quét ở đất thấp ven suối (×1,4), ít bão, nắng nóng nhẹ |

Cỡ **256 × 256** (thử nghiệm) gấp bảy lần cỡ vừa. Đo trên máy chủ thử, thành phố trống: tạo bản đồ khoảng 0,3 giây, mỗi giờ game mô phỏng khoảng 27 ms (cỡ 96: 8 ms, cỡ 160: 12 ms), bản lưu trống khoảng 430 KB (giới hạn của máy chủ là 4 MB). Phần vẽ (GPU) chưa đo. Bản đồ vẫn tạo toàn bộ một lần lúc bắt đầu; chưa có tải theo vùng khi mở rộng.

## Kinh tế mở rộng

- **Ngân sách theo ngành** (bảng 📊): giáo dục, y tế, an ninh (công an, cứu hoả, trại giam), giao thông chỉnh 50–150%. Chi ít thì phí duy trì giảm nhưng công trình yếu đi (bán kính nhỏ hơn, ít xe, ít chỗ học, đường xuống cấp nhanh, điểm phát triển ra chậm) và dân kém vui; chi nhiều thì ngược lại. Mức vui / buồn theo độ lớn của ngành so với dân số (chỉ một tháp canh lửa thì gần như không ai để ý).
- **Giá thị trường**: giá bên ngoài của 5 loại nguyên liệu và hàng hoá trôi mỗi ngày quanh giá gốc (45–190%), thỉnh thoảng có tin sốc giá. Áp vào giá nhập khẩu và xuất khẩu; bảng 📊 có biểu đồ 60 ngày.
- **Du lịch** (nhóm 🧳): điểm tham quan (🛕 chùa cổ, 🏺 bảo tàng, quảng trường, sân vận động, công trình biểu tượng, quán ăn giải trí) tạo sức hút; du khách tới qua cửa ngõ (đường vào, ga, sân bay, tàu ra biển), tiêu tiền ở quán xá, cửa hàng. 🛎️ Khách sạn, 🏖️ khu nghỉ dưỡng cho khách ở lại qua đêm: thu tiền phòng (chỉnh giá ở 📊: phòng đắt thì ít khách ở lại, lãi nhất ở giá vừa phải) và khách tiêu nhiều hơn.
- **🏝️ Bãi biển** (nhóm 🧳): đặt sát bờ sông, hồ, biển; dù, ghế nằm, chòi cứu hộ, quán nước, bóng chuyền; sức hút du lịch +6, dân vui hơn. Bến tàu khách, cảng hàng và bãi biển tự quay cầu tàu / mép sóng ra phía nước.
- **🧺 Chợ truyền thống**: sạp bán thẳng nông sản, cá từ nông trại, bến cá (không qua nhà máy), giá rẻ hơn cửa hàng. **🏚️ Xưởng chế biến**: xưởng nhỏ chế biến nông sản, cá, gỗ thành hàng hoá, ít ô nhiễm, đặt gần nhà được.
- **🎨 Chế độ Open**: nút trên màn hình chào hoặc bảng 💾. Mở khoá mọi công trình, khu, công nghệ; có cả bản đồ; tiền không giới hạn; không bao giờ phá sản. Bật cho thành phố đang chơi được (không tắt lại).

## Chính quyền giữ quyền, chuỗi sự kiện có nguyên nhân

- **Đất theo quy hoạch**: công ty chỉ tự xây trên ô bạn đã quy hoạch đúng loại (nhà máy: khu công nghiệp, xưởng; cửa hàng: khu thương mại). Muốn đất chưa quy hoạch thì phải xin trong bảng 🏢: thẻ đề xuất ghi rõ số ô phải chuyển đổi, bạn duyệt thì game mới quy hoạch thay. Nhiều công ty cùng chờ đất công nghiệp thì là **tranh đất**: phí đất nộp ngân sách lên (tối đa ×1,75).
- **Nhà đầu tư ký hợp đồng** (📨) thì lập công ty thật bằng vốn ngoài và xây 2–5 nhà máy trên khu công nghiệp đã quy hoạch; ưu đãi thuế chỉ cho nhà máy của họ. Chờ 25 ngày không có đất thì rút vốn, hợp đồng chấm dứt.
- **CEO phản ứng chính sách**: đổi thuế công nghiệp / thương mại từ 2 điểm là một sự kiện; công ty ghi lại và đổi cách làm (thuế cao: giữ tiền dày hơn, xin ưu đãi thuế khi xin dự án, từ 14% có thể dời cơ sở sang tỉnh khác; thuế thấp: mở rộng nhanh hơn). CEO còn tự **thu hẹp** (hạ cấp nhà máy ế, cho bớt người nghỉ), **đóng cửa** cơ sở lỗ, **đầu tư máy móc** (+8% sản lượng, ít khói hơn mỗi nấc).
- **Mặc cả với CEO**: ô chat trong thẻ đề xuất; AI đóng vai CEO (không có AI thì luật), game ép số vào khung việc làm / % ưu đãi và giới hạn mức nhượng mỗi lượt theo tính cách.
- **Tình huống gắn doanh nghiệp thật**: "nhà máy xin xả thải", "nợ lương Tết" nêu đúng nhà máy / công ty; hậu quả vào đúng chỗ đó (cho xả thải: nước quanh nhà máy ô nhiễm 20 ngày, doanh nghiệp nộp phí; đình chỉ: nhà máy ngừng sản xuất 15 ngày; buộc trả thưởng: tiền từ quỹ công ty tới tay công nhân của họ).
- **📜 Biên niên**: mỗi sự kiện ghi nguyên nhân, bấm 📍 để xem chỗ. Game tự lần theo số liệu: mất việc → thất nghiệp quanh đó tăng → hàng quán vắng khách → nhà bỏ trống, giá thuê hạ → doanh nghiệp mới mở; nhà cung cấp đóng cửa → nơi mua hàng phải nhập ngoài → nơi nào đổ theo; thiếu nhà ở công nhân quanh cụm nhà máy (công ty có thể xin tài trợ xây nhà ở trên đất nhà ở bạn đã quy hoạch); giá thuê từng khu theo nhà trống; **bản sắc kinh tế** (thành phố công nghiệp thép, thương mại dịch vụ, du lịch…) tính từ việc làm theo ngành, đổi khi giữ được 5 ngày. Chi tiết: `CORPORATE.md` mục 22.

## Phong cách Việt Nam

Nút 🇻🇳 trên thanh trên cùng (bật sẵn cho thành phố mới; bản lưu cũ giữ kiểu cũ). Khu nhà ở thấp, nhà phố, liền kề, ký túc xá, hỗn hợp, cửa hàng và ăn uống mọc thành dãy nhà ống nhiều màu: ban công có lan can và chậu cây, cửa cuốn hoặc cửa hàng có biển hiệu chữ và mái bạt, trên mái có bồn nước inox, máy nước nóng, tum mái tôn, cờ đỏ sao vàng ở ban công. Đường có cột điện bê tông với dây điện chằng chịt thay cho đèn đường, xe đẩy bán hàng có ô che trên vỉa hè, cây dừa ven sông biển, và gần như ai cũng đi xe máy.

## Ô nhỏ hơn (thành phố mới)

- Thành phố mới dùng ô cạnh **8,4 m**, tức ô cũ (10 m) bớt 30% diện tích.
- Nhà, công trình thu nhỏ theo cho vừa lô. Đường, xe, người, cây giữ kích thước thật, nên phố trông dày và thật hơn.
- Đường nhỏ vẫn có 2 hàng ô mặt tiền mỗi bên; đại lộ chiếm 2 hàng ô. Vỉa hè được lấn mép lô một chút, khỏi mất trắng cả hàng ô.
- Bản lưu cũ giữ ô 10 m như trước. Đổi qua lại giữa hai cỡ ô thì trang tự tải lại để dựng cảnh đúng cỡ.

## Cây công trình (kiểu Development Tree của Cities: Skylines 2)

- **Áp dụng cho thành phố mới** (bản lưu cũ và chế độ Open giữ cách cũ): công trình dịch vụ không tự mở theo dân số nữa mà phải tiêu **điểm phát triển** ở bảng 🔬.
- **Mười cây:** ⚡ Điện, 💧 Nước, 🗑️ Rác, 🏥 Y tế, 🎓 Giáo dục, 🚨 An ninh, 🚌 Vận tải, 🌳 Công viên, 🧳 Du lịch, 🛡️ Khẩn cấp.
- **Mỗi nút là một công trình,** tốn 1–3 điểm. Nút sau cần nút trước, ví dụ:
  - mặt trời → nhiệt điện → hạt nhân; mặt trời → thuỷ điện;
  - trạm y tế → bệnh viện;
  - tiểu học → trung học → đại học → viện nghiên cứu;
  - bến xe → ga tàu hoả → sân bay.
- **Mốc dân số vẫn giữ:** nút chỉ mở được khi đã đạt mốc dân số của công trình đó.
- **Màu nút:** xanh lá là đã mở, xanh dương là mở được, xám là thiếu điểm / chưa tới mốc / cần nút trước.
- **Công trình gốc có sẵn từ đầu:** tua-bin gió, tháp nước, trạm bơm, cống xả, công viên nhỏ.
- **Điểm thêm:** thành phố dùng cây được thêm 3 điểm lúc bắt đầu và 3 điểm mỗi mốc dân số.

## Ruộng chia thửa, đập bê tông

- **Ruộng chia thửa** (khu 🌾 Nông nghiệp):
  - Các ô nông nghiệp gom thành thửa ruộng 4 × 4 ô, kiểu cánh đồng của Cities: Skylines 2.
  - Mỗi thửa trồng một loại cây: lúa non, lúa chín vàng, rau bắp cải, hoặc vườn cây ăn quả.
  - Đường đất chạy dọc mép giữa các thửa.
  - Mỗi thửa chỉ một nhà kho mái đỏ (thêm silo, máy kéo, nhà kính khi nâng cấp), đặt ở ô sát đường. Các ô còn lại là ruộng.
  - Luống cây, đường đất thẳng hàng trên cả cánh đồng.
- **Đập thuỷ điện bê tông:**
  - Mặt hạ lưu vát cong trơn, có khe co giãn giữa các khối đổ.
  - Máng xả tràn có tường hai bên: nước chảy ôm mặt đập, tới mũi hắt ở chân đập thì bật lên rồi đổ xuống sông.
  - Trên mỗi cửa xả có nhà tời.
  - Nhà điều hành mái xanh ở vai đập.

## Mã nguồn

| File | Việc |
| --- | --- |
| `js/base.js` | Hằng số, bảng định nghĩa (khu, tài nguyên, đường, công trình, module, cây công nghệ, giá hàng), hàm thuần dùng chung |
| `js/sim.js` | Lõi: heightmap và núi, đào đắp địa hình, bản đồ tài nguyên, đất đã mua, graph đường (nút + đoạn Bezier bậc 2), ô quy hoạch, mạng điện nước, ô nhiễm, giá đất, xây / lên cấp, module, cây công nghệ, thu chi, lưu nạp |
| `js/people.js` | Từng người dân (vòng đời, việc làm, lịch đi lại, sức khoẻ) và từng doanh nghiệp (kho, lương, lãi lỗ, giao hàng), xe dịch vụ, cháy |
| `js/traffic.js` | Tìm đường Dijkstra theo thời gian, xe bám làn, đèn tín hiệu, kẹt xe |
| `js/transit.js` | Tuyến xe buýt, tàu điện và metro, khách chờ ở trạm, chọn tuyến, giới hạn xe theo bến |
| `js/incidents.js` | Thời tiết, mặt đường mòn, tai nạn giao thông, cướp giật, cháy rừng, bão đá, lốc xoáy và xe ứng cứu |
| `js/models.js` | Mô hình 3D dựng bằng code (nhà 12 khu × 5 cấp, công trình, công trình biểu tượng, khối module, xe, trạm) |
| `js/fishery.js` | Ngư trường trên mặt nước: ô hợp lệ, hệ số sản lượng của bến cá gần đó, các vùng ngư trường cho tàu cá |
| `js/falls.js` | Thác nước tô theo ô: kiểm tra ô, độ dốc, dòng chảy trong vùng thác, hồ chân thác, sức hút du lịch |
| `js/water.js` | Mực nước theo vùng trũng: lấp trũng từ cửa thoát, thể tích nước mưa theo lưu vực và mùa, đầy thì tràn xuống vùng thấp |
| `js/hydro.js` | Dòng chảy (hướng, tốc độ, mùa nước), đập thuỷ điện (thân đập, công suất), thác nước |
| `js/decor.js` | Trang trí tô theo ô: cây xanh, thảm cỏ, lối đi bộ, bồn hoa; ảnh hưởng giá đất, bụi, hài lòng |
| `js/rail.js` | Đường sắt: cửa khẩu, vẽ ray bo góc, cao độ giới hạn dốc (hầm, cầu, xẻ đất), mạng ga – cửa khẩu, tàu liên vận |
| `js/beach.js` | Bãi biển tô theo ô: nhận diện biển, kiểm tra ô, san địa hình thoải xuống biển |
| `js/street.js` | Vỉa hè, hẻm, xe máy / ô tô, cấm xe máy nội đô, phí ô tô, làn buýt, bụi mịn AQI |
| `js/council.js` | Hộp thư thị trưởng: tình huống khó xử, đàm phán hợp đồng, đánh giá du khách (game tính số; lời dự phòng) |
| `js/ai.js` | Gọi `/api/city/ai` (Claude viết lời), tóm tắt thành phố gửi kèm |
| `js/seasons.js` | Lịch âm, lễ hội và tổ chức lễ hội, bão, triều cường, ngập lụt, trạm bơm / kè |
| `js/intl.js` | Khách quốc tế: lịch chuyến bay / tàu nước ngoài, du khách, người nhập cư, thị thực, quảng bá, phí hạ cánh |
| `js/transport3d.js` | Mô hình cảng container, sân bay, ga tàu hoả, tàu và ga metro; khung khoá chuyển động (máy bay, tàu, cẩu, xe tải) |
| `js/render.js` | Cảnh three.js: địa hình, mặt nước (shader), bầu trời và ngày đêm, đường, xe, đèn, ray metro, lớp phủ |
| `js/main.js` | Vòng lặp, chuột / bàn phím, giao diện |
| `vendor/` | three.js r160 (giấy phép MIT) |

Các module mô phỏng không đụng DOM và có test ở `test/city.test.js`.

Đường nằm tự do (thẳng, chéo, cong) nhưng ô đất vẫn theo một lưới chung 96 × 96: ô nào bị mặt đường đè thì bị chặn, ô trong 2 hàng sát đường thành ô quy hoạch. Nhà quay theo 4 hướng chính về phía đường gần nhất.

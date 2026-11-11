# 🕶️ Nằm Vùng (`namvung`)

Streamer đóng vai **cảnh sát chìm** giả làm người đi xin việc và bị đưa qua biên giới vào một trại lừa đảo.
- Ban ngày phải **chạy KPI lừa đảo** để không bị nghi ngờ.
- Đồng thời phải **lén thu thập bằng chứng** (sơ đồ, danh sách người bị giữ, sổ tiền, toạ độ…) và **gửi về công an Việt Nam**.

Người xem đóng vai **bảo an, chủ quản**: tặng quà để gây khó, hoặc làm "người tốt" để giúp đỡ. Ngoài ra người xem còn hỗ trợ bằng:
- **❤️ Tim:** tạo sóng điện thoại.
- **💬 Bình luận "che":** đánh lạc hướng bảo an.

Tên nhân vật, địa danh và kịch bản trong game đều là hư cấu. Người xem luôn thấy dòng **🚩 Dấu hiệu lừa đảo** dưới mỗi tin nhắn mồi, và cuối chiến dịch có một **mẹo phòng lừa đảo**.

## 📖 Cốt truyện: 5 chương mỗi chiến dịch
Nhân vật (hư cấu):
- 🕶️ **Hắc Long:** chủ quản.
- 🔦 **Tèo Cận:** bảo an ham tiền.
- 🧑‍🌾 **Bé Hai:** đồng hương bị lừa sang.
- 👮 **Chỉ huy Sơn:** công an, nhắn tin mật.
- 🦊 **Cáo:** người bí ẩn.

| Ngày | Chương | Người xem chọn (bình luận 1 / 2) |
|---|---|---|
| 1 | Bước qua cổng | Tèo Cận đòi 200 đô. **1** Đưa tiền: tuần tra ngắn một nửa cả chiến dịch, KPI hôm nay +2. **2** Từ chối: nghi ngờ +10%. |
| 2 | Người đồng hương | Bé Hai xin trốn cùng. **1** Đưa theo: cứu thêm người, đêm cuối dài hơn. **2** Để lại: an toàn hơn. |
| 3 | Sổ đen | Cáo đưa USB lạ. **1** Cắm vào: 50% ra 2 bằng chứng, 50% là bẫy (+20% nghi ngờ, mất sóng). **2** Vứt đi. |
| 4 | Kẻ phản bội | Hắc Long tra hỏi. **1** Đổ cho người khác: −25% nghi ngờ. **2** Im lặng: +10%. Cuối ngày người xem **đoán kẻ phản bội**. |
| 5 | Đêm giải cứu | Chọn đường: **1** cổng sau (ngắn, nhiều camera) / **2** đường ống (dài, ít camera). |

- **Trong ngày:** nhân vật nhắn tin theo mốc thời gian, kèm sự kiện (tuần tra, thu điện thoại, Cáo lén đưa tài liệu…).
- **Quà lúc bình chọn:** được giữ lại, vào ca mới có tác dụng.
- **🐀 Kẻ phản bội:**
  - Mỗi chiến dịch chọn ngẫu nhiên 3 nghi phạm từ 16 cái tên. Tên không trùng chiến dịch trước, nên mỗi màn mỗi khác.
  - Ngày 1–3, Bé Hai (hoặc Cáo, nếu không đưa Bé Hai theo) kể manh mối: mỗi ngày một manh mối thật về kẻ phản bội và một chuyện của người vô tội.
  - Cuối ngày 4, người xem bình luận **A / B / C**. Đoán đúng: −10% nghi ngờ và camera đêm cuối thưa hơn. Đoán sai: +15% nghi ngờ và camera dày hơn.
- **📟 Tin mật của Chỉ huy Sơn:** xuất hiện ở tab Bí mật dưới dạng chữ bị dịch đi vài bậc trong bảng chữ cái. Giải đúng thì có `safeSeconds` giây (mặc định 25) ngồi ở tab Bí mật không bị nghi.
- **💌 Lời nhắn của Bé Hai** (ngày 2): gõ lại để gửi về cho gia đình. Bé Hai tin bạn và đi nhanh hơn trong đêm cuối.
- **🌙 Đêm giải cứu** (`nightSeconds`, mặc định 2:30): màn chạy trốn qua 5–8 đoạn hành lang.
  - Mỗi đoạn rẽ trái hoặc phải. Sơ đồ đã gửi về sẽ hiện đường; bằng chứng "Sơ đồ khu trại" hiện toàn bộ.
  - Camera quét thì phải chờ; đi lúc camera đang quét là bị thấy (+15%).
  - Bảo an tuần tra thì bấm **TRỐN**.
  - **Tim của người xem** làm camera tắt (`likeDistractMs` mỗi tim, tối đa 8 giây).
  - Phím tắt: ← → để đi, Space để trốn.
- **📁 Hồ sơ vụ án:** mỗi bằng chứng gửi về là một trang hồ sơ có chú thích, hiện ở thẻ kết thúc.
- **5 đoạn kết:**
  - 🚔 **Triệt phá hoàn toàn:** gửi đủ bằng chứng, đoán đúng kẻ phản bội, cứu Bé Hai.
  - 🕊️ **Thoát cùng đồng hương.**
  - 🏃 **Thoát một mình.**
  - 😱 **Bị lộ:** nghi ngờ lên 100%.
  - 🚐 **Bị bán sang trại khác:** trời sáng mà chưa thoát.

## Cách chơi (máy tính giả lập, cửa sổ chơi `?play=1`)
Màn hình máy tính có 2 tab. Bấm vào tab hoặc nhấn **Tab** để đổi. Nhấn **Esc** để quay nhanh về Việc trại.

### 💼 Việc trại (KPI)
Mỗi việc xong được +1 KPI. Các việc xoay vòng:
- **💬 Nhắn tin mồi:** gõ lại tin theo kịch bản rồi Enter.
  - Nút **⚠️ Cảnh báo ngầm:** cứu người đó thay vì lừa. Không được KPI, nghi ngờ tăng `warnSuspicion`%.
- **📞 Gọi theo kịch bản:** chọn đúng câu kịch bản. Chọn sai thì giám sát nghe thấy, nghi ngờ +3%.
- **💵 Sổ tiền:** cộng các ca rồi Enter.
- Cài `campJobs = chat` nếu chỉ muốn việc gõ chữ.

### 🕵️ Bí mật (bằng chứng)
Mỗi bằng chứng là một việc riêng:
- **📸 Chụp:** bấm chụp 6 lần.
- **📋 Chép thông tin:** gõ lại.
- **🗺️ Sơ đồ:** bấm các phòng đúng thứ tự. Sai thì làm lại từ đầu, nghi ngờ +2%.
- **📍 Toạ độ:** gõ đúng các chữ số. Toạ độ luôn là bằng chứng cuối.

Bằng chứng thu được nằm trong máy nhưng **chưa an toàn**. Bấm **GỬI** khi **sóng đủ 100%** thì mới tính.

Ngồi ở tab Bí mật thì nghi ngờ tăng `secretSusPerSec`% mỗi giây. Nếu **bảo an đang tuần tra** thì tăng `patrolSusPerSec`% mỗi giây, nên phải chuyển tab ngay.

## Luật
1. **Chiến dịch** gồm 4 ngày làm việc (mỗi ngày `daySeconds` giây, mặc định 3:00) và 1 đêm giải cứu.
   - KPI ngày đầu là `kpi`, mỗi ngày sau +1 (tối đa +4).
2. **Cuối ngày:**
   - Đủ KPI: nghi ngờ −`kpiBonus`%.
   - Thiếu KPI: nghi ngờ +`missKpi`% và có hình phạt vui cho streamer.
3. **Gửi đủ `evidence` bằng chứng** (mặc định 5) chưa phải là thắng: còn phải thoát ra trong Đêm giải cứu. Kết cục tuỳ bằng chứng, kẻ phản bội và Bé Hai (xem phần Cốt truyện).
4. **Nghi ngờ chạm 100%** ở bất kỳ lúc nào: **BỊ LỘ DANH TÍNH**.
5. Thẻ kết thúc có 2 bảng:
   - **🔦 Bảo an gắt nhất:** tính theo xu quà gây khó.
   - **🤝 Đồng đội thầm lặng:** tính xu quà giúp, cộng 1 điểm cho mỗi lần bình luận che.

## Người xem
- **❤️ Thả tim:** mỗi tim cộng `signalPerLike`% sóng. Mặc định 0,2, tức 500 tim là đầy sóng.
- **💬 Bình luận chứa từ `coverWord`** (mặc định "che", không cần dấu): nghi ngờ −`coverPoints`%, và nếu đang tuần tra thì rút ngắn tuần tra 1 giây.
  - Mỗi người được tính lại sau `coverCooldownSec` giây.
- **Chủ quản nhắn:** sau khi tặng quà, **bình luận đầu tiên của chính người tặng** trong `pingWaitSeconds` giây sẽ thành tin nhắn.
  - Từ trong `bannedWords` bị thay bằng ***.
  - Tin nhắn che màn hình, streamer phải bấm ✕ mới đóng.

## Actions (gán trong dashboard)
| id | Tác dụng | Mặc định |
|---|---|---|
| `tuantra` | 🔦 Bảo an tuần tra 15 giây (đang ở tab Bí mật thì nghi ngờ tăng rất nhanh) | Rose (1 xu) |
| `chuquan` | 📱 Chủ quản nhắn: tin che màn hình, kéo về tab Việc trại | Finger Heart (5) |
| `tangkpi` | 📈 KPI hôm nay +2 | Doughnut (30) |
| `thudt` | 📵 Thu điện thoại: sóng về 0, khoá tab Bí mật 20 giây | Perfume (20) |
| `chidiem` | 🕵️ Chỉ điểm: nghi ngờ +15% | Hat and Mustache (99) |
| `lucsoat` | 🧳 Lục soát: mất hết bằng chứng chưa gửi (không có thì nghi ngờ +10%) | Corgi (299) |
| `nhot` | 🔒 Nhốt phòng tối: khoá màn hình 20 giây | Money Gun (500) |
| `chuyentrai` | 🚐 Chuyển trại: KPI về 0, −30 giây | Galaxy (1000) |
| `lamngo` | 🤝 Bảo an làm ngơ: nghi ngờ −10%, hết tuần tra | Heart Me (1) |
| `migoi` | 🍜 Gói mì lén: +30 giây | Hand Hearts (100) |
| `sim` | 📶 Sim lậu: sóng đầy 100% | Sunglasses (199) |
| `noigian` | 🗝️ Nội gián: +1 bằng chứng | Cap (99) |
| `lamho` | 🧑‍🤝‍🧑 Đồng hương làm hộ: +1 KPI | Ice Cream Cone (1) |
| `giaicuu` | 🚔 Công an ập vào: thắng ngay | Lion (29999) |

Lệnh:
- `next-day`: hết ngày ngay, hoặc sang bước kế.
- `new-campaign`: bắt đầu chiến dịch mới.
- `clear-board`: xoá bảng điểm.
- `pause` / `resume`: do nền tảng cung cấp.

## Dữ liệu
`data/camp.json` chứa phần mở đầu (`{code}`, `{place}`, `{n}`), mật danh, tin nhắn mồi kèm dấu hiệu lừa đảo, nạn nhân, kịch bản gọi, thông tin cần chép, danh sách bằng chứng, phòng, tin chủ quản, câu bảo an, hình phạt, mẹo phòng lừa đảo.

Tên nơi bị đưa tới đặt ở cài đặt `place`.

# 🕶️ Nằm Vùng (`namvung`)

Streamer đóng vai **cảnh sát chìm** giả làm người đi xin việc và bị đưa qua biên giới vào một trại lừa đảo.
- Ban ngày phải **chạy KPI lừa đảo** để không bị nghi ngờ.
- Đồng thời phải **lén thu thập bằng chứng** (sơ đồ, danh sách người bị giữ, sổ tiền, toạ độ…) và **gửi về công an Việt Nam**.

Người xem đóng vai **bảo an, chủ quản**: tặng quà để gây khó, hoặc làm "người tốt" để giúp đỡ. Ngoài ra người xem còn hỗ trợ bằng:
- **❤️ Tim:** tạo sóng điện thoại.
- **💬 Bình luận "che":** đánh lạc hướng bảo an.

Tên nhân vật, địa danh và kịch bản trong game đều là hư cấu. Người xem luôn thấy dòng **🚩 Dấu hiệu lừa đảo** dưới mỗi tin nhắn mồi, và cuối chiến dịch có một **mẹo phòng lừa đảo**.

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
1. **Chiến dịch** gồm `days` ngày (mặc định 5), mỗi ngày dài `daySeconds` giây (mặc định 3:00).
   - KPI ngày đầu là `kpi`, mỗi ngày sau +1 (tối đa +4).
2. **Cuối ngày:**
   - Đủ KPI: nghi ngờ −`kpiBonus`%.
   - Thiếu KPI: nghi ngờ +`missKpi`% và có hình phạt vui cho streamer.
3. **Thắng (GIẢI CỨU THÀNH CÔNG):** gửi đủ `evidence` bằng chứng (mặc định 5).
4. **Thua:**
   - Nghi ngờ chạm 100%: **BỊ LỘ DANH TÍNH**.
   - Hết số ngày mà chưa gửi đủ bằng chứng: **MẤT DẤU**.
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

# 🛒 Hãy chọn giá đúng (`chongia`)

Gameshow đoán giá hàng siêu thị cho TikTok Live. Mỗi vòng hiện một món hàng: tên, quy cách, ảnh, siêu thị bán.
Người xem gõ giá vào bình luận. Giá và **ảnh sản phẩm thật** lấy tự động từ API công khai của WinMart (phần server, khoảng 1.500 món, làm mới 12 giờ / lần). Chưa lấy được thì dùng bộ dự phòng `data/products.json`: 208 món WinMart với giá + ảnh thật chụp ngày 27/11/2026.

## Luật chơi
1. **Vòng đoán giá:** gõ số tiền vào bình luận. Bỏ qua câu dài (nói chuyện). Các cách gõ được nhận:
   - `35k`, `35K`, `35 nghìn`, `35 ngàn`, `35 cành` → 35.000đ
   - `35k5`, `35,5k` → 35.500đ
   - `35.000`, `35,000`, `35 000`, `35000đ` → 35.000đ
   - `1tr2`, `1 triệu 2`, `1m2`, `1,2tr`, `1 củ 2` → 1.200.000đ
   - `2 triệu 350 nghìn` → 2.350.000đ
   - số trơn dưới 1000 hiểu là nghìn: `36` → 36.000đ
   - Mỗi người tính 1 lần mỗi vòng. Bật `allowChange` thì được đổi giá, tính lần gõ cuối.
2. **Thắng vòng đoán giá:**
   - Luật `rule = closest` (mặc định): người gần giá thật nhất thắng. Hai người lệch bằng nhau thì ai gõ trước thắng.
   - Luật `rule = not-over` (kiểu gameshow truyền hình): chỉ tính người đoán **không vượt quá** giá thật.
   - Hạng 1 / 2 / 3 nhận 100% / 60% / 40% `basePoints`. Hạng 4–10 nhận 15% nếu lệch ≤ 15%.
   - Lệch ≤ `exactPercent`% (mặc định 2%) là **ĐÚNG GIÁ**: cộng thêm 100% `basePoints`.
3. **Vòng chọn giá A / B / C / D:** 4 mức giá, gồm giá thật và 3 giá nhiễu được làm tròn cho giống giá thật.
   - Gõ `A`, `b`, `chọn c`, `4`, hoặc gõ đúng số tiền của một đáp án.
   - Đáp án đúng được điểm theo tốc độ: 100% nếu chọn ngay, giảm dần còn 40% lúc hết giờ. Người đúng đầu tiên được thêm ×1,2.
   - `mode`: `mix` (mặc định, khoảng 1/3 số vòng là A/B/C/D), `guess` hoặc `choice`.
4. **Gợi ý làm giảm điểm:** mỗi lần gợi ý (khoảng giá, chữ số, loại đáp án) trừ 12% điểm vòng đó, thấp nhất còn 50%.
5. **Phòng im:** hết giờ mà chưa ai đoán thì chờ thêm nửa thời gian một lần, rồi mới công bố giá.
6. **Công bố giá:**
   - Ô số trên nhãn giá quay rồi dừng từng chữ số.
   - Vòng đoán giá: thước giá hiện mọi phiếu đoán, kim xanh chỉ giá thật, sau đó hiện top 3 kèm % lệch và điểm.
   - Hàng đang giảm giá thì hiện thêm giá gốc.
7. **Chương trình:** đủ `roundsPerShow` vòng (mặc định 10) thì tổng kết. Màn tổng kết có bục top 3 và "giỏ hàng hôm nay" (các món, giá, người thắng). Sau đó bắt đầu chương trình mới; bảng xếp hạng tổng vẫn giữ.

Lúc đang đoán, nhãn giá chỉ hiện `???đ`: người xem không biết giá dài mấy chữ số cho đến khi có quà **lộ chữ số**.

## Actions (gán trong dashboard)
| id | Tác dụng | Mặc định |
|---|---|---|
| `hint` | Vòng đoán giá: hiện khoảng giá chứa giá thật, giá không nằm chính giữa khoảng. Thu hẹp được 3 lần (±45% → ±25% → ±12%). Vòng A/B/C/D: loại 1 đáp án sai (tối đa 2), ai đã chọn đáp án bị loại được chọn lại. Hết lượt thì +5 giây | Rose, 500 tim |
| `digit` | Lộ chữ số đầu (lần 2: chữ số thứ hai), đồng thời lộ giá dài mấy chữ số. Hết lượt thì +5 giây | Doughnut |
| `time` | +10 giây | Finger Heart, follow |
| `double` | ×2 điểm vòng này cho người tặng | Ice Cream Cone |
| `jackpot` | Vòng **SIÊU SALE**: ×3 điểm cả phòng. Tặng lúc đang công bố giá thì áp dụng cho vòng sau | Hand Hearts |
| `skip` | Đổi món hàng khác, giữ số vòng | Perfume |

## Lệnh
`next` (công bố giá ngay / sang vòng sau), `skip`, `new-show`, `refresh-prices` (bắt server tải lại giá ngay, tối đa 1 lần / 5 phút), `clear-board`.

## Giá siêu thị (phần server)
`server/index.js` chạy trong gateway, dùng chung cho mọi kênh.
- **Tải giá:**
  - Lúc gateway khởi động (nếu cache đã cũ), rồi cứ `CHONGIA_REFRESH_HOURS` giờ (mặc định 12) tải lại một lần.
  - Tải các trang danh mục / API trong `data/sources.json`, 3 trang song song.
  - Kết quả lưu vào `data/games/chongia/prices.json`.
- **Bóc sản phẩm (`server/scrape.js`):** không viết riêng cho từng site, mà quét mọi dữ liệu có cấu trúc trong trang:
  - JSON-LD `schema.org/Product` (`offers.price`)
  - `__NEXT_DATA__` và `self.__next_f` (Next.js)
  - `window.__INITIAL_STATE__` / `__NUXT__` / `__PRELOADED_STATE__` / `__APOLLO_STATE__`
  - API trả JSON
  - thẻ meta `product:price:amount`

  Object nào có tên + giá hợp lý (1.000đ – 50 triệu) là một sản phẩm. Có cả giá khuyến mãi lẫn giá gốc thì lấy giá đang bán. Ảnh, quy cách, link lấy kèm nếu có. Ngành hàng + emoji đoán theo tên.
- **Nguồn lỗi:** mạng chặn, site đổi cấu trúc… thì giữ giá lấy được lần trước (tối đa 7 ngày) và ghi lỗi vào log. Không còn gì thì game tự dùng giá tham khảo.
- **Đổi nguồn mà không sửa code:** đặt biến môi trường `CHONGIA_SOURCES`, dạng JSON giống `data/sources.json` hoặc dạng gọn:
  ```
  CHONGIA_SOURCES="Bách Hóa Xanh|https://www.bachhoaxanh.com/sua-tuoi|sua; WinMart|https://winmart.vn/categories/do-uong-c06|do-uong"
  ```
  Ngành hàng: `sua`, `do-kho`, `gia-vi`, `tuoi-song`, `rau-cu`, `do-uong`, `banh-keo`, `hoa-pham`. Để trống thì đoán theo tên.
- **Tắt tải giá thật:** `CHONGIA_LIVE=0`.
- **Op cho overlay:** `catalog({ categories })`, `refresh()`, `status()`. `status()` cho biết từng nguồn có lấy được không, bao nhiêu món, lỗi gì.

> Nguồn mặc định: 41 danh mục của API công khai WinMart (`api-crownx.winmart.vn/it/api/web/v3/item/category`, `storeCode=1535`), đã chạy thử ngày 27/11/2026: 1.564 sản phẩm, 41/41 nguồn thành công, gần như món nào cũng có ảnh (`s3-hcmc02.higiocloud.vn`). Danh mục bia bị bỏ vì TikTok hạn chế nội dung rượu bia.
> - Giá WinMart tính theo **đơn vị bán** (`uomName` × `quantityPerUnit`): tên ghi "chai 500ml" nhưng bán cả thùng 24 thì quy cách hiện "Thùng 24 × chai 500ml" để người chơi không đoán nhầm.
> - Trang Bách Hóa Xanh chặn máy chủ (đóng kết nối), nên không có trong nguồn mặc định.
> - Overlay nạp ảnh trực tiếp từ CDN của siêu thị, nên máy chạy OBS cần có mạng ra các host đó.

Thẻ sản phẩm ghi rõ nguồn giá: "🏪 WinMart · Giá thật lấy tự động · cập nhật *x giờ trước*", hoặc "🏪 WinMart · Giá WinMart ngày 27/11/2026" với hàng dự phòng.

## Cài đặt chính
`mode`, `rule`, `source` (`auto` · `live` · `mix` · `seed`), `categories` (lọc ngành hàng), `askSeconds`, `choiceSeconds`, `revealSeconds`, `roundsPerShow`, `summarySeconds`, `exactPercent`, `allowChange`, `basePoints`, `showLeaderboard`.

Bảng xếp hạng (`board`) và bảng quà (`gifts`) kéo / phóng / ẩn được trong Studio.

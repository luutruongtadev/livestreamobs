# Phố Mới: kế hoạch Việt Nam hoá

Tài liệu này là Phase 1 (Audit) của đợt nâng cấp Việt Nam hoá. Nó gồm 7 phần: audit hiện trạng, khoảng cách, danh mục asset, đề xuất gameplay, kế hoạch kỹ thuật, lộ trình và ma trận ưu tiên.

Nguyên tắc: chỉ thêm, không viết lại. Nội dung khai báo bằng bảng dữ liệu. Bản lưu cũ vẫn mở được. Không đổi vòng chơi chính, kinh tế, giao thông hay định dạng lưu.

---

## 1. Audit hiện trạng

### 1.1 Kiến trúc mã

| Phần | File | Vai trò | Điểm mở rộng cho Việt Nam hoá |
|---|---|---|---|
| Dữ liệu gốc | `js/base.js` | Khai báo dữ liệu: khu quy hoạch (`ZDEF`), công trình (`SERVICES`), tài nguyên, thành phẩm, kiểu bản đồ (`MAPS`), cây công trình | Thêm loại nhà, loại cửa hàng, bộ vùng miền dưới dạng bảng |
| Mô phỏng | `js/sim.js`, `people.js`, `econ.js`, `ledger.js` | Mô phỏng dân (mỗi người một bản ghi), doanh nghiệp, sổ cái tiền khép kín | Chỉ đọc thêm thuộc tính, không đổi công thức |
| Mùa và lễ | `js/seasons.js` | Âm lịch (120 ngày = 1 năm), lễ hội, mùa mưa bão, ngập, triều cường | Thêm lễ, thêm thời tiết dưới dạng bảng |
| Đường phố | `js/street.js` | Chính sách vỉa hè (tự do, cấp phép, dẹp), hẻm, cấm xe máy, AQI | Đã đúng tinh thần Việt Nam; thêm hoạt động hiển thị |
| Quận | `js/districts.js`, `council.js` | Quận, chủ tịch quận, tình huống khó xử, đàm phán | Thêm tình huống mang màu Việt Nam |
| Mô hình 3D | `js/models.js` (1.600 dòng) | Mọi nhà, xe, công trình dựng bằng code (`GB`: hộp, mái, trụ, có màu đỉnh); `growableVN` là nhà ống | Nơi thêm kiến trúc mới, mỗi kiểu là một hàm |
| Hiển thị | `js/render.js` (3.100 dòng) | three.js: đường, cột điện, dây điện, đèn, xe chạy theo làn (instanced), người đi bộ, pháo hoa, nước | Thêm vật thể đường phố, hoạt động, trang trí lễ |
| Asset file | `assets/models/*.glb` | Người đi bộ (nam, nữ, người già) và chó, tạo bằng Meshy (skill `meshy-3d`) | Đường làm asset tạo bằng file đã có sẵn |
| Giao diện | `js/main.js`, `index.html` | Cửa sổ, bảng, nút 🇻🇳 bật / tắt phong cách Việt Nam | — |

**Asset pipeline.** Có hai đường:

1. **Hình dựng bằng code** (chính). Mỗi kiểu nhà là một hàm trong `models.js`, biến thể sinh từ seed (`mulberry32(zone, level, variant)`). Geometry được gom lại và vẽ bằng instancing. Không có file texture: màu nằm ở đỉnh, cửa sổ dùng một texture lặp, biển hiệu chữ dùng atlas canvas (`signAtlas`).
2. **File `.glb` từ Meshy**. Nạp ở nền; nếu tải lỗi thì giữ hình dựng bằng code. Mỗi món tốn khoảng 15 credit.

Hệ thống hiện chưa có LOD theo khoảng cách. Hiệu năng dựa vào instancing và giới hạn số lượng (`MAX_CARS = 480`, `MAX_MOTO = 480`, `MAX_PEDS = 520`, …).

### 1.2 Những gì đã Việt Nam hoá

Game đã đi xa hơn một bản đổi skin. Hiện có:

- **Kiến trúc:**
  - Nhà ống nhiều màu, ban công có lan can và chậu cây, cửa cuốn.
  - Cửa hàng có biển chữ tiếng Việt (PHỞ, CÀ PHÊ, TẠP HOÁ, BÁNH MÌ, SỬA XE, BÚN CHẢ, CƠM TẤM, ĐIỆN THOẠI) và mái bạt.
  - Trên mái: bồn nước inox, máy nước nóng mặt trời, tum mái tôn.
  - Cờ đỏ sao vàng, ghế nhựa trên vỉa hè.
  - Áp cho 7 loại khu: nhà riêng, nhà phố, liền kề, ký túc xá, hỗn hợp, cửa hàng, ăn uống – giải trí.
- **Công trình:** chùa cổ, UBND quận (nhà vàng, cột cờ), chợ trung tâm, chợ truyền thống (khu 20), xưởng chế biến (khu 21), tượng đài, nhà hát lớn.
- **Đường phố:**
  - Cột điện bê tông với dây điện chằng chịt, xe đẩy bán hàng có ô che, cây dừa ven sông biển.
  - Chính sách vỉa hè và hẻm có đánh đổi trong gameplay.
- **Giao thông:**
  - Xe ga, xe số, hai người đi chung một xe, xe máy chở hàng cồng kềnh, xe đạp, taxi.
  - Tỷ lệ xe máy cao; người giàu và học cao mới mua ô tô.
  - Có chính sách cấm xe máy, thu phí ô tô vào trung tâm.
- **Lịch và lễ:**
  - Âm lịch.
  - Các lễ: Chợ Tết, Tết Nguyên Đán (nhà máy nghỉ, Việt kiều về), Sau Tết (thiếu công nhân), Rằm tháng Giêng, Giỗ Tổ, Đoan Ngọ đua thuyền, Vu Lan, Trung Thu.
  - Pháo hoa; lễ hội tổ chức được theo quy mô.
- **Khí hậu:** mùa mưa bão, bão có tên, cây đổ, ngập theo mưa, bão và triều cường, trạm bơm chống ngập, kè.
- **Kinh tế:** chợ truyền thống bán thẳng nông sản và cá, hộ kinh doanh mặt tiền (khu hỗn hợp), xưởng nhỏ cạnh vùng nguyên liệu, du lịch có khách sạn và đánh giá của du khách.
- **Bản đồ:** 7 kiểu địa hình: sông và biển, châu thổ, vịnh và đảo, cao nguyên, hồ lớn, đảo, thung lũng.

### 1.3 Rủi ro khi sửa

| Vùng | Rủi ro | Cách tránh |
|---|---|---|
| `growable` / `growableVN` | Đổi seed hoặc kích thước làm nhà cũ đổi dáng, lệch ô | Giữ nguyên hàm cũ, thêm nhánh mới theo khu hoặc vùng |
| Instancing ở `render.js` | Thêm nhiều loại mesh làm tăng draw call | Gom chung một geometry theo loại, giới hạn số lượng |
| Bản lưu | Thêm trường mới làm bản lưu cũ hỏng | Trường mới có giá trị mặc định; thiếu thì suy ra (ví dụ vùng suy từ kiểu bản đồ) |
| Kinh tế | Thêm loại doanh nghiệp làm lệch sổ cái | Loại cửa hàng mới chỉ là biến thể hiển thị và hệ số nhỏ của khu đã có |

---

## 2. Khoảng cách so với mục tiêu

| Nhóm | Đã có | Còn thiếu |
|---|---|---|
| Nhà ở | Nhà ống 2–5 tầng, hỗn hợp có cửa hàng | **Chung cư cũ** (khu 4 vẫn là tháp kính chung chung), chung cư hiện đại kiểu Việt Nam, **nhà cấp 4 / mái tôn**, **nhà trọ**, **biệt thự**, nhà vườn, nhà trong hẻm |
| Thương mại | Biển chữ trên nhà ống | Mặt tiền khác nhau theo ngành (phở, cà phê có bàn ghế thấp, tạp hoá, tiệm thuốc có chữ thập xanh, sửa xe có lốp treo); cửa hàng tiện lợi, siêu thị; trung tâm thương mại (khu 5) và văn phòng (khu 6, 18, 19) chưa có nét Việt Nam |
| Công trình công | Chùa, UBND, chợ, trường mái ngói đỏ | Bưu điện, nhà văn hoá phường, bến xe kiểu Việt Nam; trường, trạm y tế, công an chưa có biển tên, màu và cổng đặc trưng |
| Đường phố | Cột điện, dây điện, xe đẩy, ghế nhựa | Bảng quảng cáo, **biển báo giao thông Việt Nam**, thùng rác, chậu cây, biển số nhà, xe máy đỗ kín vỉa hè, mái che di động |
| Phương tiện | Xe máy nhiều kiểu, taxi | **Xe máy điện**, **shipper có thùng giao hàng**, xe ba gác, xe buýt màu Việt Nam (vàng, xanh lá) |
| Đời sống | Người đi bộ, người đi dạo | Người **ngồi cà phê, ăn quán vỉa hè**, đám đông ở chợ, học sinh tan trường, tập thể dục ở công viên, giờ cao điểm đông xe máy |
| Mô phỏng | Mưa bão, ngập, AQI, vỉa hè | **Nắng nóng** (điện, nước, sức khoẻ), **ô nhiễm kênh rạch** gắn với mùi và giá đất, **nhà trọ** cho công nhân, **phố ẩm thực**, quá tải hạ tầng ở khu đông |
| Lễ hội | 8 lễ âm lịch và pháo hoa | **Quốc khánh 2/9** (cần ngày dương), **trang trí phố** (cờ, đèn lồng, đèn Trung Thu, hoa mai, hoa đào), lễ hội địa phương theo vùng |
| Vùng miền | 7 kiểu địa hình | **Chưa có bộ kiến trúc theo vùng**: mọi bản đồ dùng chung một bộ nhà ống |

---

## 3. Danh mục asset Việt Nam

Mỗi asset có các trường: **mã**, **dùng cho** (khu hoặc công trình đã có), **footprint** (ô 10 × 10 m), **phong cách**, **cách làm** (C = dựng bằng code trong `models.js`, M = Meshy `.glb`), **ưu tiên**.

### 3.1 Nhà ở
| Mã | Tên | Dùng cho | Footprint | Phong cách | Cách làm | Ưu tiên |
|---|---|---|---|---|---|---|
| `vn_tube_lo` | Nhà ống 2–3 tầng | khu 1, 14 cấp 1–2 | 1 ô, 2–3 căn | chung | C, đã có | — |
| `vn_tube_hi` | Nhà ống 4–5 tầng | khu 13, 7 cấp 3–5 | 1 ô, 3 căn | chung | C, đã có | — |
| `vn_cap4` | Nhà cấp 4 mái ngói / mái tôn, sân trước | khu 1 cấp 1 | 1 ô | nông thôn, ven đô | C | P0 |
| `vn_tro` | Dãy nhà trọ một tầng, hành lang chung | khu 14 cấp 1–2, gần nhà máy | 1 ô | Nam Bộ, khu công nghiệp | C | P1 |
| `vn_alley` | Nhà trong hẻm (hàng thứ 3 sau mặt đường) | chính sách hẻm | 1 ô | chung | C, biến thể của nhà ống | P1 |
| `vn_kttt` | Chung cư cũ 5 tầng: tường ố vàng, chuồng cọp, dây phơi đồ | khu 4 cấp 1–2 | 1 ô | khu tập thể | C | **P0** |
| `vn_apt` | Chung cư hiện đại: tháp kính, ban công, logo dự án chữ chung chung | khu 4 cấp 3–5 | 1 ô | khu đô thị mới | C | P1 |
| `vn_villa` | Biệt thự: mái Thái / mái Mansard, cổng sắt | khu 1 cấp 4–5, giá đất cao | 1 ô | khu đô thị mới | C | P1 |
| `vn_garden` | Nhà vườn: nhà ba gian mái ngói, ao, cây ăn trái | khu 1 ở bản đồ châu thổ, cao nguyên | 1 ô | Bắc Bộ, miền Trung | C | P2 |

### 3.2 Thương mại (biến thể mặt tiền, không thêm loại kinh tế)
| Mã | Mặt tiền | Dùng cho | Ưu tiên |
|---|---|---|---|
| `shop_pho` | Biển PHỞ, nồi nước dùng, bàn ghế nhựa thấp | khu 17, 2 | **P0** |
| `shop_cafe` | Ghế nhựa quay ra đường, ô che, bảng menu | khu 17, 7 | **P0** |
| `shop_taphoa` | Kệ hàng tràn ra cửa, thùng nước ngọt xếp chồng | khu 2, 7 | **P0** |
| `shop_thuoc` | Chữ thập xanh, biển NHÀ THUỐC | khu 2, 7 | P1 |
| `shop_suaxe` | Lốp treo, bơm, xe máy đỗ trước cửa | khu 2, 7 | P1 |
| `shop_tienloi` | Cửa kính sáng, biển chữ chung chung CỬA HÀNG TIỆN LỢI | khu 2 cấp 3+ | P1 |
| `shop_sieuthi` | Hộp lớn, biển SIÊU THỊ, bãi xe máy | khu 5 cấp 1–2 | P1 |
| `shop_ttm` | Trung tâm thương mại: khối kính, biển LED, bãi xe máy dưới hầm | khu 5 cấp 3+ | P2 |
| `shop_nhahang` | Nhà hàng: đèn lồng, mái ngói giả cổ | khu 17 cấp 3+ | P2 |

Chọn mặt tiền theo hash của ô và theo khu. Có thể gắn với thứ hàng cửa hàng đang bán: cửa hàng bán thực phẩm thì ra quán ăn, bán quần áo thì ra shop thời trang. Hàng bán được tính lại mỗi lần chọn, không lưu vào bản lưu.

### 3.3 Công trình công
| Mã | Cải tiến | Ưu tiên |
|---|---|---|
| `school` / `highschool` | Cổng trường có biển tên, tường vàng, cột cờ, sân có học sinh đồng phục giờ tan học | P1 |
| `clinic` / `hospital` | Biển TRẠM Y TẾ PHƯỜNG / BỆNH VIỆN, chữ thập đỏ, xe cứu thương trắng sọc xanh | P1 |
| `police` | Màu vàng – xanh công an, biển CÔNG AN PHƯỜNG | P1 |
| `post` (mới) | Bưu điện: nhà vàng, đồng hồ trên trán tường | P2, cần thêm `SERVICES` (không tác dụng hoặc tác dụng nhỏ) |
| `culture` (mới) | Nhà văn hoá phường: sân bóng chuyền, loa phường | P2, có thể gắn với chương trình văn hoá của quận |
| `depot` | Bến xe kiểu Việt Nam: mái vòm, xe khách 29–45 chỗ | P2 |

### 3.4 Đường phố
| Mã | Vật thể | Ưu tiên |
|---|---|---|
| `st_moto_park` | Xe máy đỗ kín vỉa hè trước cửa hàng (instanced, theo số khách) | **P0** |
| `st_sign` | Biển báo giao thông Việt Nam (cấm đỗ, cấm rẽ, đường một chiều) ở nút giao | P1 |
| `st_billboard` | Bảng quảng cáo khung sắt trên nóc nhà hoặc ven đường lớn (chữ chung chung) | P1 |
| `st_bin` | Thùng rác xanh có bánh xe | P2 |
| `st_pots` | Chậu cây, cây cảnh trước nhà | P2 |
| `st_houseno` | Biển số nhà xanh | P3 |
| `st_awning` | Mái che di động (bạt kéo) theo giờ nắng | P3 |

### 3.5 Phương tiện
| Mã | Xe | Ưu tiên |
|---|---|---|
| `ebike` | Xe máy điện (thân tròn, không ống xả) | P1 |
| `shipper` | Xe máy có thùng giao hàng vuông sau yên (xanh lá, cam) | **P0** |
| `bagac` | Xe ba gác chở hàng | P2 |
| bus VN | Xe buýt sơn vàng – đỏ hoặc xanh lá, xe khách | P1 |

### 3.6 Trang trí lễ
| Mã | Vật thể | Lễ | Ưu tiên |
|---|---|---|---|
| `deco_flag` | Cờ đỏ sao vàng treo dọc phố | Quốc khánh, Tết | **P0** |
| `deco_lantern` | Đèn lồng đỏ trên dây điện | Tết, Rằm, Trung Thu | **P0** |
| `deco_mai_dao` | Cây mai (Nam) / cây đào (Bắc) trước cửa nhà | Tết | P1 |
| `deco_star_lantern` | Đèn ông sao, đèn kéo quân, mâm cỗ | Trung Thu | P2 |

Món nào có hình phức tạp (cây mai, đào, xe ba gác, người ngồi ghế nhựa) thì cân nhắc Meshy: khoảng 15 credit một món, cần hỏi trước khi tiêu.

---

## 4. Đề xuất mở rộng gameplay

Mọi thay đổi đều đi qua hệ thống đã có:

1. **Nhà trọ:** biến thể khu liền kề cấp thấp ở gần nhà máy. Tiền thuê rẻ hơn, công nhân ưu tiên ở. Đi qua `rentAt`, `fits` sẵn có; không đổi sổ cái, chỉ đổi hệ số tiền thuê.
2. **Phố ẩm thực:** dãy khu ăn uống (khu 17) liền nhau trên 1 đoạn đường, cộng với vỉa hè để tự do. Thêm sức hút du lịch và doanh thu đêm. Tính trong `tourismScore`, không thêm tiền in ra.
3. **Nắng nóng:** thời tiết mới ở mùa khô. Dùng điện nhiều hơn (máy lạnh), nước nhiều hơn, người già dễ ốm, cây xanh và công viên giảm tác hại. Thêm vào bảng thời tiết của `seasons.js`.
4. **Ô nhiễm kênh rạch:** đã có `waterPol`. Thêm mùi hôi ven kênh bẩn làm giảm giá đất và mức vui; nạo vét kênh là một chương trình quận mới hoặc gộp vào "chống ngập".
5. **Quốc khánh 2/9:** lễ theo ngày dương quy đổi (khoảng tháng 7–8 âm). Cờ treo khắp phố, nghỉ lễ, du lịch nội địa tăng, nhà máy nghỉ 1 ngày.
6. **Giờ cao điểm:** đã có dòng người đi làm theo giờ. Chỉ cần hiển thị: tăng mật độ xe máy hiển thị lúc 6–8 giờ và 17–19 giờ.
7. **Vùng miền** (mục 5.3): bộ kiến trúc, lễ địa phương và cây theo vùng. Chợ nổi ở bản đồ châu thổ là một kiểu chợ đặt trên mặt nước.

Không làm: giao thông theo luật Việt Nam chi tiết (lấn làn, đi ngược chiều), vì phải viết lại phần mô phỏng giao thông trong `traffic.js`.

---

## 5. Kế hoạch kỹ thuật

### 5.1 Kiến trúc nhà theo bảng
Thêm bảng `VN_STYLES` trong `models.js`:

```js
// khu → danh sách { fn, minLv, maxLv, w } ; w: trọng số chọn theo hash ô
const VN_STYLES = { 4: [{ fn: kttt, maxLv: 2 }, { fn: aptVN, minLv: 3 }], 1: [{ fn: cap4, maxLv: 1, w: 0.4 }, { fn: tubeRow }, { fn: villa, minLv: 4, w: 0.5 }], ... };
```

- `growableVN` tra bảng này, bảng không có kiểu hợp thì dùng nhà ống như cũ. Seed giữ công thức cũ, nên nhà đang có không đổi dáng trừ khi rơi vào kiểu mới.
- `hasVN` mở rộng theo bảng.

### 5.2 Mặt tiền cửa hàng
- `SIGN_WORDS` thêm chữ. Mặt tiền là một hàm phụ `shopFront(kind)` gọi trong `tubeHouse`.
- `kind` chọn bằng `hash2(i)` cộng thứ hàng của ô. Không lưu gì thêm.

### 5.3 Vùng miền
- `c.region ∈ { bac, trung, nam, mekong }`. Thiếu trong bản lưu thì suy từ kiểu bản đồ: châu thổ → mekong, thung lũng hoặc cao nguyên → bac, vịnh → trung, còn lại → nam. Thành phố mới chọn được vùng trong màn hình chọn bản đồ.
- Mỗi vùng là một bảng: bảng màu tường, mái (ngói đỏ ở Bắc, ngói âm dương ở Trung, mái tôn ở Nam), trọng số kiểu nhà, cây (đào hay mai), lễ địa phương thêm, công trình đặc trưng (phố cổ, nhà rường, chợ nổi).
- Bản lưu chỉ thêm một chuỗi `region`.

### 5.4 Đời sống và vật thể đường phố
- Thêm vài `InstancedMesh` trong `render.js`: khách ngồi quán, xe máy đỗ, đèn lồng, cờ.
- Vị trí tính lại khi dựng lại khu nhà (cùng chỗ đặt ghế nhựa và xe đẩy hiện nay). Số lượng theo giờ trong ngày và số khách thật của ô (`present`).
- Mỗi loại có trần số lượng, giống `MAX_*`.

### 5.5 Lễ và thời tiết
- `FESTIVALS` thêm `quockhanh`, cùng trường `deco: ['flag', 'lantern']` để `render.js` bật trang trí.
- Thời tiết `heat` thêm vào bảng chọn thời tiết mùa khô. Tác dụng đi qua các hệ số đã có (điện, nước, ốm).

### 5.6 Hiệu năng
- Mọi vật thể mới đều instanced, có trần số lượng.
- Trang trí lễ chỉ dựng khi có lễ.
- Nếu tổng số đỉnh của nhà tăng hơn 20% thì thêm LOD đơn giản: ở xa, nhà ống chỉ còn hộp và mái.

---

## 6. Lộ trình

Mỗi phase là một hoặc vài commit, có test gọn và kiểm tra trên trình duyệt trước khi push.

| Phase | Nội dung | Tiêu chí nghiệm thu |
|---|---|---|
| **1. Audit** | Tài liệu này | Đã duyệt |
| **2. Hình ảnh** | Phần P0 của mục 3: chung cư cũ, nhà cấp 4, mặt tiền phở / cà phê / tạp hoá, xe máy đỗ vỉa hè, shipper; sau đó phần P1 về kiến trúc | Ảnh chụp cùng một thành phố trước và sau: nhận ra phố Việt Nam ở cả khu cao tầng; bản lưu cũ mở được; FPS ở thành phố thử 5.000 dân giảm không quá 10%; toàn bộ test qua |
| **3. Đời sống** | Khách ngồi quán, đông người ở chợ, học sinh tan trường, tập thể dục ở công viên, giờ cao điểm | Hoạt động đổi theo giờ, nhìn thấy được khi phóng gần; không đổi số liệu mô phỏng |
| **4. Mô phỏng** | Nắng nóng, kênh rạch hôi, nhà trọ, phố ẩm thực | Mỗi hệ thống có 1 test gộp; sổ cái tiền và dân vẫn bảo toàn |
| **5. Văn hoá và vùng** | Quốc khánh, trang trí lễ, bộ 4 vùng, chợ nổi, phố cổ | Bốn bản đồ thử ở bốn vùng nhìn khác nhau rõ; bản lưu cũ tự suy ra vùng |
| **6. Hoàn thiện** | Hiệu năng, LOD nếu cần, rà asset trùng lặp, thử lưu / nạp, thử hồi quy | Toàn bộ test qua; chơi thử 30 ngày game không lỗi console |

---

## 7. Ma trận ưu tiên

| Ưu tiên | Tính năng | Tác động | Công sức | Phase |
|---|---|---|---|---|
| **P0** | Chung cư cũ (khu tập thể) cho khu cao tầng | Khu cao tầng hiện là chỗ "phương Tây" nhất | Vừa | 2 |
| **P0** | Nhà cấp 4 mái ngói / mái tôn | Ven đô, thành phố mới bớt đồng nhất | Nhỏ | 2 |
| **P0** | Mặt tiền phở, cà phê, tạp hoá có đồ bày ra vỉa hè | Nhận diện phố Việt Nam ngay | Vừa | 2 |
| **P0** | Xe máy đỗ kín vỉa hè, shipper | Đặc trưng nhất của đường phố | Nhỏ | 2 |
| **P0** | Cờ, đèn lồng trang trí dịp lễ; Quốc khánh 2/9 | Lễ đã có nhưng phố không đổi | Nhỏ | 2 (trang trí), 5 (lễ) |
| P1 | Chung cư hiện đại, biệt thự, nhà trọ, nhà trong hẻm | Phân hoá giàu nghèo nhìn thấy được | Vừa | 2 |
| P1 | Tiệm thuốc, sửa xe, tiện lợi, siêu thị | Đa dạng phố | Nhỏ | 2 |
| P1 | Trường, y tế, công an có biển và màu Việt Nam | Công trình công bớt chung chung | Nhỏ | 2 |
| P1 | Khách ngồi quán, đám đông ở chợ, giờ cao điểm | Phố có sự sống | Vừa | 3 |
| P1 | Nắng nóng, nhà trọ, phố ẩm thực | Gameplay mới có màu Việt Nam | Vừa | 4 |
| P1 | Bộ kiến trúc 4 vùng miền | Khác biệt giữa các bản đồ | Lớn | 5 |
| P2 | Nhà vườn, trung tâm thương mại, nhà hàng, bưu điện, nhà văn hoá, bến xe | Nội dung mở rộng | Vừa | 2, 5 |
| P2 | Chợ nổi, phố cổ, nhà rường, làng nghề | Nội dung vùng | Lớn | 5 |
| P2 | Kênh rạch hôi, xe ba gác, mai / đào ngày Tết, đèn Trung Thu | Mở rộng | Nhỏ | 4, 5 |
| P3 | Biển số nhà, mái che di động, thùng rác, chậu cây, biển báo | Trang trí | Nhỏ | 6 |
| P3 | LOD nhà ở xa | Chỉ khi hiệu năng giảm | Vừa | 6 |

## Tiến độ

### Phase 2, nhóm P0: xong
Tất cả chỉ hiện ở kiểu nhà 🇻🇳; bản lưu không thêm trường mới.
- **Chung cư cũ (khu tập thể):** khu cao tầng cấp 1–2 (`kttt` trong `models.js`), 5–7 tầng.
  - Tường vôi ố, chuồng cọp khung sắt hoặc cơi nới xây kín, khác nhau từng hộ.
  - Quần áo phơi, cục nóng điều hoà, kiốt ở tầng trệt, bồn nước và mái tôn cơi nới trên sân thượng, cầu thang lộ ở đầu hồi.
  - Cấp 3 trở lên vẫn là tháp như cũ, chờ "chung cư hiện đại kiểu Việt Nam" (P1).
- **Nhà cấp 4:** nhà riêng cấp 1, variant 0–1 (`cap4`).
  - Mái ngói đỏ hoặc mái tôn, hiên có cột, tường rào, cổng sắt.
  - Sân có cây, chậu cảnh, xe máy, chum nước.
- **Đồ bày trước quán:** vẽ theo đúng chữ trên biển của từng căn (`FRONT_OF_SIGN`, instanced).
  - Phở / bún chả / cơm tấm: bếp có nồi nước dùng, tủ kính, bàn inox thấp, ghế nhựa.
  - Cà phê: ghế nhựa quay ra đường, ô che, bảng menu.
  - Tạp hoá: két nước ngọt, kệ hàng, bao gạo.
  - Bánh mì: xe tủ kính mái vàng.
  - Sửa xe: lốp chồng, máy bơm.
  - Bộ ghế nhựa chung trước mọi cửa hàng trước đây đã được thay bằng các món này.
- **Xe máy đỗ trước cửa:** khoảng 70% số căn mở quán.
- **Shipper:** khoảng 5% số xe máy; thùng giao hàng và áo màu xanh lá hoặc cam (màu chung, không theo hãng nào).
- **Trang trí lễ:** cờ cắm trên cột điện, đèn lồng treo trên dây điện. Trường `deco` của `FESTIVALS`:
  - Chợ Tết, Tết: cờ và đèn lồng đỏ.
  - Rằm tháng Giêng, Vu Lan: đèn lồng.
  - Trung Thu: đèn lồng nhiều màu.
  - Giỗ Tổ, Đoan Ngọ: cờ.
  - Chỉ dựng lại khi đổi lễ hoặc đổi đường.

Nghiệm thu: test gộp `Việt Nam hoá P0` qua, toàn bộ test qua (trừ 4 test TikTok hỏng sẵn trên máy dev Node 19). Đã xem trên trình duyệt ở thành phố thử ngày Tết. Bản lưu cũ không đổi định dạng.

### Phase 2, nhóm P1: xong
Chỉ hiện ở kiểu nhà 🇻🇳; bản lưu không thêm trường mới.
- **Chung cư khu đô thị mới:** khu cao tầng cấp 3+ (`aptVN`).
  - Khối đế thương mại, tháp trắng – kính, ban công kính so le có cây, lam đứng.
  - Vườn và khung chữ dự án trên mái.
- **Biệt thự:** nhà riêng cấp 4–5, variant 0 (`villa`).
  - Mái Thái, khối nhô mặt tiền, ban công lan can trắng, cột sảnh.
  - Hàng rào, cổng sắt, ô tô trong sân, sân cỏ.
- **Dãy nhà trọ:** liền kề cấp 1–2, variant 0 (`nhaTro`).
  - Hai dãy phòng đối diện, cửa sắt có số phòng, mái tôn che hành lang.
  - Quần áo phơi giữa lối đi, xe máy, cổng có bảng "phòng trọ".
- **Siêu thị:** thương mại lớn cấp 1–2 (`sieuThi`).
  - Hộp lớn, dải màu có chữ SIÊU THỊ, mái đón, xe đẩy, bãi xe máy có mái tôn.
  - Cấp 3+ giữ tháp như cũ.
- **Nhà thuốc** (hộp đèn chữ thập xanh, tủ kính) và **cửa hàng tiện lợi** (cửa kính sáng, kệ, thùng đá).
  - Thêm chữ NHÀ THUỐC, TIỆN LỢI vào biển các căn nhà ống.
- **Công trình công:** cổng có bảng tên đỏ chữ vàng (hoặc theo màu ngành) ở mép trước lô:
  - TRƯỜNG TIỂU HỌC, TRƯỜNG THPT, TRƯỜNG ĐẠI HỌC;
  - TRẠM Y TẾ PHƯỜNG, BỆNH VIỆN;
  - CÔNG AN PHƯỜNG, CẢNH SÁT PCCC.
  - Chưa đổi màu tường của các công trình này: đổi màu sẽ ảnh hưởng cả kiểu nhà cũ, để Phase 5 làm theo vùng.
- **Xe máy điện:** khoảng 8% số xe máy.
- **Xe buýt kiểu Việt Nam:** vàng hoặc xanh lá.
- Chưa làm **nhà trong hẻm**: chính sách hẻm đã cho nhà ống mọc sâu; cần một biến thể riêng khi biết ô nào nằm trong hẻm, để sau.

Nghiệm thu: test gộp `Việt Nam hoá` qua; toàn bộ test qua (trừ 4 test TikTok hỏng sẵn trên máy dev Node 19); đã xem trên trình duyệt.

### Phase 3, đời sống: xong
Chỉ là hình (`render._life`), không đổi số liệu mô phỏng. Cập nhật khoảng 10 lần mỗi giây; có trần 1.500 người ngồi và 2.000 người đứng.
- **Khách ngồi quán theo giờ:**
  - Phở / bún / cơm: đông sáng 5h30–9h, trưa 11h–13h30, tối 17h30–21h.
  - Cà phê: đông sáng 6h–9h và tối 19h–23h.
  - Bánh mì: người đứng mua sáng sớm và chiều.
  - Mưa thì vỉa hè vắng.
- **Đi chợ:** chợ truyền thống trong khu quy hoạch đông nhất 5h–10h. Chợ trung tâm có người ra vào cửa chợ.
- **Học sinh áo trắng túa ra cổng trường** lúc vào học (6h30–7h20) và tan học (10h50–11h50, 16h40–17h40), lẫn vài phụ huynh đón con.
- **Tập thể dục:** ở công viên, quảng trường sáng 5h–7h. Nhảy dân vũ chiều tối 17h30–19h30: xếp hàng, nhún theo nhạc. Mưa thì không ai ra.
- **Giờ cao điểm:** không thêm xe giả. Mô phỏng đã cho dân đi làm theo giờ nên xe máy đã đông vào sáng và chiều.

Nghiệm thu: hoạt động đổi theo giờ, nhìn thấy khi phóng gần (đã xem trên trình duyệt lúc 6h, 7h, 11h). Số liệu mô phỏng không đổi. Toàn bộ test qua.

### Phase 4, mô phỏng: xong
Đi qua các hệ thống đã có. Không in thêm tiền, không thêm trường lưu; thời tiết mới `heat` chỉ là một giá trị nữa của trường thời tiết sẵn có.
- **Nắng nóng gay gắt 🥵:** chỉ ở mùa nóng (tháng 4–7 âm), mỗi đợt 2 ngày.
  - Điện dùng +30%, nước +15%: lưới đang sát công suất thì thiếu điện nước.
  - Nhà không có công viên, cây xanh quanh đó kém vui (−4).
  - Người già dễ ốm gấp đôi.
  - Dễ cháy như ngày khô hạn; ít mưa; trời quang.
- **Kênh rạch hôi:** nhà gần sông, kênh bẩn (ô nhiễm nước > 0,35) kém vui theo mức bẩn, có dòng "Kênh rạch, sông gần nhà bốc mùi hôi".
  - Chương trình "Nạo vét cống, chống ngập" của quận giảm mùi đến 75% ở mức cao nhất.
  - Giá đất vẫn giảm như trước.
- **Nhà trọ:** một phần ba số ô liền kề cấp 1–2 (theo variant; khớp với hình dãy nhà trọ ở kiểu nhà Việt Nam).
  - Tiền thuê ×0,65: người thu nhập thấp giữ được nhiều tiền hơn.
  - Hơi chật (−2 vui).
  - Tiền thuê vẫn đi vào ví toà nhà, sổ cái giữ nguyên.
- **Phố ẩm thực 🍜:** từ 4 ô khu ăn uống, giải trí liền nhau cùng một mặt đường. Mỗi ô +0,35 sức hút du lịch (tối đa 12).
  - Nhân với chính sách vỉa hè: tự do ×1,3, cấp phép ×1,1, dẹp ×0,8.
  - Hiện trong bảng 💰 phần du lịch.

Nghiệm thu: test gộp `Phase 4` qua (điện dùng tăng, mức vui đổi, tiền thuê nhà trọ, phố ẩm thực, sổ tiền không lệch sau 2 ngày nắng nóng). Toàn bộ test qua. Đã xem trên trình duyệt: nhãn thời tiết, dòng phố ẩm thực.

**Bước tiếp theo đề xuất:** Phase 5 (văn hoá và vùng): Quốc khánh 2/9, bộ kiến trúc 4 vùng (Bắc, Trung, Nam, đồng bằng sông Cửu Long), chợ nổi, phố cổ.

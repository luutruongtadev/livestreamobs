# AI Corporate Ecosystem — phân tích kiến trúc và đề xuất tích hợp

Trạng thái: **đề xuất, chưa viết code**. Cần người chơi duyệt hướng (mục 9) trước Phase 1.

## 1. Game hiện có gì (cái để bám vào)

| Hệ thống | Hiện trạng | Dùng lại thế nào |
|---|---|---|
| Doanh nghiệp | Không có thực thể "công ty". Mỗi ô nhà có ví riêng `c.biz.{money, sin, sin2, sout, eff, incoming}` (`people.js:34`). `bizKind` = raw / factory / shop / market / leisure / office. | Công ty = **lớp sở hữu phủ lên các ô**, không thay `c.biz`. |
| Chuỗi sản xuất | `PRODUCTS`, `RAW`, `recipeAt`, `bizHour`: nhà máy tự đặt hàng, xe tải chạy nhà cung cấp gần nhất, không có thì nhập ngoài, kho đầy thì xuất. | Là "Supply chain" của đặc tả. Công ty chỉ **chọn đặt xây gì, ở đâu, giá nào**; luồng hàng vẫn do `bizHour` chạy. |
| Tiền | Sổ cái kín (`ledger.js`): `totalMoney` = ngân sách + ví dân + `biz.money` + thuế chờ. Mọi dòng đi qua `inner / world / cityGet / cityPay`, `checkLedger` bắt lệch. Phá sản = `clearBuilding`. Lãi dư chia cổ tức cho mọi người lớn. | Quỹ công ty phải **nằm trong `totalMoney`**. Vốn ngoài vào chỉ qua `world()` (có `worldCan`). |
| Thuê AI viết lời + game ép số | `gateway/city-ai.js` (schema, `num`, `numTree`, rate limit, trả `null` → mẫu câu); `council.js` `DEALS` + `clampOffer` + mặc cả; chủ tịch quận chế độ **Tự chủ**: `distBuildPlan` (game chọn chỗ, LLM chỉ chọn loại), `chairPick`. | Đây chính là kiến trúc "AI quyết – validator kiểm – game thực thi". CEO đi theo đúng khuôn này. |
| Hộp thư thị trưởng | `c.council.inbox` (dilemma, deal), hạn trả lời, quyết tự động theo chủ tịch. | Đề xuất của tập đoàn là một loại `kind` mới trong inbox. Không thêm popup mới. |
| Chính sách | `league.js` (giá chào, thuế quan), `taxBreak`, `tech` (cây công nghệ), quận (`distFx`). | Ưu đãi / cam kết đàm phán trả về qua `councilMod`, `taxBreak` có sẵn. |
| Công trường, xe, bản đồ | `siteAnims`, xe `truck`, sign atlas, overlay bản đồ. | Hiển thị công ty mà không cần asset mới lớn (xem 6). |
| Lưu | Mỗi module có `pack*/init*` tự lọc dữ liệu. | Thêm `packCorp / initCorp`; save cũ không có `c.corp` vẫn chạy. |

Hệ quả thiết kế: **phần kinh tế đã đủ**. Thứ còn thiếu là *chủ thể ra quyết định* ở giữa sổ cái và bản đồ. Vì vậy không viết lại economy; thêm một lớp "chủ sở hữu + chiến lược".

## 2. Nguyên tắc tích hợp

1. **Additive**: `owner = 0` nghĩa là doanh nghiệp độc lập như hiện nay. Tắt hẳn hệ tập đoàn thì game y hệt bản cũ.
2. **Mọi hành động đi qua một cổng duy nhất** `corpAct(c, corp, action)` = validate → execute → ghi lịch sử. LLM, luật cố định và người chơi đều chỉ tạo `action`.
3. **Chạy được không cần LLM.** CEO "luật" (rule-based theo tính cách) quyết toàn bộ; LLM chỉ chọn trong *danh sách hành động hợp lệ do game liệt kê* và viết lời. Offline = vẫn chơi bình thường.
4. **Không có số nào do LLM bịa**: tài chính, lao động, sản lượng, lịch sử đều từ sim. LLM nhận bản tóm tắt và trả `{action id, lý do}`.
5. **Giữ bất biến sổ cái**: test `checkLedger` sau 100+ ngày với tập đoàn bật.

## 3. Mô hình dữ liệu (đề xuất)

```
c.owner   : Uint16Array(N*N)   // 0 = độc lập; >0 = id công ty (chỉ cho ô có doanh nghiệp)
c.corp = {
  nextId, list: [Corp], day0,
}
Corp = {
  id, name, sector: 'food'|'steel'|…|'retail'|'logistics'|'energy',
  parent: id|0,                      // công ty con → tập đoàn mẹ
  stage: 1..4,                       // TÍNH từ chỉ số, không do LLM đặt
  cash,                              // quỹ công ty, nằm trong totalMoney
  ceo: { persona, risk 0..1, style, goals:[…], expand: 'organic'|'acquire'|'export' },
  cooldown: { strategy, crisis, ask },   // ngày game
  plan: { goal, due } | null,        // mục tiêu đang theo
  deals: [{ id, kind, terms, due, status }],   // cam kết đã ký với thành phố (đo được)
  log: [{ day, type, data }],        // lịch sử, append-only, tối đa ~300, gộp cũ
}
```

Chỉ số **suy ra mỗi ngày** (không lưu, hoặc cache): số ô sở hữu, việc làm, doanh thu, thuế đóng, sản lượng, thị phần theo `PRODUCT`, mức kiểm soát chuỗi (tỷ lệ đầu vào lấy từ ô cùng chủ), tài sản.

### Stage (xác định)
| Stage | Điều kiện đo được |
|---|---|
| 1 Startup | 1–2 ô |
| 2 Growing | ≥ 3 ô **hoặc** có xuất khẩu liên tục 7 ngày |
| 3 Large | ≥ 8 ô, ≥ 150 việc làm, ≥ 2 ngành (kể cả công ty con) |
| 4 Tập đoàn | ≥ 3 công ty con, ≥ 3 ngành, ảnh hưởng (mục 7) ≥ ngưỡng |

Có thể **tụt bậc** (thu hẹp, phá sản). Không có kịch bản cố định: bậc là kết quả.

## 4. Vòng quyết định (tiết kiệm LLM)

```
Hằng giờ/ngày (sim, 0 LLM)         Corporate Intelligence
  chỉ số + phát hiện sự kiện   ──►  danh sách "cơ hội / rủi ro" đã chấm điểm
                                           │ có trigger? + hết cooldown?
                         ┌─────────────────┴───────────────┐
                    không: CEO luật chọn                có: gọi LLM (1 call / sự kiện)
                         └─────────────────┬───────────────┘
                                    Action Validator
                       (vốn, đất, hạ tầng, luật chơi, tối đa/ngày)
                                           │ ok
                                    Execute → World (công trường, xe, ô sở hữu)
                                           │
                                    log lịch sử → cập nhật chỉ số
```

**Trigger gọi LLM** (rule-based, mỗi loại có cooldown): đổi bậc; có cơ hội ≥ ngưỡng điểm (ô đất tốt, đối thủ yếu để mua); khủng hoảng (quỹ âm, thiếu nguyên liệu > X ngày, lỗ liên tiếp); cần đề xuất lên thành phố; người chơi đàm phán lại.

**Ngân sách LLM**
- Một CEO điều phối cả tập đoàn + công ty con (1 call, không mỗi con một call).
- Cooldown: chiến lược ≥ 3 ngày game, khủng hoảng ≥ 1 ngày, tối đa ~1 call / công ty / 3 ngày; trần toàn thành phố vài call mỗi phút thực (dùng lại rate limit gateway).
- Cache theo băm trạng thái rút gọn: trạng thái không đổi → dùng lại quyết định.
- Tóm tắt ≤ ~1 KB JSON số (như `districtBrief` / `numTree`), danh sách hành động hợp lệ ≤ 6 mục.
- Lời đề xuất lên thành phố: mẫu câu soạn sẵn + LLM viết lại tuỳ chọn (như `DEALS.summary`).

Gateway: thêm `kind: 'corp'` với task `strategy | crisis | propose | negotiate`, schema `{ id, why }` hoặc `{ text }`, cùng khuôn `DIST_SCHEMA`.

## 5. Hành động (cổng `corpAct`) và validator

| Action | Thực thi bằng cái đã có | Validator kiểm |
|---|---|---|
| `build` (nhà máy / xưởng / kho / cửa hàng) | Game chọn ô như `distBuildPlan` (gần nguyên liệu, đường, điện nước), đặt khu, công trường dựng | quỹ đủ, ô hợp lệ, hạ tầng nối, quyền với đất (xem `landReq`), trần số công trình / ngày |
| `expand` | Nâng cấp ô sở hữu | vốn, nhu cầu (kho tồn, `eff`) |
| `import/export push` | Dùng `contract`/chính sách xuất của `league.js`/`bizHour` | thị trường ngoài còn mua (`worldK`) |
| `subsidiary` | Tạo `Corp` mới `parent = id`, chuyển ô + vốn | stage ≥ 2, vốn tối thiểu |
| `acquire` | Đổi `c.owner[i]` của công ty yếu, trả tiền cho cổ đông/dân qua `inner('dividend')` | định giá từ tài sản; chống độc quyền (xem 7) |
| `restructure / downsize / exit` | `clearBuilding` các ô lỗ, bán tài sản | không để quỹ âm sổ cái |
| `ask` (xin đất, ưu đãi, nối đường, điện) | Thêm `inbox` kind `corp` | ràng buộc tham số `clampOffer` |

Chi phí xây qua `procure(...)` để tiền quay vào doanh nghiệp trong thành phố (đúng như `landlordDay`, `bizHour`), không tạo tiền.

### Nguồn vốn (giữ sổ cái)
- Vốn lập công ty: lấy từ `biz.money` của các ô gom lại (chuyển nội bộ) + vốn ngoài qua `world(c,'invest',…)` giới hạn bởi `worldCan`/`worldK`.
- Lợi nhuận: ô sở hữu bị quét phần dư trên ngưỡng vào `corp.cash` **thay** cho cổ tức dân; `corp` trả cổ tức theo tỷ lệ của CEO (giữ dòng `dividend`).
- Vay: dùng ví "ngân hàng" của thế giới (`world`), có lãi và hạn trả; vỡ nợ → mục khủng hoảng.

## 6. Tác động lên thành phố (hiện trên map, không chỉ popup)

Mọi tác động đã có đường dẫn trong sim, chỉ cần công ty *tạo cầu* chứ không viết hệ mới:
- **Đất / quy hoạch**: công ty xin đất → hộp thư; nếu duyệt, game đặt khu CN/kho + công trường; cụm công nghiệp hình thành vì chọn ô gần nhau.
- **Việc làm / dân số**: ô mới tăng `jobCap`; dân tới (`peopleHour` có sẵn) → thiếu nhà, trường, bệnh viện là tự nhiên.
- **Hạ tầng**: xe tải, điện, nước (`utilUse`), nước thải/rác (`waterPol`, `garbage`) tăng tự động theo `level`.
- **Thị trường**: lương, giá thuê (`wageAt`, `rentAt`), cạnh tranh nguyên liệu qua `needs/supply` của `bizHour`.
- **Nhìn thấy**: biển hiệu logo công ty (thêm từ vào `signAtlas`), màu mái / băng rôn theo `c.owner`, xe tải sơn màu công ty, overlay bản đồ "Tập đoàn" tô theo chủ sở hữu; công trường dùng `siteAnims`. Không cần mô hình 3D mới ở MVP.

## 7. Ảnh hưởng, độc quyền, khủng hoảng

**Chỉ số ảnh hưởng** `influence(corp)` ∈ [0,100], tính từ sim: 25% tỷ trọng việc làm, 20% tỷ trọng thuế, 20% thị phần theo sản phẩm, 15% kiểm soát chuỗi, 10% số ngành, 10% tài sản. Vượt ngưỡng → hiệu ứng thật:
- Phụ thuộc: ngân sách / việc làm chịu cú sốc nếu công ty đó co lại.
- Độc quyền: thị phần > ~60% một sản phẩm → giá bán lên, `validator` chặn `acquire` thêm, mở **lựa chọn chính sách** (hỗ trợ SME, mời đối thủ, khuyến khích đa dạng hoá = đặt `councilMod`/`taxBreak` có chủ đích).
- Gây áp lực: tập đoàn lớn xin ưu đãi cứng hơn (tham số `clampOffer` dịch về phía họ).

**Khủng hoảng** nhận diện bằng luật (không LLM): quỹ < 0, `eff` thấp kéo dài, thiếu nguyên liệu, lỗ N ngày, xuất khẩu rơi, thiếu lao động. CEO (luật hoặc LLM chọn trong menu) → cắt chi phí / đổi nhà cung cấp / vay / bán ô / tái cấu trúc / đóng cơ sở / tìm đối tác. Phá sản dùng đường `clearBuilding + bankrupt` đã có; thêm **lan truyền**: công ty con của tập đoàn đổ → mất việc (`pp` đã tự xử lý), hợp đồng cấp hàng đứt (nhà cung cấp tự tìm bên khác), thuế giảm, sự kiện hộp thư.

## 8. Lịch sử

`corpLog(c, corp, type, data)` gọi **từ chỗ sự kiện thật xảy ra** (xây, mua, ký hợp đồng, khủng hoảng, đổi bậc, số lao động mỗi mùa). Sử ký = đọc `log`. LLM chỉ được *kể lại* các dòng này (task `narrate`, tuỳ chọn); không có quyền thêm dòng.

## 9. Lộ trình triển khai đề xuất (mỗi phase đứng được một mình)

**Phase 1 — Nền (khuyến nghị làm trước)**
- `corp.js`: `c.owner`, `Corp`, `corpHour/Day`, stage, chỉ số, `corpAct` + validator, `corpLog`, save/load tương thích.
- Seed: thành phố cũ/mới đủ lớn gom các cụm nhà máy sẵn có thành 2–3 công ty (chuyển `biz.money` vào quỹ, **không tạo tiền**).
- CEO luật theo tính cách (`risk`, `style`): `build`, `expand`, trả cổ tức, đóng cơ sở lỗ.
- Hộp thư: `ask` xin đất/điện/đường; thị trưởng nhận / từ chối / mặc cả (`clampOffer`), cam kết đo được (việc làm, xử lý nước thải, đào tạo).
- UI: bảng "Tập đoàn" (danh sách, bậc, ảnh hưởng, lịch sử), overlay sở hữu, biển hiệu.
- Test (2 gộp): sổ cái không lệch sau 60 ngày; save/load; validator từ chối.
- Chấp nhận: bật/tắt hệ tập đoàn đều chạy; không LLM vẫn thấy công ty mọc nhà máy, xin đất, đóng thuế.

**Phase 2 — Mở rộng**: công ty con, giao dịch nội bộ (ưu tiên nguồn cùng chủ trong `deliver`), logistics/kho, xuất khẩu chủ động, sử ký đầy đủ. LLM bắt đầu chọn hành động (strategy) + viết lời.

**Phase 3 — Hệ sinh thái**: cạnh tranh đất/lao động/nguyên liệu, liên doanh (cùng góp hạ tầng), M&A, chỉ số ảnh hưởng + độc quyền + khủng hoảng lan truyền.

**Phase 4 — Kinh tế tự vận hành**: tập đoàn chủ động đầu tư theo cung cầu (`worldK`, giá), hình thành trung tâm kinh tế, cân đối cho nhiều thành phố trong league (tập đoàn nội địa của từng thành phố, **không** chuyển tài sản giữa thành phố; chỉ cân thương mại qua `contract` hiện có).

## 10. Rủi ro và cách chặn

| Rủi ro | Cách chặn |
|---|---|
| Sổ cái lệch (tiền sinh/mất) | Mọi chuyển tiền qua `inner/world/cityGet`; quỹ công ty vào `totalMoney`; test `checkLedger` dài ngày. |
| Hiệu năng (3 000+ ô, nhiều công ty) | Chỉ số tính theo ngày; vòng quyết định theo ngày game, không theo frame; ô sở hữu giữ danh sách, không quét toàn bản đồ mỗi giờ. |
| Chi phí LLM | Mục 4: trigger + cooldown + cache + một call/tập đoàn + fallback luật. |
| Cân bằng (tập đoàn quá mạnh / chết quá nhanh) | Tham số gom một bảng `CORP` như `PROGRAMS`, chỉnh không đụng logic; chế độ sandbox để thử. |
| Phá save | `owner` mặc định 0; `initCorp` lọc dữ liệu hỏng (khuôn `initDistricts`). |
| Biến thành chatbot / popup | Đề xuất gộp vào hộp thư có sẵn, hạn trả lời, tự quyết theo chủ tịch quận khi thị trưởng bỏ qua. |

## 11. Điểm cần bạn quyết

1. **Phạm vi Phase 1**: chỉ công ty sản xuất (nhà máy / xưởng) hay thêm bán lẻ và logistics ngay?
2. **Tiền công ty**: cho công ty vay / nhận vốn ngoài (`world`) từ Phase 1, hay chỉ dùng lợi nhuận tự có để giữ đơn giản?
3. **Đất**: công ty có tự mua đất trống không (trả tiền cho ngân sách thành phố), hay luôn phải xin thị trưởng duyệt?
4. **Lưu ý multiplayer**: tập đoàn chỉ nội bộ từng thành phố (đề xuất), hay sau này liên thành phố?

## 12. Tiến độ — Phase 1 đã làm (chờ push)

- `js/corp.js`: `c.owner` (id công ty trên từng ô), công ty (quỹ, CEO 4 tính cách, bậc có độ trễ, mục tiêu, cam kết, lịch sử), cổng `corpAct` (build / release / ask), CEO chạy bằng luật, chỉ số ảnh hưởng. Lưu/nạp tương thích (`corp` trong save; save cũ tự có công ty khi đủ điều kiện).
- Sổ cái: quỹ công ty nằm trong `totalMoney`; phí xây đi qua `procure` (`corpBuild`), phí đất vào ngân sách (`corpLand`), cổ tức qua `dividend`. Test dài ngày không lệch.
- Quyết định đã chọn thay cho 4 câu ở mục 11: Phase 1 chỉ công ty sản xuất; không vay / vốn ngoài (chỉ lợi nhuận tự có, vốn lập công ty chuyển từ ví nhà máy); mở rộng nhỏ 1 ô cạnh cụm cũ tự làm, dự án nhiều ô phải xin thị trưởng; tập đoàn chỉ trong từng thành phố.
- Khác với đề xuất: đề xuất của công ty nằm trong bảng 🏢 riêng chứ không vào hộp thư 📨 (không đụng cấu trúc `council.inbox`).
- UI: nút 🏢, bảng danh sách + chi tiết + lịch sử, ba nút Chấp nhận / Đòi thêm việc làm / Từ chối; lớp bản đồ "Tập đoàn".
- Chưa làm (để Phase 2): biển hiệu logo công ty trên nhà máy, LLM chọn hành động, công ty con, bậc 4, giao dịch nội bộ, xuất khẩu chủ động, bán lẻ / logistics.

## 13. Tiến độ — Phase 2 đã làm (chờ push)

- **Công ty con**: công ty bậc ≥ 2 có ≥ 5 nhà máy lập tối đa 3 công ty con (chuyển 2 nhà máy, ưu tiên khác ngành chính, kèm vốn từ quỹ mẹ; mẹ giữ ≥ 3). Công ty con cùng CEO với mẹ, chia lãi lên mẹ. Bậc 4 (Tập đoàn) = ≥ 2 con và ≥ 12 nhà máy cả nhóm. Mẹ giải thể thì con thành độc lập.
- **Giao dịch nội bộ**: `people.js` ưu tiên nhà cung cấp cùng nhóm (khoảng cách × 0.55) và đếm hàng giao trong nhóm (`intern`).
- **Xuất khẩu chủ động**: tồn kho thành phẩm ≥ 18 thì bật đẩy xuất (xuất từ 16 thay vì 30), tắt khi < 8, giữ ít nhất 6 ngày giữa hai lần đổi. Đếm hàng xuất (`xunits`).
- **AI chọn hành động**: khi có AI, CEO chỉ có ≥ 2 lựa chọn hợp lệ thì chờ AI chọn (`kind: 'corp'` ở gateway, chỉ chọn trong danh sách, kèm lý do ghi vào lịch sử, đánh dấu 🤖). Quá 6 giờ game hoặc AI tắt thì dùng lựa chọn của luật. Không có AI vẫn chơi bình thường.
- **UI**: cây công ty mẹ ↳ con, màu bản đồ theo tập đoàn mẹ, hàng nội bộ / xuất khẩu, lý do của CEO trong lịch sử.
- **Chưa làm**: kho bãi / logistics, bán lẻ, biển hiệu logo, khủng hoảng lan truyền, M&A (Phase 3).

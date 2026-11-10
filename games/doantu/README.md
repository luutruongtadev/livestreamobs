# 🔤 Đoán từ (`doantu`)

Game đầu tiên của nền tảng (chuyển từ server đơn cũ). Người xem bình luận để đoán **từ bí mật**; mỗi từ đoán được chấm **độ gần nghĩa 1–100 chỉ theo nghĩa / liên quan / liên tưởng** (không theo mặt chữ, phát âm). Đoán trúng (gõ không dấu vẫn nhận, gõ sai dấu thì không) = 100 điểm, thắng vòng.

## Cấu trúc
| Phần | Nội dung |
|---|---|
| `engine/index.js` | `createGame(ctx)` — bọc `WordGame` theo hợp đồng; chấm điểm: tra Knowledge Pack tại chỗ (0 ms), từ ngoài pack hỏi server qua `ctx.server.request('score')` |
| `engine/wordgame.js` | Engine gốc: vòng chơi, gợi ý, kiểu chơi (meaning / attr / english / giaima), combo, đấu đội (`teams.js`) |
| `engine/pack.js`, `match.js`, `attributes.js`, `giaima.js` | Logic thuần dùng chung engine + server |
| `render/index.js` | Renderer canvas 1080×1920 (`mount`) + `sound.js` |
| `server/index.js` | Chạy trong gateway: `LayeredScorer` (cache RAM dùng chung mọi kênh → pack → embedding → Claude), `AttrStore`, `EnglishHintStore`. Ops: `score`, `pack`, `attr`, `english`, `caps` |
| `data/` | Kho soạn sẵn: 449 từ gần nghĩa, 285 từ thuộc tính (+ cache), 464 từ tiếng Anh, 292 câu giải mã, 674 Knowledge Pack |

## Màn hình (kiểu gần nghĩa)
- **Bảng gần nghĩa** là trung tâm: mỗi từ là một thanh dài theo điểm, màu theo dải — **xanh = gần** (≥ `bandHot`, mặc định 75), **cam = ấm** (≥ `bandWarm`, mặc định 50), **đỏ = xa**. Hạng 1 có ô vàng. Bảng luôn cao cố định (ô trống có nét đứt) nên bố cục không giật.
- **Vừa đoán** ghim trên đầu bảng: từ mới nhất + hạng của nó trong mọi từ đã đoán vòng này (vd `#23`), kể cả khi không lọt top; đang chấm thì có vệt sáng chạy.
- Dưới bảng: hàng hướng dẫn, bong bóng **đoán trước đó** (viền theo màu dải), **điểm tuần** bên phải.
- Kiểu thuộc tính / giải mã giữ bảng riêng như cũ.

## Actions (nền tảng ánh xạ quà / tim → action; streamer đổi trong dashboard)
| id | Tác dụng | Mặc định |
|---|---|---|
| `letter` | Lộ 1 chữ cái (luôn chừa ≥ 1 chữ; không lộ được thì trả lượt). Vòng tiếng Anh: tim mở thêm từ tiếng Anh trước | 5 Hoa hồng / TikTok / Heart Me / Ice Cream · Tim tay · 1000 tim |
| `hint` | Mở gợi ý tiếp theo (vòng Giải mã: giải hộ 1 gợi ý) | quà ≥ 10 xu |
| `time` | +60 giây (`params.seconds`) | quà ≥ 30 xu |
| `syllable` | Lộ cả 1 tiếng (Giải mã: lộ 3 chữ) | quà ≥ 99 xu |

## Lệnh
`next` (kết thúc vòng / vòng tiếp), `hint`, `team` (`{ op: on | off | reset, rounds }`), `reset`. `pause` / `resume` do nền tảng cung cấp.

## Khôi phục
`restore: "partial"` — reload overlay giữ người thắng, từ đã chơi, chuỗi combo, đội; ván đang chơi bắt đầu lại.

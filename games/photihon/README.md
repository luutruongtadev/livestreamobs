# Phố Tí Hon (`photihon`)

Game 3D tương tác TikTok Live: một thị trấn tí hon low-poly trên hòn đảo nổi hình chữ nhật (mép bụi cây, đất bậc thang, chóp đá treo bên dưới). Người xem tặng quà để gọi thảm hoạ phá phố, bình luận để làm dân phố chạy ra sửa nhà. Phố sập đủ `wipePercent` % thì vinh danh người đánh sập, vài giây sau phố mới mọc lên.

Render bằng three.js (bản r160 + GLTFLoader chép sẵn trong `render/vendor/`, giấy phép MIT ở `three-LICENSE`).

Phố kiểu Việt: mô hình 3D tạo bằng [Meshy](https://www.meshy.ai) (lưới `meshy-t2.5` khoảng 4.000 mặt + texture), nằm trong `assets/models/`:
| File | Loại toà trong engine |
|---|---|
| `house.glb` | `house`: nhà ống có ban công hoa giấy |
| `shop.glb` | `shop`: tiệm tạp hoá, ghế nhựa vỉa hè |
| `tower.glb` | `tower`: chung cư cũ (kéo cao theo số tầng) |
| `tank.glb` | `tank`: cây xăng mini (sập thì nổ) |
| `pagoda.glb` | `pagoda`: đình làng |
| `buffalo.glb` | thảm hoạ `khunglong`: trâu khổng lồ |

Renderer nạp các file này ở nền; file nào không tải được thì loại đó dùng khối dựng bằng code (bản cũ), nên overlay không bao giờ trống. Đổi mô hình: thay file `.glb` cùng tên, chỉnh `foot` (bề rộng chân đế) trong `MODEL_FILES` ở `render/index.js`.

## Luật chơi
- **Bình luận** (gì cũng được): một dân phố đội nón vàng chạy tới sửa toà hư nặng nhất (+`repairPerComment` máu; mỗi người cách nhau `commentCooldown` giây). Không sửa được đống đổ nát.
- **Tim**: mỗi `likesPerHail` tim rơi một cục mưa đá.
- **Cây xăng** sập thì nổ, phá nhà xung quanh: phá dây chuyền tính điểm ×2 cho người gây ra.
- **Bảng Phá nhiều nhất**: điểm phá trong phố hiện tại. **Bảng Phá**: số phố từng đánh sập (người làm đổ toà cuối cùng vượt ngưỡng).
- Quà tặng lúc đang vinh danh được để dành cho phố mới.

## Máy quay cận cảnh
Quà gọi thiên thạch, sét, UFO: máy quay lướt tới cận cảnh toà bị nhắm (kèm khung ngắm, chấm REC, nhãn "🎥 Chung cư · tên người tặng"), giữ tới khi toà đổ rồi lùi ra toàn cảnh. Lốc xoáy và trâu khổng lồ thì máy quay bám theo; lũ quay sông, động đất kéo gần cả phố. Quà tới dồn dập thì mỗi cận cảnh giữ ít nhất `zoomSeconds` giây rồi chuyển sang cái mới; thảm hoạ cũ chưa xong thì quay lại sau. Phố sập thì máy quay lia chậm qua đống đổ nát. Tắt bằng `cameraZoom`; mưa đá do tim và thảm hoạ của Ông Trời không zoom.

## Bản đồ kiểu Việt
- **Thành phố** (bắc sông): cao ốc kính (tối đa 2), chung cư cũ, nhà ống, tiệm tạp hoá, chợ có sạp mái bạt; cột điện chằng dây dọc đường lớn.
- **Làng quê** (nam sông): nhà cấp 4 mái ngói đỏ có hiên cột và chum nước, đình làng, ruộng lúa ở lô trống (người đội nón lá, trâu gặm cỏ).
- **Bờ biển** (phía đông): bãi cát, dừa, biển đổ thác xuống mép đảo, 2 bến tàu (cầu cảng, nhà chờ, ghe có mắt ghe), thuyền thúng.
- Cây xăng chỉ ở lô sát đường lớn (luôn có ít nhất 1); xe máy và ô tô chạy trên đường lớn.

## Mục tiêu, biến cố, may rủi
- **Nhiệm vụ** (`missions`): luôn có một nhiệm vụ cho người xem trong `missionSeconds` giây: đánh sập toà được đánh dấu 🎯, phá n toà loại X, làm nổ cây xăng, phá 4 toà thật nhanh. Người hoàn thành được `missionReward` điểm (đánh sập toà 🎯 thì ×1,5). Chế độ streamer: người xem xong nhiệm vụ → streamer phải giữ thêm `missionPenaltySeconds` giây; hết giờ nhiệm vụ → streamer +2 ⚡.
- **Biến cố** (`eventEvery` giây): 🌀 Bão về (thảm hoạ ×1,5, mưa, trời tối), ⭐ Giờ vàng (điểm phá ×2), 🚒 Đội cứu hộ (bình luận sửa ×3), 🌊 Triều cường (biển dâng đánh nhà ven biển + bến tàu), 🧧 Tết đến (cả phố hồi 25% máu, pháo hoa).
- **May rủi** (`luck`): mỗi quà thảm hoạ có `critChance`% CHÍ MẠNG (sát thương ×2) và `missChance`% XỊT (thiên thạch / sét rơi xuống biển, lốc / trâu tan sớm).
- **Hộp bí ẩn** (quà Ice Cream Cone): quay ra một thảm hoạ ngẫu nhiên; 4% JACKPOT Mưa thiên thạch (5 quả), 6% "rủi" ra Khiên che phố.

## Cảnh sập và dừng thời gian
- Toà sập không biến mất ngay: nghiêng, lún dần xuống đất, mảnh vỡ theo màu toà và tia lửa văng ra, vòng sóng xung kích + vành bụi lan sát đất; xong mới hiện đống đổ nát (nảy nhẹ, vết cháy xém) và khói còn bốc vài giây.
- **Dừng thời gian** (`slowmo`): chung cư, đình làng, cây xăng, nổ dây chuyền hoặc toà cuối làm sập phố do người xem gây ra → engine cho mọi đồng hồ đứng yên `slowmoSeconds` giây (lốc / thiên thạch treo giữa trời, giờ giữ phố không chạy, streamer không bấm được). Overlay cắt cảnh thẳng vào góc thấp sát toà, quay vòng chậm (bullet time), hình bớt màu + viền tối, thanh đen điện ảnh trên / dưới với chữ SLOW-MO và tên người đánh sập. Cách nhau ít nhất `slowmoCooldown` giây (toà cuối thì luôn chiếu).
- Góc máy cận cảnh kiểu game: thấp nhìn ngước lên toà bị sét / UFO, máy quay đuổi sau lưng trâu, nghiêng máy nhẹ, thu tiêu cự khi cận, rung tay máy nhẹ.

## Chế độ streamer tự chơi (`mode: host`)
Mở **cửa sổ chơi** (`?play=1`). Streamer phải giữ phố trong `hostSeconds` giây, người xem tặng quà để phá:
- **Giữ chuột lên toà** để sửa (`hostRepair` % máu mỗi nhịp).
- **Bấm 🎯 thiên thạch / mây sét / UFO / mưa đá** đang rơi để bắn hạ. **Bấm lốc / trâu** để đuổi bớt `chaseSeconds` giây. Mỗi lần tốn 1 ⚡ (tối đa `hostEnergy`, hồi 1 sau mỗi `energyRegenSeconds` giây).
- Lúc vắng quà, Ông Trời thả mưa đá / thiên thạch mỗi `ambientSeconds` giây để streamer vẫn có việc.
- Hết giờ mà phố chưa sập là streamer thắng, sập trước thì người đánh sập thắng. Tỉ số Streamer – Người xem hiện ở đầu màn hình. Bình luận vẫn làm dân phố sửa nhà (người xem có thể phụ streamer).
Trong cửa sổ chơi, máy quay chỉ zoom nhẹ để streamer còn thấy cả phố mà bấm.

## Actions (quà mặc định)
| id | Tác dụng | Quà |
|---|---|---|
| `thienthach` | Thiên thạch rơi trúng một vùng | Rose |
| `set` | Sét đánh toà cao nhất | Finger Heart |
| `lu` | Lũ dâng hai bờ sông 9 giây | Perfume |
| `loc` | Lốc xoáy đi xuyên phố 10 giây | Doughnut |
| `khien` | Khiên che cả phố `shieldSeconds` giây | Cap |
| `dongdat` | Động đất rung cả phố 6 giây | Hand Hearts |
| `thoxay` | Thợ xây dựng lại mọi toà | Sunglasses |
| `khunglong` | Trâu khổng lồ húc phố 12 giây | Corgi |
| `ufo` | UFO hút 3 toà to nhất | Galaxy |
| `hopbi` | Hộp bí ẩn: thảm hoạ ngẫu nhiên | Ice Cream Cone |

## Lệnh streamer
`next` Phố mới · `wipe` Cho sập ngay · `clear-board` Xoá Bảng Phá

## Demo
`/demo?game=photihon` — người xem ảo bình luận và tặng quà liên tục (`demo/index.js`).

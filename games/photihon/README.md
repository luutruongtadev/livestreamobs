# Phố Tí Hon (`photihon`)

Game 3D tương tác TikTok Live: một thị trấn tí hon low-poly trên hòn đảo nổi. Người xem tặng quà để gọi thảm hoạ phá phố, bình luận để làm dân phố chạy ra sửa nhà. Phố sập đủ `wipePercent` % thì vinh danh người đánh sập, vài giây sau phố mới mọc lên.

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

## Lệnh streamer
`next` Phố mới · `wipe` Cho sập ngay · `clear-board` Xoá Bảng Phá

## Demo
`/demo?game=photihon` — người xem ảo bình luận và tặng quà liên tục (`demo/index.js`).

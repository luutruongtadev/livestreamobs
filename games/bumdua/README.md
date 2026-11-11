# 🍉 Bùm Dưa (`bumdua`)

Cô Ba ở sạp dưa ngoài chợ quấn dây thun quanh trái dưa hấu. Mỗi bình luận là một sợi dây có mặt người xem. Không ai biết sợi nào làm dưa nổ tung. Người có sợi cuối cùng được vào **Bảng Bùm**.

## Luật
- **Bình luận** (nội dung gì cũng được): thêm 1 sợi vào hàng chờ, cô Ba quấn lần lượt.
  - Mỗi người có tối đa `perUserQueue` sợi đang chờ (mặc định 3).
  - Thẻ "Sợi tiếp theo" hiện mặt người kế tiếp.
- **Tim:** cứ `likesPerBand` tim (mặc định 20) thì thêm 1 sợi cho người thả tim vượt mốc.
- **Follow:** ném một nắm `followBands` sợi (mặc định 5), mỗi người 1 lần trong buổi live.
- **Không ai bình luận:** cô Ba tự quấn 1 sợi mỗi `selfBandSeconds` giây (mặc định 6).
- **Ngưỡng nổ bí mật:** mỗi trái dưa có một ngưỡng nổ ngẫu nhiên trong khoảng `breakMin`–`breakMax` (dưa thường). Gần ngưỡng thì dưa thắt eo, nứt, rỉ nước, rung lên.
- **Dưa lớn dần** (`growth`): cứ 5 trái có 1 trái to (ngưỡng ×1,7), 10 trái có 1 trái khổng lồ (×2,6).
- **Không thắng thua:** dưa nổ thì ăn mừng `popSeconds` giây, rồi trái mới lên bàn. Sợi bình luận đang chờ bị bỏ, người xem bình luận lại cho trái mới. Quà dây còn dư văng theo vụ nổ.

## Quà (gán trong dashboard)
| id | Tác dụng | Mặc định |
|---|---|---|
| `nam` | Nắm dây: +3 sợi | Rose |
| `boc` | Bó dây: +10 sợi quấn dồn dập | Finger Heart |
| `cuon` | Cuộn dây to: +25 sợi | Doughnut |
| `thung` | Thùng dây: +50 sợi | Hand Hearts |
| `sung` | Súng bắn dây: +150 sợi | Money Gun |
| `turbo` | Cô Ba tăng tốc ×4 trong `turboSeconds` giây, cộng dồn tối đa 2 phút | Corgi |
| `dao` | Dao chặt có mặt người tặng, đếm ngược `knifeSeconds` giây rồi bổ đôi trái dưa (người tặng là người làm nổ). Tặng thêm khi đang đếm ngược thì dao rơi nhanh hơn 5 giây | Galaxy |
| `thot` | Thớt chắn: đang đếm ngược thì chặn ngay, không thì để dành chặn nhát dao sau (tối đa 3) | Cap |
| `keo` | Kéo cắt bớt 10 sợi | Perfume |
| `vang` | Dưa vàng có mặt người tặng, ngưỡng nổ ×1,5 + 10 | Sunglasses |

Lệnh: `pop` (cho nổ ngay), `next` (dưa mới), `clear-board`. `pause` / `resume` do nền tảng cung cấp.

## Studio
- **Bảng kéo được:** Bảng quà, Bảng Bùm (kéo, phóng to / thu nhỏ, ẩn trong Studio).
- **Sự kiện cho meme:** Dưa nổ, Dao bổ đôi, Thớt chặn dao. Có bộ meme mặc định.

---
name: meshy-3d
description: Tạo mô hình 3D (.glb) cho game bằng Meshy Text-to-3D API rồi gắn vào game three.js trong repo này. Dùng khi người dùng muốn tạo / thay mô hình 3D bằng Meshy (nhà, đồ vật, nhân vật, xe…) cho một game trong games/, hoặc nhắc tới Meshy, "tạo file 3d", "mô hình glb".
---

# Tạo mô hình 3D bằng Meshy cho game

## 1. Điều kiện
- **Key Meshy**: không bao giờ để key trong repo, file, biến môi trường hay chat. Trên môi trường cloud, gọi `request_credential` cho host `api.meshy.ai` (kiểu bearer) để người dùng dán key vào form bảo mật; proxy tự gắn key vào mọi request tới `api.meshy.ai`. Nếu người dùng lỡ dán key vào chat: không dùng giá trị đó, mở form, và nhắc họ tạo key mới / xoá key cũ.
- Kiểm tra key + số credit: `curl -s -H "Authorization: Bearer proxy-injected" https://api.meshy.ai/openapi/v1/balance`
- File mô hình nằm ở `assets.meshy.ai`: host này phải được phép trong mạng của môi trường (nếu tải bị proxy trả 403 thì đề xuất thêm host bằng `update_environment`). Tiến độ đã lưu nên chạy lại chỉ tải, không tạo lại.
- `docs.meshy.ai` có thể bị chặn: tham số hợp lệ dò bằng cách gửi giá trị sai (API trả về danh sách, không tốn credit), vd `ai_model` ∈ `meshy-4 meshy-5 meshy-6 meshy-6-lite meshy-7 meshy-7.1 latest meshy-t1 meshy-t2 meshy-t2.5`.

## 2. Chi phí — hỏi người dùng trước khi tiêu credit
| Model | Preview (lưới) | Refine (texture) | Một món |
|---|---|---|---|
| `meshy-t2.5` (mặc định, khoảng 4.000 mặt, hợp overlay) | 5 | 10 | **15** |
| `meshy-6`, `meshy-7.x` (đẹp hơn) | 20 | 10 | 30 |

Báo số credit còn lại, đề xuất danh sách món ưu tiên và tổng credit, chờ người dùng chọn.

## 3. Viết prompt
Hai phần, tiếng Anh:
- `prompt` (hình dáng, ≤ 600 ký tự): `Stylized low-poly miniature <vật>, <chi tiết nhận diện>, toy model, no base plate`. Nhân vật / con vật thêm `full body, standing on four legs`. Mặt trước hướng về camera.
- `texture_prompt` (màu, chất liệu): màu cụ thể từng phần + `clean flat hand-painted toy look`.
Đồ Việt Nam: ghi rõ tên + mô tả (vd `Vietnamese honeycomb plastic sandal (dep to ong)`, `Vietnamese Tet yellow apricot blossom tree (hoa mai)`), vì model không biết tên tiếng Việt.

## 4. Chạy
Ghi danh sách vào `games/<id>/assets/models/meshy-jobs.json`:
```json
[{ "name": "sofa", "prompt": "…", "texture_prompt": "…" }]
```
Rồi chạy (mỗi món 1–3 phút, chạy nền):
```
node .claude/skills/meshy-3d/meshy.mjs games/<id>/assets/models/meshy-jobs.json games/<id>/assets/models --concurrency 5
```
Script tạo preview → refine, tải `<name>.glb`, nén texture về JPEG 1024 px bằng `glb_textures.py` (Python + Pillow, không cần tải gói npm; khoảng 300–600 KB mỗi món), lưu ảnh xem trước `.<name>.png` (bị gitignore) và tiến độ `.meshy-state.json`. **Chạy lại không tốn credit lần hai** cho món đã có task (đọc lại state). Thêm `.gitignore` gồm `.*.png` và `.*.raw.glb` vào thư mục models.

Xem ảnh `.<name>.png` (Read) để kiểm tra mô hình trước khi gắn vào game.

## 5. Gắn vào game (three.js)
Mẫu có sẵn: `games/photihon/render/index.js` (`MODEL_FILES`, nạp nền) và `games/donnha/render/index.js`.
- Chép `GLTFLoader.js` + `BufferGeometryUtils.js` từ `games/photihon/render/vendor/` (chúng import `./three.module.min.js`).
- Nạp nền bằng `new GLTFLoader().load(new URL('../assets/models/x.glb', import.meta.url).href, …)`; tải lỗi thì **giữ mô hình dựng bằng code** để overlay không bao giờ trống.
- Chuẩn hoá: lấy `Box3` → dời tâm về gốc, đáy ở y = 0, scale theo bề rộng chân đế mong muốn (`max(size.x, size.z)`); đặt `metalness = 0`, `roughness ≈ 0.85` cho hợp ánh sáng Lambert.
- Mô hình nạp xong sau khi cảnh đã dựng → thay các vật đang hiện bằng bản mới.
- Gateway đã phục vụ `.glb` đúng kiểu `model/gltf-binary`.
- Chụp màn hình bằng Playwright để xem cỡ / hướng (Meshy thường cho mặt trước nhìn về +Z; nếu ngược thì xoay `rotation.y` trong bảng cấu hình mô hình).

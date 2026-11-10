// Tạo game mới từ template theo chuẩn module:  npm run new-game <id> ["Tên hiển thị"]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id, name = id] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{1,31}$/.test(id || '')) {
  console.error('Cách dùng: npm run new-game <id> ["Tên hiển thị"]   (id: chữ thường a-z, số, gạch ngang; 2–32 ký tự)');
  process.exit(1);
}
const dest = path.join(ROOT, 'games', id);
if (fs.existsSync(dest)) { console.error(`games/${id} đã tồn tại`); process.exit(1); }

function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    // file .tmpl: tránh để `npm test` chạy nhầm test của template (còn __ID__); bỏ đuôi khi sao chép
    const s = path.join(src, e.name), d = path.join(dst, e.name.replace(/\.tmpl$/, ''));
    if (e.isDirectory()) copy(s, d);
    else fs.writeFileSync(d, fs.readFileSync(s, 'utf8').replaceAll('__ID__', id).replaceAll('__NAME__', name));
  }
}
copy(path.join(ROOT, 'packages', 'sdk', 'template'), dest);
console.log(`Đã tạo games/${id}. Tiếp theo:
  1. Viết engine/index.js + render/index.js (+ server/index.js nếu cần API key, nhớ đặt "server": true)
  2. node --test games/${id}/test     (bộ test chuẩn phải xanh)
  3. Thử bằng Giả lập trên dashboard với status "dev", rồi chuyển "beta" → "live"`);

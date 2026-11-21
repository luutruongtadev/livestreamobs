// Phố Mới — lưu thành phố lên đám mây (giai đoạn B của city/MULTIPLAYER.md).
// Dùng chung tài khoản của nền tảng (Supabase Auth: tên đăng nhập + mật khẩu / Google; chạy thử bằng DEV token).
//   GET    /api/city/saves          → { user, slots: [{ slot, name, pop, day, size, updated_at }] }
//   GET    /api/city/saves/<slot>   → { slot, name, pop, day, updated_at, city }
//   PUT    /api/city/saves/<slot>   ← { name, pop, day, city }  (city: object của sim.serialize)
//   DELETE /api/city/saves/<slot>
// Bản lưu nén gzip trước khi cất (vài chục KB). Store cần listCitySaves / getCitySave / putCitySave / deleteCitySave.
import zlib from 'node:zlib';

export const CITY_SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];
export const MAX_BODY = 4 * 1024 * 1024; // JSON chưa nén
const MIN_GAP_MS = 10_000; // mỗi tài khoản lưu tối đa một lần / 10 giây (tự lưu 5 phút một lần)

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : 0);

export function packSave(city) { return zlib.gzipSync(Buffer.from(JSON.stringify(city))).toString('base64'); }
export function unpackSave(data) { return JSON.parse(zlib.gunzipSync(Buffer.from(String(data), 'base64')).toString('utf8')); }

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (d) => { size += d.length; if (size <= limit) parts.push(d); }); // quá giới hạn: đọc bỏ phần còn lại rồi mới trả 413
    req.on('end', () => (size > limit ? reject(Object.assign(new Error('Bản lưu quá lớn'), { status: 413 })) : resolve(Buffer.concat(parts).toString('utf8'))));
    req.on('error', reject);
  });
}

export function createCityCloud({ store, now = Date.now } = {}) {
  const lastPut = new Map(); // user id → thời điểm lưu gần nhất
  const send = (res, head, status, obj) => { res.writeHead(status, { ...head, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

  async function handle(req, res, head, pathname) {
    try {
      const auth = String(req.headers.authorization || '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim().slice(0, 4096) : '';
      const user = token ? await store.verifyUser(token).catch(() => null) : null;
      if (!user) return send(res, head, 401, { ok: false, error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
      const rest = pathname.replace(/^\/api\/city\/saves\/?/, '');
      if (!rest) {
        if (req.method !== 'GET') return send(res, head, 405, { ok: false });
        const slots = await store.listCitySaves(user.id);
        return send(res, head, 200, { ok: true, user: { id: user.id, email: user.email || null }, slots });
      }
      const slot = decodeURIComponent(rest);
      if (!CITY_SLOTS.includes(slot)) return send(res, head, 404, { ok: false, error: 'Không có ô lưu này' });
      if (req.method === 'GET') {
        const row = await store.getCitySave(user.id, slot);
        if (!row) return send(res, head, 404, { ok: false, error: 'Ô lưu trống' });
        return send(res, head, 200, { ok: true, slot, name: row.name, pop: row.pop, day: row.day, updated_at: row.updated_at, city: unpackSave(row.data) });
      }
      if (req.method === 'DELETE') { await store.deleteCitySave(user.id, slot); return send(res, head, 200, { ok: true }); }
      if (req.method !== 'PUT') return send(res, head, 405, { ok: false });
      const t = now(), last = lastPut.get(user.id) || 0;
      if (t - last < MIN_GAP_MS) return send(res, head, 429, { ok: false, error: 'Lưu quá nhanh, chờ vài giây' });
      if (+req.headers['content-length'] > MAX_BODY * 2) return send(res, head, 413, { ok: false, error: 'Bản lưu quá lớn' });
      const raw = await readBody(req, MAX_BODY);
      let body;
      try { body = JSON.parse(raw); } catch { return send(res, head, 400, { ok: false, error: 'Dữ liệu không hợp lệ' }); }
      const city = body && body.city;
      if (!city || typeof city !== 'object' || !Number.isFinite(city.n) || !city.v) return send(res, head, 400, { ok: false, error: 'Không phải bản lưu Phố Mới' });
      const data = packSave(city);
      const row = { name: clean(body.name || city.name, 40) || 'Phố Mới', pop: num(body.pop, 0, 1e7), day: num(body.day, 0, 1e6), size: data.length };
      lastPut.set(user.id, t);
      if (lastPut.size > 5000) lastPut.delete(lastPut.keys().next().value);
      const saved = await store.putCitySave(user.id, slot, row, data);
      return send(res, head, 200, { ok: true, slot, ...row, updated_at: saved && saved.updated_at });
    } catch (e) {
      return send(res, head, e.status || 500, { ok: false, error: e.status ? e.message : 'Lỗi máy chủ khi lưu' });
    }
  }
  return { handle };
}

// Phố Mới — trang trí thành phố tô theo ô: cây xanh, thảm cỏ, lối đi bộ, bồn hoa.
// Kéo chuột tô như quy hoạch, chỉ trên đất trống (không đường, nhà, công trình, bãi biển, nước). Ô đã trang trí không mọc nhà.
// Hiệu quả: giá đất quanh đó tăng, cây lọc bớt bụi và tiếng ồn, dân cả thành phố vui hơn một chút; mỗi ô có phí chăm sóc.
import { N, idx, inMap, clamp } from './base.js';

// id lưu trong c.decor (0 = không có). val: tăng giá đất, green: lọc bụi / ồn, cost: giá mỗi ô, upkeep: phí mỗi ô mỗi ngày
export const DECOR = {
  tree: { id: 1, name: 'Cây xanh', icon: '🌳', cost: 90, upkeep: 1, val: 1, green: 1, desc: 'Hàng cây bóng mát: lọc bụi, giảm ồn, tăng giá đất' },
  grass: { id: 2, name: 'Thảm cỏ', icon: '🟩', cost: 30, upkeep: 0.4, val: 0.55, green: 0.35, desc: 'Bãi cỏ xanh mướt, rẻ nhất' },
  path: { id: 3, name: 'Lối đi bộ', icon: '🚶', cost: 70, upkeep: 0.6, val: 0.7, green: 0, walk: true, desc: 'Đường lát gạch cho người đi dạo, có ghế đá, đèn: các ô kề nhau tự nối thành lối, dân ra đi dạo' },
  flower: { id: 4, name: 'Bồn hoa', icon: '🌷', cost: 80, upkeep: 1.2, val: 1.2, green: 0.4, desc: 'Bồn hoa nhiều màu viền cây bụi: đẹp nhất, tăng giá đất nhiều nhất' },
};
export const DECOR_KEYS = Object.keys(DECOR);
export const decorById = (id) => DECOR[DECOR_KEYS[id - 1]] || null;
const REACH = 3; // ô trang trí ảnh hưởng tới các ô cách nó tối đa chừng này ô

export function initDecor(c) { if (!c.decor || c.decor.length !== N * N) c.decor = new Uint8Array(N * N); }

/** Ô i có trang trí được không (đất trống). */
export function decorOk(c, i) {
  return !c.water[i] && !c.road[i] && !c.occ[i] && !c.level[i] && !(c.beach && c.beach[i]) && !c.steep[i];
}

/** Đếm số ô từng loại: { tree, grass, path, flower, total }. */
export function decorCount(c) {
  const out = { total: 0 };
  for (const k of DECOR_KEYS) out[k] = 0;
  if (!c.decor) return out;
  for (let i = 0; i < N * N; i++) { const d = c.decor[i]; if (d) { out[DECOR_KEYS[d - 1]]++; out.total++; } }
  return out;
}

/**
 * Tô (hoặc xoá) trang trí trong hình chữ nhật. kind: khoá DECOR; erase: xoá mọi loại. dry: chỉ đếm và tính giá.
 * Ô đã có loại khác thì đổi sang loại mới (trả giá loại mới). Trả về { ok, count, cost, reason }.
 */
export function decorRect(c, x0, y0, x1, y1, kind, { erase = false, dry = false } = {}) {
  initDecor(c);
  const D = DECOR[kind], cells = [];
  if (!erase && !D) return { ok: false, count: 0, cost: 0, reason: 'Không có loại trang trí này' };
  for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(N - 1, Math.max(y0, y1)); y++) for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(N - 1, Math.max(x0, x1)); x++) {
    const i = idx(x, y);
    if (erase) { if (c.decor[i]) cells.push(i); continue; }
    if (c.decor[i] === D.id || !decorOk(c, i)) continue;
    cells.push(i);
  }
  const cost = erase ? 0 : cells.length * D.cost;
  if (!cells.length) return { ok: false, count: 0, cost: 0, reason: erase ? 'Không có ô trang trí nào ở đây' : 'Chỉ trang trí được trên đất trống (không đường, nhà, công trình, nước, dốc)' };
  if (!c.sandbox && cost > c.money) return { ok: false, count: cells.length, cost, reason: 'Không đủ tiền' };
  if (dry) return { ok: true, count: cells.length, cost };
  for (const i of cells) {
    c.decor[i] = erase ? 0 : D.id;
    if (!erase) { c.zone[i] = 0; c.tree[i] = 0; } // trang trí thay chỗ quy hoạch và cây rừng
  }
  c.money -= cost;
  c.decorFx = null;
  if (c.dirty) Object.assign(c.dirty, { decor: true, trees: true, zones: true });
  return { ok: true, count: cells.length, cost };
}

/** Ô bị đường, nhà, công trình chiếm: bỏ trang trí ở đó. */
export function clearDecor(c, i) { if (c.decor && c.decor[i]) { c.decor[i] = 0; c.decorFx = null; if (c.dirty) c.dirty.decor = true; } }

/**
 * Trường ảnh hưởng của trang trí: { val, green } (Float32Array 0..1) — mỗi ô trang trí toả ra các ô quanh nó trong REACH ô.
 * Lưu tạm, tính lại khi tô / xoá.
 */
export function decorFx(c) {
  if (c.decorFx && c.decorFx.val.length === N * N) return c.decorFx;
  const val = new Float32Array(N * N), green = new Float32Array(N * N);
  if (c.decor) for (let i = 0; i < N * N; i++) {
    const d = decorById(c.decor[i]);
    if (!d) continue;
    const x = i % N, y = (i / N) | 0;
    for (let dy = -REACH; dy <= REACH; dy++) for (let dx = -REACH; dx <= REACH; dx++) {
      if (!inMap(x + dx, y + dy)) continue;
      const w = 1 - Math.hypot(dx, dy) / (REACH + 1);
      if (w <= 0) continue;
      const j = idx(x + dx, y + dy);
      val[j] += d.val * w * 0.16; green[j] += d.green * w * 0.12;
    }
  }
  for (let i = 0; i < N * N; i++) { val[i] = clamp(val[i], 0, 1); green[i] = clamp(green[i], 0, 1); }
  c.decorFx = { val, green };
  return c.decorFx;
}

/** Phí chăm sóc mỗi ngày của mọi ô trang trí. */
export function decorUpkeep(c) {
  if (!c.decor) return 0;
  let s = 0;
  for (let i = 0; i < N * N; i++) { const d = decorById(c.decor[i]); if (d) s += d.upkeep; }
  return Math.round(s);
}

/** Dân cả thành phố vui hơn theo số ô trang trí so với dân số (tối đa +2). */
export function decorHappy(c, pop) {
  const n = decorCount(c);
  const w = n.tree + n.flower * 1.2 + n.path * 0.8 + n.grass * 0.5;
  if (!w) return 0;
  return Math.min(2, (w / Math.max(60, (pop || 0) / 8)) * 1.2);
}

// bản lưu: [ô, loại, ô, loại, ...]
export function packDecor(c) {
  const out = [];
  if (c.decor) for (let i = 0; i < N * N; i++) if (c.decor[i]) out.push(i, c.decor[i]);
  return out;
}
export function unpackDecor(c, list) {
  c.decor = new Uint8Array(N * N); c.decorFx = null;
  if (Array.isArray(list)) for (let k = 0; k + 1 < list.length; k += 2) { const i = list[k], d = list[k + 1]; if (i >= 0 && i < N * N && decorById(d)) c.decor[i] = d; }
}

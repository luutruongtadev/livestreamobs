// Phố Mới — bãi biển tô theo ô: người chơi kéo chuột tô vùng bãi (như quy hoạch), chỉ nhận ô gần BIỂN (không phải sông, hồ).
// Tô xong, địa hình tự hạ thoải dần từ đất liền xuống mép nước (không còn bờ dốc bậc thang), phần nước sát bờ thành nước nông.
import { N, idx, inMap, clamp, WATER_LEVEL } from './base.js';
import { cityPay } from './ledger.js';

export const BEACH = { cost: 250, upkeep: 4, reach: 6 }; // giá mỗi ô, phí mỗi ô mỗi ngày, cách biển tối đa (ô)

/**
 * Ô nước nào là biển: vùng nước chạm mép bản đồ và đủ rộng (có ô cách bờ từ 4 ô trở lên) — sông, kênh hẹp, hồ kín không tính.
 * Kèm khoảng cách (theo ô) từ mỗi ô đất tới biển. Lưu tạm theo dấu mặt nước.
 */
export function seaInfo(c) {
  let sig = 0;
  for (let i = 0; i < N * N; i++) if (c.water[i]) sig = (sig * 31 + i + 1) | 0; // đủ mọi ô: đào kênh, lấn đất ở đâu cũng nhận ra
  if (c._sea && c._sea.sig === sig && c._sea.sea.length === N * N) return c._sea;
  const inner = new Uint8Array(N * N).fill(255), q = [];
  for (let i = 0; i < N * N; i++) {
    if (!c.water[i]) continue;
    const x = i % N, y = (i / N) | 0;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inMap(x + dx, y + dy) && !c.water[idx(x + dx, y + dy)])) { inner[i] = 1; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) { // độ xa bờ của ô nước
    const i = q[h], x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.water[j] && inner[j] > inner[i] + 1) { inner[j] = inner[i] + 1; q.push(j); } }
  }
  const comp = new Int32Array(N * N).fill(-1), sea = new Uint8Array(N * N);
  for (let s = 0; s < N * N; s++) {
    if (!c.water[s] || comp[s] >= 0) continue;
    const list = [s]; comp[s] = s;
    let edge = false, deep = 0;
    for (let h = 0; h < list.length; h++) {
      const i = list[h], x = i % N, y = (i / N) | 0;
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) edge = true;
      deep = Math.max(deep, inner[i] === 255 ? 99 : inner[i]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.water[j] && comp[j] < 0) { comp[j] = s; list.push(j); } }
    }
    if (edge && deep >= 5) for (const i of list) if (inner[i] >= 5 && inner[i] !== 255) sea[i] = 2; // lõi biển: nước rộng (sông rộng nhất chỉ ~4 ô từ bờ)
  }
  // mép biển: nước trong 4 bước từ lõi (sông đổ ra biển chỉ tính đoạn cửa sông)
  const qs = [], step = new Uint8Array(N * N).fill(255);
  for (let i = 0; i < N * N; i++) if (sea[i] === 2) { step[i] = 0; qs.push(i); }
  for (let h = 0; h < qs.length; h++) {
    const i = qs[h], x = i % N, y = (i / N) | 0;
    sea[i] = 1;
    if (step[i] >= 4) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.water[j] && step[j] > step[i] + 1) { step[j] = step[i] + 1; qs.push(j); } }
  }
  const dist = new Uint8Array(N * N).fill(255), q2 = [];
  for (let i = 0; i < N * N; i++) if (sea[i]) { dist[i] = 0; q2.push(i); }
  for (let h = 0; h < q2.length; h++) {
    const i = q2[h], x = i % N, y = (i / N) | 0;
    if (dist[i] >= BEACH.reach + 3) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const a = x + dx, b = y + dy; if (!inMap(a, b)) continue;
      const j = idx(a, b); if (c.water[j] && !sea[j]) continue; // đi qua sông thì không tính
      if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q2.push(j); }
    }
  }
  c._sea = { sig, sea, dist };
  return c._sea;
}

/** Ô i có tô bãi biển được không. */
export function beachOk(c, i) {
  const si = seaInfo(c);
  return !c.water[i] && !c.road[i] && !c.occ[i] && !c.level[i] && si.dist[i] >= 1 && si.dist[i] <= BEACH.reach && c.cellH[i] < 12;
}

export const beachCount = (c) => (c.beach ? c.beach.reduce((n, v) => n + v, 0) : 0);

/**
 * Tô (hoặc xoá) bãi biển trong hình chữ nhật. Ô tô được: đất trống gần biển. Tô xong san địa hình cho thoải.
 * dry: chỉ đếm và tính giá. Trả về { ok, count, cost, reason }.
 */
export function beachRect(c, x0, y0, x1, y1, { erase = false, dry = false } = {}) {
  const cells = [];
  let near = 0;
  for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(N - 1, Math.max(y0, y1)); y++) for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(N - 1, Math.max(x0, x1)); x++) {
    const i = idx(x, y);
    if (erase) { if (c.beach[i]) cells.push(i); continue; }
    if (c.beach[i]) continue;
    if (beachOk(c, i)) cells.push(i); else if (!c.water[i] && seaInfo(c).dist[i] <= BEACH.reach) near++;
  }
  if (!cells.length) return { ok: false, count: 0, cost: 0, reason: erase ? 'Không có ô bãi biển nào ở đây' : near ? 'Ô ở đây đang có đường, nhà hoặc công trình' : `Bãi biển chỉ tô được trên đất trống cách BIỂN tối đa ${BEACH.reach} ô (sông, hồ không được)` };
  const cost = erase ? 0 : cells.length * BEACH.cost;
  if (cost > c.money && !c.sandbox) return { ok: false, count: cells.length, cost, reason: 'Không đủ tiền' };
  if (dry) return { ok: true, count: cells.length, cost };
  for (const i of cells) { c.beach[i] = erase ? 0 : 1; if (!erase) { c.zone[i] = 0; c.tree[i] = 0; } }
  cityPay(c, 'build', cost);
  if (!erase) smoothBeach(c);
  c.dirty.beach = true; c.dirty.zones = true; c.dirty.trees = true;
  return { ok: true, count: cells.length, cost };
}

/**
 * San địa hình bãi biển: đỉnh lưới của ô bãi hạ dần theo khoảng cách tới biển (mép nước ~0,1 m, mỗi ô vào trong cao thêm ~0,35 m),
 * vành đất ngay sau bãi hạ theo dốc thoải; nước biển sát bãi nông dần (-1,2 m rồi -2,1 m) thay vì sâu đột ngột.
 * Đỉnh chạm đường, nhà, công trình thì giữ nguyên. Chỉ ghi vào c.terra (như đào đắp); terrainDone tính lại phần còn lại.
 */
export function smoothBeach(c) {
  const V = N + 1, si = seaInfo(c), target = new Float32Array(V * V).fill(NaN);
  const blocked = (gx, gy) => { for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) { const a = gx + dx, b = gy + dy; if (!inMap(a, b)) continue; const i = idx(a, b); if (c.road[i] || c.occ[i] || c.level[i]) return true; } return false; };
  const cellsOf = (gx, gy) => [[gx - 1, gy - 1], [gx, gy - 1], [gx - 1, gy], [gx, gy]].filter(([a, b]) => inMap(a, b)).map(([a, b]) => idx(a, b));
  // khoảng cách (ô) tới mép nước gần nhất, kể cả cửa sông: độ dốc của bãi tính theo đó
  const wd = new Uint8Array(N * N).fill(255), q = [];
  for (let i = 0; i < N * N; i++) if (c.water[i]) { wd[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % N, y = (i / N) | 0;
    if (wd[i] >= 12) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (wd[j] > wd[i] + 1) { wd[j] = wd[i] + 1; q.push(j); } }
  }
  let top = 0;
  for (let gy = 1; gy < N; gy++) for (let gx = 1; gx < N; gx++) {
    const cs = cellsOf(gx, gy);
    if (!cs.some((i) => c.beach[i])) continue;
    if (cs.some((i) => c.water[i])) continue; // đỉnh mép nước giữ ở mặt bờ
    const d = Math.min(...cs.map((i) => (c.beach[i] ? wd[i] : 99)));
    const t = 0.1 + (d - 1) * 0.35 + 0.15;
    target[gy * V + gx] = t; top = Math.max(top, t);
  }
  // vành sau bãi: dốc thoải lên đất liền (tối đa 5 ô), chỉ hạ chứ không đắp
  for (let ring = 1; ring <= 5; ring++) {
    const prev = target.slice(); // đọc bản chụp vòng trước: mỗi vòng chỉ lan thêm đúng 1 ô
    for (let gy = 1; gy < N; gy++) for (let gx = 1; gx < N; gx++) {
      const k = gy * V + gx;
      if (!Number.isNaN(target[k])) continue;
      let nb = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = prev[(gy + dy) * V + gx + dx]; if (!Number.isNaN(t) && (ring === 1 ? true : t > -50)) nb = Math.max(nb, t); }
      if (nb < 0) continue;
      if (cellsOf(gx, gy).some((i) => c.water[i])) continue;
      target[k] = nb + 0.8; // mỗi vòng cao thêm một chút
    }
  }
  // nước nông sát bãi
  for (let gy = 1; gy < N; gy++) for (let gx = 1; gx < N; gx++) {
    const cs = cellsOf(gx, gy);
    if (cs.length < 4 || !cs.every((i) => si.sea[i])) continue;
    let near = 99;
    for (let dy = -3; dy <= 2; dy++) for (let dx = -3; dx <= 2; dx++) { const a = gx + dx, b = gy + dy; if (inMap(a, b) && c.beach[idx(a, b)]) near = Math.min(near, Math.max(Math.abs(dx + 0.5), Math.abs(dy + 0.5)) - 0.5); }
    if (near > 2.5) continue;
    target[gy * V + gx] = near < 1.2 ? WATER_LEVEL - 0.35 : near < 2.2 ? WATER_LEVEL - 1.2 : NaN;
  }
  const touched = [];
  for (let k = 0; k < V * V; k++) {
    const t = target[k];
    if (Number.isNaN(t)) continue;
    const gx = k % V, gy = (k / V) | 0;
    if (blocked(gx, gy)) continue;
    const cur = c.hv[k], water = cellsOf(gx, gy).every((i) => c.water[i]);
    const nh = water ? Math.max(cur, t) : Math.min(cur, Math.max(t, WATER_LEVEL + 0.5)); // đất: chỉ hạ; nước: chỉ nâng cho nông
    if (Math.abs(nh - cur) < 0.05) continue;
    c.terra[k] = clamp(Math.round((nh - c.hv0[k]) * 10), -800, 800);
    touched.push(k);
  }
  c.beachTouched = touched; // sim.js áp vào lưới (vertexH, cellTerrain) rồi tính lại
  return touched.length;
}

export const packBeach = (c) => { const out = []; for (let i = 0; i < N * N; i++) if (c.beach[i]) out.push(i); return out; };
export function unpackBeach(c, list) { c.beach = new Uint8Array(N * N); if (Array.isArray(list)) for (const i of list) if (i >= 0 && i < N * N) c.beach[i] = 1; }

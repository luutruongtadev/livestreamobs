// Phố Mới — mực nước theo vùng trũng: nước chảy từ cao xuống thấp, lấp đầy chỗ trũng theo thể tích, đầy thì tràn ra ngoài.
//
// Mỗi ô có "ngưỡng ngập" e[i]: mặt nước cao hơn e thì ô thành nước (= đỉnh lưới thấp thứ ba, tức ngập từ 3 đỉnh trở lên).
// Lòng sông, hồ tự nhiên (chưa bị đắp lên) có ngưỡng bằng đáy, thân đập thuỷ điện có ngưỡng bằng ngưỡng tràn của đập.
//
// 1. Lấp trũng (priority flood) từ các cửa thoát: biển, khúc sông chảy ra khỏi bản đồ, và đất ở mép bản đồ (nước mưa chảy
//    ra ngoài). F[i] = mực nước cao nhất ô i giữ được trước khi tràn = độ cao của "yên ngựa" thấp nhất trên đường ra cửa thoát.
//    Đầu nguồn sông (nơi sông chảy vào bản đồ) không phải cửa thoát mà là nguồn nước.
// 2. Ô có F > e và F > mực biển thuộc một vùng trũng (cùng mực tràn F). Mỗi vùng trũng nhận nước: mưa trên lưu vực (các ô
//    đổ dốc về nó, theo mùa), nước tràn từ vùng trũng cao hơn, và nếu có đầu nguồn sông thì nước sông (coi như vô hạn).
//    Đủ thể tích thì đầy tới mực tràn và phần dư chảy qua yên ngựa xuống vùng thấp hơn (thành dòng suối); thiếu thì chỉ
//    đầy tới mực mà thể tích cho phép. Hồ tự nhiên không có nguồn sông giữ mực nước như cũ.
// 3. Vùng nối ra biển ở mực biển (-0,9 m) như trước.
import { N, idx, inMap, clamp, WATER_LEVEL, MAPS, makeField } from './base.js';
import { seaInfo } from './beach.js';
import { lunar } from './seasons.js';

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const L0 = WATER_LEVEL, BED = -3.2;

/** Lượng mưa đổ vào vùng trũng mỗi ô lưu vực (đơn vị m·ô) theo mùa và thời tiết. */
export function rainK(c) {
  const m = lunar(c.day || Math.floor((c.hour || 0) / 24)).month;
  const base = m >= 8 && m <= 11 ? 1 : m <= 4 ? 0.3 : 0.6;
  const w = c.inc && c.inc.weather;
  return base * (w === 'storm' ? 1.6 : w === 'rain' ? 1.2 : w === 'dry' ? 0.7 : w === 'heat' ? 0.5 : 1);
}

/** Nguồn sông (đầu nguồn ở mép bản đồ) và cửa sông chảy ra ngoài, theo mặt nước tự nhiên. Lưu tạm theo bản đồ. */
function edges(c) {
  const key = `${N}:${c.seed}:${c.map}`;
  if (c._wedges && c._wedges.key === key) return c._wedges;
  const nat = c.water0 || c.water, si = seaInfo({ water: nat }), inlet = new Uint8Array(N * N), outlet = new Uint8Array(N * N);
  const comp = new Int32Array(N * N).fill(-1), onEdge = (i) => { const x = i % N, y = (i / N) | 0; return x === 0 || y === 0 || x === N - 1 || y === N - 1; };
  for (let s = 0; s < N * N; s++) {
    if (!nat[s] || comp[s] >= 0) continue;
    const list = [s]; comp[s] = s;
    for (let h = 0; h < list.length; h++) { const i = list[h], x = i % N, y = (i / N) | 0; for (const [dx, dy] of D4) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (nat[j] && comp[j] < 0) { comp[j] = s; list.push(j); } } }
    const edge = list.filter(onEdge);
    if (!edge.length) continue;
    if (edge.some((i) => si.sea[i])) { for (const i of edge) (si.sea[i] ? outlet : inlet)[i] = 1; continue; } // biển chạm mép: cửa ra là biển
    // không ra biển: cửa ra là khúc sông ở mép có bờ thấp nhất, các khúc khác ở mép là đầu nguồn
    const bank = (i) => { const x = i % N, y = (i / N) | 0; let s2 = 0, n = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const a = x + dx, b = y + dy; if (inMap(a, b) && !nat[idx(a, b)]) { s2 += c.hv0[b * (N + 1) + a]; n++; } } return n ? s2 / n : 0; };
    let best = edge[0];
    for (const i of edge) if (bank(i) < bank(best)) best = i;
    for (const i of edge) (Math.hypot((i % N) - (best % N), ((i / N) | 0) - ((best / N) | 0)) < 6 ? outlet : inlet)[i] = 1;
  }
  c._wedges = { key, inlet, outlet };
  return c._wedges;
}

/** Ngưỡng ngập của từng ô. walls: Map ô → độ cao tường (thân đập). */
export function thresholds(c, walls, natural = false) {
  const V = N + 1, e = new Float32Array(N * N), nat = c.water0 || c.water, H = natural ? c.hv0 : c.hv;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y), k = y * V + x, ks = [k, k + 1, k + V, k + V + 1];
    const hs = ks.map((q) => H[q]).sort((p, q) => p - q);
    let t = hs[2]; // ngập từ 3 đỉnh trở lên
    if (nat[i] && (natural || !ks.some((q) => c.terra[q] > 0))) t = Math.min(t, BED); // lòng sông, hồ tự nhiên chưa bị đắp lên
    if (walls && walls.has(i)) t = walls.get(i);
    e[i] = t;
  }
  return e;
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) { let i = 0; for (;;) { let l = i * 2 + 1, r = l + 1, m = i; let mk = lk; if (l < n && k[l] < mk) { m = l; mk = k[l]; } if (r < n && k[r] < mk) m = r; if (m === i) break; k[i] = k[m]; v[i] = v[m]; i = m; } k[i] = lk; v[i] = lv; }
    return top;
  }
  get size() { return this.k.length; }
}

/**
 * Giải mực nước cả bản đồ. walls: Map ô → độ cao thân đập. rain: lượng mưa (rainK).
 * Trả về { wl (mực nước, NaN = khô), e, F, basins: [{ cells, F, level, full, inlet, spill, path }] }.
 */
/** Độ sâu trũng tự nhiên của từng ô (địa hình gốc, chưa đào đắp): đất trũng tự nhiên thấm hết nước mưa, không đọng. */
function naturalSink(c) {
  const key = `${N}:${c.seed}:${c.map}`;
  if (c._wsink && c._wsink.key === key) return c._wsink.d0;
  const r = solveWater(c, { natural: true });
  const d0 = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) d0[i] = Math.max(0, r.F[i] - r.e[i]);
  c._wsink = { key, d0 };
  return d0;
}

export function solveWater(c, { walls = null, rain = 0.6, natural = false } = {}) {
  const e = thresholds(c, walls, natural), { inlet, outlet } = edges(c), f = makeField(c.seed, MAPS[c.map] ? c.map : 'river');
  const F = new Float32Array(N * N).fill(Infinity), done = new Uint8Array(N * N), heap = new Heap();
  // quanh đầu nguồn (khúc sông chảy vào bản đồ) mép bản đồ là bờ kín: nước không chảy ngược lên thượng nguồn
  const nearInlet = new Uint8Array(N * N);
  for (let t = 0; t < N; t++) for (const [x, y] of [[t, 0], [t, N - 1], [0, t], [N - 1, t]]) {
    if (!inlet[idx(x, y)]) continue;
    for (let d = -8; d <= 8; d++) { const a = x === 0 || x === N - 1 ? x : x + d, b = y === 0 || y === N - 1 ? y : y + d; if (inMap(a, b) && !outlet[idx(a, b)]) nearInlet[idx(a, b)] = 1; }
  }
  for (let t = 0; t < N; t++) for (const [x, y] of [[t, 0], [t, N - 1], [0, t], [N - 1, t]]) {
    const i = idx(x, y);
    if (done[i] || F[i] < Infinity || inlet[i] || nearInlet[i] || (walls && walls.has(i))) continue;
    const ox = x === 0 ? -1 : x === N - 1 ? N : x, oy = y === 0 ? -1 : y === N - 1 ? N : y;
    const wetOut = outlet[i] || f(ox + 0.5, oy + 0.5) < 0.15; // ngoài mép là nước: thoát ở mực biển
    F[i] = wetOut ? Math.max(e[i], L0) : e[i];
    heap.push(F[i], i);
  }
  while (heap.size) {
    const i = heap.pop();
    if (done[i]) continue;
    done[i] = 1;
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of D4) {
      const a = x + dx, b = y + dy; if (!inMap(a, b)) continue;
      const j = idx(a, b);
      if (done[j]) continue;
      const v = Math.max(e[j], F[i]);
      if (v < F[j]) { F[j] = v; heap.push(v, j); }
    }
  }
  // dòng chảy trên mặt đã lấp: mỗi ô đổ về ô kề thấp nhất
  const rec = new Int32Array(N * N).fill(-1);
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    let best = -1, bv = F[i] - 1e-5;
    for (const [dx, dy] of D4) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (F[j] < bv || (F[j] === bv && e[j] < e[best])) { bv = F[j]; best = j; } }
    rec[i] = best;
  }
  if (natural) return { e, F };
  // vùng trũng
  const d0 = naturalSink(c), V1 = N + 1, touched = (i) => { const x = i % N, y = (i / N) | 0, k = y * V1 + x; return c.terra[k] || c.terra[k + 1] || c.terra[k + V1] || c.terra[k + V1 + 1]; };
  const basinOf = new Int32Array(N * N).fill(-1), basins = [];
  const isDep = (i) => F[i] > e[i] + 1e-4 && F[i] > L0 + 1e-3;
  for (let s = 0; s < N * N; s++) {
    if (basinOf[s] >= 0 || !isDep(s)) continue;
    const id = basins.length, cells = [s]; basinOf[s] = id;
    for (let h = 0; h < cells.length; h++) { const i = cells[h], x = i % N, y = (i / N) | 0; for (const [dx, dy] of D4) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (basinOf[j] < 0 && isDep(j) && Math.abs(F[j] - F[s]) < 1e-3) { basinOf[j] = id; cells.push(j); } } }
    let soak = 0, active = false; // đất trũng tự nhiên chưa đụng tới thấm nước; vùng có ô đào đắp, thân đập mới đọng nước mưa
    for (const i of cells) { if (touched(i) || (walls && walls.has(i))) active = true; else soak += d0[i]; }
    basins.push({ id, cells, F: F[s], level: NaN, full: false, inlet: cells.some((i) => inlet[i]), natural: cells.some((i) => (c.water0 || c.water)[i] && e[i] <= BED + 1e-3), active, soak, catch: 0, inflow: 0, spill: -1, path: [] });
  }
  // lưu vực: lần theo dòng chảy tới vùng trũng đầu tiên gặp
  const goal = new Int32Array(N * N).fill(-2);
  const target = (i) => {
    const stack = [];
    let j = i;
    while (j >= 0 && goal[j] === -2 && basinOf[j] < 0) { stack.push(j); goal[j] = -3; j = rec[j]; }
    const g = j < 0 ? -1 : basinOf[j] >= 0 ? basinOf[j] : goal[j] === -3 ? -1 : goal[j];
    for (const q of stack) goal[q] = g;
    return g;
  };
  for (let i = 0; i < N * N; i++) { const b = basinOf[i] >= 0 ? basinOf[i] : target(i); if (b >= 0) basins[b].catch++; }
  // chỗ tràn: ô ngoài vùng trũng kề vùng, thấp nhất (F nhỏ nhất)
  for (const B of basins) {
    let best = -1, bv = Infinity;
    for (const i of B.cells) { const x = i % N, y = (i / N) | 0; for (const [dx, dy] of D4) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (basinOf[j] === B.id) continue; if (F[j] < bv) { bv = F[j]; best = j; } } }
    B.spill = best;
  }
  // từ vùng cao xuống vùng thấp: đổ đầy theo thể tích, phần dư tràn xuống vùng nhận
  const order = basins.slice().sort((a, b) => b.F - a.F);
  for (const B of order) {
    const supply = B.inlet ? Infinity : B.active || B.inflow > 0 ? Math.max(0, B.catch * rain + B.inflow - B.soak) : 0;
    const es = B.cells.map((i) => e[i]).sort((p, q) => p - q);
    let full = 0; for (const v of es) full += B.F - v;
    if (B.natural && !B.inlet) { B.level = Math.min(B.F, L0); B.full = false; } // hồ tự nhiên giữ mực như cũ
    else if (supply >= full) { B.level = B.F; B.full = true; }
    else { // mực h sao cho tổng (h - e) trên các ô thấp hơn h bằng lượng nước có
      let acc = 0, h = es[0];
      for (let k = 0; k < es.length; k++) {
        const next = k + 1 < es.length ? es[k + 1] : B.F, cap = (next - es[k]) * (k + 1);
        if (acc + cap >= supply) { h = es[k] + (supply - acc) / (k + 1); break; }
        acc += cap; h = next;
      }
      B.level = Math.min(h, B.F);
    }
    const excess = B.full ? supply - full : 0;
    if (excess > 1e-6 && B.spill >= 0) { // dòng tràn: lần xuống dốc tới vùng trũng hoặc ra nước, ra mép
      let j = B.spill, guard = 0;
      while (j >= 0 && basinOf[j] < 0 && guard++ < N * 4) { B.path.push(j); if (F[j] <= L0 + 1e-3 && e[j] < L0) break; j = rec[j]; }
      if (j >= 0 && basinOf[j] >= 0 && basinOf[j] !== B.id) { const T = basins[basinOf[j]]; T.inflow += excess; if (B.inlet) T.inlet = true; }
    }
  }
  const wl = new Float32Array(N * N).fill(NaN);
  for (let i = 0; i < N * N; i++) {
    const b = basinOf[i];
    if (b >= 0) { if (basins[b].level > e[i] + 1e-4) wl[i] = basins[b].level; }
    else if (e[i] < L0 && F[i] <= L0 + 1e-3) wl[i] = L0;
  }
  return { wl, e, F, basins, basinOf };
}

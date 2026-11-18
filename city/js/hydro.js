// Phố Mới — dòng chảy, đập thuỷ điện, thác nước.
// Dòng chảy: mỗi ô nước có hướng và tốc độ chảy. Nước chảy về chỗ thấp: ra biển, hoặc (sông không ra biển) về mép bản đồ
// phía đất thấp hơn. Lòng sông hẹp, bờ dốc thì chảy xiết; sông rộng, hồ, biển thì chảy chậm, gần như đứng yên. Mùa mưa bão
// nước lớn chảy nhanh hơn, mùa khô chậm lại.
// Đập thuỷ điện: đặt sát bờ sông có dòng chảy, thân đập tự chắn ngang sông tới bờ bên kia. Điện = lưu lượng (bề rộng × tốc độ
// chảy qua đập) × cột nước (đập cao theo bờ). Trên đập thành hồ chứa nước lặng, dưới đập nước xả trắng xoá; tàu thuyền không qua.
// Thác nước: điểm du lịch đặt trên sườn dốc, nước đổ từ đỉnh xuống hồ dưới chân.
import { N, T, HALF, idx, inMap, clamp, SERVICES } from './base.js';
import { seaInfo } from './beach.js';
import { lunar } from './seasons.js';

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DAM_MAX = 16; // thân đập dài tối đa (ô)

/** Ô nước bị thân đập chắn (tàu thuyền không qua). */
export function damCells(c) {
  const out = new Uint8Array(N * N);
  for (const s of c.services) if (s.type === 'hydro' && s.dam) for (const i of s.dam.cells) out[i] = 1;
  return out;
}

/** Hệ số mùa: mùa mưa bão (tháng 8–11 âm) nước lớn, mùa khô (tháng 1–4) nước cạn. */
export function seasonFlow(c) {
  const m = lunar(c.day || Math.floor((c.hour || 0) / 24)).month;
  return m >= 8 && m <= 11 ? 1.3 : m <= 4 ? 0.75 : 1;
}

/**
 * Trường dòng chảy: { dir: Float32Array(N·N·2) hướng đơn vị, speed: Float32Array(N·N) 0..1, down: Int32Array khoảng cách tới cửa ra }.
 * Lưu tạm theo dấu mặt nước + vị trí các đập.
 */
export function computeFlow(c) {
  let sig = 0;
  for (let i = 0; i < N * N; i += 5) sig = (sig * 31 + c.water[i] * (i + 1)) | 0;
  for (const s of c.services) if (s.type === 'hydro') sig = (sig * 17 + s.x * 131 + s.y + 7 + (s.dam ? s.dam.cells.length * 977 : 0)) | 0;
  if (c._flow && c._flow.sig === sig && c._flow.speed.length === N * N) return c._flow;
  const si = seaInfo(c), dam = damCells(c);
  // độ rộng: khoảng cách từ ô nước tới bờ gần nhất
  const inner = new Uint8Array(N * N).fill(255), q = [];
  for (let i = 0; i < N * N; i++) {
    if (!c.water[i]) continue;
    const x = i % N, y = (i / N) | 0;
    if (D4.some(([dx, dy]) => inMap(x + dx, y + dy) && !c.water[idx(x + dx, y + dy)])) { inner[i] = 1; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % N, y = (i / N) | 0; for (const [dx, dy] of D4) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.water[j] && inner[j] > inner[i] + 1) { inner[j] = inner[i] + 1; q.push(j); } } }
  // cao độ bờ: trung bình đất quanh ô nước (dọc sông, đất cao phía thượng nguồn)
  const bank = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (!c.water[i]) continue;
    const x = i % N, y = (i / N) | 0;
    let s = 0, n = 0;
    for (let r = 1; r <= 4 && !n; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const a = x + dx, b = y + dy; if (inMap(a, b) && !c.water[idx(a, b)]) { s += c.cellH[idx(a, b)]; n++; } }
    bank[i] = n ? s / n : 0;
  }
  // cửa ra: biển; vùng nước không ra biển thì ô sát mép bản đồ có bờ thấp nhất của vùng đó
  const down = new Int32Array(N * N).fill(-1), comp = new Int32Array(N * N).fill(-1), outs = [];
  for (let s = 0; s < N * N; s++) {
    if (!c.water[s] || comp[s] >= 0) continue;
    const list = [s]; comp[s] = s;
    for (let h = 0; h < list.length; h++) { const i = list[h], x = i % N, y = (i / N) | 0; for (const [dx, dy] of D4) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.water[j] && comp[j] < 0) { comp[j] = s; list.push(j); } } }
    const sea = list.filter((i) => si.sea[i]);
    if (sea.length) { outs.push(...sea); continue; }
    let best = -1;
    for (const i of list) { const x = i % N, y = (i / N) | 0; if ((x === 0 || y === 0 || x === N - 1 || y === N - 1) && (best < 0 || bank[i] < bank[best])) best = i; }
    if (best >= 0) for (const i of list) { const x = i % N, y = (i / N) | 0; if ((x === 0 || y === 0 || x === N - 1 || y === N - 1) && Math.hypot(x - (best % N), y - ((best / N) | 0)) < 6) outs.push(i); }
  }
  for (const i of outs) down[i] = 0;
  const q2 = [...outs];
  for (let h = 0; h < q2.length; h++) { const i = q2[h], x = i % N, y = (i / N) | 0; for (const [dx, dy] of D4) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.water[j] && down[j] < 0) { down[j] = down[i] + 1; q2.push(j); } } }
  // hướng: về phía ô gần cửa ra hơn; tốc độ: hẹp + bờ dốc thì nhanh
  const dir = new Float32Array(N * N * 2), speed = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (!c.water[i] || down[i] < 0) continue;
    const x = i % N, y = (i / N) | 0;
    let fx = 0, fz = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const a = x + dx, b = y + dy; if (!inMap(a, b) || (!dx && !dy)) continue; const j = idx(a, b); if (!c.water[j] || down[j] < 0) continue; const w = (down[i] - down[j]) / Math.hypot(dx, dy); fx += dx * w; fz += dy * w; }
    const l = Math.hypot(fx, fz);
    if (l < 1e-6) continue;
    dir[i * 2] = fx / l; dir[i * 2 + 1] = fz / l;
    if (si.sea[i] && inner[i] >= 5 && inner[i] !== 255) { speed[i] = 0.04; continue; } // biển khơi
    const w = inner[i] === 255 ? 9 : inner[i];
    // độ dốc dòng sông: cao độ bờ thượng nguồn trừ hạ nguồn trong khoảng ~6 ô
    let up = bank[i], dn = bank[i];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (!c.water[j] || down[j] < 0) continue; if (down[j] > down[i] + 2) up = Math.max(up, bank[j]); if (down[j] < down[i] - 2) dn = Math.min(dn, bank[j]); }
    const slope = Math.max(0, up - dn) / 6;
    speed[i] = clamp(0.12 + 0.7 / (w + 0.6) + slope * 0.5, 0.03, 1) * (si.sea[i] ? 0.4 : w >= 6 ? 0.35 : 1);
  }
  // đập: hồ chứa phía trên lặng, ngay dưới đập xả xiết
  for (const s of c.services) {
    if (s.type !== 'hydro' || !s.dam) continue;
    const d0 = Math.min(...s.dam.cells.map((i) => (down[i] >= 0 ? down[i] : 1e9)));
    for (let i = 0; i < N * N; i++) {
      if (!c.water[i] || down[i] < 0 || comp[i] !== comp[s.dam.cells[0]]) continue;
      const dd = down[i] - d0;
      if (dd > 0 && dd < 22) speed[i] *= 0.15 + (dd / 22) * 0.6;
      else if (dd <= 0 && dd > -5) speed[i] = Math.min(1, speed[i] + 0.55 * (1 + dd / 5));
    }
    for (const i of s.dam.cells) speed[i] = 0;
  }
  c._flow = { sig, dir, speed, down, inner };
  return c._flow;
}

/** Tốc độ chảy ở ô i (0..1) đã nhân hệ số mùa. */
export const flowAt = (c, i) => clamp(computeFlow(c).speed[i] * seasonFlow(c), 0, 1.3);

/** Tên mức chảy cho bảng thông tin. */
export function flowName(v) { return v < 0.06 ? 'lặng' : v < 0.2 ? 'chậm' : v < 0.45 ? 'vừa' : v < 0.75 ? 'nhanh' : 'xiết'; }

// ───────────────────────── đập thuỷ điện ─────────────────────────

export const FACE = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // hướng 0..3 (đông, nam, tây, bắc) như rdir

/**
 * Thân đập từ lô nhà máy (x, y, size, dir hướng ra nước): đi thẳng qua nước tới bờ bên kia.
 * Trả về { ok, cells (ô nước bị chắn), len, head, discharge, power } hoặc { ok: false, reason }.
 */
export function planDam(c, x, y, size, dir) {
  const [dx, dy] = FACE[(dir + 2) & 3], flow = computeFlow(c), lanes = []; // dir là hướng mặt tiền (như waterDir): nước ở phía ngược lại
  for (let k = 0; k < size; k++) { // mỗi cột (hàng) dọc mặt nhà máy là một làn của thân đập
    let sx, sy;
    if (dx) { sx = dx > 0 ? x + size : x - 1; sy = y + k; } else { sx = x + k; sy = dy > 0 ? y + size : y - 1; }
    lanes.push([sx, sy]);
  }
  let best = null;
  for (const [sx0, sy0] of lanes) {
    const cells = [];
    let a = sx0, b = sy0, far = null;
    for (let s = 0; s < DAM_MAX + 1; s++) {
      if (!inMap(a, b)) break;
      const i = idx(a, b);
      if (!c.water[i]) { far = i; break; }
      cells.push(i); a += dx; b += dy;
    }
    if (!cells.length) continue;
    if (far === null) { if (!best) best = { ok: false, reason: cells.length > DAM_MAX ? `Sông quá rộng: thân đập dài tối đa ${DAM_MAX} ô` : 'Bên kia không có bờ để tựa thân đập' }; continue; }
    const moving = cells.filter((i) => flow.speed[i] > 0.08).length;
    if (moving < cells.length * 0.5) { if (!best) best = { ok: false, reason: 'Đập thuỷ điện phải chắn sông có dòng chảy (biển, hồ nước lặng không làm được)' }; continue; }
    if (cells.some((i) => c.occ[i] || c.road[i])) { if (!best || !best.ok) best = { ok: false, reason: 'Thân đập vướng cầu, đường hoặc công trình trên sông' }; continue; }
    const discharge = cells.reduce((s, i) => s + flow.speed[i], 0);
    // đập tựa vào sườn hai bên: bờ càng cao (thung lũng hẹp, núi hai bên) thì đập càng cao, cột nước càng lớn
    const sideMax = (x0, y0, sgn) => { let m = 0; for (let k = 0; k < 4; k++) for (let l = -1; l <= 1; l++) { const a2 = x0 + dx * k * sgn + (dx ? 0 : l), b2 = y0 + dy * k * sgn + (dy ? 0 : l); if (inMap(a2, b2) && !c.water[idx(a2, b2)]) m = Math.max(m, c.cellH[idx(a2, b2)]); } return m; };
    const near = sideMax(sx0 - dx, sy0 - dy, -1), farH = sideMax(far % N, (far / N) | 0, 1);
    const head = Math.round(clamp(Math.min(near, farH) * 0.8 + 8, 8, 36)); // cột nước tối thiểu 8 m
    const cand = { ok: true, cells, len: cells.length, head, discharge };
    if (!best || !best.ok || cand.discharge * cand.head > best.discharge * best.head) best = cand;
  }
  return best || { ok: false, reason: 'Nhà máy thuỷ điện phải đặt sát bờ sông, mặt quay ra sông' };
}

/** Công suất điện của đập (đã tính mùa nước). */
export function damPower(c, s) {
  if (!s.dam) return 0;
  const base = (s.dam.q || 0) * s.dam.head * 20; // lưu lượng đo lúc xây (sau khi chắn, nước qua thân đập bằng 0)
  return Math.round(clamp(base * seasonFlow(c), 60, 1600));
}

/** Cập nhật thông số đập khi đặt / nạp (lưu cells, head, q lúc xây; tốc độ chảy qua thân đập sau khi đập chắn bằng 0 nên giữ q). */
export function attachDam(c, s) {
  s.damAt = `${s.x},${s.y},${s.dir}`;
  s.dam = null;
  const p = planDam(c, s.x, s.y, SERVICES.hydro.size, s.dir);
  if (!p.ok) return p;
  s.dam = { cells: p.cells, head: p.head, q: p.discharge };
  return p;
}

// ───────────────────────── thác nước ─────────────────────────

/** Chênh cao giữa đỉnh và chân của lô (x, y, size): thác cần sườn dốc. */
export function cliffDrop(c, x, y, size) {
  const V = N + 1;
  let lo = Infinity, hi = -Infinity;
  for (let gy = y; gy <= y + size; gy++) for (let gx = x; gx <= x + size; gx++) { if (gx < 0 || gy < 0 || gx > N || gy > N) continue; const h = c.hv[gy * V + gx]; lo = Math.min(lo, h); hi = Math.max(hi, h); }
  return hi - lo;
}

/** Hình học thác cho render: điểm đỉnh (cao), điểm chân (thấp) trong lô. */
export function fallGeom(c, s) {
  const V = N + 1, sz = SERVICES[s.type].size;
  let top = null, bot = null;
  for (let gy = s.y; gy <= s.y + sz; gy++) for (let gx = s.x; gx <= s.x + sz; gx++) {
    if (gx < 0 || gy < 0 || gx > N || gy > N) continue;
    const h = c.hv[gy * V + gx], p = { x: gx * T - HALF, z: gy * T - HALF, h };
    if (!top || h > top.h) top = p; if (!bot || h < bot.h) bot = p;
  }
  return { top, bot };
}

// ───────────────────────── hồ chứa sau đập ─────────────────────────

export const WATER_Y = -0.9; // mặt nước sông, biển (như render.js)

/** Mực nước hồ chứa của đập (cao hơn mặt sông phía dưới): theo cột nước, tối đa ~5,5 m. */
export const reservoirLevel = (s) => WATER_Y + clamp((s.dam ? s.dam.head : 8) * 0.32, 2.5, 5.5);

/**
 * Lòng hồ phía thượng nguồn đập: các ô (nước hoặc đất trũng) liền nhau từ mặt thượng lưu của thân đập, có đỉnh lưới thấp hơn
 * mực hồ, không lan sang phía hạ lưu. Trả về { level, cells (mọi ô có mặt hồ phủ), land (ô đất ngập hẳn) }.
 */
export function reservoirOf(c, s) {
  if (!s.dam || !s.dam.cells.length) return null;
  const flow = computeFlow(c), level = reservoirLevel(s), V = N + 1, down = flow.down;
  const d0 = Math.min(...s.dam.cells.map((i) => (down[i] >= 0 ? down[i] : 1e9)));
  if (d0 >= 1e9) return null;
  const dam = new Set(s.dam.cells), lowV = (i) => { const x = i % N, y = (i / N) | 0, k = y * V + x; return Math.min(c.hv[k], c.hv[k + 1], c.hv[k + V], c.hv[k + V + 1]); };
  const highV = (i) => { const x = i % N, y = (i / N) | 0, k = y * V + x; return Math.max(c.hv[k], c.hv[k + 1], c.hv[k + V], c.hv[k + V + 1]); };
  const downstream = (i) => { // gần nước phía hạ lưu (hoặc ngang thân đập) thì không ngập
    const x = i % N, y = (i / N) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.water[j] && !dam.has(j) && down[j] >= 0 && down[j] <= d0) return true; }
    return false;
  };
  // phía hạ lưu của thân đập (theo hướng dòng chảy qua đập): không bao giờ ngập
  let mx = 0, mz = 0, fx = 0, fz = 0;
  for (const i of s.dam.cells) { mx += i % N; mz += (i / N) | 0; fx += flow.dir[i * 2]; fz += flow.dir[i * 2 + 1]; }
  mx /= s.dam.cells.length; mz /= s.dam.cells.length;
  const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  const below = (i) => ((i % N) - mx) * fx + (((i / N) | 0) - mz) * fz > -0.6;
  const seen = new Uint8Array(N * N), q = [], cells = [], land = [];
  for (const i of s.dam.cells) { const x = i % N, y = (i / N) | 0; for (const [dx, dy] of D4) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.water[j] && !dam.has(j) && down[j] > d0 && !below(j) && !seen[j]) { seen[j] = 1; q.push([j, 0]); } } }
  for (let h = 0; h < q.length; h++) {
    const [i, dist] = q[h];
    cells.push(i);
    if (!c.water[i] && highV(i) < level - 0.3) land.push(i);
    if (dist >= 60) continue;
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of D4) {
      const a = x + dx, b = y + dy; if (!inMap(a, b)) continue;
      const j = idx(a, b);
      if (seen[j] || dam.has(j)) continue;
      if (below(j) || c.occ[j] || c.road[j]) continue; // không lan xuống hạ lưu, không ngập công trình, đường
      if (c.water[j] ? !(down[j] > d0 || down[j] < 0) : lowV(j) >= level - 0.05 || downstream(j)) continue;
      seen[j] = 1; q.push([j, dist + 1]);
    }
  }
  return { level, cells, land };
}

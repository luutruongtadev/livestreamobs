// Phố Mới — thác nước tô theo ô (như bãi biển): người chơi kéo chuột tô một dải ô trên sườn dốc. Nước chảy từ ô cao nhất
// xuống ô thấp hơn kề bên trong vùng tô: đoạn thoải thành suối, chỗ hụt độ cao thành thác đổ, ô thấp nhất thành hồ dưới chân.
// Vùng tô phải đủ dốc (chênh cao từ FALLS.minDrop m). Càng cao, càng nhiều bậc thác càng hút du khách.
import { N, idx, inMap, clamp } from './base.js';
import { cityPay } from './ledger.js';

export const FALLS = { cost: 220, upkeep: 2, minDrop: 3, unlock: 400 };
const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export function initFalls(c) { if (!c.falls || c.falls.length !== N * N) c.falls = new Uint8Array(N * N); }

/** Ô i tô thác được không: đất trống (không đường, nhà, công trình, bãi biển, trang trí, đường ray). */
export function fallsOk(c, i) {
  return !c.water[i] && !c.road[i] && !c.occ[i] && !c.level[i] && !(c.beach && c.beach[i]) && !(c.decor && c.decor[i]) && !(c.railCell && c.railCell[i]) && !(c.tunnelCell && c.tunnelCell[i]);
}

/** Cao độ mặt ô (trung bình 4 đỉnh) — nước chảy theo đó. */
export function cellMid(c, i) {
  const V = N + 1, x = i % N, y = (i / N) | 0, k = y * V + x;
  return (c.hv[k] + c.hv[k + 1] + c.hv[k + V] + c.hv[k + V + 1]) / 4;
}

/**
 * Các thác: mỗi vùng ô tô liền nhau là một thác. Mỗi ô chảy xuống ô kề (8 hướng) thấp nhất trong vùng; ô không có ô thấp hơn
 * là hồ dưới chân. { list: [{ cells, top, pool: [ô], drop, steps }], to: Int32Array ô nhận nước (-1 = hồ) }.
 */
export function fallsInfo(c) {
  initFalls(c);
  let sig = 0;
  for (let i = 0; i < N * N; i++) if (c.falls[i]) sig = (sig * 31 + i + 1) | 0;
  sig = (sig * 7 + (c.waterVer || 0)) | 0;
  if (c._falls && c._falls.sig === sig && c._falls.tv === (c.terraVer || 0)) return c._falls;
  const to = new Int32Array(N * N).fill(-1), comp = new Int32Array(N * N).fill(-1), list = [];
  for (let i = 0; i < N * N; i++) {
    if (!c.falls[i]) continue;
    const x = i % N, y = (i / N) | 0, h = cellMid(c, i);
    let best = -1, bh = h - 0.05;
    for (const [dx, dy] of D8.slice(0, 4)) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (!c.falls[j]) continue; const hj = cellMid(c, j); if (hj < bh) { bh = hj; best = j; } } // 4 hướng: các dòng song song nhập thành một dòng rộng, không bắt chéo
    to[i] = best;
  }
  for (let s = 0; s < N * N; s++) {
    if (!c.falls[s] || comp[s] >= 0) continue;
    const cells = [s]; comp[s] = list.length;
    for (let h = 0; h < cells.length; h++) { const i = cells[h], x = i % N, y = (i / N) | 0; for (const [dx, dy] of D8) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.falls[j] && comp[j] < 0) { comp[j] = list.length; cells.push(j); } } }
    let hi = -Infinity, lo = Infinity, top = s, steps = 0;
    for (const i of cells) { const h = cellMid(c, i); if (h > hi) { hi = h; top = i; } lo = Math.min(lo, h); if (to[i] >= 0 && h - cellMid(c, to[i]) > 1.5) steps++; }
    list.push({ cells, top, pool: cells.filter((i) => to[i] < 0), drop: hi - lo, steps });
  }
  c._falls = { sig, tv: c.terraVer || 0, to, comp, list };
  return c._falls;
}

/** Sức hút du lịch của các thác: theo độ cao và số bậc thác (tối đa 16). */
export function fallsAttract(c) {
  if (!c.falls) return 0;
  let a = 0;
  for (const f of fallsInfo(c).list) if (f.drop >= FALLS.minDrop) a += Math.min(8, 1.5 + f.drop * 0.25 + f.steps * 0.6 + f.cells.length * 0.05);
  return Math.min(16, a);
}

export const fallsCount = (c) => (c.falls ? c.falls.reduce((n, v) => n + v, 0) : 0);

/**
 * Tô (hoặc xoá) thác trong hình chữ nhật. Vùng tô (cùng các ô thác đã có liền kề) phải chênh cao từ FALLS.minDrop m.
 * dry: chỉ đếm và tính giá. Trả về { ok, count, cost, drop, reason }.
 */
export function fallsRect(c, x0, y0, x1, y1, { erase = false, dry = false } = {}) {
  initFalls(c);
  const cells = [];
  for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(N - 1, Math.max(y0, y1)); y++) for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(N - 1, Math.max(x0, x1)); x++) {
    const i = idx(x, y);
    if (erase ? c.falls[i] : !c.falls[i] && fallsOk(c, i)) cells.push(i);
  }
  if (!cells.length) return { ok: false, count: 0, cost: 0, reason: erase ? 'Không có ô thác nào ở đây' : 'Chỉ tô thác trên đất trống (không đường, nhà, công trình, nước)' };
  let drop = 0;
  if (!erase) { // độ dốc của cả vùng thác sau khi tô (gộp ô thác có sẵn liền kề)
    const set = new Set(cells), q = [...cells];
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % N, y = (i / N) | 0; for (const [dx, dy] of D8) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.falls[j] && !set.has(j)) { set.add(j); q.push(j); } } }
    let hi = -Infinity, lo = Infinity; for (const i of set) { const h = cellMid(c, i); hi = Math.max(hi, h); lo = Math.min(lo, h); }
    drop = hi - lo;
    if (drop < FALLS.minDrop) return { ok: false, count: cells.length, cost: 0, drop, reason: `Thác cần sườn dốc: vùng tô chênh cao ít nhất ${FALLS.minDrop} m (đang ${drop.toFixed(1)} m) — kéo dài vùng tô xuống chân dốc` };
  }
  const cost = erase ? 0 : cells.length * FALLS.cost;
  if (cost > c.money && !c.sandbox) return { ok: false, count: cells.length, cost, drop, reason: 'Không đủ tiền' };
  if (dry) return { ok: true, count: cells.length, cost, drop };
  for (const i of cells) { c.falls[i] = erase ? 0 : 1; if (!erase) { c.zone[i] = 0; c.tree[i] = 0; } }
  cityPay(c, 'build', cost);
  c._falls = null; c.decorFx = null;
  if (c.dirty) Object.assign(c.dirty, { falls: true, zones: true, trees: true });
  return { ok: true, count: cells.length, cost, drop };
}

/** Bỏ thác ở ô bị đường, công trình chiếm. */
export function clearFalls(c, i) { if (c.falls && c.falls[i]) { c.falls[i] = 0; c._falls = null; c.decorFx = null; if (c.dirty) c.dirty.falls = true; } }

export const packFalls = (c) => { const out = []; if (c.falls) for (let i = 0; i < N * N; i++) if (c.falls[i]) out.push(i); return out; };
export function unpackFalls(c, list) { c.falls = new Uint8Array(N * N); c._falls = null; if (Array.isArray(list)) for (const i of list) if (Number.isInteger(i) && i >= 0 && i < N * N) c.falls[i] = 1; }

/** Ô thác có tính vào giá đất như trang trí (val), toả ra quanh nó. */
export const fallsVal = (c, i) => (c.falls && c.falls[i] ? 1.5 : 0);
export { clamp };

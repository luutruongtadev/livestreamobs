// Phố Mới — ngư trường trên biển: quy hoạch Ngư nghiệp tô lên mặt nước có cá thì thành ngư trường (vùng đánh bắt), tàu cá
// ra đó thả lưới, ban đêm thắp đèn câu mực. Bến cá trên bờ (khu Ngư nghiệp trên đất) là nơi ngư dân làm việc, cá cập bến:
// càng nhiều ngư trường quanh bến (trong FISHERY.reach ô) thì bến càng ra nhiều cá; nước bẩn thì cá ít đi.
import { N, idx, inMap, clamp } from './base.js';

export const FISHERY = { reach: 16, perCell: 0.05, max: 1.6 };

export function initFishery(c) { if (!c.fishery || c.fishery.length !== N * N) c.fishery = new Uint8Array(N * N); }

/** Ô nước i làm ngư trường được không: nước có cá, không phải thân đập. */
export const fisheryOk = (c, i) => !!c.water[i] && c.res[i] === 5 && !(c.damCell && c.damCell[i]);

export const fisheryCount = (c) => (c.fishery ? c.fishery.reduce((n, v) => n + v, 0) : 0);

/** Bỏ ô ngư trường không còn là nước có cá (lấn biển, đào đắp). */
export function cleanFishery(c) {
  if (!c.fishery) return;
  for (let i = 0; i < N * N; i++) if (c.fishery[i] && !fisheryOk(c, i)) { c.fishery[i] = 0; c._fishMul = null; }
}

/**
 * Hệ số sản lượng của bến cá ở ô i: 1 + mỗi ô ngư trường trong tầm FISHERY.reach ô cộng FISHERY.perCell (tối đa FISHERY.max),
 * trừ theo độ bẩn của nước ở ngư trường. Lưu tạm theo dấu ngư trường.
 */
export function fisheryMul(c, i) {
  if (!c.fishery) return 1;
  let sig = 0;
  for (let k = 0; k < N * N; k++) if (c.fishery[k]) sig = (sig * 31 + k + 1) | 0;
  if (!c._fishMul || c._fishMul.sig !== sig || c._fishMul.day !== c.day) {
    const cells = [];
    for (let k = 0; k < N * N; k++) if (c.fishery[k]) cells.push(k);
    c._fishMul = { sig, day: c.day, cells, memo: new Map() };
  }
  const F = c._fishMul;
  if (!F.cells.length) return 1;
  if (F.memo.has(i)) return F.memo.get(i);
  const x = i % N, y = (i / N) | 0, R = FISHERY.reach;
  let n = 0, pol = 0;
  for (const k of F.cells) { const dx = (k % N) - x, dy = ((k / N) | 0) - y; if (dx * dx + dy * dy <= R * R) { n++; pol += c.waterPol ? c.waterPol[k] : 0; } }
  const v = n ? 1 + Math.min(FISHERY.max, n * FISHERY.perCell) * clamp(1 - (pol / n) * 1.2, 0.1, 1) : 1;
  F.memo.set(i, v);
  return v;
}

/** Các vùng ngư trường liền nhau: [{ cells, docks: [ô nước sát bến cá gần nhất] }] (cho tàu cá). */
export function fisheryAreas(c) {
  const out = [];
  if (!c.fishery) return out;
  const seen = new Uint8Array(N * N);
  for (let s = 0; s < N * N; s++) {
    if (!c.fishery[s] || seen[s]) continue;
    const cells = [s]; seen[s] = 1;
    for (let h = 0; h < cells.length; h++) { const i = cells[h], x = i % N, y = (i / N) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b); if (c.fishery[j] && !seen[j]) { seen[j] = 1; cells.push(j); } } }
    // bến cá (khu Ngư nghiệp đã có nhà) trong tầm: ô nước sát bến để tàu cập
    let harbors = 0;
    const docks = [];
    for (let i = 0; i < N * N && docks.length < 4; i++) {
      if (c.zone[i] !== 12 || !c.level[i]) continue;
      const x = i % N, y = (i / N) | 0;
      if (!cells.some((k) => Math.abs((k % N) - x) + Math.abs(((k / N) | 0) - y) <= FISHERY.reach)) continue;
      harbors++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (inMap(a, b) && c.water[idx(a, b)]) { docks.push(idx(a, b)); break; } }
    }
    out.push({ cells, docks, harbors });
  }
  return out;
}

export const packFishery = (c) => { const out = []; if (c.fishery) for (let i = 0; i < N * N; i++) if (c.fishery[i]) out.push(i); return out; };
export function unpackFishery(c, list) { c.fishery = new Uint8Array(N * N); if (Array.isArray(list)) for (const i of list) if (Number.isInteger(i) && i >= 0 && i < N * N) c.fishery[i] = 1; }

// Phố Mới — trữ lượng tài nguyên: mỗi ô khai thác có một kho (cap); khai thác lấy dần, khoáng sản và dầu không hồi lại,
// rừng, cá, đất màu tự hồi một phần mỗi ngày. Lượng đã khai thác (c.used) được lưu; bản đồ tài nguyên vẫn sinh lại từ seed,
// ô khoáng sản / dầu đã cạn thì xoá khỏi bản đồ (applyDepletion) nên không quy hoạch khai thác lại được.
import { N, RAW, RAW_KINDS } from './base.js';

/** cap: trữ lượng mỗi ô (đơn vị nguyên liệu); regen: phần cap hồi lại mỗi ngày (0 = không tái tạo). */
export const RESERVE = {
  agri: { cap: 2000, regen: 0.1 },
  wood: { cap: 3000, regen: 0.03 },
  ore: { cap: 6000, regen: 0 },
  oil: { cap: 8000, regen: 0 },
  fish: { cap: 2500, regen: 0.05 },
};
const KIND_BY_ID = [];
for (const k of RAW_KINDS) KIND_BY_ID[RAW[k].id] = k;

export function initReserve(c) {
  if (!c.used || c.used.length !== N * N) { c.used = new Float32Array(N * N); c.usedKind = new Uint8Array(N * N); }
}

/** Lấy tối đa amt đơn vị nguyên liệu loại rk ở ô i; trả về lượng lấy được (0 khi đã cạn). */
export function extract(c, i, rk, amt) {
  initReserve(c);
  const R = RESERVE[rk];
  if (!R || !(amt > 0)) return 0;
  const left = R.cap - c.used[i], got = Math.max(0, Math.min(amt, left));
  c.used[i] += got; c.usedKind[i] = RAW[rk].id;
  if (got > 0 && got >= left && !R.regen) { // mỏ vừa cạn hẳn
    if (c.events) c.events.push({ type: 'depleted', kind: rk, x: i % N, y: (i / N) | 0, text: `${RAW[rk].icon} ${RAW[rk].name} ở ô (${i % N}, ${(i / N) | 0}) đã khai thác hết: chuyển sang chế biến, dịch vụ hoặc tìm mỏ mới` });
    if (c.res && c.res[i] === RAW[rk].id) { c.res[i] = 0; if (c.dirty) c.dirty.zones = true; }
  }
  return got;
}

/** Phần trữ lượng còn lại của ô i (0..1) theo loại rk. */
export function reserveLeft(c, i, rk) {
  const R = RESERVE[rk];
  if (!R) return 1;
  return c.used ? Math.max(0, 1 - c.used[i] / R.cap) : 1;
}

/** Mỗi ngày: rừng, cá, đất màu hồi lại một phần. */
export function reserveDay(c) {
  if (!c.used) return;
  for (let i = 0; i < N * N; i++) {
    if (!(c.used[i] > 0)) continue;
    const R = RESERVE[KIND_BY_ID[c.usedKind[i]]];
    if (R && R.regen) c.used[i] = Math.max(0, c.used[i] - R.cap * R.regen);
  }
}

/** Sau khi sinh lại bản đồ tài nguyên từ seed: xoá các ô khoáng sản / dầu đã cạn. */
export function applyDepletion(c) {
  if (!c.used || !c.res) return;
  for (let i = 0; i < N * N; i++) {
    const k = KIND_BY_ID[c.usedKind[i]], R = RESERVE[k];
    if (R && !R.regen && c.used[i] >= R.cap && c.res[i] === RAW[k].id) c.res[i] = 0;
  }
}

/** Lưu gọn: [ô, loại, lượng đã khai thác, ...] chỉ gồm ô đã khai thác. */
export function packReserve(c) {
  const out = [];
  if (c.used) for (let i = 0; i < N * N; i++) if (c.used[i] >= 1) out.push(i, c.usedKind[i], Math.round(c.used[i]));
  return out;
}
export function unpackReserve(c, arr) {
  initReserve(c);
  if (!Array.isArray(arr)) return;
  for (let p = 0; p + 2 < arr.length; p += 3) {
    const i = arr[p] | 0, k = KIND_BY_ID[arr[p + 1] | 0];
    if (i < 0 || i >= N * N || !k) continue;
    c.usedKind[i] = RAW[k].id; c.used[i] = Math.max(0, Math.min(RESERVE[k].cap, +arr[p + 2] || 0));
  }
}

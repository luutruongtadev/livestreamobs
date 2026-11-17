// Phố Mới — tàu thuỷ: tìm đường trên mặt nước, tuyến tàu khách chở khách thật (như tuyến xe buýt) và tàu hàng ra vào cảng.
// Có từ hai bến tàu khách trở lên trên cùng một vùng nước: thành tuyến chạy qua lại giữa các bến, người dân tự chọn đi tàu
// khi nhanh hơn tự lái. Chỉ một bến: tàu tìm cửa biển (mép bản đồ) để chạy ra ngoài, chở dân đi chơi và đưa du khách tới.
import { N, SERVICES, TRANSIT, idx, inMap, cellCenter, clamp } from './base.js';

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SPEED_DWELL = 4; // giây mô phỏng tàu đỗ ở mỗi bến
const OUT_EXTRA = 40; // ra khỏi mép bản đồ thêm chừng này đơn vị thì tàu khuất hẳn

// ───────────────────────── tìm đường trên mặt nước ─────────────────────────

/** Ô nước sâu: cả 8 ô quanh cũng là nước (ngoài bản đồ coi như nước). Tàu chạy giữa dòng, không sát bờ. */
function deepMask(c) {
  const deep = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!c.water[idx(x, y)]) continue;
    let ok = 1;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(x + dx, y + dy) && !c.water[idx(x + dx, y + dy)]) { ok = 0; break; }
    deep[idx(x, y)] = ok;
  }
  return deep;
}

function nav(c) {
  const comp = new Int32Array(N * N).fill(-1), size = [];
  const compOf = (start) => { // vùng nước liền (4 hướng), đánh số dần khi cần
    if (comp[start] >= 0) return comp[start];
    const id = size.length, q = [start]; comp[start] = id; let n = 0;
    while (q.length) {
      const i = q.pop(), x = i % N, y = (i / N) | 0; n++;
      for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (c.water[j] && comp[j] < 0) { comp[j] = id; q.push(j); } }
    }
    size.push(n);
    return id;
  };
  return { deep: deepMask(c), compOf, size };
}

/** Ô nước để tàu cập bến công trình s: ưu tiên nước sâu trong 6 ô, không có thì nước nông trong 3 ô. */
function dockOf(c, s, nv) {
  const sz = SERVICES[s.type].size, cx = s.x + sz / 2, cy = s.y + sz / 2;
  for (const [W, reach, deep] of [[nv.deep, 6, true], [c.water, 3, false]]) {
    let best = -1, bd = 1e9;
    for (let y = s.y - reach; y < s.y + sz + reach; y++) for (let x = s.x - reach; x < s.x + sz + reach; x++) {
      if (!inMap(x, y) || !W[idx(x, y)]) continue;
      const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      if (d < bd) { bd = d; best = idx(x, y); }
    }
    if (best >= 0) return { cell: best, deep };
  }
  return null;
}

/** Đường ngắn nhất trên mặt nạ W (8 hướng, không cắt góc bờ). */
function bfs(W, start) {
  const dist = new Int32Array(N * N).fill(-1), prev = new Int32Array(N * N).fill(-1), q = [start]; dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % N, y = (i / N) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue;
      const j = idx(nx, ny); if (!W[j] || dist[j] >= 0) continue;
      if (dx && dy && (!W[idx(x + dx, y)] || !W[idx(x, y + dy)])) continue;
      dist[j] = dist[i] + 1; prev[j] = i; q.push(j);
    }
  }
  return { dist, prev, order: q };
}

/** Kéo dây: bỏ các điểm giữa khi hai đầu nhìn thẳng thấy nhau trên mặt nước. Trả về điểm thế giới [[x, z], ...]. */
function pull(W, cells) {
  const clear = (a, b) => {
    const ax = (a % N) + 0.5, ay = ((a / N) | 0) + 0.5, bx = (b % N) + 0.5, by = ((b / N) | 0) + 0.5, n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3) + 1;
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
      for (const [ox, oy] of [[0, 0], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) { const tx = Math.floor(x + ox), ty = Math.floor(y + oy); if (!inMap(tx, ty) || !W[idx(tx, ty)]) return false; }
    }
    return true;
  };
  const pts = [cells[0]];
  for (let a = 0; a < cells.length - 1;) { let b = cells.length - 1; while (b > a + 1 && !clear(cells[a], cells[b])) b--; pts.push(cells[b]); a = b; }
  return pts.map((i) => [cellCenter(i % N), cellCenter((i / N) | 0)]);
}

const backtrack = (prev, goal) => { const cells = []; for (let i = goal; i >= 0; i = prev[i]) cells.push(i); return cells.reverse(); };
const masks = (c, nv, ...docks) => (docks.every((d) => d.deep) ? [nv.deep, c.water] : [c.water]);

/** Đường thuỷ giữa hai bến (điểm thế giới) hoặc null. */
function routeBetween(c, nv, A, B) {
  for (const W of masks(c, nv, A, B)) {
    const { dist, prev } = bfs(W, A.cell);
    if (dist[B.cell] >= 0) return pull(W, backtrack(prev, B.cell));
  }
  return null;
}

/** Đường từ bến ra cửa biển gần nhất (ô nước ở mép bản đồ), kéo dài ra ngoài mép. null nếu là hồ kín. */
function routeToSea(c, nv, A) {
  for (const W of masks(c, nv, A)) {
    const { dist, prev, order } = bfs(W, A.cell);
    let goal = -1;
    for (const i of order) { const x = i % N, y = (i / N) | 0; if ((x === 0 || y === 0 || x === N - 1 || y === N - 1) && dist[i] > 4) { goal = i; break; } } // order theo khoảng cách tăng dần
    if (goal < 0) continue;
    const path = pull(W, backtrack(prev, goal)), [lx, lz] = path[path.length - 1], gx = goal % N, gy = (goal / N) | 0;
    path.push([lx + (gx === 0 ? -OUT_EXTRA : gx === N - 1 ? OUT_EXTRA : 0), lz + (gy === 0 ? -OUT_EXTRA : gy === N - 1 ? OUT_EXTRA : 0)]);
    return path;
  }
  return null;
}

const svcCenter = (s) => { const sz = SERVICES[s.type].size; return [cellCenter(s.x) + ((sz - 1) * 10) / 2, cellCenter(s.y) + ((sz - 1) * 10) / 2]; };
const polyLen = (p) => { let l = 0; for (let k = 1; k < p.length; k++) l += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return l; };

/** Tuyến tàu hàng (chỉ để vẽ): mỗi cảng một tàu container chạy ra cửa biển. [{ type, from, path, out }] */
export function shipRoutes(c) {
  const nv = nav(c), out = [];
  for (const s of c.services) {
    if (s.type !== 'port') continue;
    const d = dockOf(c, s, nv); if (!d || nv.size[nv.compOf(d.cell)] < 12) continue;
    const path = routeToSea(c, nv, d);
    if (path) out.push({ type: 'port', from: s, path, out: true });
  }
  return out;
}

// ───────────────────────── tuyến tàu khách ─────────────────────────

/**
 * Dựng lại các tuyến tàu khách từ các bến hiện có (gọi mỗi giờ, khi tải game và khi đường / bến đổi).
 * Tuyến cũ còn nguyên các bến thì giữ tàu, khách đang chờ, khách trên tàu.
 * c.ferryState[uid] = 'line' | 'sea' | 'pond' | 'dry' cho bảng thông tin.
 */
export function syncFerries(c) {
  const nv = nav(c), old = new Map((c.ferries || []).map((l) => [l.key, l])), lines = [], state = {};
  const groups = new Map();
  for (const s of c.services) {
    if (s.type !== 'ferry') continue;
    const d = dockOf(c, s, nv);
    if (!d) { state[s.uid] = 'dry'; continue; }
    const id = nv.compOf(d.cell);
    if (nv.size[id] < 12) { state[s.uid] = 'pond'; continue; }
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ s, d, p: svcCenter(s) });
  }
  for (const g of groups.values()) {
    let chain, legs = [], out = false;
    if (g.length >= 2) {
      // xếp bến thành chuỗi: bắt đầu từ bến xa nhất, mỗi bước tới bến gần nhất chưa ghé
      const far = (p, list) => list.reduce((b, t) => (Math.hypot(t.p[0] - p[0], t.p[1] - p[1]) > Math.hypot(b.p[0] - p[0], b.p[1] - p[1]) ? t : b));
      const left = g.slice(); let cur = far(left[0].p, left); chain = [];
      while (cur) { chain.push(cur); left.splice(left.indexOf(cur), 1); cur = left.length ? left.reduce((b, t) => (Math.hypot(t.p[0] - chain[chain.length - 1].p[0], t.p[1] - chain[chain.length - 1].p[1]) < Math.hypot(b.p[0] - chain[chain.length - 1].p[0], b.p[1] - chain[chain.length - 1].p[1]) ? t : b)) : null; }
      for (let k = 1; k < chain.length; k++) legs.push(routeBetween(c, nv, chain[k - 1].d, chain[k].d));
      if (legs.some((l) => !l)) { for (const t of g) state[t.s.uid] = 'pond'; continue; }
      for (const t of g) state[t.s.uid] = 'line';
    } else {
      const sea = routeToSea(c, nv, g[0].d);
      if (!sea) { state[g[0].s.uid] = 'pond'; continue; }
      chain = g; legs = [sea]; out = true; state[g[0].s.uid] = 'sea';
    }
    const key = (out ? 'sea:' : 'f:') + chain.map((t) => t.s.uid).join('-');
    const wpath = [legs[0][0]], pos = [0];
    for (const leg of legs) { for (let k = 1; k < leg.length; k++) wpath.push(leg[k]); }
    const wcum = [0]; for (let k = 1; k < wpath.length; k++) wcum.push(wcum[k - 1] + Math.hypot(wpath[k][0] - wpath[k - 1][0], wpath[k][1] - wpath[k - 1][1]));
    for (const leg of legs) pos.push(pos[pos.length - 1] + polyLen(leg));
    const len = wcum[wcum.length - 1];
    if (out) pos[1] = len; // điểm "cửa biển" là cuối đường (đã ra khỏi bản đồ)
    const stops = chain.map((t) => ({ x: t.p[0], z: t.p[1], uid: t.s.uid, waiting: [] }));
    if (out) stops.push({ x: wpath[wpath.length - 1][0], z: wpath[wpath.length - 1][1], sea: true, waiting: [] });
    const prev = old.get(key), count = out ? 1 : chain.length;
    const line = prev || { key, id: key, mode: 'ferry', hue: 0.55, riders: 0, ridersDay: 0, guests: 0, travellers: 0, guestsDay: 0, travellersDay: 0, veh: [] };
    if (prev) { old.delete(key); stops.forEach((s, k) => { s.waiting = prev.stops[k] ? prev.stops[k].waiting : []; }); }
    Object.assign(line, { out, stops, wpath, wcum, pos, len, count, broken: false });
    while (line.veh.length > count) dropSlot(c, line.veh.pop());
    while (line.veh.length < count) line.veh.push({ s: (len * line.veh.length) / count, dir: 1, dwell: 0, at: -1, riders: [], load: 0 });
    for (const sl of line.veh) sl.s = clamp(sl.s, 0, len);
    line.headway = ((len * 2) / TRANSIT.ferry.speed + stops.length * SPEED_DWELL * 2) / count;
    lines.push(line);
  }
  for (const l of old.values()) { for (const sl of l.veh) dropSlot(c, sl); for (const s of l.stops) for (const r of s.waiting) c.onArrive(c, r.cb, null); } // tuyến bị bỏ: trả khách về
  c.ferries = lines; c.ferryState = state;
  return lines;
}

function dropSlot(c, sl) { for (const r of sl.riders) c.onArrive(c, r.cb, null); sl.riders = []; }

const fareOf = (c) => (c.transit.ferryFare === undefined ? 4 : c.transit.ferryFare);
function pay(c, line, n) {
  const f = fareOf(c) * n;
  c.money += f; c.transit.income += f; c.transit.riders += n; line.riders += n;
}

/** Tàu cập bến k: trả khách xuống, đón khách lên (thu vé lúc lên tàu). */
function exchange(c, line, sl, k) {
  const cap = TRANSIT.ferry.cap, stop = line.stops[k];
  if (line.out) { // tuyến ra biển: khách là dân đi chơi xa và du khách, tính theo số đông
    const rng = c.rng || Math.random, pop = c.pstats ? c.pstats.pop : 0, happy = c.pstats ? c.pstats.happy : 55;
    if (stop.sea) {
      line.travellers += sl.load; // dân đã ra ngoài
      const n = Math.min(cap, Math.round((20 + pop * 0.01) * clamp(happy / 60, 0.3, 1.6) * (0.6 + rng() * 0.8)));
      sl.load = n; pay(c, line, n);
    } else {
      if (sl.load) { line.guests += sl.load; if (c.onTourists) c.onTourists(c, sl.load); }
      const n = Math.min(cap, Math.round(pop * 0.006 * (0.6 + rng() * 0.8)));
      sl.load = n; pay(c, line, n);
    }
    return;
  }
  const stay = [];
  for (const r of sl.riders) { if (r.to === k) c.onArrive(c, r.cb, null); else stay.push(r); }
  sl.riders = stay;
  let n = 0;
  while (stop.waiting.length && sl.riders.length < cap) { sl.riders.push(stop.waiting.shift()); n++; }
  if (n) pay(c, line, n);
}

/** Tàu chạy qua lại trên đường thuỷ, dừng ở từng bến. */
export function stepFerries(c, dt) {
  const def = TRANSIT.ferry;
  for (const line of c.ferries || []) {
    const total = line.len, last = line.pos.length - 1;
    for (const sl of line.veh) {
      if (sl.dwell > 0) { sl.dwell -= dt; continue; }
      const prev = sl.s;
      // chạy chậm lại khi sắp cập bến
      let near = Infinity; for (const p of line.pos) near = Math.min(near, Math.abs(p - sl.s));
      sl.s += sl.dir * def.speed * dt * clamp(0.25 + near / 40, 0.25, 1);
      for (let k = 0; k <= last; k++) {
        const p = line.pos[k];
        if (k !== sl.at && ((prev < p && sl.s >= p) || (prev > p && sl.s <= p) || (sl.at < 0 && Math.abs(sl.s - p) < 1))) {
          sl.s = p; sl.at = k; sl.dwell = SPEED_DWELL;
          exchange(c, line, sl, k);
          if (k === 0) sl.dir = 1; else if (k === last) sl.dir = -1;
          break;
        }
      }
      sl.s = clamp(sl.s, 0, total);
      if (sl.s <= 0) sl.dir = 1; else if (sl.s >= total) sl.dir = -1;
    }
  }
}

/** Vị trí + hướng của một tàu: [x, z, hướng x, hướng z]. */
export function ferryPoint(line, sl) {
  const at = (d) => {
    d = clamp(d, 0, line.len);
    let i = 1; while (i < line.wcum.length - 1 && line.wcum[i] < d) i++;
    const a = line.wpath[i - 1], b = line.wpath[i], f = (d - line.wcum[i - 1]) / (line.wcum[i] - line.wcum[i - 1] || 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const p = at(sl.s), dir = sl.dwell > 0 && sl.at >= 0 ? (sl.at === 0 ? 1 : sl.at === line.pos.length - 1 ? -1 : sl.dir) : sl.dir;
  let a = at(sl.s - 6 * dir), b = at(sl.s + 6 * dir);
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3) { a = at(0); b = at(8); }
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [p[0], p[1], (b[0] - a[0]) / l, (b[1] - a[1]) / l];
}

/** Mỗi ngày: chốt số khách hôm qua của các tuyến tàu. */
export function ferryDay(c) {
  for (const l of c.ferries || []) { l.ridersDay = l.riders; l.riders = 0; l.guestsDay = l.guests; l.guests = 0; l.travellersDay = l.travellers; l.travellers = 0; }
}

// Phố Mới — tàu thuỷ: tìm đường trên mặt nước, tuyến tàu khách chở khách thật (như tuyến xe buýt) và tàu hàng ra vào cảng.
// Có từ hai bến tàu khách trở lên trên cùng một vùng nước: thành tuyến chạy qua lại giữa các bến, người dân tự chọn đi tàu
// khi nhanh hơn tự lái. Chỉ một bến: tàu tìm cửa biển (mép bản đồ) để chạy ra ngoài, chở dân đi chơi và đưa du khách tới.
// Tuyến nhiều bến bật "chuyến ra biển" (ở một bến bất kỳ) thì nối thêm chặng từ đầu tuyến gần biển nhất ra cửa biển.
// Bến trên đảo (vùng đất không thuộc đất liền lớn nhất): du khách đang ở thành phố đi tàu ra đảo chơi trong ngày rồi về.
import { N, SERVICES, TRANSIT, ZDEF, idx, inMap, cellCenter, clamp } from './base.js';

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SPEED_DWELL = 4; // giây mô phỏng tàu đỗ ở mỗi bến
const OUT_EXTRA = 40; // ra khỏi mép bản đồ thêm chừng này đơn vị thì tàu khuất hẳn

// ───────────────────────── tìm đường trên mặt nước ─────────────────────────

/** Ô nước sâu: cả 8 ô quanh cũng là nước (ngoài bản đồ coi như nước). Tàu chạy giữa dòng, không sát bờ. */
const sail = (c, j) => c.water[j] && !(c.damCell && c.damCell[j]); // thân đập thuỷ điện chắn tàu thuyền
function deepMask(c) {
  const deep = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!sail(c, idx(x, y))) continue;
    let ok = 1;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(x + dx, y + dy) && !sail(c, idx(x + dx, y + dy))) { ok = 0; break; }
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
      for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (sail(c, j) && comp[j] < 0) { comp[j] = id; q.push(j); } }
    }
    size.push(n);
    return id;
  };
  const wet = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) wet[i] = sail(c, i) ? 1 : 0;
  return { deep: deepMask(c), wet, compOf, size };
}

/** Vùng đất liền (4 hướng): comp[i] = số vùng (-1 là nước), main = vùng lớn nhất (đất liền), size[id]. */
export function landInfo(c) {
  const comp = new Int32Array(N * N).fill(-1), size = [];
  for (let s = 0; s < N * N; s++) {
    if (c.water[s] || comp[s] >= 0) continue;
    const id = size.length, q = [s]; comp[s] = id; let n = 0;
    while (q.length) {
      const i = q.pop(), x = i % N, y = (i / N) | 0; n++;
      for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (!c.water[j] && comp[j] < 0) { comp[j] = id; q.push(j); } }
    }
    size.push(n);
  }
  let main = 0; size.forEach((n, k) => { if (n > size[main]) main = k; });
  return { comp, size, main };
}

/** Sức hút của một đảo: cảnh đẹp sẵn có + công trình du lịch, bãi biển, khu vui chơi trên đảo (tối đa 12). */
export function islandAttract(c, li, id) {
  let a = 4, beach = 0, fun = 0;
  for (const s of c.services) if (li.comp[idx(s.x, s.y)] === id && SERVICES[s.type].attract) a += SERVICES[s.type].attract * 0.3;
  for (let i = 0; i < N * N; i++) if (li.comp[i] === id) { if (c.beach && c.beach[i]) beach++; if (c.level[i] && ZDEF[c.zone[i]].biz === 'leisure') fun++; }
  return Math.round(Math.min(12, a + beach * 0.15 + fun * 0.3) * 10) / 10;
}

/** Ô nước để tàu cập bến công trình s: ưu tiên nước sâu trong 6 ô, không có thì nước nông trong 3 ô. */
function dockOf(c, s, nv) {
  const sz = SERVICES[s.type].size, cx = s.x + sz / 2, cy = s.y + sz / 2;
  for (const [W, reach, deep] of [[nv.deep, 6, true], [nv.wet, 3, false]]) {
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
const masks = (c, nv, ...docks) => (docks.every((d) => d.deep) ? [nv.deep, nv.wet] : [nv.wet]);

/** Đường thuỷ giữa hai bến (điểm thế giới) hoặc null. */
function routeBetween(c, nv, A, B) {
  for (const W of masks(c, nv, A, B)) {
    const { dist, prev } = bfs(W, A.cell);
    if (dist[B.cell] >= 0) return pull(W, backtrack(prev, B.cell));
  }
  return null;
}

/** Hồ kín: đường du ngoạn tới chỗ xa bến nhất trong hồ (đi rồi quay về). null nếu hồ quá nhỏ. */
function routeCruise(c, nv, A) {
  for (const W of masks(c, nv, A)) {
    const { dist, prev, order } = bfs(W, A.cell), far = order[order.length - 1];
    if (dist[far] >= 6) return pull(W, backtrack(prev, far));
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

/** Cảng và bến tàu khách ra được biển: [{ s, path }] (path từ bến ra quá mép bản đồ) — cho tàu nước ngoài ghé. */
export function seaGates(c) {
  const nv = nav(c), out = [];
  for (const s of c.services) {
    if (s.type !== 'port' && s.type !== 'ferry') continue;
    const d = dockOf(c, s, nv); if (!d || nv.size[nv.compOf(d.cell)] < 12) continue;
    const path = routeToSea(c, nv, d);
    if (path) out.push({ s, path });
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
  const groups = new Map(), li = landInfo(c), att = new Map();
  for (const s of c.services) {
    if (s.type !== 'ferry') continue;
    const d = dockOf(c, s, nv);
    if (!d) { state[s.uid] = 'dry'; continue; }
    const id = nv.compOf(d.cell);
    if (nv.size[id] < 12) { state[s.uid] = 'pond'; continue; }
    if (!groups.has(id)) groups.set(id, []);
    const land = li.comp[idx(s.x, s.y)], isl = land >= 0 && land !== li.main ? land : -1;
    if (isl >= 0 && !att.has(isl)) att.set(isl, islandAttract(c, li, isl));
    groups.get(id).push({ s, d, p: svcCenter(s), isl });
  }
  for (const g of groups.values()) {
    let chain, legs = [], out = false, cruise = false, seaFail = false;
    if (g.length >= 2) {
      // xếp bến thành chuỗi: bắt đầu từ bến xa nhất, mỗi bước tới bến gần nhất chưa ghé
      const far = (p, list) => list.reduce((b, t) => (Math.hypot(t.p[0] - p[0], t.p[1] - p[1]) > Math.hypot(b.p[0] - p[0], b.p[1] - p[1]) ? t : b));
      const left = g.slice(); let cur = far(left[0].p, left); chain = [];
      while (cur) { chain.push(cur); left.splice(left.indexOf(cur), 1); cur = left.length ? left.reduce((b, t) => (Math.hypot(t.p[0] - chain[chain.length - 1].p[0], t.p[1] - chain[chain.length - 1].p[1]) < Math.hypot(b.p[0] - chain[chain.length - 1].p[0], b.p[1] - chain[chain.length - 1].p[1]) ? t : b)) : null; }
      for (let k = 1; k < chain.length; k++) legs.push(routeBetween(c, nv, chain[k - 1].d, chain[k].d));
      if (legs.some((l) => !l)) { for (const t of g) state[t.s.uid] = 'pond'; continue; }
      for (const t of g) state[t.s.uid] = 'line';
      if (chain.some((t) => t.s.sea)) { // chuyến ra biển: nối thêm chặng từ đầu tuyến gần biển hơn
        const a = routeToSea(c, nv, chain[0].d), b = routeToSea(c, nv, chain[chain.length - 1].d);
        if (!a && !b) seaFail = true;
        else {
          if (a && (!b || polyLen(a) < polyLen(b))) { chain.reverse(); legs = legs.reverse().map((l) => l.slice().reverse()); legs.push(a); } else legs.push(b);
          out = true;
        }
      }
    } else {
      const sea = routeToSea(c, nv, g[0].d), tour = sea ? null : routeCruise(c, nv, g[0].d);
      if (!sea && !tour) { state[g[0].s.uid] = 'pond'; continue; }
      chain = g; legs = [sea || tour]; out = !!sea; cruise = !sea; state[g[0].s.uid] = sea ? 'sea' : 'cruise';
    }
    const single = chain.length === 1, key = (out ? (single ? 'sea:' : 'fs:') : cruise ? 'tour:' : 'f:') + chain.map((t) => t.s.uid).join('-');
    const wpath = [legs[0][0]], pos = [0];
    for (const leg of legs) { for (let k = 1; k < leg.length; k++) wpath.push(leg[k]); }
    const wcum = [0]; for (let k = 1; k < wpath.length; k++) wcum.push(wcum[k - 1] + Math.hypot(wpath[k][0] - wpath[k - 1][0], wpath[k][1] - wpath[k - 1][1]));
    for (const leg of legs) pos.push(pos[pos.length - 1] + polyLen(leg));
    const len = wcum[wcum.length - 1];
    if (wpath.length < 2 || len < 30 || pos.some((p, k) => k && p - pos[k - 1] < 5)) { for (const t of chain) state[t.s.uid] = 'close'; continue; } // các bến sát nhau, chung chỗ cập: không thành tuyến
    if (out || cruise) pos[pos.length - 1] = len; // điểm "cửa biển" / chỗ quay đầu là cuối đường
    const stops = chain.map((t) => ({ x: t.p[0], z: t.p[1], uid: t.s.uid, isl: t.isl, waiting: [], stay: 0 }));
    if (out || cruise) stops.push({ x: wpath[wpath.length - 1][0], z: wpath[wpath.length - 1][1], sea: out, turn: cruise, isl: -1, waiting: [], stay: 0 });
    // tuyến ra đảo: có cả bến đất liền và bến trên đảo
    const isles = [...new Set(chain.filter((t) => t.isl >= 0).map((t) => t.isl))].map((id) => ({ id, att: att.get(id) }));
    const isle = !single && isles.length > 0 && chain.some((t) => t.isl < 0);
    const prev = old.get(key), count = cruise || single ? 1 : chain.length + (out ? 1 : 0);
    const line = prev || { key, id: key, mode: 'ferry', hue: 0.55, riders: 0, ridersDay: 0, guests: 0, travellers: 0, guestsDay: 0, travellersDay: 0, islanders: 0, islandersDay: 0, veh: [] };
    if (prev) { old.delete(key); stops.forEach((s, k) => { s.waiting = prev.stops[k] ? prev.stops[k].waiting : []; s.stay = prev.stops[k] ? prev.stops[k].stay | 0 : 0; }); }
    Object.assign(line, { out, cruise, single, isle, isles: isle ? isles : [], isleAtt: isle ? isles.reduce((s, x) => s + x.att, 0) : 0, seaFail, stops, wpath, wcum, pos, len, count, broken: false });
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
/** Vé đắt thì ít người đi: 4 ₫ ≈ 1, 10 ₫ ≈ 0,68, 20 ₫ chỉ còn 0,15 (thu nhiều nhất quanh 10 ₫). */
export const fareK = (c) => clamp(1.3 - fareOf(c) / 16, 0.15, 1.3);
function pay(c, line, n) {
  const f = fareOf(c) * n;
  c.money += f; c.transit.income += f; c.transit.riders += n; line.riders += n;
}

/** Tàu cập bến k: trả khách xuống, đón khách lên (thu vé lúc lên tàu). */
function exchange(c, line, sl, k) {
  const cap = TRANSIT.ferry.cap, stop = line.stops[k];
  if (line.cruise) { // du ngoạn hồ: dân lên tàu ngắm cảnh ở bến, về bến thì xuống
    if (stop.turn) return;
    const rng = c.rng || Math.random, pop = c.pstats ? c.pstats.pop : 0;
    line.travellers += sl.load;
    const n = Math.min(TRANSIT.ferry.cap, Math.round((6 + pop * 0.005) * fareK(c) * (0.6 + rng() * 0.8)));
    sl.load = n; pay(c, line, n);
    return;
  }
  // khách tính theo số đông: out = dân đi chơi xa (ra biển), guests = du khách từ biển vào, tour = du khách ra đảo, back = du khách từ đảo về
  const rng = c.rng || Math.random, pop = c.pstats ? c.pstats.pop : 0, fk = fareK(c), rnd = () => (0.6 + rng() * 0.8) * fk;
  const free = () => Math.max(0, cap - sl.riders.length - (sl.out | 0) - (sl.guests | 0) - (sl.tour | 0) - (sl.back | 0));
  if (stop.sea) {
    line.travellers += sl.out | 0; sl.out = 0; // dân đã ra ngoài
    const happy = c.pstats ? c.pstats.happy : 55;
    const n = Math.min(free(), Math.round((20 + pop * 0.01) * clamp(happy / 60, 0.3, 1.6) * rnd()));
    sl.guests = (sl.guests | 0) + n; pay(c, line, n);
    return;
  }
  if (sl.guests) { line.guests += sl.guests; if (c.onTourists) c.onTourists(c, sl.guests); sl.guests = 0; }
  if (stop.isl >= 0 && sl.tour) { // tới đảo: du khách xuống chơi, tiêu tiền, chờ chuyến về
    line.islanders += sl.tour; stop.stay += sl.tour;
    if (c.tour) c.tour.day.isle = (c.tour.day.isle || 0) + sl.tour;
    if (c.onTourists) c.onTourists(c, sl.tour, 10);
    sl.tour = 0;
  }
  if (stop.isl < 0 && sl.back) sl.back = 0; // từ đảo về đất liền
  if (line.out) { // dân đi chơi xa ra biển, chia đều các bến
    const docks = line.stops.length - 1, n = Math.min(free(), Math.round((pop * 0.006 * rnd()) / docks));
    sl.out = (sl.out | 0) + n; pay(c, line, n);
  }
  if (line.isle) {
    if (stop.isl < 0) { // bến đất liền: du khách đang ở thành phố mua vé ra đảo
      const t = c.tour, pool = t ? t.guests * 0.05 + (t.score ? t.score.perDay * 0.012 : 0) : 0, main = line.stops.filter((s) => !s.sea && s.isl < 0).length;
      const n = Math.min(free(), Math.round((pool * clamp(line.isleAtt / 8, 0.3, 2) * rnd()) / main));
      sl.tour = (sl.tour | 0) + n; pay(c, line, n);
    } else { const m = Math.min(free(), stop.stay); stop.stay -= m; sl.back = (sl.back | 0) + m; pay(c, line, m); }
  }
  if (line.single) return;
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
  // bến tàu vừa xây, dời hoặc phá: dựng lại tuyến ngay, không đợi tới giờ sau
  let sig = `${c.waterVer || 0}|`; // mặt nước đổi (hồ dâng, ao cạn, đào kênh) cũng dựng lại tuyến
  for (const s of c.services) if (s.type === 'ferry' || s.type === 'hydro') sig += s.uid + ':' + s.x + ',' + s.y + ';';
  if (sig !== c.ferrySig) { c.ferrySig = sig; syncFerries(c); }
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
  if (!line.wpath || line.wpath.length < 2) { const p = (line.wpath && line.wpath[0]) || [line.stops[0].x, line.stops[0].z]; return [p[0], p[1], 0, 1]; }
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
  for (const l of c.ferries || []) { l.ridersDay = l.riders; l.riders = 0; l.guestsDay = l.guests; l.guests = 0; l.travellersDay = l.travellers; l.travellers = 0; l.islandersDay = l.islanders | 0; l.islanders = 0; }
}

// ───────────────────────── tìm đường kênh ra biển ─────────────────────────

/**
 * Bến tàu nằm trong hồ kín: tìm đường kênh ngắn nhất (ít ô đất phải đào nhất) từ hồ ra vùng nước thông ra mép bản đồ.
 * Chỉ đào qua đất đã mua, không đụng đường, nhà, công trình (cả ô xung quanh, vì đáy kênh hạ cả bốn góc ô).
 * Trả về { cells: [ô đất cần đào theo thứ tự], already } hoặc { reason }.
 */
export function canalToSea(c, s) {
  const nv = nav(c), d = dockOf(c, s, nv);
  if (!d) return { reason: 'Bến không sát mặt nước' };
  // vùng nước thông ra mép bản đồ (4 hướng, như cách tính vùng nước liền)
  const sea = new Uint8Array(N * N), q = [];
  for (let k = 0; k < N; k++) for (const [x, y] of [[k, 0], [k, N - 1], [0, k], [N - 1, k]]) { const i = idx(x, y); if (c.water[i] && !sea[i]) { sea[i] = 1; q.push(i); } }
  while (q.length) { const i = q.pop(), x = i % N, y = (i / N) | 0; for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (c.water[j] && !sea[j]) { sea[j] = 1; q.push(j); } } }
  if (sea[d.cell]) return { cells: [], already: true };
  if (!sea.some((v) => v)) return { reason: 'Bản đồ không có biển hay sông nào chảy ra mép' };
  const diggable = (x, y) => {
    if (x < 1 || y < 1 || x > N - 2 || y > N - 2) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = idx(x + dx, y + dy); if (!c.own[j] || c.road[j] || c.occ[j] || c.level[j]) return false; }
    return true;
  };
  // Dijkstra hàng đợi theo xô: đi trên nước không tốn, mỗi ô đất phải đào tốn 1
  const cost = new Int32Array(N * N).fill(-1), prev = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N), buckets = [[d.cell]];
  cost[d.cell] = 0;
  let goal = -1;
  for (let k = 0; k < buckets.length && goal < 0; k++) {
    const b = buckets[k];
    for (let h = 0; h < (b || []).length && goal < 0; h++) {
      const i = b[h];
      if (done[i] || cost[i] !== k) continue;
      done[i] = 1;
      if (sea[i]) { goal = i; break; }
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue;
        const j = idx(nx, ny), wet = c.water[j];
        if (!wet && !diggable(nx, ny)) continue;
        const nc = k + (wet ? 0 : 1);
        if (cost[j] >= 0 && cost[j] <= nc) continue;
        cost[j] = nc; prev[j] = i;
        (buckets[nc] || (buckets[nc] = [])).push(j);
      }
    }
  }
  if (goal < 0) return { reason: 'Không có lối đào kênh ra biển: đường, nhà hoặc đất chưa mua chắn hết lối' };
  const cells = [];
  for (let i = goal; i >= 0; i = prev[i]) if (!c.water[i]) cells.push(i);
  return { cells: cells.reverse() };
}

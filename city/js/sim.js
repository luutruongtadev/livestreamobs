// Phố Mới — lõi mô phỏng thành phố (không đụng DOM, chạy được cả trong Node để test).
// Đường là một graph (nút giao + đoạn đường cong Bezier bậc 2); ô đất theo lưới N x N.
// Người dân, doanh nghiệp (people.js), xe cộ (traffic.js) và giao thông công cộng (transit.js) cắm vào vòng lặp ở đây.
import {
  N, LN, OFF, TILE, TILES, T, HALF, HOUR_SEC, RATE, idx, inMap, cellOf, cellCenter, clamp, ZDEF, MAX_LEVEL, resCap, jobCap, utilUse, reqEdu, garbageLimit,
  MODS, TECH, POLICIES, DISTRICTS, MILESTONE_POINTS, svcVal, hasTech, outerMask,
  ROADS, BRIDGE_MULT, ELEV_MULT, MIN_ELEV_LEN, deckH, edgeH, LINES, SERVICES, MILESTONES, LOANS, MAX_LOANS, BANKRUPT_AT, BANKRUPT_DAYS,
  mulberry32, hash2, vnoise, makeField, distSeg, nearestOnEdge,
} from './base.js';
import { initTraffic, rebuildTraffic, stepTraffic, edgeLoad } from './traffic.js';
import { initPeople, peopleHour, onArrive, onBuildingCleared, quickStats, packPeople, unpackPeople, bizKind } from './people.js';
import { initTransit, maintainTransit, stepTransit, transitHour, transitUpkeep, addLine } from './transit.js';

export * from './base.js';
export { edgeLoad, signalState, findPath, cellPos, VKIND } from './traffic.js';
export { bizKind, wageAt, rentAt, outsidePositions, ST } from './people.js';
export { planLine as planTransit, addLine as addTransit, removeLine as removeTransit, setVehicles, metroPoint, planRide, metroUnlocked } from './transit.js';

export const ZONE_NAME = ZDEF.map((z) => z.name);

// ───────────────────────── địa hình (heightmap) ─────────────────────────

/** Độ cao đất liền tại đỉnh lưới (gx, gy): đồi thoải ở vùng trung tâm, núi cao dần ở vùng ngoài; bằng 0 ở sát bờ nước. */
export function hillHeight(seed, f, gx, gy) {
  const u = gx - OFF, v = gy - OFF, land = clamp((f(gx, gy) - 1.6) / 9, 0, 1);
  const n = vnoise(u * 0.034, v * 0.034, seed + 41) * 0.75 + vnoise(u * 0.09, v * 0.09, seed + 43) * 0.25;
  let h = 15 * Math.pow(n, 1.5) * land;
  const m = outerMask(gx, gy);
  if (m > 0) {
    const range = clamp(vnoise(u * 0.013, v * 0.013, seed + 73) * 1.9 - 0.55, 0, 1); // chỗ nào có dãy núi
    h += m * land * range * (Math.pow(vnoise(u * 0.035, v * 0.035, seed + 71), 1.7) * 110 + vnoise(u * 0.11, v * 0.11, seed + 75) * 10);
  }
  return h;
}

/** Cao độ một đỉnh lưới: đáy nước -3.2, mép bờ 0, đất liền theo đồi. isWater(tx, ty) cho ô bất kỳ. */
export function vertexHeight(seed, f, isWater, gx, gy) {
  const wn = isWater(gx - 1, gy - 1) + isWater(gx, gy - 1) + isWater(gx - 1, gy) + isWater(gx, gy);
  if (wn === 4) return -3.2;
  if (wn > 0) return 0;
  return hillHeight(seed, f, gx, gy);
}

function makeTerrain(c) {
  const f = makeField(c.seed);
  const isWater = (tx, ty) => (inMap(tx, ty) ? c.water[idx(tx, ty)] === 1 : f(tx + 0.5, ty + 0.5) < 0.15);
  const V = N + 1;
  c.hv = new Float32Array(V * V);
  for (let gy = 0; gy <= N; gy++) for (let gx = 0; gx <= N; gx++) c.hv[gy * V + gx] = vertexHeight(c.seed, f, isWater, gx, gy);
  c.cellH = new Float32Array(N * N); // cao độ nền nhà của ô = đỉnh cao nhất
  c.steep = new Uint8Array(N * N); // sườn quá dốc: không xây nhà, không quy hoạch (đường vẫn đi qua được)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = c.hv[y * V + x], b = c.hv[y * V + x + 1], d = c.hv[(y + 1) * V + x], e = c.hv[(y + 1) * V + x + 1], hi = Math.max(a, b, d, e);
    c.cellH[idx(x, y)] = hi;
    if (hi - Math.min(a, b, d, e) > 5.5) c.steep[idx(x, y)] = 1;
  }
  // tài nguyên thiên nhiên: 1 đất màu mỡ (đồng bằng), 2 vỉa quặng (vùng đồi núi), 3 túi dầu
  c.res = new Uint8Array(N * N);
  const s = c.seed;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y), u = x - OFF, v = y - OFF;
    if (c.water[i] || c.steep[i]) continue;
    if (vnoise(u * 0.045, v * 0.045, s + 85) > 0.74) c.res[i] = 3;
    else if (vnoise(u * 0.06, v * 0.06, s + 83) > 0.66 && c.cellH[i] > 4) c.res[i] = 2;
    else if (vnoise(u * 0.05, v * 0.05, s + 81) > 0.55 && c.cellH[i] < 7) c.res[i] = 1;
  }
}

/** Cao độ mặt đất tại toạ độ thế giới (khớp đúng lưới tam giác của địa hình). */
export function heightAt(c, wx, wz) {
  const u = clamp((wx + HALF) / T, 0, N - 1e-6), v = clamp((wz + HALF) / T, 0, N - 1e-6);
  const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j, V = N + 1;
  const a = c.hv[j * V + i], b = c.hv[j * V + i + 1], d = c.hv[(j + 1) * V + i], e = c.hv[(j + 1) * V + i + 1];
  return fx + fy <= 1 ? a + (b - a) * fx + (d - a) * fy : e + (d - e) * (1 - fx) + (b - e) * (1 - fy);
}

export function isWaterAt(c, wx, wz) {
  const x = cellOf(wx), y = cellOf(wz);
  return inMap(x, y) && c.water[idx(x, y)] === 1;
}

// ───────────────────────── tạo thành phố ─────────────────────────

export function newCity(seed = (Math.random() * 1e9) | 0) {
  const c = {
    v: 4, seed, name: 'Phố Mới',
    water: new Uint8Array(N * N), tree: new Uint8Array(N * N),
    zone: new Uint8Array(N * N), level: new Uint8Array(N * N), variant: new Uint8Array(N * N), dir: new Uint8Array(N * N), district: new Uint8Array(N * N),
    nodes: new Map(), edges: new Map(), nextId: 1, lines: [],
    services: [], money: 70000, hour: 0, day: 0, tax: { r: 9, c: 9, i: 9 }, milestone: 0, loans: [], debtHours: 0, over: false,
    owned: startTiles(), tech: {}, points: 0, policy: DISTRICTS.map(() => ({})), distName: DISTRICTS.map((d) => (d ? d[0] : '')),
  };
  genLand(c);
  // đường cao tốc từ mép bắc bản đồ dẫn vào vùng đất của thành phố (cũng là cửa ngõ xuất nhập khẩu), chọn cột toàn đất liền
  const mid = OFF + ((LN * 0.55) | 0);
  let sx = mid;
  for (let k = 0; k < LN; k++) {
    const x = mid + (k % 2 ? -1 : 1) * ((k + 1) >> 1);
    if (x < OFF + 6 || x >= OFF + LN - 6) continue;
    let ok = true;
    for (let y = 0; y < OFF + 14; y++) for (let d = -4; d <= 4; d++) if (c.water[idx(x + d, y)]) ok = false;
    if (ok) { sx = x; break; }
  }
  c.start = { x: sx, y: OFF + 7 };
  c.entry = { x: cellCenter(sx), z: -HALF + 1 };
  attach(c);
  const a = addNode(c, c.entry.x, c.entry.z), b = addNode(c, cellCenter(sx), cellCenter(OFF + 7));
  addEdge(c, a, b, 'small');
  roadsChanged(c);
  computeMaps(c);
  return c;
}

/** Lúc đầu thành phố có 3 x 3 lô đất ở giữa bản đồ. */
function startTiles() {
  const o = new Uint8Array(TILES * TILES);
  for (let ty = 1; ty <= 3; ty++) for (let tx = 1; tx <= 3; tx++) o[ty * TILES + tx] = 1;
  return o;
}

function genLand(c) {
  const f = makeField(c.seed), seed = c.seed;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y), u = x - OFF, v = y - OFF;
    if (f(x + 0.5, y + 0.5) < 0.15) { c.water[i] = 1; continue; }
    const n = vnoise(u * 0.09, v * 0.09, seed + 11), h = hash2(u, v, seed + 13);
    if ((n > 0.6 && h > 0.25) || h > 0.975) c.tree[i] = 1;
    else if (outerMask(x, y) > 0.5 && vnoise(u * 0.04, v * 0.04, seed + 15) > 0.52 && h > 0.2) c.tree[i] = 1; // rừng rậm hơn ở vùng ngoài
  }
}

/** Gắn phần dữ liệu tính lại được (không lưu). */
function attach(c) {
  const mk = () => new Uint8Array(N * N), fl = () => new Float32Array(N * N);
  c.road = mk(); c.acc = mk(); c.rdir = mk(); c.cedge = new Int32Array(N * N).fill(-1);
  c.pOk = mk(); c.wOk = mk(); c.sOk = mk();
  c.age = new Uint16Array(N * N);
  c.occ = new Int16Array(N * N);
  c.landValue = fl().fill(30);
  c.pollution = fl(); c.air = fl(); c.ground = fl(); c.noise = fl(); c.waterPol = fl();
  c.cover = { park: fl(), police: fl(), fire: fl(), health: fl(), edu: fl(), trash: fl() };
  c.dirty = { roads: true, buildings: true, trees: true, zones: true, services: true, lines: true, transit: true, fx: true, land: true };
  c.events = [];
  c.stats = { pop: 0, jobs: 0, housing: 0, workers: 0, employed: 0, powerCap: 0, powerUse: 0, waterCap: 0, waterUse: 0, sewCap: 0, trashCap: 0, trashUse: 0, noPower: 0, noWater: 0, income: 0, expense: 0, roadLen: 0, happy: 55, exp: { roads: 0, power: 0, water: 0, trash: 0, park: 0, civic: 0, transit: 0, loans: 0 }, inc: { r: 0, c: 0, i: 0, t: 0 }, none: {}, tight: {} };
  c.demand = { r: 0.6, c: 0.2, i: 0.2, o: 0 };
  c.rng = mulberry32(c.seed ^ Math.imul(c.hour + 1, 2654435761));
  c.adj = new Map();
  c.clock = 0; c.hourSec = HOUR_SEC; c.day = Math.floor(c.hour / 24);
  c.hourInc = { r: 0, c: 0, i: 0 }; c.fareSeen = 0;
  if (!c.entry) c.entry = { x: cellCenter(c.start.x), z: -HALF + 1 };
  c.fn = { clearBuilding, cellHappy, taxAdj, hasPolicy, ownedAt };
  c.onArrive = onArrive;
  for (const s of c.services) if (!s.uid) s.uid = c.nextId++;
  initTraffic(c); initPeople(c); initTransit(c);
  makeTerrain(c);
  rebuildOcc(c);
  return c;
}

function rebuildOcc(c) {
  c.occ.fill(0);
  c.services.forEach((s, k) => {
    const sz = SERVICES[s.type].size;
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) c.occ[idx(s.x + dx, s.y + dy)] = k + 1;
  });
}

// ───────────────────────── graph đường ─────────────────────────

const bez = (ax, az, cx, cz, bx, bz, t) => { const u = 1 - t; return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * az + 2 * u * t * cz + t * t * bz]; };

function addNode(c, x, z) {
  const id = c.nextId++;
  c.nodes.set(id, { id, x, z });
  return id;
}

function sampleCurve(ax, az, cx, cz, bx, bz, step) {
  const approx = Math.hypot(cx - ax, cz - az) + Math.hypot(bx - cx, bz - cz);
  const n = clamp(Math.ceil(approx / step), 2, 96), pts = new Float32Array((n + 1) * 2);
  for (let k = 0; k <= n; k++) { const p = bez(ax, az, cx, cz, bx, bz, k / n); pts[k * 2] = p[0]; pts[k * 2 + 1] = p[1]; }
  return pts;
}

function measure(pts) {
  const n = pts.length / 2, cum = new Float32Array(n);
  for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]);
  return cum;
}

/** Thêm đoạn đường giữa hai nút; (cx, cz) là điểm điều khiển, bỏ trống = đường thẳng. */
function addEdge(c, a, b, type, cx, cz, elev = 0) {
  const A = c.nodes.get(a), B = c.nodes.get(b);
  if (cx == null) { cx = (A.x + B.x) / 2; cz = (A.z + B.z) / 2; }
  const e = { id: c.nextId++, a, b, type, cx, cz, elev: elev ? 1 : 0 };
  e.pts = sampleCurve(A.x, A.z, cx, cz, B.x, B.z, 4);
  e.cum = measure(e.pts); e.len = e.cum[e.cum.length - 1];
  c.edges.set(e.id, e);
  return e;
}

const edgePoint = (c, e, t) => { const A = c.nodes.get(e.a), B = c.nodes.get(e.b); return bez(A.x, A.z, e.cx, e.cz, B.x, B.z, t); };

/** Điểm điều khiển của đoạn con [t0, t1] trên một Bezier bậc 2. */
function subCtrl(ax, az, cx, cz, bx, bz, t0, t1) {
  const wa = (1 - t0) * (1 - t1), wc = t0 * (1 - t1) + t1 * (1 - t0), wb = t0 * t1;
  return [wa * ax + wc * cx + wb * bx, wa * az + wc * cz + wb * bz];
}

function rebuildAdj(c) {
  c.adj = new Map();
  for (const id of c.nodes.keys()) c.adj.set(id, []);
  for (const e of c.edges.values()) { c.adj.get(e.a).push(e.id); c.adj.get(e.b).push(e.id); }
}

function edgeBetween(c, n1, n2) {
  for (const e of c.edges.values()) if ((e.a === n1 && e.b === n2) || (e.a === n2 && e.b === n1)) return e;
  return null;
}

/** Đoạn đường dưới điểm (x, z), hoặc null. */
export function edgeAt(c, x, z, slack = 1) {
  let best = null, bd = Infinity;
  for (const e of c.edges.values()) {
    const r = nearestOnEdge(e, x, z), lim = ROADS[e.type].w / 2 + slack;
    if (r.d < lim && r.d < bd) { bd = r.d; best = e; }
  }
  return best;
}

/**
 * Bắt điểm khi vẽ đường: ưu tiên nút giao gần đó, rồi tới thân đường khác, rồi lưới ô.
 * Trả về { x, z, node?, edge?, t? }.
 */
export function snapPoint(c, x, z, { grid = true, type = 'small' } = {}) {
  let bn = null, bd = 9;
  for (const n of c.nodes.values()) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; bn = n; } }
  if (bn) return { x: bn.x, z: bn.z, node: bn.id };
  let be = null, br = null;
  for (const e of c.edges.values()) {
    const r = nearestOnEdge(e, x, z);
    if (edgeH(e, r.along) > 1) continue; // không nối vào giữa cầu vượt
    if (r.d < ROADS[e.type].w / 2 + 3 && (!br || r.d < br.d)) { br = r; be = e; }
  }
  if (be) {
    // gần đầu mút thì dùng luôn nút ở đầu đó
    if (br.t * be.len < 9) { const n = c.nodes.get(be.a); return { x: n.x, z: n.z, node: n.id }; }
    if ((1 - br.t) * be.len < 9) { const n = c.nodes.get(be.b); return { x: n.x, z: n.z, node: n.id }; }
    return { x: br.x, z: br.z, edge: be.id, t: br.t };
  }
  const lim = HALF - 2;
  if (grid) {
    if (ROADS[type].w > T) { x = Math.round((x + HALF) / T) * T - HALF; z = Math.round((z + HALF) / T) * T - HALF; } // đại lộ bám mép ô
    else { x = cellCenter(cellOf(x)); z = cellCenter(cellOf(z)); }
  }
  return { x: clamp(x, -lim, lim), z: clamp(z, -lim, lim) };
}

function segInt(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

/** Duyệt các ô bị một polyline rộng `half` đè lên (để chặn xây / dỡ nhà). */
function cellsUnder(pts, half, fn) {
  const n = pts.length / 2 - 1, seen = new Set();
  for (let k = 0; k < n; k++) {
    const x0 = pts[k * 2], z0 = pts[k * 2 + 1], x1 = pts[k * 2 + 2], z1 = pts[k * 2 + 3];
    const l = Math.hypot(x1 - x0, z1 - z0) || 1, ext = 5 * (Math.abs((z1 - z0) / l) + Math.abs((x1 - x0) / l)), lim = half + ext - 0.6;
    const cx0 = Math.max(0, cellOf(Math.min(x0, x1) - lim)), cx1 = Math.min(N - 1, cellOf(Math.max(x0, x1) + lim));
    const cy0 = Math.max(0, cellOf(Math.min(z0, z1) - lim)), cy1 = Math.min(N - 1, cellOf(Math.max(z0, z1) + lim));
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
      const i = idx(x, y);
      if (seen.has(i)) continue;
      if (distSeg(cellCenter(x), cellCenter(y), x0, z0, x1, z1).d < lim) { seen.add(i); fn(i); }
    }
  }
}

function pathCost(c, pts, perUnit, elev = false) {
  let cost = 0;
  const n = pts.length / 2 - 1;
  for (let k = 0; k < n; k++) {
    const l = Math.hypot(pts[k * 2 + 2] - pts[k * 2], pts[k * 2 + 3] - pts[k * 2 + 1]);
    const water = isWaterAt(c, (pts[k * 2] + pts[k * 2 + 2]) / 2, (pts[k * 2 + 1] + pts[k * 2 + 3]) / 2);
    cost += l * perUnit * (elev ? Math.max(ELEV_MULT, water ? BRIDGE_MULT : 1) : water ? BRIDGE_MULT : 1);
  }
  return Math.round(cost);
}

/**
 * Tính trước một đoạn đường sắp vẽ: a, b là kết quả snapPoint; ctrl = điểm điều khiển (đường cong) hoặc null.
 * Tự tìm chỗ cắt đường khác để tạo nút giao. Trả về { ok, reason, cost, pts, len, stops, ... }.
 */
export function planRoad(c, { a, b, ctrl = null, type = 'small', elev = false }) {
  const def = ROADS[type];
  if (!def) return { ok: false, reason: 'Không có loại đường này' };
  const fix = (s) => {
    if (s.node != null && c.nodes.has(s.node)) { const n = c.nodes.get(s.node); return { x: n.x, z: n.z, node: s.node }; }
    if (s.edge != null && c.edges.has(s.edge)) return { x: s.x, z: s.z, edge: s.edge, te: s.t };
    return { x: s.x, z: s.z };
  };
  const A = fix(a), B = fix(b);
  const cx = ctrl ? ctrl.x : (A.x + B.x) / 2, cz = ctrl ? ctrl.z : (A.z + B.z) / 2;
  const pts = sampleCurve(A.x, A.z, cx, cz, B.x, B.z, 2.5), n = pts.length / 2 - 1, cum = measure(pts), len = cum[n];
  const out = { ok: false, pts, len, type, cost: 0, A, B, cx, cz, elev: !!elev };
  const myH = (k) => (elev ? deckH(len, cum[k]) : 0);
  if (len < 8 || (A.node != null && A.node === B.node)) return { ...out, reason: 'Đoạn quá ngắn' };
  for (let k = 0; k <= n; k++) if (Math.abs(pts[k * 2]) > HALF - 1 || Math.abs(pts[k * 2 + 1]) > HALF - 1) return { ...out, reason: 'Ra ngoài bản đồ' };
  for (let k = 0; k <= n; k++) if (!ownedAt(c, pts[k * 2], pts[k * 2 + 1])) return { ...out, reason: 'Ngoài phần đất của thành phố, hãy mua thêm đất' };
  if (elev && len < MIN_ELEV_LEN) return { ...out, reason: `Cầu vượt cần dài ít nhất ${MIN_ELEV_LEN / T} ô để đủ dốc lên xuống` };
  out.cost = pathCost(c, pts, def.cost, elev);

  const stops = [{ t: 0, ...A }, { t: 1, ...B }];
  const touches = (s, e) => s.edge === e.id || s.node === e.a || s.node === e.b;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k <= n; k++) { minX = Math.min(minX, pts[k * 2]); maxX = Math.max(maxX, pts[k * 2]); minZ = Math.min(minZ, pts[k * 2 + 1]); maxZ = Math.max(maxZ, pts[k * 2 + 1]); }
  for (const e of c.edges.values()) {
    const q = e.pts, m = q.length / 2 - 1, Na = c.nodes.get(e.a), Nb = c.nodes.get(e.b);
    let ex0 = Infinity, ex1 = -Infinity, ez0 = Infinity, ez1 = -Infinity;
    for (let j = 0; j <= m; j++) { ex0 = Math.min(ex0, q[j * 2]); ex1 = Math.max(ex1, q[j * 2]); ez0 = Math.min(ez0, q[j * 2 + 1]); ez1 = Math.max(ez1, q[j * 2 + 1]); }
    if (ex0 > maxX || ex1 < minX || ez0 > maxZ || ez1 < minZ) continue;
    const found = [];
    for (let k = 0; k < n; k++) for (let j = 0; j < m; j++) {
      const r = segInt(pts[k * 2], pts[k * 2 + 1], pts[k * 2 + 2], pts[k * 2 + 3], q[j * 2], q[j * 2 + 1], q[j * 2 + 2], q[j * 2 + 3]);
      if (!r) continue;
      const x = pts[k * 2] + (pts[k * 2 + 2] - pts[k * 2]) * r.t, z = pts[k * 2 + 1] + (pts[k * 2 + 3] - pts[k * 2 + 1]) * r.t, te = (j + r.u) / m;
      if ((Math.hypot(x - A.x, z - A.z) < 9 && touches(A, e)) || (Math.hypot(x - B.x, z - B.z) < 9 && touches(B, e))) continue;
      // khác tầng: cầu vượt đi qua trên đầu, không có nút giao
      const h1 = elev ? deckH(len, cum[k] + (cum[k + 1] - cum[k]) * r.t) : 0, h2 = edgeH(e, e.cum[j] + (e.cum[j + 1] - e.cum[j]) * r.u);
      if (Math.abs(h1 - h2) > 3.5) continue;
      if (Math.max(h1, h2) > 0.6) return { ...out, reason: h1 > 3.5 && h2 > 3.5 ? 'Hai cầu vượt không cắt nhau giữa không trung được' : 'Dốc cầu vượt không được cắt ngang đường khác' };
      if (found.some((o) => Math.abs(o.te - te) * e.len < 6)) continue;
      found.push({ te });
      const tn = (k + r.t) / n;
      if (Math.hypot(x - Na.x, z - Na.z) < 9) stops.push({ t: tn, x: Na.x, z: Na.z, node: e.a });
      else if (Math.hypot(x - Nb.x, z - Nb.z) < 9) stops.push({ t: tn, x: Nb.x, z: Nb.z, node: e.b });
      else stops.push({ t: tn, x, z, edge: e.id, te });
    }
  }
  stops.sort((p, q) => p.t - q.t);
  // bỏ điểm dừng trùng nút liền nhau
  const uniq = [];
  for (const s of stops) { const last = uniq[uniq.length - 1]; if (last && s.node != null && last.node === s.node) continue; uniq.push(s); }
  out.stops = uniq;
  if (uniq.length < 2) return { ...out, reason: 'Đoạn quá ngắn' };

  // chạy trùng / song song sát đường khác, hoặc cắt góc quá hẹp
  let over = 0;
  for (let k = 1; k < n; k++) {
    const x = pts[k * 2], z = pts[k * 2 + 1];
    let near = Infinity;
    for (const s of uniq) near = Math.min(near, Math.hypot(s.x - x, s.z - z));
    if (near < 14) continue;
    // tim đường gần như trùng nhau, hoặc ở xa chỗ giao mà hai mặt đường vẫn đè lên nhau
    for (const e of c.edges.values()) {
      const r = nearestOnEdge(e, x, z), d = r.d;
      if (Math.abs(myH(k) - edgeH(e, r.along)) > 3.5) continue; // khác tầng thì không tính là đè lên nhau
      if (d < 4 || (near > 40 && d < (ROADS[e.type].w + def.w) / 2 - 1)) { over += cum[k] - cum[k - 1]; break; }
    }
  }
  if (over > 7) return { ...out, reason: 'Trùng hoặc quá sát đường khác' };
  let blocked = false;
  cellsUnder(pts, def.w / 2, (i) => { if (c.occ[i]) blocked = true; });
  if (blocked) return { ...out, reason: 'Vướng công trình, hãy san ủi trước' };
  if (out.cost > c.money) return { ...out, reason: 'Không đủ tiền' };
  return { ...out, ok: true };
}

/** Cắt một đoạn đường tại các tham số ts, trả về id nút tương ứng từng t. */
function splitEdge(c, e, ts) {
  const A = c.nodes.get(e.a), B = c.nodes.get(e.b);
  const order = ts.map((t, k) => ({ t, k })).sort((p, q) => p.t - q.t), res = new Array(ts.length);
  const chain = [{ t: 0, node: e.a }];
  for (const o of order) {
    const last = chain[chain.length - 1];
    if (o.t * e.len < 5) { res[o.k] = e.a; continue; }
    if ((1 - o.t) * e.len < 5) { res[o.k] = e.b; continue; }
    if (last.t > 0 && (o.t - last.t) * e.len < 5) { res[o.k] = last.node; continue; }
    const p = bez(A.x, A.z, e.cx, e.cz, B.x, B.z, o.t), id = addNode(c, p[0], p[1]);
    chain.push({ t: o.t, node: id }); res[o.k] = id;
  }
  chain.push({ t: 1, node: e.b });
  if (chain.length > 2) {
    c.edges.delete(e.id);
    for (let k = 0; k + 1 < chain.length; k++) {
      const m = subCtrl(A.x, A.z, e.cx, e.cz, B.x, B.z, chain[k].t, chain[k + 1].t);
      addEdge(c, chain[k].node, chain[k + 1].node, e.type, m[0], m[1], e.elev);
    }
  }
  return res;
}

export function buildRoad(c, spec) {
  const plan = planRoad(c, spec);
  if (!plan.ok) return plan;
  const { stops, A, B, cx, cz, type, elev } = plan;
  const byEdge = new Map();
  for (const s of stops) if (s.node == null && s.edge != null) { if (!byEdge.has(s.edge)) byEdge.set(s.edge, []); byEdge.get(s.edge).push(s); }
  for (const [eid, list] of byEdge) {
    const ids = splitEdge(c, c.edges.get(eid), list.map((s) => s.te));
    list.forEach((s, k) => { s.node = ids[k]; });
  }
  for (const s of stops) if (s.node == null) s.node = addNode(c, s.x, s.z);
  let made = 0;
  for (let k = 0; k + 1 < stops.length; k++) {
    const p = stops[k], q = stops[k + 1];
    if (p.node === q.node || edgeBetween(c, p.node, q.node)) continue;
    const m = subCtrl(A.x, A.z, cx, cz, B.x, B.z, p.t, q.t);
    addEdge(c, p.node, q.node, type, m[0], m[1], elev);
    made++;
  }
  if (!made) return { ...plan, ok: false, reason: 'Đã có đường ở đây' };
  c.money -= plan.cost;
  roadsChanged(c);
  return { ...plan, endNode: stops[stops.length - 1].node };
}

/** Giá nâng cấp / đổi loại một đoạn đường (đảo chiều đường một chiều thì miễn phí). */
export function upgradeCost(e, type) {
  return e.type === type ? 0 : Math.round(e.len * Math.max(1, ROADS[type].cost - ROADS[e.type].cost * 0.5));
}

export function upgradeRoad(c, edgeId, type) {
  const e = c.edges.get(edgeId);
  if (!e || !ROADS[type]) return { ok: false, reason: 'Không có đường ở đây' };
  if (e.type === type) {
    if (type !== 'oneway') return { ok: false, reason: 'Đường đã là loại này' };
    const t = e.a; e.a = e.b; e.b = t; // đảo chiều
    const p = e.pts, n = p.length / 2;
    for (let k = 0; k < n >> 1; k++) for (const o of [0, 1]) { const u = p[k * 2 + o]; p[k * 2 + o] = p[(n - 1 - k) * 2 + o]; p[(n - 1 - k) * 2 + o] = u; }
    e.cum = measure(p);
    roadsChanged(c);
    return { ok: true, cost: 0, flipped: true };
  }
  const cost = upgradeCost(e, type);
  if (cost > c.money) return { ok: false, reason: 'Không đủ tiền' };
  let blocked = false;
  cellsUnder(e.pts, ROADS[type].w / 2, (i) => { if (c.occ[i]) blocked = true; });
  if (blocked) return { ok: false, reason: 'Vướng công trình, hãy san ủi trước' };
  e.type = type; c.money -= cost;
  roadsChanged(c);
  return { ok: true, cost };
}

export function removeRoad(c, edgeId) {
  if (!c.edges.delete(edgeId)) return { ok: false };
  roadsChanged(c);
  return { ok: true };
}

/** Gọi sau mọi thay đổi của graph đường. */
function roadsChanged(c) {
  rebuildAdj(c);
  for (const [id, list] of c.adj) if (!list.length) { c.nodes.delete(id); c.adj.delete(id); }
  rebuildRoadCells(c);
  markEdges(c);
  computeNetworks(c);
  rebuildTraffic(c);
  maintainTransit(c);
  recalc(c);
  c.dirty.roads = c.dirty.zones = c.dirty.buildings = c.dirty.trees = c.dirty.transit = true;
}

/**
 * Chiếu graph đường xuống lưới ô: ô bị đường đè (road), ô quy hoạch tự sinh hai bên đường
 * (acc = 1 hàng sát đường, 2 hàng thứ hai), hướng quay mặt ra đường (rdir), đoạn đường phục vụ ô (cedge).
 */
function rebuildRoadCells(c) {
  const minD = new Float32Array(N * N).fill(1e9);
  c.road.fill(0); c.cedge.fill(-1);
  for (const e of c.edges.values()) {
    const half = ROADS[e.type].w / 2, p = e.pts, n = p.length / 2 - 1, reach = half + 26;
    for (let k = 0; k < n; k++) {
      const x0 = p[k * 2], z0 = p[k * 2 + 1], x1 = p[k * 2 + 2], z1 = p[k * 2 + 3];
      const high = e.elev && Math.min(deckH(e.len, e.cum[k]), deckH(e.len, e.cum[k + 1])) > 1.5; // đoạn đang ở trên cao: chặn xây bên dưới nhưng nhà không ra vào được
      const l = Math.hypot(x1 - x0, z1 - z0) || 1, ext = 5 * (Math.abs((z1 - z0) / l) + Math.abs((x1 - x0) / l));
      const cx0 = Math.max(0, cellOf(Math.min(x0, x1) - reach)), cx1 = Math.min(N - 1, cellOf(Math.max(x0, x1) + reach));
      const cy0 = Math.max(0, cellOf(Math.min(z0, z1) - reach)), cy1 = Math.min(N - 1, cellOf(Math.max(z0, z1) + reach));
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
        const px = cellCenter(x), pz = cellCenter(y), r = distSeg(px, pz, x0, z0, x1, z1), i = idx(x, y);
        if (r.d < half + ext - 0.6) c.road[i] = 1;
        if (high) continue;
        const dd = r.d - half;
        if (dd < minD[i]) {
          minD[i] = dd; c.cedge[i] = e.id;
          const dx = r.x - px, dz = r.z - pz;
          c.rdir[i] = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 2) : dz >= 0 ? 1 : 3;
        }
      }
    }
  }
  for (let i = 0; i < N * N; i++) {
    c.acc[i] = c.road[i] || c.water[i] ? 0 : minD[i] < 10.5 ? 1 : minD[i] < 20.5 ? 2 : 0;
    if (!c.acc[i] && !c.road[i]) c.cedge[i] = -1;
    if (c.road[i]) {
      clearBuilding(c, i);
      c.zone[i] = 0; c.tree[i] = 0;
    } else if (!c.acc[i] && c.zone[i] && !c.level[i]) c.zone[i] = 0;
  }
}

/** Hướng (0..3: đông, nam, tây, bắc) quay ra đường của ô, -1 nếu ô không nằm cạnh đường. */
export function roadDir(c, x, y) {
  const i = idx(x, y);
  return inMap(x, y) && c.acc[i] ? c.rdir[i] : -1;
}

// ───────────────────────── dây điện, ống nước ─────────────────────────

function serviceAt(c, x, z, slack = 0) {
  for (let k = 0; k < c.services.length; k++) {
    const s = c.services[k], sz = SERVICES[s.type].size * T, x0 = s.x * T - HALF, z0 = s.y * T - HALF;
    if (x >= x0 - slack && x <= x0 + sz + slack && z >= z0 - slack && z <= z0 + sz + slack) return k;
  }
  return -1;
}

export function planLine(c, kind, a, b) {
  const def = LINES[kind], len = Math.hypot(b.x - a.x, b.z - a.z);
  const cost = Math.round(len * def.cost);
  if (len < 8) return { ok: false, reason: 'Đoạn quá ngắn', cost, len };
  if (Math.max(Math.abs(a.x), Math.abs(a.z), Math.abs(b.x), Math.abs(b.z)) > HALF) return { ok: false, reason: 'Ra ngoài bản đồ', cost, len };
  if (!ownedAt(c, a.x, a.z) || !ownedAt(c, b.x, b.z)) return { ok: false, reason: 'Ngoài phần đất của thành phố, hãy mua thêm đất', cost, len };
  if (cost > c.money) return { ok: false, reason: 'Không đủ tiền', cost, len };
  return { ok: true, cost, len };
}

export function buildLine(c, kind, a, b) {
  const r = planLine(c, kind, a, b);
  if (!r.ok) return r;
  c.lines.push({ kind, ax: a.x, az: a.z, bx: b.x, bz: b.z });
  c.money -= r.cost;
  c.dirty.lines = true;
  computeNetworks(c); recalc(c);
  return r;
}

/**
 * Mạng điện và mạng nước: đường tự dẫn điện + ống ngầm; dây điện / ống nước nối thêm chỗ xa đường.
 * Mỗi cụm liên thông có nguồn cung và nhu cầu riêng → cờ theo ô: 1 đủ, 2 thiếu, 0 không có.
 */
export function computeNetworks(c) {
  const eIds = [...c.edges.keys()], eIx = new Map(eIds.map((id, k) => [id, k]));
  const E = eIds.length, S = c.services.length, L = c.lines.length, total = E + S + L;
  const mkUF = () => { const p = new Int32Array(total); for (let k = 0; k < total; k++) p[k] = k; return p; };
  const find = (p, a) => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
  const union = (p, a, b) => { a = find(p, a); b = find(p, b); if (a !== b) p[a] = b; };
  const P = mkUF(), W = mkUF();
  for (const list of c.adj.values()) for (let k = 1; k < list.length; k++) { union(P, eIx.get(list[0]), eIx.get(list[k])); union(W, eIx.get(list[0]), eIx.get(list[k])); }
  c.services.forEach((s, k) => {
    const sz = SERVICES[s.type].size;
    let best = -1, rank = 9;
    s.cell = -1; // ô của công trình nằm sát đường nhất: cửa ra vào cho xe dịch vụ
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) { const i = idx(s.x + dx, s.y + dy); if (c.acc[i] && c.cedge[i] >= 0 && c.acc[i] < rank) { rank = c.acc[i]; best = c.cedge[i]; s.cell = i; } }
    s.linked = best >= 0;
    if (best >= 0) { union(P, E + k, eIx.get(best)); union(W, E + k, eIx.get(best)); }
  });
  c.lines.forEach((ln, k) => {
    const U = ln.kind === 'power' ? P : W, me = E + S + k;
    for (const [x, z] of [[ln.ax, ln.az], [ln.bx, ln.bz]]) {
      const sv = serviceAt(c, x, z, 4);
      if (sv >= 0) { union(U, me, E + sv); c.services[sv].linked = true; }
      const e = edgeAt(c, x, z, 7);
      if (e) union(U, me, eIx.get(e.id));
      c.lines.forEach((o, j) => { if (j !== k && o.kind === ln.kind && distSeg(x, z, o.ax, o.az, o.bx, o.bz).d < 4) union(U, me, E + S + j); });
    }
  });
  const pSup = new Float64Array(total), pUse = new Float64Array(total), wSup = new Float64Array(total), wUse = new Float64Array(total), sSup = new Float64Array(total);
  c.services.forEach((s, k) => {
    const d = SERVICES[s.type];
    if (d.power) pSup[find(P, E + k)] += svcVal(c, s, 'power');
    if (d.water) wSup[find(W, E + k)] += svcVal(c, s, 'water');
    if (d.sewage) sSup[find(W, E + k)] += svcVal(c, s, 'sewage');
  });
  const rootP = new Int32Array(N * N).fill(-1), rootW = new Int32Array(N * N).fill(-1);
  const pm = hasTech(c, 'grid') ? 0.85 : 1, wm = hasTech(c, 'reuse') ? 0.8 : 1;
  for (let i = 0; i < N * N; i++) {
    if (c.cedge[i] < 0 || !c.acc[i]) continue;
    const k = eIx.get(c.cedge[i]);
    rootP[i] = find(P, k); rootW[i] = find(W, k);
    const L2 = c.level[i];
    if (L2) { const u = utilUse(c.zone[i], L2); pUse[rootP[i]] += u * pm; wUse[rootW[i]] += u * wm; }
  }
  const flag = (sup, use) => (sup <= 0 ? 0 : use > sup ? 2 : 1);
  let noP = 0, noW = 0;
  for (let i = 0; i < N * N; i++) {
    if (rootP[i] < 0) { c.pOk[i] = c.wOk[i] = c.sOk[i] = 0; continue; }
    c.pOk[i] = flag(pSup[rootP[i]], pUse[rootP[i]]);
    c.wOk[i] = flag(wSup[rootW[i]], wUse[rootW[i]]);
    c.sOk[i] = flag(sSup[rootW[i]], wUse[rootW[i]]);
    if (c.level[i]) { if (c.pOk[i] !== 1) noP++; if (c.wOk[i] !== 1 || c.sOk[i] !== 1) noW++; }
  }
  // tình trạng theo các ô đã quy hoạch: none = mạng không có nguồn, tight = hết công suất dư
  const none = { p: false, w: false, s: false }, tight = { p: false, w: false, s: false };
  for (let i = 0; i < N * N; i++) {
    if (!c.zone[i] || rootP[i] < 0) continue;
    const rp = rootP[i], rw = rootW[i];
    if (pSup[rp] <= 0) none.p = true; else if (pSup[rp] - pUse[rp] < 3) tight.p = true;
    if (wSup[rw] <= 0) none.w = true; else if (wSup[rw] - wUse[rw] < 3) tight.w = true;
    if (sSup[rw] <= 0) none.s = true; else if (sSup[rw] - wUse[rw] < 3) tight.s = true;
  }
  c.stats.none = none; c.stats.tight = tight;
  // còn dư công suất cho nhà mới?
  c.room = (i, need = 3) => rootP[i] >= 0 && pSup[rootP[i]] - pUse[rootP[i]] >= need && wSup[rootW[i]] - wUse[rootW[i]] >= need && sSup[rootW[i]] - wUse[rootW[i]] >= need;
  c.stats.noPower = noP; c.stats.noWater = noW;
}

// ───────────────────────── đất đai, quận, công nghệ, phần mở rộng ─────────────────────────

const tileOf = (x, y) => ((y / TILE) | 0) * TILES + ((x / TILE) | 0);
export const ownedCell = (c, i) => c.owned[tileOf(i % N, (i / N) | 0)] === 1;
export function ownedAt(c, wx, wz) { const x = cellOf(wx), y = cellOf(wz); return inMap(x, y) && c.owned[tileOf(x, y)] === 1; }
/** Số lô đất tối đa được sở hữu ở mốc dân số hiện tại, và giá lô kế tiếp. */
export const maxTiles = (c) => Math.min(TILES * TILES, 10 + c.milestone * 3);
export function tileCost(c) { let n = 0; for (const o of c.owned) n += o; return 6000 + (n - 9) * 3000; }

export function canBuyTile(c, t) {
  if (!(t >= 0 && t < TILES * TILES)) return { ok: false, reason: 'Ngoài bản đồ' };
  if (c.owned[t]) return { ok: false, reason: 'Lô này đã là của thành phố' };
  const tx = t % TILES, ty = (t / TILES) | 0, cost = tileCost(c);
  let near = false, n = 0;
  for (const o of c.owned) n += o;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = tx + dx, b = ty + dy; if (a >= 0 && b >= 0 && a < TILES && b < TILES && c.owned[b * TILES + a]) near = true; }
  if (!near) return { ok: false, reason: 'Chỉ mua được lô liền kề đất đang có', cost };
  if (n >= maxTiles(c)) return { ok: false, reason: 'Cần đạt mốc dân số tiếp theo để mua thêm đất', cost };
  if (cost > c.money) return { ok: false, reason: 'Không đủ tiền', cost };
  return { ok: true, cost };
}

export function buyTile(c, t) {
  const r = canBuyTile(c, t);
  if (!r.ok) return r;
  c.owned[t] = 1; c.money -= r.cost;
  c.dirty.land = c.dirty.zones = true;
  return r;
}

/** Gán các ô trong hình chữ nhật vào quận d (0 = bỏ khỏi quận). */
export function districtRect(c, x0, y0, x1, y1, d) {
  if (!(d >= 0 && d < DISTRICTS.length)) return { ok: false };
  let n = 0;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (c.water[i] || !ownedCell(c, i) || c.district[i] === d) continue;
    c.district[i] = d; n++;
  }
  if (n) { markEdges(c); computeMaps(c); recalc(c); c.dirty.zones = true; }
  return { ok: n > 0, count: n };
}

export const hasPolicy = (c, i, key) => { const d = c.district[i]; return d > 0 && !!c.policy[d][key]; };
/** Điểm thuế cộng / trừ của quận chứa ô i. */
export const taxAdj = (c, i) => { const d = c.district[i]; return d ? (c.policy[d].lowTax ? -3 : c.policy[d].highTax ? 3 : 0) : 0; };

export function setPolicy(c, d, key, on) {
  if (!(d > 0 && d < DISTRICTS.length) || !POLICIES[key]) return { ok: false };
  if (on) { c.policy[d][key] = 1; if (POLICIES[key].not) delete c.policy[d][POLICIES[key].not]; } else delete c.policy[d][key];
  markEdges(c); computeMaps(c); recalc(c); c.dirty.zones = true;
  return { ok: true };
}

/** Đánh dấu đoạn đường nằm trong quận cấm xe tải. */
function markEdges(c) {
  for (const e of c.edges.values()) {
    const k = (e.pts.length >> 2) << 1, x = cellOf(e.pts[k]), y = cellOf(e.pts[k + 1]);
    e.noTruck = inMap(x, y) && hasPolicy(c, idx(x, y), 'noTruck');
  }
}

export function canResearch(c, id) {
  const t = TECH[id];
  if (!t) return { ok: false, reason: 'Không có công nghệ này' };
  if (c.tech[id]) return { ok: false, reason: 'Đã có' };
  if (t.req && !c.tech[t.req]) return { ok: false, reason: `Cần "${TECH[t.req].name}" trước` };
  if (c.points < t.cost) return { ok: false, reason: `Cần ${t.cost} điểm phát triển` };
  return { ok: true };
}

export function research(c, id) {
  const r = canResearch(c, id);
  if (!r.ok) return r;
  c.points -= TECH[id].cost; c.tech[id] = 1;
  computeMaps(c); computeNetworks(c); recalc(c);
  return r;
}

/** Điều kiện mở khoá công trình biểu tượng. */
export function landmarkOk(c, type) {
  const ps = c.pstats;
  if (type === 'tvtower') return ps.pop >= 3000 && ps.happy >= 55;
  if (type === 'museum') return ps.edu[3] >= 150;
  if (type === 'nightmarket') return (ps.shops || 0) >= 40;
  if (type === 'monument') return c.econ.exports >= 3000;
  return true;
}

/** Gắn thêm một phần mở rộng vào công trình thứ k. */
export function addModule(c, k, modId) {
  const s = c.services[k], m = s && (MODS[s.type] || []).find((x) => x.id === modId);
  if (!m) return { ok: false, reason: 'Công trình này không mở rộng kiểu đó được' };
  s.mods = s.mods || {};
  if ((s.mods[modId] || 0) >= m.max) return { ok: false, reason: 'Đã mở rộng tối đa' };
  if (m.cost > c.money) return { ok: false, reason: 'Không đủ tiền' };
  s.mods[modId] = (s.mods[modId] || 0) + 1; c.money -= m.cost;
  c.dirty.services = true;
  computeMaps(c); computeNetworks(c); recalc(c);
  return { ok: true, cost: m.cost };
}

/** Ô i có hợp với loại khu z không (khu khai thác cần đúng tài nguyên). */
export function zoneFits(c, z, i) {
  const need = ZDEF[z].need;
  if (!need) return true;
  const x = i % N, y = (i / N) | 0;
  if (need === 'fertile') return c.res[i] === 1;
  if (need === 'ore') return c.res[i] === 2;
  if (need === 'oil') return c.res[i] === 3;
  let hit = false;
  for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (inMap(a, b) && (need === 'forest' ? c.tree[idx(a, b)] : c.water[idx(a, b)])) { hit = true; break; } }
  return hit;
}

// ───────────────────────── quy hoạch, công trình, san ủi ─────────────────────────

function clearBuilding(c, i) {
  if (!c.level[i]) return;
  c.level[i] = 0; c.age[i] = 0; c.dirty.buildings = true;
  onBuildingCleared(c, i);
}

const unlockedAt = (c, need) => !need || MILESTONES.some((m, k) => k < c.milestone && m.pop >= need);
export const zoneUnlocked = (c, z) => unlockedAt(c, ZDEF[z].unlock);
export const isUnlocked = (c, type) => { const d = SERVICES[type]; return d.tech ? hasTech(c, d.tech) : d.landmark ? landmarkOk(c, type) : unlockedAt(c, d.unlock); };

/** Tô quy hoạch: chỉ ô quy hoạch tự sinh cạnh đường (acc > 0) mới nhận. z = 0 là bỏ quy hoạch. */
export function zoneRect(c, x0, y0, x1, y1, z) {
  if (!ZDEF[z]) return { ok: false, reason: 'Không có loại khu này' };
  if (!zoneUnlocked(c, z)) return { ok: false, reason: `${ZDEF[z].name} mở khoá khi đạt ${ZDEF[z].unlock} dân` };
  let n = 0;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (c.water[i] || c.road[i] || c.occ[i] || c.zone[i] === z || !ownedCell(c, i)) continue;
    if (z !== 0 && (!c.acc[i] || c.steep[i] || !zoneFits(c, z, i))) continue;
    if (c.level[i]) { if (z !== 0) continue; clearBuilding(c, i); } // chỉ "bỏ quy hoạch" mới dỡ nhà
    c.zone[i] = z; n++;
  }
  if (n) { c.dirty.zones = true; computeNetworks(c); recalc(c); }
  return { ok: n > 0, count: n, reason: n ? '' : ZDEF[z].need ? `${ZDEF[z].name} chỉ tô được trên ô cạnh đường có đúng tài nguyên (xem lớp 🗺️ tài nguyên)` : 'Chỉ quy hoạch được ô nằm cạnh đường (tối đa 2 ô), không quá dốc' };
}

export function bulldozeRect(c, x0, y0, x1, y1) {
  let n = 0;
  const kill = new Set(), roads = new Set();
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (c.occ[i]) { kill.add(c.occ[i] - 1); continue; }
    if (c.road[i] || c.water[i]) {
      // ô có cả đường dưới đất lẫn cầu vượt bên trên: chỉ phá đường dưới đất (muốn phá cầu thì san ủi ở chân cầu)
      const hit = [];
      for (const e of c.edges.values()) { const r = nearestOnEdge(e, cellCenter(x), cellCenter(y)); if (r.d < ROADS[e.type].w / 2 + 4.4) hit.push([e, edgeH(e, r.along)]); }
      const ground = hit.some(([, h]) => h < 3);
      for (const [e, h] of hit) if (!ground || h < 3) roads.add(e.id);
    }
    if (c.level[i]) { clearBuilding(c, i); n++; }
    if (c.tree[i]) { c.tree[i] = 0; n++; c.dirty.trees = true; }
  }
  const wx0 = ax * T - HALF, wx1 = (bx + 1) * T - HALF, wz0 = ay * T - HALF, wz1 = (by + 1) * T - HALF;
  const before = c.lines.length;
  c.lines = c.lines.filter((ln) => {
    for (let k = 0; k <= 24; k++) { const x = ln.ax + ((ln.bx - ln.ax) * k) / 24, z = ln.az + ((ln.bz - ln.az) * k) / 24; if (x >= wx0 && x <= wx1 && z >= wz0 && z <= wz1) return false; }
    return true;
  });
  if (c.lines.length !== before) { n += before - c.lines.length; c.dirty.lines = true; }
  if (kill.size) {
    c.services = c.services.filter((_, k) => !kill.has(k));
    rebuildOcc(c); c.dirty.services = true; n += kill.size;
    computeMaps(c);
  }
  for (const id of roads) { c.edges.delete(id); n++; }
  if (roads.size) roadsChanged(c);
  else if (n) { computeNetworks(c); recalc(c); }
  return { ok: n > 0, count: n };
}

export function footprint(type, x, y) {
  const sz = SERVICES[type].size, h = (sz - 1) >> 1;
  return { x: x - h, y: y - h, size: sz };
}

/** Kiểm tra đặt công trình, (x, y) là ô dưới con trỏ. */
export function canPlace(c, type, x, y, { move = false } = {}) {
  const def = SERVICES[type];
  if (!def) return { ok: false, reason: 'Không có công trình này' };
  const fp = footprint(type, x, y);
  let nearWater = false, nearRoad = false;
  for (let dy = -1; dy <= fp.size; dy++) for (let dx = -1; dx <= fp.size; dx++) {
    const a = fp.x + dx, b = fp.y + dy;
    const inside = dx >= 0 && dy >= 0 && dx < fp.size && dy < fp.size;
    if (!inMap(a, b)) { if (inside) return { ok: false, reason: 'Ra ngoài bản đồ', fp }; continue; }
    const i = idx(a, b);
    if (inside) {
      if (!ownedCell(c, i)) return { ok: false, reason: 'Ngoài phần đất của thành phố, hãy mua thêm đất', fp };
      if (c.water[i]) return { ok: false, reason: 'Không xây được trên nước', fp };
      if (c.steep[i]) return { ok: false, reason: 'Đất quá dốc', fp };
      if (c.road[i]) return { ok: false, reason: 'Đang có đường', fp };
      if (c.occ[i]) return { ok: false, reason: 'Đang có công trình khác', fp };
      if (c.acc[i] === 1) nearRoad = true;
    } else if (c.water[i]) nearWater = true;
  }
  if (def.needWater && !nearWater) return { ok: false, reason: 'Phải đặt sát bờ nước', fp };
  if (def.road && !nearRoad) return { ok: false, reason: 'Phải đặt sát đường', fp };
  if (move) return { ok: true, fp }; // dời công trình đã có: không xét mở khoá, phí trả riêng
  if (!isUnlocked(c, type)) return { ok: false, reason: def.tech ? `Cần công nghệ "${TECH[def.tech].name}"` : def.landmark ? `Mở khoá khi: ${def.landmark}` : `Mở khoá khi đạt ${def.unlock} dân`, fp };
  if (def.cost > c.money) return { ok: false, reason: 'Không đủ tiền', fp };
  return { ok: true, fp };
}

export function placeService(c, type, x, y) {
  const r = canPlace(c, type, x, y);
  if (!r.ok) return r;
  const { fp } = r;
  // quay mặt ra đường: hướng được nhiều ô sát đường chọn nhất
  const votes = [0, 0, 0, 0];
  for (let dy = 0; dy < fp.size; dy++) for (let dx = 0; dx < fp.size; dx++) {
    const i = idx(fp.x + dx, fp.y + dy);
    if (c.acc[i] === 1) votes[c.rdir[i]]++;
    c.zone[i] = 0; c.tree[i] = 0; clearBuilding(c, i);
  }
  const dir = Math.max(...votes) ? votes.indexOf(Math.max(...votes)) : 1;
  c.services.push({ type, x: fp.x, y: fp.y, dir, uid: c.nextId++ });
  c.money -= SERVICES[type].cost;
  rebuildOcc(c);
  c.dirty.services = c.dirty.zones = c.dirty.trees = c.dirty.buildings = true;
  computeMaps(c); computeNetworks(c); recalc(c);
  return { ok: true, cost: SERVICES[type].cost, linked: c.services[c.services.length - 1].linked };
}

// ───────────────────────── di chuyển ─────────────────────────

/** Phí dời một công trình: 10% giá xây. */
export const moveFee = (type) => Math.round(SERVICES[type].cost * 0.1);

/** Thử dời công trình thứ k tới ô (x, y) — dry: chỉ kiểm tra. Giữ nguyên phần mở rộng. */
export function moveService(c, k, x, y, dry = false) {
  const s = c.services[k];
  if (!s) return { ok: false, reason: 'Không có công trình ở đây' };
  const fee = moveFee(s.type);
  c.services.splice(k, 1); rebuildOcc(c);
  const r = canPlace(c, s.type, x, y, { move: true });
  const back = () => { c.services.splice(k, 0, s); rebuildOcc(c); };
  if (!r.ok) { back(); return r; }
  if (r.fp.x === s.x && r.fp.y === s.y) { back(); return { ok: false, reason: 'Vẫn ở chỗ cũ', fp: r.fp }; }
  if (fee > c.money) { back(); return { ok: false, reason: 'Không đủ tiền', fp: r.fp }; }
  if (dry) { back(); return { ok: true, fee, fp: r.fp }; }
  const { fp } = r, votes = [0, 0, 0, 0];
  for (let dy = 0; dy < fp.size; dy++) for (let dx = 0; dx < fp.size; dx++) {
    const i = idx(fp.x + dx, fp.y + dy);
    if (c.acc[i] === 1) votes[c.rdir[i]]++;
    c.zone[i] = 0; c.tree[i] = 0; clearBuilding(c, i);
  }
  s.x = fp.x; s.y = fp.y; s.dir = Math.max(...votes) ? votes.indexOf(Math.max(...votes)) : s.dir;
  back();
  c.money -= fee;
  c.dirty.services = c.dirty.zones = c.dirty.trees = c.dirty.buildings = true;
  computeMaps(c); computeNetworks(c); rebuildTraffic(c); recalc(c);
  return { ok: true, fee, fp };
}

/** Nút đường gần điểm (x, z) trong bán kính r, hoặc null. */
export function nodeAt(c, x, z, r = 7) {
  let best = null, bd = r;
  for (const n of c.nodes.values()) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
  return best;
}

/**
 * Dời một nút đường (ngã ba, ngã tư, đầu mút) tới (x, z); các đoạn nối vào nó uốn theo.
 * Từ chối nếu đường mới cắt ngang đường khác cùng tầng, quá ngắn, vướng công trình, ra khỏi đất của thành phố.
 */
export function moveNode(c, nid, x, z, dry = false) {
  const n = c.nodes.get(nid);
  if (!n) return { ok: false, reason: 'Không có nút đường ở đây' };
  if (c.entry && Math.hypot(n.x - c.entry.x, n.z - c.entry.z) < 12) return { ok: false, reason: 'Không dời được cửa ngõ ra ngoài thành phố' };
  if (!ownedAt(c, x, z) || Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) return { ok: false, reason: 'Ngoài phần đất của thành phố' };
  for (const o of c.nodes.values()) if (o !== n && Math.hypot(o.x - x, o.z - z) < 9) return { ok: false, reason: 'Quá sát nút đường khác' };
  const list = (c.adj.get(nid) || []).map((id) => c.edges.get(id));
  const dx = x - n.x, dz = z - n.z, old = list.map((e) => ({ e, cx: e.cx, cz: e.cz, pts: e.pts, cum: e.cum, len: e.len }));
  const ox = n.x, oz = n.z;
  n.x = x; n.z = z;
  for (const e of list) {
    e.cx += dx / 2; e.cz += dz / 2;
    const A = c.nodes.get(e.a), B = c.nodes.get(e.b);
    e.pts = sampleCurve(A.x, A.z, e.cx, e.cz, B.x, B.z, 4); e.cum = measure(e.pts); e.len = e.cum[e.cum.length - 1];
  }
  const restore = () => { n.x = ox; n.z = oz; for (const o of old) Object.assign(o.e, { cx: o.cx, cz: o.cz, pts: o.pts, cum: o.cum, len: o.len }); };
  let reason = '';
  for (const e of list) {
    if (e.len < 8) { reason = 'Đoạn đường quá ngắn'; break; }
    if (e.elev && e.len < MIN_ELEV_LEN) { reason = 'Cầu vượt quá ngắn'; break; }
    for (let k = 0; k < e.pts.length; k += 2) if (!ownedAt(c, e.pts[k], e.pts[k + 1])) { reason = 'Ngoài phần đất của thành phố'; break; }
    if (reason) break;
    cellsUnder(e.pts, ROADS[e.type].w / 2, (i) => { if (c.occ[i]) reason = 'Vướng công trình, hãy san ủi trước'; });
    if (reason) break;
    // cắt ngang đường khác cùng tầng mà không có nút giao
    const p = e.pts, m = p.length / 2 - 1;
    for (const o of c.edges.values()) {
      if (o === e || o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b) continue;
      const q = o.pts, mo = q.length / 2 - 1;
      for (let k = 0; k < m && !reason; k++) for (let j = 0; j < mo; j++) {
        const r = segInt(p[k * 2], p[k * 2 + 1], p[k * 2 + 2], p[k * 2 + 3], q[j * 2], q[j * 2 + 1], q[j * 2 + 2], q[j * 2 + 3]);
        if (r && Math.abs(edgeH(e, e.cum[k]) - edgeH(o, o.cum[j])) <= 3.5) { reason = 'Đường sẽ cắt ngang đường khác: hãy dùng cầu vượt hoặc vẽ nút giao'; break; }
      }
      if (reason) break;
    }
    if (reason) break;
  }
  if (reason || dry) { restore(); return reason ? { ok: false, reason } : { ok: true }; }
  roadsChanged(c);
  return { ok: true };
}

// ───────────────────────── bản đồ phủ, ô nhiễm, giá đất ─────────────────────────

function stamp(map, cx, cy, radius, strength, add) {
  const r = Math.ceil(radius);
  for (let y = Math.max(0, cy - r); y <= Math.min(N - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(N - 1, cx + r); x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > radius) continue;
    const v = strength * (1 - d / (radius + 1)), i = idx(x, y);
    map[i] = add ? Math.min(1, map[i] + v) : Math.max(map[i], v);
  }
}

const AIR = [0.3, 0.38, 0.45, 0.32, 0.2]; // khói công nghiệp theo cấp (cấp cao sạch dần)

/**
 * Vùng phủ dịch vụ, bốn loại ô nhiễm (không khí, đất, nước, tiếng ồn) và giá trị đất.
 * Cây xanh và công viên lọc bớt bụi và tiếng ồn.
 */
export function computeMaps(c) {
  for (const m of Object.values(c.cover)) m.fill(0);
  c.air.fill(0); c.ground.fill(0); c.noise.fill(0); c.waterPol.fill(0);
  for (const s of c.services) {
    const def = SERVICES[s.type], cx = s.x + ((def.size - 1) >> 1), cy = s.y + ((def.size - 1) >> 1);
    const clean = hasTech(c, 'cleanOut') && (def.group === 'water' || def.group === 'trash') ? 0.5 : 1;
    if (def.cover) stamp(c.cover[def.cover], cx, cy, svcVal(c, s, 'radius'), 1, false);
    if (def.air) stamp(c.air, cx, cy, def.air, Math.min(1, def.air / 6) * clean, true);
    if (def.ground) stamp(c.ground, cx, cy, def.ground, Math.min(1, def.ground / 5) * clean, true);
    if (def.waterPol) stamp(c.waterPol, cx, cy, def.waterPol, Math.min(1, def.waterPol / 6) * clean, true);
    if (def.air || def.ground) stamp(c.noise, cx, cy, 3, 0.3, true);
  }
  for (let i = 0; i < N * N; i++) {
    const L = c.level[i];
    if (!L) continue;
    const z = c.zone[i], x = i % N, y = (i / N) | 0;
    if (z === 3) {
      const k = hasTech(c, 'cleanInd') ? 0.6 : 1;
      stamp(c.air, x, y, 6, AIR[L - 1] * k, true); stamp(c.ground, x, y, 3, 0.3, true); stamp(c.noise, x, y, 3, 0.3, true);
    } else if (z === 10) { stamp(c.ground, x, y, 3, 0.3, true); stamp(c.noise, x, y, 3, 0.35, true); }
    else if (z === 11) { stamp(c.air, x, y, 4, 0.2, true); stamp(c.ground, x, y, 3, 0.3, true); }
    else if (ZDEF[z].biz === 'shop') stamp(c.noise, x, y, 2, 0.1 + 0.03 * L, true);
  }
  // tiếng ồn giao thông: đường càng đông càng ồn
  for (const e of c.edges.values()) {
    const s = (0.1 + 0.55 * edgeLoad(c, e)) * (e.type === 'large' ? 1.35 : 1);
    for (let k = 0; k < e.pts.length; k += 6) stamp(c.noise, cellOf(e.pts[k]), cellOf(e.pts[k + 1]), 2.6, s, false);
  }
  // trạm bơm hút phải nước bẩn?
  c.dirtyWater = false;
  for (const s of c.services) if (s.type === 'pump') for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) { const a = s.x + dx, b = s.y + dy; if (inMap(a, b) && c.water[idx(a, b)] && c.waterPol[idx(a, b)] > 0.12) c.dirtyWater = true; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    let green = 0, shore = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(x + dx, y + dy) && c.tree[idx(x + dx, y + dy)]) green++;
    const filter = clamp(1 - green * 0.055 - c.cover.park[i] * 0.3, 0.3, 1);
    c.air[i] *= filter; c.noise[i] *= filter * (hasPolicy(c, i, 'quiet') ? 0.6 : 1);
    c.pollution[i] = clamp(c.air[i] * 0.7 + c.ground[i] * 0.6 + c.noise[i] * 0.3 + (c.water[i] ? 0 : c.waterPol[i] * 0.3), 0, 1);
    let v = 26 + c.cover.park[i] * 20 + c.cover.police[i] * 10 + c.cover.fire[i] * 8 + c.cover.health[i] * 11 + c.cover.edu[i] * 13 - c.pollution[i] * 50;
    if (c.garbage && c.level[i] && c.garbage[i] > garbageLimit(c.zone[i], c.level[i])) v -= 10;
    for (let d = 0; d < 4 && !shore; d++) for (let k = 1; k <= 3; k++) { const a = x + [1, 0, -1, 0][d] * k, b = y + [0, 1, 0, -1][d] * k; if (inMap(a, b) && c.water[idx(a, b)]) { shore = 1; break; } }
    v += shore * (10 - c.waterPol[i] * 14);
    c.landValue[i] = clamp(v, 0, 100);
  }
}

/** Mức hài lòng của một ô nhà (0..100) và những thứ đang thiếu. */
export function cellHappy(c, i) {
  const needs = [], pop = c.pp.count;
  let h = 40 + c.landValue[i] * 0.5 - (c.tax.r + taxAdj(c, i) - 9) * 3;
  if (c.pOk[i] !== 1) { h -= 30; needs.push(c.pOk[i] ? 'Điện chập chờn' : 'Không có điện'); }
  if (c.wOk[i] !== 1) { h -= 20; needs.push(c.wOk[i] ? 'Nước yếu' : 'Không có nước'); }
  if (c.sOk[i] !== 1) { h -= 12; needs.push(c.sOk[i] ? 'Cống quá tải' : 'Không có chỗ xả nước thải'); }
  if (c.level[i] && c.garbage[i] > garbageLimit(c.zone[i], c.level[i])) { h -= 8; needs.push('Rác chất đống, chưa có xe tới thu gom'); }
  if (c.air[i] > 0.25) needs.push('Không khí ô nhiễm');
  if (c.ground[i] > 0.25) needs.push('Đất ô nhiễm');
  if (c.noise[i] > 0.4) { h -= 6; needs.push('Ồn ào'); }
  if (c.dirtyWater) { h -= 6; needs.push('Nước máy bẩn: trạm bơm hút gần cống xả'); }
  if (c.cover.health[i] < 0.05 && pop >= 120) needs.push('Xa trạm y tế');
  if (c.cover.fire[i] < 0.05 && pop >= 400) needs.push('Xa trạm cứu hoả');
  if (c.cover.police[i] < 0.05 && pop >= 400) needs.push('Ngoài vùng công an');
  return { happy: clamp(h, 0, 100), needs };
}

/** Thống kê: sức chứa, điện nước, thu chi, nhu cầu từng loại khu. */
export function recalc(c) {
  const s = c.stats, ps = c.pstats;
  quickStats(c);
  let housing = 0, jc = 0, ji = 0, jo = 0, use = 0, companies = 0, shops = 0;
  const inDist = new Array(DISTRICTS.length).fill(0);
  for (let i = 0; i < N * N; i++) {
    const L = c.level[i];
    if (!L) continue;
    const z = c.zone[i], jb = jobCap(z, L);
    housing += resCap(z, L); use += utilUse(z, L);
    if (c.district[i]) inDist[c.district[i]]++;
    if (jb) { companies++; const bz = ZDEF[z].biz; if (bz === 'ind' || bz === 'raw') ji += jb; else if (bz === 'office') jo += jb; else { jc += jb; shops++; } }
  }
  let pCap = 0, wCap = 0, sCap = 0, tCap = 0, civic = 0, roadLen = 0;
  const exp = { roads: 0, power: 0, water: 0, trash: 0, park: 0, civic: 0, transit: 0, extract: 0, policy: 0, loans: 0 };
  for (const e of c.edges.values()) { roadLen += e.len; exp.roads += e.len * ROADS[e.type].upkeep * (e.elev ? 2 : 1); }
  if (hasTech(c, 'cheapRoad')) exp.roads *= 0.7;
  const lineUp = { power: 0, pipe: 0 };
  for (const ln of c.lines) lineUp[ln.kind] += Math.hypot(ln.bx - ln.ax, ln.bz - ln.az) * LINES[ln.kind].upkeep;
  for (const sv of c.services) {
    const def = SERVICES[sv.type];
    if (sv.linked) { pCap += svcVal(c, sv, 'power'); wCap += svcVal(c, sv, 'water'); sCap += svcVal(c, sv, 'sewage'); } // chưa nối mạng thì chưa tính
    tCap += svcVal(c, sv, 'trash'); exp[def.group] = (exp[def.group] || 0) + def.upkeep;
    if (sv.mods) for (const m of MODS[sv.type] || []) exp[def.group] += (sv.mods[m.id] || 0) * m.upkeep;
    if (def.group === 'civic') civic++;
  }
  exp.power += lineUp.power; exp.water += lineUp.pipe; exp.transit += transitUpkeep(c);
  ps.shops = shops;
  for (let d = 1; d < DISTRICTS.length; d++) for (const k in c.policy[d]) exp.policy += (POLICIES[k].cost || 0) * inDist[d] + (inDist[d] ? POLICIES[k].flat || 0 : 0);
  for (const k in exp) exp[k] = Math.round(exp[k] * RATE);
  for (const ln of c.loans) exp.loans += ln.daily;
  const jobs = jc + ji + jo, pop = ps.pop, workers = ps.workers, employed = ps.employed, unemployed = workers - employed, vacJobs = Math.max(0, jobs - employed);
  const inc = { r: 0, c: 0, i: 0, t: 0 };
  for (const slot of c.econ.ring) { inc.r += slot.r; inc.c += slot.c; inc.i += slot.i; inc.t += slot.t || 0; }
  for (const k in inc) inc[k] = Math.round(inc[k]);
  Object.assign(s, {
    pop, jobs, jobsBy: { c: jc, i: ji, o: jo }, housing, workers, employed, unemployed, vacJobs, companies, happy: ps.happy,
    powerCap: pCap, powerUse: Math.round(use * (hasTech(c, 'grid') ? 0.85 : 1)), waterCap: wCap, waterUse: Math.round(use * (hasTech(c, 'reuse') ? 0.8 : 1)), sewCap: sCap, trashCap: tCap, trashUse: Math.round(use * 2.2), roadLen,
    inc, income: inc.r + inc.c + inc.i + inc.t, expense: Object.values(exp).reduce((a, b) => a + b, 0), exp,
  });
  // nhu cầu: dân tới khi có việc và nhà trống ít; việc làm mở thêm khi có người làm và người mua
  const tm = (t) => (9 - t) * 0.05;
  const early = 0.6 * Math.max(0, 1 - pop / 400);
  const spare = clamp((housing - pop - 14) / Math.max(30, housing * 0.25), 0, 1.3);
  const short = vacJobs > workers * 0.3 + 30 ? 0.45 : 0; // việc đang ế người làm thì đừng mở thêm
  // việc làm cần có tính theo số người trong tuổi lao động; có văn phòng thì bớt phần công nghiệp
  const needO = (ps.edu[2] + ps.edu[3]) * 0.5, needC = workers * 0.36 + 8, needI = Math.max(10, workers * 0.5 + 10 - jo * 0.7);
  // pull: sức hút người tới ở (có việc, sống ổn); nhu cầu xây thêm nhà = pull trừ phần nhà đang bỏ trống
  c.pull = clamp(early + clamp((vacJobs - unemployed) / Math.max(40, workers * 0.3), -1, 0.6) + (ps.happy - 45) / 80 + tm(c.tax.r), -1, 1);
  c.demand.r = clamp(c.pull - spare, -1, 1);
  c.demand.c = clamp((needC - jc) / Math.max(30, needC) + tm(c.tax.c) - short, -1, 1);
  c.demand.i = clamp((needI - ji) / Math.max(30, needI) + tm(c.tax.i) - short, -1, 1);
  c.demand.x = clamp(0.3 + (unemployed - vacJobs) / Math.max(20, workers * 0.2), 0, 0.8); // khu khai thác: mở khi còn người cần việc
  c.demand.o = zoneUnlocked(c, 6) ? clamp((needO - jo) / Math.max(30, needO) + tm(c.tax.c) - short, -1, 1) : 0;
  return s;
}

const Z0 = [0, 0, 0, 0];
const LV_NEED = { 8: Z0, 9: Z0, 10: Z0, 11: Z0, 12: Z0, 1: [38, 50, 62, 74], 4: [40, 52, 64, 76], 2: [34, 44, 54, 64], 5: [38, 48, 58, 68], 7: [38, 48, 58, 68], 6: [40, 50, 60, 70], 3: [0, 0, 0, 0] };

function canLevelUp(c, i) {
  const z = c.zone[i], L = c.level[i];
  if (L >= MAX_LEVEL || c.age[i] < 6 * L || c.landValue[i] < LV_NEED[z][L - 1]) return false;
  if (resCap(z, L) && c.resCount[i] < resCap(z, L) * 0.7) return false; // nhà còn vắng thì chưa cần xây to hơn
  if (jobCap(z, L)) {
    if (c.biz.eff[i] < 0.55 || c.biz.money[i] < 60) return false; // doanh nghiệp phải đang làm ăn được
    const need = reqEdu(z, L + 1), ps = c.pstats;
    let have = 0;
    for (let k = need; k < 4; k++) have += ps.edu[k];
    if (have < jobCap(z, L + 1) * 0.6) return false; // thành phố chưa đủ người có trình độ
  }
  return true;
}

/** Điều kiện còn thiếu để một ô nhà lên cấp (chuỗi mô tả, rỗng nếu đã tối đa). */
export function levelHint(c, i) {
  const z = c.zone[i], L = c.level[i];
  if (!L || L >= MAX_LEVEL) return '';
  const out = [];
  if (c.landValue[i] < LV_NEED[z][L - 1]) out.push(`giá trị đất từ ${LV_NEED[z][L - 1]}`);
  if (resCap(z, L) && c.resCount[i] < resCap(z, L) * 0.7) out.push('nhà gần kín người');
  if (jobCap(z, L)) {
    if (c.biz.eff[i] < 0.55 || c.biz.money[i] < 60) out.push('doanh nghiệp làm ăn có lãi');
    const need = reqEdu(z, L + 1);
    if (need) out.push(`đủ lao động trình độ ${['', 'tiểu học', 'trung học', 'đại học'][need]}`);
  }
  return out.length ? out.join(', ') : 'sắp lên cấp';
}

// ───────────────────────── vay nợ ─────────────────────────

export function takeLoan(c, k) {
  const def = LOANS[k];
  if (!def) return { ok: false, reason: 'Không có khoản vay này' };
  if (c.loans.length >= MAX_LOANS) return { ok: false, reason: `Chỉ được vay tối đa ${MAX_LOANS} khoản cùng lúc` };
  c.loans.push({ amount: def.amount, daily: Math.round((def.amount * (1 + def.rate)) / def.days), left: def.days });
  c.money += def.amount; c.debtHours = 0;
  recalc(c);
  return { ok: true };
}

// ───────────────────────── vòng mô phỏng ─────────────────────────

/** Xây mới, lên cấp, bỏ hoang trên các ô đã quy hoạch. */
function growth(c) {
  const rng = c.rng;
  const zoned = [];
  for (let i = 0; i < N * N; i++) {
    if (!c.zone[i]) continue;
    zoned.push(i);
    if (c.level[i] && c.age[i] < 60000) c.age[i]++;
  }
  const samples = Math.min(zoned.length * 3, Math.ceil(50 + zoned.length * 0.5));
  let built = false;
  for (let k = 0; k < samples; k++) {
    const i = zoned[(rng() * zoned.length) | 0], z = c.zone[i], dm = c.demand[ZDEF[z].cat];
    const ok = c.pOk[i] === 1 && c.wOk[i] === 1 && c.sOk[i] === 1;
    if (!c.level[i]) {
      if (!c.acc[i] || !ok || c.steep[i] || !c.room(i, utilUse(z, 1) + 1)) continue;
      if (rng() < Math.max(0, dm) * 0.4) {
        c.level[i] = 1; c.variant[i] = (rng() * 3) | 0; c.dir[i] = c.rdir[i]; c.age[i] = 0; c.tree[i] = 0;
        c.biz.money[i] = 150; c.biz.eff[i] = 0.5; c.biz.sin[i] = jobCap(z, 1) && ZDEF[z].biz !== 'raw' ? 10 : 0;
        c.dirty.buildings = c.dirty.trees = true; built = true;
        computeNetworks(c); // cập nhật phần công suất còn dư
      }
    } else if (!c.acc[i]) {
      if (rng() < 0.3) { clearBuilding(c, i); c.zone[i] = 0; c.dirty.zones = true; }
    } else if (!ok && rng() < (c.pOk[i] === 0 || c.wOk[i] === 0 ? 0.02 : 0.007)) {
      clearBuilding(c, i); // bỏ hoang vì thiếu điện nước
    } else if (resCap(z, c.level[i]) && !jobCap(z, c.level[i]) && c.resCount[i] === 0 && c.age[i] > 36 && dm < -0.4 && rng() < 0.02) {
      clearBuilding(c, i); // nhà bỏ trống quá lâu
    } else if (ok && dm > -0.2 && canLevelUp(c, i) && c.room(i, utilUse(z, c.level[i] + 1) - utilUse(z, c.level[i]) + 1) && rng() < 0.2) {
      c.level[i]++; c.age[i] = 0; c.dirty.buildings = true; built = true;
      computeNetworks(c);
    }
  }
  if (built) computeNetworks(c);
}

/** Một giờ trong game trôi qua. */
function hourTick(c) {
  c.hour++; c.day = Math.floor(c.hour / 24);
  const s = c.stats, h = c.hour % 24;
  if (c.hour % 3 === 0) computeMaps(c);
  computeNetworks(c);
  growth(c);
  c.hourInc.r = c.hourInc.c = c.hourInc.i = 0;
  peopleHour(c);
  transitHour(c);
  // sổ thu chi: thuế thu ngay trong giờ, phí bảo trì chia đều 24 giờ
  const fares = c.transit.income - c.fareSeen; c.fareSeen = c.transit.income;
  c.econ.ring[h] = { r: c.hourInc.r, c: c.hourInc.c, i: c.hourInc.i, t: fares };
  recalc(c);
  c.money += c.hourInc.r + c.hourInc.c + c.hourInc.i - s.expense / 24;
  for (const ln of c.loans) ln.left -= 1 / 24;
  if (c.loans.some((ln) => ln.left <= 0)) { c.loans = c.loans.filter((ln) => ln.left > 0); c.events.push({ type: 'loanPaid' }); recalc(c); }
  if (h === 0 && c.day % 5 === 0 && s.pop >= 200 && s.happy >= 50) { c.points++; c.events.push({ type: 'point' }); } // thành phố sống tốt thì có thêm điểm phát triển
  c.debtHours = c.money < 0 ? c.debtHours + 1 : 0;
  if (c.money < BANKRUPT_AT || c.debtHours > BANKRUPT_DAYS * 24) { c.over = true; c.events.push({ type: 'bankrupt' }); }
  while (c.milestone < MILESTONES.length && s.pop >= MILESTONES[c.milestone].pop) {
    const m = MILESTONES[c.milestone++];
    c.money += m.reward; c.points += MILESTONE_POINTS[c.milestone - 1] || 0;
    const fresh = (d) => d.unlock && d.unlock <= m.pop && !MILESTONES.some((o, k) => k < c.milestone - 1 && o.pop >= d.unlock);
    const unlocked = [...Object.values(SERVICES), ...ZDEF.slice(1)].filter(fresh).map((d) => d.name);
    c.events.push({ type: 'milestone', name: m.name, reward: m.reward, points: MILESTONE_POINTS[c.milestone - 1] || 0, unlocked });
  }
}

/** Tiến mô phỏng thêm dt giây (đã nhân tốc độ game): xe chạy liên tục, mỗi HOUR_SEC giây là một giờ. */
export function advance(c, dt) {
  if (c.over) return;
  while (dt > 0) {
    const step = Math.min(dt, 0.25);
    stepTraffic(c, step); stepTransit(c, step);
    c.clock += step; dt -= step;
    if (c.clock >= HOUR_SEC) { c.clock -= HOUR_SEC; hourTick(c); if (c.over) return; }
  }
}

/** Một giờ trôi qua (tiện cho test). */
export function tick(c) { advance(c, HOUR_SEC - c.clock + 1e-6); }

// ───────────────────────── lưu / nạp ─────────────────────────

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (str, n) => { const s = atob(str || ''), u = new Uint8Array(n ?? s.length); for (let i = 0; i < u.length && i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const r1 = (v) => Math.round(v * 10) / 10;

export function serialize(c) {
  const pack = (k) => b64(c[k]), pp = packPeople(c);
  return {
    v: 4, n: N, seed: c.seed, name: c.name, money: Math.round(c.money), hour: c.hour, tax: c.tax, milestone: c.milestone, start: c.start, entry: c.entry,
    loans: c.loans, debtHours: c.debtHours, over: c.over, nextId: c.nextId,
    owned: [...c.owned], tech: Object.keys(c.tech), points: c.points, policy: c.policy, distName: c.distName, exports: Math.round(c.econ.exports),
    nodes: [...c.nodes.values()].map((n) => [n.id, r1(n.x), r1(n.z)]),
    edges: [...c.edges.values()].map((e) => [e.id, e.a, e.b, e.type, r1(e.cx), r1(e.cz), e.elev]),
    lines: c.lines.map((l) => [l.kind, r1(l.ax), r1(l.az), r1(l.bx), r1(l.bz)]),
    services: c.services.map((s) => ({ type: s.type, x: s.x, y: s.y, dir: s.dir, mods: s.mods })),
    transit: { fare: c.transit.fare, lines: c.transit.lines.map((l) => ({ mode: l.mode, count: l.count, stops: l.stops.map((s) => [r1(s.x), r1(s.z)]) })) },
    tree: pack('tree'), zone: pack('zone'), level: pack('level'), variant: pack('variant'), dir: pack('dir'), district: pack('district'),
    people: { n: c.pp.count, age: b64(pp.age), edu: b64(pp.edu), home: b64(pp.home), work: b64(pp.work), money: b64(pp.money) },
  };
}

export function deserialize(o) {
  if (!o || ![2, 3, 4].includes(o.v) || o.n !== (o.v === 4 ? N : LN)) throw new Error('Bản lưu không hợp lệ hoặc thuộc phiên bản cũ');
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  const v2 = o.v === 2; // trước khi có người dân: giữ nguyên đường và nhà, dân sẽ tự dọn về
  const small = o.v < 4, D = small ? OFF : 0; // bản đồ 96 x 96 đời trước nằm ở giữa bản đồ mới; toạ độ thế giới không đổi
  const remap = (i) => (small ? ((Math.floor(i / LN) + OFF) * N + (i % LN) + OFF) : i);
  const grid = (str) => {
    if (!small) return unb64(str, N * N);
    const a = unb64(str, LN * LN), out = new Uint8Array(N * N);
    for (let i = 0; i < LN * LN; i++) out[remap(i)] = a[i];
    return out;
  };
  const c = {
    v: 4, seed: o.seed | 0, name: String(o.name || 'Phố Mới').slice(0, 24), money: num(o.money, 0), hour: Math.max(0, (v2 ? o.day : o.hour) | 0), milestone: clamp(o.milestone | 0, 0, MILESTONES.length),
    tax: { r: clamp(num(o.tax?.r, 9), 1, 20), c: clamp(num(o.tax?.c, 9), 1, 20), i: clamp(num(o.tax?.i, 9), 1, 20) },
    start: { x: clamp((o.start?.x | 0) + D, 0, N - 1), y: clamp((o.start?.y | 0) + D, 0, N - 1) },
    loans: v2 ? [] : (o.loans || []).slice(0, MAX_LOANS).map((l) => ({ amount: num(l.amount, 0), daily: num(l.daily, 0), left: num(l.left, 0) })),
    debtHours: o.debtHours | 0, over: !!o.over, nextId: Math.max(1, o.nextId | 0),
    nodes: new Map(), edges: new Map(), water: new Uint8Array(N * N),
    lines: (o.lines || []).filter((l) => LINES[l[0]]).map((l) => ({ kind: l[0], ax: num(l[1], 0), az: num(l[2], 0), bx: num(l[3], 0), bz: num(l[4], 0) })),
    services: (o.services || []).map((s) => ({ ...s, x: (s.x | 0) + D, y: (s.y | 0) + D })).filter((s) => SERVICES[s.type] && inMap(s.x, s.y) && inMap(s.x + SERVICES[s.type].size - 1, s.y + SERVICES[s.type].size - 1)).map((s) => {
      const out = { type: s.type, x: s.x, y: s.y, dir: s.dir & 3 };
      if (s.mods) { out.mods = {}; for (const m of MODS[s.type] || []) if (s.mods[m.id] > 0) out.mods[m.id] = clamp(s.mods[m.id] | 0, 0, m.max); }
      return out;
    }),
    owned: startTiles(), tech: {}, points: clamp(o.points | 0, 0, 999),
    policy: DISTRICTS.map(() => ({})), distName: DISTRICTS.map((d) => (d ? d[0] : '')),
  };
  if (!small) {
    if (Array.isArray(o.owned)) o.owned.slice(0, TILES * TILES).forEach((v, k) => { if (v) c.owned[k] = 1; });
    for (const id of o.tech || []) if (TECH[id]) c.tech[id] = 1;
    (o.policy || []).forEach((pl, d) => { if (d > 0 && d < DISTRICTS.length && pl) for (const k in pl) if (POLICIES[k]) c.policy[d][k] = 1; });
    (o.distName || []).forEach((nm, d) => { if (d > 0 && d < DISTRICTS.length && nm) c.distName[d] = String(nm).slice(0, 20); });
    if (o.entry) c.entry = { x: num(o.entry.x, 0), z: num(o.entry.z, -HALF + 1) };
  } else {
    c.entry = { x: cellCenter(c.start.x), z: -(LN * T) / 2 + 1 }; // cửa ngõ cũ nằm ở mép bắc của vùng trung tâm
    c.points = MILESTONE_POINTS.slice(0, c.milestone).reduce((a, b) => a + b, 0); // bù điểm cho các mốc đã đạt
  }
  for (const k of ['tree', 'zone', 'level', 'variant', 'dir']) c[k] = grid(o[k]);
  c.district = small || !o.district ? new Uint8Array(N * N) : unb64(o.district, N * N);
  for (let i = 0; i < N * N; i++) { if (c.zone[i] >= ZDEF.length) c.zone[i] = 0; if (c.level[i] > MAX_LEVEL || !c.zone[i]) c.level[i] = 0; if (c.district[i] >= DISTRICTS.length) c.district[i] = 0; }
  const keepTree = c.tree;
  c.tree = new Uint8Array(N * N); genLand(c);
  if (small) { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = idx(x, y); if (x >= OFF && y >= OFF && x < OFF + LN && y < OFF + LN) c.tree[i] = keepTree[i]; } } else c.tree = keepTree; // vùng ngoài bản đồ cũ: rừng sinh mới
  for (let i = 0; i < N * N; i++) if (c.water[i]) { c.tree[i] = 0; c.zone[i] = 0; c.level[i] = 0; }
  attach(c);
  c.econ.exports = num(o.exports, 0);
  for (const n of o.nodes || []) { const id = n[0] | 0; c.nodes.set(id, { id, x: num(n[1], 0), z: num(n[2], 0) }); c.nextId = Math.max(c.nextId, id + 1); }
  for (const e of o.edges || []) {
    const id = e[0] | 0;
    if (!c.nodes.has(e[1]) || !c.nodes.has(e[2]) || !ROADS[e[3]] || e[1] === e[2]) continue;
    const keep = c.nextId; c.nextId = id;
    addEdge(c, e[1], e[2], e[3], num(e[4], null), num(e[5], null), e[6] ? 1 : 0);
    c.nextId = Math.max(keep, id + 1);
  }
  for (let i = 0; i < N * N; i++) if (c.level[i]) { c.age[i] = 30; c.biz.money[i] = 150; c.biz.sin[i] = jobCap(c.zone[i], c.level[i]) ? 10 : 0; }
  roadsChanged(c);
  if (o.people && o.people.n) {
    const n = o.people.n | 0, cells = (str) => { const a = new Uint16Array(unb64(str, n * 2).buffer); if (small) for (let k = 0; k < n; k++) if (a[k] !== 0xffff) a[k] = remap(a[k]); return new Uint8Array(a.buffer); };
    unpackPeople(c, { age: unb64(o.people.age, n), edu: unb64(o.people.edu, n), home: cells(o.people.home), work: cells(o.people.work), money: unb64(o.people.money, n * 2) });
  }
  if (o.transit) {
    c.transit.fare = clamp(num(o.transit.fare, 2), 0, 10);
    for (const l of o.transit.lines || []) {
      if (l.mode !== 'bus' && l.mode !== 'metro') continue;
      const r = addLine(c, l.mode, (l.stops || []).map((s) => ({ x: num(s[0], 0), z: num(s[1], 0) })), true);
      if (r.line) r.line.count = clamp(l.count | 0, 1, 8);
    }
    maintainTransit(c);
  }
  computeMaps(c); recalc(c);
  return c;
}

void bizKind;

// Phố Mới — phần mô phỏng thành phố (không đụng DOM, chạy được cả trong Node để test).
// Đường là một graph (nút giao + đoạn đường cong Bezier bậc 2) nằm tự do trên bản đồ;
// ô đất (cell) vẫn theo lưới N x N, ô quy hoạch tự sinh hai bên đường.
export const N = 96; // bản đồ N x N ô
export const T = 10; // cạnh một ô (đơn vị thế giới)
export const HALF = (N * T) / 2;
export const ZONE = { NONE: 0, R: 1, C: 2, I: 3 };
export const ZONE_NAME = ['Chưa quy hoạch', 'Khu dân cư', 'Khu thương mại', 'Khu công nghiệp'];

// sức chứa theo cấp 1..3: dân (R) hoặc chỗ làm (C, I)
export const CAP = { 1: [6, 20, 60], 2: [4, 12, 40], 3: [6, 14, 30] };
const POWER_USE = { 1: [1, 3, 8], 2: [2, 5, 12], 3: [3, 8, 16] };
const WATER_USE = { 1: [1, 3, 8], 2: [1, 3, 7], 3: [2, 6, 12] };
const TRASH_USE = { 1: [1, 3, 7], 2: [1, 3, 8], 3: [2, 5, 9] };

// loại đường: w = bề rộng cả vỉa hè, cost / upkeep tính theo đơn vị chiều dài
export const ROADS = {
  small: { name: 'Đường nhỏ 2 làn', icon: '🛣️', w: 10, asphalt: 6.4, cost: 4, upkeep: 0.05, speed: 1, desc: 'Hai làn hai chiều, bám tâm ô' },
  large: { name: 'Đại lộ 4 làn', icon: '🛤️', w: 20, asphalt: 15.6, cost: 11, upkeep: 0.13, speed: 1.35, desc: 'Bốn làn có dải phân cách, rộng 2 ô, xe chạy nhanh hơn' },
  oneway: { name: 'Đường một chiều', icon: '➡️', w: 10, asphalt: 6.4, cost: 4.5, upkeep: 0.05, speed: 1.15, desc: 'Hai làn cùng chiều theo hướng vẽ; nâng cấp lần nữa để đảo chiều' },
};
export const BRIDGE_MULT = 4.5;
export const LINES = {
  power: { name: 'Dây điện', icon: '🗼', cost: 1.2, upkeep: 0.012, desc: 'Nối nhà máy điện ở xa vào đường hoặc vào công trình khác' },
  pipe: { name: 'Ống nước', icon: '🚰', cost: 1, upkeep: 0.012, desc: 'Nối trạm nước, cống xả ở xa vào đường (ống ngầm chở cả nước sạch và nước thải)' },
};

// công trình đặt tay. size: cạnh ô vuông; unlock: mốc dân số cần đạt
export const SERVICES = {
  wind: { name: 'Tua-bin gió', icon: '🌬️', group: 'power', cost: 5000, upkeep: 70, size: 1, power: 60, unlock: 0, desc: 'Điện sạch, công suất nhỏ' },
  solar: { name: 'Trại điện mặt trời', icon: '🔆', group: 'power', cost: 12000, upkeep: 150, size: 2, power: 170, unlock: 400, desc: 'Điện sạch, công suất vừa' },
  coal: { name: 'Nhà máy nhiệt điện', icon: '🏭', group: 'power', cost: 22000, upkeep: 520, size: 3, power: 520, pollute: 9, unlock: 1000, desc: 'Điện nhiều nhưng gây ô nhiễm rộng' },
  tower: { name: 'Tháp nước', icon: '🗼', group: 'water', cost: 3000, upkeep: 50, size: 1, water: 250, unlock: 0, desc: 'Cấp nước, đặt ở đâu cũng được' },
  pump: { name: 'Trạm bơm nước', icon: '💧', group: 'water', cost: 7000, upkeep: 140, size: 2, water: 1000, needWater: true, unlock: 0, desc: 'Cấp nhiều nước, phải đặt sát bờ sông / biển' },
  outlet: { name: 'Cống xả thải', icon: '🕳️', group: 'water', cost: 2500, upkeep: 60, size: 1, sewage: 400, needWater: true, pollute: 4, unlock: 0, desc: 'Xả nước thải ra sông / biển, gây ô nhiễm quanh cống' },
  treat: { name: 'Nhà máy xử lý nước thải', icon: '♻️', group: 'water', cost: 16000, upkeep: 320, size: 2, sewage: 1800, needWater: true, pollute: 1.5, unlock: 1000, desc: 'Xử lý nhiều nước thải, gần như không ô nhiễm' },
  landfill: { name: 'Bãi rác', icon: '🗑️', group: 'trash', cost: 6000, upkeep: 130, size: 3, trash: 500, cover: 'trash', radius: 26, pollute: 6, road: true, unlock: 120, desc: 'Xe rác thu gom trong bán kính phục vụ; bãi gây ô nhiễm quanh nó' },
  incinerator: { name: 'Lò đốt rác', icon: '🔥', group: 'trash', cost: 24000, upkeep: 420, size: 2, trash: 1800, power: 60, cover: 'trash', radius: 38, pollute: 3, road: true, unlock: 1000, desc: 'Xử lý nhiều rác trên vùng rộng, phát thêm chút điện' },
  park: { name: 'Công viên nhỏ', icon: '🌳', group: 'park', cost: 800, upkeep: 12, size: 1, cover: 'park', radius: 5, unlock: 0, desc: 'Tăng giá trị đất xung quanh' },
  plaza: { name: 'Quảng trường', icon: '⛲', group: 'park', cost: 3500, upkeep: 45, size: 2, cover: 'park', radius: 9, unlock: 400, desc: 'Tăng giá trị đất trên vùng rộng' },
  stadium: { name: 'Sân vận động', icon: '🏟️', group: 'park', cost: 45000, upkeep: 700, size: 4, cover: 'park', radius: 18, road: true, unlock: 2500, desc: 'Niềm tự hào của thành phố' },
  clinic: { name: 'Trạm y tế', icon: '🏥', group: 'civic', cost: 9000, upkeep: 190, size: 2, cover: 'health', radius: 14, road: true, unlock: 120, desc: 'Chăm sóc sức khoẻ, dân vui hơn' },
  school: { name: 'Trường học', icon: '🏫', group: 'civic', cost: 9500, upkeep: 200, size: 2, cover: 'edu', radius: 14, road: true, unlock: 120, desc: 'Giáo dục, giúp nhà cửa lên cấp' },
  police: { name: 'Đồn công an', icon: '🚓', group: 'civic', cost: 8000, upkeep: 160, size: 2, cover: 'police', radius: 16, road: true, unlock: 400, desc: 'An ninh, tăng giá trị đất' },
  fire: { name: 'Trạm cứu hoả', icon: '🚒', group: 'civic', cost: 7500, upkeep: 150, size: 2, cover: 'fire', radius: 16, road: true, unlock: 400, desc: 'Nhà ngoài vùng phủ có thể cháy rụi' },
  university: { name: 'Trường đại học', icon: '🎓', group: 'civic', cost: 30000, upkeep: 600, size: 3, cover: 'edu', radius: 28, road: true, unlock: 2500, desc: 'Giáo dục trên vùng rất rộng' },
};

export const MILESTONES = [
  { pop: 120, name: 'Xóm nhỏ', reward: 5000 },
  { pop: 400, name: 'Thị trấn', reward: 10000 },
  { pop: 1000, name: 'Thị xã', reward: 20000 },
  { pop: 2500, name: 'Thành phố', reward: 40000 },
  { pop: 6000, name: 'Đô thị lớn', reward: 80000 },
  { pop: 12000, name: 'Siêu đô thị', reward: 150000 },
];

// khoản vay: trả đều hằng tháng, tối đa 3 khoản cùng lúc
export const LOANS = [
  { amount: 20000, months: 24, rate: 0.1 },
  { amount: 50000, months: 36, rate: 0.14 },
  { amount: 120000, months: 48, rate: 0.18 },
];
export const MAX_LOANS = 3;
export const BANKRUPT_AT = -30000; // nợ quá mức này thì phá sản
export const BANKRUPT_DAYS = 180; // hoặc âm tiền liên tục chừng này ngày

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Nhiễu giá trị mượt 0..1 */
export function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Trường địa hình liên tục theo toạ độ ô: dương = đất liền (xấp xỉ số ô cách bờ), âm = nước. */
export function makeField(seed) {
  const ph = hash2(1, 2, seed) * 6.283;
  const rx = N * (0.24 + hash2(3, 4, seed) * 0.1);
  const lx = N * (0.62 + hash2(5, 6, seed) * 0.2), ly = N * (0.3 + hash2(7, 8, seed) * 0.25), lr = 4.5 + hash2(9, 10, seed) * 3;
  return (x, y) => {
    const cx = rx + Math.sin(y * 0.065 + ph) * 8 + (vnoise(3.3, y * 0.05, seed) - 0.5) * 10;
    const river = Math.abs(x - cx) - (2.2 + vnoise(x * 0.1, y * 0.1, seed + 7) * 1.6);
    const coast = N - 12 + (vnoise(x * 0.06, 1.7, seed + 3) - 0.5) * 12 - y;
    const lake = Math.hypot(x - lx, y - ly) - lr * (0.75 + vnoise(x * 0.15, y * 0.15, seed + 5) * 0.5);
    return Math.min(river, coast, lake);
  };
}

const idx = (x, y) => y * N + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
export const cellOf = (w) => Math.floor((w + HALF) / T);
export const cellCenter = (i) => (i + 0.5) * T - HALF;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ───────────────────────── địa hình (heightmap) ─────────────────────────

/** Độ cao đồi thoải của đất liền tại đỉnh lưới (gx, gy) — bằng 0 ở sát bờ nước. */
export function hillHeight(seed, f, gx, gy) {
  const n = vnoise(gx * 0.034, gy * 0.034, seed + 41) * 0.75 + vnoise(gx * 0.09, gy * 0.09, seed + 43) * 0.25;
  return 15 * Math.pow(n, 1.5) * clamp((f(gx, gy) - 1.6) / 9, 0, 1);
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
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) c.cellH[idx(x, y)] = Math.max(c.hv[y * V + x], c.hv[y * V + x + 1], c.hv[(y + 1) * V + x], c.hv[(y + 1) * V + x + 1]);
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
    v: 2, seed, name: 'Phố Mới',
    water: new Uint8Array(N * N), tree: new Uint8Array(N * N),
    zone: new Uint8Array(N * N), level: new Uint8Array(N * N), variant: new Uint8Array(N * N), dir: new Uint8Array(N * N),
    nodes: new Map(), edges: new Map(), nextId: 1, lines: [],
    services: [], money: 70000, day: 0, tax: { r: 9, c: 9, i: 9 }, milestone: 0, loans: [], debtDays: 0, over: false,
  };
  genLand(c);
  // đường dẫn vào thành phố từ mép bắc, chọn cột toàn đất liền
  let sx = (N * 0.55) | 0;
  for (let k = 0; k < N; k++) {
    const x = ((N * 0.55) | 0) + (k % 2 ? -1 : 1) * ((k + 1) >> 1);
    if (x < 6 || x >= N - 6) continue;
    let ok = true;
    for (let y = 0; y < 14; y++) for (let d = -4; d <= 4; d++) if (c.water[idx(x + d, y)]) ok = false;
    if (ok) { sx = x; break; }
  }
  c.start = { x: sx, y: 7 };
  attach(c);
  const a = addNode(c, cellCenter(sx), -HALF + 1), b = addNode(c, cellCenter(sx), cellCenter(7));
  addEdge(c, a, b, 'small');
  roadsChanged(c);
  computeMaps(c);
  return c;
}

function genLand(c) {
  const f = makeField(c.seed), seed = c.seed;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (f(x + 0.5, y + 0.5) < 0.15) { c.water[i] = 1; continue; }
    const n = vnoise(x * 0.09, y * 0.09, seed + 11), h = hash2(x, y, seed + 13);
    if ((n > 0.6 && h > 0.25) || h > 0.975) c.tree[i] = 1;
  }
}

/** Gắn phần dữ liệu tính lại được (không lưu). */
function attach(c) {
  const mk = () => new Uint8Array(N * N);
  c.road = mk(); c.acc = mk(); c.rdir = mk(); c.cedge = new Int32Array(N * N).fill(-1);
  c.pOk = mk(); c.wOk = mk(); c.sOk = mk();
  c.age = new Uint16Array(N * N);
  c.occ = new Int16Array(N * N);
  c.landValue = new Float32Array(N * N).fill(30);
  c.pollution = new Float32Array(N * N);
  c.cover = { park: new Float32Array(N * N), police: new Float32Array(N * N), fire: new Float32Array(N * N), health: new Float32Array(N * N), edu: new Float32Array(N * N), trash: new Float32Array(N * N) };
  c.dirty = { roads: true, buildings: true, trees: true, zones: true, services: true, lines: true };
  c.events = [];
  c.stats = { pop: 0, jobsC: 0, jobsI: 0, jobs: 0, workers: 0, powerCap: 0, powerUse: 0, waterCap: 0, waterUse: 0, sewCap: 0, trashCap: 0, trashUse: 0, noPower: 0, noWater: 0, income: 0, expense: 0, roadLen: 0, happy: 50, exp: { roads: 0, power: 0, water: 0, trash: 0, park: 0, civic: 0, loans: 0 }, inc: { r: 0, c: 0, i: 0 } };
  c.demand = { r: 0.6, c: 0.2, i: 0.2 };
  c.rng = mulberry32(c.seed ^ Math.imul(c.day + 1, 2654435761));
  c.adj = new Map();
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
function addEdge(c, a, b, type, cx, cz) {
  const A = c.nodes.get(a), B = c.nodes.get(b);
  if (cx == null) { cx = (A.x + B.x) / 2; cz = (A.z + B.z) / 2; }
  const e = { id: c.nextId++, a, b, type, cx, cz };
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

function distSeg(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
  const t = l2 ? clamp(((px - x0) * dx + (pz - z0) * dz) / l2, 0, 1) : 0;
  const qx = x0 + dx * t, qz = z0 + dz * t;
  return { d: Math.hypot(px - qx, pz - qz), t, x: qx, z: qz };
}

/** Điểm gần nhất trên một đoạn đường: { d, t (tham số 0..1 của đường cong), x, z } */
function nearestOnEdge(e, px, pz) {
  const p = e.pts, n = p.length / 2 - 1;
  let best = { d: Infinity, t: 0, x: 0, z: 0 };
  for (let k = 0; k < n; k++) {
    const r = distSeg(px, pz, p[k * 2], p[k * 2 + 1], p[k * 2 + 2], p[k * 2 + 3]);
    if (r.d < best.d) best = { d: r.d, t: (k + r.t) / n, x: r.x, z: r.z };
  }
  return best;
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

function pathCost(c, pts, perUnit) {
  let cost = 0;
  const n = pts.length / 2 - 1;
  for (let k = 0; k < n; k++) {
    const l = Math.hypot(pts[k * 2 + 2] - pts[k * 2], pts[k * 2 + 3] - pts[k * 2 + 1]);
    cost += l * perUnit * (isWaterAt(c, (pts[k * 2] + pts[k * 2 + 2]) / 2, (pts[k * 2 + 1] + pts[k * 2 + 3]) / 2) ? BRIDGE_MULT : 1);
  }
  return Math.round(cost);
}

/**
 * Tính trước một đoạn đường sắp vẽ: a, b là kết quả snapPoint; ctrl = điểm điều khiển (đường cong) hoặc null.
 * Tự tìm chỗ cắt đường khác để tạo nút giao. Trả về { ok, reason, cost, pts, len, stops, ... }.
 */
export function planRoad(c, { a, b, ctrl = null, type = 'small' }) {
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
  const out = { ok: false, pts, len, type, cost: 0, A, B, cx, cz };
  if (len < 8 || (A.node != null && A.node === B.node)) return { ...out, reason: 'Đoạn quá ngắn' };
  for (let k = 0; k <= n; k++) if (Math.abs(pts[k * 2]) > HALF - 1 || Math.abs(pts[k * 2 + 1]) > HALF - 1) return { ...out, reason: 'Ra ngoài bản đồ' };
  out.cost = pathCost(c, pts, def.cost);

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
    for (const e of c.edges.values()) { const d = nearestOnEdge(e, x, z).d; if (d < 4 || (near > 40 && d < (ROADS[e.type].w + def.w) / 2 - 1)) { over += cum[k] - cum[k - 1]; break; } }
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
      addEdge(c, chain[k].node, chain[k + 1].node, e.type, m[0], m[1]);
    }
  }
  return res;
}

export function buildRoad(c, spec) {
  const plan = planRoad(c, spec);
  if (!plan.ok) return plan;
  const { stops, A, B, cx, cz, type } = plan;
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
    addEdge(c, p.node, q.node, type, m[0], m[1]);
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
  computeNetworks(c);
  recalc(c);
  c.dirty.roads = c.dirty.zones = c.dirty.buildings = c.dirty.trees = true;
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
      const l = Math.hypot(x1 - x0, z1 - z0) || 1, ext = 5 * (Math.abs((z1 - z0) / l) + Math.abs((x1 - x0) / l));
      const cx0 = Math.max(0, cellOf(Math.min(x0, x1) - reach)), cx1 = Math.min(N - 1, cellOf(Math.max(x0, x1) + reach));
      const cy0 = Math.max(0, cellOf(Math.min(z0, z1) - reach)), cy1 = Math.min(N - 1, cellOf(Math.max(z0, z1) + reach));
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
        const px = cellCenter(x), pz = cellCenter(y), r = distSeg(px, pz, x0, z0, x1, z1), i = idx(x, y);
        if (r.d < half + ext - 0.6) c.road[i] = 1;
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
      if (c.level[i]) { c.level[i] = 0; c.age[i] = 0; }
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
    let best = -1;
    for (let dy = 0; dy < sz && best < 0; dy++) for (let dx = 0; dx < sz; dx++) { const i = idx(s.x + dx, s.y + dy); if (c.acc[i] && c.cedge[i] >= 0) { best = c.cedge[i]; break; } }
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
    if (d.power) pSup[find(P, E + k)] += d.power;
    if (d.water) wSup[find(W, E + k)] += d.water;
    if (d.sewage) sSup[find(W, E + k)] += d.sewage;
  });
  const rootP = new Int32Array(N * N).fill(-1), rootW = new Int32Array(N * N).fill(-1);
  for (let i = 0; i < N * N; i++) {
    if (c.cedge[i] < 0 || !c.acc[i]) continue;
    const k = eIx.get(c.cedge[i]);
    rootP[i] = find(P, k); rootW[i] = find(W, k);
    const L2 = c.level[i];
    if (L2) { const z = c.zone[i]; pUse[rootP[i]] += POWER_USE[z][L2 - 1]; wUse[rootW[i]] += WATER_USE[z][L2 - 1]; }
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
  c.room = (i) => rootP[i] >= 0 && pSup[rootP[i]] - pUse[rootP[i]] >= 3 && wSup[rootW[i]] - wUse[rootW[i]] >= 3 && sSup[rootW[i]] - wUse[rootW[i]] >= 3;
  c.stats.noPower = noP; c.stats.noWater = noW;
}

// ───────────────────────── quy hoạch, công trình, san ủi ─────────────────────────

function clearBuilding(c, i) {
  if (c.level[i]) { c.level[i] = 0; c.age[i] = 0; c.dirty.buildings = true; }
}

/** Tô quy hoạch: chỉ ô quy hoạch tự sinh cạnh đường (acc > 0) mới nhận. z = 0 là bỏ quy hoạch. */
export function zoneRect(c, x0, y0, x1, y1, z) {
  let n = 0;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (c.water[i] || c.road[i] || c.occ[i] || c.zone[i] === z) continue;
    if (z !== 0 && !c.acc[i]) continue;
    if (c.level[i]) { if (z !== 0) continue; clearBuilding(c, i); } // chỉ "bỏ quy hoạch" mới dỡ nhà
    c.zone[i] = z; n++;
  }
  if (n) { c.dirty.zones = true; computeNetworks(c); recalc(c); }
  return { ok: n > 0, count: n, reason: n ? '' : 'Chỉ quy hoạch được ô nằm cạnh đường (tối đa 2 ô)' };
}

export function bulldozeRect(c, x0, y0, x1, y1) {
  let n = 0;
  const kill = new Set(), roads = new Set();
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (c.occ[i]) { kill.add(c.occ[i] - 1); continue; }
    if (c.road[i] || c.water[i]) for (const e of c.edges.values()) if (nearestOnEdge(e, cellCenter(x), cellCenter(y)).d < ROADS[e.type].w / 2 + 4.4) roads.add(e.id);
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

export function isUnlocked(c, type) {
  const need = SERVICES[type].unlock;
  if (!need) return true;
  return MILESTONES.some((m, k) => k < c.milestone && m.pop >= need);
}

/** Kiểm tra đặt công trình, (x, y) là ô dưới con trỏ. */
export function canPlace(c, type, x, y) {
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
      if (c.water[i]) return { ok: false, reason: 'Không xây được trên nước', fp };
      if (c.road[i]) return { ok: false, reason: 'Đang có đường', fp };
      if (c.occ[i]) return { ok: false, reason: 'Đang có công trình khác', fp };
      if (c.acc[i] === 1) nearRoad = true;
    } else if (c.water[i]) nearWater = true;
  }
  if (def.needWater && !nearWater) return { ok: false, reason: 'Phải đặt sát bờ nước', fp };
  if (def.road && !nearRoad) return { ok: false, reason: 'Phải đặt sát đường', fp };
  if (!isUnlocked(c, type)) return { ok: false, reason: `Mở khoá khi đạt ${def.unlock} dân`, fp };
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
  c.services.push({ type, x: fp.x, y: fp.y, dir });
  c.money -= SERVICES[type].cost;
  rebuildOcc(c);
  c.dirty.services = c.dirty.zones = c.dirty.trees = c.dirty.buildings = true;
  computeMaps(c); computeNetworks(c); recalc(c);
  return { ok: true, cost: SERVICES[type].cost, linked: c.services[c.services.length - 1].linked };
}

// ───────────────────────── bản đồ phủ, thống kê ─────────────────────────

function stamp(map, cx, cy, radius, strength, add) {
  const r = Math.ceil(radius);
  for (let y = Math.max(0, cy - r); y <= Math.min(N - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(N - 1, cx + r); x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > radius) continue;
    const v = strength * (1 - d / (radius + 1)), i = idx(x, y);
    map[i] = add ? Math.min(1, map[i] + v) : Math.max(map[i], v);
  }
}

/** Vùng phủ dịch vụ, ô nhiễm, giá trị đất. */
export function computeMaps(c) {
  for (const m of Object.values(c.cover)) m.fill(0);
  c.pollution.fill(0);
  const trashEff = c.stats.trashUse > c.stats.trashCap && c.stats.trashUse > 0 ? c.stats.trashCap / c.stats.trashUse : 1;
  for (const s of c.services) {
    const def = SERVICES[s.type], cx = s.x + ((def.size - 1) >> 1), cy = s.y + ((def.size - 1) >> 1);
    if (def.cover) stamp(c.cover[def.cover], cx, cy, def.radius, def.cover === 'trash' ? trashEff : 1, false);
    if (def.pollute) stamp(c.pollution, cx, cy, def.pollute, Math.min(1, def.pollute / 5), true);
  }
  const POL = [0, 0.4, 0.55, 0.25];
  for (let i = 0; i < N * N; i++) if (c.zone[i] === 3 && c.level[i]) stamp(c.pollution, i % N, (i / N) | 0, 4.5, POL[c.level[i]], true);
  const needTrash = c.stats.pop >= 150;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    let v = 26 + c.cover.park[i] * 20 + c.cover.police[i] * 10 + c.cover.fire[i] * 8 + c.cover.health[i] * 11 + c.cover.edu[i] * 13 - c.pollution[i] * 50;
    if (needTrash && c.cover.trash[i] < 0.05) v -= 12;
    let shore = 0;
    for (let d = 0; d < 4 && !shore; d++) for (let k = 1; k <= 3; k++) { const a = x + [1, 0, -1, 0][d] * k, b = y + [0, 1, 0, -1][d] * k; if (inMap(a, b) && c.water[idx(a, b)]) { shore = 1; break; } }
    v += shore * 10;
    c.landValue[i] = clamp(v, 0, 100);
  }
}

/** Mức hài lòng của một ô nhà (0..100) và những thứ đang thiếu. */
export function cellHappy(c, i) {
  const s = c.stats, needs = [];
  let h = 38 + c.landValue[i] * 0.5 - (c.tax.r - 9) * 3 - (s.unemp || 0) * 25;
  if (c.pOk[i] !== 1) { h -= 30; needs.push(c.pOk[i] ? 'Điện chập chờn' : 'Không có điện'); }
  if (c.wOk[i] !== 1) { h -= 20; needs.push(c.wOk[i] ? 'Nước yếu' : 'Không có nước'); }
  if (c.sOk[i] !== 1) { h -= 12; needs.push(c.sOk[i] ? 'Cống quá tải' : 'Không có chỗ xả nước thải'); }
  if (s.pop >= 150 && c.cover.trash[i] < 0.05) needs.push('Rác không ai thu gom');
  if (c.pollution[i] > 0.25) needs.push('Ô nhiễm');
  if (c.cover.health[i] < 0.05 && s.pop >= 120) needs.push('Xa trạm y tế');
  if (c.cover.fire[i] < 0.05 && s.pop >= 400) needs.push('Ngoài vùng cứu hoả');
  if (c.cover.police[i] < 0.05 && s.pop >= 400) needs.push('Ngoài vùng công an');
  return { happy: clamp(h, 0, 100), needs };
}

/** Thống kê: dân, việc làm, điện nước, thu chi, hạnh phúc, nhu cầu. */
export function recalc(c) {
  const s = c.stats;
  let pop = 0, jobsC = 0, jobsI = 0, pUse = 0, wUse = 0, tUse = 0;
  for (let i = 0; i < N * N; i++) {
    const L = c.level[i];
    if (!L) continue;
    const z = c.zone[i], cap = CAP[z][L - 1];
    if (z === 1) pop += cap; else if (z === 2) jobsC += cap; else jobsI += cap;
    pUse += POWER_USE[z][L - 1]; wUse += WATER_USE[z][L - 1]; tUse += TRASH_USE[z][L - 1];
  }
  let pCap = 0, wCap = 0, sCap = 0, tCap = 0, civic = 0, roadLen = 0;
  const exp = { roads: 0, power: 0, water: 0, trash: 0, park: 0, civic: 0, loans: 0 };
  for (const e of c.edges.values()) { roadLen += e.len; exp.roads += e.len * ROADS[e.type].upkeep; }
  let lineUp = { power: 0, pipe: 0 };
  for (const ln of c.lines) lineUp[ln.kind] += Math.hypot(ln.bx - ln.ax, ln.bz - ln.az) * LINES[ln.kind].upkeep;
  for (const sv of c.services) {
    const def = SERVICES[sv.type];
    if (sv.linked) { pCap += def.power || 0; wCap += def.water || 0; sCap += def.sewage || 0; } // chưa nối mạng thì chưa tính
    tCap += def.trash || 0; exp[def.group] += def.upkeep;
    if (def.group === 'civic') civic++;
  }
  exp.power += lineUp.power; exp.water += lineUp.pipe;
  for (const ln of c.loans) exp.loans += ln.monthly;
  for (const k in exp) exp[k] = Math.round(exp[k]);
  const jobs = jobsC + jobsI + civic * 10;
  const workers = pop * 0.55;
  const unemp = workers > jobs && workers > 0 ? (workers - jobs) / workers : 0;
  Object.assign(s, { pop, jobsC, jobsI, jobs, workers: Math.round(workers), unemp, powerCap: pCap, powerUse: pUse, waterCap: wCap, waterUse: wUse, sewCap: sCap, trashCap: tCap, trashUse: tUse, roadLen });
  let hs = 0, hn = 0;
  for (let i = 0; i < N * N; i++) if (c.level[i] && c.zone[i] === 1) { const cap = CAP[1][c.level[i] - 1]; hs += cellHappy(c, i).happy * cap; hn += cap; }
  const happy = hn ? hs / hn : 55;
  const inc = { r: Math.round((c.tax.r / 9) * pop * 1.1), c: Math.round((c.tax.c / 9) * jobsC * 1.8), i: Math.round((c.tax.i / 9) * jobsI * 1.5) };
  Object.assign(s, { happy, inc, income: inc.r + inc.c + inc.i, expense: Object.values(exp).reduce((a, b) => a + b, 0), exp });
  const tm = (t) => (9 - t) * 0.05;
  const early = 0.6 * Math.max(0, 1 - pop / 400);
  const needC = pop * 0.2 + 8, needI = pop * 0.35 + 10;
  c.demand.r = clamp(early + clamp((jobs - workers) / Math.max(60, workers * 0.5), -1, 0.6) + (happy - 45) / 80 + tm(c.tax.r), -1, 1);
  c.demand.c = clamp((needC - jobsC) / Math.max(30, needC) + tm(c.tax.c), -1, 1);
  c.demand.i = clamp((needI - jobsI) / Math.max(30, needI) + tm(c.tax.i), -1, 1);
  return s;
}

function canLevelUp(c, i) {
  const z = c.zone[i], L = c.level[i], lv = c.landValue[i], pop = c.stats.pop;
  if (L >= 3 || c.age[i] < 25 * L) return false;
  if (z === 1) return lv >= (L === 1 ? 40 : 58);
  if (z === 2) return L === 1 ? lv >= 34 && pop >= 250 : lv >= 50 && pop >= 1000;
  return L === 1 ? pop >= 200 : c.cover.edu[i] > 0.25 && pop >= 800;
}

/** Điều kiện còn thiếu để một ô nhà lên cấp (chuỗi mô tả, rỗng nếu đã tối đa). */
export function levelHint(c, i) {
  const z = c.zone[i], L = c.level[i], pop = c.stats.pop;
  if (!L || L >= 3) return '';
  if (z === 1) return `Giá trị đất từ ${L === 1 ? 40 : 58}`;
  if (z === 2) return L === 1 ? `Giá trị đất từ 34, thành phố từ 250 dân${pop < 250 ? ' (chưa đủ)' : ''}` : 'Giá trị đất từ 50, thành phố từ 1.000 dân';
  return L === 1 ? 'Thành phố từ 200 dân' : 'Trong vùng phủ trường học, thành phố từ 800 dân';
}

// ───────────────────────── vay nợ ─────────────────────────

export function takeLoan(c, k) {
  const def = LOANS[k];
  if (!def) return { ok: false, reason: 'Không có khoản vay này' };
  if (c.loans.length >= MAX_LOANS) return { ok: false, reason: `Chỉ được vay tối đa ${MAX_LOANS} khoản cùng lúc` };
  c.loans.push({ amount: def.amount, monthly: Math.round((def.amount * (1 + def.rate)) / def.months), left: def.months });
  c.money += def.amount; c.debtDays = 0;
  recalc(c);
  return { ok: true };
}

// ───────────────────────── vòng mô phỏng ─────────────────────────

/** Một ngày trôi qua. */
export function tick(c) {
  if (c.over) return;
  c.day++;
  const rng = c.rng, s = c.stats;
  if (c.day % 5 === 0) computeMaps(c);
  computeNetworks(c);
  const zoned = [];
  for (let i = 0; i < N * N; i++) {
    if (!c.zone[i]) continue;
    zoned.push(i);
    if (c.level[i] && c.age[i] < 60000) c.age[i]++;
  }
  const dm = [0, c.demand.r, c.demand.c, c.demand.i];
  const samples = Math.min(zoned.length, Math.ceil(10 + zoned.length * 0.08));
  let built = false;
  for (let k = 0; k < samples; k++) {
    const i = zoned[(rng() * zoned.length) | 0], z = c.zone[i];
    const ok = c.pOk[i] === 1 && c.wOk[i] === 1 && c.sOk[i] === 1;
    if (!c.level[i]) {
      if (!c.acc[i] || !ok || !c.room(i)) continue;
      if (rng() < Math.max(0, dm[z]) * 0.4) {
        c.level[i] = 1; c.variant[i] = (rng() * 3) | 0; c.dir[i] = c.rdir[i]; c.age[i] = 0; c.tree[i] = 0;
        c.dirty.buildings = c.dirty.trees = true; built = true;
        computeNetworks(c); // cập nhật phần công suất còn dư
      }
    } else if (!c.acc[i]) {
      if (rng() < 0.3) { clearBuilding(c, i); c.zone[i] = 0; c.dirty.zones = true; }
    } else if (dm[z] < -0.55 && rng() < 0.04) {
      clearBuilding(c, i);
    } else if (!ok && rng() < (c.pOk[i] === 0 || c.wOk[i] === 0 ? 0.06 : 0.02)) {
      clearBuilding(c, i); // bỏ hoang vì thiếu điện nước
    } else if (ok && dm[z] > -0.1 && canLevelUp(c, i) && c.room(i) && rng() < 0.2) {
      c.level[i]++; c.age[i] = 0; c.variant[i] = (rng() * 3) | 0; c.dirty.buildings = true; built = true;
    }
  }
  // cháy nhà ngoài vùng cứu hoả
  if (c.day % 7 === 0 && s.pop >= 400 && zoned.length) {
    for (let k = 0; k < 6; k++) {
      const i = zoned[(rng() * zoned.length) | 0];
      if (c.level[i] && c.cover.fire[i] < 0.05 && rng() < 0.12) {
        c.events.push({ type: 'fire', x: i % N, y: (i / N) | 0, zone: c.zone[i] });
        clearBuilding(c, i); built = true;
        break;
      }
    }
  }
  if (built) computeNetworks(c);
  recalc(c);
  c.money += (s.income - s.expense) / 30;
  for (const ln of c.loans) ln.left -= 1 / 30;
  if (c.loans.some((ln) => ln.left <= 0)) { c.loans = c.loans.filter((ln) => ln.left > 0); c.events.push({ type: 'loanPaid' }); recalc(c); }
  c.debtDays = c.money < 0 ? c.debtDays + 1 : 0;
  if (c.money < BANKRUPT_AT || c.debtDays > BANKRUPT_DAYS) { c.over = true; c.events.push({ type: 'bankrupt' }); }
  while (c.milestone < MILESTONES.length && s.pop >= MILESTONES[c.milestone].pop) {
    const m = MILESTONES[c.milestone++];
    c.money += m.reward;
    const unlocked = Object.values(SERVICES).filter((d) => d.unlock && d.unlock <= m.pop && !MILESTONES.some((o, k) => k < c.milestone - 1 && o.pop >= d.unlock)).map((d) => d.name);
    c.events.push({ type: 'milestone', name: m.name, reward: m.reward, unlocked });
  }
}

// ───────────────────────── lưu / nạp ─────────────────────────

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (str, n) => { const s = atob(str), u = new Uint8Array(n); for (let i = 0; i < n && i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const r1 = (v) => Math.round(v * 10) / 10;

export function serialize(c) {
  const pack = (k) => b64(c[k]);
  return {
    v: 2, n: N, seed: c.seed, name: c.name, money: Math.round(c.money), day: c.day, tax: c.tax, milestone: c.milestone, start: c.start,
    loans: c.loans, debtDays: c.debtDays, over: c.over, nextId: c.nextId,
    nodes: [...c.nodes.values()].map((n) => [n.id, r1(n.x), r1(n.z)]),
    edges: [...c.edges.values()].map((e) => [e.id, e.a, e.b, e.type, r1(e.cx), r1(e.cz)]),
    lines: c.lines.map((l) => [l.kind, r1(l.ax), r1(l.az), r1(l.bx), r1(l.bz)]),
    services: c.services.map((s) => ({ type: s.type, x: s.x, y: s.y, dir: s.dir })),
    tree: pack('tree'), zone: pack('zone'), level: pack('level'), variant: pack('variant'), dir: pack('dir'),
  };
}

export function deserialize(o) {
  if (!o || o.v !== 2 || o.n !== N) throw new Error('Bản lưu không hợp lệ hoặc thuộc phiên bản cũ');
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  const c = {
    v: 2, seed: o.seed | 0, name: String(o.name || 'Phố Mới').slice(0, 24), money: num(o.money, 0), day: o.day | 0, milestone: o.milestone | 0,
    tax: { r: clamp(num(o.tax?.r, 9), 1, 20), c: clamp(num(o.tax?.c, 9), 1, 20), i: clamp(num(o.tax?.i, 9), 1, 20) },
    start: { x: clamp(o.start?.x | 0, 0, N - 1), y: clamp(o.start?.y | 0, 0, N - 1) },
    loans: (o.loans || []).slice(0, MAX_LOANS).map((l) => ({ amount: num(l.amount, 0), monthly: num(l.monthly, 0), left: num(l.left, 0) })),
    debtDays: o.debtDays | 0, over: !!o.over, nextId: Math.max(1, o.nextId | 0),
    nodes: new Map(), edges: new Map(), water: new Uint8Array(N * N),
    lines: (o.lines || []).filter((l) => LINES[l[0]]).map((l) => ({ kind: l[0], ax: num(l[1], 0), az: num(l[2], 0), bx: num(l[3], 0), bz: num(l[4], 0) })),
    services: (o.services || []).filter((s) => SERVICES[s.type] && inMap(s.x | 0, s.y | 0) && inMap((s.x | 0) + SERVICES[s.type].size - 1, (s.y | 0) + SERVICES[s.type].size - 1)).map((s) => ({ type: s.type, x: s.x | 0, y: s.y | 0, dir: s.dir & 3 })),
  };
  for (const k of ['tree', 'zone', 'level', 'variant', 'dir']) c[k] = unb64(o[k] || '', N * N);
  for (let i = 0; i < N * N; i++) { if (c.zone[i] > 3) c.zone[i] = 0; if (c.level[i] > 3 || !c.zone[i]) c.level[i] = 0; }
  const keepTree = c.tree;
  c.tree = new Uint8Array(N * N); genLand(c); c.tree = keepTree; // nước sinh lại từ seed
  for (let i = 0; i < N * N; i++) if (c.water[i]) { c.tree[i] = 0; c.zone[i] = 0; c.level[i] = 0; }
  attach(c);
  for (const n of o.nodes || []) { const id = n[0] | 0; c.nodes.set(id, { id, x: num(n[1], 0), z: num(n[2], 0) }); c.nextId = Math.max(c.nextId, id + 1); }
  for (const e of o.edges || []) {
    const id = e[0] | 0;
    if (!c.nodes.has(e[1]) || !c.nodes.has(e[2]) || !ROADS[e[3]] || e[1] === e[2]) continue;
    const keep = c.nextId; c.nextId = id;
    addEdge(c, e[1], e[2], e[3], num(e[4], null), num(e[5], null));
    c.nextId = Math.max(keep, id + 1);
  }
  for (let i = 0; i < N * N; i++) if (c.level[i]) c.age[i] = 30;
  roadsChanged(c);
  computeMaps(c); recalc(c);
  return c;
}

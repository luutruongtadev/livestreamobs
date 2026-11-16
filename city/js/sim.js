// Phố Mới — phần mô phỏng thành phố (không đụng DOM, chạy được cả trong Node để test).
export const N = 96; // bản đồ N x N ô
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const ZONE = { NONE: 0, R: 1, C: 2, I: 3 };
export const ZONE_NAME = ['Chưa quy hoạch', 'Khu dân cư', 'Khu thương mại', 'Khu công nghiệp'];

// sức chứa theo cấp 1..3: dân (R) hoặc chỗ làm (C, I)
export const CAP = { 1: [6, 20, 60], 2: [4, 12, 40], 3: [6, 14, 30] };
const POWER_USE = { 1: [1, 3, 8], 2: [2, 5, 12], 3: [3, 8, 16] };
const WATER_USE = { 1: [1, 3, 8], 2: [1, 3, 7], 3: [2, 6, 12] };

export const ROAD_COST = 40;
export const BRIDGE_COST = 180;

// công trình đặt tay. size: cạnh ô vuông; unlock: mốc dân số cần đạt
export const SERVICES = {
  wind: { name: 'Tua-bin gió', icon: '🌬️', group: 'power', cost: 5000, upkeep: 70, size: 1, power: 60, unlock: 0, desc: 'Điện sạch, công suất nhỏ' },
  solar: { name: 'Trại điện mặt trời', icon: '🔆', group: 'power', cost: 12000, upkeep: 150, size: 2, power: 170, unlock: 400, desc: 'Điện sạch, công suất vừa' },
  coal: { name: 'Nhà máy nhiệt điện', icon: '🏭', group: 'power', cost: 22000, upkeep: 520, size: 3, power: 520, pollute: 9, unlock: 1000, desc: 'Điện nhiều nhưng gây ô nhiễm rộng' },
  tower: { name: 'Tháp nước', icon: '🗼', group: 'water', cost: 3000, upkeep: 50, size: 1, water: 250, unlock: 0, desc: 'Cấp nước, đặt ở đâu cũng được' },
  pump: { name: 'Trạm bơm nước', icon: '💧', group: 'water', cost: 7000, upkeep: 140, size: 2, water: 1000, needWater: true, unlock: 0, desc: 'Cấp nhiều nước, phải đặt sát bờ sông / biển' },
  park: { name: 'Công viên nhỏ', icon: '🌳', group: 'park', cost: 800, upkeep: 12, size: 1, cover: 'park', radius: 5, unlock: 0, desc: 'Tăng giá trị đất xung quanh' },
  plaza: { name: 'Quảng trường', icon: '⛲', group: 'park', cost: 3500, upkeep: 45, size: 2, cover: 'park', radius: 9, unlock: 400, desc: 'Tăng giá trị đất trên vùng rộng' },
  stadium: { name: 'Sân vận động', icon: '🏟️', group: 'park', cost: 45000, upkeep: 700, size: 4, cover: 'park', radius: 18, road: true, unlock: 2500, desc: 'Niềm tự hào của thành phố' },
  clinic: { name: 'Trạm y tế', icon: '🏥', group: 'civic', cost: 9000, upkeep: 190, size: 2, cover: 'health', radius: 14, road: true, unlock: 120, desc: 'Chăm sóc sức khoẻ, dân vui hơn' },
  school: { name: 'Trường học', icon: '🏫', group: 'civic', cost: 9500, upkeep: 200, size: 2, cover: 'edu', radius: 14, road: true, unlock: 120, desc: 'Giáo dục, giúp nhà cửa lên cấp' },
  police: { name: 'Đồn công an', icon: '🚓', group: 'civic', cost: 8000, upkeep: 160, size: 2, cover: 'police', radius: 16, road: true, unlock: 400, desc: 'An ninh, tăng giá trị đất' },
  fire: { name: 'Trạm cứu hoả', icon: '🚒', group: 'civic', cost: 7500, upkeep: 150, size: 2, cover: 'fire', radius: 16, road: true, unlock: 400, desc: 'An toàn cháy nổ, tăng giá trị đất' },
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

/** Trường địa hình liên tục theo toạ độ ô: dương = đất liền, âm = nước (sông, hồ, biển phía nam). */
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

export function newCity(seed = (Math.random() * 1e9) | 0) {
  const c = {
    v: 1, seed, name: 'Phố Mới',
    water: new Uint8Array(N * N), tree: new Uint8Array(N * N), road: new Uint8Array(N * N),
    zone: new Uint8Array(N * N), level: new Uint8Array(N * N), variant: new Uint8Array(N * N),
    dir: new Uint8Array(N * N), age: new Uint16Array(N * N), born: new Float32Array(N * N),
    services: [], money: 70000, day: 0, tax: 9, milestone: 0,
  };
  const f = makeField(seed);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (f(x + 0.5, y + 0.5) < 0.15) { c.water[i] = 1; continue; }
    const n = vnoise(x * 0.09, y * 0.09, seed + 11), h = hash2(x, y, seed + 13);
    if ((n > 0.6 && h > 0.25) || h > 0.975) c.tree[i] = 1;
  }
  // đường dẫn vào thành phố từ mép bắc, chọn cột toàn đất liền
  let sx = (N * 0.55) | 0;
  for (let k = 0; k < N; k++) {
    const x = ((N * 0.55) | 0) + (k % 2 ? -1 : 1) * ((k + 1) >> 1);
    if (x < 4 || x >= N - 4) continue;
    let ok = true;
    for (let y = 0; y < 12; y++) for (let d = -3; d <= 3; d++) if (c.water[idx(x + d, y)]) ok = false;
    if (ok) { sx = x; break; }
  }
  for (let y = 0; y < 8; y++) { const i = idx(sx, y); c.road[i] = 1; c.tree[i] = 0; c.water[i] = 0; }
  c.start = { x: sx, y: 7 };
  return attach(c);
}

/** Gắn phần dữ liệu tính lại được (không lưu). */
function attach(c) {
  c.occ = new Int16Array(N * N);
  c.landValue = new Float32Array(N * N).fill(30);
  c.pollution = new Float32Array(N * N);
  c.cover = { park: new Float32Array(N * N), police: new Float32Array(N * N), fire: new Float32Array(N * N), health: new Float32Array(N * N), edu: new Float32Array(N * N) };
  c.dirty = { roads: true, buildings: true, trees: true, zones: true, services: true };
  c.events = [];
  c.stats = { pop: 0, jobsC: 0, jobsI: 0, jobs: 0, powerCap: 0, powerUse: 0, waterCap: 0, waterUse: 0, income: 0, expense: 0, roads: 0, happy: 50, exp: {} };
  c.demand = { r: 0.6, c: 0.2, i: 0.2 };
  c.rng = mulberry32(c.seed ^ (c.day * 2654435761));
  rebuildOcc(c);
  computeMaps(c);
  recalc(c);
  return c;
}

function rebuildOcc(c) {
  c.occ.fill(0);
  c.services.forEach((s, k) => {
    const sz = SERVICES[s.type].size;
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) c.occ[idx(s.x + dx, s.y + dy)] = k + 1;
  });
}

/** Hướng (0..3) tới ô đường gần nhất trong tầm 2 ô, -1 nếu không có. */
export function roadDir(c, x, y) {
  for (let d = 0; d < 4; d++) { const a = x + DX[d], b = y + DY[d]; if (inMap(a, b) && c.road[idx(a, b)]) return d; }
  for (let d = 0; d < 4; d++) {
    const a = x + DX[d], b = y + DY[d], a2 = a + DX[d], b2 = b + DY[d];
    // ô ở giữa phải trống đường đi (không phải nước) thì mới coi là tới được
    if (inMap(a2, b2) && c.road[idx(a2, b2)] && !c.water[idx(a, b)]) return d;
  }
  return -1;
}

/** Đường chữ L từ (x0,y0) tới (x1,y1): đi hết trục dài trước. */
export function linePath(x0, y0, x1, y1) {
  const out = [];
  const xFirst = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  let x = x0, y = y0;
  out.push([x, y]);
  const stepX = () => { while (x !== x1) { x += Math.sign(x1 - x); out.push([x, y]); } };
  const stepY = () => { while (y !== y1) { y += Math.sign(y1 - y); out.push([x, y]); } };
  if (xFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  return out;
}

export function roadCost(c, tiles) {
  let cost = 0;
  for (const [x, y] of tiles) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (c.road[i] || c.occ[i]) continue;
    cost += c.water[i] ? BRIDGE_COST : ROAD_COST;
  }
  return cost;
}

function clearBuilding(c, i) {
  if (c.level[i]) { c.level[i] = 0; c.age[i] = 0; c.dirty.buildings = true; }
}

export function buildRoad(c, tiles) {
  const cost = roadCost(c, tiles);
  if (cost <= 0) return { ok: false, reason: 'Không có ô nào xây được' };
  if (cost > c.money) return { ok: false, reason: 'Không đủ tiền' };
  for (const [x, y] of tiles) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (c.road[i] || c.occ[i]) continue;
    c.road[i] = 1; c.tree[i] = 0; c.zone[i] = 0; clearBuilding(c, i);
  }
  c.money -= cost;
  c.dirty.roads = c.dirty.trees = c.dirty.zones = c.dirty.buildings = true;
  return { ok: true, cost };
}

export function zoneRect(c, x0, y0, x1, y1, z) {
  let n = 0;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (c.water[i] || c.road[i] || c.occ[i] || c.zone[i] === z) continue;
    if (c.level[i]) { if (z !== 0) continue; clearBuilding(c, i); } // chỉ "bỏ quy hoạch" mới dỡ nhà
    c.zone[i] = z; n++;
  }
  if (n) c.dirty.zones = true;
  return { ok: n > 0, count: n };
}

export function bulldozeRect(c, x0, y0, x1, y1) {
  let n = 0;
  const kill = new Set();
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (c.occ[i]) { kill.add(c.occ[i] - 1); continue; }
    if (c.road[i]) { c.road[i] = 0; n++; c.dirty.roads = true; }
    if (c.level[i]) { clearBuilding(c, i); n++; }
    if (c.tree[i]) { c.tree[i] = 0; n++; c.dirty.trees = true; }
  }
  if (kill.size) {
    c.services = c.services.filter((_, k) => !kill.has(k));
    rebuildOcc(c); c.dirty.services = true; n += kill.size;
    computeMaps(c);
  }
  if (n) recalc(c);
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
    } else {
      const corner = (dx < 0 || dx >= fp.size) && (dy < 0 || dy >= fp.size);
      if (c.water[i]) nearWater = true;
      if (c.road[i] && !corner) nearRoad = true;
    }
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
  let dir = 1;
  // quay mặt ra đường
  for (let d = 0; d < 4; d++) {
    let found = false;
    for (let k = 0; k < fp.size && !found; k++) {
      const a = d === 0 ? fp.x + fp.size : d === 2 ? fp.x - 1 : fp.x + k;
      const b = d === 1 ? fp.y + fp.size : d === 3 ? fp.y - 1 : fp.y + k;
      if (inMap(a, b) && c.road[idx(a, b)]) found = true;
    }
    if (found) { dir = d; break; }
  }
  for (let dy = 0; dy < fp.size; dy++) for (let dx = 0; dx < fp.size; dx++) {
    const i = idx(fp.x + dx, fp.y + dy);
    c.zone[i] = 0; c.tree[i] = 0; clearBuilding(c, i);
  }
  c.services.push({ type, x: fp.x, y: fp.y, dir });
  c.money -= SERVICES[type].cost;
  rebuildOcc(c);
  c.dirty.services = c.dirty.zones = c.dirty.trees = c.dirty.buildings = true;
  computeMaps(c); recalc(c);
  return { ok: true, cost: SERVICES[type].cost };
}

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
  for (const s of c.services) {
    const def = SERVICES[s.type], cx = s.x + ((def.size - 1) >> 1), cy = s.y + ((def.size - 1) >> 1);
    if (def.cover) stamp(c.cover[def.cover], cx, cy, def.radius, 1, false);
    if (def.pollute) stamp(c.pollution, cx, cy, def.pollute, 1, true);
  }
  const POL = [0, 0.4, 0.55, 0.25];
  for (let i = 0; i < N * N; i++) if (c.zone[i] === 3 && c.level[i]) stamp(c.pollution, i % N, (i / N) | 0, 4.5, POL[c.level[i]], true);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    let v = 26 + c.cover.park[i] * 20 + c.cover.police[i] * 10 + c.cover.fire[i] * 8 + c.cover.health[i] * 11 + c.cover.edu[i] * 13 - c.pollution[i] * 50;
    let shore = 0;
    for (let d = 0; d < 4 && !shore; d++) for (let k = 1; k <= 3; k++) { const a = x + DX[d] * k, b = y + DY[d] * k; if (inMap(a, b) && c.water[idx(a, b)]) { shore = 1; break; } }
    v += shore * 10;
    c.landValue[i] = Math.max(0, Math.min(100, v));
  }
}

/** Thống kê: dân, việc làm, điện nước, thu chi, hạnh phúc, nhu cầu. */
export function recalc(c) {
  const s = c.stats;
  let pop = 0, jobsC = 0, jobsI = 0, pUse = 0, wUse = 0, roads = 0, bridges = 0, lvSum = 0, lvN = 0;
  for (let i = 0; i < N * N; i++) {
    if (c.road[i]) { roads++; if (c.water[i]) bridges++; }
    const L = c.level[i];
    if (!L) continue;
    const z = c.zone[i], cap = CAP[z][L - 1];
    if (z === 1) { pop += cap; lvSum += c.landValue[i] * cap; lvN += cap; } else if (z === 2) jobsC += cap; else jobsI += cap;
    pUse += POWER_USE[z][L - 1]; wUse += WATER_USE[z][L - 1];
  }
  let pCap = 0, wCap = 0, upkeep = 0, civic = 0;
  const exp = { roads: Math.round(roads * 0.6 + bridges * 2), power: 0, water: 0, park: 0, civic: 0 };
  for (const sv of c.services) {
    const def = SERVICES[sv.type];
    pCap += def.power || 0; wCap += def.water || 0; upkeep += def.upkeep; exp[def.group] += def.upkeep;
    if (def.group === 'civic') civic++;
  }
  const jobs = jobsC + jobsI + civic * 10;
  const workers = pop * 0.55;
  const pShort = pUse > pCap ? 1 - pCap / pUse : 0, wShort = wUse > wCap ? 1 - wCap / wUse : 0;
  const unemp = workers > jobs && workers > 0 ? (workers - jobs) / workers : 0;
  let happy = lvN ? 38 + (lvSum / lvN) * 0.5 : 55;
  happy -= pShort * 30 + wShort * 30 + (c.tax - 9) * 3 + unemp * 25;
  happy = Math.max(0, Math.min(100, happy));
  Object.assign(s, {
    pop, jobsC, jobsI, jobs, workers: Math.round(workers), powerCap: pCap, powerUse: pUse, waterCap: wCap, waterUse: wUse, roads, happy, pShort, wShort,
    income: Math.round((c.tax / 9) * (pop * 1.1 + jobsC * 1.8 + jobsI * 1.5)),
    expense: Math.round(exp.roads + upkeep), exp,
  });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const taxMod = (9 - c.tax) * 0.05;
  const early = 0.6 * Math.max(0, 1 - pop / 400);
  const needC = pop * 0.2 + 8, needI = pop * 0.35 + 10;
  c.demand.r = clamp(early + clamp((jobs - workers) / Math.max(60, workers * 0.5), -1, 0.6) + (happy - 45) / 80 + taxMod, -1, 1);
  c.demand.c = clamp((needC - jobsC) / Math.max(30, needC) + taxMod, -1, 1);
  c.demand.i = clamp((needI - jobsI) / Math.max(30, needI) + taxMod, -1, 1);
  return s;
}

function canLevelUp(c, i) {
  const z = c.zone[i], L = c.level[i], lv = c.landValue[i], pop = c.stats.pop;
  if (L >= 3 || c.age[i] < 25 * L) return false;
  if (z === 1) return lv >= (L === 1 ? 40 : 58);
  if (z === 2) return L === 1 ? lv >= 34 && pop >= 250 : lv >= 50 && pop >= 1000;
  return L === 1 ? pop >= 200 : c.cover.edu[i] > 0.25 && pop >= 800;
}

/** Một ngày trôi qua. */
export function tick(c) {
  c.day++;
  const rng = c.rng, s = c.stats;
  if (c.day % 5 === 0) computeMaps(c);
  const zoned = [];
  for (let i = 0; i < N * N; i++) {
    if (!c.zone[i]) continue;
    zoned.push(i);
    if (c.level[i] && c.age[i] < 60000) c.age[i]++;
  }
  const utilOk = s.powerCap > 0 && s.waterCap > 0 && s.powerUse < s.powerCap && s.waterUse < s.waterCap;
  const dm = [0, c.demand.r, c.demand.c, c.demand.i];
  const samples = Math.min(zoned.length, Math.ceil(10 + zoned.length * 0.08));
  for (let k = 0; k < samples; k++) {
    const i = zoned[(rng() * zoned.length) | 0], z = c.zone[i], x = i % N, y = (i / N) | 0;
    const d = roadDir(c, x, y);
    if (!c.level[i]) {
      if (d < 0 || !utilOk) continue;
      if (rng() < Math.max(0, dm[z]) * 0.4) {
        c.level[i] = 1; c.variant[i] = (rng() * 3) | 0; c.dir[i] = d; c.age[i] = 0; c.born[i] = c.day; c.tree[i] = 0;
        c.dirty.buildings = c.dirty.trees = true;
      }
    } else if (d < 0) {
      if (rng() < 0.3) clearBuilding(c, i);
    } else if (dm[z] < -0.55 && rng() < 0.04) {
      clearBuilding(c, i);
    } else if ((s.pShort > 0.25 || s.wShort > 0.25) && rng() < 0.03) {
      clearBuilding(c, i);
    } else if (utilOk && dm[z] > -0.1 && canLevelUp(c, i) && rng() < 0.2) {
      c.level[i]++; c.age[i] = 0; c.born[i] = c.day; c.variant[i] = (rng() * 3) | 0; c.dirty.buildings = true;
    }
  }
  recalc(c);
  c.money += (s.income - s.expense) / 30;
  while (c.milestone < MILESTONES.length && s.pop >= MILESTONES[c.milestone].pop) {
    const m = MILESTONES[c.milestone++];
    c.money += m.reward;
    const unlocked = Object.values(SERVICES).filter((d) => d.unlock && d.unlock <= m.pop && !MILESTONES.some((o, k) => k < c.milestone - 1 && o.pop >= d.unlock)).map((d) => d.name);
    c.events.push({ type: 'milestone', name: m.name, reward: m.reward, unlocked });
  }
}

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (str, n) => { const s = atob(str), u = new Uint8Array(n); for (let i = 0; i < n && i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

export function serialize(c) {
  const pack = (k) => b64(c[k]);
  return {
    v: 1, n: N, seed: c.seed, name: c.name, money: Math.round(c.money), day: c.day, tax: c.tax, milestone: c.milestone, start: c.start,
    services: c.services, water: pack('water'), tree: pack('tree'), road: pack('road'), zone: pack('zone'), level: pack('level'), variant: pack('variant'), dir: pack('dir'),
  };
}

export function deserialize(o) {
  if (!o || o.v !== 1 || o.n !== N) throw new Error('Bản lưu không hợp lệ');
  const c = {
    v: 1, seed: o.seed, name: o.name || 'Phố Mới', money: +o.money || 0, day: o.day | 0, tax: +o.tax || 9, milestone: o.milestone | 0, start: o.start || { x: N >> 1, y: 8 },
    services: (o.services || []).filter((s) => SERVICES[s.type]).map((s) => ({ type: s.type, x: s.x | 0, y: s.y | 0, dir: s.dir | 0 })),
    age: new Uint16Array(N * N), born: new Float32Array(N * N).fill(-100),
  };
  for (const k of ['water', 'tree', 'road', 'zone', 'level', 'variant', 'dir']) c[k] = unb64(o[k], N * N);
  for (let i = 0; i < N * N; i++) if (c.level[i]) c.age[i] = 30;
  return attach(c);
}

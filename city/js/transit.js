// Phố Mới — giao thông công cộng: xe buýt và tàu điện (chạy trên đường, kẹt cùng xe khác) và metro (ray riêng trên cao).
// Người dân tự chọn đi tuyến nào khi tổng thời gian đi bộ + chờ + ngồi xe có lợi hơn tự lái.
import { TRANSIT, MILESTONES, SERVICES, DEPOT_FREE, HALF, N, idx, cellOf, nearestOnEdge, cellX, cellZ, clamp } from './base.js';
import { spawnVehicle, reroute, findPath } from './traffic.js';

const WALK_SPEED = 7; // đơn vị / giây mô phỏng
const HUES = [0.02, 0.58, 0.13, 0.78, 0.33, 0.9, 0.48, 0.68];

export function initTransit(c) {
  c.transit = { lines: [], fare: 2, nextId: 1, riders: 0, ridersDay: 0, income: 0 };
}

/** Đoạn đường mặt đất gần nhất (trạm xe buýt, tàu điện không đặt trên đường trên cao). */
function nearestEdge(c, x, z, max = 12) {
  let best = null, bd = max;
  for (const e of c.edges.values()) { if (e.type === 'highway' || e.type === 'overpass') continue; const r = nearestOnEdge(e, x, z); if (r.d < bd) { bd = r.d; best = { edge: e, along: r.along, x: r.x, z: r.z }; } }
  return best;
}

export function modeUnlocked(c, mode) { const u = TRANSIT[mode].unlock; return !u || MILESTONES.some((m, k) => k < c.milestone && m.pop >= u); }
export function metroUnlocked(c) { return modeUnlocked(c, 'metro'); }

/** Xe buýt + tàu điện đang chạy và sức chứa của các bến xe. */
export function roadFleet(c) {
  let used = 0, cap = DEPOT_FREE;
  for (const l of c.transit.lines) if (TRANSIT[l.mode].road) used += l.count;
  for (const s of c.services) cap += SERVICES[s.type].depot || 0;
  return { used, cap };
}

/** Kiểm tra + tính giá một tuyến sắp tạo. pts: [{ x, z }] theo thứ tự trạm. */
export function planLine(c, mode, pts) {
  const def = TRANSIT[mode];
  let cost = pts.length * def.stopCost + def.vehCost, len = 0;
  for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
  if (mode === 'metro') cost += Math.round(len * def.trackCost);
  const out = { ok: false, cost, len };
  if (!modeUnlocked(c, mode)) return { ...out, reason: `${def.name} mở khoá khi đạt ${def.unlock} dân` };
  if (def.road) { const f = roadFleet(c); if (f.used + 1 > f.cap) return { ...out, reason: `Hết chỗ cho xe: ${f.used} / ${f.cap} xe, xây thêm 🚏 bến xe` }; }
  if (pts.some((p) => Math.abs(p.x) > HALF || Math.abs(p.z) > HALF)) return { ...out, reason: 'Ra ngoài bản đồ' };
  if (pts.some((p) => !c.own[idx(clamp(cellOf(p.x), 0, N - 1), clamp(cellOf(p.z), 0, N - 1))])) return { ...out, reason: 'Đất chưa mua: mở rộng bằng 🧭 Mua đất' };
  if (def.road && pts.some((p) => !nearestEdge(c, p.x, p.z))) return { ...out, reason: `Trạm ${mode === 'bus' ? 'xe buýt' : 'tàu điện'} phải nằm trên đường` };
  for (let k = 1; k < pts.length; k++) if (Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z) < 25) return { ...out, reason: 'Hai trạm quá gần nhau' };
  if (pts.length < 2) return { ...out, reason: 'Cần ít nhất 2 trạm' };
  if (cost > c.money) return { ...out, reason: 'Không đủ tiền' };
  return { ...out, ok: true };
}

export function addLine(c, mode, pts, free = false) {
  const r = free ? { ok: true, cost: 0 } : planLine(c, mode, pts);
  if (!r.ok) return r;
  const tr = c.transit, id = tr.nextId++;
  const line = { id, mode, count: 1, hue: HUES[(id - 1) % HUES.length], stops: pts.map((p) => ({ x: p.x, z: p.z, waiting: [] })), veh: [], riders: 0, ridersDay: 0 };
  if (TRANSIT[mode].road) for (const s of line.stops) { const e = nearestEdge(c, s.x, s.z); if (e) { s.x = e.x; s.z = e.z; } }
  tr.lines.push(line);
  c.money -= r.cost;
  maintainTransit(c);
  c.dirty.transit = true;
  return { ...r, line };
}

export function removeLine(c, id) {
  const tr = c.transit, line = tr.lines.find((l) => l.id === id);
  if (!line) return { ok: false };
  tr.lines = tr.lines.filter((l) => l !== line);
  for (const slot of line.veh) { for (const r of slot.riders) c.onArrive(c, r.cb, null); if (slot.v) c.traffic.vehicles = c.traffic.vehicles.filter((v) => v !== slot.v); }
  for (const s of line.stops) for (const r of s.waiting) c.onArrive(c, r.cb, null);
  c.dirty.transit = true;
  return { ok: true };
}

/** Thêm / bớt xe trên tuyến (thêm thì tốn tiền mua xe). */
export function setVehicles(c, id, n) {
  const line = c.transit.lines.find((l) => l.id === id);
  if (!line) return { ok: false };
  n = clamp(n | 0, 1, 8);
  const cost = Math.max(0, n - line.count) * TRANSIT[line.mode].vehCost;
  if (cost > c.money) return { ok: false, reason: 'Không đủ tiền' };
  if (TRANSIT[line.mode].road && n > line.count) { const f = roadFleet(c); if (f.used + n - line.count > f.cap) return { ok: false, reason: `Hết chỗ cho xe: ${f.used} / ${f.cap} xe, xây thêm 🚏 bến xe` }; }
  c.money -= cost; line.count = n;
  maintainTransit(c);
  return { ok: true, cost };
}

const stopPos = (s) => ({ edge: s.edge, along: s.along });

function spawnBus(c, line, slot, at) {
  const n = line.stops.length;
  for (let tryK = 0; tryK < n; tryK++) {
    const from = line.stops[(at + tryK) % n], to = line.stops[(at + tryK + 1) % n];
    const v = spawnVehicle(c, line.mode, stopPos(from), stopPos(to), { t: 'bus', line: line.id, slot: line.veh.indexOf(slot) }, line.hue);
    if (v) { slot.v = v; slot.next = (at + tryK + 1) % n; return true; }
  }
  slot.v = null;
  return false;
}

/** Gọi mỗi giờ và sau khi đường đổi: gắn lại trạm vào đường, tính quãng đường, bù xe còn thiếu. */
export function maintainTransit(c) {
  for (const line of c.transit.lines) {
    const def = TRANSIT[line.mode], n = line.stops.length;
    line.broken = false; line.pos = [0]; line.path = [];
    if (def.road) {
      for (const s of line.stops) { const e = nearestEdge(c, s.x, s.z, 14); if (e) { s.edge = e.edge; s.along = e.along; } else { s.edge = null; line.broken = true; } }
      line.legLen = [];
      for (let k = 0; k < n && !line.broken; k++) {
        const p = findPath(c, stopPos(line.stops[k]), stopPos(line.stops[(k + 1) % n]), line.mode);
        if (!p) { line.broken = true; break; }
        let len = 0;
        for (const st of p.steps) { len += st.e.len; const q = st.e.pts; for (let j = 0; j < q.length; j += 2) { const jj = st.fwd ? j : q.length - 2 - j; line.path.push(q[jj], q[jj + 1]); } }
        line.legLen.push(Math.max(20, len - p.startS - (p.steps[p.steps.length - 1].e.len - p.endS)));
      }
      line.loop = line.broken ? 0 : line.legLen.reduce((a, b) => a + b, 0);
    } else {
      for (let k = 1; k < n; k++) line.pos.push(line.pos[k - 1] + Math.hypot(line.stops[k].x - line.stops[k - 1].x, line.stops[k].z - line.stops[k - 1].z));
      line.loop = line.pos[n - 1] * 2;
      for (const s of line.stops) line.path.push(s.x, s.z);
    }
    line.headway = line.broken ? Infinity : (line.loop / def.speed + n * 2) / line.count;
    // đủ số xe
    while (line.veh.length > line.count) { const slot = line.veh.pop(); for (const r of slot.riders) c.onArrive(c, r.cb, null); if (slot.v) c.traffic.vehicles = c.traffic.vehicles.filter((v) => v !== slot.v); }
    while (line.veh.length < line.count) line.veh.push({ v: null, next: 0, riders: [], s: (line.loop / 2 / line.count) * line.veh.length, dir: 1, dwell: 0, at: -1 });
    if (def.road && !line.broken) line.veh.forEach((slot, k) => { if (!slot.v || !c.traffic.vehicles.includes(slot.v)) spawnBus(c, line, slot, Math.floor((k * n) / line.count) % n); });
  }
}

function exchange(c, line, slot, at) {
  const def = TRANSIT[line.mode], stop = line.stops[at];
  const stay = [];
  for (const r of slot.riders) { if (r.to === at) c.onArrive(c, r.cb, null); else stay.push(r); }
  slot.riders = stay;
  while (stop.waiting.length && slot.riders.length < def.cap) {
    slot.riders.push(stop.waiting.shift());
    c.money += c.transit.fare; c.transit.income += c.transit.fare; c.transit.riders++; line.riders++;
  }
}

/** Xe buýt tới trạm (hoặc bị mất): đổi khách rồi chạy tiếp trạm sau. */
export function onBusArrive(c, cb, v) {
  const line = c.transit.lines.find((l) => l.id === cb.line), slot = line && line.veh[cb.slot];
  if (!slot || (v && slot.v !== v)) return undefined;
  if (!v) { for (const r of slot.riders) c.onArrive(c, r.cb, null); slot.riders = []; slot.v = null; return undefined; } // xe kẹt cứng: bù xe mới ở lần bảo trì tới
  exchange(c, line, slot, slot.next);
  const n = line.stops.length;
  for (let k = 1; k <= n; k++) {
    const nx = (slot.next + k) % n;
    if (line.stops[nx].edge && reroute(c, v, stopPos(line.stops[nx]))) { slot.next = nx; v.hold = 1.4; return 'keep'; }
  }
  slot.v = null;
  return undefined;
}

/** Tàu metro chạy qua lại trên ray riêng. */
export function stepTransit(c, dt) {
  for (const line of c.transit.lines) {
    if (line.mode !== 'metro' || line.stops.length < 2) continue;
    const def = TRANSIT.metro, total = line.pos[line.pos.length - 1];
    for (const slot of line.veh) {
      if (slot.dwell > 0) { slot.dwell -= dt; continue; }
      const prev = slot.s;
      slot.s += slot.dir * def.speed * dt;
      // qua ga nào thì dừng ở ga đó
      for (let k = 0; k < line.pos.length; k++) {
        const p = line.pos[k];
        if (k !== slot.at && ((prev < p && slot.s >= p) || (prev > p && slot.s <= p) || (slot.at < 0 && Math.abs(slot.s - p) < 1))) {
          slot.s = p; slot.at = k; slot.dwell = 1.6;
          exchange(c, line, slot, k);
          if (k === 0) slot.dir = 1; else if (k === line.pos.length - 1) slot.dir = -1;
          break;
        }
      }
      slot.s = clamp(slot.s, 0, total);
      if (slot.s <= 0) slot.dir = 1; else if (slot.s >= total) slot.dir = -1;
    }
  }
}

/** Vị trí thế giới của một đoàn tàu metro: [x, z, hướng x, hướng z]. */
export function metroPoint(line, slot) {
  let k = 1;
  while (k < line.pos.length - 1 && line.pos[k] < slot.s) k++;
  const a = line.stops[k - 1], b = line.stops[k], l = line.pos[k] - line.pos[k - 1] || 1, f = clamp((slot.s - line.pos[k - 1]) / l, 0, 1);
  return [a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f, ((b.x - a.x) / l) * slot.dir, ((b.z - a.z) / l) * slot.dir];
}

/**
 * Có tuyến nào đáng đi cho chuyến từ ô này tới ô kia không?
 * Trả về { line, from, to, eta (giây) } tốt nhất hoặc null.
 */
export function planRide(c, fromCell, toCell) {
  const fx = cellX(fromCell), fz = cellZ(fromCell), tx = cellX(toCell), tz = cellZ(toCell);
  let best = null;
  for (const line of c.transit.lines) {
    if (line.broken || !line.count) continue;
    const def = TRANSIT[line.mode];
    let i = -1, j = -1, di = def.walk, dj = def.walk;
    line.stops.forEach((s, k) => { const a = Math.hypot(s.x - fx, s.z - fz), b = Math.hypot(s.x - tx, s.z - tz); if (a < di) { di = a; i = k; } if (b < dj) { dj = b; j = k; } });
    if (i < 0 || j < 0 || i === j) continue;
    let ride;
    if (def.road) { ride = 0; for (let k = i; k !== j; k = (k + 1) % line.stops.length) ride += line.legLen[k]; } else ride = Math.abs(line.pos[j] - line.pos[i]);
    const stops = def.road ? (j - i + line.stops.length) % line.stops.length : Math.abs(j - i);
    const eta = (di + dj) / WALK_SPEED + line.headway / 2 + ride / def.speed + stops * 1.6;
    if (!best || eta < best.eta) best = { line, from: i, to: j, eta };
  }
  return best;
}

/** Người dân ra trạm chờ xe. */
export function board(c, ride, cb) {
  ride.line.stops[ride.from].waiting.push({ cb, to: ride.to, since: c.traffic.time });
}

/** Mỗi giờ: khách chờ quá lâu thì bỏ về (tính là tới nơi rất muộn). */
export function transitHour(c) {
  const t = c.traffic.time;
  for (const line of c.transit.lines) for (const s of line.stops) {
    const gone = s.waiting.filter((r) => t - r.since > 45);
    if (gone.length) { s.waiting = s.waiting.filter((r) => t - r.since <= 45); for (const r of gone) c.onArrive(c, { ...r.cb, late: true }, null); }
  }
  maintainTransit(c);
}

/** Phí vận hành mỗi kỳ của toàn bộ tuyến. */
export function transitUpkeep(c) {
  let u = 0;
  for (const l of c.transit.lines) u += l.count * TRANSIT[l.mode].upkeep + l.stops.length * 4;
  return u;
}

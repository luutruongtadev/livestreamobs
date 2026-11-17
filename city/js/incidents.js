// Phố Mới — sự cố và thiên tai: thời tiết, mặt đường xuống cấp, tai nạn giao thông (có thể liên hoàn, bốc cháy),
// cướp giật, cháy rừng, bão đá, lốc xoáy. Công an, xe cứu hộ, cứu hoả phải chạy tới hiện trường bằng xe thật.
import { N, T, HALF, SERVICES, ROADS, svcVal, idx, inMap, cellOf, cellX, cellZ, clamp, nearestOnEdge, resCap, jobCap } from './base.js';
import { trip, reroute, cellPos } from './traffic.js';

export const WEATHER = {
  clear: { name: 'Trời quang', icon: '☀️' },
  rain: { name: 'Mưa, đường trơn', icon: '🌧️' },
  dry: { name: 'Khô hạn, dễ cháy rừng', icon: '🔥' },
  hail: { name: 'Bão đá', icon: '🌨️' },
};
const CRASH_RATE = 4e-5; // xác suất một xe đang chạy gặp tai nạn mỗi giây mô phỏng (trước khi nhân hệ số)
const CRASH_KINDS = new Set(['car', 'moto', 'truck']);

export function initIncidents(c) {
  c.inc = {
    weather: c.inc?.weather || 'clear', wUntil: c.inc?.wUntil || 0,
    accidents: [], robberies: [], wild: new Uint8Array(N * N), tornado: null, warn: null, nextId: 1,
    total: { accidents: 0, robberies: 0, caught: 0, burned: 0, tornadoes: 0, killed: 0 },
    day: { accidents: 0, robberies: 0, caught: 0, burned: 0, killed: 0 }, last: {},
  };
}

const night = (c) => { const h = c.hour % 24; return h < 6 || h >= 19; };
const hasEws = (c) => c.services.some((s) => SERVICES[s.type].ews);
/** Hệ số nguy cơ tai nạn hiện tại (thời tiết, ban đêm). */
export function crashFactor(c) {
  const w = c.inc.weather;
  return 1 + (w === 'rain' ? 1.5 : 0) + (w === 'hail' ? (hasEws(c) ? 1.5 : 3) : 0) + (night(c) ? 0.8 : 0);
}

/** Vị trí của xe trên đoạn đường: { edge, along tính từ đầu a, x, z }. */
function vehPos(v) {
  const along = v.fwd ? Math.min(v.s, v.e.len) : Math.max(0, v.e.len - v.s), e = v.e, cum = e.cum, n = cum.length - 1;
  let k = 0;
  while (k < n - 1 && cum[k + 1] < along) k++;
  const f = clamp((along - cum[k]) / (cum[k + 1] - cum[k] || 1), 0, 1);
  return { edge: e, along, x: e.pts[k * 2] + (e.pts[k * 2 + 2] - e.pts[k * 2]) * f, z: e.pts[k * 2 + 1] + (e.pts[k * 2 + 3] - e.pts[k * 2 + 1]) * f };
}

function nearestSvc(c, test, x, z) {
  let best = null, bd = Infinity;
  for (const s of c.services) {
    if (s.cell < 0 || !test(s)) continue;
    const d = Math.hypot(cellX(s.cell) - x, cellZ(s.cell) - z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
const policeCars = (s) => (SERVICES[s.type].cars ? svcVal(s, 'cars') : 0);
const svcPos = (c, s) => (s.cell >= 0 ? cellPos(c, s.cell) : null);

/** Gửi một xe khẩn cấp từ công trình s tới vị trí to. Trả về true nếu xe đã lên đường. */
function send(c, s, kind, to, cb) {
  const from = svcPos(c, s);
  if (!from || !trip(c, kind, from, to, cb, true)) return false;
  s.out = (s.out || 0) + 1;
  return true;
}

// ───────────────────────── tai nạn giao thông ─────────────────────────

/** Gây một vụ tai nạn cho xe v (đang chạy). Xe sau sát đuôi có thể đâm liên hoàn. */
export function crash(c, v) {
  const rng = c.rng, tr = c.traffic, p = vehPos(v);
  const acc = { id: c.inc.nextId++, vehs: [v], x: p.x, z: p.z, edge: p.edge, along: p.along, fwd: v.fwd, fire: rng() < 0.12, t0: tr.time, cops: false, clean: false, sentCops: false, sentClean: false };
  const wreck = (o) => { o.wreck = true; o.hold = 1e9; o.v = 0; o.crashYaw = (rng() - 0.5) * 1.6; };
  wreck(v);
  for (const o of tr.vehicles) { // liên hoàn: xe ngay sau, cùng làn, đang chạy nhanh
    if (o === v || o.wreck || o.e !== v.e || o.fwd !== v.fwd || o.lane !== v.lane || !CRASH_KINDS.has(o.kind)) continue;
    const gap = v.s - o.s;
    if (gap > 0 && gap < 9 && o.v > 6 && rng() < 0.45) { wreck(o); acc.vehs.push(o); }
  }
  for (const o of acc.vehs) if (o.cb && o.cb.t === 'cit' && c.pp.alive[o.cb.id] && rng() < 0.35) c.pp.sick[o.cb.id] = Math.max(c.pp.sick[o.cb.id], 1); // người bị thương
  if (acc.fire) { // lửa bén sang nhà sát đường
    const cx = cellOf(p.x), cy = cellOf(p.z);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = inMap(cx + dx, cy + dy) ? idx(cx + dx, cy + dy) : -1; if (i >= 0 && c.level[i] && !c.fire[i] && rng() < 0.2) c.fire[i] = 7; }
  }
  c.inc.accidents.push(acc);
  c.inc.total.accidents++; c.inc.day.accidents++;
  c.events.push({ type: 'accident', x: p.x, z: p.z, n: acc.vehs.length, fire: acc.fire });
  dispatchAccident(c, acc);
  c.dirty.fx = true;
  return acc;
}

/** Điểm xe cứu hộ dừng: lùi lại phía sau xác xe một quãng để không đâm vào đuôi đống xe. */
function scenePos(acc) {
  const e = acc.edge, back = acc.fwd ? -12 : 12;
  return { edge: e, along: clamp(acc.along + back, 0.5, e.len - 0.5) };
}

function dispatchAccident(c, acc) {
  if (!c.edges.has(acc.edge.id)) return;
  const to = scenePos(acc);
  if (!acc.sentCops) {
    const s = nearestSvc(c, (o) => policeCars(o) > (o.out || 0), acc.x, acc.z);
    if (s && send(c, s, 'police', to, { t: 'police', svc: s.uid, acc: acc.id })) acc.sentCops = true;
  }
  if (!acc.sentClean) {
    const want = acc.fire ? (o) => o.type === 'fire' && svcVal(o, 'trucks') > (o.out || 0) : (o) => SERVICES[o.type].tows && svcVal(o, 'trucks') > (o.out || 0);
    const s = nearestSvc(c, want, acc.x, acc.z) || (!acc.fire && nearestSvc(c, (o) => o.type === 'fire' && svcVal(o, 'trucks') > (o.out || 0), acc.x, acc.z));
    if (s) { const kind = s.type === 'fire' ? 'fire' : 'tow'; if (send(c, s, kind, to, { t: 'clean', svc: s.uid, acc: acc.id, kind })) acc.sentClean = true; }
  }
}

function clearAccident(c, acc) {
  const tr = c.traffic, gone = new Set(acc.vehs);
  tr.vehicles = tr.vehicles.filter((v) => !gone.has(v));
  for (const v of acc.vehs) c.onArrive(c, v.cb, null); // người trên xe coi như tới nơi rất muộn
  c.inc.accidents = c.inc.accidents.filter((a) => a !== acc);
  c.events.push({ type: 'accidentCleared' });
  c.dirty.fx = true;
}

function maybeClear(c, acc) {
  const anyPolice = c.services.some((s) => policeCars(s));
  if ((acc.cops || !anyPolice) && acc.clean) clearAccident(c, acc);
}

// ───────────────────────── cướp giật ─────────────────────────

function robberies(c) {
  const rng = c.rng, inc = c.inc;
  const spots = []; // dưới 400 dân thì tội phạm bằng 0 nên chưa có cướp
  for (let i = 0; i < N * N; i++) if (c.level[i] && c.crime[i] >= 0.12) spots.push(i);
  for (let k = 0; k < 2 && spots.length; k++) {
    const i = spots[(rng() * spots.length) | 0];
    if (inc.robberies.some((r) => r.cell === i) || rng() > c.crime[i] * 0.15) continue;
    const r = { id: inc.nextId++, cell: i, h0: c.hour, sent: false };
    inc.robberies.push(r); inc.total.robberies++; inc.day.robberies++;
    c.events.push({ type: 'robbery', x: i % N, y: (i / N) | 0 });
  }
  for (const r of [...inc.robberies]) {
    if (!r.sent) {
      const to = cellPos(c, r.cell), s = to && nearestSvc(c, (o) => policeCars(o) > (o.out || 0), cellX(r.cell), cellZ(r.cell));
      if (s && send(c, s, 'police', to, { t: 'police', svc: s.uid, rob: r.id })) r.sent = true;
    }
    if (c.hour - r.h0 >= 3) { // kẻ cướp đã tẩu thoát
      inc.robberies = inc.robberies.filter((o) => o !== r);
      c.biz.money[r.cell] -= 90; c.crime[r.cell] = Math.min(1, c.crime[r.cell] + 0.1);
      for (let id = 0; id < c.pp.n; id++) if (c.pp.alive[id] && c.pp.home[id] === r.cell) c.pp.money[id] -= 15;
      c.events.push({ type: 'robberyEscaped' });
    }
  }
}

// ───────────────────────── xe tới nơi ─────────────────────────

/** Xe công an, xe cứu hộ tới hiện trường (v = null nếu chuyến không vẽ ra). Trả về 'keep' nếu xe còn chạy về trạm. */
export function incidentArrive(c, cb, v) {
  const inc = c.inc, s = c.services.find((o) => o.uid === cb.svc);
  if (cb.t === 'police') {
    if (cb.acc) { const acc = inc.accidents.find((a) => a.id === cb.acc); if (acc) { acc.cops = true; maybeClear(c, acc); } }
    if (cb.rob) {
      const r = inc.robberies.find((o) => o.id === cb.rob);
      if (r) {
        inc.robberies = inc.robberies.filter((o) => o !== r);
        let cells = 0; for (const o of c.services) cells += SERVICES[o.type].cells || 0;
        if (c.prisoners + 1 <= cells) c.prisoners++;
        inc.total.caught++; inc.day.caught++;
        c.events.push({ type: 'robberyCaught' });
      }
    }
  } else if (cb.t === 'clean') {
    const acc = inc.accidents.find((a) => a.id === cb.acc);
    if (acc) { acc.clean = true; acc.fire = false; maybeClear(c, acc); }
  } else if (cb.t === 'wild') {
    const cx = cb.cell % N, cy = (cb.cell / N) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inMap(cx + dx, cy + dy)) inc.wild[idx(cx + dx, cy + dy)] = 0;
    c.dirty.fx = true;
  } else return undefined;
  if (!s) return undefined;
  const home = v && svcPos(c, s);
  if (home && reroute(c, v, home)) { v.cb = { t: 'svcBack', svc: s.uid }; v.hold = 1.5; return 'keep'; }
  s.out = Math.max(0, (s.out || 0) - 1);
  return undefined;
}

// ───────────────────────── thiên tai ─────────────────────────

/** Bắt đầu một thiên tai (ngẫu nhiên hoặc người chơi bấm thử). kind: 'tornado' | 'hail' | 'wildfire' */
export function triggerDisaster(c, kind) {
  const inc = c.inc, rng = c.rng;
  if (kind === 'hail') { inc.weather = 'hail'; inc.wUntil = c.hour + 3; c.events.push({ type: 'hail' }); return { ok: true }; }
  if (kind === 'wildfire') {
    const trees = [];
    for (let i = 0; i < N * N; i++) if (c.tree[i] && !inc.wild[i]) trees.push(i);
    if (!trees.length) return { ok: false, reason: 'Không còn cây rừng nào để cháy' };
    const i = trees[(rng() * trees.length) | 0];
    inc.wild[i] = 6; c.dirty.fx = true;
    c.events.push({ type: 'wildfire', x: i % N, y: (i / N) | 0 });
    return { ok: true };
  }
  if (kind === 'tornado') {
    if (inc.tornado || inc.warn) return { ok: false, reason: 'Đang có một cơn lốc rồi' };
    // đi từ một mép bản đồ, ngang qua gần trung tâm thành phố
    let cx = 0, cz = 0, n = 0;
    for (let i = 0; i < N * N; i++) if (c.level[i]) { cx += cellX(i); cz += cellZ(i); n++; }
    if (n) { cx /= n; cz /= n; }
    const a = rng() * Math.PI * 2, sx = cx + Math.cos(a) * HALF * 1.2, sz = cz + Math.sin(a) * HALF * 1.2;
    const tx = cx + (rng() - 0.5) * 120, tz = cz + (rng() - 0.5) * 120, l = Math.hypot(tx - sx, tz - sz) || 1;
    const t = { x: clamp(sx, -HALF, HALF), z: clamp(sz, -HALF, HALF), dx: (tx - sx) / l, dz: (tz - sz) / l, r: 15, speed: 22, wobble: rng() * 6, warned: false };
    if (hasEws(c)) { inc.warn = { at: c.hour + 1, t: { ...t, warned: true } }; c.events.push({ type: 'tornadoWarn' }); }
    else { inc.tornado = t; c.events.push({ type: 'tornado' }); }
    inc.total.tornadoes++;
    return { ok: true };
  }
  return { ok: false, reason: 'Không có loại thiên tai này' };
}

/** Lốc xoáy đi qua: phá nhà, nhổ cây, cuốn xe; người trong nhà có thể thiệt mạng (hầm trú ẩn + cảnh báo sớm giảm thương vong). */
function tornadoStep(c, dt) {
  const t = c.inc.tornado, rng = c.rng;
  t.x += (t.dx + Math.sin(c.traffic.time * 0.7 + t.wobble) * 0.35) * t.speed * dt;
  t.z += (t.dz + Math.cos(c.traffic.time * 0.6 + t.wobble) * 0.35) * t.speed * dt;
  if (Math.abs(t.x) > HALF * 1.3 || Math.abs(t.z) > HALF * 1.3) { c.inc.tornado = null; c.events.push({ type: 'tornadoEnd' }); c.dirty.fx = true; return; }
  const gx = cellOf(t.x), gy = cellOf(t.z), rc = Math.ceil(t.r / T) + 1;
  for (let y = gy - rc; y <= gy + rc; y++) for (let x = gx - rc; x <= gx + rc; x++) {
    if (!inMap(x, y)) continue;
    const i = idx(x, y);
    if (Math.hypot(cellX(i) - t.x, cellZ(i) - t.z) > t.r) continue;
    if (c.tree[i]) { c.tree[i] = 0; c.dirty.trees = true; }
    if (c.level[i] && rng() < dt * 2.5) {
      const shelter = c.cover.shelter[i] > 0.05, risk = shelter ? (t.warned ? 0.03 : 0.2) : t.warned ? 0.15 : 0.35;
      for (let id = 0; id < c.pp.n; id++) if (c.pp.alive[id] && c.pp.home[id] === i && c.pp.loc[id] === i && rng() < risk) { c.fn.die(c, id); c.inc.total.killed++; c.inc.day.killed++; }
      c.fn.clearBuilding(c, i);
      c.events.push({ type: 'tornadoHit', x, y });
    }
  }
  const tr = c.traffic, hit = tr.vehicles.filter((v) => !v.wreck && !v.emergency && v.kind !== 'bus' && v.kind !== 'tram' && Math.hypot(vehPos(v).x - t.x, vehPos(v).z - t.z) < t.r);
  if (hit.length) { tr.vehicles = tr.vehicles.filter((v) => !hit.includes(v)); for (const v of hit) c.onArrive(c, v.cb, null); }
}

// ───────────────────────── mỗi bước, mỗi giờ ─────────────────────────

export function incidentsStep(c, dt) {
  const inc = c.inc;
  if (inc.tornado) tornadoStep(c, dt);
  // tai nạn: mỗi xe đang chạy nhanh có một xác suất nhỏ, nhân theo thời tiết, đêm tối, mặt đường xấu
  const tr = c.traffic, rng = c.rng;
  let moving = 0;
  for (const v of tr.vehicles) if (v.v > 8 && CRASH_KINDS.has(v.kind)) moving++;
  if (moving && inc.accidents.length < 6 && rng() < CRASH_RATE * moving * crashFactor(c) * dt * 2) {
    const v = tr.vehicles[(rng() * tr.vehicles.length) | 0];
    if (v && v.v > 8 && CRASH_KINDS.has(v.kind) && !v.wreck && rng() < 0.5 + (v.e.wear || 0)) crash(c, v);
  }
  for (const acc of [...inc.accidents]) {
    if (!c.edges.has(acc.edge.id) || tr.time - acc.t0 > 90) clearAccident(c, acc); // đường bị phá, hoặc tự giải toả sau rất lâu
    else if (!acc.sentCops || !acc.sentClean) {
      if (!c.services.some((s) => policeCars(s)) && !c.services.some((s) => SERVICES[s.type].tows || s.type === 'fire') && tr.time - acc.t0 > 30) clearAccident(c, acc); // không có ai dọn: kẹt rất lâu rồi tự giải toả
    }
  }
}

/** Mỗi giờ: thời tiết, mòn đường + bảo trì, gửi xe tới hiện trường, cháy rừng, cướp giật, lốc xoáy sắp tới. */
export function incidentsHour(c) {
  const inc = c.inc, rng = c.rng, h = c.hour % 24;
  // thời tiết đổi mỗi sáng
  if (c.hour >= inc.wUntil) {
    const r = rng();
    inc.weather = r < 0.22 ? 'rain' : r < 0.36 ? 'dry' : r < 0.38 && c.pp.count >= 400 ? 'hail' : 'clear';
    inc.wUntil = c.hour + (inc.weather === 'hail' ? 3 : 24 - h + (inc.weather === 'dry' ? 24 : 0));
    if (inc.weather === 'hail') c.events.push({ type: 'hail' });
  }
  // mặt đường mòn theo lượng xe, trạm bảo trì sửa dần trong bán kính
  for (const e of c.edges.values()) {
    const load = (c.traffic.load.get(e.id * 2 + 1) || 0) + (c.traffic.load.get(e.id * 2) || 0);
    e.wear = Math.min(1, (e.wear || 0) + 0.003 * (0.4 + Math.min(3, load) * 0.4) * (inc.weather === 'hail' ? 3 : 1) * (2 - (c.budget ? c.budget.transport / 100 : 1))); // ngân sách giao thông thấp: đường xuống cấp nhanh
  }
  for (const s of c.services) {
    if (!SERVICES[s.type].tows || s.cell < 0) continue;
    const r = svcVal(s, 'radius') * T, sx = cellX(s.cell), sz = cellZ(s.cell);
    for (const e of c.edges.values()) if (e.wear && Math.hypot(e.pts[(e.pts.length >> 2) * 2] - sx, e.pts[(e.pts.length >> 2) * 2 + 1] - sz) < r) e.wear = Math.max(0, e.wear - 0.03 * (c.budget ? c.budget.transport / 100 : 1));
  }
  for (const acc of inc.accidents) dispatchAccident(c, acc);
  // hail: đá rơi làm hỏng nhà (tụt cấp)
  if (inc.weather === 'hail') for (let k = 0; k < 8; k++) {
    const i = (rng() * N * N) | 0;
    if (c.level[i] > 1 && rng() < (hasEws(c) ? 0.25 : 0.5)) { c.level[i]--; c.dirty.buildings = true; }
  }
  wildfireHour(c);
  robberies(c);
  if (inc.warn && c.hour >= inc.warn.at) { inc.tornado = inc.warn.t; inc.warn = null; c.events.push({ type: 'tornado' }); }
  if (h === 12 && c.pp.count >= 1000 && !inc.tornado && !inc.warn && rng() < 1 / 45) triggerDisaster(c, 'tornado');
  if (h === 0) { inc.last = { ...inc.day }; for (const k in inc.day) inc.day[k] = 0; }
}

function wildfireHour(c) {
  const inc = c.inc, rng = c.rng, w = inc.weather, wild = inc.wild;
  if (w === 'dry' || (w === 'hail' && rng() < 0.3)) for (let k = 0; k < 3; k++) { // sét đánh / nắng nóng làm cháy một gốc cây
    const i = (rng() * N * N) | 0;
    if (c.tree[i] && !wild[i] && rng() < (c.cover.watch[i] > 0.05 ? 0.006 : 0.02)) { wild[i] = 6; c.events.push({ type: 'wildfire', x: i % N, y: (i / N) | 0 }); }
  }
  const spread = w === 'dry' ? 0.06 : w === 'rain' ? 0.005 : 0.025, burning = [];
  for (let i = 0; i < N * N; i++) if (wild[i]) burning.push(i);
  if (!burning.length) return;
  for (const i of burning) {
    const x = i % N, y = (i / N) | 0, watch = c.cover.watch[i] > 0.05;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!inMap(x + dx, y + dy) || (!dx && !dy)) continue;
      const j = idx(x + dx, y + dy);
      if (c.tree[j] && !wild[j] && rng() < spread * (watch ? 0.5 : 1)) wild[j] = 6;
      if (c.level[j] && !c.fire[j] && rng() < 0.08) c.fire[j] = 7; // lửa rừng bén vào nhà
    }
    wild[i] = Math.max(0, wild[i] - (watch ? 2 : 1) - (w === 'rain' && rng() < 0.4 ? 6 : 0));
    if (!wild[i]) { c.tree[i] = 0; c.dirty.trees = true; inc.total.burned++; inc.day.burned++; }
  }
  // xe cứu hoả tới đám cháy rừng sát đường (tối đa 2 điểm mỗi giờ)
  let sent = 0;
  for (const i of burning) {
    if (sent >= 2 || !wild[i] || c.cedge[i] < 0) continue;
    const to = cellPos(c, i), s = to && nearestSvc(c, (o) => o.type === 'fire' && svcVal(o, 'trucks') > (o.out || 0), cellX(i), cellZ(i));
    if (s && send(c, s, 'fire', to, { t: 'wild', svc: s.uid, cell: i })) sent++;
  }
  c.dirty.fx = true;
}

/** Số ô đang cháy rừng. */
export function wildCount(c) { let n = 0; for (let i = 0; i < N * N; i++) if (c.inc.wild[i]) n++; return n; }

void ROADS; void resCap; void jobCap; void nearestOnEdge;

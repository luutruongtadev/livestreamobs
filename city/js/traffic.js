// Phố Mới — giao thông thật trên graph đường: tìm đường theo thời gian đi (có tính xe đang đông),
// xe bám làn, giữ khoảng cách, đổi làn, dừng đèn đỏ / nhường ở ngã ba, kẹt xe tự nhiên khi đường đầy.
import { ROADS, nearestOnEdge, cellX, cellZ, clamp, pointAt, roadLvl } from './base.js';

export const VKIND = {
  car: { len: 3.4, speed: 24 },
  moto: { len: 1.9, speed: 23 }, // xe máy: ngắn, bám sát nhau hơn nên cùng một làn chở được nhiều hơn
  ped: { len: 0.6, speed: 9, ped: true }, // người đi bộ: đi trên vỉa hè, không chiếm làn xe
  truck: { len: 5.8, speed: 19 },
  garbage: { len: 5.8, speed: 17 },
  ambulance: { len: 4.6, speed: 34, emergency: true },
  fire: { len: 6.2, speed: 32, emergency: true },
  bus: { len: 7.6, speed: 19 },
  tram: { len: 13, speed: 22 },
  hearse: { len: 4.8, speed: 24 },
  police: { len: 4.2, speed: 33, emergency: true },
  tow: { len: 6.4, speed: 26, emergency: true },
};
/**
 * Kiểu dáng từng xe (chỉ đổi hình, chiều dài, tốc độ; loại xe trong mô phỏng giữ nguyên).
 * vmul: nhân tốc độ tối đa (xe container, xe bồn chạy chậm; xe đạp rất chậm).
 */
export const LOOKS = {
  sedan: { len: 3.4 }, hatch: { len: 3 }, suv: { len: 3.9 }, taxi: { len: 3.4 }, pickup: { len: 4.2 }, minivan: { len: 4.3, vmul: 0.95 },
  scooter: { len: 1.8 }, motorbike: { len: 2, vmul: 1.08 }, duo: { len: 1.9, vmul: 0.95 }, bicycle: { len: 1.7, vmul: 0.55 }, cargomoto: { len: 2.2, vmul: 0.85 }, shipper: { len: 1.9, vmul: 1.02 }, ebike: { len: 1.75, vmul: 0.9 },
  boxtruck: { len: 6.4 }, deliveryvan: { len: 4.8, vmul: 1.05 }, container: { len: 11.5, vmul: 0.82 }, tanker: { len: 9.5, vmul: 0.85 }, logtruck: { len: 9.5, vmul: 0.85 }, dump: { len: 7, vmul: 0.9 }, reefer: { len: 7.4 },
};
/** Chọn kiểu dáng cho xe theo loại và việc nó đang làm (xe tải chở gì, đi đâu). */
export function pickLook(kind, cb, r) {
  if (kind === 'car') return r < 0.42 ? 'sedan' : r < 0.6 ? 'hatch' : r < 0.76 ? 'suv' : r < 0.85 ? 'taxi' : r < 0.93 ? 'minivan' : 'pickup';
  if (kind === 'moto') return r < 0.38 ? 'scooter' : r < 0.46 ? 'ebike' : r < 0.68 ? 'motorbike' : r < 0.82 ? 'duo' : r < 0.9 ? 'bicycle' : r < 0.95 ? 'cargomoto' : 'shipper'; // shipper: xe giao hàng có thùng sau yên
  if (kind !== 'truck') return kind; // xe dịch vụ: mỗi loại một hình riêng
  if (cb && (cb.t === 'export' || cb.imp)) return r < 0.75 ? 'container' : cb.kind === 'oil' ? 'tanker' : 'boxtruck'; // hàng ra vào thành phố
  const k = cb && cb.kind;
  return k === 'oil' || k === 'plastic' ? 'tanker' : k === 'wood' ? 'logtruck' : k === 'ore' || k === 'agri' ? 'dump' : k === 'fish' || k === 'food' ? 'reefer' : k === 'steel' ? 'logtruck' : r < 0.55 ? 'boxtruck' : 'deliveryvan';
}

export const MAX_VEH = 900; // tổng số xe chạy thật cùng lúc
export const MAX_CARS = 380; // riêng xe con; vượt quá thì chuyến đi được tính thời gian chứ không vẽ xe
export const MAX_MOTO = 380;
export const MAX_PEDS = 500;
const GATE = 7; // vạch dừng cách nút giao bao xa
const CYCLE = 5; // giây mỗi pha đèn
const YELLOW = 1;

export function initTraffic(c) {
  c.traffic = { vehicles: [], peds: [], time: 0, pending: [], signals: new Map(), busy: new Map(), reserve: new Map(), load: new Map(), lanes: new Map(), nextId: 1, speedEma: 1, stats: { spawned: 0, abstract: 0, stuck: 0, arrived: 0, noPath: 0 } };
}

/**
 * Biển cấm theo từng đoạn đường (e.ban: chỉ số trong bảng). Xe bị cấm không được đi xuyên qua đoạn đó,
 * nhưng vẫn được xuất phát hoặc dừng ngay trên đoạn ấy (về nhà, giao hàng tận cửa). Xe buýt, tàu điện, xe công vụ không bị cấm.
 */
export const BANS = [
  { id: 'none', icon: '⭕', name: 'Không biển', kinds: [], desc: 'mọi xe đi qua bình thường' },
  { id: 'nocar', icon: '🚗', name: 'Cấm ô tô', kinds: ['car', 'truck'], desc: 'ô tô con và xe tải không đi xuyên qua; xe máy, xe buýt, xe công vụ vẫn đi' },
  { id: 'notruck', icon: '🚚', name: 'Cấm xe tải', kinds: ['truck'], desc: 'xe tải chở hàng đi đường khác; nhà, cửa hàng trên đoạn này vẫn nhận hàng' },
  { id: 'nomoto', icon: '🛵', name: 'Cấm xe máy', kinds: ['moto'], desc: 'xe máy, xe đạp đi đường khác; hợp với đại lộ, đường lớn muốn dành cho ô tô' },
];
/** Đoạn đường e có cấm loại xe kind không. */
export const banned = (e, kind) => !!e.ban && BANS[e.ban].kinds.includes(kind);

const laneKey = (e, fwd, lane) => e.id * 8 + (fwd ? 4 : 0) + lane;
const dirKey = (e, fwd) => e.id * 2 + (fwd ? 1 : 0);
const canTravel = (e, fwd, kind) => (kind === 'ped' || kind === 'tram' ? !ROADS[e.type].elevated && (kind === 'ped' || e.type !== 'oneway' || fwd) : e.type !== 'oneway' || fwd);
const baseSpeed = (e, kind) => VKIND[kind].speed * ROADS[e.type].speed * (e.flood && kind !== 'ped' ? 0.35 : 1) * (kind === 'ped' ? 1 : (kind === 'bus' ? e.busMul : e.spMul) ?? 1); // đường ngập: xe lội nước chậm; vỉa hè bị lấn, làn riêng xe buýt

/** Mức đông của một chiều đường: 0 thoáng → 1 kín xe. */
export function loadOf(c, e, fwd) {
  return clamp(((c.traffic.load.get(dirKey(e, fwd)) || 0) * 7.5) / (Math.max(20, e.len) * ROADS[e.type].lanes), 0, 1);
}
export const edgeLoad = (c, e) => Math.max(loadOf(c, e, true), e.type === 'oneway' ? 0 : loadOf(c, e, false));

/**
 * Chân dốc cầu vượt / hầm nằm giữa đại lộ: nút có đúng 2 nhánh mặt đất thẳng hàng, các nhánh còn lại là cầu / hầm
 * rời nút gần song song với đại lộ. Đây là chỗ nhập làn, không phải ngã ba: không đèn, không vạch qua đường.
 */
export function rampMerge(c, nid) {
  const list = c.adj.get(nid) || [], n = c.nodes.get(nid);
  if (!n || list.length < 3) return false;
  const dir = (e) => { const k = e.a === nid ? 2 : e.pts.length - 4, dx = e.pts[k] - n.x, dz = e.pts[k + 1] - n.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  const ground = [], other = [];
  for (const id of list) { const e = c.edges.get(id); (roadLvl(e.type) === 0 ? ground : other).push(dir(e)); }
  if (ground.length !== 2 || !other.length) return false;
  const [g0, g1] = ground;
  if (g0[0] * g1[0] + g0[1] * g1[1] > -0.9) return false; // hai nhánh mặt đất phải thẳng hàng
  return other.every((d) => Math.abs(d[0] * g0[1] - d[1] * g0[0]) < 0.42);
}

/** Gọi sau mỗi lần graph đường đổi: dựng lại đèn tín hiệu, bỏ xe đang nằm trên đoạn đường đã mất. */
export function rebuildTraffic(c) {
  const tr = c.traffic;
  tr.signals.clear(); tr.busy.clear(); tr.reserve.clear();
  for (const [nid, list] of c.adj) {
    if (list.length < 3) continue;
    const edges = list.map((id) => c.edges.get(id)), n = c.nodes.get(nid);
    if (n.rb || n.ctl === 2 || edges.every((e) => ROADS[e.type].elevated)) continue; // vòng xuyến, biển dừng, nút trên cao: không đèn
    if (n.ctl !== 1 && rampMerge(c, nid)) continue; // chân dốc cầu giữa đại lộ: nhập làn, không đèn
    if (n.ctl !== 1 && list.length < 4 && !edges.some((e) => e.type === 'large' || e.type === 'highway')) continue; // ngã ba đường nhỏ: nhường nhau, không đèn
    const arms = edges.map((e) => { const k = e.a === nid ? 2 : e.pts.length - 4; return { id: e.id, ang: Math.atan2(e.pts[k + 1] - n.z, e.pts[k] - n.x) }; });
    const groups = [], left = [...arms];
    while (left.length) {
      const a = left.shift();
      let best = -1, bd = 2.2; // ghép với nhánh đối diện nhất
      left.forEach((o, k) => { let d = Math.abs(a.ang - o.ang); if (d > Math.PI) d = 2 * Math.PI - d; if (d > bd) { bd = d; best = k; } });
      groups.push(best >= 0 ? [a.id, left.splice(best, 1)[0].id] : [a.id]);
    }
    tr.signals.set(nid, { groups, offset: (nid * 2.7) % (CYCLE * groups.length) });
  }
  const gone = tr.peds.filter((p) => p.steps.some((st, k) => k >= p.pi && c.edges.get(st.e.id) !== st.e));
  if (gone.length) { tr.peds = tr.peds.filter((p) => !gone.includes(p)); for (const p of gone) c.onArrive(c, p.cb, null); }
  // xe mất đường: đoạn đã phá, đường thành một chiều ngược hướng xe, hoặc một chiều bị đảo (đầu a đổi). Xác xe tai nạn để vụ tai nạn tự dọn.
  const lost = tr.vehicles.filter((v) => !v.wreck && v.steps.some((s, k) => k >= v.pi && (c.edges.get(s.e.id) !== s.e || !canTravel(s.e, s.fwd, v.kind) || (v.ends && v.ends[k] !== s.e.a))));
  if (lost.length) {
    tr.vehicles = tr.vehicles.filter((v) => !lost.includes(v));
    for (const v of lost) c.onArrive(c, v.cb, null);
  }
  // vừa cắm biển cấm trên đoạn xe sắp đi qua: tìm đường khác, không còn đường thì vẫn đi đường cũ cho xong chuyến
  for (const v of tr.vehicles) {
    if (v.wreck || !v.steps.some((s, k) => k > v.pi && k < v.steps.length - 1 && banned(s.e, v.kind))) continue;
    const st = v.steps[v.steps.length - 1];
    reroute(c, v, { edge: st.e, along: st.fwd ? v.endS : st.e.len - v.endS });
  }
}

/** Đèn của một nhánh tại nút: 'g' xanh, 'y' vàng, 'r' đỏ, null nếu nút không có đèn. */
export function signalState(c, nid, edgeId) {
  const sg = c.traffic.signals.get(nid);
  if (!sg) return null;
  const t = (c.traffic.time + sg.offset) % (CYCLE * sg.groups.length), ph = Math.floor(t / CYCLE);
  if (!sg.groups[ph].includes(edgeId)) return 'r';
  return CYCLE - (t % CYCLE) < YELLOW ? 'y' : 'g';
}

/** Vị trí trên đường ứng với một ô đất: { edge, along } hoặc null nếu ô không cạnh đường. */
export function cellPos(c, cell) {
  const e = c.cedge[cell] >= 0 ? c.edges.get(c.cedge[cell]) : null;
  return e ? { edge: e, along: nearestOnEdge(e, cellX(cell), cellZ(cell)).along } : null;
}

class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; let i = a.length; a.push([k, v]); while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let m = i; const l = i * 2 + 1, r = l + 1; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

/**
 * Tìm đường nhanh nhất (Dijkstra theo thời gian đi, cộng phạt đường đông và nút giao).
 * from / to: { edge, along }. Trả về { steps: [{ e, fwd }], startS, endS, cost (giây) } hoặc null.
 */
export function findPath(c, from, to, kind = 'car') {
  const emergency = !!VKIND[kind].emergency;
  const ped = kind === 'ped';
  const tcost = (e, fwd, dist) => (ped ? dist / VKIND.ped.speed : (dist / baseSpeed(e, kind)) * (1 + (emergency ? 0.5 : 3) * loadOf(c, e, fwd)));
  const fe = from.edge, te = to.edge;
  let best = null;
  // cùng một đoạn đường và đi thẳng tới được
  if (fe === te) {
    if (to.along >= from.along && canTravel(fe, true, kind)) best = { steps: [{ e: fe, fwd: true }], startS: from.along, endS: to.along, cost: tcost(fe, true, to.along - from.along) };
    else if (to.along < from.along && canTravel(fe, false, kind)) best = { steps: [{ e: fe, fwd: false }], startS: fe.len - from.along, endS: fe.len - to.along, cost: tcost(fe, false, from.along - to.along) };
    if (best) return best;
  }
  const dist = new Map(), prev = new Map(), heap = new Heap();
  const relax = (nid, d, p) => { if (d < (dist.get(nid) ?? Infinity)) { dist.set(nid, d); prev.set(nid, p); heap.push(d, nid); } };
  if (canTravel(fe, true, kind)) relax(fe.b, tcost(fe, true, fe.len - from.along), { e: fe, fwd: true, from: null });
  if (canTravel(fe, false, kind)) relax(fe.a, tcost(fe, false, from.along), { e: fe, fwd: false, from: null });
  const done = new Set();
  let bestCost = Infinity, bestEnd = null;
  while (heap.size) {
    const [d, nid] = heap.pop();
    if (done.has(nid) || d > bestCost) continue;
    done.add(nid);
    if (nid === te.a && canTravel(te, true, kind)) { const t = d + tcost(te, true, to.along); if (t < bestCost) { bestCost = t; bestEnd = { nid, fwd: true }; } }
    if (nid === te.b && canTravel(te, false, kind)) { const t = d + tcost(te, false, te.len - to.along); if (t < bestCost) { bestCost = t; bestEnd = { nid, fwd: false }; } }
    const wait = c.traffic.signals.has(nid) ? (emergency ? 0.3 : 2.2) : 0.5;
    for (const id of c.adj.get(nid) || []) {
      const e = c.edges.get(id), fwd = e.a === nid;
      if (!canTravel(e, fwd, kind) || banned(e, kind)) continue; // biển cấm: không đi xuyên qua (đầu và cuối chuyến tính riêng ở trên)
      relax(fwd ? e.b : e.a, d + wait + tcost(e, fwd, e.len), { e, fwd, from: nid });
    }
  }
  if (!bestEnd) return null;
  const steps = [{ e: te, fwd: bestEnd.fwd }];
  for (let nid = bestEnd.nid; nid != null;) { const p = prev.get(nid); steps.unshift({ e: p.e, fwd: p.fwd }); nid = p.from; }
  const s0 = steps[0];
  return { steps, startS: s0.fwd ? from.along : fe.len - from.along, endS: bestEnd.fwd ? to.along : te.len - to.along, cost: bestCost };
}

function place(v, path) {
  v.steps = path.steps; v.ends = path.steps.map((st) => st.e.a); v.pi = 0; v.e = path.steps[0].e; v.fwd = path.steps[0].fwd; v.s = path.startS; v.endS = path.endS;
  v.granted = false; v.wait = 0; v.stopT = 0;
  if (v.emergency) { const st = path.steps[path.steps.length - 1], p = pointAt(st.e.pts, st.e.cum, st.fwd ? path.endS : st.e.len - path.endS); v.tx = p[0]; v.tz = p[1]; } // đích theo toạ độ
  if (v.lane >= ROADS[v.e.type].lanes) v.lane = 0;
  if (v.e.squeeze) v.lane = ROADS[v.e.type].lanes - 1;
}

/** Thả một xe thật xuống đường. Trả về xe, hoặc null nếu không có đường đi. */
export function spawnVehicle(c, kind, from, to, cb, color) {
  const path = findPath(c, from, to, kind);
  if (!path) return null;
  const k = VKIND[kind], tr = c.traffic;
  const v = { id: tr.nextId++, kind, len: k.len, emergency: !!k.emergency, v: 0, cb, color: color ?? Math.random(), lane: (Math.random() * 3) | 0, hold: 0, cost: path.cost };
  v.look = pickLook(kind, cb, Math.random());
  const lk = LOOKS[v.look];
  if (lk) { v.len = lk.len; v.vmul = lk.vmul || 1; }
  place(v, path);
  tr.vehicles.push(v); tr.stats.spawned++;
  return v;
}

/** Đổi đích cho xe đang chạy (xe buýt tới trạm kế, xe rác quay về bãi...). */
export function reroute(c, v, to) {
  const path = findPath(c, { edge: v.e, along: v.fwd ? v.s : v.e.len - v.s }, to, v.kind);
  if (!path) return false;
  place(v, path); v.cost = path.cost;
  return true;
}

/**
 * Một chuyến đi từ ô này tới ô kia. physical = false (hoặc đã quá nhiều xe) thì không vẽ xe,
 * chỉ hẹn giờ tới nơi theo thời gian đi ước tính. Trả về { eta, vehicle? } hoặc null nếu không tới được.
 */
export function trip(c, kind, fromCell, toCell, cb, physical = true, color) {
  const tr = c.traffic, from = typeof fromCell === 'number' ? cellPos(c, fromCell) : fromCell, to = typeof toCell === 'number' ? cellPos(c, toCell) : toCell;
  if (!from || !to) { tr.stats.noPath++; return null; }
  const same = kind === 'car' || kind === 'moto' ? tr.vehicles.reduce((n, v) => n + (v.kind === kind), 0) : 0;
  const prio = VKIND[kind].emergency || kind === 'garbage' || kind === 'hearse'; // xe dịch vụ luôn chạy thật: chuyến ảo không dập lửa, không chở ai
  if (physical && (prio || tr.vehicles.length < MAX_VEH) && same < (kind === 'car' ? MAX_CARS : kind === 'moto' ? MAX_MOTO : Infinity)) {
    const v = spawnVehicle(c, kind, from, to, cb, color);
    if (!v) { tr.stats.noPath++; return null; }
    return { eta: v.cost, vehicle: v };
  }
  const path = findPath(c, from, to, kind);
  if (!path) { tr.stats.noPath++; return null; }
  tr.pending.push({ at: tr.time + path.cost * 1.2 + 2, cb }); tr.stats.abstract++;
  return { eta: path.cost * 1.2 + 2 };
}

/** Người đi bộ thật trên vỉa hè từ ô này tới ô kia. Trả về false nếu không có lối đi hoặc đã quá đông (khi đó gọi later). */
export function walk(c, fromCell, toCell, cb, hue) {
  const tr = c.traffic;
  if (tr.peds.length >= MAX_PEDS) return false;
  const from = cellPos(c, fromCell), to = cellPos(c, toCell);
  const path = from && to && findPath(c, from, to, 'ped');
  if (!path) return false;
  tr.peds.push({ steps: path.steps, pi: 0, s: path.startS, endS: path.endS, cb, hue: hue ?? Math.random(), side: Math.random() < 0.5 ? 1 : -1 });
  return true;
}

/** Hẹn một lần "tới nơi" sau `sec` giây mô phỏng (chuyến không vẽ ra). */
export function later(c, sec, cb) { c.traffic.pending.push({ at: c.traffic.time + sec, cb }); }

function tryGrant(c, v, force) {
  const tr = c.traffic, next = v.steps[v.pi + 1], nid = v.fwd ? v.e.b : v.e.a;
  if (!force && !v.emergency) {
    const sg = signalState(c, nid, v.e.id);
    if (sg === 'r' || sg === 'y') return false;
    if (sg == null && (c.adj.get(nid)?.length || 0) > 2 && (tr.busy.get(nid) || 0) > tr.time) return false;
    const node = c.nodes.get(nid);
    if (node && node.ctl === 2 && v.stopT < 0.7) return false; // biển dừng: phải dừng hẳn một nhịp
    if (node && node.rb && v.e.type !== 'oneway' && (tr.busy.get(nid) || 0) > tr.time - 0.4) return false; // vào vòng xuyến: nhường xe đang trong vòng
  }
  // còn chỗ ở đầu làn sắp vào?
  const lanes = ROADS[next.e.type].lanes;
  let pick = -1, bestRoom = -1;
  for (let l = next.e.squeeze ? lanes - 1 : 0; l < lanes; l++) { // đại lộ có cầu chạy giữa: chỉ làn ngoài
    const k = laneKey(next.e, next.fwd, l);
    if (!force && (tr.reserve.get(k) || 0) > tr.time) continue;
    let minS = 1e6;
    for (const o of tr.lanes.get(k) || []) minS = Math.min(minS, o.s - o.len / 2);
    if ((force || minS > v.len + 2.5) && minS > bestRoom) { bestRoom = minS; pick = l; }
  }
  if (pick < 0) return false;
  v.nextLane = pick;
  tr.reserve.set(laneKey(next.e, next.fwd, pick), tr.time + 0.9);
  if (!tr.signals.has(nid)) tr.busy.set(nid, tr.time + (v.kind === 'moto' ? 0.1 : 0.22) + (c.nodes.get(nid)?.ctl === 2 ? 0.5 : 0));
  return true;
}

/** Tiến mô phỏng giao thông thêm dt giây (đã nhân tốc độ game). */
export function stepTraffic(c, dt) {
  const tr = c.traffic;
  tr.time += dt;
  if (tr.pending.length && tr.pending.some((p) => p.at <= tr.time)) {
    const due = tr.pending.filter((p) => p.at <= tr.time);
    tr.pending = tr.pending.filter((p) => p.at > tr.time);
    for (const p of due) c.onArrive(c, p.cb, null);
  }
  if (tr.peds.length) {
    const sp = VKIND.ped.speed * dt, done = [];
    for (const p of tr.peds) {
      p.s += sp;
      const st = p.steps[p.pi];
      if (p.pi === p.steps.length - 1) { if (p.s >= p.endS) done.push(p); } else if (p.s >= st.e.len) { p.s -= st.e.len; p.pi++; }
    }
    if (done.length) { tr.peds = tr.peds.filter((p) => !done.includes(p)); for (const p of done) c.onArrive(c, p.cb, null); }
  }
  const lanes = tr.lanes;
  lanes.clear(); tr.load.clear();
  for (const v of tr.vehicles) {
    const k = laneKey(v.e, v.fwd, v.lane);
    let arr = lanes.get(k); if (!arr) lanes.set(k, arr = []);
    arr.push(v);
    const lk = dirKey(v.e, v.fwd); tr.load.set(lk, (tr.load.get(lk) || 0) + 1);
  }
  const done = [], stuck = [];
  let sum = 0, cnt = 0;
  for (const v of tr.vehicles) {
    if (v.hold > 0) { v.hold -= dt; v.v = 0; continue; }
    const L = v.e.len, last = v.pi === v.steps.length - 1, vmax = baseSpeed(v.e, v.kind) * (v.vmul || 1);
    const arr = lanes.get(laneKey(v.e, v.fwd, v.lane));
    let gap = Infinity;
    for (const o of arr) if (o !== v && o.s > v.s && (!v.emergency || o.wreck || o.emergency)) gap = Math.min(gap, o.s - v.s - (o.len + v.len) / 2); // xe khẩn cấp lách qua xe thường
    if (last) gap = Math.min(gap, v.endS - v.s + 1);
    else if (!v.granted) {
      const gate = Math.max(0.5, L - GATE), dg = gate - v.s;
      if (dg < 2.5 && v.v < 1.5) v.stopT += dt; // đã đứng ở vạch dừng
      if (dg < 14 && tryGrant(c, v, v.wait > 25 || (v.emergency && v.wait > 1))) v.granted = true;
      else gap = Math.min(gap, Math.max(0, dg));
    }
    // đổi làn khi bị xe trước cản mà làn bên trống
    const nLanes = ROADS[v.e.type].lanes;
    if (nLanes > 1 && !v.e.squeeze && gap < 9 && !v.granted && Math.random() < dt * 0.9) {
      const other = v.lane === 0 ? 1 : v.lane >= nLanes - 1 ? v.lane - 1 : v.lane + (Math.random() < 0.5 ? -1 : 1), oarr = lanes.get(laneKey(v.e, v.fwd, other)) || [];
      if (!oarr.some((o) => o.s > v.s - 8 && o.s < v.s + 11)) {
        arr.splice(arr.indexOf(v), 1); v.lane = other;
        if (!lanes.has(laneKey(v.e, v.fwd, other))) lanes.set(laneKey(v.e, v.fwd, other), oarr);
        oarr.push(v);
      }
    }
    const target = Math.min(vmax, Math.max(0, v.kind === 'moto' ? (gap - 0.5) * 4.5 : (gap - 1.2) * 2.4));
    v.v = Math.max(0, v.v + clamp(target - v.v, -45 * dt, 14 * dt));
    let ds = v.v * dt;
    if (ds > gap - 0.3) ds = Math.max(0, gap - 0.3);
    v.s += ds;
    if (ds < 0.4 * dt) v.wait += dt; else v.wait = Math.max(0, v.wait - dt * 3);
    sum += Math.min(1, v.v / vmax); cnt++;
    // xe khẩn cấp kẹt sát hiện trường: coi như đã tới (nhân viên xuống đi bộ nốt)
    if (v.emergency && v.wait > 3 && v.tx != null) { const p = pointAt(v.e.pts, v.e.cum, v.fwd ? Math.min(v.s, L) : Math.max(0, L - v.s)); if (Math.hypot(p[0] - v.tx, p[1] - v.tz) < 80) { done.push(v); continue; } }
    if (last) { if (v.s >= v.endS - 0.8) done.push(v); } else if (v.s >= L && v.granted) {
      // sang đoạn kế tiếp
      arr.splice(arr.indexOf(v), 1);
      v.s -= L; v.pi++; v.e = v.steps[v.pi].e; v.fwd = v.steps[v.pi].fwd; v.lane = Math.min(v.nextLane || 0, ROADS[v.e.type].lanes - 1); v.granted = false; v.stopT = 0;
      const k = laneKey(v.e, v.fwd, v.lane);
      let na = lanes.get(k); if (!na) lanes.set(k, na = []);
      na.push(v);
    }
    if (v.wait > 70 && done[done.length - 1] !== v) stuck.push(v); // kẹt cứng quá lâu: bỏ xe lại, người coi như tới nơi rất muộn
  }
  if (cnt) tr.speedEma += (sum / cnt - tr.speedEma) * Math.min(1, dt * 0.25); else tr.speedEma += (1 - tr.speedEma) * Math.min(1, dt * 0.1);
  if (done.length || stuck.length) {
    const keep = new Set();
    for (const v of done) { tr.stats.arrived++; if (c.onArrive(c, v.cb, v) === 'keep') keep.add(v); }
    for (const v of stuck) { tr.stats.stuck++; c.onArrive(c, v.cb, null); }
    tr.vehicles = tr.vehicles.filter((v) => keep.has(v) || (!done.includes(v) && !stuck.includes(v)));
  }
}

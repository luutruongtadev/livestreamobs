// Phố Mới — từng người dân và từng doanh nghiệp là một thực thể.
// Người: tuổi, học vấn, nhà, chỗ làm, tiền, hạnh phúc, sức khoẻ; vòng đời sinh → học → làm → nghỉ hưu → mất;
// lịch hằng ngày sinh ra chuyến đi thật trên đường. Doanh nghiệp: tiền, kho, lương, lãi lỗ, phá sản;
// hàng đi theo chuỗi nguyên liệu → nhà máy → cửa hàng bằng xe tải, thiếu thì nhập, thừa thì xuất.
import { N, ZDEF, SERVICES, PRICE, resCap, jobCap, reqEdu, garbageLimit, cellX, cellZ, clamp, nearestOnEdge } from './base.js';
import { trip, later, walk, cellPos, reroute } from './traffic.js';
import { planRide, board, onBusArrive } from './transit.js';

export const ST = { HOME: 0, TO_WORK: 1, WORK: 2, TO_HOME: 3, OUT: 4, TO_OUT: 5 };
const DEMAND_PER_HEAD = 0.025; // hàng hoá mỗi người mua mỗi giờ
const MAX_TRUCKS = 70;

export function initPeople(c) {
  const cap = 2048, I = (v) => new Int32Array(cap).fill(v);
  c.pp = {
    cap, n: 0, free: [], count: 0, cursor: 0,
    alive: new Uint8Array(cap), gen: new Uint16Array(cap), age: new Float32Array(cap), edu: new Uint8Array(cap), study: new Uint8Array(cap), enrolled: new Uint8Array(cap),
    home: I(-1), work: I(-1), loc: I(-1), car: I(-1), until: I(0), money: new Float32Array(cap), happy: new Uint8Array(cap).fill(55),
    state: new Uint8Array(cap), sick: new Uint8Array(cap), amb: new Uint8Array(cap), commute: new Float32Array(cap), t0: new Float32Array(cap), idle: new Uint8Array(cap),
  };
  const U16 = () => new Uint16Array(N * N), F32 = () => new Float32Array(N * N);
  c.resCount = U16(); c.staff = U16(); c.present = U16(); c.parked = U16(); c.garbage = F32(); c.fire = new Uint8Array(N * N); c.fireTruck = new Uint8Array(N * N);
  c.biz = { money: F32(), sin: F32(), sout: F32(), eff: F32().fill(0.5), incoming: new Uint8Array(N * N) };
  c.econ = { ring: Array.from({ length: 24 }, () => ({ r: 0, c: 0, i: 0 })), imports: 0, exports: 0, bankrupt: 0, parkSearch: 0, movedOut: 0, born: 0, died: 0, day: { imports: 0, exports: 0, bankrupt: 0, parkSearch: 0, movedOut: 0, born: 0, died: 0, riders: 0 } };
  c.pstats = { pop: 0, kids: 0, adults: 0, seniors: 0, workers: 0, employed: 0, unemployed: 0, homeless: 0, sick: 0, students: 0, edu: [0, 0, 0, 0], happy: 55, commute: 0, mode: { car: 0, bus: 0, metro: 0, walk: 0 }, housing: 0, jobs: 0, jobsBy: { c: 0, i: 0, o: 0 }, vacJobs: 0, companies: 0, eff: 0.5 };
  c.carSample = 1; c.gbusy = new Set();
}

function growPeople(pp) {
  const cap = pp.cap * 2;
  for (const k of Object.keys(pp)) {
    const a = pp[k];
    if (!ArrayBuffer.isView(a)) continue;
    const b = new a.constructor(cap);
    if (k === 'home' || k === 'work' || k === 'loc' || k === 'car') b.fill(-1);
    b.set(a); pp[k] = b;
  }
  pp.cap = cap;
}

export function addCitizen(c, age, edu, home, money = 40) {
  const pp = c.pp;
  let id = pp.free.pop();
  if (id === undefined) { if (pp.n >= pp.cap) growPeople(pp); id = pp.n++; }
  pp.alive[id] = 1; pp.gen[id]++; pp.age[id] = age; pp.edu[id] = edu; pp.study[id] = 0; pp.enrolled[id] = 0;
  pp.home[id] = home; pp.work[id] = -1; pp.loc[id] = home; pp.car[id] = -1; pp.money[id] = money; pp.happy[id] = 55;
  pp.state[id] = ST.HOME; pp.sick[id] = 0; pp.amb[id] = 0; pp.commute[id] = 0; pp.idle[id] = 0;
  if (home >= 0) c.resCount[home]++;
  pp.count++;
  return id;
}

function leaveJob(c, id) {
  const pp = c.pp, w = pp.work[id];
  if (w < 0) return;
  if (c.staff[w] > 0) c.staff[w]--;
  if (pp.state[id] === ST.WORK && c.present[w] > 0) c.present[w]--;
  pp.work[id] = -1;
}

function freeParking(c, id) { const p = c.pp.car[id]; if (p >= 0 && c.parked[p] > 0) c.parked[p]--; c.pp.car[id] = -1; }

export function removeCitizen(c, id) {
  const pp = c.pp;
  if (!pp.alive[id]) return;
  leaveJob(c, id); freeParking(c, id);
  if (pp.home[id] >= 0 && c.resCount[pp.home[id]] > 0) c.resCount[pp.home[id]]--;
  pp.alive[id] = 0; pp.free.push(id); pp.count--;
}

/** Một toà nhà vừa biến mất (dỡ, cháy, phá sản): cư dân thành vô gia cư, nhân viên mất việc. */
export function onBuildingCleared(c, i) {
  const pp = c.pp;
  if (c.resCount[i] || c.staff[i]) for (let id = 0; id < pp.n; id++) {
    if (!pp.alive[id]) continue;
    if (pp.work[id] === i) { leaveJob(c, id); if (pp.loc[id] === i) { pp.loc[id] = pp.home[id]; pp.state[id] = ST.HOME; } }
    if (pp.home[id] === i) { pp.home[id] = -1; if (pp.loc[id] === i && pp.state[id] === ST.HOME) pp.loc[id] = -1; }
  }
  c.resCount[i] = 0; c.staff[i] = 0; c.present[i] = 0; c.parked[i] = 0; c.garbage[i] = 0; c.fire[i] = 0; c.fireTruck[i] = 0;
  const b = c.biz; b.money[i] = 0; b.sin[i] = 0; b.sout[i] = 0; b.eff[i] = 0.5; b.incoming[i] = 0;
}

/** Lương mỗi giờ của một chỗ làm ở ô i. */
export const wageAt = (c, i) => (1 + 0.4 * reqEdu(c.zone[i], c.level[i])) * (1 + 0.05 * (c.level[i] - 1));
export const rentAt = (c, i) => 1.5 + c.landValue[i] * 0.05 + (c.level[i] - 1) * 0.6;
const spots = (c, i) => (c.occ[i] ? SERVICES[c.services[c.occ[i] - 1].type].spots || 12 : 2 + Math.ceil((resCap(c.zone[i], c.level[i]) + jobCap(c.zone[i], c.level[i])) * 0.3));
const isShop = (c, i) => c.level[i] > 0 && ZDEF[c.zone[i]].biz === 'shop';
/** Loại doanh nghiệp ở ô i: 'raw' khai thác nguyên liệu, 'factory', 'shop', 'office' hoặc null. */
export function bizKind(c, i) {
  if (!c.level[i]) return null;
  const b = ZDEF[c.zone[i]].biz;
  return b === 'ind' ? (c.variant[i] % 3 === 0 ? 'raw' : 'factory') : b || null;
}
const dist = (a, b) => Math.hypot(cellX(a) - cellX(b), cellZ(a) - cellZ(b));
const svcByUid = (c, uid) => c.services.find((s) => s.uid === uid);
const svcPos = (c, s) => (s.cell >= 0 ? cellPos(c, s.cell) : null);

/** Các cửa ngõ ra ngoài thành phố (đường cao tốc ở mép bản đồ, cảng): [{ edge, along }] */
export function outsidePositions(c) {
  const out = [];
  if (c.entry) for (const e of c.edges.values()) { const r = nearestOnEdge(e, c.entry.x, c.entry.z); if (r.d < 8) { out.push({ edge: e, along: r.along }); break; } }
  for (const s of c.services) if (SERVICES[s.type].outside) { const p = svcPos(c, s); if (p) out.push(p); }
  return out;
}
function nearestOutside(c, cell) {
  let best = null, bd = Infinity;
  for (const o of outsidePositions(c)) { const p = nearestOnEdge(o.edge, cellX(cell), cellZ(cell)); if (p.d < bd) { bd = p.d; best = o; } }
  return best;
}

// ───────────────────────── chuyến đi ─────────────────────────

/** Người id đi tới ô dest. purpose: 'work' | 'home' | 'out' */
function go(c, id, dest, purpose) {
  const pp = c.pp, from = pp.loc[id];
  pp.state[id] = purpose === 'work' ? ST.TO_WORK : purpose === 'home' ? ST.TO_HOME : ST.TO_OUT;
  pp.t0[id] = c.traffic.time;
  freeParking(c, id);
  const cb = { t: 'cit', id, gen: pp.gen[id], dest, purpose };
  if (from < 0 || dest < 0 || from === dest) { later(c, 1, cb); return; }
  const d = dist(from, dest), mode = c.pstats.mode;
  const hue = (id * 0.6180339) % 1;
  if (d < 115) { mode.walk++; if (!walk(c, from, dest, cb, hue)) later(c, d / 9 + 1, cb); return; }
  const carEta = (d * 1.35) / 22 / Math.max(0.35, c.traffic.speedEma) + (purpose !== 'home' && c.parked[dest] >= spots(c, dest) ? 8 : 0);
  const ride = planRide(c, from, dest);
  if (ride && ride.eta * (1 + c.transit.fare * 0.05) < carEta * 1.3 + 4) { mode[ride.line.mode]++; board(c, ride, cb); return; }
  mode.car++;
  const kind = id % 5 < 2 ? 'car' : 'moto'; // phần đông đi xe máy
  if (kind === 'car') cb.car = true; // chỉ ô tô mới phải tìm chỗ đỗ
  if (!trip(c, kind, from, dest, cb, Math.random() < c.carSample, hue)) later(c, 6, { ...cb, fail: true });
}

function settle(c, id, cb) {
  const pp = c.pp, dest = cb.dest;
  pp.loc[id] = dest;
  const hours = (c.traffic.time - pp.t0[id]) / c.hourSec;
  if (cb.purpose === 'work') {
    if (pp.work[id] !== dest || !c.level[dest]) { pp.state[id] = ST.HOME; pp.loc[id] = pp.home[id]; return; }
    pp.state[id] = ST.WORK; c.present[dest]++; pp.until[id] = c.hour + 9; // làm đủ 9 giờ kể từ lúc tới nơi
    pp.commute[id] = pp.commute[id] ? pp.commute[id] * 0.6 + hours * 0.4 : hours;
  } else if (cb.purpose === 'home') {
    pp.state[id] = ST.HOME;
  } else {
    pp.state[id] = ST.OUT; pp.until[id] = c.hour + 2;
    if (isShop(c, dest)) { // mua sắm trực tiếp
      const spend = Math.min(Math.max(0, pp.money[id]), 9), units = Math.min(c.biz.sin[dest], spend / PRICE.retail);
      pp.money[id] -= units * PRICE.retail; c.biz.sin[dest] -= units; saleIncome(c, dest, units * PRICE.retail, 'c');
    }
  }
}

/** Mọi "tới nơi" (xe thật hoặc hẹn giờ) đều đi qua đây. Trả về 'keep' nếu xe còn chạy tiếp. */
export function onArrive(c, cb, v) {
  if (!cb) return undefined;
  const pp = c.pp;
  switch (cb.t) {
    case 'cit': {
      const id = cb.id;
      if (!pp.alive[id] || pp.gen[id] !== cb.gen) return undefined;
      if (cb.fail && cb.purpose === 'work') { leaveJob(c, id); pp.state[id] = ST.HOME; pp.loc[id] = pp.home[id]; return undefined; } // không có đường tới chỗ làm
      if (cb.car && !cb.parked && cb.purpose !== 'home' && cb.dest >= 0) {
        if (c.parked[cb.dest] < spots(c, cb.dest)) { c.parked[cb.dest]++; pp.car[id] = cb.dest; } else {
          // hết chỗ: tìm bãi đỗ xe gần đó, không có thì chạy vòng rồi đỗ lề đường
          c.econ.parkSearch++; c.econ.day.parkSearch++;
          let lot = null;
          for (const s of c.services) { const d = SERVICES[s.type]; if (d.spots && s.cell >= 0 && c.parked[s.cell] < d.spots && dist(s.cell, cb.dest) < d.radius * 10) { lot = s; break; } }
          if (lot) { c.parked[lot.cell]++; pp.car[id] = lot.cell; }
          if (v) {
            let far = lot ? lot.cell : -1;
            for (let k = 0; k < 12 && far < 0; k++) { const j = (Math.random() * N * N) | 0; if (c.acc[j] && c.cedge[j] >= 0 && dist(j, cb.dest) < 110 && dist(j, cb.dest) > 30) far = j; }
            const to = far >= 0 ? cellPos(c, far) : null;
            if (to && reroute(c, v, to)) { v.cb = { ...cb, parked: true }; return 'keep'; }
          }
        }
      }
      settle(c, id, cb);
      return undefined;
    }
    case 'bus': return onBusArrive(c, cb, v);
    case 'cargo': {
      const b = c.biz, to = cb.to;
      b.incoming[to] = 0;
      if (!c.level[to]) return undefined;
      const price = PRICE[cb.kind], cost = cb.qty * price * (cb.imp ? PRICE.importMult : 1);
      b.sin[to] += cb.qty; b.money[to] -= cost;
      if (cb.imp) { c.econ.imports += cb.qty; c.econ.day.imports += cb.qty; } else if (c.level[cb.from]) saleIncome(c, cb.from, cb.qty * price, 'i');
      return undefined;
    }
    case 'export': {
      if (c.level[cb.from]) saleIncome(c, cb.from, cb.qty * PRICE[cb.kind] * PRICE.exportMult, 'i');
      c.econ.exports += cb.qty; c.econ.day.exports += cb.qty;
      return undefined;
    }
    case 'garbage': {
      const s = svcByUid(c, cb.svc);
      c.gbusy.delete(cb.edge);
      if (!s) return undefined;
      if (!v) { s.out = Math.max(0, (s.out || 0) - 1); return undefined; }
      const e = cb.edge;
      let got = 0;
      for (let i = 0; i < N * N && got < 90; i++) if (c.cedge[i] === e && c.garbage[i] > 0) { got += c.garbage[i]; c.garbage[i] = 0; }
      s.processed = (s.processed || 0) + got;
      const home = svcPos(c, s);
      if (home && reroute(c, v, home)) { v.cb = { t: 'svcBack', svc: s.uid }; v.hold = 1; return 'keep'; }
      s.out = Math.max(0, s.out - 1);
      return undefined;
    }
    case 'fire': {
      const s = svcByUid(c, cb.svc);
      c.fireTruck[cb.cell] = 0;
      if (v && c.fire[cb.cell]) { c.fire[cb.cell] = 0; c.events.push({ type: 'fireOut', x: cb.cell % N, y: (cb.cell / N) | 0 }); c.dirty.fx = true; }
      if (!s) return undefined;
      const home = v && svcPos(c, s);
      if (home && reroute(c, v, home)) { v.cb = { t: 'svcBack', svc: s.uid }; v.hold = 2; return 'keep'; }
      s.out = Math.max(0, (s.out || 0) - 1);
      return undefined;
    }
    case 'amb': {
      const s = svcByUid(c, cb.svc), id = cb.id;
      if (pp.alive[id] && pp.gen[id] === cb.gen) { pp.amb[id] = 0; if (v) pp.sick[id] = 0; }
      if (!s) return undefined;
      const home = v && svcPos(c, s);
      if (home && reroute(c, v, home)) { v.cb = { t: 'svcBack', svc: s.uid }; v.hold = 1.5; return 'keep'; }
      s.out = Math.max(0, (s.out || 0) - 1);
      return undefined;
    }
    case 'svcBack': { const s = svcByUid(c, cb.svc); if (s) s.out = Math.max(0, (s.out || 0) - 1); return undefined; }
    default: return undefined;
  }
}

/** Doanh thu của một doanh nghiệp: trừ thuế, thành phố thu phần thuế đó. */
function saleIncome(c, i, amount, cat) {
  const rate = c.tax[cat] / 100;
  c.biz.money[i] += amount * (1 - rate);
  c.hourInc[cat] += amount * (c.tax[cat] / 9) * (cat === 'c' ? 1.2 : 1.35);
}

// ───────────────────────── mỗi giờ ─────────────────────────

export function peopleHour(c) {
  const pp = c.pp, h = c.hour % 24, weekend = c.day % 7 >= 5, rng = c.rng, ps = c.pstats;
  // 1) quét toà nhà: nhà còn chỗ, việc còn trống, danh sách cửa hàng
  const vacHomes = [], vacJobs = [], shops = [], companies = [];
  let housing = 0, jobs = 0, jc = 0, ji = 0, jo = 0;
  for (let i = 0; i < N * N; i++) {
    const L = c.level[i];
    if (!L) continue;
    const z = c.zone[i], rc = resCap(z, L), jb = jobCap(z, L);
    if (pp.count >= 120) c.garbage[i] += (rc + jb) / 55; // trước mốc mở khoá bãi rác thì chưa tính rác
    if (rc) { housing += rc; if (c.resCount[i] < rc && c.pOk[i] === 1 && c.wOk[i] === 1 && !c.fire[i]) vacHomes.push(i); }
    if (jb) {
      jobs += jb; companies.push(i);
      const cat = ZDEF[z].biz === 'ind' ? 'i' : ZDEF[z].biz === 'office' ? 'o' : 'c';
      if (cat === 'i') ji += jb; else if (cat === 'o') jo += jb; else jc += jb;
      if (c.staff[i] < jb) vacJobs.push(i);
      if (ZDEF[z].biz === 'shop') shops.push(i);
    }
  }
  ps.housing = housing; ps.jobs = jobs; ps.jobsBy = { c: jc, i: ji, o: jo }; ps.companies = companies.length;

  // 2) nhập cư: có nhà trống và thành phố đang hút dân
  if (vacHomes.length && c.pull > 0.05) {
    const hasHS = c.services.some((s) => s.type === 'highschool'), hasU = c.services.some((s) => s.type === 'university');
    let arrive = Math.min(40, Math.ceil(c.pull * (1.5 + (housing - pp.count) * 0.035)));
    while (arrive-- > 0 && vacHomes.length) {
      const k = (rng() * vacHomes.length) | 0, hcell = vacHomes[k];
      const r = rng(), edu = r < 0.05 + (hasU ? 0.12 : 0) ? 3 : r < 0.22 + (hasHS ? 0.2 : 0) ? 2 : r < 0.6 ? 1 : 0;
      addCitizen(c, 20 + rng() * 25, edu, hcell, 30 + rng() * 60);
      if (rng() < 0.3 && c.resCount[hcell] < resCap(c.zone[hcell], c.level[hcell])) addCitizen(c, rng() * 16, 0, hcell, 0);
      if (c.resCount[hcell] >= resCap(c.zone[hcell], c.level[hcell])) vacHomes.splice(k, 1);
    }
  }

  // 3) lịch sinh hoạt + lương + tìm việc + tìm nhà
  let wages = 0, matched = 0, sickDispatch = 0;
  const clinics = c.services.filter((s) => SERVICES[s.type].ambulances && s.cell >= 0);
  for (let id = 0; id < pp.n; id++) {
    if (!pp.alive[id]) continue;
    const age = pp.age[id], st = pp.state[id], adult = age >= 18 && age < 65;
    if (pp.home[id] < 0 && vacHomes.length) { // vô gia cư tìm được nhà
      const hcell = vacHomes[(rng() * vacHomes.length) | 0];
      if (c.resCount[hcell] < resCap(c.zone[hcell], c.level[hcell])) { pp.home[id] = hcell; c.resCount[hcell]++; if (pp.loc[id] < 0) pp.loc[id] = hcell; pp.idle[id] = 0; }
    }
    if (adult && pp.work[id] < 0 && !pp.enrolled[id] && matched < 60 && vacJobs.length) { // tìm việc: thử vài chỗ, lấy chỗ gần nhất đủ trình độ
      let best = -1, bd = Infinity;
      const base = pp.home[id];
      for (let k = 0; k < 6; k++) {
        const j = vacJobs[(rng() * vacJobs.length) | 0];
        if (c.staff[j] >= jobCap(c.zone[j], c.level[j]) || reqEdu(c.zone[j], c.level[j]) > pp.edu[id]) continue;
        const d = base >= 0 ? dist(base, j) : 0;
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) { pp.work[id] = best; c.staff[best]++; matched++; pp.idle[id] = 0; }
    }
    if (st === ST.HOME) {
      const w = pp.work[id];
      if (w >= 0 && !weekend && h === 4 + (id % 7) && pp.home[id] >= 0) go(c, id, w, 'work');
      else if (age >= 14 && shops.length && pp.home[id] >= 0 && !pp.sick[id] && rng() < (weekend || w < 0 ? (h >= 8 && h <= 18 ? 0.06 : 0) : h >= 18 && h <= 21 ? 0.04 : 0)) {
        let best = shops[(rng() * shops.length) | 0];
        for (let k = 0; k < 3; k++) { const j = shops[(rng() * shops.length) | 0]; if (dist(pp.home[id], j) < dist(pp.home[id], best)) best = j; }
        go(c, id, best, 'out');
      }
    } else if (st === ST.WORK) {
      const w = pp.work[id];
      if (w < 0 || !c.level[w]) { pp.state[id] = ST.HOME; pp.loc[id] = pp.home[id]; } else {
        const wg = wageAt(c, w);
        pp.money[id] += wg * (1 - c.tax.r / 100); wages += wg; c.biz.money[w] -= wg;
        if (c.hour >= pp.until[id]) { if (c.present[w] > 0) c.present[w]--; go(c, id, pp.home[id], 'home'); }
      }
    } else if (st === ST.OUT) {
      if (c.hour >= pp.until[id]) go(c, id, pp.home[id], 'home');
    } else if (c.traffic.time - pp.t0[id] > 14 * c.hourSec) { // đi quá 14 giờ chưa tới: coi như về nhà
      pp.state[id] = ST.HOME; pp.loc[id] = pp.home[id]; freeParking(c, id);
    }
    if (pp.sick[id]) {
      if (pp.sick[id] < 250) pp.sick[id]++;
      if (!pp.amb[id] && sickDispatch < 4 && pp.home[id] >= 0 && clinics.length) {
        let best = null, bd = Infinity;
        for (const s of clinics) { if ((s.out || 0) >= SERVICES[s.type].ambulances) continue; const d = dist(s.cell, pp.home[id]); if (d < bd) { bd = d; best = s; } }
        const from = best && svcPos(c, best);
        if (from && trip(c, 'ambulance', from, pp.home[id], { t: 'amb', id, gen: pp.gen[id], svc: best.uid }, true)) { best.out = (best.out || 0) + 1; pp.amb[id] = 1; sickDispatch++; }
      }
    }
  }
  c.hourInc.r += wages * (c.tax.r / 9) * 2.7;

  bizHour(c, companies, shops, h);
  servicesHour(c, h);
  if (h === 0) peopleDay(c);
  ps.vacJobs = Math.max(0, jobs - ps.employed);
}

// ───────────────────────── doanh nghiệp ─────────────────────────

function bizHour(c, companies, shops, h) {
  const b = c.biz, open = h >= 6 && h <= 20;
  let shopStaff = 0;
  for (const i of shops) shopStaff += c.present[i];
  const demand = c.pp.count * DEMAND_PER_HEAD * (open ? 1.5 : 0.2);
  const needRaw = [], needGoods = [], supRaw = [], supGoods = [], broke = [];
  let effSum = 0;
  for (const i of companies) {
    const kind = bizKind(c, i), pres = c.present[i], cap = jobCap(c.zone[i], c.level[i]);
    b.money[i] -= 0.12 * c.level[i]; // chi phí cố định
    const prod = 1 + 0.12 * (c.level[i] - 1);
    let active = pres > 0;
    if (kind === 'raw') {
      b.sout[i] = Math.min(48, b.sout[i] + pres * 0.6 * prod);
      if (b.sout[i] >= PRICE.load) supRaw.push(i);
    } else if (kind === 'factory') {
      const use = Math.min(b.sin[i], pres * 0.4 * prod, 48 - b.sout[i]);
      b.sin[i] -= use; b.sout[i] += use;
      if (pres && use < pres * 0.2) active = false;
      if (b.sin[i] < 6 && !b.incoming[i]) needRaw.push(i);
      if (b.sout[i] >= PRICE.load) supGoods.push(i);
    } else if (kind === 'shop') {
      const sold = Math.min(b.sin[i], shopStaff ? (demand * pres) / shopStaff : 0, pres * 0.3 * prod);
      b.sin[i] -= sold;
      if (sold > 0) saleIncome(c, i, sold * PRICE.retail, 'c');
      if (pres && b.sin[i] <= 0.01) active = false;
      if (b.sin[i] < 6 && !b.incoming[i]) needGoods.push(i);
    } else if (kind === 'office' && pres) saleIncome(c, i, pres * (1.75 + 0.2 * c.level[i]), 'c');
    if (h >= 9 && h <= 17 && c.day % 7 < 5) b.eff[i] += ((active ? Math.min(1, pres / Math.max(1, cap * 0.5)) : 0) - b.eff[i]) * 0.06; // ca làm lệch giờ nhau nên có mặt một nửa đã là đủ người
    effSum += b.eff[i];
    if (b.incoming[i] && ++b.incoming[i] > 20) b.incoming[i] = 0; // xe hàng thất lạc
    if (b.money[i] < -380) broke.push(i);
  }
  c.pstats.eff = companies.length ? effSum / companies.length : 0.5;
  // giao hàng: nhà cung cấp trong thành phố gần nhất, không có thì nhập từ ngoài
  let trucks = 0;
  for (const v of c.traffic.vehicles) if (v.kind === 'truck') trucks++;
  const deliver = (needs, sups, kind) => {
    for (const to of needs.slice(0, 24)) {
      let best = -1, bd = Infinity;
      for (const s of sups) { if (b.sout[s] < PRICE.load) continue; const d = dist(s, to); if (d < bd) { bd = d; best = s; } }
      if (best >= 0) {
        if (trip(c, 'truck', best, to, { t: 'cargo', to, from: best, kind, qty: PRICE.load }, trucks < MAX_TRUCKS)) { b.sout[best] -= PRICE.load; b.incoming[to] = 1; trucks++; continue; }
      }
      const out = nearestOutside(c, to);
      if (out && trip(c, 'truck', out, to, { t: 'cargo', to, kind, qty: PRICE.load, imp: true }, trucks < MAX_TRUCKS)) { b.incoming[to] = 1; trucks++; }
    }
  };
  deliver(needRaw, supRaw, 'raw');
  deliver(needGoods, supGoods, 'goods');
  // kho đầy mà trong thành phố không ai mua: xuất ra ngoài
  for (const [sups, kind] of [[supRaw, 'raw'], [supGoods, 'goods']]) for (const s of sups) {
    if (b.sout[s] < 30) continue;
    const out = nearestOutside(c, s);
    if (out && trip(c, 'truck', s, out, { t: 'export', from: s, kind, qty: 16 }, trucks < MAX_TRUCKS)) { b.sout[s] -= 16; trucks++; }
  }
  for (const i of broke) {
    c.econ.bankrupt++; c.econ.day.bankrupt++;
    c.events.push({ type: 'bankruptBiz', x: i % N, y: (i / N) | 0, kind: bizKind(c, i) });
    c.fn.clearBuilding(c, i);
  }
}

// ───────────────────────── xe dịch vụ, cháy ─────────────────────────

function servicesHour(c, h) {
  const rng = c.rng;
  // xe rác: tới con đường bẩn nhất trong bán kính
  for (const s of c.services) {
    const d = SERVICES[s.type];
    if (!d.trash || !d.trucks || s.cell < 0 || h < 5 || h > 20 || (s.out || 0) >= d.trucks || (s.processed || 0) >= d.trash) continue;
    let best = -1, bg = 4;
    for (let i = 0; i < N * N; i++) if (c.garbage[i] > bg && c.level[i] && !c.gbusy.has(c.cedge[i]) && dist(i, s.cell) < d.radius * 10) { bg = c.garbage[i]; best = i; }
    const from = best >= 0 && svcPos(c, s);
    if (from && trip(c, 'garbage', from, best, { t: 'garbage', svc: s.uid, cell: best, edge: c.cedge[best] }, true)) { s.out = (s.out || 0) + 1; c.gbusy.add(c.cedge[best]); }
  }
  // cháy: lửa lan dần, xe cứu hoả gần nhất phải chạy tới kịp
  let built = 0, pick = -1;
  for (let i = 0; i < N * N; i++) {
    if (c.level[i]) { built++; if (rng() < 1 / built) pick = i; }
    if (!c.fire[i]) continue;
    if (--c.fire[i] === 0) { c.events.push({ type: 'fire', x: i % N, y: (i / N) | 0, zone: c.zone[i] }); c.fn.clearBuilding(c, i); c.dirty.fx = true; continue; }
    if (c.fireTruck[i]) continue;
    let best = null, bd = Infinity;
    for (const s of c.services) { const d = SERVICES[s.type]; if (s.type !== 'fire' || s.cell < 0 || (s.out || 0) >= d.trucks) continue; const dd = dist(s.cell, i); if (dd < bd) { bd = dd; best = s; } }
    const from = best && svcPos(c, best);
    if (from && trip(c, 'fire', from, i, { t: 'fire', svc: best.uid, cell: i }, true)) { best.out = (best.out || 0) + 1; c.fireTruck[i] = 1; }
  }
  if (c.pp.count >= 400 && pick >= 0 && !c.fire[pick] && rng() < built * 0.00006) { c.fire[pick] = 7; c.events.push({ type: 'fireStart', x: pick % N, y: (pick / N) | 0 }); c.dirty.fx = true; }
}

// ───────────────────────── mỗi ngày ─────────────────────────

function seatAt(c, level, home) {
  for (const s of c.services) {
    const d = SERVICES[s.type];
    if (d.eduLevel !== level || (s.used || 0) >= d.students) continue;
    const cx = s.x + d.size / 2, cy = s.y + d.size / 2;
    if (Math.hypot((home % N) + 0.5 - cx, ((home / N) | 0) + 0.5 - cy) <= d.radius) { s.used = (s.used || 0) + 1; return true; }
  }
  return false;
}

function peopleDay(c) {
  const pp = c.pp, rng = c.rng, ps = c.pstats, day = c.econ.day;
  for (const s of c.services) { s.used = 0; s.processed = 0; }
  const count = { kids: 0, adults: 0, seniors: 0, workers: 0, employed: 0, homeless: 0, sick: 0, students: 0 }, edu = [0, 0, 0, 0];
  let hs = 0, cs = 0, cn = 0;
  const pumpDirty = c.dirtyWater ? 0.03 : 0;
  for (let id = 0; id < pp.n; id++) {
    if (!pp.alive[id]) continue;
    const age = ++pp.age[id], home = pp.home[id];
    // học hành
    if (age === 12) { if (pp.study[id] >= 4) pp.edu[id] = 1; pp.study[id] = 0; }
    if (age === 18) { if (pp.edu[id] === 1 && pp.study[id] >= 4) pp.edu[id] = 2; pp.study[id] = 0; }
    if (age === 22 && pp.enrolled[id]) { if (pp.study[id] >= 3) pp.edu[id] = 3; pp.study[id] = 0; }
    const stage = age >= 6 && age < 12 ? 1 : age >= 12 && age < 18 && pp.edu[id] >= 1 ? 2 : age >= 18 && age < 22 && pp.edu[id] === 2 && pp.work[id] < 0 ? 3 : 0;
    pp.enrolled[id] = stage && home >= 0 && seatAt(c, stage, home) ? 1 : 0;
    if (pp.enrolled[id]) { if (pp.study[id] < 200) pp.study[id]++; count.students++; }
    if (age >= 65 && pp.work[id] >= 0) leaveJob(c, id);
    // sinh, bệnh, mất
    if (age >= 20 && age <= 40 && home >= 0 && c.resCount[home] < resCap(c.zone[home], c.level[home]) + 2 && rng() < 0.05 * clamp(pp.happy[id] / 50, 0.4, 1.3)) { addCitizen(c, 0, 0, home, 0); c.econ.born++; day.born++; }
    if (!pp.sick[id] && home >= 0 && rng() < 0.004 + c.air[home] * 0.035 + c.ground[home] * 0.02 + pumpDirty + (c.garbage[home] > garbageLimit(c.zone[home], c.level[home]) ? 0.012 : 0) + (age > 65 ? 0.01 : 0)) pp.sick[id] = 1;
    if (pp.sick[id] > 48) { if (rng() < 0.25) { removeCitizen(c, id); c.econ.died++; day.died++; continue; } pp.sick[id] = 0; pp.amb[id] = 0; }
    if (age > 70 && rng() < (age - 70) * 0.025) { removeCitizen(c, id); c.econ.died++; day.died++; continue; }
    // tiền nhà, hài lòng, bỏ đi
    const adult = age >= 18 && age < 65;
    if (home >= 0 && age >= 18) pp.money[id] -= rentAt(c, home);
    pp.money[id] = clamp(pp.money[id], -200, 3000);
    let hpy = home >= 0 ? c.fn.cellHappy(c, home).happy : 15;
    if (adult && pp.work[id] < 0 && !pp.enrolled[id]) { hpy -= 14; if (pp.idle[id] < 250) pp.idle[id]++; }
    if (pp.commute[id] > 5) hpy -= Math.min(20, (pp.commute[id] - 5) * 4);
    if (pp.sick[id]) hpy -= 12;
    if (pp.money[id] > 120) hpy += 4; else if (pp.money[id] < -40) hpy -= 10;
    hpy = clamp(hpy, 0, 100); pp.happy[id] = hpy;
    if (home < 0) { count.homeless++; if (pp.idle[id] < 250) pp.idle[id]++; }
    if ((home < 0 && pp.idle[id] > 3) || (age >= 18 && ((hpy < 22 && rng() < 0.12) || (pp.money[id] < -120 && rng() < 0.2) || (adult && pp.work[id] < 0 && pp.idle[id] > 6 && rng() < 0.15)))) {
      removeCitizen(c, id); c.econ.movedOut++; day.movedOut++; continue;
    }
    if (age < 18) count.kids++; else if (age < 65) { count.adults++; if (!pp.enrolled[id]) { count.workers++; if (pp.work[id] >= 0) count.employed++; } } else count.seniors++;
    if (pp.sick[id]) count.sick++;
    if (age >= 18) edu[pp.edu[id]]++;
    hs += hpy;
    if (pp.work[id] >= 0 && pp.commute[id]) { cs += pp.commute[id]; cn++; }
  }
  Object.assign(ps, count, { pop: pp.count, edu, unemployed: count.workers - count.employed, happy: pp.count ? hs / pp.count : 55, commute: cn ? cs / cn : 0 });
  c.carSample = Math.min(1, 520 / Math.max(1, count.employed)); // thành phố lớn: chỉ vẽ một phần chuyến đi, phần còn lại tính thời gian
  // sổ sách theo ngày
  c.econ.last = { ...day, riders: c.transit.riders, mode: { ...ps.mode } };
  for (const k of Object.keys(day)) day[k] = 0;
  ps.mode = { car: 0, bus: 0, metro: 0, walk: 0 };
  c.transit.ridersDay = c.transit.riders; c.transit.riders = 0;
  for (const l of c.transit.lines) { l.ridersDay = l.riders; l.riders = 0; }
}

/** Đếm nhanh dân số / việc làm (dùng ngay sau khi nạp bản lưu hoặc giữa ngày). */
export function quickStats(c) {
  const pp = c.pp, ps = c.pstats, count = { kids: 0, adults: 0, seniors: 0, workers: 0, employed: 0, homeless: 0, sick: 0 }, edu = [0, 0, 0, 0];
  let hs = 0;
  for (let id = 0; id < pp.n; id++) {
    if (!pp.alive[id]) continue;
    const age = pp.age[id];
    if (age < 18) count.kids++; else if (age < 65) { count.adults++; if (!pp.enrolled[id]) { count.workers++; if (pp.work[id] >= 0) count.employed++; } } else count.seniors++;
    if (pp.home[id] < 0) count.homeless++;
    if (pp.sick[id]) count.sick++;
    if (age >= 18) edu[pp.edu[id]]++;
    hs += pp.happy[id];
  }
  Object.assign(ps, count, { pop: pp.count, edu, unemployed: count.workers - count.employed, happy: pp.count ? hs / pp.count : 55 });
}

// ───────────────────────── lưu / nạp ─────────────────────────

export function packPeople(c) {
  const pp = c.pp, n = pp.count, age = new Uint8Array(n), edu = new Uint8Array(n), home = new Uint16Array(n), work = new Uint16Array(n), money = new Int16Array(n);
  let k = 0;
  for (let id = 0; id < pp.n; id++) {
    if (!pp.alive[id]) continue;
    age[k] = clamp(pp.age[id], 0, 255); edu[k] = pp.edu[id] | (pp.study[id] << 2); home[k] = pp.home[id] < 0 ? 0xffff : pp.home[id]; work[k] = pp.work[id] < 0 ? 0xffff : pp.work[id]; money[k] = clamp(pp.money[id], -3000, 3000);
    k++;
  }
  return { age, edu, home: new Uint8Array(home.buffer), work: new Uint8Array(work.buffer), money: new Uint8Array(money.buffer) };
}

export function unpackPeople(c, o) {
  const n = o.age.length, home = new Uint16Array(o.home.buffer.slice(0, n * 2)), work = new Uint16Array(o.work.buffer.slice(0, n * 2)), money = new Int16Array(o.money.buffer.slice(0, n * 2));
  for (let k = 0; k < n; k++) {
    let h = home[k] === 0xffff ? -1 : home[k];
    if (h >= 0 && (!c.level[h] || c.resCount[h] >= resCap(c.zone[h], c.level[h]) + 2)) h = -1; // +2: trẻ sinh ra ở nhà đã kín chỗ
    const id = addCitizen(c, o.age[k], o.edu[k] & 3, h, money[k]);
    c.pp.study[id] = o.edu[k] >> 2;
    const w = work[k] === 0xffff ? -1 : work[k];
    if (w >= 0 && c.level[w] && c.staff[w] < jobCap(c.zone[w], c.level[w])) { c.pp.work[id] = w; c.staff[w]++; }
  }
  quickStats(c);
}


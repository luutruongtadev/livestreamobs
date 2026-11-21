// Phố Mới — từng người dân và từng doanh nghiệp là một thực thể.
// Người: tuổi, học vấn, nhà, chỗ làm, tiền, hạnh phúc, sức khoẻ; vòng đời sinh → học → làm → nghỉ hưu → mất;
// lịch hằng ngày sinh ra chuyến đi thật trên đường. Doanh nghiệp: tiền, kho, lương, lãi lỗ, phá sản;
// hàng đi theo chuỗi nguyên liệu → nhà máy → cửa hàng bằng xe tải, thiếu thì nhập, thừa thì xuất.
import { MK, N, ZDEF, SERVICES, PRICE, RAW, RAW_KINDS, PRODUCTS, PRODUCT_KINDS, SHOP_KINDS, productAt, recipeAt, importMultOf, priceOf, factoryNeed, svcVal, resCap, jobCap, reqEdu, garbageLimit, cellX, cellZ, clamp, nearestOnEdge, hash2 } from './base.js';
import { festMul } from './seasons.js';
import { chooseVehicle, countTrip, inCenter, aqiSick } from './street.js';
import { trip, later, walk, cellPos, reroute } from './traffic.js';
import { planRide, board, onBusArrive } from './transit.js';
import { ferryDay } from './ships.js';
import { mkt } from './econ.js';
import { incidentArrive } from './incidents.js';
import { distFx, noteExport } from './districts.js';
import { fisheryMul } from './fishery.js';
import { world, inner, cityGet, cityTake, worldK, groupFlow, popIn, popOut, ruralLeft } from './ledger.js';
import { extract } from './reserve.js';

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
    trip: new Uint16Array(cap), // số thứ tự chuyến đi: xe tới muộn của chuyến đã huỷ thì bỏ qua
  };
  const U16 = () => new Uint16Array(N * N), F32 = () => new Float32Array(N * N);
  c.resCount = U16(); c.staff = U16(); c.present = U16(); c.parked = U16(); c.garbage = F32(); c.fire = new Uint8Array(N * N); c.fireTruck = new Uint8Array(N * N);
  c.dead = new Uint8Array(N * N); c.hearseTo = new Uint8Array(N * N); // người mất chờ xe tang ở từng nhà; nhà đã có xe tang đang tới
  c.biz = { money: F32(), sin: F32(), sin2: F32(), sinK: F32().fill(1), sout: F32(), eff: F32().fill(0.5), incoming: new Uint8Array(N * N), rev: F32(), rp: F32().fill(1), rs: F32(), sh: F32(), nh: 0 }; // rev: doanh thu cộng dồn (không lưu); rp: hệ số giá bán lẻ (lưu); rs, sh, nh: lượng bán, tổng kệ hàng, số giờ trong ngày (retailDay)
  c.econ = { ring: Array.from({ length: 24 }, () => ({ r: 0, c: 0, i: 0 })), imports: 0, exports: 0, bankrupt: 0, parkSearch: 0, movedOut: 0, born: 0, died: 0, day: { imports: 0, exports: 0, bankrupt: 0, parkSearch: 0, movedOut: 0, born: 0, died: 0, riders: 0 } };
  c.pstats = { pop: 0, kids: 0, adults: 0, seniors: 0, workers: 0, employed: 0, unemployed: 0, homeless: 0, sick: 0, students: 0, edu: [0, 0, 0, 0], happy: 55, commute: 0, mode: { car: 0, bus: 0, tram: 0, metro: 0, ferry: 0, walk: 0 }, housing: 0, crime: 0, jobs: 0, jobsBy: { c: 0, i: 0, o: 0 }, vacJobs: 0, companies: 0, eff: 0.5 };
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

/** money: tiền mang theo, tính theo đơn vị cũ (nhân MK khi vào ví). from: rural / abroad / born / load (sổ dân, ledger.js). */
export function addCitizen(c, age, edu, home, money = 40, from = 'rural') {
  const pp = c.pp;
  let id = pp.free.pop();
  if (id === undefined) { if (pp.n >= pp.cap) growPeople(pp); id = pp.n++; }
  pp.alive[id] = 1; pp.gen[id]++; pp.age[id] = age; pp.edu[id] = edu; pp.study[id] = 0; pp.enrolled[id] = 0;
  pp.home[id] = home; pp.work[id] = -1; pp.loc[id] = home; pp.car[id] = -1; pp.money[id] = money * MK * (from === 'rural' || from === 'abroad' ? worldK(c) : 1); pp.happy[id] = 55; // tiền mang theo lấy từ thế giới bên ngoài
  world(c, 'arrive', pp.money[id]); popIn(c, from);
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

/** to: toRural (mặc định) / toAbroad / died. */
export function removeCitizen(c, id, to = 'toRural') {
  const pp = c.pp;
  if (!pp.alive[id]) return;
  leaveJob(c, id); freeParking(c, id);
  if (pp.home[id] >= 0 && c.resCount[pp.home[id]] > 0) c.resCount[pp.home[id]]--;
  world(c, 'leave', -pp.money[id]); popOut(c, to);
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
  c.resCount[i] = 0; c.staff[i] = 0; c.present[i] = 0; c.parked[i] = 0; c.garbage[i] = 0; c.fire[i] = 0; c.fireTruck[i] = 0; c.dead[i] = 0;
  const b = c.biz; world(c, 'bizClose', -b.money[i]); b.money[i] = 0; if (b.rev) b.rev[i] = 0; b.sin[i] = 0; if (b.sin2) b.sin2[i] = 0; if (b.sinK) b.sinK[i] = 1; if (b.rp) b.rp[i] = 1; if (b.rs) { b.rs[i] = 0; b.sh[i] = 0; } b.sout[i] = 0; b.eff[i] = 0.5; b.incoming[i] = 0;
}

/** Lương mỗi giờ của một chỗ làm ở ô i. */
export const wageAt = (c, i) => MK * (1 + 0.4 * reqEdu(c.zone[i], c.level[i])) * (1 + 0.05 * (c.level[i] - 1)) * (c.corpPay && c.owner ? c.corpPay[c.owner[i]] || 1 : 1); // công ty trả cao hơn để giành lao động
/** Nguyên liệu một nhà máy đủ người dùng hết mỗi giờ. */
const FACT_RATE = 0.5; // nguyên liệu một công nhân chế biến mỗi giờ (nhập nguyên liệu, xuất hàng vẫn còn lãi)
const factoryUse = (c, i) => jobCap(c.zone[i], c.level[i]) * FACT_RATE * (1 + 0.12 * (c.level[i] - 1));
export const rentAt = (c, i) => MK * (1.5 + c.landValue[i] * 0.05 + (c.level[i] - 1) * 0.6) * (isTro(c, i) ? TRO_RENT : 1);
/** Nhà trọ: dãy phòng liền kề cấp 1–2 (một phần ba số ô, theo variant, khớp hình nhà trọ ở kiểu nhà Việt Nam) — tiền thuê rẻ hơn hẳn. */
export const TRO_RENT = 0.65;
export const isTro = (c, i) => c.zone[i] === 14 && c.level[i] >= 1 && c.level[i] <= 2 && c.variant[i] % 3 === 0;
const spots = (c, i) => (c.occ[i] ? svcVal(c.services[c.occ[i] - 1], 'spots') || 12 : 2 + Math.ceil((resCap(c.zone[i], c.level[i]) + jobCap(c.zone[i], c.level[i])) * 0.3));
const isShop = (c, i) => c.level[i] > 0 && (ZDEF[c.zone[i]].biz === 'shop' || ZDEF[c.zone[i]].biz === 'market');
/** Nguyên liệu một nhà máy / xưởng / chợ cần: xưởng và chợ chỉ nhận vài loại, nhà máy lớn nhận loại gán theo vị trí. */
export function needOf(c, i) { return bizKind(c, i) === 'market' ? ZDEF[c.zone[i]].needs[(hash2(i % N, (i / N) | 0, 91) * ZDEF[c.zone[i]].needs.length) | 0] : recipeOf(c, i)[0]; }
/** Thành phẩm của nhà máy / xưởng ở ô i (chuỗi sản xuất nhiều tầng, base.js PRODUCTS). */
export const productOf = (c, i) => productAt(i, c.zone[i]);
/** Nguyên liệu nhà máy / xưởng ở ô i cần: một hoặc hai loại (nguyên liệu thô hoặc thành phẩm trung gian như thép, nhựa). */
export const recipeOf = (c, i) => recipeAt(i, productOf(c, i));
/** Hệ số giá của một đơn vị hàng tiêu dùng so với hàng hoá chung cũ (để tính giá bán lẻ theo loại hàng trong kho). */
const shopK = (kind) => priceOf(kind) / PRICE.goods;
const isLeisure = (c, i) => c.level[i] > 0 && ZDEF[c.zone[i]].biz === 'leisure';
/** Nhà ở ô i dành cho ai: 'senior' (dưỡng lão), 'student' (ký túc xá) hoặc undefined (mọi người). */
const whoOf = (c, i) => ZDEF[c.zone[i]].who;
/** Người id có được ở nhà dành cho nhóm `who` không. */
const fits = (pp, id, who) => (who === 'senior' ? pp.age[id] >= 65 : who === 'student' ? pp.age[id] >= 18 && pp.age[id] < 25 && pp.edu[id] >= 2 && pp.work[id] < 0 : true);
/** Loại doanh nghiệp ở ô i: 'raw' khu chuyên biệt khai thác nguyên liệu, 'factory', 'shop', 'leisure', 'office' hoặc null. */
export function bizKind(c, i) {
  if (!c.level[i]) return null;
  const b = ZDEF[c.zone[i]].biz;
  return b === 'ind' ? 'factory' : b === 'res' ? 'raw' : b || null; // 'market' = chợ truyền thống
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
  const cb = { t: 'cit', id, gen: pp.gen[id], trip: ++pp.trip[id], dest, purpose };
  if (from < 0 || dest < 0 || from === dest) { later(c, 1, cb); return; }
  const d = dist(from, dest), mode = c.pstats.mode;
  const hue = (id * 0.6180339) % 1;
  if (d < 115) { mode.walk++; if (!walk(c, from, dest, cb, hue)) later(c, d / 9 + 1, cb); return; }
  // ước tính đi xe riêng sát thực tế: đường vòng + đèn đỏ (đo được ≈ 1.55 × đường chim bay / 22), cộng lấy xe, gửi xe, đi bộ từ chỗ đỗ
  const carEta = (d * 1.55) / 22 / Math.max(0.35, c.traffic.speedEma) + 8 + (purpose !== 'home' && c.parked[dest] >= spots(c, dest) ? 8 : 0);
  const ride = planRide(c, from, dest), rideEta = ride ? ride.eta * (c.street && c.street.busLane && ride.line.mode === 'bus' ? 0.8 : 1) : 0; // làn riêng: buýt nhanh hơn
  if (ride && rideEta * (1 + c.transit.fare * 0.05) < carEta * 1.3 + 4) { mode[ride.line.mode]++; board(c, ride, cb); return; }
  // xe riêng: ô tô hay xe máy (theo thu nhập, học vấn), chính sách cấm xe máy nội đô, phí ô tô vào trung tâm
  const ch = chooseVehicle(c, id, ride, d, inCenter(c, from) || inCenter(c, dest));
  countTrip(c, ch);
  if (ch.kind === 'transit') { mode[ride.line.mode]++; board(c, ride, cb); return; }
  if (ch.kind === 'walk') { mode.walk++; if (!walk(c, from, dest, cb, hue)) later(c, d / 9 + 1, cb); return; }
  mode.car++; if (ch.kind === 'car') mode.cars = (mode.cars || 0) + 1; else mode.moto = (mode.moto || 0) + 1;
  const kind = ch.kind; // kiểu Việt Nam: gần như ai cũng xe máy, giàu lên mới mua ô tô
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
      const price = ZDEF[c.zone[dest]].biz === 'market' ? PRICE.market : PRICE.retail; // đi chợ rẻ hơn
      const spend = Math.min(Math.max(0, pp.money[id]), 9 * MK), units = Math.min(c.biz.sin[dest], spend / price);
      pp.money[id] -= units * price; c.biz.sin[dest] -= units; inner(c, 'shop', units * price); saleIncome(c, dest, units * price, 'c');
    } else if (isLeisure(c, dest)) { // ăn uống, xem phim: trả tiền dịch vụ, không cần hàng
      const spend = Math.min(Math.max(0, pp.money[id]), 7 * MK);
      pp.money[id] -= spend; inner(c, 'shop', spend); saleIncome(c, dest, spend, 'c');
      pp.until[id] = c.hour + 3;
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
      if (!pp.alive[id] || pp.gen[id] !== cb.gen || (cb.trip !== undefined && (cb.trip & 0xffff) !== pp.trip[id])) return undefined; // chuyến cũ đã bị huỷ (đi quá lâu)
      if (cb.fail && cb.purpose === 'work') { leaveJob(c, id); pp.state[id] = ST.HOME; pp.loc[id] = pp.home[id]; return undefined; } // không có đường tới chỗ làm
      if (cb.car && !cb.parked && cb.purpose !== 'home' && cb.dest >= 0) {
        if (c.parked[cb.dest] < spots(c, cb.dest)) { c.parked[cb.dest]++; pp.car[id] = cb.dest; } else {
          // hết chỗ: tìm bãi đỗ xe gần đó, không có thì chạy vòng rồi đỗ lề đường
          c.econ.parkSearch++; c.econ.day.parkSearch++;
          let lot = null;
          for (const s of c.services) { if (SERVICES[s.type].spots && s.cell >= 0 && c.parked[s.cell] < svcVal(s, 'spots') && dist(s.cell, cb.dest) < svcVal(s, 'radius') * 10) { lot = s; break; } }
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
      const price = priceOf(cb.kind);
      let cost = cb.qty * price * (cb.imp ? importMultOf(cb.kind) * mkt(c, cb.kind) : c.fn.corpPrice(c, cb.kind, c.level[cb.from] ? cb.from : null)); // nhập khẩu theo giá thị trường; hàng trong thành phố theo cung cầu nội địa và hệ số bán của công ty
      let deal = null;
      if (cb.imp && c.fn && c.fn.contract && (deal = c.fn.contract(c, 'buy', cb.kind, cb.qty))) { // nhóm cạnh tranh: mua của thành phố khác theo hợp đồng, thuế nhập khẩu vào ngân sách
        const unit = price * deal.price, tariff = deal.qty * unit * deal.tariff, rest = cb.qty - deal.qty;
        cost = deal.qty * unit + tariff + rest * price * importMultOf(cb.kind) * mkt(c, cb.kind);
        b.money[to] -= tariff; c.money += tariff; inner(c, 'tariff', tariff); cost -= tariff;
        c.fn.tradeUse(c, 'buy', cb.kind, deal.qty, unit, to); cost -= deal.qty * unit; b.money[to] -= deal.qty * unit; // trả trước vào quỹ nhóm, máy chủ chuyển cho bên bán
      }
      c.fn.corpFlow(c, cb.kind, cb.imp ? 'imp' : 'dom', cb.qty);
      if (cb.imp) { const ik = c.econ.day.impK || (c.econ.day.impK = {}); ik[cb.kind] = (ik[cb.kind] || 0) + cb.qty; }
      if (cb.slot === 1) b.sin2[to] += cb.qty; // nguyên liệu thứ hai của nhà máy tầng 2
      else {
        if (bizKind(c, to) === 'shop' && PRODUCTS[cb.kind]) { const k0 = b.sinK[to] || 1; b.sinK[to] = (b.sin[to] * k0 + cb.qty * shopK(cb.kind)) / Math.max(1e-6, b.sin[to] + cb.qty); } // giá trị trung bình hàng trong kho
        b.sin[to] += cb.qty;
      }
      b.money[to] -= cost;
      if (cb.imp) world(c, 'import', -cost); else if (c.level[cb.from]) inner(c, 'supply', cost); else world(c, 'import', -cost); // bên bán đã dỡ: coi như trả ra ngoài
      if (cb.imp) { c.econ.imports += cb.qty; c.econ.day.imports += cb.qty; } else if (c.level[cb.from]) saleIncome(c, cb.from, cost, 'i'); // người bán nhận đúng số người mua trả
      return undefined;
    }
    case 'export': {
      const deal = c.fn && c.fn.contract ? c.fn.contract(c, 'sell', cb.kind, cb.qty) : null, rest = cb.qty - (deal ? deal.qty : 0); // nhóm cạnh tranh: bán cho thành phố khác theo hợp đồng
      if (deal && c.level[cb.from]) c.fn.tradeUse(c, 'sell', cb.kind, deal.qty, priceOf(cb.kind) * deal.price, cb.from); // tiền về khi máy chủ thanh toán (ngày giải sau)
      if (rest > 0 && c.level[cb.from]) saleIncome(c, cb.from, rest * priceOf(cb.kind) * (PRICE.exportMult + (c.tech.has('customs') ? 0.15 : 0) + (c.railExport || 0)) * mkt(c, cb.kind), 'i', 'export');
      { const ek = c.econ.day.expK || (c.econ.day.expK = {}); ek[cb.kind] = (ek[cb.kind] || 0) + cb.qty; }
      c.econ.day.exportValue = (c.econ.day.exportValue || 0) + cb.qty * priceOf(cb.kind) * mkt(c, cb.kind);
      if (c.dist && c.dist.on && c.level[cb.from]) noteExport(c, cb.from, cb.kind, cb.qty, cb.qty * priceOf(cb.kind) * mkt(c, cb.kind)); // sổ xuất khẩu của quận
      c.fn.corpFlow(c, cb.kind, 'exp', cb.qty);
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
      if (SERVICES[s.type].recycle) cityGet(c, 'scrap', got * SERVICES[s.type].recycle); // bán phế liệu đã phân loại
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
    case 'hearse': { // xe tang tới nhà: đưa người mất về nghĩa trang / đài hoá thân
      const s = svcByUid(c, cb.svc), got = c.dead[cb.cell];
      c.dead[cb.cell] = 0; c.hearseTo[cb.cell] = 0;
      if (!s) return undefined;
      const home = v && svcPos(c, s);
      if (home && reroute(c, v, home)) { v.cb = { t: 'hearseBack', svc: s.uid, n: got }; v.hold = 1.5; return 'keep'; }
      laid(s, got);
      s.out = Math.max(0, (s.out || 0) - 1);
      return undefined;
    }
    case 'hearseBack': { const s = svcByUid(c, cb.svc); if (s) { laid(s, cb.n); s.out = Math.max(0, (s.out || 0) - 1); } return undefined; }
    case 'svcBack': { const s = svcByUid(c, cb.svc); if (s) s.out = Math.max(0, (s.out || 0) - 1); return undefined; }
    default: return incidentArrive(c, cb, v);
  }
}

/** Người mất đã về tới nghĩa trang (lấp dần chỗ) hoặc đài hoá thân (tính vào suất hôm nay). */
function laid(s, n) {
  if (SERVICES[s.type].graves) s.fill = Math.min(SERVICES[s.type].graves, (s.fill || 0) + n);
  else s.burned = (s.burned || 0) + n;
}

/** Một người qua đời ở nhà: thành phố đủ lớn thì phải có xe tang tới đưa đi. */
export function die(c, id) {
  const home = c.pp.home[id];
  removeCitizen(c, id, 'died'); c.econ.died++; c.econ.day.died++;
  if (home >= 0 && c.pp.count >= 400 && c.dead[home] < 250) c.dead[home]++;
}

/** Du khách tới bằng tàu: mỗi người tiêu ít tiền ở quán ăn, chỗ vui chơi, cửa hàng ngẫu nhiên trong thành phố. */
export function touristSpend(c, n, per = 8) {
  if (!n) return;
  if (c.tour && per === 8) c.tour.day.ferry += n; // du khách tới bằng tàu
  const spots = [];
  for (let i = 0; i < N * N; i++) if (isLeisure(c, i) || isShop(c, i)) spots.push(i);
  if (!spots.length) return;
  const rng = c.rng || Math.random;
  for (let k = 0; k < Math.min(n, 400); k++) saleIncome(c, spots[Math.floor(rng() * spots.length)], per * MK * Math.max(1, n / 400), 'c', 'tourist');
}

/** Doanh thu của một doanh nghiệp: trừ thuế, thành phố thu phần thuế đó. */
export function saleIncome(c, i, amount, cat, from) {
  const rate = (c.tax[cat] / 100) * (1 - (c.taxBreakK || 0)); // nhà đầu tư được miễn một phần thuế (council.js)
  if (from && from.startsWith('group:')) groupFlow(c, from.slice(6), amount); // thành phố khác trả qua máy chủ nhóm: đúng số, không qua ví thế giới
  else if (from) { amount *= worldK(c); world(c, from, amount); } // người trả ở ngoài thành phố: thế giới nghèo đi thì trả ít đi (ledger.js)
  c.biz.money[i] += amount * (1 - rate);
  if (c.biz.rev) c.biz.rev[i] += amount;
  c.hourInc[cat] += amount * rate; // thuế thật: ngân sách nhận đúng phần bị trừ
}

/** Dân trả chung một khoản (phí đường, vé tàu thuỷ...): trừ theo tỉ lệ ví dương, tiền vào ngân sách. Trả về số đã thu. */
export function householdPay(c, amount, key = 'fare') {
  const pp = c.pp;
  if (!(amount > 0)) return 0;
  let purse = 0;
  for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.money[id] > 0) purse += pp.money[id];
  if (purse <= 0) return 0;
  const f = Math.min(1, amount / purse);
  let paid = 0;
  for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.money[id] > 0) { const b = pp.money[id]; pp.money[id] = b - b * f; paid += b - pp.money[id]; }
  cityTake(c, key, paid);
  return paid;
}

/** Doanh nghiệp trong thành phố đang hoạt động (cập nhật mỗi giờ) để nhận thầu. */
const bizCat = (c, i) => (ZDEF[c.zone[i]].biz === 'ind' || ZDEF[c.zone[i]].biz === 'res' ? 'i' : 'c');
/**
 * Thuê doanh nghiệp trong thành phố (thầu xây dựng, bảo trì, dịch vụ): tiền chia cho các doanh nghiệp theo số chỗ làm,
 * thành doanh thu (có thuế). Phần vượt năng lực nhận thầu (khoảng 2 ngày lương của cả thành phố) thì thuê ngoài.
 */
export function procure(c, amount, key) {
  const list = c.bizList;
  if (!(amount > 0)) return;
  let cap = 0;
  if (list) for (const i of list) cap += jobCap(c.zone[i], c.level[i]);
  const local = Math.min(amount, cap * MK * 40);
  if (local > 0) {
    for (const i of list) saleIncome(c, i, (local * jobCap(c.zone[i], c.level[i])) / cap, bizCat(c, i));
    inner(c, 'procure', local);
  }
  if (amount - local > 0) world(c, key, -(amount - local));
}

// ───────────────────────── mỗi giờ ─────────────────────────

export function peopleHour(c) {
  const pp = c.pp, h = c.hour % 24, weekend = c.day % 7 >= 5, rng = c.rng, ps = c.pstats;
  // 1) quét toà nhà: nhà còn chỗ, việc còn trống, danh sách cửa hàng
  const vacHomes = [], vacSenior = [], vacDorm = [], vacJobs = [], shops = [], leisure = [], companies = [];
  let housing = 0, jobs = 0, jc = 0, ji = 0, jo = 0;
  for (let i = 0; i < N * N; i++) {
    const L = c.level[i];
    if (!L) continue;
    const z = c.zone[i], rc = resCap(z, L), jb = jobCap(z, L);
    if (pp.count >= 120) c.garbage[i] += (rc + jb) / 55; // trước mốc mở khoá bãi rác thì chưa tính rác
    if (rc) { housing += rc; if (c.resCount[i] < rc && c.pOk[i] === 1 && c.wOk[i] === 1 && !c.fire[i]) (ZDEF[z].who === 'senior' ? vacSenior : ZDEF[z].who === 'student' ? vacDorm : vacHomes).push(i); }
    if (jb) {
      jobs += jb; companies.push(i);
      const cat = ZDEF[z].biz === 'ind' || ZDEF[z].biz === 'res' ? 'i' : ZDEF[z].biz === 'office' ? 'o' : 'c';
      if (cat === 'i') ji += jb; else if (cat === 'o') jo += jb; else jc += jb;
      if (c.staff[i] < jb) vacJobs.push(i);
      if (ZDEF[z].biz === 'shop' || ZDEF[z].biz === 'market') shops.push(i);
      else if (ZDEF[z].biz === 'leisure') leisure.push(i);
    }
  }
  ps.housing = housing; ps.jobs = jobs; ps.jobsBy = { c: jc, i: ji, o: jo }; ps.companies = companies.length;
  c.vac = { senior: vacSenior, student: vacDorm, home: vacHomes };

  // 2) nhập cư: có nhà trống và thành phố đang hút dân
  if (vacHomes.length && c.pull > 0.05) {
    const hasHS = c.services.some((s) => s.type === 'highschool'), hasU = c.services.some((s) => s.type === 'university');
    let arrive = Math.min(40, Math.ceil(c.pull * (1.5 + (housing - pp.count) * 0.035)));
    while (arrive-- > 0 && vacHomes.length && ruralLeft(c)) { // dân mới đến từ nông thôn: nông thôn hết người thì thôi
      const k = (rng() * vacHomes.length) | 0, hcell = vacHomes[k];
      const r = rng(), edu = r < 0.05 + (hasU ? 0.12 : 0) ? 3 : r < 0.22 + (hasHS ? 0.2 : 0) ? 2 : r < 0.6 ? 1 : 0;
      addCitizen(c, 20 + rng() * 25, edu, hcell, 30 + rng() * 60);
      if (rng() < 0.3 && ruralLeft(c) && c.resCount[hcell] < resCap(c.zone[hcell], c.level[hcell])) addCitizen(c, rng() * 16, 0, hcell, 0);
      if (c.resCount[hcell] >= resCap(c.zone[hcell], c.level[hcell])) vacHomes.splice(k, 1);
    }
  }
  // người già về nhà dưỡng lão, sinh viên tới ký túc xá (chỉ khi thành phố có trường đại học)
  if (c.pull > -0.3) {
    const hasU = c.services.some((s) => s.type === 'university');
    for (const [list, n, p, make] of [[vacSenior, 1, 0.35, () => addCitizen(c, 65 + rng() * 7, (rng() * 3) | 0, -1, 60 + rng() * 120)], [hasU ? vacDorm : [], 3, 0.6, () => addCitizen(c, 18 + rng() * 3, 2, -1, 20 + rng() * 20)]]) {
      for (let k = 0; k < n && list.length && ruralLeft(c) && rng() < p; k++) {
        const j = (rng() * list.length) | 0, hcell = list[j], id = make();
        pp.home[id] = hcell; pp.loc[id] = hcell; c.resCount[hcell]++;
        if (c.resCount[hcell] >= resCap(c.zone[hcell], c.level[hcell])) list.splice(j, 1);
      }
    }
  }

  // 3) lịch sinh hoạt + lương + tìm việc + tìm nhà
  let wages = 0, matched = 0, sickDispatch = 0;
  const clinics = c.services.filter((s) => SERVICES[s.type].ambulances && s.cell >= 0);
  const ambOf = (s) => svcVal(s, 'ambulances');
  for (let id = 0; id < pp.n; id++) {
    if (!pp.alive[id]) continue;
    const age = pp.age[id], st = pp.state[id], adult = age >= 18 && age < 65;
    const hlist = age >= 65 && vacSenior.length ? vacSenior : fits(pp, id, 'student') && pp.enrolled[id] && vacDorm.length ? vacDorm : vacHomes;
    if (pp.home[id] < 0 && hlist.length) { // vô gia cư tìm được nhà
      const hcell = hlist[(rng() * hlist.length) | 0];
      if (c.resCount[hcell] < resCap(c.zone[hcell], c.level[hcell])) { pp.home[id] = hcell; c.resCount[hcell]++; if (pp.loc[id] < 0) pp.loc[id] = hcell; pp.idle[id] = 0; }
    }
    if (adult && pp.work[id] < 0 && !pp.enrolled[id] && matched < 60 && vacJobs.length) { // tìm việc: thử vài chỗ, lấy chỗ gần nhất đủ trình độ
      let best = -1, bd = Infinity;
      const base = pp.home[id];
      for (let k = 0; k < 6; k++) {
        const j = vacJobs[(rng() * vacJobs.length) | 0];
        if (c.staff[j] >= jobCap(c.zone[j], c.level[j]) || reqEdu(c.zone[j], c.level[j]) > pp.edu[id]) continue;
        const d = (base >= 0 ? dist(base, j) : 0) / (c.corpPay && c.owner ? c.corpPay[c.owner[j]] || 1 : 1); // lương cao: coi như gần hơn
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) { pp.work[id] = best; c.staff[best]++; matched++; pp.idle[id] = 0; }
    }
    if (st === ST.HOME) {
      const w = pp.work[id];
      if (w >= 0 && !weekend && h === 4 + (id % 7) && pp.home[id] >= 0) go(c, id, w, 'work');
      else if (age >= 14 && (shops.length || leisure.length) && pp.home[id] >= 0 && !pp.sick[id] && rng() < (weekend || w < 0 ? (h >= 8 && h <= 18 ? 0.06 : h >= 18 && h <= 22 && leisure.length ? 0.03 : 0) : h >= 18 && h <= 21 ? 0.04 : 0)) {
        const fun = leisure.length && (!shops.length || rng() < (h >= 17 ? 0.6 : 0.3)), pool = fun ? leisure : shops; // tối thì đi ăn, đi chơi nhiều hơn
        let best = pool[(rng() * pool.length) | 0];
        for (let k = 0; k < 3; k++) { const j = pool[(rng() * pool.length) | 0]; if (dist(pp.home[id], j) < dist(pp.home[id], best)) best = j; }
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
      pp.state[id] = ST.HOME; pp.loc[id] = pp.home[id]; freeParking(c, id); pp.trip[id]++; // xe của chuyến này tới muộn cũng không tính
    }
    if (pp.sick[id]) {
      if (pp.sick[id] < 250) pp.sick[id]++;
      if (!pp.amb[id] && sickDispatch < 4 && pp.home[id] >= 0 && clinics.length) {
        let best = null, bd = Infinity;
        for (const s of clinics) { if ((s.out || 0) >= ambOf(s)) continue; const d = dist(s.cell, pp.home[id]); if (d < bd) { bd = d; best = s; } }
        const from = best && svcPos(c, best);
        if (from && trip(c, 'ambulance', from, pp.home[id], { t: 'amb', id, gen: pp.gen[id], svc: best.uid }, true)) { best.out = (best.out || 0) + 1; pp.amb[id] = 1; sickDispatch++; }
      }
    }
  }
  inner(c, 'wage', wages * (1 - c.tax.r / 100));
  c.hourInc.r += wages * c.tax.r / 100; // thuế thu nhập đã trừ vào lương // thu đều cả tuần ở smoothWeek (sim.js)

  c.bizList = companies; // nhận thầu của ngân sách (procure)
  // dân mua hàng ở cửa hàng, chợ qua nhu cầu gộp: tối đa 1% tiền tiết kiệm mỗi giờ, trừ đều theo ví
  let purse = 0;
  for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.money[id] > 0) purse += pp.money[id];
  const bought = bizHour(c, companies, shops, h, purse * 0.01);
  if (bought > 0 && purse > 0) {
    let now = 0, paid = 0; // ví dân có thể vừa nhận cổ tức trong bizHour: chia theo số dư hiện tại cho khớp sổ
    for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.money[id] > 0) now += pp.money[id];
    const f = Math.min(1, bought / now);
    for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.money[id] > 0) { const before = pp.money[id]; pp.money[id] = before - before * f; paid += before - pp.money[id]; }
    inner(c, 'shop', bought);
    if (bought - paid) world(c, 'clamp', bought - paid); // làm tròn số thực 32 bit
  }
  servicesHour(c, h);
  if (h === 0) peopleDay(c);
  ps.vacJobs = Math.max(0, jobs - ps.employed);
}

// ───────────────────────── doanh nghiệp ─────────────────────────

/**
 * Chủ nhà (ví của toà nhà ở): mỗi ngày nộp thuế nhà đất về ngân sách và thuê doanh nghiệp sửa chữa, bảo trì,
 * nên tiền nhà quay lại vòng kinh tế, ví toà nhà không phình mãi.
 */
function landlordDay(c) {
  const b = c.biz;
  let tax = 0, fix = 0;
  for (let i = 0; i < N * N; i++) {
    if (!c.level[i] || jobCap(c.zone[i], c.level[i]) || !resCap(c.zone[i], c.level[i]) || !(b.money[i] > 0)) continue;
    const m = b.money[i], t = m * (c.tax.r / 100) * 0.5, f = m * 0.35;
    b.money[i] -= t + f; tax += t; fix += f;
  }
  c.hourInc.r += tax;
  procure(c, fix, 'landlord');
  // doanh nghiệp có lãi chia một phần lợi nhuận cho dân (chủ sở hữu, cổ đông): tiền không dồn mãi trong ví doanh nghiệp
  let div = 0;
  for (let i = 0; i < N * N; i++) {
    if (!c.level[i] || !jobCap(c.zone[i], c.level[i]) || !(b.money[i] > 400 * MK)) continue;
    const d = (b.money[i] - 400 * MK) * 0.25;
    b.money[i] -= d; div += d;
  }
  const pp = c.pp;
  let adults = 0;
  for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.age[id] >= 18) adults++;
  if (div > 0 && adults) { const per = div / adults; for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.age[id] >= 18) pp.money[id] += per; inner(c, 'dividend', div); }
  else if (div > 0) world(c, 'dividend', -div); // chưa có dân: chủ ở ngoài thành phố
}

/**
 * Giá bán lẻ theo cung cầu (mỗi ngày, cho từng cửa hàng, sạp chợ): hàng trên kệ (trung bình cả ngày) cạn thì tăng giá, ứ thì hạ
 * giá để đẩy hàng, kéo dần về giá gốc; trong khung 0.8–1.4. Dân chia nhu cầu theo giá tương đối (rẻ hơn thì đông khách hơn) và mua
 * ít đi khi mặt bằng giá cao (bizHour). Chỉ số giá chung (c.retailIdx, bình quân theo lượng bán, chưa ai mua thì theo số chỗ làm)
 * ảnh hưởng độ hài lòng của dân (sim.js cellHappy).
 */
export const RETAIL = { min: 0.8, max: 1.4, target: 10, hi: 1.15, lo: 0.92, swap: 2, total: 0.6 }; // swap: dân đổi sang chỗ rẻ hơn; total: cả thành phố mua ít đi khi giá chung cao
export function retailDay(c, companies) {
  const b = c.biz;
  let w = 0, s = 0, wj = 0, sj = 0;
  for (const i of companies) {
    const kind = bizKind(c, i);
    if (kind !== 'shop' && kind !== 'market') continue;
    const shelf = b.nh >= 6 ? b.sh[i] / b.nh : b.sin[i]; // kệ hàng trung bình trong ngày (không chỉ lúc nửa đêm)
    const want = clamp((RETAIL.target - shelf) / 30, -0.4, 0.4); // kệ cạn: +, kệ đầy: −
    const tgt = c.owner && c.owner[i] && c.corpMark ? c.corpMark[c.owner[i]] || 1 : 1; // cửa hàng của công ty hướng tới hệ số bán của công ty (chính sách giá của CEO)
    b.rp[i] = clamp((b.rp[i] || 1) + want * 0.08 + (tgt - (b.rp[i] || 1)) * (c.owner && c.owner[i] ? 0.1 : 0.04), RETAIL.min, RETAIL.max); // công ty chỉnh giá nhanh hơn chủ cửa hàng nhỏ
    w += b.rs[i]; s += b.rs[i] * b.rp[i];
    const jc = jobCap(c.zone[i], c.level[i]); wj += jc; sj += jc * b.rp[i];
    b.rs[i] = 0; b.sh[i] = 0;
  }
  b.nh = 0;
  const was = c.retailIdx || 1; c.retailIdx = w > 1 ? s / w : wj ? sj / wj : 1; // giá dân thật sự trả
  const st = (v) => (v > RETAIL.hi ? 2 : v < RETAIL.lo ? 0 : 1);
  if (c.events && st(c.retailIdx) !== st(was)) c.events.push({ type: 'council', text: st(c.retailIdx) === 2 ? `🏷️ Giá hàng trong thành phố đắt lên (×${c.retailIdx.toFixed(2)}): nhiều nơi hết hàng, cần thêm nhà máy hoặc nhập hàng` : st(c.retailIdx) === 0 ? `🏷️ Hàng hoá dồi dào, giá bán lẻ rẻ đi (×${c.retailIdx.toFixed(2)})` : `🏷️ Giá bán lẻ về mức bình thường (×${c.retailIdx.toFixed(2)})` });
}

/** Doanh nghiệp làm việc một giờ; budget: tiền dân sẵn sàng chi cho nhu cầu gộp. Trả về tiền dân đã chi. */
function bizHour(c, companies, shops, h, budget = Infinity) {
  const b = c.biz, open = h >= 6 && h <= 20;
  let shopW = 0, presAll = 0, presRp = 0, bought = 0;
  for (const i of shops) { const p = c.present[i], rp = b.rp[i] || 1; shopW += p * Math.pow(rp, -RETAIL.swap); presAll += p; presRp += p * rp; } // khách chia theo giá tương đối
  const totK = presAll ? Math.pow(presRp / presAll, -RETAIL.total) : 1; // mặt bằng giá cao: cả thành phố mua ít đi
  const shareOf = (i) => (shopW ? (c.present[i] * Math.pow(b.rp[i] || 1, -RETAIL.swap)) / shopW : 0) * totK;
  b.nh++;
  const demand = c.pp.count * DEMAND_PER_HEAD * (open ? 1.5 : 0.2) * (1 + c.bonus.comm);
  let budgetLeft = budget; // tiền dân sẵn sàng chi cho nhu cầu gộp trong giờ
  const needs = {}, supply = {}, needShop = [], broke = [];
  for (const k of [...RAW_KINDS, ...PRODUCT_KINDS]) { needs[k] = []; supply[k] = []; } // nhu cầu: [ô, khe nguyên liệu]
  const boost = c.tech.has('survey') ? 1.2 : 1, fest = c.fest ? festMul(c, 'ind') : 1; // Tết: nhà máy nghỉ
  let effSum = 0, fixed = 0;
  for (const i of companies) {
    const kind = c.ware && c.ware[i] ? 'ware' : bizKind(c, i), pres = c.present[i], cap = jobCap(c.zone[i], c.level[i]); // kho bãi của công ty: không sản xuất
    b.money[i] -= 0.12 * MK * c.level[i]; fixed += 0.12 * MK * c.level[i]; // chi phí cố định
    const prod = (1 + 0.12 * (c.level[i] - 1)) * (kind === 'raw' || kind === 'factory' ? fest : 1) * (c.hub && c.hub[i] ? 1.1 : 1) * (c.flood && c.flood[i] >= 1.5 ? 0.2 : 1); // ngập: gần như đứng máy
    let active = pres > 0;
    if (kind === 'raw') {
      const rk = ZDEF[c.zone[i]].raw;
      b.sout[i] += extract(c, i, rk, Math.min(48 - b.sout[i], pres * RAW[rk].rate * prod * boost * (rk === 'fish' ? fisheryMul(c, i) : 1))); // bến cá: tàu ra ngư trường gần bến; lấy từ trữ lượng của ô (reserve.js)
      if (b.sout[i] >= PRICE.load) supply[rk].push(i);
    } else if (kind === 'ware') { // kho bãi, logistics: công ty trả phí lưu kho, kho trả lương; kho còn tăng chỗ chứa cho nhà máy cùng nhóm
      c.fn.corpPayWare(c, i, pres * 0.5 * MK);
    } else if (kind === 'factory') {
      const rec = recipeOf(c, i), two = rec.length > 1; // nhà máy tầng 2 cần đủ cả hai nguyên liệu
      const use = Math.min(b.sin[i], two ? b.sin2[i] : Infinity, pres * FACT_RATE * prod, 48 + (c.corpStore && c.owner ? c.corpStore[c.owner[i]] || 0 : 0) - b.sout[i]); // kho của nhóm thêm chỗ chứa
      b.sin[i] -= use; if (two) b.sin2[i] -= use; b.sout[i] += use;
      if (pres && use < pres * 0.2) active = false;
      const low = Math.max(6, factoryUse(c, i) * 6); // đặt hàng khi kho còn khoảng 6 giờ chạy máy
      if (!b.incoming[i]) { if (b.sin[i] < low) needs[rec[0]].push([i, 0]); if (two && b.sin2[i] < low) needs[rec[1]].push([i, 1]); } // tầng 2: đặt cả hai nguyên liệu cùng lúc
      if (b.sout[i] >= PRICE.load) supply[productOf(c, i)].push(i);
    } else if (kind === 'shop') {
      const rp = b.rp[i] || 1, unitV = PRICE.retail * (b.sinK[i] || 1) * rp; // hàng đắt (máy móc, điện tử) bán được giá hơn; giá bán lẻ theo cung cầu (retailDay)
      const sold = Math.max(0, Math.min(b.sin[i], demand * shareOf(i), pres * 0.3 * prod, budgetLeft / unitV)); // đắt hơn chỗ khác thì vắng khách
      b.sin[i] -= sold; b.rs[i] += sold; b.sh[i] += b.sin[i];
      if (sold > 0) { saleIncome(c, i, sold * unitV, 'c'); bought += sold * unitV; budgetLeft -= sold * unitV; }
      if (pres && b.sin[i] <= 0.01) active = false;
      if (b.sin[i] < 6 && !b.incoming[i]) needShop.push(i);
    } else if (kind === 'market') { // chợ: bán thẳng nông sản, cá; sạp nhỏ nên bán chậm hơn cửa hàng một chút
      const rp = b.rp[i] || 1, pm = PRICE.market * rp;
      const sold = Math.max(0, Math.min(b.sin[i], demand * shareOf(i), pres * 0.26 * prod, budgetLeft / pm));
      b.sin[i] -= sold; b.rs[i] += sold; b.sh[i] += b.sin[i];
      if (sold > 0) { saleIncome(c, i, sold * pm, 'c'); bought += sold * pm; budgetLeft -= sold * pm; }
      if (pres && b.sin[i] <= 0.01) active = false;
      if (b.sin[i] < 6 && !b.incoming[i]) needs[needOf(c, i)].push([i, 0]);
    } else if (kind === 'leisure') {
      if (pres && open) saleIncome(c, i, pres * 0.35 * MK * (1 + c.bonus.comm), 'c', 'visitor'); // khách vãng lai ngoài số dân tự đi chơi
    } else if (kind === 'office' && pres) saleIncome(c, i, pres * (0.5 * MK + wageAt(c, i)) * (ZDEF[c.zone[i]].inc || 1) * (c.zone[i] === 18 && c.cover.sci[i] > 0.05 ? 1.3 : 1), 'c', 'office');
    if (h >= 9 && h <= 17 && c.day % 7 < 5) b.eff[i] += ((active ? Math.min(1, pres / Math.max(1, cap * 0.5)) : 0) - b.eff[i]) * 0.06; // ca làm lệch giờ nhau nên có mặt một nửa đã là đủ người
    effSum += b.eff[i];
    if (b.incoming[i] && ++b.incoming[i] > 20) b.incoming[i] = 0; // xe hàng thất lạc
    if (b.money[i] < -380 * MK * (kind === 'factory' ? Math.max(1, priceOf(productOf(c, i)) / PRICE.goods) : 1)) broke.push(i); // nhà máy hàng đắt (máy móc, điện tử) mua nguyên liệu đắt: vốn lưu động lớn hơn
  }
  procure(c, fixed, 'bizCost'); // chi phí cố định: thuê dịch vụ của doanh nghiệp khác
  if (h === 0) { landlordDay(c); retailDay(c, companies); }
  c.pstats.eff = companies.length ? effSum / companies.length : 0.5;
  // giao hàng: nhà cung cấp trong thành phố gần nhất, không có thì nhập từ ngoài
  let trucks = 0;
  for (const v of c.traffic.vehicles) if (v.kind === 'truck') trucks++;
  // kinds: các loại nhà cung cấp nhận được (cửa hàng nhận mọi hàng tiêu dùng); không ai cung cấp thì nhập từ ngoài
  const og = (i) => (c.corpGroup && c.owner ? c.corpGroup[c.owner[i]] | 0 : 0); // nhóm công ty của ô: hàng trong nhóm ưu tiên giao cho nhau
  const deliver = (list, kinds, importKind) => {
    for (const [to, slot] of list.slice(0, 24)) {
      const qty = bizKind(c, to) === 'factory' ? clamp(Math.round(factoryUse(c, to) * 8), PRICE.load, PRICE.loadF) : PRICE.load; // nhà máy: xe to, đủ chạy chừng 8 giờ
      let best = -1, bk = null, bd = Infinity;
      for (const k of kinds) for (const s of supply[k]) { if (b.sout[s] < qty) continue; const d = dist(s, to) * (og(s) && og(s) === og(to) ? (c.corpStore && c.corpStore[c.owner[s]] ? 0.42 : 0.55) : 1); if (d < bd) { bd = d; best = s; bk = k; } }
      if (best >= 0) {
        if (trip(c, 'truck', best, to, { t: 'cargo', to, from: best, kind: bk, qty, slot }, trucks < MAX_TRUCKS)) { b.sout[best] -= qty; b.incoming[to] = 1; trucks++; if (og(best) && og(best) === og(to)) c.fn.corpNote(c, 'intern', best, qty); continue; }
      }
      const out = nearestOutside(c, to);
      if (out && trip(c, 'truck', out, to, { t: 'cargo', to, kind: importKind(), qty, imp: true, slot }, trucks < MAX_TRUCKS)) { b.incoming[to] = 1; trucks++; }
    }
  };
  for (const k of [...RAW_KINDS, ...PRODUCT_KINDS]) if (needs[k].length) deliver(needs[k], [k], () => k);
  const rng = c.rng || Math.random, wsum = SHOP_KINDS.reduce((a, k) => a + PRODUCTS[k].shop, 0);
  const pickShop = () => { let r = rng() * wsum; for (const k of SHOP_KINDS) { r -= PRODUCTS[k].shop; if (r <= 0) return k; } return SHOP_KINDS[0]; }; // nhập theo giỏ hàng của dân
  deliver(needShop.map((i) => [i, 0]), SHOP_KINDS, pickShop);
  // kho đầy mà trong thành phố không ai mua: xuất ra ngoài
  for (const [sups, kind] of [...RAW_KINDS, ...PRODUCT_KINDS].map((k) => [supply[k], k])) for (const s of sups) {
    const lot = c.corpStore && c.owner && c.corpStore[c.owner[s]] ? 24 : 16; // có kho: gom lô lớn, ít chuyến hơn
    if (b.sout[s] < Math.max(lot, c.corpExp && c.corpExp[c.owner[s]] ? 16 : 30)) continue; // công ty đẩy xuất khẩu: xuất sớm hơn
    const out = nearestOutside(c, s);
    if (out && trip(c, 'truck', s, out, { t: 'export', from: s, kind, qty: lot }, trucks < MAX_TRUCKS)) { b.sout[s] -= lot; trucks++; if (c.owner && c.owner[s]) c.fn.corpNote(c, 'export', s, lot); }
  }
  for (const i of broke) {
    c.econ.bankrupt++; c.econ.day.bankrupt++;
    c.events.push({ type: 'bankruptBiz', x: i % N, y: (i / N) | 0, kind: bizKind(c, i) });
    c.fn.clearBuilding(c, i);
  }
  return bought;
}

// ───────────────────────── xe dịch vụ, cháy ─────────────────────────

function servicesHour(c, h) {
  const rng = c.rng;
  // xe rác: tới con đường bẩn nhất trong bán kính
  for (const s of c.services) {
    const d = SERVICES[s.type];
    if (!d.trash || !d.trucks || s.cell < 0 || h < 5 || h > 20 || (s.out || 0) >= svcVal(s, 'trucks') || (s.processed || 0) >= svcVal(s, 'trash')) continue;
    let best = -1, bg = 4;
    const reach = svcVal(s, 'radius') * 10;
    for (let i = 0; i < N * N; i++) if (c.garbage[i] > bg && c.level[i] && !c.gbusy.has(c.cedge[i]) && dist(i, s.cell) < reach) { bg = c.garbage[i]; best = i; }
    const from = best >= 0 && svcPos(c, s);
    if (from && trip(c, 'garbage', from, best, { t: 'garbage', svc: s.uid, cell: best, edge: c.cedge[best] }, true)) { s.out = (s.out || 0) + 1; c.gbusy.add(c.cedge[best]); }
  }
  // xe tang: tới nhà có người mất gần nhất trong bán kính, khi nghĩa trang còn chỗ / đài hoá thân còn suất hôm nay
  for (const s of c.services) {
    const d = SERVICES[s.type];
    if (!d.hearses || s.cell < 0) continue;
    while ((s.out || 0) < d.hearses) {
      if (d.graves ? (s.fill || 0) + (s.out || 0) * 3 >= d.graves : (s.burned || 0) + (s.out || 0) * 3 >= d.cremate) break;
      let best = -1, bd = svcVal(s, 'radius') * 10;
      for (let i = 0; i < N * N; i++) if (c.dead[i] && !c.hearseTo[i]) { const dd = dist(i, s.cell); if (dd < bd) { bd = dd; best = i; } }
      const from = best >= 0 && svcPos(c, s);
      if (!from || !trip(c, 'hearse', from, best, { t: 'hearse', svc: s.uid, cell: best }, true)) break;
      s.out = (s.out || 0) + 1; c.hearseTo[best] = 1;
    }
  }
  // cháy: lửa lan dần, xe cứu hoả gần nhất phải chạy tới kịp
  let built = 0, pick = -1;
  for (let i = 0; i < N * N; i++) {
    if (c.level[i]) { built++; if (rng() < 1 / built) pick = i; }
    if (!c.fire[i]) continue;
    if (--c.fire[i] === 0) { c.events.push({ type: 'fire', x: i % N, y: (i / N) | 0, zone: c.zone[i] }); c.fn.clearBuilding(c, i); c.dirty.fx = true; continue; }
    for (const j of [i - 1, i + 1, i - N, i + N]) if (j >= 0 && j < N * N && c.level[j] && !c.fire[j] && rng() < 0.05) { c.fire[j] = 7; c.dirty.fx = true; } // lửa lan sang nhà sát vách
    if (c.fireTruck[i]) continue;
    let best = null, bd = Infinity;
    for (const s of c.services) { if (s.type !== 'fire' || s.cell < 0 || (s.out || 0) >= svcVal(s, 'trucks')) continue; const dd = dist(s.cell, i); if (dd < bd) { bd = dd; best = s; } }
    const from = best && svcPos(c, best);
    if (from && trip(c, 'fire', from, i, { t: 'fire', svc: best.uid, cell: i }, true)) { best.out = (best.out || 0) + 1; c.fireTruck[i] = 1; }
  }
  if (c.pp.count >= 400 && pick >= 0 && !c.fire[pick] && rng() < built * 0.00006 * (c.inc.weather === 'dry' || c.inc.weather === 'heat' ? 2 : 1) * (c.pOk[pick] === 2 ? 2 : 1)) { c.fire[pick] = 7; c.events.push({ type: 'fireStart', x: pick % N, y: (pick / N) | 0, cause: c.pOk[pick] === 2 ? 'chập điện do quá tải' : c.inc.weather === 'dry' ? 'nắng nóng khô hạn' : 'sự cố điện' }); c.dirty.fx = true; }
}

// ───────────────────────── mỗi ngày ─────────────────────────

function seatAt(c, level, home) {
  for (const s of c.services) {
    const d = SERVICES[s.type];
    if (d.eduLevel !== level || (s.used || 0) >= svcVal(s, 'students')) continue;
    const cx = s.x + d.size / 2, cy = s.y + d.size / 2;
    if (Math.hypot((home % N) + 0.5 - cx, ((home / N) | 0) + 0.5 - cy) <= svcVal(s, 'radius')) { s.used = (s.used || 0) + 1; return true; }
  }
  return false;
}

function peopleDay(c) {
  const pp = c.pp, rng = c.rng, ps = c.pstats, day = c.econ.day;
  for (const s of c.services) { s.used = 0; s.processed = 0; s.burned = 0; }
  const vac = c.vac || { senior: [], student: [], home: [] };
  const take = (list) => { while (list.length) { const k = list.length - 1, h = list[k]; if (c.level[h] && c.resCount[h] < resCap(c.zone[h], c.level[h])) return h; list.pop(); } return -1; };
  const moveTo = (id, h) => { const old = pp.home[id]; if (old >= 0 && c.resCount[old] > 0) c.resCount[old]--; pp.home[id] = h; if (h >= 0) c.resCount[h]++; if (pp.state[id] === ST.HOME) pp.loc[id] = h; };
  const count = { kids: 0, adults: 0, seniors: 0, workers: 0, employed: 0, homeless: 0, sick: 0, students: 0 }, edu = [0, 0, 0, 0];
  let hs = 0, cs = 0, cn = 0;
  const pumpDirty = c.dirtyWater ? 0.03 : 0;
  for (let id = 0; id < pp.n; id++) {
    if (!pp.alive[id]) continue;
    const age = ++pp.age[id], home = pp.home[id], ya = Math.floor(age); // tuổi lẻ (dân nhập cư, sinh viên): xét theo năm tròn vừa qua
    // học hành
    if (ya === 12) { if (pp.study[id] >= 4) pp.edu[id] = 1; pp.study[id] = 0; }
    if (ya === 18) { if (pp.edu[id] === 1 && pp.study[id] >= 4) pp.edu[id] = 2; pp.study[id] = 0; }
    if (ya === 22 && pp.enrolled[id]) { if (pp.study[id] >= 3) pp.edu[id] = 3; pp.study[id] = 0; }
    const stage = age >= 6 && age < 12 ? 1 : age >= 12 && age < 18 && pp.edu[id] >= 1 ? 2 : age >= 18 && age < 22 && pp.edu[id] === 2 && pp.work[id] < 0 ? 3 : 0;
    pp.enrolled[id] = stage && home >= 0 && seatAt(c, stage, home) ? 1 : 0;
    if (pp.enrolled[id]) { if (pp.study[id] < 200) pp.study[id]++; count.students++; }
    if (age >= 65 && pp.work[id] >= 0) leaveJob(c, id);
    // chuyển nhà: người già vào nhà dưỡng lão, sinh viên vào ký túc xá, ra trường thì rời ký túc xá
    const who = home >= 0 ? whoOf(c, home) : undefined;
    if (!who && home >= 0 && age >= 68 && vac.senior.length && rng() < 0.08) { const h = take(vac.senior); if (h >= 0) moveTo(id, h); }
    else if (!who && home >= 0 && stage === 3 && pp.enrolled[id] && vac.student.length && rng() < 0.15) { const h = take(vac.student); if (h >= 0) moveTo(id, h); }
    else if (who && !fits(pp, id, who)) moveTo(id, take(vac.home));
    // sinh, bệnh, mất
    const hm = pp.home[id], care = hm >= 0 ? c.cover.care[hm] : 0, oldHome = hm >= 0 && whoOf(c, hm) === 'senior';
    if (age >= 20 && age <= 40 && hm >= 0 && !whoOf(c, hm) && c.resCount[hm] < resCap(c.zone[hm], c.level[hm]) + 2 && rng() < 0.05 * clamp(pp.happy[id] / 50, 0.4, 1.3)) { addCitizen(c, 0, 0, hm, 0, 'born'); c.econ.born++; day.born++; }
    if (!pp.sick[id] && hm >= 0 && rng() < 0.004 + c.air[hm] * 0.035 + c.ground[hm] * 0.02 + 0.004 * (aqiSick(c) - 1) + pumpDirty + (c.garbage[hm] > garbageLimit(c.zone[hm], c.level[hm]) ? 0.012 : 0) + (age > 65 ? (oldHome ? 0.006 : 0.01) * (c.inc.weather === 'heat' ? 2 : 1) : 0)) pp.sick[id] = 1; // nắng nóng: người già dễ ốm gấp đôi
    if (pp.sick[id] > 48) { if (rng() < 0.25 * (1 - 0.7 * care)) { die(c, id); continue; } pp.sick[id] = 0; pp.amb[id] = 0; } // bệnh viện cứu được phần lớn ca nặng
    if (age > 70 && rng() < (age - 70) * 0.025 * (1 - 0.35 * care) * (oldHome ? 0.8 : 1)) { die(c, id); continue; }
    // tiền nhà, hài lòng, bỏ đi
    const adult = age >= 18 && age < 65;
    if (pp.home[id] >= 0 && age >= 18) { const rent = rentAt(c, pp.home[id]) * (whoOf(c, pp.home[id]) === 'student' ? 0.4 : 1); pp.money[id] -= rent; c.biz.money[pp.home[id]] += rent; inner(c, 'rent', rent); } // tiền nhà về chủ nhà (ví của toà nhà)
    { const m0 = pp.money[id]; pp.money[id] = clamp(m0, -200 * MK, 3000 * MK); world(c, 'clamp', pp.money[id] - m0); }
    let hpy = pp.home[id] >= 0 ? c.fn.cellHappy(c, pp.home[id]).happy : 15;
    if (adult && pp.work[id] < 0 && !pp.enrolled[id]) { hpy -= 14; if (pp.idle[id] < 250) pp.idle[id]++; }
    if (pp.commute[id] > 5) hpy -= Math.min(20, (pp.commute[id] - 5) * 4);
    if (pp.sick[id]) hpy -= 12;
    if (pp.money[id] > 120 * MK) hpy += 4; else if (pp.money[id] < -40 * MK) hpy -= 10;
    hpy = clamp(hpy, 0, 100); pp.happy[id] = hpy;
    if (pp.home[id] < 0) { count.homeless++; if (pp.idle[id] < 250) pp.idle[id]++; }
    if ((pp.home[id] < 0 && pp.idle[id] > 3) || (age >= 18 && ((hpy < 22 && rng() < 0.12) || (pp.money[id] < -120 * MK && rng() < 0.2) || (adult && pp.work[id] < 0 && pp.idle[id] > 6 && rng() < 0.15)))) {
      removeCitizen(c, id); c.econ.movedOut++; day.movedOut++; continue;
    }
    if (age < 18) count.kids++; else if (age < 65) { count.adults++; if (!pp.enrolled[id]) { count.workers++; if (pp.work[id] >= 0) count.employed++; } } else count.seniors++;
    if (pp.sick[id]) count.sick++;
    if (age >= 18) edu[pp.edu[id]]++;
    hs += hpy;
    if (pp.work[id] >= 0 && pp.commute[id]) { cs += pp.commute[id]; cn++; }
  }
  Object.assign(ps, count, { pop: pp.count, edu, unemployed: count.workers - count.employed, happy: pp.count ? hs / pp.count : 55, commute: cn ? cs / cn : 0 });
  crimeDay(c);
  researchDay(c);
  c.carSample = Math.min(1, 520 / Math.max(1, count.employed)); // thành phố lớn: chỉ vẽ một phần chuyến đi, phần còn lại tính thời gian
  // sổ sách theo ngày
  c.econ.last = { ...day, riders: c.transit.riders, mode: { ...ps.mode } };
  for (const k of Object.keys(day)) day[k] = 0;
  ps.mode = { car: 0, cars: 0, moto: 0, bus: 0, tram: 0, metro: 0, ferry: 0, walk: 0 };
  c.transit.ridersDay = c.transit.riders; c.transit.riders = 0;
  for (const l of c.transit.lines) { l.ridersDay = l.riders; l.riders = 0; }
  ferryDay(c);
}

/**
 * Tội phạm theo từng ô: thất nghiệp, giá đất thấp làm tăng; công an làm giảm, mạnh gấp đôi khi trại giam còn chỗ.
 * Người bị bắt vào trại giam, mỗi ngày được thả bớt một phần.
 */
function crimeDay(c) {
  const ps = c.pstats;
  let cells = 0;
  for (const s of c.services) cells += SERVICES[s.type].cells || 0;
  c.prisoners *= 0.93;
  if (ps.pop < 400) { c.crime.fill(0); ps.crime = 0; return; }
  const unemp = ps.workers ? ps.unemployed / ps.workers : 0, police = c.prisoners < cells - 1 ? 0.7 : 0.35;
  let arrests = 0, sum = 0, n = 0;
  for (let i = 0; i < N * N; i++) {
    const L = c.level[i];
    if (!L) { c.crime[i] = 0; continue; }
    const people = resCap(c.zone[i], L) + jobCap(c.zone[i], L);
    const target = clamp(0.08 + unemp * 1.1 + (40 - c.landValue[i]) / 140 - c.cover.police[i] * police - distFx(c, i, 'security') * 0.07, 0, 1); // dân phòng của quận
    c.crime[i] += (target - c.crime[i]) * 0.3;
    arrests += c.crime[i] * c.cover.police[i] * people * 0.02;
    sum += c.crime[i]; n++;
  }
  c.prisoners = Math.min(cells, c.prisoners + arrests);
  ps.crime = n ? sum / n : 0;
}

/** Viện nghiên cứu: người học đại học làm ra điểm phát triển; viện thứ hai trở đi kém hiệu quả dần. */
function researchDay(c) {
  const labs = c.services.filter((s) => SERVICES[s.type].research && s.cell >= 0).length;
  if (!labs) return;
  let rate = 0;
  for (let k = 0; k < labs; k++) rate += Math.pow(0.7, k);
  c.research += rate * clamp(c.pstats.edu[3] / 80, 0.15, 1.2) * 22 * (c.budget ? c.budget.edu / 100 : 1);
  while (c.research >= 100) { c.research -= 100; c.points++; c.events.push({ type: 'research' }); }
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
  const pp = c.pp, n = pp.count, age = new Uint8Array(n), edu = new Uint8Array(n), home = new Uint16Array(n), work = new Uint16Array(n), money = new Int16Array(n), happy = new Uint8Array(n);
  let k = 0;
  for (let id = 0; id < pp.n; id++) {
    if (!pp.alive[id]) continue;
    age[k] = clamp(pp.age[id], 0, 255); edu[k] = pp.edu[id] | (pp.study[id] << 2); home[k] = pp.home[id] < 0 ? 0xffff : pp.home[id]; work[k] = pp.work[id] < 0 ? 0xffff : pp.work[id]; money[k] = clamp(Math.round(pp.money[id] / MK), -32000, 32000); happy[k] = pp.happy[id];
    k++;
  }
  return { age, edu, home: new Uint8Array(home.buffer), work: new Uint8Array(work.buffer), money: new Uint8Array(money.buffer), happy };
}

export function unpackPeople(c, o) {
  const n = o.age.length, home = new Uint16Array(o.home.buffer.slice(0, n * 2)), work = new Uint16Array(o.work.buffer.slice(0, n * 2)), money = new Int16Array(o.money.buffer.slice(0, n * 2));
  const h24 = c.hour % 24, wd = c.day % 7 < 5;
  for (let k = 0; k < n; k++) {
    let h = home[k] === 0xffff ? -1 : home[k];
    if (h >= 0 && (!c.level[h] || c.resCount[h] >= resCap(c.zone[h], c.level[h]) + 2)) h = -1; // +2: trẻ sinh ra ở nhà đã kín chỗ
    const id = addCitizen(c, o.age[k], o.edu[k] & 3, h, money[k], 'load'), pp = c.pp;
    pp.study[id] = o.edu[k] >> 2;
    if (o.happy && o.happy.length === n) pp.happy[id] = o.happy[k]; // bản lưu cũ không có: 55
    const w = work[k] === 0xffff ? -1 : work[k];
    if (w >= 0 && c.level[w] && c.staff[w] < jobCap(c.zone[w], c.level[w])) {
      pp.work[id] = w; c.staff[w]++;
      const s = 4 + (id % 7); // nạp giữa ca làm: người đang trong ca thì ở chỗ làm luôn, khỏi mất một ngày lương, thuế
      if (wd && h >= 0 && h24 > s && h24 < s + 9) { pp.state[id] = ST.WORK; pp.loc[id] = w; c.present[w]++; pp.until[id] = c.hour + s + 9 - h24; }
    }
  }
  quickStats(c);
}


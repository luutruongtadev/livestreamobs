// Phố Mới — khách quốc tế: chuyến bay và tàu nước ngoài lâu lâu ghé thành phố, chở du khách và người nhập cư.
// Người chơi tác động bằng chính sách thị thực, mức quảng bá du lịch quốc tế và phí hạ cánh / cập cảng mỗi khách.
// Sân bay nào cũng có chuyến bay nội địa: chở khách trong nước tới và người dân bay đi chơi, công tác (thu phí mỗi khách).
// Chuyến bay quốc tế chỉ đáp ở sân bay đã gắn module 🌏 Nhà ga quốc tế; dân cũng bay ra nước ngoài từ đó.
import { SERVICES, HOUR_SEC, clamp, resCap } from './base.js';
import { tourismScore } from './econ.js';
import { seaGates } from './ships.js';
import { festMul } from './seasons.js';
import { councilMod } from './council.js';

export const VISA = {
  strict: { name: 'Hạn chế', icon: '🛂', tour: 0.55, immig: 0.15, freq: 0.6, desc: 'Xét duyệt chặt: ít chuyến, ít khách, gần như không ai nhập cư' },
  normal: { name: 'Bình thường', icon: '🪪', tour: 1, immig: 1, freq: 1, desc: 'Thị thực thông thường' },
  open: { name: 'Mở cửa', icon: '🌏', tour: 1.35, immig: 1.9, freq: 1.3, desc: 'Miễn thị thực: nhiều chuyến, nhiều khách và người nhập cư; cần sẵn nhà, việc làm, không thì thất nghiệp tăng, nhiều người phải quay về' },
};
/** Mức quảng bá du lịch quốc tế: chi phí mỗi ngày và hệ số khách. */
export const PROMO = [
  { name: 'Không', cost: 0, k: 1 },
  { name: 'Vừa', cost: 400, k: 1.25 },
  { name: 'Mạnh', cost: 1000, k: 1.55 },
  { name: 'Toàn cầu', cost: 2200, k: 1.9 },
];
export const FLY_H = 4; // máy bay hiện trên trời 4 giờ game (20 giây ở tốc độ 1) trước khi đáp
export const SAIL_H = 9, DOCK_H = 5; // tàu nước ngoài: chạy vào, neo ở bến, rồi chạy ra
const CODES = ['VN', 'QH', 'VJ', 'SQ', 'TG', 'KE', 'JL', 'CX', 'QR', 'EK', 'AF', 'LH'];
const CITIES = ['Tokyo', 'Seoul', 'Singapore', 'Bangkok', 'Sydney', 'Paris', 'Frankfurt', 'Doha', 'Hồng Kông', 'Los Angeles', 'Thượng Hải', 'Kuala Lumpur', 'Dubai', 'London'];
const DOM_CODES = ['VN', 'VJ', 'QH', 'BL', 'VU'];
const DOM_CITIES = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Huế', 'Nha Trang', 'Phú Quốc', 'Cần Thơ', 'Hải Phòng', 'Đà Lạt', 'Quy Nhơn', 'Vinh', 'Côn Đảo'];
const SHIPS = ['Ocean Pearl', 'Star Lotus', 'Blue Horizon', 'Coral Queen', 'Sea Breeze', 'Golden Dragon', 'Silver Wave', 'Jade Empress'];

const blankDay = () => ({ flights: 0, ships: 0, tourists: 0, immig: 0, turned: 0, fees: 0, dom: 0, domTourists: 0, out: 0, abroad: 0 });
/** Sân bay quốc tế: sân bay đã gắn module Nhà ga quốc tế. */
export const isIntlAirport = (s) => s.type === 'airportIntl' || (s.type === 'airport' && !!(s.mods && s.mods.includes('intl')));
/** Sân bay (nội địa hoặc quốc tế). */
export const isAirport = (s) => s.type === 'airport' || s.type === 'airportIntl';
export const simTime = (c) => c.hour * HOUR_SEC + (c.clock || 0);

export function initIntl(c, o = {}) {
  c.intl = {
    visa: VISA[o.visa] ? o.visa : 'normal',
    promo: clamp(o.promo | 0, 0, PROMO.length - 1),
    fee: clamp(Number.isFinite(+o.fee) ? +o.fee : 5, 0, 30),
    sched: [], nextId: 1, day: blankDay(), last: o.last && typeof o.last === 'object' ? o.last : null,
  };
}
export const packIntl = (c) => ({ visa: c.intl.visa, promo: c.intl.promo, fee: c.intl.fee, last: c.intl.last });

/** Chi phí quảng bá mỗi ngày (cộng vào khoản chi du lịch). */
export const promoCost = (c) => (c.intl ? Math.round(PROMO[c.intl.promo].cost * (c.tech && c.tech.has('landdeal') ? 0.7 : 1)) : 0);

const ready = (s) => !(s.build > 0);
/** Ước lượng: số chuyến bay / tàu mỗi ngày, khách mỗi chuyến, và các yếu tố ảnh hưởng (cho bảng ngân sách). */
export function intlOutlook(c) {
  const it = c.intl, v = VISA[it.visa], P = PROMO[it.promo];
  const airports = c.services.filter((s) => isIntlAirport(s) && ready(s)).length, domAirports = c.services.filter((s) => isAirport(s) && ready(s)).length;
  const pop = c.pstats ? c.pstats.pop : 0;
  const sea = c.services.filter((s) => (s.type === 'port' || (s.type === 'ferry' && c.ferryState && c.ferryState[s.uid] === 'sea')) && ready(s)).length;
  const sc = c.tour && c.tour.score ? c.tour.score : tourismScore(c);
  const lure = clamp(0.35 + sc.attract / 30, 0.35, 2.2); // điểm tham quan càng nhiều càng nhiều hãng mở đường bay
  const feeK = clamp(1 - it.fee / 40, 0.25, 1); // phí cao thì hãng bay, hãng tàu ngại ghé
  const pull = c.pull || 0;
  const mood = clamp(0.6 + ((c.pstats ? c.pstats.happy : 55) - 45) / 60, 0.4, 1.4);
  const fest = (c.fest ? festMul(c, 'intl') : 1) * councilMod(c, 'intl'), storm = c.inc && c.inc.weather === 'storm';
  return {
    fest, storm,
    airports, domAirports, sea, lure, feeK, mood,
    dom: storm ? 0 : domAirports * Math.min(9, 2 + pop / 5000) * feeK, // chuyến nội địa mỗi ngày
    domTourPer: Math.round(28 * lure * mood),
    flyPer: Math.round(clamp(pop * 0.0025, 4, 160) * mood), // dân bay đi mỗi chuyến
    flights: storm ? 0 : airports * 1.6 * v.freq * P.k * feeK * Math.sqrt(lure) * fest, // bão: huỷ chuyến
    ships: storm ? 0 : Math.min(sea, 3) * 0.3 * v.freq * P.k * feeK * Math.sqrt(lure) * fest,
    tourPer: Math.round(70 * v.tour * P.k * lure * mood),
    immigPer: pull > 0.05 ? Math.round(14 * v.immig * (0.5 + pull * 1.5)) : 0, // thành phố không hút dân thì không ai tới định cư
  };
}

/**
 * Mỗi giờ: chuyến nào tới giờ thì đáp / cập bến (du khách ở khách sạn, tiêu tiền; người nhập cư dọn vào nhà trống; thu phí),
 * rồi tung xúc xắc xem có chuyến mới không. spend(c, n, perHead) và addCitizen như people.js. Trả về phí thu được trong giờ.
 */
export function intlHour(c, { spend, addCitizen }) {
  const it = c.intl, now = simTime(c), rng = c.rng || Math.random, h = c.hour % 24, o = intlOutlook(c);
  let fees = 0;
  for (const e of it.sched) {
    if (e.landed || now < e.t1 - 1e-6) continue;
    e.landed = true;
    if (!c.services.some((s) => s.uid === e.uid)) continue; // sân bay / cảng đã bị phá: chuyến bay chuyển hướng
    // du khách: ở khách sạn nếu còn phòng, ai cũng đi chơi tiêu tiền
    const t = c.tour, beds = (t.score && t.score.beds) || 0, stay = Math.min(Math.round(e.tourists * 0.6), Math.max(0, beds - t.guests));
    t.guests += stay; t.day.visitors += e.tourists; t.day.stayed += stay;
    spend(c, e.tourists, 10);
    // người nhập cư: dọn vào nhà trống; hết nhà thì quay về
    const homes = (c.vac && c.vac.home) || [];
    let placed = 0;
    for (let k = 0; k < e.immig && homes.length; k++) {
      const j = (rng() * homes.length) | 0, cell = homes[j], r = rng();
      addCitizen(c, 22 + rng() * 20, r < 0.3 ? 3 : r < 0.65 ? 2 : r < 0.9 ? 1 : 0, cell, 80 + rng() * 140, 'abroad'); // nhập cư quốc tế
      placed++;
      if (c.resCount[cell] >= resCap(c.zone[cell], c.level[cell])) homes.splice(j, 1);
    }
    // máy bay quay đầu chở dân bay đi (nội địa: đi chơi, công tác; quốc tế: ra nước ngoài)
    const out = e.kind === 'plane' ? Math.round(o.flyPer * (e.dom ? 1 : 0.7) * (0.6 + rng() * 0.8)) : 0;
    const fee = Math.round(it.fee * (e.tourists + placed + out));
    fees += fee;
    Object.assign(e, { placed, turned: e.immig - placed, fee, out });
    it.day.fees += fee; it.day.out += out;
    if (e.dom) { it.day.dom++; it.day.domTourists += e.tourists; continue; } // chuyến nội địa: không báo từng chuyến
    if (e.kind === 'plane') it.day.abroad += out;
    it.day.tourists += e.tourists; it.day.immig += placed; it.day.turned += e.immig - placed;
    if (e.kind === 'plane') it.day.flights++; else it.day.ships++;
    if (c.events) c.events.push({ type: 'arrival', kind: e.kind, text: `${e.kind === 'plane' ? `✈️ Chuyến bay ${e.code} từ ${e.from} đã hạ cánh` : `🚢 Tàu ${e.code} từ ${e.from} đã cập cảng`}: ${e.tourists} du khách${placed ? `, ${placed} người tới định cư` : ''}${e.immig - placed > 0 ? ` (${e.immig - placed} người hết nhà phải quay về)` : ''}` });
  }
  // dọn chuyến đã xong (máy bay: 1 giờ sau khi đáp; tàu: sau khi neo và chạy ra)
  it.sched = it.sched.filter((e) => now < e.t1 + (e.kind === 'plane' ? 1 : DOCK_H + SAIL_H) * HOUR_SEC);
  // chuyến mới
  const busy = (kind, dom = false) => it.sched.filter((e) => e.kind === kind && !e.landed && !!e.dom === dom).length;
  const pick = (a) => a[(rng() * a.length) | 0];
  if (o.airports && h >= 6 && h <= 22 && busy('plane') < 3 && rng() < o.flights / 17) {
    const ap = pick(c.services.filter((s) => isIntlAirport(s) && ready(s)));
    const tourists = Math.max(10, Math.round(o.tourPer * (0.7 + rng() * 0.6))), immig = Math.round(o.immigPer * (0.6 + rng() * 0.8));
    it.sched.push({ id: it.nextId++, kind: 'plane', uid: ap.uid, t0: now, t1: now + FLY_H * HOUR_SEC, tourists, immig, code: `${pick(CODES)}${100 + ((rng() * 900) | 0)}`, from: pick(CITIES), ang: (rng() - 0.5) * 1.2 });
  }
  if (o.domAirports && h >= 5 && h <= 23 && busy('plane', true) < 3 && rng() < o.dom / 19) {
    const ap = pick(c.services.filter((s) => isAirport(s) && ready(s)));
    const tourists = Math.max(5, Math.round(o.domTourPer * (0.6 + rng() * 0.8)));
    it.sched.push({ id: it.nextId++, kind: 'plane', dom: true, uid: ap.uid, t0: now, t1: now + FLY_H * HOUR_SEC, tourists, immig: 0, code: `${pick(DOM_CODES)}${100 + ((rng() * 900) | 0)}`, from: pick(DOM_CITIES), ang: (rng() - 0.5) * 1.2 });
  }
  if (o.sea && busy('ship') < 1 && rng() < o.ships / 24) {
    const gates = seaGates(c).filter((g) => ready(g.s));
    if (gates.length) {
      const g = pick(gates);
      const tourists = Math.round(o.tourPer * (2 + rng())), immig = Math.round(o.immigPer * (1 + rng()));
      it.sched.push({ id: it.nextId++, kind: 'ship', uid: g.s.uid, path: g.path, t0: now, t1: now + SAIL_H * HOUR_SEC, tourists, immig, code: pick(SHIPS), from: pick(CITIES) });
    }
  }
  return fees;
}

/** Dân được bay đi chơi, công tác thì vui hơn (tính theo số người bay hôm qua, tối đa +2,5). */
export function flyHappy(c) {
  const l = c.intl && c.intl.last, pop = c.pstats ? c.pstats.pop : 0;
  if (!l || !l.out || pop < 50) return 0;
  return Math.min(2.5, ((l.out + (l.abroad || 0) * 0.5) / pop) * 120);
}

export function intlDay(c) {
  const it = c.intl;
  it.last = { ...it.day, promo: promoCost(c) };
  it.day = blankDay();
}

/** Tên công trình đón khách quốc tế (cho bảng thông tin). */
export const intlGate = (type) => type === 'airport' || type === 'airportIntl' || type === 'port' || type === 'ferry' ? SERVICES[type].name : null;

// Phố Mới — vỉa hè, hẻm, xe máy và giao thông công cộng: chính sách có đánh đổi.
//   Vỉa hè: để tự do (sôi động, du khách thích, xe lấn đường) / cấp phép theo giờ / dẹp (thông thoáng nhưng mất sinh kế, phố buồn).
//   Hẻm: cho nhà ống mọc sâu vào hàng thứ ba sau mặt đường (thêm chỗ ở, nhưng chật chội).
//   Xe: ai giàu, học cao thì mua ô tô; chính sách cấm xe máy nội đô, phí ô tô vào trung tâm, làn riêng xe buýt.
//   Bụi mịn AQI theo lượng xe máy, ô tô, nhà máy: cao thì dân ốm nhiều, kém vui, du khách chê.
import { MK, N, ZDEF, ROADS, clamp, hash2, cellX, cellZ } from './base.js';
import { cityGet } from './ledger.js';

export const SIDEWALK = {
  free: { name: 'Để tự do', icon: '🍜', comm: 0.04, tour: 1.08, speed: 0.9, happy: 1, cost: 0, desc: 'Quán xá, hàng rong bày kín vỉa hè: phố sôi động, du khách mê ẩm thực đường phố, thuế thương mại tăng; nhưng người đi bộ phải xuống lòng đường, xe chạy chậm' },
  license: { name: 'Cấp phép theo giờ', icon: '🪧', comm: 0.02, tour: 1.04, speed: 0.97, happy: 0, cost: 300, desc: 'Kẻ vạch, chỉ bán sáng sớm và buổi tối, thu phí: cân bằng hai bên, tốn tiền quản lý' },
  clear: { name: 'Dẹp vỉa hè', icon: '🚧', comm: -0.03, tour: 0.95, speed: 1, happy: -2, cost: 500, desc: 'Lực lượng trật tự ra quân: đường thông, phố gọn; nhưng hàng trăm hộ mất sinh kế (dân kém vui 20 ngày đầu), phố vắng hẳn' },
};
export const STREET_POLICY = {
  motoBan: { name: 'Cấm xe máy vào nội đô', icon: '🛵', cost: 400, desc: 'Xe máy không vào vùng trung tâm: người phải đi xe buýt, metro hoặc đi bộ; nơi chưa có tuyến thì gọi taxi (thêm ô tô) và bực bội. Bụi mịn giảm mạnh' },
  busLane: { name: 'Làn riêng xe buýt', icon: '🚌', cost: 200, desc: 'Trên đại lộ, xe buýt chạy nhanh hơn 30% nên nhiều người chuyển sang đi buýt; ô tô, xe máy trên đại lộ chậm hơn 12%' },
  alley: { name: 'Quy hoạch hẻm', icon: '🏘️', cost: 0, desc: 'Cho nhà ống mọc sâu vào hẻm, tới hàng thứ ba sau mặt đường: thêm nhiều chỗ ở, nhưng hẻm chật chội (dân trong hẻm kém vui), chỉ nhà ở được vào hẻm' },
};
export const FEE_MAX = 20;

const isCenterZone = (z) => z.cat === 'c' || z.cat === 'o' || z.biz === 'office';

/** Vùng trung tâm (nội đô): tâm khối các ô thương mại, văn phòng; bán kính theo độ lớn. Tính lại mỗi ngày. */
export function centerOf(c) {
  let sx = 0, sy = 0, w = 0, n = 0;
  for (let i = 0; i < N * N; i++) {
    if (!c.level[i] || !isCenterZone(ZDEF[c.zone[i]])) continue;
    const l = c.level[i]; sx += (i % N) * l; sy += ((i / N) | 0) * l; w += l; n++;
  }
  if (n < 6) return null;
  return { x: sx / w, y: sy / w, r: clamp(5 + Math.sqrt(n) * 0.9, 6, N * 0.18) };
}
export const inCenter = (c, cell) => { const k = c.street && c.street.center; if (!k || cell < 0) return false; return Math.hypot((cell % N) - k.x, ((cell / N) | 0) - k.y) <= k.r; };

/** Người id đi phương tiện gì khi đi xe riêng: 'car' (ô tô) hay 'moto' (xe máy). Giàu, học cao thì ô tô nhiều hơn. */
export function vehicleOf(c, id) {
  const pp = c.pp, base = c.style === 'vn' ? 0.06 : 0.32;
  const p = clamp(base + pp.edu[id] * 0.07 + clamp((pp.money[id] - 80 * MK) / (900 * MK), 0, 0.25), 0.03, 0.75);
  return hash2(id, pp.gen[id], 913) < p ? 'car' : 'moto';
}

/** Hệ số tốc độ xe trên đoạn đường theo chính sách (gán vào e.spMul, e.busMul). Gọi khi đổi chính sách hoặc dựng lại đường. */
export function applyStreet(c) {
  const st = c.street, sw = SIDEWALK[st ? st.sidewalk : 'free'] || SIDEWALK.free;
  for (const e of c.edges.values()) {
    const d = ROADS[e.type], street = !d.elevated && e.type !== 'highway';
    let mul = street ? sw.speed : 1, bus = mul;
    if (st && st.busLane && e.type === 'large') { bus *= 1.3; mul *= 0.88; }
    e.spMul = mul; e.busMul = bus;
  }
}

/**
 * Chọn cách đi khi người dân định đi xe riêng: trả về { kind: 'car' | 'moto' | 'transit' | 'walk', taxi?, fee? }.
 * ride = tuyến công cộng có thể đi (hoặc null), d = khoảng cách, into = điểm đi / đến trong nội đô.
 */
export function chooseVehicle(c, id, ride, d, into) {
  const st = c.street, kind = vehicleOf(c, id);
  if (!st || !into) return { kind };
  if (kind === 'moto' && st.motoBan) {
    if (ride) return { kind: 'transit' };
    if (d < 260) return { kind: 'walk' };
    return { kind: 'car', taxi: true }; // gọi taxi
  }
  if (kind === 'car' && st.centerFee > 0) {
    if (ride && st.centerFee >= 6) return { kind: 'transit' }; // phí cao: người có xe chuyển sang đi công cộng nếu có tuyến
    return { kind: 'car', fee: st.centerFee };
  }
  return { kind };
}

/** Ghi nhận một chuyến đi xe riêng (đếm để tính bụi mịn, phí, người bực vì cấm xe). */
export function countTrip(c, choice) {
  const day = c.street && c.street.day;
  if (!day) return;
  if (choice.kind === 'moto') day.moto++;
  else if (choice.kind === 'car') { day.car++; if (choice.taxi) day.taxi++; if (choice.fee) { day.fee += choice.fee; cityGet(c, 'fare', choice.fee); } }
  else if (choice.kind === 'transit' || choice.kind === 'walk') day.shift++;
}

/** Chỉ số bụi mịn AQI (0–500) từ số chuyến xe máy, ô tô hôm qua trên tổng chiều dài đường, và ô nhiễm nhà máy. */
export function computeAqi(c) {
  const d = c.street.last || c.street.day, road = Math.max(400, (c.stats && c.stats.roadLen) || 0);
  let air = 0, n = 0;
  for (let i = 0; i < N * N; i += 3) if (c.level[i]) { air += c.air[i]; n++; }
  const traffic = ((d.moto || 0) * 0.55 + (d.car || 0) * 1.0) / (road / 100 + 8);
  return Math.round(clamp(18 + traffic * 2.2 + (n ? air / n : 0) * 160, 0, 500));
}
export const aqiLevel = (a) => (a <= 50 ? ['Tốt', '#46c85a'] : a <= 100 ? ['Trung bình', '#f0be32'] : a <= 150 ? ['Kém', '#f0882a'] : a <= 200 ? ['Xấu', '#e0453a'] : ['Rất xấu', '#8b3fae']);
/** Dân kém vui vì bụi mịn (điểm trừ) và hệ số ốm thêm. */
export const aqiHappy = (c) => (c.street ? -Math.max(0, (c.street.aqi - 100) / 25) : 0);
export const aqiSick = (c) => (c.street ? 1 + Math.max(0, (c.street.aqi - 80) / 120) : 1);

/** Hiệu ứng tổng hợp của chính sách lên thành phố (cho recalc, du lịch). */
export function streetBonus(c) {
  const st = c.street;
  if (!st) return { comm: 0, happy: 0, tour: 1, cost: 0 };
  const sw = SIDEWALK[st.sidewalk] || SIDEWALK.free;
  let happy = sw.happy, cost = sw.cost + (st.motoBan ? STREET_POLICY.motoBan.cost : 0) + (st.busLane ? STREET_POLICY.busLane.cost : 0);
  if (st.sidewalk === 'clear' && c.day - st.since > 20) happy = 0; // dân quen dần
  const last = st.last || {};
  if (st.motoBan && last.taxi) happy -= Math.min(4, last.taxi / 60); // không có tuyến công cộng mà bị cấm xe: bực bội
  happy += aqiHappy(c);
  return { comm: sw.comm, happy, tour: sw.tour * (st.aqi > 150 ? 0.9 : 1), cost };
}

/** Mỗi ngày: tính lại vùng trung tâm, chốt số liệu hôm qua, tính bụi mịn. */
export function streetDay(c) {
  const st = c.street;
  st.center = centerOf(c);
  st.last = { ...st.day };
  st.day = { moto: 0, car: 0, taxi: 0, fee: 0, shift: 0 };
  st.aqi = computeAqi(c);
}

export function initStreet(c, o = {}) {
  c.street = {
    sidewalk: SIDEWALK[o.sidewalk] ? o.sidewalk : 'free', since: o.since | 0,
    motoBan: !!o.motoBan, busLane: !!o.busLane, alley: !!o.alley, centerFee: clamp(o.centerFee | 0, 0, FEE_MAX),
    center: null, aqi: Number.isFinite(+o.aqi) ? +o.aqi : 30, day: { moto: 0, car: 0, taxi: 0, fee: 0, shift: 0 }, last: o.last || null,
  };
}
export const packStreet = (c) => { const { center, day, ...rest } = c.street; return rest; };

/** Đổi chính sách vỉa hè. */
export function setSidewalk(c, k) {
  if (!SIDEWALK[k] || c.street.sidewalk === k) return false;
  c.street.sidewalk = k; c.street.since = c.day;
  applyStreet(c);
  c.dirty.roads = true; // vẽ lại quán xá, hàng rong trên vỉa hè
  return true;
}
/** Bật / tắt một chính sách (motoBan, busLane, alley). Hẻm đổi thì phải tính lại ô quy hoạch (gọi roadsChanged ở ngoài). */
export function setPolicy(c, k, on) {
  if (!STREET_POLICY[k]) return false;
  c.street[k] = !!on;
  applyStreet(c);
  return true;
}
export const centerCenter = (c) => (c.street && c.street.center ? { x: cellX(Math.round(c.street.center.y) * N + Math.round(c.street.center.x)), z: cellZ(Math.round(c.street.center.y) * N + Math.round(c.street.center.x)) } : null);

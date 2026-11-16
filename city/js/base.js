// Phố Mới — hằng số, bảng định nghĩa và hàm thuần dùng chung cho mọi module mô phỏng.
export const N = 96; // bản đồ N x N ô
export const T = 10; // cạnh một ô (đơn vị thế giới)
export const HALF = (N * T) / 2;
export const HOUR_SEC = 5; // một giờ trong game dài bao nhiêu giây ở tốc độ 1 (một ngày = 2 phút)
export const RATE = 6; // hệ số quy phí / thuế "mỗi kỳ" cũ sang "mỗi ngày"

export const idx = (x, y) => y * N + x;
export const inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
export const cellOf = (w) => Math.floor((w + HALF) / T);
export const cellCenter = (i) => (i + 0.5) * T - HALF;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const cellX = (i) => cellCenter(i % N);
export const cellZ = (i) => cellCenter((i / N) | 0);

// khu quy hoạch. res / jobs: sức chứa theo cấp 1..5; cat: thanh nhu cầu; biz: loại doanh nghiệp
export const ZONE = { NONE: 0, R: 1, C: 2, I: 3, RH: 4, CH: 5, O: 6, M: 7 };
export const ZDEF = [
  { id: 0, name: 'Chưa quy hoạch', icon: '🧽', color: '#cfd6dc', rgb: [0, 0, 0] },
  { id: 1, name: 'Dân cư thấp tầng', short: 'Nhà ở', icon: '🏠', color: '#46c85a', rgb: [70, 200, 90], cat: 'r', res: [4, 6, 8, 10, 12], unlock: 0, desc: 'Nhà riêng, ít dân, yên tĩnh' },
  { id: 2, name: 'Thương mại nhỏ', short: 'Cửa hàng', icon: '🏬', color: '#468cec', rgb: [70, 140, 235], cat: 'c', jobs: [4, 6, 8, 10, 12], biz: 'shop', unlock: 0, desc: 'Cửa hàng bán lẻ: cần hàng hoá từ nhà máy hoặc nhập khẩu' },
  { id: 3, name: 'Công nghiệp', short: 'Công nghiệp', icon: '🏭', color: '#f0be32', rgb: [240, 190, 50], cat: 'i', jobs: [8, 12, 16, 22, 30], biz: 'ind', unlock: 0, desc: 'Khai thác nguyên liệu và nhà máy chế biến: nhiều việc làm, gây ô nhiễm' },
  { id: 4, name: 'Dân cư cao tầng', short: 'Chung cư', icon: '🏢', color: '#1f8f4e', rgb: [25, 130, 70], cat: 'r', res: [16, 30, 50, 80, 120], unlock: 400, desc: 'Chung cư: rất nhiều dân trên một ô đất' },
  { id: 5, name: 'Thương mại lớn', short: 'TT thương mại', icon: '🏙️', color: '#2a5fc4', rgb: [40, 90, 190], cat: 'c', jobs: [12, 24, 40, 60, 90], biz: 'shop', unlock: 400, desc: 'Trung tâm thương mại: nhiều việc làm, cần nhiều hàng' },
  { id: 6, name: 'Văn phòng', short: 'Văn phòng', icon: '💼', color: '#9a6be0', rgb: [150, 105, 220], cat: 'o', jobs: [14, 28, 46, 70, 100], biz: 'office', unlock: 1000, desc: 'Không ô nhiễm, không cần hàng hoá, nhưng cần lao động có học vấn' },
  { id: 7, name: 'Hỗn hợp', short: 'Hỗn hợp', icon: '🏘️', color: '#2fb7a8', rgb: [45, 180, 165], cat: 'r', res: [8, 14, 24, 36, 50], jobs: [3, 4, 6, 8, 10], biz: 'shop', unlock: 400, desc: 'Cửa hàng tầng trệt, nhà ở phía trên' },
];
export const MAX_LEVEL = 5;
export const resCap = (z, L) => (L && ZDEF[z].res ? ZDEF[z].res[L - 1] : 0);
export const jobCap = (z, L) => (L && ZDEF[z].jobs ? ZDEF[z].jobs[L - 1] : 0);
/** Điện / nước / rác một toà nhà dùng mỗi ngày (đơn vị của mạng). */
export const utilUse = (z, L) => { const u = resCap(z, L) + jobCap(z, L) * (z === 3 ? 1.6 : 1.2); return 1 + Math.ceil(u / 7); };
/** Rác tồn quá mức này (khoảng hơn một ngày rác của toà nhà) thì coi là ngập rác. */
export const garbageLimit = (z, L) => 8 + (resCap(z, L) + jobCap(z, L)) * 0.6;
// học vấn tối thiểu của một chỗ làm theo khu và cấp
const REQ = { 2: [0, 0, 0, 1, 1], 3: [0, 0, 0, 1, 1], 5: [0, 0, 1, 1, 2], 6: [1, 2, 2, 2, 3], 7: [0, 0, 0, 1, 1] };
export const reqEdu = (z, L) => (REQ[z] ? REQ[z][L - 1] : 0);
export const EDU_NAME = ['Chưa đi học', 'Tiểu học', 'Trung học', 'Đại học'];

// loại đường: w = bề rộng cả vỉa hè, cost / upkeep tính theo đơn vị chiều dài
export const ROADS = {
  small: { name: 'Đường nhỏ 2 làn', icon: '🛣️', w: 10, asphalt: 6.4, cost: 4, upkeep: 0.05, speed: 1, lanes: 1, desc: 'Hai làn hai chiều, bám tâm ô' },
  large: { name: 'Đại lộ 4 làn', icon: '🛤️', w: 20, asphalt: 15.6, cost: 11, upkeep: 0.13, speed: 1.35, lanes: 2, desc: 'Bốn làn có dải phân cách, rộng 2 ô, thông xe gấp đôi và chạy nhanh hơn' },
  oneway: { name: 'Đường một chiều', icon: '➡️', w: 10, asphalt: 6.4, cost: 4.5, upkeep: 0.05, speed: 1.15, lanes: 2, desc: 'Hai làn cùng chiều theo hướng vẽ; nâng cấp lần nữa để đảo chiều' },
};
export const BRIDGE_MULT = 4.5;
export const LINES = {
  power: { name: 'Dây điện', icon: '🗼', cost: 1.2, upkeep: 0.012, desc: 'Nối nhà máy điện ở xa vào đường hoặc vào công trình khác' },
  pipe: { name: 'Ống nước', icon: '🚰', cost: 1, upkeep: 0.012, desc: 'Nối trạm nước, cống xả ở xa vào đường (ống ngầm chở cả nước sạch và nước thải)' },
};

// công trình đặt tay. size: cạnh ô vuông; unlock: mốc dân số cần đạt; upkeep: phí mỗi kỳ (nhân RATE ra mỗi ngày)
export const SERVICES = {
  wind: { name: 'Tua-bin gió', icon: '🌬️', group: 'power', cost: 5000, upkeep: 70, size: 1, power: 60, unlock: 0, desc: 'Điện sạch, công suất nhỏ' },
  solar: { name: 'Trại điện mặt trời', icon: '🔆', group: 'power', cost: 12000, upkeep: 150, size: 2, power: 170, unlock: 400, desc: 'Điện sạch, công suất vừa' },
  coal: { name: 'Nhà máy nhiệt điện', icon: '🏭', group: 'power', cost: 22000, upkeep: 520, size: 3, power: 520, air: 10, ground: 4, unlock: 1000, desc: 'Điện nhiều nhưng khói bay rất xa' },
  tower: { name: 'Tháp nước', icon: '🗼', group: 'water', cost: 3000, upkeep: 50, size: 1, water: 250, unlock: 0, desc: 'Cấp nước, đặt ở đâu cũng được' },
  pump: { name: 'Trạm bơm nước', icon: '💧', group: 'water', cost: 7000, upkeep: 140, size: 2, water: 1000, needWater: true, unlock: 0, desc: 'Cấp nhiều nước, phải đặt sát bờ; đừng đặt gần cống xả kẻo dân uống nước bẩn' },
  outlet: { name: 'Cống xả thải', icon: '🕳️', group: 'water', cost: 2500, upkeep: 60, size: 1, sewage: 400, needWater: true, waterPol: 9, unlock: 0, desc: 'Xả nước thải ra sông / biển, làm bẩn vùng nước quanh cống' },
  treat: { name: 'Nhà máy xử lý nước thải', icon: '♻️', group: 'water', cost: 16000, upkeep: 320, size: 2, sewage: 1800, needWater: true, waterPol: 2.5, unlock: 1000, desc: 'Xử lý nhiều nước thải, gần như không ô nhiễm' },
  landfill: { name: 'Bãi rác', icon: '🗑️', group: 'trash', cost: 6000, upkeep: 130, size: 3, trash: 800, trucks: 3, cover: 'trash', radius: 26, ground: 7, air: 3, road: true, unlock: 120, desc: 'Xe rác chạy tới từng con đường trong bán kính để thu gom; bãi làm bẩn đất quanh nó' },
  incinerator: { name: 'Lò đốt rác', icon: '🔥', group: 'trash', cost: 24000, upkeep: 420, size: 2, trash: 1800, trucks: 4, power: 60, cover: 'trash', radius: 38, air: 5, road: true, unlock: 1000, desc: 'Nhiều xe rác hơn, vùng thu gom rộng, phát thêm chút điện' },
  park: { name: 'Công viên nhỏ', icon: '🌳', group: 'park', cost: 800, upkeep: 12, size: 1, cover: 'park', radius: 5, green: 1, unlock: 0, desc: 'Tăng giá trị đất, lọc bớt bụi và tiếng ồn quanh nó' },
  plaza: { name: 'Quảng trường', icon: '⛲', group: 'park', cost: 3500, upkeep: 45, size: 2, cover: 'park', radius: 9, green: 1, unlock: 400, desc: 'Tăng giá trị đất trên vùng rộng' },
  stadium: { name: 'Sân vận động', icon: '🏟️', group: 'park', cost: 45000, upkeep: 700, size: 4, cover: 'park', radius: 18, road: true, unlock: 2500, desc: 'Niềm tự hào của thành phố' },
  clinic: { name: 'Trạm y tế', icon: '🏥', group: 'civic', cost: 9000, upkeep: 190, size: 2, cover: 'health', radius: 14, ambulances: 2, road: true, unlock: 120, desc: 'Xe cứu thương chạy tới nhà người bệnh; kẹt xe thì tới muộn' },
  school: { name: 'Trường tiểu học', icon: '🏫', group: 'civic', cost: 9500, upkeep: 200, size: 2, cover: 'edu', radius: 14, eduLevel: 1, students: 200, road: true, unlock: 120, desc: 'Trẻ 6–11 tuổi trong bán kính được đi học' },
  highschool: { name: 'Trường trung học', icon: '📚', group: 'civic', cost: 14000, upkeep: 260, size: 2, cover: 'edu', radius: 22, eduLevel: 2, students: 260, road: true, unlock: 400, desc: 'Học sinh 12–17 tuổi; cần cho việc làm ở cửa hàng lớn và văn phòng' },
  police: { name: 'Đồn công an', icon: '🚓', group: 'civic', cost: 8000, upkeep: 160, size: 2, cover: 'police', radius: 16, road: true, unlock: 400, desc: 'An ninh, tăng giá trị đất' },
  fire: { name: 'Trạm cứu hoả', icon: '🚒', group: 'civic', cost: 7500, upkeep: 150, size: 2, cover: 'fire', radius: 16, trucks: 2, road: true, unlock: 400, desc: 'Xe cứu hoả phải chạy tới kịp trước khi nhà cháy rụi' },
  university: { name: 'Trường đại học', icon: '🎓', group: 'civic', cost: 30000, upkeep: 600, size: 3, cover: 'edu', radius: 40, eduLevel: 3, students: 300, road: true, unlock: 1000, desc: 'Đào tạo lao động trình độ cao cho văn phòng' },
  parking: { name: 'Bãi đỗ xe', icon: '🅿️', group: 'transit', cost: 2500, upkeep: 30, size: 2, spots: 60, radius: 7, road: true, unlock: 120, desc: 'Chỗ đỗ cho xe tới các toà nhà trong bán kính, đỡ cảnh chạy vòng tìm chỗ' },
  port: { name: 'Cảng hàng hoá', icon: '⚓', group: 'transit', cost: 35000, upkeep: 500, size: 3, needWater: true, road: true, outside: true, ground: 2, unlock: 1000, desc: 'Cửa ngõ xuất nhập khẩu thứ hai: xe tải khỏi phải chạy ra tận đường cao tốc' },
};

export const MILESTONES = [
  { pop: 120, name: 'Xóm nhỏ', reward: 5000 },
  { pop: 400, name: 'Thị trấn', reward: 10000 },
  { pop: 1000, name: 'Thị xã', reward: 20000 },
  { pop: 2500, name: 'Thành phố', reward: 40000 },
  { pop: 6000, name: 'Đô thị lớn', reward: 80000 },
  { pop: 12000, name: 'Siêu đô thị', reward: 150000 },
];

// khoản vay: trả đều hằng ngày, tối đa 3 khoản cùng lúc
export const LOANS = [
  { amount: 20000, days: 4, rate: 0.1 },
  { amount: 50000, days: 6, rate: 0.14 },
  { amount: 120000, days: 8, rate: 0.18 },
];
export const MAX_LOANS = 3;
export const BANKRUPT_AT = -30000; // nợ quá mức này thì phá sản
export const BANKRUPT_DAYS = 4; // hoặc âm tiền liên tục chừng này ngày

// giao thông công cộng
export const TRANSIT = {
  bus: { name: 'Tuyến xe buýt', icon: '🚌', stopCost: 300, vehCost: 1500, upkeep: 40, cap: 40, speed: 19, walk: 110, desc: 'Bấm lên đường để đặt trạm theo thứ tự, bấm chuột phải để chốt tuyến (xe chạy vòng)' },
  metro: { name: 'Tuyến metro', icon: '🚇', stopCost: 6000, trackCost: 9, vehCost: 6000, upkeep: 160, cap: 150, speed: 46, walk: 140, unlock: 2500, desc: 'Đường ray trên cao đi thẳng giữa các ga, không kẹt xe; bấm chuột phải để chốt tuyến' },
};

// giá hàng trong chuỗi cung ứng (mỗi đơn vị)
export const PRICE = { raw: 3, goods: 8, retail: 15, importMult: 1.4, exportMult: 0.85, load: 8 };

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

/** Điểm + tiếp tuyến tại quãng đường s dọc một polyline đã đo (pts phẳng [x, z, ...], cum). */
export function pointAt(pts, cum, s) {
  const n = cum.length - 1;
  let k = 0;
  while (k < n - 1 && cum[k + 1] < s) k++;
  const l = cum[k + 1] - cum[k] || 1, f = clamp((s - cum[k]) / l, 0, 1);
  const x0 = pts[k * 2], z0 = pts[k * 2 + 1], x1 = pts[k * 2 + 2], z1 = pts[k * 2 + 3];
  return [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, (x1 - x0) / l, (z1 - z0) / l];
}

export function distSeg(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
  const t = l2 ? clamp(((px - x0) * dx + (pz - z0) * dz) / l2, 0, 1) : 0;
  const qx = x0 + dx * t, qz = z0 + dz * t;
  return { d: Math.hypot(px - qx, pz - qz), t, x: qx, z: qz };
}

/** Điểm gần nhất trên một đoạn đường: { d, t (0..1 theo tham số), along (quãng đường từ đầu a), x, z } */
export function nearestOnEdge(e, px, pz) {
  const p = e.pts, n = p.length / 2 - 1;
  let best = { d: Infinity, t: 0, along: 0, x: 0, z: 0 };
  for (let k = 0; k < n; k++) {
    const r = distSeg(px, pz, p[k * 2], p[k * 2 + 1], p[k * 2 + 2], p[k * 2 + 3]);
    if (r.d < best.d) best = { d: r.d, t: (k + r.t) / n, along: e.cum[k] + (e.cum[k + 1] - e.cum[k]) * r.t, x: r.x, z: r.z };
  }
  return best;
}

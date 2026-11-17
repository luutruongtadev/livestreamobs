// Phố Mới — mô hình chi tiết cho công trình giao thông lớn: cảng container, sân bay, ga tàu hoả, tàu metro.
// Mỗi hàm dựng phần tĩnh vào GB g (gốc ở tâm khối đất, mặt tiền về +z) và trả về danh sách "mover":
// vật chuyển động theo khung hình khoá (máy bay cất hạ cánh, tàu vào ga, cẩu bốc container, xe tải).
//
// mover = { parts: [{ geometry, off, cargo? }], keys: [[t, x, y, z, yaw, pitch, flags]], period, clip? }
//   t 0..1 trong một chu kỳ dài period giây; yaw quay quanh trục đứng (0 = mũi về +z); flags: 'h' ẩn,
//   'c' ẩn phần cargo, 'i' / 'o' / 's' = đoạn tới khoá này tăng tốc / giảm tốc / êm hai đầu.
//   off = phần nối đuôi lùi sau đầu tàu off mét theo hướng chạy (toa tàu); clip = phần nằm ngoài |x|, |z| > clip thì ẩn.
import * as THREE from '../vendor/three.module.min.js';
import { GB } from './models.js';
import { mulberry32 } from './sim.js';

const GLASS = 0x2f3b45, GLASS_L = 0x7fa6c4, TYRE = 0x1e1f22, STEEL = 0x5b6670, CONC = 0xb4b0a6, YEL = 0xf2c14e, WHITE = 0xf1f2f0;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);

/** Thanh hộp nối hai điểm p0, p1 (tiết diện w × h). */
export function bar(g, p0, p1, w, h, color) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], l = Math.hypot(dx, dz), L = Math.hypot(l, dy);
  if (L < 0.01) return g;
  g.at(tmpM.clone().compose(tmpV.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2), tmpQ.setFromEuler(tmpE.set(-Math.atan2(dy, l), Math.atan2(dx, dz), 0, 'YXZ')), ONE));
  g.box(0, -h / 2, 0, w, h, L, color);
  return g.at(null);
}

/** Ống tròn nằm ngang dọc trục z, từ z0 tới z1, tâm (x, y); r0 ở z0, r1 ở z1. */
function tube(g, x, y, z0, z1, r0, r1, color, seg = 12) {
  g.at(new THREE.Matrix4().makeTranslation(x, y, z0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
  g.cyl(0, 0, 0, r0, r1, z1 - z0, color, seg);
  return g.at(null);
}

/** Tấm mỏng hai mặt (cánh, đuôi máy bay): 4 đỉnh, độ dày giả bằng hai mặt lệch nhau. */
function plate(g, pts, color, th = 0.08) {
  const up = pts.map((p) => [p[0], p[1] + th / 2, p[2]]), dn = pts.map((p) => [p[0], p[1] - th / 2, p[2]]);
  g.poly(up, [0, 1, 0], color); g.poly(dn, [0, -1, 0], color);
  return g;
}
function fin(g, pts, color) { g.poly(pts, [1, 0, 0], color); g.poly(pts.map((p) => [p[0] - 0.08, p[1], p[2]]), [-1, 0, 0], color); return g; }

/** Ghép thêm một đoạn rời vào khung khoá: trả về khoá theo thời gian tương đối. */
const K = (t, x, y, z, yaw = 0, pitch = 0, f = '') => [t, x, y, z, yaw, pitch, f];

// ───────────────────────── máy bay ─────────────────────────

/** Máy bay chở khách thân hẹp, mũi về +z, bánh chạm y = 0. livery: màu đuôi. */
export function planeGeometry(livery = 0x2c5aa0, scale = 0.7) {
  const g = new GB(), cy = 2.3, R = 1.15;
  tube(g, 0, cy + 0.25, -8.2, -5, 0.3, R * 0.9, WHITE); // đuôi thon, hơi vểnh
  tube(g, 0, cy, -5.2, 5.6, R, R, WHITE, 14);
  tube(g, 0, cy - 0.05, 5.6, 7.9, R, 0.28, WHITE, 14); // mũi
  g.box(0, cy + 0.2, 6.1, 1.3, 0.35, 0.9, GLASS); // kính buồng lái
  for (const s of [-1, 1]) {
    g.box(s * (R - 0.02), cy + 0.25, 0.2, 0.06, 0.24, 9.6, GLASS); // dãy cửa sổ
    g.box(s * (R - 0.04), cy - 0.45, 0.2, 0.06, 0.18, 12, livery); // vạch sơn thân
    g.box(s * (R - 0.02), cy - 0.2, 4.6, 0.06, 1.3, 0.55, 0xd9dde0); // cửa
    // cánh xuôi sau, có góc nhị diện nhẹ
    plate(g, [[s * 0.9, cy - 0.55, 1.6], [s * 7.6, cy + 0.15, -2.6], [s * 7.6, cy + 0.15, -3.5], [s * 0.9, cy - 0.55, -1.6]], 0xe4e6e8, 0.18);
    g.box(s * 7.6, cy + 0.15, -3.05, 0.1, 0.9, 0.9, livery); // đầu cánh vểnh
    // động cơ dưới cánh
    tube(g, s * 3.1, cy - 1.15, -0.4, 2.1, 0.55, 0.62, 0xc8cdd2); g.box(s * 3.1, cy - 0.75, 0.2, 0.16, 0.5, 1.6, 0xb5babf);
    tube(g, s * 3.1, cy - 1.15, 2.08, 2.14, 0.5, 0.5, 0x30353a);
    // cánh đuôi ngang
    plate(g, [[s * 0.3, cy + 0.45, -6.2], [s * 3.2, cy + 0.6, -7.8], [s * 3.2, cy + 0.6, -8.4], [s * 0.3, cy + 0.45, -8.1]], 0xe4e6e8, 0.12);
  }
  fin(g, [[0.04, cy + 0.9, -5.4], [0.04, cy + 4.3, -7.6], [0.04, cy + 4.3, -8.5], [0.04, cy + 0.9, -8.2]], livery); // đuôi đứng
  // càng đáp
  g.box(0, 0, 5.4, 0.3, cy - R + 0.1, 0.3, 0x4a4d52); g.box(0, 0, 5.4, 0.3, 0.55, 0.55, TYRE);
  for (const s of [-1, 1]) { g.box(s * 1.4, 0, -0.6, 0.3, cy - 0.6, 0.3, 0x4a4d52); g.box(s * 1.4, 0, -0.6, 0.55, 0.7, 1.1, TYRE); }
  const geo = g.build();
  if (scale !== 1) geo.scale(scale, scale, scale);
  return geo;
}

// ───────────────────────── tàu hoả, metro ─────────────────────────

/** Một toa tàu dài len, mũi về +z, đáy bánh y = 0. kind: 'loco' | 'coach' | 'flat' | 'tank' | 'metroHead' | 'metroMid'. */
function carInto(g, kind, len, o = {}) {
  const body = o.body ?? 0x23406e, stripe = o.stripe ?? 0xd0342c, w = o.w ?? 2.8, h = o.h ?? 3.1, z0 = -len / 2, z1 = len / 2, y0 = 0.75;
  for (const z of [z0 + len * 0.2, z1 - len * 0.2]) { g.box(0, 0.05, z, w - 0.5, 0.7, 2.2, 0x2a2c30); for (const s of [-1, 1]) for (const dz of [-0.7, 0.7]) g.box(s * (w / 2 - 0.35), 0.05, z + dz, 0.12, 0.65, 0.65, 0x3a3d42); } // giá chuyển hướng
  if (kind === 'flat') {
    g.box(0, y0, 0, w, 0.35, len, 0x3b3e43);
    const rr = mulberry32(o.seed || 3), cols = [0xc0392b, 0x2f6fb0, 0xd8b93a, 0x3d8a5a, 0xe07b2e, 0x8a949c];
    for (const z of len > 8 ? [-len / 4, len / 4] : [0]) if (rr() > 0.15) g.box(0, y0 + 0.35, z, w - 0.2, 2.4, Math.min(len / 2, 6) - 0.3, cols[(rr() * cols.length) | 0]);
    return g;
  }
  if (kind === 'tank') {
    g.box(0, y0, 0, w - 0.3, 0.3, len, 0x2a2c30);
    tube(g, 0, y0 + 1.55, z0 + 0.4, z1 - 0.4, 1.25, 1.25, o.tank ?? 0x1f2326, 14);
    g.box(0, y0 + 2.75, 0, 0.8, 0.3, 0.8, 0x4a4d52);
    return g;
  }
  const metro = kind.startsWith('metro');
  g.box(0, y0, 0, w, h, len, body); // thân
  g.box(0, y0 + h, 0, w - 0.5, 0.18, len - 0.4, metro ? 0xc9ced3 : 0x4a4d52); // mái
  for (const s of [-1, 1]) {
    g.box(s * (w / 2 + 0.01), y0 + h * 0.48, 0, 0.04, h * 0.32, len - 1.2, metro ? 0x26313b : GLASS); // dải cửa sổ
    if (!metro) g.box(s * (w / 2 + 0.02), y0 + h * 0.25, 0, 0.04, 0.22, len - 0.2, stripe); // vạch sơn
    const doors = metro ? 3 : kind === 'coach' ? 2 : 0;
    for (let k = 0; k < doors; k++) { const z = z0 + (len * (k + 0.5)) / doors; g.box(s * (w / 2 + 0.02), y0 + 0.1, z, 0.04, h * 0.82, 1.3, metro ? 0x8d98a2 : 0x1d3155); }
  }
  if (kind === 'loco' || kind === 'metroHead') { // đầu máy: mũi dốc, kính lái, đèn
    const nz = z1;
    g.at(new THREE.Matrix4().makeTranslation(0, y0 + h * 0.62, nz - 0.2).multiply(new THREE.Matrix4().makeRotationX(-0.55)));
    g.box(0, 0, 0, w - 0.2, h * 0.38, 1.2, GLASS);
    g.at(null);
    g.box(0, y0 + 0.25, nz + 0.05, w - 0.3, h * 0.45, 0.25, metro ? 0xe9edf0 : stripe);
    for (const s of [-1, 1]) g.box(s * (w / 2 - 0.45), y0 + 0.7, nz + 0.2, 0.42, 0.22, 0.06, 0xfff3b0);
    if (!metro) { g.box(0, y0 + h, -0.5, 1.6, 0.45, len * 0.45, 0x5b6670); for (let k = 0; k < 3; k++) g.box(0, y0 + h + 0.45, -len * 0.2 + k * 1.3, 0.9, 0.06, 0.9, 0x2a2c30); } // quạt làm mát
  }
  if (metro) for (const z of [-len / 4, len / 4]) g.box(0, y0 + h + 0.18, z, 1.4, 0.35, 1.6, 0xb5babf); // điều hoà trên mái
  return g;
}
const carGeo = (kind, len, o) => carInto(new GB(), kind, len, o).build();

/** Tàu metro 3 toa (mũi về +z): { body, stripe } — stripe tô theo màu tuyến. Dài 24 m. */
export function metroGeometry() {
  const body = new GB(), stripe = new GB(), len = 7.7, w = 2.7, h = 3;
  for (const [k, z] of [[0, 8.1], [1, 0], [2, -8.1]]) {
    body.at(new THREE.Matrix4().makeTranslation(0, 0, z).multiply(new THREE.Matrix4().makeRotationY(k === 2 ? Math.PI : 0)));
    carInto(body, k === 1 ? 'metroMid' : 'metroHead', len, { body: 0xdfe4e8, w, h });
    body.at(null);
    for (const s of [-1, 1]) {
      stripe.box(s * (w / 2 + 0.03), 0.95, z, 0.04, 0.32, len - 0.1, WHITE); // vạch màu tuyến dưới cửa sổ
      stripe.box(s * (w / 2 + 0.03), 0.75 + h - 0.25, z, 0.04, 0.12, len - 0.3, WHITE);
    }
    if (k !== 1) stripe.box(0, 0.75 + 0.3, z + (k === 0 ? 1 : -1) * (len / 2 + 0.2), w - 0.4, 0.3, 0.06, WHITE); // mũi
  }
  for (const z of [4.05, -4.05]) body.box(0, 1, z, w - 0.6, h - 0.4, 0.5, 0x3a3d42); // ống nối toa
  return { body: body.build(), stripe: stripe.build() };
}

// ───────────────────────── ga tàu hoả ─────────────────────────

/** Ga tàu hoả 3×3 ô: nhà ga mặt đường (+z), sân ga có mái, cầu bộ hành, 3 đường ray, cột điện lưới; tàu khách vào ga, tàu hàng chạy qua. */
export function trainStation(g, e) {
  const H = e / 2, rr = mulberry32(17);
  g.box(0, 0, 0, e, 0.14, e, 0xbdb8ac);
  g.box(0, 0.14, -12.6, e, 0.06, 4.4, 0x8fa36a); // dải cỏ sau cùng
  for (let k = 0; k < 15; k++) g.box(-H + 1 + k * 2, 0.14, -14.6, 0.08, 1.8, 0.08, 0x6f7a82); g.box(0, 1.6, -14.6, e, 0.06, 0.06, 0x6f7a82); // hàng rào
  // nhà ga: khối chính hai tầng, sảnh giữa cao, mái ngói đỏ, cột hiên, đồng hồ
  g.box(-7, 0.14, 10, 12, 6.5, 6, 0xead9b6, true); g.gable(-7, 6.64, 10, 12.4, 2, 6.6, 0x9a4a36, true, 0xead9b6);
  g.box(7, 0.14, 10, 12, 6.5, 6, 0xead9b6, true); g.gable(7, 6.64, 10, 12.4, 2, 6.6, 0x9a4a36, true, 0xead9b6);
  g.box(0, 0.14, 10.5, 7, 9.5, 7, 0xf1e3c4, true); g.gable(0, 9.64, 10.5, 7.6, 3, 7.6, 0x9a4a36, false, 0xf1e3c4);
  g.box(0, 6.8, 14.05, 6, 1, 0.12, 0x2c5aa0); // biển tên ga
  g.cyl(0, 8.6, 14.05, 0.75, 0.75, 0.06, 0xf4efe6, 14); // đồng hồ (mặt đứng giả)
  g.box(0, 0.14, 14.6, 16, 0.25, 2.2, 0xd8d2c4); g.box(0, 3.6, 14.4, 16.4, 0.25, 2.6, 0x7d4a3c); // hiên
  for (const x of [-7.6, -3, 3, 7.6]) g.cyl(x, 0.39, 15.4, 0.2, 0.2, 3.2, 0xf4efe6, 8);
  for (const x of [-12.4, 12.4]) g.box(x, 0.14, 14, 1.6, 0.9, 1.4, 0x5a8a4a); // bồn cây
  // sân ga cạnh nhà ga (z 3..6.8) + sân ga giữa (z -3.2..-0.4)
  g.box(0, 0.14, 4.9, e, 0.9, 3.8, 0xc9c5ba); g.box(0, 1.04, 3.12, e, 0.02, 0.25, YEL);
  g.box(0, 0.14, -1.8, e, 0.9, 2.8, 0xc9c5ba); g.box(0, 1.04, -0.52, e, 0.02, 0.22, YEL); g.box(0, 1.04, -3.08, e, 0.02, 0.22, YEL);
  // mái sân ga: cột thép, mái tôn hơi dốc
  for (let k = 0; k < 6; k++) {
    const x = -11 + k * 4.4;
    g.box(x, 1.04, 5.6, 0.22, 3.3, 0.22, STEEL); g.box(x, 1.04, -1.8, 0.22, 3.3, 0.22, STEEL);
    g.box(x - 0.3, 3.3, -2.4, 0.06, 0.6, 1.2, 0x2c5aa0); // biển chỉ dẫn
  }
  g.at(new THREE.Matrix4().makeTranslation(0, 4.4, 4.8).multiply(new THREE.Matrix4().makeRotationX(-0.08))).box(0, 0, 0, 26, 0.18, 4.4, 0x6f8a9a).at(null);
  g.at(new THREE.Matrix4().makeTranslation(0, 4.35, -1.8)).box(0, 0, 0, 26, 0.18, 3.6, 0x6f8a9a).box(0, 0.18, 0, 26, 0.12, 0.3, 0x56707e).at(null);
  for (let k = 0; k < 5; k++) { const x = -10 + k * 5; g.box(x, 1.04, 5.9, 1.6, 0.45, 0.45, 0x8a5a36); g.box(x, 1.04, -1.2, 1.6, 0.45, 0.45, 0x8a5a36); } // ghế chờ
  // cầu bộ hành vượt ray: hai tháp cầu thang + nhịp kính
  for (const z of [5.2, -1.8]) { g.box(10.5, 1.04, z, 2.4, 6.4, 2.4, 0xd9dcd8, true); g.box(10.5, 7.44, z, 2.7, 0.2, 2.7, 0x5b6670); }
  g.box(10.5, 6.1, 1.7, 2.2, 0.35, 8.5, 0x9a968e); g.box(10.5, 6.45, 1.7, 2.2, 1.9, 8.5, 0x9cc4e4); g.box(10.5, 8.35, 1.7, 2.5, 0.2, 8.8, 0x5b6670);
  // đường ray: nền đá, tà vẹt, hai ray
  const TR = [1.25, -4.85, -9];
  for (const z of TR) {
    g.box(0, 0.14, z, e, 0.22, 3.4, 0x8a8278);
    for (let x = -H + 0.4; x < H; x += 0.9) g.box(x, 0.36, z, 0.32, 0.1, 2.5, 0x6b5a48);
    for (const s of [-0.72, 0.72]) g.box(0, 0.46, z + s, e, 0.14, 0.12, 0x9aa3aa);
  }
  // cột điện lưới (catenary) một phía, cần vươn qua các ray, dây tiếp xúc
  for (let k = 0; k < 4; k++) {
    const x = -12 + k * 8;
    g.box(x, 0.14, -11.6, 0.3, 7.6, 0.3, 0x7d8890);
    g.box(x, 7.2, -4.6, 0.18, 0.18, 14, 0x7d8890);
    for (const z of TR) g.box(x, 6.2, z, 0.08, 1, 0.08, 0x3a3d42);
  }
  for (const z of TR) g.box(0, 6.2, z, e, 0.05, 0.05, 0x2a2c30);
  // cột tín hiệu ở hai đầu (che chỗ tàu ra vào khu ga)
  for (const s of [-1, 1]) {
    g.box(s * (H - 0.4), 0.14, -12, 0.35, 6.6, 0.35, 0x4a4d52); g.box(s * (H - 0.4), 6.4, -4.6, 0.4, 0.5, 15, 0x4a4d52);
    for (const z of TR) { g.box(s * (H - 0.4), 5.2, z, 0.5, 1.2, 0.4, 0x22262b); g.box(s * (H - 0.6), 5.7, z, 0.06, 0.25, 0.25, rr() > 0.5 ? 0x35e06a : 0xff3b30); }
  }
  for (const [x, z] of [[-13.5, 12], [13.5, 12]]) { g.cyl(x, 0.14, z, 0.14, 0.1, 6, 0x5b6670, 6); g.box(x, 6, z, 0.9, 0.25, 0.5, 0xfff2c0); }

  // tàu: đầu máy + toa khách; tàu hàng: đầu máy + toa container + toa bồn
  const passenger = (o) => [{ geometry: carGeo('loco', 6.6, o), off: 0 }, { geometry: carGeo('coach', 6.6, o), off: 6.9 }, { geometry: carGeo('coach', 6.6, o), off: 13.8 }, { geometry: carGeo('coach', 6.6, o), off: 20.7 }];
  const freight = [{ geometry: carGeo('loco', 6.6, { body: 0xd8b93a, stripe: 0x2a2c30 }), off: 0 }, { geometry: carGeo('flat', 6.6, { seed: 4 }), off: 6.9 }, { geometry: carGeo('tank', 6.6), off: 13.8 }, { geometry: carGeo('flat', 6.6, { seed: 9 }), off: 20.7 }, { geometry: carGeo('tank', 6.6, { tank: 0xd8d4cc }), off: 27.6 }, { geometry: carGeo('flat', 6.6, { seed: 13 }), off: 34.5 }];
  const Y = 0.53, E = Math.PI / 2, far = H + 42;
  return [
    { parts: passenger({}), period: 46, clip: H - 0.2, keys: [K(0, -far, Y, TR[0], E, 0, 'h'), K(0.02, -far, Y, TR[0], E), K(0.22, 11.5, Y, TR[0], E, 0, 'o'), K(0.62, 11.5, Y, TR[0], E), K(0.86, far, Y, TR[0], E, 0, 'i'), K(0.88, far, Y, TR[0], E, 0, 'h'), K(1, -far, Y, TR[0], E, 0, 'h')] },
    { parts: passenger({ body: 0xe9edf0, stripe: 0x2c5aa0 }), period: 52, clip: H - 0.2, keys: [K(0, far, Y, TR[1], -E, 0, 'h'), K(0.4, far, Y, TR[1], -E, 0, 'h'), K(0.42, far, Y, TR[1], -E), K(0.6, -11.5, Y, TR[1], -E, 0, 'o'), K(0.9, -11.5, Y, TR[1], -E), K(1, -far, Y, TR[1], -E, 0, 'i')] },
    { parts: freight, period: 38, clip: H - 0.2, keys: [K(0, -far - 10, Y, TR[2], E, 0, 'h'), K(0.25, -far - 10, Y, TR[2], E, 0, 'h'), K(0.26, -far - 10, Y, TR[2], E), K(0.9, far + 40, Y, TR[2], E), K(0.91, far + 40, Y, TR[2], E, 0, 'h'), K(1, -far, Y, TR[2], E, 0, 'h')] },
  ];
}

// ───────────────────────── cảng container ─────────────────────────

/** Cảng container 3×3 ô, mặt nước phía -z: cầu cảng, 3 cẩu giàn STS chạy trên ray, bãi container có cẩu RTG, ray tàu hàng phía sau. */
export function containerPort(g, e) {
  const H = e / 2, rr = mulberry32(71), cols = [0xc0392b, 0x2f6fb0, 0xd8b93a, 0x3d8a5a, 0xe07b2e, 0x8a949c, 0xe6e6e6, 0x6a3d8a, 0x1f8a8a];
  g.box(0, 0, 0, e, 0.14, e, 0xb9b5aa);
  // mép cầu cảng: dầm bê tông, đệm va, cọc buộc tàu
  g.box(0, -1.4, -H + 0.5, e, 1.56, 1, 0x8d887e); g.box(0, 0.14, -H + 0.9, e, 0.05, 0.25, YEL);
  for (let k = 0; k < 10; k++) { const x = -H + 1.5 + k * 3; g.box(x, -1.2, -H - 0.1, 1.1, 1.2, 0.35, 0x222222); if (k % 2 === 0) g.cyl(x + 1.5, 0.14, -H + 0.45, 0.22, 0.28, 0.5, 0x2f3b45, 6); }
  // vạch làn trên bãi
  for (const z of [-12.5, -6.5]) g.box(0, 0.15, z, e, 0.02, 0.18, YEL);
  for (let x = -H + 1; x < H; x += 3.2) g.box(x, 0.15, -9.5, 1.6, 0.02, 0.14, WHITE);
  // ray cẩu giàn
  for (const z of [-13.2, -5.8]) g.box(0, 0.14, z, e, 0.12, 0.35, 0x4a4d52);
  // cẩu giàn STS: chân chữ A, dầm cổng, cần vươn ra biển, tháp chữ A có dây văng, buồng máy
  const NAVY = 0x34405a, BOOM = 0x3e4c6a;
  const STS = [-9.5, 0, 9.5];
  for (const x of STS) {
    for (const z of [-13.2, -5.8]) {
      for (const dx of [-2.4, 2.4]) { g.box(x + dx, 0.26, z, 0.7, 13.4, 0.7, NAVY); g.box(x + dx, 0.14, z, 1.2, 0.7, 1.4, 0x22262b); } // chân + cụm bánh
      g.box(x, 12.8, z, 5.5, 0.9, 0.8, NAVY); g.box(x, 4.2, z, 5.5, 0.5, 0.5, NAVY);
    }
    for (const dx of [-2.4, 2.4]) { bar(g, [x + dx, 5, -13.2], [x + dx, 12.6, -5.8], 0.3, 0.3, NAVY); g.box(x + dx, 13.7, -9.5, 0.6, 0.9, 7.4, NAVY); }
    for (const dx of [-1.25, 1.25]) g.box(x + dx, 13.9, -11, 0.5, 1, 30, BOOM); // hai dầm cần, từ z = -26 tới +4
    for (let z = -25.5; z <= 3.5; z += 3) g.box(x, 14.75, z, 2.9, 0.18, 0.18, BOOM);
    g.box(x, 14.9, -25.8, 3, 0.4, 0.4, WHITE); // mũi cần
    for (const dx of [-2.4, 2.4]) { bar(g, [x + dx, 14.4, -13.2], [x + dx * 0.4, 22.5, -10], 0.45, 0.45, NAVY); bar(g, [x + dx, 14.4, -5.8], [x + dx * 0.4, 22.5, -10], 0.45, 0.45, NAVY); } // tháp chữ A
    g.box(x, 22.2, -10, 2.4, 0.6, 0.6, NAVY);
    for (const dx of [-1.25, 1.25]) { bar(g, [x + dx * 0.6, 22.5, -10], [x + dx, 14.9, -25.5], 0.12, 0.12, 0x9aa3aa); bar(g, [x + dx * 0.6, 22.5, -10], [x + dx, 14.9, -18], 0.1, 0.1, 0x9aa3aa); bar(g, [x + dx * 0.6, 22.5, -10], [x + dx, 14.9, 3], 0.12, 0.12, 0x9aa3aa); }
    g.box(x, 14.4, 1.6, 3.4, 2.4, 4, 0xe9ecef); g.box(x, 16.8, 1.6, 3.6, 0.2, 4.2, NAVY); // buồng máy
    g.box(x, 22.8, -10, 0.15, 0.6, 0.15, 0xff3b30); // đèn báo không
  }
  // bãi container: 2 khối, mỗi khối 3 dãy × 4 cột, chồng 1–4 tầng; container dài dọc trục x
  const blocks = [[0.6, [-1.95, 0.6, 3.15]], [9.4, [6.85, 9.4, 11.95]]];
  for (const [, rows] of blocks) for (const z of rows) for (let k = 0; k < 4; k++) {
    const x = -10.6 + k * 6.6, h = 1 + ((rr() * 4) | 0);
    for (let q = 0; q < h; q++) {
      const c = cols[(rr() * cols.length) | 0];
      g.box(x, 0.14 + q * 1.32, z, 6, 1.28, 2.38, c);
      g.box(x, 0.14 + q * 1.32 + 1.28, z, 6.02, 0.04, 2.4, 0x3a3d42); // gờ nóc tối cho rõ từng chiếc
    }
  }
  // ray tàu hàng phía sau + toa container
  g.box(0, 0.14, 14.3, e, 0.2, 1.1, 0x8a8278); for (const s of [-0.4, 0.4]) g.box(0, 0.34, 14.3 + s, e, 0.1, 0.08, 0x9aa3aa);
  for (let k = 0; k < 4; k++) { const x = -10.5 + k * 7; g.box(x, 0.44, 14.3, 6.6, 0.3, 1.2, 0x3b3e43); if (rr() > 0.3) g.box(x, 0.74, 14.3, 6, 1.1, 1.2, cols[(rr() * cols.length) | 0]); }
  // cột đèn pha cao
  for (const [x, z] of [[-14.4, -4], [14.4, -4], [-14.4, 5], [14.4, 5]]) { g.cyl(x, 0.14, z, 0.22, 0.14, 15, 0x8a949c, 6); g.box(x, 15, z, 2, 0.5, 0.9, 0xfff2c0); }

  // ── vật chuyển động ──
  const movers = [];
  // xe con cẩu (trolley) + buồng lái + khung cẩu + container trên mỗi cẩu giàn: từ tàu (ngoài biển) về làn xe tải
  const trolley = new GB();
  trolley.box(0, 0, 0, 2.6, 0.9, 2.2, 0xe9ecef); trolley.box(0, -1.6, 0.9, 1.6, 1.4, 1.4, 0x2f3b45); trolley.box(0, -1.25, 1.62, 1.4, 0.7, 0.04, GLASS_L);
  for (const dx of [-1.1, 1.1]) for (const dz of [-0.6, 0.6]) trolley.box(dx, -6.6, dz, 0.05, 6.6, 0.05, 0x2a2c30); // cáp
  trolley.box(0, -7, 0, 6.2, 0.4, 2.5, YEL); // khung cẩu
  const tGeo = trolley.build();
  STS.forEach((x, i) => {
    const box = new GB(); box.box(0, -8.35, 0, 6, 1.3, 2.4, cols[(i * 3 + 1) % cols.length]);
    const keys = [K(0, x, 14.3, -22), K(0.12, x, 14.3, -22), K(0.42, x, 14.3, -8, 0, 0, 's'), K(0.56, x, 14.3, -8, 0, 0, 'c'), K(0.86, x, 14.3, -22, 0, 0, 'cs'), K(1, x, 14.3, -22)];
    movers.push({ parts: [{ geometry: tGeo, off: 0 }, { geometry: box.build(), off: 0, cargo: true }], period: 22 + i * 3, keys, phase: i * 0.31 });
  });
  // cẩu RTG bánh lốp chạy dọc khối container
  const rtg = new GB(), RW = 0xe6e8ea;
  for (const dz of [-4, 4]) { for (const dx of [-3.4, 3.4]) { rtg.box(dx, 0.5, dz, 0.5, 7.4, 0.5, RW); rtg.box(dx, 0, dz, 0.9, 1, 1.2, TYRE); } rtg.box(0, 0.6, dz, 6.8, 0.5, 0.6, RW); rtg.box(0, 7.4, dz, 7.4, 0.7, 0.7, 0x2c5aa0); }
  for (const dx of [-3.4, 3.4]) rtg.box(dx, 7.4, 0, 0.6, 0.7, 8.6, 0x2c5aa0);
  rtg.box(0, 6.9, 1, 1.8, 0.9, 2, 0xe9ecef); rtg.box(-2.6, 4.5, -4, 1, 1.2, 1, 0x2f3b45); rtg.box(0, 5.4, 1, 6, 0.3, 2.4, YEL);
  const rtgGeo = rtg.build();
  for (const [z, ph] of [[blocks[0][1][1], 0], [blocks[1][1][1], 0.5]]) movers.push({ parts: [{ geometry: rtgGeo, off: 0 }], period: 40, phase: ph, keys: [K(0, -8, 0.14, z), K(0.4, 8, 0.14, z, 0, 0, 's'), K(0.5, 8, 0.14, z), K(0.9, -8, 0.14, z, 0, 0, 's'), K(1, -8, 0.14, z)] });
  // xe đầu kéo container chạy dưới cẩu giàn và trên làn giữa bãi
  const truck = (c) => {
    const t = new GB();
    t.box(0, 0.35, 3.6, 2.2, 2.2, 2, 0xd0342c); t.box(0, 1.5, 4.62, 1.9, 0.8, 0.04, GLASS); t.box(0, 0.4, -1, 2.3, 0.3, 7.4, 0x3b3e43);
    t.box(0, 0.7, -1.1, 2.3, 2.4, 6, c);
    for (const z of [3.8, 1.8, -3, -4.2]) for (const s of [-1, 1]) t.box(s * 1, 0, z, 0.35, 0.8, 0.8, TYRE);
    return t.build();
  };
  const E = Math.PI / 2;
  movers.push({ parts: [{ geometry: truck(0x2f6fb0), off: 0 }], period: 16, clip: H - 0.2, keys: [K(0, -H - 8, 0.14, -8, E), K(1, H + 8, 0.14, -8, E)] });
  movers.push({ parts: [{ geometry: truck(0xe07b2e), off: 0 }], period: 19, phase: 0.4, clip: H - 0.2, keys: [K(0, H + 8, 0.14, -11, -E), K(1, -H - 8, 0.14, -11, -E)] });
  return movers;
}

// ───────────────────────── sân bay ─────────────────────────

/** Sân bay 5×5 ô: nhà ga sát đường (+z) có ống lồng, sân đỗ, đường lăn, đường băng phía sau (-z); máy bay hạ cánh, lăn, cất cánh. */
export function airport(g, e) {
  const H = e / 2;
  g.box(0, 0, 0, e, 0.14, e, 0x7da55a);
  // đường băng (trục x, z = -18.5): mặt nhựa, vạch tim, vạch ngưỡng "phím đàn", vạch chạm bánh, đèn lề
  const RZ = -18.5, RW = 7;
  g.box(0, 0.14, RZ, e - 0.6, 0.06, RW, 0x45484d);
  for (let x = -H + 6; x < H - 6; x += 4) g.box(x, 0.21, RZ, 2.2, 0.02, 0.22, WHITE);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) g.box(s * (H - 2), 0.21, RZ - 2.75 + k * 1.1, 2.4, 0.02, 0.55, WHITE);
    for (const dz of [-1.6, 1.6]) g.box(s * (H - 9), 0.21, RZ + dz, 3, 0.02, 0.6, WHITE);
    for (const dz of [-RW / 2 + 0.15, RW / 2 - 0.15]) g.box(0, 0.21, RZ + dz, e - 1.2, 0.02, 0.12, WHITE);
  }
  for (let x = -H + 1.5; x < H; x += 4) for (const dz of [-RW / 2 - 0.3, RW / 2 + 0.3]) g.box(x, 0.14, RZ + dz, 0.2, 0.25, 0.2, 0xfff2c0);
  // đường lăn song song + 2 đường nối, vạch vàng tim
  const TZ = -12;
  g.box(0, 0.14, TZ, 44, 0.05, 3.6, 0x55595e); g.box(0, 0.2, TZ, 44, 0.02, 0.12, YEL);
  for (const x of [-21, 21]) { g.box(x, 0.14, (TZ + RZ) / 2, 3.6, 0.05, RZ - TZ < 0 ? TZ - RZ : RZ - TZ, 0x55595e); g.box(x, 0.2, (TZ + RZ) / 2, 0.12, 0.02, TZ - RZ, YEL); }
  // sân đỗ bê tông
  g.box(-4, 0.14, -1, 40, 0.05, 14, 0xa5a39d);
  for (const x of [-15, -4, 7]) { g.box(x, 0.2, -1.5, 0.12, 0.02, 12, YEL); g.box(x, 0.2, 5.4, 1.6, 0.02, 0.12, YEL); } // vạch dẫn chỗ đỗ
  // nhà ga: khối kính dài, mái vòm cong (3 tấm), sảnh đón trả khách ở mặt đường
  g.box(-4, 0.14, 11, 36, 6, 6.6, 0xdfe6ea);
  for (const z of [7.65, 14.35]) { g.box(-4, 0.5, z, 35.4, 2.2, 0.1, GLASS_L); g.box(-4, 3.3, z, 35.4, 2.3, 0.1, GLASS_L); } // vách kính hai tầng
  for (let k = 0; k <= 12; k++) for (const z of [7.6, 14.4]) g.box(-21.7 + k * 2.95, 0.14, z, 0.18, 6, 0.14, 0xb5bcc2); // khung đứng
  for (const [dz, a] of [[-2.4, 0.22], [0, 0], [2.4, -0.22]]) g.at(new THREE.Matrix4().makeTranslation(-4, 6.4 + (dz ? -0.25 : 0.1), 11 + dz).multiply(new THREE.Matrix4().makeRotationX(a))).box(0, 0, 0, 37, 0.3, 2.6, 0xc9d0d6).at(null);
  g.box(-4, 0.14, 16.2, 30, 0.2, 3.6, 0x55595e); g.box(-4, 3.6, 15.9, 32, 0.2, 3, 0xe9ecef); for (let k = 0; k < 7; k++) g.box(-19 + k * 5, 0.34, 17.2, 0.2, 3.3, 0.2, STEEL); // làn đón khách có mái
  g.box(-4, 4.4, 14.35, 10, 1, 0.1, 0x2c5aa0); // biển sân bay
  // ống lồng (jet bridge) từ nhà ga ra cửa máy bay
  for (const x of [-15, -4, 7]) { bar(g, [x + 2.4, 3.3, 7.6], [x + 1.5, 2.9, 4.4], 1.5, 1.9, 0xd9dcd8); g.box(x + 1.6, 0.14, 4.8, 0.35, 1.2, 0.35, STEEL); }
  // máy bay đỗ ở 3 chỗ (mũi hướng nhà ga), xe kéo, xe chở hành lý
  const pl = planeGeometry(0x2c5aa0);
  const putPlane = (x, z, yaw, liv) => {
    const geo = liv === 0x2c5aa0 ? pl : planeGeometry(liv), m = new THREE.Matrix4().makeTranslation(x, 0.17, z).multiply(new THREE.Matrix4().makeRotationY(yaw));
    const p = geo.attributes.position, n = geo.attributes.normal, c = geo.attributes.color, idx = geo.index.array, v = new THREE.Vector3(), base = g.p.length / 3, nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); g.p.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); g.n.push(v.x, v.y, v.z);
      g.c.push(c.getX(i), c.getY(i), c.getZ(i)); g.u.push(0.03, 0.03);
    }
    for (const k of idx) g.i.push(base + k);
  };
  putPlane(-15, 0.5, 0, 0x2c5aa0); putPlane(7, 0.5, 0, 0xd0342c);
  for (const [x, z] of [[-11, 1], [-1, -6]]) { g.box(x, 0.14, z, 1.6, 0.9, 2.6, 0xe6a01e); for (let k = 1; k <= 2; k++) g.box(x, 0.14, z - k * 2.4, 1.4, 0.9, 2, 0xb9c2c8); }
  // đài kiểm soát không lưu
  g.cyl(19, 0.14, 10, 1.5, 1.2, 19, 0xe6e9ec, 12); g.cyl(19, 19.14, 10, 2.3, 3, 1, 0xd9dcd8, 12); g.cyl(19, 20.14, 10, 3, 3, 2.2, 0x6fa8ff, 12); g.cyl(19, 22.34, 10, 3.3, 2.4, 0.6, 0x5b6670, 12);
  g.cyl(19, 22.94, 10, 0.12, 0.12, 2.5, 0x9aa3aa, 5); g.box(19, 25.3, 10, 0.3, 0.3, 0.3, 0xff3b30);
  // nhà chứa máy bay mái vòm + kho hàng
  g.box(18.8, 0.14, -1.5, 11, 6, 10, 0xc9cdd0); for (let k = 0; k < 4; k++) g.box(18.8, 6.14 + Math.sin(((k + 0.5) / 4) * Math.PI) * 1.6, -6 + k * 2.5 + 1.25, 11.2, 0.3, 2.7, 0x8a949c);
  g.box(18.8, 0.3, 3.55, 9, 5.4, 0.1, 0x6f7a82);
  // ống gió (windsock)
  g.cyl(-22, 0.14, -13.5, 0.06, 0.06, 4, 0xe9ecef, 5); g.at(new THREE.Matrix4().makeTranslation(-22, 4, -13.5).multiply(new THREE.Matrix4().makeRotationZ(-1.45))).cyl(0, 0, 0, 0.3, 0.15, 1.6, 0xe07b2e, 6).at(null);

  // máy bay động: tiếp cận từ xa, chạm đường băng, giảm tốc, rẽ vào đường lăn, lăn về đầu đường băng, cất cánh, bay đi
  const E = Math.PI / 2, y0 = 0.2;
  const keys = [
    K(0, -260, 52, RZ, E, -0.06, 'h'), K(0.02, -260, 52, RZ, E, -0.06),
    K(0.2, -22, y0 + 1.2, RZ, E, -0.1), K(0.22, -14, y0, RZ, E, 0),
    K(0.32, 16, y0, RZ, E, 0, 'o'), K(0.35, 21, y0, RZ + 2.5, E * 0.5, 0), K(0.38, 21, y0, TZ - 1, 0.05, 0),
    K(0.4, 18, y0, TZ, -E, 0), K(0.6, -18, y0, TZ, -E, 0), K(0.63, -21, y0, TZ - 2.5, -Math.PI * 0.85, 0), K(0.66, -21, y0, RZ + 1, -Math.PI, 0),
    K(0.68, -20, y0, RZ, E, 0), K(0.71, -20, y0, RZ, E, 0),
    K(0.8, 14, y0, RZ, E, -0.05, 'i'), K(0.83, 30, 4, RZ, E, -0.18), K(0.98, 300, 70, RZ, E, -0.14), K(0.985, 300, 70, RZ, E, -0.14, 'h'), K(1, -260, 52, RZ, E, -0.06, 'h'),
  ];
  return [{ parts: [{ geometry: planeGeometry(0x2f8f5a), off: 0 }], period: 75, keys }];
}

/** Ga metro trên cao (dọc trục z, ray ở giữa): 2 sân ga hai bên, mái cong, vách kính, tháp thang. */
export function metroStation(g) {
  for (const [x, z] of [[-3.6, -6], [3.6, -6], [-3.6, 6], [3.6, 6]]) { g.cyl(x, 0, z, 0.55, 0.55, 6.4, 0x9a968e, 8); g.box(x, 5.8, z, 1.8, 0.6, 1.4, 0x8d887e); }
  g.box(0, 6.4, 0, 9.6, 0.6, 16, 0xc9c5ba);
  for (const s of [-1, 1]) {
    g.box(s * 3.4, 7, 0, 2.8, 0.9, 16, 0xd8d4cc); g.box(s * 2.08, 7.9, 0, 0.18, 0.02, 16, YEL); // sân ga + vạch an toàn
    g.box(s * 4.75, 7.9, 0, 0.1, 2.6, 16, 0x9cc4e4); // vách kính
    for (const z of [-7.6, -2.5, 2.5, 7.6]) g.box(s * 4.6, 7.9, z, 0.22, 3.2, 0.22, STEEL);
    g.box(s * 3.4, 9.3, 0, 0.08, 0.5, 2.4, 0x2c5aa0); // biển tên ga treo
  }
  for (const [dx, a] of [[-3.3, 0.32], [0, 0], [3.3, -0.32]]) g.at(new THREE.Matrix4().makeTranslation(dx, 11.1 + (dx ? -0.5 : 0.05), 0).multiply(new THREE.Matrix4().makeRotationZ(a))).box(0, 0, 0, 3.6, 0.25, 16.6, dx ? 0xeef0f2 : 0x9cc4e4).at(null);
  g.box(6.4, 0, 4, 2.6, 11, 3.2, 0xd9dcd8, true); g.box(6.4, 11, 4, 2.9, 0.25, 3.5, 0x5b6670); g.box(6.4, 9, 5.65, 1.2, 1.2, 0.06, 0x2c5aa0); // tháp thang + chữ M
  g.at(new THREE.Matrix4().makeTranslation(6.4, 3.6, -1.5).multiply(new THREE.Matrix4().makeRotationX(0.62))).box(0, 0, 0, 2.2, 0.35, 9, 0x9a968e).at(null); // cầu thang bộ
  return g;
}

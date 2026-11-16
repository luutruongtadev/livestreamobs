// Phố Mới — mô hình 3D dựng bằng code (không cần file .glb). Mỗi ô = T đơn vị, mặt tiền nhìn về +z.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, T, ZDEF } from './sim.js';

export { T };
const FOUND = 0x8b857a; // móng chìm dưới đất để nhà đứng được trên sườn dốc
const FLOOR = 3, BAY = 2.4;

/** Gom hình hộp / mái / trụ thành một BufferGeometry có màu đỉnh; mặt có cửa sổ dùng UV lặp của texture cửa sổ. */
export class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.m = null; this._col = new THREE.Color(); this._v = new THREE.Vector3(); }
  /** Đặt phép biến đổi cho các hình thêm sau (null = bỏ). */
  at(m) { this.m = m; return this; }
  _push(pt, nrm, col, uv) {
    const v = this._v.set(pt[0], pt[1], pt[2]);
    if (this.m) v.applyMatrix4(this.m);
    this.p.push(v.x, v.y, v.z);
    v.set(nrm[0], nrm[1], nrm[2]);
    if (this.m) v.transformDirection(this.m);
    this.n.push(v.x, v.y, v.z);
    this.c.push(col.r, col.g, col.b);
    this.u.push(uv[0], uv[1]);
  }
  /** Đa giác 3-4 đỉnh; tự đảo chiều quấn cho khớp pháp tuyến. */
  poly(pts, nrm, color, uvs) {
    const col = this._col.set(color);
    const [a, b, c] = pts;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (!nrm) { const l = Math.hypot(gx, gy, gz) || 1; nrm = [gx / l, gy / l, gz / l]; }
    const rn = Array.isArray(nrm[0]) ? nrm[0] : nrm;
    const flip = gx * rn[0] + gy * rn[1] + gz * rn[2] < 0;
    // phép biến đổi có thể lật gương -> coi như không (chỉ dùng xoay / tịnh tiến)
    const base = this.p.length / 3;
    pts.forEach((pt, k) => this._push(pt, Array.isArray(nrm[0]) ? nrm[k] : nrm, col, uvs ? uvs[k] : [0.03, 0.03]));
    const order = pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
    for (let k = 0; k < order.length; k += 3) {
      if (flip) this.i.push(base + order[k], base + order[k + 2], base + order[k + 1]);
      else this.i.push(base + order[k], base + order[k + 1], base + order[k + 2]);
    }
    return this;
  }
  /** Hộp: (cx, cz) là tâm đáy, y là cao độ đáy. win=true thì 4 mặt bên có cửa sổ. */
  box(cx, y, cz, w, h, d, color, win = false, topColor = null) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y + h;
    const uv = (len) => { if (!win) return null; const nu = Math.max(1, Math.round(len / BAY)), nv = Math.max(1, Math.round(h / FLOOR)); return [[0, 0], [nu, 0], [nu, nv], [0, nv]]; };
    this.poly([[x1, y, z1], [x1, y, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], color, uv(d));
    this.poly([[x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], color, uv(d));
    this.poly([[x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], color, uv(w));
    this.poly([[x1, y, z0], [x0, y, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], color, uv(w));
    this.poly([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], topColor ?? color);
    return this;
  }
  /** Mái dốc hai phía; alongX: nóc chạy theo trục x. */
  gable(cx, y, cz, w, h, d, color, alongX = true, endColor = null) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y + h, ec = endColor ?? color;
    if (alongX) {
      this.poly([[x0, y, z1], [x1, y, z1], [x1, y1, cz], [x0, y1, cz]], null, color);
      this.poly([[x1, y, z0], [x0, y, z0], [x0, y1, cz], [x1, y1, cz]], null, color);
      this.poly([[x1, y, z1], [x1, y, z0], [x1, y1, cz]], [1, 0, 0], ec);
      this.poly([[x0, y, z0], [x0, y, z1], [x0, y1, cz]], [-1, 0, 0], ec);
    } else {
      this.poly([[x1, y, z1], [x1, y, z0], [cx, y1, z0], [cx, y1, z1]], null, color);
      this.poly([[x0, y, z0], [x0, y, z1], [cx, y1, z1], [cx, y1, z0]], null, color);
      this.poly([[x0, y, z1], [x1, y, z1], [cx, y1, z1]], [0, 0, 1], ec);
      this.poly([[x1, y, z0], [x0, y, z0], [cx, y1, z0]], [0, 0, -1], ec);
    }
    return this;
  }
  /** Trụ / nón cụt đứng: r0 đáy, r1 đỉnh. */
  cyl(cx, y, cz, r0, r1, h, color, seg = 10, topColor = null) {
    const sl = (r0 - r1) / h;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n0 = [c0, sl, s0], n1 = [c1, sl, s1];
      this.poly([[cx + c1 * r0, y, cz + s1 * r0], [cx + c0 * r0, y, cz + s0 * r0], [cx + c0 * r1, y + h, cz + s0 * r1], [cx + c1 * r1, y + h, cz + s1 * r1]], [n1, n0, n0, n1].map(norm), color);
      if (r1 > 0.01) this.poly([[cx, y + h, cz], [cx + c1 * r1, y + h, cz + s1 * r1], [cx + c0 * r1, y + h, cz + s0 * r1]], [0, 1, 0], topColor ?? color);
    }
    return this;
  }
  /** Cây nhỏ trang trí */
  tree(cx, y, cz, s = 1, color = 0x3f7f3a) {
    this.cyl(cx, y, cz, 0.18 * s, 0.14 * s, 1.2 * s, 0x6b4a2f, 5);
    this.cyl(cx, y + 0.9 * s, cz, 1.25 * s, 0.5 * s, 1.5 * s, color, 7);
    this.cyl(cx, y + 2.2 * s, cz, 0.85 * s, 0, 1.6 * s, color, 7);
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}
function norm(n) { const l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l]; }

/** Texture một ô cửa sổ trên nền tường trắng (nhân với màu đỉnh). */
export function windowTexture() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#dcdcdc'; g.fillRect(0, S - 5, S, 5); // gờ sàn
  const grad = g.createLinearGradient(0, 12, 0, 46);
  grad.addColorStop(0, '#3d5468'); grad.addColorStop(1, '#6f8ea3');
  g.fillStyle = '#c9c9c9'; g.fillRect(13, 11, 38, 38);
  g.fillStyle = grad; g.fillRect(15, 13, 34, 34);
  g.fillStyle = '#c9c9c9'; g.fillRect(31, 13, 2, 34);
  g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(15, 47); g.lineTo(15, 30); g.lineTo(32, 13); g.lineTo(40, 13); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const pick = (r, arr) => arr[(r() * arr.length) | 0];
const WALLS = [0xf0e6d2, 0xe9d8b8, 0xdfe6ea, 0xf4efe6, 0xd9c3a5, 0xe4d0c0];
const ROOFS = [0xa8503a, 0x8e4a3c, 0x5d6672, 0x7a5a48, 0x9c6b3e];
const SIGNS = [0xd9483b, 0x2f7fd0, 0xe6a01e, 0x2aa37a, 0x8a4fd0];

const GLASS = [0x7fa8cc, 0x86b5b0, 0x93a4c4, 0x9db4c0];
const APT = [0xe8e2d6, 0xcfd9e0, 0xe6cdb4, 0xdcd3c4, 0xd6dfd0];

function house(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x6da44b);
  g.box(1.8, 0.14, 2.9, 2.2, 0.03, 3.8, 0xa9a69c); // lối xe
  const wall = pick(r, WALLS), roof = pick(r, ROOFS), alongX = variant !== 1;
  const two = level >= 3, w = 5 + level * 0.35 + r() * 0.6, d = 4.2 + level * 0.2, h = two ? 5.6 : 2.9, cx = -1 + r() * 0.4, cz = -1.2;
  g.box(cx, 0.14, cz, w, h, d, wall, two);
  g.gable(cx, 0.14 + h, cz, w + 0.6, 1.7 + level * 0.12, d + 0.6, roof, alongX, wall);
  g.box(cx - w * 0.2, 0.14, cz + d / 2 + 0.03, 0.9, 2, 0.08, 0x6a4630);
  if (!two) g.box(cx + w * 0.22, 1.2, cz + d / 2 + 0.03, 1.3, 1.1, 0.08, 0x86b4d6);
  g.box(cx + w / 2 - 0.5, h + 0.6, cz - d / 4, 0.5, 1.9, 0.5, 0x8a8078);
  if (level >= 2) g.box(3.4, 0.14, -1.4, 2.3, 2.4, 3.4, wall, false, roof); // nhà xe
  if (level >= 4) { g.box(cx, 0.14, cz + d / 2 + 0.9, w * 0.7, 0.25, 1.8, 0xc9b99a); g.box(cx, 2.9, cz + d / 2 + 0.9, w * 0.7, 0.15, 1.8, 0xd8d4cc); } // hiên
  if (level >= 5) { g.box(-2.6, 0.14, 3.3, 3.4, 0.08, 1.9, 0x5db7e6); g.box(-2.6, 0.14, 3.3, 3.8, 0.05, 2.3, 0xd8d4cc); } // hồ bơi
  else g.tree(-3.6, 0.14, 3.4, 0.8 + r() * 0.3);
  if (r() > 0.4) g.tree(3.7, 0.14, -4, 0.7, 0x4b8c3f);
  g.box(0, 0.14, 4.65, 9.4, 0.5, 0.18, 0x4a8440);
}

function tower(g, r, floors, wall, opt = {}) {
  const { podium = 0, w = 6.8, d = 6.6, glass = false, sign = null, shop = false, green = false, crown = false } = opt;
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xb9b5aa);
  let y = 0.14;
  if (podium) {
    g.box(0, y, 0, 8.7, podium, 8.4, shop ? 0x4f6a80 : 0xcac4b8, !shop);
    if (shop) { g.box(0, y + podium - 0.5, 4.5, 8.7, 0.2, 1, sign); g.box(0, y + podium, 0, 8.9, 0.25, 8.6, 0x77726c); }
    y += podium;
  }
  const h = floors * FLOOR;
  g.box(0, y, -0.2, w, h, d, wall, true);
  if (!glass) { g.box(w / 2 + 0.15, y, -0.2, 0.5, h, 2.2, 0xa4acb2); g.box(-w / 2 - 0.15, y, -0.2, 0.5, h, 2.2, 0xa4acb2); }
  y += h;
  if (glass && floors >= 12) { const h2 = Math.round(floors * 0.25) * FLOOR; g.box(0, y, -0.2, w * 0.72, h2, d * 0.72, wall, true); y += h2; }
  g.box(0, y, -0.2, w * (glass && floors >= 12 ? 0.76 : 1.04), 0.4, d * (glass && floors >= 12 ? 0.76 : 1.04), 0x5f5d5a);
  if (green) { g.box(0, y + 0.4, -0.2, w * 0.7, 0.3, d * 0.6, 0x5a9a44); g.tree(-w * 0.22, y + 0.7, -0.2, 0.6, 0x4f9440); g.tree(w * 0.22, y + 0.7, 0.4, 0.55, 0x58a046); } // vườn trên mái
  else g.box(0.8, y + 0.4, -0.6, 2.2, 1.6, 2, 0x8d9499);
  if (crown) { g.box(0, y + 0.4, -0.2, w * 0.5, 2.6, d * 0.5, 0xd8b93a, false, 0x8a7a3a); g.cyl(0, y + 3, -0.2, 0.12, 0.05, 6, 0xd8d4cc, 4); } // chóp toà tài chính
  if (floors >= 9 && !crown) g.cyl(-1.4, y + 0.4, 0.8, 0.09, 0.05, 3.5 + floors * 0.15, 0x999999, 4);
  if (sign && !shop) g.box(0, y - 1.6, d / 2 - 0.1, w * 0.6, 1.2, 0.25, sign);
  if (!podium) { g.box(0, 0.14, d / 2 - 0.15, 1.6, 2.4, 0.1, 0x4b5b68); g.tree(-3.9, 0.14, 4, 0.75); g.tree(3.9, 0.14, 4, 0.75, 0x4b8c3f); }
}

/** Nhà phố, chung cư thấp tầng (3–6 tầng) có ban công và bồn nước trên mái. */
function midrise(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xbcb8ae);
  const floors = [2, 3, 4, 5, 6][level - 1] + (variant === 2 ? 1 : 0), h = floors * FLOOR, wall = pick(r, WALLS), w = 8, d = 7;
  g.box(0, 0.14, -0.8, w, h, d, wall, true);
  for (let f = 1; f < floors; f++) for (const x of [-2.3, 2.3]) { g.box(x, 0.14 + f * FLOOR, -0.8 + d / 2 + 0.45, 2.8, 0.15, 0.9, 0xd8d4cc); g.box(x, 0.29 + f * FLOOR, -0.8 + d / 2 + 0.88, 2.8, 0.75, 0.06, 0x6f7a82); }
  g.box(0, 0.14 + h, -0.8, w + 0.3, 0.35, d + 0.3, 0x77726c);
  g.cyl(-2.2, 0.49 + h, -2.2, 0.7, 0.7, 1.4, 0xd8dde0, 10); g.cyl(2.4, 0.49 + h, -2.6, 0.55, 0.55, 1.2, 0x3f79ad, 10); // bồn nước
  g.box(0, 0.14, -0.8 + d / 2 + 0.05, 1.6, 2.4, 0.1, 0x4b5b68);
  g.tree(-3.9, 0.14, 4, 0.7); g.box(3.4, 0.14, 4, 1.6, 0.5, 0.6, 0x5c7b4a);
}

/** Dãy 3 nhà ống chung tường, mặt tiền hẹp, tầng trệt cửa cuốn, mỗi căn cao một kiểu. */
function rowhouses(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xb9b5aa);
  for (let k = 0; k < 3; k++) {
    const x = -3.15 + k * 3.15, fl = 1 + Math.max(1, Math.round(level * 0.8 + r() * 1.4)), h = fl * FLOOR, wall = pick(r, [0xf0e6d2, 0xf3d9a4, 0xd9e8d4, 0xe8d0d8, 0xd4e0ec, 0xf4efe6]);
    g.box(x, 0.14, -0.6, 3.1, h, 7.4, wall, true);
    g.box(x, 0.14, 3.15, 2.5, 2.4, 0.08, pick(r, [0x8a949c, 0x6f7a82, 0xa3633f])); // cửa cuốn
    for (let f = 1; f < fl; f++) { g.box(x, 0.14 + f * FLOOR, 3.55, 2.9, 0.12, 0.8, 0xd8d4cc); g.box(x, 0.26 + f * FLOOR, 3.92, 2.9, 0.7, 0.05, 0x5b6670); }
    if (variant === 1 && k === 1) g.gable(x, 0.14 + h, -0.6, 3.2, 1.2, 7.6, pick(r, ROOFS), false, wall);
    else { g.box(x, 0.14 + h, -0.6, 3.2, 0.3, 7.5, 0x77726c); if (r() > 0.4) g.cyl(x, 0.44 + h, -2.6, 0.45, 0.45, 1, 0xd8dde0, 8); }
    if (r() > 0.5) g.box(x, 0.14, 4.4, 0.7, 0.7, 0.7, 0x5c7b4a); // chậu cây trước nhà
  }
}

/** Nhà dưỡng lão: hai dãy thấp tầng hình chữ L, mái ngói, vườn có ghế đá. */
function seniorHome(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x6da44b);
  const fl = level >= 4 ? 3 : level >= 2 ? 2 : 1, h = fl * FLOOR, wall = pick(r, [0xf4efe6, 0xefe2cf, 0xe9eef0]), roof = pick(r, [0x8e4a3c, 0x7a5a48, 0x5d6672]);
  g.box(-1.6, 0.14, -2.6, 6.4, h, 4.2, wall, true); g.gable(-1.6, 0.14 + h, -2.6, 6.9, 1.4, 4.7, roof, true, wall);
  g.box(3, 0.14, -0.6, 3.4, h, 8, wall, true); g.gable(3, 0.14 + h, -0.6, 3.9, 1.4, 8.5, roof, false, wall);
  g.box(-1.6, 0.14, -0.3, 3, 0.25, 1.2, 0xc9b99a); g.box(-1.6, 2.6, -0.3, 3, 0.12, 1.2, 0xd8d4cc); // hiên
  for (const x of [-3.6, -1]) g.box(x, 0.14, 2.8, 1.4, 0.45, 0.5, 0x8a5a36); // ghế đá
  g.tree(-3.8, 0.14, 4, 0.9, 0x4f9440); g.tree(0.6, 0.14, 4, 0.8);
  g.cyl(-2.2, 0.14, 1.4, 0.9, 0.9, 0.3, 0xb9b3a8, 10, 0x69b4e0); // bể cá nhỏ
  if (variant) g.box(3, 0.14, 4.2, 3, 0.04, 1.2, 0xe2557a);
}

/** Ký túc xá: khối nhà dài nhiều tầng có dải màu, sân để xe đạp. */
function dorm(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xc9c2ae);
  const floors = [3, 4, 6, 8, 10][level - 1] + (variant === 2 ? 1 : 0), h = floors * FLOOR, accent = pick(r, [0xe07b2e, 0x2f7fd0, 0x2aa37a, 0xd9483b]);
  g.box(0, 0.14, -1.4, 8.6, h, 5.6, pick(r, [0xe6e1d6, 0xdfe6ea, 0xefe6d6]), true);
  for (let f = 1; f <= floors; f += 2) g.box(0, 0.14 + f * FLOOR - 0.2, -1.4 + 2.82, 8.62, 0.4, 0.06, accent);
  g.box(-3.6, 0.14, -1.4, 1.4, h + 1.4, 1.4, accent, false, 0x5b5552); // cầu thang
  g.box(0, 0.14 + h, -1.4, 8.8, 0.35, 5.8, 0x77726c);
  for (let k = 0; k < 6; k++) { const x = -3 + k * 1.2; g.box(x, 0.3, 3.3, 0.08, 0.7, 1.4, [0x2d3640, 0xc0392b, 0x2f6fb0][k % 3]); } // xe đạp
  g.box(0, 0.14, 3.3, 7.6, 0.06, 2, 0x8d8a84); g.box(0, 1.6, 3.3, 7.6, 0.1, 2.2, 0xd8d4cc);
  g.tree(4, 0.14, 4.2, 0.7);
}

/** Ăn uống, giải trí: quán có mái hiên và bàn ô ngoài trời; cấp cao có rạp phim biển đèn. */
function leisure(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xc2b59a);
  const wall = pick(r, [0xf3d9a4, 0xe8b7a8, 0xf0e6d2, 0xd9c3e8]), sign = pick(r, SIGNS);
  if (level >= 3 && variant !== 1) { // rạp phim / khu vui chơi
    const h = 5 + level * 1.4;
    g.box(0, 0.14, -1.6, 8.6, h, 6, 0x8a7fb0, false, 0x4a4560);
    g.box(0, h * 0.55, 1.45, 8.8, 1.6, 0.4, sign); g.box(0, h * 0.55 + 1.6, 1.45, 6, 0.8, 0.3, 0xfdf6c8);
    g.box(0, 0.14, 1.5, 4, 3, 0.1, 0x9cc4e4);
  } else {
    const fl = Math.min(3, level), h = fl * FLOOR;
    g.box(0, 0.14, -1.8, 8, h, 5.2, wall, fl > 1);
    g.box(0, 0.14 + h, -1.8, 8.2, 0.3, 5.4, 0x77726c);
    g.at(new THREE.Matrix4().makeTranslation(0, 2.6, 1.3).multiply(new THREE.Matrix4().makeRotationX(0.35))).box(0, 0, 0, 8, 0.12, 1.8, sign).at(null); // mái hiên
    g.box(0, h - 0.6, 0.83, 4.5, 0.9, 0.2, sign);
  }
  for (let k = 0; k < 3; k++) { const x = -3 + k * 3; g.cyl(x, 0.14, 3.6, 0.5, 0.5, 0.75, 0xe9e4da, 8); g.cyl(x, 0.14, 3.6, 0.05, 0.05, 2.2, 0x6f7a82, 4); g.cyl(x, 2.1, 3.6, 1.4, 0.05, 0.6, [0xd9483b, 0xe6a01e, 0x2aa37a][(k + variant) % 3], 8); } // ô dù
  if (level >= 2) for (const x of [-4.3, 4.3]) g.cyl(x, 0.14, 4.4, 0.06, 0.06, 2.6, 0x333333, 4); // cột đèn lồng
}

function shop(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xbcb8ae);
  const sign = pick(r, SIGNS), wall = pick(r, WALLS), w = 7.4 + r() * 0.8, d = 6.2 + level * 0.15, base = 3.8 + (variant === 2 ? 0.4 : 0);
  g.box(0, 0.14, -1, w, base, d, level >= 2 ? 0x4f6a80 : wall);
  g.box(0, 0.5, d / 2 - 0.95, w - 1.2, 2.3, 0.08, 0x54748c);
  g.box(0, 2.95, d / 2 - 0.3, w, 0.18, 1.5, sign);
  let y = 0.14 + base;
  if (level >= 2) { const h = (level - 1) * FLOOR; g.box(0, y, -1, w, h, d, wall, true); y += h; }
  g.box(0, y, -1, w + 0.2, 0.3, d + 0.2, 0x77726c);
  g.box(0, y + 0.3, d / 2 - 1.5, w * 0.6, 1 + level * 0.12, 0.25, sign);
  if (level >= 3) g.box(-2, y + 0.3, -2.2, 2, 1.2, 1.8, 0x8d9499);
  g.box(3.5, 0.14, 3.9, 0.9, 0.9, 0.9, 0x5c7b4a);
}

function industry(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x9c9a92);
  if (variant === 0) { // khai thác nguyên liệu: kho + si-lô + đống hàng
    const metal = pick(r, [0xa9b3b8, 0xb9a98c, 0x97a9b5]);
    g.box(-1.4, 0.14, -1.6, 6, 3.2 + level * 0.3, 5.4, metal);
    g.gable(-1.4, 3.34 + level * 0.3, -1.6, 6.2, 1, 5.6, pick(r, [0x6c7a86, 0x8a5a44, 0x5f7f6a]), true, metal);
    for (let k = 0; k < Math.min(3, 1 + (level >> 1)); k++) { g.cyl(3.4, 0.14, -3.2 + k * 2.4, 1, 1, 4 + level * 0.5, 0xc8ccd0, 9); g.cyl(3.4, 4.14 + level * 0.5, -3.2 + k * 2.4, 1, 0.1, 0.8, 0xa8adb2, 9); }
    for (let k = 0; k < 2 + level; k++) g.box(-3.6 + (k % 4) * 1.5, 0.14 + ((k / 4) | 0) * 0.9, 3.4, 1.2, 0.9, 1.2, [0xb38a4f, 0xa07a42, 0x8f6a3a][k % 3]);
    g.box(-1.4, 0.14, 1.13, 2.4, 2.6, 0.08, 0x5a646c);
    return;
  }
  if (level >= 5) { // công nghệ cao
    g.box(0, 0.14, -0.6, 8.2, 6.4, 7, 0xeef1f3, true);
    g.box(0, 2.6, -0.6, 8.3, 0.7, 7.1, pick(r, [0x2f7fd0, 0x2aa37a, 0xe07b2e]));
    g.box(0, 6.54, -0.6, 8.4, 0.3, 7.2, 0x8a949c);
    g.cyl(-2.2, 6.84, -1.4, 1.1, 1.4, 0.7, 0xd9dde0, 10); g.box(2, 6.84, -0.6, 2.6, 1, 2, 0x9aa3aa);
    for (let k = 0; k < 3; k++) g.at(new THREE.Matrix4().makeTranslation(-2.6 + k * 2.6, 0.5, 3.9).multiply(new THREE.Matrix4().makeRotationX(-0.5))).box(0, 0, 0, 2.2, 0.1, 1.4, 0x27457a).at(null);
    return;
  }
  const brick = pick(r, [0xa5694d, 0x97715c, 0x8b8f93, 0xa9b3b8]), h = 3.6 + level * 0.9;
  g.box(-0.5, 0.14, -0.6, 8.2, h, 6.8, brick, level >= 4);
  if (level >= 2) for (let k = 0; k < 3; k++) g.gable(-0.5, 0.14 + h, -2.87 + k * 2.27, 8.2, 1.2, 2.27, 0x6f7a82, true, brick);
  else g.gable(-0.5, 0.14 + h, -0.6, 8.4, 1, 7, 0x6c7a86, variant !== 1, brick);
  g.box(-0.5, 0.14, 2.83, 3, 3, 0.08, 0x4f5a62);
  if (level >= 2) { const cx = variant === 1 ? -3.7 : 3.8; g.cyl(cx, 0.14, 3.7, 0.7, 0.5, 9 + level * 1.6, 0x9b6a55, 9, 0x2b2b2b); g.cyl(cx, 7.5 + level * 1.6, 3.7, 0.58, 0.55, 0.9, 0xe8e2d8, 9); }
  if (level >= 3) g.cyl(variant === 1 ? 3.6 : -3.6, 0.14, 3.7, 0.9, 0.9, 2.6 + level * 0.3, 0xc8ccd0, 9);
  if (level >= 4) g.box(3.9, 0.14, -3.6, 1.2, 4 + h, 1.2, 0x8a949c);
}

const rotY = (x, y, z, a) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(a));

/** Khu chuyên biệt: 8 nông trại, 9 lâm trường, 10 mỏ, 11 giếng dầu, 12 bến cá. */
function resource(g, r, zone, level, variant) {
  if (zone === 8) {
    g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x8a7446);
    const crop = [0x7fb23a, 0xcdb640, 0x5f9a3a][variant], rows = variant === 1 ? 7 : 6;
    for (let k = 0; k < rows; k++) g.box(-4 + (k * 8) / (rows - 1), 0.14, 1.7, 0.75, 0.3 + level * 0.07, 5.4, crop);
    const bw = 3 + level * 0.3;
    g.box(-2.5, 0.14, -3.2, bw, 2.3, 2.6, 0xb5483a); g.gable(-2.5, 2.44, -3.2, bw + 0.4, 1.2, 3, 0x6a4a3c, true, 0xb5483a);
    g.box(-2.5, 0.14, -1.87, 1.2, 1.7, 0.06, 0xe9e4da);
    if (level >= 2) { g.cyl(2.7, 0.14, -3.3, 0.85, 0.85, 2.6 + level * 0.5, 0xd8d4cc, 9); g.cyl(2.7, 2.74 + level * 0.5, -3.3, 0.85, 0.1, 0.7, 0xa8adb2, 9); }
    if (level >= 4) g.box(0.6, 0.14, -3.3, 1.8, 1.5, 2.4, 0xbfe3e8, false, 0xe8f4f6); // nhà kính
    return;
  }
  if (zone === 9) {
    g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x6f8a4a);
    g.box(-1.6, 0.14, -2.6, 4.6 + level * 0.3, 2.6, 3.6, 0x9c7a52); g.gable(-1.6, 2.74, -2.6, 5 + level * 0.3, 1.1, 4, 0x5f6a4a, true, 0x9c7a52);
    for (let k = 0; k < 2 + level; k++) { // đống gỗ tròn
      const x = -3.4 + (k % 3) * 2.6, y = 0.5 + ((k / 3) | 0) * 0.75;
      g.at(rotY(x, y, 2.9, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))).cyl(0, -1.6, 0, 0.36, 0.36, 3.2, 0x8a5a36, 6, 0xd9b98a).at(null);
    }
    g.tree(3.6, 0.14, -3.4, 1); if (variant) g.tree(3.8, 0.14, 0.2, 0.8, 0x4b8c3f);
    if (level >= 3) g.box(3.4, 0.14, 3.2, 1.6, 1.4, 2.6, 0xd8b93a); // xe nâng
    return;
  }
  if (zone === 10) {
    g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x7d7a72);
    const hh = 6 + level * 0.9;
    for (const [x, z] of [[-3.4, -3.4], [-1.2, -3.4], [-3.4, -1.2], [-1.2, -1.2]]) g.box(x, 0.14, z, 0.28, hh, 0.28, 0x5b6670); // tháp giếng mỏ
    g.box(-2.3, hh * 0.5, -2.3, 2.5, 0.2, 2.5, 0x5b6670); g.box(-2.3, hh, -2.3, 2.8, 0.9, 2.8, 0xc0392b, false, 0x5b6670);
    g.box(1.9, 0.14, -2.6, 3.6, 2.6 + level * 0.25, 3.2, 0x9aa3aa, level >= 3);
    g.at(new THREE.Matrix4().makeTranslation(0.2, 1.6, 0.4).multiply(new THREE.Matrix4().makeRotationX(0.42))).box(0, 0, 0, 0.9, 0.25, 5.4, 0x4a4d52).at(null); // băng tải
    for (let k = 0; k < 1 + ((level + 1) >> 1); k++) g.cyl(-3 + k * 2.9, 0.14, 3.1, 1.5, 0.15, 1.5 + (k % 2) * 0.5, [0x55504a, 0x8a6a4a, 0x6d6d78][(k + variant) % 3], 7);
    return;
  }
  if (zone === 11) {
    g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x8a826e);
    g.box(-2.4, 0.14, 1.6, 1.4, 0.5, 4, 0x4a4d52); g.box(-2.4, 0.64, 1.9, 0.5, 2.6, 0.5, 0xc0392b); // cần bơm dầu
    g.at(new THREE.Matrix4().makeTranslation(-2.4, 3.2, 1.9).multiply(new THREE.Matrix4().makeRotationX(variant ? 0.22 : -0.18))).box(0, 0, 0, 0.4, 0.4, 4.6, 0xd8b93a).box(0, -0.7, 2.3, 0.7, 1.1, 0.7, 0xd8b93a).at(null);
    g.box(-2.4, 0.64, 0.2, 0.9, 1, 1.2, 0x39454f);
    for (let k = 0; k < Math.min(4, 1 + level); k++) { const x = 1.3 + (k % 2) * 2.7, z = -3 + ((k / 2) | 0) * 2.9; g.cyl(x, 0.14, z, 1.2, 1.2, 2.2 + level * 0.3, 0xdfe3e6, 12, 0xb9bec2); g.box(x, 1.2, z + 1.21, 0.5, 0.5, 0.04, 0xd0342c); }
    if (level >= 4) { g.cyl(-3.6, 0.14, -3.4, 0.25, 0.2, 8, 0x8a949c, 6); g.cyl(-3.6, 8.14, -3.4, 0.5, 0.05, 1, 0xff8a1e, 6); } // đuốc đốt khí
    g.box(2.6, 0.5, 3, 3.6, 0.25, 0.25, 0x6f7a82);
    return;
  }
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xcdbd8c);
  g.box(0, 0.3, 2.4, 8.6, 0.16, 3.6, 0x9c7a52); // cầu gỗ
  for (let k = 0; k < 5; k++) g.box(-3.9 + k * 1.95, 0.14, 2.4, 0.22, 0.4, 3.6, 0x6a4a30);
  const hw = 3.2 + level * 0.35;
  g.box(-2.2, 0.14, -2.6, hw, 2.4, 3, [0x5d9bd0, 0xe9d8b8, 0x2aa37a][variant]); g.gable(-2.2, 2.54, -2.6, hw + 0.5, 1.2, 3.4, 0x8e4a3c, true, 0xf4efe6);
  for (let k = 0; k < Math.min(3, 1 + (level >> 1)); k++) { // thuyền kéo lên bờ
    g.at(rotY(-2.6 + k * 2.6, 0.46, 2.4, 0.15 * (k - 1))).box(0, 0, 0, 1.1, 0.5, 2.9, [0x2f6fb0, 0xc0392b, 0x3d8a5a][(k + variant) % 3]).box(0, 0.5, -0.5, 0.7, 0.6, 0.9, 0xf2f2f2).at(null);
  }
  for (let k = 0; k < 1 + (level >> 1); k++) { g.box(2.4 + k * 0.9, 0.14, -3.4, 0.1, 1.5, 0.1, 0x6a4a30); g.box(2.4 + k * 0.9, 0.14, -1.8, 0.1, 1.5, 0.1, 0x6a4a30); g.box(2.4 + k * 0.9, 1.55, -2.6, 0.08, 0.08, 1.7, 0x6a4a30); g.box(2.4 + k * 0.9, 1.05, -2.6, 0.05, 0.5, 1.4, 0xd9dde0); } // giàn phơi
  if (level >= 4) g.box(3.2, 0.14, 0.2, 2, 1.8, 1.8, 0xe6e9ec, false, 0x2c5aa0); // kho lạnh
}

/** Nhà tự mọc theo khu (1..12), cấp 1..5, biến thể 0..2. */
export function growable(zone, level, variant) {
  const r = mulberry32(zone * 1000 + level * 100 + variant * 7 + 5);
  const g = new GB();
  g.box(0, -6, 0, 9.7, 6, 9.7, FOUND);
  const v = variant + ((r() * 2) | 0);
  if (ZDEF[zone].raw) { resource(g, r, zone, level, variant); return g.build(); }
  if (zone === 1) house(g, r, level, variant);
  else if (zone === 13) midrise(g, r, level, variant);
  else if (zone === 14) rowhouses(g, r, level, variant);
  else if (zone === 15) seniorHome(g, r, level, variant);
  else if (zone === 16) dorm(g, r, level, variant);
  else if (zone === 17) leisure(g, r, level, variant);
  else if (zone === 18) tower(g, r, [3, 5, 8, 12, 17][level - 1] + v, pick(r, [0x8fd0c8, 0x9fc4e8, 0xa6d7b4]), { glass: true, podium: level >= 3 ? 4.2 : 0, w: 7.2, d: 7, sign: pick(r, [0x2aa37a, 0x2f7fd0, 0x8a4fd0]), green: true });
  else if (zone === 19) tower(g, r, [5, 9, 15, 24, 36][level - 1] + v * 2, pick(r, [0x7f97b2, 0x8aa0b8, 0x7590ab]), { glass: true, podium: 4.8, w: 7.4, d: 7.2, sign: 0xd8b93a, crown: level >= 3 });
  else if (zone === 4) tower(g, r, [4, 7, 11, 16, 24][level - 1] + v, pick(r, APT), { podium: level >= 3 ? 4 : 0 });
  else if (zone === 2) shop(g, r, level, variant);
  else if (zone === 5) tower(g, r, [2, 4, 7, 11, 17][level - 1] + v, pick(r, [0xdcd3c4, 0xc8d2d8, 0xe2c9a8, 0x9fb6c8]), { podium: 4.4, shop: true, sign: pick(r, SIGNS), w: 7.6, d: 7 });
  else if (zone === 3) industry(g, r, level, variant);
  else if (zone === 6) tower(g, r, [4, 8, 14, 22, 34][level - 1] + v * 2, pick(r, GLASS), { glass: true, podium: level >= 2 ? 4.6 : 0, w: 7, d: 7, sign: level >= 3 ? pick(r, SIGNS) : null });
  else tower(g, r, [2, 4, 6, 9, 13][level - 1] + v, pick(r, APT), { podium: 4, shop: true, sign: pick(r, SIGNS), w: 6.6, d: 6.4 });
  return g.build();
}

/** Cây rừng (2 kiểu) */
export function treeGeometry(kind) {
  const g = new GB();
  if (kind === 0) {
    g.cyl(0, 0, 0, 0.28, 0.2, 1.8, 0x6b4a2f, 5);
    g.cyl(0, 1.3, 0, 1.9, 0.9, 2, 0x3c7a38, 7);
    g.cyl(0, 3, 0, 1.4, 0.5, 1.8, 0x43853c, 7);
    g.cyl(0, 4.5, 0, 0.9, 0, 1.9, 0x4c9142, 7);
  } else {
    g.cyl(0, 0, 0, 0.3, 0.22, 2.4, 0x70543a, 5);
    g.cyl(0, 2, 0, 1.6, 2.3, 1.4, 0x4f9440, 8);
    g.cyl(0, 3.4, 0, 2.3, 1.9, 1.1, 0x58a046, 8);
    g.cyl(0, 4.5, 0, 1.9, 0.5, 1.3, 0x62aa4c, 8);
  }
  return g.build();
}

/** Xe to dùng chung cho xe tải, xe rác, cứu thương, cứu hoả (màu nhân theo từng xe). */
export function truckGeometry() {
  const g = new GB();
  g.box(0, 0.35, -0.6, 2, 2.1, 3.9, 0xffffff);
  g.box(0, 0.35, 2, 1.9, 1.5, 1.4, 0xffffff);
  g.box(0, 1.2, 2.71, 1.6, 0.6, 0.04, 0x39454f);
  g.box(0, 0.1, 0, 1.8, 0.3, 5.2, 0x2a2a2a);
  g.box(0, 1.9, 2, 0.9, 0.18, 0.4, 0x6fa8ff);
  return g.build();
}

export function busGeometry() {
  const g = new GB();
  g.box(0, 0.4, 0, 2.2, 2.3, 7.2, 0xffffff);
  g.box(0, 1.35, 0, 2.26, 0.85, 6.6, 0x2f3b45);
  g.box(0, 1.2, 3.61, 1.9, 1, 0.04, 0x2f3b45);
  g.box(0, 0.12, 0, 2, 0.3, 6.8, 0x2a2a2a);
  g.box(0, 2.7, 0, 1.6, 0.14, 5, 0xe9e9e9);
  return g.build();
}

/** Tàu điện hai toa có khớp nối. */
export function tramGeometry() {
  const g = new GB();
  for (const z of [-3.3, 3.3]) { g.box(0, 0.35, z, 2.4, 2.5, 6.4, 0xffffff); g.box(0, 1.3, z, 2.46, 0.9, 5.8, 0x2f3b45); g.box(0, 2.85, z, 1.4, 0.2, 4, 0xd8dde0); }
  g.box(0, 0.35, 0, 2.2, 2.4, 0.4, 0x39454f);
  g.box(0, 2.85, -1.5, 0.08, 0.9, 0.08, 0x333333); g.box(0, 3.75, -1.5, 1.4, 0.06, 0.08, 0x333333); // cần lấy điện
  return g.build();
}

/** Trạm chờ xe buýt / tàu điện (mặt quay về +z) và ga metro trên cao. */
export function stopGeometry(mode) {
  const g = new GB();
  if (mode === 'tram') {
    g.box(0, 0, 0, 7, 0.3, 1.8, 0xc9c5ba);
    for (const x of [-3, 3]) g.box(x, 0.3, -0.5, 0.15, 2.6, 0.15, 0x5b6670);
    g.box(0, 2.9, -0.2, 7.2, 0.15, 1.8, 0x3d8a5a); g.box(0, 0.3, -0.8, 6.4, 2.6, 0.06, 0x9cc4e4);
    g.box(2.6, 2.2, 0.6, 1.2, 0.5, 0.08, 0xe6a01e);
  } else if (mode === 'bus') {
    g.box(0, 0, 0, 3.2, 0.12, 1.4, 0xb9b5aa);
    g.box(-1.5, 0.12, -0.5, 0.12, 2.3, 0.12, 0x5b6670); g.box(1.5, 0.12, -0.5, 0.12, 2.3, 0.12, 0x5b6670);
    g.box(0, 2.42, -0.2, 3.4, 0.12, 1.4, 0xffffff); g.box(0, 0.12, -0.55, 3, 2.3, 0.06, 0x9cc4e4);
    g.box(0, 0.5, 0, 2.4, 0.1, 0.4, 0x8a5a36);
  } else {
    for (const [x, z] of [[-3, -5], [3, -5], [-3, 5], [3, 5]]) g.cyl(x, 0, z, 0.5, 0.5, 6.4, 0x9a968e, 8);
    g.box(0, 6.4, 0, 8, 0.6, 14, 0xc9c5ba);
    g.box(0, 9.4, 0, 8.4, 0.3, 14.4, 0xffffff);
    for (const z of [-6.5, 0, 6.5]) { g.box(-3.9, 7, z, 0.25, 2.4, 0.25, 0x5b6670); g.box(3.9, 7, z, 0.25, 2.4, 0.25, 0x5b6670); }
    g.box(4.6, 0, 3, 1.4, 6.6, 3, 0x8d9499, true);
  }
  return g.build();
}

/** Xe máy có người ngồi (màu nhân theo từng xe). */
export function motoGeometry() {
  const g = new GB();
  g.box(0, 0.25, 0, 0.45, 0.5, 1.7, 0xffffff);
  g.box(0, 0, 0.75, 0.16, 0.5, 0.5, 0x222222); g.box(0, 0, -0.75, 0.16, 0.5, 0.5, 0x222222);
  g.box(0, 0.75, -0.15, 0.5, 0.75, 0.4, 0x4a5560); // người lái
  g.cyl(0, 1.5, -0.1, 0.22, 0.2, 0.34, 0xf0d9b5, 6, 0x333333);
  g.box(0, 0.85, 0.6, 0.7, 0.08, 0.08, 0x222222);
  return g.build();
}

/** Người đi bộ (áo nhân màu theo từng người). */
export function pedGeometry() {
  const g = new GB();
  g.box(0, 0, 0, 0.42, 0.8, 0.3, 0x3a4350);
  g.box(0, 0.8, 0, 0.5, 0.75, 0.32, 0xffffff);
  g.cyl(0, 1.55, 0, 0.2, 0.18, 0.34, 0xf0d9b5, 6, 0x3b2a1e);
  return g.build();
}

export function carGeometry() {
  const g = new GB();
  g.box(0, 0.25, 0, 1.5, 0.6, 3.4, 0xffffff);
  g.box(0, 0.85, -0.2, 1.36, 0.55, 1.8, 0x39454f);
  g.box(0, 0.85, -0.2, 1.4, 0.5, 1.2, 0xffffff);
  g.box(0, 0.45, 1.71, 1.3, 0.2, 0.04, 0xfff3b0);
  g.box(0, 0.45, -1.71, 1.3, 0.2, 0.04, 0xc0392b);
  return g.build();
}

/** Công trình đặt tay. Trả về { geometry, spin?: [{geometry, pos:[x,y,z]}] } — gốc ở tâm khối đất, mặt tiền về +z. */
export function serviceModel(type, size) {
  const g = new GB(), S = size * T, e = S - 0.3;
  const out = {};
  const pave = (c) => g.box(0, 0, 0, e, 0.14, e, c);
  g.box(0, -7, 0, e, 7, e, FOUND);
  switch (type) {
    case 'wind': {
      pave(0x76a852);
      g.cyl(0, 0.14, 0, 1.1, 0.9, 0.6, 0xb8bcc0, 10);
      g.cyl(0, 0.7, 0, 0.5, 0.28, 21, 0xf2f4f5, 10);
      g.box(0, 21.4, 0.3, 0.9, 0.9, 2.6, 0xf2f4f5);
      const b = new GB();
      b.cyl(0, 0, 0, 0.45, 0.2, 0.7, 0xdfe3e6, 8);
      for (let k = 0; k < 3; k++) b.at(new THREE.Matrix4().makeRotationY((k * Math.PI * 2) / 3)).box(0, 0.25, 4.3, 0.75, 0.12, 8.2, 0xf7f8f9).at(null);
      const geo = b.build(); geo.rotateX(Math.PI / 2); // trục quay về +z
      out.spin = [{ geometry: geo, pos: [0, 21.85, 1.6] }];
      break;
    }
    case 'solar': {
      pave(0x87a060);
      for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 5; iz++) {
        const x = -6.9 + ix * 4.6, z = -7.4 + iz * 3.4;
        g.box(x, 0.14, z, 0.2, 0.9, 0.2, 0x8a8f94);
        g.at(new THREE.Matrix4().makeTranslation(x, 1.1, z).multiply(new THREE.Matrix4().makeRotationX(0.45))).box(0, 0, 0, 4, 0.12, 2.5, 0x1f3f78, false, 0x2b55a0).at(null);
      }
      g.box(7.6, 0.14, 8, 2.4, 2.4, 2.4, 0xd8d4cc, false, 0x77726c);
      break;
    }
    case 'coal': {
      pave(0x8f8d86);
      g.box(-5, 0.14, -4, 14, 9, 12, 0x9b938a, true);
      g.box(-5, 9.14, -4, 14.4, 0.5, 12.4, 0x5f5b57);
      g.box(-5, 9.6, -7, 8, 4, 5, 0x847d75);
      g.cyl(8, 0.14, -8, 4.6, 2.9, 15, 0xd4d0c8, 16, 0x3a3a3a);
      g.cyl(8.5, 0.14, 3, 4.6, 2.9, 15, 0xd4d0c8, 16, 0x3a3a3a);
      g.cyl(-10, 0.14, 8, 1.1, 0.8, 26, 0xa35f4a, 10, 0x222222);
      g.cyl(-10, 22, 8, 0.95, 0.92, 1.6, 0xeeeeee, 10);
      g.cyl(-6.5, 0.14, 8.5, 1, 0.75, 22, 0xa35f4a, 10, 0x222222);
      g.cyl(0, 0.14, 10, 3.2, 0.2, 2.6, 0x26262a, 10); g.cyl(5, 0.14, 11, 2.4, 0.2, 2, 0x26262a, 10); // đống than
      out.smoke = [[8, 15.5, -8], [8.5, 15.5, 3], [-10, 26.5, 8]];
      break;
    }
    case 'tower': {
      pave(0x76a852);
      for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) g.cyl(x, 0.14, z, 0.22, 0.22, 11, 0x9aa3aa, 6);
      g.cyl(0, 0.14, 0, 0.5, 0.5, 11, 0x8a949c, 8);
      g.cyl(0, 10.5, 0, 2.2, 3.4, 1.4, 0x5d9bd0, 14);
      g.cyl(0, 11.9, 0, 3.4, 3.4, 3.2, 0x6aa9dd, 14);
      g.cyl(0, 15.1, 0, 3.4, 0.4, 1.3, 0x4c88bd, 14);
      break;
    }
    case 'pump': {
      pave(0x9c9a92);
      g.box(-3.5, 0.14, -3, 9, 4.6, 8, 0xd6dde2, true);
      g.box(-3.5, 4.74, -3, 9.4, 0.4, 8.4, 0x3f79ad);
      g.cyl(5.5, 0.14, -4.5, 2.6, 2.6, 3.6, 0x5d9bd0, 14, 0x7fb6e2);
      g.cyl(5.5, 0.14, 4, 2.6, 2.6, 3.6, 0x5d9bd0, 14, 0x7fb6e2);
      g.box(5.5, 1, -0.2, 0.7, 0.7, 6, 0x4c88bd);
      g.box(1.5, 1, 4, 6, 0.7, 0.7, 0x4c88bd);
      break;
    }
    case 'outlet': {
      pave(0x9c9a92);
      g.box(0, 0.14, -1, 5, 2.6, 4, 0xb9b3a8, false, 0x6e6a66);
      g.cyl(0, 0.9, 2.6, 1.1, 1.1, 0.01, 0x2b2b2b, 10);
      g.at(new THREE.Matrix4().makeTranslation(0, 1.2, 1).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))).cyl(0, 0, 0, 1.2, 1.2, 3.6, 0x7d868c, 12, 0x3a3f33).at(null);
      g.box(-3.2, 0.14, 2.5, 1, 1.6, 1, 0x4c88bd);
      break;
    }
    case 'treat': {
      pave(0x9c9a92);
      g.box(-5, 0.14, -5, 8, 4.4, 7, 0xdfe4e6, true); g.box(-5, 4.54, -5, 8.3, 0.4, 7.3, 0x3f8f6a);
      for (const [x, z] of [[4.5, -4.5], [4.5, 4], [-4.5, 4.5]]) { g.cyl(x, 0.14, z, 3.6, 3.6, 1.3, 0xb9b3a8, 16, 0x4f7f72); g.box(x, 1.5, z, 7, 0.2, 0.5, 0x8a949c); }
      break;
    }
    case 'landfill': {
      g.box(0, 0, 0, e, 0.14, e, 0x8a7a5c);
      const rr = mulberry32(31);
      for (let k = 0; k < 9; k++) g.cyl(-9 + rr() * 16, 0.14, -9 + rr() * 14, 3 + rr() * 3, 0.6, 1.5 + rr() * 3, [0x6d6552, 0x7b6f58, 0x5e5a4c][k % 3], 7);
      for (let k = 0; k < 26; k++) g.box(-12 + rr() * 24, 0.2 + rr() * 2, -12 + rr() * 22, 0.9, 0.5, 0.7, [0xd9d4c8, 0x4c88bd, 0xc0392b, 0x2b2b2b, 0xe6a01e][k % 5]);
      g.box(10, 0.14, 11.5, 6, 3, 4, 0xb9b3a8, false, 0x6e6a66);
      g.box(3, 0.34, 12, 2, 1.6, 4.4, 0x3d8a5a); g.box(3, 1.0, 13.6, 1.8, 1.2, 1.4, 0xe9e9e9);
      for (const a of [0, 1, 2, 3]) g.at(new THREE.Matrix4().makeRotationY(a * Math.PI / 2)).box(0, 0.14, 14.4, e, 1.6, 0.2, 0x7d868c).at(null);
      break;
    }
    case 'incinerator': {
      pave(0x9c9a92);
      g.box(-2, 0.14, -2, 13, 8, 12, 0xc9cdd0, true); g.box(-2, 8.14, -2, 13.4, 0.5, 12.4, 0xd66a2c);
      g.box(-2, 0.14, 5, 6, 4, 3, 0x8a949c);
      g.cyl(7, 0.14, 6.5, 1.3, 0.9, 22, 0xd9dde0, 12, 0x2b2b2b); g.cyl(7, 19, 6.5, 1.05, 1, 1.4, 0xd0342c, 12);
      out.smoke = [[7, 22.5, 6.5]];
      break;
    }
    case 'highschool': {
      pave(0xc9c2ae);
      g.box(0, 0.14, -4.5, 16, 9.5, 7, 0xc9d3da, true); g.box(0, 9.64, -4.5, 16.4, 0.4, 7.4, 0x5b6670);
      g.box(-5.5, 0.14, 3, 5, 6.5, 8, 0xd9c7a0, true, 0x8a7f70);
      g.box(3, 0.14, 4.5, 9, 0.06, 7, 0x4f9c45); g.box(3, 0.2, 4.5, 0.15, 0.02, 7, 0xffffff);
      g.cyl(8.2, 0.14, -8.4, 0.1, 0.1, 8, 0xdddddd, 5); g.box(7.4, 7.2, -8.4, 1.5, 0.9, 0.05, 0x2f7fd0);
      g.tree(-8.3, 0.14, -8.3, 1.1, 0x4f9440);
      break;
    }
    case 'parking': {
      g.box(0, 0, 0, e, 0.14, e, 0x4a4d52);
      for (let k = 0; k < 7; k++) for (const z of [-5.2, 5.2]) g.box(-7.8 + k * 2.6, 0.14, z, 0.12, 0.02, 4.6, 0xe9e4cf);
      const rr = mulberry32(53), cols = [0xe9e9e9, 0x2d3640, 0xc0392b, 0x2f6fb0, 0xd8b93a, 0x8a949c];
      for (let k = 0; k < 6; k++) for (const z of [-5.2, 5.2]) if (rr() > 0.45) { const x = -6.5 + k * 2.6; g.box(x, 0.3, z, 1.5, 0.6, 3.3, cols[(rr() * 6) | 0]); g.box(x, 0.9, z - 0.2, 1.35, 0.5, 1.7, 0x39454f); }
      g.box(-8.6, 0.14, 8.6, 1.6, 2.4, 1.6, 0xe6e9ec, false, 0x2c5aa0);
      g.box(8.9, 0.14, -8.9, 0.3, 5, 0.3, 0x8a949c); g.box(8.9, 5, -8.9, 1.8, 1.8, 0.2, 0x2c5aa0);
      break;
    }
    case 'port': {
      pave(0x8d8a84);
      g.box(-6, 0.14, -8, 14, 6, 9, 0x9aa7b0, true); g.box(-6, 6.14, -8, 14.4, 0.4, 9.4, 0x5b6670);
      const rr = mulberry32(71), cols = [0xc0392b, 0x2f6fb0, 0xd8b93a, 0x3d8a5a, 0xe07b2e, 0x8a949c];
      for (let k = 0; k < 16; k++) g.box(-11 + (k % 4) * 3.2, 0.14 + ((k / 8) | 0) * 2.5, 3 + (((k / 4) | 0) % 2) * 6.4, 2.9, 2.5, 6, cols[(rr() * 6) | 0]);
      for (const x of [5, 11]) { g.box(x, 0.14, 2, 0.8, 16, 0.8, 0xe6a01e); g.box(x, 0.14, 11, 0.8, 16, 0.8, 0xe6a01e); g.box(x, 15.4, 3, 0.9, 0.9, 22, 0xe6a01e); g.box(x, 11, 14, 1.6, 1.4, 1.6, 0x39454f); }
      g.box(8, 0.14, -10, 6, 3, 5, 0xd8d4cc, false, 0x77726c);
      break;
    }
    case 'park': {
      g.box(0, 0, 0, e, 0.14, e, 0x69ad4a);
      g.box(0, 0.14, 0, 1.4, 0.03, e, 0xd9cfae); g.box(0, 0.14, 0, e, 0.03, 1.4, 0xd9cfae);
      g.tree(-3, 0.14, -3, 1.1); g.tree(3.2, 0.14, -2.8, 0.9, 0x4f9440); g.tree(-3, 0.14, 3.2, 0.95, 0x58a046); g.tree(3, 0.14, 3, 1.15);
      g.box(1.5, 0.14, 1.2, 1.6, 0.45, 0.5, 0x8a5a36); g.box(-1.5, 0.14, -1.2, 1.6, 0.45, 0.5, 0x8a5a36);
      break;
    }
    case 'plaza': {
      pave(0xd3c9b4);
      g.box(0, 0.14, 0, 13, 0.04, 13, 0xc2b59a);
      g.cyl(0, 0.14, 0, 3.6, 3.6, 0.7, 0xb9b3a8, 16, 0x69b4e0);
      g.cyl(0, 0.84, 0, 0.5, 0.35, 2, 0xb9b3a8, 8); g.cyl(0, 2.8, 0, 1.3, 0.5, 0.3, 0xb9b3a8, 10, 0x69b4e0);
      for (const [x, z] of [[-7.5, -7.5], [7.5, -7.5], [-7.5, 7.5], [7.5, 7.5], [0, -7.8], [0, 7.8], [-7.8, 0], [7.8, 0]]) g.tree(x, 0.14, z, 1.1, 0x4f9440);
      for (const a of [0, 1, 2, 3]) g.at(new THREE.Matrix4().makeRotationY(a * Math.PI / 2)).box(0, 0.14, 5.4, 2.2, 0.5, 0.6, 0x8a5a36).at(null);
      break;
    }
    case 'stadium': {
      pave(0xb5b1a6);
      g.box(0, 0.14, 0, 20, 0.1, 13, 0x4f9c45); g.box(0, 0.25, 0, 0.2, 0.02, 13, 0xffffff);
      g.box(0, 0.14, 0, 24, 0.04, 17, 0xb5654a); g.box(0, 0.2, 0, 20, 0.1, 13, 0x4f9c45);
      for (let k = 0; k < 5; k++) {
        const o = 9.5 + k * 1.7, h = 1.4 + k * 1.5;
        g.box(0, 0.14, -o, 27 + k * 3.4, h, 1.7, k % 2 ? 0xd9483b : 0xe9e4da);
        g.box(0, 0.14, o, 27 + k * 3.4, h, 1.7, k % 2 ? 0xd9483b : 0xe9e4da);
        g.box(-(12.3 + k * 1.7), 0.14, 0, 1.7, h, 17 + k * 3.4, k % 2 ? 0x2f7fd0 : 0xe9e4da);
        g.box(12.3 + k * 1.7, 0.14, 0, 1.7, h, 17 + k * 3.4, k % 2 ? 0x2f7fd0 : 0xe9e4da);
      }
      for (const [x, z] of [[-18, -17], [18, -17], [-18, 17], [18, 17]]) { g.cyl(x, 0.14, z, 0.3, 0.2, 16, 0x8a949c, 6); g.box(x, 15.8, z, 2.6, 1.6, 0.5, 0xfdf6c8); }
      break;
    }
    case 'clinic': {
      pave(0xc4c0b6);
      g.box(-1, 0.14, -2, 14, 7.5, 11, 0xf3f4f2, true);
      g.box(-1, 7.64, -2, 14.4, 0.4, 11.4, 0x8a949c);
      g.box(-1, 0.14, 4.5, 6, 3.2, 2.4, 0xe2e6e8, false, 0xc0392b);
      g.box(-1, 5, 3.56, 0.9, 2.6, 0.12, 0xd0342c); g.box(-1, 5.85, 3.56, 2.6, 0.9, 0.12, 0xd0342c);
      g.box(-1, 8.04, -2, 4, 0.1, 4, 0x6f7a82); g.box(-1, 8.14, -2, 0.6, 0.02, 2.4, 0xffffff); g.box(-1, 8.14, -2, 2.4, 0.02, 0.6, 0xffffff);
      g.tree(7.6, 0.14, 7.6, 1); g.tree(7.6, 0.14, -7, 1, 0x4f9440);
      break;
    }
    case 'school': {
      pave(0xc9c2ae);
      g.box(-2, 0.14, -4, 14, 6.5, 7, 0xe8c87a, true);
      g.gable(-2, 6.64, -4, 14.6, 2.4, 7.6, 0xa8503a, true, 0xe8c87a);
      g.box(5.8, 0.14, 2.5, 5, 6.5, 8, 0xe8c87a, true);
      g.gable(5.8, 6.64, 2.5, 5.6, 2.2, 8.6, 0xa8503a, false, 0xe8c87a);
      g.box(-3, 0.14, 4, 9, 0.04, 6, 0x7f9ec0); // sân chơi
      g.cyl(-7.6, 0.14, 7.8, 0.1, 0.1, 7, 0xdddddd, 5); g.box(-6.9, 6.2, 7.8, 1.4, 0.9, 0.05, 0xd0342c);
      g.tree(-8, 0.14, -8.2, 1, 0x4f9440); g.tree(8.2, 0.14, -8, 1.1);
      break;
    }
    case 'police': {
      pave(0xb7b4aa);
      g.box(-1.5, 0.14, -2, 12, 6.5, 10, 0xe6e9ec, true);
      g.box(-1.5, 3.2, -2, 12.1, 0.8, 10.1, 0x2c5aa0);
      g.box(-1.5, 6.64, -2, 12.4, 0.4, 10.4, 0x5b6670);
      g.box(-1.5, 7.04, -2, 3, 2.4, 3, 0xd5d9dc); g.cyl(-1.5, 9.44, -2, 0.1, 0.05, 4, 0xaaaaaa, 4);
      g.box(-1.5, 0.14, 3.4, 4.4, 3.4, 1.4, 0x2c5aa0);
      for (let k = 0; k < 2; k++) { g.box(7, 0.34, -5 + k * 5, 1.6, 0.7, 3.4, 0xf4f4f4); g.box(7, 1.04, -5.2 + k * 5, 1.4, 0.5, 1.6, 0x39454f); g.box(7, 1.54, -5.2 + k * 5, 0.9, 0.16, 0.3, 0x2f6fe0); }
      break;
    }
    case 'fire': {
      pave(0xb7b4aa);
      g.box(-1, 0.14, -2.5, 13, 6, 9.5, 0xc8402f, true);
      g.box(-1, 6.14, -2.5, 13.4, 0.4, 9.9, 0x5b5552);
      for (let k = 0; k < 3; k++) g.box(-5 + k * 4, 0.14, 2.28, 3.2, 4, 0.1, 0xe9e4da);
      g.box(7, 0.14, -6, 3, 13, 3, 0xb5392a, true); g.box(7, 13.14, -6, 3.4, 0.4, 3.4, 0x5b5552);
      g.box(-1, 0.14, 6, 12, 0.04, 6.6, 0x8d8a84);
      break;
    }
    case 'university': {
      pave(0xc9c2ae);
      g.box(0, 0.14, -6, 22, 9, 10, 0xe6dcc6, true);
      g.box(0, 9.14, -6, 22.5, 0.6, 10.5, 0x8a7f70);
      g.box(0, 0.14, 0.2, 9, 0.9, 3.6, 0xd6ccb6);
      for (let k = 0; k < 5; k++) g.cyl(-3.6 + k * 1.8, 1.04, 0.8, 0.38, 0.34, 7, 0xf4efe4, 8);
      g.gable(0, 8.04, 0, 9.6, 2.4, 4, 0xa8503a, true, 0xe6dcc6);
      g.cyl(0, 9.74, -6, 3.6, 3.6, 2, 0xe6dcc6, 14); g.cyl(0, 11.74, -6, 3.6, 0.3, 3.4, 0x4f8f86, 14);
      g.box(-10, 0.14, 7, 7, 6.5, 9, 0xdcc9a4, true, 0x8a7f70); g.box(10, 0.14, 7, 7, 6.5, 9, 0xdcc9a4, true, 0x8a7f70);
      g.box(0, 0.14, 8.5, 9, 0.04, 9, 0x69ad4a);
      for (const [x, z] of [[-4, 12], [4, 12], [-13, -12.5], [13, -12.5], [0, 8]]) g.tree(x, 0.14, z, 1.2, 0x4f9440);
      break;
    }
    case 'monument': {
      pave(0xd3c9b4);
      for (let k = 0; k < 3; k++) g.box(0, 0.14 + k * 0.5, 0, 12 - k * 2.6, 0.5, 12 - k * 2.6, 0xc2b59a);
      g.box(0, 1.64, 0, 3.4, 3, 3.4, 0xb9b3a8);
      g.cyl(0, 4.64, 0, 1.3, 0.55, 15, 0xe9e4da, 4); g.cyl(0, 19.64, 0, 0.55, 0, 2.2, 0xe6a01e, 4);
      for (const [x, z] of [[-7.6, -7.6], [7.6, -7.6], [-7.6, 7.6], [7.6, 7.6]]) { g.cyl(x, 0.14, z, 0.12, 0.12, 6.5, 0xdddddd, 5); g.box(x + 0.8, 5.3, z, 1.5, 1, 0.05, 0xd0342c); }
      for (const a of [0, 1, 2, 3]) g.at(new THREE.Matrix4().makeRotationY(a * Math.PI / 2)).box(0, 0.14, 8, 5, 0.5, 0.9, 0x69ad4a).at(null);
      break;
    }
    case 'market': {
      pave(0xc9c2ae);
      g.box(0, 0.14, -1, 24, 5.4, 19, 0xf0dfb4, true);
      g.gable(0, 5.54, -1, 25, 3, 20, 0xb5483a, true, 0xf0dfb4);
      g.box(0, 8.6, -1, 16, 1.6, 9, 0xf0dfb4, true); g.gable(0, 10.2, -1, 17, 2.4, 10, 0xb5483a, true, 0xf0dfb4);
      g.box(0, 0.14, 9.6, 7, 9, 3, 0xe8d3a0, true); g.box(0, 9.14, 9.6, 5, 4.5, 3, 0xf4efe6); // tháp đồng hồ
      g.cyl(0, 10.4, 11.12, 1.5, 1.5, 0.01, 0x2d3640, 12); g.cyl(0, 13.64, 9.6, 3.2, 0, 2.6, 0xb5483a, 4);
      g.box(0, 0.14, 11.12, 3, 3.6, 0.08, 0x4b5b68);
      for (let k = 0; k < 6; k++) for (const s of [-1, 1]) { g.box(s * (6 + k * 1.2) - s * 0.6, 0.14, 12.6, 1, 1.9, 1.6, [0xd9483b, 0x2f7fd0, 0xe6a01e, 0x2aa37a][k % 4], false, 0xf4efe6); }
      break;
    }
    case 'theater': {
      pave(0xd3c9b4);
      for (let k = 0; k < 3; k++) g.box(0, 0.14 + k * 0.45, 9.4 - k * 0.9, 20, 0.45, 5, 0xd6ccb6);
      g.box(0, 0.14, -2.5, 22, 11, 19, 0xefe6cf, true);
      for (let k = 0; k < 7; k++) g.cyl(-9 + k * 3, 1.49, 8.4, 0.6, 0.52, 9, 0xf7f3e8, 10);
      g.box(0, 10.5, 7.6, 21, 1.1, 3.4, 0xe6dcc6); g.gable(0, 11.6, 7.6, 21.6, 3, 3.6, 0x8e4a3c, true, 0xefe6cf);
      g.box(0, 11.14, -2.5, 22.6, 0.6, 19.6, 0x8a7f70);
      g.cyl(0, 11.74, -3, 6.5, 6.5, 2.6, 0xe6dcc6, 16); g.cyl(0, 14.34, -3, 6.5, 2.4, 3.6, 0x4f8f86, 16); g.cyl(0, 17.94, -3, 2.4, 0, 2.4, 0x4f8f86, 16);
      g.cyl(0, 20.3, -3, 0.1, 0.05, 3, 0xe6a01e, 4);
      g.tree(-12.4, 0.14, 11, 1.2, 0x4f9440); g.tree(12.4, 0.14, 11, 1.2, 0x4f9440);
      break;
    }
    case 'tvtower': {
      pave(0xc4c0b6);
      g.box(0, 0.14, 0, 12, 3, 12, 0xdfe4e6, true); g.box(0, 3.14, 0, 12.4, 0.4, 12.4, 0x5b6670);
      for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) g.at(new THREE.Matrix4().makeTranslation(x, 3.5, z).multiply(new THREE.Matrix4().makeRotationZ(x * 0.035)).multiply(new THREE.Matrix4().makeRotationX(-z * 0.035))).cyl(0, 0, 0, 0.6, 0.45, 26, 0xf2f4f5, 6).at(null);
      g.cyl(0, 3.5, 0, 1.6, 1.2, 46, 0xe9e9e9, 10);
      g.cyl(0, 46, 0, 2.2, 4.6, 1.6, 0xd9dde0, 16); g.cyl(0, 47.6, 0, 4.6, 4.6, 3.2, 0x2f3b45, 16); g.cyl(0, 50.8, 0, 4.6, 1.4, 2.2, 0xd0342c, 16);
      g.cyl(0, 53, 0, 1.1, 0.6, 12, 0xf2f4f5, 8); g.cyl(0, 65, 0, 0.5, 0.12, 16, 0xd0342c, 6);
      for (const y of [58, 70]) g.cyl(0, y, 0, 1, 1, 0.5, 0xf2f4f5, 8);
      break;
    }
    case 'skytower': {
      pave(0xc9c5ba);
      g.box(0, 0.14, 0, 32, 9, 30, 0x4f6a80, true); g.box(0, 9.14, 0, 32.6, 0.6, 30.6, 0x77726c);
      let y = 9.74, w = 22;
      for (const fl of [16, 12, 9, 6]) { g.box(0, y, 0, w, fl * FLOOR, w, 0x86a8c8, true); y += fl * FLOOR; g.box(0, y, 0, w + 0.6, 0.5, w + 0.6, 0x5f5d5a); y += 0.5; w -= 4.4; }
      g.cyl(0, y, 0, 2.4, 0.6, 12, 0xd9dde0, 8); g.cyl(0, y + 12, 0, 0.3, 0.08, 16, 0xd0342c, 5);
      for (const [x, z] of [[-17, 17], [17, 17], [-17, -17], [17, -17]]) g.tree(x, 0.14, z, 1.3, 0x4f9440);
      g.box(0, 0.14, 15.06, 8, 4.6, 0.1, 0x9cc4e4);
      break;
    }
    case 'depot': {
      pave(0x8d8a84);
      g.box(0, 0.14, -4, 17, 6, 10, 0xd8d4cc, false, 0x5b6670);
      for (let k = 0; k < 4; k++) g.box(-6 + k * 4, 0.14, 1.06, 3.2, 4.6, 0.1, 0x4f5a62); // cửa xưởng
      for (let k = 0; k < 3; k++) { g.box(-5 + k * 5, 0.4, 6, 2.2, 2.3, 6.6, [0x2f7fd0, 0xd9483b, 0x2aa37a][k], false, 0xe9e9e9); g.box(-5 + k * 5, 1.4, 6, 2.26, 0.8, 6, 0x2f3b45); }
      g.box(7.8, 0.14, 8.2, 2, 3.4, 1.6, 0xe6e9ec, false, 0x2c5aa0);
      break;
    }
    case 'ferry': {
      pave(0xc9c2ae);
      g.box(-3, 0.14, -3, 11, 5, 8, 0xf0e6d2, true); g.gable(-3, 5.14, -3, 11.6, 2.2, 8.6, 0x2f6fb0, true, 0xf0e6d2);
      g.box(4, 0.14, 4, 8, 0.6, 9, 0x9c7a52); for (let k = 0; k < 4; k++) g.box(0.6 + k * 2.4, 0.74, 8.4, 0.3, 1, 0.3, 0x6a4a30); // cầu tàu
      g.box(5, 0.5, 2, 3.6, 1.6, 7.4, 0xffffff); g.box(5, 2.1, 2.2, 2.8, 1.4, 4.6, 0x2f6fb0); g.box(5, 3.5, 2.6, 2, 0.8, 2.4, 0xffffff); // tàu khách
      break;
    }
    case 'train': {
      pave(0xb9b5aa);
      g.box(0, 0.14, -8, 27, 8, 8, 0xe2c9a8, true); g.gable(0, 8.14, -8, 28, 3.2, 9, 0x8e4a3c, true, 0xe2c9a8);
      g.box(0, 8.14, -3.8, 6, 6, 0.4, 0xe2c9a8); g.cyl(0, 11.2, -3.5, 1.4, 1.4, 0.05, 0xf4efe6, 12); // đồng hồ
      g.box(0, 0.14, 2.5, 28, 1.1, 5, 0xc9c5ba); g.box(0, 5.2, 2.5, 28, 0.25, 5.4, 0x5b6670); for (let k = 0; k < 6; k++) g.box(-12.5 + k * 5, 1.24, 2.5, 0.25, 4, 0.25, 0x5b6670); // sân ga có mái
      for (const z of [7, 11.5]) { g.box(0, 0.14, z, 29.6, 0.3, 3.4, 0x8a7f70); g.box(0, 0.44, z - 0.75, 29.6, 0.15, 0.2, 0x5b6670); g.box(0, 0.44, z + 0.75, 29.6, 0.15, 0.2, 0x5b6670); } // đường ray
      g.box(-4, 0.6, 7, 16, 3.2, 3, 0xd0342c, false, 0x5b5552); g.box(-4, 2, 8.52, 15, 0.9, 0.05, 0x2f3b45); // đoàn tàu
      break;
    }
    case 'airport': {
      g.box(0, 0, 0, e, 0.14, e, 0x7da55a);
      g.box(0, 0.14, 12, e - 2, 0.06, 9, 0x4a4d52); for (let k = 0; k < 9; k++) g.box(-22 + k * 5.5, 0.21, 12, 3, 0.02, 0.5, 0xf2f2f2); // đường băng
      g.box(0, 0.14, 2.5, 40, 0.05, 6, 0x6f7377); // đường lăn
      g.box(-6, 0.14, -12, 30, 7, 12, 0xdfe6ea, true); g.box(-6, 7.14, -12, 31, 0.8, 13, 0x5b6670); // nhà ga
      g.box(-6, 0.14, -5.2, 30, 5, 1.6, 0x9cc4e4);
      g.cyl(16, 0.14, -14, 1.6, 1.4, 16, 0xe6e9ec, 10); g.cyl(16, 16.14, -14, 3, 2.6, 3, 0x6fa8ff, 12, 0x5b6670); // đài kiểm soát
      for (const [x, z, a] of [[-14, -2, 0], [2, -2, 0], [18, 13, Math.PI / 2]]) { // máy bay
        g.at(rotY(x, 0.9, z, a)).box(0, 0, 0, 2.4, 2.4, 14, 0xf4f4f4).box(0, 0.6, -1, 14, 0.3, 3.2, 0xe9e9e9).box(0, 0.6, 5.8, 5, 0.2, 1.6, 0xe9e9e9).box(0, 1.2, 6.2, 0.3, 3.2, 1.8, 0x2f6fb0).at(null);
      }
      g.box(18, 0.14, -2, 8, 4, 6, 0x9aa3aa, false, 0x5b6670); // kho hàng
      break;
    }
    case 'nuclear': {
      pave(0x9c9a92);
      for (const [x, z] of [[-10, -9], [-10, 6]]) g.cyl(x, 0.14, z, 7.5, 4.6, 24, 0xd9d6cf, 20, 0x8a8f94); // tháp làm mát
      g.cyl(8, 0.14, -6, 6, 6, 10, 0xe6e3dc, 18); g.cyl(8, 10.14, -6, 6, 0.6, 5, 0xd5d1c8, 18); // vỏ lò
      g.box(8, 0.14, 8, 12, 7, 8, 0xc9cdd0, true); g.box(8, 7.14, 8, 12.4, 0.5, 8.4, 0xe6a01e);
      g.box(-2, 0.14, 15, 6, 3, 3, 0x8a949c);
      out.smoke = [[-10, 25, -9], [-10, 25, 6]];
      break;
    }
    case 'recycle': {
      pave(0x9c9a92);
      g.box(-2, 0.14, -3, 13, 6, 9, 0x3d8a5a, false, 0x2b6a44); g.box(-2, 3, 1.56, 6, 3, 0.1, 0x2f3b45);
      for (let k = 0; k < 3; k++) g.box(-6 + k * 4, 0.14, 6, 3, 1.6, 2.4, [0x2f6fb0, 0xe6a01e, 0x8a949c][k]); // kiện phế liệu
      g.at(new THREE.Matrix4().makeTranslation(6, 3.4, -3).multiply(new THREE.Matrix4().makeRotationZ(-0.5))).box(0, 0, 0, 7, 0.4, 1.2, 0x4a4d52).at(null);
      g.box(7.6, 0.14, 6.5, 2.2, 2.2, 2.2, 0x3d8a5a); g.box(7.6, 2.34, 6.5, 0.5, 0.05, 2.22, 0xffffff); g.box(7.6, 2.34, 6.5, 2.22, 0.05, 0.5, 0xffffff);
      break;
    }
    case 'hospital': {
      pave(0xc4c0b6);
      g.box(-2, 0.14, -4, 22, 15, 12, 0xf3f4f2, true); g.box(-2, 15.14, -4, 22.4, 0.5, 12.4, 0x8a949c);
      g.box(9, 0.14, 4, 9, 9, 10, 0xe6ebee, true, 0x8a949c);
      g.box(-6, 0.14, 4.6, 9, 3.4, 4, 0xe2e6e8, false, 0xc0392b); g.box(-6, 3.54, 6.4, 9.4, 0.3, 1.4, 0xd0342c); // sảnh cấp cứu
      g.box(-2, 11, 2.06, 1.2, 3.6, 0.12, 0xd0342c); g.box(-2, 12.2, 2.06, 3.6, 1.2, 0.12, 0xd0342c);
      g.cyl(-2, 15.64, -4, 3.4, 3.4, 0.1, 0x6f7a82, 16); g.box(-2, 15.76, -4, 0.6, 0.02, 3, 0xffffff); // bãi trực thăng
      g.tree(-13, 0.14, 12, 1.1); g.tree(13, 0.14, 12.5, 1, 0x4f9440);
      break;
    }
    case 'cemetery': {
      g.box(0, 0, 0, e, 0.14, e, 0x5f9446);
      const rr = mulberry32(17);
      for (let ix = 0; ix < 8; ix++) for (let iz = 0; iz < 6; iz++) { const x = -11 + ix * 3.1, z = -11 + iz * 3.2; g.box(x, 0.14, z, 1.4, 0.3, 2.2, 0xb9b3a8); g.box(x, 0.14, z - 1.2, 1.2, 0.9 + rr() * 0.6, 0.3, [0xd8d4cc, 0x9a968e, 0x8d8a84][(ix + iz) % 3]); }
      g.box(0, 0.14, 9.5, 5, 6, 4, 0xe9e4da); g.gable(0, 6.14, 9.5, 5.6, 2.6, 4.6, 0x5d6672, false, 0xe9e4da); // nhà tang lễ
      for (const [x, z] of [[-13, 13], [13, 13], [-13, 3], [13, 3]]) g.tree(x, 0.14, z, 1.2, 0x3c7a38);
      for (const a of [0, 1, 2, 3]) g.at(new THREE.Matrix4().makeRotationY(a * Math.PI / 2)).box(0, 0.14, 14.4, e, 1.2, 0.3, 0x8a8478).at(null);
      break;
    }
    case 'crematorium': {
      pave(0xc9c2ae);
      g.box(-1, 0.14, -2, 13, 6, 9, 0xe9e4da, true); g.box(-1, 6.14, -2, 13.6, 0.5, 9.6, 0x5b6670);
      for (let k = 0; k < 5; k++) g.cyl(-5.4 + k * 2.2, 0.14, 3.2, 0.35, 0.35, 5.5, 0xf4efe6, 8);
      g.box(-1, 5.64, 3.2, 11, 0.5, 1.2, 0xe9e4da);
      g.cyl(6.5, 0.14, -5, 0.9, 0.7, 13, 0xb9b3a8, 10, 0x333333);
      g.tree(-8, 0.14, 7.8, 0.9, 0x3c7a38); g.tree(7.6, 0.14, 7.8, 0.9, 0x3c7a38);
      out.smoke = [[6.5, 13.4, -5]];
      break;
    }
    case 'research': {
      pave(0xc4c0b6);
      g.box(-4, 0.14, -4, 16, 10, 12, 0xdfe6ea, true); g.box(-4, 10.14, -4, 16.4, 0.5, 12.4, 0x5b6670);
      g.cyl(9, 0.14, -6, 5, 5, 7, 0xe6e9ec, 16); g.cyl(9, 7.14, -6, 5, 0.4, 5, 0xd9dde0, 16, 0xffffff); // đài quan sát
      g.box(9, 9.5, -1.4, 1.2, 1.2, 0.6, 0x2f3b45);
      g.box(-4, 10.64, -4, 4, 0.2, 4, 0x27457a); g.cyl(-9, 10.64, -8, 0.1, 0.05, 5, 0xaaaaaa, 4); g.cyl(-9, 15.4, -8, 1.4, 0.2, 0.6, 0xe9e9e9, 10); // ăng-ten chảo
      g.box(4, 0.14, 8, 9, 0.04, 6, 0x69ad4a); g.tree(-12, 0.14, 11, 1.1, 0x4f9440); g.tree(0, 0.14, 11, 1, 0x4f9440);
      break;
    }
    case 'prison': {
      g.box(0, 0, 0, e, 0.14, e, 0x8d8a84);
      g.box(0, 0.14, -3, 18, 8, 10, 0xa9a69c, true, 0x6f7a82);
      g.box(-7, 0.14, 7, 8, 0.04, 6, 0x9c8a6a); // sân
      for (const a of [0, 1, 2, 3]) g.at(new THREE.Matrix4().makeRotationY(a * Math.PI / 2)).box(0, 0.14, 14.2, e, 6, 0.6, 0xc9c5ba, false, 0xd8d4cc).at(null); // tường bao
      for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) { g.box(x, 0.14, z, 2.4, 10, 2.4, 0xb9b5aa); g.box(x, 10.14, z, 3, 1.6, 3, 0x5b6670); } // chòi gác
      g.box(4, 0.14, 13.9, 5, 5, 1, 0x4f5a62);
      break;
    }
    default: pave(0xaaaaaa); g.box(0, 0.14, 0, S * 0.6, 4, S * 0.6, 0xcccccc);
  }
  out.geometry = g.build();
  return out;
}

/** Khối phụ của một module, đặt ở góc lô đất (gốc ở tâm đáy, vừa trong 3,4 × 3,4). */
export function moduleGeometry(id) {
  const g = new GB();
  g.box(0, 0, 0, 3.4, 0.2, 3.4, 0xa9a69c);
  switch (id) {
    case 'tank': g.cyl(0, 0.2, 0, 1.4, 1.4, 3, 0x5d9bd0, 12, 0x7fb6e2); g.box(1.3, 0.2, 0, 0.5, 2.4, 0.5, 0x4c88bd); break;
    case 'turbine': g.box(0, 0.2, 0, 2.6, 2, 2.6, 0xd9dde0, false, 0x8a949c); g.cyl(0, 2.2, 0, 0.8, 0.8, 0.7, 0xe6a01e, 10); break;
    case 'filter': g.cyl(-0.6, 0.2, 0, 0.9, 0.9, 4.6, 0xc8ccd0, 10); g.cyl(0.9, 0.2, 0.3, 0.55, 0.55, 3.2, 0x8a949c, 8); g.box(0.2, 3, 0.1, 1.6, 0.3, 0.3, 0x8a949c); break;
    case 'sorter': g.box(0, 0.2, -0.5, 3, 1.8, 1.8, 0x3d8a5a, false, 0x2b6a44); g.at(new THREE.Matrix4().makeTranslation(0, 1, 0.9).multiply(new THREE.Matrix4().makeRotationZ(0.3))).box(0, 0, 0, 3, 0.2, 0.8, 0x4a4d52).at(null); break;
    case 'deck': for (let k = 0; k < 3; k++) { g.box(0, 0.2 + k * 1.3, 0, 3.2, 0.2, 3.2, 0x8a8f94); for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) g.box(x, 0.2 + k * 1.3, z, 0.25, 1.3, 0.25, 0x6f7a82); } break;
    case 'wing': g.box(0, 0.2, 0, 3.2, 3.2, 3, 0xe8c87a, true); g.gable(0, 3.4, 0, 3.5, 1, 3.3, 0xa8503a, true, 0xe8c87a); break;
    case 'ward': g.box(0, 0.2, 0, 3.2, 3.4, 3, 0xf3f4f2, true, 0x8a949c); g.box(0, 2.2, 1.52, 0.4, 1.2, 0.06, 0xd0342c); g.box(0, 2.6, 1.52, 1.2, 0.4, 0.06, 0xd0342c); break;
    case 'post': g.box(0, 0.2, 0, 2.8, 2.6, 2.8, 0xe6e9ec, false, 0x2c5aa0); g.box(0, 1.5, 0, 2.86, 0.5, 2.86, 0x2c5aa0); g.box(0, 2.8, 0, 0.8, 0.3, 0.4, 0xd0342c); break;
    default: g.box(0, 0.2, 0, 3.2, 0.25, 3.2, 0x5a8f3c); for (let k = 0; k < 9; k++) g.cyl(-1 + (k % 3), 0.45, -1 + ((k / 3) | 0), 0.32, 0.05, 0.5, [0xe2557a, 0xf0c53a, 0xffffff][k % 3], 6); // vườn hoa
  }
  return g.build();
}

/** Cột điện cao thế (gốc ở chân cột, xà ngang theo trục x). */
export function pylonParts(g) {
  g.cyl(0, 0, 0, 0.9, 0.3, 13, 0x8e979d, 4);
  g.box(0, 10.4, 0, 6, 0.3, 0.3, 0x8e979d);
  g.box(0, 12.2, 0, 3.6, 0.3, 0.3, 0x8e979d);
  g.box(0, -1, 0, 2.4, 1.2, 2.4, 0x9a968e);
  return g;
}

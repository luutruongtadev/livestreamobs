// Phố Mới — mô hình 3D dựng bằng code (không cần file .glb). Mỗi ô = T đơn vị, mặt tiền nhìn về +z.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, T } from './sim.js';

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

/** Nhà tự mọc theo khu (1 R, 2 C, 3 I), cấp 1..3, biến thể 0..2. */
export function growable(zone, level, variant) {
  const r = mulberry32(zone * 1000 + level * 100 + variant * 7 + 5);
  const g = new GB();
  g.box(0, -6, 0, 9.7, 6, 9.7, FOUND);
  if (zone === 1) {
    if (level === 1) {
      g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x6da44b);
      g.box(1.6, 0.14, 2.6, 2.2, 0.03, 4.4, 0xa9a69c); // lối xe
      const w = 5.2 + r() * 1.2, d = 4.4 + r() * 0.8, wall = pick(r, WALLS), roof = pick(r, ROOFS), alongX = variant !== 1;
      const cx = -1 + r() * 0.6, cz = -1.2;
      g.box(cx, 0.14, cz, w, 2.9, d, wall);
      g.gable(cx, 3.04, cz, w + 0.6, 1.9, d + 0.6, roof, alongX, wall);
      g.box(cx - w * 0.2, 0.14, cz + d / 2 + 0.03, 0.9, 2, 0.08, 0x6a4630); // cửa
      g.box(cx + w * 0.22, 1.2, cz + d / 2 + 0.03, 1.3, 1.1, 0.08, 0x86b4d6);
      g.box(cx + w / 2 - 0.5, 3.6, cz - d / 4, 0.5, 1.8, 0.5, 0x8a8078); // ống khói
      if (variant === 2) g.box(3.2, 0.14, -1.6, 2.4, 2.3, 3.2, wall, false, roof);
      g.tree(-3.6, 0.14, 3.4, 0.8 + r() * 0.3); if (r() > 0.4) g.tree(3.6, 0.14, -3.8, 0.7, 0x4b8c3f);
      g.box(0, 0.14, 4.65, 9.4, 0.5, 0.18, 0x4a8440); // hàng rào cây
    } else if (level === 2) {
      g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xb9b5aa);
      g.box(0, 0.14, 3.9, 9, 0.04, 1.4, 0x6da44b);
      const fl = 3 + variant, w = 7.8, d = 6, wall = pick(r, WALLS);
      g.box(0, 0.14, -0.9, w, fl * FLOOR, d, wall, true);
      g.box(0, 0.14 + fl * FLOOR, -0.9, w + 0.3, 0.35, d + 0.3, 0x6e6a66);
      g.box(-1.5, 0.5 + fl * FLOOR, -1.4, 1.8, 1.3, 1.6, 0x8d9499);
      g.box(0, 0.14, 2.14, 1.6, 2.4, 0.1, 0x4b5b68);
      for (let k = 1; k < fl; k++) g.box(0, 0.14 + k * FLOOR - 0.1, 2.5, w, 0.16, 0.8, 0xd8d4cc); // ban công
      g.tree(-3.8, 0.14, 3.9, 0.8); g.tree(3.8, 0.14, 3.9, 0.8, 0x4b8c3f);
    } else {
      g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xb9b5aa);
      const wall = pick(r, [0xe8e2d6, 0xcfd9e0, 0xe6cdb4]), fl = 9 + variant * 2 + ((r() * 2) | 0);
      g.box(0, 0.14, 0, 8.6, 4, 8.2, 0xcac4b8, true);
      g.box(0, 4.14, -0.3, 6.6, fl * FLOOR, 6.4, wall, true);
      g.box(3.4, 4.14, -0.3, 0.5, fl * FLOOR, 2.2, 0xa4acb2);
      g.box(-3.4, 4.14, -0.3, 0.5, fl * FLOOR, 2.2, 0xa4acb2);
      const top = 4.14 + fl * FLOOR;
      g.box(0, top, -0.3, 6.9, 0.4, 6.7, 0x66625e);
      g.box(0.8, top + 0.4, -0.6, 2.6, 1.8, 2.4, 0x8d9499);
      g.cyl(-1.8, top + 0.4, 1.2, 0.08, 0.05, 4.5, 0x999999, 4);
    }
  } else if (zone === 2) {
    g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xbcb8ae);
    const sign = pick(r, SIGNS);
    if (level === 1) {
      const wall = pick(r, WALLS), w = 7.4 + r(), h = 3.8 + variant * 0.5;
      g.box(0, 0.14, -1, w, h, 6.2, wall);
      g.box(0, 0.14 + h, -1, w + 0.2, 0.3, 6.4, 0x77726c);
      g.box(0, 0.5, 2.13, w - 1.2, 2.3, 0.08, 0x54748c); // kính mặt tiền
      g.box(0, 2.95, 2.8, w, 0.18, 1.5, sign); // mái hiên
      g.box(0, 0.14 + h + 0.3, 1.6, w * 0.6, 1.1, 0.25, sign);
      g.box(3.4, 0.14, 3.6, 0.9, 0.9, 0.9, 0x5c7b4a);
    } else if (level === 2) {
      const wall = pick(r, [0xdcd3c4, 0xc8d2d8, 0xe2c9a8]), fl = 3 + variant, w = 8.2, d = 7;
      g.box(0, 0.14, -0.7, w, 3.4, d, 0x4f6a80);
      g.box(0, 3.3, 3.2, w + 0.2, 0.2, 1.2, sign);
      g.box(0, 3.54, -0.7, w, (fl - 1) * FLOOR, d, wall, true);
      const top = 3.54 + (fl - 1) * FLOOR;
      g.box(0, top, -0.7, w + 0.3, 0.35, d + 0.3, 0x6e6a66);
      g.box(0, top + 0.35, 2.4, 4.5, 1.6, 0.3, sign);
      g.box(-2, top + 0.35, -2, 2, 1.2, 1.8, 0x8d9499);
    } else {
      const glass = pick(r, [0x7fa8cc, 0x86b5b0, 0x93a4c4]), fl = 11 + variant * 3 + ((r() * 2) | 0);
      g.box(0, 0.14, 0, 8.8, 5, 8.6, 0x9aa7b0, true);
      g.box(0, 5.14, 0, 7, fl * FLOOR, 7, glass, true);
      const m = 5.14 + fl * FLOOR;
      g.box(0, m, 0, 5.2, 3 * FLOOR, 5.2, glass, true);
      g.box(0, m + 9, 0, 5.5, 0.4, 5.5, 0x5b6670);
      g.cyl(0, m + 9.4, 0, 0.14, 0.04, 7, 0xb0b0b0, 5);
      g.box(0, 5.14, 3.55, 3.5, 1.2, 0.2, sign);
    }
  } else {
    g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x9c9a92);
    if (level === 1) {
      const metal = pick(r, [0xa9b3b8, 0xb9a98c, 0x97a9b5]);
      g.box(-0.6, 0.14, -0.8, 7.6, 3.6, 6.4, metal);
      g.gable(-0.6, 3.74, -0.8, 7.8, 1.1, 6.6, pick(r, [0x6c7a86, 0x8a5a44, 0x5f7f6a]), variant !== 1, metal);
      g.box(-0.6, 0.14, 2.43, 2.6, 2.7, 0.08, 0x5a646c);
      g.cyl(3.9, 0.14, 2.6, 0.8, 0.8, 2.6, 0xc8ccd0, 9);
      g.box(3.6, 0.14, -3.4, 1.2, 1.1, 1.2, 0xb38a4f); g.box(3.9, 1.24, -3.3, 0.9, 0.9, 0.9, 0xa07a42);
    } else if (level === 2) {
      const brick = pick(r, [0xa5694d, 0x97715c, 0x8b8f93]);
      g.box(-0.5, 0.14, -0.5, 8.2, 5.2, 7, brick);
      for (let k = 0; k < 3; k++) g.gable(-0.5, 5.34, -2.8 + k * 2.33, 8.2, 1.2, 2.33, 0x6f7a82, true, brick);
      const cx = variant === 1 ? -3.6 : 3.8;
      g.cyl(cx, 0.14, 3.6, 0.7, 0.5, 13, 0x9b6a55, 9, 0x2b2b2b);
      g.cyl(cx, 11.2, 3.6, 0.58, 0.55, 0.9, 0xe8e2d8, 9);
      g.box(-0.5, 0.14, 3.03, 3, 3, 0.08, 0x4f5a62);
      if (variant === 2) g.cyl(-3.6, 0.14, 3.7, 0.9, 0.9, 3.4, 0xc8ccd0, 9);
    } else {
      g.box(0, 0.14, -0.6, 8.2, 6, 7, 0xeef1f3, true);
      g.box(0, 2.6, -0.6, 8.3, 0.7, 7.1, pick(r, [0x2f7fd0, 0x2aa37a, 0xe07b2e]));
      g.box(0, 6.14, -0.6, 8.4, 0.3, 7.2, 0x8a949c);
      g.cyl(-2.2, 6.44, -1.4, 1.1, 1.4, 0.7, 0xd9dde0, 10);
      g.box(2, 6.44, -0.6, 2.6, 1, 2, 0x9aa3aa);
      for (let k = 0; k < 3; k++) g.at(new THREE.Matrix4().makeTranslation(-2.6 + k * 2.6, 0.5, 3.9).multiply(new THREE.Matrix4().makeRotationX(-0.5))).box(0, 0, 0, 2.2, 0.1, 1.4, 0x27457a).at(null);
      g.tree(4, 0.14, 4, 0.7);
    }
  }
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
    default: pave(0xaaaaaa); g.box(0, 0.14, 0, S * 0.6, 4, S * 0.6, 0xcccccc);
  }
  out.geometry = g.build();
  return out;
}

/** Cột điện cao thế (gốc ở chân cột, xà ngang theo trục x). */
export function pylonParts(g) {
  g.cyl(0, 0, 0, 0.9, 0.3, 13, 0x8e979d, 4);
  g.box(0, 10.4, 0, 6, 0.3, 0.3, 0x8e979d);
  g.box(0, 12.2, 0, 3.6, 0.3, 0.3, 0x8e979d);
  g.box(0, -1, 0, 2.4, 1.2, 2.4, 0x9a968e);
  return g;
}

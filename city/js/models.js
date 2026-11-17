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
  /**
   * Khối tròn lồi lõm (tán lá, bụi cây, tảng đá): tâm (cx, cy, cz), bán kính ba trục. Mặt dưới tối, mặt trên sáng
   * để tán cây có khối; pháp tuyến trơn. detail 0 = 20 tam giác, 1 = 80, 2 = 180.
   */
  blob(cx, cy, cz, rx, ry, rz, color, seed = 1, detail = 1, rough = 0.36) {
    const src = BLOBS[detail] || (BLOBS[detail] = new THREE.IcosahedronGeometry(1, detail).attributes.position.array);
    const base = this._col.set(color), r0 = base.r, g0 = base.g, b0 = base.b, col = { r: 0, g: 0, b: 0 }, start = this.p.length / 3;
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2];
      // độ lệch chỉ phụ thuộc hướng (làm tròn) nên đỉnh chung của các tam giác vẫn khít nhau
      const hsh = Math.sin(Math.round(x * 400) * 12.9898 + Math.round(y * 400) * 78.233 + Math.round(z * 400) * 37.719 + seed * 4.1) * 43758.5453, h = hsh - Math.floor(hsh);
      const k = 1 - rough / 2 + rough * h, l = 0.66 + 0.34 * (y * 0.5 + 0.5) + 0.14 * (h - 0.5);
      col.r = r0 * l; col.g = g0 * l; col.b = b0 * l;
      this._push([cx + x * k * rx, cy + y * k * ry, cz + z * k * rz], norm([x, y * 0.85 + 0.3, z]), col, [0.03, 0.03]);
    }
    for (let i = 0; i < src.length / 3; i += 3) this.i.push(start + i, start + i + 1, start + i + 2);
    return this;
  }
  /** Cây nhỏ trang trí trong sân nhà, công viên: thân + hai khối tán lá */
  tree(cx, y, cz, s = 1, color = 0x3f7f3a) {
    const seed = Math.round(cx * 7 + cz * 13 + s * 5);
    this.cyl(cx, y, cz, 0.17 * s, 0.1 * s, 1.7 * s, 0x6b4a2f, 5);
    this.blob(cx, y + 2.2 * s, cz, 1.3 * s, 1.1 * s, 1.3 * s, color, seed, 1);
    this.blob(cx + 0.45 * s, y + 3 * s, cz - 0.25 * s, 0.85 * s, 0.7 * s, 0.85 * s, color, seed + 3, 0);
    return this;
  }
  /** Hàng rào / bờ giậu thấp dọc một cạnh: từ (x0, z0) tới (x1, z1). */
  hedge(x0, z0, x1, z1, y = 0.14, h = 0.7, color = 0x4a8440, w = 0.45) {
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    return this.box((x0 + x1) / 2, y, (z0 + z1) / 2, Math.max(dx, w), h, Math.max(dz, w), color);
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
const BLOBS = {};

/**
 * Texture một ô cửa sổ trên nền tường trắng (nhân với màu đỉnh): tường có vân vữa nhẹ, cửa hai cánh có khung, bậu cửa, rèm.
 * Góc dưới trái (uv 0,03) giữ trắng tinh cho các mặt không có cửa sổ.
 */
export function windowTexture() {
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), r = mulberry32(11);
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 260; k++) { const v = 236 + r() * 19; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(12 + r() * (S - 14), r() * (S - 12), 1 + r() * 3, 1 + r() * 2); } // vân vữa
  g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, S, 7); // gờ sàn (đáy ô, v = 0)
  g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(0, 7, S, 3);
  const x0 = 28, y0 = 22, w = 72, h = 74; // ô cửa (toạ độ canvas: y hướng xuống)
  g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(x0 - 5, y0 - 6, w + 10, 5); // bóng ô văng
  g.fillStyle = '#bdbdbd'; g.fillRect(x0 - 4, y0 - 4, w + 8, h + 8);
  const grad = g.createLinearGradient(0, y0, 0, y0 + h);
  grad.addColorStop(0, '#34495c'); grad.addColorStop(0.55, '#56728a'); grad.addColorStop(1, '#7896ab');
  g.fillStyle = grad; g.fillRect(x0, y0, w, h);
  g.fillStyle = 'rgba(238,232,214,.5)'; g.fillRect(x0, y0, 15, h); g.fillRect(x0 + w - 13, y0, 13, h); // rèm hai bên
  g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(x0, y0 + h); g.lineTo(x0, y0 + 40); g.lineTo(x0 + 38, y0); g.lineTo(x0 + 56, y0); g.closePath(); g.fill(); // vệt phản chiếu
  g.fillStyle = '#c4c4c4'; g.fillRect(x0 + w / 2 - 2, y0, 4, h); g.fillRect(x0, y0 + 22, w, 3); // đố cửa
  g.fillStyle = '#cfcfcf'; g.fillRect(x0 - 8, y0 + h + 4, w + 16, 6); // bậu cửa
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x0 - 8, y0 + h + 10, w + 16, 3);
  g.fillStyle = '#fff'; g.fillRect(0, S - 12, 12, 12);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Bản đồ phát sáng khớp với windowTexture: chỉ phần kính sáng (đèn trong nhà ban đêm), còn lại đen. */
export function windowLightTexture() {
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), x0 = 28, y0 = 22, w = 72, h = 74;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const grad = g.createLinearGradient(0, y0, 0, y0 + h);
  grad.addColorStop(0, '#ffe2a0'); grad.addColorStop(1, '#ffc468');
  g.fillStyle = grad; g.fillRect(x0, y0, w, h);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0, y0, 15, h); g.fillRect(x0 + w - 13, y0, 13, h);
  g.fillStyle = '#000'; g.fillRect(x0 + w / 2 - 2, y0, 4, h); g.fillRect(x0, y0 + 22, w, 3);
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

/** Ô tô đỗ trong sân (trang trí): đầu xe quay theo góc rot quanh trục đứng. */
function parkedCar(g, x, y, z, color, rot = 0) {
  g.at(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(rot)));
  g.box(0, 0.22, 0, 1.5, 0.5, 3.3, color); g.box(0, 0.72, -0.15, 1.34, 0.46, 1.7, 0x2f3b45, false, color);
  for (const wz of [1.05, -1.05]) for (const wx of [-0.72, 0.72]) g.box(wx, 0, wz, 0.2, 0.5, 0.56, 0x1e1f22);
  g.box(0, 0.4, 1.66, 1.2, 0.16, 0.04, 0xfff3b0); g.box(0, 0.4, -1.66, 1.2, 0.16, 0.04, 0xc0392b);
  return g.at(null);
}
const CARS = [0xe9e9e9, 0x2d3640, 0xc0392b, 0x2f6fb0, 0x8a949c, 0x3d8a5a];

/** Hàng rào cọc gỗ dọc trục x. */
function pickets(g, x0, x1, z, y = 0.14, color = 0xf2efe8) {
  for (let x = x0; x <= x1 + 0.01; x += 0.62) g.box(x, y, z, 0.14, 0.78, 0.08, color);
  g.box((x0 + x1) / 2, y + 0.5, z, x1 - x0, 0.08, 0.05, color);
}

function house(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x6da44b);
  g.box(1.8, 0.14, 2.9, 2.2, 0.03, 3.8, 0xa9a69c); // lối xe
  const wall = pick(r, WALLS), roof = pick(r, ROOFS), alongX = variant !== 1;
  const two = level >= 3, w = 5 + level * 0.35 + r() * 0.6, d = 4.2 + level * 0.2, h = two ? 5.6 : 2.9, cx = -1 + r() * 0.4, cz = -1.2, zf = cz + d / 2;
  g.box(cx, 0.14, cz, w + 0.18, 0.32, d + 0.18, 0x9a9488); // chân tường
  g.box(cx, 0.14, cz, w, h, d, wall, two);
  g.box(cx, 0.06 + h, cz, w + 0.75, 0.1, d + 0.75, 0xece7dc); // diềm mái
  g.gable(cx, 0.14 + h, cz, w + 0.7, 1.7 + level * 0.12, d + 0.7, roof, alongX, wall);
  // cửa chính: bậc thềm, mái đón
  const dx = cx - w * 0.2;
  g.box(dx, 0.14, zf + 0.03, 0.9, 2, 0.08, 0x6a4630); g.box(dx + 0.28, 1.05, zf + 0.08, 0.07, 0.07, 0.05, 0xd8b93a);
  g.box(dx, 0.14, zf + 0.45, 1.5, 0.16, 0.8, 0xb9b3a8);
  g.at(new THREE.Matrix4().makeTranslation(dx, 2.35, zf + 0.4).multiply(new THREE.Matrix4().makeRotationX(0.3))).box(0, 0, 0, 1.6, 0.08, 0.95, roof).at(null);
  for (let k = 0; k < 3; k++) g.box(dx + (k % 2 ? 0.25 : -0.2), 0.14, zf + 1.3 + k * 0.85, 0.75, 0.04, 0.55, 0xc9c4b8); // lối đá vào nhà
  if (!two) { // cửa sổ có cánh chớp và bồn hoa
    const wx = cx + w * 0.22;
    g.box(wx, 1.2, zf + 0.03, 1.3, 1.1, 0.08, 0x86b4d6); g.box(wx, 1.2, zf + 0.05, 0.06, 1.1, 0.06, 0xf4f1ea); g.box(wx, 1.72, zf + 0.05, 1.3, 0.06, 0.06, 0xf4f1ea);
    for (const sd of [-1, 1]) g.box(wx + sd * 0.82, 1.15, zf + 0.04, 0.3, 1.2, 0.06, roof);
    g.box(wx, 0.95, zf + 0.16, 1.4, 0.2, 0.26, 0x8a5a36, false, 0xe2557a);
  }
  g.box(cx + w / 2 - 0.5, h + 0.6, cz - d / 4, 0.5, 1.9, 0.5, 0x8a8078); g.box(cx + w / 2 - 0.5, h + 2.5, cz - d / 4, 0.62, 0.12, 0.62, 0x5f5a55); // ống khói
  if (two && level >= 4) { // cửa sổ mái
    g.box(cx + w * 0.18, 0.14 + h + 0.25, zf - 0.75, 1.2, 1, 1.1, wall); g.gable(cx + w * 0.18, 0.14 + h + 1.25, zf - 0.75, 1.4, 0.5, 1.3, roof, false, wall);
    g.box(cx + w * 0.18, 0.14 + h + 0.45, zf - 0.19, 0.7, 0.6, 0.04, 0x86b4d6);
  }
  if (level >= 2) { // nhà xe có cửa cuốn
    g.box(3.4, 0.14, -1.4, 2.3, 2.4, 3.4, wall, false, roof); g.box(3.4, 0.14, 0.32, 1.9, 2, 0.06, 0xe4e1da);
    for (let k = 1; k < 4; k++) g.box(3.4, 0.14 + k * 0.5, 0.34, 1.9, 0.03, 0.04, 0xbdb9b0);
    if (r() > 0.3) parkedCar(g, 1.8, 0.17, 2.6, pick(r, CARS), Math.PI);
  }
  if (level >= 4) { // hiên có cột
    g.box(cx, 0.14, zf + 0.9, w * 0.7, 0.25, 1.8, 0xc9b99a); g.box(cx, 2.9, zf + 0.9, w * 0.7, 0.15, 1.8, 0xd8d4cc);
    for (const sd of [-1, 1]) g.box(cx + sd * w * 0.33, 0.39, zf + 1.65, 0.16, 2.5, 0.16, 0xf4f1ea);
  }
  if (level >= 5) { g.box(-2.6, 0.14, 3.3, 3.8, 0.05, 2.3, 0xd8d4cc); g.box(-2.6, 0.14, 3.3, 3.4, 0.08, 1.9, 0x5db7e6); g.box(-4.2, 0.19, 2, 0.5, 0.3, 1.2, 0xf4f1ea); } // hồ bơi + ghế nằm
  else g.tree(-3.6, 0.14, 3.4, 0.8 + r() * 0.3);
  if (r() > 0.4) g.tree(3.7, 0.14, -4, 0.7, 0x4b8c3f);
  // luống hoa sát tường, thùng thư, hàng rào trước nhà
  g.box(cx + w * 0.28, 0.14, zf + 0.35, 1.9, 0.16, 0.45, 0x5a4634, false, pick(r, [0xe2557a, 0xf0c53a, 0xb07fe0, 0xffffff]));
  g.box(0.45, 0.14, 4.4, 0.08, 0.9, 0.08, 0x6f7a82); g.box(0.45, 1.04, 4.4, 0.3, 0.22, 0.42, pick(r, [0xc0392b, 0x2f6fb0, 0x3d8a5a]));
  if (variant === 0) { g.box(-2.25, 0.14, 4.65, 4.9, 0.55, 0.3, 0x4a8440); g.box(3.9, 0.14, 4.65, 1.6, 0.55, 0.3, 0x4a8440); } // bờ giậu
  else { pickets(g, -4.6, 0.2, 4.68); pickets(g, 3.3, 4.6, 4.68); }
  g.box(-4.72, 0.14, 0, 0.1, 0.5, 9.2, 0x4a8440); // giậu bên hông
}

function tower(g, r, floors, wall, opt = {}) {
  const { podium = 0, w = 6.8, d = 6.6, glass = false, sign = null, shop = false, green = false, crown = false, balcony = false } = opt;
  const zc = -0.2;
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xb9b5aa);
  g.box(0, 0.14, 4.45, 9.7, 0.02, 0.8, 0xa29e94); // dải lát trước nhà
  let y = 0.14;
  if (podium) {
    g.box(0, y, 0, 8.7, podium, 8.4, shop ? 0x4f6a80 : 0xcac4b8, !shop);
    if (shop) {
      g.box(0, y + podium - 0.5, 4.5, 8.7, 0.2, 1, sign); g.box(0, y + podium, 0, 8.9, 0.25, 8.6, 0x77726c);
      for (const x of [-2.9, 2.9]) { g.box(x, y + 0.3, 4.21, 2.3, podium - 1.5, 0.06, 0xa9cfe8); g.box(x, y + 0.3, 4.23, 0.07, podium - 1.5, 0.05, 0x39434c); } // tủ kính
      g.box(0, y, 4.22, 1.7, 2.4, 0.08, 0x2f3b45); g.box(0, y, 4.26, 0.05, 2.4, 0.03, 0xc9d3da); // cửa vào
      g.box(0, y + podium - 1.15, 4.24, 5.2, 0.55, 0.1, sign);
    } else {
      g.box(0, y, 4.21, 2.4, 2.7, 0.08, 0x33424f); g.box(0, y + 2.8, 4.75, 3.4, 0.16, 1.2, 0x8d887e); // sảnh kính + mái đón
      for (const sd of [-1, 1]) g.box(sd * 1.5, y, 5.2, 0.16, 2.8, 0.16, 0x9aa3aa);
    }
    y += podium;
  }
  const h = floors * FLOOR;
  g.box(0, y, zc, w, h, d, wall, true);
  if (glass) { // nẹp góc, đai ngang mỗi 4 tầng
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * (w / 2), y, zc + sz * (d / 2), 0.3, h, 0.3, 0x56636f);
    for (let f = 4; f < floors; f += 4) g.box(0, y + f * FLOOR - 0.16, zc, w + 0.14, 0.32, d + 0.14, 0xe2e8ec);
  } else {
    g.box(w / 2 + 0.15, y, zc, 0.5, h, 2.2, 0xa4acb2); g.box(-w / 2 - 0.15, y, zc, 0.5, h, 2.2, 0xa4acb2);
    if (balcony) { // ban công mặt trước từng tầng, dàn nóng điều hoà bên hông
      for (let f = 1; f < Math.min(floors, 20); f++) {
        const by = y + f * FLOOR;
        for (const x of [-w * 0.25, w * 0.25]) { g.box(x, by - 0.12, zc + d / 2 + 0.42, w * 0.38, 0.14, 0.85, 0xd8d4cc); g.box(x, by + 0.02, zc + d / 2 + 0.82, w * 0.38, 0.82, 0.06, f % 2 ? 0x7f8a92 : 0xa9c2d0); }
      }
      for (let k = 0; k < Math.min(7, floors - 1); k++) g.box((k % 2 ? 1 : -1) * (w / 2 + 0.52), y + 1.1 + k * FLOOR * (floors > 9 ? 2 : 1), zc + 1.6 + (r() - 0.5) * 0.6, 0.34, 0.5, 0.75, 0xe4e6e8);
    }
  }
  if (!podium) { // tầng trệt: sảnh, mái đón
    g.box(0, 0.14, zc + d / 2 + 0.05, 1.8, 2.5, 0.1, 0x3f4f5c); g.box(0, 2.75, zc + d / 2 + 0.6, 2.8, 0.14, 1.1, 0x8d887e);
    g.tree(-3.9, 0.14, 4, 0.75); g.tree(3.9, 0.14, 4, 0.75, 0x4b8c3f);
    g.box(-2.2, 0.14, 4.2, 1.3, 0.4, 0.45, 0x8a5a36); // ghế
  }
  y += h;
  let rw = w * 1.04, rd = d * 1.04;
  if (glass && floors >= 12) { const h2 = Math.round(floors * 0.25) * FLOOR; g.box(0, y, zc, w * 0.72, h2, d * 0.72, wall, true); y += h2; rw = w * 0.76; rd = d * 0.76; }
  g.box(0, y, zc, rw, 0.4, rd, 0x5f5d5a);
  y += 0.4;
  for (const sz of [-1, 1]) g.box(0, y, zc + sz * (rd / 2 - 0.08), rw, 0.5, 0.16, 0x77726c); // tường chắn mái
  for (const sx of [-1, 1]) g.box(sx * (rw / 2 - 0.08), y, zc, 0.16, 0.5, rd, 0x77726c);
  if (green) { g.box(0, y, zc, rw * 0.68, 0.3, rd * 0.58, 0x5a9a44); g.tree(-rw * 0.2, y + 0.3, zc, 0.6, 0x4f9440); g.tree(rw * 0.2, y + 0.3, zc + 0.6, 0.55, 0x58a046); } // vườn trên mái
  else if (crown) { g.box(0, y, zc, rw * 0.5, 2.6, rd * 0.5, 0xd8b93a, false, 0x8a7a3a); g.cyl(0, y + 2.6, zc, 0.12, 0.05, 6, 0xd8d4cc, 4); } // chóp toà tài chính
  else if (glass && floors >= 20) { // sân đỗ trực thăng
    g.cyl(0, y, zc, rw * 0.36, rw * 0.36, 0.08, 0xe6c13a, 18); g.cyl(0, y + 0.04, zc, rw * 0.32, rw * 0.32, 0.1, 0x4a4f55, 18);
    g.box(0, y + 0.14, zc, 0.9, 0.02, 0.22, 0xf2f2f2); for (const sd of [-1, 1]) g.box(sd * 0.4, y + 0.14, zc, 0.2, 0.02, 1, 0xf2f2f2);
  } else {
    g.box(rw * 0.12, y, zc - rd * 0.08, 2.2, 1.6, 2, 0x8d9499); // tum thang
    for (let k = 0; k < (floors >= 8 ? 3 : 2); k++) { const ax = -rw * 0.3 + k * 0.1, az = zc + rd * 0.28 - k * 1.2; g.box(ax, y, az, 1, 0.7, 0.9, 0xd9dde0); g.cyl(ax, y + 0.7, az, 0.32, 0.32, 0.06, 0x4a4f55, 8); } // dàn lạnh
    if (!glass) g.cyl(rw * 0.3, y, zc + rd * 0.3, 0.6, 0.6, 1.2, 0xd8dde0, 10); // bồn nước
  }
  if (floors >= 9 && !crown) g.cyl(-rw * 0.2, y, zc + rd * 0.12, 0.09, 0.05, 3.5 + floors * 0.15, 0x999999, 4);
  if (sign && !shop) g.box(0, y - 2.1, zc + rd / 2 - 0.02, rw * 0.6, 1.2, 0.25, sign);
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
  const sign = pick(r, SIGNS), wall = pick(r, WALLS), w = 7.4 + r() * 0.8, d = 6.2 + level * 0.15, base = 3.8 + (variant === 2 ? 0.4 : 0), zf = d / 2 - 1;
  g.box(0, 0.14, -1, w, base, d, level >= 2 ? 0x4f6a80 : wall);
  g.box(0.9, 0.5, zf + 0.05, w - 3, 2.3, 0.08, 0x8fc0de); // tủ kính trưng bày
  for (let k = 1; k < 3; k++) g.box(0.9 - (w - 3) / 2 + ((w - 3) * k) / 3, 0.5, zf + 0.08, 0.07, 2.3, 0.05, 0x39434c);
  g.box(-w / 2 + 0.95, 0.14, zf + 0.05, 1.2, 2.5, 0.1, 0x2f3b45); g.box(-w / 2 + 0.95, 0.14, zf + 0.1, 0.05, 2.5, 0.04, 0xc9d3da); // cửa
  // mái hiên bạt sọc
  const aw = new THREE.Matrix4().makeTranslation(0, 3.05, zf + 0.75).multiply(new THREE.Matrix4().makeRotationX(0.28));
  g.at(aw).box(0, 0, 0, w, 0.08, 1.6, sign);
  for (let k = 0; k < 5; k++) g.box(-w / 2 + (w / 10) * (2 * k + 1.5), 0.02, 0, w / 10, 0.08, 1.62, 0xf6f2e6);
  g.at(null);
  let y = 0.14 + base;
  if (level >= 2) { const h = (level - 1) * FLOOR; g.box(0, y, -1, w, h, d, wall, true); y += h; }
  g.box(0, y, -1, w + 0.2, 0.3, d + 0.2, 0x77726c);
  for (const sx of [-1, 1]) g.box(sx * (w / 2 + 0.02), y + 0.3, -1, 0.14, 0.4, d + 0.2, 0x6a655f);
  g.box(0, y + 0.3, zf - 0.5, w * 0.6, 1 + level * 0.12, 0.25, sign); g.box(0, y + 0.3, zf - 0.68, 0.12, 1, 0.12, 0x5f5d5a);
  g.box(-2, y + 0.3, -2.2, 1.6, 0.8, 1.2, 0xd9dde0); g.cyl(-2, y + 1.1, -2.2, 0.4, 0.4, 0.06, 0x4a4f55, 8); // dàn lạnh
  if (level >= 3) g.box(1.6, y + 0.3, -2.6, 2, 1.2, 1.8, 0x8d9499);
  // trước cửa: chậu cây, ghế, biển chữ A; bên hông có xe đỗ
  g.box(3.6, 0.14, 3.9, 0.9, 0.7, 0.9, 0x7d6a55); g.blob(3.6, 1.35, 3.9, 0.7, 0.75, 0.7, 0x4f9440, 3, 0);
  g.box(-0.6, 0.14, 4.3, 1.5, 0.42, 0.45, 0x8a5a36);
  g.at(new THREE.Matrix4().makeTranslation(-3.2, 0.14, 4.3).multiply(new THREE.Matrix4().makeRotationX(-0.25))).box(0, 0, 0, 0.7, 1.1, 0.06, sign).at(null);
}

/** Chợ truyền thống: mái tôn che dãy sạp, bạt màu, thúng rổ; cấp cao thì có nhà lồng chợ. */
function marketStalls(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xb9b5aa);
  if (level >= 3) { // nhà lồng chợ
    const h = 4 + level * 0.8;
    g.box(0, 0.14, 0, 8.6, h, 8.6, 0xe9dcc0, true);
    g.gable(0, 0.14 + h, 0, 9.4, 2.4, 9.4, 0x7d8c94, true, 0xe9dcc0);
    g.box(0, h - 1.2, 4.35, 4, 0.9, 0.05, 0xd0342c); // bảng tên chợ
  }
  const n = level >= 3 ? 2 : 3, cols = [0xd0342c, 0x1f6fc8, 0xf2c14e, 0x2aa37a, 0xe8894a];
  for (let k = 0; k < n; k++) for (let j = 0; j < 2; j++) {
    const x = -3.2 + k * (6.4 / Math.max(1, n - 1)), z = level >= 3 ? 4.6 + j * 0.01 : -2.4 + j * 4.8, col = pick(r, cols);
    if (level >= 3 && j) continue;
    g.box(x, 0.14, z, 2.6, 0.8, 1.4, 0x8a6a45); // sạp gỗ
    for (const [ox, oz] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) g.box(x + ox, 0.14, z + oz, 0.1, 2.4, 0.1, 0x6a6a6a);
    g.box(x, 2.54, z, 3, 0.12, 2, col); // bạt che
    for (let q = 0; q < 3; q++) g.cyl(x - 0.8 + q * 0.8, 0.94, z, 0.32, 0.26, 0.3, pick(r, [0x7fb04a, 0xe0a030, 0x3fb6dc, 0xd9483b]), 7); // thúng rổ
  }
}

/** Xưởng chế biến: nhà xưởng mái tôn, cửa cuốn, đống thùng hàng, ống khói nhỏ. */
function workshop(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xa9a49a);
  const w = 7 + Math.min(level, 3) * 0.5, h = 3.4 + level * 0.5;
  g.box(-0.6, 0.14, -1, w, h, 6.4, pick(r, [0xd8cfbf, 0xc9d1d6, 0xe2d2b0]), true);
  g.gable(-0.6, 0.14 + h, -1, w + 0.6, 1.8, 7, pick(r, [0x7d8c94, 0x5f7f99, 0x9b5b3c]));
  g.box(-0.6, 0.14, 2.25, 3, 2.6, 0.08, 0x6b7680); // cửa cuốn
  for (let k = 0; k < 2 + level; k++) g.box(3.4 - (k % 2) * 1.2, 0.14 + ((k / 2) | 0) * 0.9, 3.4 + (k % 3) * 0.3, 1, 0.9, 1, pick(r, [0xb8862f, 0x8a6a45, 0x6fa8d8]));
  if (level >= 2) g.cyl(2.6, 0.14 + h, -3, 0.35, 0.3, 3.2, 0x8a8f94, 8);
}

function industry(g, r, level, variant) {
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0x9c9a92);
  // hàng rào lưới quanh lô (chừa cổng phía trước)
  for (const [x0, z0, x1, z1] of [[-4.7, -4.7, 4.7, -4.7], [-4.7, -4.7, -4.7, 4.7], [4.7, -4.7, 4.7, 4.7], [-4.7, 4.7, -1.6, 4.7], [1.6, 4.7, 4.7, 4.7]]) {
    g.box((x0 + x1) / 2, 1.2, (z0 + z1) / 2, Math.max(0.05, Math.abs(x1 - x0)), 0.05, Math.max(0.05, Math.abs(z1 - z0)), 0x8e979d);
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.3));
    for (let k = 0; k <= n; k++) g.box(x0 + ((x1 - x0) * k) / n, 0.14, z0 + ((z1 - z0) * k) / n, 0.08, 1.15, 0.08, 0x8e979d);
  }
  if (variant === 0) { // kho + si-lô + băng tải + đống hàng
    const metal = pick(r, [0xa9b3b8, 0xb9a98c, 0x97a9b5]), wh = 3.2 + level * 0.3;
    g.box(-1.4, 0.14, -1.6, 6, wh, 5.4, metal);
    for (let k = 0; k < 6; k++) g.box(-4.2 + k * 1.12, 0.14, 1.12, 0.06, wh, 0.05, 0x8a949c); // gân tôn
    g.gable(-1.4, 0.14 + wh, -1.6, 6.2, 1, 5.6, pick(r, [0x6c7a86, 0x8a5a44, 0x5f7f6a]), true, metal);
    for (const x of [-3, 0.2]) g.box(x, 0.94 + wh, -1.6, 0.7, 0.45, 0.7, 0x8d9499); // chụp thông gió
    const ns = Math.min(3, 1 + (level >> 1)), sh = 4 + level * 0.5;
    for (let k = 0; k < ns; k++) {
      const z = -3.2 + k * 2.4;
      g.cyl(3.4, 0.14, z, 1, 1, sh, 0xc8ccd0, 10); g.cyl(3.4, 0.14 + sh, z, 1, 0.1, 0.8, 0xa8adb2, 10);
      for (let b = 1; b < 4; b++) g.cyl(3.4, 0.14 + (sh * b) / 4, z, 1.03, 1.03, 0.08, 0x9aa3aa, 10); // đai
      g.box(4.42, 0.14, z, 0.06, sh, 0.3, 0x6f7a82); // thang
    }
    g.at(new THREE.Matrix4().makeTranslation(1.2, 2.6 + level * 0.25, -3.2).multiply(new THREE.Matrix4().makeRotationZ(0.42))).box(0, 0, 0, 3.6, 0.2, 0.6, 0x5f6a72).at(null); // băng tải
    for (let k = 0; k < 2 + level; k++) g.box(-3.6 + (k % 4) * 1.5, 0.14 + ((k / 4) | 0) * 0.9, 3.4, 1.2, 0.9, 1.2, [0xb38a4f, 0xa07a42, 0x8f6a3a][k % 3]);
    g.box(-1.4, 0.14, 1.13, 2.4, 2.6, 0.08, 0x5a646c);
    for (let k = 1; k < 5; k++) g.box(-1.4, 0.14 + k * 0.52, 1.15, 2.4, 0.03, 0.04, 0x4a535a);
    g.box(1.6, 0.14, 3.2, 0.9, 0.7, 1.4, 0xe6a01e); g.box(1.6, 0.84, 2.9, 0.8, 0.7, 0.6, 0x2f3b45); g.box(1.6, 0.3, 4, 0.7, 0.06, 0.6, 0x6f7a82); // xe nâng
    return;
  }
  if (level >= 5) { // công nghệ cao
    g.box(0, 0.14, -0.6, 8.2, 6.4, 7, 0xeef1f3, true);
    g.box(0, 2.6, -0.6, 8.3, 0.7, 7.1, pick(r, [0x2f7fd0, 0x2aa37a, 0xe07b2e]));
    g.box(0, 6.54, -0.6, 8.4, 0.3, 7.2, 0x8a949c);
    g.box(0, 0.14, 2.95, 3, 3.6, 0.5, 0x9fc4e8); g.box(0, 3.74, 3.3, 3.6, 0.14, 1.3, 0x8a949c); // sảnh kính
    g.cyl(-2.2, 6.84, -1.4, 1.1, 1.4, 0.7, 0xd9dde0, 10); g.box(2, 6.84, -0.6, 2.6, 1, 2, 0x9aa3aa);
    for (let k = 0; k < 4; k++) g.at(new THREE.Matrix4().makeTranslation(-2.9 + k * 1.9, 7.1, -2.8).multiply(new THREE.Matrix4().makeRotationX(-0.45))).box(0, 0, 0, 1.6, 0.08, 1.3, 0x27457a).at(null); // pin mặt trời trên mái
    g.tree(-3.9, 0.14, 4, 0.7, 0x4f9440); g.tree(3.9, 0.14, 4, 0.7);
    return;
  }
  const brick = pick(r, [0xa5694d, 0x97715c, 0x8b8f93, 0xa9b3b8]), h = 3.6 + level * 0.9;
  g.box(-0.5, 0.14, -0.6, 8.2, h, 6.8, brick, level >= 4);
  g.box(-0.5, 0.14, -0.6, 8.3, 0.5, 6.9, 0x7c776f); // chân tường bê tông
  if (level >= 2) { // mái răng cưa có cửa lấy sáng
    for (let k = 0; k < 3; k++) { g.gable(-0.5, 0.14 + h, -2.87 + k * 2.27, 8.2, 1.2, 2.27, 0x6f7a82, true, brick); g.box(-0.5, 0.3 + h, -2.87 + k * 2.27 + 1.1, 7.6, 0.5, 0.06, 0xa9cfe8); }
  } else g.gable(-0.5, 0.14 + h, -0.6, 8.4, 1, 7, 0x6c7a86, variant !== 1, brick);
  // cửa xuất hàng: hai cửa cuốn, bệ, sọc cảnh báo
  for (const x of [-2.2, 1.2]) { g.box(x, 0.64, 2.83, 2.4, 2.5, 0.08, 0x4f5a62); for (let k = 1; k < 5; k++) g.box(x, 0.64 + k * 0.5, 2.86, 2.4, 0.03, 0.04, 0x3d464d); g.box(x, 3.14, 2.86, 2.6, 0.16, 0.1, 0xe6a01e); }
  g.box(-0.5, 0.14, 3.3, 6.6, 0.5, 0.95, 0x8a867e);
  for (let k = 0; k < 2 + (level >> 1); k++) g.box(-3.9 + (k % 3) * 1.15, 0.14 + ((k / 3) | 0) * 0.8, 4.25, 1, 0.8, 0.8, [0xb38a4f, 0x2f6fb0, 0xc0392b][k % 3]); // thùng hàng
  g.box(-0.5, h * 0.62, -4.08, 7.6, 0.22, 0.22, 0x8e979d); g.box(-0.5, h * 0.62 - 0.5, -4.08, 7.6, 0.14, 0.14, 0xc8a13a); // đường ống sau nhà
  if (level >= 2) { // ống khói sọc đỏ trắng
    const cx = variant === 1 ? -3.9 : 3.95, ch = 9 + level * 1.6;
    g.cyl(cx, 0.14, 3.7, 0.7, 0.5, ch, 0x9b6a55, 9, 0x2b2b2b);
    for (let k = 0; k < 3; k++) g.cyl(cx, ch - 0.8 - k * 1.5, 3.7, 0.58 + k * 0.03, 0.56 + k * 0.03, 0.75, k % 2 ? 0xc0392b : 0xf0ece4, 9);
  }
  if (level >= 3) { const tx = variant === 1 ? 3.6 : -3.6, th = 2.6 + level * 0.3; g.cyl(tx, 0.14, 3.7, 0.9, 0.9, th, 0xc8ccd0, 10); g.cyl(tx, 0.14 + th, 3.7, 0.9, 0.3, 0.35, 0xa8adb2, 10); g.box(tx + 0.92, 0.14, 3.7, 0.06, th, 0.3, 0x6f7a82); }
  if (level >= 4) { g.box(3.9, 0.14, -3.6, 1.2, 4 + h, 1.2, 0x8a949c); g.box(3.9, 4.14 + h, -3.6, 1.5, 0.12, 1.5, 0x6f7a82); }
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
  else if (zone === 4) tower(g, r, [4, 7, 11, 16, 24][level - 1] + v, pick(r, APT), { podium: level >= 3 ? 4 : 0, balcony: true });
  else if (zone === 2) shop(g, r, level, variant);
  else if (zone === 5) tower(g, r, [2, 4, 7, 11, 17][level - 1] + v, pick(r, [0xdcd3c4, 0xc8d2d8, 0xe2c9a8, 0x9fb6c8]), { podium: 4.4, shop: true, sign: pick(r, SIGNS), w: 7.6, d: 7 });
  else if (zone === 3) industry(g, r, level, variant);
  else if (zone === 20) marketStalls(g, r, level, variant);
  else if (zone === 21) workshop(g, r, level, variant);
  else if (zone === 6) tower(g, r, [4, 8, 14, 22, 34][level - 1] + v * 2, pick(r, GLASS), { glass: true, podium: level >= 2 ? 4.6 : 0, w: 7, d: 7, sign: level >= 3 ? pick(r, SIGNS) : null });
  else tower(g, r, [2, 4, 6, 9, 13][level - 1] + v, pick(r, APT), { podium: 4, shop: true, sign: pick(r, SIGNS), w: 6.6, d: 6.4 });
  return g.build();
}

const BARK = 0x5e4630, BARK2 = 0x6f5a44;
const slant = (x, y, z, rx, rz) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationZ(rz)).multiply(new THREE.Matrix4().makeRotationX(rx));

/**
 * Cây mọc tự nhiên. kind: 0 = cây tán tròn (xà cừ, sồi), 1 = cây tán xoè rộng (bàng, muồng), 3 = thông,
 * 4 = bụi cây, 5 = phượng đỏ. (2 là dừa: palmGeometry.) Gốc ở chân cây.
 */
export function treeGeometry(kind) {
  const g = new GB();
  if (kind === 0) {
    g.cyl(0, 0.4 - 0.4, 0, 0.36, 0.2, 3.4, BARK, 6);
    g.at(slant(0, 2.3, 0, 0.5, 0.45)).cyl(0, 0, 0, 0.13, 0.07, 1.8, BARK, 5); g.at(slant(0, 2.6, 0, -0.55, -0.4)).cyl(0, 0, 0, 0.12, 0.06, 1.7, BARK, 5); g.at(null);
    g.blob(0, 4.6, 0, 2.3, 1.9, 2.3, 0x4f9646, 1, 1);
    g.blob(1.25, 3.9, 0.6, 1.5, 1.2, 1.5, 0x45893f, 2, 0);
    g.blob(-1.15, 4.1, -0.8, 1.55, 1.25, 1.55, 0x5aa24b, 3, 0);
    g.blob(0.25, 5.9, 0.15, 1.35, 1.05, 1.35, 0x6bb356, 4, 0);
  } else if (kind === 1 || kind === 5) {
    const leaf = kind === 5 ? [0xe0553a, 0x5a9a46, 0x4f9040, 0xe8703a] : [0x62ac50, 0x559d46, 0x70ba5a, 0x4f9442];
    g.cyl(0, 0, 0, 0.34, 0.22, 2.6, BARK2, 6);
    g.at(slant(0, 2.4, 0, 0.6, 0.35)).cyl(0, 0, 0, 0.18, 0.09, 2.6, BARK2, 5);
    g.at(slant(0, 2.4, 0, -0.5, -0.6)).cyl(0, 0, 0, 0.17, 0.09, 2.6, BARK2, 5);
    g.at(null);
    g.blob(0, 5, 0, 2.6, 1.05, 2.6, leaf[0], 6, 1);
    g.blob(1.7, 4.6, 0.9, 1.7, 0.8, 1.7, leaf[1], 7, 0);
    g.blob(-1.6, 4.7, -1, 1.8, 0.85, 1.8, leaf[2], 8, 0);
    g.blob(-0.4, 4.5, 1.7, 1.4, 0.7, 1.4, leaf[3], 9, 0);
    g.blob(0.5, 5.6, -0.6, 1.5, 0.7, 1.5, leaf[kind === 5 ? 1 : 2], 10, 0);
  } else if (kind === 3) {
    g.cyl(0, 0, 0, 0.3, 0.14, 4.2, 0x5a4332, 5);
    const tiers = [[1.2, 2.3, 2.1], [2.3, 1.9, 1.9], [3.4, 1.45, 1.8], [4.5, 1, 1.6], [5.5, 0.6, 1.5]];
    tiers.forEach(([y, rr, hh], k) => {
      g.at(new THREE.Matrix4().makeRotationY(k * 0.7)).cyl(0, y, 0, rr, 0.12, hh, [0x356f45, 0x3a7a49, 0x41844e][k % 3], 7).at(null);
    });
  } else {
    g.blob(0, 0.55, 0, 0.95, 0.65, 0.95, 0x4a8a3c, 11, 0);
    g.blob(0.7, 0.45, 0.3, 0.7, 0.5, 0.7, 0x3f7d39, 12, 0);
    g.blob(-0.55, 0.4, -0.45, 0.6, 0.45, 0.6, 0x5a9a46, 13, 0);
  }
  return g.build();
}

/** Tảng đá rải trên sườn núi, bờ nước. */
export function rockGeometry() {
  const g = new GB();
  g.blob(0, 0.45, 0, 1.2, 0.75, 1, 0x8d8a80, 21, 0, 0.5);
  g.blob(0.9, 0.3, 0.5, 0.65, 0.45, 0.6, 0x7b786f, 22, 0, 0.5);
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

// ───────────────────────── xe các kiểu (đầu xe về +z, phần màu trắng được nhân màu riêng từng xe) ─────────────────────────
const TYRE = 0x1e1f22, GLASS_D = 0x2f3b45, LIGHT = 0xfff3b0, TAIL = 0xc0392b;
function wheels(g, half, zs, r = 0.42, w = 0.32) { for (const z of zs) for (const x of [-half, half]) g.box(x, 0, z, w, r * 2, r * 2, TYRE); }
function lights(g, w, zf, zb, y) { g.box(0, y, zf, w, 0.22, 0.05, LIGHT); g.box(0, y, zb, w, 0.22, 0.05, TAIL); }

/** Hình 3D cho một kiểu xe trong traffic.LOOKS hoặc một loại xe dịch vụ. */
export function vehicleGeometry(look) {
  const g = new GB();
  switch (look) {
    case 'hatch': g.box(0, 0.25, 0, 1.45, 0.62, 3, 0xffffff); g.box(0, 0.87, -0.35, 1.32, 0.6, 1.9, GLASS_D); g.box(0, 0.87, -0.35, 1.36, 0.55, 1.3, 0xffffff); wheels(g, 0.66, [0.95, -0.95], 0.34); lights(g, 1.2, 1.51, -1.51, 0.5); break;
    case 'suv': g.box(0, 0.32, 0, 1.75, 0.85, 3.9, 0xffffff); g.box(0, 1.17, -0.3, 1.66, 0.72, 2.6, GLASS_D); g.box(0, 1.17, -0.3, 1.7, 0.66, 1.9, 0xffffff); g.box(0, 1.92, -0.3, 1.4, 0.08, 2.2, 0x333333); wheels(g, 0.8, [1.25, -1.25], 0.45); lights(g, 1.5, 1.96, -1.96, 0.72); break;
    case 'taxi': g.box(0, 0.25, 0, 1.5, 0.6, 3.4, 0xffffff); g.box(0, 0.85, -0.2, 1.36, 0.55, 1.8, GLASS_D); g.box(0, 0.85, -0.2, 1.4, 0.5, 1.2, 0xffffff); g.box(0, 1.4, -0.2, 0.7, 0.28, 0.3, 0xf4f4f4); g.box(0, 0.5, 0, 1.52, 0.12, 2.2, 0x222222); wheels(g, 0.7, [1.1, -1.1], 0.34); lights(g, 1.3, 1.71, -1.71, 0.45); break;
    case 'pickup': g.box(0, 0.3, 0.2, 1.7, 0.7, 4.2, 0xffffff); g.box(0, 1, 0.8, 1.6, 0.7, 1.7, 0xffffff); g.box(0, 1.05, 0.75, 1.62, 0.5, 1.5, GLASS_D); g.box(0, 1, -1.05, 1.6, 0.35, 1.8, 0x5a4a3a); wheels(g, 0.78, [1.4, -1.2], 0.44); lights(g, 1.4, 2.31, -1.91, 0.65); break;
    case 'minivan': g.box(0, 0.3, 0, 1.75, 1.6, 4.3, 0xffffff); g.box(0, 1.15, 0.1, 1.78, 0.65, 3.9, GLASS_D); g.box(0, 0.3, 2.05, 1.6, 0.5, 0.3, 0xffffff); wheels(g, 0.8, [1.4, -1.4], 0.4); lights(g, 1.5, 2.16, -2.16, 0.65); break;
    case 'police': g.box(0, 0.25, 0, 1.5, 0.6, 3.4, 0xffffff); g.box(0, 0.85, -0.2, 1.36, 0.55, 1.8, GLASS_D); g.box(0, 0.85, -0.2, 1.4, 0.5, 1.2, 0xffffff); g.box(0, 1.4, -0.1, 1.1, 0.2, 0.35, 0xd0342c); g.box(0.3, 1.4, -0.1, 0.5, 0.21, 0.36, 0x2f6fff); g.box(0, 0.55, 0, 1.52, 0.18, 3.42, 0xf2f2f2); wheels(g, 0.7, [1.1, -1.1], 0.34); lights(g, 1.3, 1.71, -1.71, 0.45); break;
    // xe hai bánh
    case 'scooter': case 'duo': case 'cargomoto': {
      g.box(0, 0.3, 0, 0.5, 0.55, 1.6, 0xffffff); g.box(0, 0.62, -0.25, 0.46, 0.18, 0.8, 0x2a2a2a);
      g.box(0, 0, 0.7, 0.14, 0.48, 0.48, TYRE); g.box(0, 0, -0.68, 0.14, 0.48, 0.48, TYRE);
      g.box(0, 0.8, 0.6, 0.62, 0.07, 0.07, 0x222222);
      g.box(0, 0.8, -0.15, 0.48, 0.72, 0.38, 0x4a5560); g.cyl(0, 1.52, -0.1, 0.21, 0.19, 0.34, 0xf0d9b5, 6, 0x333333); // người lái
      if (look === 'duo') { g.box(0, 0.8, -0.62, 0.46, 0.7, 0.36, 0x8a5a7a); g.cyl(0, 1.5, -0.6, 0.2, 0.18, 0.32, 0xf0d9b5, 6, 0x3b2a1e); }
      if (look === 'cargomoto') { g.box(0, 0.75, -0.95, 0.9, 0.7, 0.9, 0xb38a4f); g.box(0, 1.45, -0.95, 0.7, 0.5, 0.7, 0xd9b98a); } // chở hàng cồng kềnh
      break;
    }
    case 'motorbike': g.box(0, 0.35, 0, 0.42, 0.45, 1.8, 0xffffff); g.box(0, 0.7, 0.15, 0.5, 0.35, 0.6, 0xffffff); g.box(0, 0, 0.78, 0.16, 0.6, 0.6, TYRE); g.box(0, 0, -0.75, 0.16, 0.6, 0.6, TYRE); g.box(0, 0.85, -0.2, 0.48, 0.7, 0.38, 0x2d3640); g.cyl(0, 1.55, -0.15, 0.23, 0.21, 0.36, 0x222222, 6, 0x222222); g.box(0, 1, 0.65, 0.66, 0.07, 0.07, 0x222222); break;
    case 'bicycle': g.box(0, 0, 0.55, 0.06, 0.62, 0.62, TYRE); g.box(0, 0, -0.55, 0.06, 0.62, 0.62, TYRE); g.box(0, 0.45, 0, 0.08, 0.08, 1.1, 0xffffff); g.box(0, 0.55, -0.15, 0.08, 0.5, 0.08, 0xffffff); g.box(0, 0.95, 0.45, 0.5, 0.06, 0.06, 0x222222); g.box(0, 0.8, -0.15, 0.4, 0.7, 0.32, 0x5b8a4a); g.cyl(0, 1.5, -0.08, 0.2, 0.18, 0.3, 0xf0d9b5, 6, 0xd8b93a); break;
    // xe tải
    case 'deliveryvan': g.box(0, 0.32, 0, 1.8, 2, 4.8, 0xffffff); g.box(0, 1.35, 2.41, 1.6, 0.7, 0.04, GLASS_D); g.box(0, 0.32, 2.3, 1.82, 0.4, 0.3, 0x444444); wheels(g, 0.82, [1.6, -1.6], 0.4); lights(g, 1.5, 2.41, -2.41, 0.7); break;
    case 'boxtruck': case 'reefer': {
      g.box(0, 0.45, 2.2, 2, 1.9, 1.8, 0xe9e9e9); g.box(0, 1.35, 3.11, 1.8, 0.7, 0.04, GLASS_D);
      g.box(0, 0.6, -0.9, 2.2, 2.6, 4.6, 0xffffff); g.box(0, 0.25, 0, 1.9, 0.35, 6.2, 0x2a2a2a);
      if (look === 'reefer') { g.box(0, 2.4, 1.36, 1.4, 0.7, 0.3, 0xd8dde0); g.box(0, 1.6, -0.9, 2.22, 0.3, 4.62, 0x2f7fd0); }
      wheels(g, 0.95, [2.2, -1.8, -2.6], 0.48); lights(g, 1.6, 3.12, -3.21, 0.8); break;
    }
    case 'container': {
      g.box(0, 0.5, 4.6, 2.3, 2.3, 2.2, 0xe2e2e2); g.box(0, 1.6, 5.71, 2, 0.8, 0.04, GLASS_D); g.box(0, 2.8, 4.2, 2.1, 0.5, 1.2, 0xe2e2e2); // đầu kéo
      g.box(0, 0.55, -1.1, 2.1, 0.25, 9, 0x3a3a3a); // rơ-moóc
      g.box(0, 0.8, -1.1, 2.4, 2.6, 8.8, 0xffffff);
      for (let k = 0; k < 9; k++) { g.box(-1.21, 0.9, -5.1 + k, 0.03, 2.4, 0.12, 0xdddddd); g.box(1.21, 0.9, -5.1 + k, 0.03, 2.4, 0.12, 0xdddddd); } // gân thùng
      wheels(g, 1.05, [4.8, 3.2, -4.2, -5.2], 0.5); lights(g, 1.8, 5.72, -5.56, 0.8); break;
    }
    case 'tanker': {
      g.box(0, 0.5, 3.6, 2.2, 2.2, 2.1, 0xffffff); g.box(0, 1.55, 4.66, 1.9, 0.8, 0.04, GLASS_D);
      g.box(0, 0.55, -1, 1.9, 0.25, 7, 0x3a3a3a);
      g.at(new THREE.Matrix4().makeTranslation(0, 1.85, -1).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))).cyl(0, -3.3, 0, 1.15, 1.15, 6.6, 0xd9dde0, 12, 0xc8ccd0).at(null);
      g.box(0, 3.05, -1, 0.5, 0.15, 5, 0x8a949c); g.box(0, 1.85, -4.32, 0.9, 0.5, 0.05, 0xe6a01e); // biển cảnh báo dễ cháy
      wheels(g, 1, [3.8, -2.8, -3.8], 0.5); lights(g, 1.7, 4.67, -4.35, 0.8); break;
    }
    case 'logtruck': {
      g.box(0, 0.5, 3.6, 2.2, 2.2, 2.1, 0xffffff); g.box(0, 1.55, 4.66, 1.9, 0.8, 0.04, GLASS_D);
      g.box(0, 0.55, -1, 2, 0.25, 7, 0x3a3a3a);
      for (const z of [1.8, -1, -3.8]) { g.box(-1, 0.8, z, 0.15, 2.4, 0.15, 0x333333); g.box(1, 0.8, z, 0.15, 2.4, 0.15, 0x333333); }
      for (let k = 0; k < 7; k++) { const x = -0.7 + (k % 3) * 0.7, y = 1.25 + ((k / 3) | 0) * 0.65; g.at(new THREE.Matrix4().makeTranslation(x, y, -1).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))).cyl(0, -3.6, 0, 0.32, 0.32, 7.2, 0x8a5a36, 6, 0xd9b98a).at(null); }
      wheels(g, 1, [3.8, -2.8, -3.8], 0.5); lights(g, 1.7, 4.67, -4.55, 0.8); break;
    }
    case 'dump': {
      g.box(0, 0.5, 2.4, 2.2, 2.2, 2, 0xffffff); g.box(0, 1.55, 3.41, 1.9, 0.8, 0.04, GLASS_D);
      g.box(0, 0.55, -1, 2.3, 0.3, 5, 0x3a3a3a);
      g.box(0, 0.85, -1, 2.3, 1.6, 4.8, 0xe6a01e, false, 0x6d6552); g.box(0, 2.3, -1, 2, 0.3, 4.4, 0x7b6f58); // thùng ben chở đất đá, nông sản
      wheels(g, 1.05, [2.6, -1.4, -2.6], 0.52); lights(g, 1.7, 3.42, -3.41, 0.8); break;
    }
    // xe dịch vụ
    case 'ambulance': g.box(0, 0.32, 0, 1.9, 2.2, 5, 0xffffff); g.box(0, 1.45, 2.51, 1.6, 0.7, 0.04, GLASS_D); g.box(0, 1.1, 0, 1.92, 0.3, 5.02, 0xd0342c); g.box(0, 2.52, 1.6, 1.2, 0.2, 0.4, 0xd0342c); g.box(0.95, 1.6, -0.6, 0.04, 0.9, 0.3, 0xd0342c); g.box(0.95, 1.6, -0.6, 0.04, 0.3, 0.9, 0xd0342c); wheels(g, 0.86, [1.7, -1.7], 0.42); lights(g, 1.5, 2.51, -2.51, 0.7); break;
    case 'fire': g.box(0, 0.5, 2.6, 2.3, 2.2, 1.8, 0xffffff); g.box(0, 1.6, 3.51, 2, 0.8, 0.04, GLASS_D); g.box(0, 0.5, -0.8, 2.3, 2, 5, 0xffffff); for (let k = 0; k < 3; k++) g.box(-1.16, 0.8, -2.5 + k * 1.6, 0.04, 1.4, 1.3, 0xd8d4cc); g.box(0, 2.6, -0.8, 0.9, 0.3, 5.6, 0xdcdcdc); for (let k = 0; k < 7; k++) g.box(0, 2.9, -3.4 + k * 0.85, 0.9, 0.06, 0.08, 0x9a9a9a); g.box(0, 2.75, 2.8, 1.4, 0.18, 0.35, 0x2f6fff); wheels(g, 1.05, [2.6, -1.6, -2.8], 0.5); lights(g, 1.8, 3.52, -3.31, 0.8); break;
    case 'garbage': g.box(0, 0.5, 2.5, 2.2, 2.2, 1.9, 0xffffff); g.box(0, 1.55, 3.46, 1.9, 0.8, 0.04, GLASS_D); g.at(new THREE.Matrix4().makeTranslation(0, 0.6, -0.9)).box(0, 0, 0, 2.3, 2.4, 4.6, 0xffffff).box(0, 2.4, -0.3, 2.1, 0.4, 3.8, 0xffffff).box(0, 0.2, -2.4, 2.2, 2, 0.4, 0x555555).at(null); wheels(g, 1, [2.5, -1.5, -2.6], 0.5); lights(g, 1.7, 3.47, -3.51, 0.8); break;
    case 'hearse': g.box(0, 0.25, 0, 1.6, 0.65, 4.8, 0xffffff); g.box(0, 0.9, -0.5, 1.5, 0.8, 3.4, 0xffffff); g.box(0, 1.0, 0.95, 1.48, 0.55, 0.6, GLASS_D); g.box(-0.76, 1.05, -0.8, 0.03, 0.5, 2.2, 0x8a7f70); g.box(0.76, 1.05, -0.8, 0.03, 0.5, 2.2, 0x8a7f70); wheels(g, 0.74, [1.6, -1.6], 0.36); lights(g, 1.3, 2.41, -2.41, 0.45); break;
    case 'tow': g.box(0, 0.5, 2, 2.1, 2, 1.9, 0xffffff); g.box(0, 1.5, 2.96, 1.8, 0.7, 0.04, GLASS_D); g.box(0, 0.6, -1, 2.2, 0.4, 4.2, 0x5b6670); g.at(new THREE.Matrix4().makeTranslation(0, 1.6, -1.6).multiply(new THREE.Matrix4().makeRotationX(0.5))).box(0, 0, 0, 0.35, 0.35, 3.4, 0x333333).at(null); g.box(0, 2.6, 2, 1.4, 0.2, 0.35, 0xe6a01e); wheels(g, 0.98, [2, -1.4, -2.4], 0.48); lights(g, 1.6, 2.97, -3.11, 0.75); break;
    default: return carGeometry();
  }
  return g.build();
}

const LOT_HEDGE = new Set(['clinic', 'school', 'highschool', 'police', 'fire', 'university', 'hospital', 'research', 'depot', 'shelter', 'theater', 'market', 'crematorium', 'recycle']);

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
    case 'port': { // cảng container: bãi bê tông, mép cầu cảng phía sau, 2 cẩu giàn, bãi container, kho, nhà điều hành
      pave(0x9a968e);
      g.box(0, 0.14, -12.6, e, 0.06, 0.4, 0xf2c14e); // vạch vàng mép cầu cảng
      for (let k = 0; k < 7; k++) g.box(-13 + k * 4.3, 0.2, -14.2, 0.6, 0.5, 0.6, 0x2f3b45); // cọc buộc tàu
      for (let k = 0; k < 6; k++) g.box(-12.5 + k * 5, 0.14, -14.6, 1, 1.2, 0.4, 0x222222); // đệm va lốp xe
      for (const x of [-6, 6]) { // cẩu giàn STS: 4 chân, dầm ngang, cần vươn ra biển, cabin
        for (const z of [-11, -5]) for (const dx of [-2.4, 2.4]) g.box(x + dx, 0.14, z, 0.6, 13, 0.6, 0xe6a01e);
        for (const z of [-11, -5]) g.box(x, 12.6, z, 5.6, 0.7, 0.7, 0xe6a01e);
        for (const dx of [-2.4, 2.4]) g.box(x + dx, 13.3, -9, 0.6, 0.8, 18, 0xe6a01e);
        g.box(x, 13.3, -17.5, 5.4, 0.5, 0.5, 0xe6a01e); g.box(x, 13.3, -1, 5.4, 0.5, 0.5, 0xe6a01e);
        g.box(x, 14.1, -6, 2.2, 3, 2.2, 0xe6a01e); g.cyl(x, 17.1, -6, 0.15, 0.15, 3, 0xe6a01e, 5); // tháp đỡ cáp
        g.box(x, 11.6, -13, 1.6, 1.1, 1.4, 0x39454f); g.box(x, 9.8, -13, 0.1, 1.8, 0.1, 0x222222); g.box(x, 9.2, -13, 2.4, 0.4, 1.2, 0xd9483b); // xe con, cáp, container đang cẩu
      }
      const rr = mulberry32(71), cols = [0xc0392b, 0x2f6fb0, 0xd8b93a, 0x3d8a5a, 0xe07b2e, 0x8a949c, 0xe6e6e6];
      for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) { // bãi container 3 dãy
        const h = 1 + ((rr() * 3) | 0), x = -12 + k * 3.1, z = 2.5 + row * 3;
        for (let q = 0; q < h; q++) g.box(x, 0.14 + q * 1.3, z, 2.8, 1.25, 2.5, cols[(rr() * cols.length) | 0]);
      }
      g.box(-3.4, 0.14, 5.5, 0.5, 5.4, 0.5, 0x3c4a55); g.box(1.4, 0.14, 5.5, 0.5, 5.4, 0.5, 0x3c4a55); g.box(-1, 5.3, 5.5, 5.4, 0.5, 9, 0x3c4a55); // cẩu khung bánh lốp
      g.box(9, 0.14, 7, 10, 5, 12, 0xb9c2c8, true); for (let k = 0; k < 4; k++) g.gable(9, 5.14, 2 + k * 3, 10.4, 1.4, 3, 0x7d8c94, true, 0xb9c2c8); // kho mái răng cưa
      g.box(9, 0.14, 13.4, 4, 3, 0.1, 0x55606a);
      g.box(-9.5, 0.14, 12, 7, 5, 4, 0xe9ecef, true); g.box(-9.5, 5.14, 12, 7.4, 0.3, 4.4, 0x2f6fb0); g.box(-9.5, 3.6, 14.05, 4, 0.8, 0.06, 0x2f6fb0); // nhà điều hành
      for (const [x, z] of [[-14, 0], [14, -2], [0, 14]]) { g.cyl(x, 0.14, z, 0.18, 0.12, 12, 0x8a949c, 6); g.box(x, 12, z, 1.6, 0.4, 0.8, 0xfff2c0); } // cột đèn pha
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
    case 'hotel': { // khách sạn 7 tầng, sảnh kính, biển tên trên nóc
      pave(0xcfc8b8);
      g.box(0, 0.14, -1, 14, 4.2, 12, 0xe8e2d4, true); g.box(0, 0.14, 5.2, 8, 3.4, 0.4, 0x7fb8d8); // sảnh
      g.box(0, 4.34, -2, 11, 20, 9, 0xf1ece2, true); g.box(0, 24.34, -2, 11.6, 0.6, 9.6, 0x8a6a45);
      g.box(0, 24.94, 2.3, 7, 1.8, 0.3, 0x2f3b45); g.box(0, 25.3, 2.5, 6.2, 1.1, 0.05, 0xf2c14e); // biển tên
      g.box(0, 4.34, 4.5, 12, 0.3, 3, 0x8a6a45); // mái sảnh
      for (const x of [-6.5, 6.5]) g.cyl(x, 0.14, 8, 0.12, 0.12, 5, 0xdddddd, 5);
      break;
    }
    case 'resort': { // khu nghỉ dưỡng: các dãy phòng thấp, hồ bơi, ô dù
      pave(0xd9cfb5);
      g.box(0, 0.14, -9, 26, 6, 7, 0xf4efe6, true); g.gable(0, 6.14, -9, 27, 2.6, 8, 0xb5552f, true, 0xf4efe6);
      for (const x of [-10, 10]) { g.box(x, 0.14, 3, 6, 4, 11, 0xf4efe6, true); g.gable(x, 4.14, 3, 7, 2, 12, 0xb5552f, true, 0xf4efe6); }
      g.box(0, 0.05, 4, 10, 0.25, 12, 0x3fb6dc); g.box(0, 0.02, 4, 11.4, 0.2, 13.4, 0xe9e4da); // hồ bơi
      for (const [x, z] of [[-3, 11.5], [3, 11.5], [0, -3]]) { g.cyl(x, 0.14, z, 0.08, 0.08, 2.4, 0xdddddd, 4); g.cyl(x, 2.4, z, 1.6, 0.1, 0.8, 0xe8894a, 8); }
      for (const [x, z] of [[-12.5, 12.5], [12.5, 12.5], [-12.5, -2.5], [12.5, -2.5]]) { g.cyl(x, 0.14, z, 0.3, 0.25, 5, 0x7a5d3c, 6); g.blob(x, 6, z, 1.8, 1.2, 1.8, 0x4f9440, 41, 0); }
      break;
    }
    case 'museum': { // bảo tàng: bậc thềm, hàng cột, trán tường tam giác
      pave(0xd3c9b4);
      g.box(0, 0.14, -1, 17, 1, 13, 0xd8d2c4); g.box(0, 1.14, -2, 15, 7, 10, 0xece6d8, true);
      for (let k = 0; k < 6; k++) g.cyl(-6.25 + k * 2.5, 1.14, 4.2, 0.45, 0.45, 6.6, 0xf4f0e6, 10);
      g.box(0, 7.74, 1.2, 16, 0.8, 7, 0xe2dccd); g.gable(0, 8.54, 1.2, 16.4, 2.6, 7.2, 0xd6cfbe, false, 0xe2dccd);
      g.box(0, 0.14, 7.2, 9, 0.5, 3, 0xcfc8b8); // bậc thềm
      break;
    }
    case 'pagoda': { // chùa: cổng tam quan, chính điện mái cong hai tầng, sân lát gạch
      pave(0xc9a77c);
      g.box(0, 0.14, -3, 13, 4, 8, 0xe8c56a); g.gable(0, 4.14, -3, 15.5, 2.6, 10, 0x8e3b2a, true, 0xe8c56a);
      g.box(0, 6.4, -3, 8, 1.4, 5, 0xe8c56a); g.gable(0, 7.8, -3, 10, 2.2, 6.8, 0x8e3b2a, true, 0xe8c56a);
      for (const x of [-7.4, 7.4]) g.cyl(x, 6.6, -3, 0.25, 0.05, 1.4, 0x8e3b2a, 5); // đầu đao
      for (const x of [-3.5, 0, 3.5]) { g.box(x, 0.14, 7.5, 0.7, 4.6, 0.7, 0xb8862f); }
      g.box(0, 4.74, 7.5, 9, 0.5, 1.4, 0x8e3b2a); g.box(0, 3.4, 7.85, 3, 0.9, 0.05, 0xd0342c); // cổng tam quan
      g.cyl(-6.5, 0.14, 3.5, 0.5, 0.6, 1, 0x6b6b6b, 8); g.cyl(-6.5, 1.14, 3.5, 0.35, 0.1, 2.4, 0x7a7a7a, 4); // lư hương đá
      g.cyl(6.5, 0.14, 3, 0.3, 0.25, 4, 0x7a5d3c, 6); g.blob(6.5, 5, 3, 2.2, 1.6, 2.2, 0x3f8a3a, 43, 0); // cây đa
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
    case 'ferry': { // bến tàu khách: nhà ga mái vòm kính, cầu dẫn có mái che ra phao nổi phía sau (mặt nước), quầy vé, ghế chờ
      pave(0xd8d0bd);
      g.box(0, 0.14, 3, 15, 4.4, 7, 0xf4efe6); glassBand(g, 0, 1.2, 3, 15, 2.6, 7, 0x3b6f8f); // sảnh chờ kính
      for (let k = 0; k < 6; k++) { // mái vòm: các dải nghiêng tạo cung
        const a0 = (k / 6) * Math.PI, a1 = ((k + 1) / 6) * Math.PI, r = 4.4;
        const am = (a0 + a1) / 2, nl = Math.hypot(Math.sin(am) / 2.2, Math.cos(am) / r);
        g.poly([[-8, 4.54 + Math.sin(a0) * 2.2, 3 - Math.cos(a0) * r], [8, 4.54 + Math.sin(a0) * 2.2, 3 - Math.cos(a0) * r], [8, 4.54 + Math.sin(a1) * 2.2, 3 - Math.cos(a1) * r], [-8, 4.54 + Math.sin(a1) * 2.2, 3 - Math.cos(a1) * r]], [0, Math.sin(am) / 2.2 / nl, -Math.cos(am) / r / nl], k % 2 ? 0x2f6fb0 : 0x3d7fc0);
      }
      g.box(0, 4.4, 7.55, 8, 1.1, 0.12, 0xffffff); g.box(0, 4.55, 7.62, 7.2, 0.8, 0.05, 0x2f6fb0); // biển BẾN TÀU KHÁCH
      g.box(-6, 0.14, 8.6, 2.2, 2.4, 1.6, 0xe8894a); g.box(-6, 2.54, 8.6, 2.6, 0.2, 2, 0xd0342c); // quầy vé
      for (let k = 0; k < 3; k++) g.box(1 + k * 2.4, 0.14, 8.8, 1.8, 0.45, 0.6, 0x8a6a45); // ghế chờ ngoài trời
      g.box(0, 0.14, -4, 2.4, 0.5, 6, 0x9c7a52); g.box(0, 2.6, -4, 3, 0.15, 6.2, 0x2f6fb0); // cầu dẫn có mái
      for (const x of [-1.3, 1.3]) for (const z of [-6.6, -1.4]) g.box(x, 0.64, z, 0.12, 2, 0.12, 0xdddddd);
      g.box(0, 0, -8.4, 12, 0.5, 2.8, 0x6f7a84); g.box(0, 0.5, -8.4, 12, 0.08, 2.8, 0xb9a27a); // phao nổi
      for (const x of [-5.4, -1.8, 1.8, 5.4]) g.box(x, 0.58, -9.6, 0.4, 0.6, 0.4, 0x2f3b45); // cọc buộc
      for (const x of [-5.8, 5.8]) { g.cyl(x, 0.58, -7.2, 0.1, 0.08, 3.4, 0x8a949c, 6); g.box(x, 3.9, -7.2, 0.6, 0.3, 0.6, 0xfff2c0); } // đèn
      g.cyl(-6.5, 0.58, -9.2, 0.35, 0.35, 0.5, 0xf28a1e, 8); // phao cứu sinh
      break;
    }
    case 'beach': { // bãi biển: cát hai tông, dù che nắng, ghế nằm, chòi cứu hộ, quán nước, lưới bóng chuyền, dừa
      g.box(0, 0, 0, e, 0.14, e, 0xecd9a8);
      g.box(0, 0.141, -9, e, 0.02, 11, 0xdcc48d); // cát ướt phía mép nước (sau)
      g.box(0, 0.16, -14.2, e, 0.02, 1.2, 0xf4f8fa); // bọt sóng
      const rr = mulberry32(53), um = [0xd0342c, 0x2f8fd0, 0xf2c14e, 0x2aa37a, 0xe8894a, 0xffffff];
      for (let k = 0; k < 9; k++) {
        const x = -11 + (k % 5) * 5.5 + (rr() - 0.5), z = -4 + ((k / 5) | 0) * 6 + (rr() - 0.5) * 1.5;
        g.cyl(x, 0.14, z, 0.07, 0.07, 2.6, 0xeeeeee, 4); g.cyl(x, 2.3, z, 1.5, 0.05, 0.7, um[(rr() * um.length) | 0], 8); // dù
        for (const dx of [-0.8, 0.8]) { g.box(x + dx, 0.14, z + 1.3, 0.6, 0.25, 1.6, 0xffffff); g.box(x + dx, 0.39, z + 0.65, 0.6, 0.35, 0.3, 0xffffff); } // ghế nằm
        g.box(x + 1.8, 0.15, z - 0.8, 0.8, 0.02, 1.6, um[(rr() * um.length) | 0]); // khăn tắm
      }
      g.box(10.5, 0.14, -9, 0.2, 3.4, 0.2, 0xffffff); g.box(12, 0.14, -9, 0.2, 3.4, 0.2, 0xffffff); g.box(11.25, 3.5, -9, 2.2, 0.2, 2, 0xd0342c); g.box(11.25, 3.7, -9, 1.6, 1.4, 1.6, 0xffffff); g.gable(11.25, 5.1, -9, 2.2, 0.8, 2.2, 0xd0342c); // chòi cứu hộ
      g.box(-11, 0.14, 10, 6, 2.8, 3.4, 0x9c7a52); g.gable(-11, 2.94, 10, 7, 1.6, 4.4, 0xc9a77c, true); g.box(-11, 0.14, 12, 6, 1.1, 0.6, 0x7a5d3c); // quán nước mái lá
      for (const x of [-0.5, 6.5]) g.cyl(x, 0.14, 8, 0.06, 0.06, 2.4, 0xeeeeee, 4); g.box(3, 1.7, 8, 7, 0.7, 0.04, 0xf4f4f4); // lưới bóng chuyền
      for (const [x, z] of [[-13, 3], [13.5, 4], [6, 13], [-4, 13.5]]) { // dừa
        for (let k = 0; k < 6; k++) g.cyl(x + k * 0.12, 0.14 + k * 1.1, z, 0.28 - k * 0.02, 0.26 - k * 0.02, 1.15, 0x8a6a45, 6);
        for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; g.at(new THREE.Matrix4().makeTranslation(x + 0.7, 6.8, z).multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeRotationX(0.45))).box(0, 0, 1.3, 0.7, 0.07, 2.6, k % 2 ? 0x4f9440 : 0x5fa848).at(null); }
      }
      for (let k = 0; k < 4; k++) g.box(-6 + k * 3.5, 0.14, -12.5 + (k % 2), 0.5, 0.5, 0.5, 0xf2c14e); // phao bơi
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
  // viền lô đất: bó vỉa quanh lô; công trình công cộng sát đường thêm bờ giậu hai bên, sau lưng và cột đèn ở cổng
  const h2 = e / 2;
  for (const [x, z, w, d] of [[0, -h2 + 0.09, e, 0.18], [0, h2 - 0.09, e, 0.18], [-h2 + 0.09, 0, 0.18, e], [h2 - 0.09, 0, 0.18, e]]) g.box(x, 0.14, z, w, 0.1, d, 0x8f8b82);
  if (LOT_HEDGE.has(type)) {
    g.hedge(-h2 + 0.5, -h2 + 0.45, h2 - 0.5, -h2 + 0.45); g.hedge(-h2 + 0.45, -h2 + 0.5, -h2 + 0.45, h2 - 2.5); g.hedge(h2 - 0.45, -h2 + 0.5, h2 - 0.45, h2 - 2.5);
    for (const sd of [-1, 1]) { g.cyl(sd * (h2 - 0.7), 0.14, h2 - 0.7, 0.09, 0.07, 3.6, 0x3f464d, 5); g.blob(sd * (h2 - 0.7), 3.85, h2 - 0.7, 0.26, 0.26, 0.26, 0xfff1c4, 1, 0, 0); }
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

// ───────────────────────── phong cách Việt Nam ─────────────────────────

const VN_WALL = [0xf3d36b, 0xf2b8a2, 0xb9e0c8, 0xa9cbe8, 0xf4ead2, 0xe9a96a, 0xd8c3e6, 0xfff2b0];
const VN_ROOF = [0xb4453a, 0x3f6fa8, 0x9a9a9a, 0x5a8a5a];
const VN_SIGN = [0xd8262e, 0xf2c200, 0x1f6fc8, 0x16935a, 0xe8681f];

/** Cờ đỏ sao vàng nhỏ trên cột: gốc ở chân cột, lá cờ hướng theo +x. */
export function flagParts(g, x, y, z, h = 3.2) {
  g.cyl(x, y, z, 0.05, 0.05, h, 0xd8d4cc, 4);
  g.box(x + 0.75, y + h - 1, z, 1.5, 1, 0.04, 0xda251d);
  // ngôi sao 5 cánh vẽ bằng tam giác, hai mặt
  const cx = x + 0.75, cy = y + h - 0.5, R = 0.3, r = 0.12, pts = [];
  for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r : R; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  for (const zz of [z + 0.025, z - 0.025]) for (let k = 0; k < 10; k++) {
    const a = pts[k], b = pts[(k + 1) % 10];
    g.poly([[cx, cy, zz], [a[0], a[1], zz], [b[0], b[1], zz]], [0, 0, zz > z ? 1 : -1], 0xffde00);
  }
  return g;
}

/**
 * Một căn nhà ống: rộng w, sâu d, cao `floors` tầng; mặt tiền quay về +z.
 * Ban công từng tầng có lan can và chậu cây, tầng trệt cửa cuốn hoặc cửa hàng, trên mái bồn nước inox, máy nước nóng, tum mái tôn.
 */
function tubeHouse(g, r, x, w, d, floors, shopSign) {
  const wall = pick(r, VN_WALL), z0 = 4.6 - d, zf = 4.6, h = floors * FLOOR;
  g.box(x, 0.14, z0 + d / 2, w, h, d, wall, true);
  // tầng trệt
  if (shopSign != null) {
    g.box(x, 0.14, zf + 0.02, w - 0.5, 2.6, 0.08, 0x3a3f46); // khoang cửa hàng mở
    g.box(x, 2.85, zf + 0.06, w - 0.1, 0.95, 0.18, shopSign); // biển hiệu
    g.at(new THREE.Matrix4().makeTranslation(x, 2.7, zf + 0.6).multiply(new THREE.Matrix4().makeRotationX(0.35))).box(0, 0, 0, w - 0.2, 0.06, 1.3, pick(r, [0xd8262e, 0x1f6fc8, 0x16935a, 0xf2c200])).at(null); // mái che bạt
  } else g.box(x, 0.14, zf + 0.03, w - 0.6, 2.5, 0.08, 0x9aa1a6); // cửa cuốn
  // ban công các tầng trên
  for (let f = 1; f < floors; f++) {
    const y = 0.14 + f * FLOOR;
    g.box(x, y - 0.1, zf + 0.55, w, 0.14, 1.1, 0xd9d4c8);
    g.box(x, y + 0.04, zf + 1.07, w, 0.9, 0.06, 0x6e6a66); // lan can sắt
    if (r() > 0.35) g.box(x - w * 0.3, y + 0.04, zf + 0.75, 0.45, 0.5, 0.4, 0x4f9440); // chậu cây
    g.box(x, y + 0.2, zf + 0.04, w * 0.55, 1.9, 0.06, 0x7fa3bf); // cửa kính
  }
  // mái bằng, tum mái tôn, bồn nước inox, máy nước nóng năng lượng mặt trời
  g.box(x, 0.14 + h, z0 + d / 2, w + 0.1, 0.35, d + 0.1, 0x8d887e);
  const top = 0.49 + h;
  g.box(x, top, z0 + d * 0.3, w * 0.7, 2.2, d * 0.35, wall);
  g.gable(x, top + 2.2, z0 + d * 0.3, w * 0.8, 0.5, d * 0.42, pick(r, VN_ROOF), false, wall);
  g.at(new THREE.Matrix4().makeTranslation(x + w * 0.15, top + 0.6, z0 + d * 0.72).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))).cyl(0, -0.75, 0, 0.55, 0.55, 1.5, 0xd7dde2, 10, 0xe9eef2).at(null);
  g.box(x + w * 0.15, top, z0 + d * 0.72, 1.3, 0.1, 0.5, 0x8a949c);
  if (r() > 0.5) g.at(new THREE.Matrix4().makeTranslation(x - w * 0.2, top + 0.5, zf - 1.2).multiply(new THREE.Matrix4().makeRotationX(-0.55))).box(0, 0, 0, 1.4, 0.08, 1.1, 0x23365e).at(null);
}

/** Nhà theo phong cách Việt Nam cho các khu dân cư thấp / trung bình, liền kề, hỗn hợp, cửa hàng, giải trí, ký túc xá. Không hợp thì trả null. */
export function growableVN(zone, level, variant) {
  const vn = { 1: 'home', 13: 'home', 14: 'home', 16: 'home', 7: 'shop', 2: 'shop', 17: 'shop' }[zone];
  if (!vn) return null;
  const r = mulberry32(zone * 977 + level * 131 + variant * 17 + 3), g = new GB();
  g.box(0, -6, 0, 9.7, 6, 9.7, FOUND);
  g.box(0, 0, 0, 9.7, 0.14, 9.7, 0xb9b5aa); // sân xi măng trước nhà
  const n = level >= 4 ? 3 : 2, w = 9.4 / n, base = (zone === 1 ? 1 : 2) + Math.min(level, 4);
  for (let k = 0; k < n; k++) {
    const floors = Math.max(2, base + ((r() * 3) | 0) - 1), x = -4.7 + w * (k + 0.5);
    tubeHouse(g, r, x, w - 0.12, 7.6 + r() * 0.8, floors, vn === 'shop' || (zone === 13 && r() > 0.6) ? pick(r, VN_SIGN) : null);
  }
  if (variant === 0) flagParts(g, -4.4, 3.14, 4.9, 2.6); // cờ treo ở ban công tầng 2
  if (vn === 'shop') for (let k = 0; k < 4; k++) g.box(-3.6 + k * 2.3, 0.14, 6.1 + (k % 2) * 0.5, 0.45, 0.45, 0.45, [0xd8262e, 0x1f6fc8][k % 2]); // ghế nhựa vỉa hè
  return g.build();
}

/** Cây dừa: thân cong nhẹ có đốt, tàu lá dài rủ xuống đầu ngọn, buồng dừa. */
/**
 * Thân tàu thon mũi: một dải vỏ từ y0 tới y1, bề rộng đáy dải = f0 × rộng mạn, đỉnh dải = f1 × rộng mạn.
 * Mũi tàu hướng +z, dài L, rộng B, đoạn mũi thon dài bow; lái tàu bo tròn nhẹ.
 */
function hullBand(g, L, B, bow, y0, y1, f0, f1, color, lift = 0) {
  const n = 9, prof = [];
  const zs = -L / 2, zb = L / 2 - bow;
  prof.push([zs, 0.78], [zs + 0.6, 0.94], [zs + 1.6, 1]);
  for (let k = 0; k <= n; k++) { const t = k / n; prof.push([zb + bow * t, Math.max(0, 1 - t ** 1.9)]); }
  const rise = (z, y) => (z > zb ? ((z - zb) / bow) ** 2 * lift * (y - y0 + 0.4) / (y1 - y0 + 0.4) : 0); // mũi hếch lên
  for (let k = 0; k < prof.length - 1; k++) {
    const [za, wa] = prof[k], [zc, wc] = prof[k + 1];
    for (const sgn of [-1, 1]) {
      const A0 = [sgn * wa * f0 * B / 2, y0 + rise(za, y0), za], C0 = [sgn * wc * f0 * B / 2, y0 + rise(zc, y0), zc];
      const A1 = [sgn * wa * f1 * B / 2, y1 + rise(za, y1), za], C1 = [sgn * wc * f1 * B / 2, y1 + rise(zc, y1), zc];
      if (Math.abs(A0[0] - C0[0]) + Math.abs(A1[0] - C1[0]) + Math.abs(za - zc) < 1e-4) continue;
      g.poly(sgn > 0 ? [A0, C0, C1, A1] : [C0, A0, A1, C1], null, color);
    }
  }
  const w0 = 0.78 * B / 2;
  g.poly([[-w0 * f0, y0, zs], [w0 * f0, y0, zs], [w0 * f1, y1, zs], [-w0 * f1, y1, zs]], [0, 0, -1], color); // vách lái
  return prof;
}
/** Sàn tàu phẳng theo đường viền thân ở cao độ y. */
function hullDeck(g, L, B, bow, y, color, f = 1) {
  const n = 9, zs = -L / 2, zb = L / 2 - bow, prof = [[zs, 0.78], [zs + 0.6, 0.94], [zs + 1.6, 1]];
  for (let k = 0; k <= n; k++) { const t = k / n; prof.push([zb + bow * t, Math.max(0, 1 - t ** 1.9)]); }
  for (let k = 0; k < prof.length - 1; k++) {
    const [za, wa] = prof[k], [zc, wc] = prof[k + 1], ha = wa * f * B / 2, hc = wc * f * B / 2;
    if (hc < 1e-3) g.poly([[-ha, y, za], [ha, y, za], [0, y, zc]], [0, 1, 0], color);
    else g.poly([[-ha, y, za], [ha, y, za], [hc, y, zc], [-hc, y, zc]], [0, 1, 0], color);
  }
}
/** Dải cửa kính chạy quanh một tầng (hai bên mạn + phía trước). */
function glassBand(g, x, y, z, w, h, d, color = 0x22303a) {
  g.box(x, y, z, w + 0.06, h, d - 0.4, color); g.box(x, y, z + d / 2 - 0.1, w - 0.4, h, 0.24, color);
}

/** Tàu thuỷ, mũi hướng +z, mặt nước ở y = 0. kind 0 = tàu khách hai tầng, 1 = tàu hàng chở container. */
export function shipGeometry(kind) {
  const g = new GB();
  if (kind === 1) { // tàu container
    const L = 30, B = 6.4, bow = 7;
    hullBand(g, L, B, bow, -1.6, -0.5, 0.55, 0.92, 0xa8382e, 0.6); // đáy đỏ dưới nước
    hullBand(g, L, B, bow, -0.5, 0.15, 0.92, 0.97, 0xf2f2f2, 0.6); // vạch trắng mớn nước
    hullBand(g, L, B, bow, 0.15, 2.1, 0.97, 1, 0x1f3a5c, 1.2); // mạn xanh than
    hullDeck(g, L, B, bow, 2.1 + 0.001, 0x4a5560);
    g.box(0, 2.1, 12.2, 3.2, 0.9, 1.4, 0x1f3a5c); g.cyl(0, 3, 13.4, 0.08, 0.08, 3.2, 0xdedede, 4); // mũi, cột mũi
    const cols = [0xd9483b, 0x2f7fd0, 0x2aa37a, 0xe0a030, 0x8a5fb0, 0xe6e6e6, 0x3d4f5f];
    const rr = mulberry32(17);
    for (let row = 0; row < 7; row++) for (let col = 0; col < 3; col++) {
      const h = 1 + ((rr() * 3) | 0), z = 8.2 - row * 2.5;
      for (let k = 0; k < h; k++) g.box(-2 + col * 2, 2.1 + k * 1.05, z, 1.9, 1, 2.4, cols[(rr() * cols.length) | 0]);
    }
    // đài chỉ huy phía lái: khối trắng nhiều tầng, cánh gà, ống khói
    g.box(0, 2.1, -11, 5.6, 2, 3.6, 0xf2f2f2); g.box(0, 4.1, -11, 5, 2, 3.2, 0xf2f2f2); g.box(0, 6.1, -11, 4.4, 1.7, 3, 0xf2f2f2);
    for (const y of [2.8, 4.8]) glassBand(g, 0, y, -11, y < 4 ? 5.6 : 5, 0.55, y < 4 ? 3.6 : 3.2);
    g.box(0, 6.6, -9.45, 4.2, 0.7, 0.06, 0x22303a); g.box(0, 7.8, -11, 7.4, 0.2, 2, 0xdedede); // kính lái, cánh gà
    g.cyl(0, 7.8, -12.2, 0.7, 0.8, 2.6, 0xd9483b, 10, 0x222222); g.cyl(0, 9.2, -12.2, 0.72, 0.72, 0.4, 0x222222, 10);
    g.cyl(0, 8, -10.6, 0.06, 0.06, 2.6, 0xdedede, 4); g.box(0, 10.2, -10.6, 1.4, 0.08, 0.08, 0xdedede); // cột ra đa
    return g.build();
  }
  // tàu khách: thân trắng sọc xanh, hai tầng khoang kính, boong ngắm cảnh, xuồng cứu sinh, ống khói
  const L = 16, B = 4.8, bow = 5;
  hullBand(g, L, B, bow, -1.2, -0.3, 0.6, 0.9, 0x1f4f8a, 0.4);
  hullBand(g, L, B, bow, -0.3, 0.25, 0.9, 0.96, 0x2f8fd0, 0.5); // sọc xanh mớn nước
  hullBand(g, L, B, bow, 0.25, 1.2, 0.96, 1, 0xffffff, 0.9);
  hullDeck(g, L, B, bow, 1.2, 0xc9b38a); // sàn gỗ
  for (const x of [-1, 1]) g.box(x * (B / 2 - 0.05), 1.2, -1.5, 0.08, 0.7, 10, 0xe8e8e8); // lan can mạn
  g.box(0, 1.2, 5.6, 1.6, 0.7, 0.08, 0xe8e8e8);
  // tầng 1
  g.box(0, 1.2, -1.4, 4.2, 1.7, 9.2, 0xffffff); glassBand(g, 0, 1.75, -1.4, 4.2, 0.75, 9.2);
  g.box(0, 2.9, -1.4, 4.5, 0.15, 9.6, 0x2f8fd0);
  // tầng 2 lùi về sau, buồng lái kính nghiêng phía trước
  g.box(0, 3.05, -2.4, 3.8, 1.5, 6.2, 0xffffff); glassBand(g, 0, 3.5, -2.4, 3.8, 0.7, 6.2);
  g.poly([[-1.9, 3.05, 0.7], [1.9, 3.05, 0.7], [1.9, 4.55, 0.2], [-1.9, 4.55, 0.2]], null, 0x1a2a36);
  g.box(0, 4.55, -2.6, 4, 0.14, 6.8, 0xf2f2f2);
  for (const x of [-1, 1]) g.box(x * 1.95, 4.69, -3.2, 0.06, 0.6, 5.2, 0xe8e8e8); // lan can boong trên
  for (let k = 0; k < 3; k++) for (const x of [-0.9, 0.9]) g.box(x, 4.69, -4.6 + k * 1.4, 0.8, 0.4, 0.5, 0x2f8fd0); // ghế boong
  g.cyl(0, 4.69, -0.6, 0.05, 0.05, 2.6, 0xdedede, 4); g.box(0.45, 6.8, -0.6, 0.8, 0.5, 0.03, 0xd0342c); // cột cờ
  g.cyl(0, 4.69, -5.4, 0.45, 0.55, 1.5, 0xf2f2f2, 10); g.cyl(0, 5.8, -5.4, 0.46, 0.46, 0.4, 0x2f8fd0, 10, 0x222222); // ống khói
  for (const x of [-1, 1]) for (const z of [-4.4, 0.6]) g.box(x * 2.3, 2.95, z, 0.6, 0.55, 1.8, 0xf28a1e); // xuồng cứu sinh
  g.box(0, 1.2, -7.6, 3.6, 0.3, 0.8, 0xc9b38a); // bậc lên xuống phía lái
  return g.build();
}

export function palmGeometry() {
  const g = new GB();
  g.cyl(0, 0, 0, 0.42, 0.34, 0.45, 0x7a5d3c, 7);
  for (let k = 0; k < 7; k++) g.cyl(k * k * 0.022, 0.3 + k * 1.05, 0, 0.3 - k * 0.022, 0.28 - k * 0.022, 1.1, k % 2 ? 0x8a6a45 : 0x7d5f3d, 5);
  const tx = 0.85, top = 7.55;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + (k % 2) * 0.2, tilt = 0.25 + (k % 3) * 0.2, col = k % 2 ? 0x4f9440 : 0x5fa848;
    // mỗi tàu lá hai đoạn, đoạn ngoài rủ xuống
    const base = new THREE.Matrix4().makeTranslation(tx, top, 0).multiply(new THREE.Matrix4().makeRotationY(a));
    g.at(base.clone().multiply(new THREE.Matrix4().makeRotationX(-0.3 + tilt))).box(0, 0, 1.2, 0.85, 0.07, 2.4, col);
    g.at(base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.55 - tilt * 2.3, 2.2)).multiply(new THREE.Matrix4().makeRotationX(0.55 + tilt))).box(0, 0, 0.9, 0.55, 0.06, 1.9, 0x478a3d);
  }
  g.at(null);
  g.blob(tx, top - 0.1, 0, 0.5, 0.45, 0.5, 0x6b5a33, 31, 0);
  for (const [x, z] of [[0.3, 0.25], [-0.25, 0.2], [0, -0.32]]) g.blob(tx + x, top - 0.6, z, 0.24, 0.26, 0.24, 0x7a8a3a, 32, 0, 0.1);
  return g.build();
}

// ───────────────────────── công trường: xe công trình, cần cẩu (đầu xe về +z) ─────────────────────────
const CAT = 0xf2b21b, CAT_D = 0xc98d0e, STEELG = 0x4a4f55;
function tracks(g, half, len, h = 0.85, w = 0.7) {
  for (const x of [-half, half]) { g.box(x, 0, 0, w, h, len, 0x2a2b2e); g.box(x, h * 0.25, 0, w + 0.04, h * 0.5, len - 0.8, 0x3c3e42); }
}
function cab(g, x, y, z, w, h, d, col = CAT) {
  g.box(x, y, z, w, h, d, col); g.box(x, y + h * 0.35, z, w + 0.04, h * 0.5, d - 0.3, GLASS_D); g.box(x, y + h, z, w + 0.1, 0.1, d + 0.1, col);
}

/**
 * Xe công trình: { geometry, top?: { geometry, pos } } — top là phần quay được (thân máy xúc).
 * kind: excavator (máy xúc), dump (xe ben), mixer (xe bồn trộn bê tông), dozer (máy ủi), tractor (máy kéo + rơ moóc),
 * roller (xe lu), mcrane (xe cẩu bánh lốp).
 */
export function siteVehicle(kind) {
  const g = new GB();
  let top = null;
  switch (kind) {
    case 'excavator': {
      tracks(g, 1.1, 4.2); g.box(0, 0.75, 0, 1.6, 0.35, 2.2, 0x2a2b2e); g.cyl(0, 1.05, 0, 0.9, 0.9, 0.2, 0x2a2b2e, 10);
      const t = new GB();
      t.box(0, 0, -0.4, 2.6, 1.1, 3, CAT); t.box(0, 1.1, -1.4, 2.4, 0.5, 1, CAT_D); // thân + đối trọng
      cab(t, -0.75, 1.1, 0.5, 1, 1.5, 1.4);
      t.box(0.25, 1.4, 0.3, 0.12, 0.6, 0.12, 0x333333); // ống xả
      // cần (boom) chéo lên, tay (arm) gập xuống, gầu
      const M = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), O = new THREE.Vector3(1, 1, 1);
      t.at(M.compose(V.set(0.5, 1.4, 2.1), Q.setFromEuler(E.set(-0.75, 0, 0)), O)).box(0, -0.3, 0, 0.5, 0.6, 3.6, CAT).at(null);
      t.at(M.compose(V.set(0.5, 2.7, 4.2), Q.setFromEuler(E.set(0.9, 0, 0)), O)).box(0, -0.25, 0, 0.4, 0.5, 2.8, CAT).at(null);
      t.box(0.5, 0.25, 5.1, 1, 0.8, 0.8, STEELG); t.box(0.5, 0.25, 5.55, 1.05, 0.1, 0.3, 0x8a8f95);
      top = { geometry: t.build(), pos: [0, 1.25, -0.2] };
      break;
    }
    case 'dump': {
      wheels(g, 1.05, [2.4, -0.9, -2.3], 0.55, 0.45);
      g.box(0, 0.6, 0, 1.9, 0.35, 6.4, 0x2a2b2e);
      cab(g, 0, 0.95, 2.4, 2.2, 1.6, 1.6, 0xd2452f);
      g.box(0, 0.95, -0.95, 2.4, 1.5, 4.3, 0xb9bec4); g.box(0, 2.45, -0.95, 2.4, 0.08, 4.3, 0x8a8f95);
      g.blob(0, 2.3, -1.1, 1.05, 0.5, 1.8, 0x8a6a46, 7, 0, 0.3); // đất chở trên thùng
      lights(g, 1.8, 3.21, -3.11, 1);
      break;
    }
    case 'mixer': {
      wheels(g, 1.05, [2.3, -0.9, -2.3], 0.55, 0.45);
      g.box(0, 0.6, 0, 1.9, 0.35, 6.4, 0x2a2b2e);
      cab(g, 0, 0.95, 2.4, 2.2, 1.6, 1.6, 0xf2f2f0);
      const M = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), O = new THREE.Vector3(1, 1, 1);
      g.at(M.compose(V.set(0, 2.15, -1), Q.setFromEuler(E.set(Math.PI / 2 - 0.2, 0, 0)), O));
      g.cyl(0, -2.1, 0, 0.75, 1.15, 2.2, 0xe9792b, 10); g.cyl(0, 0.1, 0, 1.15, 0.6, 1.8, 0xf2f2f0, 10); g.at(null); // bồn trộn
      g.box(0, 2.6, -3.1, 0.5, 0.2, 0.6, STEELG);
      break;
    }
    case 'dozer': {
      tracks(g, 1.15, 3.8, 0.95);
      g.box(0, 0.8, -0.2, 1.9, 1.2, 3.2, CAT); cab(g, 0, 2, -0.9, 1.6, 1.4, 1.5);
      g.box(0, 0.05, 2.6, 3.4, 1.4, 0.3, CAT_D); g.box(0, 0.05, 2.75, 3.4, 0.2, 0.2, 0x8a8f95); // lưỡi ủi
      for (const x of [-1.2, 1.2]) g.box(x, 0.5, 1.7, 0.25, 0.25, 1.6, STEELG);
      g.box(0.5, 2, 0.9, 0.14, 0.9, 0.14, 0x333333);
      break;
    }
    case 'tractor': {
      g.box(-0.95, 0, -0.6, 0.55, 1.8, 1.8, TYRE); g.box(0.95, 0, -0.6, 0.55, 1.8, 1.8, TYRE); // bánh sau to
      g.box(-0.8, 0, 1.6, 0.35, 1, 1, TYRE); g.box(0.8, 0, 1.6, 0.35, 1, 1, TYRE);
      g.box(0, 0.6, 0.8, 1, 0.9, 2.6, 0x2f8a3a); g.box(0, 1.5, 1.3, 0.9, 0.12, 1.4, 0x2f8a3a); // nắp máy
      cab(g, 0, 1.2, -0.6, 1.5, 1.7, 1.5, 0x2f8a3a); g.box(0.3, 1.5, 1.8, 0.12, 0.9, 0.12, 0x333333);
      // rơ moóc chở vật liệu
      g.box(0, 0.6, -2, 0.2, 0.2, 1.2, STEELG);
      g.box(0, 0.85, -4, 2.2, 0.5, 3, 0x9a5a36); wheels(g, 1, [-4], 0.5, 0.35);
      for (let k = 0; k < 3; k++) g.box(0, 1.35 + k * 0.32, -4, 1.9 - k * 0.3, 0.3, 2.6, k % 2 ? 0xb07a4a : 0xc4b8a0); // gạch, ván
      break;
    }
    case 'roller': {
      const M = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), O = new THREE.Vector3(1, 1, 1);
      g.at(M.compose(V.set(-1, 0.75, 1.7), Q.setFromEuler(E.set(0, 0, -Math.PI / 2)), O)).cyl(0, 0, 0, 0.75, 0.75, 2, 0x9aa0a6, 12).at(null); // trống lu
      g.box(0, 1.3, 1.7, 2.2, 0.3, 1.8, CAT);
      wheels(g, 0.9, [-1.3], 0.65, 0.55);
      g.box(0, 0.7, -0.9, 1.7, 1.1, 2.4, CAT); cab(g, 0, 1.8, -0.9, 1.4, 1.4, 1.3); g.box(0, 3.2, -0.9, 1.8, 0.08, 1.8, CAT_D);
      break;
    }
    case 'mcrane': {
      wheels(g, 1.1, [2.6, 1.2, -1.2, -2.6], 0.55, 0.45);
      g.box(0, 0.6, 0, 2.3, 0.7, 7.4, 0xe0a019); cab(g, -0.6, 1.3, 3, 1, 1.4, 1.4, 0xe0a019);
      for (const [x, z] of [[-1.6, 2], [1.6, 2], [-1.6, -2.4], [1.6, -2.4]]) { g.box(x, 0, z, 0.5, 0.9, 0.5, 0x8a8f95); } // chân chống
      g.box(0.4, 1.3, -1.6, 1.8, 1.1, 2.6, 0xe0a019);
      const M = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), O = new THREE.Vector3(1, 1, 1);
      g.at(M.compose(V.set(0.4, 2.4, -2.2), Q.setFromEuler(E.set(-1.05, 0, 0)), O));
      g.box(0, 0, 6, 0.7, 0.7, 12, 0xe0a019); g.box(0, 0, 9, 0.5, 0.5, 6, 0xc98d0e); g.at(null); // cần cẩu ống lồng
      const tip = [0.4, 2.4 + Math.sin(1.05) * 12, -2.2 + Math.cos(1.05) * 12];
      g.box(tip[0], 2.2, tip[2], 0.05, tip[1] - 2.2, 0.05, 0x222222); g.box(tip[0], 1.7, tip[2], 0.5, 0.5, 0.5, STEELG); // cáp + móc
      break;
    }
  }
  return { geometry: g.build(), top };
}

/** Cần cẩu tháp cao h: { mast, jib } — jib (cần ngang + đối trọng + cabin) quay quanh đỉnh tháp, gốc toạ độ ở đỉnh tháp. */
export function towerCrane(h, reach) {
  const m = new GB(), j = new GB(), RED = 0xd8a21c;
  m.box(0, -0.2, 0, 3, 0.6, 3, 0x8d887e);
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) m.box(x, 0, z, 0.22, h, 0.22, RED);
  for (let y = 1.5; y < h; y += 3) { m.box(0, y, -0.8, 1.8, 0.12, 0.12, RED); m.box(0, y, 0.8, 1.8, 0.12, 0.12, RED); m.box(-0.8, y + 1.5, 0, 0.12, 0.12, 1.8, RED); m.box(0.8, y + 1.5, 0, 0.12, 0.12, 1.8, RED); }
  j.box(0, 0, 0, 2.2, 0.6, 2.2, RED); j.box(1.4, 0.2, 0.2, 1.4, 1.5, 1.6, 0xf2f2f0); j.box(1.4, 0.7, 0.2, 1.45, 0.6, 1.4, GLASS_D); // cabin
  j.box(0, 0.6, 0, 0.5, 4, 0.5, RED); // đỉnh chóp
  j.box(0, 0.6, reach / 2, 1.1, 0.9, reach, RED); j.box(0, 0.6, -5, 1.1, 0.7, 10, RED); // cần trước, cần sau
  j.box(0, -0.4, -8.5, 1.8, 1.5, 2.4, 0x8d887e); // đối trọng
  for (const z of [reach * 0.5, -5]) j.box(0, 2.5, z / 2 + (z > 0 ? 0 : 0), 0.06, 0.06, Math.abs(z) + 1, 0x444444); // dây giằng
  const hz = reach * 0.6; j.box(0, 0.1, hz, 0.9, 0.5, 1.2, STEELG); j.box(0, -6, hz, 0.05, 6.1, 0.05, 0x222222); j.box(0, -6.6, hz, 0.6, 0.6, 0.6, 0xd8262e); // xe con, cáp, móc
  return { mast: m.build(), jib: j.build() };
}

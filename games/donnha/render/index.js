// Renderer 3D của Rô-bốt Dọn Nhà (khung dọc 1080×1920): three.js vẽ căn nhà + rô-bốt vào canvas WebGL ẩn rồi chép sang canvas 2D,
// HUD (bảng lái, bảng quà, cấp, % sạch) vẽ 2D đè lên. Mô hình tạo bằng Meshy (assets/models/*.glb, xem MODEL_FILES) nạp nền;
// món nào chưa có file / tải lỗi thì dùng mô hình dựng bằng code (khối, trụ, flat shading).
// Cửa sổ chơi (mount nhận input) ở chế độ streamer: bấm / giữ chuột chỗ muốn tới, hoặc WASD / mũi tên. Không đụng DOM khi import.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { drawPanel } from '#sdk';
import { HOUSE, ZONES, KINDS } from '../engine/index.js';

const W = 1080, H = 1920;
const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const TITLE = "'Baloo 2', 'Be Vietnam Pro', system-ui, sans-serif";
const INK = '#1d2340';
const ACT = {
  turbo: ['⚡', 'Turbo'], namcham: ['🧲', 'Nam châm'], dicho: ['🛒', 'Mẹ đi chợ về'], phinhto: ['🎈', 'Phình to'], sieuhut: ['🌀', 'Siêu hút'],
  meo: ['🐈', 'Mèo nghịch'], hetpin: ['🪫', 'Hết pin'], daochieu: ['🔄', 'Đảo chiều'], bayra: ['🐕', 'Chó làm đổ'],
};
const DIR_NAME = { l: 'trái', r: 'phải', u: 'lên', d: 'xuống' };
const PALETTE = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0x8e24aa, 0xfb8c00];
const SORTED = Object.entries(KINDS).sort((a, b) => a[1].s - b[1].s);
// Mô hình Meshy: loại đồ → file; fit = bề rộng chân đế so với đường kính 2·s của món (robot / mèo theo đơn vị riêng); rot = xoay thêm
const MODEL_FILES = {
  robot: { file: 'robot.glb', foot: 2.05, rx: -Math.PI / 2 }, // Meshy dựng rô-bốt đứng như bánh xe: xoay nằm phẳng, mặt có mắt hướng lên meo: { file: 'meo.glb', foot: 1.45 },
  sofa: { file: 'sofa.glb', fit: 1 }, tulanh: { file: 'tulanh.glb', fit: 0.95 }, xemay: { file: 'xemay.glb', fit: 1 }, caymai: { file: 'caymai.glb', fit: 1 },
  giuong: { file: 'giuong.glb', fit: 1 }, bantra: { file: 'bantra.glb', fit: 1 }, ghenhua: { file: 'ghenhua.glb', fit: 0.95 }, noicom: { file: 'noicom.glb', fit: 0.95 },
 chauquat: { file: 'chauquat.glb', fit: 1 }, tivi: { file: 'tivi.glb', fit: 1 }, dep: { file: 'dep.glb', fit: 1 },
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function mount(el, { canvas, options = {}, input = null } = {}) {
  const g2 = canvas.getContext('2d');
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sound = makeSound(!!options.mute);
  let S = null, recvAt = performance.now(), raf = 0, stopped = false, last = performance.now();
  let LAYOUT = {};
  const panel = (id, def, fn) => drawPanel(g2, LAYOUT, id, def, fn);
  const banners = [], feed = [], floaters = [];
  const anim = { shake: 0, flash: 0, flashCol: '#fff', endAt: -1e9, levelAt: -1e9 };
  if (typeof document !== 'undefined' && !document.getElementById('dd-font')) {
    const l = document.createElement('link'); l.id = 'dd-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap'; document.head.append(l);
  }

  // ---------------- three.js ----------------
  let gl = null, renderer = null;
  try {
    gl = document.createElement('canvas'); gl.width = W; gl.height = H;
    renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
  } catch { renderer = null; }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d7b68, 1.25));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.6);
  sun.position.set(-8, 20, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 16, bottom: -16, near: 1, far: 60 }); sun.shadow.bias = -0.001;
  scene.add(sun);

  const mats = new Map();
  const mat = (color, extra) => {
    if (!extra && mats.has(color)) return mats.get(color);
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...(extra || {}) });
    if (!extra) mats.set(color, m);
    return m;
  };
  const box = (w, h, d, color, x = 0, y = 0, z = 0, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat(color)); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
  const cyl = (rt, rb, h, seg, color, x = 0, y = 0, z = 0, m) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m || mat(color)); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
  const ball = (r, color, x = 0, y = 0, z = 0, seg = 1) => { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, seg), mat(color)); o.position.set(x, y, z); o.castShadow = true; return o; };

  // ---- căn nhà (cố định) ----
  (function buildHouse() {
    const ground = box(60, 0.2, 80, 0x8bc34a, 0, -0.15, 0); ground.castShadow = false; scene.add(ground);
    const floors = { ngu: 0xd7a86e, bep: 0xe6ecef, khach: 0xf1dcb8, san: 0xc98b6b };
    for (const [id, Z] of Object.entries(ZONES)) {
      const f = box(Z.x1 - Z.x0, 0.1, Z.z1 - Z.z0, floors[id], (Z.x0 + Z.x1) / 2, -0.05, (Z.z0 + Z.z1) / 2); f.castShadow = false; scene.add(f);
      // vân sàn: ván gỗ / gạch men / gạch đỏ
      const lines = id === 'bep' ? 0xcfd8dc : id === 'san' ? 0xa86f53 : id === 'ngu' ? 0xbf8f58 : 0xe2c79c;
      const step = id === 'bep' ? 1 : id === 'san' ? 0.9 : 1.4;
      for (let z = Z.z0 + step; z < Z.z1 - 0.01; z += step) { const l = box(Z.x1 - Z.x0, 0.012, 0.04, lines, (Z.x0 + Z.x1) / 2, 0.006, z); l.castShadow = false; scene.add(l); }
      if (id === 'bep' || id === 'san') for (let x = Z.x0 + step; x < Z.x1 - 0.01; x += step) { const l = box(0.04, 0.012, Z.z1 - Z.z0, lines, x, 0.006, (Z.z0 + Z.z1) / 2); l.castShadow = false; scene.add(l); }
    }
    // thảm phòng khách
    const rug = box(5, 0.02, 3.6, 0xc62828, 0, 0.012, 1); rug.castShadow = false; scene.add(rug);
    const rug2 = box(4.4, 0.025, 3, 0xffca28, 0, 0.014, 1); rug2.castShadow = false; scene.add(rug2);
    // tường thấp bao quanh nhà (cắt thấp để nhìn vào trong) + vách ngăn có cửa (chỉ để nhìn)
    const wall = 0xfafafa, trim = 0x8d6e63, hw = 0.7;
    for (const [x, z, w, d] of [[0, -HOUSE.hz - 0.15, HOUSE.hx * 2 + 0.6, 0.3], [-HOUSE.hx - 0.15, -4, 0.3, 18.3], [HOUSE.hx + 0.15, -4, 0.3, 18.3], [-HOUSE.hx - 0.15, 9.5, 0.3, 7], [HOUSE.hx + 0.15, 9.5, 0.3, 7]]) {
      scene.add(box(w, hw, d, x < -HOUSE.hx || x > HOUSE.hx || z < -HOUSE.hz ? (z > 4 ? 0xbdbdbd : wall) : wall, x, hw / 2, z));
      scene.add(box(w + 0.04, 0.06, d + 0.04, trim, x, hw + 0.03, z));
    }
    // cổng sân + hàng rào phía trước
    for (const sx of [-1, 1]) { scene.add(box(HOUSE.hx - 1.6, 0.5, 0.25, 0xbdbdbd, sx * (HOUSE.hx + 1.6) / 2, 0.25, HOUSE.hz + 0.15)); scene.add(box(0.35, 1.3, 0.35, 0x9e9e9e, sx * 1.6, 0.65, HOUSE.hz + 0.15)); }
    // vạch cửa giữa các phòng
    for (const [x, z, w, d] of [[0, -3, HOUSE.hx * 2, 0.08], [0, 5, HOUSE.hx * 2, 0.08], [0, -8, 0.08, 10]]) { const l = box(w, 0.03, d, 0x6d4c41, x, 0.015, z); l.castShadow = false; scene.add(l); }
    // câu đối đỏ + đèn lồng đón Tết
    scene.add(box(4.2, 0.55, 0.06, 0xd32f2f, 0, 1.05, -HOUSE.hz - 0.32));
    scene.add(box(3.9, 0.4, 0.07, 0xffd54f, 0, 1.05, -HOUSE.hz - 0.32, mat(0xffd54f, { emissive: 0x6d4c00 })));
    for (const sx of [-1, 1]) { const l = ball(0.32, 0xe53935, sx * 1.6, 1.65, HOUSE.hz + 0.15, 1); scene.add(l); scene.add(cyl(0.12, 0.12, 0.1, 8, 0xffd54f, sx * 1.6, 1.97, HOUSE.hz + 0.15)); }
    // cây xanh ngoài nhà
    const r = rng(11);
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1, x = side * (HOUSE.hx + 1.4 + r() * 5), z = (r() - 0.5) * 32;
      const t = new THREE.Group(); t.add(cyl(0.12, 0.16, 0.8, 5, 0x6d4c41, 0, 0.4, 0)); t.add(ball(0.8 + r() * 0.5, r() < 0.5 ? 0x43a047 : 0x2e7d32, 0, 1.4, 0, 0));
      t.position.set(x, 0, z); scene.add(t);
    }
  })();

  // ---- đồ trong nhà: mỗi loại dựng bằng vài khối, cỡ theo bán kính s ----
  function build(kind, s, color) {
    const M = MODELS[kind];
    if (M) {
      const g = new THREE.Group(), o = M.tpl.clone(true);
      const k = Math.min(2 * s * (MODEL_FILES[kind].fit || 1), (2 * s * 2.2) / Math.max(0.01, M.h)); // cao tối đa ~2,2 lần bề rộng (cây mai Meshy rất cao)
      o.scale.multiplyScalar(k); g.add(o); g.userData.model = true; return g;
    }
    const g = new THREE.Group();
    const c = PALETTE[color % PALETTE.length];
    const add = (o) => (g.add(o), o);
    switch (kind) {
      case 'bui': add(ball(s * 0.8, 0x9e9e9e, 0, s * 0.5, 0, 0)); add(ball(s * 0.5, 0xbdbdbd, s * 0.5, s * 0.35, 0.1 * s, 0)); break;
      case 'butchi': { const b = add(cyl(s * 0.12, s * 0.12, s * 1.9, 6, 0xffca28, 0, s * 0.12, 0)); b.rotation.z = Math.PI / 2; const tip = add(cyl(0, s * 0.12, s * 0.3, 6, 0xffe0b2, s * 1.1, s * 0.12, 0)); tip.rotation.z = -Math.PI / 2; break; }
      case 'keo': add(box(s * 1.1, s * 0.5, s * 0.7, 0xd32f2f, 0, s * 0.25, 0)); add(box(s * 0.3, s * 0.3, s * 0.5, 0xffd54f, -s * 0.7, s * 0.25, 0)); add(box(s * 0.3, s * 0.3, s * 0.5, 0xffd54f, s * 0.7, s * 0.25, 0)); break;
      case 'giay': add(ball(s * 0.7, 0xfafafa, 0, s * 0.45, 0, 0)); break;
      case 'tat': add(box(s * 0.5, s * 0.3, s * 1.4, c, 0, s * 0.15, 0)); add(box(s * 0.5, s * 0.3, s * 0.6, c, s * 0.4, s * 0.15, s * 0.5)); add(box(s * 0.52, s * 0.32, s * 0.25, 0xffffff, 0, s * 0.15, -s * 0.6)); break;
      case 'lego': add(box(s * 1.3, s * 0.7, s * 0.9, c, 0, s * 0.35, 0)); for (const x of [-0.35, 0.35]) for (const z of [-0.2, 0.2]) add(cyl(s * 0.15, s * 0.15, s * 0.2, 8, c, x * s, s * 0.8, z * s)); break;
      case 'coc': add(cyl(s * 0.6, s * 0.5, s * 1.3, 10, c, 0, s * 0.65, 0)); { const h = add(new THREE.Mesh(new THREE.TorusGeometry(s * 0.3, s * 0.08, 5, 10), mat(c))); h.position.set(s * 0.65, s * 0.7, 0); } break;
      case 'chen': add(cyl(s * 0.95, s * 0.55, s * 0.6, 12, 0xfafafa, 0, s * 0.3, 0)); add(cyl(s * 0.97, s * 0.97, s * 0.08, 12, 0x1565c0, 0, s * 0.56, 0)); break;
      case 'vochai': { const b = add(cyl(s * 0.35, s * 0.35, s * 1.5, 8, 0x66bb6a, 0, s * 0.35, 0, mat(0x66bb6a, { transparent: true, opacity: 0.8 }))); b.rotation.z = Math.PI / 2; break; }
      case 'dep': add(box(s * 0.8, s * 0.25, s * 1.6, c, 0, s * 0.12, 0)); add(box(s * 0.85, s * 0.22, s * 0.5, 0xffffff, 0, s * 0.35, -s * 0.2)); break;
      case 'giaydep': for (const x of [-0.45, 0.45]) { add(box(s * 0.7, s * 0.45, s * 1.5, 0x5d4037, x * s, s * 0.22, 0)); add(box(s * 0.7, s * 0.35, s * 0.6, 0x5d4037, x * s, s * 0.6, -s * 0.4)); } break;
      case 'banhchung': add(box(s * 1.35, s * 0.8, s * 1.35, 0x2e7d32, 0, s * 0.4, 0)); for (const r2 of [0, Math.PI / 2]) { const b = add(box(s * 1.4, s * 0.82, s * 0.08, 0xd7ccc8, 0, s * 0.4, 0)); b.rotation.y = r2; } break;
      case 'xo': add(cyl(s * 0.95, s * 0.75, s * 1.4, 12, 0x1e88e5, 0, s * 0.7, 0)); add(cyl(s * 0.8, s * 0.8, s * 0.05, 12, 0x90caf9, 0, s * 1.35, 0)); break;
      case 'loa': add(box(s * 1.1, s * 1.7, s * 1.0, 0x263238, 0, s * 0.85, 0)); add(cyl(s * 0.38, s * 0.38, s * 0.05, 12, 0x90a4ae, 0, s * 0.6, s * 0.5)).rotation.x = Math.PI / 2; break;
      case 'noicom': add(cyl(s * 0.9, s * 0.85, s * 1.1, 14, 0xfafafa, 0, s * 0.55, 0)); add(cyl(s * 0.92, s * 0.6, s * 0.35, 14, c, 0, s * 1.25, 0)); add(box(s * 0.3, s * 0.15, s * 0.2, 0x424242, 0, s * 1.45, 0)); break;
      case 'chaucay': add(cyl(s * 0.75, s * 0.55, s * 0.8, 10, 0xbf6b3c, 0, s * 0.4, 0)); add(ball(s * 0.85, 0x43a047, 0, s * 1.3, 0, 0)); break;
      case 'quatban': add(cyl(s * 0.5, s * 0.6, s * 0.2, 10, 0x90caf9, 0, s * 0.1, 0)); add(cyl(s * 0.08, s * 0.08, s * 0.9, 6, 0x90caf9, 0, s * 0.6, 0)); add(cyl(s * 0.85, s * 0.85, s * 0.2, 12, 0x64b5f6, 0, s * 1.15, 0)).rotation.x = Math.PI / 2; break;
      case 'gaubong': add(ball(s * 0.7, 0xa1887f, 0, s * 0.7, 0, 1)); add(ball(s * 0.5, 0xa1887f, 0, s * 1.45, 0, 1)); for (const x of [-0.35, 0.35]) add(ball(s * 0.18, 0x8d6e63, x * s, s * 1.85, 0, 0)); add(ball(s * 0.12, 0x3e2723, 0, s * 1.4, s * 0.45, 0)); break;
      case 'ghenhua': add(box(s * 1.2, s * 0.12, s * 1.2, 0xe53935, 0, s * 0.75, 0)); add(box(s * 1.2, s * 0.9, s * 0.1, 0xe53935, 0, s * 1.2, -s * 0.55)); for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) add(cyl(s * 0.07, s * 0.1, s * 0.75, 5, 0xd32f2f, x * s, s * 0.37, z * s)); break;
      case 'bepga': add(box(s * 1.6, s * 0.35, s * 1.0, 0x424242, 0, s * 0.18, 0)); for (const x of [-0.45, 0.45]) add(cyl(s * 0.28, s * 0.28, s * 0.06, 10, 0x212121, x * s, s * 0.38, 0)); add(cyl(s * 0.4, s * 0.4, s * 0.9, 10, 0xc62828, s * 1.0, s * 0.45, -s * 0.2)); break;
      case 'quatcay': add(cyl(s * 0.45, s * 0.55, s * 0.12, 10, 0xeceff1, 0, s * 0.06, 0)); add(cyl(s * 0.06, s * 0.06, s * 1.8, 6, 0xeceff1, 0, s * 0.95, 0)); add(cyl(s * 0.75, s * 0.75, s * 0.18, 14, 0x81d4fa, 0, s * 1.9, 0)).rotation.x = Math.PI / 2; break;
      case 'chauquat': add(cyl(s * 0.55, s * 0.42, s * 0.6, 10, 0x1565c0, 0, s * 0.3, 0)); add(ball(s * 0.75, 0x2e7d32, 0, s * 1.2, 0, 1)); for (let i = 0; i < 9; i++) { const a = i * 0.7, y = 0.9 + (i % 3) * 0.25; add(ball(s * 0.1, 0xff9800, Math.cos(a) * s * 0.7, s * y, Math.sin(a) * s * 0.7, 0)); } break;
      case 'tivi': add(box(s * 1.8, s * 0.4, s * 0.7, 0x5d4037, 0, s * 0.2, 0)); add(box(s * 1.7, s * 1.0, s * 0.08, 0x212121, 0, s * 0.95, 0)); add(box(s * 1.55, s * 0.85, s * 0.02, 0x42a5f5, 0, s * 0.95, s * 0.05, mat(0x42a5f5, { emissive: 0x0d47a1 }))); break;
      case 'bantra': add(box(s * 1.8, s * 0.1, s * 1.1, 0x795548, 0, s * 0.5, 0)); for (const x of [-0.8, 0.8]) for (const z of [-0.45, 0.45]) add(box(s * 0.08, s * 0.5, s * 0.08, 0x5d4037, x * s, s * 0.25, z * s)); add(cyl(s * 0.12, s * 0.1, s * 0.2, 8, 0xfafafa, 0, s * 0.65, 0)); add(box(s * 0.5, s * 0.08, s * 0.35, 0xd32f2f, s * 0.5, s * 0.59, 0)); break;
      case 'xedap': { for (const z of [-0.6, 0.6]) { const w = add(new THREE.Mesh(new THREE.TorusGeometry(s * 0.35, s * 0.05, 5, 14), mat(0x212121))); w.position.set(0, s * 0.38, z * s); w.rotation.y = Math.PI / 2; } add(box(s * 0.08, s * 0.08, s * 1.2, c, 0, s * 0.6, 0)); add(box(s * 0.3, s * 0.08, s * 0.25, 0x212121, 0, s * 0.9, -s * 0.3)); add(box(s * 0.6, s * 0.06, s * 0.06, 0x9e9e9e, 0, s * 0.95, s * 0.55)); break; }
      case 'tulanh': add(box(s * 1.2, s * 2.2, s * 1.0, 0xeceff1, 0, s * 1.1, 0)); add(box(s * 1.22, s * 0.04, s * 1.02, 0x90a4ae, 0, s * 1.5, 0)); add(box(s * 0.06, s * 0.5, s * 0.06, 0x78909c, s * 0.45, s * 1.8, s * 0.52)); break;
      case 'xemay': add(box(s * 0.45, s * 0.5, s * 1.4, c, 0, s * 0.55, 0)); add(box(s * 0.4, s * 0.15, s * 0.7, 0x212121, 0, s * 0.85, -s * 0.2)); for (const z of [-0.65, 0.65]) { const w = add(cyl(s * 0.3, s * 0.3, s * 0.15, 12, 0x212121, 0, s * 0.3, z * s)); w.rotation.z = Math.PI / 2; } add(box(s * 0.8, s * 0.05, s * 0.05, 0x9e9e9e, 0, s * 1.05, s * 0.55)); add(box(s * 0.2, s * 0.2, s * 0.1, 0xfff59d, 0, s * 0.9, s * 0.72)); break;
      case 'tuquanao': add(box(s * 1.4, s * 2.1, s * 0.8, 0x8d6e63, 0, s * 1.05, 0)); add(box(s * 0.02, s * 1.9, s * 0.82, 0x5d4037, 0, s * 1.05, 0)); for (const x of [-0.12, 0.12]) add(box(s * 0.05, s * 0.25, s * 0.05, 0xffd54f, x * s, s * 1.1, s * 0.42)); break;
      case 'banan': add(box(s * 1.6, s * 0.1, s * 1.0, 0xa1887f, 0, s * 0.6, 0)); for (const x of [-0.7, 0.7]) for (const z of [-0.4, 0.4]) add(box(s * 0.07, s * 0.6, s * 0.07, 0x6d4c41, x * s, s * 0.3, z * s)); for (const x of [-0.4, 0.4]) add(cyl(s * 0.12, s * 0.12, s * 0.06, 10, 0xfafafa, x * s, s * 0.68, 0)); add(cyl(s * 0.2, s * 0.18, s * 0.15, 10, 0xd32f2f, 0, s * 0.72, 0)); break;
      case 'sofa': add(box(s * 1.8, s * 0.4, s * 0.9, 0x5c6bc0, 0, s * 0.3, 0)); add(box(s * 1.8, s * 0.6, s * 0.25, 0x3f51b5, 0, s * 0.7, -s * 0.38)); for (const x of [-0.85, 0.85]) add(box(s * 0.2, s * 0.5, s * 0.9, 0x3f51b5, x * s, s * 0.5, 0)); for (const x of [-0.45, 0.45]) add(box(s * 0.75, s * 0.12, s * 0.7, 0x7986cb, x * s, s * 0.55, s * 0.05)); break;
      case 'caymai': add(cyl(s * 0.4, s * 0.32, s * 0.45, 10, 0x6d4c41, 0, s * 0.22, 0)); add(cyl(s * 0.06, s * 0.1, s * 1.1, 5, 0x5d4037, 0, s * 0.9, 0)); for (let i = 0; i < 7; i++) { const a = i * 0.9; add(ball(s * (0.35 + (i % 3) * 0.07), 0xffd600, Math.cos(a) * s * 0.45, s * (1.2 + (i % 3) * 0.25), Math.sin(a) * s * 0.45, 0)); } for (let i = 0; i < 4; i++) add(box(s * 0.12, s * 0.18, s * 0.04, 0xd32f2f, Math.cos(i * 1.6) * s * 0.55, s * 1.1, Math.sin(i * 1.6) * s * 0.55)); break;
      case 'giuong': add(box(s * 1.2, s * 0.4, s * 1.9, 0x8d6e63, 0, s * 0.2, 0)); add(box(s * 1.15, s * 0.18, s * 1.8, 0xfafafa, 0, s * 0.48, 0)); add(box(s * 1.15, s * 0.1, s * 1.1, c, 0, s * 0.6, s * 0.3)); add(box(s * 0.8, s * 0.15, s * 0.35, 0xffffff, 0, s * 0.65, -s * 0.65)); add(box(s * 1.2, s * 0.6, s * 0.1, 0x6d4c41, 0, s * 0.6, -s * 0.95)); break;
      default: add(ball(s * 0.7, c, 0, s * 0.5, 0, 0));
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // ---- mô hình Meshy (nạp nền; xong thì thay vật đang hiện) ----
  const MODELS = {};
  if (renderer && typeof document !== 'undefined') {
    const loader = new GLTFLoader();
    for (const [kind, m] of Object.entries(MODEL_FILES)) {
      Promise.resolve(options.models?.[m.file] || new URL(`../assets/models/${m.file}`, import.meta.url).href).then((url) => loader.load(url, (gltf) => {
        if (stopped) return;
        const raw = new THREE.Group(); raw.add(gltf.scene);
        if (m.rx) gltf.scene.rotation.x = m.rx;
        if (m.rot) gltf.scene.rotation.y = m.rot;
        raw.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(raw), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
        raw.position.set(-c.x, -bb.min.y, -c.z);
        raw.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) { o.material.metalness = 0; o.material.roughness = 0.85; } } });
        const tpl = new THREE.Group(); tpl.add(raw); tpl.scale.setScalar(1 / Math.max(size.x, size.z, 0.001)); // bề rộng chân đế = 1
        MODELS[kind] = { tpl, h: size.y / Math.max(size.x, size.z, 0.001) };
        onModel(kind);
      }, undefined, () => {})).catch(() => {}); // không tải được: giữ mô hình dựng bằng code
    }
  }
  function onModel(kind) {
    if (kind === 'robot') { body.children.forEach((o) => { if (o !== brush) o.visible = false; }); brush.visible = false; const o = MODELS.robot.tpl.clone(true); o.scale.multiplyScalar(MODEL_FILES.robot.foot); body.add(o); return; }
    if (kind === 'meo') { cat.children.forEach((o) => { o.visible = false; }); const o = MODELS.meo.tpl.clone(true); o.scale.multiplyScalar(MODEL_FILES.meo.foot); cat.add(o); return; }
    for (const e of itemObjs.values()) if (e.it.kind === kind && !e.o.userData.model) { const n = build(kind, e.it.s, e.it.color); n.position.copy(e.o.position); n.rotation.y = e.it.rot; scene.remove(e.o); scene.add(n); e.o = n; }
  }

  // ---- rô-bốt hút bụi có đôi mắt ----
  const robot = new THREE.Group(); scene.add(robot);
  const body = new THREE.Group(); robot.add(body);
  body.add(cyl(1, 1, 0.32, 28, 0x37474f, 0, 0.17, 0));
  body.add(cyl(0.94, 0.98, 0.07, 28, 0xfafafa, 0, 0.36, 0));
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const led = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 28), ledMat); led.rotation.x = Math.PI / 2; led.position.y = 0.4; body.add(led);
  { const b = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.18, 28, 1, true, -0.9, 1.8), mat(0x263238, { side: THREE.DoubleSide })); b.position.y = 0.16; body.add(b); }
  const eyes = new THREE.Group(); body.add(eyes);
  for (const x of [-0.3, 0.3]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), mat(0xffffff)); e.scale.set(1, 0.6, 1); e.position.set(x, 0.42, 0.45); eyes.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), mat(0x111111)); p.position.set(x, 0.47, 0.6); eyes.add(p); }
  const brush = new THREE.Group(); brush.position.set(0.7, 0.04, 0.6); body.add(brush);
  for (let i = 0; i < 3; i++) { const b = box(0.5, 0.02, 0.04, 0x90a4ae); b.rotation.y = i * 2.09; b.position.x = 0; brush.add(b); }
  const swirl = new THREE.Group(); robot.add(swirl);
  for (let i = 0; i < 14; i++) { const d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); d.userData = { a: i / 14 * 6.28, r: 1.15 + (i % 3) * 0.12, y: 0.08 + (i % 4) * 0.06 }; swirl.add(d); }
  const magnetRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff4081, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  magnetRing.rotation.x = -Math.PI / 2; magnetRing.position.y = 0.03; scene.add(magnetRing);
  const stars = new THREE.Group(); robot.add(stars);
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffeb3b })); stars.add(s); }
  stars.visible = false;

  // ---- con mèo ----
  const cat = new THREE.Group(); cat.visible = false; scene.add(cat);
  { const O = 0xff9800; cat.add(box(0.8, 0.45, 1.3, O, 0, 0.55, 0)); cat.add(box(0.6, 0.5, 0.55, O, 0, 0.95, 0.75)); for (const x of [-0.2, 0.2]) { cat.add(cyl(0, 0.13, 0.25, 4, O, x, 1.3, 0.75)); cat.add(box(0.1, 0.1, 0.04, 0x1b5e20, x * 0.9, 1.0, 1.03)); } for (const x of [-0.28, 0.28]) for (const z of [-0.45, 0.45]) cat.add(box(0.16, 0.35, 0.16, O, x, 0.18, z)); const tail = box(0.1, 0.1, 0.8, 0xef6c00, 0, 0.9, -0.85); tail.rotation.x = -0.7; cat.add(tail); for (let i = 0; i < 3; i++) cat.add(box(0.82, 0.06, 0.12, 0xe65100, 0, 0.79, -0.4 + i * 0.35)); }

  // ---------------- đồng bộ đồ vật ----------------
  const itemObjs = new Map(); // id → { o, it }
  const sucking = []; // { o, t, from, s }
  const curRobot = { x: 0, z: 1, r: 0.3 };
  function sync() {
    if (!S) return;
    const live = new Set();
    for (const it of S.items) {
      live.add(it.id);
      let e = itemObjs.get(it.id);
      if (!e) { const o = build(it.kind, it.s, it.color); o.rotation.y = it.rot; o.position.set(it.x, 0, it.z); scene.add(o); e = { o, it, born: performance.now() }; itemObjs.set(it.id, e); }
      e.it = it;
    }
    for (const [id, e] of itemObjs) if (!live.has(id)) { itemObjs.delete(id); sucking.push({ o: e.o, t: 0, x: e.o.position.x, z: e.o.position.z }); }
  }
  function clearItems() { for (const e of itemObjs.values()) scene.remove(e.o); itemObjs.clear(); for (const s of sucking) scene.remove(s.o); sucking.length = 0; }

  // ---------------- HUD 2D ----------------
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g2.beginPath(); g2.moveTo(x + r, y); g2.arcTo(x + w, y, x + w, y + h, r); g2.arcTo(x + w, y + h, x, y + h, r); g2.arcTo(x, y + h, x, y, r); g2.arcTo(x, y, x + w, y, r); g2.closePath(); }
  function card(x, y, w, h, r = 26, col = 'rgba(255,255,255,.88)', border = INK, bw = 5) { rr(x, y, w, h, r); g2.fillStyle = col; g2.fill(); if (border) { g2.lineWidth = bw; g2.strokeStyle = border; g2.stroke(); } }
  function text(s, x, y, size, color = INK, weight = 800, align = 'center', maxW = 0, font = FONT) {
    g2.font = `${weight} ${size}px ${font}`; g2.fillStyle = color; g2.textAlign = align; g2.textBaseline = 'middle';
    let t = String(s ?? '');
    if (maxW && g2.measureText(t).width > maxW) { while (t.length > 1 && g2.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; }
    g2.fillText(t, x, y);
  }
  function out(s, x, y, size, color = '#fff', { align = 'center', maxW = 0, stroke = INK } = {}) {
    let sz = size; s = String(s ?? '');
    g2.font = `800 ${sz}px ${TITLE}`;
    if (maxW) while (sz > 16 && g2.measureText(s).width > maxW) { sz -= 2; g2.font = `800 ${sz}px ${TITLE}`; }
    g2.textAlign = align; g2.textBaseline = 'middle'; g2.lineJoin = 'round';
    g2.lineWidth = Math.max(6, sz * 0.2); g2.strokeStyle = stroke; g2.strokeText(s, x, y + 4); g2.strokeText(s, x, y);
    g2.fillStyle = color; g2.fillText(s, x, y);
  }
  function chip(s, x, y, size = 26, bg = 'rgba(29,35,64,.85)', fg = '#fff', maxW = 380) {
    g2.font = `800 ${size}px ${FONT}`; const w = Math.min(maxW, g2.measureText(s).width + 28);
    rr(x - w / 2, y - size * 0.8, w, size * 1.6, size * 0.8); g2.fillStyle = bg; g2.fill();
    text(s, x, y + 1, size, fg, 800, 'center', maxW - 30);
  }
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const v3 = new THREE.Vector3();
  const toScreen = (x, y, z) => { v3.set(x, y, z).project(camera); return { x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H, front: v3.z < 1 }; };
  function arrow(cx, cy, d, n, on) {
    const [dx, dy] = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] }[d];
    const x = cx + dx * 78, y = cy + dy * 78;
    g2.save(); g2.translate(x, y); g2.rotate(Math.atan2(dy, dx));
    g2.beginPath(); g2.moveTo(34, 0); g2.lineTo(-18, -32); g2.lineTo(-18, 32); g2.closePath();
    g2.fillStyle = on ? '#ffd23f' : 'rgba(255,255,255,.9)'; g2.fill(); g2.lineWidth = 5; g2.strokeStyle = INK; g2.stroke();
    g2.restore();
    if (n) text(String(n), x + dx * 4 - dy * 0, y + (dy ? dy * 4 : 0) + (dx ? 44 : 0) * 0, 22, INK, 900);
  }

  function drawHud(now) {
    const s = S;
    const since = s.phase === 'play' && !s.paused ? now - recvAt : 0;
    out('RÔ-BỐT DỌN NHÀ', W / 2, 70, 76, '#ffd23f');
    // thanh trên: thời gian + % sạch
    card(110, 128, 860, 70, 35, 'rgba(255,255,255,.92)');
    rr(120, 138, Math.max(50, 840 * clamp(s.cleanPct / 100, 0, 1)), 50, 25); g2.fillStyle = '#69f0ae'; g2.fill();
    text(`Ván #${s.round}  ·  ⏱ ${mmss(s.remainingMs - since)}  ·  Nhà sạch ${s.cleanPct}%  (${s.eatenCount}/${s.itemCount} món)`, W / 2, 164, 28, INK, 900, 'center', 820);
    // cấp + hút được tới đâu
    const lv = s.level, reff = s.robot.reff;
    const k = lv.next ? clamp((s.robot.r - lv.from) / (lv.next - lv.from), 0, 1) : 1;
    const can = [...SORTED].reverse().find(([, kk]) => kk.s < reff * 0.95);
    card(250, 212, 580, 70, 30, 'rgba(29,35,64,.88)', '#ffd23f', 4);
    text(`Cấp ${lv.i + 1}: ${lv.name}`, 270, 236, 26, '#ffd23f', 900, 'left', 300);
    text(`Hút được tới: ${can ? can[1].name : '—'}`, 810, 236, 22, '#fff', 800, 'right', 260);
    rr(270, 256, 540, 14, 7); g2.fillStyle = 'rgba(255,255,255,.2)'; g2.fill();
    rr(270, 256, Math.max(14, 540 * k), 14, 7); g2.fillStyle = '#ffd23f'; g2.fill();
    // bảng lái
    if (s.phase === 'play') panel('pad', { x: 800, y: 300 }, () => {
      const cx = 928, cy = 428;
      card(800, 300, 256, 256, 40, 'rgba(29,35,64,.8)', '#ffd23f', 4);
      const v = s.robot; const sp = Math.hypot(v.vx, v.vz);
      const dom = sp > 0.3 ? (Math.abs(v.vx) > Math.abs(v.vz) ? (v.vx < 0 ? 'l' : 'r') : (v.vz < 0 ? 'u' : 'd')) : null;
      for (const d of ['l', 'r', 'u', 'd']) arrow(cx, cy, d, s.mode === 'viewers' ? s.steer.counts[d] : 0, dom === d);
      const label = s.steer.mode === 'crowd' ? 'CẢ PHÒNG\nLÁI' : s.steer.mode === 'host' ? 'STREAMER\nLÁI' : 'TỰ LÁI';
      label.split('\n').forEach((l, i, a) => text(l, cx, cy + (i - (a.length - 1) / 2) * 24, 20, '#fff', 900));
    });
    if (s.mode === 'viewers' && s.phase === 'play') chip('Bình luận: trái · phải · lên · xuống', 900, 584, 19, 'rgba(29,35,64,.88)', '#fff', 340);
    // bảng ủng hộ / phá bĩnh
    if (s.showBoard !== false && (s.helpers.length || s.pranks.length)) panel('board', { x: 24, y: 300 }, () => {
      const h = 40 + (s.helpers.length ? 40 + s.helpers.length * 40 : 0) + (s.pranks.length ? 40 + s.pranks.length * 40 : 0);
      card(24, 300, 300, h, 24, 'rgba(255,255,255,.9)', INK, 4);
      let y = 330;
      if (s.helpers.length) { text('💚 Ủng hộ rô-bốt', 174, y, 24, '#2e7d32', 900); y += 40; for (const r of s.helpers) { text(r.name, 44, y, 22, INK, 800, 'left', 200); text(`×${r.n}`, 306, y, 22, '#2e7d32', 900, 'right'); y += 40; } }
      if (s.pranks.length) { text('😈 Phá bĩnh', 174, y, 24, '#c62828', 900); y += 40; for (const r of s.pranks) { text(r.name, 44, y, 22, INK, 800, 'left', 200); text(`×${r.n}`, 306, y, 22, '#c62828', 900, 'right'); y += 40; } }
    });
    // hiệu ứng đang chạy
    const B = [['turbo', '⚡ Turbo', '#ff9800'], ['namcham', '🧲 Nam châm', '#ec407a'], ['sieuhut', '🌀 Siêu hút', '#7e57c2'], ['hetpin', '🪫 Hết pin', '#546e7a'], ['daochieu', '🔄 Đảo chiều', '#8e24aa'], ['choang', '💫 Choáng', '#f9a825']];
    const on = B.filter(([id]) => s.buffs[id] - since > 0);
    on.forEach(([id, l, c], i) => chip(`${l} ${Math.ceil((s.buffs[id] - since) / 1000)}s`, W / 2 + (i - (on.length - 1) / 2) * 210, 320, 24, c, '#fff', 200));
    if (s.cat) chip(`🐈 Mèo của ${s.cat.by?.name || ''} đang đuổi! ${Math.ceil((s.cat.leftMs - since) / 1000)}s`, W / 2, 372, 24, 'rgba(230,81,0,.92)', '#fff', 520);
    // tên trên đồ mang tên người xem (gần rô-bốt)
    const named = [];
    for (const e of itemObjs.values()) if (e.it.owner) named.push([Math.hypot(e.it.x - curRobot.x, e.it.z - curRobot.z), e]);
    named.sort((a, b) => a[0] - b[0]);
    for (const [, e] of named.slice(0, 14)) { const p = toScreen(e.it.x, e.it.s * 2 + 0.3, e.it.z); if (p.front && p.y > 300 && p.y < 1500) chip(`🏷️ ${e.it.owner}`, p.x, p.y, 20, 'rgba(255,255,255,.88)', INK, 240); }
    // bảng tin
    feed.forEach((f, i) => { const a = clamp((f.until - now) / 600, 0, 1); g2.globalAlpha = a; chip(f.text, W / 2, 1490 - i * 48, 24, f.bg, '#fff', 960); g2.globalAlpha = 1; });
    // biểu ngữ
    const bn = banners[0];
    if (bn) {
      const t = (now - bn.at) / 2400;
      if (t >= 1) banners.shift();
      else if (t >= 0) {
        const kk = t < 0.12 ? t / 0.12 : t > 0.85 ? (1 - t) / 0.15 : 1;
        g2.save(); g2.globalAlpha = kk; g2.translate(W / 2, 700); g2.scale(0.8 + 0.2 * kk, 0.8 + 0.2 * kk);
        card(-400, -78, 800, 156, 40, bn.bg || 'rgba(255,248,225,.96)', INK, 6);
        text(bn.icon, -320, 0, 86, INK, 400);
        out(bn.title, 40, -26, 54, bn.color || '#ff7043', { maxW: 560 });
        text(bn.who, 40, 40, 30, INK, 800, 'center', 560);
        g2.restore();
      }
    }
    for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; const t = (now - f.at) / 1300; if (t >= 1) { floaters.splice(i, 1); continue; } g2.globalAlpha = 1 - t; out(f.text, f.x, f.y - t * 110, f.size, f.color); g2.globalAlpha = 1; }
    // bảng quà: xanh = giúp, đỏ = phá
    const pw = s.powerups;
    if (pw.length) panel('menu', { x: 30, y: 1560 }, () => {
      const cols = 3, rows = Math.ceil(Math.min(9, pw.length) / cols), cw = 1020 / cols, ch = Math.min(100, 300 / rows);
      card(30, 1560, 1020, rows * ch + 30, 30, 'rgba(29,35,64,.86)', '#ffd23f', 4);
      pw.slice(0, 9).forEach((p, i) => {
        const x = 30 + (i % cols) * cw, y = 1575 + Math.floor(i / cols) * ch;
        const [ic, name] = ACT[p.action] || ['🎁', p.action];
        text(ic, x + 44, y + ch / 2, 42, '#fff', 400);
        text(name, x + 80, y + ch / 2 - 16, 26, p.help ? '#69f0ae' : '#ff8a80', 900, 'left', cw - 90);
        text(`${p.icon} ${p.text}`, x + 80, y + ch / 2 + 18, 21, '#ffd23f', 800, 'left', cw - 90);
      });
    });
    if (input && s.mode === 'host' && s.phase === 'play') chip('Bấm / giữ chuột chỗ muốn tới · hoặc WASD / mũi tên', W / 2, 1536, 22, 'rgba(46,125,50,.92)', '#fff', 900);
    // kết quả
    if (s.phase === 'result' && s.result) {
      const t = clamp((now - anim.endAt) / 500, 0, 1), r = s.result;
      g2.fillStyle = `rgba(20,30,50,${0.45 * t})`; g2.fillRect(0, 0, W, H);
      g2.save(); g2.translate(W / 2, 820); g2.scale(0.6 + 0.4 * t, 0.6 + 0.4 * t);
      card(-430, -260, 860, 520, 46, 'rgba(255,248,225,.97)', INK, 7);
      out(r.pct >= 100 ? 'NHÀ SẠCH BONG!' : 'HẾT GIỜ DỌN!', 0, -190, 80, r.pct >= 100 ? '#2e7d32' : '#ff7043');
      text(`Nhà sạch ${r.pct}%  ·  hút ${r.eaten} món`, 0, -90, 40, INK, 900);
      text(`Rô-bốt cấp ${r.level + 1}: ${r.name}`, 0, -30, 34, '#6a1b9a', 900);
      if (r.record) out('🏆 KỶ LỤC MỚI!', 0, 40, 52, '#ffd23f');
      else if (s.best) text(`Kỷ lục: ${s.best.pct}% (ván #${s.best.round})`, 0, 40, 30, '#5d4037', 800);
      if (s.history.length > 1) text(`Các ván trước: ${s.history.slice(1, 5).map((h) => `${h.pct}%`).join(' · ')}`, 0, 110, 26, '#5d4037', 800, 'center', 780);
      text(`Nhà mới sau ${Math.ceil(Math.max(0, s.nextInMs - (now - recvAt)) / 1000)} giây…`, 0, 190, 30, '#7e57c2', 800);
      g2.restore();
    }
    if (s.paused) { card(W / 2 - 220, 900, 440, 110, 30, 'rgba(29,35,64,.9)', '#fff', 4); text('⏸ Tạm dừng', W / 2, 955, 50, '#fff', 900); }
  }

  function drawBg() {
    const gr = g2.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#7fd3ff'); gr.addColorStop(1, '#e8f5e9');
    g2.fillStyle = gr; g2.fillRect(0, 0, W, H);
  }

  // ---------------- streamer lái (cửa sổ chơi) ----------------
  const playing = () => !!input && S?.mode === 'host';
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
  function floorAt(e) {
    const rc = canvas.getBoundingClientRect();
    const nx = (e.clientX - rc.left) / rc.width * 2 - 1, ny = -((e.clientY - rc.top) / rc.height * 2 - 1);
    ray.setFromCamera({ x: nx, y: ny }, camera);
    return ray.ray.intersectPlane(plane, hitP) ? { x: hitP.x, z: hitP.z } : null;
  }
  if (input && typeof window !== 'undefined') {
    let down = false, lastSend = 0;
    const aim = (e) => { const p = floorAt(e); const n = performance.now(); if (p && n - lastSend > 70) { lastSend = n; input({ type: 'aim', x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 }); } };
    canvas.addEventListener('pointerdown', (e) => { sound.resume(); if (!playing()) return; down = true; aim(e); });
    canvas.addEventListener('pointermove', (e) => { if (down && playing()) aim(e); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) canvas.addEventListener(ev, () => { down = false; });
    const keys = new Set();
    const KEY = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd' };
    const sendKeys = () => { let dx = 0, dz = 0; for (const k of keys) { if (k === 'l') dx--; if (k === 'r') dx++; if (k === 'u') dz--; if (k === 'd') dz++; } const m = Math.hypot(dx, dz); input(m ? { type: 'dir', dx: dx / m, dz: dz / m } : { type: 'stop' }); };
    window.addEventListener('keydown', (e) => { const k = KEY[e.key]; if (!k || !playing()) return; e.preventDefault(); if (!keys.has(k)) { keys.add(k); sendKeys(); } });
    window.addEventListener('keyup', (e) => { const k = KEY[e.key]; if (!k || !playing()) return; keys.delete(k); sendKeys(); });
  }

  // ---------------- vòng vẽ ----------------
  const cam = { x: 0, z: 1, h: 9 };
  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    drawBg();
    if (!renderer) { if (S) drawHud(now); else text('Rô-bốt Dọn Nhà cần WebGL', W / 2, H / 2, 48, INK); return; }
    if (S) {
      const rb = S.robot, since = S.phase === 'play' && !S.paused ? Math.min(0.35, (now - recvAt) / 1000) : 0;
      // rô-bốt: nội suy theo vận tốc giữa hai lần cập nhật
      const tx = clamp(rb.x + rb.vx * since, -HOUSE.hx + rb.r, HOUSE.hx - rb.r), tz = clamp(rb.z + rb.vz * since, -HOUSE.hz + rb.r, HOUSE.hz - rb.r);
      curRobot.x = lerp(curRobot.x, tx, 1 - Math.exp(-dt * 14)); curRobot.z = lerp(curRobot.z, tz, 1 - Math.exp(-dt * 14));
      curRobot.r = lerp(curRobot.r, rb.reff, 1 - Math.exp(-dt * 5));
      robot.position.set(curRobot.x, 0, curRobot.z);
      robot.scale.setScalar(curRobot.r);
      let dy = rb.dir - body.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); body.rotation.y += dy * Math.min(1, dt * 8);
      const moving = Math.hypot(rb.vx, rb.vz) > 0.2;
      brush.rotation.y += dt * (moving ? 18 : 6);
      robot.position.y = moving && !reduced ? Math.abs(Math.sin(now / 90)) * 0.02 * curRobot.r : 0;
      ledMat.color.setHex(S.buffs.sieuhut > 0 ? 0xb388ff : S.buffs.turbo > 0 ? 0xffab00 : S.buffs.daochieu > 0 ? 0xea80fc : S.buffs.hetpin > 0 ? 0xff1744 : 0x00e5ff);
      swirl.children.forEach((d) => { d.userData.a += dt * (moving ? 7 : 3); const r = d.userData.r * (S.buffs.sieuhut > 0 ? 1.4 : 1); d.position.set(Math.cos(d.userData.a) * r, d.userData.y, Math.sin(d.userData.a) * r); });
      stars.visible = S.buffs.choang > 0; stars.children.forEach((s, i) => { const a = now / 200 + i * 1.57; s.position.set(Math.cos(a) * 0.6, 1.1, Math.sin(a) * 0.6); s.rotation.y = a; });
      magnetRing.material.opacity = lerp(magnetRing.material.opacity, rb.magnet ? 0.55 + Math.sin(now / 120) * 0.15 : 0, dt * 5);
      magnetRing.position.set(curRobot.x, 0.03, curRobot.z); magnetRing.scale.setScalar(Math.max(0.01, rb.magnet || curRobot.r));
      // đồ vật: rung nhẹ khi sắp bị hút, bị nam châm kéo thì trượt tới
      for (const e of itemObjs.values()) {
        e.o.position.x = lerp(e.o.position.x, e.it.x, Math.min(1, dt * 8)); e.o.position.z = lerp(e.o.position.z, e.it.z, Math.min(1, dt * 8));
        const pop = clamp((now - e.born) / 300, 0, 1); e.o.scale.setScalar(0.3 + 0.7 * pop + Math.sin(pop * Math.PI) * 0.2);
        const d = Math.hypot(e.it.x - curRobot.x, e.it.z - curRobot.z);
        const edible = e.it.s < rb.reff * 0.95;
        e.o.rotation.z = edible && d < curRobot.r * 1.6 && !reduced ? Math.sin(now / 40 + e.it.id) * 0.08 : 0;
      }
      // đồ đang bị hút vào: xoáy tròn, thu nhỏ, bay vào tâm rô-bốt
      for (let i = sucking.length - 1; i >= 0; i--) {
        const s = sucking[i]; s.t += dt / 0.35;
        const k = clamp(s.t, 0, 1), e = k * k;
        s.o.position.set(lerp(s.x, curRobot.x, e), 0.1 + Math.sin(k * Math.PI) * 0.4 * curRobot.r, lerp(s.z, curRobot.z, e));
        s.o.scale.setScalar(Math.max(0.01, 1 - e)); s.o.rotation.y += dt * 18;
        if (k >= 1) { scene.remove(s.o); sucking.splice(i, 1); }
      }
      // mèo
      if (S.cat) { cat.visible = true; cat.scale.setScalar(S.cat.s); const cx = cat.position.x, cz = cat.position.z; cat.position.x = lerp(cx, S.cat.x, Math.min(1, dt * 6)); cat.position.z = lerp(cz, S.cat.z, Math.min(1, dt * 6)); const a = Math.atan2(curRobot.x - cat.position.x, curRobot.z - cat.position.z); cat.rotation.y = a; cat.position.y = Math.abs(Math.sin(now / 110)) * 0.08 * S.cat.s; }
      else if (cat.visible) cat.visible = false;
      // máy quay bám theo rô-bốt, lùi xa khi rô-bốt to ra
      const want = 8 + curRobot.r * 12; // rô-bốt to ra thì máy quay lùi xa, rô-bốt luôn chiếm khoảng 1/5 khung
      cam.x = lerp(cam.x, curRobot.x, 1 - Math.exp(-dt * 3)); cam.z = lerp(cam.z, curRobot.z, 1 - Math.exp(-dt * 3)); cam.h = lerp(cam.h, S.phase === 'result' ? 40 : want, 1 - Math.exp(-dt * 1.5));
      const lx = S.phase === 'result' ? lerp(cam.x, 0, 0.9) : cam.x, lz = S.phase === 'result' ? lerp(cam.z, 0, 0.9) : cam.z - cam.h * 0.08;
      camera.position.set(lx, cam.h, lz + cam.h * 0.62);
      anim.shake = Math.max(0, anim.shake - dt * 1.5);
      if (anim.shake > 0 && !reduced) { camera.position.x += (Math.random() - 0.5) * anim.shake; camera.position.y += (Math.random() - 0.5) * anim.shake; }
      camera.lookAt(lx, 0, lz);
      sun.position.set(cam.x - 8, 20, cam.z + 10); sun.target.position.set(cam.x, 0, cam.z); sun.target.updateMatrixWorld();
    } else { camera.position.set(0, 30, 18); camera.lookAt(0, 0, 0); }
    renderer.render(scene, camera);
    g2.drawImage(gl, 0, 0);
    if (anim.flash > 0) { g2.fillStyle = anim.flashCol; g2.globalAlpha = anim.flash; g2.fillRect(0, 0, W, H); g2.globalAlpha = 1; anim.flash = Math.max(0, anim.flash - dt * 2.5); }
    if (S) drawHud(now);
  }
  raf = requestAnimationFrame(frame);

  const push = (arr, item, max) => { arr.unshift(item); if (arr.length > max) arr.length = max; };
  const banner = (b) => {
    const now = performance.now();
    if (b.kind) for (let i = banners.length - 1; i >= 1; i--) if (banners[i].kind === b.kind) banners.splice(i, 1); // lên cấp liên tục: chỉ giữ cấp mới nhất
    if (banners.length < 4) banners.push({ at: banners.length ? Math.max(now, banners[banners.length - 1].at + 2400) : now, ...b });
  };
  let lastRound = null;
  return {
    update(s) {
      if (s.round !== lastRound) { clearItems(); lastRound = s.round; curRobot.x = s.robot.x; curRobot.z = s.robot.z; curRobot.r = s.robot.r; }
      S = s; recvAt = performance.now(); sync();
    },
    effect(fx) {
      const now = performance.now();
      const who = fx.by?.name || '';
      switch (fx.type) {
        case 'dn_gift': { const [icon, title] = ACT[fx.action] || ['🎁', fx.action]; banner({ icon, title, who: `từ ${who}`, color: fx.help ? '#2e7d32' : '#c62828', bg: fx.help ? 'rgba(232,255,240,.97)' : 'rgba(255,235,238,.97)' }); sound.play(fx.help ? 'gift' : 'boo'); if (fx.action === 'meo') sound.play('meow'); break; }
        case 'dn_eat': {
          sound.play(fx.s >= 0.55 ? 'bigeat' : 'slurp');
          if (fx.s >= 0.55) { const p = toScreen(fx.x, 1, fx.z); floaters.push({ text: `+ ${KINDS[fx.kind]?.name || ''}`, x: p.x, y: p.y, at: now, size: 40 + fx.s * 14, color: '#ffd23f' }); anim.shake = Math.max(anim.shake, fx.s * 0.3); }
          if (fx.owner) push(feed, { text: `🌀 Hút luôn ${KINDS[fx.kind]?.name.toLowerCase() || 'món đồ'} của ${fx.owner.name}!`, until: now + 3500, bg: 'rgba(29,35,64,.85)' }, 3);
          break;
        }
        case 'dn_drop': push(feed, { text: `🏷️ ${who} thả ${KINDS[fx.kind]?.name.toLowerCase() || 'món đồ'} vào nhà`, until: now + 3000, bg: 'rgba(0,121,107,.88)' }, 3); sound.play('pop'); break;
        case 'dn_spawn': sound.play('pop'); break;
        case 'dn_level': banner({ kind: 'level', icon: '🔼', title: `LÊN CẤP ${fx.level + 1}!`, who: fx.name, color: '#6a1b9a', bg: 'rgba(243,229,245,.97)' }); anim.flash = 0.35; anim.flashCol = '#fff59d'; sound.play('level'); break;
        case 'dn_grow': sound.play('level'); break;
        case 'dn_spit': floaters.push({ text: fx.why === 'meo' ? '🐈 Bị mèo vồ! Nhả đồ…' : '🐕 Chó làm đổ hết!', x: W / 2, y: 1050, at: now, size: 52, color: '#ff8a80' }); anim.shake = 0.6; sound.play('boo'); break;
        case 'dn_eatcat': floaters.push({ text: '🐈 HÚT LUÔN CON MÈO!', x: W / 2, y: 1050, at: now, size: 64, color: '#ffd23f' }); anim.flash = 0.5; anim.flashCol = '#fff'; sound.play('bigeat'); sound.play('meow'); break;
        case 'dn_vote': if (Math.random() < 0.3) sound.play('tick'); break;
        case 'dn_end': anim.endAt = now; sound.play('end'); break;
        case 'dn_house': anim.flash = 0.4; anim.flashCol = '#ffffff'; sound.play('level'); break;
        default: break;
      }
    },
    layout(map) { LAYOUT = map || {}; },
    resumeAudio() { sound.resume(); },
    resize() {},
    destroy() {
      stopped = true; cancelAnimationFrame(raf); sound.close();
      scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      renderer?.dispose?.(); renderer?.forceContextLoss?.();
    },
  };
}

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeSound(muted) {
  let ac = null;
  const get = () => { if (muted || typeof AudioContext === 'undefined') return null; if (!ac) { try { ac = new AudioContext(); } catch { muted = true; return null; } } return ac; };
  function tone(f, dur, { type = 'sine', vol = 0.15, at = 0, slide = 0 } = {}) {
    const a = get(); if (!a || a.state !== 'running') return;
    const t0 = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, { vol = 0.2, freq = 1500, at = 0 } = {}) {
    const a = get(); if (!a || a.state !== 'running') return;
    const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination); src.start(a.currentTime + at);
  }
  let lastSlurp = 0;
  const P = {
    slurp: () => { const n = performance.now(); if (n - lastSlurp < 60) return; lastSlurp = n; tone(500, 0.12, { type: 'triangle', vol: 0.08, slide: 2.2 }); },
    bigeat: () => { noise(0.5, { freq: 900, vol: 0.3 }); tone(160, 0.4, { type: 'sawtooth', vol: 0.08, slide: 2.5 }); },
    pop: () => tone(880, 0.07, { type: 'square', vol: 0.05, slide: 1.5 }),
    gift: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, { type: 'triangle', at: i * 0.06 })),
    boo: () => [392, 311].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.06, at: i * 0.12 })),
    meow: () => { tone(700, 0.35, { type: 'sawtooth', vol: 0.06, slide: 1.4 }); tone(980, 0.25, { type: 'sine', vol: 0.05, at: 0.2, slide: 0.6 }); },
    level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.1, at: i * 0.08 })),
    tick: () => tone(1500, 0.04, { type: 'triangle', vol: 0.04 }),
    end: () => [784, 659, 523, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.1, at: i * 0.14 })),
  };
  return { play(n) { try { P[n]?.(); } catch { /* bỏ qua */ } }, resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } }, close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; } };
}

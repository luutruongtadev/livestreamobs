// Renderer 3D của Phố Tí Hon (khung dọc 1080×1920): three.js vẽ thị trấn low-poly trên hòn đảo nổi vào một canvas WebGL ẩn,
// rồi chép sang canvas 2D của nền tảng; HUD (bảng quà, bảng phá, tên người xem) vẽ 2D đè lên, nên drawPanel của SDK dùng y như game 2D.
// Máy quay "điện ảnh": quà gọi thảm hoạ thì máy quay lướt tới cận cảnh toà / công trình bị phá, giữ tới khi đổ rồi lùi ra toàn cảnh
// (lốc xoáy, trâu thì bám theo). Cửa sổ chơi (mount nhận input) ở chế độ streamer: bấm / giữ toà để sửa, bấm vật đang rơi để bắn hạ,
// bấm lốc / trâu để đuổi. Không đụng DOM khi import.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { drawPanel } from '#sdk';
import { pathAt, ISLAND } from '../engine/path.js';

const W = 1080, H = 1920;
const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const TITLE = "'Baloo 2', 'Be Vietnam Pro', system-ui, sans-serif";
const INK = '#1d2340';
const ACT = {
  thienthach: ['☄️', 'Thiên thạch'], set: ['⚡', 'Sét đánh'], lu: ['🌊', 'Lũ dâng'], loc: ['🌪️', 'Lốc xoáy'], khien: ['🛡️', 'Khiên che phố'],
  dongdat: ['🫨', 'Động đất'], thoxay: ['👷', 'Thợ xây lại phố'], khunglong: ['🐃', 'Trâu khổng lồ'], ufo: ['🛸', 'UFO hút nhà'], mua: ['🧊', 'Mưa đá'],
  hopbi: ['🎲', 'Hộp bí ẩn'], muathienthach: ['☄️', 'JACKPOT: Mưa thiên thạch!'],
};
const KIND_NAME = { house: 'Nhà ống', shop: 'Tiệm tạp hoá', tower: 'Chung cư', tank: 'Cây xăng', pagoda: 'Đình làng', cap4: 'Nhà cấp 4', cho: 'Chợ', caoc: 'Cao ốc', ben: 'Bến tàu' };
const BEACH_X = 2.55, SEA_X = 3.3; // bãi cát, mép biển (phía đông)
const WALLS = [0xf6d6a8, 0xf2b8a2, 0xbfe3c0, 0xa9d3f0, 0xf7e7a1, 0xe3c6f0];
const ROOFS = [0xd9534f, 0xe07b39, 0x4f7cc9, 0x8e5bb5, 0x3f9a6b, 0xc94f7c];

// Mô hình 3D tạo bằng Meshy (assets/models/*.glb): loại toà nào có file thì dùng, chưa có / tải lỗi thì dựng bằng code.
// FOOT = bề rộng chân đế mong muốn (đơn vị thế giới; lô đất cách nhau 2,3).
const MODEL_FILES = {
  house: { file: 'house.glb', foot: 1.35 }, // nhà ống
  shop: { file: 'shop.glb', foot: 1.8 }, // tiệm tạp hoá + ghế nhựa
  tower: { file: 'tower.glb', foot: 1.85 }, // chung cư cũ (kéo cao theo số tầng)
  tank: { file: 'tank.glb', foot: 1.8 }, // cây xăng mini (nổ dây chuyền)
  pagoda: { file: 'pagoda.glb', foot: 2.1 }, // đình làng
  buffalo: { file: 'buffalo.glb', foot: 2.6 }, // trâu khổng lồ (thảm hoạ "khunglong")
};

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function mount(el, { canvas, options = {}, input = null } = {}) {
  const g2 = canvas.getContext('2d');
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sound = makeSound(!!options.mute);
  let S = null, recvAt = performance.now(), raf = 0, stopped = false, last = performance.now();
  let LAYOUT = {};
  const panel = (id, def, fn) => drawPanel(g2, LAYOUT, id, def, fn);
  const banners = [], feed = [], floaters = [], labels = [];
  const anim = { shake: 0, flash: 0, flashCol: '#fff', quake: 0, wipeAt: -1e9, townAt: 0 };
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
  const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 200);
  const CAM = { r: 45, el: 0.7, look: new THREE.Vector3(0, -1.6, 0.6) };
  // máy quay đang ở đâu (làm mượt) + cận cảnh hiện tại / đang chờ
  const cine = { look: CAM.look.clone(), r: CAM.r, el: CAM.el, yaw: 0, fov: 36, roll: 0, cur: null, queue: [], seenS: new Set(), seenH: new Set(), slow: null };
  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x7a6a4a, 1.25));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
  sun.position.set(-9, 18, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  const mats = new Map();
  /** Vật liệu flat-shading dùng chung theo màu (đỡ tốn bộ nhớ). */
  const mat = (color, extra) => {
    const key = extra ? null : color;
    if (key != null && mats.has(key)) return mats.get(key);
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...(extra || {}) });
    if (key != null) mats.set(key, m);
    return m;
  };
  const box = (w, h, d, color, x = 0, y = 0, z = 0, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat(color)); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
  const cyl = (rt, rb, h, seg, color, x = 0, y = 0, z = 0, m) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m || mat(color)); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };

  // ---- đảo nổi (cố định) ----
  const clouds = [];
  let sea = null, foam = null;
  const world = new THREE.Group(); scene.add(world);
  (function buildIsland() {
    const r = rng(7);
    // khối đất hình chữ nhật: cỏ, mép cỏ sẫm, các lớp đất bậc thang, chóp đá vuông lởm chởm treo bên dưới
    const X = ISLAND.rx * 2, Z = ISLAND.rz * 2;
    world.add(box(ISLAND.rx + SEA_X, 0.7, Z, 0x7cc65a, (SEA_X - ISLAND.rx) / 2, -0.35, 0));
    world.add(box(ISLAND.rx - SEA_X, 0.5, Z, 0xd9b77a, (ISLAND.rx + SEA_X) / 2, -0.6, 0)); // đáy biển
    world.add(box(X + 0.24, 0.22, Z + 0.24, 0x5fa845, 0, -0.62, 0));
    world.add(box(X + 0.1, 0.55, Z + 0.1, 0x8a6a4a, 0, -1.0, 0));
    world.add(box(X - 0.5, 0.6, Z - 0.5, 0x75583c, 0, -1.55, 0));
    world.add(box(X - 1.3, 0.5, Z - 1.3, 0x6a4b2f, 0, -2.05, 0));
    const rockG = new THREE.ConeGeometry(1, 1, 4, 5, true);
    const pos = rockG.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > -0.49 && y < 0.49) { pos.setX(i, pos.getX(i) * (0.82 + r() * 0.3)); pos.setZ(i, pos.getZ(i) * (0.82 + r() * 0.3)); } }
    rockG.computeVertexNormals();
    const rock = new THREE.Mesh(rockG, mat(0x8a6a4a, { side: THREE.DoubleSide }));
    rock.rotation.set(Math.PI, Math.PI / 4, 0);
    rock.scale.set((ISLAND.rx - 0.7) * 1.414, 6.5, (ISLAND.rz - 0.7) * 1.414); rock.position.y = -2.3 - 3.25; world.add(rock);
    for (let i = 0; i < 12; i++) { const s = cyl(0.3 + r() * 0.5, 0.05, 1 + r() * 2.2, 5, 0x75583c); s.position.set((r() - 0.5) * X * 0.7, -2.6 - r() * 2.2, (r() - 0.5) * Z * 0.7); world.add(s); }
    // hàng rào bụi cây thấp quanh mép
    for (let x = -ISLAND.rx + 0.3; x <= BEACH_X - 0.3; x += 0.62) for (const sz of [-1, 1]) if (Math.abs(x) > 0.8) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + r() * 0.08, 0), mat(0x4e9a3a)); b.position.set(x, 0.12, sz * (ISLAND.rz - 0.22)); b.castShadow = true; world.add(b); }
    for (let z = -ISLAND.rz + 0.3; z <= ISLAND.rz - 0.3; z += 0.62) for (const sx of [-1]) if (Math.abs(z - ISLAND.riverZ) > 1.1) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + r() * 0.08, 0), mat(0x4e9a3a)); b.position.set(sx * (ISLAND.rx - 0.22), 0.12, z); b.castShadow = true; world.add(b); }
    // sông + thác hai đầu
    const water = mat(0x4fb3e8, { transparent: true, opacity: 0.92 });
    const len = SEA_X + ISLAND.rx + 0.2;
    const river = box(len, 0.2, ISLAND.riverW, 0, (SEA_X - ISLAND.rx - 0.2) / 2, -0.02, ISLAND.riverZ, water); river.castShadow = false; world.add(river);
    { const f = box(0.25, 6, ISLAND.riverW * 0.8, 0, -ISLAND.rx - 0.25, -3, ISLAND.riverZ, water); f.castShadow = false; world.add(f); }
    // bãi cát + biển phía đông (sông đổ ra biển), thác biển đổ xuống mép đảo
    world.add(box(SEA_X - BEACH_X + 0.15, 0.08, Z, 0xf2d8a0, (SEA_X + BEACH_X) / 2, 0.0, 0));
    sea = box(ISLAND.rx - SEA_X + 0.1, 0.3, Z, 0, (ISLAND.rx + SEA_X) / 2, -0.25, 0, mat(0x1e88e5, { transparent: true, opacity: 0.88 })); sea.castShadow = false; world.add(sea);
    foam = box(0.14, 0.03, Z, 0xffffff, SEA_X + 0.05, -0.08, 0, mat(0xffffff, { transparent: true, opacity: 0.8 })); foam.castShadow = false; world.add(foam);
    { const f = box(0.3, 6, Z * 0.96, 0, ISLAND.rx + 0.15, -3.1, 0, mat(0x42a5f5, { transparent: true, opacity: 0.75 })); f.castShadow = false; world.add(f); }
    // đường lớn + cầu
    world.add(box(1.1, 0.06, ISLAND.rz * 2 - 0.8, 0x9aa0a8, 0, 0.03, 0));
    for (let z = -ISLAND.rz + 1; z < ISLAND.rz - 1; z += 0.9) if (Math.abs(z - ISLAND.riverZ) > 1) world.add(box(0.08, 0.07, 0.4, 0xf4f4f4, 0, 0.04, z));
    world.add(box(1.5, 0.22, ISLAND.riverW + 0.6, 0xb27b47, 0, 0.12, ISLAND.riverZ));
    for (const sx of [-0.7, 0.7]) world.add(box(0.08, 0.3, ISLAND.riverW + 0.6, 0x7a4f2a, sx, 0.35, ISLAND.riverZ));
    // mây trôi quanh đảo
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + r() * 0.8, 0), mat(0xffffff, { emissive: 0x8a9aa8 })); m.position.set(k * 0.9 - 1.4, r() * 0.4, r() * 0.6); c.add(m); }
      const a = r() * 6.28; c.position.set(Math.cos(a) * 11, -3 - r() * 5, Math.sin(a) * 11); c.userData.spin = 0.02 + r() * 0.03; c.userData.a = a; c.userData.y = c.position.y;
      clouds.push(c); scene.add(c);
    }
  })();

  // ---- mô hình Meshy (nạp nền; xong thì dựng lại phố hiện tại) ----
  const MODELS = {};
  if (renderer && typeof document !== 'undefined') {
    const loader = new GLTFLoader();
    let pending = Object.keys(MODEL_FILES).length;
    const settle = () => { if (--pending === 0 && !stopped && S && town) buildTown(S); };
    for (const [kind, m] of Object.entries(MODEL_FILES)) {
      // options.models[file]: đường dẫn (hoặc Promise trả về đường dẫn) thay cho file trong assets/ — dùng cho bản chia sẻ
      Promise.resolve(options.models?.[m.file] || new URL(`../assets/models/${m.file}`, import.meta.url).href).then((url) => loader.load(url, (gltf) => {
        if (stopped) return;
        const raw = gltf.scene;
        const bb = new THREE.Box3().setFromObject(raw), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
        const k = m.foot / Math.max(size.x, size.z, 0.001);
        raw.position.set(-c.x, -bb.min.y, -c.z);
        const tpl = new THREE.Group(); tpl.add(raw); tpl.scale.setScalar(k);
        raw.traverse((o) => { if (o.isMesh && o.material) { o.material.metalness = 0; o.material.roughness = 0.85; } });
        MODELS[kind] = { tpl, top: size.y * k };
        settle();
      }, undefined, () => settle())).catch(() => settle()); // không tải được: giữ mô hình dựng bằng code
    }
  }

  // ---- phố (dựng lại mỗi phố mới) ----
  let town = null; // { no, group, items: Map<id, item>, cars: [] }
  function makeBuilding(b) {
    const gr = new THREE.Group();
    const wall = WALLS[b.color % WALLS.length], roof = ROOFS[b.color % ROOFS.length];
    const parts = [];
    const add = (o) => { gr.add(o); parts.push(o); return o; };
    const M = MODELS[b.kind];
    if (M) {
      const o = M.tpl.clone(true);
      if (b.kind === 'tower') o.scale.y *= 0.8 + b.h * 0.15;
      o.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; m.userData.shared = true; parts.push(m); } });
      gr.add(o);
    } else if (b.kind === 'house') {
      const h = 0.62 * b.h;
      add(box(1.1, h, 0.95, wall, 0, h / 2, 0));
      const rf = cyl(0, 0.92, 0.6, 4, roof, 0, h + 0.3, 0); rf.rotation.y = Math.PI / 4; rf.scale.set(1.15, 1, 1); add(rf);
      add(box(0.24, 0.38, 0.05, 0x6b4223, 0, 0.19, 0.49));
      for (let f = 0; f < b.h; f++) for (const sx of [-0.33, 0.33]) add(box(0.2, 0.18, 0.05, 0xfff4c2, sx, 0.4 + f * 0.62, 0.49));
      add(box(0.14, 0.35, 0.14, 0x8c5a3c, 0.3, h + 0.45, -0.15));
    } else if (b.kind === 'shop') {
      add(box(1.4, 0.8, 1.0, wall, 0, 0.4, 0));
      add(box(1.5, 0.08, 1.1, 0xf4f4f4, 0, 0.84, 0));
      for (let i = 0; i < 5; i++) add(box(0.3, 0.06, 0.4, i % 2 ? 0xffffff : roof, -0.6 + i * 0.3, 0.62, 0.62));
      add(box(0.9, 0.24, 0.06, roof, 0, 1.05, 0.2));
      add(box(1.0, 0.32, 0.05, 0xbfe9ff, 0, 0.3, 0.51));
    } else if (b.kind === 'tower') {
      const h = 0.72 * b.h;
      add(box(1.15, h, 1.15, 0x9fb4c9 - (b.color % 3) * 0x080808, 0, h / 2, 0));
      for (let f = 0; f < b.h; f++) add(box(1.19, 0.18, 1.19, 0xdcefff, 0, 0.42 + f * 0.72, 0));
      add(box(0.5, 0.3, 0.5, 0x6d7d8f, 0.15, h + 0.15, 0.1));
      add(cyl(0.02, 0.02, 0.6, 4, 0xdddddd, -0.3, h + 0.3, -0.3));
    } else if (b.kind === 'tank') {
      add(cyl(0.55, 0.55, 0.9, 14, 0xf2f2f2, 0, 0.55, 0));
      add(cyl(0.56, 0.56, 0.18, 14, 0xe53935, 0, 0.6, 0));
      add(cyl(0.45, 0.55, 0.12, 14, 0xdcdcdc, 0, 1.06, 0));
      add(box(1.3, 0.1, 1.3, 0x777777, 0, 0.05, 0));
      add(box(0.08, 0.9, 0.08, 0x555555, 0.65, 0.45, 0.4));
    } else if (b.kind === 'pagoda') {
      for (let i = 0; i < 3; i++) {
        const s = 1 - i * 0.22, y = i * 0.75;
        add(box(0.95 * s, 0.5, 0.95 * s, 0xf3d9a0, 0, y + 0.25, 0));
        const rf = cyl(0.25 * s, 1.0 * s, 0.25, 4, 0xc62828, 0, y + 0.62, 0); rf.rotation.y = Math.PI / 4; add(rf);
      }
      add(cyl(0.02, 0.1, 0.45, 6, 0xffc107, 0, 2.45, 0));
    } else if (b.kind === 'cap4') {
      // nhà cấp 4: tường vàng / xanh, mái ngói đỏ hai mái, hiên cột gỗ, chum nước
      const wc = [0xf3d27a, 0xe9c46a, 0xf1e0b0, 0xd9e7c5, 0xf4c7a1, 0xcfe3f0][b.color % 6];
      add(box(1.4, 0.55, 0.9, wc, 0, 0.275, -0.05));
      for (const sz of [-1, 1]) { const rf = box(1.6, 0.06, 0.64, 0xb5482f, 0, 0.72, sz * 0.24 - 0.05); rf.rotation.x = -sz * 0.55; add(rf); }
      add(box(1.6, 0.06, 0.08, 0x8e3a26, 0, 0.88, -0.05));
      add(box(1.45, 0.04, 0.4, 0xc9b38a, 0, 0.02, 0.6));
      for (const sx of [-0.62, -0.21, 0.21, 0.62]) add(box(0.06, 0.5, 0.06, 0x8d6e63, sx, 0.27, 0.74));
      { const rf = box(1.55, 0.05, 0.45, 0xb5482f, 0, 0.53, 0.58); rf.rotation.x = 0.18; add(rf); }
      add(box(0.26, 0.38, 0.05, 0x6d4c41, 0, 0.19, 0.41));
      for (const sx of [-0.45, 0.45]) add(box(0.22, 0.18, 0.05, 0x4db6ac, sx, 0.33, 0.41));
      add(cyl(0.12, 0.09, 0.24, 8, 0x795548, 0.66, 0.12, 0.95));
    } else if (b.kind === 'cho') {
      // chợ: 4 sạp mái bạt sọc màu, hàng hoá, biển CHỢ
      add(box(1.75, 0.06, 1.6, 0xbdbdbd, 0, 0.03, 0));
      const tarps = [0x1e88e5, 0xe53935, 0xfdd835, 0x43a047];
      for (let i = 0; i < 4; i++) {
        const sx = i % 2 ? 0.43 : -0.43, sz = i < 2 ? -0.38 : 0.38;
        for (const px of [-0.3, 0.3]) add(box(0.04, 0.55, 0.04, 0x6d4c41, sx + px, 0.3, sz + 0.25));
        const t = box(0.78, 0.04, 0.7, tarps[(i + b.color) % 4], sx, 0.6, sz); t.rotation.x = 0.2; add(t);
        add(box(0.62, 0.2, 0.42, 0x8d6e63, sx, 0.16, sz));
        for (let k = 0; k < 3; k++) add(box(0.15, 0.1, 0.15, [0xff7043, 0x66bb6a, 0xffee58][k], sx - 0.19 + k * 0.19, 0.31, sz));
      }
      add(box(0.95, 0.24, 0.05, 0xc62828, 0, 1.0, 0.82));
      for (const sx of [-0.42, 0.42]) add(box(0.04, 0.5, 0.04, 0x6d4c41, sx, 0.78, 0.82));
    } else if (b.kind === 'caoc') {
      // cao ốc kính: khối đế, thân kính nhiều tầng, vạch tầng, đỉnh vát + chóp ăng-ten
      const hh = b.h * 0.55, glass = [0x4fc3f7, 0x81d4fa, 0x80cbc4][b.color % 3];
      add(box(1.75, 0.6, 1.65, 0xb0bec5, 0, 0.3, 0));
      add(box(1.6, 0.06, 0.2, 0x37474f, 0, 0.62, 0.78));
      add(box(1.15, hh, 1.1, glass, 0, 0.6 + hh / 2, 0, mat(glass, { emissive: 0x0b3b5a })));
      for (let f = 1; f < b.h; f++) add(box(1.19, 0.05, 1.14, 0xe0f7fa, 0, 0.6 + f * 0.55, 0));
      for (const sx of [-0.36, 0, 0.36]) add(box(0.05, hh, 1.13, 0xcfd8dc, sx, 0.6 + hh / 2, 0));
      add(box(0.8, 0.45, 0.78, glass, 0, 0.6 + hh + 0.22, 0, mat(glass, { emissive: 0x0b3b5a })));
      add(cyl(0.02, 0.06, 0.9, 5, 0xeeeeee, 0, 0.6 + hh + 0.9, 0));
    } else if (b.kind === 'ben') {
      // bến tàu: cầu cảng gỗ trên cọc, nhà chờ mái xanh, 2 ghe đánh cá có mắt ghe
      add(box(2.5, 0.08, 0.6, 0x8d6e63, -0.25, 0.1, 0));
      for (let i = 0; i < 5; i++) for (const pz of [-0.26, 0.26]) add(cyl(0.045, 0.045, 0.5, 5, 0x5d4037, -1.35 + i * 0.55, -0.12, pz));
      add(box(0.5, 0.4, 0.46, 0xfff3e0, -1.2, 0.34, 0));
      add(box(0.64, 0.05, 0.6, 0x1565c0, -1.2, 0.58, 0));
      for (const [bx, bz, c] of [[0.15, 0.66, 0x1565c0], [0.55, -0.66, 0x2e7d32]]) {
        add(box(1.0, 0.22, 0.38, c, bx, -0.02, bz));
        add(box(1.02, 0.06, 0.4, 0xc62828, bx, 0.11, bz));
        add(box(0.3, 0.22, 0.27, 0xfafafa, bx - 0.18, 0.25, bz));
        add(box(0.04, 0.55, 0.04, 0x5d4037, bx + 0.18, 0.4, bz));
        for (const ez of [-0.2, 0.2]) { add(box(0.02, 0.08, 0.08, 0xffffff, bx + 0.51, 0.02, bz + ez)); add(box(0.025, 0.04, 0.04, 0x111111, bx + 0.515, 0.02, bz + ez)); }
      }
    }
    gr.position.set(b.x, 0, b.z); gr.rotation.y = b.kind === 'ben' ? 0 : (b.rot % 3 - 1) * 0.12; // mặt tiền luôn quay về phía người xem
    // vật liệu riêng cho từng toà để tô sẫm khi hư
    for (const p of parts) { p.material = p.material.clone(); p.userData.base = p.material.color.clone(); }
    const rubble = new THREE.Group();
    const rr = rng(b.id * 31 + 5);
    for (let i = 0; i < 7; i++) { const c = box(0.25 + rr() * 0.35, 0.12 + rr() * 0.2, 0.25 + rr() * 0.35, i % 2 ? wall : 0x8d8d8d, (rr() - 0.5) * 1.1, 0.1, (rr() - 0.5) * 1.0); c.rotation.set(rr(), rr() * 3, rr()); rubble.add(c); }
    // vết cháy xém dưới đống đổ nát
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.05, 14), new THREE.MeshBasicMaterial({ color: 0x2b1d14, transparent: true, opacity: 0.45, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.02; rubble.add(scorch);
    rubble.position.copy(gr.position); rubble.visible = false;
    const fire = new THREE.Group();
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), new THREE.MeshBasicMaterial({ color: i ? 0xffb300 : 0xff5722, transparent: true, opacity: 0.9 })); f.position.set((i - 1) * 0.25, 0, (i % 2) * 0.2); fire.add(f); }
    fire.visible = false;
    const top = M ? M.top * (b.kind === 'tower' ? 0.8 + b.h * 0.15 : 1) : { house: 0.62 * b.h + 0.6, shop: 1.2, tower: 0.72 * b.h + 0.3, tank: 1.15, pagoda: 2.6, cap4: 0.92, cho: 1.12, caoc: 0.6 + b.h * 0.55 + 1.3, ben: 0.75 }[b.kind];
    fire.position.set(b.x, top, b.z);
    return { b, gr, parts, rubble, fire, top, hp: b.hp, alive: b.alive, tilt: 0, tiltDir: rr() * 6.28, hitAt: -1e9, rise: 1, lift: null, wall };
  }

  function buildTown(s) {
    if (town) { scene.remove(town.group); town.group.traverse((o) => { if (!o.userData.shared) o.geometry?.dispose?.(); if (o.material && !mats.has(o.material.color?.getHex?.())) o.material.dispose?.(); }); }
    const group = new THREE.Group();
    const items = new Map();
    for (const b of s.buildings) { const it = makeBuilding(b); it.alive = b.alive; it.gr.visible = b.alive; it.rubble.visible = !b.alive; group.add(it.gr, it.rubble, it.fire); items.set(b.id, it); }
    // cây + đèn đường + xe chạy trên đường lớn (trang trí, theo số phố)
    const r = rng(s.townNo * 7919 + 1);
    for (let i = 0, n = 0; i < 160 && n < 26; i++) {
      const x = (r() - 0.5) * ISLAND.rx * 1.9, z = (r() - 0.5) * ISLAND.rz * 1.9;
      if (x < -ISLAND.rx + 0.6 || x > BEACH_X - 0.4 || Math.abs(z) > ISLAND.rz - 0.6 || Math.abs(x) < 0.9 || Math.abs(z - ISLAND.riverZ) < 1.2) continue;
      if (s.buildings.some((b) => Math.abs(b.x - x) < 1.1 && Math.abs(b.z - z) < 1.0)) continue;
      if ((s.fields || []).some((f) => Math.abs(f.x - x) < 1.0 && Math.abs(f.z - z) < 1.0)) continue;
      const t = new THREE.Group();
      const kind = r();
      if (kind < 0.6) { t.add(cyl(0.07, 0.09, 0.35, 5, 0x7a5230, 0, 0.17, 0)); t.add(cyl(0, 0.38, 0.8, 6, r() < 0.5 ? 0x3f9d4a : 0x2f8a5c, 0, 0.7, 0)); }
      else if (kind < 0.85) { t.add(cyl(0.07, 0.09, 0.3, 5, 0x7a5230, 0, 0.15, 0)); const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), mat(0x5cb85c)); c.position.y = 0.55; c.castShadow = true; t.add(c); }
      else { t.add(cyl(0.05, 0.06, 1.2, 4, 0x5a3d26, 0, 0.6, 0)); for (let k = 0; k < 4; k++) { const l = box(0.7, 0.04, 0.16, 0x4caf50, 0, 1.2, 0); l.rotation.y = k * 0.8; l.rotation.z = 0.3; t.add(l); } }
      t.position.set(x, 0, z); t.scale.setScalar(0.85 + r() * 0.5); group.add(t); n++;
    }
    // ruộng lúa ở lô trống làng quê: bờ đất, luống lúa, người đội nón lá, trâu gặm cỏ
    let buf = 0;
    for (const f of s.fields || []) {
      const g = new THREE.Group(); g.position.set(f.x, 0, f.z);
      g.add(box(1.75, 0.05, 1.75, 0x8d6e63, 0, 0.02, 0));
      g.add(box(1.6, 0.06, 1.6, r() < 0.5 ? 0x9ccc65 : 0xd4e157, 0, 0.04, 0));
      for (let k = 0; k < 6; k++) g.add(box(1.5, 0.08, 0.07, 0x689f38, 0, 0.08, -0.62 + k * 0.25));
      const p = new THREE.Group(); p.add(cyl(0.05, 0.06, 0.2, 5, 0x5c6bc0, 0, 0.12, 0)); p.add(cyl(0, 0.17, 0.09, 10, 0xf0e0a0, 0, 0.28, 0));
      p.position.set((r() - 0.5) * 1.0, 0, (r() - 0.5) * 1.0); g.add(p);
      if (MODELS.buffalo && buf++ < 1) { const o = MODELS.buffalo.tpl.clone(true); o.scale.multiplyScalar(0.22); o.position.set(0.45, 0.05, 0.35); o.rotation.y = r() * 6; g.add(o); }
      group.add(g);
    }
    // cột điện + dây điện chằng chịt dọc đường lớn (phía tây)
    let prev = null;
    for (let z = -ISLAND.rz + 0.8; z < ISLAND.rz - 0.5; z += 2.1) {
      if (Math.abs(z - ISLAND.riverZ) < 1.3) { prev = null; continue; }
      const top = 1.35;
      group.add(cyl(0.03, 0.045, top, 5, 0x616161, -0.78, top / 2, z));
      group.add(box(0.36, 0.04, 0.04, 0x616161, -0.78, top - 0.12, z));
      if (z < 0 && r() < 0.6) { const coil = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 4, 8), mat(0x212121)); coil.position.set(-0.78, top - 0.3, z); group.add(coil); }
      if (prev != null) for (const [dx, dy] of [[-0.15, 0], [0, -0.06], [0.15, 0.02]]) { const len = z - prev; const w = box(0.015, 0.015, len, 0x212121, -0.78 + dx, top - 0.14 + dy, (z + prev) / 2); w.castShadow = false; group.add(w); }
      prev = z;
    }
    // dừa trên bãi biển, thuyền thúng ngoài biển
    for (let i = 0; i < 6; i++) {
      const z = -ISLAND.rz + 1.2 + i * 2.9 + (r() - 0.5); if (Math.abs(z - ISLAND.riverZ) < 1.2) continue;
      const t = new THREE.Group(); const tr = cyl(0.05, 0.07, 1.3, 5, 0x8d6e63, 0, 0.65, 0); tr.rotation.z = 0.15; t.add(tr);
      for (let k = 0; k < 5; k++) { const l = box(0.75, 0.03, 0.16, 0x43a047, 0.18, 1.28, 0); l.rotation.y = k * 1.25; l.rotation.z = -0.35; t.add(l); }
      t.position.set(BEACH_X + 0.35 + (r() - 0.5) * 0.3, 0.02, z); group.add(t);
    }
    const boats = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group(); g.add(cyl(0.24, 0.18, 0.14, 10, 0x8d6e63, 0, 0, 0)); g.add(cyl(0.05, 0.06, 0.16, 5, 0x37474f, 0, 0.14, 0)); g.add(cyl(0, 0.15, 0.08, 10, 0xf0e0a0, 0, 0.27, 0));
      g.position.set(SEA_X + 0.7 + r() * 1.8, -0.08, -6 + i * 5.5 + (r() - 0.5) * 1.5); g.userData.ph = r() * 6; group.add(g); boats.push(g);
    }
    const cars = [];
    // xe máy: người đội mũ bảo hiểm
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Group();
      c.add(box(0.1, 0.12, 0.34, [0x212121, 0xd32f2f, 0x1976d2, 0xfbc02d][i], 0, 0.1, 0));
      c.add(cyl(0.05, 0.06, 0.2, 5, [0x5c6bc0, 0xef6c00, 0x26a69a, 0xec407a][i], 0, 0.27, -0.03));
      c.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat([0xffffff, 0xffeb3b, 0xe53935, 0x43a047][i]))); c.children[2].position.set(0, 0.42, -0.03);
      c.userData = { lane: i % 2 ? 0.42 : -0.42, dir: i % 2 ? -1 : 1, z: (r() - 0.5) * 14, v: 1.2 + r() * 0.8 };
      group.add(c); cars.push(c);
    }
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Group();
      c.add(box(0.36, 0.2, 0.65, [0xe53935, 0xffca28, 0x29b6f6][i], 0, 0.16, 0));
      c.add(box(0.3, 0.16, 0.32, 0xe3f2fd, 0, 0.33, -0.04));
      c.userData = { lane: i % 2 ? 0.25 : -0.25, dir: i % 2 ? -1 : 1, z: (r() - 0.5) * 14, v: 1.6 + r() };
      group.add(c); cars.push(c);
    }
    scene.add(group);
    town = { no: s.townNo, group, items, cars, boats };
    anim.townAt = performance.now();
    for (const it of items.values()) it.rise = 0; // phố mới mọc lên
  }

  // ---- đối tượng động ----

  const debris = []; // { m, v, w, life }
  const puffs = []; // { m, v, life, max, grow }
  const debrisG = new THREE.BoxGeometry(1, 1, 1);
  const puffG = new THREE.IcosahedronGeometry(1, 0);
  const sparkM = [0xffd54f, 0xff9800, 0xff5722].map((c) => new THREE.MeshBasicMaterial({ color: c }));
  function spawnDebris(x, y, z, color, n, force = 1, spark = false) {
    for (let i = 0; i < n && debris.length < 420; i++) {
      const m = new THREE.Mesh(debrisG, spark ? sparkM[i % 3] : mat(color)); const s = spark ? 0.05 + Math.random() * 0.05 : 0.08 + Math.random() * 0.2; m.scale.set(s, s * (0.6 + Math.random()), s);
      m.position.set(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 0.8); m.castShadow = true;
      const a = Math.random() * 6.28, sp = (1.5 + Math.random() * 3.5) * force;
      debris.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, (3 + Math.random() * 5) * force, Math.sin(a) * sp), w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: spark ? 0.9 + Math.random() * 0.5 : 3.5 });
      scene.add(m);
    }
  }
  /** Vòng sóng xung kích sát mặt đất. */
  const rings = [];
  function shockwave(x, z, size = 1, color = 0xffffff) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.08, z); scene.add(m);
    rings.push({ m, t: 0, dur: 0.7, size });
  }
  /** Vành bụi lan ra sát đất quanh chân toà. */
  function dustRing(x, z, n = 14, rad = 0.9) {
    for (let i = 0; i < n && puffs.length < 260; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const m = new THREE.Mesh(puffG, new THREE.MeshLambertMaterial({ color: 0xbcaaa4, flatShading: true, transparent: true, opacity: 0.85 }));
      m.position.set(x + Math.cos(a) * rad * 0.5, 0.2, z + Math.sin(a) * rad * 0.5); m.scale.setScalar(0.35 + Math.random() * 0.25);
      const life = 1.6 + Math.random() * 0.8;
      puffs.push({ m, v: new THREE.Vector3(Math.cos(a) * (2.2 + Math.random()), 0.25, Math.sin(a) * (2.2 + Math.random())), life, max: life, grow: 1.6, drag: 1.6 });
      scene.add(m);
    }
  }
  function spawnPuff(x, y, z, color = 0xbdbdbd, n = 6, size = 0.5, rise = 1) {
    for (let i = 0; i < n && puffs.length < 220; i++) {
      const m = new THREE.Mesh(puffG, new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true, opacity: 0.85 }));
      m.position.set(x + (Math.random() - 0.5) * 1.2, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 1.2); m.scale.setScalar(size * (0.5 + Math.random() * 0.6));
      const life = 1 + Math.random() * 1.2;
      puffs.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.8, rise * (0.6 + Math.random()), (Math.random() - 0.5) * 0.8), life, max: life, grow: 1.2 });
      scene.add(m);
    }
  }

  // thiên thạch / mưa đá / mây sét / UFO đang rơi; lốc, khủng long, lũ, khiên
  const strikeObjs = new Map(); // id → { kind, o }
  const hazardObjs = new Map();
  function meteor() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshLambertMaterial({ color: 0x5d4037, emissive: 0xff5722, emissiveIntensity: 0.9, flatShading: true }));
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.45 }));
    g.add(core, glow); return g;
  }
  function stormCloud() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + Math.random() * 0.5, 0), mat(0x546e7a)); m.position.set(i * 0.7 - 1.4, Math.random() * 0.4, Math.random() * 0.5); g.add(m); }
    return g;
  }
  function saucer() {
    const g = new THREE.Group();
    const d = cyl(1.6, 0.6, 0.35, 16, 0x9e9e9e); const top = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8, 0, 6.29, 0, 1.57), new THREE.MeshLambertMaterial({ color: 0x80deea, transparent: true, opacity: 0.85 }));
    top.position.y = 0.15; g.add(d, top);
    for (let i = 0; i < 8; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffeb3b : 0x76ff03 })); l.position.set(Math.cos(i * 0.785) * 1.45, -0.05, Math.sin(i * 0.785) * 1.45); g.add(l); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.4, 8, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xb2ff59, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = -4; g.add(beam); g.userData.beam = beam;
    return g;
  }
  function tornado() {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const r = 0.25 + i * i * 0.028 + i * 0.08;
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12 + i * 0.02, 5, 12), new THREE.MeshLambertMaterial({ color: i % 2 ? 0x90a4ae : 0xb0bec5, transparent: true, opacity: 0.75, flatShading: true }));
      t.rotation.x = Math.PI / 2; t.position.y = 0.2 + i * 0.5; g.add(t);
    }
    for (let i = 0; i < 10; i++) { const d = box(0.15, 0.15, 0.15, [0x8d6e63, 0xf6d6a8, 0x4caf50][i % 3]); d.userData.a = Math.random() * 6.28; d.userData.y = Math.random() * 4; g.add(d); }
    return g;
  }
  function dino() {
    const g = new THREE.Group(); const G = 0x66bb6a, D = 0x388e3c;
    const body = box(1.0, 1.0, 1.7, G, 0, 1.6, 0); g.add(body);
    g.add(box(0.8, 0.5, 1.2, 0xc5e1a5, 0, 1.3, 0.1));
    const neck = box(0.6, 0.9, 0.6, G, 0, 2.3, 0.7); g.add(neck);
    const head = new THREE.Group(); head.position.set(0, 2.85, 1.0);
    head.add(box(0.75, 0.6, 1.0, G, 0, 0, 0.2)); head.add(box(0.7, 0.18, 0.8, D, 0, -0.32, 0.3));
    for (const sx of [-0.25, 0.25]) { head.add(box(0.14, 0.14, 0.08, 0xffffff, sx, 0.15, 0.68)); head.add(box(0.07, 0.07, 0.04, 0x111111, sx, 0.15, 0.73)); }
    for (let i = 0; i < 4; i++) head.add(box(0.06, 0.1, 0.06, 0xffffff, -0.25 + i * 0.17, -0.2, 0.68));
    g.add(head);
    const tail = cyl(0.05, 0.45, 1.8, 6, G, 0, 1.55, -1.5); tail.rotation.x = -Math.PI / 2 - 0.25; g.add(tail);
    for (let i = 0; i < 4; i++) { const sp = cyl(0, 0.16, 0.3, 4, D, 0, 2.15 - i * 0.05, 0.5 - i * 0.45); g.add(sp); }
    const legs = [];
    for (const sx of [-0.35, 0.35]) { const l = new THREE.Group(); l.position.set(sx, 1.2, -0.1); l.add(box(0.36, 1.2, 0.45, G, 0, -0.6, 0)); l.add(box(0.42, 0.14, 0.6, D, 0, -1.15, 0.1)); g.add(l); legs.push(l); }
    for (const sx of [-0.5, 0.5]) g.add(box(0.12, 0.4, 0.12, G, sx, 1.9, 0.75));
    g.userData = { legs, head };
    return g;
  }
  /** Trâu khổng lồ (mô hình Meshy) nếu đã tải, không thì khủng long dựng bằng code. */
  function beast() {
    if (!MODELS.buffalo) return dino();
    const g = new THREE.Group();
    const o = MODELS.buffalo.tpl.clone(true);
    o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.add(o); g.userData = { model: o };
    return g;
  }
  function flood() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), new THREE.MeshLambertMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.55, flatShading: true }));
    m.position.set(0, 0, ISLAND.riverZ); return m;
  }
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, 6.29, 0, 1.6), new THREE.MeshBasicMaterial({ color: 0x64ffda, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  shield.scale.set(ISLAND.rx + 0.8, 5, ISLAND.rz + 0.8); scene.add(shield);
  const shieldWire = new THREE.Mesh(shield.geometry, new THREE.MeshBasicMaterial({ color: 0xa7ffeb, wireframe: true, transparent: true, opacity: 0 }));
  shieldWire.scale.copy(shield.scale); scene.add(shieldWire);
  const bolt = new THREE.Group(); bolt.visible = false; scene.add(bolt);
  let boltUntil = 0;
  function zap(x, z, top) {
    bolt.clear(); let px = x, py = 14;
    const m = new THREE.MeshBasicMaterial({ color: 0xfff59d });
    while (py > top) { const nx = x + (Math.random() - 0.5) * 1.2, ny = Math.max(top, py - 1.2 - Math.random()); const len = Math.hypot(nx - px, ny - py); const seg = new THREE.Mesh(new THREE.BoxGeometry(0.12, len, 0.12), m); seg.position.set((px + nx) / 2, (py + ny) / 2, z); seg.rotation.z = Math.atan2(nx - px, py - ny) * -1; bolt.add(seg); px = nx; py = ny; }
    bolt.visible = true; boltUntil = performance.now() + 260;
  }
  // thợ sửa nhà tí hon
  const workers = []; // { o, life, name, x, z }
  function worker(it, name) {
    if (workers.length > 14) { const w = workers.shift(); scene.remove(w.o); }
    const o = new THREE.Group();
    o.add(cyl(0.11, 0.13, 0.32, 6, [0x1e88e5, 0xef6c00, 0x43a047, 0x8e24aa][Math.floor(Math.random() * 4)], 0, 0.2, 0));
    o.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), mat(0xf8cfa6))); o.children[1].position.y = 0.45;
    o.add(cyl(0.02, 0.13, 0.08, 6, 0xffeb3b, 0, 0.54, 0));
    const a = Math.random() * 6.28; o.position.set(it.b.x + Math.cos(a) * 0.85, 0, it.b.z + Math.sin(a) * 0.75); o.lookAt(it.b.x, 0, it.b.z);
    scene.add(o); workers.push({ o, life: 2.6, name, it });
  }

  // ---------------- cập nhật cảnh theo snapshot ----------------
  function sync() {
    if (!S) return;
    if (!town || town.no !== S.townNo) { buildTown(S); cine.cur = null; cine.queue.length = 0; }
    watchFocus();
    for (const b of S.buildings) {
      const it = town.items.get(b.id); if (!it) continue;
      if (b.hp < it.hp - 0.001 && b.alive) it.hitAt = performance.now();
      if (b.alive && !it.alive) { it.alive = true; it.gr.visible = true; it.rubble.visible = false; it.rise = 0; it.lift = null; it.col = null; it.smokeUntil = 0; it.gr.position.y = 0; it.gr.scale.set(1, 1, 1); spawnPuff(b.x, 0.3, b.z, 0xffe082, 5, 0.4); }
      if (!b.alive && it.alive && !it.lift) down(it, false);
      it.hp = b.hp;
    }
  }
  /** Toà bắt đầu sập: sụp dần xuống đất (nghiêng, lún, toé mảnh), sóng xung kích + vành bụi + tia lửa; xong mới hiện đống đổ nát. */
  function down(it, chain) {
    it.alive = false; it.hp = 0;
    const lifted = lastImpact && lastImpact.kind === 'ufo' && performance.now() - lastImpact.at < 400;
    if (lifted) { it.lift = { t: 0, y: 0 }; it.rubble.visible = false; return; }
    const big = it.b.kind === 'tower' || it.b.kind === 'pagoda' || chain;
    it.col = { t: 0, dur: big ? 1.25 : 0.95, big, chain };
    it.fire.visible = false; it.rubble.visible = false;
    const { x, z } = it.b;
    for (const p of it.parts.slice(0, 6)) spawnDebris(x, it.top * 0.6, z, p.userData.base?.getHex?.() ?? it.wall, big ? 5 : 3, chain ? 1.3 : 0.9);
    spawnDebris(x, it.top * 0.5, z, 0, big ? 18 : 10, 1.2, true);
    shockwave(x, z, big ? 1.6 : 1.1, chain ? 0xffcc80 : 0xffffff);
    dustRing(x, z, big ? 18 : 12, big ? 1.3 : 0.9);
    spawnPuff(x, 0.4, z, 0xa1887f, 5, 0.45, 0.8);
    anim.shake = Math.max(anim.shake, chain ? 0.6 : big ? 0.4 : 0.25);
  }
  /** Một khung hình của cảnh sụp (dt đã nhân hệ số thời gian chậm). */
  function collapse(it, dt, now) {
    const c = it.col;
    c.t += dt;
    const p = clamp(c.t / c.dur, 0, 1), e = p * p * (1.4 - 0.4 * p);
    it.gr.visible = true;
    it.gr.position.y = -it.top * 0.98 * e;
    const tilt = it.tilt + 0.42 * e;
    it.gr.rotation.x = Math.cos(it.tiltDir) * tilt; it.gr.rotation.z = Math.sin(it.tiltDir) * tilt;
    it.gr.scale.set(1 + 0.12 * e, 1 - 0.4 * e, 1 + 0.12 * e);
    it.gr.position.x = it.b.x + (reduced ? 0 : Math.sin(now / 23) * 0.04 * (1 - p));
    for (const q of it.parts) q.material.color.copy(q.userData.base).lerp(new THREE.Color(0x3e2723), 0.55 + 0.4 * e);
    const y = Math.max(0.2, it.top * (1 - e));
    if (Math.random() < dt * (c.big ? 26 : 16)) spawnDebris(it.b.x, y, it.b.z, it.parts[Math.floor(Math.random() * it.parts.length)]?.userData.base?.getHex?.() ?? it.wall, 1, 0.55);
    if (Math.random() < dt * 12) spawnPuff(it.b.x + (Math.random() - 0.5) * 0.9, 0.2, it.b.z + (Math.random() - 0.5) * 0.9, 0xa1887f, 1, 0.32, 0.5);
    if (p >= 1) {
      it.col = null; it.gr.visible = false; it.gr.position.set(it.b.x, 0, it.b.z);
      it.rubble.visible = true; it.rubble.scale.setScalar(0.2); it.settle = 0;
      it.smokeUntil = now + (c.big ? 9000 : 6000);
      dustRing(it.b.x, it.b.z, 10, 1); spawnDebris(it.b.x, 0.3, it.b.z, it.wall, 6, 0.5);
      anim.shake = Math.max(anim.shake, c.big ? 0.35 : 0.2);
      sound.play('thud');
    }
  }
  let lastImpact = null;

  // ---------------- máy quay cận cảnh ----------------
  const nearest = (x, z) => { let best = null, bd = 1e9; for (const it of town?.items.values() || []) { const d = Math.hypot(it.b.x - x, it.b.z - z); if (d < bd) { bd = d; best = it; } } return bd < 1.6 ? best : null; };
  const zoomOn = () => S?.cam?.zoom !== false && !reduced;
  /** Xếp một cận cảnh. f: { x, z, y, r, el, ms, follow?, label, low? } */
  function focus(f) {
    if (!zoomOn()) return;
    const now = performance.now();
    if (playing()) f.r = Math.max(f.r, 22); // streamer đang bấm: zoom nhẹ để còn thấy cả phố
    f.yaw = clamp(Math.atan2(f.x, 9) * 0.9, -0.6, 0.6);
    f.start = now; f.until = now + f.ms;
    const cur = cine.cur, hold = (S?.cam?.hold ?? 1.5) * 1000;
    if (cur && f.low) { if (cine.queue.length < 3) cine.queue.push(f); return; }
    if (cur && now - cur.start < hold) { if (cine.queue.length >= 4) cine.queue.shift(); cine.queue.push(f); return; }
    if (cur && cur.until - now > 1200) cine.queue.unshift(cur); // thảm hoạ cũ chưa xong: quay lại sau
    cine.cur = f;
  }
  function watchFocus() {
    const liveS = new Set(), liveH = new Set();
    for (const st of S.strikes) {
      liveS.add(st.id);
      if (cine.seenS.has(st.id)) continue;
      cine.seenS.add(st.id);
      if (S.phase !== 'play' || st.by?.npc || !['thienthach', 'set', 'ufo', 'no'].includes(st.kind)) continue;
      const tid = st.targets?.[0];
      const it = tid != null ? town?.items.get(tid) : nearest(st.x, st.z);
      const top = it?.top ?? 1.2;
      // [khoảng cách, góc ngẩng, độ cao điểm nhìn, giữ thêm ms, nghiêng máy] — góc thấp nhìn ngước lên cho "điện ảnh"
      const P = { thienthach: [12, 0.2, top * 0.7, 2000, 0.06], set: [10, 0.12, top * 0.85, 1800, -0.05], ufo: [15, 0.1, top + 2.2, 2800, 0.04], no: [13, 0.3, 0.8, 1500, 0.08] }[st.kind];
      focus({ x: it ? it.b.x : st.x, z: it ? it.b.z : st.z, y: P[2], r: P[0], el: P[1], ms: Math.max(0, st.leftMs) + P[3], low: st.kind === 'no', roll: P[4],
        label: `${ACT[st.kind === 'no' ? 'thienthach' : st.kind]?.[0] || '💥'} ${it ? KIND_NAME[it.b.kind] : 'Phố'}${st.kind === 'no' ? ' · nổ dây chuyền' : ` · ${st.by?.name || ''}`}` });
    }
    for (const h of S.hazards) {
      liveH.add(h.id);
      if (cine.seenH.has(h.id)) continue;
      cine.seenH.add(h.id);
      if (S.phase !== 'play' || h.by?.npc) continue;
      const left = Math.max(0, h.totalMs - h.doneMs);
      const label = `${ACT[h.kind]?.[0] || ''} ${ACT[h.kind]?.[1] || ''} · ${h.by?.name || ''}`;
      if (h.kind === 'khunglong') focus({ x: h.path.x0, z: h.path.z0, y: 1.4, r: 11, el: 0.26, ms: left, label, follow: () => hazardObjs.get(h.id)?.o?.position, chase: h.id, roll: 0.04 }); // máy quay đuổi sau lưng trâu
      else if (h.path) focus({ x: h.path.x0, z: h.path.z0, y: 2.2, r: 17, el: 0.2, ms: left, label, follow: () => hazardObjs.get(h.id)?.o?.position, roll: -0.06 });
      else if (h.kind === 'lu') focus({ x: 0, z: ISLAND.riverZ, y: 0, r: 24, el: 0.55, ms: Math.min(left, 5000), label });
      else if (h.kind === 'dongdat') focus({ x: 0, z: 0.6, y: 0, r: 32, el: 0.62, ms: Math.min(left, 4000), label });
    }
    for (const id of cine.seenS) if (!liveS.has(id)) cine.seenS.delete(id);
    for (const id of cine.seenH) if (!liveH.has(id)) cine.seenH.delete(id);
  }
  function updateCamera(now, dt) {
    const sm = S?.slowmo;
    let lx, ly, lz, r, el, yaw, fov = 36, roll = 0, speed;
    if (sm && zoomOn()) {
      // dừng thời gian: cắt cảnh thẳng vào góc thấp sát toà đang sập, máy quay quay vòng chậm (bullet time)
      const key = `${S.townNo}:${sm.id}:${sm.x}`;
      if (cine.slow?.key !== key) {
        const it = town?.items.get(sm.id);
        const top = it?.top ?? 2;
        cine.slow = { key, x: sm.x, z: sm.z, top, start: now, ms: Math.max(600, sm.leftMs), yaw0: clamp(Math.atan2(sm.x, 9), -0.5, 0.5) - 0.55 };
        cine.look.set(sm.x, top * 0.4, sm.z); cine.r = 9 + top * 2.1; cine.el = 0.12; cine.yaw = cine.slow.yaw0; cine.fov = 30; cine.roll = 0.08;
        anim.flash = 0.55; anim.flashCol = '#ffffff'; anim.slowAt = now;
        sound.play('slow');
      }
      const q = cine.slow, p = clamp((now - q.start) / q.ms, 0, 1);
      lx = q.x; ly = q.top * 0.35; lz = q.z; r = 9 + q.top * 2.1 - p * 2.2; el = 0.12 + p * 0.12; yaw = q.yaw0 + p * 1.3; fov = 27; roll = 0.08 - p * 0.12; speed = 5;
    } else {
      cine.slow = null;
      if (!zoomOn() || S?.phase !== 'play') { cine.cur = null; cine.queue.length = 0; }
      while (cine.cur && now > cine.cur.until) { cine.cur = null; while (cine.queue.length && !cine.cur) { const f = cine.queue.shift(); if (f.until > now + 300) { f.start = now; cine.cur = f; } } }
      const f = cine.cur;
      lx = CAM.look.x; ly = CAM.look.y; lz = CAM.look.z; r = CAM.r; el = CAM.el; yaw = reduced ? 0 : Math.sin(now / 5200) * 0.1;
      if (S?.phase === 'wiped' && !reduced) yaw = Math.sin(now / 2600) * 0.35; // phố sập: lia chậm qua đống đổ nát
      if (f) {
        const pos = f.follow?.();
        lx = pos ? pos.x : f.x; lz = pos ? pos.z : f.z; ly = f.y; r = f.r; el = f.el; yaw = f.yaw + (reduced ? 0 : Math.sin(now / 3000) * 0.05);
        if (f.chase != null) { const o = hazardObjs.get(f.chase)?.o; if (o) yaw = o.rotation.y + Math.PI + 0.75; }
        fov = r < 20 ? 31 : 34; roll = reduced ? 0 : (f.roll || 0);
      }
      speed = f ? 2.6 : 1.8;
    }
    const k = 1 - Math.exp(-dt * speed);
    cine.look.x = lerp(cine.look.x, lx, k); cine.look.y = lerp(cine.look.y, ly, k); cine.look.z = lerp(cine.look.z, lz, k);
    cine.r = lerp(cine.r, r, k); cine.el = lerp(cine.el, el, k); cine.fov = lerp(cine.fov, fov, k); cine.roll = lerp(cine.roll, roll, k);
    let dy = yaw - cine.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); cine.yaw += dy * k;
    const c = Math.cos(cine.el) * cine.r;
    camera.position.set(cine.look.x + Math.sin(cine.yaw) * c, cine.look.y + Math.sin(cine.el) * cine.r, cine.look.z + Math.cos(cine.yaw) * c);
    // máy quay cầm tay: rung rất nhẹ khi cận cảnh
    if (!reduced && cine.r < 25) { camera.position.x += Math.sin(now / 410) * 0.05; camera.position.y += Math.sin(now / 530) * 0.04; }
    camera.lookAt(cine.look);
    camera.rotateZ(cine.roll);
    if (Math.abs(camera.fov - cine.fov) > 0.01) { camera.fov = cine.fov; camera.updateProjectionMatrix(); }
  }
  const closeUp = () => cine.cur && cine.r < CAM.r * 0.7;

  // ---------------- streamer tự chơi (cửa sổ chơi) ----------------
  const playing = () => !!input && S?.mode === 'host';
  /** Tìm thứ dưới con trỏ (toạ độ khung 1080×1920): vật đang rơi > lốc / trâu > toà nhà. */
  function pick(px, py) {
    let best = null, bd = 1e9;
    const consider = (d, lim, hit) => { if (d < lim && d < bd) { bd = d; best = hit; } };
    for (const [id, so] of strikeObjs) { if (!so.o || so.leaving != null) continue; const p = toScreen(so.o.position.x, so.o.position.y, so.o.position.z); if (p.front) consider(Math.hypot(p.x - px, p.y - py), so.kind === 'ufo' ? 150 : 110, { type: 'shoot', id }); }
    if (best) return best;
    for (const [id, ho] of hazardObjs) { if (!ho.o || !ho.h.path) continue; const p = toScreen(ho.o.position.x, 1.6, ho.o.position.z); if (p.front) consider(Math.hypot(p.x - px, p.y - py), 160, { type: 'chase', id }); }
    if (best) return best;
    for (const it of town?.items.values() || []) {
      if (!it.alive) continue;
      const a = toScreen(it.b.x, 0, it.b.z), b = toScreen(it.b.x, it.top, it.b.z);
      const t = clamp(((px - a.x) * (b.x - a.x) + (py - a.y) * (b.y - a.y)) / Math.max(1, (b.x - a.x) ** 2 + (b.y - a.y) ** 2), 0, 1);
      consider(Math.hypot(px - (a.x + (b.x - a.x) * t), py - (a.y + (b.y - a.y) * t)), 70, { type: 'fix', id: it.b.id });
    }
    return best;
  }
  let holdTimer = 0, cursor = null;
  const toFrame = (e) => { const rc = canvas.getBoundingClientRect(); return { x: (e.clientX - rc.left) / rc.width * W, y: (e.clientY - rc.top) / rc.height * H }; };
  if (input && typeof window !== 'undefined') {
    const stopHold = () => { clearInterval(holdTimer); holdTimer = 0; };
    canvas.addEventListener('pointerdown', (e) => {
      sound.resume();
      if (!playing() || S.phase !== 'play') return;
      const p = toFrame(e); cursor = { ...p, at: performance.now() };
      const hit = pick(p.x, p.y);
      if (!hit) return;
      input(hit);
      stopHold();
      if (hit.type === 'fix') holdTimer = setInterval(() => { if (!playing() || S.phase !== 'play') return stopHold(); input(hit); }, 160); // giữ chuột = sửa liên tục
    });
    canvas.addEventListener('pointermove', (e) => { if (playing()) cursor = { ...toFrame(e), at: performance.now() }; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) canvas.addEventListener(ev, stopHold);
  }

  // ---------------- HUD 2D ----------------
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g2.beginPath(); g2.moveTo(x + r, y); g2.arcTo(x + w, y, x + w, y + h, r); g2.arcTo(x + w, y + h, x, y + h, r); g2.arcTo(x, y + h, x, y, r); g2.arcTo(x, y, x + w, y, r); g2.closePath(); }
  function card(x, y, w, h, r = 26, col = 'rgba(255,255,255,.86)', border = INK, bw = 5) { rr(x, y, w, h, r); g2.fillStyle = col; g2.fill(); if (border) { g2.lineWidth = bw; g2.strokeStyle = border; g2.stroke(); } }
  function text(s, x, y, size, color = INK, weight = 800, align = 'center', maxW = 0, font = FONT) {
    g2.font = `${weight} ${size}px ${font}`; g2.fillStyle = color; g2.textAlign = align; g2.textBaseline = 'middle';
    let t = String(s ?? '');
    if (maxW && g2.measureText(t).width > maxW) { while (t.length > 1 && g2.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; }
    g2.fillText(t, x, y);
  }
  function out(s, x, y, size, color = '#fff', { align = 'center', maxW = 0, stroke = INK, sw = 0 } = {}) {
    let sz = size; s = String(s ?? '');
    g2.font = `800 ${sz}px ${TITLE}`;
    if (maxW) while (sz > 16 && g2.measureText(s).width > maxW) { sz -= 2; g2.font = `800 ${sz}px ${TITLE}`; }
    g2.textAlign = align; g2.textBaseline = 'middle'; g2.lineJoin = 'round';
    g2.lineWidth = sw || Math.max(6, sz * 0.2); g2.strokeStyle = stroke; g2.strokeText(s, x, y + 4); g2.strokeText(s, x, y);
    g2.fillStyle = color; g2.fillText(s, x, y);
  }
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const v3 = new THREE.Vector3();
  const toScreen = (x, y, z) => { v3.set(x, y, z).project(camera); return { x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H, front: v3.z < 1 }; };
  function chip(s, x, y, size = 26, bg = 'rgba(29,35,64,.82)', fg = '#fff', maxW = 360) {
    g2.font = `800 ${size}px ${FONT}`; const w = Math.min(maxW, g2.measureText(s).width + 28);
    rr(x - w / 2, y - size * 0.8, w, size * 1.6, size * 0.8); g2.fillStyle = bg; g2.fill();
    text(s, x, y + 1, size, fg, 800, 'center', maxW - 30);
  }
  function avatar(u, x, y, r) {
    g2.beginPath(); g2.arc(x, y, r, 0, 7); g2.fillStyle = '#ffcf4a'; g2.fill(); g2.lineWidth = 4; g2.strokeStyle = INK; g2.stroke();
    text(String(u?.name || '?').trim().charAt(0).toUpperCase(), x, y + 2, r * 1.05, INK, 900);
  }

  function drawSky(now) {
    const gr = g2.createLinearGradient(0, 0, 0, H);
    const wiped = S?.phase === 'wiped';
    gr.addColorStop(0, wiped ? '#3b2a5a' : '#6ec3ff'); gr.addColorStop(0.55, wiped ? '#c06a6a' : '#bfe6ff'); gr.addColorStop(1, wiped ? '#f2a65a' : '#fff1d6');
    g2.fillStyle = gr; g2.fillRect(0, 0, W, H);
    g2.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 6; i++) { const x = ((i * 233 + now * 0.012 * (1 + i % 3)) % (W + 400)) - 200, y = 140 + i * 230; g2.beginPath(); g2.ellipse(x, y, 120, 34, 0, 0, 7); g2.ellipse(x + 70, y - 18, 80, 30, 0, 0, 7); g2.fill(); }
  }

  /** Dừng thời gian: thanh đen điện ảnh trên / dưới, chữ SLOW-MO, ai đánh sập toà gì. */
  function letterbox(s, now) {
    const slowK = clamp(1 - Math.abs((anim.ts ?? 1) - 0.45) / 0.55, 0, 1);
    if (slowK > 0.02) {
      const bh = 190 * slowK;
      g2.fillStyle = '#000'; g2.fillRect(0, 0, W, bh); g2.fillRect(0, H - bh, W, bh);
      const sm = s.slowmo || anim.lastSlow;
      if (s.slowmo) anim.lastSlow = s.slowmo;
      g2.globalAlpha = slowK;
      if (Math.floor(now / 400) % 2) { g2.fillStyle = '#ff3b30'; g2.beginPath(); g2.arc(70, bh - 95, 14, 0, 7); g2.fill(); }
      text('SLOW-MO', 100, bh - 94, 40, '#fff', 900, 'left', 0, TITLE);
      text(sm?.final ? 'CÚ CHỐT HẠ!' : sm?.chain ? 'NỔ DÂY CHUYỀN!' : '⏱ THỜI GIAN NGỪNG TRÔI', W - 60, bh - 94, 34, '#ffd23f', 900, 'right', 560, TITLE);
      if (sm) text(`💥 ${sm.by?.name || ''} đánh sập ${KIND_NAME[sm.kind] || 'toà nhà'}`, W / 2, H - bh + 95, 44, '#fff', 900, 'center', 980, TITLE);
      g2.globalAlpha = 1;
    }
  }

  function drawHud(now) {
    const s = S;
    if (s.slowmo && (anim.ts ?? 1) < 0.7) { letterbox(s, now); return; } // chiếu chậm: chỉ giữ khung điện ảnh
    // tiêu đề + thanh đổ nát
    out('PHỐ TÍ HON', W / 2, 78, 84, '#ffd23f');
    const pct = s.downPct / Math.max(1, s.wipePercent);
    card(150, 140, 780, 74, 37, 'rgba(255,255,255,.9)');
    rr(160, 150, Math.max(54, 760 * clamp(pct, 0, 1)), 54, 27); g2.fillStyle = pct > 0.7 ? '#ff5252' : pct > 0.4 ? '#ff9f43' : '#ffd23f'; g2.fill();
    const host = s.mode === 'host', since = s.phase === 'play' && !s.paused ? now - recvAt : 0;
    if (host) text(`Giữ phố #${s.townNo}  ·  còn ⏱ ${mmss(s.hostLeftMs - since)}  ·  đổ nát ${s.downPct}% / ${s.wipePercent}%`, W / 2, 178, 30, INK, 900, 'center', 740);
    else text(`Phố #${s.townNo}  ·  đổ nát ${s.downPct}% / ${s.wipePercent}%  ·  ⏱ ${mmss(s.elapsedMs + since)}`, W / 2, 178, 30, INK, 900, 'center', 740);
    if (host) {
      // năng lượng + tỉ số streamer / người xem
      const pips = Array.from({ length: s.maxEnergy }, (_, i) => (i < s.energy ? '⚡' : '·')).join('');
      chip(`Streamer ${s.score.host} – ${s.score.viewers} Người xem  ·  ${pips}${s.energyInMs ? ` +1 sau ${Math.ceil((s.energyInMs - since) / 1000)}s` : ''}`, W / 2, 252, 24, 'rgba(29,35,64,.86)', '#fff', 760);
    } else if (s.fastestMs) chip(`🏁 Kỷ lục sập phố: ${mmss(s.fastestMs)}  ·  đã sập ${s.wipes} phố`, W / 2, 252, 24);
    if (s.shieldMs > 0) chip(`🛡️ Khiên còn ${Math.ceil((s.shieldMs - (now - recvAt)) / 1000)}s`, W / 2, 486, 28, 'rgba(0,150,136,.9)');
    if (s.carry) chip(`🎁 ${s.carry} thảm hoạ chờ phố mới`, W / 2, 486, 26, 'rgba(126,87,194,.9)');
    // nhiệm vụ: thẻ giữa trên + mũi tên chỉ toà mục tiêu
    const m = s.mission, sinceM = s.slowmo ? 0 : now - recvAt;
    if (m && s.phase === 'play') {
      const left = Math.max(0, m.leftMs - sinceM), k = clamp(left / Math.max(1, m.totalMs), 0, 1);
      card(366, 282, 348, 112, 24, 'rgba(255,248,225,.95)', '#d84315', 4);
      text(`🎯 NHIỆM VỤ  ·  +${m.reward} điểm`, 540, 306, 22, '#d84315', 900);
      text(m.label, 540, 340, 28, INK, 900, 'center', 326);
      rr(384, 366, 312, 14, 7); g2.fillStyle = 'rgba(0,0,0,.12)'; g2.fill();
      rr(384, 366, Math.max(14, 312 * k), 14, 7); g2.fillStyle = k < 0.25 ? '#ff5252' : '#ff9f43'; g2.fill();
      if (m.n > 1) text(`${m.got}/${m.n}`, 698, 340, 22, '#6a1b9a', 900, 'right');
      const it = m.target != null ? town?.items.get(m.target) : null;
      if (it && it.alive && !s.slowmo) {
        const p = toScreen(it.b.x, it.top + 0.3, it.b.z);
        if (p.y < 560) { const q = toScreen(it.b.x, it.top * 0.55, it.b.z); p.x = q.x; p.y = Math.max(560, q.y); } // đỉnh toà khuất sau HUD: chỉ vào thân toà
        if (p.front) { const bob = Math.sin(now / 180) * 12; g2.save(); g2.translate(p.x, p.y - 50 + bob); g2.fillStyle = '#ff3b30'; g2.strokeStyle = '#fff'; g2.lineWidth = 5; g2.beginPath(); g2.moveTo(-26, -30); g2.lineTo(26, -30); g2.lineTo(0, 6); g2.closePath(); g2.stroke(); g2.fill(); g2.restore(); text('🎯', p.x, p.y - 112 + bob, 40, INK, 400); }
      }
    }
    // biến cố đang diễn ra
    const ev = s.event;
    if (ev && s.phase === 'play') {
      const left = Math.max(0, ev.leftMs - sinceM);
      const bg = { bao: 'rgba(55,71,79,.92)', giovang: 'rgba(255,160,0,.95)', cuuho: 'rgba(198,40,40,.92)', trieucuong: 'rgba(2,119,189,.92)', tet: 'rgba(211,47,47,.95)' }[ev.id] || 'rgba(29,35,64,.9)';
      chip(`${ev.icon} ${ev.name.toUpperCase()} · ${ev.desc} · ${Math.ceil(left / 1000)}s`, W / 2, 428, 26, bg, '#fff', 700);
    }
    // bảng phá
    if (s.showBoard !== false && (s.top.length || s.legends.length)) panel('board', { x: 24, y: 280 }, () => {
      const rows = s.top.slice(0, 5), leg = s.legends.slice(0, 3);
      const head = rows.length ? 70 + rows.length * 52 : 6;
      const h = head + (leg.length ? 64 + leg.length * 50 : 0);
      card(24, 280, 330, h, 26, 'rgba(255,255,255,.88)', INK, 4);
      if (rows.length) text('💥 Phá nhiều nhất', 189, 315, 28, '#d84315', 900);
      rows.forEach((r, i) => { const y = 366 + i * 52; avatar(r, 64, y, 20); text(r.name, 94, y, 25, INK, 800, 'left', 170); text(String(r.dmg), 336, y, 25, '#d84315', 900, 'right'); });
      if (leg.length) {
        const y0 = 280 + head + 26;
        text('🏆 Bảng Phá (số phố sập)', 189, y0, 25, '#6a1b9a', 900);
        leg.forEach((r, i) => { const y = y0 + 48 + i * 50; avatar(r, 64, y, 19); text(r.name, 94, y, 24, INK, 800, 'left', 180); text(`×${r.wipes}`, 336, y, 26, '#6a1b9a', 900, 'right'); });
      }
    });
    // dân sửa nhà
    if (s.fixers.length) { card(726, 280, 330, 54 + s.fixers.length * 44, 24, 'rgba(255,255,255,.85)', INK, 4); text('🔧 Dân sửa nhà', 891, 310, 26, '#2e7d32', 900); s.fixers.forEach((r, i) => text(`${r.name} · ${r.fixes}`, 891, 352 + i * 44, 23, INK, 800, 'center', 300)); }
    // tên trên đầu thợ, người gọi thảm hoạ
    for (const w of workers) { const p = toScreen(w.o.position.x, 0.9, w.o.position.z); if (p.front) chip(`🔧 ${w.name}`, p.x, p.y - 20, 22, 'rgba(46,125,50,.88)'); }
    for (const l of labels) { const p = toScreen(l.x(), l.y(), l.z()); if (p.front) chip(l.text, p.x, p.y - 40, 26, 'rgba(216,67,21,.9)'); }
    // cận cảnh
    if (closeUp() && cine.cur?.label && s.phase === 'play' && !s.slowmo) {
      const a = clamp((now - cine.cur.start) / 400, 0, 1);
      g2.globalAlpha = a; chip(`🎥 ${cine.cur.label}`, W / 2, 1110, 30, 'rgba(216,67,21,.92)', '#fff', 900); g2.globalAlpha = 1;
      // khung ngắm góc màn hình kiểu máy quay + chấm REC
      g2.strokeStyle = `rgba(255,255,255,${0.75 * a})`; g2.lineWidth = 6;
      for (const [x, y, dx, dy] of [[24, 236, 1, 1], [W - 24, 236, -1, 1], [24, 1540, 1, -1], [W - 24, 1540, -1, -1]]) { g2.beginPath(); g2.moveTo(x, y + dy * 60); g2.lineTo(x, y); g2.lineTo(x + dx * 60, y); g2.stroke(); }
      if (Math.floor(now / 500) % 2) { g2.fillStyle = `rgba(255,59,48,${a})`; g2.beginPath(); g2.arc(930, 70, 13, 0, 7); g2.fill(); out('REC', 990, 72, 34, '#fff', { sw: 6 }); }
    }
    // cửa sổ chơi: tâm ngắm trên vật đang rơi / thảm hoạ bấm được + gợi ý
    if (playing() && s.phase === 'play' && !s.slowmo) {
      const ok = s.energy >= 1, pulse = 1 + Math.sin(now / 120) * 0.12;
      const ring = (p, rad) => { g2.strokeStyle = ok ? '#ff3b30' : 'rgba(120,120,120,.8)'; g2.lineWidth = 6; g2.beginPath(); g2.arc(p.x, p.y, rad * pulse, 0, 7); g2.stroke(); g2.beginPath(); g2.moveTo(p.x - rad * 1.3, p.y); g2.lineTo(p.x - rad * 0.6, p.y); g2.moveTo(p.x + rad * 0.6, p.y); g2.lineTo(p.x + rad * 1.3, p.y); g2.moveTo(p.x, p.y - rad * 1.3); g2.lineTo(p.x, p.y - rad * 0.6); g2.moveTo(p.x, p.y + rad * 0.6); g2.lineTo(p.x, p.y + rad * 1.3); g2.stroke(); };
      for (const so of strikeObjs.values()) if (so.o && so.leaving == null) { const p = toScreen(so.o.position.x, so.o.position.y, so.o.position.z); if (p.front) ring(p, so.kind === 'mua' ? 30 : 46); }
      for (const ho of hazardObjs.values()) if (ho.o && ho.h.path) { const p = toScreen(ho.o.position.x, 1.6, ho.o.position.z); if (p.front) ring(p, 60); }
      chip('Giữ chuột lên toà để sửa · bấm 🎯 để bắn hạ / đuổi (tốn ⚡)', W / 2, 1532, 24, 'rgba(46,125,50,.92)', '#fff', 980);
    }
    // bảng tin
    feed.forEach((f, i) => { const a = clamp((f.until - now) / 600, 0, 1); g2.globalAlpha = a; chip(f.text, W / 2, 1500 - i * 50, 25, f.bg, '#fff', 900); g2.globalAlpha = 1; });
    // biểu ngữ quà
    const bn = banners[0];
    if (bn) {
      const t = (now - bn.at) / 2600;
      if (t >= 1) banners.shift();
      else {
        const k = t < 0.12 ? t / 0.12 : t > 0.85 ? (1 - t) / 0.15 : 1;
        g2.save(); g2.globalAlpha = k; g2.translate(W / 2, 1250); g2.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
        card(-400, -78, 800, 156, 40, bn.bg || 'rgba(255,248,225,.96)', INK, 6);
        const spinning = bn.spin && now - bn.at < 1100;
        const SPIN = ['☄️', '⚡', '🌪️', '🌊', '🫨', '🐃', '🛸', '🛡️'];
        text(spinning ? SPIN[Math.floor(now / 70) % SPIN.length] : bn.icon, -320, 0, 90, INK, 400);
        out(spinning ? 'Hộp bí ẩn đang quay…' : bn.title, 40, -26, 56, bn.color || '#ff7043', { maxW: 560 });
        text(bn.who, 40, 40, 32, INK, 800, 'center', 560);
        g2.restore();
      }
    }
    // chữ bay
    for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; const t = (now - f.at) / 1400; if (t >= 1) { floaters.splice(i, 1); continue; } g2.globalAlpha = 1 - t; out(f.text, f.x, f.y - t * 120, f.size, f.color); g2.globalAlpha = 1; }
    // bảng quà
    const pw = s.powerups;
    if (pw.length) panel('menu', { x: 30, y: 1560 }, () => {
      const cols = 3, rows = Math.ceil(Math.min(12, pw.length) / cols), cw = 1020 / cols, ch = Math.min(100, 300 / rows);
      card(30, 1560, 1020, rows * ch + 30, 30, 'rgba(29,35,64,.84)', '#ffd23f', 4);
      pw.slice(0, 12).forEach((p, i) => {
        const x = 30 + (i % cols) * cw, y = 1575 + Math.floor(i / cols) * ch;
        const [ic, name] = ACT[p.action] || ['🎁', p.action];
        text(ic, x + 44, y + ch / 2, 42, '#fff', 400);
        text(name, x + 80, y + ch / 2 - 16, 26, '#fff', 900, 'left', cw - 90);
        text(`${p.icon} ${p.text}`, x + 80, y + ch / 2 + 18, 21, '#ffd23f', 800, 'left', cw - 90);
      });
    });
    else { card(90, 1700, 900, 120, 30, 'rgba(29,35,64,.8)', '#ffd23f', 4); text('Tặng quà gọi thảm hoạ · Bình luận để sửa nhà', W / 2, 1760, 32, '#fff', 800, 'center', 860); }
    // màn sập phố
    if (s.phase === 'wiped' && s.winner === 'host') {
      const t = clamp((now - anim.wipeAt) / 500, 0, 1);
      g2.fillStyle = `rgba(10,40,30,${0.4 * t})`; g2.fillRect(0, 0, W, H);
      g2.save(); g2.translate(W / 2, 780); g2.scale(0.6 + 0.4 * t, 0.6 + 0.4 * t);
      card(-430, -230, 860, 460, 46, 'rgba(232,255,240,.97)', INK, 7);
      out('STREAMER GIỮ ĐƯỢC PHỐ!', 0, -160, 70, '#2e7d32', { maxW: 800 });
      text(`Phố #${s.townNo} còn đứng sau ${mmss(s.hostSeconds * 1000)} · đổ nát ${s.downPct}%`, 0, -70, 34, INK, 800, 'center', 780);
      const st = s.hostStats || {};
      text(`🔧 sửa ${st.fixes || 0} lần   🎯 bắn hạ ${st.shots || 0}   💨 đuổi ${st.chased || 0}`, 0, 0, 34, '#5d4037', 800, 'center', 780);
      text(`Tỉ số: Streamer ${s.score.host} – ${s.score.viewers} Người xem`, 0, 70, 36, '#6a1b9a', 900);
      text(`Phố mới sau ${Math.ceil(Math.max(0, s.nextInMs - (now - recvAt)) / 1000)} giây…`, 0, 160, 30, '#7e57c2', 800);
      g2.restore();
    }
    if (s.phase === 'wiped' && s.wipedBy) {
      const t = clamp((now - anim.wipeAt) / 500, 0, 1);
      g2.fillStyle = `rgba(20,10,40,${0.45 * t})`; g2.fillRect(0, 0, W, H);
      g2.save(); g2.translate(W / 2, 780); g2.scale(0.6 + 0.4 * t, 0.6 + 0.4 * t);
      card(-430, -230, 860, 460, 46, 'rgba(255,248,225,.97)', INK, 7);
      out('PHỐ SẬP RỒI!', 0, -160, 92, '#ff5252');
      avatar(s.wipedBy, 0, -40, 54);
      text(s.wipedBy.name, 0, 50, 46, INK, 900, 'center', 760);
      text(`đánh sập phố #${s.townNo} sau ${mmss(s.elapsedMs)}`, 0, 110, 32, '#5d4037', 800);
      text(s.mode === 'host' ? `Người xem thắng · tỉ số ${s.score.host} – ${s.score.viewers}  ·  phố mới sau ${Math.ceil(Math.max(0, s.nextInMs - (now - recvAt)) / 1000)}s` : `Phố mới sau ${Math.ceil(Math.max(0, s.nextInMs - (now - recvAt)) / 1000)} giây…`, 0, 175, 30, '#7e57c2', 800, 'center', 800);
      g2.restore();
    }
    letterbox(s, now);
    if (s.paused) { card(W / 2 - 220, 900, 440, 110, 30, 'rgba(29,35,64,.9)', '#fff', 4); text('⏸ Tạm dừng', W / 2, 955, 50, '#fff', 900); }
  }

  // ---------------- hiệu ứng biến cố (2D đè lên cảnh 3D) ----------------
  const rain = Array.from({ length: 140 }, (_, i) => ({ x: (i * 97) % W, y: (i * 389) % H, v: 1400 + (i % 7) * 120 }));
  const sparks = [];
  function eventFx(id, now, dt) {
    if (id === 'bao') {
      g2.fillStyle = 'rgba(25,35,55,.28)'; g2.fillRect(0, 0, W, H);
      g2.strokeStyle = 'rgba(200,220,255,.55)'; g2.lineWidth = 3; g2.beginPath();
      for (const d of rain) { d.y += d.v * dt; d.x -= d.v * dt * 0.25; if (d.y > H) { d.y -= H; d.x = Math.random() * (W + 300); } if (d.x < 0) d.x += W; g2.moveTo(d.x, d.y); g2.lineTo(d.x + 12, d.y - 46); }
      g2.stroke();
      if (Math.random() < dt * 0.4) { anim.flash = 0.45; anim.flashCol = '#e3f2fd'; sound.play('zap'); }
    } else if (id === 'giovang') {
      const vg = g2.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.65); vg.addColorStop(0, 'rgba(255,215,0,0)'); vg.addColorStop(1, `rgba(255,193,7,${0.35 + Math.sin(now / 200) * 0.08})`); g2.fillStyle = vg; g2.fillRect(0, 0, W, H);
      if (Math.random() < dt * 14) sparks.push({ x: Math.random() * W, y: 300 + Math.random() * 1200, vx: 0, vy: -60, life: 1, col: '#fff59d', s: 6 });
    } else if (id === 'tet') {
      if (Math.random() < dt * 3) { const x = 150 + Math.random() * 780, y = 450 + Math.random() * 500, col = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#ff80ab'][Math.floor(Math.random() * 5)]; for (let i = 0; i < 36; i++) { const a = i / 36 * 6.28, v = 220 + Math.random() * 160; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.2, col, s: 7 }); } sound.play('fix'); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.life -= dt; p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) { sparks.splice(i, 1); continue; } g2.globalAlpha = clamp(p.life, 0, 1); g2.fillStyle = p.col; g2.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    g2.globalAlpha = 1;
    if (sparks.length > 600) sparks.splice(0, sparks.length - 600);
  }

  // ---------------- vòng vẽ ----------------
  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const since = S && !S.paused && !S.slowmo ? now - recvAt : 0; // dừng thời gian: vật đang rơi / thảm hoạ treo yên
    anim.ts = lerp(anim.ts ?? 1, S?.slowmo ? 0.45 : 1, 1 - Math.exp(-dt * 8)); // hiệu ứng (mảnh vỡ, bụi, cảnh sụp) chạy chậm
    const sdt = dt * anim.ts;
    drawSky(now);
    if (!renderer) { if (S) drawHud(now); else text('Phố Tí Hon cần WebGL', W / 2, H / 2, 48, INK); return; }
    if (S) {
      // camera: lắc lư nhẹ, rung khi nổ / động đất
      const quake = S.hazards.some((h) => h.kind === 'dongdat');
      anim.shake = Math.max(quake ? 0.18 : 0, anim.shake - dt * 0.8);
      updateCamera(now, dt);
      const sk = anim.shake * (closeUp() ? 0.45 : 1) * (S.slowmo ? 0.3 : 1); // cận cảnh / chiếu chậm thì rung nhẹ hơn cho đỡ chóng mặt
      if (sk > 0 && !reduced) { camera.position.x += (Math.random() - 0.5) * sk; camera.position.y += (Math.random() - 0.5) * sk; }
      // toà nhà
      const sinceTown = (now - anim.townAt) / 1000;
      for (const it of town.items.values()) {
        if (it.alive) {
          it.rise = Math.min(1, it.rise + dt * 1.6);
          const delay = clamp(sinceTown * 1.4 - (it.b.id % 7) * 0.12, 0, 1);
          const e = Math.min(it.rise, delay > 0 ? 1 - Math.pow(1 - delay, 3) : 0.001);
          const dmg = 1 - it.hp;
          it.tilt = lerp(it.tilt, dmg * 0.22, dt * 3);
          const hit = clamp(1 - (now - it.hitAt) / 350, 0, 1);
          const qk = quake && !reduced ? Math.sin(now / 35 + it.b.id) * 0.04 : 0;
          it.gr.scale.set(1 + hit * 0.08, Math.max(0.001, e) * (1 - hit * 0.12), 1 + hit * 0.08);
          it.gr.rotation.x = Math.cos(it.tiltDir) * it.tilt + qk; it.gr.rotation.z = Math.sin(it.tiltDir) * it.tilt;
          for (const p of it.parts) p.material.color.copy(p.userData.base).lerp(new THREE.Color(0x3e2723), dmg * 0.55);
          it.fire.visible = it.hp < 0.45;
          if (it.fire.visible) { it.fire.children.forEach((f, i) => { f.scale.y = 0.7 + Math.abs(Math.sin(now / 90 + i * 2)) * 0.8; }); if (Math.random() < dt * 4) spawnPuff(it.b.x, it.top + 0.4, it.b.z, 0x616161, 1, 0.3, 1.4); }
        } else if (it.col) collapse(it, sdt, now);
        else if (it.lift) {
          it.lift.t += dt; it.gr.position.y += dt * 3.2; it.gr.rotation.y += dt * 3; const k = Math.max(0.01, 1 - it.lift.t / 1.4); it.gr.scale.set(k, k, k);
          if (it.lift.t > 1.4) { it.gr.visible = false; it.rubble.visible = false; it.lift = null; }
        }
        if (!it.alive && it.rubble.visible) {
          if (it.settle != null && it.settle < 1) { it.settle = Math.min(1, it.settle + sdt * 3.5); const e = it.settle; it.rubble.scale.setScalar(0.2 + 0.8 * e + Math.sin(e * Math.PI) * 0.15); }
          if (now < (it.smokeUntil || 0) && Math.random() < sdt * 3.2) spawnPuff(it.b.x + (Math.random() - 0.5) * 0.6, 0.3, it.b.z + (Math.random() - 0.5) * 0.6, Math.random() < 0.5 ? 0x616161 : 0x8d8d8d, 1, 0.32, 1.1); // khói còn bốc
        }
      }
      // xe chạy, mây trôi
      for (const c of town.cars) { const u = c.userData; u.z += u.dir * u.v * sdt; if (Math.abs(u.z) > ISLAND.rz - 1.2) { u.dir *= -1; u.z = Math.sign(u.z) * (ISLAND.rz - 1.2); } c.position.set(u.lane * u.dir, Math.abs(u.z - ISLAND.riverZ) < 1.2 ? 0.22 : 0.05, u.z); c.rotation.y = u.dir > 0 ? 0 : Math.PI; }
      for (const g of town.boats || []) { g.position.y = -0.08 + Math.sin(now / 600 + g.userData.ph) * 0.04; g.rotation.z = Math.sin(now / 800 + g.userData.ph) * 0.08; }
      // biển: sóng nhẹ, triều cường thì dâng lên tràn bãi cát
      if (sea) { const surge = S.event?.id === 'trieucuong' ? 1 : 0; anim.surge = lerp(anim.surge || 0, surge, dt * 1.5); sea.position.y = -0.25 + Math.sin(now / 900) * 0.02 + anim.surge * (0.18 + Math.sin(now / 250) * 0.05); sea.scale.x = 1 + anim.surge * 0.35; sea.position.x = (ISLAND.rx + SEA_X) / 2 - anim.surge * 0.5; foam.position.x = SEA_X + 0.05 - anim.surge * (0.9 + Math.sin(now / 250) * 0.25); foam.position.y = -0.08 + anim.surge * 0.2; }
      for (const c of clouds) { c.userData.a += c.userData.spin * sdt; c.position.x = Math.cos(c.userData.a) * 11; c.position.z = Math.sin(c.userData.a) * 11; }
      // điểm rơi
      const live = new Set();
      for (const st of S.strikes) {
        live.add(st.id);
        let so = strikeObjs.get(st.id);
        if (!so) { so = { kind: st.kind, o: st.kind === 'thienthach' ? meteor() : st.kind === 'set' ? stormCloud() : st.kind === 'ufo' ? saucer() : st.kind === 'mua' ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat(0xe3f2fd)) : null, st, total: Math.max(st.leftMs, 1) }; if (so.o) scene.add(so.o); strikeObjs.set(st.id, so); }
        if (!so.o) continue;
        const left = Math.max(0, st.leftMs - since), k = left / so.total;
        if (st.kind === 'thienthach') { so.o.position.set(st.x - 9 * k, 0.4 + 22 * k, st.z - 6 * k); so.o.rotation.x += sdt * 6; if (Math.random() < 0.7 * anim.ts) spawnPuff(so.o.position.x, so.o.position.y, so.o.position.z, 0xff8a65, 1, 0.35, 0.2); }
        else if (st.kind === 'mua') so.o.position.set(st.x, 0.3 + 16 * k, st.z);
        else if (st.kind === 'set') so.o.position.set(st.x, 9 + Math.sin(now / 200) * 0.1, st.z);
        else if (st.kind === 'ufo') { so.o.position.set(st.x, 6.5 + 8 * Math.max(0, k - 0.6) / 0.4, st.z); so.o.rotation.y += dt * 2; so.o.userData.beam.material.opacity = k < 0.6 ? 0.25 + Math.sin(now / 80) * 0.08 : 0; }
      }
      for (const [id, so] of strikeObjs) if (!live.has(id)) {
        if (so.kind === 'ufo') { so.leaving = (so.leaving || 0) + dt; so.o.position.y += dt * 9; so.o.userData.beam.material.opacity = Math.max(0, 0.25 - so.leaving); if (so.leaving < 1.5) continue; }
        scene.remove(so.o); strikeObjs.delete(id);
      }
      // thảm hoạ kéo dài
      const liveH = new Set();
      labels.length = 0;
      for (const h of S.hazards) {
        liveH.add(h.id);
        let ho = hazardObjs.get(h.id);
        if (!ho) { ho = { kind: h.kind, o: h.kind === 'loc' ? tornado() : h.kind === 'khunglong' ? beast() : h.kind === 'lu' ? flood() : null, h }; if (ho.o) scene.add(ho.o); hazardObjs.set(h.id, ho); }
        ho.h = h;
        const p = clamp((h.doneMs + since) / h.totalMs, 0, 1);
        if (h.path && ho.o) {
          const q = pathAt(h.path, p);
          ho.o.position.set(q.x, 0, q.z);
          if (h.kind === 'loc') {
            ho.o.children.forEach((c, i) => { if (c.geometry.type === 'TorusGeometry') { c.position.x = Math.sin(now / 300 + i * 0.6) * 0.15 * i; c.rotation.z = now / 200; } else { c.userData.a += dt * 6; c.position.set(Math.cos(c.userData.a) * (0.6 + c.userData.y * 0.35), c.userData.y, Math.sin(c.userData.a) * (0.6 + c.userData.y * 0.35)); } });
            if (Math.random() < 0.5) spawnPuff(q.x, 0.2, q.z, 0xa1887f, 1, 0.35, 0.3);
          } else {
            ho.o.rotation.y = q.dir;
            const st = now / 160, { legs, head, model } = ho.o.userData;
            if (model) { ho.o.position.y = Math.abs(Math.sin(st)) * 0.3; model.rotation.z = Math.sin(st) * 0.09; model.rotation.x = Math.sin(st * 2) * 0.04; }
            else { legs[0].rotation.x = Math.sin(st) * 0.6; legs[1].rotation.x = -Math.sin(st) * 0.6; ho.o.position.y = Math.abs(Math.sin(st)) * 0.15; head.rotation.x = Math.sin(st * 0.5) * 0.15; ho.o.scale.setScalar(1.15); }
            if (Math.sin(st) * Math.sin(st - 0.2) < 0) { anim.shake = Math.max(anim.shake, 0.12); spawnPuff(q.x, 0.1, q.z, 0xbcaaa4, 2, 0.3, 0.2); }
          }
          const nm = h.by?.name; if (nm) labels.push({ text: `${ACT[h.kind][0]} ${nm}`, x: () => ho.o.position.x, y: () => (h.kind === 'loc' ? 5 : 4), z: () => ho.o.position.z });
        } else if (h.kind === 'lu' && ho.o) {
          const up = Math.min(1, p * 4), downK = Math.min(1, (1 - p) * 5), k = Math.min(up, downK);
          ho.o.scale.set(ISLAND.rx * 0.97, 0.05 + 0.6 * k, Math.max(ISLAND.riverW / 2, (1.9 + 1.0 * k) * k + 0.4));
          ho.o.position.y = (0.05 + 0.7 * k) / 2 - 0.05;
          ho.o.material.opacity = 0.3 + 0.25 * k;
        }
      }
      for (const [id, ho] of hazardObjs) if (!liveH.has(id)) { if (ho.o) scene.remove(ho.o); hazardObjs.delete(id); }
      // khiên
      const sh = S.shieldMs - since > 0;
      shield.material.opacity = lerp(shield.material.opacity, sh ? 0.16 + Math.sin(now / 300) * 0.04 : 0, dt * 4);
      shieldWire.material.opacity = shield.material.opacity * 1.6;
      shield.visible = shieldWire.visible = shield.material.opacity > 0.005;
      bolt.visible = now < boltUntil;
      // mảnh vỡ, khói, thợ
      for (let i = rings.length - 1; i >= 0; i--) { const g = rings[i]; g.t += sdt; const p = g.t / g.dur; g.m.scale.setScalar(0.3 + p * 3.6 * g.size); g.m.material.opacity = 0.85 * (1 - p); if (p >= 1) { scene.remove(g.m); g.m.geometry.dispose(); g.m.material.dispose(); rings.splice(i, 1); } }
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i]; d.life -= sdt; d.v.y -= 18 * sdt; d.m.position.addScaledVector(d.v, sdt); d.m.rotation.x += d.w.x * sdt; d.m.rotation.y += d.w.y * sdt;
        const on = Math.abs(d.m.position.x) < ISLAND.rx && Math.abs(d.m.position.z) < ISLAND.rz;
        if (on && d.m.position.y < 0.05 && d.v.y < 0) { d.m.position.y = 0.05; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); }
        if (d.life <= 0 || d.m.position.y < -12) { scene.remove(d.m); debris.splice(i, 1); }
      }
      for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.life -= sdt; if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - sdt * p.drag)); p.m.position.addScaledVector(p.v, sdt); p.m.scale.multiplyScalar(1 + sdt * p.grow * 0.5); p.m.material.opacity = 0.85 * (p.life / p.max); if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); } }
      for (let i = workers.length - 1; i >= 0; i--) { const w = workers[i]; w.life -= sdt; w.o.position.y = Math.abs(Math.sin(now / 110)) * 0.2; if (w.life <= 0) { scene.remove(w.o); workers.splice(i, 1); } }
    } else {
      camera.position.set(0, Math.sin(CAM.el) * CAM.r, Math.cos(CAM.el) * CAM.r); camera.lookAt(CAM.look);
    }
    renderer.render(scene, camera);
    const slowK = clamp(1 - Math.abs(anim.ts - 0.45) / 0.55, 0, 1); // 1 = đang chiếu chậm
    if (slowK > 0.02) g2.filter = `saturate(${1 - 0.5 * slowK}) contrast(${1 + 0.18 * slowK})`;
    g2.drawImage(gl, 0, 0);
    g2.filter = 'none';
    if (S) eventFx(S.event && S.phase === 'play' ? S.event.id : null, now, dt);
    if (slowK > 0.02) { const vg = g2.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.55 * slowK})`); g2.fillStyle = vg; g2.fillRect(0, 0, W, H); }
    if (anim.flash > 0) { g2.fillStyle = anim.flashCol; g2.globalAlpha = anim.flash; g2.fillRect(0, 0, W, H); g2.globalAlpha = 1; anim.flash = Math.max(0, anim.flash - dt * 2.5); }
    if (S) drawHud(now);
  }
  raf = requestAnimationFrame(frame);

  const push = (arr, item, max) => { arr.unshift(item); if (arr.length > max) arr.length = max; };
  return {
    update(s) { S = s; recvAt = performance.now(); sync(); },
    effect(fx) {
      const now = performance.now();
      const who = fx.by?.name || '';
      switch (fx.type) {
        case 'ph_gift': {
          if (fx.mystery) break; // hộp bí ẩn đã có biểu ngữ quay riêng
          const [icon, title] = ACT[fx.action] || ['🎁', fx.action];
          if (banners.length < 4) banners.push({ at: banners.length ? Math.max(now, banners[banners.length - 1].at + 2600) : now, icon, title, who: fx.later ? `${who} · để dành cho phố mới` : `từ ${who}` });
          sound.play('gift');
          break;
        }
        case 'ph_mystery': {
          const [icon, title] = ACT[fx.result] || ['🎁', fx.result];
          const jack = fx.result === 'muathienthach';
          if (banners.length < 4) banners.push({ at: banners.length ? Math.max(now, banners[banners.length - 1].at + 2600) : now, icon, title: jack ? 'JACKPOT! Mưa thiên thạch' : `Ra: ${title}`, who: `🎲 Hộp bí ẩn của ${who}`, spin: true, color: jack ? '#d500f9' : '#ff7043' });
          sound.play('gift');
          break;
        }
        case 'ph_luck': {
          if (fx.luck === 'crit') { floaters.push({ text: '💥 CHÍ MẠNG ×2!', x: W / 2, y: 1050, at: now, size: 78, color: '#ffd23f' }); anim.flash = 0.3; anim.flashCol = '#fff176'; sound.play('boom'); }
          else floaters.push({ text: `😅 XỊT! ${who}`, x: W / 2, y: 1050, at: now, size: 64, color: '#b0bec5' });
          break;
        }
        case 'ph_mission_new': push(feed, { text: `🎯 Nhiệm vụ mới: ${fx.label}`, until: now + 4000, bg: 'rgba(216,67,21,.9)' }, 3); sound.play('tick'); break;
        case 'ph_mission_step': floaters.push({ text: `🎯 ${fx.got}/${fx.n}`, x: W / 2, y: 460, at: now, size: 54, color: '#ffd23f' }); break;
        case 'ph_mission': {
          if (fx.ok) {
            if (banners.length < 4) banners.push({ at: banners.length ? Math.max(now, banners[banners.length - 1].at + 2600) : now, icon: '🏅', title: 'NHIỆM VỤ HOÀN THÀNH!', who: `${who} +${fx.reward} điểm${fx.penalty ? ` · streamer giữ thêm ${fx.penalty}s` : ''}`, bg: 'rgba(232,255,240,.97)', color: '#2e7d32' });
            for (let i = 0; i < 50; i++) { const a = Math.random() * 6.28, v = 300 + Math.random() * 400; sparks.push({ x: W / 2, y: 1250, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 300, life: 1.5, col: ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff'][i % 4], s: 10 }); }
            sound.play('town');
          } else push(feed, { text: `⌛ Hết giờ nhiệm vụ: ${fx.label}${fx.host ? ' · Streamer +2⚡' : ''}`, until: now + 3500, bg: 'rgba(69,90,100,.9)' }, 3);
          break;
        }
        case 'ph_event': {
          if (banners.length < 4) banners.push({ at: banners.length ? Math.max(now, banners[banners.length - 1].at + 2600) : now, icon: fx.icon, title: `BIẾN CỐ: ${fx.name}`, who: fx.desc, bg: 'rgba(255,243,224,.97)', color: '#6a1b9a' });
          sound.play(fx.id === 'bao' ? 'quake' : fx.id === 'tet' ? 'town' : 'whoosh');
          break;
        }
        case 'ph_impact': {
          lastImpact = { kind: fx.kind, at: now };
          if (fx.miss || fx.x > SEA_X) { spawnPuff(fx.x, 0, fx.z, 0xe3f2fd, 14, 0.5, 2.2); spawnPuff(fx.x, 0, fx.z, 0x4fc3f7, 8, 0.4, 1.4); shockwave(fx.x, fx.z, 0.9, 0xb3e5fc); sound.play('whoosh'); break; } // rơi xuống biển: toé nước
          if (fx.kind === 'thienthach' || fx.kind === 'no') {
            spawnPuff(fx.x, 0.3, fx.z, fx.kind === 'no' ? 0xff7043 : 0xffb74d, 14, 0.8, 1.6); spawnPuff(fx.x, 0.3, fx.z, 0x616161, 8, 0.7, 1);
            spawnDebris(fx.x, 0.2, fx.z, 0x6d4c41, 10, 1.2);
            anim.shake = Math.max(anim.shake, fx.kind === 'no' ? 0.7 : 0.55); anim.flash = 0.35; anim.flashCol = '#ffb74d'; sound.play('boom');
            if (fx.chain) push(feed, { text: `🔥 Cây xăng nổ dây chuyền ×2 · ${who}`, until: now + 3500, bg: "rgba(216,67,21,.9)" }, 3);
          } else if (fx.kind === 'set') {
            const it = [...(town?.items.values() || [])].find((i) => Math.abs(i.b.x - fx.x) < 0.01 && Math.abs(i.b.z - fx.z) < 0.01);
            zap(fx.x, fx.z, it ? it.top : 0.5); anim.flash = 0.6; anim.flashCol = '#fffde7'; sound.play('zap');
            spawnPuff(fx.x, it ? it.top : 0.5, fx.z, 0xfff59d, 6, 0.4, 1);
          } else if (fx.kind === 'mua') { spawnDebris(fx.x, 0.6, fx.z, 0xe3f2fd, 5, 0.6); sound.play('tick'); }
          else if (fx.kind === 'ufo') sound.play('ufo');
          break;
        }
        case 'ph_down': {
          const it = town?.items.get(fx.id);
          if (it && it.alive) down(it, fx.chain);
          const p = toScreen(fx.x, 1.5, fx.z);
          floaters.push({ text: `💥 ${KIND_NAME[fx.kind] || ''}`, x: p.x, y: p.y, at: now, size: 40, color: '#ffd23f' });
          if (who && !fx.by?.npc) push(feed, { text: `${who} đánh sập ${KIND_NAME[fx.kind] || "nhà"}`, until: now + 3000, bg: "rgba(29,35,64,.82)" }, 3);
          sound.play('crash');
          break;
        }
        case 'ph_fix': {
          const it = town?.items.get(fx.id);
          if (it && fx.host) { spawnPuff(it.b.x, it.top * 0.7, it.b.z, 0x69f0ae, 2, 0.25, 1.2); if (now - (anim.fixFloat || 0) > 450) { anim.fixFloat = now; const p = toScreen(it.b.x, it.top, it.b.z); floaters.push({ text: '🔧 +', x: p.x, y: p.y - 20, at: now, size: 40, color: '#69f0ae' }); } }
          else if (it) worker(it, who);
          sound.play('fix');
          break;
        }
        case 'ph_shot': {
          const so = strikeObjs.get(fx.id);
          const pos = so?.o?.position || new THREE.Vector3(fx.x, 3, fx.z);
          spawnPuff(pos.x, pos.y, pos.z, 0xffcc80, 12, 0.6, 0.6); spawnDebris(pos.x, pos.y, pos.z, 0x5d4037, 8, 0.8);
          if (so?.o && so.kind !== 'ufo') { scene.remove(so.o); strikeObjs.delete(fx.id); }
          const p = toScreen(pos.x, pos.y, pos.z); floaters.push({ text: '🎯 BẮN HẠ!', x: p.x, y: p.y, at: now, size: 54, color: '#ffd23f' });
          anim.flash = 0.25; anim.flashCol = '#fff8e1'; sound.play('zap');
          if (cine.cur && Math.abs(cine.cur.x - fx.x) < 1.6 && Math.abs(cine.cur.z - fx.z) < 1.6) cine.cur.until = Math.min(cine.cur.until, now + 900);
          break;
        }
        case 'ph_chase': {
          const ho = hazardObjs.get(fx.id);
          if (ho?.o) { spawnPuff(ho.o.position.x, 1, ho.o.position.z, 0xe0f7fa, 8, 0.5, 1); const p = toScreen(ho.o.position.x, 2.5, ho.o.position.z); floaters.push({ text: '💨 ĐUỔI!', x: p.x, y: p.y, at: now, size: 50, color: '#80deea' }); }
          sound.play('whoosh');
          break;
        }
        case 'ph_noenergy': if (now - (anim.noE || 0) > 800) { anim.noE = now; floaters.push({ text: 'Hết ⚡ — chờ hồi', x: W / 2, y: 1000, at: now, size: 46, color: '#ff8a80' }); sound.play('tick'); } break;
        case 'ph_survive': anim.wipeAt = now; anim.flash = 0.5; anim.flashCol = '#b9f6ca'; sound.play('town'); break;
        case 'ph_hazard': if (fx.kind === 'dongdat') { anim.shake = 0.6; sound.play('quake'); } else sound.play('whoosh'); break;
        case 'ph_shield': sound.play('shield'); break;
        case 'ph_rebuild': floaters.push({ text: `👷 Xây lại ${fx.n} toà!`, x: W / 2, y: 1100, at: now, size: 62, color: '#69f0ae' }); sound.play('fix'); break;
        case 'ph_wipe': anim.wipeAt = now; anim.flash = 0.7; anim.flashCol = '#ffffff'; anim.shake = 0.9; sound.play('wipe'); break;
        case 'ph_town': sound.play('town'); break;
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

function makeSound(muted) {
  let ac = null;
  const get = () => { if (muted || typeof AudioContext === 'undefined') return null; if (!ac) { try { ac = new AudioContext(); } catch { muted = true; return null; } } return ac; };
  function tone(f, dur, { type = 'sine', vol = 0.18, at = 0, slide = 0 } = {}) {
    const a = get(); if (!a || a.state !== 'running') return;
    const t0 = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, { vol = 0.3, freq = 1200, at = 0 } = {}) {
    const a = get(); if (!a || a.state !== 'running') return;
    const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination); src.start(a.currentTime + at);
  }
  let lastCrash = 0;
  const P = {
    gift: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, { type: 'triangle', at: i * 0.06 })),
    boom: () => { tone(60, 0.8, { vol: 0.5, slide: 0.5 }); noise(0.9, { freq: 900, vol: 0.5 }); },
    zap: () => { noise(0.3, { freq: 6000, vol: 0.3 }); tone(1400, 0.25, { type: 'sawtooth', vol: 0.06, slide: 0.2 }); },
    crash: () => { const n = performance.now(); if (n - lastCrash < 80) return; lastCrash = n; noise(0.45, { freq: 1500, vol: 0.35 }); tone(110, 0.3, { type: 'square', vol: 0.05, slide: 0.5 }); },
    tick: () => tone(1800, 0.05, { type: 'triangle', vol: 0.06 }),
    whoosh: () => noise(1.2, { freq: 500, vol: 0.3 }),
    quake: () => { tone(40, 2, { vol: 0.4, slide: 0.8 }); noise(2, { freq: 200, vol: 0.4 }); },
    ufo: () => tone(400, 1.2, { type: 'sine', vol: 0.12, slide: 2.5 }),
    shield: () => tone(500, 0.5, { type: 'triangle', vol: 0.12, slide: 1.8 }),
    fix: () => [880, 1175].forEach((f, i) => tone(f, 0.08, { type: 'square', vol: 0.04, at: i * 0.07 })),
    wipe: () => { tone(50, 1.5, { vol: 0.6, slide: 0.4 }); noise(1.6, { freq: 1200, vol: 0.55 }); [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.12, at: 0.4 + i * 0.25 })); },
    thud: () => { tone(70, 0.5, { vol: 0.35, slide: 0.6 }); noise(0.5, { freq: 600, vol: 0.3 }); },
    slow: () => { tone(220, 1.6, { type: 'sawtooth', vol: 0.08, slide: 0.3 }); tone(55, 1.8, { vol: 0.4, slide: 0.7 }); [0, 0.55, 1.1].forEach((at) => tone(48, 0.18, { vol: 0.45, at })); },
    town: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.1, at: i * 0.09 })),
  };
  return { play(n, a) { try { P[n]?.(a); } catch { /* bỏ qua */ } }, resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } }, close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; } };
}

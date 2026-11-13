// Renderer 3D của Phố Tí Hon (khung dọc 1080×1920): three.js vẽ thị trấn low-poly trên hòn đảo nổi vào một canvas WebGL ẩn,
// rồi chép sang canvas 2D của nền tảng; HUD (bảng quà, bảng phá, tên người xem) vẽ 2D đè lên, nên drawPanel của SDK dùng y như game 2D.
// Mọi mô hình dựng bằng code (khối, nón, trụ, flat shading) — có thể thay bằng .glb (vd tạo bằng Meshy) sau này.
// Không đụng DOM khi import.
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
};
const KIND_NAME = { house: 'Nhà ống', shop: 'Tiệm tạp hoá', tower: 'Chung cư', tank: 'Cây xăng', pagoda: 'Đình làng' };
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

export function mount(el, { canvas, options = {} } = {}) {
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
  const world = new THREE.Group(); scene.add(world);
  (function buildIsland() {
    const r = rng(7);
    const top = cyl(1, 1, 0.7, 40, 0x7cc65a); top.scale.set(ISLAND.rx, 1, ISLAND.rz); top.position.y = -0.35; world.add(top);
    const lip = cyl(1.0, 0.97, 0.5, 40, 0x6a4b2f); lip.scale.set(ISLAND.rx, 1, ISLAND.rz); lip.position.y = -0.95; world.add(lip);
    // đá lởm chởm phía dưới
    const rockG = new THREE.ConeGeometry(1, 1, 18, 4, true);
    const pos = rockG.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > -0.49 && y < 0.49) { pos.setX(i, pos.getX(i) * (0.8 + r() * 0.35)); pos.setZ(i, pos.getZ(i) * (0.8 + r() * 0.35)); } }
    rockG.computeVertexNormals();
    const rock = new THREE.Mesh(rockG, mat(0x8a6a4a, { side: THREE.DoubleSide }));
    rock.scale.set(ISLAND.rx * 0.97, 7.5, ISLAND.rz * 0.97); rock.rotation.x = Math.PI; rock.position.y = -1.2 - 3.75; world.add(rock);
    for (let i = 0; i < 9; i++) { const a = r() * 6.28; const s = cyl(0.3 + r() * 0.5, 0.05, 1 + r() * 2, 6, 0x75583c); s.position.set(Math.cos(a) * ISLAND.rx * 0.6, -2.4 - r() * 2, Math.sin(a) * ISLAND.rz * 0.6); world.add(s); }
    // sông + thác hai đầu
    const water = mat(0x4fb3e8, { transparent: true, opacity: 0.92 });
    const len = 2 * ISLAND.rx * Math.sqrt(1 - (ISLAND.riverZ / ISLAND.rz) ** 2);
    const river = box(len + 0.4, 0.2, ISLAND.riverW, 0, 0, -0.02, ISLAND.riverZ, water); river.castShadow = false; world.add(river);
    for (const sx of [-1, 1]) { const f = box(0.25, 6, ISLAND.riverW * 0.8, 0, sx * (len / 2 + 0.25), -3, ISLAND.riverZ, water); f.castShadow = false; world.add(f); }
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
    }
    gr.position.set(b.x, 0, b.z); gr.rotation.y = (b.rot % 3 - 1) * 0.12; // mặt tiền luôn quay về phía người xem
    // vật liệu riêng cho từng toà để tô sẫm khi hư
    for (const p of parts) { p.material = p.material.clone(); p.userData.base = p.material.color.clone(); }
    const rubble = new THREE.Group();
    const rr = rng(b.id * 31 + 5);
    for (let i = 0; i < 7; i++) { const c = box(0.25 + rr() * 0.35, 0.12 + rr() * 0.2, 0.25 + rr() * 0.35, i % 2 ? wall : 0x8d8d8d, (rr() - 0.5) * 1.1, 0.1, (rr() - 0.5) * 1.0); c.rotation.set(rr(), rr() * 3, rr()); rubble.add(c); }
    rubble.position.copy(gr.position); rubble.visible = false;
    const fire = new THREE.Group();
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), new THREE.MeshBasicMaterial({ color: i ? 0xffb300 : 0xff5722, transparent: true, opacity: 0.9 })); f.position.set((i - 1) * 0.25, 0, (i % 2) * 0.2); fire.add(f); }
    fire.visible = false;
    const top = M ? M.top * (b.kind === 'tower' ? 0.8 + b.h * 0.15 : 1) : { house: 0.62 * b.h + 0.6, shop: 1.2, tower: 0.72 * b.h + 0.3, tank: 1.15, pagoda: 2.6 }[b.kind];
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
      if ((x / (ISLAND.rx - 0.5)) ** 2 + (z / (ISLAND.rz - 0.5)) ** 2 > 1 || Math.abs(x) < 0.9 || Math.abs(z - ISLAND.riverZ) < 1.2) continue;
      if (s.buildings.some((b) => Math.abs(b.x - x) < 1.1 && Math.abs(b.z - z) < 1.0)) continue;
      const t = new THREE.Group();
      const kind = r();
      if (kind < 0.6) { t.add(cyl(0.07, 0.09, 0.35, 5, 0x7a5230, 0, 0.17, 0)); t.add(cyl(0, 0.38, 0.8, 6, r() < 0.5 ? 0x3f9d4a : 0x2f8a5c, 0, 0.7, 0)); }
      else if (kind < 0.85) { t.add(cyl(0.07, 0.09, 0.3, 5, 0x7a5230, 0, 0.15, 0)); const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), mat(0x5cb85c)); c.position.y = 0.55; c.castShadow = true; t.add(c); }
      else { t.add(cyl(0.05, 0.06, 1.2, 4, 0x5a3d26, 0, 0.6, 0)); for (let k = 0; k < 4; k++) { const l = box(0.7, 0.04, 0.16, 0x4caf50, 0, 1.2, 0); l.rotation.y = k * 0.8; l.rotation.z = 0.3; t.add(l); } }
      t.position.set(x, 0, z); t.scale.setScalar(0.85 + r() * 0.5); group.add(t); n++;
    }
    const cars = [];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Group();
      c.add(box(0.36, 0.2, 0.65, [0xe53935, 0xffca28, 0x29b6f6][i], 0, 0.16, 0));
      c.add(box(0.3, 0.16, 0.32, 0xe3f2fd, 0, 0.33, -0.04));
      c.userData = { lane: i % 2 ? 0.25 : -0.25, dir: i % 2 ? -1 : 1, z: (r() - 0.5) * 14, v: 1.6 + r() };
      group.add(c); cars.push(c);
    }
    scene.add(group);
    town = { no: s.townNo, group, items, cars };
    anim.townAt = performance.now();
    for (const it of items.values()) it.rise = 0; // phố mới mọc lên
  }

  // ---- đối tượng động ----

  const debris = []; // { m, v, w, life }
  const puffs = []; // { m, v, life, max, grow }
  const debrisG = new THREE.BoxGeometry(1, 1, 1);
  const puffG = new THREE.IcosahedronGeometry(1, 0);
  function spawnDebris(x, y, z, color, n, force = 1) {
    for (let i = 0; i < n && debris.length < 260; i++) {
      const m = new THREE.Mesh(debrisG, mat(color)); const s = 0.08 + Math.random() * 0.2; m.scale.set(s, s * (0.6 + Math.random()), s);
      m.position.set(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 0.8); m.castShadow = true;
      const a = Math.random() * 6.28, sp = (1.5 + Math.random() * 3.5) * force;
      debris.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, (3 + Math.random() * 5) * force, Math.sin(a) * sp), w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 3.5 });
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
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 36), new THREE.MeshLambertMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.55, flatShading: true }));
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
    if (!town || town.no !== S.townNo) buildTown(S);
    for (const b of S.buildings) {
      const it = town.items.get(b.id); if (!it) continue;
      if (b.hp < it.hp - 0.001 && b.alive) it.hitAt = performance.now();
      if (b.alive && !it.alive) { it.alive = true; it.gr.visible = true; it.rubble.visible = false; it.rise = 0; it.lift = null; it.gr.position.y = 0; it.gr.scale.set(1, 1, 1); spawnPuff(b.x, 0.3, b.z, 0xffe082, 5, 0.4); }
      if (!b.alive && it.alive && !it.lift) down(it, false);
      it.hp = b.hp;
    }
  }
  function down(it, chain) {
    it.alive = false; it.hp = 0;
    const lifted = lastImpact && lastImpact.kind === 'ufo' && performance.now() - lastImpact.at < 400;
    if (lifted) { it.lift = { t: 0, y: 0 }; it.rubble.visible = false; return; }
    it.gr.visible = false; it.rubble.visible = true; it.fire.visible = false;
    for (const p of it.parts.slice(0, 6)) spawnDebris(it.b.x, it.top * 0.5, it.b.z, p.userData.base?.getHex?.() ?? it.wall, 4, chain ? 1.4 : 1);
    spawnPuff(it.b.x, 0.4, it.b.z, 0xa1887f, 10, 0.7, 0.8);
    anim.shake = Math.max(anim.shake, chain ? 0.5 : 0.25);
  }
  let lastImpact = null;

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
  function chip(s, x, y, size = 26, bg = 'rgba(29,35,64,.82)', fg = '#fff') {
    g2.font = `800 ${size}px ${FONT}`; const w = Math.min(360, g2.measureText(s).width + 28);
    rr(x - w / 2, y - size * 0.8, w, size * 1.6, size * 0.8); g2.fillStyle = bg; g2.fill();
    text(s, x, y + 1, size, fg, 800, 'center', 330);
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

  function drawHud(now) {
    const s = S;
    // tiêu đề + thanh đổ nát
    out('PHỐ TÍ HON', W / 2, 78, 84, '#ffd23f');
    const pct = s.downPct / Math.max(1, s.wipePercent);
    card(150, 140, 780, 74, 37, 'rgba(255,255,255,.9)');
    rr(160, 150, Math.max(54, 760 * clamp(pct, 0, 1)), 54, 27); g2.fillStyle = pct > 0.7 ? '#ff5252' : pct > 0.4 ? '#ff9f43' : '#ffd23f'; g2.fill();
    text(`Phố #${s.townNo}  ·  đổ nát ${s.downPct}% / ${s.wipePercent}%  ·  ⏱ ${mmss(s.elapsedMs + (s.phase === 'play' && !s.paused ? now - recvAt : 0))}`, W / 2, 178, 30, INK, 900, 'center', 740);
    if (s.fastestMs) chip(`🏁 Kỷ lục sập phố: ${mmss(s.fastestMs)}  ·  đã sập ${s.wipes} phố`, W / 2, 252, 24);
    if (s.shieldMs > 0) chip(`🛡️ Khiên còn ${Math.ceil((s.shieldMs - (now - recvAt)) / 1000)}s`, W / 2, 302, 30, 'rgba(0,150,136,.9)');
    if (s.carry) chip(`🎁 ${s.carry} thảm hoạ chờ phố mới`, W / 2, 302, 26, 'rgba(126,87,194,.9)');
    // bảng phá
    if (s.showBoard !== false && (s.top.length || s.legends.length)) panel('board', { x: 24, y: 250 }, () => {
      const rows = s.top.slice(0, 5), leg = s.legends.slice(0, 3);
      const head = rows.length ? 70 + rows.length * 52 : 6;
      const h = head + (leg.length ? 64 + leg.length * 50 : 0);
      card(24, 250, 330, h, 26, 'rgba(255,255,255,.88)', INK, 4);
      if (rows.length) text('💥 Phá nhiều nhất', 189, 285, 28, '#d84315', 900);
      rows.forEach((r, i) => { const y = 336 + i * 52; avatar(r, 64, y, 20); text(r.name, 94, y, 25, INK, 800, 'left', 170); text(String(r.dmg), 336, y, 25, '#d84315', 900, 'right'); });
      if (leg.length) {
        const y0 = 250 + head + 26;
        text('🏆 Bảng Phá (số phố sập)', 189, y0, 25, '#6a1b9a', 900);
        leg.forEach((r, i) => { const y = y0 + 48 + i * 50; avatar(r, 64, y, 19); text(r.name, 94, y, 24, INK, 800, 'left', 180); text(`×${r.wipes}`, 336, y, 26, '#6a1b9a', 900, 'right'); });
      }
    });
    // dân sửa nhà
    if (s.fixers.length) { card(726, 250, 330, 54 + s.fixers.length * 44, 24, 'rgba(255,255,255,.85)', INK, 4); text('🔧 Dân sửa nhà', 891, 280, 26, '#2e7d32', 900); s.fixers.forEach((r, i) => text(`${r.name} · ${r.fixes}`, 891, 322 + i * 44, 23, INK, 800, 'center', 300)); }
    // tên trên đầu thợ, người gọi thảm hoạ
    for (const w of workers) { const p = toScreen(w.o.position.x, 0.9, w.o.position.z); if (p.front) chip(`🔧 ${w.name}`, p.x, p.y - 20, 22, 'rgba(46,125,50,.88)'); }
    for (const l of labels) { const p = toScreen(l.x(), l.y(), l.z()); if (p.front) chip(l.text, p.x, p.y - 40, 26, 'rgba(216,67,21,.9)'); }
    // bảng tin
    feed.forEach((f, i) => { const a = clamp((f.until - now) / 600, 0, 1); g2.globalAlpha = a; chip(f.text, W / 2, 1500 - i * 50, 25, f.bg); g2.globalAlpha = 1; });
    // biểu ngữ quà
    const bn = banners[0];
    if (bn) {
      const t = (now - bn.at) / 2600;
      if (t >= 1) banners.shift();
      else {
        const k = t < 0.12 ? t / 0.12 : t > 0.85 ? (1 - t) / 0.15 : 1;
        g2.save(); g2.globalAlpha = k; g2.translate(W / 2, 1250); g2.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
        card(-400, -78, 800, 156, 40, 'rgba(255,248,225,.96)', INK, 6);
        text(bn.icon, -320, 0, 90, INK, 400);
        out(bn.title, 40, -26, 56, '#ff7043', { maxW: 560 });
        text(bn.who, 40, 40, 32, INK, 800, 'center', 560);
        g2.restore();
      }
    }
    // chữ bay
    for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; const t = (now - f.at) / 1400; if (t >= 1) { floaters.splice(i, 1); continue; } g2.globalAlpha = 1 - t; out(f.text, f.x, f.y - t * 120, f.size, f.color); g2.globalAlpha = 1; }
    // bảng quà
    const pw = s.powerups;
    if (pw.length) panel('menu', { x: 30, y: 1560 }, () => {
      const cols = 3, rows = Math.ceil(Math.min(9, pw.length) / cols), cw = 1020 / cols, ch = Math.min(100, 300 / rows);
      card(30, 1560, 1020, rows * ch + 30, 30, 'rgba(29,35,64,.84)', '#ffd23f', 4);
      pw.slice(0, 9).forEach((p, i) => {
        const x = 30 + (i % cols) * cw, y = 1575 + Math.floor(i / cols) * ch;
        const [ic, name] = ACT[p.action] || ['🎁', p.action];
        text(ic, x + 44, y + ch / 2, 42, '#fff', 400);
        text(name, x + 80, y + ch / 2 - 16, 26, '#fff', 900, 'left', cw - 90);
        text(`${p.icon} ${p.text}`, x + 80, y + ch / 2 + 18, 21, '#ffd23f', 800, 'left', cw - 90);
      });
    });
    else { card(90, 1700, 900, 120, 30, 'rgba(29,35,64,.8)', '#ffd23f', 4); text('Tặng quà gọi thảm hoạ · Bình luận để sửa nhà', W / 2, 1760, 32, '#fff', 800, 'center', 860); }
    // màn sập phố
    if (s.phase === 'wiped' && s.wipedBy) {
      const t = clamp((now - anim.wipeAt) / 500, 0, 1);
      g2.fillStyle = `rgba(20,10,40,${0.45 * t})`; g2.fillRect(0, 0, W, H);
      g2.save(); g2.translate(W / 2, 780); g2.scale(0.6 + 0.4 * t, 0.6 + 0.4 * t);
      card(-430, -230, 860, 460, 46, 'rgba(255,248,225,.97)', INK, 7);
      out('PHỐ SẬP RỒI!', 0, -160, 92, '#ff5252');
      avatar(s.wipedBy, 0, -40, 54);
      text(s.wipedBy.name, 0, 50, 46, INK, 900, 'center', 760);
      text(`đánh sập phố #${s.townNo} sau ${mmss(s.elapsedMs)}`, 0, 110, 32, '#5d4037', 800);
      text(`Phố mới sau ${Math.ceil(Math.max(0, s.nextInMs - (now - recvAt)) / 1000)} giây…`, 0, 175, 30, '#7e57c2', 800);
      g2.restore();
    }
    if (s.paused) { card(W / 2 - 220, 900, 440, 110, 30, 'rgba(29,35,64,.9)', '#fff', 4); text('⏸ Tạm dừng', W / 2, 955, 50, '#fff', 900); }
  }

  // ---------------- vòng vẽ ----------------
  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const since = S && !S.paused ? now - recvAt : 0;
    drawSky(now);
    if (!renderer) { if (S) drawHud(now); else text('Phố Tí Hon cần WebGL', W / 2, H / 2, 48, INK); return; }
    if (S) {
      // camera: lắc lư nhẹ, rung khi nổ / động đất
      const quake = S.hazards.some((h) => h.kind === 'dongdat');
      anim.shake = Math.max(quake ? 0.18 : 0, anim.shake - dt * 0.8);
      const sway = reduced ? 0 : Math.sin(now / 5200) * 0.1;
      camera.position.set(Math.sin(sway) * CAM.r * Math.cos(CAM.el), Math.sin(CAM.el) * CAM.r, Math.cos(sway) * CAM.r * Math.cos(CAM.el));
      camera.lookAt(CAM.look);
      if (anim.shake > 0 && !reduced) { camera.position.x += (Math.random() - 0.5) * anim.shake; camera.position.y += (Math.random() - 0.5) * anim.shake; }
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
        } else if (it.lift) {
          it.lift.t += dt; it.gr.position.y += dt * 3.2; it.gr.rotation.y += dt * 3; const k = Math.max(0.01, 1 - it.lift.t / 1.4); it.gr.scale.set(k, k, k);
          if (it.lift.t > 1.4) { it.gr.visible = false; it.rubble.visible = false; it.lift = null; }
        }
      }
      // xe chạy, mây trôi
      for (const c of town.cars) { const u = c.userData; u.z += u.dir * u.v * dt; if (Math.abs(u.z) > ISLAND.rz - 1.2) { u.dir *= -1; u.z = Math.sign(u.z) * (ISLAND.rz - 1.2); } c.position.set(u.lane * u.dir, Math.abs(u.z - ISLAND.riverZ) < 1.2 ? 0.22 : 0.05, u.z); c.rotation.y = u.dir > 0 ? 0 : Math.PI; }
      for (const c of clouds) { c.userData.a += c.userData.spin * dt; c.position.x = Math.cos(c.userData.a) * 11; c.position.z = Math.sin(c.userData.a) * 11; }
      // điểm rơi
      const live = new Set();
      for (const st of S.strikes) {
        live.add(st.id);
        let so = strikeObjs.get(st.id);
        if (!so) { so = { kind: st.kind, o: st.kind === 'thienthach' ? meteor() : st.kind === 'set' ? stormCloud() : st.kind === 'ufo' ? saucer() : st.kind === 'mua' ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat(0xe3f2fd)) : null, st, total: Math.max(st.leftMs, 1) }; if (so.o) scene.add(so.o); strikeObjs.set(st.id, so); }
        if (!so.o) continue;
        const left = Math.max(0, st.leftMs - since), k = left / so.total;
        if (st.kind === 'thienthach') { so.o.position.set(st.x - 9 * k, 0.4 + 22 * k, st.z - 6 * k); so.o.rotation.x += dt * 6; if (Math.random() < 0.7) spawnPuff(so.o.position.x, so.o.position.y, so.o.position.z, 0xff8a65, 1, 0.35, 0.2); }
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
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i]; d.life -= dt; d.v.y -= 18 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt;
        const on = (d.m.position.x / ISLAND.rx) ** 2 + (d.m.position.z / ISLAND.rz) ** 2 < 1;
        if (on && d.m.position.y < 0.05 && d.v.y < 0) { d.m.position.y = 0.05; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); }
        if (d.life <= 0 || d.m.position.y < -12) { scene.remove(d.m); debris.splice(i, 1); }
      }
      for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.life -= dt; p.m.position.addScaledVector(p.v, dt); p.m.scale.multiplyScalar(1 + dt * p.grow * 0.5); p.m.material.opacity = 0.85 * (p.life / p.max); if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); } }
      for (let i = workers.length - 1; i >= 0; i--) { const w = workers[i]; w.life -= dt; w.o.position.y = Math.abs(Math.sin(now / 110)) * 0.2; if (w.life <= 0) { scene.remove(w.o); workers.splice(i, 1); } }
    } else {
      camera.position.set(0, Math.sin(CAM.el) * CAM.r, Math.cos(CAM.el) * CAM.r); camera.lookAt(CAM.look);
    }
    renderer.render(scene, camera);
    g2.drawImage(gl, 0, 0);
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
          const [icon, title] = ACT[fx.action] || ['🎁', fx.action];
          if (banners.length < 4) banners.push({ at: banners.length ? Math.max(now, banners[banners.length - 1].at + 2600) : now, icon, title, who: fx.later ? `${who} · để dành cho phố mới` : `từ ${who}` });
          sound.play('gift');
          break;
        }
        case 'ph_impact': {
          lastImpact = { kind: fx.kind, at: now };
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
        case 'ph_fix': { const it = town?.items.get(fx.id); if (it) worker(it, who); sound.play('fix'); break; }
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
    town: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.1, at: i * 0.09 })),
  };
  return { play(n, a) { try { P[n]?.(a); } catch { /* bỏ qua */ } }, resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } }, close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; } };
}

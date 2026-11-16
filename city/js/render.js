// Phố Mới — dựng cảnh three.js: địa hình, nước, đường, nhà, cây, xe, lớp phủ quy hoạch.
import * as THREE from '../vendor/three.module.min.js';
import { N, DX, DY, SERVICES, makeField, vnoise, hash2, mulberry32 } from './sim.js';
import { T, GB, growable, treeGeometry, carGeometry, serviceModel, windowTexture } from './models.js';

const HALF = (N * T) / 2;
const BORDER = 30; // số ô địa hình trang trí quanh bản đồ
const WATER_Y = -0.9;
const MAX_CARS = 420;
export const tileX = (x) => (x + 0.5) * T - HALF;
const ROT = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // hướng đường (0..3) -> góc quay mặt tiền

const ZCOL = [[0, 0, 0], [70, 200, 90], [70, 140, 235], [240, 190, 50]];

function noiseTexture() {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S), r = mulberry32(7);
  for (let i = 0; i < S * S; i++) { const v = 205 + r() * 50; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.25;
  for (let k = 0; k < 500; k++) { g.fillStyle = r() > 0.5 ? '#fff' : '#b9b9b9'; g.fillRect(r() * S, r() * S, 1 + r() * 2, 3 + r() * 5); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Texture một ô đường theo mặt nạ nối (bit0 đông, bit1 nam, bit2 tây, bit3 bắc). */
function roadTexture(mask) {
  const S = 128, sw = 22, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#b6b3a9'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#a19e94'; g.lineWidth = 1;
  for (let k = 0; k <= S; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); }
  const E = mask & 1, So = mask & 2, W = mask & 4, No = mask & 8, deg = !!E + !!So + !!W + !!No;
  const asphalt = (x, y, w, h) => { g.fillStyle = '#8f8c84'; g.fillRect(x - 2, y - 2, w + 4, h + 4); };
  const fill = (x, y, w, h) => { g.fillStyle = '#41444a'; g.fillRect(x, y, w, h); };
  const rects = [[sw, sw, S - 2 * sw, S - 2 * sw]];
  if (E) rects.push([S - sw, sw, sw, S - 2 * sw]);
  if (W) rects.push([0, sw, sw, S - 2 * sw]);
  if (So) rects.push([sw, S - sw, S - 2 * sw, sw]);
  if (No) rects.push([sw, 0, S - 2 * sw, sw]);
  for (const r of rects) asphalt(...r); // viền bó vỉa
  for (const r of rects) fill(...r);
  // vệt bánh xe nhạt
  g.fillStyle = 'rgba(255,255,255,.035)';
  for (let k = 0; k < 60; k++) g.fillRect(sw + ((k * 37) % (S - 2 * sw)), sw + ((k * 53) % (S - 2 * sw)), 3, 2);
  g.strokeStyle = '#e9e4cf'; g.lineWidth = 2.5; g.setLineDash([9, 8]);
  const c = S / 2, line = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  if (deg <= 2) {
    if (E) line(c, c, S, c); if (W) line(c, c, 0, c); if (So) line(c, c, c, S); if (No) line(c, c, c, 0);
  } else {
    g.setLineDash([]);
    // vạch qua đường ở mỗi nhánh
    g.fillStyle = '#e9e4cf';
    const zebra = (horizontal, at) => { for (let k = sw + 5; k < S - sw - 4; k += 9) horizontal ? g.fillRect(at, k, 9, 5) : g.fillRect(k, at, 5, 9); };
    if (E) zebra(true, S - sw - 4); if (W) zebra(true, sw - 5); if (So) zebra(false, S - sw - 4); if (No) zebra(false, sw - 5);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    const sky = new THREE.Color(0xbfd9ee);
    this.scene.background = this._skyTexture();
    this.scene.fog = new THREE.Fog(sky, 700, 2600);
    this.camera = new THREE.PerspectiveCamera(42, 1, 2, 6000);
    this.cam = { x: 0, z: 0, dist: 260, yaw: 0.6, pitch: 0.82 };
    this.scene.add(new THREE.HemisphereLight(0xdcebff, 0x6f7f55, 0.8));
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 3.1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    this.scene.add(sun, sun.target);
    this.sunDir = new THREE.Vector3(-0.55, 0.75, 0.42).normalize();

    this.winTex = windowTexture();
    this.matBuilding = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.winTex, roughness: 0.82, metalness: 0.02 });
    this.raycaster = new THREE.Raycaster();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this._static();
    this.cars = [];
    this.puffs = [];
    this.time = 0;
    this.overlayMode = 'zones';
    this.resize();
  }

  _skyTexture() {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
    const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#4f93d6'); gr.addColorStop(0.55, '#9cc6ea'); gr.addColorStop(1, '#d7e7f2');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Những thứ không phụ thuộc thành phố: nước, InstancedMesh đường / nhà / cây / xe, lớp phủ. */
  _static() {
    const s = this.scene;
    const water = this.water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0x2f7db5, specular: 0x9fd0ff, shininess: 90, transparent: true, opacity: 0.86 }));
    water.position.y = WATER_Y; water.receiveShadow = true;
    s.add(water);

    // đường: 16 kiểu nối
    const plane = new THREE.PlaneGeometry(T, T).rotateX(-Math.PI / 2);
    this.roadMeshes = [];
    for (let m = 0; m < 16; m++) {
      const mesh = new THREE.InstancedMesh(plane, new THREE.MeshStandardMaterial({ map: roadTexture(m), roughness: 0.95 }), 2048);
      mesh.count = 0; mesh.receiveShadow = true; mesh.frustumCulled = false;
      this.roadMeshes.push(mesh); s.add(mesh);
    }
    const deck = new GB();
    deck.box(0, -0.75, 0, T, 0.7, T, 0x8d8a84);
    deck.box(0, -0.05, T / 2 - 0.25, T, 1, 0.3, 0xc9c5ba); deck.box(0, -0.05, -T / 2 + 0.25, T, 1, 0.3, 0xc9c5ba);
    deck.cyl(0, -6, 0, 1.1, 1.1, 5.3, 0x9a968e, 8);
    this.bridgeX = this._inst(deck.build(), this.matBuilding, 512, true);
    const deckZ = deck.build(); deckZ.rotateY(Math.PI / 2);
    this.bridgeZ = this._inst(deckZ, this.matBuilding, 512, true);

    // nhà tự mọc: 3 khu x 3 cấp x 3 biến thể
    this.growMeshes = {};
    for (let z = 1; z <= 3; z++) for (let l = 1; l <= 3; l++) for (let v = 0; v < 3; v++) this.growMeshes[`${z}${l}${v}`] = this._inst(growable(z, l, v), this.matBuilding, 1024, true);

    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.treeMeshes = [this._inst(treeGeometry(0), treeMat, 6000, true), this._inst(treeGeometry(1), treeMat, 6000, true)];
    this.carMesh = this._inst(carGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }), MAX_CARS, true);

    // lớp phủ quy hoạch + lưới
    this.ovData = new Uint8Array(N * N * 4);
    this.ovTex = new THREE.DataTexture(this.ovData, N, N, THREE.RGBAFormat);
    this.ovTex.magFilter = this.ovTex.minFilter = THREE.NearestFilter;
    this.ovMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { tData: { value: this.ovTex }, uGrid: { value: 0 }, uN: { value: N } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tData; uniform float uGrid; uniform float uN; varying vec2 vUv;
        void main(){ vec2 uv = vec2(vUv.x, 1.0 - vUv.y); vec4 d = texture2D(tData, uv); vec3 col = d.rgb; float a = d.a;
          vec2 f = fract(uv * uN); vec2 w = fwidth(uv * uN) * 1.2;
          float line = max(max(1.0 - smoothstep(0.0, w.x, f.x), 1.0 - smoothstep(0.0, w.x, 1.0 - f.x)), max(1.0 - smoothstep(0.0, w.y, f.y), 1.0 - smoothstep(0.0, w.y, 1.0 - f.y)));
          float g = line * uGrid * clamp(1.2 - w.x * 6.0, 0.0, 1.0);
          col = mix(col, vec3(1.0), g * 0.7); a = max(a, g * 0.28);
          gl_FragColor = vec4(col, a); }`,
    });
    const ov = this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(N * T, N * T).rotateX(-Math.PI / 2), this.ovMat);
    ov.position.y = 0.2; ov.renderOrder = 2;
    s.add(ov);

    // ô xem trước khi kéo chuột
    this.preview = new THREE.InstancedMesh(new THREE.PlaneGeometry(T * 0.96, T * 0.96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, depthTest: false }), N * N);
    this.preview.count = 0; this.preview.frustumCulled = false; this.preview.renderOrder = 3;
    s.add(this.preview);

    // khói ống khói
    this.smokeMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.55, depthWrite: false }), 240);
    this.smokeMesh.count = 0; this.smokeMesh.frustumCulled = false;
    s.add(this.smokeMesh);

    this.serviceGroup = new THREE.Group(); s.add(this.serviceGroup);
    this.ghostGroup = new THREE.Group(); s.add(this.ghostGroup);
    this.svcCache = {};
    this.spinners = [];
  }

  _inst(geo, mat, cap, shadow) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true;
    m.userData.cap = cap;
    this.scene.add(m);
    return m;
  }

  setCity(city) {
    this.city = city;
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); }
    this.terrain = this._terrain(city);
    this.scene.add(this.terrain);
    city.dirty = { roads: true, buildings: true, trees: true, zones: true, services: true };
    this.cars.length = 0;
    this.cam.x = tileX(city.start.x); this.cam.z = tileX(city.start.y + 6);
  }

  _terrain(city) {
    const f = makeField(city.seed), seed = city.seed;
    const W = N + 2 * BORDER, V = W + 1;
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3), uv = new Float32Array(V * V * 2);
    const isWater = (tx, ty) => (tx >= 0 && ty >= 0 && tx < N && ty < N ? city.water[ty * N + tx] === 1 : f(tx + 0.5, ty + 0.5) < 0.15);
    const grass = new THREE.Color(0x5e9c43), grass2 = new THREE.Color(0x74ad4c), sand = new THREE.Color(0xd9ca94), bed = new THREE.Color(0x4b7466), rock = new THREE.Color(0x8b8a78), forest = new THREE.Color(0x3f7a3a), c = new THREE.Color();
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const gx = i - BORDER, gy = j - BORDER, k = j * V + i;
      const wn = isWater(gx - 1, gy - 1) + isWater(gx, gy - 1) + isWater(gx - 1, gy) + isWater(gx, gy);
      let h = 0;
      if (wn === 4) { h = -3.2; c.copy(bed); } else if (wn > 0) { h = 0; c.copy(sand); } else {
        const out = Math.max(0, -gx, gx - N, -gy, gy - N);
        const n = vnoise(gx * 0.11, gy * 0.11, seed + 21);
        c.copy(grass).lerp(grass2, n);
        if (out > 0) {
          const s = Math.min(1, out / BORDER), e = s * s * (3 - 2 * s), land = Math.min(1, Math.max(0, f(gx, gy) / 9));
          h = e * land * (vnoise(gx * 0.05, gy * 0.05, seed + 31) * 85 + vnoise(gx * 0.17, gy * 0.17, seed + 33) * 16);
          c.lerp(forest, Math.min(1, h / 18)).lerp(rock, Math.min(1, Math.max(0, (h - 34) / 30)));
        } else if (isWater(gx - 2, gy) || isWater(gx + 1, gy) || isWater(gx, gy - 2) || isWater(gx, gy + 1) || isWater(gx - 2, gy - 1) || isWater(gx - 1, gy - 2) || isWater(gx + 1, gy - 1) || isWater(gx - 1, gy + 1)) c.lerp(sand, 0.45);
      }
      pos[k * 3] = gx * T - HALF; pos[k * 3 + 1] = h; pos[k * 3 + 2] = gy * T - HALF;
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = gx * 0.5; uv[k * 2 + 1] = gy * 0.5;
    }
    const index = new Uint32Array(W * W * 6);
    let q = 0;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const a = j * V + i, b = a + 1, d = a + V, e = d + 1;
      index[q++] = a; index[q++] = d; index[q++] = b; index[q++] = b; index[q++] = d; index[q++] = e;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: this.noiseTex || (this.noiseTex = noiseTexture()), roughness: 1 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  /** Ô dưới con trỏ (hoặc null). */
  pick(clientX, clientY) {
    const p = this.groundPoint(clientX, clientY);
    if (!p) return null;
    const x = Math.floor((p.x + HALF) / T), y = Math.floor((p.z + HALF) / T);
    return x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
  }

  groundPoint(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const { origin: o, direction: d } = this.raycaster.ray;
    if (d.y >= -1e-4) return null;
    const t = -o.y / d.y;
    return new THREE.Vector3(o.x + d.x * t, 0, o.z + d.z * t);
  }

  pan(dx, dz) {
    const c = this.cam, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
    c.x += dx * cs + dz * sn; c.z += -dx * sn + dz * cs;
    c.x = Math.max(-HALF, Math.min(HALF, c.x)); c.z = Math.max(-HALF, Math.min(HALF, c.z));
  }
  panWorld(dx, dz) { const c = this.cam; c.x = Math.max(-HALF, Math.min(HALF, c.x + dx)); c.z = Math.max(-HALF, Math.min(HALF, c.z + dz)); }
  rotate(dyaw, dpitch) { const c = this.cam; c.yaw += dyaw; c.pitch = Math.max(0.3, Math.min(1.45, c.pitch + dpitch)); }
  zoom(f) { const c = this.cam; c.dist = Math.max(45, Math.min(1100, c.dist * f)); }

  _camera() {
    const c = this.cam, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    this.camera.position.set(c.x + Math.sin(c.yaw) * cp * c.dist, sp * c.dist, c.z + Math.cos(c.yaw) * cp * c.dist);
    this.camera.lookAt(c.x, 0, c.z);
    const size = Math.max(140, Math.min(520, c.dist * 0.95)), sc = this.sun.shadow.camera;
    this.sun.target.position.set(c.x, 0, c.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 700);
    if (sc.right !== size) { sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.near = 50; sc.far = 1500; sc.updateProjectionMatrix(); }
  }

  /** mode: 'zones' | 'value' | 'pollution' | 'happy'; strong: đang cầm công cụ quy hoạch */
  setOverlay(mode, strong, grid) {
    if (mode !== this.overlayMode || strong !== this.ovStrong) { this.overlayMode = mode; this.ovStrong = strong; this.city.dirty.zones = true; }
    this.ovMat.uniforms.uGrid.value = grid ? 1 : 0;
  }

  _zones() {
    const c = this.city, d = this.ovData, mode = this.overlayMode;
    for (let i = 0; i < N * N; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      if (mode === 'zones') {
        const z = c.zone[i];
        if (z) { [r, g, b] = ZCOL[z]; a = c.level[i] ? (this.ovStrong ? 70 : 0) : this.ovStrong ? 150 : 95; }
      } else if (!c.water[i]) {
        if (mode === 'value') { const v = c.landValue[i] / 100; r = 255 * (1 - v); g = 60 + 180 * v; b = 60; a = 150; }
        else if (mode === 'pollution') { const v = c.pollution[i]; r = 150 + 90 * v; g = 110 * (1 - v); b = 30; a = v > 0.02 ? 60 + 150 * v : 0; }
        else { const cv = c.cover; const v = Math.min(1, (cv.police[i] + cv.fire[i] + cv.health[i] + cv.edu[i]) / 2.5); r = 40; g = 120 + 100 * v; b = 220; a = v > 0.02 ? 50 + 130 * v : 0; }
      }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a;
    }
    this.ovTex.needsUpdate = true;
  }

  _roads() {
    const c = this.city, counts = new Array(16).fill(0), m = new THREE.Matrix4();
    let bx = 0, bz = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!c.road[i]) continue;
      let mask = 0;
      for (let d = 0; d < 4; d++) { const a = x + DX[d], b = y + DY[d]; if (a >= 0 && b >= 0 && a < N && b < N ? c.road[b * N + a] : (b < 0 && d === 3)) mask |= 1 << d; }
      const mesh = this.roadMeshes[mask];
      if (counts[mask] >= mesh.userData.cap) this._grow(this.roadMeshes, mask);
      m.makeTranslation(tileX(x), 0.16, tileX(y));
      this.roadMeshes[mask].setMatrixAt(counts[mask]++, m);
      if (c.water[i]) {
        const alongX = (mask & 5) && !(mask & 10);
        m.makeTranslation(tileX(x), 0.15, tileX(y));
        if (alongX) { if (bx < 512) this.bridgeX.setMatrixAt(bx++, m); } else if (bz < 512) this.bridgeZ.setMatrixAt(bz++, m);
      }
    }
    this.roadMeshes.forEach((mesh, k) => { mesh.count = counts[k]; mesh.instanceMatrix.needsUpdate = true; });
    this.bridgeX.count = bx; this.bridgeZ.count = bz; this.bridgeX.instanceMatrix.needsUpdate = this.bridgeZ.instanceMatrix.needsUpdate = true;
    this.roadList = [];
    for (let i = 0; i < N * N; i++) if (c.road[i]) this.roadList.push(i);
  }

  /** Nhân đôi sức chứa một InstancedMesh trong mảng / bảng. */
  _grow(holder, key) {
    const old = holder[key], cap = old.userData.cap * 2;
    const mesh = new THREE.InstancedMesh(old.geometry, old.material, cap);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = old.castShadow; mesh.receiveShadow = true; mesh.userData.cap = cap;
    mesh.instanceMatrix.array.set(old.instanceMatrix.array);
    if (old.instanceColor) { mesh.setColorAt(0, new THREE.Color()); mesh.instanceColor.array.set(old.instanceColor.array); }
    this.scene.remove(old); old.dispose();
    this.scene.add(mesh);
    holder[key] = mesh;
    return mesh;
  }

  _buildings() {
    const c = this.city, counts = {}, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    let animating = false;
    for (const k in this.growMeshes) counts[k] = 0;
    for (let i = 0; i < N * N; i++) {
      const L = c.level[i];
      if (!L) continue;
      const key = `${c.zone[i]}${L}${c.variant[i] % 3}`;
      let mesh = this.growMeshes[key];
      if (counts[key] >= mesh.userData.cap) mesh = this._grow(this.growMeshes, key);
      const x = i % N, y = (i / N) | 0;
      // mọc lên từ từ trong ~1,2 giây
      const t = Math.min(1, (this.time - (this.bornAt?.[i] ?? -9)) / 1.2);
      if (t < 1) animating = true;
      const e = 1 - (1 - t) * (1 - t);
      q.setFromAxisAngle(up, ROT[c.dir[i] & 3]);
      p.set(tileX(x), 0.02, tileX(y)); s.set(1, Math.max(0.02, e), 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(counts[key], m);
      const h = hash2(x, y, 77);
      col.setHSL(0, 0, 0.86 + h * 0.14);
      mesh.setColorAt(counts[key]++, col);
    }
    for (const k in this.growMeshes) { const mesh = this.growMeshes[k]; mesh.count = counts[k]; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    return animating;
  }

  _trees() {
    const c = this.city, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    const n = [0, 0];
    for (let i = 0; i < N * N; i++) {
      if (!c.tree[i]) continue;
      const x = i % N, y = (i / N) | 0, cnt = 2 + ((hash2(x, y, 5) * 3) | 0);
      for (let k = 0; k < cnt; k++) {
        const kind = hash2(x * 7 + k, y, 9) > 0.55 ? 1 : 0;
        if (n[kind] >= 6000) continue;
        const sc = 0.8 + hash2(x, y * 5 + k, 11) * 0.7;
        p.set(tileX(x) + (hash2(x + k * 13, y, 1) - 0.5) * T * 0.8, 0, tileX(y) + (hash2(x, y + k * 17, 2) - 0.5) * T * 0.8);
        q.setFromAxisAngle(up, hash2(x, y, k) * 6.28); s.set(sc, sc * (0.9 + hash2(k, x, y) * 0.3), sc);
        m.compose(p, q, s);
        this.treeMeshes[kind].setMatrixAt(n[kind], m);
        col.setHSL(0.27 + hash2(x + k, y, 3) * 0.06, 0.25, 0.8 + hash2(x, y + k, 4) * 0.2);
        this.treeMeshes[kind].setColorAt(n[kind]++, col);
      }
    }
    this.treeMeshes.forEach((mesh, k) => { mesh.count = n[k]; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; });
  }

  _svc(type) {
    return this.svcCache[type] || (this.svcCache[type] = serviceModel(type, SERVICES[type].size));
  }

  _serviceObject(type, mat) {
    const model = this._svc(type), grp = new THREE.Group();
    const mesh = new THREE.Mesh(model.geometry, mat || this.matBuilding);
    mesh.castShadow = !mat; mesh.receiveShadow = !mat;
    grp.add(mesh);
    for (const sp of model.spin || []) {
      const b = new THREE.Mesh(sp.geometry, mat || this.matBuilding);
      b.position.set(...sp.pos); b.castShadow = !mat; b.userData.spin = true;
      grp.add(b);
    }
    return grp;
  }

  _services() {
    const c = this.city;
    this.serviceGroup.clear();
    this.spinners = []; this.chimneys = [];
    for (const s of c.services) {
      const def = SERVICES[s.type], grp = this._serviceObject(s.type);
      const cx = (s.x + def.size / 2) * T - HALF, cz = (s.y + def.size / 2) * T - HALF;
      grp.position.set(cx, 0.02, cz); grp.rotation.y = ROT[s.dir & 3];
      grp.updateMatrixWorld(true);
      grp.traverse((o) => { if (o.userData.spin) { o.rotation.z = hash2(s.x, s.y, 3) * 6; this.spinners.push(o); } });
      for (const pt of this._svc(s.type).smoke || []) this.chimneys.push(new THREE.Vector3(...pt).applyMatrix4(grp.matrixWorld));
      this.serviceGroup.add(grp);
    }
  }

  /** Bóng mờ công trình sắp đặt. fp = {x, y, size} */
  setGhost(type, fp, ok) {
    if (!type || !fp) { this.ghostGroup.visible = false; return; }
    if (this.ghostType !== type) {
      this.ghostGroup.clear();
      this.ghostMat = this.ghostMat || new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false });
      this.ghostGroup.add(this._serviceObject(type, this.ghostMat));
      this.ghostType = type;
    }
    this.ghostMat.color.set(ok ? 0x7dffa0 : 0xff6b5b);
    this.ghostGroup.visible = true;
    this.ghostGroup.position.set((fp.x + fp.size / 2) * T - HALF, 0.05, (fp.y + fp.size / 2) * T - HALF);
  }

  /** tiles: [[x, y], ...]; color: số hex */
  setPreview(tiles, color) {
    const m = new THREE.Matrix4(), n = Math.min(tiles ? tiles.length : 0, N * N);
    for (let k = 0; k < n; k++) { m.makeTranslation(tileX(tiles[k][0]), 0.3, tileX(tiles[k][1])); this.preview.setMatrixAt(k, m); }
    this.preview.count = n; this.preview.instanceMatrix.needsUpdate = true;
    if (color != null) this.preview.material.color.set(color);
  }

  _cars(dt) {
    const c = this.city, list = this.roadList || [];
    const want = list.length < 6 ? 0 : Math.min(MAX_CARS, Math.floor(list.length * 0.45), Math.floor(c.stats.pop / 14) + (c.stats.pop > 0 ? 3 : 0));
    const isRoad = (x, y) => x >= 0 && y >= 0 && x < N && y < N && c.road[y * N + x];
    const choose = (car) => {
      const opts = [];
      for (let d = 0; d < 4; d++) if (d !== (car.din + 2) % 4 && isRoad(car.x + DX[d], car.y + DY[d])) opts.push(d);
      if (opts.includes(car.din) && Math.random() < 0.6) return car.din;
      return opts.length ? opts[(Math.random() * opts.length) | 0] : (car.din + 2) % 4;
    };
    const spawn = (car) => {
      const i = list[(Math.random() * list.length) | 0];
      car.x = i % N; car.y = (i / N) | 0; car.din = (Math.random() * 4) | 0; car.t = Math.random();
      car.dout = choose(car); car.speed = 1.5 + Math.random() * 0.9; car.hue = Math.random();
      return car;
    };
    while (this.cars.length < want) this.cars.push(spawn({}));
    if (this.cars.length > want) this.cars.length = want;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const PAL = [0xe9e9e9, 0x2d3640, 0xc0392b, 0x2f6fb0, 0xd8b93a, 0x8a949c, 0x3d8a5a, 0xf2f2f2];
    this.cars.forEach((car, k) => {
      if (!isRoad(car.x, car.y)) spawn(car);
      car.t += dt * car.speed;
      while (car.t >= 1) {
        car.t -= 1;
        const nx = car.x + DX[car.dout], ny = car.y + DY[car.dout];
        if (!isRoad(nx, ny)) { spawn(car); break; }
        car.x = nx; car.y = ny; car.din = car.dout; car.dout = choose(car);
      }
      const t = car.t, cx = tileX(car.x), cz = tileX(car.y), h = T / 2;
      const ax = cx - DX[car.din] * h, az = cz - DY[car.din] * h, bx = cx + DX[car.dout] * h, bz = cz + DY[car.dout] * h;
      const u = 1 - t;
      const px = u * u * ax + 2 * u * t * cx + t * t * bx, pz = u * u * az + 2 * u * t * cz + t * t * bz;
      let tx = 2 * u * (cx - ax) + 2 * t * (bx - cx), tz = 2 * u * (cz - az) + 2 * t * (bz - cz);
      const l = Math.hypot(tx, tz);
      if (l < 0.01) { tx = DX[car.dout]; tz = DY[car.dout]; } else { tx /= l; tz /= l; }
      p.set(px - tz * 1.55, 0.18, pz + tx * 1.55);
      q.setFromAxisAngle(up, Math.atan2(tx, tz));
      m.compose(p, q, s);
      this.carMesh.setMatrixAt(k, m);
      this.carMesh.setColorAt(k, col.set(PAL[(car.hue * PAL.length) | 0]));
    });
    this.carMesh.count = this.cars.length; this.carMesh.instanceMatrix.needsUpdate = true;
    if (this.carMesh.instanceColor) this.carMesh.instanceColor.needsUpdate = true;
  }

  _smoke(dt) {
    const ch = this.chimneys || [];
    this._smokeAcc = (this._smokeAcc || 0) + dt;
    if (this._smokeAcc > 0.35 && ch.length) {
      this._smokeAcc = 0;
      for (const pt of ch) if (this.puffs.length < 240) this.puffs.push({ x: pt.x, y: pt.y, z: pt.z, age: 0, life: 5 + Math.random() * 2 });
    }
    const m = new THREE.Matrix4();
    let n = 0;
    this.puffs = this.puffs.filter((pf) => (pf.age += dt) < pf.life);
    for (const pf of this.puffs) {
      const a = pf.age, sc = 1.6 + a * 1.5;
      m.makeScale(sc, sc, sc).setPosition(pf.x + a * 2.6, pf.y + a * 4.5, pf.z + a * 0.8);
      this.smokeMesh.setMatrixAt(n++, m);
    }
    this.smokeMesh.count = n; this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  /** dt: giây thật; simDt: giây đã nhân tốc độ game (0 khi tạm dừng) */
  update(dt, simDt) {
    const c = this.city, d = c.dirty;
    this.time += dt;
    if (d.buildings) {
      // ghi thời điểm nhà mới xuất hiện để làm hiệu ứng mọc
      if (!this.bornAt || this.bornCity !== c) { this.bornAt = new Float32Array(N * N).fill(-9); this.bornKey = new Uint8Array(N * N); this.bornCity = c; for (let i = 0; i < N * N; i++) this.bornKey[i] = c.level[i]; }
      for (let i = 0; i < N * N; i++) if (c.level[i] !== this.bornKey[i]) { if (c.level[i]) this.bornAt[i] = this.time; this.bornKey[i] = c.level[i]; }
    }
    if (d.roads) { this._roads(); d.roads = false; }
    if (d.buildings || this._animating) { this._animating = this._buildings(); d.buildings = false; d.zones = true; }
    if (d.trees) { this._trees(); d.trees = false; }
    if (d.services) { this._services(); d.services = false; }
    if (d.zones) { this._zones(); d.zones = false; }
    this._cars(simDt);
    this._smoke(simDt);
    for (const sp of this.spinners) sp.rotation.z -= simDt * 1.6;
    this._camera();
    this.renderer.render(this.scene, this.camera);
  }
}

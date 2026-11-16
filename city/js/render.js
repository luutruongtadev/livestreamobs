// Phố Mới — dựng cảnh three.js: địa hình có độ cao, nước, đường theo graph (thẳng / cong, nút giao),
// nhà, cây, xe chạy theo làn, dây điện / ống nước, lớp phủ quy hoạch.
import * as THREE from '../vendor/three.module.min.js';
import { N, T, HALF, SERVICES, ROADS, ZDEF, garbageLimit, makeField, vnoise, hash2, mulberry32, heightAt, vertexHeight, cellCenter, isWaterAt, signalState, edgeLoad, metroPoint } from './sim.js';
import { GB, growable, treeGeometry, carGeometry, motoGeometry, pedGeometry, truckGeometry, busGeometry, stopGeometry, serviceModel, windowTexture, pylonParts } from './models.js';

const BORDER = 30; // số ô địa hình trang trí quanh bản đồ
const WATER_Y = -0.9;
const MAX_CARS = 480, MAX_BIG = 220, MAX_BUS = 90, MAX_MOTO = 480, MAX_PEDS = 520;
const ROT = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // hướng đường (0..3) -> góc quay mặt tiền
const ZCOL = ZDEF.map((z) => z.rgb);
const ASPHALT = '#41444a', WALK = '#b6b3a9';
const LANES = { small: [1.6], large: [2.25, 5.55], oneway: [-1.6, 1.6] };

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

/** Texture mặt cắt ngang đường: u chạy ngang đường (trái → phải theo chiều a→b), v chạy dọc, lặp mỗi 20 đơn vị. */
function roadTexture(type) {
  const def = ROADS[type], ppu = 12.8, Wd = Math.round(def.w * ppu), Hd = 256;
  const cv = document.createElement('canvas'); cv.width = Wd; cv.height = Hd;
  const g = cv.getContext('2d'), sw = ((def.w - def.asphalt) / 2) * ppu, mid = Wd / 2;
  g.fillStyle = WALK; g.fillRect(0, 0, Wd, Hd);
  g.strokeStyle = '#a19e94'; g.lineWidth = 1;
  for (let y = 0; y <= Hd; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(sw, y); g.moveTo(Wd - sw, y); g.lineTo(Wd, y); g.stroke(); }
  g.fillStyle = '#8f8c84'; g.fillRect(sw - 2, 0, Wd - 2 * sw + 4, Hd); // bó vỉa
  g.fillStyle = ASPHALT; g.fillRect(sw, 0, Wd - 2 * sw, Hd);
  g.fillStyle = 'rgba(255,255,255,.03)';
  for (let k = 0; k < 90; k++) g.fillRect(sw + ((k * 37) % (Wd - 2 * sw - 3)), (k * 53) % Hd, 2, 5);
  const dash = (x, color = '#e9e4cf') => { g.fillStyle = color; for (let y = 10; y < Hd; y += 64) g.fillRect(x - 1.3, y, 2.6, 34); };
  const solid = (x, color) => { g.fillStyle = color; g.fillRect(x - 1.2, 0, 2.4, Hd); };
  if (type === 'small') dash(mid);
  else if (type === 'oneway') {
    dash(mid);
    g.fillStyle = '#e9e4cf';
    for (const x of [mid - 1.6 * ppu, mid + 1.6 * ppu]) { // mũi tên chỉ chiều a → b (hướng lên trên canvas)
      g.beginPath(); g.moveTo(x, 150); g.lineTo(x - 8, 172); g.lineTo(x - 2.5, 172); g.lineTo(x - 2.5, 214); g.lineTo(x + 2.5, 214); g.lineTo(x + 2.5, 172); g.lineTo(x + 8, 172); g.closePath(); g.fill();
    }
  } else {
    g.fillStyle = '#5b5e58'; g.fillRect(mid - 0.6 * ppu, 0, 1.2 * ppu, Hd);
    solid(mid - 0.6 * ppu, '#e3c34a'); solid(mid + 0.6 * ppu, '#e3c34a');
    dash(mid - 3.9 * ppu); dash(mid + 3.9 * ppu);
    solid(sw + 5, '#d8d4c4'); solid(Wd - sw - 5, '#d8d4c4');
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Bộ gom tam giác đơn giản (vị trí + uv hoặc màu), tự quay mặt lên trên khi cần. */
class Tris {
  constructor(withColor) { this.p = []; this.u = []; this.c = withColor ? [] : null; this.i = []; }
  v(x, y, z, a, b, cc) { this.p.push(x, y, z); if (this.c) this.c.push(a, b, cc); else this.u.push(a, b); return this.p.length / 3 - 1; }
  tri(a, b, c, up) {
    if (up) {
      const p = this.p, ux = p[b * 3] - p[a * 3], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vz = p[c * 3 + 2] - p[a * 3 + 2];
      if (uz * vx - ux * vz < 0) { const t = b; b = c; c = t; }
    }
    this.i.push(a, b, c);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); else g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    g.computeVertexNormals();
    return g;
  }
}

/** Điểm + tiếp tuyến tại quãng đường s dọc một polyline đã đo (pts phẳng [x, z, ...], cum). */
function pointAt(pts, cum, s) {
  const n = cum.length - 1;
  let k = 0;
  while (k < n - 1 && cum[k + 1] < s) k++;
  const l = cum[k + 1] - cum[k] || 1, f = Math.max(0, Math.min(1, (s - cum[k]) / l));
  const x0 = pts[k * 2], z0 = pts[k * 2 + 1], x1 = pts[k * 2 + 2], z1 = pts[k * 2 + 3];
  return [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, (x1 - x0) / l, (z1 - z0) / l, k];
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = this._skyTexture();
    this.scene.fog = new THREE.Fog(new THREE.Color(0xbfd9ee), 700, 2600);
    this.camera = new THREE.PerspectiveCamera(42, 1, 2, 6000);
    this.cam = { x: 0, z: 0, y: 0, dist: 260, yaw: 0.6, pitch: 0.82 };
    this.scene.add(new THREE.HemisphereLight(0xdcebff, 0x6f7f55, 0.8));
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 3.1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    this.scene.add(sun, sun.target);
    this.sunDir = new THREE.Vector3(-0.55, 0.75, 0.42).normalize();

    this.winTex = windowTexture();
    this.matBuilding = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.winTex, roughness: 0.82, metalness: 0.02 });
    this.raycaster = new THREE.Raycaster();
    this._static();
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

  /** Những thứ không phụ thuộc thành phố. */
  _static() {
    const s = this.scene;
    const water = this.water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0x2f7db5, specular: 0x9fd0ff, shininess: 90, transparent: true, opacity: 0.86 }));
    water.position.y = WATER_Y; water.receiveShadow = true;
    s.add(water);

    // đường: một mesh cho mỗi loại + mesh nút giao
    this.roadMats = {};
    for (const t of Object.keys(ROADS)) this.roadMats[t] = new THREE.MeshStandardMaterial({ map: roadTexture(t), roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.junctionMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.roadGroup = new THREE.Group(); s.add(this.roadGroup);
    const pil = new GB(); pil.cyl(0, -4.2, 0, 1.2, 1.2, 4.4, 0x9a968e, 8);
    this.pillars = this._inst(pil.build(), this.matBuilding, 800, true);

    // nhà tự mọc: 3 khu x 3 cấp x 3 biến thể
    this.growMeshes = {}; // tạo dần khi có toà nhà loại đó: khoá "khu-cấp-biến thể"

    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.treeMeshes = [this._inst(treeGeometry(0), treeMat, 6000, true), this._inst(treeGeometry(1), treeMat, 6000, true)];
    const vehMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    this.carMesh = this._inst(carGeometry(), vehMat, MAX_CARS, true);
    this.bigMesh = this._inst(truckGeometry(), vehMat, MAX_BIG, true);
    this.motoMesh = this._inst(motoGeometry(), vehMat, MAX_MOTO, true);
    this.pedMesh = this._inst(pedGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), MAX_PEDS, true);
    this.busMesh = this._inst(busGeometry(), vehMat, MAX_BUS, true);
    this.lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.5, 0.9), new THREE.MeshBasicMaterial(), 800);
    this.lampMesh.count = 0; this.lampMesh.frustumCulled = false; s.add(this.lampMesh);
    this.flameMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 4.5, 6), new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.9 }), 300);
    this.flameMesh.count = 0; this.flameMesh.frustumCulled = false; s.add(this.flameMesh);
    this.transitGroup = new THREE.Group(); s.add(this.transitGroup);
    this.trafficMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide });

    // lớp phủ quy hoạch + lưới ô (phủ sát theo địa hình, dựng trong setCity)
    this.ovData = new Uint8Array(N * N * 4);
    this.ovTex = new THREE.DataTexture(this.ovData, N, N, THREE.RGBAFormat);
    this.ovTex.magFilter = this.ovTex.minFilter = THREE.NearestFilter;
    this.ovMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      uniforms: { tData: { value: this.ovTex }, uGrid: { value: 0 }, uN: { value: N } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tData; uniform float uGrid; uniform float uN; varying vec2 vUv;
        void main(){ vec4 d = texture2D(tData, vUv); vec3 col = d.rgb; float a = d.a;
          vec2 f = fract(vUv * uN); vec2 w = fwidth(vUv * uN) * 1.2;
          float line = max(max(1.0 - smoothstep(0.0, w.x, f.x), 1.0 - smoothstep(0.0, w.x, 1.0 - f.x)), max(1.0 - smoothstep(0.0, w.y, f.y), 1.0 - smoothstep(0.0, w.y, 1.0 - f.y)));
          float g = line * uGrid * clamp(1.2 - w.x * 6.0, 0.0, 1.0);
          col = mix(col, vec3(1.0), g * 0.7); a = max(a, g * 0.25);
          gl_FragColor = vec4(col, a); }`,
    });

    // ô xem trước khi kéo chuột
    this.preview = new THREE.InstancedMesh(new THREE.PlaneGeometry(T * 0.96, T * 0.96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, depthTest: false }), N * N);
    this.preview.count = 0; this.preview.frustumCulled = false; this.preview.renderOrder = 3;
    s.add(this.preview);
    // dải xem trước đường / dây và dấu bắt điểm
    this.ribbon = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    this.ribbon.frustumCulled = false; this.ribbon.renderOrder = 4; this.ribbon.visible = false;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.marker.renderOrder = 5; this.marker.visible = false;
    s.add(this.ribbon, this.marker);

    // khói ống khói
    this.smokeMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.55, depthWrite: false }), 240);
    this.smokeMesh.count = 0; this.smokeMesh.frustumCulled = false;
    s.add(this.smokeMesh);

    this.serviceGroup = new THREE.Group(); s.add(this.serviceGroup);
    this.lineGroup = new THREE.Group(); s.add(this.lineGroup);
    this.ghostGroup = new THREE.Group(); s.add(this.ghostGroup);
    this.pipeMat = new THREE.MeshBasicMaterial({ color: 0x35b6ff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
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
    for (const o of [this.terrain, this.overlay]) if (o) { this.scene.remove(o); o.geometry.dispose(); }
    this.terrain = this._terrain(city);
    this.overlay = this._overlayMesh(city);
    this.scene.add(this.terrain, this.overlay);
    city.dirty = { roads: true, buildings: true, trees: true, zones: true, services: true, lines: true, transit: true, fx: true };
    this.puffs.length = 0; this.fireCells = [];
    this.cam.x = cellCenter(city.start.x); this.cam.z = cellCenter(city.start.y + 6);
    this.cam.y = heightAt(city, this.cam.x, this.cam.z);
  }

  _terrain(city) {
    const f = makeField(city.seed), seed = city.seed;
    const W = N + 2 * BORDER, V = W + 1;
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3), uv = new Float32Array(V * V * 2);
    const isWater = (tx, ty) => (tx >= 0 && ty >= 0 && tx < N && ty < N ? city.water[ty * N + tx] === 1 : f(tx + 0.5, ty + 0.5) < 0.15);
    const grass = new THREE.Color(0x5e9c43), grass2 = new THREE.Color(0x74ad4c), sand = new THREE.Color(0xd9ca94), bed = new THREE.Color(0x4b7466), rock = new THREE.Color(0x8b8a78), forest = new THREE.Color(0x3f7a3a), dry = new THREE.Color(0x86a650), c = new THREE.Color();
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const gx = i - BORDER, gy = j - BORDER, k = j * V + i;
      const inside = gx >= 0 && gy >= 0 && gx <= N && gy <= N;
      const wn = isWater(gx - 1, gy - 1) + isWater(gx, gy - 1) + isWater(gx - 1, gy) + isWater(gx, gy);
      let h = inside ? city.hv[gy * (N + 1) + gx] : vertexHeight(seed, f, isWater, gx, gy);
      if (wn === 4) c.copy(bed); else if (wn > 0) c.copy(sand); else {
        const out = Math.max(0, -gx, gx - N, -gy, gy - N);
        c.copy(grass).lerp(grass2, vnoise(gx * 0.11, gy * 0.11, seed + 21)).lerp(dry, Math.min(0.6, h / 22));
        if (out > 0) {
          const s = Math.min(1, out / BORDER), e = s * s * (3 - 2 * s), land = Math.min(1, Math.max(0, f(gx, gy) / 9));
          const m = e * land * (vnoise(gx * 0.05, gy * 0.05, seed + 31) * 85 + vnoise(gx * 0.17, gy * 0.17, seed + 33) * 16);
          h += m;
          c.lerp(forest, Math.min(1, m / 18)).lerp(rock, Math.min(1, Math.max(0, (m - 34) / 30)));
        } else if (isWater(gx - 2, gy) || isWater(gx + 1, gy) || isWater(gx, gy - 2) || isWater(gx, gy + 1) || isWater(gx - 2, gy - 1) || isWater(gx - 1, gy - 2) || isWater(gx + 1, gy - 1) || isWater(gx - 1, gy + 1)) c.lerp(sand, 0.45);
      }
      pos[k * 3] = gx * T - HALF; pos[k * 3 + 1] = h; pos[k * 3 + 2] = gy * T - HALF;
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = gx * 0.5; uv[k * 2 + 1] = gy * 0.5;
    }
    const g = this._gridGeometry(W, pos, uv);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: this.noiseTex || (this.noiseTex = noiseTexture()), roughness: 1 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Lưới W x W ô, chia tam giác theo đường chéo b–d (khớp với heightAt). */
  _gridGeometry(W, pos, uv) {
    const V = W + 1, index = new Uint32Array(W * W * 6);
    let q = 0;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const a = j * V + i, b = a + 1, d = a + V, e = d + 1;
      index[q++] = a; index[q++] = d; index[q++] = b; index[q++] = b; index[q++] = d; index[q++] = e;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    return g;
  }

  _overlayMesh(city) {
    const V = N + 1, pos = new Float32Array(V * V * 3), uv = new Float32Array(V * V * 2);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i;
      pos[k * 3] = i * T - HALF; pos[k * 3 + 1] = Math.max(city.hv[k], WATER_Y) + 0.12; pos[k * 3 + 2] = j * T - HALF;
      uv[k * 2] = i / N; uv[k * 2 + 1] = j / N;
    }
    const m = new THREE.Mesh(this._gridGeometry(N, pos, uv), this.ovMat);
    m.renderOrder = 2; m.frustumCulled = false;
    return m;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  /** Cao độ mặt đường tại một điểm (cầu khi qua nước). */
  roadY(x, z) { return Math.max(heightAt(this.city, x, z) + 0.25, 0.45); }

  /** Ô dưới con trỏ (hoặc null). */
  pick(clientX, clientY) {
    const p = this.groundPoint(clientX, clientY);
    if (!p) return null;
    const x = Math.floor((p.x + HALF) / T), y = Math.floor((p.z + HALF) / T);
    return x >= 0 && y >= 0 && x < N && y < N ? { x, y, wx: p.x, wz: p.z } : null;
  }

  /** Điểm trên mặt đất dưới con trỏ: dò tia theo heightmap rồi chia đôi. */
  groundPoint(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const { origin: o, direction: d } = this.raycaster.ray;
    if (d.y >= -1e-4) return null;
    const c = this.city;
    const f = (t) => { const x = o.x + d.x * t, z = o.z + d.z * t; return o.y + d.y * t - (Math.abs(x) <= HALF && Math.abs(z) <= HALF ? Math.max(heightAt(c, x, z), WATER_Y) : 0); };
    let t0 = Math.max(0, (o.y - 40) / -d.y), t1 = t0;
    const tEnd = (o.y + 4) / -d.y;
    if (f(t0) > 0) { for (let k = 0; k < 400 && t1 < tEnd; k++) { t1 = t0 + 5; if (f(t1) <= 0) break; t0 = t1; } }
    for (let k = 0; k < 14; k++) { const m = (t0 + t1) / 2; if (f(m) > 0) t0 = m; else t1 = m; }
    return new THREE.Vector3(o.x + d.x * t1, o.y + d.y * t1, o.z + d.z * t1);
  }

  pan(dx, dz) { const c = this.cam, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw); this.panWorld(dx * cs + dz * sn, -dx * sn + dz * cs); }
  panWorld(dx, dz) { const c = this.cam; c.x = Math.max(-HALF, Math.min(HALF, c.x + dx)); c.z = Math.max(-HALF, Math.min(HALF, c.z + dz)); }
  rotate(dyaw, dpitch) { const c = this.cam; c.yaw += dyaw; c.pitch = Math.max(0.3, Math.min(1.45, c.pitch + dpitch)); }
  zoom(f) { const c = this.cam; c.dist = Math.max(45, Math.min(1100, c.dist * f)); }

  _camera(dt = 0) {
    const c = this.cam, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const ty = Math.max(0, heightAt(this.city, c.x, c.z));
    c.y += (ty - c.y) * (dt ? Math.min(1, dt * 6) : 1);
    this.camera.position.set(c.x + Math.sin(c.yaw) * cp * c.dist, c.y + sp * c.dist, c.z + Math.cos(c.yaw) * cp * c.dist);
    this.camera.lookAt(c.x, c.y, c.z);
    const size = Math.max(140, Math.min(520, c.dist * 0.95)), sc = this.sun.shadow.camera;
    this.sun.target.position.set(c.x, c.y, c.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 700);
    if (sc.right !== size) { sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.near = 50; sc.far = 1500; sc.updateProjectionMatrix(); }
  }

  /** mode: 'zones' | 'value' | 'pollution' | 'service' | 'power' | 'water'; strong: đang cầm công cụ quy hoạch */
  setOverlay(mode, strong, grid) {
    if (mode !== this.overlayMode || strong !== this.ovStrong) { this.overlayMode = mode; this.ovStrong = strong; this.city.dirty.zones = true; }
    this.ovMat.uniforms.uGrid.value = grid ? 1 : 0;
    if (mode !== 'traffic' && this.trafficMesh) { this.scene.remove(this.trafficMesh); this.trafficMesh.geometry.dispose(); this.trafficMesh = null; }
    const pipes = mode === 'water';
    if (pipes !== this.showPipes) { this.showPipes = pipes; if (this.pipeMesh) this.pipeMesh.visible = pipes; }
  }

  _zones() {
    const c = this.city, d = this.ovData, mode = this.overlayMode, st = [[230, 60, 50], [60, 200, 110], [240, 160, 40]];
    for (let i = 0; i < N * N; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      if (mode === 'zones') {
        const z = c.zone[i];
        if (z) {
          [r, g, b] = ZCOL[z]; a = c.level[i] ? (this.ovStrong ? 70 : 0) : this.ovStrong ? 150 : 95;
          if (c.level[i] && (c.pOk[i] !== 1 || c.wOk[i] !== 1 || c.sOk[i] !== 1)) { r = 235; g = 50; b = 40; a = 130; } // nhà đang thiếu điện nước
        } else if (this.ovStrong && c.acc[i] && !c.occ[i]) { r = g = b = 255; a = 50; } // ô quy hoạch tự sinh hai bên đường
      } else if (mode === 'waterpol') {
        const v = c.waterPol[i]; if (v > 0.03) { r = 150; g = 90; b = 30; a = 60 + 170 * v; }
      } else if (!c.water[i]) {
        if (mode === 'value') { const v = c.landValue[i] / 100; r = 255 * (1 - v); g = 60 + 180 * v; b = 60; a = 150; }
        else if (mode === 'pollution') { const v = c.pollution[i]; r = 150 + 90 * v; g = 110 * (1 - v); b = 30; a = v > 0.02 ? 60 + 150 * v : 0; }
        else if (mode === 'power') { if (c.acc[i]) { [r, g, b] = st[c.pOk[i]]; a = 125; } }
        else if (mode === 'water') { if (c.acc[i]) { const w = c.wOk[i], s = c.sOk[i]; [r, g, b] = st[w === 1 && s === 1 ? 1 : w === 0 || s === 0 ? 0 : 2]; a = 125; } }
        else if (mode === 'air' || mode === 'ground' || mode === 'noise') { const v = c[mode][i]; if (mode === 'air') { r = 120 + 110 * v; g = 110 * (1 - v); b = 40; } else if (mode === 'ground') { r = 130 + 60 * v; g = 90 * (1 - v) + 30; b = 20; } else { r = 200; g = 70; b = 200 + 40 * v; } a = v > 0.03 ? 50 + 170 * v : 0; }
        else if (mode === 'service') { const cv = c.cover; const v = Math.min(1, (cv.police[i] + cv.fire[i] + cv.health[i] + cv.edu[i] + cv.trash[i]) / 3); r = 40; g = 120 + 100 * v; b = 220; a = v > 0.02 ? 50 + 130 * v : 0; }
        if (mode === 'garbage' && c.level[i]) { const v = Math.min(1, c.garbage[i] / (2 * garbageLimit(c.zone[i], c.level[i]))); r = 120 + 120 * v; g = 190 * (1 - v) + 30; b = 40; a = 150; }
      }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a;
    }
    this.ovTex.needsUpdate = true;
  }

  /** Dải mặt đường dọc một polyline: trả về mặt cắt đầu / cuối để ghép nút giao. */
  _ribbonPoints(e, ra, rb) {
    const out = [], { pts, cum, len } = e, s0 = ra, s1 = len - rb;
    out.push({ s: s0, p: pointAt(pts, cum, s0) });
    for (let k = 1; k < cum.length - 1; k++) if (cum[k] > s0 + 0.8 && cum[k] < s1 - 0.8) out.push({ s: cum[k], k });
    out.push({ s: s1, p: pointAt(pts, cum, s1) });
    // tiếp tuyến tại mỗi điểm
    return out.map((o, i) => {
      const x = o.p ? o.p[0] : pts[o.k * 2], z = o.p ? o.p[1] : pts[o.k * 2 + 1];
      let tx, tz;
      if (o.p) { tx = o.p[2]; tz = o.p[3]; } else {
        tx = pts[o.k * 2 + 2] - pts[o.k * 2 - 2]; tz = pts[o.k * 2 + 3] - pts[o.k * 2 - 1];
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      }
      void i;
      return { s: o.s, x, z, tx, tz };
    });
  }

  _crossY(x, z, rx, rz, half) {
    return Math.max(this.roadY(x, z), this.roadY(x - rx * half, z - rz * half), this.roadY(x + rx * half, z + rz * half), this.roadY(x - rx * half * 0.5, z - rz * half * 0.5), this.roadY(x + rx * half * 0.5, z + rz * half * 0.5));
  }

  _roads() {
    const c = this.city;
    for (const m of [...this.roadGroup.children]) { m.geometry.dispose(); this.roadGroup.remove(m); }
    const tris = {}; for (const t of Object.keys(ROADS)) tris[t] = new Tris(false);
    const jt = new Tris(true), cA = new THREE.Color(ASPHALT), cW = new THREE.Color(WALK);
    // 1) độ lùi của từng đầu đường tại nút giao + cao độ nút
    const trim = new Map(), nodeY = new Map();
    for (const e of c.edges.values()) trim.set(e.id, [0, 0]);
    const ends = new Map();
    for (const [nid, list] of c.adj) {
      const n = c.nodes.get(nid);
      let y = this.roadY(n.x, n.z);
      for (const [dx, dz] of [[9, 0], [-9, 0], [0, 9], [0, -9], [6, 6], [-6, 6], [6, -6], [-6, -6]]) y = Math.max(y, this.roadY(n.x + dx, n.z + dz));
      nodeY.set(nid, y);
      const arr = list.map((id) => {
        const e = c.edges.get(id), atA = e.a === nid, p = pointAt(e.pts, e.cum, atA ? Math.min(6, e.len / 2) : Math.max(e.len - 6, e.len / 2));
        const dx = p[0] - n.x, dz = p[1] - n.z, l = Math.hypot(dx, dz) || 1;
        return { e, atA, ox: dx / l, oz: dz / l, ang: Math.atan2(dz, dx), half: ROADS[e.type].w / 2 };
      }).sort((p, q) => p.ang - q.ang);
      ends.set(nid, arr);
      if (arr.length < 2) continue;
      arr.forEach((en, i) => {
        let r = 0.5;
        for (const o of [arr[(i + 1) % arr.length], arr[(i + arr.length - 1) % arr.length]]) {
          if (o === en) continue;
          const th = Math.acos(Math.max(-1, Math.min(1, en.ox * o.ox + en.oz * o.oz)));
          if (th < 0.25) r = 26; else if (th < 2.95) r = Math.max(r, (o.half + en.half * Math.cos(th)) / Math.sin(th));
        }
        trim.get(en.e.id)[en.atA ? 0 : 1] = Math.max(0.5, Math.min(26, en.e.len * 0.45, r));
      });
    }
    // 2) dải mặt đường
    const cross = new Map(); // edgeId -> [mặt cắt đầu a, mặt cắt đầu b]
    let np = 0;
    const pm = new THREE.Matrix4();
    for (const e of c.edges.values()) {
      const def = ROADS[e.type], half = def.w / 2, [ra, rb] = trim.get(e.id), ps = this._ribbonPoints(e, ra, rb), tr = tris[e.type];
      const ya = nodeY.get(e.a), yb = nodeY.get(e.b), last = ps.length - 1;
      const rows = ps.map((p, i) => {
        const rx = -p.tz, rz = p.tx;
        let y = this._crossY(p.x, p.z, rx, rz, half);
        const da = p.s - ra, db = e.len - rb - p.s; // hoà dần vào cao độ nút giao
        if (c.adj.get(e.a).length > 1 && da < 14) y = ya + (y - ya) * (da / 14);
        if (c.adj.get(e.b).length > 1 && db < 14) y = yb + (y - yb) * Math.max(0, db / 14);
        if (i === 0 && c.adj.get(e.a).length > 1) y = ya;
        if (i === last && c.adj.get(e.b).length > 1) y = yb;
        return { ...p, rx, rz, y };
      });
      let prev = null;
      for (const r of rows) {
        const v = r.s / 20;
        const L = tr.v(r.x - r.rx * half, r.y, r.z - r.rz * half, 0, v), R = tr.v(r.x + r.rx * half, r.y, r.z + r.rz * half, 1, v);
        // mép đứng hai bên để che khe hở với mặt đất
        const L1 = tr.v(r.x - r.rx * half, r.y, r.z - r.rz * half, 0.4, v), L2 = tr.v(r.x - r.rx * half, r.y - 3, r.z - r.rz * half, 0.4, v);
        const R1 = tr.v(r.x + r.rx * half, r.y, r.z + r.rz * half, 0.4, v), R2 = tr.v(r.x + r.rx * half, r.y - 3, r.z + r.rz * half, 0.4, v);
        if (prev) {
          tr.tri(prev.L, prev.R, L, true); tr.tri(prev.R, R, L, true);
          tr.tri(prev.L1, L1, prev.L2); tr.tri(L1, L2, prev.L2); tr.tri(prev.R1, prev.R2, R1); tr.tri(R1, prev.R2, R2);
        }
        prev = { L, R, L1, L2, R1, R2 };
      }
      cross.set(e.id, [rows[0], rows[last]]);
      // trụ cầu
      for (let s = 9; s < e.len; s += 18) {
        const p = pointAt(e.pts, e.cum, s);
        if (np < 800 && isWaterAt(c, p[0], p[1]) && heightAt(c, p[0], p[1]) < -1) { pm.makeTranslation(p[0], 0.4, p[1]); this.pillars.setMatrixAt(np++, pm); }
      }
    }
    this.pillars.count = np; this.pillars.instanceMatrix.needsUpdate = true;
    // 3) nút giao: đa giác vỉa hè + đa giác mặt nhựa
    for (const [nid, arr] of ends) {
      if (arr.length < 2) continue;
      const y = nodeY.get(nid), outer = [], inner = [];
      for (const en of arr) {
        const r = cross.get(en.e.id)[en.atA ? 0 : 1], sg = en.atA ? 1 : -1, half = en.half, ah = ROADS[en.e.type].asphalt / 2;
        for (const side of [-1, 1]) {
          outer.push([r.x + side * sg * r.rx * half, r.z + side * sg * r.rz * half]);
          inner.push([r.x + side * sg * r.rx * ah, r.z + side * sg * r.rz * ah]);
        }
      }
      for (const [poly, col, dy] of [[outer, cW, 0], [inner, cA, 0.05]]) {
        let mx = 0, mz = 0;
        for (const p of poly) { mx += p[0]; mz += p[1]; }
        const ctr = jt.v(mx / poly.length, y + dy, mz / poly.length, col.r, col.g, col.b);
        const ids = poly.map((p) => jt.v(p[0], y + dy, p[1], col.r, col.g, col.b));
        for (let k = 0; k < ids.length; k++) jt.tri(ctr, ids[k], ids[(k + 1) % ids.length], true);
      }
    }
    for (const t of Object.keys(ROADS)) {
      if (!tris[t].i.length) continue;
      const m = new THREE.Mesh(tris[t].build(), this.roadMats[t]);
      m.receiveShadow = true; m.frustumCulled = false; this.roadGroup.add(m);
    }
    if (jt.i.length) { const m = new THREE.Mesh(jt.build(), this.junctionMat); m.receiveShadow = true; m.frustumCulled = false; this.roadGroup.add(m); }
    // vị trí đèn tín hiệu: bên phải mỗi nhánh đi vào nút có đèn
    this.sigArms = [];
    for (const nid of c.traffic.signals.keys()) {
      const n = c.nodes.get(nid), y = nodeY.get(nid);
      for (const en of ends.get(nid) || []) { const r = trim.get(en.e.id)[en.atA ? 0 : 1] + 1.5; this.sigArms.push({ nid, eid: en.e.id, x: n.x + en.ox * r + en.oz * (en.half - 0.9), y: y + 3.6, z: n.z + en.oz * r - en.ox * (en.half - 0.9) }); }
    }
  }

  /** Dây điện (cột + dây) và ống nước (chỉ hiện ở lớp xem nước). */
  _lines() {
    const c = this.city;
    for (const m of [...this.lineGroup.children]) { m.geometry.dispose(); this.lineGroup.remove(m); }
    const g = new GB(), pipes = new Tris(false);
    let anyP = false, anyW = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (const ln of c.lines) {
      const dx = ln.bx - ln.ax, dz = ln.bz - ln.az, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
      if (ln.kind === 'power') {
        anyP = true;
        const n = Math.max(1, Math.round(len / 42)), tops = [];
        for (let k = 0; k <= n; k++) {
          const x = ln.ax + (dx * k) / n, z = ln.az + (dz * k) / n, y = Math.max(heightAt(c, x, z), 0);
          g.at(m4.clone().compose(v3.set(x, y, z), q.setFromEuler(e3.set(0, yaw, 0)), one)); pylonParts(g);
          tops.push([x, y, z]);
        }
        for (let k = 0; k < n; k++) for (const [off, h] of [[-2.8, 10.4], [2.8, 10.4], [0, 12.4]]) {
          const a = tops[k], b = tops[k + 1], ox = Math.cos(yaw) * off, oz = -Math.sin(yaw) * off;
          const ax = a[0] + ox, ay = a[1] + h, az = a[2] + oz, bx = b[0] + ox, by = b[1] + h, bz = b[2] + oz;
          const l = Math.hypot(bx - ax, by - ay, bz - az);
          g.at(m4.clone().compose(v3.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q.setFromEuler(e3.set(-Math.atan2(by - ay, Math.hypot(bx - ax, bz - az)), yaw, 0, 'YXZ')), one));
          g.box(0, -0.06, 0, 0.12, 0.12, l, 0x30343a);
        }
        g.at(null);
      } else {
        anyW = true;
        const n = Math.max(1, Math.ceil(len / 6)), rx = (-dz / len) * 0.9, rz = (dx / len) * 0.9;
        let prev = null;
        for (let k = 0; k <= n; k++) {
          const x = ln.ax + (dx * k) / n, z = ln.az + (dz * k) / n, y = Math.max(heightAt(c, x, z), WATER_Y) + 0.5;
          const L = pipes.v(x - rx, y, z - rz, 0, 0), R = pipes.v(x + rx, y, z + rz, 1, 0);
          if (prev) { pipes.tri(prev[0], prev[1], L); pipes.tri(prev[1], R, L); }
          prev = [L, R];
        }
      }
    }
    if (anyP) { const m = new THREE.Mesh(g.build(), this.matBuilding); m.castShadow = true; m.frustumCulled = false; this.lineGroup.add(m); }
    this.pipeMesh = null;
    if (anyW) { const m = this.pipeMesh = new THREE.Mesh(pipes.build(), this.pipeMat); m.renderOrder = 3; m.frustumCulled = false; m.visible = !!this.showPipes; this.lineGroup.add(m); }
  }

  /** Nhân đôi sức chứa một InstancedMesh trong bảng. */
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
      if (!mesh) { mesh = this.growMeshes[key] = this._inst(growable(c.zone[i], L, c.variant[i] % 3), this.matBuilding, 256, true); counts[key] = 0; }
      if (counts[key] >= mesh.userData.cap) mesh = this._grow(this.growMeshes, key);
      const x = i % N, y = (i / N) | 0;
      // mọc lên từ từ trong ~1,2 giây
      const t = Math.min(1, (this.time - (this.bornAt?.[i] ?? -9)) / 1.2);
      if (t < 1) animating = true;
      const e = 1 - (1 - t) * (1 - t);
      q.setFromAxisAngle(up, ROT[c.dir[i] & 3]);
      p.set(cellCenter(x), c.cellH[i] + 0.02, cellCenter(y)); s.set(1, Math.max(0.02, e), 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(counts[key], m);
      col.setHSL(0, 0, 0.86 + hash2(x, y, 77) * 0.14);
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
        const wx = cellCenter(x) + (hash2(x + k * 13, y, 1) - 0.5) * T * 0.8, wz = cellCenter(y) + (hash2(x, y + k * 17, 2) - 0.5) * T * 0.8;
        p.set(wx, heightAt(c, wx, wz) - 0.15, wz);
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

  /** Cao độ nền của một khối đất vuông (đỉnh cao nhất). */
  _padY(fx, fy, size) {
    let y = 0;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) { const a = fx + dx, b = fy + dy; if (a >= 0 && b >= 0 && a < N && b < N) y = Math.max(y, this.city.cellH[b * N + a]); }
    return y;
  }

  _services() {
    const c = this.city;
    this.serviceGroup.clear();
    this.spinners = []; this.chimneys = [];
    for (const s of c.services) {
      const def = SERVICES[s.type], grp = this._serviceObject(s.type);
      grp.position.set((s.x + def.size / 2) * T - HALF, this._padY(s.x, s.y, def.size) + 0.02, (s.y + def.size / 2) * T - HALF); grp.rotation.y = ROT[s.dir & 3];
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
    this.ghostGroup.position.set((fp.x + fp.size / 2) * T - HALF, this._padY(fp.x, fp.y, fp.size) + 0.05, (fp.y + fp.size / 2) * T - HALF);
  }

  /** tiles: [[x, y], ...]; color: số hex */
  setPreview(tiles, color) {
    const m = new THREE.Matrix4(), n = Math.min(tiles ? tiles.length : 0, N * N), c = this.city;
    for (let k = 0; k < n; k++) { const [x, y] = tiles[k]; m.makeTranslation(cellCenter(x), (x >= 0 && y >= 0 && x < N && y < N ? Math.max(c.cellH[y * N + x], 0) : 0) + 0.4, cellCenter(y)); this.preview.setMatrixAt(k, m); }
    this.preview.count = n; this.preview.instanceMatrix.needsUpdate = true;
    if (color != null) this.preview.material.color.set(color);
  }

  /** Dải xem trước dọc polyline phẳng pts ([x, z, ...]) rộng 2 * half; null để ẩn. */
  setRibbon(pts, half, color) {
    if (!pts || pts.length < 4) { this.ribbon.visible = false; return; }
    const n = pts.length / 2, pos = new Float32Array(n * 6), idx = [];
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      let tx = pts[b * 2] - pts[a * 2], tz = pts[b * 2 + 1] - pts[a * 2 + 1];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const x = pts[k * 2], z = pts[k * 2 + 1], y = this.roadY(x, z) + 0.5;
      pos.set([x + tz * half, y, z - tx * half, x - tz * half, y, z + tx * half], k * 6);
      if (k) idx.push(k * 2 - 2, k * 2 - 1, k * 2, k * 2 - 1, k * 2 + 1, k * 2);
    }
    const g = this.ribbon.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    this.ribbon.material.color.set(color);
    this.ribbon.visible = true;
  }

  /** Dấu tròn tại điểm bắt (vàng khi bám vào đường / nút có sẵn). */
  setMarker(pt, snapped) {
    if (!pt) { this.marker.visible = false; return; }
    this.marker.position.set(pt.x, this.roadY(pt.x, pt.z) + 0.7, pt.z);
    this.marker.material.color.set(snapped ? 0xffc24a : 0xffffff);
    this.marker.visible = true;
  }

  /** Vẽ xe thật của mô phỏng giao thông (xe con, xe tải / xe dịch vụ, xe buýt) và tàu metro. */
  _vehicles(realDt) {
    const c = this.city, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const PAL = [0xe9e9e9, 0x2d3640, 0xc0392b, 0x2f6fb0, 0xd8b93a, 0x8a949c, 0x3d8a5a, 0xf2f2f2];
    const FIX = { garbage: 0x3d8a5a, ambulance: 0xffffff, fire: 0xd0342c };
    const ease = 1 - Math.exp(-realDt * 10);
    let nc = 0, nb = 0, nu = 0, nm = 0, np = 0;
    for (const v of c.traffic.vehicles) {
      const e = v.e, pt = pointAt(e.pts, e.cum, v.fwd ? Math.min(v.s, e.len) : Math.max(0, e.len - v.s));
      const sg = v.fwd ? 1 : -1, tx = pt[2] * sg, tz = pt[3] * sg, ls = LANES[e.type], off = ls[Math.min(v.lane, ls.length - 1)] + (v.kind === 'moto' ? ((v.id % 5) - 2) * 0.32 : 0);
      const gx = pt[0] - tz * off, gz = pt[1] + tx * off;
      if (v.rx == null) { v.rx = gx; v.rz = gz; v.ryaw = Math.atan2(tx, tz); }
      const ox = v.rx, oz = v.rz;
      v.rx += (gx - v.rx) * ease; v.rz += (gz - v.rz) * ease;
      const mx = v.rx - ox, mz = v.rz - oz;
      if (mx * mx + mz * mz > 1e-5) v.ryaw = Math.atan2(mx, mz);
      p.set(v.rx, this.roadY(v.rx, v.rz) + 0.06, v.rz); q.setFromAxisAngle(up, v.ryaw); m.compose(p, q, s);
      if (v.kind === 'moto') { if (nm < MAX_MOTO) { this.motoMesh.setMatrixAt(nm, m); this.motoMesh.setColorAt(nm++, col.setHSL(v.color, 0.6, 0.5)); } }
      else if (v.kind === 'car') { if (nc < MAX_CARS) { this.carMesh.setMatrixAt(nc, m); this.carMesh.setColorAt(nc++, col.set(PAL[(v.color * PAL.length) | 0])); } }
      else if (v.kind === 'bus') { if (nu < MAX_BUS) { this.busMesh.setMatrixAt(nu, m); this.busMesh.setColorAt(nu++, col.setHSL(v.color, 0.75, 0.52)); } }
      else if (nb < MAX_BIG) { this.bigMesh.setMatrixAt(nb, m); this.bigMesh.setColorAt(nb++, FIX[v.kind] ? col.set(FIX[v.kind]) : col.setHSL(v.color, 0.35, 0.62)); }
    }
    // tàu metro chạy trên ray cao
    const s2 = new THREE.Vector3(1.15, 1.1, 2.1);
    for (const line of c.transit.lines) {
      if (line.mode !== 'metro' || line.stops.length < 2) continue;
      for (const slot of line.veh) {
        if (nu >= MAX_BUS) break;
        const pt = metroPoint(line, slot);
        p.set(pt[0], this._railY(pt[0], pt[1]) + 0.3, pt[1]); q.setFromAxisAngle(up, Math.atan2(pt[2], pt[3])); m.compose(p, q, s2);
        this.busMesh.setMatrixAt(nu, m); this.busMesh.setColorAt(nu++, col.setHSL(line.hue, 0.75, 0.52));
      }
    }
    // người đi bộ trên vỉa hè
    for (const w of c.traffic.peds) {
      if (np >= MAX_PEDS) break;
      const st = w.steps[w.pi], e = st.e, pt = pointAt(e.pts, e.cum, st.fwd ? Math.min(w.s, e.len) : Math.max(0, e.len - w.s));
      const sg = st.fwd ? 1 : -1, tx = pt[2] * sg, tz = pt[3] * sg, off = w.side * (ROADS[e.type].w / 2 - 0.9);
      const gx = pt[0] - pt[3] * off, gz = pt[1] + pt[2] * off;
      if (w.rx == null) { w.rx = gx; w.rz = gz; }
      w.rx += (gx - w.rx) * ease; w.rz += (gz - w.rz) * ease;
      const bob = 1 + Math.sin(this.time * 14 + w.hue * 40) * 0.05;
      p.set(w.rx, this.roadY(w.rx, w.rz) + 0.1, w.rz); q.setFromAxisAngle(up, Math.atan2(tx, tz)); m.compose(p, q, s.set(1.25, 1.25 * bob, 1.25));
      this.pedMesh.setMatrixAt(np, m); this.pedMesh.setColorAt(np++, col.setHSL(w.hue, 0.55, 0.55));
    }
    s.set(1, 1, 1);
    for (const [mesh, n] of [[this.carMesh, nc], [this.bigMesh, nb], [this.busMesh, nu], [this.motoMesh, nm], [this.pedMesh, np]]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    // đèn tín hiệu
    const LC = { g: 0x35e06a, y: 0xffd23f, r: 0xff3b30 };
    let nl = 0;
    for (const a of this.sigArms || []) {
      if (nl >= 800) break;
      m.makeTranslation(a.x, a.y, a.z); this.lampMesh.setMatrixAt(nl, m);
      this.lampMesh.setColorAt(nl++, col.set(LC[signalState(c, a.nid, a.eid)] || 0x555555));
    }
    this.lampMesh.count = nl; this.lampMesh.instanceMatrix.needsUpdate = true; if (this.lampMesh.instanceColor) this.lampMesh.instanceColor.needsUpdate = true;
  }

  _railY(x, z) { return Math.max(heightAt(this.city, x, z), 0) + 7; }

  /** Trạm xe buýt, ga + ray metro, và vệt tuyến (vệt chỉ hiện khi đang xem lớp giao thông công cộng). */
  _transit() {
    const c = this.city, grp = this.transitGroup;
    for (const o of [...grp.children]) { o.geometry.dispose(); grp.remove(o); }
    this.routeMeshes = [];
    if (!this.stopGeo) this.stopGeo = { bus: stopGeometry('bus'), metro: stopGeometry('metro') };
    const g = new GB(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    let rails = false;
    for (const line of c.transit.lines) {
      const col = new THREE.Color().setHSL(line.hue, 0.8, 0.55), n = line.stops.length;
      line.stops.forEach((st, k) => {
        let yaw = 0, x = st.x, z = st.z;
        if (line.mode === 'bus' && st.edge) { const pt = pointAt(st.edge.pts, st.edge.cum, st.along), half = ROADS[st.edge.type].w / 2 - 0.9; x = pt[0] - pt[3] * half; z = pt[1] + pt[2] * half; yaw = Math.atan2(pt[3], -pt[2]); }
        else if (line.mode === 'metro') { const o = line.stops[k === n - 1 ? k - 1 : k + 1]; yaw = Math.atan2(o.x - st.x, o.z - st.z); }
        const mesh = new THREE.Mesh(this.stopGeo[line.mode].clone(), this.matBuilding);
        mesh.position.set(x, line.mode === 'bus' ? this.roadY(x, z) : Math.max(heightAt(c, x, z), 0), z); mesh.rotation.y = yaw; mesh.castShadow = true;
        grp.add(mesh);
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ color: col }));
        flag.position.set(x, mesh.position.y + (line.mode === 'bus' ? 3.2 : 10.4), z); grp.add(flag);
      });
      if (line.mode === 'metro') {
        for (let k = 1; k < n; k++) {
          const a = line.stops[k - 1], b = line.stops[k], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), seg = Math.max(1, Math.round(len / 28));
          for (let j = 0; j < seg; j++) {
            const x0 = a.x + (dx * j) / seg, z0 = a.z + (dz * j) / seg, x1 = a.x + (dx * (j + 1)) / seg, z1 = a.z + (dz * (j + 1)) / seg, y0 = this._railY(x0, z0), y1 = this._railY(x1, z1), l = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
            g.at(m4.clone().compose(v3.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), q.setFromEuler(e3.set(-Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)), yaw, 0, 'YXZ')), one));
            g.box(0, -0.7, 0, 3, 0.7, l + 0.2, 0xb9b5aa); g.box(-0.9, 0, 0, 0.2, 0.2, l, 0x5b6670); g.box(0.9, 0, 0, 0.2, 0.2, l, 0x5b6670);
            g.at(null);
            const gy = Math.max(heightAt(c, x0, z0), -3);
            g.cyl(x0, gy, z0, 0.7, 0.7, y0 - 0.7 - gy, 0x9a968e, 8);
          }
          rails = true;
        }
      }
      // vệt tuyến
      const pts = line.path || [];
      if (pts.length >= 4) {
        const t = new Tris(true), up = line.mode === 'metro' ? 8.2 : 0.7;
        let prev = null;
        for (let k = 0; k < pts.length / 2; k++) {
          const a = Math.max(0, k - 1), b = Math.min(pts.length / 2 - 1, k + 1);
          let tx = pts[b * 2] - pts[a * 2], tz = pts[b * 2 + 1] - pts[a * 2 + 1];
          const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
          const x = pts[k * 2], z = pts[k * 2 + 1], y = (line.mode === 'metro' ? Math.max(heightAt(c, x, z), 0) : this.roadY(x, z)) + up;
          const L = t.v(x + tz * 1.1, y, z - tx * 1.1, col.r, col.g, col.b), R = t.v(x - tz * 1.1, y, z + tx * 1.1, col.r, col.g, col.b);
          if (prev) { t.tri(prev[0], prev[1], L); t.tri(prev[1], R, L); }
          prev = [L, R];
        }
        const mesh = new THREE.Mesh(t.build(), this.trafficMat);
        mesh.renderOrder = 4; mesh.frustumCulled = false; mesh.visible = !!this.showRoutes;
        grp.add(mesh); this.routeMeshes.push(mesh);
      }
    }
    if (rails) { const mesh = new THREE.Mesh(g.build(), this.matBuilding); mesh.castShadow = true; mesh.frustumCulled = false; grp.add(mesh); }
  }

  setRoutesVisible(on) { this.showRoutes = on; for (const m of this.routeMeshes || []) m.visible = on; }

  /** Lớp xem giao thông: tô từng đoạn đường theo mức đông (xanh → vàng → đỏ). */
  _trafficLayer() {
    const c = this.city, t = new Tris(true), col = new THREE.Color();
    for (const e of c.edges.values()) {
      const v = edgeLoad(c, e), half = ROADS[e.type].w / 2 - 1.5, pts = e.pts, n = pts.length / 2;
      col.setHSL(0.33 * (1 - Math.min(1, v * 1.4)), 0.9, 0.5);
      let prev = null;
      for (let k = 0; k < n; k++) {
        const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
        let tx = pts[b * 2] - pts[a * 2], tz = pts[b * 2 + 1] - pts[a * 2 + 1];
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const x = pts[k * 2], z = pts[k * 2 + 1], y = this.roadY(x, z) + 0.6;
        const L = t.v(x + tz * half, y, z - tx * half, col.r, col.g, col.b), R = t.v(x - tz * half, y, z + tx * half, col.r, col.g, col.b);
        if (prev) { t.tri(prev[0], prev[1], L); t.tri(prev[1], R, L); }
        prev = [L, R];
      }
    }
    if (this.trafficMesh) { this.scene.remove(this.trafficMesh); this.trafficMesh.geometry.dispose(); }
    this.trafficMesh = new THREE.Mesh(t.build(), this.trafficMat);
    this.trafficMesh.renderOrder = 3; this.trafficMesh.frustumCulled = false;
    this.scene.add(this.trafficMesh);
  }

  _flames() {
    const c = this.city, m = new THREE.Matrix4();
    let n = 0;
    for (const i of this.fireCells) {
      if (!c.fire[i]) continue;
      for (let k = 0; k < 3 && n < 300; k++) {
        const f = 0.7 + 0.5 * Math.abs(Math.sin(this.time * (5 + k * 1.7) + i));
        m.makeScale(f, f * (1 + k * 0.2), f).setPosition(cellCenter(i % N) + (k - 1) * 2.4, c.cellH[i] + 3 + k * 1.5, cellCenter((i / N) | 0) + (k % 2 ? 1.5 : -1.5));
        this.flameMesh.setMatrixAt(n++, m);
      }
    }
    this.flameMesh.count = n; this.flameMesh.instanceMatrix.needsUpdate = true;
  }

  _smoke(dt) {
    const c = this.city, ch = [...(this.chimneys || [])];
    for (const i of this.fireCells || []) if (c.fire[i]) ch.push({ x: cellCenter(i % N), y: c.cellH[i] + 7, z: cellCenter((i / N) | 0) });
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
    if (d.lines) { this._lines(); d.lines = false; }
    if (d.buildings || this._animating) { this._animating = this._buildings(); d.buildings = false; d.zones = true; }
    if (d.trees) { this._trees(); d.trees = false; }
    if (d.services) { this._services(); d.services = false; }
    if (d.transit) { this._transit(); d.transit = false; }
    if (d.fx) { this.fireCells = []; for (let i = 0; i < N * N; i++) if (c.fire[i]) this.fireCells.push(i); d.fx = false; }
    if (d.zones) { this._zones(); d.zones = false; }
    if (this.overlayMode === 'traffic' && (this._tlAt === undefined || this.time - this._tlAt > 0.8)) { this._tlAt = this.time; this._trafficLayer(); }
    this._vehicles(dt);
    this._flames();
    this._smoke(simDt);
    for (const sp of this.spinners) sp.rotation.z -= simDt * 1.6;
    this._camera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

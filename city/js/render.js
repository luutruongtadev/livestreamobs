// Phố Mới — dựng cảnh three.js: địa hình có độ cao, nước, đường theo graph (thẳng / cong, nút giao),
// nhà, cây, xe chạy theo làn, dây điện / ống nước, lớp phủ quy hoạch.
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { N, T, HALF, LAND, LT, SERVICES, ROADS, ZDEF, RAW, TRANSIT, LIFT, ROUNDABOUT_R, clamp, garbageLimit, vnoise, hash2, mulberry32, heightAt, heightFn, hasResource, cellCenter, cellX, cellZ, isWaterAt, signalState, edgeLoad, metroPoint, liftAt, nodeElevated } from './sim.js';
import { GB, growable, treeGeometry, vehicleGeometry, pedGeometry, busGeometry, tramGeometry, stopGeometry, serviceModel, moduleGeometry, windowTexture, pylonParts } from './models.js';

const BORDER = 30; // số ô địa hình trang trí quanh bản đồ
const _v3 = new THREE.Vector3(), _v3b = new THREE.Vector3(), _q0 = new THREE.Quaternion();
const WATER_Y = -0.9;
const MAX_CARS = 480, MAX_BIG = 220, MAX_BUS = 90, MAX_MOTO = 480, MAX_PEDS = 520, MAX_ANIMALS = 16, DOG_COUNT = 10;
// Mô hình người / vật tạo bằng Meshy (assets/models/*.glb): tải lỗi hoặc chưa tải xong thì giữ người hộp dựng bằng code.
const PED_MODELS = [
  { file: 'ped_man.glb', foot: 0.42 },
  { file: 'ped_woman.glb', foot: 0.4 },
  { file: 'ped_elder.glb', foot: 0.42 },
];
const ANIMAL_DOG = { file: 'animal_dog.glb', foot: 0.5, tint: 0x9c7a52 };
const ROT = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // hướng đường (0..3) -> góc quay mặt tiền
const ZCOL = ZDEF.map((z) => z.rgb);
const RESCOL = [null, ...Object.values(RAW).map((r) => r.rgb)]; // màu lớp xem tài nguyên theo mã c.res
const RES_TINT = [null, 0x9db84a, 0x3f7a3a, 0x8d8a80, 0x5a5648]; // nhuộm nhẹ mặt đất theo tài nguyên
const ASPHALT = '#41444a', WALK = '#b6b3a9';
const LANES = { small: [1.6], large: [2.25, 5.55], oneway: [-1.6, 1.6], overpass: [1.8], highway: [2.1, 5.4, 8.7] };

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
  if (ROADS[type].elevated) { g.fillStyle = '#c9c5ba'; g.fillRect(0, 0, sw, Hd); g.fillRect(Wd - sw, 0, sw, Hd); } // lan can bê tông
  if (type === 'small' || type === 'overpass') dash(mid);
  else if (type === 'highway') {
    g.fillStyle = '#5b5e58'; g.fillRect(mid - 0.45 * ppu, 0, 0.9 * ppu, Hd);
    solid(mid - 0.45 * ppu, '#e3c34a'); solid(mid + 0.45 * ppu, '#e3c34a');
    for (const o of [3.75, 7.05]) { dash(mid - o * ppu); dash(mid + o * ppu); }
    solid(sw + 4, '#f2f2f2'); solid(Wd - sw - 4, '#f2f2f2');
  } else if (type === 'oneway') {
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
    this.lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4 }); // bóng đèn đường

    // nhà tự mọc: 3 khu x 3 cấp x 3 biến thể
    this.growMeshes = {}; // tạo dần khi có toà nhà loại đó: khoá "khu-cấp-biến thể"

    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.treeMeshes = [this._inst(treeGeometry(0), treeMat, 6000, true), this._inst(treeGeometry(1), treeMat, 6000, true)];
    const vehMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    this.vehMat = vehMat; this.vehMeshes = {}; this.vehCount = {}; // mỗi kiểu xe một InstancedMesh, tạo khi kiểu đó xuất hiện lần đầu
    this.pedMesh = this._inst(pedGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), MAX_PEDS, true);
    this.busMesh = this._inst(busGeometry(), vehMat, MAX_BUS, true);
    this.tramMesh = this._inst(tramGeometry(), vehMat, MAX_BUS, true);
    this.pedVariants = []; // người dựng từ mô hình Meshy, nạp xong thì thế dần người hộp
    this.animalMesh = null; // chó thả rông, nạp xong mới có
    this.animals = [];
    this._loadCrowdModels();
    this.lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.14, 0.55, 1.14), new THREE.MeshBasicMaterial(), 800); // bóng đèn tín hiệu ló ra khỏi hộp đèn
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

    // thời tiết, thiên tai
    const funnel = new THREE.ConeGeometry(16, 44, 18, 6, true); funnel.translate(0, 22, 0); funnel.rotateX(Math.PI); funnel.translate(0, 44, 0);
    this.tornadoMesh = new THREE.Mesh(funnel, new THREE.MeshLambertMaterial({ color: 0x6f6a66, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }));
    this.tornadoMesh.visible = false; s.add(this.tornadoMesh);
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.6, 0.9), new THREE.MeshLambertMaterial({ color: 0x5a4a3a }), 60); this.debris.visible = false; this.debris.frustumCulled = false; s.add(this.debris);
    this.rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 5, 0.12), new THREE.MeshBasicMaterial({ color: 0xa9c4dc, transparent: true, opacity: 0.55, depthWrite: false }), 1400);
    this.rain.visible = false; this.rain.frustumCulled = false; s.add(this.rain);
    this.beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial(), 64); this.beacons.count = 0; this.beacons.frustumCulled = false; s.add(this.beacons);
    this._fogTarget = new THREE.Color();
    this.serviceGroup = new THREE.Group(); s.add(this.serviceGroup);
    this.lineGroup = new THREE.Group(); s.add(this.lineGroup);
    this.ghostGroup = new THREE.Group(); s.add(this.ghostGroup);
    this.pipeMat = new THREE.MeshBasicMaterial({ color: 0x35b6ff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.svcCache = {}; this.modCache = {};
    this.spinners = [];
  }

  _inst(geo, mat, cap, shadow) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true;
    m.userData.cap = cap;
    this.scene.add(m);
    return m;
  }

  /** Gộp mọi mesh trong cảnh GLTF thành một BufferGeometry, dời tâm về gốc, đáy ở y=0, scale theo bề rộng chân đế mong muốn. */
  _normalizeGltf(gltf, foot, tint) {
    gltf.scene.updateMatrixWorld(true);
    const parts = [];
    let mat = null;
    gltf.scene.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); parts.push(g); if (!mat && o.material) mat = o.material; } });
    if (!parts.length) throw new Error('mô hình không có mesh');
    const geo = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
    geo.computeBoundingBox();
    const bb = geo.boundingBox, size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const k = foot / Math.max(size.x, size.z, 0.001);
    geo.applyMatrix4(new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -bb.min.y, -c.z)));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    mat = mat ? mat.clone() : new THREE.MeshStandardMaterial();
    mat.metalness = 0; mat.roughness = 0.85;
    if (tint) mat.color.set(tint);
    return { geo, mat };
  }

  /** Nạp người / vật tạo bằng Meshy (assets/models/*.glb); mỗi món tải xong thì tự thêm vào, tải lỗi thì bỏ qua (người hộp / không có vật vẫn ổn). */
  _loadCrowdModels() {
    const loader = new GLTFLoader();
    const load = (file) => new Promise((resolve, reject) => loader.load(new URL(`../assets/models/${file}`, import.meta.url).href, resolve, undefined, reject));
    for (const pm of PED_MODELS) {
      load(pm.file).then((gltf) => {
        const { geo, mat } = this._normalizeGltf(gltf, pm.foot);
        this.pedVariants.push(this._inst(geo, mat, MAX_PEDS, true));
      }).catch(() => {});
    }
    load(ANIMAL_DOG.file).then((gltf) => {
      const { geo, mat } = this._normalizeGltf(gltf, ANIMAL_DOG.foot, ANIMAL_DOG.tint);
      this.animalMesh = this._inst(geo, mat, MAX_ANIMALS, true);
    }).catch(() => {});
  }

  /** Chọn lại vài chục chỗ lang thang (công viên, quảng trường, lề đường trống) khi sang thành phố khác. */
  _ensureAnimals() {
    const c = this.city;
    if (this._animalCity === c) return;
    this._animalCity = c;
    const spots = [];
    for (const s of c.services) {
      const def = SERVICES[s.type];
      if ((s.type === 'park' || s.type === 'plaza') && s.cell >= 0) { const wx = (s.x + def.size / 2) * T - HALF, wz = (s.y + def.size / 2) * T - HALF; for (let k = 0; k < 3; k++) spots.push(wx, wz); }
    }
    for (let i = 0; i < N * N; i++) if (c.acc[i] === 2 && !c.level[i] && !c.road[i] && !c.water[i] && Math.random() < 0.02) spots.push(cellX(i), cellZ(i));
    this._animalSpots = spots;
    this.animals = [];
    const total = spots.length / 2;
    if (!total) return;
    for (let k = 0; k < DOG_COUNT; k++) {
      const si = ((Math.random() * total) | 0) * 2, x = spots[si], z = spots[si + 1];
      this.animals.push({ x, z, tx: x, tz: z, yaw: 0 });
    }
  }

  /** Vẽ chó thả rông: lang thang chậm rãi quanh vài điểm quen (không thuộc mô phỏng kinh tế, chỉ trang trí). */
  _animals(simDt) {
    if (!this.animalMesh) return;
    this._ensureAnimals();
    const sp = this._animalSpots, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
    let n = 0;
    for (const a of this.animals) {
      const dx = a.tx - a.x, dz = a.tz - a.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.3) {
        if (sp && sp.length >= 2) { const si = ((Math.random() * (sp.length / 2)) | 0) * 2; a.tx = sp[si] + (Math.random() - 0.5) * 6; a.tz = sp[si + 1] + (Math.random() - 0.5) * 6; }
      } else {
        const v = Math.sqrt(d2), speed = 1.1;
        a.x += (dx / v) * speed * simDt; a.z += (dz / v) * speed * simDt; a.yaw = Math.atan2(dx, dz);
      }
      if (n >= MAX_ANIMALS) break;
      const bob = 1 + Math.sin(this.time * 8 + n) * 0.06;
      p.set(a.x, this.roadY(a.x, a.z) + 0.05, a.z); q.setFromAxisAngle(up, a.yaw); s.set(1, bob, 1); m.compose(p, q, s);
      this.animalMesh.setMatrixAt(n++, m);
    }
    this.animalMesh.count = n; this.animalMesh.instanceMatrix.needsUpdate = true;
  }

  setCity(city) {
    this.city = city;
    for (const o of [this.terrain, this.overlay]) if (o) { this.scene.remove(o); o.geometry.dispose(); }
    this.terrain = this._terrain(city);
    this.overlay = this._overlayMesh(city);
    this.scene.add(this.terrain, this.overlay);
    city.dirty = { roads: true, buildings: true, trees: true, zones: true, services: true, lines: true, transit: true, fx: true, land: true };
    this.puffs.length = 0; this.fireCells = [];
    this.cam.x = cellCenter(city.start.x); this.cam.z = cellCenter(city.start.y + 6);
    this.cam.y = heightAt(city, this.cam.x, this.cam.z);
  }

  _terrain(city) {
    const hf = heightFn(city), { f, isWater } = hf, seed = city.seed;
    const W = N + 2 * BORDER, V = W + 1;
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3), uv = new Float32Array(V * V * 2);
    const grass = new THREE.Color(0x5e9c43), grass2 = new THREE.Color(0x74ad4c), sand = new THREE.Color(0xd9ca94), bed = new THREE.Color(0x4b7466), rock = new THREE.Color(0x8b8a78), forest = new THREE.Color(0x3f7a3a), dry = new THREE.Color(0x86a650), snow = new THREE.Color(0xe9ebe6), c = new THREE.Color(), tint = new THREE.Color();
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const gx = i - BORDER, gy = j - BORDER, k = j * V + i;
      const inside = gx >= 0 && gy >= 0 && gx <= N && gy <= N;
      const wn = isWater(gx - 1, gy - 1) + isWater(gx, gy - 1) + isWater(gx - 1, gy) + isWater(gx, gy);
      let h = inside ? city.hv[gy * (N + 1) + gx] : hf.height(gx, gy);
      if (wn === 4) c.copy(bed); else if (wn > 0) c.copy(sand); else {
        const out = Math.max(0, -gx, gx - N, -gy, gy - N), mt = hf.mount(gx, gy);
        c.copy(grass).lerp(grass2, vnoise(gx * 0.11, gy * 0.11, seed + 21)).lerp(dry, Math.min(0.6, h / 22));
        if (gx >= 0 && gy >= 0 && gx < N && gy < N) { const rs = city.res[gy * N + gx]; if (rs && rs < 5) c.lerp(tint.set(RES_TINT[rs]), 0.3 + 0.2 * vnoise(gx * 0.4, gy * 0.4, seed + 81)); }
        if (mt > 0) c.lerp(rock, Math.min(0.9, mt / 14)).lerp(snow, Math.min(1, Math.max(0, (h - 33) / 9))); // núi đá, đỉnh cao phủ trắng
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

  /** Viền phần đất đã mua (luôn hiện) và lưới ô đất còn lại (chỉ hiện khi cầm công cụ mua đất). */
  _land() {
    const c = this.city, V = N + 1, edge = new Tris(false), grid = new Tris(false);
    const y = (gx, gy) => Math.max(c.hv[gy * V + gx], WATER_Y) + 0.4;
    const seg = (t, x0, y0, x1, y1, w) => { // dải rộng 2w dọc một cạnh ô lưới
      const dx = x1 - x0 ? 0 : w, dz = x1 - x0 ? w : 0, ax = x0 * T - HALF, az = y0 * T - HALF, bx = x1 * T - HALF, bz = y1 * T - HALF, ya = y(x0, y0), yb = y(x1, y1);
      const p = t.v(ax - dx, ya, az - dz, 0, 0), q = t.v(ax + dx, ya, az + dz, 0, 0), r = t.v(bx - dx, yb, bz - dz, 0, 0), s = t.v(bx + dx, yb, bz + dz, 0, 0);
      t.tri(p, q, r, true); t.tri(q, s, r, true);
    };
    const own = (tx, ty) => tx >= 0 && ty >= 0 && tx < LT && ty < LT && c.owned[ty * LT + tx] === 1;
    for (let ty = 0; ty <= LT; ty++) for (let tx = 0; tx <= LT; tx++) {
      for (const horiz of [true, false]) { // cạnh trên (ngang) và cạnh trái (dọc) của ô đất (tx, ty)
        if (horiz ? tx >= LT : ty >= LT) continue;
        const a = own(tx, ty), b = horiz ? own(tx, ty - 1) : own(tx - 1, ty), t = a !== b ? edge : grid, w = a !== b ? 0.9 : 0.35;
        for (let k = 0; k < LAND; k++) {
          if (horiz) seg(t, tx * LAND + k, ty * LAND, tx * LAND + k + 1, ty * LAND, w);
          else seg(t, tx * LAND, ty * LAND + k, tx * LAND, ty * LAND + k + 1, w);
        }
      }
    }
    for (const m of [this.landEdge, this.landGrid]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    const mk = (t, color, opacity) => { const m = new THREE.Mesh(t.build(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); m.frustumCulled = false; m.renderOrder = 3; this.scene.add(m); return m; };
    this.landEdge = mk(edge, 0xffe9a8, 0.85);
    this.landGrid = mk(grid, 0xffffff, 0.45);
    this.landGrid.visible = !!this.showLand;
  }

  /** Bật / tắt lưới ô đất (công cụ mua đất). */
  setLandGrid(on) { this.showLand = on; if (this.landGrid) this.landGrid.visible = on; }

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
  setOverlay(mode, strong, grid, zone = 0) {
    if (mode !== this.overlayMode || strong !== this.ovStrong || zone !== this.ovZone) { this.overlayMode = mode; this.ovStrong = strong; this.ovZone = zone; this.city.dirty.zones = true; }
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
        } else if (this.ovStrong && c.acc[i] && !c.occ[i] && !c.steep[i]) { r = g = b = 255; a = 50; } // ô quy hoạch tự sinh hai bên đường
      } else if (mode === 'resource') {
        // tài nguyên: đang cầm khu chuyên biệt thì ô cạnh đường đặt được sáng hẳn lên
        const z = c.zone[i], rs = c.res[i];
        if (z && !c.water[i]) { [r, g, b] = ZCOL[z]; a = c.level[i] ? 90 : 170; }
        else if (this.ovZone && c.acc[i] && !c.occ[i] && !c.steep[i] && hasResource(c, i, this.ovZone)) { r = g = b = 255; a = 150; }
        else if (rs) { [r, g, b] = RESCOL[rs]; a = rs === 5 ? 95 : 135; }
      } else if (mode === 'waterpol') {
        const v = c.waterPol[i]; if (v > 0.03) { r = 150; g = 90; b = 30; a = 60 + 170 * v; }
      } else if (!c.water[i]) {
        if (mode === 'value') { const v = c.landValue[i] / 100; r = 255 * (1 - v); g = 60 + 180 * v; b = 60; a = 150; }
        else if (mode === 'pollution') { const v = c.pollution[i]; r = 150 + 90 * v; g = 110 * (1 - v); b = 30; a = v > 0.02 ? 60 + 150 * v : 0; }
        else if (mode === 'power') { if (c.acc[i]) { [r, g, b] = st[c.pOk[i]]; a = 125; } }
        else if (mode === 'water') { if (c.acc[i]) { const w = c.wOk[i], s = c.sOk[i]; [r, g, b] = st[w === 1 && s === 1 ? 1 : w === 0 || s === 0 ? 0 : 2]; a = 125; } }
        else if (mode === 'air' || mode === 'ground' || mode === 'noise') { const v = c[mode][i]; if (mode === 'air') { r = 120 + 110 * v; g = 110 * (1 - v); b = 40; } else if (mode === 'ground') { r = 130 + 60 * v; g = 90 * (1 - v) + 30; b = 20; } else { r = 200; g = 70; b = 200 + 40 * v; } a = v > 0.03 ? 50 + 170 * v : 0; }
        else if (mode === 'crime') { const v = c.crime[i]; r = 120 + 110 * v; g = 40; b = 160 - 60 * v; a = v > 0.04 ? 40 + 180 * v : 0; }
        else if (mode === 'service') { const cv = c.cover; const v = Math.min(1, (cv.police[i] + cv.fire[i] + cv.health[i] + cv.edu[i] + cv.trash[i]) / 3); r = 40; g = 120 + 100 * v; b = 220; a = v > 0.02 ? 50 + 130 * v : 0; }
        if (mode === 'garbage' && c.level[i]) { const v = Math.min(1, c.garbage[i] / (2 * garbageLimit(c.zone[i], c.level[i]))); r = 120 + 120 * v; g = 190 * (1 - v) + 30; b = 40; a = 150; }
      }
      if (!c.own[i]) { if (a < 40) { r = 12; g = 16; b = 24; a = 100; } else { r *= 0.6; g *= 0.6; b *= 0.6; a = Math.max(a, 120); } } // đất chưa mua: phủ tối
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
      if (nodeElevated(c, nid)) y += LIFT;
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
    const st = new GB(), lamps = []; // dầm, lan can, trụ, cột đèn; vị trí bóng đèn đường
    this.wprof = new Map();
    for (const e of c.edges.values()) {
      const def = ROADS[e.type], half = def.w / 2, [ra, rb] = trim.get(e.id), ps = this._ribbonPoints(e, ra, rb), tr = tris[e.type];
      const ya = nodeY.get(e.a), yb = nodeY.get(e.b), last = ps.length - 1;
      const high = !!def.elevated;
      const rows = ps.map((p, i) => {
        const rx = -p.tz, rz = p.tx;
        const lift = high ? liftAt(c, e, p.s) : 0, wl = high ? 0 : this.waterLift(e, p.s); // cầu qua sông vồng lên khỏi mặt nước
        let y = this._crossY(p.x, p.z, rx, rz, half) + lift + wl;
        const da = p.s - ra, db = e.len - rb - p.s; // hoà dần vào cao độ nút giao
        if (c.adj.get(e.a).length > 1 && da < 14) y = ya + (y - ya) * (da / 14);
        if (c.adj.get(e.b).length > 1 && db < 14) y = yb + (y - yb) * Math.max(0, db / 14);
        if (i === 0 && c.adj.get(e.a).length > 1) y = ya;
        if (i === last && c.adj.get(e.b).length > 1) y = yb;
        return { ...p, rx, rz, y, lift, wl };
      });
      let prev = null;
      for (const r of rows) {
        const v = r.s / 20;
        const L = tr.v(r.x - r.rx * half, r.y, r.z - r.rz * half, 0, v), R = tr.v(r.x + r.rx * half, r.y, r.z + r.rz * half, 1, v);
        // mép đứng hai bên để che khe hở với mặt đất
        const deep = high && r.y - this.roadY(r.x, r.z) > 1.5 ? 1.3 : 3; // đường trên cao: mép dày bằng mặt cầu
        const L1 = tr.v(r.x - r.rx * half, r.y, r.z - r.rz * half, 0.4, v), L2 = tr.v(r.x - r.rx * half, r.y - deep, r.z - r.rz * half, 0.4, v);
        const R1 = tr.v(r.x + r.rx * half, r.y, r.z + r.rz * half, 0.4, v), R2 = tr.v(r.x + r.rx * half, r.y - deep, r.z + r.rz * half, 0.4, v);
        if (prev) {
          tr.tri(prev.L, prev.R, L, true); tr.tri(prev.R, R, L, true);
          tr.tri(prev.L1, L1, prev.L2); tr.tri(L1, L2, prev.L2); tr.tri(prev.R1, prev.R2, R1); tr.tri(R1, prev.R2, R2);
        }
        prev = { L, R, L1, L2, R1, R2 };
      }
      cross.set(e.id, [rows[0], rows[last]]);
      this._structure(st, e, rows, half, lamps);
      if (!high) this._arches(st, e, rows, half);
    }
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
    // đảo cỏ giữa vòng xuyến
    const cG = new THREE.Color(0x5f9a45);
    for (const ring of c.rings || []) {
      const y = this.roadY(ring.x, ring.z) + 0.12, ctr = jt.v(ring.x, y, ring.z, cG.r, cG.g, cG.b), rr = ROUNDABOUT_R - 5.6, ids = [];
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; ids.push(jt.v(ring.x + Math.cos(a) * rr, y, ring.z + Math.sin(a) * rr, cG.r, cG.g, cG.b)); }
      for (let k = 0; k < 24; k++) jt.tri(ctr, ids[k], ids[(k + 1) % 24], true);
    }
    if (jt.i.length) { const m = new THREE.Mesh(jt.build(), this.junctionMat); m.receiveShadow = true; m.frustumCulled = false; this.roadGroup.add(m); }
    // vạch qua đường ở ngã ba, ngã tư dưới đất (không vẽ ở vòng xuyến và nút trên cao)
    const cZ = new THREE.Color(0xeeeadb), zt = new Tris(true);
    for (const [nid, arr] of ends) {
      const n = c.nodes.get(nid);
      if (arr.length < 3 || n.rb || nodeElevated(c, nid)) continue;
      const y = nodeY.get(nid) + 0.09;
      for (const en of arr) {
        const r = cross.get(en.e.id)[en.atA ? 0 : 1], sg = en.atA ? 1 : -1, ah = ROADS[en.e.type].asphalt / 2 - 0.4;
        const cx = r.x + r.tx * sg * 1.6, cz = r.z + r.tz * sg * 1.6, ax = r.tx * 1.1, az = r.tz * 1.1;
        for (let u = -ah + 0.35; u <= ah - 0.3; u += 1.15) {
          const p0x = cx + r.rx * u, p0z = cz + r.rz * u, p1x = cx + r.rx * (u + 0.6), p1z = cz + r.rz * (u + 0.6);
          const q = [[p0x - ax, p0z - az], [p1x - ax, p1z - az], [p1x + ax, p1z + az], [p0x + ax, p0z + az]].map((pt) => zt.v(pt[0], y, pt[1], cZ.r, cZ.g, cZ.b));
          zt.tri(q[0], q[1], q[2], true); zt.tri(q[0], q[2], q[3], true);
        }
      }
    }
    if (zt.i.length) { const m = new THREE.Mesh(zt.build(), this.junctionMat); m.receiveShadow = true; m.frustumCulled = false; m.renderOrder = 1; this.roadGroup.add(m); }
    // đèn tín hiệu: trụ ở góc, cần vươn ra giữa làn, hộp đèn đỏ / vàng / xanh xếp dọc; biển dừng: cột + biển bát giác đỏ
    this.sigArms = [];
    const m4 = new THREE.Matrix4(), my = new THREE.Matrix4();
    const stops = [...c.nodes.values()].filter((n) => n.ctl === 2 && (c.adj.get(n.id) || []).length >= 3).map((n) => n.id);
    for (const nid of [...c.traffic.signals.keys(), ...stops]) {
      const n = c.nodes.get(nid), y = nodeY.get(nid), stop = n.ctl === 2;
      for (const en of ends.get(nid) || []) {
        const r = trim.get(en.e.id)[en.atA ? 0 : 1] + 1.5, px = n.x + en.ox * r + en.oz * (en.half - 0.4), pz = n.z + en.oz * r - en.ox * (en.half - 0.4);
        if (stop) {
          st.cyl(px, y, pz, 0.09, 0.09, 2.6, 0x8a949c, 5);
          st.at(m4.makeTranslation(px, y + 2.85, pz).multiply(my.makeRotationY(Math.atan2(en.ox, en.oz)))).at(m4.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))).cyl(0, -0.06, 0, 0.62, 0.62, 0.12, 0xc8102e, 8, 0xc8102e).at(null);
          continue;
        }
        const hx = n.x + en.ox * r + en.oz * (en.half - 3.2), hz = n.z + en.oz * r - en.ox * (en.half - 3.2);
        st.cyl(px, y, pz, 0.2, 0.16, 5.6, 0x3a3f46, 6);
        st.at(m4.makeTranslation((px + hx) / 2, y + 5.3, (pz + hz) / 2).multiply(my.makeRotationY(Math.atan2(hx - px, hz - pz)))).box(0, 0, 0, 0.18, 0.18, Math.hypot(hx - px, hz - pz) + 0.3, 0x3a3f46).at(null);
        st.box(hx, y + 3.95, hz, 1.05, 2.4, 1.05, 0x22262b);
        this.sigArms.push({ nid, eid: en.e.id, x: hx - en.ox * 0.15, y: y + 4.6, z: hz - en.oz * 0.15 });
      }
    }
    if (st.i.length) { const m = new THREE.Mesh(st.build(), this.matBuilding); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.roadGroup.add(m); }
    if (lamps.length) {
      const lg = new GB();
      for (const [x, y, z] of lamps) lg.box(x, y, z, 0.7, 0.22, 0.45, 0xffffff);
      const m = new THREE.Mesh(lg.build(), this.lampHeadMat); m.frustumCulled = false; this.roadGroup.add(m);
    }
  }

  /**
   * Các nhịp qua nước của đoạn e (đường dưới đất): [{ s0, s1, h }] theo quãng đường từ đầu a.
   * h là độ vồng của mặt cầu so với mặt đường thường: nhịp càng dài càng cao để thuyền qua được.
   */
  waterRuns(e) {
    if (!this.wprof) this.wprof = new Map();
    let runs = this.wprof.get(e.id);
    if (runs && runs.len === e.len) return runs;
    runs = []; runs.len = e.len;
    const c = this.city, step = 2;
    let s0 = -1, gap = 0;
    for (let s = 0; s <= e.len + 0.01; s += step) {
      const p = pointAt(e.pts, e.cum, Math.min(s, e.len)), wet = isWaterAt(c, p[0], p[1]);
      if (wet) { if (s0 < 0) s0 = s; gap = 0; } else if (s0 >= 0 && (gap += step) > 4) { runs.push({ s0, s1: s - gap }); s0 = -1; gap = 0; }
    }
    if (s0 >= 0) runs.push({ s0, s1: e.len });
    for (const r of runs) r.h = clamp(3 + (r.s1 - r.s0) * 0.05, 3.5, 7);
    this.wprof.set(e.id, runs);
    return runs;
  }

  /** Độ vồng của mặt cầu qua sông tại quãng đường s trên đoạn e (0 ngoài cầu và với đường trên cao). */
  waterLift(e, s) {
    if (ROADS[e.type].elevated) return 0;
    let v = 0;
    for (const r of this.waterRuns(e)) {
      const R = 28, d = s < r.s0 ? r.s0 - s : s > r.s1 ? s - r.s1 : 0; // dốc dẫn lên cầu
      if (d >= R) continue;
      const t = 1 - d / R;
      v = Math.max(v, r.h * t * t * (3 - 2 * t));
    }
    return v;
  }

  /** Nhịp cầu dài qua sông: hai vòm thép hai bên, giằng ngang trên đỉnh, dây treo xuống mặt cầu. */
  _arches(st, e, rows, half) {
    const runs = this.waterRuns(e).filter((r) => r.s1 - r.s0 >= 40);
    if (!runs.length) return;
    const yAt = (s) => {
      let k = 1;
      while (k < rows.length - 1 && rows[k].s < s) k++;
      const a = rows[k - 1], b = rows[k], f = clamp((s - a.s) / (b.s - a.s || 1), 0, 1);
      return a.y + (b.y - a.y) * f;
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const beam = (a, b, w, h, col) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dz);
      st.at(m4.compose(v3.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q.setFromEuler(e3.set(-Math.atan2(dy, l), Math.atan2(dx, dz), 0, 'YXZ')), one));
      st.box(0, -h / 2, 0, w, h, Math.hypot(l, dy) + 0.1, col);
      st.at(null);
    };
    const STEEL = 0xc0503a, HANG = 0xe4e0d8;
    for (const r of runs) {
      const s0 = Math.max(0, r.s0 - 3), s1 = Math.min(e.len, r.s1 + 3), span = s1 - s0, A = clamp(5 + span * 0.06, 6, 14), n = Math.max(8, Math.round(span / 5));
      const side = [[], []];
      for (let k = 0; k <= n; k++) {
        const s = s0 + (span * k) / n, p = pointAt(e.pts, e.cum, s), rx = -p[3], rz = p[2], y = yAt(s) + 0.9, top = y + A * Math.sin((Math.PI * k) / n);
        [-1, 1].forEach((sd, j) => side[j].push([p[0] + rx * sd * (half - 0.25), top, p[1] + rz * sd * (half - 0.25), y]));
      }
      for (let k = 1; k <= n; k++) for (const arr of side) beam(arr[k - 1], arr[k], 0.55, 0.75, STEEL);
      for (let k = 1; k < n; k++) {
        for (const arr of side) { const a = arr[k]; if (a[1] - a[3] > 1) beam([a[0], a[1], a[2]], [a[0], a[3], a[2]], 0.12, 0.12, HANG); } // dây treo
        if (k % 3 === 0 && side[0][k][1] - side[0][k][3] > 4.5) beam([side[0][k][0], side[0][k][1], side[0][k][2]], [side[1][k][0], side[1][k][1], side[1][k][2]], 0.35, 0.45, STEEL); // giằng ngang
      }
    }
  }

  /**
   * Kết cấu của một đoạn đường: dầm, lan can, trụ và xà mũ cho đoạn trên cao hoặc qua nước;
   * cột đèn đường dọc vỉa hè cho đoạn dưới đất. lamps nhận vị trí bóng đèn.
   */
  _structure(st, e, rows, half, lamps) {
    const c = this.city, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const seg = (a, b, fn) => {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dz);
      if (l < 0.05) return;
      st.at(m4.compose(v3.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), q.setFromEuler(e3.set(-Math.atan2(dy, l), Math.atan2(dx, dz), 0, 'YXZ')), one));
      fn(Math.hypot(l, dy));
      st.at(null);
    };
    let nextPillar = 0, nextLamp = 14 + (e.id % 3) * 6, side = e.id % 2 ? 1 : -1;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i], water = isWaterAt(c, (a.x + b.x) / 2, (a.z + b.z) / 2) || Math.max(a.wl || 0, b.wl || 0) > 0.8, high = Math.max(a.lift, b.lift) > 0.8;
      if (high || water) {
        seg(a, b, (L) => {
          st.box(0, -1.15, 0, half * 2 + 0.2, 1.15, L + 0.05, 0xa8a399); // dầm
          st.box(0, -1.25, 0, half * 2 - 1.2, 0.1, L + 0.05, 0x8d887e);
          for (const sd of [-1, 1]) { st.box(sd * (half - 0.15), 0, 0, 0.32, 0.95, L + 0.05, 0xd8d4cc); st.box(sd * (half - 0.15), 0.95, 0, 0.42, 0.12, L + 0.05, 0x9aa3aa); } // lan can
        });
        if (b.s >= nextPillar) {
          nextPillar = b.s + (half > 7 ? 18 : 22);
          const gy = Math.max(heightAt(c, b.x, b.z), -3.2), top = b.y - 1.2;
          if (top - gy > 1.2) {
            if (half > 7) for (const sd of [-1, 1]) st.cyl(b.x + b.rx * sd * (half - 3), gy - 0.5, b.z + b.rz * sd * (half - 3), 1.05, 0.95, top - gy + 0.5, 0x9a968e, 8);
            else st.cyl(b.x, gy - 0.5, b.z, 1.15, 1, top - gy + 0.5, 0x9a968e, 8);
            st.at(m4.compose(v3.set(b.x, top - 0.45, b.z), q.setFromEuler(e3.set(0, Math.atan2(b.rx, b.rz), 0)), one)).box(0, 0, 0, 2.2, 0.9, half * 2 - 0.6, 0x8d887e).at(null); // xà mũ
          }
        }
      } else if (b.s >= nextLamp && b.s < e.len - 10) {
        nextLamp = b.s + 30; side = -side; // đổi bên sau mỗi cột
        const px = b.x + b.rx * side * (half - 0.5), pz = b.z + b.rz * side * (half - 0.5), hx = b.x + b.rx * side * (half - 2.2), hz = b.z + b.rz * side * (half - 2.2);
        st.cyl(px, b.y, pz, 0.13, 0.1, 6.2, 0x4a5058, 5);
        st.at(m4.compose(v3.set((px + hx) / 2, b.y + 6.1, (pz + hz) / 2), q.setFromEuler(e3.set(0, Math.atan2(hx - px, hz - pz), 0)), one)).box(0, 0, 0, 0.12, 0.12, Math.hypot(hx - px, hz - pz) + 0.2, 0x4a5058).at(null);
        lamps.push([hx, b.y + 5.85, hz]);
      }
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
      (s.mods || []).forEach((id, k) => { // module: khối phụ ở các góc lô đất, góc sau trước
        const geo = this.modCache[id] || (this.modCache[id] = moduleGeometry(id)), mesh = new THREE.Mesh(geo, this.matBuilding), o = (def.size * T) / 2 - 2.1;
        mesh.position.set(k % 2 ? o : -o, 0.14, k < 2 ? -o : o); mesh.castShadow = mesh.receiveShadow = true;
        grp.add(mesh);
      });
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
    const FIX = { garbage: 0x3d8a5a, ambulance: 0xffffff, fire: 0xd0342c, hearse: 0x26262a, police: 0x2c5aa0, tow: 0xe6a01e };
    const ease = 1 - Math.exp(-realDt * 10);
    let nu = 0, np = 0, nt = 0;
    const vc = this.vehCount;
    for (const k in vc) vc[k] = 0;
    const CONT = [0xc0392b, 0x2f6fb0, 0x3d8a5a, 0xe07b2e, 0x8a949c, 0x7a3fa0, 0xd8b93a];
    const put = (look, cap, color) => {
      let mesh = this.vehMeshes[look];
      if (!mesh) { mesh = this.vehMeshes[look] = this._inst(vehicleGeometry(look), this.vehMat, cap, true); vc[look] = 0; }
      const n = vc[look] || 0;
      if (n >= cap) return;
      mesh.setMatrixAt(n, m); mesh.setColorAt(n, color); vc[look] = n + 1;
    };
    for (const v of c.traffic.vehicles) {
      const e = v.e, sa = v.fwd ? Math.min(v.s, e.len) : Math.max(0, e.len - v.s), pt = pointAt(e.pts, e.cum, sa), lift = ROADS[e.type].elevated ? liftAt(c, e, sa) : 0;
      const sg = v.fwd ? 1 : -1, tx = pt[2] * sg, tz = pt[3] * sg, ls = LANES[e.type], off = ls[Math.min(v.lane, ls.length - 1)] + (v.kind === 'moto' ? ((v.id % 5) - 2) * 0.32 : 0);
      const gx = pt[0] - tz * off, gz = pt[1] + tx * off;
      if (v.rx == null) { v.rx = gx; v.rz = gz; v.ryaw = Math.atan2(tx, tz); }
      const ox = v.rx, oz = v.rz;
      v.rx += (gx - v.rx) * ease; v.rz += (gz - v.rz) * ease;
      const mx = v.rx - ox, mz = v.rz - oz;
      if (mx * mx + mz * mz > 1e-5) v.ryaw = Math.atan2(mx, mz);
      if (v.wreck && !v.crashed) { v.crashed = true; v.ryaw += v.crashYaw || 0.6; } // xe tai nạn nằm chéo đường
      p.set(v.rx, (lift ? this._crossY(v.rx, v.rz, -tz, tx, ROADS[e.type].w / 2) + lift : this.roadY(v.rx, v.rz) + this.waterLift(e, sa)) + 0.06, v.rz); q.setFromAxisAngle(up, v.ryaw); m.compose(p, q, s);
      const look = v.look || v.kind;
      if (v.kind === 'moto') put(look, MAX_MOTO, v.wreck ? col.set(0x3a3a3a) : col.setHSL(v.color, 0.6, 0.5));
      else if (v.kind === 'car') put(look, MAX_CARS, v.wreck ? col.set(0x3a3a3a) : look === 'taxi' ? col.set(v.color < 0.5 ? 0xf2c230 : 0x2aa37a) : col.set(PAL[(v.color * PAL.length) | 0]));
      else if (v.kind === 'police') put('police', MAX_BIG, col.set(0xf2f2f2));
      else if (v.kind === 'bus') { if (nu < MAX_BUS) { this.busMesh.setMatrixAt(nu, m); this.busMesh.setColorAt(nu++, col.setHSL(v.color, 0.75, 0.52)); } }
      else if (v.kind === 'tram') { if (nt < MAX_BUS) { this.tramMesh.setMatrixAt(nt, m); this.tramMesh.setColorAt(nt++, col.setHSL(v.color, 0.7, 0.5)); } }
      else if (FIX[v.kind]) put(look, MAX_BIG, col.set(FIX[v.kind]));
      else put(look, MAX_BIG, v.wreck ? col.set(0x4a4a4a) : look === 'container' ? col.set(CONT[(v.id * 7 + ((v.color * 100) | 0)) % CONT.length]) : look === 'tanker' ? col.set(0xf4f4f4) : look === 'boxtruck' || look === 'deliveryvan' || look === 'reefer' ? col.setHSL(v.color, 0.25, 0.78) : col.setHSL(v.color, 0.5, 0.55));
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
    // người đi bộ trên vỉa hè: có mô hình Meshy thì luân phiên theo id (ổn định qua từng khung hình), chưa có thì người hộp dựng bằng code
    const pv = this.pedVariants, nv = pv.length, nvC = nv ? new Array(nv).fill(0) : null;
    for (const w of c.traffic.peds) {
      const st = w.steps[w.pi], e = st.e, pt = pointAt(e.pts, e.cum, st.fwd ? Math.min(w.s, e.len) : Math.max(0, e.len - w.s));
      const sg = st.fwd ? 1 : -1, tx = pt[2] * sg, tz = pt[3] * sg, off = w.side * (ROADS[e.type].w / 2 - 0.9);
      const gx = pt[0] - pt[3] * off, gz = pt[1] + pt[2] * off;
      if (w.rx == null) { w.rx = gx; w.rz = gz; }
      w.rx += (gx - w.rx) * ease; w.rz += (gz - w.rz) * ease;
      const bob = 1 + Math.sin(this.time * 14 + w.hue * 40) * 0.05;
      p.set(w.rx, this.roadY(w.rx, w.rz) + this.waterLift(e, st.fwd ? Math.min(w.s, e.len) : Math.max(0, e.len - w.s)) + 0.1, w.rz); q.setFromAxisAngle(up, Math.atan2(tx, tz)); m.compose(p, q, s.set(1.25, 1.25 * bob, 1.25));
      if (nv) {
        const vi = ((w.cb.id * 2654435761) >>> 0) % nv, ni = nvC[vi]++;
        if (ni < MAX_PEDS) pv[vi].setMatrixAt(ni, m);
      } else if (np < MAX_PEDS) { this.pedMesh.setMatrixAt(np, m); this.pedMesh.setColorAt(np++, col.setHSL(w.hue, 0.55, 0.55)); }
    }
    s.set(1, 1, 1);
    for (const k in this.vehMeshes) { const mesh = this.vehMeshes[k]; mesh.count = vc[k] || 0; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    for (const [mesh, n] of [[this.busMesh, nu], [this.tramMesh, nt], [this.pedMesh, np]]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    if (nv) for (let i = 0; i < nv; i++) { pv[i].count = Math.min(nvC[i], MAX_PEDS); pv[i].instanceMatrix.needsUpdate = true; }
    // đèn tín hiệu
    const LC = { g: 0x35e06a, y: 0xffd23f, r: 0xff3b30 };
    let nl = 0;
    for (const a of this.sigArms || []) {
      if (nl >= 800) break;
      const sg = signalState(c, a.nid, a.eid);
      m.makeTranslation(a.x, a.y + (sg === 'r' ? 1.15 : sg === 'y' ? 0.55 : -0.05), a.z); this.lampMesh.setMatrixAt(nl, m); // đỏ trên, vàng giữa, xanh dưới
      this.lampMesh.setColorAt(nl++, col.set(LC[sg] || 0x555555));
    }
    this.lampMesh.count = nl; this.lampMesh.instanceMatrix.needsUpdate = true; if (this.lampMesh.instanceColor) this.lampMesh.instanceColor.needsUpdate = true;
  }

  _railY(x, z) { return Math.max(heightAt(this.city, x, z), 0) + 7; }

  /** Trạm xe buýt, ga + ray metro, và vệt tuyến (vệt chỉ hiện khi đang xem lớp giao thông công cộng). */
  _transit() {
    const c = this.city, grp = this.transitGroup;
    for (const o of [...grp.children]) { o.geometry.dispose(); grp.remove(o); }
    this.routeMeshes = [];
    if (!this.stopGeo) this.stopGeo = { bus: stopGeometry('bus'), tram: stopGeometry('tram'), metro: stopGeometry('metro') };
    const railT = new Tris(true), rc = new THREE.Color(0x3a3d42);
    const g = new GB(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    let rails = false;
    for (const line of c.transit.lines) {
      const col = new THREE.Color().setHSL(line.hue, 0.8, 0.55), n = line.stops.length;
      line.stops.forEach((st, k) => {
        let yaw = 0, x = st.x, z = st.z;
        if (TRANSIT[line.mode].road && st.edge) { const pt = pointAt(st.edge.pts, st.edge.cum, st.along), half = ROADS[st.edge.type].w / 2 - 0.9; x = pt[0] - pt[3] * half; z = pt[1] + pt[2] * half; yaw = Math.atan2(pt[3], -pt[2]); }
        else if (line.mode === 'metro') { const o = line.stops[k === n - 1 ? k - 1 : k + 1]; yaw = Math.atan2(o.x - st.x, o.z - st.z); }
        const mesh = new THREE.Mesh(this.stopGeo[line.mode].clone(), this.matBuilding);
        mesh.position.set(x, TRANSIT[line.mode].road ? this.roadY(x, z) : Math.max(heightAt(c, x, z), 0), z); mesh.rotation.y = yaw; mesh.castShadow = true;
        grp.add(mesh);
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshBasicMaterial({ color: col }));
        flag.position.set(x, mesh.position.y + (line.mode === 'metro' ? 10.4 : 3.4), z); grp.add(flag);
      });
      if (line.mode === 'tram' && (line.path || []).length >= 4) { // hai ray tàu điện trên mặt đường, luôn hiện
        const pts = line.path;
        for (const off of [-0.75, 0.75]) {
          let prev = null;
          for (let k = 0; k < pts.length / 2; k++) {
            const a = Math.max(0, k - 1), b = Math.min(pts.length / 2 - 1, k + 1);
            let tx = pts[b * 2] - pts[a * 2], tz = pts[b * 2 + 1] - pts[a * 2 + 1];
            const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
            const ox = pts[k * 2] - tz * (LANES.small[0] + off), oz = pts[k * 2 + 1] + tx * (LANES.small[0] + off), y = this.roadY(ox, oz) + 0.09;
            const L = railT.v(ox - tz * 0.12, y, oz + tx * 0.12, rc.r, rc.g, rc.b), R = railT.v(ox + tz * 0.12, y, oz - tx * 0.12, rc.r, rc.g, rc.b);
            if (prev && Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]) < 30) { railT.tri(prev[0], prev[1], L); railT.tri(prev[1], R, L); }
            prev = [L, R];
          }
        }
      }
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
    if (railT.i.length) { const mesh = new THREE.Mesh(railT.build(), this.railMat || (this.railMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }))); mesh.frustumCulled = false; grp.add(mesh); }
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
        const x = pts[k * 2], z = pts[k * 2 + 1], y = this.roadY(x, z) + 0.6 + (ROADS[e.type].elevated ? liftAt(c, e, e.cum[k]) : 0);
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
      if (!c.fire[i] && !c.inc.wild[i]) continue;
      for (let k = 0; k < (c.fire[i] ? 3 : 2) && n < 300; k++) {
        const f = 0.7 + 0.5 * Math.abs(Math.sin(this.time * (5 + k * 1.7) + i));
        m.makeScale(f, f * (1 + k * 0.2), f).setPosition(cellCenter(i % N) + (k - 1) * 2.4, c.cellH[i] + 3 + k * 1.5, cellCenter((i / N) | 0) + (k % 2 ? 1.5 : -1.5));
        this.flameMesh.setMatrixAt(n++, m);
      }
    }
    for (const a of c.inc.accidents) if (a.fire && n < 300) { // xe tai nạn bốc cháy
      const f = 0.6 + 0.4 * Math.abs(Math.sin(this.time * 6 + a.id));
      m.makeScale(f, f, f).setPosition(a.x, this.roadY(a.x, a.z) + 2.5, a.z); this.flameMesh.setMatrixAt(n++, m);
    }
    this.flameMesh.count = n; this.flameMesh.instanceMatrix.needsUpdate = true;
  }

  /** Lốc xoáy, mưa / mưa đá, đèn chớp ở hiện trường tai nạn và vụ cướp. */
  _weather(dt) {
    const c = this.city, inc = c.inc, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    // phễu lốc xoáy
    const t = inc.tornado;
    this.tornadoMesh.visible = !!t;
    if (t) {
      this.tornadoMesh.position.set(t.x, Math.max(heightAt(c, clamp(t.x, -HALF + 1, HALF - 1), clamp(t.z, -HALF + 1, HALF - 1)), 0), t.z);
      this.tornadoMesh.rotation.y -= dt * 7;
      for (let k = 0; k < this.debris.count; k++) { // mảnh vỡ bay quanh phễu
        const a = this.time * (3 + (k % 5) * 0.4) + k * 2.4, r = 6 + (k % 7) * 2.2, y = 2 + ((k * 13 + this.time * 9) % 34);
        m.makeRotationY(a).setPosition(t.x + Math.cos(a) * r, this.tornadoMesh.position.y + y, t.z + Math.sin(a) * r); this.debris.setMatrixAt(k, m);
      }
      this.debris.instanceMatrix.needsUpdate = true;
    }
    this.debris.visible = !!t;
    // mưa / mưa đá quanh tâm camera
    const w = inc.weather, wet = w === 'rain' || w === 'hail';
    this.rain.visible = wet;
    if (wet) {
      const cx = this.cam.x, cz = this.cam.z, span = Math.min(700, this.cam.dist * 1.6), fall = w === 'hail' ? 80 : 140;
      this.rain.material.color.set(w === 'hail' ? 0xf4f8ff : 0xa9c4dc);
      for (let k = 0; k < this.rain.count; k++) {
        const hx = hash2(k, 1, 7), hz = hash2(k, 2, 7), hy = (hash2(k, 3, 7) * 120 - this.time * fall) % 120;
        m.makeScale(w === 'hail' ? 2.2 : 1, w === 'hail' ? 0.25 : 1, w === 'hail' ? 2.2 : 1).setPosition(cx + (hx - 0.5) * span, (hy < 0 ? hy + 120 : hy) + 2, cz + (hz - 0.5) * span); this.rain.setMatrixAt(k, m);
      }
      this.rain.instanceMatrix.needsUpdate = true;
    }
    const sky = w === 'hail' || t ? 0x7d8a96 : w === 'rain' ? 0x9aa9b6 : 0xbfd9ee;
    this.scene.fog.color.lerp(this._fogTarget.set(sky), Math.min(1, dt * 2));
    this.sun.intensity += ((wet || t ? 1.4 : 3.1) - this.sun.intensity) * Math.min(1, dt * 2);
    // đèn chớp xanh đỏ: tai nạn và vụ cướp
    let n = 0;
    const blink = Math.sin(this.time * 12) > 0, col = new THREE.Color();
    const put = (x, y, z, k) => { if (n >= 64) return; m.compose(_v3.set(x, y, z), q.setFromAxisAngle(up, 0), _v3b.set(1, 1, 1)); this.beacons.setMatrixAt(n, m); this.beacons.setColorAt(n++, col.set((blink ^ k) ? 0x2f6fff : 0xff3030)); };
    for (const a of inc.accidents) put(a.x, this.roadY(a.x, a.z) + 5, a.z, 0);
    for (const r of inc.robberies) put(cellCenter(r.cell % N), c.cellH[r.cell] + 14, cellCenter((r.cell / N) | 0), 1);
    this.beacons.count = n; this.beacons.instanceMatrix.needsUpdate = true; if (this.beacons.instanceColor) this.beacons.instanceColor.needsUpdate = true;
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
    if (d.land) { this._land(); d.land = false; }
    if (d.roads) { this._roads(); d.roads = false; }
    if (d.lines) { this._lines(); d.lines = false; }
    if (d.buildings || this._animating) { this._animating = this._buildings(); d.buildings = false; d.zones = true; }
    if (d.trees) { this._trees(); d.trees = false; }
    if (d.services) { this._services(); d.services = false; }
    if (d.transit) { this._transit(); d.transit = false; }
    if (d.fx) { this.fireCells = []; for (let i = 0; i < N * N; i++) if (c.fire[i] || c.inc.wild[i]) this.fireCells.push(i); d.fx = false; }
    if (d.zones) { this._zones(); d.zones = false; }
    if (this.overlayMode === 'traffic' && (this._tlAt === undefined || this.time - this._tlAt > 0.8)) { this._tlAt = this.time; this._trafficLayer(); }
    this._vehicles(dt);
    this._animals(simDt);
    this._flames();
    this._weather(dt);
    this._smoke(simDt);
    for (const sp of this.spinners) sp.rotation.z -= simDt * 1.6;
    this._camera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

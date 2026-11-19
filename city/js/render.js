// Phố Mới — dựng cảnh three.js: địa hình có độ cao, nước, đường theo graph (thẳng / cong, nút giao),
// nhà, cây, xe chạy theo làn, dây điện / ống nước, lớp phủ quy hoạch.
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { N, T, HALF, LAND, LT, SERVICES, ROADS, ZDEF, RAW, TRANSIT, LIFT, ROUNDABOUT_R, clamp, garbageLimit, vnoise, hash2, mulberry32, heightAt, heightFn, hasResource, cellCenter, cellX, cellZ, isWaterAt, signalState, edgeLoad, metroPoint, liftAt, nodeElevated, nodeH, roadLvl, outsidePositions, shipRoutes, ferryPoint, bridgeOf, nearestOnEdge, rampMerge, wetNear, tunnelWetR, simTime, DOCK_H, SAIL_H, HOUR_SEC, fireworksAt, lineGeo, railGates, railNet, trainsAt, computeFlow, seasonFlow, fallGeom, reservoirLevel, damSpan, fallsInfo, cellMid, fisheryAreas, landGaps } from './sim.js';
import { metroGeometry, planeGeometry, trainParts, bar, RUNWAY } from './transport3d.js';
import { fishBoatGeometry, GB, growable, growableVN, hasVN, palmGeometry, treeGeometry, rockGeometry, vehicleGeometry, pedGeometry, busGeometry, tramGeometry, stopGeometry, serviceModel, moduleGeometry, windowTexture, windowLightTexture, pylonParts, shipGeometry, siteVehicle, towerCrane } from './models.js';

const BORDER = 30; // số ô địa hình trang trí quanh bản đồ
const _v3 = new THREE.Vector3(), _v3b = new THREE.Vector3(), _q0 = new THREE.Quaternion();
const WATER_Y = -0.9;
const MAX_CARS = 480, MAX_BIG = 220, MAX_BUS = 90, MAX_MOTO = 480, MAX_PEDS = 520, MAX_ANIMALS = 16, DOG_COUNT = 10, MAX_BEAMS = 900;
const TREE_CAP = [5000, 3500, 3000, 4500, 5000, 900], MAX_ROCKS = 2500, MAX_STROLL = 400; // cây tán tròn, tán xoè, dừa, thông, bụi, phượng
const SITE_H = {}; // chiều cao mô hình công trình (để dựng giàn giáo)
const GLASS = 0x2f3b45;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
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
export const DCOL = [[255, 99, 71], [64, 160, 255], [80, 200, 120], [250, 190, 40], [190, 110, 240], [40, 210, 210], [255, 130, 190], [160, 200, 60]]; // màu từng quận
const RES_TINT = [null, 0x9db84a, 0x3f7a3a, 0x8d8a80, 0x5a5648]; // nhuộm nhẹ mặt đất theo tài nguyên
const ASPHALT = '#41444a', WALK = '#b6b3a9';
const LANES = { small: [1.6], large: [2.25, 5.55], oneway: [-1.6, 1.6], overpass: [1.8], overpass2: [1.8], overpass3: [1.8], tunnel: [1.8], highway: [2.1, 5.4, 8.7] }; // thiếu loại nào thì xe chạy trên đó làm lỗi vòng vẽ

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

// biển hiệu chữ cho cửa hàng kiểu Việt Nam (từ chung chung, không phải thương hiệu)
const SIGN_WORDS = ['PHỞ', 'CÀ PHÊ', 'TẠP HOÁ', 'BÁNH MÌ', 'SỬA XE', 'BÚN CHẢ', 'CƠM TẤM', 'ĐIỆN THOẠI'];
const SIGN_BG = ['#d8262e', '#1f6fc8', '#f2c200', '#16935a', '#e8681f', '#d8262e', '#7a3fb0', '#1f6fc8'];
function signAtlas() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64 * SIGN_WORDS.length;
  const g = cv.getContext('2d');
  SIGN_WORDS.forEach((w, k) => {
    g.fillStyle = SIGN_BG[k]; g.fillRect(0, k * 64, 512, 64);
    g.fillStyle = SIGN_BG[k] === '#f2c200' ? '#b0141c' : '#fff6d0';
    g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(w, 256, k * 64 + 34, 490);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const MAX_TRENCH = 160;
/** Uniform chung cho mọi vật liệu cần khoét lỗ theo lòng hầm chui (mặt đất, mặt nước). */
const TRENCH = { seg: { value: Array.from({ length: MAX_TRENCH }, () => new THREE.Vector4()) }, hw: { value: new Float32Array(MAX_TRENCH) }, n: { value: 0 }, box: { value: new THREE.Vector4(1, 1, -1, -1) } };
/** Sửa shader của vật liệu để bỏ (discard) những điểm nằm trong lòng hầm chui đang mở. */
function trenchCut(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTSeg = TRENCH.seg; sh.uniforms.uTHw = TRENCH.hw; sh.uniforms.uTN = TRENCH.n; sh.uniforms.uTBox = TRENCH.box;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTWorld;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vTWorld;
uniform vec4 uTSeg[${MAX_TRENCH}];
uniform float uTHw[${MAX_TRENCH}];
uniform int uTN;
uniform vec4 uTBox;`).replace('void main() {', `void main() {
  // ngoài khung bao các lòng hầm thì khỏi duyệt từng đoạn (đỡ nặng cho mặt đất, mặt nước phủ cả màn hình)
  if (vTWorld.x >= uTBox.x && vTWorld.z >= uTBox.y && vTWorld.x <= uTBox.z && vTWorld.z <= uTBox.w)
  for (int i = 0; i < ${MAX_TRENCH}; i++) {
    if (i >= uTN) break;
    vec2 a = uTSeg[i].xy, ba = uTSeg[i].zw - a, pa = vTWorld.xz - a;
    float hv = uTHw[i], f = floor(hv / 100.0), h = dot(pa, ba) / max(dot(ba, ba), 1e-4);
    if ((h < 0.0 && mod(f, 2.0) > 0.5) || (h > 1.0 && f > 1.5)) continue; // đầu cắt phẳng: cửa hầm, phía sau là hầm kín
    h = clamp(h, 0.0, 1.0);
    if (length(pa - ba * h) < hv - f * 100.0) discard;
  }`);
  };
  mat.customProgramCacheKey = () => 'trench';
  return mat;
}

/** Bao lồi của tập điểm [x, z] (giữ thứ tự ngược chiều kim đồng hồ). */
function hull2(pts) {
  if (pts.length < 4) return pts;
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Đốm sáng tròn mờ dần ra mép (vệt đèn đường, đèn pha trên mặt đường). */
function glowTexture(beam) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = beam ? g.createRadialGradient(32, 4, 2, 32, 30, 36) : g.createRadialGradient(32, 32, 1, 32, 32, 32); // đèn pha: sáng nhất ở sát đầu xe
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const GLSL_NOISE = `
float nHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nHash(i), nHash(i + vec2(1.0, 0.0)), f.x), mix(nHash(i + vec2(0.0, 1.0)), nHash(i + vec2(1.0, 1.0)), f.x), f.y); }`;

/**
 * Mặt nước: sóng gợn chạy theo thời gian, phản chiếu trời theo góc nhìn (Fresnel), ánh nắng lấp lánh,
 * nước nông trong xanh dần sang sâu đậm màu theo cao độ đáy (tH), bọt trắng viền bờ. Vẫn khoét lỗ theo lòng hầm chui.
 */
function waterMaterial(u) {
  return new THREE.ShaderMaterial({
    transparent: true, fog: true, uniforms: u,
    vertexShader: `varying vec3 vW;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `uniform float uTime, uLight;
uniform vec3 uSun, uSunCol, uSkyTop, uSkyHor, uDeep, uShallow;
uniform sampler2D tH, tFlow;
uniform vec4 uMap; // 1 / T, HALF, BORDER, số đỉnh mỗi cạnh
uniform float uN, uFlowK, uLevel, uRes; // số ô mỗi cạnh, hệ số mùa nước, mực nước của mặt này, 1 = mặt hồ chứa sau đập
uniform vec4 uTSeg[${MAX_TRENCH}];
uniform float uTHw[${MAX_TRENCH}];
uniform int uTN;
uniform vec4 uTBox;
varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
${GLSL_NOISE}
float waves(vec2 p) {
  float t = uTime;
  return nNoise(p * 0.11 + vec2(t * 0.16, t * 0.1)) * 0.5 + nNoise(p * 0.31 - vec2(t * 0.24, -t * 0.17)) * 0.32 + nNoise(p * 0.83 + vec2(-t * 0.4, t * 0.5)) * 0.18;
}
// sóng trôi theo dòng chảy (flow map hai pha cho khỏi kéo giãn)
float flowWaves(vec2 p, vec2 fv) {
  float t0 = fract(uTime * 0.12), t1 = fract(uTime * 0.12 + 0.5), w = abs(t0 * 2.0 - 1.0);
  return mix(waves(p - fv * t0 * 60.0), waves(p - fv * t1 * 60.0 + vec2(17.0, 31.0)), w);
}
void main() {
  if (vW.x >= uTBox.x && vW.z >= uTBox.y && vW.x <= uTBox.z && vW.z <= uTBox.w)
  for (int i = 0; i < ${MAX_TRENCH}; i++) {
    if (i >= uTN) break;
    vec2 a = uTSeg[i].xy, ba = uTSeg[i].zw - a, pa = vW.xz - a;
    float hv = uTHw[i], f = floor(hv / 100.0), hh = dot(pa, ba) / max(dot(ba, ba), 1e-4);
    if ((hh < 0.0 && mod(f, 2.0) > 0.5) || (hh > 1.0 && f > 1.5)) continue;
    hh = clamp(hh, 0.0, 1.0);
    if (length(pa - ba * hh) < hv - f * 100.0) discard;
  }
  vec2 p = vW.xz;
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 fuv = ((p + uMap.y) * uMap.x) / uN; // ô bản đồ → toạ độ kết cấu dòng chảy
  vec4 fl = (fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0) ? texture2D(tFlow, fuv) : vec4(0.5, 0.5, 0.0, 1.0);
  if (uRes < 1.5 && (uRes > 0.5 ? fl.a > 0.5 : fl.a < 0.5)) discard; // mặt sông thường nhường chỗ cho mặt hồ chứa dâng cao sau đập (2 = hồ chân thác: luôn vẽ)
  float spd = fl.b * uFlowK;
  vec2 fd = fl.rg * 2.0 - 1.0, fv = fd * spd;
  float e = 0.6, h0 = flowWaves(p, fv), hx = flowWaves(p + vec2(e, 0.0), fv), hz = flowWaves(p + vec2(0.0, e), fv);
  float amp = 1.5 * (1.0 - smoothstep(350.0, 1600.0, dist));
  vec3 n = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  // độ sâu theo cao độ đáy
  vec2 uv = ((p + uMap.y) * uMap.x + uMap.z + 0.5) / uMap.w;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec2 gq = uv * uMap.w - 0.5, gi = floor(gq), gf = gq - gi;
  float ha = texture2D(tH, (gi + 0.5) / uMap.w).r, hb = texture2D(tH, (gi + vec2(1.5, 0.5)) / uMap.w).r, hd = texture2D(tH, (gi + vec2(0.5, 1.5)) / uMap.w).r, he = texture2D(tH, (gi + 1.5) / uMap.w).r;
  float gh = gf.x + gf.y <= 1.0 ? ha + (hb - ha) * gf.x + (hd - ha) * gf.y : he + (hd - he) * (1.0 - gf.x) + (hb - he) * (1.0 - gf.y); // đúng mặt tam giác của lưới địa hình
  float depth = mix(3.0, uLevel - (gh * 40.0 - 8.0), inside); // cao độ đáy mã hoá -8..32 m (ao hồ trên cao cũng đúng độ sâu)
  float dk = clamp(depth / 2.3, 0.0, 1.0);
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 1.0, dk)) * uLight;
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uSkyHor, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.55));
  vec3 col = mix(body, sky, fres * 0.8);
  col += uSunCol * (pow(max(dot(R, uSun), 0.0), 260.0) * 2.2 + pow(max(dot(R, uSun), 0.0), 28.0) * 0.12);
  // bọt viền bờ: một dải sát mép + vài gợn sóng lăn vào
  float fn = nNoise(p * 0.55 + vec2(uTime * 0.22, -uTime * 0.16));
  float edge = 1.0 - smoothstep(0.0, 0.26, depth + (fn - 0.5) * 0.22);
  float band = smoothstep(0.72, 0.95, sin(depth * 8.0 - uTime * 1.3 + fn * 5.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.25, 1.0, depth));
  // nước chảy xiết: vệt bọt kéo dài theo dòng, ghềnh trắng xoá chỗ rất xiết (dưới đập)
  vec2 fdn = length(fd) > 0.01 ? normalize(fd) : vec2(1.0, 0.0);
  float along = dot(p, fdn), across = dot(p, vec2(-fdn.y, fdn.x));
  float streak = smoothstep(0.62, 0.9, nNoise(vec2(across * 0.7, along * 0.09 - uTime * (0.6 + spd * 4.0)))) * smoothstep(0.22, 0.7, spd);
  float rapid = smoothstep(0.75, 1.05, spd) * (0.55 + 0.45 * nNoise(p * 0.9 - fdn * uTime * 6.0));
  float foam = clamp(edge * 0.9 + band * 0.4 + streak * 0.55 + rapid, 0.0, 1.0) * inside;
  col = mix(col, vec3(0.94, 0.97, 0.98) * (0.3 + 0.7 * uLight), foam * 0.8);
  float alpha = max(max(mix(0.42, 0.93, dk), fres), foam * 0.85);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });
}

/** Vòm trời: nền chuyển màu theo giờ, mặt trời / mặt trăng, sao đêm, mây trôi. Màu chân trời trùng màu sương mù. */
function skyMaterial(u) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false, uniforms: u,
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop, uHor, uBody, uBodyCol, uSunD, uGlow;
uniform float uNight, uCloud, uTime, uDusk, uSunUp;
varying vec3 vDir;
${GLSL_NOISE}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * nNoise(p); p = p * 2.03 + vec2(17.0, 3.0); a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uHor, uTop, pow(max(d.y, 0.0), 0.5));
  // bình minh / hoàng hôn: dải sáng cam đỏ sát chân trời phía mặt trời, lên cao ngả hồng tím; phía đối diện có vành tím nhạt
  vec2 hz = normalize(d.xz + 1e-5), sz = normalize(uSunD.xz + 1e-5);
  float az = dot(hz, sz) * 0.5 + 0.5, low = exp(-max(d.y, 0.0) * 7.0);
  vec3 glowC = mix(uGlow, vec3(0.93, 0.52, 0.62), smoothstep(0.02, 0.3, d.y));
  col += glowC * uDusk * low * pow(az, 2.2) * 0.95;
  col += vec3(0.5, 0.4, 0.62) * uDusk * exp(-max(d.y, 0.0) * 5.0) * pow(1.0 - az, 3.0) * 0.22;
  float sd = max(dot(d, uBody), 0.0);
  float disc = smoothstep(0.9990 - uDusk * 0.0006, 0.9995 - uDusk * 0.0004, sd); // mặt trời to hơn khi sát chân trời
  col += uBodyCol * (disc * 1.7 + pow(sd, 48.0) * 0.28 + pow(sd, 6.0) * 0.08);
  float sun = max(dot(d, uSunD), 0.0);
  col += uGlow * uSunUp * (pow(sun, 14.0) * 0.32 + pow(sun, 200.0) * 0.5) * (0.4 + uDusk); // quầng sáng quanh mặt trời
  // tia nắng toả quanh mặt trời
  vec3 ax = normalize(cross(uSunD, vec3(0.0, 1.0, 0.0)) + 1e-4), ay = cross(ax, uSunD);
  float ang = atan(dot(d, ay), dot(d, ax));
  float ray = nNoise(vec2(ang * 9.0, uTime * 0.04)) * nNoise(vec2(ang * 23.0 + 5.0, -uTime * 0.03));
  col += uBodyCol * uSunUp * smoothstep(0.15, 0.5, ray) * pow(sun, 7.0) * 0.32 * (1.0 - uCloud * 0.6);
  vec2 sp = d.xz / (d.y + 0.4) * 70.0;
  float sr = nHash(floor(sp));
  float star = step(0.975, sr) * smoothstep(0.32, 0.0, length(fract(sp) - 0.5));
  col += vec3(star) * uNight * smoothstep(0.03, 0.3, d.y) * (0.55 + 0.45 * sin(uTime * 2.0 + sr * 40.0));
  vec2 cp = d.xz / (d.y + 0.14) * 1.5 + vec2(uTime * 0.006, uTime * 0.0025);
  float cl = smoothstep(0.6 - uCloud * 0.3, 0.86 - uCloud * 0.3, fbm(cp)) * smoothstep(0.0, 0.16, d.y);
  vec3 cc = mix(uHor, vec3(1.0), 0.6 * (1.0 - uCloud * 0.5)) * (0.22 + 0.78 * (1.0 - uNight));
  // mây được nắng chiều nhuộm: phía mặt trời cam vàng viền sáng, xa dần hồng tím, mặt dưới sẫm
  float lit = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunD.x, 0.0, uSunD.z))), 0.0), 2.0);
  cc = mix(cc, mix(vec3(0.86, 0.5, 0.58), uGlow * 1.25, lit), uDusk * 0.75);
  cc += uBodyCol * uSunUp * pow(sun, 10.0) * 0.6 * (1.0 - cl * 0.5);
  col = mix(col, cc, cl * 0.82);
  if (d.y < 0.0) col = uHor;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
  });
}

/** Cửa sổ sáng đèn ban đêm: mỗi ô cửa bật / tắt ngẫu nhiên theo vị trí toà nhà, có ô đèn vàng, có ô đèn trắng xanh. */
function litWindows(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLitSeed;').replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vLitSeed = instanceMatrix[3].xz + modelMatrix[3].xz;
  #else
    vLitSeed = modelMatrix[3].xz;
  #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLitSeed;').replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
    vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
    float lr = fract(sin(dot(floor(vEmissiveMapUv) + floor(vLitSeed) * 0.37, vec2(12.9898, 78.233))) * 43758.5453);
    totalEmissiveRadiance *= emissiveColor.rgb * step(0.46, lr) * mix(vec3(1.0, 0.84, 0.58), vec3(0.78, 0.9, 1.0), step(0.88, lr)) * (0.5 + lr);
  #endif`);
  };
  mat.customProgramCacheKey = () => 'litwin';
  return mat;
}

/** Tán cây đung đưa theo gió: ngọn lắc nhiều, gốc đứng yên; mỗi cây lệch pha theo vị trí. */
function windSway(mat, uTime, sunV, sunCol) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = uTime; sh.uniforms.uSunV = sunV; sh.uniforms.uSunC = sunCol;
    // nắng xuyên tán lá: nhìn ngược sáng thì rìa tán sáng lên màu lá non; mặt dưới, lõi tán tối hơn
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunV, uSunC;\nvarying float vLeafY;').replace('#include <opaque_fragment>', `float trn = pow(max(dot(-geometryViewDir, uSunV), 0.0), 2.5) * (0.35 + 0.65 * (1.0 - abs(dot(normal, geometryViewDir)))) * smoothstep(1.2, 2.6, vLeafY);
  outgoingLight += diffuseColor.rgb * vec3(1.15, 1.25, 0.55) * uSunC * trn * 0.9;
  outgoingLight *= mix(0.72, 1.0, smoothstep(0.8, 4.5, vLeafY));
  #include <opaque_fragment>`);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLeafY;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLeafY = position.y;');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    float wPh = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.27;
    float wUp = max(position.y - 1.4, 0.0);
    transformed.x += sin(uWind * 1.5 + wPh + position.y * 0.45) * 0.03 * wUp;
    transformed.z += cos(uWind * 1.15 + wPh * 1.3 + position.x * 0.5) * 0.024 * wUp;
  #endif`);
  };
  mat.customProgramCacheKey = () => 'wind2';
  return mat;
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfd9ee);
    this.scene.fog = new THREE.Fog(new THREE.Color(0xbfd9ee), 700, 2600);
    this.camera = new THREE.PerspectiveCamera(42, 1, 2, 6000);
    this.cam = { x: 0, z: 0, y: 0, dist: 260, yaw: 0.6, pitch: 0.82 };
    this.hemi = new THREE.HemisphereLight(0xdcebff, 0x6f7f55, 0.8);
    this.scene.add(this.hemi);
    this.dayNight = true; // chu kỳ ngày đêm theo giờ trong game (tắt thì luôn là buổi sáng)
    this.lights = 0; // 0 ban ngày .. 1 đêm: độ sáng đèn đường, cửa sổ, đèn pha
    this.uTime = { value: 0 };
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 3.1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    this.scene.add(sun, sun.target);
    this.sunDir = new THREE.Vector3(-0.55, 0.75, 0.42).normalize();

    this.winTex = windowTexture();
    this.matBuilding = litWindows(new THREE.MeshStandardMaterial({ vertexColors: true, map: this.winTex, emissiveMap: windowLightTexture(), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.82, metalness: 0.02 }));
    this.raycaster = new THREE.Raycaster();
    this._static();
    this.puffs = [];
    this.time = 0;
    this.overlayMode = 'zones';
    this.resize();
  }

  /** Những thứ không phụ thuộc thành phố. */
  _static() {
    const s = this.scene;
    // mặt nước: shader riêng, đọc cao độ đáy từ một texture (cập nhật khi địa hình đổi)
    const TV = N + 2 * BORDER + 1;
    this.depthData = new Uint8Array(TV * TV);
    this.depthTex = new THREE.DataTexture(this.depthData, TV, TV, THREE.RedFormat, THREE.UnsignedByteType);
    this.depthTex.magFilter = this.depthTex.minFilter = THREE.NearestFilter; this.depthTex.unpackAlignment = 1;
    const wu = this.waterU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    Object.assign(wu, {
      uTime: this.uTime, uLight: { value: 1 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(0xfff1d6) },
      uSkyTop: { value: new THREE.Color(0x3f86d4) }, uSkyHor: { value: new THREE.Color(0xbfd9ee) }, uDeep: { value: new THREE.Color(0x1d5f96) }, uShallow: { value: new THREE.Color(0x4fb7c4) },
      tH: { value: this.depthTex }, uMap: { value: new THREE.Vector4(1 / T, HALF, BORDER, TV) }, tFlow: { value: this._flowTex() }, uN: { value: N }, uFlowK: { value: 1 }, uLevel: { value: WATER_Y }, uRes: { value: 0 }, uTSeg: TRENCH.seg, uTHw: TRENCH.hw, uTN: TRENCH.n, uTBox: TRENCH.box,
    });
    const water = this.water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), waterMaterial(wu));
    water.position.y = WATER_Y; water.renderOrder = 1;
    s.add(water);
    // vòm trời
    this.skyU = { uTop: { value: new THREE.Color(0x3f86d4) }, uHor: { value: new THREE.Color(0xbfd9ee) }, uBody: { value: new THREE.Vector3(0, 1, 0) }, uBodyCol: { value: new THREE.Color(0xfff1d6) }, uNight: { value: 0 }, uCloud: { value: 0.25 }, uTime: this.uTime,
      uSunD: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: new THREE.Color(0xff8a3d) }, uDusk: { value: 0 }, uSunUp: { value: 1 } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMaterial(this.skyU));
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    s.add(this.sky);
    // chói nắng: đốm sáng to quanh mặt trời, bị nhà cửa che khuất (thử độ sâu), tắt khi trời mưa hay về đêm
    this.glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(false), color: 0xffe2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false }));
    this.glare.renderOrder = 3; this.glare.frustumCulled = false; s.add(this.glare);

    // đường: một mesh cho mỗi loại + mesh nút giao
    this.roadMats = {};
    for (const t of Object.keys(ROADS)) this.roadMats[t] = new THREE.MeshStandardMaterial({ map: roadTexture(t), roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.junctionMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.roadGroup = new THREE.Group(); s.add(this.roadGroup);
    this.lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4 }); // bóng đèn đường

    // nhà tự mọc: 3 khu x 3 cấp x 3 biến thể
    this.growMeshes = {}; // tạo dần khi có toà nhà loại đó: khoá "khu-cấp-biến thể"

    this.sunV = { value: new THREE.Vector3(0, 1, 0) }; this.sunCol = { value: new THREE.Color(0xfff1d6) }; // hướng nắng trong hệ camera (cho tán lá xuyên sáng)
    const treeMat = windSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), this.uTime, this.sunV, this.sunCol);
    this.treeMeshes = TREE_CAP.map((cap, k) => this._inst(k === 2 ? palmGeometry() : treeGeometry(k), treeMat, cap, true));
    this.rockMesh = this._inst(rockGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), MAX_ROCKS, false);
    this.treeMeshes[4].castShadow = false; // bụi cây thấp: bóng không đáng kể, bỏ cho nhẹ
    // vệt sáng trên mặt đường: đèn đường (dựng trong _roads) và đèn pha xe (mỗi xe một vệt), chỉ hiện khi trời tối
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(false), color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.beamMat = new THREE.MeshBasicMaterial({ map: glowTexture(true), color: 0xfff2cc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.beamMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.4, 8).rotateX(-Math.PI / 2).translate(0, 0.12, 5.2), this.beamMat, MAX_BEAMS);
    this.beamMesh.count = 0; this.beamMesh.frustumCulled = false; this.beamMesh.renderOrder = 2; s.add(this.beamMesh);
    this.signMat = new THREE.MeshBasicMaterial({ map: signAtlas() }); this.signMeshes = [];
    for (let k = 0; k < SIGN_WORDS.length; k++) {
      const pg = new THREE.PlaneGeometry(1, 1), uv = pg.attributes.uv, v0 = 1 - (k + 1) / SIGN_WORDS.length, v1 = 1 - k / SIGN_WORDS.length;
      for (let j = 0; j < uv.count; j++) uv.setY(j, uv.getY(j) > 0.5 ? v1 : v0);
      const mm = new THREE.InstancedMesh(pg, this.signMat, 2000); mm.count = 0; mm.frustumCulled = false; s.add(mm); this.signMeshes.push(mm);
    }
    const vehMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    this.vehMat = vehMat; this.vehMeshes = {}; this.vehCount = {};
    this.siteVeh = {}; this.siteCrane = {}; this.siteAnims = []; // xe công trình, cần cẩu tháp (dựng khi cần) // mỗi kiểu xe một InstancedMesh, tạo khi kiểu đó xuất hiện lần đầu
    this.pedMesh = this._inst(pedGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), MAX_PEDS, true);
    this.strollMesh = this._inst(pedGeometry(), this.pedMesh.material, MAX_STROLL, true); this.strollMesh.count = 0; // người đi dạo trên lối đi bộ
    this.busMesh = this._inst(busGeometry(), vehMat, MAX_BUS, true);
    this.tramMesh = this._inst(tramGeometry(), vehMat, MAX_BUS, true);
    { const mg = metroGeometry(); this.metroMesh = this._inst(mg.body, vehMat, MAX_BUS, true); this.metroStripe = this._inst(mg.stripe, vehMat, MAX_BUS, false); } // tàu metro 3 toa, vạch màu tuyến
    this.shipMeshes = [this._inst(shipGeometry(0), vehMat, 40, true), this._inst(shipGeometry(1), vehMat, 40, true)]; // tàu khách, tàu hàng
    this.shipT = 0;
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
    this._gate(city);
    this._rebuildTerrain();
    city.dirty = { roads: true, buildings: true, trees: true, zones: true, services: true, lines: true, transit: true, fx: true, land: true, flood: true, beach: true, decor: true, rail: true, falls: true, terrain: 0 };
    this.puffs.length = 0; this.fireCells = [];
    this.cam.x = cellCenter(city.start.x); this.cam.z = cellCenter(city.start.y + 6);
    this.cam.y = heightAt(city, this.cam.x, this.cam.z);
  }

  /** Dựng lại toàn bộ mặt đất (màu theo cao độ, bờ nước) và lớp phủ; gọi khi đổi thành phố hoặc sau một lượt đào đắp. */
  _rebuildTerrain() {
    for (const o of [this.terrain, this.overlay]) if (o) { this.scene.remove(o); o.geometry.dispose(); }
    this.terrain = this._terrain(this.city);
    this.overlay = this._overlayMesh(this.city);
    this.scene.add(this.terrain, this.overlay);
    this._depthSync();
  }

  /** Đang đào đắp dở: chỉ chép cao độ mới vào lưới có sẵn (màu đất tính lại sau khi nhả chuột). */
  _terrainSync() {
    const c = this.city, pos = this.terrPos, V = N + 2 * BORDER + 1, V1 = N + 1, ov = this.overlay.geometry.attributes.position;
    for (let gy = 0; gy <= N; gy++) for (let gx = 0; gx <= N; gx++) {
      const h = c.hv[gy * V1 + gx];
      pos[((gy + BORDER) * V + gx + BORDER) * 3 + 1] = h;
      ov.array[(gy * V1 + gx) * 3 + 1] = Math.max(h, WATER_Y) + 0.12;
    }
    this.terrain.geometry.attributes.position.needsUpdate = true; ov.needsUpdate = true;
    this.terrain.geometry.computeVertexNormals();
    this._depthSync();
  }

  /** Chép cao độ mặt đất vào texture độ sâu của mặt nước (−6 .. 6 thành 0 .. 255). */
  _depthSync() {
    const pos = this.terrPos, d = this.depthData;
    for (let k = 0; k < d.length; k++) d[k] = clamp((pos[k * 3 + 1] + 8) / 40, 0, 1) * 255;
    this.depthTex.needsUpdate = true;
  }

  _terrain(city) {
    const hf = heightFn(city), { f, isWater } = hf, seed = city.seed;
    const W = N + 2 * BORDER, V = W + 1;
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3), uv = new Float32Array(V * V * 2);
    const soil = new THREE.Color(0x9a7b55);
    const beachSand = new THREE.Color(0xeedfae), grass = new THREE.Color(0x5e9c43), grass2 = new THREE.Color(0x74ad4c), sand = new THREE.Color(0xd9ca94), bed = new THREE.Color(0x4b7466), rock = new THREE.Color(0x8b8a78), forest = new THREE.Color(0x3f7a3a), dry = new THREE.Color(0x86a650), snow = new THREE.Color(0xe9ebe6), c = new THREE.Color(), tint = new THREE.Color();
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
        if (inside) { const tv = city.terra[gy * (N + 1) + gx]; if (tv) c.lerp(soil, clamp(0.18 + Math.abs(tv) * 0.012, 0, 0.5)); } // đất mới đào đắp lộ màu đất
        if (out > 0) {
          const s = Math.min(1, out / BORDER), e = s * s * (3 - 2 * s), land = Math.min(1, Math.max(0, f(gx, gy) / 9));
          const m = e * land * (vnoise(gx * 0.05, gy * 0.05, seed + 31) * 85 + vnoise(gx * 0.17, gy * 0.17, seed + 33) * 16);
          h += m;
          c.lerp(forest, Math.min(1, m / 18)).lerp(rock, Math.min(1, Math.max(0, (m - 34) / 30)));
        } else if (isWater(gx - 2, gy) || isWater(gx + 1, gy) || isWater(gx, gy - 2) || isWater(gx, gy + 1) || isWater(gx - 2, gy - 1) || isWater(gx - 1, gy - 2) || isWater(gx + 1, gy - 1) || isWater(gx - 1, gy + 1)) c.lerp(sand, 0.45);
      }
      if (inside && city.beach && [[gx - 1, gy - 1], [gx, gy - 1], [gx - 1, gy], [gx, gy]].some(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && city.beach[b * N + a])) c.copy(beachSand).lerp(sand, wn > 0 ? 0.6 : 0.12 * vnoise(gx * 0.7, gy * 0.7, seed + 91)); // bãi biển tô theo ô: cát sáng, mép nước cát ướt
      pos[k * 3] = gx * T - HALF; pos[k * 3 + 1] = h; pos[k * 3 + 2] = gy * T - HALF;
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = gx * 0.5; uv[k * 2 + 1] = gy * 0.5;
    }
    // lượt hai theo độ cao thật của từng đỉnh: sườn dốc lộ đá, thung lũng tối hơn, sống núi sáng hơn,
    // đồng bằng thấp xanh mướt, đáy nước sâu đậm màu dần
    {
      const H = (i, j) => pos[(clamp(j, 0, V - 1) * V + clamp(i, 0, V - 1)) * 3 + 1];
      const cliff = new THREE.Color(0x7d7564), lush = new THREE.Color(0x4f9a3c), deepBed = new THREE.Color(0x2c5566), cc = new THREE.Color();
      for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
        const k = j * V + i, h = H(i, j), gx = i - BORDER, gy = j - BORDER;
        const sx = (H(i + 1, j) - H(i - 1, j)) / (2 * T), sz = (H(i, j + 1) - H(i, j - 1)) / (2 * T), slope = Math.hypot(sx, sz);
        const conc = (H(i + 1, j) + H(i - 1, j) + H(i, j + 1) + H(i, j - 1)) / 4 - h; // > 0: lòng chảo / thung lũng
        cc.setRGB(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]);
        if (h < -0.5) cc.lerp(deepBed, clamp((-h - 0.5) / 3, 0, 0.7));
        else if (!isWater(gx, gy) && !isWater(gx - 1, gy - 1)) {
          if (h < 3 && slope < 0.15) cc.lerp(lush, 0.25 * (1 - h / 3));
          cc.lerp(cliff, clamp((slope - 0.45) / 0.6, 0, 0.85)); // vách dốc lộ đá
        }
        const shade = clamp(1 - conc * 0.035, 0.72, 1.12); // tối ở thung lũng, sáng nhẹ ở sống núi
        col[k * 3] = clamp(cc.r * shade, 0, 1); col[k * 3 + 1] = clamp(cc.g * shade, 0, 1); col[k * 3 + 2] = clamp(cc.b * shade, 0, 1);
      }
    }
    this.terrPos = pos;
    const g = this._gridGeometry(W, pos, uv);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, trenchCut(new THREE.MeshStandardMaterial({ vertexColors: true, map: this.noiseTex || (this.noiseTex = noiseTexture()), roughness: 1 })));
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

  /** Viền phần đất của thành phố (nay là cả bản đồ: chỉ còn viền mép bản đồ). */
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
          if ((horiz ? tx * LAND + k + 1 : ty * LAND + k + 1) > N || (horiz ? ty : tx) * LAND > N) break; // bản đồ không chia hết cho ô đất: bỏ phần thừa
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
        } else if (c.fishery && c.fishery[i]) { [r, g, b] = ZCOL[12]; a = this.ovStrong ? 150 : 0; } // ngư trường trên mặt nước: chỉ tô khi đang cầm công cụ quy hoạch (lúc thường có phao đánh dấu)
        else if (this.ovStrong && c.acc[i] && !c.occ[i] && !c.steep[i]) { r = g = b = 255; a = 50; } // ô quy hoạch tự sinh hai bên đường
      } else if (mode === 'roadgrid') {
        // đang vẽ đường: lưới ô xây nhà dọc đường (như vùng quy hoạch của Cities: Skylines), ô nhà đã có tô theo màu khu, dải đất bỏ sót tô hồng
        const z = c.zone[i], gap = i ? this._gaps : (this._gaps = landGaps(c));
        if (c.occ[i]) { r = 120; g = 130; b = 150; a = 150; }
        else if (c.road[i] || c.water[i]) a = 0;
        else if (c.level[i]) { const zc = ZCOL[z] || [200, 200, 200]; r = zc[0] * 0.55 + 70; g = zc[1] * 0.55 + 70; b = zc[2] * 0.55 + 80; a = this.hideBld ? 165 : 50; } // nhà đã có: màu khu nhạt đi để ô bỏ sót nổi lên
        else if (c.acc[i] && !c.steep[i]) { if (z) { [r, g, b] = ZCOL[z]; a = 120; } else { r = g = b = 255; a = c.acc[i] === 1 ? 85 : 55; } }
        else if (gap[i]) { r = 255; g = 60; b = 150; a = 175; } // đất sát đường mà không có mặt tiền: bị bỏ sót
      } else if (mode === 'resource') {
        // tài nguyên: đang cầm khu chuyên biệt thì ô cạnh đường đặt được sáng hẳn lên
        const z = c.zone[i], rs = c.res[i];
        if (z && !c.water[i]) { [r, g, b] = ZCOL[z]; a = c.level[i] ? 90 : 170; }
        else if (c.fishery && c.fishery[i]) { [r, g, b] = ZCOL[12]; a = 170; }
        else if (this.ovZone && c.acc[i] && !c.occ[i] && !c.steep[i] && hasResource(c, i, this.ovZone)) { r = g = b = 255; a = 150; }
        else if (rs) { [r, g, b] = RESCOL[rs]; a = rs === 5 ? 95 : 135; }
      } else if (mode === 'district') {
        // quận: mỗi quận một màu, viền đậm ở ranh giới, ô trụ sở trắng
        const q = c.dmap ? c.dmap[i] : 255;
        if (q !== 255 && c.dist && c.dist.on) {
          const x = i % N, y = (i / N) | 0;
          [r, g, b] = DCOL[q % DCOL.length];
          const edge = (x + 1 < N && c.dmap[i + 1] !== q) || (y + 1 < N && c.dmap[i + N] !== q) || (x > 0 && c.dmap[i - 1] !== q) || (y > 0 && c.dmap[i - N] !== q);
          a = c.water[i] ? 25 : edge ? 210 : 70; // trụ sở là toà nhà UBND quận thật, không tô riêng
        }
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
    // nút chỉ nối hai nhịp độ cao tuỳ chỉnh (cầu xoắn ốc, cầu nhiều nhịp): mặt cầu chạy liền qua nút, không lùi, không mặt nút giao
    const smooth = (nid) => { const l = c.adj.get(nid); return !!l && l.length === 2 && l.every((id) => c.edges.get(id).ch); };
    // 1) độ lùi của từng đầu đường tại nút giao + cao độ nút
    const trim = new Map(), nodeY = new Map();
    for (const e of c.edges.values()) trim.set(e.id, [0, 0]);
    const ends = new Map();
    for (const [nid, list] of c.adj) {
      const n = c.nodes.get(nid);
      let y = this.roadY(n.x, n.z);
      for (const [dx, dz] of [[9, 0], [-9, 0], [0, 9], [0, -9], [6, 6], [-6, 6], [6, -6], [-6, -6]]) y = Math.max(y, this.roadY(n.x + dx, n.z + dz));
      y += nodeH(c, nid); // nút trên cao / dưới hầm
      nodeY.set(nid, y);
      const arr = list.map((id) => {
        const e = c.edges.get(id), atA = e.a === nid, p = pointAt(e.pts, e.cum, atA ? Math.min(6, e.len / 2) : Math.max(e.len - 6, e.len / 2));
        const dx = p[0] - n.x, dz = p[1] - n.z, l = Math.hypot(dx, dz) || 1;
        return { e, atA, ox: dx / l, oz: dz / l, ang: Math.atan2(dz, dx), half: ROADS[e.type].w / 2 };
      }).sort((p, q) => p.ang - q.ang);
      ends.set(nid, arr);
      if (arr.length < 2 || smooth(nid)) continue;
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
    this.trims = trim;
    // lòng hầm chui đang mở (đáy thấp hơn mặt đất): khoét mặt đất để thấy đường bên dưới.
    // Gần sông, hồ thì hầm kín (đi ngầm dưới đáy): không khoét, mặt nước giữ nguyên; chỗ chuyển từ hở sang kín có cửa hầm.
    // Mỗi đoạn khoét: [x0, z0, x1, z1, nửa bề rộng, đầu 0 cắt phẳng, đầu 1 cắt phẳng]
    this.trench = [];
    const m4p = new THREE.Matrix4(), qp = new THREE.Quaternion(), vp = new THREE.Vector3(), upP = new THREE.Vector3(0, 1, 0), oneP = new THREE.Vector3(1, 1, 1);
    for (const e of c.edges.values()) {
      if (roadLvl(e.type) >= 0) continue;
      const half = ROADS[e.type].w / 2 + 0.25, wr = tunnelWetR(e.type);
      const state = (s) => { const p = pointAt(e.pts, e.cum, s); return this.edgeLift(e, s) >= -0.3 ? 0 : wetNear(c, p[0], p[1], wr) ? 2 : 1; }; // 0 nông, 1 hở, 2 kín
      // lấy mẫu mỗi 5 m rồi gộp các đoạn gần thẳng hàng: hầm thẳng dài chỉ tốn vài đoạn (uniform có hạn, shader duyệt từng đoạn)
      let run = null, flatA = false, prevS = 0, prevSt = 0;
      const flush = (flatB) => { if (run && run.length > 1) for (let k = 1; k < run.length; k++) this.trench.push([run[k - 1][0], run[k - 1][1], run[k][0], run[k][1], half, k === 1 && flatA, k === run.length - 1 && flatB]); run = null; };
      const portal = (s, into) => { // cửa hầm tại quãng đường s, into = hướng vào phần kín (1: chiều a→b)
        const p = pointAt(e.pts, e.cum, s), dx = p[2] * into, dz = p[3] * into, yR = this.roadY(p[0], p[1]) + this.edgeLift(e, s), Ht = this.roadY(p[0], p[1]) - yR;
        const mouth = clamp(Ht - 1.2, 3.2, 5), w = half * 2;
        st.at(m4p.compose(vp.set(p[0], yR, p[1]), qp.setFromAxisAngle(upP, Math.atan2(dx, dz)), oneP));
        st.box(0, -0.3, 1.6, w + 0.4, mouth + 0.3, 3.2, 0x0b0d10); // lòng hầm tối phía trong
        st.box(0, mouth, 0.35, w + 1.6, Math.max(0.5, Ht + 0.9 - mouth), 0.7, 0xc2bdb1); // tường đầu hầm phía trên miệng
        for (const sd of [-1, 1]) st.box(sd * (half + 0.55), -0.3, 0.35, 1.1, Ht + 1.2, 0.7, 0xb3aea2);
        st.box(0, Ht + 0.9, 0.3, w + 2.6, 0.22, 1, 0x8d887e); // gờ đỉnh
        st.box(0, mouth - 0.05, -0.04, w, 0.4, 0.1, 0xe2b12e); // vạch vàng báo chiều cao
        st.at(null);
      };
      for (let sa = 0; sa <= e.len + 0.01; sa += 5) {
        const s1 = Math.min(sa, e.len), stt = state(s1);
        let cut = s1;
        if (prevSt && stt && prevSt !== stt) { // chỗ chuyển hở ↔ kín: tìm chính xác tới ~0,3 m
          let lo = prevS, hi = s1;
          for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2; if (state(mid) === prevSt) lo = mid; else hi = mid; }
          cut = prevSt === 1 ? lo : hi;
          if (prevSt === 1) {
            const p = pointAt(e.pts, e.cum, cut);
            if (run) { // đầu tròn của đoạn kề trước không được lấn qua cửa hầm: bỏ điểm quá gần
              while (run.length > 1 && Math.hypot(run[run.length - 1][0] - p[0], run[run.length - 1][1] - p[1]) < half + 1) run.pop();
              run.push([p[0], p[1]]);
            }
            flush(true); portal(cut, 1);
          }
          else { portal(cut, -1); const p = pointAt(e.pts, e.cum, cut); run = [[p[0], p[1]]]; flatA = true; }
        }
        prevS = s1; prevSt = stt;
        if (stt !== 1) { if (run) flush(false); continue; }
        const p = pointAt(e.pts, e.cum, s1);
        if (!run) { run = [[p[0], p[1]]]; flatA = false; continue; }
        const n = run.length;
        if (n === 2 && flatA && Math.hypot(run[1][0] - run[0][0], run[1][1] - run[0][1]) < half + 1) { run[1] = [p[0], p[1]]; continue; } // như trên, ở đầu ra khỏi hầm kín
        if (n >= 2) { // bỏ điểm giữa nếu ba điểm gần thẳng hàng (lệch dưới 0,6 m)
          const a = run[n - 2], b = run[n - 1], dx = p[0] - a[0], dz = p[1] - a[1], l = Math.hypot(dx, dz) || 1;
          if (Math.abs((b[0] - a[0]) * dz - (b[1] - a[1]) * dx) / l < 0.6) { run[n - 1] = [p[0], p[1]]; continue; }
        }
        run.push([p[0], p[1]]);
      }
      flush(false);
    }
    const nT = Math.min(MAX_TRENCH, this.trench.length);
    for (let k = 0; k < nT; k++) { const t = this.trench[k]; TRENCH.seg.value[k].set(t[0], t[1], t[2], t[3]); TRENCH.hw.value[k] = t[4] + (t[5] ? 100 : 0) + (t[6] ? 200 : 0); }
    TRENCH.n.value = nT;
    const bx = TRENCH.box.value.set(1e9, 1e9, -1e9, -1e9);
    for (let k = 0; k < nT; k++) { const t = this.trench[k]; bx.set(Math.min(bx.x, t[0], t[2]) - t[4], Math.min(bx.y, t[1], t[3]) - t[4], Math.max(bx.z, t[0], t[2]) + t[4], Math.max(bx.w, t[1], t[3]) + t[4]); }
    for (const e of c.edges.values()) {
      const def = ROADS[e.type], half = def.w / 2, [ra, rb] = trim.get(e.id), ps = this._ribbonPoints(e, ra, rb), tr = tris[e.type];
      const ya = nodeY.get(e.a), yb = nodeY.get(e.b), last = ps.length - 1;
      const high = !!def.elevated;
      const rows = ps.map((p, i) => {
        const rx = -p.tz, rz = p.tx;
        const lift = high ? this.edgeLift(e, p.s) : 0, wl = high ? 0 : this.waterLift(e, p.s); // cầu qua sông vồng lên khỏi mặt nước
        let y = this._crossY(p.x, p.z, rx, rz, half) + lift + wl;
        const da = p.s - ra, db = e.len - rb - p.s; // hoà dần vào cao độ nút giao (nút nối liền hai nhịp độ cao tuỳ chỉnh thì giữ nguyên dốc, không làm phẳng)
        const jA = c.adj.get(e.a).length > 1 && !smooth(e.a), jB = c.adj.get(e.b).length > 1 && !smooth(e.b);
        if (jA && da < 14) y = ya + (y - ya) * (da / 14);
        if (jB && db < 14) y = yb + (y - yb) * Math.max(0, db / 14);
        if (i === 0 && jA) y = ya;
        if (i === last && jB) y = yb;
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
      const spans = high ? [] : this._bridgeSpans(e);
      this._structure(st, e, rows, half, lamps, spans);
      if (spans.length) this._bridges(st, e, rows, half, spans, lamps);
    }
    // 3) nút giao: đa giác vỉa hè + đa giác mặt nhựa
    for (const [nid, arr] of ends) {
      if (arr.length < 2 || smooth(nid)) continue;
      const y = nodeY.get(nid), outer = [], inner = [];
      for (const en of arr) {
        const r = cross.get(en.e.id)[en.atA ? 0 : 1], sg = en.atA ? 1 : -1, half = en.half, ah = ROADS[en.e.type].asphalt / 2;
        for (const side of [-1, 1]) {
          outer.push([r.x + side * sg * r.rx * half, r.z + side * sg * r.rz * half]);
          inner.push([r.x + side * sg * r.rx * ah, r.z + side * sg * r.rz * ah]);
        }
      }
      for (const [raw, col, dy] of [[outer, cW, 0], [inner, cA, 0.05]]) {
        const poly = hull2(raw); // bao lồi: nhánh gần song song (dốc cầu nhập vào đường) không làm đa giác tự cắt
        let mx = 0, mz = 0;
        for (const p of poly) { mx += p[0]; mz += p[1]; }
        const ctr = jt.v(mx / poly.length, y + dy, mz / poly.length, col.r, col.g, col.b);
        const ids = poly.map((p) => jt.v(p[0], y + dy, p[1], col.r, col.g, col.b));
        for (let k = 0; k < ids.length; k++) jt.tri(ctr, ids[k], ids[(k + 1) % ids.length], true);
        const lift = y - this.roadY(mx / poly.length, mz / poly.length);
        if (raw === outer && lift > 1.5) { // nút giao trên cao: thành dầm quanh mép, mặt dưới, một trụ lớn đỡ ở giữa (nếu bên dưới trống)
          const cx = mx / poly.length, cz = mz / poly.length;
          for (let k = 0; k < poly.length; k++) {
            const p0 = poly[k], p1 = poly[(k + 1) % poly.length], ox = (p0[0] + p1[0]) / 2 - cx, oz = (p0[1] + p1[1]) / 2 - cz, ol = Math.hypot(ox, oz) || 1;
            st.poly([[p0[0], y, p0[1]], [p1[0], y, p1[1]], [p1[0], y - 1.15, p1[1]], [p0[0], y - 1.15, p0[1]]], [ox / ol, 0, oz / ol], 0xa8a399);
            st.poly([[p0[0], y - 1.15, p0[1]], [p1[0], y - 1.15, p1[1]], [cx, y - 1.15, cz]], [0, -1, 0], 0x8d887e);
          }
          const gy = Math.max(heightAt(c, cx, cz), -3.2), any = arr.find((en) => roadLvl(en.e.type) !== 0);
          if (y - 1.2 - gy > 1.2 && !(any && this._groundRoadAt(cx, cz, 1.6, any.e))) st.cyl(cx, gy - 0.5, cz, 1.6, 1.4, y - 1.15 - gy + 0.5, 0x9a968e, 10);
        }
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
      if (arr.length < 3 || n.rb || nodeElevated(c, nid) || rampMerge(c, nid)) continue;
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
      // vệt sáng dưới chân từng cột đèn
      const gt = new Tris(false);
      for (const [x, , z, gy] of lamps) {
        const y = gy + 0.16, r = 7.5, q4 = [gt.v(x - r, y, z - r, 0, 0), gt.v(x + r, y, z - r, 1, 0), gt.v(x + r, y, z + r, 1, 1), gt.v(x - r, y, z + r, 0, 1)];
        gt.tri(q4[0], q4[1], q4[2], true); gt.tri(q4[0], q4[2], q4[3], true);
      }
      const gm = new THREE.Mesh(gt.build(), this.glowMat); gm.frustumCulled = false; gm.renderOrder = 2; this.roadGroup.add(gm);
    }
  }

  /** Cổng ra vào thành phố ở mép bản đồ (nơi đường cao tốc từ ngoài đi vào): hai trụ, xà ngang, biển chỉ đường. */
  _gate(c) {
    if (this.gateGroup) { this.scene.remove(this.gateGroup); this.gateGroup.traverse((o) => o.geometry && o.geometry.dispose()); }
    this.gateGroup = null;
    if (!c.entry) return;
    const g = new GB(), x = c.entry.x, z = Math.max(c.entry.z, -HALF + 2), y = Math.max(heightAt(c, x, z), 0);
    for (const sd of [-1, 1]) { g.box(x + sd * 7.5, y, z, 1.2, 9, 1.2, 0xd8d4cc); g.box(x + sd * 7.5, y + 9, z, 1.6, 0.6, 1.6, 0x8d887e); }
    g.box(x, y + 7.2, z, 16.2, 1.8, 0.6, 0x1f6f3f); // biển xanh như biển chỉ đường cao tốc
    g.box(x, y + 7.45, z + 0.32, 13, 0.25, 0.02, 0xffffff); g.box(x, y + 6.85, z + 0.32, 9, 0.18, 0.02, 0xffffff);
    const grp = new THREE.Group(), mesh = new THREE.Mesh(g.build(), this.matBuilding);
    mesh.castShadow = true; grp.add(mesh);
    // cột sáng nhấp nháy khi mất đường nối ra ngoài
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 60, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc24a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(x, y + 30, z); beam.visible = false; grp.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9, 11, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc24a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.set(x, y + 0.6, z); ring.visible = false; grp.add(ring);
    this.gateBeam = beam; this.gateRing = ring; this.gateGroup = grp;
    this.scene.add(grp);
  }

  _gatePulse(dt) {
    if (!this.gateBeam) return;
    this._gateT = (this._gateT || 0) + dt;
    if (this._gateT < 0.5 && this.gateBeam.visible) { const k = 0.5 + 0.5 * Math.sin(this.time * 4); this.gateBeam.material.opacity = 0.15 + 0.3 * k; this.gateRing.scale.setScalar(0.9 + 0.2 * k); return; }
    this._gateT = 0;
    const lost = !outsidePositions(this.city).length; // kiểm tra nửa giây một lần
    this.gateBeam.visible = this.gateRing.visible = lost;
  }

  /** Tàu khách / tàu hàng chạy theo tuyến shipRoutes: cập bến, chạy, cập bến bên kia (hoặc ra ngoài bản đồ) rồi quay về. */
  _ships(simDt) {
    const c = this.city;
    if (!this.ships) {
      this.ships = shipRoutes(c).map((r, k) => {
        const cum = [0];
        for (let i = 1; i < r.path.length; i++) cum.push(cum[i - 1] + Math.hypot(r.path[i][0] - r.path[i - 1][0], r.path[i][1] - r.path[i - 1][1]));
        return { ...r, cum, len: cum[cum.length - 1], speed: r.type === 'port' ? 6 : 10, dwell: r.type === 'port' ? 14 : 8, off: hash2(r.from.x, r.from.y, k) * 60 };
      });
    }
    this.shipT += simDt;
    for (const mesh of this.shipMeshes) mesh.count = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), n = [0, 0];
    const at = (sh, d, out) => { // điểm trên tuyến cách bến d đơn vị
      d = clamp(d, 0, sh.len);
      let i = 1; while (i < sh.cum.length - 1 && sh.cum[i] < d) i++;
      const a = sh.path[i - 1], b = sh.path[i], f = (d - sh.cum[i - 1]) / (sh.cum[i] - sh.cum[i - 1] || 1);
      out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f;
    };
    const a = [0, 0], b = [0, 0];
    for (const sh of this.ships) {
      const run = sh.len / sh.speed, cyc = 2 * (run + sh.dwell);
      let t = (this.shipT + sh.off) % cyc, d = 0, dir = 1; // đón khách -> chạy đi -> cập bến bên kia -> chạy về
      if (t >= sh.dwell) {
        t -= sh.dwell;
        if (t < run) d = sh.len * (0.5 - 0.5 * Math.cos((Math.PI * t) / run)); // tăng tốc rời bến, giảm tốc cập bến
        else if ((t -= run) < sh.dwell) { d = sh.len; dir = -1; }
        else { t -= sh.dwell; d = sh.len * (0.5 + 0.5 * Math.cos((Math.PI * t) / run)); dir = -1; }
      }
      if (sh.out && d > sh.len - 30) continue; // đã ra ngoài bản đồ
      at(sh, d, n); at(sh, d - 6 * dir, a); at(sh, d + 6 * dir, b);
      let hx = b[0] - a[0], hz = b[1] - a[1];
      if (Math.abs(hx) + Math.abs(hz) < 1e-3) { at(sh, 0, a); at(sh, 8, b); hx = b[0] - a[0]; hz = b[1] - a[1]; }
      const yaw = Math.atan2(hx, hz), bob = Math.sin(this.time * 1.3 + sh.off) * 0.12;
      q.setFromAxisAngle(up, yaw); p.set(n[0], WATER_Y + bob, n[1]);
      const mesh = this.shipMeshes[1], cnt = mesh.count;
      if (cnt >= mesh.userData.cap) continue;
      mesh.setMatrixAt(cnt, m.compose(p, q, sc)); mesh.count = cnt + 1;
    }
    // tàu khách: vị trí lấy từ mô phỏng (chở khách thật)
    const fm = this.shipMeshes[0];
    for (const line of c.ferries || []) for (const sl of line.veh) {
      if (line.out && sl.s > line.len - 30) continue; // đã ra ngoài bản đồ
      if (fm.count >= fm.userData.cap) break;
      const [x, z, hx, hz] = ferryPoint(line, sl), bob = Math.sin(this.time * 1.3 + x * 0.01) * 0.12;
      q.setFromAxisAngle(up, Math.atan2(hx, hz)); p.set(x, WATER_Y + bob, z);
      fm.setMatrixAt(fm.count++, m.compose(p, q, sc));
    }
    this._ferryLines();
    for (const mesh of this.shipMeshes) { mesh.instanceMatrix.needsUpdate = true; }
  }

  /** Vạch tuyến tàu khách mờ trên mặt nước, dựng lại khi tuyến đổi. */
  _ferryLines() {
    const c = this.city, key = (c.ferries || []).map((l) => l.key + ':' + l.wpath.length + ':' + Math.round(l.len)).join('|');
    if (key === this._ferryKey) return;
    this._ferryKey = key;
    if (this.ferryLineObj) { this.scene.remove(this.ferryLineObj); this.ferryLineObj.geometry.dispose(); }
    const pts = [];
    for (const l of c.ferries || []) for (let k = 1; k < l.wpath.length; k++) pts.push(l.wpath[k - 1][0], WATER_Y + 0.6, l.wpath[k - 1][1], l.wpath[k][0], WATER_Y + 0.6, l.wpath[k][1]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.ferryLineMat = this.ferryLineMat || new THREE.LineDashedMaterial({ color: 0xeaf6ff, dashSize: 5, gapSize: 3, transparent: true, opacity: 0.8, depthWrite: false });
    this.ferryLineObj = new THREE.LineSegments(geo, this.ferryLineMat); this.ferryLineObj.computeLineDistances(); this.ferryLineObj.frustumCulled = false; this.ferryLineObj.renderOrder = 10; // vẽ sau mặt nước trong suốt
    this.scene.add(this.ferryLineObj);
  }

  /** Đổi phong cách nhà cửa / phố xá: dựng lại mọi mô hình nhà, cây, đường. */
  restyle() {
    for (const k in this.growMeshes) { const mm = this.growMeshes[k]; this.scene.remove(mm); mm.dispose(); }
    this.growMeshes = {};
    Object.assign(this.city.dirty, { buildings: true, trees: true, roads: true });
  }

  /**
   * Trụ cầu của đoạn e đặt ở (x, z), tay trụ rộng reach: có đè lên mặt đường / nút giao mặt đất bên dưới không.
   * Đại lộ chạy dọc ngay dưới cầu thì trụ đứng ở dải phân cách giữa, không tính là đè.
   */
  _groundRoadAt(x, z, reach, e) {
    const c = this.city, pe = pointAt(e.pts, e.cum, nearestOnEdge(e, x, z).along);
    for (const n of c.nodes.values()) {
      if (Math.abs(n.x - x) > 40 || Math.abs(n.z - z) > 40 || nodeH(c, n.id) !== 0) continue;
      const deg = (c.adj.get(n.id) || []).length;
      if (deg >= 3 && Math.hypot(n.x - x, n.z - z) < 14 + reach) return true; // nút giao
    }
    const mine = roadLvl(e.type), myH = e.ch ? liftAt(c, e, nearestOnEdge(e, x, z).along) : 0;
    for (const o of c.edges.values()) {
      const lo = roadLvl(o.type);
      if (o === e || (!e.ch && !o.ch && lo >= mine)) continue; // chỉ xét đường tầng thấp hơn: mặt đất, hầm, cầu tầng dưới
      const r = nearestOnEdge(o, x, z), hw = ROADS[o.type].w / 2 + (lo < 0 ? 0.6 : 0); // hầm: tính cả tường chắn
      if (r.d > hw + reach) continue;
      const oh = lo === 0 ? 0 : liftAt(c, o, r.along);
      if ((e.ch || o.ch) && oh >= (e.ch ? myH : liftAt(c, e, nearestOnEdge(e, x, z).along)) - 2) continue; // độ cao tuỳ chỉnh: chỉ xét mặt đường thấp hơn hẳn
      if (lo > 0 && oh < 1) continue; // chân dốc cầu tầng dưới đã sát đất: trụ không vướng
      const po = pointAt(o.pts, o.cum, r.along);
      if (lo === 0 && ROADS[o.type].lanes >= 2 && r.d < 1.5 && Math.abs(pe[2] * po[3] - pe[3] * po[2]) < 0.42) continue; // dải phân cách giữa đại lộ
      return lo > 0 && oh > 1.5 ? 'deck' : true; // 'deck': bên dưới là mặt cầu khác (vòng xoắn ốc dưới)
    }
    return false;
  }

  /**
   * Chuyến bay / tàu nước ngoài đang tới (c.intl.sched): máy bay từ ngoài bản đồ bay ngang qua thành phố, vòng vào hướng
   * đường băng, hạ độ cao, chạm bánh và giảm tốc đúng lúc mô phỏng tính là đã đáp; tàu chạy từ biển vào bến, neo rồi ra khơi.
   */
  _intl() {
    const c = this.city, it = c.intl;
    if (!this.intlObj) this.intlObj = new Map();
    const live = new Set(), now = simTime(c);
    for (const e of it ? it.sched : []) {
      const s = c.services.find((v) => v.uid === e.uid);
      if (!s) continue;
      let o = this.intlObj.get(e.id);
      if (!o) {
        const LIV = [0xd0342c, 0x2c5aa0, 0x2f8f5a, 0xe6a01e, 0x6a3d8a, 0x1f8a8a];
        const geo = e.kind === 'plane' ? planeGeometry(LIV[e.id % LIV.length]) : (this._linerGeo || (this._linerGeo = shipGeometry(0).clone().scale(1.7, 1.7, 1.7)));
        o = new THREE.Mesh(geo, this.vehMat); o.castShadow = true; o.frustumCulled = false; o.userData.own = e.kind === 'plane';
        this.scene.add(o); this.intlObj.set(e.id, o);
      }
      live.add(e.id);
      const u = (now - e.t0) / (e.t1 - e.t0);
      o.visible = e.kind === 'plane' ? this._intlPlane(o, e, s, u) : this._intlShip(o, e, now);
    }
    for (const [id, o] of this.intlObj) if (!live.has(id)) { this.scene.remove(o); if (o.userData.own) o.geometry.dispose(); this.intlObj.delete(id); }
  }

  _intlPlane(o, e, s, u) {
    if (u < 0 || u > 1.15) return false;
    const def = SERVICES[s.type], r = ROT[s.dir & 3], cr = Math.cos(r), sr = Math.sin(r);
    const cx = (s.x + def.size / 2) * T - HALF, cz = (s.y + def.size / 2) * T - HALF, gy = this._padY(s.x, s.y, def.size) + 0.2;
    const W = (lx, lz) => [cx + lx * cr + lz * sr, cz - lx * sr + lz * cr]; // toạ độ trong lô sân bay -> thế giới
    const RW = RUNWAY[s.type] || RUNWAY.airport, RZ = RW.rz, dir = [cr, -sr]; // hướng đường băng (+x của lô)
    const fin = W(-200, RZ), td = W(RW.td, RZ), stop = W(RW.stop, RZ);
    // điểm xuất phát ngoài bản đồ, phía bên kia thành phố so với sân bay: máy bay bay ngang qua trung tâm
    const a0 = Math.atan2(-cz, -cx) + (e.ang || 0), R = HALF + 300;
    const P0 = [Math.cos(a0) * R, Math.sin(a0) * R], C = [fin[0] - dir[0] * 260, fin[1] - dir[1] * 260];
    let x, z, y, hx, hz, pitch = 0, roll = 0;
    if (u < 0.62) { // bay vào: đường cong bậc hai, cuối đường thẳng hàng với đường băng
      const t = u / 0.62, m = 1 - t;
      x = m * m * P0[0] + 2 * m * t * C[0] + t * t * fin[0]; z = m * m * P0[1] + 2 * m * t * C[1] + t * t * fin[1];
      hx = 2 * m * (C[0] - P0[0]) + 2 * t * (fin[0] - C[0]); hz = 2 * m * (C[1] - P0[1]) + 2 * t * (fin[1] - C[1]);
      y = gy + 110 - 62 * t; pitch = 0.02;
      // nghiêng cánh khi vòng: theo độ cong của đường bay
      const ax = 2 * (fin[0] - 2 * C[0] + P0[0]), az = 2 * (fin[1] - 2 * C[1] + P0[1]), sp = Math.hypot(hx, hz) || 1;
      roll = clamp(-((hx * az - hz * ax) / (sp * sp * sp)) * 260, -0.45, 0.45);
    } else if (u < 0.88) { // hạ cánh: trượt xuống theo đường băng
      const t = (u - 0.62) / 0.26, k = t * t * (3 - 2 * t);
      x = fin[0] + (td[0] - fin[0]) * t; z = fin[1] + (td[1] - fin[1]) * t; hx = dir[0]; hz = dir[1];
      y = gy + 48 * (1 - k); pitch = t > 0.8 ? -0.12 : -0.05;
    } else { // chạm bánh, giảm tốc tới cuối đường băng rồi rẽ vào sân đỗ (khuất sau 1 giờ)
      const t = Math.min(1, (u - 0.88) / 0.12), k = 1 - (1 - t) * (1 - t);
      x = td[0] + (stop[0] - td[0]) * k; z = td[1] + (stop[1] - td[1]) * k; hx = dir[0]; hz = dir[1]; y = gy;
      if (u > 1) { const w = W(RW.stop, RZ + RW.exit * Math.min(1, (u - 1) / 0.1)); x = w[0]; z = w[1]; hx = sr; hz = cr; }
    }
    o.position.set(x, y, z); o.rotation.set(pitch, Math.atan2(hx, hz), roll, 'YXZ');
    return true;
  }

  _intlShip(o, e, now) {
    const P = e.path, H = HOUR_SEC;
    if (!this._pathLen) this._pathLen = new WeakMap();
    let cum = this._pathLen.get(P);
    if (!cum) { cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); this._pathLen.set(P, cum); }
    const L = cum[cum.length - 1];
    let d, back = false; // d = khoảng cách từ bến
    if (now < e.t1) { const t = (now - e.t0) / (e.t1 - e.t0); d = L * (1 - (1 - (1 - t) * (1 - t))); } // vào: giảm tốc dần khi gần bến
    else if (now < e.t1 + DOCK_H * H) d = 0;
    else { const t = (now - e.t1 - DOCK_H * H) / (SAIL_H * H); if (t > 1) return false; d = L * t * t; back = true; }
    const at = (dd) => { dd = clamp(dd, 0, L); let i = 1; while (i < cum.length - 1 && cum[i] < dd) i++; const a = P[i - 1], b = P[i], f = (dd - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
    const p = at(d), q0 = at(d - 8), q1 = at(d + 8);
    let hx = q1[0] - q0[0], hz = q1[1] - q0[1]; // mũi hướng ra biển
    if (!back) { hx = -hx; hz = -hz; }
    if (Math.abs(hx) + Math.abs(hz) < 1e-3) { const r = at(10); hx = p[0] - r[0]; hz = p[1] - r[1]; }
    o.position.set(p[0], WATER_Y + Math.sin(this.time * 1.1 + e.id) * 0.12, p[1]); o.rotation.set(0, Math.atan2(hx, hz), 0);
    return true;
  }

  /**
   * Trang trí tô theo ô: nền cỏ (thảm cỏ, quanh gốc cây, bồn hoa) và lối đi lát gạch phủ sát mặt đất; bồn hoa, ghế đá, đèn,
   * thùng rác dựng 3D. Lối đi bộ nối sang ô lối đi bên cạnh và ra đường. Dựng luôn lộ trình cho người đi dạo.
   */
  _decor() {
    const c = this.city;
    for (const k of ['decorFlat', 'decorMesh']) if (this[k]) { this.scene.remove(this[k]); this[k].geometry.dispose(); this[k] = null; }
    this.strollers = [];
    if (!c.decor || !c.decor.some((v) => v)) return;
    const t = new Tris(true), g = new GB(), col = new THREE.Color(), V = N + 1;
    const D = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? c.decor[y * N + x] : 0);
    const roadAt = (x, y) => x >= 0 && y >= 0 && x < N && y < N && c.road[y * N + x];
    const H = (wx, wz) => heightAt(c, wx, wz) + 0.07;
    // ô phủ cả ô: chia 2×2 cho bám mặt đất, dùng đúng đường chéo của lưới địa hình
    const quad = (x0, z0, x1, z1, rgb, lift = 0) => {
      const S = 2, vs = [];
      for (let b = 0; b <= S; b++) for (let a = 0; a <= S; a++) { const wx = x0 + ((x1 - x0) * a) / S, wz = z0 + ((z1 - z0) * b) / S; vs.push(t.v(wx, H(wx, wz) + lift, wz, rgb[0], rgb[1], rgb[2])); }
      for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) { const p = vs[b * (S + 1) + a], q = p + 1, r = p + S + 1, u = r + 1; t.tri(p, r, q, true); t.tri(q, r, u, true); }
    };
    const shade = (base, x, y, salt, amt = 0.08) => { col.set(base); const k = 1 + (hash2(x, y, salt) - 0.5) * amt * 2; return [col.r * k, col.g * k, col.b * k]; };
    const PAVE = 0xd8ccb0, EDGE = 0x9b8f7a, LAMP = 0x3a3d42;
    for (let i = 0; i < N * N; i++) {
      const dv = c.decor[i];
      if (!dv) continue;
      const x = i % N, y = (i / N) | 0, x0 = x * T - HALF, z0 = y * T - HALF, cx = x0 + T / 2, cz = z0 + T / 2;
      if (dv === 2 || dv === 1) quad(x0, z0, x0 + T, z0 + T, shade(dv === 2 ? 0x6fbf4a : 0x5aa83f, x, y, 301, 0.06)); // thảm cỏ / cỏ dưới gốc cây
      else if (dv === 4) { // bồn hoa: nền cỏ, bồn đất giữa, hoa nhiều màu, viền gạch
        quad(x0, z0, x0 + T, z0 + T, shade(0x67b548, x, y, 303, 0.05));
        quad(cx - 3.6, cz - 3.6, cx + 3.6, cz + 3.6, [0.42, 0.3, 0.2], 0.08);
        const hy = H(cx, cz), FL = [0xe8414f, 0xf2c14e, 0xf28bb5, 0x9a6be0, 0xffffff, 0xff8a3d];
        for (const s of [-1, 1]) { g.box(cx, hy - 0.05, cz + s * 3.7, 7.6, 0.4, 0.3, 0xc9c1b0); g.box(cx + s * 3.7, hy - 0.05, cz, 0.3, 0.4, 7.6, 0xc9c1b0); }
        for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
          const fx = cx - 2.8 + a * 1.4, fz = cz - 2.8 + b * 1.4, ring = Math.max(Math.abs(a - 2), Math.abs(b - 2));
          const fc = FL[(ring + ((hash2(x, y, 305) * 6) | 0)) % FL.length];
          g.box(fx, H(fx, fz), fz, 0.9, 0.45 + (2 - ring) * 0.12, 0.9, 0x3f7d33); g.box(fx, H(fx, fz) + 0.45 + (2 - ring) * 0.12, fz, 0.8, 0.22, 0.8, fc);
        }
      } else if (dv === 3) { // lối đi bộ: tâm ô + nhánh nối sang ô lối đi / đường kề bên
        const W = 1.9, arms = [];
        quad(x0, z0, x0 + T, z0 + T, shade(0x6fbf4a, x, y, 315, 0.05)); // cỏ nền
        quad(cx - W - 0.25, cz - W - 0.25, cx + W + 0.25, cz + W + 0.25, shade(EDGE, x, y, 307, 0.04), 0.06);
        quad(cx - W, cz - W, cx + W, cz + W, shade(PAVE, x, y, 309, 0.05), 0.12);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (D(x + dx, y + dy) !== 3 && !roadAt(x + dx, y + dy)) continue;
          arms.push([dx, dy]);
          const ax0 = dx > 0 ? cx + W : dx < 0 ? x0 : cx - W, ax1 = dx > 0 ? x0 + T : dx < 0 ? cx - W : cx + W;
          const az0 = dy > 0 ? cz + W : dy < 0 ? z0 : cz - W, az1 = dy > 0 ? z0 + T : dy < 0 ? cz - W : cz + W;
          quad(dx ? ax0 : ax0 - 0.25, dy ? az0 : az0 - 0.25, dx ? ax1 : ax1 + 0.25, dy ? az1 : az1 + 0.25, shade(EDGE, x, y, 311, 0.04), 0.06);
          quad(ax0, az0, ax1, az1, shade(PAVE, x + dx, y + dy, 313, 0.05), 0.12);
        }
        // ghế đá, đèn, thùng rác ở góc không vướng lối
        const r = hash2(x, y, 321), side = arms.some(([dx]) => dx) && !arms.some(([, dy]) => dy) ? [0, 1] : [1, 0], hy = H(cx, cz);
        if (r < 0.45) { const bx = cx + side[0] * (W + 0.9), bz = cz + side[1] * (W + 0.9); g.box(bx, hy, bz, side[0] ? 0.6 : 1.8, 0.45, side[0] ? 1.8 : 0.6, 0x8d8a82); g.box(bx + side[0] * 0.25, hy + 0.45, bz + side[1] * 0.25, side[0] ? 0.12 : 1.8, 0.5, side[0] ? 1.8 : 0.12, 0x8d8a82); }
        if (r > 0.3 && r < 0.75) { const lx = cx - side[0] * (W + 0.7) + side[1] * 1.6, lz = cz - side[1] * (W + 0.7) + side[0] * 1.6; g.cyl(lx, H(lx, lz), lz, 0.09, 0.07, 3.6, LAMP, 6); g.box(lx, H(lx, lz) + 3.6, lz, 0.5, 0.35, 0.5, 0xfff1c4); }
        if (r > 0.85) g.cyl(cx + side[0] * (W + 0.7) - side[1] * 1.8, hy, cz + side[1] * (W + 0.7) - side[0] * 1.8, 0.3, 0.25, 0.8, 0x3d8a5a, 8);
      }
    }
    if (t.i.length) {
      this.decorFlat = new THREE.Mesh(t.build(), this.decorMat || (this.decorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
      this.decorFlat.receiveShadow = true; this.decorFlat.frustumCulled = false;
      this.scene.add(this.decorFlat);
    }
    if (g.build) { const geo = g.build(); if (geo.attributes.position && geo.attributes.position.count) { this.decorMesh = new THREE.Mesh(geo, this.matBuilding); this.decorMesh.castShadow = true; this.decorMesh.receiveShadow = true; this.scene.add(this.decorMesh); } else geo.dispose(); }
    // người đi dạo: mỗi ~3 ô lối đi một người, đi qua lại trên chuỗi ô lối đi liền nhau
    const seen = new Uint8Array(N * N);
    let budget = MAX_STROLL;
    for (let i = 0; i < N * N && budget > 0; i++) {
      if (c.decor[i] !== 3 || seen[i]) continue;
      const comp = [i]; seen[i] = 1;
      for (let h = 0; h < comp.length; h++) { const x = comp[h] % N, y = (comp[h] / N) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (D(x + dx, y + dy) === 3 && !seen[(y + dy) * N + x + dx]) { seen[(y + dy) * N + x + dx] = 1; comp.push((y + dy) * N + x + dx); } }
      if (comp.length < 2) continue;
      const n = Math.min(budget, Math.max(1, Math.round(comp.length / 3)));
      for (let k = 0; k < n; k++) {
        const rr = mulberry32(i * 31 + k), route = [comp[(rr() * comp.length) | 0]];
        for (let s2 = 0; s2 < 14; s2++) { // đi ngẫu nhiên, tránh quay đầu ngay
          const cur = route[route.length - 1], x = cur % N, y = (cur / N) | 0, prev = route[route.length - 2];
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => (D(x + dx, y + dy) === 3 ? (y + dy) * N + x + dx : -1)).filter((j) => j >= 0 && j !== prev);
          if (!nb.length) break;
          route.push(nb[(rr() * nb.length) | 0]);
        }
        if (route.length < 2) continue;
        const pts = [];
        for (const j of route) pts.push(cellX(j) + (rr() - 0.5) * 1.6, cellZ(j) + (rr() - 0.5) * 1.6);
        const cum = [0];
        for (let q = 1; q < pts.length / 2; q++) cum.push(cum[q - 1] + Math.hypot(pts[q * 2] - pts[q * 2 - 2], pts[q * 2 + 1] - pts[q * 2 - 1]));
        this.strollers.push({ pts, cum, s: rr() * cum[cum.length - 1], dir: 1, sp: 1.1 + rr() * 0.7, hue: rr() });
        budget--;
      }
    }
  }

  /** Kết cấu dòng chảy N×N: R, G = hướng, B = tốc độ (cho shader mặt nước). */
  _flowTex() {
    if (!this.flowTex || this.flowTex.image.width !== N) {
      this.flowData = new Uint8Array(N * N * 4);
      this.flowTex = new THREE.DataTexture(this.flowData, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
      this.flowTex.magFilter = this.flowTex.minFilter = THREE.LinearFilter;
    }
    return this.flowTex;
  }

  _flowSync() {
    const c = this.city, tex = this._flowTex(), d = this.flowData, f = computeFlow(c);
    this._flowFor = c;
    for (let i = 0; i < N * N; i++) { d[i * 4] = clamp(Math.round((f.dir[i * 2] * 0.5 + 0.5) * 255), 0, 255); d[i * 4 + 1] = clamp(Math.round((f.dir[i * 2 + 1] * 0.5 + 0.5) * 255), 0, 255); d[i * 4 + 2] = clamp(Math.round(f.speed[i] * 230), 0, 255); d[i * 4 + 3] = 255; }
    // mặt nước chung (mực biển) chỉ hiện ở ô nước mực biển và ô đất cao hơn mực biển; ao hồ mực khác và hố trũng khô thì ẩn
    const V = N + 1;
    for (let i = 0; i < N * N; i++) {
      const w = c.wl ? c.wl[i] : (c.water[i] ? WATER_Y : NaN);
      let show;
      if (!Number.isNaN(w)) show = Math.abs(w - WATER_Y) < 0.01;
      else { const x = i % N, y = (i / N) | 0, k = y * V + x; show = Math.min(c.hv[k], c.hv[k + 1], c.hv[k + V], c.hv[k + V + 1]) >= WATER_Y - 0.05; }
      d[i * 4 + 3] = show ? 255 : 0;
    }
    tex.needsUpdate = true;
    if (this.water) { this.water.material.uniforms.tFlow.value = tex; this.water.material.uniforms.uN.value = N; this.water.material.uniforms.uFlowK.value = seasonFlow(c); }
    this._lakes();
  }

  /**
   * Mặt nước ở mực khác mực biển: hồ chứa sau đập, ao hồ đọng trên cao (mỗi mực một tấm nước, cùng shader mặt nước) và dòng
   * nước tràn: từ chỗ tràn của vùng trũng đã đầy, nước chảy xuống dốc theo mặt đất tới vùng thấp hơn (dốc thì thành thác).
   */
  _lakes() {
    const c = this.city;
    if (this.lakeGroup) { this.lakeGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.userData.own) o.material.dispose(); }); this.scene.remove(this.lakeGroup); }
    this.lakeGroup = new THREE.Group(); this.scene.add(this.lakeGroup);
    if (!c.wl) return;
    const byLevel = new Map();
    for (let i = 0; i < N * N; i++) { const w = c.wl[i]; if (Number.isNaN(w) || Math.abs(w - WATER_Y) < 0.01) continue; const k = Math.round(w * 100); if (!byLevel.has(k)) byLevel.set(k, []); byLevel.get(k).push(i); }
    for (const [k, cells] of byLevel) {
      const lvl = k / 100, pos = [];
      for (const i of cells) { const x0 = (i % N) * T - HALF, z0 = ((i / N) | 0) * T - HALF; pos.push(x0, 0, z0, x0, 0, z0 + T, x0 + T, 0, z0, x0 + T, 0, z0, x0, 0, z0 + T, x0 + T, 0, z0 + T); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.Mesh(geo, waterMaterial({ ...this.waterU, uLevel: { value: lvl }, uRes: { value: 1 } }));
      m.position.y = lvl; m.renderOrder = 1; m.frustumCulled = false; m.userData.own = true;
      this.lakeGroup.add(m);
    }
    // dòng tràn: dải nước bám mặt đất dọc đường chảy, vệt nước trôi xuống
    const ws = c.wsolve, t = new Tris(false), wall = new Set();
    for (const s of c.services) if (s.type === 'hydro' && s.dam) for (const i of damSpan(c, s)) wall.add(i);
    if (ws) for (const B of ws.basins) {
      if (!B.full || !B.path || B.path.length < 2 || wall.has(B.spill)) continue; // tràn qua đập: đã có màn nước xả của đập
      const pts = [];
      const src = B.cells.reduce((m, i) => { const d = Math.abs((i % N) - (B.spill % N)) + Math.abs(((i / N) | 0) - ((B.spill / N) | 0)); return d < m.d ? { d, i } : m; }, { d: 1e9, i: B.cells[0] }).i;
      for (const i of [src, ...B.path]) pts.push([cellX(i), cellZ(i)]);
      let v = 0, prev = null;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
        const [x, z] = pts[k], y = (k === 0 ? B.level : Math.max(heightAt(c, x, z), WATER_Y)) + 0.18, w = 1.6;
        if (k) v += Math.hypot(x - pts[k - 1][0], z - pts[k - 1][1]) / 6 + Math.abs(y - prev[2]) / 3;
        const L = t.v(x - (tz / l) * w, y, z + (tx / l) * w, 0, v), R = t.v(x + (tz / l) * w, y, z - (tx / l) * w, 1, v);
        if (prev) { t.tri(prev[0], prev[1], L); t.tri(prev[1], R, L); }
        prev = [L, R, y];
      }
    }
    if (t.i.length) { const m = new THREE.Mesh(t.build(), this._fallMat()); m.renderOrder = 3; m.frustumCulled = false; this.lakeGroup.add(m); }
  }

  /** Bọt loang dưới chân thác / đập: trắng ở gần, mờ dần ra xa (theo v), gợn trôi. */
  _foamMat() {
    if (this.foamMat) return this.foamMat;
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), r = mulberry32(9);
    for (let y = 0; y < S; y++) { const a = Math.pow(1 - y / S, 1.4) * 0.85; for (let x = 0; x < S; x++) { const n = r(); g.fillStyle = `rgba(255,255,255,${(a * (0.55 + n * 0.45)).toFixed(3)})`; g.fillRect(x, y, 1, 1); } }
    this.foamTex = new THREE.CanvasTexture(cv); this.foamTex.wrapS = THREE.RepeatWrapping; this.foamTex.wrapT = THREE.ClampToEdgeWrapping;
    this.foamMat = new THREE.MeshBasicMaterial({ map: this.foamTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    return this.foamMat;
  }

  /** Tia nước: mỗi hạt bắn lên rồi rơi, chết thì sinh lại ở chân thác / đập. */
  _spray(dt) {
    this._sprayRun({ P: this.sprayP, pts: this.sprayPts, list: this.sprays }, dt);
    if (this.fallsSys) this._sprayRun(this.fallsSys, dt);
  }

  /** Tạo hệ hạt tia nước cho danh sách nguồn (chân thác, chân đập), gắn vào group. */
  _sprayMake(list, group, per = 70) {
    const n = list.length * per, pos = new Float32Array(n * 3);
    const P = { n, per, life: new Float32Array(n).map(() => Math.random()), vel: new Float32Array(n * 3) };
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (!this.sprayMat) this.sprayMat = new THREE.PointsMaterial({ color: 0xf4fbff, size: 0.45, transparent: true, opacity: 0.75, depthWrite: false });
    const pts = new THREE.Points(geo, this.sprayMat); pts.frustumCulled = false; group.add(pts);
    return { P, pts, list };
  }

  _sprayRun(sys, dt) {
    const { P, pts, list } = sys;
    if (!P || !pts || !dt) return;
    const pos = pts.geometry.attributes.position.array;
    for (let k = 0; k < P.n; k++) {
      const s = list[(k / P.per) | 0];
      P.life[k] -= dt * 0.9;
      if (P.life[k] <= 0) { // sinh lại: dọc chân màn nước, bắn lên và ra phía hạ lưu
        const along = (Math.random() - 0.5) * s.w;
        pos[k * 3] = s.x + s.ux * along + (Math.random() - 0.5) * 2; pos[k * 3 + 1] = s.y; pos[k * 3 + 2] = s.z + s.uz * along + (Math.random() - 0.5) * 2;
        const sp = 1.5 + Math.random() * 3.5;
        P.vel[k * 3] = s.dx * sp + (Math.random() - 0.5) * 2.5; P.vel[k * 3 + 1] = 2.5 + Math.random() * s.h * 1.1; P.vel[k * 3 + 2] = s.dz * sp + (Math.random() - 0.5) * 2.5;
        P.life[k] = 0.5 + Math.random() * 0.9;
      }
      P.vel[k * 3 + 1] -= 9 * dt;
      pos[k * 3] += P.vel[k * 3] * dt; pos[k * 3 + 1] = Math.max(pos[k * 3 + 1] + P.vel[k * 3 + 1] * dt, s.y - 0.4); pos[k * 3 + 2] += P.vel[k * 3 + 2] * dt;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  }

  /** Vật liệu nước đổ (thác, đập xả): vệt trắng xanh trôi xuống. */
  _fallMat() {
    if (this.fallMat) return this.fallMat;
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), r = mulberry32(5);
    // nền xanh trắng trong, viền hai bên mỏng dần; vệt nước dọc dài ngắn khác nhau
    for (let x = 0; x < S; x++) { const e = Math.min(1, Math.min(x, S - 1 - x) / 7); g.fillStyle = `rgba(178,220,238,${(0.55 * e).toFixed(3)})`; g.fillRect(x, 0, 1, S); }
    for (let k = 0; k < 120; k++) { const x = r() * S, e = Math.min(1, Math.min(x, S - x) / 7), w = 1 + r() * 2.5, a = (0.25 + r() * 0.6) * e; g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.fillRect(x, r() * S, w, 6 + r() * 34); }
    this.fallTex = new THREE.CanvasTexture(cv); this.fallTex.wrapS = THREE.ClampToEdgeWrapping; this.fallTex.wrapT = THREE.RepeatWrapping; this.fallTex.repeat.set(1, 1.5);
    this.fallMat = new THREE.MeshBasicMaterial({ map: this.fallTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    return this.fallMat;
  }

  /** Suối chảy thoải: nước xanh trong, gợn sáng nhỏ trôi theo dòng, mép mờ. */
  _brookMat() {
    if (this.brookMat) return this.brookMat;
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), r = mulberry32(21);
    for (let x = 0; x < S; x++) { const e = Math.min(1, Math.min(x, S - 1 - x) / 10); g.fillStyle = `rgba(60,150,190,${(0.75 * e).toFixed(3)})`; g.fillRect(x, 0, 1, S); }
    for (let k = 0; k < 70; k++) { const x = r() * S, e = Math.min(1, Math.min(x, S - x) / 10); g.fillStyle = `rgba(220,245,255,${((0.25 + r() * 0.4) * e).toFixed(3)})`; g.fillRect(x, r() * S, 2 + r() * 5, 1 + r() * 2); }
    this.brookTex = new THREE.CanvasTexture(cv); this.brookTex.wrapS = THREE.ClampToEdgeWrapping; this.brookTex.wrapT = THREE.RepeatWrapping;
    this.brookMat = new THREE.MeshBasicMaterial({ map: this.brookTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return this.brookMat;
  }

  /** Lớp vệt sáng chồng lên nước đổ: trôi nhanh hơn lớp nền, cộng sáng, tạo cảm giác nước tung bọt khi rơi. */
  _fallMat2() {
    if (this.fallMat2) return this.fallMat2;
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), r = mulberry32(13);
    for (let k = 0; k < 60; k++) { const x = r() * S, e = Math.min(1, Math.min(x, S - x) / 9), y = r() * S, h = 4 + r() * 18; const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${(0.8 * e).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, 1 + r() * 2, h); }
    this.fallTex2 = new THREE.CanvasTexture(cv); this.fallTex2.wrapS = THREE.ClampToEdgeWrapping; this.fallTex2.wrapT = THREE.RepeatWrapping; this.fallTex2.repeat.set(1, 2.2);
    this.fallMat2 = new THREE.MeshBasicMaterial({ map: this.fallTex2, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, opacity: 0.55 });
    return this.fallMat2;
  }

  /** Cầu vồng mờ trong bụi nước chân thác (luôn quay về phía người xem, chỉ ban ngày). */
  _rainbow(x, y, z, r) {
    const geo = new THREE.RingGeometry(r * 0.82, r, 28, 6, 0, Math.PI), col = [], p = geo.attributes.position, cc = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const d = (Math.hypot(p.getX(i), p.getY(i)) - r * 0.82) / (r * 0.18); cc.setHSL(clamp(0.78 - d * 0.78, 0, 0.8), 0.9, 0.6); col.push(cc.r, cc.g, cc.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (!this.rainbowMat) this.rainbowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const m = new THREE.Mesh(geo, this.rainbowMat); m.position.set(x, y, z); m.userData.rainbow = true;
    return m;
  }

  /**
   * Thác nước tô theo ô: mỗi ô chảy xuống ô kề thấp nhất trong vùng. Đoạn thoải: suối nước bám mặt đất; chỗ hụt độ cao:
   * mép thác có đá chắn, màn nước đổ theo đường cong rơi tự do, loe rộng, chân thác bọt trắng, tia nước, bụi nước, cầu vồng;
   * ô thấp nhất: hồ chân thác (mặt nước thật, cùng shader mặt nước). Vách đá dọc hai bên dòng.
   */
  _falls() {
    const c = this.city;
    if (this.fallsGroup) { this.fallsGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.userData.own && o.material) o.material.dispose(); }); this.scene.remove(this.fallsGroup); }
    this.fallsGroup = null; this.fallsSys = null;
    if (!c.falls || !c.falls.some((v) => v)) return;
    const grp = this.fallsGroup = new THREE.Group(); this.scene.add(grp);
    const info = fallsInfo(c), to = info.to, stream = new Tris(false), brook = new Tris(false), foam = new Tris(false), g = new GB(), sprays = [], V = N + 1;
    const mid = (i) => cellMid(c, i), cx = (i) => cellX(i), cz = (i) => cellZ(i);
    const ribbon = (pts, w, v0, tris) => { // dải nước theo các điểm [x, y, z], v tăng theo chiều chảy
      let prev = null, v = v0;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], tx = b[0] - a[0], tz = b[2] - a[2], l = Math.hypot(tx, tz) || 1, ww = Array.isArray(w) ? w[k] : w;
        if (k) v += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]) / 7;
        const L = tris.v(pts[k][0] - (tz / l) * ww / 2, pts[k][1], pts[k][2] + (tx / l) * ww / 2, 0, v), R = tris.v(pts[k][0] + (tz / l) * ww / 2, pts[k][1], pts[k][2] - (tx / l) * ww / 2, 1, v);
        if (prev) { tris.tri(prev[0], prev[1], L); tris.tri(prev[1], R, L); }
        prev = [L, R];
      }
      return v;
    };
    const rr = mulberry32(77);
    for (const f of info.list) {
      for (const i of f.cells) {
        const j = to[i];
        if (j < 0) continue;
        const hi = mid(i), hj = mid(j), drop = hi - hj, x0 = cx(i), z0 = cz(i), x1 = cx(j), z1 = cz(j), dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), W = T * 0.92; // rộng gần cả ô: dải cạnh nhau liền thành một dòng
        if (drop <= 1.5) { // suối: bám mặt đất, nước xanh trong
          const pts = [];
          for (let k = 0; k <= 4; k++) { const t = k / 4, x = x0 + dx * t, z = z0 + dz * t; pts.push([x, Math.max(heightAt(c, x, z), hj) + 0.22, z]); }
          ribbon(pts, W, rr() * 3, brook);
          continue;
        }
        // thác: mép đổ ở rìa ô trên, nước vọt ra rồi rơi theo đường cong xuống ô dưới
        const ux = dx / l, uz = dz / l, lip = [x0 + ux * l * 0.45, hi + 0.25, z0 + uz * l * 0.45], foot = [x1, hj + 0.2, z1];
        ribbon([[x0, hi + 0.22, z0], lip], W, 0, brook); // mặt nước tới mép thác
        const pts = [], ws = [], SEG = 10, out = Math.min(l * 0.5, 2 + Math.sqrt(drop) * 0.9);
        for (let k = 0; k <= SEG; k++) { const t = k / SEG; pts.push([lip[0] + ux * out * Math.sqrt(t) + (foot[0] - lip[0] - ux * out) * t * t, lip[1] + (foot[1] - lip[1]) * t * t, lip[2] + uz * out * Math.sqrt(t) + (foot[2] - lip[2] - uz * out) * t * t]); ws.push(W * (1 + t * 0.35)); }
        ribbon(pts, ws, 0, stream);
        // bọt trắng loang ở chân thác
        const R0 = 1.2, R1 = W * 0.9;
        for (let a = 0; a < 3; a++) { const r0 = R0 + a * (R1 - R0) / 3, r1 = R0 + (a + 1) * (R1 - R0) / 3; for (let k = 0; k < 14; k++) { const a0 = (k / 14) * Math.PI * 2, a1 = ((k + 1) / 14) * Math.PI * 2, y = foot[1] + 0.06; const i0 = foam.v(foot[0] + Math.cos(a0) * r0, y, foot[2] + Math.sin(a0) * r0, 0, a / 3), i1 = foam.v(foot[0] + Math.cos(a1) * r0, y, foot[2] + Math.sin(a1) * r0, 1, a / 3), i2 = foam.v(foot[0] + Math.cos(a1) * r1, y, foot[2] + Math.sin(a1) * r1, 1, (a + 1) / 3), i3 = foam.v(foot[0] + Math.cos(a0) * r1, y, foot[2] + Math.sin(a0) * r1, 0, (a + 1) / 3); foam.tri(i0, i1, i2); foam.tri(i0, i2, i3); } }
        sprays.push({ x: foot[0], y: foot[1], z: foot[2], dx: ux, dz: uz, w: W, ux: -uz, uz: ux, h: Math.min(drop, 7) });
        // đá chắn hai bên mép thác, đá dưới chân
        for (const sg of [-1, 1]) { const bx = lip[0] - uz * sg * (W / 2 + 0.9), bz = lip[2] + ux * sg * (W / 2 + 0.9); g.blob(bx, hi - 0.4, bz, 1.4 + rr(), 1.2 + rr() * 1.2, 1.4 + rr(), 0x7d7a6c, (rr() * 9) | 0, 1, 0.38); }
        for (let k = 0; k < 3; k++) { const a = rr() * Math.PI * 2, rd = W * 0.8 + rr() * 1.5; g.blob(foot[0] + Math.cos(a) * rd, hj - 0.3, foot[2] + Math.sin(a) * rd, 0.8 + rr() * 0.8, 0.6 + rr() * 0.6, 0.8 + rr() * 0.8, 0x6e6b5e, (rr() * 9) | 0, 1, 0.4); }
        // bụi nước, cầu vồng ở thác cao
        for (let k = 0; k < 3; k++) { const o = new THREE.Mesh(this._mistGeo || (this._mistGeo = new THREE.SphereGeometry(1, 10, 8)), this.mistMat || (this.mistMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }))); o.position.set(foot[0] + ux * (k - 1) * 1.6, foot[1] + 0.5 + k * 0.6, foot[2] + uz * (k - 1) * 1.6); o.userData.mist = { r: (2 + Math.min(drop, 8) * 0.3) * (0.7 + k * 0.2), ph: k * 2.1 + rr() * 6 }; grp.add(o); }
        if (drop >= 5) grp.add(this._rainbow(foot[0] + ux * 3, foot[1] + 0.5, foot[2] + uz * 3, 3 + drop * 0.35));
      }
      // vách đá dọc mép vùng thác (ô thác kề ô không phải thác)
      for (const i of f.cells) {
        const x = i % N, y = (i / N) | 0;
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = x + ddx, b = y + ddy;
          if (a >= 0 && b >= 0 && a < N && b < N && c.falls[b * N + a]) continue;
          if (rr() < 0.45) continue;
          const bx = cx(i) + ddx * T * 0.42 + (rr() - 0.5) * 4, bz = cz(i) + ddy * T * 0.42 + (rr() - 0.5) * 4;
          g.blob(bx, heightAt(c, bx, bz) - 0.3, bz, 1 + rr() * 1.3, 0.8 + rr() * 1.6, 1 + rr() * 1.3, rr() < 0.5 ? 0x8b8a78 : 0x7a7466, (rr() * 9) | 0, 1, 0.4);
        }
      }
      // hồ chân thác: mặt nước thật ở mực hơi cao hơn đáy ô
      for (const i of f.pool) {
        const x = i % N, y = (i / N) | 0, k = y * V + x, lvl = Math.min(c.hv[k], c.hv[k + 1], c.hv[k + V], c.hv[k + V + 1]) + 0.55;
        const x0 = x * T - HALF - 2, z0 = y * T - HALF - 2, S2 = T + 4, geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, z0, x0, 0, z0 + S2, x0 + S2, 0, z0, x0 + S2, 0, z0, x0, 0, z0 + S2, x0 + S2, 0, z0 + S2], 3));
        const m = new THREE.Mesh(geo, waterMaterial({ ...this.waterU, uLevel: { value: lvl }, uRes: { value: 2 } })); m.position.y = lvl; m.renderOrder = 1; m.userData.own = true; grp.add(m);
        for (let kk = 0; kk < 6; kk++) { const a = (kk / 6) * Math.PI * 2 + rr(), rd = T * 0.62; g.blob(cx(i) + Math.cos(a) * rd, lvl - 0.6, cz(i) + Math.sin(a) * rd, 1 + rr(), 0.7 + rr() * 0.6, 1 + rr(), 0x8b8a78, (rr() * 9) | 0, 1, 0.4); }
      }
    }
    if (stream.i.length) { const geo = stream.build(); const m = new THREE.Mesh(geo, this._fallMat()); m.renderOrder = 3; m.frustumCulled = false; grp.add(m); const m2 = new THREE.Mesh(geo, this._fallMat2()); m2.renderOrder = 4; m2.frustumCulled = false; grp.add(m2); }
    if (brook.i.length) { const m = new THREE.Mesh(brook.build(), this._brookMat()); m.renderOrder = 2; m.frustumCulled = false; grp.add(m); }
    if (foam.i.length) { const m = new THREE.Mesh(foam.build(), this._foamMat()); m.renderOrder = 3; m.frustumCulled = false; grp.add(m); }
    const rg = g.build(); if (rg.attributes.position.count) { const m = new THREE.Mesh(rg, this.matBuilding); m.castShadow = m.receiveShadow = true; grp.add(m); } else rg.dispose();
    if (sprays.length) this.fallsSys = this._sprayMake(sprays, grp, 90);
  }

  /**
   * Thân đập thuỷ điện chắn ngang sông (bê tông, mặt đập có đường, lan can, cửa xả, nước xả trắng xoá phía hạ lưu)
   * và thác nước (vách đá, dòng nước đổ từ đỉnh, hồ dưới chân, bụi nước).
   */
  _hydro() {
    const c = this.city;
    if (this.hydroGroup) { this.hydroGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.userData.own && o.material) o.material.dispose(); }); this.scene.remove(this.hydroGroup); }
    this.hydroGroup = new THREE.Group(); this.scene.add(this.hydroGroup);
    this.mists = [];
    const g = new GB(), fall = new Tris(false), foam = new Tris(false), pool = new Tris(false), flow = computeFlow(c), CONC = 0xc9c5ba;
    this.sprays = [];
    const quad = (a, b, cc, dd, u0, u1, v0, v1) => { const i0 = fall.v(...a, u0, v0), i1 = fall.v(...b, u1, v0), i2 = fall.v(...cc, u1, v1), i3 = fall.v(...dd, u0, v1); fall.tri(i0, i1, i2); fall.tri(i0, i2, i3); };
    const foamQ = (a, b, cc, dd, v0, v1) => { const i0 = foam.v(...a, 0, v0), i1 = foam.v(...b, 1, v0), i2 = foam.v(...cc, 1, v1), i3 = foam.v(...dd, 0, v1); foam.tri(i0, i1, i2); foam.tri(i0, i2, i3); };
    for (const s of c.services) {
      if (s.build > 0) continue;
      if (s.type === 'hydro' && s.dam && s.dam.cells.length) {
        const cells = s.dam.cells, span = damSpan(c, s), A = span[0], B = span[span.length - 1]; // cả vai đập tựa vào bờ
        const ax = cellX(A), az = cellZ(A), bx = cellX(B), bz = cellZ(B), L0 = Math.hypot(bx - ax, bz - az);
        const ux = L0 ? (bx - ax) / L0 : 1, uz = L0 ? (bz - az) / L0 : 0, L = L0 + T; // dọc thân đập + vai đập
        // phía hạ lưu = phía mặt nước thấp hơn (thân đập là tường nên không có hướng chảy tại chỗ): dò hai bên thân đập
        let fx = -uz, fz = ux;
        { const side = (sg) => { let sum = 0, n = 0; for (const i of cells) for (let k = 1; k <= 3; k++) { const x = (i % N) + Math.round(-uz * sg * k), y = ((i / N) | 0) + Math.round(ux * sg * k); if (x < 0 || y < 0 || x >= N || y >= N) continue; const w = c.wl ? c.wl[y * N + x] : NaN; if (!Number.isNaN(w)) { sum += w; n++; break; } } return n ? sum / n : NaN; };
          const p = side(1), m = side(-1);
          if (!Number.isNaN(p) && !Number.isNaN(m)) { if (m < p) { fx = uz; fz = -ux; } }
          else { let ax = 0, az = 0; for (const i of cells) { ax += flow.dir[i * 2]; az += flow.dir[i * 2 + 1]; } if (ax * fx + az * fz < 0) { fx = -fx; fz = -fz; } } }
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, yaw = Math.atan2(ux, uz);
        const lvl = reservoirLevel(s), top = lvl + 2.2, bed = -3.6, low = WATER_Y;
        const M = new THREE.Matrix4().compose(new THREE.Vector3(mx, 0, mz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
        const lx = new THREE.Vector3(1, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)), side = Math.sign(lx.x * fx + lx.z * fz) || 1; // phía hạ lưu là +x hay -x của khung đập
        const P = (x, y, z) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(M); return [v.x, v.y, v.z]; };
        g.at(M);
        g.box(0, bed, 0, 5, top - bed, L, CONC); // thân đập
        for (let k = 0; k < 4; k++) g.box(side * (3 + k * 1.6), bed, 0, 1.7, (lvl - low) * (1 - k * 0.24) + (low - bed), L - 2, k % 2 ? 0xbcb8ad : 0xc4c0b5); // mặt hạ lưu bậc thoải
        g.box(-side * 2.6, bed, 0, 0.4, lvl - bed - 0.2, L, 0x9a968e); // mặt thượng lưu (đường mực nước)
        g.box(0, top, 0, 5.6, 0.3, L + 0.4, 0x6a6e73); // mặt đường trên đập
        for (const o of [-2.7, 2.7]) g.box(o, top + 0.3, 0, 0.2, 0.9, L, 0xe0dcd2); // lan can
        for (let k = 0; k * 8 < L; k++) { const z = -L / 2 + 4 + k * 8; g.box(-2.7 * side, top + 0.3, z, 0.15, 3.2, 0.15, 0x5b6670); g.box(-2.7 * side, top + 3.5, z, 0.6, 0.3, 0.6, 0xfff1c4); } // đèn
        const W0 = (cells.length - 1) * T, nG = Math.max(1, Math.min(5, Math.floor(W0 / 8) + 1)), GW = 4.6; // cửa xả tràn trên đoạn lòng sông
        const cm = (cellX(cells[0]) + cellX(cells[cells.length - 1])) / 2, cz2 = (cellZ(cells[0]) + cellZ(cells[cells.length - 1])) / 2, off = (cm - mx) * ux + (cz2 - mz) * uz; // giữa lòng sông so với giữa cả đập
        for (let k = 0; k <= nG; k++) { const z = off + (k - nG / 2) * (GW + 1); g.box(0, lvl - 1, z, 5.4, top - lvl + 3.6, 0.9, 0xb5b0a4); } // trụ pin giữa các cửa
        g.box(0, top + 2.6, off, 5.4, 0.5, nG * (GW + 1) + 1, 0x8d897e); // dàn tời
        for (let k = 0; k < nG; k++) {
          const z = off + (k - (nG - 1) / 2) * (GW + 1), w = GW;
          g.box(0, top + 0.6, z, 0.25, 2, w - 0.3, 0x3d4a52); // cửa van kéo lên
          // nước tràn qua ngưỡng: mặt hồ → mép tràn → đổ theo đường cong xuống chân đập → bọt loang ra dòng sông
          const lipX = side * 2.6, crest = lvl - 0.05, fall = crest - low;
          quad(P(-side * 2.6, lvl + 0.02, z - w / 2), P(-side * 2.6, lvl + 0.02, z + w / 2), P(lipX, crest, z + w / 2), P(lipX, crest, z - w / 2), 0, 1, 0, 0.4);
          const SEG = 8, arc = (t) => [lipX + side * (1.2 * Math.sqrt(t) * Math.sqrt(fall) + t * 3.2), crest - fall * t * t];
          for (let j = 0; j < SEG; j++) {
            const t0 = j / SEG, t1 = (j + 1) / SEG, a = arc(t0), b = arc(t1), w0 = w * (1 + t0 * 0.15), w1 = w * (1 + t1 * 0.15);
            quad(P(a[0], a[1], z - w0 / 2), P(a[0], a[1], z + w0 / 2), P(b[0], b[1], z + w1 / 2), P(b[0], b[1], z - w1 / 2), 0, 1, 0.4 + t0 * 2.4, 0.4 + t1 * 2.4);
          }
          const foot = arc(1)[0], fw = w * 1.15;
          for (let j = 0; j < 4; j++) { // bọt loang, mờ dần ra xa hoà vào dòng sông
            const r0 = foot + side * j * 4.5, r1 = foot + side * (j + 1) * 4.5, w0 = fw + j * 1.8, w1 = fw + (j + 1) * 1.8;
            foamQ(P(r0, low + 0.12, z - w0 / 2), P(r0, low + 0.12, z + w0 / 2), P(r1, low + 0.1, z + w1 / 2), P(r1, low + 0.1, z - w1 / 2), j / 4, (j + 1) / 4);
          }
          const sp = P(foot + side * 1.5, low, z);
          this.mists.push({ x: sp[0], z: sp[2], y: low + 1, r: 3.4 });
          this.sprays.push({ x: sp[0], y: low + 0.3, z: sp[2], dx: (P(side, 0, 0)[0] - P(0, 0, 0)[0]), dz: (P(side, 0, 0)[2] - P(0, 0, 0)[2]), w: w, ux, uz, h: Math.min(fall, 6) });
        }
        g.at(null);
      }
      if (s.type === 'waterfall') {
        const { top, bot } = fallGeom(c, s);
        if (!top || !bot || top.h - bot.h < 1) continue;
        const dx = bot.x - top.x, dz = bot.z - top.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, px = -uz, pz = ux, W = 5.5;
        const lip = [top.x + ux * 1.5, top.h + 0.3, top.z + uz * 1.5], foot = [bot.x - ux * 2.5, bot.h + 0.15, bot.z - uz * 2.5];
        // vách đá hai bên và sau dòng thác
        const rr = mulberry32(s.x * 31 + s.y);
        for (let k = 0; k < 9; k++) {
          const f = k / 8, sx = (k % 2 ? 1 : -1) * (W / 2 + 1 + rr() * 1.5), x = lip[0] + (foot[0] - lip[0]) * f + px * sx, z = lip[2] + (foot[2] - lip[2]) * f + pz * sx, y0 = heightAt(c, x, z);
          g.blob ? g.blob(x, y0 + 0.5, z, 1.6 + rr() * 1.2, 1.4 + rr() * 2.2, 1.6 + rr() * 1.2, 0x8b8a78, 1, 0, 0) : g.box(x, y0 - 0.5, z, 2.5, 3, 2.5, 0x8b8a78);
        }
        // dòng suối trên đỉnh chảy tới mép thác
        quad([top.x - ux * 6 - px * W * 0.35, top.h + 0.35, top.z - uz * 6 - pz * W * 0.35], [top.x - ux * 6 + px * W * 0.35, top.h + 0.35, top.z - uz * 6 + pz * W * 0.35], [lip[0] + px * W / 2, lip[1], lip[2] + pz * W / 2], [lip[0] - px * W / 2, lip[1], lip[2] - pz * W / 2], 0, 1, 0, 0.8);
        // thác: vài đoạn uốn cong như parabol rơi tự do, phía dưới loe rộng
        const SEG = 6;
        for (let k = 0; k < SEG; k++) {
          const t0 = k / SEG, t1 = (k + 1) / SEG, at = (t) => { const h = t; return [lip[0] + (foot[0] - lip[0]) * Math.sqrt(h), lip[1] + (foot[1] - lip[1]) * h, lip[2] + (foot[2] - lip[2]) * Math.sqrt(h)]; };
          const p0 = at(t0), p1 = at(t1), w0 = W * (1 + t0 * 0.4), w1 = W * (1 + t1 * 0.4);
          quad([p0[0] - px * w0 / 2, p0[1], p0[2] - pz * w0 / 2], [p0[0] + px * w0 / 2, p0[1], p0[2] + pz * w0 / 2], [p1[0] + px * w1 / 2, p1[1], p1[2] + pz * w1 / 2], [p1[0] - px * w1 / 2, p1[1], p1[2] - pz * w1 / 2], 0, 1, t0 * 3, t1 * 3);
        }
        // hồ dưới chân: mặt nước tròn, bờ đá
        const PR = 5.5, py = foot[1] + 0.1;
        for (let k = 0; k < 18; k++) { const a0 = (k / 18) * Math.PI * 2, a1 = ((k + 1) / 18) * Math.PI * 2; const i0 = pool.v(foot[0], py, foot[2], 0.5, 0.5), i1 = pool.v(foot[0] + Math.cos(a0) * PR, py, foot[2] + Math.sin(a0) * PR, 0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5), i2 = pool.v(foot[0] + Math.cos(a1) * PR, py, foot[2] + Math.sin(a1) * PR, 0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5); pool.tri(i0, i2, i1); }
        for (let j = 0; j < 3; j++) { const r0 = 1 + j * 1.4, r1 = r0 + 1.4; for (let k = 0; k < 12; k++) { const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2; foamQ([foot[0] + Math.cos(a0) * r0, py + 0.03, foot[2] + Math.sin(a0) * r0], [foot[0] + Math.cos(a1) * r0, py + 0.03, foot[2] + Math.sin(a1) * r0], [foot[0] + Math.cos(a1) * r1, py + 0.03, foot[2] + Math.sin(a1) * r1], [foot[0] + Math.cos(a0) * r1, py + 0.03, foot[2] + Math.sin(a0) * r1], j / 3, (j + 1) / 3); } }
        this.sprays.push({ x: foot[0], y: py, z: foot[2], dx: 0, dz: 0, w: 4, ux: 1, uz: 0, h: 3 });
        for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, x = foot[0] + Math.cos(a) * (PR + 0.6), z = foot[2] + Math.sin(a) * (PR + 0.6); g.box(x, heightAt(c, x, z) - 0.3, z, 1.4, 1, 1.4, 0x8b8a78); }
        this.mists.push({ x: foot[0], z: foot[2], y: py + 0.5, r: 4 });
      }
    }
    const geo = g.build();
    if (geo.attributes.position.count) { const m = new THREE.Mesh(geo, this.matBuilding); m.castShadow = m.receiveShadow = true; this.hydroGroup.add(m); } else geo.dispose();
    if (fall.i.length) { const geo = fall.build(), m = new THREE.Mesh(geo, this._fallMat()); m.renderOrder = 3; this.hydroGroup.add(m); const m2 = new THREE.Mesh(geo, this._fallMat2()); m2.renderOrder = 4; this.hydroGroup.add(m2); }
    if (foam.i.length) { const m = new THREE.Mesh(foam.build(), this._foamMat()); m.renderOrder = 3; this.hydroGroup.add(m); }
    if (pool.i.length) { const m = new THREE.Mesh(pool.build(), this.poolMat || (this.poolMat = new THREE.MeshStandardMaterial({ color: 0x3f9fb8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }))); m.renderOrder = 2; this.hydroGroup.add(m); }
    // tia nước li ti văng lên ở chân thác, chân đập
    if (this.sprays.length) {
      const PER = 70, n = this.sprays.length * PER, pos = new Float32Array(n * 3);
      this.sprayP = { n, per: PER, life: new Float32Array(n).map(() => Math.random()), vel: new Float32Array(n * 3) };
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (!this.sprayMat) this.sprayMat = new THREE.PointsMaterial({ color: 0xf4fbff, size: 0.45, transparent: true, opacity: 0.75, depthWrite: false });
      const pts = new THREE.Points(geo, this.sprayMat); pts.frustumCulled = false; pts.userData.spray = true; this.hydroGroup.add(pts); this.sprayPts = pts;
    } else this.sprayPts = null;
    // bụi nước: quả cầu trắng mờ phập phồng
    if (this.mists.length) {
      if (!this.mistMat) this.mistMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
      const sg = new THREE.SphereGeometry(1, 10, 8);
      for (const m of this.mists) for (let k = 0; k < 3; k++) { const o = new THREE.Mesh(sg, this.mistMat); o.position.set(m.x + (k - 1) * 1.8, m.y + k * 0.6, m.z); o.userData.mist = { r: m.r * (0.7 + k * 0.2), ph: k * 2.1 }; this.hydroGroup.add(o); }
    }
  }

  /**
   * Ngư trường: phao cam đánh dấu ranh giới, tàu cá. Số tàu theo cỡ ngư trường và có bến cá gần hay không. Tàu chạy tới
   * chỗ ngẫu nhiên gần đó trong ngư trường, dừng thả lưới, rồi đi tiếp; thỉnh thoảng chạy về cập bến cá rồi ra lại.
   */
  _fishing() {
    const c = this.city;
    this._fishAt = this.time;
    if (!this.boatMesh) {
      const geo = fishBoatGeometry();
      this.boatMesh = this._inst(geo.body, this.matBuilding, 160, false); this.boatMesh.castShadow = true;
      this.boatLamp = this._inst(geo.lamps, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), 160, false);
      this.buoyMesh = this._inst(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 }), 600, false);
      this.boatMesh.count = this.boatLamp.count = this.buoyMesh.count = 0;
    }
    const areas = fisheryAreas(c), prev = this.boats || [], boats = [];
    const wy = (i) => (c.wl && !Number.isNaN(c.wl[i]) ? c.wl[i] : WATER_Y);
    let nb = 0;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    areas.forEach((A, ai) => {
      const want = clamp(Math.round((A.cells.length / 7) * (A.harbors ? 1 : 0.35)), 1, 14);
      for (let k = 0; k < want; k++) {
        const old = prev.find((b) => b.ai === ai && b.k === k && A.cells.includes(b.cell));
        if (old) { old.area = A; boats.push(old); continue; }
        const cell = A.cells[(hash2(ai, k, 5) * A.cells.length) | 0];
        boats.push({ ai, k, area: A, cell, x: cellX(cell), z: cellZ(cell), tx: cellX(cell), tz: cellZ(cell), dwell: hash2(k, ai, 7) * 6, yaw: hash2(ai, k, 9) * 6.28, sp: 3.5 + hash2(k, ai, 11) * 2, home: false });
      }
      // phao: mỗi ô biên của ngư trường (kề ô nước không phải ngư trường) đặt một phao, cách quãng
      for (const i of A.cells) {
        const x = i % N, y = (i / N) | 0;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const a = x + dx, b = y + dy; return a >= 0 && b >= 0 && a < N && b < N && c.water[b * N + a] && !c.fishery[b * N + a]; });
        if (!edge || (x + y) % 2 || nb >= 600) continue;
        p.set(cellX(i) + (hash2(x, y, 3) - 0.5) * 4, wy(i) + 0.15, cellZ(i) + (hash2(x, y, 4) - 0.5) * 4);
        m.compose(p, q.identity(), one); this.buoyMesh.setMatrixAt(nb++, m);
      }
    });
    this.buoyMesh.count = nb; this.buoyMesh.instanceMatrix.needsUpdate = true;
    this.boats = boats;
  }

  _fishBoats(dt) {
    const boats = this.boats;
    if (!boats || !this.boatMesh) return;
    const c = this.city, m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    const h = c.hour % 24, night = h < 5 || h >= 18;
    let n = 0;
    for (const b of boats) {
      const A = b.area;
      if (dt > 0) {
        if (b.dwell > 0) b.dwell -= dt;
        else {
          const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
          if (d < 1.5) { // tới nơi: thả lưới một lúc, rồi chọn chỗ mới gần đó (hoặc về bến cá)
            b.dwell = b.home ? 6 + Math.random() * 6 : 3 + Math.random() * 8;
            const goHome = !b.home && A.docks.length && Math.random() < 0.15;
            const pick = goHome ? A.docks[(Math.random() * A.docks.length) | 0] : (() => { const near = A.cells.filter((i) => Math.abs(cellX(i) - b.x) < 80 && Math.abs(cellZ(i) - b.z) < 80); const list = near.length ? near : A.cells; return list[(Math.random() * list.length) | 0]; })();
            b.home = goHome; b.cell = pick; b.tx = cellX(pick) + (Math.random() - 0.5) * 6; b.tz = cellZ(pick) + (Math.random() - 0.5) * 6;
          } else {
            const want = Math.atan2(dx, dz); let dy = want - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            b.yaw += clamp(dy, -dt * 1.2, dt * 1.2);
            const sp = b.sp * (Math.abs(dy) > 1 ? 0.4 : 1);
            b.x += Math.sin(b.yaw) * sp * dt; b.z += Math.cos(b.yaw) * sp * dt;
          }
        }
      }
      const ci = clamp(Math.floor((b.z + HALF) / T), 0, N - 1) * N + clamp(Math.floor((b.x + HALF) / T), 0, N - 1);
      const y = (c.wl && !Number.isNaN(c.wl[ci]) ? c.wl[ci] : WATER_Y) + Math.sin(this.time * 1.3 + b.k) * 0.12 - 0.05;
      e.set(Math.sin(this.time * 0.9 + b.k * 2) * 0.04, b.yaw, Math.sin(this.time * 1.1 + b.k) * 0.06, 'YXZ');
      p.set(b.x, y, b.z); m.compose(p, q.setFromEuler(e), one);
      this.boatMesh.setMatrixAt(n, m); this.boatLamp.setMatrixAt(n, m); n++;
    }
    this.boatMesh.count = n; this.boatLamp.count = night ? n : 0;
    this.boatMesh.instanceMatrix.needsUpdate = true; this.boatLamp.instanceMatrix.needsUpdate = true;
  }

  _svcSig() { return this.city.services.filter((s) => s.type === 'train').map((s) => `${s.uid}:${s.x},${s.y},${s.dir}`).join('|'); }

  /**
   * Đường ray: nền đá, tà vẹt, hai ray; đắp nền khi ray cao hơn đất, cầu cạn có trụ, qua sông thêm giàn thép;
   * cửa hầm ở chỗ ray chui vào núi; cột điện lưới dọc tuyến; cổng cửa khẩu ở mép bản đồ.
   */
  _rail() {
    const c = this.city;
    this._railSvcSig = this._svcSig();
    if (this.railMesh) { this.scene.remove(this.railMesh); this.railMesh.geometry.dispose(); this.railMesh = null; }
    if (!c.rail) return;
    const show = c.rail.lines.length || c.services.some((s) => s.type === 'train');
    if (!show) return;
    const g = new GB(), BAL = 0x8a8278, SLP = 0x6b5a48, RL = 0x9aa3aa, CONC = 0xb4b0a6, STEEL = 0x6f7f8c, EARTH = 0x86945a;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const ground = (x, z) => heightAt(c, x, z), wet = (x, z) => { const a = Math.floor((x + HALF) / T), b = Math.floor((z + HALF) / T); return a >= 0 && b >= 0 && a < N && b < N && c.water[b * N + a]; };
    const track = (x0, z0, y0, x1, z1, y1) => { // nền đá + tà vẹt + ray giữa hai điểm (y = mặt ray)
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      bar(g, [x0, y0 - 0.55, z0], [x1, y1 - 0.55, z1], 3.6, 0.5, BAL);
      for (const f of [0.15, 0.48, 0.81]) { const x = x0 + dx * f, z = z0 + dz * f, y = y0 + (y1 - y0) * f - 0.22; bar(g, [x - nx * 1.3, y, z - nz * 1.3], [x + nx * 1.3, y, z + nz * 1.3], 0.32, 0.12, SLP); }
      for (const o of [-0.72, 0.72]) bar(g, [x0 + nx * o, y0 - 0.08, z0 + nz * o], [x1 + nx * o, y1 - 0.08, z1 + nz * o], 0.12, 0.15, RL);
      return [nx, nz];
    };
    const portal = (x, z, y, tx, tz) => { // cửa hầm bê tông, lòng hầm tối
      g.at(m4.clone().compose(v3.set(x, y - 0.8, z), q.setFromEuler(e3.set(0, Math.atan2(tx, tz), 0)), one));
      g.box(0, 0, 0, 8.4, 7.8, 1.6, CONC); g.box(0, 7.8, 0, 9, 0.6, 2, 0x9a968e);
      g.box(0, 0, -0.85, 5, 6, 0.2, 0x111316); g.box(0, 0, 0.85, 5, 6, 0.2, 0x111316);
      for (const sx of [-1, 1]) g.box(sx * 5.6, 0, 0.6, 3, 4.5, 0.8, CONC); // tường cánh
      g.at(null);
    };
    for (const l of c.rail.lines) {
      const geo = lineGeo(l), n = geo.n, P = geo.pts, Y = l.ys, K = l.kinds;
      for (let k = 1; k < n; k++) {
        const x0 = P[k * 2 - 2], z0 = P[k * 2 - 1], x1 = P[k * 2], z1 = P[k * 2 + 1], y0 = Y[k - 1], y1 = Y[k];
        const tun = K[k] === 't' && K[k - 1] === 't', br = K[k] === 'b' || K[k - 1] === 'b';
        if (K[k] === 't' && K[k - 1] !== 't') portal(x0, z0, y0, x1 - x0, z1 - z0);
        if (K[k] !== 't' && K[k - 1] === 't') portal(x1, z1, y1, x0 - x1, z0 - z1);
        if (tun) continue;
        const [nx, nz] = track(x0, z0, y0, x1, z1, y1);
        const gm = Math.min(ground(x0, z0), ground(x1, z1)), top = Math.min(y0, y1) - 0.8;
        if (br) {
          bar(g, [x0, (y0 - 0.8) - 0.75, z0], [x1, (y1 - 0.8) - 0.75, z1], 4.4, 1.5, CONC); // dầm cầu
          for (const o of [-2.15, 2.15]) bar(g, [x0 + nx * o, y0 + 0.35, z0 + nz * o], [x1 + nx * o, y1 + 0.35, z1 + nz * o], 0.12, 0.9, 0x8d8a82); // lan can
          const w = wet(x0, z0) || wet(x1, z1);
          if (k % 5 === 0) { const bed = wet(x0, z0) ? -3.4 : ground(x0, z0) - 0.3; g.box(x0, bed, z0, 2, y0 - 2.3 - bed, 2, CONC); g.box(x0, y0 - 2.6, z0, 5, 0.5, 2.4, CONC); } // trụ cầu
          if (w) { // giàn thép trên đoạn qua nước
            for (const o of [-2.3, 2.3]) {
              bar(g, [x0 + nx * o, y0 + 4.6, z0 + nz * o], [x1 + nx * o, y1 + 4.6, z1 + nz * o], 0.35, 0.35, STEEL);
              bar(g, [x0 + nx * o, y0 - 0.6, z0 + nz * o], [x0 + nx * o, y0 + 4.6, z0 + nz * o], 0.3, 0.3, STEEL);
              if (k % 2) bar(g, [x0 + nx * o, y0 - 0.6, z0 + nz * o], [x1 + nx * o, y1 + 4.6, z1 + nz * o], 0.22, 0.22, STEEL); else bar(g, [x0 + nx * o, y0 + 4.6, z0 + nz * o], [x1 + nx * o, y1 - 0.6, z1 + nz * o], 0.22, 0.22, STEEL);
            }
            if (k % 2 === 0) bar(g, [x0 - nx * 2.3, y0 + 4.6, z0 - nz * 2.3], [x0 + nx * 2.3, y0 + 4.6, z0 + nz * 2.3], 0.25, 0.25, STEEL);
          }
        } else if (top - gm > 0.3) { // đắp nền
          const h = top - gm + 0.6;
          bar(g, [x0, top - h / 2 + 0.1, z0], [x1, top - h / 2 + 0.1, z1], 5.2 + Math.min(4, h * 0.8), h, EARTH);
        }
        if (k % 10 === 5) { // cột điện lưới
          const px = x0 + nx * 2.9, pz = z0 + nz * 2.9, by = br ? y0 - 0.8 : Math.min(ground(px, pz), y0 - 0.6);
          g.box(px, by, pz, 0.32, y0 + 6.4 - by, 0.32, 0x7d8890);
          bar(g, [px, y0 + 6, pz], [x0 - nx * 0.6, y0 + 6, z0 - nz * 0.6], 0.16, 0.16, 0x7d8890);
        }
      }
      // dây tiếp xúc
      for (let k = 1; k < n; k++) if (!(l.kinds[k] === 't' && l.kinds[k - 1] === 't')) bar(g, [P[k * 2 - 2], Y[k - 1] + 5.6, P[k * 2 - 1]], [P[k * 2], Y[k] + 5.6, P[k * 2 + 1]], 0.05, 0.05, 0x2a2c30);
    }
    // cửa khẩu: cổng hai tháp, mái, trạm kiểm soát, barie; ray kéo dài ra ngoài mép bản đồ nếu có tuyến tới
    const used = railNet(c).gatesUsed;
    const ends = c.rail.lines.flatMap((l) => { const geo = lineGeo(l), n = geo.n; return [[geo.pts[0], geo.pts[1], l.ys[0]], [geo.pts[(n - 1) * 2], geo.pts[(n - 1) * 2 + 1], l.ys[n - 1]]]; });
    for (const gt of railGates(c)) {
      const yaw = Math.atan2(gt.dir[0], gt.dir[1]), conn = ends.find((e) => Math.hypot(e[0] - gt.x, e[1] - gt.z) < 4), y = conn ? conn[2] - 0.62 : heightAt(c, gt.x + gt.dir[0] * 3, gt.z + gt.dir[1] * 3);
      if (conn) for (let k = 0; k < 10; k++) track(gt.x - gt.dir[0] * k * 6, gt.z - gt.dir[1] * k * 6, conn[2], gt.x - gt.dir[0] * (k + 1) * 6, gt.z - gt.dir[1] * (k + 1) * 6, conn[2]);
      g.at(m4.clone().compose(v3.set(gt.x + gt.dir[0] * 4, y - 0.6, gt.z + gt.dir[1] * 4), q.setFromEuler(e3.set(0, yaw, 0)), one));
      const col = used.has(gt.k) ? 0xd0342c : 0x9a968e;
      for (const sx of [-1, 1]) { g.box(sx * 7, -3, 0, 3.6, 14.5, 4.2, 0xe8dcc0); g.box(sx * 7, 11.5, 0, 4.2, 0.6, 4.8, 0x7d4a3c); g.gable(sx * 7, 12.1, 0, 4.4, 2.2, 5, 0x9a4a36, false, 0xe8dcc0); }
      g.box(0, 8.4, 0, 10.4, 2.8, 4, 0xf1e6cc); g.box(0, 9.2, 2.05, 6, 1.2, 0.1, col); // dầm cổng, băng rôn
      g.box(0, 11.2, 0, 11, 0.4, 4.6, 0x7d4a3c);
      for (const sx of [-1, 1]) { g.cyl(sx * 3.2, 11.6, 1.5, 0.06, 0.06, 3.2, 0xdddddd, 4); g.box(sx * 3.2 + 0.55, 13.6, 1.5, 1.1, 0.7, 0.04, col); } // cột cờ
      g.box(11.5, -0.2, 3, 4.5, 3.2, 3.5, 0xf4efe6); g.gable(11.5, 3, 3, 5, 1.2, 4, 0x2c5aa0, true, 0xf4efe6); g.box(11.5, 1, 4.8, 3, 1, 0.08, 0x2f3b45); // trạm kiểm soát
      g.box(9.2, -0.2, 6, 0.4, 1.3, 0.4, 0x3a3d42); g.box(4.6, 0.9, 6, 9, 0.18, 0.18, 0xd0342c); // barie
      g.at(null);
    }
    const geo = g.build();
    if (!geo.attributes.position.count) { geo.dispose(); return; }
    this.railMesh = new THREE.Mesh(geo, this.matBuilding);
    this.railMesh.castShadow = true; this.railMesh.receiveShadow = true;
    this.scene.add(this.railMesh);
  }

  /** Tàu liên vận chạy trên các tuyến cửa khẩu → ga (theo giờ mô phỏng, dừng khi tạm dừng game). */
  _railTrains() {
    const c = this.city;
    if (!this.trainPool) this.trainPool = { pass: [], freight: [] };
    for (const k of ['pass', 'freight']) for (const set of this.trainPool[k]) for (const m of set) m.visible = false;
    if (!c.rail || !c.rail.lines.length) return;
    const list = trainsAt(c, simTime(c)), used = { pass: 0, freight: 0 };
    for (const tr of list) {
      const key = tr.freight ? 'freight' : 'pass', pool = this.trainPool[key];
      if (!pool[used[key]]) { const set = trainParts(tr.freight).map((pt) => { const m = new THREE.Mesh(pt.geometry, this.matBuilding); m.castShadow = true; m.userData.off = pt.off; this.scene.add(m); return m; }); pool.push(set); }
      const set = pool[used[key]++], R = tr.route;
      for (const m of set) {
        const s = tr.dir > 0 ? tr.s - m.userData.off - 3.3 : tr.s + m.userData.off + 3.3;
        if (s < 0 || s > R.len) continue; // chưa qua cổng cửa khẩu
        let k = 1; while (k < R.cum.length - 1 && R.cum[k] < s) k++;
        const l = R.cum[k] - R.cum[k - 1] || 1, f = clamp((s - R.cum[k - 1]) / l, 0, 1);
        const x0 = R.pts[k * 2 - 2], z0 = R.pts[k * 2 - 1], x1 = R.pts[k * 2], z1 = R.pts[k * 2 + 1];
        const x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f, y = R.ys[k - 1] + (R.ys[k] - R.ys[k - 1]) * f;
        const tx = (x1 - x0) * tr.dir, tz = (z1 - z0) * tr.dir, slope = ((R.ys[k] - R.ys[k - 1]) * tr.dir) / l;
        m.position.set(x, y - 0.07, z);
        m.rotation.set(-Math.atan(slope), Math.atan2(tx, tz), 0, 'YXZ');
        m.visible = true;
      }
    }
  }

  /** Người đi dạo trên lối đi bộ: đi tới cuối chuỗi thì quay lại; ban đêm vắng hơn. */
  _strollers(dt) {
    const list = this.strollers || [], mesh = this.strollMesh;
    if (!list.length) { if (mesh.count) { mesh.count = 0; mesh.instanceMatrix.needsUpdate = true; } return; }
    const h = this.city.hour % 24, night = h < 5 || h >= 22, m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1.25, 1.25, 1.25), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    let n = 0;
    for (let k = 0; k < list.length; k++) {
      const w = list[k], L = w.cum[w.cum.length - 1];
      w.s += w.dir * w.sp * dt;
      if (w.s > L) { w.s = L; w.dir = -1; } else if (w.s < 0) { w.s = 0; w.dir = 1; }
      if (night && k % 4) continue;
      const pt = pointAt(w.pts, w.cum, w.s);
      p.set(pt[0], heightAt(this.city, pt[0], pt[1]) + 0.12, pt[1]);
      q.setFromAxisAngle(up, Math.atan2(pt[2] * w.dir, pt[3] * w.dir));
      m.compose(p, q, sc);
      mesh.setMatrixAt(n, m); mesh.setColorAt(n++, col.setHSL(w.hue, 0.5, 0.55));
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Đồ trên bãi biển tô theo ô: dù, ghế nằm, khăn, chòi cứu hộ, quán nước, lưới bóng chuyền, dừa, phao bơi. */
  _beachProps() {
    const c = this.city;
    if (this.beachMesh) { this.scene.remove(this.beachMesh); this.beachMesh.geometry.dispose(); this.beachMesh = null; }
    if (!c.beach || !c.beach.some((v) => v)) return;
    const g = new GB(), UM = [0xd0342c, 0x2f8fd0, 0xf2c14e, 0x2aa37a, 0xe8894a, 0xffffff];
    let n = 0;
    for (let i = 0; i < N * N; i++) {
      if (!c.beach[i]) continue;
      const x = i % N, y = (i / N) | 0, cx = cellX(i), cz = cellZ(i), r = hash2(x, y, 401), r2 = hash2(x, y, 403);
      const H = (dx, dz) => heightAt(c, cx + dx, cz + dz);
      // hướng ra biển: ô nước gần nhất
      let sx = 0, sz = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < N && b < N && c.water[b * N + a]) { sx += dx; sz += dy; } }
      const yaw = Math.atan2(sx, sz), shore = c.water.some ? [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const a = x + dx, b = y + dy; return a >= 0 && b >= 0 && a < N && b < N && c.water[b * N + a]; }) : false;
      g.at(new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(yaw)));
      const y0 = H(0, 0);
      if (r < 0.55) { // dù và 2 ghế nằm, khăn
        const ox = (r2 - 0.5) * 4, oz = (hash2(x, y, 405) - 0.5) * 3, col = UM[(r * 97 | 0) % UM.length];
        g.cyl(ox, y0, oz, 0.06, 0.06, 2.5, 0xeeeeee, 4); g.cyl(ox, y0 + 2.2, oz, 1.7, 0.05, 0.6, col, 8, col);
        for (const s of [-0.8, 0.8]) { g.box(ox + s, y0 + 0.25, oz + 0.9, 0.6, 0.12, 1.7, 0xf4f1ea); g.at(new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeTranslation(ox + s, y0 + 0.45, oz + 0.15).multiply(new THREE.Matrix4().makeRotationX(-0.6)))).box(0, 0, 0, 0.6, 0.08, 0.7, 0xf4f1ea).at(new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(yaw))); }
        if (r2 > 0.5) g.box(ox - 2, y0 + 0.02, oz + 1, 0.9, 0.03, 1.8, UM[(r2 * 53 | 0) % UM.length]);
      } else if (!shore && r < 0.68) { // dừa (phía trong bãi)
        g.cyl(0.6, y0, 0.4, 0.22, 0.15, 6, 0x8a6a45, 6);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.at(new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeTranslation(0.6, y0 + 6, 0.4)).multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeRotationX(0.45))).box(0, 0, 1.2, 0.6, 0.06, 2.4, k % 2 ? 0x4f9440 : 0x5fa848).at(null); }
      }
      g.at(new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(yaw)));
      const k = n++;
      if (shore && k % 23 === 3) { // chòi cứu hộ trên cao, cờ đỏ
        for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) g.box(dx, y0, dz - 2, 0.15, 2.6, 0.15, 0xffffff);
        g.box(0, y0 + 2.6, -2, 2, 0.15, 2, 0xd0342c); g.box(0, y0 + 2.75, -2, 1.8, 1.2, 1.8, 0xf4f1ea); g.gable(0, y0 + 3.95, -2, 2.2, 0.7, 2.2, 0xd0342c);
        g.cyl(1.2, y0 + 2.75, -2.8, 0.04, 0.04, 2, 0x999999, 4); g.box(1.5, y0 + 4.3, -2.8, 0.6, 0.4, 0.04, 0xd0342c);
      } else if (!shore && k % 31 === 7) { // quán nước mái lá
        g.box(0, y0, 2, 3.4, 1.1, 1.4, 0x8a6a45); g.box(0, y0 + 1.1, 2, 3.6, 0.1, 1.6, 0xd9ca94);
        for (const dx of [-1.6, 1.6]) g.cyl(dx, y0, 1.4, 0.07, 0.07, 2.6, 0x6b4a2f, 4);
        g.gable(0, y0 + 2.6, 1.8, 4.2, 0.9, 2.6, 0xc9a85a, true, 0xc9a85a);
        for (const dx of [-1.2, 0, 1.2]) g.box(dx, y0, 3.6, 0.4, 0.45, 0.4, 0x2f8fd0);
      } else if (k % 41 === 11) { // lưới bóng chuyền
        for (const dx of [-3.5, 3.5]) g.cyl(dx, y0, 0, 0.06, 0.06, 2.4, 0xeeeeee, 4);
        g.box(0, y0 + 1.6, 0, 7, 0.8, 0.04, 0xf4f4f4);
      } else if (shore && k % 9 === 5) g.cyl(0, y0 + 0.05, -3.5, 0.5, 0.5, 0.15, 0xe8894a, 10); // phao bơi
      g.at(null);
    }
    this.beachMesh = new THREE.Mesh(g.build(), this.matBuilding);
    this.beachMesh.castShadow = true; this.beachMesh.receiveShadow = true;
    this.scene.add(this.beachMesh);
  }

  /** Nước ngập trên các ô đất thấp (mùa mưa bão): tấm nước đục phủ lên mặt đất, cao theo độ ngập. */
  _floodWater() {
    const c = this.city;
    if (!c.dirty.flood) return;
    c.dirty.flood = false;
    if (!this.floodMesh) {
      this.floodMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(T * 1.02, T * 1.02).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6b8a8f, transparent: true, opacity: 0.72, depthWrite: false }), N * N);
      this.floodMesh.frustumCulled = false; this.floodMesh.renderOrder = 4; this.scene.add(this.floodMesh);
    }
    const fl = c.flood, m = new THREE.Matrix4();
    let n = 0;
    if (fl) for (let i = 0; i < N * N; i++) {
      if (fl[i] < 0.6) continue;
      m.makeTranslation(cellX(i), c.cellH[i] + 0.25 + Math.min(fl[i], 4) * 0.22, cellZ(i));
      this.floodMesh.setMatrixAt(n++, m);
    }
    this.floodMesh.count = n; this.floodMesh.instanceMatrix.needsUpdate = true;
  }

  /** Pháo hoa ban đêm ở nơi tổ chức lễ (đêm giao thừa, Trung thu, lễ hội quy mô vừa trở lên). */
  _fireworks(simDt, dt) {
    const c = this.city;
    if (!this.fwMesh) {
      this.fwMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 600);
      this.fwMesh.frustumCulled = false; this.fwMesh.count = 0; this.scene.add(this.fwMesh); this.fw = []; this.fwT = 0;
    }
    const sites = fireworksAt(c);
    if (sites.length && simDt > 0) {
      this.fwT -= dt;
      if (this.fwT <= 0 && this.fw.length < 520) {
        this.fwT = 0.35 + Math.random() * 0.6;
        const s = c.services.find((v) => v.uid === sites[(Math.random() * sites.length) | 0]);
        if (s) {
          const sz = SERVICES[s.type].size, x = (s.x + sz / 2) * T - HALF + (Math.random() - 0.5) * 30, z = (s.y + sz / 2) * T - HALF + (Math.random() - 0.5) * 30, y = this._padY(s.x, s.y, sz) + 45 + Math.random() * 30;
          const hue = Math.random(), col = new THREE.Color().setHSL(hue, 0.9, 0.6), sp = 9 + Math.random() * 6;
          for (let k = 0; k < 60; k++) { const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1); this.fw.push({ x, y, z, vx: Math.sin(b) * Math.cos(a) * sp, vy: Math.cos(b) * sp, vz: Math.sin(b) * Math.sin(a) * sp, life: 1.6 + Math.random() * 0.6, col }); }
        }
      }
    }
    const m = new THREE.Matrix4();
    let n = 0;
    this.fw = this.fw.filter((p) => (p.life -= dt) > 0);
    for (const p of this.fw) {
      p.vy -= 6 * dt; p.vx *= 0.985; p.vz *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const s = Math.min(1, p.life);
      m.makeScale(s, s, s).setPosition(p.x, p.y, p.z); this.fwMesh.setMatrixAt(n, m); this.fwMesh.setColorAt(n++, p.col);
    }
    this.fwMesh.count = n; this.fwMesh.instanceMatrix.needsUpdate = true; if (this.fwMesh.instanceColor) this.fwMesh.instanceColor.needsUpdate = true;
  }

  /** Vật chuyển động trong công trình (xem transport3d.js): nội suy khung khoá theo thời gian. */
  _movers(dt) {
    if (!this.movers || !this.movers.length) return;
    const t = (this.moverT = (this.moverT || 0) + dt);
    for (const mv of this.movers) {
      const d = mv.d, ks = d.keys, u = (((t / d.period + (d.phase || 0) + mv.ph) % 1) + 1) % 1;
      let i = 0;
      while (i < ks.length - 2 && ks[i + 1][0] <= u) i++;
      const a = ks[i], b = ks[i + 1];
      let f = clamp((u - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
      if (b[6].includes('s')) f = f * f * (3 - 2 * f); else if (b[6].includes('i')) f = f * f; else if (b[6].includes('o')) f = 1 - (1 - f) * (1 - f);
      const hide = a[6].includes('h'), noCargo = a[6].includes('c');
      let dyaw = b[4] - a[4];
      dyaw = ((dyaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const x = a[1] + (b[1] - a[1]) * f, y = a[2] + (b[2] - a[2]) * f, z = a[3] + (b[3] - a[3]) * f, yaw = a[4] + dyaw * f, pitch = a[5] + (b[5] - a[5]) * f;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      d.parts.forEach((pt, k) => {
        const o = mv.meshes[k], px = x - fx * pt.off, pz = z - fz * pt.off;
        const vis = !hide && !(pt.cargo && noCargo) && !(d.clip && (Math.abs(px) > d.clip - 1 || Math.abs(pz) > d.clip - 1));
        o.visible = vis;
        if (vis) { o.position.set(px, y, pz); o.rotation.set(pitch, yaw, 0, 'YXZ'); }
      });
    }
  }

  /** Điểm (x, z) nằm trên lòng hầm chui đang mở không. */
  overTrench(x, z, pad = 0) {
    for (const t of this.trench || []) {
      const dx = t[2] - t[0], dz = t[3] - t[1], l2 = dx * dx + dz * dz || 1, h0 = ((x - t[0]) * dx + (z - t[1]) * dz) / l2;
      if ((h0 < 0 && t[5]) || (h0 > 1 && t[6])) continue; // đầu cắt phẳng ở cửa hầm
      const h = clamp(h0, 0, 1);
      if (Math.hypot(x - t[0] - dx * h, z - t[1] - dz * h) < t[4] + pad) return true;
    }
    return false;
  }

  /** Độ cao mặt đường trên cao / dưới hầm: dốc bắt đầu từ mép nút giao (chỗ đường bị cắt lùi), không phải từ tâm nút. */
  edgeLift(e, s) {
    const t = this.trims && this.trims.get(e.id);
    return liftAt(this.city, e, s, t ? t[0] + 1.5 : 3, t ? t[1] + 1.5 : 3);
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

  /**
   * Các nhịp cầu của đoạn e kèm kiểu dựng: 'beam' (dầm, trụ dày), 'arch', 'cable', 'susp'.
   * free = nhịp không cần trụ giữa sông (kết cấu trên mặt cầu gánh tải).
   */
  _bridgeSpans(e) {
    const pick = bridgeOf(e);
    return this.waterRuns(e).map((r) => {
      const span = r.s1 - r.s0 + 6;
      let kind = pick === 'auto' ? (span >= 46 ? 'arch' : 'beam') : pick;
      if (kind !== 'beam' && span < 26) kind = 'beam'; // nhịp quá ngắn: kết cấu lớn trông lạc lõng
      return { s0: Math.max(0, r.s0 - 3), s1: Math.min(e.len, r.s1 + 3), kind, free: kind !== 'beam' };
    });
  }

  /** Kết cấu trên mặt cầu theo kiểu: vòm thép, tháp + dây văng, tháp + cáp treo; thêm đèn cầu hai bên. */
  _bridges(st, e, rows, half, spans, lamps) {
    const c = this.city;
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
    // điểm 3D tại quãng đường s, lệch ngang lat (dương = bên phải), cao độ y
    const P = (s, lat, y) => { const p = pointAt(e.pts, e.cum, clamp(s, 0, e.len)); return [p[0] - p[3] * lat, y, p[1] + p[2] * lat]; };
    const local = (s, fn) => { const p = pointAt(e.pts, e.cum, clamp(s, 0, e.len)); st.at(m4.compose(v3.set(p[0], 0, p[1]), q.setFromEuler(e3.set(0, Math.atan2(p[2], p[3]) + Math.PI, 0)), one)); fn(); st.at(null); }; // trục x cục bộ = bên phải đường
    const ground = (s) => { const p = pointAt(e.pts, e.cum, clamp(s, 0, e.len)); return Math.max(heightAt(c, p[0], p[1]), -3.4) - 0.6; };
    const curve = (n, f) => { const out = []; for (let k = 0; k <= n; k++) out.push(f(k / n)); return out; };
    const chain = (pts, w, col) => { for (let k = 1; k < pts.length; k++) beam(pts[k - 1], pts[k], w, w, col); };
    const footing = (s, wide) => local(s, () => { const gy = ground(s); st.box(0, gy, 0, wide, Math.max(0.5, -0.3 - gy), 5.5, 0x8f8b82); st.box(0, -0.3, 0, wide + 0.6, 0.35, 6.1, 0x7d7970); }); // bệ trụ nhô khỏi mặt nước
    const STEEL = 0xc0503a, HANG = 0xe4e0d8, WHITE = 0xe9e7e1, CONC = 0xd3cfc5;
    for (const r of spans) {
      const span = r.s1 - r.s0;
      if (r.kind === 'arch') {
        const A = clamp(5 + span * 0.06, 6, 14), n = Math.max(8, Math.round(span / 5)), side = [[], []];
        for (let k = 0; k <= n; k++) {
          const s = r.s0 + (span * k) / n, y = yAt(s) + 0.9, top = y + A * Math.sin((Math.PI * k) / n);
          [-1, 1].forEach((sd, j) => { const pt = P(s, sd * (half - 0.25), top); pt.push(y); side[j].push(pt); });
        }
        for (let k = 1; k <= n; k++) for (const arr of side) beam(arr[k - 1], arr[k], 0.55, 0.75, STEEL);
        for (let k = 1; k < n; k++) {
          for (const arr of side) { const a = arr[k]; if (a[1] - a[3] > 1) beam([a[0], a[1], a[2]], [a[0], a[3], a[2]], 0.12, 0.12, HANG); } // dây treo
          if (k % 3 === 0 && side[0][k][1] - side[0][k][3] > 4.5) beam(side[0][k].slice(0, 3), side[1][k].slice(0, 3), 0.35, 0.45, STEEL); // giằng ngang
        }
        for (const s of [r.s0, r.s1]) footing(s, half * 2 + 1);
      } else if (r.kind === 'cable') {
        // dây văng: 1 tháp chữ A giữa nhịp (nhịp ngắn) hoặc 2 tháp, dây xoè hình quạt về hai phía
        const two = span >= 100, towers = two ? [r.s0 + span * 0.27, r.s1 - span * 0.27] : [(r.s0 + r.s1) / 2];
        const H = clamp(span * (two ? 0.24 : 0.36), 18, 58), reach = two ? span * 0.25 : span * 0.47;
        for (const t of towers) {
          const y = yAt(t), gy = ground(t), w = half + 1.3;
          footing(t, w * 2 + 2.4);
          for (const sd of [-1, 1]) {
            beam(P(t, sd * w, gy), P(t, sd * w, y - 1.4), 1.9, 1.9, CONC); // chân tháp dưới mặt cầu
            beam(P(t, sd * w, y - 1.4), P(t, sd * 0.9, y + H * 0.72), 1.6, 1.6, CONC); // hai cột chụm lại
          }
          beam(P(t, -w, y - 1.6), P(t, w, y - 1.6), 1.6, 1.5, 0xc4c0b6); // xà đỡ mặt cầu
          local(t, () => { st.box(0, y + H * 0.7, 0, 2.6, H * 0.3 + 1.6, 2.4, CONC); st.box(0, y + H + 1.6, 0, 3, 0.4, 2.8, 0xb9b5ab); }); // đầu tháp neo dây
          const n = clamp(Math.round(reach / 6), 4, 12);
          for (const dir of [-1, 1]) for (let k = 0; k < n; k++) {
            const d = (reach * (n - k)) / n, sd2 = clamp(t + dir * d, r.s0 - 6, r.s1 + 6), ty = y + H + 1.2 - k * ((H * 0.3) / n);
            for (const sd of [-1, 1]) beam(P(t, sd * 0.7, ty), P(sd2, sd * (half - 0.15), yAt(sd2) + 0.9), 0.11, 0.11, 0xf2efe8);
          }
        }
        if (two) for (const s of [r.s0, r.s1]) footing(s, half * 2 + 1);
      } else if (r.kind === 'susp') {
        // cầu treo: 2 tháp cổng cao, cáp chủ võng giữa nhịp, dây treo thẳng đứng, khối neo trên bờ
        const tA = r.s0 + span * 0.15, tB = r.s1 - span * 0.15, H = clamp(span * 0.19, 16, 56), w = half + 0.7;
        const yA = yAt(tA) + H, yB = yAt(tB) + H;
        for (const t of [tA, tB]) {
          const y = yAt(t), gy = ground(t);
          footing(t, w * 2 + 3);
          for (const sd of [-1, 1]) {
            local(t, () => { st.box(sd * w, gy, 0, 2.3, y - gy, 3, WHITE); st.box(sd * w, y, 0, 1.8, H + 0.6, 2.4, WHITE); st.box(sd * w, y + H + 0.6, 0, 2.2, 0.9, 2.8, 0xcfccc4); }); // chân + thân + yên cáp
          }
          local(t, () => {
            for (const [hy, th] of [[y - 1.8, 1.4], [y + H * 0.42, 1.3], [y + H * 0.8, 1.6]]) st.box(0, hy, 0, w * 2, th, 2, WHITE); // xà cổng
            st.box(0, y + H * 0.8 - 1.2, 0, w * 2 - 2.4, 1.2, 1.4, 0xdcd9d1);
          });
        }
        for (const sd of [-1, 1]) {
          const lat = sd * w, sag = Math.max(2.5, (yA + yB) / 2 - (yAt((tA + tB) / 2) + 2.2));
          const main = curve(Math.max(12, Math.round((tB - tA) / 5)), (u) => { const s = tA + (tB - tA) * u; return [s, yA + (yB - yA) * u - sag * 4 * u * (1 - u)]; });
          chain(main.map(([s, y]) => P(s, lat, y)), 0.5, 0xd5d0c4);
          for (const [s, y] of main.slice(1, -1)) beam(P(s, lat, y), P(s, lat, yAt(s) + 0.6), 0.1, 0.1, 0xd5d0c4); // dây treo
          // nhịp biên: cáp từ đỉnh tháp xuống khối neo trên bờ
          for (const [t, yt, anc] of [[tA, yA, Math.max(0, r.s0 - 12)], [tB, yB, Math.min(e.len, r.s1 + 12)]]) {
            const ya = yAt(anc) + 0.8, side = curve(6, (u) => { const s = t + (anc - t) * u; return [s, yt + (ya - yt) * u - (yt - ya) * 0.08 * 4 * u * (1 - u)]; });
            chain(side.map(([s, y]) => P(s, lat, y)), 0.5, 0xd5d0c4);
            for (const [s, y] of side.slice(1, -1)) if (y - yAt(s) > 1.2) beam(P(s, lat, y), P(s, lat, yAt(s) + 0.6), 0.1, 0.1, 0xd5d0c4);
            local(anc, () => st.box(lat, Math.min(ground(anc), yAt(anc) - 2), 0, 3.2, yAt(anc) + 2.4 - Math.min(ground(anc), yAt(anc) - 2), 5, 0xbab6ac)); // khối neo
          }
        }
      }
      // đèn cầu: hai bên so le, cột thép mảnh vươn cần vào lòng đường
      for (let s = r.s0 + 8, k = 0; s < r.s1 - 4; s += 22, k++) {
        const sd = k % 2 ? 1 : -1, y = yAt(s), pole = P(s, sd * (half - 0.35), y), head = P(s, sd * (half - 2), y);
        st.cyl(pole[0], y + 1, pole[2], 0.12, 0.09, 6, 0x5b636c, 5);
        beam([pole[0], y + 7, pole[2]], [head[0], y + 6.9, head[2]], 0.1, 0.1, 0x5b636c);
        lamps.push([head[0], y + 6.65, head[2], y]);
      }
    }
  }

  /**
   * Kết cấu của một đoạn đường: dầm, lan can, trụ và xà mũ cho đoạn trên cao hoặc qua nước;
   * cột đèn đường dọc vỉa hè cho đoạn dưới đất. lamps nhận vị trí bóng đèn.
   */
  _structure(st, e, rows, half, lamps, spans = []) {
    const c = this.city, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const seg = (a, b, fn) => {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dz);
      if (l < 0.05) return;
      st.at(m4.compose(v3.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), q.setFromEuler(e3.set(-Math.atan2(dy, l), Math.atan2(dx, dz), 0, 'YXZ')), one));
      fn(Math.hypot(l, dy));
      st.at(null);
    };
    let nextPillar = 0, nextLamp = 14 + (e.id % 3) * 6, side = e.id % 2 ? 1 : -1, prevPole = null;
    const vnPoles = c.style === 'vn' && !ROADS[e.type].elevated;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, sunk = Math.min(a.lift, b.lift) < -0.6;
      const water = isWaterAt(c, mx, mz) || Math.max(a.wl || 0, b.wl || 0) > 0.8 || (!sunk && Math.max(a.lift, b.lift) < 0.8 && this.overTrench(mx, mz, 1)), high = Math.max(a.lift, b.lift) > 0.8;
      if (sunk && !this.overTrench(mx, mz, 0)) continue; // đoạn hầm kín dưới đáy sông: không tường chắn, không gì lộ ra
      if (sunk) {
        // hầm chui: tường chắn bê tông hai bên, cao từ đáy hầm lên quá mặt đất một chút (làm lan can), có gờ trên đỉnh
        seg(a, b, (L) => {
          const top = Math.max(0.6, this.roadY(mx, mz) - (a.y + b.y) / 2 + 0.9);
          for (const sd of [-1, 1]) { st.box(sd * (half + 0.25), 0, 0, 0.5, top, L + 0.05, 0xb9b4a8); st.box(sd * (half + 0.25), top, 0, 0.75, 0.15, L + 0.05, 0x8d887e); }
        });
        continue;
      }
      if (high || water) {
        seg(a, b, (L) => {
          st.box(0, -1.15, 0, half * 2 + 0.2, 1.15, L + 0.05, 0xa8a399); // dầm
          st.box(0, -1.25, 0, half * 2 - 1.2, 0.1, L + 0.05, 0x8d887e);
          for (const sd of [-1, 1]) { st.box(sd * (half - 0.15), 0, 0, 0.32, 0.95, L + 0.05, 0xd8d4cc); st.box(sd * (half - 0.15), 0.95, 0, 0.42, 0.12, L + 0.05, 0x9aa3aa); } // lan can
        });
        if (b.s >= nextPillar && !spans.some((r) => r.free && b.s > r.s0 - 2 && b.s < r.s1 + 2)) { // nhịp vòm / dây văng / treo: không trụ giữa sông
          nextPillar = b.s + (half > 7 ? 18 : 22);
          const gy = Math.max(heightAt(c, b.x, b.z), -3.2), top = b.y - 1.2, below = this._groundRoadAt(b.x, b.z, half > 7 ? half - 3 : 1.4, e);
          let side = 0;
          if (below === 'deck' && half <= 7) { // vòng cầu bên dưới che chỗ đặt trụ: dựng trụ lệch ra mép ngoài, xà công-xôn đỡ mặt cầu
            for (const sd of [1, -1]) { const px = b.x + b.rx * sd * (half + 2.2), pz = b.z + b.rz * sd * (half + 2.2); if (!this._groundRoadAt(px, pz, 1.2, e)) { side = sd; break; } }
          }
          if (side) {
            const px = b.x + b.rx * side * (half + 2.2), pz = b.z + b.rz * side * (half + 2.2), py = Math.max(heightAt(c, px, pz), -3.2);
            st.cyl(px, py - 0.5, pz, 1.05, 0.95, top + 0.45 - py + 0.5, 0x9a968e, 8);
            st.at(m4.compose(v3.set(b.x + b.rx * side * (half + 2.2) / 2, top - 0.45, b.z + b.rz * side * (half + 2.2) / 2), q.setFromEuler(e3.set(0, Math.atan2(b.rx, b.rz), 0)), one)).box(0, 0, 0, 1.6, 0.9, half + 2.2 + 2, 0x8d887e).at(null);
            nextPillar = b.s + 22;
          } else if (below) nextPillar = b.s + 2; // trụ không đứng giữa lòng đường / nút giao bên dưới: dời tới chỗ trống kế tiếp
          else if (top - gy > 1.2) {
            if (half > 7) for (const sd of [-1, 1]) st.cyl(b.x + b.rx * sd * (half - 3), gy - 0.5, b.z + b.rz * sd * (half - 3), 1.05, 0.95, top - gy + 0.5, 0x9a968e, 8);
            else st.cyl(b.x, gy - 0.5, b.z, 1.15, 1, top - gy + 0.5, 0x9a968e, 8);
            st.at(m4.compose(v3.set(b.x, top - 0.45, b.z), q.setFromEuler(e3.set(0, Math.atan2(b.rx, b.rz), 0)), one)).box(0, 0, 0, 2.2, 0.9, half * 2 - 0.6, 0x8d887e).at(null); // xà mũ
          }
        }
      } else if (vnPoles && b.s >= nextLamp && b.s < e.len - 8) {
        // kiểu Việt Nam: cột điện bê tông một bên vỉa hè, dây điện chằng chịt nối từ cột trước sang
        nextLamp = b.s + 26;
        const sd = e.id % 2 ? 1 : -1, px = b.x + b.rx * sd * (half - 0.45), pz = b.z + b.rz * sd * (half - 0.45), top = b.y + 8.5;
        st.box(px, b.y, pz, 0.38, 8.5, 0.38, 0x9a968e);
        st.at(m4.compose(v3.set(px, top - 0.6, pz), q.setFromEuler(e3.set(0, Math.atan2(b.rx, b.rz), 0)), one)).box(0, 0, 0, 0.16, 0.16, 2.2, 0x6e6a66).at(null);
        st.cyl(px + b.rx * sd * 0.35, top - 2.2, pz + b.rz * sd * 0.35, 0.45, 0.45, 0.9, 0x5f6a6a, 6); // bình biến áp
        st.cyl(px, top - 3.6, pz, 0.32, 0.32, 0.5, 0x22262b, 6); // cuộn dây
        { // đèn đường gắn trên cột điện, vươn ra lòng đường
          const lx = b.x + b.rx * sd * (half - 2.2), lz = b.z + b.rz * sd * (half - 2.2);
          st.at(m4.compose(v3.set((px + lx) / 2, top - 1.45, (pz + lz) / 2), q.setFromEuler(e3.set(0, Math.atan2(lx - px, lz - pz), 0)), one)).box(0, 0, 0, 0.1, 0.1, Math.hypot(lx - px, lz - pz) + 0.2, 0x6e6a66).at(null);
          lamps.push([lx, top - 1.7, lz, b.y]);
        }
        if (prevPole) for (const [dh, off] of [[0.6, -0.8], [0.6, 0.8], [1.4, 0], [2.4, 0.3], [3.1, -0.3]]) {
          const ax = prevPole[0] + b.rx * off, az = prevPole[2] + b.rz * off, bx = px + b.rx * off, bz = pz + b.rz * off, ay = prevPole[1] - dh, by = top - dh, l = Math.hypot(bx - ax, bz - az);
          const mid = [(ax + bx) / 2, (ay + by) / 2 - 0.5 - l * 0.012, (az + bz) / 2]; // dây võng ở giữa
          for (const [p0, p1] of [[[ax, ay, az], mid], [mid, [bx, by, bz]]]) {
            const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], ll = Math.hypot(dx, dz);
            st.at(m4.compose(v3.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2), q.setFromEuler(e3.set(-Math.atan2(dy, ll), Math.atan2(dx, dz), 0, 'YXZ')), one)).box(0, 0, 0, 0.07, 0.07, Math.hypot(ll, dy), 0x1c1f22).at(null);
          }
        }
        prevPole = [px, top, pz];
        // xe đẩy bán hàng có ô che ở vỉa hè bên kia, thỉnh thoảng
        const swk = c.street ? c.street.sidewalk : 'free', vendor = swk === 'free' ? 0.6 : swk === 'license' ? 0.3 : 0; // chính sách vỉa hè
        if (swk === 'free' && hash2(e.id, Math.round(b.s), 67) < 0.55) { // quán cóc: bàn thấp, ghế nhựa đỏ xanh bày ra vỉa hè phía bên kia
          const tx = b.x + b.rx * sd * (half - 1.6) * -1, tz = b.z + b.rz * sd * (half - 1.6) * -1;
          st.box(tx, b.y, tz, 0.9, 0.5, 0.9, 0xd7d2c4);
          for (const [ox, oz] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) st.box(tx + ox, b.y, tz + oz, 0.36, 0.3, 0.36, hash2(e.id, ox * 7 + oz, 69) < 0.5 ? 0xd8262e : 0x1f6fc8);
        }
        if (hash2(e.id, Math.round(b.s), 61) < vendor) {
          const vx = b.x - b.rx * sd * (half - 1.2), vz = b.z - b.rz * sd * (half - 1.2), um = [0xd8262e, 0x1f6fc8, 0xe8681f, 0x16935a][(hash2(e.id, Math.round(b.s), 63) * 4) | 0];
          st.box(vx, b.y, vz, 1.4, 0.9, 0.8, 0x7a5a36); st.box(vx, b.y + 0.9, vz, 1.5, 0.08, 0.9, 0xd9d4c8);
          st.cyl(vx + 0.5, b.y, vz, 0.05, 0.05, 2.6, 0x3a3f46, 4); st.cyl(vx + 0.5, b.y + 2.3, vz, 1.6, 0.05, 0.6, um, 8);
          for (const ox of [-1.3, 1.6]) st.box(vx + ox, b.y, vz + 0.4, 0.4, 0.42, 0.4, [0xd8262e, 0x1f6fc8][(ox > 0) | 0]);
        }
      } else if (!vnPoles && b.s >= nextLamp && b.s < e.len - 10) {
        nextLamp = b.s + 30; side = -side; // đổi bên sau mỗi cột
        const px = b.x + b.rx * side * (half - 0.5), pz = b.z + b.rz * side * (half - 0.5), hx = b.x + b.rx * side * (half - 2.2), hz = b.z + b.rz * side * (half - 2.2);
        st.cyl(px, b.y, pz, 0.13, 0.1, 6.2, 0x4a5058, 5);
        st.at(m4.compose(v3.set((px + hx) / 2, b.y + 6.1, (pz + hz) / 2), q.setFromEuler(e3.set(0, Math.atan2(hx - px, hz - pz), 0)), one)).box(0, 0, 0, 0.12, 0.12, Math.hypot(hx - px, hz - pz) + 0.2, 0x4a5058).at(null);
        lamps.push([hx, b.y + 5.85, hz, b.y]);
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
    const vn = c.style === 'vn', sm = new THREE.Matrix4(), sl = new THREE.Matrix4(), sc = new Array(SIGN_WORDS.length).fill(0);
    for (const k in this.growMeshes) counts[k] = 0;
    for (let i = 0; i < N * N; i++) {
      const L = c.level[i];
      if (!L) continue;
      const vnGeo = vn && hasVN(c.zone[i]) ? 'v' : '', key = `${vnGeo}${c.zone[i]}-${L}-${c.variant[i] % 3}`;
      let mesh = this.growMeshes[key];
      if (!mesh) { mesh = this.growMeshes[key] = this._inst((vnGeo && growableVN(c.zone[i], L, c.variant[i] % 3)) || growable(c.zone[i], L, c.variant[i] % 3), this.matBuilding, 256, true); counts[key] = 0; mesh.visible = !this.hideBld; }
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
      if (vnGeo && t >= 1 && (c.zone[i] === 2 || c.zone[i] === 7 || c.zone[i] === 17)) { // chữ trên biển hiệu từng căn nhà ống
        const nh = L >= 4 ? 3 : 2, w = 9.4 / nh;
        for (let k = 0; k < nh; k++) {
          const wd = (hash2(x * 3 + k, y, 41) * SIGN_WORDS.length) | 0;
          if (sc[wd] >= 2000) continue;
          sl.makeTranslation(-4.7 + w * (k + 0.5), 3.32, 4.6 + 0.16).scale(_v3.set(w - 0.7, 0.72, 1));
          this.signMeshes[wd].setMatrixAt(sc[wd]++, sm.multiplyMatrices(m, sl));
        }
      }
      col.setHSL(0, 0, 0.86 + hash2(x, y, 77) * 0.14);
      mesh.setColorAt(counts[key]++, col);
    }
    for (const k in this.growMeshes) { const mesh = this.growMeshes[k]; mesh.count = counts[k]; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    this.signMeshes.forEach((mm, k) => { mm.count = sc[k]; mm.instanceMatrix.needsUpdate = true; });
    return animating;
  }

  /** Cây theo vùng: dừa ven nước (kiểu Việt Nam), thông trên cao, cây tán rộng và phượng ở đồng bằng, kèm bụi cây; đá rải trên sườn dốc và bãi khoáng sản. */
  _trees() {
    const c = this.city, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    const n = TREE_CAP.map(() => 0), vn = c.style === 'vn';
    const shore = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < N && b < N && c.water[b * N + a]) return true; } return false; };
    const put = (kind, wx, wz, sc, sy, yaw, hue, light) => {
      if (n[kind] >= TREE_CAP[kind]) return;
      if (this.trench && this.trench.length && this.overTrench(wx, wz, 3)) return; // cây không mọc trên lòng hầm hở
      p.set(wx, heightAt(c, wx, wz) - 0.15, wz); q.setFromAxisAngle(up, yaw); s.set(sc, sc * sy, sc);
      m.compose(p, q, s);
      this.treeMeshes[kind].setMatrixAt(n[kind], m);
      this.treeMeshes[kind].setColorAt(n[kind]++, kind === 5 ? col.setHSL(0, 0, 0.9 + light * 0.1) : col.setHSL(0.22 + hue * 0.1, 0.22, 0.86 + light * 0.14));
    };
    for (let i = 0; i < N * N; i++) {
      if (!c.tree[i]) continue;
      const x = i % N, y = (i / N) | 0, h = c.cellH[i], nearW = shore(x, y), cnt = 2 + ((hash2(x, y, 5) * 3) | 0);
      for (let k = 0; k < cnt; k++) {
        const rr = hash2(x * 7 + k, y * 3 + k, 19);
        const kind = vn && nearW && rr < 0.75 ? 2 : h > 16 ? (rr < 0.85 ? 3 : 0) : h > 9 ? (rr < 0.45 ? 3 : rr < 0.8 ? 0 : 1) : rr < 0.5 ? 0 : rr < 0.82 ? 1 : rr < 0.85 && vn ? 5 : rr < 0.94 ? 3 : vn ? 2 : 1;
        const sc = (0.8 + hash2(x, y * 5 + k, 11) * 0.7) * (kind === 3 ? 1.15 : 1);
        put(kind, cellCenter(x) + (hash2(x + k * 13, y, 1) - 0.5) * T * 0.8, cellCenter(y) + (hash2(x, y + k * 17, 2) - 0.5) * T * 0.8, sc, 0.9 + hash2(k, x, y) * 0.3, hash2(x, y, k) * 6.28, hash2(x + k, y, 3), hash2(x, y + k, 4));
      }
      for (let k = 0; k < 2; k++) if (hash2(x + k, y, 27) < 0.7) // bụi cây dưới tán
        put(4, cellCenter(x) + (hash2(x, y + k, 28) - 0.5) * T * 0.9, cellCenter(y) + (hash2(x + k, y, 29) - 0.5) * T * 0.9, 0.8 + hash2(x, y, 30 + k) * 0.9, 1, hash2(y, x, k) * 6.28, hash2(x, k, 31), hash2(k, y, 32));
    }
    // cây xanh trồng theo ô trang trí: một cây lớn giữa ô (so le theo ô) và bụi cây thấp; bồn hoa có cây bụi viền
    if (c.decor) for (let i = 0; i < N * N; i++) {
      const dv = c.decor[i];
      if (dv !== 1 && dv !== 4) continue;
      const x = i % N, y = (i / N) | 0, r = hash2(x, y, 211);
      if (dv === 1) {
        const kind = vn ? (r < 0.4 ? 0 : r < 0.62 ? 5 : r < 0.85 ? 1 : 2) : r < 0.5 ? 0 : r < 0.8 ? 1 : 3;
        put(kind, cellCenter(x) + (hash2(x, y, 212) - 0.5) * 2.5, cellCenter(y) + (hash2(x, y, 213) - 0.5) * 2.5, 1.05 + hash2(x, y, 214) * 0.35, 1, r * 6.28, hash2(x, y, 215), hash2(x, y, 216));
        if (hash2(x, y, 217) < 0.6) put(4, cellCenter(x) + (hash2(x, y, 218) - 0.5) * 7, cellCenter(y) + (hash2(x, y, 219) - 0.5) * 7, 0.7 + r * 0.5, 1, r * 3, 0.4, 0.5);
      } else for (let k = 0; k < 4; k++) put(4, cellCenter(x) + [-3.4, 3.4, -3.4, 3.4][k], cellCenter(y) + [-3.4, -3.4, 3.4, 3.4][k], 0.55, 0.8, k, 0.5, 0.4);
    }
    // đá: sườn dốc, bãi khoáng sản, đôi chỗ ven bờ
    let nr = 0;
    for (let i = 0; i < N * N && nr < MAX_ROCKS; i++) {
      if (c.water[i] || c.road[i] || c.level[i] || c.occ[i] || (c.beach && c.beach[i]) || (c.decor && c.decor[i]) || (c.falls && c.falls[i])) continue; // bãi biển, ô trang trí, thác: không đá rải (thác có đá riêng)
      const x = i % N, y = (i / N) | 0, hv = hash2(x, y, 37);
      if (!(c.steep[i] ? hv < 0.6 : c.res[i] === 3 ? hv < 0.3 && !c.acc[i] : hv < 0.05 && !c.acc[i] && shore(x, y))) continue;
      const wx = cellCenter(x) + (hash2(x, y, 38) - 0.5) * T * 0.8, wz = cellCenter(y) + (hash2(x, y, 39) - 0.5) * T * 0.8, sc = 0.7 + hash2(x, y, 40) * 1.6;
      p.set(wx, heightAt(c, wx, wz) - 0.2, wz); q.setFromAxisAngle(up, hv * 40); s.set(sc, sc * (0.7 + hash2(y, x, 41) * 0.6), sc);
      m.compose(p, q, s); this.rockMesh.setMatrixAt(nr, m); this.rockMesh.setColorAt(nr++, col.setHSL(0.09, 0.08, 0.75 + hash2(x, y, 42) * 0.25));
    }
    this.rockMesh.count = nr; this.rockMesh.instanceMatrix.needsUpdate = true; if (this.rockMesh.instanceColor) this.rockMesh.instanceColor.needsUpdate = true;
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
    this.serviceGroup.traverse((o) => { if (o.userData.own) o.geometry.dispose(); }); // giàn giáo công trường dựng riêng từng lần
    this.serviceGroup.clear();
    this.spinners = []; this.chimneys = []; this.siteAnims = []; this.movers = [];
    for (const s of c.services) {
      const def = SERVICES[s.type], grp = this._serviceObject(s.type);
      if (s.build > 0) { // công trường: nhà mọc dần theo tiến độ, giàn giáo, hàng rào, xe công trình
        grp.position.set((s.x + def.size / 2) * T - HALF, this._padY(s.x, s.y, def.size) + 0.02, (s.y + def.size / 2) * T - HALF); grp.rotation.y = ROT[s.dir & 3];
        this._site(grp, s, def, 1 - s.build / s.buildTot);
        this.serviceGroup.add(grp);
        continue;
      }
      grp.position.set((s.x + def.size / 2) * T - HALF, this._padY(s.x, s.y, def.size) + 0.02, (s.y + def.size / 2) * T - HALF); grp.rotation.y = ROT[s.dir & 3];
      (s.mods || []).forEach((id, k) => { // module: khối phụ ở các góc lô đất, góc sau trước
        const geo = this.modCache[id] || (this.modCache[id] = moduleGeometry(id)), mesh = new THREE.Mesh(geo, this.matBuilding), o = (def.size * T) / 2 - 2.1;
        mesh.position.set(k % 2 ? o : -o, 0.14, k < 2 ? -o : o); mesh.castShadow = mesh.receiveShadow = true;
        grp.add(mesh);
      });
      grp.updateMatrixWorld(true);
      grp.traverse((o) => { if (o.userData.spin) { o.rotation.z = hash2(s.x, s.y, 3) * 6; this.spinners.push(o); } });
      for (const pt of this._svc(s.type).smoke || []) this.chimneys.push(new THREE.Vector3(...pt).applyMatrix4(grp.matrixWorld));
      for (const d of this._svc(s.type).movers || []) { // máy bay, tàu hoả, cẩu, xe tải chạy trong công trình
        const meshes = d.parts.map((pt) => { const o = new THREE.Mesh(pt.geometry, this.matBuilding); o.castShadow = true; o.visible = false; grp.add(o); return o; });
        this.movers.push({ d, meshes, ph: hash2(s.x, s.y, 7) });
      }
      this.serviceGroup.add(grp);
    }
  }

  /**
   * Công trường của một công trình dịch vụ đang xây (prog 0..1): nền đất, hàng rào tôn, giàn giáo lưới xanh bọc phần
   * đã xây, lán trại, vật liệu, và xe công trình theo cỡ lô đất và giai đoạn: đào móng (máy xúc, máy ủi, xe ben),
   * dựng khung (cần cẩu, xe bồn bê tông), hoàn thiện (xe lu, máy kéo chở vật liệu).
   */
  _site(grp, s, def, prog) {
    const main = grp.children[0], H0 = SITE_H[s.type] || (SITE_H[s.type] = (main.geometry.computeBoundingBox(), main.geometry.boundingBox.max.y));
    for (const o of grp.children) { o.scale.y = Math.max(0.04, prog * 0.92); o.userData.spin = false; } // phần đã xây
    const L = def.size * T, half = L / 2, g = new GB(), hs = hash2(s.x, s.y, 91), h = Math.max(1.5, H0 * prog * 0.92);
    g.box(0, 0.06, 0, L - 0.4, 0.1, L - 0.4, 0x8a6e4e); // nền đất đã san
    if (prog < 0.35) g.box(0, 0.08, 0, L * 0.6, 0.1, L * 0.6, 0x5e4a35); // hố móng
    // hàng rào tôn: chừa cổng ở mặt trước (+z)
    for (const [x0, z0, x1, z1] of [[-half, -half, half, -half], [-half, -half, -half, half], [half, -half, half, half], [-half, half, -1.8, half], [1.8, half, half, half]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4));
      for (let k = 0; k < n; k++) {
        const x = x0 + ((x1 - x0) * (k + 0.5)) / n, z = z0 + ((z1 - z0) * (k + 0.5)) / n;
        g.box(x, 0.1, z, x0 === x1 ? 0.08 : len / n - 0.05, 1.9, z0 === z1 ? 0.08 : len / n - 0.05, k % 2 ? 0x3b78b8 : 0xf2f2f0);
      }
    }
    // giàn giáo quanh phần đã xây: cột đứng, thanh ngang mỗi tầng, lưới xanh hai mặt
    const sc = Math.min(half - 0.6, Math.max(2.5, half * 0.82)), SC = 0x9aa0a6;
    for (let x = -sc; x <= sc + 0.01; x += (2 * sc) / Math.max(1, Math.round((2 * sc) / 2.4))) for (const z of [-sc, sc]) { g.box(x, 0.1, z, 0.1, h + 1.2, 0.1, SC); g.box(z, 0.1, x, 0.1, h + 1.2, 0.1, SC); }
    for (let y = 2; y < h + 1.2; y += 2) for (const z of [-sc, sc]) { g.box(0, y, z, sc * 2, 0.1, 0.1, SC); g.box(z, y, 0, 0.1, 0.1, sc * 2, SC); g.box(0, y - 0.05, z * 0.97, sc * 2, 0.05, 0.6, 0x8a6a46); }
    for (const z of hs < 0.5 ? [-sc, sc] : [-sc]) g.box(0, 0.6, z * 1.01, sc * 2, h * 0.85, 0.05, 0x3f8a52); // lưới che bụi
    g.box(hs < 0.5 ? sc * 1.01 : -sc * 1.01, 0.6, 0, 0.05, h * 0.85, sc * 2, 0x3f8a52);
    // lán trại container, nhà vệ sinh lưu động, bãi vật liệu
    const cx = -half + 2.2, cz = half - 1.8;
    if (L >= 20) { g.box(cx + 1.2, 0.1, -half + 1.6, 4.6, 2.4, 2.2, 0x2f6fb0); g.box(cx + 1.2, 1.1, -half + 2.72, 3.6, 0.7, 0.04, GLASS); g.box(half - 1.4, 0.1, -half + 1.4, 1, 2.1, 1, 0x2f9a4a); }
    for (let k = 0; k < (L >= 20 ? 4 : 2); k++) { const px = half - 2.2 - k * 1.5, pz = half - 2; g.box(px, 0.1, pz, 1.2, 0.15, 1.2, 0x9a7a52); g.box(px, 0.25, pz, 1.1, 0.5 + (k % 2) * 0.4, 1.1, k % 2 ? 0xb06a46 : 0xc8c2b4); } // pallet gạch, xi măng
    if (L >= 20) for (let k = 0; k < 5; k++) g.box(cx, 0.15 + k * 0.22, cz - 3, 3.6, 0.2, 0.2 + (k % 2) * 0.05, 0x6b7076); // thép ống
    const site = new THREE.Mesh(g.build(), this.matBuilding); site.castShadow = site.receiveShadow = true; site.userData.own = true; grp.add(site);
    // xe công trình theo cỡ và giai đoạn
    const big = def.size >= 3, mid = def.size === 2, early = prog < 0.55, kinds = [];
    if (early) kinds.push('excavator', 'dump'); else kinds.push('dump');
    if (big && early) kinds.push('dozer', 'excavator');
    if ((mid || big) && prog > 0.15 && prog < 0.9) kinds.push('mixer');
    if ((mid || big) && prog > 0.45) kinds.push('roller');
    if (mid || big || prog > 0.5) kinds.push('tractor');
    if (big) kinds.push('dump');
    if (mid && prog > 0.2) kinds.push('mcrane');
    const scale = def.size === 1 ? 0.7 : 1, slots = this._siteSlots(half, def.size);
    kinds.slice(0, slots.length).forEach((k, i) => {
      const [x, z, rot, path] = slots[i], v = this.siteVeh[k] || (this.siteVeh[k] = siteVehicle(k));
      const holder = new THREE.Group(); holder.position.set(x, 0.12, z); holder.rotation.y = rot; holder.scale.setScalar(scale);
      const body = new THREE.Mesh(v.geometry, this.vehMat); body.castShadow = true; holder.add(body);
      if (v.top) { const t = new THREE.Mesh(v.top.geometry, this.vehMat); t.position.set(...v.top.pos); t.castShadow = true; holder.add(t); this.siteAnims.push({ o: t, kind: 'swing', ph: hs * 6 + i, base: (i % 2 ? 0.6 : -0.6) }); }
      if (path && (k === 'dump' || k === 'roller' || k === 'tractor' || k === 'mixer')) this.siteAnims.push({ o: holder, kind: 'shuttle', ph: hs * 9 + i * 1.7, x, z, dx: Math.sin(rot) * path, dz: Math.cos(rot) * path, sp: k === 'roller' ? 0.25 : 0.32 });
      grp.add(holder);
    });
    // cần cẩu tháp cho công trình lớn khi đã lên khung
    if (big && prog > 0.12) {
      const ch = Math.max(H0 + 9, 22), reach = Math.min(L * 0.75, 26), key = `${Math.round(ch)}:${Math.round(reach)}`, cr = this.siteCrane[key] || (this.siteCrane[key] = towerCrane(ch, reach));
      const mast = new THREE.Mesh(cr.mast, this.vehMat), jib = new THREE.Mesh(cr.jib, this.vehMat);
      mast.position.set(-half + 3.2, 0.1, -half + 3.2); jib.position.set(-half + 3.2, ch + 0.1, -half + 3.2); mast.castShadow = jib.castShadow = true;
      grp.add(mast, jib); this.siteAnims.push({ o: jib, kind: 'crane', ph: hs * 7, base: Math.PI * 0.75 });
    }
  }

  /** Chỗ đỗ xe trong công trường: [x, z, góc quay, quãng chạy qua lại] theo nửa cạnh lô. */
  _siteSlots(half, size) {
    if (size === 1) return [[half - 1.6, 0.5, Math.PI, 0], [-half + 1.4, -0.5, 0, 2]];
    const e = half - 2.4;
    return [[e - 1, e - 2, Math.PI * 0.85, 0], [-e + 0.6, 0, 0, Math.min(8, half)], [0, e - 1, -Math.PI / 2, Math.min(8, half)], [e, -e + 3, Math.PI, 5], [-e + 1, e - 1.5, Math.PI / 2, 0], [e - 2, 2, Math.PI * 1.1, 0], [-2, -e + 1.5, Math.PI / 2, 5], [3, -e + 4, -Math.PI / 2, 0]];
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
  setPreview(tiles, color) { // tiles: [[x, y], ...] một màu, hoặc [[x, y, màu], ...] mỗi ô một màu
    const m = new THREE.Matrix4(), n = Math.min(tiles ? tiles.length : 0, N * N), c = this.city, col = this._pc || (this._pc = new THREE.Color());
    for (let k = 0; k < n; k++) {
      const [x, y, tc] = tiles[k];
      m.makeTranslation(cellCenter(x), (x >= 0 && y >= 0 && x < N && y < N ? Math.max(c.cellH[y * N + x], 0) : 0) + 0.4, cellCenter(y)); this.preview.setMatrixAt(k, m);
      this.preview.setColorAt(k, col.set(tc != null ? tc : 0xffffff));
    }
    this.preview.count = n; this.preview.instanceMatrix.needsUpdate = true;
    if (this.preview.instanceColor) this.preview.instanceColor.needsUpdate = true;
    this.preview.material.color.set(n && tiles[0][2] != null ? 0xffffff : color != null ? color : this.preview.material.color);
  }

  /** Dải xem trước dọc polyline phẳng pts ([x, z, ...]) rộng 2 * half; null để ẩn. */
  setRibbon(pts, half, color, lift = null) { // lift: độ cao mặt đường so với mặt đất từng điểm (cầu, hầm) — vẽ dải ở đúng độ cao kèm màn mờ xuống đất
    if (!pts || pts.length < 4) { this.ribbon.visible = false; if (this.curtain) this.curtain.visible = false; return; }
    const n = pts.length / 2, pos = new Float32Array(n * 6), idx = [], cur = lift ? new Float32Array(n * 6) : null;
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      let tx = pts[b * 2] - pts[a * 2], tz = pts[b * 2 + 1] - pts[a * 2 + 1];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const x = pts[k * 2], z = pts[k * 2 + 1], g0 = this.roadY(x, z), y = (lift ? Math.max(heightAt(this.city, x, z), WATER_Y) + 0.25 + lift[k] : g0) + 0.5;
      pos.set([x + tz * half, y, z - tx * half, x - tz * half, y, z + tx * half], k * 6);
      if (cur) cur.set([x, y, z, x, Math.min(y, g0), z], k * 6);
      if (k) idx.push(k * 2 - 2, k * 2 - 1, k * 2, k * 2 - 1, k * 2 + 1, k * 2);
    }
    const g = this.ribbon.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    this.ribbon.material.color.set(color);
    this.ribbon.visible = true;
    if (!this.curtain) {
      this.curtain = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
      this.curtain.frustumCulled = false; this.curtain.renderOrder = 4; this.scene.add(this.curtain);
    }
    this.curtain.visible = !!cur;
    if (cur) { const cg = this.curtain.geometry; cg.setAttribute('position', new THREE.BufferAttribute(cur, 3)); cg.setIndex(idx); this.curtain.material.color.set(color); }
  }

  /** Vòng tròn xanh ở mọi nút đường khi cầm công cụ đường (như Cities: Skylines): thấy rõ chỗ bắt / nối, đầu cụt màu vàng. */
  setNodeMarks(on) { this.showNodes = on; if (on) this._nodeMarks(); else if (this.nodeRings) this.nodeRings.visible = false; }

  _nodeMarks() {
    const c = this.city;
    if (!this.nodeRings) {
      this.nodeRings = new THREE.InstancedMesh(new THREE.RingGeometry(3.2, 4.2, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthTest: false, depthWrite: false, side: THREE.DoubleSide }), 4096);
      this.nodeRings.frustumCulled = false; this.nodeRings.renderOrder = 5; this.scene.add(this.nodeRings);
    }
    const m = new THREE.Matrix4(), col = new THREE.Color();
    let k = 0;
    for (const [nid, list] of c.adj) {
      const n = c.nodes.get(nid);
      if (!n || k >= 4096) continue;
      m.makeTranslation(n.x, Math.max(heightAt(c, n.x, n.z), WATER_Y) + 0.25 + nodeH(c, nid) + 0.6, n.z);
      this.nodeRings.setMatrixAt(k, m);
      this.nodeRings.setColorAt(k++, col.set(list.length === 1 ? 0xffd24a : 0x5cc8ff));
    }
    this.nodeRings.count = k; this.nodeRings.instanceMatrix.needsUpdate = true;
    if (this.nodeRings.instanceColor) this.nodeRings.instanceColor.needsUpdate = true;
    this.nodeRings.visible = true;
  }

  /** Ẩn nhà và công trình (khi vẽ đường): còn đường, cây, mặt đất và lớp lưới quy hoạch. */
  setBuildingsHidden(on) {
    if (this.hideBld === on) return;
    this.hideBld = on;
    for (const k in this.growMeshes) this.growMeshes[k].visible = !on;
    for (const m of this.signMeshes || []) m.visible = !on;
    this.serviceGroup.visible = !on;
    this.city.dirty.zones = true;
  }

  /** Dấu tròn tại điểm bắt (vàng khi bám vào đường / nút có sẵn). */
  setMarker(pt, snapped, lift = 0) { // lift: độ cao điểm bắt so với mặt đất (đang vẽ cầu)
    if (!pt) { this.marker.visible = false; return; }
    this.marker.position.set(pt.x, (lift ? Math.max(heightAt(this.city, pt.x, pt.z), WATER_Y) + 0.25 + lift : this.roadY(pt.x, pt.z)) + 0.7, pt.z);
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
    const beams = this.lights > 0.12;
    let nb = 0;
    const put = (look, cap, color) => {
      if (beams && nb < MAX_BEAMS && !v_.wreck) this.beamMesh.setMatrixAt(nb++, m);
      let mesh = this.vehMeshes[look];
      if (!mesh) { mesh = this.vehMeshes[look] = this._inst(vehicleGeometry(look), this.vehMat, cap, true); vc[look] = 0; }
      const n = vc[look] || 0;
      if (n >= cap) return;
      mesh.setMatrixAt(n, m); mesh.setColorAt(n, color); vc[look] = n + 1;
    };
    let v_ = null;
    for (const v of c.traffic.vehicles) {
      v_ = v;
      const e = v.e, sa = v.fwd ? Math.min(v.s, e.len) : Math.max(0, e.len - v.s), pt = pointAt(e.pts, e.cum, sa), lift = ROADS[e.type].elevated ? this.edgeLift(e, sa) : 0;
      const sg = v.fwd ? 1 : -1, tx = pt[2] * sg, tz = pt[3] * sg, ls = LANES[e.type] || LANES.small, off = ls[Math.min(v.lane, ls.length - 1)] + (v.kind === 'moto' ? ((v.id % 5) - 2) * 0.32 : 0);
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
      else if (v.kind === 'bus') { if (beams && nb < MAX_BEAMS) this.beamMesh.setMatrixAt(nb++, m); if (nu < MAX_BUS) { this.busMesh.setMatrixAt(nu, m); this.busMesh.setColorAt(nu++, col.setHSL(v.color, 0.75, 0.52)); } }
      else if (v.kind === 'tram') { if (nt < MAX_BUS) { this.tramMesh.setMatrixAt(nt, m); this.tramMesh.setColorAt(nt++, col.setHSL(v.color, 0.7, 0.5)); } }
      else if (FIX[v.kind]) put(look, MAX_BIG, col.set(FIX[v.kind]));
      else put(look, MAX_BIG, v.wreck ? col.set(0x4a4a4a) : look === 'container' ? col.set(CONT[(v.id * 7 + ((v.color * 100) | 0)) % CONT.length]) : look === 'tanker' ? col.set(0xf4f4f4) : look === 'boxtruck' || look === 'deliveryvan' || look === 'reefer' ? col.setHSL(v.color, 0.25, 0.78) : col.setHSL(v.color, 0.5, 0.55));
    }
    // tàu metro 3 toa chạy trên ray cao, vạch sơn theo màu tuyến
    let nm = 0;
    s.set(1, 1, 1);
    for (const line of c.transit.lines) {
      if (line.mode !== 'metro' || line.stops.length < 2) continue;
      for (const slot of line.veh) {
        if (nm >= MAX_BUS) break;
        const pt = metroPoint(line, slot);
        p.set(pt[0], this._railY(pt[0], pt[1]) + 0.2, pt[1]); q.setFromAxisAngle(up, Math.atan2(pt[2], pt[3])); m.compose(p, q, s);
        this.metroMesh.setMatrixAt(nm, m); this.metroStripe.setMatrixAt(nm, m); this.metroStripe.setColorAt(nm++, col.setHSL(line.hue, 0.75, 0.5));
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
    this.beamMesh.count = nb; this.beamMesh.instanceMatrix.needsUpdate = true;
    for (const k in this.vehMeshes) { const mesh = this.vehMeshes[k]; mesh.count = vc[k] || 0; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    for (const [mesh, n] of [[this.busMesh, nu], [this.tramMesh, nt], [this.pedMesh, np], [this.metroMesh, nm], [this.metroStripe, nm]]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
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
        const x = pts[k * 2], z = pts[k * 2 + 1], y = this.roadY(x, z) + 0.6 + (ROADS[e.type].elevated ? this.edgeLift(e, e.cum[k]) : 0);
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
    const w = inc.weather, wet = w === 'rain' || w === 'hail' || w === 'storm';
    this.rain.visible = wet;
    if (wet) {
      const cx = this.cam.x, cz = this.cam.z, span = Math.min(700, this.cam.dist * 1.6), fall = w === 'hail' ? 80 : 140;
      this.rain.material.color.set(w === 'hail' ? 0xf4f8ff : w === 'storm' ? 0x8fa9c0 : 0xa9c4dc);
      for (let k = 0; k < this.rain.count; k++) {
        const hx = hash2(k, 1, 7), hz = hash2(k, 2, 7), hy = (hash2(k, 3, 7) * 120 - this.time * fall) % 120;
        m.makeScale(w === 'hail' ? 2.2 : 1, w === 'hail' ? 0.25 : 1, w === 'hail' ? 2.2 : 1).setPosition(cx + (hx - 0.5) * span, (hy < 0 ? hy + 120 : hy) + 2, cz + (hz - 0.5) * span); this.rain.setMatrixAt(k, m);
      }
      this.rain.instanceMatrix.needsUpdate = true;
    }
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

  /** Giờ trong ngày (0..24) dùng để dựng ánh sáng: theo đồng hồ game, hoặc cố định buổi sáng khi tắt chu kỳ ngày đêm. */
  timeOfDay() {
    const c = this.city;
    return this.dayNight ? (c.hour % 24) + clamp(c.clock / (c.hourSec || 5), 0, 1) : 10.5;
  }

  /** Ánh sáng theo giờ và thời tiết: hướng + màu mặt trời / mặt trăng, màu trời, sương mù, mặt nước, đèn đêm. */
  _sky(dt) {
    const c = this.city, inc = c.inc, w = inc.weather, storm = w === 'hail' || !!inc.tornado, wet = w === 'rain' || w === 'hail';
    const th = ((this.timeOfDay() - 12.5) / 24) * Math.PI * 2, e = Math.cos(th) + 0.25; // độ cao mặt trời: dương từ khoảng 5h30 tới 19h30
    const day = sstep(-0.08, 0.3, e), night = 1 - sstep(-0.32, 0.02, e), dusk = (1 - sstep(0, 0.42, Math.abs(e))) * (1 - night);
    const k = dt ? Math.min(1, dt * 2.5) : 1, A = this._skyA || (this._skyA = { top: new THREE.Color(), hor: new THREE.Color(), tmp: new THREE.Color(), body: new THREE.Vector3(), sunC: new THREE.Color() });
    const sunUp = e > 0.02;
    A.body.set(-Math.sin(th) * 0.85, e, 0.42);
    if (!sunUp) A.body.set(Math.sin(th) * 0.7, Math.max(0.25, -e * 0.8), -0.5); // mặt trăng ở phía đối diện
    A.body.normalize();
    this.sunDir.set(A.body.x, Math.max(A.body.y, sunUp ? 0.13 : 0.22), A.body.z).normalize(); // nắng xiên, bóng dài lúc sáng sớm / chiều tà
    const dim = storm ? 0.4 : wet ? 0.5 : 1;
    const target = sunUp ? 3.1 * sstep(-0.02, 0.2, e) * dim : 1.15 * sstep(0.02, 0.3, -e) * (wet ? 0.6 : 1);
    this.sun.intensity += (target - this.sun.intensity) * k;
    if (sunUp) A.sunC.set(0xff6a2e).lerp(A.tmp.set(0xffb06a), sstep(0.02, 0.18, e)).lerp(A.tmp.set(0xfff1d6), sstep(0.16, 0.55, e)); else A.sunC.set(0xa9c0f2); // đỏ cam sát chân trời → vàng nắng sớm → trắng trưa
    this.sun.color.lerp(A.sunC, k);
    this.hemi.intensity += ((0.62 + 0.18 * day + 0.22 * dusk) * (wet ? 0.85 : 1) - this.hemi.intensity) * k;
    this.hemi.color.lerp(A.tmp.set(0x5a74b8).lerp(A.top.set(0xdcebff), day).lerp(A.top.set(0xf0b28e), dusk * 0.45), k); // ánh trời ấm lên lúc hoàng hôn
    this.hemi.groundColor.lerp(A.tmp.set(0x2a3350).lerp(A.top.set(0x6f7f55), day), k);
    // màu trời
    A.top.set(0x0a1230).lerp(A.tmp.set(0x3f86d4), day).lerp(A.tmp.set(0x3d4f86), dusk * 0.5);
    A.hor.set(0x26365c).lerp(A.tmp.set(0xbfd9ee), day).lerp(A.tmp.set(0xf0a070), dusk * 0.7);
    if (wet || storm) { A.tmp.set(storm ? 0x7d8a96 : 0x9aa9b6).multiplyScalar(0.2 + 0.8 * day); A.top.lerp(A.tmp, 0.8); A.hor.lerp(A.tmp, 0.85); }
    const su = this.skyU, wu = this.waterU;
    su.uTop.value.lerp(A.top, k); su.uHor.value.lerp(A.hor, k);
    su.uBody.value.copy(A.body); su.uBodyCol.value.copy(A.sunC).multiplyScalar(sunUp ? (wet ? 0.3 : 1) : 0.55);
    su.uNight.value = night * (wet ? 0.2 : 1);
    const sunD = A.sunD || (A.sunD = new THREE.Vector3());
    sunD.set(-Math.sin(th) * 0.85, e, 0.42).normalize();
    su.uSunD.value.copy(sunD); su.uSunUp.value += ((sunUp ? (wet || storm ? 0.15 : 1) : 0) - su.uSunUp.value) * k;
    su.uDusk.value += (dusk * (wet || storm ? 0.25 : 1) - su.uDusk.value) * k;
    su.uGlow.value.set(0xff5a24).lerp(A.tmp.set(0xffb070), sstep(-0.05, 0.3, e));
    // đốm chói nắng: to và vàng cam lúc mặt trời thấp
    const gl = this.glare, gs = 520 + 380 * su.uDusk.value;
    gl.position.copy(this.camera.position).addScaledVector(sunD, 2400); gl.scale.set(gs, gs, 1);
    gl.material.color.copy(A.sunC); gl.material.opacity = su.uSunUp.value * sstep(-0.02, 0.06, e) * 0.55;
    this.sunV.value.copy(this.sunDir).transformDirection(this.camera.matrixWorldInverse); this.sunCol.value.copy(this.sun.color).multiplyScalar(Math.min(1.2, this.sun.intensity / 2.2) * (1 + su.uDusk.value * 0.6)); // lá ngược nắng chiều sáng rõ hơn
    su.uCloud.value += ((storm ? 1 : wet ? 0.85 : c.inc.weather === 'dry' ? 0.05 : 0.3) - su.uCloud.value) * k;
    this.scene.fog.color.copy(su.uHor.value); this.scene.background.copy(su.uHor.value);
    { // bụi mịn: trời mù, sương khói ngả xám nâu, nhìn không xa
      const aqi = this.city && this.city.street ? this.city.street.aqi : 0, k = clamp((aqi - 90) / 220, 0, 0.65);
      this.scene.fog.near = 700 - k * 600; this.scene.fog.far = 2600 - k * 1900;
      if (k > 0) { this._haze = this._haze || new THREE.Color(0x9c9284); this.scene.fog.color.lerp(this._haze, k); this.scene.background.lerp(this._haze, k * 0.8); }
    }
    wu.uSun.value.copy(this.sunDir); wu.uSunCol.value.copy(this.sun.color).multiplyScalar(this.sun.intensity / 3.1);
    wu.uSkyTop.value.copy(su.uTop.value); wu.uSkyHor.value.copy(su.uHor.value);
    wu.uLight.value = (0.32 + 0.68 * day) * (wet ? 0.8 : 1);
    // đèn đêm: bật từ lúc chạng vạng
    const lights = this.lights = 1 - sstep(-0.1, 0.2, e);
    this.matBuilding.emissiveIntensity = lights * 1.5;
    this.glowMat.opacity = lights * 0.5; this.beamMat.opacity = lights * 0.55;
    this.lampHeadMat.color.set(0x8d897c).lerp(A.tmp.set(0xfff1c4), lights);
    this.sky.position.copy(this.camera.position);
  }

  /** dt: giây thật; simDt: giây đã nhân tốc độ game (0 khi tạm dừng) */
  update(dt, simDt) {
    const c = this.city, d = c.dirty;
    this.time += dt; this.uTime.value = this.time;
    if (d.terrain || d.services) this.ships = null; // mặt nước hoặc bến đổi: tìm lại tuyến tàu
    if (d.terrain) { if (d.terrain === 2) this._rebuildTerrain(); else this._terrainSync(); d.terrain = 0; }
    if (d.buildings) d.trees = true; // đá, bụi cây nhường chỗ cho nhà mới mọc
    if (d.buildings) {
      // ghi thời điểm nhà mới xuất hiện để làm hiệu ứng mọc
      if (!this.bornAt || this.bornCity !== c) { this.bornAt = new Float32Array(N * N).fill(-9); this.bornKey = new Uint8Array(N * N); this.bornCity = c; for (let i = 0; i < N * N; i++) this.bornKey[i] = c.level[i]; }
      for (let i = 0; i < N * N; i++) if (c.level[i] !== this.bornKey[i]) { if (c.level[i]) this.bornAt[i] = this.time; this.bornKey[i] = c.level[i]; }
    }
    if (d.land) { this._land(); d.land = false; }
    if (d.roads) { this._roads(); d.roads = false; if (this.showNodes) this._nodeMarks(); }
    if (d.lines) { this._lines(); d.lines = false; }
    if (d.buildings || this._animating) { this._animating = this._buildings(); d.buildings = false; d.zones = true; }
    if (d.trees) { this._trees(); d.trees = false; }
    if (d.services) { this._services(); this._hydro(); d.services = false; d.water = true; }
    if (d.transit) { this._transit(); d.transit = false; }
    if (d.fx) { this.fireCells = []; for (let i = 0; i < N * N; i++) if (c.fire[i] || c.inc.wild[i]) this.fireCells.push(i); d.fx = false; }
    if (d.zones) { this._zones(); d.zones = false; }
    if (d.beach || d.terrain === 2) { this._beachProps(); d.beach = false; }
    if (d.decor || d.terrain === 2) { this._decor(); d.decor = false; }
    if (d.falls || d.terrain === 2) { this._falls(); d.falls = false; }
    if (d.fishery || d.water || d.terrain === 2 || !this._fishAt || this.time - this._fishAt > 20) { this._fishing(); d.fishery = false; }
    this._fishBoats(simDt);
    if (d.water || d.terrain || !this._flowFor || this._flowFor !== c) { this._flowSync(); d.water = false; }
    if (this.fallTex) this.fallTex.offset.y -= dt * 1.6; // nước đổ
    if (this.fallTex2) { this.fallTex2.offset.y -= dt * 2.7; this.fallTex2.offset.x = Math.sin(this.time * 0.7) * 0.02; }
    if (this.foamTex) this.foamTex.offset.x += dt * 0.15;
    if (this.brookTex) this.brookTex.offset.y -= dt * 0.5;
    this._spray(Math.min(dt, 0.05));
    if (d.rail || d.terrain === 2 || this._railSvcSig !== this._svcSig()) { this._rail(); d.rail = false; }
    if (this.overlayMode === 'traffic' && (this._tlAt === undefined || this.time - this._tlAt > 0.8)) { this._tlAt = this.time; this._trafficLayer(); }
    this._vehicles(dt);
    this._animals(simDt);
    this._flames();
    this._gatePulse(dt);
    this._ships(simDt);
    this._intl();
    this._weather(dt);
    this._floodWater();
    this._fireworks(simDt, dt);
    this._smoke(simDt);
    for (const sp of this.spinners) sp.rotation.z -= simDt * 1.6;
    this._movers(simDt);
    this._strollers(simDt);
    if (this.fallsGroup) { const day = (c.hour % 24) >= 7 && (c.hour % 24) <= 17; for (const o of this.fallsGroup.children) { if (o.userData.mist) { const u = o.userData.mist, k = 1 + Math.sin(this.time * 2.2 + u.ph) * 0.18; o.scale.set(u.r * k, u.r * 0.6 * k, u.r * k); } else if (o.userData.rainbow) { o.visible = day; o.quaternion.copy(this.camera.quaternion); } } }
    if (this.hydroGroup) for (const o of this.hydroGroup.children) if (o.userData.mist) { const u = o.userData.mist, k = 1 + Math.sin(this.time * 2.2 + u.ph) * 0.18; o.scale.set(u.r * k, u.r * 0.6 * k, u.r * k); }
    this._railTrains();
    if (this.siteAnims && this.siteAnims.length) { // công trường: máy xúc xoay gầu, xe chạy qua lại, cần cẩu quay
      const t = (this.siteT = (this.siteT || 0) + simDt);
      for (const a of this.siteAnims) {
        if (a.kind === 'swing') a.o.rotation.y = a.base + Math.sin(t * 0.7 + a.ph) * 1.1;
        else if (a.kind === 'crane') a.o.rotation.y = a.base + Math.sin(t * 0.18 + a.ph) * 1.4;
        else { const f = 0.5 - 0.5 * Math.cos(t * a.sp + a.ph); a.o.position.x = a.x + a.dx * (f - 0.5); a.o.position.z = a.z + a.dz * (f - 0.5); }
      }
    }
    this._camera(dt);
    this._sky(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

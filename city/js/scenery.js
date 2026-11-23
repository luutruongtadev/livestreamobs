// Phố Mới — cảnh quan quanh bản đồ, dựng theo cách của landscape.html:
// độ cao giải tích (đồi của bản đồ + dãy núi ridged multifractal trên không gian làm cong) → xói mòn thủy lực (giọt nước)
// → các trường phụ (dòng chảy, bồi tích, độ cong, chân vách, độ ẩm, mật độ rừng) làm thuộc tính đỉnh cho shader trộn chất liệu
// → lưới chia mảnh 4 mức LOD có váy che khe → rừng, bụi, đá InstancedMesh theo mảnh, giảm số cây theo khoảng cách
// → vòng xa tới chân trời → bóng núi nướng sẵn (tính dần từng hàng mỗi khung hình) → mây 3D có bóng khớp vị trí.
// Chỉ là phần nhìn: lối chơi trong bản đồ vẫn dùng độ cao của mô phỏng.
import * as THREE from '../vendor/three.module.min.js';
import { N, T, HALF, clamp, mulberry32 } from './sim.js';

const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
export const SC_CH = 128;                  // ô mỗi cạnh một mảnh
const LOD_STEPS = [1, 2, 4, 8];
export const BAKE = 224;                   // độ phân giải bóng núi nướng sẵn
const FAR_R = 10000;                       // vòng xa tới đây (m)
const MAX_CLOUDS = 16;

// ───────────── nhiễu
export function makeSimplex(seed) {
  const r = mulberry32(seed), p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
  const gx = new Int8Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0]), gy = new Int8Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1]);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = pm[ii + perm[jj]]; t0 *= t0; n += t0 * t0 * (gx[g] * x0 + gy[g] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = pm[ii + i1 + perm[jj + j1]]; t1 *= t1; n += t1 * t1 * (gx[g] * x1 + gy[g] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = pm[ii + 1 + perm[jj + 1]]; t2 *= t2; n += t2 * t2 * (gx[g] * x2 + gy[g] * y2); }
    return 70 * n;
  };
}
export function fbm(Nf, x, y, oct, lac = 2.03, gain = 0.5) {
  let s = 0, a = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * Nf(x * f + i * 17.3, y * f - i * 9.1); norm += a; a *= gain; f *= lac; }
  return s / norm;
}
/** Ridged multifractal (Musgrave): sống núi sắc, các lớp nhỏ bám theo sống lớn. 0..~0.8 */
export function ridged(Nf, x, y, oct) {
  let sum = 0, f = 1, a = 1, w = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(Nf(x * f + i * 31.7, y * f - i * 12.9));
    n *= n; n *= w;
    w = clamp(n * 1.9, 0, 1);
    sum += n * a; norm += a;
    a *= 0.52; f *= 2.07;
  }
  return sum / norm;
}

/**
 * Xói mòn thủy lực kiểu giọt nước trên lưới W×W (độ cao tính bằng mét, mỗi bước một ô).
 * mask: xác suất thả giọt ở mỗi ô (0..1). flow, depo: cộng dồn lượng nước đi qua, lượng bồi tích. Chạy đồng bộ.
 */
export function erode(h, W, mask, flow, depo, count, rnd, cellM = 8) {
  const MAXX = W - 2, k = cellM / 7.8; // tham số chỉnh cho ô ~7,8 m (như landscape), quy đổi theo cỡ ô
  const inertia = 0.3, capK = 0.12 * k, minCap = 0.02, depK = 0.25, eroK = 0.13, evap = 0.022, grav = 0.35 / k, life = 50;
  const BR = 4, bo = [], bw = [];
  let ws = 0;
  for (let oz = -BR; oz <= BR; oz++) for (let ox = -BR; ox <= BR; ox++) {
    const d = Math.hypot(ox, oz); if (d > BR) continue;
    const wg = 1 - d / (BR + 0.5); bo.push(oz * W + ox); bw.push(wg); ws += wg;
  }
  for (let q = 0; q < bw.length; q++) bw[q] /= ws;
  const bil = (px, pz) => { const ix = px | 0, iz = pz | 0, fx = px - ix, fz = pz - iz, i = iz * W + ix; return h[i] * (1 - fx) * (1 - fz) + h[i + 1] * fx * (1 - fz) + h[i + W] * (1 - fx) * fz + h[i + W + 1] * fx * fz; };
  for (let d = 0; d < count; d++) {
    let px = 0, pz = 0, ok = false;
    for (let tr = 0; tr < 40; tr++) { px = 5 + rnd() * (W - 11); pz = 5 + rnd() * (W - 11); if (rnd() < mask[(pz | 0) * W + (px | 0)]) { ok = true; break; } }
    if (!ok) continue;
    let dx = 0, dz = 0, speed = 1, water = 1, sed = 0;
    for (let it = 0; it < life; it++) {
      const ix = px | 0, iz = pz | 0, fx = px - ix, fz = pz - iz, i = iz * W + ix;
      const h00 = h[i], h10 = h[i + 1], h01 = h[i + W], h11 = h[i + W + 1];
      const gx = (h10 - h00) * (1 - fz) + (h11 - h01) * fz, gz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      const hc = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
      dx = dx * inertia - gx * (1 - inertia); dz = dz * inertia - gz * (1 - inertia);
      const len = Math.hypot(dx, dz);
      if (len < 1e-7) break;
      dx /= len; dz /= len; px += dx; pz += dz;
      if (px < 5 || pz < 5 || px >= MAXX - 4 || pz >= MAXX - 4) break;
      flow[i] += water;
      const dh = bil(px, pz) - hc;
      const cap = Math.max(-dh * speed * water * capK, minCap);
      if (sed > cap || dh > 0) {
        const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * depK;
        sed -= amt;
        h[i] += amt * (1 - fx) * (1 - fz); h[i + 1] += amt * fx * (1 - fz); h[i + W] += amt * (1 - fx) * fz; h[i + W + 1] += amt * fx * fz;
        depo[i] += amt;
      } else {
        const amt = Math.min((cap - sed) * eroK, -dh);
        for (let q = 0; q < bo.length; q++) h[i + bo[q]] -= amt * bw[q];
        sed += amt;
      }
      speed = Math.min(8, Math.sqrt(Math.max(0, speed * speed - dh * grav)));
      water *= 1 - evap;
    }
  }
}

export function boxBlur(src, W, r, passes = 1) {
  let a = Float32Array.from(src); const b = new Float32Array(src.length), inv = 1 / (2 * r + 1);
  const ci = (v) => v < 0 ? 0 : v > W - 1 ? W - 1 : v;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < W; y++) {
      const row = y * W; let s = 0;
      for (let x = -r; x <= r; x++) s += a[row + ci(x)];
      for (let x = 0; x < W; x++) { b[row + x] = s * inv; s += a[row + ci(x + r + 1)] - a[row + ci(x - r)]; }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += b[ci(y) * W + x];
      for (let y = 0; y < W; y++) { a[y * W + x] = s * inv; s += b[ci(y + r + 1) * W + x] - b[ci(y - r) * W + x]; }
    }
  }
  return a;
}

/**
 * Hàm độ cao quanh bản đồ (toạ độ đỉnh lưới ô gx, gy, số nguyên): đồi / mặt nước của bản đồ (hf.height) + dãy núi lớn
 * mọc dần theo khoảng cách ra khỏi mép bản đồ, chỉ ở hướng có đất liền (biển vẫn là biển, sông chảy tiếp thành thung lũng).
 */
export function surroundHeight(hf, seed, border) {
  const Ns = makeSimplex(seed + 7), Nw = makeSimplex(seed + 8), Nm = makeSimplex(seed + 9);
  const start = border * T;
  const fn = (gx, gy) => {
    const h0 = hf.height(gx, gy), x = gx * T - HALF, z = gy * T - HALF;
    const dx = Math.max(Math.abs(x) - HALF, 0), dz = Math.max(Math.abs(z) - HALF, 0), d = Math.hypot(dx, dz);
    if (d <= start) return h0;
    const ramp = sstep(start + 30, start + 1250, d + 140 * Nw(x * 0.0007, z * 0.0007));
    const land = clamp((hf.f(gx, gy) - 1.6) / 9, 0, 1);
    if (ramp <= 0 || land <= 0) return h0;
    const qx = x + 320 * fbm(Nw, x * 0.0005 + 5.2, z * 0.0005 + 1.3, 3), qz = z + 320 * fbm(Nw, x * 0.0005 - 3.7, z * 0.0005 + 8.1, 3);
    const r = ridged(Nm, qx * 0.0011, qz * 0.0011, 6);
    const mass = clamp(0.55 + 0.6 * fbm(Ns, x * 0.0004 + 11, z * 0.0004, 2), 0.2, 1.1);
    const mid = fbm(Ns, qx * 0.006, qz * 0.006, 3);
    const m = Math.pow(land, 1.3) * ramp;
    return h0 + m * (22 + mass * (45 + 520 * r) + 10 * mid * m);
  };
  return fn;
}

// ───────────── shader chất liệu (port TERRAIN_COLOR của landscape, quy đổi theo tỉ lệ độ cao của game, không tuyết)
export const GLSL_LAND = `vec3 landColor(out vec3 col, out float rough, vec3 P, vec3 Nw, vec4 d1, vec4 d2) {
  float dist = length(P - cameraPosition), slope = 1.0 - Nw.y;
  float fade = 1.0 - smoothstep(600.0, 3200.0, dist), fadeN = 1.0 - smoothstep(80.0, 600.0, dist);
  float wy = P.y + 0.9;                        // cao hơn mặt nước bao nhiêu
  float nA = lsN(P.xz * 0.0023) * 0.5 + lsN(P.xz * 0.0046 + 3.7) * 0.3 + lsN(P.xz * 0.0092 + 1.1) * 0.2;
  float nB = lsN(P.xz * 0.017), nC = lsN(P.xz * 0.085 + 13.1), nD = lsN(P.xz * 0.41 + 7.7);
  float flow = d1.x, depo = d1.y, curv = d1.z, forest = d1.w, cliff = d2.x, moist = d2.z, dryN = d2.w;
  float hh = wy * 2.3 + (nA - 0.5) * 110.0 + (nB - 0.5) * 30.0; // độ cao quy đổi về thang của landscape (núi game thấp hơn)
  col = mix(vec3(0.10, 0.235, 0.048), vec3(0.17, 0.29, 0.07), smoothstep(0.3, 0.75, nA));   // cùng tông cỏ của bản đồ
  col = mix(col, vec3(0.075, 0.18, 0.04), smoothstep(0.45, 0.85, nB) * 0.6);
  col *= 0.86 + 0.26 * nC * fade + 0.2 * (nD - 0.5) * fadeN;
  col = mix(col, vec3(0.08, 0.2, 0.04), moist * 0.45);
  col = mix(col, vec3(0.035, 0.075, 0.018), forest * 0.8);
  float dry = smoothstep(150.0, 380.0, hh) * (1.0 - forest * 0.6);
  dry = max(dry, smoothstep(0.66, 0.86, nB * 0.55 + dryN * 0.55) * (1.0 - moist) * (1.0 - forest) * 0.6);
  vec3 dryC = mix(vec3(0.30, 0.23, 0.10), vec3(0.18, 0.14, 0.066), nC);
  dryC = mix(dryC, vec3(0.19, 0.19, 0.066), smoothstep(0.45, 0.85, nB) * 0.55);
  col = mix(col, dryC, clamp(dry, 0.0, 1.0));
  float shrub = smoothstep(0.7, 0.8, lsN(P.xz * 0.15 + 4.0)) * clamp(dry, 0.0, 1.0) * fade;
  col = mix(col, vec3(0.04, 0.056, 0.015), shrub * 0.75);
  float soil = smoothstep(0.6, 0.95, slope * 2.2 * smoothstep(300.0, 700.0, hh) + flow * 0.55 * smoothstep(120.0, 400.0, hh) + (nB - 0.5) * 0.4);
  col = mix(col, mix(vec3(0.30, 0.20, 0.10), vec3(0.19, 0.12, 0.06), nC), soil * 0.85);
  float grav = clamp(cliff * 1.5 + depo * 0.9 - 0.15, 0.0, 1.0) * (0.6 + 0.4 * nC);
  col = mix(col, mix(vec3(0.28, 0.26, 0.22), vec3(0.16, 0.15, 0.13), nD), grav);
  float sand = 1.0 - smoothstep(0.5, 1.6, wy + (nC - 0.5) * 1.0);
  col = mix(col, mix(vec3(0.58, 0.47, 0.27), vec3(0.46, 0.37, 0.2), nD), sand);
  col = mix(col, vec3(0.24, 0.19, 0.12), (1.0 - smoothstep(0.0, 0.4, wy)) * sand);
  col = mix(col, vec3(0.07, 0.1, 0.07), smoothstep(0.0, 5.0, -wy));
  float rockThr = 0.27 - 0.08 * smoothstep(850.0, 1250.0, hh);
  float rock = smoothstep(rockThr - 0.04, rockThr + 0.05, slope + (nB - 0.5) * 0.1 - (curv - 0.5) * 0.12);
  float rf = lsN3(P * 0.06) * 0.35 + lsN3(P * 0.21) * 0.4 + lsN3(P * 0.7) * 0.25;
  float streak = lsN3(vec3(P.x * 0.22, P.y * 0.018, P.z * 0.22)) * 0.65 + lsN3(vec3(P.x * 0.7, P.y * 0.05, P.z * 0.7)) * 0.35;
  float strata = sin(P.y * 0.42 + lsN3(P * 0.015) * 7.0 + nB * 2.0);
  vec3 rockC = mix(vec3(0.17, 0.14, 0.12), vec3(0.37, 0.32, 0.25), rf * 0.55 + streak * 0.45);
  rockC = mix(rockC, vec3(0.30, 0.21, 0.14), smoothstep(0.3, 0.9, strata) * 0.35);
  rockC *= 1.0 - smoothstep(0.55, 0.85, streak) * 0.25;
  rockC = mix(rockC, vec3(0.26, 0.15, 0.07), smoothstep(200.0, 60.0, hh) * 0.35 * smoothstep(0.35, 0.65, nB));
  rockC *= 0.85 + 0.25 * rf - max(curv - 0.5, 0.0) * 0.6;
  col = mix(col, rockC, rock);
  col *= 1.0 - flow * 0.12;
  rough = mix(0.95, 0.78, rock);
  vec3 b = vec3(0.0);
  if (uLsBump > 0.5 && fadeN > 0.0) {
    vec3 q = P * vec3(1.4, 0.9, 1.4);
    float f0 = lsN3(q), fx = lsN3(q + vec3(0.8, 0.0, 0.0)), fy = lsN3(q + vec3(0.0, 0.8, 0.0)), fz = lsN3(q + vec3(0.0, 0.0, 0.8));
    vec3 g = vec3(fx - f0, fy - f0, fz - f0) / 0.8;
    g -= Nw * dot(g, Nw);
    b = -g * (rock * 2.2 + grav * 0.8 + 0.35) * fadeN;
  }
  return b;
}`;

// ───────────── mây 3D (sprite quay về camera), bóng mây khớp vị trí mây
const CLOUD_VERT = `attribute vec3 aOrigin; attribute vec4 aPar;
varying vec2 vUv; varying float vA; varying float vShade;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  float size = aPar.x, rot = aPar.w * 6.283;
  vec2 c = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * ((uv - 0.5) * size);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = aOrigin + right * c.x + up * c.y;
  vA = aPar.y * smoothstep(60.0, 320.0, distance(aOrigin, cameraPosition));
  vShade = clamp(clamp(0.5 + (wp.y - aOrigin.y) / size * 1.1, 0.0, 1.0) * 0.6 + aPar.z * 0.6, 0.0, 1.0);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const CLOUD_FRAG = `uniform sampler2D uTex; uniform vec3 uLit, uShade;
varying vec2 vUv; varying float vA; varying float vShade;
#include <common>
#include <fog_pars_fragment>
void main() {
  float a = texture2D(uTex, vUv).a * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(uShade, uLit, vShade), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * Cảnh quan quanh bản đồ. view: đối tượng View (scene, uniform LS, vật liệu cây / đá, mặt đất).
 */
export class Scenery {
  constructor(view, opts) {
    this.view = view; this.o = opts; // { groundMat, treeMat, rockMat, treeGeos: [round, pine, bush], rockGeo, LS, cloudTex }
    this.group = new THREE.Group(); view.scene.add(this.group);
    this.chunks = []; this.key = '';
    this.bakeData = new Uint8Array(BAKE * BAKE).fill(255); this.bakeBack = new Uint8Array(BAKE * BAKE).fill(255);
    this.bakeTex = new THREE.DataTexture(this.bakeData, BAKE, BAKE, THREE.RedFormat, THREE.UnsignedByteType);
    this.bakeTex.magFilter = this.bakeTex.minFilter = THREE.LinearFilter; this.bakeTex.needsUpdate = true;
    opts.LS.uBk.value = this.bakeTex;
    this.bakeRow = 0;
    // mây
    const cg = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1);
    cg.index = base.index; cg.setAttribute('position', base.attributes.position); cg.setAttribute('uv', base.attributes.uv);
    const CAP = MAX_CLOUDS * 26;
    cg.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3).setUsage(THREE.DynamicDrawUsage));
    cg.setAttribute('aPar', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage));
    cg.instanceCount = 0;
    this.cloudU = { lit: { value: new THREE.Color(1, 1, 1) }, shade: { value: new THREE.Color(0.6, 0.65, 0.7) } };
    this.clouds = new THREE.Mesh(cg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
      uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), { uTex: { value: opts.cloudTex }, uLit: this.cloudU.lit, uShade: this.cloudU.shade }),
    }));
    this.clouds.frustumCulled = false; this.clouds.renderOrder = 6;
    view.scene.add(this.clouds);
    this.cloudDefs = [];
  }

  /** Dựng lại (chỉ khi đổi thành phố / cỡ bản đồ: đào đắp trong bản đồ không động tới cảnh quan bên ngoài). */
  build(city, hf, border) {
    const key = `${city.seed}|${city.map}|${N}|${T}|${city.tgen}`;
    if (key === this.key) return false;
    this.key = key;
    const t0 = performance.now();
    this.dispose();
    const seed = city.seed | 0, R = mulberry32(seed * 31 + 7);
    // lưới: thẳng hàng với lưới ô của bản đồ, rộng ra mỗi phía K ô (~2,7 km), cạnh chia hết cho cỡ mảnh
    let G = N + 2 * (border + Math.ceil(2700 / T)); G = Math.ceil(G / SC_CH) * SC_CH;
    const K = (G - N) / 2, V = G + 1;
    Object.assign(this, { G, K, V, border, gx0: -K, x0: -HALF - K * T, ext: G * T });
    const hole0 = K - border, hole1 = K + N + border; // ô lưới thuộc mặt đất của bản đồ (kể cả viền): ở đó không dựng lưới cảnh quan
    this.hole = [hole0, hole1];
    const Hs = this.Hs = surroundHeight(hf, seed, border);
    const base = new Float32Array(V * V);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) base[j * V + i] = Hs(i - K, j - K);
    // xói mòn: chỉ ở đồi núi, tránh xa mép bản đồ và mép ngoài
    const mask = new Float32Array(V * V);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const x = (i - K) * T - HALF, z = (j - K) * T - HALF;
      const d = Math.hypot(Math.max(Math.abs(x) - HALF, 0), Math.max(Math.abs(z) - HALF, 0));
      const outer = sstep(this.ext / 2, this.ext / 2 - 250, Math.max(Math.abs(x), Math.abs(z)));
      mask[j * V + i] = sstep(12, 70, base[j * V + i]) * sstep(border * T + 60, border * T + 300, d) * outer;
    }
    const hE = Float32Array.from(base), flow = new Float32Array(V * V), depo = new Float32Array(V * V);
    erode(hE, V, mask, flow, depo, Math.round(110000 * (V * V) / (769 * 769)), mulberry32(seed * 3 + 1), T);
    const hS = boxBlur(hE, V, 1, 1);
    const H = this.H = new Float32Array(V * V);
    for (let i = 0; i < H.length; i++) {
      const k = mask[i] * sstep(2, 14, base[i]);
      let d = lerp(hE[i], hS[i], 0.5 * mask[i]) - base[i];
      d = d < 0 ? -22 * Math.tanh(-d / 22) : 11 * Math.tanh(d / 11);
      H[i] = base[i] + d * k;
    }
    const F = this._fields(H, flow, depo, R);
    this._meshes(F);
    this._far(Hs);
    this._vegetation(F, R);
    this._cloudsBuild(seed);
    this.bakeRow = 0; this.bakeSun = null;
    this.ms = performance.now() - t0;
    return true;
  }

  /** Độ cao cảnh quan tại toạ độ đỉnh lưới ô (gx, gy) của bản đồ (số nguyên; dùng cho viền bản đồ cho liền mạch). */
  heightCell(gx, gy) {
    const i = gx + this.K, j = gy + this.K;
    if (this.H && i >= 0 && j >= 0 && i < this.V && j < this.V) return this.H[j * this.V + i];
    return this.Hs ? this.Hs(gx, gy) : 0;
  }
  /** Độ cao tại toạ độ thế giới (nội suy) — trong lưới thì có xói mòn, ngoài lưới thì theo vòng xa. */
  heightAt(x, z) {
    const fi = (x - this.x0) / T, fj = (z - this.x0) / T;
    if (this.H && fi >= 0 && fj >= 0 && fi < this.G && fj < this.G) {
      const i = fi | 0, j = fj | 0, u = fi - i, v = fj - j, V = this.V, H = this.H, k = j * V + i;
      return lerp(lerp(H[k], H[k + 1], u), lerp(H[k + V], H[k + V + 1], u), v);
    }
    if (this.farH) {
      const n = this.farN + 1, fu = (x + this.farR) / this.farStep, fv = (z + this.farR) / this.farStep;
      if (fu < 0 || fv < 0 || fu >= this.farN || fv >= this.farN) return 0;
      const i = fu | 0, j = fv | 0, u = fu - i, v = fv - j, A = this.farH, k = j * n + i;
      return lerp(lerp(A[k], A[k + 1], u), lerp(A[k + n], A[k + n + 1], u), v);
    }
    return 0;
  }

  _fields(h, flow, depo, R) {
    const V = this.V, n = V * V;
    const nrm = new Float32Array(n * 3), slope = new Float32Array(n);
    let maxH = 0;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i;
      const hl = h[j * V + Math.max(i - 1, 0)], hr = h[j * V + Math.min(i + 1, V - 1)], hd = h[Math.max(j - 1, 0) * V + i], hu = h[Math.min(j + 1, V - 1) * V + i];
      const gx = (hr - hl) / (2 * T), gz = (hu - hd) / (2 * T), l = Math.hypot(gx, 1, gz);
      nrm[k * 3] = -gx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = -gz / l;
      slope[k] = Math.hypot(gx, gz);
      if (h[k] > maxH) maxH = h[k];
    }
    this.maxH = maxH;
    const blurH = boxBlur(h, V, 3, 2);
    const curv = new Float32Array(n), steep = new Float32Array(n), wet = new Float32Array(n);
    for (let k = 0; k < n; k++) { curv[k] = clamp(0.5 + (blurH[k] - h[k]) / 14, 0, 1); steep[k] = slope[k] > 0.84 ? 1 : 0; wet[k] = h[k] < -0.6 ? 1 : 0; }
    const cliff = boxBlur(steep, V, 3, 2), moist0 = boxBlur(wet, V, 9, 3);
    const flowB = boxBlur(flow.map((v) => Math.log1p(v)), V, 1, 1), depB = boxBlur(depo, V, 2, 1);
    const Nf = makeSimplex(this.key.length * 977 + 13), Nd = makeSimplex(71), Nc = makeSimplex(73);
    const forest = new Float32Array(n), moist = new Float32Array(n), dryN = new Float32Array(n);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i, x = (i - this.K) * T - HALF, z = (j - this.K) * T - HALF, hh = h[k] + 0.9, hz = hh * 2.3;
      const fl = clamp(flowB[k] / 5, 0, 1);
      moist[k] = clamp(moist0[k] * 1.6 + fl * 0.35, 0, 1);
      dryN[k] = 0.5 + 0.5 * Nd(x * 0.004, z * 0.004);
      let f = 0.5 + 0.5 * fbm(Nf, x * 0.0022, z * 0.0022, 3);
      f = sstep(0.44, 0.62, f + moist[k] * 0.22 + 0.08 * Nc(x * 0.012, z * 0.012));
      const foot = sstep(70, 170, hz) * (1 - sstep(380, 640, hz + 60 * Nc(x * 0.003 + 5, z * 0.003)));
      f = Math.max(f, foot * sstep(0.3, 0.55, 0.5 + 0.5 * Nd(x * 0.004 + 9, z * 0.004)));
      f *= 1 - 0.55 * sstep(420, 700, hz);
      f *= 1 - sstep(720, 900, hz + 70 * Nc(x * 0.005, z * 0.005));
      f *= 1 - sstep(0.5, 0.8, slope[k]);
      f *= sstep(0.9, 2.6, hh);
      forest[k] = f;
    }
    const forestB = boxBlur(forest, V, 1, 1);
    const A1 = new Uint8Array(n * 4), A2 = new Uint8Array(n * 4);
    for (let k = 0; k < n; k++) {
      A1[k * 4] = clamp(flowB[k] / 5, 0, 1) * 255; A1[k * 4 + 1] = clamp(depB[k] * 1.5, 0, 1) * 255; A1[k * 4 + 2] = curv[k] * 255; A1[k * 4 + 3] = forestB[k] * 255;
      A2[k * 4] = clamp(cliff[k] * 1.3, 0, 1) * (1 - sstep(0.7, 0.9, slope[k])) * 255; A2[k * 4 + 1] = 0; A2[k * 4 + 2] = moist[k] * 255; A2[k * 4 + 3] = dryN[k] * 255;
    }
    this.A1 = A1; this.A2 = A2;
    return { nrm, slope, A1, A2, forest, moist, cliff };
  }

  _meshes(F) {
    const { G, V, H, hole } = this, NC = G / SC_CH, idxCache = {};
    const inHole = (ci, cj) => ci >= hole[0] && cj >= hole[0] && ci < hole[1] && cj < hole[1];
    const indexFor = (step, skipHole, ci, cj) => {
      const key = `${step}`;
      const n = SC_CH / step + 1;
      const edges = [Array.from({ length: n }, (_, k) => k), Array.from({ length: n }, (_, k) => (n - 1) * n + k), Array.from({ length: n }, (_, k) => k * n), Array.from({ length: n }, (_, k) => k * n + n - 1)];
      if (!skipHole && idxCache[key]) return { idx: idxCache[key], edges, n };
      const idx = [];
      for (let b = 0; b < n - 1; b++) for (let a = 0; a < n - 1; a++) {
        if (skipHole && inHole(ci * SC_CH + a, cj * SC_CH + b)) continue;
        const i = b * n + a; idx.push(i, i + n, i + 1, i + 1, i + n, i + n + 1);
      }
      edges.forEach((list, e) => {
        for (let k = 0; k < n - 1; k++) {
          const a = list[k], b = list[k + 1], sa = n * n + e * n + k, sb = sa + 1;
          idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa);
        }
      });
      const attr = new THREE.BufferAttribute(new Uint16Array(idx), 1);
      if (!skipHole) idxCache[key] = attr;
      return { idx: attr, edges, n };
    };
    for (let cj = 0; cj < NC; cj++) for (let ci = 0; ci < NC; ci++) {
      const i0 = ci * SC_CH, j0 = cj * SC_CH;
      const touch = i0 < hole[1] && j0 < hole[1] && i0 + SC_CH > hole[0] && j0 + SC_CH > hole[0];
      if (touch && i0 >= hole[0] && j0 >= hole[0] && i0 + SC_CH <= hole[1] && j0 + SC_CH <= hole[1]) continue; // nằm trọn trong bản đồ
      const lods = []; let minY = 1e9, maxY = -1e9;
      for (let li = 0; li < (touch ? 1 : LOD_STEPS.length); li++) {
        const step = LOD_STEPS[li], { idx, edges, n } = indexFor(step, touch, ci, cj);
        const vc = n * n + 4 * n;
        const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), a1 = new Uint8Array(vc * 4), a2 = new Uint8Array(vc * 4), col = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), mix = new Float32Array(vc).fill(1);
        const put = (v, gi, i, j, dy) => {
          pos[v * 3] = this.x0 + i * T; pos[v * 3 + 1] = H[gi] - dy; pos[v * 3 + 2] = this.x0 + j * T;
          nor[v * 3] = F.nrm[gi * 3]; nor[v * 3 + 1] = F.nrm[gi * 3 + 1]; nor[v * 3 + 2] = F.nrm[gi * 3 + 2];
          for (let q = 0; q < 4; q++) { a1[v * 4 + q] = F.A1[gi * 4 + q]; a2[v * 4 + q] = F.A2[gi * 4 + q]; }
          uv[v * 2] = i * 0.5; uv[v * 2 + 1] = j * 0.5;
        };
        for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
          const i = i0 + a * step, j = j0 + b * step, gi = j * V + i;
          put(b * n + a, gi, i, j, 0);
          if (H[gi] < minY) minY = H[gi]; if (H[gi] > maxY) maxY = H[gi];
        }
        edges.forEach((list, e) => {
          const outer = (e === 0 && cj === 0) || (e === 1 && cj === NC - 1) || (e === 2 && ci === 0) || (e === 3 && ci === NC - 1);
          for (let k = 0; k < n; k++) {
            const v = list[k], a = v % n, b = (v / n) | 0, i = i0 + a * step, j = j0 + b * step;
            put(n * n + e * n + k, j * V + i, i, j, outer ? 120 : 3 + step * 6);
          }
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setAttribute('aD1', new THREE.BufferAttribute(a1, 4, true));
        g.setAttribute('aD2', new THREE.BufferAttribute(a2, 4, true));
        g.setAttribute('aMix', new THREE.BufferAttribute(mix, 1));
        g.setIndex(idx);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, this.o.groundMat);
        m.castShadow = li < 2; m.receiveShadow = true; m.visible = false;
        this.group.add(m); lods.push(m);
      }
      this.chunks.push({ lods, x0: this.x0 + i0 * T, z0: this.x0 + j0 * T, s: SC_CH * T, minY, maxY, lod: -1, inst: [], ci, cj });
    }
  }

  _far(Hs) {
    // vòng xa: bước = 16 ô (khớp mép lưới cảnh quan), ra tới ~10 km; giữa trống (đã có lưới chi tiết)
    const stepC = 16, step = stepC * T, half = this.ext / 2, kIn = Math.round(half / step), kOut = Math.ceil(FAR_R / step);
    const n = 2 * kOut, Vn = n + 1, R0 = kOut * step;
    Object.assign(this, { farN: n, farStep: step, farR: R0 });
    const pos = new Float32Array(Vn * Vn * 3), nor = new Float32Array(Vn * Vn * 3), a1 = new Uint8Array(Vn * Vn * 4), a2 = new Uint8Array(Vn * Vn * 4), col = new Float32Array(Vn * Vn * 3), uv = new Float32Array(Vn * Vn * 2), mix = new Float32Array(Vn * Vn).fill(1);
    const A = this.farH = new Float32Array(Vn * Vn);
    const cx = (HALF / T) | 0; // ô giữa bản đồ (toạ độ đỉnh lưới)
    for (let b = 0; b < Vn; b++) for (let a = 0; a < Vn; a++) {
      const gx = (a - kOut) * stepC + N / 2, gy = (b - kOut) * stepC + N / 2;
      const inside = Math.abs(a - kOut) <= kIn && Math.abs(b - kOut) <= kIn;
      A[b * Vn + a] = inside ? this.heightCell(gx, gy) : Hs(gx, gy);
    }
    void cx;
    const Nd = makeSimplex(71);
    for (let b = 0; b < Vn; b++) for (let a = 0; a < Vn; a++) {
      const k = b * Vn + a, x = (a - kOut) * step, z = (b - kOut) * step, h = A[k];
      const gx = (A[b * Vn + Math.min(a + 1, n)] - A[b * Vn + Math.max(a - 1, 0)]) / (2 * step), gz = (A[Math.min(b + 1, n) * Vn + a] - A[Math.max(b - 1, 0) * Vn + a]) / (2 * step);
      const l = Math.hypot(gx, 1, gz), hz = (h + 0.9) * 2.3, sl = Math.hypot(gx, gz);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      nor[k * 3] = -gx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -gz / l;
      let f = (0.5 + 0.5 * Nd(x * 0.0022, z * 0.0022)) * (1 - sstep(0.5, 0.8, sl)) * sstep(0.9, 2.6, h + 0.9);
      f = Math.max(f, sstep(70, 170, hz) * (1 - sstep(380, 640, hz)) * 0.8) * (1 - sstep(720, 900, hz));
      a1[k * 4 + 2] = 128; a1[k * 4 + 3] = f * 255;
      a2[k * 4 + 2] = h < 2 ? 120 : 30; a2[k * 4 + 3] = (0.5 + 0.5 * Nd(x * 0.004 + 3, z * 0.004)) * 255;
      uv[k * 2] = x / T * 0.5; uv[k * 2 + 1] = z / T * 0.5;
    }
    const idx = [];
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      if (Math.abs(a - kOut + 0.5) < kIn && Math.abs(b - kOut + 0.5) < kIn) continue;
      const i = b * Vn + a; idx.push(i, i + Vn, i + 1, i + 1, i + Vn, i + Vn + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aD1', new THREE.BufferAttribute(a1, 4, true)); g.setAttribute('aD2', new THREE.BufferAttribute(a2, 4, true)); g.setAttribute('aMix', new THREE.BufferAttribute(mix, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, this.o.groundMat); m.receiveShadow = true; m.frustumCulled = false;
    this.group.add(m);
  }

  /** Rừng (tán tròn, thông), bụi, đá theo mật độ: dày ở vùng thấp, ẩm, chân núi, thưa dần lên cao; không mọc trên vách hay dưới nước. */
  _vegetation(F, R) {
    const { V, G, hole } = this, TC = SC_CH * 2, NT = Math.ceil(G / TC); // mỗi nhóm cây phủ 2×2 mảnh địa hình (ít lệnh vẽ hơn)
    const per = Array.from({ length: NT * NT }, () => ({ round: [], pine: [], bush: [], rock: [] }));
    const dens = 0.16 * (T * T) / 64; // xác suất một cây mỗi ô ở rừng dày (theo diện tích ô)
    const Ncon = makeSimplex(97);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      if (i >= hole[0] - 1 && j >= hole[0] - 1 && i < hole[1] + 1 && j < hole[1] + 1) continue;
      const k = j * V + i, f = F.forest[k], sl = F.slope[k];
      const L = per[((j / TC) | 0) * NT + ((i / TC) | 0)];
      const x = this.x0 + (i + R()) * T, z = this.x0 + (j + R()) * T;
      if (R() < f * dens * 4) {
        const h = this.heightAt(x, z);
        if (h < 0.2) continue;
        const hz = (h + 0.9) * 2.3, conP = sstep(40, 260, hz) * 0.85 + (Ncon(x * 0.008, z * 0.008) > 0.45 ? 0.25 : 0) - F.moist[k] * 0.4;
        const s = R() < conP ? (L.pine.push([x, h - 0.2, z, lerp(1.3, 2.3, R()) * (1 - 0.4 * sstep(450, 850, hz)), R()]), 0) : (L.round.push([x, h - 0.2, z, lerp(1.1, 1.9, R()), R()]), 0);
        void s;
      } else if (R() < 0.04 * (f > 0.05 && f < 0.5 ? 1 : 0.3) * (1 - sstep(0.55, 0.8, sl))) {
        const h = this.heightAt(x, z); if (h > 0.4) L.bush.push([x, h - 0.1, z, lerp(1.2, 2.4, R()), R()]);
      }
      const cl = F.cliff[k], hh = this.H[k];
      const pr = (cl > 0.2 && sl < 0.8 ? 0.045 * cl : 0) + (sl < 0.85 ? 0.005 * sstep(180, 300, hh) : 0) + (hh > 3 && hh < 120 ? 0.001 : 0);
      if (R() < pr) { const h = this.heightAt(x, z); if (h > 0) L.rock.push([x, h, z, R() < 0.15 ? lerp(3, 7, R()) : lerp(0.8, 2.6, R()), R()]); }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const geo = { round: this.o.treeGeos[0], pine: this.o.treeGeos[1], bush: this.o.treeGeos[2], rock: this.o.rockGeo };
    this.treeGroups = [];
    per.forEach((lists, t) => {
      const ti = t % NT, tj = (t / NT) | 0, grp = { x0: this.x0 + ti * TC * T, z0: this.x0 + tj * TC * T, s: TC * T, inst: [] };
      for (const kind in lists) {
        const L = lists[kind]; if (!L.length) continue;
        for (let i = L.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [L[i], L[j]] = [L[j], L[i]]; }
        const isRock = kind === 'rock';
        const mesh = new THREE.InstancedMesh(geo[kind], isRock ? this.o.rockMat : this.o.treeMat, L.length);
        L.forEach(([x, y, z, s, r], k) => {
          e.set((r - 0.5) * (isRock ? 0.6 : 0.06), r * 6.28, (R() - 0.5) * (isRock ? 0.6 : 0.06));
          const w = lerp(0.85, 1.2, R()); sc.set(s * w, s * (isRock ? 0.7 : 1), s * w); v.set(x, isRock ? y - s * 0.25 : y, z);
          q.setFromEuler(e); mesh.setMatrixAt(k, m4.compose(v, q, sc));
          if (isRock) { const tt = lerp(0.8, 1.15, R()); col.setRGB(tt, tt, tt * 0.96); } else { const tt = lerp(0.72, 1.08, R()), y2 = R() < 0.12 ? 1.12 : 1; col.setRGB(tt * y2, tt, tt * lerp(0.85, 1.0, R())); }
          mesh.setColorAt(k, col);
        });
        mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
        mesh.castShadow = kind !== 'bush'; mesh.receiveShadow = true;
        this.group.add(mesh);
        grp.inst.push({ mesh, n: L.length, kind });
      }
      if (grp.inst.length) this.treeGroups.push(grp);
    });
    this.trees = this.treeGroups.reduce((s, g) => s + g.inst.reduce((a, it) => a + (it.kind === 'rock' ? 0 : it.n), 0), 0);
  }

  _cloudsBuild(seed) {
    const R = mulberry32(seed * 5 + 3); this.cloudDefs = [];
    for (let i = 0; i < MAX_CLOUDS; i++) {
      const r = lerp(180, 420, R()), puffs = [], np = 14 + ((R() * 12) | 0);
      for (let k = 0; k < np; k++) {
        const a = R() * 6.283, d = Math.sqrt(R()), ox = Math.cos(a) * d * r * 0.85, oz = Math.sin(a) * d * r * 0.6, oy = (R() * 0.5 - 0.1) * r * 0.35 * (1 - d * 0.5);
        puffs.push([ox, oy, oz, r * lerp(0.55, 0.95, R()) * (1 - d * 0.35), clamp(0.5 + oy / (r * 0.3), 0, 1), R()]);
      }
      this.cloudDefs.push({ x: lerp(-6000, 6000, R()), z: lerp(-6000, 6000, R()), y: lerp(680, 820, R()), r, puffs, on: R() });
    }
  }

  /** Mỗi khung hình: chọn LOD từng mảnh, số cây theo khoảng cách, mây trôi + bóng mây, nướng dần bóng núi. */
  update(camera, time, opts) {
    const cam = camera.position, LS = this.o.LS;
    for (const c of this.chunks) {
      const dx = Math.max(c.x0 - cam.x, 0, cam.x - (c.x0 + c.s)), dz = Math.max(c.z0 - cam.z, 0, cam.z - (c.z0 + c.s)), dy = Math.max(c.minY - cam.y, 0, cam.y - c.maxY);
      const d = Math.hypot(dx, dy, dz), lod = Math.min(c.lods.length - 1, d < 500 ? 0 : d < 1300 ? 1 : d < 2800 ? 2 : 3);
      if (lod !== c.lod) { c.lods.forEach((m, i) => (m.visible = i === lod)); c.lod = lod; }
    }
    const qk = opts.trees ?? 1;
    for (const g of this.treeGroups || []) {
      const dx = Math.max(g.x0 - cam.x, 0, cam.x - (g.x0 + g.s)), dz = Math.max(g.z0 - cam.z, 0, cam.z - (g.z0 + g.s)), d = Math.hypot(dx, dz, Math.max(cam.y - 60, 0));
      const fr = d < 400 ? 1 : d < 1000 ? 0.5 : d < 2200 ? 0.24 : 0.1;
      for (const it of g.inst) {
        const f = it.kind === 'rock' ? (d < 1500 ? Math.max(fr, 0.5) : 0.15) : it.kind === 'bush' ? (d < 900 ? fr : 0) : fr * qk;
        it.mesh.count = Math.round(it.n * f); it.mesh.visible = it.mesh.count > 0;
        it.mesh.castShadow = it.kind !== 'bush' && d < (opts.shadowR || 500);
      }
    }
    // mây: số đám theo lượng mây của thời tiết; bóng mây khớp vị trí (chiếu theo hướng nắng)
    const cov = opts.cloud ?? 0.3, active = Math.round(MAX_CLOUDS * clamp(0.2 + cov * 0.95, 0, 1));
    const g = this.clouds.geometry, O = g.attributes.aOrigin.array, P = g.attributes.aPar.array, list = [];
    const wrap = (v) => ((v + 6000) % 12000 + 12000) % 12000 - 6000;
    this.cloudDefs.forEach((c, i) => {
      const on = i < active ? 1 : 0, cx = wrap(c.x + time * 5.5), cz = wrap(c.z - time * 2.1);
      const edge = sstep(6000, 4800, Math.max(Math.abs(cx), Math.abs(cz))) * on * (opts.cloudsOn === false ? 0 : 1);
      LS.uClouds.value[i].set(cx, cz, c.r * 0.95, 0.45 * edge);
      if (!edge) return;
      for (const p of c.puffs) {
        const x = cx + p[0], y = c.y + p[1], z = cz + p[2];
        list.push([(x - cam.x) ** 2 + (y - cam.y) ** 2 + (z - cam.z) ** 2, x, y, z, p[3], 0.62 * edge, p[4], p[5]]);
      }
    });
    list.sort((a, b) => b[0] - a[0]);
    list.forEach((p, k) => { O[k * 3] = p[1]; O[k * 3 + 1] = p[2]; O[k * 3 + 2] = p[3]; P[k * 4] = p[4]; P[k * 4 + 1] = p[5]; P[k * 4 + 2] = p[6]; P[k * 4 + 3] = p[7]; });
    g.instanceCount = list.length; g.attributes.aOrigin.needsUpdate = true; g.attributes.aPar.needsUpdate = true;
    LS.uCloudAlt.value = 750;
    this._bakeStep(opts.sunDir);
  }

  /** Bóng núi nướng sẵn cho vùng ngoài shadow map: dò tia về phía mặt trời trên lưới độ cao, mỗi khung hình vài hàng. */
  _bakeStep(sd) {
    if (!this.H || !sd) return;
    const LS = this.o.LS;
    LS.uBkM.value.set(this.x0, this.x0, 1 / this.ext, 1);
    if (sd.y <= 0.01) { if (this.bakeData[0] !== 0 || !this.bakeDark) { this.bakeData.fill(0); this.bakeTex.needsUpdate = true; this.bakeDark = true; } return; }
    this.bakeDark = false;
    if (this.bakeRow === 0) this.bakeSun = sd.clone();
    const s0 = this.bakeSun, hor = Math.hypot(s0.x, s0.z) || 1e-6, dx = s0.x / hor, dz = s0.z / hor, tanE = s0.y / hor, cs = this.ext / BAKE, maxH = Math.max(this.maxH, 50) + 5;
    const rows = 7, B = this.bakeBack;
    for (let r = 0; r < rows && this.bakeRow < BAKE; r++, this.bakeRow++) {
      const j = this.bakeRow;
      for (let i = 0; i < BAKE; i++) {
        const x0 = this.x0 + (i + 0.5) * cs, z0 = this.x0 + (j + 0.5) * cs, h0 = Math.max(this.heightAt(x0, z0), -0.9) + 2;
        let vis = 1, st = cs * 0.6, d = st;
        while (d < 6000) {
          const ry = h0 + d * tanE;
          if (ry > maxH) break;
          const k = (ry - this.heightAt(x0 + dx * d, z0 + dz * d)) / (d * 0.035);
          if (k < vis) { vis = k; if (vis <= 0) { vis = 0; break; } }
          d += st; st = Math.min(st * 1.07, 90);
        }
        B[j * BAKE + i] = clamp(vis, 0, 1) * 255;
      }
    }
    if (this.bakeRow >= BAKE) { this.bakeData.set(B); this.bakeTex.needsUpdate = true; this.bakeRow = 0; }
  }

  dispose() {
    for (const o of [...this.group.children]) { this.group.remove(o); if (o.geometry && !o.isInstancedMesh) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); }
    this.chunks = []; this.treeGroups = [];
  }
}

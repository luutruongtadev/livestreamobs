// Phố Mới — đường sắt: người chơi vẽ đường ray từ ga tàu hoả qua các điểm uốn, ra tới cửa khẩu ở mép bản đồ
// (hoặc nối sang ga khác, nối tiếp một đường ray có sẵn). Ray giữ độ dốc nhỏ: gặp núi thì khoét hầm, gặp sông, thung lũng thì
// bắc cầu, chỗ đồi thấp thì xẻ đất (hạ mặt đất hai bên ray) hoặc đắp nền. Ga có đường ray thông ra cửa khẩu đón tàu liên vận:
// du khách, người tới định cư, thu tiền vé; hàng xuất khẩu qua biên được giá hơn; thành phố hút dân hơn.
import { N, T, HALF, idx, inMap, clamp, cellOf, SERVICES, TERRA_COST, resCap } from './base.js';
import { cityPay } from './ledger.js';

export const RAIL = {
  ground: 9, bridge: 34, tunnel: 52, // giá mỗi mét theo loại (mặt đất / cầu cạn, cầu qua sông / hầm)
  upkeep: 0.04, upBridge: 0.12, upTunnel: 0.16, // phí mỗi mét mỗi ngày
  grade: 0.035, // độ dốc tối đa của ray
  step: 4, // khoảng cách lấy mẫu dọc ray (m)
  approach: 22, // đoạn thẳng ra khỏi ga / vào cửa khẩu
  unlock: 1000, fare: 6,
};
const TOP = 0.62; // mặt ray cao hơn nền ga / mặt đất
const ROT = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // như render.js: hướng mặt tiền công trình
const SIDE_NAME = { n: 'Bắc', s: 'Nam', w: 'Tây', e: 'Đông' };
const TRAIN_CODES = ['SE', 'TN', 'LV', 'HP', 'QT'];
const blankDay = () => ({ trains: 0, tourists: 0, immig: 0, out: 0, fees: 0 });

export function initRail(c, o = {}) {
  c.rail = { lines: [], nextId: Math.max(1, o.nextId | 0), day: blankDay(), last: o.last && typeof o.last === 'object' ? o.last : null };
  for (const l of Array.isArray(o.lines) ? o.lines : []) {
    if (!l || !Array.isArray(l.wp) || l.wp.length < 4 || !Array.isArray(l.ys)) continue;
    const wp = l.wp.map((v) => clamp(+v || 0, -HALF - 50, HALF + 50)), geo = railPath(wp);
    if (geo.n !== l.ys.length || typeof l.kinds !== 'string' || l.kinds.length !== geo.n) continue; // hỏng: bỏ
    const line = { id: l.id | 0 || c.rail.nextId, wp, ys: Float32Array.from(l.ys, (v) => +v || 0), kinds: l.kinds };
    c.rail.nextId = Math.max(c.rail.nextId, line.id + 1);
    c.rail.lines.push(line);
  }
  c.rail.ver = 1;
}
const r1 = (v) => Math.round(v * 10) / 10;
export const packRail = (c) => ({ nextId: c.rail.nextId, last: c.rail.last, lines: c.rail.lines.map((l) => ({ id: l.id, wp: l.wp.map(r1), ys: Array.from(l.ys, r1), kinds: l.kinds })) });

// ───────────────────────── hình học ─────────────────────────

/**
 * Đường ray từ các điểm uốn (phẳng [x, z, ...]): góc được bo tròn (bán kính lớn), lấy mẫu đều mỗi RAIL.step mét.
 * Trả về { pts (phẳng), cum, n, len }.
 */
export function railPath(wp) {
  const P = [];
  for (let k = 0; k < wp.length; k += 2) P.push([wp[k], wp[k + 1]]);
  const dense = []; // polyline mịn trước khi lấy mẫu đều
  const push = (x, z) => { const l = dense[dense.length - 1]; if (!l || Math.hypot(l[0] - x, l[1] - z) > 0.01) dense.push([x, z]); };
  push(P[0][0], P[0][1]);
  for (let k = 1; k < P.length - 1; k++) {
    const A = P[k - 1], B = P[k], C = P[k + 1];
    const lab = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, lbc = Math.hypot(C[0] - B[0], C[1] - B[1]) || 1;
    const d = Math.min(lab * 0.48, lbc * 0.48, 90);
    const p0 = [B[0] - ((B[0] - A[0]) / lab) * d, B[1] - ((B[1] - A[1]) / lab) * d], p1 = [B[0] + ((C[0] - B[0]) / lbc) * d, B[1] + ((C[1] - B[1]) / lbc) * d];
    for (let j = 0; j <= 12; j++) { const t = j / 12, u = 1 - t; push(u * u * p0[0] + 2 * u * t * B[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * B[1] + t * t * p1[1]); }
  }
  push(P[P.length - 1][0], P[P.length - 1][1]);
  const dc = [0];
  for (let k = 1; k < dense.length; k++) dc.push(dc[k - 1] + Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]));
  const len = dc[dc.length - 1], n = Math.max(2, Math.round(len / RAIL.step) + 1), pts = new Float32Array(n * 2), cum = new Float32Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (len * k) / (n - 1);
    while (j < dense.length - 2 && dc[j + 1] < s) j++;
    const l = dc[j + 1] - dc[j] || 1, f = clamp((s - dc[j]) / l, 0, 1);
    pts[k * 2] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f; pts[k * 2 + 1] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f;
    cum[k] = s;
  }
  return { pts, cum, n, len };
}

const cellH = (c, x, z) => { const a = cellOf(x), b = cellOf(z); return inMap(a, b) ? c.cellH[idx(a, b)] : 0; };
const heightAtW = (c, wx, wz) => {
  const u = clamp((wx + HALF) / T, 0, N - 1e-6), v = clamp((wz + HALF) / T, 0, N - 1e-6);
  const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j, V = N + 1;
  const a = c.hv[j * V + i], b = c.hv[j * V + i + 1], d = c.hv[(j + 1) * V + i], e = c.hv[(j + 1) * V + i + 1];
  return fx + fy <= 1 ? a + (b - a) * fx + (d - a) * fy : e + (d - e) * (1 - fx) + (b - e) * (1 - fy);
};
const wetAt = (c, x, z) => { const a = cellOf(x), b = cellOf(z); return inMap(a, b) && c.water[idx(a, b)] === 1; };

// ───────────────────────── cửa khẩu, đầu ga ─────────────────────────

/**
 * Cửa khẩu ở mép bản đồ: mỗi cạnh có đất liền một cửa (chỗ thấp, gần giữa cạnh); cạnh bắc tránh lối cao tốc.
 * [{ k, side, name, x, z (trên mép), dir [dx, dz] hướng vào trong, y }]
 */
export function railGates(c) {
  const key = `${N}:${c.seed}:${c.map}`;
  if (c._gates && c._gates.key === key) return c._gates.list;
  const nat = c.water0 || c.water, list = [];
  for (const side of ['n', 'w', 'e', 's']) {
    let best = null, bs = Infinity;
    for (const avoid of [9, 4]) {
      for (let t = 3; t < N - 3; t++) {
        const [x, y] = side === 'n' ? [t, 0] : side === 's' ? [t, N - 1] : side === 'w' ? [0, t] : [N - 1, t];
        if (side === 'n' && c.start && Math.abs(x - c.start.x) < avoid) continue; // chừa lối cao tốc
        let land = true;
        for (let d = -2; d <= 2 && land; d++) for (let q = 0; q < 4 && land; q++) { // dải đất đủ rộng, ăn sâu vào trong
          const a = side === 'n' || side === 's' ? x + d : side === 'w' ? q : N - 1 - q, b = side === 'w' || side === 'e' ? y + d : side === 'n' ? q : N - 1 - q;
          if (!inMap(a, b) || nat[idx(a, b)]) land = false;
        }
        if (!land) continue;
        const sc = Math.abs(t - N / 2) * 0.6 + c.cellH[idx(x, y)] * 1.2;
        if (sc < bs) { bs = sc; best = { x, y }; }
      }
      if (best) break;
    }
    if (!best) continue;
    const dir = side === 'n' ? [0, 1] : side === 's' ? [0, -1] : side === 'w' ? [1, 0] : [-1, 0];
    const wx = side === 'w' ? -HALF : side === 'e' ? HALF : best.x * T - HALF + T / 2, wz = side === 'n' ? -HALF : side === 's' ? HALF : best.y * T - HALF + T / 2;
    list.push({ k: list.length, side, name: `Cửa khẩu ${SIDE_NAME[side]}`, x: wx, z: wz, dir, y: heightAtW(c, wx + dir[0] * 2, wz + dir[1] * 2) + TOP });
  }
  c._gates = { key, list };
  return list;
}

const padY = (c, s) => { const sz = SERVICES[s.type].size; let y = 0; for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) { const a = s.x + dx, b = s.y + dy; if (inMap(a, b)) y = Math.max(y, c.cellH[idx(a, b)]); } return y; };
/** Hai đầu đường ray của ga tàu (ray giữa, phía hai đầu lô): [{ x, z, dir (hướng ra ngoài), y }] */
export function stationEnds(c, s) {
  const sz = SERVICES[s.type].size, cx = (s.x + sz / 2) * T - HALF, cz = (s.y + sz / 2) * T - HALF, r = ROT[s.dir & 3], cr = Math.cos(r), sr = Math.sin(r), H = (sz * T) / 2, LZ = -4.85;
  const W = (lx, lz) => [cx + lx * cr + lz * sr, cz - lx * sr + lz * cr], y = padY(c, s) + 0.02 + TOP;
  return [-1, 1].map((sg) => { const p = W(sg * H, LZ); return { x: p[0], z: p[1], dir: [sg * cr, -sg * sr], y }; });
}

/** Điểm bắt dính cho công cụ vẽ ray: đầu ga, cửa khẩu, đầu một đường ray có sẵn. */
export function railSnap(c, x, z, r = 26) {
  let best = null, bd = r;
  const consider = (p, ref) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = { x: p.x, z: p.z, y: p.y, dir: p.dir, ref }; } };
  for (const s of c.services) if (s.type === 'train') stationEnds(c, s).forEach((p, e) => consider(p, { type: 'st', uid: s.uid, end: e }));
  for (const g of railGates(c)) consider(g, { type: 'gate', k: g.k });
  for (const l of c.rail.lines) {
    const geo = lineGeo(l), n = geo.n;
    for (const [e, k, k2] of [[0, 0, 1], [1, n - 1, n - 2]]) {
      const px = geo.pts[k * 2], pz = geo.pts[k * 2 + 1], tx = px - geo.pts[k2 * 2], tz = pz - geo.pts[k2 * 2 + 1], tl = Math.hypot(tx, tz) || 1;
      consider({ x: px, z: pz, y: l.ys[k], dir: [tx / tl, tz / tl] }, { type: 'end', line: l.id, end: e });
    }
  }
  return best;
}

/** Hình học dựng sẵn của một đường ray (lưu tạm trên đối tượng, không lưu vào bản lưu). */
export function lineGeo(l) { if (!l._geo) l._geo = railPath(l.wp); return l._geo; }

// ───────────────────────── lập kế hoạch, xây ─────────────────────────

/**
 * Tính một đường ray sắp xây qua các điểm (phẳng [x, z, ...]; điểm đầu, cuối nên là điểm bắt dính railSnap).
 * Trả về { ok, reason, cost, len, lenBridge, lenTunnel, wp, ys, kinds, n, cuts }.
 */
export function planRail(c, pts, { a = null, b = null } = {}) {
  const out = { ok: false, cost: 0, len: 0, lenBridge: 0, lenTunnel: 0 };
  if (!c.sandbox && !hasStation(c) && !(a && a.ref && a.ref.type === 'end')) return { ...out, reason: 'Xây 🚆 ga tàu hoả trước, rồi vẽ ray từ đầu ga' };
  if (pts.length < 4) return { ...out, reason: 'Cần ít nhất 2 điểm' };
  // điểm đầu / cuối bắt dính: chèn đoạn thẳng ra khỏi ga, vào cửa khẩu cho tàu chạy êm
  const wp = [];
  const P = []; for (let k = 0; k < pts.length; k += 2) P.push([pts[k], pts[k + 1]]);
  if (a) { P[0] = [a.x, a.z]; if (a.dir) P.splice(1, 0, [a.x + a.dir[0] * RAIL.approach, a.z + a.dir[1] * RAIL.approach]); }
  if (b) { P[P.length - 1] = [b.x, b.z]; if (b.dir) P.splice(P.length - 1, 0, [b.x + b.dir[0] * RAIL.approach, b.z + b.dir[1] * RAIL.approach]); }
  for (const p of P) wp.push(p[0], p[1]);
  for (let k = 1; k < P.length; k++) if (Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]) < 6) return { ...out, reason: 'Hai điểm quá gần nhau' };
  for (let k = 1; k < P.length - 1; k++) { // góc gắt quá thì tàu không quay được
    const ax = P[k][0] - P[k - 1][0], az = P[k][1] - P[k - 1][1], bx = P[k + 1][0] - P[k][0], bz = P[k + 1][1] - P[k][1];
    const cos = (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1);
    if (cos < -0.2) return { ...out, reason: 'Ray bẻ góc quá gắt: thêm điểm uốn cho đường cong rộng hơn' };
  }
  const geo = railPath(wp), n = geo.n;
  if (geo.len < 30) return { ...out, reason: 'Đường ray quá ngắn' };
  const gate = (s) => s && s.ref && s.ref.type === 'gate';
  for (let k = 0; k < n; k++) { // chỉ được ra ngoài bản đồ ở đúng cửa khẩu
    const x = geo.pts[k * 2], z = geo.pts[k * 2 + 1], outside = Math.abs(x) > HALF - 0.5 || Math.abs(z) > HALF - 0.5;
    if (outside && !((k < 3 && gate(a)) || (k > n - 4 && gate(b)))) return { ...out, reason: 'Ray chỉ ra khỏi bản đồ qua cửa khẩu (ô cổng ở mép bản đồ)' };
  }
  // cao độ: mục tiêu bám địa hình (qua nước thì nâng cao cho tàu thuyền qua), làm mượt rồi giới hạn độ dốc
  const g = new Float32Array(n), wet = new Uint8Array(n), tgt = new Float32Array(n), p = new Float32Array(n);
  for (let k = 0; k < n; k++) { const x = geo.pts[k * 2], z = geo.pts[k * 2 + 1]; g[k] = heightAtW(c, x, z); wet[k] = wetAt(c, x, z) ? 1 : 0; tgt[k] = wet[k] ? 7.5 : Math.max(g[k], 0.4) + TOP; }
  // ray thấp nhất có thể dưới mục tiêu (gặp núi thì chui hầm, xẻ đất), rồi nâng lên chỗ phải qua nước (cầu) với dốc dẫn hai đầu
  const fixed = (r) => r && r.ref && r.ref.type !== 'gate' && Number.isFinite(r.y); // cửa khẩu không ghim cao độ: ray qua biên theo địa hình
  const y0 = fixed(a) ? a.y : NaN, y1 = fixed(b) ? b.y : NaN;
  const flat = (ref) => ref && ref.ref && ref.ref.type === 'st' ? Math.round(RAIL.approach / RAIL.step) : 0; // ra khỏi ga chạy bằng
  const fa = flat(a), fb = flat(b), dmax = RAIL.grade * (geo.len / (n - 1)), pin = new Float32Array(n).fill(NaN);
  if (fixed(a)) for (let k = 0; k <= fa && k < n; k++) pin[k] = y0;
  if (fixed(b)) for (let k = n - 1; k >= n - 1 - fb && k >= 0; k--) pin[k] = y1;
  for (let k = 0; k < n; k++) p[k] = Number.isNaN(pin[k]) ? tgt[k] : pin[k];
  for (let k = 1; k < n; k++) p[k] = Math.min(p[k], p[k - 1] + dmax); // hạ: hàm dốc ≤ dmax lớn nhất nằm dưới mục tiêu
  for (let k = n - 2; k >= 0; k--) p[k] = Math.min(p[k], p[k + 1] + dmax);
  for (let k = 0; k < n; k++) { if (wet[k]) p[k] = Math.max(p[k], 5.5); if (!Number.isNaN(pin[k])) p[k] = Math.max(p[k], pin[k]); } // cầu đủ cao cho tàu thuyền
  for (let k = 1; k < n; k++) p[k] = Math.max(p[k], p[k - 1] - dmax); // nâng: dốc dẫn lên cầu, lên ga
  for (let k = n - 2; k >= 0; k--) p[k] = Math.max(p[k], p[k + 1] - dmax);
  for (let k = 0; k < n; k++) if (!Number.isNaN(pin[k])) p[k] = pin[k];
  for (let k = 1; k < n; k++) if (Math.abs(p[k] - p[k - 1]) > dmax * 1.05 + 0.01) return { ...out, reason: 'Hai đầu ray chênh cao quá so với chiều dài: vẽ đường vòng dài hơn cho dốc thoải' };
  // phân loại: hầm khi đất cao hơn mặt ray quá 4 m, cầu khi qua nước hoặc ray cao hơn đất quá 4 m
  const kind = [];
  for (let k = 0; k < n; k++) kind.push(wet[k] ? 'b' : g[k] - p[k] > 4 ? 't' : p[k] - g[k] > 4 + TOP ? 'b' : 'g');
  const runs = (ch, max, to, onlyLand) => {
    for (let k = 0; k < n;) {
      if (kind[k] !== ch) { k++; continue; }
      let e = k; while (e < n && kind[e] === ch) e++;
      if (e - k < max && !(onlyLand && wet.slice(k, e).some((v) => v))) for (let q = k; q < e; q++) kind[q] = to;
      k = e;
    }
  };
  runs('t', 3, 'g'); // gò thấp ngắn: xẻ đất thay vì đào hầm
  runs('g', 4, 't'); // khe hở ngắn giữa hai hầm: hầm luôn
  for (let k = 0; k < n; k++) if (kind[k] === 'g' && k > 0 && k < n - 1 && kind[k - 1] === 't' && kind[k + 1] === 't') kind[k] = 't';
  runs('b', 2, 'g', true); // cầu cạn quá ngắn: đắp nền
  if ((kind[0] === 't' && !gate(a)) || (kind[n - 1] === 't' && !gate(b))) return { ...out, reason: 'Đầu đường ray nằm trong núi: đặt điểm đầu, điểm cuối ở chỗ đất thấp hơn' };
  // vướng nhà, công trình (hầm thì chui bên dưới được)
  const own = new Set();
  for (const s of [a, b]) if (s && s.ref && s.ref.type === 'st') { const sv = c.services.find((q) => q.uid === s.ref.uid); if (sv) own.add(c.services.indexOf(sv) + 1); }
  for (let k = 0; k < n; k++) {
    if (kind[k] === 't') continue;
    const x = geo.pts[k * 2], z = geo.pts[k * 2 + 1];
    for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
      const cx = cellOf(x + ox), cz = cellOf(z + oz);
      if (!inMap(cx, cz)) continue;
      const i = idx(cx, cz);
      if (c.level[i]) return { ...out, reason: 'Đường ray vướng nhà dân: vẽ vòng qua hoặc giải toả trước' };
      if (c.occ[i] && !own.has(c.occ[i])) return { ...out, reason: `Đường ray vướng ${SERVICES[c.services[c.occ[i] - 1].type].name.toLowerCase()}` };
    }
  }
  let cost = 0, lenBridge = 0, lenTunnel = 0;
  for (let k = 1; k < n; k++) {
    const d = geo.cum[k] - geo.cum[k - 1], kk = kind[k] === kind[k - 1] ? kind[k] : kind[k] === 'g' ? kind[k - 1] : kind[k];
    cost += d * (kk === 't' ? RAIL.tunnel : kk === 'b' ? RAIL.bridge : RAIL.ground);
    if (kk === 't') lenTunnel += d; else if (kk === 'b') lenBridge += d;
  }
  const cuts = cutPlan(c, geo, p, kind);
  cost = Math.round(cost + cuts.cost);
  const res = { ok: true, cost, len: geo.len, lenBridge, lenTunnel, wp, ys: p, kinds: kind.join(''), n, cuts: cuts.list, pts: geo.pts };
  if (!c.sandbox && cost > c.money) return { ...res, ok: false, reason: 'Không đủ tiền' };
  return res;
}
const hasStation = (c) => c.services.some((s) => s.type === 'train');

/** Xẻ đất: các đỉnh lưới quanh ray (đoạn chạy trên mặt đất) cao hơn nền ray thì hạ xuống. [k, terra, ...] + giá đào. */
function cutPlan(c, geo, p, kind) {
  const V = N + 1, want = new Map();
  for (let k = 0; k < geo.n; k++) {
    if (kind[k] === 't' && !(kind[k - 1] === 'g' || kind[k + 1] === 'g')) continue; // trong lòng núi: không đụng địa hình
    if (kind[k] === 'b') continue;
    const x = geo.pts[k * 2], z = geo.pts[k * 2 + 1], floor = Math.max(p[k] - TOP - 0.35, 0.2);
    const ax = cellOf(x - 5), bx = cellOf(x + 5), az = cellOf(z - 5), bz = cellOf(z + 5);
    for (let cy = az; cy <= bz; cy++) for (let cx = ax; cx <= bx; cx++) {
      if (!inMap(cx, cy)) continue;
      for (const [gx, gy] of [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1]]) {
        if (gx < 1 || gy < 1 || gx > N - 1 || gy > N - 1) continue;
        const key = gy * V + gx;
        if (c.hv[key] <= floor + 0.05) continue;
        let blocked = false; // đỉnh chạm đường, nhà, công trình: giữ nguyên
        for (let dy = -1; dy <= 0 && !blocked; dy++) for (let dx = -1; dx <= 0; dx++) { const i = idx(gx + dx, gy + dy); if (c.road[i] || c.occ[i] || c.level[i]) { blocked = true; break; } }
        if (blocked) continue;
        want.set(key, Math.min(want.has(key) ? want.get(key) : Infinity, floor));
      }
    }
  }
  const list = [];
  let cost = 0;
  for (const [key, h] of want) { const tv = clamp(Math.round((h - c.hv0[key]) * 10), -800, 800); if (tv < c.terra[key]) { cost += (c.hv[key] - h) * TERRA_COST * 0.5; list.push(key, tv); } }
  return { list, cost };
}

/** Xây đường ray theo kế hoạch planRail (đã kiểm tra). Trả về { ok, line, cost } kèm cờ terrain để gọi terraformDone. */
export function addRail(c, plan) {
  if (!plan.ok) return plan;
  const line = { id: c.rail.nextId++, wp: plan.wp, ys: Float32Array.from(plan.ys), kinds: plan.kinds };
  c.rail.lines.push(line);
  for (let q = 0; q < plan.cuts.length; q += 2) c.terra[plan.cuts[q]] = plan.cuts[q + 1];
  cityPay(c, 'build', plan.cost);
  c.rail.ver++;
  return { ok: true, line, cost: plan.cost, cut: plan.cuts.length > 0 };
}

export function removeRail(c, id) {
  const n0 = c.rail.lines.length;
  c.rail.lines = c.rail.lines.filter((l) => l.id !== id);
  if (c.rail.lines.length !== n0) c.rail.ver++;
  return { ok: c.rail.lines.length !== n0 };
}

/** Các đường ray đi qua (không phải đoạn hầm) hình chữ nhật ô [x0..x1] × [y0..y1]. */
export function railsInRect(c, x0, y0, x1, y1) {
  const ids = [];
  for (const l of c.rail.lines) {
    const geo = lineGeo(l);
    for (let k = 0; k < geo.n; k++) { if (l.kinds[k] === 't') continue; const cx = cellOf(geo.pts[k * 2]), cz = cellOf(geo.pts[k * 2 + 1]); if (cx >= Math.min(x0, x1) && cx <= Math.max(x0, x1) && cz >= Math.min(y0, y1) && cz <= Math.max(y0, y1)) { ids.push(l.id); break; } }
  }
  return ids;
}

/** Ô có đường ray chạy trên mặt đất / cầu (không mọc nhà, không quy hoạch, không xây công trình). */
export function railCells(c) {
  const out = new Uint8Array(N * N);
  for (const l of c.rail.lines) {
    const geo = lineGeo(l);
    for (let k = 0; k < geo.n; k++) {
      if (l.kinds[k] === 't') continue;
      const x = geo.pts[k * 2], z = geo.pts[k * 2 + 1];
      for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) { const a = cellOf(x + ox), b = cellOf(z + oz); if (inMap(a, b)) out[idx(a, b)] = 1; }
    }
  }
  return out;
}

/** Ô có hầm ray chạy bên dưới (kèm một vòng ô quanh): không cho đào đắp kẻo lộ hầm, ngập hầm. */
export function tunnelCells(c) {
  const out = new Uint8Array(N * N);
  for (const l of c.rail.lines) {
    const geo = lineGeo(l);
    for (let k = 0; k < geo.n; k++) {
      if (l.kinds[k] !== 't') continue;
      const cx = cellOf(geo.pts[k * 2]), cz = cellOf(geo.pts[k * 2 + 1]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(cx + dx, cz + dy)) out[idx(cx + dx, cz + dy)] = 1;
    }
  }
  return out;
}

// ───────────────────────── mạng lưới ─────────────────────────

/**
 * Nối các đường ray thành mạng: đầu ray gần (≤ 4 m) đầu ga, cửa khẩu hay đầu ray khác thì coi là nối.
 * Trả về { stations: [{ s, gate, route: { pts, ys, cum, len } (từ cửa khẩu vào tới đầu ga) | null }], gatesUsed }.
 */
export function railNet(c) {
  const key = `${c.rail.ver}|${c.services.length}|${c.services.map((s) => (s.type === 'train' ? `${s.uid}:${s.x},${s.y},${s.dir}` : '')).join('')}`;
  if (c._railNet && c._railNet.key === key) return c._railNet;
  const anchors = []; // { x, z, kind: 'st' | 'gate', s?, g? }
  for (const s of c.services) if (s.type === 'train') stationEnds(c, s).forEach((p) => anchors.push({ ...p, kind: 'st', s }));
  for (const g of railGates(c)) anchors.push({ x: g.x, z: g.z, kind: 'gate', g });
  // nút: anchors trước, rồi hai đầu mỗi đường ray; gộp nút gần nhau
  const nodes = anchors.map((a) => ({ x: a.x, z: a.z, a })), parent = [];
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const ends = [];
  for (const l of c.rail.lines) {
    const geo = lineGeo(l), n = geo.n;
    ends.push([nodes.length, nodes.length + 1]);
    nodes.push({ x: geo.pts[0], z: geo.pts[1] }, { x: geo.pts[(n - 1) * 2], z: geo.pts[(n - 1) * 2 + 1] });
  }
  for (let i = 0; i < nodes.length; i++) parent.push(i);
  for (let i = anchors.length; i < nodes.length; i++) for (let j = 0; j < i; j++) if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z) < 4) { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
  // đồ thị: cạnh = đường ray (độ dài), Dijkstra từ mọi cửa khẩu
  const adj = new Map(), addE = (u, v, li, rev) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push({ v, li, rev }); };
  c.rail.lines.forEach((l, li) => { const [e0, e1] = ends[li], u = find(e0), v = find(e1); if (u !== v) { addE(u, v, li, false); addE(v, u, li, true); } });
  const dist = new Map(), prev = new Map(), from = new Map(), q = [];
  anchors.forEach((a, i) => { if (a.kind === 'gate') { const r = find(i); dist.set(r, 0); from.set(r, a.g); q.push(r); } });
  while (q.length) {
    q.sort((x, y) => dist.get(x) - dist.get(y));
    const u = q.shift();
    for (const { v, li, rev } of adj.get(u) || []) {
      const d = dist.get(u) + lineGeo(c.rail.lines[li]).len;
      if (!dist.has(v) || d < dist.get(v)) { dist.set(v, d); prev.set(v, { u, li, rev }); from.set(v, from.get(u)); q.push(v); }
    }
  }
  const stations = [], used = new Set(), bySt = new Map();
  anchors.forEach((a, i) => { // mỗi ga lấy đầu ray có đường ngắn nhất ra cửa khẩu
    if (a.kind !== 'st') return;
    const r = find(i), cur = bySt.get(a.s.uid);
    if (!cur) bySt.set(a.s.uid, { s: a.s, r: dist.has(r) ? r : -1 });
    else if (dist.has(r) && (cur.r < 0 || dist.get(r) < dist.get(cur.r))) cur.r = r;
  });
  for (const { s, r } of bySt.values()) {
    if (r < 0) { stations.push({ s, gate: null, route: null }); continue; }
    const segs = []; // các đoạn theo thứ tự cửa khẩu → ga
    for (let v = r; prev.has(v); v = prev.get(v).u) segs.unshift(prev.get(v));
    const P = [], Y = [];
    for (const { li, rev } of segs) {
      const l = c.rail.lines[li], geo = lineGeo(l), n = geo.n;
      for (let k = Y.length ? 1 : 0; k < n; k++) { const j = rev ? n - 1 - k : k; P.push(geo.pts[j * 2], geo.pts[j * 2 + 1]); Y.push(l.ys[j]); }
    }
    if (Y.length < 2) { stations.push({ s, gate: null, route: null }); continue; }
    { // chạy hẳn vào trong ga, dừng ở sân ga
      const st = stationEnds(c, s).reduce((m, e) => (Math.hypot(e.x - P[P.length - 2], e.z - P[P.length - 1]) < Math.hypot(m.x - P[P.length - 2], m.z - P[P.length - 1]) ? e : m));
      for (let k = 1; k <= 6; k++) { P.push(st.x - st.dir[0] * k * 4, st.z - st.dir[1] * k * 4); Y.push(st.y); }
    }
    const cum = [0];
    for (let k = 1; k < Y.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k * 2] - P[k * 2 - 2], P[k * 2 + 1] - P[k * 2 - 1]));
    const g = from.get(r);
    used.add(g.k);
    stations.push({ s, gate: g, route: { pts: P, ys: Y, cum, len: cum[cum.length - 1] } });
  }
  c._railNet = { key, stations, gatesUsed: used };
  return c._railNet;
}

/** Số ga đã thông ra cửa khẩu (đã xây xong). */
export const linkedStations = (c) => railNet(c).stations.filter((x) => x.route && !(x.s.build > 0));

/** Thưởng cả thành phố: mỗi ga thông ra cửa khẩu (tối đa 2) hút dân +4%, thương mại +2%; hàng xuất qua biên được giá hơn. */
export function railBonus(c) {
  const k = Math.min(2, linkedStations(c).length);
  return { pull: 0.04 * k, comm: 0.02 * k, exportK: k ? 0.08 : 0 };
}

/** Phí duy trì đường ray mỗi ngày. */
export function railUpkeep(c) {
  let s = 0;
  for (const l of c.rail.lines) {
    const geo = lineGeo(l);
    for (let k = 1; k < geo.n; k++) { const ch = l.kinds[k]; s += (geo.cum[k] - geo.cum[k - 1]) * (RAIL.upkeep + (ch === 't' ? RAIL.upTunnel : ch === 'b' ? RAIL.upBridge : 0)); }
  }
  return Math.round(s);
}

/** Tổng chiều dài theo loại: { len, bridge, tunnel, lines }. */
export function railStats(c) {
  let len = 0, bridge = 0, tunnel = 0;
  for (const l of c.rail.lines) { const geo = lineGeo(l); for (let k = 1; k < geo.n; k++) { const d = geo.cum[k] - geo.cum[k - 1]; len += d; if (l.kinds[k] === 't') tunnel += d; else if (l.kinds[k] === 'b') bridge += d; } }
  return { len, bridge, tunnel, lines: c.rail.lines.length };
}

// ───────────────────────── tàu liên vận ─────────────────────────

export const TRAIN_HOURS = [7, 11, 15, 19]; // giờ tàu khách liên vận vào ga

/**
 * Mỗi giờ: tới giờ tàu thì mỗi ga thông ra cửa khẩu đón một chuyến: du khách tiêu tiền, người tới định cư dọn vào nhà trống,
 * dân lên tàu đi chơi; thu tiền vé. ctx = { spend(c, n, per), addCitizen, lure, mood }. Trả về tiền vé thu được.
 */
export function railHour(c, { spend, addCitizen, lure = 1, mood = 1 }) {
  const h = c.hour % 24;
  if (!TRAIN_HOURS.includes(h) || (c.inc && c.inc.weather === 'storm')) return 0;
  const rng = c.rng || Math.random, list = linkedStations(c), d = c.rail.day;
  let fees = 0;
  for (const st of list) {
    const tourists = Math.round(22 * lure * mood * (0.7 + rng() * 0.6));
    const pull = c.pull || 0, immig = pull > 0.05 ? Math.round(5 * (0.5 + pull * 1.5) * (0.6 + rng() * 0.8)) : 0;
    const homes = (c.vac && c.vac.home) || [];
    let placed = 0;
    for (let k = 0; k < immig && homes.length && (!c.popl || c.popl.rural > 0); k++) { // người định cư đi tàu từ nông thôn, tỉnh khác
      const j = (rng() * homes.length) | 0, cell = homes[j], r = rng();
      addCitizen(c, 20 + rng() * 25, r < 0.2 ? 3 : r < 0.6 ? 2 : r < 0.9 ? 1 : 0, cell, 60 + rng() * 120);
      placed++;
      if (c.resCount[cell] >= resCap(c.zone[cell], c.level[cell])) homes.splice(j, 1);
    }
    const out = Math.round(clamp((c.pstats ? c.pstats.pop : 0) * 0.0015, 2, 60) * (0.6 + rng() * 0.8));
    spend(c, tourists, 9);
    if (c.tour) c.tour.day.visitors += tourists;
    const fee = RAIL.fare * (tourists + placed + out);
    fees += fee;
    d.trains++; d.tourists += tourists; d.immig += placed; d.out += out; d.fees += fee;
    if (c.events) c.events.push({ type: 'train', text: `🚆 Tàu liên vận ${TRAIN_CODES[(rng() * TRAIN_CODES.length) | 0]}${1 + ((rng() * 19) | 0)} từ ${st.gate.name} vào ga: ${tourists} du khách${placed ? `, ${placed} người tới định cư` : ''}, ${out} người dân lên tàu đi chơi` });
  }
  return fees;
}

export function railDay(c) { c.rail.last = { ...c.rail.day }; c.rail.day = blankDay(); }

/** Dân được đi tàu liên vận thì vui hơn (tối đa +1). */
export function railHappy(c) {
  const l = c.rail && c.rail.last, pop = c.pstats ? c.pstats.pop : 0;
  if (!l || !l.out || pop < 50) return 0;
  return Math.min(1, (l.out / pop) * 80);
}

/**
 * Lịch chạy (chỉ để vẽ): trên mỗi tuyến cửa khẩu → ga, tàu khách và tàu hàng thay nhau chạy vào, dừng, rồi chạy ra.
 * t: giây mô phỏng. Trả về [{ route, s (quãng đường đầu tàu tính từ cửa khẩu), dir (+1 vào ga, -1 ra), freight }].
 */
export function trainsAt(c, t) {
  const out = [], SPEED = 16, DWELL = 18, GAP = 14;
  linkedStations(c).forEach((st, k) => {
    const L = st.route.len, run = L / SPEED, period = 2 * run + DWELL + GAP, u = (t + k * 37.7) % (period * 2), cyc = Math.floor(u / period), v = u - cyc * period;
    const freight = cyc === 1;
    if (v < run) out.push({ route: st.route, s: v * SPEED, dir: 1, freight });
    else if (v < run + DWELL) out.push({ route: st.route, s: L, dir: 1, freight, stop: true });
    else if (v < 2 * run + DWELL) out.push({ route: st.route, s: L - (v - run - DWELL) * SPEED, dir: -1, freight });
  });
  return out;
}

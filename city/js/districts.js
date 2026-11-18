// Phố Mới — quận và chủ tịch quận. Thành phố chia thành nhiều quận (Voronoi quanh trụ sở quận); mỗi quận có một chủ tịch
// với tính cách và năng lực riêng. Thị trưởng chọn cho từng quận: tự làm, giao việc (gõ lệnh), hay để chủ tịch tự chủ.
// Chủ tịch điều khiển các chương trình quận (an ninh, cây xanh, chống ngập, văn hoá, hỗ trợ kinh doanh, an cư) trong
// ngân sách được cấp, tự quyết tình huống khó xử của quận mình khi được giao quyền, và đề xuất / xây một số công trình
// công cộng nhỏ bằng quỹ xây dựng (chủ tịch chọn loại, game chọn chỗ phủ nhiều dân thiếu nhất, không phá nhà). LLM (qua /api/city/ai, kind 'district')
// chỉ chọn mức chương trình, viết lời nhận lệnh, báo cáo và chọn phương án; game ép mọi thứ vào khung và tự tính hậu quả.
// Không có LLM thì dùng kế hoạch, báo cáo, lựa chọn dự phòng bên dưới.
import { N, clamp, jobCap, SERVICES } from './base.js';
import { DILEMMAS, decide } from './council.js';
import { stormSeason } from './seasons.js';

export const DIST_UNLOCK = 400; // số dân để lập quận
export const MAX_LV = 3;
export const NONE = 255;

/** Chương trình quận: cost = ₫ mỗi ngày cho mỗi mức, nhân theo cỡ quận (sizeK). */
export const PROGRAMS = {
  security: { icon: '👮', name: 'Dân phòng, an ninh trật tự', cost: 260, desc: 'tội phạm giảm' },
  green: { icon: '🌳', name: 'Trồng cây, chỉnh trang đô thị', cost: 220, desc: 'bớt bụi, ồn; giá đất tăng' },
  drain: { icon: '🕳️', name: 'Nạo vét cống, chống ngập', cost: 180, desc: 'ít ngập, nước rút nhanh' },
  culture: { icon: '🎭', name: 'Văn hoá, thể thao phường', cost: 200, desc: 'dân vui hơn' },
  business: { icon: '🏪', name: 'Hỗ trợ hộ kinh doanh', cost: 240, desc: 'cửa hàng, văn phòng mở thêm, làm ăn khá hơn' },
  housing: { icon: '🏠', name: 'Hỗ trợ an cư', cost: 220, desc: 'nhà ở mọc nhanh hơn' },
};
export const PKEYS = Object.keys(PROGRAMS);

/** Tính cách chủ tịch: w = trọng số ưu tiên chương trình, spend = phần ngân sách chịu tiêu, pick = thiên hướng khi quyết tình huống. */
export const PERSONAS = {
  dan: { name: 'Gần dân', desc: 'hay xuống phường, lo đời sống bà con, nói chuyện mộc mạc', w: { culture: 1.5, housing: 1.25, drain: 1.2 }, spend: 1, pick: { happy: 1.6 }, bw: { clinic: 1.5, school: 1.4, park: 1.2 } },
  kinhte: { name: 'Mát tay kinh tế', desc: 'nói nhiều về tăng trưởng, thu hút đầu tư, thích số liệu', w: { business: 1.6, housing: 1.25 }, spend: 1, pick: { comm: 1.8, pull: 1.6, money: 1.3 }, bw: { plaza: 1.3, police: 1.2, school: 1.1 } },
  kyluat: { name: 'Kỷ cương', desc: 'nghiêm khắc, coi trọng trật tự, nói ngắn gọn kiểu báo cáo', w: { security: 1.7, drain: 1.1 }, spend: 1, pick: { money: 1.1 }, bw: { police: 1.7, fire: 1.4, floodpump: 1.2 } },
  xanh: { name: 'Xanh – sạch', desc: 'mê cây xanh, môi trường, hơi lý tưởng', w: { green: 1.7, drain: 1.25 }, spend: 1, pick: { tour: 1.5, happy: 1.2 }, bw: { park: 1.7, plaza: 1.3, floodpump: 1.3 } },
  tietkiem: { name: 'Tiết kiệm', desc: 'chắt bóp từng đồng, ngại chi tiêu, hay xin trả lại ngân sách', w: {}, spend: 0.6, pick: { money: 2.2 }, bw: { park: 1.3 } },
  thanhtich: { name: 'Chạy thành tích', desc: 'thích việc dễ thấy, báo cáo hoa mỹ, hay nhắc khen thưởng', w: { green: 1.3, culture: 1.45 }, spend: 1, pick: { tour: 1.4, happy: 1.2 }, bw: { plaza: 1.7, park: 1.2, school: 1.1 } },
};
export const MODES = { self: '🖐️ Tự làm', order: '📋 Giao việc', auto: '🤖 Tự chủ' };

/** Công trình chủ tịch quận được xây (không xây đường, nhà máy, công trình lớn). */
export const BUILDS = ['park', 'plaza', 'school', 'clinic', 'police', 'fire', 'floodpump'];
/** Quyền xây của quận ở chế độ tự chủ: không xây / đề xuất chờ thị trưởng duyệt / tự xây trong quỹ. */
export const BUILD_MODES = { off: '🚫 Không xây', ask: '✋ Xin duyệt', free: '✅ Tự xây' };
const BUILD_MIN = 40; // chỗ tốt nhất phủ thêm ít dân hơn thì không đề xuất
const BUILD_RESERVE = 5000; // chủ tịch không tiêu quỹ thành phố xuống dưới mức này
const BUILD_GOAL = { park: 'value', plaza: 'value', school: 'happy', clinic: 'happy', police: 'crime', fire: 'happy', floodpump: 'flood' };

/** Chỉ tiêu đo được của quận; down = càng thấp càng tốt. */
export const KPIS = {
  pop: { name: 'dân số', down: false }, happy: { name: 'mức vui', down: false }, crime: { name: 'tội phạm', down: true },
  pollution: { name: 'ô nhiễm', down: true }, value: { name: 'giá đất', down: false }, flood: { name: 'nhà ngập', down: true }, jobs: { name: 'việc làm', down: false },
};

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Phan', 'Trịnh'];
const DEM = ['Văn', 'Thị', 'Minh', 'Hữu', 'Đức', 'Thanh', 'Ngọc', 'Quốc', 'Thu', 'Xuân', 'Hoài', 'Kim'];
const TEN = ['Hùng', 'Lan', 'Dũng', 'Hương', 'Tuấn', 'Mai', 'Sơn', 'Hà', 'Long', 'Trang', 'Phong', 'Yến', 'Khải', 'Nga', 'Bình', 'Thảo', 'Cường', 'Hạnh'];

const pick = (rng, a) => a[(rng() * a.length) | 0];
const rngOf = (c) => c.rng || Math.random;

// ───────────────────────── chia quận ─────────────────────────

/** Số quận tối đa theo dân số (2..8). */
export const maxDistricts = (c) => (c.sandbox ? 8 : clamp(2 + Math.floor((c.pp ? c.pp.count : 0) / 600), 2, 8));
export const canSplit = (c) => (c.sandbox || (c.pp && c.pp.count >= DIST_UNLOCK) ? { ok: true } : { ok: false, reason: `Cần ${DIST_UNLOCK} dân để lập quận` });

/** Gán từng ô vào quận có trụ sở gần nhất. */
export function rebuildDmap(c) {
  const D = c.dist;
  if (!c.dmap || c.dmap.length !== N * N) c.dmap = new Uint8Array(N * N);
  if (!D || !D.on || !D.list.length) { c.dmap.fill(NONE); return; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let best = NONE, bd = Infinity;
    D.list.forEach((q, k) => { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = k; } });
    c.dmap[y * N + x] = best;
  }
}

/** Quận của một ô (-1 nếu chưa chia). */
export const districtOf = (c, i) => (c.dist && c.dist.on && c.dmap && c.dmap[i] !== NONE ? c.dmap[i] : -1);

function newChair(c, rng, avoid) {
  const keys = Object.keys(PERSONAS).filter((k) => k !== avoid);
  return { chair: `${pick(rng, HO)} ${pick(rng, DEM)} ${pick(rng, TEN)}`, persona: pick(rng, keys), skill: Math.round((0.35 + rng() * 0.6) * 100) / 100, since: c.day, done: 0, failed: 0 };
}

/**
 * Chia thành phố thành k quận: k-means có trọng số (dân + việc làm) trên các ô đã xây, khởi đầu bằng điểm xa nhau nhất.
 * Chia lại thì giữ chủ tịch, chế độ, chương trình của các quận còn số thứ tự.
 */
export function splitDistricts(c, k) {
  const ok = canSplit(c);
  if (!ok.ok) return ok;
  k = clamp(k | 0, 2, maxDistricts(c));
  const pts = [];
  for (let i = 0; i < N * N; i++) if (c.level[i]) pts.push([i % N, (i / N) | 0, 1 + (c.resCount[i] || 0) + (c.staff ? c.staff[i] || 0 : 0)]);
  if (pts.length < k * 3) return { ok: false, reason: 'Thành phố còn quá ít nhà để chia quận' };
  let sx = 0, sy = 0, sw = 0;
  for (const [x, y, w] of pts) { sx += x * w; sy += y * w; sw += w; }
  const cx = sx / sw, cy = sy / sw, seeds = [[cx, cy]];
  while (seeds.length < k) { // điểm xa các tâm đã có nhất
    let best = null, bd = -1;
    for (const p of pts) { const d = Math.min(...seeds.map((s) => (s[0] - p[0]) ** 2 + (s[1] - p[1]) ** 2)); if (d > bd) { bd = d; best = p; } }
    seeds.push([best[0], best[1]]);
  }
  for (let it = 0; it < 10; it++) {
    const acc = seeds.map(() => [0, 0, 0]);
    for (const p of pts) {
      let b = 0, bd = Infinity;
      seeds.forEach((s, j) => { const d = (s[0] - p[0]) ** 2 + (s[1] - p[1]) ** 2; if (d < bd) { bd = d; b = j; } });
      acc[b][0] += p[0] * p[2]; acc[b][1] += p[1] * p[2]; acc[b][2] += p[2];
    }
    acc.forEach((a, j) => { if (a[2]) seeds[j] = [a[0] / a[2], a[1] / a[2]]; });
  }
  seeds.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cy) ** 2 - ((b[0] - cx) ** 2 + (b[1] - cy) ** 2)); // Quận 1 ở trung tâm
  const D = c.dist, rng = rngOf(c), old = D.list;
  D.list = seeds.map((s, j) => {
    const q = old[j] || { ...newChair(c, rng), mode: 'auto', cap: 1500, prog: {}, order: null, reports: [], nextPlan: c.day, nextReport: c.day + 3 + j, build: 'ask', bcap: 20000, builds: [], prop: null, nextBuild: c.day + 1 };
    return { ...q, name: `Quận ${j + 1}`, x: Math.round(s[0]), y: Math.round(s[1]) };
  });
  D.on = true;
  for (const q of D.list) q.hall = null; // xây trụ sở mới ở trung tâm từng quận
  if (c.fn && c.fn.syncHalls) c.fn.syncHalls(c);
  rebuildDmap(c); districtStats(c); for (const q of D.list) if (!q.lastStat) q.lastStat = { ...q.stat };
  refreshDistricts(c);
  c.events.push({ type: 'council', text: `🏙️ Thành phố chia thành ${k} quận, mỗi quận có chủ tịch riêng (bảng 🏙️ Quận)` });
  return { ok: true, k };
}

/** Dời trụ sở quận (ranh giới tự vẽ lại). */
export function moveSeat(c, d, x, y) {
  const q = c.dist.list[d];
  if (!q) return { ok: false, reason: 'Không có quận này' };
  if (x < 0 || y < 0 || x >= N || y >= N) return { ok: false, reason: 'Ngoài bản đồ' };
  if (c.water[y * N + x]) return { ok: false, reason: 'Trụ sở không đặt dưới nước được' };
  if (c.dist.list.some((o, k) => k !== d && o.x === x && o.y === y)) return { ok: false, reason: 'Trùng trụ sở quận khác' };
  if (c.fn && c.fn.moveHall) { const r = c.fn.moveHall(c, d, x, y); if (!r.ok) return r; } else { q.x = x; q.y = y; }
  rebuildDmap(c); districtStats(c); refreshDistricts(c);
  return { ok: true };
}

/** Giải thể các quận: mọi chương trình dừng. */
export function dissolve(c) { c.dist.on = false; c.dist.list = []; if (c.fn && c.fn.syncHalls) c.fn.syncHalls(c); rebuildDmap(c); c.dfx = null; }

// ───────────────────────── chương trình, chi phí, hiệu ứng ─────────────────────────

/** Cỡ quận (nhân chi phí): theo số dân + việc làm, 0,6..4. */
const sizeK = (q) => clamp(((q.stat ? q.stat.pop + q.stat.jobs * 0.5 : 0) || 300) / 500, 0.6, 4);
export const progCost = (q, k, lv) => Math.round(PROGRAMS[k].cost * lv * sizeK(q));
export const planCost = (q, prog) => PKEYS.reduce((s, k) => s + progCost(q, k, prog[k] | 0), 0);

/** Ép kế hoạch vào khung: mức nguyên 0..3, tổng chi không quá trần (bớt dần chương trình đang nhiều mức nhất, bằng nhau thì cái đắt hơn). */
export function clampPlan(q, prog, cap = Infinity) {
  const out = {};
  for (const k of PKEYS) out[k] = clamp(Math.round(Number.isFinite(+prog?.[k]) ? +prog[k] : 0), 0, MAX_LV);
  while (planCost(q, out) > cap) {
    let kk = null, hi = -1;
    for (const k of PKEYS) { const v = out[k] * 1000 + PROGRAMS[k].cost; if (out[k] && v > hi) { hi = v; kk = k; } }
    if (!kk) break;
    out[kk]--;
  }
  return out;
}

/** Hiệu quả thực hiện: thị trưởng tự làm = 1; chủ tịch 0,75..1,2 theo năng lực. */
export const efficiency = (q) => (q.mode === 'self' ? 1 : 0.75 + 0.45 * q.skill);

/** Tính lại hiệu ứng từng quận (gọi khi đổi chương trình / chế độ). */
export function refreshDistricts(c) {
  const D = c.dist;
  if (!D || !D.on) { c.dfx = null; return; }
  c.dfx = D.list.map((q) => { const e = efficiency(q), f = {}; for (const k of PKEYS) f[k] = (q.prog[k] | 0) * e; return f; });
}

/** Mức hiệu ứng chương trình k ở ô i (0 nếu ô ngoài quận / chưa chia). */
export function distFx(c, i, k) {
  if (!c.dfx) return 0;
  const d = c.dmap[i];
  return d === NONE || !c.dfx[d] ? 0 : c.dfx[d][k];
}

/** Tổng chi các quận mỗi ngày (cộng vào phí trong recalc). */
export const distCost = (c) => (c.dist && c.dist.on ? c.dist.list.reduce((s, q) => s + planCost(q, q.prog), 0) : 0);

/** Thị trưởng tự đặt mức chương trình (chế độ Tự làm). */
export function setProgram(c, d, k, lv) {
  const q = c.dist.list[d];
  if (!q || !PROGRAMS[k]) return { ok: false, reason: 'Không có chương trình này' };
  if (q.mode !== 'self') return { ok: false, reason: 'Quận đang giao cho chủ tịch: chuyển sang 🖐️ Tự làm để tự chỉnh' };
  q.prog = { ...q.prog, [k]: clamp(lv | 0, 0, MAX_LV) };
  refreshDistricts(c);
  return { ok: true, cost: planCost(q, q.prog) };
}

export function setMode(c, d, mode) {
  const q = c.dist.list[d];
  if (!q || !MODES[mode]) return { ok: false };
  q.mode = mode;
  if (mode === 'auto') q.nextPlan = c.day; // tự chủ: lập kế hoạch ngay giờ tới
  if (mode !== 'order' && q.order && q.order.status === 'active') q.order.status = 'cancelled';
  refreshDistricts(c);
  return { ok: true };
}

export function setCap(c, d, cap) {
  const q = c.dist.list[d];
  if (!q) return { ok: false };
  q.cap = clamp(Math.round(+cap || 0), 0, 50000);
  if (q.mode !== 'self') { q.prog = clampPlan(q, q.prog, q.cap); refreshDistricts(c); }
  return { ok: true };
}

/** Thay chủ tịch (5 ngày một lần). */
export function replaceChair(c, d) {
  const q = c.dist.list[d];
  if (!q) return { ok: false };
  if (c.day - q.since < 5) return { ok: false, reason: `Chủ tịch mới nhận việc, chờ ${5 - (c.day - q.since)} ngày nữa` };
  const old = q.chair;
  Object.assign(q, newChair(c, rngOf(c), q.persona), { order: null, reports: [], prop: null });
  if (q.mode === 'order') q.mode = 'auto';
  q.nextPlan = c.day; refreshDistricts(c);
  c.events.push({ type: 'council', text: `🔄 ${q.name}: ${q.chair} (${PERSONAS[q.persona].name}) thay ${old} làm chủ tịch` });
  return { ok: true };
}

// ───────────────────────── số liệu quận ─────────────────────────

/** Số liệu thật của từng quận, lưu vào q.stat. */
export function districtStats(c) {
  const D = c.dist;
  if (!D || !D.on) return;
  const n = D.list.length, acc = D.list.map(() => ({ pop: 0, jobs: 0, hs: 0, crime: 0, pollution: 0, value: 0, built: 0, flood: 0, homes: 0 }));
  for (let i = 0; i < N * N; i++) {
    const d = c.dmap[i];
    if (d === NONE || d >= n || !c.level[i]) continue;
    const a = acc[d], rc = c.resCount[i] || 0;
    a.built++; a.crime += c.crime[i]; a.pollution += c.pollution[i]; a.value += c.landValue[i];
    a.jobs += jobCap(c.zone[i], c.level[i]);
    if (rc) { a.pop += rc; a.homes++; if (c.fn && c.fn.cellHappy) a.hs += c.fn.cellHappy(c, i).happy * rc; }
    if (c.flood && c.flood[i] >= 1.5) a.flood++;
  }
  D.list.forEach((q, d) => {
    const a = acc[d], b = Math.max(1, a.built);
    q.stat = { pop: a.pop, jobs: a.jobs, happy: a.pop ? Math.round(a.hs / a.pop) : 0, crime: Math.round((a.crime / b) * 100), pollution: Math.round((a.pollution / b) * 100), value: Math.round(a.value / b), flood: a.flood, built: a.built };
  });
}

/** Tóm tắt một quận gửi cho LLM. */
export function distSummary(c, d) {
  const q = c.dist.list[d], P = PERSONAS[q.persona];
  return {
    district: q.name, chair: q.chair, persona: P.name, personaDesc: P.desc, skill: Math.round(q.skill * 100), mode: q.mode, cap: q.cap,
    stat: q.stat || {}, prog: { ...q.prog }, costs: Object.fromEntries(PKEYS.map((k) => [k, progCost(q, k, 1)])), storm: stormSeason(c), day: c.day + 1,
    buildFund: Math.max(0, Math.round(q.bcap * P.spend - buildSpent(c, q))), built: (q.builds || []).slice(-4).map((b) => b.type),
  };
}

// ───────────────────────── kế hoạch dự phòng ─────────────────────────

/** Nhu cầu của quận cho từng chương trình (0..~2). */
function needs(c, q) {
  const s = q.stat || {}, dm = c.demand || {};
  return {
    security: (s.crime || 0) / 25,
    green: (s.pollution || 0) / 22 + ((s.value || 50) < 40 ? 0.3 : 0),
    drain: (s.flood || 0) / Math.max(4, (s.built || 1) * 0.08) + (stormSeason(c) ? 0.45 : 0),
    culture: clamp((62 - (s.happy || 60)) / 18, 0, 2),
    business: Math.max(0, (dm.c || 0) + (dm.o || 0)) * 0.7 + ((s.jobs || 0) < (s.pop || 0) * 0.45 ? 0.5 : 0.1),
    housing: Math.max(0, dm.r || 0) * 0.9 + 0.1,
  };
}

/** Chủ tịch tự lập kế hoạch: xếp chương trình theo nhu cầu × tính cách, nâng dần mức trong ngân sách. */
export function autoPlan(c, q) {
  const P = PERSONAS[q.persona], nd = needs(c, q), cap = q.cap * P.spend, prog = Object.fromEntries(PKEYS.map((k) => [k, 0]));
  const order = PKEYS.map((k) => [k, nd[k] * (P.w[k] || 1)]).filter(([, v]) => v > 0.25).sort((a, b) => b[1] - a[1]);
  for (let lv = 1; lv <= MAX_LV; lv++) for (const [k, v] of order) {
    if (lv > 1 && v < 0.55 * lv) continue;
    const t = { ...prog, [k]: lv };
    if (planCost(q, t) <= cap) prog[k] = lv;
  }
  const top = order.filter(([k]) => prog[k]).map(([k]) => PROGRAMS[k].name.toLowerCase());
  return { prog, reply: top.length ? `Tôi tập trung vào ${top.slice(0, 2).join(' và ')}.` : 'Quận đang ổn, tôi giữ tiền chưa chi.' };
}

const ORDER_KEYS = [
  [/an ninh|trộm|cướp|tội phạm|trật tự|công an|móc túi/i, 'security', 'crime'],
  [/cây|xanh|bụi|ô nhiễm|khói|ồn|môi trường|sạch|rác/i, 'green', 'pollution'],
  [/ngập|cống|lụt|mưa|thoát nước|triều/i, 'drain', 'flood'],
  [/vui|văn hoá|văn hóa|thể thao|lễ|đời sống|hài lòng/i, 'culture', 'happy'],
  [/kinh doanh|buôn bán|cửa hàng|việc làm|doanh nghiệp|thuế|đầu tư|văn phòng/i, 'business', 'jobs'],
  [/nhà|dân số|thu hút|an cư|ở\b|định cư/i, 'housing', 'pop'],
  [/giá đất|đẹp|chỉnh trang/i, 'green', 'value'],
];

const BUILD_KEYS = [
  [/quảng trường/i, 'plaza'], [/trường học|trường tiểu học|lớp học|(xây|mở|thêm)( thêm)?( một)? trường/i, 'school'], [/y tế|bệnh|trạm xá|khám/i, 'clinic'],
  [/đồn|công an/i, 'police'], [/cứu ho[aả]|cứu hỏa|chữa cháy|pccc/i, 'fire'], [/công viên|vườn hoa/i, 'park'], [/trạm bơm|máy bơm/i, 'floodpump'],
];
/** Lệnh có đòi xây công trình không (cần chữ "xây", "mở thêm"… kèm tên công trình). */
export function orderBuild(text) {
  if (!/xây|dựng|mở thêm|làm thêm|đặt thêm|thêm một|cần một/i.test(text)) return null;
  const k = BUILD_KEYS.find(([re]) => re.test(text));
  return k ? k[1] : null;
}

/** Lệnh của thị trưởng → kế hoạch (dự phòng khi không có LLM): tìm từ khoá, dồn mức cho chương trình hợp lệnh, xây nếu được lệnh. */
export function orderFallback(q, text) {
  const hit = ORDER_KEYS.filter(([re]) => re.test(text)), build = orderBuild(text);
  if (!hit.length && build) return { prog: { ...q.prog }, days: 7, goal: BUILD_GOAL[build], build, reply: `Rõ, thưa thị trưởng. ${q.name} sẽ xây ${SERVICES[build].name.toLowerCase()} ở chỗ phủ được nhiều dân nhất.` };
  if (!hit.length) return { prog: { ...q.prog }, days: 7, goal: 'happy', reply: 'Tôi chưa rõ ý thị trưởng, xin giữ nguyên các chương trình và theo dõi mức vui của dân.' };
  const prog = Object.fromEntries(PKEYS.map((k) => [k, 0]));
  for (const [, k] of hit) prog[k] = MAX_LV;
  const names = [...new Set(hit.map(([, k]) => PROGRAMS[k].name.toLowerCase()))], m = /(\d+)\s*ngày/i.exec(text), days = clamp(m ? +m[1] : 7, 3, 15);
  return { prog, days, goal: hit[0][2], build, reply: `Rõ, thưa thị trưởng. ${q.name} sẽ đẩy mạnh ${names.join('; ')} trong ${days} ngày tới${build ? `, và xây ${SERVICES[build].name.toLowerCase()}` : ''}.` };
}

/** Ghi nhận lệnh đã thành kế hoạch (từ LLM hoặc dự phòng): ép vào khung, đặt chỉ tiêu và hạn. */
export function applyOrder(c, d, text, plan) {
  const q = c.dist.list[d];
  if (!q) return { ok: false };
  const goal = KPIS[plan.goal] ? plan.goal : 'happy', days = clamp(Math.round(+plan.days || 7), 3, 15);
  q.mode = 'order';
  q.prog = clampPlan(q, plan.prog, q.cap);
  q.order = { text: String(text).slice(0, 400), reply: String(plan.reply || '').slice(0, 600), day: c.day, until: c.day + days, goal, start: q.stat ? q.stat[goal] : 0, status: 'active', ai: !!plan.ai };
  refreshDistricts(c);
  if (BUILDS.includes(plan.build) && c.fn && c.fn.distBuild) { // thị trưởng đã lệnh thì xây luôn (không cần duyệt, không tính quỹ quận)
    const r = doBuild(c, d, plan.build, 'order');
    q.order.build = { type: plan.build, ok: !!r.ok, reason: r.ok ? '' : r.reason };
  }
  return { ok: true, order: q.order };
}

/** Áp kế hoạch tự chủ (LLM hoặc dự phòng). */
export function applyPlan(c, d, plan) {
  const q = c.dist.list[d];
  if (!q || q.mode !== 'auto') return { ok: false };
  q.prog = clampPlan(q, plan.prog, q.cap);
  q.note = String(plan.reply || '').slice(0, 400); q.noteAi = !!plan.ai;
  refreshDistricts(c);
  return { ok: true };
}

// ───────────────────────── công trình quận ─────────────────────────

export function setBuildMode(c, d, m) {
  const q = c.dist.list[d];
  if (!q || !BUILD_MODES[m]) return { ok: false };
  q.build = m;
  if (m === 'off' && q.prop) q.prop = null;
  return { ok: true };
}
export function setBuildCap(c, d, v) {
  const q = c.dist.list[d];
  if (!q) return { ok: false };
  q.bcap = clamp(Math.round(+v || 0), 0, 200000);
  return { ok: true };
}

/** Quỹ xây dựng đã tiêu trong 7 ngày gần nhất. */
export const buildSpent = (c, q) => (q.builds || []).filter((b) => b.day > c.day - 7).reduce((s, b) => s + b.cost, 0);

/** Các công trình quận d xây được lúc này (trong quỹ, đã mở khoá, có chỗ phủ đủ nhiều dân thiếu): [{ type, need, gain, cost, x, y }]. */
export function buildCands(c, d) {
  const q = c.dist.list[d], out = [];
  if (!q || !c.fn || !c.fn.distBuildPlan) return out;
  const left = q.bcap * PERSONAS[q.persona].spend - buildSpent(c, q);
  for (const t of BUILDS) {
    const cost = SERVICES[t].cost;
    if (cost > left || cost > c.money - BUILD_RESERVE) continue;
    const p = c.fn.distBuildPlan(c, d, t);
    if (p.x == null || p.gain < BUILD_MIN) continue;
    out.push({ type: t, need: p.need, gain: p.gain, cost, x: p.x, y: p.y });
  }
  return out;
}

/** Chủ tịch chọn công trình (dự phòng khi không có LLM): số dân phủ thêm × thiên hướng tính cách, chia theo giá. */
export function buildPick(q, cands) {
  const P = PERSONAS[q.persona];
  let best = null, bs = -Infinity;
  for (const o of cands) { const s = (o.gain * (P.bw[o.type] || 1)) / (o.cost / 1000) ** (P.spend < 1 ? 0.8 : 0.5); if (s > bs) { bs = s; best = o.type; } }
  return best;
}
const buildWhy = (o) => `Khoảng ${o.need} dân trong quận còn thiếu ${SERVICES[o.type].name.toLowerCase()} gần nhà; đặt ở chỗ này phủ được nhiều người nhất.`;
const bName = (t) => `${SERVICES[t].icon} ${SERVICES[t].name}`;
const vnd = (v) => `${Math.round(v).toLocaleString('vi-VN')} ₫`;

/** Xây ngay (game chọn chỗ) và ghi vào sổ của quận. how: 'auto' | 'ask' (thị trưởng duyệt) | 'order' (thị trưởng giao). */
function doBuild(c, d, type, how) {
  const q = c.dist.list[d], r = c.fn.distBuild(c, d, type);
  if (!r.ok) { c.events.push({ type: 'council', text: `⚠️ ${q.name} không xây được ${bName(type)}: ${r.reason}` }); return r; }
  (q.builds || (q.builds = [])).push({ type, day: c.day, cost: r.cost, x: r.x, y: r.y, how });
  if (q.builds.length > 12) q.builds.splice(0, q.builds.length - 12);
  c.events.push({ type: 'council', text: `🏗️ ${q.name}: chủ tịch ${q.chair} cho xây ${bName(type)} (${vnd(r.cost)})${how === 'ask' ? ' theo đề xuất được duyệt' : how === 'order' ? ' theo lệnh thị trưởng' : ''}` });
  return r;
}

/** Thị trưởng duyệt / bác đề xuất xây của quận d. */
export function approveBuild(c, d, yes) {
  const q = c.dist.list[d], p = q && q.prop;
  if (!p || p.status !== 'ask') return { ok: false, reason: 'Không có đề xuất chờ duyệt' };
  q.prop = null;
  if (!yes) { c.events.push({ type: 'council', text: `❌ Thị trưởng bác đề xuất xây ${bName(p.type)} của ${q.name}` }); return { ok: true }; }
  return doBuild(c, d, p.type, 'ask');
}

/** Mỗi giờ: đề xuất đã cân nhắc xong thì xây (tự xây) hoặc trình thị trưởng (xin duyệt); đề xuất quá 3 ngày thì bỏ. */
function buildHour(c, D) {
  D.list.forEach((q, d) => {
    const p = q.prop;
    if (!p) return;
    if (p.status === 'ask') { if (c.day >= p.until) { q.prop = null; c.events.push({ type: 'council', text: `⌛ Đề xuất xây ${bName(p.type)} của ${q.name} hết hạn` }); } return; }
    if (q.mode !== 'auto' || q.build === 'off') { q.prop = null; return; }
    if (c.hour < p.at) return;
    const a = p.ai;
    if (a && a.type === 'none') { q.prop = null; q.note = String(a.why || 'Quận chưa cần xây thêm.').slice(0, 400); q.noteAi = true; return; }
    if (a && p.cands.some((o) => o.type === a.type)) { p.type = a.type; p.why = String(a.why || '').slice(0, 300) || p.why; p.aiw = true; }
    const o = p.cands.find((x) => x.type === p.type);
    Object.assign(p, { x: o.x, y: o.y, cost: o.cost, need: o.need });
    if (q.build === 'free') { q.prop = null; doBuild(c, d, p.type, 'auto'); return; }
    p.status = 'ask'; p.until = c.day + 3;
    c.events.push({ type: 'council', text: `✋ ${q.name} xin xây ${bName(p.type)} (${vnd(p.cost)}): duyệt trong bảng 🏙️ Quận` });
  });
}

// ───────────────────────── tình huống giao cho quận ─────────────────────────

/** Điểm một phương án theo tính cách (dự phòng khi không có LLM). */
function optScore(q, o) {
  const w = PERSONAS[q.persona].pick, g = (k) => w[k] || 1;
  let s = (o.money / 3000) * g('money');
  for (const [k, v, days] of o.mods) {
    const t = days / 10;
    if (k === 'happy') s += v * t * g('happy');
    else if (k === 'pull') s += v * 100 * t * g('pull');
    else if (k === 'comm') s += v * 100 * t * g('comm');
    else s += (v - 1) * 20 * t * g('tour');
  }
  if (o.rating) s += o.rating * 4 * g('tour');
  if (o.fire) s -= 12 * (1.4 - q.skill);
  return s;
}
export function chairPick(q, type) {
  const opts = DILEMMAS[type].options;
  let best = opts[0], bs = -Infinity;
  for (const o of opts) { const s = optScore(q, o); if (s > bs) { bs = s; best = o; } }
  return best.id;
}

// ───────────────────────── báo cáo ─────────────────────────

const fmtD = (v) => `${v > 0 ? '+' : ''}${v}`;

/** Báo cáo dự phòng từ số liệu thật. */
export function reportFallback(q, delta, result) {
  const s = q.stat || {}, P = PERSONAS[q.persona], parts = [];
  parts.push(`${q.name} hiện có ${s.pop || 0} dân, ${s.jobs || 0} chỗ làm, mức vui ${s.happy || 0}.`);
  const good = [], bad = [];
  for (const k in delta) { const v = delta[k]; if (!v) continue; ((KPIS[k].down ? v < 0 : v > 0) ? good : bad).push(`${KPIS[k].name} ${fmtD(v)}`); }
  if (good.length) parts.push(`${q.persona === 'thanhtich' ? 'Rất phấn khởi báo cáo' : 'Kết quả tốt'}: ${good.join(', ')}.`);
  if (bad.length) parts.push(`${q.persona === 'thanhtich' ? 'Còn vài điểm cần cố gắng thêm' : 'Chưa tốt'}: ${bad.join(', ')}.`);
  if (result) parts.push(result.ok ? `Việc thị trưởng giao đã hoàn thành (${KPIS[result.goal].name} ${result.from} → ${result.to}).` : `Việc thị trưởng giao chưa đạt (${KPIS[result.goal].name} ${result.from} → ${result.to}), xin nhận khuyết điểm.`);
  if (P.spend < 1) parts.push('Quận đã tiết kiệm một phần ngân sách.');
  return parts.join(' ');
}

function report(c, d, result) {
  const q = c.dist.list[d], s = q.stat || {}, prev = q.lastStat || s, delta = {};
  for (const k in KPIS) delta[k] = (s[k] || 0) - (prev[k] || 0);
  const r = { id: c.dist.nextId++, day: c.day, text: reportFallback(q, delta, result), delta, stat: { ...s }, result: result || null };
  q.reports.push(r); if (q.reports.length > 8) q.reports.splice(0, q.reports.length - 8);
  q.lastStat = { ...s };
  c.events.push({ type: 'council', text: `📋 ${q.name} (chủ tịch ${q.chair}) gửi báo cáo` });
  return r;
}

// ───────────────────────── mỗi giờ ─────────────────────────

/**
 * Mỗi giờ: giao tình huống mới cho quận, chủ tịch quyết khi tới giờ; 6 giờ sáng: số liệu, kế hoạch tự chủ (mỗi 4 ngày),
 * hết hạn lệnh, báo cáo (mỗi 6 ngày, các quận lệch ngày nhau); đêm: hỗ trợ kinh doanh cộng tiền cho doanh nghiệp.
 * Trả về các việc cần LLM: { task: 'plan' | 'report' | 'pick', d, id? }.
 */
export function districtHour(c) {
  const D = c.dist, jobs = [];
  if (!D || !D.on) return jobs;
  const h = c.hour % 24, rng = rngOf(c);
  if (c.fn && c.fn.syncHalls && c.fn.syncHalls(c)) districtStats(c); // trụ sở bị phá thì xây lại, bị dời thì ranh giới theo
  // tình huống mới: gán cho một quận (theo dân); quận tự chủ thì chủ tịch quyết sau 4 giờ nếu thị trưởng chưa quyết
  for (const it of c.council.inbox) {
    if (it.kind !== 'dilemma' || it.status !== 'pending') continue;
    if (it.district === undefined) {
      const tot = D.list.reduce((s, q) => s + (q.stat ? q.stat.pop : 1) + 1, 0);
      let r = rng() * tot, d = 0;
      for (; d < D.list.length - 1; d++) { r -= (D.list[d].stat ? D.list[d].stat.pop : 1) + 1; if (r <= 0) break; }
      it.district = d;
      if (D.list[d].mode === 'auto') { it.chairAt = c.hour + 4; jobs.push({ task: 'pick', d, id: it.id }); }
    } else if (it.chairAt != null && c.hour >= it.chairAt) {
      const q = D.list[it.district];
      if (!q || q.mode !== 'auto') { delete it.chairAt; continue; }
      const id = it.pick && DILEMMAS[it.type].options.some((o) => o.id === it.pick.id) ? it.pick.id : chairPick(q, it.type);
      decide(c, it.id, id, false, `${q.name} (${q.chair})`);
      it.why = it.pick ? it.pick.why : `Theo hướng ${PERSONAS[q.persona].name.toLowerCase()} của chủ tịch.`;
    }
  }
  buildHour(c, D);
  if (h === 6) {
    districtStats(c);
    D.list.forEach((q, d) => {
      if (q.mode === 'auto' && c.day >= q.nextPlan) {
        q.nextPlan = c.day + 4;
        applyPlan(c, d, autoPlan(c, q));
        jobs.push({ task: 'plan', d });
      }
      if (q.mode === 'auto' && q.build !== 'off' && !q.prop && c.day >= (q.nextBuild | 0)) { // 3 ngày một lần xem quận thiếu gì
        q.nextBuild = c.day + 3;
        const cands = buildCands(c, d);
        if (cands.length) {
          const t = buildPick(q, cands);
          q.prop = { type: t, why: buildWhy(cands.find((o) => o.type === t)), day: c.day, at: c.hour + 3, status: 'think', cands };
          jobs.push({ task: 'build', d });
        }
      }
      let result = null;
      if (q.order && q.order.status === 'active' && c.day >= q.order.until) {
        const o = q.order, now = q.stat[o.goal], ok = KPIS[o.goal].down ? now < o.start || now === 0 : now > o.start;
        o.status = ok ? 'done' : 'failed'; o.end = now;
        if (ok) q.done++; else q.failed++;
        result = { ok, goal: o.goal, from: o.start, to: now };
        c.events.push({ type: 'council', text: `${ok ? '✅' : '❌'} ${q.name}: việc giao "${o.text.slice(0, 40)}" ${ok ? 'hoàn thành' : 'chưa đạt'} (${KPIS[o.goal].name} ${o.start} → ${now})` });
      }
      if (result || c.day >= q.nextReport) {
        q.nextReport = c.day + 6;
        const r = report(c, d, result);
        jobs.push({ task: 'report', d, id: r.id });
      }
    });
  }
  if (h === 0 && c.dfx && c.biz) { // hỗ trợ hộ kinh doanh: doanh nghiệp trong quận có thêm vốn mỗi ngày
    for (let i = 0; i < N * N; i++) { const f = c.level[i] && jobCap(c.zone[i], c.level[i]) ? distFx(c, i, 'business') : 0; if (f) c.biz.money[i] += 6 * f; }
  }
  return jobs;
}

// ───────────────────────── lưu / nạp ─────────────────────────

export function initDistricts(c, o = {}) {
  const list = Array.isArray(o.list) ? o.list.filter((q) => q && PERSONAS[q.persona]).slice(0, 8).map((q, j) => ({
    name: `Quận ${j + 1}`, chair: String(q.chair || 'Chủ tịch'), persona: q.persona, skill: clamp(+q.skill || 0.5, 0.2, 1), since: q.since | 0, done: q.done | 0, failed: q.failed | 0,
    x: clamp(q.x | 0, 0, N - 1), y: clamp(q.y | 0, 0, N - 1), mode: MODES[q.mode] ? q.mode : 'auto', cap: clamp(+q.cap || 0, 0, 50000), prog: q.prog || {},
    order: q.order || null, reports: Array.isArray(q.reports) ? q.reports.slice(-8) : [], nextPlan: q.nextPlan | 0, nextReport: q.nextReport | 0, note: q.note || '', lastStat: q.lastStat || null, stat: q.stat || null, hall: Number.isFinite(+q.hall) && q.hall !== null ? +q.hall : null,
    build: BUILD_MODES[q.build] ? q.build : 'ask', bcap: clamp(Number.isFinite(+q.bcap) && q.bcap !== null ? +q.bcap : 20000, 0, 200000), nextBuild: q.nextBuild | 0,
    builds: Array.isArray(q.builds) ? q.builds.filter((b) => b && BUILDS.includes(b.type)).slice(-12).map((b) => ({ type: b.type, day: b.day | 0, cost: Math.max(0, +b.cost || 0), x: b.x | 0, y: b.y | 0, how: String(b.how || 'auto').slice(0, 6) })) : [],
    prop: q.prop && q.prop.status === 'ask' && BUILDS.includes(q.prop.type) ? { type: q.prop.type, why: String(q.prop.why || '').slice(0, 300), day: q.prop.day | 0, until: q.prop.until | 0, status: 'ask', x: q.prop.x | 0, y: q.prop.y | 0, cost: +q.prop.cost || 0, need: q.prop.need | 0, aiw: !!q.prop.aiw } : null,
  })) : [];
  c.dist = { on: !!o.on && list.length >= 2, list, nextId: Math.max(1, o.nextId | 0) };
  for (const q of list) q.prog = clampPlan(q, q.prog);
  rebuildDmap(c); refreshDistricts(c);
}
export const packDistricts = (c) => ({ on: c.dist.on, nextId: c.dist.nextId, list: c.dist.list.map((q) => ({ ...q, wait: undefined, reports: q.reports.slice(-6) })) });

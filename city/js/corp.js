// Phố Mới — tập đoàn AI, Phase 1 (xem city/CORPORATE.md). Công ty là lớp SỞ HỮU phủ lên các ô nhà máy có sẵn: c.owner[i]
// = id công ty (0 = doanh nghiệp độc lập, như trước đây). Kinh tế (nguyên liệu, xe tải, lương, thuế) vẫn do bizHour chạy.
// Công ty chỉ có: quỹ (nằm trong totalMoney), CEO với tính cách, và các hành động đi qua MỘT cổng corpAct (kiểm tra → thực thi →
// ghi lịch sử). Phase 1: CEO chạy bằng luật theo tính cách (chưa gọi LLM; LLM sẽ chỉ chọn trong danh sách hành động hợp lệ).
// Mọi chuyển tiền là chuyển nội bộ trong thành phố hoặc đi qua procure / inner / world, nên sổ cái vẫn khớp.
import { N, MK, ZDEF, PRODUCTS, productAt, jobCap, hash2, clamp } from './base.js';
import { inner, world } from './ledger.js';

/** Bảng tham số cân bằng (đơn vị: MK). */
export const CORP = {
  sweepFrom: 150, sweepRate: 0.35, // cuối ngày: ô sở hữu có quá 150 MK thì 35% phần dư về quỹ công ty
  cellFee: 80, reserve: 40, // phí phát triển một ô (thuê doanh nghiệp xây); quỹ tối thiểu giữ lại
  landFee: 30, // phí đất nộp ngân sách mỗi ô khi dự án được duyệt
  askDays: 8, askCool: 15, breachCool: 30, actCool: 3, // hạn trả lời, nghỉ sau khi bị từ chối / sai cam kết, nhịp hành động
  commitDays: 40, jobsPerCell: 7, pendDays: 40, maxLog: 120,
  foundEvery: 6, foundMin: 300, // lập công ty mới: mỗi 6 ngày, thành phố từ 300 dân
  subCells: 5, subCool: 12, maxSubs: 3, // công ty con: mẹ có ≥ 5 nhà máy, nghỉ 12 ngày giữa hai lần lập, tối đa 3 con
  expOn: 18, expOff: 8, decideHours: 6, // đẩy xuất khẩu khi tồn kho thành phẩm ≥ 18 (tắt khi < 8); chờ AI chọn tối đa 6 giờ game
};
export const maxCorps = (c) => clamp(2 + Math.floor((c.pp ? c.pp.count : 0) / 700), 2, 8);
export const STAGES = ['', 'Khởi nghiệp', 'Đang lớn', 'Doanh nghiệp lớn', 'Tập đoàn'];

/** Tính cách CEO: risk = máu liều, payout = tỷ lệ chia cổ tức, concede = chịu nhượng bộ khi thị trưởng đòi thêm. */
export const CEOS = {
  careful: { name: 'Thận trọng', risk: 0.2, payout: 0.35, concede: 0.8, philosophy: 'Chắc ăn mặc bền, giữ tiền mặt dày', invest: 'Mở rộng sát nhà máy hiện có', nego: 'Mềm mỏng, chịu cam kết' },
  steady: { name: 'Vững vàng', risk: 0.45, payout: 0.25, concede: 0.55, philosophy: 'Lớn đều theo nhu cầu thị trường', invest: 'Cân bằng giữa mở rộng và chia lãi', nego: 'Thực tế, mặc cả vừa phải' },
  bold: { name: 'Liều lĩnh', risk: 0.8, payout: 0.1, concede: 0.25, philosophy: 'Ăn to, phải chiếm thị phần trước', invest: 'Xây thật nhanh, ít giữ tiền', nego: 'Cứng rắn, đòi ưu đãi' },
  dividend: { name: 'Trọng cổ tức', risk: 0.3, payout: 0.5, concede: 0.5, philosophy: 'Cổ đông là trên hết', invest: 'Chỉ mở rộng khi chắc có lãi', nego: 'Thích số liệu, ít nhượng bộ' },
};
export const CEO_KEYS = Object.keys(CEOS);
const BASES = ['Đại Việt', 'Hồng Hà', 'Phương Nam', 'Sông Hương', 'Bạch Đằng', 'Cửu Long', 'Thăng Long', 'Lạc Hồng', 'Tân Á', 'Việt Tiến', 'Sao Mai', 'Trường Sơn'];
const prefix = (st) => (st >= 4 ? 'Tập đoàn' : st === 3 ? 'Tổng công ty' : 'Công ty');
export const corpTitle = (q) => `${prefix(q.stage)} ${q.name}`;

const cur = (c) => (c.corp ? c.corp : null);
export const corpById = (c, id) => (c.corp ? c.corp.list.find((q) => q.id === id) : undefined);
const built = (c, i) => c.level[i] > 0;
const idxXY = (x, y) => y * N + x;
const day = (c) => c.day;

// ───────────────────────── nhật ký ─────────────────────────

/** Ghi lịch sử (chỉ từ chỗ sự kiện thật xảy ra). */
export function corpLog(c, q, type, data = {}) {
  q.log.push({ day: c.day, type, ...data });
  if (q.log.length > CORP.maxLog) q.log.splice(0, q.log.length - CORP.maxLog);
}
const news = (c, text) => c.events.push({ type: 'council', text });

// ───────────────────────── chỉ số ─────────────────────────

export const cellsBuilt = (c, q) => q.cells.filter(([i]) => built(c, i)).map(([i]) => i);
export const jobsOf = (c, q) => cellsBuilt(c, q).reduce((s, i) => s + jobCap(c.zone[i], c.level[i]), 0);
/** Hiệu suất trung bình các nhà máy của công ty (0..1). */
export function effOf(c, q) {
  const l = cellsBuilt(c, q);
  return l.length ? l.reduce((s, i) => s + c.biz.eff[i], 0) / l.length : 0.5;
}
/** Thành phẩm chính: loại có nhiều ô nhất trong các ô công ty. */
export function corpSector(c, q) {
  const n = {};
  for (const [i] of q.cells) { const p = productAt(i, c.zone[i] === 21 ? 21 : 3); n[p] = (n[p] || 0) + 1; }
  let best = q.sector;
  for (const k in n) if (!best || n[k] > (n[best] || 0)) best = k;
  return best;
}
/** Bậc: tính từ chỉ số đo được (cả nhóm công ty con), không ai đặt. Bậc 4 = tập đoàn có ≥ 2 công ty con và ≥ 12 nhà máy cả nhóm. */
export function stageOf(c, q) {
  const g = groupOf(c, q), n = g.n, jobs = g.jobs, s = q.stage || 1;
  // có độ trễ: lên bậc khi đạt ngưỡng, chỉ tụt khi thấp hơn ngưỡng một nấc (tránh nhấp nháy khi một ô bị dỡ)
  const up = g.subs >= 2 && n >= 12 ? 4 : n >= 8 && jobs >= 150 ? 3 : n >= 3 ? 2 : 1, down = g.subs >= 1 && n >= 10 ? 4 : n >= 7 && jobs >= 120 ? 3 : n >= 2 ? 2 : 1;
  return up >= s ? up : Math.max(down, up);
}
/** Ảnh hưởng 0..100: tỷ trọng việc làm, sản lượng công nghiệp, thị phần theo sản phẩm. */
export function influence(c, q) {
  let totJobs = 0, totInd = 0, same = 0, all = 0;
  const p = corpSector(c, q);
  for (let i = 0; i < N * N; i++) {
    if (!c.level[i]) continue;
    const jc = jobCap(c.zone[i], c.level[i]);
    totJobs += jc;
    if (ZDEF[c.zone[i]].biz === 'ind') { totInd += jc; if (productAt(i, c.zone[i]) === p) { all++; if (c.owner[i] === q.id) same++; } }
  }
  const mine = cellsBuilt(c, q), jobs = jobsOf(c, q), ind = mine.filter((i) => ZDEF[c.zone[i]].biz === 'ind').reduce((s, i) => s + jobCap(c.zone[i], c.level[i]), 0);
  const v = 100 * (0.4 * (totJobs ? jobs / totJobs : 0) + 0.3 * (totInd ? ind / totInd : 0) + 0.3 * (all ? same / all : 0));
  return Math.round(v * 10) / 10;
}
export function corpStats(c, q) {
  const mine = cellsBuilt(c, q);
  return { cells: mine.length, pending: q.cells.length - mine.length, jobs: jobsOf(c, q), eff: effOf(c, q), cash: q.cash, stage: q.stage, influence: influence(c, q), sector: corpSector(c, q), group: groupOf(c, q), export: q.export, intern: Math.round(q.intern), xunits: Math.round(q.xunits) };
}

// ───────────────────────── khởi tạo, lưu ─────────────────────────

function claim(c, q, i) { c.owner[i] = q.id; q.cells.push([i, c.day]); }
function release(c, q, i) { if (c.owner[i] === q.id) c.owner[i] = 0; q.cells = q.cells.filter(([k]) => k !== i); }
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

export function initCorp(c, o = {}) {
  c.owner = new Uint16Array(N * N);
  const list = [];
  for (const r of (Array.isArray(o.list) ? o.list : []).slice(0, 16)) {
    if (!r || !(r.id > 0) || list.some((q) => q.id === r.id)) continue;
    const q = {
      id: r.id | 0, name: String(r.name || 'Công ty').replace(/[<>]/g, '').slice(0, 40), ceo: CEOS[r.ceo] ? r.ceo : 'steady', sector: PRODUCTS[r.sector] ? r.sector : null,
      parent: r.parent | 0, stage: clamp(r.stage | 0, 1, 4), cash: Math.max(0, num(r.cash)), born: r.born | 0, trust: clamp(num(r.trust), -3, 5),
      cool: { act: num(r.cool && r.cool.act), ask: num(r.cool && r.cool.ask), sub: num(r.cool && r.cool.sub) },
      export: r.export ? 1 : 0, xAt: num(r.xAt), intern: Math.max(0, num(r.intern)), xunits: Math.max(0, num(r.xunits)),
      goal: r.goal && r.goal.jobs > 0 ? { jobs: r.goal.jobs | 0 } : { jobs: 40 },
      cells: (Array.isArray(r.cells) ? r.cells : []).filter((p) => Array.isArray(p) && p[0] >= 0 && p[0] < N * N).map((p) => [p[0] | 0, p[1] | 0]),
      deals: (Array.isArray(r.deals) ? r.deals : []).slice(0, 6).map((d) => ({ id: d.id | 0, cells: d.cells | 0, jobs: d.jobs | 0, base: d.base | 0, due: d.due | 0, status: ['open', 'met', 'breach'].includes(d.status) ? d.status : 'open' })),
      log: (Array.isArray(r.log) ? r.log : []).slice(-CORP.maxLog).map((e) => ({ ...e, text: typeof e.text === 'string' ? e.text.replace(/[<>]/g, '').slice(0, 200) : undefined })),
    };
    q.cells = q.cells.filter(([i]) => !c.owner[i]);
    for (const [i] of q.cells) c.owner[i] = q.id;
    list.push(q);
  }
  const asks = (Array.isArray(o.asks) ? o.asks : []).slice(0, 4).filter((a) => a && list.some((q) => q.id === a.corp) && Array.isArray(a.sites)).map((a) => ({
    id: a.id | 0, corp: a.corp | 0, day: a.day | 0, expires: a.expires | 0, sites: a.sites.filter((i) => i >= 0 && i < N * N).slice(0, 8).map((i) => i | 0), jobs: a.jobs | 0, days: a.days | 0,
    status: ['open', 'agreed'].includes(a.status) ? a.status : 'open', countered: a.countered ? 1 : 0,
  }));
  for (const q of list) if (q.parent === q.id || !list.some((x) => x.id === q.parent)) q.parent = 0;
  c.corp = { list, asks, nextId: Math.max(1, o.nextId | 0, ...list.map((q) => q.id + 1)), nextAsk: Math.max(1, o.nextAsk | 0, ...asks.map((a) => a.id + 1)), foundAt: num(o.foundAt, -99), off: o.off ? 1 : 0 };
  rebuildGroups(c);
}
export const packCorp = (c) => (c.corp ? { list: c.corp.list.map(({ pend, ...q }) => ({ ...q, cash: Math.round(q.cash), intern: Math.round(q.intern), xunits: Math.round(q.xunits) })), asks: c.corp.asks, nextId: c.corp.nextId, nextAsk: c.corp.nextAsk, foundAt: c.corp.foundAt, off: c.corp.off || undefined } : undefined);

// ───────────────────────── chỗ xây ─────────────────────────

/** Ô đất trống của thành phố, cạnh đường, chưa quy hoạch (zoneRect còn kiểm lại mọi điều kiện khác). */
const siteOk = (c, i) => c.own[i] && c.acc[i] && !c.steep[i] && !c.water[i] && !c.road[i] && !c.occ[i] && !c.zone[i] && !c.level[i] && !c.owner[i] && !(c.beach && c.beach[i]) && !(c.decor && c.decor[i]) && !(c.falls && c.falls[i]) && !(c.resvCell && c.resvCell[i]);
const near = (c, i, r) => { const x = i % N, y = (i / N) | 0; return (cb) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N && cb(idxXY(X, Y), dx, dy)) return true; } return false; }; };
const homesNear = (c, i) => { let n = 0; near(c, i, 2)((k) => { if (c.level[k] && ZDEF[c.zone[k]].res) n++; return false; }); return n; };

/** Chấm điểm một ô làm nhà máy cho công ty: đúng sản phẩm, gần cụm cũ, xa nhà dân, đất rẻ. */
function siteScore(c, q, i, centre) {
  const x = i % N, y = (i / N) | 0;
  let s = (productAt(i, 3) === corpSector(c, q) ? 4 : 0) - homesNear(c, i) * 1.5 - c.landValue[i] * 0.02;
  if (centre) s -= Math.hypot(x - centre.x, y - centre.y) * 0.12;
  return s;
}
const centreOf = (c, q) => { const l = q.cells.map(([i]) => i); if (!l.length) return null; return { x: l.reduce((s, i) => s + (i % N), 0) / l.length, y: l.reduce((s, i) => s + ((i / N) | 0), 0) / l.length }; };

/** Ô liền kề cụm hiện có (bán kính 3) để mở rộng nhỏ. */
function expandSite(c, q) {
  const centre = centreOf(c, q); let best = -1, bs = -Infinity;
  const seen = new Set();
  for (const [o] of q.cells) near(c, o, 3)((i) => { if (!seen.has(i) && siteOk(c, i)) { seen.add(i); const s = siteScore(c, q, i, centre); if (s > bs) { bs = s; best = i; } } return false; });
  return best;
}
/** Một dự án mới: n ô liền nhau ở nơi điểm cao nhất toàn bản đồ (có thể xa cụm cũ, nên cần thị trưởng duyệt). */
function projectSites(c, q, n) {
  const centre = centreOf(c, q); let seed = -1, bs = -Infinity;
  for (let i = 0; i < N * N; i++) if (siteOk(c, i)) { const s = siteScore(c, q, i, centre); if (s > bs) { bs = s; seed = i; } }
  if (seed < 0) return [];
  const out = [seed], used = new Set(out);
  for (let k = 0; k < out.length && out.length < n; k++) near(c, out[k], 1)((i) => { if (out.length < n && !used.has(i) && siteOk(c, i)) { used.add(i); out.push(i); } return false; });
  return out;
}

// ───────────────────────── cổng hành động ─────────────────────────

const feeOf = (n) => n * CORP.cellFee * MK;
/** Điện còn dư (nhà máy mới cần điện): từ chối nếu mạng điện đã chạm trần. */
const powerOk = (c) => !c.stats || !c.stats.powerCap || c.stats.powerUse < c.stats.powerCap * 0.97;
/** Số ô tối đa theo bậc. */
const capCells = (q) => 4 + q.stage * 4;

/**
 * Cổng duy nhất: act = { type: 'build', cells: [i…], approved?: bool } | { type: 'release', cell } | { type: 'ask', sites }.
 * Trả { ok, reason }; không hợp lệ thì không đổi gì.
 */
export function corpAct(c, q, act) {
  if (!c.corp || !corpById(c, q.id)) return { ok: false, reason: 'Công ty không còn' };
  if (act.type === 'build') {
    const cells = (act.cells || []).filter((i) => siteOk(c, i));
    if (!cells.length) return { ok: false, reason: 'Không còn ô đất hợp lệ' };
    if (q.cells.length + cells.length > capCells(q)) return { ok: false, reason: `Đã đủ ${capCells(q)} ô cho bậc ${q.stage}` };
    if (!powerOk(c)) return { ok: false, reason: 'Mạng điện đã đầy, chưa dám xây thêm nhà máy' };
    if (!act.approved && cells.length > 1) return { ok: false, reason: 'Dự án nhiều ô phải được thị trưởng duyệt' };
    const fee = feeOf(cells.length);
    if (q.cash < fee + CORP.reserve * MK) return { ok: false, reason: 'Quỹ không đủ' };
    let n = 0;
    for (const i of cells) { const r = c.fn.zoneRect(c, i % N, (i / N) | 0, i % N, (i / N) | 0, 3); if (r.ok && c.zone[i] === 3) { claim(c, q, i); n++; } }
    if (!n) return { ok: false, reason: 'Khu đất không quy hoạch được' };
    const paid = feeOf(n); q.cash -= paid; c.fn.procure(c, paid, 'corpBuild');
    corpLog(c, q, 'build', { n, cost: Math.round(paid) });
    return { ok: true, n };
  }
  if (act.type === 'release') { // bán cơ sở: thành doanh nghiệp độc lập, nhà máy vẫn chạy
    if (!q.cells.some(([i]) => i === act.cell)) return { ok: false, reason: 'Không phải ô của công ty' };
    release(c, q, act.cell); corpLog(c, q, 'release', { cell: act.cell });
    return { ok: true };
  }
  if (act.type === 'subsidiary') {
    const p = subsidiaryPlan(c, q);
    if (!p) return { ok: false, reason: 'Chưa đủ điều kiện lập công ty con' };
    const base = q.name.split(' ')[0] + ' ' + q.name.split(' ').slice(1).join(' ');
    const kid = makeCorp(c, `${base} ${PRODUCTS[p.sector].name}`.slice(0, 40), q.ceo, p.sector, q.id, p.seed);
    q.cash -= p.seed; q.cool.sub = c.day + CORP.subCool;
    for (const i of p.cells) { q.cells = q.cells.filter(([k]) => k !== i); c.owner[i] = 0; claim(c, kid, i); }
    kid.stage = 1; rebuildGroups(c);
    corpLog(c, q, 'subsidiary', { name: kid.name, n: p.cells.length, cash: Math.round(p.seed) });
    corpLog(c, kid, 'founded', { n: kid.cells.length, sector: p.sector, cash: Math.round(p.seed), parent: q.name });
    news(c, `🏢 ${corpTitle(q)} lập ${corpTitle(kid)}, làm ${PRODUCTS[p.sector].name.toLowerCase()}`);
    return { ok: true, kid };
  }
  if (act.type === 'ask') {
    if (c.corp.asks.some((a) => a.corp === q.id)) return { ok: false, reason: 'Đã có đề xuất đang chờ' };
    if (c.day < q.cool.ask) return { ok: false, reason: 'Đang trong thời gian nghỉ đề xuất' };
    const sites = (act.sites || []).filter((i) => siteOk(c, i));
    if (!sites.length) return { ok: false, reason: 'Không có khu đất phù hợp' };
    if (q.cash < feeOf(sites.length) + CORP.landFee * MK * sites.length + CORP.reserve * MK) return { ok: false, reason: 'Quỹ không đủ cho dự án' };
    const a = { id: c.corp.nextAsk++, corp: q.id, day: c.day, expires: c.day + CORP.askDays, sites, jobs: Math.round(sites.length * CORP.jobsPerCell), days: CORP.commitDays, status: 'open', countered: 0 };
    c.corp.asks.push(a); corpLog(c, q, 'ask', { n: sites.length, jobs: a.jobs });
    news(c, `🏭 ${corpTitle(q)} xin cấp ${sites.length} ô đất làm nhà máy, cam kết thêm ${a.jobs} việc làm trong ${a.days} ngày (xem 🏢 Tập đoàn)`);
    return { ok: true, ask: a };
  }
  return { ok: false, reason: 'Hành động không có' };
}

// ───────────────────────── thị trưởng trả lời đề xuất ─────────────────────────

/** Thị trưởng chấp nhận: công ty nộp phí đất cho ngân sách, xây, và nhận cam kết việc làm đo được. */
export function approveAsk(c, id) {
  const a = c.corp.asks.find((x) => x.id === id), q = a && corpById(c, a.corp);
  if (!a || !q) return { ok: false, reason: 'Đề xuất không còn' };
  const land = CORP.landFee * MK * a.sites.length;
  if (q.cash < land) return { ok: false, reason: 'Quỹ công ty không đủ nộp phí đất' };
  const base = jobsOf(c, q);
  const r = corpAct(c, q, { type: 'build', cells: a.sites, approved: true });
  if (!r.ok) { corpLog(c, q, 'askFailed', { text: r.reason }); c.corp.asks = c.corp.asks.filter((x) => x !== a); return r; }
  q.cash -= land; c.money += land; inner(c, 'corpLand', land); // phí đất: quỹ công ty → ngân sách (trong thành phố)
  const jobs = Math.round(a.jobs * (r.n / a.sites.length));
  q.deals.push({ id: a.id, cells: r.n, jobs, base, due: c.day + a.days, status: 'open' });
  q.trust = clamp(q.trust + 0.5, -3, 5);
  corpLog(c, q, 'approved', { n: r.n, jobs, due: c.day + a.days });
  c.corp.asks = c.corp.asks.filter((x) => x !== a);
  news(c, `🏭 Đã duyệt: ${corpTitle(q)} xây ${r.n} nhà máy, cam kết thêm ${jobs} việc làm đến ngày ${c.day + a.days + 1}`);
  return { ok: true, built: r.n };
}
export function rejectAsk(c, id) {
  const a = c.corp.asks.find((x) => x.id === id), q = a && corpById(c, a.corp);
  if (!a) return { ok: false, reason: 'Đề xuất không còn' };
  if (q) { q.cool.ask = c.day + CORP.askCool; q.trust = clamp(q.trust - 0.5, -3, 5); corpLog(c, q, 'rejected', {}); }
  c.corp.asks = c.corp.asks.filter((x) => x !== a);
  return { ok: true };
}
/** Thị trưởng đòi thêm 40% việc làm: CEO nhượng bộ hay không tuỳ tính cách (một lần duy nhất mỗi đề xuất). */
export function counterAsk(c, id) {
  const a = c.corp.asks.find((x) => x.id === id), q = a && corpById(c, a.corp);
  if (!a || !q) return { ok: false, reason: 'Đề xuất không còn' };
  if (a.countered) return { ok: false, reason: 'Đã đòi thêm một lần rồi' };
  a.countered = 1;
  const want = CEOS[q.ceo].concede + q.trust * 0.05;
  if (hash2(q.id, c.day, 61) < want) {
    a.jobs = Math.round(a.jobs * 1.4); corpLog(c, q, 'counterOk', { jobs: a.jobs });
    return { ok: true, accepted: true, jobs: a.jobs, reply: `${corpTitle(q)} đồng ý nâng cam kết lên ${a.jobs} việc làm.` };
  }
  corpLog(c, q, 'counterNo', {});
  return { ok: true, accepted: false, reply: `${corpTitle(q)} giữ nguyên ${a.jobs} việc làm: "đòi thêm thì chúng tôi không đủ biên lợi nhuận".` };
}


// ───────────────────────── nhóm công ty, công ty con ─────────────────────────

/** Công ty gốc của một công ty (công ty con → tập đoàn mẹ). */
export function rootOf(c, id) {
  let q = corpById(c, id), n = 0;
  while (q && q.parent && n++ < 4) { const p = corpById(c, q.parent); if (!p) break; q = p; }
  return q ? q.id : 0;
}
export const subsOf = (c, q) => c.corp.list.filter((x) => x.parent === q.id);
/** Bảng tra cho people.js: corpGroup[id công ty] = id công ty gốc (ưu tiên giao hàng nội bộ), corpExp[id] = đang đẩy xuất khẩu. */
function rebuildGroups(c) {
  const g = [0], e = [0];
  for (const q of c.corp.list) { g[q.id] = rootOf(c, q.id); e[q.id] = q.export ? 1 : 0; }
  c.corpGroup = g; c.corpExp = e;
}
/** people.js báo: 'intern' = hàng giao trong cùng nhóm (qty đơn vị), 'export' = hàng xuất ra ngoài từ ô của công ty. */
export function corpNote(c, kind, cell, qty) {
  const q = corpById(c, kind === 'intern' ? (c.corpGroup ? c.corpGroup[c.owner[cell]] : 0) : c.owner[cell]);
  if (!q) return;
  if (kind === 'intern') q.intern += qty; else q.xunits += qty;
}
/** Cả nhóm: ô xây xong, việc làm, số công ty con. */
function groupOf(c, q) {
  const l = [q, ...subsOf(c, q)];
  return { n: l.reduce((s, x) => s + cellsBuilt(c, x).length, 0), jobs: l.reduce((s, x) => s + jobsOf(c, x), 0), subs: l.length - 1 };
}

function makeCorp(c, name, ceo, sector, parent, cash) {
  const C = c.corp, id = C.nextId++;
  const q = { id, name, ceo, sector, parent, stage: 1, cash, born: c.day, trust: 0, cool: { act: c.day + 2, ask: c.day, sub: c.day + CORP.subCool }, goal: { jobs: 40 }, cells: [], deals: [], log: [], export: 0, intern: 0, xunits: 0 };
  C.list.push(q);
  return q;
}

export const OPTS = {
  expand: 'Mở thêm một nhà máy cạnh cụm hiện có (tự làm, tốn quỹ)',
  project: 'Xin thị trưởng một dự án nhiều ô đất (có cam kết việc làm)',
  subsidiary: 'Lập công ty con từ các cơ sở hiện có (đa ngành)',
  release: 'Bán bớt cơ sở yếu nhất để giảm lỗ',
  hold: 'Giữ nguyên, tích luỹ tiền',
};

/** Lập công ty con: chuyển 2 nhà máy (ưu tiên khác ngành chính) và vốn khởi đầu từ quỹ mẹ; mẹ phải còn ít nhất 3 nhà máy. */
function subsidiaryPlan(c, q) {
  if (q.parent || q.stage < 2 || c.day < (q.cool.sub || 0) || subsOf(c, q).length >= CORP.maxSubs) return null;
  const mine = cellsBuilt(c, q);
  if (mine.length < CORP.subCells) return null;
  const seed = feeOf(2);
  if (q.cash < seed + CORP.reserve * MK) return null;
  const main = corpSector(c, q), other = mine.filter((i) => productAt(i, c.zone[i] === 21 ? 21 : 3) !== main);
  const pool = other.length ? other : mine.slice(-2), cells = pool.slice(0, 2);
  return { cells, seed, sector: productAt(cells[0], c.zone[cells[0]] === 21 ? 21 : 3) };
}

/** Các hành động CEO đang có thể làm (đã kiểm tra điều kiện), kèm lựa chọn mặc định của luật. */
export function corpOptions(c, q) {
  const ceo = CEOS[q.ceo], ids = [], mine = cellsBuilt(c, q).length, eff = effOf(c, q);
  if (q.cash < CORP.reserve * MK * 0.5 && eff < 0.3 && mine > 1) return { ids: ['release', 'hold'], def: 'release' };
  if (eff < 0.35 || q.cells.length - mine >= 2) return { ids: [], def: 'hold' };
  const chest = CORP.cellFee * (1 + ceo.risk * 2) * MK + CORP.reserve * MK;
  if (q.cash < chest) return { ids: [], def: 'hold' };
  const n = Math.min(5, 2 + q.stage);
  const can = { expand: q.cells.length < capCells(q) && expandSite(c, q) >= 0 && powerOk(c), project: false, subsidiary: !!subsidiaryPlan(c, q) };
  if (q.cash >= feeOf(n) + CORP.landFee * MK * n + CORP.reserve * MK && !c.corp.asks.length && c.day >= q.cool.ask && !c.corp.asks.some((a) => a.corp === q.id) && powerOk(c)) can.project = projectSites(c, q, n).length >= 2;
  for (const k of ['expand', 'project', 'subsidiary']) if (can[k]) ids.push(k);
  if (!ids.length) return { ids: [], def: 'hold' };
  ids.push('hold');
  const def = can.subsidiary && (ceo.risk >= 0.45 || q.stage >= 3) ? 'subsidiary' : can.project && ceo.risk >= 0.45 ? 'project' : can.expand ? 'expand' : can.project ? 'project' : 'hold';
  return { ids, def };
}

/** Thực thi một lựa chọn (mọi thứ vẫn qua corpAct để kiểm tra lại). */
export function corpDo(c, q, id) {
  const n = Math.min(5, 2 + q.stage);
  if (id === 'expand') { const i = expandSite(c, q); return i >= 0 ? corpAct(c, q, { type: 'build', cells: [i] }) : { ok: false, reason: 'Không còn chỗ' }; }
  if (id === 'project') return corpAct(c, q, { type: 'ask', sites: projectSites(c, q, n) });
  if (id === 'subsidiary') return corpAct(c, q, { type: 'subsidiary' });
  if (id === 'release') { const i = poorest(c, q); if (i >= 0) { const r = corpAct(c, q, { type: 'release', cell: i }); if (r.ok) news(c, `📉 ${corpTitle(q)} gặp khó khăn, bán bớt một cơ sở`); return r; } }
  return { ok: true };
}

/** Số liệu gửi cho AI (toàn số / chuỗi ngắn, do game tính). */
export function corpBrief(c, q) {
  const g = groupOf(c, q), ceo = CEOS[q.ceo], st = corpStats(c, q);
  return {
    name: corpTitle(q), stage: q.stage, ceo: ceo.name, philosophy: ceo.philosophy, invest: ceo.invest, nego: ceo.nego, risk: ceo.risk, sector: PRODUCTS[st.sector] ? PRODUCTS[st.sector].name : '',
    cells: st.cells, pending: st.pending, jobs: st.jobs, eff: Math.round(st.eff * 100), cashMK: Math.round(q.cash / MK), goalJobs: q.goal.jobs, subs: g.subs, groupCells: g.n, groupJobs: g.jobs,
    export: q.export, internUnits: Math.round(q.intern), exportUnits: Math.round(q.xunits), trust: q.trust, influence: st.influence, city: { pop: c.pp ? c.pp.count : 0, powerUsePct: c.stats && c.stats.powerCap ? Math.round((100 * c.stats.powerUse) / c.stats.powerCap) : 0 },
  };
}
/** AI (hoặc người) chọn một trong các lựa chọn đang chờ: game kiểm tra id nằm trong danh sách rồi mới thực thi. */
export function corpResolve(c, q, id, why = '') {
  if (!q.pend || !q.pend.opts.includes(id)) return { ok: false, reason: 'Không có lựa chọn này' };
  q.pend = null;
  const r = corpDo(c, q, id);
  corpLog(c, q, 'decision', { id, ok: !!r.ok, text: String(why || '').replace(/[<>]/g, '').slice(0, 200), ai: 1 });
  return r;
}

// ───────────────────────── CEO ─────────────────────────

/** CEO: quyết nhiều nhất một việc mỗi nhịp. Có AI online và có ≥ 2 lựa chọn thì chờ AI chọn (quá hạn dùng lựa chọn của luật). */
function ceoDecide(c, q) {
  if (c.day < q.cool.act || q.pend) return;
  q.cool.act = c.day + CORP.actCool;
  const o = corpOptions(c, q);
  if (!o.ids.length) return;
  if (c.corp.ai && o.ids.length >= 2 && o.ids.includes(o.def)) {
    q.pend = { opts: o.ids, def: o.def, since: c.hour };
    (c.corpQueue || (c.corpQueue = [])).push(q.id);
    return;
  }
  corpDo(c, q, o.def);
}
/** Lựa chọn chờ AI quá hạn: dùng lựa chọn của luật nếu còn hợp lệ. */
function settle(c, q) {
  if (!q.pend || c.hour - q.pend.since < CORP.decideHours) return;
  const o = corpOptions(c, q), def = q.pend.def;
  q.pend = null;
  corpDo(c, q, o.ids.includes(def) ? def : 'hold');
}

function found(c) {
  const C = c.corp, roots = C.list.filter((q) => !q.parent).length;
  if (C.off || c.pp.count < CORP.foundMin || roots >= maxCorps(c) || c.day - C.foundAt < CORP.foundEvery) return;
  let seed = -1, bm = 20 * MK;
  for (let i = 0; i < N * N; i++) if (c.level[i] && !c.owner[i] && ZDEF[c.zone[i]].biz === 'ind' && c.biz.money[i] > bm) { bm = c.biz.money[i]; seed = i; }
  if (seed < 0) return;
  C.foundAt = c.day;
  const id = C.nextId, ceo = CEO_KEYS[(hash2(id, 5, 17) * CEO_KEYS.length) | 0];
  const taken = new Set(C.list.map((q) => q.name));
  let base = BASES[(hash2(id, 9, 3) * BASES.length) | 0];
  for (let k = 0; taken.has(base) && k < BASES.length; k++) base = BASES[(BASES.indexOf(base) + 1) % BASES.length];
  const q = makeCorp(c, base, ceo, productAt(seed, c.zone[seed] === 21 ? 21 : 3), 0, 0);
  claim(c, q, seed);
  const sx = seed % N, sy = (seed / N) | 0;
  for (let i = 0; i < N * N && q.cells.length < 3; i++) { // gom thêm nhà máy độc lập cạnh đó
    if (!c.level[i] || c.owner[i] || ZDEF[c.zone[i]].biz !== 'ind' || Math.hypot((i % N) - sx, ((i / N) | 0) - sy) > 5) continue;
    claim(c, q, i);
  }
  for (const [i] of q.cells) { const m = Math.max(0, c.biz.money[i]) * 0.5; c.biz.money[i] -= m; q.cash += m; } // vốn lập công ty: chuyển từ ví các nhà máy (không tạo tiền)
  q.stage = stageOf(c, q); q.sector = corpSector(c, q);
  corpLog(c, q, 'founded', { n: q.cells.length, sector: q.sector, cash: Math.round(q.cash) });
  news(c, `🏢 ${corpTitle(q)} thành lập, lấy ${q.cells.length} nhà máy làm nền, làm ${PRODUCTS[q.sector].name.toLowerCase()}`);
}

function evalDeals(c, q) {
  for (const d of q.deals) {
    if (d.status !== 'open' || c.day < d.due) continue;
    const got = jobsOf(c, q) - d.base;
    if (got >= d.jobs) { d.status = 'met'; q.trust = clamp(q.trust + 1, -3, 5); corpLog(c, q, 'dealMet', { jobs: got, want: d.jobs }); news(c, `✅ ${corpTitle(q)} đạt cam kết: thêm ${got} việc làm`); }
    else { d.status = 'breach'; q.trust = clamp(q.trust - 1.5, -3, 5); q.cool.ask = c.day + CORP.breachCool; corpLog(c, q, 'dealBreach', { jobs: got, want: d.jobs }); news(c, `⚠️ ${corpTitle(q)} chưa đạt cam kết việc làm (${got}/${d.jobs}), bị tạm dừng xin dự án ${CORP.breachCool} ngày`); }
  }
  q.deals = q.deals.filter((d) => d.status === 'open' || c.day < d.due + 30).slice(-6);
}

const adults = (c) => { const pp = c.pp; let a = 0; for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.age[id] >= 18) a++; return a; };
function toResidents(c, amount) {
  const pp = c.pp, a = adults(c);
  if (!a || !(amount > 0)) return 0;
  const per = amount / a;
  for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.age[id] >= 18) pp.money[id] += per;
  inner(c, 'dividend', amount);
  return amount;
}
/** Chia lãi dư: công ty con chuyển lên công ty mẹ (nội bộ nhóm), công ty gốc chia cho dân. */
function payout(c, q) {
  const ceo = CEOS[q.ceo], chest = (CORP.cellFee * 3 + CORP.reserve) * MK, over = q.cash - chest;
  if (!(over > 0)) return;
  const d = over * ceo.payout * 0.5;
  if (!(d > 1)) return;
  const mom = q.parent ? corpById(c, q.parent) : null;
  if (mom) { q.cash -= d; mom.cash += d; return; }
  if (toResidents(c, d)) q.cash -= d;
}

/** Bật / tắt đẩy xuất khẩu theo tồn kho thành phẩm ở các nhà máy của công ty. */
function exportCheck(c, q) {
  const l = cellsBuilt(c, q).filter((i) => ZDEF[c.zone[i]].biz === 'ind');
  if (!l.length) return;
  const avg = l.reduce((s, i) => s + c.biz.sout[i], 0) / l.length;
  if (c.day < (q.xAt || 0)) return; // đổi cờ xong thì giữ ít nhất 6 ngày, đỡ bật tắt liên tục
  if (!q.export && avg >= CORP.expOn) { q.xAt = c.day + 6; q.export = 1; corpLog(c, q, 'exportOn', { stock: Math.round(avg) }); }
  else if (q.export && avg < CORP.expOff) { q.xAt = c.day + 6; q.export = 0; corpLog(c, q, 'exportOff', { stock: Math.round(avg) }); }
}

function daily(c) {
  const C = c.corp;
  for (const q of C.list) {
    // ô bị dỡ / phá sản / quy hoạch lại thì rời công ty; ô xây dở quá lâu thì bỏ
    q.cells = q.cells.filter(([i, d]) => { const ok = built(c, i) ? c.owner[i] === q.id : c.zone[i] === 3 && c.owner[i] === q.id && c.day - d <= CORP.pendDays; if (!ok && c.owner[i] === q.id) c.owner[i] = 0; return ok; });
    if (q.parent && !corpById(c, q.parent)) q.parent = 0; // mẹ đã giải thể: công ty con thành độc lập
  }
  rebuildGroups(c);
  for (const q of C.list) {
    const st = stageOf(c, q);
    if (st !== q.stage) { corpLog(c, q, 'stage', { from: q.stage, to: st }); if (st > q.stage) news(c, `📈 ${corpTitle({ ...q, stage: st })} lên bậc "${STAGES[st]}"`); q.stage = st; }
    q.sector = corpSector(c, q) || q.sector;
    evalDeals(c, q);
    if (q.cells.length) { exportCheck(c, q); ceoDecide(c, q); payout(c, q); }
    if (c.day % 14 === 0) corpLog(c, q, 'season', { jobs: jobsOf(c, q), cells: cellsBuilt(c, q).length, intern: Math.round(q.intern), xunits: Math.round(q.xunits) });
    if (q.goal && jobsOf(c, q) >= q.goal.jobs) { corpLog(c, q, 'goal', { jobs: q.goal.jobs }); q.goal = { jobs: Math.round(q.goal.jobs * 1.8) }; }
  }
  // công ty hết ô: giải thể, quỹ còn lại chia cho dân
  for (const q of [...C.list]) if (!q.cells.length) {
    if (q.cash > 0) q.cash -= toResidents(c, q.cash);
    if (q.cash > 0 && !(c.pp && c.pp.count)) { world(c, 'dividend', -q.cash); q.cash = 0; } // chưa có dân: chủ ở ngoài thành phố
    if (q.cash <= 0) { news(c, `🏚️ ${corpTitle(q)} đã giải thể`); C.list = C.list.filter((x) => x !== q); C.asks = C.asks.filter((a) => a.corp !== q.id); }
  }
  for (const a of [...C.asks]) if (c.day >= a.expires) { const q = corpById(c, a.corp); if (q) { q.cool.ask = c.day + CORP.askCool; corpLog(c, q, 'askExpired', {}); } C.asks = C.asks.filter((x) => x !== a); }
  found(c);
  rebuildGroups(c);
}

/** Gọi mỗi giờ game. Cuối ngày (23h) quét lợi nhuận về quỹ; 6h sáng công ty ra quyết định. */
export function corpHour(c) {
  const C = cur(c);
  if (!C || C.off) return;
  const h = c.hour % 24;
  if (h === 23) for (const q of C.list) for (const [i] of q.cells) {
    if (!built(c, i)) continue;
    const ex = c.biz.money[i] - CORP.sweepFrom * MK;
    if (ex > 0) { const d = ex * CORP.sweepRate; c.biz.money[i] -= d; q.cash += d; }
  }
  for (const q of C.list) if (q.pend) settle(c, q);
  if (h === 6) daily(c);
}
/** Tiền đang nằm trong quỹ các công ty (cộng vào tổng tiền để sổ cái khớp). */
export const corpCash = (c) => (c.corp ? c.corp.list.reduce((s, q) => s + q.cash, 0) : 0);

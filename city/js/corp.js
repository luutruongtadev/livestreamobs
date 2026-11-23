// Phố Mới — tập đoàn AI, Phase 1 (xem city/CORPORATE.md). Công ty là lớp SỞ HỮU phủ lên các ô nhà máy có sẵn: c.owner[i]
// = id công ty (0 = doanh nghiệp độc lập, như trước đây). Kinh tế (nguyên liệu, xe tải, lương, thuế) vẫn do bizHour chạy.
// Công ty chỉ có: quỹ (nằm trong totalMoney), CEO với tính cách, và các hành động đi qua MỘT cổng corpAct (kiểm tra → thực thi →
// ghi lịch sử). Phase 1: CEO chạy bằng luật theo tính cách (chưa gọi LLM; LLM sẽ chỉ chọn trong danh sách hành động hợp lệ).
// Mọi chuyển tiền là chuyển nội bộ trong thành phố hoặc đi qua procure / inner / world, nên sổ cái vẫn khớp.
import { N, MK, ZDEF, PRODUCTS, RAW_KINDS, PRODUCT_KINDS, productAt, jobCap, hash2, clamp } from './base.js';
import { inner, world, worldCan } from './ledger.js';
import { chron, landK, placeName, workerHousing, housingShort, fundCells, bizName } from './chain.js';

/** Bảng tham số cân bằng (đơn vị: MK). */
export const CORP = {
  sweepFrom: 150, sweepRate: 0.35, // cuối ngày: ô sở hữu có quá 150 MK thì 35% phần dư về quỹ công ty
  cellFee: 80, reserve: 40, // phí phát triển một ô (thuê doanh nghiệp xây); quỹ tối thiểu giữ lại
  landFee: 30, // phí đất nộp ngân sách mỗi ô khi dự án được duyệt
  infra: { sewage: 25, green: 15, safe: 15 }, // phí hạ tầng nộp ngân sách mỗi ô khi được duyệt: cống xả thải, cây xanh / công viên, phòng cháy (công ty không tự xây được hạ tầng, thị trưởng dùng tiền này)
  askDays: 8, askCool: 15, breachCool: 30, actCool: 3, // hạn trả lời, nghỉ sau khi bị từ chối / sai cam kết, nhịp hành động
  commitDays: 40, jobsPerCell: 7, pendDays: 40, maxLog: 120,
  foundEvery: 6, foundMin: 300, // lập công ty mới: mỗi 6 ngày, thành phố từ 300 dân
  subCells: 5, subCool: 12, maxSubs: 3, // công ty con: mẹ có ≥ 5 nhà máy, nghỉ 12 ngày giữa hai lần lập, tối đa 3 con
  acqCool: 15, monoShare: 0.6, depShare: 0.25, // mua lại: nghỉ 15 ngày; độc quyền khi ≥ 60% một sản phẩm; phụ thuộc khi nhóm giữ ≥ 25% việc làm
  loanMK: 60, loanRate: 0.004, payUp: 1.15, // vay: 60 MK mỗi nhà máy, lãi 0.4%/ngày; tăng lương 15% để giành lao động
  hubMin: 6, hubBoost: 1.1, hotPrice: 1.2, // cụm kinh tế: ≥ 6 nhà máy liền nhau (cách ≤ 2 ô) chạy nhanh hơn 10%; giá thế giới ≥ 1.2 thì đẩy xuất sớm
  storeCap: 16, storeMax: 64, wareMax: 3, wareFee: 0.5, // kho bãi: mỗi kho thêm 16 chỗ chứa cho mỗi nhà máy của nhóm (tối đa 64), tối đa 3 kho; phí lưu kho 0.5 MK mỗi người làm mỗi giờ
  dpMin: 0.8, dpMax: 1.3, mkMin: 0.9, mkMax: 1.2, priceMax: 1.35, // giá nội địa: chỉ số cung cầu 0.8–1.3, hệ số bán của từng công ty 0.9–1.2, tổng không quá 1.35
  retailMin: 3, // chuỗi bán lẻ: từ bậc 3
  divHolders: 0.35, divLeak: 0.2, divLeakStage: 3, // cổ tức: ~35% người lớn nắm cổ phần mỗi công ty (cố định theo id), 20% lãi của công ty từ bậc 3 chảy ra nước ngoài; phần còn lại chịu thuế thu nhập
  expOn: 18, expOff: 8, decideHours: 6, // đẩy xuất khẩu khi tồn kho thành phẩm ≥ 18 (tắt khi < 8); chờ AI chọn tối đa 6 giờ game
  invDays: 25, // nhà đầu tư đã ký hợp đồng chờ đất khu công nghiệp tối đa 25 ngày rồi rút vốn
  techMax: 3, techK: 0.08, techFee: 40, techCool: 20, // đầu tư máy móc: tối đa 3 nấc, mỗi nấc +8% sản lượng, −12% khói; phí 40 MK mỗi nhà máy × nấc
  taxBase: 9, taxHigh: 14, // thuế chuẩn; từ 14% CEO nghĩ tới chuyện dời nhà máy đi
  brkMax: 50, brkDays: 60, // ưu đãi thuế công ty xin kèm dự án: tối đa 50% trong 60 ngày
  houseFee: 60, houseMax: 4, // nhà ở công nhân: công ty tài trợ 60 MK mỗi ô nhà ở đã quy hoạch, tối đa 4 ô một lần
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

/** Cam kết phụ (ngoài việc làm): công ty không tự xây được hạ tầng, nên mỗi loại là một khoản phí nộp ngân sách khi được duyệt, thị trưởng dùng tiền đó xây cống, trồng cây, lập trạm cứu hoả. Không đo sau đó. */
export const TERM_KEYS = ['sewage', 'green', 'safe'];
export const TERMS = { sewage: 'Phí hạ tầng nước thải', green: 'Phí cây xanh, công viên', safe: 'Phí phòng cháy chữa cháy' };
export const termLine = (k) => (CORP.infra[k] ? `nộp ${TERMS[k].toLowerCase()} ${CORP.infra[k]} MK mỗi ô` : k);
/** Cam kết phụ theo loại và bậc công ty: sản xuất nộp phí nước thải, bậc 3 trở lên thêm phí cây xanh và phòng cháy; bán lẻ chỉ phí phòng cháy. */
export function termsFor(c, q) {
  if (q.kind === 'trade') return ['safe'];
  const t = ['sewage'];
  if (q.stage >= 3) t.push('green', 'safe');
  return t;
}

const cur = (c) => (c.corp ? c.corp : null);
/** Muối theo bản đồ: mỗi thành phố một bộ công ty, tên và CEO khác nhau (trước đây chỉ theo số thứ tự công ty nên bản đồ nào cũng giống nhau). */
const salt = (c) => ((c.seed >>> 0) % 9973) + 1;
const vnd = (v) => `${Math.round(v).toLocaleString('vi-VN')} ₫`;
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
/** Tin của công ty: vào biên niên thành phố (chain.js) và hiện thông báo. Trả id sự kiện để các sự kiện sau ghi nguyên nhân. */
const news = (c, text, o = {}) => chron(c, o.kind || 'corp', text, o);

// ───────────────────────── chỉ số ─────────────────────────

export const cellsBuilt = (c, q) => q.cells.filter(([i]) => built(c, i)).map(([i]) => i);
export const jobsOf = (c, q) => cellsBuilt(c, q).reduce((s, i) => s + jobCap(c.zone[i], c.level[i]), 0);
/** Hiệu suất trung bình các nhà máy của công ty (0..1). */
export function effOf(c, q) {
  const l = cellsBuilt(c, q);
  return l.length ? l.reduce((s, i) => s + c.biz.eff[i], 0) / l.length : 0.5;
}
/** Tín hiệu thị trường: giá thế giới hiện tại của một loại hàng (1 = giá gốc; cao = đáng đầu tư). */
export const signalOf = (c, p) => (c.market && c.market.p[p]) || 1;
/** Thành phẩm chính: loại có nhiều ô nhất trong các ô công ty. */
export function corpSector(c, q) {
  const n = {};
  for (const [i] of q.cells) { if (ZDEF[c.zone[i]].biz !== 'ind' || (c.ware && c.ware[i])) continue; const p = productAt(i, c.zone[i] === 21 ? 21 : 3); n[p] = (n[p] || 0) + 1; } // cửa hàng của chuỗi bán lẻ không tính
  let best = q.sector;
  for (const k in n) if (!best || n[k] > (n[best] || 0)) best = k;
  return best;
}
/** Bậc: tính từ chỉ số đo được (cả nhóm công ty con), không ai đặt. Bậc 4 = tập đoàn có ≥ 2 công ty con và ≥ 12 nhà máy cả nhóm. */
export function stageOf(c, q) {
  const g = groupOf(c, q), n = g.n, jobs = g.jobs, s = q.stage || 1, jk = q.kind === 'trade' ? 0.4 : 1; // cửa hàng ít việc làm hơn nhà máy
  // có độ trễ: lên bậc khi đạt ngưỡng, chỉ tụt khi thấp hơn ngưỡng một nấc (tránh nhấp nháy khi một ô bị dỡ)
  const up = g.subs >= 2 && n >= 12 ? 4 : n >= 8 && jobs >= 150 * jk ? 3 : n >= 3 ? 2 : 1, down = g.subs >= 1 && n >= 10 ? 4 : n >= 7 && jobs >= 120 * jk ? 3 : n >= 2 ? 2 : 1;
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
    if (ZDEF[c.zone[i]].biz === 'ind' && !(c.ware && c.ware[i])) { totInd += jc; if (productAt(i, c.zone[i]) === p) { all++; if (c.owner[i] === q.id) same++; } }
  }
  const mine = cellsBuilt(c, q), jobs = jobsOf(c, q), ind = mine.filter((i) => ZDEF[c.zone[i]].biz === 'ind').reduce((s, i) => s + jobCap(c.zone[i], c.level[i]), 0);
  const v = 100 * (0.4 * (totJobs ? jobs / totJobs : 0) + 0.3 * (totInd ? ind / totInd : 0) + 0.3 * (all ? same / all : 0));
  return Math.round(v * 10) / 10;
}
export function corpStats(c, q) {
  const mine = cellsBuilt(c, q);
  return { cells: mine.length, pending: q.cells.length - mine.length, jobs: jobsOf(c, q), eff: effOf(c, q), cash: q.cash, stage: q.stage, influence: influence(c, q), sector: corpSector(c, q), wares: (q.wares || []).filter((i) => c.level[i]).length, store: (c.corpStore && c.corpStore[q.id]) || 0, markup: Math.round((q.markup || 1) * 100) / 100, retail: cellsBuilt(c, q).filter((i) => ZDEF[c.zone[i]].biz === 'shop').length, signal: Math.round(signalOf(c, corpSector(c, q)) * 100) / 100, group: groupOf(c, q), debt: Math.round(q.debt || 0), share: Math.round(jobShare(c, rootOf(c, q.id)) * 1000) / 10, mono: monopolyOf(c, rootOf(c, q.id)), export: q.export, intern: Math.round(q.intern), xunits: Math.round(q.xunits) };
}

// ───────────────────────── khởi tạo, lưu ─────────────────────────

function claim(c, q, i) { c.owner[i] = q.id; q.cells.push([i, c.day]); c.dirty.buildings = true; } // đổi chủ: dựng lại biển hiệu, mô hình
function release(c, q, i) { if (c.owner[i] === q.id) c.owner[i] = 0; q.cells = q.cells.filter(([k]) => k !== i); q.wares = (q.wares || []).filter((k) => k !== i); c.dirty.buildings = true; }
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

export function initCorp(c, o = {}) {
  c.owner = new Uint16Array(N * N);
  const list = [];
  for (const r of (Array.isArray(o.list) ? o.list : []).slice(0, 16)) {
    if (!r || !(r.id > 0) || list.some((q) => q.id === r.id)) continue;
    const q = {
      id: r.id | 0, name: String(r.name || 'Công ty').replace(/[<>]/g, '').slice(0, 40), kind: r.kind === 'trade' ? 'trade' : 'ind', ceo: CEOS[r.ceo] ? r.ceo : 'steady', sector: PRODUCTS[r.sector] ? r.sector : null,
      parent: r.parent | 0, stage: clamp(r.stage | 0, 1, 4), cash: Math.max(0, num(r.cash)), born: r.born | 0, trust: clamp(num(r.trust), -3, 5),
      cool: { act: num(r.cool && r.cool.act), ask: num(r.cool && r.cool.ask), sub: num(r.cool && r.cool.sub), acq: num(r.cool && r.cool.acq), loan: num(r.cool && r.cool.loan), tech: num(r.cool && r.cool.tech), move: num(r.cool && r.cool.move) },
      tech: clamp(r.tech | 0, 0, CORP.techMax), low: Math.max(0, r.low | 0), taxSeen: Number.isFinite(+r.taxSeen) ? +r.taxSeen : undefined, taxEv: r.taxEv | 0, taxEvAt: Number.isFinite(+r.taxEvAt) ? +r.taxEvAt : undefined,
      brk: r.brk && r.brk.pct > 0 ? { pct: clamp(r.brk.pct | 0, 0, 100), until: r.brk.until | 0 } : null, foreign: r.foreign ? String(r.foreign).replace(/[<>]/g, '').slice(0, 60) : undefined,
      inv: r.inv && r.inv.n > 0 ? { n: clamp(r.inv.n | 0, 1, 5), until: r.inv.until | 0, warned: r.inv.warned ? 1 : 0 } : undefined, ev: r.ev | 0,
      house: Number.isFinite(+r.house) ? +r.house : undefined, houseEv: r.houseEv | 0, landWant: Number.isFinite(+r.landWant) ? +r.landWant : undefined,
      export: r.export ? 1 : 0, xAt: num(r.xAt), debt: Math.max(0, num(r.debt)), pay: clamp(num(r.pay, 1), 1, 1.5), pAt: num(r.pAt), lastShare: clamp(num(r.lastShare), 0, 1), mono: r.mono ? 1 : 0, dep: r.dep ? 1 : 0, crisisAt: num(r.crisisAt, -99), markup: clamp(num(r.markup, 1), CORP.mkMin, CORP.mkMax),
      wares: (Array.isArray(r.wares) ? r.wares : []).filter((x) => x >= 0 && x < N * N).map((x) => x | 0),
      partners: Array.isArray(r.partners) ? r.partners.slice(0, 2).map((x) => x | 0) : undefined, intern: Math.max(0, num(r.intern)), xunits: Math.max(0, num(r.xunits)),
      goal: r.goal && r.goal.jobs > 0 ? { jobs: r.goal.jobs | 0 } : { jobs: 40 },
      cells: (Array.isArray(r.cells) ? r.cells : []).filter((p) => Array.isArray(p) && p[0] >= 0 && p[0] < N * N).map((p) => [p[0] | 0, p[1] | 0]),
      deals: (Array.isArray(r.deals) ? r.deals : []).slice(0, 6).map((d) => ({ id: d.id | 0, cells: d.cells | 0, jobs: d.jobs | 0, base: d.base | 0, due: d.due | 0, status: ['open', 'met', 'breach'].includes(d.status) ? d.status : 'open', terms: (Array.isArray(d.terms) ? d.terms : []).filter((k) => TERM_KEYS.includes(k)) })),
      log: (Array.isArray(r.log) ? r.log : []).slice(-CORP.maxLog).map((e) => ({ ...e, text: typeof e.text === 'string' ? e.text.replace(/[<>]/g, '').slice(0, 200) : undefined })),
    };
    q.cells = q.cells.filter(([i]) => !c.owner[i]);
    q.wares = q.wares.filter((i) => q.cells.some(([k]) => k === i));
    for (const [i] of q.cells) c.owner[i] = q.id;
    list.push(q);
  }
  const asks = (Array.isArray(o.asks) ? o.asks : []).slice(0, 4).filter((a) => a && list.some((q) => q.id === a.corp) && Array.isArray(a.sites)).map((a) => ({
    id: a.id | 0, corp: a.corp | 0, day: a.day | 0, expires: a.expires | 0, sites: a.sites.filter((i) => i >= 0 && i < N * N).slice(0, 8).map((i) => i | 0), jobs: a.jobs | 0, days: a.days | 0, terms: (Array.isArray(a.terms) ? a.terms : []).filter((k) => TERM_KEYS.includes(k)),
    status: ['open', 'agreed'].includes(a.status) ? a.status : 'open', countered: a.countered ? 1 : 0,
    kind: a.kind === 'housing' ? 'housing' : 'project', jv: a.jv | 0, rezone: Math.max(0, a.rezone | 0), brk: clamp(a.brk | 0, 0, CORP.brkMax), brk0: clamp((a.brk0 ?? a.brk) | 0, 0, CORP.brkMax), brkDays: Math.max(0, a.brkDays | 0), jobs0: (a.jobs0 ?? a.jobs) | 0, cost: Math.max(0, num(a.cost)), ev: a.ev | 0, final: a.final ? true : undefined,
    chat: (Array.isArray(a.chat) ? a.chat : []).slice(-16).map((m) => ({ from: m.from === 'us' ? 'us' : 'them', text: String(m.text || '').replace(/[<>]/g, '').slice(0, 600) })),
  }));
  for (const q of list) { if (q.parent === q.id || !list.some((x) => x.id === q.parent)) q.parent = 0; if (q.partners) { q.partners = q.partners.filter((x) => list.some((y) => y.id === x)); if (q.partners.length < 2) q.partners = undefined; } }
  c.corp = { list, asks, nextId: Math.max(1, o.nextId | 0, ...list.map((q) => q.id + 1)), nextAsk: Math.max(1, o.nextAsk | 0, ...asks.map((a) => a.id + 1)), foundAt: num(o.foundAt, -99), foundTradeAt: num(o.foundTradeAt, -99), off: o.off ? 1 : 0, sme: num(o.sme, -1), rival: num(o.rival, -1), dp: {}, flow: {} };
  for (const k of [...RAW_KINDS, ...PRODUCT_KINDS]) c.corp.dp[k] = clamp(num(o.dp && o.dp[k], 1), CORP.dpMin, CORP.dpMax);
  rebuildGroups(c);
}
export const packCorp = (c) => (c.corp ? { list: c.corp.list.map(({ pend, ...q }) => ({ ...q, cash: Math.round(q.cash), intern: Math.round(q.intern), xunits: Math.round(q.xunits) })), asks: c.corp.asks, nextId: c.corp.nextId, nextAsk: c.corp.nextAsk, foundAt: c.corp.foundAt, foundTradeAt: c.corp.foundTradeAt, off: c.corp.off || undefined, sme: c.corp.sme, rival: c.corp.rival, dp: Object.fromEntries(Object.entries(c.corp.dp).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) } : undefined);

// ───────────────────────── chỗ xây ─────────────────────────

/** Ô đất trống của thành phố, cạnh đường, chưa có nhà, chưa ai giữ (zoneRect còn kiểm lại mọi điều kiện khác). */
const freeLand = (c, i) => c.own[i] && c.acc[i] && !c.steep[i] && !c.water[i] && !c.road[i] && !c.occ[i] && !c.level[i] && !c.owner[i] && !(c.beach && c.beach[i]) && !(c.decor && c.decor[i]) && !(c.falls && c.falls[i]) && !(c.resvCell && c.resvCell[i]);
/** Loại khu công ty được xây theo đúng quy hoạch: sản xuất → khu công nghiệp (3) hoặc xưởng chế biến (21); thương mại → cửa hàng (2, 5). Kho chỉ ở khu công nghiệp. */
export const fitsZone = (q, z, ware = false) => (ware ? z === 3 : q.kind === 'trade' ? z === 2 || z === 5 : z === 3 || z === 21);
/** Ô thị trưởng ĐÃ quy hoạch đúng loại, còn trống: công ty chỉ được tự xây ở đây (không tự chuyển mục đích sử dụng đất). */
const zonedOk = (c, q, i, ware = false) => freeLand(c, i) && fitsZone(q, c.zone[i], ware);
/** Ô chưa quy hoạch: chỉ được dùng khi thị trưởng duyệt đề xuất xin chuyển đổi quy hoạch. */
const rawOk = (c, i) => freeLand(c, i) && !c.zone[i];
const siteOk = (c, q, i) => zonedOk(c, q, i) || rawOk(c, i);
const near = (c, i, r) => { const x = i % N, y = (i / N) | 0; return (cb) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N && cb(idxXY(X, Y), dx, dy)) return true; } return false; }; };
const homesNear = (c, i) => { let n = 0; near(c, i, 2)((k) => { if (c.level[k] && ZDEF[c.zone[k]].res) n++; return false; }); return n; };

/** Chấm điểm một ô làm nhà máy cho công ty: đúng sản phẩm, gần cụm cũ, xa nhà dân, đất rẻ. */
function siteScore(c, q, i, centre) {
  const x = i % N, y = (i / N) | 0;
  if (q.kind === 'trade') { // cửa hàng: gần nhà dân (khách), đất đắt (đông người qua lại), gần cụm cửa hàng cũ
    let t = homesNear(c, i) * 1.2 + c.landValue[i] * 0.02;
    if (centre) t -= Math.hypot(x - centre.x, y - centre.y) * 0.12;
    return t;
  }
  let s = (productAt(i, 3) === corpSector(c, q) ? 4 : 0) + (signalOf(c, productAt(i, 3)) - 1) * 6 - homesNear(c, i) * 1.5 - c.landValue[i] * 0.02; // giá thế giới cao: đáng xây hơn
  if (centre) s -= Math.hypot(x - centre.x, y - centre.y) * 0.12;
  return s;
}
const centreOf = (c, q) => { const l = q.cells.map(([i]) => i); if (!l.length) return null; return { x: l.reduce((s, i) => s + (i % N), 0) / l.length, y: l.reduce((s, i) => s + ((i / N) | 0), 0) / l.length }; };

/** Ô đã quy hoạch đúng loại liền kề cụm hiện có (bán kính 3) để mở rộng nhỏ; ware: chỉ khu công nghiệp. Không có thì -1. */
function expandSite(c, q, ware = false) {
  const centre = centreOf(c, q); let best = -1, bs = -Infinity;
  const seen = new Set();
  for (const [o] of q.cells) near(c, o, 3)((i) => { if (!seen.has(i) && zonedOk(c, q, i, ware)) { seen.add(i); const s = siteScore(c, q, i, centre); if (s > bs) { bs = s; best = i; } } return false; });
  return best;
}
/** n ô liền nhau ở nơi điểm cao nhất toàn bản đồ, chỉ trong các ô thoả ok. */
function cluster(c, q, n, ok) {
  const centre = centreOf(c, q); let seed = -1, bs = -Infinity;
  for (let i = 0; i < N * N; i++) if (ok(i)) { const s = siteScore(c, q, i, centre); if (s > bs) { bs = s; seed = i; } }
  if (seed < 0) return [];
  const out = [seed], used = new Set(out);
  for (let k = 0; k < out.length && out.length < n; k++) near(c, out[k], 1)((i) => { if (out.length < n && !used.has(i) && ok(i)) { used.add(i); out.push(i); } return false; });
  return out;
}
/** Ô khu đúng loại đã quy hoạch, còn trống, cho một dự án n ô (ưu tiên). */
const zonedSites = (c, q, n) => cluster(c, q, n, (i) => zonedOk(c, q, i));
/**
 * Một dự án mới (cần thị trưởng duyệt): ưu tiên ô đã quy hoạch đúng loại; không đủ (dưới 2 ô) thì xin đất chưa quy hoạch, khi đó
 * đề xuất ghi rõ số ô phải chuyển đổi mục đích sử dụng đất và chỉ thị trưởng mới chuyển được.
 */
function projectSites(c, q, n) {
  const z = zonedSites(c, q, n);
  return z.length >= Math.min(2, n) ? z : cluster(c, q, n, (i) => rawOk(c, i));
}
/** Số ô trong danh sách chưa quy hoạch (phải chuyển đổi mục đích sử dụng đất). */
const rezoneOf = (c, sites) => sites.filter((i) => !c.zone[i]).length;

// ───────────────────────── cổng hành động ─────────────────────────

const feeOf = (n) => n * CORP.cellFee * MK;
/** Quỹ cần có cho dự án n ô: phí xây + phí đất + phí hạ tầng của các cam kết phụ + quỹ dự phòng. */
const infraOf = (terms, n) => (terms || []).reduce((sum, k) => sum + (CORP.infra[k] || 0) * MK * n, 0);
/** Phí đất mỗi ô nộp ngân sách: nhiều công ty cùng tranh đất công nghiệp thì phí lên (chain.js landK). */
export const landFeeOf = (c) => CORP.landFee * MK * (c ? landK(c) : 1);
const projNeed = (terms, n, c) => feeOf(n) + landFeeOf(c) * n + infraOf(terms, n) + CORP.reserve * MK;
/** Khu quy hoạch công ty xây: công ty thương mại xây cửa hàng (khu 2), công ty sản xuất xây nhà máy (khu 3). */
const buildZone = (q) => (q.kind === 'trade' ? 2 : 3);
/** Điện còn dư (nhà máy mới cần điện): từ chối nếu mạng điện đã chạm trần. */
const powerOk = (c) => !c.stats || !c.stats.powerCap || c.stats.powerUse < c.stats.powerCap * 0.97;
/** Số ô tối đa theo bậc. */
const capCells = (q) => 4 + q.stage * 4;
/**
 * Ngưỡng "làm ăn ế": so với hiệu suất chung của doanh nghiệp trong thành phố (ca làm lệch nhau nên hiệu suất bình thường chỉ quanh 0,4).
 * Trước đây cố định 0,35 nên gần một nửa số công ty bị coi là khủng hoảng và chỉ thu hẹp. Tối đa 0,35, tối thiểu 0,15.
 */
export const lowEff = (c) => clamp(0.75 * (c.pstats && c.pstats.eff > 0 ? c.pstats.eff : 0.47), 0.15, 0.35);

/**
 * Cổng duy nhất: act = { type: 'build', cells: [i…], approved?: bool } | { type: 'release', cell } | { type: 'ask', sites }.
 * Trả { ok, reason }; không hợp lệ thì không đổi gì.
 */
export function corpAct(c, q, act) {
  if (!c.corp || !corpById(c, q.id)) return { ok: false, reason: 'Công ty không còn' };
  if (act.type === 'build') {
    const ware = !!act.ware, asked = act.cells || [];
    const cells = asked.filter((i) => zonedOk(c, q, i, ware) || (act.approved && act.rezone && rawOk(c, i))); // đất chưa quy hoạch chỉ khi thị trưởng đã duyệt chuyển đổi
    if (!cells.length) return { ok: false, reason: asked.some((i) => rawOk(c, i)) ? 'Đất chưa quy hoạch: công ty không được tự chuyển mục đích sử dụng đất, phải xin thị trưởng' : 'Không còn ô đất hợp lệ' };
    if (q.cells.length + cells.length > capCells(q)) return { ok: false, reason: `Đã đủ ${capCells(q)} ô cho bậc ${q.stage}` };
    if (!powerOk(c)) return { ok: false, reason: 'Mạng điện đã đầy, chưa dám xây thêm nhà máy' };
    if (!act.approved && cells.length > 1) return { ok: false, reason: 'Dự án nhiều ô phải được thị trưởng duyệt' };
    const fee = feeOf(cells.length);
    if (q.cash < fee + CORP.reserve * MK) return { ok: false, reason: 'Quỹ không đủ' };
    let n = 0;
    let rz = 0;
    for (const i of cells) {
      if (!c.zone[i]) { const r = c.fn.zoneRect(c, i % N, (i / N) | 0, i % N, (i / N) | 0, buildZone(q)); if (!r.ok || c.zone[i] !== buildZone(q)) continue; rz++; } // thị trưởng đã duyệt chuyển đổi: game quy hoạch thay
      claim(c, q, i); if (ware) q.wares.push(i); n++;
    }
    if (!n) return { ok: false, reason: 'Khu đất không quy hoạch được' };
    if (rz) { c.dirty.zones = true; corpLog(c, q, 'rezoned', { n: rz }); }
    const paid = feeOf(n); q.cash -= paid; c.fn.procure(c, paid, 'corpBuild');
    corpLog(c, q, act.ware ? 'warehouse' : 'build', { n, cost: Math.round(paid) });
    if (act.ware) rebuildGroups(c);
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
    const kid = makeCorp(c, uniqueName(c, [`${base} ${PRODUCTS[p.sector].name}`]), q.ceo, p.sector, q.id, p.seed);
    q.cash -= p.seed; q.cool.sub = c.day + CORP.subCool;
    const moved = p.cells.reduce((s, i) => s + (built(c, i) ? jobCap(c.zone[i], c.level[i]) : 0), 0);
    for (const d of q.deals) if (d.status === 'open') d.base -= moved; // việc làm chuyển sang công ty con vẫn của nhóm: không tính là mẹ sai cam kết
    for (const i of p.cells) { q.cells = q.cells.filter(([k]) => k !== i); c.owner[i] = 0; claim(c, kid, i); }
    kid.stage = 1; rebuildGroups(c);
    corpLog(c, q, 'subsidiary', { name: kid.name, n: p.cells.length, cash: Math.round(p.seed) });
    corpLog(c, kid, 'founded', { n: kid.cells.length, sector: p.sector, cash: Math.round(p.seed), parent: q.name });
    news(c, `🏢 ${corpTitle(q)} lập ${corpTitle(kid)}, làm ${PRODUCTS[p.sector].name.toLowerCase()}`);
    return { ok: true, kid };
  }
  if (act.type === 'acquire') {
    const p = acquirePlan(c, q);
    if (!p) return { ok: false, reason: 'Không có thương vụ phù hợp' };
    q.cool.acq = c.day + CORP.acqCool;
    if (p.corp) { // đối thủ đang khó: trở thành công ty con (gồm cả các con của nó); tiền mua trả cho cổ đông cũ (dân), không vào quỹ của chính nó
      const r = corpById(c, p.corp);
      q.cash -= p.price; if (!toResidents(c, p.price)) world(c, 'dividend', -p.price);
      for (const s of subsOf(c, r)) s.parent = q.id;
      r.parent = q.id; q.trust = clamp(q.trust + 0.3, -3, 5); rebuildGroups(c);
      corpLog(c, q, 'acquire', { kind: 'rival', name: r.name, n: p.cells, cost: Math.round(p.price) });
      corpLog(c, r, 'acquired', { by: q.name, cost: Math.round(p.price) });
      news(c, `🤝 ${corpTitle(q)} mua lại ${corpTitle(r)} đang gặp khó, nhập vào nhóm`);
      return { ok: true, rival: r };
    }
    q.cash -= p.price; if (!toResidents(c, p.price)) world(c, 'dividend', -p.price); // tiền bán về tay chủ cũ (dân trong thành phố)
    const shopCell = ZDEF[c.zone[p.cell]].biz === 'shop', owner = shopCell && q.kind !== 'trade' ? tradeChild(c, q) : q; // tập đoàn sản xuất mua cửa hàng: vào công ty con thương mại của nhóm
    claim(c, owner, p.cell);
    corpLog(c, q, 'acquire', { kind: shopCell ? 'shop' : 'sme', n: 1, cost: Math.round(p.price) });
    return { ok: true, cell: p.cell };
  }
  if (act.type === 'loan') {
    const L = loanPlan(c, q);
    if (!L) return { ok: false, reason: 'Không vay được' };
    q.cash += L; q.debt = (q.debt || 0) + L; world(c, 'corpLoan', L);
    corpLog(c, q, 'loan', { amount: Math.round(L) });
    news(c, `🏦 ${corpTitle(q)} vay vốn ngân hàng để vượt khó`);
    return { ok: true, amount: L };
  }
  if (act.type === 'ask') {
    if (c.corp.asks.some((a) => a.corp === q.id)) return { ok: false, reason: 'Đã có đề xuất đang chờ' };
    if (c.day < q.cool.ask) return { ok: false, reason: 'Đang trong thời gian nghỉ đề xuất' };
    const sites = (act.sites || []).filter((i) => siteOk(c, q, i));
    if (!sites.length) return { ok: false, reason: 'Không có khu đất phù hợp' };
    const jv = act.jv ? corpById(c, act.jv) : null, terms = termsFor(c, jv ? { ...q, stage: Math.min(q.stage, jv.stage) } : q), need = projNeed(terms, sites.length, c);
    if (jv ? q.cash < need / 2 || jv.cash < need / 2 : q.cash < need) return { ok: false, reason: 'Quỹ không đủ cho dự án' };
    const k = 1 - Math.min(0.4, influence(c, q) / 100); // công ty càng lớn càng cam kết ít việc làm hơn (ảnh hưởng)
    const rezone = rezoneOf(c, sites), brk = jv ? 0 : brkWant(c, q), jobs = Math.round(sites.length * CORP.jobsPerCell * k * (q.kind === 'trade' ? 0.45 : 1));
    const a = { id: c.corp.nextAsk++, corp: q.id, kind: 'project', day: c.day, expires: c.day + CORP.askDays, terms, sites, jobs, jobs0: jobs, days: CORP.commitDays, status: 'open', countered: 0, jv: jv ? jv.id : 0, rezone, brk, brk0: brk, brkDays: brk ? CORP.brkDays : 0, chat: [] };
    c.corp.asks.push(a); corpLog(c, q, 'ask', { n: sites.length, jobs: a.jobs, jv: jv ? jv.name : undefined, rezone, brk });
    const what = q.kind === 'trade' ? 'cửa hàng' : 'nhà máy', zoneName = q.kind === 'trade' ? 'khu thương mại' : 'khu công nghiệp';
    a.ev = news(c, `🏭 ${corpTitle(q)}${jv ? ` cùng ${corpTitle(jv)} (liên doanh)` : ''} xin ${sites.length} ô đất làm ${what}${rezone ? ` (${rezone} ô chưa quy hoạch: xin chuyển sang ${zoneName})` : ` trên ${zoneName} đã quy hoạch`}, cam kết thêm ${a.jobs} việc làm${terms.length ? `, ${terms.map(termLine).join(', ')}` : ''} trong ${a.days} ngày${brk ? `, xin miễn ${brk}% thuế trong ${a.brkDays} ngày` : ''} (xem 🏢 Tập đoàn)`, { corp: q.id, cell: sites[0], cause: q.taxEv && c.day - (q.taxEvAt || -99) < 20 ? q.taxEv : undefined });
    return { ok: true, ask: a };
  }
  if (act.type === 'house') { // tài trợ xây nhà ở công nhân trên ô nhà ở thị trưởng đã quy hoạch (vẫn phải được duyệt)
    if (c.corp.asks.some((x) => x.corp === q.id)) return { ok: false, reason: 'Đã có đề xuất đang chờ' };
    if (c.day < q.cool.ask) return { ok: false, reason: 'Đang trong thời gian nghỉ đề xuất' };
    const sites = (act.sites || []).filter((i) => !c.level[i] && c.zone[i] && ZDEF[c.zone[i]].cat === 'r' && !ZDEF[c.zone[i]].who && c.acc[i] && !(c.funded && c.funded[i])).slice(0, CORP.houseMax);
    if (!sites.length) return { ok: false, reason: 'Không có ô nhà ở đã quy hoạch gần cụm nhà máy' };
    const cost = sites.length * CORP.houseFee * MK;
    if (q.cash < cost + CORP.reserve * MK) return { ok: false, reason: 'Quỹ không đủ' };
    const a = { id: c.corp.nextAsk++, corp: q.id, kind: 'housing', day: c.day, expires: c.day + CORP.askDays, terms: [], sites, jobs: 0, jobs0: 0, days: 0, status: 'open', countered: 1, jv: 0, rezone: 0, brk: 0, brk0: 0, brkDays: 0, cost, chat: [] };
    c.corp.asks.push(a); corpLog(c, q, 'houseAsk', { n: sites.length, cost: Math.round(cost) });
    a.ev = news(c, `🏘️ ${corpTitle(q)} xin tài trợ ${vnd(cost)} xây nhà ở cho công nhân trên ${sites.length} ô nhà ở đã quy hoạch gần cụm nhà máy (xem 🏢 Tập đoàn)`, { corp: q.id, cell: sites[0], cause: q.houseEv });
    return { ok: true, ask: a };
  }
  if (act.type === 'downsize') { // thu hẹp: hạ một nấc nhà máy yếu, người làm dư bị cho nghỉ
    const i = act.cell;
    if (!q.cells.some(([k]) => k === i) || !(c.level[i] >= 2)) return { ok: false, reason: 'Không có nhà máy để thu hẹp' };
    const before = c.staff[i] | 0;
    c.level[i]--; c.age[i] = 0; c.dirty.buildings = true;
    const cut = c.fn.trimStaff ? c.fn.trimStaff(c, i) : 0;
    corpLog(c, q, 'downsize', { cut, jobs: jobCap(c.zone[i], c.level[i]) });
    const ev = news(c, `📉 ${corpTitle(q)} thu hẹp ${bizName(c, i)} ở ${placeName(c, i)}: giảm sản lượng, ${cut} người mất việc`, { corp: q.id, cell: i, cause: act.cause });
    if (cut >= 6 && c.fn.watchLayoff) c.fn.watchLayoff(c, i, Math.max(cut, before - jobCap(c.zone[i], c.level[i])), ev);
    return { ok: true, cut };
  }
  if (act.type === 'close' || act.type === 'relocate') { // đóng hẳn một cơ sở (dời đi nơi khác: một phần tài sản chuyển ra ngoài thành phố)
    const i = act.cell;
    if (!q.cells.some(([k]) => k === i) || !c.level[i]) return { ok: false, reason: 'Không có cơ sở để đóng' };
    const move = act.type === 'relocate' ? Math.min(q.cash * 0.3, valueOf(c, i)) : 0;
    c._why = { kind: act.type, cause: act.cause, note: act.type === 'relocate' ? `sang tỉnh khác vì thuế ${q.kind === 'trade' ? 'thương mại' : 'công nghiệp'} ${taxOf(c, q)}% quá cao` : 'vì lỗ kéo dài' }; // biên niên ghi một dòng (chain.js), kèm số người mất việc
    c.fn.clearBuilding(c, i);
    release(c, q, i);
    if (act.type === 'relocate') q.cool.move = c.day + 10;
    if (move > 0) { q.cash -= move; world(c, 'corpMove', -move); }
    corpLog(c, q, act.type, { cell: i, moved: Math.round(move) });
    return { ok: true };
  }
  if (act.type === 'tech') { // đầu tư máy móc, công nghệ: chạy nhanh hơn, ít khói hơn; tiền trả cho doanh nghiệp trong thành phố (procure)
    const p = techPlan(c, q);
    if (!p) return { ok: false, reason: 'Chưa đủ điều kiện đầu tư công nghệ' };
    q.cash -= p.cost; c.fn.procure(c, p.cost, 'corpTech'); q.tech = (q.tech || 0) + 1; q.cool.tech = c.day + CORP.techCool; rebuildGroups(c);
    corpLog(c, q, 'tech', { lv: q.tech, cost: Math.round(p.cost) });
    news(c, `⚙️ ${corpTitle(q)} đầu tư máy móc mới (nấc ${q.tech}/${CORP.techMax}): sản lượng +${Math.round(q.tech * CORP.techK * 100)}%, khói thải ít hơn`, { corp: q.id });
    return { ok: true, lv: q.tech };
  }
  return { ok: false, reason: 'Hành động không có' };
}

// ───────────────────────── thị trưởng trả lời đề xuất ─────────────────────────

/** Thị trưởng chấp nhận: công ty nộp phí đất cho ngân sách, xây, và nhận cam kết việc làm đo được (kèm ưu đãi thuế nếu có). */
export function approveAsk(c, id) {
  const a = c.corp.asks.find((x) => x.id === id);
  let q = a && corpById(c, a.corp);
  if (!a || !q) return { ok: false, reason: 'Đề xuất không còn' };
  const drop = () => { c.corp.asks = c.corp.asks.filter((x) => x !== a); };
  if (a.kind === 'housing') { // nhà ở công nhân: công ty trả tiền xây (cho doanh nghiệp trong thành phố), ô nhà ở được xây ngay khi đủ điện nước
    const sites = a.sites.filter((i) => !c.level[i] && c.zone[i] && ZDEF[c.zone[i]].cat === 'r');
    const cost = sites.length * CORP.houseFee * MK;
    if (!sites.length || q.cash < cost) { drop(); corpLog(c, q, 'askFailed', { text: 'Không còn đất hoặc không còn đủ vốn xây nhà ở' }); return { ok: false, reason: 'Không còn đất hoặc công ty không còn đủ vốn' }; }
    q.cash -= cost; c.fn.procure(c, cost, 'corpHouse');
    const n = fundCells(c, sites);
    q.trust = clamp(q.trust + 0.5, -3, 5); drop();
    corpLog(c, q, 'houseOk', { n, cost: Math.round(cost) });
    news(c, `🏗️ Đã duyệt: ${corpTitle(q)} chi ${vnd(cost)} xây nhà ở cho công nhân trên ${n} ô gần cụm nhà máy`, { corp: q.id, cell: sites[0], cause: a.ev });
    return { ok: true, built: n };
  }
  if (a.jv) { // liên doanh: hai công ty góp vốn đều nhau vào công ty mới, công ty mới xây và chịu cam kết
    const p = corpById(c, a.jv), need = projNeed(a.terms, a.sites.length, c), half = need / 2;
    if (!p || q.cash < half || p.cash < half) { drop(); return { ok: false, reason: 'Một bên liên doanh không còn đủ vốn' }; }
    const jq = makeCorp(c, uniqueName(c, [`Liên doanh ${q.name.split(' ')[0]}–${p.name.split(' ')[0]}`]), q.ceo, q.sector, 0, 0, q.kind || 'ind');
    jq.partners = [q.id, p.id]; q.cash -= half; p.cash -= half; jq.cash = half * 2;
    corpLog(c, q, 'jv', { name: jq.name, partner: p.name, cash: Math.round(half) }); corpLog(c, p, 'jv', { name: jq.name, partner: q.name, cash: Math.round(half) });
    corpLog(c, jq, 'founded', { n: 0, sector: q.sector, cash: Math.round(half * 2), parent: `${q.name} + ${p.name}` });
    q = jq; rebuildGroups(c);
  }
  // quỹ có thể đã hụt trong lúc chờ duyệt: phải đủ cả phí xây, phí đất và quỹ dự phòng thì mới xây (không để quỹ âm)
  if (q.cash < projNeed(a.terms, a.sites.length, c)) { corpLog(c, q, 'askFailed', { text: 'Quỹ không còn đủ cho dự án' }); drop(); return { ok: false, reason: 'Quỹ công ty không còn đủ cho dự án' }; }
  const base = jobsOf(c, q);
  const r = corpAct(c, q, { type: 'build', cells: a.sites, approved: true, rezone: a.rezone > 0 });
  if (!r.ok) { corpLog(c, q, 'askFailed', { text: r.reason }); drop(); return r; }
  const land = landFeeOf(c) * r.n; // phí đất theo số ô thật sự được giao (đang tranh đất thì cao hơn)
  q.cash -= land; c.money += land; inner(c, 'corpLand', land); // phí đất: quỹ công ty → ngân sách (trong thành phố)
  const infra = infraOf(a.terms, r.n); // phí hạ tầng (cống, cây xanh, phòng cháy): quỹ công ty → ngân sách, để thị trưởng xây
  if (infra > 0) { q.cash -= infra; c.money += infra; inner(c, 'corpInfra', infra); }
  const jobs = Math.round(a.jobs * (r.n / a.sites.length));
  q.deals.push({ id: a.id, cells: r.n, jobs, base, due: c.day + a.days, status: 'open', terms: (a.terms || []).filter((k) => TERM_KEYS.includes(k)), brk: a.brk || 0 });
  if (a.brk > 0) { q.brk = { pct: a.brk, until: c.day + a.brkDays }; rebuildGroups(c); }
  q.trust = clamp(q.trust + 0.5, -3, 5);
  corpLog(c, q, 'approved', { n: r.n, jobs, due: c.day + a.days, infra: Math.round(infra), brk: a.brk || 0 });
  drop();
  const ev = news(c, `🏭 Đã duyệt: ${corpTitle(q)} xây ${r.n} ${q.kind === 'trade' ? 'cửa hàng' : 'nhà máy'}${a.rezone ? ` (thành phố chuyển ${a.rezone} ô sang ${q.kind === 'trade' ? 'khu thương mại' : 'khu công nghiệp'})` : ''}, cam kết thêm ${jobs} việc làm${a.terms && a.terms.length ? `, ${a.terms.map(termLine).join(', ')}` : ''}${a.brk ? `, được miễn ${a.brk}% thuế đến ngày ${c.day + a.brkDays + 1}` : ''} đến ngày ${c.day + a.days + 1}`, { corp: q.id, cell: a.sites[0], cause: a.ev });
  if (r.n < a.sites.length) news(c, `⚔️ ${a.sites.length - r.n}/${a.sites.length} ô đất của dự án ${corpTitle(q)} đã bị lấy trước trong lúc chờ duyệt: dự án nhỏ lại`, { kind: 'land', corp: q.id, cause: ev });
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
  const want = CEOS[q.ceo].concede + q.trust * 0.05 - influence(c, q) / 200; // lớn hơn thì cứng hơn
  if (hash2(q.id, c.day, 61) < want) {
    a.jobs = Math.min(askBounds(a).jobs[1], Math.round(a.jobs * 1.4)); corpLog(c, q, 'counterOk', { jobs: a.jobs });
    return { ok: true, accepted: true, jobs: a.jobs, reply: `${corpTitle(q)} đồng ý nâng cam kết lên ${a.jobs} việc làm.` };
  }
  corpLog(c, q, 'counterNo', {});
  return { ok: true, accepted: false, reply: `${corpTitle(q)} giữ nguyên ${a.jobs} việc làm: "đòi thêm thì chúng tôi không đủ biên lợi nhuận".` };
}

// ───────────────────────── đàm phán đề xuất (chat với CEO, AI hoặc luật) ─────────────────────────

export const ASK_TURNS = 5; // số lượt mặc cả tối đa mỗi đề xuất
/** Khung mặc cả của một đề xuất dự án: việc làm cam kết (thành phố muốn cao), % thuế được miễn (công ty muốn cao). */
export function askBounds(a) {
  const j0 = Math.max(1, a.jobs0 || a.jobs || 1);
  return { jobs: [Math.max(1, Math.round(j0 * 0.8)), Math.round(j0 * 1.6), 'việc làm cam kết', 'us'], brk: [0, Math.max(0, a.brk0 || 0), '% thuế được miễn', 'them'] };
}
const clampAsk = (a, o) => { const B = askBounds(a), out = {}; for (const k in B) out[k] = Math.round(clamp(Number.isFinite(+o?.[k]) ? +o[k] : a[k], B[k][0], B[k][1])); return out; };
/** Mức nhượng bộ tối đa mỗi lượt theo tính cách CEO và độ lớn của công ty (tỷ lệ khung). */
const concedeStep = (c, q) => clamp(0.08 + CEOS[q.ceo].concede * 0.14 + q.trust * 0.01 - influence(c, q) / 600, 0.04, 0.22);
/**
 * Cập nhật đề nghị mới của CEO (từ LLM hoặc luật dự phòng): ép vào khung, mỗi lượt chỉ nhượng tối đa concedeStep khung về phía thành phố
 * so với đề nghị trước (lời lẽ thế nào cũng không moi được hơn), quá ASK_TURNS lượt thì là mức cuối; walkaway: công ty rút đề xuất.
 */
export function corpCounter(c, id, reply, offer, status) {
  const a = c.corp.asks.find((x) => x.id === id), q = a && corpById(c, a.corp);
  if (!a || !q || a.kind === 'housing') return null;
  const B = askBounds(a), k = concedeStep(c, q);
  if (offer) {
    const o = clampAsk(a, offer);
    for (const key in B) { const [lo, hi, , want] = B[key], lim = Math.max(1, (hi - lo) * k); o[key] = want === 'us' ? Math.min(o[key], a[key] + lim) : Math.max(o[key], a[key] - lim); }
    const o2 = clampAsk(a, o); a.jobs = o2.jobs; a.brk = o2.brk; if (!a.brk) a.brkDays = 0; else if (!a.brkDays) a.brkDays = CORP.brkDays;
  }
  if (a.chat.filter((m) => m.from === 'us').length >= ASK_TURNS && status === 'negotiating') status = 'final';
  if (status === 'final') a.final = true;
  a.chat.push({ from: 'them', text: String(reply || '').replace(/[<>]/g, '').slice(0, 600) });
  if (a.chat.length > 16) a.chat.splice(0, a.chat.length - 16);
  if (status === 'walkaway') { corpLog(c, q, 'walkaway', {}); q.cool.ask = c.day + CORP.askCool; c.corp.asks = c.corp.asks.filter((x) => x !== a); news(c, `🚪 ${corpTitle(q)} rút đề xuất sau khi mặc cả không thành`, { corp: q.id, cause: a.ev }); }
  else corpLog(c, q, 'nego', { jobs: a.jobs, brk: a.brk });
  return a;
}
/** CEO trả lời bằng luật (không có AI): nhượng dần theo tính cách, tới lượt cuối thì giữ nguyên. */
export function corpCounterFallback(c, a) {
  const q = corpById(c, a.corp), B = askBounds(a), turns = a.chat.filter((m) => m.from === 'us').length;
  if (!q) return { reply: '', offer: null, status: 'walkaway' };
  if (turns > ASK_TURNS - 1 || a.final) return { reply: `${corpTitle(q)}: đây là mức cuối cùng, mong thị trưởng cân nhắc.`, offer: { jobs: a.jobs, brk: a.brk }, status: 'final' };
  const k = concedeStep(c, q);
  const o = { jobs: a.jobs + (B.jobs[1] - B.jobs[0]) * k, brk: a.brk - (B.brk[1] - B.brk[0]) * k };
  return { reply: `${corpTitle(q)}: chúng tôi xin điều chỉnh, cam kết ${Math.round(clampAsk(a, o).jobs)} việc làm${a.brk0 ? `, ưu đãi thuế ${clampAsk(a, o).brk}%` : ''}.`, offer: o, status: 'negotiating' };
}
/** Số liệu gửi kèm khi AI đóng vai CEO mặc cả một đề xuất. */
export function askBrief(c, a) {
  const q = corpById(c, a.corp), B = askBounds(a);
  return { ...corpBrief(c, q), sites: a.sites.length, rezone: a.rezone || 0, jobsNow: a.jobs, brkNow: a.brk || 0, brkDays: a.brkDays || CORP.brkDays, jobsMin: B.jobs[0], jobsMax: B.jobs[1], brkMax: B.brk[1], landFee: Math.round(landFeeOf(c) / MK), concedePct: Math.round(concedeStep(c, q) * 100) };
}

/** Ưu đãi thuế công ty xin kèm dự án: thuế càng cao, CEO càng cứng, công ty càng lớn thì xin càng nhiều (bội số 5%, tối đa 50%). */
export function brkWant(c, q) {
  const t = q.kind === 'trade' ? c.tax.c : c.tax.i, ceo = CEOS[q.ceo];
  const v = (t - CORP.taxBase) * 4 + (1 - ceo.concede) * 28 + influence(c, q) * 0.2 - 6;
  return clamp(Math.round(v / 5) * 5, 0, CORP.brkMax);
}
/** Phần thuế công ty đang được miễn (0..1). */
export const brkOf = (c, q) => (q && q.brk && q.brk.until >= c.day ? q.brk.pct / 100 : 0);

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
  const g = [0], e = [0], pay = [0], mk = [0], store = [0], tech = [0], brk = [0], ware = new Uint8Array(N * N);
  for (const q of c.corp.list) { g[q.id] = rootOf(c, q.id); e[q.id] = q.export ? 1 : 0; pay[q.id] = q.pay || 1; mk[q.id] = q.markup || 1; tech[q.id] = q.tech || 0; brk[q.id] = brkOf(c, q); }
  for (const q of c.corp.list) brk[q.id] = Math.max(brk[q.id], brk[g[q.id]] || 0); // ưu đãi thuế của tập đoàn mẹ áp cho cả nhóm
  for (const q of c.corp.list) for (const i of q.wares || []) if (c.owner[i] === q.id) { // chỗ chứa thêm theo cấp kho và mức có người làm (kho không ai làm thì không thêm gì)
    ware[i] = 1;
    if (c.level[i]) { const fill = c.staff ? Math.min(1, c.staff[i] / Math.max(1, jobCap(c.zone[i], c.level[i]))) : 1; store[g[q.id]] = Math.min(CORP.storeMax, (store[g[q.id]] || 0) + Math.round(CORP.storeCap * Math.min(c.level[i], 3) * fill)); }
  }
  for (const q of c.corp.list) store[q.id] = store[g[q.id]] || 0; // kho của cả nhóm phục vụ mọi công ty trong nhóm
  c.corpGroup = g; c.corpExp = e; c.corpPay = pay; c.corpMark = mk; c.corpStore = store; c.corpTech = tech; c.corpBrk = brk; c.ware = ware;
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

/** Tên chưa ai dùng: thử lần lượt các tên gợi ý, hết thì thêm số. */
function uniqueName(c, tries) {
  const taken = new Set(c.corp.list.map((q) => q.name));
  for (const t of tries) { const s = t.slice(0, 40); if (!taken.has(s)) return s; }
  for (let k = 2; ; k++) { const s = `${tries[0].slice(0, 36)} ${k}`; if (!taken.has(s)) return s; }
}
/** Ô yếu nhất để bán khi khủng hoảng: hiệu suất thấp nhất, giữ kho bãi lại sau cùng. */
const poorest = (c, q) => { let b = -1, v = Infinity; for (const i of cellsBuilt(c, q)) { const e = c.biz.eff[i] + (c.ware && c.ware[i] ? 1 : 0); if (e < v) { v = e; b = i; } } return b; };

function makeCorp(c, name, ceo, sector, parent, cash, kind = 'ind') {
  const C = c.corp, id = C.nextId++;
  const q = { id, kind, name, ceo, sector, parent, stage: 1, cash, born: c.day, trust: 0, cool: { act: c.day + 2, ask: c.day, sub: c.day + CORP.subCool, acq: c.day + CORP.acqCool, tech: c.day + 5 }, goal: { jobs: 40 }, cells: [], deals: [], log: [], export: 0, intern: 0, xunits: 0, markup: 1, wares: [], debt: 0, pay: 1, pAt: 0, lastShare: 0, mono: 0, dep: 0, crisisAt: -99, tech: 0, low: 0, taxSeen: kind === 'trade' ? c.tax.c : c.tax.i };
  C.list.push(q);
  return q;
}

export const OPTS = {
  warehouse: 'Xây một kho bãi / logistics (thêm chỗ chứa hàng, giao nhanh hơn, xuất theo lô lớn)',
  expand: 'Mở thêm một cơ sở (nhà máy hoặc cửa hàng) cạnh cụm hiện có (tự làm, tốn quỹ)',
  project: 'Xin thị trưởng một dự án nhiều ô đất (nhà máy hoặc cửa hàng, có cam kết việc làm)',
  subsidiary: 'Lập công ty con từ các cơ sở hiện có (đa ngành)',
  acquire: 'Mua lại một doanh nghiệp (đối thủ đang khó, hoặc xưởng độc lập gần cụm)',
  jv: 'Lập liên doanh với công ty khác, cùng góp vốn xin một dự án',
  loan: 'Vay vốn ngân hàng để vượt khó (có lãi, phải trả dần)',
  release: 'Bán bớt cơ sở yếu nhất để giảm lỗ',
  downsize: 'Thu hẹp sản xuất: hạ một nấc nhà máy yếu nhất, cho bớt người nghỉ việc',
  close: 'Đóng cửa hẳn cơ sở lỗ nhất (người làm ở đó mất việc)',
  relocate: 'Dời cơ sở yếu nhất sang tỉnh khác vì thuế cao (mang một phần vốn đi)',
  tech: 'Đầu tư máy móc, công nghệ: sản lượng cao hơn, ít khói thải hơn',
  housing: 'Xin tài trợ xây nhà ở công nhân trên đất nhà ở đã quy hoạch gần cụm nhà máy',
  hold: 'Giữ nguyên, tích luỹ tiền',
};
/** Thuế suất công ty đang chịu (công nghiệp hoặc thương mại, %). */
export const taxOf = (c, q) => (q.kind === 'trade' ? c.tax.c : c.tax.i);
/** Cơ sở có thể thu hẹp: đã xây từ cấp 2, không phải kho, hiệu suất thấp nhất. */
function shrinkSite(c, q) { let b = -1, v = Infinity; for (const i of cellsBuilt(c, q)) if (c.level[i] >= 2 && !(c.ware && c.ware[i]) && c.biz.eff[i] < v) { v = c.biz.eff[i]; b = i; } return b; }
/** Đầu tư máy móc: công ty sản xuất từ bậc 2, ≥ 2 nhà máy, chưa đủ 3 nấc, hết thời gian nghỉ, đủ tiền (gấp đôi dự phòng). */
function techPlan(c, q) {
  const n = cellsBuilt(c, q).filter((i) => ZDEF[c.zone[i]].biz === 'ind' && !(c.ware && c.ware[i])).length;
  if (q.kind === 'trade' || q.stage < 2 || n < 2 || (q.tech || 0) >= CORP.techMax || c.day < (q.cool.tech || 0)) return null;
  const cost = CORP.techFee * MK * n * ((q.tech || 0) + 1);
  return q.cash >= cost + CORP.reserve * MK * 2 ? { cost } : null;
}
/** Nhà ở công nhân: vừa có tin thiếu nhà ở quanh cụm của công ty (chain.js) và có ô nhà ở đã quy hoạch còn trống gần đó. */
function housePlan(c, q) {
  if (q.parent || q.kind === 'trade' || c.day - (q.house ?? -99) > 20 || c.day < q.cool.ask || c.corp.asks.some((a) => a.corp === q.id)) return null;
  const h = workerHousing(c, q);
  if (!housingShort(h) || !h.sites.length) return null;
  const sites = h.sites.slice(0, CORP.houseMax), cost = sites.length * CORP.houseFee * MK;
  return q.cash >= cost + CORP.reserve * MK * 1.5 ? { sites, cost, fill: h.fill } : null;
}

/** Lập công ty con: chuyển 2 nhà máy (ưu tiên khác ngành chính) và vốn khởi đầu từ quỹ mẹ; mẹ phải còn ít nhất 3 nhà máy. */
function subsidiaryPlan(c, q) {
  if (q.parent || q.partners || q.stage < 2 || c.day < (q.cool.sub || 0) || subsOf(c, q).length >= CORP.maxSubs) return null;
  const mine = cellsBuilt(c, q).filter((i) => ZDEF[c.zone[i]].biz === 'ind' && !(c.ware && c.ware[i]));
  if (mine.length < CORP.subCells) return null;
  const seed = feeOf(2);
  if (q.cash < seed + CORP.reserve * MK) return null;
  const main = corpSector(c, q), other = mine.filter((i) => productAt(i, c.zone[i] === 21 ? 21 : 3) !== main);
  const pool = other.length ? other : mine.slice(-2), cells = pool.slice(0, 2);
  return { cells, seed, sector: productAt(cells[0], c.zone[cells[0]] === 21 ? 21 : 3) };
}

/** Các hành động CEO đang có thể làm (đã kiểm tra điều kiện), kèm lựa chọn mặc định của luật. */
export function corpOptions(c, q) {
  const ceo = CEOS[q.ceo], ids = [], mine = cellsBuilt(c, q).length, eff = effOf(c, q), tEff = taxOf(c, q) * (1 - brkOf(c, q));
  if (q.cash < CORP.reserve * MK * 0.5 && eff < lowEff(c)) { // khủng hoảng: vay, thu hẹp, bán / đóng cơ sở yếu, hoặc chịu
    if (loanPlan(c, q)) ids.push('loan');
    if (shrinkSite(c, q) >= 0) ids.push('downsize');
    if (mine > 1) ids.push('release', 'close');
    const def = ids.includes('loan') && ceo.risk >= 0.3 ? 'loan' : ids.includes('downsize') ? 'downsize' : ids.includes('release') ? 'release' : ids.includes('loan') ? 'loan' : 'hold';
    return ids.length ? { ids: [...ids, 'hold'], def } : { ids: [], def: 'hold' };
  }
  if (eff < lowEff(c)) { // chạy ế kéo dài (≥ 5 ngày): thu hẹp hoặc đóng bớt, không thì chờ
    if ((q.low || 0) < 5) return { ids: [], def: 'hold' };
    if (shrinkSite(c, q) >= 0) ids.push('downsize');
    if (mine > 2) ids.push('close');
    return ids.length ? { ids: [...ids, 'hold'], def: ceo.risk < 0.45 ? ids[0] : 'hold' } : { ids: [], def: 'hold' };
  }
  if (tEff >= CORP.taxHigh && mine >= 2 && eff < 0.6 && !q.partners && c.day >= (q.cool.move || 0)) { // thuế quá cao, làm ăn không tốt: tính chuyện dời đi
    return { ids: ['relocate', 'hold'], def: ceo.risk >= 0.45 || eff < 0.45 ? 'relocate' : 'hold' };
  }
  if (q.cells.length - mine >= 2) return { ids: [], def: 'hold' };
  const chest = (CORP.cellFee * (1 + ceo.risk * 2) * MK + CORP.reserve * MK) * (1 + Math.max(-0.3, (tEff - CORP.taxBase) * 0.07)); // thuế cao thì giữ tiền dày hơn mới dám mở rộng
  if (q.cash < chest) return { ids: [], def: 'hold' };
  const n = Math.min(5, 2 + q.stage);
  const can = { expand: q.cells.length < capCells(q) && expandSite(c, q) >= 0 && powerOk(c), project: false, subsidiary: !!subsidiaryPlan(c, q), acquire: !!acquirePlan(c, q), jv: !!jvPlan(c, q), warehouse: warehousePlan(c, q) >= 0, tech: !!techPlan(c, q), housing: !!housePlan(c, q) };
  if (q.cash >= projNeed(termsFor(c, q), n, c) && !c.corp.asks.length && c.day >= q.cool.ask && powerOk(c)) can.project = projectSites(c, q, n).length >= 2;
  if (q.kind !== 'trade' && !q.parent && !can.expand && q.cells.length < capCells(q) && zonedSites(c, q, n).length < 2) q.landWant = c.day; // muốn lớn mà hết đất công nghiệp đã quy hoạch: tranh đất (chain.js)
  for (const k of ['housing', 'warehouse', 'tech', 'expand', 'project', 'subsidiary', 'acquire', 'jv']) if (can[k]) ids.push(k);
  if (!ids.length) return { ids: [], def: 'hold' };
  ids.push('hold');
  const bold = ceo.risk >= 0.45 || q.stage >= 3, order = bold ? ['housing', 'subsidiary', 'acquire', 'warehouse', 'project', 'expand', 'tech', 'jv'] : ['housing', 'warehouse', 'tech', 'expand', 'jv', 'subsidiary', 'project', 'acquire']; // liều: ăn to; thận trọng: làm chắc, tìm đối tác
  return { ids, def: order.find((k) => can[k]) || 'hold' };
}

/** Thực thi một lựa chọn (mọi thứ vẫn qua corpAct để kiểm tra lại). */
export function corpDo(c, q, id) {
  const n = Math.min(5, 2 + q.stage);
  if (id === 'expand') { const i = expandSite(c, q); return i >= 0 ? corpAct(c, q, { type: 'build', cells: [i] }) : { ok: false, reason: 'Không còn đất đã quy hoạch' }; }
  if (id === 'project') return corpAct(c, q, { type: 'ask', sites: projectSites(c, q, n) });
  if (id === 'warehouse') { const i = warehousePlan(c, q); return i >= 0 ? corpAct(c, q, { type: 'build', cells: [i], ware: true }) : { ok: false, reason: 'Không có chỗ' }; }
  if (id === 'subsidiary') return corpAct(c, q, { type: 'subsidiary' });
  if (id === 'acquire') return corpAct(c, q, { type: 'acquire' });
  if (id === 'loan') return corpAct(c, q, { type: 'loan' });
  if (id === 'jv') { const p = jvPlan(c, q); return p ? corpAct(c, q, { type: 'ask', sites: p.sites, jv: p.partner }) : { ok: false, reason: 'Không có đối tác' }; }
  if (id === 'release') { const i = poorest(c, q); if (i >= 0) { const r = corpAct(c, q, { type: 'release', cell: i }); if (r.ok) news(c, `📉 ${corpTitle(q)} gặp khó khăn, bán bớt một cơ sở`, { corp: q.id, cell: i }); return r; } return { ok: false, reason: 'Không còn cơ sở để bán' }; }
  if (id === 'downsize') { const i = shrinkSite(c, q); const r = i >= 0 ? corpAct(c, q, { type: 'downsize', cell: i }) : { ok: false, reason: 'Không có nhà máy để thu hẹp' }; if (r.ok) q.low = 0; return r; }
  if (id === 'close') { const i = poorest(c, q); const r = i >= 0 ? corpAct(c, q, { type: 'close', cell: i }) : { ok: false, reason: 'Không còn cơ sở' }; if (r.ok) q.low = 0; return r; }
  if (id === 'relocate') { const i = poorest(c, q); return i >= 0 ? corpAct(c, q, { type: 'relocate', cell: i, cause: q.taxEv }) : { ok: false, reason: 'Không còn cơ sở' }; }
  if (id === 'tech') return corpAct(c, q, { type: 'tech' });
  if (id === 'housing') { const p = housePlan(c, q); return p ? corpAct(c, q, { type: 'house', sites: p.sites }) : { ok: false, reason: 'Không có đất nhà ở gần cụm' }; }
  return { ok: true };
}

/** Số liệu gửi cho AI (toàn số / chuỗi ngắn, do game tính). */
export function corpBrief(c, q) {
  const g = groupOf(c, q), ceo = CEOS[q.ceo], st = corpStats(c, q);
  return {
    name: corpTitle(q), stage: q.stage, ceo: ceo.name, philosophy: ceo.philosophy, invest: ceo.invest, nego: ceo.nego, risk: ceo.risk, sector: PRODUCTS[st.sector] ? PRODUCTS[st.sector].name : '',
    cells: st.cells, pending: st.pending, jobs: st.jobs, eff: Math.round(st.eff * 100), cashMK: Math.round(q.cash / MK), worldPrice: Math.round(signalOf(c, corpSector(c, q)) * 100) / 100, hubs: (c.corp.hubs || []).length, debtMK: Math.round((q.debt || 0) / MK), jobShare: Math.round(jobShare(c, rootOf(c, q.id)) * 1000) / 10, monopoly: monopolyOf(c, rootOf(c, q.id)) || '', partners: q.partners ? 1 : 0, goalJobs: q.goal.jobs, subs: g.subs, groupCells: g.n, groupJobs: g.jobs,
    export: q.export, internUnits: Math.round(q.intern), exportUnits: Math.round(q.xunits), trust: q.trust, influence: st.influence, city: { pop: c.pp ? c.pp.count : 0, powerUsePct: c.stats && c.stats.powerCap ? Math.round((100 * c.stats.powerUse) / c.stats.powerCap) : 0 },
    taxPct: taxOf(c, q), taxBasePct: CORP.taxBase, taxBreakPct: Math.round(brkOf(c, q) * 100), taxChangedDaysAgo: q.taxEvAt != null ? c.day - q.taxEvAt : -1, tech: q.tech || 0, lowDays: q.low || 0, workerHousingShort: c.day - (q.house ?? -99) <= 20 ? 1 : 0, landFeeK: Math.round(landK(c) * 100) / 100, zonedLandFree: zonedSites(c, q, 6).length,
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

/** Công ty phản ứng khi thành phố đổi thuế suất của mình (≥ 2 điểm): ghi lịch sử, công ty từ bậc 2 lên tiếng; nguyên nhân = sự kiện đổi thuế. */
function taxReact(c, q) {
  const t = taxOf(c, q);
  if (q.taxSeen == null) { q.taxSeen = t; return; }
  if (Math.abs(t - q.taxSeen) < 2) return;
  const up = t > q.taxSeen, from = q.taxSeen, ceo = CEOS[q.ceo];
  q.taxSeen = t; q.taxEv = c.chain ? c.chain.taxEv : 0; q.taxEvAt = c.day;
  corpLog(c, q, 'taxReact', { from, to: t });
  if (q.parent || q.stage < 2) return;
  const plan = up ? (t * (1 - brkOf(c, q)) >= CORP.taxHigh ? (ceo.risk >= 0.45 ? 'tính chuyện dời nhà máy sang tỉnh khác' : 'hoãn mở rộng, sẽ xin ưu đãi thuế khi xin dự án mới') : 'giữ tiền dày hơn trước khi mở rộng') : 'đẩy nhanh kế hoạch mở rộng';
  news(c, `${up ? '😠' : '🙂'} ${corpTitle(q)} phản ứng việc thuế ${q.kind === 'trade' ? 'thương mại' : 'công nghiệp'} ${up ? 'tăng' : 'giảm'} ${from}% → ${t}%: ${plan}`, { corp: q.id, cause: q.taxEv, toast: q.stage >= 3 });
}

/** Tên công ty của nhà đầu tư: "Tập đoàn Hanshin (Hàn Quốc)" → "Hanshin Việt Nam". */
const investorName = (who) => `${String(who).replace(/^(Tập đoàn|Công ty|Quỹ)\s+/, '').replace(/\s*\(.*\)\s*$/, '').trim() || 'Đầu tư'} Việt Nam`;
/**
 * Thị trưởng ký hợp đồng với nhà đầu tư (council.signDeal): nhà đầu tư lập công ty có vốn ngoài, xây 2–5 nhà máy trên khu công nghiệp
 * đã quy hoạch (giấy phép = hợp đồng đã ký). Ưu đãi thuế chỉ cho nhà máy của họ. Chờ quá 25 ngày không có đất thì rút vốn, hợp đồng chấm dứt.
 */
export function investorFound(c, d) {
  if (!c.corp || c.corp.off) return null;
  const n = clamp(2 + Math.round((d.invest || 0) / 50000), 2, 5), cash = feeOf(n) + CORP.reserve * MK * 2;
  if (!worldCan(c, cash)) return null;
  const ceo = CEO_KEYS[(hash2(c.day, String(d.who).length, 41) * CEO_KEYS.length) | 0];
  const q = makeCorp(c, uniqueName(c, [investorName(d.who)]), ceo, null, 0, cash);
  world(c, 'invest', cash); // vốn từ nước ngoài vào quỹ công ty (sổ cái: thế giới → thành phố)
  q.foreign = String(d.who).replace(/[<>]/g, '').slice(0, 60); q.inv = { n, until: c.day + CORP.invDays, warned: 0 };
  if (d.breakPct > 0) q.brk = { pct: clamp(d.breakPct | 0, 0, 100), until: d.until };
  d.corp = q.id;
  corpLog(c, q, 'founded', { n: 0, sector: null, cash: Math.round(cash), parent: q.foreign });
  q.ev = news(c, `🌏 ${q.foreign} lập ${corpTitle(q)}, vốn ${vnd(cash)}: sẽ xây ${n} nhà máy trên khu công nghiệp thành phố đã quy hoạch`, { corp: q.id, cause: d.ev });
  rebuildGroups(c);
  investorBuild(c, q);
  return q;
}
/** Mỗi ngày: công ty nhà đầu tư tìm ô khu công nghiệp đã quy hoạch để khởi công; quá hạn không có đất thì rút vốn. */
function investorBuild(c, q) {
  const I = q.inv;
  if (!I) return;
  const sites = zonedSites(c, q, I.n);
  if (sites.length && powerOk(c)) {
    const r = corpAct(c, q, { type: 'build', cells: sites, approved: true });
    if (r.ok) {
      I.n -= r.n;
      news(c, `🏗️ ${corpTitle(q)} khởi công ${r.n} nhà máy ở ${placeName(c, sites[0])}`, { corp: q.id, cell: sites[0], cause: q.ev });
      if (I.n <= 0) delete q.inv;
      return;
    }
  }
  if (!I.warned) { I.warned = 1; news(c, `⏳ ${corpTitle(q)} chờ đất: thành phố chưa có ô khu công nghiệp trống có đường, điện nước${powerOk(c) ? '' : ' (lưới điện đã đầy)'}. Quy hoạch khu công nghiệp trong ${I.until - c.day} ngày, không nhà đầu tư sẽ rút vốn`, { corp: q.id, cause: q.ev }); }
  if (c.day < I.until) return;
  delete q.inv;
  if (q.cells.length) return; // đã xây được một phần: ở lại với số nhà máy đã có
  world(c, 'invest', -q.cash); q.cash = 0; // rút vốn về nước
  if (c.council) for (const d of c.council.deals) if (d.corp === q.id && d.until >= c.day) d.until = c.day - 1; // hợp đồng (và ưu đãi thuế) chấm dứt
  q.brk = null; corpLog(c, q, 'withdraw', {});
  news(c, `🚪 ${q.foreign || corpTitle(q)} rút vốn: chờ ${CORP.invDays} ngày không có đất khu công nghiệp. Hợp đồng ưu đãi chấm dứt`, { corp: q.id, cause: q.ev });
}

/**
 * Doanh nghiệp liên quan tới một tình huống khó xử (council.js): ô và công ty thật, để tình huống và hậu quả gắn đúng chỗ.
 * Trả { cell, corp, name } hoặc null.
 */
export function actorOf(c, cell) {
  if (!(cell >= 0) || !c.level[cell]) return null;
  const q = c.owner && c.owner[cell] ? corpById(c, c.owner[cell]) : null;
  return { cell, corp: q ? q.id : 0, name: q ? corpTitle(q) : `${bizName(c, cell)} ở ${placeName(c, cell)}`, what: bizName(c, cell) };
}
/** Doanh nghiệp trong tình huống trả tiền (phạt, phí, thưởng): từ quỹ công ty, hoặc ví của cơ sở độc lập; trả được bao nhiêu thì trả. */
export function actorPay(c, actor, amount) {
  if (!actor || !(amount > 0)) return 0;
  const q = actor.corp ? corpById(c, actor.corp) : null;
  if (q) { const p = Math.max(0, Math.min(amount, q.cash)); q.cash -= p; return p; }
  if (!c.level[actor.cell]) return 0;
  const p = Math.max(0, Math.min(amount, c.biz.money[actor.cell]));
  c.biz.money[actor.cell] -= p;
  return p;
}
/** Các ô của doanh nghiệp trong tình huống (cả công ty, hoặc một cơ sở). */
export const actorCells = (c, actor) => { const q = actor && actor.corp ? corpById(c, actor.corp) : null; return q ? cellsBuilt(c, q) : actor && c.level[actor.cell] ? [actor.cell] : []; };

function found(c, opt = {}) {
  const C = c.corp, roots = C.list.filter((q) => !q.parent && q.kind !== 'trade').length;
  if (!opt.force && (C.off || c.pp.count < CORP.foundMin || roots >= maxCorps(c) || c.day - C.foundAt < CORP.foundEvery)) return null;
  let seed = -1, bm = opt.force ? 0 : 20 * MK;
  for (let i = 0; i < N * N; i++) if (c.level[i] && !c.owner[i] && ZDEF[c.zone[i]].biz === 'ind' && c.biz.money[i] * (0.5 + signalOf(c, prodOf(c, i))) > bm && (!opt.avoid || prodOf(c, i) !== opt.avoid)) { bm = c.biz.money[i] * (0.5 + signalOf(c, prodOf(c, i))); seed = i; } // ưu tiên ngành đang được giá
  if (seed < 0) return null;
  C.foundAt = c.day;
  const id = C.nextId, ceo = CEO_KEYS[(hash2(id, salt(c), 17) * CEO_KEYS.length) | 0];
  const taken = new Set(C.list.map((q) => q.name));
  let base = BASES[(hash2(id, salt(c) + 9, 3) * BASES.length) | 0];
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
  return q;
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
/**
 * Cổ tức công ty gốc: một phần lãi chảy ra nước ngoài (cổ đông ngoài thành phố, chỉ công ty từ bậc 3), phần còn lại chịu thuế thu nhập
 * (ngân sách thu) rồi chia cho cổ đông trong thành phố: khoảng 35% người lớn (cố định theo id người và công ty), không có ai thì chia đều.
 * Trả về số tiền công ty đã chi (0 nếu chưa có người lớn nào).
 */
export function payDividend(c, q, gross) {
  const pp = c.pp;
  if (!pp || !(gross > 0)) return 0;
  const holders = [], all = [];
  for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.age[id] >= 18) { all.push(id); if (hash2(id, q.id, 83) < CORP.divHolders) holders.push(id); }
  if (!all.length) return 0;
  const leak = q.stage >= CORP.divLeakStage ? gross * CORP.divLeak : 0, tax = (gross - leak) * (c.tax.r / 100), net = gross - leak - tax, who = holders.length ? holders : all;
  for (const id of who) pp.money[id] += net / who.length;
  inner(c, 'dividend', net);
  if (tax > 0) c.hourInc.r += tax; // thuế thu nhập từ cổ tức: ngân sách nhận khi chốt giờ (đã nằm trong tổng tiền)
  if (leak > 0) world(c, 'dividend', -leak);
  return gross;
}
/** Chia lãi dư: công ty con chuyển lên công ty mẹ (nội bộ nhóm), công ty gốc chia cổ tức (payDividend). */
function payout(c, q) {
  // giữ lại đủ vốn cho dự án kế tiếp (CEO càng liều càng giữ nhiều để lớn nhanh); trước đây chỉ giữ 3 ô nên quỹ không bao giờ đủ xin dự án 4–5 ô
  const ceo = CEOS[q.ceo], n = Math.min(5, 2 + q.stage), grow = q.cells.length < capCells(q) ? projNeed(termsFor(c, q), n, c) * (1 + ceo.risk * 0.5) : 0;
  const chest = Math.max((CORP.cellFee * 3 + CORP.reserve) * MK, grow), over = q.cash - chest;
  if (!(over > 0) || q.debt > 0) return;
  const d = over * ceo.payout * 0.5;
  if (!(d > 1)) return;
  if (q.partners) { const ps = q.partners.map((x) => corpById(c, x)).filter(Boolean); if (ps.length) { q.cash -= d; for (const p of ps) p.cash += d / ps.length; return; } }
  const mom = q.parent ? corpById(c, q.parent) : null;
  if (mom) { q.cash -= d; mom.cash += d; return; }
  if (payDividend(c, q, d)) q.cash -= d;
}

/** Bật / tắt đẩy xuất khẩu theo tồn kho thành phẩm ở các nhà máy của công ty. */
function exportCheck(c, q) {
  const l = cellsBuilt(c, q).filter((i) => ZDEF[c.zone[i]].biz === 'ind' && !(c.ware && c.ware[i]));
  if (!l.length) return;
  const avg = l.reduce((s, i) => s + c.biz.sout[i], 0) / l.length;
  if (c.day < (q.xAt || 0)) return; // đổi cờ xong thì giữ ít nhất 6 ngày, đỡ bật tắt liên tục
  const hot = signalOf(c, corpSector(c, q)) >= CORP.hotPrice; // giá thế giới đang cao: xuất sớm hơn
  if (!q.export && avg >= (hot ? CORP.expOn * 0.6 : CORP.expOn)) { q.xAt = c.day + 6; q.export = 1; corpLog(c, q, 'exportOn', { stock: Math.round(avg) }); }
  else if (q.export && avg < CORP.expOff) { q.xAt = c.day + 6; q.export = 0; corpLog(c, q, 'exportOff', { stock: Math.round(avg) }); }
}

function daily(c) {
  const C = c.corp;
  for (const q of C.list) {
    // ô bị dỡ / phá sản / quy hoạch lại thì rời công ty; ô xây dở quá lâu thì bỏ
    q.cells = q.cells.filter(([i, d]) => { const ok = built(c, i) ? c.owner[i] === q.id : fitsZone(q, c.zone[i], (q.wares || []).includes(i)) && c.owner[i] === q.id && c.day - d <= CORP.pendDays; if (!ok && c.owner[i] === q.id) c.owner[i] = 0; return ok; });
    if (q.parent && !corpById(c, q.parent)) q.parent = 0; // mẹ đã giải thể: công ty con thành độc lập
    q.wares = (q.wares || []).filter((i) => q.cells.some(([k]) => k === i));
  }
  rebuildGroups(c);
  priceDay(c); marketScan(c); hubScan(c);
  for (const q of C.list) {
    const st = stageOf(c, q);
    if (st !== q.stage) { corpLog(c, q, 'stage', { from: q.stage, to: st }); if (st > q.stage) news(c, `📈 ${corpTitle({ ...q, stage: st })} lên bậc "${STAGES[st]}"`); q.stage = st; }
    q.sector = corpSector(c, q) || q.sector;
    evalDeals(c, q);
    if (q.inv) investorBuild(c, q);
    if (q.cells.length) { q.low = effOf(c, q) < lowEff(c) ? (q.low || 0) + 1 : 0; taxReact(c, q); debtDay(c, q); markupCheck(c, q); exportCheck(c, q); payCheck(c, q); watch(c, q); ceoDecide(c, q); payout(c, q); }
    if (c.day % 14 === 0) corpLog(c, q, 'season', { jobs: jobsOf(c, q), cells: cellsBuilt(c, q).length, intern: Math.round(q.intern), xunits: Math.round(q.xunits) });
    if (q.goal && jobsOf(c, q) >= q.goal.jobs) { corpLog(c, q, 'goal', { jobs: q.goal.jobs }); q.goal = { jobs: Math.round(q.goal.jobs * 1.8) }; }
  }
  for (const q of C.list) if (!q.parent && q.cells.length) q.lastShare = jobShare(c, q.id); // để biết cú sốc nếu nhóm này sụp
  // công ty hết ô: giải thể (liên doanh trả vốn cho các bên), quỹ còn lại chia cho dân; nhóm lớn sụp thì cả thành phố chịu cú sốc
  for (const q of [...C.list]) if (!q.cells.length && !q.inv) { // nhà đầu tư đang chờ đất thì chưa giải thể
    const ps = q.partners ? q.partners.map((x) => corpById(c, x)).filter(Boolean) : [];
    if (ps.length && q.cash > 0) { for (const p of ps) p.cash += q.cash / ps.length; q.cash = 0; }
    if (q.debt > 0) { corpLog(c, q, 'default', { debt: Math.round(q.debt) }); q.debt = 0; }
    if (!q.parent && q.lastShare >= 0.05 && c.council && !subsOf(c, q).some((s) => s.cells.length)) { shock(c, q); } // các công ty con còn sống (thành độc lập) thì nhóm chưa sụp
    if (q.cash > 0) q.cash -= toResidents(c, q.cash);
    if (q.cash > 0 && !(c.pp && c.pp.count)) { world(c, 'dividend', -q.cash); q.cash = 0; } // chưa có dân: chủ ở ngoài thành phố
    if (q.cash < 0) { world(c, 'dividend', -q.cash); q.cash = 0; } // phòng hờ: quỹ âm thì bù từ bên ngoài, sổ không lệch khi xoá công ty
    if (q.cash <= 0) { news(c, `🏚️ ${corpTitle(q)} đã giải thể`); C.list = C.list.filter((x) => x !== q); C.asks = C.asks.filter((a) => a.corp !== q.id); }
  }
  for (const a of [...C.asks]) if (c.day >= a.expires) { const q = corpById(c, a.corp); if (q) { q.cool.ask = c.day + CORP.askCool; corpLog(c, q, 'askExpired', {}); } C.asks = C.asks.filter((x) => x !== a); }
  found(c); foundTrade(c);
  rebuildGroups(c);
}


/** Gọi mỗi giờ game. Cuối ngày (23h) quét lợi nhuận về quỹ; 6h sáng công ty ra quyết định. */
export function corpHour(c) {
  const C = cur(c);
  if (!C || C.off) return;
  const h = c.hour % 24;
  if (h === 23) for (const q of C.list) for (const [i] of q.cells) {
    if (!built(c, i)) continue;
    // vốn lưu động: cơ sở đang âm tiền (mới xây chưa có vốn, chờ nguyên liệu mà vẫn trả lương) được công ty bù từ quỹ, giữ lại mức dự phòng.
    // Trước đây công ty chỉ hút lãi lên mà không bao giờ bù lỗ, nên gần hết nhà máy của tập đoàn âm tiền tới sát ngưỡng phá sản.
    if (c.biz.money[i] < 0) { const d = Math.min(-c.biz.money[i], q.cash - CORP.reserve * MK); if (d > 0) { q.cash -= d; c.biz.money[i] += d; } continue; }
    const ex = c.biz.money[i] - CORP.sweepFrom * MK;
    if (ex > 0) { const d = ex * CORP.sweepRate; c.biz.money[i] -= d; q.cash += d; }
  }
  for (const q of C.list) if (q.pend) settle(c, q);
  if (h === 6) daily(c);
}
/** Tiền đang nằm trong quỹ các công ty (cộng vào tổng tiền để sổ cái khớp). */
export const corpCash = (c) => (c.corp ? c.corp.list.reduce((s, q) => s + q.cash, 0) : 0);

// ───────────────────────── Phase 3: thị trường, mua bán sáp nhập, liên doanh, vay, khủng hoảng ─────────────────────────

const prodOf = (c, i) => productAt(i, c.zone[i] === 21 ? 21 : 3);
const valueOf = (c, i) => CORP.cellFee * MK * c.level[i] * 0.7 + Math.max(0, c.biz.money[i]);

/** Quét thị trường mỗi ngày: số nhà máy theo sản phẩm (tot), của từng nhóm (by), việc làm của từng nhóm (gj). */
export function marketScan(c) {
  const tot = {}, by = {}, gj = {};
  let jobs = 0;
  for (let i = 0; i < N * N; i++) {
    if (!c.level[i]) continue;
    const jc = jobCap(c.zone[i], c.level[i]), g = c.owner[i] && c.corpGroup ? c.corpGroup[c.owner[i]] | 0 : 0;
    jobs += jc;
    if (g) gj[g] = (gj[g] || 0) + jc;
    if (ZDEF[c.zone[i]].biz === 'ind' && !(c.ware && c.ware[i])) { const p = prodOf(c, i); tot[p] = (tot[p] || 0) + 1; if (g) { by[g] = by[g] || {}; by[g][p] = (by[g][p] || 0) + 1; } }
    else if (ZDEF[c.zone[i]].biz === 'shop') { tot.retail = (tot.retail || 0) + 1; if (g) { by[g] = by[g] || {}; by[g].retail = (by[g].retail || 0) + 1; } } // thị phần bán lẻ
  }
  c.corp.mkt = { tot, by, gj, jobs };
  return c.corp.mkt;
}
const mkt = (c) => c.corp.mkt || marketScan(c);
/** Thị phần của một nhóm (id công ty gốc) theo một sản phẩm, 0..1. */
export const marketShare = (c, root, p) => { const m = mkt(c); return m.tot[p] ? ((m.by[root] && m.by[root][p]) || 0) / m.tot[p] : 0; };
/** Tỷ trọng việc làm của cả nhóm trong thành phố, 0..1. */
export const jobShare = (c, root) => { const m = mkt(c); return m.jobs ? (m.gj[root] || 0) / m.jobs : 0; };
/** Sản phẩm mà nhóm đang độc quyền (≥ 4 nhà máy và ≥ 60% số nhà máy cùng sản phẩm), hoặc null. */
export function monopolyOf(c, root) {
  const m = mkt(c), by = m.by[root] || {};
  for (const p in by) if (by[p] >= 4 && m.tot[p] && by[p] / m.tot[p] >= CORP.monoShare) return p;
  return null;
}
/** Mua thêm các ô này thì nhóm có vượt ngưỡng độc quyền không (luật chống độc quyền của thành phố). */
function monopolizes(c, root, cells) {
  const m = mkt(c), n = {};
  for (const i of cells) { const bz = ZDEF[c.zone[i]].biz; if (bz !== 'ind' && bz !== 'shop') continue; const p = bz === 'shop' ? 'retail' : prodOf(c, i); n[p] = (n[p] || 0) + 1; }
  for (const p in n) { const mine = ((m.by[root] && m.by[root][p]) || 0) + n[p]; if (mine >= 4 && m.tot[p] && mine / m.tot[p] > CORP.monoShare) return true; }
  return false;
}

/** Thương vụ khả thi: đối thủ đang khó (mua nửa giá trị tài sản, thành công ty con) hoặc xưởng độc lập gần cụm (trừ khi đang được bảo hộ). */
function acquirePlan(c, q) {
  if (q.stage < 2 || q.partners || c.day < (q.cool.acq || 0)) return null;
  const root = rootOf(c, q.id);
  let best = null;
  for (const r of c.corp.list) {
    if (q.parent) break; // chỉ công ty gốc mới mua lại đối thủ (công ty con chỉ mua xưởng / cửa hàng lẻ)
    if (r.id === q.id || r.id === root || r.parent || r.partners || (r.kind || 'ind') !== (q.kind || 'ind')) continue; // chỉ mua lại đối thủ cùng loại
    if (subsOf(c, q).length + 1 + subsOf(c, r).length > CORP.maxSubs + 1) continue; // nhóm không quá 3 công ty con (+ 1 công ty con thương mại)
    const bl = cellsBuilt(c, r);
    if (!bl.length || !(r.cash < CORP.reserve * MK * 0.5 || effOf(c, r) < lowEff(c))) continue;
    const price = Math.round(bl.reduce((s, i) => s + valueOf(c, i), 0) * 0.5);
    if (q.cash < price + CORP.reserve * MK || monopolizes(c, root, bl)) continue;
    if (!best || price < best.price) best = { corp: r.id, price, cells: bl.length };
  }
  if (best) return best;
  if ((c.corp.sme ?? -1) >= c.day) return null; // doanh nghiệp nhỏ đang được thành phố bảo hộ
  const centre = centreOf(c, q);
  if (!centre) return null;
  const trade = q.kind === 'trade';
  const retail = q.stage >= CORP.retailMin && !q.parent && cellsBuilt(c, q).filter((i) => ZDEF[c.zone[i]].biz === 'ind').length >= 2; // chuỗi bán lẻ: tập đoàn lớn mua cửa hàng để bán hàng của chính mình
  let pick = -1, pd = retail || trade ? 14 : 10;
  for (let i = 0; i < N * N; i++) {
    if (!c.level[i] || c.owner[i]) continue;
    const kind = ZDEF[c.zone[i]].biz;
    if (trade ? kind !== 'shop' : kind !== 'ind' && !(retail && kind === 'shop')) continue;
    const d = Math.hypot((i % N) - centre.x, ((i / N) | 0) - centre.y);
    if (d < pd) { pd = d; pick = i; }
  }
  if (pick < 0) return null;
  const price = Math.round(valueOf(c, pick));
  if (q.cash < price + CORP.reserve * MK || monopolizes(c, root, [pick])) return null;
  return { cell: pick, price };
}

/** Liên doanh: một công ty gốc khác đủ vốn và (tuỳ tính cách, quan hệ) chịu góp nửa vốn một dự án 2 ô. */
function jvPlan(c, q) {
  if (q.parent || q.partners || c.corp.asks.length || c.day < q.cool.ask) return null;
  const n = 2, need = projNeed(termsFor(c, q), n, c);
  if (q.cash < need / 2 + CORP.reserve * MK || !powerOk(c)) return null;
  let best = null;
  for (const r of c.corp.list) {
    if (r.id === q.id || r.parent || r.partners || (r.kind || 'ind') !== (q.kind || 'ind') || !cellsBuilt(c, r).length || r.cash < need / 2 + CORP.reserve * MK) continue; // chỉ liên doanh cùng loại (sản xuất với sản xuất, thương mại với thương mại)
    if (c.corp.list.some((j) => j.partners && j.partners.includes(q.id) && j.partners.includes(r.id))) continue; // mỗi cặp chỉ một liên doanh: muốn lớn thì liên doanh đó tự mở rộng
    if (!(hash2(r.id, c.day, 71) < 0.45 + (1 - CEOS[r.ceo].risk) * 0.25 + r.trust * 0.04)) continue; // đối tác đồng ý hay không
    if (!best || r.cash > best.cash) best = r;
  }
  if (!best) return null;
  const sites = projectSites(c, q, n);
  return sites.length >= n ? { partner: best.id, sites } : null;
}

/** Khoản vay ngân hàng thế giới: 60 MK mỗi nhà máy, một khoản một lúc, chỉ khi thế giới còn tiền cho vay. */
const loanCap = (c, q) => CORP.loanMK * MK * Math.max(2, cellsBuilt(c, q).length);
function loanPlan(c, q) {
  if (!c.ledger || q.debt > 0 || q.cells.length === 0 || c.day < (q.cool.loan || 0)) return 0;
  const L = loanCap(c, q);
  return worldCan(c, L) ? L : 0;
}
/** Mỗi ngày: trả lãi (trả không nổi thì cộng vào gốc), có dư thì trả bớt gốc. Nợ phình quá 2 lần hạn mức thì vỡ nợ: ngân hàng xoá nợ, cấm vay 60 ngày. */
function debtDay(c, q) {
  if (!(q.debt > 0)) return;
  const intr = q.debt * CORP.loanRate;
  if (q.cash >= intr) { q.cash -= intr; world(c, 'corpLoan', -intr); } else q.debt += intr;
  if (q.debt > loanCap(c, q) * 2) {
    corpLog(c, q, 'default', { debt: Math.round(q.debt) }); q.debt = 0; q.cool.loan = c.day + 60; q.trust = clamp(q.trust - 1, -3, 5);
    news(c, `🏦 ${corpTitle(q)} vỡ nợ ngân hàng, bị cấm vay 60 ngày`);
    return;
  }
  const pay = Math.min(q.debt, q.cash - CORP.reserve * MK * 1.5);
  if (pay > 0) { q.cash -= pay; q.debt -= pay; world(c, 'corpLoan', -pay); }
  if (q.debt < 1) { q.debt = 0; corpLog(c, q, 'loanPaid', {}); }
}

/** Cạnh tranh lao động: thiếu người thì tăng lương 15% (hút người làm từ chỗ khác), đủ người hoặc cạn quỹ thì hạ lại. */
function payCheck(c, q) {
  if (c.day < (q.pAt || 0)) return;
  const l = cellsBuilt(c, q);
  if (!l.length) return;
  let st = 0, cap = 0;
  for (const i of l) { st += c.staff[i]; cap += jobCap(c.zone[i], c.level[i]); }
  const fill = cap ? st / cap : 1;
  if ((q.pay || 1) === 1 && fill < 0.6 && q.cash > CORP.reserve * MK * 2) { q.pay = CORP.payUp; q.pAt = c.day + 8; corpLog(c, q, 'payUp', { fill: Math.round(fill * 100) }); }
  else if (q.pay > 1 && (fill > 0.9 || q.cash < CORP.reserve * MK)) { q.pay = 1; q.pAt = c.day + 8; corpLog(c, q, 'payDown', { fill: Math.round(fill * 100) }); }
}

/** Theo dõi rủi ro của nhóm: khủng hoảng, độc quyền, phụ thuộc (ghi nhật ký một lần khi bắt đầu). */
function watch(c, q) {
  const root = rootOf(c, q.id);
  if (q.cash < CORP.reserve * MK * 0.5 && effOf(c, q) < lowEff(c) && c.day - (q.crisisAt ?? -99) >= 10) {
    q.crisisAt = c.day; corpLog(c, q, 'crisis', { cash: Math.round(q.cash), eff: Math.round(effOf(c, q) * 100) });
    news(c, `📉 ${corpTitle(q)} lâm vào khủng hoảng: hết tiền, nhà máy chạy ế`);
  }
  if (q.parent) return;
  const mono = monopolyOf(c, root), sh = jobShare(c, root);
  if (mono && !q.mono) { q.mono = 1; corpLog(c, q, 'monopoly', { product: mono }); news(c, `🧱 ${corpTitle(q)} nắm quá ${Math.round(CORP.monoShare * 100)}% ${PRODUCTS[mono] ? PRODUCTS[mono].name.toLowerCase() : 'bán lẻ'} của thành phố: coi chừng độc quyền (mời đối thủ, bảo hộ doanh nghiệp nhỏ trong 🏢)`); }
  else if (!mono && q.mono) { q.mono = 0; corpLog(c, q, 'monopolyEnd', {}); }
  if (sh >= CORP.depShare && !q.dep) { q.dep = 1; corpLog(c, q, 'dependence', { share: Math.round(sh * 100) }); news(c, `⚠️ ${corpTitle(q)} giữ ${Math.round(sh * 100)}% việc làm của thành phố: nếu sụp, cả thành phố chịu`); }
  else if (sh < CORP.depShare * 0.8 && q.dep) q.dep = 0;
}

/** Nhóm lớn sụp đổ: thành phố mất việc, mất niềm tin một thời gian (dùng hiệu ứng tạm thời của hộp thư thị trưởng). */
function shock(c, q) {
  const k = Math.min(6, Math.max(1, Math.round(q.lastShare * 50)));
  c.council.mods.push({ key: 'happy', v: -k, until: c.day + 20, from: 'corp' }, { key: 'pull', v: -0.05, until: c.day + 20, from: 'corp' });
  corpLog(c, q, 'shock', { share: Math.round(q.lastShare * 100) });
  news(c, `💥 ${corpTitle(q)} sụp đổ, mất ${Math.round(q.lastShare * 100)}% việc làm của thành phố: dân bất an ${k} điểm trong 20 ngày`);
}

/** Công cụ của thị trưởng: bảo hộ doanh nghiệp nhỏ 30 ngày (không bị mua lại, được hỗ trợ vốn). */
export function protectSme(c) {
  const list = [];
  for (let i = 0; i < N * N; i++) if (c.level[i] && !c.owner[i] && ZDEF[c.zone[i]].biz === 'ind') list.push(i);
  const cost = Math.round(150 * MK);
  if ((c.corp.sme ?? -1) >= c.day) return { ok: false, reason: 'Đang trong thời gian bảo hộ' };
  if (!list.length) return { ok: false, reason: 'Không có doanh nghiệp công nghiệp độc lập nào' };
  if (!c.sandbox && c.money < cost) return { ok: false, reason: 'Ngân sách không đủ' };
  c.money -= cost; for (const i of list) c.biz.money[i] += cost / list.length; inner(c, 'corpSme', cost); // hỗ trợ vốn: ngân sách → ví doanh nghiệp (trong thành phố)
  c.corp.sme = c.day + 30;
  news(c, `🛡️ Thành phố bảo hộ ${list.length} doanh nghiệp nhỏ trong 30 ngày: không bị mua lại, được hỗ trợ vốn ${Math.round(cost / list.length)} ₫ mỗi nơi`);
  return { ok: true, n: list.length, cost };
}
/** Công cụ của thị trưởng: mời một đối thủ (công ty mới từ xưởng độc lập, khác sản phẩm của bên đang áp đảo). */
export function inviteRival(c) {
  const roots = c.corp.list.filter((q) => !q.parent).length;
  if (roots >= maxCorps(c) + 2) return { ok: false, reason: 'Thành phố đã có quá nhiều công ty lớn' };
  let top = null, ts = 0;
  for (const q of c.corp.list) if (!q.parent) { const m = monopolyOf(c, q.id), s = jobShare(c, q.id); if (m ? 2 + s > ts : s > ts && !top) { top = m; ts = m ? 2 + s : s; } }
  const q = found(c, { force: true, avoid: top });
  return q ? { ok: true, corp: q } : { ok: false, reason: 'Không còn xưởng độc lập nào để lập công ty' };
}

// ───────────────────────── Phase 4: kinh tế tự vận hành — cụm kinh tế, tín hiệu thị trường ─────────────────────────

/**
 * Cụm kinh tế: các nhà máy / cửa hàng của công ty cách nhau ≤ 2 ô liên thông thành một cụm; từ 6 ô trở lên là một trung tâm,
 * chạy nhanh hơn 10% (đông đúc, chung nhà cung cấp, lao động). Tính mỗi ngày, không lưu (c.hub đánh dấu ô trong cụm).
 */
export function hubScan(c) {
  const N2 = N * N, seen = new Uint8Array(N2), hub = new Uint8Array(N2), hubs = [];
  const own = (i) => c.owner[i] && c.level[i];
  for (let s0 = 0; s0 < N2; s0++) {
    if (seen[s0] || !own(s0)) continue;
    const comp = [s0]; seen[s0] = 1;
    for (let k = 0; k < comp.length; k++) {
      const x = comp[k] % N, y = (comp[k] / N) | 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        const j = Y * N + X;
        if (!seen[j] && own(j)) { seen[j] = 1; comp.push(j); }
      }
    }
    if (comp.length < CORP.hubMin) continue;
    const prod = {}, owners = new Set();
    let jobs = 0, sx = 0, sy = 0;
    for (const i of comp) {
      hub[i] = 1; jobs += jobCap(c.zone[i], c.level[i]); sx += i % N; sy += (i / N) | 0;
      owners.add(c.corpGroup ? c.corpGroup[c.owner[i]] | 0 : c.owner[i]);
      if (ZDEF[c.zone[i]].biz === 'ind' && !(c.ware && c.ware[i])) { const p = prodOf(c, i); prod[p] = (prod[p] || 0) + 1; }
    }
    const top = Object.keys(prod).sort((a, b) => prod[b] - prod[a])[0] || null;
    hubs.push({ n: comp.length, jobs, x: Math.round(sx / comp.length), y: Math.round(sy / comp.length), owners: owners.size, sector: top, key: `${top}:${Math.round(sx / comp.length / 8)}:${Math.round(sy / comp.length / 8)}` });
  }
  const prev = c.corp.hubs;
  if (prev) for (const h of hubs) if (!prev.some((p) => p.key === h.key)) news(c, `🏭 Hình thành cụm kinh tế ${h.sector ? PRODUCTS[h.sector].name.toLowerCase() : 'hỗn hợp'}: ${h.n} cơ sở của ${h.owners} nhóm, ${h.jobs} việc làm (chạy nhanh hơn 10%)`);
  c.hub = hub; c.corp.hubs = hubs;
  return hubs;
}
/** Bảng tín hiệu: giá thế giới từng thành phẩm và số nhà máy trong thành phố (để thấy vốn đi theo giá). */
export function signals(c) {
  const m = mkt(c);
  return Object.keys(PRODUCTS).map((p) => ({ p, price: signalOf(c, p), plants: m.tot[p] || 0, dp: (c.corp.dp && c.corp.dp[p]) || 1 }));
}

// ───────────────────────── Phase 5: kho bãi, giá nội địa theo cung cầu ─────────────────────────

/** Chỗ xây kho: nhóm có ≥ 4 nhà máy, chưa đủ 3 kho, hàng đang ứ (tồn trung bình ≥ 14) hoặc đang xuất; trả ô đất cạnh cụm, hoặc -1. */
function warehousePlan(c, q) {
  if (q.parent || q.stage < 2 || !powerOk(c) || q.cells.length >= capCells(q)) return -1;
  const root = rootOf(c, q.id), ids = c.corp.list.filter((x) => rootOf(c, x.id) === root);
  const wares = ids.reduce((s, x) => s + (x.wares || []).length, 0);
  if (wares >= CORP.wareMax) return -1;
  const fac = ids.flatMap((x) => cellsBuilt(c, x)).filter((i) => ZDEF[c.zone[i]].biz === 'ind' && !(c.ware && c.ware[i]));
  if (fac.length < 4 + wares * 3) return -1; // mỗi kho thêm cần thêm 3 nhà máy
  const avg = fac.reduce((s, i) => s + c.biz.sout[i], 0) / fac.length;
  if (avg < 14 && !q.export) return -1; // hàng đang ứ, hoặc đang đẩy xuất khẩu
  if (q.cash < feeOf(1) * 1.2 + CORP.reserve * MK) return -1;
  return expandSite(c, q);
}

/** Phí lưu kho: công ty trả cho kho (từ quỹ công ty sang ví kho: chuyển nội bộ, chịu thuế như doanh thu dịch vụ), để kho trả lương. */
export function corpPayWare(c, i, fee) {
  const q = corpById(c, c.owner[i]);
  if (!q || !(fee > 0)) return;
  const pay = Math.min(fee, Math.max(0, q.cash));
  if (!(pay > 0)) return;
  q.cash -= pay; c.fn.saleIncome(c, i, pay, 'i'); inner(c, 'logistics', pay);
}

/** Dòng hàng thật nhập / xuất (people.js báo) để tính cung cầu nội địa. */
export function corpFlow(c, kind, dir, qty) {
  const f = c.corp && c.corp.flow;
  if (!f) return;
  (f[kind] || (f[kind] = { imp: 0, exp: 0 }))[dir] += qty;
}
/** Chỉ số giá nội địa mỗi ngày: thiếu hàng phải nhập nhiều thì giá lên, thừa phải xuất thì giá xuống, kéo dần về 1. */
function priceDay(c) {
  const C = c.corp;
  for (const k of [...RAW_KINDS, ...PRODUCT_KINDS]) {
    const f = C.flow[k] || { imp: 0, exp: 0 }, scarcity = (f.imp - f.exp) / (f.imp + f.exp + 16);
    C.dp[k] = clamp(C.dp[k] + scarcity * 0.06 + (1 - C.dp[k]) * 0.08, CORP.dpMin, CORP.dpMax);
  }
  C.flow = {};
}
/** Hệ số giá hàng giao trong thành phố: chỉ số cung cầu của loại hàng × hệ số bán của công ty bán (độc quyền thì đẩy giá). */
export function corpPrice(c, kind, from) {
  const dp = (c.corp && c.corp.dp && c.corp.dp[kind]) || 1, mk = from != null && c.owner && c.corpMark ? c.corpMark[c.owner[from]] || 1 : 1;
  return clamp(dp * mk, CORP.dpMin * CORP.mkMin, CORP.priceMax);
}
/** Mỗi ngày CEO chỉnh hệ số bán: hàng ứ thì hạ giá giành khách, hàng cạn thì nâng, độc quyền thì tăng thêm. */
function markupCheck(c, q) {
  const trade = q.kind === 'trade'; // thương mại: nhìn hàng trên kệ (sin); sản xuất: nhìn thành phẩm chờ xuất (sout)
  const l = cellsBuilt(c, q).filter((i) => ZDEF[c.zone[i]].biz === (trade ? 'shop' : 'ind') && !(c.ware && c.ware[i]));
  if (!l.length) return;
  const arr = trade ? c.biz.sin : c.biz.sout, avg = l.reduce((s, i) => s + arr[i], 0) / l.length;
  let mk = q.markup || 1;
  if (avg >= (trade ? 25 : 30)) mk -= 0.03; else if (avg < (trade ? 6 : 8)) mk += 0.02; else mk += (1 - mk) * 0.1;
  if (q.mono) mk += 0.04;
  q.markup = clamp(mk, CORP.mkMin, CORP.mkMax);
}

// ───────────────────────── công ty thương mại (bán lẻ) ─────────────────────────

/**
 * Lập công ty thương mại từ các cửa hàng độc lập (khu 2, 5, 7) gần nhau, giống cách lập công ty sản xuất: lấy tối đa 4 cửa hàng,
 * chuyển nửa tiền trong ví các cửa hàng làm vốn. Công ty tự mở thêm cửa hàng gần khách, mua lại cửa hàng độc lập, chỉnh giá bán lẻ.
 */
function foundTrade(c) {
  const C = c.corp, trades = C.list.filter((q) => q.kind === 'trade' && !q.parent).length;
  if (C.off || c.pp.count < CORP.foundMin || trades >= clamp(1 + Math.floor(c.pp.count / 1500), 1, 3) || c.day - (C.foundTradeAt ?? -99) < CORP.foundEvery * 2) return null;
  let seed = -1, bm = 5 * MK;
  for (let i = 0; i < N * N; i++) if (c.level[i] && !c.owner[i] && ZDEF[c.zone[i]].biz === 'shop' && c.biz.money[i] > bm) { bm = c.biz.money[i]; seed = i; }
  if (seed < 0) return null;
  const sx = seed % N, sy = (seed / N) | 0, near3 = [];
  for (let i = 0; i < N * N && near3.length < 4; i++) if (c.level[i] && !c.owner[i] && ZDEF[c.zone[i]].biz === 'shop' && Math.hypot((i % N) - sx, ((i / N) | 0) - sy) <= 6) near3.push(i);
  if (near3.length < 3) return null; // cần ít nhất 3 cửa hàng gần nhau
  C.foundTradeAt = c.day;
  const id = C.nextId, ceo = CEO_KEYS[(hash2(id, salt(c) + 7, 29) * CEO_KEYS.length) | 0], taken = new Set(C.list.map((q) => q.name));
  let base = BASES[(hash2(id, salt(c) + 11, 5) * BASES.length) | 0];
  for (let k = 0; (taken.has(base) || taken.has(`${base} Thương mại`)) && k < BASES.length; k++) base = BASES[(BASES.indexOf(base) + 1) % BASES.length];
  const q = makeCorp(c, `${base} Thương mại`, ceo, null, 0, 0, 'trade');
  for (const i of near3) claim(c, q, i);
  for (const [i] of q.cells) { const m = Math.max(0, c.biz.money[i]) * 0.5; c.biz.money[i] -= m; q.cash += m; } // vốn: chuyển từ ví cửa hàng (không tạo tiền)
  q.stage = stageOf(c, q);
  corpLog(c, q, 'founded', { n: q.cells.length, sector: null, cash: Math.round(q.cash), trade: 1 });
  news(c, `🛒 ${corpTitle(q)} thành lập, gom ${q.cells.length} cửa hàng thành chuỗi bán lẻ`);
  return q;
}
/** Công ty con thương mại của một tập đoàn sản xuất (như "Đại Việt Retail"): có thì dùng, chưa có thì lập (vốn 0, nhận lãi sau). */
function tradeChild(c, q) {
  let kid = subsOf(c, q).find((x) => x.kind === 'trade');
  if (kid) return kid;
  kid = makeCorp(c, uniqueName(c, [`${q.name} Thương mại`, `${q.name} Bán lẻ`, `${q.name} Phân phối`]), q.ceo, null, q.id, 0, 'trade');
  kid.cool.acq = c.day + CORP.acqCool; rebuildGroups(c);
  corpLog(c, q, 'subsidiary', { name: kid.name, n: 0, cash: 0 });
  corpLog(c, kid, 'founded', { n: 0, sector: null, cash: 0, parent: q.name, trade: 1 });
  news(c, `🛒 ${corpTitle(q)} lập ${corpTitle(kid)} để bán hàng của nhóm`);
  return kid;
}

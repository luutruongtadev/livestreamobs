// Phố Mới — chuỗi sự kiện có nhân quả (biên niên thành phố). Mọi sự kiện ở đây do game phát hiện từ số liệu thật, mỗi sự kiện
// ghi lại nguyên nhân (id sự kiện trước nó) để người chơi lần ngược được "vì sao". LLM không thêm được dòng nào vào biên niên.
//   - Biên niên: chron(c, kind, text, { cell, corp, cause }) → id; giữ ~240 sự kiện gần nhất, lưu cùng bản lưu.
//   - Mất việc → thất nghiệp quanh đó tăng → hàng quán vắng khách → nhà bỏ trống, giá thuê hạ → doanh nghiệp mới mở trên mặt bằng rẻ.
//   - Đứt cung ứng: nhà cung cấp đóng cửa thì các cơ sở mua hàng của nó phải nhập ngoài; cơ sở nào đổ theo thì ghi tiếp.
//   - Thiếu nhà ở công nhân quanh cụm nhà máy, tranh đất công nghiệp (phí đất lên), giá thuê theo nhà trống từng khu, bản sắc kinh tế.
import { N, ZDEF, PRODUCTS, RAW, jobCap, resCap, productAt, clamp } from './base.js';
import { corpById, corpTitle } from './corp.js';

export const CHAIN = {
  max: 240, // số sự kiện giữ trong biên niên
  layoffMin: 12, // mất từ 12 chỗ làm một lúc thì theo dõi hậu quả quanh đó
  r: 7, watchDays: 12, maxWatch: 8, // bán kính khu theo dõi (ô), số ngày chờ mỗi nấc, số khu theo dõi cùng lúc
  joblessUp: 5, revDrop: 0.15, vacUp: 0.05, // ngưỡng: thêm 5 người thất nghiệp; doanh thu hàng quán giảm 15%; nhà trống tăng 5 điểm %
  rentLo: 0.82, rentHi: 1.15, rentR: 4, rentMinCap: 40, // giá thuê theo nhà trống của khu so với cả thành phố
  houseR: 8, houseJobs: 60, houseCool: 30, // nhà ở công nhân quanh cụm nhà máy
  landCool: 20, landKmax: 1.75, // tranh đất công nghiệp: phí đất tối đa ×1.75
  idHold: 5, // bản sắc kinh tế mới phải giữ 5 ngày mới tính là đổi
  dumpPol: 0.55, haltDays: 15, // nhà máy được cho xả thải: mức ô nhiễm nước; đình chỉ nhà máy: số ngày
};

const cur = (c) => c.chain || null;

/** Thêm một dòng biên niên (và một thông báo trên màn hình, trừ khi toast: false). Trả id sự kiện. */
export function chron(c, kind, text, o = {}) {
  if (o.toast !== false && c.events) c.events.push({ type: 'council', text });
  const C = cur(c);
  if (!C) return 0;
  const e = { id: C.next++, day: c.day, kind, text: String(text).replace(/[<>]/g, '').slice(0, 260) };
  if (o.cell >= 0) e.cell = o.cell;
  if (o.corp) e.corp = o.corp;
  if (o.cause) e.cause = o.cause;
  C.log.push(e);
  if (C.log.length > CHAIN.max) C.log.splice(0, C.log.length - CHAIN.max);
  return e.id;
}
export const chronById = (c, id) => (c.chain && id ? c.chain.log.find((e) => e.id === id) : undefined);
/** Các nguyên nhân của một sự kiện, gần nhất trước (dừng khi nguyên nhân đã trôi khỏi biên niên). */
export function causeChain(c, id, n = 6) {
  const out = [];
  let e = chronById(c, id);
  while (e && e.cause && out.length < n) { e = chronById(c, e.cause); if (e) out.push(e); }
  return out;
}
/** Các hệ quả trực tiếp của một sự kiện. */
export const effectsOf = (c, id) => (c.chain ? c.chain.log.filter((e) => e.cause === id) : []);

// ───────────────────────── tên chỗ, tên cơ sở ─────────────────────────

/** Tên khu: tên quận nếu có quận, không thì hướng so với giữa bản đồ. */
export function placeName(c, i) {
  if (c.dist && c.dist.on && c.dmap && c.dmap[i] < c.dist.list.length) return c.dist.list[c.dmap[i]].name;
  const x = (i % N) / N - 0.5, y = ((i / N) | 0) / N - 0.5;
  if (Math.hypot(x, y) < 0.12) return 'trung tâm thành phố';
  const a = Math.atan2(-y, x), k = Math.round(a / (Math.PI / 4)), dirs = ['phía đông', 'phía đông bắc', 'phía bắc', 'phía tây bắc', 'phía tây', 'phía tây nam', 'phía nam', 'phía đông nam'];
  return `${dirs[(k + 8) % 8]} thành phố`;
}
/** Loại cơ sở ở ô i: "nhà máy thép", "mỏ", "cửa hàng"… */
export function bizName(c, i) {
  const z = ZDEF[c.zone[i]];
  if (!z) return 'cơ sở';
  if (c.ware && c.ware[i]) return 'kho bãi';
  if (z.biz === 'ind') { const p = PRODUCTS[productAt(i, c.zone[i] === 21 ? 21 : 3)]; return `${c.zone[i] === 21 ? 'xưởng' : 'nhà máy'}${p ? ' ' + p.name.toLowerCase() : ''}`; }
  if (z.biz === 'res') return (z.short || z.name).toLowerCase();
  return { shop: 'cửa hàng', market: 'chợ', office: 'văn phòng', leisure: 'quán ăn, chỗ giải trí' }[z.biz] || 'cơ sở';
}
/** "Công ty Đại Việt (nhà máy thép)" hoặc "một nhà máy thép độc lập ở phía bắc thành phố". */
export function whoAt(c, i) {
  const q = c.owner && c.owner[i] ? corpById(c, c.owner[i]) : null;
  return q ? `${corpTitle(q)} (${bizName(c, i)})` : `một ${bizName(c, i)} độc lập ở ${placeName(c, i)}`;
}

// ───────────────────────── khởi tạo, lưu ─────────────────────────

export function initChain(c, o = {}) {
  const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  const cell = (v) => (Number.isInteger(v) && v >= 0 && v < N * N ? v : -1);
  const txt = (v) => String(v ?? '').replace(/[<>]/g, '').slice(0, 260);
  const log = (Array.isArray(o.log) ? o.log : []).filter((e) => e && Number.isInteger(e.id)).slice(-CHAIN.max).map((e) => {
    const r = { id: e.id, day: num(e.day) | 0, kind: txt(e.kind).slice(0, 16), text: txt(e.text) };
    if (cell(e.cell) >= 0) r.cell = e.cell;
    if (Number.isInteger(e.corp)) r.corp = e.corp;
    if (Number.isInteger(e.cause)) r.cause = e.cause;
    return r;
  });
  const next = Math.max(num(o.next, 1) | 0, ...log.map((e) => e.id + 1), 1);
  const watch = (Array.isArray(o.watch) ? o.watch : []).filter((w) => w && cell(w.cell) >= 0 && Number.isInteger(w.ev)).slice(-CHAIN.maxWatch).map((w) => ({
    kind: w.kind === 'supply' ? 'supply' : 'layoff', cell: w.cell, ev: w.ev, stage: clamp(num(w.stage) | 0, 0, 3), until: num(w.until) | 0, jobs: num(w.jobs) | 0,
    base: w.base && typeof w.base === 'object' ? { jobless: num(w.base.jobless), rev: num(w.base.rev), vac: num(w.base.vac) } : null,
    seen: Array.isArray(w.seen) ? w.seen.map(cell).filter((v) => v >= 0).slice(0, 400) : [], buyers: Array.isArray(w.buyers) ? w.buyers.map(cell).filter((v) => v >= 0).slice(0, 60) : [],
  }));
  const until = (l) => (Array.isArray(l) ? l : []).filter((d) => d && cell(d.cell) >= 0).slice(0, 40).map((d) => ({ cell: d.cell, until: num(d.until) | 0, ev: Number.isInteger(d.ev) ? d.ev : 0 }));
  const id = o.id && typeof o.id === 'object' ? { key: txt(o.id.key).slice(0, 40), name: txt(o.id.name).slice(0, 80), since: num(o.id.since) | 0, cand: txt(o.id.cand).slice(0, 40), candAt: num(o.id.candAt) | 0 } : null;
  c.chain = {
    next, log, watch, id,
    idHist: (Array.isArray(o.idHist) ? o.idHist : []).slice(-20).map((h) => ({ day: num(h.day) | 0, key: txt(h.key).slice(0, 40), name: txt(h.name).slice(0, 80) })),
    tax: o.tax && typeof o.tax === 'object' ? { r: num(o.tax.r, c.tax.r), c: num(o.tax.c, c.tax.c), i: num(o.tax.i, c.tax.i) } : { ...c.tax },
    taxEv: Number.isInteger(o.taxEv) ? o.taxEv : 0, taxAt: num(o.taxAt, -99) | 0,
    house: o.house && typeof o.house === 'object' ? Object.fromEntries(Object.entries(o.house).filter(([k, v]) => /^\d{1,5}$/.test(k) && Number.isFinite(+v)).slice(0, 40).map(([k, v]) => [k, +v | 0])) : {},
    landAt: num(o.landAt, -99) | 0, landK: clamp(num(o.landK, 1), 1, CHAIN.landKmax), landEv: Number.isInteger(o.landEv) ? o.landEv : 0,
    rentAt: o.rentAt && typeof o.rentAt === 'object' ? Object.fromEntries(Object.entries(o.rentAt).filter(([k, v]) => /^\d{1,5}$/.test(k) && Number.isFinite(+v)).slice(0, 40).map(([k, v]) => [k, +v | 0])) : {},
    dump: until(o.dump), halt: until(o.halt), funded: (Array.isArray(o.funded) ? o.funded : []).map(cell).filter((v) => v >= 0).slice(0, 60),
  };
  c.supLink = new Int32Array(N * N).fill(-1); // nhà cung cấp trong thành phố gần nhất đã giao hàng cho từng ô (không lưu: tự dựng lại khi xe hàng chạy)
  c.rentK = new Float32Array(N * N).fill(1); // hệ số giá thuê theo nhà trống từng khu (tính lại mỗi ngày)
  c.revPrev = null; c.revDay = null; // doanh thu từng ô hôm qua (rev cộng dồn không lưu: ngày đầu sau khi nạp bỏ qua)
  syncFlags(c);
}
export const packChain = (c) => (c.chain ? {
  next: c.chain.next, log: c.chain.log, watch: c.chain.watch, id: c.chain.id || undefined, idHist: c.chain.idHist, tax: c.chain.tax, taxEv: c.chain.taxEv, taxAt: c.chain.taxAt,
  house: c.chain.house, landAt: c.chain.landAt, landK: Math.round(c.chain.landK * 100) / 100, landEv: c.chain.landEv, rentAt: c.chain.rentAt, dump: c.chain.dump, halt: c.chain.halt, funded: c.chain.funded,
} : undefined);

/** Dựng các bảng tra theo ô: nhà máy đình chỉ (c.halted), được thành phố cho xả thải (c.dumped), ô được tài trợ xây nhà (c.funded). */
export function syncFlags(c) {
  const C = cur(c);
  if (!C) return;
  const day = c.day;
  C.halt = C.halt.filter((d) => d.until >= day && c.level[d.cell]);
  C.dump = C.dump.filter((d) => d.until >= day && c.level[d.cell]);
  C.funded = C.funded.filter((i) => !c.level[i] && c.zone[i] && ZDEF[c.zone[i]].cat === 'r');
  c.halted = new Uint8Array(N * N); for (const d of C.halt) c.halted[d.cell] = 1;
  c.dumped = C.dump.map((d) => d.cell);
  c.funded = new Uint8Array(N * N); for (const i of C.funded) c.funded[i] = 1;
}
/** Đình chỉ một nhà máy days ngày (không sản xuất, vẫn trả chi phí cố định). */
export function haltCell(c, i, days, ev = 0) { const C = cur(c); if (!C || !c.level[i]) return; C.halt = C.halt.filter((d) => d.cell !== i); C.halt.push({ cell: i, until: c.day + days, ev }); syncFlags(c); }
/** Cho một nhà máy xả thải ra sông days ngày (ô nhiễm nước thật quanh đó). */
export function dumpCell(c, i, days, ev = 0) { const C = cur(c); if (!C || !c.level[i]) return; C.dump = C.dump.filter((d) => d.cell !== i); C.dump.push({ cell: i, until: c.day + days, ev }); syncFlags(c); if (c.fn && c.fn.computeMaps) c.fn.computeMaps(c); }
/** Đánh dấu ô nhà ở đã quy hoạch được công ty tài trợ xây (sim.growth xây ngay khi đủ điện nước, không chờ nhu cầu). */
export function fundCells(c, cells) { const C = cur(c); if (!C) return 0; let n = 0; for (const i of cells) if (!c.level[i] && c.zone[i] && ZDEF[c.zone[i]].cat === 'r' && !C.funded.includes(i)) { C.funded.push(i); n++; } syncFlags(c); return n; }

// ───────────────────────── nhà cung cấp, đóng cửa ─────────────────────────

/** people.js báo: ô `to` vừa nhận một chuyến hàng từ nhà cung cấp trong thành phố `from`. */
export function noteSupply(c, from, to) { if (c.supLink && from !== to) c.supLink[to] = from; }

/**
 * sim.clearBuilding gọi ngay trước khi toà nhà biến mất (còn biết số người làm). c._why (nếu có) cho biết vì sao:
 * { kind: 'bankrupt' | 'close' | 'relocate' | 'fire' | 'shrink', cause }. Mất nhiều việc → theo dõi hậu quả; là nhà cung cấp → đứt cung ứng.
 */
export function chainCleared(c, i) {
  const why = c._why || null;
  c._why = null;
  const C = cur(c);
  if (!C || !c.level[i] || !jobCap(c.zone[i], c.level[i])) { if (c.supLink) c.supLink[i] = -1; return; }
  const staff = c.staff ? c.staff[i] | 0 : 0, buyers = [];
  if (c.supLink) { for (let j = 0; j < N * N; j++) if (c.supLink[j] === i) { c.supLink[j] = -1; if (c.level[j] && j !== i) buyers.push(j); } c.supLink[i] = -1; }
  const owned = !!(c.owner && c.owner[i]);
  if (staff < CHAIN.layoffMin && buyers.length < 2 && !owned && !(why && (why.kind === 'close' || why.kind === 'relocate'))) return;
  const k = why && why.kind;
  const verb = { bankrupt: 'phá sản', close: 'đóng cửa', relocate: 'dời', fire: 'cháy rụi', noutil: 'bỏ hoang vì thiếu điện nước', noroad: 'bỏ đi vì mất đường vào' }[k] || 'bị giải toả';
  const icon = { bankrupt: '💸', close: '🔒', relocate: '🚚', fire: '🔥', noutil: '🔌', noroad: '🚧' }[k] || '🚧';
  const ev = chron(c, 'close', `${icon} ${cap(whoAt(c, i))} ${verb}${why && why.note ? ' ' + why.note : ''}${staff ? `: ${staff} người mất việc` : ''}`, { cell: i, corp: owned ? c.owner[i] : 0, cause: why && why.cause, toast: staff >= CHAIN.layoffMin || k === 'close' || k === 'relocate' });
  if (staff >= CHAIN.layoffMin) watchLayoff(c, i, staff, ev);
  if (buyers.length) {
    const names = buyers.slice(0, 3).map((j) => bizName(c, j));
    const sev = chron(c, 'supply', `🔗 Đứt nguồn hàng: ${buyers.length} cơ sở mua hàng của ${bizName(c, i)} này (${names.join(', ')}${buyers.length > 3 ? '…' : ''}) phải chuyển sang nhập từ ngoài, đắt và chậm hơn`, { cell: i, cause: ev });
    C.watch.push({ kind: 'supply', cell: i, ev: sev, stage: 0, until: c.day + CHAIN.watchDays, jobs: 0, base: null, seen: [], buyers: buyers.slice(0, 60) });
    if (C.watch.length > CHAIN.maxWatch) C.watch.splice(0, C.watch.length - CHAIN.maxWatch);
  }
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mất việc ở ô i (đóng cửa, phá sản, thu hẹp): theo dõi khu quanh đó vài tuần. Gộp với khu đang theo dõi gần đó. */
export function watchLayoff(c, i, jobs, ev) {
  const C = cur(c);
  if (!C) return;
  const x = i % N, y = (i / N) | 0;
  const near = C.watch.find((w) => w.kind === 'layoff' && w.stage === 0 && Math.hypot((w.cell % N) - x, ((w.cell / N) | 0) - y) <= CHAIN.r * 0.6);
  if (near) { near.jobs += jobs; near.until = Math.max(near.until, c.day + CHAIN.watchDays); return; }
  C.watch.push({ kind: 'layoff', cell: i, ev, stage: 0, until: c.day + CHAIN.watchDays, jobs, base: areaStats(c, i), seen: [], buyers: [] });
  if (C.watch.length > CHAIN.maxWatch) C.watch.splice(0, C.watch.length - CHAIN.maxWatch);
}

/** Số liệu một khu (bán kính CHAIN.r): người lớn thất nghiệp đang ở đó, doanh thu hàng quán hôm qua, tỷ lệ chỗ ở bỏ trống. */
export function areaStats(c, i, r = CHAIN.r) {
  const x0 = i % N, y0 = (i / N) | 0, inA = (k) => Math.abs((k % N) - x0) <= r && Math.abs(((k / N) | 0) - y0) <= r;
  let rev = 0, rcap = 0, rcnt = 0, jobless = 0;
  for (let y = Math.max(0, y0 - r); y <= Math.min(N - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(N - 1, x0 + r); x++) {
    const k = y * N + x;
    if (!c.level[k]) continue;
    const z = ZDEF[c.zone[k]];
    if (z.biz === 'shop' || z.biz === 'market' || z.biz === 'leisure') rev += c.revDay ? c.revDay[k] : 0;
    const rc = resCap(c.zone[k], c.level[k]);
    if (rc) { rcap += rc; rcnt += Math.min(rc, c.resCount[k]); }
  }
  const pp = c.pp;
  if (pp) for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.age[id] >= 18 && pp.age[id] < 60 && !pp.enrolled[id] && pp.work[id] < 0 && pp.home[id] >= 0 && inA(pp.home[id])) jobless++;
  return { jobless, rev, vac: rcap ? 1 - rcnt / rcap : 0, rcap };
}
const jobCells = (c, i, r = CHAIN.r) => { const x0 = i % N, y0 = (i / N) | 0, out = []; for (let y = Math.max(0, y0 - r); y <= Math.min(N - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(N - 1, x0 + r); x++) { const k = y * N + x; if (c.level[k] && jobCap(c.zone[k], c.level[k])) out.push(k); } return out; };

/** Mỗi ngày: đi tiếp các chuỗi đang theo dõi (mỗi khu nhiều nhất một nấc mỗi ngày). */
function watchDay(c) {
  const C = c.chain;
  for (const w of [...C.watch]) {
    if (w.kind === 'supply') { // các cơ sở mất nguồn hàng: cái nào đã đổ theo thì ghi lại (một lần)
      const gone = w.buyers.filter((j) => !c.level[j]);
      if (gone.length && !w.stage) { w.stage = 1; chron(c, 'supply', `💸 Hiệu ứng dây chuyền: ${gone.length}/${w.buyers.length} cơ sở từng lấy hàng ở đó đã đóng cửa sau khi mất nguồn hàng`, { cell: w.cell, cause: w.ev }); }
      if (c.day > w.until || w.stage) C.watch = C.watch.filter((x) => x !== w);
      continue;
    }
    if (!w.base || !c.revDay || c.revFresh) { if (!w.base) w.base = areaStats(c, w.cell); continue; }
    const s = areaStats(c, w.cell), where = placeName(c, w.cell);
    if (w.stage === 0 && s.jobless - w.base.jobless >= Math.max(CHAIN.joblessUp, w.jobs * 0.25)) {
      w.ev = chron(c, 'jobless', `📉 Thất nghiệp quanh ${where} tăng: thêm ${s.jobless - w.base.jobless} người lớn không có việc (${s.jobless} người)`, { cell: w.cell, cause: w.ev });
      w.stage = 1; w.until = c.day + CHAIN.watchDays;
    } else if (w.stage === 1 && w.base.rev > 0 && s.rev < w.base.rev * (1 - CHAIN.revDrop)) {
      w.ev = chron(c, 'demand', `🍜 Hàng quán quanh ${where} vắng khách: doanh thu một ngày giảm ${Math.round((1 - s.rev / w.base.rev) * 100)}% vì người mất việc chi tiêu ít đi`, { cell: w.cell, cause: w.ev });
      w.stage = 2; w.until = c.day + CHAIN.watchDays * 2;
    } else if (w.stage === 2 && (s.vac - w.base.vac >= CHAIN.vacUp || (c.rentK && c.rentK[w.cell] < 0.95))) {
      w.ev = chron(c, 'rent', `🏠 Nhà bỏ trống quanh ${where} tăng lên ${Math.round(s.vac * 100)}%, giá thuê hạ còn ×${(c.rentK ? c.rentK[w.cell] : 1).toFixed(2)}`, { cell: w.cell, cause: w.ev });
      w.stage = 3; w.until = c.day + CHAIN.watchDays * 3; w.seen = jobCells(c, w.cell);
    } else if (w.stage === 3) {
      const fresh = jobCells(c, w.cell).filter((k) => !w.seen.includes(k));
      if (fresh.length) {
        chron(c, 'rebound', `🌱 Mặt bằng rẻ quanh ${where}: ${fresh.length > 1 ? `${fresh.length} cơ sở mới` : `một ${bizName(c, fresh[0])} mới`} mở cửa`, { cell: fresh[0], cause: w.ev });
        C.watch = C.watch.filter((x) => x !== w); continue;
      }
    }
    if (c.day > w.until) C.watch = C.watch.filter((x) => x !== w);
  }
}

// ───────────────────────── giá thuê theo nhà trống ─────────────────────────

/**
 * Hệ số giá thuê từng ô nhà ở: khu nhiều nhà trống hơn mức chung của thành phố thì rẻ đi, khu chật thì đắt lên (0.82–1.15),
 * kéo dần mỗi ngày. Dùng bảng cộng dồn nên chỉ O(N²). Khu quá ít nhà (dưới 40 chỗ) giữ giá như cũ.
 */
function rentDay(c) {
  const W = N + 1, capS = new Float64Array(W * W), cntS = new Float64Array(W * W);
  let tc = 0, tn = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, rc = c.level[i] ? resCap(c.zone[i], c.level[i]) : 0, rn = rc ? Math.min(rc, c.resCount[i]) : 0;
    tc += rc; tn += rn;
    const s = (y + 1) * W + x + 1;
    capS[s] = rc + capS[s - 1] + capS[s - W] - capS[s - W - 1];
    cntS[s] = rn + cntS[s - 1] + cntS[s - W] - cntS[s - W - 1];
  }
  const vCity = tc ? 1 - tn / tc : 0, r = CHAIN.rentR, K = c.rentK;
  const sum = (S, x0, y0, x1, y1) => S[(y1 + 1) * W + x1 + 1] - S[y0 * W + x1 + 1] - S[(y1 + 1) * W + x0] + S[y0 * W + x0];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (!c.level[i] || !resCap(c.zone[i], c.level[i])) { K[i] = 1; continue; }
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(N - 1, x + r), y1 = Math.min(N - 1, y + r), a = sum(capS, x0, y0, x1, y1);
    const tgt = a < CHAIN.rentMinCap ? 1 : clamp(1 - (1 - sum(cntS, x0, y0, x1, y1) / a - vCity) * 1.1, CHAIN.rentLo, CHAIN.rentHi);
    K[i] += (tgt - K[i]) * 0.25;
  }
  // khu chật, giá thuê lên cao: ghi một lần mỗi 30 ngày cho từng vùng (lưới 16 ô)
  const C = c.chain, hot = {};
  for (let i = 0; i < N * N; i++) if (K[i] >= 1.1) { const k = (((i / N) | 0) >> 4) * 64 + ((i % N) >> 4); (hot[k] || (hot[k] = [])).push(i); }
  for (const [k, l] of Object.entries(hot)) {
    if (l.length < 6 || c.day - (C.rentAt[k] ?? -99) < 30) continue;
    C.rentAt[k] = c.day;
    const m = l[(l.length / 2) | 0], avg = l.reduce((s, i) => s + K[i], 0) / l.length;
    chron(c, 'rent', `🏘️ Giá thuê nhà quanh ${placeName(c, m)} tăng ×${avg.toFixed(2)}: nhà gần như kín chỗ, người mới tới khó tìm chỗ ở`, { cell: m });
  }
}

// ───────────────────────── nhà ở công nhân ─────────────────────────

/** Nhà ở quanh cụm nhà máy của một công ty: chỗ làm, người làm, công nhân ở gần (≤ houseR ô), số chỗ ở. */
export function workerHousing(c, q) {
  const l = q.cells.map(([i]) => i).filter((i) => c.level[i] && ZDEF[c.zone[i]].biz === 'ind');
  if (!l.length) return null;
  const cx = Math.round(l.reduce((s, i) => s + (i % N), 0) / l.length), cy = Math.round(l.reduce((s, i) => s + ((i / N) | 0), 0) / l.length), R = CHAIN.houseR;
  const inR = (k) => Math.abs((k % N) - cx) <= R && Math.abs(((k / N) | 0) - cy) <= R;
  let jobs = 0, staff = 0, homes = 0, free = 0;
  const work = new Uint8Array(N * N);
  for (let y = Math.max(0, cy - R); y <= Math.min(N - 1, cy + R); y++) for (let x = Math.max(0, cx - R); x <= Math.min(N - 1, cx + R); x++) {
    const k = y * N + x;
    if (!c.level[k]) continue;
    const z = ZDEF[c.zone[k]];
    if (z.biz === 'ind' || z.biz === 'res') { jobs += jobCap(c.zone[k], c.level[k]); staff += c.staff[k]; work[k] = 1; }
    const rc = resCap(c.zone[k], c.level[k]);
    if (rc && !z.who) { homes += rc; free += Math.max(0, rc - c.resCount[k]); }
  }
  let near = 0, far = 0;
  const pp = c.pp;
  for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.work[id] >= 0 && work[pp.work[id]]) { if (pp.home[id] >= 0 && inR(pp.home[id])) near++; else far++; }
  const sites = [];
  for (let y = Math.max(0, cy - R); y <= Math.min(N - 1, cy + R); y++) for (let x = Math.max(0, cx - R); x <= Math.min(N - 1, cx + R); x++) {
    const k = y * N + x, z = ZDEF[c.zone[k]];
    if (!c.level[k] && z && z.cat === 'r' && !z.who && c.acc[k] && !(c.funded && c.funded[k])) sites.push(k);
  }
  return { cell: cy * N + cx, jobs, staff, fill: jobs ? staff / jobs : 1, near, far, farShare: near + far ? far / (near + far) : 0, homes, free, sites };
}
/** Thiếu nhà ở công nhân: nhiều chỗ làm, nhà máy thiếu người, phần lớn công nhân phải ở xa, quanh đó hết chỗ ở trống. */
export const housingShort = (h) => !!h && h.jobs >= CHAIN.houseJobs && h.fill < 0.85 && h.farShare > 0.5 && h.free < h.jobs * 0.1;

function housingDay(c) {
  const C = c.chain;
  if (!c.corp || c.day % 3) return;
  for (const q of c.corp.list) {
    if (q.parent || q.kind === 'trade' || q.cells.length < 4) continue;
    if (c.day - (C.house[q.id] ?? -99) < CHAIN.houseCool) continue;
    const h = workerHousing(c, q);
    if (!housingShort(h)) continue;
    C.house[q.id] = c.day; q.house = c.day;
    q.houseEv = chron(c, 'housing', `🏚️ Thiếu nhà ở công nhân quanh cụm nhà máy của ${corpTitle(q)} (${placeName(c, h.cell)}): ${h.jobs} chỗ làm, mới có ${Math.round(h.fill * 100)}% người làm, ${Math.round(h.farShare * 100)}% công nhân phải đi làm xa. ${h.sites.length ? `Có ${h.sites.length} ô nhà ở đã quy hoạch chưa xây gần đó` : 'Quanh đó chưa có ô nhà ở quy hoạch: thị trưởng nên quy hoạch thêm nhà ở gần cụm'}`, { cell: h.cell, corp: q.id });
  }
}

// ───────────────────────── tranh đất công nghiệp ─────────────────────────

/** Ô khu công nghiệp (khu 3, 21) đã quy hoạch, cạnh đường, chưa xây, chưa ai giữ. */
export function freeIndustrial(c) {
  let n = 0;
  for (let i = 0; i < N * N; i++) if ((c.zone[i] === 3 || c.zone[i] === 21) && !c.level[i] && c.acc[i] && !(c.owner && c.owner[i])) n++;
  return n;
}
/** Hệ số phí đất: nhiều công ty cùng chờ đất công nghiệp thì phí đất nộp ngân sách lên (tối đa ×1.75), hết tranh thì về 1. */
export const landK = (c) => (c.chain ? c.chain.landK : 1);

function landDay(c) {
  const C = c.chain;
  if (!c.corp) return;
  const want = c.corp.list.filter((q) => !q.parent && q.kind !== 'trade' && c.day - (q.landWant ?? -99) <= 3);
  if (want.length >= 2) {
    C.landK = Math.min(CHAIN.landKmax, C.landK + 0.08 * want.length);
    if (c.day - C.landAt >= CHAIN.landCool) {
      C.landAt = c.day;
      C.landEv = chron(c, 'land', `⚔️ Tranh đất công nghiệp: ${want.slice(0, 3).map(corpTitle).join(', ')}${want.length > 3 ? '…' : ''} cùng cần mở rộng, thành phố chỉ còn ${freeIndustrial(c)} ô khu công nghiệp trống. Phí đất lên ×${C.landK.toFixed(2)}`, { corp: want[0].id });
    }
  } else C.landK = Math.max(1, C.landK - 0.04);
}

// ───────────────────────── bản sắc kinh tế ─────────────────────────

/** Việc làm theo ngành và bản sắc kinh tế hiện tại (tính từ chỗ làm thật). */
export function economyMix(c) {
  const s = { farm: 0, mine: 0, make: 0, trade: 0, fun: 0, office: 0, fin: 0, tech: 0 }, prod = {};
  let tot = 0;
  for (let i = 0; i < N * N; i++) {
    if (!c.level[i]) continue;
    const z = ZDEF[c.zone[i]], j = jobCap(c.zone[i], c.level[i]);
    if (!j) continue;
    tot += j;
    if (z.biz === 'res') s[z.raw === 'agri' || z.raw === 'fish' || z.raw === 'wood' ? 'farm' : 'mine'] += j;
    else if (z.biz === 'ind') { if (c.ware && c.ware[i]) { s.trade += j; continue; } s.make += j; const p = productAt(i, c.zone[i] === 21 ? 21 : 3); prod[p] = (prod[p] || 0) + j; }
    else if (z.biz === 'shop' || z.biz === 'market') s.trade += j;
    else if (z.biz === 'leisure') s.fun += j;
    else if (z.biz === 'office') s[c.zone[i] === 19 ? 'fin' : c.zone[i] === 18 ? 'tech' : 'office'] += j;
  }
  const sh = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, tot ? v / tot : 0]));
  const top = Object.keys(prod).sort((a, b) => prod[b] - prod[a])[0];
  const topShare = top && s.make ? prod[top] / s.make : 0;
  const visitors = c.tour && c.tour.last ? c.tour.last.visitors || 0 : 0, pop = c.pp ? c.pp.count : 0;
  let key = 'mixed', name = 'Kinh tế đa ngành';
  if (tot < 40) { key = 'young'; name = 'Thị trấn mới hình thành'; }
  else if (sh.make >= 0.4) { key = top && topShare >= 0.35 ? `make:${top}` : 'make'; name = top && topShare >= 0.35 ? `Thành phố công nghiệp ${PRODUCTS[top].name.toLowerCase()}` : 'Thành phố công nghiệp'; }
  else if (sh.farm + sh.mine >= 0.35) { key = sh.farm >= sh.mine ? 'farm' : 'mine'; name = sh.farm >= sh.mine ? 'Vùng nông nghiệp, thuỷ sản' : 'Vùng khai khoáng'; }
  else if (sh.fin + sh.tech + sh.office >= 0.3) { key = sh.fin >= sh.tech ? 'fin' : 'tech'; name = sh.fin >= sh.tech ? 'Trung tâm tài chính, văn phòng' : 'Thành phố công nghệ'; }
  else if (sh.fun >= 0.18 && pop && visitors >= pop * 0.08) { key = 'tour'; name = 'Thành phố du lịch'; }
  else if (sh.trade + sh.fun >= 0.45) { key = 'trade'; name = 'Thành phố thương mại, dịch vụ'; }
  return { key, name, share: sh, jobs: tot, top: top || null, topShare };
}
const MIX_NAME = { farm: 'nông, thuỷ sản', mine: 'khai khoáng', make: 'công nghiệp', trade: 'thương mại', fun: 'ăn uống, giải trí', office: 'văn phòng', fin: 'tài chính', tech: 'công nghệ' };
/** Ba ngành lớn nhất theo việc làm: "công nghiệp 46%, thương mại 22%…". */
export const mixLine = (m) => Object.entries(m.share).filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${MIX_NAME[k]} ${Math.round(v * 100)}%`).join(', ');

function identityDay(c) {
  const C = c.chain, m = economyMix(c);
  c.econMix = m;
  if (!C.id) { C.id = { key: m.key, name: m.name, since: c.day, cand: m.key, candAt: c.day }; C.idHist.push({ day: c.day, key: m.key, name: m.name }); return; }
  if (m.key === C.id.key) { C.id.cand = m.key; C.id.candAt = c.day; return; }
  if (m.key !== C.id.cand) { C.id.cand = m.key; C.id.candAt = c.day; return; }
  if (c.day - C.id.candAt < CHAIN.idHold) return;
  const from = C.id.name;
  C.id = { key: m.key, name: m.name, since: c.day, cand: m.key, candAt: c.day };
  C.idHist.push({ day: c.day, key: m.key, name: m.name }); if (C.idHist.length > 20) C.idHist.shift();
  if (m.key !== 'young') chron(c, 'identity', `🧭 Bản sắc kinh tế đổi: từ "${from}" thành "${m.name}" (việc làm: ${mixLine(m)})`, {});
}
/** Tên bản sắc kinh tế hiện tại (cho bảng, cho AI). */
export const identityName = (c) => (c.chain && c.chain.id ? c.chain.id.name : '');

// ───────────────────────── chính sách: đổi thuế ─────────────────────────

function taxDay(c) {
  const C = c.chain, t = C.tax, n = c.tax, NAME = { i: 'công nghiệp', c: 'thương mại', r: 'thu nhập, nhà ở' };
  const ch = ['i', 'c', 'r'].filter((k) => Math.abs(n[k] - t[k]) >= 2);
  if (!ch.length) return;
  C.taxEv = chron(c, 'policy', `📜 Thành phố đổi thuế ${ch.map((k) => `${NAME[k]} ${t[k]}% → ${n[k]}%`).join(', ')}`, { toast: false });
  C.taxAt = c.day;
  C.tax = { ...n };
}

// ───────────────────────── mỗi ngày ─────────────────────────

/** Gọi lúc 0 giờ mỗi ngày (sau khi sổ sách chốt ngày). */
export function chainDay(c) {
  const C = cur(c);
  if (!C) return;
  const rev = c.biz && c.biz.rev;
  if (rev) {
    c.revFresh = !c.revPrev;
    if (!c.revPrev) { c.revPrev = new Float32Array(N * N); c.revDay = new Float32Array(N * N); }
    for (let i = 0; i < N * N; i++) { c.revDay[i] = Math.max(0, rev[i] - c.revPrev[i]); c.revPrev[i] = rev[i]; }
  }
  syncFlags(c);
  taxDay(c);
  rentDay(c);
  watchDay(c);
  housingDay(c);
  landDay(c);
  identityDay(c);
}

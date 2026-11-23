// Phố Mới — sổ cái tiền: mọi khoản tiền vào / ra của thành phố đều ghi với bên đối ứng.
//
// Ví trong thành phố: ngân sách (c.money), từng người dân (pp.money), từng doanh nghiệp / toà nhà (biz.money).
// Ví "thế giới bên ngoài" (c.ledger.world) là bên đối ứng cho mọi khoản chưa có người trả / người nhận thật trong
// thành phố: tiền xây dựng, bảo trì, thưởng mốc, xuất nhập khẩu, du khách... Bảo toàn:
//   tổng tiền trong thành phố + c.ledger.world === c.ledger.base
// Bước đầu (giai đoạn A1) chỉ ghi sổ, chưa đổi cân bằng game: các dòng "thế giới" cho thấy tiền đang tự sinh / tự mất ở đâu,
// để các bước sau lần lượt khép lại (thuế giữ lại thật, bảo trì thành lương, tiền nhà về chủ nhà...).
import { N } from './base.js';

/** Các dòng tiền giữa thành phố và bên ngoài: [tên, nhóm]. Số dương = tiền vào thành phố, âm = tiền ra. */
export const FLOWS = {
  taxR: ['Thuế dân cư vào ngân sách', 'city'],
  taxC: ['Thuế thương mại vào ngân sách', 'city'],
  taxI: ['Thuế công nghiệp, bán phế liệu', 'city'],
  rooms: ['Tiền phòng, phí sân bay, cảng, vé tàu liên vận', 'city'],
  fare: ['Vé xe buýt, tàu, phí đỗ xe', 'city'],
  reward: ['Thưởng đạt mốc dân số', 'city'],
  council: ['Tài trợ, nhà đầu tư, hộp thư thị trưởng', 'city'],
  loanIn: ['Tiền vay ngân hàng', 'city'],
  loanPay: ['Trả nợ ngân hàng', 'city'],
  upkeep: ['Bảo trì, vận hành công trình, đường', 'city'],
  build: ['Xây dựng, nâng cấp, đào đắp', 'city'],
  land: ['Mua đất', 'city'],
  event: ['Tổ chức lễ hội', 'city'],
  sandbox: ['Chế độ Open (tiền không giới hạn)', 'city'],
  taxHeld: ['Thuế bị trừ của dân, doanh nghiệp (chưa về ngân sách)', 'private'],
  rent: ['Tiền nhà dân trả (chưa có chủ nhà nhận)', 'private'],
  demand: ['Doanh thu bán lẻ chưa trừ ví dân', 'private'],
  visitor: ['Khách vãng lai ăn uống, vui chơi', 'private'],
  office: ['Dịch vụ văn phòng bán ra ngoài', 'private'],
  export: ['Xuất khẩu', 'private'],
  import: ['Nhập khẩu', 'private'],
  tradeOut: ['Trả trước hàng mua của thành phố khác (qua máy chủ nhóm)', 'group'],
  tradeIn: ['Tiền bán hàng cho thành phố khác (máy chủ nhóm chuyển)', 'group'],
  tradeRefund: ['Hoàn tiền hợp đồng bên bán không giao đủ', 'group'],
  tourist: ['Du khách chi tiêu', 'private'],
  arrive: ['Người mới đến, trẻ sinh ra (tiền mang theo)', 'private'],
  leave: ['Người mất, người bỏ đi (tiền mang theo)', 'private'],
  bizOpen: ['Vốn ban đầu của toà nhà mới', 'private'],
  bizClose: ['Tiền của toà nhà bị dỡ, phá sản', 'private'],
  clamp: ['Ví dân chạm trần / sàn', 'private'],
  crime: ['Bị cướp', 'private'],
  subsidy: ['Hỗ trợ doanh nghiệp của quận', 'private'],
  scrap: ['Bán phế liệu đã phân loại', 'city'],
  bizCost: ['Chi phí doanh nghiệp thuê ngoài', 'private'],
  landlord: ['Chủ nhà thuê sửa chữa ngoài', 'private'],
  dividend: ['Lợi nhuận chia cho chủ ở ngoài thành phố', 'private'],
  corpBuild: ['Tập đoàn thuê ngoài xây nhà máy', 'private'],
  corpLoan: ['Tập đoàn vay, trả nợ và lãi ngân hàng', 'private'],
};
/** Dòng tiền chảy bên trong thành phố (chỉ đếm khối lượng, không đổi tổng). */
export const INNER = { wage: 'Lương trả cho dân', shop: 'Dân mua sắm, ăn uống', supply: 'Doanh nghiệp mua hàng của nhau', rent: 'Tiền nhà dân trả chủ nhà', tax: 'Thuế, thuế nhà đất về ngân sách', procure: 'Ngân sách, chủ nhà, doanh nghiệp thuê doanh nghiệp trong thành phố (xây, bảo trì, dịch vụ)', dividend: 'Doanh nghiệp chia lợi nhuận cho dân', tariff: 'Thuế nhập khẩu hàng của thành phố khác về ngân sách', corpLand: 'Công ty nộp phí đất cho ngân sách', corpInfra: 'Công ty nộp phí hạ tầng nước thải cho ngân sách', corpSme: 'Ngân sách hỗ trợ vốn doanh nghiệp nhỏ được bảo hộ', util: 'Dân trả tiền điện, nước, rác cho ngân sách', logistics: 'Công ty trả phí lưu kho cho kho bãi của mình' };
/** Khoản chi của ngân sách trả cho doanh nghiệp trong thành phố (thầu xây, bảo trì) thay vì ra bên ngoài. */
const PROCURE = new Set(['build', 'upkeep', 'event']);

/** Tổng tiền đang nằm trong thành phố: ngân sách + ví dân còn sống + ví toà nhà. */
export function totalMoney(c) {
  let t = c.money;
  const pp = c.pp;
  if (pp) for (let id = 0; id < pp.n; id++) if (pp.alive[id]) t += pp.money[id];
  if (c.biz) { const b = c.biz.money; for (let i = 0; i < N * N; i++) t += b[i]; }
  if (c.corp) for (const q of c.corp.list) t += q.cash; // quỹ các công ty (corp.js)
  if (c.econ && c.econ.pool) t += c.econ.pool.r + c.econ.pool.c + c.econ.pool.i; // thuế đang gom chờ chia đều cả tuần
  if (c.hourInc) t += c.hourInc.r + c.hourInc.c + c.hourInc.i; // thuế đã trừ, chưa vào ngân sách
  return t;
}

/**
 * Thế giới máy có hạn: số dư ban đầu, mỗi ngày phát hành thêm chậm (khoảng 2% mỗi mùa 14 ngày, tính trên tổng tiền
 * của thành phố + thế giới). Thế giới nghèo đi thì mua ít hàng, du khách tiêu ít, vốn đầu tư mới ít (worldK).
 */
export const WORLD = { start: 4000000, issueDay: 0.02 / 14, floor: 0.2 };

/**
 * Mở sổ mới (thành phố mới, vừa nạp bản lưu, hoặc test chỉnh tiền tay): mốc bảo toàn = tổng hiện tại.
 * keep: { world, r0, issued } của sổ cũ (nạp bản lưu) để số dư thế giới không bị nạp lại đầy.
 */
export function resetLedger(c, keep = null) {
  const w = keep && Number.isFinite(+keep.world) ? +keep.world : 0;
  const g = keep && Number.isFinite(+keep.group) ? +keep.group : 0;
  c.ledger = { world: w, group: g, base: totalMoney(c) + w + g, r0: keep && +keep.r0 > 0 ? +keep.r0 : WORLD.start, issued: keep && +keep.issued > 0 ? +keep.issued : 0, day: {}, inner: {}, last: null, lastInner: null };
  return c.ledger;
}
/** Số dư của thế giới bên ngoài (ngân hàng, nhà đầu tư, khách nước ngoài, nông thôn). */
export const worldReserve = (c) => (c.ledger ? c.ledger.r0 + c.ledger.world : WORLD.start);
/** Sức mua của thế giới so với lúc đầu: 1 khi còn từ nửa số dư ban đầu trở lên, thấp nhất WORLD.floor. */
export function worldK(c) {
  const L = c.ledger;
  if (!L || c.sandbox) return 1;
  return Math.max(WORLD.floor, Math.min(1, (L.r0 + L.world) / (L.r0 * 0.5)));
}
/** Thế giới có đủ tiền cho một khoản (vay, tài trợ) không: giữ lại ít nhất 10% số dư ban đầu. */
export const worldCan = (c, amt) => !c.ledger || c.sandbox || worldReserve(c) - amt >= c.ledger.r0 * 0.1;
/** Phát hành thêm tiền mỗi ngày (vào ví thế giới): tổng tiền tăng chậm, có kiểm soát. */
export function issueDay(c) {
  const L = c.ledger;
  if (!L) return 0;
  const amt = Math.max(0, (worldReserve(c) + totalMoney(c)) * WORLD.issueDay);
  L.world += amt; L.base += amt; L.issued += amt;
  L.lastIssue = amt;
  return amt;
}
export const packLedger = (c) => (c.ledger ? { world: Math.round(c.ledger.world), group: Math.round(c.ledger.group || 0), r0: c.ledger.r0, issued: Math.round(c.ledger.issued) } : undefined);
/** Tiền đi qua quỹ thanh toán của nhóm cạnh tranh (thẳng giữa các thành phố, không qua ví thế giới): amt > 0 vào, < 0 ra. */
export function groupFlow(c, key, amt) {
  const L = c.ledger;
  if (!L || !amt) return;
  L.group = (L.group || 0) - amt;
  L.day[key] = (L.day[key] || 0) + amt;
}

/** Tiền đi qua ranh giới thành phố: amt > 0 vào từ bên ngoài, amt < 0 ra bên ngoài. Ví trong thành phố do nơi gọi tự cộng trừ. */
export function world(c, key, amt) {
  const L = c.ledger;
  if (!L || !amt) return;
  L.world -= amt;
  L.day[key] = (L.day[key] || 0) + amt;
}

/** Tiền chảy giữa hai ví trong thành phố (chỉ thống kê). */
export function inner(c, key, amt) {
  const L = c.ledger;
  if (L && amt) L.inner[key] = (L.inner[key] || 0) + amt;
}

/** Ngân sách chi ra bên ngoài. */
export function cityPay(c, key, amt) {
  c.money -= amt;
  if (PROCURE.has(key) && c.fn && c.fn.procure) c.fn.procure(c, amt, key); else world(c, key, -amt);
}
/** Ngân sách nhận tiền từ ví khác trong thành phố (thuế đã trừ của dân, doanh nghiệp). */
export function cityTake(c, key, amt) { c.money += amt; inner(c, key, amt); }
/** Ngân sách nhận từ bên ngoài. */
export function cityGet(c, key, amt) { c.money += amt; world(c, key, amt); }
/** Ngân sách bị đặt thẳng một số mới (chế độ Open: tiền in ra, không lấy của thế giới). */
export function citySet(c, key, v) { if (c.ledger) c.ledger.base += v - c.money; c.money = v; }

/** Chốt sổ mỗi ngày (0 giờ): giữ số liệu hôm qua để xem. */
export function ledgerDay(c) {
  const L = c.ledger;
  if (!L) return;
  L.last = L.day; L.lastInner = L.inner; L.day = {}; L.inner = {};
}

/** Kiểm tra bảo toàn: drift ≈ 0 nghĩa là không có đồng nào tự sinh / tự mất ngoài sổ. */
export function checkLedger(c) {
  const L = c.ledger, total = totalMoney(c);
  return { total, world: L.world, group: L.group || 0, base: L.base, drift: total + L.world + (L.group || 0) - L.base };
}

// ───────────────────────── sổ dân ─────────────────────────
// Người chỉ sinh ra từ người: dân thành phố đến từ vùng nông thôn (có hạn, tự sinh / mất chậm) hoặc từ nước ngoài,
// người rời thành phố về nông thôn. Bảo toàn: dân thành phố + nông thôn + abroad === base + sinh − mất
// (abroad: số người đang ở nước ngoài tính từ lúc mở sổ, âm khi nước ngoài gửi người tới nhiều hơn).

/** Dân nông thôn lúc bắt đầu chơi, tỉ lệ sinh / mất mỗi ngày của nông thôn. */
export const RURAL = { start: 12000, birth: 0.004, death: 0.003 };
/** Người nước ngoài có thể nhập cư (có hạn, cộng thêm người của thành phố ra nước ngoài). */
export const ABROAD = { start: 8000 };
export const abroadLeft = (c) => !c.popl || ABROAD.start + c.popl.abroad > 0;
export const POP_FROM = { rural: 'Từ nông thôn', abroad: 'Từ nước ngoài', born: 'Trẻ sinh ra', died: 'Người mất', toRural: 'Về nông thôn', toAbroad: 'Ra nước ngoài' };

export function resetPop(c, rural = c.popl ? c.popl.rural : RURAL.start, abroad = 0) {
  c.popl = { rural: Math.max(0, Math.round(rural)), abroad, born: 0, died: 0, base: 0, day: {}, last: null };
  c.popl.base = (c.pp ? c.pp.count : 0) + c.popl.rural + abroad;
  return c.popl;
}
/**
 * Trả lại nguồn dân nông thôn cho thành phố chơi tự do: trong nhóm cạnh tranh nguồn dân chỉ là phần máy chủ chia mỗi ngày (có khi
 * còn vài người), rời nhóm mà không trả lại thì thành phố hết người chuyển đến, dân không tăng nữa. Đặt về số ban đầu trừ dân đang
 * ở thành phố (chỉnh mốc base để sổ dân vẫn khớp). Trả về số người được thêm vào nguồn.
 */
export function restoreRural(c) {
  const P = c.popl;
  if (!P) return 0;
  const want = Math.max(P.rural, RURAL.start - (c.pp ? c.pp.count : 0));
  const add = want - P.rural;
  if (add > 0) { P.base += add; P.rural = want; }
  return Math.max(0, add);
}
/** Một người vào thành phố từ đâu (rural / abroad / born / load: nạp bản lưu, không tính). */
export function popIn(c, from) {
  const P = c.popl;
  if (!P || from === 'load') return;
  if (from === 'rural') P.rural--; else if (from === 'abroad') P.abroad--; else if (from === 'born') P.born++;
  P.day[from] = (P.day[from] || 0) + 1;
}
/** Một người rời thành phố: về nông thôn, ra nước ngoài hoặc mất. */
export function popOut(c, to) {
  const P = c.popl;
  if (!P) return;
  if (to === 'died') P.died++; else if (to === 'toAbroad') P.abroad++; else { to = 'toRural'; P.rural++; }
  P.day[to] = (P.day[to] || 0) + 1;
}
/** Còn người ở nông thôn muốn lên thành phố không. */
export const ruralLeft = (c) => !c.popl || c.popl.rural > 0;
/** Nông thôn tự sinh, tự mất mỗi ngày (làm tròn ngẫu nhiên theo rng của thành phố). */
export function ruralDay(c) {
  const P = c.popl;
  if (!P) return;
  const rng = c.rng || Math.random, rnd = (v) => Math.floor(v + rng());
  const b = rnd(P.rural * RURAL.birth), d = Math.min(P.rural + b, rnd(P.rural * RURAL.death));
  P.rural += b - d; P.born += b; P.died += d;
  P.day.ruralBorn = (P.day.ruralBorn || 0) + b; P.day.ruralDied = (P.day.ruralDied || 0) + d;
  P.last = P.day; P.day = {};
}
export function checkPop(c) {
  const P = c.popl, city = c.pp ? c.pp.count : 0;
  return { city, rural: P.rural, abroad: P.abroad, drift: city + P.rural + P.abroad - (P.base + P.born - P.died) };
}

/** Tóm tắt một ngày: tổng vào, tổng ra, từng dòng xếp theo độ lớn. */
export function ledgerSummary(c, which = 'last') {
  const L = c.ledger, d = (L && (which === 'last' ? L.last : L.day)) || {};
  const rows = Object.entries(d).map(([k, v]) => ({ key: k, name: FLOWS[k]?.[0] || k, group: FLOWS[k]?.[1] || 'private', v: Math.round(v) })).filter((r) => r.v).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const inn = (L && (which === 'last' ? L.lastInner : L.inner)) || {};
  return { rows, inflow: rows.reduce((s, r) => s + Math.max(0, r.v), 0), outflow: rows.reduce((s, r) => s + Math.min(0, r.v), 0), inner: Object.entries(inn).map(([k, v]) => ({ key: k, name: INNER[k] || k, v: Math.round(v) })) };
}

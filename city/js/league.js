// Phố Mới — chơi trong nhóm cạnh tranh (giai đoạn C, city/MULTIPLAYER.md; máy chủ: gateway/city-league.js).
// Thành phố vào nhóm thì "thế giới bên ngoài" đổi sang provider 'league': dân chuyển đến, du khách, giá chợ, đầu tư
// lấy từ phần máy chủ chia mỗi ngày giải (1 giờ thật); mỗi 0 giờ thành phố gửi bản tóm tắt ngày lên.
// Đồng hồ thật: thành phố không chạy quá ngày giải hiện tại (1 ngày game / 1 giờ thật), vắng mặt thì chạy bù có giới hạn.
import { registerWorld, AI_WORLD } from './world.js';
import { MKT_KINDS, mkt } from './econ.js';
import { PRICE, priceOf, importMultOf } from './base.js';
import { world, groupFlow } from './ledger.js';

export const CATCHUP_MAX_DAYS = 7;
/** Giá chào bán (phần của giá chợ chung) và thuế nhập khẩu hàng của thành phố khác (khớp gateway/city-league.js TRADE). */
export const TRADE = { askMin: 0.8, askMax: 1.2, tariffMax: 0.5 };

/** Chính sách buôn bán của thành phố trong nhóm: giá chào từng loại hàng, thuế nhập khẩu từng loại hàng. */
export function policyOf(c) {
  const L = c.league;
  if (!L) return null;
  if (!L.policy) L.policy = { ask: {}, tariff: {}, changed: {} };
  for (const k of MKT_KINDS) { if (!(L.policy.ask[k] > 0)) L.policy.ask[k] = 1; if (!(L.policy.tariff[k] >= 0)) L.policy.tariff[k] = 0; }
  return L.policy;
}
/** Đổi giá chào (field 'ask') hoặc thuế nhập khẩu ('tariff') của một loại hàng: mỗi loại tối đa một lần mỗi ngày game, máy chủ áp từ ngày giải sau. */
export function setPolicy(c, field, kind, v) {
  const P = policyOf(c);
  if (!P || !MKT_KINDS.includes(kind) || (field !== 'ask' && field !== 'tariff')) return { ok: false, reason: 'Không đổi được' };
  const key = `${field}:${kind}`;
  if (P.changed[key] === c.day) return { ok: false, reason: 'Mỗi loại hàng chỉ đổi được một lần mỗi ngày' };
  const val = field === 'ask' ? Math.min(TRADE.askMax, Math.max(TRADE.askMin, +v || 1)) : Math.min(TRADE.tariffMax, Math.max(0, +v || 0));
  P[field][kind] = Math.round(val * 100) / 100; P.changed[key] = c.day;
  return { ok: true, value: P[field][kind] };
}
/**
 * Hợp đồng mua / bán với thành phố khác trong ngày giải: lấy tối đa qty đơn vị từ phần còn lại.
 * side: 'buy' | 'sell'. Trả về { qty, price (hệ số giá), tariff } hoặc null.
 */
export function contract(c, side, kind, qty) {
  const d = c.league && c.league.alloc && c.league.alloc.trade && c.league.alloc.trade[side] && c.league.alloc.trade[side][kind];
  if (!d || !(d.left > 0) || !(qty > 0)) return null;
  const q = Math.min(qty, d.left);
  d.left -= q;
  return { qty: q, price: d.price, tariff: d.tariff || 0 };
} // vắng lâu hơn: phần thời gian vượt quá bị bỏ (thành phố không lớn thêm lúc vắng chủ)

/** Phần chia hôm nay chưa dùng (mỗi 0 giờ của thành phố dùng một lần). */
const fresh = (c) => (c.league && c.league.alloc && !c.league.alloc.used ? c.league.alloc : null);

registerWorld('league', {
  name: 'Nhóm cạnh tranh',
  // nông thôn chung của nhóm ở máy chủ: số người được chia hôm nay thành nguồn dân chuyển đến của thành phố
  ruralDay(c) {
    const P = c.popl, a = fresh(c);
    if (!P) return;
    const give = a ? a.migrants : 0;
    P.base += give - P.rural; P.rural = give; // nguồn dân đổi theo máy chủ: chỉnh mốc để sổ dân vẫn khớp
    P.last = P.day; P.day = {};
    // thành phố bỏ lâu ngày: dân đã chảy đi trong lúc vắng chủ
    const L = c.league;
    if (a && a.leave > (L.drainedApplied || 0)) {
      let n = a.leave - (L.drainedApplied || 0);
      for (let id = 0; id < c.pp.n && n > 0; id++) if (c.pp.alive[id] && c.fn && c.fn.removeCitizen) { c.fn.removeCitizen(c, id, 'toRural'); n--; }
      L.drainedApplied = a.leave;
      if (c.events) c.events.push({ type: 'league', text: '🏚️ Thành phố vắng chủ quá lâu: một phần dân đã chuyển đi nơi khác' });
    }
    if (a) { a.used = true; if (c.events) c.events.push({ type: 'leagueDay', alloc: a }); }
  },
  // giá chợ chung của nhóm (theo tổng hàng chào bán), không còn giá trôi ngẫu nhiên
  marketDay(c) {
    const a = c.league && c.league.alloc, m = c.market;
    if (!a || !a.prices) return AI_WORLD.marketDay(c);
    for (const k of MKT_KINDS) if (Number.isFinite(+a.prices[k])) m.p[k] = +a.prices[k];
    m.hist.push(MKT_KINDS.map((k) => m.p[k]));
    if (m.hist.length > 60) m.hist.shift();
  },
  // du khách: số máy chủ chia cho hôm nay (theo sức hút du lịch so với cả nhóm)
  tourismHour(c, spend) {
    const a = c.league && c.league.alloc;
    c.tourOverride = a ? a.tourists : 0;
    try { return AI_WORLD.tourismHour(c, spend); } finally { c.tourOverride = null; }
  },
  report(c, rep) {
    rep.left = (c.popl && c.popl.last && c.popl.last.toRural) || 0; // người rời thành phố hôm qua: vào nguồn chung của nhóm
    const P = policyOf(c), last = (c.econ && c.econ.last) || {};
    rep.trade = { need: { ...(last.impK || {}) }, sold: { ...(last.expK || {}) }, ask: { ...P.ask }, tariff: { ...P.tariff } }; // nhập / xuất hôm qua theo loại hàng, chính sách buôn bán
    c.league.outbox = rep; // chỉ cần bản mới nhất; main.js gửi lên máy chủ
  },
});

/**
 * Ghi số hàng thật sự mua / bán theo hợp đồng trong ngày giải (gửi lên máy chủ để thanh toán). Bên mua đã trả trước
 * qty × unit vào quỹ nhóm (ra khỏi thành phố); bên bán chờ máy chủ chuyển tiền. cell: doanh nghiệp mua / bán.
 */
export function tradeUse(c, side, kind, qty, unit, cell) {
  const L = c.league, D = L && L.alloc ? L.alloc.day : null;
  if (D == null || !(qty > 0)) return;
  const U = (L.used || (L.used = {}))[D] || (L.used[D] = { buy: {}, sell: {}, cells: { buy: {}, sell: {} } });
  const t = U[side][kind] || (U[side][kind] = side === 'buy' ? { qty: 0, paid: 0 } : { qty: 0 });
  t.qty += qty;
  const cs = U.cells[side][kind] || (U.cells[side][kind] = {}), e = cs[cell] || (cs[cell] = { qty: 0, value: 0 });
  e.qty += qty; e.value += qty * unit;
  if (side === 'buy') { t.paid += qty * unit; groupFlow(c, 'tradeOut', -qty * unit); }
}

/**
 * Nhận kết quả thanh toán của một ngày giải: bên bán nhận tiền phần khớp (chia cho doanh nghiệp đã giao theo giá trị),
 * phần bên mua không nhận thì bán cho thế giới máy theo giá xuất khẩu; bên mua được hoàn phần trả trước không khớp,
 * hàng đã nhận mà bên bán không giao thì trả thêm cho đủ giá nhập từ thế giới máy.
 */
export function applyClear(c, e) {
  const L = c.league;
  if (!L || !e || (L.applied && L.applied[e.day])) return false;
  const U = (L.used && L.used[e.day]) || { cells: { buy: {}, sell: {} } }, b = c.biz;
  const sale = c.fn && c.fn.saleIncome;
  for (const k of MKT_KINDS) {
    const sc = U.cells.sell[k] || {}, sVal = Object.values(sc).reduce((a, x) => a + x.value, 0), sQty = Object.values(sc).reduce((a, x) => a + x.qty, 0);
    const got = +(e.receive && e.receive[k]) || 0, uq = Math.min(sQty, +(e.unmatchedSell && e.unmatchedSell[k]) || 0);
    for (const [cell, x] of Object.entries(sc)) {
      const share = sVal > 0 ? (got * x.value) / sVal : 0;
      if (!c.level[cell] || !sale) { if (share > 0) { c.money += share; groupFlow(c, 'tradeIn', share); } continue; } // doanh nghiệp đã dỡ: tiền về ngân sách
      if (share > 0) sale(c, +cell, share, 'i', 'group:tradeIn');
      if (uq > 0 && sQty > 0) sale(c, +cell, ((uq * x.qty) / sQty) * priceOf(k) * PRICE.exportMult * mkt(c, k), 'i', 'export');
    }
    if (got > 0 && !sVal) { c.money += got; groupFlow(c, 'tradeIn', got); } // không còn ghi nhận giao hàng (bản lưu cũ): tiền về ngân sách
    const bc = U.cells.buy[k] || {}, bQty = Object.values(bc).reduce((a, x) => a + x.qty, 0);
    const refund = +(e.refund && e.refund[k]) || 0, ub = Math.min(bQty, +(e.unmatchedBuy && e.unmatchedBuy[k]) || 0);
    const paid = U.buy[k] ? U.buy[k].paid : 0, avg = U.buy[k] && U.buy[k].qty ? paid / U.buy[k].qty : 0;
    const extraUnit = Math.max(0, priceOf(k) * importMultOf(k) * mkt(c, k) - avg);
    for (const [cell, x] of Object.entries(bc)) {
      const share = bQty ? x.qty / bQty : 0;
      if (refund > 0) { b.money[cell] += refund * share; groupFlow(c, 'tradeRefund', refund * share); }
      if (ub > 0 && extraUnit > 0) { const extra = ub * share * extraUnit; b.money[cell] -= extra; world(c, 'import', -extra); }
    }
  }
  (L.applied || (L.applied = {}))[e.day] = true;
  (L.ackOut || (L.ackOut = [])).push(e.day);
  if (c.events) c.events.push({ type: 'leagueClear', day: e.day, receive: Object.values(e.receive || {}).reduce((a, v) => a + v, 0), refund: Object.values(e.refund || {}).reduce((a, v) => a + v, 0) });
  return true;
}

/** Số hàng đã mua / bán theo hợp đồng của các ngày giải đã qua, chưa thanh toán (gửi kèm bản tóm tắt). */
export function pendingUsed(c) {
  const L = c.league, out = {};
  if (!L || !L.used) return out;
  for (const [d, U] of Object.entries(L.used)) if ((!L.alloc || +d !== L.alloc.day) && !(L.applied && L.applied[d])) out[d] = { buy: U.buy, sell: U.sell };
  return out;
}

/** Hệ số nhu cầu thương mại / công nghiệp / văn phòng theo phần đầu tư được chia (1 = như khi chơi một mình). */
export const investK = (c) => (c.league && c.league.alloc && Number.isFinite(+c.league.alloc.invest) ? +c.league.alloc.invest : 1);

/** Ngày giải hiện tại theo đồng hồ máy (league: { start, dayMs }). */
export const leagueDayNow = (L, now = Date.now()) => Math.max(0, Math.floor((now - L.start) / L.dayMs));
/** Giờ game xa nhất thành phố được chạy tới lúc này. */
export const allowedHour = (L, now = Date.now()) => L.cityHour0 + (leagueDayNow(L, now) - L.joinDay + 1) * 24;

/** Vào nhóm: gắn trạng thái nhóm cho thành phố (server = phản hồi của /api/city/league). */
export function attachLeague(c, server) {
  const lg = server.league;
  c.league = { id: lg.id, start: lg.start, dayMs: lg.dayMs, joinDay: server.me ? server.me.joinDay : lg.day, cityHour0: c.hour - (c.hour % 24), alloc: server.alloc || null, outbox: null, drainedApplied: 0, standings: server.standings || [], season: lg.season };
  c.outside = { kind: 'league' };
  applyServer(c, server); // số thành viên, nông thôn chung, giờ ngày mới
}
export function detachLeague(c) { delete c.league; c.outside = null; }

/** Lưu / nạp phần nhóm của thành phố (bản lưu). */
export const packLeague = (c) => (c.league ? { used: c.league.used, applied: c.league.applied, ackOut: c.league.ackOut, id: c.league.id, start: c.league.start, dayMs: c.league.dayMs, joinDay: c.league.joinDay, cityHour0: c.league.cityHour0, drainedApplied: c.league.drainedApplied || 0, season: c.league.season, policy: c.league.policy ? { ask: c.league.policy.ask, tariff: c.league.policy.tariff } : undefined } : undefined);
export function unpackLeague(c, o) {
  if (!o || !o.id || !(o.dayMs > 0)) return;
  c.league = { id: String(o.id), start: +o.start || 0, dayMs: +o.dayMs, joinDay: o.joinDay | 0, cityHour0: o.cityHour0 | 0, drainedApplied: o.drainedApplied | 0, season: o.season | 0, alloc: null, outbox: null, standings: [], used: o.used && typeof o.used === 'object' ? o.used : {}, applied: o.applied && typeof o.applied === 'object' ? o.applied : {}, ackOut: Array.isArray(o.ackOut) ? o.ackOut.slice(-50) : [] };
  c.outside = { kind: 'league' };
  if (o.policy) { const P = policyOf(c); for (const k of MKT_KINDS) { if (+o.policy.ask?.[k] > 0) P.ask[k] = Math.min(TRADE.askMax, Math.max(TRADE.askMin, +o.policy.ask[k])); if (+o.policy.tariff?.[k] >= 0) P.tariff[k] = Math.min(TRADE.tariffMax, +o.policy.tariff[k]); } }
}

/**
 * Đồng bộ đồng hồ khi mở lại: thành phố chậm hơn ngày giải thì chạy bù tối đa CATCHUP_MAX_DAYS ngày (catchUp của sim),
 * phần còn lại bỏ qua (dời mốc). Trả về { ran, skipped } (giờ game).
 */
export function syncClock(c, catchUp, now = Date.now()) {
  const L = c.league;
  if (!L) return { ran: 0, skipped: 0 };
  const behind = allowedHour(L, now) - 24 - c.hour; // chạy tới đầu ngày giải hiện tại
  if (behind <= 0) return { ran: 0, skipped: 0 };
  const r = catchUp(c, behind, CATCHUP_MAX_DAYS * 24);
  if (r.skipped > 0) L.cityHour0 -= r.skipped; // thời gian vắng quá dài: không chạy, coi như thành phố đứng yên
  return { ran: r.hours, skipped: r.skipped };
}

// ───────────────────────── gọi máy chủ ─────────────────────────
async function call(token, method, path, body) {
  if (!token) return { ok: false, status: 401, error: 'Chưa đăng nhập' };
  try {
    const res = await fetch(`/api/city/league${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, ...(await res.json().catch(() => ({ ok: false, error: `Lỗi ${res.status}` }))) };
  } catch { return { ok: false, status: 0, error: 'Không kết nối được máy chủ' }; }
}
export const leagueStatus = (token) => call(token, 'GET', '');
export const leagueJoin = (token, name) => call(token, 'POST', '/join', { name });
export const leagueReport = (token, name, report, used, ack) => call(token, 'POST', '/report', { name, report, used, ack });
export const leagueLeave = (token) => call(token, 'POST', '/leave', {});

/** Nhận phản hồi máy chủ: cập nhật phần chia (ngày mới thì phần mới, chưa dùng), bảng xếp hạng. */
export function applyServer(c, r) {
  if (!c.league || !r || !r.ok || !r.league) return;
  const L = c.league;
  L.start = r.league.start; L.dayMs = r.league.dayMs; L.standings = r.standings || L.standings; L.rural = r.league.rural; L.members = r.league.members; L.nextAt = r.league.nextAt; L.day = r.league.day;
  if (r.alloc && (!L.alloc || L.alloc.day !== r.alloc.day)) {
    L.alloc = { ...r.alloc, used: false };
    if (L.alloc.trade) for (const side of ['buy', 'sell']) for (const d of Object.values(L.alloc.trade[side] || {})) d.left = d.qty; // hợp đồng trong ngày: dùng dần
  }
  for (const e of r.clear || []) applyClear(c, e); // thanh toán hợp đồng các ngày trước
}

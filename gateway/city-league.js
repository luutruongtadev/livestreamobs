// Phố Mới — nhóm cạnh tranh (giai đoạn C của city/MULTIPLAYER.md).
// Mỗi người giữ thành phố riêng; máy chủ giữ các nguồn chung của nhóm và mỗi "ngày giải" (1 giờ thật) chia cho các
// thành phố theo sức hút trong bản tóm tắt ngày (city/js/world.js dailyReport). Không có hành động nhắm vào đối thủ.
//   GET  /api/city/league          → trạng thái của người chơi: nhóm, ngày giải, bảng xếp hạng, phần được chia hôm nay
//   POST /api/city/league/join     ← { name }  vào nhóm còn chỗ (hoặc mở nhóm mới)
//   POST /api/city/league/report   ← { report } bản tóm tắt ngày gần nhất của thành phố → trả lại phần được chia
//   POST /api/city/league/leave
// Store cần getLeague(id) / putLeague(league) / openLeagues(season) / leagueOf(owner) / setLeagueOf(owner, id | null).
import crypto from 'node:crypto';
import { prosperity } from '../city/js/world.js';
import { PRICE, PRODUCTS, priceOf, importMultOf } from '../city/js/base.js';
import { MKT_KINDS } from '../city/js/econ.js';

export const LEAGUE = {
  dayMs: 3600_000, // 1 ngày giải = 1 giờ thật
  seasonDays: 14, // một mùa = 14 ngày thật
  maxMembers: 30,
  ruralPerCity: 4000, // dân nông thôn của nhóm khi mở, tính theo số chỗ
  ruralFlow: 70, // mỗi thành phố đang chơi kéo tối đa chừng này người nông thôn ra mỗi ngày giải
  ruralGrow: 0.002,
  touristsPerCity: 260,
  newcomerDays: 6, // người mới vào: được ưu tiên nhận dân trong chừng này ngày giải
  abandonMs: 7 * 24 * 3600_000, // bỏ 7 ngày thật: dân chảy dần đi
  drain: 0.02,
  keepDays: 6, // giữ phần chia của bấy nhiêu ngày gần nhất
};
const KINDS = MKT_KINDS; // nguyên liệu thô + các thành phẩm (base.js PRODUCTS)
/** Giá chào bán (phần của giá chợ chung) và thuế nhập khẩu người chơi đặt được. */
export const TRADE = { askMin: 0.8, askMax: 1.2, tariffMax: 0.5 };
const importMult = importMultOf; // nhập từ thế giới máy đắt hơn giá chợ
const DEMAND = { agri: 120, wood: 90, ore: 80, oil: 60, fish: 90, ...Object.fromEntries(Object.entries(PRODUCTS).map(([k, p]) => [k, p.shop ? Math.round(p.shop * 450) : 70])) }; // nhu cầu của thị trường chung mỗi thành phố mỗi ngày

export const seasonOf = (t) => Math.floor(t / (LEAGUE.seasonDays * 24 * LEAGUE.dayMs));
export const dayOf = (lg, t) => Math.max(0, Math.floor((t - lg.start) / LEAGUE.dayMs));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? clamp(+v, lo, hi) : d);

/** Bản tóm tắt từ client: chỉ giữ các trường cần, ép trong khung để không ai gửi số ảo. */
export function cleanReport(r) {
  if (!r || typeof r !== 'object') return null;
  const want = r.want || {}, offer = {};
  for (const k of KINDS) offer[k] = { qty: num(r.offer?.[k]?.qty, 0, 1e6), price: num(r.offer?.[k]?.price, 0.3, 3, 1) };
  const pop = Math.round(num(r.pop, 0, 2e6));
  return {
    day: Math.round(num(r.day, 0, 1e6)), pop, homes: Math.round(num(r.homes, 0, 4e6)), vacHomes: Math.round(num(r.vacHomes, 0, 4e6)), jobs: Math.round(num(r.jobs, 0, 4e6)), vacJobs: Math.round(num(r.vacJobs, 0, 4e6)),
    wage: num(r.wage, 0, 1e4), tax: { r: num(r.tax?.r, 0, 30, 9), c: num(r.tax?.c, 0, 30, 9), i: num(r.tax?.i, 0, 30, 9) }, happy: num(r.happy, 0, 100, 50), landValue: num(r.landValue, 0, 100), pollution: num(r.pollution, 0, 100),
    want: { unemployed: Math.round(num(want.unemployed, 0, pop)), homeless: Math.round(num(want.homeless, 0, pop)), unhappy: Math.round(num(want.unhappy, 0, pop)), broke: Math.round(num(want.broke, 0, pop)) },
    wantTotal: Math.round(num(r.wantTotal, 0, pop)), left: Math.round(num(r.left, 0, pop)),
    offer, tourism: r.tourism ? { attract: num(r.tourism.attract, 0, 1e4), perDay: num(r.tourism.perDay, 0, 1e6), beds: num(r.tourism.beds, 0, 1e6) } : null,
    trade: { need: perKind(r.trade?.need, 0, 1e6), sold: perKind(r.trade?.sold, 0, 1e6), ask: perKind(r.trade?.ask, TRADE.askMin, TRADE.askMax, 1), tariff: perKind(r.trade?.tariff, 0, TRADE.tariffMax, 0) },
    gdp: num(r.gdp, 0, 1e12), money: num(r.money, -1e12, 1e12), income: num(r.income, 0, 1e10), expense: num(r.expense, 0, 1e10),
  };
}

function perKind(o, lo, hi, d = 0) { const out = {}; for (const k of KINDS) out[k] = num(o?.[k], lo, hi, d); return out; }

/**
 * Mua bán giữa các thành phố (hợp đồng giá trong một ngày giải). Bên mua: thành phố hôm qua nhập khẩu (need);
 * bên bán: hàng đang chào (offer) hoặc đã bán hôm qua (sold), giá = giá chợ chung × giá chào của người bán.
 * Giá tới tay bên mua = giá bán × (1 + thuế nhập khẩu của bên mua); chỉ mua khi rẻ hơn nhập từ thế giới máy, rẻ nhất trước.
 * Trả về { [owner]: { buy: { k: { qty, price, tariff, from } }, sell: { k: { qty, price, to } } } } (price: hệ số giá).
 */
export function matchTrade(active, prices) {
  const out = {}, deals = [];
  for (const m of active) out[m.owner] = { buy: {}, sell: {} };
  Object.defineProperty(out, 'pairs', { value: deals, enumerable: false }); // từng cặp mua / bán: để thanh toán (clearTrades)
  for (const k of KINDS) {
    const P = prices[k] || 1, world = P * importMult(k), pairs = [];
    const cap = new Map(active.map((m) => [m.owner, Math.floor(Math.max(m.report.offer[k].qty, m.report.trade.sold[k]))]));
    const need = new Map(active.map((m) => [m.owner, Math.floor(m.report.trade.need[k])]));
    for (const b of active) for (const s of active) {
      if (b === s || !need.get(b.owner) || !cap.get(s.owner)) continue;
      const ask = P * s.report.trade.ask[k], landed = ask * (1 + b.report.trade.tariff[k]);
      if (landed < world) pairs.push({ b, s, ask, landed });
    }
    pairs.sort((x, y) => x.landed - y.landed || x.ask - y.ask);
    for (const p of pairs) {
      const q = Math.min(need.get(p.b.owner), cap.get(p.s.owner));
      if (q <= 0) continue;
      need.set(p.b.owner, need.get(p.b.owner) - q); cap.set(p.s.owner, cap.get(p.s.owner) - q);
      deals.push({ b: p.b.owner, s: p.s.owner, k, qty: q, price: Math.round(p.ask * 1000) / 1000 });
      const bu = out[p.b.owner].buy[k] || (out[p.b.owner].buy[k] = { qty: 0, value: 0, tariff: p.b.report.trade.tariff[k], from: [] });
      bu.qty += q; bu.value += q * p.ask; if (!bu.from.includes(p.s.name)) bu.from.push(p.s.name);
      const se = out[p.s.owner].sell[k] || (out[p.s.owner].sell[k] = { qty: 0, value: 0, to: [] });
      se.qty += q; se.value += q * p.ask; if (!se.to.includes(p.b.name)) se.to.push(p.b.name);
    }
  }
  for (const o of Object.values(out)) for (const side of ['buy', 'sell']) for (const d of Object.values(o[side])) { d.price = Math.round((d.value / d.qty) * 1000) / 1000; delete d.value; }
  return out;
}

/**
 * Thanh toán hợp đồng của ngày giải `day` theo số hàng hai bên thật sự mua / bán (usage[owner] = { buy: { k: { qty, paid } },
 * sell: { k: { qty } } }). Tiền đi thẳng từ bên mua sang bên bán qua máy chủ: bên mua đã trả trước vào quỹ của nhóm (paid),
 * phần khớp với hàng bên bán đã giao chuyển cho bên bán, phần còn lại trả lại bên mua. Không chạm ví thế giới; tổng khớp tuyệt đối.
 * Trả về { [owner]: { day, receive: {k}, refund: {k}, unmatchedBuy: {k}, unmatchedSell: {k} } } (tiền theo đơn vị của game).
 */
export function clearTrades(pairs, usage, day) {
  const out = {}, get = (o) => out[o] || (out[o] = { day, receive: {}, refund: {}, unmatchedBuy: {}, unmatchedSell: {} });
  const total = (o, side, k) => pairs.filter((p) => (side === 'buy' ? p.b : p.s) === o && p.k === k).reduce((a, p) => a + p.qty, 0);
  const used = (o, side, k) => Math.max(0, +usage[o]?.[side]?.[k]?.qty || 0);
  const matched = new Map();
  for (const p of pairs) {
    const fb = Math.min(1, used(p.b, 'buy', p.k) / Math.max(1, total(p.b, 'buy', p.k))), fs = Math.min(1, used(p.s, 'sell', p.k) / Math.max(1, total(p.s, 'sell', p.k)));
    const q = Math.floor(p.qty * Math.min(fb, fs)), money = q * priceOf(p.k) * p.price;
    matched.set(p, q);
    const S = get(p.s); S.receive[p.k] = (S.receive[p.k] || 0) + money;
  }
  for (const o of Object.keys(usage)) for (const k of KINDS) {
    const b = usage[o]?.buy?.[k];
    if (b && b.qty > 0) {
      const mq = pairs.filter((p) => p.b === o && p.k === k).reduce((a, p) => a + matched.get(p), 0);
      const spent = pairs.filter((p) => p.b === o && p.k === k).reduce((a, p) => a + matched.get(p) * priceOf(k) * p.price, 0);
      const B = get(o); B.refund[k] = Math.max(0, (+b.paid || 0) - spent); B.unmatchedBuy[k] = Math.max(0, b.qty - mq);
    }
    const sl = usage[o]?.sell?.[k];
    if (sl && sl.qty > 0) { const mq = pairs.filter((p) => p.s === o && p.k === k).reduce((a, p) => a + matched.get(p), 0); get(o).unmatchedSell[k] = Math.max(0, sl.qty - mq); }
  }
  for (const o of Object.values(out)) for (const f of ['receive', 'refund']) for (const k in o[f]) o[f][k] = Math.round(o[f][k] * 100) / 100;
  return out;
}

/**
 * Giá chợ chung từng loại hàng: ((nhu cầu nhập hôm qua + độ sâu) / (hàng chào bán + độ sâu)) ^ 0,35, trong khoảng 45–190%.
 * Hàng chào bán = lớn hơn giữa hàng đang chờ trong kho và lượng đã bán hôm qua (thành phố xuất đều thì kho gần như trống);
 * độ sâu = phần mua bán của thế giới bên ngoài theo số thành phố. Không ai mua cũng không ai bán thì giá 100%.
 */
export function marketPrices(active) {
  const prices = {}, n = Math.max(1, active.length);
  for (const k of KINDS) {
    const supply = active.reduce((a, m) => a + Math.max(m.report.offer[k].qty, m.report.trade.sold[k]), 0);
    const need = active.reduce((a, m) => a + m.report.trade.need[k], 0), depth = DEMAND[k] * 0.5 * n;
    prices[k] = Math.round(clamp(Math.pow((need + depth) / (supply + depth), 0.35), 0.45, 1.9) * 1000) / 1000;
  }
  return prices;
}

/** Sức hút nhà ở (0..1): hài lòng, việc làm còn trống, lương, thuế, giá đất, ô nhiễm. */
export function homeAttract(r) {
  if (!r) return 0;
  const jobs = r.jobs ? clamp(r.vacJobs / Math.max(10, r.jobs), 0, 0.5) * 2 : 0;
  const wage = clamp(r.wage / 40, 0, 1.5) / 1.5;
  return clamp(r.happy / 100 * 0.4 + jobs * 0.25 + wage * 0.15 + (1 - r.tax.r / 20) * 0.1 + r.landValue / 100 * 0.1 - r.pollution / 100 * 0.15, 0.01, 1);
}
/** Môi trường kinh doanh (0..1): thuế doanh nghiệp, người còn chờ việc, giá đất. */
export function bizAttract(r) {
  if (!r) return 0;
  const labor = r.pop ? clamp(r.want.unemployed / Math.max(10, r.pop * 0.1), 0, 1) : 0;
  return clamp((1 - (r.tax.c + r.tax.i) / 40) * 0.5 + labor * 0.3 + r.landValue / 100 * 0.2, 0.01, 1);
}

/** Chia một lượng total theo trọng số, mỗi phần không vượt cap (đổ dần phần dư sang chỗ còn sức chứa). Trả về [phần, dư]. */
export function waterFill(total, weights, caps) {
  const out = weights.map(() => 0);
  let left = Math.max(0, Math.floor(total));
  for (let round = 0; round < 6 && left > 0; round++) {
    const open = weights.map((w, k) => (out[k] < caps[k] ? w : 0)), W = open.reduce((a, b) => a + b, 0);
    if (W <= 0) break;
    let given = 0;
    open.forEach((w, k) => { if (!w) return; const g = Math.min(caps[k] - out[k], Math.floor((left * w) / W)); out[k] += g; given += g; });
    if (!given) { const k = open.indexOf(Math.max(...open)); const g = Math.min(caps[k] - out[k], left); out[k] += g; given = g; }
    left -= given;
  }
  return [out, left];
}

/**
 * Chia nguồn chung của một ngày giải cho mọi thành viên (hàm thuần, test được). Thành viên offline dùng bản tóm tắt cuối;
 * bỏ quá abandonMs thì không nhận gì và mất dần dân về nguồn chung. Trả về { allocs: { owner: alloc }, rural, carry }.
 */
export function settle(lg, day, now) {
  const members = Object.values(lg.members), active = members.filter((m) => m.report && now - m.reportAt < LEAGUE.abandonMs);
  const gone = members.filter((m) => m.report && now - m.reportAt >= LEAGUE.abandonMs);
  // nguồn dân: nông thôn của nhóm (mỗi ngày chỉ kéo ra được một phần) + người vừa rời các thành phố + người hôm qua chưa có chỗ
  const fromRural = Math.min(lg.rural, LEAGUE.ruralFlow * active.length);
  let drained = 0;
  for (const m of gone) { const d = Math.ceil((m.report.pop - (m.drained || 0)) * LEAGUE.drain); if (d > 0) { m.drained = (m.drained || 0) + d; drained += d; } }
  const leavers = active.reduce((a, m) => a + (m.leftTaken ? 0 : m.report.left || 0), 0); // người rời đi chỉ tính một lần mỗi bản tóm tắt
  for (const m of active) m.leftTaken = true;
  const pool = fromRural + leavers + drained + (lg.carry || 0);
  const w = active.map((m) => Math.sqrt(homeAttract(m.report)) * (day - m.joinDay < LEAGUE.newcomerDays ? 1.5 : 1));
  const [mig, left] = waterFill(pool, w, active.map((m) => m.report.vacHomes));
  // du khách: chia theo căn bậc hai sức hút du lịch, ai không có cửa ngõ / điểm đến thì không có khách
  const tw = active.map((m) => (m.report.tourism && m.report.tourism.attract > 0 ? Math.sqrt(m.report.tourism.attract) : 0));
  const [tour] = waterFill(LEAGUE.touristsPerCity * active.length, tw, active.map((m) => (m.report.tourism ? Math.max(20, m.report.tourism.perDay * 3) : 0)));
  // đầu tư: hệ số nhu cầu thương mại / công nghiệp quanh 1, ai môi trường kinh doanh tốt hơn trung bình thì cao hơn
  const bw = active.map((m) => bizAttract(m.report)), bMean = bw.reduce((a, b) => a + b, 0) / Math.max(1, bw.length);
  const prices = marketPrices(active);
  const allocs = {}, trade = matchTrade(active, prices);
  if (trade.pairs.length) (lg.contracts || (lg.contracts = {}))[day] = trade.pairs;
  active.forEach((m, k) => {
    allocs[m.owner] = { day, migrants: mig[k], tourists: tour[k], invest: Math.round(clamp(0.6 + 0.4 * (bMean ? bw[k] / bMean : 1), 0.5, 1.5) * 100) / 100, prices, leave: 0, pool, fromRural, trade: trade[m.owner] };
  });
  for (const m of gone) allocs[m.owner] = { day, migrants: 0, tourists: 0, invest: 1, prices, leave: m.drained || 0, pool, abandoned: true };
  const takenRural = Math.min(fromRural, mig.reduce((a, b) => a + b, 0));
  lg.rural = Math.max(0, Math.round((lg.rural - takenRural) * (1 + LEAGUE.ruralGrow)));
  lg.carry = Math.min(left, 400 * Math.max(1, active.length)); // người chưa có chỗ chờ hôm sau (có giới hạn)
  return allocs;
}

/** Bảng xếp hạng: điểm thịnh vượng từ bản tóm tắt cuối (city/js/world.js prosperity). */
export function standings(lg, now) {
  return Object.values(lg.members).map((m) => ({ name: m.name, owner: m.owner, pop: m.report ? m.report.pop : 0, score: prosperity(m.report), happy: m.report ? Math.round(m.report.happy) : 0, online: !!m.reportAt && now - m.reportAt < 2 * LEAGUE.dayMs, abandoned: !!m.reportAt && now - m.reportAt >= LEAGUE.abandonMs }))
    .sort((a, b) => b.score - a.score || b.pop - a.pop);
}

export function createCityLeague({ store, now = Date.now } = {}) {
  const send = (res, head, status, obj) => { res.writeHead(status, { ...head, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const body = (req) => new Promise((resolve) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 200_000) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } }); req.on('error', () => resolve({})); });

  /** Chia nguồn cho các ngày giải chưa chia (tối đa vài ngày gần nhất); trả về league đã cập nhật. */
  function catchUp(lg, t) {
    const today = dayOf(lg, t);
    lg.settled = lg.settled || {};
    for (let d = Math.max(lg.lastSettled ?? -1, today - LEAGUE.keepDays) + 1; d <= today; d++) { lg.settled[d] = settle(lg, d, t); lg.lastSettled = d; }
    for (const d of Object.keys(lg.settled)) if (+d < today - LEAGUE.keepDays) delete lg.settled[d];
    // thanh toán hợp đồng: khi mọi bên đã báo số hàng thật sự mua / bán, hoặc đã quá 3 ngày giải
    lg.cleared = lg.cleared || {}; lg.usage = lg.usage || {};
    for (const d of Object.keys(lg.contracts || {})) {
      if (+d >= today || lg.cleared[d]) continue;
      const pairs = lg.contracts[d], parties = new Set(pairs.flatMap((p) => [p.b, p.s])), use = lg.usage[d] || {};
      if ([...parties].every((o) => use[o]) || today - d >= 3) lg.cleared[d] = clearTrades(pairs, use, +d);
    }
    for (const d of Object.keys(lg.contracts || {})) if (+d < today - 2 * LEAGUE.keepDays) { delete lg.contracts[d]; delete lg.usage[d]; delete lg.cleared[d]; }
    return today;
  }
  const view = (lg, owner, t) => {
    const today = dayOf(lg, t), m = lg.members[owner];
    return { ok: true, league: { id: lg.id, season: lg.season, start: lg.start, day: today, dayMs: LEAGUE.dayMs, nextAt: lg.start + (today + 1) * LEAGUE.dayMs, members: Object.keys(lg.members).length, rural: lg.rural }, me: m ? { name: m.name, joinDay: m.joinDay, joinedAt: m.joinedAt } : null, alloc: lg.settled?.[today]?.[owner] || null, standings: standings(lg, t), clear: Object.values(lg.cleared || {}).map((c) => c[owner]).filter((c) => c && !c.acked) };
  };

  async function handle(req, res, head, pathname) {
    try {
      const auth = String(req.headers.authorization || ''), token = auth.startsWith('Bearer ') ? auth.slice(7).trim().slice(0, 4096) : '';
      const user = token ? await store.verifyUser(token).catch(() => null) : null;
      if (!user) return send(res, head, 401, { ok: false, error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
      const t = now(), action = pathname.replace(/^\/api\/city\/league\/?/, '');
      const mine = await store.leagueOf(user.id);
      let lg = mine ? await store.getLeague(mine) : null;
      if (lg && lg.season !== seasonOf(t)) lg = null; // mùa mới: vào lại nhóm mới
      if (!action) {
        if (req.method !== 'GET') return send(res, head, 405, { ok: false });
        if (!lg) return send(res, head, 200, { ok: true, league: null, season: seasonOf(t) });
        catchUp(lg, t); await store.putLeague(lg);
        return send(res, head, 200, view(lg, user.id, t));
      }
      if (req.method !== 'POST') return send(res, head, 405, { ok: false });
      const b = await body(req);
      if (action === 'join') {
        if (!lg) {
          const open = (await store.openLeagues(seasonOf(t))).filter((g) => Object.keys(g.members).length < LEAGUE.maxMembers);
          lg = open.sort((a, b2) => Object.keys(b2.members).length - Object.keys(a.members).length)[0] || null; // lấp nhóm đông trước
          if (!lg) lg = { id: crypto.randomBytes(6).toString('hex'), season: seasonOf(t), start: t, rural: 0, carry: 0, members: {}, settled: {}, lastSettled: -1 };
          catchUp(lg, t);
          lg.rural += LEAGUE.ruralPerCity;
          lg.members[user.id] = { owner: user.id, name: String(b.name || 'Phố Mới').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'Phố Mới', joinedAt: t, joinDay: dayOf(lg, t), report: null, reportAt: 0 };
          await store.putLeague(lg); await store.setLeagueOf(user.id, lg.id);
        }
        return send(res, head, 200, view(lg, user.id, t));
      }
      if (!lg || !lg.members[user.id]) return send(res, head, 404, { ok: false, error: 'Chưa vào nhóm nào' });
      if (action === 'report') {
        const rep = cleanReport(b.report);
        if (!rep) return send(res, head, 400, { ok: false, error: 'Bản tóm tắt không hợp lệ' });
        const m = lg.members[user.id];
        m.report = rep; m.reportAt = t; m.drained = 0; m.leftTaken = false;
        lg.usage = lg.usage || {}; lg.cleared = lg.cleared || {};
        for (const [d, u] of Object.entries(b.used && typeof b.used === 'object' ? b.used : {})) { // số hàng thật sự mua / bán theo hợp đồng của từng ngày giải đã qua
          if (!lg.contracts?.[d] || lg.cleared[d] || +d >= dayOf(lg, t)) continue;
          const cu = { buy: {}, sell: {} };
          for (const k of KINDS) { if (u?.buy?.[k]) cu.buy[k] = { qty: num(u.buy[k].qty, 0, 1e6), paid: num(u.buy[k].paid, 0, 1e9) }; if (u?.sell?.[k]) cu.sell[k] = { qty: num(u.sell[k].qty, 0, 1e6) }; }
          (lg.usage[d] || (lg.usage[d] = {}))[user.id] = cu;
        }
        for (const d of Array.isArray(b.ack) ? b.ack.slice(0, 50) : []) if (lg.cleared[d]?.[user.id]) lg.cleared[d][user.id].acked = true; // đã nhận tiền thanh toán
        if (b.name) m.name = String(b.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || m.name;
        catchUp(lg, t);
        if (!lg.settled[dayOf(lg, t)][user.id]) lg.settled[dayOf(lg, t)][user.id] = { day: dayOf(lg, t), migrants: 0, tourists: 0, invest: 1, prices: Object.values(lg.settled[dayOf(lg, t)])[0]?.prices || null, leave: 0, late: true }; // vào sau lúc chia: hôm nay chưa có phần
        await store.putLeague(lg);
        return send(res, head, 200, view(lg, user.id, t));
      }
      if (action === 'leave') {
        delete lg.members[user.id];
        await store.putLeague(lg); await store.setLeagueOf(user.id, null);
        return send(res, head, 200, { ok: true, league: null });
      }
      return send(res, head, 404, { ok: false });
    } catch (e) {
      return send(res, head, 500, { ok: false, error: 'Lỗi máy chủ nhóm cạnh tranh' });
    }
  }
  return { handle };
}

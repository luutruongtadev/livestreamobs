// Phố Mới — "thế giới bên ngoài" thay được và bản tóm tắt mỗi ngày của thành phố.
//
// Mọi thứ thành phố trao đổi với bên ngoài (giá thị trường, du khách, chuyến bay quốc tế, nông thôn) đi qua một provider:
//   - 'ai': thế giới máy cho chơi một mình (mặc định, chính là các hệ thống hiện có trong econ.js, intl.js, ledger.js);
//   - provider khác (ví dụ máy chủ vùng cho chơi nhiều người) đăng ký bằng registerWorld và thay từng phần.
// Mỗi 0 giờ, thành phố lập bản tóm tắt (dailyReport) và giao cho provider (report): thế giới máy chỉ giữ lịch sử,
// máy chủ vùng sẽ gửi lên để chia dân, doanh nghiệp, du khách, ghép chợ (xem MULTIPLAYER.md).
import { N, ZDEF, RAW_KINDS, productAt, resCap, jobCap, clamp } from './base.js';
import { marketDay, tourismHour, tourismDay, tourismScore, mkt, MKT_KINDS } from './econ.js';
import { intlHour, intlDay } from './intl.js';
import { ruralDay, ledgerSummary } from './ledger.js';

export const AI_WORLD = {
  kind: 'ai', name: 'Thế giới máy',
  marketDay, tourismHour, tourismDay, intlHour, intlDay, ruralDay,
  report() {}, // chơi một mình: không gửi đi đâu
};
const PROVIDERS = { ai: AI_WORLD };

/** Đăng ký một provider (impl thiếu hàm nào thì dùng của thế giới máy). */
export function registerWorld(kind, impl) { PROVIDERS[kind] = { ...AI_WORLD, ...impl, kind }; }
/** Provider đang dùng của thành phố (c.outside = { kind }). */
export const outside = (c) => (c.outside && PROVIDERS[c.outside.kind]) || AI_WORLD;

const REPORT_KEEP = 14;

/**
 * Bản tóm tắt một ngày: những gì máy chủ vùng cần để chia nguồn chung, cũng dùng cho bảng báo cáo trong game.
 * Chỉ số trung bình theo ô / người; tiền theo đơn vị ngân sách.
 */
export function dailyReport(c) {
  const pp = c.pp, s = c.stats, ps = c.pstats;
  let vacHomes = 0, vacJobs = 0, homes = 0, lv = 0, pol = 0, cells = 0, wageSum = 0, wageN = 0;
  for (let i = 0; i < N * N; i++) {
    if (!c.level[i]) continue;
    const z = c.zone[i], L = c.level[i], rc = resCap(z, L), jb = jobCap(z, L);
    if (rc) { homes += rc; vacHomes += Math.max(0, rc - c.resCount[i]); lv += c.landValue[i]; pol += c.pollution[i]; cells++; }
    if (jb) { vacJobs += Math.max(0, jb - c.staff[i]); if (c.fn && c.fn.wageAt) { wageSum += c.fn.wageAt(c, i) * jb; wageN += jb; } }
  }
  // người muốn rời đi: thất nghiệp lâu, vô gia cư, rất bất mãn, nợ nhiều
  const want = { unemployed: 0, homeless: 0, unhappy: 0, broke: 0 };
  for (let id = 0; id < pp.n; id++) {
    if (!pp.alive[id] || pp.age[id] < 18) continue;
    if (pp.home[id] < 0) want.homeless++;
    else if (pp.work[id] < 0 && !pp.enrolled[id] && pp.age[id] < 65 && pp.idle[id] > 3) want.unemployed++;
    else if (pp.happy[id] < 30) want.unhappy++;
    else if (pp.money[id] < 0) want.broke++;
  }
  // hàng chào bán: tồn kho chờ xe chở ở cơ sở khai thác, nhà máy (đơn vị) và giá thị trường hiện tại
  const offer = {};
  for (const k of MKT_KINDS) offer[k] = { qty: 0, price: Math.round(mkt(c, k) * 100) / 100 };
  for (let i = 0; i < N * N; i++) {
    if (!c.level[i] || !jobCap(c.zone[i], c.level[i])) continue;
    const zd = ZDEF[c.zone[i]];
    if (zd.raw && offer[zd.raw]) offer[zd.raw].qty += c.biz.sout[i];
    else if (zd.biz === 'ind') offer[productAt(i, c.zone[i])].qty += c.biz.sout[i]; // thành phẩm của nhà máy / xưởng
  }
  for (const k in offer) offer[k].qty = Math.round(offer[k].qty);
  const led = ledgerSummary(c), tour = c.tour ? (c.tour.score || tourismScore(c)) : null;
  return {
    day: c.day, pop: s.pop, rural: c.popl ? c.popl.rural : null,
    homes, vacHomes, jobs: s.jobs, vacJobs, wage: wageN ? Math.round((wageSum / wageN) * 10) / 10 : 0,
    tax: { ...c.tax }, happy: Math.round(ps.happy || 0), landValue: cells ? Math.round(lv / cells) : 0, pollution: cells ? Math.round((pol / cells) * 100) : 0,
    want, wantTotal: want.unemployed + want.homeless + want.unhappy + want.broke,
    offer, tourism: tour ? { attract: tour.attract, perDay: tour.perDay, beds: tour.beds } : null,
    money: Math.round(c.money), income: s.income, expense: s.expense,
    gdp: Math.round(led.inner.reduce((a, r) => a + (r.key === 'shop' || r.key === 'supply' || r.key === 'procure' ? r.v : 0), 0) + led.rows.filter((r) => r.v > 0 && r.group === 'private').reduce((a, r) => a + r.v, 0)),
    flows: { inflow: led.inflow, outflow: led.outflow },
  };
}

/** 0 giờ mỗi ngày: lập báo cáo, giữ lịch sử, giao cho provider. */
export function reportDay(c) {
  const rep = dailyReport(c);
  c.reports = [...(c.reports || []), rep].slice(-REPORT_KEEP);
  outside(c).report(c, rep);
  return rep;
}

/** Điểm thịnh vượng (dùng cho bảng hạng sau này, MULTIPLAYER.md mục 4.1): chất lượng sống hơn là độ to. */
export function prosperity(rep) {
  if (!rep || !rep.pop) return 0;
  const perHead = rep.gdp / rep.pop, jobless = rep.want.unemployed / Math.max(1, rep.pop);
  return Math.round(clamp(perHead / 40, 0, 40) + rep.happy * 0.4 + (100 - rep.pollution) * 0.1 - jobless * 60 + Math.log10(rep.pop + 1) * 4);
}

// Phố Mới — kinh tế mở rộng: ngân sách theo ngành, giá thị trường xuất nhập khẩu, du lịch.
import { SERVICES, RAW, RAW_KINDS, ZDEF, N, clamp } from './base.js';
import { initIntl, packIntl } from './intl.js';
import { festMul } from './seasons.js';
import { councilMod } from './council.js';

// ───────────────────────── ngân sách theo ngành ─────────────────────────

/** Ngành ngân sách. Mức chi 50–150%: chi ít thì công trình yếu đi (bán kính, số xe, chỗ học), chi nhiều thì mạnh hơn. */
export const SECTORS = {
  edu: { name: 'Giáo dục', icon: '🎓', desc: 'Trường học, đại học, viện nghiên cứu: chỗ học, bán kính, tốc độ ra điểm phát triển' },
  health: { name: 'Y tế', icon: '🏥', desc: 'Trạm y tế, bệnh viện: số xe cứu thương, bán kính' },
  safety: { name: 'An ninh', icon: '🚓', desc: 'Công an, cứu hoả, trại giam, tháp canh: số xe, bán kính' },
  transport: { name: 'Giao thông', icon: '🛣️', desc: 'Bảo trì đường, xe buýt, metro: mặt đường xuống cấp nhanh hay chậm, xe cứu hộ' },
};
const COVER_SECTOR = { edu: 'edu', sci: 'edu', health: 'health', police: 'safety', fire: 'safety', watch: 'safety' };

/** Ngành của một loại công trình (null nếu không thuộc ngành nào). */
export function sectorOf(type) {
  const d = SERVICES[type];
  if (!d) return null;
  if (d.cover && COVER_SECTOR[d.cover]) return COVER_SECTOR[d.cover];
  if (d.cells) return 'safety';
  if (d.budget === 'roads' || d.depot) return 'transport';
  return null;
}

/** Hệ số ngân sách của ngành (1 = 100%). */
export const budgetK = (c, sector) => (c.budget && sector ? c.budget[sector] / 100 : 1);

// ───────────────────────── giá thị trường ─────────────────────────

export const MKT_KINDS = [...RAW_KINDS, 'goods'];
export const MKT_NAME = { ...Object.fromEntries(RAW_KINDS.map((k) => [k, `${RAW[k].icon} ${RAW[k].name}`])), goods: '📦 Hàng hoá' };
const MKT_NEWS = {
  up: { agri: 'Mất mùa ở nơi khác, nông sản lên giá', wood: 'Khan hiếm gỗ, giá gỗ tăng', ore: 'Nhu cầu thép thế giới tăng, khoáng sản lên giá', oil: 'Giá dầu thế giới tăng vọt', fish: 'Mùa biển động, cá lên giá', goods: 'Hàng hoá đang được săn đón' },
  down: { agri: 'Được mùa khắp nơi, nông sản rớt giá', wood: 'Thừa gỗ, giá gỗ giảm', ore: 'Khoáng sản ế ẩm', oil: 'Giá dầu thế giới lao dốc', fish: 'Được mùa cá, giá giảm', goods: 'Thị trường hàng hoá bão hoà' },
};

/** Hệ số giá thị trường bên ngoài của một loại hàng (1 = giá gốc). Áp vào giá nhập khẩu và xuất khẩu. */
export const mkt = (c, kind) => (c.market && c.market.p[kind]) || 1;

/** Mỗi ngày: giá trôi ngẫu nhiên quanh giá gốc, thỉnh thoảng có tin sốc giá. Lưu 60 ngày gần nhất để vẽ biểu đồ. */
export function marketDay(c) {
  const m = c.market, rng = c.rng || Math.random;
  const gauss = () => (rng() + rng() + rng() - 1.5) * 0.8;
  for (const k of MKT_KINDS) m.p[k] = clamp(m.p[k] + (1 - m.p[k]) * 0.12 + gauss() * 0.07, 0.45, 1.9);
  if (rng() < 0.08) { // tin sốc giá
    const k = MKT_KINDS[(rng() * MKT_KINDS.length) | 0], up = rng() < 0.5;
    m.p[k] = clamp(m.p[k] + (up ? 0.35 : -0.3), 0.45, 1.9);
    m.news = { day: c.day, kind: k, up, text: MKT_NEWS[up ? 'up' : 'down'][k] };
    if (c.events) c.events.push({ type: 'market', text: m.news.text, kind: k, up });
  }
  for (const k of MKT_KINDS) m.p[k] = Math.round(m.p[k] * 1000) / 1000;
  m.hist.push(MKT_KINDS.map((k) => m.p[k]));
  if (m.hist.length > 60) m.hist.shift();
}

// ───────────────────────── du lịch ─────────────────────────

/** Sức hút du lịch của thành phố và các nguồn của nó. */
export function tourismScore(c) {
  let attract = 0, beds = 0, gates = 0;
  const parts = {};
  for (const s of c.services) {
    const d = SERVICES[s.type];
    if (d.attract) { attract += d.attract; parts[s.type] = (parts[s.type] || 0) + d.attract; }
    if (d.beds) beds += d.beds;
  }
  let leisure = 0;
  for (let i = 0; i < N * N; i++) if (c.level[i] && ZDEF[c.zone[i]].biz === 'leisure') leisure += c.level[i];
  attract += Math.min(12, leisure * 0.15);
  // cửa ngõ đón khách: đường vào thành phố, ga, sân bay, tàu khách ra biển
  if (c.entryLinked) gates += 1;
  for (const s of c.services) gates += s.type === 'train' ? 1.5 : s.type === 'airport' ? 3 : 0;
  for (const l of c.ferries || []) if (l.out) gates += 1;
  const happy = c.pstats ? c.pstats.happy : 55;
  const k = clamp(0.6 + (happy - 45) / 60, 0.4, 1.4); // thành phố vui vẻ, sạch sẽ thì khách thích
  return { attract: Math.round(attract * 10) / 10, beds, gates, leisure, mood: k, perDay: Math.round(attract * 5 * Math.min(4, gates) * k * (c.fest ? festMul(c, 'tour') : 1) * councilMod(c, 'tour')), fest: c.fest ? festMul(c, 'tour') : 1 };
}

/**
 * Mỗi giờ: du khách tới (ban ngày), khách lưu trú ở khách sạn trả tiền phòng, ai cũng tiêu tiền ở quán xá, cửa hàng.
 * spend(c, n, perHead): rải tiền tiêu vào doanh nghiệp (people.js). Trả về tiền phòng thành phố thu trong giờ.
 */
export function tourismHour(c, spend) {
  const t = c.tour, h = c.hour % 24, sc = tourismScore(c), rng = c.rng || Math.random;
  t.score = sc;
  if (!sc.gates || !sc.perDay) { t.guests = Math.max(0, t.guests - Math.ceil(t.guests / 8)); return 0; }
  // khách tới rải trong ngày, nhiều nhất buổi sáng và đầu giờ chiều
  const share = h >= 7 && h <= 19 ? (h <= 10 || (h >= 13 && h <= 15) ? 0.11 : 0.06) : 0;
  const arrive = Math.round(sc.perDay * share * (0.75 + rng() * 0.5));
  // lưu trú: khách ở lại 1–3 đêm nếu còn phòng; mỗi giờ một phần khách trả phòng
  const leave = Math.ceil(t.guests / 36);
  t.guests = Math.max(0, t.guests - leave);
  const stay = Math.min(Math.round(arrive * 0.55), Math.max(0, sc.beds - t.guests));
  t.guests += stay;
  const dayTrip = arrive - stay;
  const rooms = h === 20 ? t.guests * t.roomFee : 0; // tính tiền phòng mỗi đêm lúc 20 giờ
  spend(c, dayTrip, 6); // khách đi trong ngày
  if (t.guests && h >= 8 && h <= 21) spend(c, Math.ceil(t.guests / 8), 9); // khách lưu trú đi chơi, ăn uống
  t.day.visitors += arrive; t.day.stayed += stay; t.day.rooms += rooms;
  return rooms;
}

export function tourismDay(c) {
  const t = c.tour;
  t.last = { ...t.day, guests: t.guests, beds: t.score ? t.score.beds : 0 };
  t.day = { visitors: 0, stayed: 0, rooms: 0, ferry: 0 };
}

// ───────────────────────── khởi tạo, lưu / nạp ─────────────────────────

export function initEcon(c, o = {}) {
  const b = o.budget || {};
  c.budget = {};
  for (const k in SECTORS) c.budget[k] = clamp(Math.round(Number.isFinite(+b[k]) ? +b[k] : 100), 50, 150);
  const m = o.market;
  c.market = { p: {}, hist: [], news: null };
  for (const k of MKT_KINDS) c.market.p[k] = m && Number.isFinite(+m.p?.[k]) ? clamp(+m.p[k], 0.45, 1.9) : 1;
  if (m && Array.isArray(m.hist)) c.market.hist = m.hist.filter((r) => Array.isArray(r) && r.length === MKT_KINDS.length).slice(-60).map((r) => r.map((v) => clamp(+v || 1, 0.45, 1.9)));
  if (!c.market.hist.length) c.market.hist.push(MKT_KINDS.map((k) => c.market.p[k]));
  const t = o.tour || {};
  initIntl(c, o.intl || {});
  c.tour = { guests: Math.max(0, t.guests | 0), roomFee: clamp(Number.isFinite(+t.roomFee) ? +t.roomFee : 12, 0, 40), day: { visitors: 0, stayed: 0, rooms: 0, ferry: 0 }, last: null, score: null };
}

export function packEcon(c) {
  return { budget: c.budget, market: { p: c.market.p, hist: c.market.hist }, tour: { guests: c.tour.guests, roomFee: c.tour.roomFee }, intl: packIntl(c) };
}

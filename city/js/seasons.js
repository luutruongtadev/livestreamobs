// Phố Mới — lịch âm, lễ hội Việt Nam và mùa mưa bão (bão, ngập lụt, triều cường).
// Lịch rút gọn: 10 ngày game = 1 tháng âm, 120 ngày = 1 năm. Mỗi ngày game ứng với ngày âm 1, 4, 7, ... 28 của tháng.
import { N, SERVICES, idx, inMap, clamp, cellOf, climateOf } from './base.js';
import { cityPay } from './ledger.js';
import { distFx } from './districts.js';

export const MONTH_DAYS = 10, YEAR_DAYS = 120;
const OFFSET = 20; // thành phố mới bắt đầu từ tháng 3 âm: còn thời gian chuẩn bị trước mùa bão và Tết

/** Ngày âm lịch của ngày game: { year, month 1..12, k (thứ tự ngày trong tháng 0..9), day (ngày âm hiển thị) }. */
export function lunar(day) {
  const d = day + OFFSET, r = ((d % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS, k = r % MONTH_DAYS;
  return { year: Math.floor(d / YEAR_DAYS) + 1, month: Math.floor(r / MONTH_DAYS) + 1, k, day: k * 3 + 1 };
}
/** Ngày game bắt đầu của (tháng, k) gần nhất kể từ hôm nay (kể cả hôm nay). */
function nextDay(day, month, k) {
  const r = (((day + OFFSET) % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS, want = (month - 1) * MONTH_DAYS + k;
  return day + ((want - r + YEAR_DAYS) % YEAR_DAYS);
}

/**
 * Các dịp lễ trong năm. k0..k1: những ngày trong tháng có lễ. Hệ số (mặc định 1): tour du khách trong nước,
 * intl khách quốc tế, comm thuế thương mại cộng thêm, ind năng suất xưởng / nhà máy; happy: dân vui thêm.
 */
// deco: trang trí phố trong dịp lễ (render.js): lantern = đèn lồng treo dây điện, flag = cờ trên cột điện
// nation: ngày lễ quốc gia, nhà nhà treo cờ đỏ sao vàng ở ban công, cửa sổ chung cư
export const FESTIVALS = [
  { id: 'chotet', deco: 'lantern flag', name: 'Chợ Tết, sắm Tết', icon: '🌸', month: 12, k0: 7, k1: 9, tour: 1.15, comm: 0.15, happy: 2, desc: 'Chợ hoa, mua sắm cuối năm: cửa hàng đắt khách, đường phố đông' },
  { id: 'tet', deco: 'lantern flag', nation: true, name: 'Tết Nguyên Đán', icon: '🧧', month: 1, k0: 0, k1: 2, tour: 1.5, intl: 1.6, comm: 0.1, ind: 0.3, happy: 6, fireworks: true, desc: 'Nhà máy nghỉ Tết, Việt kiều và du khách về đông, pháo hoa đêm giao thừa' },
  { id: 'saute', name: 'Sau Tết', icon: '🧳', month: 1, k0: 3, k1: 4, ind: 0.65, desc: 'Công nhân chưa về đủ, xưởng thiếu người' },
  { id: 'ramgieng', deco: 'lantern', name: 'Rằm tháng Giêng, lễ chùa', icon: '🏮', month: 1, k0: 5, k1: 5, tour: 1.35, happy: 2, venue: 'pagoda', desc: 'Người đi lễ chùa đông: chùa cổ hút khách gấp đôi' },
  { id: 'giohung', deco: 'flag', nation: true, name: 'Giỗ Tổ Hùng Vương', icon: '🏯', month: 3, k0: 3, k1: 3, tour: 1.2, happy: 3, desc: 'Ngày nghỉ lễ, dân đi chơi, dâng hương' },
  { id: 'thongnhat', deco: 'flag', nation: true, name: 'Ngày Thống nhất 30/4, Quốc tế Lao động 1/5', icon: '🇻🇳', month: 3, k0: 9, k1: 9, tour: 1.25, ind: 0.8, happy: 3, desc: 'Nghỉ lễ dài ngày (30/4 dương lịch, lịch game rút gọn): phố phường, chung cư rợp cờ đỏ sao vàng, dân đi chơi xa' },
  { id: 'doanngo', deco: 'flag', name: 'Tết Đoan Ngọ, đua thuyền', icon: '🚣', month: 5, k0: 1, k1: 1, tour: 1.3, happy: 2, venue: 'beach', desc: 'Đua thuyền trên sông: tổ chức ở bãi biển / bờ sông thì hút khách mạnh' },
  { id: 'vulan', deco: 'lantern', name: 'Lễ Vu Lan', icon: '🪷', month: 7, k0: 5, k1: 5, tour: 1.1, happy: 2, venue: 'pagoda', desc: 'Mùa báo hiếu, người đi chùa' },
  { id: 'quockhanh', deco: 'flag', nation: true, name: 'Quốc khánh 2/9', icon: '🇻🇳', month: 7, k0: 9, k1: 9, tour: 1.25, ind: 0.8, happy: 4, fireworks: true, desc: 'Ngày độc lập (2/9 dương lịch, lịch game rút gọn): cờ đỏ sao vàng treo khắp ban công chung cư, pháo hoa đêm lễ' },
  { id: 'trungthu', deco: 'lantern', name: 'Tết Trung Thu', icon: '🥮', month: 8, k0: 4, k1: 5, tour: 1.3, intl: 1.15, comm: 0.08, happy: 4, fireworks: true, desc: 'Rước đèn, phá cỗ: trẻ em vui, phố lồng đèn hút khách' },
];
const FEST = Object.fromEntries(FESTIVALS.map((f) => [f.id, f]));

/** Quy mô tổ chức lễ hội: chi phí, hệ số khách. */
export const FEST_SCALE = [null, { name: 'Nhỏ', cost: 4000, k: 1 }, { name: 'Vừa', cost: 12000, k: 2 }, { name: 'Lớn', cost: 30000, k: 3 }];
/** Nơi tổ chức lễ hội được. */
export const VENUES = ['plaza', 'stadium', 'pagoda', 'monument', 'market', 'theater', 'beach', 'museum', 'skytower'];

/** Lễ đang diễn ra hôm nay (hoặc null), kèm ngày bắt đầu đợt lễ này. */
export function festivalNow(c, day = c.day) {
  const L = lunar(day);
  for (const f of FESTIVALS) if (f.month === L.month && L.k >= f.k0 && L.k <= f.k1) return { f, start: day - (L.k - f.k0) };
  return null;
}

/** Các dịp lễ sắp tới: [{ f, start, inDays }] theo thứ tự gần nhất. */
export function upcomingFestivals(c, n = 5) {
  const now = festivalNow(c), out = [];
  if (now) out.push({ f: now.f, start: now.start, inDays: 0 });
  for (const f of FESTIVALS) {
    if (f.id === 'saute') continue; // không phải dịp để tổ chức
    const start = nextDay(c.day, f.month, f.k0);
    if (now && now.f === f) continue;
    out.push({ f, start, inDays: start - c.day });
  }
  return out.sort((a, b) => a.inDays - b.inDays).slice(0, n);
}

const orgOf = (c, now) => (now && c.fest && c.fest.org && c.fest.org.id === now.f.id && c.fest.org.start === now.start ? c.fest.org : null);

/** Hệ số của lễ hôm nay (key: 'tour' | 'intl' | 'ind' | 'comm'); comm trả về phần cộng thêm, các key khác là hệ số nhân. */
export function festMul(c, key) {
  const now = festivalNow(c);
  if (!now) return key === 'comm' ? 0 : 1;
  const org = orgOf(c, now), v = now.f[key] ?? (key === 'comm' ? 0 : 1), sc = org ? org.scale : 0;
  if (key === 'tour') return v * (1 + 0.35 * sc) * (org && org.venueBonus ? 1.3 : 1);
  if (key === 'intl') return v * (1 + 0.3 * sc);
  if (key === 'comm') return v + 0.04 * sc;
  return v;
}
/** Dân vui thêm bao nhiêu điểm nhờ lễ hôm nay. */
export function festHappy(c) {
  const now = festivalNow(c);
  if (!now) return 0;
  const org = orgOf(c, now);
  return (now.f.happy || 0) + (org ? org.scale * 2 * (org.safe ? 1 : 0.5) : 0);
}
/** Đêm nay có bắn pháo hoa không (lễ có pháo hoa, hoặc lễ được tổ chức quy mô vừa trở lên): danh sách uid nơi bắn. */
export function fireworksAt(c) {
  const now = festivalNow(c), h = c.hour % 24;
  if (!now || (h < 19 && h > 1)) return [];
  const org = orgOf(c, now);
  if (org && (org.scale >= 2 || now.f.fireworks)) return [org.venue];
  if (now.f.fireworks && now.f.id === 'tet' && lunar(c.day).k === 0) { const v = c.services.find((s) => VENUES.includes(s.type)); return v ? [v.uid] : []; } // đêm giao thừa
  return [];
}

/** Có tổ chức được lễ f (đợt bắt đầu ngày start) không: { ok, reason, cost, venue }. */
export function canOrganize(c, id, start, scale) {
  const f = FEST[id], S = FEST_SCALE[scale];
  if (!f || !S) return { ok: false, reason: 'Không có lễ này' };
  if (start + (f.k1 - f.k0) < c.day) return { ok: false, reason: 'Lễ đã qua' };
  if (start - c.day > MONTH_DAYS * 3) return { ok: false, reason: 'Còn xa, chỉ chuẩn bị được trong vòng 30 ngày' };
  const o = c.fest.org; // chỉ giữ một lễ đã đặt: đang chờ / đang diễn ra thì chưa đặt lễ khác (kẻo mất tiền lễ trước)
  if (o && o.start + ((FEST[o.id] && FEST[o.id].k1 - FEST[o.id].k0) || 0) >= c.day) return { ok: false, reason: o.id === id && o.start === start ? 'Đã lên kế hoạch tổ chức lễ này' : `Đang lo tổ chức ${FEST[o.id] ? FEST[o.id].name : 'một lễ khác'}: xong lễ đó mới đặt lễ tiếp` };
  const venues = c.services.filter((s) => VENUES.includes(s.type) && !(s.build > 0));
  if (!venues.length) return { ok: false, reason: 'Chưa có nơi tổ chức: xây ⛲ quảng trường, 🏟️ sân vận động, 🛕 chùa, 🏝️ bãi biển hoặc công trình biểu tượng' };
  const venue = venues.find((s) => s.type === f.venue) || venues.find((s) => s.type === 'stadium') || venues.find((s) => s.type === 'plaza') || venues[0];
  const cost = S.cost;
  if (cost > c.money && !c.sandbox) return { ok: false, reason: 'Không đủ tiền', cost };
  return { ok: true, cost, venue };
}
/** Bỏ tiền tổ chức lễ: du khách, khách quốc tế, thuế thương mại, dân vui tăng theo quy mô. Nơi tổ chức không có công an thì chen lấn, dân chỉ vui một nửa. */
export function organize(c, id, start, scale) {
  const r = canOrganize(c, id, start, scale);
  if (!r.ok) return r;
  const v = r.venue, safe = !!(c.cover && c.cover.police[v.cell >= 0 ? v.cell : idx(v.x, v.y)] > 0.05);
  cityPay(c, 'event', r.cost);
  c.fest.org = { id, start, scale, venue: v.uid, venueType: v.type, safe, venueBonus: FEST[id].venue === v.type, cost: r.cost };
  return { ...r, safe };
}

// ───────────────────────── mùa mưa bão ─────────────────────────

export const STORM_MONTHS = [8, 9, 10, 11];
export const stormSeason = (c) => climateOf(c).stormMonths.includes(lunar(c.day).month); // tháng có bão theo vùng (khí hậu Việt Nam, base.js CLIMATES)
const hasSvc = (c, k) => c.services.some((s) => SERVICES[s.type][k] && !(s.build > 0));

/**
 * Nguy cơ ngập của từng ô (0..1): đất thấp gần sông, hồ, biển; ven biển thấp còn chịu triều cường.
 * Tính lại mỗi ngày.
 */
function floodRisk(c) {
  const key = c.day; // tính lại mỗi ngày (đào đắp, kênh mới)
  if (c.floodRiskKey === key && c.floodRisk && c.floodRisk.length === N * N) return c.floodRisk;
  const dist = new Uint8Array(N * N).fill(255), q = [];
  for (let i = 0; i < N * N; i++) if (c.water[i]) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % N, y = (i / N) | 0;
    if (dist[i] >= 8) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = x + dx, b = y + dy;
      if (!inMap(a, b)) continue;
      const j = idx(a, b);
      if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  const risk = new Float32Array(N * N), tide = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (c.water[i]) continue;
    const low = clamp((2.2 - c.cellH[i]) / 2.2, 0, 1), d = dist[i];
    risk[i] = low * (d <= 5 ? 1 - d / 6 : c.cellH[i] < 0.6 ? 0.25 : 0);
    if (d <= 3 && c.cellH[i] < 1.4) tide[i] = 1;
  }
  c.floodRisk = risk; c.floodTide = tide; c.floodRiskKey = key;
  return risk;
}

/** Thời tiết mới trong ngày ở mùa mưa bão (thay cho cách chọn thường ngày): mưa nhiều hơn, ít khô hạn. */
export function seasonWeather(c, r) {
  if (!stormSeason(c)) return null;
  return r < 0.45 ? 'rain' : r < 0.5 ? 'dry' : 'clear';
}

/** Triều cường: những chiều tối giữa tháng 9–11 âm (ngày rằm), nước dâng ở vùng thấp ven sông biển. */
export function tideNow(c) {
  const L = lunar(c.day), h = c.hour % 24;
  return climateOf(c).tide > 0 && [9, 10, 11].includes(L.month) && (L.k === 4 || L.k === 5) && h >= 16 && h <= 21; // vùng không có biển / sông thuỷ triều (Tây Nguyên, Tây Bắc) thì không có triều cường
}

/**
 * Mỗi giờ: dự báo và đổ bộ của bão, cây đổ, nhà hư khi bão; nước dâng / rút ở ô thấp (mưa, bão, triều cường),
 * trạm bơm và kè chống ngập; đường ngập thì xe chạy chậm. Trả về số ô đang ngập.
 */
export function seasonHour(c) {
  const s = c.season, inc = c.inc, rng = c.rng || Math.random, h = c.hour % 24, ews = hasSvc(c, 'ews');
  // bão: mỗi sáng trong mùa có thể có bão hình thành ngoài khơi; có trạm cảnh báo sớm thì biết trước lâu hơn
  if (!s.storm && stormSeason(c) && h === 8 && rng() < 0.11 * climateOf(c).storm) { // số cơn bão theo vùng: miền Trung nhiều, Tây Nguyên ít
    const lead = ews ? 30 : 12, power = 1 + ((rng() * 3) | 0);
    s.count++;
    s.storm = { at: c.hour + lead, power, name: `Bão số ${s.count}`, hit: false };
    c.events.push({ type: 'stormWarn', text: `🌀 ${s.storm.name} (cấp ${['', 'vừa', 'mạnh', 'rất mạnh'][power]}) sẽ đổ bộ sau ${lead} giờ${ews ? ' (trạm cảnh báo sớm báo trước)' : ''}: xây trạm bơm, kè chống ngập ở vùng thấp` });
  }
  if (s.storm && !s.storm.hit && c.hour >= s.storm.at) {
    s.storm.hit = true; s.storm.until = c.hour + 10 + s.storm.power * 4;
    inc.weather = 'storm'; inc.wUntil = s.storm.until;
    c.events.push({ type: 'stormHit', text: `🌀 ${s.storm.name} đổ bộ: gió giật, mưa rất to, nguy cơ ngập ở vùng thấp` });
  }
  const storm = inc.weather === 'storm';
  if (s.storm && s.storm.hit && c.hour >= s.storm.until) {
    c.events.push({ type: 'stormEnd', text: `🌤️ ${s.storm.name} đã tan. Thiệt hại: ${s.storm.trees || 0} cây đổ, ${s.storm.houses || 0} nhà hư hại` });
    s.storm = null; if (storm) { inc.weather = 'rain'; inc.wUntil = c.hour + 6; }
  }
  if (storm && s.storm) { // gió bão: cây đổ, nhà yếu tốc mái
    const P = s.storm.power;
    for (let k = 0; k < 20 * P; k++) { const i = (rng() * N * N) | 0; if (c.tree[i] && rng() < 0.35) { c.tree[i] = 0; c.dirty.trees = true; s.storm.trees = (s.storm.trees || 0) + 1; } }
    for (let k = 0; k < 4 * P; k++) {
      const i = (rng() * N * N) | 0;
      if (c.level[i] > 1 && rng() < (ews ? 0.08 : 0.2) * (c.cover.shelter[i] > 0.05 ? 0.5 : 1)) { c.level[i]--; c.dirty.buildings = true; s.storm.houses = (s.storm.houses || 0) + 1; }
    }
  }
  if (h === 6) { const now = festivalNow(c); if (now && now.start === c.day) c.events.push({ type: 'fest', text: `${now.f.icon} Hôm nay ${now.f.name}: ${now.f.desc}${c.fest.org && c.fest.org.id === now.f.id && c.fest.org.start === now.start ? ' · thành phố tổ chức lễ hội' : ''}` }); }
  // ngập: nước dâng theo mưa / bão / triều cường ở ô có nguy cơ, rút dần khi tạnh; trạm bơm hút nhanh, kè chắn nước dâng
  const risk = floodRisk(c), tideOn = tideNow(c), rain = inc.weather === 'rain' ? 0.3 : storm ? 0.75 + 0.3 * (s.storm ? s.storm.power : 1) : 0;
  if (!c.flood || c.flood.length !== N * N) { c.flood = new Float32Array(N * N); c.floodHours = new Uint16Array(N * N); }
  const fl = c.flood, pump = c.cover.flood, levee = c.cover.levee, K = climateOf(c);
  let wet = 0, houses = 0;
  for (let i = 0; i < N * N; i++) {
    if (c.water[i]) { fl[i] = 0; continue; }
    let add = rain * risk[i] * K.flood + (tideOn && c.floodTide[i] ? 1.3 * K.tide : 0); // lũ quét (Tây Bắc, miền Trung), triều cường mạnh (Nam Bộ)
    if (levee[i] > 0.05) add *= 0.15;
    if (pump[i] > 0.05) add *= 0.4;
    const dd = distFx(c, i, 'drain'); // nạo vét cống của quận
    if (dd) add *= 1 - 0.12 * dd;
    const drain = (rain ? 0.25 : 0.9) + (pump[i] > 0.05 ? 2.5 : 0) + dd * 0.35;
    fl[i] = clamp(fl[i] + add + rain * 0.12 - drain, 0, 6); // mưa rơi khắp nơi, cộng nước sông tràn bờ
    if (fl[i] >= 1.5) {
      wet++;
      if (c.level[i]) { houses++; c.floodHours[i]++; if (c.floodHours[i] > 30 && c.level[i] > 1 && rng() < 0.04) { c.level[i]--; c.dirty.buildings = true; } }
    } else c.floodHours[i] = 0;
  }
  // nước ngập chảy từ cao xuống thấp: dồn về ô kề thấp hơn (theo mặt đất + độ ngập), chảy vào sông hồ thì thoát
  if (rain || s.anyWet) for (let pass = 0; pass < 3; pass++) for (let i = 0; i < N * N; i++) {
    if (c.water[i] || fl[i] < 0.05) continue;
    const x = i % N, y = (i / N) | 0, hi = c.cellH[i] + fl[i];
    let best = -1, bh = hi;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (!inMap(a, b)) continue; const j = idx(a, b), hj = c.water[j] ? c.cellH[j] - 3 : c.cellH[j] + fl[j]; if (hj < bh) { bh = hj; best = j; } }
    if (best < 0) continue;
    const mv = Math.min(fl[i], (hi - bh) / 2) * 0.6;
    fl[i] -= mv; if (!c.water[best]) fl[best] = Math.min(6, fl[best] + mv);
  }
  wet = 0; houses = 0;
  for (let i = 0; i < N * N; i++) if (!c.water[i] && fl[i] >= 1.5) { wet++; if (c.level[i]) houses++; }
  if (wet && !s.wasWet) c.events.push({ type: 'flood', text: `🌊 ${tideOn ? 'Triều cường' : storm ? 'Bão' : 'Mưa lớn'} gây ngập ${wet} ô, ${houses} nhà bị ngập: dân không đi làm được, kinh doanh đình trệ` });
  s.wasWet = wet > 0; s.wet = wet; s.houses = houses; s.tide = tideOn;
  // đường ngập: xe chạy chậm, tìm đường khác
  for (const e of c.edges.values()) {
    let m = 0;
    for (let k = 0; k < e.pts.length; k += 6) { const x = cellOf(e.pts[k]), y = cellOf(e.pts[k + 1]); if (inMap(x, y)) m = Math.max(m, fl[idx(x, y)]); }
    const was = !!e.flood; e.flood = m >= 1.5 ? 1 : 0;
    if (was !== !!e.flood) c.dirty.flood = true;
  }
  if (wet || s.anyWet) c.dirty.flood = true;
  s.anyWet = wet > 0;
  return wet;
}

/** Ô i đang ngập (nhà không hoạt động, dân khó chịu). */
export const flooded = (c, i) => !!(c.flood && c.flood[i] >= 1.5);

export function initSeason(c, o = {}) {
  c.season = { storm: o.storm && Number.isFinite(+o.storm.at) ? { at: +o.storm.at, power: clamp(o.storm.power | 0, 1, 3), name: String(o.storm.name || 'Bão'), hit: !!o.storm.hit, until: +o.storm.until || 0 } : null, count: o.count | 0, wet: 0, houses: 0 };
  c.fest = { org: o.org && FEST[o.org.id] ? { ...o.org, scale: clamp(o.org.scale | 0, 1, 3) } : null };
}
export const packSeason = (c) => ({ storm: c.season.storm, count: c.season.count, org: c.fest.org });

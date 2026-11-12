import { normalize } from '#sdk';

/**
 * Bộ luật đặt mật khẩu của "Mật Khẩu Lầy".
 * Mỗi luật: { tier (1 dễ · 2 vừa · 3 khó), make?(rand, env, used) → tham số p (null = không dùng được lúc này),
 *   text(p, env), ok(t, p, env), piece?(p, env) → các cách viết (bộ giải chọn cách không dính chữ cấm) }.
 * env = { now (ms), tz (giờ lệch UTC), host (tên chủ phòng) } — vài luật đổi theo thời gian thật (giờ, thứ, năm).
 * Bộ giải solve() dựng một mật khẩu thoả mọi luật; luật mới chỉ được thêm khi bộ giải còn dựng được → luôn có lời giải.
 */
export const cps = (t) => [...String(t ?? '')];
const flat = (t) => normalize(t).replace(/ /g, '');
const digitSum = (t) => cps(t).reduce((a, c) => a + (c >= '0' && c <= '9' ? Number(c) : 0), 0);
const isPrime = (n) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
const anyOf = (list) => (t) => { const f = flat(t); return list.some((w) => f.includes(w)); };
const upperCount = (t) => (String(t).match(/\p{Lu}/gu) || []).length;
const HEART = '❤';
const hearts = (t) => cps(t).filter((c) => c === HEART).length;
const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const local = (env) => new Date((env?.now ?? 0) + (env?.tz ?? 7) * 3600_000);
const hhmm = (ms, tz) => { const d = new Date(ms + tz * 3600_000); return `${d.getUTCHours()}h${String(d.getUTCMinutes()).padStart(2, '0')}`; };
export const timeNow = (env) => hhmm(env?.now ?? 0, env?.tz ?? 7);
const pickOf = (r, list) => list[Math.floor(r() * list.length)];

const ANIMALS = ['meo', 'cho', 'heo', 'vit', 'chuot', 'khi', 'bo', 'ga', 'ca'];
const FOODS = ['pho', 'bunbo', 'banhmi', 'comtam', 'xoi', 'nem', 'chao', 'banhxeo'];
const PLACES = ['hue', 'hanoi', 'danang', 'saigon', 'cantho', 'dalat', 'sapa', 'vungtau', 'halong'];
const LAUGHS = ['haha', 'hihi', 'hehe', 'kaka'];
const GENZ = ['khum', 'xiu', 'slay', 'flex', 'chill', 'keo'];
const LOVE = ['love', 'crush', 'baby', 'honey'];
const ACCENTS = ['ơ', 'ê', 'ă', 'ư', 'đ', 'ô'];
export const FORBID_LETTERS = ['k', 'm', 'n', 't', 'h', 'g', 'c', 's', 'b', 'l'];

export const RULES = {
  // ---------- dễ ----------
  len: { tier: 1, make: (r) => 8 + Math.floor(r() * 3), text: (p) => `Ít nhất ${p} ký tự`, ok: (t, p) => cps(t).length >= p },
  digit: { tier: 1, text: () => 'Có ít nhất 1 chữ số', ok: (t) => /\d/.test(t), piece: () => ['7'] },
  upper: { tier: 1, text: () => 'Có chữ IN HOA (hét lên cho máy nghe)', ok: (t) => /\p{Lu}/u.test(t) },
  special: { tier: 1, text: () => 'Có ký tự đặc biệt: @ # $ % & *', ok: (t) => /[@#$%&*]/.test(t), piece: () => ['@', '#', '$'] },
  animal: { tier: 1, text: () => 'Có tên một con vật (mèo, chó, heo, vịt…) — máy thích thú cưng', ok: anyOf(ANIMALS), piece: () => ANIMALS },
  food: { tier: 1, text: () => 'Có tên một món ăn Việt (phở, bún bò, bánh mì, xôi…) — máy đang đói', ok: anyOf(FOODS), piece: () => FOODS },
  emoji: { tier: 1, text: () => 'Có một emoji 😎 (mật khẩu cũng cần cảm xúc)', ok: (t) => /\p{Extended_Pictographic}/u.test(t), piece: () => ['😎', '🔥', '🐧'] },
  accent: { tier: 1, text: () => 'Có một chữ tiếng Việt có dấu (ơ, ê, ă, đ, á…)', ok: (t) => /[đĐ]/.test(t) || /[̀-ͯ]/.test(String(t).normalize('NFD')), piece: () => ACCENTS },
  lephep: { tier: 1, text: () => 'Phải lễ phép: có chữ “ạ”', ok: (t) => /[ạẠ]/.test(String(t).normalize('NFC')), piece: () => ['dạ', 'ạ'] },
  // ---------- vừa ----------
  sum: { tier: 2, make: (r) => 12 + Math.floor(r() * 14), text: (p) => `Các chữ số cộng lại bằng đúng ${p}`, ok: (t, p) => digitSum(t) === p },
  start: { tier: 2, make: (r) => pickOf(r, ['B', 'K', 'M', 'S', 'T', 'H', 'L']), text: (p) => `Bắt đầu bằng chữ “${p}”`, ok: (t, p) => flat(cps(t)[0] || '') === p.toLowerCase() },
  enddigit: { tier: 2, text: () => 'Kết thúc bằng một chữ số', ok: (t) => /\d$/.test(t) },
  weekday: { tier: 2, text: () => 'Có thứ HÔM NAY viết tắt: T2…T7 hoặc CN (hôm nay thứ mấy?)', ok: (t, p, env) => String(t).toUpperCase().includes(DAYS[local(env).getUTCDay()]), piece: (p, env) => [DAYS[local(env).getUTCDay()]] },
  place: { tier: 2, text: () => 'Có tên một tỉnh / thành phố (Huế, Hà Nội, Đà Lạt, Sa Pa…)', ok: anyOf(PLACES), piece: () => PLACES },
  laugh: { tier: 2, text: () => 'Có tiếng cười: haha, hihi, hehe… (đặt mật khẩu phải vui)', ok: anyOf([...LAUGHS, '=))']), piece: () => LAUGHS },
  even: { tier: 2, text: () => 'Tổng số ký tự là số CHẴN', ok: (t) => cps(t).length % 2 === 0 },
  nodouble: { tier: 2, text: () => 'Không có 2 ký tự giống nhau đứng liền nhau', ok: (t) => !cps(t).some((c, i, a) => i > 0 && c.toLowerCase() === a[i - 1].toLowerCase()) },
  luong: { tier: 2, text: () => 'Có mức lương mơ ước, vd “50tr” hoặc “100cu”', ok: (t) => /\d+ ?(tr|trieu|cu)/.test(normalize(t)), piece: () => ['50tr', '20cu'] },
  genz: { tier: 2, text: () => 'Có một từ Gen Z: khum, xỉu, slay, flex, chill, kèo', ok: anyOf(GENZ), piece: () => GENZ.filter((w) => w !== 'chill') },
  love: { tier: 2, text: () => 'Có lời tỏ tình: love, crush, baby, honey', ok: anyOf(LOVE), piece: () => LOVE },
  year: { tier: 2, text: (p, env) => `Có số năm nay (${local(env).getUTCFullYear()})`, ok: (t, p, env) => String(t).includes(String(local(env).getUTCFullYear())), piece: (p, env) => [String(local(env).getUTCFullYear())] },
  max: { tier: 2, make: (r) => 26 + Math.floor(r() * 7), text: (p) => `Không dài quá ${p} ký tự (máy lười đọc)`, ok: (t, p) => cps(t).length <= p },
  math: { tier: 2, text: () => 'Có một phép cộng ĐÚNG, vd 2+3=5', ok: (t) => [...String(t).matchAll(/(\d+)\+(\d+)=(\d+)/g)].some((m) => Number(m[1]) + Number(m[2]) === Number(m[3])), piece: () => ['1+2=3', '2+3=5', '1+3=4'] },
  host: { tier: 2, make: (r, env) => (flat(env?.host).length >= 2 ? String(env.host).slice(0, 20) : null), text: (p) => `Có tên chủ phòng: “${p}” (nịnh chút cho dễ qua)`, ok: (t, p) => flat(t).includes(flat(p)), piece: (p) => [flat(p)] },
  // ---------- khó ----------
  upperN: { tier: 3, make: (r) => 2 + Math.floor(r() * 3), text: (p) => `Có ĐÚNG ${p} chữ in hoa — không hơn, không kém`, ok: (t, p) => upperCount(t) === p },
  prime: { tier: 3, text: () => 'Độ dài là số NGUYÊN TỐ (…13, 17, 19, 23, 29, 31…)', ok: (t) => isPrime(cps(t).length) },
  forbid: { tier: 3, text: (p) => `CẤM chữ “${p}” (kể cả có dấu, kể cả in hoa)`, ok: (t, p) => !normalize(t).includes(p) },
  time: { tier: 3, text: () => 'Có giờ hiện tại (giờ VN) dạng 21h05 — đồng hồ chạy đó nha', ok: (t, p, env) => { const s = String(t).toLowerCase(); const n = env?.now ?? 0, tz = env?.tz ?? 7; return s.includes(hhmm(n, tz)) || s.includes(hhmm(n - 20_000, tz)); }, piece: (p, env) => [timeNow(env)] },
  hearts: { tier: 3, make: (r) => 2 + Math.floor(r() * 2), text: (p) => `Có ĐÚNG ${p} trái tim ${HEART}`, ok: (t, p) => hearts(t) === p },
  firstlast: { tier: 3, text: () => 'Ký tự đầu và ký tự cuối giống nhau (không tính hoa thường)', ok: (t) => { const a = cps(t); return a.length > 1 && a[0].toLowerCase() === a[a.length - 1].toLowerCase(); } },
  nguoc: { tier: 3, text: () => 'Có chữ “matkhau” viết NGƯỢC lại', ok: (t) => flat(t).includes('uahktam'), piece: () => ['uahktam'] },
  hetlen: { tier: 3, text: () => 'Kết thúc bằng dấu chấm than “!” — hét lên!!', ok: (t) => /!$/.test(t) },
  // luật do người xem ra (bình luận / quà Ra luật): p = { w: từ gốc, by }
  viewer: { tier: 0, text: (p) => `Có chữ “${p?.w}” — luật của ${p?.by?.name || 'người xem'}`, ok: (t, p) => flat(t).includes(flat(p?.w)), piece: (p) => [flat(p?.w)] },
};
export const RULE_IDS = Object.keys(RULES).filter((id) => RULES[id].tier > 0);

export const ruleText = (r, env) => RULES[r.id]?.text(r.p, env) ?? '';
export const ruleOk = (r, t, env) => { try { return !!RULES[r.id]?.ok(String(t ?? ''), r.p, env); } catch { return false; } };

/**
 * Dựng một mật khẩu thoả mọi luật (null nếu bộ giải không dựng được). Dùng để kiểm tra luật mới, gợi ý, người chơi ảo.
 */
export function solve(rules, env) {
  const has = (id) => rules.filter((r) => r.id === id);
  const one = (id) => has(id)[0];
  const forbid = new Set(has('forbid').map((r) => r.p));
  const clean = (s) => ![...normalize(s).replace(/ /g, '')].some((c) => forbid.has(c));
  const noDouble = !!one('nodouble');
  const pieces = [];
  for (const r of rules) {
    const def = RULES[r.id];
    if (!def?.piece) continue;
    const opts = def.piece(r.p, env).filter((x) => clean(x) && (!noDouble || !cps(x).some((c, i, a) => i > 0 && c.toLowerCase() === a[i - 1].toLowerCase())));
    if (!opts.length) return null;
    if (!pieces.some((x) => ruleOk(r, x, env))) pieces.push(opts[0]);
  }
  for (let i = 0; i < (one('hearts')?.p ?? 0); i++) pieces.push(HEART);
  const fillers = ['q', 'z', 'w', 'x', 'j', 'v', 'y', 'f', 'p', 'r'].filter((c) => !forbid.has(c));
  if (fillers.length < 3) return null;
  // chữ IN HOA: luật số lượng chính xác / ít nhất 1
  const upperNeed = one('upperN')?.p ?? (one('upper') ? 1 : 0);
  const start = one('start')?.p;
  const lowerStart = start ? (clean(start) ? start.toLowerCase() : null) : '';
  if (lowerStart === null) return null;
  const join = (list) => {
    let s = '';
    for (const p of list) {
      if (!p) continue;
      if (s && p && cps(s).at(-1).toLowerCase() === cps(p)[0].toLowerCase()) s += fillers.find((f) => f !== cps(s).at(-1).toLowerCase() && f !== cps(p)[0].toLowerCase());
      s += p;
    }
    return s;
  };
  const build = (pad, padUpper) => {
    let body = join([lowerStart, ...pieces]);
    const ups = upperCount(body);
    let upIdx = 0;
    const upFill = ['Q', 'Z', 'W', 'X', 'J', 'V'].filter((c) => !forbid.has(c.toLowerCase()));
    let extra = '';
    for (let i = ups; i < upperNeed + padUpper; i++) extra += upFill[upIdx++ % upFill.length];
    if (one('upperN') && ups > one('upperN').p) return null;
    body = join([body, extra.split('').join(fillers[0]), ...Array.from({ length: pad }, (_, i) => fillers[(i % (fillers.length - 1)) + 1])]);
    // chữ số: tổng đúng, đặt cuối (luật kết thúc bằng chữ số)
    const sumR = one('sum');
    let tail = '';
    if (sumR) {
      let need = sumR.p - digitSum(body);
      if (need < 0) return null;
      let last = cps(body).at(-1);
      while (need > 0) { let d = Math.min(9, need); if (noDouble && String(d) === last) d -= 1; if (d <= 0) return null; tail += d; need -= d; last = String(d); }
    }
    if (one('enddigit') && !/\d$/.test(tail || body)) tail += noDouble && /0$/.test(tail || body) ? '' : '0';
    let s = join([body, tail]);
    if (one('enddigit') && !/\d$/.test(s)) return null;
    if (one('hetlen')) s += '!';
    if (one('firstlast')) { const f = cps(s)[0]; if (one('hetlen') || one('enddigit')) { if (!/[\d!]/.test(f)) return null; } else s = join([s, f]); }
    return s;
  };
  const len = one('len')?.p ?? 0;
  for (let pad = 0; pad < 40; pad++) {
    for (const padUpper of [0]) {
      const s = build(pad, padUpper);
      if (s == null) return null;
      const n = cps(s).length;
      if (n < len) continue;
      if (rules.every((r) => ruleOk(r, s, env))) return s;
      if (one('max') && n > one('max').p) return null;
    }
  }
  return null;
}

/** Chọn luật kế tiếp theo tier (thử lần lượt, chỉ nhận luật mà cả bộ vẫn giải được). */
export function nextRule(existing, tier, rand, env, { exclude = [] } = {}) {
  const used = new Set([...existing.map((r) => r.id), ...exclude]);
  const order = [tier, ...[1, 2, 3].filter((x) => x !== tier)];
  for (const t of order) {
    const ids = RULE_IDS.filter((id) => RULES[id].tier === t && !used.has(id));
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    for (const id of ids) {
      const r = makeRule(id, existing, rand, env);
      if (r && solve([...existing, r], env)) return r;
    }
  }
  return null;
}

/** Tạo một luật với tham số (luật cấm chữ: chọn chữ không đụng các luật đang có). */
export function makeRule(id, existing, rand, env, p) {
  const def = RULES[id];
  if (!def) return null;
  if (p !== undefined) return { id, p };
  if (id === 'forbid') {
    const taken = new Set(existing.filter((r) => r.id === 'forbid').map((r) => r.p));
    const opts = FORBID_LETTERS.filter((c) => !taken.has(c));
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    for (const c of opts) if (solve([...existing, { id, p: c }], env)) return { id, p: c };
    return null;
  }
  const v = def.make ? def.make(rand, env) : null;
  if (def.make && v == null) return null;
  return { id, p: v };
}

/** Ví dụ cho một luật đứng riêng (gợi ý). */
export function exampleFor(r, env) {
  if (r.id === 'forbid') return `bỏ hết chữ “${r.p}”`;
  if (r.id === 'sum') return `vd ${r.p >= 9 ? `9 và ${r.p - 9}` : r.p} → các số cộng lại = ${r.p}`;
  const def = RULES[r.id];
  if (def?.piece) return `thử thêm “${def.piece(r.p, env)[0]}”`;
  const s = solve([r], env);
  return s ? `ví dụ “${s}”` : '';
}

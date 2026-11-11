import { normalize } from '#sdk';

/**
 * 20 luật đặt mật khẩu cho mini-việc "Đổi mật khẩu". Mỗi lần đổi chọn ngẫu nhiên vài luật (mặc định 5), hiện từng luật một:
 * gõ mật khẩu thoả các luật đang hiện rồi Enter → hiện luật tiếp theo; thoả đủ tất cả mới qua.
 * Luật được chọn sao cho luôn có lời giải (solvePassword() dựng được một mật khẩu thoả mọi tổ hợp).
 */
const cps = (t) => [...String(t ?? '')];
const digitSum = (t) => cps(t).reduce((a, c) => a + (c >= '0' && c <= '9' ? Number(c) : 0), 0);
const ANIMALS = ['meo', 'cho', 'ga', 'vit', 'ca', 'bo', 'heo', 'ho', 'chuot', 'khi'];
const COLORS = ['do', 'xanh', 'vang', 'tim', 'hong', 'den', 'trang'];
const hasWord = (t, list) => { const n = ` ${normalize(t).replace(/[^a-z0-9 ]/g, ' ')} `; return list.some((w) => n.includes(` ${w} `) || n.replace(/ /g, '').includes(w)); };

export const PW_RULES = {
  len: { make: (r) => 8 + Math.floor(r() * 3), text: (p) => `Ít nhất ${p} ký tự`, ok: (t, p) => cps(t).length >= p },
  digit: { text: () => 'Có ít nhất 1 chữ số', ok: (t) => /\d/.test(t) },
  upper: { text: () => 'Có chữ IN HOA', ok: (t) => /\p{Lu}/u.test(t) },
  lower: { text: () => 'Có chữ thường', ok: (t) => /\p{Ll}/u.test(t) },
  special: { text: () => 'Có một ký tự @ # $ % & *', ok: (t) => /[@#$%&*]/.test(t) },
  punct: { text: () => 'Có dấu ! hoặc ?', ok: (t) => /[!?]/.test(t) },
  sum: { make: (r) => 12 + Math.floor(r() * 9), text: (p) => `Các chữ số cộng lại bằng đúng ${p}`, ok: (t, p) => digitSum(t) === p },
  enddigit: { text: () => 'Kết thúc bằng một chữ số', ok: (t) => /\d$/.test(t) },
  start: { make: (r) => 'BKMST'[Math.floor(r() * 5)], text: (p) => `Bắt đầu bằng chữ “${p}”`, ok: (t, p) => normalize(cps(t)[0] || '') === p.toLowerCase() },
  animal: { text: () => 'Có tên một con vật (mèo, chó, gà, vịt, cá, bò, heo, hổ…)', ok: (t) => hasWord(t, ANIMALS) },
  color: { text: () => 'Có tên một màu (đỏ, xanh, vàng, tím, hồng, đen, trắng)', ok: (t) => hasWord(t, COLORS) },
  weekday: { text: () => 'Có một thứ viết tắt: T2 … T7 hoặc CN', ok: (t) => /T[2-7]|CN/.test(t) },
  sep: { text: () => 'Có chữ “sếp” (không dấu cũng được)', ok: (t) => normalize(t).includes('sep') },
  deadline: { text: () => 'Có chữ “deadline”', ok: (t) => /deadline/i.test(t) },
  accent: { text: () => 'Có một chữ có dấu tiếng Việt (ă, ê, ô, ơ, đ, á…)', ok: (t) => /[đĐ]/.test(t) || /[̀-ͯ]/.test(String(t).normalize('NFD')) },
  emoji: { text: () => 'Có một emoji 😀', ok: (t) => /\p{Extended_Pictographic}/u.test(t) },
  even: { text: () => 'Tổng số ký tự là số CHẴN', ok: (t) => cps(t).length % 2 === 0 },
  nodouble: { text: () => 'Không có 2 ký tự giống nhau đứng liền nhau', ok: (t) => !cps(t).some((c, i, a) => i > 0 && c === a[i - 1]) },
  max: { make: (r) => 24 + Math.floor(r() * 5), text: (p) => `Không dài quá ${p} ký tự`, ok: (t, p) => cps(t).length <= p },
  year: { make: (r, year) => year, text: (p) => `Có số năm nay: ${p}`, ok: (t, p) => String(t).includes(String(p)) },
};
export const PW_IDS = Object.keys(PW_RULES);

/** Chọn n luật khác nhau (kèm tham số). */
export function pickRules(n, rand, year) {
  const ids = PW_IDS.slice();
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, Math.max(1, Math.min(ids.length, n))).map((id) => ({ id, p: PW_RULES[id].make ? PW_RULES[id].make(rand, year) : null }));
}
export const ruleText = (r) => PW_RULES[r.id]?.text(r.p) ?? '';
export const ruleOk = (r, t) => !!PW_RULES[r.id]?.ok(String(t ?? ''), r.p);

/** Dựng một mật khẩu thoả mọi luật cho trước (dùng cho người chơi ảo ở trang demo và test). */
export function solvePassword(rules) {
  const has = (id) => rules.find((r) => r.id === id);
  const start = has('start')?.p;
  let s = (start || 'D') + 'eadline';
  if (start && has('deadline')) s = `${start}a-deadline`;
  const add = (x) => { s += x; };
  if (has('animal')) add('meo');
  if (has('color')) add('do');
  if (has('sep')) add('sep');
  if (has('accent')) add('đ');
  if (has('weekday')) add('CN');
  if (has('year')) add(String(has('year').p));
  if (has('special')) add('@');
  if (has('punct')) add('!');
  if (has('emoji')) add('😀');
  const target = has('sum')?.p;
  let digits = '';
  if (target != null) {
    let need = target - digitSum(s);
    let last = s.at(-1);
    while (need > 0) { let d = Math.min(9, need); if (String(d) === last) d -= 1; if (d <= 0) d = 1; digits += d; need -= d; last = String(d); }
  } else if (has('digit') || has('enddigit')) digits = '7';
  add(digits);
  if (has('enddigit') && !/\d$/.test(s)) s += '0'; // tổng đã đủ: thêm 0 không đổi tổng
  // độn chữ ngay sau "eadline" (không phá chữ deadline, không tạo 2 ký tự trùng liền nhau)
  const pad = () => { const i = s.indexOf('eadline') + 7; const prev = s[i - 1], next = s[i]; const c = ['q', 'z', 'w'].find((x) => x !== prev && x !== next); s = s.slice(0, i) + c + s.slice(i); };
  const len = has('len')?.p ?? 0;
  while (cps(s).length < len) pad();
  if (has('even') && cps(s).length % 2) pad();
  return s;
}

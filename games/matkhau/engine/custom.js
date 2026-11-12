import { normalize } from '#sdk';

/**
 * Luật người xem tự đặt bằng lời ("luật: mật khẩu phải có 3 chữ a"). Phần server nhờ Claude dịch câu đó thành một
 * SPEC an toàn — danh sách phép kiểm tra đơn giản — rồi engine tự kiểm tra tại chỗ (không gọi API mỗi lần gõ).
 * Luật không kiểm tra bằng máy được (vd "nghe phải dễ thương") → judge: true, Claude chấm khi có người nộp mật khẩu.
 *
 * spec = { mode: 'all' | 'any', checks: [{ type, text?, list?, cls?, chars?, op?, n?, pattern?, caseSensitive?, accentSensitive? }] }
 * type: contains · not_contains · starts_with · ends_with · contains_any · count · length · digit_sum · regex
 * cls (count): digit · upper · lower · letter · vowel · consonant · emoji · special · space · char (dùng chars)
 * File này dùng chung cho engine (chấm) và server (làm sạch kết quả của Claude) → giữ thuần, không I/O.
 */
export const CHECK_TYPES = ['contains', 'not_contains', 'starts_with', 'ends_with', 'contains_any', 'count', 'length', 'digit_sum', 'regex'];
export const CLASSES = ['digit', 'upper', 'lower', 'letter', 'vowel', 'consonant', 'emoji', 'special', 'space', 'char'];
export const OPS = ['eq', 'gte', 'lte'];
const MAX_PW = 120;
const cps = (t) => [...String(t ?? '')];
const str = (v, n) => String(v ?? '').normalize('NFC').slice(0, n);
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
const VOWELS = new Set([...'aeiouy']);

/** Regex an toàn để chạy trên chuỗi ≤ 120 ký tự: ngắn, không tham chiếu ngược, không lượng từ lồng nhau. */
export function safeRegex(pattern, caseSensitive) {
  const p = String(pattern ?? '');
  if (!p || p.length > 80) return null;
  if (/\\[1-9]|\\k</.test(p)) return null; // backreference
  if (/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/.test(p)) return null; // (a+)+ … dễ treo
  if (/\{\s*\d{3,}/.test(p)) return null;
  try { return new RegExp(p, caseSensitive ? 'u' : 'iu'); } catch { return null; }
}

/** Làm sạch một spec (từ Claude hoặc từ bản lưu). Trả null nếu không còn phép kiểm tra hợp lệ. */
export function cleanSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const checks = [];
  for (const c of Array.isArray(spec.checks) ? spec.checks.slice(0, 4) : []) {
    if (!c || !CHECK_TYPES.includes(c.type)) continue;
    const o = { type: c.type, caseSensitive: c.caseSensitive === true, accentSensitive: c.accentSensitive === true };
    if (['contains', 'not_contains', 'starts_with', 'ends_with'].includes(c.type)) { o.text = str(c.text, 30); if (!o.text.trim()) continue; }
    if (c.type === 'contains_any') { o.list = (Array.isArray(c.list) ? c.list : []).map((x) => str(x, 24)).filter((x) => x.trim()).slice(0, 40); if (!o.list.length) continue; }
    if (c.type === 'count') {
      o.cls = CLASSES.includes(c.cls) ? c.cls : null;
      if (!o.cls) continue;
      if (o.cls === 'char') { o.chars = str(c.chars, 10); if (!o.chars) continue; }
    }
    if (['count', 'length', 'digit_sum'].includes(c.type)) {
      o.op = OPS.includes(c.op) ? c.op : 'gte';
      o.n = int(c.n, 0, c.type === 'digit_sum' ? 500 : MAX_PW);
      if (o.n == null) continue;
    }
    if (c.type === 'regex') { o.pattern = String(c.pattern ?? ''); if (!safeRegex(o.pattern, o.caseSensitive)) continue; }
    checks.push(o);
  }
  if (!checks.length) return null;
  return { mode: spec.mode === 'any' ? 'any' : 'all', checks };
}

const fold = (t, c) => {
  let s = String(t ?? '').normalize('NFC');
  if (!c.accentSensitive) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  if (!c.caseSensitive) s = s.toLowerCase();
  return s;
};

function countOf(t, c) {
  const a = cps(t);
  switch (c.cls) {
    case 'digit': return a.filter((x) => /\d/.test(x)).length;
    case 'upper': return a.filter((x) => /\p{Lu}/u.test(x)).length;
    case 'lower': return a.filter((x) => /\p{Ll}/u.test(x)).length;
    case 'letter': return a.filter((x) => /\p{L}/u.test(x)).length;
    case 'vowel': return a.filter((x) => VOWELS.has(normalize(x))).length;
    case 'consonant': return a.filter((x) => /\p{L}/u.test(x) && !VOWELS.has(normalize(x))).length;
    case 'emoji': return a.filter((x) => /\p{Extended_Pictographic}/u.test(x)).length;
    case 'special': return a.filter((x) => /[^\p{L}\p{N}\s]/u.test(x) && !/\p{Extended_Pictographic}/u.test(x)).length;
    case 'space': return a.filter((x) => /\s/.test(x)).length;
    case 'char': { const set = new Set(cps(fold(c.chars, c))); return cps(fold(t, c)).filter((x) => set.has(x)).length; }
    default: return 0;
  }
}
const cmp = (v, op, n) => (op === 'eq' ? v === n : op === 'lte' ? v <= n : v >= n);

export function evalCheck(c, t) {
  const s = fold(t, c);
  switch (c.type) {
    case 'contains': return s.includes(fold(c.text, c));
    case 'not_contains': return !s.includes(fold(c.text, c));
    case 'starts_with': return s.startsWith(fold(c.text, c));
    case 'ends_with': return s.endsWith(fold(c.text, c));
    case 'contains_any': return c.list.some((w) => s.includes(fold(w, c)));
    case 'count': return cmp(countOf(t, c), c.op, c.n);
    case 'length': return cmp(cps(t).length, c.op, c.n);
    case 'digit_sum': return cmp(cps(t).reduce((a, x) => a + (x >= '0' && x <= '9' ? Number(x) : 0), 0), c.op, c.n);
    case 'regex': { const re = safeRegex(c.pattern, c.caseSensitive); return !!re && re.test(cps(t).slice(0, MAX_PW).join('')); }
    default: return false;
  }
}

/** Mật khẩu có thoả spec không. */
export function evalSpec(spec, t) {
  if (!spec?.checks?.length) return false;
  return spec.mode === 'any' ? spec.checks.some((c) => evalCheck(c, t)) : spec.checks.every((c) => evalCheck(c, t));
}

// Chuẩn hoá chữ tiếng Việt dùng chung cho mọi game (chạy được cả trình duyệt lẫn Node).

/** Bỏ dấu, chữ thường, gom khoảng trắng, chỉ giữ a-z 0-9. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chữ thường, gom khoảng trắng, GIỮ dấu tiếng Việt. */
export function canon(text) {
  return String(text ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Gọn để so khớp: bỏ dấu, hoa thường, khoảng trắng, dấu câu ("Kai'Sa" = "kaisa"). */
export const compact = (s) => normalize(s).replace(/ /g, '');

// Dấu tiếng Việt phân biệt nghĩa ("mặt" ≠ "mắt", "chợ" ≠ "chó"): chỉ bỏ qua dấu ở tiếng người xem gõ KHÔNG dấu.
const TONE_MARKS = new Set(['̀', '́', '̃', '̉', '̣']); // huyền, sắc, ngã, hỏi, nặng
const SHAPE_MARKS = new Set(['̂', '̆', '̛']); // â ê ô, ă, ơ ư

/** Tách thành chữ cái { base, shape, tone, syl } — syl: số thứ tự tiếng (khoảng trắng / dấu câu ngăn tiếng). */
function letters(text) {
  const out = [];
  let syl = 0, gap = true;
  for (const ch of canon(text).normalize('NFD')) {
    const last = gap ? null : out[out.length - 1];
    if (TONE_MARKS.has(ch)) { if (last) last.tone = ch; continue; }
    if (SHAPE_MARKS.has(ch)) { if (last) last.shape += ch; continue; }
    if (/\p{M}/u.test(ch)) continue;
    if (/[a-z0-9đ]/.test(ch)) {
      if (gap) { syl++; gap = false; }
      out.push(ch === 'đ' ? { base: 'd', shape: 'đ', tone: '', syl } : { base: ch, shape: '', tone: '', syl });
    } else gap = true; // khoảng trắng, dấu câu, ký tự khác (normalize() cũng bỏ) → hết tiếng
  }
  return out;
}

/**
 * Hai cách viết là CÙNG MỘT TỪ: cùng chữ cái (bỏ dấu, hoa thường, khoảng trắng, dấu câu) và mỗi tiếng người xem
 * CÓ gõ dấu thì dấu phải đúng (thanh điệu + â/ă/ê/ô/ơ/ư/đ). Tiếng gõ không dấu thì chấp nhận.
 * "mat troi" / "Mặt Trời" / "mặttrời" = "mặt trời"; "mắt trời" ≠ "mặt trời"; "chợ" ≠ "chó".
 */
export function sameWord(guess, ref) {
  const g = letters(guess), r = letters(ref);
  if (!g.length || g.length !== r.length || g.some((l, i) => l.base !== r[i].base)) return false;
  // so theo từng tiếng của ref (người xem có thể gõ dính liền / tách khác); thanh điệu tính cho cả tiếng
  for (let i = 0; i < r.length;) {
    let j = i;
    while (j < r.length && r[j].syl === r[i].syl) j++;
    const part = g.slice(i, j);
    const tones = new Set(part.map((l) => l.tone).filter(Boolean));
    if (tones.size || part.some((l) => l.shape)) {
      if (part.some((l, k) => l.shape !== r[i + k].shape)) return false;
      if (tones.size > 1 || ([...tones][0] || '') !== (r.slice(i, j).find((l) => l.tone)?.tone || '')) return false;
    }
    i = j;
  }
  return true;
}

/**
 * Chữ số trong bình luận → chuỗi 0-9: bỏ khoảng trắng / dấu phân cách, nhận cả chữ số không phải Latin
 * (toàn chiều rộng, Ả Rập, Devanagari…). Không có chữ số → ''.
 */
export function digitsOf(text) {
  let out = '';
  for (const ch of String(text ?? '').normalize('NFKC')) {
    if (ch >= '0' && ch <= '9') { out += ch; continue; }
    if (!/\p{Nd}/u.test(ch)) continue;
    // chữ số Unicode (Nd) luôn thành dãy 10 ký tự liền nhau bắt đầu từ 0: lùi tới đầu dãy
    let cp = ch.codePointAt(0), base = cp;
    while (base > cp - 9 && /\p{Nd}/u.test(String.fromCodePoint(base - 1))) base--;
    out += String(cp - base);
  }
  return out;
}

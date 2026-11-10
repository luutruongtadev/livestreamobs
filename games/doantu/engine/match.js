import { normalize, canon, compact, sameWord } from '#sdk';

/** Trùng từ bí mật hoặc một biệt danh (không phân biệt hoa thường, khoảng trắng; gõ không dấu vẫn nhận, gõ sai dấu thì không) → đoán đúng. */
// Từ chỉ loại đứng đầu: đoán "chó" vẫn trúng "con chó", "xương rồng" trúng "cây xương rồng"
const CLASSIFIERS = new Set(['con', 'cai', 'qua', 'trai', 'chiec', 'cay']);
function core(s) {
  const parts = canon(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parts.length > 1 && CLASSIFIERS.has(normalize(parts[0]))) parts.shift();
  return parts.join(' ');
}

export function isExact(guess, secret, aliases = []) {
  if (!compact(guess)) return false;
  const answers = [secret, ...aliases];
  if (answers.some((a) => sameWord(guess, a))) return true;
  const c = core(guess);
  return !!compact(c) && answers.some((a) => sameWord(c, core(a)));
}

// Chữ phủ định đứng trước đáp án → không tính là đoán trúng
const NEGATION = /(^| )(khong|ko|k|hok|hong|cha|chang|chu|dau|deo)( phai| la)?( |$)|(^| )(sai|nham)( |$)/;
/**
 * Bình luận CÓ CHỨA đáp án (hoặc biệt danh) như một cụm nguyên vẹn: "trứng vịt lộn ạ", "đáp án là trứng vịt lộn nha".
 * Không phân biệt hoa thường, gõ không dấu vẫn nhận (gõ sai dấu thì không — xem sameWord).
 * Bỏ qua câu quá dài (> đáp án + 5 tiếng) và câu phủ định ("không phải trứng vịt lộn").
 */
export function containsAnswer(text, secret, aliases = []) {
  // mỗi tiếng giữ cả bản bỏ dấu (so khớp) lẫn chữ gốc (so dấu)
  const tokens = canon(String(text || '').replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, ' '))
    .split(/[^\p{L}\p{N}]+/u)
    .flatMap((raw) => { const n = normalize(raw).split(' ').filter(Boolean); return n.map((x) => ({ n: x, raw: n.length === 1 ? raw : x })); });
  if (!tokens.length) return false;
  const words = tokens.map((t) => t.n);
  for (const ans of [secret, ...aliases]) {
    const a = normalize(ans).split(' ').filter(Boolean);
    if (!a.length || words.length > a.length + 5) continue;
    // đáp án 1 tiếng ngắn (vd "ô", "đá") dễ trùng chữ thường → chỉ nhận khi câu rất ngắn
    if (a.length === 1 && a[0].length <= 3 && words.length > 3) continue;
    for (let i = 0; i + a.length <= words.length; i++) {
      // phủ định đứng TRƯỚC đáp án ("không phải trứng vịt lộn") thì không tính; "trứng vịt lộn đúng hông" vẫn tính
      if (a.every((w, k) => words[i + k] === w) && !NEGATION.test(words.slice(0, i).join(' '))
        && sameWord(tokens.slice(i, i + a.length).map((t) => t.raw).join(' '), ans)) return true;
    }
  }
  return false;
}

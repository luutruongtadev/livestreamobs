// Knowledge Pack + Score Engine của Đoán từ — phần thuần, chạy cả trình duyệt (overlay tra pack tại chỗ, 0 ms) lẫn gateway.
import { canon, compact, sameWord } from '#sdk';

export const CATEGORIES = ['VERY_CLOSE', 'STRONG_RELATED', 'RELATED', 'WEAKLY_RELATED', 'UNRELATED'];

/** Score Engine: loại → khoảng điểm; vị trí trong khoảng theo độ mạnh 0..1 (thứ tự trong pack / độ tin cậy của Claude). */
export const SCORE_BANDS = {
  VERY_CLOSE: [90, 97], // đồng nghĩa, cách gọi khác, bản dịch
  STRONG_RELATED: [75, 88], // nhắc cái này là nghĩ ngay tới cái kia, cùng loại hẹp
  RELATED: [55, 72], // liên quan rõ, hay đi cùng nhau
  WEAKLY_RELATED: [25, 45], // cùng chủ đề rộng, liên tưởng xa
  UNRELATED: [1, 9],
};

export const PACK_FIELDS = [['synonyms', 'VERY_CLOSE'], ['strongRelated', 'STRONG_RELATED'], ['related', 'RELATED'], ['weakRelated', 'WEAKLY_RELATED'], ['unrelated', 'UNRELATED']];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function scoreOf(category, strength = 0.5, bands = SCORE_BANDS) {
  const b = bands[category];
  if (!b) return null;
  return Math.round(b[0] + (b[1] - b[0]) * clamp(Number(strength) || 0, 0, 1));
}

/** Làm sạch pack: bỏ chính từ bí mật, bỏ trùng (giữ ở nhóm mạnh hơn), tối đa 40 từ / nhóm. */
export function cleanPack(secret, raw = {}) {
  const seen = new Set([compact(secret)]);
  const out = {};
  for (const [field] of PACK_FIELDS) {
    out[field] = [];
    for (const w of Array.isArray(raw[field]) ? raw[field] : []) {
      const c = canon(String(w || '').replace(/[^\p{L}\p{N} ]+/gu, ' '));
      const k = compact(c);
      if (!c || !k || c.length > 40 || seen.has(k)) continue;
      seen.add(k);
      out[field].push(c);
      if (out[field].length >= 40) break;
    }
  }
  return out;
}

/** Chỉ mục tra cứu Lớp 1 của một pack: theo chữ có dấu (chính xác) và theo chữ bỏ dấu liền nhau (để nhận cách gõ không dấu). */
export function packIndex(pack) {
  const exact = new Map(), loose = new Map(), list = [];
  for (const [field, category] of PACK_FIELDS) {
    const words = pack?.[field] || [];
    words.forEach((w, i) => {
      // từ đứng trước trong nhóm = liên quan mạnh hơn
      const hit = { category, strength: words.length > 1 ? 1 - i / (words.length - 1) : 1, ref: w };
      exact.set(canon(w), hit);
      const k = compact(w);
      if (!loose.has(k)) loose.set(k, []);
      loose.get(k).push(hit);
      list.push({ key: k, ...hit });
    });
  }
  return { exact, loose, list };
}

/**
 * Lớp 1: tra pack. Có dấu thì so đúng chữ; gõ không dấu / dính liền thì so bản bỏ dấu, nhưng tiếng nào CÓ gõ dấu thì dấu
 * phải khớp ("mặt" không ăn theo "mắt" trong pack — khác nghĩa). Khớp nhiều từ khác nhóm (mơ hồ) → null.
 */
export function dictLookup(index, word) {
  if (!index) return null;
  const hit = index.exact.get(canon(word));
  if (hit) return hit;
  const cands = (index.loose.get(compact(word)) || []).filter((h) => sameWord(word, h.ref));
  if (!cands.length || new Set(cands.map((h) => h.category)).size > 1) return null;
  return cands.reduce((a, b) => (b.strength > a.strength ? b : a));
}

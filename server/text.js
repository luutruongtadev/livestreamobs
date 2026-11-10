// Chuẩn hoá tiếng Việt (bỏ dấu, chữ thường, gom khoảng trắng) nằm ở SDK nền tảng.
import { normalize } from '#sdk';

export { normalize };

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tạo hàm nhận diện lệnh từ danh sách commands trong config.
 * Keyword được so khớp theo nguyên từ (word boundary) sau khi bỏ dấu,
 * nên "mo" khớp "gõ mõ" nhưng không khớp "mot".
 */
export function createCommandMatcher(commands = []) {
  const compiled = commands.map((c) => ({
    action: c.action,
    label: c.label || c.action,
    patterns: (c.keywords || [])
      .map(normalize)
      .filter(Boolean)
      // Keyword dài khớp trước để "cau an" ưu tiên hơn "cau"
      .sort((a, b) => b.length - a.length)
      .map((k) => new RegExp(`(^| )${escapeRegExp(k)}( |$)`)),
  }));
  return function match(comment) {
    const n = normalize(comment);
    if (!n) return null;
    // Ưu tiên lệnh có keyword khớp dài nhất
    let best = null;
    for (const c of compiled) {
      for (const re of c.patterns) {
        const m = n.match(re);
        if (m) {
          const len = m[0].trim().length;
          if (!best || len > best.len) best = { action: c.action, label: c.label, len };
          break;
        }
      }
    }
    return best ? { action: best.action, label: best.label } : null;
  };
}

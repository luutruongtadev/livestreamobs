// Đọc giá người xem gõ trong bình luận → số đồng. Chạy được ở trình duyệt lẫn Node (không phụ thuộc gì).
//   "35k" "35K" "35 nghìn" "35 ngàn" "35 cành" → 35.000
//   "35k5" "35,5k" "35.5k" → 35.500        "35.000" "35,000" "35 000" "35000đ" → 35.000
//   "1tr2" "1 triệu 2" "1m2" "1,2tr" → 1.200.000      "2 triệu 350 nghìn" → 2.350.000
//   "36" (số trơn < 1000) → 36.000 (người Việt hay gõ tắt nghìn)
// Câu dài là nói chuyện → null. Kết quả ngoài [MIN_PRICE, MAX_PRICE] → null.

export const MIN_PRICE = 500;
export const MAX_PRICE = 200_000_000;

/** Chữ số Unicode bất kỳ (toàn chiều rộng, Ả Rập…) → 0-9; bỏ dấu tiếng Việt; chữ thường. */
function fold(text) {
  let out = '';
  for (const ch of String(text ?? '').normalize('NFKC').normalize('NFD')) {
    if (/\p{M}/u.test(ch)) continue;
    if (ch >= '0' && ch <= '9') { out += ch; continue; }
    if (/\p{Nd}/u.test(ch)) {
      let cp = ch.codePointAt(0), base = cp;
      while (base > cp - 9 && /\p{Nd}/u.test(String.fromCodePoint(base - 1))) base--;
      out += String(cp - base);
      continue;
    }
    out += ch === 'đ' || ch === 'Đ' ? 'd' : ch.toLowerCase();
  }
  return out;
}

// đơn vị → hệ số; phần số sau đơn vị là phần lẻ ("1tr2" = 1,2 triệu; "35k5" = 35,5 nghìn)
const UNITS = [
  [/^(trieu|tr|m|cu)$/, 1_000_000], // "củ" = triệu (tiếng lóng)
  [/^(nghin|ngan|ng|k|n|ca|canh)$/, 1_000], // "cành" = nghìn (tiếng lóng)
];
const unitOf = (w) => { for (const [re, f] of UNITS) if (re.test(w)) return f; return 0; };
// từ đệm được phép quanh con số (không tính là "nói chuyện")
const FILLER = new Set(['gia', 'la', 'toi', 'em', 'anh', 'chi', 'minh', 'tui', 'doan', 'chot', 'chon', 'khoang', 'tam', 'cho', 'nha', 'nhe', 'a', 'oi', 'ne', 'day', 'thoi', 'luon', 'dong', 'vnd', 'vnđ', 'd', 'chac', 'so', 'het', 'ok', 'cung']);

/** Số có dấu phân cách: "35.000" / "35,000" / "1.250.000" = nhóm nghìn; "35.5" / "35,25" = số lẻ. */
function readNumber(s) {
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return { v: Number(s.replace(/[.,]/g, '')), grouped: true };
  if (/^\d+[.,]\d{1,2}$/.test(s)) return { v: Number(s.replace(',', '.')), grouped: false };
  if (/^\d+$/.test(s)) return { v: Number(s), grouped: false };
  return null;
}

/** Giá (đồng) trong bình luận, hoặc null nếu không phải một lần đoán giá. */
export function parsePrice(text) {
  const raw = fold(text).replace(/₫/g, ' d ').trim();
  if (!raw || raw.length > 60) return null;
  // tách "35k5" → "35 k 5", "1tr2" → "1 tr 2", giữ "35.000" / "35,5" liền
  const spaced = raw.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2').replace(/[^a-z0-9.,\s]/g, ' ').replace(/(^|\s)[.,]+|[.,]+(\s|$)/g, ' ');
  const words = spaced.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 8) return null;
  // "35 000" (nhóm nghìn tách bằng khoảng trắng) → "35000"
  const toks = [];
  for (const w of words) {
    const last = toks[toks.length - 1];
    if (/^\d{3}$/.test(w) && last?.num && /^\d{1,3}$|^\d{1,3}( \d{3})+$/.test(last.src) && !last.unit) { last.src += ` ${w}`; last.n = { v: Number(last.src.replace(/ /g, '')), grouped: true }; continue; }
    const n = readNumber(w);
    if (n) { toks.push({ num: true, src: w, n }); continue; }
    if (/\d/.test(w)) return null; // lẫn chữ số kiểu lạ ("1a2b")
    toks.push({ num: false, src: w });
  }
  let total = 0, used = 0, talk = 0, lastFactor = Infinity;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!t.num) {
      if (!FILLER.has(t.src)) talk++;
      continue;
    }
    const f = unitOf(toks[i + 1]?.num === false ? toks[i + 1].src : '');
    if (f) {
      if (f >= lastFactor) return null; // "35k 2k" — hai giá
      let v = t.n.v * f;
      i++; // bỏ qua đơn vị
      // phần lẻ ngay sau đơn vị: "1tr2" (= ,2 triệu), "35k5" (= ,5 nghìn) — chỉ khi sau đó không có đơn vị khác
      const nx = toks[i + 1];
      if (nx?.num && !t.n.grouped && /^\d{1,3}$/.test(nx.src) && !unitOf(toks[i + 2]?.num === false ? toks[i + 2].src : '')) {
        v += Number(`0.${nx.src}`) * f;
        i++;
      }
      total += v; used++; lastFactor = f;
      continue;
    }
    if (used) { // số trơn sau "2 triệu" → "2 triệu 350" = 2.350.000? chỉ nhận nếu < 1000 (nghìn)
      if (lastFactor === 1_000_000 && t.n.v < 1000 && !t.n.grouped) { total += t.n.v * 1000; used++; lastFactor = 1000; continue; }
      return null;
    }
    // số trơn không đơn vị
    if (toks.slice(i + 1).some((x) => x.num)) return null; // nhiều con số rời → không rõ
    let v = t.n.v;
    if (!t.n.grouped && v < 1000) v *= 1000; // "36" = 36 nghìn
    total = v; used++;
  }
  if (!used || talk > 3) return null;
  total = Math.round(total);
  return total >= MIN_PRICE && total <= MAX_PRICE ? total : null;
}

/** Bước làm tròn "đẹp" theo độ lớn của giá (để đáp án nhiễu / khoảng gợi ý trông như giá thật). */
export function niceStep(v) {
  if (v < 20_000) return 500;
  if (v < 200_000) return 1000;
  if (v < 1_000_000) return 5000;
  if (v < 10_000_000) return 10_000;
  return 100_000;
}
export const roundNice = (v, mode = 'round') => { const s = niceStep(v); return Math.max(s, Math[mode](v / s) * s); };

/** 35000 → "35.000đ" */
export function fmtPrice(v) {
  const n = Math.round(Number(v) || 0);
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

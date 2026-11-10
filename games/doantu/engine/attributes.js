// Thuộc tính của từ cho kiểu chơi "Đoán thuộc tính" — phần logic thuần (chạy được trên trình duyệt).
import { systemRandom } from '#sdk';
const YN = ['Có', 'Không'];
export const NA = 'Không áp dụng';

/** Bảng chữ cái tiếng Việt (thêm f j w z cho từ mượn) — để so "Chữ cái đầu" đứng trước / sau. */
export const ALPHABET = 'a ă â b c d đ e ê f g h i j k l m n o ô ơ p q r s t u ư v w x y z'.split(' ');
export const TONES = ['Ngang', 'Sắc', 'Huyền', 'Hỏi', 'Ngã', 'Nặng'];
const TONE_MARK = { '́': 'Sắc', '̀': 'Huyền', '̉': 'Hỏi', '̃': 'Ngã', '̣': 'Nặng' };

/**
 * Thuộc tính của một từ.
 * - ordinal: có thứ bậc → ô hiện mũi tên ↑↓ (đáp án cao / thấp hơn), lệch 1 bậc thì ô vàng.
 * - multi: nhiều giá trị (màu, thanh điệu) → trùng một phần thì ô vàng.
 * - text: tính từ mặt chữ (không cần Claude, dùng được với mọi từ).
 * - weight: hay được chọn hơn (thuộc tính chia đôi kho từ tốt, khách quan); thấp = thuộc tính "bất ngờ", thỉnh thoảng mới có.
 * Mỗi vòng: Loại + 4 thuộc tính + cột "Chữ cái đầu" bị khoá, mở sau N lượt đoán.
 */
export const ATTRS = [
  { id: 'loai', icon: '🏷️', name: 'Loại', values: ['Đồ vật', 'Con vật', 'Cây cối', 'Món ăn/đồ uống', 'Nơi chốn', 'Người/nghề', 'Thiên nhiên', 'Cảm xúc/khái niệm', 'Hoạt động', 'Phương tiện'] },
  { id: 'o_dau', icon: '📍', name: 'Ở đâu', weight: 2, values: ['Trong nhà', 'Nhà bếp', 'Đường phố', 'Thiên nhiên', 'Trường/công sở', 'Trời/biển', 'Khắp nơi'] },
  { id: 'kich_thuoc', icon: '📏', name: 'Kích thước', weight: 3, values: ['Nhỏ hơn bàn tay', 'Cỡ cái bàn', 'Cỡ người', 'To hơn nhà'], ordinal: true },
  { id: 'mau', icon: '🎨', name: 'Màu', weight: 2, multi: true, values: ['Đỏ', 'Vàng/cam', 'Xanh lá', 'Xanh dương', 'Trắng', 'Đen/xám', 'Nâu', 'Hồng/tím'] },
  { id: 'chat_lieu', icon: '🧱', name: 'Chất liệu', weight: 3, values: ['Gỗ/tre', 'Kim loại', 'Nhựa/cao su', 'Vải/len', 'Giấy', 'Thủy tinh/sứ', 'Đá/đất/cát', 'Hữu cơ', 'Nước/khí'] },
  { id: 'song', icon: '🫀', name: 'Có sự sống', weight: 3, values: YN },
  { id: 'an_duoc', icon: '🍜', name: 'Ăn/uống được', weight: 3, values: YN },
  { id: 'dien', icon: '⚡', name: 'Dùng điện/pin', weight: 2, values: YN },
  { id: 'thoi_dai', icon: '🕰️', name: 'Thời đại', weight: 1.5, values: ['Xưa/truyền thống', 'Hiện đại', 'Cả hai'] },
  { id: 'gia', icon: '💰', name: 'Giá tiền', weight: 2, values: ['Không mua được', 'Rẻ', 'Vừa', 'Đắt'], ordinal: true },
  { id: 'can_nang', icon: '⚖️', name: 'Cân nặng', weight: 2, values: ['Nhẹ tênh', 'Cầm được', 'Nặng', 'Không nhấc nổi'], ordinal: true },
  { id: 'nhiet', icon: '🌡️', name: 'Nóng/lạnh', weight: 1.5, values: ['Lạnh', 'Bình thường', 'Nóng'], ordinal: true },
  { id: 'di_chuyen', icon: '🏃', name: 'Tự di chuyển', weight: 2, values: YN },
  { id: 'so_duoc', icon: '✋', name: 'Cầm/sờ được', weight: 1.5, values: YN },
  { id: 'tieng', icon: '🔊', name: 'Phát ra tiếng', weight: 2, values: YN },
  { id: 'co_mui', icon: '👃', name: 'Có mùi rõ', weight: 1.5, values: YN },
  { id: 'nuoc', icon: '💧', name: 'Liên quan nước', weight: 1.5, values: YN },
  { id: 'le_tet', icon: '🧧', name: 'Có trong Tết', weight: 1, values: YN },
  { id: 'ca_dao', icon: '📜', name: 'Ca dao, tục ngữ', weight: 1, values: YN },
  { id: 'viet_nam', icon: '⭐', name: 'Đặc trưng VN', weight: 1.5, values: YN },
  { id: 'mua', icon: '📅', name: 'Mùa hay gặp', weight: 1, values: ['Quanh năm', 'Hè', 'Đông', 'Tết'] },
  { id: 'so_chan', icon: '🦵', name: 'Số chân', weight: 2, values: ['Không có', '2 chân', '4 chân', 'Nhiều hơn 4'], ordinal: true },
  { id: 'tu_loai', icon: '🔤', name: 'Từ loại', weight: 1, values: ['Danh từ', 'Động từ', 'Tính từ', 'Tên riêng'] },
  { id: 'nguon_goc', icon: '🏛️', name: 'Nguồn gốc từ', weight: 2, values: ['Thuần Việt', 'Hán Việt', 'Từ mượn'] },
  // thuộc tính mặt chữ (tính tại chỗ)
  { id: 'thanh_dieu', icon: '🎵', name: 'Thanh điệu', weight: 2, multi: true, text: true, values: TONES },
  { id: 'chu_dau', icon: '🔠', name: 'Chữ cái đầu', text: true, ordinal: true, values: ALPHABET.map((c) => c.toUpperCase()) },
];
export const ATTR_BY_ID = Object.fromEntries(ATTRS.map((a) => [a.id, a]));
export const SEMANTIC = ATTRS.filter((a) => !a.text);
export const LOCKED_ATTR = 'chu_dau';

/** Thuộc tính mặt chữ của một từ: thanh điệu các tiếng + chữ cái đầu (bỏ dấu thanh, giữ ă â đ ê ô ơ ư). */
export function textAttrs(word) {
  const w = String(word || '').toLowerCase().normalize('NFD');
  const tones = new Set();
  for (const syl of w.split(/\s+/).filter(Boolean)) {
    if (!/\p{L}/u.test(syl)) continue;
    const m = [...syl].find((ch) => TONE_MARK[ch]);
    tones.add(m ? TONE_MARK[m] : 'Ngang');
  }
  const first = (w.replace(/[̣̀́̃̉]/g, '').normalize('NFC').match(/\p{L}/u) || [])[0];
  return {
    thanh_dieu: tones.size ? TONES.filter((t) => tones.has(t)) : null,
    chu_dau: first && ALPHABET.includes(first) ? first.toUpperCase() : null,
  };
}

/** Thuộc tính đầy đủ = thuộc tính nghĩa (Claude / soạn sẵn) + thuộc tính mặt chữ. */
export const fullAttrs = (word, semantic) => ({ ...(semantic || {}), ...textAttrs(word) });

const asSet = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/**
 * So một thuộc tính → { s, dir }.
 * s: hit (giống) · part (trùng một phần) · near (lệch 1 bậc) · miss (khác) · na (không áp dụng)
 * dir: 'up' = đáp án cao hơn / đứng sau trong bảng chữ cái, 'down' = thấp hơn / đứng trước (chỉ với thuộc tính có thứ bậc).
 */
export function compareAttr(attr, secretVal, guessVal) {
  const empty = (v) => v == null || (Array.isArray(v) && !v.length);
  if (empty(guessVal) || empty(secretVal)) return { s: empty(guessVal) && empty(secretVal) ? 'hit' : 'na' };
  if (attr.multi) {
    const a = asSet(secretVal), b = asSet(guessVal);
    const common = a.filter((x) => b.includes(x)).length;
    if (common === a.length && common === b.length) return { s: 'hit' };
    return { s: common ? 'part' : 'miss' };
  }
  if (guessVal === secretVal) return { s: 'hit' };
  if (attr.ordinal) {
    const d = attr.values.indexOf(secretVal) - attr.values.indexOf(guessVal);
    return { s: Math.abs(d) === 1 ? 'near' : 'miss', dir: d > 0 ? 'up' : 'down' };
  }
  return { s: 'miss' };
}

/** Chọn thuộc tính cho vòng: Loại + 4 thuộc tính bốc thăm theo trọng số (chỉ cái có nghĩa với từ bí mật) + cột khoá "Chữ cái đầu". */
export function chooseAttrs(secretAttrs, random = systemRandom, n = 6) {
  const pool = ATTRS.filter((a) => a.id !== 'loai' && a.id !== LOCKED_ATTR && a.weight && !(secretAttrs[a.id] == null || (Array.isArray(secretAttrs[a.id]) && !secretAttrs[a.id].length)));
  const out = [];
  let yn = 0;
  while (out.length < n - 2 && pool.length) {
    // tối đa 2 thuộc tính Có/Không để bảng đa dạng
    const cand = pool.filter((a) => yn < 2 || a.values !== YN);
    if (!cand.length) break;
    let r = random() * cand.reduce((t, a) => t + a.weight, 0);
    let pick = cand[cand.length - 1];
    for (const a of cand) { r -= a.weight; if (r <= 0) { pick = a; break; } }
    out.push(pick);
    if (pick.values === YN) yn++;
    pool.splice(pool.indexOf(pick), 1);
  }
  return ['loai', ...out.map((a) => a.id), ...(secretAttrs[LOCKED_ATTR] ? [LOCKED_ATTR] : [])];
}


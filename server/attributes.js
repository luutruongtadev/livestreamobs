import fs from 'node:fs';
import path from 'node:path';
import { canon } from './scorer.js';

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
const SEMANTIC = ATTRS.filter((a) => !a.text);
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
export function chooseAttrs(secretAttrs, random = Math.random, n = 6) {
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

// Mã ngắn cho từng thuộc tính + giá trị trả về là SỐ THỨ TỰ (-1 = không áp dụng): đầu ra của Claude ngắn
// hơn nhiều so với trả nguyên chữ tiếng Việt ("kt":0 thay vì "kich_thuoc":"Nhỏ hơn bàn tay") → tốn ít token.
export const CODE = { loai: 'lo', o_dau: 'od', kich_thuoc: 'kt', mau: 'mu', chat_lieu: 'cl', song: 'so', an_duoc: 'ad', dien: 'di', thoi_dai: 'td', gia: 'gi', can_nang: 'cn', nhiet: 'nh', di_chuyen: 'dc', so_duoc: 'sd', tieng: 'ti', co_mui: 'cm', nuoc: 'nu', le_tet: 'lt', ca_dao: 'cd', viet_nam: 'vn', mua: 'ma', so_chan: 'sc', tu_loai: 'tl', nguon_goc: 'ng' };
for (const a of SEMANTIC) if (!CODE[a.id]) throw new Error(`thiếu mã cho thuộc tính ${a.id}`);

const SYSTEM = `Bạn phân loại từ / cụm từ tiếng Việt cho trò chơi đoán từ trên livestream.
Với MỖI từ, chọn giá trị đúng nhất cho từng thuộc tính theo hiểu biết phổ thông của người Việt (nghĩ tới thứ điển hình nhất mà từ đó gọi tên). Ưu tiên sự thật khách quan, tránh cảm tính.
Trả về SỐ THỨ TỰ của giá trị (bắt đầu từ 0). Dùng -1 khi thuộc tính không có nghĩa với từ đó (vd kích thước / màu / cân nặng của "nỗi nhớ"; số chân của "cái bánh" là "Không có", còn của "tình yêu" là -1).
"mu" (màu) là mảng 1–2 số (màu chủ đạo), không có màu thì mảng rỗng.
"cl" Hữu cơ = thịt, cây, đồ ăn, sinh vật. "ng" là nguồn gốc của chính TỪ đó: Thuần Việt (con, nhà, ăn…), Hán Việt (bệnh viện, hạnh phúc…), Từ mượn (ô tô, cà phê, pizza…); từ ghép lẫn thì chọn phần chính.
Từ có thể gõ không dấu, sai chính tả hoặc bằng tiếng Anh: hiểu theo nghĩa hợp lý nhất. "w" giữ nguyên chuỗi từ như đã nhận.
Thuộc tính (mã: tên: giá trị theo số thứ tự):
${SEMANTIC.map((a) => `- ${CODE[a.id]}: ${a.name}: ${a.values.map((v, i) => `${i}=${v}`).join(', ')}`).join('\n')}`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          w: { type: 'string' },
          ...Object.fromEntries(SEMANTIC.map((a) => [CODE[a.id], a.multi
            ? { type: 'array', items: { type: 'integer', enum: a.values.map((_, i) => i) } }
            : { type: 'integer', enum: [-1, ...a.values.map((_, i) => i)] }])),
        },
        required: ['w', ...SEMANTIC.map((a) => CODE[a.id])],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

/** Một bản ghi thuộc tính cũ (thiếu thuộc tính mới) thì phân loại lại. */
const complete = (a) => a && SEMANTIC.every((x) => x.id in a);

/**
 * Thuộc tính của từ: Claude xếp đủ 24 thuộc tính nghĩa một lần cho mỗi từ, gom lô, lưu data/attributes.json dùng mãi.
 * get(word) → Promise<{ attrId: value | null }> hoặc null nếu lỗi.
 */
export class AttrStore {
  constructor({ client = null, model = 'claude-haiku-5-5', filePath = null, batchMs = 700, maxBatch = 15, log = console } = {}) {
    this.client = client;
    this.model = model;
    this.filePath = filePath;
    this.batchMs = batchMs;
    this.maxBatch = maxBatch;
    this.log = log;
    this.cache = new Map();
    this.queue = new Map(); // từ -> [resolve]
    this.timer = null;
    this.dirty = false;
    this.calls = 0;
    try { if (filePath) this.cache = new Map(Object.entries(JSON.parse(fs.readFileSync(filePath, 'utf8')))); } catch { /* chưa có */ }
  }

  get available() { return !!this.client; }

  /** Từ đã có thuộc tính trong cache (không tốn lượt gọi Claude). */
  has(word) { return complete(this.cache.get(canon(word))); }

  /** Nạp sẵn thuộc tính của các từ soạn tay (từ đoán trùng cũng không phải gọi Claude). */
  seed(words = []) {
    for (const w of words) if (w?.word && complete(w.attrs) && !complete(this.cache.get(canon(w.word)))) this.cache.set(canon(w.word), w.attrs);
  }

  save() {
    if (!this.filePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(Object.fromEntries([...this.cache.entries()].slice(-30000))));
    this.dirty = false;
  }

  get(word) {
    const w = canon(word);
    if (!w) return Promise.resolve(null);
    if (complete(this.cache.get(w))) return Promise.resolve(this.cache.get(w));
    if (!this.client) return Promise.resolve(null);
    return new Promise((resolve) => {
      if (!this.queue.has(w)) this.queue.set(w, []);
      this.queue.get(w).push(resolve);
      if (!this.timer) this.timer = setTimeout(() => this.flush(), this.batchMs);
    });
  }

  async flush() {
    this.timer = null;
    const words = [...this.queue.keys()];
    const q = this.queue;
    this.queue = new Map();
    for (let i = 0; i < words.length; i += this.maxBatch) {
      const chunk = words.slice(i, i + this.maxBatch);
      let got = {};
      try { got = await this.classify(chunk); } catch (e) { this.log.warn?.(`[attrs] Claude xếp thuộc tính lỗi: ${e?.message || e}`); }
      for (const w of chunk) {
        const a = got[w] || null;
        if (a) { this.cache.set(w, a); this.dirty = true; }
        for (const r of q.get(w)) r(a);
      }
    }
  }

  async classify(words) {
    this.calls++;
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 8000,
      // tự chuyển model khi bị từ chối: không có trên Haiku
      ...(/haiku/.test(this.model) ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      // phần hướng dẫn + bảng thuộc tính giống hệt mọi lần gọi → cache lại cho rẻ
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Các từ cần phân loại: ${JSON.stringify(words)}` }],
    });
    if (response.stop_reason === 'refusal') throw new Error('refusal');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const out = {};
    for (const it of JSON.parse(text).items || []) {
      const w = canon(it.w);
      if (!words.includes(w)) continue;
      const a = {};
      const val = (attr, i) => (Number.isInteger(i) && i >= 0 && i < attr.values.length ? attr.values[i] : null);
      for (const attr of SEMANTIC) {
        const v = it[CODE[attr.id]];
        if (attr.multi) { const arr = [...new Set((Array.isArray(v) ? v : []).map((i) => val(attr, i)).filter(Boolean))].slice(0, 2); a[attr.id] = arr.length ? arr : null; }
        else a[attr.id] = val(attr, v);
      }
      out[w] = a;
    }
    return out;
  }
}

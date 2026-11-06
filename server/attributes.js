import fs from 'node:fs';
import path from 'node:path';
import { canon } from './scorer.js';

const YN = ['Có', 'Không'];
export const NA = 'Không áp dụng';

/**
 * 22 thuộc tính của một từ. ordinal: giá trị có thứ bậc → lệch 1 bậc hiện ô vàng.
 * Mỗi vòng chế độ "thuộc tính" chọn 6 cái (Loại luôn có).
 */
export const ATTRS = [
  { id: 'loai', icon: '🏷️', name: 'Loại', values: ['Đồ vật', 'Con vật', 'Cây cối', 'Món ăn/đồ uống', 'Nơi chốn', 'Người/nghề', 'Thiên nhiên', 'Cảm xúc/khái niệm', 'Hoạt động', 'Phương tiện'] },
  { id: 'o_dau', icon: '📍', name: 'Ở đâu', values: ['Trong nhà', 'Nhà bếp', 'Đường phố', 'Thiên nhiên', 'Trường/công sở', 'Trời/biển', 'Khắp nơi'] },
  { id: 'kich_thuoc', icon: '📏', name: 'Kích thước', values: ['Nhỏ hơn bàn tay', 'Cỡ cái bàn', 'Cỡ người', 'To hơn nhà'], ordinal: true },
  { id: 'mau', icon: '🎨', name: 'Màu', values: ['Đỏ', 'Vàng/cam', 'Xanh lá', 'Xanh dương', 'Trắng', 'Đen/xám', 'Nâu', 'Nhiều màu'] },
  { id: 'song', icon: '🫀', name: 'Có sự sống', values: YN },
  { id: 'an_duoc', icon: '🍜', name: 'Ăn/uống được', values: YN },
  { id: 'dien', icon: '⚡', name: 'Dùng điện/pin', values: YN },
  { id: 'thoi_dai', icon: '🕰️', name: 'Thời đại', values: ['Xưa/truyền thống', 'Hiện đại', 'Cả hai'] },
  { id: 'gia', icon: '💰', name: 'Giá tiền', values: ['Không mua được', 'Rẻ', 'Vừa', 'Đắt'], ordinal: true },
  { id: 'can_nang', icon: '⚖️', name: 'Cân nặng', values: ['Nhẹ tênh', 'Cầm được', 'Nặng', 'Không nhấc nổi'], ordinal: true },
  { id: 'nhiet', icon: '🌡️', name: 'Nóng/lạnh', values: ['Lạnh', 'Bình thường', 'Nóng'], ordinal: true },
  { id: 'di_chuyen', icon: '🏃', name: 'Tự di chuyển', values: YN },
  { id: 'so_duoc', icon: '✋', name: 'Sờ được', values: YN },
  { id: 'tieng', icon: '🔊', name: 'Phát ra tiếng', values: YN },
  { id: 'nuoc', icon: '💧', name: 'Liên quan nước', values: YN },
  { id: 'le_tet', icon: '🎉', name: 'Gắn với lễ Tết', values: YN },
  { id: 'tre_em', icon: '👶', name: 'Trẻ em thích', values: YN },
  { id: 'viet_nam', icon: '🇻🇳', name: 'Đặc trưng VN', values: YN },
  { id: 'mua', icon: '📅', name: 'Mùa hay gặp', values: ['Quanh năm', 'Hè', 'Đông', 'Tết'] },
  { id: 'cam_giac', icon: '😀', name: 'Cảm giác', values: ['Vui', 'Thư giãn', 'Sợ/khó chịu', 'Bình thường'] },
  { id: 'so_chan', icon: '🦵', name: 'Số chân', values: ['Không có', '2 chân', '4 chân', 'Nhiều hơn 4'], ordinal: true },
  { id: 'tu_loai', icon: '🔤', name: 'Từ loại', values: ['Danh từ', 'Động từ', 'Tính từ', 'Tên riêng'] },
];
export const ATTR_BY_ID = Object.fromEntries(ATTRS.map((a) => [a.id, a]));

const SYSTEM = `Bạn phân loại từ / cụm từ tiếng Việt cho trò chơi đoán từ trên livestream.
Với MỖI từ, chọn giá trị đúng nhất cho từng thuộc tính theo hiểu biết phổ thông của người Việt (nghĩ tới thứ điển hình nhất mà từ đó gọi tên).
Chọn "${NA}" khi thuộc tính không có nghĩa với từ đó (vd kích thước / màu / cân nặng của "nỗi nhớ"; số chân của "cái bánh" = "Không có", nhưng của "tình yêu" = "${NA}").
Từ có thể gõ không dấu, sai chính tả hoặc bằng tiếng Anh: hiểu theo nghĩa hợp lý nhất. Giữ nguyên chuỗi "word" như đã nhận.
Ý nghĩa thuộc tính:
${ATTRS.map((a) => `- ${a.id} (${a.name}): ${a.values.join(' | ')}`).join('\n')}`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          ...Object.fromEntries(ATTRS.map((a) => [a.id, { type: 'string', enum: [...a.values, NA] }])),
        },
        required: ['word', ...ATTRS.map((a) => a.id)],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

/** So một thuộc tính: hit (giống) · near (lệch 1 bậc) · miss (khác) · na (không áp dụng). */
export function compareAttr(attr, secretVal, guessVal) {
  if (guessVal == null || secretVal == null) return guessVal == null && secretVal == null ? 'hit' : 'na';
  if (guessVal === secretVal) return 'hit';
  if (attr.ordinal) {
    const d = Math.abs(attr.values.indexOf(guessVal) - attr.values.indexOf(secretVal));
    if (d === 1) return 'near';
  }
  return 'miss';
}

/** Chọn 6 thuộc tính cho vòng: Loại luôn có + 5 cái có nghĩa với từ bí mật, trộn cả Có/Không lẫn nhiều giá trị. */
export function chooseAttrs(secretAttrs, random = Math.random, n = 6) {
  const usable = ATTRS.filter((a) => a.id !== 'loai' && secretAttrs[a.id] != null);
  const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const yn = shuffle(usable.filter((a) => a.values === YN));
  const multi = shuffle(usable.filter((a) => a.values !== YN));
  const out = [];
  // xen kẽ 2 nhóm cho đa dạng (nhiều giá trị trước)
  while (out.length < n - 1 && (yn.length || multi.length)) {
    if (multi.length) out.push(multi.shift());
    if (out.length < n - 1 && yn.length) out.push(yn.shift());
  }
  return [ATTR_BY_ID.loai, ...out].map((a) => a.id);
}

/**
 * Thuộc tính của từ: Claude xếp đủ 22 thuộc tính một lần cho mỗi từ, gom lô, lưu data/attributes.json dùng mãi.
 * get(word) → Promise<{ attrId: value | null }> hoặc null nếu lỗi.
 */
export class AttrStore {
  constructor({ client = null, model = 'claude-opus-5-5', filePath = null, batchMs = 700, maxBatch = 15, log = console } = {}) {
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

  save() {
    if (!this.filePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(Object.fromEntries([...this.cache.entries()].slice(-30000))));
    this.dirty = false;
  }

  get(word) {
    const w = canon(word);
    if (!w) return Promise.resolve(null);
    if (this.cache.has(w)) return Promise.resolve(this.cache.get(w));
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
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Các từ cần phân loại: ${JSON.stringify(words)}` }],
    });
    if (response.stop_reason === 'refusal') throw new Error('refusal');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const out = {};
    for (const it of JSON.parse(text).items || []) {
      const w = canon(it.word);
      if (!words.includes(w)) continue;
      const a = {};
      for (const attr of ATTRS) {
        const v = it[attr.id];
        a[attr.id] = attr.values.includes(v) ? v : null;
      }
      out[w] = a;
    }
    return out;
  }
}

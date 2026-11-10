import fs from 'node:fs';
import path from 'node:path';
import { canon } from '#sdk';
import { SEMANTIC } from '../engine/attributes.js';

// Phần logic thuần nằm ở engine/attributes.js; file này giữ AttrStore (Claude + lưu file, chạy trong gateway).
export * from '../engine/attributes.js';

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
  constructor({ client = null, model = 'claude-haiku-5-5', filePath = null, batchMs = 400, maxBatch = 15, log = console } = {}) {
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

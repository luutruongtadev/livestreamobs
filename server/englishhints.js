import fs from 'node:fs';
import path from 'node:path';
import { canon } from './scorer.js';
import { normalize } from './text.js';

const SYSTEM = `Bạn soạn gợi ý cho trò chơi đoán từ tiếng Việt trên livestream, chế độ "gợi ý bằng tiếng Anh".
Cho một TỪ BÍ MẬT tiếng Việt, đưa đúng 5 gợi ý TIẾNG ANH thật ĐƠN GIẢN, trình độ A2 (học sinh cấp 2 hiểu ngay):
- Mỗi gợi ý là 1 từ HOẶC 1 cụm mô tả ngắn 2–5 từ (vd "lives in the sea", "you can eat it", "very cold place", "red with black dots"). Nên dùng nhiều cụm mô tả, không chỉ toàn từ đơn lẻ. Tối đa 30 ký tự.
- Chỉ dùng từ rất thông dụng (hot, big, eat, water, school, family, morning…). KHÔNG dùng từ học thuật, chuyên ngành, hiếm gặp (vd không dùng "illuminate", "celestial", "extinct").
- Xếp từ XA đến GẦN: gợi ý 1 khó (liên tưởng xa), gợi ý 5 dễ nhất nhưng vẫn KHÔNG được là bản dịch trực tiếp của từ bí mật. Tên riêng nổi tiếng (Nemo, Paris, Santa) dùng được ở gợi ý cuối.
- Mỗi gợi ý phải là đặc điểm người Việt nhìn là liên tưởng ngay tới từ bí mật (hình dáng, màu, công dụng, ở đâu, khi nào dùng). KHÔNG dùng kiến thức lắt léo / ít người biết (nguồn gốc quốc gia, năm phát minh…), trừ khi đó là đặc điểm nổi tiếng nhất (sushi → Japan) và đặt ở cuối.
- Không dùng tiếng Việt, không lặp gợi ý, không viết câu dài.
Ví dụ: "mặt trời" → ["summer days", "makes you hot", "up in the sky", "yellow and bright", "comes up every morning"] (không dùng "sun").`;

const SCHEMA = {
  type: 'object',
  properties: { hints: { type: 'array', items: { type: 'string' } } },
  required: ['hints'],
  additionalProperties: false,
};

const clean = (h) => String(h || '').replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
// đổi khi sửa prompt: gợi ý soạn theo prompt cũ bị bỏ, soạn lại
const PROMPT_V = 'v3-phrase';

/**
 * 5 gợi ý tiếng Anh cho một từ bí mật: Claude soạn một lần, lưu data/english-hints.json dùng mãi.
 * get(secret, aliases) → Promise<string[] | null>.
 */
export class EnglishHintStore {
  constructor({ client = null, model = 'claude-opus-5-5', filePath = null, log = console } = {}) {
    this.client = client;
    this.model = model;
    this.filePath = filePath;
    this.log = log;
    this.cache = new Map();
    this.pending = new Map();
    this.dirty = false;
    try {
      if (filePath) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.__v === PROMPT_V) this.cache = new Map(Object.entries(data.hints || {}));
      }
    } catch { /* chưa có */ }
  }

  get available() { return !!this.client; }

  /** Nạp sẵn gợi ý soạn tay. */
  seed(words = []) {
    // gợi ý soạn tay luôn được ưu tiên hơn bản Claude đã lưu
    for (const w of words) if (w?.word && Array.isArray(w.en) && w.en.length) this.cache.set(canon(w.word), w.en.slice(0, 5));
  }

  save() {
    if (!this.filePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ __v: PROMPT_V, hints: Object.fromEntries(this.cache) }));
    this.dirty = false;
  }

  get(secret, aliases = []) {
    const w = canon(secret);
    if (this.cache.has(w)) return Promise.resolve(this.cache.get(w));
    if (!this.client) return Promise.resolve(null);
    if (!this.pending.has(w)) {
      this.pending.set(w, this.generate(w, aliases).catch((e) => { this.log.warn?.(`[en-hints] lỗi: ${e?.message || e}`); return null; }).finally(() => this.pending.delete(w)));
    }
    return this.pending.get(w);
  }

  async generate(word, aliases) {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `TỪ BÍ MẬT: ${JSON.stringify(word)}${aliases.length ? ` (cách gọi khác: ${aliases.join(', ')})` : ''}` }],
    });
    if (response.stop_reason === 'refusal') throw new Error('refusal');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    // bỏ gợi ý trùng / chứa nguyên đáp án
    const secretN = normalize(word);
    const seen = new Set();
    const hints = [];
    for (const h of JSON.parse(text).hints || []) {
      const c = clean(h);
      const n = normalize(c);
      if (!c || seen.has(n) || (secretN && n.includes(secretN))) continue;
      seen.add(n);
      hints.push(c);
      if (hints.length === 5) break;
    }
    if (!hints.length) throw new Error('không có gợi ý hợp lệ');
    this.cache.set(word, hints);
    this.dirty = true;
    return hints;
  }
}

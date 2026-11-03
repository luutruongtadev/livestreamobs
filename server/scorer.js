import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { normalize } from './text.js';

/** Chuẩn hoá để so khớp: chữ thường, gom khoảng trắng, giữ dấu tiếng Việt. */
export function canon(text) {
  return String(text ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Gọn để so khớp: bỏ dấu, hoa thường, khoảng trắng, dấu câu ("Kai'Sa" = "kaisa"). */
export const compact = (s) => normalize(s).replace(/ /g, '');

/** Trùng từ bí mật hoặc một biệt danh (không phân biệt dấu, hoa thường, khoảng trắng) → đoán đúng. */
// Từ chỉ loại đứng đầu: đoán "chó" vẫn trúng "con chó", "xương rồng" trúng "cây xương rồng"
const CLASSIFIERS = new Set(['con', 'cai', 'qua', 'trai', 'chiec', 'cay']);
function core(s) {
  const parts = normalize(s).split(' ').filter(Boolean);
  if (parts.length > 1 && CLASSIFIERS.has(parts[0])) parts.shift();
  return parts.join('');
}

export function isExact(guess, secret, aliases = []) {
  const g = compact(guess);
  if (!g) return false;
  if (g === compact(secret) || aliases.some((a) => compact(a) === g)) return true;
  const c = core(guess);
  return c.length >= 1 && (c === core(secret) || aliases.some((a) => core(a) === c));
}

/**
 * Bộ chấm dự phòng khi không có API key: so trùng âm tiết / chữ cái.
 * Không hiểu nghĩa, chỉ để game vẫn chạy được.
 */
export function simpleScore(secret, guess) {
  if (isExact(guess, secret)) return 100;
  const a = normalize(secret).split(' '), b = normalize(guess).split(' ');
  const shared = b.filter((w) => a.includes(w)).length;
  const syl = shared / Math.max(a.length, b.length);
  const bigrams = (s) => { const out = new Set(); const t = s.replace(/ /g, ''); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; };
  const A = bigrams(normalize(secret)), B = bigrams(normalize(guess));
  let inter = 0; for (const x of B) if (A.has(x)) inter++;
  const dice = (2 * inter) / Math.max(1, A.size + B.size);
  return Math.max(1, Math.min(99, Math.round(5 + syl * 60 + dice * 30)));
}

const SYSTEM = `Bạn là giám khảo của trò chơi đoán từ tiếng Việt trên livestream.
Mỗi lần bạn nhận một TỪ BÍ MẬT và danh sách TỪ ĐOÁN của người xem. Với mỗi từ đoán, chấm mức độ GẦN NGHĨA với từ bí mật trên thang 1-99 (100 chỉ dành cho đoán trúng, hệ thống tự xử lý, bạn không dùng 100).

Thang điểm:
- 90-99: đồng nghĩa hoặc gần như cùng một thứ (khác cách gọi, từ địa phương, viết tắt phổ biến).
- 70-89: liên quan rất chặt: cùng loại hẹp, bộ phận - tổng thể, thường đi liền với nhau.
- 40-69: cùng chủ đề hoặc liên tưởng rõ ràng.
- 15-39: liên tưởng xa, chỉ hơi dính dáng.
- 1-14: không liên quan, vô nghĩa, câu chào hỏi, hoặc nội dung thô tục.

Người xem hay gõ không dấu hoặc sai chính tả: hãy hiểu theo nghĩa tiếng Việt hợp lý nhất. Chấm nhất quán: cùng một từ đoán luôn cùng điểm. Chỉ chấm theo nghĩa, không cộng điểm vì giống chữ.
Trả về đúng mọi từ đoán, giữ nguyên chuỗi "word" như đã nhận.`;

const SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: { word: { type: 'string' }, score: { type: 'integer' } },
        required: ['word', 'score'],
        additionalProperties: false,
      },
    },
  },
  required: ['scores'],
  additionalProperties: false,
};

/**
 * Chấm điểm bằng Claude: gom các từ đoán thành lô, cache theo (từ bí mật, từ đoán).
 * score(secret, word) trả về Promise<{ score, source }>.
 */
export class ClaudeScorer {
  constructor({ model = 'claude-opus-5-5', batchMs = 800, maxBatch = 25, cachePath = null, client = null, log = console } = {}) {
    this.model = model;
    this.batchMs = batchMs;
    this.maxBatch = maxBatch;
    this.cachePath = cachePath;
    this.log = log;
    this.client = client || new Anthropic(); // ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / hồ sơ `ant auth login`
    this.cache = new Map(); // `${secret}|${word}` -> score
    this.queue = new Map(); // secret -> Map(word -> [resolve])
    this.timer = null;
    this.calls = 0;
    this.loadCache();
  }

  loadCache() {
    if (!this.cachePath) return;
    try { this.cache = new Map(Object.entries(JSON.parse(fs.readFileSync(this.cachePath, 'utf8')))); } catch { /* chưa có */ }
  }

  saveCache() {
    if (!this.cachePath || !this.cacheDirty) return;
    fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
    const entries = [...this.cache.entries()].slice(-20000);
    fs.writeFileSync(this.cachePath, JSON.stringify(Object.fromEntries(entries)));
    this.cacheDirty = false;
  }

  /** ctx: { id, prompt } — ngữ cảnh của bộ từ (vd tướng LMHT), thêm vào yêu cầu chấm. */
  score(secret, word, ctx = null) {
    const s = (ctx?.id ? `${ctx.id}:` : '') + canon(secret);
    const key = `${s}|${canon(word)}`;
    if (this.cache.has(key)) return Promise.resolve({ score: this.cache.get(key), source: 'cache' });
    if (ctx?.prompt) (this.contexts ||= new Map()).set(s, ctx.prompt);
    return new Promise((resolve) => {
      if (!this.queue.has(s)) this.queue.set(s, new Map());
      const q = this.queue.get(s);
      const w = canon(word);
      if (!q.has(w)) q.set(w, []);
      q.get(w).push(resolve);
      if (!this.timer) this.timer = setTimeout(() => this.flush(), this.batchMs);
    });
  }

  async flush() {
    this.timer = null;
    for (const [secret, q] of this.queue) {
      this.queue.delete(secret);
      const words = [...q.keys()];
      for (let i = 0; i < words.length; i += this.maxBatch) {
        const chunk = words.slice(i, i + this.maxBatch);
        let scores = {};
        let source = 'claude';
        try {
          scores = await this.callClaude(secret.replace(/^[^:|]+:/, ''), chunk, this.contexts?.get(secret));
        } catch (e) {
          this.log.warn?.(`[wordgame] Chấm bằng Claude lỗi (${e?.status || ''} ${e?.message || e}) — dùng chấm đơn giản`);
          source = 'simple';
        }
        for (const w of chunk) {
          let sc = scores[w];
          if (!Number.isFinite(sc)) { sc = simpleScore(secret.replace(/^[^:|]+:/, ''), w); source = source === 'claude' ? 'mixed' : source; }
          sc = Math.max(1, Math.min(99, Math.round(sc)));
          if (scores[w] !== undefined) { this.cache.set(`${secret}|${w}`, sc); this.cacheDirty = true; }
          for (const r of q.get(w)) r({ score: sc, source: scores[w] !== undefined ? 'claude' : 'simple' });
        }
      }
    }
  }

  async callClaude(secret, words, context = '') {
    this.calls++;
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `${context ? `NGỮ CẢNH: ${context}\n` : ''}TỪ BÍ MẬT: ${JSON.stringify(secret)}\nTỪ ĐOÁN: ${JSON.stringify(words)}`,
      }],
    });
    if (response.stop_reason === 'refusal') throw new Error('refusal');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const data = JSON.parse(text);
    const out = {};
    for (const it of data.scores || []) {
      const w = canon(it.word);
      if (words.includes(w) && Number.isFinite(it.score)) out[w] = it.score;
    }
    return out;
  }
}

/** Bộ chấm dự phòng, cùng giao diện với ClaudeScorer. */
export class SimpleScorer {
  score(secret, word) { return Promise.resolve({ score: simpleScore(secret, word), source: 'simple' }); }
  saveCache() {}
}

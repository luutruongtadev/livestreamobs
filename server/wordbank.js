import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { canon } from './scorer.js';

/** Quy tắc gợi ý mô tả + emoji (dùng chung khi sinh lô mới và khi bổ sung cho từ cũ). */
const HINT_RULES = `"desc": đúng 2 câu mô tả, mở lần lượt khi chơi:
- Câu 1 khó: gián tiếp, gợi công dụng / hoàn cảnh / cảm giác, không nói thẳng nó là gì.
- Câu 2 dễ hơn: đặc điểm nổi bật hơn nhưng vẫn không lộ đáp án.
- Mỗi câu tối đa 60 ký tự, tiếng Việt tự nhiên, không dấu chấm cuối câu.
- TUYỆT ĐỐI không chứa từ bí mật hay bất kỳ tiếng nào của nó (trừ "con", "cái", "quả"), không đánh vần, không nói số chữ.
"emoji": đúng 3 emoji gợi hình, cách nhau một dấu cách, xếp từ mơ hồ tới rõ (không dùng emoji vẽ thẳng đáp án nếu quá lộ).
Nếu từ trừu tượng / khó diễn tả bằng emoji thì để "emoji" là chuỗi rỗng "".`;

const SYSTEM = `Bạn soạn từ bí mật cho trò chơi đoán từ theo nghĩa trên livestream TikTok tiếng Việt.
Người xem bình luận từ đoán, hệ thống chấm độ gần nghĩa, ai đoán trúng thì thắng.

Yêu cầu cho mỗi từ:
- Danh từ hoặc khái niệm tiếng Việt quen thuộc với đa số người Việt (đồ vật, con vật, món ăn, nghề nghiệp, địa điểm, thiên nhiên, cảm xúc, hoạt động, lễ hội…), có nhiều từ liên quan để người chơi đoán dần.
- Viết đúng chính tả, có dấu, chữ thường, 1 đến 3 tiếng, không dấu câu, không số.
- Không dùng tên riêng (người, thương hiệu, địa danh cụ thể), không chính trị, không tôn giáo gây tranh cãi, không tục tĩu, không chủ đề nhạy cảm.
- Đa dạng chủ đề; không trùng nhau và không trùng danh sách đã có.
"hint" là chủ đề ngắn 1-4 tiếng (ví dụ "Động vật", "Món ăn", "Đồ dùng học tập"), không được chứa chính từ bí mật.
${HINT_RULES}`;

/** Mức độ khó khi sinh từ (config wordgame.difficulty: "easy" | "medium" | "hard"). */
export const DIFFICULTY = {
  easy: 'Độ khó: DỄ. Từ rất phổ biến, cụ thể, ai cũng nghĩ tới ngay (con mèo, quả chuối, xe đạp). Chủ đề gợi ý rõ ràng.',
  medium: 'Độ khó: VỪA. Từ quen thuộc nhưng không phải từ đầu tiên người ta nghĩ tới; đoán được trong vài phút.',
  hard: [
    'Độ khó: KHÓ. Người chơi cần nhiều lượt đoán và gợi ý mới ra.',
    '- Tránh các từ quá phổ biến, cụ thể, dễ nghĩ ra ngay (con chó, quả táo, xe máy, mặt trời, điện thoại…).',
    '- Ưu tiên: từ ghép 2-3 tiếng ít gặp hơn nhưng ai cũng hiểu (ống nhòm, đồng hồ cát, la bàn, bù nhìn, chong chóng, tò he, kính vạn hoa, bàn tính), khái niệm trừu tượng (lòng tự trọng, sự im lặng, ký ức, định mệnh), hiện tượng (nhật thực, ảo ảnh, hải đăng, cực quang), nghề / hoạt động đặc thù (thợ lặn, thủ thư, ảo thuật gia), đồ vật xưa (đèn dầu, cối xay, guốc mộc).',
    '- Vẫn phải là từ người Việt bình thường biết nghĩa; không dùng thuật ngữ chuyên ngành hiểm hóc, không từ Hán Việt cổ ít người hiểu.',
    '- "hint" nên là chủ đề RỘNG, chung chung (ví dụ "Đồ vật", "Khái niệm", "Thiên nhiên", "Đời sống") để không lộ quá nhiều.',
  ].join('\n'),
};

const SCHEMA = {
  type: 'object',
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: { word: { type: 'string' }, hint: { type: 'string' }, desc: { type: 'array', items: { type: 'string' } }, emoji: { type: 'string' } },
        required: ['word', 'hint', 'desc', 'emoji'],
        additionalProperties: false,
      },
    },
  },
  required: ['words'],
  additionalProperties: false,
};

const HINTS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { word: { type: 'string' }, desc: { type: 'array', items: { type: 'string' } }, emoji: { type: 'string' } },
        required: ['word', 'desc', 'emoji'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const CLASSIFIERS = new Set(['con', 'cái', 'quả', 'trái', 'chiếc', 'cây']);
const plain = (t) => canon(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

/** 2 câu mô tả: bỏ câu lộ bất kỳ tiếng nào của đáp án, cắt dài. */
export function cleanDesc(word, desc = []) {
  const syl = canon(word).split(' ').filter((x) => !CLASSIFIERS.has(x)).map(plain);
  const out = [];
  for (let d of Array.isArray(desc) ? desc : []) {
    d = String(d || '').replace(/\s+/g, ' ').replace(/[.。]+$/, '').trim();
    if (!d) continue;
    if (d.length > 72) d = d.slice(0, 71).trimEnd() + '…';
    const words = new Set(plain(d).replace(/[^a-z0-9 ]/g, ' ').split(' '));
    if (syl.some((x) => words.has(x))) continue;
    if (!out.includes(d)) out.push(d);
  }
  return out.slice(0, 2);
}

/** Đúng 3 emoji, không thì rỗng (từ khó diễn tả bằng emoji). */
export function cleanEmoji(s) {
  const seg = typeof Intl?.Segmenter === 'function' ? [...new Intl.Segmenter('vi', { granularity: 'grapheme' }).segment(String(s || ''))].map((x) => x.segment) : [...String(s || '')];
  const em = seg.filter((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g));
  return em.length >= 3 ? em.slice(0, 3).join(' ') : '';
}

/** Từ hợp lệ: chỉ chữ cái + khoảng trắng, 1-3 tiếng, ≤ 20 ký tự. */
export function validWord(w) {
  const t = canon(w);
  if (!t || t.length > 20) return false;
  if (!/^[\p{L} ]+$/u.test(t)) return false;
  return t.split(' ').length <= 3;
}

/**
 * Kho từ bí mật: các lô từ do Claude sinh, lưu ở data/wordbank.json.
 * next() lấy một từ chưa dùng; hết thì dùng danh sách dự phòng (config.json).
 */
export class WordBank {
  constructor({ filePath = null, fallbackWords = [], client = null, model = 'claude-opus-5-5', batchSize = 100, minRemaining = 10, autoGenerate = true, difficulty = 'hard', random = Math.random, log = console } = {}) {
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'hard';
    this.filePath = filePath;
    this.fallback = fallbackWords.filter((w) => w?.word);
    this.client = client;
    this.model = model;
    this.batchSize = batchSize;
    this.minRemaining = minRemaining;
    this.autoGenerate = autoGenerate;
    this.random = random;
    this.log = log;
    this.data = { batches: [], used: [], extra: {} }; // extra: gợi ý bổ sung cho từ cũ / từ có sẵn { từ: { desc, emoji } }
    this.generating = null;
    this.lastError = null;
    this.load();
  }

  load() {
    if (!this.filePath) return;
    try { this.data = { batches: [], used: [], extra: {}, ...JSON.parse(fs.readFileSync(this.filePath, 'utf8')) }; } catch { /* chưa có */ }
  }

  save() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.filePath);
  }

  allWords() { return this.data.batches.flatMap((b) => b.words); }

  unused() {
    const used = new Set(this.data.used);
    return this.allWords().filter((w) => !used.has(canon(w.word)));
  }

  stats() {
    return {
      batches: this.data.batches.length,
      total: this.allWords().length,
      remaining: this.unused().length,
      fallback: this.fallback.length,
      generating: !!this.generating,
      canGenerate: !!this.client,
      difficulty: this.difficulty,
      missingHints: this.missingHints().length,
      model: this.model,
      lastError: this.lastError,
    };
  }

  /** Gợi ý mô tả + emoji của một từ (trong lô, hoặc bổ sung sau). */
  hintsFor(w) {
    const x = this.data.extra?.[canon(w.word)] || {};
    const desc = w.desc?.length ? w.desc : x.desc || [];
    const emoji = w.desc?.length ? w.emoji || '' : x.emoji || w.emoji || '';
    return { desc, emoji };
  }

  /** Các từ (kho + có sẵn) chưa có gợi ý mô tả. */
  missingHints() {
    const all = [...this.allWords(), ...this.fallback];
    const seen = new Set();
    return all.filter((w) => {
      const k = canon(w.word);
      if (seen.has(k)) return false;
      seen.add(k);
      return !this.hintsFor(w).desc.length;
    });
  }

  /** Nhờ Claude soạn 2 câu mô tả + 3 emoji cho các từ cũ chưa có (mỗi lần tối đa `limit` từ). */
  async backfillHints({ limit = 60 } = {}) {
    if (!this.client) throw new Error('Chưa có ANTHROPIC_API_KEY');
    const todo = this.missingHints().slice(0, Math.max(1, Math.min(150, limit | 0)));
    if (!todo.length) return { added: 0, remaining: 0 };
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema: HINTS_SCHEMA } },
      system: `Bạn soạn gợi ý cho trò chơi đoán từ trên livestream TikTok tiếng Việt.\n${HINT_RULES}`,
      messages: [{ role: 'user', content: `Soạn "desc" và "emoji" cho từng từ bí mật sau (giữ nguyên "word"):\n${todo.map((w) => `- ${w.word}${w.hint ? ` (chủ đề: ${w.hint})` : ''}`).join('\n')}` }],
    });
    if (response.stop_reason === 'refusal') throw new Error('Claude từ chối yêu cầu');
    const data = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    const want = new Set(todo.map((w) => canon(w.word)));
    let added = 0;
    for (const it of data.items || []) {
      const k = canon(it.word);
      if (!want.has(k)) continue;
      const desc = cleanDesc(k, it.desc);
      if (!desc.length) continue;
      this.data.extra[k] = { desc, emoji: cleanEmoji(it.emoji) };
      added++;
    }
    this.save();
    this.log.log?.(`[wordbank] Bổ sung gợi ý cho ${added} từ`);
    return { added, remaining: this.missingHints().length };
  }

  /** Lấy một từ cho vòng mới. avoid: các từ vừa chơi (khi dùng danh sách dự phòng). */
  next(avoid = []) {
    const pool = this.unused();
    if (pool.length <= this.minRemaining && this.client && this.autoGenerate && !this.generating) {
      this.generate().catch(() => {}); // tạo nền, không chặn vòng chơi
    }
    if (pool.length) {
      const w = pool[Math.floor(this.random() * pool.length)];
      this.data.used.push(canon(w.word));
      this.save();
      return { word: w.word, hint: w.hint, ...this.hintsFor(w), source: 'bank' };
    }
    const fresh = this.fallback.filter((w) => !avoid.includes(canon(w.word)));
    const list = fresh.length ? fresh : this.fallback;
    if (!list.length) return { word: 'mặt trời', hint: 'Thiên nhiên', source: 'default' };
    const w = list[Math.floor(this.random() * list.length)];
    return { word: w.word, hint: w.hint, ...this.hintsFor(w), source: 'config' };
  }

  /** Sinh một lô từ mới bằng Claude. theme: chủ đề cho cả lô (tuỳ chọn). */
  generate({ theme = '', count = this.batchSize } = {}) {
    if (!this.client) return Promise.reject(new Error('Chưa có ANTHROPIC_API_KEY'));
    if (this.generating) return this.generating;
    this.generating = this.#generate(String(theme || '').slice(0, 80), Math.max(10, Math.min(200, count | 0)))
      .finally(() => { this.generating = null; });
    return this.generating;
  }

  async #generate(theme, count) {
    const existing = new Set([...this.allWords().map((w) => canon(w.word)), ...this.fallback.map((w) => canon(w.word)), ...this.data.used]);
    const avoidList = [...existing].slice(-600);
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            `Soạn ${count} từ bí mật mới.`,
            DIFFICULTY[this.difficulty],
            theme ? `Chủ đề chung của cả lô: ${theme}.` : 'Trộn nhiều chủ đề khác nhau.',
            avoidList.length ? `Không dùng các từ đã có: ${avoidList.join(', ')}.` : '',
          ].filter(Boolean).join('\n'),
        }],
      });
      if (response.stop_reason === 'refusal') throw new Error('Claude từ chối yêu cầu');
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const data = JSON.parse(text);
      const words = [];
      for (const it of data.words || []) {
        const w = canon(it.word);
        const hint = String(it.hint || '').trim().slice(0, 40);
        if (!validWord(w) || existing.has(w) || !hint || canon(hint).includes(w)) continue;
        existing.add(w);
        const desc = cleanDesc(w, it.desc);
        words.push({ word: w, hint, ...(desc.length ? { desc } : {}), emoji: cleanEmoji(it.emoji) });
      }
      if (!words.length) throw new Error('Không nhận được từ hợp lệ nào');
      const batch = { id: Date.now(), createdAt: new Date().toISOString(), theme, difficulty: this.difficulty, model: this.model, words };
      this.data.batches.push(batch);
      this.save();
      this.lastError = null;
      this.log.log?.(`[wordbank] Đã tạo lô ${words.length} từ${theme ? ` (chủ đề: ${theme})` : ''}`);
      return { added: words.length, batch };
    } catch (e) {
      this.lastError = `${e?.status || ''} ${e?.message || e}`.trim();
      this.log.warn?.(`[wordbank] Tạo từ lỗi: ${this.lastError}`);
      throw e;
    }
  }
}

/** Tạo client Claude nếu có thông tin đăng nhập trong môi trường. */
export function claudeClientFromEnv() {
  const has = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE;
  return has ? new Anthropic() : null;
}

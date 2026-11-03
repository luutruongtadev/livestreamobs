import { compact } from './scorer.js';

const SYSTEM = `Bạn soạn nội dung cho trò chơi đoán từ trên livestream TikTok tiếng Việt.
Mỗi vòng có một TỪ BÍ MẬT; người xem đoán dần, các GỢI Ý được mở lần lượt từ khó đến dễ.

Quy tắc gợi ý (mỗi từ đúng 5 gợi ý, tiếng Việt):
- Gợi ý 1 khó nhất (chung chung: nhóm, vùng, thời kỳ, lĩnh vực…), gợi ý 5 dễ nhất (đặc điểm nổi tiếng nhất).
- Đa dạng: lịch sử / cốt truyện, ngoại hình, đặc điểm, khả năng / thành tích, quan hệ với nhân vật khác.
- Mỗi gợi ý ngắn gọn, tối đa 40 ký tự, không có dấu chấm cuối câu.
- TUYỆT ĐỐI không chứa từ bí mật, biệt danh của nó, hay một phần tên của nó.
- Đúng sự thật; không bịa. Không nội dung thô tục, chính trị, xúc phạm.
"aliases": các cách gọi tắt / biệt danh người Việt hay dùng khi gõ (có thể rỗng), không lặp lại từ bí mật.`;

const HINTS_SCHEMA = { type: 'array', items: { type: 'string' } };
const WORD_SCHEMA = {
  type: 'object',
  properties: { word: { type: 'string' }, aliases: { type: 'array', items: { type: 'string' } }, hints: HINTS_SCHEMA },
  required: ['word', 'aliases', 'hints'],
  additionalProperties: false,
};
const SET_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    secretLabel: { type: 'string' },
    scoreContext: { type: 'string' },
    words: { type: 'array', items: WORD_SCHEMA },
  },
  required: ['title', 'secretLabel', 'scoreContext', 'words'],
  additionalProperties: false,
};
const HINTS_ONLY_SCHEMA = {
  type: 'object',
  properties: { aliases: { type: 'array', items: { type: 'string' } }, hints: HINTS_SCHEMA },
  required: ['aliases', 'hints'],
  additionalProperties: false,
};

/** Làm sạch gợi ý: bỏ gợi ý lộ đáp án / biệt danh, cắt dài, tối đa 5. */
export function cleanHints(word, aliases = [], hints = []) {
  const banned = [word, ...aliases].map(compact).filter((x) => x.length >= 2);
  const out = [];
  for (let h of hints) {
    h = String(h || '').replace(/\s+/g, ' ').replace(/[.。]+$/, '').trim();
    if (!h) continue;
    if (h.length > 48) h = h.slice(0, 47).trimEnd() + '…';
    const ch = compact(h);
    if (banned.some((b) => ch.includes(b))) continue;
    if (!out.includes(h)) out.push(h);
  }
  return out.slice(0, 5);
}

export function cleanAliases(word, aliases = []) {
  const w = compact(word);
  return [...new Set(aliases.map((a) => String(a || '').trim().toLowerCase()).filter((a) => a && a.length <= 20 && compact(a) && compact(a) !== w))].slice(0, 6);
}

/** Từ bí mật hợp lệ: có chữ cái, ≤ 4 cụm, ≤ 24 ký tự (cho phép dấu nháy, số La Mã…). */
export function validSecretName(word) {
  const t = String(word || '').trim();
  return t.length > 0 && t.length <= 24 && /\p{L}/u.test(t) && t.split(/\s+/).length <= 4;
}

/** Sinh bộ từ / gợi ý bằng Claude. client: Anthropic SDK client. */
export class SetGenerator {
  constructor({ client, model = 'claude-opus-5-5', log = console } = {}) {
    this.client = client;
    this.model = model;
    this.log = log;
  }

  async call(userText, schema) {
    if (!this.client) throw new Error('Chưa có ANTHROPIC_API_KEY');
    // stream + finalMessage: bộ 100 từ × 5 gợi ý là đầu ra dài, tránh hết thời gian chờ
    const msg = await this.client.beta.messages.stream({
      model: this.model,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema } },
      system: SYSTEM,
      messages: [{ role: 'user', content: userText }],
    }).finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('Claude từ chối yêu cầu');
    if (msg.stop_reason === 'max_tokens') throw new Error('Kết quả quá dài, thử giảm số từ');
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return JSON.parse(text);
  }

  /** Tạo cả bộ từ theo chủ đề. */
  async generateSet({ topic, count = 50 }) {
    topic = String(topic || '').trim().slice(0, 120);
    if (!topic) throw new Error('Thiếu chủ đề');
    count = Math.max(5, Math.min(100, count | 0 || 50));
    const data = await this.call([
      `Chủ đề của bộ: ${topic}`,
      `Soạn ${count} từ bí mật thuộc chủ đề này, quen thuộc với người xem Việt Nam, không trùng nhau.`,
      'Tên riêng giữ đúng cách viết phổ biến ở Việt Nam (vd tên tiếng Anh giữ nguyên). Mỗi từ tối đa 4 chữ / 24 ký tự.',
      '"title": tên trò chơi ngắn, vd "Đoán cầu thủ". "secretLabel": nhãn in hoa ngắn, vd "CẦU THỦ BÍ MẬT".',
      '"scoreContext": 2-3 câu hướng dẫn giám khảo chấm độ liên quan của từ đoán với từ bí mật trong chủ đề này (cái gì liên quan chặt thì điểm cao).',
    ].join('\n'), SET_SCHEMA);
    const seen = new Set();
    const words = [];
    for (const w of data.words || []) {
      const word = String(w.word || '').trim();
      if (!validSecretName(word) || seen.has(compact(word))) continue;
      const aliases = cleanAliases(word, w.aliases);
      const hints = cleanHints(word, aliases, w.hints);
      if (hints.length < 3) continue;
      seen.add(compact(word));
      words.push({ word, aliases, hints });
    }
    if (words.length < 2) throw new Error('Không nhận được đủ từ hợp lệ');
    return {
      title: String(data.title || topic).slice(0, 40),
      secretLabel: String(data.secretLabel || 'TỪ BÍ MẬT').toUpperCase().slice(0, 30),
      scoreContext: String(data.scoreContext || '').slice(0, 600),
      topic,
      generated: { model: this.model, at: new Date().toISOString() },
      words,
    };
  }

  /** Viết lại 5 gợi ý (và biệt danh) cho một từ trong bộ. note: yêu cầu thêm của người dùng. */
  async regenerateHints({ set, word, note = '' }) {
    const entry = set.words.find((w) => compact(w.word) === compact(word));
    if (!entry) throw new Error(`Không có "${word}" trong bộ ${set.title || ''}`);
    const data = await this.call([
      `Bộ từ: ${set.title || ''}${set.topic ? ` (chủ đề: ${set.topic})` : ''}`,
      set.scoreContext ? `Ngữ cảnh: ${set.scoreContext}` : '',
      `Từ bí mật: ${entry.word}`,
      entry.hints?.length ? `Gợi ý hiện tại (viết lại cho hay hơn, khác đi): ${entry.hints.join(' | ')}` : '',
      note ? `Yêu cầu thêm: ${String(note).slice(0, 200)}` : '',
      'Viết 5 gợi ý mới theo đúng quy tắc, kèm danh sách biệt danh.',
    ].filter(Boolean).join('\n'), HINTS_ONLY_SCHEMA);
    const aliases = cleanAliases(entry.word, [...(entry.aliases || []), ...(data.aliases || [])]);
    const hints = cleanHints(entry.word, aliases, data.hints);
    if (hints.length < 3) throw new Error('Gợi ý mới không hợp lệ (bị lộ đáp án hoặc quá ít)');
    return { word: entry.word, aliases, hints };
  }
}

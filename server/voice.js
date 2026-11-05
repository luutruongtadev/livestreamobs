import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export const VOICE_DEFAULTS = {
  enabled: true,
  voiceId: 'pNInz6obpgDQGcFmaJgB', // giọng "Adam" của ElevenLabs
  modelId: 'eleven_flash_v2_5', // nhanh, đọc được tiếng Việt
  languageCode: 'vi',
  claudeModel: 'claude-opus-5-5', // viết câu chọc cười
  giftWindowSec: 4, // gom quà liên tiếp của cùng một người trong N giây thành 1 câu
  maxQueue: 4, // tối đa câu chờ đọc; đầy thì bỏ câu cảm ơn quà nhỏ nhất
  maxPerHour: 150, // giới hạn số câu / giờ (kiểm soát chi phí ElevenLabs)
  keepFiles: 40, // giữ N file mp3 gần nhất
  stability: 0.35,
  similarity: 0.8,
  style: 0.55,
};

const SYSTEM = `Bạn là MC nam dẫn game đoán chữ trên TikTok Live: vui tính, lầy lội, hay trêu chọc người chơi kiểu bạn bè thân.
Mỗi lần nhận một sự kiện (có người đoán trúng hoặc tặng quà), viết MỘT câu nói tiếng Việt để đọc thành giọng nói.
Quy tắc:
- Tối đa 30 chữ, nói tự nhiên như đang live, gọi đúng tên người chơi.
- Trêu đùa nhẹ nhàng, hài hước, có chút "troll" nhưng thân thiện; luôn kết bằng ý chúc mừng hoặc cảm ơn.
- Đoán trúng: trúng cực nhanh / không cần gợi ý thì tung hô quá lố; trúng sau nhiều gợi ý hoặc phút chót thì trêu là "nhờ gợi ý", "suýt toang".
- Tặng quà: quà to thì làm quá lên, cảm ơn rối rít; quà nhỏ (hoa hồng) thì trêu khéo nhưng vẫn cảm ơn thật lòng.
- Tuyệt đối không xúc phạm ngoại hình, giới tính, vùng miền, tôn giáo, không chửi thề, không nội dung người lớn, không chính trị.
- Không emoji, không ký hiệu, không hashtag, không ngoặc kép. Không lặp lại câu đã nói gần đây.`;

const SCHEMA = {
  type: 'object',
  properties: { line: { type: 'string' } },
  required: ['line'],
  additionalProperties: false,
};

const TEMPLATES = {
  win: [
    '{name} đoán trúng rồi! Não to thế này chắc ăn nhiều óc chó lắm đây, chúc mừng nha!',
    'Ối giời ơi {name} trúng phóc! Cả phòng live đứng hình, chúc mừng {name}!',
    'Chúc mừng {name}! Đoán hay thế này chắc nhìn trộm đáp án rồi, đùa thôi, giỏi lắm!',
  ],
  gift: [
    'Cảm ơn {name} đã tặng {gift}! Giàu thế này cho mình xin làm người yêu với!',
    '{name} vừa tặng {gift}, cả phòng live xin cúi đầu cảm ơn đại gia!',
    'Ui cảm ơn {name} nha, {gift} này mình xin ghi vào sổ ân tình suốt đời!',
  ],
};

/** Tên đọc được: bỏ emoji / ký hiệu, tối đa 24 ký tự. */
export const speakableName = (n) => String(n || '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 24) || 'bạn';
const clean = (s) => String(s || '').replace(/[\p{Extended_Pictographic}#*"“”]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 220);

/**
 * Giọng MC đọc câu chúc mừng / cảm ơn bằng ElevenLabs (giọng Adam); câu nói do Claude viết theo kiểu trêu đùa.
 * Phát sự kiện 'voice' { id, url, text, kind, by } khi có file mp3 sẵn sàng.
 */
export class Voice extends EventEmitter {
  constructor(config = {}, { apiKey = null, claude = null, dir, fetchImpl = globalThis.fetch, now = () => Date.now(), random = Math.random, log = console } = {}) {
    super();
    this.cfg = { ...VOICE_DEFAULTS, ...config };
    this.apiKey = apiKey;
    this.claude = claude;
    this.dir = dir;
    this.fetch = fetchImpl;
    this.now = now;
    this.random = random;
    this.log = log;
    this.queue = [];
    this.pendingGifts = new Map(); // id người tặng -> { job, timer }
    this.busy = false;
    this.recent = []; // câu đã nói gần đây (để Claude tránh lặp)
    this.hour = { start: now(), count: 0 };
    this.lastError = null;
    this.spoken = 0;
    this.seq = 0;
  }

  get enabled() { return !!(this.cfg.enabled && this.apiKey); }

  status() {
    return { enabled: this.enabled, hasKey: !!this.apiKey, writer: this.claude ? 'claude' : 'mẫu có sẵn', voiceId: this.cfg.voiceId, model: this.cfg.modelId, queue: this.queue.length, spoken: this.spoken, thisHour: this.hour.count, maxPerHour: this.cfg.maxPerHour, lastError: this.lastError };
  }

  /** Có người đoán trúng. e = hiệu ứng wg_win. */
  win(e) {
    if (!this.enabled || !e?.by) return;
    this.enqueue({ kind: 'win', priority: 3, by: e.by, ctx: { tu_dap_an: e.answer || e.secret, so_giay: e.seconds, so_goi_y_da_mo: e.hintLevel, muc: e.tier, con_lai_giay: e.left } });
  }

  /** Có người tặng quà. e = hiệu ứng wg_thanks. Gom quà liên tiếp của cùng người. */
  gift(e) {
    if (!this.enabled || !e?.by?.id) return;
    const p = this.pendingGifts.get(e.by.id);
    if (p) {
      p.job.ctx.so_xu += e.diamonds || 0;
      p.job.ctx.so_mon += e.repeat || 1;
      if (!p.job.ctx.qua.includes(e.giftName)) p.job.ctx.qua += `, ${e.giftName}`;
      return;
    }
    const job = { kind: 'gift', priority: 1, by: e.by, ctx: { qua: e.giftName || 'quà', so_mon: e.repeat || 1, so_xu: e.diamonds || 0 } };
    const timer = setTimeout(() => {
      this.pendingGifts.delete(e.by.id);
      job.priority = job.ctx.so_xu >= 99 ? 2.5 : job.ctx.so_xu >= 30 ? 2 : 1;
      this.enqueue(job);
    }, this.cfg.giftWindowSec * 1000);
    this.pendingGifts.set(e.by.id, { job, timer });
  }

  enqueue(job) {
    if (this.queue.length >= this.cfg.maxQueue) {
      // đầy: bỏ câu ít quan trọng nhất (nếu câu mới quan trọng hơn)
      const low = this.queue.reduce((a, b) => (b.priority < a.priority ? b : a));
      if (low.priority >= job.priority) return;
      this.queue.splice(this.queue.indexOf(low), 1);
    }
    this.queue.push(job);
    this.queue.sort((a, b) => b.priority - a.priority);
    this.pump();
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        const t = this.now();
        if (t - this.hour.start >= 3600e3) this.hour = { start: t, count: 0 };
        if (this.hour.count >= this.cfg.maxPerHour) { this.lastError = `Đã đủ ${this.cfg.maxPerHour} câu trong giờ này`; continue; }
        try {
          const text = await this.writeLine(job);
          const file = await this.tts(text);
          this.hour.count++;
          this.spoken++;
          this.recent.push(text); this.recent = this.recent.slice(-6);
          this.lastError = null;
          this.emit('voice', { id: file.id, url: file.url, text, kind: job.kind, by: { id: job.by.id, name: job.by.name } });
        } catch (e) {
          this.lastError = `${e?.status || ''} ${e?.message || e}`.trim();
          this.log.warn?.(`[voice] lỗi: ${this.lastError}`);
        }
      }
    } finally { this.busy = false; }
  }

  template(job) {
    const list = TEMPLATES[job.kind] || TEMPLATES.win;
    return list[Math.floor(this.random() * list.length)].replaceAll('{name}', speakableName(job.by.name)).replaceAll('{gift}', job.ctx.qua || 'quà');
  }

  /** Câu nói: Claude viết (trêu đùa theo ngữ cảnh), lỗi / không có Claude thì dùng câu mẫu. */
  async writeLine(job) {
    if (!this.claude) return this.template(job);
    try {
      const response = await this.claude.beta.messages.create({
        model: this.cfg.claudeModel,
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: JSON.stringify({
            su_kien: job.kind === 'win' ? 'doan_trung' : 'tang_qua',
            ten_nguoi_choi: speakableName(job.by.name),
            ...job.ctx,
            cau_da_noi_gan_day: this.recent,
          }),
        }],
      });
      if (response.stop_reason === 'refusal') throw new Error('refusal');
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const line = clean(JSON.parse(text).line);
      if (!line) throw new Error('câu trống');
      return line;
    } catch (e) {
      this.log.warn?.(`[voice] Claude viết câu lỗi (${e?.message || e}) — dùng câu mẫu`);
      return this.template(job);
    }
  }

  /** ElevenLabs: chữ → mp3, lưu vào dir, trả về { id, url }. */
  async tts(text) {
    const res = await this.fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.cfg.voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: this.cfg.modelId,
        ...(this.cfg.languageCode ? { language_code: this.cfg.languageCode } : {}),
        voice_settings: { stability: this.cfg.stability, similarity_boost: this.cfg.similarity, style: this.cfg.style, use_speaker_boost: true },
      }),
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.text()).slice(0, 200); } catch { /* bỏ qua */ }
      const err = new Error(`ElevenLabs ${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const id = `${this.now().toString(36)}-${(this.seq++).toString(36)}`;
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(path.join(this.dir, `${id}.mp3`), buf);
    this.prune();
    return { id, url: `/voice/${id}.mp3` };
  }

  prune() {
    try {
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.mp3')).map((f) => ({ f, t: fs.statSync(path.join(this.dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      for (const { f } of files.slice(this.cfg.keepFiles)) fs.rmSync(path.join(this.dir, f), { force: true });
    } catch { /* bỏ qua */ }
  }
}

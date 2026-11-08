import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { canon } from './scorer.js';

/**
 * Game "Phòng thí nghiệm" (/ghep): người xem bình luận "A + B" (chữ hoặc emoji) → ghép thành sinh vật / đồ vật mới.
 * - Bình luận: Claude (Haiku) soạn tên, mô tả troll, chỉ số và "công thức" ghép 2 emoji; màn hình tự vẽ bằng font emoji (giấy phép mở).
 * - Tặng quà ≥ minGiftDiamonds: Claude dựng mô hình 3D từ các khối cơ bản, gửi TỪNG KHỐI về màn hình ngay khi viết xong (lắp trực tiếp).
 * Combo / mô hình đã tạo được lưu lại (data/ghep.json) → gặp lại không tốn token.
 */
export const GHEP_DEFAULTS = {
  minGiftDiamonds: 10, // quà từ mức này trở lên → vẽ 3D
  comboWindowMs: 120_000, // quà áp cho combo người đó bình luận trong 2 phút gần nhất
  cooldownMs: 3000, // mỗi người 1 combo / 3 giây
  maxNewPerMinute: 30, // tối đa combo MỚI nhờ Claude soạn mỗi phút (quá thì ghép kiểu đơn giản, không tốn token)
  maxQueue: 15, // hàng chờ trình diễn trên màn hình
  model: 'claude-haiku-5-5', // soạn combo (ngắn, rẻ, nhanh)
  model3d: 'claude-sonnet-5-5', // dựng mô hình 3D (cần sáng tạo hơn)
  gallerySize: 12,
};

export const MODES = ['inside', 'tint', 'hat', 'eyes', 'hold', 'ride', 'half'];
const SHAPES = ['sphere', 'box', 'cylinder', 'cone', 'torus'];

// vài từ hay gặp → emoji, để màn hình hiện ngay lúc đang trộn (Claude trả emoji chính xác sau)
const WORD_EMOJI = {
  'mèo': '🐱', 'con mèo': '🐱', 'chó': '🐶', 'con chó': '🐶', 'gà': '🐔', 'con gà': '🐔', 'vịt': '🦆', 'heo': '🐷', 'lợn': '🐷', 'bò': '🐮', 'trâu': '🐃',
  'cá': '🐟', 'cá mập': '🦈', 'khủng long': '🦖', 'rồng': '🐉', 'khỉ': '🐵', 'hổ': '🐯', 'sư tử': '🦁', 'gấu': '🐻', 'gấu trúc': '🐼', 'thỏ': '🐰',
  'chuột': '🐭', 'rắn': '🐍', 'ếch': '🐸', 'ong': '🐝', 'bướm': '🦋', 'cua': '🦀', 'tôm': '🦐', 'bạch tuộc': '🐙', 'kỳ lân': '🦄', 'voi': '🐘',
  'tên lửa': '🚀', 'máy bay': '✈️', 'ô tô': '🚗', 'xe máy': '🏍️', 'xe đạp': '🚲', 'tàu': '🚢', 'ufo': '🛸', 'robot': '🤖', 'rô bốt': '🤖',
  'mặt trời': '☀️', 'mặt trăng': '🌙', 'sao': '⭐', 'ngôi sao': '⭐', 'lửa': '🔥', 'nước': '💧', 'sét': '⚡', 'mưa': '🌧️', 'tuyết': '❄️', 'cầu vồng': '🌈',
  'cây': '🌳', 'hoa': '🌸', 'hoa hồng': '🌹', 'nấm': '🍄', 'xương rồng': '🌵', 'táo': '🍎', 'chuối': '🍌', 'dưa hấu': '🍉', 'dứa': '🍍', 'bơ': '🥑',
  'pizza': '🍕', 'bánh mì': '🥖', 'phở': '🍜', 'kem': '🍦', 'bánh': '🍰', 'trà sữa': '🧋', 'cà phê': '☕', 'bia': '🍺', 'kẹo': '🍬', 'trứng': '🥚',
  'ma': '👻', 'quỷ': '😈', 'thiên thần': '😇', 'người ngoài hành tinh': '👽', 'đầu lâu': '💀', 'hề': '🤡', 'vua': '🤴', 'công chúa': '👸', 'ninja': '🥷',
  'tim': '❤️', 'trái tim': '❤️', 'tiền': '💰', 'vàng': '🥇', 'kim cương': '💎', 'bom': '💣', 'súng nước': '🔫', 'kiếm': '🗡️', 'khiên': '🛡️',
  'điện thoại': '📱', 'máy tính': '💻', 'tivi': '📺', 'đồng hồ': '⏰', 'bóng đá': '⚽', 'bóng rổ': '🏀', 'guitar': '🎸', 'đàn': '🎸', 'mic': '🎤',
  'nhà': '🏠', 'lâu đài': '🏰', 'núi': '⛰️', 'núi lửa': '🌋', 'biển': '🌊', 'đảo': '🏝️', 'trái đất': '🌍', 'bánh xe': '🛞', 'ô': '☂️', 'mũ': '🎩',
};

const EMOJI_RE = /\p{Extended_Pictographic}(?:\u{FE0F}|\u{200D}\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/u;

/** Lấy cặp "A + B" từ bình luận; không đúng dạng thì null. */
export function parseCombo(text) {
  const t = String(text ?? '').normalize('NFC').trim();
  const parts = t.split(/\s*[+＋]\s*/);
  if (parts.length !== 2) return null;
  const clean = (p) => p.replace(/[.,!?;:"'“”‘’()[\]{}<>~`@#$%^&*_=|\\/]+/g, ' ').replace(/\s+/g, ' ').trim();
  const [a, b] = parts.map(clean);
  if (!a || !b) return null;
  for (const p of [a, b]) {
    if (p.length > 24 || p.split(' ').length > 4) return null;
    if (!/\p{L}|\p{Extended_Pictographic}/u.test(p)) return null;
    if (/https?|www/i.test(p)) return null;
  }
  return [a, b];
}

/** Emoji đại diện cho 1 vế: có emoji thì lấy luôn, không thì tra từ điển nhỏ. */
export function guessEmoji(part) {
  const m = String(part).match(EMOJI_RE);
  if (m) return m[0];
  return WORD_EMOJI[canon(part)] || WORD_EMOJI[canon(part).replace(/^(con|cái|quả|trái|chiếc|cây) /, '')] || null;
}

/** Khoá combo không phụ thuộc thứ tự: "mèo + tên lửa" = "tên lửa + mèo". */
export const comboKey = (a, b) => [canon(a), canon(b)].sort().join(' + ');

const COMBO_SYSTEM = `Bạn là "nhà khoa học điên" của một phòng thí nghiệm trên TikTok Live tiếng Việt. Người xem gửi 2 thứ (chữ tiếng Việt / tiếng Anh hoặc emoji), bạn GHÉP chúng thành 1 sinh vật / đồ vật mới thật vui nhộn.
Trả về:
- "ea", "eb": đúng 1 emoji (Unicode chuẩn, phổ biến) đại diện cho vế A và vế B.
- "name": tên tiếng Việt 2–4 từ, hài hước, dễ nhớ (vd "mèo + tên lửa" → "Mèo Phản Lực").
- "desc": 1 câu troll tiếng Việt ≤ 70 ký tự, vui vẻ, không xúc phạm ai.
- "stats": đúng 3 chỉ số, mỗi cái {"label": "emoji + 1–2 từ", "value": 1–100}.
- "rarity": "thường" | "hiếm" | "huyền thoại" (combo càng bất ngờ, sáng tạo càng hiếm; đa số là thường).
- "mode": cách vẽ ghép 2 emoji:
  inside = hoa văn của emoji phụ phủ kín hình emoji chính · tint = nhuộm emoji chính theo màu emoji phụ · hat = emoji phụ đội trên đầu ·
  eyes = emoji phụ làm 2 con mắt · hold = emoji chính cầm emoji phụ · ride = emoji chính cưỡi lên emoji phụ · half = mỗi bên một nửa.
- "base": "a" hoặc "b" — emoji nào làm thân chính (thường là con vật / nhân vật).
- "tint": màu hex chủ đạo của emoji phụ (vd "#ef4444").
- "safe": false nếu yêu cầu tục tĩu, bạo lực máu me, chính trị, tôn giáo nhạy cảm, xúc phạm người thật — khi đó các trường khác điền tạm.`;

const COMBO_SCHEMA = {
  type: 'object',
  properties: {
    ea: { type: 'string' }, eb: { type: 'string' }, name: { type: 'string' }, desc: { type: 'string' },
    stats: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'integer' } }, required: ['label', 'value'], additionalProperties: false } },
    rarity: { type: 'string', enum: ['thường', 'hiếm', 'huyền thoại'] },
    mode: { type: 'string', enum: MODES },
    base: { type: 'string', enum: ['a', 'b'] },
    tint: { type: 'string' },
    safe: { type: 'boolean' },
  },
  required: ['ea', 'eb', 'name', 'desc', 'stats', 'rarity', 'mode', 'base', 'tint', 'safe'],
  additionalProperties: false,
};

const MODEL_SYSTEM = `Bạn dựng mô hình 3D kiểu đồ chơi hoạt hình (low-poly, dễ thương) cho một phòng thí nghiệm trên livestream, CHỈ từ các khối cơ bản.
Mỗi khối: {"label": tên tiếng Việt ngắn (vd "đầu mèo", "tai trái"), "shape": sphere|box|cylinder|cone|torus, "size": kích thước, "pos": [x,y,z], "rot": [độ quanh x,y,z], "color": "#rrggbb", "glow": true nếu là lửa / ánh sáng / phát sáng}.
size: sphere [bán kính] · box [rộng, cao, sâu] · cylinder [bán kính trên, bán kính dưới, cao] · cone [bán kính, cao] · torus [bán kính, độ dày ống].
Quy ước: trục y hướng lên, mặt trước quay về +z (mắt, mặt, chi tiết chính ở phía +z). Toàn bộ mô hình nằm trong khoảng y từ -3 tới 3.5, x và z từ -3 tới 3.
Dùng 16–28 khối. Xếp thứ tự lắp: thân lớn trước → đầu → tay chân / cánh → chi tiết nhỏ (mắt, mũi, hoa văn) → hiệu ứng (lửa, ánh sáng) sau cùng.
Màu tươi, rõ ràng. Mô hình phải nhìn ra được CẢ HAI thứ được ghép.`;

const MODEL_SCHEMA = {
  type: 'object',
  properties: {
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' }, shape: { type: 'string', enum: SHAPES },
          size: { type: 'array', items: { type: 'number' } }, pos: { type: 'array', items: { type: 'number' } },
          rot: { type: 'array', items: { type: 'number' } }, color: { type: 'string' }, glow: { type: 'boolean' },
        },
        required: ['label', 'shape', 'size', 'pos', 'rot', 'color', 'glow'],
        additionalProperties: false,
      },
    },
  },
  required: ['parts'],
  additionalProperties: false,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const hex = (c, d = '#a78bfa') => (/^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : d);

/** Làm sạch 1 khối 3D từ Claude (giới hạn kích thước / vị trí để không vỡ khung hình). */
export function cleanPart(p) {
  if (!p || !SHAPES.includes(p.shape)) return null;
  const size = (Array.isArray(p.size) ? p.size : []).slice(0, 3).map((v) => clamp(num(v, 0.5), 0.01, 3));
  if (!size.length) return null;
  const v3 = (a, lo, hi) => [0, 1, 2].map((i) => clamp(num(a?.[i]), lo, hi));
  return { label: String(p.label || '').slice(0, 30), shape: p.shape, size, pos: v3(p.pos, -4, 4), rot: v3(p.rot, -360, 360), color: hex(p.color), glow: !!p.glow };
}

/**
 * Tách các phần tử object hoàn chỉnh của mảng "parts" trong chuỗi JSON đang stream dở.
 * Trả về { items, next }: next = vị trí đã đọc tới (lần sau đọc tiếp).
 */
export function scanStreamObjects(buf, state = { start: -1, pos: 0 }) {
  const items = [];
  if (state.start < 0) {
    const m = buf.indexOf('"parts"');
    if (m < 0) return { items, state };
    const br = buf.indexOf('[', m);
    if (br < 0) return { items, state };
    state.start = br + 1; state.pos = br + 1;
  }
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = state.pos; i < buf.length; i++) {
    const ch = buf[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { items.push(JSON.parse(buf.slice(objStart, i + 1))); } catch { /* bỏ qua */ }
        state.pos = i + 1; objStart = -1;
      }
    } else if (ch === ']' && depth === 0) { state.done = true; state.pos = i + 1; break; }
  }
  return { items, state };
}

/** Combo ghép đơn giản (không có Claude / quá tải): vẫn vui, không tốn token. */
function simpleCombo(a, b, ea, eb) {
  const seed = [...comboKey(a, b)].reduce((s, c) => s + c.codePointAt(0), 0);
  const pick = (arr, k) => arr[(seed + k) % arr.length];
  const cap = (s) => s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return {
    ea: ea || '✨', eb: eb || '🧪', name: cap(`${a} ${b}`).slice(0, 30),
    desc: pick(['Thí nghiệm thành công… chắc vậy!', 'Phòng lab cũng không hiểu sao ra được cái này', 'Đẹp lạ, hiếm có khó tìm', 'Vừa ra lò, còn nóng hổi'], 1),
    stats: [{ label: '⚡ Sức mạnh', value: 30 + (seed % 70) }, { label: '🥰 Dễ thương', value: 20 + ((seed * 7) % 80) }, { label: '🤪 Độ lầy', value: 40 + ((seed * 13) % 60) }],
    rarity: 'thường', mode: pick(MODES, 3), base: 'a', tint: pick(['#f97316', '#22c55e', '#3b82f6', '#ec4899', '#eab308'], 5), source: 'simple',
  };
}

export class GhepGame extends EventEmitter {
  constructor(config = {}, { client = null, filePath = null, now = () => Date.now(), log = console } = {}) {
    super();
    this.cfg = { ...GHEP_DEFAULTS, ...config };
    this.client = client;
    this.filePath = filePath;
    this.now = now;
    this.log = log;
    this.combos = new Map(); // key -> combo
    this.models = new Map(); // key -> [parts] mô hình 3D đã dựng
    this.active = false; // đang là game chính trên live?
    this.jobSeq = 0;
    this.pending = new Map(); // key -> Promise combo (đang soạn)
    this.lastCombo = new Map(); // userId -> { key, at }
    this.pendingGift = new Map(); // userId -> { at, giftName, diamonds } (tặng quà khi chưa có combo)
    this.lastAt = new Map(); // userId -> lúc gửi combo gần nhất
    this.newTimes = []; // thời điểm tạo combo mới (giới hạn / phút)
    this.queue3d = [];
    this.busy3d = false;
    this.gallery = []; // combo vừa ghép gần đây (hiện ở dải dưới màn hình)
    this.dirty = false;
    this.load();
  }

  load() {
    if (!this.filePath) return;
    try {
      const d = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.combos = new Map(Object.entries(d.combos || {}));
      this.models = new Map(Object.entries(d.models || {}));
      this.active = !!d.active;
      this.gallery = Array.isArray(d.gallery) ? d.gallery.slice(0, this.cfg.gallerySize) : [];
    } catch { /* chưa có */ }
  }

  save() {
    if (!this.filePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const combos = [...this.combos.entries()].slice(-5000);
    const models = [...this.models.entries()].slice(-500);
    fs.writeFileSync(this.filePath, JSON.stringify({ active: this.active, combos: Object.fromEntries(combos), models: Object.fromEntries(models), gallery: this.gallery }));
    this.dirty = false;
  }

  setActive(on) { this.active = !!on; this.dirty = true; return this.active; }

  snapshot() {
    return { active: this.active, gallery: this.gallery, total: this.combos.size, minGiftDiamonds: this.cfg.minGiftDiamonds, queue3d: this.queue3d.length + (this.busy3d ? 1 : 0) };
  }

  fx(effects) { if (effects.length) this.emit('effects', effects); }

  /** Sự kiện từ TikTok (chỉ khi game này đang bật). Trả về hiệu ứng đồng bộ (phần bất đồng bộ phát qua 'effects'). */
  handle(ev) {
    const by = ev.user?.id ? { id: ev.user.id, name: ev.user.name, avatar: ev.user.avatar || null } : null;
    if (ev.type === 'comment' && by) return this.handleComment(by, ev.text);
    if (ev.type === 'gift' && by) return this.handleGift(by, ev);
    return [];
  }

  handleComment(by, text) {
    const pair = parseCombo(text);
    if (!pair) return [];
    const t = this.now();
    if (this.lastAt.has(by.id) && t - this.lastAt.get(by.id) < this.cfg.cooldownMs) return [];
    this.lastAt.set(by.id, t);
    const [a, b] = pair;
    const key = comboKey(a, b);
    const id = ++this.jobSeq;
    const known = this.combos.get(key);
    this.lastCombo.set(by.id, { key, at: t });
    const start = { type: 'ghep_job', id, a, b, ea: known?.ea || guessEmoji(a), eb: known?.eb || guessEmoji(b), by, known: !!known };
    if (known) {
      known.count = (known.count || 1) + 1;
      this.dirty = true;
      this.pushGallery(known, by);
      return [start, { type: 'ghep_done', id, combo: known, isNew: false }, ...this.afterCombo(by, key)];
    }
    this.create(key, a, b, id, by).catch((e) => this.log.warn?.('[ghep] lỗi:', e?.message || e));
    return [start];
  }

  /** Tặng quà sau khi có combo → vẽ 3D combo đó (nếu người đó vừa tặng quà trước khi bình luận). */
  afterCombo(by, key) {
    const g = this.pendingGift.get(by.id);
    if (!g || this.now() - g.at > this.cfg.comboWindowMs) return [];
    this.pendingGift.delete(by.id);
    return this.enqueue3d(key, by, g);
  }

  async create(key, a, b, id, by) {
    if (!this.pending.has(key)) {
      const t = this.now();
      this.newTimes = this.newTimes.filter((x) => t - x < 60_000);
      const useClaude = this.client && this.newTimes.length < this.cfg.maxNewPerMinute;
      if (useClaude) this.newTimes.push(t);
      const p = (useClaude ? this.claudeCombo(a, b, (name) => this.fx([{ type: 'ghep_typing', id, name }])) : Promise.resolve(null))
        .catch((e) => { this.log.warn?.('[ghep] Claude lỗi:', e?.message || e); return null; })
        .then((c) => {
          if (c && c.safe === false) return { refused: true };
          const combo = { ...(c || simpleCombo(a, b, guessEmoji(a), guessEmoji(b))), key, a, b, inventor: by, at: this.now(), count: 1 };
          delete combo.safe;
          this.combos.set(key, combo);
          this.dirty = true;
          return combo;
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, p);
    }
    const combo = await this.pending.get(key);
    if (combo.refused) { this.fx([{ type: 'ghep_fail', id, by }]); return; }
    const isNew = combo.inventor?.id === by.id && combo.count === 1;
    if (!isNew) { combo.count++; this.dirty = true; }
    this.pushGallery(combo, by);
    this.fx([{ type: 'ghep_done', id, combo, isNew }, ...this.afterCombo(by, key)]);
  }

  pushGallery(combo, by) {
    this.gallery = [{ key: combo.key, ea: combo.ea, eb: combo.eb, name: combo.name, mode: combo.mode, base: combo.base, tint: combo.tint, rarity: combo.rarity, by: { name: by.name } },
      ...this.gallery.filter((g) => g.key !== combo.key)].slice(0, this.cfg.gallerySize);
  }

  /** Gọi Claude soạn combo (stream để hiện tên đang được "gõ"). */
  async claudeCombo(a, b, onName) {
    const text = await this.streamJson({
      model: this.cfg.model, max_tokens: 1500, system: COMBO_SYSTEM, schema: COMBO_SCHEMA,
      content: JSON.stringify({ A: a, B: b }),
      onText: (buf) => { const m = buf.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)/); if (m) onName(m[1]); },
    });
    const d = JSON.parse(text);
    const stats = (d.stats || []).slice(0, 3).map((s) => ({ label: String(s.label || '').slice(0, 20), value: clamp(Math.round(num(s.value, 50)), 1, 100) }));
    const one = (e, part) => (String(e || '').match(EMOJI_RE) || [])[0] || guessEmoji(part) || '✨';
    return {
      ea: one(d.ea, a), eb: one(d.eb, b), name: String(d.name || '').slice(0, 32), desc: String(d.desc || '').slice(0, 90), stats,
      rarity: ['thường', 'hiếm', 'huyền thoại'].includes(d.rarity) ? d.rarity : 'thường', mode: MODES.includes(d.mode) ? d.mode : 'inside',
      base: d.base === 'b' ? 'b' : 'a', tint: hex(d.tint, '#f97316'), safe: d.safe !== false, source: 'claude',
    };
  }

  /** Gọi Claude ở chế độ stream, trả về toàn bộ văn bản; onText(buf) được gọi mỗi khi có thêm chữ. */
  async streamJson({ model, max_tokens, system, schema, content, onText }) {
    const haiku = /haiku/.test(model);
    const stream = await this.client.beta.messages.create({
      model, max_tokens, stream: true,
      ...(haiku ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system, messages: [{ role: 'user', content }],
    });
    let buf = '';
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { buf += ev.delta.text; onText?.(buf); }
      if (ev.type === 'message_delta' && ev.delta?.stop_reason === 'refusal') throw new Error('refusal');
    }
    return buf;
  }

  handleGift(by, ev) {
    const total = Math.max(0, Number(ev.diamonds) || 0) * Math.max(1, ev.repeatCount | 0 || 1);
    const out = [{ type: 'ghep_thanks', by, giftName: ev.giftName || 'quà', diamonds: total }];
    if (total < this.cfg.minGiftDiamonds) return out;
    const last = this.lastCombo.get(by.id);
    if (last && this.now() - last.at <= this.cfg.comboWindowMs && this.combos.has(last.key)) {
      return [...out, ...this.enqueue3d(last.key, by, { giftName: ev.giftName, diamonds: total })];
    }
    // chưa có combo: giữ quà 2 phút, nhắc bình luận "A + B"
    this.pendingGift.set(by.id, { at: this.now(), giftName: ev.giftName, diamonds: total });
    return [...out, { type: 'ghep_hint', by, giftName: ev.giftName }];
  }

  enqueue3d(key, by, gift) {
    const combo = this.combos.get(key);
    if (!combo) return [];
    const job = { id: ++this.jobSeq, key, combo, by, giftName: gift.giftName || 'quà', diamonds: gift.diamonds || 0 };
    // quà to (≥ 99 xu) được chen lên đầu hàng
    if (job.diamonds >= 99) this.queue3d.unshift(job); else this.queue3d.push(job);
    const pos = this.queue3d.indexOf(job) + (this.busy3d ? 1 : 0);
    setImmediate(() => this.next3d());
    return [{ type: 'ghep3d_queued', id: job.id, by, name: combo.name, position: pos }];
  }

  async next3d() {
    if (this.busy3d || !this.queue3d.length) return;
    this.busy3d = true;
    const job = this.queue3d.shift();
    const { id, key, combo, by } = job;
    this.fx([{ type: 'ghep3d_start', id, combo, by, giftName: job.giftName, diamonds: job.diamonds }]);
    let count = 0;
    const sendPart = (p) => { const c = cleanPart(p); if (c) { count++; this.fx([{ type: 'ghep3d_part', id, part: c, n: count }]); } return c; };
    try {
      if (this.models.has(key)) {
        // mô hình đã có: lắp lại từng khối với nhịp như đang dựng (không tốn token)
        for (const p of this.models.get(key)) { sendPart(p); await new Promise((r) => setTimeout(r, 380)); }
      } else if (this.client) {
        const parts = [];
        const state = { start: -1, pos: 0 };
        await this.streamJson({
          model: this.cfg.model3d, max_tokens: 6000, system: MODEL_SYSTEM, schema: MODEL_SCHEMA,
          content: `Ghép "${combo.a}" + "${combo.b}" → "${combo.name}" (${combo.desc}). Hãy dựng mô hình.`,
          onText: (buf) => { for (const p of scanStreamObjects(buf, state).items) { const c = sendPart(p); if (c) parts.push(c); } },
        });
        if (parts.length >= 4) { this.models.set(key, parts); this.dirty = true; }
      } else {
        for (const p of fallbackModel(combo)) { sendPart(p); await new Promise((r) => setTimeout(r, 380)); }
      }
    } catch (e) {
      this.log.warn?.('[ghep] dựng 3D lỗi:', e?.message || e);
      if (!count) for (const p of fallbackModel(combo)) { sendPart(p); await new Promise((r) => setTimeout(r, 300)); }
    }
    this.fx([{ type: 'ghep3d_done', id, parts: count }]);
    // chờ màn hình khoe mô hình xong rồi mới sang mô hình tiếp theo
    setTimeout(() => { this.busy3d = false; this.next3d(); }, this.cfg.show3dMs ?? 9000).unref?.();
  }
}

/** Mô hình dự phòng khi không có Claude: 2 khối cầu màu + mắt. */
function fallbackModel(combo) {
  const c = combo.tint || '#f97316';
  return [
    { label: 'thân', shape: 'sphere', size: [1.6], pos: [0, -0.6, 0], rot: [0, 0, 0], color: '#a78bfa', glow: false },
    { label: 'đầu', shape: 'sphere', size: [1.1], pos: [0, 1.6, 0], rot: [0, 0, 0], color: c, glow: false },
    { label: 'mắt trái', shape: 'sphere', size: [0.22], pos: [-0.38, 1.75, 0.95], rot: [0, 0, 0], color: '#ffffff', glow: false },
    { label: 'mắt phải', shape: 'sphere', size: [0.22], pos: [0.38, 1.75, 0.95], rot: [0, 0, 0], color: '#ffffff', glow: false },
    { label: 'con ngươi', shape: 'sphere', size: [0.11], pos: [-0.38, 1.75, 1.15], rot: [0, 0, 0], color: '#111827', glow: false },
    { label: 'con ngươi', shape: 'sphere', size: [0.11], pos: [0.38, 1.75, 1.15], rot: [0, 0, 0], color: '#111827', glow: false },
    { label: 'vòng sáng', shape: 'torus', size: [1.9, 0.08], pos: [0, -0.6, 0], rot: [90, 0, 0], color: '#facc15', glow: true },
  ];
}

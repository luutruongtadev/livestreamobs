import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { canon } from './scorer.js';
import { EmojiKitchen } from './emojikitchen.js';

/**
 * Game "Phòng thí nghiệm" (/ghep): người xem bình luận "A + B" (chữ hoặc emoji) → ghép thành emoji mới.
 * - Claude (Haiku) chọn 2 emoji đại diện (trong bộ ~620 emoji ghép được), đặt tên, mô tả troll, chỉ số.
 * - Hình: ảnh Emoji Kitchen của cặp emoji đó (trình duyệt tải thẳng, không tốn token); cặp không có ảnh thì màn hình tự ghép 2 emoji.
 * - Tặng quà ≥ minGiftDiamonds: combo của người đó được trình diễn "đặc biệt" (chen lên đầu, khung vàng, nổ pháo).
 * Combo đã tạo được lưu lại (data/ghep.json) → gặp lại không tốn token.
 */
export const GHEP_DEFAULTS = {
  minGiftDiamonds: 10, // quà từ mức này trở lên → trình diễn đặc biệt
  comboWindowMs: 120_000, // quà áp cho combo người đó bình luận trong 2 phút gần nhất (hoặc combo kế tiếp)
  cooldownMs: 3000, // mỗi người 1 combo / 3 giây
  maxNewPerMinute: 30, // tối đa combo MỚI nhờ Claude đặt tên mỗi phút (quá thì đặt tên đơn giản, không tốn token)
  model: 'claude-haiku-5-5',
  gallerySize: 12,
  autoIdleSec: 20, // không ai ghép trong N giây → máy tự ghép 2 emoji ngẫu nhiên (0 = tắt)
  autoName: '🎲 Máy tự ghép',
};

export const MODES = ['inside', 'tint', 'hat', 'eyes', 'hold', 'ride', 'half'];

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

const graphemes = new Intl.Segmenter('vi', { granularity: 'grapheme' });
/**
 * Bình luận chỉ gồm đúng 2 emoji (không cần dấu +), vd "🐱🚀" hoặc "🐱 🚀" → ['🐱', '🚀'].
 * 2 emoji giống nhau ("😂😂") không tính — người xem hay thả kiểu này để cười, không phải để ghép (muốn ghép thì gõ "😂 + 😂").
 */
export function twoEmoji(t) {
  const segs = [...graphemes.segment(String(t).replace(/\s+/g, ''))].map((x) => x.segment);
  if (segs.length !== 2 || !segs.every((g) => /^\p{Extended_Pictographic}/u.test(g) || /^\p{Regional_Indicator}/u.test(g))) return null;
  if (segs[0].replace(/\uFE0F/g, '') === segs[1].replace(/\uFE0F/g, '')) return null;
  return segs;
}

/** Lấy cặp "A + B" (hoặc đúng 2 emoji liền nhau) từ bình luận; không đúng dạng thì null. */
export function parseCombo(text) {
  const t = String(text ?? '').normalize('NFC').trim();
  const two = twoEmoji(t);
  if (two) return two;
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

const comboSystem = (list) => `Bạn là "nhà khoa học điên" của một phòng thí nghiệm trên TikTok Live tiếng Việt. Người xem gửi 2 thứ (chữ tiếng Việt / tiếng Anh hoặc emoji), bạn GHÉP chúng thành 1 sinh vật / đồ vật mới thật vui nhộn.
Trả về:
- "ea", "eb": 1 emoji đại diện cho vế A và vế B. ƯU TIÊN chọn trong DANH SÁCH EMOJI GHÉP ĐƯỢC bên dưới (chép đúng ký tự), chọn cái gần nghĩa nhất; người xem gửi emoji có trong danh sách thì giữ nguyên.
- "name": tên tiếng Việt 2–4 từ, hài hước, dễ nhớ (vd "mèo + tên lửa" → "Mèo Phản Lực").
- "desc": 1 câu troll tiếng Việt ≤ 70 ký tự, vui vẻ, không xúc phạm ai.
- "stats": đúng 3 chỉ số, mỗi cái {"label": "emoji + 1–2 từ", "value": 1–100}.
- "rarity": "thường" | "hiếm" | "huyền thoại" (combo càng bất ngờ, sáng tạo càng hiếm; đa số là thường).
- "mode" (dự phòng khi không có ảnh ghép): inside | tint | hat | eyes | hold | ride | half. "base": "a" hoặc "b" — emoji làm thân chính. "tint": màu hex chủ đạo của emoji phụ.
- "safe": false nếu yêu cầu tục tĩu, bạo lực máu me, chính trị, tôn giáo nhạy cảm, xúc phạm người thật — khi đó các trường khác điền tạm.

DANH SÁCH EMOJI GHÉP ĐƯỢC:
${list}`;

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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const hex = (c, d = '#a78bfa') => (/^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : d);

/** Combo đơn giản (không có Claude / quá tải): vẫn vui, không tốn token. */
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

const capWords = (s) => s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const STAT_POOL = ['⚡ Sức mạnh', '🥰 Dễ thương', '🤪 Độ lầy', '😈 Độ hỗn', '🧠 Độ khôn', '💨 Tốc độ', '😴 Độ lười', '🔥 Độ cháy', '🍀 May mắn', '😂 Độ hài', '💸 Độ giàu', '🛡️ Độ lì'];
const DESCS = [
  '{a} lai {b}, phòng lab cũng không ngờ tới',
  'Nửa {a} nửa {b}, mười phần đáng yêu',
  'Kết quả của một đêm thí nghiệm không ngủ',
  'Sinh ra từ {a} và {b}, lớn lên thành huyền thoại',
  'Nhà khoa học vừa ghép xong đã xin nghỉ việc',
  '{a} hôm nay hơi khác, chắc do {b}',
  'Hiếm có khó tìm, ai thấy thì chụp màn hình',
  'Ghép xong tự đi kiếm đồ ăn luôn',
  'Bản nâng cấp mà không ai yêu cầu',
  'Cẩn thận: dễ gây nghiện khi nhìn lâu',
];

/** Combo từ 2 emoji: đặt tên / mô tả / chỉ số bằng bảng tên tiếng Việt có sẵn — không gọi Claude, không tốn token. */
export function emojiCombo(kitchen, ea, eb) {
  const A = kitchen.viName(ea), B = kitchen.viName(eb);
  if (!A || !B) return null;
  let seed = 7;
  for (const ch of strip2(ea) + '|' + strip2(eb)) seed = (seed * 31 + ch.codePointAt(0)) >>> 0;
  const rnd = (k) => { // mulberry32: cùng cặp emoji luôn ra cùng kết quả
    let x = (seed + Math.imul(k + 1, 0x9e3779b9)) >>> 0;
    x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  // danh từ đứng trước, tính từ (mặt cười / cảm xúc) đứng sau: 🐱 + 😎 → "Mèo Ngầu"; 2 mặt → "Mặt Ngầu Khóc Nhè"
  let name;
  if (A.adj && B.adj) name = A.text === B.text ? `mặt ${A.text} gấp đôi` : `mặt ${A.text} ${B.text}`;
  else if (A.adj) name = `${B.text} ${A.text}`;
  else if (B.adj) name = `${A.text} ${B.text}`;
  else name = A.text === B.text ? `${A.text} song sinh` : `${A.text} ${B.text}`;
  const noun = (x) => (x.adj ? `mặt ${x.text}` : x.text);
  const desc = A.text === B.text ? 'Một cái chưa đủ, phải nhân đôi' : DESCS[Math.floor(rnd(1) * DESCS.length)].replace('{a}', noun(A)).replace('{b}', noun(B));
  const pool = [...STAT_POOL];
  const stats = [0, 1, 2].map((i) => ({ label: pool.splice(Math.floor(rnd(10 + i) * pool.length), 1)[0], value: 5 + Math.floor(rnd(20 + i) * 96) }));
  const r = rnd(3);
  return {
    ea, eb, name: capWords(name).slice(0, 32), desc: desc.charAt(0).toUpperCase() + desc.slice(1), stats,
    rarity: r < 0.05 ? 'huyền thoại' : r < 0.25 ? 'hiếm' : 'thường',
    mode: MODES[Math.floor(rnd(4) * MODES.length)], base: A.adj && !B.adj ? 'b' : 'a', tint: ['#f97316', '#22c55e', '#3b82f6', '#ec4899', '#eab308'][Math.floor(rnd(5) * 5)], source: 'table',
  };
}
const strip2 = (e) => String(e).replace(/\uFE0F/g, '');
/** Vế này chỉ là đúng 1 emoji? */
const onlyEmoji = (p) => { const m = String(p).match(EMOJI_RE); return m && m[0].length === String(p).trim().length ? m[0] : null; };

const DEFAULT_KITCHEN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'modewords', 'emoji-kitchen.json');

export class GhepGame extends EventEmitter {
  constructor(config = {}, { client = null, filePath = null, kitchen = null, now = () => Date.now(), random = Math.random, log = console } = {}) {
    super();
    this.cfg = { ...GHEP_DEFAULTS, ...config };
    this.client = client;
    this.filePath = filePath;
    this.kitchen = kitchen || EmojiKitchen.load(DEFAULT_KITCHEN);
    this.system = comboSystem(this.kitchen.list());
    this.now = now;
    this.random = random;
    this.log = log;
    this.lastActivityAt = now(); // lần gần nhất có combo (người xem hoặc máy tự ghép)
    this.combos = new Map(); // key -> combo
    this.active = false; // đang là game chính trên live?
    this.jobSeq = 0;
    this.pending = new Map(); // key -> Promise combo (đang soạn)
    this.lastCombo = new Map(); // userId -> { key, at }
    this.pendingGift = new Map(); // userId -> { at, giftName, diamonds } (tặng quà khi chưa có combo)
    this.lastAt = new Map(); // userId -> lúc gửi combo gần nhất
    this.newTimes = []; // thời điểm tạo combo mới (giới hạn / phút)
    this.gallery = []; // combo vừa ghép gần đây (hiện ở dải dưới màn hình)
    this.dirty = false;
    this.load();
  }

  load() {
    if (!this.filePath) return;
    try {
      const d = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.combos = new Map(Object.entries(d.combos || {}));
      this.active = !!d.active;
      this.gallery = Array.isArray(d.gallery) ? d.gallery.slice(0, this.cfg.gallerySize) : [];
    } catch { /* chưa có */ }
    // combo lưu từ bản cũ chưa có ảnh ghép → bổ sung
    for (const c of this.combos.values()) if (c.img === undefined) c.img = this.kitchen.url(c.ea, c.eb);
    for (const g of this.gallery) if (g.img === undefined) g.img = this.kitchen.url(g.ea, g.eb);
  }

  save() {
    if (!this.filePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const combos = [...this.combos.entries()].slice(-5000);
    fs.writeFileSync(this.filePath, JSON.stringify({ active: this.active, combos: Object.fromEntries(combos), gallery: this.gallery }));
    this.dirty = false;
  }

  setActive(on) { this.active = !!on; this.dirty = true; return this.active; }

  snapshot() {
    return { active: this.active, gallery: this.gallery, total: this.combos.size, minGiftDiamonds: this.cfg.minGiftDiamonds };
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
    this.lastActivityAt = t;
    const [a, b] = pair;
    const key = comboKey(a, b);
    const id = ++this.jobSeq;
    const known = this.combos.get(key);
    this.lastCombo.set(by.id, { key, at: t });
    const ea = known?.ea || guessEmoji(a), eb = known?.eb || guessEmoji(b);
    const start = { type: 'ghep_job', id, a, b, ea, eb, by, known: !!known, img: known?.img || this.kitchen.url(ea, eb) };
    if (known) {
      known.count = (known.count || 1) + 1;
      this.dirty = true;
      this.pushGallery(known, by);
      return [start, { type: 'ghep_done', id, combo: known, isNew: false, gift: this.takeGift(by) }];
    }
    this.create(key, a, b, id, by).catch((e) => this.log.warn?.('[ghep] lỗi:', e?.message || e));
    return [start];
  }

  /**
   * Gọi đều đặn: game đang bật, đang live (live = true) mà quá autoIdleSec giây không ai ghép
   * → máy tự ghép 2 emoji ngẫu nhiên cho màn hình đỡ trống (tên đặt bằng bảng có sẵn, không tốn token).
   */
  tick({ live = true } = {}) {
    if (!this.active || !live || !(this.cfg.autoIdleSec > 0)) return [];
    if (this.pending.size || this.now() - this.lastActivityAt < this.cfg.autoIdleSec * 1000) return [];
    return this.autoCombo();
  }

  /** 2 emoji ngẫu nhiên có ảnh Emoji Kitchen + tên tiếng Việt (để đặt tên không cần Claude). */
  randomPair() {
    const list = (this.kitchen.emoji || []).filter((x) => x[3]).map((x) => x[1]);
    if (list.length < 2) return null;
    const pick = () => list[Math.floor(this.random() * list.length)];
    for (let i = 0; i < 80; i++) {
      const a = pick(), b = pick();
      if (a !== b && this.kitchen.url(a, b)) return [a, b];
    }
    return null;
  }

  /** Máy tự ghép (cũng dùng cho nút thử ở admin). */
  autoCombo() {
    const pair = this.randomPair();
    this.lastActivityAt = this.now();
    if (!pair) return [];
    const by = { id: 'auto', name: this.cfg.autoName, avatar: null };
    this.lastAt.delete(by.id);
    return this.handleComment(by, `${pair[0]} + ${pair[1]}`).map((e) => (e.type === 'ghep_job' ? { ...e, auto: true } : e));
  }

  /** Quà tặng trước khi bình luận (trong 2 phút) → áp cho combo này. */
  takeGift(by) {
    const g = this.pendingGift.get(by.id);
    if (!g) return null;
    this.pendingGift.delete(by.id);
    return this.now() - g.at <= this.cfg.comboWindowMs ? { giftName: g.giftName, diamonds: g.diamonds } : null;
  }

  async create(key, a, b, id, by) {
    if (!this.pending.has(key)) {
      const t = this.now();
      this.newTimes = this.newTimes.filter((x) => t - x < 60_000);
      // 2 vế đều là emoji có trong bảng → đặt tên bằng bảng tiếng Việt, không gọi Claude
      const ea = onlyEmoji(a), eb = onlyEmoji(b);
      const table = ea && eb ? emojiCombo(this.kitchen, this.kitchen.canonical(ea) || ea, this.kitchen.canonical(eb) || eb) : null;
      const useClaude = !table && this.client && this.newTimes.length < this.cfg.maxNewPerMinute;
      if (useClaude) this.newTimes.push(t);
      const p = (table ? Promise.resolve(table) : useClaude ? this.claudeCombo(a, b, (name) => this.fx([{ type: 'ghep_typing', id, name }])) : Promise.resolve(null))
        .catch((e) => { this.log.warn?.('[ghep] Claude lỗi:', e?.message || e); return null; })
        .then((c) => {
          if (c && c.safe === false) return { refused: true };
          const base = c || simpleCombo(a, b, guessEmoji(a), guessEmoji(b));
          const combo = { ...base, img: this.kitchen.url(base.ea, base.eb), key, a, b, inventor: by, at: this.now(), count: 1 };
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
    this.fx([{ type: 'ghep_done', id, combo, isNew, gift: this.takeGift(by) }]);
  }

  pushGallery(combo, by) {
    this.gallery = [{ key: combo.key, ea: combo.ea, eb: combo.eb, img: combo.img, name: combo.name, mode: combo.mode, base: combo.base, tint: combo.tint, rarity: combo.rarity, by: { name: by.name } },
      ...this.gallery.filter((g) => g.key !== combo.key)].slice(0, this.cfg.gallerySize);
  }

  /** Emoji Claude chọn → đúng ký tự trong bộ ghép được (nếu có), không thì emoji đầu tiên tìm thấy. */
  pickEmoji(e, part) {
    const m = (String(e || '').match(EMOJI_RE) || [])[0];
    return this.kitchen.canonical(m) || this.kitchen.canonical(guessEmoji(part)) || m || guessEmoji(part) || '✨';
  }

  /** Gọi Claude soạn combo (stream để hiện tên đang được "gõ"). */
  async claudeCombo(a, b, onName) {
    const text = await this.streamJson({
      model: this.cfg.model, max_tokens: 1200, schema: COMBO_SCHEMA,
      system: [{ type: 'text', text: this.system, cache_control: { type: 'ephemeral' } }],
      content: JSON.stringify({ A: a, B: b }),
      onText: (buf) => { const m = buf.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)/); if (m) onName(m[1]); },
    });
    const d = JSON.parse(text);
    const stats = (d.stats || []).slice(0, 3).map((s) => ({ label: String(s.label || '').slice(0, 20), value: clamp(Math.round(num(s.value, 50)), 1, 100) }));
    return {
      ea: this.pickEmoji(d.ea, a), eb: this.pickEmoji(d.eb, b), name: String(d.name || '').slice(0, 32), desc: String(d.desc || '').slice(0, 90), stats,
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
    const unit = Math.max(0, Number(ev.diamonds) || 0);
    const repeat = Math.max(1, ev.repeatCount | 0 || 1);
    // quà combo tới từng phần: streakTotal = tổng cả chuỗi tới giờ → tính ngưỡng trên cả combo, chỉ trình diễn 1 lần khi vừa vượt ngưỡng
    const total = unit * (ev.streakTotal ?? repeat);
    const before = ev.streakTotal != null ? unit * (ev.streakTotal - repeat) : 0;
    const out = before > 0 ? [] : [{ type: 'ghep_thanks', by, giftName: ev.giftName || 'quà', diamonds: total }]; // cảm ơn 1 lần mỗi chuỗi
    if (total < this.cfg.minGiftDiamonds || before >= this.cfg.minGiftDiamonds) return out;
    const last = this.lastCombo.get(by.id);
    const combo = last && this.now() - last.at <= this.cfg.comboWindowMs ? this.combos.get(last.key) : null;
    if (combo) return [...out, { type: 'ghep_spotlight', id: ++this.jobSeq, combo, by, gift: { giftName: ev.giftName || 'quà', diamonds: total } }];
    // chưa có combo: giữ quà 2 phút, nhắc bình luận "A + B"
    this.pendingGift.set(by.id, { at: this.now(), giftName: ev.giftName, diamonds: total });
    return [...out, { type: 'ghep_hint', by, giftName: ev.giftName }];
  }
}

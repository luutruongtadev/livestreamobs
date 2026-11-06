import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ATTRS, ATTR_BY_ID, compareAttr, chooseAttrs } from './attributes.js';
import { canon, isExact, containsAnswer } from './scorer.js';
import { makePausable } from './pause.js';
import { TeamMatch } from './teams.js';

/** Gợi ý chỉ gồm emoji (vd "🧭 🗺️ ⛵"). */
export const isEmojiHint = (h) => /^[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f\s]+$/u.test(String(h || '').trim()) && /\p{Extended_Pictographic}/u.test(String(h));

/**
 * Từ vựng: tối đa 3 gợi ý — emoji → chủ đề của từ → gợi ý từ liên quan gần nghĩa nhất.
 * Không có emoji thì: chủ đề → gợi ý xa → gợi ý gần.
 */
/**
 * Mức hiệu ứng khi đoán trúng:
 *   lightning ⚡ trong 10 giây đầu · nohint 🔥 chưa mở gợi ý nào · hint1 💡 mới 1 gợi ý
 *   clutch ⏱️ còn ≤ 10 giây là hết giờ · hint2 👍 sau 2 gợi ý · hint3 🎉 sau đủ gợi ý
 */
export function winTier({ seconds, left, hintLevel, flashSeconds = 10, clutchSeconds = 10 }) {
  if (seconds <= flashSeconds && hintLevel === 0) return 'lightning';
  if (hintLevel === 0) return 'nohint';
  if (hintLevel === 1) return 'hint1';
  if (left <= clutchSeconds) return 'clutch';
  return hintLevel === 2 ? 'hint2' : 'hint3';
}

export function vocabHints(w) {
  const desc = (w.desc || []).filter(Boolean).slice(0, 2);
  const topic = w.hint ? [`Chủ đề: ${w.hint}`] : [];
  if (w.emoji) return [w.emoji, ...topic, ...(desc.length ? [desc[desc.length - 1]] : [])].slice(0, 3);
  return [...topic, ...desc].slice(0, 3);
}

/** Tên hiển thị → chuỗi ô chữ: bỏ dấu nháy, chấm, & ... thành khoảng trắng ("Kai'Sa" → "kai sa"). */
export const toSecret = (name) => canon(String(name || '').replace(/[^\p{L}\p{N} ]+/gu, ' '));

export const WG_DEFAULTS = {
  roundSeconds: 300,
  breakSeconds: 12,
  hintAtSeconds: [60, 150, 230], // tự mở gợi ý theo thời gian
  giftHintMinDiamonds: 10, // (cũ) dùng khi không khai báo giftUnlocks
  // Quà mở khoá: khớp theo tên quà (gifts) trước, không khớp thì theo số xu (minDiamonds cao nhất ≤ số xu).
  // action: letter (lộ 1 chữ cái) | hint (gợi ý tiếp) | time (+giây) | syllable (lộ cả 1 tiếng)
  // every: cần gom đủ N món (cộng dồn cả phòng trong vòng) mới mở 1 lần.
  giftUnlocks: [
    { id: 'rose', gifts: ['Rose', 'TikTok', 'Heart Me', 'Ice Cream Cone'], action: 'letter', every: 5, icon: '🌹', label: '5 Hoa hồng = 1 chữ' },
    { id: 'heart', gifts: ['Finger Heart'], action: 'letter', icon: '🫰', label: 'Tim tay = 1 chữ' },
    { id: 'hint', minDiamonds: 10, action: 'hint', icon: '🎁', label: '10 xu = gợi ý' },
    { id: 'time', minDiamonds: 30, action: 'time', seconds: 60, icon: '🍩', label: '30 xu = +60 giây' },
    { id: 'syllable', minDiamonds: 99, action: 'syllable', icon: '💎', label: '99 xu = lộ 1 tiếng' },
  ],
  cooldownSec: 2, // mỗi người đoán tối đa 1 từ / N giây
  maxGuessChars: 24,
  maxGuessWords: 4,
  maxScoredPerRound: 500, // giới hạn số từ khác nhau gửi đi chấm mỗi vòng (kiểm soát chi phí)
  // Kiểu chơi được bật, luân phiên lần lượt: 'meaning' (chấm gần nghĩa 1–100) · 'attr' (so 6 thuộc tính)
  // · 'english' (gợi ý bằng 5 từ tiếng Anh, chấm gần nghĩa)
  modes: ['meaning', 'attr', 'english'],
  alternateEvery: 2, // mỗi N vòng đổi kiểu
  likeEvery: 1000, // cả phòng thả đủ N tim → lộ 1 chữ cái (0 = tắt)
  englishFreeHints: 3, // chế độ tiếng Anh: hệ thống tự mở 3 gợi ý; gợi ý 4–5 phải mở bằng tim / quà
  englishLikeEvery: 2000, // chế độ tiếng Anh: cả phòng thả đủ N tim → mở thêm 1 từ tiếng Anh (hết 5 từ thì thôi)
  words: [{ word: 'mặt trời', hint: 'Thiên nhiên' }],
};

/** Lấy từ đoán từ bình luận; trả về null nếu không giống một từ đoán. */
export function parseGuess(text, cfg = WG_DEFAULTS) {
  let t = String(text ?? '').normalize('NFC');
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' '); // emoji
  t = t.replace(/[.,!?;:"'“”‘’()[\]{}<>~`@#$%^&*_+=|\\/-]+/g, ' ');
  t = canon(t);
  if (!t || t.length > cfg.maxGuessChars) return null;
  if (t.split(' ').length > cfg.maxGuessWords) return null;
  if (!/\p{L}/u.test(t)) return null;
  if (/https?|www|\d{3,}/.test(t)) return null;
  return t;
}

/**
 * Trò chơi đoán từ theo nghĩa. Phát sự kiện 'effects' (mảng hiệu ứng) khi có kết quả chấm điểm bất đồng bộ.
 */
export class WordGame extends EventEmitter {
  constructor(config = {}, { scorer, now = () => Date.now(), statePath = null, random = Math.random, wordBank = null, wordSets = {}, weekly = null, attrStore = null, englishStore = null, modeWords = {} } = {}) {
    super();
    this.attrStore = attrStore; // thuộc tính của từ (chế độ "Đoán thuộc tính"), có thể null
    this.englishStore = englishStore; // 5 gợi ý tiếng Anh (chế độ "Gợi ý tiếng Anh"), có thể null
    // kho từ soạn sẵn riêng cho từng chế độ: { attr: [{ word, attrs, emoji, desc }], english: [{ word, en, aliases }] }
    this.modeWords = modeWords || {};
    this.modeUsed = new Set(); // dùng khi không có wordBank (test)
    this.modeCounter = 0; // số vòng đã chơi để luân phiên kiểu chơi
    this.weekly = weekly; // bảng xếp hạng tuần (WeeklyBoard), có thể null
    this.teams = new TeamMatch(config.team || {}); // chế độ đấu đội (admin bật / tắt)
    // Bộ từ: { id: { title, secretLabel, scoreContext, words: [{ word, hint?, hints?, aliases? }] } }
    // Bộ "tu-vung" (mặc định) dùng kho từ do Claude sinh + config.words.
    this.wordSets = wordSets;
    this.activeSet = config.activeSet && (config.activeSet === 'tu-vung' || wordSets[config.activeSet]) ? config.activeSet : 'tu-vung';
    this.wordBank = wordBank; // kho từ do Claude sinh (tuỳ chọn)
    this.cfg = { ...WG_DEFAULTS, ...config };
    if (config.modeRotation && !config.modes) this.applySettings({ modeRotation: config.modeRotation });
    this.scorer = scorer;
    this.now = now;
    this.random = random;
    this.statePath = statePath;
    this.wins = {}; // id -> { id, name, avatar, wins }
    this.roundNo = 0;
    this.recent = []; // các từ bí mật gần đây, tránh lặp
    this.priority = []; // từ admin thêm, chơi trước (hàng ưu tiên)
    this.load();
    this.startRound();
  }

  load() {
    if (!this.statePath) return;
    try {
      const s = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      this.wins = s.wins || {};
      this.roundNo = s.roundNo || 0;
      this.recent = s.recent || [];
      this.priority = Array.isArray(s.priority) ? s.priority : [];
      this.teams.load(s.team);
      this.modeCounter = s.modeCounter || 0;
      if (s.settings) this.applySettings(s.settings);
      if (s.activeSet && (s.activeSet === 'tu-vung' || this.wordSets?.[s.activeSet])) this.activeSet = s.activeSet;
    } catch { /* chưa có */ }
  }

  save() {
    this.scorer?.saveCache?.();
    if (!this.statePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify({ wins: this.wins, roundNo: this.roundNo, recent: this.recent.slice(-30), activeSet: this.activeSet, priority: this.priority, team: this.teams.toJSON(), modeCounter: this.modeCounter, settings: this.settings() }));
    this.dirty = false;
  }

  settings() { return { modes: [...this.cfg.modes], alternateEvery: this.cfg.alternateEvery, likeEvery: this.cfg.likeEvery, englishLikeEvery: this.cfg.englishLikeEvery }; }

  /** Admin đổi kiểu chơi / số tim mở chữ (áp dụng từ vòng sau, riêng số tim áp dụng ngay). */
  applySettings({ modes, modeRotation, alternateEvery, likeEvery, englishLikeEvery } = {}) {
    // cấu hình cũ: modeRotation = 'alternate' | 'meaning' | 'attr'
    if (!modes && modeRotation) modes = modeRotation === 'alternate' ? ['meaning', 'attr'] : [modeRotation];
    if (Array.isArray(modes)) {
      const ok = ['meaning', 'attr', 'english'].filter((m) => modes.includes(m));
      this.cfg.modes = ok.length ? ok : ['meaning'];
    }
    if (alternateEvery != null) this.cfg.alternateEvery = Math.max(1, Math.min(20, Number(alternateEvery) || 2));
    if (likeEvery != null) this.cfg.likeEvery = Math.max(0, Math.min(1_000_000, Number(likeEvery) || 0));
    if (englishLikeEvery != null) this.cfg.englishLikeEvery = Math.max(0, Math.min(1_000_000, Number(englishLikeEvery) || 0));
    this.dirty = true;
    return this.settings();
  }

  /** Kiểu chơi của vòng tới. */
  nextMode() {
    // chế độ cần Claude (thuộc tính / tiếng Anh) mà chưa có API key thì bỏ qua
    const ok = (this.cfg.modes || ['meaning']).filter((m) => m === 'meaning' || (m === 'attr' && this.attrStore?.available) || (m === 'english' && this.englishStore?.available));
    if (!ok.length) return 'meaning';
    return ok[Math.floor(this.modeCounter / Math.max(1, this.cfg.alternateEvery)) % ok.length];
  }

  resetAll() {
    this.wins = {};
    this.roundNo = 0;
    this.dirty = true;
    return this.startRound();
  }

  get set() { return this.activeSet !== 'tu-vung' ? this.wordSets[this.activeSet] : null; }

  /** Đổi bộ từ (admin) → bắt đầu vòng mới với bộ đó. */
  setWordSet(id) {
    if (id !== 'tu-vung' && !this.wordSets[id]) throw new Error(`Không có bộ từ "${id}"`);
    this.activeSet = id;
    this.dirty = true;
    return this.startRound();
  }

  /** Gợi ý của một từ vừa được tạo lại: nếu đúng từ đang chơi thì cập nhật luôn (giữ số gợi ý đã mở). */
  updateWord(setId, entry) {
    if (setId !== this.activeSet || this.phase !== 'playing') return [];
    if (toSecret(entry.word) !== this.secret) return [];
    this.customHints = entry.hints.slice();
    this.aliases = entry.aliases || [];
    this.hintLevel = Math.min(this.hintLevel, this.customHints.length);
    this.dirty = true;
    return [{ type: 'wg_hints_updated' }];
  }

  listSets() {
    return [
      { id: 'tu-vung', title: 'Đoán từ (từ vựng)', count: null },
      ...Object.entries(this.wordSets).map(([id, s]) => ({ id, title: s.title || id, topic: s.topic || null, count: s.words?.length || 0, generated: !!s.generated })),
    ];
  }

  /** Admin: thêm từ vào hàng ưu tiên (vòng sau chơi luôn). */
  enqueue(entry) {
    this.priority = this.priority.filter((w) => toSecret(w.word) !== toSecret(entry.word));
    this.priority.push(entry);
    this.dirty = true;
    return this.priority.length;
  }

  /** Từ soạn sẵn cho chế độ (chưa chơi). Hết thì trả null → lấy từ kho thường, Claude soạn thuộc tính / gợi ý. */
  pickModeWord(mode) {
    const list = this.modeWords[mode];
    if (!Array.isArray(list) || !list.length) return null;
    const used = (w) => (this.wordBank?.isUsed ? this.wordBank.isUsed(w.word) : this.modeUsed.has(canon(w.word)));
    const pool = list.filter((w) => w?.word && !used(w) && !this.recent.includes(toSecret(w.word)));
    if (!pool.length) return null;
    const w = pool[Math.floor(this.random() * pool.length)];
    if (this.wordBank?.markUsed) this.wordBank.markUsed(w.word);
    else this.modeUsed.add(canon(w.word));
    return { ...w, source: `mode-${mode}` };
  }

  /** Số từ soạn sẵn còn lại / tổng cho từng chế độ (hiện ở admin). */
  modeWordStats() {
    const out = {};
    for (const [mode, list] of Object.entries(this.modeWords)) {
      if (!Array.isArray(list)) continue;
      const used = list.filter((w) => (this.wordBank?.isUsed ? this.wordBank.isUsed(w.word) : this.modeUsed.has(canon(w.word)))).length;
      out[mode] = { total: list.length, left: list.length - used };
    }
    return out;
  }

  pickWord(mode = null) {
    if (this.priority?.length) { this.dirty = true; return this.priority.shift(); }
    // bộ từ vựng chung + chế độ thuộc tính / tiếng Anh: ưu tiên từ soạn sẵn cho chế độ đó
    if (!this.set && mode && mode !== 'meaning') {
      const w = this.pickModeWord(mode);
      if (w) return w;
    }
    if (this.set) {
      const words = this.set.words.filter((w) => w?.word);
      const fresh = words.filter((w) => !this.recent.includes(toSecret(w.word)));
      const pool = fresh.length ? fresh : words;
      return pool[Math.floor(this.random() * pool.length)];
    }
    if (this.wordBank) return this.wordBank.next(this.recent);
    const words = this.cfg.words.filter((w) => w?.word);
    const fresh = words.filter((w) => !this.recent.includes(canon(w.word)));
    const pool = fresh.length ? fresh : words;
    return pool[Math.floor(this.random() * pool.length)];
  }

  startRound(word = null) {
    const mode = this.nextMode();
    const w = word ? (typeof word === 'string' ? { word } : word) : this.pickWord(mode);
    this.roundNo++;
    this.phase = 'playing';
    this.display = String(w.word).trim(); // tên hiển thị khi lộ đáp án (vd "Kai'Sa")
    this.secret = toSecret(w.word);
    this.category = w.hint || '';
    // gợi ý riêng của từ: bộ LMHT… (hints), hoặc từ vựng có 2 câu mô tả + 3 emoji (desc, emoji)
    const raw = Array.isArray(w.hints) ? w.hints.filter(Boolean)
      : Array.isArray(w.desc) && w.desc.length ? vocabHints(w)
      : null;
    // thứ tự mở: emoji → chủ đề / gợi ý chữ
    this.customHints = raw ? [...raw.filter(isEmojiHint), ...raw.filter((h) => !isEmojiHint(h))] : null;
    this.aliases = Array.isArray(w.aliases) ? w.aliases : [];
    this.hintLevel = 0;
    this.revealedIdx = new Set(); // vị trí chữ cái đã lộ (đánh số liên tục, bỏ khoảng trắng)
    this.giftCounters = {}; // id luật quà → số món đã gom trong vòng
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.cfg.roundSeconds * 1000;
    this.guesses = new Map(); // canon -> { word, score, pending, by, at, count, source }
    this.feed = [];
    this.lastGuessAt = new Map();
    this.winner = null;
    this.scoredCount = 0;
    this.recent.push(this.secret);
    this.recent = this.recent.slice(-30);
    this.teams?.onRoundStart();
    this.likeCount = 0;
    // kiểu chơi của vòng
    this.mode = mode;
    this.modeCounter++;
    this.roundAttrs = null; // 6 thuộc tính của vòng (id)
    this.secretAttrs = null;
    this.known = {}; // thuộc tính đã đoán trúng: id -> giá trị
    this.englishHints = null;
    this.baseHints = null;
    if (this.mode === 'attr') {
      // gợi ý "Chủ đề" trùng với thuộc tính Loại → bỏ
      if (this.customHints) this.customHints = this.customHints.filter((h) => !/^Chủ đề:/.test(h));
      if (w.attrs && typeof w.attrs === 'object') { // từ soạn sẵn: có thuộc tính luôn, không cần gọi Claude
        this.secretAttrs = w.attrs;
        this.roundAttrs = chooseAttrs(w.attrs, this.random);
      } else this.loadSecretAttrs();
    } else if (this.mode === 'english') {
      // gợi ý chỉ bằng tiếng Anh (5 từ, mở dần); không có thì quay về gợi ý thường
      this.baseHints = this.customHints;
      this.customHints = null;
      if (Array.isArray(w.en) && w.en.length) this.englishHints = w.en.slice(0, 5); // từ soạn sẵn
      else this.loadEnglishHints();
    }
    this.dirty = true;
    return [{ type: 'wg_start', round: this.roundNo, mode: this.mode }];
  }

  /** Chế độ thuộc tính: lấy thuộc tính của từ bí mật (Claude, có cache) rồi chọn 6 cái cho vòng. */
  loadSecretAttrs() {
    const round = this.roundNo;
    this.attrStore.get(this.secret).then((a) => {
      if (round !== this.roundNo) return;
      if (!a) { // không xếp được → vòng này chơi kiểu gần nghĩa
        this.mode = 'meaning';
        this.emit('effects', [{ type: 'wg_mode', mode: 'meaning', fallback: true }]);
        for (const g of this.guesses.values()) if (g.pending) this.scoreGuess(g);
        return;
      }
      this.secretAttrs = a;
      this.roundAttrs = chooseAttrs(a, this.random);
      this.dirty = true;
      this.emit('effects', [{ type: 'wg_attrs', attrs: this.attrMeta() }]);
      for (const g of this.guesses.values()) if (g.pending) this.scoreGuess(g); // từ đoán trước lúc sẵn sàng
    }).catch(() => {});
  }

  /** Chế độ tiếng Anh: lấy 5 gợi ý tiếng Anh (Claude, có cache). Lỗi thì vòng này chơi gần nghĩa với gợi ý thường. */
  loadEnglishHints() {
    const round = this.roundNo;
    this.englishStore.get(this.secret, this.aliases).then((h) => {
      if (round !== this.roundNo) return;
      if (!h?.length) {
        this.mode = 'meaning';
        this.customHints = this.baseHints;
        this.emit('effects', [{ type: 'wg_mode', mode: 'meaning', fallback: true }]);
        return;
      }
      this.englishHints = h.slice(0, 5);
      this.dirty = true;
      this.emit('effects', [{ type: 'wg_english', count: this.englishHints.length }]);
    }).catch(() => {});
  }

  attrMeta() { return (this.roundAttrs || []).map((id) => ({ id, icon: ATTR_BY_ID[id].icon, name: ATTR_BY_ID[id].name })); }

  /** Gợi ý theo mức: 1 = chủ đề, 2 = chữ cái đầu mỗi tiếng, 3 = lộ một tiếng. */
  get maxHints() { return this.mode === 'english' ? 5 : this.customHints?.length || 3; }

  /** Mốc giây tự mở gợi ý: dùng hintAtSeconds, nhiều gợi ý riêng thì rải đều trong vòng. */
  hintSchedule() {
    // chế độ tiếng Anh: chỉ tự mở 3 gợi ý đầu, 2 gợi ý cuối để cả phòng thả tim / tặng quà mở
    const n = this.mode === 'english' ? Math.min(this.maxHints, this.cfg.englishFreeHints) : this.maxHints;
    if (n <= this.cfg.hintAtSeconds.length) return this.cfg.hintAtSeconds.slice(0, n);
    const span = Math.max(60, this.cfg.roundSeconds - 40);
    return Array.from({ length: n }, (_, i) => Math.round(((i + 1) * span) / (n + 0.5)));
  }

  hints() {
    if (this.mode === 'english') return (this.englishHints || []).slice(0, this.hintLevel).map((h) => `🇬🇧 ${h}`);
    if (this.customHints) return this.customHints.slice(0, this.hintLevel);
    const out = [];
    const syl = this.secret.split(' ');
    if (this.hintLevel >= 1 && this.category && this.mode !== 'attr') out.push(`Chủ đề: ${this.category}`);
    if (this.hintLevel >= 2) out.push(`Chữ đầu: ${syl.map((s) => s[0].toUpperCase() + '…').join(' ')}`);
    if (this.hintLevel >= 3) {
      const shown = syl.length > 1 ? [syl[0], ...syl.slice(1).map(() => '___')] : [syl[0].slice(0, Math.ceil(syl[0].length / 2)) + '…'];
      out.push(`Lộ chữ: ${shown.join(' ')}`);
    }
    return out;
  }

  revealHint(by = null) {
    if (this.phase !== 'playing' || this.hintLevel >= this.maxHints) return [];
    this.hintLevel++;
    this.dirty = true;
    return [{ type: 'wg_hint', level: this.hintLevel, hint: this.hints().at(-1), by }];
  }

  handle(ev) {
    const by = ev.user?.id ? { id: ev.user.id, name: ev.user.name, avatar: ev.user.avatar } : null;
    // đấu đội: comment "đội đỏ" / "đội xanh" để vào đội (không tính là lượt đoán)
    const pre = [];
    if (this.teams.on && ev.type === 'comment' && by && !this.paused) {
      const joined = this.teams.joinFromText(by, ev.text);
      if (joined) { this.dirty = true; return joined; }
      // chưa có đội mà đoán → tự vào đội ít người hơn
      if (this.phase === 'playing' && parseGuess(ev.text, this.cfg)) pre.push(...this.teams.ensureMember(by));
    }
    const fx = [...pre, ...this.handleEvent(ev)];
    // ai tặng quà cũng được cảm ơn đích danh (kể cả lúc nghỉ giữa vòng / tạm dừng) + tích điểm thưởng tuần
    if (ev.type === 'gift' && by) {
      const repeat = Math.max(1, ev.repeatCount | 0 || 1);
      const unit = Math.max(0, Number(ev.diamonds) || 0);
      const bonus = this.weekly?.addBonus(by, { diamonds: unit * repeat }) || { add: 0, total: 0 };
      fx.push({ type: 'wg_thanks', by, giftName: ev.giftName || 'quà', giftImage: ev.giftImage || null, repeat, diamonds: unit * repeat, bonusAdd: bonus.add, bonusTotal: bonus.total });
      const tp = this.teams.addPoints(by, Math.round(unit * repeat * this.teams.cfg.perDiamond), 'gift');
      if (tp) { fx.push(tp); this.dirty = true; }
    }
    // cả phòng thả đủ N tim → lộ 1 chữ cái
    // (chế độ tiếng Anh: đủ N tim → mở thêm 1 từ tiếng Anh, mở hết 5 từ thì thôi, không lộ chữ)
    if (ev.type === 'like' && this.phase === 'playing' && !this.paused && this.likeRule()) {
      this.likeCount = (this.likeCount || 0) + Math.max(1, ev.count | 0 || 1);
      this.dirty = true;
      let rule;
      while ((rule = this.likeRule()) && this.likeCount >= rule.every) {
        const got = this.applyUnlock(rule, null, 'tim', rule.every);
        if (!got.length) { this.likeCount = rule.every - 1; break; } // chỉ còn 1 chữ: không mở nữa
        this.likeCount -= rule.every;
        fx.push(...got.map((e) => ({ ...e, likes: true })));
      }
    }
    // chia sẻ live: tích điểm thưởng, cộng vào lần đoán đúng tiếp theo
    if (ev.type === 'share' && by && this.weekly) {
      const bonus = this.weekly.addBonus(by, { shares: 1 });
      fx.push({ type: 'wg_bonus', kind: 'share', by, add: bonus.add, total: bonus.total });
    }
    if (ev.type === 'share' && by) {
      const tp = this.teams.addPoints(by, this.teams.cfg.perShare, 'share');
      if (tp) { fx.push(tp); this.dirty = true; }
    }
    return fx;
  }

  handleEvent(ev) {
    this.lastReject = null; // lý do bỏ qua bình luận gần nhất (để trang admin hiển thị)
    if (this.paused) {
      if (ev.type === 'comment') this.lastReject = this.pauseReason === 'offline' ? 'Game đang tạm dừng vì chưa live (bấm ▶ Tiếp tục để thử)' : 'Game đang tạm dừng';
      return [];
    }
    if (this.phase !== 'playing') {
      if (ev.type === 'comment') this.lastReject = `Đang nghỉ giữa hai vòng (còn ${Math.max(0, Math.ceil((this.nextAt - this.clock()) / 1000))} giây)`;
      return [];
    }
    const user = ev.user;
    if (ev.type === 'gift') return this.handleGift(ev);
    if (ev.type !== 'comment' || !user?.id) return [];
    // Câu có chứa đúng đáp án ("trứng vịt lộn ạ", "đáp án là trứng vịt lộn nha") → trúng luôn, không tính giãn cách 2 giây
    if (containsAnswer(ev.text, this.secret, this.aliases) || isExact(parseGuess(ev.text, { ...this.cfg, maxGuessWords: 8, maxGuessChars: 60 }) || '', this.secret, this.aliases)) {
      this.lastGuessAt.set(user.id, this.clock());
      return this.win({ id: user.id, name: user.name, avatar: user.avatar }, this.secret);
    }
    const word = parseGuess(ev.text, this.cfg);
    if (!word) {
      this.lastReject = `Không tính là từ đoán: tối đa ${this.cfg.maxGuessWords} tiếng / ${this.cfg.maxGuessChars} ký tự, phải có chữ cái, không chứa link`;
      return [];
    }
    const t = this.clock();
    if (t - (this.lastGuessAt.get(user.id) ?? -Infinity) < this.cfg.cooldownSec * 1000) {
      this.lastReject = `Người này vừa đoán, mỗi người 1 từ / ${this.cfg.cooldownSec} giây`;
      return [];
    }
    this.lastGuessAt.set(user.id, t);
    const by = { id: user.id, name: user.name, avatar: user.avatar };

    if (isExact(word, this.secret, this.aliases)) return this.win(by, word);

    const existing = this.guesses.get(word);
    if (existing) {
      existing.count++;
      const fx = { type: 'wg_guess', word, score: existing.score, pending: existing.pending, by, dup: true };
      this.pushFeed(fx);
      return [fx];
    }
    const entry = { word, score: null, pending: true, by, at: t, count: 1, source: null };
    this.guesses.set(word, entry);
    const fx = { type: 'wg_guess', word, score: null, pending: true, by };
    this.pushFeed(fx);
    // chế độ thuộc tính: chờ tới lúc có thuộc tính của từ bí mật mới chấm
    if (this.mode !== 'attr' || this.roundAttrs) this.scoreGuess(entry);
    return [fx];
  }

  /** Chấm một từ đoán theo kiểu chơi của vòng (bất đồng bộ, phát 'effects' khi xong). */
  scoreGuess(entry) {
    const round = this.roundNo;
    const word = entry.word;
    const limited = this.scoredCount++ >= this.cfg.maxScoredPerRound;
    if (this.mode === 'attr') {
      const p = limited ? Promise.resolve(null) : this.attrStore.get(word);
      p.then((ga) => {
        if (round !== this.roundNo || this.mode !== 'attr') return;
        const cells = this.roundAttrs.map((id) => {
          const v = ga ? ga[id] ?? null : null;
          return { id, v, s: ga ? compareAttr(ATTR_BY_ID[id], this.secretAttrs[id], v) : 'na' };
        });
        const hits = cells.filter((c) => c.s === 'hit').length;
        const near = cells.filter((c) => c.s === 'near').length;
        entry.cells = cells; entry.hits = hits; entry.near = near;
        entry.score = hits; entry.pending = false; entry.source = ga ? 'attr' : 'limit';
        for (const f of this.feed) if (f.word === word) { f.score = hits; f.cells = cells; f.pending = false; }
        // ô xanh mới → thêm vào dòng "ĐÃ BIẾT"
        const learned = cells.filter((c) => c.s === 'hit' && !(c.id in this.known));
        for (const c of learned) this.known[c.id] = this.secretAttrs[c.id];
        this.dirty = true;
        const out = [{ type: 'wg_scored', mode: 'attr', word, score: hits, hits, near, cells, by: entry.by, source: entry.source }];
        if (learned.length) out.push({ type: 'wg_known', by: entry.by, word, learned: learned.map((c) => ({ id: c.id, icon: ATTR_BY_ID[c.id].icon, name: ATTR_BY_ID[c.id].name, v: this.secretAttrs[c.id] })) });
        this.emit('effects', out);
      }).catch((e) => console.warn('[wordgame] xếp thuộc tính lỗi:', e?.message || e));
      return;
    }
    const useScorer = limited ? null : this.scorer;
    const ctx = this.set?.scoreContext ? { id: this.activeSet, prompt: this.set.scoreContext } : null;
    const p = useScorer ? useScorer.score(this.secret, word, ctx) : Promise.resolve({ score: 1, source: 'limit' });
    p.then(({ score, source }) => {
      if (round !== this.roundNo) return; // vòng đã qua
      entry.score = score; entry.pending = false; entry.source = source;
      for (const f of this.feed) if (f.word === word) { f.score = score; f.pending = false; }
      this.dirty = true;
      this.emit('effects', [{ type: 'wg_scored', word, score, by: entry.by, source }]);
    }).catch((e) => console.warn('[wordgame] chấm lỗi:', e?.message || e));
  }

  /** Luật thả tim hiện tại: vòng tiếng Anh → mở thêm từ (hết 5 từ thì thôi); kiểu khác → lộ chữ cái. */
  likeRule() {
    const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);
    if (this.mode === 'english' && this.englishHints && this.hintLevel < this.maxHints && this.cfg.englishLikeEvery > 0) {
      return { id: 'likes', action: 'hint', icon: '❤️', every: this.cfg.englishLikeEvery, label: `${fmt(this.cfg.englishLikeEvery)} tim = thêm 1 từ 🇬🇧` };
    }
    if (this.mode === 'english') return null; // vòng tiếng Anh: tim chỉ mở thêm từ, không lộ chữ cái
    if (this.cfg.likeEvery > 0) return { id: 'likes', action: 'letter', icon: '❤️', every: this.cfg.likeEvery, label: `${fmt(this.cfg.likeEvery)} tim = 1 chữ` };
    return null;
  }

  get unlockRules() {
    const rules = this.cfg.giftUnlocks;
    if (Array.isArray(rules) && rules.length) return rules;
    return [{ id: 'hint', minDiamonds: this.cfg.giftHintMinDiamonds, action: 'hint', icon: '🎁', label: `${this.cfg.giftHintMinDiamonds} xu = gợi ý` }];
  }

  /** Luật cho món quà: theo tên trước, sau đó theo số xu (ngưỡng cao nhất đạt được). */
  matchUnlock(giftName, unitDiamonds, totalDiamonds) {
    const name = String(giftName || '').toLowerCase();
    const byName = this.unlockRules.find((r) => r.gifts?.some((g) => g.toLowerCase() === name));
    if (byName) return byName;
    let best = null;
    for (const r of this.unlockRules) {
      if (r.minDiamonds == null || r.gifts) continue;
      if (totalDiamonds >= r.minDiamonds && (!best || r.minDiamonds > best.minDiamonds)) best = r;
    }
    return best;
  }

  handleGift(ev) {
    const user = ev.user;
    const by = user ? { id: user.id, name: user.name, avatar: user.avatar } : null;
    const repeat = Math.max(1, ev.repeatCount | 0 || 1);
    const unit = Math.max(0, Number(ev.diamonds) || 0);
    const rule = this.matchUnlock(ev.giftName, unit, unit * repeat);
    if (!rule) return [];
    let times = 1;
    if (rule.every) {
      const cnt = (this.giftCounters[rule.id] || 0) + repeat;
      times = Math.floor(cnt / rule.every);
      this.giftCounters[rule.id] = cnt % rule.every;
      this.dirty = true;
      if (!times) return [{ type: 'wg_progress', rule: rule.id, icon: rule.icon, count: this.giftCounters[rule.id], every: rule.every, by, giftName: ev.giftName }];
    } else if (rule.action === 'letter') {
      times = repeat; // mỗi món một chữ
    }
    const out = [];
    for (let i = 0; i < Math.min(times, 5); i++) out.push(...this.applyUnlock(rule, by, ev.giftName, repeat));
    return out;
  }

  /** Danh sách vị trí chữ cái (bỏ khoảng trắng) theo từng tiếng. */
  letterSlots() {
    const slots = [];
    let idx = 0;
    this.secret.split(' ').forEach((syl, si) => { [...syl].forEach((ch, ci) => slots.push({ idx: idx++, si, ci, ch })); });
    return slots;
  }

  applyUnlock(rule, by, giftName, repeat) {
    const base = { type: 'wg_unlock', action: rule.action, icon: rule.icon, label: rule.label, by, giftName, repeat };
    if (rule.action === 'hint') {
      const fx = this.revealHint(by);
      return fx.length ? [{ ...base, hint: fx[0].hint }, ...fx] : [];
    }
    if (rule.action === 'time') {
      const add = (rule.seconds || 60) * 1000;
      this.endsAt = Math.min(this.endsAt + add, this.clock() + this.cfg.roundSeconds * 1000);
      this.dirty = true;
      return [{ ...base, seconds: rule.seconds || 60 }];
    }
    const slots = this.letterSlots();
    const hidden = slots.filter((s) => !this.revealedIdx.has(s.idx));
    if (hidden.length <= 1) return []; // luôn chừa ít nhất 1 chữ để còn phải đoán
    let pick = [];
    if (rule.action === 'syllable') {
      const sylls = [...new Set(hidden.map((s) => s.si))];
      const si = sylls[Math.floor(this.random() * sylls.length)];
      pick = hidden.filter((s) => s.si === si);
      if (pick.length >= hidden.length) pick = pick.slice(0, Math.max(1, Math.ceil(pick.length / 2)));
    } else {
      pick = [hidden[Math.floor(this.random() * hidden.length)]];
    }
    pick = pick.slice(0, hidden.length - 1);
    for (const s of pick) this.revealedIdx.add(s.idx);
    this.dirty = true;
    return [{ ...base, indexes: pick.map((s) => s.idx) }];
  }

  pushFeed(fx) {
    this.feed.unshift({ ...fx, at: this.clock() });
    this.feed.length = Math.min(this.feed.length, 8);
  }

  win(by, word) {
    this.phase = 'ended';
    this.winner = { ...by, word };
    const w = (this.wins[by.id] ||= { id: by.id, name: by.name, avatar: by.avatar, wins: 0 });
    w.wins++;
    if (by.name) w.name = by.name;
    if (by.avatar) w.avatar = by.avatar;
    this.guesses.set(this.secret, { word: this.secret, score: 100, pending: false, by, at: this.clock(), count: 1, source: 'exact' });
    // điểm tuần: đoán đúng càng sớm càng nhiều (+ điểm thưởng chia sẻ / quà đã tích)
    const total = Math.max(1, this.endsAt - this.startedAt);
    const points = this.weekly?.award(by, 1 - (this.clock() - this.startedAt) / total) || null;
    this.winner.points = points;
    // mức hiệu ứng: càng sớm / càng ít gợi ý càng hoành tráng
    const seconds = Math.round((this.clock() - this.startedAt) / 1000);
    const left = Math.max(0, Math.ceil((this.endsAt - this.clock()) / 1000));
    const tier = winTier({ seconds, left, hintLevel: this.hintLevel, flashSeconds: this.cfg.flashSeconds ?? 10, clutchSeconds: this.cfg.clutchSeconds ?? 10 });
    Object.assign(this.winner, { tier, seconds, left, hintLevel: this.hintLevel });
    this.nextAt = this.clock() + this.cfg.breakSeconds * 1000;
    this.dirty = true;
    const fx = [{ type: 'wg_win', round: this.roundNo, secret: this.secret, answer: this.display, by, points, seconds, left, hintLevel: this.hintLevel, tier }];
    // đấu đội: đội của người đoán trúng được điểm gốc + tốc độ (không tính thưởng cá nhân)
    const speed = points ? points.speed : Math.round(100 * Math.max(0, 1 - (this.clock() - this.startedAt) / total));
    const tp = this.teams.addPoints(by, (points ? points.base : 100) + speed, 'win');
    if (tp) { fx.push(tp); this.winner.team = tp.team; this.winner.teamPoints = tp.points; }
    fx.push(...this.teams.onRoundEnd());
    return fx;
  }

  /** Admin: đang chơi thì kết thúc vòng (lộ từ), đang nghỉ thì sang vòng mới. */
  skip() {
    if (this.phase === 'playing') { this.endsAt = this.clock(); return this.step(); }
    return this.startRound();
  }

  tick() {
    if (this.paused) return [];
    return this.step();
  }

  /** Một bước của đồng hồ (skip của admin vẫn chạy được khi đang tạm dừng). */
  step() {
    const t = this.clock();
    if (this.phase === 'playing') {
      if (t >= this.endsAt) {
        this.phase = 'ended';
        this.nextAt = t + this.cfg.breakSeconds * 1000;
        this.dirty = true;
        return [{ type: 'wg_timeout', round: this.roundNo, secret: this.secret, answer: this.display }, ...this.teams.onRoundEnd()];
      }
      const elapsed = (t - this.startedAt) / 1000;
      const due = this.hintSchedule().filter((s) => elapsed >= s).length;
      if (due > this.hintLevel) return this.revealHint(null);
      return [];
    }
    if (this.phase === 'ended' && t >= this.nextAt) return this.startRound();
    return [];
  }

  snapshot() {
    const t = this.clock();
    const ranked = [...this.guesses.values()]
      .filter((g) => !g.pending)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .sort((a, b) => (b.near || 0) - (a.near || 0)) // thuộc tính: cùng số ô xanh thì ô vàng nhiều hơn lên trước (sort ổn định)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((g) => ({ word: g.word, score: g.score, by: g.by, count: g.count, ...(g.cells ? { cells: g.cells, hits: g.hits, near: g.near } : {}) }));
    const ended = this.phase === 'ended';
    return {
      round: this.roundNo,
      phase: this.phase,
      paused: !!this.paused,
      pauseReason: this.pauseReason || null,
      remaining: Math.max(0, Math.ceil(((ended ? this.nextAt : this.endsAt) - t) / 1000)),
      // độ dài từng tiếng của từ bí mật (không lộ chữ), lộ hẳn khi hết vòng
      pattern: this.secret.split(' ').map((s) => [...s].length),
      // chữ cái đã lộ nhờ quà: mảng theo từng tiếng, null = còn ẩn
      letters: (() => {
        const out = this.secret.split(' ').map((s) => [...s].map(() => null));
        for (const s of this.letterSlots()) if (this.revealedIdx.has(s.idx)) out[s.si][s.ci] = s.ch;
        return out;
      })(),
      unlocks: [
        ...(this.likeRule() ? [(({ id, icon, label, every }) => ({ id, icon, label, every, count: Math.min(this.likeCount || 0, every) }))(this.likeRule())] : []),
        ...this.unlockRules.map((r) => ({ id: r.id, icon: r.icon, label: r.label, every: r.every || null, count: this.giftCounters[r.id] || 0 })),
      ],
      mode: this.mode,
      attrs: this.mode === 'attr' ? this.attrMeta() : null,
      // dòng "ĐÃ BIẾT": giá trị các thuộc tính đã đoán trúng (null = chưa biết); hết vòng thì lộ hết
      known: this.mode === 'attr' && this.roundAttrs ? this.roundAttrs.map((id) => (ended ? this.secretAttrs[id] : this.known[id]) ?? null) : null,
      secret: ended ? this.secret : null,
      answer: ended ? this.display : null, // tên hiển thị đầy đủ (vd "Kai'Sa")
      title: this.set?.title || 'Đoán từ',
      topic: this.set?.topic || null, // chủ đề của bộ (hiện trên màn hình nếu có)
      secretLabel: this.set?.secretLabel || 'TỪ BÍ MẬT',
      wordSet: this.activeSet,
      hints: this.hints(),
      hintLevel: this.hintLevel,
      nextHintIn: (() => {
        const sch = this.hintSchedule();
        return this.hintLevel < sch.length && !ended ? Math.max(0, Math.ceil(sch[this.hintLevel] - (t - this.startedAt) / 1000)) : null;
      })(),
      maxHints: this.maxHints,
      giftHintMinDiamonds: this.cfg.giftHintMinDiamonds,
      ranked,
      feed: this.feed.slice(0, 6),
      totalGuesses: this.guesses.size,
      winner: this.winner,
      weekly: this.weekly?.snapshot() || null,
      team: this.teams.snapshot(),
      champions: Object.values(this.wins).sort((a, b) => b.wins - a.wins).slice(0, 3),
    };
  }
}

makePausable(WordGame);

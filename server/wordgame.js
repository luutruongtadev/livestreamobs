import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ATTRS, ATTR_BY_ID, compareAttr, chooseAttrs, fullAttrs, LOCKED_ATTR } from './attributes.js';
import { canon, compact, isExact, containsAnswer } from './scorer.js';
import { buildPuzzle, letterKey, letterSet, splitWords, shuffle } from './giaima.js';
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

/** Cờ quốc gia (🇻🇳 🇰🇷…) trên Windows / OBS hiện thành chữ "VN", "KR" → đổi sang emoji thường. */
export const noFlags = (s) => String(s ?? '').replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, (f) => (f === '🇻🇳' ? '⭐' : '🌏'));

/** Gợi ý tiếng Anh: mô tả đầu tiên lên trước, "dịch từng chữ" (WBW:) làm gợi ý số 2. */
export function orderEnglish(h) {
  const list = (h || []).slice(0, 5);
  const i = list.findIndex((x) => String(x).startsWith('WBW:'));
  if (i < 0 || list.length < 2) return list;
  const [wbw] = list.splice(i, 1);
  list.splice(1, 0, wbw);
  return list;
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
  attrMaxNewPerRound: 150, // chế độ thuộc tính: tối đa N từ MỚI (chưa có trong cache) nhờ Claude xếp mỗi vòng
  // Kiểu chơi được bật, luân phiên lần lượt: 'meaning' (chấm gần nghĩa 1–100) · 'attr' (so 6 thuộc tính)
  // · 'english' (gợi ý bằng 5 từ tiếng Anh, chấm gần nghĩa)
  // · 'giaima' (câu bí ẩn mã bằng số, giải gợi ý tiếng Việt → đáp án Việt / Anh để lộ chữ; kho modewords/giaima.json, không tốn token)
  modes: ['meaning', 'attr', 'english', 'giaima'],
  alternateEvery: 2, // mỗi N vòng đổi kiểu
  likeEvery: 1000, // cả phòng thả đủ N tim → lộ 1 chữ cái (0 = tắt)
  englishFreeHints: 3, // chế độ tiếng Anh: hệ thống tự mở 3 gợi ý; gợi ý 4–5 phải mở bằng tim / quà
  englishLikeEvery: 2000,
  attrUnlockAfter: 10,
  giaimaRevealAt: [120, 180, 240], // kiểu Giải mã: hệ thống tự lộ 1 chữ ở các mốc giây này (thay cho gợi ý)
  giaima: { minClues: 4, maxClues: 6, leaveHidden: null, recentClues: 80 }, // chọn gợi ý; leaveHidden null = câu ≥ 9 chữ cái chừa 2–3 chữ không có trong gợi ý, câu ngắn chừa 1–2
  likeBonus: { every: 1000, points: 50 }, // 1 người thả đủ 1000 tim trong vòng mà đoán trúng → +50 điểm (đếm lại mỗi vòng)
  curatedRatio: 0.5, // kiểu Gần nghĩa: tỉ lệ vòng lấy từ kho chủ đề soạn sẵn (modewords/meaning.json); kho chung hết thì lấy hết kho này
  comboMax: 5, // đoán trúng N vòng liên tiếp → combo xN điểm thưởng của vòng (tối đa x5) // chế độ thuộc tính: cột "Chữ cái đầu" khoá, mở sau N từ đoán khác nhau // chế độ tiếng Anh: cả phòng thả đủ N tim → mở thêm 1 từ tiếng Anh (hết 5 từ thì quay về lộ chữ cái)
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
    this.streak = null; // chuỗi đoán trúng liên tiếp: { id, name, n, round }
    this.userLikes = new Map(); // tim của từng người trong vòng
    this.scoreDelays = []; // thời gian từ lúc nhận từ đoán tới lúc có điểm (ms), các từ gần đây
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
    this.gmPlayed = []; // kiểu Giải mã: câu đã chơi (không lặp tới khi hết kho)
    this.gmRecent = []; // kiểu Giải mã: gợi ý vừa dùng (tránh lặp)
    this.gm = null; // câu đố của vòng Giải mã đang chơi
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
      this.streak = s.streak || null;
      this.gmPlayed = Array.isArray(s.gmPlayed) ? s.gmPlayed : [];
      this.gmRecent = Array.isArray(s.gmRecent) ? s.gmRecent : [];
      if (s.settings) this.applySettings(s.settings);
      if (s.activeSet && (s.activeSet === 'tu-vung' || this.wordSets?.[s.activeSet])) this.activeSet = s.activeSet;
    } catch { /* chưa có */ }
  }

  save() {
    this.scorer?.saveCache?.();
    if (!this.statePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify({ wins: this.wins, roundNo: this.roundNo, recent: this.recent.slice(-30), activeSet: this.activeSet, priority: this.priority, team: this.teams.toJSON(), modeCounter: this.modeCounter, settings: this.settings(), streak: this.streak, gmPlayed: this.gmPlayed.slice(-500), gmRecent: this.gmRecent }));
    this.dirty = false;
  }

  settings() { return { modes: [...this.cfg.modes], alternateEvery: this.cfg.alternateEvery, likeEvery: this.cfg.likeEvery, englishLikeEvery: this.cfg.englishLikeEvery }; }

  /** Admin đổi kiểu chơi / số tim mở chữ (áp dụng từ vòng sau, riêng số tim áp dụng ngay). */
  applySettings({ modes, modeRotation, alternateEvery, likeEvery, englishLikeEvery } = {}) {
    // cấu hình cũ: modeRotation = 'alternate' | 'meaning' | 'attr'
    if (!modes && modeRotation) modes = modeRotation === 'alternate' ? ['meaning', 'attr'] : [modeRotation];
    if (Array.isArray(modes)) {
      const ok = ['meaning', 'attr', 'english', 'giaima'].filter((m) => modes.includes(m));
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
    // Giải mã: cần kho câu đố, chỉ chơi ở bộ từ vựng chung (bộ riêng như LMHT thì bỏ qua)
    const ok = (this.cfg.modes || ['meaning']).filter((m) => m === 'meaning' || (m === 'attr' && this.attrStore?.available) || (m === 'english' && this.englishStore?.available) || (m === 'giaima' && this.gmAvailable()));
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

  gmAvailable() { return !this.set && !!this.modeWords.giaima?.phrases?.length && !!this.modeWords.giaima?.clues?.length; }

  /** Kiểu Giải mã: bốc câu chưa chơi (đủ gợi ý) và dựng câu đố. Kho không dùng được → null (vòng chơi kiểu gần nghĩa). */
  pickPuzzle() {
    const bank = this.modeWords.giaima;
    if (!bank?.phrases?.length) return null;
    const c = this.cfg.giaima || {};
    const opts = { rng: this.random, recent: new Set(this.gmRecent), minClues: c.minClues ?? 4, maxClues: c.maxClues ?? 6, leaveHidden: c.leaveHidden || null };
    let left = bank.phrases.filter((p) => p?.text && !this.gmPlayed.includes(p.text));
    if (!left.length) { this.gmPlayed = []; left = bank.phrases.filter((p) => p?.text); }
    for (const p of shuffle(left, this.random)) {
      this.gmPlayed.push(p.text); // câu không đủ gợi ý cũng đánh dấu để khỏi thử lại
      const pz = buildPuzzle(p, bank.clues, opts);
      if (pz) {
        this.gmRecent = [...pz.clues.map((x) => compact(x.a)), ...this.gmRecent].slice(0, c.recentClues ?? 80);
        return pz;
      }
    }
    return null;
  }

  /** Số từ soạn sẵn còn lại / tổng cho từng chế độ (hiện ở admin). */
  modeWordStats() {
    const out = {};
    for (const [mode, list] of Object.entries(this.modeWords)) {
      if (!Array.isArray(list)) continue;
      const used = list.filter((w) => (this.wordBank?.isUsed ? this.wordBank.isUsed(w.word) : this.modeUsed.has(canon(w.word)))).length;
      out[mode] = { total: list.length, left: list.length - used };
    }
    const gp = this.modeWords.giaima?.phrases;
    if (Array.isArray(gp)) out.giaima = { total: gp.length, left: gp.filter((p) => !this.gmPlayed.includes(p.text)).length };
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
    // kiểu Gần nghĩa: trộn kho chủ đề soạn sẵn với kho chung; kho chung hết thì dùng hết kho soạn sẵn trước khi chơi lại
    if (mode === 'meaning' && this.modeWords.meaning?.length) {
      const bankLeft = this.wordBank ? this.wordBank.remaining() : 1;
      if (bankLeft === 0 || this.random() < (this.cfg.curatedRatio ?? 0.5)) {
        const w = this.pickModeWord('meaning');
        if (w) return w;
      }
    }
    if (this.wordBank) return this.wordBank.next(this.recent, { reserve: this.modeWordStats().meaning?.left || 0 });
    const words = this.cfg.words.filter((w) => w?.word);
    const fresh = words.filter((w) => !this.recent.includes(canon(w.word)));
    const pool = fresh.length ? fresh : words;
    return pool[Math.floor(this.random() * pool.length)];
  }

  startRound(word = null) {
    let mode = this.nextMode();
    // kiểu Giải mã: câu bí ẩn từ kho; admin đặt từ riêng (1 từ) thì vòng đó chơi gần nghĩa
    const puzzle = mode === 'giaima' && !word ? this.pickPuzzle() : null;
    if (mode === 'giaima' && !puzzle) mode = 'meaning';
    const w = puzzle ? { word: puzzle.phrase, hint: puzzle.kind } : word ? (typeof word === 'string' ? { word } : word) : this.pickWord(mode);
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
    this.userLikes = new Map();
    // kiểu chơi của vòng
    this.mode = mode;
    this.modeCounter++;
    this.roundAttrs = null; // 6 thuộc tính của vòng (id)
    this.secretAttrs = null;
    this.known = {}; // thuộc tính đã đoán trúng: id -> giá trị
    this.attrUnlocked = false; // cột khoá (chữ cái đầu) đã mở chưa
    this.englishHints = null;
    this.baseHints = null;
    this.gm = puzzle ? { ...puzzle, revealed: new Set(), clues: puzzle.clues.map((c) => ({ ...c, solvedBy: null, via: null, auto: false })) } : null;
    if (this.mode === 'attr') {
      // gợi ý "Chủ đề" trùng với thuộc tính Loại → bỏ
      if (this.customHints) this.customHints = this.customHints.filter((h) => !/^Chủ đề:/.test(h));
      if (w.attrs && typeof w.attrs === 'object') { // từ soạn sẵn: có thuộc tính luôn, không cần gọi Claude
        this.secretAttrs = fullAttrs(this.secret, w.attrs);
        this.roundAttrs = chooseAttrs(this.secretAttrs, this.random);
      } else this.loadSecretAttrs();
    } else if (this.mode === 'english') {
      // gợi ý chỉ bằng tiếng Anh (5 từ, mở dần); không có thì quay về gợi ý thường
      this.baseHints = this.customHints;
      this.customHints = null;
      if (Array.isArray(w.en) && w.en.length) this.englishHints = orderEnglish(w.en); // từ soạn sẵn
      else this.loadEnglishHints();
    }
    // chấm nhiều lớp: soạn sẵn Knowledge Pack của từ bí mật để phần lớn từ đoán có điểm ngay, không phải chờ Claude
    if (this.mode !== 'attr') Promise.resolve(this.scorer?.prepare?.(this.secret, this.scoreCtx())).catch(() => {});
    this.dirty = true;
    const st = this.activeStreak();
    return [{ type: 'wg_start', round: this.roundNo, mode: this.mode, ...(st ? { streak: st } : {}) }];
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
      this.secretAttrs = fullAttrs(this.secret, a);
      this.roundAttrs = chooseAttrs(this.secretAttrs, this.random);
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
      this.englishHints = orderEnglish(h);
      this.dirty = true;
      this.emit('effects', [{ type: 'wg_english', count: this.englishHints.length }]);
    }).catch(() => {});
  }

  /** Cột khoá còn đang khoá? (mở sau N từ đoán, hết vòng thì mở) */
  attrLocked(id) { return id === LOCKED_ATTR && !this.attrUnlocked && this.phase === 'playing'; }

  attrMeta() {
    return (this.roundAttrs || []).map((id) => ({
      id, icon: ATTR_BY_ID[id].icon, name: ATTR_BY_ID[id].name,
      ...(this.attrLocked(id) ? { locked: true, unlockIn: Math.max(0, this.cfg.attrUnlockAfter - this.guesses.size) } : {}),
    }));
  }

  /** Gợi ý theo mức: 1 = chủ đề, 2 = chữ cái đầu mỗi tiếng, 3 = lộ một tiếng. */
  get maxHints() {
    if (this.mode === 'giaima') return (this.cfg.giaimaRevealAt || []).length; // "gợi ý" = hệ thống tự lộ 1 chữ
    return this.mode === 'english' ? this.englishHints?.length || 5 : this.customHints?.length || 3;
  }

  /** Mốc giây tự mở gợi ý: dùng hintAtSeconds, nhiều gợi ý riêng thì rải đều trong vòng. */
  hintSchedule() {
    // chế độ tiếng Anh: chỉ tự mở 3 gợi ý đầu, 2 gợi ý cuối để cả phòng thả tim / tặng quà mở
    if (this.mode === 'giaima') return (this.cfg.giaimaRevealAt || []).slice();
    const n = this.mode === 'english' ? Math.min(this.maxHints, this.cfg.englishFreeHints) : this.maxHints;
    if (n <= this.cfg.hintAtSeconds.length) return this.cfg.hintAtSeconds.slice(0, n);
    const span = Math.max(60, this.cfg.roundSeconds - 40);
    return Array.from({ length: n }, (_, i) => Math.round(((i + 1) * span) / (n + 0.5)));
  }

  hints() {
    if (this.mode === 'giaima') return []; // gợi ý của Giải mã nằm ở bảng gợi ý (snapshot.gm)
    if (this.mode === 'english') return (this.englishHints || []).slice(0, this.hintLevel).map((h) => (String(h).startsWith('WBW:') ? `Dịch từng chữ: ${h.slice(4)}` : h));
    if (this.customHints) return this.customHints.slice(0, this.hintLevel).map(noFlags);
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
    if (this.mode === 'giaima') {
      // tới mốc giờ: tự lộ 1 chữ (không còn chữ để lộ thì vẫn tính đã qua mốc)
      this.hintLevel++;
      this.dirty = true;
      const { nums, autos } = this.gmRevealLetters(1);
      return nums.length ? [{ type: 'wg_hint', level: this.hintLevel, hint: `Lộ thêm số ${nums.join(', ')}`, by, gm: { nums } }, ...autos] : [];
    }
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
    // (chế độ tiếng Anh: đủ N tim → mở thêm 1 từ tiếng Anh, mở hết 5 từ thì quay về lộ chữ cái)
    // thưởng tim từng người: thả đủ 1000 tim trong vòng → đoán trúng +50 (chỉ vòng này)
    const lb = this.cfg.likeBonus || {};
    if (ev.type === 'like' && by && this.phase === 'playing' && !this.paused && lb.every > 0) {
      const before = this.userLikes.get(by.id) || 0;
      const after = before + Math.max(1, ev.count | 0 || 1);
      this.userLikes.set(by.id, after);
      if (before < lb.every && after >= lb.every) fx.push({ type: 'wg_like_bonus', by, likes: lb.every, points: lb.points });
    }
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
    if (containsAnswer(ev.text, this.secret, this.aliases) || isExact(parseGuess(ev.text, { ...this.cfg, maxGuessWords: 10, maxGuessChars: 60 }) || '', this.secret, this.aliases)) {
      this.lastGuessAt.set(user.id, this.clock());
      return this.win({ id: user.id, name: user.name, avatar: user.avatar }, this.secret);
    }
    if (this.mode === 'giaima' && this.gm) return this.gmComment({ id: user.id, name: user.name, avatar: user.avatar }, ev.text);
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
    // đủ N từ đoán → mở cột khoá
    if (this.mode === 'attr' && this.roundAttrs?.includes(LOCKED_ATTR) && !this.attrUnlocked && this.guesses.size >= this.cfg.attrUnlockAfter) {
      this.attrUnlocked = true;
      const a = ATTR_BY_ID[LOCKED_ATTR];
      if ([...this.guesses.values()].some((g) => g.cells?.some((c) => c.id === LOCKED_ATTR && c.s === 'hit'))) this.known[LOCKED_ATTR] = this.secretAttrs[LOCKED_ATTR];
      return [fx, { type: 'wg_attr_unlock', id: a.id, icon: a.icon, name: a.name, after: this.cfg.attrUnlockAfter }];
    }
    return [fx];
  }

  /** Chấm một từ đoán theo kiểu chơi của vòng (bất đồng bộ, phát 'effects' khi xong). */
  scoreGuess(entry) {
    const round = this.roundNo;
    const word = entry.word;
    // chế độ thuộc tính: từ đã có trong cache thì miễn phí; chỉ đếm từ mới phải nhờ Claude xếp
    const cachedAttr = this.mode === 'attr' && this.attrStore?.has?.(word);
    const limited = this.mode === 'attr'
      ? !cachedAttr && this.scoredCount++ >= (this.cfg.attrMaxNewPerRound ?? 150)
      : this.scoredCount++ >= this.cfg.maxScoredPerRound;
    if (this.mode === 'attr') {
      const p = limited ? Promise.resolve(null) : this.attrStore.get(word);
      p.then((ga) => {
        if (round !== this.roundNo || this.mode !== 'attr') return;
        if (!cachedAttr) this.noteScoreDelay(entry, 'claude');
        const all = fullAttrs(word, ga); // thuộc tính mặt chữ luôn tính được, kể cả khi Claude lỗi
        const cells = this.roundAttrs.map((id) => {
          const attr = ATTR_BY_ID[id];
          if (!ga && !attr.text) return { id, v: null, s: 'na' };
          const v = all[id] ?? null;
          const { s, dir } = compareAttr(attr, this.secretAttrs[id], v);
          return { id, v, s, ...(dir ? { dir } : {}) };
        });
        // cột đang khoá không tính vào điểm hiển thị (tránh lộ)
        const open = cells.filter((c) => !this.attrLocked(c.id));
        const hits = open.filter((c) => c.s === 'hit').length;
        const near = open.filter((c) => c.s === 'near' || c.s === 'part').length;
        entry.cells = cells; entry.hits = hits; entry.near = near;
        entry.score = hits; entry.pending = false; entry.source = ga ? 'attr' : 'limit';
        for (const f of this.feed) if (f.word === word) { f.score = hits; f.cells = cells; f.pending = false; }
        // ô xanh mới → thêm vào dòng "ĐÃ BIẾT"
        const learned = cells.filter((c) => c.s === 'hit' && !(c.id in this.known) && !this.attrLocked(c.id));
        for (const c of learned) this.known[c.id] = this.secretAttrs[c.id];
        this.dirty = true;
        const out = [{ type: 'wg_scored', mode: 'attr', word, score: hits, hits, near, cells, by: entry.by, source: entry.source }];
        if (learned.length) out.push({ type: 'wg_known', by: entry.by, word, learned: learned.map((c) => ({ id: c.id, icon: ATTR_BY_ID[c.id].icon, name: ATTR_BY_ID[c.id].name, v: this.secretAttrs[c.id] })) });
        this.emit('effects', out);
      }).catch((e) => console.warn('[wordgame] xếp thuộc tính lỗi:', e?.message || e));
      return;
    }
    const useScorer = limited ? null : this.scorer;
    const p = useScorer ? useScorer.score(this.secret, word, this.scoreCtx(), { aliases: this.aliases }) : Promise.resolve({ score: 1, source: 'limit' });
    p.then(({ score, source }) => {
      if (round !== this.roundNo) return; // vòng đã qua
      this.noteScoreDelay(entry, source);
      entry.score = score; entry.pending = false; entry.source = source;
      for (const f of this.feed) if (f.word === word) { f.score = score; f.pending = false; }
      this.dirty = true;
      this.emit('effects', [{ type: 'wg_scored', word, score, by: entry.by, source }]);
    }).catch((e) => console.warn('[wordgame] chấm lỗi:', e?.message || e));
  }

  /** Ngữ cảnh chấm điểm của bộ từ riêng (vd LMHT) — null với bộ từ vựng chung. */
  scoreCtx() { return this.set?.scoreContext ? { id: this.activeSet, prompt: this.set.scoreContext } : null; }

  /** Luật thả tim hiện tại: vòng tiếng Anh còn từ chưa mở → mở thêm từ; còn lại (mọi kiểu) → đủ likeEvery tim lộ 1 chữ cái. */
  likeRule() {
    const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);
    if (this.mode === 'english' && this.englishHints && this.hintLevel < this.maxHints && this.cfg.englishLikeEvery > 0) {
      return { id: 'likes', action: 'hint', icon: '❤️', every: this.cfg.englishLikeEvery, label: `${fmt(this.cfg.englishLikeEvery)} tim = thêm 1 từ tiếng Anh` };
    }
    if (this.cfg.likeEvery > 0) return { id: 'likes', action: 'letter', icon: '❤️', every: this.cfg.likeEvery, label: `${fmt(this.cfg.likeEvery)} tim = 1 chữ` };
    return null;
  }

  /** Nhãn quà theo kiểu chơi: vòng Giải mã thì "gợi ý" = giải hộ 1 gợi ý, "lộ 1 tiếng" = lộ 3 chữ. */
  unlockLabel(r) {
    if (this.mode !== 'giaima' || !this.gm) return r.label;
    if (r.action === 'syllable') return String(r.label || '').replace(/lộ (cả )?1 tiếng/i, 'lộ 3 chữ');
    if (r.action === 'hint') return String(r.label || '').replace(/= ?gợi ý/i, '= giải 1 gợi ý');
    return r.label;
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
    // quà combo tới từng phần (repeat = số món mới, streakTotal = tổng cả chuỗi): luật theo ngưỡng xu tính trên cả combo,
    // mở khi tổng vừa vượt lên mức của luật đó (không mở lại mỗi lần chuỗi cộng thêm)
    const total = unit * (ev.streakTotal ?? repeat);
    const rule = this.matchUnlock(ev.giftName, unit, total);
    if (!rule) return [];
    const before = ev.streakTotal != null ? unit * (ev.streakTotal - repeat) : 0;
    if (!rule.gifts && before > 0 && this.matchUnlock(ev.giftName, unit, before) === rule) return [];
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
    const base = { type: 'wg_unlock', action: rule.action, icon: rule.icon, label: this.unlockLabel(rule), by, giftName, repeat };
    // Giải mã: lộ chữ theo số (cả câu lẫn gợi ý); quà "gợi ý" = giải hộ 1 gợi ý; "lộ 1 tiếng" = lộ 3 chữ
    if (this.mode === 'giaima' && this.gm && rule.action !== 'time') {
      if (rule.action === 'hint') {
        const idx = this.gmClueForGift();
        if (idx >= 0) {
          const r = this.gmSolveClue(idx, by, 'gift');
          return [{ ...base, gm: { nums: r.nums, clue: { idx, answer: this.gm.clues[idx].a } } }, ...r.autos];
        }
      }
      const r = this.gmRevealLetters(rule.action === 'syllable' ? 3 : 1);
      return r.nums.length ? [{ ...base, gm: { nums: r.nums } }, ...r.autos] : [];
    }
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

  // ---------------- kiểu Giải mã ----------------
  gmHiddenLetters() { return Object.keys(this.gm.code).filter((l) => !this.gm.revealed.has(l)); }

  /** Lộ các chữ cái → gợi ý nào đủ chữ thì tự mở (không ai được tính). Trả về số vừa lộ + hiệu ứng. */
  gmOpen(letters) {
    const g = this.gm;
    const fresh = [...new Set(letters)].filter((l) => g.code[l] && !g.revealed.has(l));
    for (const l of fresh) g.revealed.add(l);
    const autos = [];
    g.clues.forEach((c, idx) => {
      if (c.solvedBy || c.auto) return;
      if ([...letterSet(c.a)].every((l) => g.revealed.has(l))) { c.auto = true; autos.push({ type: 'wg_gm_auto', idx }); }
    });
    if (fresh.length) this.dirty = true;
    return { nums: fresh.map((l) => g.code[l]), autos };
  }

  /** Lộ ngẫu nhiên count chữ, luôn chừa lại ít nhất 1 chữ; ưu tiên chữ không có trong gợi ý nào. */
  gmRevealLetters(count) {
    const nums = [], autos = [];
    for (let i = 0; i < count; i++) {
      const left = this.gmHiddenLetters();
      if (left.length <= 1) break;
      const pool = left.filter((l) => this.gm.hidden.includes(l));
      const from = pool.length && this.random() < 0.5 ? pool : left;
      const r = this.gmOpen([from[Math.floor(this.random() * from.length)]]);
      nums.push(...r.nums); autos.push(...r.autos);
    }
    return { nums, autos };
  }

  gmSolveClue(idx, by, via) {
    const c = this.gm.clues[idx];
    c.solvedBy = by ? { id: by.id, name: by.name, avatar: by.avatar || null } : null;
    c.via = via;
    this.dirty = true;
    return this.gmOpen([...letterSet(c.a)]);
  }

  /** Quà "gợi ý": giải hộ gợi ý mở nhiều chữ nhất mà vẫn chừa ít nhất 1 chữ. Không có → -1 (lộ 1 chữ thay thế). */
  gmClueForGift() {
    const hiddenN = this.gmHiddenLetters().length;
    const gain = (c) => [...letterSet(c.a)].filter((l) => !this.gm.revealed.has(l)).length;
    let best = -1, bestGain = -1;
    this.gm.clues.forEach((c, idx) => {
      if (c.solvedBy || c.auto) return;
      const g = gain(c);
      if (hiddenN - g >= 1 && g > bestGain) { best = idx; bestGain = g; }
    });
    return best;
  }

  /** Bình luận trong vòng Giải mã: đúng đáp án gợi ý → lộ chữ; còn lại hiện lên "vừa đoán" (không chấm điểm, không tốn token). */
  gmComment(by, text) {
    const t = String(text || '').normalize('NFC').trim();
    if (t.length <= 90 && !/https?:|www\./i.test(t)) {
      const idx = this.gm.clues.findIndex((c) => !c.solvedBy && !c.auto && (isExact(t, c.a, c.alt) || (compact(c.a).length >= 4 && containsAnswer(t, c.a, c.alt))));
      if (idx >= 0) {
        const r = this.gmSolveClue(idx, by, 'comment');
        return [{ type: 'wg_gm_clue', idx, by, answer: this.gm.clues[idx].a, lang: this.gm.clues[idx].lang, nums: r.nums }, ...r.autos];
      }
    }
    const word = parseGuess(t, this.cfg);
    if (!word) {
      this.lastReject = `Không tính: bình luận đáp án một gợi ý (tối đa ${this.cfg.maxGuessWords} tiếng) hoặc cả câu bí ẩn`;
      return [];
    }
    const now = this.clock();
    if (now - (this.lastGuessAt.get(by.id) ?? -Infinity) < this.cfg.cooldownSec * 1000) {
      this.lastReject = `Người này vừa đoán, mỗi người 1 từ / ${this.cfg.cooldownSec} giây`;
      return [];
    }
    this.lastGuessAt.set(by.id, now);
    const existing = this.guesses.get(word);
    if (existing) existing.count++;
    else this.guesses.set(word, { word, score: 0, pending: false, by, at: now, count: 1, source: 'gm' });
    const fx = { type: 'wg_guess', word, score: null, pending: false, by, gm: true, ...(existing ? { dup: true } : {}) };
    this.pushFeed(fx);
    return [fx];
  }

  /** Màn hình: câu bí ẩn + gợi ý dạng ô có số; chỉ gửi chữ đã lộ (hết vòng thì lộ hết). */
  gmSnapshot(ended) {
    const g = this.gm;
    const cells = (text) => splitWords(text).map((w) => w.map((ch) => {
      const k = letterKey(ch);
      return { n: g.code[k] || 0, ch: ended || g.revealed.has(k) ? ch.toUpperCase() : null };
    }));
    return {
      kind: g.kind,
      meaning: ended ? g.meaning : null,
      words: cells(g.phrase),
      // emoji minh hoạ hay lộ thẳng đáp án → chỉ hiện khi gợi ý đã giải / tự lộ, hoặc sau lần tự lộ chữ đầu tiên (thêm 1 nấc gợi ý)
      clues: g.clues.map((c) => ({ q: c.q, e: ended || c.solvedBy || c.auto || this.hintLevel >= 1 ? c.e : null, lang: c.lang, cells: cells(c.a), solvedBy: c.solvedBy ? { name: c.solvedBy.name, avatar: c.solvedBy.avatar } : null, via: c.via, auto: c.auto })),
      hiddenCount: ended ? 0 : this.gmHiddenLetters().length,
    };
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
    // chuỗi đoán trúng liên tiếp (vòng ngay trước cũng là người này) → combo
    const prev = this.streak;
    const n = prev && prev.id === by.id && prev.round === this.roundNo - 1 ? prev.n + 1 : 1;
    this.streak = { id: by.id, name: by.name, n, round: this.roundNo };
    const mult = n >= 2 ? Math.min(this.cfg.comboMax, n) : 1;
    // thả đủ tim trong vòng → thưởng thêm
    const lb = this.cfg.likeBonus || {};
    const likeBonus = lb.every > 0 && (this.userLikes.get(by.id) || 0) >= lb.every ? lb.points || 0 : 0;
    // điểm tuần: đoán đúng càng sớm càng nhiều (+ thưởng tim, combo, điểm thưởng chia sẻ / quà đã tích)
    const total = Math.max(1, this.endsAt - this.startedAt);
    const points = this.weekly?.award(by, 1 - (this.clock() - this.startedAt) / total, { likeBonus, mult }) || null;
    this.winner.points = points;
    // mức hiệu ứng: càng sớm / càng ít gợi ý càng hoành tráng
    const seconds = Math.round((this.clock() - this.startedAt) / 1000);
    const left = Math.max(0, Math.ceil((this.endsAt - this.clock()) / 1000));
    const tier = winTier({ seconds, left, hintLevel: this.hintLevel, flashSeconds: this.cfg.flashSeconds ?? 10, clutchSeconds: this.cfg.clutchSeconds ?? 10 });
    Object.assign(this.winner, { tier, seconds, left, hintLevel: this.hintLevel });
    this.nextAt = this.clock() + this.cfg.breakSeconds * 1000;
    this.dirty = true;
    const fx = [{ type: 'wg_win', round: this.roundNo, secret: this.secret, answer: this.display, by, points, seconds, left, hintLevel: this.hintLevel, tier, ...(mult > 1 ? { combo: { n, mult } } : {}) }];
    // đấu đội: đội của người đoán trúng được điểm gốc + tốc độ (không tính thưởng cá nhân)
    const speed = points ? points.speed : Math.round(100 * Math.max(0, 1 - (this.clock() - this.startedAt) / total));
    const tp = this.teams.addPoints(by, (points ? points.base : 100) + speed, 'win');
    if (tp) { fx.push(tp); this.winner.team = tp.team; this.winner.teamPoints = tp.points; }
    fx.push(...this.teams.onRoundEnd());
    return fx;
  }

  /** Ghi thời gian chấm điểm (chỉ từ phải chấm mới — lấy từ cache thì gần như tức thì). */
  noteScoreDelay(entry, source) {
    if (['cache', 'dict', 'fuzzy', 'limit'].includes(source)) return; // có điểm ngay, không tính vào độ trễ chấm
    this.scoreDelays.push(Math.max(0, this.clock() - entry.at));
    if (this.scoreDelays.length > 30) this.scoreDelays.shift();
  }

  scoreDelayStats() {
    const d = this.scoreDelays;
    if (!d.length) return null;
    return { avg: Math.round(d.reduce((a, b) => a + b, 0) / d.length), max: Math.max(...d), n: d.length };
  }

  /** Chuỗi đang sống: người thắng vòng ngay trước (hoặc vòng này) — vòng nào không thắng là đứt. */
  activeStreak() {
    const s = this.streak;
    if (!s || !(s.round === this.roundNo || s.round === this.roundNo - 1)) return null;
    const next = s.round === this.roundNo ? s.n : s.n + 1; // trúng tiếp vòng này thì được combo bao nhiêu
    return { id: s.id, name: s.name, n: s.n, nextMult: Math.min(this.cfg.comboMax, next) };
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
        ...this.unlockRules.map((r) => ({ id: r.id, icon: r.icon, label: this.unlockLabel(r), every: r.every || null, count: this.giftCounters[r.id] || 0 })),
      ],
      mode: this.mode,
      attrs: this.mode === 'attr' ? this.attrMeta() : null,
      gm: this.mode === 'giaima' && this.gm ? this.gmSnapshot(ended) : null,
      // dòng "ĐÃ BIẾT": giá trị các thuộc tính đã đoán trúng (null = chưa biết); hết vòng thì lộ hết
      streak: this.activeStreak(),
      known: this.mode === 'attr' && this.roundAttrs ? this.roundAttrs.map((id) => (ended ? this.secretAttrs[id] : this.attrLocked(id) ? null : this.known[id]) ?? null) : null,
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

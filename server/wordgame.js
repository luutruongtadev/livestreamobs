import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { canon, isExact } from './scorer.js';
import { makePausable } from './pause.js';

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
  constructor(config = {}, { scorer, now = () => Date.now(), statePath = null, random = Math.random, wordBank = null, wordSets = {} } = {}) {
    super();
    // Bộ từ: { id: { title, secretLabel, scoreContext, words: [{ word, hint?, hints?, aliases? }] } }
    // Bộ "tu-vung" (mặc định) dùng kho từ do Claude sinh + config.words.
    this.wordSets = wordSets;
    this.activeSet = config.activeSet && (config.activeSet === 'tu-vung' || wordSets[config.activeSet]) ? config.activeSet : 'tu-vung';
    this.wordBank = wordBank; // kho từ do Claude sinh (tuỳ chọn)
    this.cfg = { ...WG_DEFAULTS, ...config };
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
      if (s.activeSet && (s.activeSet === 'tu-vung' || this.wordSets?.[s.activeSet])) this.activeSet = s.activeSet;
    } catch { /* chưa có */ }
  }

  save() {
    this.scorer?.saveCache?.();
    if (!this.statePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify({ wins: this.wins, roundNo: this.roundNo, recent: this.recent.slice(-30), activeSet: this.activeSet, priority: this.priority }));
    this.dirty = false;
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

  pickWord() {
    if (this.priority?.length) { this.dirty = true; return this.priority.shift(); }
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
    const w = word ? (typeof word === 'string' ? { word } : word) : this.pickWord();
    this.roundNo++;
    this.phase = 'playing';
    this.display = String(w.word).trim(); // tên hiển thị khi lộ đáp án (vd "Kai'Sa")
    this.secret = toSecret(w.word);
    this.category = w.hint || '';
    // gợi ý riêng của từ: bộ LMHT… (hints), hoặc từ vựng có 2 câu mô tả + 3 emoji (desc, emoji)
    this.customHints = Array.isArray(w.hints) ? w.hints.filter(Boolean)
      : Array.isArray(w.desc) && w.desc.length ? [...w.desc.filter(Boolean).slice(0, 2), ...(w.emoji ? [w.emoji] : [])]
      : null;
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
    this.dirty = true;
    return [{ type: 'wg_start', round: this.roundNo }];
  }

  /** Gợi ý theo mức: 1 = chủ đề, 2 = chữ cái đầu mỗi tiếng, 3 = lộ một tiếng. */
  get maxHints() { return this.customHints?.length || 3; }

  /** Mốc giây tự mở gợi ý: dùng hintAtSeconds, nhiều gợi ý riêng thì rải đều trong vòng. */
  hintSchedule() {
    const n = this.maxHints;
    if (n <= this.cfg.hintAtSeconds.length) return this.cfg.hintAtSeconds.slice(0, n);
    const span = Math.max(60, this.cfg.roundSeconds - 40);
    return Array.from({ length: n }, (_, i) => Math.round(((i + 1) * span) / (n + 0.5)));
  }

  hints() {
    if (this.customHints) return this.customHints.slice(0, this.hintLevel);
    const out = [];
    const syl = this.secret.split(' ');
    if (this.hintLevel >= 1 && this.category) out.push(`Chủ đề: ${this.category}`);
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
    const fx = this.handleEvent(ev);
    // ai tặng quà cũng được cảm ơn đích danh (kể cả lúc nghỉ giữa vòng / tạm dừng)
    if (ev.type === 'gift' && ev.user?.id) {
      const repeat = Math.max(1, ev.repeatCount | 0 || 1);
      const unit = Math.max(0, Number(ev.diamonds) || 0);
      fx.push({ type: 'wg_thanks', by: { id: ev.user.id, name: ev.user.name, avatar: ev.user.avatar }, giftName: ev.giftName || 'quà', giftImage: ev.giftImage || null, repeat, diamonds: unit * repeat });
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
    const round = this.roundNo;
    const useScorer = this.scoredCount++ < this.cfg.maxScoredPerRound ? this.scorer : null;
    const ctx = this.set?.scoreContext ? { id: this.activeSet, prompt: this.set.scoreContext } : null;
    const p = useScorer ? useScorer.score(this.secret, word, ctx) : Promise.resolve({ score: 1, source: 'limit' });
    p.then(({ score, source }) => {
      if (round !== this.roundNo) return; // vòng đã qua
      entry.score = score; entry.pending = false; entry.source = source;
      for (const f of this.feed) if (f.word === word) { f.score = score; f.pending = false; }
      this.dirty = true;
      this.emit('effects', [{ type: 'wg_scored', word, score, by: entry.by, source }]);
    }).catch((e) => console.warn('[wordgame] chấm lỗi:', e?.message || e));
    return [fx];
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
    this.nextAt = this.clock() + this.cfg.breakSeconds * 1000;
    this.dirty = true;
    return [{ type: 'wg_win', round: this.roundNo, secret: this.secret, answer: this.display, by, seconds: Math.round((this.clock() - this.startedAt) / 1000) }];
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
        return [{ type: 'wg_timeout', round: this.roundNo, secret: this.secret, answer: this.display }];
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
      .slice(0, 10)
      .map((g) => ({ word: g.word, score: g.score, by: g.by, count: g.count }));
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
      unlocks: this.unlockRules.map((r) => ({ id: r.id, icon: r.icon, label: r.label, every: r.every || null, count: this.giftCounters[r.id] || 0 })),
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
      champions: Object.values(this.wins).sort((a, b) => b.wins - a.wins).slice(0, 3),
    };
  }
}

makePausable(WordGame);

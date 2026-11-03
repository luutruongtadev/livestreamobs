import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { canon, isExact } from './scorer.js';

export const WG_DEFAULTS = {
  roundSeconds: 300,
  breakSeconds: 12,
  hintAtSeconds: [60, 150, 230], // tự mở gợi ý theo thời gian
  giftHintMinDiamonds: 10, // tặng từ N xu thì mở gợi ý tiếp theo
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
  constructor(config = {}, { scorer, now = () => Date.now(), statePath = null, random = Math.random } = {}) {
    super();
    this.cfg = { ...WG_DEFAULTS, ...config };
    this.scorer = scorer;
    this.now = now;
    this.random = random;
    this.statePath = statePath;
    this.wins = {}; // id -> { id, name, avatar, wins }
    this.roundNo = 0;
    this.recent = []; // các từ bí mật gần đây, tránh lặp
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
    } catch { /* chưa có */ }
  }

  save() {
    this.scorer?.saveCache?.();
    if (!this.statePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify({ wins: this.wins, roundNo: this.roundNo, recent: this.recent.slice(-30) }));
    this.dirty = false;
  }

  resetAll() {
    this.wins = {};
    this.roundNo = 0;
    this.dirty = true;
    return this.startRound();
  }

  pickWord() {
    const words = this.cfg.words.filter((w) => w?.word);
    const fresh = words.filter((w) => !this.recent.includes(canon(w.word)));
    const pool = fresh.length ? fresh : words;
    return pool[Math.floor(this.random() * pool.length)];
  }

  startRound(word = null) {
    const w = word ? (typeof word === 'string' ? { word } : word) : this.pickWord();
    this.roundNo++;
    this.phase = 'playing';
    this.secret = canon(w.word);
    this.category = w.hint || '';
    this.hintLevel = 0;
    this.startedAt = this.now();
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
  hints() {
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
    if (this.phase !== 'playing' || this.hintLevel >= 3) return [];
    this.hintLevel++;
    this.dirty = true;
    return [{ type: 'wg_hint', level: this.hintLevel, hint: this.hints().at(-1), by }];
  }

  handle(ev) {
    if (this.phase !== 'playing') return [];
    const user = ev.user;
    if (ev.type === 'gift') {
      const diamonds = Math.max(0, Number(ev.diamonds) || 0) * Math.max(1, ev.repeatCount | 0 || 1);
      if (diamonds >= this.cfg.giftHintMinDiamonds) return this.revealHint(user ? { id: user.id, name: user.name, avatar: user.avatar } : null);
      return [];
    }
    if (ev.type !== 'comment' || !user?.id) return [];
    const word = parseGuess(ev.text, this.cfg);
    if (!word) return [];
    const t = this.now();
    if (t - (this.lastGuessAt.get(user.id) ?? -Infinity) < this.cfg.cooldownSec * 1000) return [];
    this.lastGuessAt.set(user.id, t);
    const by = { id: user.id, name: user.name, avatar: user.avatar };

    if (isExact(word, this.secret)) return this.win(by, word);

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
    const p = useScorer ? useScorer.score(this.secret, word) : Promise.resolve({ score: 1, source: 'limit' });
    p.then(({ score, source }) => {
      if (round !== this.roundNo) return; // vòng đã qua
      entry.score = score; entry.pending = false; entry.source = source;
      for (const f of this.feed) if (f.word === word) { f.score = score; f.pending = false; }
      this.dirty = true;
      this.emit('effects', [{ type: 'wg_scored', word, score, by: entry.by, source }]);
    }).catch((e) => console.warn('[wordgame] chấm lỗi:', e?.message || e));
    return [fx];
  }

  pushFeed(fx) {
    this.feed.unshift({ ...fx, at: this.now() });
    this.feed.length = Math.min(this.feed.length, 8);
  }

  win(by, word) {
    this.phase = 'ended';
    this.winner = { ...by, word };
    const w = (this.wins[by.id] ||= { id: by.id, name: by.name, avatar: by.avatar, wins: 0 });
    w.wins++;
    if (by.name) w.name = by.name;
    if (by.avatar) w.avatar = by.avatar;
    this.guesses.set(this.secret, { word: this.secret, score: 100, pending: false, by, at: this.now(), count: 1, source: 'exact' });
    this.nextAt = this.now() + this.cfg.breakSeconds * 1000;
    this.dirty = true;
    return [{ type: 'wg_win', round: this.roundNo, secret: this.secret, by, seconds: Math.round((this.now() - this.startedAt) / 1000) }];
  }

  /** Admin: đang chơi thì kết thúc vòng (lộ từ), đang nghỉ thì sang vòng mới. */
  skip() {
    if (this.phase === 'playing') { this.endsAt = this.now(); return this.tick(); }
    return this.startRound();
  }

  tick() {
    const t = this.now();
    if (this.phase === 'playing') {
      if (t >= this.endsAt) {
        this.phase = 'ended';
        this.nextAt = t + this.cfg.breakSeconds * 1000;
        this.dirty = true;
        return [{ type: 'wg_timeout', round: this.roundNo, secret: this.secret }];
      }
      const elapsed = (t - this.startedAt) / 1000;
      const due = this.cfg.hintAtSeconds.filter((s) => elapsed >= s).length;
      if (due > this.hintLevel) return this.revealHint(null);
      return [];
    }
    if (this.phase === 'ended' && t >= this.nextAt) return this.startRound();
    return [];
  }

  snapshot() {
    const t = this.now();
    const ranked = [...this.guesses.values()]
      .filter((g) => !g.pending)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, 10)
      .map((g) => ({ word: g.word, score: g.score, by: g.by, count: g.count }));
    const ended = this.phase === 'ended';
    return {
      round: this.roundNo,
      phase: this.phase,
      remaining: Math.max(0, Math.ceil(((ended ? this.nextAt : this.endsAt) - t) / 1000)),
      // độ dài từng tiếng của từ bí mật (không lộ chữ), lộ hẳn khi hết vòng
      pattern: this.secret.split(' ').map((s) => s.length),
      secret: ended ? this.secret : null,
      hints: this.hints(),
      hintLevel: this.hintLevel,
      nextHintIn: this.hintLevel < this.cfg.hintAtSeconds.length && !ended
        ? Math.max(0, Math.ceil(this.cfg.hintAtSeconds[this.hintLevel] - (t - this.startedAt) / 1000)) : null,
      giftHintMinDiamonds: this.cfg.giftHintMinDiamonds,
      ranked,
      feed: this.feed.slice(0, 6),
      totalGuesses: this.guesses.size,
      winner: this.winner,
      champions: Object.values(this.wins).sort((a, b) => b.wins - a.wins).slice(0, 3),
    };
  }
}


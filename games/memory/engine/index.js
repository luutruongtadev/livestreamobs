import { Emitter, makePausable, digitsOf, triggerText, triggerIcon } from '#sdk';

/**
 * Nhớ số: dãy số hiện trong thời gian ngắn rồi ẩn → người xem gõ lại vào bình luận.
 * Vòng: show (hiện số) → answer (ẩn số, nhận câu trả lời) → reveal (lộ đáp án, ai đúng) → vòng sau.
 * Có người đúng → lên cấp; sai liên tiếp failsToLevelDown vòng → xuống 1 cấp (khiên chặn được 1 lần).
 * Mỗi người 1 lần trả lời / vòng; trả lời càng nhanh càng nhiều điểm; đúng nhiều vòng liền → thưởng chuỗi.
 */
export function createGame(ctx) { return new MemoryGame(ctx); }

const pub = (u) => ({ id: String(u.id), name: String(u.name || 'Ẩn danh').slice(0, 40), avatar: u.avatar || null });
const MAX_SHIELDS = 3;

export class MemoryGame extends Emitter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    this.s = ctx.settings;
    this.now = ctx.now;
    this.level = this.s.startLevel;
    this.round = 0;
    this.fails = 0;
    this.shields = 0;
    this.board = {}; // id → { id, name, avatar, points, correct, streak, best }
    this.bestLevel = this.level;
    this.last = null; // kết quả vòng trước { round, number, correct, level, levelChange, shielded }
    this.startRound();
  }

  digitsForLevel(level) { return Math.min(this.s.maxDigits, this.s.startDigits + Math.floor((level - 1) / this.s.levelsPerDigit)); }
  showMs(n) { return Math.max(500, Math.round((this.s.memoryMsPer4Digits * n) / 4)); }
  /** Số chữ số tối đa được lộ bằng quà mỗi vòng: 1/3 dãy (luôn chừa phần lớn cho người chơi nhớ). */
  maxPeek() { return Math.max(1, Math.floor(this.number.length / 3)); }

  startRound() {
    const n = this.digitsForLevel(this.level);
    let num = String(1 + Math.floor(this.ctx.random() * 9)); // không bắt đầu bằng 0
    while (num.length < n) num += String(Math.floor(this.ctx.random() * 10));
    this.round++;
    this.number = num;
    this.phase = 'show';
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.showMs(n);
    this.answerFrom = null;
    this.flashUntil = null;
    this.flashUsed = false;
    this.extra = 0;
    this.peek = []; // vị trí chữ số đã lộ nhờ quà
    this.answered = {}; // id → true
    this.correct = []; // [{ id, name, avatar, points, ms, streak }]
    this.wrong = 0;
    this.recent = []; // hoạt động gần nhất (không lộ số đã gõ): [{ name, avatar, ok }]
    return [{ type: 'mm_show', round: this.round, level: this.level, digits: n }];
  }

  /** Sang pha tiếp theo. */
  advance() {
    const t = this.clock();
    if (this.phase === 'show') {
      this.phase = 'answer';
      this.answerFrom = t;
      this.endsAt = t + this.s.answerSeconds * 1000;
      return [{ type: 'mm_hide', round: this.round }];
    }
    if (this.phase === 'answer') {
      this.phase = 'reveal';
      this.endsAt = t + this.s.revealSeconds * 1000;
      const ok = this.correct.length > 0;
      const from = this.level;
      let shielded = false;
      if (ok) { this.level++; this.fails = 0; } else if (++this.fails >= this.s.failsToLevelDown) {
        if (this.shields > 0 && this.level > 1) { this.shields--; shielded = true; this.fails = 0; } // khiên giữ cấp
        else { this.level = Math.max(1, this.level - 1); this.fails = 0; }
      }
      // chuỗi cá nhân: ai không đúng vòng này thì mất chuỗi
      const hit = new Set(this.correct.map((c) => c.id));
      for (const b of Object.values(this.board)) if (!hit.has(b.id)) b.streak = 0;
      const record = this.level > this.bestLevel;
      this.bestLevel = Math.max(this.bestLevel, this.level);
      this.last = { round: this.round, number: this.number, correct: this.correct.length, level: from, levelChange: Math.sign(this.level - from), shielded };
      this.ctx.report?.round?.({ round: this.round, level: from, number: this.number, correct: this.correct.length, wrong: this.wrong, winners: this.correct.slice(0, 3).map((c) => c.id) });
      const out = [{ type: 'mm_reveal', round: this.round, number: this.number, correct: this.correct.length, wrong: this.wrong, level: this.level, levelChange: Math.sign(this.level - from), shielded, record }];
      if (shielded) out.push({ type: 'mm_shield_used', left: this.shields });
      return out;
    }
    return this.startRound();
  }

  tick() {
    if (this.paused) return [];
    return this.clock() >= this.endsAt ? this.advance() : [];
  }

  handle(ev) {
    if (this.paused || this.phase !== 'answer' || ev?.type !== 'comment' || !ev.user?.id) return [];
    const text = String(ev.text ?? '');
    if (/\p{L}/u.test(text)) return []; // có chữ cái → không phải câu trả lời (vd "đội 2")
    const d = digitsOf(text);
    if (!d) return [];
    const id = String(ev.user.id);
    if (this.answered[id]) return [];
    this.answered[id] = true;
    const by = pub(ev.user);
    const ok = d === this.number;
    this.recent.unshift({ name: by.name, avatar: by.avatar, ok });
    if (this.recent.length > 6) this.recent.length = 6;
    const b = (this.board[id] ||= { ...by, points: 0, correct: 0, streak: 0, best: 0 });
    Object.assign(b, by);
    if (!ok) { this.wrong++; b.streak = 0; return [{ type: 'mm_wrong', by }]; }
    const t = this.clock();
    const total = Math.max(1, this.endsAt - this.answerFrom);
    const left = Math.max(0, this.endsAt - t) / total;
    const streak = (b.streak || 0) + 1;
    // nhanh: 50–100% điểm gốc · chuỗi: +10% mỗi vòng đúng liền (tối đa +100%) · lộ chữ số bằng quà: −15% mỗi chữ
    const mult = (1 + Math.min(10, streak - 1) * 0.1) * Math.max(0.4, 1 - 0.15 * this.peek.length);
    const points = Math.round(this.s.basePoints * (0.5 + 0.5 * Math.min(1, left)) * mult);
    const ms = t - this.answerFrom;
    this.correct.push({ ...by, points, ms, streak });
    Object.assign(b, { points: b.points + points, correct: b.correct + 1, streak, best: Math.max(b.best || 0, streak) });
    this.ctx.report?.points?.(by, points);
    return [{ type: 'mm_correct', by, points, rank: this.correct.length, ms, streak }];
  }

  action(id) {
    if (this.paused) return false;
    const t = this.clock();
    if (id === 'shield') { // tích khiên bất kỳ lúc nào
      if (this.shields >= MAX_SHIELDS) return false;
      this.shields++;
      return [{ type: 'mm_shield', shields: this.shields }];
    }
    if (this.phase !== 'answer') return false;
    if (id === 'flash') {
      if (this.flashUsed) return false;
      this.flashUsed = true;
      this.flashUntil = t + this.showMs(this.number.length);
      return [{ type: 'mm_flash', ms: this.flashUntil - t }];
    }
    if (id === 'time') {
      const add = Math.min(this.s.extraSeconds, this.s.maxExtraSeconds - this.extra);
      if (add <= 0) return false;
      this.extra += add;
      this.endsAt += add * 1000;
      return [{ type: 'mm_time', seconds: add, total: this.extra }];
    }
    if (id === 'digit') {
      if (this.peek.length >= this.maxPeek()) return false;
      const hidden = [...this.number].map((_, i) => i).filter((i) => !this.peek.includes(i));
      const pos = hidden[Math.floor(this.ctx.random() * hidden.length)];
      this.peek.push(pos);
      return [{ type: 'mm_digit', pos, left: this.maxPeek() - this.peek.length }];
    }
    return [];
  }

  command(id) {
    if (id === 'next') return this.advance();
    if (id === 'restart') { this.level = this.s.startLevel; this.fails = 0; return this.startRound(); }
    if (id === 'clear-board') { this.board = {}; return [{ type: 'mm_board_cleared' }]; }
    return [];
  }

  onResume(d) { if (typeof this.flashUntil === 'number') this.flashUntil += d; if (typeof this.answerFrom === 'number') this.answerFrom += d; }

  snapshot() {
    const t = this.clock();
    const showing = this.phase === 'show' || this.phase === 'reveal' || (this.flashUntil != null && t < this.flashUntil);
    const phaseMs = this.phase === 'answer' ? this.endsAt - this.answerFrom : this.endsAt - (this.phase === 'show' ? this.startedAt : this.endsAt - this.s.revealSeconds * 1000);
    return {
      round: this.round,
      level: this.level,
      digits: this.number.length,
      phase: this.phase,
      paused: !!this.paused,
      number: showing ? this.number : null,
      // pha trả lời: chữ số đã lộ nhờ quà, '?' = còn ẩn
      partial: !showing && this.peek.length ? [...this.number].map((c, i) => (this.peek.includes(i) ? c : '?')).join('') : null,
      flashing: this.phase === 'answer' && showing,
      remainingMs: Math.max(0, this.endsAt - t),
      phaseMs: Math.max(1, phaseMs),
      flashUsed: this.flashUsed,
      peekLeft: this.phase === 'answer' ? this.maxPeek() - this.peek.length : 0,
      extra: this.extra,
      shields: this.shields,
      answered: Object.keys(this.answered).length,
      correct: this.correct.slice(0, 10),
      wrong: this.wrong,
      board: this.s.showLeaderboard ? Object.values(this.board).filter((b) => b.points > 0).sort((a, b) => b.points - a.points || b.correct - a.correct).slice(0, 5) : [],
      recent: this.recent,
      last: this.last,
      bestLevel: this.bestLevel,
      fails: this.fails,
      failsToLevelDown: this.s.failsToLevelDown,
      // bảng "quà → tác dụng" lấy từ trigger streamer gán trên dashboard
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), every: b.every, count: b.every ? Math.min(b.count, b.every) : 0 })),
    };
  }

  serialize() {
    return {
      level: this.level, round: this.round, fails: this.fails, shields: this.shields, board: this.board, number: this.number, phase: this.phase,
      startedAt: this.startedAt, endsAt: this.endsAt, answerFrom: this.answerFrom, flashUntil: this.flashUntil, flashUsed: this.flashUsed,
      extra: this.extra, peek: this.peek, answered: this.answered, correct: this.correct, wrong: this.wrong,
      recent: this.recent, last: this.last, bestLevel: this.bestLevel,
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !/^\d+$/.test(String(s.number || ''))) return;
    const keys = Object.keys(this.serialize());
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of keys) if (k in copy) this[k] = copy[k];
    if (!Array.isArray(this.peek)) this.peek = [];
    this.shields = Math.max(0, Math.min(MAX_SHIELDS, Number(this.shields) || 0));
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(MemoryGame);

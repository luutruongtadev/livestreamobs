import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { normalize } from './text.js';
import { compact, isExact, containsAnswer } from './scorer.js';
import { makePausable } from './pause.js';

/**
 * Game "Giải mã" (/giaima): câu bí ẩn tiếng Việt (tục ngữ, ca dao, câu nói hay…), mỗi chữ cái là một ô lục giác có số.
 * - Mỗi số luôn là đúng một chữ cái trong cả vòng (mã hoá theo chữ gốc bỏ dấu: Ă / Â / Á… = A, Đ = D); ô lộ ra thì hiện đúng chữ có dấu.
 * - Bên dưới là các gợi ý: câu hỏi luôn tiếng Việt, đáp án tiếng Việt hoặc tiếng Anh, cũng mã bằng số.
 * - Người xem bình luận đáp án gợi ý → lộ các chữ đó ở mọi ô cùng số; bình luận cả câu bí ẩn → thắng vòng.
 * - Mỗi vòng server tự chọn 4–6 gợi ý trong kho (modewords/giaima.json) có chữ cái nằm trong câu, che gần hết câu, chừa 1–2 chữ để tự suy.
 * Không gọi Claude, không tốn token.
 */
export const GIAIMA_DEFAULTS = {
  roundSeconds: 300,
  breakSeconds: 14,
  autoRevealAt: [150, 210, 260], // giây kể từ đầu vòng: hệ thống tự lộ 1 chữ
  minClues: 4,
  maxClues: 6,
  leaveHidden: [1, 2], // số chữ cái của câu KHÔNG có trong gợi ý nào (người xem tự suy / quà mở)
  cooldownMs: 1500, // mỗi người hiện 1 lượt đoán sai / 1,5 giây trên dải bình luận
  likeEvery: 1000, // cả phòng thả đủ N tim → lộ 1 chữ
  cluePoints: 10, // điểm bảng "cao thủ hôm nay": giải 1 gợi ý
  phrasePoints: 100, // giải cả câu
  recentClues: 80, // không lặp lại gợi ý trong N gợi ý gần nhất
  gifts: [
    { id: 'rose', gifts: ['Rose', 'TikTok', 'Heart Me', 'Ice Cream Cone'], every: 5, action: 'letter', icon: '🌹', label: '5 Hoa hồng = 1 chữ' },
    { id: 'heart', gifts: ['Finger Heart'], action: 'letter', icon: '🫰', label: 'Tim tay = 1 chữ' },
    { id: 'clue', minDiamonds: 10, action: 'clue', icon: '🎁', label: '10 xu = giải 1 gợi ý' },
    { id: 'time', minDiamonds: 30, action: 'time', seconds: 60, icon: '🍩', label: '30 xu = +60 giây' },
    { id: 'letters', minDiamonds: 99, action: 'letter', count: 3, icon: '💎', label: '99 xu = lộ 3 chữ' },
  ],
};

/** Chữ cái gốc (A–Z, viết hoa) của 1 ký tự tiếng Việt / tiếng Anh; không phải chữ cái → null. */
export function letterKey(ch) {
  const n = normalize(ch);
  return /^[a-z]$/.test(n) ? n.toUpperCase() : null;
}

/** Tập chữ cái gốc của một chuỗi. */
export const letterSet = (s) => new Set([...String(s).normalize('NFC')].map(letterKey).filter(Boolean));

/** Tách câu thành các từ, mỗi từ là danh sách ký tự (giữ dấu, bỏ dấu câu). */
export function splitWords(s) {
  return String(s).normalize('NFC').split(/\s+/).map((w) => [...w].filter((c) => letterKey(c))).filter((w) => w.length);
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Chọn gợi ý cho một câu: chữ cái của gợi ý phải nằm trong câu, mỗi gợi ý mở thêm chữ mới,
 * che gần hết câu (chừa leaveHidden chữ), ưu tiên trộn cả tiếng Việt lẫn tiếng Anh, tránh gợi ý vừa dùng.
 * Trả về { clues, hidden } hoặc null nếu kho không đủ gợi ý cho câu này.
 */
export function pickClues(phrase, bank, { rng = Math.random, recent = new Set(), minClues = 4, maxClues = 6, leaveHidden = [1, 2], trials = 160 } = {}) {
  const L = letterSet(phrase);
  const words = new Set(normalize(phrase).split(' '));
  const seen = new Set();
  const cands = [];
  for (const c of bank) {
    const key = compact(c.a);
    if (!key || seen.has(key)) continue;
    const ls = letterSet(c.a);
    if (![...ls].every((x) => L.has(x))) continue;
    if (normalize(c.a) === normalize(phrase)) continue;
    seen.add(key);
    cands.push({ ...c, letters: ls, key, inPhrase: words.has(normalize(c.a)) });
  }
  const [hMin, hMax] = Array.isArray(leaveHidden) ? leaveHidden : [leaveHidden, leaveHidden];
  let best = null;
  for (let t = 0; t < trials; t++) {
    const pool = shuffle(cands, rng);
    const chosen = [];
    const covered = new Set();
    const want = hMin + Math.floor(rng() * (hMax - hMin + 1)); // số chữ để trống lần thử này
    while (chosen.length < maxClues && L.size - covered.size > want) {
      let pick = null, pickScore = -Infinity;
      for (const c of pool) {
        if (chosen.includes(c)) continue;
        const gain = [...c.letters].filter((x) => !covered.has(x)).length;
        if (!gain || L.size - covered.size - gain < want) continue; // không mở quá số chữ cần chừa
        const langs = new Set(chosen.map((x) => x.lang));
        // mỗi gợi ý mở vừa phải (2–3 chữ mới) để có 4–5 gợi ý như ô chữ thật, không để 1 từ dài mở gần hết câu
        let s = Math.min(gain, 3) * 10 - Math.max(0, gain - 4) * 6;
        if (!langs.has(c.lang)) s += 6; // trộn tiếng Việt + tiếng Anh
        if (recent.has(c.key)) s -= 25;
        if (c.inPhrase) s -= 8; // gợi ý trùng hẳn 1 từ trong câu: dễ quá
        if (c.key.length < 3) s -= 6;
        s += rng() * 6;
        if (s > pickScore) { pickScore = s; pick = c; }
      }
      if (!pick) break;
      chosen.push(pick);
      for (const x of pick.letters) covered.add(x);
    }
    const hidden = [...L].filter((x) => !covered.has(x));
    let score = 0;
    if (hidden.length < hMin || hidden.length > hMax) score -= 40 * Math.min(Math.abs(hidden.length - hMin), Math.abs(hidden.length - hMax));
    if (chosen.length < minClues) score -= 15 * (minClues - chosen.length);
    if (new Set(chosen.map((x) => x.lang)).size > 1) score += 8;
    score -= chosen.filter((x) => recent.has(x.key)).length * 12;
    score -= Math.abs(chosen.length - 5) * 6;
    score += rng();
    if (!best || score > best.score) best = { score, chosen, hidden };
  }
  if (!best || best.chosen.length < Math.min(minClues, 2) || best.hidden.length > hMax + 2) return null;
  // xếp gợi ý: đáp án ngắn trước cho dễ vào game
  const clues = best.chosen.sort((a, b) => a.key.length - b.key.length).map(({ q, a, e, lang, alt }) => ({ q, a, e: e || '❓', lang: lang === 'en' ? 'en' : 'vi', alt: alt || [] }));
  return { clues, hidden: best.hidden };
}

const pub = (u) => (u ? { id: u.id, name: u.name, avatar: u.avatar || null } : null);
const DEFAULT_BANK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'modewords', 'giaima.json');
const vnDay = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);

export class GiaiMaGame extends EventEmitter {
  constructor(config = {}, { bank = null, bankPath = DEFAULT_BANK, filePath = null, weekly = null, now = () => Date.now(), rng = Math.random, log = console } = {}) {
    super();
    this.cfg = { ...GIAIMA_DEFAULTS, ...config };
    this.now = now;
    this.rng = rng;
    this.log = log;
    this.weekly = weekly;
    this.filePath = filePath;
    const b = bank || JSON.parse(fs.readFileSync(bankPath, 'utf8'));
    this.phrases = (b.phrases || []).filter((p) => p?.text && letterSet(p.text).size >= 3);
    this.bank = (b.clues || []).filter((c) => c?.q && c?.a);
    this.active = false;
    this.paused = false;
    this.pausedAt = null;
    this.pauseReason = null;
    this.round = null; // vòng đang chơi
    this.roundNo = 0;
    this.phase = 'idle'; // idle | playing | break
    this.played = []; // câu đã chơi (không lặp tới khi hết kho)
    this.recent = []; // gợi ý vừa dùng
    this.scores = { day: vnDay(now()), users: {} }; // bảng "cao thủ hôm nay"
    this.lastGuessAt = new Map();
    this.likeCount = 0;
    this.giftCounters = {};
    this.dirty = false;
    this.load();
  }

  // ---------------- lưu / nạp ----------------
  load() {
    if (!this.filePath) return;
    try {
      const d = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.active = !!d.active;
      this.played = Array.isArray(d.played) ? d.played : [];
      this.recent = Array.isArray(d.recent) ? d.recent : [];
      this.roundNo = d.roundNo | 0;
      if (d.scores?.users) this.scores = d.scores;
      // vòng đang dở: chơi tiếp với thời gian còn lại lúc lưu
      if (d.round?.phrase && d.phase === 'playing' && d.leftMs > 5000) {
        const t = this.now();
        this.round = d.round;
        this.round.revealed = new Set(d.round.revealed || []);
        this.startedAt = t - (d.elapsedMs || 0);
        this.endsAt = t + d.leftMs;
        this.phase = 'playing';
        this.likeCount = d.likeCount | 0;
        this.giftCounters = d.giftCounters || {};
      }
    } catch { /* chưa có */ }
  }

  save() {
    if (!this.filePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const t = this.clock();
    const r = this.round ? { ...this.round, revealed: [...this.round.revealed] } : null;
    fs.writeFileSync(this.filePath, JSON.stringify({
      active: this.active, played: this.played.slice(-500), recent: this.recent, roundNo: this.roundNo, scores: this.scores,
      phase: this.phase, round: r, elapsedMs: this.startedAt ? t - this.startedAt : 0, leftMs: this.endsAt ? this.endsAt - t : 0,
      likeCount: this.likeCount, giftCounters: this.giftCounters,
    }));
    this.dirty = false;
  }

  setActive(on) {
    this.active = !!on;
    this.dirty = true;
    return this.active;
  }

  fx(effects) { if (effects.length) this.emit('effects', effects); }

  // ---------------- vòng chơi ----------------
  /** Bắt đầu vòng mới (phraseText: admin chọn câu, để trống = bốc câu chưa chơi). */
  startRound(phraseText = null) {
    let phrase = null;
    if (phraseText) {
      const want = compact(phraseText);
      phrase = this.phrases.find((p) => compact(p.text) === want) || { text: String(phraseText).trim().replace(/\s+/g, ' '), kind: 'Câu bí ẩn', meaning: '' };
    }
    let built = null;
    const recent = new Set(this.recent);
    const opts = { rng: this.rng, recent, minClues: this.cfg.minClues, maxClues: this.cfg.maxClues, leaveHidden: this.cfg.leaveHidden };
    if (phrase) {
      built = pickClues(phrase.text, this.bank, opts);
      if (!built) throw new Error('Kho gợi ý không đủ chữ cho câu này — thử câu khác hoặc thêm gợi ý vào modewords/giaima.json');
    } else {
      let left = this.phrases.filter((p) => !this.played.includes(p.text));
      if (!left.length) { this.played = []; left = [...this.phrases]; }
      for (const p of shuffle(left, this.rng)) {
        built = pickClues(p.text, this.bank, opts);
        if (built) { phrase = p; break; }
        this.played.push(p.text); // câu không đủ gợi ý: bỏ qua
      }
      if (!phrase) throw new Error('Kho câu đố trống');
    }
    // gán số ngẫu nhiên 1..n cho các chữ cái của câu
    const letters = shuffle([...letterSet(phrase.text)], this.rng);
    const code = Object.fromEntries(letters.map((l, i) => [l, i + 1]));
    this.round = { phrase: phrase.text, kind: phrase.kind || 'Câu bí ẩn', meaning: phrase.meaning || '', code, revealed: new Set(), hidden: built.hidden,
      clues: built.clues.map((c) => ({ ...c, solvedBy: null, auto: false })), autoDone: 0, winner: null };
    this.played.push(phrase.text);
    this.recent = [...built.clues.map((c) => compact(c.a)), ...this.recent].slice(0, this.cfg.recentClues);
    this.roundNo++;
    const t = this.clock();
    this.startedAt = t;
    this.endsAt = t + this.cfg.roundSeconds * 1000;
    this.nextAt = null;
    this.phase = 'playing';
    this.likeCount = 0;
    this.giftCounters = {};
    this.dirty = true;
    return [{ type: 'gm_round', round: this.roundNo, kind: this.round.kind, clues: this.round.clues.length }];
  }

  skip() { return this.endRound('skip'); }

  remaining() { return this.phase === 'playing' ? Math.max(0, Math.ceil((this.endsAt - this.clock()) / 1000)) : 0; }

  /** Gọi đều đặn (250ms). */
  tick() {
    if (!this.active || this.paused) return [];
    const t = this.clock();
    if (this.phase === 'idle' || (this.phase === 'break' && t >= this.nextAt)) {
      try { return this.startRound(); } catch (e) { this.log.warn?.('[giaima]', e.message); return []; }
    }
    if (this.phase !== 'playing') return [];
    if (t >= this.endsAt) return this.endRound('timeout');
    const el = (t - this.startedAt) / 1000;
    const at = this.cfg.autoRevealAt || [];
    if (this.round.autoDone < at.length && el >= at[this.round.autoDone]) {
      this.round.autoDone++;
      this.dirty = true;
      return this.revealLetters(1, null, { reason: 'auto', icon: '⏳' });
    }
    return [];
  }

  endRound(reason) {
    if (this.phase !== 'playing') {
      if (reason === 'skip') { this.phase = 'idle'; return []; }
      return [];
    }
    const r = this.round;
    for (const l of Object.keys(r.code)) r.revealed.add(l);
    this.phase = 'break';
    this.nextAt = this.clock() + (reason === 'skip' ? 1500 : this.cfg.breakSeconds * 1000);
    this.dirty = true;
    return [{ type: 'gm_end', reason, phrase: r.phrase, meaning: r.meaning, kind: r.kind }];
  }

  // ---------------- mở chữ ----------------
  /** Chữ chưa lộ. */
  hiddenLetters() { return Object.keys(this.round.code).filter((l) => !this.round.revealed.has(l)); }

  /** Lộ các chữ cái (letters) → cập nhật gợi ý đã đủ chữ (tự mở, không tính điểm). */
  openLetters(letters) {
    const r = this.round;
    const fresh = letters.filter((l) => r.code[l] && !r.revealed.has(l));
    for (const l of fresh) r.revealed.add(l);
    const out = [];
    r.clues.forEach((c, idx) => {
      if (c.solvedBy || c.auto) return;
      if ([...letterSet(c.a)].every((l) => r.revealed.has(l))) { c.auto = true; out.push({ type: 'gm_clue_auto', idx }); }
    });
    if (fresh.length) this.dirty = true;
    return { fresh, out };
  }

  /** Lộ ngẫu nhiên count chữ (quà / tim / hết giờ), luôn chừa lại ít nhất 1 chữ. */
  revealLetters(count, by, { reason, icon, giftName } = {}) {
    const out = [];
    const got = [];
    for (let i = 0; i < count; i++) {
      const left = this.hiddenLetters();
      if (left.length <= 1) break;
      // ưu tiên chữ không có trong gợi ý nào (không thì người xem tự giải gợi ý cũng ra)
      const pool = left.filter((l) => this.round.hidden.includes(l));
      const pickFrom = pool.length && this.rng() < 0.5 ? pool : left;
      const l = pickFrom[Math.floor(this.rng() * pickFrom.length)];
      const { fresh, out: autos } = this.openLetters([l]);
      got.push(...fresh);
      out.push(...autos);
    }
    if (!got.length) return [];
    return [{ type: 'gm_letter', nums: got.map((l) => this.round.code[l]), by: pub(by), reason, icon, giftName }, ...out];
  }

  // ---------------- sự kiện TikTok ----------------
  handle(ev) {
    const by = ev.user?.id ? pub(ev.user) : null;
    const fx = [];
    if (ev.type === 'gift' && by) {
      const repeat = Math.max(1, ev.repeatCount | 0 || 1);
      const unit = Math.max(0, Number(ev.diamonds) || 0);
      const bonus = this.weekly?.addBonus(by, { diamonds: unit * repeat }) || { add: 0, total: 0 };
      fx.push({ type: 'gm_thanks', by, giftName: ev.giftName || 'quà', giftImage: ev.giftImage || null, repeat, diamonds: unit * repeat, bonusAdd: bonus.add });
      if (this.canPlay()) fx.push(...this.handleGift(by, ev, unit, repeat));
      return fx;
    }
    if (!this.canPlay()) return fx;
    if (ev.type === 'comment' && by) return this.handleComment(by, ev.text);
    if (ev.type === 'like') return this.handleLike(Math.max(1, ev.count | 0 || 1));
    return fx;
  }

  canPlay() { return this.active && !this.paused && this.phase === 'playing' && !!this.round; }

  handleComment(by, text) {
    if (!this.canPlay()) return [];
    const t = String(text || '').normalize('NFC').trim();
    if (!t || t.length > 90 || /https?:|www\./i.test(t)) return [];
    const r = this.round;
    // cả câu bí ẩn → thắng
    if (compact(t) === compact(r.phrase) || containsAnswer(t, r.phrase)) return this.win(by);
    // đáp án một gợi ý
    const idx = r.clues.findIndex((c) => !c.solvedBy && !c.auto && (isExact(t, c.a, c.alt) || (compact(c.a).length >= 4 && containsAnswer(t, c.a, c.alt))));
    if (idx >= 0) return this.solveClue(idx, by, 'comment');
    // đoán sai: hiện lên dải bình luận (giãn cách mỗi người)
    if (!/\p{L}/u.test(t) || t.length > 40) return [];
    const now = this.clock();
    if (now - (this.lastGuessAt.get(by.id) ?? -Infinity) < this.cfg.cooldownMs) return [];
    this.lastGuessAt.set(by.id, now);
    return [{ type: 'gm_guess', by, text: t.slice(0, 40) }];
  }

  addScore(by, { keys = 0, wins = 0 } = {}) {
    const day = vnDay(this.now());
    if (this.scores.day !== day) this.scores = { day, users: {} };
    const s = (this.scores.users[by.id] ||= { ...pub(by), keys: 0, wins: 0, points: 0 });
    s.keys += keys; s.wins += wins;
    s.points += keys * this.cfg.cluePoints + wins * this.cfg.phrasePoints;
    if (by.name) s.name = by.name;
    if (by.avatar) s.avatar = by.avatar;
    this.dirty = true;
  }

  solveClue(idx, by, via) {
    const r = this.round;
    const c = r.clues[idx];
    c.solvedBy = pub(by) || { id: 'room', name: 'Cả phòng' };
    c.via = via;
    const { fresh, out } = this.openLetters([...letterSet(c.a)]);
    if (by && via === 'comment') this.addScore(by, { keys: 1 });
    this.dirty = true;
    return [{ type: 'gm_clue', idx, by: pub(by), answer: c.a, lang: c.lang, nums: fresh.map((l) => r.code[l]), via }, ...out];
  }

  win(by) {
    const r = this.round;
    const t = this.clock();
    const seconds = Math.round((t - this.startedAt) / 1000);
    const ratio = Math.max(0, (this.endsAt - t) / (this.cfg.roundSeconds * 1000));
    const shownBefore = Object.keys(r.code).filter((l) => r.revealed.has(l)).length;
    const total = Object.keys(r.code).length;
    r.winner = { ...pub(by), seconds };
    this.addScore(by, { wins: 1 });
    const award = this.weekly ? this.weekly.award(by, Math.min(1, ratio)) : null;
    const end = this.endRound('win');
    return [{ type: 'gm_win', by: pub(by), phrase: r.phrase, meaning: r.meaning, kind: r.kind, seconds, shown: shownBefore, total, award }, ...end];
  }

  handleLike(count) {
    if (!(this.cfg.likeEvery > 0)) return [];
    this.likeCount += count;
    this.dirty = true;
    const out = [];
    while (this.likeCount >= this.cfg.likeEvery) {
      const got = this.revealLetters(1, null, { reason: 'like', icon: '❤️' });
      if (!got.length) { this.likeCount = this.cfg.likeEvery - 1; break; }
      this.likeCount -= this.cfg.likeEvery;
      out.push(...got);
    }
    return out;
  }

  /** Luật cho món quà: theo tên trước, sau đó theo số xu (ngưỡng cao nhất đạt được). */
  matchGift(giftName, totalDiamonds) {
    const name = String(giftName || '').toLowerCase();
    const rules = this.cfg.gifts || [];
    const byName = rules.find((r) => r.gifts?.some((g) => g.toLowerCase() === name));
    if (byName) return byName;
    let best = null;
    for (const r of rules) {
      if (r.minDiamonds == null || r.gifts) continue;
      if (totalDiamonds >= r.minDiamonds && (!best || r.minDiamonds > best.minDiamonds)) best = r;
    }
    return best;
  }

  handleGift(by, ev, unit, repeat) {
    const rule = this.matchGift(ev.giftName, unit * repeat);
    if (!rule) return [];
    let times = 1;
    if (rule.every) {
      const cnt = (this.giftCounters[rule.id] || 0) + repeat;
      times = Math.floor(cnt / rule.every);
      this.giftCounters[rule.id] = cnt % rule.every;
      this.dirty = true;
      if (!times) return [{ type: 'gm_progress', rule: rule.id, icon: rule.icon, count: this.giftCounters[rule.id], every: rule.every, by }];
    } else if (rule.action === 'letter' && rule.gifts) times = repeat; // mỗi món 1 chữ
    times = Math.min(times, 5);
    const base = { reason: 'gift', icon: rule.icon, giftName: ev.giftName };
    if (rule.action === 'letter') return this.revealLetters(times * (rule.count || 1), by, base);
    if (rule.action === 'time') {
      this.endsAt += (rule.seconds || 60) * 1000 * times;
      this.dirty = true;
      return [{ type: 'gm_time', by, seconds: (rule.seconds || 60) * times, icon: rule.icon }];
    }
    if (rule.action === 'clue') {
      const out = [];
      for (let i = 0; i < times; i++) {
        const left = this.round.clues.map((c, idx) => (!c.solvedBy && !c.auto ? idx : -1)).filter((x) => x >= 0);
        if (!left.length) { out.push(...this.revealLetters(1, by, base)); continue; }
        // mở gợi ý có nhiều chữ chưa lộ nhất, nhưng không mở hết câu
        const gain = (idx) => [...letterSet(this.round.clues[idx].a)].filter((l) => !this.round.revealed.has(l)).length;
        const ok = left.filter((idx) => this.hiddenLetters().length - gain(idx) >= 1).sort((a, b) => gain(b) - gain(a));
        if (!ok.length) { out.push(...this.revealLetters(1, by, base)); continue; }
        out.push(...this.solveClue(ok[0], by, 'gift'));
      }
      return out;
    }
    return [];
  }

  // ---------------- cho màn hình / admin ----------------
  cellsOf(text) {
    const r = this.round;
    const show = (ch) => r.revealed.has(letterKey(ch));
    return splitWords(text).map((w) => w.map((ch) => ({ n: r.code[letterKey(ch)] || 0, ch: show(ch) ? ch.toUpperCase() : null })));
  }

  board(n = 5) {
    if (this.scores.day !== vnDay(this.now())) return [];
    return Object.values(this.scores.users).sort((a, b) => b.points - a.points || b.wins - a.wins).slice(0, n)
      .map((s) => ({ name: s.name, avatar: s.avatar, points: s.points, wins: s.wins, keys: s.keys }));
  }

  snapshot() {
    const r = this.round;
    const base = {
      active: this.active, phase: this.phase, paused: this.paused, pauseReason: this.pauseReason, round: this.roundNo,
      remaining: this.remaining(), total: this.cfg.roundSeconds, nextIn: this.phase === 'break' ? Math.max(0, Math.ceil((this.nextAt - this.clock()) / 1000)) : 0, likeCount: this.likeCount, likeEvery: this.cfg.likeEvery,
      gifts: (this.cfg.gifts || []).map((g) => ({ id: g.id, icon: g.icon, label: g.label, every: g.every || 0, count: this.giftCounters[g.id] || 0 })),
      board: this.board(), phrases: this.phrases.length, played: this.played.length,
    };
    if (!r) return base;
    return {
      ...base,
      kind: r.kind,
      words: this.cellsOf(r.phrase),
      clues: r.clues.map((c) => ({ q: c.q, e: c.e, lang: c.lang, cells: this.cellsOf(c.a), solvedBy: c.solvedBy ? { name: c.solvedBy.name, avatar: c.solvedBy.avatar } : null, via: c.via || null, auto: c.auto })),
      hiddenCount: this.hiddenLetters().length,
      winner: r.winner,
      ...(this.phase === 'break' ? { answer: { phrase: r.phrase, meaning: r.meaning, kind: r.kind } } : {}),
    };
  }

  /** Admin: thêm đáp án. */
  adminSnapshot() {
    const r = this.round;
    return { ...this.snapshot(), secret: r ? { phrase: r.phrase, clues: r.clues.map((c) => c.a), hidden: r.hidden, code: r.code } : null };
  }
}
makePausable(GiaiMaGame);

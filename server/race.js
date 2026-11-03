import fs from 'node:fs';
import path from 'node:path';
import { normalize } from './text.js';
import { makePausable } from './pause.js';

export const ANIMALS = [
  { id: 'ngua', emoji: '🐎', name: 'Ngựa', color: '#e0392b' },
  { id: 'rua', emoji: '🐢', name: 'Rùa', color: '#16a34a' },
  { id: 'tho', emoji: '🐇', name: 'Thỏ', color: '#f472b6' },
  { id: 'ga', emoji: '🐓', name: 'Gà', color: '#f59e0b' },
  { id: 'heo', emoji: '🐖', name: 'Heo', color: '#fb7185' },
  { id: 'cho', emoji: '🐕', name: 'Chó', color: '#a16207' },
  { id: 'meo', emoji: '🐈', name: 'Mèo', color: '#8b5cf6' },
  { id: 'vit', emoji: '🦆', name: 'Vịt', color: '#0ea5e9' },
  { id: 'de', emoji: '🐐', name: 'Dê', color: '#64748b' },
  { id: 'khi', emoji: '🐒', name: 'Khỉ', color: '#b45309' },
  { id: 'bo', emoji: '🐄', name: 'Bò', color: '#475569' },
  { id: 'voi', emoji: '🐘', name: 'Voi', color: '#6366f1' },
];

export const RACE_DEFAULTS = {
  maxRacers: 6,
  minRacers: 2,
  joinKeywords: ['ok', 'oke', 'okay', 'oki', 'okie', 'okela'],
  lobbySeconds: 45, // thời gian đăng ký (comment OK)
  fullStartSeconds: 5, // đủ người thì xuất phát sau ngần này giây
  countdownSeconds: 4,
  raceSeconds: 90, // hết giờ thì con dẫn đầu thắng
  breakSeconds: 12,
  track: 1000, // chiều dài đường đua (đơn vị)
  baseSpeed: 6, // đơn vị / giây khi không ai làm gì (≈ không bao giờ tự về đích)
  dashSpeed: 260, // tốc độ "xả" lượng tăng tốc tích luỹ, đơn vị / giây
  boost: {
    comment: 14, // người đua tự bình luận
    commentCooldownSec: 1,
    cheer: 8, // khán giả gõ số làn / tên con vật để cổ vũ
    cheerCooldownSec: 2,
    like: 2, // mỗi tim
    maxLikePerEvent: 30,
    share: 40,
    follow: 60,
    perDiamond: 12,
    maxGift: 320, // một món quà đẩy tối đa ~1/3 đường
  },
  banana: { minDiamonds: 30, stunSeconds: 2.5 }, // quà ≥ 30 xu: ném chuối vào con dẫn đầu (không phải con mình)
  queueMax: 12, // đăng ký trước cho vòng sau khi đang đua
};

const pub = (u) => ({ id: u.id, name: u.name, avatar: u.avatar || null });

/**
 * Đua thú: comment OK để nhận một con vật (tối đa 6 con / vòng).
 * Người đua bình luận / thả tim / tặng quà để con mình chạy; khán giả gõ số làn để cổ vũ.
 * Pha: lobby → countdown → racing → ended → lobby…
 */
export class Race {
  constructor(config = {}, { statePath, now = () => Date.now(), random = Math.random } = {}) {
    this.cfg = {
      ...RACE_DEFAULTS,
      ...config,
      boost: { ...RACE_DEFAULTS.boost, ...(config.boost || {}) },
      banana: { ...RACE_DEFAULTS.banana, ...(config.banana || {}) },
    };
    this.cfg.maxRacers = Math.max(2, Math.min(6, this.cfg.maxRacers | 0 || 6));
    this.joinWords = new Set(this.cfg.joinKeywords.map(normalize));
    this.now = now;
    this.random = random;
    this.statePath = statePath;
    this.stats = {}; // id -> { id, name, avatar, wins, podiums, races }
    this.roundNo = 0;
    this.queue = [];
    this.load();
    this.newLobby();
  }

  load() {
    if (!this.statePath) return;
    try {
      const s = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      this.stats = s.stats || {};
      this.roundNo = s.roundNo || 0;
    } catch { /* chưa có */ }
  }

  save() {
    if (!this.statePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify({ stats: this.stats, roundNo: this.roundNo }));
    this.dirty = false;
  }

  resetAll() {
    this.stats = {};
    this.roundNo = 0;
    this.queue = [];
    this.dirty = true;
    return this.newLobby();
  }

  // ---------------- pha ----------------
  newLobby() {
    this.roundNo++;
    this.phase = 'lobby';
    this.racers = [];
    this.endsAt = this.clock() + this.cfg.lobbySeconds * 1000;
    this.startedAt = null;
    this.lastTickAt = null;
    this.podium = null;
    this.supporters = new Map(); // khán giả id -> làn đang cổ vũ
    this.lastAct = new Map(); // id -> thời điểm bình luận tính điểm gần nhất
    this.dirty = true;
    const fx = [{ type: 'race_lobby', round: this.roundNo }];
    // người đã đăng ký trước được vào luôn
    const q = this.queue.splice(0);
    for (const u of q) if (this.racers.length < this.cfg.maxRacers) fx.push(...this.addRacer(u, true));
    this.queue = q.filter((u) => !this.racerOf(u.id)).slice(0, this.cfg.queueMax);
    return fx;
  }

  startCountdown() {
    this.phase = 'countdown';
    this.endsAt = this.clock() + this.cfg.countdownSeconds * 1000;
    this.dirty = true;
    return [{ type: 'race_countdown', seconds: this.cfg.countdownSeconds, racers: this.racers.length }];
  }

  go() {
    this.phase = 'racing';
    this.startedAt = this.lastTickAt = this.clock();
    this.endsAt = this.startedAt + this.cfg.raceSeconds * 1000;
    this.dirty = true;
    return [{ type: 'race_go' }];
  }

  finish(reason) {
    const order = [...this.racers].sort((a, b) => (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) || b.pos - a.pos);
    this.podium = order.slice(0, 3).map((r, i) => ({ place: i + 1, ...this.pubRacer(r) }));
    for (const r of this.racers) {
      const s = (this.stats[r.id] ||= { id: r.id, name: r.name, avatar: r.avatar, wins: 0, podiums: 0, races: 0 });
      s.name = r.name || s.name; s.avatar = r.avatar || s.avatar;
      s.races++;
    }
    order.slice(0, 3).forEach((r, i) => { const s = this.stats[r.id]; s.podiums++; if (i === 0) s.wins++; });
    this.phase = 'ended';
    this.nextAt = this.clock() + this.cfg.breakSeconds * 1000;
    this.dirty = true;
    return [{ type: 'race_finish', round: this.roundNo, reason, podium: this.podium }];
  }

  /** Admin: sảnh chờ → xuất phát luôn (cần ≥ 1 con); đang đua → kết thúc; đang nghỉ → vòng mới. */
  skip() {
    if (this.phase === 'lobby') return this.racers.length ? this.startCountdown() : [];
    if (this.phase === 'countdown') return this.go();
    if (this.phase === 'racing') return this.finish('admin');
    return this.newLobby();
  }

  tick() {
    if (this.paused) return [];
    const t = this.clock();
    if (this.phase === 'lobby') {
      if (t < this.endsAt) return [];
      if (this.racers.length >= this.cfg.minRacers) return this.startCountdown();
      this.endsAt = t + this.cfg.lobbySeconds * 1000; // chưa đủ người: chờ thêm
      return [];
    }
    if (this.phase === 'countdown') return t >= this.endsAt ? this.go() : [];
    if (this.phase === 'ended') return t >= this.nextAt ? this.newLobby() : [];
    // racing
    const dt = Math.min(1, Math.max(0, (t - this.lastTickAt) / 1000));
    this.lastTickAt = t;
    const fx = [];
    for (const r of this.racers) {
      if (r.finishedAt != null) continue;
      if (r.stunUntil > t) continue;
      const dash = Math.min(r.pending, this.cfg.dashSpeed * dt);
      r.pending -= dash;
      r.pos = Math.min(this.cfg.track, r.pos + this.cfg.baseSpeed * dt * (0.6 + this.random() * 0.8) + dash);
      if (r.pos >= this.cfg.track) {
        r.finishedAt = t;
        fx.push({ type: 'race_arrive', racer: this.pubRacer(r), place: this.racers.filter((x) => x.finishedAt != null).length });
      }
    }
    if (fx.length) this.dirty = true;
    const done = this.racers.filter((r) => r.finishedAt != null).length;
    // con đầu tiên về đích là thắng; chờ thêm chút cho đủ hạng 2–3 là không cần thiết trên live → kết thúc ngay
    if (done >= 1) return [...fx, ...this.finish('finish')];
    if (t >= this.endsAt) return [...fx, ...this.finish('timeout')];
    return fx;
  }

  /** Chạy lại sau tạm dừng: dời thời gian bị choáng / chờ bình luận. */
  onResume(d) {
    for (const r of this.racers) if (r.stunUntil) r.stunUntil += d;
    for (const [id, t] of this.lastAct) this.lastAct.set(id, t + d);
  }

  // ---------------- người chơi ----------------
  racerOf(id) { return this.racers.find((r) => r.id === id); }

  pubRacer(r) {
    return { ...pub(r), lane: r.lane, animal: r.animal, pos: Math.round((r.pos / this.cfg.track) * 1000) / 1000 };
  }

  addRacer(user, fromQueue = false) {
    if (this.racerOf(user.id)) return [];
    const used = new Set(this.racers.map((r) => r.animal.id));
    const free = ANIMALS.filter((a) => !used.has(a.id));
    const animal = free[Math.floor(this.random() * free.length)];
    const lanes = new Set(this.racers.map((r) => r.lane));
    let lane = 1; while (lanes.has(lane)) lane++;
    const r = { ...pub(user), lane, animal, pos: 0, pending: 0, stunUntil: 0, finishedAt: null, power: 0, diamonds: 0, cheers: 0 };
    this.racers.push(r);
    this.racers.sort((a, b) => a.lane - b.lane);
    this.dirty = true;
    const fx = [{ type: 'race_join', racer: this.pubRacer(r), fromQueue }];
    if (this.racers.length >= this.cfg.maxRacers) {
      this.endsAt = Math.min(this.endsAt, this.clock() + this.cfg.fullStartSeconds * 1000);
      fx.push({ type: 'race_full', startsIn: Math.max(0, Math.ceil((this.endsAt - this.clock()) / 1000)) });
    }
    return fx;
  }

  isJoin(text) {
    const n = normalize(text || '');
    return this.joinWords.has(n) || this.joinWords.has(n.replace(/(.)\1+$/, '$1')); // "okkk"
  }

  /** Khán giả cổ vũ: gõ số làn (1–6) hoặc tên con vật. */
  cheerTarget(text) {
    const n = normalize(text || '');
    const m = n.match(/^(?:so |lan |#)?([1-6])$/);
    if (m) return this.racers.find((r) => r.lane === Number(m[1])) || null;
    return this.racers.find((r) => normalize(r.animal.name) === n || n === `${normalize(r.animal.name)} oi` || n === `di ${normalize(r.animal.name)}`) || null;
  }

  /** Đội của người tặng/thả tim: chính con mình, hoặc con đang cổ vũ. */
  teamOf(id) {
    const own = this.racerOf(id);
    if (own) return own;
    const lane = this.supporters.get(id);
    return lane ? this.racers.find((r) => r.lane === lane) || null : null;
  }

  push(r, amount, by, source, extra = {}) {
    if (!r || amount <= 0) return [];
    r.pending += amount;
    r.power += amount;
    this.dirty = true;
    return [{ type: 'race_boost', racer: this.pubRacer(r), by: by ? pub(by) : null, amount: Math.round(amount), source, ...extra }];
  }

  handle(ev) {
    if (this.paused) return [];
    const user = ev.user;
    if (!user?.id) return [];
    const t = this.clock();

    if (ev.type === 'comment') {
      if (this.isJoin(ev.text)) {
        if (this.phase === 'lobby') {
          if (this.racers.length >= this.cfg.maxRacers) return this.enqueue(user, 'full');
          return this.addRacer(user);
        }
        return this.enqueue(user, 'busy');
      }
      if (this.phase === 'lobby') {
        const target = this.cheerTarget(ev.text);
        if (target && !this.racerOf(user.id)) { this.supporters.set(user.id, target.lane); return [{ type: 'race_cheer', racer: this.pubRacer(target), by: pub(user), amount: 0 }]; }
        return [];
      }
      if (this.phase !== 'racing' && this.phase !== 'countdown') return [];
      const own = this.racerOf(user.id);
      if (own) {
        if (this.phase !== 'racing' || t - (this.lastAct.get(user.id) ?? -Infinity) < this.cfg.boost.commentCooldownSec * 1000) return [];
        this.lastAct.set(user.id, t);
        return this.push(own, this.cfg.boost.comment, user, 'comment');
      }
      const target = this.cheerTarget(ev.text);
      if (!target) return [];
      this.supporters.set(user.id, target.lane);
      if (this.phase !== 'racing' || t - (this.lastAct.get(user.id) ?? -Infinity) < this.cfg.boost.cheerCooldownSec * 1000) return [];
      this.lastAct.set(user.id, t);
      target.cheers++;
      return [{ type: 'race_cheer', racer: this.pubRacer(target), by: pub(user), amount: this.cfg.boost.cheer }, ...this.push(target, this.cfg.boost.cheer, user, 'cheer').map((e) => ({ ...e, silent: true }))];
    }

    if (this.phase !== 'racing') return [];
    const r = this.teamOf(user.id);
    if (!r) return [];
    const b = this.cfg.boost;
    switch (ev.type) {
      case 'like': {
        const n = Math.max(1, Math.min(ev.count | 0 || 1, b.maxLikePerEvent));
        return this.push(r, n * b.like, user, 'like', { count: n });
      }
      case 'share': return this.push(r, b.share, user, 'share');
      case 'follow': return this.push(r, b.follow, user, 'follow');
      case 'gift': {
        const diamonds = Math.max(1, Number(ev.diamonds) || 1) * Math.max(1, ev.repeatCount | 0 || 1);
        r.diamonds += diamonds;
        const fx = this.push(r, Math.min(b.maxGift, diamonds * b.perDiamond), user, 'gift', { diamonds, giftName: ev.giftName, giftImage: ev.giftImage || null, repeatCount: ev.repeatCount || 1 });
        if (diamonds >= this.cfg.banana.minDiamonds) {
          const leader = this.racers.filter((x) => x !== r && x.finishedAt == null).sort((x, y) => y.pos - x.pos)[0];
          if (leader) {
            leader.stunUntil = t + this.cfg.banana.stunSeconds * 1000;
            fx.push({ type: 'race_banana', by: pub(user), from: this.pubRacer(r), target: this.pubRacer(leader), seconds: this.cfg.banana.stunSeconds });
          }
        }
        return fx;
      }
      default: return [];
    }
  }

  enqueue(user, why) {
    if (this.racerOf(user.id) || this.queue.some((u) => u.id === user.id)) return [];
    if (this.queue.length >= this.cfg.queueMax) return [];
    this.queue.push(pub(user));
    return [{ type: 'race_queue', by: pub(user), position: this.queue.length, why }];
  }

  snapshot() {
    const t = this.clock();
    const deadline = this.phase === 'ended' ? this.nextAt : this.endsAt;
    return {
      round: this.roundNo,
      phase: this.phase,
      paused: !!this.paused,
      pauseReason: this.pauseReason || null,
      remaining: Math.max(0, Math.ceil((deadline - t) / 1000)),
      raceSeconds: this.cfg.raceSeconds,
      maxRacers: this.cfg.maxRacers,
      minRacers: this.cfg.minRacers,
      joinWord: this.cfg.joinKeywords[0].toUpperCase(),
      racers: this.racers.map((r) => ({
        ...this.pubRacer(r),
        stunned: r.stunUntil > t,
        finished: r.finishedAt != null,
        power: Math.round(r.power),
        diamonds: r.diamonds,
        cheers: r.cheers,
        supporters: [...this.supporters.values()].filter((l) => l === r.lane).length,
      })),
      queue: this.queue.slice(0, 6),
      queueCount: this.queue.length,
      podium: this.podium,
      bananaMin: this.cfg.banana.minDiamonds,
      champions: Object.values(this.stats).sort((a, b) => b.wins - a.wins || b.podiums - a.podiums).slice(0, 5),
    };
  }
}

makePausable(Race);

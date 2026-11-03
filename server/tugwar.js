import fs from 'node:fs';
import path from 'node:path';
import { createCommandMatcher } from './text.js';
import { makePausable } from './pause.js';

export const TUG_DEFAULTS = {
  roundSeconds: 180,
  breakSeconds: 15,
  winDistance: 100, // dây qua ±100 là thắng ngay
  power: { like: 1, share: 15, follow: 25, perDiamond: 5, join: 0 },
  // lực -> độ dịch chuyển dây; tăng lên để ván kết thúc nhanh hơn
  pullFactor: 0.12,
  maxLikePerEvent: 30,
  maxMovePerGift: 50, // một món quà kéo tối đa nửa quãng đường, ván không kết thúc ngay
  teams: [
    { id: 'red', name: 'Đội Đỏ', color: '#e0392b', keywords: ['do', 'doi do', 'red', 'phe do'] },
    { id: 'blue', name: 'Đội Xanh', color: '#2b7de0', keywords: ['xanh', 'doi xanh', 'blue', 'phe xanh'] },
  ],
};

/**
 * Game kéo co 2 đội. pos âm = nghiêng về đội 0 (trái), dương = đội 1 (phải).
 * handle(ev) nhận sự kiện chuẩn hoá giống Temple, trả về hiệu ứng.
 * tick() gọi định kỳ để chuyển ván.
 */
export class TugWar {
  constructor(config = {}, { statePath, now = () => Date.now() } = {}) {
    this.cfg = {
      ...TUG_DEFAULTS,
      ...config,
      power: { ...TUG_DEFAULTS.power, ...(config.power || {}) },
      teams: config.teams?.length === 2 ? config.teams : TUG_DEFAULTS.teams,
    };
    this.now = now;
    this.statePath = statePath;
    this.matchTeam = createCommandMatcher(this.cfg.teams.map((t) => ({ action: t.id, keywords: t.keywords })));
    this.wins = { [this.cfg.teams[0].id]: 0, [this.cfg.teams[1].id]: 0, draw: 0 };
    this.roundNo = 0;
    this.history = [];
    this.load();
    this.startRound();
  }

  load() {
    if (!this.statePath) return;
    try {
      const s = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      Object.assign(this.wins, s.wins || {});
      this.roundNo = s.roundNo || 0;
      this.history = s.history || [];
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[tugwar] Không đọc được state:', e.message);
    }
  }

  save() {
    if (!this.statePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify({ wins: this.wins, roundNo: this.roundNo, history: this.history.slice(-20) }));
    this.dirty = false;
  }

  resetAll() {
    this.wins = { [this.cfg.teams[0].id]: 0, [this.cfg.teams[1].id]: 0, draw: 0 };
    this.roundNo = 0;
    this.history = [];
    this.dirty = true;
    this.startRound();
  }

  startRound() {
    this.roundNo++;
    this.phase = 'playing';
    this.pos = 0;
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.cfg.roundSeconds * 1000;
    this.players = new Map(); // id -> { id, name, avatar, team, power, diamonds }
    this.teamPower = { [this.cfg.teams[0].id]: 0, [this.cfg.teams[1].id]: 0 };
    this.throne = null; // { id, name, avatar, diamonds, team }
    this.result = null;
    this.dirty = true;
    return [{ type: 'tug_start', round: this.roundNo }];
  }

  teamIndex(id) { return this.cfg.teams.findIndex((t) => t.id === id); }

  teamCount(id) {
    let n = 0;
    for (const p of this.players.values()) if (p.team === id) n++;
    return n;
  }

  /** Lấy hoặc tạo người chơi; chưa có đội thì xếp vào đội ít người hơn. */
  player(user, wantTeam = null) {
    if (!user?.id) return null;
    let p = this.players.get(user.id);
    const [a, b] = this.cfg.teams.map((t) => t.id);
    if (!p) {
      const team = wantTeam || (this.teamCount(a) <= this.teamCount(b) ? a : b);
      p = { id: user.id, name: user.name, avatar: user.avatar, team, power: 0, diamonds: 0 };
      this.players.set(user.id, p);
      return { p, joined: true };
    }
    if (user.name) p.name = user.name;
    if (user.avatar) p.avatar = user.avatar;
    return { p, joined: false };
  }

  pull(p, power, effects, extra = {}) {
    if (!p || power <= 0) return;
    const dir = this.teamIndex(p.team) === 0 ? -1 : 1;
    p.power += power;
    this.teamPower[p.team] += power;
    const move = Math.min(power * this.cfg.pullFactor, this.cfg.maxMovePerGift);
    this.pos = Math.max(-this.cfg.winDistance, Math.min(this.cfg.winDistance, this.pos + dir * move));
    effects.push({ type: 'tug_pull', user: pub(p), team: p.team, power, ...extra });
    if (Math.abs(this.pos) >= this.cfg.winDistance) effects.push(...this.finish());
  }

  handle(ev) {
    if (this.paused || this.phase !== 'playing') return [];
    const effects = [];
    const pw = this.cfg.power;
    const user = ev.user;

    if (ev.type === 'comment') {
      const m = this.matchTeam(ev.text);
      if (!m) {
        // bình luận thường: chỉ nhận vào đội nếu đã có, không tạo người chơi mới
        return [];
      }
      const existing = this.players.get(user?.id);
      if (existing) {
        if (existing.team !== m.action && existing.power === 0) {
          existing.team = m.action; // chưa kéo lần nào thì cho đổi đội
          effects.push({ type: 'tug_join', user: pub(existing), team: existing.team });
        }
        return effects;
      }
      const r = this.player(user, m.action);
      if (r) effects.push({ type: 'tug_join', user: pub(r.p), team: r.p.team });
      this.dirty = true;
      return effects;
    }

    const r = this.player(user);
    if (!r) return [];
    if (r.joined) effects.push({ type: 'tug_join', user: pub(r.p), team: r.p.team, auto: true });

    switch (ev.type) {
      case 'like': {
        const n = Math.max(1, Math.min(ev.count | 0 || 1, this.cfg.maxLikePerEvent));
        this.pull(r.p, n * pw.like, effects, { source: 'like', count: n });
        break;
      }
      case 'share':
        this.pull(r.p, pw.share, effects, { source: 'share' });
        break;
      case 'follow':
        this.pull(r.p, pw.follow, effects, { source: 'follow' });
        break;
      case 'gift': {
        const diamonds = Math.max(0, Number(ev.diamonds) || 0) * Math.max(1, ev.repeatCount | 0 || 1);
        r.p.diamonds += diamonds;
        this.pull(r.p, Math.max(1, diamonds) * pw.perDiamond, effects, {
          source: 'gift', diamonds, giftName: ev.giftName, giftImage: ev.giftImage || null, repeatCount: ev.repeatCount || 1,
        });
        if (this.phase === 'playing' || this.result) effects.push(...this.updateThrone(r.p));
        break;
      }
      default:
        break;
    }
    this.dirty = true;
    return effects;
  }

  updateThrone(p) {
    if (!p.diamonds) return [];
    if (this.throne?.id === p.id) { this.throne.diamonds = p.diamonds; return []; }
    if (this.throne && p.diamonds <= this.throne.diamonds) return [];
    const prev = this.throne;
    this.throne = { ...pub(p), diamonds: p.diamonds, team: p.team };
    return [{ type: 'tug_throne', user: pub(p), team: p.team, diamonds: p.diamonds, prev: prev ? { name: prev.name, avatar: prev.avatar } : null }];
  }

  finish() {
    if (this.phase !== 'playing') return [];
    const [a, b] = this.cfg.teams.map((t) => t.id);
    const winner = this.pos < 0 ? a : this.pos > 0 ? b : null;
    if (winner) this.wins[winner]++; else this.wins.draw++;
    let mvp = null;
    for (const p of this.players.values()) if (!winner || p.team === winner) if (!mvp || p.power > mvp.power) mvp = p;
    this.phase = 'ended';
    this.result = { winner, mvp: mvp && mvp.power > 0 ? { ...pub(mvp), power: mvp.power } : null, pos: this.pos };
    this.history.push({ round: this.roundNo, winner, at: this.clock() });
    this.nextAt = this.clock() + this.cfg.breakSeconds * 1000;
    this.dirty = true;
    return [{ type: 'tug_end', round: this.roundNo, ...this.result, throne: this.throne }];
  }

  /** Gọi mỗi ~250ms: hết giờ thì kết thúc, hết giờ nghỉ thì sang ván mới. */
  tick() {
    if (this.paused) return [];
    const t = this.clock();
    if (this.phase === 'playing' && t >= this.endsAt) return this.finish();
    if (this.phase === 'ended' && t >= this.nextAt) return this.startRound();
    return [];
  }

  snapshot() {
    const t = this.clock();
    const teams = this.cfg.teams.map((tm) => {
      const members = [...this.players.values()].filter((p) => p.team === tm.id).sort((x, y) => y.power - x.power);
      return {
        id: tm.id, name: tm.name, color: tm.color, keyword: tm.keywords[0],
        wins: this.wins[tm.id] || 0, power: this.teamPower[tm.id] || 0, count: members.length,
        top: members.slice(0, 8).map((p) => ({ ...pub(p), power: p.power })),
      };
    });
    return {
      round: this.roundNo,
      phase: this.phase,
      paused: !!this.paused,
      pauseReason: this.pauseReason || null,
      pos: this.pos,
      winDistance: this.cfg.winDistance,
      remaining: Math.max(0, Math.ceil(((this.phase === 'playing' ? this.endsAt : this.nextAt) - t) / 1000)),
      roundSeconds: this.cfg.roundSeconds,
      teams,
      draws: this.wins.draw || 0,
      throne: this.throne,
      result: this.result,
      power: this.cfg.power,
    };
  }
}

function pub(p) {
  return { id: p.id, name: p.name, avatar: p.avatar };
}

makePausable(TugWar);

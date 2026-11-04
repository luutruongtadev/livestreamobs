import { normalize } from './text.js';
import { makePausable } from './pause.js';
import { CARD_BY_ID, RARITIES, SKILLS, statsOf, stars } from '../public/js/cards-data.js';

export const ARENA_DEFAULTS = {
  maxFighters: 100, // tối đa người thật mỗi trận (đã thử tải 100 con)
  minFighters: 16, // ít người thì thêm bot cho đủ
  joinKeywords: ['vào', 'vô', 'join', 'chiến'],
  lobbySeconds: 30,
  fullStartSeconds: 5,
  zoneDelay: 10, // giây đầu vòng an toàn đứng yên
  zoneShrink: 70, // thời gian thu từ r → rMin
  suddenDeath: 30, // sau đó thu tiếp về 0 → trận chắc chắn kết thúc
  zoneDps: 0.06, // ngoài vòng: mất 6% máu tối đa / giây
  suddenDps: 0.15,
  endSeconds: 16, // công bố + mở rương rồi sang trận mới
  queueMax: 150,
  field: { x: 540, y: 1010, r: 470, rMin: 80 },
  speed: 120, // đơn vị / giây
  damage: 0.22, // hệ số sát thương đòn đánh + kỹ năng (chỉnh để trận dài ~1,5 phút)
  like: { heal: 1, maxPerEvent: 20 },
  rose: { heal: 12 }, // 1–4 xu: hồi máu
  shield: { minDiamonds: 5, seconds: 5 },
  revive: { minDiamonds: 10, hp: 0.6 },
  bomb: { minDiamonds: 30, damage: 75, radius: 170 },
  giant: { minDiamonds: 99, seconds: 8 },
  tornado: { minDiamonds: 299, seconds: 4, radius: 260, damage: 9 },
  shards: { perDiamond: 1, perKill: 3, perShare: 5, join: 1, topKiller: 30 },
  chestEvery: 100, // 100 mảnh = 1 rương thẻ
  revenge: { damage: 0.15 },
  showCooldownSec: 60,
  bots: {
    names: ['Gió', 'Sấm', 'Chớp', 'Bão', 'Lốc', 'Mây', 'Mưa', 'Tuyết', 'Băng', 'Lửa', 'Đá', 'Sóng', 'Núi', 'Rừng', 'Trăng', 'Sao'],
    maxQuality: 78,
  },
};

const pub = (u) => ({ id: u.id, name: u.name, avatar: u.avatar || null });
const FLAG = { shield: 1, giant: 2, stun: 4, shell: 8, frenzy: 16, poison: 32 };

/**
 * Đấu Trường Thần Thú: comment "vào" → thần thú (thẻ mạnh nhất trong kho) nhảy vào sân, tối đa 100 con.
 * Các con tự đánh, vòng an toàn thu hẹp, con cuối cùng sống sót thắng rương vàng.
 * Tim hồi máu · quà = khiên / hồi sinh / bom / khổng lồ / lốc xoáy · mỗi xu = 1 mảnh, đủ mảnh mở rương.
 * Pha: lobby → fight → ended → lobby…
 */
export class Arena {
  constructor(config = {}, { cards, now = () => Date.now(), random = Math.random } = {}) {
    const d = ARENA_DEFAULTS;
    this.cfg = { ...d, ...config };
    for (const k of ['field', 'like', 'rose', 'shield', 'revive', 'bomb', 'giant', 'tornado', 'shards', 'revenge', 'bots']) this.cfg[k] = { ...d[k], ...(config[k] || {}) };
    this.joinWords = new Set(this.cfg.joinKeywords.map(normalize));
    this.cards = cards;
    this.now = now;
    this.random = random;
    this.roundNo = 0;
    this.queue = [];
    this.showAt = new Map();
    this.newLobby();
  }

  // ---------------- pha ----------------
  newLobby() {
    this.roundNo++;
    this.phase = 'lobby';
    this.fighters = [];
    this.byId = new Map();
    this.nextIdx = 0;
    this.pending = [];
    this.tornados = [];
    this.winner = null;
    this.topKiller = null;
    this.announced = new Set();
    this.queued = new Set();
    this.startedAt = null;
    this.endsAt = this.clock() + this.cfg.lobbySeconds * 1000;
    this.zoneR = this.cfg.field.r;
    const fx = [{ type: 'arena_lobby', round: this.roundNo }];
    const q = this.queue.splice(0);
    for (const u of q) if (this.fighters.length < this.cfg.maxFighters) fx.push(...this.join(u, true));
    this.queue = q.filter((u) => !this.byId.has(u.id)).slice(0, this.cfg.queueMax);
    return fx;
  }

  /** Kích thước con theo số lượng: càng đông càng nhỏ để vừa sân. */
  get scale() { return Math.max(0.58, Math.min(1, Math.sqrt(30 / Math.max(1, this.fighters.length)))); }

  go() {
    const fx = this.fillBots();
    this.phase = 'fight';
    this.startedAt = this.lastTickAt = this.clock();
    for (const f of this.fighters) {
      f.r = RARITIES[f.card.rar].size * this.scale * 0.5;
      const a = f.skill.active;
      f.nextSkill = a ? this.startedAt + a.every * 1000 * (0.4 + this.random() * 0.6) : Infinity;
    }
    fx.push({ type: 'arena_go', count: this.fighters.length, humans: this.humans(), scale: this.scale });
    return fx;
  }

  fillBots() {
    const fx = [];
    const names = this.cfg.bots.names;
    let k = 0;
    while (this.fighters.length < this.cfg.minFighters) {
      const name = `Bot ${names[k % names.length]}${k >= names.length ? ' ' + Math.floor(k / names.length + 1) : ''}`;
      k++;
      const rar = this.cards.rollRarity('normal');
      const def = this.cards.rollCard(rar === 'M' || rar === 'L' ? 'E' : rar);
      const q = Math.min(this.cfg.bots.maxQuality, this.cards.rollQuality());
      const f = this.makeFighter({ id: `bot:${this.roundNo}:${k}`, name, avatar: null }, { card: def.id, q, serial: 0 }, true);
      fx.push({ type: 'arena_join', f: this.pubFighter(f), bot: true });
    }
    return fx;
  }

  humans() { return this.fighters.filter((f) => !f.bot).length; }
  alive() { return this.fighters.filter((f) => f.alive); }

  finish(winner) {
    const t = this.clock();
    this.phase = 'ended';
    this.nextAt = t + this.cfg.endSeconds * 1000;
    this.winner = winner || null;
    const humans = this.fighters.filter((f) => !f.bot);
    const tk = humans.filter((f) => f.kills > 0).sort((a, b) => b.kills - a.kills)[0] || null;
    this.topKiller = tk ? { ...this.pubFighter(tk), kills: tk.kills } : null;
    const fx = [{ type: 'arena_win', winner: winner ? { ...this.pubFighter(winner), kills: winner.kills } : null, topKiller: this.topKiller, total: this.fighters.length }];
    const s = this.cfg.shards;
    const chests = [];
    if (winner && !winner.bot) chests.push({ type: 'arena_chest', reason: 'win', by: pub(winner), card: this.cards.open(winner, 'gold') });
    for (const f of humans) {
      this.cards.record(f, { win: f === winner, kills: f.kills });
      const n = s.join + f.kills * s.perKill + (tk === f ? s.topKiller : 0);
      for (let i = this.cards.addShards(f, n); i > 0; i--) chests.push({ type: 'arena_chest', reason: 'shards', by: pub(f), card: this.cards.open(f, 'normal') });
    }
    return [...fx, ...chests];
  }

  /** Admin: sảnh → đánh luôn; đang đánh → kết thúc (con nhiều máu nhất thắng); đang nghỉ → trận mới. */
  skip() {
    if (this.phase === 'lobby') return this.go();
    if (this.phase === 'fight') return this.finish(this.alive().sort((a, b) => b.kills - a.kills || b.hp - a.hp)[0]);
    return this.newLobby();
  }

  resetAll() {
    this.cards.resetWins();
    this.queue = [];
    return this.newLobby();
  }

  // ---------------- thần thú ----------------
  makeFighter(user, inst, bot = false) {
    const def = CARD_BY_ID[inst.card];
    const st = statsOf(def.id, inst.q);
    const F = this.cfg.field;
    const a = this.random() * Math.PI * 2, dist = Math.sqrt(this.random()) * (F.r - 70);
    const f = {
      i: this.nextIdx++, ...pub(user), bot,
      card: { id: def.id, q: inst.q, serial: inst.serial || 0, rar: def.rar, stars: stars(inst.q) },
      skillId: def.skill, skill: SKILLS[def.skill] || {},
      max: st.hp, hp: st.hp, atk: st.atk, spd: st.spd,
      x: F.x + Math.cos(a) * dist, y: F.y + Math.sin(a) * dist, vx: 0, vy: 0, r: RARITIES[def.rar].size * 0.5,
      cd: this.random(), kills: 0, alive: true,
      shieldUntil: 0, giantUntil: 0, stunUntil: 0, frenzyUntil: 0, shellUntil: 0, shellUsed: false, rebirthUsed: false,
      poison: null, nextSkill: Infinity, killer: null, revenged: false, zoneAcc: 0, wander: this.random() * Math.PI * 2,
    };
    this.fighters.push(f);
    this.byId.set(f.id, f);
    return f;
  }

  setCard(f, inst) {
    const def = CARD_BY_ID[inst.card];
    const st = statsOf(def.id, inst.q);
    Object.assign(f, { card: { id: def.id, q: inst.q, serial: inst.serial || 0, rar: def.rar, stars: stars(inst.q) }, skillId: def.skill, skill: SKILLS[def.skill] || {}, max: st.hp, hp: st.hp, atk: st.atk, spd: st.spd });
  }

  pubFighter(f) {
    return { i: f.i, ...pub(f), bot: f.bot, card: f.card, skill: f.skillId, max: f.max };
  }

  /** Người xem comment "vào": thả thẻ mạnh nhất (hoặc thẻ đã chọn); người mới nhận thẻ khởi đầu. */
  join(user, fromQueue = false) {
    if (this.byId.has(user.id)) return [];
    let starter = null;
    if (!this.cards.main(user.id)) starter = this.cards.open(user, 'starter');
    const inst = this.cards.main(user.id);
    const f = this.makeFighter(user, inst);
    const fx = [{ type: 'arena_join', f: this.pubFighter(f), starter, fromQueue }];
    if (this.fighters.length >= this.cfg.maxFighters) {
      this.endsAt = Math.min(this.endsAt, this.clock() + this.cfg.fullStartSeconds * 1000);
      fx.push({ type: 'arena_full', startsIn: Math.max(0, Math.ceil((this.endsAt - this.clock()) / 1000)) });
    }
    return fx;
  }

  enqueue(user) {
    if (this.byId.has(user.id) || this.queue.some((u) => u.id === user.id) || this.queue.length >= this.cfg.queueMax) return [];
    this.queue.push(pub(user));
    return [{ type: 'arena_queue', by: pub(user), position: this.queue.length }];
  }

  isJoin(text) {
    const n = normalize(text || '');
    return this.joinWords.has(n) || this.joinWords.has(n.replace(/(.)\1+$/, '$1')) || /^(vao|vo)( (vao|vo|di|nao|luon))+$/.test(n);
  }

  // ---------------- mô phỏng ----------------
  tick() {
    if (this.paused) return [];
    const t = this.clock();
    const dt = Math.min(0.25, Math.max(0, (t - (this.lastTickAt ?? t)) / 1000));
    this.lastTickAt = t;
    if (this.phase === 'lobby') {
      this.wander(dt);
      return t >= this.endsAt ? this.go() : [];
    }
    if (this.phase === 'ended') {
      this.wander(dt);
      return t >= this.nextAt ? this.newLobby() : [];
    }
    return this.step(dt, t);
  }

  /** Sảnh chờ: các con đi dạo trong sân, không đánh nhau. */
  wander(dt) {
    const F = this.cfg.field;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      f.wander += (this.random() - 0.5) * dt * 3;
      f.vx = Math.cos(f.wander) * 40; f.vy = Math.sin(f.wander) * 40;
      f.x += f.vx * dt; f.y += f.vy * dt;
      const dx = f.x - F.x, dy = f.y - F.y, d = Math.hypot(dx, dy);
      if (d > F.r - 50) { f.x = F.x + dx / d * (F.r - 50); f.y = F.y + dy / d * (F.r - 50); f.wander += Math.PI; }
    }
  }

  zoneAt(t) {
    const F = this.cfg.field, c = this.cfg;
    const el = (t - this.startedAt) / 1000;
    if (el <= c.zoneDelay) return { r: F.r, sudden: false };
    if (el <= c.zoneDelay + c.zoneShrink) return { r: F.r - (F.r - F.rMin) * ((el - c.zoneDelay) / c.zoneShrink), sudden: false };
    const k = Math.min(1, (el - c.zoneDelay - c.zoneShrink) / c.suddenDeath);
    return { r: F.rMin * (1 - k), sudden: true };
  }

  step(dt, t) {
    const fx = [];
    this.fx = fx;
    const F = this.cfg.field;
    const zone = this.zoneAt(t);
    if (zone.sudden && !this.announced.has('sudden')) { this.announced.add('sudden'); fx.push({ type: 'arena_sudden' }); }
    this.zoneR = zone.r;
    // việc hẹn giờ: bom rơi, hồn ma báo thù
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= t);
      this.pending = this.pending.filter((p) => p.at > t);
      for (const p of due) this.resolve(p, t);
    }
    // lốc xoáy
    for (const tw of this.tornados) {
      const o = tw.owner;
      if (o.alive) { tw.x += (o.x - tw.x) * Math.min(1, dt * 3); tw.y += (o.y - tw.y) * Math.min(1, dt * 3); }
      tw.acc += dt;
      if (tw.acc >= 0.25) {
        tw.acc -= 0.25;
        for (const v of this.fighters) {
          if (!v.alive || v === o) continue;
          const dx = v.x - tw.x, dy = v.y - tw.y, d = Math.hypot(dx, dy) || 1;
          if (d < this.cfg.tornado.radius) { this.damage(v, this.cfg.tornado.damage, o, 'tornado', t); v.vx += dx / d * 520; v.vy += dy / d * 520; }
        }
      }
    }
    this.tornados = this.tornados.filter((tw) => tw.until > t);

    const L = this.alive();
    const sp = this.cfg.speed;
    for (const f of L) {
      if (!f.alive) continue; // vừa bị hạ trong vòng lặp này
      const sk = f.skill;
      if (sk.regen && f.hp < f.max) f.hp = Math.min(f.max, f.hp + f.max * sk.regen * dt);
      if (f.poison) {
        if (f.poison.until > t) this.damage(f, f.poison.dps * dt, f.poison.by, 'poison', t, { raw: true });
        else f.poison = null;
        if (!f.alive) continue;
      }
      // con gần nhất + đẩy nhau ra cho khỏi chồng (O(n²): 100 con = 10k phép tính / tick, < 1ms)
      let tgt = null, best = Infinity, ax = 0, ay = 0;
      for (const o of L) {
        if (o === f || !o.alive) continue;
        const dx = o.x - f.x, dy = o.y - f.y, d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; tgt = o; }
        const min = (f.r + o.r) * 0.85;
        if (d2 < min * min) { const d = Math.sqrt(d2) || 1; ax -= dx / d * 1.6; ay -= dy / d * 1.6; }
      }
      const stunned = f.stunUntil > t;
      const giant = f.giantUntil > t;
      if (!stunned && tgt) {
        const d = Math.sqrt(best);
        const a = sk.active;
        if (a && t >= f.nextSkill && this.cast(f, tgt, d, t)) f.nextSkill = t + a.every * 1000;
        if (f.alive && tgt.alive) {
          ax += (tgt.x - f.x) / (d || 1); ay += (tgt.y - f.y) / (d || 1);
          const reach = (f.r * (giant ? 1.6 : 1) + tgt.r * (tgt.giantUntil > t ? 1.6 : 1)) + 8;
          f.cd -= dt * (f.frenzyUntil > t ? sk.active?.rate || 3 : 1);
          if (d < reach && f.cd <= 0) { f.cd = 0.8 + this.random() * 0.4; this.hit(f, tgt, 1, t); }
        }
      }
      if (!f.alive) continue;
      // bị kéo vào trong vòng an toàn
      const zx = F.x - f.x, zy = F.y - f.y, zd = Math.hypot(zx, zy) || 1;
      if (zd > zone.r - 20) { ax += zx / zd * 2.2; ay += zy / zd * 2.2; }
      const s = sp * f.spd * (giant ? 1.15 : 1) * (stunned ? 0 : 1);
      f.vx += ax * s * dt * 4; f.vy += ay * s * dt * 4;
      const v = Math.hypot(f.vx, f.vy), vmax = s * 1.4;
      if (v > vmax && v > 300) { f.vx *= 0.88; f.vy *= 0.88; } else if (v > vmax && vmax > 0) { f.vx *= vmax / v; f.vy *= vmax / v; }
      f.vx *= 0.9; f.vy *= 0.9;
      f.x += f.vx * dt; f.y += f.vy * dt;
      // không văng ra khỏi sân
      const ox = f.x - F.x, oy = f.y - F.y, od = Math.hypot(ox, oy);
      if (od > F.r + 40) { f.x = F.x + ox / od * (F.r + 40); f.y = F.y + oy / od * (F.r + 40); }
      // ngoài vòng an toàn: mất máu
      if (od > zone.r) {
        f.zoneAcc += dt;
        if (f.zoneAcc >= 0.5) { f.zoneAcc -= 0.5; this.damage(f, f.max * (zone.sudden ? this.cfg.suddenDps : this.cfg.zoneDps) * 0.5, null, 'zone', t, { raw: true }); }
      } else f.zoneAcc = 0;
    }

    const left = this.alive();
    const n = left.length;
    for (const m of [50, 20, 10, 5, 3]) {
      if (n <= m && this.fighters.length > m + 1 && !this.announced.has('left' + m)) {
        for (const k of [50, 20, 10, 5, 3]) if (k >= m) this.announced.add('left' + k);
        fx.push({ type: 'arena_left', left: n });
        break;
      }
    }
    if (n === 2 && !this.announced.has('final')) {
      this.announced.add('final');
      fx.push({ type: 'arena_final', a: this.pubFighter(left[0]), b: this.pubFighter(left[1]) });
    }
    if (n <= 1) fx.push(...this.finish(left[0] || this.lastDead));
    this.fx = null;
    return fx;
  }

  emit(e) { this.fx?.push(e); return e; }

  hit(f, tgt, mult, t, kind = 'hit') {
    const sk = f.skill;
    let dmg = f.atk * this.cfg.damage * mult * (f.giantUntil > t ? 2 : 1) * (0.85 + this.random() * 0.3);
    if (sk.rage) dmg *= 1 + sk.rage * (1 - f.hp / f.max);
    if (sk.crit && this.random() < sk.crit.chance) dmg *= sk.crit.mult;
    const done = this.damage(tgt, dmg, f, kind, t, { dodgeable: kind === 'hit' });
    if (done > 0) {
      if (sk.lifesteal) f.hp = Math.min(f.max, f.hp + done * sk.lifesteal);
      if (sk.poison && tgt.alive) tgt.poison = { dps: f.atk * sk.poison.dps, until: t + sk.poison.sec * 1000, by: f };
      const dx = tgt.x - f.x, dy = tgt.y - f.y, d = Math.hypot(dx, dy) || 1;
      const kb = 260 * (sk.knock || 1) * (f.giantUntil > t ? 1.5 : 1);
      tgt.vx += dx / d * kb; tgt.vy += dy / d * kb;
    }
    return done;
  }

  damage(v, amt, src, cause, t, { dodgeable = false, raw = false } = {}) {
    if (!v.alive || amt <= 0) return 0;
    if (v.shellUntil > t || (v.shieldUntil > t && !raw)) return 0;
    const sk = v.skill;
    if (dodgeable && sk.dodge && this.random() < sk.dodge) return 0;
    if (sk.armor && !raw) amt *= 1 - sk.armor;
    v.hp -= amt;
    if (sk.shell && !v.shellUsed && v.hp < v.max * sk.shell.at) {
      v.shellUsed = true;
      v.shellUntil = t + sk.shell.sec * 1000;
      v.hp = Math.max(0, v.hp) + v.max * sk.shell.heal;
      v.poison = null;
      this.emit({ type: 'arena_skill', i: v.i, skill: v.skillId, kind: 'shell', x: v.x, y: v.y });
    }
    if (v.hp <= 0) {
      if (sk.rebirth && !v.rebirthUsed) {
        v.rebirthUsed = true;
        v.hp = v.max * sk.rebirth;
        v.poison = null;
        this.emit({ type: 'arena_skill', i: v.i, skill: v.skillId, kind: 'rebirth', x: v.x, y: v.y });
      } else this.kill(v, src, cause);
    }
    return amt;
  }

  kill(v, src, cause) {
    v.alive = false;
    v.hp = 0;
    v.poison = null;
    v.killer = src && src !== v ? src.i : null;
    this.lastDead = v;
    let streak = 0;
    if (src && src !== v && src.alive) {
      src.kills++;
      streak = src.kills;
      src.hp = Math.min(src.max * (src.giantUntil > this.clock() ? 1.5 : 1), src.hp + 15 + (src.skill.killHeal || 0));
    }
    this.emit({ type: 'arena_kill', k: v.killer, v: v.i, cause, kills: streak, x: Math.round(v.x), y: Math.round(v.y) });
  }

  /** Tung kỹ năng chủ động; trả về true nếu đã dùng. */
  cast(f, near, nearD, t) {
    const a = f.skill.active;
    const giant = (f.giantUntil > t ? 2 : 1) * this.cfg.damage;
    const enemies = () => this.fighters.filter((o) => o.alive && o !== f);
    const base = { type: 'arena_skill', i: f.i, skill: f.skillId, kind: a.type };
    if (a.type === 'dash') {
      const far = enemies().filter((o) => { const d = Math.hypot(o.x - f.x, o.y - f.y); return d > 90 && d < a.range; });
      const tgt = far.length ? far[Math.floor(this.random() * far.length)] : nearD < a.range ? near : null;
      if (!tgt) return false;
      const x0 = f.x, y0 = f.y, dx = tgt.x - f.x, dy = tgt.y - f.y, d = Math.hypot(dx, dy) || 1;
      f.x = tgt.x - dx / d * (f.r + tgt.r); f.y = tgt.y - dy / d * (f.r + tgt.r);
      this.emit({ ...base, x0: Math.round(x0), y0: Math.round(y0), x: Math.round(f.x), y: Math.round(f.y), v: tgt.i });
      this.hit(f, tgt, a.mult, t, 'skill');
      return true;
    }
    if (a.type === 'aoe') {
      const hits = enemies().filter((o) => Math.hypot(o.x - f.x, o.y - f.y) < a.radius + o.r);
      if (!hits.length) return false;
      this.emit({ ...base, fx: a.fx, x: Math.round(f.x), y: Math.round(f.y), r: a.radius, hits: hits.length });
      for (const o of hits) {
        const dx = o.x - f.x, dy = o.y - f.y, d = Math.hypot(dx, dy) || 1;
        this.damage(o, f.atk * a.mult * giant, f, 'skill', t);
        if (a.knock) { o.vx += dx / d * a.knock; o.vy += dy / d * a.knock; }
        if (a.stun && o.alive) o.stunUntil = Math.max(o.stunUntil, t + a.stun * 1000);
      }
      return true;
    }
    if (a.type === 'frenzy') {
      if (nearD > 200) return false;
      f.frenzyUntil = t + a.sec * 1000;
      this.emit({ ...base, x: Math.round(f.x), y: Math.round(f.y), sec: a.sec });
      return true;
    }
    if (a.type === 'thunder') {
      const all = enemies().sort((p, q) => Math.hypot(p.x - f.x, p.y - f.y) - Math.hypot(q.x - f.x, q.y - f.y)).slice(0, a.n * 3);
      const picks = [];
      while (picks.length < a.n && all.length) picks.push(all.splice(Math.floor(this.random() * all.length), 1)[0]);
      if (!picks.length) return false;
      this.emit({ ...base, x: Math.round(f.x), y: Math.round(f.y), targets: picks.map((o) => [o.i, Math.round(o.x), Math.round(o.y)]) });
      for (const o of picks) { this.damage(o, f.atk * a.mult * giant, f, 'skill', t); if (o.alive) o.stunUntil = Math.max(o.stunUntil, t + 600); }
      return true;
    }
    if (a.type === 'charge') {
      if (nearD > a.len) return false;
      const F = this.cfg.field;
      const dx = near.x - f.x, dy = near.y - f.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const x0 = f.x, y0 = f.y;
      let x1 = f.x + ux * a.len, y1 = f.y + uy * a.len;
      const od = Math.hypot(x1 - F.x, y1 - F.y);
      if (od > F.r - 30) { x1 = F.x + (x1 - F.x) / od * (F.r - 30); y1 = F.y + (y1 - F.y) / od * (F.r - 30); }
      const hits = enemies().filter((o) => {
        const px = o.x - x0, py = o.y - y0, len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const proj = Math.max(0, Math.min(len, (px * (x1 - x0) + py * (y1 - y0)) / len));
        const cx = x0 + (x1 - x0) / len * proj, cy = y0 + (y1 - y0) / len * proj;
        return Math.hypot(o.x - cx, o.y - cy) < a.width / 2 + o.r;
      });
      f.x = x1; f.y = y1;
      this.emit({ ...base, x0: Math.round(x0), y0: Math.round(y0), x: Math.round(x1), y: Math.round(y1), hits: hits.length });
      for (const o of hits) { this.damage(o, f.atk * a.mult * giant, f, 'skill', t); o.vx += -uy * 500 * (this.random() < 0.5 ? 1 : -1); o.vy += ux * 500; }
      return true;
    }
    return false;
  }

  resolve(p, t) {
    if (p.kind === 'bomb') {
      const c = this.cfg.bomb;
      const tg = p.target;
      const x = tg.alive ? tg.x : p.x, y = tg.alive ? tg.y : p.y;
      let hits = 0;
      for (const o of this.fighters) {
        if (!o.alive || o === p.from) continue;
        const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy) || 1;
        if (d < c.radius) { hits++; this.damage(o, c.damage * (1 - d / (c.radius * 1.4)), p.from?.alive ? p.from : null, 'bomb', t); o.vx += dx / d * 650; o.vy += dy / d * 650; }
      }
      this.emit({ type: 'arena_boom', x: Math.round(x), y: Math.round(y), r: c.radius, hits, by: p.by });
    } else if (p.kind === 'ghost') {
      const k = p.target;
      if (!k.alive) return;
      this.emit({ type: 'arena_revenge', from: p.from.i, to: k.i, by: pub(p.from) });
      this.damage(k, k.max * this.cfg.revenge.damage, null, 'ghost', t, { raw: true });
    }
  }

  onResume(d) {
    for (const f of this.fighters) {
      for (const k of ['shieldUntil', 'giantUntil', 'stunUntil', 'frenzyUntil', 'shellUntil', 'nextSkill']) if (f[k] && Number.isFinite(f[k])) f[k] += d;
      if (f.poison) f.poison.until += d;
    }
    for (const p of this.pending) p.at += d;
    for (const tw of this.tornados) tw.until += d;
  }

  // ---------------- tương tác ----------------
  tierOf(unit) {
    const c = this.cfg;
    if (unit >= c.tornado.minDiamonds) return 'tornado';
    if (unit >= c.giant.minDiamonds) return 'giant';
    if (unit >= c.bomb.minDiamonds) return 'bomb';
    if (unit >= c.revive.minDiamonds) return 'revive';
    if (unit >= c.shield.minDiamonds) return 'shield';
    return 'rose';
  }

  handle(ev) {
    if (this.paused) return [];
    const user = ev.user;
    if (!user?.id) return [];
    const t = this.clock();
    const fx = [];
    this.fx = fx;
    try {
      if (ev.type === 'comment') this.comment(user, String(ev.text || ''), t);
      else if (ev.type === 'like') {
        const f = this.byId.get(user.id);
        if (this.phase === 'fight' && f?.alive) {
          const n = Math.max(1, Math.min(ev.count | 0 || 1, this.cfg.like.maxPerEvent));
          f.hp = Math.min(f.max * (f.giantUntil > t ? 1.5 : 1), f.hp + n * this.cfg.like.heal);
          fx.push({ type: 'arena_like', i: f.i, n });
        }
      } else if (ev.type === 'share') {
        this.shards(user, this.cfg.shards.perShare, 'share');
      } else if (ev.type === 'gift') this.gift(ev, user, t);
    } finally { this.fx = null; }
    return fx;
  }

  shards(user, n, reason) {
    const chests = this.cards.addShards(user, n);
    for (let i = 0; i < chests; i++) this.emit({ type: 'arena_chest', reason, by: pub(user), card: this.cards.open(user, 'normal') });
    return chests;
  }

  comment(user, text, t) {
    const n = normalize(text);
    if (this.isJoin(text)) {
      if (this.phase === 'lobby') {
        if (this.fighters.length >= this.cfg.maxFighters) { for (const e of this.enqueue(user)) this.emit(e); return; }
        for (const e of this.join(user)) this.emit(e);
      } else if (!this.byId.has(user.id)) for (const e of this.enqueue(user)) this.emit(e);
      return;
    }
    const pick = n.match(/^(?:dung|chon|doi|ra tran)\s+(?:the\s+|con\s+)?(.+)$/);
    if (pick) {
      const r = this.cards.pickByText(user.id, pick[1]);
      if (!r) return;
      if (r.missing) { this.emit({ type: 'arena_pick', by: pub(user), missing: r.missing }); return; }
      const f = this.byId.get(user.id);
      if (f && this.phase === 'lobby') { this.setCard(f, r); this.emit({ type: 'arena_join', f: this.pubFighter(f), swap: true }); }
      this.emit({ type: 'arena_pick', by: pub(user), card: { ...r, rar: CARD_BY_ID[r.card].rar }, nextRound: this.phase !== 'lobby' || !f });
      return;
    }
    if (['the', 'the bai', 'kho', 'kho the', 'bo suu tap', 'xem the', 'the cua toi', 'bst'].includes(n)) {
      if (t - (this.showAt.get(user.id) ?? -Infinity) < this.cfg.showCooldownSec * 1000) return;
      this.showAt.set(user.id, t);
      if (this.showAt.size > 2000) this.showAt.delete(this.showAt.keys().next().value);
      this.emit({ type: 'arena_show', by: pub(user), summary: this.cards.summary(user.id) });
      return;
    }
    if (['bao thu', 'baothu', 'tra thu'].includes(n) && this.phase === 'fight') {
      const f = this.byId.get(user.id);
      const k = f && !f.alive && !f.revenged && f.killer != null ? this.fighters.find((x) => x.i === f.killer) : null;
      if (!k?.alive) return;
      f.revenged = true;
      this.pending.push({ at: t + 800, kind: 'ghost', from: f, target: k });
      this.emit({ type: 'arena_ghost', from: f.i, to: k.i, by: pub(user) });
    }
  }

  gift(ev, user, t) {
    const c = this.cfg;
    const unit = Math.max(1, Number(ev.diamonds) || 1);
    const count = Math.max(1, ev.repeatCount | 0 || 1);
    const diamonds = unit * count;
    const tier = this.tierOf(unit);
    let f = this.byId.get(user.id) || null;
    const info = { type: 'arena_gift', by: pub(user), tier, diamonds, count, giftName: ev.giftName || 'Quà', giftImage: ev.giftImage || null, i: f?.i ?? null };
    const fight = this.phase === 'fight';
    if (fight && f && !f.alive && (tier === 'revive' || tier === 'giant' || tier === 'tornado')) {
      // quà lớn khi đã bị hạ: hồi sinh trước rồi mới áp dụng
      const F = this.cfg.field, a = this.random() * Math.PI * 2, d = this.random() * this.zoneR * 0.6;
      Object.assign(f, { alive: true, hp: f.max * c.revive.hp, x: F.x + Math.cos(a) * d, y: F.y + Math.sin(a) * d, vx: 0, vy: 0, revenged: false, poison: null });
      info.revived = true;
    }
    if (fight) {
      const alive = f?.alive;
      if (tier === 'rose' && alive) { f.hp = Math.min(f.max, f.hp + c.rose.heal * count); info.heal = c.rose.heal * count; }
      if (tier === 'shield' && alive) { f.shieldUntil = Math.max(f.shieldUntil, t) + c.shield.seconds * 1000 * count; info.seconds = c.shield.seconds * count; }
      if (tier === 'revive' && alive && !info.revived) { f.hp = Math.max(f.hp, f.max); info.healFull = true; }
      if (tier === 'giant' && alive) {
        f.giantUntil = Math.max(f.giantUntil, t) + c.giant.seconds * 1000;
        f.hp = Math.min(f.max * 1.5, f.hp + f.max * 0.5);
        info.seconds = c.giant.seconds;
      }
      if (tier === 'tornado' && alive) {
        this.tornados.push({ owner: f, x: f.x, y: f.y, until: t + c.tornado.seconds * 1000, acc: 0 });
        f.shieldUntil = Math.max(f.shieldUntil, t + c.tornado.seconds * 1000);
        info.seconds = c.tornado.seconds;
      }
      if (tier === 'bomb') {
        for (let k = 0; k < Math.min(count, 5); k++) {
          const target = this.alive().filter((o) => o !== f).sort((a, b) => b.kills - a.kills || b.hp - a.hp)[k % Math.max(1, this.alive().length - 1)];
          if (!target) break;
          const p = { at: t + 900 + k * 350, kind: 'bomb', target, from: f?.alive ? f : null, by: pub(user), x: target.x, y: target.y };
          this.pending.push(p);
          this.emit({ type: 'arena_bomb', by: pub(user), from: f?.alive ? f.i : null, v: target.i, delay: 900 + k * 350 });
        }
      }
    }
    this.emit(info);
    this.shards(user, diamonds * c.shards.perDiamond, 'gift');
  }

  // ---------------- gửi cho màn hình ----------------
  /** Vị trí gọn để gửi 10 lần / giây: [i, x, y, %máu, cờ, …] chỉ các con còn sống. */
  positions() {
    const t = this.clock();
    const f = [];
    for (const o of this.fighters) {
      if (!o.alive) continue;
      const flags = (o.shieldUntil > t ? FLAG.shield : 0) | (o.giantUntil > t ? FLAG.giant : 0) | (o.stunUntil > t ? FLAG.stun : 0)
        | (o.shellUntil > t ? FLAG.shell : 0) | (o.frenzyUntil > t ? FLAG.frenzy : 0) | (o.poison ? FLAG.poison : 0);
      f.push(o.i, Math.round(o.x), Math.round(o.y), Math.max(1, Math.round((o.hp / o.max) * 100)), flags);
    }
    return { z: Math.round(this.zoneR), f, tw: this.tornados.map((tw) => [Math.round(tw.x), Math.round(tw.y)]) };
  }

  snapshot() {
    const t = this.clock();
    const c = this.cfg;
    const deadline = this.phase === 'ended' ? this.nextAt : this.endsAt;
    if (!this.champCache || t - this.champCache.at > 10_000 || this.champCache.round !== this.roundNo) {
      this.champCache = { at: t, round: this.roundNo, wins: this.cards.top(5, 'wins'), collectors: this.cards.top(3, 'collection') };
    }
    return {
      round: this.roundNo,
      phase: this.phase,
      paused: !!this.paused,
      pauseReason: this.pauseReason || null,
      remaining: this.phase === 'fight' ? 0 : Math.max(0, Math.ceil((deadline - t) / 1000)),
      elapsed: this.phase === 'fight' ? Math.floor((t - this.startedAt) / 1000) : 0,
      sudden: this.phase === 'fight' && this.zoneAt(t).sudden,
      maxFighters: c.maxFighters,
      joinWord: normalize(c.joinKeywords[0]) === 'vao' ? 'VÀO' : c.joinKeywords[0].toUpperCase(),
      total: this.fighters.length,
      humans: this.humans(),
      alive: this.alive().length,
      scale: this.scale,
      field: c.field,
      zone: Math.round(this.zoneR),
      fighters: this.fighters.map((f) => ({ ...this.pubFighter(f), kills: f.kills, alive: f.alive })),
      winner: this.winner ? { ...this.pubFighter(this.winner), kills: this.winner.kills } : null,
      topKiller: this.topKiller,
      queueCount: this.queue.length,
      champions: this.champCache.wins,
      collectors: this.champCache.collectors,
      chestEvery: this.cards.chestEvery,
      tiers: [
        { id: 'like', icon: '❤️', min: 0, label: 'Thả tim: hồi máu' },
        { id: 'rose', icon: '🌹', min: 1, label: `Hồi ${c.rose.heal} máu` },
        { id: 'shield', icon: '🛡️', min: c.shield.minDiamonds, label: `Khiên ${c.shield.seconds}s` },
        { id: 'revive', icon: '💖', min: c.revive.minDiamonds, label: 'Hồi sinh / đầy máu' },
        { id: 'bomb', icon: '💣', min: c.bomb.minDiamonds, label: 'Bom con mạnh nhất' },
        { id: 'giant', icon: '⚡', min: c.giant.minDiamonds, label: 'Khổng lồ x2' },
        { id: 'tornado', icon: '🌪️', min: c.tornado.minDiamonds, label: 'Lốc xoáy' },
      ],
    };
  }
}

makePausable(Arena);

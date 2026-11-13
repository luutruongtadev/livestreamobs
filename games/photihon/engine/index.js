import { Emitter, makePausable, triggerText, triggerIcon } from '#sdk';
import { pathAt, ISLAND, onIsland } from './path.js';

/**
 * Phố Tí Hon: một thị trấn tí hon trên hòn đảo nổi. Người xem tặng quà để gọi thảm hoạ phá phố,
 * bình luận để làm "dân phố" chạy ra sửa nhà. Phố sập đủ wipePercent % → vinh danh người đánh sập → phố mới mọc lên.
 * - Thảm hoạ tức thời rơi xuống sau một nhịp: thiên thạch (vùng), sét (toà cao nhất), mưa đá (tim), UFO (hút 3 toà to nhất).
 * - Thảm hoạ kéo dài: lốc xoáy và trâu khổng lồ đi xuyên phố theo đường lượn, lũ dâng ở hai bờ sông, động đất rung cả phố.
 * - Cây xăng sập thì nổ, phá nhà xung quanh: phá dây chuyền tính điểm ×2 cho người gây ra.
 * - Khiên che cả phố một lúc; thợ xây dựng lại mọi đống đổ nát.
 * Pha: play → wiped (vinh danh) → play (phố mới). Quà tặng lúc đang vinh danh để dành cho phố mới.
 */
export function createGame(ctx) { return new PhoTiHon(ctx); }

export const KINDS = {
  house: { name: 'Nhà ống', hp: 40, bonus: 0 },
  shop: { name: 'Tiệm tạp hoá', hp: 55, bonus: 0 },
  tower: { name: 'Chung cư', hp: 90, bonus: 5 },
  tank: { name: 'Cây xăng', hp: 30, bonus: 0 },
  pagoda: { name: 'Đình làng', hp: 120, bonus: 20 },
};
const KIND_W = [['house', 40], ['shop', 22], ['tower', 15], ['tank', 9], ['pagoda', 5]];
// thảm hoạ: thời gian (ms), sát thương (× disasterScale)
const HZ = {
  thienthach: { delay: 1300, dmg: 55, r: 2.3, edge: 22 },
  set: { delay: 500, dmg: 95 },
  mua: { delay: 800, dmg: 14 },
  ufo: { delay: 4000, n: 3 },
  no: { delay: 350, dmg: 50, r: 2.5, edge: 25 },
  loc: { ms: 10000, r: 1.6, dps: 24 },
  khunglong: { ms: 12000, r: 1.35, dps: 38 },
  lu: { ms: 9000, dps: 10, band: 1.9 },
  dongdat: { ms: 6000, dps: 6.5 },
};
const MAX_HAZ = 6;
const pub = (u) => ({ id: String(u?.id ?? '?'), name: String(u?.name || 'Ẩn danh').slice(0, 40), avatar: u?.avatar || null });
const NATURE = { id: 'npc:troi', name: 'Ông Trời', avatar: null, npc: true };
const r2 = (n) => Math.round(n * 100) / 100;

export class PhoTiHon extends Emitter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    this.s = ctx.settings;
    this.now = ctx.now;
    this.townNo = 0;
    this.wipes = 0;
    this.fastest = 0; // ms nhanh nhất từng đánh sập một phố
    this.hall = []; // người đánh sập phố gần đây
    this.board = {}; // id → { id, name, avatar, wipes, dmg }
    this.likeAcc = 0;
    this.lastRepair = {};
    this.carry = []; // quà tặng lúc đang vinh danh → dùng cho phố mới
    this.newTown();
  }

  rand(a, b) { return a + this.ctx.random() * (b - a); }
  pick(arr) { return arr[Math.floor(this.ctx.random() * arr.length) % arr.length]; }
  get k() { return this.s.disasterScale; }

  newTown() {
    this.townNo++;
    const t = this.clock();
    this.phase = 'play';
    this.startedAt = t;
    this.endsAt = null;
    this.lastTickAt = t;
    this.hazards = []; // { id, kind, by, startAt, endsAt, path? }
    this.strikes = []; // { id, kind, by, at, x, z, target?, chain? }
    this.shieldUntil = 0;
    this.dmgBy = {}; // phá trong phố này: id → { id, name, avatar, dmg, downs }
    this.fixBy = {}; // sửa trong phố này
    this.wipedBy = null;
    this.seq = 0;
    // lô đất: 4 cột (giữa là đường lớn) × 7 hàng, bỏ hàng ven sông, bỏ ngẫu nhiên vài lô cho công viên
    const b = [];
    let pagodas = 0;
    for (const z of [-6.6, -4.6, -2.6, 3.0, 5.0, 7.0]) {
      for (const x of [-4.6, -2.3, 2.3, 4.6]) {
        if (!onIsland(x, z, 0.4) || this.ctx.random() < 0.12) continue;
        let kind = this.weighted();
        if (kind === 'pagoda' && pagodas++ >= 1) kind = 'house';
        const K = KINDS[kind];
        b.push({
          id: b.length, kind, x: r2(x + this.rand(-0.3, 0.3)), z: r2(z + this.rand(-0.25, 0.25)), rot: Math.floor(this.rand(0, 4)),
          h: kind === 'tower' ? 3 + Math.floor(this.rand(0, 4)) : kind === 'house' ? 1 + Math.floor(this.rand(0, 2)) : kind === 'pagoda' ? 3 : 1,
          hp: K.hp, max: K.hp, alive: true, color: Math.floor(this.rand(0, 6)),
        });
      }
    }
    this.buildings = b;
    const fx = [{ type: 'ph_town', no: this.townNo, count: b.length }];
    const carry = this.carry; this.carry = [];
    for (const c of carry) fx.push(...(this.action(c.id, { user: c.by }) || []));
    return fx;
  }

  weighted() {
    let r = this.ctx.random() * KIND_W.reduce((n, [, w]) => n + w, 0);
    for (const [k, w] of KIND_W) { if ((r -= w) < 0) return k; }
    return 'house';
  }

  alive() { return this.buildings.filter((b) => b.alive); }
  downPct() { return this.buildings.length ? 1 - this.alive().length / this.buildings.length : 0; }
  row(map, user) { return (map[user.id] ||= { id: user.id, name: user.name, avatar: user.avatar, dmg: 0, downs: 0, fixes: 0 }); }

  /** Gây n sát thương cho toà b. chain = phá dây chuyền (điểm ×2). */
  hurt(b, n, by, chain = false) {
    if (!b.alive || n <= 0 || this.phase !== 'play') return [];
    if (this.clock() < this.shieldUntil) return [];
    const d = Math.min(b.hp, n);
    b.hp = r2(b.hp - d);
    if (!by.npc) this.row(this.dmgBy, by).dmg += d * (chain ? 2 : 1);
    if (b.hp > 0.01) return [];
    b.hp = 0; b.alive = false;
    const K = KINDS[b.kind];
    const fx = [{ type: 'ph_down', id: b.id, kind: b.kind, x: b.x, z: b.z, h: b.h, by, chain }];
    if (!by.npc) {
      const row = this.row(this.dmgBy, by);
      row.downs++; row.dmg += (10 + K.bonus) * (chain ? 2 : 1);
      this.ctx.report?.points?.(by, (2 + K.bonus / 5) * (chain ? 2 : 1));
    }
    if (b.kind === 'tank') this.strikes.push({ id: ++this.seq, kind: 'no', by, at: this.clock() + HZ.no.delay, x: b.x, z: b.z, chain: true });
    if (this.downPct() * 100 >= this.s.wipePercent) fx.push(...this.wipe(by));
    return fx;
  }

  area(x, z, r, dmg, edge, by, chain) {
    const fx = [];
    for (const b of this.buildings) {
      const d = Math.hypot(b.x - x, b.z - z);
      if (d <= 0.6) fx.push(...this.hurt(b, dmg, by, chain));
      else if (d <= r) fx.push(...this.hurt(b, edge + (dmg - edge) * (1 - d / r) * 0.5, by, chain));
    }
    return fx;
  }

  wipe(by) {
    const t = this.clock();
    this.phase = 'wiped';
    this.wipes++;
    const ms = t - this.startedAt;
    this.fastest = this.fastest ? Math.min(this.fastest, ms) : ms;
    this.endsAt = t + this.s.resultSeconds * 1000;
    this.wipedBy = by;
    this.wipeMs = ms;
    this.hazards = []; this.strikes = [];
    if (!by.npc) {
      const r = (this.board[by.id] ||= { id: by.id, name: by.name, avatar: by.avatar, wipes: 0, dmg: 0 });
      Object.assign(r, { name: by.name, avatar: by.avatar }); r.wipes++;
      this.ctx.report?.points?.(by, 10);
    }
    for (const d of Object.values(this.dmgBy)) { const r = (this.board[d.id] ||= { id: d.id, name: d.name, avatar: d.avatar, wipes: 0, dmg: 0 }); r.dmg += Math.round(d.dmg); }
    this.hall.unshift({ user: by, town: this.townNo, ms });
    this.hall = this.hall.slice(0, 6);
    this.ctx.report?.round?.({ town: this.townNo, ms, by: by.npc ? null : by.name });
    return [{ type: 'ph_wipe', by, ms, town: this.townNo }];
  }

  // ---------------- đầu vào ----------------
  handle(ev) {
    if (this.paused || !ev?.type) return [];
    const user = pub(ev.user);
    if (ev.type === 'comment') {
      if (!String(ev.text ?? '').trim() || this.phase !== 'play' || this.s.repairPerComment <= 0) return [];
      const t = this.clock();
      if (t - (this.lastRepair[user.id] ?? -1e12) < this.s.commentCooldown * 1000) return [];
      const hurt = this.buildings.filter((b) => b.alive && b.hp < b.max);
      if (!hurt.length) return [];
      this.lastRepair[user.id] = t;
      const b = hurt.reduce((a, c) => (c.hp / c.max < a.hp / a.max ? c : a));
      b.hp = r2(Math.min(b.max, b.hp + this.s.repairPerComment));
      this.row(this.fixBy, user).fixes++;
      return [{ type: 'ph_fix', id: b.id, x: b.x, z: b.z, by: user }];
    }
    if (ev.type === 'like') {
      const every = this.s.likesPerHail;
      const before = this.likeAcc;
      this.likeAcc += Math.max(0, Number(ev.count) || 0);
      const n = Math.min(5, Math.floor(this.likeAcc / every) - Math.floor(before / every));
      if (n <= 0 || this.phase !== 'play') return [];
      const fx = [];
      for (let i = 0; i < n; i++) fx.push(...this.drop('mua', user));
      return fx;
    }
    return [];
  }

  /** Thảm hoạ rơi xuống một điểm sau một nhịp. */
  drop(kind, by) {
    const t = this.clock();
    const alive = this.alive();
    if (kind === 'set') {
      if (!alive.length) return [];
      const b = alive.reduce((a, c) => (c.h > a.h || (c.h === a.h && c.hp > a.hp) ? c : a));
      this.strikes.push({ id: ++this.seq, kind, by, at: t + HZ.set.delay, x: b.x, z: b.z, target: b.id });
    } else if (kind === 'ufo') {
      const ids = [...alive].sort((a, b) => b.hp - a.hp || a.id - b.id).slice(0, HZ.ufo.n).map((b) => b.id);
      if (!ids.length) return [];
      const c = this.buildings.find((b) => b.id === ids[0]);
      this.strikes.push({ id: ++this.seq, kind, by, at: t + HZ.ufo.delay, x: c.x, z: c.z, targets: ids });
    } else {
      const b = alive.length ? this.pick(alive) : null;
      const x = b ? b.x + this.rand(-0.4, 0.4) : this.rand(-3, 3), z = b ? b.z + this.rand(-0.4, 0.4) : this.rand(-4, 4);
      this.strikes.push({ id: ++this.seq, kind, by, at: t + HZ[kind].delay, x: r2(x), z: r2(z), target: b?.id ?? null });
    }
    if (this.strikes.length > 40) this.strikes.shift();
    return [{ type: 'ph_strike', kind, by }];
  }

  /** Thảm hoạ kéo dài (lốc, khủng long, lũ, động đất). */
  start(kind, by) {
    if (this.hazards.length >= MAX_HAZ) return false;
    const t = this.clock();
    const h = { id: ++this.seq, kind, by, startAt: t, endsAt: t + HZ[kind].ms };
    if (kind === 'loc' || kind === 'khunglong') {
      // đi từ mép này sang mép kia, nhắm vào một toà còn đứng để chắc chắn đi qua phố
      const alive = this.alive();
      const aim = alive.length ? this.pick(alive) : { x: 0, z: 0 };
      const a = this.rand(0, Math.PI * 2);
      const R = 8.5;
      const x0 = aim.x + Math.cos(a) * R, z0 = aim.z + Math.sin(a) * R;
      h.path = { x0: r2(x0), z0: r2(z0), x1: r2(aim.x * 2 - x0), z1: r2(aim.z * 2 - z0), w: kind === 'loc' ? r2(this.rand(1, 2.2)) : 0.4, f: kind === 'loc' ? 1.5 : 1 };
    }
    this.hazards.push(h);
    return [{ type: 'ph_hazard', kind, by }];
  }

  action(id, ev = {}) {
    if (this.paused) return false;
    const by = pub(ev.user);
    if (this.phase !== 'play') {
      if (this.carry.length >= 20) return false;
      this.carry.push({ id, by });
      return [{ type: 'ph_gift', action: id, by, later: true }];
    }
    const t = this.clock();
    let fx;
    switch (id) {
      case 'thienthach': case 'set': case 'ufo': fx = this.drop(id, by); break;
      case 'loc': case 'khunglong': case 'lu': case 'dongdat': fx = this.start(id, by); break;
      case 'khien':
        this.shieldUntil = Math.min(t + 90_000, Math.max(t, this.shieldUntil) + this.s.shieldSeconds * 1000);
        fx = [{ type: 'ph_shield', by }];
        break;
      case 'thoxay': {
        let n = 0;
        for (const b of this.buildings) { if (!b.alive || b.hp < b.max) { if (!b.alive) n++; b.alive = true; b.hp = b.max; } }
        this.row(this.fixBy, by).fixes += 10;
        fx = [{ type: 'ph_rebuild', by, n }];
        break;
      }
      default: return [];
    }
    if (fx === false) return false;
    return [{ type: 'ph_gift', action: id, by }, ...fx];
  }

  command(id) {
    if (id === 'next') return this.newTown();
    if (id === 'wipe') return this.phase === 'play' ? this.wipe(NATURE) : [];
    if (id === 'clear-board') { this.board = {}; this.hall = []; return [{ type: 'ph_board_cleared' }]; }
    return [];
  }

  tick() {
    if (this.paused) return [];
    const t = this.clock();
    const fx = [];
    if (this.phase === 'wiped') {
      if (t >= this.endsAt) fx.push(...this.newTown());
      return fx;
    }
    const dt = Math.max(0, Math.min(2000, t - this.lastTickAt)) / 1000;
    this.lastTickAt = t;
    const k = this.k;
    // điểm rơi tới giờ
    const due = this.strikes.filter((s) => s.at <= t);
    this.strikes = this.strikes.filter((s) => s.at > t);
    for (const s of due) {
      if (this.phase !== 'play') break;
      fx.push({ type: 'ph_impact', kind: s.kind, x: s.x, z: s.z, by: s.by, chain: !!s.chain });
      if (s.kind === 'thienthach' || s.kind === 'no') fx.push(...this.area(s.x, s.z, HZ[s.kind].r, HZ[s.kind].dmg * k, HZ[s.kind].edge * k, s.by, !!s.chain));
      else if (s.kind === 'set' || s.kind === 'mua') { const b = this.buildings.find((x) => x.id === s.target); if (b) fx.push(...this.hurt(b, HZ[s.kind].dmg * k, s.by)); }
      else if (s.kind === 'ufo') for (const id of s.targets || []) { const b = this.buildings.find((x) => x.id === id); if (b) fx.push(...this.hurt(b, 1e6, s.by)); }
    }
    // thảm hoạ kéo dài
    for (const h of this.hazards) {
      if (this.phase !== 'play') break;
      const H = HZ[h.kind];
      const dmg = H.dps * k * dt;
      if (h.path) {
        const p = pathAt(h.path, (t - h.startAt) / (h.endsAt - h.startAt));
        for (const b of this.buildings) if (Math.hypot(b.x - p.x, b.z - p.z) <= H.r) fx.push(...this.hurt(b, dmg, h.by));
      } else if (h.kind === 'lu') {
        const rise = Math.min(1, (t - h.startAt) / 2500);
        for (const b of this.buildings) if (Math.abs(b.z - ISLAND.riverZ) <= H.band + 1.0 * rise) fx.push(...this.hurt(b, dmg * (b.kind === 'tower' ? 0.5 : 1), h.by));
      } else if (h.kind === 'dongdat') {
        for (const b of this.buildings) fx.push(...this.hurt(b, dmg, h.by));
      }
    }
    this.hazards = this.hazards.filter((h) => h.endsAt > t);
    return fx;
  }

  onResume(d) {
    for (const h of this.hazards) { h.startAt += d; h.endsAt += d; }
    for (const s of this.strikes) s.at += d;
    if (this.shieldUntil) this.shieldUntil += d;
  }

  snapshot() {
    const t = this.clock();
    const top = (m, f) => Object.values(m).filter((r) => r[f] > 0).sort((a, b) => b[f] - a[f] || (a.id < b.id ? -1 : 1)).slice(0, 5)
      .map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, [f]: Math.round(r[f]), downs: r.downs }));
    return {
      phase: this.phase,
      paused: !!this.paused,
      townNo: this.townNo,
      wipes: this.wipes,
      fastestMs: this.fastest,
      elapsedMs: Math.max(0, (this.phase === 'play' ? t : this.startedAt + this.wipeMs) - this.startedAt),
      buildings: this.buildings.map((b) => ({ id: b.id, kind: b.kind, x: b.x, z: b.z, rot: b.rot, h: b.h, color: b.color, alive: b.alive, hp: Math.round((b.hp / b.max) * 100) / 100 })),
      downPct: Math.round(this.downPct() * 100),
      wipePercent: this.s.wipePercent,
      showBoard: this.s.showBoard,
      hazards: this.hazards.map((h) => ({ id: h.id, kind: h.kind, by: h.by, path: h.path || null, doneMs: t - h.startAt, totalMs: h.endsAt - h.startAt })),
      strikes: this.strikes.map((s) => ({ id: s.id, kind: s.kind, by: s.by, x: s.x, z: s.z, leftMs: s.at - t, targets: s.targets || null })),
      shieldMs: Math.max(0, this.shieldUntil - t),
      top: top(this.dmgBy, 'dmg'),
      fixers: top(this.fixBy, 'fixes').slice(0, 3),
      wipedBy: this.phase === 'wiped' ? this.wipedBy : null,
      nextInMs: this.phase === 'wiped' ? Math.max(0, this.endsAt - t) : 0,
      carry: this.carry.length,
      hall: this.hall.slice(0, 5),
      legends: Object.values(this.board).filter((r) => r.wipes > 0).sort((a, b) => b.wipes - a.wipes || b.dmg - a.dmg).slice(0, 5),
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), trigger: b.trigger })),
    };
  }

  serialize() {
    return {
      townNo: this.townNo, wipes: this.wipes, fastest: this.fastest, hall: this.hall, board: this.board, likeAcc: this.likeAcc, carry: this.carry,
      phase: this.phase, startedAt: this.startedAt, endsAt: this.endsAt, lastTickAt: this.lastTickAt, hazards: this.hazards, strikes: this.strikes,
      shieldUntil: this.shieldUntil, dmgBy: this.dmgBy, fixBy: this.fixBy, wipedBy: this.wipedBy, wipeMs: this.wipeMs, seq: this.seq, buildings: this.buildings,
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !['play', 'wiped'].includes(s.phase) || !Array.isArray(s.buildings) || !Array.isArray(s.hazards) || !Array.isArray(s.strikes)) return;
    if (!s.buildings.every((b) => b && KINDS[b.kind] && Number.isFinite(b.x) && Number.isFinite(b.z) && Number.isFinite(b.hp))) return;
    if (s.phase === 'wiped' && !Number.isFinite(s.endsAt)) return;
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of Object.keys(this.serialize())) if (k in copy) this[k] = copy[k];
    this.hazards = this.hazards.filter((h) => HZ[h?.kind] && Number.isFinite(h.endsAt));
    this.strikes = this.strikes.filter((x) => HZ[x?.kind] && Number.isFinite(x.at));
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(PhoTiHon);

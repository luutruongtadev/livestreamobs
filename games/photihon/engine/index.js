import { Emitter, makePausable, triggerText, triggerIcon } from '#sdk';
import { pathAt, ISLAND } from './path.js';

/**
 * Phố Tí Hon: một thị trấn tí hon trên hòn đảo nổi. Người xem tặng quà để gọi thảm hoạ phá phố,
 * bình luận để làm "dân phố" chạy ra sửa nhà. Phố sập đủ wipePercent % → vinh danh người đánh sập → phố mới mọc lên.
 * - Thảm hoạ tức thời rơi xuống sau một nhịp: thiên thạch (vùng), sét (toà cao nhất), mưa đá (tim), UFO (hút 3 toà to nhất).
 * - Thảm hoạ kéo dài: lốc xoáy và trâu khổng lồ đi xuyên phố theo đường lượn, lũ dâng ở hai bờ sông, động đất rung cả phố.
 * - Cây xăng sập thì nổ, phá nhà xung quanh: phá dây chuyền tính điểm ×2 cho người gây ra.
 * - Khiên che cả phố một lúc; thợ xây dựng lại mọi đống đổ nát.
 * Pha: play → wiped (vinh danh) → play (phố mới). Quà tặng lúc đang vinh danh để dành cho phố mới.
 *
 * Chế độ "host" (streamer tự chơi, cửa sổ ?play=1): streamer giữ phố trong hostSeconds giây — bấm toà để sửa,
 * bấm thiên thạch / mây sét / UFO đang rơi để bắn hạ, bấm lốc / trâu để đuổi bớt (tốn năng lượng, tự hồi).
 * Người xem tặng quà phá phố. Hết giờ phố còn đứng → streamer thắng; sập trước → người đánh sập thắng.
 * Ông Trời thả thảm hoạ nhẹ định kỳ (ambientSeconds) để lúc vắng quà streamer vẫn có việc.
 *
 * Dừng thời gian (slowmo): toà lớn (chung cư, đình, cây xăng), nổ dây chuyền hoặc toà cuối cùng làm sập phố do người xem gây ra
 * → mọi đồng hồ trong game đứng yên slowmoSeconds giây (thảm hoạ treo giữa không trung, giờ giữ phố không chạy) để overlay
 * chiếu cảnh toà sập chậm. Cách nhau ít nhất slowmoCooldown giây.
 *
 * Bản đồ chia vùng: bắc sông là THÀNH PHỐ (cao ốc, chung cư, nhà ống, chợ), nam sông là LÀNG QUÊ (nhà cấp 4, đình, ruộng lúa),
 * mép đông là BỜ BIỂN (bãi cát, bến tàu có ghe đánh cá). Cây xăng chỉ ở lô sát đường lớn.
 * Mục tiêu: luôn có một NHIỆM VỤ cho người xem (đánh sập toà được đánh dấu, phá n toà loại X, làm nổ cây xăng, phá nhanh n toà),
 * xong thì người hoàn thành được thưởng điểm; chế độ streamer: người xem xong nhiệm vụ → streamer phải giữ thêm giờ, hết giờ nhiệm vụ → streamer được ⚡.
 * Biến cố: định kỳ Bão về (thảm hoạ mạnh hơn), Giờ vàng (điểm ×2), Đội cứu hộ (bình luận sửa ×3), Triều cường (sóng đánh bờ biển), Tết đến (cả phố hồi máu).
 * May rủi: mỗi quà thảm hoạ có thể CHÍ MẠNG (×2) hoặc XỊT (rơi xuống biển), Hộp bí ẩn quay ra một thảm hoạ ngẫu nhiên, hiếm khi trúng Mưa thiên thạch.
 */
export function createGame(ctx) { return new PhoTiHon(ctx); }

export const KINDS = {
  house: { name: 'Nhà ống', hp: 40, bonus: 0 },
  shop: { name: 'Tiệm tạp hoá', hp: 55, bonus: 0 },
  tower: { name: 'Chung cư', hp: 90, bonus: 5 },
  tank: { name: 'Cây xăng', hp: 30, bonus: 0 },
  pagoda: { name: 'Đình làng', hp: 120, bonus: 20 },
  cap4: { name: 'Nhà cấp 4', hp: 32, bonus: 0 },
  cho: { name: 'Chợ', hp: 50, bonus: 3 },
  caoc: { name: 'Cao ốc', hp: 140, bonus: 15 },
  ben: { name: 'Bến tàu', hp: 60, bonus: 8 },
};
// bố cục: cột lô (x) — đường lớn ở x = 0, bãi biển từ x ≈ 2,6, biển từ x ≈ 3,3; hàng lô (z) — sông ở z ≈ 0,2
const COLS = [-5.2, -3.3, -1.45, 1.6];
const ROAD_COL = (x) => Math.abs(x) < 2;
const CITY_Z = [-7.2, -5.0, -2.8], COUNTRY_Z = [2.6, 4.8, 7.0];
const PIERS = [[4.75, -5.2], [4.75, 4.6]];
const CITY_W = [['tower', 26], ['house', 30], ['shop', 16], ['caoc', 14], ['cho', 8]];
const COUNTRY_W = [['cap4', 52], ['house', 12], ['shop', 10], ['pagoda', 6]];
const MAX_OF = { caoc: 2, cho: 1, pagoda: 1 };
// biến cố
export const EVENTS = {
  bao: { name: 'Bão về', icon: '🌀', ms: 15000, desc: 'thảm hoạ mạnh ×1.5' },
  giovang: { name: 'Giờ vàng', icon: '⭐', ms: 15000, desc: 'điểm phá ×2' },
  cuuho: { name: 'Đội cứu hộ', icon: '🚒', ms: 15000, desc: 'bình luận sửa nhà ×3' },
  trieucuong: { name: 'Triều cường', icon: '🌊', ms: 8000, desc: 'sóng đánh nhà ven biển' },
  tet: { name: 'Tết đến', icon: '🧧', ms: 5000, desc: 'cả phố hồi 25% máu' },
};
const EVENT_W = [['bao', 24], ['giovang', 24], ['cuuho', 18], ['trieucuong', 18], ['tet', 10]];
const DISASTERS = new Set(['thienthach', 'set', 'loc', 'lu', 'dongdat', 'khunglong', 'ufo']);
const MYSTERY_W = [['thienthach', 30], ['set', 18], ['loc', 12], ['lu', 9], ['dongdat', 9], ['khunglong', 7], ['ufo', 5], ['muathienthach', 4], ['khien', 6]];
const wpick = (list, r) => { let x = r * list.reduce((n, [, w]) => n + w, 0); for (const [k, w] of list) { if ((x -= w) < 0) return k; } return list[0][0]; };
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
const STREAMER = { id: 'host', name: 'Streamer', avatar: null, npc: true };
const SHOOTABLE = new Set(['thienthach', 'set', 'ufo', 'mua', 'no']);
const BIG = new Set(['tower', 'pagoda', 'tank', 'caoc', 'ben']);
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
    this.hostWins = 0;
    this.viewerWins = 0;
    this.freeze = null; // cảnh dừng thời gian đang chiếu
    this.freezeUntil = 0;
    this.nextSlowmoAt = 0;
    this.newTown();
  }

  rand(a, b) { return a + this.ctx.random() * (b - a); }
  pick(arr) { return arr[Math.floor(this.ctx.random() * arr.length) % arr.length]; }
  get k() { return this.s.disasterScale * (this.eventIs('bao') ? 1.5 : 1); }
  eventIs(id) { return this.event?.id === id && this.clock() < this.event.until; }
  get hostMode() { return this.s.mode === 'host'; }

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
    this.winner = null; // 'host' | 'viewers' (chế độ host)
    this.wipeMs = 0;
    this.seq = 0;
    // chế độ host: giờ giữ phố, năng lượng, thống kê
    this.hostEndsAt = this.hostMode ? t + this.s.hostSeconds * 1000 : 0;
    this.energy = this.s.hostEnergy;
    this.energyAt = t;
    this.nextAmbientAt = t + this.s.ambientSeconds * 1000;
    this.hostStats = { fixes: 0, shots: 0, chased: 0 };
    // lô đất theo vùng: thành phố (bắc sông), làng quê (nam sông, có ruộng lúa), bến tàu ở biển phía đông
    const b = [], count = {}, fields = [];
    const add = (kind, x, z, jit = 0.12) => {
      const K = KINDS[kind];
      count[kind] = (count[kind] || 0) + 1;
      b.push({
        id: b.length, kind, x: r2(x + this.rand(-jit, jit)), z: r2(z + this.rand(-jit, jit)), rot: Math.floor(this.rand(0, 4)),
        h: kind === 'caoc' ? 6 + Math.floor(this.rand(0, 4)) : kind === 'tower' ? 3 + Math.floor(this.rand(0, 4)) : kind === 'house' ? 1 + Math.floor(this.rand(0, 2)) : kind === 'pagoda' ? 3 : 1,
        hp: K.hp, max: K.hp, alive: true, color: Math.floor(this.rand(0, 6)), zone: x > 3 ? 'coast' : z < 0 ? 'city' : 'country',
      });
    };
    const roadLots = [];
    for (const [zs, W, park, zone] of [[CITY_Z, CITY_W, 0.08, 'city'], [COUNTRY_Z, COUNTRY_W, 0.3, 'country']]) {
      let tanks = 0;
      for (const z of zs) for (const x of COLS) {
        if (ROAD_COL(x)) roadLots.push(b.length);
        if (ROAD_COL(x) && !tanks && this.ctx.random() < 0.3) { tanks++; add('tank', x, z); continue; }
        if (this.ctx.random() < park) { if (zone === 'country') fields.push({ x, z }); continue; }
        let kind = wpick(W, this.ctx.random());
        if ((count[kind] || 0) >= (MAX_OF[kind] ?? 99) || (kind === 'pagoda' && ROAD_COL(x)) || (kind === 'caoc' && x > 0)) kind = zone === 'city' ? 'house' : 'cap4';
        add(kind, x, z);
      }
    }
    if (!count.tank) { const i = roadLots.find((n) => b[n]); if (i != null) { const t0 = b[i]; t0.kind = 'tank'; t0.h = 1; t0.hp = t0.max = KINDS.tank.hp; } } // luôn có ít nhất 1 cây xăng sát đường
    for (const [x, z] of PIERS) add('ben', x, z, 0.05);
    this.fields = fields;
    this.buildings = b;
    // nhiệm vụ + biến cố của phố này
    this.mission = null;
    this.nextMissionAt = t + 4000;
    this.missionSeq ||= 0;
    this.event = null;
    this.nextEventAt = t + this.s.eventEvery * 1000;
    const fx = [{ type: 'ph_town', no: this.townNo, count: b.length }];
    const carry = this.carry; this.carry = [];
    for (const c of carry) fx.push(...(this.action(c.id, { user: c.by }) || []));
    return fx;
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
    const mul = (chain ? 2 : 1) * (this.eventIs('giovang') ? 2 : 1);
    if (!by.npc) this.row(this.dmgBy, by).dmg += d * mul;
    if (b.hp > 0.01) return [];
    b.hp = 0; b.alive = false;
    const K = KINDS[b.kind];
    const fx = [{ type: 'ph_down', id: b.id, kind: b.kind, x: b.x, z: b.z, h: b.h, by, chain }];
    if (!by.npc) {
      const row = this.row(this.dmgBy, by);
      row.downs++; row.dmg += (10 + K.bonus) * mul;
      this.ctx.report?.points?.(by, (2 + K.bonus / 5) * mul);
      fx.push(...this.progress(b, by));
    }
    const willWipe = (this.downPct() * 100 >= this.s.wipePercent);
    if (this.s.slowmo && !by.npc && (BIG.has(b.kind) || chain || willWipe)) this.slowmo(b, by, chain, willWipe);
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
    this.mission = null; this.event = null;
    if (this.hostMode) { this.winner = 'viewers'; this.viewerWins++; }
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

  /** Dừng thời gian để chiếu cảnh toà b sập chậm (nếu đã hết thời gian chờ). */
  slowmo(b, by, chain, final) {
    const t = this.clock();
    if (t < this.nextSlowmoAt && !final) return;
    if (t < this.freezeUntil) return;
    const ms = Math.round(this.s.slowmoSeconds * 1000);
    this.freeze = { id: b.id, kind: b.kind, x: b.x, z: b.z, h: b.h, by, chain: !!chain, final: !!final, ms };
    this.freezeUntil = t + ms;
    this.nextSlowmoAt = this.freezeUntil + this.s.slowmoCooldown * 1000;
  }

  /** Dời mọi mốc thời gian đi d ms (tạm dừng / dừng thời gian). */
  shift(d) {
    for (const h of this.hazards) { h.startAt += d; h.endsAt += d; }
    for (const s of this.strikes) s.at += d;
    if (this.shieldUntil) this.shieldUntil += d;
    if (this.hostEndsAt) this.hostEndsAt += d;
    this.energyAt += d; this.nextAmbientAt += d;
    if (this.mission) { this.mission.until += d; this.mission.startAt += d; }
    if (this.event) { this.event.until += d; this.event.startAt += d; }
    this.nextMissionAt += d; this.nextEventAt += d;
  }

  // ---------------- nhiệm vụ ----------------
  /** Ra nhiệm vụ mới dựa trên các toà còn đứng. */
  newMission() {
    const t = this.clock();
    const alive = this.alive();
    if (alive.length < 3) return [];
    const by = {};
    for (const b of alive) (by[b.kind] ||= []).push(b);
    const opts = [];
    const big = alive.filter((b) => BIG.has(b.kind) && b.kind !== 'tank');
    if (big.length) opts.push('topple');
    if (Object.values(by).some((l) => l.length >= 2)) opts.push('count');
    if (by.tank) opts.push('chain');
    if (alive.length >= 6) opts.push('speed');
    const type = this.pick(opts);
    const m = { id: ++this.missionSeq, type, got: 0, n: 1, startAt: t, until: t + this.s.missionSeconds * 1000, reward: this.s.missionReward };
    if (type === 'topple') { const b = this.pick(big); Object.assign(m, { target: b.id, kind: b.kind, label: `Đánh sập ${KINDS[b.kind].name} 🎯` }); m.reward = Math.round(m.reward * 1.5); }
    else if (type === 'count') { const kinds = Object.keys(by).filter((k) => by[k].length >= 2); const kind = this.pick(kinds); m.kind = kind; m.n = Math.min(3, by[kind].length); m.label = `Phá ${m.n} ${KINDS[kind].name}`; }
    else if (type === 'chain') { m.kind = 'tank'; m.label = 'Làm nổ cây xăng 🔥'; }
    else { m.n = 4; m.until = t + Math.min(this.s.missionSeconds, 30) * 1000; m.label = `Phá ${m.n} toà trong ${Math.round((m.until - t) / 1000)} giây`; }
    this.mission = m;
    return [{ type: 'ph_mission_new', label: m.label, target: m.target ?? null }];
  }

  /** Một toà vừa đổ do người xem: cập nhật nhiệm vụ. */
  progress(b, by) {
    const m = this.mission;
    if (!m || m.done || this.clock() > m.until) return [];
    if (m.type === 'topple' && b.id !== m.target) return [];
    if ((m.type === 'count' || m.type === 'chain') && b.kind !== m.kind) return [];
    m.got++;
    if (m.got < m.n) return [{ type: 'ph_mission_step', got: m.got, n: m.n }];
    m.done = true;
    this.mission = null;
    this.nextMissionAt = this.clock() + 6000;
    this.row(this.dmgBy, by).dmg += m.reward;
    this.ctx.report?.points?.(by, Math.round(m.reward / 10));
    if (this.hostMode) this.hostEndsAt += this.s.missionPenaltySeconds * 1000;
    return [{ type: 'ph_mission', ok: true, by, label: m.label, reward: m.reward, penalty: this.hostMode ? this.s.missionPenaltySeconds : 0 }];
  }

  // ---------------- biến cố ----------------
  startEvent() {
    const t = this.clock();
    const id = wpick(EVENT_W, this.ctx.random());
    const E = EVENTS[id];
    this.event = { id, startAt: t, until: t + E.ms };
    if (id === 'tet') for (const b of this.buildings) if (b.alive) b.hp = r2(Math.min(b.max, b.hp + b.max * 0.25));
    return [{ type: 'ph_event', id, name: E.name, icon: E.icon, desc: E.desc }];
  }

  /** Quà thảm hoạ: tung xúc xắc may rủi. Trả 'crit' | 'miss' | null. */
  luck() {
    if (!this.s.luck) return null;
    const r = this.ctx.random() * 100;
    if (r < this.s.critChance) return 'crit';
    if (r > 100 - this.s.missChance) return 'miss';
    return null;
  }

  /** Chế độ host: hết giờ mà phố còn đứng → streamer thắng. */
  survive() {
    const t = this.clock();
    this.phase = 'wiped';
    this.winner = 'host';
    this.hostWins++;
    this.mission = null; this.event = null;
    this.wipedBy = null;
    this.wipeMs = t - this.startedAt;
    this.endsAt = t + this.s.resultSeconds * 1000;
    this.hazards = []; this.strikes = [];
    for (const d of Object.values(this.dmgBy)) { const r = (this.board[d.id] ||= { id: d.id, name: d.name, avatar: d.avatar, wipes: 0, dmg: 0 }); r.dmg += Math.round(d.dmg); }
    this.ctx.report?.round?.({ town: this.townNo, ms: this.wipeMs, by: null, host: true });
    return [{ type: 'ph_survive', town: this.townNo, downPct: Math.round(this.downPct() * 100), stats: { ...this.hostStats } }];
  }

  /** Năng lượng của streamer (tự hồi theo thời gian). */
  regen(t) {
    const every = this.s.energyRegenSeconds * 1000;
    if (this.energy >= this.s.hostEnergy) { this.energyAt = t; return; }
    const n = Math.floor((t - this.energyAt) / every);
    if (n > 0) { this.energy = Math.min(this.s.hostEnergy, this.energy + n); this.energyAt += n * every; }
  }

  /** Đầu vào tại chỗ của streamer (cửa sổ chơi): bấm toà / điểm rơi / thảm hoạ. */
  input(ev = {}) {
    if (this.paused || !this.hostMode || !ev || typeof ev !== 'object' || this.phase !== 'play') return [];
    const t = this.clock();
    if (t < this.freezeUntil) return [];
    this.regen(t);
    if (ev.type === 'fix') {
      const b = this.buildings.find((x) => x.id === ev.id);
      if (!b || !b.alive || b.hp >= b.max) return [];
      if (t - (this.lastHostFix ?? -1e12) < 120) return []; // chống bấm máy
      this.lastHostFix = t;
      b.hp = r2(Math.min(b.max, b.hp + b.max * this.s.hostRepair / 100));
      this.hostStats.fixes++;
      return [{ type: 'ph_fix', id: b.id, x: b.x, z: b.z, by: STREAMER, host: true }];
    }
    if (this.energy < 1) return [{ type: 'ph_noenergy' }];
    if (ev.type === 'shoot') {
      const i = this.strikes.findIndex((x) => x.id === ev.id);
      if (i < 0) return [];
      const st = this.strikes[i];
      if (!SHOOTABLE.has(st.kind) || st.at - t < 150) return []; // sắp chạm đất thì không kịp
      this.strikes.splice(i, 1);
      this.energy--; this.hostStats.shots++;
      return [{ type: 'ph_shot', id: st.id, kind: st.kind, x: st.x, z: st.z, by: st.by }];
    }
    if (ev.type === 'chase') {
      const h = this.hazards.find((x) => x.id === ev.id);
      if (!h || h.endsAt - t < 300) return [];
      h.endsAt = Math.max(t + 200, h.endsAt - this.s.chaseSeconds * 1000);
      this.energy--; this.hostStats.chased++;
      return [{ type: 'ph_chase', id: h.id, kind: h.kind, by: h.by }];
    }
    return [];
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
      b.hp = r2(Math.min(b.max, b.hp + this.s.repairPerComment * (this.eventIs('cuuho') ? 3 : 1)));
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
  drop(kind, by, luck = null) {
    const t = this.clock();
    if (luck === 'miss') { // XỊT: rơi xuống biển, không trúng toà nào
      const k2 = kind === 'ufo' ? 'thienthach' : kind;
      this.strikes.push({ id: ++this.seq, kind: k2, by, at: t + HZ[k2].delay, x: r2(this.rand(4.0, 5.7)), z: r2(this.rand(-1.5, 1.5) + (this.ctx.random() < 0.5 ? -4.5 : 4.5)), target: null, miss: true });
      return [{ type: 'ph_strike', kind, by }];
    }
    // toà đã bị sét / UFO khác nhắm thì để dành cho quà sau (tặng liên tiếp không trùng mục tiêu)
    const aimed = new Set(this.strikes.flatMap((x) => (x.kind === 'ufo' ? x.targets : x.kind === 'set' ? [x.target] : [])));
    const all = this.alive();
    const alive = kind === 'set' || kind === 'ufo' ? (all.filter((b) => !aimed.has(b.id)).length ? all.filter((b) => !aimed.has(b.id)) : all) : all;
    if (kind === 'set') {
      if (!alive.length) return [];
      const b = alive.reduce((a, c) => (c.h > a.h || (c.h === a.h && c.hp > a.hp) ? c : a));
      this.strikes.push({ id: ++this.seq, kind, by, at: t + HZ.set.delay, x: b.x, z: b.z, target: b.id, mult: luck === 'crit' ? 2 : 1 });
    } else if (kind === 'ufo') {
      const ids = [...alive].sort((a, b) => b.hp - a.hp || a.id - b.id).slice(0, HZ.ufo.n).map((b) => b.id);
      if (!ids.length) return [];
      const c = this.buildings.find((b) => b.id === ids[0]);
      this.strikes.push({ id: ++this.seq, kind, by, at: t + HZ.ufo.delay, x: c.x, z: c.z, targets: ids });
    } else {
      const b = alive.length ? this.pick(alive) : null;
      const x = b ? b.x + this.rand(-0.4, 0.4) : this.rand(-3, 3), z = b ? b.z + this.rand(-0.4, 0.4) : this.rand(-4, 4);
      this.strikes.push({ id: ++this.seq, kind, by, at: t + HZ[kind].delay, x: r2(x), z: r2(z), target: b?.id ?? null, mult: luck === 'crit' ? 2 : 1 });
    }
    if (this.strikes.length > 40) this.strikes.shift();
    return [{ type: 'ph_strike', kind, by }];
  }

  /** Thảm hoạ kéo dài (lốc, khủng long, lũ, động đất). */
  start(kind, by, luck = null) {
    if (this.hazards.length >= MAX_HAZ) return false;
    const t = this.clock();
    const h = { id: ++this.seq, kind, by, startAt: t, endsAt: t + HZ[kind].ms * (luck === 'miss' ? 0.4 : 1), mult: luck === 'crit' ? 2 : 1 };
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

  action(id, ev = {}, fromMystery = false) {
    if (this.paused) return false;
    const by = pub(ev.user);
    if (this.phase !== 'play') {
      if (this.carry.length >= 20) return false;
      this.carry.push({ id, by });
      return [{ type: 'ph_gift', action: id, by, later: true }];
    }
    const t = this.clock();
    if (id === 'hopbi') { // hộp bí ẩn: quay ra một thảm hoạ ngẫu nhiên
      const res = wpick(MYSTERY_W, this.ctx.random());
      const out = this.action(res, ev, true);
      if (out === false) return false;
      return [{ type: 'ph_mystery', result: res, by }, ...out];
    }
    const luck = DISASTERS.has(id) ? this.luck() : null;
    let fx;
    switch (id) {
      case 'thienthach': case 'set': case 'ufo': fx = this.drop(id, by, luck); break;
      case 'loc': case 'khunglong': case 'lu': case 'dongdat': fx = this.start(id, by, luck); break;
      case 'muathienthach': { // jackpot hộp bí ẩn: 5 thiên thạch rơi liên tiếp
        fx = [];
        for (let i = 0; i < 5; i++) { fx.push(...this.drop('thienthach', by)); this.strikes[this.strikes.length - 1].at += i * 350; }
        break;
      }
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
    const out = [{ type: 'ph_gift', action: id, by, mystery: fromMystery }, ...fx];
    if (luck) out.push({ type: 'ph_luck', luck, action: id, by });
    return out;
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
    if (t < this.freezeUntil) { // dừng thời gian: mọi đồng hồ đứng yên
      const d = Math.max(0, t - this.lastTickAt);
      this.lastTickAt = t;
      this.shift(d); this.startedAt += d;
      if (this.phase === 'wiped') this.endsAt += d;
      return fx;
    }
    if (this.freeze) { this.freeze = null; this.lastTickAt = t; }
    if (this.phase === 'wiped') {
      if (t >= this.endsAt) fx.push(...this.newTown());
      return fx;
    }
    const dt = Math.max(0, Math.min(2000, t - this.lastTickAt)) / 1000;
    this.lastTickAt = t;
    const k = this.k;
    if (this.hostMode) {
      if (!this.hostEndsAt) this.hostEndsAt = t + this.s.hostSeconds * 1000; // vừa đổi sang chế độ host giữa chừng
      this.regen(t);
      if (t >= this.hostEndsAt) return this.survive();
      if (this.s.ambientSeconds > 0 && t >= this.nextAmbientAt) {
        this.nextAmbientAt = t + this.s.ambientSeconds * 1000 * this.rand(0.7, 1.3);
        fx.push(...this.drop(this.ctx.random() < 0.7 ? 'mua' : 'thienthach', NATURE));
      }
    }
    // điểm rơi tới giờ
    const due = this.strikes.filter((s) => s.at <= t);
    this.strikes = this.strikes.filter((s) => s.at > t);
    for (const s of due) {
      if (this.phase !== 'play') break;
      fx.push({ type: 'ph_impact', kind: s.kind, x: s.x, z: s.z, by: s.by, chain: !!s.chain, miss: !!s.miss });
      if (s.miss) continue; // xịt: rơi xuống biển
      const mk = k * (s.mult || 1);
      if (s.kind === 'thienthach' || s.kind === 'no') fx.push(...this.area(s.x, s.z, HZ[s.kind].r, HZ[s.kind].dmg * mk, HZ[s.kind].edge * mk, s.by, !!s.chain));
      else if (s.kind === 'set' || s.kind === 'mua') { const b = this.buildings.find((x) => x.id === s.target); if (b) fx.push(...this.hurt(b, HZ[s.kind].dmg * mk, s.by)); }
      else if (s.kind === 'ufo') for (const id of s.targets || []) { const b = this.buildings.find((x) => x.id === id); if (b) fx.push(...this.hurt(b, 1e6, s.by)); }
    }
    // thảm hoạ kéo dài
    for (const h of this.hazards) {
      if (this.phase !== 'play') break;
      const H = HZ[h.kind];
      const dmg = H.dps * k * (h.mult || 1) * dt;
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
    if (this.phase !== 'play') return fx;
    // triều cường: sóng đánh nhà ven biển (Ông Trời, không tính điểm)
    if (this.eventIs('trieucuong')) for (const b of this.buildings) if (b.x > 1) fx.push(...this.hurt(b, (b.kind === 'ben' ? 7 : 3.5) * dt, NATURE));
    if (this.phase !== 'play') return fx;
    // nhiệm vụ
    if (this.s.missions) {
      const m = this.mission;
      if (m && t > m.until) {
        this.mission = null; this.nextMissionAt = t + 5000;
        if (this.hostMode) this.energy = Math.min(this.s.hostEnergy, this.energy + 2);
        fx.push({ type: 'ph_mission', ok: false, label: m.label, host: this.hostMode });
      } else if (m?.type === 'topple' && !this.buildings.find((b) => b.id === m.target)?.alive) { this.mission = null; this.nextMissionAt = t + 3000; } // toà mục tiêu đổ vì Ông Trời
      else if (!m && t >= this.nextMissionAt) fx.push(...this.newMission());
    }
    // biến cố
    if (this.s.eventEvery > 0 && t >= this.nextEventAt) { this.nextEventAt = t + this.s.eventEvery * 1000 * this.rand(0.8, 1.2); fx.push(...this.startEvent()); }
    return fx;
  }

  onResume(d) {
    this.shift(d);
    if (this.freezeUntil) this.freezeUntil += d;
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
      mode: this.hostMode ? 'host' : 'viewers',
      winner: this.phase === 'wiped' ? this.winner : null,
      hostLeftMs: this.hostMode && this.phase === 'play' ? Math.max(0, this.hostEndsAt - t) : 0,
      hostSeconds: this.s.hostSeconds,
      energy: this.hostMode ? this.energy : 0,
      maxEnergy: this.s.hostEnergy,
      energyInMs: this.hostMode && this.energy < this.s.hostEnergy ? Math.max(0, this.energyAt + this.s.energyRegenSeconds * 1000 - t) : 0,
      hostStats: this.hostStats,
      score: { host: this.hostWins, viewers: this.viewerWins },
      cam: { zoom: this.s.cameraZoom !== false, hold: this.s.zoomSeconds },
      fields: this.fields || [],
      mission: this.mission ? { type: this.mission.type, label: this.mission.label, got: this.mission.got, n: this.mission.n, target: this.mission.target ?? null, leftMs: Math.max(0, this.mission.until - t), totalMs: this.mission.until - this.mission.startAt, reward: this.mission.reward } : null,
      event: this.event && t < this.event.until ? { id: this.event.id, ...EVENTS[this.event.id], leftMs: this.event.until - t } : null,
      slowmo: this.freeze && t < this.freezeUntil ? { ...this.freeze, leftMs: this.freezeUntil - t } : null,
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), trigger: b.trigger })),
    };
  }

  serialize() {
    return {
      townNo: this.townNo, wipes: this.wipes, fastest: this.fastest, hall: this.hall, board: this.board, likeAcc: this.likeAcc, carry: this.carry,
      phase: this.phase, startedAt: this.startedAt, endsAt: this.endsAt, lastTickAt: this.lastTickAt, hazards: this.hazards, strikes: this.strikes,
      shieldUntil: this.shieldUntil, dmgBy: this.dmgBy,
      winner: this.winner, hostWins: this.hostWins, viewerWins: this.viewerWins, hostEndsAt: this.hostEndsAt, energy: this.energy, energyAt: this.energyAt,
      nextAmbientAt: this.nextAmbientAt, hostStats: this.hostStats, freeze: this.freeze, freezeUntil: this.freezeUntil, nextSlowmoAt: this.nextSlowmoAt,
      fields: this.fields, mission: this.mission, nextMissionAt: this.nextMissionAt, missionSeq: this.missionSeq, event: this.event, nextEventAt: this.nextEventAt, fixBy: this.fixBy, wipedBy: this.wipedBy, wipeMs: this.wipeMs, seq: this.seq, buildings: this.buildings,
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
    const t = this.clock();
    if (!this.hostStats || typeof this.hostStats !== 'object') this.hostStats = { fixes: 0, shots: 0, chased: 0 };
    if (!Number.isFinite(this.energy)) this.energy = this.s.hostEnergy;
    if (!Number.isFinite(this.energyAt)) this.energyAt = t;
    if (!Number.isFinite(this.nextAmbientAt)) this.nextAmbientAt = t + this.s.ambientSeconds * 1000;
    if (!Number.isFinite(this.hostEndsAt)) this.hostEndsAt = 0;
    if (!Number.isFinite(this.freezeUntil)) { this.freezeUntil = 0; this.freeze = null; }
    if (!Number.isFinite(this.nextSlowmoAt)) this.nextSlowmoAt = 0;
    if (!Array.isArray(this.fields)) this.fields = [];
    if (this.mission && (typeof this.mission !== 'object' || !Number.isFinite(this.mission.until))) this.mission = null;
    if (this.event && (!EVENTS[this.event.id] || !Number.isFinite(this.event.until))) this.event = null;
    if (!Number.isFinite(this.nextMissionAt)) this.nextMissionAt = t + 4000;
    if (!Number.isFinite(this.nextEventAt)) this.nextEventAt = t + this.s.eventEvery * 1000;
    if (!Number.isFinite(this.missionSeq)) this.missionSeq = 0;
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(PhoTiHon);

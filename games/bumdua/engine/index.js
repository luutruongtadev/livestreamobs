import { Emitter, makePausable, triggerText, triggerIcon } from '#sdk';

/**
 * Bùm Dưa: cô Ba ở sạp dưa ngoài chợ quấn dây thun quanh trái dưa hấu cho tới khi… BÙM.
 * - Mỗi bình luận = 1 sợi dây có mặt người xem, xếp hàng chờ cô Ba quấn (mỗi người tối đa perUserQueue sợi đang chờ).
 * - Tim: mỗi likesPerBand tim → 1 sợi cho người thả tim vượt mốc. Follow: một nắm followBands sợi (1 lần / người / buổi).
 * - Quà: nắm dây, bó dây, thùng dây, súng bắn dây (quấn dồn dập), cô Ba tăng tốc, dao chặt (đếm ngược rồi bổ đôi trái dưa,
 *   trừ khi có "thớt chắn"), kéo cắt bớt dây, dưa vàng (cứng hơn).
 * - Trái dưa có "ngưỡng nổ" bí mật; dây chạm ngưỡng thì nổ — người có sợi dây cuối cùng là người làm nổ (vào Bảng Bùm).
 * - Không có thắng / thua: dưa nổ → vài giây sau dưa mới lên bàn. Cứ 5 trái có 1 trái to, 10 trái có 1 trái khổng lồ.
 * - Không ai bình luận: cô Ba tự quấn 1 sợi mỗi selfBandSeconds giây.
 *
 * Pha: wrap (đang quấn) → pop (nổ, ăn mừng) → wrap (dưa mới).
 */
export function createGame(ctx) { return new BumDua(ctx); }

export const SIZES = { thuong: { name: 'Dưa thường', k: 1 }, to: { name: 'Dưa to', k: 1.7 }, khonglo: { name: 'Dưa khổng lồ', k: 2.6 } };
const GIFT_BANDS = { nam: 3, boc: 10, cuon: 25, thung: 50, sung: 150 };
const MAX_SHIELDS = 3;
const pub = (u) => ({ id: String(u?.id ?? '?'), name: String(u?.name || 'Ẩn danh').slice(0, 40), avatar: u?.avatar || null });
const AUNTIE = { id: 'npc:coba', name: 'Cô Ba', avatar: null, npc: true };

export class BumDua extends Emitter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    this.s = ctx.settings;
    this.now = ctx.now;
    this.melonNo = 0;
    this.popped = 0;
    this.record = 0; // số dây nhiều nhất một trái từng chịu được
    this.board = {}; // id → { id, name, avatar, pops, bands }
    this.hall = []; // người làm nổ gần đây
    this.likeAcc = 0;
    this.followed = {};
    this.shields = 0;
    this.turboUntil = 0;
    this.newMelon();
  }

  rand(a, b) { return a + this.ctx.random() * (b - a); }

  newMelon() {
    this.melonNo++;
    const n = this.melonNo;
    const size = this.s.growth && n % 10 === 0 ? 'khonglo' : this.s.growth && n % 5 === 0 ? 'to' : 'thuong';
    this.size = size;
    this.breakAt = Math.round(this.rand(this.s.breakMin, this.s.breakMax) * SIZES[size].k);
    this.bands = 0;
    this.phase = 'wrap';
    this.startedAt = this.clock();
    this.endsAt = null;
    this.queue = []; // sợi chờ cô Ba quấn: { user }
    this.burst = []; // sợi quà quấn dồn dập: { user, n }
    this.recent = []; // vài sợi gần nhất (vẽ mặt trên dây)
    this.last = null; // người có sợi gần nhất
    this.nextWrapAt = this.startedAt + 800;
    this.nextBurstAt = this.startedAt;
    this.idleAt = this.startedAt;
    this.knife = null; // { by, endsAt }
    this.golden = null;
    this.popper = null;
    this.popHow = null;
    return [{ type: 'bd_melon', no: n, size, sizeName: SIZES[size].name }];
  }

  wrapMs() { return Math.round((this.s.wrapSeconds * 1000) / (this.clock() < this.turboUntil ? 4 : 1)); }

  queued(id) { return this.queue.reduce((n, b) => n + (b.user.id === id ? 1 : 0), 0); }

  enqueue(user, n = 1, cap = true) {
    if (this.phase !== 'wrap' && cap) return 0; // đang nổ: bình luận bỏ qua (quà thì để dành cho trái sau)
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (cap && this.queued(user.id) >= this.s.perUserQueue) break;
      if (this.queue.length >= 300) break;
      this.queue.push({ user }); k++;
    }
    return k;
  }

  /** Quấn thêm 1 sợi (của user) → có thể nổ. */
  addBand(user, fast = false) {
    if (this.phase !== 'wrap') return [];
    this.bands++;
    this.last = user;
    this.recent.push({ user, at: this.clock() });
    if (this.recent.length > 14) this.recent.shift();
    const row = this.row(user);
    row.bands++;
    const fx = [{ type: 'bd_band', by: user, bands: this.bands, fast }];
    if (this.bands >= this.breakAt) fx.push(...this.pop(user, 'band'));
    return fx;
  }

  row(user) { return (this.board[user.id] ||= { id: user.id, name: user.name, avatar: user.avatar, pops: 0, bands: 0 }); }

  pop(user, how) {
    const t = this.clock();
    this.phase = 'pop';
    this.popper = user;
    this.popHow = how;
    this.popped++;
    this.record = Math.max(this.record, this.bands);
    this.knife = null;
    this.endsAt = t + this.s.popSeconds * 1000;
    if (!user.npc) {
      const r = this.row(user);
      Object.assign(r, { name: user.name, avatar: user.avatar });
      r.pops++;
      this.ctx.report?.points?.(user, 10 * SIZES[this.size].k, true);
    }
    this.hall.unshift({ user, no: this.melonNo, size: this.size, bands: this.bands, how });
    this.hall = this.hall.slice(0, 8);
    // quà dồn dập còn dư thì văng theo vụ nổ; sợi bình luận còn chờ thì bỏ (người xem bình luận lại cho trái mới)
    this.burst = []; this.queue = [];
    this.ctx.report?.round?.({ melon: this.melonNo, size: this.size, bands: this.bands, popper: user.npc ? null : user.name, how });
    return [{ type: 'bd_pop', by: user, bands: this.bands, size: this.size, no: this.melonNo, how }];
  }

  // ---------------- đầu vào ----------------
  handle(ev) {
    if (this.paused || !ev?.type) return [];
    const user = pub(ev.user);
    if (ev.type === 'comment') {
      if (!String(ev.text ?? '').trim()) return [];
      const n = this.enqueue(user, 1);
      return n ? [{ type: 'bd_queue', by: user }] : [];
    }
    if (ev.type === 'like') {
      const every = this.s.likesPerBand;
      const before = this.likeAcc;
      this.likeAcc += Math.max(0, Number(ev.count) || 0);
      const n = Math.min(20, Math.floor(this.likeAcc / every) - Math.floor(before / every));
      if (n > 0) { this.enqueue(user, n, false); return [{ type: 'bd_queue', by: user, n, likes: true }]; }
      return [];
    }
    if (ev.type === 'follow') {
      if (this.followed[user.id] || this.s.followBands <= 0) return [];
      this.followed[user.id] = true;
      this.burst.push({ user, n: this.s.followBands });
      return [{ type: 'bd_gift', action: 'follow', by: user, n: this.s.followBands }];
    }
    return [];
  }

  action(id, ev = {}) {
    if (this.paused) return false;
    const by = pub(ev.user);
    const t = this.clock();
    if (GIFT_BANDS[id]) { this.burst.push({ user: by, n: GIFT_BANDS[id] }); return [{ type: 'bd_gift', action: id, by, n: GIFT_BANDS[id] }]; }
    switch (id) {
      case 'turbo': {
        const base = Math.max(t, this.turboUntil);
        this.turboUntil = Math.min(t + 120_000, base + this.s.turboSeconds * 1000);
        return [{ type: 'bd_gift', action: id, by, seconds: Math.round((this.turboUntil - t) / 1000) }];
      }
      case 'dao':
        if (this.phase !== 'wrap') return false;
        if (this.knife) { this.knife.endsAt = Math.max(t + 3000, this.knife.endsAt - 5000); return [{ type: 'bd_gift', action: id, by, faster: true }]; }
        if (this.shields > 0) { this.shields--; return [{ type: 'bd_gift', action: id, by, blocked: true }, { type: 'bd_block', by }]; }
        this.knife = { by, endsAt: t + this.s.knifeSeconds * 1000 };
        return [{ type: 'bd_gift', action: id, by }];
      case 'thot':
        if (this.knife) { const k = this.knife; this.knife = null; return [{ type: 'bd_gift', action: id, by }, { type: 'bd_block', by, knife: k.by }]; }
        if (this.shields >= MAX_SHIELDS) return false;
        this.shields++;
        return [{ type: 'bd_gift', action: id, by, shields: this.shields }];
      case 'keo': {
        if (this.phase !== 'wrap') return false;
        const cut = Math.min(10, this.bands);
        this.bands -= cut;
        return [{ type: 'bd_gift', action: id, by, cut }];
      }
      case 'vang':
        if (this.phase !== 'wrap') return false;
        this.golden = by;
        this.breakAt = Math.round(this.breakAt * 1.5) + 10;
        return [{ type: 'bd_gift', action: id, by }];
      default: return [];
    }
  }

  command(id) {
    if (id === 'pop') return this.phase === 'wrap' ? this.pop(AUNTIE, 'streamer') : [];
    if (id === 'next') return this.phase === 'pop' ? this.newMelon() : [];
    if (id === 'clear-board') { this.board = {}; this.hall = []; return [{ type: 'bd_board_cleared' }]; }
    return [];
  }

  tick() {
    if (this.paused) return [];
    const t = this.clock();
    const fx = [];
    if (this.phase === 'pop') {
      if (t >= this.endsAt) fx.push(...this.newMelon());
      return fx;
    }
    // dao chặt hết giờ → bổ đôi trái dưa
    if (this.knife && t >= this.knife.endsAt) { fx.push(...this.pop(this.knife.by, 'dao')); return fx; }
    // quà: quấn dồn dập (~12 sợi / giây, nhanh hơn khi cô Ba tăng tốc)
    let guard = 0;
    while (this.burst.length && t >= this.nextBurstAt && this.phase === 'wrap' && guard++ < 40) {
      const b = this.burst[0];
      fx.push(...this.addBand(b.user, true));
      if (--b.n <= 0) this.burst.shift();
      this.nextBurstAt = Math.max(this.nextBurstAt + (t < this.turboUntil ? 30 : 80), t - 400);
    }
    if (this.phase !== 'wrap') return fx;
    // cô Ba quấn sợi của người xem; không ai thì tự quấn
    if (t >= this.nextWrapAt) {
      if (this.queue.length) { fx.push(...this.addBand(this.queue.shift().user)); this.idleAt = t; }
      else if (!this.burst.length && t - this.idleAt >= this.s.selfBandSeconds * 1000) { fx.push(...this.addBand(AUNTIE)); this.idleAt = t; }
      this.nextWrapAt = t + this.wrapMs();
    }
    return fx;
  }

  onResume(d) {
    for (const k of ['nextWrapAt', 'nextBurstAt', 'idleAt', 'turboUntil']) this[k] += d;
    if (this.knife) this.knife.endsAt += d;
  }

  snapshot() {
    const t = this.clock();
    return {
      phase: this.phase,
      paused: !!this.paused,
      melonNo: this.melonNo,
      popped: this.popped,
      record: this.record,
      size: this.size,
      sizeName: SIZES[this.size].name,
      bands: this.bands,
      // độ căng (0–1) để vẽ vết nứt / rung; không lộ con số ngưỡng
      tension: Math.round(Math.min(1, this.bands / Math.max(1, this.breakAt)) * 50) / 50,
      queue: this.queue.length + this.burst.reduce((n, b) => n + b.n, 0),
      next: this.queue.slice(0, 5).map((b) => b.user),
      recent: this.recent.map((r) => r.user).slice(-8),
      last: this.last,
      turboMs: Math.max(0, this.turboUntil - t),
      knife: this.knife ? { by: this.knife.by, leftMs: Math.max(0, this.knife.endsAt - t), totalMs: this.s.knifeSeconds * 1000 } : null,
      shields: this.shields,
      golden: this.golden,
      popper: this.phase === 'pop' ? this.popper : null,
      popHow: this.phase === 'pop' ? this.popHow : null,
      popLeftMs: this.phase === 'pop' ? Math.max(0, this.endsAt - t) : 0,
      hall: this.hall.slice(0, 5),
      top: this.s.showBoard ? Object.values(this.board).filter((r) => r.pops > 0).sort((a, b) => b.pops - a.pops || b.bands - a.bands).slice(0, 5) : [],
      most: Object.values(this.board).filter((r) => r.bands > 0 && r.id !== AUNTIE.id).sort((a, b) => b.bands - a.bands).slice(0, 3),
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), trigger: b.trigger })),
    };
  }

  serialize() {
    return {
      melonNo: this.melonNo, popped: this.popped, record: this.record, board: this.board, hall: this.hall, likeAcc: this.likeAcc, followed: this.followed, shields: this.shields,
      turboUntil: this.turboUntil, size: this.size, breakAt: this.breakAt, bands: this.bands, phase: this.phase, startedAt: this.startedAt, endsAt: this.endsAt,
      queue: this.queue, burst: this.burst, recent: this.recent, last: this.last, nextWrapAt: this.nextWrapAt, nextBurstAt: this.nextBurstAt, idleAt: this.idleAt,
      knife: this.knife, golden: this.golden, popper: this.popper, popHow: this.popHow,
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !['wrap', 'pop'].includes(s.phase) || !SIZES[s.size] || !Array.isArray(s.queue)) return;
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of Object.keys(this.serialize())) if (k in copy) this[k] = copy[k];
    this.shields = Math.max(0, Math.min(MAX_SHIELDS, Number(this.shields) || 0));
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(BumDua);

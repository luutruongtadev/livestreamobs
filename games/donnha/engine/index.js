import { Emitter, makePausable, normalize, triggerText, triggerIcon } from '#sdk';

/**
 * Rô-bốt Dọn Nhà: một rô-bốt hút bụi tí hon dọn căn nhà Việt (sân, phòng khách, bếp, phòng ngủ) trước Tết.
 * Hút được món nào nhỏ hơn mình thì to ra: tất, dép tổ ong → nồi cơm điện, ghế nhựa đỏ → bàn trà, sofa, tủ lạnh → xe máy, cây mai.
 * Đụng món to hơn thì bị chặn lại. Mỗi ván roundSeconds giây, chấm theo % nhà sạch và cỡ rô-bốt.
 *
 * Người xem (mode viewers): bình luận "trái / phải / lên / xuống" để cả phòng cùng lái (đa số trong vài giây gần nhất thắng);
 * không ai lái thì rô-bốt tự đi tìm món hút được gần nhất (chậm hơn 25% — có người lái mới nhanh). Bình luận khác: thả "món đồ mang tên bạn" vào nhà (mỗi người 1 món / ván).
 * Streamer (mode host, cửa sổ chơi): lái bằng chuột (bấm / giữ chỗ muốn tới) hoặc phím WASD / mũi tên; bình luận vẫn thả đồ.
 * Quà giúp: Turbo, Nam châm, Mẹ đi chợ về (rơi đồ ăn quanh rô-bốt), Phình to, Siêu hút. Quà phá: Mèo nghịch, Hết pin, Đảo chiều, Chó làm đổ.
 */
export function createGame(ctx) { return new DonNha(ctx); }

export const HOUSE = { hx: 7, hz: 13 };
// khu trong nhà (x0, x1, z0, z1)
export const ZONES = {
  ngu: { name: 'Phòng ngủ', x0: -7, x1: 0, z0: -13, z1: -3 },
  bep: { name: 'Bếp', x0: 0, x1: 7, z0: -13, z1: -3 },
  khach: { name: 'Phòng khách', x0: -7, x1: 7, z0: -3, z1: 5 },
  san: { name: 'Sân', x0: -7, x1: 7, z0: 5, z1: 13 },
};
// món đồ: tên, bán kính (cỡ), khu xuất hiện
export const KINDS = {
  bui: { name: 'Cục bụi', s: 0.12, z: ['ngu', 'bep', 'khach', 'san'] },
  butchi: { name: 'Bút chì', s: 0.12, z: ['ngu', 'khach'] },
  keo: { name: 'Kẹo Tết', s: 0.13, z: ['khach'] },
  giay: { name: 'Giấy vụn', s: 0.13, z: ['ngu', 'khach', 'bep'] },
  tat: { name: 'Chiếc tất', s: 0.14, z: ['ngu', 'khach'] },
  lego: { name: 'Đồ chơi', s: 0.15, z: ['ngu', 'khach'] },
  coc: { name: 'Cốc', s: 0.15, z: ['bep', 'khach'] },
  chen: { name: 'Chén', s: 0.16, z: ['bep'] },
  vochai: { name: 'Vỏ chai', s: 0.16, z: ['bep', 'san'] },
  dep: { name: 'Dép tổ ong', s: 0.18, z: ['san', 'khach'] },
  giaydep: { name: 'Đôi giày', s: 0.3, z: ['san', 'ngu'] },
  banhchung: { name: 'Bánh chưng', s: 0.33, z: ['khach', 'bep'] },
  xo: { name: 'Xô nước', s: 0.35, z: ['san', 'bep'] },
  loa: { name: 'Loa', s: 0.36, z: ['khach'] },
  noicom: { name: 'Nồi cơm điện', s: 0.38, z: ['bep'] },
  chaucay: { name: 'Chậu cây', s: 0.4, z: ['san', 'khach'] },
  quatban: { name: 'Quạt bàn', s: 0.4, z: ['ngu', 'khach'] },
  gaubong: { name: 'Gấu bông', s: 0.42, z: ['ngu'] },
  ghenhua: { name: 'Ghế nhựa đỏ', s: 0.6, z: ['san', 'bep', 'khach'] },
  bepga: { name: 'Bếp ga', s: 0.6, z: ['bep'] },
  quatcay: { name: 'Quạt cây', s: 0.62, z: ['ngu', 'khach'] },
  chauquat: { name: 'Chậu quất', s: 0.75, z: ['khach', 'san'] },
  tivi: { name: 'Ti vi', s: 0.85, z: ['khach'] },
  bantra: { name: 'Bàn trà', s: 0.9, z: ['khach'] },
  xedap: { name: 'Xe đạp', s: 1.0, z: ['san'] },
  tulanh: { name: 'Tủ lạnh', s: 1.1, z: ['bep'] },
  xemay: { name: 'Xe máy', s: 1.25, z: ['san'] },
  tuquanao: { name: 'Tủ quần áo', s: 1.3, z: ['ngu'] },
  banan: { name: 'Bàn ăn', s: 1.4, z: ['bep'] },
  sofa: { name: 'Sofa', s: 1.5, z: ['khach'] },
  caymai: { name: 'Cây mai', s: 1.6, z: ['san'] },
  giuong: { name: 'Giường', s: 1.8, z: ['ngu'] },
};
const TIERS = [[0, 0.2], [0.25, 0.45], [0.55, 0.95], [1.0, 9]]; // cỡ: tí hon, nhỏ, vừa, lớn
const PER_ZONE = [22, 7, 4, 2];
export const LEVELS = [[0.3, 'Rô-bốt tí hon'], [0.5, 'Hút tất dép'], [0.75, 'Hút nồi niêu'], [1.0, 'Hút ghế nhựa'], [1.4, 'Hút bàn ghế'], [1.9, 'Hút cả sofa'], [2.6, 'Hút cả xe máy'], [3.4, 'Siêu rô-bốt']];
const R0 = 0.3;
const DIRS = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] };
const WORDS = new Map([
  ['trai', 'l'], ['t', 'l'], ['a', 'l'], ['left', 'l'], ['⬅', 'l'], ['←', 'l'], ['⬅️', 'l'],
  ['phai', 'r'], ['p', 'r'], ['d', 'r'], ['right', 'r'], ['➡', 'r'], ['→', 'r'], ['➡️', 'r'],
  ['len', 'u'], ['l', 'u'], ['w', 'u'], ['up', 'u'], ['tren', 'u'], ['⬆', 'u'], ['↑', 'u'], ['⬆️', 'u'],
  ['xuong', 'd'], ['x', 'd'], ['s', 'd'], ['down', 'd'], ['duoi', 'd'], ['⬇', 'd'], ['↓', 'd'], ['⬇️', 'd'],
]);
const HELP = new Set(['turbo', 'namcham', 'dicho', 'phinhto', 'sieuhut']);
const pub = (u) => ({ id: String(u?.id ?? '?'), name: String(u?.name || 'Ẩn danh').slice(0, 40), avatar: u?.avatar || null });
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Bình luận có phải lệnh lái không → 'l' | 'r' | 'u' | 'd' | null. */
export function steerWord(text) {
  const t = String(text ?? '').trim();
  if (!t || t.length > 14) return null;
  const raw = [...t][0];
  if (WORDS.has(raw)) return WORDS.get(raw);
  const w = normalize(t).split(/\s+/)[0];
  return WORDS.get(w) ?? null;
}

export class DonNha extends Emitter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    this.s = ctx.settings;
    this.now = ctx.now;
    this.roundNo = 0;
    this.best = null; // { pct, r, round }
    this.helpers = {}; // id → { id, name, avatar, n }
    this.pranks = {};
    this.history = [];
    this.likeAcc = 0;
    this.newHouse();
  }

  rand(a, b) { return a + this.ctx.random() * (b - a); }
  pick(arr) { return arr[Math.floor(this.ctx.random() * arr.length) % arr.length]; }
  get hostMode() { return this.s.mode === 'host'; }

  newHouse() {
    this.roundNo++;
    const t = this.clock();
    this.phase = 'play';
    this.startedAt = t;
    this.endsAt = t + this.s.roundSeconds * 1000;
    this.lastTickAt = t;
    this.seq = 0;
    this.robot = { x: 0, z: 1, vx: 0, vz: 0, r: R0, dir: 0 };
    this.eaten = []; // lịch sử để nhả ra khi bị mèo / chó
    this.eatenArea = 0;
    this.buffs = {}; // tên → hết hạn (ms)
    this.cat = null;
    this.votes = []; // { d, at, id }
    this.lastVote = {};
    this.target = null; // tự lái: id món đang nhắm
    this.retargetAt = 0;
    this.skip = {}; // tự lái: món nhắm mãi không tới → bỏ qua một lúc (id → hết hạn)
    this.lastEatAt = t;
    this.stuck = { x: 0, z: 1, at: t, until: 0, dx: 0, dz: 0 };
    this.hostAim = null; // { x, z } hoặc { dx, dz }
    this.named = {}; // người xem đã thả đồ ván này
    this.result = null;
    this.level = 0;
    // đồ trong nhà: món to đặt trước, không chồng lên nhau, chừa chỗ rô-bốt xuất phát
    const items = [];
    const free = (x, z, s) => Math.hypot(x, z - 1) > s + 1.2 && items.every((o) => Math.hypot(o.x - x, o.z - z) > (o.s + s) * 1.05 + 0.08);
    for (const tier of [3, 2, 1, 0]) {
      const [lo, hi] = TIERS[tier];
      for (const [zid, Z] of Object.entries(ZONES)) {
        const pool = Object.entries(KINDS).filter(([, k]) => k.s >= lo && k.s <= hi && k.z.includes(zid)).map(([id]) => id);
        if (!pool.length) continue;
        const n = Math.max(tier === 3 ? pool.length : 0, Math.round(PER_ZONE[tier] * (zid === 'khach' || zid === 'san' ? 1.15 : 1))); // đồ lớn: mỗi loại của khu có ít nhất 1
        for (let i = 0; i < n; i++) {
          const kind = tier >= 2 ? pool[i % pool.length] : this.pick(pool);
          const s = KINDS[kind].s;
          for (let k = 0; k < (tier === 3 ? 200 : 30); k++) {
            const x = this.rand(Z.x0 + s + 0.15, Z.x1 - s - 0.15), z = this.rand(Z.z0 + s + 0.15, Z.z1 - s - 0.15);
            if (!free(x, z, s)) continue;
            items.push({ id: items.length, kind, s, x: r2(x), z: r2(z), rot: r2(this.rand(0, 6.28)), color: Math.floor(this.rand(0, 6)), alive: true, owner: null });
            break;
          }
        }
      }
    }
    this.items = items;
    this.totalArea = items.reduce((n, o) => n + o.s * o.s, 0);
    return [{ type: 'dn_house', round: this.roundNo, count: items.length }];
  }

  reff() { return this.robot.r * (this.buff('sieuhut') ? 1.6 : 1); }
  buff(id) { return (this.buffs[id] || 0) > this.clock(); }
  addBuff(id, sec) { const t = this.clock(); this.buffs[id] = Math.max(t, this.buffs[id] || 0) + sec * 1000; }
  cleanPct() { return this.totalArea ? Math.round(this.eatenArea / this.totalArea * 100) : 0; }
  levelOf(r) { let i = 0; for (let k = 0; k < LEVELS.length; k++) if (r >= LEVELS[k][0] - 1e-9) i = k; return i; }

  // ---------------- đầu vào ----------------
  handle(ev) {
    if (this.paused || !ev?.type) return [];
    const user = pub(ev.user);
    if (ev.type === 'comment') {
      const text = String(ev.text ?? '');
      if (!text.trim() || this.phase !== 'play') return [];
      const d = steerWord(text);
      const t = this.clock();
      if (d && !this.hostMode) {
        if (t - (this.lastVote[user.id] ?? -1e12) < 400) return [];
        this.lastVote[user.id] = t;
        this.votes.push({ d, at: t });
        if (this.votes.length > 200) this.votes.splice(0, this.votes.length - 200);
        return [{ type: 'dn_vote', d, by: user }];
      }
      if (d) return [];
      return this.dropNamed(user);
    }
    if (ev.type === 'like') {
      const every = this.s.likesPerDust;
      const before = this.likeAcc;
      this.likeAcc += Math.max(0, Number(ev.count) || 0);
      const n = Math.min(3, Math.floor(this.likeAcc / every) - Math.floor(before / every));
      if (n <= 0 || this.phase !== 'play') return [];
      const fx = [];
      for (let i = 0; i < n; i++) fx.push(...this.spawnAround(['bui', 'keo', 'giay'], 4, 2.5, null));
      return fx;
    }
    return [];
  }

  /** Món đồ mang tên người xem (mỗi người 1 món / ván). */
  dropNamed(user) {
    if (!this.s.namedItems || this.named[user.id] || Object.keys(this.named).length >= this.s.maxNamed) return [];
    const pool = ['tat', 'dep', 'lego', 'coc', 'giaydep', 'gaubong', 'banhchung', 'loa', 'chaucay', 'quatban'];
    const kind = this.pick(pool);
    const p = this.freeSpot(KINDS[kind].s);
    if (!p) return [];
    this.named[user.id] = true;
    const it = { id: this.items.length + 1000 + (++this.seq), kind, s: KINDS[kind].s, x: p.x, z: p.z, rot: r2(this.rand(0, 6.28)), color: Math.floor(this.rand(0, 6)), alive: true, owner: user };
    this.items.push(it);
    this.totalArea += it.s * it.s;
    return [{ type: 'dn_drop', id: it.id, kind, x: it.x, z: it.z, by: user }];
  }

  freeSpot(s, near = null, rad = 0) {
    for (let k = 0; k < 40; k++) {
      const x = near ? near.x + this.rand(-rad, rad) : this.rand(-HOUSE.hx + s + 0.2, HOUSE.hx - s - 0.2);
      const z = near ? near.z + this.rand(-rad, rad) : this.rand(-HOUSE.hz + s + 0.2, HOUSE.hz - s - 0.2);
      if (Math.abs(x) > HOUSE.hx - s - 0.1 || Math.abs(z) > HOUSE.hz - s - 0.1) continue;
      if (Math.hypot(x - this.robot.x, z - this.robot.z) < this.reff() + s + 0.2) continue;
      if (this.items.some((o) => o.alive && Math.hypot(o.x - x, o.z - z) < o.s + s + 0.05)) continue;
      return { x: r2(x), z: r2(z) };
    }
    return null;
  }

  /** Rơi n món (loại trong kinds) quanh rô-bốt bán kính rad. */
  spawnAround(kinds, n, rad, by) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const kind = this.pick(kinds);
      const p = this.freeSpot(KINDS[kind].s, this.robot, rad + this.robot.r);
      if (!p) continue;
      const it = { id: this.items.length + 1000 + (++this.seq), kind, s: KINDS[kind].s, x: p.x, z: p.z, rot: r2(this.rand(0, 6.28)), color: Math.floor(this.rand(0, 6)), alive: true, owner: null };
      this.items.push(it);
      this.totalArea += it.s * it.s;
      out.push(it.id);
    }
    return out.length ? [{ type: 'dn_spawn', ids: out, by }] : [];
  }

  /** Nhả ra n món vừa hút (mèo / chó), rô-bốt nhỏ lại tương ứng. */
  spit(n) {
    const out = [];
    for (let i = 0; i < n && this.eaten.length; i++) {
      const e = this.eaten.pop();
      const it = this.items.find((o) => o.id === e.id);
      if (!it) continue;
      const a = this.rand(0, 6.28), d = this.robot.r + it.s + 0.4 + this.rand(0, 0.8);
      it.x = r2(clamp(this.robot.x + Math.cos(a) * d, -HOUSE.hx + it.s, HOUSE.hx - it.s));
      it.z = r2(clamp(this.robot.z + Math.sin(a) * d, -HOUSE.hz + it.s, HOUSE.hz - it.s));
      it.alive = true;
      this.eatenArea -= it.s * it.s;
      this.robot.r = Math.max(R0, Math.sqrt(Math.max(R0 * R0, this.robot.r ** 2 - this.s.growth * it.s * it.s)));
      out.push(it.id);
    }
    this.level = this.levelOf(this.robot.r);
    return out;
  }

  action(id, ev = {}) {
    if (this.paused) return false;
    if (this.phase !== 'play') return false; // hết ván: trả lượt cho người tặng
    const by = pub(ev.user);
    const board = HELP.has(id) ? this.helpers : this.pranks;
    const row = (board[by.id] ||= { id: by.id, name: by.name, avatar: by.avatar, n: 0 });
    row.name = by.name; row.n++;
    this.ctx.report?.points?.(by, HELP.has(id) ? 2 : 1);
    let fx;
    switch (id) {
      case 'turbo': this.addBuff('turbo', this.s.turboSeconds); fx = []; break;
      case 'namcham': this.addBuff('namcham', this.s.magnetSeconds); fx = []; break;
      case 'sieuhut': this.addBuff('sieuhut', this.s.superSeconds); fx = []; break;
      case 'phinhto': { const r = this.robot.r; this.robot.r = r2(Math.min(6, r * 1.15 + 0.05)); this.level = this.levelOf(this.robot.r); fx = [{ type: 'dn_grow', from: r, to: this.robot.r }]; break; }
      case 'dicho': fx = this.spawnAround(['banhchung', 'keo', 'coc', 'chen', 'noicom', 'xo'], 10, 3, by); break;
      case 'meo': {
        const a = this.rand(0, 6.28);
        const size = r2(Math.max(0.6, this.robot.r * 1.25)); // mèo luôn to hơn rô-bốt một chút lúc xuất hiện
        this.cat = { x: r2(clamp(this.robot.x + Math.cos(a) * 5, -HOUSE.hx + 0.5, HOUSE.hx - 0.5)), z: r2(clamp(this.robot.z + Math.sin(a) * 5, -HOUSE.hz + 0.5, HOUSE.hz - 0.5)), s: size, until: this.clock() + this.s.catSeconds * 1000, by };
        fx = [];
        break;
      }
      case 'hetpin': this.addBuff('hetpin', this.s.slowSeconds); fx = []; break;
      case 'daochieu': this.addBuff('daochieu', this.s.reverseSeconds); fx = []; break;
      case 'bayra': { const ids = this.spit(5); this.addBuff('choang', 1.2); fx = [{ type: 'dn_spit', ids, by, why: 'cho' }]; break; }
      default: return [];
    }
    return [{ type: 'dn_gift', action: id, by, help: HELP.has(id) }, ...fx];
  }

  command(id) {
    if (id === 'next') return this.newHouse();
    if (id === 'end') return this.phase === 'play' ? this.finish() : [];
    if (id === 'clear-board') { this.helpers = {}; this.pranks = {}; this.best = null; this.history = []; return [{ type: 'dn_board_cleared' }]; }
    return [];
  }

  /** Đầu vào tại chỗ của streamer: { type: 'aim', x, z } (chuột) · { type: 'dir', dx, dz } (phím) · { type: 'stop' }. */
  input(ev = {}) {
    if (this.paused || !this.hostMode || !ev || typeof ev !== 'object' || this.phase !== 'play') return [];
    if (ev.type === 'aim' && Number.isFinite(ev.x) && Number.isFinite(ev.z)) this.hostAim = { x: clamp(ev.x, -HOUSE.hx, HOUSE.hx), z: clamp(ev.z, -HOUSE.hz, HOUSE.hz) };
    else if (ev.type === 'dir' && Number.isFinite(ev.dx) && Number.isFinite(ev.dz)) this.hostAim = Math.hypot(ev.dx, ev.dz) > 0.01 ? { dx: clamp(ev.dx, -1, 1), dz: clamp(ev.dz, -1, 1) } : null;
    else if (ev.type === 'stop') this.hostAim = null;
    return [];
  }

  // ---------------- lái ----------------
  /** Hướng cả phòng đang lái (tổng phiếu trong steerSeconds giây gần nhất, phiếu mới nặng hơn). */
  crowd(t) {
    const win = this.s.steerSeconds * 1000;
    this.votes = this.votes.filter((v) => t - v.at <= win);
    const c = { l: 0, r: 0, u: 0, d: 0 };
    let dx = 0, dz = 0;
    for (const v of this.votes) { const w = 0.4 + 0.6 * (1 - (t - v.at) / win); c[v.d]++; dx += DIRS[v.d][0] * w; dz += DIRS[v.d][1] * w; }
    const m = Math.hypot(dx, dz);
    return { counts: c, dir: m > 0.05 ? { dx: dx / m, dz: dz / m } : null };
  }

  /** Tự lái: nhắm món hút được, đáng giá, gần nhất. */
  autopilot(t) {
    const R = this.reff(), rb = this.robot;
    if (t < this.stuck.until) return { dx: this.stuck.dx, dz: this.stuck.dz };
    if (this.target != null && t - this.lastEatAt > 5000) { this.skip[this.target] = t + 15000; this.target = null; this.lastEatAt = t; } // nhắm mãi không hút được: đổi món
    let it = this.target != null ? this.items.find((o) => o.id === this.target && o.alive && o.s < R * 0.95) : null;
    if (!it || t >= this.retargetAt) {
      let best = null, bs = -1e9;
      for (const o of this.items) {
        if (!o.alive || o.s >= R * 0.95 || (this.skip[o.id] || 0) > t) continue;
        const d = Math.hypot(o.x - rb.x, o.z - rb.z);
        const sc = o.s * o.s * 4 - d * 0.35 + (o.owner ? 0.3 : 0);
        if (sc > bs) { bs = sc; best = o; }
      }
      it = best; this.target = best?.id ?? null; this.retargetAt = t + 1200;
    }
    if (!it) return null;
    const dx = it.x - rb.x, dz = it.z - rb.z, m = Math.hypot(dx, dz) || 1;
    return { dx: dx / m, dz: dz / m };
  }

  tick() {
    if (this.paused) return [];
    const t = this.clock();
    const fx = [];
    if (this.phase === 'result') {
      if (t >= this.endsAt) fx.push(...this.newHouse());
      return fx;
    }
    const dt = Math.max(0, Math.min(1000, t - this.lastTickAt)) / 1000;
    this.lastTickAt = t;
    const rb = this.robot;
    // hướng muốn đi
    let want = null, mode = 'auto';
    if (this.hostMode) {
      mode = 'host';
      const a = this.hostAim;
      if (a && 'dx' in a) want = { dx: a.dx, dz: a.dz };
      else if (a) { const dx = a.x - rb.x, dz = a.z - rb.z, m = Math.hypot(dx, dz); want = m > 0.25 ? { dx: dx / m, dz: dz / m } : null; }
    } else {
      const c = this.crowd(t);
      this.counts = c.counts;
      if (c.dir) { want = c.dir; mode = 'crowd'; } else if (this.s.autopilot) want = this.autopilot(t);
    }
    if (want && this.buff('daochieu')) want = { dx: -want.dx, dz: -want.dz };
    this.steerMode = mode;
    const speed = (this.s.speed + 0.9 * rb.r) * (mode === 'auto' ? 0.75 : 1) * (this.buff('turbo') ? 1.8 : 1) * (this.buff('hetpin') ? 0.45 : 1) * (this.buff('choang') ? 0 : 1);
    const tx = want ? want.dx * speed : 0, tz = want ? want.dz * speed : 0;
    const k = Math.min(1, dt * 6);
    rb.vx += (tx - rb.vx) * k; rb.vz += (tz - rb.vz) * k;
    if (Math.hypot(rb.vx, rb.vz) > 0.05) rb.dir = Math.atan2(rb.vx, rb.vz);
    // di chuyển theo bước nhỏ: hút món nhỏ hơn, bị món to hơn chặn
    const steps = Math.max(1, Math.ceil(dt / 0.05)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      rb.x += rb.vx * h; rb.z += rb.vz * h;
      const R = this.reff();
      rb.x = clamp(rb.x, -HOUSE.hx + rb.r, HOUSE.hx - rb.r); rb.z = clamp(rb.z, -HOUSE.hz + rb.r, HOUSE.hz - rb.r);
      const mag = this.buff('namcham') ? R * 2.6 + 0.6 : 0;
      for (const o of this.items) {
        if (!o.alive) continue;
        const dx = o.x - rb.x, dz = o.z - rb.z, d = Math.hypot(dx, dz);
        if (o.s < R * 0.95) {
          if (d < R) fx.push(...this.eat(o));
          else if (mag && d < mag) { const m = Math.min(d, 3.5 * h * (1 + R)); o.x = r2(o.x - dx / d * m); o.z = r2(o.z - dz / d * m); }
        } else {
          const min = rb.r + o.s * 0.85;
          if (d < min && d > 1e-6) { const push = min - d; rb.x -= dx / d * push; rb.z -= dz / d * push; }
        }
      }
    }
    rb.x = r2(rb.x); rb.z = r2(rb.z);
    // tự lái bị kẹt: đổi hướng ngẫu nhiên một lúc
    if (mode === 'auto' && want) {
      if (t - this.stuck.at > 1200) {
        if (Math.hypot(rb.x - this.stuck.x, rb.z - this.stuck.z) < 0.25 && t >= this.stuck.until) { const a = this.rand(0, 6.28); Object.assign(this.stuck, { until: t + 1500, dx: Math.cos(a), dz: Math.sin(a) }); this.target = null; }
        Object.assign(this.stuck, { x: rb.x, z: rb.z, at: t });
      }
    }
    // mèo nghịch
    if (this.cat) {
      const c = this.cat;
      if (t >= c.until) { fx.push({ type: 'dn_cat_gone' }); this.cat = null; }
      else {
        const dx = rb.x - c.x, dz = rb.z - c.z, d = Math.hypot(dx, dz) || 1;
        const v = this.s.speed * 0.95 * dt;
        c.x = r2(c.x + dx / d * Math.min(v, d)); c.z = r2(c.z + dz / d * Math.min(v, d));
        if (d < rb.r + c.s * 0.8) {
          if (this.reff() > c.s * 1.1) { fx.push({ type: 'dn_eatcat', by: c.by }); this.robot.r = r2(Math.sqrt(rb.r ** 2 + this.s.growth * c.s * c.s)); this.cat = null; }
          else if (!this.buff('choang')) { const ids = this.spit(3); this.addBuff('choang', 1.2); fx.push({ type: 'dn_spit', ids, by: c.by, why: 'meo' }); }
        }
      }
    }
    // lên cấp
    const lv = this.levelOf(rb.r);
    if (lv > this.level) { this.level = lv; fx.push({ type: 'dn_level', level: lv, name: LEVELS[lv][1] }); }
    if (t >= this.endsAt || this.items.every((o) => !o.alive)) fx.push(...this.finish());
    return fx;
  }

  eat(o) {
    o.alive = false;
    this.eaten.push({ id: o.id });
    if (this.eaten.length > 60) this.eaten.shift();
    this.eatenArea += o.s * o.s;
    this.robot.r = r2(Math.sqrt(this.robot.r ** 2 + this.s.growth * o.s * o.s) * 1000) / 1000;
    if (this.target === o.id) this.target = null;
    this.lastEatAt = this.clock();
    if (o.owner) this.ctx.report?.points?.(o.owner, 1);
    return [{ type: 'dn_eat', id: o.id, kind: o.kind, s: o.s, x: o.x, z: o.z, owner: o.owner }];
  }

  finish() {
    const t = this.clock();
    this.phase = 'result';
    this.endsAt = t + this.s.resultSeconds * 1000;
    const pct = this.cleanPct(), r = r2(this.robot.r);
    const record = !this.best || pct > this.best.pct || (pct === this.best.pct && r > this.best.r);
    if (record) this.best = { pct, r, round: this.roundNo };
    this.result = { pct, r, level: this.levelOf(r), name: LEVELS[this.levelOf(r)][1], record, ms: t - this.startedAt, eaten: this.items.filter((o) => !o.alive).length };
    this.history.unshift({ round: this.roundNo, pct, r });
    this.history = this.history.slice(0, 5);
    this.cat = null; this.buffs = {};
    this.ctx.report?.round?.({ round: this.roundNo, pct, size: r });
    return [{ type: 'dn_end', ...this.result }];
  }

  onResume(d) {
    this.endsAt += d;
    for (const k of Object.keys(this.buffs)) this.buffs[k] += d;
    if (this.cat) this.cat.until += d;
    for (const v of this.votes) v.at += d;
    this.retargetAt += d; this.stuck.at += d; this.stuck.until += d; this.lastEatAt += d;
    for (const k of Object.keys(this.skip)) this.skip[k] += d;
  }

  snapshot() {
    const t = this.clock();
    const top = (m) => Object.values(m).sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1)).slice(0, 4);
    const rb = this.robot;
    const left = (id) => Math.max(0, (this.buffs[id] || 0) - t);
    const lv = this.levelOf(rb.r);
    return {
      phase: this.phase,
      paused: !!this.paused,
      mode: this.hostMode ? 'host' : 'viewers',
      round: this.roundNo,
      remainingMs: Math.max(0, this.endsAt - t),
      roundMs: this.s.roundSeconds * 1000,
      robot: { x: rb.x, z: rb.z, vx: r2(rb.vx), vz: r2(rb.vz), r: rb.r, reff: r2(this.reff()), dir: r2(rb.dir), magnet: this.buff('namcham') ? r2(this.reff() * 2.6 + 0.6) : 0 },
      items: this.items.filter((o) => o.alive).map((o) => ({ id: o.id, kind: o.kind, s: o.s, x: o.x, z: o.z, rot: o.rot, color: o.color, owner: o.owner ? o.owner.name : null })),
      eatenCount: this.items.length - this.items.filter((o) => o.alive).length,
      itemCount: this.items.length,
      cleanPct: this.cleanPct(),
      level: { i: lv, name: LEVELS[lv][1], from: LEVELS[lv][0], next: LEVELS[lv + 1]?.[0] ?? null, nextName: LEVELS[lv + 1]?.[1] ?? null },
      buffs: { turbo: left('turbo'), namcham: left('namcham'), sieuhut: left('sieuhut'), hetpin: left('hetpin'), daochieu: left('daochieu'), choang: left('choang') },
      cat: this.cat ? { x: this.cat.x, z: this.cat.z, s: this.cat.s, leftMs: this.cat.until - t, by: this.cat.by } : null,
      steer: { mode: this.steerMode || (this.hostMode ? 'host' : 'auto'), counts: this.counts || { l: 0, r: 0, u: 0, d: 0 } },
      result: this.phase === 'result' ? this.result : null,
      nextInMs: this.phase === 'result' ? Math.max(0, this.endsAt - t) : 0,
      best: this.best,
      history: this.history,
      helpers: top(this.helpers),
      pranks: top(this.pranks),
      showBoard: this.s.showBoard,
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), help: HELP.has(b.action) })),
    };
  }

  serialize() {
    return {
      roundNo: this.roundNo, best: this.best, helpers: this.helpers, pranks: this.pranks, history: this.history, likeAcc: this.likeAcc,
      phase: this.phase, startedAt: this.startedAt, endsAt: this.endsAt, lastTickAt: this.lastTickAt, seq: this.seq, robot: this.robot,
      eaten: this.eaten, eatenArea: this.eatenArea, totalArea: this.totalArea, buffs: this.buffs, cat: this.cat, votes: this.votes, lastVote: this.lastVote,
      target: this.target, retargetAt: this.retargetAt, skip: this.skip, lastEatAt: this.lastEatAt, stuck: this.stuck, hostAim: this.hostAim, named: this.named, result: this.result, level: this.level, items: this.items,
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !['play', 'result'].includes(s.phase) || !Array.isArray(s.items) || !s.robot || typeof s.robot !== 'object') return;
    if (!s.items.every((o) => o && KINDS[o.kind] && Number.isFinite(o.x) && Number.isFinite(o.z) && Number.isFinite(o.s))) return;
    if (!['x', 'z', 'r', 'vx', 'vz'].every((k) => Number.isFinite(s.robot[k])) || !Number.isFinite(s.endsAt)) return;
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of Object.keys(this.serialize())) if (k in copy) this[k] = copy[k];
    if (!Array.isArray(this.votes)) this.votes = [];
    if (!Array.isArray(this.eaten)) this.eaten = [];
    if (!this.buffs || typeof this.buffs !== 'object') this.buffs = {};
    if (!this.skip || typeof this.skip !== 'object') this.skip = {};
    if (!Number.isFinite(this.lastEatAt)) this.lastEatAt = this.clock();
    if (this.cat && !Number.isFinite(this.cat.until)) this.cat = null;
    if (!this.stuck || !Number.isFinite(this.stuck.at)) this.stuck = { x: 0, z: 0, at: this.clock(), until: 0, dx: 0, dz: 0 };
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(DonNha);

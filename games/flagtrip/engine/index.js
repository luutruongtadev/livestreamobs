import { Emitter, makePausable, compact, triggerText, triggerIcon } from '#sdk';

/**
 * Đoán cờ vòng quanh thế giới: cả phòng lái chung một chiếc máy bay.
 * Mỗi chặng hiện một lá cờ → người xem gõ tên nước vào bình luận (có dấu / không dấu, tiếng Anh, tên gọi khác).
 * Người đầu tiên đúng → còn vài giây "chốt sổ" cho người khác → lộ đáp án + thẻ du lịch, máy bay bay tới nước đó.
 * Không ai đúng (có người đoán) → máy bay rơi về điểm mốc gần nhất, trừ khi có khiên hoặc được cứu kịp bằng quà.
 * Không ai đoán gì (phòng im) → chờ thêm, 2 lần im thì đổi cờ khác, không bị phạt.
 * Đủ số chặng → hạ cánh về nhà (Hà Nội), tổng kết chuyến, bắt đầu chuyến mới.
 *
 * Pha: ask → (lastcall) → reveal → ask… | ask → rescue → reveal | reveal → landed → ask
 */
export function createGame(ctx) { return new FlagTrip(ctx); }

const HOME = { name: 'Hà Nội', lat: 21.03, lon: 105.85 };
export const REGIONS = { 'chau-a': 'Châu Á', 'chau-au': 'Châu Âu', 'chau-phi': 'Châu Phi', 'bac-my': 'Bắc & Trung Mỹ', 'nam-my': 'Nam Mỹ', 'chau-dai-duong': 'Châu Đại Dương' };
const MAX_SHIELDS = 3;
const pub = (u) => ({ id: String(u.id), name: String(u.name || 'Ẩn danh').slice(0, 40), avatar: u.avatar || null });

/** Khoảng cách sửa chữ (Levenshtein), dừng sớm khi vượt max. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Bộ so khớp tên nước: khoá gọn (bỏ dấu, khoảng trắng) → iso2; gõ sai 1 chữ (tên ≥ 6 chữ) / 2 chữ (≥ 11) vẫn nhận. */
export function buildMatcher(countries) {
  const exact = new Map();
  const keys = [];
  for (const c of countries) {
    for (const n of [c.name, ...(c.names || [])]) {
      const k = compact(n);
      if (!k || exact.has(k)) continue;
      exact.set(k, c.iso2);
      keys.push([k, c.iso2]);
    }
  }
  return (text) => {
    const k = compact(text);
    if (!k || k.length > 40) return null;
    if (exact.has(k)) return exact.get(k);
    if (k.length < 6) return null;
    const max = k.length >= 11 ? 2 : 1;
    let hit = null;
    for (const [key, iso] of keys) {
      if (Math.abs(key.length - k.length) > max || key.length < 6) continue;
      if (editDistance(k, key, max) <= max) { if (hit && hit !== iso) return null; hit = iso; } // mơ hồ giữa 2 nước → không nhận
    }
    return hit;
  };
}

export class FlagTrip extends Emitter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    this.s = ctx.settings;
    this.now = ctx.now;
    const all = Array.isArray(ctx.data?.countries) ? ctx.data.countries.filter((c) => c?.iso2 && c?.name) : [];
    this.countries = all.length ? all : [{ iso2: 'vn', num: '704', name: 'Việt Nam', names: ['Vietnam'], capital: 'Hà Nội', lat: 21.03, lon: 105.85, region: 'chau-a', tier: 1, sights: ['Vịnh Hạ Long', 'Phố cổ Hội An'], food: ['Phở'], fact: '' }];
    this.byIso = new Map(this.countries.map((c) => [c.iso2, c]));
    this.match = buildMatcher(this.countries);
    this.board = {}; // id → { id, name, avatar, points, flags, firsts }
    this.visited = []; // iso2 đã đoán đúng trong buổi live (thắp sáng trên bản đồ)
    this.used = []; // iso2 đã ra trong chuyến (không lặp)
    this.shields = 0;
    this.tripNo = 0;
    this.newTrip();
  }

  clockMs() { return this.clock(); }

  newTrip() {
    this.tripNo++;
    this.pos = 0;
    this.stamps = []; // iso2 đóng dấu hộ chiếu trong chuyến này
    this.at = { ...HOME }; // máy bay đang ở đâu
    this.from = null; // bay từ đâu (để vẽ đường bay lúc lộ đáp án)
    this.tripPoints = {}; // id → điểm trong chuyến
    this.used = [];
    return this.newFlag();
  }

  checkpointOf(pos) { return Math.floor(pos / this.s.checkpointEvery) * this.s.checkpointEvery; }

  /** Độ khó theo cài đặt; "tăng dần": nửa đầu chuyến dễ, rồi vừa, cuối chuyến khó. */
  tiersFor(pos) {
    const d = this.s.difficulty;
    if (d === 'de') return [1];
    if (d === 'vua') return [1, 2];
    if (d === 'kho') return [2, 3];
    if (d === 'tron') return [1, 2, 3];
    const f = pos / Math.max(1, this.s.tripLength);
    return f < 0.35 ? [1] : f < 0.7 ? [1, 2] : [2, 3];
  }

  pickCountry() {
    const region = this.s.region;
    const pool = this.countries.filter((c) => (region === 'all' || c.region === region));
    const fresh = (tiers) => pool.filter((c) => tiers.includes(c.tier || 2) && !this.used.includes(c.iso2) && c.iso2 !== this.flag?.iso2);
    let list = fresh(this.tiersFor(this.pos));
    if (!list.length) list = fresh([1, 2, 3]);
    if (!list.length) { this.used = []; list = pool.filter((c) => c.iso2 !== this.flag?.iso2); }
    if (!list.length) list = pool.length ? pool : this.countries;
    return list[Math.floor(this.ctx.random() * list.length)];
  }

  newFlag({ keepSilent = false } = {}) {
    const c = this.pickCountry();
    this.used.push(c.iso2);
    const t = this.clock();
    this.flag = {
      iso2: c.iso2, startedAt: t, letters: [], regionShown: false, extraBank: this.flag?.extraBank || 0,
      solvers: [], tried: {}, tries: 0, silent: keepSilent ? (this.flag?.silent || 0) : 0,
    };
    this.phase = 'ask';
    this.endsAt = t + this.s.flagSeconds * 1000 + this.flag.extraBank * 1000; // giây thêm còn thừa từ cờ trước
    this.flag.extraBank = 0;
    this.phaseMs = this.endsAt - t;
    return [{ type: 'ft_flag', pos: this.pos, trip: this.tripNo }];
  }

  country() { return this.byIso.get(this.flag.iso2); }
  addPoints(by, n, first) {
    const b = (this.board[by.id] ||= { ...by, points: 0, flags: 0, firsts: 0 });
    Object.assign(b, by, { points: b.points + n, flags: b.flags + 1, firsts: b.firsts + (first ? 1 : 0) });
    this.tripPoints[by.id] = (this.tripPoints[by.id] || 0) + n;
    this.ctx.report?.points?.(by, n, first);
  }

  // ---------------- sự kiện ----------------
  handle(ev) {
    if (this.paused || ev?.type !== 'comment' || !ev.user?.id) return [];
    if (this.phase !== 'ask' && this.phase !== 'lastcall') return [];
    const text = String(ev.text ?? '').trim();
    if (!text || text.split(/\s+/).length > 5) return []; // câu dài là nói chuyện, không phải đoán
    const id = String(ev.user.id);
    const f = this.flag;
    if (f.solvers.some((x) => x.id === id)) return [];
    const iso = this.match(text);
    if (!iso) return [];
    f.tries++;
    if (iso !== f.iso2) { f.tried[id] = (f.tried[id] || 0) + 1; return [{ type: 'ft_wrong', by: pub(ev.user), guess: this.byIso.get(iso)?.name || text }]; }
    const by = pub(ev.user);
    const t = this.clock();
    const rank = f.solvers.length + 1;
    const hintPenalty = Math.max(0.4, 1 - 0.15 * f.letters.length - (f.regionShown ? 0.1 : 0));
    const points = Math.round(this.s.basePoints * Math.max(0.3, 1 - 0.2 * (rank - 1)) * hintPenalty);
    f.solvers.push({ ...by, points, ms: t - f.startedAt });
    this.addPoints(by, points, rank === 1);
    const out = [{ type: 'ft_correct', by, points, rank }];
    if (rank === 1 && this.phase === 'ask') {
      // người đầu tiên đúng → chốt sổ sau vài giây; giây thêm còn thừa để dành cho cờ sau
      const left = this.endsAt - t;
      const last = this.s.lastCallSeconds * 1000;
      this.flag.extraBank = Math.max(0, Math.floor(Math.min(left - last, (this.flag.bonus || 0) * 1000) / 1000));
      this.phase = 'lastcall';
      this.endsAt = t + Math.min(last, Math.max(1000, left));
      this.phaseMs = this.endsAt - t;
      out.push({ type: 'ft_lastcall', ms: this.phaseMs });
    }
    return out;
  }

  /** Lộ đáp án: đúng → bay tới, đóng dấu; sai → rơi về điểm mốc (hoặc khiên / cứu). */
  reveal(solved, extra = []) {
    const c = this.country();
    const t = this.clock();
    this.phase = 'reveal';
    this.endsAt = t + this.s.revealSeconds * 1000;
    this.phaseMs = this.endsAt - t;
    const out = [...extra];
    if (solved) {
      this.from = { ...this.at };
      this.at = { name: c.capital, lat: c.lat, lon: c.lon };
      this.pos = Math.min(this.s.tripLength, this.pos + 1);
      this.stamps.push(c.iso2);
      if (!this.visited.includes(c.iso2)) this.visited.push(c.iso2);
    }
    this.ctx.report?.round?.({ trip: this.tripNo, pos: this.pos, country: c.iso2, solved, solvers: this.flag.solvers.length });
    out.push({ type: 'ft_reveal', iso2: c.iso2, name: c.name, solved, solvers: this.flag.solvers.slice(0, 3), pos: this.pos });
    return out;
  }

  /** Hết giờ cờ mà không ai đúng. */
  miss() {
    const f = this.flag;
    const t = this.clock();
    if (f.tries === 0 && f.silent < 2) { // phòng im: chờ thêm, không phạt
      f.silent++;
      if (f.silent >= 2) return this.newFlag({ keepSilent: false }).map((e) => ({ ...e, silent: true }));
      this.endsAt = t + this.s.flagSeconds * 1000;
      this.phaseMs = this.endsAt - t;
      return [{ type: 'ft_silent', n: f.silent }];
    }
    const cp = this.checkpointOf(this.pos);
    if (this.pos === cp) return this.reveal(false, [{ type: 'ft_miss', from: this.pos, to: this.pos, safe: true }]); // đang ở điểm mốc: không mất gì
    if (this.shields > 0) { this.shields--; return this.reveal(false, [{ type: 'ft_miss', from: this.pos, to: this.pos, shielded: true, shields: this.shields }]); }
    this.phase = 'rescue';
    this.endsAt = t + this.s.rescueSeconds * 1000;
    this.phaseMs = this.endsAt - t;
    return [{ type: 'ft_rescue', from: this.pos, to: cp, ms: this.phaseMs }];
  }

  tick() {
    if (this.paused || this.clock() < this.endsAt) return [];
    switch (this.phase) {
      case 'ask': return this.miss();
      case 'lastcall': return this.reveal(true);
      case 'rescue': { // không ai cứu → rơi về điểm mốc
        const from = this.pos, to = this.checkpointOf(this.pos);
        this.pos = to;
        this.stamps = this.stamps.slice(0, to);
        return this.reveal(false, [{ type: 'ft_fall', from, to }]);
      }
      case 'reveal':
        if (this.pos >= this.s.tripLength) return this.land();
        return this.newFlag();
      case 'landed': return this.newTrip();
      default: return [];
    }
  }

  land() {
    const t = this.clock();
    this.phase = 'landed';
    this.from = { ...this.at };
    this.at = { ...HOME };
    this.endsAt = t + this.s.landedSeconds * 1000;
    this.phaseMs = this.endsAt - t;
    const crew = Object.entries(this.tripPoints).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, p]) => ({ ...(this.board[id] || { id, name: 'Ẩn danh' }), tripPoints: p }));
    this.summary = { trip: this.tripNo, stamps: this.stamps.length, crew };
    return [{ type: 'ft_landed', ...this.summary }];
  }

  move(delta, kind, by) {
    if (this.phase === 'landed') return false;
    const before = this.pos;
    this.pos = Math.max(0, Math.min(this.s.tripLength, this.pos + delta));
    if (this.pos === before) return false;
    if (this.pos < this.stamps.length) this.stamps = this.stamps.slice(0, this.pos);
    const out = [{ type: 'ft_move', kind, delta: this.pos - before, pos: this.pos, by }];
    if (this.pos >= this.s.tripLength && this.phase !== 'reveal') out.push(...this.land());
    return out;
  }

  action(id, ev) {
    if (this.paused) return false;
    const by = ev?.user ? pub(ev.user) : null;
    const f = this.flag;
    const t = this.clock();
    const asking = this.phase === 'ask' || this.phase === 'lastcall';
    switch (id) {
      case 'letter': {
        if (this.phase !== 'ask') return false;
        const name = [...this.country().name];
        const slots = name.map((ch, i) => (/\p{L}/u.test(ch) ? i : -1)).filter((i) => i >= 0 && !f.letters.includes(i));
        const limit = Math.min(this.s.letterLimit, Math.max(0, name.filter((ch) => /\p{L}/u.test(ch)).length - 1)); // luôn chừa ≥ 1 chữ
        if (f.letters.length >= limit || !slots.length) { this.endsAt += 3000; return [{ type: 'ft_time', seconds: 3, by }]; } // hết lượt lộ chữ → +3 giây
        const pos = slots[Math.floor(this.ctx.random() * slots.length)];
        f.letters.push(pos);
        return [{ type: 'ft_letter', by }];
      }
      case 'time':
        if (this.phase !== 'ask') return false;
        this.endsAt += 10_000; f.bonus = (f.bonus || 0) + 10;
        return [{ type: 'ft_time', seconds: 10, by }];
      case 'region':
        if (this.phase !== 'ask') return false;
        if (f.regionShown) { this.endsAt += 5000; return [{ type: 'ft_time', seconds: 5, by }]; }
        f.regionShown = true;
        return [{ type: 'ft_region', region: this.country().region, by }];
      case 'skip':
        if (!asking || f.solvers.length) return false;
        return [{ type: 'ft_skip', by }, ...this.newFlag()];
      case 'shield':
        if (this.phase === 'rescue') { return this.reveal(false, [{ type: 'ft_rescued', by, pos: this.pos }]); }
        if (this.shields >= MAX_SHIELDS) return false;
        this.shields++;
        return [{ type: 'ft_shield', shields: this.shields, by }];
      case 'tailwind': return this.move(1, 'tailwind', by);
      case 'storm': return this.move(-1, 'storm', by);
      case 'jet': return this.move(5, 'jet', by);
      default: return [];
    }
  }

  command(id) {
    if (id === 'next') {
      if (this.phase === 'ask') return this.reveal(false);
      this.endsAt = this.clock();
      return this.tick();
    }
    if (id === 'skip') return this.action('skip') || [];
    if (id === 'new-trip') return this.newTrip();
    if (id === 'clear-board') { this.board = {}; return [{ type: 'ft_board_cleared' }]; }
    return [];
  }

  onResume(d) { if (this.flag) this.flag.startedAt += d; }

  /** Tên nước dạng ô chữ: chữ đã lộ hoặc null; khoảng trắng / dấu giữ nguyên. Lộ hết khi đáp án ra. */
  mask(name, show) {
    return [...name].map((ch, i) => (!/\p{L}/u.test(ch) ? ch : show || this.flag.letters.includes(i) ? ch : null));
  }

  snapshot() {
    const t = this.clock();
    const c = this.country();
    const open = this.phase === 'reveal' || this.phase === 'landed';
    const solvedNow = open && this.flag.solvers.length > 0;
    return {
      phase: this.phase,
      paused: !!this.paused,
      remainingMs: Math.max(0, this.endsAt - t),
      phaseMs: Math.max(1, this.phaseMs || 1),
      flag: this.flag.iso2, // ảnh cờ (overlay); tên nước chỉ có khi lộ đáp án
      mask: this.mask(c.name, open),
      region: this.flag.regionShown || open ? c.region : null,
      regionName: this.flag.regionShown || open ? REGIONS[c.region] || '' : null,
      silent: this.flag.silent,
      answer: open ? { iso2: c.iso2, num: c.num, name: c.name, capital: c.capital, sights: c.sights || [], food: c.food || [], fact: c.fact || '', region: REGIONS[c.region] || '', solved: solvedNow } : null,
      solvers: this.flag.solvers.slice(0, 5),
      solvedCount: this.flag.solvers.length,
      trip: {
        no: this.tripNo, length: this.s.tripLength, pos: this.pos, every: this.s.checkpointEvery,
        checkpoint: this.checkpointOf(this.pos), shields: this.shields,
        stamps: this.stamps.slice(-30), at: this.at, from: this.from,
      },
      visited: this.visited.map((iso) => this.byIso.get(iso)?.num).filter(Boolean),
      visitedCount: this.visited.length,
      summary: this.phase === 'landed' ? this.summary : null,
      board: this.s.showLeaderboard ? Object.values(this.board).sort((a, b) => b.points - a.points).slice(0, 5) : [],
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), every: b.every, count: b.every ? Math.min(b.count, b.every) : 0 })),
    };
  }

  serialize() {
    return {
      board: this.board, visited: this.visited, used: this.used, shields: this.shields, tripNo: this.tripNo, pos: this.pos, stamps: this.stamps,
      at: this.at, from: this.from, tripPoints: this.tripPoints, flag: this.flag, phase: this.phase, endsAt: this.endsAt, phaseMs: this.phaseMs, summary: this.summary || null,
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !s.flag || !this.byIso.has(s.flag.iso2)) return;
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of Object.keys(this.serialize())) if (k in copy) this[k] = copy[k];
    this.shields = Math.max(0, Math.min(MAX_SHIELDS, Number(this.shields) || 0));
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(FlagTrip);

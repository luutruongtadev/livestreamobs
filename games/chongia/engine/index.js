import { Emitter, makePausable, compact, triggerText, triggerIcon } from '#sdk';
import { parsePrice, roundNice, niceStep, fmtPrice } from './price.js';

/**
 * Hãy chọn giá đúng: mỗi vòng hiện một món hàng siêu thị (giá thật lấy từ siêu thị qua phần server, hoặc giá tham khảo
 * soạn sẵn) → người xem gõ giá vào bình luận.
 *  - Vòng "đoán giá": gõ số tiền ("35k", "35.000", "1tr2"…). Hết giờ → người gần nhất thắng (hoặc gần nhất mà KHÔNG VƯỢT giá
 *    nếu chọn luật "không vượt quá"). Trong khoảng ±exactPercent% = ĐÚNG GIÁ, điểm gấp đôi.
 *  - Vòng "chọn giá": 4 mức giá A / B / C / D, gõ chữ cái. Đúng càng nhanh càng nhiều điểm.
 * Đủ roundsPerShow vòng → tổng kết "chương trình", bắt đầu lại.
 *
 * Pha: ask → reveal → ask … → summary → ask
 */
export function createGame(ctx) { return new PriceGame(ctx); }

export const LETTERS = ['A', 'B', 'C', 'D'];
const pub = (u) => ({ id: String(u.id), name: String(u.name || 'Ẩn danh').slice(0, 40), avatar: u.avatar || null });
const MAX_RANGE = 3; // số lần thu hẹp khoảng giá
const MAX_DIGITS = 2; // số chữ số đầu được lộ
const MULTS = [0.5, 0.62, 0.72, 0.8, 0.87, 1.15, 1.25, 1.38, 1.55, 1.8, 2.1];

/** Món hàng hợp lệ (từ data soạn sẵn hoặc server) → dạng chuẩn, hoặc null. */
export function cleanItem(x, live = false) {
  if (!x || typeof x !== 'object') return null;
  const price = Math.round(Number(x.price));
  const name = String(x.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
  if (!name || !Number.isFinite(price) || price < 500 || price > 200_000_000) return null;
  const image = typeof x.image === 'string' && /^https?:\/\//.test(x.image) ? x.image.slice(0, 500) : null;
  return {
    id: String(x.id ?? compact(name)).slice(0, 60), name, price,
    unit: String(x.unit ?? '').slice(0, 40), category: String(x.category ?? '').slice(0, 30),
    emoji: String(x.emoji ?? '🛒').slice(0, 8), tier: [1, 2, 3].includes(x.tier) ? x.tier : 2,
    store: String(x.store ?? '').slice(0, 30), image, live: !!(live || x.live),
    listPrice: Number(x.listPrice) > price ? Math.round(Number(x.listPrice)) : null,
    updatedAt: Number(x.updatedAt) || null,
  };
}

export class PriceGame extends Emitter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    this.s = ctx.settings;
    this.now = ctx.now;
    const seed = ctx.data?.products;
    this.categories = seed?.categories && typeof seed.categories === 'object' ? seed.categories : {};
    this.seedAsOf = typeof seed?.asOf === 'string' ? seed.asOf.slice(0, 10) : null; // ngày lấy giá của bộ hàng dự phòng
    this.seed = (Array.isArray(seed?.items) ? seed.items : []).map((x) => cleanItem(x)).filter(Boolean);
    if (!this.seed.length) this.seed = [cleanItem({ id: 's0', name: 'Mì gói tôm chua cay', unit: 'gói 75g', price: 4500, category: 'do-kho', emoji: '🍜', tier: 1 })];
    this.live = []; // hàng có giá thật từ siêu thị (phần server)
    this.catalogInfo = { live: 0, stores: [], updatedAt: null, state: 'loading' };
    this.board = {}; // id → { id, name, avatar, points, wins, exact }
    this.showPoints = {}; // điểm trong chương trình hiện tại
    this.used = [];
    this.showNo = 1;
    this.roundNo = 0;
    this.history = []; // các vòng gần đây (cho tổng kết)
    this.nextJackpot = false;
    this.newRound();
    this.loadCatalog();
  }

  // ---------------- giá thật từ siêu thị ----------------
  loadCatalog(force = false) {
    let p;
    try { p = this.ctx.server?.request?.(force ? 'refresh' : 'catalog', { categories: this.s.categories }); } catch { p = null; }
    if (!p || typeof p.then !== 'function') { this.catalogInfo.state = 'offline'; return; }
    p.then((res) => this.onCatalog(res), () => this.onCatalog(null));
  }

  onCatalog(res) {
    if (this.destroyed) return;
    const items = Array.isArray(res?.items) ? res.items.map((x) => cleanItem(x, true)).filter(Boolean) : [];
    if (items.length) this.live = items.slice(0, 2000);
    this.catalogInfo = {
      live: this.live.length,
      stores: [...new Set(this.live.map((x) => x.store).filter(Boolean))].slice(0, 6),
      updatedAt: Number(res?.updatedAt) || this.catalogInfo.updatedAt || null,
      state: this.live.length ? 'live' : res ? 'seed' : 'offline',
    };
    this.emit('effects', [{ type: 'cg_catalog', ...this.catalogInfo }]);
  }

  /** Kho hàng dùng để ra đề theo cài đặt nguồn giá + danh mục. */
  pool() {
    const cats = Array.isArray(this.s.categories) ? this.s.categories : [];
    const byCat = (list) => (cats.length ? list.filter((x) => !x.category || cats.includes(x.category)) : list);
    const live = byCat(this.live), seed = byCat(this.seed);
    const src = this.s.source;
    if (src === 'seed') return seed.length ? seed : this.seed;
    if (src === 'mix') return [...live, ...seed];
    if (src === 'live' && live.length) return live;
    return live.length >= 8 ? live : [...live, ...(seed.length ? seed : this.seed)];
  }

  pickItem() {
    const pool = this.pool();
    const prev = this.item;
    let list = pool.filter((x) => !this.used.includes(x.id) && x.id !== prev?.id && x.category !== prev?.category);
    if (!list.length) list = pool.filter((x) => !this.used.includes(x.id) && x.id !== prev?.id);
    if (!list.length) { this.used = []; list = pool.filter((x) => x.id !== prev?.id); }
    if (!list.length) list = pool.length ? pool : this.seed;
    const it = list[Math.floor(this.ctx.random() * list.length)];
    this.used.push(it.id);
    if (this.used.length > 400) this.used.splice(0, this.used.length - 400);
    return it;
  }

  // ---------------- vòng chơi ----------------
  roundMode() {
    const m = this.s.mode;
    if (m === 'guess' || m === 'choice') return m;
    return this.ctx.random() < 0.34 ? 'choice' : 'guess';
  }

  /** 4 mức giá: đáp án + 3 mức nhiễu "đẹp", khác nhau rõ ràng. */
  makeOptions(price) {
    const r = this.ctx.random;
    const vals = new Set([price]);
    const pool = MULTS.slice();
    let guard = 0;
    while (vals.size < 4 && guard++ < 60) {
      const m = pool.length ? pool.splice(Math.floor(r() * pool.length), 1)[0] : 0.4 + r() * 2;
      const v = roundNice(price * m);
      if ([...vals].every((x) => Math.abs(x - v) >= Math.max(niceStep(price), price * 0.06))) vals.add(v);
    }
    let k = 2; while (vals.size < 4) vals.add(price + niceStep(price) * k++ * 3);
    const list = [...vals];
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  }

  newRound() {
    const item = this.pickItem();
    const t = this.clock();
    this.roundNo++;
    this.item = item;
    const mode = this.roundMode();
    const jackpot = this.nextJackpot; this.nextJackpot = false;
    this.round = {
      mode, startedAt: t, guesses: [], byUser: {}, // guesses: [{ id, name, avatar, v (giá | chỉ số đáp án), at }]
      options: mode === 'choice' ? this.makeOptions(item.price) : null, out: [], // out: chỉ số đáp án đã bị loại (quà)
      range: null, rangeLevel: 0, digits: 0, doubles: [], jackpot, results: null, silentExtended: false, bonus: 0,
    };
    this.phase = 'ask';
    this.endsAt = t + (mode === 'choice' ? this.s.choiceSeconds : this.s.askSeconds) * 1000;
    this.phaseMs = this.endsAt - t;
    return [{ type: 'cg_round', round: this.roundNo, of: this.s.roundsPerShow, mode, jackpot, name: item.name }];
  }

  guessCount() { return this.round.guesses.length; }

  // ---------------- bình luận ----------------
  handle(ev) {
    if (this.paused || ev?.type !== 'comment' || !ev.user?.id || this.phase !== 'ask') return [];
    const text = String(ev.text ?? '').trim();
    if (!text || text.length > 60) return [];
    const r = this.round;
    const id = String(ev.user.id);
    const had = r.byUser[id];
    if (had != null && !this.s.allowChange) return [];
    let v;
    if (r.mode === 'choice') {
      v = this.readChoice(text);
      if (v == null || r.out.includes(v)) return [];
    } else {
      v = parsePrice(text);
      if (v == null) return [];
    }
    const by = pub(ev.user);
    const at = this.clock() - r.startedAt;
    if (had != null) { const g = r.guesses[had]; if (g.v === v) return []; g.v = v; g.at = at; g.changed = true; }
    else { r.byUser[id] = r.guesses.length; r.guesses.push({ ...by, v, at }); }
    return [{ type: r.mode === 'choice' ? 'cg_vote' : 'cg_guess', by, v, label: r.mode === 'choice' ? LETTERS[v] : fmtPrice(v), changed: had != null }];
  }

  /** "a" / "B" / "chọn c" / "đáp án d" / "1"–"4" / đúng số tiền của một đáp án → chỉ số 0–3. */
  readChoice(text) {
    const opts = this.round.options;
    const n = compact(text).replace(/^(chon|dapan|cau|toichon|minhchon|chot)/, '');
    const li = ['a', 'b', 'c', 'd'].indexOf(n);
    if (li >= 0) return li;
    if (/^[1-4]$/.test(n)) return Number(n) - 1;
    const p = parsePrice(text);
    if (p == null) return null;
    const i = opts.findIndex((o) => Math.abs(o - p) <= Math.max(1, o * 0.005));
    return i >= 0 ? i : null;
  }

  // ---------------- chấm điểm ----------------
  hintFactor() { const r = this.round; return Math.max(0.5, 1 - 0.12 * (r.rangeLevel + r.digits + r.out.length)); }

  addPoints(by, n, { win = false, exact = false } = {}) {
    if (n <= 0) return;
    const b = (this.board[by.id] ||= { ...by, points: 0, wins: 0, exact: 0 });
    Object.assign(b, { name: by.name, avatar: by.avatar, points: b.points + n, wins: b.wins + (win ? 1 : 0), exact: b.exact + (exact ? 1 : 0) });
    this.showPoints[by.id] = (this.showPoints[by.id] || 0) + n;
    this.ctx.report?.points?.(by, n, win);
  }

  score() {
    const r = this.round, price = this.item.price, base = this.s.basePoints;
    const mult = this.hintFactor() * (r.jackpot ? 3 : 1);
    const dbl = (id) => (r.doubles.includes(id) ? 2 : 1);
    const rows = [];
    if (r.mode === 'choice') {
      const total = Math.max(1, this.phaseTotal || this.s.choiceSeconds * 1000);
      const right = r.options.indexOf(price);
      const ok = r.guesses.filter((g) => g.v === right).sort((a, b) => a.at - b.at);
      ok.forEach((g, i) => {
        const speed = Math.max(0.4, 1 - 0.6 * Math.min(1, g.at / total));
        const pts = Math.round(base * speed * mult * dbl(g.id) * (i === 0 ? 1.2 : 1));
        rows.push({ id: g.id, name: g.name, avatar: g.avatar, v: g.v, label: LETTERS[g.v], points: pts, rank: i + 1, exact: false, x2: dbl(g.id) > 1 });
        this.addPoints(g, pts, { win: i === 0 });
      });
      const votes = r.options.map((_, i) => r.guesses.filter((g) => g.v === i).length);
      return { mode: 'choice', price, right, votes, total: r.guesses.length, winners: rows.slice(0, 5), hit: rows.length > 0, exact: false, count: rows.length };
    }
    const tol = Math.max(0, price * (this.s.exactPercent / 100));
    let list = r.guesses.map((g) => ({ ...g, diff: g.v - price }));
    const over = this.s.rule === 'not-over' ? list.filter((g) => g.diff > tol).length : 0;
    if (this.s.rule === 'not-over') list = list.filter((g) => g.diff <= tol); // "không vượt quá" (lệch trong ngưỡng chính xác vẫn tính)
    list.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || a.at - b.at);
    const share = [1, 0.6, 0.4];
    list.slice(0, 10).forEach((g, i) => {
      const exact = Math.abs(g.diff) <= tol;
      const near = Math.abs(g.diff) <= price * 0.15;
      const k = i < 3 ? share[i] : near ? 0.15 : 0;
      if (!k && !exact) return;
      const pts = Math.round(base * (k + (exact ? 1 : 0)) * mult * dbl(g.id));
      rows.push({ id: g.id, name: g.name, avatar: g.avatar, v: g.v, label: fmtPrice(g.v), diff: g.diff, pct: Math.round((g.diff / price) * 1000) / 10, points: pts, rank: i + 1, exact, x2: dbl(g.id) > 1 });
      this.addPoints(g, pts, { win: i === 0, exact });
    });
    const exactN = rows.filter((x) => x.exact).length;
    const all = r.guesses.map((g) => g.v);
    const avg = all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null;
    return { mode: 'guess', price, total: r.guesses.length, winners: rows.slice(0, 5), hit: rows.length > 0, exact: exactN > 0, count: exactN, over, avg };
  }

  reveal() {
    const t = this.clock();
    this.phaseTotal = this.phaseMs;
    const res = this.score();
    this.round.results = res;
    this.phase = 'reveal';
    this.endsAt = t + this.s.revealSeconds * 1000;
    this.phaseMs = this.endsAt - t;
    const it = this.item;
    this.history.push({ name: it.name, emoji: it.emoji, price: it.price, winner: res.winners[0]?.name || null, exact: res.exact });
    if (this.history.length > 30) this.history.shift();
    this.ctx.report?.round?.({ show: this.showNo, round: this.roundNo, item: it.id, price: it.price, mode: res.mode, players: res.total, winners: res.winners.length });
    return [{ type: 'cg_reveal', mode: res.mode, price: it.price, label: fmtPrice(it.price), name: it.name, hit: res.hit, exact: res.exact, players: res.total, winner: res.winners[0] || null }];
  }

  summary() {
    const t = this.clock();
    this.phase = 'summary';
    this.endsAt = t + this.s.summarySeconds * 1000;
    this.phaseMs = this.endsAt - t;
    const top = Object.entries(this.showPoints).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, p]) => ({ ...(this.board[id] || { id, name: 'Ẩn danh' }), showPoints: p }));
    this.final = { show: this.showNo, rounds: this.history.slice(-this.s.roundsPerShow), top };
    return [{ type: 'cg_summary', show: this.showNo, top }];
  }

  newShow() {
    this.loadCatalog(); // mỗi chương trình mới hỏi lại kho giá (server tự làm mới theo chu kỳ)
    this.showNo++;
    this.roundNo = 0;
    this.showPoints = {};
    this.history = [];
    this.final = null;
    return this.newRound();
  }

  tick() {
    if (this.paused || this.clock() < this.endsAt) return [];
    switch (this.phase) {
      case 'ask': {
        const r = this.round;
        if (!r.guesses.length && !r.silentExtended) { // phòng im → chờ thêm một lần
          r.silentExtended = true;
          const add = Math.round(this.phaseMs / 2);
          this.endsAt = this.clock() + add; this.phaseMs += add;
          return [{ type: 'cg_silent' }];
        }
        return this.reveal();
      }
      case 'reveal':
        if (this.roundNo >= this.s.roundsPerShow) return this.summary();
        return this.newRound();
      case 'summary': return this.newShow();
      default: return [];
    }
  }

  // ---------------- quà ----------------
  /** Khoảng giá gợi ý chứa giá thật, lệch ngẫu nhiên (giá không nằm giữa), hẹp dần theo cấp. */
  makeRange(level) {
    const p = this.item.price;
    const w = [0.45, 0.25, 0.12][level - 1] || 0.12;
    const off = 0.15 + this.ctx.random() * 0.7; // vị trí của giá trong khoảng
    let lo = roundNice(p * (1 - 2 * w * off), 'floor');
    let hi = roundNice(p * (1 + 2 * w * (1 - off)), 'ceil');
    const prev = this.round.range;
    if (prev) { lo = Math.max(lo, prev[0]); hi = Math.min(hi, prev[1]); }
    if (lo >= p) lo = roundNice(p * 0.97, 'floor');
    if (hi <= p) hi = roundNice(p * 1.03, 'ceil');
    return [lo, hi];
  }

  action(id, ev) {
    if (this.paused) return false;
    const by = ev?.user ? pub(ev.user) : null;
    const r = this.round;
    const asking = this.phase === 'ask';
    switch (id) {
      case 'hint': {
        if (!asking) return false;
        if (r.mode === 'choice') { // loại 1 đáp án sai (tối đa 2)
          const right = r.options.indexOf(this.item.price);
          const wrong = r.options.map((_, i) => i).filter((i) => i !== right && !r.out.includes(i));
          if (r.out.length >= 2 || !wrong.length) { this.endsAt += 5000; return [{ type: 'cg_time', seconds: 5, by }]; }
          const i = wrong[Math.floor(this.ctx.random() * wrong.length)];
          r.out.push(i);
          // phiếu đã bầu cho đáp án bị loại → được bầu lại
          for (const g of r.guesses) if (g.v === i) { delete r.byUser[g.id]; g.void = true; }
          r.guesses = r.guesses.filter((g) => !g.void);
          r.guesses.forEach((g, k) => { r.byUser[g.id] = k; });
          return [{ type: 'cg_hint', kind: 'out', option: LETTERS[i], by }];
        }
        if (r.rangeLevel >= MAX_RANGE) { this.endsAt += 5000; return [{ type: 'cg_time', seconds: 5, by }]; }
        r.rangeLevel++;
        r.range = this.makeRange(r.rangeLevel);
        return [{ type: 'cg_hint', kind: 'range', range: r.range, text: `${fmtPrice(r.range[0])} – ${fmtPrice(r.range[1])}`, by }];
      }
      case 'digit': {
        if (!asking) return false;
        const len = String(this.item.price).length;
        if (r.digits >= Math.min(MAX_DIGITS, len - 2)) { this.endsAt += 5000; return [{ type: 'cg_time', seconds: 5, by }]; }
        r.digits++;
        return [{ type: 'cg_hint', kind: 'digit', digits: r.digits, by }];
      }
      case 'time':
        if (!asking) return false;
        this.endsAt += 10_000; this.phaseMs += 10_000;
        return [{ type: 'cg_time', seconds: 10, by }];
      case 'double':
        if (!asking || !by) return false;
        if (r.doubles.includes(by.id)) return [];
        r.doubles.push(by.id);
        return [{ type: 'cg_double', by }];
      case 'jackpot':
        if (asking && !r.jackpot) { r.jackpot = true; return [{ type: 'cg_jackpot', by, now: true }]; }
        if (this.nextJackpot) return false;
        this.nextJackpot = true;
        return [{ type: 'cg_jackpot', by, now: false }];
      case 'skip':
        if (!asking) return false;
        this.roundNo--; // đổi món, giữ nguyên số vòng
        return [{ type: 'cg_skip', by, name: this.item.name }, ...this.newRound()];
      default: return [];
    }
  }

  command(id) {
    switch (id) {
      case 'next':
        if (this.phase === 'ask') return this.reveal();
        this.endsAt = this.clock();
        return this.tick();
      case 'skip': return this.action('skip') || [];
      case 'new-show': this.final = null; return this.newShow();
      case 'refresh-prices': this.catalogInfo.state = 'loading'; this.loadCatalog(true); return [{ type: 'cg_refreshing' }];
      case 'clear-board': this.board = {}; this.showPoints = {}; return [{ type: 'cg_board_cleared' }];
      default: return [];
    }
  }

  onResume(d) { if (this.round) this.round.startedAt += d; }

  // ---------------- cho renderer ----------------
  /** Giá dạng ô số: chữ số đã lộ hoặc null; dấu chấm nhóm nghìn giữ nguyên. Lộ hết khi ra đáp án. */
  maskPrice(show) {
    const s = String(this.item.price);
    let k = 0;
    const out = [];
    for (let i = 0; i < s.length; i++) {
      if (i && (s.length - i) % 3 === 0) out.push('.');
      out.push(show || k < this.round.digits ? s[i] : null);
      k++;
    }
    return out;
  }

  snapshot() {
    const t = this.clock();
    const r = this.round, it = this.item;
    const open = this.phase !== 'ask';
    const g = r.guesses;
    const guessVals = r.mode === 'guess' ? g.slice(-120).map((x) => x.v) : [];
    return {
      phase: this.phase,
      paused: !!this.paused,
      remainingMs: Math.max(0, this.endsAt - t),
      phaseMs: Math.max(1, this.phaseMs || 1),
      show: this.showNo, round: this.roundNo, rounds: this.s.roundsPerShow,
      mode: r.mode, rule: this.s.rule, exactPercent: this.s.exactPercent, allowChange: !!this.s.allowChange,
      item: { id: it.id, name: it.name, unit: it.unit, emoji: it.emoji, image: it.image, store: it.store, live: it.live, updatedAt: it.updatedAt, category: it.category, categoryName: this.categories[it.category] || '', onSale: !!it.listPrice, asOf: it.live ? null : this.seedAsOf },
      mask: open || r.digits ? this.maskPrice(open) : null, // chưa lộ chữ số nào → không cho biết giá dài mấy chữ số
      price: open ? it.price : null,
      listPrice: open ? it.listPrice : null,
      range: r.range, rangeLevel: r.rangeLevel, digits: r.digits,
      options: r.options, out: r.out.slice(),
      votes: r.mode === 'choice' ? (r.options || []).map((_, i) => g.filter((x) => x.v === i).length) : null,
      guesses: g.length,
      values: guessVals,
      recent: g.slice(-6).reverse().map((x) => ({ id: x.id, name: x.name, avatar: x.avatar, label: r.mode === 'choice' ? LETTERS[x.v] : fmtPrice(x.v) })),
      jackpot: r.jackpot, nextJackpot: this.nextJackpot, doubles: r.doubles.length,
      results: open && r.results ? r.results : null,
      final: this.phase === 'summary' ? this.final : null,
      catalog: { ...this.catalogInfo },
      board: this.s.showLeaderboard ? Object.values(this.board).sort((a, b) => b.points - a.points).slice(0, 5) : [],
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), every: b.every, count: b.every ? Math.min(b.count, b.every) : 0 })),
    };
  }

  serialize() {
    return {
      board: this.board, showPoints: this.showPoints, used: this.used, showNo: this.showNo, roundNo: this.roundNo, history: this.history,
      nextJackpot: this.nextJackpot, item: this.item, round: this.round, phase: this.phase, endsAt: this.endsAt, phaseMs: this.phaseMs,
      phaseTotal: this.phaseTotal || null, final: this.final || null, catalogInfo: this.catalogInfo,
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !cleanItem(s.item) || !s.round || typeof s.round !== 'object' || !Array.isArray(s.round.guesses)) return;
    if (!['ask', 'reveal', 'summary'].includes(s.phase)) return;
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of Object.keys(this.serialize())) if (k in copy) this[k] = copy[k];
    this.item = cleanItem(copy.item, copy.item.live);
    if (this.round.mode === 'choice' && (!Array.isArray(this.round.options) || this.round.options.length !== 4)) this.round.options = this.makeOptions(this.item.price);
    for (const k of ['out', 'doubles']) if (!Array.isArray(this.round[k])) this.round[k] = [];
    if (!this.round.byUser || typeof this.round.byUser !== 'object') this.round.byUser = {};
  }

  destroy() { this.destroyed = true; this.removeAllListeners(); }
}

makePausable(PriceGame);

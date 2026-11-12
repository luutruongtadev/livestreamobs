import { Emitter, makePausable, normalize, triggerText, triggerIcon } from '#sdk';
import { RULES, ruleText, ruleOk, solve, nextRule, makeRule, exampleFor, cps, FORBID_LETTERS, isJudge } from './rules.js';
import { cleanSpec } from './custom.js';

/**
 * Mật Khẩu Lầy: đặt mật khẩu mới thoả một chuỗi luật hiện dần, càng về sau càng oái oăm.
 *
 * Hai chế độ (cài đặt mode):
 *  - host: streamer gõ trong cửa sổ chơi (game.input) → Enter: thoả hết luật đang hiện thì hiện luật kế tiếp; qua luật cuối = qua màn.
 *    Người xem phá (quà: luật siêu khó, hacker xoá sạch, mèo đạp phím, cấm chữ, rút giờ, Caps Lock kẹt, đổi luật)
 *    hoặc cứu (gợi ý, thêm giờ, xoá luật, khiên, qua màn luôn).
 *  - viewer: người xem tự chơi — gõ mật khẩu vào bình luận. Ai thoả hết luật đang hiện thì mở luật kế tiếp (+điểm),
 *    ai qua luật cuối thì thắng màn. Quà vẫn thêm / bớt luật, thêm / bớt giờ.
 * Cả hai chế độ: cứ vài luật thì khán giả bình chọn luật tiếp theo (gõ 1 / 2); thỉnh thoảng một từ khán giả bình luận
 * thành luật; quà "Ra luật": bình luận kế tiếp của người tặng thành luật bắt buộc.
 *
 * Pha: intro → play → result → intro (màn sau)…
 */
export function createGame(ctx) { return new MatKhau(ctx); }

export const HARM = ['raluat', 'luatai', 'luatac', 'hacker', 'meo', 'camchu', 'rutgio', 'capslock', 'doiluat'];
export const HELP = ['goiy', 'themgio', 'xoaluat', 'khien', 'qualuon'];
const HOST_ONLY = new Set(['hacker', 'meo', 'capslock']);
const MAX_RULES = 20;
const pub = (u) => ({ id: String(u?.id ?? '?'), name: String(u?.name || 'Ẩn danh').slice(0, 40), avatar: u?.avatar || null });
const RULE_PREFIX = /^\s*(luật|luat|rule)\s*[:：\-]\s*/iu;
const FALLBACK = { bot: {}, strength: ['Yếu', 'Vừa', 'Mạnh'], punishments: ['Hát 1 câu'], penalties: [{ kind: 'time', text: 'Màn sau bị bớt 20 giây' }], junk: ['meo'] };

export class MatKhau extends Emitter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    this.s = ctx.settings;
    this.now = ctx.now;
    const d = ctx.data?.lines || {};
    this.d = { ...FALLBACK, ...d, bot: { ...(d.bot || {}) } };
    this.banned = String(this.s.bannedWords || '').split(',').map((w) => normalize(w).replace(/ /g, '')).filter(Boolean);
    this.level = this.s.startLevel;
    this.best = this.level;
    this.wins = 0;
    this.uid = 0;
    this.torment = {}; this.helpers = {}; this.players = {};
    this.feed = [];
    this.words = []; // từ ngắn người xem bình luận gần đây (làm luật của người xem)
    this.bot = { id: 0, text: '', mood: 'idle' };
    this.round = 0;
    this.judged = {}; // `${jid}|${mật khẩu}` → true / false (AI chấm luật cảm tính)
    this.judging = {};
    this.compiling = [];
    this.llm = false;
    this.startLevel();
    // phần server có AI duyệt luật không (không có thì luật người xem = 1 từ trong bình luận như cũ)
    try { Promise.resolve(this.ctx.server?.request?.('caps', {})).then((c) => { this.llm = !!c?.llm; }).catch(() => {}); } catch { /* không có server */ }
  }

  get hostMode() { return this.s.mode !== 'viewer'; }
  env() { return { now: this.clock(), tz: this.s.tzOffset, host: this.s.hostName, judged: (jid, t) => this.judged[`${jid}|${t}`] ?? null }; }
  get ai() { return this.llm && this.s.aiRules; }
  pick(list) { return list?.length ? list[Math.floor(this.ctx.random() * list.length)] : ''; }
  say(key, mood = 'idle', vars = {}) {
    const line = String(this.pick(this.d.bot[key]) || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    this.bot = { id: this.bot.id + 1, text: line, mood, key };
    return line;
  }

  // ---------------- vòng đời màn ----------------
  startLevel() {
    this.phase = 'intro';
    this.round = (this.round || 0) + 1;
    this.rules = [];
    this.compiling = [];
    this.freeUsed = 0;
    this.target = Math.min(MAX_RULES, this.s.baseRules + (this.level - 1) * this.s.rulesPerLevel, this.s.maxRules);
    this.totalMs = (this.s.baseSeconds + this.s.secondsPerRule * this.target) * 1000;
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.s.introSeconds * 1000;
    this.typed = ''; this.rev = (this.rev || 0) + 1;
    this.latest = null; this.bestTry = null;
    this.vote = null; this.voteReady = null; this.wantNext = null;
    this.pending = [];
    this.status = [];
    this.shield = 0;
    this.attempts = 0;
    this.result = null;
    this.say('intro', 'idle');
    return [{ type: 'mk_intro', level: this.level, total: this.target, ms: this.totalMs }];
  }

  startPlay() {
    this.phase = 'play';
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.totalMs;
    this.lastTickAt = this.startedAt;
    const fx = [{ type: 'mk_start', level: this.level }, ...this.reveal(null)];
    fx.push(...this.applyPenalty());
    return fx;
  }

  /** Án phạt trong game từ lần thua trước: áp vào đầu màn này. */
  applyPenalty() {
    const kind = this.penalty;
    this.penalty = null;
    if (!kind || this.phase !== 'play') return [];
    const env = this.env();
    const by = { id: 'npc:bot', name: 'Án phạt', avatar: null };
    let r = null;
    if (kind === 'time') this.endsAt = Math.max(this.clock() + 20_000, this.endsAt - 20_000);
    else if (kind === 'hard') r = nextRule(this.rules, 3, this.ctx.random, env);
    else if (kind === 'forbid') { const c = FORBID_LETTERS.find((x) => solve([...this.rules, { id: 'forbid', p: x }], env)); r = c ? { id: 'forbid', p: c } : null; }
    this.say('penalty', 'evil');
    if (!r) return [{ type: 'mk_penalty', kind }];
    this.target = Math.min(MAX_RULES + 6, this.target + 1);
    const rule = this.addRule(r, { by });
    return [{ type: 'mk_penalty', kind }, this.ruleFx(rule, 'án phạt')];
  }

  tierFor(pos) {
    const f = pos / Math.max(1, this.target);
    const t = f < 0.34 ? 1 : f < 0.7 ? 2 : 3;
    return this.level <= 1 ? Math.min(2, t) : t;
  }

  addRule(r, extra = {}) {
    const rule = { ...r, no: this.rules.length + 1, uid: ++this.uid, ...extra };
    this.rules.push(rule);
    this.latest = null; this.bestTry = null;
    return rule;
  }

  ruleFx(rule, sub = '') { return { type: 'mk_rule', no: rule.no, total: this.target, text: ruleText(rule, this.env()), by: rule.by || null, sub }; }

  /** Hiện luật kế tiếp: kết quả bình chọn → luật của người xem (theo nhịp) → luật ngẫu nhiên theo độ khó. */
  reveal(by) {
    const env = this.env();
    let r = null, sub = '';
    if (this.voteReady && solve([...this.rules, this.voteReady], env)) { r = this.voteReady; sub = 'khán giả chọn'; }
    this.voteReady = null;
    const pos = this.rules.length + 1;
    if (!r && this.s.viewerRuleEvery > 0 && pos % this.s.viewerRuleEvery === 0) { r = this.wordRule(env); if (r) sub = 'từ bình luận'; }
    if (!r) r = nextRule(this.rules, this.tierFor(pos - 1), this.ctx.random, env);
    if (!r) { this.target = this.rules.length; return this.rules.length ? this.win(by) : []; }
    const rule = this.addRule(r, by ? { opener: by } : {});
    const fx = [this.ruleFx(rule, sub)];
    if (rule.id === 'viewer') this.say('viewerRule', 'smug'); else if (rule.no > 1) this.say('rule', 'smug');
    if (this.s.voteEvery > 0 && !this.vote && this.rules.length < this.target && (this.rules.length + 1) % this.s.voteEvery === 0) fx.push(...this.startVote());
    return fx;
  }

  /** Luật từ một từ người xem bình luận gần đây (chưa có trong luật, không dính chữ cấm, bộ luật vẫn giải được). */
  wordRule(env) {
    const pool = this.words.slice();
    while (pool.length) {
      const i = Math.floor(this.ctx.random() * pool.length);
      const { w, by } = pool.splice(i, 1)[0];
      const r = { id: 'viewer', p: { w, by } };
      if (this.rules.some((x) => x.id === 'viewer' && normalize(x.p.w) === normalize(w))) continue;
      if (solve([...this.rules, r], env)) { this.words = this.words.filter((x) => x.w !== w); return r; }
    }
    return null;
  }

  startVote() {
    const env = this.env();
    const tier = this.tierFor(this.rules.length);
    const a = nextRule(this.rules, Math.max(2, tier), this.ctx.random, env);
    const b = a && nextRule(this.rules, Math.max(2, tier), this.ctx.random, env, { exclude: [a.id] });
    if (!a || !b) return [];
    const t = this.clock();
    this.vote = { options: [a, b], counts: [0, 0], voters: {}, at: t, until: t + this.s.voteSeconds * 1000 };
    this.say('vote', 'smug');
    return [{ type: 'mk_vote_start', options: [ruleText(a, env), ruleText(b, env)], ms: this.s.voteSeconds * 1000 }];
  }

  resolveVote() {
    const v = this.vote;
    this.vote = null;
    const [a, b] = v.counts;
    const i = a === b ? Math.floor(this.ctx.random() * 2) : a > b ? 0 : 1;
    this.voteReady = v.options[i];
    const fx = [{ type: 'mk_vote_end', i, counts: v.counts.slice(), text: ruleText(v.options[i], this.env()) }];
    if (this.wantNext && this.phase === 'play') { const by = this.wantNext.by; this.wantNext = null; fx.push(...this.reveal(by)); }
    return fx;
  }

  win(by) {
    const t = this.clock();
    const pw = this.hostMode ? this.typed : this.bestTry?.text || '';
    this.result = { win: true, level: this.level, rules: this.rules.length, password: pw, by: by || null, leftMs: Math.max(0, this.endsAt - t), attempts: this.attempts, punishment: null, line: this.say('win', 'happy') };
    this.wins++;
    if (by) this.score(by, 50 + 10 * this.rules.length);
    this.level = Math.min(99, this.level + 1);
    this.best = Math.max(this.best, this.level);
    return this.endRound(true);
  }

  fail() {
    this.result = { win: false, level: this.level, rules: this.rules.length, password: this.hostMode ? this.typed : this.bestTry?.text || '', by: null, leftMs: 0, attempts: this.attempts, punishment: null, punishmentKind: null, line: this.say('fail', 'angry') };
    if (this.s.punishment === 'game') { const pen = this.pick(this.d.penalties); this.penalty = pen?.kind || null; this.result.punishment = pen?.text || null; this.result.punishmentKind = 'game'; }
    else if (this.s.punishment === 'voice' && this.hostMode) { this.result.punishment = this.pick(this.d.punishments); this.result.punishmentKind = 'voice'; }
    if (this.s.dropLevelOnFail) this.level = Math.max(1, this.level - 1);
    return this.endRound(false);
  }

  endRound(win) {
    const t = this.clock();
    this.phase = 'result';
    this.startedAt = t;
    this.endsAt = t + this.s.resultSeconds * 1000;
    this.vote = null; this.pending = []; this.status = []; this.wantNext = null;
    this.ctx.report?.round?.({ win, level: this.result.level, rules: this.result.rules });
    return [{ type: win ? 'mk_win' : 'mk_fail', ...this.result }];
  }

  score(by, n) {
    const row = (this.players[by.id] ||= { ...by, points: 0, gifts: 0 });
    Object.assign(row, { name: by.name, avatar: by.avatar });
    row.points += n;
    this.ctx.report?.points?.(by, n, false);
  }

  /** Luật đang sai với mật khẩu đang xét (host: đang gõ; viewer: lượt thử tốt nhất). */
  current() { return this.hostMode ? this.typed : this.bestTry?.text ?? this.latest?.text ?? ''; }
  failing(text = this.current()) { const env = this.env(); return this.rules.filter((r) => !ruleOk(r, text, env)); }

  // ---------------- đầu vào ----------------
  handle(ev) {
    if (this.paused || ev?.type !== 'comment' || !ev.user) return [];
    const by = pub(ev.user);
    const raw = String(ev.text ?? '').slice(0, 150).trim();
    if (!raw) return [];
    // người vừa tặng "Ra luật": bình luận kế tiếp thành luật
    const pi = this.pending.findIndex((p) => p.by.id === by.id);
    if (pi >= 0 && this.phase === 'play') {
      if (this.pending[pi].kind === 'ai' && this.ai && cps(raw).length >= 2 && !/^\s*[12]\s*$/.test(raw)) { this.pending.splice(pi, 1); return this.propose(raw.replace(RULE_PREFIX, ''), by, 'gift'); }
      const w = this.pickWord(raw);
      if (w) { this.pending.splice(pi, 1); return this.viewerLaw(w, by); }
    }
    // "luật: …" — ai cũng ra luật được (giới hạn số luật / màn, mỗi người chờ một lúc)
    const lm = RULE_PREFIX.exec(raw);
    if (lm) {
      if (!this.ai || !this.s.freeRules || this.phase !== 'play') return [];
      if (this.s.aiRuleNeedsGift) { // đặt luật bằng AI phải tặng quà: nhắc (mỗi người 1 lần / 30 giây)
        const t = this.clock(), last = (this.nagAt ||= {})[by.id] || -Infinity;
        if (t - last < 30_000) return [];
        this.nagAt[by.id] = t;
        return [{ type: 'mk_rule_rejected', by, reason: 'Tặng quà “Đặt luật AI” rồi gõ luật nha' }];
      }
      return this.freeRule(raw.slice(lm[0].length), by);
    }
    if (this.vote) {
      const m = /^\s*([12])\s*$/.exec(raw);
      if (m) {
        if (this.vote.voters[by.id] != null || Object.keys(this.vote.voters).length >= 5000) return [];
        const i = Number(m[1]) - 1;
        this.vote.voters[by.id] = i; this.vote.counts[i]++;
        return [{ type: 'mk_vote', i, counts: this.vote.counts.slice(), by }];
      }
    }
    this.remember(raw, by);
    if (this.hostMode || this.phase !== 'play') return [];
    return this.attempt(raw, by);
  }

  /** Người xem tự chơi: một bình luận = một lượt thử mật khẩu. */
  attempt(text, by) {
    if (cps(text).length < 3) return [];
    const t = this.clock();
    const last = (this.lastTry ||= {})[by.id] || 0;
    if (t - last < 1500) return [];
    this.lastTry[by.id] = t;
    if (Object.keys(this.lastTry).length > 3000) this.lastTry = {};
    return this.judgeTry(text, by);
  }

  /** Chấm một lượt thử của người xem (gọi lại sau khi AI chấm xong các luật cảm tính). */
  judgeTry(text, by) {
    const t = this.clock();
    const env = this.env();
    // thoả hết luật kiểm tra được mà còn luật AI chưa chấm → nhờ AI chấm (mỗi lúc 1 lượt) rồi xét lại
    const unknown = this.rules.filter((r) => isJudge(r) && env.judged(r.p.jid, text) == null);
    if (unknown.length && this.rules.every((r) => isJudge(r) || ruleOk(r, text, env))) {
      if (!this.tryJudging) {
        this.tryJudging = true;
        this.askJudges(text, unknown, () => { this.tryJudging = false; if (this.phase === 'play' && !this.hostMode) this.emit('effects', this.judgeTry(text, by)); });
        return [{ type: 'mk_checking', by }];
      }
      return [];
    }
    const passed = this.rules.filter((r) => ruleOk(r, text, env)).length;
    this.attempts++;
    this.latest = { text, by, passed, at: t };
    if (!this.bestTry || passed >= this.bestTry.passed) this.bestTry = { text, by, passed, at: t };
    if (passed < this.rules.length) return passed === this.rules.length - 1 && this.rules.length > 2 ? [{ type: 'mk_close', by, passed }] : [];
    this.score(by, 10 * this.rules.length);
    if (this.rules.length >= this.target) return this.win(by);
    this.say('unlock', 'happy', { name: by.name });
    const fx = [{ type: 'mk_unlock', by, no: this.rules.length }];
    if (this.vote) { this.wantNext = { by }; return fx; }
    return [...fx, ...this.reveal(by)];
  }

  /** AI chấm mật khẩu cho các luật cảm tính; xong hết thì gọi done(). Máy chấm lỗi / không có AI → coi như đạt (không kẹt ván). */
  askJudges(text, rules, done) {
    let left = rules.length;
    const round = this.round;
    for (const r of rules) {
      const key = `${r.p.jid}|${text}`;
      Promise.resolve(this.ctx.server?.request?.('judge', { rule: r.p.label, password: text }))
        .then((v) => (v && !v.offline ? v.ok === true : true), () => true)
        .then((ok) => {
          if (round !== this.round) return;
          this.judged[key] = ok;
          const keys = Object.keys(this.judged);
          if (keys.length > 400) for (const k of keys.slice(0, 100)) delete this.judged[k];
          if (--left === 0) done();
        });
    }
  }

  freeRule(text, by) {
    const t = this.clock();
    if (this.freeUsed >= this.s.freeRulesPerLevel) return [{ type: 'mk_rule_rejected', by, reason: `Màn này đủ ${this.s.freeRulesPerLevel} luật của khán giả rồi — tặng quà Ra luật để đặt thêm` }];
    const last = (this.ruleAt ||= {})[by.id] || -Infinity;
    if (t - last < this.s.ruleCooldownSeconds * 1000) return [];
    this.ruleAt[by.id] = t;
    this.freeUsed++;
    return this.propose(text, by, 'free');
  }

  /** Gửi luật người xem đặt cho AI duyệt; duyệt xong thì thêm vào màn đang chơi (emit). */
  propose(raw, by, src) {
    const text = String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 140);
    const flat = normalize(text).replace(/ /g, '');
    if (flat.length < 2) return [];
    if (this.banned.some((b) => flat.includes(b))) { if (src === 'free') this.freeUsed--; return [{ type: 'mk_rule_rejected', by, reason: 'Luật có từ cấm' }]; }
    if (this.compiling.length >= 4) { if (src === 'free') this.freeUsed--; return [{ type: 'mk_rule_rejected', by, reason: 'Máy đang duyệt nhiều luật quá, đợi chút' }]; }
    const job = { id: ++this.uid, by, text, src, round: this.round };
    this.compiling.push(job);
    Promise.resolve(this.ctx.server.request('compile', { text }))
      .then((res) => res, () => ({ ok: false, offline: true, reason: 'Máy đang bận' }))
      .then((res) => { const fx = this.compiled(job, res); if (fx.length) this.emit('effects', fx); });
    this.say('reviewing', 'smug', { name: by.name });
    return [{ type: 'mk_propose', by, text }];
  }

  compiled(job, res) {
    const i = this.compiling.findIndex((j) => j.id === job.id);
    if (i < 0 || job.round !== this.round) return [];
    this.compiling.splice(i, 1);
    if (this.phase !== 'play') return [];
    const by = job.by;
    const reject = (reason) => {
      if (job.src === 'free') this.freeUsed = Math.max(0, this.freeUsed - 1);
      this.say('rejected', 'smug', { name: by.name });
      return [{ type: 'mk_rule_rejected', by, text: job.text, reason }];
    };
    if (!res?.ok) {
      if (res?.offline && job.src === 'gift') { const w = this.pickWord(job.text); if (w) return this.viewerLaw(w, by); }
      return reject(String(res?.reason || 'Máy không duyệt luật này').slice(0, 80));
    }
    const label = String(res.label || '').slice(0, 90);
    const flat = normalize(label).replace(/ /g, '');
    if (!label || this.banned.some((b) => flat.includes(b))) return reject('Luật có từ cấm');
    if (this.rules.some((r) => normalize(ruleText(r, this.env())) === normalize(label))) return reject('Luật này có rồi');
    const judge = res.judge === true;
    const spec = judge ? null : cleanSpec(res.spec);
    if (!judge && !spec) return reject('Máy không biết kiểm tra luật này');
    const r = { id: 'custom', p: { label, spec, judge, example: String(res.example || '').slice(0, 25), jid: `j${++this.uid}`, by } };
    if (!solve([...this.rules, r], this.env())) return reject('Mâu thuẫn với luật đang có');
    this.target = Math.min(MAX_RULES + 6, this.target + 1);
    const rule = this.addRule(r, { by });
    this.say('viewerRule', 'smug');
    return [this.ruleFx(rule, judge ? 'AI chấm' : 'luật của khán giả')];
  }

  /** Lấy một từ dùng làm luật: 2–10 chữ cái, không số, không từ cấm. */
  pickWord(raw) {
    for (const tok of String(raw).normalize('NFC').split(/[\s,.!?;:"“”'()]+/)) {
      const f = normalize(tok).replace(/ /g, '');
      if (f.length < 2 || f.length > 10 || !/^\p{L}+$/u.test(tok) || /\d/.test(f)) continue;
      if (this.banned.some((b) => f.includes(b))) continue;
      return tok.toLowerCase();
    }
    return null;
  }

  remember(raw, by) {
    if (raw.split(/\s+/).length > 3 || /[\d@#$%&*]/.test(raw)) return;
    const w = this.pickWord(raw);
    if (!w || normalize(w).replace(/ /g, '').length < 3) return;
    this.words = this.words.filter((x) => x.w !== w);
    this.words.push({ w, by });
    if (this.words.length > 30) this.words.shift();
  }

  viewerLaw(w, by) {
    const env = this.env();
    const r = { id: 'viewer', p: { w, by } };
    if (!solve([...this.rules, r], env)) return [{ type: 'mk_gift_fail', by, sub: `“${w}” không ghép được — chọn từ khác nha` }];
    this.target = Math.min(MAX_RULES + 6, this.target + 1);
    const rule = this.addRule(r, { by });
    this.say('viewerRule', 'smug');
    return [this.ruleFx(rule, 'ra luật')];
  }

  action(id, ev = {}) {
    if (this.paused) return false;
    if (!HARM.includes(id) && !HELP.includes(id)) return [];
    if (this.phase === 'result') return false;
    if (!this.hostMode && HOST_ONLY.has(id)) return false;
    const by = pub(ev.user);
    const fx = [];
    if (this.phase === 'intro') fx.push(...this.startPlay()); // quà tới lúc giới thiệu → vào chơi luôn, không phí quà
    const harm = HARM.includes(id);
    let r;
    if (harm && this.shield > 0 && id !== 'raluat' && id !== 'luatai') {
      this.shield--;
      this.say('blocked', 'happy');
      r = { fx: [], sub: '🛡️ Khiên đã chặn!', blocked: true };
    } else {
      r = this.apply(id, by);
      if (r === false) return fx.length ? fx : false;
    }
    const board = harm ? this.torment : this.helpers;
    const coins = ev.type === 'gift' ? Math.max(0, Number(ev.diamonds) || 0) : 0;
    const row = (board[by.id] ||= { ...by, points: 0, gifts: 0 });
    Object.assign(row, { name: by.name, avatar: by.avatar });
    row.points += Math.max(1, coins); row.gifts++;
    const t = this.clock();
    const last = this.feed[this.feed.length - 1];
    if (last && last.by.id === by.id && last.action === id && t - last.at < 8000) { last.n++; last.at = t; }
    else { this.feed.push({ by, action: id, n: 1, at: t }); if (this.feed.length > 6) this.feed.shift(); }
    if (ev.type === 'gift') this.ctx.report?.points?.(by, Math.max(1, coins), false);
    return [...fx, { type: 'mk_gift', action: id, by, sub: r.sub || '', harm, blocked: !!r.blocked }, ...r.fx];
  }

  /** Tác dụng của quà. Trả false khi không áp dụng được (nền tảng trả lượt). */
  apply(id, by) {
    const env = this.env();
    const t = this.clock();
    const fx = [];
    const bump = () => { this.target = Math.min(MAX_RULES + 6, this.target + 1); };
    switch (id) {
      case 'raluat': {
        if (this.pending.length >= 3) return false;
        this.pending.push({ by, kind: 'word', until: t + this.s.raluatSeconds * 1000 });
        this.say('viewerRule', 'smug');
        return { fx, sub: `${by.name} gõ 1 từ vào bình luận → luật “Có chữ …”` };
      }
      case 'luatai': {
        if (this.pending.length >= 3) return false;
        const ai = this.ai;
        this.pending.push({ by, kind: ai ? 'ai' : 'word', until: t + this.s.raluatSeconds * 1000 * (ai ? 1.5 : 1) });
        this.say('viewerRule', 'smug');
        return { fx, sub: ai ? `${by.name} gõ luật BẤT KỲ vào bình luận → AI duyệt` : `${by.name} gõ 1 từ vào bình luận → thành luật (AI chưa bật)` };
      }
      case 'luatac': {
        const r = nextRule(this.rules, 3, this.ctx.random, env);
        if (!r) return false;
        bump();
        const rule = this.addRule(r, { by });
        this.say('luatac', 'evil');
        return { fx: [this.ruleFx(rule, 'luật siêu khó')], sub: ruleText(rule, env) };
      }
      case 'hacker': {
        this.typed = ''; this.rev++;
        this.say('hacker', 'shock');
        return { fx: [{ type: 'mk_hacked' }], sub: 'Mật khẩu bị xoá sạch!' };
      }
      case 'meo': {
        const a = cps(this.typed);
        for (let k = 0; k < 2; k++) a.splice(Math.floor(this.ctx.random() * (a.length + 1)), 0, this.pick(this.d.junk));
        this.typed = a.join('').slice(0, 120); this.rev++;
        this.say('meo', 'shock');
        return { fx: [{ type: 'mk_meo' }], sub: 'Mèo đạp lung tung lên bàn phím' };
      }
      case 'camchu': {
        const cur = normalize(this.current());
        const order = [...FORBID_LETTERS].sort((x, y) => Number(cur.includes(y)) - Number(cur.includes(x)) || this.ctx.random() - 0.5);
        const taken = new Set(this.rules.filter((r) => r.id === 'forbid').map((r) => r.p));
        const c = order.find((x) => !taken.has(x) && solve([...this.rules, { id: 'forbid', p: x }], env));
        if (!c) return false;
        bump();
        const rule = this.addRule(makeRule('forbid', this.rules, this.ctx.random, env, c), { by });
        this.say('camchu', 'evil');
        return { fx: [this.ruleFx(rule, 'cấm chữ')], sub: `Cấm chữ “${c}”` };
      }
      case 'rutgio': {
        if (this.phase !== 'play') return false;
        this.endsAt = Math.max(t + 10_000, this.endsAt - this.s.cutSeconds * 1000);
        this.say('rutgio', 'evil');
        return { fx, sub: `−${this.s.cutSeconds} giây` };
      }
      case 'capslock': {
        const s = this.status.find((x) => x.kind === 'capslock');
        if (s) s.until += 10_000; else this.status.push({ kind: 'capslock', by, until: t + 15_000, total: 15_000 });
        this.say('capslock', 'evil');
        return { fx, sub: '15 giây gõ gì cũng ngược hoa / thường' };
      }
      case 'doiluat': {
        const ok = this.rules.map((r, i) => [r, i]).filter(([r]) => ruleOk(r, this.current(), env) && r.id !== 'viewer');
        if (!ok.length) return false;
        const [old, i] = ok[Math.floor(this.ctx.random() * ok.length)];
        const rest = this.rules.filter((_, k) => k !== i);
        const r = nextRule(rest, Math.max(2, RULES[old.id]?.tier || 2), this.ctx.random, env, { exclude: [old.id] });
        if (!r) return false;
        this.rules[i] = { ...r, no: old.no, uid: ++this.uid, by };
        this.say('doiluat', 'evil');
        return { fx: [{ type: 'mk_swap', no: old.no, text: ruleText(r, env) }], sub: `Luật ${old.no} đổi thành: ${ruleText(r, env)}` };
      }
      case 'goiy': {
        const f = this.failing()[0];
        if (!f) return false;
        f.hint = exampleFor(f, env);
        this.say('goiy', 'happy');
        return { fx: [{ type: 'mk_hint', no: f.no }], sub: `Luật ${f.no}: ${f.hint}` };
      }
      case 'themgio': {
        if (this.phase !== 'play') return false;
        this.endsAt += this.s.addSeconds * 1000;
        this.say('themgio', 'happy');
        return { fx, sub: `+${this.s.addSeconds} giây` };
      }
      case 'xoaluat': {
        if (this.rules.length < 2) return false;
        const f = this.failing()[0] || this.rules[this.rules.length - 1];
        this.rules = this.rules.filter((r) => r !== f).map((r, i) => ({ ...r, no: i + 1 }));
        this.target = Math.max(this.rules.length, this.target - 1);
        this.say('xoaluat', 'happy');
        return { fx: [{ type: 'mk_removed', no: f.no }], sub: `Xoá luật: ${ruleText(f, env)}` };
      }
      case 'khien': {
        if (this.shield >= 3) return false;
        this.shield++;
        this.say('khien', 'happy');
        return { fx, sub: `Khiên ×${this.shield}` };
      }
      case 'qualuon': {
        if (this.phase !== 'play') return false;
        this.say('qualuon', 'happy');
        return { fx: this.win(this.hostMode ? null : by), sub: 'Qua màn luôn!' };
      }
      default: return false;
    }
  }

  /** Đầu vào tại chỗ của streamer (cửa sổ chơi). */
  input(ev = {}) {
    if (this.paused || !this.hostMode || !ev || typeof ev !== 'object') return [];
    if (ev.type === 'start' && this.phase === 'intro') return this.startPlay();
    if (this.phase !== 'play') return [];
    if (ev.type === 'text') { this.typed = cps(String(ev.value ?? '')).slice(0, 120).join(''); return []; }
    if (ev.type === 'enter') return this.submit();
    return [];
  }

  submit() {
    if (!cps(this.typed).length) return [];
    this.attempts++;
    const env = this.env();
    const text = this.typed;
    const mech = this.rules.filter((r) => !isJudge(r) && !ruleOk(r, text, env));
    const unknown = this.rules.filter((r) => isJudge(r) && env.judged(r.p.jid, text) == null);
    if (!mech.length && unknown.length) {
      if (this.checking) return [];
      this.checking = true;
      this.askJudges(text, unknown, () => { this.checking = false; if (this.phase === 'play' && this.typed === text) { this.attempts--; this.emit('effects', this.submit()); } });
      return [{ type: 'mk_checking' }];
    }
    const bad = this.failing(this.typed);
    if (bad.length) {
      this.say(bad.length === 1 && this.rules.length >= this.target ? 'almost' : 'wrong', 'angry');
      return [{ type: 'mk_wrong', failing: bad.map((r) => r.no) }];
    }
    if (this.rules.length >= this.target) return this.win(null);
    if (this.vote) { this.wantNext = { by: null }; this.say('voteWait', 'idle'); return [{ type: 'mk_wait' }]; }
    return this.reveal(null);
  }

  command(id) {
    if (id === 'skip-rule') { const r = this.phase === 'play' && this.apply('xoaluat', { id: 'host', name: 'Chủ phòng' }); return r ? r.fx : []; }
    if (id === 'add-time') { if (this.phase === 'play') this.endsAt += 30_000; return []; }
    if (id === 'next') return this.phase === 'intro' ? this.startPlay() : this.startLevel();
    if (id === 'restart') { this.level = this.s.startLevel; return this.startLevel(); }
    if (id === 'clear-board') { this.torment = {}; this.helpers = {}; this.players = {}; this.feed = []; return [{ type: 'mk_board_cleared' }]; }
    return [];
  }

  tick() {
    if (this.paused) return [];
    const t = this.clock();
    const fx = [];
    this.lastTickAt = t;
    this.status = this.status.filter((s) => s.until > t);
    const left = this.pending.filter((p) => p.until <= t);
    if (left.length) {
      this.pending = this.pending.filter((p) => p.until > t);
      // không gõ kịp: lấy từ người khác bình luận
      for (const p of left) if (this.phase === 'play') { const r = this.wordRule(this.env()); if (r) { this.target++; const rule = this.addRule(r, { by: p.by }); fx.push(this.ruleFx(rule, 'ra luật')); } }
    }
    if (this.vote && t >= this.vote.until) fx.push(...this.resolveVote());
    if (t >= this.endsAt) {
      if (this.phase === 'intro') fx.push(...this.startPlay());
      else if (this.phase === 'play') fx.push(...this.fail());
      else if (this.phase === 'result') fx.push(...this.startLevel());
    }
    return fx;
  }

  onResume(d) {
    for (const s of this.status) s.until += d;
    for (const p of this.pending) p.until += d;
    if (this.vote) { this.vote.until += d; this.vote.at += d; }
    for (const f of this.feed) f.at += d;
  }

  // ---------------- trạng thái ----------------
  top(board, n = 3) { return Object.values(board).sort((a, b) => b.points - a.points).slice(0, n).map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, points: r.points })); }

  snapshot() {
    const t = this.clock();
    const env = this.env();
    const cur = this.current();
    const passed = this.rules.filter((r) => ruleOk(r, cur, env)).length;
    const strength = this.d.strength;
    const k = this.target ? passed / this.target : 0;
    return {
      mode: this.hostMode ? 'host' : 'viewer',
      phase: this.phase,
      paused: !!this.paused,
      level: this.level,
      best: this.best,
      wins: this.wins,
      remainingMs: Math.max(0, this.endsAt - t),
      totalMs: this.phase === 'play' ? this.totalMs : this.phase === 'intro' ? this.s.introSeconds * 1000 : this.s.resultSeconds * 1000,
      roundMs: this.totalMs,
      total: this.target,
      rules: this.rules.map((r) => ({ no: r.no, uid: r.uid, id: r.id, p: r.p ?? null, tier: RULES[r.id]?.tier ?? 0, text: ruleText(r, env), ok: ruleOk(r, cur, env), judge: isJudge(r), verdict: isJudge(r) ? env.judged(r.p.jid, cur) : null, by: r.by || null, hint: r.hint || null })),
      compiling: this.compiling.map((j) => ({ by: j.by, text: j.text })),
      checking: !!(this.checking || this.tryJudging),
      ai: this.ai,
      ruleSlots: this.ai && this.s.freeRules ? Math.max(0, this.s.freeRulesPerLevel - (this.freeUsed || 0)) : 0,
      passed,
      typed: this.typed,
      rev: this.rev,
      latest: this.latest ? { text: this.latest.text, by: this.latest.by, passed: this.latest.passed } : null,
      bestTry: this.bestTry ? { text: this.bestTry.text, by: this.bestTry.by, passed: this.bestTry.passed } : null,
      vote: this.vote ? { options: this.vote.options.map((o) => ruleText(o, env)), counts: this.vote.counts.slice(), leftMs: Math.max(0, this.vote.until - t), totalMs: this.vote.until - this.vote.at } : null,
      waiting: !!this.wantNext,
      pending: this.pending.map((p) => ({ by: p.by, kind: p.kind || 'word', leftMs: Math.max(0, p.until - t) })),
      aiGift: this.ai && !!this.s.aiRuleNeedsGift,
      status: this.status.map((s) => ({ kind: s.kind, by: s.by, leftMs: Math.max(0, s.until - t), totalMs: s.total })),
      shield: this.shield,
      bot: this.bot,
      strength: { k, label: strength[Math.min(strength.length - 1, Math.floor(k * (strength.length - 1) + 0.0001))] || '' },
      attempts: this.attempts,
      result: this.result,
      top: { torment: this.top(this.torment), helpers: this.top(this.helpers), players: this.top(this.players, 5) },
      feed: this.feed.map((f) => ({ by: f.by, action: f.action, n: f.n, ageMs: t - f.at })),
      env: { now: env.now, tz: env.tz },
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), every: b.every, count: b.every ? Math.min(b.count, b.every) : 0 })),
    };
  }

  serialize() {
    return {
      level: this.level, best: this.best, wins: this.wins, uid: this.uid, phase: this.phase, startedAt: this.startedAt, endsAt: this.endsAt, lastTickAt: this.lastTickAt ?? null,
      target: this.target, totalMs: this.totalMs, rules: this.rules, typed: this.typed, rev: this.rev, latest: this.latest, bestTry: this.bestTry,
      vote: this.vote, voteReady: this.voteReady, wantNext: this.wantNext, pending: this.pending, status: this.status, shield: this.shield,
      attempts: this.attempts, result: this.result, penalty: this.penalty ?? null, round: this.round, judged: this.judged, freeUsed: this.freeUsed ?? 0, ruleAt: this.ruleAt ?? {}, torment: this.torment, helpers: this.helpers, players: this.players, feed: this.feed, words: this.words, bot: this.bot,
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !['intro', 'play', 'result'].includes(s.phase) || !Array.isArray(s.rules)) return;
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of Object.keys(this.serialize())) if (k in copy) this[k] = copy[k];
    this.rules = this.rules.filter((r) => r && RULES[r.id]);
    this.level = Math.max(1, Math.min(99, Number(this.level) || 1));
    this.target = Math.max(this.rules.length, Math.min(MAX_RULES + 6, Number(this.target) || this.s.baseRules));
    this.typed = String(this.typed ?? '');
    for (const k of ['pending', 'status', 'feed', 'words']) if (!Array.isArray(this[k])) this[k] = [];
    for (const k of ['torment', 'helpers', 'players']) if (!this[k] || typeof this[k] !== 'object') this[k] = {};
    if (!this.bot || typeof this.bot !== 'object') this.bot = { id: 0, text: '', mood: 'idle' };
    if (!this.judged || typeof this.judged !== 'object') this.judged = {};
    if (!this.ruleAt || typeof this.ruleAt !== 'object') this.ruleAt = {};
    this.round = Number(this.round) || 1;
    this.compiling = []; this.checking = false; this.tryJudging = false; // yêu cầu AI đang chờ đã mất khi tải lại
    for (const r of this.rules) if (r.id === 'custom') { r.p = r.p && typeof r.p === 'object' ? r.p : {}; if (!r.p.judge) r.p.spec = cleanSpec(r.p.spec); }
    this.rules = this.rules.filter((r) => r.id !== 'custom' || r.p.judge || r.p.spec);
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(MatKhau);

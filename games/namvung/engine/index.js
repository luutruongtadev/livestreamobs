import { Emitter, makePausable, normalize, canon, digitsOf, triggerText, triggerIcon } from '#sdk';

/**
 * Nằm Vùng: streamer là cảnh sát chìm trong một trại lừa đảo. Mỗi chiến dịch là 5 chương (data/camp.json → days):
 *  - Ngày 1–4: tab 💼 Việc trại chạy KPI (nhắn tin mồi / gọi điện / sổ tiền; nút ⚠️ Cảnh báo ngầm để cứu nạn nhân),
 *    tab 🕵️ Bí mật thu bằng chứng (chụp, chép, sơ đồ, toạ độ) + tin mật của Chỉ huy Sơn (giải mã → khoảng an toàn)
 *    + lời nhắn của Bé Hai. Bằng chứng chỉ an toàn khi GỬI (cần sóng 100% từ tim của người xem).
 *  - Ngày 5 (Đêm giải cứu): màn chạy trốn — đi từng đoạn hành lang theo sơ đồ đã gửi, né camera, trốn khi có tuần tra.
 * Người xem: tim = sóng (ban ngày) / đánh lạc hướng camera (đêm cuối); bình luận "che" giảm nghi ngờ;
 * bình luận 1 / 2 chọn hướng đi mỗi chương; cuối ngày 4 bình luận A / B / C đoán kẻ phản bội.
 * Nghi phạm (3 người, tên ngẫu nhiên mỗi chiến dịch, không lặp chiến dịch trước) để lộ manh mối qua lời kể của Bé Hai.
 * Kết: Triệt phá hoàn toàn / Thoát cùng đồng hương / Thoát một mình / Bị lộ / Bị bán sang trại khác.
 *
 * Pha: brief → work → dayend → brief … → (đêm cuối) work → end → chiến dịch mới.
 */
export function createGame(ctx) { return new NamVung(ctx); }

export const HARM = ['tuantra', 'chuquan', 'tangkpi', 'thudt', 'chidiem', 'lucsoat', 'nhot', 'chuyentrai'];
export const HELP = ['lamngo', 'migoi', 'sim', 'noigian', 'lamho', 'giaicuu'];
export const CAMP_JOBS = ['chat', 'call', 'money'];
const STATUS_MS = { tuantra: 15000, thudt: 20000, nhot: 20000, camera: 15000 };
const STORY_MSG_MS = 7000;
const MAX_SUS = 100;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const pub = (u) => ({ id: String(u?.id ?? '?'), name: String(u?.name || 'Ẩn danh').slice(0, 40), avatar: u?.avatar || null });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const FALLBACK = {
  intro: ['Bạn là cảnh sát chìm, mật danh {code}.'], codes: ['Cá Mập'],
  chats: [['Việc nhẹ lương cao, làm online 2 tiếng 500 nghìn', 'Việc nhẹ lương cao']], victims: ['Anh Tuấn'],
  calls: [{ victim: 'Alo ai vậy?', script: 'Dạ em gọi từ bên giao hàng ạ', wrong: ['Em là kẻ lừa đảo đây ạ', 'Alo alo'] }],
  copies: ['Toà B3 tầng 4 giữ 27 người'],
  evidence: [{ name: 'Sổ chuyển tiền', icon: '💰', kind: 'photo' }, { name: 'Danh sách người bị giữ', icon: '📋', kind: 'copy' }, { name: 'Toạ độ khu trại', icon: '📍', kind: 'gps' }],
  rooms: ['Phòng máy A', 'Phòng máy B', 'Nhà ăn', 'Phòng chủ quản', 'Kho', 'Cổng sau'],
  pings: ['Gõ nhanh lên!'], patrol: ['Đang làm gì đó?'], punishments: ['Chống đẩy 10 cái'], tips: ['Ngân hàng không bao giờ xin mã OTP'],
  cast: { boss: { name: 'Hắc Long', icon: '🕶️' }, guard: { name: 'Tèo Cận', icon: '🔦' }, friend: { name: 'Bé Hai', icon: '🧑‍🌾' }, police: { name: 'Chỉ huy Sơn', icon: '👮' }, cao: { name: 'Cáo', icon: '🦊' } },
  suspects: [{ name: 'Tuấn Mập', icon: '🧔', role: 'đầu bếp' }, { name: 'Lan Ròm', icon: '👩', role: 'tổ trưởng' }, { name: 'Kiệt Sẹo', icon: '🧑‍🦲', role: 'tài xế' }],
  clues: { traitor: ['{name} có điện thoại riêng'], innocent: ['{name} hay khóc vì nhớ nhà'] },
  ciphers: ['DOI CA LUC HAI GIO'], relays: ['Mẹ ơi con vẫn khoẻ'],
  days: [{ title: 'Ngày 1', kind: 'day', intro: [], events: [] }, { title: 'Đêm giải cứu', kind: 'escape', intro: [], events: [] }],
  endings: {},
};

function bannedRegexes(list) {
  return String(list || '').split(',').map((w) => canon(w)).filter(Boolean).slice(0, 100)
    .map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'giu'));
}

export class NamVung extends Emitter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    this.s = ctx.settings;
    this.now = ctx.now;
    const d = ctx.data?.camp || {};
    this.d = Object.fromEntries(Object.entries(FALLBACK).map(([k, v]) => [k, (Array.isArray(v) ? Array.isArray(d[k]) && d[k].length : d[k] && typeof d[k] === 'object') ? d[k] : v]));
    this.banned = bannedRegexes(this.s.bannedWords);
    this.coverWord = normalize(this.s.coverWord || '');
    this.uid = 0;
    this.campaign = 0;
    this.wins = 0;
    this.bosses = {};
    this.helpers = {};
    this.feed = [];
    this.coverAt = {};
    this.lastSuspects = [];
    this.startCampaign();
  }

  pick(list) { return list[Math.floor(this.ctx.random() * list.length)]; }
  shuffle(list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.ctx.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  get collected() { return this.sent + this.held; }
  get days() { return this.d.days.length; }
  chapter() { return this.d.days[clamp(this.day - 1, 0, this.days - 1)] || {}; }
  get escaping() { return this.phase === 'work' && !!this.escape; }
  person(who) {
    const c = this.d.cast[who];
    if (c) return { id: `npc:${who}`, name: String(c.name), avatar: null, npc: true, icon: String(c.icon || '💬') };
    return { id: 'npc:?', name: String(who || 'Ai đó'), avatar: null, npc: true, icon: '💬' };
  }

  // ---------------- vòng đời ----------------
  startCampaign() {
    this.campaign++;
    this.code = this.pick(this.d.codes);
    const ev = this.d.evidence;
    const gps = ev.filter((e) => e.kind === 'gps');
    const rest = this.shuffle(ev.filter((e) => e.kind !== 'gps'));
    const n = clamp(this.s.evidence, 1, ev.length);
    this.items = (gps.length ? [...rest.slice(0, n - 1), gps[0]] : rest.slice(0, n)).map((e) => ({ name: String(e.name), icon: String(e.icon || '📁'), kind: ['photo', 'copy', 'gps', 'map'].includes(e.kind) ? e.kind : 'photo', note: String(e.note || '') }));
    // 3 nghi phạm mới (không trùng tên chiến dịch trước), 1 kẻ phản bội
    const pool = this.d.suspects.filter((x) => !this.lastSuspects.includes(x.name));
    this.suspects = this.shuffle(pool.length >= 3 ? pool : this.d.suspects).slice(0, 3).map((x) => ({ name: String(x.name), icon: String(x.icon || '🧑'), role: String(x.role || '') }));
    this.lastSuspects = this.suspects.map((x) => x.name);
    this.traitor = Math.floor(this.ctx.random() * this.suspects.length);
    this.clueBag = { traitor: this.shuffle(this.d.clues.traitor || []), innocent: this.shuffle(this.d.clues.innocent || []) };
    this.clues = [];
    this.sent = 0; this.held = 0; this.saved = 0; this.scams = 0;
    this.suspicion = 0; this.signal = 0; this.day = 0;
    this.flags = { bribe: false, friend: null, trust: false, usb: null, route: null };
    this.guess = null;
    this.tags = [];
    this.choices = [];
    this.result = null;
    return this.startDay();
  }

  startDay() {
    this.day++;
    const ch = this.chapter();
    this.phase = 'brief';
    this.startedAt = this.clock();
    this.kpi = 0;
    this.kpiTarget = this.s.kpi + Math.min(4, this.day - 1);
    this.tab = 'camp';
    this.job = null; this.secret = null; this.special = null; this.escape = null;
    this.jobNo = 0;
    this.pings = []; this.status = [];
    this.caught = false;
    this.safeUntil = 0;
    this.storyIdx = 0; this.storyMsgs = [];
    this.lastTickAt = this.startedAt;
    this.dayResult = null;
    this.queued = [];
    this.choice = null;
    const opts = ch.choice?.options;
    this.vote = this.s.voteSeconds > 0 && Array.isArray(opts) && opts.length >= 2
      ? { kind: 'choice', q: String(ch.choice.q || ''), options: opts.slice(0, 2).map((o) => ({ label: String(o.label || '') })), counts: [0, 0], voters: {} }
      : null;
    const briefS = Math.max(this.s.briefSeconds, this.s.storyBriefSeconds, this.vote ? this.s.voteSeconds : 0);
    this.endsAt = this.startedAt + briefS * 1000;
    return [{ type: 'nv_brief', day: this.day, days: this.days, campaign: this.campaign, first: this.day === 1, kpi: this.kpiTarget, title: String(ch.title || '') }];
  }

  startWork() {
    const fx = [];
    if (this.vote?.kind === 'choice') fx.push(...this.resolveChoice());
    const ch = this.chapter();
    this.phase = 'work';
    this.startedAt = this.clock();
    this.lastTickAt = this.startedAt;
    if (ch.kind === 'escape') {
      this.endsAt = this.startedAt + this.s.nightSeconds * 1000;
      this.setupEscape();
    } else {
      this.endsAt = this.startedAt + this.s.daySeconds * 1000;
      this.newJob();
      this.newSecret();
    }
    fx.unshift({ type: 'nv_start', day: this.day, escape: !!this.escape });
    for (const q of this.queued) { const r = this.applyEffect(q.id, q.by); fx.push({ type: 'nv_gift', action: q.id, by: q.by, sub: r.sub, harm: HARM.includes(q.id), applied: true, late: true }, ...r.fx); }
    this.queued = [];
    return fx;
  }

  /** Chốt lựa chọn của người xem (nhiều phiếu thắng, hoà thì ngẫu nhiên) và áp dụng. */
  resolveChoice() {
    const v = this.vote;
    this.vote = null;
    const opts = this.chapter().choice?.options || [];
    const [a, b] = v.counts;
    const i = a === b ? Math.floor(this.ctx.random() * 2) : a > b ? 0 : 1;
    const o = opts[i] || {};
    let result = String(o.result || '');
    const fx = [];
    if (o.kpi) this.kpiTarget = Math.max(1, this.kpiTarget + Number(o.kpi));
    if (o.sus) this.suspicion = clamp(this.suspicion + Number(o.sus), 0, MAX_SUS - 1);
    if (o.bribe) this.flags.bribe = true;
    if (o.friend === true || o.friend === false) this.flags.friend = o.friend;
    if (o.route) this.flags.route = o.route === 'short' ? 'short' : 'long';
    if (o.usb) {
      const lucky = this.ctx.random() < 0.5;
      this.flags.usb = lucky ? 'good' : 'bad';
      if (lucky) { const n = Math.min(2, this.items.length - this.collected); this.held += n; result = `USB chứa thật! +${n} bằng chứng chưa gửi.`; }
      else { this.suspicion = clamp(this.suspicion + 20, 0, MAX_SUS - 1); this.signal = 0; result = 'Bẫy! USB phát cảnh báo lên máy chủ: nghi ngờ +20%, mất sóng.'; }
    }
    const tag = o.tag === 'lieu' ? 'lieu' : 'tot';
    this.tags.push(tag);
    this.choice = { i, label: String(o.label || ''), tag, result, votes: v.counts.slice(), day: this.day };
    this.choices.push(this.choice);
    fx.push({ type: 'nv_choice', ...this.choice });
    return fx;
  }

  /** Cuối ngày 4: người xem đoán kẻ phản bội (A / B / C). */
  resolveTraitor() {
    const v = this.vote;
    this.vote = null;
    const max = Math.max(...v.counts);
    const top = v.counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
    const i = top[Math.floor(this.ctx.random() * top.length)];
    const correct = i === this.traitor;
    this.guess = { i, correct, name: this.suspects[i].name, traitor: this.suspects[this.traitor].name, votes: v.counts.slice() };
    if (correct) this.suspicion = clamp(this.suspicion - 10, 0, MAX_SUS - 1);
    else this.suspicion = clamp(this.suspicion + 15, 0, MAX_SUS - 1);
    return [{ type: 'nv_traitor', ...this.guess }];
  }

  endDay() {
    if (this.escape) return this.finish(false, 'ban'); // trời sáng mà chưa thoát
    // ngày kết thúc sớm (streamer bấm sang ngày): manh mối chưa kịp kể vẫn được ghi lại cho lúc đoán kẻ phản bội
    const evs = this.chapter().events || [];
    for (; this.storyIdx < evs.length; this.storyIdx++) if (evs[this.storyIdx]?.who === 'clue') this.giveClue(Number(evs[this.storyIdx].text) || 0);
    const ok = this.kpi >= this.kpiTarget;
    const before = this.suspicion;
    this.suspicion = clamp(this.suspicion + (ok ? -this.s.kpiBonus : this.s.missKpi), 0, MAX_SUS);
    this.dayResult = { ok, kpi: this.kpi, target: this.kpiTarget, day: this.day, sus: Math.round(this.suspicion), delta: Math.round(this.suspicion - before), punishment: !ok ? this.pick(this.d.punishments) : null, choice: this.choice, title: String(this.chapter().title || '') };
    this.clearWork();
    if (this.suspicion >= MAX_SUS) return this.finish(false, 'lo');
    this.phase = 'dayend';
    this.startedAt = this.clock();
    const fx = [];
    if (this.chapter().traitorVote && this.s.voteSeconds > 0) {
      this.vote = { kind: 'traitor', q: 'Ai là kẻ phản bội? Bình luận A, B hoặc C', options: this.suspects.map((x, k) => ({ label: `${LETTERS[k]}. ${x.name}` })), counts: this.suspects.map(() => 0), voters: {} };
      fx.push({ type: 'nv_traitor_vote' });
    }
    this.endsAt = this.startedAt + Math.max(this.s.resultSeconds, this.vote ? this.s.voteSeconds + 3 : 0) * 1000;
    return [{ type: 'nv_dayend', ...this.dayResult }, ...fx];
  }

  clearWork() { this.pings = []; this.status = []; this.job = null; this.secret = null; this.special = null; this.tab = 'camp'; this.storyMsgs = []; }

  finish(win, how) {
    const t = this.clock();
    const sentAll = this.sent >= this.items.length;
    const friend = !!this.flags.friend;
    const right = this.guess ? this.guess.correct : !(this.s.voteSeconds > 0); // tắt bình chọn → coi như đã lật tẩy
    let ending = how === 'lo' ? 'lo' : how === 'ban' ? 'ban' : sentAll && friend && right ? 'full' : friend ? 'friend' : 'alone';
    if (win && how === 'giaicuu') ending = this.guess?.correct === false ? 'friend' : 'full'; // công an ập vào: cứu tất cả
    const E = this.d.endings?.[ending] || {};
    const why = !sentAll ? 'thiếu bằng chứng,' : !this.guess?.correct ? 'kẻ phản bội đã báo tin,' : '';
    const fill = (l) => String(l).replace(/\{code\}/g, this.code).replace(/\{traitor\}/g, this.suspects[this.traitor].name).replace(/\{route\}/g, this.flags.route === 'short' ? 'cổng sau' : 'đường ống').replace(/\{why\}/g, why);
    const saved = this.saved + ((friend || how === 'giaicuu') && win ? 1 : 0);
    if (win) this.wins++;
    this.clearWork();
    this.escape = null; this.vote = null;
    this.result = {
      win, how, ending, title: String(E.title || (win ? 'GIẢI CỨU' : 'THẤT BẠI')), icon: String(E.icon || (win ? '🚔' : '😱')),
      lines: (Array.isArray(E.lines) ? E.lines : []).map(fill),
      campaign: this.campaign, code: this.code, day: this.day, days: this.days,
      sent: this.sent, total: this.items.length, saved, scams: this.scams, sus: Math.round(this.suspicion),
      dossier: this.items.map((it, i) => ({ ...it, sent: i < this.sent || (how === 'giaicuu') })),
      traitor: { name: this.suspects[this.traitor].name, icon: this.suspects[this.traitor].icon, guessed: this.guess?.name || null, correct: this.guess?.correct ?? null },
      friend, choices: this.choices.map((c) => ({ day: c.day, label: c.label, tag: c.tag })),
      tip: this.pick(this.d.tips),
    };
    this.phase = 'end';
    this.startedAt = t;
    this.endsAt = t + this.s.endSeconds * 1000;
    this.ctx.report?.round?.({ win, ending, campaign: this.campaign, day: this.day, sent: this.sent, total: this.items.length, saved });
    return [{ type: win ? 'nv_win' : 'nv_lose', ...this.result }];
  }

  // ---------------- đêm giải cứu ----------------
  setupEscape() {
    const route = this.flags.route || 'long';
    const n = (route === 'short' ? 5 : 7) + (this.flags.friend ? 1 : 0);
    const mapSent = this.items.some((it, i) => it.kind === 'map' && i < this.sent);
    const revealN = mapSent ? n : Math.round(n * this.sent / Math.max(1, this.items.length));
    const on = (route === 'short' ? 0.55 : 0.4) + (this.guess && !this.guess.correct ? 0.12 : 0) - (this.guess?.correct ? 0.08 : 0);
    this.escape = {
      seg: 0, n, route, hidden: false, nextMoveAt: 0, camOffUntil: 0,
      segs: Array.from({ length: n }, (_, i) => ({
        dir: this.ctx.random() < 0.5 ? 'trai' : 'phai', revealed: i < revealN,
        period: 2600 + Math.floor(this.ctx.random() * 1800), offset: Math.floor(this.ctx.random() * 3000), on: clamp(on, 0.2, 0.8),
      })),
    };
  }

  camOn(t, i = this.escape?.seg) {
    const e = this.escape;
    const s = e?.segs[i];
    if (!s || t < e.camOffUntil) return false;
    const boost = this.active('camera') ? 0.2 : 0;
    return (((t - this.startedAt + s.offset) % s.period) / s.period) < Math.min(0.85, s.on + boost);
  }

  move(dir) {
    const e = this.escape;
    const t = this.clock();
    if (this.covered() || e.hidden || t < e.nextMoveAt) return [];
    const s = e.segs[e.seg];
    if (this.camOn(t)) return [{ type: 'nv_spotted' }, ...this.addSus(15)];
    if (dir !== s.dir) { s.revealed = true; return [{ type: 'nv_wrong', kind: 'deadend' }, ...this.addSus(6)]; }
    e.seg++;
    e.nextMoveAt = t + (this.flags.friend ? (this.flags.trust ? 900 : 1500) : 700);
    if (e.seg >= e.n) return [{ type: 'nv_move', seg: e.seg, n: e.n }, ...this.finish(true, 'escape')];
    return [{ type: 'nv_move', seg: e.seg, n: e.n }];
  }

  // ---------------- việc trại (KPI) ----------------
  newJob() {
    const kind = this.s.campJobs === 'chat' ? 'chat' : CAMP_JOBS[this.jobNo % CAMP_JOBS.length];
    this.jobNo++;
    const id = ++this.uid;
    if (kind === 'chat') {
      const [text, flag] = this.pick(this.d.chats);
      this.job = { kind, id, to: this.pick(this.d.victims), text: String(text), flag: String(flag || ''), typed: '' };
    } else if (kind === 'call') {
      const c = this.pick(this.d.calls);
      const opts = this.shuffle([String(c.script), ...(c.wrong || []).slice(0, 2).map(String)]);
      this.job = { kind, id, to: this.pick(this.d.victims), victim: String(c.victim), opts, answer: opts.indexOf(String(c.script)) };
    } else {
      const n = this.day >= 3 ? 4 : 3;
      this.job = { kind, id, nums: Array.from({ length: n }, () => (1 + Math.floor(this.ctx.random() * 49)) * 10), typed: '' };
    }
  }

  completeJob(by = null) {
    if (this.phase !== 'work' || this.escape) return [];
    this.kpi++;
    this.scams++;
    const fx = [{ type: 'nv_kpi', kpi: this.kpi, target: this.kpiTarget, by }];
    this.newJob();
    return fx;
  }

  warn() {
    const j = this.job;
    if (j?.kind !== 'chat') return [];
    this.saved++;
    this.suspicion = clamp(this.suspicion + this.s.warnSuspicion, 0, MAX_SUS);
    const fx = [{ type: 'nv_saved', to: j.to, saved: this.saved }];
    this.newJob();
    if (this.suspicion >= MAX_SUS) fx.push(...this.finish(false, 'lo'));
    return fx;
  }

  // ---------------- việc bí mật (bằng chứng, tin mật, lời nhắn) ----------------
  newSecret() {
    if (this.collected >= this.items.length) { this.secret = null; return; }
    const item = this.items[this.collected];
    const id = ++this.uid;
    if (item.kind === 'photo') this.secret = { kind: 'photo', id, item, shots: 0, need: 6 };
    else if (item.kind === 'copy') this.secret = { kind: 'copy', id, item, text: this.pick(this.d.copies), typed: '' };
    else if (item.kind === 'gps') {
      const r = (a, b, dp) => (a + this.ctx.random() * (b - a)).toFixed(dp);
      this.secret = { kind: 'gps', id, item, text: `${r(10.5, 14.5, 4)}, ${r(102.5, 107.5, 4)}`, typed: '' };
    } else {
      const rooms = this.shuffle(this.d.rooms).slice(0, 6).map(String);
      this.secret = { kind: 'map', id, item, rooms, order: this.shuffle([0, 1, 2, 3, 4, 5]).slice(0, 4), pos: 0 };
    }
  }

  completeSecret(by = null) {
    if (this.phase !== 'work' || this.escape || this.collected >= this.items.length) return [];
    const item = this.items[this.collected];
    this.held++;
    this.newSecret();
    return [{ type: 'nv_evidence', item, held: this.held, sent: this.sent, total: this.items.length, by }];
  }

  /** Tin mật của Chỉ huy Sơn: mỗi chữ cái bị dịch lên `shift` vị trí; giải đúng → khoảng an toàn ở tab Bí mật. */
  makeCipher() {
    const plain = String(this.pick(this.d.ciphers)).toUpperCase().replace(/[^A-Z ]/g, '');
    const shift = 1 + Math.floor(this.ctx.random() * 3);
    const enc = plain.replace(/[A-Z]/g, (c) => LETTERS[(LETTERS.indexOf(c) + shift) % 26]);
    return { kind: 'cipher', id: ++this.uid, plain, enc, shift, typed: '' };
  }

  canSend() { return this.phase === 'work' && !this.escape && this.held > 0 && this.signal >= 100 && !this.active('thudt') && !this.active('nhot'); }

  sendEvidence() {
    if (!this.canSend()) return [{ type: 'nv_wrong', kind: 'send' }];
    const n = this.held;
    const pages = this.items.slice(this.sent, this.sent + n);
    this.sent += n; this.held = 0; this.signal = 0;
    const fx = [{ type: 'nv_sent', n, sent: this.sent, total: this.items.length, pages }];
    if (this.sent >= this.items.length) { this.say('police', 'Đã nhận đủ hồ sơ! Đêm giải cứu chỉ cần thoát ra ngoài, đội đặc nhiệm lo phần còn lại.'); fx.push({ type: 'nv_story', by: this.person('police'), text: 'Đã nhận đủ hồ sơ!' }); }
    return fx;
  }

  // ---------------- nghi ngờ / trạng thái ----------------
  addSus(n) {
    if (this.phase !== 'work') return [];
    this.suspicion = clamp(this.suspicion + n, 0, MAX_SUS);
    return this.suspicion >= MAX_SUS ? this.finish(false, 'lo') : [];
  }

  addStatus(kind, by) {
    const t = this.clock();
    let ms = STATUS_MS[kind] || 15000;
    if (kind === 'tuantra' && this.flags.bribe) ms = Math.round(ms * 0.5); // đã đưa tiền cho Tèo Cận
    const cur = this.status.find((s) => s.kind === kind && s.until > t);
    if (cur) { cur.until += Math.round(ms / 2); cur.total = cur.until - t; cur.by = by; }
    else { this.status = this.status.filter((s) => s.kind !== kind); this.status.push({ kind, by, until: t + ms, total: ms, line: this.pick(this.d.patrol) }); }
    if (kind === 'tuantra') this.caught = false;
  }

  active(kind) { const t = this.clock(); return this.status.some((s) => s.kind === kind && s.until > t); }
  covered() { return this.active('nhot') || this.pings.length > 0; }

  clean(text) {
    let t = String(text ?? '').replace(/\s+/g, ' ').trim();
    const cps = [...t];
    if (cps.length > 80) t = cps.slice(0, 79).join('') + '…';
    for (const re of this.banned) t = t.replace(re, (m, pre) => `${pre}***`);
    return t;
  }

  addPing(by, text = null) {
    const t = this.clock();
    const p = { id: ++this.uid, by, text, waiting: text == null, waitUntil: t + this.s.pingWaitSeconds * 1000 };
    this.pings.push(p);
    while (this.pings.length > this.s.maxPings) this.pings.shift();
    return [{ type: 'nv_ping', id: p.id, by }];
  }

  setText(p, text) { p.text = text; p.waiting = false; return { type: 'nv_ping_text', id: p.id, by: p.by, text }; }

  say(who, text) {
    const by = typeof who === 'string' ? this.person(who) : who;
    this.storyMsgs.push({ id: ++this.uid, by, text: String(text).slice(0, 140), until: this.clock() + STORY_MSG_MS });
    while (this.storyMsgs.length > 3) this.storyMsgs.shift();
    return by;
  }

  same(a, b) {
    if (this.s.strictAccents) { const k = (x) => canon(x).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim(); return k(a) === k(b); }
    return normalize(a) === normalize(b);
  }

  // ---------------- người xem ----------------
  handle(ev) {
    if (this.paused || !ev?.type) return [];
    if (ev.type === 'like') {
      if (this.phase !== 'work') return [];
      const n = clamp(Number(ev.count) || 1, 1, 100000);
      if (this.escape) { // đêm cuối: tim = đánh lạc hướng camera
        const t = this.clock();
        const before = this.escape.camOffUntil > t;
        this.escape.camOffUntil = Math.min(t + 8000, Math.max(this.escape.camOffUntil, t) + n * this.s.likeDistractMs);
        return before ? [] : [{ type: 'nv_distract' }];
      }
      if (this.active('thudt')) return [];
      const before = this.signal;
      this.signal = clamp(this.signal + n * this.s.signalPerLike, 0, 100);
      return before < 100 && this.signal >= 100 ? [{ type: 'nv_signal_full' }] : [];
    }
    if (ev.type !== 'comment' || !ev.user) return [];
    const by = pub(ev.user);
    const p = this.pings.find((x) => x.waiting && x.by.id === by.id);
    if (p) { const text = this.clean(ev.text); return text ? [this.setText(p, text)] : []; }
    if (this.vote) {
      const txt = normalize(ev.text);
      let i = -1;
      if (this.vote.kind === 'traitor') { const m = txt.match(/^([abc123])(?![a-z0-9])/); if (m) i = 'abc'.includes(m[1]) ? 'abc'.indexOf(m[1]) : Number(m[1]) - 1; }
      else { const m = txt.match(/^([12])(?!\d)/); if (m) i = Number(m[1]) - 1; }
      if (i >= 0 && i < this.vote.counts.length && this.vote.voters[by.id] == null && Object.keys(this.vote.voters).length < 5000) {
        this.vote.voters[by.id] = i; this.vote.counts[i]++;
        return [{ type: 'nv_vote', i, counts: this.vote.counts.slice(), by }];
      }
      if (i >= 0) return [];
    }
    if (!this.coverWord || this.phase !== 'work') return [];
    const words = ` ${normalize(ev.text)} `;
    if (!words.includes(` ${this.coverWord} `)) return [];
    const t = this.clock();
    if (t - (this.coverAt[by.id] ?? -Infinity) < this.s.coverCooldownSec * 1000) return [];
    this.coverAt[by.id] = t;
    if (Object.keys(this.coverAt).length > 500) this.coverAt = { [by.id]: t };
    this.suspicion = clamp(this.suspicion - this.s.coverPoints, 0, MAX_SUS);
    const pat = this.status.find((s) => s.kind === 'tuantra' && s.until > t);
    if (pat) pat.until = Math.max(t + 1000, pat.until - 1000);
    const row = (this.helpers[by.id] ||= { ...by, points: 0, gifts: 0 });
    Object.assign(row, { name: by.name, avatar: by.avatar });
    row.points += 1;
    return [{ type: 'nv_cover', by }];
  }

  action(id, ev = {}, binding = null) {
    void binding;
    if (this.paused) return false;
    if (!HARM.includes(id) && !HELP.includes(id)) return [];
    const by = pub(ev.user);
    const coins = ev.type === 'gift' ? Math.max(0, Number(ev.diamonds) || 0) : 0;
    const fx = [];
    let sub = '';
    if (this.phase === 'brief' && this.vote) { if (this.queued.length < 20) this.queued.push({ id, by }); sub = 'có tác dụng khi vào ca'; }
    else if (this.phase === 'brief') fx.push(...this.startWork());
    const t = this.clock();
    const work = this.phase === 'work';
    if (work) { const r = this.applyEffect(id, by); fx.push(...r.fx); sub = r.sub; }
    const board = HARM.includes(id) ? this.bosses : this.helpers;
    const row = (board[by.id] ||= { ...by, points: 0, gifts: 0 });
    Object.assign(row, { name: by.name, avatar: by.avatar });
    row.points += Math.max(1, coins); row.gifts++;
    const last = this.feed[this.feed.length - 1];
    if (last && last.by.id === by.id && last.action === id && t - last.at < 8000) { last.n++; last.at = t; }
    else { this.feed.push({ by, action: id, n: 1, at: t }); if (this.feed.length > 6) this.feed.shift(); }
    if (ev.type === 'gift') this.ctx.report?.points?.(by, Math.max(1, coins), false);
    return [{ type: 'nv_gift', action: id, by, sub, harm: HARM.includes(id), applied: work, coins }, ...fx];
  }

  /** Tác dụng của quà / sự kiện cốt truyện trong ca (ban ngày hoặc đêm giải cứu). */
  applyEffect(id, by, text = null) {
    const fx = [];
    let sub = '';
    const t = this.clock();
    const e = this.escape;
    switch (id) {
      case 'tuantra': this.addStatus('tuantra', by); sub = e ? 'mau bấm TRỐN!' : this.tab === 'secret' ? 'mau chuyển tab!' : 'đi ngang phòng máy'; break;
      case 'chuquan': fx.push(...this.addPing(by, text)); if (this.tab === 'secret') { this.tab = 'camp'; sub = 'bị gọi giật, quay về việc trại'; } break;
      case 'tangkpi': if (e) { this.addStatus('camera', by); sub = 'camera quét dày hơn 15 giây'; } else { this.kpiTarget += 2; sub = `KPI hôm nay: ${this.kpiTarget}`; } break;
      case 'thudt': if (e) { fx.push(...this.addSus(5)); sub = 'rọi đèn khắp nơi: +5% nghi ngờ'; } else { this.signal = 0; this.addStatus('thudt', by); if (this.tab === 'secret') this.tab = 'camp'; sub = 'mất sóng, khoá tab bí mật'; } break;
      case 'chidiem': fx.push(...this.addSus(15)); sub = '+15% nghi ngờ'; break;
      case 'lucsoat':
        if (!e && this.held > 0) { sub = `mất ${this.held} bằng chứng chưa gửi`; this.held = 0; this.newSecret(); }
        else { fx.push(...this.addSus(10)); sub = '+10% nghi ngờ'; }
        break;
      case 'nhot': this.addStatus('nhot', by); sub = 'khoá màn hình 20 giây'; break;
      case 'chuyentrai':
        if (e) { e.seg = Math.max(0, e.seg - 1); sub = 'bị đẩy lùi 1 đoạn'; }
        else { this.kpi = 0; this.endsAt = Math.max(t + 10_000, this.endsAt - 30_000); sub = 'KPI về 0, −30 giây'; }
        break;
      case 'lamngo': this.suspicion = clamp(this.suspicion - 10, 0, MAX_SUS); this.status = this.status.filter((s) => s.kind !== 'tuantra'); sub = '−10% nghi ngờ'; break;
      case 'migoi': this.endsAt += 30_000; sub = '+30 giây'; break;
      case 'sim':
        if (e) { e.camOffUntil = Math.max(e.camOffUntil, t) + 5000; sub = 'camera tắt 5 giây'; }
        else if (!this.active('thudt')) { this.signal = 100; sub = 'sóng đầy 100%'; } else sub = 'điện thoại đang bị thu…';
        break;
      case 'noigian':
        if (e) { let k = 0; for (const s of e.segs.slice(e.seg)) if (!s.revealed && k < 2) { s.revealed = true; k++; } sub = 'chỉ đường 2 đoạn'; }
        else { fx.push(...this.completeSecret(by)); sub = '+1 bằng chứng'; }
        break;
      case 'lamho':
        if (e) { e.seg++; sub = 'dẫn đường +1 đoạn'; if (e.seg >= e.n) fx.push(...this.finish(true, 'escape')); }
        else { fx.push(...this.completeJob(by)); sub = '+1 KPI'; }
        break;
      case 'giaicuu': this.sent = this.items.length; this.held = 0; fx.push(...this.finish(true, 'giaicuu')); sub = 'công an ập vào!'; break;
      default:
    }
    return { fx, sub };
  }

  // ---------------- đầu vào của streamer ----------------
  input(ev = {}) {
    if (this.paused || this.phase !== 'work' || !ev || typeof ev !== 'object') return [];
    switch (ev.type) {
      case 'text': {
        if (this.covered() || this.escape) return [];
        const v = String(ev.value ?? '').slice(0, 200);
        const j = this.tab === 'secret' ? (this.special || this.secret) : this.job;
        if (j && 'typed' in j) j.typed = j.kind === 'money' ? v.replace(/[^\d]/g, '').slice(0, 7) : v;
        return [];
      }
      case 'enter': return this.escape ? [] : this.submit();
      case 'click': return this.click(ev);
      case 'tab': return this.escape ? [] : this.switchTab(ev.id);
      case 'move': return this.escape ? this.move(ev.dir === 'trai' ? 'trai' : 'phai') : [];
      case 'hide': if (!this.escape || this.covered()) return []; this.escape.hidden = !this.escape.hidden; return [{ type: 'nv_hide', hidden: this.escape.hidden }];
      default: return [];
    }
  }

  switchTab(id) {
    if (id !== 'camp' && id !== 'secret') return [];
    if (this.active('nhot')) return [];
    if (id === 'secret' && this.active('thudt')) return [{ type: 'nv_wrong', kind: 'locked' }];
    if (this.tab === id) return [];
    this.tab = id;
    return [{ type: 'nv_tab', tab: id }];
  }

  submit() {
    if (this.covered()) return [];
    if (this.tab === 'secret') {
      const sp = this.special;
      if (sp?.kind === 'cipher') {
        if (normalize(sp.typed).replace(/\s+/g, '') !== normalize(sp.plain).replace(/\s+/g, '')) return [{ type: 'nv_wrong', kind: 'cipher' }];
        this.special = null;
        this.safeUntil = this.clock() + this.s.safeSeconds * 1000;
        return [{ type: 'nv_cipher_ok', plain: sp.plain, safeMs: this.s.safeSeconds * 1000 }];
      }
      if (sp?.kind === 'relay') {
        if (!this.same(sp.typed, sp.text)) return [{ type: 'nv_wrong', kind: 'relay' }];
        this.special = null; this.flags.trust = true;
        const by = this.say('friend', 'Cảm ơn anh/chị… em sẽ đi nhanh nhất có thể!');
        return [{ type: 'nv_relay_ok' }, { type: 'nv_story', by, text: 'Cảm ơn anh/chị…' }];
      }
      const j = this.secret;
      if (j?.kind === 'copy') return this.same(j.typed, j.text) ? this.completeSecret() : [{ type: 'nv_wrong', kind: 'copy' }];
      if (j?.kind === 'gps') return digitsOf(j.typed) === digitsOf(j.text) && j.typed ? this.completeSecret() : [{ type: 'nv_wrong', kind: 'gps' }];
      return [];
    }
    const j = this.job;
    if (j?.kind === 'chat') return this.same(j.typed, j.text) ? this.completeJob() : [{ type: 'nv_wrong', kind: 'chat' }];
    if (j?.kind === 'money') return j.typed !== '' && Number(j.typed) === j.nums.reduce((a, x) => a + x, 0) ? this.completeJob() : [{ type: 'nv_wrong', kind: 'money' }];
    return [];
  }

  click(ev) {
    const target = String(ev.target || '');
    if (target === 'ping') {
      const i = this.pings.findIndex((p) => p.id === Number(ev.id));
      if (i < 0) return [];
      this.pings.splice(i, 1);
      return [{ type: 'nv_ping_close' }];
    }
    if (this.escape) {
      if (target === 'move') return this.move(ev.id === 'trai' ? 'trai' : 'phai');
      if (target === 'hide') return this.input({ type: 'hide' });
      return [];
    }
    if (target === 'tab') return this.switchTab(ev.id);
    if (this.covered()) return [];
    if (target === 'send') return this.submit();
    if (this.tab === 'secret') {
      if (target === 'radio') return this.sendEvidence();
      if (this.special) return [];
      const j = this.secret;
      if (j?.kind === 'photo' && target === 'shutter') {
        j.shots++;
        return j.shots >= j.need ? this.completeSecret() : [{ type: 'nv_shot', n: j.shots, need: j.need }];
      }
      if (j?.kind === 'map' && target === 'room') {
        const i = Number(ev.id);
        if (!(i >= 0 && i < j.rooms.length)) return [];
        if (j.order[j.pos] === i) { j.pos++; return j.pos >= j.order.length ? this.completeSecret() : [{ type: 'nv_zap' }]; }
        j.pos = 0;
        return [{ type: 'nv_wrong', kind: 'map' }, ...this.addSus(2)];
      }
      return [];
    }
    const j = this.job;
    if (target === 'warn') return this.warn();
    if (j?.kind === 'call' && target === 'opt') {
      const i = Number(ev.id);
      if (!(i >= 0 && i < j.opts.length)) return [];
      if (i === j.answer) return this.completeJob();
      return [{ type: 'nv_wrong', kind: 'call' }, ...this.addSus(3)];
    }
    return [];
  }

  command(id) {
    if (id === 'next-day') return this.phase === 'work' ? this.endDay() : this.phase === 'end' ? this.startCampaign() : this.phase === 'dayend' ? this.nextFromDayEnd() : this.startWork();
    if (id === 'new-campaign') return this.startCampaign();
    if (id === 'clear-board') { this.bosses = {}; this.helpers = {}; this.feed = []; return [{ type: 'nv_board_cleared' }]; }
    return [];
  }

  nextFromDayEnd() {
    const fx = [];
    if (this.vote?.kind === 'traitor') fx.push(...this.resolveTraitor());
    fx.push(...this.startDay());
    return fx;
  }

  // ---------------- cốt truyện theo mốc thời gian ----------------
  storyTick(t) {
    const evs = this.chapter().events;
    if (!Array.isArray(evs)) return [];
    const total = this.escape ? this.s.nightSeconds * 1000 : this.s.daySeconds * 1000;
    const fx = [];
    while (this.phase === 'work' && this.storyIdx < evs.length) {
      const e = evs[this.storyIdx] || {};
      if (t < this.startedAt + clamp(Number(e.at) || 0, 0, 1) * total) break;
      this.storyIdx++;
      if (e.who === 'clue') { fx.push(...this.giveClue(Number(e.text) || 0)); continue; }
      const by = this.person(e.who);
      const text = String(e.text || '');
      if (e.effect === 'cipher') { this.special = this.makeCipher(); this.say(by, text); fx.push({ type: 'nv_story', by, text, special: 'cipher' }); continue; }
      if (e.effect === 'relay') {
        if (this.flags.friend === false) continue;
        this.special = { kind: 'relay', id: ++this.uid, text: String(this.pick(this.d.relays)), typed: '' };
        this.say(by, text); fx.push({ type: 'nv_story', by, text, special: 'relay' }); continue;
      }
      if (e.effect === 'chuquan') { fx.push(...this.applyEffect('chuquan', by, text).fx, { type: 'nv_story', by, text, effect: 'chuquan' }); continue; }
      this.say(by, text);
      const r = HARM.includes(e.effect) || HELP.includes(e.effect) ? this.applyEffect(e.effect, by) : { fx: [], sub: '' };
      fx.push({ type: 'nv_story', by, text, effect: e.effect || null, sub: r.sub }, ...r.fx);
    }
    return fx;
  }

  /** Manh mối về kẻ phản bội: k = 0 → manh mối thật về kẻ phản bội, k = 1 → chuyện của một người vô tội. */
  giveClue(k) {
    const innocents = this.suspects.map((_, i) => i).filter((i) => i !== this.traitor);
    const who = k === 0 ? this.traitor : innocents[(this.day + k) % innocents.length];
    const bag = k === 0 ? this.clueBag.traitor : this.clueBag.innocent;
    const tpl = bag.length ? bag.shift() : '{name} cư xử rất lạ';
    const sus = this.suspects[who];
    const text = String(tpl).replace(/\{name\}/g, sus.name);
    this.clues.push({ who, text, day: this.day });
    const teller = this.flags.friend === false ? this.person('cao') : this.person('friend');
    this.say(teller, `Nghe nói ${text}…`);
    return [{ type: 'nv_clue', who, name: sus.name, text }];
  }

  tick() {
    if (this.paused) return [];
    const t = this.clock();
    const dt = clamp((t - (this.lastTickAt ?? t)) / 1000, 0, 2);
    this.lastTickAt = t;
    const fx = [];
    for (const p of this.pings) if (p.waiting && t >= p.waitUntil) fx.push(this.setText(p, this.pick(this.d.pings)));
    const before = this.status.length;
    this.status = this.status.filter((s) => s.until > t);
    if (this.status.length !== before) fx.push({ type: 'nv_status_end' });
    if (this.storyMsgs.length) this.storyMsgs = this.storyMsgs.filter((m) => m.until > t);
    if (this.phase === 'work') {
      fx.push(...this.storyTick(t));
      const patrol = this.active('tuantra');
      if (this.phase === 'work' && this.escape) {
        if (patrol && !this.escape.hidden && !this.covered()) {
          if (!this.caught) { this.caught = true; fx.push({ type: 'nv_caught', by: this.status.find((s) => s.kind === 'tuantra')?.by || null }); }
          fx.push(...this.addSus(dt * this.s.patrolSusPerSec));
        }
      } else if (this.phase === 'work' && this.tab === 'secret' && !this.covered() && t >= this.safeUntil) {
        if (patrol && !this.caught) { this.caught = true; fx.push({ type: 'nv_caught', by: this.status.find((s) => s.kind === 'tuantra')?.by || null }); }
        fx.push(...this.addSus(dt * (patrol ? this.s.patrolSusPerSec : this.s.secretSusPerSec)));
      }
      if (this.phase === 'work' && t >= this.endsAt) fx.push(...this.endDay());
    } else if (t >= this.endsAt) {
      if (this.phase === 'brief') fx.push(...this.startWork());
      else if (this.phase === 'dayend') fx.push(...this.nextFromDayEnd());
      else if (this.phase === 'end') fx.push(...this.startCampaign());
    }
    return fx;
  }

  onResume(d) {
    for (const p of this.pings) p.waitUntil += d;
    for (const s of this.status) s.until += d;
    for (const m of this.storyMsgs) m.until += d;
    for (const f of this.feed) f.at += d;
    for (const k of Object.keys(this.coverAt)) this.coverAt[k] += d;
    if (this.safeUntil) this.safeUntil += d;
    if (this.escape) { this.escape.nextMoveAt += d; if (this.escape.camOffUntil) this.escape.camOffUntil += d; }
  }

  // ---------------- trạng thái ----------------
  jobView() {
    const j = this.job;
    if (!j) return null;
    if (j.kind === 'chat') return { kind: j.kind, id: j.id, to: j.to, text: j.text, flag: j.flag, typed: j.typed };
    if (j.kind === 'call') return { kind: j.kind, id: j.id, to: j.to, victim: j.victim, opts: j.opts };
    return { kind: j.kind, id: j.id, nums: j.nums, typed: j.typed };
  }

  secretView() {
    const sp = this.special;
    if (sp?.kind === 'cipher') return { kind: 'cipher', id: sp.id, enc: sp.enc, shift: sp.shift, typed: sp.typed, from: this.person('police') };
    if (sp?.kind === 'relay') return { kind: 'relay', id: sp.id, text: sp.text, typed: sp.typed, from: this.person('friend') };
    const j = this.secret;
    if (!j) return null;
    const base = { kind: j.kind, id: j.id, item: j.item };
    if (j.kind === 'photo') return { ...base, shots: j.shots, need: j.need };
    if (j.kind === 'map') return { ...base, rooms: j.rooms, order: j.order, pos: j.pos };
    return { ...base, text: j.text, typed: j.typed };
  }

  escapeView(t) {
    const e = this.escape;
    if (!e) return null;
    return {
      seg: e.seg, n: e.n, route: e.route, hidden: e.hidden, friend: !!this.flags.friend,
      moveInMs: Math.max(0, e.nextMoveAt - t), distractMs: Math.max(0, e.camOffUntil - t),
      segs: e.segs.map((s, i) => ({ revealed: s.revealed, dir: s.revealed ? s.dir : null, cam: this.camOn(t, i) })),
    };
  }

  top(board, n = 3) { return Object.values(board).sort((a, b) => b.points - a.points).slice(0, n).map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, points: r.points, gifts: r.gifts })); }

  snapshot() {
    const t = this.clock();
    const ch = this.chapter();
    return {
      phase: this.phase,
      paused: !!this.paused,
      campaign: this.campaign,
      code: this.code,
      day: this.day,
      days: this.days,
      chapter: { no: this.day, title: String(ch.title || ''), kind: ch.kind === 'escape' ? 'escape' : 'day', intro: (Array.isArray(ch.intro) ? ch.intro : []).map(String).slice(0, 4) },
      remainingMs: Math.max(0, this.endsAt - t),
      dayMs: (ch.kind === 'escape' ? this.s.nightSeconds : this.s.daySeconds) * 1000,
      kpi: this.kpi,
      kpiTarget: this.kpiTarget,
      suspicion: Math.round(this.suspicion * 10) / 10,
      signal: Math.round(this.signal * 10) / 10,
      items: this.items.map((it, i) => ({ ...it, state: i < this.sent ? 'sent' : i < this.collected ? 'held' : 'todo' })),
      sent: this.sent, held: this.held, saved: this.saved,
      canSend: this.canSend(),
      tab: this.tab,
      job: this.jobView(),
      secret: this.secretView(),
      safeMs: Math.max(0, this.safeUntil - t),
      escape: this.escapeView(t),
      pings: this.pings.map((p) => ({ id: p.id, by: p.by, text: p.text, waiting: p.waiting })),
      status: this.status.map((s) => ({ kind: s.kind, by: s.by, line: s.line, leftMs: Math.max(0, s.until - t), totalMs: s.total })),
      story: this.storyMsgs.map((m) => ({ id: m.id, by: m.by, text: m.text, leftMs: m.until - t })),
      covered: this.phase === 'work' && this.covered(),
      coverWord: this.s.coverWord,
      likesFull: Math.ceil(100 / Math.max(0.01, this.s.signalPerLike)),
      intro: this.d.intro.map((l) => String(l).replace(/\{code\}/g, this.code).replace(/\{place\}/g, this.s.place).replace(/\{n\}/g, this.items.length)),
      cast: Object.fromEntries(Object.entries(this.d.cast).map(([k, c]) => [k, { name: String(c.name), icon: String(c.icon || ''), role: String(c.role || '') }])),
      suspects: this.suspects.map((x, i) => ({ ...x, letter: LETTERS[i], clues: this.clues.filter((c) => c.who === i).map((c) => c.text) })),
      flags: { bribe: this.flags.bribe, friend: this.flags.friend, trust: this.flags.trust },
      vote: this.vote ? { kind: this.vote.kind, q: this.vote.q, options: this.vote.options, counts: this.vote.counts } : null,
      choice: this.choice,
      guess: this.guess,
      dayResult: this.dayResult,
      result: this.result,
      feed: this.feed.map((f) => ({ by: f.by, action: f.action, n: f.n, ageMs: t - f.at })),
      top: { bosses: this.top(this.bosses), helpers: this.top(this.helpers) },
      wins: this.wins,
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), trigger: b.trigger, every: b.every, count: b.every ? Math.min(b.count, b.every) : 0 })),
    };
  }

  serialize() {
    const keys = ['uid', 'campaign', 'wins', 'bosses', 'helpers', 'feed', 'code', 'items', 'sent', 'held', 'saved', 'scams', 'suspicion', 'signal', 'day',
      'phase', 'startedAt', 'endsAt', 'kpi', 'kpiTarget', 'tab', 'job', 'secret', 'special', 'jobNo', 'pings', 'status', 'caught', 'lastTickAt', 'dayResult', 'result',
      'suspects', 'traitor', 'lastSuspects', 'clueBag', 'clues', 'flags', 'guess', 'tags', 'choices', 'choice', 'vote', 'queued', 'storyIdx', 'storyMsgs', 'safeUntil', 'escape'];
    return Object.fromEntries(keys.map((k) => [k, this[k] ?? null]));
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !['brief', 'work', 'dayend', 'end'].includes(s.phase) || !Array.isArray(s.items) || !s.items.length || !Array.isArray(s.pings) || !Array.isArray(s.status) || !Array.isArray(s.suspects) || s.suspects.length < 2) return;
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of Object.keys(this.serialize())) if (k in copy && copy[k] !== undefined) this[k] = copy[k];
    this.bosses ||= {}; this.helpers ||= {}; this.feed = Array.isArray(this.feed) ? this.feed : [];
    this.suspicion = clamp(Number(this.suspicion) || 0, 0, MAX_SUS);
    this.signal = clamp(Number(this.signal) || 0, 0, 100);
    this.sent = clamp(Number(this.sent) || 0, 0, this.items.length);
    this.held = clamp(Number(this.held) || 0, 0, this.items.length - this.sent);
    this.day = clamp(Number(this.day) || 1, 1, this.days);
    this.traitor = clamp(Number(this.traitor) || 0, 0, this.suspects.length - 1);
    this.flags = this.flags && typeof this.flags === 'object' ? this.flags : { bribe: false, friend: null, trust: false };
    for (const k of ['clues', 'tags', 'choices', 'queued', 'storyMsgs', 'lastSuspects']) if (!Array.isArray(this[k])) this[k] = [];
    if (!this.clueBag || typeof this.clueBag !== 'object') this.clueBag = { traitor: [], innocent: [] };
    if (this.escape && (!Array.isArray(this.escape.segs) || !this.escape.segs.length)) this.escape = null;
    if (this.tab !== 'secret') this.tab = 'camp';
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(NamVung);

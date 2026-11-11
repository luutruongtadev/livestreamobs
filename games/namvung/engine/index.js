import { Emitter, makePausable, normalize, canon, digitsOf, triggerText, triggerIcon } from '#sdk';

/**
 * Nằm Vùng: streamer là cảnh sát chìm bị đưa sang trại lừa đảo bên kia biên giới.
 * - Tab 💼 Việc trại: chạy KPI (nhắn tin mồi / gọi theo kịch bản / tính tiền). Thiếu KPI cuối ngày thì nghi ngờ tăng mạnh.
 *   Tin nhắn mồi có nút ⚠️ Cảnh báo ngầm: cứu người đó (không có KPI, nghi ngờ tăng nhẹ).
 * - Tab 🕵️ Bí mật: lén thu thập bằng chứng (chụp tài liệu, chép thông tin, vẽ sơ đồ, ghi toạ độ).
 *   Ngồi ở tab này thì nghi ngờ tăng dần, bảo an đang tuần tra mà thấy thì tăng rất nhanh.
 * - Gửi bằng chứng về công an cần sóng đầy 100%: người xem thả tim để có sóng.
 * - Người xem bình luận từ "che" (cài đặt) để đánh lạc hướng: giảm nghi ngờ, rút ngắn tuần tra.
 * - Quà: bảo an / chủ quản gây khó (tuần tra, nhắn tin, tăng KPI, thu điện thoại, lục soát…) hoặc giúp (làm ngơ, sim lậu, nội gián…).
 * Thắng: gửi đủ bằng chứng → công an ập vào giải cứu. Thua: nghi ngờ 100% (bị lộ) hoặc hết số ngày.
 *
 * Pha: brief (giao việc đầu ngày) → work → dayend → brief… → end (kết thúc chiến dịch) → brief (chiến dịch mới).
 */
export function createGame(ctx) { return new NamVung(ctx); }

export const HARM = ['tuantra', 'chuquan', 'tangkpi', 'thudt', 'chidiem', 'lucsoat', 'nhot', 'chuyentrai'];
export const HELP = ['lamngo', 'migoi', 'sim', 'noigian', 'lamho', 'giaicuu'];
export const CAMP_JOBS = ['chat', 'call', 'money'];
const STATUS_MS = { tuantra: 15000, thudt: 20000, nhot: 20000 };
const MAX_SUS = 100;
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
    this.d = Object.fromEntries(Object.entries(FALLBACK).map(([k, v]) => [k, Array.isArray(d[k]) && d[k].length ? d[k] : v]));
    this.banned = bannedRegexes(this.s.bannedWords);
    this.coverWord = normalize(this.s.coverWord || '');
    this.uid = 0;
    this.campaign = 0;
    this.wins = 0;
    this.bosses = {}; // bảo an gắt nhất
    this.helpers = {}; // đồng đội thầm lặng
    this.feed = [];
    this.coverAt = {}; // id → lần che gần nhất
    this.startCampaign();
  }

  pick(list) { return list[Math.floor(this.ctx.random() * list.length)]; }
  shuffle(list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.ctx.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  get collected() { return this.sent + this.held; }

  // ---------------- vòng đời ----------------
  startCampaign() {
    this.campaign++;
    this.code = this.pick(this.d.codes);
    const ev = this.d.evidence;
    const gps = ev.filter((e) => e.kind === 'gps');
    const rest = this.shuffle(ev.filter((e) => e.kind !== 'gps'));
    const n = clamp(this.s.evidence, 1, ev.length);
    // toạ độ luôn là bằng chứng cuối cùng (nếu có)
    this.items = (gps.length ? [...rest.slice(0, n - 1), gps[0]] : rest.slice(0, n)).map((e) => ({ name: String(e.name), icon: String(e.icon || '📁'), kind: ['photo', 'copy', 'gps', 'map'].includes(e.kind) ? e.kind : 'photo' }));
    this.sent = 0; this.held = 0; this.saved = 0; this.scams = 0;
    this.suspicion = 0;
    this.signal = 0;
    this.day = 0;
    this.result = null;
    return this.startDay();
  }

  startDay() {
    this.day++;
    this.phase = 'brief';
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.s.briefSeconds * 1000;
    this.kpi = 0;
    this.kpiTarget = this.s.kpi + Math.min(4, this.day - 1);
    this.tab = 'camp';
    this.job = null; this.secret = null;
    this.jobNo = 0;
    this.pings = []; this.status = [];
    this.caught = false;
    this.lastTickAt = this.startedAt;
    this.dayResult = null;
    return [{ type: 'nv_brief', day: this.day, days: this.s.days, campaign: this.campaign, first: this.day === 1, kpi: this.kpiTarget }];
  }

  startWork() {
    this.phase = 'work';
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.s.daySeconds * 1000;
    this.lastTickAt = this.startedAt;
    this.newJob();
    this.newSecret();
    return [{ type: 'nv_start', day: this.day }];
  }

  endDay() {
    const ok = this.kpi >= this.kpiTarget;
    const before = this.suspicion;
    this.suspicion = clamp(this.suspicion + (ok ? -this.s.kpiBonus : this.s.missKpi), 0, MAX_SUS);
    this.dayResult = { ok, kpi: this.kpi, target: this.kpiTarget, day: this.day, sus: Math.round(this.suspicion), delta: Math.round(this.suspicion - before), punishment: !ok ? this.pick(this.d.punishments) : null };
    this.clearWork();
    if (this.suspicion >= MAX_SUS) return this.finish(false, 'lo');
    if (this.day >= this.s.days) return this.finish(false, 'hetngay');
    this.phase = 'dayend';
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.s.resultSeconds * 1000;
    return [{ type: 'nv_dayend', ...this.dayResult }];
  }

  clearWork() { this.pings = []; this.status = []; this.job = null; this.secret = null; this.tab = 'camp'; }

  finish(win, how) {
    if (win) this.wins++;
    this.clearWork();
    const t = this.clock();
    this.result = {
      win, how, campaign: this.campaign, code: this.code, day: this.day, days: this.s.days,
      sent: this.sent, total: this.items.length, saved: this.saved, scams: this.scams, sus: Math.round(this.suspicion),
      items: this.items.map((it, i) => ({ ...it, sent: i < this.sent })), day0: this.dayResult,
      tip: this.pick(this.d.tips),
    };
    this.phase = 'end';
    this.startedAt = t;
    this.endsAt = t + this.s.endSeconds * 1000;
    this.ctx.report?.round?.({ win, campaign: this.campaign, day: this.day, sent: this.sent, total: this.items.length, saved: this.saved });
    return [{ type: win ? 'nv_win' : 'nv_lose', ...this.result }];
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
    if (this.phase !== 'work') return [];
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

  // ---------------- việc bí mật (bằng chứng) ----------------
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
    if (this.phase !== 'work' || this.collected >= this.items.length) return [];
    const item = this.items[this.collected];
    this.held++;
    this.newSecret();
    return [{ type: 'nv_evidence', item, held: this.held, sent: this.sent, total: this.items.length, by }];
  }

  canSend() { return this.phase === 'work' && this.held > 0 && this.signal >= 100 && !this.active('thudt') && !this.active('nhot'); }

  sendEvidence() {
    if (!this.canSend()) return [{ type: 'nv_wrong', kind: 'send' }];
    const n = this.held;
    this.sent += n; this.held = 0; this.signal = 0;
    const fx = [{ type: 'nv_sent', n, sent: this.sent, total: this.items.length }];
    if (this.sent >= this.items.length) fx.push(...this.finish(true, 'baocao'));
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
    const ms = STATUS_MS[kind] || 15000;
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

  addPing(by) {
    const t = this.clock();
    const p = { id: ++this.uid, by, text: null, waiting: true, waitUntil: t + this.s.pingWaitSeconds * 1000 };
    this.pings.push(p);
    while (this.pings.length > this.s.maxPings) this.pings.shift();
    return [{ type: 'nv_ping', id: p.id, by }];
  }

  setText(p, text) { p.text = text; p.waiting = false; return { type: 'nv_ping_text', id: p.id, by: p.by, text }; }

  same(a, b) {
    if (this.s.strictAccents) { const k = (x) => canon(x).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim(); return k(a) === k(b); }
    return normalize(a) === normalize(b);
  }

  // ---------------- người xem ----------------
  handle(ev) {
    if (this.paused || !ev?.type) return [];
    if (ev.type === 'like') {
      if (this.phase !== 'work' || this.active('thudt')) return [];
      const n = clamp(Number(ev.count) || 1, 1, 100000);
      const before = this.signal;
      this.signal = clamp(this.signal + n * this.s.signalPerLike, 0, 100);
      return before < 100 && this.signal >= 100 ? [{ type: 'nv_signal_full' }] : [];
    }
    if (ev.type !== 'comment' || !ev.user) return [];
    const by = pub(ev.user);
    const p = this.pings.find((x) => x.waiting && x.by.id === by.id);
    if (p) { const text = this.clean(ev.text); return text ? [this.setText(p, text)] : []; }
    // từ "che": đánh lạc hướng bảo an
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
    if (this.phase === 'brief') fx.push(...this.startWork()); // quà tới lúc giao việc → vào ngày luôn
    const t = this.clock();
    const work = this.phase === 'work';
    let sub = '';
    if (work) {
      switch (id) {
        case 'tuantra': this.addStatus('tuantra', by); sub = this.tab === 'secret' ? 'mau chuyển tab!' : 'đi ngang phòng máy'; break;
        case 'chuquan': fx.push(...this.addPing(by)); if (this.tab === 'secret') { this.tab = 'camp'; sub = 'bị gọi giật, quay về việc trại'; } break;
        case 'tangkpi': this.kpiTarget += 2; sub = `KPI hôm nay: ${this.kpiTarget}`; break;
        case 'thudt': this.signal = 0; this.addStatus('thudt', by); if (this.tab === 'secret') this.tab = 'camp'; sub = 'mất sóng, khoá tab bí mật'; break;
        case 'chidiem': fx.push(...this.addSus(15)); sub = '+15% nghi ngờ'; break;
        case 'lucsoat':
          if (this.held > 0) { sub = `mất ${this.held} bằng chứng chưa gửi`; this.held = 0; this.newSecret(); }
          else { fx.push(...this.addSus(10)); sub = 'không thấy gì… +10% nghi ngờ'; }
          break;
        case 'nhot': this.addStatus('nhot', by); sub = 'khoá màn hình 20 giây'; break;
        case 'chuyentrai': this.kpi = 0; this.endsAt = Math.max(t + 10_000, this.endsAt - 30_000); sub = 'KPI về 0, −30 giây'; break;
        case 'lamngo':
          this.suspicion = clamp(this.suspicion - 10, 0, MAX_SUS);
          this.status = this.status.filter((s) => s.kind !== 'tuantra');
          sub = '−10% nghi ngờ';
          break;
        case 'migoi': this.endsAt += 30_000; sub = '+30 giây'; break;
        case 'sim': if (!this.active('thudt')) { this.signal = 100; sub = 'sóng đầy 100%'; } else sub = 'điện thoại đang bị thu…'; break;
        case 'noigian': fx.push(...this.completeSecret(by)); sub = '+1 bằng chứng'; break;
        case 'lamho': fx.push(...this.completeJob(by)); sub = '+1 KPI'; break;
        case 'giaicuu': this.sent = this.items.length; this.held = 0; fx.push(...this.finish(true, 'giaicuu')); sub = 'công an ập vào!'; break;
        default:
      }
    }
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

  // ---------------- đầu vào của streamer ----------------
  input(ev = {}) {
    if (this.paused || this.phase !== 'work' || !ev || typeof ev !== 'object') return [];
    switch (ev.type) {
      case 'text': {
        if (this.covered()) return [];
        const v = String(ev.value ?? '').slice(0, 200);
        const j = this.tab === 'secret' ? this.secret : this.job;
        if (j && 'typed' in j) j.typed = j.kind === 'money' ? v.replace(/[^\d]/g, '').slice(0, 7) : v;
        return [];
      }
      case 'enter': return this.submit();
      case 'click': return this.click(ev);
      case 'tab': return this.switchTab(ev.id);
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
    if (target === 'tab') return this.switchTab(ev.id);
    if (this.covered()) return [];
    if (target === 'send') return this.submit();
    if (this.tab === 'secret') {
      const j = this.secret;
      if (target === 'radio') return this.sendEvidence();
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
    if (id === 'next-day') return this.phase === 'work' ? this.endDay() : this.phase === 'end' ? this.startCampaign() : this.startDay();
    if (id === 'new-campaign') return this.startCampaign();
    if (id === 'clear-board') { this.bosses = {}; this.helpers = {}; this.feed = []; return [{ type: 'nv_board_cleared' }]; }
    return [];
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
    if (this.phase === 'work') {
      if (this.tab === 'secret' && !this.covered()) {
        const patrol = this.active('tuantra');
        if (patrol && !this.caught) { this.caught = true; fx.push({ type: 'nv_caught', by: this.status.find((s) => s.kind === 'tuantra')?.by || null }); }
        fx.push(...this.addSus(dt * (patrol ? this.s.patrolSusPerSec : this.s.secretSusPerSec)));
      }
      if (this.phase === 'work' && t >= this.endsAt) fx.push(...this.endDay());
    } else if (t >= this.endsAt) {
      if (this.phase === 'brief') fx.push(...this.startWork());
      else if (this.phase === 'dayend') fx.push(...this.startDay());
      else if (this.phase === 'end') fx.push(...this.startCampaign());
    }
    return fx;
  }

  onResume(d) {
    for (const p of this.pings) p.waitUntil += d;
    for (const s of this.status) s.until += d;
    for (const f of this.feed) f.at += d;
    for (const k of Object.keys(this.coverAt)) this.coverAt[k] += d;
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
    const j = this.secret;
    if (!j) return null;
    const base = { kind: j.kind, id: j.id, item: j.item };
    if (j.kind === 'photo') return { ...base, shots: j.shots, need: j.need };
    if (j.kind === 'map') return { ...base, rooms: j.rooms, order: j.order, pos: j.pos };
    return { ...base, text: j.text, typed: j.typed };
  }

  top(board, n = 3) { return Object.values(board).sort((a, b) => b.points - a.points).slice(0, n).map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, points: r.points, gifts: r.gifts })); }

  snapshot() {
    const t = this.clock();
    return {
      phase: this.phase,
      paused: !!this.paused,
      campaign: this.campaign,
      code: this.code,
      day: this.day,
      days: this.s.days,
      remainingMs: Math.max(0, this.endsAt - t),
      dayMs: this.s.daySeconds * 1000,
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
      pings: this.pings.map((p) => ({ id: p.id, by: p.by, text: p.text, waiting: p.waiting })),
      status: this.status.map((s) => ({ kind: s.kind, by: s.by, line: s.line, leftMs: Math.max(0, s.until - t), totalMs: s.total })),
      covered: this.phase === 'work' && this.covered(),
      coverWord: this.s.coverWord,
      likesFull: Math.ceil(100 / Math.max(0.01, this.s.signalPerLike)),
      intro: this.d.intro.map((l) => String(l).replace(/\{code\}/g, this.code).replace(/\{place\}/g, this.s.place).replace(/\{n\}/g, this.items.length)),
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
      'phase', 'startedAt', 'endsAt', 'kpi', 'kpiTarget', 'tab', 'job', 'secret', 'jobNo', 'pings', 'status', 'caught', 'lastTickAt', 'dayResult', 'result'];
    return Object.fromEntries(keys.map((k) => [k, this[k] ?? null]));
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !['brief', 'work', 'dayend', 'end'].includes(s.phase) || !Array.isArray(s.items) || !s.items.length || !Array.isArray(s.pings) || !Array.isArray(s.status)) return;
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of Object.keys(this.serialize())) if (k in copy && copy[k] !== undefined) this[k] = copy[k];
    this.bosses ||= {}; this.helpers ||= {}; this.feed = Array.isArray(this.feed) ? this.feed : [];
    this.suspicion = clamp(Number(this.suspicion) || 0, 0, MAX_SUS);
    this.signal = clamp(Number(this.signal) || 0, 0, 100);
    this.sent = clamp(Number(this.sent) || 0, 0, this.items.length);
    this.held = clamp(Number(this.held) || 0, 0, this.items.length - this.sent);
    if (this.tab !== 'secret') this.tab = 'camp';
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(NamVung);

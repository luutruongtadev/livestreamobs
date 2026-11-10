import { Emitter, makePausable, normalize, canon, triggerText, triggerIcon } from '#sdk';

/**
 * Deadline Dí: streamer chạy deadline, quà của người xem là những ông sếp soi việc (hoặc đồng nghiệp cứu).
 * Mỗi ca: một nhiệm vụ N bước + deadline. Đủ bước trước hạn → lên chức; trễ → tăng ca (+ xuống chức nếu bật).
 *
 * Hai chế độ (cài đặt mode):
 *  - desktop: máy tính giả lập — streamer tự gõ phím / bấm chuột trong cửa sổ chơi (game.input):
 *    mini-việc Mail (gõ lại câu), Hộp thư (Lưu / Spam), Bảng tính (gõ tổng), File (bỏ đúng thư mục). Mỗi việc xong = +1 bước.
 *    Quà phá: popup sếp ping che màn hình (bấm × mới đóng), virus (xoá từng mối), kẹt máy in (bấm gỡ kẹt), sếp nói trend
 *    (gõ đúng nguyên văn), họp đột xuất (khoá màn hình), ném bút (mất mấy chữ đang gõ)…
 *  - camera: streamer làm việc thật trước camera, bấm +1 bước (dashboard / phím Space trong cửa sổ chơi);
 *    quà hiện thông báo, chữ lớn, chip trạng thái để streamer diễn theo.
 * Câu sếp ping = bình luận đầu tiên của chính người tặng quà gõ sau khi tặng (không gõ thì dùng câu có sẵn).
 * Quà từ memeMinCoins xu trở lên kèm meme (hiệu ứng có sẵn hoặc link video streamer dán trong cài đặt).
 *
 * Pha: brief (giao việc) → work → result → brief…
 */
export function createGame(ctx) { return new Deadline(ctx); }

export const HARM = ['ping', 'soi', 'ban', 'mayin', 'buzz', 'hop', 'cattg', 'virus', 'lamlai'];
export const HELP = ['cafe', 'giahan', 'intern', 'thangchuc'];
export const JOBS = ['mail', 'inbox', 'sheet', 'files'];
export const FOLDERS = ['anh', 'tailieu', 'rac'];
const STATUS_MS = { soi: 15000, mayin: 12000, hop: 20000, buzz: 15000, virus: 10000 };
const SOI_PING_MS = 4500;
const MAX_BLOCKERS = 4;
const pub = (u) => ({ id: String(u?.id ?? '?'), name: String(u?.name || 'Ẩn danh').slice(0, 40), avatar: u?.avatar || null });

const FALLBACK = {
  ranks: ['Thực tập sinh', 'Nhân viên', 'Chuyên viên', 'Trưởng nhóm', 'Trưởng phòng', 'Giám đốc', 'Chủ tịch'],
  desktopTasks: [{ name: 'Dọn bàn làm việc: mail, hộp thư, bảng tính, file', file: 'DonViec_final.docx' }],
  cameraTasks: [{ name: 'Gấp 10 chiếc máy bay giấy', file: 'MayBayGiay_x10' }],
  pings: ['Xong chưa em?'], soiLines: ['Đang làm gì đấy em?'], mail: ['Em gửi anh bản báo cáo final ạ'],
  buzz: ['Em sync lại với team rồi push gấp giúp anh nhé'],
  inbox: { keep: [['Sếp', 'Họp giao ban 9 giờ'], ['Kế toán', 'Bảng lương']], spam: [['Quà Tặng', 'Bạn trúng iPhone!!!'], ['Vay Nhanh', 'Vay 50 triệu 5 phút']] },
  files: [['anh.jpg', 'anh'], ['bao_cao.xlsx', 'tailieu'], ['crack.exe', 'rac'], ['logo.png', 'anh']],
  viruses: ['trojan.exe', 'spam_bot.exe', 'keylogger.exe', 'adware.exe', 'worm.exe'],
  punishments: ['Chống đẩy 10 cái'], memes: {},
};

/** Từ cấm → các regex thay bằng *** (nguyên từ, không phân biệt hoa thường, giữ dấu). */
function bannedRegexes(list) {
  return String(list || '').split(',').map((w) => canon(w)).filter(Boolean).slice(0, 100)
    .map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'giu'));
}

export class Deadline extends Emitter {
  constructor(ctx) {
    super();
    this.ctx = ctx;
    this.s = ctx.settings;
    this.now = ctx.now;
    const d = ctx.data?.office || {};
    this.d = Object.fromEntries(Object.entries(FALLBACK).map(([k, v]) => [k, (Array.isArray(v) ? d[k]?.length : d[k] && typeof d[k] === 'object') ? d[k] : v]));
    this.banned = bannedRegexes(this.s.bannedWords);
    this.rank = Math.min(this.s.startRank, this.d.ranks.length - 1);
    this.bestRank = this.rank;
    this.streak = 0;
    this.shiftNo = 0;
    this.uid = 0;
    this.bosses = {}; // id → { id, name, avatar, points, gifts }
    this.helpers = {};
    this.feed = [];
    this.lastMail = -1;
    this.startShift();
  }

  get desktop() { return this.s.mode !== 'camera'; }
  pick(list) { return list[Math.floor(this.ctx.random() * list.length)]; }
  shuffle(list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.ctx.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  shiftMs() { return Math.round((this.s.shiftSeconds * Math.max(0.6, 1 - 0.08 * this.rank))) * 1000; }

  // ---------------- vòng đời ca làm ----------------
  startShift() {
    this.shiftNo++;
    this.phase = 'brief';
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.s.briefSeconds * 1000;
    this.deadlineMs = this.shiftMs();
    const custom = !this.desktop && String(this.s.cameraTask || '').trim();
    const t = custom ? { name: custom.slice(0, 80), file: 'ViecCuaToi_final.docx' } : this.pick(this.desktop ? this.d.desktopTasks : this.d.cameraTasks);
    this.task = { name: String(t.name).replace(/\{n\}/g, this.s.steps), file: String(t.file || 'BaoCao_final.docx') };
    this.step = 0;
    this.pings = [];
    this.status = [];
    this.blockers = [];
    this.job = null;
    this.jobNo = 0;
    this.nextSoiAt = null;
    this.result = null;
    return [{ type: 'dd_brief', shift: this.shiftNo, task: this.task, rank: this.d.ranks[this.rank] }];
  }

  startWork() {
    this.phase = 'work';
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.deadlineMs;
    if (this.desktop) this.newJob();
    return [{ type: 'dd_start', shift: this.shiftNo }];
  }

  finish(win, how = '') {
    const from = this.rank;
    if (win) { this.rank = Math.min(this.d.ranks.length - 1, this.rank + 1); this.streak++; }
    else { if (this.s.demoteOnFail) this.rank = Math.max(0, this.rank - 1); this.streak = 0; }
    this.bestRank = Math.max(this.bestRank, this.rank);
    const t = this.clock();
    this.result = {
      win, how, shift: this.shiftNo, task: this.task.name, step: this.step, steps: this.s.steps,
      leftMs: win ? Math.max(0, this.endsAt - t) : 0,
      rankFrom: this.d.ranks[from], rankTo: this.d.ranks[this.rank], rankChange: Math.sign(this.rank - from),
      punishment: !win && this.s.punishments ? this.pick(this.d.punishments) : null,
      streak: this.streak,
    };
    this.phase = 'result';
    this.startedAt = t;
    this.endsAt = t + this.s.resultSeconds * 1000;
    this.pings = []; this.status = []; this.blockers = []; this.job = null; this.nextSoiAt = null;
    this.ctx.report?.round?.({ win, shift: this.shiftNo, step: this.result.step, steps: this.result.steps, rank: this.result.rankTo });
    return [{ type: win ? 'dd_win' : 'dd_fail', ...this.result }];
  }

  // ---------------- mini-việc (chế độ máy tính) ----------------
  newJob() {
    const kind = JOBS[this.jobNo % JOBS.length];
    this.jobNo++;
    const id = ++this.uid;
    if (kind === 'mail') {
      let i = Math.floor(this.ctx.random() * this.d.mail.length);
      if (i === this.lastMail && this.d.mail.length > 1) i = (i + 1) % this.d.mail.length;
      this.lastMail = i;
      this.job = { kind, id, text: this.d.mail[i], typed: '' };
    } else if (kind === 'inbox') {
      const keep = this.shuffle(this.d.inbox.keep).slice(0, 2).map(([from, subject]) => ({ from, subject, spam: false, done: false }));
      const spam = this.shuffle(this.d.inbox.spam).slice(0, 2).map(([from, subject]) => ({ from, subject, spam: true, done: false }));
      this.job = { kind, id, mails: this.shuffle([...keep, ...spam]) };
    } else if (kind === 'sheet') {
      const n = this.rank >= 3 ? 4 : 3;
      this.job = { kind, id, nums: Array.from({ length: n }, () => 10 + Math.floor(this.ctx.random() * 90)), typed: '' };
    } else {
      let files;
      do { files = this.shuffle(this.d.files).slice(0, 4); } while (new Set(files.map((f) => f[1])).size < 2 && this.d.files.length > 4);
      this.job = { kind, id, files: files.map(([name, folder]) => ({ name, folder, done: false })), sel: null };
    }
  }

  resetJob() {
    const j = this.job;
    if (!j) return;
    if ('typed' in j) j.typed = '';
    if (j.mails) for (const m of j.mails) m.done = false;
    if (j.files) { for (const f of j.files) f.done = false; j.sel = null; }
  }

  completeJob(by = null) {
    this.job = null;
    const fx = this.addStep(1, by);
    if (this.phase === 'work' && this.desktop) this.newJob();
    return fx;
  }

  addStep(n, by = null) {
    if (this.phase !== 'work') return [];
    const before = this.step;
    this.step = Math.max(0, Math.min(this.s.steps, this.step + n));
    if (this.step === before) return [];
    const fx = [{ type: 'dd_step', step: this.step, steps: this.s.steps, n: this.step - before, by }];
    if (this.step >= this.s.steps) fx.push(...this.finish(true));
    return fx;
  }

  same(a, b) {
    if (this.s.strictAccents) { const k = (x) => canon(x).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim(); return k(a) === k(b); }
    return normalize(a) === normalize(b);
  }

  // ---------------- ping / trạng thái ----------------
  clean(text) {
    let t = String(text ?? '').replace(/\s+/g, ' ').trim();
    const cps = [...t];
    if (cps.length > 80) t = cps.slice(0, 79).join('') + '…';
    for (const re of this.banned) t = t.replace(re, (m, pre) => `${pre}***`);
    return t;
  }

  addPing(by, { text = null, soi = false } = {}) {
    const t = this.clock();
    const p = { id: ++this.uid, by, text, waiting: text == null, soi, at: t, waitUntil: t + this.s.pingWaitSeconds * 1000, until: null };
    if (!this.desktop && text != null) p.until = t + this.s.pingSeconds * 1000;
    this.pings.push(p);
    while (this.pings.length > this.s.maxPings) this.pings.shift();
    return [{ type: 'dd_ping', id: p.id, by, text, soi }];
  }

  setText(p, text) {
    p.text = text;
    p.waiting = false;
    if (!this.desktop) p.until = this.clock() + this.s.pingSeconds * 1000;
    return { type: 'dd_ping_text', id: p.id, by: p.by, text };
  }

  addStatus(kind, by, text = null) {
    const t = this.clock();
    const ms = STATUS_MS[kind] || 10000;
    const cur = this.status.find((s) => s.kind === kind);
    if (cur) { cur.until = Math.max(cur.until, t) + Math.round(ms / 2); cur.total = cur.until - t; cur.by = by; if (text) cur.text = text; }
    else this.status.push({ kind, by, text, until: t + ms, total: ms });
    if (kind === 'soi' && this.nextSoiAt == null) this.nextSoiAt = t + 2000;
  }

  active(kind) { const t = this.clock(); return this.status.some((s) => s.kind === kind && s.until > t); }
  covered() { return this.active('hop') || (this.desktop && this.pings.length > 0); }

  addBlocker(b) {
    const same = this.blockers.find((x) => x.kind === b.kind);
    if (same && b.kind === 'jam') { same.left += 4; same.total += 4; return true; }
    if (this.blockers.length >= MAX_BLOCKERS) return false;
    this.blockers.push({ id: ++this.uid, ...b });
    return true;
  }

  // ---------------- đầu vào ----------------
  handle(ev) {
    if (this.paused || ev?.type !== 'comment' || !ev.user) return [];
    const id = String(ev.user.id);
    const p = this.pings.find((x) => x.waiting && x.by.id === id);
    if (!p) return [];
    const text = this.clean(ev.text);
    if (!text) return [];
    return [this.setText(p, text)];
  }

  action(id, ev = {}, binding = null) {
    void binding;
    if (this.paused) return false;
    if (!HARM.includes(id) && !HELP.includes(id)) return [];
    const by = pub(ev.user);
    const coins = ev.type === 'gift' ? Math.max(0, Number(ev.diamonds) || 0) : 0;
    const fx = [];
    // quà đã có link video meme riêng → luôn phát; meme hoạt hình có sẵn chỉ cho quà từ memeMinCoins xu
    const hasClip = /^https?:\/\/\S+$/i.test(String(this.s[`memeClip_${id}`] || '').trim());
    const memeOk = this.s.memes && ev.type === 'gift' && (hasClip || coins >= this.s.memeMinCoins) && this.phase !== 'result';
    if (this.phase === 'brief') fx.push(...this.startWork()); // quà tới lúc đang giao việc → vào ca luôn, không phí quà
    const t = this.clock();
    const work = this.phase === 'work';
    let sub = '';
    if (work) {
      switch (id) {
        case 'ping': fx.push(...this.addPing(by)); break;
        case 'soi': this.addStatus('soi', by); sub = 'đứng sau lưng'; break;
        case 'ban':
          if (this.desktop) {
            const b = this.blockers[0];
            if (b?.kind === 'buzz') b.typed = b.typed.slice(0, -3);
            else if (this.job && 'typed' in this.job) this.job.typed = this.job.typed.slice(0, -3);
          }
          fx.push({ type: 'dd_shake', by });
          break;
        case 'mayin':
          if (this.desktop) this.addBlocker({ kind: 'jam', left: 8, total: 8, by });
          this.addStatus('mayin', by);
          break;
        case 'buzz': {
          const phrase = this.pick(this.d.buzz);
          if (this.desktop) { if (!this.addBlocker({ kind: 'buzz', phrase, typed: '', by })) break; }
          else this.addStatus('buzz', by, phrase);
          sub = `“${phrase}”`;
          break;
        }
        case 'hop': this.addStatus('hop', by); break;
        case 'cattg': fx.push(...this.addStep(-3, by)); sub = '−3 bước'; break;
        case 'virus':
          if (this.desktop) this.addBlocker({ kind: 'virus', threats: this.shuffle(this.d.viruses).slice(0, 5).map((name) => ({ name, removed: false })), by });
          else this.addStatus('virus', by);
          break;
        case 'lamlai':
          if (this.desktop) { this.resetJob(); sub = 'xoá sạch việc đang làm'; } else { fx.push(...this.addStep(-1, by)); sub = '−1 bước'; }
          break;
        case 'cafe': this.endsAt += 20_000; sub = '+20 giây'; break;
        case 'giahan': this.endsAt += 60_000; sub = '+60 giây'; break;
        case 'intern': fx.push(...(this.desktop && this.job ? this.completeJob(by) : this.addStep(1, by))); sub = '+1 bước'; break;
        case 'thangchuc': fx.push(...this.finish(true, 'thangchuc')); sub = 'xong ca ngay!'; break;
        default:
      }
    }
    // bảng sếp soi nhất / đồng nghiệp tận tâm + dòng hoạt động
    const board = HARM.includes(id) ? this.bosses : this.helpers;
    const row = (board[by.id] ||= { ...by, points: 0, gifts: 0 });
    Object.assign(row, { name: by.name, avatar: by.avatar });
    row.points += Math.max(1, coins); row.gifts++;
    const last = this.feed[this.feed.length - 1];
    if (last && last.by.id === by.id && last.action === id && t - last.at < 8000) { last.n++; last.at = t; }
    else { this.feed.push({ by, action: id, n: 1, at: t }); if (this.feed.length > 6) this.feed.shift(); }
    if (ev.type === 'gift') this.ctx.report?.points?.(by, Math.max(1, coins), false);
    const meme = memeOk ? this.memeFor(id) : null;
    return [{ type: 'dd_gift', action: id, by, sub, meme, harm: HARM.includes(id), applied: work }, ...fx];
  }

  memeFor(id) {
    const m = this.d.memes?.[id] || {};
    const lines = Array.isArray(m.lines) && m.lines.length ? m.lines : ['Ối dồi ôi!'];
    const clip = String(this.s[`memeClip_${id}`] || '').trim();
    return { line: this.pick(lines), mood: m.mood || 'shock', clip: /^https?:\/\/\S+$/i.test(clip) ? clip : null };
  }

  /** Đầu vào tại chỗ của streamer (bàn phím / chuột trong cửa sổ chơi). */
  input(ev = {}) {
    if (this.paused || this.phase !== 'work' || !ev || typeof ev !== 'object') return [];
    switch (ev.type) {
      case 'step': return this.desktop ? [] : this.addStep(Number(ev.n) < 0 ? -1 : 1, null);
      case 'text': {
        const v = String(ev.value ?? '').slice(0, 200);
        if (!this.desktop || this.covered()) return [];
        const b = this.blockers[0];
        if (b) { if (b.kind === 'buzz') b.typed = v; return []; }
        if (this.job && 'typed' in this.job) this.job.typed = this.job.kind === 'sheet' ? v.replace(/[^\d]/g, '').slice(0, 6) : v;
        return [];
      }
      case 'enter': return this.desktop ? this.submit() : [];
      case 'click': return this.desktop ? this.click(ev) : [];
      default: return [];
    }
  }

  submit() {
    if (this.covered()) return [];
    const b = this.blockers[0];
    if (b) {
      if (b.kind !== 'buzz') return [];
      if (this.same(b.typed, b.phrase)) { this.blockers.shift(); return [{ type: 'dd_cleared', kind: 'buzz' }]; }
      return [{ type: 'dd_wrong', kind: 'buzz' }];
    }
    const j = this.job;
    if (j?.kind === 'mail') return this.same(j.typed, j.text) ? this.completeJob() : [{ type: 'dd_wrong', kind: 'mail' }];
    if (j?.kind === 'sheet') return Number(j.typed) === j.nums.reduce((a, x) => a + x, 0) && j.typed !== '' ? this.completeJob() : [{ type: 'dd_wrong', kind: 'sheet' }];
    return [];
  }

  click(ev) {
    const target = String(ev.target || '');
    if (target === 'ping') {
      const i = this.pings.findIndex((p) => p.id === Number(ev.id));
      if (i < 0) return [];
      this.pings.splice(i, 1);
      return [{ type: 'dd_ping_close' }];
    }
    if (this.covered()) return [];
    const b = this.blockers[0];
    if (b) {
      if (b.kind === 'virus' && target === 'virus') {
        const th = b.threats[Number(ev.id)];
        if (!th || th.removed) return [];
        th.removed = true;
        if (b.threats.every((x) => x.removed)) { this.blockers.shift(); return [{ type: 'dd_cleared', kind: 'virus' }]; }
        return [{ type: 'dd_zap' }];
      }
      if (b.kind === 'jam' && target === 'jam') {
        b.left--;
        if (b.left <= 0) { this.blockers.shift(); return [{ type: 'dd_cleared', kind: 'jam' }]; }
        return [{ type: 'dd_zap' }];
      }
      if (b.kind === 'buzz' && target === 'send') return this.submit();
      return [];
    }
    const j = this.job;
    if (!j) return [];
    if (target === 'send') return this.submit();
    if (j.kind === 'inbox' && target === 'inbox') {
      const m = j.mails[Number(ev.id)];
      if (!m || m.done) return [];
      if ((ev.value === 'spam') !== m.spam) return [{ type: 'dd_wrong', kind: 'inbox' }];
      m.done = true;
      return j.mails.every((x) => x.done) ? this.completeJob() : [{ type: 'dd_zap' }];
    }
    if (j.kind === 'files') {
      if (target === 'file') { const f = j.files[Number(ev.id)]; if (f && !f.done) j.sel = Number(ev.id); return []; }
      if (target === 'folder' && j.sel != null && FOLDERS.includes(ev.id)) {
        const f = j.files[j.sel];
        j.sel = null;
        if (!f || f.done) return [];
        if (f.folder !== ev.id) return [{ type: 'dd_wrong', kind: 'files' }];
        f.done = true;
        return j.files.every((x) => x.done) ? this.completeJob() : [{ type: 'dd_zap' }];
      }
    }
    return [];
  }

  command(id) {
    if (id === 'step') return this.addStep(1);
    if (id === 'undo-step') return this.addStep(-1);
    if (id === 'next') return this.startShift();
    if (id === 'clear-board') { this.bosses = {}; this.helpers = {}; this.feed = []; return [{ type: 'dd_board_cleared' }]; }
    return [];
  }

  tick() {
    if (this.paused) return [];
    const t = this.clock();
    const fx = [];
    for (const p of this.pings) if (p.waiting && t >= p.waitUntil) fx.push(this.setText(p, this.pick(this.d.pings)));
    if (!this.desktop) this.pings = this.pings.filter((p) => p.until == null || p.until > t);
    const before = this.status.length;
    this.status = this.status.filter((s) => s.until > t);
    if (this.status.length !== before) fx.push({ type: 'dd_status_end' });
    if (this.phase === 'work' && this.nextSoiAt != null) {
      const soi = this.status.find((s) => s.kind === 'soi');
      if (!soi) this.nextSoiAt = null;
      else if (t >= this.nextSoiAt) { fx.push(...this.addPing(soi.by, { text: this.pick(this.d.soiLines), soi: true })); this.nextSoiAt = t + SOI_PING_MS; }
    }
    if (t >= this.endsAt) {
      if (this.phase === 'brief') fx.push(...this.startWork());
      else if (this.phase === 'work') fx.push(...this.finish(false));
      else if (this.phase === 'result') fx.push(...this.startShift());
    }
    return fx;
  }

  onResume(d) {
    for (const p of this.pings) { p.at += d; p.waitUntil += d; if (p.until != null) p.until += d; }
    for (const s of this.status) s.until += d;
    if (this.nextSoiAt != null) this.nextSoiAt += d;
    for (const f of this.feed) f.at += d;
  }

  // ---------------- trạng thái ----------------
  jobView() {
    const j = this.job;
    if (!j) return null;
    if (j.kind === 'mail') return { kind: j.kind, id: j.id, text: j.text, typed: j.typed };
    if (j.kind === 'sheet') return { kind: j.kind, id: j.id, nums: j.nums, typed: j.typed };
    if (j.kind === 'inbox') return { kind: j.kind, id: j.id, mails: j.mails.map((m) => ({ from: m.from, subject: m.subject, done: m.done })) };
    return { kind: j.kind, id: j.id, files: j.files.map((f) => ({ name: f.name, done: f.done })), sel: j.sel };
  }

  blockerView() {
    const b = this.blockers[0];
    if (!b) return null;
    if (b.kind === 'virus') return { kind: b.kind, id: b.id, by: b.by, threats: b.threats.map((x) => ({ name: x.name, removed: x.removed })) };
    if (b.kind === 'jam') return { kind: b.kind, id: b.id, by: b.by, left: b.left, total: b.total };
    return { kind: b.kind, id: b.id, by: b.by, phrase: b.phrase, typed: b.typed };
  }

  top(board, n = 3) { return Object.values(board).sort((a, b) => b.points - a.points).slice(0, n).map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, points: r.points, gifts: r.gifts })); }

  snapshot() {
    const t = this.clock();
    return {
      mode: this.desktop ? 'desktop' : 'camera',
      phase: this.phase,
      paused: !!this.paused,
      shift: this.shiftNo,
      remainingMs: Math.max(0, this.endsAt - t),
      deadlineMs: this.deadlineMs,
      task: this.task,
      step: this.step,
      steps: this.s.steps,
      rank: { i: this.rank, name: this.d.ranks[this.rank], next: this.d.ranks[this.rank + 1] || null, best: this.d.ranks[this.bestRank] },
      streak: this.streak,
      pings: this.pings.map((p) => ({ id: p.id, by: p.by, text: p.text, waiting: p.waiting, soi: p.soi })),
      status: this.status.map((s) => ({ kind: s.kind, by: s.by, text: s.text || null, leftMs: Math.max(0, s.until - t), totalMs: s.total })),
      blocker: this.blockerView(),
      queued: Math.max(0, this.blockers.length - 1),
      job: this.jobView(),
      jobNo: this.jobNo,
      covered: this.phase === 'work' && this.covered(),
      feed: this.feed.map((f) => ({ by: f.by, action: f.action, n: f.n, ageMs: t - f.at })),
      result: this.result,
      top: { bosses: this.top(this.bosses), helpers: this.top(this.helpers) },
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), trigger: b.trigger, every: b.every, count: b.every ? Math.min(b.count, b.every) : 0 })),
    };
  }

  serialize() {
    return {
      rank: this.rank, bestRank: this.bestRank, streak: this.streak, shiftNo: this.shiftNo, uid: this.uid, bosses: this.bosses, helpers: this.helpers,
      feed: this.feed, lastMail: this.lastMail, phase: this.phase, startedAt: this.startedAt, endsAt: this.endsAt, deadlineMs: this.deadlineMs,
      task: this.task, step: this.step, pings: this.pings, status: this.status, blockers: this.blockers, job: this.job, jobNo: this.jobNo,
      nextSoiAt: this.nextSoiAt, result: this.result,
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !['brief', 'work', 'result'].includes(s.phase) || !s.task || !Array.isArray(s.pings)) return;
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of Object.keys(this.serialize())) if (k in copy) this[k] = copy[k];
    this.rank = Math.max(0, Math.min(this.d.ranks.length - 1, Number(this.rank) || 0));
    this.step = Math.max(0, Math.min(this.s.steps, Number(this.step) || 0));
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(Deadline);

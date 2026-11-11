import { Emitter, makePausable, normalize, canon, digitsOf, triggerText, triggerIcon } from '#sdk';
import { pickRules, ruleText, ruleOk } from './password.js';

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
 * Cốt truyện (cài đặt story, cả 2 chế độ): mỗi chức là một CHƯƠNG (data/office.json → story.chapters) có tên chương, sếp,
 * lời dẫn, nhiệm vụ riêng, kết thắng / thua riêng. Trong ca, nhân vật (NPC) nhắn tin theo mốc thời gian và có thể gây sự kiện
 * (sếp soi, họp, virus… hoặc đồng nghiệp mang cà phê, làm hộ). Thắng ca cuối ở chức cao nhất → đoạn kết, sang MÙA mới từ đầu.
 *
 * Pha: brief (giao việc) → work → result → brief…
 */
export function createGame(ctx) { return new Deadline(ctx); }

export const HARM = ['ping', 'soi', 'ban', 'mayin', 'buzz', 'hop', 'cattg', 'virus', 'lamlai', 'meo', 'capslock', 'cupdien', 'wifi'];
export const HELP = ['cafe', 'giahan', 'intern', 'thangchuc', 'antrua', 'tainghe'];
export const JOBS = ['mail', 'inbox', 'sheet', 'files', 'password', 'captcha', 'approve', 'otp', 'typo', 'reply', 'calendar', 'desktop', 'sign', 'colleague', 'quiz'];
export const VIEWER_JOBS = ['sign', 'colleague', 'quiz']; // việc cần người xem bình luận (có nút Bỏ qua)
const JUNK = '#$%&@!?*~^qzxjwkfv';
export const APPROVE_LIMIT = 10; // triệu: tờ trình trên mức này thì Từ chối (và phải khớp hoá đơn)
export const FOLDERS = ['anh', 'tailieu', 'rac'];
const STATUS_MS = { soi: 15000, mayin: 12000, hop: 20000, buzz: 15000, virus: 10000, meo: 8000, capslock: 15000, cupdien: 12000, wifi: 8000, antrua: 15000, tainghe: 30000 };
const SOI_PING_MS = 4500;
const STORY_MSG_MS = 7000;
const EVENT_EFFECTS = new Set([...HARM, ...HELP.filter((x) => x !== 'thangchuc')]);
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
  captcha: [['☕', 'ly cà phê', ['🍵', '🥤', '🧋', '🍺']]], approvals: ['Mua máy in mới', 'Tiệc tất niên', 'Nâng cấp wifi', 'Đặt áo đồng phục'],
  typos: ['Báo cáo *quí* bốn đã *sog*'], replies: [{ msg: 'Sao đơn của tôi giao chậm vậy???', good: 'Dạ em xin lỗi, em kiểm tra ngay ạ', bad: ['Chậm thì chờ thêm đi', 'Lát rep'] }],
  meetings: ['Họp giao ban', 'Họp với khách', 'Họp team', 'Gặp sếp tổng'], icons: ['Báo cáo', 'Hợp đồng', 'Lương', 'Ảnh team', 'Kế hoạch', 'Dự án'],
  story: { chapters: [], ending: [] },
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
    this.signWord = normalize(this.s.signWord || '');
    this.rank = Math.min(this.s.startRank, this.d.ranks.length - 1);
    this.bestRank = this.rank;
    this.streak = 0;
    this.shiftNo = 0;
    this.uid = 0;
    this.bosses = {}; // id → { id, name, avatar, points, gifts }
    this.helpers = {};
    this.feed = [];
    this.lastMail = -1;
    this.season = 1;
    this.seen = []; // chương đã xem lời dẫn trong mùa này
    this.newSeason = false;
    this.startShift();
  }

  get desktop() { return this.s.mode !== 'camera'; }
  pick(list) { return list[Math.floor(this.ctx.random() * list.length)]; }
  shuffle(list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.ctx.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  /** Chương hiện tại (theo chức) khi bật cốt truyện. */
  chapter() {
    if (!this.s.story) return null;
    const ch = this.d.story?.chapters?.[this.chapterRank ?? this.rank];
    return ch && typeof ch === 'object' ? ch : null;
  }
  shiftMs() { return Math.round((this.s.shiftSeconds * Math.max(0.6, 1 - 0.08 * this.rank))) * 1000; }

  // ---------------- vòng đời ca làm ----------------
  startShift() {
    if (this.newSeason) { this.newSeason = false; this.season++; this.rank = Math.min(this.s.startRank, this.d.ranks.length - 1); this.seen = []; this.streak = 0; this.tags = []; }
    this.shiftNo++;
    this.phase = 'brief';
    this.startedAt = this.clock();
    this.chapterRank = this.rank; // chương của ca này (giữ nguyên tới hết thẻ kết quả dù đã lên / xuống chức)
    const ch = this.chapter();
    const fresh = !!ch && !this.seen.includes(this.rank);
    if (fresh) this.seen.push(this.rank);
    this.chapterFresh = fresh;
    const ch0 = ch?.choice;
    // lựa chọn của chương: người xem bình luận 1 / 2 trong lúc đọc lời dẫn (chỉ lần đầu vào chương)
    this.vote = fresh && this.s.voteSeconds > 0 && Array.isArray(ch0?.options) && ch0.options.length >= 2
      ? { q: String(ch0.q || ''), options: ch0.options.slice(0, 2).map((o) => ({ label: String(o.label || ''), tag: o.tag === 'tham' ? 'tham' : 'tot' })), counts: [0, 0], voters: {} }
      : null;
    this.choice = null;
    this.queued = [];
    const briefS = fresh ? Math.max(this.s.briefSeconds, this.s.storyBriefSeconds, this.vote ? this.s.voteSeconds : 0) : this.s.briefSeconds;
    this.endsAt = this.startedAt + briefS * 1000;
    this.deadlineMs = this.shiftMs();
    this.target = this.s.steps;
    this.rival = ch && this.s.rival && this.d.story?.rival ? { name: String(this.d.story.rival.name || 'Trâm'), icon: String(this.d.story.rival.icon || '😏'), pace: Number(ch.rivalPace) || 0.88, k: 0, taunted: false, done: false } : null;
    const custom = !this.desktop && String(this.s.cameraTask || '').trim();
    const chTask = ch && (this.desktop ? (ch.desktopTask?.name ? ch.desktopTask : null) : (ch.cameraTask ? { name: ch.cameraTask, file: ch.desktopTask?.file } : null));
    const t = custom ? { name: custom.slice(0, 80), file: 'ViecCuaToi_final.docx' } : chTask || this.pick(this.desktop ? this.d.desktopTasks : this.d.cameraTasks);
    this.taskTpl = String(t.name);
    this.task = { name: this.taskTpl.replace(/\{n\}/g, this.target), file: String(t.file || 'BaoCao_final.docx') };
    this.step = 0;
    this.pings = [];
    this.status = [];
    this.blockers = [];
    this.job = null;
    this.jobNo = 0;
    this.nextSoiAt = null;
    this.result = null;
    this.storyIdx = 0;
    this.storyMsgs = [];
    return [{ type: 'dd_brief', shift: this.shiftNo, task: this.task, rank: this.d.ranks[this.rank], chapter: ch ? this.rank + 1 : null }];
  }

  startWork() {
    const fx = [];
    if (this.vote) fx.push(...this.resolveVote());
    this.phase = 'work';
    this.startedAt = this.clock();
    this.endsAt = this.startedAt + this.deadlineMs;
    this.lastTickAt = this.startedAt;
    if (this.desktop) this.newJob();
    fx.unshift({ type: 'dd_start', shift: this.shiftNo });
    for (const q of this.queued || []) { const r = this.applyEffect(q.id, q.by); fx.push({ type: 'dd_gift', action: q.id, by: q.by, sub: r.sub, meme: null, harm: HARM.includes(q.id), applied: true, late: true }, ...r.fx); }
    this.queued = [];
    return fx;
  }

  /** Chốt lựa chọn của người xem (nhiều phiếu hơn thắng, hoà thì ngẫu nhiên) và áp dụng tác dụng lên ca này. */
  resolveVote() {
    const v = this.vote;
    this.vote = null;
    const opts = this.chapter()?.choice?.options || [];
    const [a, b] = v.counts;
    const i = a === b ? Math.floor(this.ctx.random() * 2) : a > b ? 0 : 1;
    const o = opts[i] || {};
    const dSec = Math.max(-120, Math.min(300, Number(o.deadline) || 0));
    const dSteps = Math.max(-10, Math.min(10, Number(o.steps) || 0));
    this.deadlineMs = Math.max(30_000, this.deadlineMs + dSec * 1000);
    this.target = Math.max(3, Math.min(40, this.target + dSteps));
    if (this.rival) this.rival.pace = Math.max(0.45, Math.min(1.6, this.rival.pace + (Number(o.rival) || 0)));
    this.task.name = this.taskTpl.replace(/\{n\}/g, this.target);
    const tag = o.tag === 'tham' ? 'tham' : 'tot';
    this.tags = [...(this.tags || []), tag];
    this.choice = { i, label: String(o.label || ''), tag, result: String(o.result || ''), votes: v.counts.slice(), deadline: dSec, steps: dSteps, rival: Number(o.rival) || 0 };
    return [{ type: 'dd_choice', ...this.choice }];
  }

  finish(win, how = '') {
    const from = this.rank;
    const ch = this.chapter();
    const last = this.d.ranks.length - 1;
    if (win) { this.rank = Math.min(this.d.ranks.length - 1, this.rank + 1); this.streak++; }
    else { if (this.s.demoteOnFail) this.rank = Math.max(0, this.rank - 1); this.streak = 0; }
    this.bestRank = Math.max(this.bestRank, this.rank);
    const t = this.clock();
    this.result = {
      win, how, shift: this.shiftNo, task: this.task.name, step: this.step, steps: this.target,
      leftMs: win ? Math.max(0, this.endsAt - t) : 0,
      rankFrom: this.d.ranks[from], rankTo: this.d.ranks[this.rank], rankChange: Math.sign(this.rank - from),
      punishment: !win && this.s.punishments ? this.pick(this.d.punishments) : null,
      streak: this.streak,
      story: ch ? String((win ? ch.win : ch.fail) || '') : null,
      ending: null, endingTag: null, season: this.season,
      choice: this.choice,
      rival: this.rival ? { name: this.rival.name, icon: this.rival.icon, beat: win && !this.rival.done, done: this.rival.done, line: win && !this.rival.done ? this.pick(this.d.story.rival.beaten || ['Hừ!']) : null } : null,
      next: null,
    };
    const nextCh = ch && win && from < last ? this.d.story.chapters[from + 1] : null;
    if (nextCh) this.result.next = { no: from + 2, title: String(nextCh.title || ''), teaser: String(ch.next || '') };
    if (ch && win && from === last) { // thắng ca cuối ở chức cao nhất → đoạn kết (theo các lựa chọn của người xem), ca sau sang mùa mới
      const tags = this.tags || [];
      const tham = tags.filter((x) => x === 'tham').length, tot = tags.length - tham;
      const tag = tags.length ? (tham > tot ? 'tham' : 'tot') : null;
      const lines = (tag && this.d.story.endings?.[tag]) || this.d.story.ending || [];
      this.result.ending = lines.map((l) => String(l).replace(/\{season\}/g, this.season));
      this.result.endingTag = tag;
      this.newSeason = true;
    }
    this.phase = 'result';
    this.startedAt = t;
    this.endsAt = t + this.s.resultSeconds * 1000;
    this.pings = []; this.status = []; this.blockers = []; this.job = null; this.nextSoiAt = null; this.storyMsgs = [];
    const endMs = this.result.ending ? Math.max(this.s.resultSeconds, this.s.storyBriefSeconds + 4) : this.s.resultSeconds;
    this.endsAt = t + endMs * 1000;
    this.ctx.report?.round?.({ win, shift: this.shiftNo, step: this.result.step, steps: this.result.steps, rank: this.result.rankTo });
    return [{ type: win ? 'dd_win' : 'dd_fail', ...this.result }];
  }

  // ---------------- mini-việc (chế độ máy tính) ----------------
  /** Danh sách mini-việc đang bật (cài đặt jobs). Xáo kiểu túi: đủ một vòng mới lặp lại, không trùng việc vừa làm. */
  nextKind() {
    const list = (Array.isArray(this.s.jobs) ? this.s.jobs : []).filter((k) => JOBS.includes(k));
    const kinds = list.length ? list : JOBS.slice(0, 4);
    if (!this.s.shuffleJobs) return kinds[this.jobNo % kinds.length];
    if (!Array.isArray(this.jobBag) || !this.jobBag.length || this.jobBag.some((k) => !kinds.includes(k))) {
      this.jobBag = this.shuffle(kinds);
      if (this.jobBag.length > 1 && this.jobBag[0] === this.lastKind) this.jobBag.push(this.jobBag.shift());
    }
    return this.jobBag.shift();
  }

  newJob() {
    const kind = this.nextKind();
    this.lastKind = kind;
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
    } else if (kind === 'sign') {
      this.job = { kind, id, need: this.s.signNeed, signers: [] };
    } else if (kind === 'colleague') {
      const pool = (this.recent || []).filter((c) => c.text !== this.lastColleague);
      const c = pool.length ? pool[Math.floor(this.ctx.random() * pool.length)] : null;
      this.lastColleague = c?.text ?? null;
      this.job = c ? { kind, id, text: c.text, from: c.by, typed: '' } : { kind, id, text: this.pick(this.d.mail), from: null, typed: '' };
    } else if (kind === 'quiz') {
      const a = 10 + Math.floor(this.ctx.random() * 40), b = 5 + Math.floor(this.ctx.random() * 40);
      this.job = { kind, id, a, b, typed: '', solver: null };
    } else if (kind === 'password') {
      const year = new Date(this.now()).getFullYear();
      this.job = { kind, id, rules: pickRules(this.s.pwRuleCount, this.ctx.random, year), shown: 1, typed: '' };
    } else if (kind === 'captcha') {
      const [target, name, decoys] = this.pick(this.d.captcha);
      const n = this.rank >= 3 ? 4 : 3;
      const cells = this.shuffle([...Array(n).fill(target), ...Array.from({ length: 9 - n }, () => this.pick(decoys))]);
      this.job = { kind, id, target: String(target), name: String(name), cells: cells.map((e) => ({ e: String(e), on: false })) };
    } else if (kind === 'approve') {
      // mỗi tờ trình kèm hoá đơn: DUYỆT khi ≤ hạn mức VÀ số tiền khớp hoá đơn từng đồng; còn lại TỪ CHỐI
      const names = this.shuffle(this.d.approvals).slice(0, 4);
      const kinds = this.shuffle(['over', 'mismatch', 'ok', this.ctx.random() < 0.5 ? 'ok' : 'mismatch']);
      const items = names.map((name, i) => {
        const k = kinds[i];
        const amount = k === 'over' ? (APPROVE_LIMIT + 1 + Math.floor(this.ctx.random() * 30)) * 1e6 + Math.floor(this.ctx.random() * 100) * 1e4 : (1 + Math.floor(this.ctx.random() * (APPROVE_LIMIT - 1))) * 1e6 + (1 + Math.floor(this.ctx.random() * 98)) * 1e4;
        return { name: String(name), amount, invoice: k === 'mismatch' ? this.misprint(amount) : amount, done: false };
      });
      this.job = { kind, id, items };
    } else if (kind === 'otp') {
      this.job = { kind, id, code: this.otpCode(), showUntil: this.clock() + this.otpMs(), typed: '' };
    } else if (kind === 'typo') {
      const raw = String(this.pick(this.d.typos));
      const words = raw.split(/\s+/).filter(Boolean).map((w) => ({ w: w.replace(/\*/g, ''), bad: /^\*.+\*$/.test(w), found: false }));
      this.job = { kind, id, words };
    } else if (kind === 'reply') {
      const r = this.pick(this.d.replies);
      const opts = this.shuffle([String(r.good), ...(r.bad || []).slice(0, 2).map(String)]);
      this.job = { kind, id, msg: String(r.msg), opts, answer: opts.indexOf(String(r.good)) };
    } else if (kind === 'calendar') {
      let busy;
      do {
        busy = new Set(this.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, this.rank >= 3 ? 5 : 4));
      } while (![0, 1, 2, 3, 4, 5, 6].some((i) => !busy.has(i) && !busy.has(i + 1)));
      const names = this.shuffle(this.d.meetings);
      let k = 0;
      this.job = { kind, id, slots: Array.from({ length: 8 }, (_, i) => ({ h: 8 + i, busy: busy.has(i) ? String(names[k++ % names.length]) : null })) };
    } else if (kind === 'desktop') {
      const names = this.shuffle(this.d.icons).slice(0, 6).map(String);
      this.job = { kind, id, icons: names.map((name) => ({ name, done: false })), order: names.slice().sort((a, b) => a.localeCompare(b, 'vi')), pos: 0 };
    } else {
      let files;
      do { files = this.shuffle(this.d.files).slice(0, 4); } while (new Set(files.map((f) => f[1])).size < 2 && this.d.files.length > 4);
      this.job = { kind, id, files: files.map(([name, folder]) => ({ name, folder, done: false })), sel: null };
    }
  }

  /** Số tiền "gần giống": đảo 2 chữ số kề nhau hoặc lệch một hàng. */
  misprint(n) {
    const d = String(n).split('');
    for (let tries = 0; tries < 10; tries++) {
      const i = Math.floor(this.ctx.random() * (d.length - 3));
      if (d[i] !== d[i + 1]) { const x = d.slice(); [x[i], x[i + 1]] = [x[i + 1], x[i]]; const v = Number(x.join('')); if (v !== n && v <= APPROVE_LIMIT * 1e6) return v; }
    }
    return n + (1 + Math.floor(this.ctx.random() * 9)) * 1e4 * (this.ctx.random() < 0.5 ? -1 : 1);
  }

  otpCode() { return Array.from({ length: 6 }, () => Math.floor(this.ctx.random() * 10)).join(''); }
  otpMs() { return Math.round(this.s.otpSeconds * 1000); }
  resetJob() {
    const j = this.job;
    if (!j) return;
    if ('typed' in j) j.typed = '';
    if (j.cells) for (const c of j.cells) c.on = false;
    if (j.items) for (const it of j.items) it.done = false;
    if (j.words) for (const w of j.words) w.found = false;
    if (j.kind === 'password') j.shown = 1;
    if (j.icons) { for (const ic of j.icons) ic.done = false; j.pos = 0; }
    if (j.kind === 'otp') { j.code = this.otpCode(); j.showUntil = this.clock() + this.otpMs(); }
    if (j.mails) for (const m of j.mails) m.done = false;
    if (j.files) { for (const f of j.files) f.done = false; j.sel = null; }
  }

  completeJob(by = null) {
    if (this.job?.kind === 'colleague' && this.job.from && !by) this.helped(this.job.from);
    this.job = null;
    const fx = this.addStep(1, by);
    if (this.phase === 'work' && this.desktop) this.newJob();
    return fx;
  }

  addStep(n, by = null) {
    if (this.phase !== 'work') return [];
    const before = this.step;
    this.step = Math.max(0, Math.min(this.target, this.step + n));
    if (this.step === before) return [];
    const fx = [{ type: 'dd_step', step: this.step, steps: this.target, n: this.step - before, by }];
    if (this.step >= this.target) fx.push(...this.finish(true));
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
    if (p) { const text = this.clean(ev.text); return text ? [this.setText(p, text)] : []; }
    if (this.vote && this.phase === 'brief') {
      const m = normalize(ev.text).match(/^(1|2)(?!\d)/);
      if (!m || this.vote.voters[id] != null) return [];
      if (Object.keys(this.vote.voters).length >= 5000) return [];
      const i = Number(m[1]) - 1;
      this.vote.voters[id] = i; this.vote.counts[i]++;
      return [{ type: 'dd_vote', i, counts: this.vote.counts.slice(), by: pub(ev.user) }];
    }
    if (!this.desktop) return [];
    const by = pub(ev.user);
    this.remember(by, ev.text);
    const j = this.job;
    if (this.phase !== 'work' || !j) return [];
    if (j.kind === 'sign' && this.signWord && ` ${normalize(ev.text)} `.includes(` ${this.signWord} `) && !j.signers.some((x) => x.id === by.id)) {
      j.signers.push(by);
      this.helped(by);
      return j.signers.length >= j.need ? this.completeJob(by) : [{ type: 'dd_sign', by, n: j.signers.length, need: j.need }];
    }
    if (j.kind === 'quiz' && digitsOf(ev.text) === String(j.a + j.b)) { this.helped(by); return this.completeJob(by); }
    return [];
  }

  /** Bình luận gần đây (đã lọc) để làm câu "Chép lời đồng nghiệp". */
  remember(by, raw) {
    const text = this.clean(raw);
    const cps = [...text];
    if (cps.length < 8 || cps.length > 60 || text.endsWith('…') || /\*\*\*|https?:|@/.test(text)) return;
    const letters = (text.match(/\p{L}/gu) || []).length;
    if (letters < cps.length * 0.6 || text.split(' ').length < 2) return;
    (this.recent ||= []).push({ by, text });
    if (this.recent.length > 20) this.recent.shift();
  }

  helped(by) {
    const row = (this.helpers[by.id] ||= { ...by, points: 0, gifts: 0 });
    Object.assign(row, { name: by.name, avatar: by.avatar });
    row.points += 1;
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
    if (this.phase === 'brief' && this.vote) { // đang bình chọn: giữ quà lại, vào ca mới áp dụng
      if (this.queued.length < 20) this.queued.push({ id, by });
    } else if (this.phase === 'brief') fx.push(...this.startWork()); // quà tới lúc đang giao việc → vào ca luôn, không phí quà
    const t = this.clock();
    const work = this.phase === 'work';
    let sub = '';
    if (work) { const r = this.applyEffect(id, by); fx.push(...r.fx); sub = r.sub; } else if (this.phase === 'brief' && this.vote) sub = 'có tác dụng khi vào ca';
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

  /** Tác dụng của một action trong ca (dùng chung cho quà và sự kiện cốt truyện). */
  applyEffect(id, by, opt = {}) {
    const fx = [];
    let sub = '';
    switch (id) {
      case 'ping': if (this.active('tainghe')) { sub = '🎧 đeo tai nghe, không thấy'; break; } fx.push(...this.addPing(by, opt.text ? { text: opt.text } : {})); break;
      case 'soi': if (this.active('tainghe')) { sub = '🎧 đeo tai nghe, mặc kệ'; break; } this.addStatus('soi', by); sub = 'đứng sau lưng'; break;
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
        const phrase = opt.phrase ? String(opt.phrase) : this.pick(this.d.buzz);
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
      case 'meo': {
        if (this.desktop) {
          const junk = Array.from({ length: 5 + Math.floor(this.ctx.random() * 4) }, () => JUNK[Math.floor(this.ctx.random() * JUNK.length)]).join('');
          const b = this.blockers[0];
          if (b?.kind === 'buzz') b.typed += junk;
          else if (this.job && 'typed' in this.job) this.job.typed = (this.job.typed + junk).slice(0, 200);
          sub = `chèn “${junk}”`;
        } else sub = 'nằm lên bàn phím';
        this.addStatus('meo', by);
        fx.push({ type: 'dd_shake', by });
        break;
      }
      case 'capslock': this.addStatus('capslock', by); sub = 'gõ ra chữ hoa / thường đảo ngược'; break;
      case 'cupdien': this.addStatus('cupdien', by); sub = 'màn hình tối om'; break;
      case 'wifi': this.addStatus('wifi', by); sub = 'không gửi / lưu được'; break;
      case 'antrua': this.addStatus('antrua', by); sub = 'đồng hồ đứng 15 giây'; break;
      case 'tainghe':
        this.addStatus('tainghe', by);
        this.pings = []; this.status = this.status.filter((x) => x.kind !== 'soi'); this.nextSoiAt = null;
        sub = 'miễn ping & sếp soi 30 giây';
        break;
      default:
    }
    return { fx, sub };
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
        if (this.job && 'typed' in this.job) this.job.typed = this.job.kind === 'sheet' || this.job.kind === 'otp' || this.job.kind === 'quiz' ? v.replace(/[^\d]/g, '').slice(0, 6) : this.job.kind === 'password' ? v.slice(0, 30) : v;
        return [];
      }
      case 'enter': return this.desktop ? this.submit() : [];
      case 'click': return this.desktop ? this.click(ev) : [];
      default: return [];
    }
  }

  submit() {
    if (this.covered()) return [];
    if (this.active('wifi')) return [{ type: 'dd_wifi' }];
    const b = this.blockers[0];
    if (b) {
      if (b.kind !== 'buzz') return [];
      if (this.same(b.typed, b.phrase)) { this.blockers.shift(); return [{ type: 'dd_cleared', kind: 'buzz' }]; }
      return [{ type: 'dd_wrong', kind: 'buzz' }];
    }
    const j = this.job;
    if (j?.kind === 'mail') return this.same(j.typed, j.text) ? this.completeJob() : [{ type: 'dd_wrong', kind: 'mail' }];
    if (j?.kind === 'colleague') return this.same(j.typed, j.text) ? this.completeJob() : [{ type: 'dd_wrong', kind: 'colleague' }];
    if (j?.kind === 'quiz') return j.typed !== '' && Number(j.typed) === j.a + j.b ? this.completeJob() : [{ type: 'dd_wrong', kind: 'quiz' }];
    if (j?.kind === 'password') {
      const shown = j.rules.slice(0, j.shown);
      if (!j.typed || !shown.every((r) => ruleOk(r, j.typed))) return [{ type: 'dd_wrong', kind: 'password' }];
      if (j.shown < j.rules.length) { j.shown++; return [{ type: 'dd_pw_rule', n: j.shown, total: j.rules.length, text: ruleText(j.rules[j.shown - 1]) }]; }
      return this.completeJob();
    }
    if (j?.kind === 'otp') {
      if (j.typed === j.code) return this.completeJob();
      j.code = this.otpCode(); j.showUntil = this.clock() + this.otpMs(); j.typed = ''; // sai → mã mới
      return [{ type: 'dd_wrong', kind: 'otp' }];
    }
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
    if (target === 'skip' && VIEWER_JOBS.includes(j.kind)) { this.newJob(); return [{ type: 'dd_zap' }]; }
    if (this.active('wifi') && !['cell', 'file', 'word'].includes(target)) return [{ type: 'dd_wifi' }];
    if (j.kind === 'inbox' && target === 'inbox') {
      const m = j.mails[Number(ev.id)];
      if (!m || m.done) return [];
      if ((ev.value === 'spam') !== m.spam) return [{ type: 'dd_wrong', kind: 'inbox' }];
      m.done = true;
      return j.mails.every((x) => x.done) ? this.completeJob() : [{ type: 'dd_zap' }];
    }
    if (j.kind === 'captcha') {
      if (target === 'cell') { const c = j.cells[Number(ev.id)]; if (c) c.on = !c.on; return c ? [{ type: 'dd_zap' }] : []; }
      if (target === 'verify') {
        if (j.cells.every((c) => c.on === (c.e === j.target))) return this.completeJob();
        for (const c of j.cells) c.on = false;
        return [{ type: 'dd_wrong', kind: 'captcha' }];
      }
      return [];
    }
    if (j.kind === 'approve' && target === 'approve') {
      const it = j.items[Number(ev.id)];
      if (!it || it.done) return [];
      const ok = it.amount <= APPROVE_LIMIT * 1e6 && it.amount === it.invoice;
      if ((ev.value === 'no') === ok) return [{ type: 'dd_wrong', kind: 'approve' }];
      it.done = true;
      return j.items.every((x) => x.done) ? this.completeJob() : [{ type: 'dd_zap' }];
    }
    if (j.kind === 'otp' && target === 'resend') { j.code = this.otpCode(); j.showUntil = this.clock() + this.otpMs(); j.typed = ''; return [{ type: 'dd_zap' }]; }
    if (j.kind === 'typo' && target === 'word') {
      const w = j.words[Number(ev.id)];
      if (!w || w.found) return [];
      if (!w.bad) return [{ type: 'dd_wrong', kind: 'typo' }];
      w.found = true;
      return j.words.every((x) => !x.bad || x.found) ? this.completeJob() : [{ type: 'dd_zap' }];
    }
    if (j.kind === 'reply' && target === 'reply') {
      const i = Number(ev.id);
      if (!(i >= 0 && i < j.opts.length)) return [];
      return i === j.answer ? this.completeJob() : [{ type: 'dd_wrong', kind: 'reply' }];
    }
    if (j.kind === 'calendar' && target === 'slot') {
      const i = Number(ev.id);
      if (!(i >= 0 && i < j.slots.length)) return [];
      return i < j.slots.length - 1 && !j.slots[i].busy && !j.slots[i + 1].busy ? this.completeJob() : [{ type: 'dd_wrong', kind: 'calendar' }];
    }
    if (j.kind === 'desktop' && target === 'icon') {
      const ic = j.icons[Number(ev.id)];
      if (!ic || ic.done) return [];
      if (ic.name !== j.order[j.pos]) return [{ type: 'dd_wrong', kind: 'desktop' }];
      ic.done = true; j.pos++;
      return j.pos >= j.order.length ? this.completeJob() : [{ type: 'dd_zap' }];
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
    const dt = Math.max(0, Math.min(2000, t - (this.lastTickAt ?? t)));
    this.lastTickAt = t;
    if (this.phase === 'work' && this.active('antrua')) this.endsAt += dt; // sếp mời ăn trưa: đồng hồ đứng
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
    if (this.phase === 'work') fx.push(...this.storyTick(t));
    if (this.phase === 'work' && this.rival && !this.rival.done) fx.push(...this.rivalTick(t));
    if (this.storyMsgs?.length) this.storyMsgs = this.storyMsgs.filter((m) => m.until > t);
    if (t >= this.endsAt) {
      if (this.phase === 'brief') fx.push(...this.startWork());
      else if (this.phase === 'work') fx.push(...this.finish(false));
      else if (this.phase === 'result') fx.push(...this.startShift());
    }
    return fx;
  }

  /** Trâm, đồng nghiệp đối thủ: tự làm theo thời gian. Về đích trước → sếp khen Trâm, deadline của bạn −20 giây. */
  rivalTick(t) {
    const r = this.rival;
    r.k = Math.max(0, Math.min(1, (t - this.startedAt) / (this.deadlineMs * r.pace)));
    const R = this.d.story.rival || {};
    const by = { id: 'npc:rival', name: r.name, avatar: null, npc: true, icon: r.icon };
    const say = (text) => { this.storyMsgs.push({ id: ++this.uid, by, text, effect: null, until: t + STORY_MSG_MS }); while (this.storyMsgs.length > 3) this.storyMsgs.shift(); };
    const fx = [];
    if (!r.taunted && r.k >= 0.5 && r.k * this.target > this.step) { r.taunted = true; const line = this.pick(R.taunts || ['Mình xong nửa rồi nè']); say(line); fx.push({ type: 'dd_story', by, text: line, effect: null, sub: '' }); }
    if (r.k >= 1) {
      r.done = true;
      const line = this.pick(R.won || ['Mình xong rồi nha']);
      say(line);
      this.endsAt = Math.max(t + 10_000, this.endsAt - 20_000);
      fx.push({ type: 'dd_rival_done', by, text: line, sub: 'Sếp khen Trâm: deadline của bạn −20 giây' });
    }
    return fx;
  }

  /** Sự kiện cốt truyện theo mốc thời gian của ca (tính trên deadline gốc, không tính phần được gia hạn). */
  storyTick(t) {
    const evs = this.chapter()?.events;
    if (!Array.isArray(evs)) return [];
    const fx = [];
    while (this.phase === 'work' && this.storyIdx < evs.length) {
      const e = evs[this.storyIdx] || {};
      if (t < this.startedAt + Math.max(0, Math.min(1, Number(e.at) || 0)) * this.deadlineMs) break;
      this.storyIdx++;
      const by = { id: `npc:${e.from || '?'}`, name: String(e.from || 'Đồng nghiệp').slice(0, 40), avatar: null, npc: true, icon: e.icon || '💬' };
      const text = String(e.text || '').slice(0, 120);
      const eff = EVENT_EFFECTS.has(e.effect) ? e.effect : null;
      if (eff !== 'ping' && text) {
        this.storyMsgs.push({ id: ++this.uid, by, text, effect: eff, until: t + STORY_MSG_MS });
        while (this.storyMsgs.length > 3) this.storyMsgs.shift();
      }
      const r = eff ? this.applyEffect(eff, by, { text: eff === 'ping' ? text : null, phrase: e.phrase }) : { fx: [], sub: '' };
      fx.push({ type: 'dd_story', by, text, effect: eff, sub: r.sub }, ...r.fx);
    }
    return fx;
  }

  onResume(d) {
    for (const m of this.storyMsgs || []) m.until += d;
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
    if (j.kind === 'sign') return { kind: j.kind, id: j.id, need: j.need, signers: j.signers, word: this.s.signWord };
    if (j.kind === 'colleague') return { kind: j.kind, id: j.id, text: j.text, from: j.from, typed: j.typed };
    if (j.kind === 'quiz') return { kind: j.kind, id: j.id, a: j.a, b: j.b, typed: j.typed };
    if (j.kind === 'password') return { kind: j.kind, id: j.id, typed: j.typed, total: j.rules.length, rules: j.rules.slice(0, j.shown).map((r) => ({ id: r.id, p: r.p, text: ruleText(r), ok: ruleOk(r, j.typed) })) };
    if (j.kind === 'captcha') return { kind: j.kind, id: j.id, target: j.target, name: j.name, cells: j.cells };
    if (j.kind === 'approve') return { kind: j.kind, id: j.id, items: j.items, limit: APPROVE_LIMIT };
    if (j.kind === 'otp') { const left = j.showUntil - this.clock(); return { kind: j.kind, id: j.id, typed: j.typed, code: left > 0 ? j.code : null, showLeftMs: Math.max(0, left), showMs: this.otpMs() }; }
    if (j.kind === 'typo') return { kind: j.kind, id: j.id, words: j.words.map((w) => ({ w: w.w, found: w.found })), need: j.words.filter((w) => w.bad).length };
    if (j.kind === 'reply') return { kind: j.kind, id: j.id, msg: j.msg, opts: j.opts };
    if (j.kind === 'calendar') return { kind: j.kind, id: j.id, slots: j.slots };
    if (j.kind === 'desktop') return { kind: j.kind, id: j.id, icons: j.icons, pos: j.pos };
    if (j.kind === 'inbox') return { kind: j.kind, id: j.id, mails: j.mails.map((m) => ({ from: m.from, subject: m.subject, done: m.done })) };
    return { kind: j.kind, id: j.id, files: j.files.map((f) => ({ name: f.name, done: f.done })), sel: j.sel };
  }

  enabledJobs() { const l = (Array.isArray(this.s.jobs) ? this.s.jobs : []).filter((k) => JOBS.includes(k)); return l.length ? l : JOBS.slice(0, 4); }

  blockerView() {
    const b = this.blockers[0];
    if (!b) return null;
    if (b.kind === 'virus') return { kind: b.kind, id: b.id, by: b.by, threats: b.threats.map((x) => ({ name: x.name, removed: x.removed })) };
    if (b.kind === 'jam') return { kind: b.kind, id: b.id, by: b.by, left: b.left, total: b.total };
    return { kind: b.kind, id: b.id, by: b.by, phrase: b.phrase, typed: b.typed };
  }

  chapterView() {
    const ch = this.chapter();
    if (!ch) return null;
    const b = ch.boss || {};
    return {
      no: (this.chapterRank ?? this.rank) + 1, total: this.d.ranks.length, title: String(ch.title || ''), fresh: !!this.chapterFresh,
      boss: { name: String(b.name || 'Sếp'), role: String(b.role || ''), icon: String(b.icon || '👔') },
      intro: (Array.isArray(ch.intro) ? ch.intro : []).map(String).slice(0, 4),
    };
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
      steps: this.target,
      rank: { i: this.rank, name: this.d.ranks[this.rank], next: this.d.ranks[this.rank + 1] || null, best: this.d.ranks[this.bestRank] },
      streak: this.streak,
      pings: this.pings.map((p) => ({ id: p.id, by: p.by, text: p.text, waiting: p.waiting, soi: p.soi })),
      status: this.status.map((s) => ({ kind: s.kind, by: s.by, text: s.text || null, leftMs: Math.max(0, s.until - t), totalMs: s.total })),
      blocker: this.blockerView(),
      queued: Math.max(0, this.blockers.length - 1),
      job: this.jobView(),
      jobNo: this.jobNo,
      jobs: this.enabledJobs(),
      covered: this.phase === 'work' && this.covered(),
      feed: this.feed.map((f) => ({ by: f.by, action: f.action, n: f.n, ageMs: t - f.at })),
      result: this.result,
      season: this.season,
      chapter: this.chapterView(),
      vote: this.vote ? { q: this.vote.q, options: this.vote.options, counts: this.vote.counts } : null,
      choice: this.choice,
      rival: this.rival ? { name: this.rival.name, icon: this.rival.icon, step: Math.min(this.target, Math.floor(this.rival.k * this.target)), done: this.rival.done } : null,
      story: (this.storyMsgs || []).filter((m) => m.until > t).map((m) => ({ id: m.id, by: m.by, text: m.text, effect: m.effect, leftMs: m.until - t })),
      top: { bosses: this.top(this.bosses), helpers: this.top(this.helpers) },
      powerups: (this.ctx.bindings?.view?.() || []).map((b) => ({ action: b.action, icon: triggerIcon(b.trigger), text: triggerText(b.trigger), trigger: b.trigger, every: b.every, count: b.every ? Math.min(b.count, b.every) : 0 })),
    };
  }

  serialize() {
    return {
      rank: this.rank, bestRank: this.bestRank, streak: this.streak, shiftNo: this.shiftNo, uid: this.uid, bosses: this.bosses, helpers: this.helpers,
      feed: this.feed, lastMail: this.lastMail, phase: this.phase, startedAt: this.startedAt, endsAt: this.endsAt, deadlineMs: this.deadlineMs,
      task: this.task, step: this.step, pings: this.pings, recent: this.recent ?? [], lastTickAt: this.lastTickAt ?? null, jobBag: this.jobBag ?? null, lastKind: this.lastKind ?? null, status: this.status, blockers: this.blockers, job: this.job, jobNo: this.jobNo,
      nextSoiAt: this.nextSoiAt, result: this.result,
      season: this.season, chapterRank: this.chapterRank, vote: this.vote, choice: this.choice, queued: this.queued, rival: this.rival, tags: this.tags ?? [], target: this.target, taskTpl: this.taskTpl, seen: this.seen, newSeason: this.newSeason, chapterFresh: this.chapterFresh, storyIdx: this.storyIdx, storyMsgs: this.storyMsgs,
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object' || !['brief', 'work', 'result'].includes(s.phase) || !s.task || !Array.isArray(s.pings)) return;
    const copy = JSON.parse(JSON.stringify(s));
    for (const k of Object.keys(this.serialize())) if (k in copy) this[k] = copy[k];
    this.rank = Math.max(0, Math.min(this.d.ranks.length - 1, Number(this.rank) || 0));
    this.target = Math.max(3, Math.min(40, Number(this.target) || this.s.steps));
    this.step = Math.max(0, Math.min(this.target, Number(this.step) || 0));
    this.season = Math.max(1, Number(this.season) || 1);
    if (!Array.isArray(this.seen)) this.seen = [];
    if (!Array.isArray(this.storyMsgs)) this.storyMsgs = [];
    this.storyIdx = Math.max(0, Number(this.storyIdx) || 0);
  }

  destroy() { this.removeAllListeners(); }
}

makePausable(Deadline);

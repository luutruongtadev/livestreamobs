import fs from 'node:fs';
import path from 'node:path';

export const WEEKLY_DEFAULTS = {
  base: 100, // điểm cơ bản khi đoán đúng
  speedMax: 100, // thưởng tốc độ tối đa: đoán đúng ngay đầu vòng được đủ, sát giờ gần như 0
  perShare: 20, // mỗi lượt chia sẻ live: +20 điểm thưởng (cộng vào lần đoán đúng tiếp theo)
  maxShares: 5,
  perDiamond: 2, // mỗi xu quà: +2 điểm thưởng
  maxGiftBonus: 300,
  tzOffsetHours: 7, // tuần tính theo giờ Việt Nam, bắt đầu thứ 2 00:00
  topN: 10,
};

const pub = (u) => ({ id: u.id, name: u.name, avatar: u.avatar || null });

/**
 * Bảng xếp hạng tuần của game Đoán từ.
 * - Đoán đúng: base + thưởng tốc độ + điểm thưởng đã tích (chia sẻ / quà) → cộng vào điểm tuần.
 * - Chia sẻ / tặng quà: tích điểm thưởng chờ, dùng ở lần đoán đúng tiếp theo trong tuần.
 * - Sang tuần mới: lưu top tuần cũ vào lịch sử; người nhất là "Vua tuần" hiện banner cả tuần sau.
 */
export class WeeklyBoard {
  constructor(config = {}, { statePath = null, now = () => Date.now() } = {}) {
    this.cfg = { ...WEEKLY_DEFAULTS, ...config };
    this.statePath = statePath;
    this.now = now;
    this.state = { week: this.weekKey(), scores: {}, bonus: {}, history: [] };
    this.load();
    this.ensureWeek();
  }

  load() {
    if (!this.statePath) return;
    try { this.state = { ...this.state, ...JSON.parse(fs.readFileSync(this.statePath, 'utf8')) }; } catch { /* chưa có */ }
  }

  save() {
    if (!this.statePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath + '.tmp', JSON.stringify(this.state));
    fs.renameSync(this.statePath + '.tmp', this.statePath);
    this.dirty = false;
  }

  /** Ngày thứ 2 đầu tuần (giờ VN) dạng YYYY-MM-DD. */
  weekKey(t = this.now()) {
    const d = new Date(t + this.cfg.tzOffsetHours * 3600e3);
    const day = (d.getUTCDay() + 6) % 7; // thứ 2 = 0
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
    return monday.toISOString().slice(0, 10);
  }

  /** Thời điểm kết thúc tuần hiện tại (ms). */
  weekEndsAt() {
    const [y, m, d] = this.state.week.split('-').map(Number);
    return Date.UTC(y, m - 1, d + 7) - this.cfg.tzOffsetHours * 3600e3;
  }

  ranking(scores = this.state.scores) {
    return Object.values(scores).sort((a, b) => b.points - a.points || b.wins - a.wins || a.firstAt - b.firstAt);
  }

  /** Sang tuần mới thì chốt tuần cũ. Trả về bản ghi tuần vừa chốt (nếu có). */
  ensureWeek() {
    const key = this.weekKey();
    if (key === this.state.week) return null;
    return this.closeWeek(key);
  }

  /** Chốt tuần hiện tại (tự động khi sang tuần, hoặc admin bấm). */
  closeWeek(nextKey = this.weekKey()) {
    const top = this.ranking().slice(0, this.cfg.topN).map((s) => ({ ...s }));
    const rec = { week: this.state.week, closedAt: new Date(this.now()).toISOString(), top };
    if (top.length) this.state.history = [rec, ...this.state.history].slice(0, 26);
    this.state.week = nextKey; // chốt tay giữa tuần: vẫn là tuần đó, chỉ xoá điểm để đua lại
    this.state.scores = {};
    this.state.bonus = {};
    this.dirty = true;
    return rec;
  }

  /** Chia sẻ / tặng quà: tích điểm thưởng chờ. Trả về { add, total } (add = điểm vừa được thêm). */
  addBonus(user, { shares = 0, diamonds = 0 } = {}) {
    if (!user?.id) return { add: 0, total: 0 };
    this.ensureWeek();
    const b = (this.state.bonus[user.id] ||= { shares: 0, diamonds: 0 });
    const before = this.bonusPoints(b);
    b.shares += shares; b.diamonds += diamonds;
    const total = this.bonusPoints(b);
    this.dirty = true;
    return { add: total - before, total };
  }

  bonusPoints(b) {
    if (!b) return 0;
    const c = this.cfg;
    return Math.min(c.maxShares, b.shares) * c.perShare + Math.min(c.maxGiftBonus, Math.round(b.diamonds * c.perDiamond));
  }

  pendingBonus(id) { return this.bonusPoints(this.state.bonus[id]); }

  /** Đoán đúng: speedRatio 0..1 (1 = vừa mở vòng). Trả về chi tiết điểm. */
  award(user, speedRatio) {
    this.ensureWeek();
    const c = this.cfg;
    const speed = Math.round(c.speedMax * Math.max(0, Math.min(1, speedRatio)));
    const b = this.state.bonus[user.id];
    const shareBonus = b ? Math.min(c.maxShares, b.shares) * c.perShare : 0;
    const giftBonus = b ? Math.min(c.maxGiftBonus, Math.round(b.diamonds * c.perDiamond)) : 0;
    delete this.state.bonus[user.id];
    const total = c.base + speed + shareBonus + giftBonus;
    const s = (this.state.scores[user.id] ||= { ...pub(user), points: 0, wins: 0, firstAt: this.now() });
    s.points += total; s.wins++;
    if (user.name) s.name = user.name;
    if (user.avatar) s.avatar = user.avatar;
    this.dirty = true;
    const rank = this.ranking().findIndex((x) => x.id === user.id) + 1;
    return { base: c.base, speed, shareBonus, giftBonus, total, weekPoints: s.points, rank };
  }

  snapshot(n = 5) {
    this.ensureWeek();
    const last = this.state.history[0];
    return {
      week: this.state.week,
      endsInSec: Math.max(0, Math.round((this.weekEndsAt() - this.now()) / 1000)),
      top: this.ranking().slice(0, n).map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, points: s.points, wins: s.wins })),
      king: last?.top?.[0] ? { name: last.top[0].name, avatar: last.top[0].avatar, points: last.top[0].points, week: last.week } : null,
      rules: { base: this.cfg.base, speedMax: this.cfg.speedMax, perShare: this.cfg.perShare, perDiamond: this.cfg.perDiamond },
    };
  }

  /** Cho trang admin: top tuần này + lịch sử các tuần. */
  admin() {
    this.ensureWeek();
    return { week: this.state.week, endsInSec: this.snapshot().endsInSec, top: this.ranking().slice(0, 20), history: this.state.history.slice(0, 8) };
  }
}

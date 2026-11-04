import fs from 'node:fs';
import path from 'node:path';

export const GOODBYE_DEFAULTS = {
  enabled: true,
  at: '01:00', // giờ Việt Nam
  tzOffsetHours: 7,
  seconds: 60, // màn chào tạm biệt đếm ngược bao lâu rồi tạm dừng game
  message: 'Cảm ơn cả nhà đã chơi cùng tối nay! Hẹn gặp lại tối mai nha 💖',
  windowMinutes: 30, // server khởi động lại muộn hơn giờ hẹn quá 30 phút thì bỏ qua ngày đó
};

const parseAt = (s) => {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
};
const pad = (n) => String(n).padStart(2, '0');

/**
 * Hẹn giờ kết thúc live mỗi ngày: tới giờ hẹn → màn "Chúc cả nhà ngủ ngon" đếm ngược trên mọi game → hết giờ thì tạm dừng game.
 * tick() trả về 'start' (bắt đầu chào), 'end' (hết đếm ngược) hoặc null.
 */
export class Goodbye {
  constructor(config = {}, { now = () => Date.now(), statePath } = {}) {
    this.cfg = { ...GOODBYE_DEFAULTS, ...config };
    this.now = now;
    this.statePath = statePath;
    this.lastDay = null; // ngày (giờ VN) đã chào, để mỗi ngày chỉ chào 1 lần
    this.active = null; // { startedAt, endsAt, seconds, message, done }
    this.load();
  }

  load() {
    if (!this.statePath) return;
    try {
      const s = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      for (const k of ['enabled', 'at', 'seconds', 'message']) if (s[k] !== undefined) this.cfg[k] = s[k];
      this.lastDay = s.lastDay || null;
    } catch { /* chưa có */ }
  }

  save() {
    if (!this.statePath) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const { enabled, at, seconds, message } = this.cfg;
    fs.writeFileSync(this.statePath, JSON.stringify({ enabled, at, seconds, message, lastDay: this.lastDay }));
  }

  local(t = this.now()) {
    const d = new Date(t + this.cfg.tzOffsetHours * 3600e3);
    return { day: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }

  tick() {
    const t = this.now();
    if (this.active) {
      if (!this.active.done && t >= this.active.endsAt) { this.active.done = true; return 'end'; }
      return null;
    }
    if (!this.cfg.enabled) return null;
    const at = parseAt(this.cfg.at);
    if (at == null) return null;
    const { day, min } = this.local(t);
    if (min >= at && min < at + this.cfg.windowMinutes && this.lastDay !== day) {
      this.lastDay = day;
      this.save();
      this.start();
      return 'start';
    }
    return null;
  }

  /** Bắt đầu chào tạm biệt ngay (admin bấm, hoặc tới giờ hẹn). */
  start(seconds = this.cfg.seconds, message = this.cfg.message) {
    const t = this.now();
    const s = Math.max(5, Math.min(600, Number(seconds) || 60));
    this.active = { startedAt: t, endsAt: t + s * 1000, seconds: s, message: String(message || this.cfg.message).slice(0, 200), done: false };
    return this.active;
  }

  /** Huỷ màn chào (admin huỷ, hoặc game chạy lại ở lần live sau). */
  cancel() { const had = !!this.active; this.active = null; return had; }

  /** Admin đổi giờ / bật tắt / lời chào. */
  set({ enabled, at, seconds, message } = {}) {
    if (at !== undefined) { if (parseAt(at) == null) throw new Error('Giờ dạng HH:MM, vd 01:00'); this.cfg.at = `${pad(Math.floor(parseAt(at) / 60))}:${pad(parseAt(at) % 60)}`; }
    if (enabled !== undefined) this.cfg.enabled = !!enabled;
    if (seconds !== undefined) this.cfg.seconds = Math.max(5, Math.min(600, Number(seconds) || 60));
    if (message !== undefined && String(message).trim()) this.cfg.message = String(message).trim().slice(0, 200);
    // đổi giờ sang mốc chưa tới trong ngày → hôm nay vẫn chào
    const { day, min } = this.local();
    if (this.lastDay === day && parseAt(this.cfg.at) > min) this.lastDay = null;
    this.save();
  }

  status() {
    const t = this.now();
    const a = this.active;
    return {
      enabled: this.cfg.enabled,
      at: this.cfg.at,
      seconds: this.cfg.seconds,
      message: this.cfg.message,
      active: a ? { message: a.message, seconds: a.seconds, remaining: Math.max(0, Math.ceil((a.endsAt - t) / 1000)), done: a.done } : null,
    };
  }
}

import fs from 'node:fs';
import path from 'node:path';

export const ANNOUNCE_MAX_CHARS = 140;

/** Làm sạch nội dung thông báo: 1 dòng, bỏ ký tự điều khiển, tối đa ANNOUNCE_MAX_CHARS ký tự. */
export function cleanAnnounce(text) {
  const t = String(text ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return chars.length > ANNOUNCE_MAX_CHARS ? chars.slice(0, ANNOUNCE_MAX_CHARS).join('') : t;
}

/**
 * Thông báo của admin hiện ở banner trên cùng các màn hình game (/doantu, /ghep).
 * set({ text, minutes, speak }): minutes = 0 → hiện tới khi admin tắt. Lưu ra file để khởi động lại server không mất.
 */
export class Announcer {
  constructor({ statePath = null, now = () => Date.now() } = {}) {
    this.statePath = statePath;
    this.now = now;
    this.cur = null; // { id, text, at, until, speak }
    this.seq = 0;
    this.load();
  }

  load() {
    if (!this.statePath) return;
    try {
      const d = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      this.seq = d.seq | 0;
      if (d.cur?.text && (!d.cur.until || d.cur.until > this.now())) this.cur = d.cur;
    } catch { /* chưa có */ }
  }

  save() {
    if (!this.statePath) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify({ seq: this.seq, cur: this.cur }));
  }

  set({ text, minutes = 0, speak = false } = {}) {
    const t = cleanAnnounce(text);
    if (!t) throw new Error('Nhập nội dung thông báo');
    const m = Math.max(0, Math.min(24 * 60, Number(minutes) || 0));
    const at = this.now();
    this.cur = { id: ++this.seq, text: t, at, until: m ? at + m * 60_000 : null, speak: !!speak };
    this.save();
    return this.status();
  }

  clear() {
    const had = !!this.cur;
    this.cur = null;
    if (had) this.save();
    return had;
  }

  /** Gọi mỗi giây: hết hạn → tắt, trả về true để phát lại cho các màn hình. */
  tick() {
    if (this.cur?.until && this.now() >= this.cur.until) { this.clear(); return true; }
    return false;
  }

  status() {
    const c = this.cur;
    if (!c) return { active: null };
    return { active: { id: c.id, text: c.text, speak: c.speak, remaining: c.until ? Math.max(0, Math.ceil((c.until - this.now()) / 1000)) : null } };
  }
}

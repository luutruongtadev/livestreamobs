// Mixin tạm dừng dùng chung cho mọi game nằm ở SDK nền tảng; file này giữ PauseController của server đơn.
export { PausableMixin, makePausable } from '#sdk';

/**
 * Quyết định khi nào game chạy:
 *   - admin bấm Tạm dừng → dừng (lý do 'manual') cho tới khi bấm Tiếp tục
 *   - autoPauseOffline và TikTok chưa kết nối → dừng (lý do 'offline'), lên live là tự chạy
 *   - admin bấm Tiếp tục khi đang offline → chạy luôn (để thử bằng giả lập) cho tới lần mất live kế tiếp
 */
export class PauseController {
  constructor(games, { autoPauseOffline = true, online = false, hold = null } = {}) {
    this.games = games;
    this.hold = hold; // () => lý do giữ dừng (vd 'ghep' khi đang chơi game Ghép) hoặc null
    this.autoPauseOffline = autoPauseOffline;
    this.online = online;
    this.manual = false;
    this.force = false;
    this.sleeping = false; // dừng sau màn chào tạm biệt: lần lên live sau tự chạy lại
    this.apply();
  }

  reason() {
    const h = this.hold?.();
    if (h) return h;
    if (this.manual) return this.sleeping ? 'goodnight' : 'manual';
    if (this.autoPauseOffline && !this.online && !this.force) return 'offline';
    return null;
  }

  /** Áp trạng thái cho mọi game; trả về true nếu có thay đổi. */
  apply() {
    const r = this.reason();
    let changed = false;
    for (const g of this.games) {
      const prev = g.pauseReason;
      const did = r ? g.pause(r) : g.resume();
      if (did || (r && prev !== r)) changed = true;
    }
    return changed;
  }

  setOnline(online) {
    if (online === this.online) return false;
    // vừa lên live lại sau khi chào tạm biệt (đã mất live trước đó) → bỏ tạm dừng
    if (online && this.sleeping) { this.manual = false; this.sleeping = false; }
    // vừa mất live: bỏ chế độ "chạy dù offline" để lần sau tự dừng lại
    if (!online && this.online) this.force = false;
    this.online = online;
    return this.apply();
  }

  pause() { this.manual = true; this.force = false; this.sleeping = false; return this.apply(); }
  /** Tạm dừng sau khi chào tạm biệt: giữ dừng cho tới lần lên live kế tiếp (không cần bấm Tiếp tục). */
  sleep() { this.manual = true; this.force = false; this.sleeping = true; return this.apply(); }
  resume() { this.manual = false; this.sleeping = false; if (!this.online) this.force = true; return this.apply(); }

  status() {
    return { paused: !!this.reason(), reason: this.reason(), manual: this.manual, sleeping: this.sleeping, online: this.online, autoPauseOffline: this.autoPauseOffline };
  }
}

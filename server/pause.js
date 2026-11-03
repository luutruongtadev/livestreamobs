/**
 * Tạm dừng / tiếp tục cho game theo vòng (Đoán từ, Kéo co).
 * Khi dừng: đồng hồ đứng yên, không mở gợi ý, không sang vòng mới (không tốn từ bí mật),
 * bỏ qua bình luận / quà. Khi chạy lại: dời mọi mốc thời gian đi đúng khoảng đã dừng.
 */
export const PausableMixin = {
  /** Thời điểm "hiệu lực" của game: lúc dừng thì đứng yên tại pausedAt. */
  clock() { return this.paused ? this.pausedAt : this.now(); },

  pause(reason = 'manual') {
    if (this.paused) { this.pauseReason = reason; return false; }
    this.paused = true;
    this.pausedAt = this.now();
    this.pauseReason = reason;
    return true;
  },

  resume() {
    if (!this.paused) return false;
    const d = this.now() - this.pausedAt;
    for (const k of ['startedAt', 'endsAt', 'nextAt', 'lastTickAt']) if (typeof this[k] === 'number') this[k] += d;
    if (this.lastGuessAt instanceof Map) for (const [id, t] of this.lastGuessAt) this.lastGuessAt.set(id, t + d);
    this.onResume?.(d);
    this.paused = false;
    this.pausedAt = null;
    this.pauseReason = null;
    return true;
  },
};

export function makePausable(cls) {
  for (const [k, v] of Object.entries(PausableMixin)) cls.prototype[k] = v;
  return cls;
}

/**
 * Quyết định khi nào game chạy:
 *   - admin bấm Tạm dừng → dừng (lý do 'manual') cho tới khi bấm Tiếp tục
 *   - autoPauseOffline và TikTok chưa kết nối → dừng (lý do 'offline'), lên live là tự chạy
 *   - admin bấm Tiếp tục khi đang offline → chạy luôn (để thử bằng giả lập) cho tới lần mất live kế tiếp
 */
export class PauseController {
  constructor(games, { autoPauseOffline = true, online = false } = {}) {
    this.games = games;
    this.autoPauseOffline = autoPauseOffline;
    this.online = online;
    this.manual = false;
    this.force = false;
    this.apply();
  }

  reason() {
    if (this.manual) return 'manual';
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
    // vừa mất live: bỏ chế độ "chạy dù offline" để lần sau tự dừng lại
    if (!online && this.online) this.force = false;
    this.online = online;
    return this.apply();
  }

  pause() { this.manual = true; this.force = false; return this.apply(); }
  resume() { this.manual = false; if (!this.online) this.force = true; return this.apply(); }

  status() {
    return { paused: !!this.reason(), reason: this.reason(), manual: this.manual, online: this.online, autoPauseOffline: this.autoPauseOffline };
  }
}

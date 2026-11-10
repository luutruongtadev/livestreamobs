/**
 * Tạm dừng / tiếp tục cho game theo vòng.
 * Khi dừng: đồng hồ đứng yên, không mở gợi ý, không sang vòng mới, bỏ qua bình luận / quà.
 * Khi chạy lại: dời mọi mốc thời gian đi đúng khoảng đã dừng.
 * Game cần có this.now(); mốc thời gian là các trường startedAt / endsAt / nextAt / lastTickAt (+ lastGuessAt: Map).
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

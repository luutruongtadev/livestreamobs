import { EventEmitter } from 'node:events';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');

function pickUrl(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  return first(img.urlList?.[0], img.urls?.[0], img.url_list?.[0], img.url) || null;
}

/** Chuẩn hoá user từ nhiều phiên bản payload khác nhau của TikTok Live Connector. */
export function normalizeUser(u) {
  if (!u) return null;
  const id = String(first(u.uniqueId, u.displayId, u.userId, u.id, u.secUid, '') || '');
  if (!id) return null;
  return {
    id,
    name: String(first(u.nickname, u.uniqueId, u.displayId, id)).slice(0, 40),
    avatar: first(
      pickUrl(u.profilePicture),
      pickUrl(u.avatarThumb),
      pickUrl(u.avatarMedium),
      typeof u.profilePictureUrl === 'string' ? u.profilePictureUrl : null,
    ) || null,
  };
}

/** Trả về null nếu là quà combo đang chạy (chỉ tính khi kết thúc chuỗi). */
export function normalizeGift(data) {
  const details = data.giftDetails || {};
  const gift = data.gift || {};
  const ext = data.extendedGiftInfo || {};
  const giftType = first(details.giftType, gift.type, ext.type);
  if (giftType === 1 && !data.repeatEnd) return null;
  return {
    type: 'gift',
    user: normalizeUser(data.user),
    giftId: String(first(data.giftId, gift.id, ext.id, '')),
    giftName: first(details.giftName, gift.name, ext.name, 'Quà'),
    giftImage: first(pickUrl(details.giftImage), details.giftPictureUrl, pickUrl(gift.image), pickUrl(gift.icon), pickUrl(ext.image)) || null,
    diamonds: Number(first(details.diamondCount, gift.diamondCount, ext.diamond_count, ext.diamondCount, 1)),
    repeatCount: Number(first(data.repeatCount, data.comboCount, 1)) || 1,
  };
}

/**
 * Quản lý kết nối TikTok Live, tự kết nối lại khi rớt / khi chủ phòng chưa live.
 * Phát ra: 'event' (sự kiện chuẩn hoá), 'status' ({ state, message, roomId, viewers }).
 */
export class TikTokBridge extends EventEmitter {
  constructor({ signApiKey } = {}) {
    super();
    this.signApiKey = signApiKey || undefined;
    this.conn = null;
    this.username = '';
    this.wanted = false;
    this.retryTimer = null;
    this.retryDelay = 5000;
    this.status = { state: 'idle', message: 'Chưa kết nối', username: '', viewers: 0 };
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  async connect(username) {
    username = String(username || '').trim().replace(/^@/, '');
    if (!username) throw new Error('Thiếu TikTok username');
    await this.disconnect();
    this.username = username;
    this.wanted = true;
    this.retryDelay = 5000;
    this.setStatus({ username, viewers: 0 });
    return this.#open();
  }

  async disconnect() {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    const c = this.conn;
    this.conn = null;
    if (c) {
      c.removeAllListeners();
      try { await c.disconnect(); } catch { /* bỏ qua */ }
    }
    this.setStatus({ state: 'idle', message: 'Đã ngắt kết nối' });
  }

  #scheduleRetry(reason) {
    if (!this.wanted) return;
    clearTimeout(this.retryTimer);
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 60000);
    this.setStatus({ state: 'retrying', message: `${reason} — thử lại sau ${Math.round(delay / 1000)}s` });
    this.retryTimer = setTimeout(() => this.#open().catch(() => {}), delay);
  }

  async #open() {
    if (!this.wanted) return;
    this.setStatus({ state: 'connecting', message: `Đang kết nối @${this.username}...` });
    const conn = new TikTokLiveConnection(this.username, {
      signApiKey: this.signApiKey,
      enableExtendedGiftInfo: true,
      processInitialData: false,
    });
    this.conn = conn;
    this.#wire(conn);
    try {
      const state = await conn.connect();
      if (this.conn !== conn) return;
      this.retryDelay = 5000;
      this.setStatus({ state: 'connected', message: `Đã kết nối @${this.username}`, roomId: state?.roomId || null });
    } catch (err) {
      if (this.conn !== conn) return;
      conn.removeAllListeners();
      this.conn = null;
      const msg = err?.name === 'UserOfflineError' || /offline|not live|isn't online/i.test(err?.message || '')
        ? `@${this.username} chưa phát live`
        : `Lỗi kết nối: ${err?.message || err}`;
      this.#scheduleRetry(msg);
    }
  }

  #wire(conn) {
    const emit = (ev) => { if (ev && this.conn === conn) this.emit('event', ev); };

    conn.on(WebcastEvent.CHAT, (d) => emit({ type: 'comment', user: normalizeUser(d.user), text: d.comment || '' }));
    conn.on(WebcastEvent.LIKE, (d) => emit({ type: 'like', user: normalizeUser(d.user), count: Number(d.likeCount) || 1 }));
    conn.on(WebcastEvent.SHARE, (d) => emit({ type: 'share', user: normalizeUser(d.user) }));
    conn.on(WebcastEvent.FOLLOW, (d) => emit({ type: 'follow', user: normalizeUser(d.user) }));
    conn.on(WebcastEvent.GIFT, (d) => emit(normalizeGift(d)));
    conn.on(WebcastEvent.ROOM_USER, (d) => {
      if (this.conn === conn) this.setStatus({ viewers: Number(d.viewerCount) || 0 });
    });
    conn.on(WebcastEvent.STREAM_END, () => {
      if (this.conn !== conn) return;
      conn.removeAllListeners();
      this.conn = null;
      this.#scheduleRetry('Live đã kết thúc');
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.conn !== conn) return;
      conn.removeAllListeners();
      this.conn = null;
      this.#scheduleRetry('Mất kết nối');
    });
    conn.on(ControlEvent.ERROR, (e) => {
      console.warn('[tiktok] error:', e?.info || e?.message || e);
    });
  }
}

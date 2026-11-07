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

/** Thời điểm TikTok tạo tin (ms), từ common.createTime; không có thì null. */
export function sentAtOf(data) {
  const raw = Number(first(data?.common?.createTime, data?.createTime));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw < 1e12 ? raw * 1000 : raw; // có bản trả giây
}

/** Nội dung bình luận: bản v2 để trong `content`, bản cũ trong `comment`. */
export function normalizeComment(data) {
  return { type: 'comment', user: normalizeUser(data.user), text: String(first(data.content, data.comment) ?? ''), sentAt: sentAtOf(data) };
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
  constructor({ signApiKey, stallMs = 90_000, ConnectionClass = TikTokLiveConnection, log = console } = {}) {
    super();
    this.signApiKey = signApiKey || undefined;
    this.ConnectionClass = ConnectionClass;
    this.log = log;
    this.conn = null;
    this.username = '';
    this.wanted = false;
    this.retryTimer = null;
    this.retryDelay = 5000;
    this.stallMs = stallMs; // không nhận được dữ liệu gì trong khoảng này → coi như kết nối "chết lâm sàng", nối lại
    this.watchdog = null;
    this.lastDataAt = 0;
    this.delays = []; // độ trễ TikTok → server của các bình luận gần đây (ms)
    this.roomId = null; // nhớ room id của buổi live để nối lại nhanh, đỡ tốn lượt gọi máy chủ ký (Euler)
    this.status = { state: 'idle', message: 'Chưa kết nối', username: '', viewers: 0, drops: 0, lastDrop: null };
  }

  /** Độ trễ trung bình / lớn nhất của các bình luận gần đây (ms). */
  delayStats() {
    const d = this.delays;
    if (!d.length) return null;
    return { avg: Math.round(d.reduce((a, b) => a + b, 0) / d.length), max: Math.max(...d), n: d.length };
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
    this.roomId = null;
    this.setStatus({ username, viewers: 0, drops: 0, lastDrop: null });
    return this.#open();
  }

  async disconnect() {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    clearInterval(this.watchdog);
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

  /** Bỏ kết nối hiện tại (không ngắt hẳn) rồi hẹn nối lại. */
  #drop(conn, reason, detail = null) {
    if (this.conn !== conn) return;
    clearInterval(this.watchdog);
    conn.removeAllListeners();
    this.conn = null;
    try { Promise.resolve(conn.disconnect()).catch(() => {}); } catch { /* bỏ qua */ }
    const drop = { at: new Date().toISOString(), reason, ...(detail || {}) };
    this.log.warn?.(`[tiktok] rớt kết nối @${this.username}: ${reason}${detail ? ' ' + JSON.stringify(detail) : ''}`);
    this.setStatus({ drops: (this.status.drops || 0) + 1, lastDrop: drop });
    this.#scheduleRetry(reason);
  }

  async #open() {
    if (!this.wanted) return;
    this.setStatus({ state: 'connecting', message: `Đang kết nối @${this.username}...` });
    const conn = new this.ConnectionClass(this.username, {
      signApiKey: this.signApiKey,
      // false: tải danh sách quà (gift/list) phải ký qua Euler gói Business trả phí.
      // Sự kiện quà vẫn có sẵn tên + số kim cương trong giftDetails / gift.
      enableExtendedGiftInfo: false,
      processInitialData: false,
    });
    this.conn = conn;
    this.#wire(conn);
    try {
      // nối lại trong cùng buổi live: dùng luôn room id cũ (bỏ bước dò room id, nhanh hơn, ít bị chặn)
      let state;
      try { state = await conn.connect(this.roomId || undefined); } catch (e) {
        if (!this.roomId || this.conn !== conn) throw e;
        this.roomId = null; // room id cũ hết hạn (buổi live mới) → dò lại
        state = await conn.connect();
      }
      if (this.conn !== conn) return;
      this.retryDelay = 5000;
      this.roomId = state?.roomId || this.roomId;
      this.lastDataAt = Date.now();
      clearInterval(this.watchdog);
      this.watchdog = setInterval(() => {
        if (this.conn === conn && Date.now() - this.lastDataAt > this.stallMs) this.#drop(conn, `Không nhận dữ liệu ${Math.round(this.stallMs / 1000)}s`);
      }, Math.min(10_000, Math.max(20, this.stallMs / 3)));
      this.watchdog.unref?.();
      this.setStatus({ state: 'connected', message: `Đã kết nối @${this.username}`, roomId: state?.roomId || null });
    } catch (err) {
      if (this.conn !== conn) return;
      conn.removeAllListeners();
      this.conn = null;
      if (err?.name === 'UserOfflineError' || /offline|not live|isn't online/i.test(err?.message || '')) this.roomId = null;
      const msg = err?.name === 'UserOfflineError' || /offline|not live|isn't online/i.test(err?.message || '')
        ? `@${this.username} chưa phát live`
        : `Lỗi kết nối: ${err?.message || err}`;
      this.#scheduleRetry(msg);
    }
  }

  #wire(conn) {
    const emit = (ev) => { if (ev && this.conn === conn) this.emit('event', ev); };
    // còn sống: có dữ liệu từ WebSocket (kể cả tin hệ thống) thì cập nhật mốc cho watchdog
    conn.on('websocketData', () => { if (this.conn === conn) this.lastDataAt = Date.now(); });
    // thư viện tắt autoPong và không trả lời ping của máy chủ → tự trả pong, tránh bị TikTok đóng kết nối vì "im lặng"
    conn.on('websocketConnected', (ws) => {
      ws?.on?.('ping', (data) => { try { ws.pong(data); } catch { /* bỏ qua */ } });
    });

    conn.on(WebcastEvent.CHAT, (d) => {
      const ev = normalizeComment(d);
      // đo độ trễ: lúc TikTok tạo bình luận → lúc server nhận được
      if (ev.sentAt) { const ms = Date.now() - ev.sentAt; if (ms > -5000 && ms < 600_000) { this.delays.push(Math.max(0, ms)); if (this.delays.length > 30) this.delays.shift(); } }
      emit(ev);
    });
    conn.on(WebcastEvent.LIKE, (d) => emit({ type: 'like', user: normalizeUser(d.user), count: Number(d.likeCount) || 1 }));
    conn.on(WebcastEvent.SHARE, (d) => emit({ type: 'share', user: normalizeUser(d.user) }));
    conn.on(WebcastEvent.FOLLOW, (d) => emit({ type: 'follow', user: normalizeUser(d.user) }));
    conn.on(WebcastEvent.GIFT, (d) => emit(normalizeGift(d)));
    conn.on(WebcastEvent.MEMBER, (d) => emit({ type: 'member', user: normalizeUser(d.user) }));
    conn.on(WebcastEvent.ROOM_USER, (d) => {
      if (this.conn === conn) this.setStatus({ viewers: Number(d.viewerCount) || 0 });
    });
    conn.on(WebcastEvent.STREAM_END, () => {
      if (this.conn !== conn) return;
      this.roomId = null; // buổi live đã hết, lần sau dò room id mới
      this.#drop(conn, 'Live đã kết thúc');
    });
    conn.on(ControlEvent.DISCONNECTED, (info) => {
      // ghi lại mã đóng + lý do TikTok gửi để biết vì sao rớt
      this.#drop(conn, 'Mất kết nối', info ? { code: info.code, why: info.reason || '' } : null);
    });
    conn.on(ControlEvent.ERROR, (e) => {
      console.warn('[tiktok] error:', e?.info || e?.message || e);
    });
  }
}

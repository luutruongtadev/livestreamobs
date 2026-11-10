// Gateway đa kênh: TikTok → WebSocket → overlay (đường đi nóng), không chứa logic game.
// Mỗi kênh một ChannelRuntime: kết nối TikTok (đếm số overlay), seq + bộ đệm gửi bù, leader / follower,
// định tuyến { t:'g' } tới phần server của game (timeout + giới hạn tần suất), lệnh / giả lập từ dashboard.
import { WebSocketServer } from 'ws';
import { EVENT_TYPES, resolveSettings } from '#sdk';
import { newKey } from './store.js';
import { checkStudio, checkSfx, cleanTrigger, SessionStats } from './studio.js';

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
const str = (v, max) => String(v ?? '').slice(0, max);
const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

/** Sự kiện giả lập từ dashboard → dạng chuẩn hoá (giới hạn độ dài / giá trị). */
export function sanitizeEvent(e = {}) {
  if (!EVENT_TYPES.includes(e.type)) return null;
  const u = e.user || {};
  const out = { type: e.type, user: { id: str(u.id || 'sim', 64), name: str(u.name || 'Người xem thử', 60), avatar: u.avatar ? str(u.avatar, 500) : null } };
  if (e.type === 'comment') out.text = str(e.text, 200);
  if (e.type === 'gift') Object.assign(out, { giftName: str(e.giftName || 'Rose', 40), giftId: num(e.giftId, 0, 1e9, 0), diamonds: num(e.diamonds, 0, 100000, 1), count: num(e.count, 1, 10000, 1), repeatCount: num(e.count, 1, 10000, 1) });
  if (e.type === 'like') out.count = num(e.count, 1, 100000, 1);
  return out;
}

/** Kiểm tra bindings streamer gửi lên (trigger → action) theo manifest của game. */
export function checkBindings(bindings, manifest) {
  if (bindings === null) return null;
  if (!Array.isArray(bindings) || bindings.length > 50) throw new Error('bindings phải là mảng (tối đa 50)');
  const actions = new Set((manifest.actions || []).map((a) => a.id));
  return bindings.map((b, i) => {
    if (!actions.has(b?.action)) throw new Error(`bindings[${i}]: action "${b?.action}" không có trong game`);
    const trigger = cleanTrigger(b.trigger || {}, `bindings[${i}]`);
    const a = manifest.actions.find((x) => x.id === b.action);
    return { id: str(b.id || `${b.action}.${i}`, 40), action: b.action, trigger, label: str(b.label || a.label, 60), icon: b.icon ? str(b.icon, 8) : a.icon || null, params: a.params || {} };
  });
}

class ChannelRuntime {
  constructor(gw, cfg) {
    this.gw = gw;
    this.cfg = cfg;
    this.id = cfg.id;
    this.overlays = new Set();
    this.leader = null;
    this.watchers = new Set();
    this.seq = 0;
    this.buffer = []; // sự kiện gần đây để gửi bù khi overlay nối lại
    this.likes = new Map();
    this.likeTimer = null;
    this.tiktok = null;
    this.tk = { state: 'idle', message: 'Chưa kết nối' };
    this.idleTimer = null;
    this.lastSnap = null;
    this.lat = null;
    this.buckets = new Map();
    this.pendingSave = null;
    this.saveTimer = null;
    this.session = null;
    this.tkDelays = [];
    this.stats = new SessionStats(); // số liệu phiên live cho widget Studio (xu, tim, top tặng quà…)
    this.lb = null; this.lbAt = 0; // BXH tuần cho widget bảng xếp hạng (nạp định kỳ)
  }

  view() {
    const g = this.cfg.games?.[this.cfg.active_game] || {};
    return { id: this.id, username: this.cfg.username, game: this.cfg.active_game, settings: g.settings || {}, bindings: g.bindings ?? null, state: g.state ?? null, studio: this.cfg.studio || {} };
  }
  counts() { const o = [...this.overlays]; return { overlays: o.filter((w) => !w.preview).length, previews: o.filter((w) => w.preview).length, leader: !!this.leader }; }
  notify(msg) { const s = JSON.stringify({ ...msg, channel: this.id }); for (const w of this.watchers) send(w, s); }

  // ---------------- overlay ----------------
  // passive: overlay "chỉ widget" (không chạy game, không làm leader) nhưng vẫn giữ kết nối TikTok như overlay thật
  // play: "cửa sổ chơi" (streamer gõ phím / bấm chuột vào game) → giành vai leader từ overlay đang chạy, mang theo trạng thái mới nhất
  addOverlay(ws, { preview, since, passive = false, play = false }) {
    ws.rt = this;
    ws.preview = preview;
    ws.passive = passive && !preview;
    ws.play = play && !preview && !ws.passive;
    this.overlays.add(ws);
    const role = !preview && !ws.passive && !this.leader ? 'leader' : 'follower';
    if (role === 'leader') this.leader = ws;
    send(ws, { t: 'hello', role, channel: this.view(), seq: this.seq, now: Date.now(), tk: this.tk });
    if (role === 'leader' && since > 0) for (const e of this.buffer) if (e.seq > since) send(ws, { t: 'ev', e, replay: true });
    if (role === 'follower' && this.lastSnap) send(ws, { t: 'snap', s: this.lastSnap });
    send(ws, { t: 'st', st: this.studioData() });
    ws.on('message', (d) => this.onOverlayMsg(ws, d));
    ws.on('close', () => this.removeOverlay(ws));
    clearTimeout(this.idleTimer); this.idleTimer = null;
    if (!preview) this.ensureTiktok();
    if (ws.play && role === 'follower' && this.leader && !this.leader.play) this.handoff(ws);
    this.notify({ t: 'overlays', ...this.counts() });
  }

  /** Xin overlay chính gửi trạng thái mới nhất rồi chuyển vai leader cho cửa sổ chơi (chờ tối đa 1,5 giây). */
  handoff(to) {
    if (this.handoffTo) return;
    this.handoffTo = to;
    send(this.leader, { t: 'handoff' });
    this.handoffTimer = setTimeout(() => this.finishHandoff(null), 1500);
    this.handoffTimer.unref?.();
  }
  finishHandoff(saved) {
    clearTimeout(this.handoffTimer); this.handoffTimer = null;
    const to = this.handoffTo; this.handoffTo = null;
    if (!to || !this.overlays.has(to)) return;
    if (saved) { this.pendingSave = saved; this.flushSave(); }
    const old = this.leader;
    this.leader = to;
    send(to, { t: 'role', role: 'leader', channel: this.view(), seq: this.seq });
    if (old && old !== to && this.overlays.has(old)) send(old, { t: 'role', role: 'follower', channel: this.view(), seq: this.seq });
  }

  removeOverlay(ws) {
    if (!this.overlays.delete(ws)) return;
    if (this.handoffTo === ws) { clearTimeout(this.handoffTimer); this.handoffTo = null; }
    if (this.leader === ws) {
      this.leader = [...this.overlays].find((w) => !w.preview && !w.passive) || null;
      if (this.leader) send(this.leader, { t: 'role', role: 'leader', channel: this.view(), seq: this.seq });
    }
    this.flushSave();
    if (![...this.overlays].some((w) => !w.preview)) {
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => { this.stopTiktok(); this.gw.maybeDrop(this); }, this.gw.idleMs);
      this.idleTimer.unref?.();
    }
    this.notify({ t: 'overlays', ...this.counts() });
  }

  onOverlayMsg(ws, data) {
    let m; try { m = JSON.parse(data); } catch { return; }
    const isLeader = ws === this.leader;
    switch (m.t) {
      case 'ping': send(ws, { t: 'pong', ts: m.ts, now: Date.now() }); break;
      case 'g': this.gameOp(ws, m); break;
      case 'snap':
        if (!isLeader) break;
        this.lastSnap = m.s;
        { const s = JSON.stringify({ t: 'snap', s: m.s }); for (const w of this.overlays) if (w !== ws) send(w, s); for (const w of this.watchers) send(w, s); }
        break;
      case 'fx':
        if (!isLeader || !Array.isArray(m.fx)) break;
        { const s = JSON.stringify({ t: 'fx', fx: m.fx.slice(0, 50) }); for (const w of this.overlays) if (w !== ws) send(w, s); }
        break;
      case 'save':
        if (isLeader && m.handoff && this.handoffTo) { this.finishHandoff(m.game === this.cfg.active_game && m.state !== undefined ? { game: m.game, state: m.state } : null); break; }
        if (isLeader && m.game === this.cfg.active_game) { this.pendingSave = { game: m.game, state: m.state }; this.scheduleSave(); } break;
      case 'in': { // đầu vào tại chỗ từ overlay phụ → overlay chính (giới hạn 30 tin / giây)
        if (isLeader || !this.leader || !m.ev || typeof m.ev !== 'object') break;
        const t = Date.now();
        if (!ws.inWin || t - ws.inWin.t > 1000) ws.inWin = { t, n: 0 };
        if (++ws.inWin.n > 30) break;
        const ev = JSON.stringify(m.ev);
        if (ev.length <= 1000) send(this.leader, `{"t":"in","ev":${ev}}`);
        break;
      }
      case 'round': if (isLeader) this.gw.store.recordRound(this.id, this.cfg.active_game, m.r ?? null).catch((e) => this.gw.log.warn?.(`[gateway] ghi ván lỗi: ${e.message}`)); break;
      case 'pts': if (isLeader && m.user?.id) this.gw.store.addPoints(this.id, this.cfg.active_game, { id: str(m.user.id, 64), name: str(m.user.name, 60), avatar: m.user.avatar ? str(m.user.avatar, 500) : null }, num(m.n, -1e6, 1e6), !!m.win); break;
      case 'lat': if (isLeader) { this.lat = { ...m.lat, tiktok: this.tkStats() }; this.notify({ t: 'lat', lat: this.lat }); } break;
      case 'err': this.notify({ t: 'err', err: { where: str(m.err?.where, 40), message: str(m.err?.message, 300), crashed: !!m.err?.crashed } }); break;
      default:
    }
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flushSave(), this.gw.saveMs);
    this.saveTimer.unref?.();
  }
  flushSave() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    const p = this.pendingSave; this.pendingSave = null;
    if (!p) return;
    if (this.cfg.games) (this.cfg.games[p.game] ||= { settings: {}, bindings: null }).state = p.state;
    this.gw.store.saveState(this.id, p.game, p.state).catch((e) => this.gw.log.warn?.(`[gateway] lưu trạng thái game lỗi: ${e.message}`));
  }

  /** Overlay gọi phần server của game: { t:'g', game, op, id, p } → { t:'g', id, r } | { t:'g', id, err }. */
  async gameOp(ws, m) {
    const reply = (x) => send(ws, { t: 'g', id: m.id, ...x });
    const srv = this.gw.gameServers[m.game];
    if (m.game !== this.cfg.active_game) return reply({ err: 'Game không phải game đang chọn của kênh' });
    if (!srv?.ops || typeof srv.ops[m.op] !== 'function' || !Object.hasOwn(srv.ops, m.op)) return reply({ err: `Game "${m.game}" không có op "${str(m.op, 40)}"` });
    // giới hạn tần suất theo (kênh, game): token bucket
    const { perSec, burst } = this.gw.opRate;
    const b = this.buckets.get(m.game) || { tokens: burst, at: Date.now() };
    const t = Date.now();
    b.tokens = Math.min(burst, b.tokens + ((t - b.at) / 1000) * perSec); b.at = t;
    if (b.tokens < 1) { this.buckets.set(m.game, b); return reply({ err: 'Quá nhiều yêu cầu, thử lại sau' }); }
    b.tokens -= 1; this.buckets.set(m.game, b);
    let timer;
    try {
      const r = await Promise.race([
        Promise.resolve().then(() => srv.ops[m.op](m.p ?? {}, { id: this.id })),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Quá thời gian')), this.gw.opTimeoutMs); }),
      ]);
      reply({ r: r ?? null });
    } catch (e) {
      reply({ err: str(e?.message || e, 200) });
    } finally { clearTimeout(timer); }
  }

  // ---------------- TikTok ----------------
  ensureTiktok() {
    if (this.tiktok || !this.cfg.username || !this.gw.bridgeFactory) return;
    const bridge = this.gw.bridgeFactory();
    this.tiktok = bridge;
    bridge.on('event', (e) => this.ingest(e));
    bridge.on('status', (s) => {
      this.tk = { state: s.state, message: s.message, username: s.username, viewers: s.viewers || 0, drops: s.drops || 0 };
      const msg = JSON.stringify({ t: 'tk', tk: this.tk });
      for (const w of this.overlays) send(w, msg);
      this.notify({ t: 'tk', tk: this.tk });
      if (s.state === 'connected' && !this.session) this.gw.store.startSession(this.id).then((x) => { this.session = x; }).catch(() => {});
    });
    Promise.resolve(bridge.connect(this.cfg.username)).catch((e) => {
      this.tk = { state: 'error', message: str(e?.message || e, 200) };
      this.notify({ t: 'tk', tk: this.tk });
    });
  }

  stopTiktok() {
    const b = this.tiktok;
    this.tiktok = null;
    if (b) { b.removeAllListeners?.(); Promise.resolve(b.disconnect?.()).catch(() => {}); }
    this.tk = { state: 'idle', message: 'Chưa kết nối' };
    if (this.session) { this.gw.store.endSession(this.session).catch(() => {}); this.session = null; }
    this.notify({ t: 'tk', tk: this.tk });
  }

  tkStats() {
    const d = [...this.tkDelays].sort((a, b) => a - b);
    return d.length ? { p50: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)], n: d.length } : null;
  }

  /** Sự kiện vào (TikTok hoặc giả lập). Tim gộp theo người trong likeFlushMs; còn lại gửi NGAY. */
  ingest(e, { sim = false } = {}) {
    if (!e?.type) return;
    if (e.sentAt && !sim) { const d = Date.now() - e.sentAt; if (d > -5000 && d < 600_000) { this.tkDelays.push(Math.max(0, d)); if (this.tkDelays.length > 200) this.tkDelays.shift(); } }
    if (e.type === 'like') {
      const k = e.user?.id ?? '';
      const cur = this.likes.get(k);
      if (cur) cur.count += Math.max(1, Number(e.count) || 1);
      else this.likes.set(k, { ...e, count: Math.max(1, Number(e.count) || 1), sim });
      if (!this.likeTimer) { this.likeTimer = setTimeout(() => this.flushLikes(), this.gw.likeFlushMs); this.likeTimer.unref?.(); }
      return;
    }
    this.emitEvent(e, sim);
  }

  flushLikes() {
    this.likeTimer = null;
    const list = [...this.likes.values()];
    this.likes.clear();
    for (const e of list) { const { sim, ...rest } = e; this.emitEvent(rest, sim); }
  }

  emitEvent(e, sim) {
    const ev = { ...e, seq: ++this.seq, gwAt: Date.now(), ...(sim ? { sim: true } : {}) };
    this.stats.add(ev);
    this.buffer.push(ev);
    const cut = ev.gwAt - this.gw.replayMs;
    while (this.buffer.length && (this.buffer[0].gwAt < cut || this.buffer.length > 2000)) this.buffer.shift();
    const msg = JSON.stringify({ t: 'ev', e: ev });
    send(this.leader, msg);
    if (this.watchers.size && ev.type !== 'like') for (const w of this.watchers) send(w, msg);
    // overlay khác (xem trước, chỉ widget, overlay phụ) không nhận 'ev' → bản rút gọn cho widget thông báo / bình luận
    if (ev.type !== 'like' && this.overlays.size > (this.leader ? 1 : 0)) {
      const sx = JSON.stringify({ t: 'sx', e: { type: ev.type, user: ev.user, giftName: ev.giftName, diamonds: ev.diamonds, count: ev.count ?? ev.repeatCount, text: ev.text, seq: ev.seq } });
      for (const w of this.overlays) if (w !== this.leader) send(w, sx);
    }
  }

  /** Dữ liệu cho widget Studio: số liệu phiên + BXH tuần. */
  studioData() { return { ...this.stats.view(), lb: this.lb }; }
  needsWeekBoard() { return (this.cfg.studio?.widgets || []).some((w) => w.type === 'leaderboard' && w.config?.source === 'week'); }
  /** Gọi định kỳ (~2 lần / giây): phát số liệu khi đổi; nạp BXH tuần mỗi 30 giây nếu có widget cần. */
  async studioTick(now = Date.now()) {
    if (!this.overlays.size && !this.watchers.size) return;
    if (this.needsWeekBoard() && now - this.lbAt > 30_000) {
      this.lbAt = now;
      try {
        const rows = await this.gw.store.leaderboard(this.id, null);
        this.lb = (rows || []).slice(0, 10).map((r) => ({ name: r.name || r.viewer || r.viewer_id, avatar: r.avatar || null, points: r.points }));
        this.stats.dirty = true;
      } catch (e) { this.gw.log.warn?.(`[gateway] BXH tuần lỗi: ${e.message}`); }
    }
    if (!this.stats.dirty) return;
    this.stats.dirty = false;
    const msg = JSON.stringify({ t: 'st', st: this.studioData() });
    for (const w of this.overlays) send(w, msg);
    if (this.watchers.size) this.notify({ t: 'st', st: this.studioData() });
  }

  /** Studio đổi (dashboard lưu) → overlay vẽ lại widget / luật âm thanh, KHÔNG nạp lại game. */
  setStudio(studio) {
    this.cfg = { ...this.cfg, studio };
    this.lbAt = 0;
    const msg = JSON.stringify({ t: 'studio', studio });
    for (const w of this.overlays) send(w, msg);
  }

  /** Cấu hình kênh đổi (game / cài đặt / username) → báo overlay nạp lại. */
  async refresh({ reconnect = false } = {}) {
    const fresh = await this.gw.store.getChannel(this.id);
    if (!fresh) return;
    this.cfg = fresh;
    const msg = JSON.stringify({ t: 'cfg', channel: this.view() });
    for (const w of this.overlays) send(w, msg);
    if (reconnect) { this.stopTiktok(); if ([...this.overlays].some((w) => !w.preview)) this.ensureTiktok(); }
  }

  close(code = 4000, reason = 'closed') { for (const w of [...this.overlays]) w.close(code, reason); this.stopTiktok(); this.flushSave(); }
}

export class Gateway {
  constructor({ store, catalog = [], widgets = [], gameServers = {}, bridgeFactory = null, log = console, idleMs = 120_000, replayMs = 10_000, likeFlushMs = 200, saveMs = 3000, opTimeoutMs = 25_000, opRate = { perSec: 20, burst: 60 }, pingMs = 15_000, studioMs = 500 } = {}) {
    Object.assign(this, { store, catalog, widgets, gameServers, bridgeFactory, log, idleMs, replayMs, likeFlushMs, saveMs, opTimeoutMs, opRate, pingMs });
    this.studioTimer = setInterval(() => { for (const rt of this.runtimes.values()) rt.studioTick().catch(() => {}); }, studioMs);
    this.studioTimer.unref?.();
    this.runtimes = new Map(); // channel id → ChannelRuntime
    this.byId = new Map(catalog.map((g) => [g.id, g]));
  }

  attach(server) {
    this.wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false, maxPayload: 512 * 1024 });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req).catch((e) => { this.log.warn?.(`[gateway] ${e.message}`); ws.close(1011, 'error'); }));
    this.heartbeat = setInterval(() => {
      for (const ws of this.wss.clients) { if (ws.alive === false) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
    }, this.pingMs);
    this.heartbeat.unref?.();
    return this;
  }

  runtime(cfg) {
    let rt = this.runtimes.get(cfg.id);
    if (!rt) { rt = new ChannelRuntime(this, cfg); this.runtimes.set(cfg.id, rt); } else rt.cfg = cfg;
    return rt;
  }
  maybeDrop(rt) { if (!rt.overlays.size && !rt.watchers.size && !rt.tiktok) this.runtimes.delete(rt.id); }

  async onConnection(ws, req) {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    const u = new URL(req.url, 'http://x');
    const key = u.searchParams.get('overlay');
    if (key) {
      const ch = await this.store.getChannelByKey(str(key, 80));
      if (!ch) return ws.close(4004, 'Link overlay không đúng hoặc đã đổi');
      return this.runtime(ch).addOverlay(ws, { preview: u.searchParams.get('preview') === '1', passive: u.searchParams.get('passive') === '1', play: u.searchParams.get('play') === '1', since: Number(u.searchParams.get('since')) || 0 });
    }
    if (u.searchParams.get('role') === 'dashboard') return this.onDashboard(ws);
    ws.close(4001, 'unauthorized');
  }

  // ---------------- dashboard ----------------
  onDashboard(ws) {
    ws.watching = new Set();
    const authTimer = setTimeout(() => { if (!ws.user) ws.close(4001, 'auth timeout'); }, 10_000);
    ws.on('close', () => { clearTimeout(authTimer); for (const id of ws.watching) { const rt = this.runtimes.get(id); if (rt) { rt.watchers.delete(ws); this.maybeDrop(rt); } } });
    ws.on('message', async (data) => {
      let m; try { m = JSON.parse(data); } catch { return; }
      if (!ws.user) {
        if (m.t !== 'auth') return;
        const user = await this.store.verifyUser(str(m.token, 4096)).catch(() => null);
        if (!user) return ws.close(4001, 'Phiên đăng nhập không hợp lệ');
        clearTimeout(authTimer);
        ws.user = user;
        return send(ws, { t: 'authed', user, store: this.store.kind, games: this.catalog, widgets: this.widgets });
      }
      if (m.t === 'ping') return send(ws, { t: 'pong', ts: m.ts, now: Date.now() });
      if (m.t !== 'req') return;
      try { send(ws, { t: 'res', id: m.id, r: await this.dashOp(ws, str(m.op, 20), m.p || {}) }); } catch (e) { send(ws, { t: 'res', id: m.id, err: str(e?.message || e, 300) }); }
    });
  }

  async owned(ws, channelId) {
    const rt = this.runtimes.get(channelId);
    const ch = rt?.cfg?.owner_id ? rt.cfg : await this.store.getChannel(str(channelId, 64));
    if (!ch || ch.owner_id !== ws.user.id) throw new Error('Không tìm thấy kênh');
    return ch;
  }

  game(id) { const g = this.byId.get(id); if (!g || g.status === 'retired') throw new Error(`Không có game "${id}"`); return g; }

  async dashOp(ws, op, p) {
    if (op === 'channels') return this.store.listChannels(ws.user.id);
    if (op === 'create') { const game = this.game(p.game || 'doantu'); return this.store.createChannel(ws.user.id, p.username, game.id); }
    const ch = await this.owned(ws, p.channel);
    const rt = () => this.runtime(ch);
    switch (op) {
      case 'get': return { channel: ch, ...(this.runtimes.get(ch.id) ? { tk: this.runtimes.get(ch.id).tk, ...this.runtimes.get(ch.id).counts() } : {}) };
      case 'update': {
        const patch = {};
        if (p.username != null) patch.username = p.username;
        if (p.game != null) patch.active_game = this.game(p.game).id;
        const c = await this.store.updateChannel(ch.id, patch);
        if (this.runtimes.has(ch.id)) await rt().refresh({ reconnect: patch.username != null && patch.username !== ch.username });
        return c;
      }
      case 'config': {
        const g = this.game(p.game || ch.active_game);
        const cfg = {};
        if (p.settings !== undefined) { const r = resolveSettings(g.schema, p.settings || {}); if (r.errors.length) throw new Error(r.errors[0]); cfg.settings = r.settings; }
        if (p.bindings !== undefined) cfg.bindings = checkBindings(p.bindings, g);
        const c = await this.store.setGameConfig(ch.id, g.id, cfg);
        if (this.runtimes.has(ch.id) && g.id === ch.active_game) await rt().refresh();
        return c;
      }
      case 'rotate': {
        const c = await this.store.updateChannel(ch.id, { overlay_key: newKey() });
        const r = this.runtimes.get(ch.id);
        if (r) { for (const w of [...r.overlays]) w.close(4004, 'Link overlay đã đổi'); r.cfg = c; }
        return c;
      }
      case 'delete': { this.runtimes.get(ch.id)?.close(4004, 'Kênh đã xoá'); this.runtimes.delete(ch.id); await this.store.deleteChannel(ch.id); return { ok: true }; }
      case 'watch': {
        const r = rt();
        r.watchers.add(ws); ws.watching.add(ch.id);
        return { tk: r.tk, ...r.counts(), snap: r.lastSnap, lat: r.lat, st: r.studioData() };
      }
      case 'unwatch': { const r = this.runtimes.get(ch.id); r?.watchers.delete(ws); ws.watching.delete(ch.id); if (r) this.maybeDrop(r); return { ok: true }; }
      case 'cmd': {
        const r = this.runtimes.get(ch.id);
        if (!r?.leader) throw new Error('Chưa mở overlay của kênh (OBS / LIVE Studio)');
        send(r.leader, { t: 'cmd', id: str(p.id, 40), args: p.args && typeof p.args === 'object' ? p.args : {} });
        return { ok: true };
      }
      case 'sim': {
        const e = sanitizeEvent(p.e);
        if (!e) throw new Error('Sự kiện giả lập không hợp lệ');
        const r = rt();
        const n = Math.round(num(p.repeat, 1, 200, 1));
        for (let i = 0; i < n; i++) r.ingest(n > 1 ? { ...e, user: { ...e.user, id: `${e.user.id}-${i}`, name: `${e.user.name} ${i + 1}` } } : e, { sim: true });
        return { ok: true, seq: r.seq };
      }
      case 'tiktok': {
        const r = rt();
        if (p.op === 'disconnect') r.stopTiktok(); else { r.stopTiktok(); r.ensureTiktok(); }
        return { tk: r.tk };
      }
      case 'leaderboard': return this.store.leaderboard(ch.id, p.game || null);
      case 'studio': {
        const studio = checkStudio(p.studio, this.widgets);
        const c = await this.store.updateChannel(ch.id, { studio });
        this.runtimes.get(ch.id)?.setStudio(studio);
        return c;
      }
      case 'sfx': { // soundboard: overlay đang mở phát ngay (tối đa 5 âm / giây / kênh)
        const s = checkSfx(p);
        const r = this.runtimes.get(ch.id);
        if (!r?.overlays.size) throw new Error('Chưa mở overlay của kênh (OBS / LIVE Studio)');
        const now = Date.now();
        r.sfxAt = (r.sfxAt || []).filter((t) => now - t < 1000);
        if (r.sfxAt.length >= 5) throw new Error('Bấm chậm lại một chút');
        r.sfxAt.push(now);
        const msg = JSON.stringify({ t: 'sfx', ...s });
        for (const w of r.overlays) send(w, msg);
        return { ok: true };
      }
      case 'stats-reset': { const r = rt(); r.stats.reset(); return { ok: true, st: r.studioData() }; }
      default: throw new Error(`Không có thao tác "${op}"`);
    }
  }

  async close() {
    clearInterval(this.heartbeat);
    clearInterval(this.studioTimer);
    for (const rt of this.runtimes.values()) rt.close(1001, 'gateway dừng');
    this.wss?.close();
    for (const s of Object.values(this.gameServers)) { try { s.save?.(); } catch { /* bỏ qua */ } }
    await this.store.close?.();
  }
}

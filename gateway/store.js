// Lưu trữ của nền tảng (ngoài đường đi nóng): kênh, cấu hình game, trạng thái game, ván, BXH.
//   SupabaseStore — PostgREST + Auth của Supabase qua fetch (không cần thư viện); dùng khi có SUPABASE_URL + SUPABASE_SECRET_KEY
//   FileStore     — file JSON, cho chạy thử trên máy / test; đăng nhập bằng DEV token
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const newKey = () => crypto.randomBytes(18).toString('hex');
const clean = (s, max = 40) => String(s ?? '').trim().replace(/^@/, '').slice(0, max);
const USERNAME = /^[A-Za-z0-9._]{2,30}$/;

/** Thứ Hai của tuần theo giờ Việt Nam (YYYY-MM-DD) — khoá BXH tuần. */
export function weekOf(ms = Date.now()) {
  const d = new Date(ms + 7 * 3600_000); // UTC+7
  const day = (d.getUTCDay() + 6) % 7; // 0 = thứ Hai
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function checkUsername(u) {
  const v = clean(u, 30);
  if (!USERNAME.test(v)) throw new Error('Username TikTok không hợp lệ (chữ, số, dấu chấm, gạch dưới; 2–30 ký tự)');
  return v;
}

/** Gom điểm theo (kênh, game, tuần, người xem) rồi ghi theo lô — không ghi DB mỗi lần có người trả lời đúng. */
class PointsBuffer {
  constructor(flush, ms = 5000) { this.map = new Map(); this.flushFn = flush; this.timer = setInterval(() => this.flush(), ms); this.timer.unref?.(); }
  add(channelId, gameId, user, n, win) {
    const k = `${channelId}|${gameId}|${user.id}`;
    const e = this.map.get(k) || { channelId, gameId, week: weekOf(), viewer: String(user.id), name: clean(user.name, 60), avatar: user.avatar || null, points: 0, wins: 0 };
    e.points += Math.round(Number(n) || 0); if (win) e.wins++;
    this.map.set(k, e);
  }
  async flush() { const rows = [...this.map.values()]; this.map.clear(); if (rows.length) await this.flushFn(rows).catch(() => {}); }
  stop() { clearInterval(this.timer); return this.flush(); }
}

// ---------------------------------------------------------------- FileStore
export class FileStore {
  constructor({ file = null, devToken = '' } = {}) {
    this.file = file;
    this.devToken = devToken;
    this.db = { channels: {}, rounds: [], leaderboard: {} };
    try { if (file) this.db = { ...this.db, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* chưa có */ }
    this.points = new PointsBuffer(async (rows) => { for (const r of rows) { const k = `${r.channelId}|${r.gameId}|${r.week}|${r.viewer}`; const o = this.db.leaderboard[k] || { ...r, points: 0, wins: 0 }; o.points += r.points; o.wins += r.wins; o.name = r.name; this.db.leaderboard[k] = o; } this.save(); });
  }
  get kind() { return 'file'; }
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.db));
  }
  async verifyUser(token) {
    if (!this.devToken || !token) return null;
    const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
    return crypto.timingSafeEqual(h(token), h(this.devToken)) ? { id: 'dev', email: 'dev@local' } : null;
  }
  async getChannelByKey(key) { return Object.values(this.db.channels).find((c) => c.overlay_key === key) || null; }
  async getChannel(id) { return this.db.channels[id] || null; }
  async listChannels(owner) { return Object.values(this.db.channels).filter((c) => c.owner_id === owner); }
  async createChannel(owner, username, game = 'doantu') {
    const c = { id: crypto.randomUUID(), owner_id: owner, platform: 'tiktok', username: checkUsername(username), overlay_key: newKey(), active_game: game, games: {}, created_at: new Date().toISOString() };
    this.db.channels[c.id] = c; this.save(); return c;
  }
  async updateChannel(id, patch) {
    const c = this.db.channels[id]; if (!c) return null;
    if (patch.username != null) c.username = checkUsername(patch.username);
    if (patch.active_game != null) c.active_game = String(patch.active_game);
    if (patch.overlay_key != null) c.overlay_key = patch.overlay_key;
    this.save(); return c;
  }
  async deleteChannel(id) { delete this.db.channels[id]; this.save(); }
  async setGameConfig(id, gameId, { settings, bindings } = {}) {
    const c = this.db.channels[id]; if (!c) return null;
    const g = (c.games[gameId] ||= { settings: {}, bindings: null, state: null });
    if (settings !== undefined) g.settings = settings;
    if (bindings !== undefined) g.bindings = bindings;
    this.save(); return c;
  }
  async saveState(id, gameId, state) { const c = this.db.channels[id]; if (!c) return; (c.games[gameId] ||= { settings: {}, bindings: null }).state = state; this.save(); }
  async recordRound(id, gameId, result) { this.db.rounds.push({ channel_id: id, game_id: gameId, result, created_at: new Date().toISOString() }); this.db.rounds = this.db.rounds.slice(-5000); this.save(); }
  addPoints(id, gameId, user, n, win = false) { this.points.add(id, gameId, user, n, win); }
  async leaderboard(id, gameId = null, week = weekOf()) {
    await this.points.flush();
    return Object.values(this.db.leaderboard).filter((r) => r.channelId === id && r.week === week && (!gameId || r.gameId === gameId)).sort((a, b) => b.points - a.points).slice(0, 50);
  }
  async startSession(id) { return { id: `${id}:${Date.now()}`, started: Date.now() }; }
  async endSession() {}
  async close() { await this.points.stop(); this.save(); }
}

// ---------------------------------------------------------------- SupabaseStore
export class SupabaseStore {
  /** secretKey: sb_secret_… (mới) hoặc service_role JWT (cũ). publishableKey: dùng khi kiểm tra token người dùng. */
  constructor({ url, secretKey, publishableKey = null, fetchImpl = fetch, log = console } = {}) {
    this.url = String(url).replace(/\/+$/, '');
    this.key = secretKey;
    this.pubKey = publishableKey || secretKey;
    this.fetch = fetchImpl;
    this.log = log;
    this.userCache = new Map(); // token → { user, until }
    this.points = new PointsBuffer((rows) => Promise.all(rows.map((r) => this.rpc('add_points', { p_channel: r.channelId, p_game: r.gameId, p_week: r.week, p_viewer: r.viewer, p_name: r.name, p_avatar: r.avatar, p_points: r.points, p_wins: r.wins }))));
  }
  get kind() { return 'supabase'; }

  headers(extra = {}) {
    // khoá mới (sb_secret_) chỉ gửi ở apikey; khoá cũ dạng JWT gửi cả Authorization
    return { apikey: this.key, ...(String(this.key).startsWith('eyJ') ? { Authorization: `Bearer ${this.key}` } : {}), 'Content-Type': 'application/json', ...extra };
  }

  async req(method, p, body, extra = {}) {
    const res = await this.fetch(`${this.url}${p}`, { method, headers: this.headers(extra), body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${method} ${p.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  rest(method, table, query = '', body, prefer) { return this.req(method, `/rest/v1/${table}${query ? `?${query}` : ''}`, body, prefer ? { Prefer: prefer } : {}); }
  rpc(fn, args) { return this.req('POST', `/rest/v1/rpc/${fn}`, args); }

  /** Token đăng nhập của dashboard (Supabase Auth) → người dùng; cache 60 giây. */
  async verifyUser(token) {
    if (!token) return null;
    const hit = this.userCache.get(token);
    if (hit && hit.until > Date.now()) return hit.user;
    const res = await this.fetch(`${this.url}/auth/v1/user`, { headers: { apikey: this.pubKey, Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const u = await res.json();
    const user = u?.id ? { id: u.id, email: u.email || null } : null;
    if (user) this.userCache.set(token, { user, until: Date.now() + 60_000 });
    if (this.userCache.size > 2000) this.userCache.delete(this.userCache.keys().next().value);
    return user;
  }

  /** channels + channel_games + game_state → một object kênh như FileStore. */
  async hydrate(c) {
    if (!c) return null;
    const [games, states] = await Promise.all([
      this.rest('GET', 'channel_games', `channel_id=eq.${c.id}&select=game_id,settings,bindings`),
      this.rest('GET', 'game_state', `channel_id=eq.${c.id}&select=game_id,state`),
    ]);
    c.games = {};
    for (const g of games || []) c.games[g.game_id] = { settings: g.settings || {}, bindings: g.bindings ?? null, state: null };
    for (const s of states || []) (c.games[s.game_id] ||= { settings: {}, bindings: null }).state = s.state;
    return c;
  }
  async one(query) { const rows = await this.rest('GET', 'channels', `${query}&select=*`); return this.hydrate(rows?.[0] || null); }
  getChannelByKey(key) { return /^[a-f0-9]{16,64}$/.test(key) ? this.one(`overlay_key=eq.${key}`) : Promise.resolve(null); }
  getChannel(id) { return /^[0-9a-f-]{36}$/.test(id) ? this.one(`id=eq.${id}`) : Promise.resolve(null); }
  async listChannels(owner) { return (await this.rest('GET', 'channels', `owner_id=eq.${owner}&select=*&order=created_at`)) || []; }
  async createChannel(owner, username, game = 'doantu') {
    const [c] = await this.rest('POST', 'channels', '', { owner_id: owner, username: checkUsername(username), overlay_key: newKey(), active_game: game }, 'return=representation');
    return this.hydrate(c);
  }
  async updateChannel(id, patch) {
    const body = {};
    if (patch.username != null) body.username = checkUsername(patch.username);
    if (patch.active_game != null) body.active_game = String(patch.active_game);
    if (patch.overlay_key != null) body.overlay_key = patch.overlay_key;
    await this.rest('PATCH', 'channels', `id=eq.${id}`, body);
    return this.getChannel(id);
  }
  async deleteChannel(id) { await this.rest('DELETE', 'channels', `id=eq.${id}`); }
  async setGameConfig(id, gameId, { settings, bindings } = {}) {
    const row = { channel_id: id, game_id: gameId, updated_at: new Date().toISOString() };
    if (settings !== undefined) row.settings = settings;
    if (bindings !== undefined) row.bindings = bindings;
    await this.rest('POST', 'channel_games', 'on_conflict=channel_id,game_id', row, 'resolution=merge-duplicates');
    return this.getChannel(id);
  }
  async saveState(id, gameId, state) { await this.rest('POST', 'game_state', 'on_conflict=channel_id,game_id', { channel_id: id, game_id: gameId, state, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates'); }
  async recordRound(id, gameId, result) { await this.rest('POST', 'rounds', '', { channel_id: id, game_id: gameId, result }); }
  addPoints(id, gameId, user, n, win = false) { this.points.add(id, gameId, user, n, win); }
  async leaderboard(id, gameId = null, week = weekOf()) {
    await this.points.flush();
    // game_id '' = dòng tổng mọi game (add_points ghi cả dòng của game lẫn dòng tổng)
    return (await this.rest('GET', 'leaderboard', `channel_id=eq.${id}&week=eq.${week}&game_id=eq.${encodeURIComponent(gameId || '')}&order=points.desc&limit=50&select=viewer_id,name,avatar,points,wins,game_id`)) || [];
  }
  async startSession(id) { const [s] = await this.rest('POST', 'live_sessions', '', { channel_id: id }, 'return=representation'); return { id: s.id, started: Date.now() }; }
  async endSession(s) { if (s?.id) await this.rest('PATCH', 'live_sessions', `id=eq.${s.id}`, { ended_at: new Date().toISOString(), minutes: Math.round((Date.now() - s.started) / 60_000) }); }
  async close() { await this.points.stop(); }
}

/** Chọn store theo biến môi trường. */
export function storeFromEnv(env, { dataDir, log = console } = {}) {
  if (env.SUPABASE_URL && env.SUPABASE_SECRET_KEY) {
    return new SupabaseStore({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY, publishableKey: env.SUPABASE_PUBLISHABLE_KEY, log });
  }
  log.warn?.('[gateway] Chưa có SUPABASE_URL / SUPABASE_SECRET_KEY → lưu vào file (chỉ để chạy thử), đăng nhập dashboard bằng DEV token (ADMIN_TOKEN)');
  return new FileStore({ file: path.join(dataDir, 'platform.json'), devToken: env.GATEWAY_DEV_TOKEN || env.ADMIN_TOKEN || '' });
}

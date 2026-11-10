import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { Gateway, sanitizeEvent, checkBindings } from '../gateway/gateway.js';
import { FileStore, weekOf } from '../gateway/store.js';
import { buildCatalog, createHttpHandler, resolveStatic } from '../gateway/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = buildCatalog(path.join(ROOT, 'games'));
const DEV = 'dev-token-123456';

class FakeBridge extends EventEmitter {
  constructor(log) { super(); this.log = log; }
  async connect(u) { this.log.push(['connect', u]); this.emit('status', { state: 'connected', message: `Đã kết nối @${u}`, username: u }); }
  async disconnect() { this.log.push(['disconnect']); }
}

async function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  const store = new FileStore({ file: path.join(dir, 'p.json'), devToken: DEV });
  const bridges = [];
  const log = [];
  const gameServers = opts.gameServers ?? { doantu: { ops: { score: async (p) => ({ score: 42, word: p.word }), slow: () => new Promise(() => {}) } } };
  const gw = new Gateway({ store, catalog, gameServers, log: {}, bridgeFactory: () => { const b = new FakeBridge(log); bridges.push(b); return b; }, idleMs: 80, replayMs: 10_000, likeFlushMs: 30, saveMs: 20, opTimeoutMs: 100, ...opts.gw });
  const server = http.createServer(createHttpHandler({ root: ROOT, catalog, publicConfig: { store: 'file' } }));
  gw.attach(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `127.0.0.1:${server.address().port}`;
  const ch = await store.createChannel('dev', 'kenh_thu', 'doantu');
  return { gw, store, server, base, ch, bridges, log, close: async () => { await gw.close(); server.close(); } };
}

/** Client WebSocket có hàng đợi tin nhắn: next(pred) chờ tin khớp. */
function client(url) {
  const ws = new WebSocket(url);
  const box = [];
  const waiters = [];
  ws.on('message', (d) => { const m = JSON.parse(d); const i = waiters.findIndex((w) => w.pred(m)); if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else box.push(m); });
  const closed = new Promise((r) => ws.on('close', (code, reason) => r({ code, reason: String(reason) })));
  return {
    ws, box, closed,
    open: () => new Promise((r, j) => { ws.once('open', r); ws.once('error', j); }),
    send: (m) => ws.send(JSON.stringify(m)),
    next(pred = () => true, ms = 2000) {
      const i = box.findIndex(pred);
      if (i >= 0) return Promise.resolve(box.splice(i, 1)[0]);
      return new Promise((resolve, reject) => { const w = { pred, resolve }; waiters.push(w); setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); reject(new Error('hết giờ chờ tin nhắn')); } }, ms); });
    },
    close: () => ws.close(),
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('HTTP: chỉ phục vụ phần công khai của game / SDK, chặn server/, node/, testing/, đi ngược thư mục', async () => {
  const s = await setup();
  const get = (p) => new Promise((r) => http.get(`http://${s.base}${p}`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => r({ code: res.statusCode, body: b })); }));
  try {
    assert.equal((await get(`/o/${s.ch.overlay_key}`)).code, 200);
    assert.equal((await get('/sdk/index.js')).code, 200);
    assert.equal((await get('/games/doantu/manifest.json')).code, 200);
    assert.equal((await get('/games/doantu/engine/index.js')).code, 200);
    for (const p of ['/games/doantu/server/index.js', '/games/doantu/test/doantu.test.js', '/sdk/node/loader.js', '/sdk/testing/conformance.js', '/web/../package.json', '/web/%2e%2e/.env', '/games/../.env']) assert.equal((await get(p)).code, 404, p);
    const games = JSON.parse((await get('/api/games')).body);
    assert.ok(games.some((g) => g.id === 'doantu') && games.some((g) => g.id === 'memory'));
    assert.ok(games.every((g) => !('secrets' in g)), 'không lộ tên secret');
    assert.equal(resolveStatic('/o/abc'), null, 'mã overlay quá ngắn');
  } finally { await s.close(); }
});

test('overlay: leader nhận sự kiện TikTok ngay (seq, gwAt), overlay thứ 2 là follower, leader rời → follower lên thay', async () => {
  const s = await setup();
  try {
    const a = client(`ws://${s.base}/ws?overlay=${s.ch.overlay_key}`); await a.open();
    const ha = await a.next((m) => m.t === 'hello');
    assert.equal(ha.role, 'leader');
    assert.equal(ha.channel.game, 'doantu');
    await sleep(10);
    assert.deepEqual(s.log[0], ['connect', 'kenh_thu'], 'mở overlay → kết nối TikTok');
    const b = client(`ws://${s.base}/ws?overlay=${s.ch.overlay_key}`); await b.open();
    assert.equal((await b.next((m) => m.t === 'hello')).role, 'follower');
    s.bridges[0].emit('event', { type: 'comment', user: { id: 'u1', name: 'A' }, text: 'mặt trời', sentAt: Date.now() - 300 });
    const ev = await a.next((m) => m.t === 'ev');
    assert.equal(ev.e.seq, 1);
    assert.ok(ev.e.gwAt > 0);
    a.send({ t: 'snap', s: { round: 7 } });
    assert.deepEqual((await b.next((m) => m.t === 'snap')).s, { round: 7 }, 'follower nhận snapshot của leader');
    a.close();
    const role = await b.next((m) => m.t === 'role');
    assert.equal(role.role, 'leader');
    b.close();
    await sleep(150);
    assert.deepEqual(s.log.at(-1), ['disconnect'], 'không còn overlay → ngắt TikTok sau idleMs');
  } finally { await s.close(); }
});

test('tim gộp theo người trong cửa sổ ngắn; bình luận / quà không gộp; nối lại có since → gửi bù đúng seq', async () => {
  const s = await setup();
  try {
    const a = client(`ws://${s.base}/ws?overlay=${s.ch.overlay_key}`); await a.open(); await a.next((m) => m.t === 'hello');
    for (let i = 0; i < 5; i++) s.bridges[0].emit('event', { type: 'like', user: { id: 'l', name: 'L' }, count: 10 });
    const like = await a.next((m) => m.t === 'ev' && m.e.type === 'like');
    assert.equal(like.e.count, 50);
    await sleep(50);
    assert.equal(a.box.filter((m) => m.t === 'ev' && m.e.type === 'like').length, 0, 'chỉ 1 sự kiện tim');
    const last = like.e.seq;
    a.close(); await a.closed;
    s.bridges[0].emit('event', { type: 'comment', user: { id: 'u', name: 'U' }, text: 'trong lúc rớt' });
    s.bridges[0].emit('event', { type: 'gift', user: { id: 'g', name: 'G' }, giftName: 'Rose', diamonds: 1, repeatCount: 1 });
    const b = client(`ws://${s.base}/ws?overlay=${s.ch.overlay_key}&since=${last}`); await b.open();
    await b.next((m) => m.t === 'hello');
    const r1 = await b.next((m) => m.t === 'ev'); const r2 = await b.next((m) => m.t === 'ev');
    assert.deepEqual([r1.e.text, r2.e.type, r1.replay], ['trong lúc rớt', 'gift', true]);
    b.close();
  } finally { await s.close(); }
});

test('game op: định tuyến tới phần server của game; op lạ / game khác / quá giờ → lỗi riêng request đó; giới hạn tần suất', async () => {
  const s = await setup({ gw: { opRate: { perSec: 0.001, burst: 2 } } });
  try {
    const a = client(`ws://${s.base}/ws?overlay=${s.ch.overlay_key}`); await a.open(); await a.next((m) => m.t === 'hello');
    a.send({ t: 'g', game: 'doantu', op: 'score', id: 1, p: { word: 'nắng' } });
    assert.deepEqual((await a.next((m) => m.t === 'g' && m.id === 1)).r, { score: 42, word: 'nắng' });
    a.send({ t: 'g', game: 'doantu', op: 'constructor', id: 2 });
    assert.match((await a.next((m) => m.t === 'g' && m.id === 2)).err, /không có op/);
    a.send({ t: 'g', game: 'memory', op: 'score', id: 3 });
    assert.match((await a.next((m) => m.t === 'g' && m.id === 3)).err, /không phải game đang chọn/);
    a.send({ t: 'g', game: 'doantu', op: 'slow', id: 4 });
    assert.match((await a.next((m) => m.t === 'g' && m.id === 4)).err, /Quá thời gian/);
    a.send({ t: 'g', game: 'doantu', op: 'score', id: 5, p: {} });
    assert.match((await a.next((m) => m.t === 'g' && m.id === 5)).err, /Quá nhiều yêu cầu/);
    a.close();
  } finally { await s.close(); }
});

test('dashboard: token sai bị đóng; dev token → tạo kênh, cài đặt / bindings kiểm tra theo game, lệnh + giả lập tới overlay', async () => {
  const s = await setup();
  try {
    const bad = client(`ws://${s.base}/ws?role=dashboard`); await bad.open();
    bad.send({ t: 'auth', token: 'sai' });
    assert.equal((await bad.closed).code, 4001);

    const d = client(`ws://${s.base}/ws?role=dashboard`); await d.open();
    d.send({ t: 'auth', token: DEV });
    const authed = await d.next((m) => m.t === 'authed');
    assert.ok(authed.games.find((g) => g.id === 'memory').schema, 'danh mục có schema để sinh form');
    let id = 0;
    const req = async (op, p) => { const i = ++id; d.send({ t: 'req', id: i, op, p }); const r = await d.next((m) => m.t === 'res' && m.id === i); if (r.err) throw new Error(r.err); return r.r; };
    await assert.rejects(req('create', { username: 'tên có dấu cách' }), /không hợp lệ/);
    const ch = await req('create', { username: '@kenh.moi', game: 'memory' });
    assert.equal(ch.username, 'kenh.moi');
    await assert.rejects(req('config', { channel: ch.id, settings: { answerSeconds: 999 } }), /lớn nhất/);
    await assert.rejects(req('config', { channel: ch.id, bindings: [{ action: 'khong-co', trigger: { type: 'follow' } }] }), /không có trong game/);

    const o = client(`ws://${s.base}/ws?overlay=${ch.overlay_key}`); await o.open(); await o.next((m) => m.t === 'hello');
    await req('watch', { channel: ch.id });
    await req('config', { channel: ch.id, settings: { answerSeconds: 20 }, bindings: [{ action: 'flash', trigger: { type: 'follow' } }] });
    const cfg = await o.next((m) => m.t === 'cfg');
    assert.equal(cfg.channel.settings.answerSeconds, 20);
    assert.equal(cfg.channel.settings.startDigits, 2, 'điền default');
    assert.equal(cfg.channel.bindings[0].label, 'Hiện lại dãy số');
    await req('cmd', { channel: ch.id, id: 'next' });
    assert.equal((await o.next((m) => m.t === 'cmd')).id, 'next');
    await req('sim', { channel: ch.id, e: { type: 'comment', text: 'x'.repeat(500) } });
    const ev = await o.next((m) => m.t === 'ev');
    assert.equal(ev.e.sim, true);
    assert.equal(ev.e.text.length, 200, 'giả lập bị giới hạn độ dài');
    assert.ok((await d.next((m) => m.t === 'ev')).e.sim, 'dashboard thấy nhật ký');
    // kênh của người khác
    const other = await s.store.createChannel('nguoi-khac', 'kenh_khac');
    await assert.rejects(req('get', { channel: other.id }), /Không tìm thấy kênh/);
    // đổi link overlay → overlay cũ bị đóng với mã 4004
    await req('rotate', { channel: ch.id });
    assert.equal((await o.closed).code, 4004);
    d.close();
  } finally { await s.close(); }
});

test('overlay ghi trạng thái / ván / điểm qua gateway (gom ghi), BXH theo tuần giờ VN', async () => {
  const s = await setup();
  try {
    const a = client(`ws://${s.base}/ws?overlay=${s.ch.overlay_key}`); await a.open(); await a.next((m) => m.t === 'hello');
    a.send({ t: 'save', game: 'doantu', state: { v: 1 } });
    a.send({ t: 'save', game: 'doantu', state: { v: 2 } });
    a.send({ t: 'pts', user: { id: 'x', name: 'X' }, n: 30 });
    a.send({ t: 'pts', user: { id: 'x', name: 'X' }, n: 20, win: true });
    a.send({ t: 'round', r: { winner: 'x' } });
    await sleep(80);
    assert.deepEqual((await s.store.getChannel(s.ch.id)).games.doantu.state, { v: 2 }, 'chỉ ghi bản mới nhất');
    const board = await s.store.leaderboard(s.ch.id);
    assert.deepEqual([board[0].points, board[0].wins], [50, 1]);
    assert.equal(s.store.db.rounds.length, 1);
    assert.equal(weekOf(Date.UTC(2026, 10, 15, 18, 0)), '2026-11-16', 'Chủ nhật 18:00 UTC = thứ Hai 01:00 giờ VN → tuần mới');
    a.close();
  } finally { await s.close(); }
});

test('sanitizeEvent / checkBindings', () => {
  assert.equal(sanitizeEvent({ type: 'hack' }), null);
  assert.deepEqual(sanitizeEvent({ type: 'gift', giftName: 'Rose', diamonds: -5, count: 1e9 }).diamonds, 0);
  const memory = catalog.find((g) => g.id === 'memory');
  assert.equal(checkBindings(null, memory), null);
  assert.throws(() => checkBindings([{ action: 'flash', trigger: { type: 'gift' } }], memory), /quà cần/);
  assert.deepEqual(checkBindings([{ action: 'time', trigger: { type: 'like', every: '50', evil: 1 } }], memory)[0].trigger, { type: 'like', every: 50 });
});

test('SupabaseStore: header theo loại key, kiểm tra token có cache, tạo kênh, gom điểm → RPC add_points, BXH dòng tổng', async () => {
  const { SupabaseStore } = await import('../gateway/store.js');
  const calls = [];
  const fakeFetch = async (url, opt = {}) => {
    calls.push({ url, ...opt, body: opt.body ? JSON.parse(opt.body) : undefined });
    const u = new URL(url);
    const json = (x, status = 200) => ({ ok: status < 300, status, json: async () => x, text: async () => JSON.stringify(x) });
    if (u.pathname === '/auth/v1/user') return opt.headers.Authorization === 'Bearer good' ? json({ id: 'u-1', email: 'a@b.c' }) : json({ msg: 'bad' }, 401);
    if (u.pathname === '/rest/v1/channels' && opt.method === 'POST') return json([{ id: '00000000-0000-0000-0000-000000000001', ...JSON.parse(opt.body) }], 201);
    if (u.pathname.startsWith('/rest/v1/')) return json([]);
    return json(null);
  };
  const st = new SupabaseStore({ url: 'https://x.supabase.co/', secretKey: 'sb_secret_abc', publishableKey: 'sb_publishable_xyz', fetchImpl: fakeFetch, log: {} });
  assert.deepEqual(await st.verifyUser('good'), { id: 'u-1', email: 'a@b.c' });
  await st.verifyUser('good');
  assert.equal(calls.filter((c) => c.url.endsWith('/auth/v1/user')).length, 1, 'cache token');
  assert.equal(calls[0].headers.apikey, 'sb_publishable_xyz');
  assert.equal(await st.verifyUser('bad'), null);
  const c = await st.createChannel('u-1', '@kenh_a', 'memory');
  assert.equal(c.username, 'kenh_a');
  const post = calls.find((x) => x.method === 'POST' && x.url.includes('/rest/v1/channels'));
  assert.equal(post.headers.apikey, 'sb_secret_abc');
  assert.equal(post.headers.Authorization, undefined, 'khoá sb_secret_ không gửi ở Authorization');
  assert.equal(post.headers.Prefer, 'return=representation');
  st.addPoints(c.id, 'memory', { id: 'v1', name: 'V' }, 30);
  st.addPoints(c.id, 'memory', { id: 'v1', name: 'V' }, 20, true);
  await st.leaderboard(c.id);
  const rpc = calls.filter((x) => x.url.endsWith('/rest/v1/rpc/add_points'));
  assert.equal(rpc.length, 1, 'gom 2 lần cộng thành 1 lần gọi');
  assert.deepEqual([rpc[0].body.p_points, rpc[0].body.p_wins, rpc[0].body.p_game], [50, 1, 'memory']);
  assert.match(calls.at(-1).url, /leaderboard\?.*game_id=eq\.&/, 'không chọn game → dòng tổng');
  await st.close();
  const legacy = new SupabaseStore({ url: 'https://x.supabase.co', secretKey: 'eyJhbGciOi.legacy', fetchImpl: fakeFetch, log: {} });
  await legacy.listChannels('u-1');
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer eyJhbGciOi.legacy', 'khoá service_role cũ (JWT) gửi cả Authorization');
  await legacy.close();
});

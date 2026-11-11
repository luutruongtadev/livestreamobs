// Studio: danh mục widget (chuẩn module), kiểm tra cấu hình, số liệu phiên, phát cho overlay qua gateway.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { missingDefaults, validate } from '#sdk';
import { Gateway } from '../gateway/gateway.js';
import { FileStore } from '../gateway/store.js';
import { buildCatalog, buildWidgetCatalog, createHttpHandler, resolveStatic } from '../gateway/index.js';
import { checkStudio, SessionStats, STUDIO_LIMITS } from '../gateway/studio.js';
import { SOUNDS, createSoundPlayer } from '../web/js/sounds.js';
import { importsOf } from '#sdk/testing';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = buildCatalog(path.join(ROOT, 'games'));
const widgets = buildWidgetCatalog(path.join(ROOT, 'widgets'), {});
const DEV = 'dev-token-123456';

test('widget: mỗi widget có widget.json hợp lệ (id = thư mục, kích thước, schema đủ default), index.js import được ở Node (không đụng DOM), chỉ import _lib / #sdk', async () => {
  const dirs = fs.readdirSync(path.join(ROOT, 'widgets'), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name);
  assert.deepEqual(widgets.map((w) => w.id).sort(), dirs.sort(), 'mọi thư mục widget đều nạp được');
  for (const w of widgets) {
    assert.ok(w.name && w.icon && w.description, `${w.id}: thiếu tên / icon / mô tả`);
    assert.ok(w.size?.w > 0 && w.size?.h > 0 && w.size.w <= 1080 && w.size.h <= 1920, `${w.id}: size`);
    assert.equal(w.schema?.type, 'object', `${w.id}: schema`);
    assert.deepEqual(missingDefaults(w.schema), [], `${w.id}: mọi trường cài đặt phải có default`);
    const defaults = Object.fromEntries(Object.entries(w.schema.properties).map(([k, s]) => [k, s.default]));
    assert.deepEqual(validate(w.schema, defaults), [], `${w.id}: default phải hợp lệ`);
    const file = path.join(ROOT, 'widgets', w.id, 'index.js');
    for (const spec of importsOf(fs.readFileSync(file, 'utf8'))) assert.ok(spec === '#sdk' || spec === '../_lib/ui.js', `${w.id}: không được import "${spec}"`);
    const mod = await import(pathToFileURL(file).href);
    assert.equal(typeof mod.mount, 'function', `${w.id}: thiếu mount()`);
  }
});

test('checkStudio: toạ độ kẹp trong khung, config theo schema (sai → default), loại lạ / âm thanh lạ / link http bị từ chối, giới hạn số lượng', () => {
  const s = checkStudio({
    widgets: [
      { id: 'g1', type: 'goal', x: 2000, y: -50, w: 5000, h: 10, config: { target: -5, title: 'Mục tiêu xu', metric: 'likes' } },
      { id: 'g1', type: 'text', x: 10, y: 10, w: 300, h: 100 },
    ],
    sounds: [{ when: { type: 'gift', giftName: 'Rose' }, sound: 'coin', volume: 3 }, { when: { type: 'goal', goal: 'g1' }, sound: 'url', url: 'https://x.test/a.mp3' }],
  }, widgets);
  const [g, t] = s.widgets;
  assert.equal(g.w, 1080); assert.equal(g.x, 0); assert.equal(g.y, 0); assert.equal(g.h, 120, 'nhỏ hơn minSize → minSize');
  assert.equal(g.config.target, 1000, 'mục tiêu âm → default'); assert.equal(g.config.metric, 'likes'); assert.equal(g.config.title, 'Mục tiêu xu');
  assert.notEqual(t.id, g.id, 'id trùng được đổi');
  assert.equal(t.config.text.length > 0, true, 'config thiếu → default');
  assert.equal(s.sounds[0].volume, 1);
  assert.deepEqual(s.sounds[1].when, { type: 'goal', goal: 'g1' });
  assert.throws(() => checkStudio({ widgets: [{ type: 'khong-co' }] }, widgets), /không có loại/);
  assert.throws(() => checkStudio({ sounds: [{ when: { type: 'follow' }, sound: 'nope' }] }, widgets), /không có âm thanh/);
  assert.throws(() => checkStudio({ sounds: [{ when: { type: 'follow' }, sound: 'url', url: 'http://x.test/a.mp3' }] }, widgets), /https/);
  assert.throws(() => checkStudio({ sounds: [{ when: { type: 'gift' }, sound: 'coin' }] }, widgets), /gift/i);
  assert.throws(() => checkStudio({ widgets: Array.from({ length: STUDIO_LIMITS.widgets + 1 }, () => ({ type: 'text' })) }, widgets), /Tối đa/);
  const empty = checkStudio(null, widgets);
  assert.deepEqual({ ...empty, scenes: undefined }, { widgets: [], sounds: [], memes: [], panels: {}, scenes: undefined });
  assert.equal(empty.scenes.intro.title, 'LIVE SẮP BẮT ĐẦU', 'màn chuẩn bị: mặc định');
});

test('SessionStats: xu = xu × số món, top người tặng, tim / follow / share / bình luận, đặt lại', () => {
  const st = new SessionStats(() => 1000);
  st.add({ type: 'gift', user: { id: 'a', name: 'A' }, giftName: 'Rose', diamonds: 1, count: 5 });
  st.add({ type: 'gift', user: { id: 'b', name: 'B' }, giftName: 'Lion', diamonds: 299, count: 1 });
  st.add({ type: 'like', user: { id: 'a' }, count: 120 });
  st.add({ type: 'follow', user: { id: 'c' } }); st.add({ type: 'share', user: { id: 'c' } }); st.add({ type: 'comment', user: { id: 'c' }, text: 'hi' });
  const v = st.view();
  assert.equal(v.diamonds, 304); assert.equal(v.gifts, 6); assert.equal(v.likes, 120); assert.equal(v.follows, 1); assert.equal(v.shares, 1); assert.equal(v.comments, 1);
  assert.deepEqual(v.gifters.map((g) => [g.id, g.diamonds]), [['b', 299], ['a', 5]]);
  st.reset();
  assert.equal(st.view().diamonds, 0); assert.equal(st.view().gifters.length, 0);
});

test('thư viện âm thanh: id không trùng; import + tạo bộ phát ở Node không lỗi (không có AudioContext thì im lặng)', () => {
  assert.equal(new Set(SOUNDS.map((s) => s.id)).size, SOUNDS.length);
  const p = createSoundPlayer();
  for (const s of SOUNDS) p.play(s.id);
  p.play('url', { url: 'https://x.test/a.mp3' });
  p.close();
});

// ---------------- qua gateway ----------------
function client(url) {
  const ws = new WebSocket(url);
  const box = [], waiters = [];
  ws.on('message', (d) => { const m = JSON.parse(d); const i = waiters.findIndex((w) => w.pred(m)); if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else box.push(m); });
  return {
    box,
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

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
  const store = new FileStore({ file: path.join(dir, 'p.json'), devToken: DEV });
  const gw = new Gateway({ store, catalog, widgets, log: {}, bridgeFactory: null, likeFlushMs: 20, studioMs: 40 });
  const server = http.createServer(createHttpHandler({ root: ROOT, catalog, widgets, publicConfig: { store: 'file' } }));
  gw.attach(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `127.0.0.1:${server.address().port}`;
  const ch = await store.createChannel('dev', 'kenh_studio', 'memory');
  const dash = client(`ws://${base}/ws?role=dashboard`); await dash.open();
  dash.send({ t: 'auth', token: DEV });
  const authed = await dash.next((m) => m.t === 'authed');
  let id = 0;
  const req = async (op, p) => { const rid = ++id; dash.send({ t: 'req', id: rid, op, p }); const r = await dash.next((m) => m.t === 'res' && m.id === rid); if (r.err) throw new Error(r.err); return r.r; };
  return { gw, store, base, ch, req, authed, close: async () => { dash.close(); await gw.close(); server.close(); } };
}

test('HTTP: /api/widgets + file widget công khai; chặn file lạ / đi ngược thư mục', async () => {
  const s = await setup();
  const get = (p) => new Promise((r) => http.get(`http://${s.base}${p}`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => r({ code: res.statusCode, body: b })); }));
  try {
    assert.ok(JSON.parse((await get('/api/widgets')).body).some((w) => w.id === 'goal'));
    for (const p of ['/widgets/goal/index.js', '/widgets/goal/widget.json', '/widgets/_lib/ui.js', '/web/js/sounds.js', '/web/js/studio-layer.js']) assert.equal((await get(p)).code, 200, p);
    for (const p of ['/widgets/goal/notes.txt', '/widgets/../package.json', '/widgets/goal/%2e%2e/%2e%2e/.env', '/widgets/Goal/index.js']) assert.equal((await get(p)).code, 404, p);
    assert.equal(resolveStatic('/widgets/_lib/../../.env', ROOT), null);
    assert.ok(s.authed.widgets.some((w) => w.id === 'alerts'), 'dashboard nhận danh mục widget');
  } finally { await s.close(); }
});

test('gateway: lưu studio → overlay nhận {t:studio} (không nạp lại game); quà giả lập → số liệu phiên tới mọi overlay; overlay chỉ-widget không làm leader, nhận sx', async () => {
  const s = await setup();
  try {
    const lead = client(`ws://${s.base}/ws?overlay=${s.ch.overlay_key}`); await lead.open();
    assert.equal((await lead.next((m) => m.t === 'hello')).role, 'leader');
    const wid = client(`ws://${s.base}/ws?overlay=${s.ch.overlay_key}&passive=1`); await wid.open();
    const hw = await wid.next((m) => m.t === 'hello');
    assert.equal(hw.role, 'follower', 'overlay chỉ-widget không làm leader');
    assert.deepEqual(hw.channel.studio, {});
    await wid.next((m) => m.t === 'st');

    const saved = await s.req('studio', { channel: s.ch.id, studio: { widgets: [{ type: 'goal', x: 100, y: 300, w: 700, h: 170, config: { metric: 'diamonds', target: 10 } }], sounds: [{ when: { type: 'goal' }, sound: 'fanfare' }] } });
    assert.equal(saved.studio.widgets[0].type, 'goal');
    const up = await wid.next((m) => m.t === 'studio');
    assert.equal(up.studio.sounds[0].sound, 'fanfare');
    await sleep(60);
    assert.ok(!lead.box.some((m) => m.t === 'cfg'), 'lưu studio không bắt game nạp lại');

    await s.req('sim', { channel: s.ch.id, e: { type: 'gift', user: { id: 'v1', name: 'Vy' }, giftName: 'Rose', diamonds: 1, count: 7 } });
    assert.equal((await lead.next((m) => m.t === 'ev')).e.type, 'gift', 'leader nhận ev');
    const sx = await wid.next((m) => m.t === 'sx');
    assert.equal(sx.e.giftName, 'Rose'); assert.equal(sx.e.count, 7);
    const st = await wid.next((m) => m.t === 'st' && m.st.diamonds === 7);
    assert.equal(st.st.gifters[0].name, 'Vy');
    assert.equal((await s.req('stats-reset', { channel: s.ch.id })).st.diamonds, 0);
    await wid.next((m) => m.t === 'st' && m.st.diamonds === 0);
    await assert.rejects(s.req('studio', { channel: s.ch.id, studio: { widgets: [{ type: 'virus' }] } }), /không có loại/);
    const fresh = await s.store.getChannel(s.ch.id);
    assert.equal(fresh.studio.widgets.length, 1, 'studio lưu bền trong store');
    lead.close(); wid.close();
  } finally { await s.close(); }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('checkStudio: bảng của game (vị trí / cỡ / ẩn) chỉ nhận game và bảng có trong manifest, kẹp toạ độ và tỉ lệ', () => {
  const games = [{ id: 'g1', canvas: { width: 1080, height: 1920 }, panels: [{ id: 'gifts', label: 'Bảng quà', rect: { x: 24, y: 1200, w: 1000, h: 400 } }] }];
  const s = checkStudio({ panels: { g1: { gifts: { x: 5000, y: 300.4, s: 9, hidden: true }, la: { x: 1 } }, khongco: { gifts: { x: 1 } } } }, widgets, games);
  assert.deepEqual(Object.keys(s.panels), ['g1']);
  assert.deepEqual(Object.keys(s.panels.g1), ['gifts']);
  assert.equal(s.panels.g1.gifts.s, 2, 'tỉ lệ tối đa 2');
  assert.equal(s.panels.g1.gifts.x, 1080 - 1000, 'không kéo ra hẳn ngoài khung (giữ được nửa bảng)');
  assert.equal(s.panels.g1.gifts.y, 300);
  assert.equal(s.panels.g1.gifts.hidden, true);
});

test('màn chuẩn bị / kết thúc live: cấu hình làm sạch (thiếu → mặc định, ảnh chỉ https), trạng thái màn + hẹn giờ tắt trong 24 giờ', async () => {
  const { cleanScenes, checkScene } = await import('../gateway/studio.js');
  const s = checkStudio({ scenes: { intro: { title: 'Sắp live', countdownMin: 999, image: 'http://x.test/a.jpg', theme: 'la' }, outro: { warnMin: 3, pauseGame: false } } }, widgets);
  assert.equal(s.scenes.intro.title, 'Sắp live'); assert.equal(s.scenes.intro.countdownMin, 180); assert.equal(s.scenes.intro.image, ''); assert.equal(s.scenes.intro.theme, 'tim'); assert.equal(s.scenes.intro.trailer, true, 'mặc định chiếu trailer');
  assert.equal(s.scenes.outro.warnMin, 3); assert.equal(s.scenes.outro.pauseGame, false); assert.equal(s.scenes.outro.title, 'CẢM ƠN MỌI NGƯỜI!');
  assert.equal(cleanScenes({ intro: { image: 'https://cdn.test/bg.jpg' } }).intro.image, 'https://cdn.test/bg.jpg');
  const now = 1_000_000_000;
  assert.deepEqual(checkScene({ mode: 'intro' }, now), { mode: 'intro', at: now, endAt: null });
  assert.equal(checkScene({ mode: 'live', endAt: now + 3600_000 }, now).endAt, now + 3600_000);
  assert.throws(() => checkScene({ mode: 'live', endAt: now + 48 * 3600_000 }, now), /24 giờ/);
  assert.throws(() => checkScene({ mode: 'xyz' }, now), /không hợp lệ/);
});

test('meme dùng chung: luật theo quà / sự kiện game (kiểm tra theo manifest), link https, âm có sẵn; bộ mặc định của game hợp lệ; Freesound; host báo action', async () => {
  const { checkMemeRule } = await import('../gateway/studio.js');
  const ok = checkMemeRule({ id: 'a', when: { type: 'game', game: 'deadline', event: 'action:soi' }, gif: { mode: 'search', q: 'boss watching' }, sound: { mode: 'lib', id: 'vineboom' }, text: 'Ủa alo??', seconds: 99 }, 0, catalog);
  assert.deepEqual(ok, { id: 'a', on: true, when: { type: 'game', game: 'deadline', event: 'action:soi' }, gif: { mode: 'search', q: 'boss watching' }, sound: { mode: 'lib', volume: 0.8, id: 'vineboom' }, text: 'Ủa alo??', seconds: 10 });
  assert.equal(checkMemeRule({ when: { type: 'game', game: 'flagtrip', event: 'solved' } }, 0, catalog).when.event, 'solved');
  assert.equal(checkMemeRule({ when: { type: 'gift', giftName: 'Rose' }, gif: { mode: 'url', url: 'https://x.y/a.gif' }, sound: { mode: 'search', q: 'bruh' } }, 0, catalog).sound.q, 'bruh');
  assert.throws(() => checkMemeRule({ when: { type: 'game', game: 'deadline', event: 'action:khongco' } }, 0, catalog), /không có sự kiện/);
  assert.throws(() => checkMemeRule({ when: { type: 'like', every: 10 }, gif: { mode: 'url', url: 'http://x.gif' } }, 0, catalog), /https/);
  assert.throws(() => checkMemeRule({ when: { type: 'follow' }, sound: { mode: 'lib', id: 'khongco' } }, 0, catalog), /âm thanh/);
  // bộ meme mặc định của mọi game đều qua kiểm tra (sự kiện có thật, âm có trong thư viện)
  for (const g of catalog) for (const [i, d] of (g.memes || []).entries()) checkMemeRule({ when: { type: 'game', game: g.id, event: d.event }, gif: { mode: 'search', q: d.q }, sound: d.sound, text: d.text }, i, catalog);
  assert.equal(checkStudio({ memes: [{ when: { type: 'follow' } }, { when: { type: 'follow' } }] }, widgets, catalog).memes.length, 2);
  assert.throws(() => checkStudio({ memes: Array.from({ length: STUDIO_LIMITS.memes + 1 }, () => ({ when: { type: 'follow' } })) }, widgets, catalog), /Tối đa/);
  const { freesoundItems } = await import('../gateway/memes.js');
  assert.deepEqual(freesoundItems({ results: [{ id: 5, name: 'Fail', duration: 1.234, previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/5.mp3' }, license: 'CC0', username: 'u' }, { id: 6, previews: {} }] }),
    [{ id: '5', mp3: 'https://cdn.freesound.org/5.mp3', name: 'Fail', duration: 1.2, license: 'CC0', user: 'u' }]);
  // host báo action vừa áp dụng (để lớp meme bắt sự kiện "action:<id>")
  const { createHost, fakeClock, seededRandom } = await import('#sdk');
  const { loadGame } = await import('#sdk/node');
  const game = await loadGame(path.join(ROOT, 'games', 'deadline'));
  const acts = [];
  const clock = fakeClock();
  const host = createHost(game, { data: game.data, now: clock.now, random: seededRandom(1), log: {}, onAction: (a) => acts.push(a) });
  host.handle({ type: 'gift', user: { id: 'u', name: 'U' }, giftName: 'Finger Heart', diamonds: 5, count: 1 });
  assert.deepEqual(acts, ['soi']);
});

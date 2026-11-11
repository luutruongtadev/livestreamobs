// Overlay shell của nền tảng: nối WebSocket gateway, nạp game theo manifest, chạy engine NGAY TRONG TRÌNH DUYỆT.
// Đường đi nóng: sự kiện TikTok → host.handle() (đồng bộ) → vẽ ở frame kế tiếp. Không chờ server.
//   ?preview=1  chỉ hiển thị lại trạng thái của overlay chính (dashboard)   ?mute=1  ?debug=1  ?tts=0
//   ?layer=game     chỉ game (không widget)      ?layer=widgets  chỉ widget Studio, nền trong suốt (đặt chồng lên camera)
//   ?widgets=0      ẩn widget (trình chỉnh Studio dùng)   ?sound=1  cho overlay "chỉ widget" phát luật âm thanh
//   ?scenes=0       không hiện màn chuẩn bị / kết thúc live
//   ?play=1         cửa sổ chơi: giành vai overlay chính (nhận trạng thái mới nhất) để streamer gõ phím / bấm chuột vào game
import { createHost, memoryStorage, defaultBindings, triggerText, triggerIcon } from '#sdk';
import { createStudioLayer } from './studio-layer.js';
import { createSceneLayer } from './scene-layer.js';

const qs = new URLSearchParams(location.search);
const key = location.pathname.split('/').filter(Boolean)[1] || '';
const preview = qs.get('preview') === '1';
const play = qs.get('play') === '1' && !preview;
const options = { mute: qs.get('mute') === '1' || preview, debug: qs.get('debug') === '1', tts: qs.get('tts') !== '0' && !preview };
const layer = ['game', 'widgets'].includes(qs.get('layer')) ? qs.get('layer') : 'all';
const gameOn = layer !== 'widgets';
const widgetsOn = layer !== 'game' && qs.get('widgets') !== '0';
const $ = (id) => document.getElementById(id);
const stage = $('stage'), badge = $('badge'), notice = $('notice'), soundBtn = $('sound');

let ws = null, role = null, seq = 0, retry = 500, loadToken = 0;
let game = null; // { id, manifest, view, host, canvas }
let tk = null, wsOk = false, offset = 0, bestRtt = Infinity;
const pending = new Map(); let reqId = 0;
const lat = []; let snapDirty = false, fxOut = [];

const send = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
const cfgKeyOf = (ch) => JSON.stringify([ch.game, ch.settings, ch.bindings]);
const serverNow = () => Date.now() + offset;

// lớp widget Studio (đè lên canvas game); âm thanh Studio chỉ phát ở overlay chính (hoặc overlay chỉ-widget có ?sound=1)
const studio = createStudioLayer({ muted: options.mute, canSound: () => !preview && !options.mute && (role === 'leader' || (layer === 'widgets' && qs.get('sound') === '1')) });
if (studio) stage.append(studio.el);
// màn chuẩn bị live / kết thúc live (đè lên game + widget); overlay chính tạm dừng game khi đang ở màn này
let rawStudio = {}, scenePaused = false;
const scenesOn = qs.get('scenes') !== '0';
const sceneLayer = scenesOn ? createSceneLayer({
  now: () => serverNow(),
  onMode: (m) => {
    if (preview || role !== 'leader' || !game?.host) return;
    const want = m === 'intro' || (m === 'outro' && rawStudio?.scenes?.outro?.pauseGame !== false);
    if (want && !scenePaused && !game.host.snapshot()?.paused) { scenePaused = true; applyFx(game.host.command('pause', { reason: 'scene' })); draw(); }
    else if (!want && scenePaused) { scenePaused = false; applyFx(game.host.command('resume')); draw(); }
  },
}) : null;
if (sceneLayer) stage.append(sceneLayer.el);
if (preview && sceneLayer) addEventListener('message', (e) => { if (e.origin === location.origin && e.data?.t === 'scene-preview') sceneLayer.preview(e.data.mode); });
function setScene(st) { rawStudio = st || {}; sceneLayer?.set(rawStudio); }
let legendFor = '';
/** Bảng quà cho widget: bindings của game đang chơi (hoặc mặc định trong manifest) → { icon, text, label }. */
async function updateLegend(ch) {
  if (!studio) return;
  const key = JSON.stringify([ch.game, ch.bindings]);
  if (key === legendFor) return;
  legendFor = key;
  try {
    const manifest = game?.id === ch.game ? game.manifest : await fetchJson(`/games/${ch.game}/manifest.json`);
    const label = (id) => manifest.actions?.find((a) => a.id === id)?.label || id;
    studio.setLegend((ch.bindings ?? defaultBindings(manifest)).map((b) => ({ icon: triggerIcon(b.trigger), text: triggerText(b.trigger), label: b.label || label(b.action) })));
  } catch { legendFor = ''; }
}
let studioKey = '';
function setStudio(st) { const k = JSON.stringify(st || {}); if (k === studioKey) return; studioKey = k; studio.setStudio(st); } // không đổi → giữ widget (khỏi mất lịch sử bình luận)
// ?layer=game / ?widgets=0: vẫn giữ luật âm thanh, chỉ bỏ widget
const studioOf = (st) => (widgetsOn ? st : { ...(st || {}), widgets: [] });
// bảng của game (bảng quà, dòng quà…) streamer kéo / phóng / ẩn trong Studio: studio.panels[gameId]
let panelsAll = {};
let draftPanels = null; // xem trước trong dashboard: tab Studio gửi bản nháp qua postMessage khi đang kéo
function applyPanels() { if (game?.view?.layout) game.view.layout((draftPanels && draftPanels.game === game.id ? draftPanels.panels : panelsAll[game.id]) || {}); }
function setPanels(st) { panelsAll = st?.panels && typeof st.panels === 'object' ? st.panels : {}; applyPanels(); }
if (preview) addEventListener('message', (e) => { if (e.origin === location.origin && e.data?.t === 'panels') { draftPanels = { game: String(e.data.game || ''), panels: e.data.panels || {} }; applyPanels(); } });
function onChannel(ch) { setPanels(ch.studio); setScene(ch.studio); if (!studio) return; setStudio(studioOf(ch.studio)); updateLegend(ch); }

// ---------------- lớp UI chung ----------------
function showBadge(text, cls = '') { badge.textContent = text; badge.className = `ui ${cls}`; badge.style.display = text ? 'block' : 'none'; }
function showNotice(text) { notice.textContent = text; notice.style.display = text ? 'flex' : 'none'; }
function refreshBadge() {
  if (!wsOk) return showBadge('⚠️ Mất kết nối máy chủ, đang nối lại…', 'err');
  if (preview) return showBadge(role === 'leader' ? 'Xem trước' : '👁 Xem trước (theo overlay chính)', '');
  if (!tk || tk.state === 'connected') return showBadge(options.debug && game ? `${game.id} · ${role}` : '');
  if (tk.state === 'connecting' || tk.state === 'idle') return showBadge(`⏳ ${tk.message || 'Đang kết nối TikTok…'}`, 'warn');
  showBadge(`⚠️ ${tk.message || 'TikTok chưa kết nối'}`, 'warn');
}
function fit() {
  const c = game?.canvas;
  const w = c?.width || 1080, h = c?.height || 1920;
  const s = Math.min(innerWidth / w, innerHeight / h);
  if (c) { c.style.width = `${w * s}px`; c.style.height = `${h * s}px`; }
  stage.style.width = `${w * s}px`; stage.style.height = `${h * s}px`;
  studio?.fit(s * (w / 1080)); sceneLayer?.fit(s * (w / 1080));
}
addEventListener('resize', fit);
soundBtn.onclick = () => { game?.view?.resumeAudio?.(); studio?.resumeAudio(); soundBtn.style.display = 'none'; };
fit();

// ---------------- kết nối ----------------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?overlay=${encodeURIComponent(key)}${preview ? '&preview=1' : ''}${gameOn ? '' : '&passive=1'}${play && gameOn ? '&play=1' : ''}${seq ? `&since=${seq}` : ''}`);
  ws.onopen = () => { wsOk = true; retry = 500; refreshBadge(); ping(); };
  ws.onclose = (e) => {
    wsOk = false; refreshBadge();
    for (const p of pending.values()) p.reject(new Error('Mất kết nối'));
    pending.clear();
    if (e.code === 4004) { showNotice(`🔗 ${e.reason || 'Link overlay không đúng hoặc đã đổi'} — lấy link mới trong dashboard.`); setTimeout(connect, 15_000); return; }
    setTimeout(connect, retry); retry = Math.min(5000, retry * 2);
  };
  ws.onmessage = (m) => { let msg; try { msg = JSON.parse(m.data); } catch { return; } onMsg(msg); };
}

function ping() { send({ t: 'ping', ts: performance.now() }); }
setInterval(ping, 15_000);

function request(op, p) {
  return new Promise((resolve, reject) => {
    if (ws?.readyState !== 1) return reject(new Error('Chưa kết nối máy chủ'));
    const id = ++reqId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Quá thời gian')); }, 30_000);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    send({ t: 'g', game: game?.id, op, id, p });
  });
}

async function onMsg(m) {
  switch (m.t) {
    case 'hello':
      tk = m.tk; showNotice('');
      if (m.now) offset = m.now - Date.now();
      onChannel(m.channel);
      if (!gameOn) { role = m.role; refreshBadge(); break; }
      // nối lại sau khi rớt mạng: cấu hình không đổi → giữ nguyên game đang chạy (chỉ nhận bù sự kiện theo seq)
      if (game && game.cfgKey === cfgKeyOf(m.channel) && (m.role === 'leader') === !!game.host) { role = m.role; refreshBadge(); break; }
      role = m.role;
      await loadGame(m.channel);
      break;
    case 'role': role = m.role; onChannel(m.channel); if (gameOn) await loadGame(m.channel); break;
    case 'cfg': onChannel(m.channel); if (gameOn) await loadGame(m.channel); break;
    case 'studio': setPanels(m.studio); setScene(m.studio); if (studio) setStudio(studioOf(m.studio)); break;
    case 'sfx': studio?.playNow(m); break;
    case 'st': studio?.setStats(m.st); sceneLayer?.setStats(m.st); break;
    case 'sx': if (role !== 'leader') { studio?.event(m.e); sceneLayer?.event(m.e); } break;
    case 'ev':
      if (role === 'leader' && m.e.seq > seq && !m.replay) { studio?.event(m.e); sceneLayer?.event(m.e); }
      if (role !== 'leader' || !game?.host || m.e.seq <= seq) return;
      seq = m.e.seq;
      onEvent(m.e, !!m.replay);
      break;
    case 'snap': if (role !== 'leader') game?.view?.update(m.s); break;
    case 'fx': if (role !== 'leader') for (const e of m.fx || []) game?.view?.effect(e); break;
    case 'cmd': if (role === 'leader' && game?.host) { applyFx(game.host.command(m.id, m.args || {})); draw(); } break;
    case 'in': if (role === 'leader' && game?.host) { applyFx(game.host.input(m.ev || {})); draw(); } break;
    // cửa sổ chơi vừa mở: gửi trạng thái mới nhất để nó tiếp quản (gateway chuyển vai sau khi nhận)
    case 'handoff': if (role === 'leader' && game?.host) send({ t: 'save', game: game.id, state: game.host.serialize(), handoff: true }); else send({ t: 'save', handoff: true }); break;
    case 'g': { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.err ? p.reject(new Error(m.err)) : p.resolve(m.r); } break; }
    case 'tk': tk = m.tk; refreshBadge(); break;
    case 'pong': {
      const rtt = performance.now() - m.ts;
      if (rtt <= bestRtt * 1.5) { offset = m.now + rtt / 2 - Date.now(); bestRtt = Math.min(bestRtt, rtt); }
      game && (game.rtt = rtt);
      break;
    }
    default:
  }
}

// ---------------- nạp game ----------------
async function fetchJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }

function unloadGame() {
  if (!game) return;
  try { if (game.host && role === 'leader') send({ t: 'save', game: game.id, state: game.host.serialize() }); } catch { /* bỏ qua */ }
  clearInterval(game.tickTimer); clearInterval(game.saveTimer);
  try { game.view?.destroy(); } catch { /* bỏ qua */ }
  try { game.host?.destroy(); } catch { /* bỏ qua */ }
  game = null;
}

async function loadGame(ch) {
  const token = ++loadToken;
  try {
    const base = `/games/${ch.game}/`;
    const [manifest, schema] = await Promise.all([fetchJson(`${base}manifest.json`), fetchJson(`${base}settings.schema.json`)]);
    const data = {};
    await Promise.all(Object.entries(manifest.data || {}).map(async ([k, p]) => { data[k] = await fetchJson(base + p); }));
    const [engine, render] = await Promise.all([import(`${base}engine/index.js`), import(`${base}render/index.js`)]);
    if (token !== loadToken) return; // đã có lần nạp mới hơn
    // cùng game (đổi cài đặt / bindings): mang trạng thái mới nhất trong bộ nhớ sang, không dùng bản lưu cũ
    const carry = game?.id === ch.game && game.host ? game.host.serialize() : null;
    unloadGame();
    const canvas = document.createElement('canvas');
    canvas.width = manifest.canvas.width; canvas.height = manifest.canvas.height;
    stage.replaceChildren(canvas, ...(studio ? [studio.el] : []), ...(sceneLayer ? [sceneLayer.el] : []));
    sceneLayer?.setGame(manifest.name);
    const view = render.mount(stage, { canvas, options, sound: null, input: preview ? null : sendInput });
    game = { id: ch.game, manifest, view, canvas, host: null, cfgKey: cfgKeyOf(ch) };
    applyPanels();
    fit();
    if (role === 'leader') startHost({ ...ch, state: carry ?? ch.state }, { manifest, schema, createGame: engine.createGame }, data);
    updateLegend(ch);
    if (!preview && !options.mute) { soundBtn.style.display = 'block'; setTimeout(() => { soundBtn.style.display = 'none'; }, 10_000); }
    refreshBadge();
  } catch (e) {
    console.error(e);
    showNotice(`Không nạp được game "${ch.game}": ${e.message}`);
    send({ t: 'err', err: { where: 'load', message: e.message, crashed: true } });
  }
}

function startHost(ch, module, data) {
  const host = createHost(module, {
    settings: ch.settings, bindings: ch.bindings, data,
    now: () => Date.now(), random: Math.random, log: console,
    server: { request },
    storage: memoryStorage(),
    report: { round: (r) => send({ t: 'round', r }), points: (user, n, win) => send({ t: 'pts', user, n, win }) },
    onEffects: (fx) => { applyFx(fx); draw(); },
    onError: (err) => {
      send({ t: 'err', err });
      if (err.crashed) { showNotice('Game gặp lỗi — đang chạy lại…'); setTimeout(() => { if (game?.host === host) { host.recover(); showNotice(''); draw(); } }, 5000); }
    },
  });
  if (ch.state) host.restore(ch.state);
  game.host = host;
  // đang ở màn chuẩn bị / kết thúc lúc nạp game → tạm dừng ngay
  scenePaused = false;
  if (sceneLayer) { const m = sceneLayer.modeNow(); if (m === 'intro' || (m === 'outro' && rawStudio?.scenes?.outro?.pauseGame !== false)) { scenePaused = true; host.command('pause', { reason: 'scene' }); } }
  game.tickTimer = setInterval(() => { const fx = host.tick(); if (fx.length) applyFx(fx); draw(); }, 250);
  game.saveTimer = setInterval(() => send({ t: 'save', game: game.id, state: host.serialize() }), 5000);
  draw();
}

// ---------------- đường đi nóng ----------------
/** Đầu vào tại chỗ (bàn phím / chuột của streamer): overlay chính xử lý ngay, overlay phụ chuyển qua gateway cho overlay chính. */
function sendInput(ev) {
  if (!ev?.type) return;
  if (role === 'leader' && game?.host) { applyFx(game.host.input(ev)); draw(); }
  else send({ t: 'in', ev });
}

function applyFx(fx) {
  if (!fx?.length || !game) return;
  for (const e of fx) { try { game.view.effect(e); } catch (err) { console.warn(err); } }
  fxOut.push(...fx);
  if (fx.some((e) => /_(start|win|timeout|reveal)$/.test(e.type || ''))) send({ t: 'save', game: game.id, state: game.host?.serialize() });
}

function draw() {
  if (!game?.host) return;
  const s = game.host.snapshot();
  if (s) { game.view.update(s); snapDirty = true; }
}

function onEvent(e, replay) {
  const fx = game.host.handle(e);
  applyFx(fx);
  draw();
  if (!replay && e.gwAt) requestAnimationFrame(() => { lat.push(Math.max(0, serverNow() - e.gwAt)); if (lat.length > 500) lat.shift(); });
}

// snapshot + hiệu ứng cho overlay phụ / dashboard xem trước (~6 lần / giây)
setInterval(() => {
  if (role !== 'leader' || !game?.host || !snapDirty) return;
  snapDirty = false;
  send({ t: 'snap', s: game.host.snapshot() });
  if (fxOut.length) { send({ t: 'fx', fx: fxOut.slice(-50) }); fxOut = []; }
}, 160);

// độ trễ gateway → vẽ (p50 / p95) gửi dashboard mỗi 5 giây
setInterval(() => {
  if (role !== 'leader' || !lat.length) return;
  const d = [...lat].sort((a, b) => a - b);
  send({ t: 'lat', lat: { p50: Math.round(d[Math.floor(d.length / 2)]), p95: Math.round(d[Math.floor(d.length * 0.95)]), n: d.length, rtt: game?.rtt ? Math.round(game.rtt) : null } });
  lat.length = 0;
}, 5000);

addEventListener('pagehide', () => { if (role === 'leader' && game?.host) send({ t: 'save', game: game.id, state: game.host.serialize() }); });

if (layer === 'widgets') document.documentElement.style.background = 'transparent';
if (!key) showNotice('Thiếu mã overlay trong link.');
else connect();

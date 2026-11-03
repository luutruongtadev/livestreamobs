import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Temple } from './temple.js';
import { TikTokBridge } from './tiktok.js';
import { TugWar } from './tugwar.js';
import { WordGame } from './wordgame.js';
import { ClaudeScorer, SimpleScorer } from './scorer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in out && typeof out[k] === 'object' && !Array.isArray(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}

function loadEnvFile() {
  // Nạp .env nếu có (Windows / chạy tay). Biến môi trường đã đặt sẵn được ưu tiên.
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    const val = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined && val !== '') process.env[m[1]] = val;
  }
}

function loadConfig() {
  loadEnvFile();
  let cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const local = path.join(ROOT, 'config.local.json');
  if (fs.existsSync(local)) cfg = deepMerge(cfg, JSON.parse(fs.readFileSync(local, 'utf8')));
  const env = process.env;
  if (env.TIKTOK_USERNAME) cfg.tiktokUsername = env.TIKTOK_USERNAME;
  if (env.SIGN_API_KEY) cfg.signApiKey = env.SIGN_API_KEY;
  if (env.HOST) cfg.server.host = env.HOST;
  if (env.PORT) cfg.server.port = Number(env.PORT);
  if (env.ADMIN_TOKEN) cfg.server.adminToken = env.ADMIN_TOKEN;
  return cfg;
}

const config = loadConfig();

// Docker/HTTPS: trang admin lộ ra internet nên bắt buộc có mật khẩu mạnh
if (process.env.REQUIRE_ADMIN_TOKEN === '1') {
  const t = config.server.adminToken || '';
  if (t.length < 12 || t === 'doi-mat-khau-nay') {
    console.error('[chua] ADMIN_TOKEN trong .env đang trống/yếu (cần ≥ 12 ký tự, khác mặc định). Sửa .env rồi chạy lại.');
    process.exit(1);
  }
}
const temple = new Temple(config, { statePath: path.join(ROOT, 'data', 'state.json') });
const tug = new TugWar(config.tugwar || {}, { statePath: path.join(ROOT, 'data', 'tugwar.json') });
const wgCfg = config.wordgame || {};
const hasClaudeCreds = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
const wgScorer = wgCfg.scorer === 'simple' || !hasClaudeCreds
  ? new SimpleScorer()
  : new ClaudeScorer({ model: process.env.WORDGAME_MODEL || wgCfg.model || 'claude-opus-5-5', cachePath: path.join(ROOT, 'data', 'wordscore-cache.json') });
if (wgScorer instanceof SimpleScorer) console.warn('[wordgame] Chưa có ANTHROPIC_API_KEY → chấm điểm đơn giản theo chữ (không hiểu nghĩa).');
const wg = new WordGame(wgCfg, { scorer: wgScorer, statePath: path.join(ROOT, 'data', 'wordgame.json') });
const tiktok = new TikTokBridge({ signApiKey: config.signApiKey });

// ---------------- WebSocket hub ----------------
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(data);
}

let stateTimer = null;
function scheduleState() {
  if (stateTimer) return;
  stateTimer = setTimeout(() => {
    stateTimer = null;
    broadcast({ type: 'state', state: temple.snapshot() });
  }, 200);
}

function publicConfig() {
  return {
    templeName: config.templeName,
    sounds: config.sounds,
    ambientVolume: config.ambientVolume,
    levels: config.levels.map((l) => l.name),
    commands: config.commands.map((c) => ({ action: c.action, label: c.label, keyword: c.keywords[0] })),
    merit: config.merit,
    hall: config.hall || {},
  };
}

wss.on('connection', (ws) => {
  send(ws, { type: 'hello', config: publicConfig(), state: temple.snapshot(), status: tiktok.status, tug: tug.snapshot(), wg: wg.snapshot() });
});

function ingest(ev) {
  const effects = temple.handle(ev);
  if (effects.length) broadcast({ type: 'fx', effects });
  scheduleState();
  tugBroadcast(tug.handle(ev));
  wgBroadcast(wg.handle(ev));
  return effects;
}

// ---------------- Đoán từ ----------------
let wgTimer = null;
function wgBroadcast(effects) {
  if (effects?.length) broadcast({ type: 'wgfx', effects });
  if (wgTimer) return;
  wgTimer = setTimeout(() => {
    wgTimer = null;
    broadcast({ type: 'wg', wg: wg.snapshot() });
  }, 150);
}
wg.on('effects', wgBroadcast);
let wgLastRemaining = -1;
setInterval(() => {
  const fx = wg.tick();
  const rem = wg.snapshot().remaining;
  if (fx.length || rem !== wgLastRemaining) { wgLastRemaining = rem; wgBroadcast(fx); }
}, 250).unref();

// ---------------- Kéo co ----------------
let tugTimer = null;
function tugBroadcast(effects) {
  if (effects?.length) broadcast({ type: 'tugfx', effects });
  if (tugTimer) return;
  tugTimer = setTimeout(() => {
    tugTimer = null;
    broadcast({ type: 'tug', tug: tug.snapshot() });
  }, 150);
}
let lastRemaining = -1;
setInterval(() => {
  const fx = tug.tick();
  const rem = tug.snapshot().remaining;
  if (fx.length || rem !== lastRemaining) { lastRemaining = rem; tugBroadcast(fx); }
}, 250).unref();

tiktok.on('event', ingest);
tiktok.on('status', (status) => {
  console.log(`[tiktok] ${status.state}: ${status.message}`);
  broadcast({ type: 'status', status });
});

setInterval(() => {
  const fx = temple.prunePlatforms();
  if (fx.length) { broadcast({ type: 'fx', effects: fx }); scheduleState(); }
}, 1000).unref();

setInterval(() => {
  temple.pruneCooldowns();
  if (temple.prunePresence()) scheduleState();
  try { temple.save(); } catch (e) { console.warn('[temple] save lỗi:', e.message); }
  try { tug.save(); } catch (e) { console.warn('[tugwar] save lỗi:', e.message); }
  try { wg.save(); } catch (e) { console.warn('[wordgame] save lỗi:', e.message); }
}, 5000).unref();

// ---------------- HTTP API ----------------
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.get('/', (_req, res) => res.redirect('/admin'));
app.get('/chanh-dien', (_req, res) => res.redirect('/chanhdien'));
app.get('/keo-co', (_req, res) => res.redirect('/keoco'));
app.get('/doan-tu', (_req, res) => res.redirect('/doantu'));

function requireAdmin(req, res, next) {
  const token = config.server.adminToken;
  if (!token) return next();
  if (req.get('x-admin-token') === token || req.query.token === token) return next();
  res.status(401).json({ error: 'Sai admin token' });
}

app.get('/api/status', (_req, res) => res.json({ status: tiktok.status, state: temple.snapshot(), config: publicConfig() }));

app.post('/api/connect', requireAdmin, async (req, res) => {
  try {
    const username = req.body?.username || config.tiktokUsername;
    await tiktok.connect(username);
    res.json({ ok: true, status: tiktok.status });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/disconnect', requireAdmin, async (_req, res) => {
  await tiktok.disconnect();
  res.json({ ok: true, status: tiktok.status });
});

let simCounter = 0;
app.post('/api/simulate', requireAdmin, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || 'Thí chủ ' + (++simCounter % 50)).slice(0, 40);
  const user = { id: 'sim:' + name, name, avatar: b.avatar || null };
  const ev = { ...b, user };
  if (!['like', 'comment', 'share', 'follow', 'gift', 'manual', 'member'].includes(ev.type)) {
    return res.status(400).json({ error: 'type không hợp lệ' });
  }
  res.json({ ok: true, effects: ingest(ev) });
});

app.post('/api/tug/:action', requireAdmin, (req, res) => {
  const a = req.params.action;
  if (a === 'next') tugBroadcast(tug.phase === 'playing' ? tug.finish() : tug.startRound());
  else if (a === 'restart') tugBroadcast(tug.startRound());
  else if (a === 'reset') { tug.resetAll(); tugBroadcast([{ type: 'tug_start', round: tug.roundNo }]); }
  else return res.status(400).json({ error: 'action: next | restart | reset' });
  res.json({ ok: true, tug: tug.snapshot() });
});

app.post('/api/wg/:action', requireAdmin, (req, res) => {
  const a = req.params.action;
  if (a === 'next') wgBroadcast(wg.skip());
  else if (a === 'hint') wgBroadcast(wg.revealHint(null));
  else if (a === 'word') {
    const w = String(req.body?.word || '').trim();
    if (!w) return res.status(400).json({ error: 'Thiếu từ' });
    wgBroadcast(wg.startRound({ word: w, hint: String(req.body?.hint || '') }));
  } else if (a === 'reset') wgBroadcast(wg.resetAll());
  else if (a === 'peek') { /* chỉ xem từ bí mật */ }
  else return res.status(400).json({ error: 'action: next | hint | word | reset | peek' });
  res.json({ ok: true, wg: { ...wg.snapshot(), secret: wg.secret } });
});

app.post('/api/reset', requireAdmin, (_req, res) => {
  temple.reset();
  temple.save();
  broadcast({ type: 'reset' });
  scheduleState();
  res.json({ ok: true });
});

// ---------------- Start ----------------
const { host, port } = config.server;
server.listen(port, host, () => {
  const base = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
  console.log('==============================================');
  console.log(`  ${config.templeName} đang chạy`);
  console.log(`  Overlay (OBS Browser Source): ${base}/overlay`);
  console.log(`  Bảng điều khiển:              ${base}/admin`);
  console.log('==============================================');
  if (config.autoConnect && config.tiktokUsername) {
    tiktok.connect(config.tiktokUsername).catch((e) => console.warn('[tiktok]', e.message));
  }
});

async function shutdown() {
  console.log('\nĐang lưu công đức và tắt...');
  try { temple.save(); tug.save(); wg.save(); } catch { /* bỏ qua */ }
  await tiktok.disconnect().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

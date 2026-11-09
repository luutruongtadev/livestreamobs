import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { TikTokBridge } from './tiktok.js';
import { WordGame } from './wordgame.js';
import { ClaudeScorer, SimpleScorer, compact } from './scorer.js';
import { WordBank, claudeClientFromEnv, cleanDesc, cleanEmoji, validWord } from './wordbank.js';
import { WordSetStore } from './wordsets.js';
import { SetGenerator, validSecretName, cleanAliases } from './setgen.js';
import { PauseController } from './pause.js';
import { WeeklyBoard } from './weekly.js';
import { Goodbye } from './goodbye.js';
import { Voice } from './voice.js';
import { AttrStore } from './attributes.js';
import { EnglishHintStore } from './englishhints.js';
import { GhepGame } from './ghep.js';
import { GiaiMaGame } from './giaima.js';

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
const wgCfg = config.wordgame || {};
const hasClaudeCreds = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
const wgScorer = wgCfg.scorer === 'simple' || !hasClaudeCreds
  ? new SimpleScorer()
  : new ClaudeScorer({ model: process.env.WORDGAME_MODEL || wgCfg.model || 'claude-opus-5-5', cachePath: path.join(ROOT, 'data', 'wordscore-cache.json') });
if (wgScorer instanceof SimpleScorer) console.warn('[wordgame] Chưa có ANTHROPIC_API_KEY → chấm điểm đơn giản theo chữ (không hiểu nghĩa).');
const wordBank = new WordBank({
  filePath: path.join(ROOT, 'data', 'wordbank.json'),
  fallbackWords: wgCfg.words || [],
  client: claudeClientFromEnv(),
  model: process.env.WORDGAME_GEN_MODEL || wgCfg.generatorModel || 'claude-opus-5-5',
  batchSize: wgCfg.batchSize || 100,
  minRemaining: wgCfg.minRemaining ?? 10,
  autoGenerate: wgCfg.autoGenerate !== false,
  refillWhenEmpty: wgCfg.refillWhenEmpty !== false,
  refillCount: wgCfg.refillCount || 200,
  difficulty: process.env.WORDGAME_DIFFICULTY || wgCfg.difficulty || 'hard',
});
// Bộ từ riêng: wordsets/<id>.json (có sẵn trong repo) + data/wordsets/<id>.json (tạo / sửa bằng Claude)
const setStore = new WordSetStore({ repoDir: path.join(ROOT, 'wordsets'), dataDir: path.join(ROOT, 'data', 'wordsets') });
const wordSets = setStore.sets;
const setGen = new SetGenerator({ client: claudeClientFromEnv(), model: process.env.WORDGAME_GEN_MODEL || wgCfg.generatorModel || 'claude-opus-5-5' });
let genJob = null; // { state: 'running' | 'done' | 'error', message, setId }
const weekly = new WeeklyBoard(wgCfg.weekly || {}, { statePath: path.join(ROOT, 'data', 'weekly.json') });
// Chế độ "Đoán thuộc tính": Claude xếp 24 thuộc tính nghĩa cho mỗi từ (thanh điệu / chữ cái đầu tự tính) (một lần, lưu data/attributes.json)
const attrStore = new AttrStore({ client: claudeClientFromEnv(), model: process.env.WORDGAME_ATTR_MODEL || wgCfg.attrModel || 'claude-haiku-5-5', filePath: path.join(ROOT, 'data', 'attributes.json') });
// Chế độ "Gợi ý tiếng Anh": Claude soạn 5 gợi ý tiếng Anh cho mỗi từ (một lần, lưu data/english-hints.json)
const englishStore = new EnglishHintStore({ client: claudeClientFromEnv(), model: process.env.WORDGAME_GEN_MODEL || wgCfg.generatorModel || 'claude-opus-5-5', filePath: path.join(ROOT, 'data', 'english-hints.json') });
// kho từ soạn sẵn cho chế độ thuộc tính / tiếng Anh (modewords/*.json): thuộc tính & gợi ý có sẵn, không tốn Claude
const modeWords = {};
for (const [mode, file] of [['meaning', 'meaning.json'], ['attr', 'attr.json'], ['english', 'english.json']]) {
  try { modeWords[mode] = JSON.parse(fs.readFileSync(path.join(ROOT, 'modewords', file), 'utf8')).words || []; } catch (e) { console.warn(`[wordgame] không đọc được modewords/${file}:`, e.message); }
}
attrStore.seed(modeWords.attr || []);
// thuộc tính soạn sẵn cho ~670 từ có trong hệ thống (người xem hay đoán) → không tốn token khi gặp lại
try {
  const pre = JSON.parse(fs.readFileSync(path.join(ROOT, 'modewords', 'attr-cache.json'), 'utf8')).words || {};
  attrStore.seed(Object.entries(pre).map(([word, attrs]) => ({ word, attrs })));
} catch (e) { console.warn('[wordgame] không đọc được modewords/attr-cache.json:', e.message); }
englishStore.seed(modeWords.english || []);
const wg = new WordGame(wgCfg, { scorer: wgScorer, wordBank, wordSets, weekly, attrStore, englishStore, modeWords, statePath: path.join(ROOT, 'data', 'wordgame.json') });
const tiktok = new TikTokBridge({ signApiKey: config.signApiKey });
// Giọng MC (ElevenLabs, giọng Adam) đọc câu chúc mừng / cảm ơn trêu đùa do Claude viết — cần ELEVENLABS_API_KEY
const voice = new Voice(config.voice || {}, { apiKey: process.env.ELEVENLABS_API_KEY || null, claude: claudeClientFromEnv(), dir: path.join(ROOT, 'data', 'voice') });
if (voice.enabled) console.log('[voice] Giọng MC ElevenLabs: bật'); else if (!process.env.ELEVENLABS_API_KEY) console.log('[voice] Chưa có ELEVENLABS_API_KEY → đọc tên bằng giọng của trình duyệt');
const goodbye = new Goodbye(config.goodbye || {}, { statePath: path.join(ROOT, 'data', 'goodbye.json') });
// Tạm dừng game khi chưa live (không tốn từ / không chạy vòng trống); tắt bằng "autoPauseOffline": false
// Game "Ghép" (/ghep): bình luận "A + B" → ghép emoji kiểu Emoji Kitchen; quà ≥ 10 xu → trình diễn đặc biệt
const ghep = new GhepGame(config.ghep || {}, { client: claudeClientFromEnv(), filePath: path.join(ROOT, 'data', 'ghep.json') });
// Game "Giải mã" (/giaima): câu bí ẩn tiếng Việt mã bằng số, giải gợi ý (câu hỏi tiếng Việt, đáp án Việt / Anh) để lộ chữ — không tốn token
const giaima = new GiaiMaGame(config.giaima || {}, { weekly, filePath: path.join(ROOT, 'data', 'giaima.json') });
if (ghep.active && giaima.active) giaima.setActive(false); // chỉ 1 game phụ chạy cùng lúc
if (ghep.active) console.log('[ghep] đang bật game Ghép (Đoán từ tạm dừng)');
if (giaima.active) console.log('[giaima] đang bật game Giải mã (Đoán từ tạm dừng)');
// game đang chơi = Ghép / Giải mã / Đoán từ; game không được chọn thì đứng yên (giữ nguyên vòng)
const pauser = new PauseController([wg, giaima], {
  autoPauseOffline: config.autoPauseOffline !== false && process.env.AUTO_PAUSE_OFFLINE !== '0', online: false,
  hold: (g) => (g === giaima ? (giaima.active ? null : 'off') : ghep.active ? 'ghep' : giaima.active ? 'giaima' : null),
});

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

function publicConfig() {
  return { name: config.name || 'Đoán từ' };
}

wss.on('connection', (ws) => {
  send(ws, { type: 'hello', config: publicConfig(), status: tiktok.status, wg: wg.snapshot(), pause: pauser.status(), goodbye: goodbye.status(), voice: voice.publicState(), ghep: ghep.snapshot(), giaima: giaima.snapshot() });
});

function ingest(ev) {
  if (ghep.active) {
    // đang chơi Ghép: mọi bình luận / quà vào game Ghép, Đoán từ đứng yên
    const fx = ghep.handle(ev);
    ghepBroadcast(fx);
    return fx;
  }
  if (giaima.active) {
    // đang chơi Giải mã: bình luận / quà / tim vào game Giải mã
    const fx = giaima.handle(ev);
    giaimaBroadcast(fx);
    return fx;
  }
  const wgFx = wg.handle(ev);
  wgBroadcast(wgFx);
  lastWg = { effects: wgFx, reject: wg.lastReject };
  return wgFx;
}
let lastWg = null;

// ---------------- Đoán từ ----------------
let wgTimer = null;
function wgBroadcast(effects) {
  if (effects?.length) broadcast({ type: 'wgfx', effects });
  for (const e of effects || []) { if (e.type === 'wg_win') voice.win(e); else if (e.type === 'wg_thanks') voice.gift(e); }
  if (wgTimer) return;
  wgTimer = setTimeout(() => {
    wgTimer = null;
    broadcast({ type: 'wg', wg: wg.snapshot() });
  }, 150);
}
wg.on('effects', wgBroadcast);
let ghepTimer = null;
function ghepBroadcast(effects) {
  if (effects?.length) broadcast({ type: 'ghepfx', effects });
  if (ghepTimer) return;
  ghepTimer = setTimeout(() => { ghepTimer = null; broadcast({ type: 'ghep', ghep: ghep.snapshot() }); }, 300);
}
ghep.on('effects', ghepBroadcast);
let giaimaTimer = null;
function giaimaBroadcast(effects) {
  if (effects?.length) broadcast({ type: 'giaimafx', effects });
  // vừa có người tặng quà: giọng MC cảm ơn như Đoán từ
  for (const e of effects || []) if (e.type === 'gm_thanks') voice.gift(e);
  if (giaimaTimer) return;
  giaimaTimer = setTimeout(() => { giaimaTimer = null; broadcast({ type: 'giaima', giaima: giaima.snapshot() }); }, 150);
}
giaima.on('effects', giaimaBroadcast);
let giaimaLastRemaining = -1;
setInterval(() => {
  const fx = giaima.tick();
  const rem = giaima.remaining();
  if (fx.length || rem !== giaimaLastRemaining) { giaimaLastRemaining = rem; giaimaBroadcast(fx); }
}, 250).unref();
// giọng MC phát ở trang game đang chơi (Giải mã bật → trang /giaima, không thì /doantu) để không trùng tiếng
voice.on('voice', (v) => broadcast({ type: 'voice', game: giaima.active ? 'giaima' : 'wg', voice: v }));
voice.on('state', (st) => broadcast({ type: 'voice_state', voice: st }));
// số credit còn lại trên tài khoản ElevenLabs: lúc khởi động + mỗi 10 phút
if (voice.enabled) { voice.refreshAccount(); setInterval(() => voice.refreshAccount(), 10 * 60e3).unref(); }
let wgLastRemaining = -1;
setInterval(() => {
  const fx = wg.tick();
  const rem = wg.snapshot().remaining;
  if (fx.length || rem !== wgLastRemaining) { wgLastRemaining = rem; wgBroadcast(fx); }
}, 250).unref();

tiktok.on('event', ingest);
// đo độ trễ mỗi 15s: TikTok → server (bình luận về chậm) và từ đoán → có điểm (Claude chấm chậm) → hiện ở admin
setInterval(() => {
  const delay = { tiktok: tiktok.delayStats(), score: wg.scoreDelayStats() };
  if (delay.tiktok || delay.score || tiktok.replayed) tiktok.setStatus({ delay, replayed: tiktok.replayed });
}, 15_000).unref();
tiktok.on('status', (status) => {
  console.log(`[tiktok] ${status.state}: ${status.message}`);
  broadcast({ type: 'status', status });
  if (pauser.setOnline(status.state === 'connected')) pauseBroadcast();
});

// ---------------- Chào tạm biệt / kết thúc live theo giờ hẹn ----------------
function goodbyeBroadcast() { broadcast({ type: 'goodbye', goodbye: goodbye.status() }); }
setInterval(() => {
  const r = goodbye.tick();
  if (r === 'start') { console.log('[goodbye] tới giờ hẹn — chào tạm biệt'); goodbyeBroadcast(); }
  if (r === 'end') { goodbyeBroadcast(); if (pauser.sleep()) pauseBroadcast(); }
}, 1000).unref();

function pauseBroadcast() {
  const p = pauser.status();
  // game chạy lại (lên live lần sau / admin bấm Tiếp tục) → bỏ màn chào tạm biệt
  if (!p.paused && goodbye.active?.done && goodbye.cancel()) goodbyeBroadcast();
  console.log(`[pause] ${p.paused ? 'tạm dừng (' + p.reason + ')' : 'đang chạy'}`);
  broadcast({ type: 'pause', pause: p });
  wgBroadcast([]);
  giaimaBroadcast([]);
}

app.post('/api/pause', requireAdmin, (_req, res) => { if (pauser.pause()) pauseBroadcast(); res.json({ ok: true, pause: pauser.status() }); });
app.post('/api/resume', requireAdmin, (_req, res) => { if (pauser.resume()) pauseBroadcast(); res.json({ ok: true, pause: pauser.status() }); });
app.get('/api/pause', (_req, res) => res.json(pauser.status()));
// Hẹn giờ chào tạm biệt: { action: 'now' | 'cancel' | 'set', enabled, at: 'HH:MM', seconds, message }
app.post('/api/goodbye', express.json({ limit: '16kb' }), requireAdmin, (req, res) => {
  const b = req.body || {};
  try {
    if (b.action === 'now') goodbye.start(b.seconds ?? goodbye.cfg.seconds, b.message || goodbye.cfg.message);
    else if (b.action === 'cancel') { goodbye.cancel(); if (pauser.status().sleeping && pauser.resume()) pauseBroadcast(); }
    else goodbye.set(b);
  } catch (e) { return res.status(400).json({ error: e.message }); }
  goodbyeBroadcast();
  res.json({ ok: true, goodbye: goodbye.status(), pause: pauser.status() });
});

setInterval(() => {
  try { wg.save(); weekly.save(); attrStore.save(); englishStore.save(); ghep.save(); giaima.save(); } catch (e) { console.warn('[wordgame] save lỗi:', e.message); }
}, 5000).unref();

// ---------------- HTTP API ----------------
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(ROOT, 'public'), {
  extensions: ['html'],
  // HTML/JS/CSS: luôn hỏi lại server (ETag) để điện thoại / OBS nhận ngay bản mới sau mỗi lần deploy
  setHeaders(res, file) {
    if (/\.(html|js|css|webmanifest|json)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));
app.use('/voice', express.static(path.join(ROOT, 'data', 'voice'), { maxAge: '1h' }));
app.get('/', (_req, res) => res.redirect('/admin'));
app.get('/doan-tu', (_req, res) => res.redirect('/doantu'));

function requireAdmin(req, res, next) {
  const token = config.server.adminToken;
  if (!token) return next();
  if (req.get('x-admin-token') === token || req.query.token === token) return next();
  res.status(401).json({ error: 'Sai admin token' });
}

app.get('/api/status', (_req, res) => res.json({ status: tiktok.status, config: publicConfig() }));

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
  const name = String(b.name || 'Người xem ' + (++simCounter % 50)).slice(0, 40);
  const user = { id: 'sim:' + name, name, avatar: b.avatar || null };
  const ev = { ...b, user };
  if (!['like', 'comment', 'share', 'follow', 'gift', 'manual', 'member'].includes(ev.type)) {
    return res.status(400).json({ error: 'type không hợp lệ' });
  }
  const effects = ingest(ev);
  res.json({ ok: true, effects, wordgame: lastWg });
});

// Giọng MC: xem trạng thái / đọc thử
app.post('/api/voice/:action', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (req.params.action === 'test') {
    if (!voice.enabled) return res.status(400).json({ error: 'Chưa bật: cần ELEVENLABS_API_KEY trong .env trên VPS (và "voice.enabled": true)' });
    const by = { id: 'sim:test-voice', name: String(b.name || 'Minh Anh').slice(0, 40) };
    if (b.kind === 'gift') voice.gift({ by, giftName: b.giftName || 'Hoa hồng', repeat: Number(b.repeat) || 10, diamonds: Number(b.diamonds) || 10 });
    else voice.win({ by, answer: b.word || 'lò vi sóng', seconds: Number(b.seconds) || 7, hintLevel: 0, tier: b.tier || 'lightning', left: 280 });
  } else if (req.params.action === 'library') {
    if (!voice.enabled) return res.status(400).json({ error: 'Chưa bật: cần ELEVENLABS_API_KEY' });
    voice.buildLibrary(); // chạy nền
  } else if (req.params.action === 'status') await voice.refreshAccount();
  res.json({ ok: true, voice: voice.status() });
});

// Bảng xếp hạng tuần (admin): xem top + lịch sử, chốt tuần thủ công
app.post('/api/weekly/:action', requireAdmin, (req, res) => {
  const a = req.params.action;
  if (a === 'close') { const rec = weekly.closeWeek(); weekly.save(); wgBroadcast([]); return res.json({ ok: true, closed: rec, weekly: weekly.admin() }); }
  if (a === 'peek') return res.json({ ok: true, weekly: weekly.admin() });
  res.status(400).json({ error: 'action: peek | close' });
});

// Game Ghép: bật / tắt (Đoán từ tự dừng khi Ghép bật), thử combo / quà
app.get('/api/ghep', (_req, res) => res.json(ghep.snapshot()));
app.post('/api/ghep/:action', requireAdmin, (req, res) => {
  const b = req.body || {};
  const a = req.params.action;
  if (a === 'on' || a === 'off') {
    ghep.setActive(a === 'on');
    if (a === 'on' && giaima.active) { giaima.setActive(false); giaimaBroadcast([]); }
    ghep.save();
    pauser.apply();
    pauseBroadcast();
    ghepBroadcast([]);
    return res.json({ ok: true, ghep: ghep.snapshot(), pause: pauser.status() });
  }
  const name = String(b.name || 'Người thử').slice(0, 40);
  const user = { id: 'sim:' + name, name, avatar: null };
  let fx;
  if (a === 'combo') fx = ghep.handleComment(user, String(b.text || ''));
  else if (a === 'gift') fx = ghep.handleGift(user, { giftName: b.giftName || 'Hoa hồng', diamonds: Number(b.diamonds) || 10, repeatCount: 1 });
  else return res.status(404).json({ error: 'không rõ thao tác' });
  ghepBroadcast(fx);
  res.json({ ok: true, effects: fx });
});

// Game Giải mã: bật / tắt (Đoán từ & Ghép tự dừng khi bật), sang câu khác, chọn câu, mở chữ, thử bình luận / quà
app.get('/api/giaima', (_req, res) => res.json(giaima.snapshot()));
app.post('/api/giaima/:action', requireAdmin, (req, res) => {
  const b = req.body || {};
  const a = req.params.action;
  const name = String(b.name || 'Người thử').slice(0, 40);
  const user = { id: 'sim:' + name, name, avatar: null };
  let fx = [];
  try {
    if (a === 'on' || a === 'off') {
      giaima.setActive(a === 'on');
      if (a === 'on' && ghep.active) { ghep.setActive(false); ghep.save(); ghepBroadcast([]); }
      pauser.apply();
      pauseBroadcast();
    } else if (a === 'next') fx = giaima.skip();
    else if (a === 'phrase') {
      const text = String(b.phrase || '').trim();
      if (!text) return res.status(400).json({ error: 'Nhập câu bí ẩn' });
      fx = giaima.startRound(text);
    } else if (a === 'letter') { if (giaima.canPlay()) fx = giaima.revealLetters(1, null, { reason: 'admin', icon: '🛠️' }); }
    else if (a === 'comment') fx = giaima.handle({ type: 'comment', user, text: String(b.text || '') });
    else if (a === 'gift') fx = giaima.handle({ type: 'gift', user, giftName: b.giftName || 'Quà thử', diamonds: Number(b.diamonds) || 1, repeatCount: Number(b.repeat) || 1 });
    else if (a !== 'peek') return res.status(404).json({ error: 'action: on | off | next | phrase | letter | comment | gift | peek' });
  } catch (e) { return res.status(400).json({ error: e.message }); }
  giaima.dirty = true;
  giaimaBroadcast(fx);
  res.json({ ok: true, effects: fx, giaima: giaima.adminSnapshot(), pause: pauser.status() });
});

app.post('/api/wg/:action', requireAdmin, async (req, res) => {
  const a = req.params.action;
  // đặt / thêm từ đã chơi rồi (kể cả gần trùng) → vẫn làm nhưng nhắc admin
  const playedWarn = (w) => { const r = wordBank.lookup(w); return r?.played.length ? `“${w}” đã chơi rồi (${r.played.map((p) => p.word).join(', ')})` : null; };
  let warn = null;
  if (a === 'played') return res.json({ ok: true, played: wordBank.played(), stats: wordBank.stats() });
  if (a === 'lookup') return res.json({ ok: true, result: wordBank.lookup(String(req.body?.q || '').slice(0, 40)) });
  if (a === 'next') wgBroadcast(wg.skip());
  else if (a === 'hint') wgBroadcast(wg.revealHint(null));
  else if (a === 'word') {
    const w = String(req.body?.word || '').trim();
    if (!w) return res.status(400).json({ error: 'Thiếu từ' });
    warn = playedWarn(w);
    // đang chơi bộ riêng (LMHT, trend…) mà từ có trong bộ: dùng đủ gợi ý + biệt danh của bộ
    const inSet = wg.set?.words?.find((x) => compact(x.word) === compact(w));
    if (inSet) { wgBroadcast(wg.startRound(inSet)); return res.json({ ok: true, warn, wg: { ...wg.snapshot(), secret: wg.display }, bank: wordBank.stats(), sets: wg.listSets(), activeSet: wg.activeSet, genJob }); }
    const known = wordBank.hintsFor({ word: w });
    const desc = Array.isArray(req.body?.desc) ? req.body.desc.map(String).filter(Boolean).slice(0, 2) : known.desc;
    wgBroadcast(wg.startRound({ word: w, hint: String(req.body?.hint || known.hint || ''), desc, emoji: req.body?.emoji ?? known.emoji, ...(known.aliases ? { aliases: known.aliases } : {}) }));
  } else if (a === 'reset') wgBroadcast(wg.resetAll());
  else if (a === 'peek') { /* chỉ xem từ bí mật */ }
  else if (a === 'setwords') {
    const st = wordSets[req.body?.set];
    if (!st) return res.status(400).json({ error: 'Không có bộ từ này' });
    return res.json({ ok: true, words: st.words.map((w) => ({ word: w.word, hints: w.hints || [], aliases: w.aliases || [] })) });
  }
  else if (a === 'regen-hints') {
    // tạo lại 5 gợi ý cho 1 từ (mất ~10-30 giây) — trả kết quả khi xong
    const setId = String(req.body?.set || wg.activeSet);
    const st = wordSets[setId];
    if (!st) return res.status(400).json({ error: 'Chọn một bộ từ riêng (không phải bộ từ vựng)' });
    const word = String(req.body?.word || (setId === wg.activeSet ? wg.display : '') || '').trim();
    try {
      const entry = await setGen.regenerateHints({ set: st, word, note: req.body?.note });
      const copy = { ...st, words: st.words.map((w) => (w.word === entry.word ? { ...w, ...entry } : w)) };
      setStore.save(setId, copy);
      wgBroadcast(wg.updateWord(setId, entry));
      return res.json({ ok: true, entry, wg: { ...wg.snapshot(), secret: wg.display }, sets: wg.listSets(), activeSet: wg.activeSet, bank: wordBank.stats(), genJob });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }
  else if (a === 'genset') {
    if (genJob?.state === 'running') return res.status(409).json({ error: 'Đang tạo một bộ khác, chờ chút' });
    const topic = String(req.body?.topic || '').trim();
    if (!topic) return res.status(400).json({ error: 'Nhập chủ đề' });
    genJob = { state: 'running', message: `Đang tạo bộ "${topic}"…`, startedAt: Date.now() };
    setGen.generateSet({ topic, count: Number(req.body?.count) || 50 })
      .then((set) => {
        const id = setStore.newId(topic);
        setStore.save(id, set);
        genJob = { state: 'done', message: `Đã tạo bộ "${set.title}" (${set.words.length} từ)`, setId: id };
        wgBroadcast([]);
      })
      .catch((e) => { genJob = { state: 'error', message: `Tạo bộ lỗi: ${e.message}` }; });
  }
  else if (a === 'delset') {
    const id = String(req.body?.set || '');
    try {
      const r = setStore.remove(id);
      if (wg.activeSet === id && !wordSets[id]) wgBroadcast(wg.setWordSet('tu-vung'));
      genJob = { state: 'done', message: r === 'restored' ? 'Đã khôi phục bộ về bản gốc' : 'Đã xoá bộ từ' };
    } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  else if (a === 'set') {
    try { wgBroadcast(wg.setWordSet(String(req.body?.set || ''))); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  else if (a === 'generate') {
    // trả lời ngay, tạo nền (mất khoảng 20-60 giây); xem tiến độ bằng 'peek'
    wordBank.generate({ theme: req.body?.theme, count: req.body?.count }).catch(() => {});
  }
  else if (a === 'addword') {
    // admin tự thêm từ mới kèm gợi ý → lưu vào bộ đang chơi, rồi chơi ngay hoặc xếp hàng ưu tiên
    const b = req.body || {};
    const word = String(b.word || '').trim().replace(/\s+/g, ' ');
    const inSet = wg.activeSet !== 'tu-vung';
    if (!word) return res.status(400).json({ error: 'Thiếu từ' });
    warn = playedWarn(word);
    if (inSet ? !validSecretName(word) : !validWord(word)) return res.status(400).json({ error: inSet ? 'Từ tối đa 4 tiếng / 24 ký tự, phải có chữ cái' : 'Từ chỉ gồm chữ cái, 1-4 tiếng, tối đa 24 ký tự' });
    const raw = [b.hint1, b.hint2].map((x) => String(x || '').split(/\s*[,;·]\s*/).filter(Boolean).join(' · ')).filter(Boolean);
    if (raw.length < 1) return res.status(400).json({ error: 'Cần ít nhất gợi ý 1' });
    const desc = cleanDesc(word, raw);
    if (desc.length < raw.length) return res.status(400).json({ error: `Gợi ý đang lộ chữ của đáp án: "${raw.find((x) => !desc.includes(x.replace(/[.。]+$/, '')))}" — sửa lại nhé` });
    const emojiIn = String(b.emoji || '').trim();
    const emoji = cleanEmoji(emojiIn);
    if (emojiIn && !emoji) return res.status(400).json({ error: 'Emoji cần đủ 3 cái (vd 🧭 🗺️ ⛵), hoặc để trống' });
    const aliases = cleanAliases(word, String(b.aliases || '').split(',').map((x) => x.trim()).filter(Boolean));
    let entry;
    try {
      if (inSet) {
        setStore.addWord(wg.activeSet, { word, aliases, hints: [...desc, ...(emoji ? [emoji] : [])], addedBy: 'admin', addedAt: new Date().toISOString() });
        entry = { word, aliases, desc, emoji };
      } else {
        const w = wordBank.addManual({ word, hint: b.topic, desc, emoji });
        entry = { word: w.word, hint: w.hint, aliases, desc, emoji };
      }
    } catch (e) { return res.status(400).json({ error: e.message }); }
    if (b.mode === 'now') wgBroadcast(wg.startRound(entry));
    else wg.enqueue(entry);
    wg.dirty = true;
  }
  else if (a === 'clearqueue') { wg.priority = []; wg.dirty = true; }
  else if (a === 'settings') {
    // kiểu chơi (luân phiên / gần nghĩa / thuộc tính), số vòng mỗi lần đổi, số tim mở 1 chữ
    if (req.body && Object.keys(req.body).length) { wg.applySettings(req.body); wgBroadcast([]); }
  }
  else if (a === 'team') {
    // chế độ đấu đội: op = on | off | reset (xoá đội + điểm, trận mới), rounds = số vòng mỗi trận
    const b = req.body || {};
    if (b.rounds) wg.teams.setRounds(Number(b.rounds));
    if (b.op === 'on') wg.teams.setOn(true);
    else if (b.op === 'off') wg.teams.setOn(false);
    else if (b.op === 'reset') wg.teams.reset();
    wg.dirty = true;
    wgBroadcast([{ type: 'wg_team_mode', on: wg.teams.on, op: b.op || 'rounds' }]);
  }
  else if (a === 'backfill') {
    // bổ sung 2 câu mô tả + 3 emoji cho từ cũ / từ có sẵn (mỗi lần tối đa 60 từ, chạy nền)
    if (genJob?.state === 'running') return res.status(409).json({ error: 'Đang chạy một việc khác, chờ chút' });
    if (!wordBank.client) return res.status(400).json({ error: 'Chưa có ANTHROPIC_API_KEY' });
    genJob = { state: 'running', message: `Đang soạn gợi ý mô tả + emoji cho ${Math.min(60, wordBank.missingHints().length)} từ…`, startedAt: Date.now() };
    wordBank.backfillHints({ limit: 60 })
      .then((r) => { genJob = { state: 'done', message: `Đã bổ sung gợi ý cho ${r.added} từ${r.remaining ? ` · còn ${r.remaining} từ, bấm tiếp để làm nốt` : ' · xong hết'}` }; })
      .catch((e) => { genJob = { state: 'error', message: `Bổ sung gợi ý lỗi: ${e.message}` }; });
  }
  else return res.status(400).json({ error: 'action: next | hint | word | reset | peek | generate | addword | clearqueue | settings | team | backfill | set | setwords | regen-hints | genset | delset' });
  res.json({ ok: true, warn, wg: { ...wg.snapshot(), secret: wg.display }, bank: wordBank.stats(), sets: wg.listSets(), activeSet: wg.activeSet, genJob, queue: wg.priority.map((w) => w.word), settings: { ...wg.settings(), aiAvailable: attrStore.available, nextMode: wg.nextMode(), modeWords: wg.modeWordStats() } });
});

// ---------------- Start ----------------
const { host, port } = config.server;
server.listen(port, host, () => {
  const base = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
  console.log('==============================================');
  console.log('  Đoán từ đang chạy');
  console.log(`  Màn hình game (OBS / điện thoại): ${base}/doantu`);
  console.log(`  Game Ghép (bật ở admin):          ${base}/ghep`);
  console.log(`  Game Giải mã (bật ở admin):       ${base}/giaima`);
  console.log(`  Bảng điều khiển:                  ${base}/admin`);
  console.log('==============================================');
  if (config.autoConnect && config.tiktokUsername) {
    tiktok.connect(config.tiktokUsername).catch((e) => console.warn('[tiktok]', e.message));
  }
});

async function shutdown() {
  console.log('\nĐang lưu dữ liệu và tắt...');
  try { wg.save(); weekly.save(); attrStore.save(); englishStore.save(); ghep.dirty = true; ghep.save(); giaima.dirty = true; giaima.save(); } catch { /* bỏ qua */ }
  await tiktok.disconnect().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Gateway của nền tảng: HTTP (trang web, file game, SDK) + WebSocket /ws (đường đi nóng).
//   node gateway/index.js            (PORT mặc định 8787)
// Biến môi trường: SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, SIGN_API_KEY,
//   GATEWAY_DEV_TOKEN (hoặc ADMIN_TOKEN) khi chưa có Supabase, secret của từng game (manifest.secrets).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listGames, readGame, loadGameServer } from '#sdk/node';
import { Gateway } from './gateway.js';
import { storeFromEnv } from './store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2' };
// phần của game được phục vụ cho trình duyệt — KHÔNG BAO GIỜ server/, test/, supabase/
const GAME_PUBLIC = new Set(['manifest.json', 'settings.schema.json', 'README.md', 'engine', 'render', 'data', 'assets', 'i18n']);

/** Đọc .env ở thư mục gốc (nếu có) — giá trị đã có trong môi trường được ưu tiên. */
export function loadDotEnv(file, env = process.env) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* không có .env */ }
}

/** Danh mục game cho dashboard / trang chủ (manifest + schema), bỏ game "retired". */
export function buildCatalog(gamesDir) {
  return listGames(gamesDir).filter((g) => !g.errors.length && g.manifest.status !== 'retired').map((g) => {
    const { manifest, schema } = readGame(g.dir);
    const { data, secrets, ...pub } = manifest; // không lộ tên secret / đường dẫn dữ liệu ra ngoài (data vẫn tải theo manifest.json)
    return { ...pub, hasData: !!data, schema };
  });
}

/** Nạp phần server của game có manifest.server (mỗi game chỉ nhận secret khai báo trong manifest.secrets). */
export async function loadGameServers(gamesDir, { env = process.env, dataDir, log = console } = {}) {
  const out = {};
  for (const g of listGames(gamesDir)) {
    if (!g.manifest.server || g.errors.length) continue;
    try {
      const mod = await loadGameServer(g.dir);
      const secrets = Object.fromEntries((g.manifest.secrets || []).filter((k) => env[k] !== undefined).map((k) => [k, env[k]]));
      out[g.id] = await mod.createServer({ secrets, dataDir: path.join(dataDir, 'games', g.id), log, config: {} });
      log.log?.(`[gateway] phần server của game "${g.id}" sẵn sàng`);
    } catch (e) { log.warn?.(`[gateway] không nạp được server của game "${g.id}": ${e.message}`); }
  }
  return out;
}

function safeJoin(base, rel) {
  const p = path.resolve(base, rel);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

/** Đường dẫn URL → file được phép phục vụ (hoặc null). */
export function resolveStatic(urlPath, root = ROOT) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (p.includes('\0')) return null;
  if (p === '/' || p === '/index.html') return path.join(root, 'web', 'index.html');
  if (p === '/app' || p === '/app/') return path.join(root, 'web', 'app.html');
  if (/^\/o\/[A-Za-z0-9]{8,80}\/?$/.test(p)) return path.join(root, 'web', 'overlay.html');
  if (p.startsWith('/web/')) return safeJoin(path.join(root, 'web'), p.slice(5));
  if (p.startsWith('/sdk/')) {
    const rel = p.slice(5);
    if (/^(node|testing)(\/|$)/.test(rel)) return null; // chỉ phần chạy được trên trình duyệt
    return safeJoin(path.join(root, 'packages', 'sdk', 'src'), rel);
  }
  const m = /^\/games\/([a-z][a-z0-9-]{1,31})\/(.+)$/.exec(p);
  if (m && GAME_PUBLIC.has(m[2].split('/')[0])) return safeJoin(path.join(root, 'games', m[1]), m[2]);
  return null;
}

export function createHttpHandler({ root = ROOT, catalog, publicConfig }) {
  const catalogJson = JSON.stringify(catalog);
  const configJs = `window.PLATFORM = ${JSON.stringify(publicConfig)};\n`;
  return (req, res) => {
    const url = new URL(req.url, 'http://x');
    const head = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, head); return res.end(); }
    if (url.pathname === '/health') { res.writeHead(200, { ...head, 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
    if (url.pathname === '/api/games') { res.writeHead(200, { ...head, 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache' }); return res.end(catalogJson); }
    if (url.pathname === '/config.js') { res.writeHead(200, { ...head, 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache' }); return res.end(configJs); }
    const file = resolveStatic(url.pathname, root);
    if (!file) { res.writeHead(404, head); return res.end('Không tìm thấy'); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, head); return res.end('Không tìm thấy'); }
      const ext = path.extname(file).toLowerCase();
      const isData = /\/data\/|\\data\\/.test(file) || ['.png', '.jpg', '.webp', '.mp3', '.ogg', '.woff2'].includes(ext);
      res.writeHead(200, { ...head, 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': isData ? 'public, max-age=3600' : 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  };
}

async function main() {
  loadDotEnv(path.join(ROOT, '.env'));
  const env = process.env;
  const dataDir = path.join(ROOT, 'data');
  const gamesDir = path.join(ROOT, 'games');
  const store = storeFromEnv(env, { dataDir });
  const catalog = buildCatalog(gamesDir);
  const gameServers = await loadGameServers(gamesDir, { env, dataDir });
  const { TikTokBridge } = await import('../server/tiktok.js');
  const gw = new Gateway({ store, catalog, gameServers, bridgeFactory: () => new TikTokBridge({ signApiKey: env.SIGN_API_KEY }) });
  // tên đăng nhập → email nội bộ <tên>@<usernameDomain>; cố định sau lần deploy đầu (đổi là mất đăng nhập của tài khoản cũ)
  const usernameDomain = String(env.AUTH_USERNAME_DOMAIN || env.PLAY_DOMAIN || 'localhost').toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '');
  const publicConfig = { supabaseUrl: env.SUPABASE_URL || null, supabaseKey: env.SUPABASE_PUBLISHABLE_KEY || null, store: store.kind, usernameDomain };
  const server = http.createServer(createHttpHandler({ catalog, publicConfig }));
  gw.attach(server);
  const port = Number(env.GATEWAY_PORT || env.PORT || 8787);
  server.listen(port, env.HOST || '0.0.0.0', () => {
    console.log(`[gateway] http://localhost:${port}  ·  ${catalog.length} game: ${catalog.map((g) => g.id).join(', ')}  ·  lưu trữ: ${store.kind}`);
  });
  const stop = async () => { await gw.close(); server.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => { for (const s of Object.values(gameServers)) { try { s.save?.(); } catch { /* bỏ qua */ } } }, 10_000).unref();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

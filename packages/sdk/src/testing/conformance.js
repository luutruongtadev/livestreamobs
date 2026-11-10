// Bộ test chuẩn: game nào cũng phải qua trước khi lên nền tảng.
// Dùng trong games/<id>/test/conformance.test.js:   runConformance(new URL('..', import.meta.url))
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateManifest, EVENT_TYPES } from '../manifest.js';
import { validate, withDefaults, missingDefaults } from '../schema.js';
import { createHost } from '../host.js';
import { seededRandom, fakeClock } from '../random.js';
import { readGame, loadGame } from '../node/loader.js';

const toDir = (d) => (d instanceof URL ? fileURLToPath(d) : String(d));

/** Mọi file .js trong thư mục (đệ quy). */
function jsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? jsFiles(p) : e.name.endsWith('.js') ? [p] : [];
  });
}

/** Các import / export-from / import() trong một file (đủ cho mã nguồn ESM của game). */
export function importsOf(src) {
  const out = [];
  const re = /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm;
  let m;
  while ((m = re.exec(src))) out.push(m[1] || m[2] || m[3]);
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

/**
 * Luật cách ly: file của game chỉ được import '#sdk' (+ '#sdk/...' trừ '#sdk/node', '#sdk/testing' — chỉ cho server / test),
 * đường dẫn tương đối NẰM TRONG thư mục game, và (chỉ phần server) thư viện npm / node:*.
 */
export function isolationErrors(gameDir) {
  const errs = [];
  const root = path.resolve(gameDir);
  for (const part of ['engine', 'render', 'server', 'dashboard']) {
    for (const file of jsFiles(path.join(root, part))) {
      const rel = path.relative(root, file);
      for (const spec of importsOf(fs.readFileSync(file, 'utf8'))) {
        if (spec.startsWith('.')) {
          const target = path.resolve(path.dirname(file), spec);
          if (!target.startsWith(root + path.sep)) errs.push(`${rel}: import "${spec}" ra ngoài thư mục game`);
          else if (part !== 'server' && path.relative(root, target).split(path.sep)[0] === 'server') errs.push(`${rel}: ${part} không được import phần server ("${spec}")`);
        } else if (spec === '#sdk' || spec.startsWith('#sdk/')) {
          if (part !== 'server' && /^#sdk\/(node|testing)/.test(spec)) errs.push(`${rel}: "${spec}" chỉ dùng ở server / test`);
        } else if (part === 'server') {
          // server được dùng node:* và thư viện npm
        } else {
          errs.push(`${rel}: ${part} chỉ được import '#sdk' và file trong game, không được "${spec}"`);
        }
      }
    }
  }
  return errs;
}

/** Engine không đụng DOM / network / timer toàn cục (để chạy được ở mọi nơi và test tái lập được). */
export function engineGlobalsErrors(gameDir) {
  const errs = [];
  const banned = /\b(document|window|localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket|setInterval|setTimeout|requestAnimationFrame|process\.env|Date\.now|Math\.random)\b/g;
  for (const file of jsFiles(path.join(gameDir, 'engine'))) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const hits = new Set([...src.matchAll(banned)].map((m) => m[1]));
    if (hits.size) errs.push(`${path.relative(gameDir, file)}: engine không được dùng ${[...hits].join(', ')} (dùng ctx.now / ctx.random / ctx.server)`);
  }
  return errs;
}

const junk = [
  { type: 'comment', user: { id: 'u1', name: 'A' }, text: '' },
  { type: 'comment', user: { id: 'u2', name: 'B' }, text: '🎉🎉🎉' },
  { type: 'comment', user: { id: 'u3', name: 'C' }, text: 'x'.repeat(5000) },
  { type: 'comment', user: null, text: 'không có người' },
  { type: 'comment', user: { id: 'u4', name: 'D' }, text: '12 34 ٥٦ ７８' },
  { type: 'gift', user: { id: 'u5', name: 'E' }, giftName: 'Rose', diamonds: 1, count: 3 },
  { type: 'gift', user: { id: 'u6', name: 'F' }, giftName: 'Galaxy', diamonds: 1000, count: 1, streakTotal: 1 },
  { type: 'gift', user: { id: 'u6', name: 'F' }, giftName: '???', diamonds: -5 },
  { type: 'like', user: { id: 'u7', name: 'G' }, count: 5000 },
  { type: 'follow', user: { id: 'u8', name: 'H' } },
  { type: 'share', user: { id: 'u9', name: 'I' } },
  { type: 'member', user: { id: 'u10', name: 'J' } },
  { type: 'unknown-type', user: { id: 'u11', name: 'K' } },
];

/** Chuỗi sự kiện tất định để so tái lập. */
function script(n = 200) {
  const r = seededRandom(42);
  const words = ['một', 'hai', 'mặt trời', '1234', '56789', 'đội đỏ', 'xin chào', '42', 'con mèo', '9876543'];
  return Array.from({ length: n }, (_, i) => {
    const u = { id: `v${Math.floor(r() * 30)}`, name: `Người ${i % 30}` };
    const k = r();
    if (k < 0.75) return { type: 'comment', user: u, text: words[Math.floor(r() * words.length)] };
    if (k < 0.85) return { type: 'like', user: u, count: 1 + Math.floor(r() * 50) };
    if (k < 0.95) return { type: 'gift', user: u, giftName: ['Rose', 'Finger Heart', 'Doughnut'][Math.floor(r() * 3)], diamonds: [1, 5, 30][Math.floor(r() * 3)], count: 1 };
    return { type: 'share', user: u };
  });
}

function makeHost(game, { seed = 7, settings, clock = fakeClock(), errors } = {}) {
  const server = { request: async () => ({}) };
  const host = createHost(game, { settings, data: game.data, now: clock.now, random: seededRandom(seed), server, log: {}, onError: (e) => errors?.push(e) });
  return { host, clock };
}

function run(host, clock, events) {
  for (const ev of events) { host.handle(ev); clock.advance(137); host.tick(); }
  for (let i = 0; i < 40; i++) { clock.advance(1000); host.tick(); }
  return host.snapshot();
}

/** Đăng ký bộ test chuẩn cho một game. */
export function runConformance(gameDir, { perfBudgetMs = 1 } = {}) {
  const dir = toDir(gameDir);
  const name = path.basename(path.resolve(dir));

  test(`[chuẩn module] ${name}: manifest, schema, cấu trúc thư mục`, () => {
    const { manifest, schema } = readGame(dir);
    assert.deepEqual(validateManifest(manifest), [], 'manifest.json hợp lệ');
    assert.equal(manifest.id, name, 'id trùng tên thư mục');
    assert.equal(schema.type, 'object', 'settings.schema.json là object');
    assert.deepEqual(missingDefaults(schema), [], 'mọi trường cài đặt có default');
    assert.deepEqual(validate(schema, withDefaults(schema, {})), [], 'default qua được validate');
    for (const f of ['engine/index.js', 'render/index.js', 'README.md']) assert.ok(fs.existsSync(path.join(dir, f)), `có ${f}`);
    assert.equal(fs.existsSync(path.join(dir, 'server', 'index.js')), !!manifest.server, 'manifest.server khớp với việc có server/index.js');
    assert.ok(fs.existsSync(path.join(dir, 'i18n', 'vi.json')), 'có i18n/vi.json');
  });

  test(`[chuẩn module] ${name}: cách ly (import, biến toàn cục)`, () => {
    assert.deepEqual(isolationErrors(dir), []);
    assert.deepEqual(engineGlobalsErrors(dir), []);
  });

  test(`[chuẩn module] ${name}: render import được ở Node (không đụng DOM khi import), có mount()`, async () => {
    const r = await import(pathToFileURL(path.join(dir, 'render', 'index.js')).href);
    assert.equal(typeof r.mount, 'function');
  });

  test(`[chuẩn module] ${name}: engine theo hợp đồng, chịu được dữ liệu rác, mọi action / command chạy được`, async () => {
    const game = await loadGame(dir);
    const errors = [];
    const { host, clock } = makeHost(game, { errors });
    assert.equal(host.status().state, 'running', 'createGame chạy được với cài đặt mặc định');
    for (const ev of junk) { assert.ok(Array.isArray(host.handle(ev))); clock.advance(300); host.tick(); }
    for (const t of EVENT_TYPES.filter((x) => game.manifest.inputs.includes(x))) host.handle({ type: t, user: { id: 'z', name: 'Z' }, text: 'abc', count: 1, diamonds: 1, giftName: 'Rose' });
    const g = game.createGame({ settings: host.settings, data: game.data, now: clock.now, random: seededRandom(1), server: { request: async () => ({}) }, storage: { get() {}, set() {} }, report: { round() {}, points() {} }, bindings: { view: () => [], reset() {} }, log: {} });
    for (const fn of ['handle', 'action', 'command', 'tick', 'snapshot', 'serialize', 'restore']) assert.equal(typeof g[fn], 'function', `game.${fn}()`);
    for (const a of game.manifest.actions || []) {
      const r = g.action(a.id, { type: 'gift', user: { id: 'z', name: 'Z' }, giftName: 'x', count: 1 }, { id: a.id, action: a.id, trigger: a.defaultTriggers?.[0] || { type: 'follow' }, label: a.label, params: a.params || {} });
      assert.ok(Array.isArray(r) || r === false, `action ${a.id} trả mảng hiệu ứng (hoặc false = không áp dụng được)`);
    }
    for (const c of game.manifest.commands || []) assert.ok(Array.isArray(g.command(c.id, {})), `command ${c.id} trả mảng`);
    g.destroy?.();
    assert.deepEqual(errors.map((e) => `${e.where}: ${e.message}`), [], 'không có lỗi nào trong lúc chạy');
  });

  test(`[chuẩn module] ${name}: tái lập được + snapshot JSON + restore`, async () => {
    const game = await loadGame(dir);
    const events = script();
    const a = makeHost(game);
    const b = makeHost(game);
    const sa = run(a.host, a.clock, events);
    const sb = run(b.host, b.clock, events);
    assert.deepEqual(sa, sb, 'cùng seed + cùng chuỗi sự kiện → cùng snapshot');
    assert.deepEqual(JSON.parse(JSON.stringify(sa)), sa, 'snapshot tuần tự hoá được JSON');
    const saved = a.host.serialize();
    assert.ok(saved && typeof saved === 'object', 'serialize() trả object');
    const json = JSON.parse(JSON.stringify(saved));
    assert.deepEqual(json, saved, 'serialize() tuần tự hoá được JSON');
    const errors = [];
    const c = makeHost(game, { clock: a.clock, errors });
    c.host.restore(json);
    c.host.restore({ rác: true }); // dữ liệu hỏng không được làm sập game
    c.host.restore(json);
    assert.deepEqual(errors, [], 'restore không lỗi');
    if (game.manifest.restore === 'full') assert.deepEqual(c.host.snapshot(), sa, 'restore(serialize()) cho cùng trạng thái');
  });

  test(`[chuẩn module] ${name}: handle() đủ nhanh cho đường đi nóng (p95 < ${perfBudgetMs} ms)`, async () => {
    const game = await loadGame(dir);
    const { host, clock } = makeHost(game);
    const events = script(1000);
    const times = [];
    for (const ev of events) {
      const t0 = performance.now();
      host.handle(ev);
      times.push(performance.now() - t0);
      clock.advance(20); // 50 sự kiện / giây
      if (times.length % 12 === 0) host.tick();
    }
    times.sort((x, y) => x - y);
    const p95 = times[Math.floor(times.length * 0.95)];
    assert.ok(p95 < perfBudgetMs, `p95 = ${p95.toFixed(3)} ms`);
  });
}

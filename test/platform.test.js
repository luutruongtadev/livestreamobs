// Test cấp nền tảng: mọi game trong games/ đều theo chuẩn module và không đụng nhau.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listGames, loadGame } from '#sdk/node';
import { createHost, fakeClock, seededRandom } from '#sdk';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = path.join(ROOT, 'games');

test('registry: mọi game có manifest hợp lệ, id trùng tên thư mục, có test chuẩn (conformance)', () => {
  const games = listGames(GAMES);
  assert.ok(games.length >= 2, 'có ít nhất doantu + memory');
  for (const g of games) {
    assert.deepEqual(g.errors, [], `${g.id}: manifest`);
    const conf = path.join(g.dir, 'test', 'conformance.test.js');
    assert.ok(fs.existsSync(conf) && fs.readFileSync(conf, 'utf8').includes('runConformance'), `${g.id}: thiếu test/conformance.test.js`);
  }
  assert.equal(new Set(games.map((g) => g.id)).size, games.length, 'id không trùng');
});

test('hai game chạy song song trên cùng nền tảng không ảnh hưởng nhau (state, bindings, lỗi)', async () => {
  const [doantu, memory] = await Promise.all([loadGame(path.join(GAMES, 'doantu')), loadGame(path.join(GAMES, 'memory'))]);
  const clock = fakeClock();
  const server = { request: async () => ({}) };
  const a = createHost(doantu, { data: doantu.data, now: clock.now, random: seededRandom(1), server, log: {} });
  const b = createHost(memory, { data: memory.data, now: clock.now, random: seededRandom(1), server, log: {} });
  const rose = { type: 'gift', user: { id: 'g', name: 'G' }, giftName: 'Rose', diamonds: 1, count: 1 };
  clock.advance(10_000); b.tick(); // memory sang pha trả lời
  const fa = a.handle(rose), fb = b.handle(rose);
  assert.ok(fa.some((e) => e.type === 'wg_progress'), 'Đoán từ: Rose gom 1/5');
  assert.ok(fb.some((e) => e.type === 'mm_flash'), 'Nhớ số: Rose hiện lại số — cùng quà, mỗi game một action riêng');
  const before = JSON.stringify(b.snapshot());
  for (let i = 0; i < 20; i++) a.handle({ type: 'comment', user: { id: `u${i}`, name: 'x' }, text: `từ ${i}` });
  assert.equal(JSON.stringify(b.snapshot()), before, 'sự kiện của game này không đổi state game kia');
});

test('template new-game sinh ra game qua được bộ test chuẩn', () => {
  const id = `zz-tmpl-${process.pid}`;
  const dir = path.join(GAMES, id);
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'new-game.mjs'), id, 'Game thử'], { cwd: ROOT, stdio: 'pipe' });
    assert.ok(fs.existsSync(path.join(dir, 'manifest.json')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).id, id);
    const out = execFileSync(process.execPath, [...process.execArgv, '--test', path.join(dir, 'test', 'conformance.test.js')], { cwd: ROOT, stdio: 'pipe' }).toString();
    assert.match(out, /# fail 0/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

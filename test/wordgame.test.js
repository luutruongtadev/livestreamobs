import test from 'node:test';
import assert from 'node:assert/strict';
import { WordGame, parseGuess } from '../server/wordgame.js';
import { ClaudeScorer, simpleScore, isExact } from '../server/scorer.js';

const u = (id) => ({ id, name: id, avatar: null });
const fakeScorer = (table) => ({ calls: [], score(secret, word) { this.calls.push(word); return Promise.resolve({ score: table[word] ?? 5, source: 'fake' }); } });
const flush = () => new Promise((r) => setImmediate(r));
const mk = (scorer, now = () => 0, cfg = {}) => new WordGame({ words: [{ word: 'mặt trời', hint: 'Thiên nhiên' }], cooldownSec: 2, ...cfg }, { scorer, now });

test('parseGuess: nhận từ ngắn, bỏ câu dài / link / emoji', () => {
  assert.equal(parseGuess('  Mặt TRĂNG!! 🌙 '), 'mặt trăng');
  assert.equal(parseGuess('hôm nay trời đẹp quá ta ơi'), null);
  assert.equal(parseGuess('https://abc.com'), null);
  assert.equal(parseGuess('😂😂'), null);
  assert.equal(parseGuess('123'), null);
});

test('đoán trúng (kể cả không dấu) thì thắng vòng 100 điểm', () => {
  const g = mk(fakeScorer({}));
  const fx = g.handle({ type: 'comment', user: u('a'), text: 'mat troi' });
  assert.equal(fx[0].type, 'wg_win');
  assert.equal(g.snapshot().secret, 'mặt trời');
  assert.equal(g.snapshot().ranked[0].score, 100);
  assert.equal(g.snapshot().champions[0].wins, 1);
});

test('từ đoán được chấm bất đồng bộ, xếp hạng theo điểm, từ trùng không chấm lại', async () => {
  const sc = fakeScorer({ 'mặt trăng': 72, 'nắng': 85, 'con mèo': 3 });
  let now = 0;
  const g = mk(sc, () => now);
  const got = [];
  g.on('effects', (fx) => got.push(...fx));
  g.handle({ type: 'comment', user: u('a'), text: 'mặt trăng' });
  g.handle({ type: 'comment', user: u('b'), text: 'Nắng' });
  g.handle({ type: 'comment', user: u('c'), text: 'con mèo' });
  assert.equal(g.snapshot().ranked.length, 0, 'đang chờ chấm');
  await flush();
  assert.deepEqual(g.snapshot().ranked.map((r) => [r.word, r.score]), [['nắng', 85], ['mặt trăng', 72], ['con mèo', 3]]);
  assert.equal(got.filter((e) => e.type === 'wg_scored').length, 3);
  now = 5000;
  const dup = g.handle({ type: 'comment', user: u('d'), text: 'nắng' });
  assert.equal(dup[0].dup, true);
  assert.equal(dup[0].score, 85);
  assert.equal(sc.calls.length, 3, 'không gọi chấm lại');
});

test('cooldown mỗi người', () => {
  let now = 0;
  const g = mk(fakeScorer({}), () => now);
  assert.equal(g.handle({ type: 'comment', user: u('a'), text: 'nắng' }).length, 1);
  assert.equal(g.handle({ type: 'comment', user: u('a'), text: 'mưa' }).length, 0);
  now = 2500;
  assert.equal(g.handle({ type: 'comment', user: u('a'), text: 'mưa' }).length, 1);
});

test('gợi ý theo thời gian và theo quà; hết giờ lộ từ, sang vòng mới', () => {
  let now = 0;
  const g = mk(fakeScorer({}), () => now, { hintAtSeconds: [60, 120, 180], roundSeconds: 300, breakSeconds: 10 });
  assert.deepEqual(g.snapshot().pattern, [3, 4]);
  assert.equal(g.snapshot().secret, null);
  const fx = g.handle({ type: 'gift', user: u('a'), diamonds: 10 });
  assert.equal(fx[0].type, 'wg_hint');
  assert.equal(fx[0].hint, 'Chủ đề: Thiên nhiên');
  assert.equal(g.handle({ type: 'gift', user: u('a'), diamonds: 1 }).length, 0, 'quà nhỏ không mở gợi ý');
  now = 121_000;
  assert.equal(g.tick()[0].hint, 'Chữ đầu: M… T…');
  now = 181_000;
  assert.equal(g.tick()[0].hint, 'Lộ chữ: mặt ___');
  now = 301_000;
  assert.equal(g.tick()[0].type, 'wg_timeout');
  assert.equal(g.snapshot().secret, 'mặt trời');
  now = 312_000;
  assert.equal(g.tick()[0].type, 'wg_start');
});

test('ClaudeScorer: gom lô, cache, kẹp điểm 1..99, lỗi API thì chấm đơn giản', async () => {
  const requests = [];
  const client = { beta: { messages: { create: async (req) => {
    requests.push(req);
    const words = JSON.parse(req.messages[0].content.split('TỪ ĐOÁN: ')[1]);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ scores: words.map((w) => ({ word: w, score: w === 'nắng' ? 150 : 40 })) }) }] };
  } } } };
  const s = new ClaudeScorer({ client, batchMs: 5 });
  const [a, b] = await Promise.all([s.score('mặt trời', 'nắng'), s.score('mặt trời', 'Bầu Trời')]);
  assert.equal(requests.length, 1, 'một lô');
  assert.equal(requests[0].model, 'claude-opus-5-5');
  assert.equal(a.score, 99);
  assert.equal(b.score, 40);
  assert.equal((await s.score('mặt trời', 'nắng')).source, 'cache');
  assert.equal(requests.length, 1);
  const bad = new ClaudeScorer({ client: { beta: { messages: { create: async () => { throw new Error('down'); } } } }, batchMs: 5, log: {} });
  const r = await bad.score('mặt trời', 'trời');
  assert.equal(r.source, 'simple');
  assert.ok(r.score >= 1 && r.score <= 99);
});

test('simpleScore / isExact', () => {
  assert.ok(isExact('Mat Troi', 'mặt trời'));
  assert.ok(simpleScore('mặt trời', 'ông mặt trời') > simpleScore('mặt trời', 'con mèo'));
});

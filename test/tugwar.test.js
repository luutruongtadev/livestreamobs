import test from 'node:test';
import assert from 'node:assert/strict';
import { TugWar } from '../server/tugwar.js';

const u = (id) => ({ id, name: id, avatar: null });
const mk = (now = () => 0, cfg = {}) => new TugWar({ roundSeconds: 60, breakSeconds: 10, ...cfg }, { now });

test('bình luận "đỏ" / "xanh" để vào đội', () => {
  const g = mk();
  assert.equal(g.handle({ type: 'comment', user: u('a'), text: 'Đỏ ơi' })[0].team, 'red');
  assert.equal(g.handle({ type: 'comment', user: u('b'), text: 'phe XANH' })[0].team, 'blue');
  assert.deepEqual(g.handle({ type: 'comment', user: u('c'), text: 'xin chào' }), []);
  assert.equal(g.players.size, 2);
});

test('chưa chọn đội thì tự xếp vào đội ít người hơn', () => {
  const g = mk();
  g.handle({ type: 'comment', user: u('a'), text: 'đỏ' });
  const fx = g.handle({ type: 'like', user: u('b'), count: 1 });
  assert.equal(fx[0].type, 'tug_join');
  assert.equal(fx[0].team, 'blue');
});

test('tim kéo nhẹ, quà kéo mạnh theo hướng của đội', () => {
  const g = mk();
  g.handle({ type: 'comment', user: u('r'), text: 'đỏ' });
  g.handle({ type: 'comment', user: u('x'), text: 'xanh' });
  g.handle({ type: 'like', user: u('r'), count: 10 });
  assert.ok(g.pos < 0, 'đỏ kéo về trái');
  const before = g.pos;
  g.handle({ type: 'gift', user: u('x'), giftName: 'Rose', diamonds: 1, repeatCount: 10 });
  assert.ok(g.pos > before + 5, 'quà kéo mạnh hơn tim');
});

test('qua vạch là thắng ngay, có MVP và sang ván mới sau giờ nghỉ', () => {
  let now = 0;
  const g = mk(() => now);
  g.handle({ type: 'comment', user: u('x'), text: 'xanh' });
  assert.ok(!g.handle({ type: 'gift', user: u('x'), giftName: 'Lion', diamonds: 29999 }).some((e) => e.type === 'tug_end'), 'một quà không thắng ngay');
  assert.equal(g.pos, 50);
  const fx = g.handle({ type: 'gift', user: u('x'), giftName: 'Lion', diamonds: 29999 });
  const end = fx.find((e) => e.type === 'tug_end');
  assert.equal(end.winner, 'blue');
  assert.equal(end.mvp.id, 'x');
  assert.equal(g.wins.blue, 1);
  assert.deepEqual(g.handle({ type: 'like', user: u('x'), count: 5 }), [], 'đang nghỉ thì không kéo');
  now = 11_000;
  assert.equal(g.tick()[0].type, 'tug_start');
  assert.equal(g.pos, 0);
  assert.equal(g.players.size, 0);
});

test('hết giờ: đội đang lệch về phía mình thắng, hoà nếu đứng giữa', () => {
  let now = 0;
  const g = mk(() => now);
  g.handle({ type: 'comment', user: u('r'), text: 'đỏ' });
  g.handle({ type: 'like', user: u('r'), count: 3 });
  now = 61_000;
  assert.equal(g.tick().find((e) => e.type === 'tug_end').winner, 'red');
  now = 72_000; g.tick();
  now = 72_000 + 61_000;
  assert.equal(g.tick()[0].winner, null);
  assert.equal(g.wins.draw, 1);
});

test('ngai vàng: người tặng nhiều xu nhất, bị vượt thì đổi chủ', () => {
  const g = mk(() => 0, { winDistance: 1e9 });
  g.handle({ type: 'gift', user: u('a'), giftName: 'Rose', diamonds: 10 });
  assert.equal(g.throne.id, 'a');
  assert.ok(!g.handle({ type: 'gift', user: u('b'), giftName: 'Rose', diamonds: 5 }).some((e) => e.type === 'tug_throne'));
  const fx = g.handle({ type: 'gift', user: u('b'), giftName: 'Rose', diamonds: 6 });
  const th = fx.find((e) => e.type === 'tug_throne');
  assert.equal(th.user.id, 'b');
  assert.equal(th.prev.name, 'a');
});

test('đổi đội được khi chưa kéo lần nào', () => {
  const g = mk();
  g.handle({ type: 'comment', user: u('a'), text: 'đỏ' });
  g.handle({ type: 'comment', user: u('a'), text: 'xanh' });
  assert.equal(g.players.get('a').team, 'blue');
  g.handle({ type: 'like', user: u('a'), count: 1 });
  g.handle({ type: 'comment', user: u('a'), text: 'đỏ' });
  assert.equal(g.players.get('a').team, 'blue');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';

const game = await loadGame(new URL('..', import.meta.url));
const u = (id) => ({ id, name: `Người ${id}` });
const gift = (id, giftName) => ({ type: 'gift', user: u(id), giftName, diamonds: 1, count: 1 });

test('phá phố: sét toà cao nhất, bình luận sửa nhà (giãn cách), khiên chặn, thợ xây, lốc đi xuyên phố, phố sập → vinh danh → phố mới, quà để dành', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { wipePercent: 60, resultSeconds: 5, repairPerComment: 10, commentCooldown: 2, disasterScale: 0.5 }, data: game.data, now: clock.now, random: seededRandom(3), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { const fx = []; for (let t = 0; t < ms; t += 250) { clock.advance(250); fx.push(...host.tick()); } return fx; };
  const n = S().buildings.length;
  assert.ok(n >= 14, `phố có đủ nhà (${n})`);

  // sét đánh toà cao nhất
  const tallest = Math.max(...S().buildings.map((b) => b.h));
  host.handle(gift('a', 'Finger Heart'));
  step(750);
  const hit = S().buildings.filter((b) => b.hp < 1);
  assert.equal(hit.length, 1); assert.equal(hit[0].h, tallest);
  // bình luận sửa toà hư nặng nhất; cùng người phải chờ giãn cách
  const before = hit[0].hp;
  assert.equal(host.handle({ type: 'comment', user: u('b'), text: 'sửa' }).length, 1);
  assert.equal(host.handle({ type: 'comment', user: u('b'), text: 'sửa' }).length, 0, 'giãn cách 2 giây');
  assert.ok(S().buildings.find((b) => b.id === hit[0].id).hp > before || !hit[0].alive);
  // khiên: thiên thạch rơi trong lúc có khiên không gây hư hại
  host.handle(gift('c', 'Cap'));
  const hp = JSON.stringify(S().buildings);
  host.handle(gift('d', 'Rose'));
  step(2000);
  assert.equal(JSON.stringify(S().buildings), hp, 'khiên chặn thiên thạch');
  step(15000);
  // lốc xoáy đi xuyên phố: có toà bị hư
  host.handle(gift('e', 'Doughnut'));
  assert.equal(S().hazards.length, 1);
  step(11000);
  assert.equal(S().hazards.length, 0);
  assert.ok(S().buildings.some((b) => b.hp < 1), 'lốc làm hư nhà');
  assert.equal(S().top[0].id, 'e');
  // thợ xây dựng lại mọi thứ
  host.handle(gift('f', 'Sunglasses'));
  assert.ok(S().buildings.every((b) => b.alive && b.hp === 1));
  // động đất + UFO + khủng long → sập phố
  let fx = [];
  for (const g of ['Hand Hearts', 'Galaxy', 'Corgi', 'Hand Hearts']) host.handle(gift('g', g));
  for (let i = 0; i < 30 && S().phase === 'play'; i++) { fx.push(...step(1000)); if (S().phase === 'play' && i % 6 === 5) host.handle(gift('g', 'Hand Hearts')); }
  assert.equal(S().phase, 'wiped');
  assert.ok(S().downPct >= 60);
  assert.equal(S().wipedBy.id, 'g'); assert.equal(fx.filter((e) => e.type === 'ph_wipe').length, 1);
  assert.equal(S().legends[0].id, 'g');
  // quà lúc vinh danh để dành cho phố mới
  host.handle(gift('h', 'Doughnut'));
  assert.equal(S().carry, 1);
  step(5250);
  assert.equal(S().phase, 'play'); assert.equal(S().townNo, 2);
  assert.ok(S().buildings.every((b) => b.alive));
  assert.equal(S().hazards.length, 1, 'lốc để dành chạy ngay ở phố mới');
});

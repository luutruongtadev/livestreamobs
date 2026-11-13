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

test('chế độ streamer: sửa nhà, bắn hạ, đuổi lốc tốn năng lượng (tự hồi), hết giờ phố còn đứng → streamer thắng; sập trước → người xem thắng; khôi phục', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { mode: 'host', hostSeconds: 40, hostEnergy: 2, energyRegenSeconds: 5, ambientSeconds: 0, resultSeconds: 3, wipePercent: 60 }, data: game.data, now: clock.now, random: seededRandom(4), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { const fx = []; for (let t = 0; t < ms; t += 250) { clock.advance(250); fx.push(...host.tick()); } return fx; };
  assert.equal(S().mode, 'host'); assert.equal(S().energy, 2); assert.ok(S().hostLeftMs > 39000);
  // người xem không dùng được input
  assert.deepEqual(createHost(game, { settings: {}, data: game.data, now: clock.now, random: seededRandom(1), log: {} }).input({ type: 'fix', id: 0 }), []);
  // động đất làm hư → streamer bấm giữ để sửa
  host.handle(gift('a', 'Hand Hearts')); step(6500);
  const hit = S().buildings.find((b) => b.alive && b.hp < 1);
  assert.ok(hit);
  assert.equal(host.input({ type: 'fix', id: hit.id }).length, 1);
  assert.equal(host.input({ type: 'fix', id: hit.id }).length, 0, 'chống bấm máy');
  clock.advance(150);
  host.input({ type: 'fix', id: hit.id });
  assert.ok(S().buildings.find((b) => b.id === hit.id).hp > hit.hp);
  assert.equal(S().hostStats.fixes, 2);
  // bắn hạ thiên thạch: không gây hư hại, tốn 1 năng lượng
  const before = JSON.stringify(S().buildings);
  host.handle(gift('b', 'Rose'));
  const st = S().strikes[0];
  assert.equal(host.input({ type: 'shoot', id: st.id })[0].type, 'ph_shot');
  step(2000);
  assert.equal(JSON.stringify(S().buildings), before, 'bắn hạ rồi thì không rơi');
  assert.equal(S().energy, 1);
  // đuổi lốc: rút ngắn thời gian
  host.handle(gift('c', 'Doughnut'));
  const h = S().hazards[0];
  host.input({ type: 'chase', id: h.id });
  assert.ok(S().hazards[0].totalMs < h.totalMs);
  assert.equal(S().energy, 0);
  host.handle(gift('d', 'Rose'));
  assert.equal(host.input({ type: 'shoot', id: S().strikes[0].id })[0].type, 'ph_noenergy');
  step(5000);
  assert.ok(S().energy >= 1, 'năng lượng tự hồi');
  // khôi phục giữa chừng
  const saved = host.serialize();
  const h2 = createHost(game, { settings: { mode: 'host', hostSeconds: 40 }, data: game.data, now: clock.now, random: seededRandom(9), log: {} });
  h2.restore(JSON.parse(JSON.stringify(saved)));
  assert.equal(h2.snapshot().hostStats.shots, 1);
  // hết giờ: streamer thắng
  host.handle(gift('e', 'Sunglasses'));
  const fx = [];
  for (let i = 0; i < 200 && S().phase === 'play'; i++) fx.push(...step(250));
  assert.ok(fx.some((e) => e.type === 'ph_survive'));
  assert.equal(S().phase, 'wiped'); assert.equal(S().winner, 'host'); assert.deepEqual(S().score, { host: 1, viewers: 0 });
  step(3250);
  assert.equal(S().phase, 'play'); assert.equal(S().townNo, 2); assert.equal(S().hostStats.fixes, 0);
  // người xem đánh sập trước giờ → người xem thắng
  for (const g of ['Galaxy', 'Galaxy', 'Galaxy', 'Hand Hearts', 'Hand Hearts', 'Corgi']) host.handle(gift('g', g));
  for (let i = 0; i < 35 && S().phase === 'play'; i++) { step(1000); host.handle(gift('g', 'Galaxy')); }
  assert.equal(S().winner, 'viewers'); assert.equal(S().wipedBy.id, 'g'); assert.deepEqual(S().score, { host: 1, viewers: 1 });
});

test('Ông Trời thả thảm hoạ nhẹ định kỳ ở chế độ streamer, không zoom / không tính điểm', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { mode: 'host', ambientSeconds: 5 }, data: game.data, now: clock.now, random: seededRandom(2), log: {} });
  for (let t = 0; t < 8000; t += 250) { clock.advance(250); host.tick(); }
  const s = host.snapshot();
  assert.ok(s.strikes.length + s.buildings.filter((b) => b.hp < 1).length > 0);
  assert.equal(s.top.length, 0);
  assert.equal(s.cam.zoom, true);
});

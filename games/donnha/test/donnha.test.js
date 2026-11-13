import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';
import { steerWord, KINDS, HOUSE } from '../engine/index.js';

const game = await loadGame(new URL('..', import.meta.url));
const u = (id) => ({ id, name: `Người ${id}` });
const gift = (id, giftName) => ({ type: 'gift', user: u(id), giftName, diamonds: 1, count: 1 });
const mk = (settings = {}, seed = 3) => { const clock = fakeClock(); const host = createHost(game, { settings, data: game.data, now: clock.now, random: seededRandom(seed), log: {} }); const step = (ms) => { const fx = []; for (let t = 0; t < ms; t += 250) { clock.advance(250); fx.push(...host.tick()); } return fx; }; return { host, clock, step, S: () => host.snapshot() }; };

test('lệnh lái từ bình luận', () => {
  for (const [t, d] of [['trái', 'l'], ['Trai', 'l'], ['phải', 'r'], ['P', 'r'], ['lên', 'u'], ['xuống', 'd'], ['⬅️', 'l'], ['w', 'u'], ['s', 'd'], ['d', 'r']]) assert.equal(steerWord(t), d, t);
  for (const t of ['hút sofa đi', 'trái tim của em ơi', '', 'xin chào mọi người']) assert.equal(steerWord(t), null, t);
});

test('căn nhà: đồ đủ các cỡ, không chồng nhau, nằm trong nhà, chừa chỗ xuất phát', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { S } = mk({}, seed);
    const it = S().items;
    assert.ok(it.length > 100, `đủ đồ (${it.length})`);
    for (const k of ['giuong', 'sofa', 'tulanh', 'xemay', 'caymai']) assert.ok(it.some((o) => o.kind === k), k);
    for (const o of it) assert.ok(Math.abs(o.x) <= HOUSE.hx - o.s && Math.abs(o.z) <= HOUSE.hz - o.s);
    for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) assert.ok(Math.hypot(it[i].x - it[j].x, it[i].z - it[j].z) > (it[i].s + it[j].s), 'không chồng');
    assert.ok(it.every((o) => Math.hypot(o.x, o.z - 1) > o.s + 1));
  }
});

test('tự lái: hút đồ nhỏ, to ra, lên cấp, không đi xuyên đồ to; hết giờ có kết quả rồi sang nhà mới', () => {
  const { S, step } = mk({ roundSeconds: 90, resultSeconds: 3 });
  const r0 = S().robot.r;
  const fx = step(30000);
  assert.ok(fx.filter((e) => e.type === 'dn_eat').length > 15, 'hút được nhiều món');
  assert.ok(S().robot.r > r0 * 1.5, 'to ra');
  assert.ok(fx.some((e) => e.type === 'dn_level'));
  assert.ok(S().cleanPct > 3);
  // không chồng lên món to hơn mình
  const rb = S().robot;
  for (const o of S().items) if (o.s >= rb.reff * 0.95) assert.ok(Math.hypot(o.x - rb.x, o.z - rb.z) >= rb.r + o.s * 0.85 - 0.05);
  const end = [];
  for (let i = 0; i < 300 && S().phase === 'play'; i++) end.push(...step(250));
  assert.ok(end.some((e) => e.type === 'dn_end'));
  assert.equal(S().phase, 'result'); assert.ok(S().result.pct > 0); assert.ok(S().best);
  step(3250);
  assert.equal(S().phase, 'play'); assert.equal(S().round, 2); assert.equal(S().robot.r, 0.3);
});

test('người xem cùng lái: đa số thắng; bình luận khác thả đồ mang tên (1 món / người); quà giúp / phá', () => {
  const { host, S, step } = mk({ autopilot: false });
  for (let i = 0; i < 5; i++) host.handle({ type: 'comment', user: u('a' + i), text: 'phải' });
  host.handle({ type: 'comment', user: u('b'), text: 'trái' });
  step(1000);
  assert.ok(S().robot.vx > 0.5, 'đi sang phải'); assert.equal(S().steer.mode, 'crowd'); assert.equal(S().steer.counts.r, 5);
  step(4000); // hết phiếu → không tự lái → dừng
  const x = S().robot.x; step(2000);
  assert.ok(Math.abs(S().robot.x - x) < 0.3);
  // thả đồ mang tên
  const fx = host.handle({ type: 'comment', user: u('n'), text: 'cho mình chiếc dép' });
  assert.equal(fx[0].type, 'dn_drop');
  assert.ok(S().items.some((o) => o.owner === 'Người n'));
  assert.deepEqual(host.handle({ type: 'comment', user: u('n'), text: 'nữa' }), [], 'mỗi người 1 món');
  // quà giúp
  host.handle(gift('g', 'Rose')); assert.ok(S().buffs.turbo > 0);
  host.handle(gift('g', 'Finger Heart')); assert.ok(S().robot.magnet > 0);
  const n = S().items.length; host.handle(gift('g', 'Perfume')); assert.ok(S().items.length > n);
  const r = S().robot.r; host.handle(gift('g', 'Hand Hearts')); assert.ok(S().robot.r > r);
  host.handle(gift('g', 'Galaxy')); assert.ok(S().robot.reff > S().robot.r * 1.5);
  // quà phá
  host.handle(gift('p', 'Cap')); assert.ok(S().buffs.hetpin > 0);
  host.handle(gift('p', 'Sunglasses')); assert.ok(S().buffs.daochieu > 0);
  host.handle(gift('p', 'Doughnut')); assert.ok(S().cat);
  assert.equal(S().helpers[0].id, 'g'); assert.equal(S().pranks[0].id, 'p');
});

test('mèo: rô-bốt nhỏ hơn thì bị nhả đồ + choáng; chó làm đổ nhả 5 món', () => {
  const { host, S, step } = mk({ roundSeconds: 300 });
  step(25000);
  const eaten = S().eatenCount, r = S().robot.r;
  host.handle(gift('c', 'Corgi'));
  assert.equal(S().eatenCount, eaten - 5); assert.ok(S().robot.r < r); assert.ok(S().buffs.choang > 0);
  host.handle(gift('m', 'Doughnut'));
  let spit = false;
  for (let i = 0; i < 40 && !spit; i++) spit = step(250).some((e) => e.type === 'dn_spit' && e.why === 'meo');
  assert.ok(spit, 'mèo vồ được rô-bốt');
});

test('chế độ streamer: lái bằng chuột / phím; bình luận lái bị bỏ qua', () => {
  const { host, S, step } = mk({ mode: 'host' });
  assert.deepEqual(host.handle({ type: 'comment', user: u('a'), text: 'trái' }), []);
  host.input({ type: 'aim', x: 5, z: S().robot.z });
  step(750);
  assert.ok(S().robot.vx > 1, `đi về phía chỗ bấm (${S().robot.vx})`);
  host.input({ type: 'dir', dx: 0, dz: -1 });
  step(750);
  assert.ok(S().robot.vz < -1);
  host.input({ type: 'stop' }); step(1000);
  const z2 = S().robot.z; step(1000);
  assert.ok(Math.abs(S().robot.z - z2) < 0.2);
  assert.equal(S().steer.mode, 'host');
});

test('tái lập + khôi phục giữa ván', () => {
  const a = mk({}, 9), b = mk({}, 9);
  for (const h of [a, b]) { h.host.handle({ type: 'comment', user: u('x'), text: 'lên' }); h.step(5000); h.host.handle(gift('y', 'Doughnut')); h.step(3000); }
  assert.deepEqual(a.S(), b.S());
  const c = mk({}, 1);
  c.host.restore(JSON.parse(JSON.stringify(a.host.serialize())));
  assert.deepEqual(c.S().items, a.S().items); assert.deepEqual(c.S().robot, a.S().robot);
  assert.ok(Object.keys(KINDS).length >= 30);
});

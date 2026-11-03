import test from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../server/race.js';

const u = (id) => ({ id, name: id });
const say = (g, id, text) => g.handle({ type: 'comment', user: u(id), text });
function mk(cfg = {}) {
  const clock = { t: 0 };
  const g = new Race({ lobbySeconds: 30, fullStartSeconds: 5, countdownSeconds: 3, raceSeconds: 60, breakSeconds: 10, ...cfg }, { now: () => clock.t, random: () => 0.5 });
  return { g, clock };
}
const run = (g, clock, ms, step = 250) => { const out = []; for (let i = 0; i < ms; i += step) { clock.t += step; out.push(...g.tick()); } return out; };

test('comment OK để vào đua, tối đa 6 con, con vật không trùng; người thứ 7 được đăng ký vòng sau', () => {
  const { g } = mk();
  for (let i = 1; i <= 6; i++) assert.equal(say(g, 'p' + i, i === 3 ? 'Oke' : 'ok')[0].type, 'race_join');
  assert.equal(g.racers.length, 6);
  assert.equal(new Set(g.racers.map((r) => r.animal.id)).size, 6);
  assert.deepEqual(g.racers.map((r) => r.lane), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(say(g, 'p1', 'ok'), []); // đã vào rồi
  const q = say(g, 'p7', 'okkk');
  assert.equal(q[0].type, 'race_queue');
  assert.equal(g.snapshot().queueCount, 1);
  assert.deepEqual(say(g, 'p8', 'ok đi bạn'), []); // không đúng từ khoá
});

test('đủ 6 người thì xuất phát sớm; chưa đủ 2 người thì chờ thêm', () => {
  const { g, clock } = mk();
  say(g, 'a', 'ok');
  run(g, clock, 31_000);
  assert.equal(g.phase, 'lobby'); // 1 người: chờ
  say(g, 'b', 'ok');
  for (let i = 0; i < 4; i++) say(g, 'x' + i, 'ok');
  const fx = run(g, clock, 5_000);
  assert.ok(fx.some((e) => e.type === 'race_countdown'));
  run(g, clock, 3_000);
  assert.equal(g.phase, 'racing');
});

test('đua: bình luận / tim / quà đẩy con của mình, khán giả cổ vũ theo số làn, về đích thì thắng và lưu thành tích', () => {
  const { g, clock } = mk();
  say(g, 'a', 'ok'); say(g, 'b', 'ok');
  assert.equal(say(g, 'fan', '2')[0].type, 'race_cheer'); // cổ vũ từ sảnh chờ
  g.skip(); g.skip(); // xuất phát ngay
  assert.equal(g.phase, 'racing');
  assert.equal(say(g, 'a', 'chạy')[0].type, 'race_boost');
  assert.deepEqual(say(g, 'a', 'chạy nữa'), []); // hồi chiêu 1 giây
  // quà của khán giả cổ vũ làn 2 đẩy con của b
  const fx = g.handle({ type: 'gift', user: u('fan'), diamonds: 10, giftName: 'Rose' });
  assert.equal(fx[0].racer.id, 'b');
  const b = g.racers.find((r) => r.id === 'b');
  for (let i = 0; i < 4; i++) g.handle({ type: 'gift', user: u('b'), diamonds: 30, giftName: 'Doughnut' });
  const out = run(g, clock, 8_000);
  const fin = out.find((e) => e.type === 'race_finish');
  assert.ok(fin, 'phải có người về đích');
  assert.equal(fin.podium[0].id, 'b');
  assert.equal(g.stats.b.wins, 1);
  assert.equal(g.stats.a.podiums, 1);
  assert.ok(b.pos >= 1000);
  assert.equal(g.phase, 'ended');
  run(g, clock, 10_000);
  assert.equal(g.phase, 'lobby');
  assert.equal(g.racers.length, 0);
});

test('quà ≥ 30 xu ném chuối làm con dẫn đầu (không phải con mình) đứng yên', () => {
  const { g, clock } = mk();
  say(g, 'a', 'ok'); say(g, 'b', 'ok');
  g.skip(); g.skip();
  g.handle({ type: 'gift', user: u('a'), diamonds: 5 });
  run(g, clock, 2000);
  const a = g.racers.find((r) => r.id === 'a');
  const fx = g.handle({ type: 'gift', user: u('b'), diamonds: 30 });
  const ban = fx.find((e) => e.type === 'race_banana');
  assert.equal(ban.target.id, 'a');
  const before = a.pos;
  run(g, clock, 2000);
  assert.equal(a.pos, before);
});

test('hết giờ: con xa nhất thắng; người đăng ký trước tự vào vòng sau', () => {
  const { g, clock } = mk({ baseSpeed: 1 });
  say(g, 'a', 'ok'); say(g, 'b', 'ok');
  g.skip(); g.skip();
  say(g, 'c', 'ok'); // đang đua → vòng sau
  say(g, 'a', 'đi');
  const out = run(g, clock, 61_000);
  const fin = out.find((e) => e.type === 'race_finish');
  assert.equal(fin.reason, 'timeout');
  assert.equal(fin.podium[0].id, 'a');
  const fx = run(g, clock, 10_000);
  assert.ok(fx.some((e) => e.type === 'race_join' && e.racer.id === 'c' && e.fromQueue));
});

test('tạm dừng giữa cuộc đua: không ai di chuyển, chạy lại tiếp tục', () => {
  const { g, clock } = mk();
  say(g, 'a', 'ok'); say(g, 'b', 'ok');
  g.skip(); g.skip();
  run(g, clock, 1000);
  g.pause('offline');
  const pos = g.racers.map((r) => r.pos);
  run(g, clock, 120_000);
  assert.deepEqual(g.racers.map((r) => r.pos), pos);
  assert.deepEqual(say(g, 'a', 'chạy'), []);
  g.resume();
  assert.equal(g.phase, 'racing');
  assert.equal(g.snapshot().remaining, 59);
});

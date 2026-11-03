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

test('hết 30 giây chờ: thiếu người thì thêm bot cho đủ 6 con; đủ 6 người thật thì xuất phát sớm', () => {
  const { g, clock } = mk();
  say(g, 'a', 'ok');
  run(g, clock, 29_000);
  assert.equal(g.phase, 'lobby');
  const fx = run(g, clock, 1_250);
  assert.ok(fx.some((e) => e.type === 'race_countdown'));
  assert.equal(g.racers.length, 6);
  assert.equal(g.racers.filter((r) => r.bot).length, 5);
  assert.equal(new Set(g.racers.map((r) => r.animal.id)).size, 6);
  assert.equal(g.snapshot().racers.filter((r) => r.bot).length, 5);
  // vòng không ai vào: vẫn chạy với 6 bot, bot không lên bảng Vua tốc độ
  const z = mk();
  run(z.g, z.clock, 31_000);
  assert.equal(z.g.racers.length, 6);
  z.g.skip(); z.g.skip();
  assert.equal(z.g.phase, 'ended');
  assert.deepEqual(z.g.snapshot().champions, []);
  // đủ 6 người thật → xuất phát sau 5 giây, không có bot
  const f = mk();
  for (let i = 0; i < 6; i++) say(f.g, 'x' + i, 'ok');
  run(f.g, f.clock, 5_000);
  assert.equal(f.g.phase, 'countdown');
  assert.equal(f.g.racers.filter((r) => r.bot).length, 0);
  run(f.g, f.clock, 3_000);
  assert.equal(f.g.phase, 'racing');
});

test('đua: tim / quà đẩy con của mình, khán giả cổ vũ theo số làn, về đích thì thắng và lưu thành tích', () => {
  const { g, clock } = mk();
  say(g, 'a', 'ok'); say(g, 'b', 'ok');
  assert.equal(say(g, 'fan', '2')[0].type, 'race_cheer'); // cổ vũ từ sảnh chờ
  g.skip(); g.skip(); // xuất phát ngay
  assert.equal(g.phase, 'racing');
  assert.deepEqual(say(g, 'a', 'chạy đi chạy đi'), []); // bình luận không làm con vật chạy
  assert.equal(g.handle({ type: 'like', user: u('a'), count: 10 })[0].type, 'race_boost');
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
  assert.equal(g.stats.a.races, 1); // a bị chuối nên rớt khỏi bục; bot không có trong stats
  assert.ok(!Object.keys(g.stats).some((id) => id.startsWith('bot:')));
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
  const ban = fx.find((e) => e.type === 'race_obstacle');
  assert.equal(ban.kind, 'banana');
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
  g.handle({ type: 'like', user: u('a'), count: 5 });
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

test('quà ≥ 99 xu ném bom: hất lùi con dẫn đầu và đứng yên lâu hơn', () => {
  const { g, clock } = mk();
  say(g, 'a', 'ok'); say(g, 'b', 'ok');
  g.skip(); g.skip();
  g.handle({ type: 'gift', user: u('a'), diamonds: 4, repeatCount: 5 });
  run(g, clock, 3000);
  const a = g.racers.find((r) => r.id === 'a');
  const before = a.pos;
  const fx = g.handle({ type: 'gift', user: u('b'), diamonds: 99 });
  const bomb = fx.find((e) => e.type === 'race_obstacle');
  assert.equal(bomb.kind, 'bomb');
  assert.equal(bomb.target.id, 'a');
  assert.equal(a.pos, before - 60);
  assert.equal(g.snapshot().racers.find((r) => r.id === 'a').stunKind, 'bomb');
  run(g, clock, 3000);
  assert.equal(a.pos, before - 60);
});

test('các mức quà: hoa hồng tăng tốc + mưa hoa mỗi 10 bông, tim hồi phục, khiên chặn, siêu tốc né', () => {
  const { g, clock } = mk();
  say(g, 'a', 'ok'); say(g, 'b', 'ok');
  g.skip(); g.skip();
  const a = g.racers.find((r) => r.id === 'a');
  // 🌹 1 bông vẫn đẩy 25 (hơn 1 xu × 12)
  assert.equal(g.handle({ type: 'gift', user: u('a'), diamonds: 1, giftName: 'Rose' })[0].amount, 25);
  // thêm 9 bông → đủ 10 → mưa hoa
  let fx = g.handle({ type: 'gift', user: u('fan'), diamonds: 1, repeatCount: 9 }); // fan chưa cổ vũ ai → không tính
  assert.deepEqual(fx, []);
  fx = g.handle({ type: 'gift', user: u('a'), diamonds: 1, repeatCount: 9, giftName: 'Rose' });
  assert.equal(fx[0].tier, 'rose');
  assert.ok(fx.some((e) => e.type === 'race_combo' && e.roses === 10));
  // 🛡️ 10 xu: khiên cho a; b ném chuối vào a (đang dẫn đầu) → bị chặn
  run(g, clock, 3000);
  assert.equal(g.handle({ type: 'gift', user: u('a'), diamonds: 10 }).at(-1).type, 'race_shield');
  assert.equal(g.snapshot().racers.find((r) => r.id === 'a').shielded, true);
  fx = g.handle({ type: 'gift', user: u('b'), diamonds: 30 });
  assert.equal(fx.find((e) => e.type === 'race_obstacle').blocked, 'shield');
  assert.equal(a.stunUntil <= clock.t, true);
  // lần 2 không còn khiên → trúng; 💖 5 xu hồi phục ngay
  fx = g.handle({ type: 'gift', user: u('b'), diamonds: 30 });
  assert.equal(fx.find((e) => e.type === 'race_obstacle').blocked, undefined);
  assert.ok(a.stunUntil > clock.t);
  fx = g.handle({ type: 'gift', user: u('a'), diamonds: 5, giftName: 'Finger Heart' });
  assert.ok(fx.some((e) => e.type === 'race_heal'));
  assert.equal(a.stunUntil, clock.t);
  // 🚀 299 xu: siêu tốc, bom ném vào bị né
  fx = g.handle({ type: 'gift', user: u('a'), diamonds: 299 });
  assert.ok(fx.some((e) => e.type === 'race_turbo'));
  fx = g.handle({ type: 'gift', user: u('b'), diamonds: 99 });
  assert.equal(fx.find((e) => e.type === 'race_obstacle').blocked, 'turbo');
  assert.equal(g.snapshot().giftTiers.length, 6);
});

test('chọn mục tiêu: comment "ném 3" rồi tặng chuối / bom → bay vào con làn 3 (không phải con dẫn đầu)', () => {
  const { g, clock } = mk();
  say(g, 'a', 'ok'); say(g, 'b', 'ok'); say(g, 'c', 'ok');
  g.skip(); g.skip();
  g.handle({ type: 'like', user: u('a'), count: 30 }); // a dẫn đầu
  run(g, clock, 1000);
  const aimFx = say(g, 'b', 'ném 3');
  assert.equal(aimFx[0].type, 'race_aim');
  assert.equal(aimFx[0].lane, 3);
  let fx = g.handle({ type: 'gift', user: u('b'), diamonds: 30 });
  let ob = fx.find((e) => e.type === 'race_obstacle');
  assert.equal(ob.target.id, 'c');
  assert.equal(ob.aimed, true);
  // "bom ngựa"/tên con vật cũng được; nhắm vào chính con mình thì ném con dẫn đầu
  const lane = g.racers.find((r) => r.id === 'b').lane;
  say(g, 'b', `chuối làn ${lane}`);
  fx = g.handle({ type: 'gift', user: u('b'), diamonds: 30 });
  assert.equal(fx.find((e) => e.type === 'race_obstacle').target.id, 'a');
  // hết 30 giây thì mục tiêu hết hiệu lực
  say(g, 'b', 'ném 3');
  run(g, clock, 31_000);
  if (g.phase === 'racing') {
    fx = g.handle({ type: 'gift', user: u('b'), diamonds: 30 });
    assert.equal(fx.find((e) => e.type === 'race_obstacle').aimed, false);
  }
  // khán giả chưa cổ vũ ai vẫn ném được vào mục tiêu đã chọn
  const h = mk();
  say(h.g, 'a', 'ok'); say(h.g, 'b', 'ok');
  h.g.skip(); h.g.skip();
  say(h.g, 'fan', 'nem 2');
  fx = h.g.handle({ type: 'gift', user: u('fan'), diamonds: 99 });
  assert.equal(fx[0].type, 'race_obstacle');
  assert.equal(fx[0].target.lane, 2);
  assert.equal(fx[0].from, null);
  assert.deepEqual(say(h.g, 'fan', 'chơi 3'), []); // không phải câu nhắm
});

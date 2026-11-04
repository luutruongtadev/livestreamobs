import test from 'node:test';
import assert from 'node:assert/strict';
import { WordGame } from '../server/wordgame.js';
import { WeeklyBoard } from '../server/weekly.js';

const u = (id) => ({ id, name: id.toUpperCase() });
function mk(rounds = 2) {
  const clock = { t: Date.UTC(2026, 10, 4, 3) };
  const weekly = new WeeklyBoard({}, { now: () => clock.t });
  const g = new WordGame({ words: [{ word: 'mặt trời' }, { word: 'con mèo' }], roundSeconds: 100, breakSeconds: 5, cooldownSec: 0 }, { scorer: { score: async () => 30 }, now: () => clock.t, weekly });
  g.teams.setRounds(rounds);
  g.teams.setOn(true);
  g.skip(); g.skip(); // vòng mới sau khi bật → vòng 1 của trận
  return { g, clock };
}
const say = (g, id, text) => g.handle({ type: 'comment', user: u(id), text });

test('đấu đội: comment "đội đỏ" vào đội (không tính lượt đoán); chưa chọn mà đoán thì tự vào đội ít người hơn', () => {
  const { g } = mk();
  assert.equal(g.teams.round, 1);
  assert.deepEqual(say(g, 'a', 'Đội Đỏ').map((e) => [e.type, e.team]), [['wg_team_join', 'red']]);
  assert.equal(g.guesses.size, 0, 'không bị chấm như một lượt đoán');
  say(g, 'b', 'team đỏ');
  const fx = say(g, 'c', 'cây cối'); // chưa có đội → vào đội xanh (ít người hơn)
  assert.equal(fx[0].type, 'wg_team_join'); assert.equal(fx[0].team, 'blue'); assert.equal(fx[0].auto, true);
  assert.equal(g.snapshot().team.teams.find((t) => t.id === 'blue').count, 1);
  assert.equal(say(g, 'a', 'đỏ')[0].type, 'wg_guess', 'chữ "đỏ" trơn là lượt đoán bình thường, không phải vào đội');
});

test('đấu đội: đoán trúng / quà / chia sẻ cộng điểm đội; hết số vòng công bố đội thắng + MVP rồi sang trận mới', () => {
  const { g, clock } = mk(2);
  say(g, 'a', 'đội đỏ'); say(g, 'b', 'đội xanh');
  // quà của thành viên đội xanh: 30 xu → +30 điểm đội
  const gift = g.handle({ type: 'gift', user: u('b'), giftName: 'Doughnut', diamonds: 30 });
  assert.equal(gift.find((e) => e.type === 'wg_team_points').points, 30);
  g.handle({ type: 'share', user: u('b') }); // +5
  // a đoán trúng ở giây 20/100 → đội đỏ +100 +80
  clock.t += 20_000;
  const win = say(g, 'a', g.display);
  const tp = win.find((e) => e.type === 'wg_team_points');
  assert.deepEqual([tp.team, tp.points], ['red', 180]);
  assert.equal(g.snapshot().winner.team, 'red');
  assert.ok(!win.some((e) => e.type === 'wg_team_match'), 'mới vòng 1/2 chưa hết trận');
  // vòng 2: hết giờ không ai trúng → hết trận
  clock.t += 6_000; g.tick();
  assert.equal(g.teams.round, 2);
  clock.t += 101_000;
  const end = g.tick();
  const match = end.find((e) => e.type === 'wg_team_match');
  assert.equal(match.winner, 'red');
  assert.deepEqual(match.score, { red: 180, blue: 35 });
  assert.equal(match.mvp.id, 'a');
  assert.ok(g.snapshot().team.matchOver);
  // hết trận: xoá hết thành viên 2 đội; quà lúc này không tính điểm đội
  assert.deepEqual(g.snapshot().team.members, {});
  assert.ok(!g.handle({ type: 'gift', user: u('a'), diamonds: 10 }).some((e) => e.type === 'wg_team_points'));
  // trong lúc công bố, mọi người chọn lại đội cho trận mới (a đổi sang xanh được)
  assert.equal(say(g, 'a', 'đội xanh')[0].team, 'blue');
  // vòng kế tiếp: trận mới, điểm về 0, giữ đội vừa chọn
  clock.t += 6_000; g.tick();
  const snap = g.snapshot().team;
  assert.equal(snap.matchNo, 2); assert.equal(snap.round, 1); assert.equal(snap.matchOver, null);
  assert.deepEqual(snap.teams.map((t) => t.score), [0, 0]);
  assert.deepEqual(snap.members, { a: 'blue' });
});

test('đấu đội: trong trận đã vào đội thì không đổi được (kể cả chưa ghi điểm); tắt chế độ thì "đội đỏ" là lượt đoán bình thường', () => {
  const { g, clock } = mk(5);
  say(g, 'a', 'đội đỏ');
  const fx = say(g, 'a', 'đội xanh');
  assert.equal(fx[0].locked, true);
  assert.equal(g.teams.members.a.team, 'red');
  g.teams.setOn(false);
  assert.deepEqual(g.snapshot().team, { on: false });
  clock.t += 6000; g.tick();
  assert.ok(say(g, 'z', 'đội xanh').some((e) => e.type === 'wg_guess'));
});

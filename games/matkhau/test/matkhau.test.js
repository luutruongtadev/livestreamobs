import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';
import { RULE_IDS, nextRule, solve, ruleOk } from '../engine/rules.js';

const game = await loadGame(new URL('..', import.meta.url));
const u = (id) => ({ id, name: `Người ${id}` });
const gift = (id, giftName) => ({ type: 'gift', user: u(id), giftName, diamonds: 1, count: 1 });

function mk(settings = {}, seed = 3) {
  const clock = fakeClock(1_794_372_000_000);
  const fx = [];
  const host = createHost(game, { settings: { voteEvery: 0, viewerRuleEvery: 0, ...settings }, data: game.data, now: clock.now, random: seededRandom(seed), log: {}, onEffects: (e) => fx.push(...e) });
  return { host, clock, fx };
}
const play = (host, clock) => { clock.advance(10_000); return host.tick(); };
const answer = (s) => solve([...s.rules, { id: 'len', p: Math.max(3, ...s.rules.filter((r) => r.id === 'len').map((r) => r.p)) }], s.env);

test('bộ luật: tổ hợp ngẫu nhiên nào cũng giải được', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rand = seededRandom(seed);
    const env = { now: 1_794_372_000_000 + seed * 7_777_000, tz: 7, host: seed % 3 ? 'Jey' : '' };
    const rules = [];
    for (let i = 0; i < 14; i++) { const r = nextRule(rules, i < 4 ? 1 : i < 9 ? 2 : 3, rand, env); assert.ok(r, `seed ${seed}: hết luật ở ${i}`); rules.push(r); }
    const s = solve(rules, env);
    assert.ok(s && rules.every((r) => ruleOk(r, s, env)), `seed ${seed}: ${JSON.stringify(rules)} → ${s}`);
  }
  assert.ok(RULE_IDS.length >= 30);
});

test('luật theo thời gian thật: giờ hiện tại, thứ hôm nay', () => {
  const env = { now: Date.UTC(2026, 10, 12, 14, 5), tz: 7 }; // 21h05 thứ Năm giờ VN
  assert.ok(ruleOk({ id: 'time' }, 'abc21h05', env));
  assert.ok(!ruleOk({ id: 'time' }, 'abc21h04', { ...env, now: env.now + 60_000 }));
  assert.ok(ruleOk({ id: 'weekday' }, 'xT5', env));
  assert.ok(!ruleOk({ id: 'weekday' }, 'xT6', env));
  assert.ok(ruleOk({ id: 'sum', p: 12 }, 'a93', env));
  assert.ok(ruleOk({ id: 'forbid', p: 'e' }, 'abc', env) && !ruleOk({ id: 'forbid', p: 'e' }, 'mÊo', env));
  assert.ok(ruleOk({ id: 'math' }, 'x2+3=5', env) && !ruleOk({ id: 'math' }, 'x2+3=6', env));
});

test('host: giới thiệu → chơi; Enter khi còn sai → bị chê; đúng hết → hiện luật mới; qua luật cuối → qua màn', () => {
  const { host, clock } = mk({ baseRules: 4 });
  assert.equal(host.snapshot().phase, 'intro');
  play(host, clock);
  let s = host.snapshot();
  assert.equal(s.phase, 'play');
  assert.equal(s.rules.length, 1);
  host.input({ type: 'text', value: '' });
  host.input({ type: 'text', value: '😶' });
  const bad = s.rules[0].id === 'emoji' ? 'aaa' : '😶';
  host.input({ type: 'text', value: bad });
  const w = host.input({ type: 'enter' });
  assert.equal(w[0].type, 'mk_wrong');
  for (let i = 0; i < 10 && host.snapshot().phase === 'play'; i++) {
    s = host.snapshot();
    host.input({ type: 'text', value: answer(s) });
    const fx = host.input({ type: 'enter' });
    assert.ok(fx.length, `vòng ${i}: Enter có phản hồi`);
  }
  s = host.snapshot();
  assert.equal(s.phase, 'result');
  assert.equal(s.result.win, true);
  assert.equal(s.result.rules, 4);
  assert.equal(s.level, 2);
  clock.advance(20_000); host.tick();
  assert.equal(host.snapshot().phase, 'intro');
  assert.equal(host.snapshot().total, 5, 'màn 2 thêm 1 luật');
});

test('người xem tự chơi: bình luận đúng hết luật → mở luật mới + điểm; người qua luật cuối thắng', () => {
  const { host, clock } = mk({ mode: 'viewer', baseRules: 3 });
  play(host, clock);
  assert.deepEqual(host.handle({ type: 'comment', user: u('a'), text: 'ab' }), [], 'quá ngắn không tính');
  let s = host.snapshot();
  const fx = host.handle({ type: 'comment', user: u('a'), text: answer(s) });
  assert.equal(fx[0].type, 'mk_unlock');
  assert.equal(host.snapshot().rules.length, 2);
  assert.deepEqual(host.handle({ type: 'comment', user: u('a'), text: answer(host.snapshot()) }), [], 'chờ 1,5 giây mới được thử tiếp');
  clock.advance(2000);
  host.handle({ type: 'comment', user: u('b'), text: answer(host.snapshot()) });
  clock.advance(2000);
  const end = host.handle({ type: 'comment', user: u('c'), text: answer(host.snapshot()) });
  assert.equal(end.at(-1).type, 'mk_win');
  s = host.snapshot();
  assert.equal(s.result.by.id, 'c');
  assert.ok(s.top.players.find((p) => p.id === 'c').points > s.top.players.find((p) => p.id === 'a').points);
  assert.equal(host.handle(gift('x', 'Doughnut')).length, 0, 'hacker không dùng được khi người xem chơi');
});

test('bình chọn luật: gõ 1 / 2, mỗi người 1 phiếu; hết giờ → luật thắng được hiện khi host qua luật', () => {
  const { host, clock } = mk({ voteEvery: 2, voteSeconds: 10, baseRules: 6 });
  play(host, clock);
  let s = host.snapshot();
  assert.ok(s.vote, 'luật thứ 2 là luật bình chọn');
  host.handle({ type: 'comment', user: u('a'), text: '2' });
  host.handle({ type: 'comment', user: u('a'), text: '1' });
  host.handle({ type: 'comment', user: u('b'), text: '2' });
  assert.deepEqual(host.snapshot().vote.counts, [0, 2]);
  const want = s.vote.options[1];
  host.input({ type: 'text', value: answer(s) });
  assert.equal(host.input({ type: 'enter' })[0].type, 'mk_wait', 'đang bình chọn thì chờ');
  clock.advance(10_000);
  const fx = host.tick();
  assert.equal(fx[0].type, 'mk_vote_end');
  assert.equal(fx[0].i, 1);
  s = host.snapshot();
  assert.equal(s.rules.length, 2);
  assert.equal(s.rules[1].text, want);
});

test('quà: Ra luật (bình luận kế tiếp thành luật), luật siêu khó, hacker, khiên chặn, gợi ý, xoá luật, thêm / rút giờ', () => {
  const { host, clock } = mk({ baseRules: 6 });
  play(host, clock);
  host.handle(gift('g', 'Rose'));
  assert.equal(host.snapshot().pending.length, 1);
  const fx = host.handle({ type: 'comment', user: u('g'), text: 'trà sữa' });
  assert.equal(fx[0].type, 'mk_rule');
  let s = host.snapshot();
  assert.equal(s.rules.at(-1).id, 'viewer');
  assert.equal(s.rules.at(-1).p.w, 'trà');
  assert.equal(s.total, 7);
  host.handle(gift('e', 'Finger Heart'));
  s = host.snapshot();
  assert.equal(s.rules.at(-1).tier, 3);
  host.input({ type: 'text', value: 'abc' });
  host.handle(gift('h', 'Doughnut'));
  assert.equal(host.snapshot().typed, '');
  host.handle(gift('k', 'Sunglasses'));
  assert.equal(host.snapshot().shield, 1);
  host.input({ type: 'text', value: 'abc' });
  const blocked = host.handle(gift('h', 'Doughnut'));
  assert.equal(blocked.find((f) => f.type === 'mk_gift').blocked, true);
  assert.equal(host.snapshot().typed, 'abc');
  host.handle(gift('z', 'Heart Me'));
  assert.ok(host.snapshot().rules.some((r) => r.hint));
  const n = host.snapshot().rules.length;
  host.handle(gift('z', 'Hand Hearts'));
  assert.equal(host.snapshot().rules.length, n - 1);
  const left = host.snapshot().remainingMs;
  host.handle(gift('z', 'Rosa'));
  assert.equal(host.snapshot().remainingMs, left + 30_000);
  host.handle(gift('z', 'GG'));
  assert.equal(host.snapshot().remainingMs, left + 10_000);
});

test('hết giờ: khoá tài khoản, hình phạt, lùi màn; lưu / khôi phục giữ nguyên ván', () => {
  const { host, clock } = mk({ startLevel: 3 });
  play(host, clock);
  host.input({ type: 'text', value: 'abc' });
  const saved = JSON.parse(JSON.stringify(host.serialize ? host.serialize() : host.game.serialize()));
  const { host: h2 } = mk({ startLevel: 3 }, 9);
  (h2.restore || h2.game.restore).call(h2.restore ? h2 : h2.game, saved);
  assert.equal(h2.snapshot().typed, 'abc');
  assert.deepEqual(h2.snapshot().rules.map((r) => r.text), host.snapshot().rules.map((r) => r.text));
  clock.advance(60 * 60_000);
  const fx = host.tick();
  assert.equal(fx[0].type, 'mk_fail');
  assert.equal(fx[0].punishmentKind, 'game', 'mặc định: án phạt trong game, không bắt host làm gì trước camera');
  assert.ok(fx[0].punishment);
  assert.equal(host.snapshot().level, 2);
  const before = host.snapshot().total;
  clock.advance(60_000); host.tick(); // hết màn kết quả → giới thiệu
  clock.advance(60_000); const start = host.tick();
  assert.ok(start.some((f) => f.type === 'mk_penalty'), 'màn sau bị áp án phạt');
  assert.ok(host.snapshot().total >= before);
});

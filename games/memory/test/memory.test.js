import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';

const game = await loadGame(new URL('..', import.meta.url));
const u = (id) => ({ id, name: `Người ${id}` });

function mk(settings = {}) {
  const clock = fakeClock();
  const fx = [];
  const host = createHost(game, { settings, now: clock.now, random: seededRandom(3), log: {}, onEffects: (e) => fx.push(...e) });
  return { host, clock, fx, game: () => host };
}

const toAnswer = (h, clock) => { clock.advance(10_000); return h.tick(); };

test('vòng chơi: hiện số → ẩn → trả lời đúng có điểm, sai không; mỗi người 1 lần; lên cấp', () => {
  const { host, clock } = mk({ answerSeconds: 10 });
  const s0 = host.snapshot();
  assert.equal(s0.phase, 'show');
  assert.equal(s0.digits, 2);
  const num = s0.number;
  assert.match(num, /^[1-9]\d$/);
  assert.deepEqual(host.handle({ type: 'comment', user: u('a'), text: num }), [], 'đang hiện số thì chưa nhận trả lời');
  assert.equal(toAnswer(host, clock)[0].type, 'mm_hide');
  assert.equal(host.snapshot().number, null, 'pha trả lời: ẩn số');
  const wrong = String((Number(num) + 1) % 100).padStart(2, '1');
  assert.equal(host.handle({ type: 'comment', user: u('b'), text: wrong })[0].type, 'mm_wrong');
  assert.deepEqual(host.handle({ type: 'comment', user: u('b'), text: num }), [], 'đã trả lời rồi thì thôi');
  assert.deepEqual(host.handle({ type: 'comment', user: u('c'), text: `đội ${num}` }), [], 'có chữ cái → không phải câu trả lời');
  const fast = host.handle({ type: 'comment', user: u('a'), text: num.split('').join(' ') })[0];
  assert.equal(fast.type, 'mm_correct');
  clock.advance(8000);
  const slow = host.handle({ type: 'comment', user: u('d'), text: num })[0];
  assert.ok(fast.points > slow.points, 'trả lời nhanh nhiều điểm hơn');
  clock.advance(5000);
  const rev = host.tick()[0];
  assert.equal(rev.type, 'mm_reveal');
  assert.equal(rev.correct, 2);
  assert.equal(host.snapshot().level, 2);
  assert.equal(host.snapshot().board[0].id, 'a');
});

test('chữ số không phải Latin + dấu phân cách vẫn nhận', () => {
  const { host, clock } = mk();
  const num = host.snapshot().number;
  toAnswer(host, clock);
  const arabic = [...num].map((d) => String.fromCodePoint(0x0660 + Number(d))).join('-');
  assert.equal(host.handle({ type: 'comment', user: u('x'), text: arabic })[0]?.type, 'mm_correct');
});

test('actions qua trigger: Rose → hiện lại số (1 lần / vòng, lần 2 trả lượt), tim → +3 giây (tối đa +9)', () => {
  const { host, clock } = mk();
  toAnswer(host, clock);
  const fx = host.handle({ type: 'gift', user: u('g'), giftName: 'Rose', diamonds: 1, count: 1 });
  assert.equal(fx[0].type, 'mm_flash');
  assert.ok(host.snapshot().number, 'đang hiện lại');
  assert.deepEqual(host.handle({ type: 'gift', user: u('g'), giftName: 'Rose', diamonds: 1, count: 1 }), [], 'đã dùng rồi');
  clock.advance(5000);
  assert.equal(host.snapshot().number, null);
  const t = host.handle({ type: 'like', user: u('l'), count: 1500 });
  assert.equal(t.filter((e) => e.type === 'mm_time').length, 3, '1500 tim = 5 lần nhưng tối đa +9 giây');
  assert.equal(host.snapshot().extra, 9);
});

test('pause / resume (lệnh nền tảng) giữ nguyên thời gian còn lại', () => {
  const { host, clock } = mk();
  toAnswer(host, clock);
  const left = host.snapshot().remainingMs;
  host.command('pause');
  clock.advance(60_000);
  assert.deepEqual(host.tick(), []);
  assert.equal(host.snapshot().remainingMs, left);
  host.command('resume');
  assert.equal(host.snapshot().remainingMs, left);
});

test('sai liên tiếp → xuống cấp; restart về cấp 1; cài đặt sai kiểu → dùng default', () => {
  const { host, clock } = mk({ startLevel: 5, failsToLevelDown: 2, answerSeconds: 'abc' });
  assert.ok(host.settingErrors.length, 'báo lỗi cài đặt');
  assert.equal(host.settings.answerSeconds, 15);
  for (let i = 0; i < 2; i++) { clock.advance(10_000); host.tick(); clock.advance(20_000); host.tick(); clock.advance(10_000); host.tick(); }
  assert.equal(host.snapshot().level, 4);
  host.command('restart');
  assert.equal(host.snapshot().level, 5, 'restart về cấp bắt đầu trong cài đặt');
});

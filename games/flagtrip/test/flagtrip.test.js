import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom, normalize } from '#sdk';
import { loadGame } from '#sdk/node';
import { buildMatcher } from '../engine/index.js';

const game = await loadGame(new URL('..', import.meta.url));
const C = game.data.countries;
const byIso = new Map(C.map((c) => [c.iso2, c]));
const u = (id) => ({ id, name: `Người ${id}` });

test('so khớp tên nước: không dấu, tên gọi khác, gõ sai 1 chữ ở tên dài; không nhầm nước gần tên', () => {
  const m = buildMatcher(C);
  assert.equal(m('viet nam'), 'vn');
  assert.equal(m('Mỹ'), 'us');
  assert.equal(m('USA'), 'us');
  assert.equal(m('nhat ban'), 'jp');
  assert.equal(m('Argentinaa'), 'ar', 'sai 1 chữ ở tên dài vẫn nhận');
  assert.notEqual(m('Niger'), m('Nigeria'));
  assert.equal(m('xin chào cả nhà'), null);
});

test('chuyến bay: đúng → chốt sổ → lộ đáp án, tiến chặng; sai + hết giờ → cứu bằng khiên; im lặng không phạt; đủ chặng → hạ cánh', () => {
  const clock = fakeClock();
  const fx = [];
  const host = createHost(game, { settings: { tripLength: 5, checkpointEvery: 2, flagSeconds: 20, lastCallSeconds: 4 }, data: game.data, now: clock.now, random: seededRandom(5), log: {}, onEffects: (e) => fx.push(...e) });
  const answer = () => byIso.get(host.snapshot().flag);
  const step = (ms) => { clock.advance(ms); return host.tick(); };

  // cờ phóng to vào 1 góc / giữa; đoán sớm (còn phóng to) được thưởng
  const z0 = host.snapshot().zoom;
  assert.ok(['tl', 'tr', 'bl', 'br', 'c'].includes(z0.focus) && z0.scale0 > 1 && z0.k === 0);
  // chặng 1: người a đúng (không dấu), b đúng sau → ít điểm hơn
  assert.equal(host.snapshot().mask.every((ch) => ch === null || !/\p{L}/u.test(ch)), true, 'chưa lộ chữ nào');
  const name = normalize(answer().name);
  const ca = host.handle({ type: 'comment', user: u('a'), text: name });
  assert.equal(ca[0].type, 'ft_correct');
  assert.equal(ca[1].type, 'ft_lastcall');
  const cb = host.handle({ type: 'comment', user: u('b'), text: answer().name });
  assert.ok(cb[0].points < ca[0].points);
  assert.ok(ca[0].zoomBonus > 1.4, 'đoán ngay khi cờ còn phóng to tối đa → thưởng gần ×1,5');
  assert.deepEqual(host.handle({ type: 'comment', user: u('a'), text: name }), [], 'mỗi người 1 lần / cờ');
  const rev = step(4000);
  assert.equal(rev.at(-1).type, 'ft_reveal');
  assert.equal(host.snapshot().trip.pos, 1);
  assert.equal(host.snapshot().answer.capital, answer().capital, 'thẻ du lịch có thủ đô');
  step(9000); // sang cờ 2
  assert.notEqual(host.snapshot().zoom.focus, z0.focus, 'cờ sau phóng vào điểm khác cờ trước');

  // phòng im: không phạt, chờ thêm
  assert.equal(step(21_000)[0].type, 'ft_silent');
  // cờ 2: có người đoán sai → hết giờ → máy bay gặp nạn → khiên cứu
  const wrong = C.find((c) => c.iso2 !== host.snapshot().flag && c.tier === 1 && c.name.split(' ').length <= 3);
  assert.equal(host.handle({ type: 'comment', user: u('c'), text: wrong.name })[0].type, 'ft_wrong');
  assert.equal(step(21_000)[0].type, 'ft_rescue');
  const saved = host.handle({ type: 'gift', user: u('g'), giftName: 'Hand Hearts', diamonds: 100, count: 1 });
  assert.equal(saved[0].type, 'ft_rescued');
  assert.equal(host.snapshot().trip.pos, 1, 'được cứu: giữ chặng');
  step(9000);

  // gió xuôi + phản lực → đủ chặng → hạ cánh, tổng kết chuyến
  host.handle({ type: 'gift', user: u('g'), giftName: 'Cap', diamonds: 99, count: 1 });
  const jet = host.handle({ type: 'gift', user: u('g'), giftName: 'Money Gun', diamonds: 500, count: 1 });
  assert.ok(jet.some((e) => e.type === 'ft_landed'));
  assert.equal(host.snapshot().phase, 'landed');
  assert.equal(host.snapshot().summary.crew[0].id, 'a');
  step(13_000);
  assert.equal(host.snapshot().trip.no, 2, 'chuyến bay mới');
  assert.equal(host.snapshot().trip.pos, 0);
  assert.ok(host.snapshot().visitedCount >= 1, 'nước đã ghé vẫn thắp sáng suốt buổi');
});

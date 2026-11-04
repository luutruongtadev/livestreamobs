import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WeeklyBoard } from '../server/weekly.js';
import { WordGame } from '../server/wordgame.js';

// 2026-11-04 (thứ 4) 10:00 giờ VN = 03:00 UTC
const WED = Date.UTC(2026, 10, 4, 3, 0, 0);
const u = (id) => ({ id, name: id.toUpperCase() });

test('tuần tính từ thứ 2 00:00 giờ VN', () => {
  const clock = { t: WED };
  const w = new WeeklyBoard({}, { now: () => clock.t });
  assert.equal(w.weekKey(), '2026-11-02');
  assert.equal(w.weekKey(Date.UTC(2026, 10, 1, 16, 59)), '2026-10-26'); // CN 23:59 VN vẫn tuần trước
  assert.equal(w.weekKey(Date.UTC(2026, 10, 1, 17, 0)), '2026-11-02'); // T2 00:00 VN sang tuần mới
  assert.equal(w.weekEndsAt(), Date.UTC(2026, 10, 8, 17, 0));
});

test('đoán đúng càng sớm càng nhiều điểm; điểm thưởng chia sẻ / quà cộng vào lần đúng tiếp theo rồi xoá', () => {
  const clock = { t: WED };
  const w = new WeeklyBoard({}, { now: () => clock.t });
  assert.equal(w.award(u('a'), 1).total, 200); // vừa mở vòng: 100 + 100
  assert.equal(w.award(u('b'), 0.25).total, 125);
  assert.equal(w.award(u('c'), 0).total, 100);
  // tích thưởng: 2 lượt share = 40, quà 50 xu = 100
  w.addBonus(u('b'), { shares: 2 });
  const r = w.addBonus(u('b'), { diamonds: 50 });
  assert.deepEqual(r, { add: 100, total: 140 });
  assert.equal(w.pendingBonus('b'), 140);
  const p = w.award(u('b'), 0.5);
  assert.deepEqual(p, { base: 100, speed: 50, shareBonus: 40, giftBonus: 100, total: 290, weekPoints: 415, rank: 1 });
  assert.equal(w.pendingBonus('b'), 0, 'dùng xong thì hết');
  // giới hạn: tối đa 5 lượt share, 300 điểm quà
  w.addBonus(u('c'), { shares: 9, diamonds: 1000 });
  assert.equal(w.pendingBonus('c'), 5 * 20 + 300);
  assert.deepEqual(w.snapshot().top.map((s) => s.id), ['b', 'a', 'c']);
});

test('sang tuần mới: chốt top, người nhất thành Vua tuần, điểm và thưởng chờ xoá; lưu file qua khởi động lại', () => {
  const statePath = path.join(os.tmpdir(), `weekly-${process.pid}-${Date.now()}.json`);
  const clock = { t: WED };
  const w = new WeeklyBoard({}, { now: () => clock.t, statePath });
  w.award(u('a'), 1); w.award(u('b'), 0); w.award(u('b'), 0); // b: 200, a: 200 → hoà điểm, b nhiều lần trúng hơn
  w.addBonus(u('a'), { shares: 1 });
  w.save();
  clock.t += 6 * 86400e3; // sang tuần sau
  const w2 = new WeeklyBoard({}, { now: () => clock.t, statePath });
  const snap = w2.snapshot();
  assert.equal(snap.week, '2026-11-09');
  assert.deepEqual(snap.top, []);
  assert.equal(snap.king.name, 'B');
  assert.equal(w2.pendingBonus('a'), 0);
  assert.equal(w2.admin().history[0].week, '2026-11-02');
  // chốt tay giữa tuần: không bị chốt lặp lại ở lần kiểm tra sau
  w2.award(u('c'), 1);
  w2.closeWeek();
  assert.equal(w2.snapshot().king.name, 'C');
  assert.equal(w2.admin().history.length, 2);
  w2.snapshot();
  assert.equal(w2.admin().history.length, 2);
});

test('Đoán từ: đoán trúng ghi điểm tuần theo tốc độ; chia sẻ / quà tích thưởng (kể cả lúc nghỉ)', () => {
  const clock = { t: WED };
  const weekly = new WeeklyBoard({}, { now: () => clock.t });
  const g = new WordGame({ words: [{ word: 'mặt trời' }], roundSeconds: 100, cooldownSec: 0 }, { scorer: { score: async () => 50 }, now: () => clock.t, weekly });
  const share = g.handle({ type: 'share', user: u('a') });
  assert.equal(share.find((e) => e.type === 'wg_bonus').add, 20);
  const gift = g.handle({ type: 'gift', user: u('a'), giftName: 'Rose', diamonds: 1, repeatCount: 10 });
  assert.equal(gift.find((e) => e.type === 'wg_thanks').bonusTotal, 40);
  clock.t += 25_000; // đoán trúng ở giây 25/100
  const win = g.handle({ type: 'comment', user: u('a'), text: 'mặt trời' }).find((e) => e.type === 'wg_win');
  assert.deepEqual(win.points, { base: 100, speed: 75, shareBonus: 20, giftBonus: 20, total: 215, weekPoints: 215, rank: 1 });
  assert.equal(g.snapshot().weekly.top[0].points, 215);
  assert.equal(g.snapshot().winner.points.total, 215);
  // đang nghỉ giữa vòng vẫn tích thưởng
  assert.equal(g.handle({ type: 'share', user: u('b') }).find((e) => e.type === 'wg_bonus').total, 20);
});

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
  // tích thưởng: 2 lượt share = 40, quà 5 xu = 250 (1 xu = 50 điểm)
  w.addBonus(u('b'), { shares: 2 });
  const r = w.addBonus(u('b'), { diamonds: 5 });
  assert.deepEqual(r, { add: 250, total: 290 });
  assert.equal(w.pendingBonus('b'), 290);
  const p = w.award(u('b'), 0.5);
  assert.deepEqual(p, { base: 100, speed: 50, likeBonus: 0, mult: 1, comboBonus: 0, shareBonus: 40, giftBonus: 250, total: 440, weekPoints: 565, rank: 1 });
  assert.equal(w.pendingBonus('b'), 0, 'dùng xong thì hết');
  // share tối đa 5 lượt; quà không giới hạn
  w.addBonus(u('c'), { shares: 9, diamonds: 1000 });
  assert.equal(w.pendingBonus('c'), 5 * 20 + 50000);
  // thưởng tim + combo x3: (tốc độ + tim) x3
  const q = w.award(u('a'), 0.5, { likeBonus: 50, mult: 3 });
  assert.deepEqual([q.likeBonus, q.mult, q.comboBonus, q.total], [50, 3, 200, 100 + 100 + 200]);
});

test('sang tuần mới: chốt top, người nhất thành Vua tuần, điểm xoá nhưng thưởng quà / share đang giữ vẫn còn; lưu file qua khởi động lại', () => {
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
  assert.equal(w2.pendingBonus('a'), 20, 'thưởng chờ giữ tới lần đoán đúng');
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
  assert.equal(gift.find((e) => e.type === 'wg_thanks').bonusTotal, 520);
  clock.t += 25_000; // đoán trúng ở giây 25/100
  const win = g.handle({ type: 'comment', user: u('a'), text: 'mặt trời' }).find((e) => e.type === 'wg_win');
  assert.deepEqual(win.points, { base: 100, speed: 75, likeBonus: 0, mult: 1, comboBonus: 0, shareBonus: 20, giftBonus: 500, total: 695, weekPoints: 695, rank: 1 });
  assert.equal(g.snapshot().weekly.top[0].points, 695);
  assert.equal(g.snapshot().winner.points.total, 695);
  // đang nghỉ giữa vòng vẫn tích thưởng
  assert.equal(g.handle({ type: 'share', user: u('b') }).find((e) => e.type === 'wg_bonus').total, 20);
});

test('thả đủ 1000 tim trong vòng + đoán trúng = +50 (đếm lại mỗi vòng); trúng liên tiếp = combo xN điểm thưởng, đứt chuỗi thì reset', () => {
  const clock = { t: WED };
  const weekly = new WeeklyBoard({}, { now: () => clock.t });
  const words = ['mặt trời', 'con mèo', 'cái bàn', 'quả cam', 'xe đạp', 'bông hoa', 'cây tre'].map((word) => ({ word }));
  const g = new WordGame({ words, modes: ['meaning'], roundSeconds: 100, breakSeconds: 0, cooldownSec: 0 }, { scorer: { score: async () => ({ score: 5 }) }, now: () => clock.t, weekly, random: () => 0 });
  const win = (id) => g.handle({ type: 'comment', user: u(id), text: g.secret }).find((e) => e.type === 'wg_win');
  const next = () => { clock.t += 1000; g.startRound(); };
  // vòng 1: a thả 600 + 400 tim → đạt mốc 1000, có thông báo
  g.handle({ type: 'like', user: u('a'), count: 600 });
  const fx = g.handle({ type: 'like', user: u('a'), count: 400 });
  assert.ok(fx.some((e) => e.type === 'wg_like_bonus' && e.by.id === 'a' && e.points === 50));
  let w = win('a');
  assert.equal(w.points.likeBonus, 50);
  assert.equal(w.combo, undefined, 'trúng 1 vòng chưa có combo');
  // vòng 2: tim đếm lại; a trúng tiếp → combo x2
  next();
  assert.equal(g.snapshot().streak.nextMult, 2);
  w = win('a');
  assert.equal(w.points.likeBonus, 0, 'tim vòng trước không tính');
  assert.deepEqual(w.combo, { n: 2, mult: 2 });
  assert.equal(w.points.comboBonus, w.points.speed);
  next(); assert.equal(win('a').combo.mult, 3);
  next(); assert.equal(win('a').combo.mult, 4);
  next(); assert.equal(win('a').combo.mult, 5);
  next(); assert.deepEqual(win('a').combo, { n: 6, mult: 5 }, 'tối đa x5');
  // b trúng → chuỗi của a đứt
  next(); assert.equal(win('b').combo, undefined);
  // vòng hết giờ không ai trúng → chuỗi của b đứt
  next(); clock.t += 200_000; g.step();
  next(); assert.equal(g.snapshot().streak, null);
  assert.equal(win('b').combo, undefined);
});

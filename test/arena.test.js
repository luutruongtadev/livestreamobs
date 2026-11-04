import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Arena } from '../server/arena.js';
import { CardStore } from '../server/cards.js';
import { CARDS, CARD_BY_ID, statsOf, stars, SKILLS } from '../public/js/cards-data.js';

const u = (id) => ({ id, name: id.toUpperCase() });
function rng(seed = 1) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function mk(cfg = {}, seed = 7) {
  const clock = { t: 1_000_000 };
  const random = rng(seed);
  const cards = new CardStore({ random, now: () => clock.t });
  const a = new Arena({ minFighters: 4, ...cfg }, { cards, now: () => clock.t, random });
  return { a, cards, clock };
}
const say = (a, id, text) => a.handle({ type: 'comment', user: u(id), text });
/** Chạy mô phỏng 10 tick / giây cho tới khi hết trận (hoặc quá giới hạn). */
function runFight(a, clock, maxSec = 400) {
  const fx = [];
  for (let i = 0; i < maxSec * 10 && a.phase === 'fight'; i++) { clock.t += 100; fx.push(...a.tick()); }
  return fx;
}

test('dữ liệu thẻ: đủ kỹ năng, chỉ số tăng theo độ hiếm + phẩm chất', () => {
  for (const c of CARDS) assert.ok(SKILLS[c.skill], c.id);
  assert.ok(statsOf('rong', 100).hp > statsOf('rong', 60).hp);
  assert.ok(statsOf('rong', 80).atk > statsOf('ga', 80).atk * 0.9);
  // thẻ hiếm nhất chỉ mạnh hơn thẻ thường khoảng 1/3, không gấp đôi
  assert.ok(statsOf('giong', 100).hp / statsOf('de', 100).hp < 1.7);
  assert.deepEqual([60, 70, 80, 90, 97].map(stars), [1, 2, 3, 4, 5]);
});

test('comment "vào": người mới nhận thẻ khởi đầu (Thường) rồi nhảy vào sân; đang đánh thì hẹn trận sau', () => {
  const { a, cards, clock } = mk();
  const fx = say(a, 'an', 'Vào');
  assert.equal(fx[0].type, 'arena_join');
  assert.equal(fx[0].starter.rar, 'C');
  assert.equal(cards.get('an').cards.length, 1);
  assert.deepEqual(say(a, 'an', 'vào'), [], 'vào rồi thì thôi');
  assert.equal(say(a, 'binh', 'vàoooo')[0].type, 'arena_join');
  assert.equal(say(a, 'chi', 'vô')[0].type, 'arena_join');
  assert.equal(say(a, 'dung', 'cho mình vào với')[0]?.type, undefined, 'câu dài không tính');
  clock.t += 31_000;
  const go = a.tick();
  assert.equal(a.phase, 'fight');
  assert.equal(go.filter((e) => e.type === 'arena_join' && e.bot).length, 1, 'thiếu người thì thêm bot cho đủ 4');
  assert.equal(say(a, 'em', 'vào')[0].type, 'arena_queue');
  runFight(a, clock);
  clock.t += 20_000; a.tick();
  assert.equal(a.phase, 'lobby');
  assert.ok(a.byId.has('em'), 'người đăng ký trước được vào luôn trận sau');
});

test('100 người cùng lúc: trận luôn kết thúc, có người thắng nhận rương vàng, mỗi tick nhanh', () => {
  const { a, cards, clock } = mk({ minFighters: 16 }, 39);
  for (let i = 0; i < 120; i++) say(a, 'p' + i, 'vào');
  assert.equal(a.fighters.length, 100, 'tối đa 100 con');
  assert.equal(a.queue.length, 20, 'người thứ 101 trở đi xếp hàng trận sau');
  assert.ok(a.endsAt - clock.t <= 5000, 'đủ 100 con thì 5 giây sau đánh luôn');
  clock.t += 5000; a.tick();
  assert.equal(a.phase, 'fight');
  // thả tim + quà dồn dập trong lúc đánh
  const t0 = process.hrtime.bigint();
  let ticks = 0;
  const fx = [];
  while (a.phase === 'fight' && ticks < 4000) {
    clock.t += 100; ticks++;
    fx.push(...a.tick());
    if (ticks % 3 === 0) for (let k = 0; k < 10; k++) fx.push(...a.handle({ type: 'like', user: u('p' + ((ticks + k) % 100)), count: 5 }));
    if (ticks % 25 === 0) fx.push(...a.handle({ type: 'gift', user: u('p' + (ticks % 100)), diamonds: [1, 5, 10, 30, 99, 299][ticks % 6] }));
    if (ticks % 7 === 0) fx.push(...say(a, 'p' + (ticks % 100), 'báo thù'));
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(a.phase, 'ended');
  assert.ok(ticks / 10 < 125, `trận dài ${ticks / 10}s (giới hạn ~110s)`);
  assert.ok(ms / ticks < 5, `trung bình ${(ms / ticks).toFixed(2)} ms / tick`);
  const win = fx.find((e) => e.type === 'arena_win');
  assert.ok(win?.winner, 'có người thắng');
  assert.ok(fx.filter((e) => e.type === 'arena_kill').length >= a.fighters.length - 1, 'quà hồi sinh có thể làm một con chết 2 lần');
  console.log(`# 100 con: trận ${ticks / 10}s, ${(ms / ticks).toFixed(3)} ms/tick, gói vị trí ${JSON.stringify(a.positions()).length}B`);
  const chest = fx.find((e) => e.type === 'arena_chest' && e.reason === 'win');
  if (!win.winner.bot) {
    assert.ok(chest, 'người thắng được mở rương vàng');
    assert.notEqual(chest.card.rar, 'C', 'rương vàng không ra thẻ Thường');
    assert.equal(cards.get(win.winner.id).wins, 1);
  }
  // gói vị trí gửi 10 lần / giây phải nhỏ
  assert.ok(JSON.stringify(a.positions()).length < 3000);
  assert.ok(JSON.stringify(a.snapshot()).length < 40_000);
});

test('quà: mỗi xu 1 mảnh, đủ 100 mảnh mở rương; bom rơi vào con mạnh nhất; quà lớn khi đã chết thì hồi sinh', () => {
  const { a, cards, clock } = mk();
  for (const id of ['a', 'b', 'c', 'd']) say(a, id, 'vào');
  a.skip();
  const fA = a.byId.get('a'), fB = a.byId.get('b');
  fB.kills = 3; // con mạnh nhất
  const g = a.handle({ type: 'gift', user: u('a'), diamonds: 30, giftName: 'Doughnut' });
  const bomb = g.find((e) => e.type === 'arena_bomb');
  assert.equal(bomb.v, fB.i);
  assert.equal(cards.get('a').shards, 30);
  const hp = fB.hp;
  fB.x = fA.x + 400; fB.y = fA.y; // để xa cho khỏi đánh nhau
  clock.t += 1000;
  const boom = a.tick();
  assert.ok(boom.some((e) => e.type === 'arena_boom'));
  assert.ok(fB.hp < hp || !fB.alive);
  // 70 xu nữa → đủ 100 mảnh → mở 1 rương
  const g2 = a.handle({ type: 'gift', user: u('a'), diamonds: 10, repeatCount: 7 });
  const chest = g2.find((e) => e.type === 'arena_chest');
  assert.equal(chest.reason, 'gift');
  assert.equal(cards.get('a').cards.length, 2);
  assert.equal(cards.get('a').shards, 0);
  // bị hạ rồi tặng 99 xu → sống lại + khổng lồ
  a.kill(fA, null, 'zone');
  const g3 = a.handle({ type: 'gift', user: u('a'), diamonds: 99 });
  const info = g3.find((e) => e.type === 'arena_gift');
  assert.equal(info.tier, 'giant');
  assert.ok(info.revived && fA.alive && fA.giantUntil > clock.t);
  // thả tim hồi máu
  fA.hp = 10;
  a.handle({ type: 'like', user: u('a'), count: 50 });
  assert.equal(Math.round(fA.hp), 30, 'tối đa 20 tim / lần');
});

test('"dùng rồng" chọn thẻ ra trận (đổi ngay khi còn ở sảnh); "thẻ" khoe bộ sưu tập; "báo thù" khi đã bị hạ', () => {
  const { a, cards, clock } = mk();
  cards.open(u('a'), 'gold', { cardId: 'rong' });
  cards.open(u('a'), 'normal', { cardId: 'ga' });
  say(a, 'a', 'vào');
  assert.equal(a.byId.get('a').card.id, 'rong', 'mặc định ra lá mạnh nhất');
  const p = say(a, 'a', 'dùng gà chọi');
  assert.equal(p.find((e) => e.type === 'arena_pick').card.card, 'ga');
  assert.equal(a.byId.get('a').card.id, 'ga');
  assert.equal(say(a, 'a', 'dùng long vương')[0].missing, 'longvuong');
  const show = say(a, 'a', 'thẻ')[0];
  assert.equal(show.type, 'arena_show');
  assert.equal(show.summary.total, 2);
  assert.deepEqual(say(a, 'a', 'thẻ'), [], 'chờ 60 giây mới khoe lại');
  say(a, 'b', 'vào');
  a.skip();
  const fa = a.byId.get('a'), fb = a.byId.get('b');
  a.kill(fa, fb, 'hit');
  assert.equal(fb.kills, 1);
  const g = say(a, 'a', 'báo thù');
  assert.equal(g[0].type, 'arena_ghost');
  assert.deepEqual(say(a, 'a', 'báo thù'), [], 'mỗi lần chết báo thù 1 lần');
  const hp = fb.hp;
  clock.t += 900;
  a.tick();
  assert.ok(fb.hp < hp || !fb.alive);
});

test('kho thẻ: số seri tăng theo loài, lưu file, kho đầy thì đổi lá yếu nhất thành mảnh', () => {
  const file = path.join(os.tmpdir(), `cards-${process.pid}-${Date.now()}.json`);
  const s = new CardStore({ filePath: file, maxCards: 3, random: rng(3) });
  const a = s.open(u('x'), 'normal', { cardId: 'rong' });
  const b = s.open(u('y'), 'normal', { cardId: 'rong' });
  assert.deepEqual([a.serial, b.serial, a.firstEver, b.firstEver], [1, 2, true, false]);
  s.open(u('x'), 'normal', { cardId: 'ga' });
  s.open(u('x'), 'normal', { cardId: 'trau' });
  const r = s.open(u('x'), 'normal', { cardId: 'giong' });
  assert.equal(s.get('x').cards.length, 3);
  assert.ok(['ga', 'trau'].includes(r.dropped));
  assert.equal(s.get('x').shards, 10);
  s.save();
  const s2 = new CardStore({ filePath: file });
  assert.equal(s2.get('x').cards.length, 3);
  assert.equal(s2.open(u('z'), 'normal', { cardId: 'rong' }).serial, 3);
  assert.equal(s2.find('x')[0].cards[0].card, 'giong');
  fs.rmSync(file, { force: true });
});

test('tạm dừng: đồng hồ trận đứng yên, các con không di chuyển', () => {
  const { a, clock } = mk();
  for (const id of ['a', 'b', 'c', 'd']) say(a, id, 'vào');
  a.skip();
  clock.t += 2000; a.tick();
  const f = a.fighters[0];
  const pos = [f.x, f.y];
  a.pause();
  clock.t += 60_000;
  assert.deepEqual(a.tick(), []);
  assert.deepEqual([f.x, f.y], pos);
  assert.equal(a.snapshot().elapsed, 2);
  a.resume();
  clock.t += 100; a.tick();
  assert.equal(a.snapshot().elapsed, 2);
  assert.equal(a.zoneAt(clock.t).r, a.cfg.field.r);
});

test('mọi kỹ năng chủ động đều tung được', () => {
  for (const c of CARDS.filter((x) => SKILLS[x.skill].active)) {
    const { a, cards, clock } = mk();
    cards.open(u('me'), 'normal', { cardId: c.id });
    say(a, 'me', 'vào');
    for (const id of ['b', 'c', 'd']) say(a, id, 'vào');
    a.skip();
    const me = a.byId.get('me');
    me.nextSkill = 0;
    a.fighters.filter((f) => f !== me).forEach((f, k) => { f.x = me.x + 60 + k * 30; f.y = me.y; f.shieldUntil = clock.t + 9e9; });
    clock.t += 100;
    const fx = a.tick();
    assert.ok(fx.some((e) => e.type === 'arena_skill' && e.i === me.i), `${c.id} (${CARD_BY_ID[c.id].skill})`);
  }
});

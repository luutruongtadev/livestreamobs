import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';

const game = await loadGame(new URL('..', import.meta.url));
const u = (id) => ({ id, name: `Người ${id}` });
const gift = (id, giftName) => ({ type: 'gift', user: u(id), giftName, diamonds: 1, count: 1 });

test('quấn dây tới khi nổ: bình luận (giới hạn mỗi người), tim, follow 1 lần, quà dồn dập, kéo cắt, dao + thớt, dưa vàng, cô Ba tự quấn, dưa mới lớn dần', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { breakMin: 30, breakMax: 30, wrapSeconds: 0.5, selfBandSeconds: 3, popSeconds: 3, knifeSeconds: 5, likesPerBand: 20, followBands: 5 }, data: game.data, now: clock.now, random: seededRandom(2), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { const fx = []; for (let t = 0; t < ms; t += 100) { clock.advance(100); fx.push(...host.tick()); } return fx; };

  for (let i = 0; i < 5; i++) host.handle({ type: 'comment', user: u('a'), text: 'quấn đi' });
  assert.equal(S().queue, 3, 'mỗi người tối đa 3 sợi chờ');
  host.handle({ type: 'like', user: u('b'), count: 45 });
  assert.equal(S().queue, 5, '45 tim → 2 sợi');
  assert.deepEqual(S().next.map((x) => x.id), ['a', 'a', 'a', 'b', 'b']);
  step(3000);
  assert.equal(S().bands, 5); assert.equal(S().queue, 0);
  host.handle({ type: 'follow', user: u('c') }); host.handle({ type: 'follow', user: u('c') });
  host.handle(gift('d', 'Finger Heart'));
  step(2000);
  assert.equal(S().bands, 20, 'follow 5 sợi (1 lần) + bó dây 10 sợi');
  host.handle(gift('e', 'Perfume'));
  assert.equal(S().bands, 10, 'kéo cắt 10 sợi');
  // dao: thớt đang chờ chặn được nhát dao; dao không bị chặn thì hết giờ bổ đôi
  host.handle(gift('f', 'Cap'));
  assert.equal(S().shields, 1);
  assert.equal(host.handle(gift('g', 'Galaxy')).some((e) => e.type === 'bd_block'), true);
  assert.equal(S().knife, null);
  host.handle(gift('g', 'Galaxy'));
  assert.ok(S().knife);
  const fx = step(6000);
  const pop = fx.find((e) => e.type === 'bd_pop');
  assert.equal(pop.how, 'dao'); assert.equal(pop.by.id, 'g');
  assert.equal(S().phase, 'pop'); assert.equal(S().popper.id, 'g');
  // trái mới: không ai bình luận → cô Ba tự quấn; dưa vàng cứng hơn; quà lớn làm nổ, người có sợi cuối là người làm nổ
  step(3100);
  assert.equal(S().phase, 'wrap'); assert.equal(S().melonNo, 2);
  step(3200);
  assert.equal(S().bands, 1, 'cô Ba tự quấn 1 sợi sau 3 giây');
  host.handle(gift('h', 'Sunglasses'));
  assert.equal(S().golden.id, 'h');
  host.handle(gift('i', 'Doughnut'));
  step(3000);
  assert.equal(S().phase, 'wrap', 'dưa vàng: 26 sợi chưa đủ nổ (ngưỡng 30 × 1,5 + 10)');
  host.handle(gift('j', 'Hand Hearts'));
  const fx2 = step(6000);
  assert.equal(fx2.find((e) => e.type === 'bd_pop')?.by.id, 'j');
  assert.equal(S().top[0].pops, 1);
  // trái thứ 5 là dưa to
  for (let k = 0; k < 2; k++) { step(3100); host.command('pop'); }
  step(3100);
  assert.equal(S().melonNo, 5); assert.equal(S().size, 'to');
});

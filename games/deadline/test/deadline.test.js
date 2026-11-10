import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';

const game = await loadGame(new URL('..', import.meta.url));
const D = game.data.office;
const spam = new Set(D.inbox.spam.map((m) => m[1]));
const folderOf = new Map(D.files);
const u = (id) => ({ id, name: `Người ${id}` });
const gift = (id, giftName, diamonds) => ({ type: 'gift', user: u(id), giftName, diamonds, count: 1 });

test('ca làm (máy tính): mini-việc, ping lấy bình luận người tặng, virus / trend chặn việc, meme quà ≥ 5 xu, thắng lên chức, trễ thì xuống chức', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { steps: 4, shiftSeconds: 120, briefSeconds: 2, resultSeconds: 5, startRank: 1, memeClip_cafe: 'https://media.tenor.com/x/cafe.gif' }, data: game.data, now: clock.now, random: seededRandom(3), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { clock.advance(ms); return host.tick(); };
  const doJob = () => {
    const j = S().job;
    if (j.kind === 'mail') { host.input({ type: 'text', value: j.text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }); return host.input({ type: 'enter' }); }
    if (j.kind === 'sheet') { host.input({ type: 'text', value: String(j.nums.reduce((a, x) => a + x, 0)) }); return host.input({ type: 'enter' }); }
    if (j.kind === 'inbox') return j.mails.flatMap((m, i) => host.input({ type: 'click', target: 'inbox', id: i, value: spam.has(m.subject) ? 'spam' : 'keep' }));
    return j.files.flatMap((f, i) => [...host.input({ type: 'click', target: 'file', id: i }), ...host.input({ type: 'click', target: 'folder', id: folderOf.get(f.name) })]);
  };

  assert.equal(S().phase, 'brief');
  step(2000);
  assert.equal(S().phase, 'work');
  assert.equal(S().job.kind, 'mail');
  // gõ sai → không qua; gõ không dấu đúng câu → +1 bước, sang việc Hộp thư
  host.input({ type: 'text', value: 'sai bét' });
  assert.equal(host.input({ type: 'enter' })[0].type, 'dd_wrong');
  assert.ok(doJob().some((e) => e.type === 'dd_step'));
  assert.equal(S().step, 1);
  assert.equal(S().job.kind, 'inbox');

  // sếp ping (1 xu, không meme): popup chờ câu → bình luận kế tiếp của chính người tặng thành nội dung (lọc từ cấm)
  const [g1, p1] = host.handle(gift('a', 'Rose', 1));
  assert.equal(g1.type, 'dd_gift'); assert.equal(g1.meme, null);
  assert.equal(host.handle(gift('z', 'Heart Me', 1))[0].meme?.clip, 'https://media.tenor.com/x/cafe.gif', 'quà 1 xu nhưng có link video riêng → vẫn phát');
  assert.equal(p1.type, 'dd_ping'); assert.equal(S().pings[0].waiting, true);
  assert.deepEqual(host.handle({ type: 'comment', user: u('b'), text: 'không phải tôi' }), [], 'người khác bình luận không lấp ping');
  host.handle({ type: 'comment', user: u('a'), text: 'Xong chưa đm em ơi' });
  assert.equal(S().pings[0].text, 'Xong chưa *** em ơi');
  // ping thứ 2 không ai gõ → hết thời gian chờ thì dùng câu có sẵn
  host.handle(gift('c', 'Rose', 1));
  step(10_000);
  assert.ok(D.pings.includes(S().pings[1].text));
  // popup che màn hình: bấm việc không ăn, đóng hết ping mới làm tiếp
  assert.equal(S().covered, true);
  assert.deepEqual(host.input({ type: 'click', target: 'inbox', id: 0, value: 'keep' }), []);
  for (const p of S().pings) host.input({ type: 'click', target: 'ping', id: p.id });
  assert.equal(S().covered, false);

  // virus (299 xu → có meme) chặn việc đến khi xoá hết; sếp nói trend bắt gõ đúng nguyên văn
  const gv = host.handle(gift('d', 'Corgi', 299))[0];
  assert.ok(gv.meme?.line && gv.meme.mood);
  assert.equal(S().blocker.kind, 'virus');
  host.handle(gift('e', 'Hat and Mustache', 99));
  assert.deepEqual(doJob().filter((e) => e.type === 'dd_step'), [], 'đang dính virus thì không làm việc được');
  for (let i = 0; i < 5; i++) host.input({ type: 'click', target: 'virus', id: i });
  assert.equal(S().blocker.kind, 'buzz');
  host.input({ type: 'text', value: 'gì vậy sếp' }); host.input({ type: 'enter' });
  assert.equal(S().blocker.kind, 'buzz', 'gõ sai câu trend thì vẫn bị chặn');
  host.input({ type: 'text', value: S().blocker.phrase.toUpperCase() }); host.input({ type: 'enter' });
  assert.equal(S().blocker, null);

  // làm tiếp đủ 4 bước → thắng, lên chức; cắt giảm nhân sự trừ 3 bước nhưng không âm
  assert.ok(doJob().some((e) => e.type === 'dd_step'));
  host.handle(gift('f', 'Galaxy', 1000));
  assert.equal(S().step, 0);
  while (S().phase === 'work') doJob();
  assert.equal(S().result.win, true);
  assert.equal(S().rank.name, 'Chuyên viên');
  assert.equal(S().top.bosses[0].name, 'Người f', 'sếp soi nhất theo số xu');

  // ca sau: hết giờ không xong → trễ deadline, xuống chức, có hình phạt; quà gia hạn cộng giờ
  step(5000); step(2000);
  assert.equal(S().phase, 'work');
  const left = S().remainingMs;
  host.handle(gift('g', 'Hand Hearts', 100));
  assert.equal(S().remainingMs, left + 60_000);
  step(left + 60_000);
  assert.equal(S().result.win, false);
  assert.equal(S().rank.name, 'Nhân viên');
  assert.ok(D.punishments.includes(S().result.punishment));
});

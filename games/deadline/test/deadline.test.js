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
  const host = createHost(game, { settings: { story: false, jobs: ['mail', 'inbox', 'sheet', 'files'], shuffleJobs: false, steps: 4, shiftSeconds: 120, briefSeconds: 2, resultSeconds: 5, startRank: 1, memeClip_cafe: 'https://media.tenor.com/x/cafe.gif' }, data: game.data, now: clock.now, random: seededRandom(3), log: {} });
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

test('cốt truyện: chương theo chức, lời dẫn dài khi sang chương mới, NPC nhắn tin + gây sự kiện theo mốc, kết chương; thắng ở chức cao nhất → đoạn kết, sang mùa mới (cả chế độ camera)', () => {
  const CH = D.story.chapters;
  for (const mode of ['desktop', 'camera']) {
    const clock = fakeClock();
    const host = createHost(game, { settings: { mode, steps: 3, shiftSeconds: 100, briefSeconds: 2, storyBriefSeconds: 8, resultSeconds: 5, startRank: 0 }, data: game.data, now: clock.now, random: seededRandom(4), log: {} });
    const S = () => host.snapshot();
    const step = (ms) => { const fx = []; for (let t = 0; t < ms; t += 250) { clock.advance(Math.min(250, ms - t)); fx.push(...host.tick()); } return fx; };
    // chương 1
    assert.equal(S().chapter.no, 1); assert.equal(S().chapter.title, CH[0].title); assert.equal(S().chapter.fresh, true);
    assert.equal(S().task.name, mode === 'desktop' ? CH[0].desktopTask.name : CH[0].cameraTask.replace('{n}', 3));
    step(2000);
    assert.equal(S().phase, 'brief', 'chương mới: đọc lời dẫn lâu hơn');
    step(6000);
    assert.equal(S().phase, 'work');
    // mốc 22%: Linh nhắn (không sự kiện); mốc 50%: chị Hạnh đến soi
    const fx1 = step(23_000);
    const st = fx1.filter((e) => e.type === 'dd_story');
    assert.equal(st.length, 1); assert.equal(st[0].by.name, CH[0].events[0].from);
    assert.equal(S().story[0].text, CH[0].events[0].text);
    step(27_000);
    assert.equal(S().status.find((x) => x.kind === 'soi')?.by.name, 'Chị Hạnh');
    assert.equal(S().top.bosses.length, 0, 'NPC không vào bảng xếp hạng');
    // thua ca: lời kết thua của chương, ca sau cùng chương nhưng lời dẫn ngắn
    step(51_000);
    assert.equal(S().result.win, false); assert.equal(S().result.story, CH[0].fail);
    step(5000);
    assert.equal(S().chapter.no, 1); assert.equal(S().chapter.fresh, false);
    step(2000);
    assert.equal(S().phase, 'work');
    // thăng chức thẳng qua các chương tới Chủ tịch, thắng ca cuối → đoạn kết, mùa 2 từ chương 1
    for (let i = 0; i < CH.length; i++) {
      if (S().phase === 'brief') step(8000);
      assert.equal(S().chapter.no, i + 1);
      host.handle(gift('z', 'Lion', 29999));
      assert.equal(S().result.story, CH[i].win);
      if (i < CH.length - 1) { assert.equal(S().result.ending, null); step(5000); }
    }
    assert.ok(S().result.ending.length >= 2);
    assert.ok(S().result.ending.some((l) => l.includes('Mùa 1')));
    step(Math.max(5, 8 + 4) * 1000);
    assert.equal(S().season, 2); assert.equal(S().chapter.no, 1); assert.equal(S().chapter.fresh, true);
    const saved = JSON.parse(JSON.stringify(host.serialize()));
    const h2 = createHost(game, { settings: { mode }, data: game.data, now: clock.now, random: seededRandom(1), log: {} });
    h2.restore(saved);
    assert.equal(h2.snapshot().season, 2);
  }
});

test('cốt truyện: NPC khách hàng ping (chế độ máy tính) hiện ngay câu có sẵn, quà người xem vẫn hoạt động; tắt story thì như cũ', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { steps: 5, shiftSeconds: 100, briefSeconds: 2, storyBriefSeconds: 4, startRank: 1 }, data: game.data, now: clock.now, random: seededRandom(8), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { for (let t = 0; t < ms; t += 250) { clock.advance(250); host.tick(); } };
  step(4000);
  step(26_000);
  const p = S().pings.find((x) => x.by.name === 'Khách hàng VIP');
  assert.ok(p && !p.waiting && p.text.startsWith('Sao chưa trả lời'));
  const off = createHost(game, { settings: { story: false }, data: game.data, now: clock.now, random: seededRandom(8), log: {} });
  assert.equal(off.snapshot().chapter, null);
  assert.ok(D.desktopTasks.some((t) => t.name === off.snapshot().task.name));
});

test('mini-việc mới: mật khẩu, robot, ký duyệt, OTP, chính tả, trả lời khách, lịch họp, dọn màn hình — làm sai bị chặn, làm đúng +1 bước; xáo không trùng, đủ vòng', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { story: false, steps: 30, shiftSeconds: 900, briefSeconds: 2 }, data: game.data, now: clock.now, random: seededRandom(11), log: {} });
  const S = () => host.snapshot();
  const tap = (target, id, value) => host.input({ type: 'click', target, id, value });
  const typeEnter = (v) => { host.input({ type: 'text', value: v }); return host.input({ type: 'enter' }); };
  const goodReply = new Map(D.replies.map((r) => [r.msg, r.good]));
  const badWords = (ws) => { const raw = D.typos.find((t) => t.replace(/\*/g, '') === ws.map((w) => w.w).join(' ')); return raw.split(/\s+/).map((w) => /^\*.+\*$/.test(w)); };
  const wrongs = new Set();
  const solve = (j) => {
    switch (j.kind) {
      case 'mail': return typeEnter(j.text);
      case 'sheet': return typeEnter(String(j.nums.reduce((a, x) => a + x, 0)));
      case 'inbox': { const spam = new Set(D.inbox.spam.map((m) => m[1])); return j.mails.flatMap((m, i) => tap('inbox', i, spam.has(m.subject) ? 'spam' : 'keep')); }
      case 'files': { const f = new Map(D.files); return j.files.flatMap((x, i) => [...tap('file', i), ...tap('folder', f.get(x.name))]); }
      case 'password':
        assert.equal(typeEnter('matkhau')[0].type, 'dd_wrong'); wrongs.add(j.kind);
        assert.deepEqual(S().job.rules, [false, false, false, false]);
        return typeEnter('Deadline@2026');
      case 'captcha':
        tap('cell', 0); assert.equal(tap('verify')[0].type, 'dd_wrong', 'chọn thiếu ô → sai'); wrongs.add(j.kind);
        j.cells.forEach((c, i) => { if (c.e === j.target) tap('cell', i); });
        return tap('verify');
      case 'approve': {
        const i = j.items.findIndex((x) => x.amount > j.limit);
        assert.equal(tap('approve', i, 'ok')[0].type, 'dd_wrong'); wrongs.add(j.kind);
        return j.items.flatMap((x, k) => tap('approve', k, x.amount > j.limit ? 'no' : 'ok'));
      }
      case 'otp': {
        assert.match(j.code, /^\d{6}$/);
        clock.advance(4000); host.tick();
        assert.equal(S().job.code, null, 'hết giờ xem thì ẩn mã');
        assert.equal(typeEnter('000000x')[0]?.type === 'dd_wrong' || S().job.typed === '', true); wrongs.add(j.kind);
        return typeEnter(S().job.code);
      }
      case 'typo': {
        const bad = badWords(j.words);
        assert.equal(tap('word', bad.indexOf(false))[0].type, 'dd_wrong'); wrongs.add(j.kind);
        return bad.flatMap((b, i) => (b ? tap('word', i) : []));
      }
      case 'reply': {
        const good = j.opts.indexOf(goodReply.get(j.msg));
        assert.equal(tap('reply', (good + 1) % 3)[0].type, 'dd_wrong'); wrongs.add(j.kind);
        return tap('reply', good);
      }
      case 'calendar': {
        const busy = j.slots.findIndex((x) => x.busy);
        assert.equal(tap('slot', busy)[0].type, 'dd_wrong'); wrongs.add(j.kind);
        return tap('slot', j.slots.findIndex((x, i) => !x.busy && j.slots[i + 1] && !j.slots[i + 1].busy));
      }
      case 'desktop': {
        const order = j.icons.map((x) => x.name).sort((a, b) => a.localeCompare(b, 'vi'));
        assert.equal(tap('icon', j.icons.findIndex((x) => x.name === order[1]))[0].type, 'dd_wrong'); wrongs.add(j.kind);
        return order.flatMap((n) => tap('icon', j.icons.findIndex((x) => x.name === n)));
      }
      default: throw new Error(j.kind);
    }
  };
  clock.advance(2000); host.tick();
  const seen = [];
  for (let r = 0; r < 24; r++) {
    const j = S().job;
    if (seen.length) assert.notEqual(j.kind, seen[seen.length - 1], 'không lặp lại việc vừa làm');
    seen.push(j.kind);
    const before = S().step;
    solve(j);
    assert.equal(S().step, before + 1, `${j.kind} xong → +1 bước`);
  }
  assert.deepEqual([...new Set(seen.slice(0, 12))].sort(), ['mail', 'inbox', 'sheet', 'files', 'password', 'captcha', 'approve', 'otp', 'typo', 'reply', 'calendar', 'desktop'].sort(), '12 việc đầu đủ 12 loại');
  assert.equal(wrongs.size, 8);
  // tắt bớt việc trong cài đặt
  const h2 = createHost(game, { settings: { story: false, jobs: ['otp', 'captcha'], briefSeconds: 2 }, data: game.data, now: clock.now, random: seededRandom(2), log: {} });
  clock.advance(2000); h2.tick();
  assert.ok(['otp', 'captcha'].includes(h2.snapshot().job.kind));
  assert.deepEqual(h2.snapshot().jobs, ['otp', 'captcha']);
});

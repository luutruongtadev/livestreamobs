import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';
import { solvePassword } from '../engine/password.js';

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
    const host = createHost(game, { settings: { mode, voteSeconds: 0, rival: false, steps: 3, shiftSeconds: 100, briefSeconds: 2, storyBriefSeconds: 8, resultSeconds: 5, startRank: 0 }, data: game.data, now: clock.now, random: seededRandom(4), log: {} });
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
  const host = createHost(game, { settings: { voteSeconds: 0, rival: false, steps: 5, shiftSeconds: 100, briefSeconds: 2, storyBriefSeconds: 4, startRank: 1 }, data: game.data, now: clock.now, random: seededRandom(8), log: {} });
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
  const host = createHost(game, { settings: { story: false, jobs: ['mail', 'inbox', 'sheet', 'files', 'password', 'captcha', 'approve', 'otp', 'typo', 'reply', 'calendar', 'desktop'], steps: 30, shiftSeconds: 900, briefSeconds: 2 }, data: game.data, now: clock.now, random: seededRandom(11), log: {} });
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
      case 'password': {
        assert.equal(typeEnter('')[0].type, 'dd_wrong'); wrongs.add(j.kind);
        const rules = host.serialize().job.rules;
        assert.equal(rules.length, 5); assert.equal(S().job.rules.length, 1, 'ban đầu chỉ hiện 1 luật');
        const pw = solvePassword(rules);
        for (let k = 2; k <= 5; k++) { const fx = typeEnter(pw); assert.equal(fx[0].type, 'dd_pw_rule'); assert.equal(S().job.rules.length, k, 'mỗi lần gõ đúng hiện thêm 1 luật'); }
        return typeEnter(pw);
      }
      case 'captcha':
        tap('cell', 0); assert.equal(tap('verify')[0].type, 'dd_wrong', 'chọn thiếu ô → sai'); wrongs.add(j.kind);
        j.cells.forEach((c, i) => { if (c.e === j.target) tap('cell', i); });
        return tap('verify');
      case 'approve': {
        const okOf = (x) => x.amount <= j.limit * 1e6 && x.amount === x.invoice;
        assert.ok(j.items.some((x) => x.amount !== x.invoice), 'có tờ trình lệch hoá đơn');
        const i = j.items.findIndex((x) => x.amount !== x.invoice);
        assert.equal(tap('approve', i, 'ok')[0].type, 'dd_wrong', 'lệch hoá đơn mà Duyệt → sai'); wrongs.add(j.kind);
        return j.items.flatMap((x, k) => tap('approve', k, okOf(x) ? 'ok' : 'no'));
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

test('việc có người xem: xin chữ ký (bình luận "duyệt", mỗi người 1 lần), chép lời đồng nghiệp, hỏi đáp nhanh (người xem trả lời đúng làm hộ), nút Bỏ qua', () => {
  const clock = fakeClock();
  const mk = (jobs) => createHost(game, { settings: { story: false, jobs, shuffleJobs: false, signNeed: 3, steps: 10, shiftSeconds: 600, briefSeconds: 2 }, data: game.data, now: clock.now, random: seededRandom(6), log: {} });
  const cm = (h, id, text) => h.handle({ type: 'comment', user: u(id), text });
  // xin chữ ký
  let h = mk(['sign', 'quiz', 'colleague']);
  clock.advance(2000); h.tick();
  assert.equal(h.snapshot().job.kind, 'sign');
  assert.equal(cm(h, 'a', 'Duyệt nha')[0].type, 'dd_sign');
  assert.deepEqual(cm(h, 'a', 'duyet'), [], 'một người chỉ ký 1 lần');
  cm(h, 'b', 'ok duyệt');
  assert.ok(cm(h, 'c', 'DUYET').some((e) => e.type === 'dd_step'));
  assert.equal(h.snapshot().step, 1);
  // hỏi đáp: người xem trả lời đúng đầu tiên làm hộ
  const q = h.snapshot().job;
  assert.equal(q.kind, 'quiz');
  assert.deepEqual(cm(h, 'd', String(q.a + q.b + 1)), []);
  assert.ok(cm(h, 'e', `là ${q.a + q.b} nha`).some((e) => e.type === 'dd_step' && e.by.name === 'Người e'));
  assert.equal(h.serialize().helpers.e.points, 1, 'người trả lời đúng vào bảng đồng nghiệp');
  // chép lời đồng nghiệp: lấy bình luận người xem (đã lọc), gõ lại → người đó được cộng điểm
  const c = h.snapshot().job;
  assert.equal(c.kind, 'colleague');
  assert.ok(['Duyệt nha', 'ok duyệt', 'là ' + (q.a + q.b) + ' nha'].includes(c.text) || D.mail.includes(c.text));
  h.input({ type: 'text', value: c.text }); h.input({ type: 'enter' });
  assert.equal(h.snapshot().step, 3);
  // bỏ qua việc chờ người xem
  assert.equal(h.snapshot().job.kind, 'sign');
  h.input({ type: 'click', target: 'skip' });
  assert.equal(h.snapshot().job.kind, 'quiz'); assert.equal(h.snapshot().step, 3);
  // bình luận rác / từ cấm không thành câu chép
  h = mk(['colleague']);
  clock.advance(2000); h.tick();
  cm(h, 'x', 'đm'); cm(h, 'y', '😂😂😂😂😂😂😂😂'); cm(h, 'z', 'Chị Lan ơi gửi em bảng lương');
  h.input({ type: 'text', value: h.snapshot().job.text }); h.input({ type: 'enter' });
  assert.equal(h.snapshot().job.text, 'Chị Lan ơi gửi em bảng lương');
  assert.equal(h.snapshot().job.from.name, 'Người z');
});

test('quà mới: mèo chèn ký tự rác, rớt wifi chặn gửi, sếp mời ăn trưa đứng đồng hồ, tai nghe miễn ping / soi, caps lock + cúp điện là trạng thái', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { story: false, jobs: ['mail'], steps: 10, shiftSeconds: 300, briefSeconds: 2 }, data: game.data, now: clock.now, random: seededRandom(9), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { for (let t = 0; t < ms; t += 250) { clock.advance(250); host.tick(); } };
  step(2000);
  host.input({ type: 'text', value: 'abc' });
  host.handle(gift('a', 'Ice Cream Cone', 1));
  assert.ok(S().job.typed.startsWith('abc') && S().job.typed.length >= 8);
  host.handle(gift('b', 'Paper Crane', 99));
  host.input({ type: 'text', value: S().job.text });
  assert.equal(host.input({ type: 'enter' })[0].type, 'dd_wifi');
  step(8000);
  assert.ok(host.input({ type: 'enter' }).some((e) => e.type === 'dd_step'));
  const left = S().remainingMs;
  host.handle(gift('c', 'Confetti', 100));
  step(10_000);
  assert.ok(Math.abs(S().remainingMs - left) <= 300, 'ăn trưa: đồng hồ đứng');
  step(6000);
  assert.ok(S().remainingMs < left - 500);
  host.handle(gift('d', 'Rose', 1));
  host.handle(gift('e', 'Mishka Bear', 100));
  assert.equal(S().pings.length, 0, 'đeo tai nghe: xoá ping');
  host.handle(gift('d', 'Rose', 1)); host.handle(gift('d', 'Finger Heart', 5));
  assert.equal(S().pings.length, 0); assert.equal(S().status.some((x) => x.kind === 'soi'), false);
  host.handle(gift('f', 'GG', 1)); host.handle(gift('g', 'Rosa', 10));
  assert.ok(['capslock', 'cupdien'].every((k) => S().status.some((x) => x.kind === k)));
});

test('cốt truyện: người xem bình chọn 1 / 2 (mỗi người 1 phiếu), quà lúc bình chọn được giữ lại; Trâm đua cùng; lời kết theo lựa chọn; OTP theo cài đặt', () => {
  const CH = D.story.chapters;
  const clock = fakeClock();
  const host = createHost(game, { settings: { steps: 4, shiftSeconds: 100, briefSeconds: 2, storyBriefSeconds: 6, voteSeconds: 10, startRank: 0, jobs: ['otp'], otpSeconds: 6 }, data: game.data, now: clock.now, random: seededRandom(4), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { const fx = []; for (let t = 0; t < ms; t += 250) { clock.advance(Math.min(250, ms - t)); fx.push(...host.tick()); } return fx; };
  const cm = (id, text) => host.handle({ type: 'comment', user: u(id), text });
  assert.equal(S().vote.q, CH[0].choice.q);
  cm('a', '2'); cm('b', '2 nha'); cm('c', '1'); cm('a', '1'); cm('d', '12');
  assert.deepEqual(S().vote.counts, [1, 2], 'mỗi người 1 phiếu, "12" không tính');
  host.handle(gift('z', 'Ice Cream Cone', 1));
  assert.equal(S().phase, 'brief', 'quà lúc bình chọn không cắt ngang');
  step(6000);
  assert.equal(S().phase, 'brief');
  const fx = step(4000);
  assert.equal(S().phase, 'work');
  const ch = fx.find((e) => e.type === 'dd_choice');
  assert.equal(ch.label, CH[0].choice.options[1].label);
  assert.equal(S().steps, 4 + CH[0].choice.options[1].steps, 'lựa chọn đổi số bước');
  assert.ok(fx.some((e) => e.type === 'dd_gift' && e.late), 'quà giữ lại được áp dụng khi vào ca');
  // OTP hiện đúng số giây cài đặt
  assert.equal(S().job.kind, 'otp'); assert.ok(S().job.code);
  step(5500); assert.ok(S().job.code); step(750); assert.equal(S().job.code, null);
  // Trâm về đích trước → deadline −20 giây
  const pace = (CH[0].rivalPace + CH[0].choice.options[1].rival);
  const before = S().remainingMs;
  const rf = step(Math.ceil(100_000 * pace) - 6000 + 500);
  assert.ok(rf.some((e) => e.type === 'dd_rival_done'));
  assert.ok(S().rival.done);
  assert.ok(S().remainingMs <= 15_000, "deadline bị trừ (còn tối thiểu 10 giây)"); void before;
  host.handle(gift('z', 'Lion', 29999));
  assert.equal(S().result.rival.beat, false);
  assert.equal(S().result.next.title, CH[1].title);
  assert.equal(S().result.choice.tag, 'tham');
  // chương 2: thắng trước Trâm → beat
  step(10_000);
  assert.ok(S().vote);
  for (let i = 0; i < 3; i++) cm(`v${i}`, '1');
  step(15_000);
  host.handle(gift('z', 'Lion', 29999));
  assert.equal(S().result.rival.beat, true); assert.ok(S().result.rival.line);
  // các chương sau không ai bình chọn → ngẫu nhiên; tới chủ tịch → đoạn kết theo đa số lựa chọn
  for (let i = 2; i < CH.length; i++) { step(10_000); step(15_000); host.handle(gift('z', 'Lion', 29999)); }
  assert.ok(['tot', 'tham'].includes(S().result.endingTag));
  assert.deepEqual(S().result.ending.slice(0, 1), D.story.endings[S().result.endingTag].slice(0, 1));
});

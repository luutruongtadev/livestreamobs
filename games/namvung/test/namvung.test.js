import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';

const game = await loadGame(new URL('..', import.meta.url));
const D = game.data.camp;
const u = (id) => ({ id, name: `Người ${id}` });
const gift = (id, giftName, diamonds) => ({ type: 'gift', user: u(id), giftName, diamonds, count: 1 });
const scriptOf = new Map(D.calls.map((c) => [c.victim, c.script]));
const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const decode = (enc, k) => enc.replace(/[A-Z]/g, (c) => LET[(LET.indexOf(c) - k + 26) % 26]);

function setup(settings = {}, seed = 5) {
  const clock = fakeClock();
  const host = createHost(game, { settings: { daySeconds: 600, nightSeconds: 120, briefSeconds: 2, storyBriefSeconds: 3, voteSeconds: 0, resultSeconds: 3, endSeconds: 5, kpi: 3, evidence: 3, missKpi: 0, ...settings }, data: game.data, now: clock.now, random: seededRandom(seed), log: {} });
  const S = () => host.snapshot();
  const step = (ms, by = 250) => { const fx = []; for (let t = 0; t < ms; t += by) { clock.advance(Math.min(by, ms - t)); fx.push(...host.tick()); } return fx; };
  const doJob = () => {
    const j = S().job;
    if (j.kind === 'chat') { host.input({ type: 'text', value: j.text.toLowerCase() }); return host.input({ type: 'enter' }); }
    if (j.kind === 'money') { host.input({ type: 'text', value: String(j.nums.reduce((a, x) => a + x, 0)) }); return host.input({ type: 'enter' }); }
    return host.input({ type: 'click', target: 'opt', id: j.opts.indexOf(scriptOf.get(j.victim)) });
  };
  const doSecret = () => {
    const j = S().secret;
    if (j.kind === 'photo') return Array.from({ length: j.need }, () => host.input({ type: 'click', target: 'shutter' })).flat();
    if (j.kind === 'map') return j.order.flatMap((i) => host.input({ type: 'click', target: 'room', id: i }));
    host.input({ type: 'text', value: j.text }); return host.input({ type: 'enter' });
  };
  return { host, S, step, doJob, doSecret, clock };
}

test('ban ngày: KPI, cảnh báo ngầm, tab bí mật tăng nghi ngờ, tuần tra bắt gặp, che, tim → sóng → gửi đủ bằng chứng (chưa thắng, phải chờ đêm giải cứu)', () => {
  const { host, S, step, doJob, doSecret } = setup();
  assert.equal(S().phase, 'brief'); assert.equal(S().days, 5); assert.equal(S().chapter.title, D.days[0].title);
  assert.equal(S().suspects.length, 3);
  step(3000);
  assert.equal(S().phase, 'work');
  const kinds = [];
  for (let i = 0; i < 3; i++) { kinds.push(S().job.kind); assert.ok(doJob().some((e) => e.type === 'nv_kpi')); }
  assert.deepEqual(kinds, ['chat', 'call', 'money']);
  doJob();
  const call = S().job;
  host.input({ type: 'click', target: 'opt', id: call.opts.findIndex((o) => o !== scriptOf.get(call.victim)) });
  assert.equal(S().suspicion, 3);
  doJob(); doJob();
  assert.equal(S().job.kind, 'chat');
  host.input({ type: 'click', target: 'warn' });
  assert.equal(S().saved, 1); assert.equal(S().suspicion, 9);
  host.input({ type: 'tab', id: 'secret' });
  step(5000);
  assert.ok(Math.abs(S().suspicion - 11) < 0.01, `ngồi tab bí mật 5 giây: ${S().suspicion}`);
  host.handle(gift('a', 'Rose', 1));
  assert.ok(step(1000).some((e) => e.type === 'nv_caught'));
  host.input({ type: 'tab', id: 'camp' });
  const before = S().suspicion;
  host.handle({ type: 'comment', user: u('c1'), text: 'Che cho anh ấy' });
  host.handle({ type: 'comment', user: u('c1'), text: 'che' });
  assert.ok(S().suspicion < before);
  host.handle(gift('b', 'Heart Me', 1));
  assert.equal(S().status.some((s) => s.kind === 'tuantra'), false);
  host.input({ type: 'tab', id: 'secret' });
  assert.ok(doSecret().some((e) => e.type === 'nv_evidence'));
  assert.equal(host.input({ type: 'click', target: 'radio' })[0].type, 'nv_wrong');
  host.handle({ type: 'like', user: u('l'), count: 499 });
  assert.equal(host.handle({ type: 'like', user: u('l'), count: 1 })[0].type, 'nv_signal_full');
  const sent = host.input({ type: 'click', target: 'radio' });
  assert.equal(sent[0].type, 'nv_sent'); assert.equal(sent[0].pages[0].note, S().items[0].note);
  doSecret();
  host.handle(gift('d', 'Corgi', 299));
  assert.equal(S().held, 0, 'lục soát: mất bằng chứng chưa gửi');
  host.handle(gift('e', 'Cap', 99)); doSecret();
  host.handle(gift('f', 'Sunglasses', 199));
  host.input({ type: 'click', target: 'radio' });
  assert.equal(S().sent, 3);
  assert.equal(S().phase, 'work', 'gửi đủ chưa thắng ngay: phải thoát ra trong đêm giải cứu');
  assert.ok(S().story.some((m) => m.by.name === D.cast.police.name));
});

test('cốt truyện: tin mật giải mã → an toàn, lời nhắn Bé Hai, manh mối, bình chọn 1/2 có tác dụng, quà lúc bình chọn được giữ, đoán kẻ phản bội A/B/C', () => {
  const { host, S, step } = setup({ voteSeconds: 10, daySeconds: 100 }, 9);
  const cm = (id, text) => host.handle({ type: 'comment', user: u(id), text });
  // ngày 1: bình chọn "Đưa tiền cho Tèo" (1) → KPI +2, tuần tra ngắn hơn
  assert.equal(S().vote.kind, 'choice');
  cm('a', '1'); cm('b', '1 nha'); cm('c', '2'); cm('a', '2');
  assert.deepEqual(S().vote.counts, [2, 1]);
  host.handle(gift('z', 'Perfume', 20));
  assert.equal(S().phase, 'brief', 'quà lúc bình chọn không cắt ngang');
  const fx = step(10_000);
  assert.equal(S().phase, 'work');
  assert.equal(fx.find((e) => e.type === 'nv_choice').label, D.days[0].choice.options[0].label);
  assert.equal(S().kpiTarget, 3 + 2);
  assert.ok(fx.some((e) => e.type === 'nv_gift' && e.late) && S().status.some((x) => x.kind === 'thudt'), 'quà giữ lại áp dụng khi vào ca');
  host.handle(gift('g', 'Rose', 1));
  assert.ok(S().status.find((x) => x.kind === 'tuantra').totalMs <= 7500, 'đã đưa tiền: tuần tra ngắn');
  // tin mật (mốc 30%): giải mã → khoảng an toàn ở tab Bí mật
  step(31_000);
  host.input({ type: 'tab', id: 'secret' });
  const c = S().secret;
  assert.equal(c.kind, 'cipher');
  host.input({ type: 'text', value: 'sai roi' }); assert.equal(host.input({ type: 'enter' })[0].type, 'nv_wrong');
  host.input({ type: 'text', value: decode(c.enc, c.shift).toLowerCase() });
  assert.equal(host.input({ type: 'enter' })[0].type, 'nv_cipher_ok');
  const sus0 = S().suspicion;
  step(10_000);
  assert.equal(S().suspicion, sus0, 'trong khoảng an toàn không tăng nghi ngờ');
  step(5000);
  assert.ok(S().suspects.some((x) => x.clues.length), 'đã có manh mối');
  // sang ngày 2: đưa Bé Hai theo → có lời nhắn gửi mẹ
  host.input({ type: 'tab', id: 'camp' });
  host.command('next-day'); step(3000);
  assert.equal(S().phase, 'brief'); assert.equal(S().day, 2);
  cm('x', '1');
  step(10_000);
  assert.equal(S().flags.friend, true);
  step(46_000);
  host.input({ type: 'tab', id: 'secret' });
  assert.equal(S().secret.kind, 'relay');
  host.input({ type: 'text', value: S().secret.text });
  host.input({ type: 'enter' });
  assert.equal(S().flags.trust, true);
  // ngày 3, 4 → cuối ngày 4 đoán kẻ phản bội
  host.input({ type: 'tab', id: 'camp' });
  for (let d = 3; d <= 4; d++) { host.command('next-day'); step(3000); step(10_000); }
  assert.equal(S().day, 4);
  host.command('next-day');
  assert.equal(S().phase, 'dayend'); assert.equal(S().vote.kind, 'traitor');
  assert.equal(S().suspects.flatMap((x) => x.clues).length, 6, '3 ngày × 2 manh mối');
  const traitor = S().suspects.find((x) => game.data.camp.clues.traitor.some((tpl) => x.clues.includes(tpl.replace('{name}', x.name))));
  cm('v1', traitor.letter.toLowerCase()); cm('v2', traitor.letter);
  const tf = step(20_000);
  const g = tf.find((e) => e.type === 'nv_traitor');
  assert.equal(g.correct, true); assert.equal(g.name, traitor.name);
  assert.equal(S().day, 5); assert.equal(S().chapter.kind, 'escape');
});

test('đêm giải cứu: camera bắt gặp, đi sai đường, trốn tuần tra, tim đánh lạc hướng, thoát → kết theo lựa chọn; hết giờ → bị bán; tên nghi phạm đổi mỗi chiến dịch', () => {
  const { host, S, step } = setup({ voteSeconds: 0 }, 3);
  const names1 = S().suspects.map((x) => x.name);
  step(3000);
  host.handle(gift('n', 'Cap', 99)); host.handle(gift('n', 'Cap', 99)); host.handle(gift('n', 'Cap', 99));
  host.handle(gift('s', 'Sunglasses', 199));
  host.input({ type: 'tab', id: 'secret' }); host.input({ type: 'click', target: 'radio' });
  assert.equal(S().sent, 3);
  host.input({ type: 'tab', id: 'camp' });
  for (let d = 1; d <= 4; d++) { host.command('next-day'); step(3500); step(3500); }
  assert.equal(S().chapter.kind, 'escape'); assert.equal(S().phase, 'work');
  const E = () => S().escape;
  assert.ok(E().segs.every((x) => x.revealed) || E().segs[0].revealed, 'đã gửi đủ bằng chứng → sơ đồ hiện đường');
  // chờ camera bật rồi đi → bị bắt gặp
  while (!E().segs[E().seg].cam) step(100, 100);
  assert.equal(host.input({ type: 'move', dir: E().segs[E().seg].dir })[0].type, 'nv_spotted');
  // tuần tra: không trốn thì nghi ngờ tăng, trốn thì không
  host.handle(gift('g', 'Rose', 1));
  const s0 = S().suspicion; step(1000); assert.ok(S().suspicion > s0);
  host.input({ type: 'hide' }); const s1 = S().suspicion; step(2000); assert.equal(S().suspicion, s1);
  host.handle(gift('h', 'Heart Me', 1)); host.input({ type: 'hide' });
  // tim: camera tắt → đi hết đường
  let guard = 0;
  while (S().phase === 'work' && guard++ < 400) {
    host.handle({ type: 'like', user: u('l'), count: 300 });
    const e = E();
    if (e.moveInMs > 0) { step(e.moveInMs + 10, e.moveInMs + 10); continue; }
    const seg = e.segs[e.seg];
    host.input({ type: 'move', dir: seg.dir || 'trai' });
  }
  assert.equal(S().phase, 'end');
  assert.equal(S().result.win, true);
  assert.equal(S().result.ending, 'alone', 'không bình chọn → không đưa Bé Hai theo → thoát một mình');
  assert.ok(S().result.dossier.every((p) => p.sent));
  step(5000);
  const names2 = S().suspects.map((x) => x.name);
  assert.equal(names2.filter((n) => names1.includes(n)).length, 0, 'chiến dịch mới: tên nghi phạm khác hẳn');
  // chiến dịch 2: tới đêm cuối rồi để hết giờ → bị bán sang trại khác
  step(3500);
  for (let d = 1; d <= 4; d++) { host.command('next-day'); step(3500); step(3500); }
  host.input({ type: 'hide' }); step(120_500);
  assert.equal(S().result.ending, 'ban');
  assert.ok(S().result.lines.length >= 2);
});

test('bị lộ: nghi ngờ 100% giữa ngày; công an ập vào thắng ngay; serialize / restore giữ nguyên ván', () => {
  const { host, S, step } = setup({ voteSeconds: 0 });
  step(3000);
  host.handle(gift('a', 'Finger Heart', 5));
  host.handle({ type: 'comment', user: u('a'), text: 'KPI đâu đm' });
  assert.equal(S().pings[0].text, 'KPI đâu ***');
  const saved = JSON.parse(JSON.stringify(host.serialize()));
  const { host: h2 } = setup({ voteSeconds: 0 }, 99);
  h2.restore(saved);
  assert.deepEqual(h2.snapshot().suspects, S().suspects);
  for (let i = 0; i < 7; i++) host.handle(gift('d', 'Hat and Mustache', 99));
  assert.equal(S().phase, 'end'); assert.equal(S().result.ending, 'lo');
  step(5000); step(3500);
  host.handle(gift('z', 'Lion', 29999));
  assert.equal(S().result.win, true); assert.equal(S().result.how, 'giaicuu');
});

test('tắt cốt truyện (chơi đơn giản): không chương / bình chọn / tin nhắn nhân vật; gửi đủ bằng chứng là thắng ngay; hết số ngày chưa đủ thì thua', () => {
  const { host, S, step, doSecret } = setup({ story: false, simpleDays: 2, voteSeconds: 15, storyBriefSeconds: 20 });
  assert.equal(S().simple, true); assert.equal(S().days, 2); assert.equal(S().chapter.title, 'Ngày 1');
  step(2500);
  assert.equal(S().phase, 'work', 'chỉ đọc briefSeconds, không chờ lời dẫn / bình chọn');
  assert.equal(S().vote, null);
  host.input({ type: 'tab', id: 'secret' });
  for (let i = 0; i < 3; i++) { doSecret(); host.handle({ type: 'like', user: u('l'), count: 500 }); host.input({ type: 'click', target: 'radio' }); }
  assert.equal(S().phase, 'end'); assert.equal(S().result.win, true); assert.equal(S().result.ending, 'simple');
  assert.equal(S().result.traitor, null);
  assert.deepEqual(S().story, [], 'không có tin nhắn nhân vật');
  // ván sau: hết 2 ngày mà chưa gửi đủ → thua "hết thời gian"
  step(5000); step(2500);
  step(600_000); step(3500); step(2500); step(600_000);
  assert.equal(S().phase, 'end'); assert.equal(S().result.ending, 'het');
});

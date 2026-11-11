import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';

const game = await loadGame(new URL('..', import.meta.url));
const D = game.data.camp;
const u = (id) => ({ id, name: `Người ${id}` });
const gift = (id, giftName, diamonds) => ({ type: 'gift', user: u(id), giftName, diamonds, count: 1 });
const scriptOf = new Map(D.calls.map((c) => [c.victim, c.script]));

function setup(settings = {}, seed = 5) {
  const clock = fakeClock();
  const host = createHost(game, { settings: { daySeconds: 120, briefSeconds: 2, resultSeconds: 3, endSeconds: 5, kpi: 3, evidence: 3, days: 3, ...settings }, data: game.data, now: clock.now, random: seededRandom(seed), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { clock.advance(ms); return host.tick(); };
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

test('ngày làm việc: KPI 3 loại việc, cảnh báo ngầm, tab bí mật tăng nghi ngờ, tuần tra bắt gặp, che, tim → sóng → gửi bằng chứng → thắng', () => {
  const { host, S, step, doJob, doSecret } = setup();
  assert.equal(S().phase, 'brief');
  assert.equal(S().items.length, 3);
  assert.equal(S().items[2].kind, 'gps', 'toạ độ luôn là bằng chứng cuối');
  step(2000);
  assert.equal(S().phase, 'work');
  // 3 loại việc trại xoay vòng, mỗi việc +1 KPI
  const kinds = [];
  for (let i = 0; i < 3; i++) { kinds.push(S().job.kind); assert.ok(doJob().some((e) => e.type === 'nv_kpi')); }
  assert.deepEqual(kinds, ['chat', 'call', 'money']);
  assert.equal(S().kpi, 3);
  // gọi điện chọn sai: nghi ngờ +3
  const call = S().job.kind === 'chat' ? (doJob(), S().job) : S().job;
  assert.equal(call.kind, 'call');
  const wrong = call.opts.findIndex((o) => o !== scriptOf.get(call.victim));
  host.input({ type: 'click', target: 'opt', id: wrong });
  assert.equal(S().suspicion, 3);
  doJob(); doJob();
  // cảnh báo ngầm: cứu người, không có KPI, nghi ngờ +6
  assert.equal(S().job.kind, 'chat');
  const k0 = S().kpi;
  host.input({ type: 'click', target: 'warn' });
  assert.equal(S().saved, 1); assert.equal(S().kpi, k0); assert.equal(S().suspicion, 9);

  // tab bí mật: nghi ngờ tăng dần; bảo an tuần tra thì tăng rất nhanh + hiệu ứng bắt gặp
  host.input({ type: 'tab', id: 'secret' });
  for (let i = 0; i < 20; i++) step(250);
  assert.ok(Math.abs(S().suspicion - 11) < 0.01, `ngồi tab bí mật 5 giây: ${S().suspicion}`);
  host.handle(gift('a', 'Rose', 1));
  const fx = step(1000);
  assert.ok(fx.some((e) => e.type === 'nv_caught'));
  assert.ok(S().suspicion >= 18);
  host.input({ type: 'tab', id: 'camp' });
  // người xem bình luận "che": giảm nghi ngờ, mỗi người có thời gian chờ
  const before = S().suspicion;
  host.handle({ type: 'comment', user: u('c1'), text: 'Che cho anh ấy' });
  host.handle({ type: 'comment', user: u('c1'), text: 'che' });
  host.handle({ type: 'comment', user: u('c2'), text: 'chè' }); // so không dấu: gõ "chè" cũng tính
  assert.ok(S().suspicion < before);
  assert.equal(S().top.helpers.find((h) => h.id === 'c1').points, 1, 'cùng người che 2 lần trong 10 giây chỉ tính 1');
  // bảo an làm ngơ: hết tuần tra, −10%
  host.handle(gift('b', 'Heart Me', 1));
  assert.equal(S().status.some((s) => s.kind === 'tuantra'), false);

  // thu bằng chứng 1, chưa có sóng thì không gửi được; tim → sóng đầy → gửi
  host.input({ type: 'tab', id: 'secret' });
  assert.ok(doSecret().some((e) => e.type === 'nv_evidence'));
  assert.equal(S().held, 1);
  assert.equal(host.input({ type: 'click', target: 'radio' })[0].type, 'nv_wrong');
  assert.ok(host.handle({ type: 'like', user: u('l'), count: 499 }).length === 0);
  assert.equal(host.handle({ type: 'like', user: u('l'), count: 1 })[0].type, 'nv_signal_full');
  assert.equal(S().canSend, true);
  assert.equal(host.input({ type: 'click', target: 'radio' })[0].type, 'nv_sent');
  assert.deepEqual([S().sent, S().held, S().signal], [1, 0, 0]);
  // lục soát: mất bằng chứng chưa gửi
  doSecret();
  assert.equal(S().held, 1);
  host.handle(gift('d', 'Corgi', 299));
  assert.equal(S().held, 0);
  // nội gián +1, sim lậu đầy sóng, thu thập nốt → gửi đủ → GIẢI CỨU
  host.handle(gift('e', 'Cap', 99));
  doSecret();
  assert.equal(S().held, 2);
  assert.equal(S().secret, null);
  host.handle(gift('f', 'Sunglasses', 199));
  const sent = host.input({ type: 'click', target: 'radio' });
  assert.ok(sent.some((e) => e.type === 'nv_win'));
  assert.equal(S().phase, 'end');
  assert.equal(S().result.win, true);
  assert.equal(S().result.saved, 1);
  assert.ok(D.tips.includes(S().result.tip));
  assert.equal(S().top.bosses[0].name, 'Người d', 'bảo an gắt nhất theo số xu');
  step(5000);
  assert.equal(S().phase, 'brief'); assert.equal(S().campaign, 2);
});

test('chủ quản nhắn bằng bình luận người tặng (lọc từ cấm), che màn hình; thu điện thoại khoá tab bí mật; thiếu KPI → nghi ngờ; 100% → bị lộ', () => {
  const { host, S, step } = setup({ missKpi: 60 });
  step(2000);
  host.input({ type: 'tab', id: 'secret' });
  host.handle(gift('a', 'Finger Heart', 5));
  assert.equal(S().tab, 'camp', 'chủ quản nhắn thì bị gọi giật về việc trại');
  assert.equal(S().covered, true);
  host.handle({ type: 'comment', user: u('a'), text: 'KPI đâu đm' });
  assert.equal(S().pings[0].text, 'KPI đâu ***');
  assert.deepEqual(host.input({ type: 'click', target: 'warn' }), [], 'đang bị che thì không bấm việc được');
  host.input({ type: 'click', target: 'ping', id: S().pings[0].id });
  assert.equal(S().covered, false);
  // thu điện thoại: sóng về 0, tim không cộng, tab bí mật khoá 20 giây
  host.handle({ type: 'like', count: 100 });
  host.handle(gift('b', 'Perfume', 20));
  assert.equal(S().signal, 0);
  host.handle({ type: 'like', count: 100 });
  assert.equal(S().signal, 0);
  assert.equal(host.input({ type: 'tab', id: 'secret' })[0]?.type, 'nv_wrong');
  step(20_000);
  assert.equal(host.input({ type: 'tab', id: 'secret' })[0]?.type, 'nv_tab');
  host.input({ type: 'tab', id: 'camp' });
  // tăng KPI, hết ngày thiếu KPI → nghi ngờ +60, hình phạt
  host.handle(gift('c', 'Doughnut', 30));
  assert.equal(S().kpiTarget, 5);
  step(120_000);
  assert.equal(S().phase, 'dayend');
  assert.equal(S().dayResult.ok, false);
  assert.ok(D.punishments.includes(S().dayResult.punishment));
  step(3000); step(2000);
  assert.equal(S().day, 2); assert.equal(S().kpiTarget, 4, 'ngày 2: KPI +1');
  host.handle(gift('d', 'Hat and Mustache', 99)); // chỉ điểm +15
  host.handle(gift('d', 'Hat and Mustache', 99));
  assert.ok(S().suspicion >= 90);
  host.handle(gift('d', 'Hat and Mustache', 99));
  assert.equal(S().phase, 'end');
  assert.equal(S().result.win, false); assert.equal(S().result.how, 'lo');
});

test('hết số ngày chưa gửi đủ → mất dấu; nhốt phòng tối khoá mọi thao tác; công an ập vào thắng ngay; serialize / restore giữ nguyên ván', () => {
  const { host, S, step } = setup({ days: 1, kpi: 1 });
  step(2000);
  host.handle(gift('a', 'Money Gun', 500));
  assert.equal(S().covered, true);
  assert.deepEqual(host.input({ type: 'tab', id: 'secret' }), []);
  host.handle(gift('b', 'Ice Cream Cone', 1)); // làm hộ +1 KPI (quà vẫn có tác dụng)
  assert.equal(S().kpi, 1);
  const saved = host.serialize();
  const { host: h2 } = setup({ days: 1, kpi: 1 }, 99);
  h2.restore(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(h2.snapshot().items, S().items);
  assert.equal(h2.snapshot().kpi, 1);
  step(120_000);
  assert.equal(S().phase, 'end');
  assert.equal(S().result.how, 'hetngay');
  step(5000); step(2000);
  host.handle(gift('z', 'Lion', 29999));
  assert.equal(S().result.win, true); assert.equal(S().result.how, 'giaicuu');
  assert.equal(S().wins, 1);
});

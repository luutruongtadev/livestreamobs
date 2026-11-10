import test from 'node:test';
import assert from 'node:assert/strict';
import { createTriggers, createHost, resolveSettings, validateManifest, satisfies, sameWord, digitsOf, fakeClock, triggerText, triggerIcon } from '#sdk';
import { importsOf } from '#sdk/testing';

const b = (id, action, trigger) => ({ id, action, trigger, label: id });

test('trigger quà: theo tên trước, rồi ngưỡng xu cao nhất; combo chỉ kích hoạt khi vừa vượt ngưỡng; every gom đủ mới kích hoạt', () => {
  const t = createTriggers([
    b('rose', 'letter', { type: 'gift', gifts: ['Rose', 'TikTok'], every: 5 }),
    b('heart', 'letter', { type: 'gift', giftName: 'Finger Heart' }),
    b('hint', 'hint', { type: 'gift', minDiamonds: 10 }),
    b('time', 'time', { type: 'gift', minDiamonds: 30 }),
  ]);
  const gift = (giftName, diamonds, count = 1, streakTotal) => t.feed({ type: 'gift', giftName, diamonds, count, streakTotal });
  assert.deepEqual(gift('Finger Heart', 5, 3).fires.map((f) => [f.binding.id, f.times]), [['heart', 3]], 'theo tên: mỗi món 1 lần');
  assert.deepEqual(gift('Doughnut', 30).fires.map((f) => f.binding.id), ['time'], 'ngưỡng cao nhất đạt được');
  assert.deepEqual(gift('Galaxy', 1000).fires.map((f) => f.binding.id), ['time']);
  assert.deepEqual(gift('Lollipop', 5).fires, [], 'chưa tới ngưỡng');
  assert.deepEqual(gift('Lollipop', 5, 2, 2).fires.map((f) => f.binding.id), ['hint'], 'combo: tổng chuỗi 10 xu vượt ngưỡng 10');
  assert.deepEqual(gift('Lollipop', 5, 1, 3).fires, [], 'combo cộng thêm nhưng vẫn ở ngưỡng cũ → không lặp');
  assert.deepEqual(gift('Lollipop', 5, 3, 6).fires.map((f) => f.binding.id), ['time'], 'combo vượt lên ngưỡng mới');
  const r1 = gift('rose', 1, 3);
  assert.deepEqual([r1.fires, r1.progress[0].count], [[], 3]);
  const r2 = gift('TikTok', 1, 4);
  assert.deepEqual([r2.fires[0].times, r2.progress[0].count], [1, 2], '3 + 4 = 7 → 1 lần, dư 2');
  t.reset();
  assert.equal(t.view().find((v) => v.id === 'rose').count, 0, 'reset đầu vòng');
});

test('trigger tim / follow / share / từ khoá; refund trả lượt', () => {
  const clock = fakeClock();
  const t = createTriggers([
    b('like', 'letter', { type: 'like', every: 1000 }),
    b('f', 'boost', { type: 'follow' }),
    b('s', 'boost', { type: 'share', every: 2 }),
    b('k', 'join', { type: 'keyword', text: 'đội đỏ', cooldownSec: 5 }),
  ], { now: clock.now });
  assert.equal(t.feed({ type: 'like', count: 2500 }).fires[0].times, 2);
  assert.equal(t.feed({ type: 'follow' }).fires[0].binding.id, 'f');
  assert.deepEqual(t.feed({ type: 'share' }).fires, []);
  assert.equal(t.feed({ type: 'share' }).fires[0].binding.id, 's');
  assert.equal(t.feed({ type: 'comment', user: { id: 1 }, text: 'cho mình vào DOI DO nha' }).fires[0].binding.id, 'k');
  assert.deepEqual(t.feed({ type: 'comment', user: { id: 1 }, text: 'đội đỏ' }).fires, [], 'cooldown theo người');
  assert.deepEqual(t.feed({ type: 'comment', user: { id: 2 }, text: 'đội đỏchót' }).fires, [], 'phải nguyên từ');
  t.refund(t.bindings[0]);
  assert.equal(t.feed({ type: 'like', count: 1 }).fires[0].times, 1, 'refund → lần sau kích hoạt ngay');
});

const GAME = {
  manifest: { id: 'x', inputs: ['comment'], actions: [{ id: 'boom', label: 'Boom', defaultTriggers: [{ type: 'follow' }] }], commands: [{ id: 'go', label: 'Go' }] },
  schema: { type: 'object', properties: { n: { type: 'integer', minimum: 1, maximum: 5, default: 2 } } },
};

test('host: cách ly lỗi — game ném lỗi liên tục thì bị dừng, nền tảng không sập, recover() chạy lại', () => {
  let crash = true;
  const errs = [];
  const host = createHost({ ...GAME, createGame: () => ({ handle() { if (crash) throw new Error('hỏng'); return [{ ok: 1 }]; }, action: () => [], command: () => [], tick: () => [], snapshot: () => ({}), serialize: () => ({}), restore() {} }) }, { log: {}, onError: (e) => errs.push(e), maxErrors: 3 });
  for (let i = 0; i < 5; i++) assert.deepEqual(host.handle({ type: 'comment', text: 'a' }), []);
  assert.equal(host.status().state, 'crashed');
  assert.equal(errs.length, 3, 'dừng gọi game sau khi crashed');
  assert.ok(errs.at(-1).crashed);
  crash = false;
  assert.equal(host.recover(), 'running');
  assert.deepEqual(host.handle({ type: 'comment', text: 'a' }), [{ ok: 1 }]);
});

test('host: chỉ chuyển sự kiện game khai báo trong inputs; trigger → action; action trả false → trả lượt; lệnh lạ bị bỏ qua', () => {
  const calls = [];
  const host = createHost({ ...GAME, createGame: (ctx) => ({
    handle: (ev) => { calls.push(['handle', ev.type]); return []; },
    action: (id, ev, binding) => { calls.push(['action', id, binding.id, ctx.settings.n]); return [{ type: 'boom' }]; },
    command: (id) => { calls.push(['command', id]); return []; },
    tick: () => [], snapshot: () => ({}), serialize: () => ({}), restore() {},
  }) }, { settings: { n: 99 }, log: {} });
  assert.deepEqual(host.settings, { n: 2 }, 'ngoài khoảng → default');
  host.handle({ type: 'like', count: 5 });
  assert.deepEqual(host.handle({ type: 'follow', user: { id: 1 } }), [{ type: 'boom' }]);
  host.command('go'); host.command('rm -rf');
  assert.deepEqual(calls, [['action', 'boom', 'boom.0', 2], ['command', 'go']]);
});

test('schema + manifest + semver', () => {
  const sch = { type: 'object', properties: { a: { type: 'integer', minimum: 0, default: 1 }, b: { type: 'array', items: { type: 'string', enum: ['x', 'y'] }, default: ['x'] }, c: { type: 'object', properties: { d: { type: 'boolean', default: true } } } } };
  assert.deepEqual(resolveSettings(sch, { a: -1, b: ['y', 'z'], c: { d: false } }).settings, { a: 1, b: ['x'], c: { d: false } });
  assert.ok(satisfies('1.2.3', '^1.0.0'));
  assert.ok(!satisfies('2.0.0', '^1.0.0'));
  assert.ok(!satisfies('1.0.0', '^1.1.0'));
  const ok = { id: 'abc', name: 'A', version: '1.0.0', sdk: '^1.0.0', status: 'dev', inputs: ['comment'], canvas: { width: 1, height: 1 } };
  assert.deepEqual(validateManifest(ok), []);
  assert.ok(validateManifest({ ...ok, id: 'Bad Id', sdk: '^2.0.0', commands: [{ id: 'pause', label: 'x' }] }).length >= 3);
  assert.ok(validateManifest({ ...ok, actions: [{ id: 'a', label: 'A', defaultTriggers: [{ type: 'gift' }] }] }).some((e) => e.includes('quà cần')));
});

test('chữ: sameWord theo dấu, digitsOf nhận chữ số mọi hệ', () => {
  assert.ok(sameWord('mat troi', 'mặt trời'));
  assert.ok(!sameWord('mắt trời', 'mặt trời'));
  assert.equal(digitsOf('１２ ٣٤-५६'), '123456');
  assert.equal(digitsOf('không có số'), '');
});

test('importsOf đọc được import / export-from / import()', () => {
  assert.deepEqual(importsOf("import a from './a.js';\nimport { b } from \"#sdk\";\nexport * from '../x.js';\nimport 'side';\nconst m = await import('./lazy.js');"), ['./a.js', '#sdk', '../x.js', 'side', './lazy.js']);
});

test('host: tiến độ gom tim lưu kèm trạng thái ($triggers), game không thấy khoá này; triggerText / triggerIcon', () => {
  const seen = [];
  const mk = () => createHost({ ...GAME, createGame: () => ({
    handle: () => [], action: () => [], command: () => [], tick: () => [], snapshot: () => ({}),
    serialize: () => ({ a: 1 }), restore: (s) => seen.push(s),
  }) }, { bindings: [{ id: 'likes', action: 'boom', trigger: { type: 'like', every: 100 } }], log: {} });
  const a = mk();
  a.handle({ type: 'like', count: 42 });
  const saved = JSON.parse(JSON.stringify(a.serialize()));
  assert.deepEqual(saved, { a: 1, $triggers: { likes: 42 } });
  const b = mk();
  b.restore(saved);
  assert.deepEqual(seen, [{ a: 1 }], 'game nhận trạng thái không có $triggers');
  assert.equal(b.status().bindings[0].count, 42);
  assert.deepEqual(mk().serialize(), { a: 1 }, 'chưa gom gì thì không thêm khoá');
  assert.equal(triggerText({ type: 'gift', giftName: 'Rose', every: 5 }), '5 Hoa hồng');
  assert.equal(triggerText({ type: 'like', every: 1000 }), '1.000 tim');
  assert.equal(triggerText({ type: 'gift', minDiamonds: 30 }), 'Quà ≥ 30 xu');
  assert.equal(triggerIcon({ type: 'gift', giftName: 'Rose' }), '🌹');
});

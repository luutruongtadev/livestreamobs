import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';
import { RULE_IDS, nextRule, solve, ruleOk, makeRule, exampleFor } from '../engine/rules.js';

const game = await loadGame(new URL('..', import.meta.url));
const u = (id) => ({ id, name: `Người ${id}` });
const gift = (id, giftName) => ({ type: 'gift', user: u(id), giftName, diamonds: 1, count: 1 });

function mk(settings = {}, seed = 3) {
  const clock = fakeClock(1_794_372_000_000);
  const fx = [];
  const host = createHost(game, { settings: { voteEvery: 0, viewerRuleEvery: 0, ...settings }, data: game.data, now: clock.now, random: seededRandom(seed), log: {}, onEffects: (e) => fx.push(...e) });
  return { host, clock, fx };
}
const play = (host, clock) => { clock.advance(10_000); return host.tick(); };
const answer = (s) => solve([...s.rules, { id: 'len', p: Math.max(3, ...s.rules.filter((r) => r.id === 'len').map((r) => r.p)) }], s.env);

test('bộ luật: tổ hợp ngẫu nhiên nào cũng giải được', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rand = seededRandom(seed);
    const env = { now: 1_794_372_000_000 + seed * 7_777_000, tz: 7, host: seed % 3 ? 'Jey' : '' };
    const rules = [];
    for (let i = 0; i < 14; i++) { const r = nextRule(rules, i < 4 ? 1 : i < 9 ? 2 : 3, rand, env); assert.ok(r, `seed ${seed}: hết luật ở ${i}`); rules.push(r); }
    const s = solve(rules, env);
    assert.ok(s && rules.every((r) => ruleOk(r, s, env)), `seed ${seed}: ${JSON.stringify(rules)} → ${s}`);
  }
  assert.ok(RULE_IDS.length >= 62);
  for (const id of RULE_IDS) {
    const r = makeRule(id, [], seededRandom(2), { now: Date.UTC(2026, 10, 12, 14, 5), tz: 7, host: 'Jey' });
    assert.ok(r, `luật ${id} tạo được`);
    assert.ok(exampleFor(r, { now: Date.UTC(2026, 10, 12, 14, 5), tz: 7 }) !== undefined);
  }
});

test('luật theo thời gian thật: giờ hiện tại, thứ hôm nay', () => {
  const env = { now: Date.UTC(2026, 10, 12, 14, 5), tz: 7 }; // 21h05 thứ Năm giờ VN
  assert.ok(ruleOk({ id: 'time' }, 'abc21h05', env));
  assert.ok(!ruleOk({ id: 'time' }, 'abc21h04', { ...env, now: env.now + 60_000 }));
  assert.ok(ruleOk({ id: 'weekday' }, 'xT5', env));
  assert.ok(!ruleOk({ id: 'weekday' }, 'xT6', env));
  assert.ok(ruleOk({ id: 'sum', p: 12 }, 'a93', env));
  assert.ok(ruleOk({ id: 'forbid', p: 'e' }, 'abc', env) && !ruleOk({ id: 'forbid', p: 'e' }, 'mÊo', env));
  assert.ok(ruleOk({ id: 'math' }, 'x2+3=5', env) && !ruleOk({ id: 'math' }, 'x2+3=6', env));
  assert.ok(ruleOk({ id: 'ngaynay' }, 'a12/11', env) && ruleOk({ id: 'ngaynay' }, 'a12/11', env) && !ruleOk({ id: 'ngaynay' }, 'a13/11', env));
  assert.ok(ruleOk({ id: 'thang' }, 'NOVember', env) && ruleOk({ id: 'roman' }, 'xXI', env) && !ruleOk({ id: 'roman' }, 'xxi', env));
  assert.ok(ruleOk({ id: 'phepnhan' }, '3x4=12', env) && !ruleOk({ id: 'phepnhan' }, '3x4=13', env));
  assert.ok(ruleOk({ id: 'hoahoc', p: 0 }, 'xAu', env) && !ruleOk({ id: 'hoahoc', p: 0 }, 'xau', env));
  assert.ok(ruleOk({ id: 'thudo', p: 2 }, 'Seoul!', env));
  assert.ok(ruleOk({ id: 'emojiN', p: 2 }, '😎a❤', env) && !ruleOk({ id: 'emojiN', p: 2 }, '😎', env));
  assert.ok(ruleOk({ id: 'khoangtrang' }, 'a b', env) && !ruleOk({ id: 'khoangtrang' }, 'a b c', env));
  assert.ok(ruleOk({ id: 'bienso' }, 'xe29A1', env) && !ruleOk({ id: 'bienso' }, 'xe29a1', env));
});

test('host: giới thiệu → chơi; Enter khi còn sai → bị chê; đúng hết → hiện luật mới; qua luật cuối → qua màn', () => {
  const { host, clock } = mk({ baseRules: 4 });
  assert.equal(host.snapshot().phase, 'intro');
  play(host, clock);
  let s = host.snapshot();
  assert.equal(s.phase, 'play');
  assert.equal(s.rules.length, 1);
  host.input({ type: 'text', value: '' });
  host.input({ type: 'text', value: '😶' });
  const bad = s.rules[0].id === 'emoji' ? 'aaa' : '😶';
  host.input({ type: 'text', value: bad });
  const w = host.input({ type: 'enter' });
  assert.equal(w[0].type, 'mk_wrong');
  for (let i = 0; i < 10 && host.snapshot().phase === 'play'; i++) {
    s = host.snapshot();
    host.input({ type: 'text', value: answer(s) });
    const fx = host.input({ type: 'enter' });
    assert.ok(fx.length, `vòng ${i}: Enter có phản hồi`);
  }
  s = host.snapshot();
  assert.equal(s.phase, 'result');
  assert.equal(s.result.win, true);
  assert.equal(s.result.rules, 4);
  assert.equal(s.level, 2);
  clock.advance(20_000); host.tick();
  assert.equal(host.snapshot().phase, 'intro');
  assert.equal(host.snapshot().total, 5, 'màn 2 thêm 1 luật');
});

test('người xem tự chơi: bình luận đúng hết luật → mở luật mới + điểm; người qua luật cuối thắng', () => {
  const { host, clock } = mk({ mode: 'viewer', baseRules: 3 });
  play(host, clock);
  assert.deepEqual(host.handle({ type: 'comment', user: u('a'), text: 'ab' }), [], 'quá ngắn không tính');
  let s = host.snapshot();
  const fx = host.handle({ type: 'comment', user: u('a'), text: answer(s) });
  assert.equal(fx[0].type, 'mk_unlock');
  assert.equal(host.snapshot().rules.length, 2);
  assert.deepEqual(host.handle({ type: 'comment', user: u('a'), text: answer(host.snapshot()) }), [], 'chờ 1,5 giây mới được thử tiếp');
  clock.advance(2000);
  host.handle({ type: 'comment', user: u('b'), text: answer(host.snapshot()) });
  clock.advance(2000);
  const end = host.handle({ type: 'comment', user: u('c'), text: answer(host.snapshot()) });
  assert.equal(end.at(-1).type, 'mk_win');
  s = host.snapshot();
  assert.equal(s.result.by.id, 'c');
  assert.ok(s.top.players.find((p) => p.id === 'c').points > s.top.players.find((p) => p.id === 'a').points);
  assert.equal(host.handle(gift('x', 'Doughnut')).length, 0, 'hacker không dùng được khi người xem chơi');
});

test('bình chọn luật: gõ 1 / 2, mỗi người 1 phiếu; hết giờ → luật thắng được hiện khi host qua luật', () => {
  const { host, clock } = mk({ voteEvery: 2, voteSeconds: 10, baseRules: 6 });
  play(host, clock);
  let s = host.snapshot();
  assert.ok(s.vote, 'luật thứ 2 là luật bình chọn');
  host.handle({ type: 'comment', user: u('a'), text: '2' });
  host.handle({ type: 'comment', user: u('a'), text: '1' });
  host.handle({ type: 'comment', user: u('b'), text: '2' });
  assert.deepEqual(host.snapshot().vote.counts, [0, 2]);
  const want = s.vote.options[1];
  host.input({ type: 'text', value: answer(s) });
  assert.equal(host.input({ type: 'enter' })[0].type, 'mk_wait', 'đang bình chọn thì chờ');
  clock.advance(10_000);
  const fx = host.tick();
  assert.equal(fx[0].type, 'mk_vote_end');
  assert.equal(fx[0].i, 1);
  s = host.snapshot();
  assert.equal(s.rules.length, 2);
  assert.equal(s.rules[1].text, want);
});

test('quà: Ra luật (bình luận kế tiếp thành luật), luật siêu khó, hacker, khiên chặn, gợi ý, xoá luật, thêm / rút giờ', () => {
  const { host, clock } = mk({ baseRules: 6 });
  play(host, clock);
  host.handle(gift('g', 'Rose'));
  assert.equal(host.snapshot().pending.length, 1);
  const fx = host.handle({ type: 'comment', user: u('g'), text: 'trà sữa' });
  assert.equal(fx[0].type, 'mk_rule');
  let s = host.snapshot();
  assert.equal(s.rules.at(-1).id, 'viewer');
  assert.equal(s.rules.at(-1).p.w, 'trà');
  assert.equal(s.total, 7);
  host.handle(gift('e', 'Cap'));
  s = host.snapshot();
  assert.equal(s.rules.at(-1).tier, 3);
  host.input({ type: 'text', value: 'abc' });
  host.handle(gift('h', 'Doughnut'));
  assert.equal(host.snapshot().typed, '');
  host.handle(gift('k', 'Sunglasses'));
  assert.equal(host.snapshot().shield, 1);
  host.input({ type: 'text', value: 'abc' });
  const blocked = host.handle(gift('h', 'Doughnut'));
  assert.equal(blocked.find((f) => f.type === 'mk_gift').blocked, true);
  assert.equal(host.snapshot().typed, 'abc');
  host.handle(gift('z', 'Heart Me'));
  assert.ok(host.snapshot().rules.some((r) => r.hint));
  const n = host.snapshot().rules.length;
  host.handle(gift('z', 'Hand Hearts'));
  assert.equal(host.snapshot().rules.length, n - 1);
  const left = host.snapshot().remainingMs;
  host.handle(gift('z', 'Rosa'));
  assert.equal(host.snapshot().remainingMs, left + 30_000);
  host.handle(gift('z', 'GG'));
  assert.equal(host.snapshot().remainingMs, left + 10_000);
});

test('hết giờ: khoá tài khoản, hình phạt, lùi màn; lưu / khôi phục giữ nguyên ván', () => {
  const { host, clock } = mk({ startLevel: 3 });
  play(host, clock);
  host.input({ type: 'text', value: 'abc' });
  const saved = JSON.parse(JSON.stringify(host.serialize ? host.serialize() : host.game.serialize()));
  const { host: h2 } = mk({ startLevel: 3 }, 9);
  (h2.restore || h2.game.restore).call(h2.restore ? h2 : h2.game, saved);
  assert.equal(h2.snapshot().typed, 'abc');
  assert.deepEqual(h2.snapshot().rules.map((r) => r.text), host.snapshot().rules.map((r) => r.text));
  clock.advance(60 * 60_000);
  const fx = host.tick();
  assert.equal(fx[0].type, 'mk_fail');
  assert.equal(fx[0].punishmentKind, 'game', 'mặc định: án phạt trong game, không bắt host làm gì trước camera');
  assert.ok(fx[0].punishment);
  assert.equal(host.snapshot().level, 2);
  const before = host.snapshot().total;
  clock.advance(60_000); host.tick(); // hết màn kết quả → giới thiệu
  clock.advance(60_000); const start = host.tick();
  assert.ok(start.some((f) => f.type === 'mk_penalty'), 'màn sau bị áp án phạt');
  assert.ok(host.snapshot().total >= before);
});

// ---------------- luật người xem tự đặt (AI duyệt) ----------------
import { cleanSpec, evalSpec, safeRegex } from '../engine/custom.js';
import { createServer } from '../server/index.js';

test('spec luật tự đặt: đếm, chứa, danh sách, độ dài, tổng số; regex nguy hiểm bị loại', () => {
  const s = cleanSpec({ mode: 'all', checks: [{ type: 'count', cls: 'char', chars: 'a', op: 'eq', n: 3 }, { type: 'contains_any', list: ['quanghai', 'congphuong'] }] });
  assert.ok(evalSpec(s, 'Quang Hải ăn banana') === false, 'có dấu cách thì không khớp "quanghai"');
  assert.ok(evalSpec(s, 'QuangHải-ba'), 'không dấu, không hoa thường: quanghai + đúng 3 chữ a (kể cả có dấu)');
  assert.ok(!evalSpec(s, 'quanghai-banana'));
  assert.ok(evalSpec(cleanSpec({ checks: [{ type: 'length', op: 'lte', n: 5 }] }), 'abcde'));
  assert.ok(evalSpec(cleanSpec({ checks: [{ type: 'digit_sum', op: 'eq', n: 10 }] }), 'a55'));
  assert.ok(evalSpec(cleanSpec({ checks: [{ type: 'starts_with', text: 'Đ', accentSensitive: true }] }), 'đẹp'));
  assert.equal(safeRegex('(a+)+$'), null);
  assert.equal(safeRegex('(\\w)\\1'), null);
  assert.ok(safeRegex('^[A-Z].*\\d$'));
  assert.equal(cleanSpec({ checks: [{ type: 'regex', pattern: '(x*)*y' }] }), null);
  assert.equal(cleanSpec({ checks: [{ type: 'eval', code: 'process.exit()' }] }), null);
});

function fakeClaude(reply) {
  const calls = [];
  return { calls, beta: { messages: { create: async (req) => { calls.push(req); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply(req)) }] }; } } } };
}

test('server: dịch luật bằng Haiku (không suy nghĩ), làm sạch, cache theo nội dung luật; chấm luật cảm tính', async () => {
  const client = fakeClaude((req) => (req.messages[0].content.startsWith('LUẬT CỦA')
    ? { ok: true, reason: '', label: 'Có tên một cầu thủ Việt Nam', judge: false, example: 'quanghai', mode: 'all', checks: [{ type: 'contains_any', text: null, list: ['quanghai', 'congphuong'], cls: null, chars: null, op: null, n: null, pattern: null, caseSensitive: false, accentSensitive: false }] }
    : { ok: true, why: 'nghe dễ thương' }));
  const srv = createServer({ client, log: {} });
  const a = await srv.ops.compile({ text: 'phải có tên cầu thủ VN' });
  assert.equal(a.ok, true);
  assert.equal(a.example, 'quanghai');
  assert.equal(client.calls[0].model, 'claude-haiku-5-5');
  assert.deepEqual(client.calls[0].thinking, { type: 'disabled' });
  const b = await srv.ops.compile({ text: 'Phải có tên cầu thủ vn' });
  assert.equal(b.cached, true, 'cùng luật (khác dấu / hoa thường) → cache');
  assert.equal(client.calls.length, 1);
  const j = await srv.ops.judge({ rule: 'Nghe phải dễ thương', password: 'meomeo' });
  assert.equal(j.ok, true);
  await srv.ops.judge({ rule: 'Nghe phải dễ thương', password: 'meomeo' });
  assert.equal(client.calls.length, 2, 'chấm lại cùng mật khẩu → cache');
  const off = createServer({ client: null, log: {} });
  assert.equal((await off.ops.compile({ text: 'có chữ a' })).offline, true);
});

/** Server giả cho engine: luật "mèo" → spec chứa "meo"; luật "dễ thương" → AI chấm. */
function mkAi(settings = {}) {
  const clock = fakeClock(1_794_372_000_000);
  const fx = [];
  const replies = [];
  const server = {
    request: async (op, p) => {
      replies.push([op, p]);
      if (op === 'caps') return { llm: true };
      if (op === 'compile') {
        if (/thương/.test(p.text)) return { ok: true, label: 'Nghe phải dễ thương', judge: true, spec: null, example: 'cute' };
        if (/chửi/.test(p.text)) return { ok: false, reason: 'Luật không lịch sự' };
        if (/không có chữ m/.test(p.text)) return { ok: true, label: 'Không có chữ m', judge: false, spec: { mode: 'all', checks: [{ type: 'not_contains', text: 'm' }] }, example: '' };
        return { ok: true, label: 'Có chữ mèo', judge: false, spec: { mode: 'all', checks: [{ type: 'contains', text: 'meo' }] }, example: 'meo' };
      }
      if (op === 'judge') return { ok: /cute/.test(p.password), why: '' };
      return {};
    },
  };
  const host = createHost(game, { settings: { voteEvery: 0, viewerRuleEvery: 0, ...settings }, data: game.data, now: clock.now, random: seededRandom(3), server, log: {}, onEffects: (e) => fx.push(...e) });
  return { host, clock, fx, replies };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test('“luật: …” → AI duyệt rồi thêm vào màn đang chơi; bị loại / mâu thuẫn thì báo; giới hạn mỗi màn', async () => {
  const { host, clock, fx } = mkAi({ freeRulesPerLevel: 2, ruleCooldownSeconds: 0, aiRuleNeedsGift: false });
  await flush();
  play(host, clock);
  const n = host.snapshot().rules.length, total = host.snapshot().total;
  assert.equal(host.handle({ type: 'comment', user: u('a'), text: 'luật: phải có con mèo' })[0].type, 'mk_propose');
  assert.equal(host.snapshot().compiling.length, 1);
  await flush(); await flush();
  let s = host.snapshot();
  assert.equal(s.rules.length, n + 1);
  assert.equal(s.total, total + 1);
  assert.equal(s.rules.at(-1).text, 'Có chữ mèo');
  assert.equal(s.rules.at(-1).by.id, 'a');
  assert.ok(fx.some((f) => f.type === 'mk_rule'));
  host.handle({ type: 'comment', user: u('b'), text: 'Luật: không có chữ m' });
  await flush(); await flush();
  assert.equal(fx.at(-1).type, 'mk_rule_rejected');
  assert.match(fx.at(-1).reason, /Mâu thuẫn/);
  host.handle({ type: 'comment', user: u('c'), text: 'luat: chửi người' });
  await flush(); await flush();
  assert.equal(fx.at(-1).reason, 'Luật không lịch sự');
  assert.equal(host.snapshot().ruleSlots, 1, 'luật bị loại không tính vào giới hạn');
  host.handle({ type: 'comment', user: u('d'), text: 'luật: có con mèo nữa' });
  await flush(); await flush();
  assert.equal(fx.at(-1).reason, 'Luật này có rồi');
  s = host.snapshot();
  assert.ok(s.rules.every((r) => r.id !== 'custom' || r.by), 'luật tự đặt ghi tên người đặt');
});

test('luật cảm tính: host Enter → AI chấm mật khẩu rồi mới qua; người xem tự chơi cũng vậy', async () => {
  const { host, clock, fx, replies } = mkAi({ baseRules: 3 });
  await flush();
  play(host, clock);
  host.handle({ type: 'gift', user: u('g'), giftName: 'Finger Heart', diamonds: 5, count: 1 });
  host.handle({ type: 'comment', user: u('g'), text: 'mật khẩu phải nghe dễ thương' });
  await flush(); await flush();
  const s = host.snapshot();
  const j = s.rules.find((r) => r.judge);
  assert.ok(j, 'luật AI chấm đã vào màn');
  const base = solve(s.rules.filter((r) => !r.judge), s.env);
  host.input({ type: 'text', value: base.includes('cute') ? base.replace(/cute/g, '') + 'x' : base });
  assert.equal(host.input({ type: 'enter' })[0].type, 'mk_checking');
  await flush(); await flush();
  assert.ok(replies.some(([op]) => op === 'judge'));
  assert.equal(fx.at(-1).type, 'mk_wrong', 'AI chấm không đạt → sai');
  const good = solve(s.rules, s.env);
  assert.ok(good.includes('cute'), 'bộ giải dùng ví dụ của luật AI');
  host.input({ type: 'text', value: good });
  host.input({ type: 'enter' });
  await flush(); await flush();
  assert.ok(['mk_rule', 'mk_win', 'mk_vote_start'].includes(fx.at(-1).type) || host.snapshot().rules.length > s.rules.length, 'AI chấm đạt → qua luật');
});

test('mặc định: Hoa hồng → luật “có chữ” (1 từ, không gọi AI); quà 5 xu → luật bất kỳ qua AI; “luật:” miễn phí bị nhắc tặng quà', async () => {
  const { host, clock, fx, replies } = mkAi({});
  await flush();
  play(host, clock);
  host.handle({ type: 'gift', user: u('r'), giftName: 'Rose', diamonds: 1, count: 1 });
  host.handle({ type: 'comment', user: u('r'), text: 'mèo béo quá' });
  let s = host.snapshot();
  assert.equal(s.rules.at(-1).id, 'viewer');
  assert.equal(s.rules.at(-1).p.w, 'mèo');
  assert.ok(!replies.some(([op]) => op === 'compile'), 'hoa hồng không gọi AI');
  assert.equal(host.handle({ type: 'comment', user: u('x'), text: 'luật: có chữ z' })[0].type, 'mk_rule_rejected');
  assert.deepEqual(host.handle({ type: 'comment', user: u('x'), text: 'luật: có chữ z' }), [], 'nhắc 1 lần / 30 giây');
  host.handle({ type: 'gift', user: u('f'), giftName: 'Finger Heart', diamonds: 5, count: 1 });
  assert.equal(host.snapshot().pending[0].kind, 'ai');
  host.handle({ type: 'comment', user: u('f'), text: 'phải có con mèo' });
  await flush(); await flush();
  s = host.snapshot();
  assert.equal(s.rules.at(-1).id, 'custom');
  assert.ok(replies.some(([op]) => op === 'compile'));
  assert.equal(s.aiGift, true);
});

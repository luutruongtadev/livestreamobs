import test from 'node:test';
import assert from 'node:assert/strict';
import { WordGame } from '../server/wordgame.js';
import { ATTRS, compareAttr, chooseAttrs, AttrStore, ATTR_BY_ID } from '../server/attributes.js';

const flush = () => new Promise((r) => setTimeout(r, 5));
const base = (over = {}) => Object.fromEntries(ATTRS.map((a) => [a.id, over[a.id] !== undefined ? over[a.id] : a.values[0]]));
// thuộc tính giả: con mèo vs con chó vs cái bàn
const DB = {
  'con mèo': base({ loai: 'Con vật', kich_thuoc: 'Cỡ cái bàn', song: 'Có', so_chan: '4 chân', mau: 'Nhiều màu' }),
  'con chó': base({ loai: 'Con vật', kich_thuoc: 'Cỡ người', song: 'Có', so_chan: '4 chân', mau: 'Nâu' }),
  'cái bàn': base({ loai: 'Đồ vật', kich_thuoc: 'Cỡ người', song: 'Không', so_chan: '4 chân', mau: 'Nâu' }),
  'nỗi nhớ': base({ loai: 'Cảm xúc/khái niệm', kich_thuoc: null, mau: null, can_nang: null, so_chan: null }),
};
const fakeStore = () => ({ available: true, get: async (w) => DB[w] || null });
const mk = (cfg = {}, attrStore = fakeStore()) => {
  const clock = { t: 1_000_000 };
  const g = new WordGame({ words: [{ word: 'con mèo' }], roundSeconds: 300, cooldownSec: 0, ...cfg }, { scorer: { score: async () => ({ score: 42, source: 'test' }) }, now: () => clock.t, attrStore });
  return { g, clock };
};
const say = (g, id, text) => g.handle({ type: 'comment', user: { id, name: id }, text });

test('so thuộc tính: giống = xanh, lệch 1 bậc (thuộc tính có thứ bậc) = vàng, khác = xám, không áp dụng = na', () => {
  assert.equal(compareAttr(ATTR_BY_ID.loai, 'Con vật', 'Con vật'), 'hit');
  assert.equal(compareAttr(ATTR_BY_ID.kich_thuoc, 'Cỡ cái bàn', 'Cỡ người'), 'near');
  assert.equal(compareAttr(ATTR_BY_ID.kich_thuoc, 'Nhỏ hơn bàn tay', 'Cỡ người'), 'miss');
  assert.equal(compareAttr(ATTR_BY_ID.mau, 'Đỏ', 'Nâu'), 'miss', 'màu không có thứ bậc');
  assert.equal(compareAttr(ATTR_BY_ID.mau, 'Đỏ', null), 'na');
  assert.equal(ATTRS.length, 22);
});

test('chọn 6 thuộc tính: luôn có Loại, chỉ lấy thuộc tính có nghĩa với từ bí mật, đa dạng', () => {
  for (let i = 0; i < 20; i++) {
    const ids = chooseAttrs(DB['nỗi nhớ']);
    assert.equal(ids.length, 6);
    assert.equal(ids[0], 'loai');
    assert.equal(new Set(ids).size, 6);
    for (const id of ['kich_thuoc', 'mau', 'can_nang', 'so_chan']) assert.ok(!ids.includes(id), id);
  }
});

test('vòng thuộc tính: từ đoán hiện 6 ô, xếp theo số ô xanh, dòng ĐÃ BIẾT cộng dồn, đoán đúng vẫn thắng', async () => {
  const { g } = mk({ modeRotation: 'attr' });
  assert.equal(g.mode, 'attr');
  await flush();
  assert.equal(g.snapshot().attrs.length, 6);
  const fx = [];
  g.on('effects', (e) => fx.push(...e));
  say(g, 'a', 'cái bàn'); say(g, 'b', 'con chó');
  await flush();
  const snap = g.snapshot();
  assert.equal(snap.ranked[0].word, 'con chó', 'con chó giống con mèo nhiều hơn cái bàn');
  assert.equal(snap.ranked[0].cells.length, 6);
  assert.equal(snap.ranked[0].cells[0].s, 'hit', 'Loại: Con vật');
  assert.equal(snap.known[0], 'Con vật', 'ĐÃ BIẾT: Loại');
  assert.ok(fx.some((e) => e.type === 'wg_known'));
  const win = say(g, 'c', 'con mèo');
  assert.equal(win.find((e) => e.type === 'wg_win')?.by.id, 'c');
  assert.ok(g.snapshot().known.every((v) => v !== null), 'hết vòng lộ hết thuộc tính');
});

test('từ đoán trước khi có thuộc tính từ bí mật được chấm sau; không xếp được thuộc tính thì vòng chơi kiểu gần nghĩa', async () => {
  let release;
  const slow = { available: true, get: (w) => (w === 'con mèo' ? new Promise((r) => { release = () => r(DB[w]); }) : Promise.resolve(DB[w] || null)) };
  const { g } = mk({ modeRotation: 'attr' }, slow);
  say(g, 'a', 'con chó');
  await flush();
  assert.equal(g.snapshot().ranked.length, 0, 'đang chờ');
  release(); await flush(); await flush();
  assert.equal(g.snapshot().ranked[0].hits >= 1, true);
  const broken = { available: true, get: async () => null };
  const { g: g2 } = mk({ modeRotation: 'attr' }, broken);
  await flush();
  assert.equal(g2.mode, 'meaning');
  say(g2, 'a', 'con chó'); await flush();
  assert.equal(g2.snapshot().ranked[0].score, 42);
});

test('luân phiên: mặc định 3 chế độ, mỗi 2 vòng đổi; admin bật / tắt được; chế độ thiếu Claude thì bỏ qua', () => {
  const en = { available: true, get: async () => ['summer', 'sunglasses'] };
  const clock = { t: 1 };
  const g = new WordGame({ words: [{ word: 'con mèo' }], cooldownSec: 0 }, { scorer: { score: async () => ({ score: 1 }) }, now: () => clock.t, attrStore: fakeStore(), englishStore: en });
  const modes = [g.mode];
  for (let i = 0; i < 6; i++) { g.skip(); g.skip(); modes.push(g.mode); }
  assert.deepEqual(modes, ['meaning', 'meaning', 'attr', 'attr', 'english', 'english', 'meaning']);
  g.applySettings({ modes: ['meaning'] }); g.skip(); g.skip();
  assert.equal(g.mode, 'meaning');
  assert.deepEqual(g.settings(), { modes: ['meaning'], alternateEvery: 2, likeEvery: 1000, englishLikeEvery: 2000 });
  g.applySettings({ modes: ['attr', 'english'], alternateEvery: 1 });
  const seq = []; for (let i = 0; i < 4; i++) { g.skip(); g.skip(); seq.push(g.mode); }
  assert.ok(seq.includes('attr') && seq.includes('english') && !seq.includes('meaning'));
  const { g: noAi } = mk({ modeRotation: 'attr' }, null);
  assert.equal(noAi.mode, 'meaning');
});

test('thả tim: đủ mốc thì lộ 1 chữ cái, thanh tiến độ hiện trong bảng mở khoá, không lộ hết chữ', () => {
  const { g } = mk({ modeRotation: 'meaning', likeEvery: 100 });
  g.handle({ type: 'like', user: { id: 'a', name: 'A' }, count: 60 });
  assert.equal(g.snapshot().unlocks[0].count, 60);
  const fx = g.handle({ type: 'like', user: { id: 'b', name: 'B' }, count: 50 });
  const un = fx.find((e) => e.type === 'wg_unlock');
  assert.ok(un?.likes && un.indexes.length === 1);
  assert.equal(g.snapshot().unlocks[0].count, 10);
  // "con mèo" có 6 chữ: mở tối đa 5 chữ
  g.handle({ type: 'like', user: { id: 'c', name: 'C' }, count: 5000 });
  assert.equal(g.snapshot().letters.flat().filter(Boolean).length, 5);
});

test('AttrStore: gom lô gọi Claude một lần, lưu cache, giá trị lạ thành null', async () => {
  const calls = [];
  const client = { beta: { messages: { create: async (req) => {
    calls.push(req);
    const words = JSON.parse(req.messages[0].content.split(': ')[1]);
    const items = words.map((w) => ({ word: w, ...Object.fromEntries(ATTRS.map((a) => [a.id, a.id === 'mau' ? 'Không áp dụng' : a.values[1]])) }));
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ items }) }] };
  } } } };
  const s = new AttrStore({ client, batchMs: 5 });
  const [a, b] = await Promise.all([s.get('Con Mèo'), s.get('cái bàn')]);
  assert.equal(calls.length, 1);
  assert.equal(a.loai, 'Con vật');
  assert.equal(a.mau, null);
  assert.equal(b.song, 'Không');
  await s.get('con mèo');
  assert.equal(calls.length, 1, 'lấy từ cache');
  assert.match(calls[0].system, /so_chan/);
});

test('chế độ gợi ý tiếng Anh: 5 gợi ý tiếng Anh mở dần, không có gợi ý chủ đề tiếng Việt, chấm gần nghĩa; lỗi thì quay về gợi ý thường', async () => {
  const en = { available: true, get: async () => ['pet', 'whiskers', 'meow', 'kitten', 'tabby'] };
  const clock = { t: 1 };
  const g = new WordGame({ words: [{ word: 'con mèo', hint: 'Động vật', desc: ['a', 'b'], emoji: '🐱 🐾 🧶' }], modes: ['english'], roundSeconds: 300, cooldownSec: 0 }, { scorer: { score: async () => ({ score: 77, source: 't' }) }, now: () => clock.t, englishStore: en });
  await flush();
  assert.equal(g.mode, 'english');
  assert.equal(g.maxHints, 5);
  g.revealHint(); g.revealHint();
  assert.deepEqual(g.snapshot().hints, ['🇬🇧 pet', '🇬🇧 whiskers']);
  say(g, 'a', 'con chó'); await flush();
  assert.equal(g.snapshot().ranked[0].score, 77);
  const bad = { available: true, get: async () => null };
  const g2 = new WordGame({ words: [{ word: 'con mèo', hint: 'Động vật', desc: ['a', 'b'], emoji: '🐱 🐾 🧶' }], modes: ['english'], cooldownSec: 0 }, { scorer: { score: async () => ({ score: 1 }) }, now: () => clock.t, englishStore: bad });
  await flush();
  assert.equal(g2.mode, 'meaning');
  g2.revealHint();
  assert.equal(g2.snapshot().hints[0], '🐱 🐾 🧶');
});

test('EnglishHintStore: bỏ gợi ý trùng / chứa đáp án / ký tự lạ, tối đa 5, lưu cache', async () => {
  const { EnglishHintStore } = await import('../server/englishhints.js');
  const calls = [];
  const client = { beta: { messages: { create: async (req) => { calls.push(req); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ hints: ['Pet!', 'pet', 'con mèo cute', 'whiskers', 'meow', 'kitten', 'tabby', 'yarn'] }) }] }; } } } };
  const s = new EnglishHintStore({ client });
  const h = await s.get('Con Mèo');
  assert.deepEqual(h, ['Pet', 'whiskers', 'meow', 'kitten', 'tabby']);
  await s.get('con mèo');
  assert.equal(calls.length, 1, 'lấy từ cache');
  assert.equal(await new EnglishHintStore({}).get('x'), null, 'không có client → null');
});

test('chế độ tiếng Anh: hệ thống chỉ tự mở 3 từ; đủ 2000 tim mở thêm từ (tối đa 5), hết từ thì tim quay về lộ chữ', async () => {
  const en = { available: true, get: async () => ['pet', 'whiskers', 'meow', 'kitten', 'tabby'] };
  const clock = { t: 1 };
  const g = new WordGame({ words: [{ word: 'con mèo', hint: 'Động vật' }], modes: ['english'], roundSeconds: 300, cooldownSec: 0 }, { scorer: { score: async () => ({ score: 5 }) }, now: () => clock.t, englishStore: en });
  await flush();
  clock.t += 299_000; g.tick(); g.tick(); g.tick(); g.tick();
  assert.equal(g.hintLevel, 3, 'hết giờ cũng chỉ tự mở 3 từ');
  assert.equal(g.snapshot().unlocks[0].label, '2.000 tim = thêm 1 từ 🇬🇧');
  let fx = g.handle({ type: 'like', count: 1999 });
  assert.equal(g.hintLevel, 3);
  fx = g.handle({ type: 'like', count: 1 });
  assert.equal(g.hintLevel, 4);
  assert.ok(fx.some((e) => e.type === 'wg_unlock' && e.likes && e.action === 'hint' && e.hint === '🇬🇧 kitten'));
  g.handle({ type: 'like', count: 2000 });
  assert.deepEqual(g.snapshot().hints.at(-1), '🇬🇧 tabby');
  assert.equal(g.hintLevel, 5);
  // đủ 5 từ: tim lộ chữ cái theo mức thường (1000)
  assert.equal(g.snapshot().unlocks[0].label, '1.000 tim = 1 chữ');
  fx = g.handle({ type: 'like', count: 1000 });
  assert.ok(fx.some((e) => e.type === 'wg_unlock' && e.action === 'letter'));
});

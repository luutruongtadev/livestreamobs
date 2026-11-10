import test from 'node:test';
import assert from 'node:assert/strict';
import { WordGame, orderEnglish } from '../server/wordgame.js';
import { ATTRS, compareAttr, chooseAttrs, AttrStore, ATTR_BY_ID, textAttrs, fullAttrs, CODE } from '../server/attributes.js';

const flush = () => new Promise((r) => setTimeout(r, 5));
const base = (over = {}) => Object.fromEntries(ATTRS.filter((a) => !a.text).map((a) => [a.id, over[a.id] !== undefined ? over[a.id] : a.multi ? [a.values[0]] : a.values[0]]));
// thuộc tính giả: con mèo vs con chó vs cái bàn
const DB = {
  'con mèo': base({ loai: 'Con vật', kich_thuoc: 'Cỡ cái bàn', song: 'Có', so_chan: '4 chân', mau: ['Trắng', 'Đen/xám'] }),
  'con chó': base({ loai: 'Con vật', kich_thuoc: 'Cỡ người', song: 'Có', so_chan: '4 chân', mau: ['Nâu'] }),
  'cái bàn': base({ loai: 'Đồ vật', kich_thuoc: 'Cỡ người', song: 'Không', so_chan: '4 chân', mau: ['Nâu'] }),
  'nỗi nhớ': base({ loai: 'Cảm xúc/khái niệm', kich_thuoc: null, mau: null, can_nang: null, so_chan: null }),
};
const fakeStore = () => ({ available: true, get: async (w) => DB[w] || null });
const mk = (cfg = {}, attrStore = fakeStore()) => {
  const clock = { t: 1_000_000 };
  const g = new WordGame({ words: [{ word: 'con mèo' }], roundSeconds: 300, cooldownSec: 0, ...cfg }, { scorer: { score: async () => ({ score: 42, source: 'test' }) }, now: () => clock.t, attrStore });
  return { g, clock };
};
const say = (g, id, text) => g.handle({ type: 'comment', user: { id, name: id }, text });

test('so thuộc tính: trúng / một phần (màu, thanh điệu) / gần + mũi tên ↑↓ (thứ bậc) / khác / không áp dụng', () => {
  assert.deepEqual(compareAttr(ATTR_BY_ID.loai, 'Con vật', 'Con vật'), { s: 'hit' });
  assert.deepEqual(compareAttr(ATTR_BY_ID.kich_thuoc, 'Cỡ cái bàn', 'Cỡ người'), { s: 'near', dir: 'down' });
  assert.deepEqual(compareAttr(ATTR_BY_ID.kich_thuoc, 'To hơn nhà', 'Nhỏ hơn bàn tay'), { s: 'miss', dir: 'up' }, 'đáp án to hơn');
  assert.deepEqual(compareAttr(ATTR_BY_ID.mau, ['Đỏ', 'Xanh lá'], ['Đỏ', 'Vàng/cam']), { s: 'part' });
  assert.deepEqual(compareAttr(ATTR_BY_ID.mau, ['Đỏ'], ['Nâu']), { s: 'miss' });
  assert.deepEqual(compareAttr(ATTR_BY_ID.mau, ['Đỏ', 'Trắng'], ['Trắng', 'Đỏ']), { s: 'hit' });
  assert.deepEqual(compareAttr(ATTR_BY_ID.mau, ['Đỏ'], null), { s: 'na' });
  assert.deepEqual(compareAttr(ATTR_BY_ID.chu_dau, 'M', 'C'), { s: 'miss', dir: 'up' }, 'M đứng sau C');
  assert.equal(ATTRS.length, 26);
  assert.ok(!ATTRS.some((a) => ['tre_em', 'cam_giac'].includes(a.id)), 'bỏ thuộc tính cảm tính');
});

test('thuộc tính mặt chữ: thanh điệu các tiếng + chữ cái đầu theo bảng chữ cái tiếng Việt', () => {
  assert.deepEqual(textAttrs('con mèo'), { thanh_dieu: ['Ngang', 'Huyền'], chu_dau: 'C' });
  assert.deepEqual(textAttrs('Đồng hồ'), { thanh_dieu: ['Huyền'], chu_dau: 'Đ' });
  assert.deepEqual(textAttrs('ổ khóa'), { thanh_dieu: ['Sắc', 'Hỏi'], chu_dau: 'Ô' });
  assert.deepEqual(textAttrs('ăn uống'), { thanh_dieu: ['Ngang', 'Sắc'], chu_dau: 'Ă' });
  assert.deepEqual(compareAttr(ATTR_BY_ID.thanh_dieu, ['Ngang', 'Huyền'], ['Huyền']), { s: 'part' });
  assert.equal(fullAttrs('con chó', { loai: 'Con vật' }).chu_dau, 'C');
});

test('chọn 6 thuộc tính: Loại + 4 thuộc tính có nghĩa với từ (tối đa 2 cái Có/Không) + cột khoá Chữ cái đầu', () => {
  for (let i = 0; i < 30; i++) {
    const ids = chooseAttrs(fullAttrs('nỗi nhớ', DB['nỗi nhớ']));
    assert.equal(ids.length, 6);
    assert.equal(ids[0], 'loai');
    assert.equal(ids[5], 'chu_dau');
    assert.equal(new Set(ids).size, 6);
    for (const id of ['kich_thuoc', 'mau', 'can_nang', 'so_chan']) assert.ok(!ids.includes(id), id);
    assert.ok(ids.filter((id) => ATTR_BY_ID[id].values[0] === 'Có').length <= 2);
  }
});

test('cột Chữ cái đầu bị khoá: không hiện, không tính điểm; đủ N từ đoán thì mở + báo', async () => {
  const { g } = mk({ modeRotation: 'attr', attrUnlockAfter: 3 });
  await flush();
  assert.equal(g.snapshot().attrs[5].locked, true);
  assert.equal(g.snapshot().attrs[5].unlockIn, 3);
  say(g, 'a', 'cái bàn'); say(g, 'b', 'con chó'); await flush();
  assert.equal(g.snapshot().ranked.find((r) => r.word === 'con chó').cells[5].s, 'hit', 'C = C (vẫn tính, chỉ ẩn)');
  assert.equal(g.snapshot().known[5], null, 'đang khoá thì chưa vào ĐÃ BIẾT');
  const fx = say(g, 'c', 'nỗi nhớ');
  assert.ok(fx.some((e) => e.type === 'wg_attr_unlock'));
  assert.equal(g.snapshot().attrs[5].locked, undefined);
  assert.equal(g.snapshot().known[5], 'C', 'mở khoá: từ đã đoán trúng chữ đầu được ghi nhận');
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
    // Claude trả mã ngắn + số thứ tự; số lạ (99) thành null, -1 = không áp dụng
    const items = words.map((w) => ({ w, ...Object.fromEntries(ATTRS.filter((a) => !a.text).map((a) => [CODE[a.id], a.id === 'mau' ? [] : a.id === 'gia' ? 99 : a.id === 'nhiet' ? -1 : 1])) }));
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ items }) }] };
  } } } };
  const s = new AttrStore({ client, batchMs: 5 });
  const [a, b] = await Promise.all([s.get('Con Mèo'), s.get('cái bàn')]);
  assert.equal(calls.length, 1);
  assert.equal(a.loai, 'Con vật');
  assert.equal(a.mau, null);
  assert.equal(b.song, 'Không');
  assert.equal(a.gia, null, 'số lạ → null');
  assert.equal(a.nhiet, null, '-1 → không áp dụng');
  // gọi rẻ: Haiku, không gửi tham số fallback, có cache_control cho phần hướng dẫn, schema dùng mã ngắn + số
  assert.equal(calls[0].model, 'claude-haiku-5-5');
  assert.equal(calls[0].betas, undefined);
  assert.equal(calls[0].system[0].cache_control.type, 'ephemeral');
  assert.match(calls[0].system[0].text, /kt: Kích thước: 0=Nhỏ hơn bàn tay, 1=Cỡ cái bàn/);
  assert.equal(calls[0].output_config.format.schema.properties.items.items.properties.kt.type, 'integer');
  assert.ok(s.has('con mèo') && !s.has('con voi'));
  await s.get('con mèo');
  assert.equal(calls.length, 1, 'lấy từ cache');
  assert.match(calls[0].system[0].text, /sc: Số chân/);
});

test('chế độ gợi ý tiếng Anh: 5 gợi ý tiếng Anh mở dần, không có gợi ý chủ đề tiếng Việt, chấm gần nghĩa; lỗi thì quay về gợi ý thường', async () => {
  const en = { available: true, get: async () => ['pet', 'whiskers', 'meow', 'kitten', 'tabby'] };
  const clock = { t: 1 };
  const g = new WordGame({ words: [{ word: 'con mèo', hint: 'Động vật', desc: ['a', 'b'], emoji: '🐱 🐾 🧶' }], modes: ['english'], roundSeconds: 300, cooldownSec: 0 }, { scorer: { score: async () => ({ score: 77, source: 't' }) }, now: () => clock.t, englishStore: en });
  await flush();
  assert.equal(g.mode, 'english');
  assert.equal(g.maxHints, 5);
  g.revealHint(); g.revealHint();
  assert.deepEqual(g.snapshot().hints, ['pet', 'whiskers']);
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
  const client = { beta: { messages: { create: async (req) => { calls.push(req); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ literal: 'child cat!', hints: ['Pet!', 'pet', 'con mèo cute', 'whiskers', 'meow', 'kitten', 'tabby', 'yarn'] }) }] }; } } } };
  const s = new EnglishHintStore({ client });
  const h = await s.get('Con Mèo');
  assert.deepEqual(h, ['WBW:child cat', 'Pet', 'whiskers', 'meow', 'kitten'], 'gợi ý đầu = dịch từng chữ, 4 gợi ý mô tả');
  assert.match(calls[0].system, /cụm mô tả/);
  assert.match(calls[0].system, /candy high coin/);
  await s.get('con mèo');
  assert.equal(calls.length, 1, 'lấy từ cache');
  assert.equal(await new EnglishHintStore({}).get('x'), null, 'không có client → null');
});

test('chế độ tiếng Anh: hệ thống chỉ tự mở 3 từ; đủ 2000 tim mở thêm từ (tối đa 5), hết từ thì 1000 tim lộ 1 chữ', async () => {
  const en = { available: true, get: async () => ['pet', 'whiskers', 'meow', 'kitten', 'tabby'] };
  const clock = { t: 1 };
  const g = new WordGame({ words: [{ word: 'con mèo', hint: 'Động vật' }], modes: ['english'], roundSeconds: 300, cooldownSec: 0 }, { scorer: { score: async () => ({ score: 5 }) }, now: () => clock.t, englishStore: en });
  await flush();
  clock.t += 299_000; g.tick(); g.tick(); g.tick(); g.tick();
  assert.equal(g.hintLevel, 3, 'hết giờ cũng chỉ tự mở 3 từ');
  assert.equal(g.snapshot().unlocks[0].label, '2.000 tim = thêm 1 từ tiếng Anh');
  let fx = g.handle({ type: 'like', count: 1999 });
  assert.equal(g.hintLevel, 3);
  fx = g.handle({ type: 'like', count: 1 });
  assert.equal(g.hintLevel, 4);
  assert.ok(fx.some((e) => e.type === 'wg_unlock' && e.likes && e.action === 'hint' && e.hint === 'kitten'));
  g.handle({ type: 'like', count: 2000 });
  assert.deepEqual(g.snapshot().hints.at(-1), 'tabby');
  assert.equal(g.hintLevel, 5);
  // đủ 5 từ: tim quay về lộ chữ cái, 1000 tim / chữ
  assert.equal(g.snapshot().unlocks[0].label, '1.000 tim = 1 chữ');
  fx = g.handle({ type: 'like', count: 999 });
  assert.equal(g.revealedIdx.size, 0);
  fx = g.handle({ type: 'like', count: 1 });
  assert.ok(fx.some((e) => e.type === 'wg_unlock' && e.action === 'letter' && e.likes));
  assert.equal(g.revealedIdx.size, 1);
});

test('kho từ soạn sẵn: vòng thuộc tính / tiếng Anh lấy từ kho của chế độ, có sẵn thuộc tính / gợi ý, không gọi Claude cho từ bí mật; hết kho thì về kho thường', async () => {
  const fs = await import('node:fs');
  const attrWords = JSON.parse(fs.readFileSync(new URL('../games/doantu/data/attr.json', import.meta.url))).words;
  const enWords = JSON.parse(fs.readFileSync(new URL('../games/doantu/data/english.json', import.meta.url))).words;
  assert.ok(attrWords.length >= 200 && enWords.length >= 200);
  for (const w of attrWords) for (const a of ATTRS.filter((x) => !x.text)) { const v = w.attrs[a.id]; assert.ok(v === null || (a.multi ? v.every((x) => a.values.includes(x)) : a.values.includes(v)), `${w.word}.${a.id}`); }
  for (const w of enWords) assert.ok(w.en.length >= 4, w.word);
  let calls = 0;
  const store = { available: true, get: async () => { calls++; return null; } };
  const g = new WordGame({ words: [{ word: 'con mèo', hint: 'Động vật' }], modes: ['attr', 'english'], alternateEvery: 1, cooldownSec: 0 },
    { scorer: { score: async () => ({ score: 1 }) }, attrStore: store, englishStore: store, modeWords: { attr: attrWords.slice(0, 1), english: enWords.slice(0, 1) } });
  assert.equal(g.mode, 'attr');
  assert.equal(g.display, attrWords[0].word);
  assert.equal(g.roundAttrs.length, 6);
  assert.equal(g.snapshot().hints.length, 0);
  g.startRound();
  assert.equal(g.mode, 'english');
  assert.equal(g.display, enWords[0].word);
  assert.deepEqual(g.englishHints, orderEnglish(enWords[0].en));
  await flush();
  assert.equal(calls, 0, 'không gọi Claude cho từ bí mật');
  assert.deepEqual(g.modeWordStats(), { attr: { total: 1, left: 0 }, english: { total: 1, left: 0 } });
  g.startRound();
  assert.equal(g.display, 'con mèo', 'hết kho → kho thường');
});

test('EnglishHintStore: gợi ý soạn tay đè bản cũ; file lưu theo phiên bản prompt cũ thì bỏ, soạn lại', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const { EnglishHintStore } = await import('../server/englishhints.js');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'en-')), 'en.json');
  fs.writeFileSync(f, JSON.stringify({ 'con mèo': ['celestial', 'feline'] })); // định dạng cũ
  const s = new EnglishHintStore({ filePath: f });
  assert.equal(await s.get('con mèo'), null, 'bỏ gợi ý cũ');
  s.seed([{ word: 'con mèo', en: ['small pet', 'says meow', 'likes fish', 'sleeps a lot', 'Tom and Jerry'] }]);
  assert.equal((await s.get('con mèo'))[0], 'small pet');
  s.dirty = true; s.save();
  assert.equal((await new EnglishHintStore({ filePath: f }).get('con mèo'))[1], 'says meow', 'lưu + đọc lại đúng phiên bản');
});

test('cờ quốc gia trong gợi ý (Windows hiện thành chữ VN / KR) được đổi sang emoji thường', async () => {
  const { noFlags } = await import('../server/wordgame.js');
  assert.equal(noFlags('👘 🇻🇳 👗'), '👘 ⭐ 👗');
  assert.equal(noFlags('🇰🇷 🎤 💃'), '🌏 🎤 💃');
  const g = new WordGame({ words: [{ word: 'kpop', hint: 'Âm nhạc', desc: ['a', 'nhạc Hàn'], emoji: '🇰🇷 🎤 💃' }], modes: ['meaning'], cooldownSec: 0 }, { scorer: { score: async () => ({ score: 1 }) } });
  g.revealHint();
  assert.equal(g.snapshot().hints[0], '🌏 🎤 💃');
  assert.ok(!/[\u{1F1E6}-\u{1F1FF}]/u.test(JSON.stringify(JSON.parse((await import('node:fs')).readFileSync(new URL('../games/doantu/data/attr.json', import.meta.url))))));
});

test('kho chủ đề soạn sẵn (Gần nghĩa): trộn với kho chung, không lặp từ, dùng hết kho soạn sẵn rồi mới nhờ Claude sinh thêm', async () => {
  const fs = await import('node:fs');
  const { WordBank } = await import('../server/wordbank.js');
  const meaning = JSON.parse(fs.readFileSync(new URL('../games/doantu/data/meaning.json', import.meta.url))).words;
  assert.ok(meaning.length >= 170);
  assert.ok(meaning.some((w) => w.word === 'messi' && w.hint === 'Cầu thủ bóng đá'));
  const bank = new WordBank({ fallbackWords: [{ word: 'con mèo', hint: 'Động vật' }, { word: 'cái bàn', hint: 'Đồ vật' }], client: {}, minRemaining: 0, random: () => 0 });
  let gens = 0;
  bank.generate = () => { gens++; return new Promise(() => {}); };
  const curated = meaning.slice(0, 3);
  const g = new WordGame({ words: [], modes: ['meaning'], cooldownSec: 0 }, { scorer: { score: async () => ({ score: 1 }) }, wordBank: bank, modeWords: { meaning: curated }, random: () => 0.9 });
  const played = [g.display];
  for (let i = 0; i < 4; i++) { g.startRound(); played.push(g.display); }
  assert.equal(new Set(played).size, 5, 'không lặp: ' + played.join(', '));
  assert.deepEqual(played.slice(2).sort(), curated.map((w) => w.word).sort(), 'kho chung hết thì lấy hết kho soạn sẵn');
  assert.equal(gens, 0, 'còn từ soạn sẵn thì chưa nhờ Claude sinh thêm');
  g.startRound();
  assert.equal(gens, 1, 'hết sạch mới nhờ Claude sinh thêm');
  // từ soạn sẵn có gợi ý: emoji → chủ đề → mô tả
  const m = new WordGame({ words: [], modes: ['meaning'], cooldownSec: 0 }, { scorer: { score: async () => ({ score: 1 }) }, modeWords: { meaning: [meaning.find((w) => w.word === 'messi')] }, random: () => 0 });
  assert.equal(m.display, 'messi');
  m.revealHint(); m.revealHint(); m.revealHint();
  assert.deepEqual(m.snapshot().hints, ['⚽ 🐐 🏆', 'Chủ đề: Cầu thủ bóng đá', 'Argentina · áo số 10 · vô địch World Cup 2022']);
  assert.ok(m.aliases.includes('cr7') === false && m.aliases.includes('leo messi'));
});

test('chế độ tiếng Anh: gợi ý 1 là mô tả, gợi ý 2 là dịch từng chữ (kẹo cao su → candy high coin); kho soạn sẵn có đủ', async () => {
  const fs = await import('node:fs');
  const words = JSON.parse(fs.readFileSync(new URL('../games/doantu/data/english.json', import.meta.url))).words;
  assert.ok(words.length >= 260);
  for (const w of words) assert.ok(w.en.length >= 4 && w.en.length <= 5, w.word);
  const wbw = (name) => words.find((w) => w.word === name).en[0].startsWith('WBW:');
  assert.ok(wbw('xấu hổ') && wbw('bánh xe'), 'từ thường có dịch từng chữ');
  assert.ok(!wbw('suzuki') && !wbw('hà nội') && !wbw('lý hải') && !wbw('sushi'), 'tên riêng / từ mượn thì không');
  const keo = words.find((w) => w.word === 'kẹo cao su');
  const g = new WordGame({ words: [], modes: ['english'], cooldownSec: 0 }, { scorer: { score: async () => ({ score: 1 }) }, englishStore: { available: true, get: async () => null }, modeWords: { english: [keo] } });
  g.revealHint(); g.revealHint();
  assert.deepEqual(g.snapshot().hints, [keo.en[1], 'Dịch từng chữ: candy high coin'], 'mô tả trước, dịch từng chữ là gợi ý số 2');
  const attr = JSON.parse(fs.readFileSync(new URL('../games/doantu/data/attr.json', import.meta.url))).words;
  assert.ok(attr.length >= 280 && attr.some((w) => w.word === 'trống đồng'));
});

test('tên riêng chỉ có 4 gợi ý mô tả: số gợi ý tối đa theo đúng số gợi ý có', () => {
  const g = new WordGame({ words: [], modes: ['english'], cooldownSec: 0 }, { scorer: { score: async () => ({ score: 1 }) }, englishStore: { available: true, get: async () => null }, modeWords: { english: [{ word: 'suzuki', en: ['from Japan', 'small cars', 'also motorbikes', 'Swift'] }] } });
  assert.equal(g.maxHints, 4);
  for (let i = 0; i < 6; i++) g.revealHint();
  assert.equal(g.snapshot().hints.length, 4);
  assert.equal(g.likeRule().action, 'letter', 'mở hết gợi ý thì tim quay về lộ chữ');
});

test('vòng thuộc tính: chỉ tối đa N từ MỚI mỗi vòng được gửi Claude xếp; từ đã có trong cache không bị tính', async () => {
  const got = [];
  const store = { available: true, has: (w) => w === 'con chó' || w === 'cái bàn', get: async (w) => { got.push(w); return DB[w] || base({ loai: 'Đồ vật' }); } };
  const { g } = mk({ modeRotation: 'attr', attrMaxNewPerRound: 2 }, store);
  await flush();
  for (const w of ['con chó', 'cái bàn', 'xe máy', 'quả táo', 'cây bút']) say(g, w, w);
  await flush(); await flush();
  assert.ok(got.includes('con chó') && got.includes('cái bàn'), 'từ có sẵn trong cache luôn được xếp');
  assert.deepEqual(got.filter((w) => !['con mèo', 'con chó', 'cái bàn'].includes(w)), ['xe máy', 'quả táo'], 'chỉ 2 từ mới');
  assert.equal(g.snapshot().ranked.find((r) => r.word === 'cây bút').cells[0].s, 'na', 'vượt giới hạn: ô nghĩa để trống');
});

test('cache thuộc tính soạn sẵn trong repo: đủ 24 thuộc tính, giá trị hợp lệ, nạp vào AttrStore thì không gọi Claude', async () => {
  const fs = await import('node:fs');
  const pre = JSON.parse(fs.readFileSync(new URL('../games/doantu/data/attr-cache.json', import.meta.url))).words;
  const entries = Object.entries(pre);
  assert.ok(entries.length >= 600);
  for (const [w, a] of entries) for (const at of ATTRS.filter((x) => !x.text)) {
    const v = a[at.id];
    assert.ok(at.id in a, `${w} thiếu ${at.id}`);
    assert.ok(v === null || (at.multi ? v.every((x) => at.values.includes(x)) : at.values.includes(v)), `${w}.${at.id}=${v}`);
  }
  let calls = 0;
  const s = new AttrStore({ client: { beta: { messages: { create: async () => { calls++; throw new Error('không được gọi'); } } } }, batchMs: 1 });
  s.seed(entries.map(([word, attrs]) => ({ word, attrs })));
  assert.equal((await s.get('con mèo')).loai, 'Con vật');
  assert.equal((await s.get('Bánh Chưng')).le_tet, 'Có');
  assert.ok(s.has('xe máy'));
  assert.equal(calls, 0);
});

test('orderEnglish: dịch từng chữ chuyển xuống gợi ý số 2; tên riêng (không có dịch) giữ nguyên', () => {
  assert.deepEqual(orderEnglish(['WBW:candy high coin', 'a', 'b', 'c', 'd']), ['a', 'WBW:candy high coin', 'b', 'c', 'd']);
  assert.deepEqual(orderEnglish(['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd']);
});

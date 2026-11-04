import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { WordGame, parseGuess } from '../server/wordgame.js';
import { ClaudeScorer, simpleScore, isExact } from '../server/scorer.js';

const u = (id) => ({ id, name: id, avatar: null });
const fakeScorer = (table) => ({ calls: [], score(secret, word) { this.calls.push(word); return Promise.resolve({ score: table[word] ?? 5, source: 'fake' }); } });
const flush = () => new Promise((r) => setImmediate(r));
const mk = (scorer, now = () => 0, cfg = {}) => new WordGame({ words: [{ word: 'mặt trời', hint: 'Thiên nhiên' }], cooldownSec: 2, ...cfg }, { scorer, now });

test('parseGuess: nhận từ ngắn, bỏ câu dài / link / emoji', () => {
  assert.equal(parseGuess('  Mặt TRĂNG!! 🌙 '), 'mặt trăng');
  assert.equal(parseGuess('hôm nay trời đẹp quá ta ơi'), null);
  assert.equal(parseGuess('https://abc.com'), null);
  assert.equal(parseGuess('😂😂'), null);
  assert.equal(parseGuess('123'), null);
});

test('đoán trúng (kể cả không dấu) thì thắng vòng 100 điểm', () => {
  const g = mk(fakeScorer({}));
  const fx = g.handle({ type: 'comment', user: u('a'), text: 'mat troi' });
  assert.equal(fx[0].type, 'wg_win');
  assert.equal(g.snapshot().secret, 'mặt trời');
  assert.equal(g.snapshot().ranked[0].score, 100);
  assert.equal(g.snapshot().champions[0].wins, 1);
});

test('từ đoán được chấm bất đồng bộ, xếp hạng theo điểm, từ trùng không chấm lại', async () => {
  const sc = fakeScorer({ 'mặt trăng': 72, 'nắng': 85, 'con mèo': 3 });
  let now = 0;
  const g = mk(sc, () => now);
  const got = [];
  g.on('effects', (fx) => got.push(...fx));
  g.handle({ type: 'comment', user: u('a'), text: 'mặt trăng' });
  g.handle({ type: 'comment', user: u('b'), text: 'Nắng' });
  g.handle({ type: 'comment', user: u('c'), text: 'con mèo' });
  assert.equal(g.snapshot().ranked.length, 0, 'đang chờ chấm');
  await flush();
  assert.deepEqual(g.snapshot().ranked.map((r) => [r.word, r.score]), [['nắng', 85], ['mặt trăng', 72], ['con mèo', 3]]);
  assert.equal(got.filter((e) => e.type === 'wg_scored').length, 3);
  now = 5000;
  const dup = g.handle({ type: 'comment', user: u('d'), text: 'nắng' });
  assert.equal(dup[0].dup, true);
  assert.equal(dup[0].score, 85);
  assert.equal(sc.calls.length, 3, 'không gọi chấm lại');
});

test('cooldown mỗi người', () => {
  let now = 0;
  const g = mk(fakeScorer({}), () => now);
  assert.equal(g.handle({ type: 'comment', user: u('a'), text: 'nắng' }).length, 1);
  assert.equal(g.handle({ type: 'comment', user: u('a'), text: 'mưa' }).length, 0);
  now = 2500;
  assert.equal(g.handle({ type: 'comment', user: u('a'), text: 'mưa' }).length, 1);
});

test('gợi ý theo thời gian và theo quà; hết giờ lộ từ, sang vòng mới', () => {
  let now = 0;
  const g = mk(fakeScorer({}), () => now, { hintAtSeconds: [60, 120, 180], roundSeconds: 300, breakSeconds: 10 });
  assert.deepEqual(g.snapshot().pattern, [3, 4]);
  assert.equal(g.snapshot().secret, null);
  const fx = g.handle({ type: 'gift', user: u('a'), diamonds: 10 });
  assert.equal(fx[0].type, 'wg_unlock');
  assert.equal(fx.find((e) => e.type === 'wg_hint').hint, 'Chủ đề: Thiên nhiên');
  assert.equal(g.handle({ type: 'gift', user: u('a'), diamonds: 1 }).filter((e) => e.type !== 'wg_thanks').length, 0, 'quà nhỏ không mở gợi ý');
  now = 121_000;
  assert.equal(g.tick()[0].hint, 'Chữ đầu: M… T…');
  now = 181_000;
  assert.equal(g.tick()[0].hint, 'Lộ chữ: mặt ___');
  now = 301_000;
  assert.equal(g.tick()[0].type, 'wg_timeout');
  assert.equal(g.snapshot().secret, 'mặt trời');
  now = 312_000;
  assert.equal(g.tick()[0].type, 'wg_start');
});

test('ClaudeScorer: gom lô, cache, kẹp điểm 1..99, lỗi API thì chấm đơn giản', async () => {
  const requests = [];
  const client = { beta: { messages: { create: async (req) => {
    requests.push(req);
    const words = JSON.parse(req.messages[0].content.split('TỪ ĐOÁN: ')[1]);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ scores: words.map((w) => ({ word: w, score: w === 'nắng' ? 150 : 40 })) }) }] };
  } } } };
  const s = new ClaudeScorer({ client, batchMs: 5 });
  const [a, b] = await Promise.all([s.score('mặt trời', 'nắng'), s.score('mặt trời', 'Bầu Trời')]);
  assert.equal(requests.length, 1, 'một lô');
  assert.equal(requests[0].model, 'claude-opus-5-5');
  assert.equal(a.score, 99);
  assert.equal(b.score, 40);
  assert.equal((await s.score('mặt trời', 'nắng')).source, 'cache');
  assert.equal(requests.length, 1);
  const bad = new ClaudeScorer({ client: { beta: { messages: { create: async () => { throw new Error('down'); } } } }, batchMs: 5, log: {} });
  const r = await bad.score('mặt trời', 'trời');
  assert.equal(r.source, 'simple');
  assert.ok(r.score >= 1 && r.score <= 99);
});

test('simpleScore / isExact', () => {
  assert.ok(isExact('Mat Troi', 'mặt trời'));
  assert.ok(simpleScore('mặt trời', 'ông mặt trời') > simpleScore('mặt trời', 'con mèo'));
});

test('lastReject: nêu lý do bỏ qua bình luận', () => {
  let now = 0;
  const g = mk(fakeScorer({}), () => now);
  g.handle({ type: 'comment', user: u('a'), text: 'hôm nay trời đẹp quá ta ơi' });
  assert.match(g.lastReject, /tối đa 4 tiếng/);
  g.handle({ type: 'comment', user: u('a'), text: 'nắng' });
  assert.equal(g.lastReject, null);
  g.handle({ type: 'comment', user: u('a'), text: 'mưa' });
  assert.match(g.lastReject, /2 giây/);
});

test('quà mở khoá: hoa hồng gom 5 = 1 chữ, tim tay = 1 chữ, 10 xu = gợi ý, 30 xu = +60s, 99 xu = 1 tiếng', () => {
  let now = 0;
  const g = mk(fakeScorer({}), () => now, { roundSeconds: 300 });
  // bỏ hiệu ứng cảm ơn (luôn có) để chỉ kiểm tra phần mở khoá
  const gift = (giftName, diamonds, repeatCount = 1) => g.handle({ type: 'gift', user: u('a'), giftName, diamonds, repeatCount }).filter((e) => e.type !== 'wg_thanks');
  const shown = () => g.snapshot().letters.flat().filter(Boolean).length;
  // 4 bông: chỉ tăng tiến độ
  for (let i = 0; i < 4; i++) assert.equal(gift('Rose', 1)[0].type, 'wg_progress');
  assert.equal(g.snapshot().unlocks.find((x) => x.id === 'rose').count, 4);
  assert.equal(shown(), 0);
  // bông thứ 5: lộ 1 chữ
  const fx = gift('Rose', 1);
  assert.equal(fx[0].type, 'wg_unlock'); assert.equal(fx[0].action, 'letter');
  assert.equal(shown(), 1);
  assert.equal(g.snapshot().unlocks.find((x) => x.id === 'rose').count, 0);
  // combo 10 bông = 2 chữ
  assert.equal(gift('Rose', 1, 10).length, 2);
  assert.equal(shown(), 3);
  // tim tay: 1 chữ ngay
  assert.equal(gift('Finger Heart', 5)[0].action, 'letter');
  assert.equal(shown(), 4);
  // 20 xu: gợi ý
  assert.ok(gift('Perfume', 20).some((e) => e.type === 'wg_hint'));
  assert.equal(g.hintLevel, 1);
  // 30 xu: +60 giây
  const before = g.endsAt; now = 100_000;
  gift('Doughnut', 30);
  assert.equal(g.endsAt, before + 60_000);
  // 99+ xu: lộ cả một tiếng nhưng luôn chừa ít nhất 1 chữ
  gift('Hand Hearts', 100); gift('Hand Hearts', 100); gift('Hand Hearts', 100);
  assert.equal(shown(), 6, 'mặt trời có 7 chữ cái → chừa lại 1');
  assert.deepEqual(gift('Finger Heart', 5), [], 'không lộ chữ cuối cùng');
  // quà 1 xu không có trong danh sách tên: không mở gì
  assert.deepEqual(gift('Unknown', 1), []);
});

test('quà mở khoá: vòng mới thì xoá chữ đã lộ và tiến độ', () => {
  let now = 0;
  const g = mk(fakeScorer({}), () => now, { breakSeconds: 1 });
  g.handle({ type: 'gift', user: u('a'), giftName: 'Finger Heart', diamonds: 5 });
  g.handle({ type: 'gift', user: u('a'), giftName: 'Rose', diamonds: 1 });
  g.skip(); now = 2000; g.tick();
  assert.equal(g.snapshot().letters.flat().filter(Boolean).length, 0);
  assert.equal(g.snapshot().unlocks.find((x) => x.id === 'rose').count, 0);
});

test('bộ từ riêng (tướng LMHT): gợi ý riêng, biệt danh, tên có dấu nháy, ngữ cảnh chấm điểm', async () => {
  const sets = { lmht: JSON.parse(fs.readFileSync(new URL('../wordsets/lmht.json', import.meta.url))) };
  assert.ok(sets.lmht.words.length >= 90);
  const calls = [];
  const scorer = { score: (s, w, ctx) => { calls.push({ s, w, ctx }); return Promise.resolve({ score: 60 }); } };
  let now = 0;
  const g = new WordGame({ roundSeconds: 300, cooldownSec: 0 }, { scorer, wordSets: sets, now: () => now });
  assert.equal(g.activeSet, 'tu-vung');
  g.setWordSet('lmht');
  g.startRound(sets.lmht.words.find((w) => w.word === "Kai'Sa"));
  const snap = g.snapshot();
  assert.equal(snap.title, 'Đoán tướng LMHT');
  assert.equal(snap.secretLabel, 'TƯỚNG BÍ MẬT');
  assert.deepEqual(snap.pattern, [3, 2], "Kai'Sa → 2 nhóm ô");
  assert.equal(snap.maxHints, 5);
  // gợi ý riêng mở dần theo thời gian
  now = 50_000; g.tick();
  assert.deepEqual(g.snapshot().hints, ['Đến từ Hư Không']);
  // đoán sai thì chấm kèm ngữ cảnh LMHT
  g.handle({ type: 'comment', user: u('a'), text: 'hư không' });
  await flush();
  assert.equal(calls[0].ctx.id, 'lmht');
  assert.match(calls[0].ctx.prompt, /Liên Minh Huyền Thoại/);
  // gõ liền không dấu nháy vẫn trúng
  const win = g.handle({ type: 'comment', user: u('b'), text: 'kaisa' });
  assert.equal(win[0].type, 'wg_win');
  assert.equal(win[0].answer, "Kai'Sa");
});

test('biệt danh tính là trúng (mf = Miss Fortune), đổi bộ không tồn tại thì báo lỗi', () => {
  const sets = { lmht: JSON.parse(fs.readFileSync(new URL('../wordsets/lmht.json', import.meta.url))) };
  const g = new WordGame({}, { scorer: fakeScorer({}), wordSets: sets });
  g.setWordSet('lmht');
  g.startRound(sets.lmht.words.find((w) => w.word === 'Miss Fortune'));
  assert.equal(g.handle({ type: 'comment', user: u('a'), text: 'MF' })[0].type, 'wg_win');
  assert.throws(() => g.setWordSet('khong-co'), /Không có bộ từ/);
  assert.deepEqual(g.listSets().map((s) => s.id), ['tu-vung', 'lmht']);
});

test('đoán bỏ từ chỉ loại vẫn trúng: "chó" = "con chó", "xương rồng" = "cây xương rồng"', () => {
  assert.ok(isExact('chó', 'con chó'));
  assert.ok(isExact('trái chuối', 'quả chuối'));
  assert.ok(isExact('xương rồng', 'cây xương rồng'));
  assert.ok(!isExact('con', 'con chó'));
  assert.ok(!isExact('mèo', 'con chó'));
});

test('config.json: danh sách từ vựng ≥ 350 từ hợp lệ, không trùng, có 2 gợi ý từ liên quan + emoji không lộ đáp án', async () => {
  const { validWord } = await import('../server/wordbank.js');
  const { compact } = await import('../server/scorer.js');
  const words = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).wordgame.words;
  const { cleanDesc, cleanEmoji } = await import('../server/wordbank.js');
  assert.ok(words.length >= 350);
  assert.equal(new Set(words.map((w) => compact(w.word))).size, words.length);
  for (const w of words) {
    assert.ok(validWord(w.word), w.word);
    assert.ok(!compact(w.hint).includes(compact(w.word)), `${w.word} / ${w.hint}`);
    // 2 gợi ý từ liên quan, không lộ chữ nào của đáp án; emoji đủ 3 hoặc để trống
    assert.equal(cleanDesc(w.word, w.desc).length, 2, `gợi ý lộ đáp án: ${w.word}`);
    assert.ok(w.emoji === '' || cleanEmoji(w.emoji) === w.emoji, `emoji: ${w.word}`);
  }
});

test('quà nào cũng có hiệu ứng cảm ơn đích danh, kể cả lúc nghỉ giữa vòng', () => {
  const g = mk(fakeScorer({}));
  let fx = g.handle({ type: 'gift', user: { id: 'x', name: 'Lan Chi', avatar: 'a.png' }, giftName: 'Rose', diamonds: 1, repeatCount: 7 });
  const t = fx.find((e) => e.type === 'wg_thanks');
  assert.deepEqual(t.by, { id: 'x', name: 'Lan Chi', avatar: 'a.png' });
  assert.equal(t.repeat, 7); assert.equal(t.diamonds, 7); assert.equal(t.giftName, 'Rose');
  g.skip(); // kết thúc vòng → đang nghỉ
  fx = g.handle({ type: 'gift', user: u('b'), giftName: 'Doughnut', diamonds: 30 });
  assert.deepEqual(fx.map((e) => e.type), ['wg_thanks']);
  assert.deepEqual(g.handle({ type: 'like', user: u('b'), count: 5 }), []);
});

test('từ vựng có 2 câu mô tả + 3 emoji: gợi ý 1, 2 là mô tả, gợi ý 3 là emoji; không có emoji thì chỉ 2 gợi ý', () => {
  const g = mk(fakeScorer({}));
  g.startRound({ word: 'ống nhòm', hint: 'Đồ vật', desc: ['rừng · chim · đi phượt', 'nhìn xa · kính · hai mắt'], emoji: '👀 🦅 ⛰️' });
  assert.equal(g.maxHints, 3);
  g.revealHint(); g.revealHint(); g.revealHint();
  assert.deepEqual(g.snapshot().hints, ['rừng · chim · đi phượt', 'nhìn xa · kính · hai mắt', '👀 🦅 ⛰️']);
  g.startRound({ word: 'ký ức', hint: 'Khái niệm', desc: ['Thứ ai cũng mang theo mà không thấy', 'Nhớ về ngày xưa'], emoji: '' });
  assert.equal(g.maxHints, 2);
  // từ cũ chưa có mô tả: vẫn gợi ý kiểu cũ (chủ đề → chữ đầu → lộ chữ)
  g.startRound({ word: 'con mèo', hint: 'Động vật' });
  g.revealHint();
  assert.deepEqual(g.snapshot().hints, ['Chủ đề: Động vật']);
});

test('wordsets/: mọi bộ có sẵn hợp lệ — tên từ đúng dạng, không trùng, gợi ý không lộ đáp án / biệt danh', async () => {
  const { validSecretName, cleanHints } = await import('../server/setgen.js');
  const { compact } = await import('../server/scorer.js');
  const dir = new URL('../wordsets/', import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(files.includes('trend-mxh.json'));
  for (const f of files) {
    const set = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    assert.ok(set.title && set.words.length >= 20, f);
    assert.equal(new Set(set.words.map((w) => compact(w.word))).size, set.words.length, `${f}: trùng từ`);
    for (const w of set.words) {
      assert.ok(validSecretName(w.word), `${f}: ${w.word}`);
      const text = w.hints.filter((h) => /\p{L}/u.test(h)); // bỏ dòng emoji
      assert.equal(cleanHints(w.word, w.aliases || [], text).length, text.length, `${f}: gợi ý lộ đáp án ở "${w.word}"`);
    }
  }
});

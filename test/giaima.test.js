import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildPuzzle, letterKey, letterSet, splitWords } from '../server/giaima.js';
import { WordGame } from '../server/wordgame.js';

const BANK = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'games', 'doantu', 'data', 'giaima.json'), 'utf8'));

/** rng cố định để test lặp lại được */
function seeded(seed = 1) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

const PHRASE = 'Ăn quả nhớ kẻ trồng cây';
const MINI = {
  phrases: [{ text: PHRASE, kind: 'Tục ngữ', meaning: 'Biết ơn người làm ra thành quả' }],
  clues: [
    { q: 'Gáy ò ó o', a: 'gà', e: '🐓', lang: 'vi' },
    { q: 'Bạn nhà nông', a: 'trâu', e: '🐃', lang: 'vi' },
    { q: 'Ngôi nhà', a: 'nhà', e: '🏠', lang: 'vi' },
    { q: 'Hòn đá', a: 'rock', e: '🪨', lang: 'en' },
    { q: 'Chìa khóa', a: 'key', e: '🔑', lang: 'en' },
    { q: 'Con chó', a: 'chó', e: '🐶', lang: 'vi' },
    { q: 'Ngủ', a: 'ngủ', e: '😴', lang: 'vi' },
    { q: 'Bánh kem', a: 'cake', e: '🎂', lang: 'en' },
  ],
};
const u = (id) => ({ id, name: id, avatar: null });
const say = (g, id, text) => g.handle({ type: 'comment', user: u(id), text });
const scorer = { score: async () => ({ score: 1, source: 't' }) };

function game(cfg = {}, opts = {}) {
  const clock = { t: 1_000_000 };
  const g = new WordGame({ words: [{ word: 'con mèo', hint: 'Động vật' }], modes: ['giaima'], cooldownSec: 0, ...cfg },
    { scorer, now: () => clock.t, random: seeded(7), modeWords: { giaima: MINI }, ...opts });
  return { g, clock };
}

test('letterKey / splitWords: chữ có dấu quy về chữ gốc, Đ = D, bỏ dấu câu', () => {
  assert.equal(letterKey('Ă'), 'A');
  assert.equal(letterKey('ộ'), 'O');
  assert.equal(letterKey('đ'), 'D');
  assert.equal(letterKey(','), null);
  assert.deepEqual([...letterSet('Đi đâu')].sort(), ['A', 'D', 'I', 'U']);
  assert.deepEqual(splitWords('Ăn quả, nhớ!'), [['Ă', 'n'], ['q', 'u', 'ả'], ['n', 'h', 'ớ']]);
});

test('kho thật (mẫu 40 câu): mọi câu đều chọn được 2–6 gợi ý, chữ của gợi ý nằm trong câu; câu ≥ 9 chữ cái chừa 2–3 chữ, câu ngắn chừa 1–2', () => {
  const kinds = new Set(BANK.phrases.map((p) => p.kind));
  for (const k of ['Tục ngữ', 'Câu nói nổi tiếng', 'Slogan thương hiệu', 'Họ tên người nổi tiếng']) assert.ok(kinds.has(k), `thiếu loại câu: ${k}`);
  for (const p of BANK.phrases.filter((_, i) => i % Math.ceil(BANK.phrases.length / 40) === 0)) { // lấy mẫu cho nhanh
    const r = buildPuzzle(p, BANK.clues, { rng: seeded(p.text.length) });
    assert.ok(r, `không đủ gợi ý cho: ${p.text}`);
    const L = letterSet(p.text);
    for (const c of r.clues) for (const l of letterSet(c.a)) assert.ok(L.has(l), `${c.a} có chữ ${l} không có trong "${p.text}"`);
    assert.ok(r.clues.length >= 2 && r.clues.length <= 6, `${p.text}: ${r.clues.length} gợi ý`);
    const [lo, hi] = L.size >= 9 ? [2, 3] : [1, 2];
    assert.ok(r.hidden.length >= lo && r.hidden.length <= hi, `${p.text}: chừa ${r.hidden.length} chữ`);
    const covered = new Set(r.clues.flatMap((c) => [...letterSet(c.a)]));
    assert.deepEqual([...L].filter((l) => !covered.has(l)).sort(), [...r.hidden].sort());
  }
  for (const c of BANK.clues) {
    assert.ok(c.q && c.a && c.e, `gợi ý thiếu trường: ${JSON.stringify(c)}`);
    assert.ok(['vi', 'en'].includes(c.lang), `lang sai: ${c.a}`);
  }
  // mỗi số đúng 1 chữ, khác chữ khác số
  const pz = buildPuzzle(BANK.phrases[0], BANK.clues, { rng: seeded(3) });
  const nums = Object.values(pz.code);
  assert.equal(new Set(nums).size, nums.length);
  assert.deepEqual([...nums].sort((a, b) => a - b), nums.map((_, i) => i + 1));
});

test('luân phiên: Giải mã là 1 kiểu trong vòng luân phiên; thiếu kho hoặc đang chơi bộ riêng thì bỏ qua', () => {
  const clock = { t: 1 };
  const g = new WordGame({ words: [{ word: 'con mèo' }], modes: ['meaning', 'giaima'], alternateEvery: 1, cooldownSec: 0 }, { scorer, now: () => clock.t, modeWords: { giaima: BANK } });
  const modes = [g.mode];
  for (let i = 0; i < 3; i++) { g.skip(); g.skip(); modes.push(g.mode); }
  assert.deepEqual(modes, ['meaning', 'giaima', 'meaning', 'giaima']);
  assert.ok(g.modeWordStats().giaima.total >= 70);
  const noBank = new WordGame({ words: [{ word: 'con mèo' }], modes: ['giaima'], cooldownSec: 0 }, { scorer, now: () => clock.t });
  assert.equal(noBank.mode, 'meaning');
  const inSet = new WordGame({ words: [], modes: ['giaima'], activeSet: 'lmht', cooldownSec: 0 }, { scorer, now: () => clock.t, modeWords: { giaima: BANK }, wordSets: { lmht: { title: 'LMHT', words: [{ word: 'ezreal' }] } } });
  assert.equal(inSet.mode, 'meaning');
  assert.deepEqual(g.applySettings({ modes: ['giaima', 'xyz'] }).modes, ['giaima']); // admin bật riêng Giải mã
});

test('vòng Giải mã: cùng chữ cùng số, màn hình không lộ chữ chưa mở, không lộ đáp án', () => {
  const { g } = game();
  assert.equal(g.mode, 'giaima');
  const s = g.snapshot();
  assert.equal(s.gm.kind, 'Tục ngữ');
  assert.deepEqual(s.hints, []);
  const flat = s.gm.words.flat();
  assert.ok(flat.every((c) => c.ch === null && c.n >= 1));
  const seen = new Map();
  splitWords(PHRASE).flat().forEach((ch, i) => {
    const k = letterKey(ch);
    if (seen.has(k)) assert.equal(seen.get(k), flat[i].n); else seen.set(k, flat[i].n);
  });
  assert.equal(new Set(seen.values()).size, seen.size);
  assert.equal(s.secret, null);
  assert.ok(!JSON.stringify(s).includes('nhớ'), 'snapshot không được chứa đáp án');
  assert.ok(s.gm.clues.length >= 2);
  assert.ok(s.gm.clues.every((c) => c.q && c.e === null && ['vi', 'en'].includes(c.lang)), 'emoji ẩn lúc đầu (hay lộ đáp án)');
  say(g, 'lan', g.gm.clues[0].a);
  assert.equal(g.snapshot().gm.clues[0].e, g.gm.clues[0].e, 'giải xong thì hiện emoji');
});

test('giải gợi ý → lộ chữ ở mọi ô cùng số; đoán sai hiện lên "vừa đoán" không chấm điểm; đoán cả câu → thắng + điểm tuần', () => {
  const awards = [];
  const weekly = { award: (by, r) => { awards.push({ by, r }); return { total: 180, base: 100, speed: 80 }; }, addBonus: () => ({ add: 0, total: 0 }), snapshot: () => null };
  let scored = 0;
  const { g, clock } = game({}, { weekly, scorer: { score: async () => { scored++; return { score: 1 }; } } });
  const c0 = g.gm.clues[0];
  const fx = say(g, 'lan', c0.a.toUpperCase());
  assert.equal(fx[0].type, 'wg_gm_clue');
  assert.equal(fx[0].by.name, 'lan');
  assert.ok(fx[0].nums.length >= 1);
  const s = g.snapshot();
  assert.equal(s.gm.clues[0].solvedBy.name, 'lan');
  const opened = s.gm.words.flat().filter((c) => c.ch);
  assert.ok(opened.length > 0);
  for (const c of opened) assert.equal(c.n, g.gm.code[letterKey(c.ch)]);
  // ô cùng số trong gợi ý khác cũng lộ
  for (const cl of s.gm.clues) for (const cell of cl.cells.flat()) if (fx[0].nums.includes(cell.n)) assert.ok(cell.ch);
  // đoán lại đáp án đã giải: không tính nữa, thành đoán sai
  assert.equal(say(g, 'minh', c0.a)[0].type, 'wg_guess');
  const wrong = say(g, 'minh', 'con bò');
  assert.equal(wrong[0].type, 'wg_guess');
  assert.equal(wrong[0].gm, true);
  assert.equal(g.snapshot().feed[0].word, 'con bò');
  assert.equal(scored, 0, 'kiểu Giải mã không gọi bộ chấm điểm (không tốn token)');
  clock.t += 30_000;
  const win = say(g, 'minh', 'đáp án là an qua nho ke trong cay');
  assert.equal(win[0].type, 'wg_win');
  assert.equal(win[0].answer, PHRASE);
  assert.equal(awards.length, 1);
  const end = g.snapshot();
  assert.equal(end.phase, 'ended');
  assert.ok(end.gm.words.flat().every((c) => c.ch));
  assert.equal(end.gm.meaning, 'Biết ơn người làm ra thành quả');
});

test('quà / tim trong vòng Giải mã: 5 hoa hồng = 1 chữ, 10 xu = giải hộ 1 gợi ý, 99 xu = 3 chữ, 1000 tim = 1 chữ; luôn chừa 1 chữ', () => {
  const { g } = game();
  const gift = (giftName, diamonds, repeatCount = 1) => g.handle({ type: 'gift', user: u('an'), giftName, diamonds, repeatCount });
  assert.equal(gift('Rose', 1, 3).find((e) => e.type === 'wg_progress').count, 3);
  assert.equal(g.gm.revealed.size, 0);
  const rose = gift('Rose', 1, 2).find((e) => e.type === 'wg_unlock');
  assert.equal(rose.gm.nums.length, 1);
  assert.equal(g.gm.revealed.size, 1);
  const clue = gift('Doughnut', 10).find((e) => e.type === 'wg_unlock');
  assert.ok(clue.gm.clue);
  assert.equal(g.gm.clues[clue.gm.clue.idx].via, 'gift');
  const before = g.gm.revealed.size;
  const big = gift('Lion', 99).find((e) => e.type === 'wg_unlock');
  assert.ok(big.gm.nums.length >= 1 && big.gm.nums.length <= 3);
  assert.equal(g.gm.revealed.size, before + big.gm.nums.length);
  const likes = g.handle({ type: 'like', user: u('b'), count: 1000 }).find((e) => e.type === 'wg_unlock');
  if (likes) assert.equal(likes.gm.nums.length, 1);
  for (let i = 0; i < 40; i++) gift('Finger Heart', 5);
  assert.equal(g.gmHiddenLetters().length, 1);
  assert.equal(g.phase, 'playing');
});

test('hệ thống tự lộ chữ ở các mốc giờ; hết giờ lộ cả câu', () => {
  const { g, clock } = game();
  assert.equal(g.snapshot().nextHintIn, 120);
  clock.t += 120_000;
  const h = g.tick();
  assert.equal(h[0].type, 'wg_hint');
  assert.equal(h[0].gm.nums.length, 1);
  assert.equal(g.gm.revealed.size, 1);
  assert.ok(g.snapshot().gm.clues.every((c) => c.e), 'sau lần tự lộ chữ đầu tiên thì hiện emoji của mọi gợi ý');
  clock.t += 200_000;
  const out = g.tick();
  assert.equal(out[0].type, 'wg_timeout');
  assert.ok(g.snapshot().gm.words.flat().every((c) => c.ch));
});

test('gợi ý đủ chữ nhờ chữ lộ từ chỗ khác → tự mở, không ai được tính', () => {
  const { g } = game();
  const target = g.gm.clues.findIndex((c) => letterSet(c.a).size >= 2);
  const fx = [];
  for (const l of letterSet(g.gm.clues[target].a)) fx.push(...g.gmOpen([l]).autos);
  assert.ok(fx.some((e) => e.type === 'wg_gm_auto' && e.idx === target));
  assert.equal(g.snapshot().gm.clues[target].auto, true);
  assert.equal(say(g, 'x', g.gm.clues[target].a).some((e) => e.type === 'wg_gm_clue'), false);
});

test('admin đặt từ riêng khi tới lượt Giải mã → vòng đó chơi gần nghĩa; câu đã chơi được lưu, không lặp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'giaima-'));
  const statePath = path.join(dir, 'wordgame.json');
  const { g } = game({}, { statePath, modeWords: { giaima: BANK } });
  const first = g.gm.phrase;
  g.startRound('lò vi sóng');
  assert.equal(g.mode, 'meaning');
  assert.equal(g.secret, 'lò vi sóng');
  g.skip(); g.skip();
  assert.equal(g.mode, 'giaima');
  assert.notEqual(g.gm.phrase, first);
  g.dirty = true; g.save();
  const g2 = new WordGame({ words: [{ word: 'con mèo' }], modes: ['giaima'], cooldownSec: 0 }, { scorer, statePath, modeWords: { giaima: BANK }, random: seeded(9) });
  assert.ok(g2.gmPlayed.includes(first));
  assert.equal(new Set(g2.gmPlayed).size, g2.gmPlayed.length, 'không lặp câu');
});

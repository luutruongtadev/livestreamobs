import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { GiaiMaGame, pickClues, letterKey, letterSet, splitWords } from '../server/giaima.js';
import { PauseController } from '../server/pause.js';

const u = (id) => ({ id, name: id, avatar: null });
const BANK = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'modewords', 'giaima.json'), 'utf8'));

/** rng cố định để test lặp lại được */
function seeded(seed = 1) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

// kho nhỏ: câu "Stars fall under the moon" kiểu ví dụ gốc + vài gợi ý
const MINI = {
  phrases: [{ text: 'Ăn quả nhớ kẻ trồng cây', kind: 'Tục ngữ', meaning: 'Biết ơn' }],
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

function game(opts = {}, cfg = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, add: (ms) => { t += ms; } };
  const g = new GiaiMaGame({ cooldownMs: 0, ...cfg }, { bank: MINI, now: clock.now, rng: seeded(7), ...opts });
  g.setActive(true);
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

test('kho thật: mọi câu đều chọn được 2–6 gợi ý, chữ của gợi ý nằm trong câu, chừa 1–2 chữ', () => {
  for (const p of BANK.phrases) {
    const r = pickClues(p.text, BANK.clues, { rng: seeded(p.text.length) });
    assert.ok(r, `không đủ gợi ý cho: ${p.text}`);
    const L = letterSet(p.text);
    for (const c of r.clues) for (const l of letterSet(c.a)) assert.ok(L.has(l), `${c.a} có chữ ${l} không có trong "${p.text}"`);
    assert.ok(r.clues.length >= 2 && r.clues.length <= 6, `${p.text}: ${r.clues.length} gợi ý`);
    assert.ok(r.hidden.length >= 1 && r.hidden.length <= 2, `${p.text}: chừa ${r.hidden.length} chữ`);
    const covered = new Set(r.clues.flatMap((c) => [...letterSet(c.a)]));
    assert.deepEqual([...L].filter((l) => !covered.has(l)).sort(), [...r.hidden].sort());
  }
  for (const c of BANK.clues) {
    assert.ok(c.q && c.a && c.e, `gợi ý thiếu trường: ${JSON.stringify(c)}`);
    assert.ok(['vi', 'en'].includes(c.lang), `lang sai: ${c.a}`);
  }
});

test('vòng mới: mỗi chữ một số riêng, màn hình không lộ chữ chưa mở', () => {
  const { g } = game();
  const fx = g.tick();
  assert.equal(fx[0].type, 'gm_round');
  const s = g.snapshot();
  assert.equal(s.phase, 'playing');
  const nums = new Map();
  for (const w of s.words) for (const c of w) {
    assert.equal(c.ch, null);
    assert.ok(c.n >= 1);
  }
  // cùng chữ gốc → cùng số; khác chữ → khác số
  const chars = splitWords(g.round.phrase).flat();
  chars.forEach((ch, i) => {
    const n = s.words.flat()[i].n;
    const k = letterKey(ch);
    if (nums.has(k)) assert.equal(nums.get(k), n); else nums.set(k, n);
  });
  assert.equal(new Set(nums.values()).size, nums.size);
  assert.ok(!JSON.stringify(s).includes('nhớ'), 'snapshot không được chứa đáp án');
});

test('giải gợi ý → lộ chữ ở mọi ô cùng số (cả câu lẫn gợi ý khác); giải cả câu → thắng, có điểm tuần', () => {
  const awards = [];
  const weekly = { award: (by, r) => { awards.push({ by, r }); return { total: 150 }; }, addBonus: () => ({ add: 0, total: 0 }) };
  const { g, clock } = game({ weekly });
  g.tick();
  const c0 = g.round.clues[0];
  const fx = g.handle({ type: 'comment', user: u('lan'), text: c0.a.toUpperCase() });
  assert.equal(fx[0].type, 'gm_clue');
  assert.equal(fx[0].by.name, 'lan');
  for (const l of letterSet(c0.a)) assert.ok(g.round.revealed.has(l));
  const s = g.snapshot();
  assert.equal(s.clues[0].solvedBy.name, 'lan');
  const opened = s.words.flat().filter((c) => c.ch);
  assert.ok(opened.length > 0);
  for (const c of opened) assert.equal(c.n, g.round.code[letterKey(c.ch)]);
  // đoán lại đáp án đã giải: không tính nữa
  assert.equal(g.handle({ type: 'comment', user: u('minh'), text: c0.a }).some((e) => e.type === 'gm_clue'), false);
  // đoán sai → hiện lên dải bình luận
  assert.equal(g.handle({ type: 'comment', user: u('minh'), text: 'con bò' })[0].type, 'gm_guess');
  clock.add(30_000);
  const win = g.handle({ type: 'comment', user: u('minh'), text: 'đáp án là an qua nho ke trong cay' });
  assert.equal(win[0].type, 'gm_win');
  assert.equal(win[0].phrase, 'Ăn quả nhớ kẻ trồng cây');
  assert.equal(win[0].seconds, 30);
  assert.equal(awards.length, 1);
  assert.ok(awards[0].r > 0.8 && awards[0].r < 1);
  const after = g.snapshot();
  assert.equal(after.phase, 'break');
  assert.equal(after.answer.phrase, 'Ăn quả nhớ kẻ trồng cây');
  assert.ok(after.words.flat().every((c) => c.ch));
  assert.equal(after.board[0].name, 'minh');
  assert.equal(after.board[0].points, 100);
  // hết giờ nghỉ → vòng mới
  assert.deepEqual(g.handle({ type: 'comment', user: u('lan'), text: c0.a }), []);
  clock.add(g.cfg.breakSeconds * 1000);
  assert.equal(g.tick()[0].type, 'gm_round');
  assert.equal(g.roundNo, 2);
});

test('quà: 5 hoa hồng = 1 chữ, 10 xu = giải 1 gợi ý, 30 xu = +60s; luôn chừa ít nhất 1 chữ', () => {
  const { g } = game();
  g.tick();
  const rose = (n) => g.handle({ type: 'gift', user: u('an'), giftName: 'Rose', diamonds: 1, repeatCount: n });
  let fx = rose(3);
  assert.equal(fx[0].type, 'gm_thanks');
  assert.equal(fx[1].type, 'gm_progress');
  assert.equal(g.round.revealed.size, 0);
  fx = rose(2);
  assert.equal(fx[1].type, 'gm_letter');
  assert.equal(g.round.revealed.size, 1);
  fx = g.handle({ type: 'gift', user: u('an'), giftName: 'Doughnut', diamonds: 10, repeatCount: 1 });
  const clue = fx.find((e) => e.type === 'gm_clue');
  assert.equal(clue.via, 'gift');
  assert.equal(g.snapshot().board.length, 0); // gợi ý mở bằng quà không tính điểm cao thủ
  const end = g.endsAt;
  g.handle({ type: 'gift', user: u('an'), giftName: 'Hat', diamonds: 30, repeatCount: 1 });
  assert.equal(g.endsAt, end + 60_000);
  for (let i = 0; i < 30; i++) g.handle({ type: 'gift', user: u('an'), giftName: 'Finger Heart', diamonds: 5, repeatCount: 1 });
  assert.equal(g.hiddenLetters().length, 1);
  assert.equal(g.phase, 'playing');
});

test('thả tim: đủ 1000 tim cả phòng → lộ 1 chữ; hệ thống tự lộ chữ theo giờ; hết giờ lộ đáp án', () => {
  const { g, clock } = game();
  g.tick();
  g.handle({ type: 'like', user: u('a'), count: 600 });
  assert.equal(g.round.revealed.size, 0);
  const fx = g.handle({ type: 'like', user: u('b'), count: 500 });
  assert.equal(fx[0].type, 'gm_letter');
  assert.equal(fx[0].reason, 'like');
  assert.equal(g.likeCount, 100);
  clock.add(150_000);
  assert.equal(g.tick()[0].reason, 'auto');
  clock.add(200_000);
  const end = g.tick();
  assert.equal(end[0].type, 'gm_end');
  assert.equal(end[0].reason, 'timeout');
  assert.equal(g.snapshot().answer.phrase, 'Ăn quả nhớ kẻ trồng cây');
});

test('gợi ý đủ chữ nhờ chữ lộ từ chỗ khác → tự mở, không ai được điểm', () => {
  const { g } = game();
  g.tick();
  const r = g.round;
  const target = r.clues.findIndex((c) => letterSet(c.a).size >= 2);
  const fx = [];
  for (const l of letterSet(r.clues[target].a)) fx.push(...g.openLetters([l]).out);
  assert.ok(fx.some((e) => e.type === 'gm_clue_auto' && e.idx === target));
  assert.equal(g.snapshot().clues[target].auto, true);
  assert.equal(g.handle({ type: 'comment', user: u('x'), text: r.clues[target].a }).some((e) => e.type === 'gm_clue'), false);
});

test('tạm dừng: đồng hồ đứng, bỏ qua bình luận; PauseController giữ Giải mã dừng khi tắt', () => {
  const { g, clock } = game();
  g.tick();
  const left = g.remaining();
  let on = true;
  const p = new PauseController([g], { autoPauseOffline: false, online: true, hold: () => (on ? null : 'off') });
  on = false; p.apply();
  assert.equal(g.paused, true);
  clock.add(100_000);
  assert.equal(g.remaining(), left);
  assert.deepEqual(g.handle({ type: 'comment', user: u('a'), text: g.round.clues[0].a }), []);
  on = true; p.apply();
  assert.equal(g.paused, false);
  assert.equal(g.remaining(), left);
});

test('admin chọn câu riêng; câu không đủ gợi ý → báo lỗi', () => {
  const { g } = game({ bank: BANK });
  g.startRound('uống nước nhớ nguồn');
  assert.equal(g.round.phrase, 'Uống nước nhớ nguồn');
  assert.equal(g.adminSnapshot().secret.phrase, 'Uống nước nhớ nguồn');
  assert.throws(() => g.startRound('Zzz wwww fff'), /không đủ/);
});

test('lưu / nạp: giữ trạng thái bật, câu đã chơi và vòng đang dở', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'giaima-'));
  const filePath = path.join(dir, 'giaima.json');
  const { g, clock } = game({ filePath });
  g.tick();
  const c0 = g.round.clues[0];
  g.handle({ type: 'comment', user: u('lan'), text: c0.a });
  clock.add(40_000);
  g.save();
  const g2 = new GiaiMaGame({}, { bank: MINI, filePath, now: clock.now, rng: seeded(3) });
  assert.equal(g2.active, true);
  assert.equal(g2.phase, 'playing');
  assert.equal(g2.round.phrase, g.round.phrase);
  assert.equal(g2.round.clues[0].solvedBy.name, 'lan');
  assert.ok(g2.round.revealed.size > 0);
  assert.equal(g2.remaining(), g.remaining());
  assert.deepEqual(g2.played, g.played);
});

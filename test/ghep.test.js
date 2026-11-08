import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GhepGame, parseCombo, comboKey, guessEmoji, emojiCombo } from '../server/ghep.js';
import { EmojiKitchen } from '../server/emojikitchen.js';
import { PauseController } from '../server/pause.js';

const u = (id) => ({ id, name: id, avatar: null });
const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** Claude giả: trả JSON theo từng mẩu nhỏ (giống stream thật). */
function fakeClient(answers) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (req) => {
      calls.push(req);
      const text = typeof answers === 'function' ? answers(req) : answers.shift();
      return (async function* () {
        for (let i = 0; i < text.length; i += 7) yield { type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i, i + 7) } };
        yield { type: 'message_delta', delta: { stop_reason: 'end_turn' } };
      })();
    } } },
  };
}
const COMBO = JSON.stringify({ ea: '🐱', eb: '🚀', name: 'Mèo Phản Lực', desc: 'Bắt chuột ở Mach 3', stats: [{ label: '⚡ Tốc độ', value: 95 }, { label: '🥰 Dễ thương', value: 70 }, { label: '😈 Hỗn', value: 140 }], rarity: 'hiếm', mode: 'ride', base: 'a', tint: '#ef4444', safe: true });

test('parseCombo: nhận "A + B", chữ hoặc emoji; bỏ câu thường / link / quá dài', () => {
  assert.deepEqual(parseCombo('mèo + tên lửa'), ['mèo', 'tên lửa']);
  assert.deepEqual(parseCombo(' 🐶+🍕 '), ['🐶', '🍕']);
  assert.deepEqual(parseCombo('Khủng long ＋ trà sữa!!'), ['Khủng long', 'trà sữa']);
  assert.equal(parseCombo('mèo tên lửa'), null);
  assert.deepEqual(parseCombo('🐱🚀'), ['🐱', '🚀']); // 2 emoji không cần dấu +
  assert.deepEqual(parseCombo(' 🐱  🚀 '), ['🐱', '🚀']);
  assert.deepEqual(parseCombo('❤️👨‍🍳'), ['❤️', '👨‍🍳']); // emoji ghép nhiều ký tự vẫn tính 1
  assert.equal(parseCombo('😂😂'), null); // thả 2 emoji giống nhau = cười, không ghép
  assert.deepEqual(parseCombo('😂 + 😂'), ['😂', '😂']);
  assert.equal(parseCombo('🐱🚀🔥'), null);
  assert.equal(parseCombo('🐱 mèo'), null);
  assert.equal(parseCombo('a + b + c'), null);
  assert.equal(parseCombo('mèo + '), null);
  assert.equal(parseCombo('1 + 1'), null);
  assert.equal(parseCombo('https://x.com + mèo'), null);
  assert.equal(parseCombo('một con mèo rất là to + chó'), null);
});

test('comboKey không phụ thuộc thứ tự; guessEmoji từ điển + emoji có sẵn', () => {
  assert.equal(comboKey('Mèo', 'tên lửa'), comboKey('tên lửa', 'mèo'));
  assert.equal(guessEmoji('con mèo'), '🐱');
  assert.equal(guessEmoji('🦄 nè'), '🦄');
  assert.equal(guessEmoji('xyzabc'), null);
});

test('EmojiKitchen: tra ảnh ghép cho cặp emoji (2 chiều), emoji không hỗ trợ → null', () => {
  const k = EmojiKitchen.load(path.join(import.meta.dirname, '..', 'modewords', 'emoji-kitchen.json'));
  assert.ok(k.size > 100000);
  const url = k.url('🐱', '🚀');
  assert.match(url, /^https:\/\/www\.gstatic\.com\/android\/keyboard\/emojikitchen\/\d{8}\/u1f680\/u1f680_u1f431\.png$/);
  assert.equal(k.url('🚀', '🐱'), url);
  assert.equal(k.url('❤', '🔥'), k.url('❤️', '🔥')); // có / không có FE0F đều nhận
  assert.ok(k.url('❤', '🔥'));
  assert.equal(k.url('🐱', '🥖'), null);
  assert.equal(k.canonical('❤'), '❤️');
});

test('bình luận combo mới: hiện ngay 2 emoji, Claude soạn xong → ghep_done; gặp lại không gọi Claude', async () => {
  const client = fakeClient([COMBO]);
  const g = new GhepGame({ cooldownMs: 0 }, { client });
  const fx = [];
  g.on('effects', (e) => fx.push(...e));
  const first = g.handle({ type: 'comment', user: u('an'), text: 'mèo + tên lửa' });
  assert.equal(first[0].type, 'ghep_job');
  assert.equal(first[0].ea, '🐱');
  assert.equal(first[0].eb, '🚀');
  await wait(20);
  assert.ok(fx.some((e) => e.type === 'ghep_typing' && e.name.startsWith('Mèo')));
  const done = fx.find((e) => e.type === 'ghep_done');
  assert.equal(done.combo.name, 'Mèo Phản Lực');
  assert.equal(done.isNew, true);
  assert.equal(done.combo.inventor.id, 'an');
  assert.equal(done.combo.stats[2].value, 100); // kẹp ≤ 100
  assert.equal(client.calls[0].model, 'claude-haiku-5-5');
  assert.equal(client.calls[0].betas, undefined); // Haiku: không gửi beta fallback
  assert.match(client.calls[0].system[0].text, /🐱/); // danh sách emoji ghép được nằm trong prompt (cache)
  assert.ok(client.calls[0].system[0].cache_control);
  assert.match(done.combo.img, /u1f680_u1f431\.png$/);
  assert.match(first[0].img, /u1f680_u1f431\.png$/); // có ảnh ngay khi bắt đầu trộn (từ điển)

  const again = g.handle({ type: 'comment', user: u('binh'), text: 'tên lửa + Mèo' });
  assert.equal(again[1].type, 'ghep_done');
  assert.equal(again[1].isNew, false);
  assert.equal(again[1].combo.count, 2);
  assert.equal(client.calls.length, 1);
  assert.equal(g.snapshot().gallery[0].name, 'Mèo Phản Lực');
});

test('2 người cùng gửi combo mới một lúc: chỉ gọi Claude 1 lần', async () => {
  const client = fakeClient([COMBO]);
  const g = new GhepGame({ cooldownMs: 0 }, { client });
  const fx = [];
  g.on('effects', (e) => fx.push(...e));
  g.handle({ type: 'comment', user: u('an'), text: 'mèo + tên lửa' });
  g.handle({ type: 'comment', user: u('binh'), text: 'mèo + tên lửa' });
  await wait(20);
  assert.equal(client.calls.length, 1);
  const dones = fx.filter((e) => e.type === 'ghep_done');
  assert.equal(dones.length, 2);
  assert.deepEqual(dones.map((d) => d.isNew).sort(), [false, true]);
});

test('chống spam: 1 người / cooldown; quá giới hạn combo mới / phút → ghép đơn giản không tốn token', async () => {
  let t = 0;
  const client = fakeClient(() => COMBO);
  const g = new GhepGame({ cooldownMs: 3000, maxNewPerMinute: 1 }, { client, now: () => t });
  assert.equal(g.handle({ type: 'comment', user: u('an'), text: 'mèo + chó' }).length, 1);
  assert.equal(g.handle({ type: 'comment', user: u('an'), text: 'gà + vịt' }).length, 0);
  t = 3000;
  const fx = [];
  g.on('effects', (e) => fx.push(...e));
  g.handle({ type: 'comment', user: u('an'), text: 'gà + vịt' });
  await wait(20);
  assert.equal(client.calls.length, 1);
  const d = fx.find((e) => e.type === 'ghep_done');
  assert.equal(d.combo.source, 'simple');
  assert.equal(d.combo.ea, '🐔');
});

test('Claude từ chối (safe=false) → ghep_fail, không lưu', async () => {
  const client = fakeClient([JSON.stringify({ ...JSON.parse(COMBO), safe: false })]);
  const g = new GhepGame({ cooldownMs: 0 }, { client });
  const fx = [];
  g.on('effects', (e) => fx.push(...e));
  g.handle({ type: 'comment', user: u('an'), text: 'xấu + xa' });
  await wait(20);
  assert.ok(fx.some((e) => e.type === 'ghep_fail'));
  assert.equal(g.combos.size, 0);
});

test('lưu / đọc lại file: combo, mô hình, trạng thái bật', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghep-'));
  const file = path.join(dir, 'ghep.json');
  const g = new GhepGame({ cooldownMs: 0 }, { client: fakeClient([COMBO]), filePath: file });
  g.setActive(true);
  g.handle({ type: 'comment', user: u('an'), text: 'mèo + tên lửa' });
  await wait(20);
  g.save();
  const g2 = new GhepGame({}, { filePath: file });
  assert.equal(g2.active, true);
  assert.equal(g2.combos.get(comboKey('mèo', 'tên lửa')).name, 'Mèo Phản Lực');
  assert.equal(g2.gallery.length, 1);
});

test('PauseController hold: đang chơi Ghép → Đoán từ dừng (lý do ghep) dù đang live / bấm tiếp tục', () => {
  const game = { paused: false, pauseReason: null, pause(r) { const c = !this.paused; this.paused = true; this.pauseReason = r; return c; }, resume() { const c = this.paused; this.paused = false; this.pauseReason = null; return c; } };
  let on = false;
  const p = new PauseController([game], { autoPauseOffline: false, online: true, hold: () => (on ? 'ghep' : null) });
  assert.equal(game.paused, false);
  on = true; p.apply();
  assert.equal(game.pauseReason, 'ghep');
  p.resume();
  assert.equal(game.paused, true);
  on = false; p.apply();
  assert.equal(game.paused, false);
});

test('quà ≥ 10 xu sau combo → trình diễn đặc biệt combo đó; quà nhỏ chỉ cảm ơn; không gọi thêm Claude', async () => {
  const client = fakeClient(() => COMBO);
  const g = new GhepGame({ cooldownMs: 0 }, { client });
  g.handle({ type: 'comment', user: u('an'), text: 'mèo + tên lửa' });
  await wait(20);
  const small = g.handle({ type: 'gift', user: u('an'), giftName: 'Hoa', diamonds: 1, repeatCount: 5 });
  assert.deepEqual(small.map((e) => e.type), ['ghep_thanks']);
  const big = g.handle({ type: 'gift', user: u('an'), giftName: 'Kẹo', diamonds: 5, repeatCount: 2 });
  assert.deepEqual(big.map((e) => e.type), ['ghep_thanks', 'ghep_spotlight']);
  assert.equal(big[1].combo.name, 'Mèo Phản Lực');
  assert.deepEqual(big[1].gift, { giftName: 'Kẹo', diamonds: 10 });
  assert.equal(client.calls.length, 1);
});

test('tặng quà trước khi bình luận → nhắc "A + B", combo kế tiếp được trình diễn đặc biệt', async () => {
  const client = fakeClient(() => COMBO);
  const g = new GhepGame({ cooldownMs: 0 }, { client });
  const fx = [];
  g.on('effects', (e) => fx.push(...e));
  const r = g.handle({ type: 'gift', user: u('an'), giftName: 'Kẹo', diamonds: 10 });
  assert.deepEqual(r.map((e) => e.type), ['ghep_thanks', 'ghep_hint']);
  g.handle({ type: 'comment', user: u('an'), text: 'mèo + tên lửa' });
  await wait(20);
  assert.deepEqual(fx.find((e) => e.type === 'ghep_done').gift, { giftName: 'Kẹo', diamonds: 10 });
  const again = g.handle({ type: 'comment', user: u('an'), text: 'mèo + tên lửa' });
  assert.equal(again[1].gift, null); // quà chỉ dùng 1 lần
});

test('2 emoji → đặt tên bằng bảng tiếng Việt, KHÔNG gọi Claude; danh từ trước, mặt cảm xúc sau', async () => {
  const client = fakeClient(() => COMBO);
  const g = new GhepGame({ cooldownMs: 0 }, { client });
  const fx = [];
  g.on('effects', (e) => fx.push(...e));
  g.handle({ type: 'comment', user: u('an'), text: '😎🐱' });
  g.handle({ type: 'comment', user: u('binh'), text: '🐶 + 🍕' });
  await wait(20);
  assert.equal(client.calls.length, 0);
  const names = fx.filter((e) => e.type === 'ghep_done').map((e) => e.combo.name);
  assert.deepEqual(names, ['Mèo Ngầu', 'Chó Pizza']);
  const c = fx.find((e) => e.type === 'ghep_done').combo;
  assert.equal(c.source, 'table');
  assert.equal(c.stats.length, 3);
  assert.ok(c.img);
  // cùng cặp luôn ra cùng kết quả
  assert.deepEqual(emojiCombo(g.kitchen, '😎', '🐱'), emojiCombo(g.kitchen, '😎', '🐱'));
  assert.equal(emojiCombo(g.kitchen, '😎', '😭').name, 'Mặt Ngầu Khóc Nhè');
  // chữ thì vẫn nhờ Claude đặt tên
  g.handle({ type: 'comment', user: u('chi'), text: 'mèo + tên lửa' });
  await wait(20);
  assert.equal(client.calls.length, 1);
});

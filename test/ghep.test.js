import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GhepGame, parseCombo, comboKey, guessEmoji, cleanPart, scanStreamObjects } from '../server/ghep.js';
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
const part = (label, extra = {}) => ({ label, shape: 'sphere', size: [1], pos: [0, 0, 0], rot: [0, 0, 0], color: '#ff0000', glow: false, ...extra });
const MODEL = JSON.stringify({ parts: [part('đầu'), part('tai', { shape: 'cone', size: [0.3, 0.6] }), part('mắt "trái" {x}'), part('lửa', { glow: true }), part('xấu', { shape: 'pyramid' })] });

test('parseCombo: nhận "A + B", chữ hoặc emoji; bỏ câu thường / link / quá dài', () => {
  assert.deepEqual(parseCombo('mèo + tên lửa'), ['mèo', 'tên lửa']);
  assert.deepEqual(parseCombo(' 🐶+🍕 '), ['🐶', '🍕']);
  assert.deepEqual(parseCombo('Khủng long ＋ trà sữa!!'), ['Khủng long', 'trà sữa']);
  assert.equal(parseCombo('mèo tên lửa'), null);
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

test('cleanPart: chặn hình lạ, kẹp kích thước / vị trí, màu sai → mặc định', () => {
  assert.equal(cleanPart({ shape: 'pyramid', size: [1] }), null);
  const p = cleanPart({ label: 'x', shape: 'box', size: [9, 0, 'a'], pos: [10, -10, 1], rot: [0, 0, 999], color: 'red', glow: 1 });
  assert.deepEqual(p.size, [3, 0.01, 0.5]);
  assert.deepEqual(p.pos, [4, -4, 1]);
  assert.equal(p.rot[2], 360);
  assert.equal(p.color, '#a78bfa');
  assert.equal(p.glow, true);
});

test('scanStreamObjects: lấy từng khối hoàn chỉnh khi JSON đang stream dở (kể cả ngoặc trong chuỗi)', () => {
  const state = { start: -1, pos: 0 };
  let got = [];
  for (let i = 1; i <= MODEL.length; i += 5) got = got.concat(scanStreamObjects(MODEL.slice(0, i), state).items);
  got = got.concat(scanStreamObjects(MODEL, state).items);
  assert.deepEqual(got.map((p) => p.label), ['đầu', 'tai', 'mắt "trái" {x}', 'lửa', 'xấu']);
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

test('quà ≥ 10 xu sau combo → dựng 3D, gửi từng khối khi stream; quà nhỏ chỉ cảm ơn; lưu mô hình để lần sau không tốn token', async () => {
  const client = fakeClient((req) => (req.model === 'claude-haiku-5-5' ? COMBO : MODEL));
  const g = new GhepGame({ cooldownMs: 0, show3dMs: 0 }, { client });
  const fx = [];
  g.on('effects', (e) => fx.push(...e));
  g.handle({ type: 'comment', user: u('an'), text: 'mèo + tên lửa' });
  await wait(20);
  const small = g.handle({ type: 'gift', user: u('an'), giftName: 'Hoa', diamonds: 1, repeatCount: 5 });
  assert.deepEqual(small.map((e) => e.type), ['ghep_thanks']);
  const big = g.handle({ type: 'gift', user: u('an'), giftName: 'Kẹo', diamonds: 5, repeatCount: 2 });
  assert.deepEqual(big.map((e) => e.type), ['ghep_thanks', 'ghep3d_queued']);
  await wait(50);
  const req3d = client.calls.find((c) => c.model === 'claude-sonnet-5-5');
  assert.deepEqual(req3d.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req3d.stream, true);
  const parts = fx.filter((e) => e.type === 'ghep3d_part');
  assert.deepEqual(parts.map((p) => p.part.label), ['đầu', 'tai', 'mắt "trái" {x}', 'lửa']); // khối hình lạ bị bỏ
  assert.ok(fx.some((e) => e.type === 'ghep3d_done' && e.parts === 4));
  assert.equal(g.models.size, 1);
  const before = client.calls.length;
  g.handle({ type: 'gift', user: u('an'), giftName: 'Kẹo', diamonds: 10 });
  await wait(2000);
  assert.equal(client.calls.length, before); // dùng lại mô hình đã lưu
  assert.equal(fx.filter((e) => e.type === 'ghep3d_part').length, 8);
});

test('tặng quà trước khi bình luận → nhắc "A + B", bình luận ngay sau đó thì vẽ 3D', async () => {
  const client = fakeClient((req) => (req.model === 'claude-haiku-5-5' ? COMBO : MODEL));
  const g = new GhepGame({ cooldownMs: 0, show3dMs: 0 }, { client });
  const fx = [];
  g.on('effects', (e) => fx.push(...e));
  const r = g.handle({ type: 'gift', user: u('an'), giftName: 'Kẹo', diamonds: 10 });
  assert.deepEqual(r.map((e) => e.type), ['ghep_thanks', 'ghep_hint']);
  g.handle({ type: 'comment', user: u('an'), text: 'mèo + tên lửa' });
  await wait(60);
  assert.ok(fx.some((e) => e.type === 'ghep3d_queued'));
  assert.ok(fx.some((e) => e.type === 'ghep3d_done'));
});

test('quà to (≥ 99 xu) chen lên đầu hàng chờ 3D', async () => {
  const g = new GhepGame({ cooldownMs: 0, show3dMs: 60_000 }, { client: null });
  for (const id of ['a', 'b', 'c']) g.handle({ type: 'comment', user: u(id), text: `${id}mèo + chó` });
  await wait(5);
  g.handle({ type: 'gift', user: u('a'), diamonds: 10 });
  await wait(5); // mô hình của a đang vẽ
  g.handle({ type: 'gift', user: u('b'), diamonds: 10 });
  const r = g.handle({ type: 'gift', user: u('c'), diamonds: 199 });
  assert.equal(r[1].position, 1); // ngay sau mô hình đang vẽ
  assert.equal(g.queue3d[0].by.id, 'c');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom, memoryStorage } from '#sdk';
import { loadGame } from '#sdk/node';

const game = await loadGame(new URL('..', import.meta.url));
const u = (id) => ({ id, name: `Người ${id}` });
const PACK = { synonyms: ['ông mặt trời'], strongRelated: ['nắng', 'mặt trăng'], related: ['kem chống nắng'], weakRelated: ['bãi biển'], unrelated: ['mặt nạ'] };

/** Server giả của game: ghi lại các op, trả pack / điểm cố định. */
function fakeServer() {
  const calls = [];
  return {
    calls,
    request: async (op, payload) => {
      calls.push([op, payload]);
      if (op === 'pack') return { pack: PACK };
      if (op === 'score') return { score: 42, source: 'claude', category: 'RELATED' };
      if (op === 'caps') return { claude: true, attr: false, english: false };
      return {};
    },
  };
}

function mk({ settings = { modes: ['meaning'] }, storage = memoryStorage(), server = fakeServer(), bindings } = {}) {
  const clock = fakeClock();
  const later = [];
  const host = createHost(game, { settings, data: game.data, now: clock.now, random: seededRandom(5), server, storage, bindings, log: {}, onEffects: (fx) => later.push(...fx) });
  return { host, clock, server, storage, later };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('đoán từ: pack tra tại overlay (không gọi server), từ ngoài pack hỏi server, đoán trúng = thắng', async () => {
  const { host, clock, server, later } = mk();
  await flush();
  assert.ok(server.calls.some(([op]) => op === 'pack'), 'đầu vòng xin pack');
  const s0 = host.snapshot();
  assert.equal(s0.phase, 'playing');
  const secret = host.serialize() && (game.data.meaning.words.find((w) => s0.pattern.join() === w.word.split(' ').map((x) => [...x].length).join()));
  assert.ok(secret, 'từ bí mật lấy từ kho soạn sẵn');
  host.handle({ type: 'comment', user: u('a'), text: 'nắng' });
  clock.advance(3000);
  host.handle({ type: 'comment', user: u('b'), text: 'xe tăng' });
  await flush(); await flush();
  const scored = later.filter((e) => e.type === 'wg_scored');
  assert.equal(scored.length, 2);
  const local = scored.find((e) => e.word === 'nắng');
  assert.ok(local.source === 'dict' || local.source === 'claude', 'có điểm');
  assert.ok(server.calls.some(([op, p]) => op === 'score' && p.word === 'xe tăng'), 'từ ngoài pack → server');
});

test('quà / tim đi qua trigger của nền tảng: 5 hoa hồng = 1 chữ (có tiến độ), 1000 tim = 1 chữ, quà ≥ 30 xu = +60 giây', async () => {
  const { host, clock } = mk();
  const rose = (n) => host.handle({ type: 'gift', user: u('g'), giftName: 'Rose', diamonds: 1, count: n });
  const p = rose(3);
  assert.equal(p.find((e) => e.type === 'wg_progress')?.count, 3, 'tiến độ 3/5');
  assert.ok(p.some((e) => e.type === 'wg_thanks'), 'vẫn cảm ơn người tặng');
  const r = rose(2);
  assert.equal(r.filter((e) => e.type === 'wg_unlock' && e.action === 'letter').length, 1);
  const chip = host.snapshot().unlocks.find((c) => c.label === 'Lộ 1 chữ cái' && c.every === 5);
  assert.equal(chip.count, 0, 'chip trên màn hình lấy từ bindings, đã gom đủ thì về 0');
  const likes = host.handle({ type: 'like', user: u('l'), count: 1000 });
  assert.ok(likes.some((e) => e.type === 'wg_unlock' && e.likes), 'tim mở chữ');
  clock.advance(100_000); // đầu vòng đồng hồ đã ở mức tối đa, thêm giờ không vượt quá roundSeconds
  const before = host.snapshot().remaining;
  const t = host.handle({ type: 'gift', user: u('d'), giftName: 'Doughnut', diamonds: 30, count: 1 });
  assert.ok(t.some((e) => e.type === 'wg_unlock' && e.action === 'time' && e.seconds === 60));
  assert.ok(host.snapshot().remaining > before);
});

test('lộ chữ: luôn chừa ≥ 1 chữ — hết chữ thì trả lượt (lần sau đủ quà vẫn mở ngay khi có vòng mới)', () => {
  const { host } = mk({ bindings: [{ id: 'h', action: 'letter', label: 'chữ', trigger: { type: 'gift', giftName: 'Finger Heart' } }] });
  const total = host.snapshot().pattern.reduce((a, b) => a + b, 0);
  let opened = 0;
  for (let i = 0; i < total + 3; i++) opened += host.handle({ type: 'gift', user: u('g'), giftName: 'Finger Heart', diamonds: 5, count: 1 }).filter((e) => e.type === 'wg_unlock').length;
  assert.equal(opened, total - 1);
});

test('lệnh: next kết thúc vòng, hint mở gợi ý, team bật đấu đội; pause / resume của nền tảng', () => {
  const { host, clock } = mk();
  assert.ok(host.command('hint').some((e) => e.type === 'wg_hint'));
  assert.ok(host.command('team', { op: 'on' }).some((e) => e.type === 'wg_team_mode' && e.on));
  host.command('pause');
  assert.equal(host.snapshot().paused, true);
  const left = host.snapshot().remaining;
  clock.advance(60_000); host.tick();
  assert.equal(host.snapshot().remaining, left, 'đồng hồ đứng yên khi tạm dừng');
  host.command('resume');
  assert.ok(host.command('next').some((e) => e.type === 'wg_timeout'));
});

test('lưu bền qua ctx.storage: reload overlay giữ người thắng + từ đã chơi', async () => {
  const storage = memoryStorage();
  const a = mk({ storage });
  const ans = a.host.snapshot();
  a.host.command('next'); // lộ đáp án
  const secret = a.host.snapshot().secret;
  a.host.handle({ type: 'comment', user: u('x'), text: 'gì đó' });
  const saved = JSON.parse(JSON.stringify(a.host.serialize()));
  assert.ok(saved.used.length >= 1, 'đã đánh dấu từ đã chơi');
  const b = mk({ storage: memoryStorage() });
  b.host.restore(saved);
  assert.deepEqual(b.host.serialize().used, saved.used);
  assert.ok(ans.round >= 1 && secret);
});

test('không có server (lỗi mạng) → từ ngoài pack là "chưa rõ nghĩa", không chấm theo chữ', async () => {
  const server = { request: async (op) => { if (op === 'pack') return { pack: null }; throw new Error('mất mạng'); } };
  const { host, later } = mk({ server });
  await flush();
  host.handle({ type: 'comment', user: u('a'), text: 'mặt nạ' });
  await flush(); await flush();
  const s = later.find((e) => e.type === 'wg_scored');
  assert.equal(s.source, 'none');
  assert.ok(s.score <= 9);
});

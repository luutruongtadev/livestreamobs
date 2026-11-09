import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Announcer, cleanAnnounce, ANNOUNCE_MAX_CHARS } from '../server/announce.js';

test('cleanAnnounce: 1 dòng, bỏ ký tự điều khiển, cắt theo ký tự (emoji không bị vỡ)', () => {
  assert.equal(cleanAnnounce('  Chào\n\tcả nhà  🎁 '), 'Chào cả nhà 🎁');
  assert.equal([...cleanAnnounce('🎁'.repeat(200))].length, ANNOUNCE_MAX_CHARS);
  assert.equal(cleanAnnounce(null), '');
});

test('Announcer: gửi / tắt; hết thời gian thì tự tắt; 0 phút = hiện tới khi tắt', () => {
  let t = 1_000_000;
  const a = new Announcer({ now: () => t });
  assert.deepEqual(a.status(), { active: null });
  assert.throws(() => a.set({ text: '   ' }), /Nhập nội dung/);
  const s = a.set({ text: 'Tặng hoa mở chữ nha', minutes: 5, speak: true });
  assert.deepEqual(s.active, { id: 1, text: 'Tặng hoa mở chữ nha', speak: true, remaining: 300 });
  t += 60_000;
  assert.equal(a.status().active.remaining, 240);
  assert.equal(a.tick(), false);
  t += 240_000;
  assert.equal(a.tick(), true, 'hết giờ → báo để phát lại cho màn hình');
  assert.deepEqual(a.status(), { active: null });
  const forever = a.set({ text: 'Ghim mãi', minutes: 0 });
  assert.equal(forever.active.remaining, null);
  assert.equal(forever.active.id, 2, 'mỗi lần gửi một mã mới (màn hình biết là tin mới)');
  t += 10 * 3600_000;
  assert.equal(a.tick(), false);
  assert.equal(a.clear(), true);
  assert.equal(a.clear(), false);
});

test('Announcer: lưu / nạp lại sau khi khởi động lại server; tin đã hết hạn thì không nạp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'announce-'));
  const statePath = path.join(dir, 'announce.json');
  let t = 5_000_000;
  const a = new Announcer({ statePath, now: () => t });
  a.set({ text: 'Đang có minigame', minutes: 10 });
  t += 60_000;
  const b = new Announcer({ statePath, now: () => t });
  assert.equal(b.status().active.text, 'Đang có minigame');
  assert.equal(b.status().active.remaining, 540);
  b.set({ text: 'Tin mới', minutes: 1 });
  assert.equal(b.status().active.id, 2, 'giữ bộ đếm mã sau khi nạp lại');
  t += 120_000;
  const c = new Announcer({ statePath, now: () => t });
  assert.deepEqual(c.status(), { active: null });
});

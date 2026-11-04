import test from 'node:test';
import assert from 'node:assert/strict';
import { Goodbye } from '../server/goodbye.js';
import { PauseController } from '../server/pause.js';

// 00:59:30 giờ VN ngày 5/11 = 17:59:30 UTC ngày 4/11
const T0 = Date.UTC(2026, 10, 4, 17, 59, 30);

test('đúng 01:00 giờ VN: chào tạm biệt 60 giây rồi báo hết; mỗi ngày chỉ 1 lần', () => {
  const clock = { t: T0 };
  const g = new Goodbye({}, { now: () => clock.t });
  assert.equal(g.tick(), null);
  clock.t += 30_000; // 01:00:00
  assert.equal(g.tick(), 'start');
  assert.equal(g.status().active.remaining, 60);
  clock.t += 59_000; assert.equal(g.tick(), null);
  clock.t += 1_000; assert.equal(g.tick(), 'end');
  assert.equal(g.status().active.done, true);
  g.cancel();
  clock.t += 5 * 60_000; assert.equal(g.tick(), null, 'đã chào hôm nay rồi');
  clock.t += 24 * 3600e3 - 5 * 60_000; assert.equal(g.tick(), 'start', 'hôm sau chào lại');
});

test('server khởi động lại muộn quá 30 phút thì không chào; tắt hẹn giờ thì không chào; đổi giờ hợp lệ', () => {
  const clock = { t: T0 + 45 * 60_000 }; // 01:44
  const g = new Goodbye({}, { now: () => clock.t });
  assert.equal(g.tick(), null);
  g.set({ at: '1:50' });
  assert.equal(g.status().at, '01:50');
  clock.t += 6 * 60_000; assert.equal(g.tick(), 'start');
  const off = new Goodbye({ enabled: false }, { now: () => T0 + 60_000 });
  assert.equal(off.tick(), null);
  assert.throws(() => g.set({ at: '25:00' }), /HH:MM/);
});

test('tạm dừng sau chào tạm biệt: vẫn dừng khi mất live, lần lên live sau tự chạy lại', () => {
  const games = [{ pause(r) { const c = !this.p || this.r !== r; this.p = true; this.r = r; this.pauseReason = r; return c; }, resume() { const c = !!this.p; this.p = false; this.pauseReason = null; return c; } }];
  const pc = new PauseController(games, { autoPauseOffline: true, online: true });
  assert.equal(games[0].p, false);
  pc.sleep();
  assert.deepEqual([games[0].p, pc.status().reason], [true, 'goodnight']);
  pc.setOnline(false); // tắt máy → mất live
  assert.equal(pc.status().reason, 'goodnight');
  pc.setOnline(true); // tối mai lên live
  assert.equal(games[0].p, false);
  assert.equal(pc.status().paused, false);
});

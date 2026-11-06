import test from 'node:test';
import assert from 'node:assert/strict';
import { WordGame } from '../server/wordgame.js';
import { PauseController } from '../server/pause.js';

const scorer = { score: async () => 50 };
const u = (id) => ({ id, name: id });

function mk(clock) {
  return new WordGame({ words: [{ word: 'mặt trời' }, { word: 'con mèo' }], roundSeconds: 100, breakSeconds: 10, hintAtSeconds: [30] }, { scorer, now: () => clock.t });
}

test('tạm dừng: đồng hồ đứng yên, không sang vòng mới, không tốn từ', () => {
  const clock = { t: 0 };
  const g = mk(clock);
  clock.t = 20_000;
  g.pause('offline');
  clock.t = 10_000_000; // rất lâu sau
  assert.deepEqual(g.tick(), []);
  assert.equal(g.roundNo, 1);
  assert.equal(g.phase, 'playing');
  const s = g.snapshot();
  assert.equal(s.paused, true);
  assert.equal(s.pauseReason, 'offline');
  assert.equal(s.remaining, 80);
  assert.equal(s.hintLevel, 0);
  // bình luận bị bỏ qua
  assert.deepEqual(g.handle({ type: 'comment', user: u('a'), text: 'mặt trời' }), []);
  assert.match(g.lastReject, /tạm dừng/);

  g.resume();
  assert.equal(g.snapshot().remaining, 80);
  clock.t += 10_000; // 30s đã chơi → tới gợi ý đầu
  assert.equal(g.tick()[0]?.type, 'wg_hint');
  clock.t += 70_000;
  assert.equal(g.tick()[0]?.type, 'wg_timeout');
});

test('tạm dừng lúc nghỉ giữa vòng giữ nguyên thời gian nghỉ', () => {
  const clock = { t: 0 };
  const g = mk(clock);
  g.skip(); // kết thúc vòng → nghỉ 10s
  assert.equal(g.phase, 'ended');
  clock.t = 4000;
  g.pause();
  clock.t = 999_000;
  g.tick();
  assert.equal(g.roundNo, 1);
  g.resume();
  assert.equal(g.snapshot().remaining, 6);
  clock.t += 6000;
  assert.equal(g.tick()[0]?.type, 'wg_start');
  assert.equal(g.roundNo, 2);
});

test('PauseController: tự dừng khi offline, chạy khi live, nút Tiếp tục ép chạy', () => {
  const clock = { t: 0 };
  const g = mk(clock);
  const p = new PauseController([g], { autoPauseOffline: true, online: false });
  assert.equal(g.paused, true);
  assert.equal(p.status().reason, 'offline');

  p.setOnline(true);
  assert.equal(g.paused, false);

  p.pause();
  assert.equal(g.pauseReason, 'manual');
  p.setOnline(false);
  assert.equal(g.pauseReason, 'manual');
  p.resume(); // offline nhưng admin muốn chạy thử
  assert.equal(g.paused, false);
  p.setOnline(true);
  p.setOnline(false); // mất live lần sau → lại tự dừng
  assert.equal(g.paused, true);
  assert.equal(g.pauseReason, 'offline');

  const off = new PauseController([mk(clock)], { autoPauseOffline: false });
  assert.equal(off.status().paused, false);
});

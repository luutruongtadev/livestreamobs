import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TikTokBridge } from '../server/tiktok.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// kết nối TikTok giả: ghi lại các lần connect(roomId)
function fakeClass(log) {
  return class FakeConn extends EventEmitter {
    constructor(user) { super(); this.user = user; log.push({ type: 'new' }); FakeConn.last = this; }
    async connect(roomId) { log.push({ type: 'connect', roomId }); if (FakeConn.fail?.(roomId)) throw new Error('room expired'); return { roomId: roomId || 'R1' }; }
    async disconnect() { log.push({ type: 'disconnect' }); }
  };
}

test('TikTokBridge: rớt kết nối thì ghi mã + lý do, nối lại dùng room id cũ; room id hết hạn thì dò lại', async () => {
  const log = [];
  const C = fakeClass(log);
  const b = new TikTokBridge({ ConnectionClass: C, log: {} });
  b.retryDelay = 5;
  await b.connect('kenh');
  assert.equal(b.status.state, 'connected');
  b.retryDelay = 5;
  C.last.emit('disconnected', { code: 4005, reason: 'kicked' });
  assert.deepEqual([b.status.drops, b.status.lastDrop.code, b.status.lastDrop.why], [1, 4005, 'kicked']);
  await wait(30);
  assert.equal(b.status.state, 'connected');
  assert.equal(log.filter((x) => x.type === 'connect').at(-1).roomId, 'R1', 'nối lại bằng room id cũ');
  // room id cũ hết hạn → thử lại không có room id
  C.fail = (roomId) => roomId === 'R1';
  b.retryDelay = 5;
  C.last.emit('disconnected', { code: 1006, reason: '' });
  await wait(30);
  assert.equal(b.status.state, 'connected');
  assert.equal(log.filter((x) => x.type === 'connect').at(-1).roomId, undefined);
  await b.disconnect();
});

test('TikTokBridge: kết nối "chết lâm sàng" (không có dữ liệu) thì tự nối lại; có ping thì trả pong', async () => {
  const log = [];
  const C = fakeClass(log);
  const b = new TikTokBridge({ ConnectionClass: C, stallMs: 60, log: {} });
  await b.connect('kenh');
  const first = C.last;
  // trả pong khi máy chủ ping
  const ws = new EventEmitter(); const pongs = []; ws.pong = (d) => pongs.push(d);
  first.emit('websocketConnected', ws);
  ws.emit('ping', 'x');
  assert.deepEqual(pongs, ['x']);
  // có dữ liệu đều → không rớt
  for (let i = 0; i < 4; i++) { await wait(25); first.emit('websocketData', Buffer.from('a')); }
  assert.equal(b.status.drops, 0);
  // im lặng quá 60ms → nối lại
  b.retryDelay = 5;
  await wait(150);
  assert.ok(b.status.drops >= 1);
  assert.match(b.status.lastDrop.reason, /Không nhận dữ liệu/);
  assert.notEqual(C.last, first, 'đã tạo kết nối mới');
  await b.disconnect();
});

test('đo độ trễ: lấy thời điểm TikTok tạo bình luận (common.createTime), tính trung bình / lâu nhất', async () => {
  const { sentAtOf, normalizeComment } = await import('../server/tiktok.js');
  assert.equal(sentAtOf({ common: { createTime: '1762500000000' } }), 1762500000000);
  assert.equal(sentAtOf({ common: { createTime: '1762500000' } }), 1762500000000, 'đơn vị giây → ms');
  assert.equal(sentAtOf({}), null);
  assert.equal(normalizeComment({ content: 'hi', common: { createTime: '1762500000000' }, user: { uniqueId: 'a' } }).sentAt, 1762500000000);
  const log = [];
  const C = fakeClass(log);
  const b = new TikTokBridge({ ConnectionClass: C, log: {} });
  const got = [];
  b.on('event', (e) => got.push(e));
  await b.connect('kenh');
  C.last.emit('chat', { content: 'mèo', user: { uniqueId: 'x' }, common: { createTime: String(Date.now() - 2000) } });
  C.last.emit('chat', { content: 'chó', user: { uniqueId: 'y' }, common: { createTime: String(Date.now() - 4000) } });
  assert.equal(got.length, 2);
  const st = b.delayStats();
  assert.ok(st.avg >= 2900 && st.avg < 3500 && st.max >= 3900, JSON.stringify(st));
  await b.disconnect();
});

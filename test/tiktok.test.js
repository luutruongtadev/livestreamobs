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
  C.last.emit('chat', { content: 'mèo', user: { uniqueId: 'x' }, common: { createTime: String(Date.now() - 1000) } });
  C.last.emit('chat', { content: 'chó', user: { uniqueId: 'y' }, common: { createTime: String(Date.now() - 2500) } });
  assert.equal(got.length, 2);
  const st = b.delayStats();
  assert.ok(st.avg >= 1600 && st.avg < 2200 && st.max >= 2400, JSON.stringify(st));
  await b.disconnect();
});

test('lọc tin TikTok gửi bù: lần đầu bỏ tin tạo trước khi kết nối; nối lại nhận tin trong lúc rớt; trùng mã thì bỏ; quà combo không bị bỏ nhầm', async () => {
  const log = [];
  const C = fakeClass(log);
  const b = new TikTokBridge({ ConnectionClass: C, log: {} });
  const got = [];
  b.on('event', (e) => got.push(e.type === 'comment' ? e.text : `${e.type}:${e.repeatCount ?? ''}`));
  const chat = (text, ago, id) => C.last.emit('chat', { content: text, user: { uniqueId: 'u' }, common: { createTime: String(Date.now() - ago), msgId: id } });
  await b.connect('kenh');
  chat('cũ 60s', 60_000, '1'); chat('cũ 10s', 10_000, '2'); chat('mới', 500, '3'); chat('mới', 500, '3');
  assert.deepEqual(got, ['mới'], 'bỏ tin cũ + tin trùng');
  assert.equal(b.replayed, 3);
  // rớt → trong lúc rớt có người bình luận → nối lại: TikTok gửi bù cả tin cũ lẫn tin trong lúc rớt
  b.retryDelay = 5;
  C.last.emit('disconnected', { code: 1006, reason: '' });
  await wait(30);
  chat('trước khi rớt (đã xử lý)', 2000, '3');
  chat('cũ từ lâu', 90_000, '9');
  chat('trong lúc rớt', 20, '10');
  assert.deepEqual(got.slice(1), ['trong lúc rớt']);
  // quà combo: nhiều tin cập nhật khác số lượng; tin kết thúc chuỗi vẫn được nhận
  const gift = (n, end) => C.last.emit('gift', { user: { uniqueId: 'g' }, giftId: 5655, repeatCount: n, repeatEnd: end, giftDetails: { giftName: 'Rose', giftType: 1, diamondCount: 1 }, common: { createTime: String(Date.now()), msgId: '77' } });
  gift(1, false); gift(2, false); gift(2, true); gift(2, true);
  assert.deepEqual(got.slice(2), ['gift:1', 'gift:1'], 'phát ngay phần tăng thêm, tin kết thúc chuỗi không tính lại');
  await b.disconnect();
});

test('quà combo: phát phần tăng thêm kèm tổng chuỗi; rớt mạng giữa chuỗi không mất; mất tin kết thúc thì chuỗi sau tính lại từ đầu', async () => {
  const C = fakeClass([]);
  const b = new TikTokBridge({ ConnectionClass: C, log: {} });
  const got = [];
  b.on('event', (e) => { if (e.type === 'gift') got.push([e.repeatCount, e.streakTotal]); });
  await b.connect('kenh');
  let id = 100;
  const gift = (n, end, user = 'g', type = 1) => C.last.emit('gift', { user: { uniqueId: user }, giftId: 5655, repeatCount: n, repeatEnd: end, giftDetails: { giftName: 'Rose', giftType: type, diamondCount: 1 }, common: { createTime: String(Date.now()), msgId: String(id++) } });
  gift(1, false); gift(3, false); gift(7, false);
  assert.deepEqual(got, [[1, 1], [2, 3], [4, 7]]);
  // rớt giữa chuỗi → nối lại → nhận tiếp phần còn lại (không mất, không tính trùng)
  b.retryDelay = 5;
  C.last.emit('disconnected', { code: 1006, reason: '' });
  await wait(30);
  gift(10, true);
  assert.deepEqual(got.at(-1), [3, 10]);
  // chuỗi mới của người khác / quà thường không ảnh hưởng nhau
  gift(2, false, 'h'); gift(1, false, 'g', 2);
  assert.deepEqual(got.slice(-2), [[2, 2], [1, undefined]]);
  // mất tin kết thúc của chuỗi 'h' → chuỗi mới bắt đầu lại từ 1
  gift(1, false, 'h');
  assert.deepEqual(got.at(-1), [1, 1]);
  await b.disconnect();
});

test('kết nối treo quá giờ → huỷ và hẹn thử lại; lần sau kết nối được', async () => {
  const log = [];
  let hang = true;
  class Slow extends EventEmitter {
    constructor() { super(); log.push('new'); Slow.last = this; }
    connect() { log.push('connect'); return hang ? new Promise(() => {}) : Promise.resolve({ roomId: 'R9' }); }
    async disconnect() { log.push('disconnect'); }
  }
  const b = new TikTokBridge({ ConnectionClass: Slow, connectTimeoutMs: 20, retryMs: 5, log: {} });
  await b.connect('kenh');
  assert.equal(b.status.state, 'retrying');
  assert.match(b.status.message, /quá/);
  assert.ok(log.includes('disconnect'), 'huỷ kết nối dở dang');
  hang = false;
  await wait(40);
  assert.equal(b.status.state, 'connected');
  assert.equal(b.roomId, 'R9');
  await b.disconnect();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Voice, speakableName, clip, WIN_LINES } from '../server/voice.js';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
function fakeFetch(calls, { status = 200, cost = null, account = { character_count: 1000, character_limit: 123970 } } = {}) {
  return async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
    return {
      ok: status === 200, status,
      headers: { get: (h) => (h === 'character-cost' && cost != null ? String(cost) : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      text: async () => 'quota exceeded',
      json: async () => account,
    };
  };
}
function fakeClaude(calls, line = 'Cảm ơn Lan đã tặng hoa hồng, thơm cả phòng live luôn!') {
  return { beta: { messages: { create: async (req) => { calls.push(req); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ line }) }] }; } } } };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const next = (v) => new Promise((r) => v.once('voice', r));
const win = (v, id, tier = 'lightning') => v.win({ by: { id, name: id.toUpperCase() }, tier });

test('đoán trúng: thư viện câu KHÔNG tên theo mức — lần đầu tạo + lưu, đủ rồi thì phát lại miễn phí, không lặp câu vừa nói', async () => {
  const tts = [], cl = [];
  const d = dir();
  const v = new Voice({ libraryPerTier: 3 }, { apiKey: 'k', claude: fakeClaude(cl), dir: d, fetchImpl: fakeFetch(tts), log: {} });
  const urls = [];
  for (let i = 0; i < 3; i++) { const got = next(v); win(v, 'p' + i); const o = await got; urls.push(o.url); assert.equal(o.reused, false); assert.ok(!/P\d/.test(o.text), 'không đọc tên'); }
  assert.equal(tts.length, 3);
  assert.equal(cl.length, 0, 'câu soạn sẵn, chưa cần Claude');
  assert.match(urls[0], /^\/voice\/lib\/lightning\/.+\.mp3$/);
  assert.ok(fs.existsSync(path.join(d, 'lib', 'lightning', path.basename(urls[0]))));
  assert.equal(tts[0].body.text, WIN_LINES.lightning[0]);
  let last = urls[2];
  for (let i = 0; i < 6; i++) { const got = next(v); win(v, 'q' + i); const o = await got; assert.equal(o.reused, true); assert.notEqual(o.url, last, 'không phát lại câu vừa nói'); last = o.url; }
  assert.equal(tts.length, 3, 'phát lại không tốn credit');
  // mức khác có thư viện riêng; lưu qua khởi động lại
  const got = next(v); win(v, 'z', 'clutch'); await got;
  const v2 = new Voice({ libraryPerTier: 3 }, { apiKey: 'k', dir: d, fetchImpl: fakeFetch(tts), log: {} });
  assert.deepEqual([v2.libCounts().lightning, v2.libCounts().clutch], [3, 1]);
});

test('hết câu soạn sẵn thì Claude (Haiku) viết câu mới không tên, khác các câu đã có', async () => {
  const tts = [], cl = [];
  const v = new Voice({ libraryPerTier: WIN_LINES.hint2.length + 1 }, { apiKey: 'k', claude: fakeClaude(cl, 'Hai gợi ý mà vẫn run tay, nhưng trúng rồi thì vỗ tay thôi!'), dir: dir(), fetchImpl: fakeFetch(tts), log: {} });
  await v.buildLibrary();
  assert.equal(v.libCounts().hint2, WIN_LINES.hint2.length + 1);
  const req = cl.find((r) => JSON.parse(r.messages[0].content).tinh_huong?.includes('hai gợi ý'));
  assert.ok(req);
  assert.equal(req.model, 'claude-haiku-5-5');
  assert.equal(req.betas, undefined, 'Haiku không gửi tham số fallback');
  assert.equal(JSON.parse(req.messages[0].content).cac_cau_da_co.length, WIN_LINES.hint2.length);
});

test('tặng quà: Claude viết câu có tên, ElevenLabs đọc đúng giọng; quà dưới mức tối thiểu thì để trình duyệt đọc', async () => {
  const tts = [], cl = [];
  const v = new Voice({ giftWindowSec: 0.02, minGiftDiamonds: 5 }, { apiKey: 'k', claude: fakeClaude(cl), dir: dir(), fetchImpl: fakeFetch(tts, { cost: 30 }), log: {} });
  v.gift({ by: { id: 'lan', name: 'Lan 🌸' }, giftName: 'Rose', repeat: 1, diamonds: 1 });
  await wait(60);
  assert.equal(tts.length, 0, '1 xu < 5 xu: không gọi ElevenLabs');
  const got = next(v);
  v.gift({ by: { id: 'lan', name: 'Lan 🌸' }, giftName: 'Rose', repeat: 10, diamonds: 10 });
  const o = await got;
  assert.match(o.text, /Lan/);
  assert.match(tts[0].url, /text-to-speech\/eGSd0uV8dNQnZuEEX9lu/);
  assert.deepEqual([tts[0].body.model_id, tts[0].body.language_code], ['eleven_flash_v2_5', 'vi']);
  assert.equal(JSON.parse(cl[0].messages[0].content).ten_nguoi_tang, 'Lan');
  assert.equal(v.status().today, 30, 'ghi nhận credit theo ElevenLabs trả về');
});

test('quà liên tiếp của cùng người gom thành 1 câu; Claude lỗi thì dùng câu mẫu', async () => {
  const tts = [];
  const broken = { beta: { messages: { create: async () => { throw new Error('mạng lỗi'); } } } };
  const v = new Voice({ giftWindowSec: 0.05 }, { apiKey: 'k', claude: broken, dir: dir(), fetchImpl: fakeFetch(tts), log: {} });
  const got = next(v);
  for (let i = 0; i < 3; i++) v.gift({ by: { id: 'b', name: 'Lan' }, giftName: 'Rose', repeat: 1, diamonds: 1 });
  const out = await got;
  assert.equal(tts.length, 1);
  assert.match(out.text, /Lan/);
});

test('ngân sách: hết credit / ngày hoặc tài khoản sắp cạn → ngừng gọi ElevenLabs, báo trang game tự đọc; thư viện vẫn phát lại được', async () => {
  const tts = [];
  const v = new Voice({ dailyCredits: 40, libraryPerTier: 1, giftWindowSec: 0.01 }, { apiKey: 'k', dir: dir(), fetchImpl: fakeFetch(tts, { cost: 50 }), log: {} });
  const states = [];
  v.on('state', (s) => states.push(s.enabled));
  let got = next(v); win(v, 'a'); await got; // tạo câu thư viện: 50 credit > 40
  assert.equal(v.canSpend(), false);
  assert.deepEqual(states, [false]);
  v.gift({ by: { id: 'x', name: 'X' }, giftName: 'Rose', diamonds: 10 });
  await wait(40);
  assert.equal(tts.length, 1, 'quà không gọi ElevenLabs nữa');
  got = next(v); win(v, 'b'); const o = await got;
  assert.equal(o.reused, true, 'câu đoán trúng vẫn phát lại từ thư viện');
  // số dư tài khoản dưới mức dự trữ
  const low = new Voice({ reserveCredits: 1000 }, { apiKey: 'k', dir: dir(), fetchImpl: fakeFetch([], { account: { character_count: 123500, character_limit: 123970 } }), log: {} });
  await low.refreshAccount();
  assert.deepEqual([low.account.remaining, low.canSpend()], [470, false]);
});

test('không có key thì tắt; ElevenLabs lỗi thì ghi lỗi, không văng; cắt câu dài theo số ký tự', async () => {
  assert.equal(new Voice({}, { dir: dir() }).enabled, false);
  const v = new Voice({ giftWindowSec: 0.01 }, { apiKey: 'k', dir: dir(), fetchImpl: fakeFetch([], { status: 401 }), log: {} });
  v.gift({ by: { id: 'a', name: 'A' }, giftName: 'Rose', diamonds: 5 });
  await wait(40);
  assert.match(v.status().lastError, /ElevenLabs 401/);
  const long = 'Cảm ơn bạn rất nhiều '.repeat(12);
  assert.ok(clip(long, 130).length <= 131);
  assert.equal(speakableName('🔥💎 Bé Na ✨✨'), 'Bé Na');
});

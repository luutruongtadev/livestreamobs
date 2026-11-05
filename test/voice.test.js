import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Voice, speakableName } from '../server/voice.js';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
function fakeFetch(calls, status = 200) {
  return async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: status === 200, status, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, text: async () => 'quota exceeded' };
  };
}
function fakeClaude(calls, line = 'Minh Anh trúng phóc, não to như cái nồi cơm điện!') {
  return { beta: { messages: { create: async (req) => { calls.push(req); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ line }) }] }; } } } };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const next = (v) => new Promise((r) => v.once('voice', r));

test('đoán trúng: Claude viết câu trêu, ElevenLabs đọc giọng Adam (tiếng Việt), lưu mp3, phát sự kiện', async () => {
  const tts = [], cl = [];
  const d = dir();
  const v = new Voice({}, { apiKey: 'k', claude: fakeClaude(cl), dir: d, fetchImpl: fakeFetch(tts), log: {} });
  assert.equal(v.enabled, true);
  const got = next(v);
  v.win({ by: { id: 'a', name: 'Minh Anh 🌸' }, answer: 'lò vi sóng', seconds: 6, hintLevel: 0, tier: 'lightning', left: 290 });
  const out = await got;
  assert.match(out.text, /Minh Anh/);
  assert.match(out.url, /^\/voice\/.+\.mp3$/);
  assert.ok(fs.existsSync(path.join(d, path.basename(out.url))));
  assert.match(tts[0].url, /text-to-speech\/pNInz6obpgDQGcFmaJgB/);
  assert.equal(tts[0].opts.headers['xi-api-key'], 'k');
  assert.deepEqual([tts[0].body.model_id, tts[0].body.language_code], ['eleven_flash_v2_5', 'vi']);
  const ctx = JSON.parse(cl[0].messages[0].content);
  assert.deepEqual([ctx.su_kien, ctx.ten_nguoi_choi, ctx.muc], ['doan_trung', 'Minh Anh', 'lightning']);
  assert.equal(cl[0].model, 'claude-opus-5-5');
});

test('quà liên tiếp của cùng người được gom thành 1 câu; Claude lỗi thì dùng câu mẫu', async () => {
  const tts = [];
  const broken = { beta: { messages: { create: async () => { throw new Error('mạng lỗi'); } } } };
  const v = new Voice({ giftWindowSec: 0.05 }, { apiKey: 'k', claude: broken, dir: dir(), fetchImpl: fakeFetch(tts), log: {} });
  const got = next(v);
  for (let i = 0; i < 3; i++) v.gift({ by: { id: 'b', name: 'Lan' }, giftName: 'Rose', repeat: 1, diamonds: 1 });
  const out = await got;
  assert.equal(tts.length, 1, 'chỉ đọc 1 câu');
  assert.match(out.text, /Lan/);
  await wait(100);
  assert.equal(tts.length, 1);
});

test('không có key thì tắt; ElevenLabs lỗi thì ghi lỗi, không văng; giới hạn số câu mỗi giờ', async () => {
  assert.equal(new Voice({}, { dir: dir() }).enabled, false);
  const tts = [];
  const v = new Voice({ maxPerHour: 1 }, { apiKey: 'k', dir: dir(), fetchImpl: fakeFetch(tts, 401), log: {} });
  v.win({ by: { id: 'a', name: 'A' }, answer: 'x', seconds: 1, hintLevel: 0, tier: 'lightning' });
  await wait(20);
  assert.match(v.status().lastError, /ElevenLabs 401/);
  const ok = new Voice({ maxPerHour: 1 }, { apiKey: 'k', dir: dir(), fetchImpl: fakeFetch(tts), log: {} });
  ok.win({ by: { id: 'a', name: 'A' } }); ok.win({ by: { id: 'b', name: 'B' } });
  await wait(30);
  assert.equal(ok.status().spoken, 1);
  assert.match(ok.status().lastError, /1 câu/);
  assert.equal(speakableName('🔥💎 Bé Na ✨✨'), 'Bé Na');
});

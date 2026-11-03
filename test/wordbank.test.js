import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WordBank, validWord } from '../server/wordbank.js';
import { WordGame } from '../server/wordgame.js';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wb-')), 'wordbank.json');
function fakeClient(words) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (req) => {
      calls.push(req);
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ words }) }] };
    } } },
  };
}

test('validWord: 1-3 tiếng, chỉ chữ cái', () => {
  assert.ok(validWord('Bánh Xèo'));
  assert.ok(!validWord('xe đạp điện thông minh'));
  assert.ok(!validWord('7 up'));
  assert.ok(!validWord('cà-phê'));
});

test('generate: lọc từ sai, trùng, gợi ý lộ từ; lưu file; gửi đúng model + danh sách tránh', async () => {
  const file = tmpFile();
  const client = fakeClient([
    { word: 'Bánh Xèo', hint: 'Món ăn' },
    { word: 'bánh xèo', hint: 'Món ăn' }, // trùng
    { word: 'con mèo', hint: 'Động vật' }, // đã có trong danh sách dự phòng
    { word: 'xe đạp điện thông minh', hint: 'Phương tiện' }, // quá dài
    { word: 'cái ô', hint: 'cái ô che mưa' }, // gợi ý chứa từ
    { word: 'đèn lồng', hint: 'Trung thu' },
  ]);
  const bank = new WordBank({ filePath: file, fallbackWords: [{ word: 'con mèo', hint: 'Động vật' }], client, log: {} });
  const r = await bank.generate({ theme: 'Lễ hội' });
  assert.equal(r.added, 2);
  assert.deepEqual(r.batch.words.map((w) => w.word), ['bánh xèo', 'đèn lồng']);
  const req = client.calls[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.match(req.messages[0].content, /Soạn 100 từ/);
  assert.match(req.messages[0].content, /Lễ hội/);
  assert.match(req.messages[0].content, /con mèo/);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).batches.length, 1);
});

test('next: lấy từ chưa dùng, không lặp; hết kho thì dùng danh sách dự phòng', async () => {
  const bank = new WordBank({ filePath: tmpFile(), fallbackWords: [{ word: 'mặt trời', hint: 'Thiên nhiên' }], client: fakeClient([{ word: 'phở', hint: 'Món ăn' }, { word: 'áo dài', hint: 'Trang phục' }]), autoGenerate: false, log: {} });
  await bank.generate();
  const a = bank.next(), b = bank.next();
  assert.notEqual(a.word, b.word);
  assert.equal(a.source, 'bank');
  assert.equal(bank.stats().remaining, 0);
  assert.deepEqual(bank.next(), { word: 'mặt trời', hint: 'Thiên nhiên', source: 'config' });
});

test('tự tạo lô mới khi kho sắp hết; không có API key thì dùng config', async () => {
  const client = fakeClient([{ word: 'phở', hint: 'Món ăn' }]);
  const bank = new WordBank({ filePath: tmpFile(), fallbackWords: [{ word: 'mặt trời', hint: 'Thiên nhiên' }], client, minRemaining: 10, log: {} });
  bank.next();
  await bank.generating;
  assert.equal(client.calls.length, 1, 'đã tự gọi Claude');
  assert.equal(bank.stats().total, 1);
  const noKey = new WordBank({ fallbackWords: [{ word: 'mặt trời', hint: 'Thiên nhiên' }] });
  assert.equal(noKey.stats().canGenerate, false);
  await assert.rejects(noKey.generate(), /ANTHROPIC_API_KEY/);
});

test('WordGame lấy từ bí mật từ kho', async () => {
  const bank = new WordBank({ filePath: tmpFile(), client: fakeClient([{ word: 'bánh xèo', hint: 'Món ăn' }]), autoGenerate: false, log: {} });
  await bank.generate();
  const g = new WordGame({ words: [] }, { scorer: { score: async () => ({ score: 1 }) }, wordBank: bank });
  assert.equal(g.secret, 'bánh xèo');
  assert.equal(g.category, 'Món ăn');
});

test('độ khó khi sinh từ: mặc định "hard" (tránh từ quá phổ biến, chủ đề gợi ý rộng), chỉnh được easy / medium', async () => {
  const client = fakeClient([{ word: 'ống nhòm', hint: 'Đồ vật' }]);
  const bank = new WordBank({ filePath: tmpFile(), client, autoGenerate: false, log: {} });
  assert.equal(bank.stats().difficulty, 'hard');
  const { batch } = await bank.generate();
  assert.equal(batch.difficulty, 'hard');
  assert.match(client.calls[0].messages[0].content, /Độ khó: KHÓ/);
  assert.match(client.calls[0].messages[0].content, /Tránh các từ quá phổ biến/);
  const easy = fakeClient([{ word: 'con mèo', hint: 'Động vật' }]);
  await new WordBank({ filePath: tmpFile(), client: easy, difficulty: 'easy', autoGenerate: false, log: {} }).generate();
  assert.match(easy.calls[0].messages[0].content, /Độ khó: DỄ/);
  assert.equal(new WordBank({ difficulty: 'lung tung' }).stats().difficulty, 'hard');
});

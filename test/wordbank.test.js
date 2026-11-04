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
  assert.deepEqual(bank.next(), { word: 'mặt trời', hint: 'Thiên nhiên', desc: [], emoji: '', source: 'config' });
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

test('sinh lô mới kèm 2 câu mô tả + 3 emoji; câu lộ đáp án bị loại; next() trả về gợi ý', async () => {
  const client = fakeClient([
    { word: 'ống nhòm', hint: 'Đồ vật', desc: ['rừng · chim · đi phượt', 'ống kính · nhìn xa', 'nhìn xa · kính · hai mắt'], emoji: '👀 🦅 ⛰️' },
    { word: 'ký ức', hint: 'Khái niệm', desc: ['Thứ ai cũng mang theo mà không thấy', 'Nhớ về ngày xưa'], emoji: '' },
  ]);
  const bank = new WordBank({ filePath: tmpFile(), client, autoGenerate: false, log: {} });
  await bank.generate();
  const w = bank.allWords().find((x) => x.word === 'ống nhòm');
  assert.deepEqual(w.desc, ['rừng · chim · đi phượt', 'nhìn xa · kính · hai mắt']); // "ống kính…" lộ chữ "ống"
  assert.equal(w.emoji, '👀 🦅 ⛰️');
  assert.equal(bank.allWords().find((x) => x.word === 'ký ức').emoji, '');
  assert.match(client.calls[0].system, /"desc": đúng 2 gợi ý/);
  const picked = [bank.next(), bank.next()];
  assert.ok(picked.every((p) => p.desc.length === 2));
});

test('bổ sung gợi ý cho từ cũ và từ có sẵn (backfillHints)', async () => {
  const calls = [];
  const client = { beta: { messages: { create: async (req) => {
    calls.push(req);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ items: [
      { word: 'mặt trời', desc: ['Sáng nào cũng ló dạng ở phía đông', 'Thiếu nó cây cối không lớn được'], emoji: '🌅 ☀️ 🌻' },
      { word: 'phở', desc: ['Bữa sáng quen thuộc của người Hà Nội', 'Phở bò tái nạm'], emoji: '🍜' },
      { word: 'không có trong danh sách', desc: ['x', 'y'], emoji: '' },
    ] }) }] };
  } } } };
  const bank = new WordBank({ filePath: tmpFile(), fallbackWords: [{ word: 'mặt trời', hint: 'Thiên nhiên' }, { word: 'phở', hint: 'Món ăn' }], client, autoGenerate: false, log: {} });
  assert.equal(bank.stats().missingHints, 2);
  const r = await bank.backfillHints();
  assert.deepEqual(r, { added: 2, remaining: 0 });
  assert.match(calls[0].messages[0].content, /- mặt trời \(chủ đề: Thiên nhiên\)/);
  assert.deepEqual(bank.data.extra['phở'], { desc: ['Bữa sáng quen thuộc của người Hà Nội'], emoji: '' }); // câu lộ "phở" bị loại; 1 emoji → bỏ
  const w = bank.next();
  assert.ok(w.desc.length >= 1);
  const again = new WordBank({ filePath: bank.filePath, fallbackWords: [{ word: 'mặt trời', hint: 'Thiên nhiên' }], log: {} });
  assert.equal(again.hintsFor({ word: 'mặt trời' }).emoji, '🌅 ☀️ 🌻'); // đã lưu file
  await assert.rejects(again.backfillHints(), /ANTHROPIC_API_KEY/);
});

test('hintsFor: đặt từ chỉ bằng chữ vẫn lấy được gợi ý có sẵn trong danh sách / kho', () => {
  const bank = new WordBank({ fallbackWords: [{ word: 'la bàn', hint: 'Đồ vật', desc: ['thám hiểm · thủy thủ', 'kim chỉ · hướng bắc'], emoji: '🧭 🗺️ ⛵' }], log: {} });
  assert.deepEqual(bank.hintsFor({ word: 'La Bàn' }), { desc: ['thám hiểm · thủy thủ', 'kim chỉ · hướng bắc'], emoji: '🧭 🗺️ ⛵' });
  assert.deepEqual(bank.hintsFor({ word: 'không có' }), { desc: [], emoji: '' });
});

test('admin thêm từ: vào bộ riêng (lưu file riêng, tải lại vẫn còn) và vào kho từ vựng (lô admin)', async () => {
  const { WordSetStore } = await import('../server/wordsets.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
  const repoDir = path.join(root, 'repo'); fs.mkdirSync(repoDir);
  fs.writeFileSync(path.join(repoDir, 'trend.json'), JSON.stringify({ title: 'T', words: [{ word: 'flex', hints: ['a'] }] }));
  const dataDir = path.join(root, 'data', 'wordsets');
  const store = new WordSetStore({ repoDir, dataDir, log: {} });
  store.addWord('trend', { word: 'farm aura', aliases: ['aura farming'], hints: ['anime · ngầu', 'tạo dáng'] });
  store.addWord('trend', { word: 'Farm  Aura', aliases: [], hints: ['sửa lại'] }); // cùng từ → cập nhật, không trùng
  assert.equal(store.sets.trend.words.length, 2);
  assert.equal(store.sets.trend.words[0].word, 'Farm  Aura');
  assert.ok(fs.existsSync(path.join(root, 'data', 'added-words.json')));
  assert.ok(!fs.existsSync(path.join(dataDir, 'trend.json')), 'không ghi đè cả bộ');
  const again = new WordSetStore({ repoDir, dataDir, log: {} });
  assert.deepEqual(again.sets.trend.words.map((w) => w.hints[0]), ['sửa lại', 'a']);
  assert.throws(() => again.addWord('khong-co', { word: 'x', hints: [] }), /Không có bộ/);

  const bank = new WordBank({ filePath: tmpFile(), log: {} });
  bank.addManual({ word: 'Cầu Thủ', hint: 'Thể thao', desc: ['sân cỏ · áo số'], emoji: '⚽ 👟 🏟️' });
  assert.deepEqual(bank.next(), { word: 'cầu thủ', hint: 'Thể thao', desc: ['sân cỏ · áo số'], emoji: '⚽ 👟 🏟️', source: 'bank' });
  assert.throws(() => bank.addManual({ word: 'quá nhiều tiếng ở đây' }), /1-3 tiếng/);
});

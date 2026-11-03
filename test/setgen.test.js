import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SetGenerator, cleanHints } from '../server/setgen.js';
import { WordSetStore } from '../server/wordsets.js';
import { WordGame } from '../server/wordgame.js';

function fakeClient(payload) {
  const calls = [];
  return {
    calls,
    beta: { messages: { stream: (req) => {
      calls.push(req);
      return { finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(payload) }] }) };
    } } },
  };
}

test('cleanHints: bỏ gợi ý lộ đáp án / biệt danh, cắt dấu chấm, tối đa 5', () => {
  const h = cleanHints('Lionel Messi', ['messi'], ['Đội tuyển Argentina.', 'Tên là Messi', 'Áo số 10', 'lionelmessi giỏi', 'Quả bóng vàng', 'Barcelona', 'Inter Miami']);
  assert.deepEqual(h, ['Đội tuyển Argentina', 'Áo số 10', 'Quả bóng vàng', 'Barcelona', 'Inter Miami']);
});

test('generateSet: tạo bộ theo chủ đề, lọc từ sai / trùng / gợi ý lộ đáp án', async () => {
  const client = fakeClient({
    title: 'Đoán cầu thủ', secretLabel: 'cầu thủ bí mật', scoreContext: 'Chấm theo đội bóng, vị trí, quốc tịch.',
    words: [
      { word: 'Cristiano Ronaldo', aliases: ['CR7', 'ronaldo'], hints: ['Bồ Đào Nha', 'Ăn mừng Siuuu', 'Áo số 7', 'Real Madrid', 'Ronaldo béo?'] },
      { word: 'cristiano ronaldo', aliases: [], hints: ['a', 'b', 'c'] }, // trùng
      { word: 'Một cái tên rất là dài quá mức', aliases: [], hints: ['a', 'b', 'c'] }, // quá dài
      { word: 'Quang Hải', aliases: ['hải con'], hints: ['Đội tuyển Việt Nam', 'Cú sút cầu vồng', 'Hà Nội FC'] },
      { word: 'Pelé', aliases: [], hints: ['Brazil', 'Pelé vĩ đại'] }, // còn 1 gợi ý hợp lệ
    ],
  });
  const gen = new SetGenerator({ client, log: {} });
  const set = await gen.generateSet({ topic: 'Cầu thủ bóng đá', count: 30 });
  assert.equal(set.title, 'Đoán cầu thủ');
  assert.equal(set.secretLabel, 'CẦU THỦ BÍ MẬT');
  assert.deepEqual(set.words.map((w) => w.word), ['Cristiano Ronaldo', 'Quang Hải']);
  assert.deepEqual(set.words[0].hints, ['Bồ Đào Nha', 'Ăn mừng Siuuu', 'Áo số 7', 'Real Madrid']);
  const req = client.calls[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.match(req.messages[0].content, /Soạn 30 từ/);
  assert.match(req.messages[0].content, /Cầu thủ bóng đá/);
});

test('regenerateHints: viết lại gợi ý cho 1 từ, gửi kèm gợi ý cũ + yêu cầu', async () => {
  const set = JSON.parse(fs.readFileSync(new URL('../wordsets/lmht.json', import.meta.url)));
  const client = fakeClient({ aliases: ['ahri'], hints: ['Vastaya đến từ Ionia', 'Tên Ahri xuất hiện', 'Quyến rũ đối thủ', 'Cầu đi rồi về', 'Ba lần lướt'] });
  const gen = new SetGenerator({ client, log: {} });
  const e = await gen.regenerateHints({ set, word: 'ahri', note: 'tập trung chiêu thức' });
  assert.equal(e.word, 'Ahri');
  assert.equal(e.hints.length, 4, 'gợi ý chứa tên bị loại');
  assert.match(client.calls[0].messages[0].content, /Gợi ý hiện tại/);
  assert.match(client.calls[0].messages[0].content, /tập trung chiêu thức/);
  await assert.rejects(gen.regenerateHints({ set, word: 'Không Có' }), /Không có/);
  await assert.rejects(new SetGenerator({}).generateSet({ topic: 'x' }), /ANTHROPIC_API_KEY/);
});

test('WordSetStore: bản trong data ghi đè repo, xoá thì khôi phục bản gốc; id không trùng', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
  const repo = path.join(root, 'repo'), data = path.join(root, 'data');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'lmht.json'), JSON.stringify({ title: 'Gốc', words: [{ word: 'Ahri', hints: ['a'] }] }));
  const st = new WordSetStore({ repoDir: repo, dataDir: data, log: {} });
  const shared = st.sets;
  st.save('lmht', { title: 'Đã sửa', words: [{ word: 'Ahri', hints: ['b'] }] });
  st.save('cau-thu', { title: 'Cầu thủ', words: [] });
  assert.equal(new WordSetStore({ repoDir: repo, dataDir: data, log: {} }).sets.lmht.title, 'Đã sửa');
  assert.equal(st.newId('Cầu thủ'), 'cau-thu-2');
  assert.equal(st.remove('lmht'), 'restored');
  assert.equal(st.sets.lmht.title, 'Gốc');
  assert.equal(st.remove('cau-thu'), 'deleted');
  assert.equal(st.sets['cau-thu'], undefined);
  assert.equal(shared, st.sets, 'giữ nguyên object dùng chung với WordGame');
  assert.throws(() => st.remove('lmht'), /không có bản/);
});

test('WordGame.updateWord: đúng từ đang chơi thì đổi gợi ý ngay', () => {
  const sets = { lmht: { title: 'LMHT', words: [{ word: 'Ahri', aliases: [], hints: ['h1', 'h2', 'h3', 'h4', 'h5'] }] } };
  const g = new WordGame({}, { scorer: { score: async () => ({ score: 1 }) }, wordSets: sets });
  g.setWordSet('lmht');
  g.revealHint(); g.revealHint();
  const fx = g.updateWord('lmht', { word: 'Ahri', aliases: ['hồ ly'], hints: ['n1', 'n2', 'n3', 'n4'] });
  assert.equal(fx[0].type, 'wg_hints_updated');
  assert.deepEqual(g.snapshot().hints, ['n1', 'n2']);
  assert.equal(g.handle({ type: 'comment', user: { id: 'x', name: 'x' }, text: 'Hồ Ly' })[0].type, 'wg_win');
  assert.deepEqual(g.updateWord('lmht', { word: 'Yasuo', hints: ['a'] }), []);
});

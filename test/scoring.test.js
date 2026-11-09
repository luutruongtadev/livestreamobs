import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { LayeredScorer, scoreOf, levenshtein, cleanPack, packIndex, dictLookup, fuzzyLookup, SCORE_BANDS } from '../server/scoring.js';
import { WordGame } from '../server/wordgame.js';

const PACK = {
  synonyms: ['trường đại học', 'university', 'đh'],
  strongRelated: ['sinh viên', 'giảng đường', 'giáo sư', 'cao đẳng'],
  related: ['học sinh', 'giáo dục', 'trường'],
  weakRelated: ['con người', 'sách'],
  unrelated: ['đồ ăn', 'xe máy'],
};

/** Claude giả: trả pack khi được hỏi soạn pack; phân loại theo bảng khi chấm. */
function fakeClient({ pack = PACK, judge = {}, fail = false } = {}) {
  const calls = { pack: 0, judge: 0, words: [], opts: [] };
  return {
    calls,
    beta: { messages: { create: async (req, opts) => {
      calls.opts.push(opts);
      if (fail) throw new Error('down');
      const content = req.messages[0].content;
      if (!content.includes('TỪ ĐOÁN:')) { calls.pack++; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(pack) }] }; }
      calls.judge++;
      const words = JSON.parse(content.split('TỪ ĐOÁN: ')[1]);
      calls.words.push(words);
      const results = words.map((w) => ({ guess: w, ...(judge[w] || { category: 'UNRELATED', confidence: 0.9 }) }));
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ results }) }] };
    } } },
  };
}

const inBand = (score, cat) => score >= SCORE_BANDS[cat][0] && score <= SCORE_BANDS[cat][1];

test('Score Engine + Levenshtein: loại → khoảng điểm, Node quyết định điểm', () => {
  assert.equal(scoreOf('VERY_CLOSE', 1), 97);
  assert.equal(scoreOf('VERY_CLOSE', 0), 90);
  assert.equal(scoreOf('UNRELATED', 0), 1);
  assert.equal(scoreOf('RELATED', 2), 72, 'kẹp trong khoảng');
  assert.equal(scoreOf('XYZ'), null);
  assert.equal(levenshtein('daihoc', 'daihocc'), 1);
  assert.equal(levenshtein('daihoc', 'dhaioc'), 2);
});

test('Lớp 1 — Knowledge Pack: có dấu so đúng chữ, không dấu / dính liền so bản bỏ dấu; bỏ chính từ bí mật & trùng', () => {
  const pack = cleanPack('đại học', { ...PACK, related: [...PACK.related, 'Đại Học', 'sinh viên'] });
  assert.ok(!pack.related.includes('đại học'), 'không chứa chính đáp án');
  assert.equal(pack.related.filter((w) => w === 'sinh viên').length, 0, 'trùng thì giữ ở nhóm mạnh hơn');
  const idx = packIndex(pack);
  assert.equal(dictLookup(idx, 'sinh viên').category, 'STRONG_RELATED');
  assert.equal(dictLookup(idx, 'sinh vien').category, 'STRONG_RELATED');
  assert.equal(dictLookup(idx, 'SinhVien').category, 'STRONG_RELATED');
  assert.equal(dictLookup(idx, 'đồ ăn').category, 'UNRELATED');
  assert.ok(dictLookup(idx, 'sinh viên').strength > dictLookup(idx, 'cao đẳng').strength, 'đứng trước trong nhóm = mạnh hơn');
  assert.equal(dictLookup(idx, 'bầu trời'), null);
});

test('Lớp 2 — Fuzzy: gõ sai đáp án → rất gần; gõ sai từ trong pack → nhóm của từ đó; từ quá ngắn / mơ hồ thì bỏ qua', () => {
  const idx = packIndex(cleanPack('đại học', PACK));
  const typo = fuzzyLookup('đại họcc', { secret: 'đại học', index: idx });
  assert.equal(typo.category, 'VERY_CLOSE');
  assert.equal(scoreOf(typo.category, typo.strength), 97);
  assert.equal(fuzzyLookup('đạihọc', { secret: 'đại học', index: idx }), null, 'trùng khít (bỏ dấu) là đoán trúng, WordGame tự xử lý');
  assert.equal(fuzzyLookup('giảng đươngg', { secret: 'đại học', index: idx }).category, 'STRONG_RELATED');
  assert.equal(fuzzyLookup('sáh', { secret: 'đại học', index: idx }), null, 'từ ≤ 3 ký tự không đoán là gõ sai');
  assert.equal(fuzzyLookup('hà nội', { secret: 'đại học', aliases: ['hanoi university'], index: idx }), null);
});

test('LayeredScorer: soạn pack 1 lần đầu vòng; từ trong pack / gõ sai có điểm ngay, không gọi Claude', async () => {
  const client = fakeClient();
  const s = new LayeredScorer({ client, batchMs: 5, log: {} });
  await Promise.all([s.prepare('đại học'), s.prepare('Đại Học')]);
  assert.equal(client.calls.pack, 1, 'gọi soạn pack đúng 1 lần');
  const r1 = await s.score('đại học', 'sinh viên');
  assert.equal(r1.source, 'dict'); assert.ok(inBand(r1.score, 'STRONG_RELATED'));
  const r2 = await s.score('đại học', 'truong dai hoc');
  assert.equal(r2.source, 'dict'); assert.ok(inBand(r2.score, 'VERY_CLOSE'));
  const r3 = await s.score('đại học', 'đại họcc');
  assert.equal(r3.source, 'fuzzy'); assert.equal(r3.score, 97);
  const r4 = await s.score('đại học', 'do an');
  assert.equal(r4.source, 'dict'); assert.ok(inBand(r4.score, 'UNRELATED'));
  assert.ok((await s.score('đại học', 'học sinh')).score > (await s.score('đại học', 'con người')).score);
  assert.equal(client.calls.judge, 0, 'chưa phải gọi Claude chấm');
  assert.deepEqual([s.stats().dict, s.stats().fuzzy, s.stats().claude], [5, 1, 0]);
  assert.ok(client.calls.opts.every((o) => o?.timeout > 0), 'có timeout');
});

test('LayeredScorer Lớp 4: từ chưa rõ gom 1 lô gửi Claude PHÂN LOẠI, Node quy ra điểm, cache lại', async () => {
  const client = fakeClient({ judge: { 'thạc sĩ': { category: 'STRONG_RELATED', confidence: 0.9 }, 'bầu trời': { category: 'UNRELATED', confidence: 0.95 }, 'thư viện': { category: 'RELATED', confidence: 0.6 } } });
  const s = new LayeredScorer({ client, batchMs: 5, log: {} });
  await s.prepare('đại học');
  const [a, b, c] = await Promise.all([s.score('đại học', 'thạc sĩ'), s.score('đại học', 'Bầu Trời'), s.score('đại học', 'thư viện')]);
  assert.equal(client.calls.judge, 1, 'một lô');
  assert.deepEqual(client.calls.words[0].sort(), ['bầu trời', 'thư viện', 'thạc sĩ']);
  assert.equal(a.category, 'STRONG_RELATED'); assert.ok(inBand(a.score, 'STRONG_RELATED'));
  assert.ok(inBand(b.score, 'UNRELATED'));
  assert.ok(inBand(c.score, 'RELATED') && c.score < scoreOf('RELATED', 0.5), 'tin cậy thấp → nửa dưới khoảng điểm');
  assert.equal((await s.score('đại học', 'thạc sĩ')).source, 'cache');
  assert.equal(client.calls.judge, 1);
});

test('LayeredScorer: điểm của bộ chấm cũ trong cache vẫn dùng; lưu / nạp pack + cache; Claude lỗi thì chấm đơn giản', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoring-'));
  const cachePath = path.join(dir, 'cache.json'), packPath = path.join(dir, 'packs.json');
  fs.writeFileSync(cachePath, JSON.stringify({ 'mặt trời|nắng|v3-rel': 85 }));
  const client = fakeClient();
  const s = new LayeredScorer({ client, batchMs: 5, cachePath, packPath, log: {} });
  assert.deepEqual(await s.score('mặt trời', 'nắng'), { score: 85, source: 'cache', category: null });
  await s.prepare('đại học');
  s.saveCache();
  const s2 = new LayeredScorer({ client, batchMs: 5, cachePath, packPath, log: {} });
  await s2.prepare('đại học');
  assert.equal(client.calls.pack, 1, 'pack đã lưu, không soạn lại');
  assert.equal((await s2.score('đại học', 'giáo sư')).source, 'dict');
  const bad = new LayeredScorer({ client: fakeClient({ fail: true }), batchMs: 5, log: {} });
  assert.equal(await bad.prepare('mặt trời'), null);
  const r = await bad.score('mặt trời', 'trời');
  assert.equal(r.source, 'simple');
  assert.ok(r.score >= 1 && r.score <= 99);
});

test('LayeredScorer: giới hạn số request Claude cùng lúc, lô quá lớn tách nhỏ', async () => {
  let inflight = 0, peak = 0;
  const client = { beta: { messages: { create: async (req) => {
    inflight++; peak = Math.max(peak, inflight);
    await new Promise((r) => setTimeout(r, 15));
    inflight--;
    const words = JSON.parse(req.messages[0].content.split('TỪ ĐOÁN: ')[1]);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ results: words.map((w) => ({ guess: w, category: 'RELATED', confidence: 0.8 })) }) }] };
  } } } };
  const s = new LayeredScorer({ client, batchMs: 2, maxBatch: 3, maxInflight: 2, log: {} });
  const words = Array.from({ length: 12 }, (_, i) => `từ số ${i}`);
  const out = await Promise.all(words.map((w) => s.score('mặt trời', w)));
  assert.ok(out.every((r) => r.source === 'claude' && inBand(r.score, 'RELATED')));
  assert.equal(s.stats().judgeCalls, 4, '12 từ / lô 3 = 4 lần gọi');
  assert.ok(peak <= 2, `tối đa 2 request cùng lúc (thực tế ${peak})`);
});

test('WordGame: đầu vòng gọi prepare() soạn pack; chấm truyền cách gọi khác (aliases); từ có điểm ngay không tính vào độ trễ', async () => {
  const prepared = [];
  const scorer = {
    prepare: (secret, ctx) => { prepared.push([secret, ctx]); return Promise.resolve(); },
    score: async (secret, word, ctx, opts) => ({ score: 80, source: 'dict', opts }),
  };
  let now = 0;
  const g = new WordGame({ words: [{ word: 'đại học', aliases: ['university'] }], modes: ['meaning'], cooldownSec: 0 }, { scorer, now: () => now });
  assert.deepEqual(prepared[0], ['đại học', null]);
  const fx = [];
  g.on('effects', (e) => fx.push(...e));
  g.handle({ type: 'comment', user: { id: 'a', name: 'A' }, text: 'sinh viên' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(fx.find((e) => e.type === 'wg_scored').score, 80);
  assert.equal(g.scoreDelayStats(), null, 'chấm bằng từ điển không tính độ trễ');
});

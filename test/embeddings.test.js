import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrate, embedClassify, normalizeVec, cosine, Embedder } from '../server/embeddings.js';
import { LayeredScorer, SCORE_BANDS } from '../server/scoring.js';

const CATS = ['VERY_CLOSE', 'STRONG_RELATED', 'RELATED', 'WEAKLY_RELATED', 'UNRELATED'];
const LEVEL = { VERY_CLOSE: 0.9, STRONG_RELATED: 0.72, RELATED: 0.52, WEAKLY_RELATED: 0.32, UNRELATED: 0.05 };

/** Vector có cosine = c với từ bí mật (trục 0), nằm trong "cụm" của nhóm cat (trục 1..5), thêm chút nhiễu riêng (trục 6+i). */
function vec(c, cat, i = 0) {
  const v = new Array(40).fill(0);
  v[0] = c;
  const rest = Math.sqrt(1 - c * c);
  v[1 + CATS.indexOf(cat)] = rest * 0.9;
  v[6 + (i % 34)] = rest * Math.sqrt(1 - 0.9 * 0.9);
  return v;
}

const PACK = {
  synonyms: ['trường đại học', 'university', 'đh'],
  strongRelated: ['sinh viên', 'giảng đường', 'giáo sư', 'cao đẳng'],
  related: ['học sinh', 'giáo dục', 'thi cử'],
  weakRelated: ['con người', 'sách', 'thành phố'],
  unrelated: ['đồ ăn', 'xe máy', 'con mèo'],
};
const FIELD_CAT = { synonyms: 'VERY_CLOSE', strongRelated: 'STRONG_RELATED', related: 'RELATED', weakRelated: 'WEAKLY_RELATED', unrelated: 'UNRELATED' };
const TABLE = new Map([['đại học', [1, ...new Array(39).fill(0)]]]);
let n = 0;
for (const [f, words] of Object.entries(PACK)) for (const w of words) TABLE.set(w, vec(LEVEL[FIELD_CAT[f]], FIELD_CAT[f], n++));
// từ đoán (không có trong pack)
TABLE.set('thạc sĩ', vec(0.71, 'STRONG_RELATED', 30)); // rõ ràng: liên quan mạnh
TABLE.set('bầu trời', vec(0.04, 'UNRELATED', 31)); // rõ ràng: không liên quan
TABLE.set('mơ hồ', vec(0.62, 'RELATED', 32)); // ngay ngưỡng STRONG / RELATED → để Claude
TABLE.set('lệch nhóm', vec(0.72, 'UNRELATED', 33)); // độ gần kiểu "liên quan mạnh" nhưng hàng xóm lại là nhóm khác → để Claude

function fakeEmbedder() {
  const e = { provider: 'fake', model: 'test', calls: 0, async embed(texts) { e.calls++; return texts.map((t) => normalizeVec(TABLE.get(t) || vec(0.5, 'RELATED', 39))); } };
  return e;
}
function fakeClient() {
  const calls = { pack: 0, judge: [] };
  return {
    calls,
    beta: { messages: { create: async (req) => {
      const content = req.messages[0].content;
      if (!content.includes('TỪ ĐOÁN:')) { calls.pack++; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(PACK) }] }; }
      const words = JSON.parse(content.split('TỪ ĐOÁN: ')[1]);
      calls.judge.push(words);
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ results: words.map((w) => ({ guess: w, category: 'RELATED', confidence: 0.8 })) }) }] };
    } } },
  };
}
const inBand = (score, cat) => score >= SCORE_BANDS[cat][0] && score <= SCORE_BANDS[cat][1];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('calibrate: mốc theo trung vị từng nhóm, ngưỡng là điểm giữa; nhóm không giảm dần → không dùng', () => {
  const c = calibrate({ VERY_CLOSE: [0.9, 0.88, 0.92], STRONG_RELATED: [0.7, 0.72, 0.74], RELATED: [0.5, 0.52, 0.54], UNRELATED: [0.05, 0.1, 0.0] });
  assert.equal(c.ok, true);
  assert.deepEqual(c.bands.map((b) => b.category), ['VERY_CLOSE', 'STRONG_RELATED', 'RELATED', 'UNRELATED']);
  assert.ok(Math.abs(c.bands[1].lo - 0.62) < 1e-9, 'ngưỡng STRONG / RELATED = (0.72 + 0.52) / 2');
  assert.equal(calibrate({ VERY_CLOSE: [0.5, 0.5, 0.5], STRONG_RELATED: [0.6, 0.6, 0.6], UNRELATED: [0.1, 0.1, 0.1] }).ok, false);
  assert.equal(calibrate({ VERY_CLOSE: [0.9, 0.9, 0.9], UNRELATED: [0.1, 0.1, 0.1] }).ok, false, 'cần ít nhất 3 nhóm làm mốc');
});

test('embedClassify: rõ ràng + hàng xóm đồng ý → xếp nhóm; sát ngưỡng / hàng xóm khác nhóm → null (để Claude); gần trùng nghĩa → nhóm của từ đó', () => {
  const calib = calibrate({ VERY_CLOSE: [0.9, 0.9, 0.9], STRONG_RELATED: [0.72, 0.72, 0.72], RELATED: [0.52, 0.52, 0.52], UNRELATED: [0.05, 0.05, 0.05] });
  const nb = (cat, sim = 0.8) => [1, 2, 3].map(() => ({ sim, category: cat, strength: 0.5 }));
  assert.equal(embedClassify({ sim: 0.7, neighbors: nb('STRONG_RELATED'), calib }).category, 'STRONG_RELATED');
  assert.equal(embedClassify({ sim: 0.625, neighbors: nb('STRONG_RELATED'), calib }), null, 'cách ngưỡng 0.62 chưa đủ margin');
  assert.equal(embedClassify({ sim: 0.7, neighbors: nb('UNRELATED'), calib }), null, 'hàng xóm không đồng ý');
  assert.equal(embedClassify({ sim: 0.2, neighbors: [{ sim: 0.95, category: 'VERY_CLOSE', strength: 1 }], calib }).via, 'neighbor');
});

test('LayeredScorer + Lớp 3: đầu vòng embed pack 1 lần; từ rõ ràng chấm bằng embedding, từ mơ hồ chuyển Claude; cache lại', async () => {
  const client = fakeClient();
  const embedder = fakeEmbedder();
  const s = new LayeredScorer({ client, embedder, batchMs: 5, log: {} });
  await s.prepare('đại học');
  await wait(5);
  assert.equal(embedder.calls, 1, 'embed từ bí mật + pack trong 1 lần gọi');
  assert.ok(s.embedState.get('đại học').calib.ok);
  const [a, b, c, d] = await Promise.all(['thạc sĩ', 'bầu trời', 'mơ hồ', 'lệch nhóm'].map((w) => s.score('đại học', w)));
  assert.equal(a.source, 'embed'); assert.equal(a.category, 'STRONG_RELATED'); assert.ok(inBand(a.score, 'STRONG_RELATED'));
  assert.equal(b.source, 'embed'); assert.equal(b.category, 'UNRELATED');
  assert.equal(c.source, 'claude', 'sát ngưỡng → Claude');
  assert.equal(d.source, 'claude', 'hàng xóm khác nhóm → Claude');
  assert.deepEqual(client.calls.judge.flat().sort(), ['lệch nhóm', 'mơ hồ']);
  assert.equal(embedder.calls, 2, 'cả lô từ đoán embed trong 1 lần gọi');
  assert.equal((await s.score('đại học', 'thạc sĩ')).source, 'cache');
  assert.equal(s.stats().embed, 2);
  // từ trong pack vẫn được Lớp 1 xử lý, không tốn lượt embedding
  assert.equal((await s.score('đại học', 'sinh viên')).source, 'dict');
  assert.equal(embedder.calls, 2);
});

test('LayeredScorer: không có embedder hoặc embedding lỗi → đi thẳng Claude như trước', async () => {
  const client = fakeClient();
  const broken = { provider: 'x', model: 'y', calls: 0, embed: async () => { throw new Error('down'); } };
  const s = new LayeredScorer({ client, embedder: broken, batchMs: 5, log: {} });
  await s.prepare('đại học');
  await wait(5);
  assert.equal(s.embedState.has('đại học'), false, 'lỗi → lần sau thử lại');
  assert.equal((await s.score('đại học', 'thạc sĩ')).source, 'claude');
});

test('Embedder: gọi API dạng Voyage / OpenAI, chuẩn hoá vector, giữ đúng thứ tự; fromEnv chọn nhà cung cấp theo key', async () => {
  const reqs = [];
  const fetchImpl = async (url, opt) => {
    reqs.push({ url, body: JSON.parse(opt.body), auth: opt.headers.authorization });
    const input = JSON.parse(opt.body).input;
    return { ok: true, json: async () => ({ data: input.map((_, i) => ({ index: input.length - 1 - i, embedding: [3, 4] })).reverse() }) };
  };
  const e = new Embedder({ provider: 'voyage', apiKey: 'k', fetchImpl, maxPerCall: 2 });
  const v = await e.embed(['a', 'b', 'c']);
  assert.equal(v.length, 3);
  assert.ok(Math.abs(cosine(v[0], v[0]) - 1) < 1e-6);
  assert.equal(reqs.length, 2, 'chia lô theo maxPerCall');
  assert.equal(reqs[0].url, 'https://api.voyageai.com/v1/embeddings');
  assert.equal(reqs[0].auth, 'Bearer k');
  assert.equal(Embedder.fromEnv({}), null);
  assert.equal(Embedder.fromEnv({ VOYAGE_API_KEY: 'v' }).provider, 'voyage');
  assert.equal(Embedder.fromEnv({ OPENAI_API_KEY: 'o' }).model, 'text-embedding-3-small');
  assert.equal(Embedder.fromEnv({ VOYAGE_API_KEY: 'v' }, { enabled: false }), null);
});

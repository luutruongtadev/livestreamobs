import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { canon, compact, sameWord } from './scorer.js';
import { EMBED_DEFAULTS, calibrate, cosine, embedClassify } from './embeddings.js';

/**
 * Chấm độ gần nghĩa theo lớp — CHỈ theo nghĩa / liên quan / liên tưởng, KHÔNG theo mặt chữ hay phát âm
 * (giống chữ, giống âm, chung một tiếng mà khác nghĩa thì không được điểm). Lớp trước xử lý được thì dừng:
 *   (cache)  từ đã chấm rồi (cùng từ bí mật) → trả ngay
 *   Lớp 1    Knowledge Pack: bộ từ đồng nghĩa / liên quan mạnh / liên quan / liên quan yếu / không liên quan
 *            Claude soạn MỘT lần cho mỗi từ bí mật (đầu vòng, lưu data/knowledge-packs.json)
 *   Lớp 3    Embedding (Voyage / OpenAI, tuỳ chọn): so với các nhóm tham chiếu trong pack (xem server/embeddings.js); chỉ nhận trường hợp rõ ràng
 *   Lớp 4    Claude: chỉ PHÂN LOẠI các từ còn lại (gom lô); Score Engine bên dưới mới quyết định điểm
 *   (none)   không có lớp nào hiểu nghĩa (không có API key / Claude lỗi) → điểm "không liên quan", không cache
 * (Lớp 2 cũ — chấm theo gõ sai chính tả / Levenshtein — đã bỏ vì là chấm theo mặt chữ.)
 * Đoán trúng (100) do WordGame tự xử lý trước khi gọi bộ chấm.
 */

export const CATEGORIES = ['VERY_CLOSE', 'STRONG_RELATED', 'RELATED', 'WEAKLY_RELATED', 'UNRELATED'];

/** Score Engine: loại → khoảng điểm; vị trí trong khoảng theo độ mạnh 0..1 (thứ tự trong pack / độ tin cậy của Claude). */
export const SCORE_BANDS = {
  VERY_CLOSE: [90, 97], // đồng nghĩa, cách gọi khác, bản dịch
  STRONG_RELATED: [75, 88], // nhắc cái này là nghĩ ngay tới cái kia, cùng loại hẹp
  RELATED: [55, 72], // liên quan rõ, hay đi cùng nhau
  WEAKLY_RELATED: [25, 45], // cùng chủ đề rộng, liên tưởng xa
  UNRELATED: [1, 9],
};

const PACK_FIELDS = [['synonyms', 'VERY_CLOSE'], ['strongRelated', 'STRONG_RELATED'], ['related', 'RELATED'], ['weakRelated', 'WEAKLY_RELATED'], ['unrelated', 'UNRELATED']];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function scoreOf(category, strength = 0.5, bands = SCORE_BANDS) {
  const b = bands[category];
  if (!b) return null;
  return Math.round(b[0] + (b[1] - b[0]) * clamp(Number(strength) || 0, 0, 1));
}

/** Làm sạch pack: bỏ chính từ bí mật, bỏ trùng (giữ ở nhóm mạnh hơn), tối đa 40 từ / nhóm. */
export function cleanPack(secret, raw = {}) {
  const seen = new Set([compact(secret)]);
  const out = {};
  for (const [field] of PACK_FIELDS) {
    out[field] = [];
    for (const w of Array.isArray(raw[field]) ? raw[field] : []) {
      const c = canon(String(w || '').replace(/[^\p{L}\p{N} ]+/gu, ' '));
      const k = compact(c);
      if (!c || !k || c.length > 40 || seen.has(k)) continue;
      seen.add(k);
      out[field].push(c);
      if (out[field].length >= 40) break;
    }
  }
  return out;
}

/** Chỉ mục tra cứu Lớp 1 của một pack: theo chữ có dấu (chính xác) và theo chữ bỏ dấu liền nhau (để nhận cách gõ không dấu). */
export function packIndex(pack) {
  const exact = new Map(), loose = new Map(), list = [];
  for (const [field, category] of PACK_FIELDS) {
    const words = pack?.[field] || [];
    words.forEach((w, i) => {
      // từ đứng trước trong nhóm = liên quan mạnh hơn
      const hit = { category, strength: words.length > 1 ? 1 - i / (words.length - 1) : 1, ref: w };
      exact.set(canon(w), hit);
      const k = compact(w);
      if (!loose.has(k)) loose.set(k, []);
      loose.get(k).push(hit);
      list.push({ key: k, ...hit });
    });
  }
  return { exact, loose, list };
}

/**
 * Lớp 1: tra pack. Có dấu thì so đúng chữ; gõ không dấu / dính liền thì so bản bỏ dấu, nhưng tiếng nào CÓ gõ dấu thì dấu
 * phải khớp ("mặt" không ăn theo "mắt" trong pack — khác nghĩa). Khớp nhiều từ khác nhóm (mơ hồ) → null.
 */
export function dictLookup(index, word) {
  if (!index) return null;
  const hit = index.exact.get(canon(word));
  if (hit) return hit;
  const cands = (index.loose.get(compact(word)) || []).filter((h) => sameWord(word, h.ref));
  if (!cands.length || new Set(cands.map((h) => h.category)).size > 1) return null;
  return cands.reduce((a, b) => (b.strength > a.strength ? b : a));
}

// ---------------- Claude ----------------
const JUDGE_V = 'v5-sem'; // đổi khi sửa tiêu chí phân loại → kết quả cũ trong cache không dùng lại
const EMBED_V = 'v1-emb'; // kết quả của Lớp 3 (embedding)
const LEGACY_KEYS = ['v3-rel']; // điểm 1–99 của bộ chấm cũ vẫn dùng lại được (không tốn token)
const NO_CLIENT_KEYS = ['v4-cat']; // phân loại bản trước (còn nhận "sai chính tả" là rất gần): chỉ dùng khi không có Claude

const PACK_SYSTEM = `Bạn soạn "bộ từ tham chiếu" cho trò chơi đoán từ tiếng Việt trên livestream: người xem bình luận một từ, hệ thống chấm mức gần nghĩa / liên quan với TỪ BÍ MẬT.
Hãy liệt kê những từ người xem HAY ĐOÁN NHẤT cho từ bí mật này, chia nhóm (mỗi nhóm 10–30 từ, chữ thường, có dấu, 1–4 tiếng, xếp từ mạnh đến yếu):
- synonyms: đồng nghĩa, cách gọi khác, từ địa phương, viết tắt phổ biến, bản dịch tiếng Anh, tên gọi đầy đủ / rút gọn.
- strongRelated: nhắc cái này là nghĩ ngay tới cái kia; cùng loại hẹp; bộ phận – tổng thể; đặc điểm nổi bật nhất.
- related: liên quan rõ ràng, hay đi cùng nhau (nơi chốn, công dụng, người – nghề – dụng cụ, nguyên nhân – kết quả, dịp lễ).
- weakRelated: cùng chủ đề rộng, phải nghĩ vòng mới thấy.
- unrelated: từ phổ biến người xem hay đoán bừa nhưng KHÔNG liên quan; nhất là từ GIỐNG CHỮ / GIỐNG ÂM / cùng vần / chung một tiếng với từ bí mật mà khác nghĩa (vd "mặt trời" → "mặt nạ", "mặt bàn", "mắt").
Chỉ xét NGHĨA và LIÊN TƯỞNG, tuyệt đối không xếp nhóm theo mặt chữ hay cách phát âm.
Có thể thêm vài từ tiếng Anh người xem hay gõ. Không đưa chính từ bí mật. Không lặp một từ ở hai nhóm.`;

const PACK_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(PACK_FIELDS.map(([f]) => [f, { type: 'array', items: { type: 'string' } }])),
  required: PACK_FIELDS.map(([f]) => f),
  additionalProperties: false,
};

const JUDGE_SYSTEM = `Bạn là giám khảo PHÂN LOẠI của trò chơi đoán từ tiếng Việt trên livestream. Mỗi lần bạn nhận một TỪ BÍ MẬT và danh sách TỪ ĐOÁN. Với mỗi từ đoán, xếp vào ĐÚNG MỘT nhóm theo mức gần nghĩa HOẶC liên quan (lấy mức cao hơn) với từ bí mật:
- VERY_CLOSE: đồng nghĩa, gần như cùng một thứ, khác cách gọi, bản dịch tiếng Anh. (mặt trời ↔ "ông mặt trời", "sun")
- STRONG_RELATED: nhắc cái này là nghĩ ngay tới cái kia; cùng loại hẹp; bộ phận – tổng thể. (mặt trời ↔ nắng, mặt trăng; đại học ↔ sinh viên, cao đẳng)
- RELATED: liên quan rõ ràng, hay đi cùng nhau: nơi chốn, công dụng, đi kèm, người – nghề – dụng cụ, nguyên nhân – kết quả, dịp lễ. (mặt trời ↔ kem chống nắng; đại học ↔ học sinh, giáo dục)
- WEAKLY_RELATED: cùng chủ đề rộng, liên tưởng xa, phải nghĩ vòng. (mặt trời ↔ bãi biển; đại học ↔ con người)
- UNRELATED: không liên quan, vô nghĩa, câu chào hỏi, nội dung thô tục.
CHỈ CHẤM THEO NGHĨA VÀ LIÊN TƯỞNG, KHÔNG theo mặt chữ hay phát âm: từ giống chữ, giống âm, cùng vần, chung một tiếng hoặc chỉ khác dấu với từ bí mật nhưng khác nghĩa thì xếp theo nghĩa thật của nó (thường là UNRELATED). (mặt trời ↔ "mặt nạ", "mặt bàn", "mắt" → UNRELATED; con chó ↔ "chợ", "cho" → UNRELATED)
"confidence": 0–1, bạn chắc chắn bao nhiêu với nhóm đã chọn; trong cùng nhóm, từ càng sát nghĩa thì confidence càng cao.
Người xem hay gõ không dấu: hiểu theo nghĩa tiếng Việt hợp lý nhất, rồi chấm theo nghĩa đó — không cộng điểm vì trông giống đáp án. Phân loại nhất quán: cùng một từ luôn cùng nhóm. Trả về đủ mọi từ đoán, giữ nguyên chuỗi "guess" như đã nhận.`;

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: { guess: { type: 'string' }, category: { type: 'string', enum: CATEGORIES }, confidence: { type: 'number' } },
        required: ['guess', 'category', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

/**
 * Bộ chấm nhiều lớp, cùng giao diện với ClaudeScorer: score(secret, word, ctx, { aliases }) → Promise<{ score, source, category }>.
 * source: cache | dict (Lớp 1) | embed (Lớp 3) | claude (Lớp 4) | none (không lớp nào hiểu nghĩa: không có key / Claude lỗi).
 * prepare(secret, ctx): soạn Knowledge Pack trước khi người xem đoán (gọi ở đầu vòng).
 */
export class LayeredScorer {
  constructor({ model = 'claude-opus-5-5', packModel = null, batchMs = 400, maxBatch = 25, maxInflight = 2, timeoutMs = 20_000,
    cachePath = null, packPath = null, seedPackPath = null, client = null, bands = SCORE_BANDS, embedder = null, embed = {}, log = console } = {}) {
    this.model = model;
    this.packModel = packModel || model;
    this.batchMs = batchMs;
    this.maxBatch = maxBatch;
    this.maxInflight = maxInflight;
    this.timeoutMs = timeoutMs;
    this.cachePath = cachePath;
    this.packPath = packPath;
    this.seedPackPath = seedPackPath; // pack soạn sẵn trong repo, nạp trước (pack trong data/ đè lên nếu trùng)
    this.seedCount = 0;
    this.bands = { ...SCORE_BANDS, ...bands };
    this.log = log;
    // client = false: không có API key Claude → vẫn chấm bằng pack soạn sẵn (Lớp 1) / embedding; từ ngoài pack = "không rõ nghĩa" (điểm thấp)
    this.client = client === false ? null : client || new Anthropic();
    this.cache = new Map(); // `${secretKey}|${word}|${JUDGE_V}` → score
    this.packs = new Map(); // secretKey → pack
    this.indexes = new Map(); // secretKey → packIndex
    this.packJobs = new Map(); // secretKey → Promise
    this.queue = new Map(); // secretKey → Map(word → [resolve])
    this.contexts = new Map(); // secretKey → prompt ngữ cảnh của bộ từ (vd LMHT)
    this.timer = null;
    this.inflight = 0;
    // Lớp 3: embedding (null = không dùng)
    this.embedder = embedder;
    this.embedCfg = { ...EMBED_DEFAULTS, ...embed };
    this.embedState = new Map(); // secretKey → { sv, calib, entries: [{ category, strength, vec }] } | 'pending' | 'off'
    this.vecCache = new Map(); // từ đoán → vector (LRU)
    this.embedQueue = new Map(); // secretKey → Map(word → [resolve])
    this.embedTimer = null;
    this.counts = { cache: 0, dict: 0, embed: 0, claude: 0, none: 0, judgeCalls: 0, packCalls: 0, embedCalls: 0 };
    this.load();
  }

  load() {
    try { if (this.cachePath) this.cache = new Map(Object.entries(JSON.parse(fs.readFileSync(this.cachePath, 'utf8')))); } catch { /* chưa có */ }
    try {
      if (this.seedPackPath) {
        const seed = JSON.parse(fs.readFileSync(this.seedPackPath, 'utf8')).packs || {};
        for (const [word, p] of Object.entries(seed)) { this.setPack(canon(word), cleanPack(word, p)); this.seedCount++; }
      }
    } catch { /* chưa có */ }
    try { if (this.packPath) for (const [k, p] of Object.entries(JSON.parse(fs.readFileSync(this.packPath, 'utf8')))) this.setPack(k, p); } catch { /* chưa có */ }
  }

  saveCache() {
    if (this.cachePath && this.cacheDirty) {
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(Object.fromEntries([...this.cache.entries()].slice(-30000))));
      this.cacheDirty = false;
    }
    if (this.packPath && this.packsDirty) {
      fs.mkdirSync(path.dirname(this.packPath), { recursive: true });
      fs.writeFileSync(this.packPath, JSON.stringify(Object.fromEntries([...this.packs.entries()].slice(-3000))));
      this.packsDirty = false;
    }
  }

  keyOf(secret, ctx) { return (ctx?.id ? `${ctx.id}:` : '') + canon(secret); }
  secretOf(key) { return key.replace(/^[^:|]+:/, ''); }

  setPack(key, pack) {
    this.packs.set(key, pack);
    this.indexes.set(key, packIndex(pack));
  }

  /** Thống kê số từ được chấm ở mỗi lớp (để xem admin / quyết định có cần thêm lớp embedding). */
  stats() { return { ...this.counts, packs: this.packs.size, embedding: this.embedder ? `${this.embedder.provider}:${this.embedder.model}` : null }; }

  /** Đầu vòng: soạn Knowledge Pack cho từ bí mật (1 lần gọi Claude, có cache). */
  prepare(secret, ctx = null, { model = null, embed = true } = {}) {
    const key = this.keyOf(secret, ctx);
    if (ctx?.prompt) this.contexts.set(key, ctx.prompt);
    if (this.packs.has(key)) { if (embed) this.prepareEmbed(key); return Promise.resolve(this.packs.get(key)); }
    if (!this.client) return Promise.resolve(null); // không có Claude: chỉ dùng pack soạn sẵn
    if (!this.packJobs.has(key)) {
      const job = this.callPack(this.secretOf(key), ctx?.prompt, model)
        .then((raw) => { const pack = cleanPack(this.secretOf(key), raw); this.setPack(key, pack); this.packsDirty = true; if (embed) this.prepareEmbed(key); return pack; })
        .catch((e) => { this.log.warn?.(`[scoring] soạn knowledge pack cho "${this.secretOf(key)}" lỗi: ${e?.message || e}`); return null; })
        .finally(() => this.packJobs.delete(key));
      this.packJobs.set(key, job);
    }
    return this.packJobs.get(key);
  }

  /**
   * Lớp 3: embedding từ bí mật + mọi từ trong pack (1 lần gọi API mỗi vòng), hiệu chỉnh ngưỡng theo nhóm tham chiếu.
   * Embedding không tách được các nhóm (mốc không giảm dần) → tắt lớp này cho từ bí mật đó.
   */
  async prepareEmbed(key) {
    if (!this.embedder || this.embedState.has(key) || !this.packs.has(key)) return;
    this.embedState.set(key, 'pending');
    const index = this.indexes.get(key);
    try {
      const [sv, ...vecs] = await this.embedder.embed([this.secretOf(key), ...index.list.map((e) => e.ref)]);
      this.counts.embedCalls = this.embedder.calls;
      const entries = index.list.map((e, i) => ({ category: e.category, strength: e.strength, vec: vecs[i] }));
      const simsByCat = {};
      for (const e of entries) (simsByCat[e.category] ||= []).push(cosine(sv, e.vec));
      const calib = calibrate(simsByCat, this.embedCfg);
      if (!calib.ok) { this.log.warn?.(`[scoring] embedding bỏ qua "${this.secretOf(key)}": ${calib.reason}`); this.embedState.set(key, 'off'); return; }
      this.embedState.set(key, { sv, entries, calib });
      if (this.embedState.size > 30) this.embedState.delete(this.embedState.keys().next().value); // giữ ~30 từ bí mật gần nhất
    } catch (e) {
      this.log.warn?.(`[scoring] embedding pack "${this.secretOf(key)}" lỗi: ${e?.message || e}`);
      this.embedState.delete(key); // lần sau thử lại
    }
  }

  /** Thêm từ vào hàng chờ (Lớp 3 hoặc Lớp 4) và hẹn xử lý lô. */
  enqueue(queue, key, w, resolvers) {
    if (!queue.has(key)) queue.set(key, new Map());
    const q = queue.get(key);
    if (!q.has(w)) q.set(w, []);
    q.get(w).push(...resolvers);
    if (queue === this.embedQueue) { if (!this.embedTimer) this.embedTimer = setTimeout(() => this.flushEmbed(), this.batchMs); }
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), this.batchMs);
  }

  /** Lớp 3: lấy vector các từ đoán (1 lần gọi cho cả lô), xếp nhóm; từ mơ hồ → hàng chờ Claude. */
  async flushEmbed() {
    this.embedTimer = null;
    const batch = [...this.embedQueue.entries()];
    this.embedQueue.clear();
    const words = [...new Set(batch.flatMap(([, q]) => [...q.keys()]))].filter((w) => !this.vecCache.has(w));
    try {
      if (words.length) {
        const vecs = await this.embedder.embed(words);
        this.counts.embedCalls = this.embedder.calls;
        words.forEach((w, i) => this.vecCache.set(w, vecs[i]));
        while (this.vecCache.size > 5000) this.vecCache.delete(this.vecCache.keys().next().value);
      }
    } catch (e) {
      this.log.warn?.(`[scoring] embedding từ đoán lỗi: ${e?.message || e} — chuyển Claude`);
    }
    for (const [key, q] of batch) {
      const st = this.embedState.get(key);
      for (const [w, resolvers] of q) {
        const v = this.vecCache.get(w);
        const r = v && st?.calib ? embedClassify({
          sim: cosine(st.sv, v),
          neighbors: st.entries.map((e) => ({ sim: cosine(v, e.vec), category: e.category, strength: e.strength })),
          calib: st.calib, cfg: this.embedCfg,
        }) : null;
        if (!r) { this.enqueue(this.queue, key, w, resolvers); continue; }
        const score = scoreOf(r.category, r.strength, this.bands);
        this.cache.set(`${key}|${w}|${EMBED_V}`, score);
        this.cacheDirty = true;
        this.counts.embed++;
        for (const res of resolvers) res({ score, source: 'embed', category: r.category });
      }
    }
  }

  /** Không lớp nào hiểu được nghĩa của từ đoán → coi như không liên quan (KHÔNG đoán theo mặt chữ), không cache để lần sau chấm lại. */
  unknown() { return { score: scoreOf('UNRELATED', 0.5, this.bands), source: 'none', category: null }; }

  score(secret, word, ctx = null) {
    const key = this.keyOf(secret, ctx);
    const w = canon(word);
    const done = (score, source, category = null) => { this.counts[source] = (this.counts[source] || 0) + 1; return Promise.resolve({ score, source, category }); };
    // cache: kết quả mới, hoặc điểm của bộ chấm cũ (kết quả Claude bản trước chỉ dùng khi không gọi được Claude để chấm lại)
    for (const v of [JUDGE_V, EMBED_V, ...LEGACY_KEYS, ...(this.client ? [] : NO_CLIENT_KEYS)]) {
      const c = this.cache.get(`${key}|${w}|${v}`);
      if (Number.isFinite(c)) return done(c, 'cache');
    }
    const index = this.indexes.get(key);
    // Lớp 1: Knowledge Pack
    const hit = dictLookup(index, w);
    if (hit) return done(scoreOf(hit.category, hit.strength, this.bands), 'dict', hit.category);
    if (ctx?.prompt) this.contexts.set(key, ctx.prompt);
    // Lớp 3 (embedding, nếu có và đã hiệu chỉnh xong cho từ bí mật này) → không chắc thì Lớp 4: Claude phân loại (gom lô)
    const useEmbed = this.embedder && this.embedState.get(key)?.calib;
    if (!useEmbed && !this.client) { const u = this.unknown(); return done(u.score, u.source); }
    return new Promise((resolve) => this.enqueue(useEmbed ? this.embedQueue : this.queue, key, w, [resolve]));
  }

  async flush() {
    this.timer = null;
    // giới hạn số request Claude cùng lúc: đang bận thì để lô sau
    if (this.inflight >= this.maxInflight) { this.timer = setTimeout(() => this.flush(), this.batchMs); return; }
    const entry = this.queue.entries().next();
    if (entry.done) return;
    const [key, q] = entry.value;
    const words = [...q.keys()].slice(0, this.maxBatch);
    const chunk = new Map(words.map((w) => [w, q.get(w)]));
    for (const w of words) q.delete(w);
    if (!q.size) this.queue.delete(key);
    if (this.queue.size && !this.timer) this.timer = setTimeout(() => this.flush(), 0);
    this.inflight++;
    let results = {};
    try { if (this.client) results = await this.callJudge(this.secretOf(key), words, this.contexts.get(key)); } catch (e) {
      this.log.warn?.(`[scoring] Claude phân loại lỗi (${e?.status || ''} ${e?.message || e}) — tạm coi là không rõ nghĩa`);
    } finally { this.inflight--; }
    for (const [w, resolvers] of chunk) {
      const r = results[w];
      let out;
      if (r) {
        const score = scoreOf(r.category, (r.confidence - 0.5) / 0.5, this.bands);
        this.cache.set(`${key}|${w}|${JUDGE_V}`, score);
        this.cacheDirty = true;
        out = { score, source: 'claude', category: r.category };
      } else out = this.unknown();
      this.counts[out.source]++;
      for (const res of resolvers) res(out);
    }
  }

  async create(body) {
    return this.client.beta.messages.create({
      ...body,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    }, { timeout: this.timeoutMs });
  }

  textOf(response) {
    if (response.stop_reason === 'refusal') throw new Error('refusal');
    return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  /** Từ bí mật này đã có Knowledge Pack chưa (soạn trước hàng loạt). */
  hasPack(secret, ctx = null) { return this.packs.has(this.keyOf(secret, ctx)); }

  async callPack(secret, context = '', model = null) {
    this.counts.packCalls++;
    const res = await this.create({
      model: model || this.packModel, max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: PACK_SCHEMA } },
      system: PACK_SYSTEM,
      messages: [{ role: 'user', content: `${context ? `NGỮ CẢNH: ${context}\n` : ''}TỪ BÍ MẬT: ${JSON.stringify(secret)}` }],
    });
    return JSON.parse(this.textOf(res));
  }

  async callJudge(secret, words, context = '') {
    this.counts.judgeCalls++;
    const res = await this.create({
      model: this.model, max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: JUDGE_SCHEMA } },
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: `${context ? `NGỮ CẢNH: ${context}\n` : ''}TỪ BÍ MẬT: ${JSON.stringify(secret)}\nTỪ ĐOÁN: ${JSON.stringify(words)}` }],
    });
    const out = {};
    for (const it of JSON.parse(this.textOf(res)).results || []) {
      const w = canon(it.guess);
      if (words.includes(w) && CATEGORIES.includes(it.category)) out[w] = { category: it.category, confidence: clamp(Number(it.confidence) || 0.5, 0, 1) };
    }
    return out;
  }
}

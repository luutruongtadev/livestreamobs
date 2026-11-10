/**
 * Lớp 3 của bộ chấm gần nghĩa: embedding (vector ngữ nghĩa).
 * Anthropic không có API embedding → dùng Voyage AI (VOYAGE_API_KEY, đối tác Anthropic khuyên dùng, đa ngôn ngữ)
 * hoặc OpenAI (OPENAI_API_KEY). Không có key → không dùng lớp này.
 *
 * KHÔNG lấy cosine × 100 làm điểm. Hiệu chỉnh theo nhóm tham chiếu của chính từ bí mật:
 * Knowledge Pack đã chia 5 nhóm (đồng nghĩa → không liên quan); đo độ tương đồng của từng nhóm với từ bí mật,
 * lấy trung vị mỗi nhóm làm mốc, ngưỡng giữa 2 nhóm = điểm giữa 2 mốc. Từ đoán chỉ được xếp nhóm khi
 * (1) rơi rõ vào một khoảng (cách ngưỡng ≥ margin) VÀ các từ trong pack giống nó nhất cũng thuộc nhóm đó,
 * hoặc (2) gần như trùng nghĩa một từ trong pack (cosine ≥ neighborHi). Còn lại → chuyển Claude.
 */

export const EMBED_DEFAULTS = {
  neighborHi: 0.92, // gần như cùng nghĩa với 1 từ trong pack → lấy luôn nhóm của từ đó
  margin: 0.02, // cách ngưỡng giữa 2 nhóm ít hơn mức này → mơ hồ, để Claude phân loại
  k: 5, // số từ trong pack giống nhất dùng để "bỏ phiếu" xác nhận nhóm
  minPerCategory: 3, // nhóm có ít hơn N từ thì không dùng làm mốc
  minGap: 0.01, // mốc các nhóm phải giảm dần ít nhất chừng này, không thì embedding không tách được nhóm → bỏ lớp này cho từ đó
};

const CATS = ['VERY_CLOSE', 'STRONG_RELATED', 'RELATED', 'WEAKLY_RELATED', 'UNRELATED'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Chuẩn hoá vector về độ dài 1 → cosine = tích vô hướng. */
export function normalizeVec(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}
export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
const median = (xs) => { const a = [...xs].sort((p, q) => p - q); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

/**
 * Hiệu chỉnh ngưỡng từ độ tương đồng (với từ bí mật) của các từ trong từng nhóm.
 * simsByCat: { VERY_CLOSE: [0.8, …], … } → { ok, bands: [{ category, lo, hi }] } (xếp từ nhóm gần nhất).
 */
export function calibrate(simsByCat, { minPerCategory = EMBED_DEFAULTS.minPerCategory, minGap = EMBED_DEFAULTS.minGap } = {}) {
  const present = CATS.filter((c) => (simsByCat[c] || []).length >= minPerCategory).map((c) => ({ category: c, med: median(simsByCat[c]), max: Math.max(...simsByCat[c]) }));
  if (present.length < 3) return { ok: false, reason: 'pack ít nhóm' };
  for (let i = 1; i < present.length; i++) if (present[i - 1].med - present[i].med < minGap) return { ok: false, reason: `embedding không tách được ${present[i - 1].category} / ${present[i].category}` };
  const cuts = present.slice(1).map((p, i) => (present[i].med + p.med) / 2);
  const bands = present.map((p, i) => ({
    category: p.category,
    lo: i < cuts.length ? cuts[i] : -1,
    hi: i === 0 ? Math.max(p.max, p.med + (p.med - cuts[0])) : cuts[i - 1],
  }));
  return { ok: true, bands };
}

/**
 * Xếp nhóm cho 1 từ đoán. sim: cosine(từ đoán, từ bí mật); neighbors: các từ trong pack [{ sim, category, strength }] (sim với từ đoán).
 * Trả về { category, strength, via } hoặc null (mơ hồ → để Claude).
 */
export function embedClassify({ sim, neighbors = [], calib, cfg = EMBED_DEFAULTS }) {
  if (!calib?.ok) return null;
  const nb = [...neighbors].sort((a, b) => b.sim - a.sim);
  // (2) gần như trùng nghĩa một từ đã có trong pack
  if (nb[0] && nb[0].sim >= cfg.neighborHi) return { category: nb[0].category, strength: nb[0].strength, via: 'neighbor' };
  // (1) khoảng hiệu chỉnh theo nhóm tham chiếu
  const band = calib.bands.find((b) => sim >= b.lo) || calib.bands[calib.bands.length - 1];
  const idx = calib.bands.indexOf(band);
  const edges = [idx > 0 ? band.hi : null, idx < calib.bands.length - 1 ? band.lo : null].filter((x) => x != null);
  if (edges.some((e) => Math.abs(sim - e) < cfg.margin)) return null;
  // các từ giống nhất trong pack phải "đồng ý" (đa số có trọng số theo độ giống)
  const votes = {};
  for (const n of nb.slice(0, cfg.k)) votes[n.category] = (votes[n.category] || 0) + Math.max(0, n.sim);
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[0] !== band.category) return null;
  const lo = band.lo < 0 ? Math.min(sim, band.hi - 0.2) : band.lo;
  const strength = clamp((sim - lo) / Math.max(1e-6, band.hi - lo), 0, 1);
  return { category: band.category, strength, via: 'calibrated' };
}

/** Gọi API embedding (Voyage / OpenAI cùng dạng trả về { data: [{ index, embedding }] }), có timeout. */
export class Embedder {
  constructor({ provider = 'voyage', apiKey, model = null, baseUrl = null, fetchImpl = globalThis.fetch, timeoutMs = 8000, maxPerCall = 128 } = {}) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model || (provider === 'openai' ? 'text-embedding-3-small' : 'voyage-3.5');
    this.url = baseUrl || (provider === 'openai' ? 'https://api.openai.com/v1/embeddings' : 'https://api.voyageai.com/v1/embeddings');
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxPerCall = maxPerCall;
    this.calls = 0;
  }

  /** Có key nào thì dùng nhà cung cấp đó: EMBEDDING_PROVIDER + EMBEDDING_API_KEY, hoặc VOYAGE_API_KEY, hoặc OPENAI_API_KEY. */
  static fromEnv(env = process.env, cfg = {}) {
    const provider = env.EMBEDDING_PROVIDER || cfg.provider || (env.VOYAGE_API_KEY ? 'voyage' : env.OPENAI_API_KEY ? 'openai' : null);
    if (!provider || cfg.enabled === false) return null;
    const apiKey = env.EMBEDDING_API_KEY || (provider === 'openai' ? env.OPENAI_API_KEY : env.VOYAGE_API_KEY);
    if (!apiKey) return null;
    return new Embedder({ provider, apiKey, model: env.EMBEDDING_MODEL || cfg.model || null, baseUrl: cfg.baseUrl || null });
  }

  /** texts → vector đã chuẩn hoá (cùng thứ tự). */
  async embed(texts) {
    const out = [];
    for (let i = 0; i < texts.length; i += this.maxPerCall) {
      const chunk = texts.slice(i, i + this.maxPerCall);
      this.calls++;
      const res = await this.fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ input: chunk, model: this.model }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`embedding ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
      const data = (await res.json()).data || [];
      const vecs = new Array(chunk.length);
      for (const d of data) vecs[d.index] = normalizeVec(d.embedding);
      if (vecs.some((v) => !v)) throw new Error('embedding thiếu kết quả');
      out.push(...vecs);
    }
    return out;
  }
}

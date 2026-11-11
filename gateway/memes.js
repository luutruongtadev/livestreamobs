// Tìm GIF / video meme theo từ khoá cho overlay (GIPHY). API key chỉ nằm trên server (GIPHY_API_KEY).
// Kết quả lưu trong RAM theo từ khoá (mặc định 6 giờ) → mọi overlay cùng thấy một danh sách, khoá thử nghiệm
// của GIPHY (~100 lượt / giờ) vẫn đủ dùng. Lỗi / hết lượt → trả danh sách cũ nếu có, không thì rỗng (game tự dùng meme có sẵn).

const API = 'https://api.giphy.com/v1/gifs/search';

/** Chuẩn hoá từ khoá: chữ thường, gọn khoảng trắng, tối đa 60 ký tự. */
export const memeQuery = (q) => String(q ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);

/** Kết quả GIPHY → [{ id, mp4, gif, w, h }] (bỏ mục thiếu link). */
export function giphyItems(json) {
  return (Array.isArray(json?.data) ? json.data : []).map((d) => {
    const im = d?.images || {};
    const mp4 = im.original?.mp4 || im.original_mp4?.mp4 || im.fixed_height?.mp4 || null;
    const gif = im.downsized_medium?.url || im.downsized?.url || im.original?.url || null;
    const w = Number(im.original?.width) || 0, h = Number(im.original?.height) || 0;
    return { id: String(d?.id || ''), mp4, gif, w, h };
  }).filter((x) => x.id && (x.mp4 || x.gif) && /^https:\/\//.test(x.mp4 || x.gif));
}

export function createMemeSearch({ apiKey = '', fetchImpl = globalThis.fetch, ttlMs = 6 * 3600_000, maxKeys = 300, perMin = 30, rating = 'pg-13', limit = 25, log = console, now = () => Date.now() } = {}) {
  const cache = new Map(); // từ khoá → { at, items }
  const inflight = new Map();
  let calls = []; // thời điểm gọi API (giới hạn perMin lượt / phút cho cả server)

  async function fetchQuery(q) {
    const t = now();
    calls = calls.filter((x) => t - x < 60_000);
    if (calls.length >= perMin) throw new Error('quá nhiều lượt tìm');
    calls.push(t);
    const url = `${API}?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&limit=${limit}&rating=${rating}&bundle=messaging_non_clips`;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), 8000);
    try {
      const r = await fetchImpl(url, { signal: ctl?.signal });
      if (!r.ok) throw new Error(`GIPHY ${r.status}`);
      return giphyItems(await r.json());
    } finally { clearTimeout(timer); }
  }

  return {
    enabled: !!apiKey,
    source: 'giphy',
    /** Danh sách clip cho từ khoá (có thể rỗng). Không bao giờ ném lỗi. */
    async search(raw) {
      const q = memeQuery(raw);
      if (!apiKey || !q) return [];
      const hit = cache.get(q);
      if (hit && now() - hit.at < ttlMs) return hit.items;
      if (inflight.has(q)) return inflight.get(q);
      const p = fetchQuery(q).then((items) => {
        cache.delete(q); cache.set(q, { at: now(), items });
        while (cache.size > maxKeys) cache.delete(cache.keys().next().value);
        return items;
      }).catch((e) => { log.warn?.(`[meme] tìm "${q}" lỗi: ${e.message}`); return hit?.items || []; })
        .finally(() => inflight.delete(q));
      inflight.set(q, p);
      return p;
    },
  };
}

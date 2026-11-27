// Phần server của "Hãy chọn giá đúng" — chạy trong gateway, DÙNG CHUNG mọi kênh.
// Định kỳ tải trang danh mục / API của các siêu thị (data/sources.json hoặc biến môi trường CHONGIA_SOURCES),
// bóc tên + giá + ảnh sản phẩm, lưu cache ra đĩa. Overlay hỏi op `catalog` để lấy kho hàng có giá thật.
// Không lấy được (mạng chặn, site đổi cấu trúc) → trả rỗng, engine tự dùng giá tham khảo soạn sẵn.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractProducts, guessKind } from './scrape.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_BYTES = 8_000_000;
const PER_SOURCE = 200;
const CATS = ['sua', 'do-kho', 'gia-vi', 'tuoi-song', 'rau-cu', 'do-uong', 'banh-keo', 'hoa-pham'];

/** Mã ngắn ổn định cho một sản phẩm (FNV-1a). */
function hashId(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `w${(h >>> 0).toString(36)}`;
}

/**
 * Danh sách nguồn: JSON (mảng hoặc { sources: [...] }) hoặc dạng gọn "Cửa hàng|url|ngành hàng; Cửa hàng|url".
 * Nguồn hỏng bị bỏ qua.
 */
export function parseSources(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try { list = JSON.parse(t); } catch {
      list = t.split(/[;\n]+/).map((line) => { const [store, url, category] = line.split('|').map((x) => x?.trim()); return { store, url, category }; });
    }
  }
  if (list && !Array.isArray(list) && Array.isArray(list.sources)) list = list.sources;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== 'object' || s.enabled === false) continue;
    let url;
    try { url = new URL(String(s.url || '')); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    out.push({ store: String(s.store || url.hostname.replace(/^www\./, '')).slice(0, 30), url: url.href, category: CATS.includes(s.category) ? s.category : '' });
  }
  return out.slice(0, 80);
}

function defaultSources() {
  try { return parseSources(JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'sources.json'), 'utf8'))); } catch { return []; }
}

export function createServer({ secrets = {}, dataDir = null, log = console, config = {}, fetch: fetchImpl = globalThis.fetch, now = () => Date.now(), autoStart = true } = {}) {
  const custom = parseSources(config.sources ?? secrets.CHONGIA_SOURCES ?? '');
  const sources = custom.length ? custom : defaultSources();
  const enabled = String(config.live ?? secrets.CHONGIA_LIVE ?? '1') !== '0' && typeof fetchImpl === 'function';
  const hours = Math.max(1, Math.min(168, Number(config.refreshHours ?? secrets.CHONGIA_REFRESH_HOURS) || 12));
  const file = dataDir ? path.join(dataDir, 'prices.json') : null;
  // url nguồn → { store, url, category, ok, count, error, at, items: [...] }
  const bySource = new Map();
  let updatedAt = null, running = null, lastManual = 0, dirty = false, timer = null;

  try {
    if (file && fs.existsSync(file)) {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const s of saved.sources || []) if (s?.url && Array.isArray(s.items)) bySource.set(s.url, s);
      updatedAt = Number(saved.updatedAt) || null;
    }
  } catch (e) { log.warn?.(`[chongia] đọc cache giá lỗi: ${e?.message || e}`); }

  async function fetchText(url) {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'vi-VN,vi;q=0.9' },
      redirect: 'follow',
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(20_000) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers?.get?.('content-length')) || 0;
    if (len > MAX_BYTES) throw new Error('trang quá lớn');
    const text = await res.text();
    return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  }

  async function loadSource(src) {
    const at = now();
    const prev = bySource.get(src.url);
    try {
      const found = extractProducts(await fetchText(src.url), src.url);
      const items = found.slice(0, PER_SOURCE).map((p) => {
        const kind = guessKind(p.name);
        return { id: hashId(`${src.store}|${p.name.toLowerCase()}`), name: p.name, price: p.price, listPrice: p.listPrice, unit: p.unit, image: p.image, store: src.store, category: src.category || kind.category, emoji: kind.emoji, tier: 2, live: true, updatedAt: at };
      });
      if (!items.length) throw new Error('không thấy sản phẩm nào có giá');
      bySource.set(src.url, { ...src, ok: true, count: items.length, error: null, at, items });
    } catch (e) {
      const error = String(e?.name === 'TimeoutError' ? 'quá thời gian' : e?.message || e).slice(0, 120);
      // giữ lại giá lấy được lần trước (nếu còn trong 7 ngày)
      const keep = prev?.items?.length && at - (prev.at || 0) < 7 * 864e5 ? prev.items : [];
      bySource.set(src.url, { ...src, ok: false, count: keep.length, error, at: prev?.at || null, tried: at, items: keep });
      log.warn?.(`[chongia] ${src.store} ${src.url}: ${error}`);
    }
  }

  function refresh() {
    if (!enabled || !sources.length) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      const queue = sources.slice();
      const worker = async () => { while (queue.length) await loadSource(queue.shift()); };
      await Promise.all([worker(), worker(), worker()]);
      updatedAt = now(); dirty = true;
      const total = [...bySource.values()].reduce((a, s) => a + (s.items?.length || 0), 0);
      log.log?.(`[chongia] cập nhật giá: ${total} sản phẩm từ ${[...bySource.values()].filter((s) => s.ok).length}/${sources.length} nguồn`);
      save();
    })().finally(() => { running = null; });
    return running;
  }

  function items({ categories } = {}) {
    const cats = Array.isArray(categories) ? categories.filter((c) => CATS.includes(c)) : [];
    const seen = new Set(), out = [];
    for (const s of bySource.values()) {
      if (!sources.some((x) => x.url === s.url)) continue; // nguồn đã bỏ khỏi cấu hình
      for (const it of s.items || []) {
        if (seen.has(it.id) || (cats.length && it.category && !cats.includes(it.category))) continue;
        seen.add(it.id); out.push(it);
      }
    }
    return out.slice(0, 2000);
  }

  const status = () => ({
    live: enabled, refreshHours: hours, updatedAt, refreshing: !!running,
    sources: sources.map((s) => { const x = bySource.get(s.url); return { store: s.store, url: s.url, ok: !!x?.ok, count: x?.count || 0, error: x?.error || null, at: x?.at || null }; }),
  });

  function save() {
    if (!file || !dirty) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ updatedAt, sources: [...bySource.values()] }));
      dirty = false;
    } catch (e) { log.warn?.(`[chongia] lưu cache giá lỗi: ${e?.message || e}`); }
  }

  const stale = () => !updatedAt || now() - updatedAt > hours * 36e5;
  if (autoStart && enabled && sources.length) {
    if (stale()) refresh().catch(() => {});
    timer = setInterval(() => { refresh().catch(() => {}); }, hours * 36e5);
    timer.unref?.();
  }

  const ops = {
    /** Kho hàng có giá thật. payload: { categories? } → { items, updatedAt, live, status } */
    async catalog(payload = {}) {
      if (!items().length && enabled && sources.length) {
        // chưa có gì: chờ lượt tải đầu tiên một chút (gateway có timeout riêng)
        const p = running || (stale() ? refresh() : null);
        if (p) await Promise.race([p, new Promise((r) => { const t = setTimeout(r, 15_000); t.unref?.(); })]);
      } else if (stale() && !running) refresh().catch(() => {});
      return { items: items(payload), updatedAt, live: enabled, status: status() };
    },
    /** Streamer bấm "Cập nhật giá" — tối đa 1 lần / 5 phút. */
    async refresh(payload = {}) {
      if (enabled && now() - lastManual > 5 * 60_000) { lastManual = now(); await Promise.race([refresh(), new Promise((r) => { const t = setTimeout(r, 20_000); t.unref?.(); })]); }
      return { items: items(payload), updatedAt, live: enabled, status: status() };
    },
    async status() { return status(); },
  };

  return {
    ops,
    refresh,
    save,
    destroy() { if (timer) clearInterval(timer); timer = null; save(); },
  };
}

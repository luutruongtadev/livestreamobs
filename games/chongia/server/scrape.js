// Bóc sản phẩm + giá từ trang / API của siêu thị — không phụ thuộc cấu trúc riêng của từng site.
// Nguồn nào cũng quy về JSON rồi "quét sâu": object nào có tên + giá hợp lý là một sản phẩm.
//   - API JSON (WinMart, Lotte…): quét thẳng.
//   - Trang HTML: JSON-LD schema.org Product, __NEXT_DATA__ (Next.js), self.__next_f (Next App Router),
//     window.__INITIAL_STATE__ / __NUXT__ / __PRELOADED_STATE__, và thẻ meta product:price:amount cho trang 1 sản phẩm.

const NAME_KEYS = ['name', 'productName', 'product_name', 'displayName', 'itemName', 'item_name', 'title', 'productTitle'];
// giá đang bán (khuyến mãi) ưu tiên trước giá niêm yết
const SALE_KEYS = ['salePrice', 'sale_price', 'priceSale', 'sellingPrice', 'selling_price', 'finalPrice', 'final_price', 'specialPrice', 'special_price', 'promotionPrice', 'promoPrice', 'discountPrice', 'price_sale', 'lowPrice', 'currentPrice', 'sysPrice'];
const LIST_KEYS = ['price', 'Price', 'basePrice', 'regularPrice', 'originalPrice', 'original_price', 'listPrice', 'list_price', 'marketPrice', 'retailPrice', 'unitPrice', 'amount'];
const IMAGE_KEYS = ['image', 'imageUrl', 'image_url', 'imageURL', 'thumbnail', 'thumbnailUrl', 'thumb', 'avatar', 'mediaUrl', 'media_url', 'img', 'picture', 'photo', 'images', 'imageList', 'medias'];
const UNIT_KEYS = ['unitName', 'unit_name', 'uomName', 'unit', 'netUnitValue', 'packing', 'quantityText', 'size', 'weight', 'uom'];
const URL_KEYS = ['url', 'link', 'href', 'slug', 'seoUrl', 'productUrl'];
export const PRICE_MIN = 1000;
export const PRICE_MAX = 50_000_000;

/** "36.000₫" / "36,000 VND" / 36000 / "36000.00" → 36000 (hoặc null). */
export function toPrice(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s|&nbsp;/g, '');
  if (!/\d/.test(s) || s.length > 24) return null;
  let m;
  if ((m = /^(\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d{1,2})?(?:đ|₫|d|vnd|vnđ)?$/i.exec(s))) return Number(m[1].replace(/[.,]/g, ''));
  if ((m = /^(\d+)(?:\.\d{1,2})?(?:đ|₫|d|vnd|vnđ)?$/i.exec(s))) return Number(m[1]);
  return null;
}
const okPrice = (p) => p != null && p >= PRICE_MIN && p <= PRICE_MAX;

function firstString(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) { for (const x of v) { const s = firstString(x); if (s) return s; } return null; }
  if (v && typeof v === 'object') return firstString(v.url ?? v.src ?? v.link ?? v.path ?? v.image ?? v.imageUrl ?? v.mediaUrl ?? v.contentUrl);
  return null;
}

function absUrl(u, base) {
  if (typeof u !== 'string' || !u || u.length > 600 || /^data:/i.test(u)) return null;
  try { const x = new URL(u.startsWith('//') ? `https:${u}` : u, base || undefined); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
}

const clean = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();

/** Quy cách trong tên: ưu tiên dung tích / khối lượng ("Sữa tươi 1L" → "1L"), không có thì số lượng ("Trứng gà hộp 10 quả" → "hộp 10 quả"). */
export function unitFromName(name) {
  const SIZE = '\\d+(?:[.,]\\d+)?\\s?(?:ml|l|lít|g|gr|gram|kg)(?![\\p{L}\\d])';
  const CONT = '(?:hộp|chai|lon|gói|túi|bịch|hũ|lọ|bình|vỉ|khay|ly|cây|thanh|cuộn)';
  // "(25g*12)", "180ml x 4" → "12 × 25g"
  const multi = new RegExp(`(${SIZE})\\s*[x*×]\\s*(\\d+)(?![\\d\\p{L}])`, 'iu').exec(name);
  if (multi) return `${multi[2]} × ${multi[1]}`;
  const size = new RegExp(`(${SIZE})`, 'iu').exec(name)?.[1];
  // "lốc 4 hộp", "thùng 48 lon", "vỉ 2 cây", "bịch 46 gói"
  const pack = new RegExp(`((?:lốc|thùng|hộp|gói|bịch|túi|vỉ|khay|hũ|lọ|bó|set|combo)\\s*\\d+(?![\\d.,]|\\s?(?:ml|l|lít|g|gr|gram|kg)(?![\\p{L}\\d]))\\s*(?:${CONT.slice(3, -1)}|cái|quả|trái|miếng|viên|tờ|cuộn|túi|gói|bịch)?)`, 'iu').exec(name)?.[1]?.trim();
  if (pack && size) return `${pack} × ${size}`;
  if (size) return new RegExp(`(${CONT}\\s+${SIZE})`, 'iu').exec(name)?.[1] || size; // "hộp 1 lít"
  if (pack) return pack;
  return new RegExp(`(\\d+\\s?(?:cuộn|miếng|viên|quả|trái|gói|tờ|túi|chai|lon|hộp))(?![\\p{L}])`, 'iu').exec(name)?.[1]?.trim() || '';
}

/** Một object có giống sản phẩm không → { name, price, listPrice, image, unit, url } | null. */
export function asProduct(o, base) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  let name = null;
  for (const k of NAME_KEYS) if (typeof o[k] === 'string' && o[k].trim().length >= 3) { name = clean(o[k]); break; }
  if (!name || name.length < 3 || name.length > 160 || !/\p{L}/u.test(name)) return null;
  // schema.org: offers { price | lowPrice }
  const offers = Array.isArray(o.offers) ? o.offers[0] : o.offers;
  let sale = null, list = null;
  for (const k of SALE_KEYS) { const p = toPrice(o[k]); if (okPrice(p)) { sale = p; break; } }
  for (const k of LIST_KEYS) { const p = toPrice(o[k] && typeof o[k] === 'object' ? (o[k].value ?? o[k].amount) : o[k]); if (okPrice(p)) { list = p; break; } }
  if (offers && typeof offers === 'object') {
    const p = toPrice(offers.price ?? offers.lowPrice);
    if (okPrice(p)) sale = sale ?? p;
  }
  const price = sale && (!list || sale <= list) ? sale : list ?? sale;
  if (!okPrice(price)) return null;
  // không bán / hết hàng rõ ràng → bỏ
  if (o.isActive === false || o.active === false || o.status === 'inactive') return null;
  let image = null;
  for (const k of IMAGE_KEYS) { image = absUrl(firstString(o[k]), base); if (image) break; }
  // quy cách trong tên ("hộp 1 lít", "lốc 4 hộp x 180ml") rõ hơn đơn vị tính của hệ thống; bỏ mã nội bộ kiểu "G4", "HOP"
  let unit = unitFromName(name);
  if (!unit) for (const k of UNIT_KEYS) if (typeof o[k] === 'string' && o[k].trim() && o[k].length <= 40 && !/^[A-Z0-9_]{1,5}$/.test(o[k].trim())) { unit = clean(o[k]); break; }
  // giá tính theo đơn vị bán (vd thùng 24 chai) mà tên chỉ ghi "chai 500ml" → ghi rõ "Thùng 24 × chai 500ml"
  const qty = Number(o.quantityPerUnit ?? o.packSize ?? o.packQuantity);
  if (qty > 1 && Number.isInteger(qty) && !new RegExp(`(?:^|\\D)${qty}\\s*(?:hộp|chai|lon|gói|túi|bịch|hũ|lọ|ly|cây|thanh|cuộn|quả|trái|miếng|cái|viên|tờ)`, 'iu').test(name)) {
    const uom = String(o.uomName ?? o.unitName ?? '');
    const word = /lốc/i.test(uom) ? 'Lốc' : /thùng/i.test(uom) ? 'Thùng' : /^[\p{L}]+/u.exec(uom)?.[0] || 'Lốc';
    unit = `${word} ${qty}${unit ? ` × ${unit}` : ''}`;
  }
  let url = null;
  for (const k of URL_KEYS) if (typeof o[k] === 'string') { url = absUrl(o[k], base); if (url) break; }
  return { name, price, listPrice: list && list > price ? list : null, image, unit, url };
}

/** Quét sâu một cây JSON, gom mọi object trông như sản phẩm (không lặp tên). */
export function deepScan(root, base, { maxNodes = 300_000, maxDepth = 24 } = {}) {
  const out = [];
  const seen = new Set();
  let nodes = 0;
  const walk = (v, d) => {
    if (!v || typeof v !== 'object' || d > maxDepth || ++nodes > maxNodes) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, d + 1); return; }
    const p = asProduct(v, base);
    if (p) {
      const key = p.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(p); }
      // sản phẩm có biến thể (hasVariant / variants) → vẫn quét tiếp bên trong
    }
    for (const k of Object.keys(v)) { const x = v[k]; if (x && typeof x === 'object') walk(x, d + 1); }
  };
  walk(root, 0);
  return out;
}

const tryJson = (s) => { try { return JSON.parse(s); } catch { return undefined; } };

/** Lấy object JSON cân ngoặc bắt đầu từ vị trí i (cho `window.__X__ = {...};`). */
function balanced(s, i) {
  const open = s[i], close = open === '{' ? '}' : ']';
  let depth = 0, str = false, esc = false;
  for (let j = i; j < s.length && j - i < 8_000_000; j++) {
    const c = s[j];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return s.slice(i, j + 1);
  }
  return null;
}

/** Mọi khối JSON nhúng trong trang HTML. */
export function jsonBlocks(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const j = tryJson(m[1].trim()); if (j !== undefined) out.push(j);
  }
  for (const m of html.matchAll(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const j = tryJson(m[1].trim()); if (j !== undefined) out.push(j);
  }
  // Next.js App Router: self.__next_f.push([1,"...chuỗi JSON đã escape..."])
  let flight = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g)) { const s = tryJson(m[1]); if (typeof s === 'string') flight += s; }
  if (flight) {
    for (const line of flight.split('\n')) {
      const k = line.indexOf(':');
      const body = k >= 0 ? line.slice(k + 1) : line;
      const st = body.search(/[[{]/);
      if (st < 0) continue;
      const j = tryJson(body.slice(st)); if (j !== undefined) out.push(j);
    }
  }
  for (const m of html.matchAll(/(?:window\.)?(__INITIAL_STATE__|__NUXT__|__PRELOADED_STATE__|__APOLLO_STATE__|__INIT_DATA__)\s*=\s*/g)) {
    const i = m.index + m[0].length;
    if (html[i] !== '{' && html[i] !== '[') continue;
    const b = balanced(html, i); const j = b && tryJson(b); if (j) out.push(j);
  }
  return out;
}

/** Trang 1 sản phẩm chỉ có thẻ meta (og:title + product:price:amount). */
function metaProduct(html, base) {
  const meta = (p) => new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${p}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html)?.[1] ?? new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${p}["']`, 'i').exec(html)?.[1];
  const price = toPrice(meta('product:price:amount') || meta('og:price:amount') || meta('price'));
  const name = clean(meta('og:title') || '');
  if (!okPrice(price) || name.length < 3) return null;
  return { name, price, listPrice: null, image: absUrl(meta('og:image'), base), unit: unitFromName(name), url: absUrl(meta('og:url'), base) };
}

/** Nội dung tải về (JSON hoặc HTML) → danh sách sản phẩm. */
export function extractProducts(text, base) {
  const s = String(text ?? '');
  const trimmed = s.trimStart();
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    const j = tryJson(trimmed);
    if (j !== undefined) return deepScan(j, base);
  }
  const found = [];
  const seen = new Set();
  for (const b of jsonBlocks(s)) for (const p of deepScan(b, base)) { const k = p.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); found.push(p); } }
  if (!found.length) { const m = metaProduct(s, base); if (m) found.push(m); }
  return found;
}

// Đoán emoji + ngành hàng theo tên (cho hàng lấy về không ghi ngành hàng)
const GUESS = [
  [/sữa chua|yaourt|yogurt/i, '🍶', 'sua'], [/sữa đặc/i, '🥫', 'sua'], [/phô mai|cheese/i, '🧀', 'sua'], [/bơ (lạt|mặn)|butter/i, '🧈', 'sua'], [/\bkem\b|ice cream/i, '🍨', 'sua'], [/sữa/i, '🥛', 'sua'],
  [/gạo/i, '🍚', 'do-kho'], [/mì|mỳ|phở|hủ tiếu|bún|miến|nui|pasta|spaghetti/i, '🍜', 'do-kho'], [/ngũ cốc|yến mạch|cereal/i, '🥣', 'do-kho'], [/bột/i, '🌾', 'do-kho'], [/cháo/i, '🥣', 'do-kho'],
  [/nước mắm|nước tương|xì dầu|dầu hào|tương|mayonnaise|sốt/i, '🫙', 'gia-vi'], [/dầu ăn|dầu (đậu|olive|hướng dương)/i, '🫗', 'gia-vi'], [/muối|hạt nêm|bột ngọt|bột canh|tiêu|gia vị/i, '🧂', 'gia-vi'], [/đường/i, '🍬', 'gia-vi'],
  [/trứng/i, '🥚', 'tuoi-song'], [/gà/i, '🍗', 'tuoi-song'], [/bò/i, '🥩', 'tuoi-song'], [/heo|lợn|ba rọi|sườn/i, '🥓', 'tuoi-song'], [/cá/i, '🐟', 'tuoi-song'], [/tôm/i, '🦐', 'tuoi-song'], [/mực/i, '🦑', 'tuoi-song'], [/xúc xích|lạp xưởng/i, '🌭', 'tuoi-song'], [/chả|giò/i, '🍥', 'tuoi-song'], [/đậu hũ|đậu phụ/i, '⬜', 'tuoi-song'],
  [/táo/i, '🍎', 'rau-cu'], [/chuối/i, '🍌', 'rau-cu'], [/cam|quýt/i, '🍊', 'rau-cu'], [/nho/i, '🍇', 'rau-cu'], [/dưa hấu/i, '🍉', 'rau-cu'], [/xoài/i, '🥭', 'rau-cu'], [/bơ/i, '🥑', 'rau-cu'], [/cà chua/i, '🍅', 'rau-cu'], [/khoai/i, '🥔', 'rau-cu'], [/cà rốt/i, '🥕', 'rau-cu'], [/hành/i, '🧅', 'rau-cu'], [/tỏi/i, '🧄', 'rau-cu'], [/bông cải|súp lơ/i, '🥦', 'rau-cu'], [/rau|cải|xà lách/i, '🥬', 'rau-cu'], [/dưa|thanh long|ổi|lê|đào|dâu|sầu riêng|mít/i, '🍑', 'rau-cu'],
  [/bia|beer/i, '🍺', 'do-uong'], [/cà phê|coffee|cafe/i, '☕', 'do-uong'], [/trà|tea/i, '🍵', 'do-uong'], [/nước (suối|khoáng|tinh khiết)/i, '💧', 'do-uong'], [/nước ép|juice/i, '🧃', 'do-uong'], [/tăng lực|sting|red ?bull|warrior/i, '⚡', 'do-uong'], [/nước ngọt|coca|pepsi|7up|sprite|fanta|mirinda|soda/i, '🥤', 'do-uong'], [/nước dừa/i, '🥥', 'do-uong'],
  [/socola|chocolate|sô cô la/i, '🍫', 'banh-keo'], [/bánh quy|cookie|biscuit|oreo/i, '🍪', 'banh-keo'], [/snack|khoai tây chiên|bim bim/i, '🍿', 'banh-keo'], [/kẹo/i, '🍬', 'banh-keo'], [/hạt (điều|dẻ|óc chó|hướng dương)|đậu phộng/i, '🥜', 'banh-keo'], [/bánh mì|sandwich/i, '🍞', 'banh-keo'], [/bánh/i, '🍘', 'banh-keo'],
  [/nước giặt|bột giặt|xả vải/i, '🧺', 'hoa-pham'], [/rửa chén|rửa bát|lau sàn|tẩy/i, '🧴', 'hoa-pham'], [/giấy vệ sinh|khăn giấy|giấy ăn/i, '🧻', 'hoa-pham'], [/kem đánh răng|bàn chải/i, '🪥', 'hoa-pham'], [/dầu gội|sữa tắm|dầu xả/i, '🧴', 'hoa-pham'], [/xà phòng|xà bông/i, '🧼', 'hoa-pham'], [/tã|bỉm/i, '👶', 'hoa-pham'], [/pin\b/i, '🔋', 'hoa-pham'],
];
export function guessKind(name) {
  for (const [re, emoji, category] of GUESS) if (re.test(name)) return { emoji, category };
  return { emoji: '🛒', category: '' };
}

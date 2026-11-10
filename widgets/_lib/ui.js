// Tiện ích dùng chung cho widget của Studio (chạy trong overlay và trình chỉnh sửa trên dashboard).
// Widget chỉ được import từ đây và '#sdk'. Không đụng DOM khi import.

/** Tạo phần tử: h('div', { class: 'x', style: {...} }, ...con). Chữ luôn qua textContent (không chèn HTML). */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, x); else el.style[p] = x; }
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

/** Chèn CSS một lần cho mỗi loại widget. */
export function css(id, text) {
  if (document.querySelector(`style[data-widget="${id}"]`)) return;
  const s = document.createElement('style');
  s.dataset.widget = id; s.textContent = BASE + text;
  document.head.append(s);
}

const BASE = `
.wg{box-sizing:border-box;width:100%;height:100%;overflow:hidden;color:#fff;font-family:'Be Vietnam Pro',system-ui,sans-serif;font-weight:700;line-height:1.2}
.wg *{box-sizing:border-box}
.wg-panel{background:rgba(10,14,36,.84);border:3px solid rgba(255,255,255,.14);border-radius:30px;padding:22px 26px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.wg-title{font-size:30px;font-weight:900;letter-spacing:.5px;display:flex;align-items:center;gap:12px;margin-bottom:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wg-av{flex:none;border-radius:50%;object-fit:cover;display:inline-flex;align-items:center;justify-content:center;font-weight:900;color:#fff;border:3px solid rgba(255,255,255,.7)}
.wg-ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wg-empty{opacity:.55;font-size:24px;text-align:center;padding:10px}
`;

/** Ảnh đại diện tròn (hoặc chữ cái đầu trên nền màu theo tên). */
export function avatar(user, size = 56) {
  const style = { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.45)}px` };
  if (user?.avatar && /^https:\/\//.test(user.avatar)) {
    const img = h('img', { class: 'wg-av', style, alt: '', referrerpolicy: 'no-referrer' });
    img.src = user.avatar;
    img.onerror = () => img.replaceWith(initial(user, style));
    return img;
  }
  return initial(user, style);
}
function initial(user, style) {
  const n = String(user?.name || '?'); let hue = 0; for (const c of n) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  return h('span', { class: 'wg-av', style: { ...style, background: `hsl(${hue},55%,42%)` } }, [...n][0]?.toUpperCase() || '?');
}

export const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));
/** Màu do streamer nhập: chỉ nhận mã #rgb / #rrggbb / #rrggbbaa. */
export const color = (v, d) => (/^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? v : d);
export const clip = (t, n) => { const a = [...String(t ?? '')]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };

// Widget "Bộ đếm": các con số của phiên live (gateway đếm).
import { h, css, fmt } from '../_lib/ui.js';

const META = { likes: ['❤️', 'tim'], follows: ['➕', 'follow'], shares: ['↗️', 'share'], diamonds: ['💎', 'xu'], comments: ['💬', 'bình luận'], gifts: ['🎁', 'quà'] };

const STYLE = `
.w-cnt{display:flex;align-items:center;justify-content:space-around;gap:16px;padding:14px 20px}
.w-cnt .c{display:flex;align-items:center;gap:10px;font-size:34px;font-weight:900;white-space:nowrap}
.w-cnt .c small{font-size:20px;opacity:.7;font-weight:700}
`;

export function mount(el, { config: cfg, editing = false }) {
  css('counters', STYLE); // CSS chèn lúc mount (không đụng DOM khi import)
  const cells = {};
  const root = h('div', { class: 'wg wg-panel w-cnt' }, (cfg.metrics || []).filter((m) => META[m]).map((m) => {
    cells[m] = h('span', {}, '0');
    return h('div', { class: 'c' }, META[m][0], cells[m], h('small', {}, META[m][1]));
  }));
  el.append(root);
  function update(data) {
    const st = editing ? { likes: 12500, follows: 38, shares: 12, diamonds: 2840, comments: 940, gifts: 120 } : data?.stats || {};
    for (const [m, c] of Object.entries(cells)) c.textContent = fmt(st[m]);
  }
  update(null);
  return { update, event() {}, destroy() { root.remove(); } };
}

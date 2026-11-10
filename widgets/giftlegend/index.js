// Widget "Bảng quà": danh sách trigger → tác dụng của game đang chơi (overlay tính từ bindings + manifest.actions).
import { h, css, color } from '../_lib/ui.js';

const STYLE = `
.w-gl{display:flex;flex-direction:column}
.w-gl .rows{display:flex;flex-direction:column;gap:10px}
.w-gl .r{display:flex;align-items:center;gap:16px;font-size:26px}
.w-gl .ic{font-size:44px;width:56px;text-align:center;flex:none}
.w-gl .tx{min-width:0}
.w-gl .lb{font-size:22px;opacity:.8;margin-top:2px}
.w-gl .lb b{color:var(--c)}
`;

export function mount(el, { config: cfg, editing = false }) {
  css('giftlegend', STYLE); // CSS chèn lúc mount (không đụng DOM khi import)
  const rows = h('div', { class: 'rows' });
  const root = h('div', { class: 'wg wg-panel w-gl', style: { '--c': color(cfg.color, '#a78bfa') } }, h('div', { class: 'wg-title' }, '🎁 ', h('span', { class: 'wg-ell' }, cfg.title)), rows);
  el.append(root);
  let last = '';
  function update(data) {
    let list = data?.legend || [];
    if (editing && !list.length) list = [{ icon: '🌹', text: 'Hoa hồng', label: 'Lộ 1 chữ cái' }, { icon: '❤️', text: '1.000 tim', label: 'Lộ 1 chữ cái' }, { icon: '🎁', text: 'Quà ≥ 30 xu', label: '+60 giây' }];
    list = list.slice(0, cfg.rows);
    const key = JSON.stringify(list);
    if (key === last) return;
    last = key;
    rows.replaceChildren(...(list.length ? list.map((r) => h('div', { class: 'r' }, h('span', { class: 'ic' }, r.icon || '🎁'),
      h('div', { class: 'tx' }, h('div', { class: 'wg-ell' }, r.text), h('div', { class: 'lb wg-ell' }, '→ ', h('b', {}, r.label)))))
      : [h('div', { class: 'wg-empty' }, 'Game này chưa gán quà')]));
  }
  update(null);
  return { update, event() {}, destroy() { root.remove(); } };
}

// Widget "Bình luận": các bình luận mới nhất (và quà nếu bật).
import { giftLabel } from '#sdk';
import { h, css, avatar, clip } from '../_lib/ui.js';

const STYLE = `
.w-chat{display:flex;flex-direction:column;justify-content:flex-end;gap:10px}
.w-chat.bare{background:none;border:0;box-shadow:none;padding:0}
.w-chat .m{display:flex;align-items:flex-start;gap:12px;font-size:25px;animation:wgUp .3s ease both}
.w-chat .b{background:rgba(10,14,36,.78);border-radius:20px;padding:8px 16px;min-width:0}
.w-chat .n{font-size:20px;opacity:.75}
.w-chat .t{word-break:break-word}
.w-chat .m.gift .b{border:2px solid #f472b6}
@keyframes wgUp{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}
`;

export function mount(el, { config: cfg, editing = false }) {
  css('chat', STYLE); // CSS chèn lúc mount (không đụng DOM khi import)
  const root = h('div', { class: `wg wg-panel w-chat${cfg.panel ? '' : ' bare'}` });
  el.append(root);
  function add(user, text, gift = false) {
    root.append(h('div', { class: `m${gift ? ' gift' : ''}` }, avatar(user, 44), h('div', { class: 'b' }, h('div', { class: 'n wg-ell' }, clip(user?.name || 'Ẩn danh', 24)), h('div', { class: 't' }, clip(text, 120)))));
    while (root.children.length > cfg.rows) root.firstChild.remove();
  }
  function event(e) {
    if (e.type === 'comment' && e.text) add(e.user, e.text);
    else if (e.type === 'gift' && cfg.gifts) add(e.user, `🎁 tặng ${Math.max(1, Number(e.count) || 1)} × ${giftLabel(e.giftName) || 'quà'}`, true);
  }
  if (editing) [['Lan Chi', 'biển'], ['Quốc Huy', 'xin chào cả nhà 👋'], ['Gia Bảo', 'sóng']].forEach(([n, t]) => add({ name: n }, t));
  return { update() {}, event, destroy() { root.remove(); } };
}

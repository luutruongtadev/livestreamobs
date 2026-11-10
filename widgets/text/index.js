// Widget "Chữ / banner": chữ tĩnh hoặc chạy chữ.
import { h, css, color } from '../_lib/ui.js';

const STYLE = `
.w-text{display:flex;align-items:center;padding:0 30px;font-weight:900;white-space:nowrap}
.w-text.none{background:none;border:0;box-shadow:none;-webkit-text-stroke:2px rgba(0,0,0,.7);paint-order:stroke fill;text-shadow:0 4px 12px rgba(0,0,0,.6)}
.w-text .in{width:100%;overflow:hidden}
.w-text .mq{display:inline-block;padding-left:100%;animation:wgMq var(--d) linear infinite}
@keyframes wgMq{to{transform:translateX(-100%)}}
`;

export function mount(el, { config: cfg }) {
  css('text', STYLE); // CSS chèn lúc mount (không đụng DOM khi import)
  const style = cfg.style === 'solid' ? { background: color(cfg.bg, '#7c3aed') } : {};
  const txt = cfg.marquee ? h('span', { class: 'mq', style: { '--d': `${Math.max(6, [...cfg.text].length * 0.25)}s` } }, cfg.text) : h('span', {}, cfg.text);
  const root = h('div', { class: `wg ${cfg.style === 'none' ? 'none' : 'wg-panel'} w-text`, style: { ...style, color: color(cfg.color, '#fff'), fontSize: `${cfg.size}px` } },
    h('div', { class: 'in', style: { textAlign: cfg.align } }, txt));
  el.append(root);
  return { update() {}, event() {}, destroy() { root.remove(); } };
}

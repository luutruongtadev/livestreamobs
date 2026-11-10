// Widget "Thông báo quà": hàng đợi thẻ (quà / follow / share / người vào), mỗi thẻ hiện vài giây rồi trượt ra.
import { triggerIcon, giftLabel } from '#sdk';
import { h, css, avatar, fmt, color, clip } from '../_lib/ui.js';

const STYLE = `
.w-alerts{display:flex;align-items:center;justify-content:center;background:none;border:0;box-shadow:none}
.w-alerts .card{display:flex;align-items:center;gap:22px;width:100%;height:100%;padding:18px 28px;border-radius:32px;background:rgba(10,14,36,.9);border:3px solid var(--c);box-shadow:0 0 40px color-mix(in srgb,var(--c) 45%,transparent);animation:wgIn .45s cubic-bezier(.2,1.4,.4,1) both}
.w-alerts .card.out{animation:wgOut .35s ease both}
.w-alerts .ico{font-size:72px;flex:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,.4))}
.w-alerts .who{font-size:34px;font-weight:900}
.w-alerts .what{font-size:28px;opacity:.9;margin-top:6px}
.w-alerts .what b{color:var(--c)}
@keyframes wgIn{from{transform:translateY(40px) scale(.85);opacity:0}to{transform:none;opacity:1}}
@keyframes wgOut{to{transform:translateY(-30px) scale(.9);opacity:0}}
`;

export function mount(el, { config: cfg, editing = false }) {
  css('alerts', STYLE); // CSS chèn lúc mount (không đụng DOM khi import)
  const c = color(cfg.color, '#f472b6');
  const root = h('div', { class: 'wg w-alerts', style: { '--c': c } });
  el.append(root);
  const queue = [];
  let showing = null, timer = null;

  function card(a) {
    return h('div', { class: 'card' }, h('div', { class: 'ico' }, a.icon), avatar(a.user, 96),
      h('div', { style: { minWidth: 0 } }, h('div', { class: 'who wg-ell' }, clip(a.user?.name || 'Ẩn danh', 22)), h('div', { class: 'what wg-ell' }, ...a.what)));
  }
  function next() {
    clearTimeout(timer);
    if (showing) { const old = showing; old.classList.add('out'); setTimeout(() => old.remove(), 350); showing = null; }
    const a = queue.shift();
    if (!a) return;
    showing = card(a); root.append(showing);
    timer = setTimeout(next, (queue.length > 3 ? 2 : cfg.seconds) * 1000); // hàng đợi dài thì chạy nhanh hơn
  }
  function push(a) { if (queue.length > 30) queue.shift(); queue.push(a); if (!showing) next(); }

  function event(e) {
    if (e.type === 'gift' && cfg.gifts) {
      const n = Math.max(1, Number(e.count ?? e.repeatCount) || 1), d = (Number(e.diamonds) || 0) * n;
      if (d < cfg.minDiamonds) return;
      push({ user: e.user, icon: triggerIcon({ type: 'gift', giftName: e.giftName }), what: ['đã tặng ', h('b', {}, `${n > 1 ? `${n} × ` : ''}${giftLabel(e.giftName) || 'quà'}`), ` · ${fmt(d)} xu`] });
    } else if (e.type === 'follow' && cfg.follows) push({ user: e.user, icon: '➕', what: [h('b', {}, 'đã follow'), ' kênh — cảm ơn bạn!'] });
    else if (e.type === 'share' && cfg.shares) push({ user: e.user, icon: '↗️', what: [h('b', {}, 'đã chia sẻ'), ' buổi live'] });
    else if (e.type === 'member' && cfg.members) push({ user: e.user, icon: '👋', what: [h('b', {}, 'vừa vào'), ' xem live'] });
  }
  if (editing) { showing = card({ user: { name: 'Khán giả mẫu' }, icon: '🌹', what: ['đã tặng ', h('b', {}, '5 × Hoa hồng'), ' · 5 xu'] }); root.append(showing); }
  return { update() {}, event, destroy() { clearTimeout(timer); root.remove(); } };
}

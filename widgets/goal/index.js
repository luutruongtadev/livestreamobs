// Widget "Mục tiêu": thanh tiến độ theo số liệu phiên live (gateway đếm). Đạt mục tiêu → nháy sáng + báo signal('goal').
import { h, css, fmt, color } from '../_lib/ui.js';

const UNIT = { diamonds: 'xu', likes: 'tim', follows: 'follow', shares: 'share', gifts: 'quà', comments: 'bình luận' };

const STYLE = `
.w-goal{display:flex;flex-direction:column;justify-content:center}
.w-goal .bar{position:relative;height:54px;border-radius:27px;background:rgba(255,255,255,.1);overflow:hidden}
.w-goal .fill{position:absolute;inset:0 auto 0 0;border-radius:27px;transition:width .5s cubic-bezier(.2,.8,.2,1)}
.w-goal .fill::after{content:'';position:absolute;inset:0 0 50% 0;background:rgba(255,255,255,.25);border-radius:27px 27px 0 0}
.w-goal .num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;text-shadow:0 2px 6px rgba(0,0,0,.6)}
.w-goal .times{margin-left:auto;font-size:24px;padding:4px 14px;border-radius:999px;background:rgba(255,255,255,.12)}
.w-goal.done{animation:wgGoal 1.2s ease 2}
@keyframes wgGoal{0%,100%{transform:scale(1);box-shadow:0 12px 40px rgba(0,0,0,.35)}40%{transform:scale(1.04);box-shadow:0 0 60px var(--c)}}
`;

/** Tiến độ: { value, target, done (số lần đạt), pct }. */
export function progress(cfg, stats) {
  const total = Math.max(0, Number(stats?.[cfg.metric]) || 0);
  const target = Math.max(1, cfg.target || 1);
  if (cfg.repeat) return { value: total % target, target, done: Math.floor(total / target), total };
  return { value: Math.min(total, target), target, done: total >= target ? 1 : 0, total };
}

export function mount(el, { config: cfg, editing = false, signal = () => {} }) {
  css('goal', STYLE); // CSS chèn lúc mount (không đụng DOM khi import)
  const c = color(cfg.color, '#f5c542');
  const fill = h('div', { class: 'fill', style: { background: `linear-gradient(90deg, ${c}aa, ${c})` } });
  const num = h('div', { class: 'num' });
  const times = h('span', { class: 'times', style: { display: 'none' } });
  const root = h('div', { class: 'wg wg-panel w-goal', style: { '--c': c } },
    h('div', { class: 'wg-title' }, h('span', {}, cfg.icon || '🎯'), h('span', { class: 'wg-ell' }, cfg.title), times),
    h('div', { class: 'bar' }, fill, num));
  el.append(root);
  let lastDone = null;
  function update(data) {
    const p = progress(cfg, editing ? { [cfg.metric]: Math.round(cfg.target * 1.62) } : data?.stats || {});
    fill.style.width = `${Math.max(4, (p.value / p.target) * 100)}%`;
    num.textContent = `${fmt(p.value)} / ${fmt(p.target)} ${UNIT[cfg.metric] || ''}`;
    times.style.display = p.done ? '' : 'none';
    times.textContent = `✓ ×${p.done}`;
    if (lastDone != null && p.done > lastDone && !editing) {
      root.classList.remove('done'); void root.offsetWidth; root.classList.add('done');
      signal('goal', { done: p.done });
    }
    lastDone = data?.stats ? p.done : null; // lần đầu nhận số liệu thật: không báo "đạt" (có thể đã đạt từ trước)
  }
  update(null);
  return { update, event() {}, destroy() { root.remove(); } };
}

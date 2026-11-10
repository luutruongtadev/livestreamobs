// Widget "Bảng xếp hạng": top người tặng (số liệu phiên) hoặc top điểm tuần (BXH chung của kênh, gateway nạp định kỳ).
import { h, css, avatar, fmt, color, clip } from '../_lib/ui.js';

const STYLE = `
.w-lb{display:flex;flex-direction:column;container-type:inline-size}
@container (max-width: 440px){.w-lb .wg-av{display:none}.w-lb .r{font-size:22px;gap:8px;padding:6px 10px}.w-lb .rk{width:32px;height:32px;font-size:18px}}
.w-lb .rows{display:flex;flex-direction:column;gap:10px;flex:1;min-height:0}
.w-lb .r{display:flex;align-items:center;gap:14px;padding:8px 14px;border-radius:18px;background:rgba(255,255,255,.06);font-size:26px}
.w-lb .r.top{background:color-mix(in srgb,var(--c) 22%,transparent)}
.w-lb .rk{width:40px;height:40px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;background:rgba(255,255,255,.12)}
.w-lb .r:nth-child(1) .rk{background:#fde047;color:#1e1b4b}.w-lb .r:nth-child(2) .rk{background:#cbd5e1;color:#1e1b4b}.w-lb .r:nth-child(3) .rk{background:#f0a26b;color:#1e1b4b}
.w-lb .nm{flex:1;min-width:0}
.w-lb .pt{font-weight:900;color:var(--c)}
`;

const SAMPLE = ['Minh Anh', 'Tuấn Kiệt', 'Hồng Nhung', 'Bảo Long', 'Thu Trang', 'Quốc Huy', 'Lan Chi', 'Gia Bảo', 'Ngọc Hân', 'Hải Đăng'];

export function mount(el, { config: cfg, editing = false }) {
  css('leaderboard', STYLE); // CSS chèn lúc mount (không đụng DOM khi import)
  const c = color(cfg.color, '#fde047');
  const rows = h('div', { class: 'rows' });
  const root = h('div', { class: 'wg wg-panel w-lb', style: { '--c': c } }, h('div', { class: 'wg-title' }, '🏆 ', h('span', { class: 'wg-ell' }, cfg.title)), rows);
  el.append(root);
  let last = '';
  function update(data) {
    let list = cfg.source === 'week'
      ? (data?.lb || []).map((r) => ({ name: r.name, avatar: r.avatar, v: r.points, unit: 'đ' }))
      : (data?.stats?.gifters || []).map((g) => ({ name: g.name, avatar: g.avatar, v: g.diamonds, unit: ' xu' }));
    if (editing) list = SAMPLE.map((name, i) => ({ name, v: Math.round(5000 / (i + 1)), unit: cfg.source === 'week' ? 'đ' : ' xu' }));
    list = list.slice(0, cfg.rows);
    const key = JSON.stringify(list);
    if (key === last) return; // không vẽ lại khi không đổi
    last = key;
    rows.replaceChildren(...(list.length ? list.map((r, i) => h('div', { class: `r${i === 0 ? ' top' : ''}` },
      h('span', { class: 'rk' }, i + 1), avatar(r, 44), h('span', { class: 'nm wg-ell' }, clip(r.name || 'Ẩn danh', 18)), h('span', { class: 'pt' }, `${fmt(r.v)}${r.unit}`)))
      : [h('div', { class: 'wg-empty' }, cfg.source === 'week' ? 'Chưa ai có điểm tuần này' : 'Chưa có quà — tặng quà để lên bảng!')]));
  }
  update(null);
  return { update, event() {}, destroy() { root.remove(); } };
}

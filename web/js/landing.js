// Trang chủ: tên thương hiệu từ cấu hình, danh mục game có demo chạy thật (nạp khi cuộn tới), widget Studio thật trên khung mẫu.
import { defaultBindings, triggerText } from '#sdk';

const P = window.PLATFORM || {};
const brand = P.brand || 'Game Live';
document.querySelectorAll('[data-brand]').forEach((el) => { el.textContent = brand; });
document.title = document.title.replace('Game Live', brand);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** iframe demo 1080×1920 co theo khung chứa (chiều rộng), canh giữa theo chiều dọc. */
function fitFrame(frame) {
  const box = frame.parentElement;
  const s = box.clientWidth / 1080;
  frame.style.transform = `scale(${s})`;
  frame.style.top = `${(box.clientHeight - 1920 * s) / 2}px`;
}
const frames = new Set();
addEventListener('resize', () => frames.forEach(fitFrame));
// chỉ chạy demo khi nhìn thấy (tiết kiệm máy người xem trang)
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const f = e.target;
    if (e.isIntersecting && !f.src) f.src = `/demo?game=${encodeURIComponent(f.dataset.demo)}`;
  }
}, { rootMargin: '200px' });
function watch(frame) { frames.add(frame); fitFrame(frame); io.observe(frame); }
document.querySelectorAll('iframe[data-demo]').forEach(watch);

// ---- danh mục game ----
const gamesEl = document.getElementById('games');
fetch('/api/games').then((r) => r.json()).then((games) => {
  const list = games.filter((g) => g.status !== 'dev');
  const n = document.querySelector('[data-count="games"]'); if (n) n.textContent = String(list.length);
  gamesEl.innerHTML = list.map((g) => {
    const binds = defaultBindings(g).filter((b) => b.trigger.type === 'gift' || b.trigger.type === 'like').slice(0, 3);
    return `<article class="game">
      <div class="shot"><iframe data-demo="${esc(g.id)}" title="Demo ${esc(g.name)}" loading="lazy"></iframe><span class="live">LIVE DEMO</span></div>
      <div class="body">
        <h3>${esc(g.name)}${g.status === 'beta' ? '<span class="badge">Mới</span>' : ''}</h3>
        <p>${esc(g.description || '')}</p>
        <ul>${binds.map((b) => `<li><span>${esc(triggerText(b.trigger))}</span><span>${esc(b.label)}</span></li>`).join('')}</ul>
      </div>
    </article>`;
  }).join('');
  gamesEl.querySelectorAll('iframe[data-demo]').forEach(watch);
}).catch(() => { gamesEl.textContent = 'Không tải được danh mục game.'; });

// ---- dải sự kiện (minh hoạ cách quà / bình luận điều khiển game) ----
const EVENTS = [
  ['Minh Anh', 'tặng 5 Hoa hồng', 'lộ 1 chữ cái'], ['Tuấn Kiệt', 'gõ "argentina"', 'máy bay tới Buenos Aires'], ['Lan Chi', 'thả 1.000 tim', '+3 giây cho cả phòng'],
  ['Bảo Long', 'tặng Mũ lưỡi trai', 'gió xuôi +1 chặng'], ['Thu Trang', 'gõ "47218"', 'nhớ đúng, +96 điểm'], ['Quốc Huy', 'follow kênh', '+10 giây'],
  ['Hồng Nhung', 'tặng Bánh donut', 'chỉ châu lục trên bản đồ'], ['Gia Bảo', 'gõ "biển"', '88 điểm, gần lắm rồi'],
];
const line = EVENTS.map(([who, did, what]) => `<span><b>${esc(who)}</b> ${esc(did)} → <em>${esc(what)}</em></span>`).join('');
document.getElementById('ticker').innerHTML = line + line;

// ---- khung Studio: widget thật, dữ liệu mẫu ----
const layer = document.getElementById('studioLayer');
const SAMPLE = [
  { type: 'text', x: 60, y: 120, w: 960, h: 110, config: { text: 'Tối nay: đoán cờ 30 nước!', size: 48, style: 'solid', bg: '#ff4b1f', color: '#ffffff', align: 'center', marquee: false } },
  { type: 'goal', x: 60, y: 290, w: 960, h: 170, config: { title: 'Mục tiêu quà tối nay', icon: '🎁', metric: 'diamonds', target: 1000, repeat: true, color: '#ffd23f' } },
  { type: 'alerts', x: 60, y: 760, w: 960, h: 200, config: { gifts: true, minDiamonds: 1, follows: true, shares: true, members: false, seconds: 4, color: '#ff4b1f' } },
  { type: 'leaderboard', x: 60, y: 1180, w: 600, h: 520, config: { source: 'gifters', title: 'Top tặng quà', rows: 5, color: '#ffd23f' } },
  { type: 'counters', x: 690, y: 1180, w: 330, h: 520, config: { metrics: ['likes', 'follows', 'shares'] } },
];
function fitLayer() { const s = layer.parentElement.clientWidth / 1080; layer.style.transform = `scale(${s})`; }
addEventListener('resize', fitLayer); fitLayer();
for (const w of SAMPLE) {
  const box = document.createElement('div');
  box.className = 'w';
  Object.assign(box.style, { left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px` });
  layer.append(box);
  import(`/widgets/${w.type}/index.js`).then((m) => m.mount(box, { config: w.config, editing: true })).catch(() => {});
}

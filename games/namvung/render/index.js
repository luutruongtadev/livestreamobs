// Renderer canvas của Nằm Vùng (khung dọc 1080×1920, chừa ~150px trên cho giao diện TikTok).
// Trên: thẻ NGÀY / KPI + đồng hồ; hàng đồng hồ đo Nghi ngờ / Sóng / Bằng chứng; giữa: máy tính trong trại với 2 tab
// (💼 Việc trại, 🕵️ Bí mật); dưới: bảng quà + dòng hoạt động. Không đụng DOM khi import.
import { drawPanel } from '#sdk';
const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const TITLE = "'Baloo 2', 'Be Vietnam Pro', system-ui, sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, monospace";
const C = {
  panel: 'rgba(16,19,27,.94)', edge: 'rgba(255,255,255,.09)', text: '#ffffff', dim: 'rgba(255,255,255,.66)', faint: 'rgba(255,255,255,.35)',
  red: '#ef4444', redSoft: '#fb7185', wine: 'rgba(120,18,32,.94)', green: '#4ade80', lime: '#bef264', amber: '#fbbf24', blue: '#3b82f6',
  ink: '#1d1b22', ink2: '#5b5866', paper: '#ffffff', line: '#e7e5ee', gold: 'rgba(214,178,72,.62)', harm: '#ffc1bd', help: '#b9f6ca',
  term: '#0c1a12', termInk: '#86efac',
};
export const ACT = {
  tuantra: { icon: '🔦', name: 'Bảo an tuần tra', title: 'BẢO AN TUẦN TRA!', color: '#ff6b5e' },
  chuquan: { icon: '📱', name: 'Chủ quản nhắn', title: 'CHỦ QUẢN NHẮN!', color: '#ff6b5e' },
  tangkpi: { icon: '📈', name: 'Tăng KPI', title: 'TĂNG KPI!', color: '#ff6b5e' },
  thudt: { icon: '📵', name: 'Thu điện thoại', title: 'THU ĐIỆN THOẠI!', color: '#ff6b5e' },
  chidiem: { icon: '🕵️', name: 'Chỉ điểm', title: 'CÓ KẺ CHỈ ĐIỂM!', color: '#ff4d6d' },
  lucsoat: { icon: '🧳', name: 'Lục soát', title: 'LỤC SOÁT!', color: '#ff4d6d' },
  nhot: { icon: '🔒', name: 'Nhốt phòng tối', title: 'NHỐT PHÒNG TỐI!', color: '#ff4d6d' },
  chuyentrai: { icon: '🚐', name: 'Chuyển trại', title: 'CHUYỂN TRẠI!', color: '#ff4d6d' },
  lamngo: { icon: '🤝', name: 'Bảo an làm ngơ', title: 'BẢO AN LÀM NGƠ', color: '#5eea8f' },
  migoi: { icon: '🍜', name: 'Gói mì lén', title: 'GÓI MÌ LÉN!', color: '#5eea8f' },
  sim: { icon: '📶', name: 'Sim lậu', title: 'CÓ SIM LẬU!', color: '#5eea8f' },
  noigian: { icon: '🗝️', name: 'Nội gián', title: 'NỘI GIÁN GIÚP!', color: '#5eea8f' },
  lamho: { icon: '🧑‍🤝‍🧑', name: 'Đồng hương làm hộ', title: 'ĐỒNG HƯƠNG LÀM HỘ', color: '#5eea8f' },
  giaicuu: { icon: '🚔', name: 'Công an ập vào', title: 'CÔNG AN ẬP VÀO!', color: '#ffd84d' },
};
const HELP_SET = new Set(['lamngo', 'migoi', 'sim', 'noigian', 'lamho', 'giaicuu']);
const STATUS = { tuantra: ['🔦', 'Tuần tra'], thudt: ['📵', 'Mất điện thoại'], nhot: ['🔒', 'Bị nhốt'] };
const COINS = { rose: 1, 'finger heart': 5, doughnut: 30, perfume: 20, 'hat and mustache': 99, 'money gun': 500, galaxy: 1000, corgi: 299, cap: 99, 'heart me': 1, 'hand hearts': 100, sunglasses: 199, lion: 29999, 'ice cream cone': 1, tiktok: 1, gg: 1 };
const JOBNAME = { chat: ['💬', 'Nhắn tin mồi'], call: ['📞', 'Gọi theo kịch bản'], money: ['💵', 'Sổ tiền'] };
const TOP = 150;

export function mount(el, { canvas, options = {}, input = null } = {}) {
  let LAYOUT = {}; // vị trí / cỡ / ẩn các bảng do streamer chỉnh trong Studio
  const studioPanel = (id, def, fn) => drawPanel(ctx, LAYOUT, id, def, fn);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let S = null, recvAt = 0, raf = 0, stopped = false, last = performance.now();
  const anim = { storyAt: new Map(), phaseAt: 0, phaseKey: '', title: null, shake: 0, hot: {}, pingAt: new Map(), kpiAt: 0, evAt: 0, patrolAt: 0, caughtAt: 0, flashAt: 0, flash: null };
  const floaters = [], confetti = [];
  let hits = [];
  const sound = makeSound(!!options.mute);
  const images = new Map();

  if (typeof document !== 'undefined' && !document.getElementById('dd-font')) {
    const l = document.createElement('link');
    l.id = 'dd-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap';
    document.head.append(l);
  }
  if (typeof getComputedStyle === 'function' && getComputedStyle(el).position === 'static') el.style.position = 'relative';

  // ---------------- tiện ích ----------------
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fill(x, y, w, h, r, color) { rr(x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); }
  function stroke(x, y, w, h, r, color, lw = 2) { rr(x, y, w, h, r); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); }
  function text(s, x, y, size, color = C.text, weight = 800, align = 'center', maxW = 0, font = FONT) {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    let t = String(s ?? '');
    if (maxW && ctx.measureText(t).width > maxW) { while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; }
    ctx.fillText(t, x, y);
    return ctx.measureText(t).width;
  }
  const measure = (s, size, weight = 800, font = FONT) => { ctx.font = `${weight} ${size}px ${font}`; return ctx.measureText(String(s)).width; };
  function wrap(s, size, maxW, weight = 700, font = FONT) {
    const words = String(s ?? '').split(/\s+/).filter(Boolean); const lines = []; let cur = '';
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (measure(t, size, weight, font) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }
  function bigText(s, x, y, size, color, strokeC = '#16060a', maxW = W - 80) {
    let sz = size;
    while (sz > 30 && measure(s, sz, 800, TITLE) > maxW) sz -= 4;
    ctx.font = `800 ${sz}px ${TITLE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, sz * 0.16); ctx.strokeStyle = strokeC; ctx.strokeText(s, x, y + sz * 0.06);
    ctx.fillStyle = color; ctx.fillText(s, x, y + sz * 0.06);
  }
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3));
  const back = (k) => { if (k <= 0) return 0; if (k >= 1) return 1; const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const left = (ms, now) => (S.paused ? ms : Math.max(0, ms - (now - recvAt)));
  const clock = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(n || 0);
  const hit = (x, y, w, h, ev) => hits.push({ x, y, w, h, ev });
  function img(src) {
    let a = images.get(src);
    if (!a) { a = { img: new Image(), ok: false }; a.img.referrerPolicy = 'no-referrer'; a.img.onload = () => { a.ok = true; }; a.img.src = src; images.set(src, a); if (images.size > 80) images.delete(images.keys().next().value); }
    return a.ok ? a.img : null;
  }
  function avatar(user, x, y, r, ring = 'rgba(255,255,255,.9)') {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    const im = user?.avatar ? img(user.avatar) : null;
    if (im) { ctx.save(); ctx.clip(); ctx.drawImage(im, x - r, y - r, r * 2, r * 2); ctx.restore(); }
    else { const n = user?.name || '?'; let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; ctx.fillStyle = `hsl(${h},48%,42%)`; ctx.fill(); text([...n][0]?.toUpperCase() || '?', x, y + 1, Math.round(r * 1.05), '#fff', 800); }
    if (ring) { ctx.lineWidth = Math.max(2, r * 0.1); ctx.strokeStyle = ring; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  const statusOf = (k) => S.status?.find((s) => s.kind === k);
  function bar(x, y, w, h, k, c0, c1) {
    fill(x, y, w, h, h / 2, 'rgba(255,255,255,.12)');
    k = Math.max(0, Math.min(1, k));
    if (k <= 0) return;
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, c0); g.addColorStop(1, c1);
    fill(x, y, Math.max(h, w * k), h, h / 2, g);
  }

  // ---------------- nền: phòng máy trong trại ----------------
  function drawBg(now) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#111827'); g.addColorStop(0.6, '#0b1020'); g.addColorStop(1, '#05070d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // song sắt cửa sổ
    ctx.fillStyle = 'rgba(148,163,184,.08)';
    for (let x = 40; x < W; x += 120) ctx.fillRect(x, 0, 14, H);
    // đèn đỏ trần nhà nhấp nháy khi đang tuần tra
    if (S && statusOf('tuantra') && !reduced) {
      const a = 0.08 + 0.08 * (0.5 + 0.5 * Math.sin(now / 180));
      ctx.fillStyle = `rgba(239,68,68,${a})`; ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------- HUD trên ----------------
  function drawHud(now) {
    const x = 24, y = TOP, w = 776, h = 150;
    fill(x, y, w, h, 26, C.panel); stroke(x, y, w, h, 26, C.edge);
    text(`NGÀY ${S.day}/${S.days} · ${S.chapter?.title?.toUpperCase() || ''}`, x + 30, y + 34, 22, C.amber, 900, 'left', w - 330);
    const tag = `🕶️ Mật danh: ${S.code}`;
    const tw = measure(tag, 21, 800) + 28;
    fill(x + w - tw - 20, y + 15, tw, 38, 19, 'rgba(255,255,255,.1)');
    text(tag, x + w - tw / 2 - 20, y + 35, 21, '#e5e7eb', 800);
    const esc = S.escape;
    text(esc ? '🏃 Đường thoát' : 'KPI hôm nay', x + 30, y + 80, 28, C.text, 800, 'left');
    const bx = x + 30, by = y + 106, bw = w - 190;
    bar(bx, by, bw, 24, esc ? esc.seg / esc.n : S.kpi / Math.max(1, S.kpiTarget), esc ? '#38bdf8' : '#f59e0b', esc ? '#a7f3d0' : '#fde047');
    const pop = 1 + 0.35 * Math.max(0, 1 - (now - anim.kpiAt) / 350);
    ctx.save(); ctx.translate(x + w - 82, by + 6); ctx.scale(pop, pop);
    text(esc ? `${esc.seg}/${esc.n}` : `${S.kpi}/${S.kpiTarget}`, 0, 0, 40, esc ? '#a7f3d0' : S.kpi >= S.kpiTarget ? C.green : '#fde047', 900);
    ctx.restore();
    if (S.saved) text(`🛟 đã cứu ${S.saved}`, x + 230, y + 80, 22, '#67e8f9', 800, 'left');
    const dx = 816, dw = 240;
    fill(dx, y, dw, h, 26, C.panel); stroke(dx, y, dw, h, 26, C.edge);
    text(S.chapter?.kind === 'escape' ? 'TRỜI SÁNG' : 'HẾT NGÀY', dx + dw / 2, y + 32, 22, C.dim, 800);
    const ms = S.phase === 'work' ? left(S.remainingMs, now) : S.phase === 'brief' ? S.dayMs : 0;
    const urgent = S.phase === 'work' && ms < 30_000;
    const pulse = urgent && !reduced ? 1 + 0.06 * Math.sin(now / 90) : 1;
    ctx.save(); ctx.translate(dx + dw / 2, y + 96); ctx.scale(pulse, pulse);
    text(clock(ms), 0, 0, 72, urgent ? '#ff5470' : C.text, 900, 'center', 0, TITLE);
    ctx.restore();
  }

  function drawMeters(now) {
    const y = TOP + 166, h = 128;
    // nghi ngờ
    let x = 24, w = 344;
    const sus = S.suspicion;
    const hot = sus >= 70;
    fill(x, y, w, h, 22, hot && !reduced && Math.floor(now / 300) % 2 ? 'rgba(120,18,32,.95)' : C.panel); stroke(x, y, w, h, 22, C.edge);
    text('🚨 NGHI NGỜ', x + 20, y + 28, 22, C.redSoft, 900, 'left');
    text(`${Math.floor(sus)}%`, x + w - 20, y + 28, 30, hot ? '#ff5470' : '#fff', 900, 'right');
    bar(x + 20, y + 54, w - 40, 22, sus / 100, '#f97316', '#ef4444');
    text(S.coverWord ? `💬 Bình luận “${S.coverWord}” để che` : 'Bị lộ ở 100%', x + 20, y + 102, 19, C.dim, 700, 'left', w - 40);
    // sóng
    x = 380; w = 344;
    const noPhone = !!statusOf('thudt');
    if (S.escape) {
      const dm = left(S.escape.distractMs, now);
      fill(x, y, w, h, 22, C.panel); stroke(x, y, w, h, 22, dm > 0 ? 'rgba(244,114,182,.8)' : C.edge, dm > 0 ? 4 : 2);
      text('❤️ ĐÁNH LẠC HƯỚNG', x + 20, y + 28, 22, '#f9a8d4', 900, 'left');
      text(dm > 0 ? `${(dm / 1000).toFixed(1)}s` : '—', x + w - 20, y + 28, 28, '#fff', 900, 'right');
      bar(x + 20, y + 54, w - 40, 22, dm / 8000, '#f472b6', '#fbcfe8');
      text('Thả tim: camera tắt (tối đa 8 giây)', x + 20, y + 102, 19, C.dim, 700, 'left', w - 40);
    } else {
    fill(x, y, w, h, 22, C.panel); stroke(x, y, w, h, 22, S.signal >= 100 && !noPhone ? 'rgba(74,222,128,.7)' : C.edge, S.signal >= 100 ? 4 : 2);
    text(noPhone ? '📵 MẤT ĐIỆN THOẠI' : '📶 SÓNG', x + 20, y + 28, 22, noPhone ? C.redSoft : C.green, 900, 'left');
    text(noPhone ? '—' : `${Math.floor(S.signal)}%`, x + w - 20, y + 28, 30, '#fff', 900, 'right');
    bar(x + 20, y + 54, w - 40, 22, noPhone ? 0 : S.signal / 100, '#22c55e', '#bef264');
    text(S.signal >= 100 && !noPhone ? '✅ Đủ sóng: gửi được!' : `❤️ Thả tim để có sóng (${fmtN(S.likesFull)} tim)`, x + 20, y + 102, 19, C.dim, 700, 'left', w - 40);
    }
    // bằng chứng
    x = 736; w = 320;
    fill(x, y, w, h, 22, C.panel); stroke(x, y, w, h, 22, C.edge);
    text('📁 BẰNG CHỨNG', x + 20, y + 28, 22, '#93c5fd', 900, 'left');
    text(`${S.sent}/${S.items.length}`, x + w - 20, y + 28, 28, '#fff', 900, 'right');
    const n = S.items.length, gap = 6, sz = Math.min(52, (w - 40 - gap * (n - 1)) / n);
    const pop = Math.max(0, 1 - (now - anim.evAt) / 500);
    S.items.forEach((it, i) => {
      const ix = x + 20 + i * (sz + gap), iy = y + 56;
      fill(ix, iy, sz, sz, 12, it.state === 'sent' ? 'rgba(34,197,94,.3)' : it.state === 'held' ? 'rgba(251,191,36,.28)' : 'rgba(255,255,255,.07)');
      if (it.state !== 'todo') stroke(ix, iy, sz, sz, 12, it.state === 'sent' ? C.green : C.amber, 3);
      ctx.save(); ctx.globalAlpha = it.state === 'todo' ? 0.35 : 1;
      text(it.icon, ix + sz / 2, iy + sz / 2 + 2, sz * 0.58 * (it.state === 'held' ? 1 + pop * 0.3 : 1));
      ctx.restore();
    });
  }

  // ---------------- bảng quà + dòng hoạt động ----------------
  const giftOf = (p) => [p.trigger?.giftName, ...(p.trigger?.gifts || [])].find(Boolean);
  function coinsOf(p) { const g = giftOf(p); return g ? COINS[String(g).toLowerCase()] : null; }
  function giftGrid(now, x, y, w) {
    const list = (S.powerups || []).filter((p) => ACT[p.action]);
    const cols = 5, cw = (w - 20) / cols, ch = 100, rows = Math.ceil(list.length / cols);
    const h = rows * ch + 56;
    fill(x, y, w, h, 24, 'rgba(16,19,27,.9)');
    text('🔦 Bảo an / chủ quản gây khó', x + 24, y + 26, 20, C.harm, 800, 'left');
    text('🤝 Người tốt giúp đỡ', x + w - 24, y + 26, 20, C.help, 800, 'right');
    list.forEach((p, i) => {
      const cx = x + 10 + (i % cols) * cw, cy = y + 46 + Math.floor(i / cols) * ch, a = ACT[p.action];
      if ((anim.hot[p.action] || 0) > now) fill(cx + 4, cy + 2, cw - 8, ch - 4, 16, C.gold);
      text(p.icon, cx + cw / 2, cy + 26, 34);
      const c = coinsOf(p);
      const tag = p.trigger?.type === 'gift' ? (c ? `${fmtN(c)} xu` : p.text) : p.text;
      const tw = measure(tag, 15, 800) + 16;
      fill(cx + cw / 2 - tw / 2, cy + 44, tw, 22, 11, 'rgba(0,0,0,.55)');
      text(tag, cx + cw / 2, cy + 56, 15, '#fde68a', 800, 'center', cw - 10);
      text(`${a.icon} ${a.name}`, cx + cw / 2, cy + 82, 17, HELP_SET.has(p.action) ? C.help : C.harm, 800, 'center', cw - 8);
    });
    return y + h;
  }
  function drawFeed(now, x, yBottom) {
    const rows = (S.feed || []).filter((f) => f.ageMs + (now - recvAt) < 14_000).slice(-3);
    rows.forEach((f, i) => {
      const y = yBottom - (rows.length - i) * 72;
      const a = ACT[f.action]; if (!a) return;
      const age = f.ageMs + (now - recvAt);
      ctx.save(); ctx.globalAlpha = Math.min(1, (14_000 - age) / 1500);
      const label = `${f.by.name}: ${a.name}${f.n > 1 ? ` ×${f.n}` : ''}`;
      const w = Math.min(660, measure(label, 25, 700) + 150);
      fill(x, y, w, 60, 30, HELP_SET.has(f.action) ? 'rgba(20,83,45,.94)' : C.wine);
      avatar(f.by, x + 31, y + 30, 23);
      text(a.icon, x + 80, y + 31, 27);
      text(label, x + 110, y + 31, 25, '#fff', 700, 'left', w - 126);
      ctx.restore();
    });
  }

  // ---------------- tin chủ quản ----------------
  function pingCard(p, x, y, w, now) {
    const lines = p.waiting ? [] : wrap(p.text, 28, w - 190, 600).slice(0, 2);
    const h = lines.length > 1 ? 148 : 112;
    const at = anim.pingAt.get(p.id) ?? now;
    const k = reduced ? 1 : back(Math.min(1, (now - at) / 320));
    ctx.save(); ctx.translate((1 - k) * -80, 0); ctx.globalAlpha = Math.min(1, k + 0.2);
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    fill(x, y, w, h, 18, C.paper); ctx.shadowColor = 'transparent';
    fill(x, y, 9, h, 4, C.red);
    avatar(p.by, x + 60, y + h / 2, 34, null);
    const nw = text(p.by.name, x + 110, y + 34, 26, C.ink, 800, 'left', w - 330);
    text('· chủ quản', x + 118 + nw, y + 36, 20, '#b91c1c', 700, 'left');
    if (p.waiting) text(`đang gõ ${'•••'.slice(0, 1 + Math.floor(now / 300) % 3)}`, x + 110, y + 76, 27, '#8b8796', 600, 'left');
    else lines.forEach((ln, i) => text(ln, x + 110, y + 76 + i * 36, 28, C.ink, 600, 'left', w - 190));
    fill(x + w - 64, y + 18, 46, 46, 12, '#efedf3');
    text('✕', x + w - 41, y + 42, 24, C.ink, 800);
    hit(x + w - 74, y + 8, 66, 66, { type: 'click', target: 'ping', id: p.id });
    ctx.restore();
  }

  // ---------------- máy tính ----------------
  const WIN = { x: 24, y: TOP + 312, w: 1032, h: 846 };
  function caret(now) { return Math.floor(now / 500) % 2 === 0 ? '|' : ''; }
  function field(x, y, w, h, typed, placeholder, now, key, size = 34, dark = false) {
    rr(x, y, w, h, 14); ctx.fillStyle = dark ? '#05140b' : '#fff'; ctx.fill(); ctx.strokeStyle = dark ? '#22c55e' : C.blue; ctx.lineWidth = 4; ctx.stroke();
    const ink = dark ? C.termInk : C.ink;
    if (typed) {
      ctx.save(); rr(x + 4, y + 4, w - 8, h - 8, 10); ctx.clip();
      const lines = wrap(typed, size, w - 44, 700, dark ? MONO : FONT);
      const shown = lines.slice(-Math.max(1, Math.floor((h - 20) / (size * 1.3))));
      shown.forEach((ln, i) => text(ln + (i === shown.length - 1 ? caret(now) : ''), x + 22, y + 10 + size * 0.75 + i * size * 1.3, size, ink, 700, 'left', 0, dark ? MONO : FONT));
      ctx.restore();
    } else text(placeholder + caret(now), x + 22, y + h / 2, size * 0.85, dark ? 'rgba(134,239,172,.45)' : '#9a97a6', 600, 'left', w - 40);
    activeField = { x, y, w, h, key, typed: typed || '' };
  }
  function button(x, y, w, h, label, color, ev, size = 26, ink = '#fff', disabled = false) {
    ctx.save(); if (disabled) ctx.globalAlpha = 0.4;
    fill(x, y, w, h, 14, color);
    text(label, x + w / 2, y + h / 2 + 1, size, ink, 800, 'center', w - 12);
    ctx.restore();
    if (ev && !disabled) hit(x, y, w, h, ev);
  }

  function drawCampJob(now, x, y, w, h) {
    const j = S.job;
    fill(x, y, w, h, 18, '#fff');
    if (!j) { text('Đang mở việc mới…', x + w / 2, y + h / 2, 32, C.ink2, 700); return; }
    if (j.kind === 'chat') {
      fill(x, y, w, 96, 18, '#f1f0f7'); ctx.fillStyle = '#f1f0f7'; ctx.fillRect(x, y + 60, w, 36);
      avatar({ name: j.to }, x + 56, y + 48, 30, null);
      text(j.to, x + 100, y + 36, 28, C.ink, 800, 'left', w - 140);
      text('đang hoạt động', x + 100, y + 68, 20, '#16a34a', 600, 'left');
      // tin mồi theo kịch bản
      text('Kịch bản giao: gõ lại tin này', x + 36, y + 130, 22, '#8b8796', 700, 'left');
      const lines = wrap(j.text, 32, w - 150, 700).slice(0, 3);
      const bh = 34 + lines.length * 42;
      fill(x + 36, y + 152, w - 110, bh, 22, '#2563eb');
      lines.forEach((ln, i) => text(ln, x + 60, y + 152 + 38 + i * 42, 32, '#fff', 700, 'left'));
      // dấu hiệu lừa đảo cho người xem
      const fy = y + 170 + bh;
      fill(x + 36, fy, w - 72, 50, 12, '#fff7ed');
      text(`🚩 Dấu hiệu lừa đảo: ${j.flag}`, x + 54, fy + 26, 22, '#c2410c', 800, 'left', w - 110);
      field(x + 36, fy + 70, w - 72, 130, j.typed, 'Gõ lại tin nhắn…', now, `j${j.id}`, 32);
      button(x + 36, y + h - 84, 360, 64, '⚠️ Cảnh báo ngầm', '#f97316', { type: 'click', target: 'warn' }, 26);
      text('cứu người này, nghi ngờ tăng', x + 216, y + h - 10, 17, '#9a3412', 700);
      button(x + w - 236, y + h - 84, 200, 64, 'Gửi ➤', '#2563eb', { type: 'click', target: 'send' }, 26);
    } else if (j.kind === 'call') {
      const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#0f172a'); g.addColorStop(1, '#1e293b');
      fill(x, y, w, h, 18, g);
      const ring = reduced ? 0 : (now / 900) % 1;
      ctx.beginPath(); ctx.arc(x + w / 2, y + 130, 70 + ring * 40, 0, Math.PI * 2); ctx.strokeStyle = `rgba(74,222,128,${0.6 - ring * 0.6})`; ctx.lineWidth = 4; ctx.stroke();
      avatar({ name: j.to }, x + w / 2, y + 130, 66, '#4ade80');
      text(j.to, x + w / 2, y + 230, 30, '#fff', 800);
      text(`📞 đang gọi · ${clock(((now / 1000) % 600) * 1000)}`, x + w / 2, y + 268, 22, '#94a3b8', 600);
      fill(x + 60, y + 300, w - 120, 84, 20, 'rgba(255,255,255,.1)');
      text(`“${j.victim}”`, x + w / 2, y + 342, 34, '#fff', 800, 'center', w - 160);
      text('Chọn câu đúng kịch bản (sai thì giám sát nghe thấy)', x + w / 2, y + 418, 22, '#94a3b8', 700);
      j.opts.forEach((o, i) => button(x + 60, y + 450 + i * 92, w - 120, 78, o, '#334155', { type: 'click', target: 'opt', id: i }, 28));
    } else {
      text('💵 Sổ tiền phòng hôm nay', x + 36, y + 50, 38, C.ink, 900, 'left');
      text('(đơn vị: nghìn đồng)', x + 36, y + 92, 22, '#8b8796', 600, 'left');
      const gx = x + 36, gy = y + 120, cw = w - 72, rh = 70;
      j.nums.forEach((n, i) => {
        fill(gx, gy + i * rh, 120, rh - 6, 8, '#fef3c7'); text(`Ca ${i + 1}`, gx + 60, gy + i * rh + 32, 24, '#92400e', 800);
        fill(gx + 128, gy + i * rh, cw - 128, rh - 6, 8, '#f6f6f9'); text(fmtN(n), gx + cw - 30, gy + i * rh + 32, 34, C.ink, 800, 'right');
      });
      const ty = gy + j.nums.length * rh + 10;
      text('TỔNG =', gx + 10, ty + 54, 34, '#92400e', 900, 'left');
      field(gx + 170, ty + 4, cw - 170, 100, j.typed, 'Gõ tổng…', now, `j${j.id}`, 40);
      text('Cộng lại rồi Enter', x + 36, y + h - 46, 22, '#8b8796', 600, 'left');
      button(x + w - 186, y + h - 76, 150, 56, 'Xong ➤', '#eef0ff', { type: 'click', target: 'send' }, 24, C.ink);
    }
  }

  function drawSecret(now, x, y, w, h) {
    fill(x, y, w, h, 18, C.term);
    const j = S.secret;
    if (S.safeMs > 0) { const lab = `🛡️ AN TOÀN ${Math.ceil(left(S.safeMs, now) / 1000)}s`; const lw = measure(lab, 22, 900) + 30; fill(x + w - lw - 20, y + 18, lw, 40, 20, 'rgba(34,197,94,.3)'); text(lab, x + w - lw / 2 - 20, y + 39, 22, '#bbf7d0', 900); }
    if (j?.kind === 'cipher' || j?.kind === 'relay') {
      const cip = j.kind === 'cipher';
      text(cip ? '📟 TIN MẬT TỪ CHỈ HUY SƠN' : '💌 LỜI NHẮN CỦA BÉ HAI', x + 30, y + 40, 22, 'rgba(134,239,172,.7)', 900, 'left', w - 280, MONO);
      text(cip ? 'Giải mã để biết lúc nào an toàn' : 'Gửi giúp về cho gia đình Bé Hai', x + 30, y + 86, 34, C.termInk, 900, 'left', w - 60);
      fill(x + 30, y + 120, w - 60, 150, 14, cip ? '#05140b' : '#f5f0dc');
      if (cip) {
        text(j.enc, x + w / 2, y + 180, 44, '#fde68a', 900, 'center', w - 100, MONO);
        const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        text(`Mỗi chữ cái lùi lại ${j.shift} bậc: ${L[j.shift]} → A, ${L[j.shift + 1]} → B, ${L[j.shift + 2]} → C…`, x + w / 2, y + 240, 22, 'rgba(134,239,172,.75)', 700);
      } else wrap(`“${j.text}”`, 34, w - 120, 800).slice(0, 2).forEach((ln, i, arr) => text(ln, x + w / 2, y + 195 + (i - (arr.length - 1) / 2) * 44, 34, '#3f3a2a', 800));
      field(x + 30, y + 296, w - 60, 120, j.typed, cip ? 'Gõ câu đã giải mã…' : 'Gõ lại lời nhắn…', now, `x${j.id}`, 34, true);
      button(x + w - 210, y + 436, 180, 60, cip ? 'Giải ➤' : 'Gửi ➤', '#16a34a', { type: 'click', target: 'send' }, 24);
      text(cip ? 'Giải đúng: một lúc ở tab này không bị nghi ngờ' : 'Bé Hai sẽ tin bạn và đi nhanh hơn trong đêm giải cứu', x + 30, y + 466, 20, 'rgba(134,239,172,.6)', 700, 'left', w - 280);
      return;
    }
    const sendH = 150;
    const ch = h - sendH - 16;
    if (!j) {
      text('✅ Đã thu đủ bằng chứng', x + w / 2, y + ch / 2 - 30, 40, C.termInk, 900, 'center', 0, TITLE);
      text('Chờ đủ sóng rồi gửi về cho công an', x + w / 2, y + ch / 2 + 26, 26, 'rgba(134,239,172,.7)', 700);
    } else {
      const idx = S.sent + S.held + 1;
      text(`BẰNG CHỨNG ${idx}/${S.items.length}`, x + 30, y + 40, 22, 'rgba(134,239,172,.7)', 900, 'left', 0, MONO);
      text(`${j.item.icon} ${j.item.name}`, x + 30, y + 86, 38, C.termInk, 900, 'left', w - 60);
      const by = y + 124, bh = ch - 124;
      if (j.kind === 'photo') {
        // tài liệu mờ + khung ngắm
        const px = x + w / 2 - 210, py = by + 6, pw = 420, ph = bh - 120;
        ctx.save(); ctx.translate(px + pw / 2, py + ph / 2); ctx.rotate(-0.04); ctx.translate(-(px + pw / 2), -(py + ph / 2));
        fill(px, py, pw, ph, 8, '#e7e2d3');
        ctx.fillStyle = 'rgba(60,50,40,.45)';
        for (let i = 0; i < 9; i++) ctx.fillRect(px + 34, py + 50 + i * Math.min(38, (ph - 80) / 9), pw - 68 - (i % 3) * 50, 10);
        text('MẬT', px + pw - 70, py + 34, 26, '#b91c1c', 900);
        ctx.restore();
        ctx.strokeStyle = C.termInk; ctx.lineWidth = 5;
        for (const [cx, cy, sx, sy] of [[px - 20, py - 10, 1, 1], [px + pw + 20, py - 10, -1, 1], [px - 20, py + ph + 10, 1, -1], [px + pw + 20, py + ph + 10, -1, -1]]) {
          ctx.beginPath(); ctx.moveTo(cx, cy + sy * 40); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * 40, cy); ctx.stroke();
        }
        if (now - anim.flashAt < 140) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x, y, w, ch); }
        button(x + w / 2 - 200, by + bh - 96, 400, 84, `📸 Chụp (${j.shots}/${j.need})`, '#16a34a', { type: 'click', target: 'shutter' }, 34);
      } else if (j.kind === 'map') {
        const seq = j.order.map((i, k) => `${k < j.pos ? '✓' : k + 1}. ${j.rooms[i]}`).join('  →  ');
        wrap(seq, 24, w - 60, 800, FONT).slice(0, 2).forEach((ln, i) => text(ln, x + 30, by + 14 + i * 34, 24, '#fde68a', 800, 'left'));
        text('Bấm các phòng đúng thứ tự trên để vẽ sơ đồ', x + 30, by + 86, 21, 'rgba(134,239,172,.7)', 700, 'left');
        const gx = x + 30, gy = by + 116, gw = w - 60, gh = bh - 130, cw = (gw - 30) / 3, rh = (gh - 15) / 2;
        const done = new Set(j.order.slice(0, j.pos));
        j.rooms.forEach((r, i) => {
          const rx = gx + (i % 3) * (cw + 15), ry = gy + Math.floor(i / 3) * (rh + 15);
          fill(rx, ry, cw, rh, 12, done.has(i) ? 'rgba(34,197,94,.3)' : 'rgba(134,239,172,.08)');
          stroke(rx, ry, cw, rh, 12, done.has(i) ? C.green : 'rgba(134,239,172,.5)', 3);
          wrap(r, 26, cw - 20, 800).slice(0, 2).forEach((ln, k, arr) => text(ln, rx + cw / 2, ry + rh / 2 + (k - (arr.length - 1) / 2) * 32, 26, C.termInk, 800));
          hit(rx, ry, cw, rh, { type: 'click', target: 'room', id: i });
        });
      } else {
        const gps = j.kind === 'gps';
        text(gps ? 'Ghi lại toạ độ (chỉ cần đúng các chữ số):' : 'Chép lại thông tin này:', x + 30, by + 20, 23, 'rgba(134,239,172,.7)', 700, 'left');
        fill(x + 30, by + 46, w - 60, 130, 14, gps ? '#0b2a1a' : '#f5f0dc');
        if (gps) {
          text('📍', x + 80, by + 111, 54);
          text(j.text, x + 130, by + 111, 46, '#fde68a', 900, 'left', w - 190, MONO);
        } else wrap(j.text, 34, w - 120, 800).slice(0, 2).forEach((ln, i, arr) => text(ln, x + 60, by + 111 + (i - (arr.length - 1) / 2) * 44, 34, '#3f3a2a', 800, 'left'));
        field(x + 30, by + 200, w - 60, 120, j.typed, gps ? 'Gõ toạ độ…' : 'Gõ lại…', now, `s${j.id}`, 34, true);
        button(x + w - 210, by + 340, 180, 60, 'Lưu ➤', '#16a34a', { type: 'click', target: 'send' }, 24);
      }
    }
    // khung gửi về
    const sy = y + h - sendH;
    fill(x + 16, sy, w - 32, sendH - 16, 16, 'rgba(0,0,0,.35)'); stroke(x + 16, sy, w - 32, sendH - 16, 16, 'rgba(134,239,172,.35)');
    const noPhone = !!statusOf('thudt');
    const why = noPhone ? '📵 Điện thoại bị thu, chưa gửi được' : S.held <= 0 ? 'Chưa có bằng chứng mới để gửi' : S.signal < 100 ? `Cần sóng 100% (đang ${Math.floor(S.signal)}%): nhờ mọi người thả tim ❤️` : `${S.held} bằng chứng sẵn sàng: gửi ngay!`;
    text(`📡 Gửi về công an Việt Nam · đã gửi ${S.sent}/${S.items.length}`, x + 40, sy + 34, 23, C.termInk, 800, 'left', w - 80);
    text(why, x + 40, sy + 70, 21, S.canSend ? '#fde68a' : 'rgba(134,239,172,.6)', 700, 'left', w - 380);
    const pulse = S.canSend && !reduced ? 0.85 + 0.15 * Math.sin(now / 150) : 1;
    ctx.save(); ctx.globalAlpha = pulse;
    button(x + w - 320, sy + 50, 280, 74, `GỬI (${S.held})`, S.canSend ? '#dc2626' : '#374151', { type: 'click', target: 'radio' }, 30, '#fff', !S.canSend);
    ctx.restore();
  }

  // ---------------- đêm giải cứu: hành lang ----------------
  function drawEscape(now, x, y, w, h) {
    const e = S.escape;
    const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#060912'); g.addColorStop(1, '#111827');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    // bản đồ các đoạn
    const n = e.n, sw = (w - 60) / n;
    e.segs.forEach((sg, i) => {
      const sx = x + 30 + i * sw, done = i < e.seg, cur = i === e.seg;
      fill(sx + 3, y + 24, sw - 6, 56, 10, done ? 'rgba(34,197,94,.35)' : cur ? 'rgba(56,189,248,.35)' : 'rgba(255,255,255,.06)');
      text(done ? '✓' : sg.revealed ? (sg.dir === 'trai' ? '⬅' : '➡') : '?', sx + sw / 2, y + 53, 28, done ? '#86efac' : sg.revealed ? '#fde68a' : C.faint, 900);
      if (sg.cam && !done) text('📹', sx + sw - 16, y + 30, 18);
    });
    text('🚪', x + w - 22, y + 53, 30);
    // khung cảnh đoạn hiện tại
    const cy = y + 110, chh = h - 280;
    fill(x + 30, cy, w - 60, chh, 18, '#0b1222');
    ctx.save(); rr(x + 30, cy, w - 60, chh, 18); ctx.clip();
    // hành lang phối cảnh
    ctx.strokeStyle = 'rgba(148,163,184,.25)'; ctx.lineWidth = 3;
    const vx = x + w / 2, vy = cy + chh * 0.42;
    for (const [px, py] of [[x + 30, cy], [x + w - 30, cy], [x + 30, cy + chh], [x + w - 30, cy + chh]]) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(vx, vy); ctx.stroke(); }
    fill(vx - 120, vy - 80, 240, 160, 6, 'rgba(15,23,42,.9)'); stroke(vx - 120, vy - 80, 240, 160, 6, 'rgba(148,163,184,.4)', 3);
    const sg = e.segs[e.seg];
    if (sg) {
      text(sg.revealed ? (sg.dir === 'trai' ? '⬅ RẼ TRÁI' : 'RẼ PHẢI ➡') : '❓ Chưa rõ đường', vx, vy - 120, 34, sg.revealed ? '#fde68a' : C.dim, 900);
      if (sg.cam) { // camera quét
        const a = (now / 600) % (Math.PI * 2);
        ctx.save(); ctx.translate(x + w - 120, cy + 40); ctx.rotate(Math.PI * 0.62 + Math.sin(a) * 0.35);
        const cg = ctx.createLinearGradient(0, 0, 600, 0); cg.addColorStop(0, 'rgba(239,68,68,.55)'); cg.addColorStop(1, 'rgba(239,68,68,0)');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(620, -130); ctx.lineTo(620, 130); ctx.closePath(); ctx.fill();
        ctx.restore();
        text('📹', x + w - 120, cy + 40, 52);
        text('CAMERA ĐANG QUÉT: CHỜ!', vx, cy + chh - 40, 30, '#fca5a5', 900);
      } else text(e.distractMs > 0 ? '❤️ Camera bị đánh lạc hướng: ĐI!' : '✅ Camera quay đi: ĐI!', vx, cy + chh - 40, 30, '#86efac', 900);
    }
    // nhân vật
    const bob = reduced ? 0 : Math.sin(now / 200) * 4;
    ctx.save(); if (e.hidden) ctx.globalAlpha = 0.45;
    text(e.hidden ? '📦' : '🕵️', vx - (e.friend ? 50 : 0), vy + 150 + bob, 96);
    if (e.friend) text(S.cast?.friend?.icon || '🧑‍🌾', vx + 60, vy + 160 - bob, 80);
    ctx.restore();
    if (e.moveInMs > 0) text(`${e.friend ? 'Bé Hai theo sau' : 'Lấy hơi'}… ${(left(e.moveInMs, now) / 1000).toFixed(1)}s`, vx, vy + 240, 22, C.dim, 700);
    ctx.restore();
    // nút
    const byb = y + h - 150, bw2 = (w - 100) / 3;
    const canMove = !e.hidden && left(e.moveInMs, now) <= 0;
    button(x + 30, byb, bw2, 120, '⬅ TRÁI', '#2563eb', { type: 'click', target: 'move', id: 'trai' }, 40, '#fff', !canMove);
    button(x + 50 + bw2, byb, bw2, 120, e.hidden ? '🏃 RA KHỎI CHỖ TRỐN' : '🫣 TRỐN', e.hidden ? '#a16207' : '#475569', { type: 'click', target: 'hide' }, e.hidden ? 26 : 40);
    button(x + 70 + bw2 * 2, byb, bw2, 120, 'PHẢI ➡', '#2563eb', { type: 'click', target: 'move', id: 'phai' }, 40, '#fff', !canMove);
  }

  // ---------------- nhân vật nhắn tin ----------------
  function storyCard(m, x, y, w, now) {
    const lines = wrap(m.text, 26, w - 140, 700).slice(0, 2);
    const h = 66 + lines.length * 34;
    const at = anim.storyAt.get(m.id) ?? now;
    const k = reduced ? 1 : back(Math.min(1, (now - at) / 320));
    const fade = Math.min(1, left(m.leftMs, now) / 400);
    ctx.save(); ctx.globalAlpha = Math.min(1, k + 0.2) * fade; ctx.translate((1 - k) * -80, 0);
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
    fill(x, y, w, h, 20, '#fffaf0'); ctx.shadowColor = 'transparent';
    fill(x, y, 9, h, 4, '#f59e0b');
    ctx.beginPath(); ctx.arc(x + 52, y + 46, 30, 0, Math.PI * 2); ctx.fillStyle = '#fde68a'; ctx.fill();
    text(m.by.icon || '💬', x + 52, y + 49, 36);
    text(m.by.name, x + 96, y + 30, 22, '#92400e', 800, 'left', w - 120);
    lines.forEach((ln, i) => text(ln, x + 96, y + 64 + i * 34, 26, C.ink, 700, 'left', w - 120));
    ctx.restore();
    return h;
  }
  function drawStory(now, x, yBottom, w) {
    let cy = yBottom;
    for (const m of (S.story || []).slice(-2).reverse()) { const n = Math.min(2, wrap(m.text, 26, w - 140, 700).length); cy -= 66 + n * 34 + 12; storyCard(m, x, cy, w, now); }
  }

  function drawLocked(now, x, y, w, h) {
    fill(x, y, w, h, 18, '#020203');
    const st = statusOf('nhot');
    const flick = reduced ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(now / 700));
    ctx.save(); ctx.globalAlpha = flick;
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2 - 40, 10, x + w / 2, y + h / 2 - 40, 300);
    g.addColorStop(0, 'rgba(253,230,138,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore();
    text('🔒', x + w / 2, y + h / 2 - 110, 120);
    bigText('BỊ NHỐT PHÒNG TỐI', x + w / 2, y + h / 2 + 20, 64, '#fca5a5', '#1a0508', w - 60);
    text(`còn ${Math.ceil(left(st?.leftMs || 0, now) / 1000)} giây · bởi ${st?.by?.name || 'bảo an'}`, x + w / 2, y + h / 2 + 100, 28, C.dim, 700);
  }

  function guard(cx, cy, r, by, now, beam) {
    // đèn pin: hình nón quét
    if (beam) {
      const a = reduced ? -0.5 : -0.5 + Math.sin(now / 900) * 0.45;
      ctx.save(); ctx.translate(cx - r * 0.6, cy + r * 0.9); ctx.rotate(Math.PI + a);
      const g = ctx.createLinearGradient(0, 0, 700, 0); g.addColorStop(0, 'rgba(253,230,138,.55)'); g.addColorStop(1, 'rgba(253,230,138,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(760, -170); ctx.lineTo(760, 170); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.75, r * 1.5, r * 0.95, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fbbf24'; ctx.font = `800 ${r * 0.34}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('BẢO AN', cx, cy + r * 1.42);
    const im = by?.avatar ? img(by.avatar) : null;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (im) { ctx.clip(); ctx.drawImage(im, cx - r, cy - r, r * 2, r * 2); ctx.restore(); }
    else {
      ctx.fillStyle = '#d6a77a'; ctx.fill(); ctx.restore();
      const look = Math.sin(now / 600) * r * 0.1;
      for (const s of [-1, 1]) { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(cx + s * r * 0.36 + look, cy + r * 0.05, r * 0.12, r * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#111'; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.moveTo(cx - r * 0.25, cy + r * 0.5); ctx.lineTo(cx + r * 0.25, cy + r * 0.5); ctx.stroke();
    }
    // mũ bảo an
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.62, r * 1.05, r * 0.42, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx - r * 1.15, cy - r * 0.66, r * 2.3, r * 0.16);
    ctx.lineWidth = 6; ctx.strokeStyle = '#0b0b0f'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  function redFrame(now, x, y, w, h, r) {
    const a = reduced ? 0.8 : 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(now / 160));
    stroke(x, y, w, h, r, `rgba(239,35,60,${a})`, 12);
  }

  function drawDesktop(now) {
    const { x, y, w, h } = WIN;
    const sh = anim.shake > 0 && !reduced ? (Math.random() - 0.5) * 30 * anim.shake : 0;
    const patrol = statusOf('tuantra');
    const secret = S.tab === 'secret';
    ctx.save(); ctx.translate(sh, 0);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; fill(x, y, w, h, 26, '#1b1d26'); ctx.restore();
    // tab
    const tabs = S.escape ? [] : [['camp', '💼 Việc trại'], ['secret', statusOf('thudt') ? '🔒 Bí mật' : '🕵️ Bí mật']];
    if (S.escape) text('🌙 ĐÊM GIẢI CỨU · ← → để đi, Space để trốn', x + 24, y + 39, 24, '#a7f3d0', 900, 'left');
    tabs.forEach(([id, label], i) => {
      const tx = x + 16 + i * 250, on = S.tab === id;
      fill(tx, y + 10, 240, 56, 14, on ? (id === 'secret' ? C.term : '#ffffff') : 'rgba(255,255,255,.07)');
      text(label, tx + 120, y + 39, 25, on ? (id === 'secret' ? C.termInk : C.ink) : C.dim, 800);
      hit(tx, y + 10, 240, 56, { type: 'tab', id });
    });
    if (S.phase === 'work' && S.job && !secret) text(`${JOBNAME[S.job.kind]?.[0] || ''} ${JOBNAME[S.job.kind]?.[1] || ''}`, x + w - 24, y + 39, 22, C.dim, 700, 'right');
    else if (secret) text('Esc: về Việc trại', x + w - 24, y + 39, 20, C.faint, 700, 'right');
    const ix = x + 16, iy = y + 76, iw = w - 32, ih = h - 92;
    ctx.save(); rr(ix, iy, iw, ih, 18); ctx.clip();
    if (S.phase === 'work' && S.escape) {
      if (statusOf('nhot')) drawLocked(now, ix, iy, iw, ih); else drawEscape(now, ix, iy, iw, ih);
    } else if (S.phase === 'work') {
      if (statusOf('nhot')) drawLocked(now, ix, iy, iw, ih);
      else if (secret) drawSecret(now, ix, iy, iw, ih);
      else drawCampJob(now, ix, iy, iw, ih);
    } else {
      fill(ix, iy, iw, ih, 18, 'rgba(255,255,255,.06)');
      text(S.phase === 'brief' ? 'Chuẩn bị vào ca…' : 'Hết ngày', ix + iw / 2, iy + ih / 2, 40, C.dim, 800);
    }
    ctx.restore();
    if (patrol) {
      redFrame(now, x, y, w, h, 26);
      const k = reduced ? 1 : ease((now - anim.patrolAt) / 500);
      const gx = W + 130 - 230 * k, gy = y + 300 + (reduced ? 0 : Math.sin(now / 500) * 8);
      ctx.restore();
      guard(gx, gy, 105, patrol.by, now, true);
      const bub = `🔦 ${patrol.line || 'Đang làm gì đó?'}`;
      const bw = measure(bub, 27, 800) + 44;
      fill(gx - 140 - bw, gy - 160, bw, 62, 31, '#fff');
      text(bub, gx - 140 - bw / 2, gy - 128, 27, C.ink, 800);
      const danger = S.escape ? !S.escape.hidden : secret;
      const warn = danger && Math.floor(now / 260) % 2 === 0;
      const label = S.escape ? (S.escape.hidden ? `🫣 Đang trốn… ${Math.ceil(left(patrol.leftMs, now) / 1000)}s` : '⚠️ TRỐN NGAY! (Space)') : secret ? '⚠️ CHUYỂN TAB NGAY! (Esc)' : `🔦 Bảo an tuần tra ${Math.ceil(left(patrol.leftMs, now) / 1000)}s`;
      const lw = measure(label, 30, 900) + 50;
      fill(x + w / 2 - lw / 2, y + h - 40, lw, 64, 32, danger ? (warn ? '#dc2626' : '#7f1d1d') : 'rgba(17,24,39,.95)');
      text(label, x + w / 2, y + h - 7, 30, '#fff', 900);
    } else ctx.restore();
    if (S.phase === 'work' && S.story?.length) drawStory(now, x + 40, y + h - 30 - (patrol ? 60 : 0), w - 80);
    // tin chủ quản che màn hình (bấm ✕ mới đóng)
    if (S.phase === 'work' && S.pings?.length) { hits = hits.filter((hh) => hh.ev.type === 'tab'); activeField = null; }
    for (const p of S.pings || []) {
      const px = x + 30 + ((p.id * 97) % 220), py = y + 120 + ((p.id * 61) % 520);
      pingCard(p, px, py, 760, now);
    }
  }

  // ---------------- chữ lớn ----------------
  function drawTitle(now, cy) {
    const t = anim.title; if (!t || S.phase === 'end') return;
    const age = (now - t.at) / 1000;
    if (age > t.life) { anim.title = null; return; }
    const k = reduced ? 1 : back(Math.min(1, age / 0.28));
    const fade = Math.min(1, (t.life - age) / 0.35);
    ctx.save(); ctx.globalAlpha = fade; ctx.translate(W / 2, cy); ctx.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k);
    bigText(t.text, 0, 0, 100, t.color);
    if (t.by) bigText(`bởi ${t.by}`, 0, 86, 42, '#fff', '#1a1a22');
    if (t.sub) bigText(t.sub, 0, 142, 34, '#fde68a', '#1a1a22', W - 120);
    ctx.restore();
  }
  function drawParticles(dt) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i]; p.age += dt; if (p.age > p.life) { confetti.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += 1600 * dt;
      ctx.save(); ctx.globalAlpha = Math.min(1, (p.life - p.age) * 2);
      if (p.sym) text(p.sym, p.x, p.y, p.size);
      else { ctx.translate(p.x, p.y); ctx.rotate(p.age * p.spin); ctx.fillStyle = p.color; ctx.fillRect(-9, -5, 18, 10); }
      ctx.restore();
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.age += dt; if (f.age > f.life) { floaters.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.min(1, (f.life - f.age) * 2);
      bigText(f.text, f.x, f.y - f.age * 70, f.size, f.color, '#1a1a22');
      ctx.restore();
    }
  }
  function burst(n = 140) {
    if (reduced) return;
    const cols = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#ffffff'];
    for (let i = 0; i < n; i++) confetti.push({ x: W / 2 + (Math.random() - 0.5) * 300, y: 700, vx: (Math.random() - 0.5) * 1400, vy: -300 - Math.random() * 900, life: 2.6, age: 0, spin: (Math.random() - 0.5) * 12, color: cols[i % cols.length], g: true });
  }

  // ---------------- thẻ đầu ngày / cuối ngày / kết thúc ----------------
  function card(x, y, w, h) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50; fill(x, y, w, h, 34, 'rgba(14,16,24,.97)'); ctx.restore();
    stroke(x, y, w, h, 34, 'rgba(255,255,255,.1)');
  }
  function voteBox(now, y, v, opts = {}) {
    const qLines = wrap(v.q, 28, 780, 700).slice(0, 2);
    const many = v.options.length > 2;
    const oh = many ? 80 : 92;
    const h = 90 + qLines.length * 38 + (many ? v.options.length * (oh + 10) : oh) + 20;
    fill(110, y, 860, h, 22, 'rgba(250,204,21,.12)'); stroke(110, y, 860, h, 22, 'rgba(250,204,21,.6)', 3);
    text(`🗳️ NGƯỜI XEM QUYẾT ĐỊNH · bình luận ${many ? 'A, B hoặc C' : '1 hoặc 2'} · còn ${Math.ceil(left(S.remainingMs, now) / 1000)}s`, W / 2, y + 30, 22, '#fde047', 900, 'center', 820);
    qLines.forEach((ln, i) => text(ln, W / 2, y + 72 + i * 38, 28, '#fff', 700));
    const oy = y + 72 + qLines.length * 38 + 6, tot = v.counts.reduce((a, c) => a + c, 0);
    v.options.forEach((o, i) => {
      const ox = many ? 130 : 130 + i * 415, ow = many ? 820 : 405, yy = many ? oy + i * (oh + 10) : oy;
      const k2 = tot ? v.counts[i] / tot : 0;
      fill(ox, yy, ow, oh, 18, 'rgba(255,255,255,.08)');
      if (k2 > 0) fill(ox, yy, Math.max(36, ow * k2), oh, 18, ['rgba(96,165,250,.35)', 'rgba(244,114,182,.35)', 'rgba(250,204,21,.3)'][i % 3]);
      const key = many ? 'ABC'[i] : String(i + 1);
      text(key, ox + 34, yy + oh / 2, 44, ['#93c5fd', '#f9a8d4', '#fde047'][i % 3], 900, 'center', 0, TITLE);
      if (many && opts.suspects) {
        const sp = opts.suspects[i];
        text(`${sp.icon} ${sp.name} · ${sp.role}`, ox + 70, yy + 24, 24, '#fff', 800, 'left', ow - 180);
        text(sp.clues.length ? `“${sp.clues.join('” · “')}”` : 'Chưa có manh mối', ox + 70, yy + 56, 18, '#fde68a', 700, 'left', ow - 180);
      } else wrap(o.label, 24, ow - 110, 800).slice(0, 2).forEach((ln, k3, arr) => text(ln, ox + 70, yy + oh / 2 + (k3 - (arr.length - 1) / 2) * 28, 24, '#fff', 800, 'left'));
      text(`${v.counts[i]} phiếu`, ox + ow - 14, yy + oh - 14, 16, C.dim, 800, 'right');
    });
    return h;
  }
  function drawBrief(now) {
    const k = reduced ? 1 : back(Math.min(1, (now - anim.phaseAt) / 420));
    ctx.save(); ctx.translate(W / 2, 980); ctx.scale(k, k); ctx.translate(-W / 2, -980);
    const ch = S.chapter || {};
    const first = S.day === 1;
    const intro = [...(first ? S.intro : []), ...(ch.intro || [])].flatMap((l) => wrap(l, 30, 800, 700)).slice(0, 9);
    const vh = S.vote ? 90 + wrap(S.vote.q, 28, 780, 700).slice(0, 2).length * 38 + 112 : 0;
    const chh = 330 + intro.length * 42 + (first ? 120 : 0) + vh, y0 = Math.max(TOP + 10, 990 - chh / 2);
    card(80, y0, 920, chh);
    text(first ? `CHIẾN DỊCH ${S.campaign} · MẬT DANH ${S.code.toUpperCase()}` : `NGÀY ${S.day}/${S.days}`, W / 2, y0 + 50, 24, C.amber, 900);
    bigText(`${ch.kind === 'escape' ? '🌙' : '🕶️'} ${ch.title}`, W / 2, y0 + 118, 80, ch.kind === 'escape' ? '#a7f3d0' : '#fff');
    let y = y0 + 190;
    intro.forEach((ln, i) => text(ln, W / 2, y + i * 42, 30, '#e5e7eb', 700));
    y += intro.length * 42 + 10;
    if (first) { // dàn nhân vật
      const cast = Object.values(S.cast || {}).slice(0, 5);
      const cw = 168;
      cast.forEach((c, i) => {
        const cx = W / 2 - (cast.length * cw) / 2 + i * cw + cw / 2;
        ctx.beginPath(); ctx.arc(cx, y + 34, 32, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
        text(c.icon, cx, y + 37, 38); text(c.name, cx, y + 86, 20, '#fff', 800, 'center', cw - 8); text(c.role, cx, y + 108, 16, C.dim, 700, 'center', cw - 8);
      });
      y += 130;
    }
    const info = ch.kind === 'escape' ? `Thoát ra trước khi trời sáng (${clock(S.dayMs)}) · đã gửi ${S.sent}/${S.items.length} bằng chứng${S.flags?.friend ? ' · Bé Hai đi cùng' : ''}`
      : `KPI hôm nay ${S.kpiTarget} · nghi ngờ ${Math.floor(S.suspicion)}% · đã gửi ${S.sent}/${S.items.length} bằng chứng`;
    text(info, W / 2, y + 20, 26, C.lime, 800, 'center', 860);
    y += 60;
    if (S.vote) voteBox(now, y, S.vote);
    else text(`Vào ca sau ${Math.ceil(left(S.remainingMs, now) / 1000)} giây`, W / 2, y + 10, 22, C.faint, 700);
    ctx.restore();
  }
  function board(title, rows, x, y, w, unit) {
    text(title, x, y, 25, C.dim, 800, 'left');
    if (!rows?.length) { text('—', x, y + 50, 26, C.faint, 700, 'left'); return; }
    rows.forEach((r, i) => {
      avatar(r, x + 24, y + 52 + i * 60, 22, null);
      text(r.name, x + 58, y + 52 + i * 60, 24, '#fff', 700, 'left', w - 160);
      text(`${fmtN(r.points)} ${unit}`, x + w, y + 52 + i * 60, 21, '#fde68a', 800, 'right');
    });
  }
  function drawDayEnd(now) {
    const r = S.dayResult; if (!r) return;
    const k = reduced ? 1 : back(Math.min(1, (now - anim.phaseAt) / 450));
    ctx.save(); ctx.translate(W / 2, 1000); ctx.scale(k, k); ctx.translate(-W / 2, -1000);
    const tv = S.vote?.kind === 'traitor';
    const chLines = r.choice?.result ? wrap(`🗳️ “${r.choice.label}”: ${r.choice.result}`, 26, 780, 700).slice(0, 3) : [];
    const tvh = tv ? 90 + 38 + S.vote.options.length * 90 + 20 : 0;
    const hh = 300 + chLines.length * 36 + (r.punishment ? 130 : 0) + tvh;
    const y0 = Math.max(TOP + 10, 1000 - hh / 2);
    card(90, y0, 900, hh);
    bigText(r.ok ? 'QUA ĐƯỢC NGÀY!' : 'THIẾU KPI!', W / 2, y0 + 80, 88, r.ok ? '#4ade80' : '#ff4d6d');
    text(`Ngày ${r.day}: ${r.title} · KPI ${r.kpi}/${r.target} · nghi ngờ ${r.delta >= 0 ? '+' : ''}${r.delta}% → ${r.sus}%`, W / 2, y0 + 168, 26, '#fff', 800, 'center', 860);
    let y = y0 + 210;
    chLines.forEach((ln, i) => text(ln, W / 2, y + i * 36, 26, '#c4b5fd', 700));
    y += chLines.length * 36 + 10;
    if (r.punishment) {
      fill(150, y, 780, 110, 20, 'rgba(225,29,72,.18)');
      text('Hình phạt cho streamer', W / 2, y + 30, 22, C.redSoft, 800);
      text(r.punishment, W / 2, y + 72, 30, '#fff', 800, 'center', 740);
      y += 130;
    }
    if (tv) { text('🐀 HẮC LONG: "TRONG TRẠI CÓ CHUỘT"', W / 2, y + 16, 26, '#fca5a5', 900); y += 40; voteBox(now, y, S.vote, { suspects: S.suspects }); }
    else text(`Sang ngày ${r.day + 1} sau ${Math.ceil(left(S.remainingMs, now) / 1000)} giây`, W / 2, y + 30, 24, C.faint, 700);
    ctx.restore();
  }
  function drawEnd(now) {
    const r = S.result; if (!r) return;
    if (r.win && !reduced) { // đèn còi công an
      const red = Math.floor(now / 250) % 2 === 0;
      const g = ctx.createRadialGradient(red ? 0 : W, 0, 50, red ? 0 : W, 0, 1100);
      g.addColorStop(0, red ? 'rgba(239,68,68,.45)' : 'rgba(59,130,246,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    const k = reduced ? 1 : back(Math.min(1, (now - anim.phaseAt) / 450));
    ctx.save(); ctx.translate(W / 2, 1000); ctx.scale(k, k); ctx.translate(-W / 2, -1000);
    card(50, TOP + 20, 980, 1560);
    const y0 = TOP + 20;
    text(`CHIẾN DỊCH ${r.campaign} · MẬT DANH ${r.code.toUpperCase()}`, W / 2, y0 + 46, 22, C.amber, 900);
    bigText(`${r.icon} ${r.title}`, W / 2, y0 + 112, 72, r.win ? '#4ade80' : '#ff4d6d');
    let y = y0 + 180;
    for (const l of r.lines) for (const ln of wrap(l, 28, 860, 700)) { text(ln, W / 2, y, 28, '#e5e7eb', 700); y += 40; }
    y += 14;
    // kẻ phản bội
    const t = r.traitor;
    fill(110, y, 860, 76, 18, 'rgba(239,68,68,.12)');
    text(`🐀 Kẻ phản bội: ${t.icon} ${t.name}${t.guessed ? (t.correct ? ' · người xem đoán ĐÚNG ✅' : ` · người xem đoán nhầm ${t.guessed} ❌`) : ''}`, W / 2, y + 38, 26, '#fecaca', 800, 'center', 820);
    y += 96;
    // hồ sơ vụ án
    text(`📁 HỒ SƠ VỤ ÁN · ${r.dossier.filter((p) => p.sent).length}/${r.total} trang`, 120, y + 14, 24, '#93c5fd', 900, 'left');
    y += 40;
    r.dossier.forEach((p) => {
      fill(110, y, 860, 64, 14, p.sent ? 'rgba(59,130,246,.14)' : 'rgba(255,255,255,.04)');
      ctx.save(); if (!p.sent) ctx.globalAlpha = 0.4;
      text(p.icon, 150, y + 33, 32);
      text(p.name, 190, y + 22, 22, '#fff', 800, 'left', 760);
      text(p.sent ? p.note : 'Chưa gửi về được', 190, y + 47, 18, p.sent ? '#bfdbfe' : C.dim, 700, 'left', 760);
      ctx.restore();
      y += 72;
    });
    y += 6;
    text(`🛟 Cứu ${r.saved} người · ${r.scams} lần chạy KPI · lựa chọn: ${r.choices.map((c) => (c.tag === 'tot' ? '🤍' : '🎲')).join(' ') || '—'}`, W / 2, y + 12, 22, C.dim, 700, 'center', 880);
    y += 44;
    fill(110, y, 860, 96, 20, 'rgba(59,130,246,.16)');
    text('🛡️ Nhớ để không bị lừa · gặp chuyện gọi 113', W / 2, y + 28, 20, '#93c5fd', 800);
    text(r.tip, W / 2, y + 66, 26, '#fff', 800, 'center', 820);
    y += 120;
    board('🔦 Bảo an gắt nhất', S.top?.bosses, 110, y, 400, 'xu');
    board('🤝 Đồng đội thầm lặng', S.top?.helpers, 570, y, 400, 'điểm');
    text(`Chiến dịch mới sau ${Math.ceil(left(S.remainingMs, now) / 1000)} giây`, W / 2, y0 + 1530, 22, C.faint, 700);
    ctx.restore();
  }

  // ---------------- đầu vào tại chỗ ----------------
  let activeField = null, typing = null, composing = false, lastTypeAt = 0, fieldKey = '';
  if (input && typeof document !== 'undefined') {
    typing = document.createElement('input');
    typing.type = 'text'; typing.autocomplete = 'off'; typing.spellcheck = false; typing.setAttribute('aria-label', 'Ô gõ chữ');
    Object.assign(typing.style, { position: 'absolute', zIndex: 5, opacity: '0', border: '0', padding: '0', fontSize: '16px', display: 'none' });
    el.append(typing);
    typing.addEventListener('compositionstart', () => { composing = true; });
    typing.addEventListener('compositionend', () => { composing = false; lastTypeAt = performance.now(); input({ type: 'text', value: typing.value }); });
    typing.addEventListener('input', () => { lastTypeAt = performance.now(); input({ type: 'text', value: typing.value }); });
    typing.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); input({ type: 'enter' }); }
      else if (e.key === 'Escape') { e.preventDefault(); input({ type: 'tab', id: 'camp' }); }
      else if (e.key === 'Tab') { e.preventDefault(); input({ type: 'tab', id: S?.tab === 'secret' ? 'camp' : 'secret' }); }
    });
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      for (let i = hits.length - 1; i >= 0; i--) { const hh = hits[i]; if (x >= hh.x && x <= hh.x + hh.w && y >= hh.y && y <= hh.y + hh.h) { input(hh.ev); break; } }
      sound.resume();
      setTimeout(() => { if (activeField) typing.focus(); }, 0);
    });
    addEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (!S || e.target === typing) return;
    if (S.escape && S.phase === 'work') {
      if (e.key === 'ArrowLeft') { e.preventDefault(); input({ type: 'move', dir: 'trai' }); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); input({ type: 'move', dir: 'phai' }); return; }
      if (e.code === 'Space' || e.key === 'ArrowDown') { e.preventDefault(); input({ type: 'hide' }); return; }
    }
    if (e.key === 'Escape') { e.preventDefault(); input({ type: 'tab', id: 'camp' }); }
    else if (e.key === 'Tab') { e.preventDefault(); input({ type: 'tab', id: S.tab === 'secret' ? 'camp' : 'secret' }); }
    else if (activeField && e.key.length === 1 && !e.ctrlKey && !e.metaKey) typing.focus();
  }
  function placeTyping() {
    if (!typing) return;
    if (!activeField) { if (typing.style.display !== 'none') { typing.style.display = 'none'; typing.blur(); } fieldKey = ''; return; }
    const f = activeField, s = canvas.clientWidth / W;
    Object.assign(typing.style, { display: 'block', left: `${canvas.offsetLeft + f.x * s}px`, top: `${canvas.offsetTop + f.y * s}px`, width: `${f.w * s}px`, height: `${f.h * s}px` });
    const focused = document.activeElement === typing;
    if (f.key !== fieldKey) { fieldKey = f.key; typing.value = f.typed; if (focused) typing.focus(); }
    else if (!composing && performance.now() - lastTypeAt > 450 && typing.value !== f.typed) typing.value = f.typed;
  }

  // ---------------- vòng vẽ ----------------
  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    anim.shake = Math.max(0, anim.shake - dt * 2.5);
    hits = []; activeField = null;
    ctx.clearRect(0, 0, W, H);
    if (!S) { placeTyping(); return; }
    drawBg(now);
    drawHud(now);
    drawMeters(now);
    drawDesktop(now);
    const gy = WIN.y + WIN.h + 18;
    let gb = gy;
    studioPanel('gifts', { x: 24, y: gy }, () => { gb = giftGrid(now, 24, gy, 1032); });
    const fb = Math.min(H - 20, Math.max(gb, gy + 356) + 236);
    studioPanel('feed', { x: 24, y: fb - 216 }, () => drawFeed(now, 24, fb));
    drawTitle(now, 860);
    if (S.phase === 'brief') drawBrief(now);
    if (S.phase === 'dayend') drawDayEnd(now);
    if (S.phase === 'end') drawEnd(now);
    drawParticles(dt);
    if (S.paused) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H); bigText('⏸ TẠM DỪNG', W / 2, H / 2, 100, '#fff'); }
    if (S.phase !== 'work' || S.paused) { activeField = null; hits = []; }
    placeTyping();
  }
  (typeof document !== 'undefined' && document.fonts?.ready || Promise.resolve()).finally(() => { if (!stopped) raf = requestAnimationFrame(frame); });
  if (typeof document !== 'undefined') document.fonts?.load?.(`800 40px ${TITLE}`).catch?.(() => {});

  return {
    update(s) {
      const now = performance.now();
      const key = `${s.phase}|${s.campaign}|${s.day}`;
      if (key !== anim.phaseKey) { anim.phaseKey = key; anim.phaseAt = now; if (s.phase !== 'work') { floaters.length = 0; anim.title = null; } }
      for (const p of s.pings || []) if (!anim.pingAt.has(p.id)) anim.pingAt.set(p.id, now);
      for (const m of s.story || []) if (!anim.storyAt.has(m.id)) anim.storyAt.set(m.id, now);
      if (anim.storyAt.size > 40) for (const id of [...anim.storyAt.keys()].slice(0, 20)) anim.storyAt.delete(id);
      if (anim.pingAt.size > 60) for (const id of [...anim.pingAt.keys()].slice(0, 30)) anim.pingAt.delete(id);
      const pat = !!s.status?.some((x) => x.kind === 'tuantra');
      if (pat && !S?.status?.some((x) => x.kind === 'tuantra')) anim.patrolAt = now;
      S = s; recvAt = now;
    },
    effect(fx) {
      const now = performance.now();
      switch (fx.type) {
        case 'nv_gift': {
          const a = ACT[fx.action]; if (!a) break;
          anim.title = { text: a.title, by: fx.by?.name, sub: fx.sub, color: a.color, at: now, life: 1.9 };
          anim.hot[fx.action] = now + 1600;
          sound.play(HELP_SET.has(fx.action) ? 'help' : 'harm');
          if (fx.action === 'giaicuu') burst(220);
          if (['chidiem', 'lucsoat', 'chuyentrai', 'nhot'].includes(fx.action)) anim.shake = 1;
          break;
        }
        case 'nv_ping': sound.play('ping'); break;
        case 'nv_kpi': anim.kpiAt = now; sound.play('step'); if (fx.by) floaters.push({ text: `+1 KPI · ${fx.by.name}`, x: W / 2, y: 560, color: '#fde047', size: 40, life: 1.4, age: 0 }); break;
        case 'nv_saved': sound.play('cleared'); floaters.push({ text: `🛟 Đã cảnh báo ${fx.to}`, x: W / 2, y: 600, color: '#67e8f9', size: 42, life: 1.8, age: 0 }); break;
        case 'nv_evidence': anim.evAt = now; sound.play('cleared'); floaters.push({ text: `${fx.item?.icon || '📁'} +1 bằng chứng`, x: W / 2, y: 600, color: '#86efac', size: 46, life: 1.6, age: 0 }); break;
        case 'nv_sent': sound.play('radio'); floaters.push({ text: `📡 Đã gửi ${fx.n} bằng chứng!`, x: W / 2, y: 600, color: '#fde047', size: 50, life: 2, age: 0 }); break;
        case 'nv_shot': anim.flashAt = now; sound.play('shutter'); break;
        case 'nv_cover': if (floaters.length < 12) floaters.push({ text: `🫣 ${fx.by?.name || ''} che`, x: 220 + Math.random() * 640, y: WIN.y + WIN.h - 80 - Math.random() * 300, color: '#c4b5fd', size: 30, life: 1.2, age: 0 }); break;
        case 'nv_caught': anim.shake = 1; sound.play('alarm'); break;
        case 'nv_signal_full': sound.play('radio'); floaters.push({ text: '📶 Sóng đầy!', x: 552, y: TOP + 340, color: '#86efac', size: 44, life: 1.6, age: 0 }); break;
        case 'nv_wrong': anim.shake = 0.5; sound.play('wrong'); break;
        case 'nv_zap': case 'nv_tab': case 'nv_ping_close': sound.play('zap'); break;
        case 'nv_win': burst(260); sound.play('siren'); break;
        case 'nv_lose': anim.shake = 1; sound.play('fail'); break;
        case 'nv_dayend': sound.play(fx.ok ? 'cleared' : 'fail'); break;
        case 'nv_brief': sound.play('brief'); break;
        case 'nv_vote': sound.play('zap'); break;
        case 'nv_choice': anim.title = { text: `NGƯỜI XEM CHỌN ${fx.i + 1}!`, by: null, sub: fx.label, color: '#fde047', at: now, life: 2.2 }; sound.play('help'); break;
        case 'nv_traitor': anim.title = { text: fx.correct ? 'LẬT MẶT KẺ PHẢN BỘI!' : 'ĐOÁN NHẦM RỒI!', by: null, sub: fx.correct ? `${fx.name} là chuột của Hắc Long` : `${fx.name} vô tội… kẻ phản bội vẫn ẩn mình`, color: fx.correct ? '#5eea8f' : '#ff6b5e', at: now, life: 2.6 }; sound.play(fx.correct ? 'cleared' : 'alarm'); break;
        case 'nv_traitor_vote': sound.play('alarm'); break;
        case 'nv_story': sound.play('ping'); break;
        case 'nv_clue': floaters.push({ text: `🔎 Manh mối mới về ${fx.name}`, x: W / 2, y: 540, color: '#fde68a', size: 32, life: 1.6, age: 0 }); break;
        case 'nv_cipher_ok': sound.play('radio'); floaters.push({ text: `📟 ${fx.plain}`, x: W / 2, y: 560, color: '#86efac', size: 40, life: 2, age: 0 }); break;
        case 'nv_relay_ok': sound.play('cleared'); floaters.push({ text: '💌 Đã gửi lời nhắn của Bé Hai', x: W / 2, y: 560, color: '#fbcfe8', size: 38, life: 1.8, age: 0 }); break;
        case 'nv_spotted': anim.shake = 1; sound.play('alarm'); anim.title = { text: 'CAMERA THẤY BẠN!', by: null, sub: '+15% nghi ngờ', color: '#ff6b5e', at: now, life: 1.4 }; break;
        case 'nv_move': anim.kpiAt = now; sound.play('step'); break;
        case 'nv_hide': sound.play('zap'); break;
        case 'nv_distract': floaters.push({ text: '❤️ Đánh lạc hướng camera!', x: W / 2, y: 600, color: '#f9a8d4', size: 40, life: 1.4, age: 0 }); break;
        default:
      }
    },
    resumeAudio() { sound.resume(); },
    resize() {},
    layout(m) { LAYOUT = m && typeof m === 'object' ? m : {}; },
    destroy() {
      stopped = true; cancelAnimationFrame(raf); sound.close();
      typing?.remove();
      if (input) removeEventListener('keydown', onKey);
    },
  };
}

/** Âm thanh tổng hợp WebAudio (tạo lười, tắt khi mute). */
function makeSound(muted) {
  let ac = null;
  const get = () => { if (muted || typeof AudioContext === 'undefined') return null; if (!ac) { try { ac = new AudioContext(); } catch { muted = true; return null; } } return ac; };
  function tone(f, dur, { type = 'sine', vol = 0.18, at = 0, slide = 0 } = {}) {
    const a = get(); if (!a || a.state !== 'running') return;
    const t0 = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const P = {
    ping: () => { tone(1320, 0.09, { type: 'triangle', vol: 0.16 }); tone(1760, 0.14, { type: 'triangle', vol: 0.16, at: 0.1 }); },
    harm: () => { tone(160, 0.3, { type: 'sawtooth', vol: 0.12, slide: 0.6 }); },
    help: () => [660, 880, 1100].forEach((f, i) => tone(f, 0.14, { type: 'triangle', at: i * 0.07 })),
    step: () => { tone(880, 0.08, { type: 'triangle' }); tone(1320, 0.12, { type: 'triangle', at: 0.07 }); },
    cleared: () => [784, 1047].forEach((f, i) => tone(f, 0.14, { type: 'triangle', at: i * 0.08 })),
    wrong: () => tone(180, 0.25, { type: 'square', vol: 0.08 }),
    zap: () => tone(1500, 0.05, { type: 'square', vol: 0.05 }),
    shutter: () => { tone(2400, 0.03, { type: 'square', vol: 0.08 }); tone(900, 0.05, { type: 'square', vol: 0.06, at: 0.04 }); },
    radio: () => [1200, 0, 1200, 0, 1600].forEach((f, i) => f && tone(f, 0.08, { type: 'sine', vol: 0.14, at: i * 0.09 })),
    alarm: () => [0, 0.3, 0.6].forEach((at) => { tone(880, 0.15, { type: 'square', vol: 0.09, at }); tone(660, 0.15, { type: 'square', vol: 0.09, at: at + 0.15 }); }),
    siren: () => [0, 0.5, 1, 1.5].forEach((at) => { tone(700, 0.5, { type: 'sawtooth', vol: 0.07, at, slide: 1.6 }); }),
    fail: () => [392, 370, 349, 294].forEach((f, i) => tone(f, i === 3 ? 0.8 : 0.32, { type: 'sawtooth', vol: 0.07, at: i * 0.34, slide: i === 3 ? 0.85 : 0 })),
    brief: () => { tone(330, 0.2, { type: 'triangle' }); tone(440, 0.3, { type: 'triangle', at: 0.18 }); },
  };
  return {
    play(n) { try { P[n]?.(); } catch { /* bỏ qua */ } },
    resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } },
    close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; },
  };
}

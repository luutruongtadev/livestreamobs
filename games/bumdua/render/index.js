// Renderer canvas của Bùm Dưa (khung dọc 1080×1920). Vườn dưa miền quê: trời xanh, đồi, chòi lá, hàng dừa, cây rơm,
// bàn gỗ trải khăn caro đỏ, cô Ba đội nón lá đứng sau bàn quấn dây quanh trái dưa.
// HUD kiểu hoạt hình: chữ tròn viền nâu dày, thẻ bo tròn trong mờ. Cảnh tĩnh vẽ một lần vào canvas đệm.
// Mọi chuyển động nội suy theo thời gian thực (dt): dây bật nảy đàn hồi, dưa thắt eo dần, nứt, rỉ nước, rung, nổ văng nước + hạt + vỏ.
// Không đụng DOM khi import.
import { drawPanel } from '#sdk';

const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const TITLE = "'Baloo 2', 'Be Vietnam Pro', system-ui, sans-serif";
const INK = '#4a2610';
const C = {
  cream: '#fff6e0', pink: '#ff5f8a', hot: '#ff3b6b', gold: '#ffd24a', dark: 'rgba(46,26,12,.74)',
  rind: '#1f7a35', rindDark: '#135226', stripe: '#9bdc62', flesh: '#ff5d74', juice: '#ff4d7a', seed: '#2b1a12',
  wood: '#c08a4a', woodDark: '#6b4220', skin: '#f8cfa6', shirt: '#8e63d6', shirtDark: '#5a3a9c',
};
const ACT = {
  nam: ['🤏', 'Nắm dây', '+3'], boc: ['✊', 'Bó dây', '+10'], cuon: ['🧶', 'Cuộn dây to', '+25'], thung: ['📦', 'Thùng dây', '+50'],
  sung: ['🔫', 'Súng bắn dây', '+150'], turbo: ['⚡', 'Cô Ba tăng tốc', '×4'], dao: ['🔪', 'Dao chặt dưa', 'BỔ'],
  thot: ['🪵', 'Thớt chắn dao', 'CHẶN'], keo: ['✂️', 'Kéo cắt', '−10'], vang: ['🌟', 'Dưa vàng', 'CỨNG'], follow: ['➕', 'Follow', '+dây'],
};
const BAND_COLS = ['#ff4d6d', '#ff8fab', '#ffd23f', '#ff6b6b', '#7bdff2', '#ff9f43', '#f472b6', '#b8f2a6', '#ff5d8f', '#c3a6ff'];
const SIZE_K = { thuong: 1, to: 1.1, khonglo: 1.2 };
const W = 1080, H = 1920, HORIZON = 900;
const TB = 1195, TF = 1275; // mép sau / mép trước của mặt bàn
const MX = 610, BASE = 1240, RX = 188, RY = 225; // tâm ngang, đáy và bán kính trái dưa
const AX = 290; // cô Ba

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function mount(el, { canvas, options = {} } = {}) {
  const ctx = canvas.getContext('2d');
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let S = null, recvAt = 0, raf = 0, stopped = false, last = performance.now();
  let LAYOUT = {};
  const panel = (id, def, fn) => drawPanel(ctx, LAYOUT, id, def, fn);
  const sound = makeSound(!!options.mute);
  const images = new Map();
  const parts = [], floaters = [], feed = [];
  const anim = { bands: 0, tension: 0, size: 1, shake: 0, flash: 0, title: null, popAt: -1e9, snaps: [], arm: 0, melonAt: 0, hot: {}, bump: 0, splats: [], my: BASE - RY, wrap: null };
  let back = null, front = null;
  if (typeof document !== 'undefined' && !document.getElementById('dd-font')) {
    const l = document.createElement('link'); l.id = 'dd-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap'; document.head.append(l);
  }

  // ---------------- tiện ích ----------------
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function fill(x, y, w, h, r, col, border = null, bw = 4) { rr(ctx, x, y, w, h, r); ctx.fillStyle = col; ctx.fill(); if (border) { ctx.lineWidth = bw; ctx.strokeStyle = border; ctx.stroke(); } }
  function text(s, x, y, size, color = INK, weight = 800, align = 'center', maxW = 0, font = FONT) {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    let t = String(s ?? '');
    if (maxW && ctx.measureText(t).width > maxW) { while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; }
    ctx.fillText(t, x, y);
  }
  /** Chữ hoạt hình: viền nâu dày + bóng đổ lệch xuống. */
  function out(s, x, y, size, color = C.cream, { align = 'center', maxW = 0, stroke = INK, sw = 0, shadow = true } = {}) {
    let sz = size; s = String(s ?? '');
    ctx.font = `800 ${sz}px ${TITLE}`;
    if (maxW) while (sz > 16 && ctx.measureText(s).width > maxW) { sz -= 2; ctx.font = `800 ${sz}px ${TITLE}`; }
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = sw || Math.max(5, sz * 0.2); ctx.strokeStyle = stroke;
    if (shadow) ctx.strokeText(s, x, y + sz * 0.09);
    ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3));
  const backE = (k) => { if (k <= 0) return 0; if (k >= 1) return 1; const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const elastic = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
  const hashCol = (id) => { let h = 0; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return BAND_COLS[h % BAND_COLS.length]; };
  const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
  function img(src) {
    let a = images.get(src);
    if (!a) { a = { img: new Image(), ok: false }; a.img.referrerPolicy = 'no-referrer'; a.img.onload = () => { a.ok = true; }; a.img.src = src; images.set(src, a); if (images.size > 80) images.delete(images.keys().next().value); }
    return a.ok ? a.img : null;
  }
  function avatar(u, x, y, r, ring = '#fff') {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    const im = u?.avatar ? img(u.avatar) : null;
    if (im) { ctx.save(); ctx.clip(); ctx.drawImage(im, x - r, y - r, r * 2, r * 2); ctx.restore(); }
    else if (u?.npc) { ctx.fillStyle = '#ffe2b8'; ctx.fill(); text('👒', x, y + 1, r * 1.2); }
    else { const n = u?.name || '?'; let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; ctx.fillStyle = `hsl(${h},60%,52%)`; ctx.fill(); text([...n][0]?.toUpperCase() || '?', x, y + 1, Math.round(r * 1.05), '#fff', 800, 'center', 0, TITLE); }
    if (ring) { ctx.lineWidth = Math.max(2.5, r * 0.14); ctx.strokeStyle = ring; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  /** Vòng dây thun nhỏ (biểu tượng). */
  function bandIcon(x, y, r, col = C.pink) { ctx.save(); ctx.lineWidth = r * 0.42; ctx.strokeStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, -0.35, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }

  // ---------------- cảnh tĩnh (vẽ một lần) ----------------
  function tuft(g, x, y, s, R) {
    const cols = ['#2c8a2e', '#3aa238', '#55bb45', '#7ad65c'];
    const n = 5 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const bx = x + (i - n / 2) * 9 * s, h = (38 + R() * 46) * s, lean = (R() - 0.5) * 34 * s, w = (5 + R() * 4) * s;
      g.fillStyle = cols[Math.floor(R() * cols.length)];
      g.beginPath(); g.moveTo(bx - w, y); g.quadraticCurveTo(bx - w * 0.4 + lean * 0.4, y - h * 0.6, bx + lean, y - h); g.quadraticCurveTo(bx + w * 0.6 + lean * 0.4, y - h * 0.5, bx + w, y); g.closePath(); g.fill();
    }
  }
  function flower(g, x, y, s, R) {
    const k = R();
    if (k < 0.5) { g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 7 * s, y + Math.sin(a) * 7 * s, 5.5 * s, 3.4 * s, a, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#ffc93c'; g.beginPath(); g.arc(x, y, 4.4 * s, 0, Math.PI * 2); g.fill(); }
    else { g.fillStyle = k < 0.75 ? '#b08cff' : '#ffe14d'; g.beginPath(); g.arc(x, y, 6 * s, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x - 1.5 * s, y - 1.5 * s, 2.4 * s, 0, Math.PI * 2); g.fill(); }
  }
  function grassField(g, R, y0, y1, n) {
    const list = [];
    for (let i = 0; i < n; i++) list.push({ x: R() * W, y: y0 + Math.pow(R(), 0.85) * (y1 - y0), f: R() });
    list.sort((a, b) => a.y - b.y);
    for (const t of list) { const s = 0.4 + ((t.y - HORIZON) / (H - HORIZON)) * 1.25; tuft(g, t.x, t.y, s, R); if (t.f < 0.2) flower(g, t.x + (R() - 0.5) * 30, t.y - (20 + R() * 30) * s, s, R); }
  }
  function cloud(g, x, y, s) {
    g.fillStyle = 'rgba(255,255,255,.95)';
    for (const [dx, dy, r] of [[0, 0, 46], [52, -18, 58], [112, 0, 48], [58, 16, 52], [-44, 12, 32], [156, 14, 30]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill(); }
  }
  function hill(g, col, base, amp, f, ph) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, base - amp * (Math.sin(x * f + ph) * 0.6 + Math.sin(x * f * 2.3 + ph * 2) * 0.4));
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  function palm(g, x, base, h) {
    g.strokeStyle = '#8a5a34'; g.lineWidth = h * 0.07; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + h * 0.14, base - h * 0.5, x + h * 0.05, base - h); g.stroke();
    const tx = x + h * 0.05, ty = base - h;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (i / 6) * Math.PI, len = h * 0.42;
      g.strokeStyle = i % 2 ? '#2f9a44' : '#3fb352'; g.lineWidth = h * 0.06;
      g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * len * 0.7, ty + Math.sin(a) * len * 0.9 - h * 0.08, tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.5 + h * 0.12); g.stroke();
    }
  }
  function hay(g, x, y, s) { // cây rơm
    g.fillStyle = 'rgba(30,70,20,.25)'; g.beginPath(); g.ellipse(x, y + 4 * s, 120 * s, 22 * s, 0, 0, Math.PI * 2); g.fill();
    const gr = g.createLinearGradient(x - 100 * s, 0, x + 100 * s, 0); gr.addColorStop(0, '#f7da7c'); gr.addColorStop(1, '#d59f36');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - 105 * s, y); g.bezierCurveTo(x - 110 * s, y - 120 * s, x - 50 * s, y - 190 * s, x, y - 196 * s); g.bezierCurveTo(x + 50 * s, y - 190 * s, x + 110 * s, y - 120 * s, x + 105 * s, y); g.closePath(); g.fill();
    g.strokeStyle = '#a8761f'; g.lineWidth = 4 * s; g.stroke();
    g.strokeStyle = 'rgba(150,100,20,.45)'; g.lineWidth = 3 * s;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(x + i * 26 * s, y - 6 * s); g.quadraticCurveTo(x + i * 20 * s, y - 100 * s, x + i * 6 * s, y - 186 * s); g.stroke(); }
    g.strokeStyle = '#7a4b2a'; g.lineWidth = 9 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y - 190 * s); g.lineTo(x, y - 236 * s); g.stroke();
  }
  function buildBack() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const R = rng(11);
    let gr = g.createLinearGradient(0, 0, 0, HORIZON); gr.addColorStop(0, '#3aa5f2'); gr.addColorStop(0.5, '#8fd3fb'); gr.addColorStop(1, '#e8f7ff');
    g.fillStyle = gr; g.fillRect(0, 0, W, HORIZON + 10);
    gr = g.createRadialGradient(880, 300, 20, 880, 300, 460); gr.addColorStop(0, 'rgba(255,252,220,.95)'); gr.addColorStop(0.25, 'rgba(255,248,200,.45)'); gr.addColorStop(1, 'rgba(255,248,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, HORIZON);
    cloud(g, 520, 190, 1.1); cloud(g, 820, 560, 0.8); cloud(g, 380, 660, 0.6); cloud(g, 930, 130, 0.55);
    hill(g, '#b5e3a6', 800, 46, 0.0042, 1.2); hill(g, '#8fd486', 842, 34, 0.006, 3.1);
    for (let i = 0; i < 16; i++) { const x = i * 74 + R() * 40, r = 26 + R() * 22; g.fillStyle = '#3f9c4c'; g.beginPath(); g.arc(x, 872, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#5cb85a'; g.beginPath(); g.arc(x - r * 0.25, 872 - r * 0.3, r * 0.6, 0, Math.PI * 2); g.fill(); }
    palm(g, 720, 905, 190); palm(g, 1010, 900, 230);
    // chòi lá
    g.fillStyle = '#ecd29b'; g.fillRect(800, 838, 150, 72); g.fillStyle = '#7a4b2a'; g.fillRect(858, 862, 36, 48);
    g.fillStyle = '#c9963f'; g.beginPath(); g.moveTo(772, 846); g.lineTo(875, 772); g.lineTo(978, 846); g.closePath(); g.fill();
    g.strokeStyle = '#9a6d22'; g.lineWidth = 3; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(875, 776); g.lineTo(782 + i * 23, 846); g.stroke(); }
    // mặt đất
    gr = g.createLinearGradient(0, HORIZON - 14, 0, H); gr.addColorStop(0, '#9bdf66'); gr.addColorStop(0.3, '#63bd46'); gr.addColorStop(1, '#3d9735');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, HORIZON); g.quadraticCurveTo(W / 2, HORIZON - 26, W, HORIZON); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(190,240,120,${0.10 + R() * 0.1})`; g.beginPath(); g.ellipse(R() * W, 960 + R() * 900, 120 + R() * 160, 26 + R() * 30, 0, 0, Math.PI * 2); g.fill(); }
    // hàng rào
    g.strokeStyle = '#b98a55'; g.lineWidth = 10; g.lineCap = 'round';
    for (const y of [928, 952]) { g.beginPath(); g.moveTo(-10, y); g.lineTo(W + 10, y - 4); g.stroke(); }
    for (let x = 30; x < W; x += 96) { g.fillStyle = '#c99a62'; rr(g, x, 906, 16, 70, 6); g.fill(); g.strokeStyle = '#7d5730'; g.lineWidth = 3; g.stroke(); }
    hay(g, 150, 1075, 0.95); hay(g, 965, 1050, 0.8); hay(g, 845, 1010, 0.5);
    // cây lớn bên trái
    g.fillStyle = '#7a4b2a'; g.beginPath(); g.moveTo(-40, 1180); g.bezierCurveTo(10, 900, -10, 640, 60, 380); g.lineTo(170, 400); g.bezierCurveTo(110, 660, 130, 900, 110, 1180); g.closePath(); g.fill();
    g.strokeStyle = '#5a3418'; g.lineWidth = 6; g.stroke();
    g.strokeStyle = '#7a4b2a'; g.lineWidth = 44; g.beginPath(); g.moveTo(110, 560); g.quadraticCurveTo(230, 470, 330, 330); g.stroke();
    const blobs = []; for (let i = 0; i < 30; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()); blobs.push([170 + Math.cos(a) * d * 380, 200 + Math.sin(a) * d * 250, 80 + R() * 60]); }
    for (const [x, y, r] of blobs) { g.fillStyle = '#2a8038'; g.beginPath(); g.arc(x, y + 14, r, 0, Math.PI * 2); g.fill(); }
    for (const [x, y, r] of blobs) { g.fillStyle = '#43a548'; g.beginPath(); g.arc(x - 8, y - 6, r * 0.86, 0, Math.PI * 2); g.fill(); }
    for (const [x, y, r] of blobs) { g.fillStyle = '#6fca58'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.34, r * 0.42, 0, Math.PI * 2); g.fill(); }
    grassField(g, R, 985, 1900, 330);
    return c;
  }
  function gingham(g, x0t, x1t, x0b, x1b, yt, yb, cols, rows) {
    g.fillStyle = 'rgba(226,44,52,.55)';
    for (let i = 0; i < cols; i += 2) { const a = i / cols, b = (i + 1) / cols; g.beginPath(); g.moveTo(x0t + (x1t - x0t) * a, yt); g.lineTo(x0t + (x1t - x0t) * b, yt); g.lineTo(x0b + (x1b - x0b) * b, yb); g.lineTo(x0b + (x1b - x0b) * a, yb); g.closePath(); g.fill(); }
    for (let j = 0; j < rows; j += 2) g.fillRect(Math.min(x0t, x0b), yt + ((yb - yt) * j) / rows, Math.max(x1t, x1b) - Math.min(x0t, x0b), (yb - yt) / rows);
  }
  function buildFront() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const R = rng(29);
    g.fillStyle = 'rgba(20,60,15,.3)'; g.beginPath(); g.ellipse(540, 1610, 470, 46, 0, 0, Math.PI * 2); g.fill();
    // chân bàn
    for (const [x, y0, y1, w, col] of [[232, 1300, 1560, 30, '#9a6a36'], [818, 1300, 1560, 30, '#9a6a36'], [176, 1320, 1620, 38, C.wood], [866, 1320, 1620, 38, C.wood]]) { g.fillStyle = col; rr(g, x, y0, w, y1 - y0, 6); g.fill(); g.strokeStyle = C.woodDark; g.lineWidth = 4; g.stroke(); }
    g.fillStyle = C.wood; rr(g, 196, 1470, 690, 26, 8); g.fill(); g.strokeStyle = C.woodDark; g.lineWidth = 4; g.stroke();
    // mặt bàn trải khăn caro
    g.save(); g.beginPath(); g.moveTo(180, TB); g.lineTo(900, TB); g.lineTo(950, TF); g.lineTo(130, TF); g.closePath(); g.fillStyle = '#fff8ef'; g.fill(); g.clip();
    gingham(g, 180, 900, 130, 950, TB, TF, 14, 4); g.restore();
    // diềm khăn rủ xuống (lượn sóng)
    const dy = TF + 78, n = 14, sw = 820 / n;
    g.save(); g.beginPath(); g.moveTo(130, TF); g.lineTo(950, TF); g.lineTo(950, dy);
    for (let i = n - 1; i >= 0; i--) g.arc(130 + sw * (i + 0.5), dy, sw / 2, 0, Math.PI);
    g.closePath(); g.fillStyle = '#fff8ef'; g.fill(); g.clip();
    gingham(g, 130, 950, 130, 950, TF, dy + sw / 2, 14, 4);
    const sh = g.createLinearGradient(0, TF, 0, dy + sw / 2); sh.addColorStop(0, 'rgba(90,20,20,.3)'); sh.addColorStop(0.35, 'rgba(90,20,20,.06)'); sh.addColorStop(1, 'rgba(90,20,20,.16)');
    g.fillStyle = sh; g.fillRect(130, TF, 820, 140); g.restore();
    g.strokeStyle = 'rgba(120,30,30,.45)'; g.lineWidth = 4; g.beginPath(); g.moveTo(130, TF); g.lineTo(950, TF); g.stroke();
    // ly trà đá
    g.fillStyle = 'rgba(60,20,10,.2)'; g.beginPath(); g.ellipse(214, 1262, 38, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(232,160,60,.92)'; g.beginPath(); g.moveTo(184, 1190); g.lineTo(244, 1190); g.lineTo(236, 1260); g.lineTo(192, 1260); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)'; rr(g, 196, 1198, 16, 16, 4); g.fill(); rr(g, 216, 1210, 16, 16, 4); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.beginPath(); g.moveTo(180, 1172); g.lineTo(248, 1172); g.lineTo(236, 1260); g.lineTo(192, 1260); g.closePath(); g.stroke();
    g.strokeStyle = '#ff5f8a'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(222, 1250); g.lineTo(240, 1140); g.stroke();
    // xô dây thun
    g.fillStyle = 'rgba(60,20,10,.2)'; g.beginPath(); g.ellipse(446, 1262, 58, 11, 0, 0, Math.PI * 2); g.fill();
    const bg = g.createLinearGradient(392, 0, 500, 0); bg.addColorStop(0, '#8fb0c8'); bg.addColorStop(0.45, '#c9dbe8'); bg.addColorStop(1, '#5f7f98');
    g.fillStyle = bg; g.beginPath(); g.moveTo(390, 1186); g.lineTo(502, 1186); g.lineTo(488, 1262); g.lineTo(404, 1262); g.closePath(); g.fill(); g.strokeStyle = '#3f5a70'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#4a6a82'; g.beginPath(); g.ellipse(446, 1186, 56, 13, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 18; i++) { g.strokeStyle = BAND_COLS[i % BAND_COLS.length]; g.lineWidth = 5; g.beginPath(); g.ellipse(404 + R() * 84, 1166 + R() * 22, 17, 9, R() * 3, 0, Math.PI * 2); g.stroke(); }
    // cỏ phía trước che chân bàn
    const list = []; for (let i = 0; i < 70; i++) list.push([R() * W, 1575 + R() * 330]);
    list.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of list) { const s = 0.9 + ((y - 1500) / 420) * 0.9; tuft(g, x, y, s, R); if (R() < 0.22) flower(g, x + (R() - 0.5) * 40, y - 40 * s, s, R); }
    return c;
  }

  // ---------------- cô Ba ----------------
  function splatFace(x, y, r) { ctx.fillStyle = 'rgba(255,70,120,.9)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.arc(x + r * 0.9, y + r * 0.5, r * 0.55, 0, Math.PI * 2); ctx.fill(); rr(ctx, x - r * 0.25, y, r * 0.5, r * 2.1, r * 0.25); ctx.fill(); }
  function drawAuntie(now) {
    const t = anim.tension, turbo = S.turboMs > 0, pop = S.phase === 'pop';
    const bob = reduced ? 0 : Math.sin(now / (turbo ? 150 : 620)) * (turbo ? 5 : 3);
    // biểu cảm theo độ biến dạng của dưa: 0 vui · 1 tò mò · 2 lo · 3 sợ · 4 hoảng (nhắm tịt mắt, né người) · 5 dưa vừa nổ
    const mood = pop ? 5 : t > 0.9 ? 4 : t > 0.75 ? 3 : t > 0.55 ? 2 : t > 0.35 ? 1 : 0;
    const fear = pop ? 0 : Math.max(0, Math.min(1, (t - 0.7) / 0.3)), jit = reduced ? 0 : fear * 7;
    const hx = AX - fear * 16 + (Math.random() - 0.5) * jit, hy = 958 + bob + (Math.random() - 0.5) * jit * 0.6; // tâm đầu: sợ thì né ra xa và run
    // thân áo bà ba
    ctx.lineJoin = 'round';
    ctx.fillStyle = C.shirt; ctx.beginPath(); ctx.moveTo(AX - 112, 1290); ctx.quadraticCurveTo(AX - 122, 1090, AX - 62, 1052 + bob); ctx.lineTo(AX + 62, 1052 + bob); ctx.quadraticCurveTo(AX + 122, 1090, AX + 112, 1290); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.shirtDark; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(AX, 1070 + bob); ctx.lineTo(AX, 1290); ctx.stroke();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(AX, 1100 + bob + i * 36, 5, 0, Math.PI * 2); ctx.fill(); }
    // khăn rằn
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 30; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(AX - 62, 1050 + bob); ctx.quadraticCurveTo(AX, 1092 + bob, AX + 62, 1050 + bob); ctx.stroke();
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 30; ctx.setLineDash([9, 13]); ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.moveTo(AX - 62, 1050 + bob); ctx.quadraticCurveTo(AX, 1092 + bob, AX + 62, 1050 + bob); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    // tóc sau + đầu
    ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.arc(hx, hy - 6, 100, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.skin; ctx.beginPath(); ctx.ellipse(hx, hy + 6, 92, 88, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#a56a44'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.moveTo(hx - 94, hy - 4); ctx.quadraticCurveTo(hx - 60, hy - 70, hx, hy - 62); ctx.quadraticCurveTo(hx + 60, hy - 70, hx + 94, hy - 4); ctx.quadraticCurveTo(hx + 70, hy - 44, hx + 10, hy - 40); ctx.quadraticCurveTo(hx - 60, hy - 40, hx - 94, hy - 4); ctx.fill();
    // má hồng
    ctx.fillStyle = 'rgba(255,110,130,.4)'; ctx.beginPath(); ctx.ellipse(hx - 56, hy + 36, 18, 12, 0, 0, Math.PI * 2); ctx.ellipse(hx + 60, hy + 36, 18, 12, 0, 0, Math.PI * 2); ctx.fill();
    // mắt + chân mày
    const er = [19, 20, 22, 25, 0, 24][mood], pr = [9, 9, 8, 5.5, 0, 6][mood];
    const look = pop ? 0 : 6 + Math.sin(now / 1300) * 2, lookY = mood >= 1 && !pop ? 4 : 0;
    const blink = mood < 3 && !reduced && now % 3400 < 130;
    for (const s of [-1, 1]) {
      const ex = hx + s * 36 + 4, ey = hy + 6;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (mood === 4) { // nhắm tịt mắt > <
        ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(ex + s * 16, ey - 13); ctx.lineTo(ex - s * 12, ey); ctx.lineTo(ex + s * 16, ey + 13); ctx.stroke();
        // nước mắt
        const k = (now / 500 + (s > 0 ? 0.5 : 0)) % 1; ctx.globalAlpha = 1 - k; ctx.fillStyle = '#7fd3ff'; ctx.beginPath(); ctx.ellipse(ex + s * 24, ey + 10 + k * 46, 6, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      } else if (blink) { ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ex - 15, ey + 2); ctx.quadraticCurveTo(ex, ey + 10, ex + 15, ey + 2); ctx.stroke(); }
      else {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, er * 0.9, er, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#3a2414'; ctx.lineWidth = 3; ctx.stroke();
        const px = ex + look + (mood === 3 && !reduced ? Math.sin(now / 45) * 1.5 : 0); // sợ: con ngươi co lại, rung nhẹ
        ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.arc(px, ey + 2 + lookY, pr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + 3, ey - 2 + lookY, 3, 0, Math.PI * 2); ctx.fill();
      }
      // chân mày: lo / sợ thì đầu mày nhướng lên; tò mò thì nhướng một bên; nổ thì dựng cả hai
      const raise = [0, s > 0 ? -9 : 0, 8, 13, 15, 0][mood], by0 = hy - 26 - Math.max(0, er - 19) - (pop ? 16 : 0) + (mood === 1 && s > 0 ? -8 : 0);
      ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 6; ctx.beginPath();
      ctx.moveTo(ex - s * 16, by0 - (mood === 1 ? 0 : raise)); ctx.lineTo(ex + s * 16, by0 + (mood === 1 ? 0 : raise * 0.5)); ctx.stroke();
    }
    // sợ: vệt xanh tái trên trán
    if (mood >= 3 && !pop) { ctx.strokeStyle = 'rgba(80,110,200,.5)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hx + 44 + i * 11, hy - 44); ctx.lineTo(hx + 44 + i * 11, hy - 26 - (i % 2) * 6); ctx.stroke(); } }
    // miệng
    ctx.strokeStyle = '#7a2a1a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    if (mood === 5) { ctx.fillStyle = '#5a1420'; ctx.beginPath(); ctx.ellipse(hx + 6, hy + 54, 17, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff7a8a'; ctx.beginPath(); ctx.ellipse(hx + 6, hy + 64, 10, 8, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (mood === 4) { // há miệng la, mép run
      const w = 26 + (reduced ? 0 : Math.sin(now / 40) * 2);
      ctx.fillStyle = '#5a1420'; ctx.beginPath(); ctx.moveTo(hx + 6 - w, hy + 46);
      for (let i = 1; i <= 6; i++) ctx.lineTo(hx + 6 - w + (i / 6) * 2 * w, hy + 46 + (i % 2 ? -4 : 3));
      ctx.quadraticCurveTo(hx + 6 + w * 0.9, hy + 82, hx + 6, hy + 82); ctx.quadraticCurveTo(hx + 6 - w * 0.9, hy + 82, hx + 6 - w, hy + 46); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff7a8a'; ctx.beginPath(); ctx.ellipse(hx + 6, hy + 73, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    else if (mood === 3) { ctx.fillStyle = '#fff'; rr(ctx, hx - 20, hy + 44, 52, 20, 8); ctx.fill(); ctx.stroke(); ctx.lineWidth = 2; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hx - 20 + i * 13, hy + 44); ctx.lineTo(hx - 20 + i * 13, hy + 64); ctx.stroke(); } }
    else if (mood === 2) { ctx.beginPath(); ctx.moveTo(hx - 16, hy + 56); ctx.quadraticCurveTo(hx - 4, hy + 46, hx + 6, hy + 56); ctx.quadraticCurveTo(hx + 16, hy + 64, hx + 28, hy + 54); ctx.stroke(); }
    else if (mood === 1) { ctx.fillStyle = '#5a1420'; ctx.beginPath(); ctx.ellipse(hx + 8, hy + 54, 8, 10, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(hx + 6, hy + 40, 20, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke(); }
    // mồ hôi: càng căng càng nhiều giọt
    if (mood >= 2 && !pop) for (let i = 0; i < mood; i++) { const k = ((now / (760 - mood * 90) + i * 0.37) % 1); ctx.globalAlpha = 1 - k; ctx.fillStyle = '#7fd3ff'; ctx.beginPath(); ctx.ellipse(hx + (i % 2 ? -100 : 98) + (i > 1 ? (i % 2 ? 18 : -18) : 0), hy - 24 + (i > 1 ? 30 : 0) + k * 54, 7, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    // quai nón + nón lá
    ctx.strokeStyle = '#ff6f91'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(hx - 88, hy - 30); ctx.quadraticCurveTo(hx - 70, hy + 96, hx, hy + 98); ctx.quadraticCurveTo(hx + 70, hy + 96, hx + 88, hy - 30); ctx.stroke();
    ctx.save(); ctx.translate(hx, hy - 44); ctx.rotate(pop ? -0.16 : 0);
    const hg = ctx.createLinearGradient(-170, 0, 170, 0); hg.addColorStop(0, '#f7e7b4'); hg.addColorStop(0.55, '#ecd08a'); hg.addColorStop(1, '#cfa85a');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(-172, 0); ctx.lineTo(0, -128); ctx.lineTo(172, 0); ctx.quadraticCurveTo(0, 52, -172, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#9a7a3a'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = 'rgba(140,100,40,.4)'; ctx.lineWidth = 3;
    for (let i = 1; i < 5; i++) { const k = i / 5; ctx.beginPath(); ctx.moveTo(-172 * k, -128 * (1 - k)); ctx.quadraticCurveTo(0, -128 * (1 - k) + 52 * k, 172 * k, -128 * (1 - k)); ctx.stroke(); }
    if (pop) { splatFace(-70, -40, 16); splatFace(60, -64, 11); }
    ctx.restore();
    if (pop) { splatFace(hx - 30, hy + 30, 13); splatFace(hx + 62, hy - 4, 10); }
    if (turbo) { fill(AX - 96, hy - 250, 192, 54, 27, 'rgba(255,196,40,.95)', INK, 5); out(`⚡ ×4 · ${Math.ceil(S.turboMs / 1000)}s`, AX, hy - 221, 30, '#fff', { shadow: false }); }
  }
  /**
   * Động tác mắc một sợi dây (p: 0 → 1,25):
   *  0–0,3  tay phải lấy dây trong xô, kéo căng thành vòng rồi đưa lên trên đỉnh dưa;
   *  0,3–0,8 vòng dây chụp qua đỉnh, trượt xuống theo dáng dưa (nhanh dần);
   *  0,8–1,25 dây bật siết vào eo (nảy đàn hồi), tay thu về xô.
   */
  function wrapState(now) {
    const w = anim.wrap; if (!w || S.phase !== 'wrap') return null;
    const p = (now - w.at) / (w.D * 1000); if (p < 0 || p >= 1.25) return null;
    const k = anim.size, my = anim.my, top = my - RY * k, rest = [AX + 142, 1168];
    const mix = (a, b, t) => a + (b - a) * t, d0 = -RY * 0.86, loose = halfW(d0) * k + 26;
    if (p < 0.3) {
      const e = ease(p / 0.3), rx = mix(20, loose, e), hx = mix(rest[0], MX - loose, e), hy = mix(rest[1], top + 8, e) - Math.sin(e * Math.PI) * 50;
      return { p, idx: w.idx, hand: [hx, hy], ring: { cx: hx + rx, cy: hy + 4, rx, ry: mix(12, 26 * k, e), full: true } };
    }
    if (p < 0.8) {
      const e = Math.pow((p - 0.3) / 0.5, 2), dy = mix(d0, 0, e), hw = halfW(dy) * k + mix(26, 8, e), y = my + dy * k;
      return { p, idx: w.idx, hand: [MX - hw - 14, y + 4], ring: { cx: MX, cy: y, rx: hw, ry: 26 * k, full: false } };
    }
    const e = ease((p - 0.8) / 0.45);
    return { p, idx: w.idx, hand: [mix(MX - halfW(0) * k - 22, rest[0], e), mix(my + 4, rest[1], e)], ring: null };
  }
  function drawRing(r, idx) {
    ctx.lineCap = 'round'; ctx.beginPath();
    if (r.full) ctx.ellipse(r.cx, r.cy, r.rx, r.ry, 0, 0, Math.PI * 2);
    else { ctx.moveTo(r.cx - r.rx, r.cy); ctx.quadraticCurveTo(r.cx, r.cy + r.ry * 1.5, r.cx + r.rx, r.cy); }
    ctx.strokeStyle = 'rgba(70,10,24,.5)'; ctx.lineWidth = 11; ctx.stroke();
    ctx.strokeStyle = BAND_COLS[(idx * 7) % BAND_COLS.length]; ctx.lineWidth = 7; ctx.stroke();
  }
  /** Tay vẽ sau bàn và dưa: tay trái giữ trái dưa, tay phải mắc dây. */
  function drawArms(now) {
    const pop = S.phase === 'pop', k = anim.size, ws = wrapState(now);
    const hold = [MX - halfW(RY * 0.5) * k + 4, anim.my + RY * 0.5 * k];
    const L = pop ? [AX - 150, 930] : hold, Rr = pop ? [AX + 150, 930] : ws ? ws.hand : [AX + 142, 1168];
    for (const [sx, hand] of [[AX - 88, L], [AX + 88, Rr]]) {
      const cx = (sx + hand[0]) / 2 + (pop ? (sx < AX ? -50 : 50) : 16), cy = pop ? 1090 : (1100 + hand[1]) / 2 + 70;
      ctx.strokeStyle = C.shirtDark; ctx.lineWidth = 46; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, 1100); ctx.quadraticCurveTo(cx, cy, hand[0], hand[1]); ctx.stroke();
      ctx.strokeStyle = C.shirt; ctx.lineWidth = 36; ctx.stroke();
      ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(hand[0], hand[1], 22, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#a56a44'; ctx.lineWidth = 4; ctx.stroke();
    }
    if (!pop && ws?.ring?.full) drawRing(ws.ring, ws.idx); // vòng dây đang kéo căng trên tay
  }

  // ---------------- trái dưa ----------------
  /** Nửa bề ngang của dưa tại độ cao dy (so với tâm, chưa nhân tỉ lệ): dáng thùng, thắt eo dần theo độ căng. */
  function halfW(dy) {
    const s = Math.max(-1, Math.min(1, dy / RY)), t = anim.tension;
    const waist = Math.exp(-s * s * 10);
    return RX * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(s), 2.25))) * (1 - Math.min(0.46, t * 0.46) * waist) * (1 + 0.1 * t * (1 - waist));
  }
  function melonPath(k, my) {
    ctx.beginPath();
    for (let i = 0; i <= 88; i++) {
      const a = (i / 88) * Math.PI * 2, dy = Math.sin(a) * RY;
      const x = MX + Math.sign(Math.cos(a)) * halfW(dy) * k, y = my + dy * k;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function drawMelon(now, dt) {
    const pop = S.phase === 'pop';
    const k = anim.size * (reduced ? 1 : backE(Math.min(1, (now - anim.melonAt) / 600)));
    const my = anim.my = BASE - RY * k;
    if (pop) { drawWreck(now); return; }
    const t = anim.tension, golden = !!S.golden;
    const tr = reduced ? 0 : Math.max(0, t - 0.78) * 40;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * tr, (Math.random() - 0.5) * tr * 0.5);
    ctx.fillStyle = 'rgba(70,20,10,.28)'; ctx.beginPath(); ctx.ellipse(MX + 14, BASE - 2, RX * k * 0.9, 24, 0, 0, Math.PI * 2); ctx.fill();
    melonPath(k, my);
    ctx.fillStyle = golden ? '#f4c636' : '#62b84a'; ctx.fill();
    ctx.save(); ctx.clip();
    // sọc dưa: dải xanh đậm lượn sóng không đều, bám theo dáng cong
    for (let i = -4; i <= 4; i++) {
      const u = (i / 4.5) * (Math.PI / 2), cx = Math.sin(u), wr = (0.05 + 0.022 * ((i * 7 + 28) % 3)) * Math.cos(u) + 0.012;
      const wob = (j, ph) => (Math.sin(j * 0.9 + i * 1.7 + ph) * 0.6 + Math.sin(j * 2.3 + i * 0.8 + ph * 2) * 0.4) * 0.026;
      for (const [f, col] of [[1, golden ? '#c98a12' : '#17602a'], [0.45, golden ? '#a86c08' : '#0f4a1f']]) {
        ctx.fillStyle = col; ctx.beginPath();
        for (let j = 0; j <= 32; j++) { const dy = -RY + (j / 32) * 2 * RY, hw = halfW(dy) * k; const x = MX + (cx - wr * f + wob(j, 0)) * hw; j ? ctx.lineTo(x, my + dy * k) : ctx.moveTo(x, my + dy * k); }
        for (let j = 32; j >= 0; j--) { const dy = -RY + (j / 32) * 2 * RY, hw = halfW(dy) * k; ctx.lineTo(MX + (cx + wr * f + wob(j, 2)) * hw, my + dy * k); }
        ctx.closePath(); ctx.fill();
      }
    }
    // vỏ căng ra: ruột hồng ửng lên hai bên eo
    if (t > 0.35) {
      const a = Math.min(0.75, (t - 0.35) * 1.2), fg = ctx.createLinearGradient(0, my - RY * k * 0.8, 0, my + RY * k * 0.8);
      fg.addColorStop(0, 'rgba(255,120,150,0)'); fg.addColorStop(0.36, `rgba(255,120,150,${a})`); fg.addColorStop(0.5, `rgba(255,90,130,${a})`); fg.addColorStop(0.64, `rgba(255,120,150,${a})`); fg.addColorStop(1, 'rgba(255,120,150,0)');
      ctx.fillStyle = fg; ctx.fillRect(MX - RX * k * 1.2, my - RY * k, RX * k * 2.4, RY * k * 2);
    }
    // khối sáng tối
    const sg = ctx.createRadialGradient(MX - 90 * k, my - 110 * k, 20, MX, my, RY * k * 1.25);
    sg.addColorStop(0, 'rgba(255,255,255,.28)'); sg.addColorStop(0.45, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(0,40,10,.42)');
    ctx.fillStyle = sg; ctx.fillRect(MX - RX * k * 1.2, my - RY * k, RX * k * 2.4, RY * k * 2);
    const n = Math.round(anim.bands), vis = Math.min(n, 60), thick = Math.min(130, 18 + vis * 2.2) * k;
    // vết nứt toả ra từ eo
    if (t > 0.5) {
      const nc = Math.floor((t - 0.5) * 24), hw0 = halfW(0) * k;
      for (const [lw, col] of [[10, '#fff0f3'], [4.5, '#d81f4f']]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round';
        for (let c = 0; c < nc; c++) {
          const dir = c % 2 ? 1 : -1; let x = MX + (((c * 53) % 100) / 100 - 0.5) * 1.5 * hw0, y = my + dir * thick * 0.45;
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let s = 0; s < 5; s++) { x += (((c * 13 + s * 7) % 11) - 5) * 4; y += dir * (15 + s * 5) * k; ctx.lineTo(x, y); }
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    melonPath(k, my); ctx.lineWidth = 7; ctx.strokeStyle = golden ? '#8a5a08' : C.rindDark; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.beginPath(); ctx.ellipse(MX - 88 * k, my - 152 * k, 40 * k, 15 * k, -0.75, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(MX - 128 * k, my - 104 * k, 9 * k, 15 * k, -0.2, 0, Math.PI * 2); ctx.fill();
    // cuống
    const ty = my - RY * k + 4;
    for (const [lw, col] of [[16, '#3d5a1c'], [9, '#7a9a36']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(MX, ty); ctx.bezierCurveTo(MX + 4, ty - 34, MX + 40, ty - 26, MX + 34, ty - 50); ctx.stroke(); }
    if (golden) avatar(S.golden, MX, my - RY * k * 0.55, 38, C.gold);
    drawBands(now, k, my, n, vis, thick);
    if (t > 0.72 && !reduced && Math.random() < dt * 6 * t) parts.push({ x: MX + (Math.random() - 0.5) * RX * k * 1.2, y: my + 20, vx: (Math.random() - 0.5) * 30, vy: 40, g: 900, r: 6 + Math.random() * 5, col: C.juice, life: 1.6, age: 0, drop: true });
    ctx.restore();
  }
  function drawBands(now, k, my, n, vis, thick) {
    const lw = Math.max(3.5, 8 * k - vis * 0.05), ws = wrapState(now);
    for (let i = 0; i < vis; i++) {
      const idx = n - vis + i; // sợi cũ ở ngoài cùng (trên/dưới), sợi mới ở giữa eo
      if (ws && ws.p < 0.8 && idx === ws.idx) continue; // sợi đang được mắc: vẽ riêng (vòng trượt xuống)
      const order = i % 2 ? i / 2 : -i / 2;
      const dy = vis > 1 ? (order / (vis / 2)) * (thick / 2) : 0;
      const hw = halfW(dy / k) * k + 3;
      const snap = anim.snaps.find((s) => s.idx === idx);
      let lift = 0, sc = 1;
      if (snap) { const e = Math.max(0, (now - snap.at) / 520); lift = (1 - elastic(Math.min(1, e))) * -46; sc = 1 + (1 - elastic(Math.min(1, e))) * 0.1; }
      const y = my + dy + lift;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(MX - hw * sc, y); ctx.quadraticCurveTo(MX, y + 24 * k, MX + hw * sc, y);
      ctx.strokeStyle = 'rgba(70,10,24,.45)'; ctx.lineWidth = lw + 3.5; ctx.stroke();
      ctx.strokeStyle = BAND_COLS[(idx * 7) % BAND_COLS.length]; ctx.lineWidth = lw; ctx.stroke();
    }
    if (ws?.ring && !ws.ring.full) drawRing(ws.ring, ws.idx);
    // mặt người có sợi mới nhất, gắn ở eo dưa
    if (S.last && n > 0) { const b = 1 + anim.bump * 0.25; avatar(S.last, MX + halfW(0) * k + 30, my + 6, 30 * b, hashCol(S.last.id)); }
  }
  /** Xác dưa sau khi nổ: nửa vỏ dưới còn trên bàn, ruột đỏ, nước loang trên khăn. */
  function drawWreck() {
    const k = anim.size;
    ctx.fillStyle = 'rgba(255,70,120,.6)';
    for (const [dx, dy, rx, ry] of [[0, 0, 300, 34], [-230, 14, 90, 18], [250, 10, 110, 20], [60, 30, 150, 16]]) { ctx.beginPath(); ctx.ellipse(MX + dx * k, BASE + dy, rx * k, ry, 0, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < 6; i++) { rr(ctx, MX - 280 + i * 104, TF - 4, 22, 46 + ((i * 37) % 50), 11); ctx.fill(); }
    ctx.save(); ctx.translate(MX, BASE - 70 * k);
    ctx.fillStyle = C.rind; ctx.beginPath(); ctx.ellipse(0, 0, 190 * k, 92 * k, 0, 0, Math.PI); ctx.lineTo(-190 * k, 0); ctx.fill(); ctx.strokeStyle = C.rindDark; ctx.lineWidth = 7; ctx.stroke();
    ctx.fillStyle = '#eaffd0'; ctx.beginPath(); ctx.ellipse(0, 0, 190 * k, 40 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.flesh; ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2, r = i % 2 ? 1 : 0.8; const x = Math.cos(a) * 166 * k * r, y = Math.sin(a) * 30 * k * r - (Math.sin(a) < 0 ? 26 * k * (i % 2) : 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.seed; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse((i - 4) * 32 * k, ((i * 7) % 5 - 2) * 5 * k, 5, 8, i, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // ---------------- dao chặt + thớt ----------------
  function drawKnife(now) {
    const kn = S.knife; if (!kn) return;
    const left = Math.max(0, kn.leftMs - (now - recvAt)), sec = Math.ceil(left / 1000);
    const p = 1 - left / kn.totalMs, k = anim.size;
    const sw = reduced ? 0 : Math.sin(now / (sec <= 3 ? 60 : 260)) * (sec <= 3 ? 0.05 : 0.08);
    ctx.save(); ctx.translate(MX + 60, anim.my - RY * k - 78 + p * 40 + (reduced ? 0 : Math.sin(now / 400) * 8)); ctx.rotate(0.22 + sw);
    // cán + lưỡi dao phay
    fill(-250, -30, 150, 44, 16, '#8a5a34', '#4a2610', 5);
    const bg = ctx.createLinearGradient(0, -90, 0, 90); bg.addColorStop(0, '#f6f8fa'); bg.addColorStop(1, '#9fb0bf');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(-110, -74); ctx.lineTo(150, -74); ctx.quadraticCurveTo(176, -70, 176, -44); ctx.lineTo(176, 76); ctx.quadraticCurveTo(30, 96, -110, 60); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3d4b58'; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(-104, 46); ctx.quadraticCurveTo(30, 84, 170, 62); ctx.lineTo(170, 72); ctx.quadraticCurveTo(30, 92, -104, 58); ctx.closePath(); ctx.fill();
    ctx.rotate(-0.22 - sw); avatar(kn.by, 40, -6, 46, '#fff');
    ctx.restore();
    // băng thông báo (thay dòng mời bình luận)
    const blk = (S.powerups || []).find((q) => q.action === 'thot');
    const bx = 370, by = 566, bw = 670, bh = 96;
    fill(bx, by, bw, bh, 48, 'rgba(150,18,36,.94)', C.gold, 6);
    avatar(kn.by, bx + 54, by + 48, 36, '#fff');
    ctx.fillStyle = sec <= 3 ? '#ff4d4d' : C.gold; ctx.beginPath(); ctx.arc(bx + 84, by + 72, 24, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    out(sec, bx + 84, by + 73, 28, '#fff', { shadow: false, sw: 5 });
    out(`DAO CHẶT · ${kn.by?.name || ''}`, bx + 124, by + 32, 32, '#fff', { align: 'left', maxW: bw - 150, shadow: false });
    out(blk ? `TẶNG ${String(blk.text || 'thớt').toUpperCase()} ĐỂ CHẶN` : 'TẶNG THỚT ĐỂ CHẶN', bx + 124, by + 68, 26, C.gold, { align: 'left', maxW: bw - 150, shadow: false });
  }
  function drawShields() {
    for (let i = 0; i < (S.shields || 0); i++) { const y = BASE - 28 - i * 24; fill(858, y, 78, 22, 8, '#dba864', '#7d5730', 4); ctx.fillStyle = '#7d5730'; ctx.beginPath(); ctx.arc(924, y + 11, 4, 0, Math.PI * 2); ctx.fill(); }
  }

  // ---------------- HUD ----------------
  function drawHud(now) {
    const pop = S.phase === 'pop', t = anim.tension;
    out('SỐ DÂY', 540, 298, 46, C.cream);
    const col = pop || t > 0.8 ? C.pink : t > 0.6 ? '#ffb199' : C.cream;
    const b = 1 + anim.bump * 0.1 + (t > 0.8 && !reduced ? Math.sin(now / 90) * 0.015 : 0);
    ctx.save(); ctx.translate(540, 412); ctx.scale(b, b); out(fmtN(anim.bands), 0, 0, 196, col, { maxW: 350, sw: 26 }); ctx.restore();
    const info = `TRÁI #${S.melonNo}${S.size !== 'thuong' ? ` · ${String(S.sizeName).toUpperCase()}` : ''} · KỶ LỤC ${fmtN(S.record || 0)}`;
    ctx.font = `800 28px ${TITLE}`; const iw = Math.min(520, ctx.measureText(info).width + 56);
    fill(540 - iw / 2, 504, iw, 50, 25, C.dark);
    text(info, 540, 530, 28, '#fff', 800, 'center', iw - 36, TITLE);
    if (pop || S.knife) return;
    out('BÌNH LUẬN ĐỂ THÊM DÂY', 550, 588, 32, C.cream, { maxW: 380 });
    if (S.queue > 0) {
      const nx = (S.next || []).slice(0, 4), label = `${fmtN(S.queue)} ĐANG CHỜ`;
      ctx.font = `800 28px ${TITLE}`; const tw = ctx.measureText(label).width, total = tw + (nx.length ? 14 + nx.length * 36 + 8 : 0);
      out(label, 540 - total / 2, 640, 28, C.cream, { align: 'left' });
      nx.forEach((u, i) => avatar(u, 540 - total / 2 + tw + 34 + i * 36, 640, 20, '#fff'));
    }
  }
  function feedPush(user, icon, txt, sub) {
    const now = performance.now(), l = feed[feed.length - 1];
    if (l && !sub && !l.sub && l.user.id === user.id && now - l.at < 5000) { l.n++; l.at = now; return; }
    feed.push({ user, icon, txt, sub, n: 1, at: now, born: now });
    if (feed.length > 4) feed.shift();
  }
  function drawBoard(now) {
    panel('board', { x: 30, y: 280 }, () => {
      const x = 30; let y = 280;
      // thẻ "nhiều dây nhất"
      const m = S.most?.[0];
      fill(x, y, 320, 100, 26, 'rgba(46,26,12,.82)', C.gold, 4);
      text('👑', x + 28, y + 26, 22); text('NHIỀU DÂY NHẤT', x + 50, y + 27, 21, C.gold, 800, 'left', 0, TITLE);
      if (m) { avatar(m, x + 40, y + 66, 24, C.gold); text(m.name, x + 76, y + 67, 27, '#fff', 800, 'left', 140, TITLE); text(`×${fmtN(m.bands)}`, x + 302, y + 67, 30, C.gold, 800, 'right', 0, TITLE); }
      else text('Chưa có ai', x + 22, y + 67, 24, 'rgba(255,255,255,.7)', 700, 'left');
      y += 110;
      // bảng bùm: ai làm nổ nhiều trái nhất
      const rows = (S.top || []).slice(0, 3);
      if (rows.length) {
        fill(x, y, 320, 38 + rows.length * 46, 22, C.dark);
        text('💥', x + 26, y + 22, 18); text('BẢNG BÙM', x + 46, y + 23, 19, '#ff9fb8', 800, 'left', 0, TITLE);
        rows.forEach((r, i) => { const yy = y + 58 + i * 46; avatar(r, x + 34, yy, 18, i ? '#fff' : C.pink); text(r.name, x + 62, yy + 1, 23, '#fff', 800, 'left', 160, TITLE); text(`${r.pops} 🍉`, x + 304, yy + 1, 22, '#fff', 800, 'right', 0, TITLE); });
        y += 48 + rows.length * 46;
      }
      // dòng sự kiện gần đây
      for (let i = feed.length - 1; i >= 0; i--) if (now - feed[i].at > 9000) feed.splice(i, 1);
      feed.forEach((f) => {
        const kin = reduced ? 1 : ease((now - f.born) / 260), fade = Math.min(1, (9000 - (now - f.at)) / 800);
        ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(kin, fade)); ctx.translate((kin - 1) * 60, 0);
        fill(x, y, 300, 54, 27, C.dark);
        avatar(f.user, x + 30, y + 27, 20, '#fff');
        const val = f.sub ? f.txt : `+${f.n}`;
        if (f.sub) { text(f.user.name, x + 60, y + 18, 21, '#fff', 800, 'left', 130, TITLE); text(f.sub.toUpperCase(), x + 60, y + 40, 15, C.gold, 800, 'left', 130, TITLE); }
        else text(f.user.name, x + 60, y + 28, 23, '#fff', 800, 'left', 140, TITLE);
        text(val, x + 282, y + 28, 25, f.sub ? C.gold : '#fff', 800, 'right', 0, TITLE);
        ctx.font = `800 25px ${TITLE}`; const vw = ctx.measureText(val).width;
        if (f.icon) text(f.icon, x + 282 - vw - 22, y + 27, 24); else bandIcon(x + 282 - vw - 22, y + 27, 11);
        ctx.restore();
        y += 60;
      });
    });
  }
  function drawGifts(now) {
    const list = (S.powerups || []).filter((p) => ACT[p.action]);
    if (!list.length) return;
    panel('menu', { x: 40, y: 1560 }, () => {
      const rh = 62, cw = 494;
      list.forEach((p, i) => {
        const x = 40 + (i % 2) * (cw + 12), y = 1560 + Math.floor(i / 2) * rh, a = ACT[p.action], hot = (anim.hot[p.action] || 0) > now;
        fill(x, y, cw, rh - 8, 27, hot ? 'rgba(120,70,10,.9)' : 'rgba(46,26,12,.8)', hot ? C.gold : null, 4);
        text(a[0], x + 34, y + 28, 30);
        text(a[1], x + 64, y + 28, 24, '#fff', 800, 'left', 180, TITLE);
        text(`${p.icon || ''} ${p.text || ''}`.trim(), x + 254, y + 28, 19, 'rgba(255,236,200,.85)', 700, 'left', 130);
        fill(x + cw - 100, y + 9, 88, 36, 18, 'rgba(255,255,255,.14)');
        text(a[2], x + cw - 56, y + 28, 22, p.action === 'dao' ? '#ff8fa3' : C.gold, 800, 'center', 80, TITLE);
      });
    });
  }

  // ---------------- hiệu ứng ----------------
  function explode(sizeK) {
    anim.burst = Array.from({ length: 22 }, () => 0.55 + Math.random() * 0.75);
    if (reduced) return;
    const my = anim.my, k = sizeK;
    const P = (o) => parts.push({ age: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 9, g: 1500, ...o });
    const dir = (min, max) => { const a = Math.random() * Math.PI * 2, sp = min + Math.random() * (max - min); return { x: MX + Math.cos(a) * 70, y: my + Math.sin(a) * 70, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 420 }; };
    // nửa trên bật tung lên
    P({ kind: 'top', x: MX, y: my - 90 * k, vx: -140 + Math.random() * 280, vy: -1250, g: 1700, r: RX * k, rot: 0, vr: (Math.random() - 0.5) * 5, life: 3 });
    for (let i = 0; i < Math.round(16 * k); i++) P({ kind: 'chunk', ...dir(350, 1150), r: 38 + Math.random() * 52, life: 2.6 + Math.random() });
    for (let i = 0; i < Math.round(110 * k); i++) P({ kind: 'juice', ...dir(300, 1500), r: 7 + Math.random() * 15, col: Math.random() < 0.5 ? C.juice : '#ff8fb0', life: 1.6 + Math.random() });
    for (let i = 0; i < Math.round(26 * k); i++) P({ kind: 'seed', ...dir(300, 1300), r: 6, life: 2 + Math.random() });
    for (let i = 0; i < Math.round(30 * k); i++) P({ kind: 'band', ...dir(250, 1000), r: 20 + Math.random() * 16, col: BAND_COLS[i % BAND_COLS.length], life: 2 + Math.random(), g: 1100 });
  }
  /** Chớp nổ: chùm tia nước dưa toả ra từ eo trong nửa giây đầu. */
  function drawBurst(now) {
    const age = (now - anim.popAt) / 1000; if (S.phase !== 'pop' || age > 0.7 || !anim.burst) return;
    const k = ease(age / 0.7), n = anim.burst.length;
    ctx.save(); ctx.translate(MX, anim.my + 40); ctx.globalAlpha = 1 - k * k;
    for (const [sc, col] of [[1, '#ff4d7a'], [0.72, '#ff8fb0'], [0.42, '#ffe1ea']]) {
      const R1 = (150 + k * 620) * sc * anim.size; ctx.fillStyle = col; ctx.beginPath();
      for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2, a2 = ((j + 0.5) / n) * Math.PI * 2, r = R1 * anim.burst[j]; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.85); ctx.lineTo(Math.cos(a2) * R1 * 0.34, Math.sin(a2) * R1 * 0.3); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function makeSplats() {
    const R = rng(Math.floor(performance.now()));
    anim.splats = [[150, 1010, 150], [930, 1330, 120], [210, 1500, 100], [900, 690, 90], [620, 1440, 80]].map(([x, y, r], i) => ({
      x: x + (R() - 0.5) * 80, y: y + (R() - 0.5) * 80, r: r * (0.8 + R() * 0.4), delay: i * 70,
      pts: Array.from({ length: 14 }, (_, j) => (j % 2 ? 0.55 + R() * 0.2 : 1.1 + R() * 1.0)), drips: [R(), R(), R()],
    }));
  }
  function drawSplats(now) {
    if (S.phase !== 'pop') return;
    const left = Math.max(0, S.popLeftMs - (now - recvAt)), fade = Math.min(1, left / 500);
    for (const s of anim.splats) {
      const k = reduced ? 1 : backE(Math.min(1, (now - anim.popAt - s.delay) / 280)); if (k <= 0) continue;
      ctx.save(); ctx.globalAlpha = 0.62 * fade; ctx.translate(s.x, s.y); ctx.scale(k, k);
      ctx.fillStyle = '#ff4d7a'; ctx.beginPath();
      const n = s.pts.length;
      for (let j = 0; j <= n; j++) {
        const a0 = ((j - 0.5) / n) * Math.PI * 2, a1 = (j / n) * Math.PI * 2, r1 = s.pts[j % n] * s.r, rm = s.pts[(j + n - 1) % n] * s.r;
        if (!j) ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        else ctx.quadraticCurveTo(Math.cos(a0) * Math.min(r1, rm) * 0.7, Math.sin(a0) * Math.min(r1, rm) * 0.7, Math.cos(a1) * r1, Math.sin(a1) * r1);
      }
      ctx.closePath(); ctx.fill();
      s.drips.forEach((d, i) => { rr(ctx, (i - 1) * s.r * 0.45 - 9, 0, 18, s.r * (0.9 + d * 0.9), 9); ctx.fill(); });
      ctx.strokeStyle = 'rgba(255,190,205,.75)'; ctx.lineWidth = 5; for (const q of [0.3, 0.5]) { ctx.beginPath(); ctx.arc(0, 0, s.r * q, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
  }
  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += dt;
      if (p.age > p.life || p.y > H + 60) { parts.splice(i, 1); continue; }
      p.vy += (p.g || 1200) * dt; p.vx *= 0.995; p.x += p.vx * dt; p.y += p.vy * dt; p.rot = (p.rot || 0) + (p.vr || 0) * dt;
      ctx.save(); ctx.globalAlpha = Math.min(1, (p.life - p.age) * 1.5); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
      if (p.kind === 'seed') { ctx.fillStyle = C.seed; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 1.6, 0, 0, Math.PI * 2); ctx.fill(); }
      else if (p.kind === 'chunk') { // miếng dưa: vỏ xanh, cùi trắng, ruột đỏ, hạt đen
        const r = p.r, wedge = (q) => { ctx.beginPath(); ctx.moveTo(-r * q, 0); ctx.quadraticCurveTo(0, r * 0.95 * q, r * q, 0); ctx.lineTo(r * 0.12 * q, -r * 1.15 * q); ctx.lineTo(-r * 0.3 * q, -r * 0.8 * q); ctx.closePath(); };
        wedge(1); ctx.fillStyle = C.rind; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.rindDark; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.translate(0, -r * 0.1); wedge(0.86); ctx.fillStyle = '#eaffd0'; ctx.fill();
        ctx.translate(0, -r * 0.08); wedge(0.74); ctx.fillStyle = C.flesh; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.3, r * 0.12, r * 0.3, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.seed; for (const [sx, sy] of [[-0.25, 0.05], [0.2, -0.05], [0, -0.45]]) { ctx.beginPath(); ctx.ellipse(sx * r, sy * r, r * 0.06, r * 0.11, sx, 0, Math.PI * 2); ctx.fill(); }
      }
      else if (p.kind === 'top') { // nửa trên trái dưa
        const r = p.r;
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.95, 0, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#62b84a'; ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = '#17602a'; for (let i = -3; i <= 3; i++) { const cx = Math.sin((i / 3.6) * (Math.PI / 2)) * r; ctx.beginPath(); ctx.ellipse(cx, 0, r * 0.07, r, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.95, 0, Math.PI, 0); ctx.closePath(); ctx.lineWidth = 7; ctx.strokeStyle = C.rindDark; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.fillStyle = '#eaffd0'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.flesh; ctx.beginPath(); for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI * 2, q = i % 2 ? 0.86 : 0.7; const y = Math.sin(a) * r * 0.16 * q + (Math.sin(a) > 0 ? r * 0.16 * (i % 2) : 0); ctx.lineTo(Math.cos(a) * r * q, y); } ctx.closePath(); ctx.fill();
      }
      else if (p.kind === 'band') { ctx.strokeStyle = 'rgba(70,10,24,.5)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = p.col; ctx.lineWidth = 5; ctx.stroke(); }
      else if (p.kind === 'juice') { // giọt nước kéo dài theo hướng bay
        const sp = Math.hypot(p.vx, p.vy); ctx.rotate(-(p.rot || 0) + Math.atan2(p.vy, p.vx));
        ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, p.r * (1 + Math.min(1.6, sp / 700)), p.r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(p.r * 0.2, -p.r * 0.3, p.r * 0.28, 0, Math.PI * 2); ctx.fill();
      }
      else { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.age += dt; if (f.age > f.life) { floaters.splice(i, 1); continue; }
      const k = f.age / f.life;
      const sc = Math.min(1, k / 0.12, (1 - k) / 0.12);
      ctx.save(); ctx.translate(f.x, f.y - ease(k) * 110); ctx.scale(sc, sc);
      out(f.text, 0, 0, f.size, f.color, { maxW: W - 80 });
      ctx.restore();
    }
  }
  function drawTitle(now) {
    const t = anim.title; if (!t) return;
    const age = (now - t.at) / 1000;
    if (age > t.life) { anim.title = null; return; }
    const k = reduced ? 1 : backE(Math.min(1, age / 0.28));
    const q = (0.4 + 0.6 * k) * Math.min(1, (t.life - age) / 0.2);
    ctx.save(); ctx.translate(540, 760); ctx.scale(q, q);
    text(t.icon, 0, -84, 84);
    out(t.text, 0, 0, 84, t.color, { maxW: 900 }); if (t.sub) out(t.sub, 0, 76, 40, '#fff', { maxW: 900 });
    ctx.restore();
  }
  function drawPop(now) {
    if (S.phase !== 'pop') return;
    const age = (now - anim.popAt) / 1000, k = reduced ? 1 : backE(Math.min(1, age / 0.4));
    const cx = 730, cy = 730, r = 122, knife = S.popHow === 'dao';
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
    ctx.fillStyle = 'rgba(255,95,138,.35)'; ctx.beginPath(); ctx.arc(cx, cy, r + 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.pink; ctx.beginPath(); ctx.arc(cx, cy, r + 26, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#b3204e'; ctx.stroke();
    avatar(S.popper, cx, cy, r, '#fff');
    out(S.popper?.npc ? 'CÔ BA' : `@${S.popper?.name || ''}`, cx, cy + 190, 62, C.cream, { maxW: 640 });
    out(knife ? 'BỔ ĐÔI DƯA!' : 'LÀM NỔ DƯA!', cx, cy + 282, 104, C.pink, { maxW: 640, sw: 20 });
    const info = `${knife ? 'lúc' : 'ở sợi thứ'} ${fmtN(anim.bands)}${knife ? ' sợi' : ''} · trái #${S.melonNo}`;
    ctx.font = `800 32px ${TITLE}`; const iw = Math.min(600, ctx.measureText(info).width + 64);
    fill(cx - iw / 2, cy + 350, iw, 60, 30, 'rgba(46,26,12,.86)', C.cream, 4);
    text(info, cx, cy + 381, 32, '#fff', 800, 'center', iw - 40, TITLE);
    ctx.restore();
    out(`Dưa mới sau ${Math.ceil(Math.max(0, S.popLeftMs - (now - recvAt)) / 1000)} giây…`, 540, 1440, 34, C.cream);
  }

  // ---------------- vòng vẽ ----------------
  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!S) { ctx.fillStyle = '#8fd3fb'; ctx.fillRect(0, 0, W, H); out('Đang bày dưa…', W / 2, H / 2, 56); return; }
    back ||= buildBack(); front ||= buildFront();
    const lerp = (a, b, r) => a + (b - a) * Math.min(1, dt * r);
    anim.bands = S.phase === 'pop' ? anim.bands : lerp(anim.bands, S.bands, 14);
    if (Math.abs(anim.bands - S.bands) < 0.05) anim.bands = S.bands;
    anim.tension = lerp(anim.tension, S.phase === 'pop' ? 0 : S.tension, 4);
    anim.size = lerp(anim.size, SIZE_K[S.size] || 1, 5);
    anim.arm = Math.max(0, anim.arm - dt * (S.turboMs > 0 ? 7 : 3));
    anim.bump = Math.max(0, anim.bump - dt * 5);
    anim.shake = Math.max(0, anim.shake - dt * 2.2);
    anim.flash = Math.max(0, anim.flash - dt * 2.5);
    anim.snaps = anim.snaps.filter((s) => now - s.at < 700);
    const sh = reduced ? 0 : anim.shake * 26;
    ctx.save(); ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    ctx.drawImage(back, 0, 0);
    drawAuntie(now);
    ctx.drawImage(front, 0, 0);
    drawMelon(now, dt);
    drawArms(now);
    drawShields();
    drawKnife(now);
    drawBurst(now);
    drawParts(dt);
    ctx.restore();
    drawSplats(now);
    drawHud(now);
    drawBoard(now);
    drawGifts(now);
    drawTitle(now);
    drawPop(now);
    if (anim.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${anim.flash * 0.7})`; ctx.fillRect(0, 0, W, H); }
    if (S.paused) { ctx.fillStyle = 'rgba(40,20,10,.55)'; ctx.fillRect(0, 0, W, H); out('TẠM DỪNG', W / 2, H / 2, 110, '#fff'); }
  }
  (document.fonts?.ready || Promise.resolve()).finally(() => { if (!stopped) raf = requestAnimationFrame(frame); });

  return {
    update(s) {
      const now = performance.now();
      if (!S || s.melonNo !== S.melonNo) { anim.melonAt = now; anim.bands = s.bands; }
      if (s.phase === 'pop' && S?.phase !== 'pop') { anim.popAt = now; anim.bands = s.bands; makeSplats(); } // nổ: hiện đúng số dây cuối
      for (const u of s.next || []) if (u?.avatar) img(u.avatar);
      S = s; recvAt = now;
    },
    effect(fx) {
      const now = performance.now();
      switch (fx.type) {
        case 'bd_band': {
          // sợi thường: đủ động tác mắc dây; sợi quà dồn dập: động tác rút gọn, không chen ngang động tác đang dở
          const busy = anim.wrap && now < anim.wrap.at + anim.wrap.D * 1000;
          let snapAt = now;
          if (!reduced && (!fx.fast || !busy)) { const D = fx.fast ? 0.2 : S?.turboMs > 0 ? 0.24 : 0.6; anim.wrap = { idx: fx.bands - 1, at: now, D }; snapAt = now + D * 800; }
          anim.snaps.push({ idx: fx.bands - 1, at: snapAt });
          if (anim.snaps.length > 30) anim.snaps.shift();
          anim.bump = 1;
          if (!fx.fast) { sound.play('snap'); if (fx.by) feedPush(fx.by, null, '+1'); } else if (Math.random() < 0.35) sound.play('snap', 1.4);
          break;
        }
        case 'bd_queue': if (fx.likes && fx.by) feedPush(fx.by, '❤️', `+${fx.n}`, 'Thả tim'); break;
        case 'bd_gift': {
          const a = ACT[fx.action]; if (!a) break;
          anim.hot[fx.action] = now + 1500;
          const sub = fx.n ? `+${fx.n} sợi` : fx.cut != null ? `−${fx.cut} sợi` : fx.blocked ? 'bị thớt chặn!' : fx.faster ? 'dao rơi nhanh hơn!' : fx.seconds ? `${fx.seconds} giây` : '';
          anim.title = { icon: a[0], text: a[1].toUpperCase(), sub: [fx.by?.name, sub].filter(Boolean).join(' · '), color: fx.action === 'dao' ? '#ff6b7f' : C.gold, at: now, life: 1.8 };
          if (fx.by) feedPush(fx.by, a[0], fx.n ? `+${fx.n}` : fx.cut != null ? `−${fx.cut}` : a[2], a[1]);
          if (fx.n && !reduced) for (let i = 0; i < Math.min(30, fx.n); i++) parts.push({ kind: 'band', x: 420 + Math.random() * 60, y: 1180, vx: 100 + Math.random() * 300, vy: -500 - Math.random() * 400, g: 1400, r: 18, col: BAND_COLS[i % BAND_COLS.length], life: 0.9, age: 0, rot: 0, vr: 8 });
          sound.play(fx.action === 'dao' ? 'knife' : fx.action === 'turbo' ? 'turbo' : fx.action === 'keo' ? 'cut' : 'gift');
          break;
        }
        case 'bd_block': floaters.push({ text: 'CHẶN ĐƯỢC RỒI!', x: MX, y: anim.my - RY - 120, size: 72, color: C.gold, life: 1.6, age: 0 }); sound.play('block'); break;
        case 'bd_pop': anim.shake = 1; anim.flash = 1; explode(SIZE_K[fx.size] || 1); sound.play('pop'); break;
        case 'bd_melon': sound.play('melon'); break;
        default:
      }
    },
    layout(m) { LAYOUT = m && typeof m === 'object' ? m : {}; },
    resumeAudio() { sound.resume(); },
    resize() {},
    destroy() { stopped = true; cancelAnimationFrame(raf); sound.close(); },
  };
}

/** Âm thanh tổng hợp WebAudio (tạo lười, tắt khi mute). */
function makeSound(muted) {
  let ac = null, lastSnap = 0;
  const get = () => { if (muted || typeof AudioContext === 'undefined') return null; if (!ac) { try { ac = new AudioContext(); } catch { muted = true; return null; } } return ac; };
  function tone(f, dur, { type = 'sine', vol = 0.18, at = 0, slide = 0 } = {}) {
    const a = get(); if (!a || a.state !== 'running') return;
    const t0 = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, { vol = 0.3, freq = 1200, at = 0 } = {}) {
    const a = get(); if (!a || a.state !== 'running') return;
    const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination); src.start(a.currentTime + at);
  }
  const P = {
    snap: (p = 1) => { const n = performance.now(); if (n - lastSnap < 45) return; lastSnap = n; tone(260 * p, 0.09, { type: 'triangle', vol: 0.14, slide: 2.2 }); },
    gift: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, { type: 'triangle', at: i * 0.06 })),
    knife: () => { noise(0.4, { freq: 4000, vol: 0.25 }); tone(1200, 0.3, { type: 'sawtooth', vol: 0.05, slide: 0.4 }); },
    turbo: () => tone(300, 0.6, { type: 'square', vol: 0.06, slide: 4 }),
    cut: () => { noise(0.08, { freq: 6000, vol: 0.3 }); noise(0.08, { freq: 6000, vol: 0.3, at: 0.12 }); },
    block: () => { tone(120, 0.25, { vol: 0.4, slide: 0.6 }); noise(0.1, { freq: 800, vol: 0.3 }); },
    pop: () => { tone(70, 0.9, { vol: 0.6, slide: 0.4 }); noise(1.1, { freq: 1800, vol: 0.55 }); tone(900, 0.4, { type: 'triangle', vol: 0.1, slide: 0.5, at: 0.05 }); },
    melon: () => { tone(180, 0.18, { vol: 0.25, slide: 0.7 }); tone(660, 0.12, { type: 'triangle', vol: 0.1, at: 0.15 }); },
  };
  return { play(n, a) { try { P[n]?.(a); } catch { /* bỏ qua */ } }, resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } }, close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; } };
}

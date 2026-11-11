// Renderer canvas của Bùm Dưa (khung dọc 1080×1920). Sạp dưa ngoài chợ: mái che sọc, bàn gỗ, cô Ba đội nón lá.
// Mọi chuyển động nội suy theo thời gian thực (dt) để mượt: dây thun bật nảy đàn hồi, dưa thắt eo dần, nứt, rỉ nước, rung,
// nổ thì văng nước + hạt + vỏ. Không đụng DOM khi import.
import { drawPanel } from '#sdk';

const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const TITLE = "'Baloo 2', 'Be Vietnam Pro', system-ui, sans-serif";
const C = {
  sky0: '#ffe3b3', sky1: '#ffc58a', wall: '#f6d7a7', ink: '#3a2414', paper: '#fff8ec', cream: '#fff3dc',
  rind: '#2f7d3a', rindDark: '#1f5a29', stripe: '#78b84a', flesh: '#ff5d6c', juice: '#ff4d6d', seed: '#2b1a12',
  wood: '#b0743f', woodDark: '#7d4e27', red: '#e8473a', gold: '#f5b82e', mint: '#3fbf8f', sky: '#6cc4f0',
};
const ACT = {
  nam: ['🤏', 'Nắm dây', '+3 sợi'], boc: ['✊', 'Bó dây', '+10 sợi'], cuon: ['🧶', 'Cuộn dây to', '+25 sợi'], thung: ['📦', 'Thùng dây', '+50 sợi'],
  sung: ['🔫', 'Súng bắn dây', '+150 sợi'], turbo: ['⚡', 'Cô Ba tăng tốc', '×4 tốc độ'], dao: ['🔪', 'Dao chặt dưa', 'đếm ngược rồi bổ'],
  thot: ['🪵', 'Thớt chắn dao', 'chặn 1 nhát dao'], keo: ['✂️', 'Kéo cắt', '−10 sợi'], vang: ['🌟', 'Dưa vàng', 'cứng hơn'], follow: ['➕', 'Follow', 'ném 1 nắm dây'],
};
const BAND_COLS = ['#ffd23f', '#ff8fab', '#7bdff2', '#b8f2a6', '#f7a072', '#c3a6ff', '#ffef8a', '#80ed99', '#ffadad', '#9bf6ff'];
const SIZE_K = { thuong: 1, to: 1.13, khonglo: 1.27 };

export function mount(el, { canvas, options = {} } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let S = null, recvAt = 0, raf = 0, stopped = false, last = performance.now();
  let LAYOUT = {};
  const panel = (id, def, fn) => drawPanel(ctx, LAYOUT, id, def, fn);
  const sound = makeSound(!!options.mute);
  const images = new Map();
  const parts = [], floaters = [];
  const anim = {
    bands: 0, tension: 0, size: 1, shake: 0, flash: 0, title: null, popAt: -1e9, snaps: [], arm: 0, melonIn: 1, melonAt: 0,
    rinds: 0, hot: {}, sweat: 0, cut: 0,
  };
  if (typeof document !== 'undefined' && !document.getElementById('dd-font')) {
    const l = document.createElement('link'); l.id = 'dd-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap'; document.head.append(l);
  }

  // ---------------- tiện ích ----------------
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fill(x, y, w, h, r, col) { rr(x, y, w, h, r); ctx.fillStyle = col; ctx.fill(); }
  function text(s, x, y, size, color = C.ink, weight = 800, align = 'center', maxW = 0, font = FONT) {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    let t = String(s ?? '');
    if (maxW && ctx.measureText(t).width > maxW) { while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; }
    ctx.fillText(t, x, y);
  }
  function big(s, x, y, size, color, stroke = '#3a1408') {
    let sz = size; ctx.font = `800 ${sz}px ${TITLE}`;
    while (sz > 30 && ctx.measureText(s).width > W - 80) { sz -= 4; ctx.font = `800 ${sz}px ${TITLE}`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, sz * 0.17); ctx.strokeStyle = stroke; ctx.strokeText(s, x, y + sz * 0.06);
    ctx.fillStyle = color; ctx.fillText(s, x, y + sz * 0.06);
  }
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3));
  const back = (k) => { if (k <= 0) return 0; if (k >= 1) return 1; const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
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
    else if (u?.npc) { ctx.fillStyle = '#ffd9a8'; ctx.fill(); text('👒', x, y + 1, r * 1.2); }
    else { const n = u?.name || '?'; let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; ctx.fillStyle = `hsl(${h},55%,48%)`; ctx.fill(); text([...n][0]?.toUpperCase() || '?', x, y + 1, Math.round(r * 1.05), '#fff', 800); }
    if (ring) { ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = ring; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  // ---------------- bối cảnh sạp dưa ----------------
  const MX = 600, MY = 1010, TABLE = 1250;
  function drawScene(now) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.sky0); g.addColorStop(0.55, C.sky1); g.addColorStop(1, '#e89a5c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // nắng
    ctx.save(); ctx.globalAlpha = 0.18; ctx.translate(880, 420); ctx.rotate(now / 9000);
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -900); ctx.lineTo(40, -900); ctx.closePath(); ctx.fillStyle = '#fff6d8'; ctx.fill(); }
    ctx.restore();
    // tường sạp + kệ dưa phía sau
    fill(0, 640, W, TABLE - 640, 0, C.wall);
    for (let i = 0; i < 4; i++) { fill(30 + i * 270, 720, 240, 150, 14, 'rgba(176,116,63,.35)'); for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(70 + i * 270 + k * 55, 790, 30, 24, 0, 0, Math.PI * 2); ctx.fillStyle = k % 2 ? '#3f8f45' : '#2f7d3a'; ctx.fill(); } }
    // mái che sọc + diềm sóng
    const ay = 300, ah = 300;
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#fff4e2' : C.red; ctx.beginPath(); ctx.moveTo(i * 120, ay); ctx.lineTo(i * 120 + 120, ay); ctx.lineTo(i * 120 + 120 - 6, ay + ah); ctx.lineTo(i * 120 + 6, ay + ah); ctx.closePath(); ctx.fill(); }
    const sway = reduced ? 0 : Math.sin(now / 900) * 4;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(i * 120 + 60, ay + ah + sway * (i % 2 ? 1 : -1) * 0.3, 60, 0, Math.PI); ctx.fillStyle = i % 2 ? '#fff4e2' : C.red; ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(0, ay + ah + 60, W, 26);
    // biển "SẠP DƯA CÔ BA"
    ctx.save(); ctx.translate(540, 250); ctx.rotate(-0.02);
    fill(-260, -46, 520, 92, 20, C.woodDark); fill(-250, -38, 500, 76, 16, '#f9e0b4');
    text('🍉 SẠP DƯA CÔ BA', 0, 2, 40, C.ink, 900, 'center', 0, TITLE);
    ctx.restore();
    // bàn gỗ
    fill(-20, TABLE, W + 40, 60, 10, C.wood);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(i * 190 + 30, TABLE + 8, 120, 4); }
    ctx.fillStyle = C.woodDark; ctx.fillRect(0, TABLE + 60, W, 18);
    ctx.fillStyle = '#7a4a24'; ctx.fillRect(60, TABLE + 78, 40, 300); ctx.fillRect(W - 100, TABLE + 78, 40, 300);
  }

  // ---------------- cô Ba ----------------
  function drawAuntie(now) {
    const t = anim.tension, turbo = S.turboMs > 0;
    const bx = 140, by = 1080 + (reduced ? 0 : Math.sin(now / (turbo ? 160 : 600)) * 4);
    // thân áo bà ba
    ctx.fillStyle = '#4f86c6'; ctx.beginPath(); ctx.moveTo(bx - 95, TABLE); ctx.quadraticCurveTo(bx - 100, by - 40, bx - 40, by - 70); ctx.lineTo(bx + 40, by - 70); ctx.quadraticCurveTo(bx + 100, by - 40, bx + 95, TABLE); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(bx - 4, by - 66, 8, TABLE - by + 66);
    // đầu
    ctx.fillStyle = '#f2c79c'; ctx.beginPath(); ctx.arc(bx, by - 120, 52, 0, Math.PI * 2); ctx.fill();
    const look = Math.sin(now / 1200) * 4;
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(bx - 16 + look, by - 122, 5, 0, Math.PI * 2); ctx.arc(bx + 18 + look, by - 122, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.beginPath();
    if (t > 0.75) ctx.arc(bx + 2, by - 92, 10, Math.PI * 1.15, Math.PI * 1.85); else ctx.arc(bx + 2, by - 104, 12, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,120,.35)'; ctx.beginPath(); ctx.arc(bx - 30, by - 104, 9, 0, Math.PI * 2); ctx.arc(bx + 34, by - 104, 9, 0, Math.PI * 2); ctx.fill();
    // mồ hôi khi dưa căng
    if (t > 0.6) for (let i = 0; i < 2; i++) { const k = ((now / 700 + i * 0.5) % 1); ctx.globalAlpha = 1 - k; ctx.fillStyle = '#7fd3ff'; ctx.beginPath(); ctx.ellipse(bx + 46 - i * 96, by - 140 + k * 40, 6, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    // nón lá
    ctx.fillStyle = '#e9cf8f'; ctx.beginPath(); ctx.moveTo(bx - 110, by - 150); ctx.lineTo(bx, by - 245); ctx.lineTo(bx + 110, by - 150); ctx.quadraticCurveTo(bx, by - 128, bx - 110, by - 150); ctx.fill();
    ctx.strokeStyle = 'rgba(122,86,36,.35)'; ctx.lineWidth = 2; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bx - 110 + i * 26, by - 150 - i * 24); ctx.lineTo(bx + 110 - i * 26, by - 150 - i * 24); ctx.stroke(); }
    // tay kéo dây: mỗi sợi mới → tay vươn về phía dưa rồi thu lại
    const reach = anim.arm;
    const hx = bx + 70 + reach * 120, hy = by - 20 - reach * 30;
    ctx.strokeStyle = '#4f86c6'; ctx.lineWidth = 26; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx + 50, by - 40); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = '#f2c79c'; ctx.beginPath(); ctx.arc(hx, hy, 15, 0, Math.PI * 2); ctx.fill();
    if (reach > 0.05 && S.phase === 'wrap') { // sợi dây đang căng
      const mw = melonHalfW(0) * anim.size;
      ctx.strokeStyle = hashCol(S.last?.id); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + MX - mw) / 2, hy + 40 * (1 - reach), MX - mw + 10, MY); ctx.stroke();
    }
    if (turbo) { text('⚡', bx + 80, by - 200, 46); text(`×4 · ${Math.ceil(S.turboMs / 1000)}s`, bx + 80, by - 160, 24, '#7a4a00', 900); }
  }

  // ---------------- trái dưa ----------------
  const RX = 300, RY = 225;
  /** Nửa bề ngang của dưa tại độ cao y (so với tâm), có thắt eo theo số dây. */
  function melonHalfW(dy) {
    const s = Math.max(-1, Math.min(1, dy / RY));
    const pinch = Math.min(0.3, anim.tension * 0.32);
    return RX * Math.sqrt(Math.max(0, 1 - s * s)) * (1 - pinch * Math.exp(-s * s * 9));
  }
  function melonPath(k) {
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2, dy = Math.sin(a) * RY;
      const x = MX + Math.sign(Math.cos(a)) * melonHalfW(dy) * k, y = MY + dy * k;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function drawMelon(now, dt) {
    if (S.phase === 'pop') return;
    const k = anim.size * (reduced ? 1 : back(Math.min(1, (now - anim.melonAt) / 600)));
    const t = anim.tension;
    const tr = reduced ? 0 : Math.max(0, t - 0.78) * 40;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * tr, (Math.random() - 0.5) * tr * 0.6);
    // bóng
    ctx.fillStyle = 'rgba(60,30,10,.25)'; ctx.beginPath(); ctx.ellipse(MX, TABLE + 6, RX * k * 0.95, 26, 0, 0, Math.PI * 2); ctx.fill();
    // vỏ
    melonPath(k);
    const golden = !!S.golden;
    const gr = ctx.createRadialGradient(MX - 90 * k, MY - 90 * k, 30, MX, MY, RX * k * 1.1);
    gr.addColorStop(0, golden ? '#ffe27a' : '#4fa851'); gr.addColorStop(1, golden ? '#c98a12' : C.rindDark);
    ctx.fillStyle = gr; ctx.fill();
    // sọc dưa (zigzag)
    ctx.save(); melonPath(k); ctx.clip();
    ctx.strokeStyle = golden ? 'rgba(255,240,170,.6)' : 'rgba(150,210,95,.55)'; ctx.lineWidth = 18 * k;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      for (let j = 0; j <= 24; j++) { const yy = MY - RY * k + (j / 24) * RY * 2 * k; const xx = MX + i * 64 * k * (1 - 0.25 * Math.abs((yy - MY) / (RY * k))) + Math.sin(j * 1.6) * 7 * k; j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    // vết nứt
    if (t > 0.5) {
      const n = Math.floor((t - 0.5) * 16);
      ctx.strokeStyle = 'rgba(255,220,220,.9)'; ctx.lineWidth = 4;
      for (let c = 0; c < n; c++) {
        const side = c % 2 ? 1 : -1, x0 = MX + side * (60 + (c * 37) % 160) * k;
        ctx.beginPath(); ctx.moveTo(x0, MY);
        let x = x0, y = MY;
        for (let s = 0; s < 5; s++) { x += ((c * 13 + s * 7) % 11 - 5) * 3; y += side * (14 + s * 4) * (c % 3 === 0 ? -1 : 1); ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255,70,90,${(t - 0.5) * 0.5})`; ctx.fillRect(MX - RX * k, MY - 30, RX * 2 * k, 60);
    }
    ctx.restore();
    // bóng sáng
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.ellipse(MX - 120 * k, MY - 120 * k, 70 * k, 34 * k, -0.5, 0, Math.PI * 2); ctx.fill();
    // cuống
    ctx.strokeStyle = '#6b4a22'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(MX, MY - RY * k + 6); ctx.quadraticCurveTo(MX + 20, MY - RY * k - 30, MX + 40, MY - RY * k - 34); ctx.stroke();
    // mặt người tặng dưa vàng
    if (golden) avatar(S.golden, MX, MY - RY * k + 70, 40, C.gold);
    drawBands(now, k);
    // nước rỉ ra
    if (t > 0.72 && !reduced && Math.random() < dt * 6 * t) parts.push({ x: MX + (Math.random() - 0.5) * RX * k * 1.2, y: MY + 20, vx: (Math.random() - 0.5) * 30, vy: 40, g: 900, r: 6 + Math.random() * 5, col: C.juice, life: 1.6, age: 0, drop: true });
    ctx.restore();
  }
  function drawBands(now, k) {
    const n = Math.round(anim.bands);
    const vis = Math.min(n, 70);
    const thick = Math.min(150, 24 + vis * 1.9) * k;
    const sp = vis > 1 ? thick / (vis - 1) : 0;
    const recent = S.recent || [];
    for (let i = 0; i < vis; i++) {
      const idx = n - vis + i; // sợi cũ ở ngoài cùng (trên/dưới), sợi mới ở giữa eo
      const order = i % 2 ? i / 2 : -i / 2;
      const dy = vis > 1 ? (order / (vis / 2)) * (thick / 2) : 0;
      const hw = melonHalfW(dy / k) * k;
      const snap = anim.snaps.find((s) => s.idx === idx);
      let lift = 0, sc = 1;
      if (snap) { const e = (now - snap.at) / 520; lift = (1 - elastic(Math.min(1, e))) * -60; sc = 1 + (1 - Math.min(1, e)) * 0.25; }
      const y = MY + dy + lift;
      const col = BAND_COLS[(idx * 7) % BAND_COLS.length];
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, 7 * k - vis * 0.04);
      ctx.beginPath(); ctx.moveTo(MX - hw * sc, y); ctx.quadraticCurveTo(MX, y + 26 * k, MX + hw * sc, y); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(MX - hw * sc, y + 3); ctx.quadraticCurveTo(MX, y + 29 * k, MX + hw * sc, y + 3); ctx.stroke();
    }
    // mặt người xem trên vài sợi mới nhất
    const faces = recent.slice(-4);
    faces.forEach((u, i) => { const x = MX + (i - (faces.length - 1) / 2) * 92; avatar(u, x, MY + 22 * k + thick * 0.15, 30, hashCol(u.id)); });
    void sp;
  }

  // ---------------- dao chặt + thớt ----------------
  function drawKnife(now) {
    const kn = S.knife; if (!kn) return;
    const left = Math.max(0, kn.leftMs - (now - recvAt));
    const k = 1 - left / kn.totalMs;
    const sw = reduced ? 0 : Math.sin(now / 260) * 0.08;
    ctx.save(); ctx.translate(MX + 40, MY - RY - 210 + k * 40); ctx.rotate(-0.5 + sw);
    // lưỡi dao
    const bg = ctx.createLinearGradient(-20, -60, 300, 40); bg.addColorStop(0, '#f4f6f8'); bg.addColorStop(1, '#9aa5b1');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(320, -40); ctx.quadraticCurveTo(360, 0, 320, 50); ctx.lineTo(0, 50); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b4a22'; fill(-150, -26, 155, 52, 18, '#6b4a22');
    ctx.restore();
    avatar(kn.by, MX - 120, MY - RY - 220, 44, '#fff');
    const sec = Math.ceil(left / 1000);
    ctx.save(); ctx.beginPath(); ctx.arc(MX + 210, MY - RY - 250, 54, 0, Math.PI * 2); ctx.fillStyle = 'rgba(40,10,10,.85)'; ctx.fill();
    ctx.strokeStyle = sec <= 3 ? '#ff4d4d' : '#ffd166'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(MX + 210, MY - RY - 250, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); ctx.stroke(); ctx.restore();
    text(sec, MX + 210, MY - RY - 248, 46, '#fff', 900);
    fill(MX - 340, TABLE + 96, 680, 60, 30, 'rgba(120,16,16,.9)');
    text(`🔪 ${kn.by?.name || ''} rút dao! Tặng 🪵 thớt để chặn`, MX, TABLE + 127, 26, '#fff', 900, 'center', 640);
  }
  function drawShields() {
    for (let i = 0; i < (S.shields || 0); i++) { fill(760 + i * 92, TABLE - 34, 80, 30, 8, '#c98f55'); text('🪵', 800 + i * 92, TABLE - 56, 34); }
  }
  function drawRinds() {
    const n = Math.min(14, anim.rinds);
    for (let i = 0; i < n; i++) {
      const x = 880 + (i % 4) * 44 - Math.floor(i / 4) * 10, y = TABLE - 8 - Math.floor(i / 4) * 22;
      ctx.save(); ctx.translate(x, y); ctx.rotate((i * 0.9) % 1 - 0.5);
      ctx.fillStyle = C.rind; ctx.beginPath(); ctx.arc(0, 0, 30, Math.PI, 0); ctx.fill();
      ctx.fillStyle = C.flesh; ctx.beginPath(); ctx.arc(0, 0, 22, Math.PI, 0); ctx.fill();
      ctx.restore();
    }
  }

  // ---------------- HUD ----------------
  function drawHud(now) {
    // số dây hiện tại (lớn, giữa trên)
    const y = 360;
    fill(380, y - 6, 320, 120, 30, 'rgba(58,36,20,.88)');
    text('SỐ DÂY', 540, y + 24, 22, '#ffd9a8', 900);
    text(fmtN(anim.bands), 540, y + 74, 64, '#fff', 900, 'center', 0, TITLE);
    // trái số + loại
    fill(40, y - 6, 300, 120, 26, 'rgba(255,248,236,.92)');
    text(`TRÁI #${S.melonNo}`, 190, y + 26, 24, '#9a5a22', 900);
    text(S.sizeName, 190, y + 72, 34, S.size === 'thuong' ? C.ink : C.red, 900, 'center', 280, TITLE);
    // đã nổ
    text(`💥 Đã nổ ${fmtN(S.popped)} trái`, 190, y + 150, 26, C.ink, 900);
    // người kế tiếp (ghế nóng)
    const nx = S.next?.[0];
    fill(40, y + 190, 300, 112, 24, 'rgba(255,248,236,.92)');
    text('SỢI TIẾP THEO', 190, y + 214, 18, '#9a5a22', 900);
    if (nx) { avatar(nx, 92, y + 262, 32, hashCol(nx.id)); text(nx.name, 136, y + 262, 24, C.ink, 800, 'left', 196); }
    else text('Bình luận để có sợi!', 190, y + 262, 22, '#9a7a5a', 800);
    if (S.queue > 1) text(`+${fmtN(S.queue - 1)} sợi đang chờ`, 190, y + 320, 22, C.ink, 800);
  }
  function drawHall() {
    if (!S.top?.length && !S.hall?.length) return;
    panel('hall', { x: 700, y: 300 }, () => {
      fill(700, 300, 340, 360, 26, 'rgba(255,248,236,.94)');
      text('💥 BẢNG BÙM', 870, 336, 26, C.red, 900, 'center', 0, TITLE);
      const rows = S.top?.length ? S.top : (S.hall || []).map((h) => ({ ...h.user, pops: 1 }));
      rows.slice(0, 5).forEach((r, i) => {
        const yy = 386 + i * 54;
        text(i + 1, 728, yy, 22, i === 0 ? C.red : '#9a7a5a', 900);
        avatar(r, 768, yy, 20, hashCol(r.id));
        text(r.name, 798, yy, 22, C.ink, 800, 'left', 160);
        text(`${r.pops}🍉`, 1022, yy, 22, C.red, 900, 'right');
      });
      const lastPop = S.hall?.[0];
      if (lastPop) text(`Gần nhất: ${lastPop.user?.name || ''} (${lastPop.bands} sợi)`, 870, 640, 18, '#9a7a5a', 700, 'center', 320);
    });
  }
  function drawGifts(now) {
    const list = (S.powerups || []).filter((p) => ACT[p.action]);
    if (!list.length) return;
    panel('gifts', { x: 40, y: 1500 }, () => {
      const rows = Math.ceil(list.length / 5), ch = 112, h = rows * ch + 20;
      fill(40, 1500, 1000, h, 26, 'rgba(58,36,20,.88)');
      list.forEach((p, i) => {
        const x = 50 + (i % 5) * 196, y = 1510 + Math.floor(i / 5) * ch, a = ACT[p.action];
        if ((anim.hot[p.action] || 0) > now) fill(x + 4, y + 2, 188, ch - 4, 16, 'rgba(255,209,102,.5)');
        text(p.icon, x + 34, y + 36, 34);
        text(p.text, x + 64, y + 36, 18, '#ffd9a8', 800, 'left', 126);
        text(`${a[0]} ${a[1]}`, x + 98, y + 72, 19, '#fff', 800, 'center', 184);
        text(a[2], x + 98, y + 96, 16, 'rgba(255,255,255,.7)', 700, 'center', 184);
      });
    });
  }

  // ---------------- hiệu ứng ----------------
  function explode(sizeK) {
    if (reduced) return;
    const n = Math.round(160 * sizeK);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 300 + Math.random() * 1200;
      const kind = Math.random();
      parts.push({ x: MX + Math.cos(a) * 60, y: MY + Math.sin(a) * 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 400, g: 1600, life: 2 + Math.random(), age: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
        kind: kind < 0.55 ? 'juice' : kind < 0.8 ? 'seed' : 'rind', r: kind < 0.55 ? 8 + Math.random() * 16 : kind < 0.8 ? 6 : 26 + Math.random() * 20, col: kind < 0.55 ? (Math.random() < 0.5 ? C.juice : '#ff8fa3') : C.seed });
    }
  }
  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += dt;
      if (p.age > p.life || p.y > H + 60) { parts.splice(i, 1); continue; }
      p.vy += (p.g || 1200) * dt; p.vx *= 0.995; p.x += p.vx * dt; p.y += p.vy * dt; p.rot = (p.rot || 0) + (p.vr || 0) * dt;
      if (p.y > TABLE && p.vy > 0 && !p.drop && p.kind !== 'rind') { p.y = TABLE; p.vy *= -0.25; p.vx *= 0.6; }
      ctx.save(); ctx.globalAlpha = Math.min(1, (p.life - p.age) * 1.5); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
      if (p.kind === 'seed') { ctx.fillStyle = C.seed; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 1.6, 0, 0, Math.PI * 2); ctx.fill(); }
      else if (p.kind === 'rind') { ctx.fillStyle = C.rind; ctx.beginPath(); ctx.arc(0, 0, p.r, Math.PI, 0); ctx.fill(); ctx.fillStyle = C.flesh; ctx.beginPath(); ctx.arc(0, 0, p.r * 0.72, Math.PI, 0); ctx.fill(); }
      else if (p.kind === 'band') { ctx.strokeStyle = p.col; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.age += dt; if (f.age > f.life) { floaters.splice(i, 1); continue; }
      const k = f.age / f.life;
      ctx.save(); ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
      big(f.text, f.x, f.y - ease(k) * 110, f.size, f.color, '#3a1408');
      ctx.restore();
    }
  }
  function drawTitle(now) {
    const t = anim.title; if (!t) return;
    const age = (now - t.at) / 1000;
    if (age > t.life) { anim.title = null; return; }
    const k = reduced ? 1 : back(Math.min(1, age / 0.28));
    ctx.save(); ctx.globalAlpha = Math.min(1, (t.life - age) / 0.35); ctx.translate(MX, 700); ctx.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k);
    big(t.text, 0, 0, 84, t.color); if (t.sub) big(t.sub, 0, 78, 38, '#fff');
    ctx.restore();
  }
  function drawPop(now) {
    if (S.phase !== 'pop') return;
    const age = (now - anim.popAt) / 1000;
    const k = reduced ? 1 : back(Math.min(1, age / 0.4));
    ctx.save(); ctx.translate(MX, 900); ctx.scale(k, k);
    big(S.popHow === 'dao' ? 'BỔ ĐÔI!' : 'BÙM!!', 0, -170, 170, '#ff3b5c', '#3a0410');
    fill(-330, -60, 660, 250, 34, 'rgba(255,248,236,.96)');
    avatar(S.popper, -210, 64, 82, C.red);
    text(S.popper?.npc ? 'Cô Ba tự làm nổ!' : (S.popper?.name || ''), -100, 20, 40, C.ink, 900, 'left', 400);
    text(S.popHow === 'dao' ? '🔪 bổ đôi trái dưa' : `sợi thứ ${fmtN(anim.bands)} làm nổ`, -100, 74, 28, C.red, 800, 'left', 400);
    text(`Trái #${S.melonNo} · ${S.sizeName}`, -100, 120, 24, '#9a7a5a', 800, 'left', 400);
    ctx.restore();
    text(`Dưa mới sau ${Math.ceil(Math.max(0, S.popLeftMs - (now - recvAt)) / 1000)} giây…`, MX, 1200, 26, C.ink, 800);
  }

  // ---------------- vòng vẽ ----------------
  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!S) { ctx.fillStyle = C.sky0; ctx.fillRect(0, 0, W, H); text('Đang bày dưa…', W / 2, H / 2, 40); return; }
    // nội suy mượt
    const lerp = (a, b, r) => a + (b - a) * Math.min(1, dt * r);
    anim.bands = S.phase === 'pop' ? anim.bands : lerp(anim.bands, S.bands, 14);
    if (Math.abs(anim.bands - S.bands) < 0.05) anim.bands = S.bands;
    anim.tension = lerp(anim.tension, S.phase === 'pop' ? 0 : S.tension, 4);
    anim.size = lerp(anim.size, SIZE_K[S.size] || 1, 5);
    anim.arm = Math.max(0, anim.arm - dt * (S.turboMs > 0 ? 7 : 3));
    anim.shake = Math.max(0, anim.shake - dt * 2.2);
    anim.flash = Math.max(0, anim.flash - dt * 2.5);
    anim.snaps = anim.snaps.filter((s) => now - s.at < 600);
    const sh = reduced ? 0 : anim.shake * 26;
    ctx.save(); ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    drawScene(now);
    drawRinds();
    drawAuntie(now);
    drawMelon(now, dt);
    drawShields();
    drawKnife(now);
    drawParts(dt);
    ctx.restore();
    drawHud(now);
    drawHall();
    drawGifts(now);
    drawTitle(now);
    drawPop(now);
    if (anim.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${anim.flash * 0.7})`; ctx.fillRect(0, 0, W, H); }
    if (S.paused) { ctx.fillStyle = 'rgba(40,20,10,.55)'; ctx.fillRect(0, 0, W, H); big('⏸ TẠM DỪNG', W / 2, H / 2, 96, '#fff'); }
  }
  (document.fonts?.ready || Promise.resolve()).finally(() => { if (!stopped) raf = requestAnimationFrame(frame); });

  return {
    update(s) {
      const now = performance.now();
      if (!S || s.melonNo !== S.melonNo) { anim.melonAt = now; anim.bands = s.bands; }
      if (s.phase === 'pop' && S?.phase !== 'pop') { anim.popAt = now; anim.rinds = s.popped; anim.bands = s.bands; } // nổ: hiện đúng số dây cuối
      if (!S) anim.rinds = Math.max(0, s.popped);
      for (const u of s.next || []) if (u?.avatar) img(u.avatar);
      S = s; recvAt = now;
    },
    effect(fx) {
      const now = performance.now();
      switch (fx.type) {
        case 'bd_band':
          anim.snaps.push({ idx: fx.bands - 1, at: now });
          if (anim.snaps.length > 30) anim.snaps.shift();
          if (!fx.fast) { anim.arm = 1; sound.play('snap'); } else if (Math.random() < 0.35) sound.play('snap', 1.4);
          break;
        case 'bd_queue': if (fx.likes) floaters.push({ text: `❤️ ${fx.by?.name || ''} +${fx.n} sợi`, x: 540, y: 560, size: 34, color: '#ff8fab', life: 1.4, age: 0 }); break;
        case 'bd_gift': {
          const a = ACT[fx.action]; if (!a) break;
          anim.hot[fx.action] = now + 1500;
          const sub = fx.n ? `+${fx.n} sợi` : fx.cut != null ? `−${fx.cut} sợi` : fx.blocked ? 'bị thớt chặn!' : fx.faster ? 'dao rơi nhanh hơn!' : fx.seconds ? `${fx.seconds} giây` : a[2];
          anim.title = { text: `${a[0]} ${a[1].toUpperCase()}`, sub: `${fx.by?.name || ''} · ${sub}`, color: fx.action === 'dao' ? '#ff4d4d' : '#ffd166', at: now, life: 1.8 };
          if (fx.n && !reduced) for (let i = 0; i < Math.min(30, fx.n); i++) parts.push({ kind: 'band', x: 140 + Math.random() * 60, y: 1000, vx: 400 + Math.random() * 500, vy: -500 - Math.random() * 400, g: 1400, r: 18, col: BAND_COLS[i % BAND_COLS.length], life: 0.9, age: 0, rot: 0, vr: 8 });
          if (fx.action === 'keo') anim.cut = 1;
          sound.play(fx.action === 'dao' ? 'knife' : fx.action === 'turbo' ? 'turbo' : fx.action === 'keo' ? 'cut' : 'gift');
          break;
        }
        case 'bd_block': floaters.push({ text: '🪵 CHẶN!', x: MX, y: MY - RY - 120, size: 64, color: '#ffd166', life: 1.6, age: 0 }); sound.play('block'); break;
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

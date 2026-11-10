// Renderer canvas của Deadline Dí (khung dọc 1080×1920, chừa ~150px trên cho giao diện TikTok).
// Bố cục theo kiểu game văn phòng: thẻ NHIỆM VỤ + ô DEADLINE ở trên; chế độ camera để trống giữa màn hình cho camera
// (thông báo sếp ping bên trái, bảng quà bên phải); chế độ máy tính vẽ một cửa sổ máy tính giả để streamer gõ / bấm.
// Không đụng DOM khi import. mount() nhận thêm input(ev) (đầu vào tại chỗ) — có thì bật gõ phím / bấm chuột.
const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const TITLE = "'Baloo 2', 'Be Vietnam Pro', system-ui, sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, monospace";
const C = {
  panel: 'rgba(28,27,33,.93)', edge: 'rgba(255,255,255,.09)', text: '#ffffff', dim: 'rgba(255,255,255,.66)', faint: 'rgba(255,255,255,.35)',
  pink: '#f9a8c0', green: '#86efac', bar0: '#22c55e', bar1: '#bef264', red: '#e11d48', redSoft: '#fb7185', wine: 'rgba(118,20,38,.93)',
  gold: 'rgba(214,178,72,.62)', ink: '#1d1b22', ink2: '#5b5866', paper: '#ffffff', line: '#e7e5ee', blue: '#2f6bff', purple: '#6d28d9',
  harm: '#ffc1bd', help: '#b9f6ca', warn: '#fde68a',
};
export const ACT = {
  ping: { icon: '🔔', name: 'Sếp ping', title: 'SẾP PING!', color: '#ff6b5e' },
  soi: { icon: '👀', name: 'Sếp đến soi', title: 'SẾP ĐẾN SOI!', color: '#ff6b5e' },
  ban: { icon: '🎯', name: 'Ném bút bi', title: 'BỊ NÉM!', color: '#ff6b5e' },
  mayin: { icon: '🖨️', name: 'Kẹt máy in', title: 'KẸT MÁY IN!', color: '#ff6b5e' },
  buzz: { icon: '🗣️', name: 'Sếp nói trend', title: 'SẾP NÓI TREND!', color: '#ff6b5e' },
  hop: { icon: '🚨', name: 'Họp đột xuất', title: 'HỌP ĐỘT XUẤT!', color: '#ff6b5e' },
  cattg: { icon: '📄', name: 'Cắt giảm nhân sự', title: 'CẮT GIẢM NHÂN SỰ!', color: '#ff4d6d' },
  virus: { icon: '👾', name: 'Dính virus', title: 'DÍNH VIRUS!', color: '#ff6b5e' },
  lamlai: { icon: '🔁', name: 'Sửa chút: làm lại', title: 'LÀM LẠI TỪ ĐẦU!', color: '#ff6b5e' },
  cafe: { icon: '☕', name: 'Cà phê sữa đá', title: 'CÀ PHÊ SỮA ĐÁ!', color: '#5eea8f' },
  giahan: { icon: '📅', name: 'Gia hạn deadline', title: 'GIA HẠN DEADLINE!', color: '#5eea8f' },
  intern: { icon: '🧑‍💼', name: 'Thực tập sinh làm hộ', title: 'CÓ NGƯỜI GÁNH!', color: '#5eea8f' },
  thangchuc: { icon: '🏆', name: 'Thăng chức', title: 'THĂNG CHỨC!', color: '#ffd84d' },
};
const STATUS = { soi: ['👀', 'Sếp đang soi'], mayin: ['🖨️', 'Máy in kẹt'], hop: ['🚨', 'Đang họp'], buzz: ['🗣️', 'Đọc to câu sếp'], virus: ['👾', 'Máy dính virus'] };
const COINS = { rose: 1, 'finger heart': 5, doughnut: 30, perfume: 20, 'hat and mustache': 99, 'money gun': 500, galaxy: 1000, corgi: 299, cap: 99, 'heart me': 1, 'hand hearts': 100, sunglasses: 199, lion: 29999, 'ice cream cone': 1, tiktok: 1, gg: 1 };
const MOOD = { shock: '😱', cry: '😭', dizzy: '😵', angry: '😤', skull: '💀', happy: '🥳', rich: '🤑' };
const APPS = { mail: ['✉️', 'Mail'], inbox: ['📥', 'Hộp thư'], sheet: ['📊', 'Bảng tính'], files: ['📁', 'File'] };
const FOLDER = [['anh', '🖼️', 'Ảnh'], ['tailieu', '📄', 'Tài liệu'], ['rac', '🗑️', 'Thùng rác']];
const TOP = 150;

export function mount(el, { canvas, options = {}, input = null } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let S = null, recvAt = 0, raf = 0, stopped = false, last = performance.now();
  const anim = { phaseAt: 0, phaseKey: '', title: null, shake: 0, hot: {}, pingAt: new Map(), stepAt: 0, wrongAt: 0, soiAt: 0 };
  const memes = []; let meme = null, clipEl = null;
  const floaters = [], confetti = [];
  let hits = [];
  const sound = makeSound(!!options.mute);
  const images = new Map();

  // font tiêu đề tròn đậm (có tiếng Việt)
  if (typeof document !== 'undefined' && !document.getElementById('dd-font')) {
    const l = document.createElement('link');
    l.id = 'dd-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap';
    document.head.append(l);
  }
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

  // ---------------- tiện ích ----------------
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fill(x, y, w, h, r, color) { rr(x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); }
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
  /** Chữ lớn viền đậm kiểu game (chữ tiêu đề). */
  function bigText(s, x, y, size, color, stroke = '#2a0a12', maxW = W - 80) {
    let sz = size;
    while (sz > 30 && measure(s, sz, 800, TITLE) > maxW) sz -= 4;
    ctx.font = `800 ${sz}px ${TITLE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, sz * 0.16); ctx.strokeStyle = stroke; ctx.strokeText(s, x, y + sz * 0.06);
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

  // ---------------- HUD trên: NHIỆM VỤ + DEADLINE ----------------
  function drawHud(now) {
    const x = 24, y = TOP, w = 776, h = 156;
    fill(x, y, w, h, 26, C.panel); rr(x, y, w, h, 26); ctx.strokeStyle = C.edge; ctx.lineWidth = 2; ctx.stroke();
    text('NHIỆM VỤ', x + 30, y + 34, 22, C.pink, 800, 'left');
    const rk = `👔 ${S.rank.name}`;
    const rw = measure(rk, 22, 800) + 28;
    fill(x + w - rw - 20, y + 16, rw, 38, 19, 'rgba(255,255,255,.1)');
    text(rk, x + w - rw / 2 - 20, y + 36, 22, '#fde68a', 800);
    text(S.task.name, x + 30, y + 80, 33, C.text, 800, 'left', w - 60);
    const bx = x + 30, by = y + 112, bw = w - 190, bh = 24;
    fill(bx, by, bw, bh, 12, 'rgba(255,255,255,.12)');
    const k = Math.max(0, Math.min(1, S.step / S.steps));
    if (k > 0) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, C.bar0); g.addColorStop(1, C.bar1);
      fill(bx, by, Math.max(bh, bw * k), bh, 12, g);
    }
    const pop = 1 + 0.35 * Math.max(0, 1 - (now - anim.stepAt) / 350);
    ctx.save(); ctx.translate(x + w - 82, by + 12); ctx.scale(pop, pop);
    text(`${S.step}/${S.steps}`, 0, 0, 40, C.bar1, 900);
    ctx.restore();
    // DEADLINE
    const dx = 816, dw = 240;
    fill(dx, y, dw, h, 26, C.panel); rr(dx, y, dw, h, 26); ctx.strokeStyle = C.edge; ctx.lineWidth = 2; ctx.stroke();
    text('DEADLINE', dx + dw / 2, y + 34, 22, C.dim, 800);
    const ms = S.phase === 'work' ? left(S.remainingMs, now) : S.phase === 'brief' ? S.deadlineMs : S.result?.leftMs || 0;
    const urgent = S.phase === 'work' && ms < 30_000;
    const pulse = urgent && !reduced ? 1 + 0.06 * Math.sin(now / 90) : 1;
    ctx.save(); ctx.translate(dx + dw / 2, y + 100); ctx.scale(pulse, pulse);
    text(clock(ms), 0, 0, 76, urgent ? '#ff5470' : C.text, 900, 'center', 0, TITLE);
    ctx.restore();
    if (S.streak > 1) text(`🔥 ${S.streak} ca liền`, dx + dw / 2, y + h + 26, 22, '#fdba74', 800);
  }

  function drawChips(now, x, y, maxW) {
    let cx = x, cy = y;
    for (const s of S.status || []) {
      const [ic, name] = STATUS[s.kind] || ['⏱️', s.kind];
      const label = `${ic} ${name} ${Math.ceil(left(s.leftMs, now) / 1000)}s`;
      const w = measure(label, 26, 800) + 40;
      if (cx + w > x + maxW) { cx = x; cy += 60; }
      fill(cx, cy, w, 50, 25, C.wine);
      text(label, cx + w / 2, cy + 26, 26, '#fff', 800);
      cx += w + 12;
    }
    return cy + 60;
  }

  // ---------------- bảng quà ----------------
  const giftOf = (p) => [p.trigger?.giftName, ...(p.trigger?.gifts || [])].find(Boolean);
  function coinsOf(p) { const g = giftOf(p); return g ? COINS[String(g).toLowerCase()] : null; }
  function giftList(now, x, y, w) { // cột phải (chế độ camera)
    const list = (S.powerups || []).filter((p) => ACT[p.action]);
    const rowH = 64, h = list.length * rowH + 20;
    fill(x, y, w, h, 24, 'rgba(28,27,33,.82)');
    list.forEach((p, i) => {
      const ry = y + 10 + i * rowH, a = ACT[p.action];
      if ((anim.hot[p.action] || 0) > now) fill(x + 8, ry + 2, w - 16, rowH - 4, 16, C.gold);
      text(p.icon, x + 44, ry + 26, 34);
      const c = coinsOf(p);
      const sub = p.trigger?.type === 'gift' ? `${p.text}${c ? ` · ${fmtN(c)} xu` : ''}` : p.text;
      text(`${a.icon} ${a.name}`, x + 84, ry + 22, 23, HELP_SET.has(p.action) ? C.help : C.harm, 800, 'left', w - 96);
      text(sub, x + 84, ry + 47, 17, C.dim, 700, 'left', w - 96);
    });
    return y + h;
  }
  function giftGrid(now, x, y, w) { // lưới dưới (chế độ máy tính)
    const list = (S.powerups || []).filter((p) => ACT[p.action]);
    const cols = 5, cw = (w - 20) / cols, ch = 104, rows = Math.ceil(list.length / cols);
    const h = rows * ch + 20;
    fill(x, y, w, h, 24, 'rgba(28,27,33,.88)');
    list.forEach((p, i) => {
      const cx = x + 10 + (i % cols) * cw, cy = y + 10 + Math.floor(i / cols) * ch, a = ACT[p.action];
      if ((anim.hot[p.action] || 0) > now) fill(cx + 4, cy + 2, cw - 8, ch - 4, 16, C.gold);
      text(p.icon, cx + cw / 2, cy + 28, 36);
      const c = coinsOf(p);
      const tag = p.trigger?.type === 'gift' ? (c ? `${fmtN(c)} xu` : p.text) : p.text;
      const tw = measure(tag, 15, 800) + 16;
      fill(cx + cw / 2 - tw / 2, cy + 46, tw, 22, 11, 'rgba(0,0,0,.55)');
      text(tag, cx + cw / 2, cy + 58, 15, '#fde68a', 800, 'center', cw - 10);
      text(`${a.icon} ${a.name}`, cx + cw / 2, cy + 86, 18, HELP_SET.has(p.action) ? C.help : C.harm, 800, 'center', cw - 8);
    });
    return y + h;
  }

  // ---------------- dòng hoạt động ----------------
  function drawFeed(now, x, yBottom) {
    const rows = (S.feed || []).filter((f) => f.ageMs + (now - recvAt) < 14_000).slice(-3);
    rows.forEach((f, i) => {
      const y = yBottom - (rows.length - i) * 74;
      const a = ACT[f.action]; if (!a) return;
      const age = f.ageMs + (now - recvAt);
      ctx.save(); ctx.globalAlpha = Math.min(1, (14_000 - age) / 1500);
      const label = `${f.by.name}: ${a.name}${f.n > 1 ? ` ×${f.n}` : ''}`;
      const w = Math.min(660, measure(label, 26, 700) + 150);
      fill(x, y, w, 62, 31, C.wine);
      avatar(f.by, x + 32, y + 31, 24);
      text(a.icon, x + 82, y + 32, 28);
      text(label, x + 112, y + 32, 26, '#fff', 700, 'left', w - 128);
      ctx.restore();
    });
  }

  // ---------------- thông báo sếp ping (camera) ----------------
  function pingCard(p, x, y, w, now, closable) {
    const h = 112;
    const at = anim.pingAt.get(p.id) ?? now;
    const k = reduced ? 1 : back(Math.min(1, (now - at) / 320));
    ctx.save(); ctx.translate((1 - k) * -80, 0); ctx.globalAlpha = Math.min(1, k + 0.2);
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    fill(x, y, w, h, 18, C.paper); ctx.shadowColor = 'transparent';
    fill(x, y, 9, h, 4, p.soi ? C.red : C.purple);
    avatar(p.by, x + 60, y + h / 2, 34, null);
    const name = p.soi ? `Sếp ${p.by.name}` : p.by.name;
    const nw = text(name, x + 110, y + 34, 27, C.ink, 800, 'left', w - 230);
    text('vừa xong', x + 122 + nw, y + 36, 19, '#8b8796', 600, 'left');
    if (p.waiting) {
      const dots = '•••'.slice(0, 1 + Math.floor(now / 300) % 3);
      text(`đang gõ ${dots}`, x + 110, y + 76, 27, '#8b8796', 600, 'left');
    } else text(p.text, x + 110, y + 76, 28, C.ink, 600, 'left', w - 130 - (closable ? 50 : 0));
    if (closable) {
      fill(x + w - 64, y + 18, 46, 46, 12, '#efedf3');
      text('✕', x + w - 41, y + 42, 24, C.ink, 800);
      hit(x + w - 74, y + 8, 66, 66, { type: 'click', target: 'ping', id: p.id });
    }
    ctx.restore();
    return h;
  }
  function drawCameraPings(now, yStart) {
    const list = (S.pings || []).slice(-4).reverse();
    let y = yStart;
    list.forEach((p, i) => {
      pingCard(p, 24, y, 650, now, false);
      if (i === 0 && S.pings.length > 0) { ctx.beginPath(); ctx.arc(24 + 644, y + 6, 20, 0, Math.PI * 2); ctx.fillStyle = C.red; ctx.fill(); text(S.pings.length, 24 + 644, y + 7, 22, '#fff', 900); }
      y += 126;
    });
    return y;
  }

  // ---------------- sếp ló đầu ----------------
  function bossHead(cx, cy, r, by, now) {
    // vai áo + cà vạt
    ctx.fillStyle = '#2b2f3a'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.75, r * 1.5, r * 0.95, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - r * 0.35, cy + r * 0.85); ctx.lineTo(cx + r * 0.35, cy + r * 0.85); ctx.lineTo(cx, cy + r * 1.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(cx - r * 0.12, cy + r * 0.9); ctx.lineTo(cx + r * 0.12, cy + r * 0.9); ctx.lineTo(cx + r * 0.18, cy + r * 1.55); ctx.lineTo(cx, cy + r * 1.75); ctx.lineTo(cx - r * 0.18, cy + r * 1.55); ctx.closePath(); ctx.fill();
    // mặt: ảnh người tặng (nếu có) hoặc mặt vẽ
    const im = by?.avatar ? img(by.avatar) : null;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (im) { ctx.clip(); ctx.drawImage(im, cx - r, cy - r, r * 2, r * 2); ctx.restore(); }
    else {
      ctx.fillStyle = '#f2c39b'; ctx.fill(); ctx.restore();
      ctx.fillStyle = '#3b2a20'; ctx.beginPath(); ctx.arc(cx, cy - r * 0.35, r * 0.92, Math.PI * 1.08, Math.PI * 1.92); ctx.fill();
      const look = Math.sin(now / 700) * r * 0.08;
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(cx + s * r * 0.36, cy + r * 0.02, r * 0.2, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx + s * r * 0.36 + look, cy + r * 0.04, r * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#111'; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.moveTo(cx + s * r * 0.18, cy - r * 0.22 + (s > 0 ? 0 : 0)); ctx.lineTo(cx + s * r * 0.56, cy - r * 0.3); ctx.stroke();
        ctx.lineWidth = r * 0.05; ctx.beginPath(); ctx.ellipse(cx + s * r * 0.36, cy + r * 0.02, r * 0.26, r * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#7a3b2e'; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.moveTo(cx - r * 0.22, cy + r * 0.5); ctx.lineTo(cx + r * 0.22, cy + r * 0.46); ctx.stroke();
    }
    ctx.lineWidth = 6; ctx.strokeStyle = '#1d1b22'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  function redFrame(now, x, y, w, h, r) {
    const a = reduced ? 0.8 : 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(now / 160));
    rr(x, y, w, h, r); ctx.strokeStyle = `rgba(239,35,60,${a})`; ctx.lineWidth = 12; ctx.stroke();
  }

  // ---------------- máy tính giả lập ----------------
  const WIN = { x: 24, y: TOP + 186, w: 1032, h: 880 };
  function drawDesktopBg() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#d6dbe1'); g.addColorStop(0.62, '#c3cad2'); g.addColorStop(0.62, '#8a7258'); g.addColorStop(1, '#6b5641');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (let x = 60; x < W; x += 150) ctx.fillRect(x, 0, 6, H * 0.62);
  }
  function caret(now) { return Math.floor(now / 500) % 2 === 0 ? '|' : ''; }
  function field(x, y, w, h, typed, placeholder, now, key, size = 34) {
    rr(x, y, w, h, 14); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.blue; ctx.lineWidth = 4; ctx.stroke();
    if (typed) {
      ctx.save(); rr(x + 4, y + 4, w - 8, h - 8, 10); ctx.clip();
      const lines = wrap(typed, size, w - 44, 700);
      const shown = lines.slice(-Math.max(1, Math.floor((h - 20) / (size * 1.3))));
      shown.forEach((ln, i) => text(ln + (i === shown.length - 1 ? caret(now) : ''), x + 22, y + 10 + size * 0.75 + i * size * 1.3, size, C.ink, 700, 'left'));
      ctx.restore();
    } else text(placeholder + caret(now), x + 22, y + h / 2, size * 0.85, '#9a97a6', 600, 'left', w - 40);
    activeField = { x, y, w, h, key, typed: typed || '' };
  }
  function button(x, y, w, h, label, color, ev, size = 26, ink = '#fff') {
    fill(x, y, w, h, 14, color);
    text(label, x + w / 2, y + h / 2 + 1, size, ink, 800, 'center', w - 12);
    if (ev) hit(x, y, w, h, ev);
  }

  function drawJob(now, x, y, w, h) {
    const j = S.job;
    if (!j) { text('Đang mở việc mới…', x + w / 2, y + h / 2, 34, C.ink2, 700); return; }
    if (j.kind === 'mail') {
      text('Thư mới', x + 36, y + 50, 42, C.ink, 900, 'left');
      text('Tới: Sếp', x + 36, y + 102, 26, C.ink, 700, 'left');
      text('Tiêu đề: RE: RE: RE: Cập nhật nhanh', x + 36, y + 142, 24, '#8b8796', 600, 'left');
      ctx.fillStyle = C.line; ctx.fillRect(x + 36, y + 170, w - 72, 2);
      fill(x + 36, y + 196, w - 72, 150, 14, '#f3f2f7');
      wrap(j.text, 36, w - 120, 800).slice(0, 3).forEach((ln, i) => text(ln, x + 60, y + 236 + i * 46, 36, '#57536a', 800, 'left'));
      field(x + 36, y + 372, w - 72, 150, j.typed, 'Gõ lại câu trên…', now, `j${j.id}`);
      text('Gõ lại câu trên cho đúng rồi Enter', x + 36, y + h - 46, 22, '#8b8796', 600, 'left');
      button(x + w - 186, y + h - 76, 150, 56, 'Gửi ➤', '#eef0ff', { type: 'click', target: 'send' }, 24, C.ink);
    } else if (j.kind === 'sheet') {
      text('Bảng tính: Doanh thu', x + 36, y + 50, 40, C.ink, 900, 'left');
      const gx = x + 36, gy = y + 100, cw = w - 72, rh = 70;
      j.nums.forEach((n, i) => {
        fill(gx, gy + i * rh, 90, rh - 6, 8, '#eef7ee'); text(`A${i + 1}`, gx + 45, gy + i * rh + 32, 24, '#3f7a4a', 800);
        fill(gx + 98, gy + i * rh, cw - 98, rh - 6, 8, '#f6f6f9'); text(fmtN(n), gx + cw - 30, gy + i * rh + 32, 34, C.ink, 800, 'right');
      });
      const ty = gy + j.nums.length * rh + 10;
      text('TỔNG =', gx + 10, ty + 54, 34, '#3f7a4a', 900, 'left');
      field(gx + 170, ty + 4, cw - 170, 100, j.typed, 'Gõ tổng…', now, `j${j.id}`, 40);
      text('Cộng các ô rồi Enter', x + 36, y + h - 46, 22, '#8b8796', 600, 'left');
      button(x + w - 186, y + h - 76, 150, 56, 'Xong ➤', '#eef0ff', { type: 'click', target: 'send' }, 24, C.ink);
    } else if (j.kind === 'inbox') {
      text('Hộp thư: Lưu hay Spam?', x + 36, y + 50, 40, C.ink, 900, 'left');
      j.mails.forEach((m, i) => {
        const ry = y + 100 + i * 118;
        fill(x + 36, ry, w - 72, 104, 14, m.done ? '#f1f1f4' : '#f7f6fb');
        text(m.from, x + 62, ry + 34, 26, m.done ? '#a3a0ad' : C.ink, 800, 'left', w - 420);
        text(m.subject, x + 62, ry + 72, 24, m.done ? '#b4b1bd' : '#57536a', 600, 'left', w - 420);
        if (m.done) text('✓ Xong', x + w - 120, ry + 52, 26, '#16a34a', 800);
        else {
          button(x + w - 330, ry + 22, 130, 60, 'Lưu', '#16a34a', { type: 'click', target: 'inbox', id: i, value: 'keep' });
          button(x + w - 186, ry + 22, 130, 60, 'Spam', C.red, { type: 'click', target: 'inbox', id: i, value: 'spam' });
        }
      });
      text('Thư rác bấm Spam, thư công việc bấm Lưu', x + 36, y + h - 46, 22, '#8b8796', 600, 'left');
    } else {
      text('Dọn file vào đúng thư mục', x + 36, y + 50, 40, C.ink, 900, 'left');
      const tw = (w - 72 - 20) / 2;
      j.files.forEach((f, i) => {
        const fx = x + 36 + (i % 2) * (tw + 20), fy = y + 96 + Math.floor(i / 2) * 120;
        const sel = j.sel === i;
        fill(fx, fy, tw, 104, 14, f.done ? '#f1f1f4' : sel ? '#dbe6ff' : '#f7f6fb');
        if (sel) { rr(fx, fy, tw, 104, 14); ctx.strokeStyle = C.blue; ctx.lineWidth = 4; ctx.stroke(); }
        const ext = f.name.split('.').pop();
        text(f.done ? '✅' : /jpg|png|gif/.test(ext) ? '🖼️' : /exe|bat|scr/.test(ext) ? '⚠️' : '📄', fx + 46, fy + 52, 38);
        text(f.name, fx + 84, fy + 52, 24, f.done ? '#a3a0ad' : C.ink, 700, 'left', tw - 100, MONO);
        if (!f.done) hit(fx, fy, tw, 104, { type: 'click', target: 'file', id: i });
      });
      const fy = y + 96 + 2 * 120 + 24, fw = (w - 72 - 40) / 3;
      FOLDER.forEach(([id, ic, name], i) => {
        const bx = x + 36 + i * (fw + 20);
        fill(bx, fy, fw, 120, 16, j.sel != null ? '#fff4d6' : '#f3f2f7');
        rr(bx, fy, fw, 120, 16); ctx.strokeStyle = j.sel != null ? '#f59e0b' : '#e2e0ea'; ctx.lineWidth = 3; ctx.stroke();
        text(ic, bx + fw / 2, fy + 44, 40); text(name, bx + fw / 2, fy + 92, 24, C.ink, 800);
        hit(bx, fy, fw, 120, { type: 'click', target: 'folder', id });
      });
      text(j.sel != null ? 'Giờ bấm thư mục đúng' : 'Bấm 1 file rồi bấm thư mục đúng', x + 36, y + h - 46, 22, '#8b8796', 600, 'left');
    }
  }

  function drawBlocker(now, x, y, w, h) {
    const b = S.blocker;
    if (b.kind === 'virus') {
      const vx = x + 30, vy = y + 30, vw = w - 60, vh = h - 60;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30; fill(vx, vy, vw, vh, 18, '#fff'); ctx.restore();
      rr(vx, vy, vw, vh, 18); ctx.strokeStyle = '#c81e3a'; ctx.lineWidth = 6; ctx.stroke();
      fill(vx, vy, vw, 78, 18, '#c81e3a'); ctx.fillStyle = '#c81e3a'; ctx.fillRect(vx, vy + 50, vw, 28);
      text('🛡️ Diệt virus', vx + 30, vy + 40, 34, '#fff', 900, 'left');
      const n = b.threats.filter((t) => !t.removed).length;
      text(`⚠ ${n} mối đe doạ — máy không làm việc được`, vx + 30, vy + 118, 26, '#c81e3a', 800, 'left', vw - 60);
      b.threats.forEach((t, i) => {
        const ry = vy + 160 + i * 84;
        fill(vx + 24, ry, vw - 48, 72, 12, t.removed ? '#f1f1f4' : '#fff1f2');
        text(t.removed ? '✅' : '☣️', vx + 62, ry + 37, 30);
        text(t.name, vx + 100, ry + 37, 26, t.removed ? '#a3a0ad' : C.ink, 700, 'left', vw - 330, MONO);
        if (!t.removed) button(vx + vw - 196, ry + 10, 150, 52, 'Xoá', '#c81e3a', { type: 'click', target: 'virus', id: i });
        else text('Đã xoá', vx + vw - 120, ry + 37, 24, '#16a34a', 800);
      });
    } else if (b.kind === 'jam') {
      const jx = x + 120, jy = y + 110, jw = w - 240, jh = h - 220;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30; fill(jx, jy, jw, jh, 22, '#fffbeb'); ctx.restore();
      rr(jx, jy, jw, jh, 22); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 6; ctx.stroke();
      text('Máy in kẹt giấy!', jx + jw / 2, jy + 70, 44, '#92400e', 900, 'center', 0, TITLE);
      const sh = reduced ? 0 : Math.sin(now / 40) * 6;
      text('🖨️', jx + jw / 2 + sh, jy + 210, 150);
      text(`bởi ${b.by?.name || 'sếp'}`, jx + jw / 2, jy + 330, 24, '#b45309', 700);
      button(jx + 60, jy + jh - 130, jw - 120, 96, `Gỡ kẹt (${b.left})`, '#f59e0b', { type: 'click', target: 'jam' }, 38, '#3b1d00');
    } else {
      const bx = x + 30, by2 = y + 120, bw = w - 60, bh = h - 240;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30; fill(bx, by2, bw, bh, 20, '#fff'); ctx.restore();
      rr(bx, by2, bw, bh, 20); ctx.strokeStyle = C.blue; ctx.lineWidth = 6; ctx.stroke();
      text('# general', bx + 30, by2 + 46, 28, C.blue, 900, 'left');
      avatar(b.by, bx + 60, by2 + 112, 30, null);
      text(`Sếp ${b.by?.name || ''}`, bx + 104, by2 + 96, 28, C.ink, 800, 'left', bw - 140);
      text('muốn câu này trong chat team, đúng từng chữ:', bx + 104, by2 + 132, 23, '#6b6878', 600, 'left', bw - 140);
      wrap(`“${b.phrase}”`, 40, bw - 80, 800, TITLE).slice(0, 2).forEach((ln, i) => text(ln, bx + 40, by2 + 204 + i * 50, 40, C.ink, 800, 'left', 0, TITLE));
      field(bx + 30, by2 + bh - 170, bw - 60, 110, b.typed, 'Gõ vào đây rồi Enter', now, `b${b.id}`, 32);
      button(bx + bw - 180, by2 + bh - 52, 150, 40, 'Gửi ➤', '#eef0ff', { type: 'click', target: 'send' }, 22, C.ink);
    }
    if (S.queued) text(`+${S.queued} việc sếp giao đang chờ`, x + w - 6, y + h + 15, 20, '#fff', 800, 'right');
  }

  function drawMeeting(now, x, y, w, h) {
    fill(x, y, w, h, 0, '#14141b');
    const st = statusOf('hop');
    text(`📅 Họp đột xuất — còn ${clock(left(st?.leftMs || 0, now))}`, x + w / 2, y + 56, 34, '#fff', 800);
    const people = [st?.by || { name: 'Sếp' }, { name: 'Sếp tổng' }, { name: 'Trưởng phòng' }, { name: 'Kế toán' }];
    const tw = (w - 90) / 2, th = (h - 200) / 2;
    people.forEach((p, i) => {
      const tx = x + 30 + (i % 2) * (tw + 30), ty = y + 110 + Math.floor(i / 2) * (th + 24);
      fill(tx, ty, tw, th, 16, '#262633');
      const talk = !reduced && i === Math.floor(now / 1400) % 4;
      if (talk) { rr(tx, ty, tw, th, 16); ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 5; ctx.stroke(); }
      avatar(p, tx + tw / 2, ty + th / 2 - 16, 62, null);
      text(p.name, tx + tw / 2, ty + th - 30, 24, '#fff', 700, 'center', tw - 20);
      if (talk) text('🎤 đang nói…', tx + 20, ty + 30, 20, '#86efac', 700, 'left');
    });
    text('Không làm được gì cho tới khi họp xong 😩', x + w / 2, y + h - 34, 24, C.dim, 700);
  }

  function drawDesktop(now) {
    const { x, y, w, h } = WIN;
    const sh = anim.shake > 0 && !reduced ? (Math.random() - 0.5) * 30 * anim.shake : 0;
    const soi = statusOf('soi');
    ctx.save(); ctx.translate(sh, 0);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; fill(x, y, w, h, 26, '#24232b'); ctx.restore();
    // thanh tiêu đề
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.beginPath(); ctx.arc(x + 38 + i * 34, y + 32, 11, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); });
    const app = APPS[S.job?.kind] || ['🖥️', 'Máy tính'];
    const title = S.blocker?.kind === 'virus' ? '🛡️ Diệt virus' : S.blocker?.kind === 'buzz' ? '💬 Chat team' : S.blocker?.kind === 'jam' ? '🖨️ Máy in' : `${app[0]} ${app[1]}`;
    text(title, x + 160, y + 33, 26, '#fff', 800, 'left');
    if (S.status?.length) { // chip trạng thái nằm gọn trên thanh tiêu đề
      let cx = x + w - 20;
      for (const st of S.status.slice().reverse()) {
        const [ic, name] = STATUS[st.kind] || ['⏱️', st.kind];
        const label = `${ic} ${name} ${Math.ceil(left(st.leftMs, now) / 1000)}s`;
        const cw = measure(label, 22, 800) + 30;
        if (cx - cw < x + 420) break;
        cx -= cw; fill(cx, y + 11, cw, 44, 22, C.wine); text(label, cx + cw / 2, y + 34, 22, '#fff', 800); cx -= 10;
      }
    } else text(S.task.file, x + w - 30, y + 33, 20, C.faint, 600, 'right', 420, MONO);
    // vùng làm việc
    const ix = x + 16, iy = y + 64, iw = w - 32, ih = h - 64 - 96;
    ctx.save(); rr(ix, iy, iw, ih, 12); ctx.clip();
    const g = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih); g.addColorStop(0, '#5b6cf7'); g.addColorStop(1, '#a855f7');
    ctx.fillStyle = g; ctx.fillRect(ix, iy, iw, ih);
    const cx = ix + 30, cy = iy + 28, cw = iw - 60, ch = ih - 56;
    if (S.phase === 'work') {
      if (statusOf('hop')) drawMeeting(now, ix, iy, iw, ih);
      else {
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.2)'; ctx.shadowBlur = 20; fill(cx, cy, cw, ch, 18, '#fff'); ctx.restore();
        if (S.blocker) { ctx.save(); ctx.globalAlpha = 0.25; drawJob(now, cx, cy, cw, ch); ctx.restore(); hits = hits.filter((hh) => hh.ev.target === 'ping'); activeField = null; drawBlocker(now, cx, cy, cw, ch); }
        else drawJob(now, cx, cy, cw, ch);
      }
    } else {
      fill(cx, cy, cw, ch, 18, 'rgba(255,255,255,.92)');
      text(S.phase === 'brief' ? 'Chuẩn bị vào ca…' : 'Hết ca', cx + cw / 2, cy + ch / 2, 40, C.ink2, 800);
    }
    ctx.restore();
    // dock
    const keys = ['mail', 'inbox', 'sheet', 'files'];
    keys.forEach((k2, i) => {
      const dx = x + w / 2 - 2 * 92 + i * 92 + 6;
      if (S.job?.kind === k2) fill(dx, y + h - 86, 80, 76, 16, 'rgba(255,255,255,.16)');
      text(APPS[k2][0], dx + 40, y + h - 48, 42);
    });
    if (soi) redFrame(now, x, y, w, h, 26);
    ctx.restore();
    // sếp ló đầu từ mép phải màn hình
    if (soi) {
      const k = reduced ? 1 : ease((now - anim.soiAt) / 500);
      const hx = W + 120 - 200 * k, hy = y + 470 + (reduced ? 0 : Math.sin(now / 500) * 6);
      bossHead(hx, hy, 110, soi.by, now);
      const bub = '👀 Đang làm gì đấy?';
      const bw = measure(bub, 28, 800) + 44;
      fill(hx - 150 - bw, hy - 150, bw, 64, 32, '#fff');
      text(bub, hx - 150 - bw / 2, hy - 117, 28, C.ink, 800);
    }
    // popup sếp ping che lên màn hình (bấm ✕ mới đóng)
    const covers = S.phase === 'work' && S.pings?.length;
    if (covers) { hits = hits.filter(() => false); activeField = null; }
    for (const p of S.pings || []) {
      const px = x + 40 + ((p.id * 97) % 420), py = y + 110 + ((p.id * 61) % 560);
      pingCard(p, px, py, 540, now, true);
    }
  }

  // ---------------- chữ lớn + meme ----------------
  function drawTitle(now, cy) {
    const t = anim.title; if (!t || S.phase === 'result') return;
    const age = (now - t.at) / 1000;
    if (age > t.life) { anim.title = null; return; }
    const k = reduced ? 1 : back(Math.min(1, age / 0.28));
    const fade = Math.min(1, (t.life - age) / 0.35);
    ctx.save(); ctx.globalAlpha = fade; ctx.translate(W / 2, cy); ctx.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k);
    bigText(t.text, 0, 0, 110, t.color);
    if (t.by) bigText(`bởi ${t.by}`, 0, 92, 44, '#fff', '#1a1a22');
    if (t.sub) bigText(t.sub, 0, 150, 34, '#fde68a', '#1a1a22', W - 120);
    ctx.restore();
  }

  function startMeme(now) {
    if (meme || !memes.length || (anim.title && (now - anim.title.at) < 900)) return;
    meme = { ...memes.shift(), at: now };
    meme.life = 3;
    if (meme.clip && typeof document !== 'undefined') {
      const gif = /\.gif(\?|#|$)/i.test(meme.clip);
      const m = document.createElement(gif ? 'img' : 'video');
      Object.assign(m.style, { position: 'absolute', zIndex: 6, objectFit: 'contain', background: 'rgba(0,0,0,.6)', borderRadius: '18px', pointerEvents: 'none' });
      m.referrerPolicy = 'no-referrer';
      const fail = () => { if (clipEl === m) { m.remove(); clipEl = null; meme.clip = null; meme.life = 3; meme.at = performance.now(); } };
      m.onerror = fail;
      if (!gif) {
        m.playsInline = true; m.muted = !!options.mute; m.src = meme.clip;
        m.onended = () => { if (meme && clipEl === m) meme.life = (performance.now() - meme.at) / 1000; };
        m.play?.().catch(() => { m.muted = true; m.play?.().catch(fail); });
      } else m.src = meme.clip;
      clipEl = m; el.append(m); placeClip();
      meme.life = 6;
    }
    sound.play(meme.mood);
  }
  function placeClip() {
    if (!clipEl) return;
    const s = canvas.clientWidth / W;
    Object.assign(clipEl.style, { left: `${canvas.offsetLeft + 90 * s}px`, top: `${canvas.offsetTop + 470 * s}px`, width: `${900 * s}px`, height: `${640 * s}px` });
  }
  function drawMeme(now, dt) {
    startMeme(now);
    if (!meme) return;
    const age = (now - meme.at) / 1000;
    if (age > meme.life) { meme = null; if (clipEl) { clipEl.remove(); clipEl = null; } return; }
    const fade = Math.min(1, age / 0.2, (meme.life - age) / 0.3);
    ctx.save(); ctx.globalAlpha = fade;
    ctx.fillStyle = meme.mood === 'skull' ? 'rgba(10,10,12,.72)' : meme.mood === 'angry' ? 'rgba(80,0,10,.55)' : 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, W, H);
    if (!meme.clip) {
      const face = MOOD[meme.mood] || '😱';
      let sx = 0, sy = 0, sc = 1, rot = 0;
      if (!reduced) {
        if (meme.mood === 'shock') { sc = 1 + 0.5 * Math.max(0, 1 - age / 0.25); sx = (Math.random() - 0.5) * 18 * Math.max(0, 1 - age); }
        else if (meme.mood === 'cry') { rot = Math.sin(age * 9) * 0.06; }
        else if (meme.mood === 'dizzy') { rot = Math.sin(age * 6) * 0.35; }
        else if (meme.mood === 'angry') { sx = (Math.random() - 0.5) * 22; sy = (Math.random() - 0.5) * 10; }
        else if (meme.mood === 'skull') { ctx.globalAlpha = fade * (Math.random() < 0.08 ? 0.4 : 1); }
        else { sy = -Math.abs(Math.sin(age * 7)) * 50; }
      }
      ctx.save(); ctx.translate(W / 2 + sx, 820 + sy); ctx.rotate(rot); ctx.scale(sc, sc); text(face, 0, 0, 340); ctx.restore();
      if (!reduced && Math.random() < dt * 30) {
        const sym = { cry: '💧', rich: '💸', happy: '🎉', dizzy: '⭐', angry: '💢', shock: '❗', skull: '🕯️' }[meme.mood] || '✨';
        confetti.push({ sym, x: 140 + Math.random() * (W - 280), y: meme.mood === 'cry' ? 900 : 300, vx: (Math.random() - 0.5) * 120, vy: meme.mood === 'cry' ? 260 : 380 + Math.random() * 300, life: 2.2, age: 0, size: 54 });
      }
    }
    bigText(meme.line, W / 2, meme.clip ? 1200 : 1130, 74, '#fff', '#111', W - 100);
    text(`meme của ${meme.by?.name || ''} · ${ACT[meme.action]?.name || ''}`, W / 2, meme.clip ? 1280 : 1215, 26, 'rgba(255,255,255,.8)', 700);
    ctx.restore();
    placeClip();
  }

  function drawParticles(dt) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i]; p.age += dt; if (p.age > p.life) { confetti.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
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
    const cols = ['#22c55e', '#facc15', '#38bdf8', '#f472b6', '#fb923c', '#a78bfa'];
    for (let i = 0; i < n; i++) confetti.push({ x: W / 2 + (Math.random() - 0.5) * 300, y: 700, vx: (Math.random() - 0.5) * 1400, vy: -300 - Math.random() * 900, life: 2.6, age: 0, spin: (Math.random() - 0.5) * 12, color: cols[i % cols.length], g: true });
  }

  // ---------------- thẻ giao việc / kết quả ----------------
  function card(x, y, w, h) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 50; fill(x, y, w, h, 34, 'rgba(26,25,31,.95)'); ctx.restore();
    rr(x, y, w, h, 34); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 2; ctx.stroke();
  }
  function drawBrief(now) {
    const k = reduced ? 1 : back(Math.min(1, (now - anim.phaseAt) / 420));
    ctx.save(); ctx.translate(W / 2, 980); ctx.scale(k, k); ctx.translate(-W / 2, -980);
    const lines = wrap(S.task.name, 50, 760, 800, TITLE).slice(0, 3);
    const ch = 330 + lines.length * 62, y0 = 980 - ch / 2;
    card(110, y0, 860, ch);
    text(`CA ${S.shift}`, W / 2, y0 + 70, 34, C.pink, 900);
    lines.forEach((ln, i) => text(ln, W / 2, y0 + 140 + i * 62, 50, '#fff', 800, 'center', 0, TITLE));
    const yb = y0 + 140 + lines.length * 62;
    text(`Deadline ${clock(S.deadlineMs)} · ${S.steps} bước`, W / 2, yb + 20, 34, C.bar1, 800);
    text(`Chức hiện tại: ${S.rank.name}${S.rank.next ? ` → xong ca lên ${S.rank.next}` : ''}`, W / 2, yb + 76, 26, C.dim, 700, 'center', 800);
    text(S.mode === 'camera' ? 'Xong mỗi bước bấm +1 (Space)' : 'Gõ phím, bấm chuột trong cửa sổ chơi', W / 2, yb + 126, 24, C.faint, 700);
    ctx.restore();
  }
  function board(title, rows, x, y, w) {
    text(title, x, y, 26, C.dim, 800, 'left');
    if (!rows?.length) { text('—', x, y + 50, 26, C.faint, 700, 'left'); return; }
    rows.forEach((r, i) => {
      avatar(r, x + 24, y + 52 + i * 62, 22, null);
      text(r.name, x + 58, y + 52 + i * 62, 25, '#fff', 700, 'left', w - 160);
      text(`${fmtN(r.points)} xu`, x + w, y + 52 + i * 62, 22, '#fde68a', 800, 'right');
    });
  }
  function drawResult(now) {
    const r = S.result; if (!r) return;
    const k = reduced ? 1 : back(Math.min(1, (now - anim.phaseAt) / 450));
    ctx.save(); ctx.translate(W / 2, 1000); ctx.scale(k, k); ctx.translate(-W / 2, -1000);
    card(70, 560, 940, 900);
    bigText(r.win ? 'XONG VIỆC!' : 'TRỄ DEADLINE!', W / 2, 660, 112, r.win ? '#4ade80' : '#ff4d6d', '#14060a');
    text(r.win ? (r.how === 'thangchuc' ? 'Được thăng chức thẳng 🏆' : 'Nhân viên xuất sắc tháng') : 'Tăng ca rồi 😭', W / 2, 760, 36, '#fff', 800);
    const rk = r.rankChange > 0 ? `⬆️ Lên chức: ${r.rankTo}` : r.rankChange < 0 ? `⬇️ Xuống chức: ${r.rankTo}` : `👔 Giữ chức: ${r.rankTo}`;
    text(rk, W / 2, 822, 32, r.rankChange > 0 ? C.bar1 : r.rankChange < 0 ? C.redSoft : C.dim, 800);
    text(r.win ? `Còn dư ${clock(r.leftMs)} · ${r.streak} ca liền` : `Làm được ${r.step}/${r.steps} bước`, W / 2, 872, 26, C.dim, 700);
    let y = 920;
    if (r.punishment) {
      fill(130, y, 820, 110, 20, 'rgba(225,29,72,.18)');
      text('Hình phạt tăng ca', W / 2, y + 30, 22, C.redSoft, 800);
      text(r.punishment, W / 2, y + 72, 30, '#fff', 800, 'center', 780);
      y += 140;
    }
    board('👔 Sếp soi nhất', S.top?.bosses, 120, y + 10, 400);
    board('🤝 Đồng nghiệp tận tâm', S.top?.helpers, 560, y + 10, 400);
    text(`Ca mới sau ${Math.ceil(left(S.remainingMs, now) / 1000)} giây`, W / 2, 1420, 24, C.faint, 700);
    // dấu mộc
    ctx.save(); ctx.translate(820, 640); ctx.rotate(-0.22); ctx.globalAlpha = 0.9;
    rr(-150, -46, 300, 92, 14); ctx.strokeStyle = r.win ? '#22c55e' : '#e11d48'; ctx.lineWidth = 7; ctx.stroke();
    text(r.win ? 'ĐÃ DUYỆT' : 'TĂNG CA', 0, 2, 50, r.win ? '#22c55e' : '#e11d48', 900, 'center', 0, TITLE);
    ctx.restore();
    ctx.restore();
  }

  // ---------------- camera: sếp ló đầu + câu trend ----------------
  function drawCameraExtras(now, yStart) {
    const soi = statusOf('soi');
    if (soi) {
      const k = reduced ? 1 : ease((now - anim.soiAt) / 500);
      bossHead(-40 + 190 * k, 1080, 120, soi.by, now);
      const bub = '👀 Đang làm gì đấy?';
      const bw = measure(bub, 28, 800) + 44;
      fill(250 * k, 940, bw, 64, 32, '#fff');
      text(bub, 250 * k + bw / 2, 973, 28, C.ink, 800);
      redFrame(now, 6, 6, W - 12, H - 12, 30);
    }
    const buzz = statusOf('buzz');
    if (buzz?.text) {
      const y = Math.max(yStart, TOP + 230);
      fill(24, y, 650, 220, 20, '#fff'); rr(24, y, 650, 220, 20); ctx.strokeStyle = C.blue; ctx.lineWidth = 5; ctx.stroke();
      text(`🗣️ Sếp ${buzz.by?.name || ''} bắt đọc to:`, 50, y + 40, 24, C.blue, 800, 'left', 600);
      wrap(`“${buzz.text}”`, 34, 600, 800, TITLE).slice(0, 3).forEach((ln, i) => text(ln, 50, y + 92 + i * 42, 34, C.ink, 800, 'left', 0, TITLE));
    }
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
    typing.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); input({ type: 'enter' }); } });
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
    if (S.mode === 'camera') {
      if (e.code === 'Space' || e.key === 'ArrowRight') { e.preventDefault(); input({ type: 'step', n: 1 }); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); input({ type: 'step', n: -1 }); }
    } else if (activeField && e.key.length === 1 && !e.ctrlKey && !e.metaKey) typing.focus();
  }
  function placeTyping() {
    if (!typing) return;
    if (!activeField) { if (typing.style.display !== 'none') { typing.style.display = 'none'; typing.blur(); } fieldKey = ''; return; }
    const f = activeField, s = canvas.clientWidth / W;
    Object.assign(typing.style, { display: 'block', left: `${canvas.offsetLeft + f.x * s}px`, top: `${canvas.offsetTop + f.y * s}px`, width: `${f.w * s}px`, height: `${f.h * s}px` });
    const focused = document.activeElement === typing;
    if (f.key !== fieldKey) { fieldKey = f.key; typing.value = f.typed; if (focused) typing.focus(); }
    else if (!composing && performance.now() - lastTypeAt > 450 && typing.value !== f.typed) typing.value = f.typed; // sếp ném bút / bắt làm lại → đồng bộ lại chữ
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
    const desktop = S.mode !== 'camera';
    if (desktop) drawDesktopBg();
    drawHud(now);
    if (desktop) {
      drawDesktop(now);
      const gb = giftGrid(now, 24, WIN.y + WIN.h + 24, 1032);
      drawFeed(now, 24, Math.min(H - 40, gb + 260));
      drawTitle(now, 780);
    } else {
      const cy = drawChips(now, 24, TOP + 176, 650);
      const py = drawCameraPings(now, Math.max(TOP + 186, cy));
      giftList(now, 704, TOP + 176, 352);
      drawCameraExtras(now, Math.max(cy, py));
      drawFeed(now, 24, H - 120);
      drawTitle(now, 1240);
    }
    if (S.phase === 'brief') drawBrief(now);
    if (S.phase === 'result') drawResult(now);
    drawMeme(now, dt);
    drawParticles(dt);
    if (S.paused) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H); bigText('⏸ TẠM DỪNG', W / 2, H / 2, 100, '#fff'); }
    for (const p of confetti) if (p.g) p.vy += 1600 * dt;
    if (S.phase !== 'work' || S.paused) activeField = null;
    placeTyping();
  }
  (document.fonts?.ready || Promise.resolve()).finally(() => { if (!stopped) raf = requestAnimationFrame(frame); });
  document.fonts?.load?.(`800 40px ${TITLE}`).catch?.(() => {});

  return {
    update(s) {
      const now = performance.now();
      const key = `${s.phase}|${s.shift}`;
      if (key !== anim.phaseKey) {
        anim.phaseKey = key; anim.phaseAt = now;
        if (s.phase === 'result') for (let i = memes.length - 1; i >= 0; i--) if (memes[i].action !== 'thangchuc') memes.splice(i, 1); // hết ca: bỏ meme còn chờ
      }
      for (const p of s.pings || []) if (!anim.pingAt.has(p.id)) anim.pingAt.set(p.id, now);
      if (anim.pingAt.size > 60) for (const id of [...anim.pingAt.keys()].slice(0, 30)) anim.pingAt.delete(id);
      const soiNow = !!s.status?.some((x) => x.kind === 'soi');
      const soiBefore = !!S?.status?.some((x) => x.kind === 'soi');
      if (soiNow && !soiBefore) anim.soiAt = now;
      S = s; recvAt = now;
    },
    effect(fx) {
      const now = performance.now();
      switch (fx.type) {
        case 'dd_gift': {
          const a = ACT[fx.action]; if (!a) break;
          anim.title = { text: a.title, by: fx.by?.name, sub: fx.sub, color: a.color, at: now, life: 1.9 };
          anim.hot[fx.action] = now + 1600;
          if (fx.meme) { memes.push({ ...fx.meme, by: fx.by, action: fx.action }); while (memes.length > 3) memes.shift(); }
          sound.play(fx.action);
          if (fx.action === 'thangchuc') burst(220);
          break;
        }
        case 'dd_ping': sound.play('ping'); break;
        case 'dd_shake': anim.shake = 1; break;
        case 'dd_step': anim.stepAt = now; sound.play(fx.n > 0 ? 'step' : 'down'); if (fx.n > 0 && fx.by) floaters.push({ text: `+1 bước · ${fx.by.name}`, x: W / 2, y: 520, color: '#86efac', size: 40, life: 1.4, age: 0 }); break;
        case 'dd_wrong': anim.shake = 0.5; sound.play('wrong'); break;
        case 'dd_zap': sound.play('zap'); break;
        case 'dd_cleared': sound.play('cleared'); break;
        case 'dd_ping_close': sound.play('zap'); break;
        case 'dd_win': burst(260); sound.play('win'); break;
        case 'dd_fail': anim.shake = 1; sound.play('fail'); break;
        case 'dd_brief': sound.play('brief'); break;
        default:
      }
    },
    resumeAudio() { sound.resume(); },
    resize() {},
    destroy() {
      stopped = true; cancelAnimationFrame(raf); sound.close();
      typing?.remove(); clipEl?.remove();
      if (input) removeEventListener('keydown', onKey);
    },
  };
}

const HELP_SET = new Set(['cafe', 'giahan', 'intern', 'thangchuc']);

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
    soi: () => { tone(110, 0.35, { type: 'sawtooth', vol: 0.12 }); tone(98, 0.5, { type: 'sawtooth', vol: 0.12, at: 0.38 }); },
    ban: () => { tone(220, 0.08, { vol: 0.3, slide: 0.4 }); tone(900, 0.06, { type: 'square', vol: 0.06, at: 0.05 }); },
    mayin: () => [0, 0.12, 0.24, 0.36].forEach((at) => tone(140, 0.1, { type: 'sawtooth', vol: 0.08, at, slide: 1.4 })),
    buzz: () => [0, 0.14, 0.28].forEach((at, i) => tone(300 + i * 60, 0.12, { type: 'square', vol: 0.05, at })),
    hop: () => [0, 0.3, 0.6].forEach((at) => tone(880, 0.22, { type: 'sawtooth', vol: 0.06, at, slide: 0.7 })),
    cattg: () => tone(600, 0.9, { type: 'sawtooth', vol: 0.07, slide: 0.15 }),
    virus: () => [0, 0.06, 0.12, 0.18, 0.24].forEach((at, i) => tone(i % 2 ? 1500 : 400, 0.05, { type: 'square', vol: 0.05, at })),
    lamlai: () => tone(900, 0.5, { type: 'triangle', vol: 0.12, slide: 0.3 }),
    cafe: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, { type: 'triangle', at: i * 0.07 })),
    giahan: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', at: i * 0.07 })),
    intern: () => [659, 784, 988].forEach((f, i) => tone(f, 0.15, { type: 'triangle', at: i * 0.07 })),
    thangchuc: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.2, { type: 'triangle', at: i * 0.08 })),
    step: () => { tone(880, 0.08, { type: 'triangle' }); tone(1320, 0.12, { type: 'triangle', at: 0.06 }); },
    down: () => tone(500, 0.25, { type: 'triangle', slide: 0.5 }),
    wrong: () => tone(160, 0.22, { type: 'square', vol: 0.08 }),
    zap: () => tone(700, 0.06, { type: 'square', vol: 0.05, slide: 1.6 }),
    cleared: () => [784, 1047].forEach((f, i) => tone(f, 0.14, { type: 'triangle', at: i * 0.08 })),
    win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { type: 'triangle', at: i * 0.11 })),
    fail: () => [392, 370, 349, 294].forEach((f, i) => tone(f, i === 3 ? 0.8 : 0.32, { type: 'sawtooth', vol: 0.07, at: i * 0.34, slide: i === 3 ? 0.85 : 0 })),
    brief: () => { tone(660, 0.1, { type: 'triangle' }); tone(990, 0.16, { type: 'triangle', at: 0.1 }); },
    // meme
    shock: () => { tone(70, 0.9, { vol: 0.45, slide: 0.5 }); tone(140, 0.4, { type: 'triangle', vol: 0.2 }); },
    cry: () => [0, 0.25, 0.5].forEach((at) => tone(520, 0.24, { type: 'triangle', vol: 0.12, at, slide: 0.7 })),
    dizzy: () => [0, 0.1, 0.2, 0.3].forEach((at, i) => tone(i % 2 ? 1200 : 900, 0.08, { type: 'sine', vol: 0.12, at })),
    angry: () => tone(90, 0.6, { type: 'sawtooth', vol: 0.12, slide: 1.3 }),
    skull: () => tone(55, 1.4, { type: 'sawtooth', vol: 0.12, slide: 0.8 }),
    happy: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, { type: 'triangle', at: i * 0.07 })),
    rich: () => { tone(1568, 0.08, { type: 'square', vol: 0.06 }); tone(2093, 0.3, { type: 'triangle', vol: 0.14, at: 0.08 }); },
  };
  return {
    play(n, arg) { try { P[n]?.(arg); } catch { /* bỏ qua */ } },
    resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } },
    close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; },
  };
}

// Màn hình game "Phòng thí nghiệm Ghép" (/ghep) — 1080×1920 cho OBS / điện thoại.
// Bình luận "A + B" → 2 emoji bay vào vạc, trộn, nổ ra sinh vật mới (ghép bằng font emoji).
// Hình ghép: ảnh Emoji Kitchen của cặp emoji (tải thẳng từ gstatic); cặp không có ảnh thì tự ghép 2 emoji bằng font.
// Quà ≥ 10 xu → combo của người tặng được trình diễn đặc biệt (chen lên đầu, khung vàng, pháo hoa).

const W = 1080, H = 1920;
const stage = document.getElementById('stage');
const qs = new URLSearchParams(location.search);
if (qs.get('bg') === 'green' || qs.get('bg') === 'none') stage.classList.add(qs.get('bg'));
function fit() {
  const k = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * k) / 2}px, 0) scale(${k})`;
}
addEventListener('resize', fit); fit();

const cv = document.getElementById('c2d');
const ctx = cv.getContext('2d');
const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const EF = (s) => `${Math.round(s)}px 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const back = (t) => { t = clamp01(t); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const nowS = () => performance.now() / 1000;
const RARITY = { 'thường': { c: '#a5b4fc', label: 'THƯỜNG' }, 'hiếm': { c: '#38bdf8', label: '💠 HIẾM' }, 'huyền thoại': { c: '#facc15', label: '👑 HUYỀN THOẠI' } };

// ---------------- emoji: tải font + vẽ sẵn ra canvas phụ ----------------
const fontReady = new Set();
function ensureEmoji(e) {
  if (!e || fontReady.has(e)) return;
  fontReady.add(e); // đánh dấu ngay để không gọi lại; vẽ lại cache khi tải xong
  document.fonts?.load(EF(64), e).then(() => { for (const k of [...emojiCache.keys()]) if (k.startsWith(e + '|')) emojiCache.delete(k); fusionCache.clear(); }).catch(() => {});
}
const emojiCache = new Map();
function emojiCanvas(e, size) {
  size = Math.round(size);
  const key = `${e}|${size}`;
  let c = emojiCache.get(key);
  if (c) return c;
  ensureEmoji(e);
  c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * 1.3);
  const x = c.getContext('2d');
  x.font = EF(size); x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(e, c.width / 2, c.height / 2 + size * 0.06);
  if (emojiCache.size > 400) emojiCache.delete(emojiCache.keys().next().value);
  emojiCache.set(key, c);
  return c;
}
/** Vẽ emoji tâm (x, y), cỡ size, xoay rot. */
// vẽ sẵn theo vài cỡ cố định rồi phóng to / thu nhỏ → không phải vẽ lại emoji mỗi khung hình khi đang phóng to
const bucket = (size, list) => list.find((b) => b >= size) || list[list.length - 1];
function drawEmoji(g, e, x, y, size, rot = 0, alpha = 1) {
  if (!e || !(size >= 2)) return;
  const bs = bucket(size, [48, 96, 160, 256, 400]);
  const c = emojiCanvas(e, bs);
  const k = size / bs;
  g.save(); g.globalAlpha *= alpha; g.translate(x, y); if (rot) g.rotate(rot); g.scale(k, k);
  g.drawImage(c, -c.width / 2, -c.height / 2);
  g.restore();
}

// ---------------- bộ ghép: vẽ combo theo "công thức" Claude chọn ----------------
const fusionCache = new Map();
function fusionCanvas(cb, S) {
  S = Math.round(S);
  const key = `${cb.ea}${cb.eb}${cb.mode}${cb.base}${cb.tint}|${S}`;
  let c = fusionCache.get(key);
  if (c) return c;
  const base = cb.base === 'b' ? cb.eb : cb.ea;
  const other = cb.base === 'b' ? cb.ea : cb.eb;
  c = document.createElement('canvas');
  c.width = c.height = Math.ceil(S * 1.7);
  const g = c.getContext('2d');
  const m = c.width / 2;
  // lớp thân chính trên canvas riêng để nhuộm / phủ hoa văn
  const body = () => {
    const b = document.createElement('canvas'); b.width = b.height = c.width;
    const x = b.getContext('2d'); drawEmoji(x, base, m, m, S); return { b, x };
  };
  switch (cb.mode) {
    case 'inside': {
      const { b, x } = body();
      x.globalCompositeOperation = 'source-atop';
      x.globalAlpha = 0.6;
      const step = S * 0.3;
      for (let yy = -1; yy * step < c.width + step; yy++) for (let xx = -1; xx * step < c.width + step; xx++) {
        drawEmoji(x, other, xx * step + (yy % 2 ? step / 2 : 0), yy * step, step * 0.9, ((xx + yy) % 3) * 0.3);
      }
      x.globalAlpha = 0.7; x.globalCompositeOperation = 'luminosity';
      drawEmoji(x, base, m, m, S); // giữ lại mắt / nét của thân chính
      g.drawImage(b, 0, 0);
      break;
    }
    case 'tint': {
      const { b, x } = body();
      x.globalCompositeOperation = 'color'; x.fillStyle = cb.tint || '#f97316'; x.fillRect(0, 0, b.width, b.height);
      x.globalCompositeOperation = 'destination-in'; drawEmoji(x, base, m, m, S);
      g.drawImage(b, 0, 0);
      drawEmoji(g, other, m + S * 0.36, m + S * 0.36, S * 0.38, 0.25);
      break;
    }
    case 'hat':
      drawEmoji(g, base, m, m + S * 0.12, S * 0.92);
      drawEmoji(g, other, m + S * 0.04, m - S * 0.4, S * 0.52, -0.22);
      break;
    case 'eyes':
      drawEmoji(g, base, m, m, S);
      drawEmoji(g, other, m - S * 0.17, m - S * 0.05, S * 0.25, -0.1);
      drawEmoji(g, other, m + S * 0.17, m - S * 0.05, S * 0.25, 0.1);
      break;
    case 'hold':
      drawEmoji(g, base, m - S * 0.1, m, S * 0.95);
      drawEmoji(g, other, m + S * 0.38, m + S * 0.22, S * 0.46, 0.3);
      break;
    case 'ride':
      drawEmoji(g, other, m, m + S * 0.24, S * 0.9);
      drawEmoji(g, base, m - S * 0.04, m - S * 0.3, S * 0.6, -0.12);
      break;
    case 'half':
    default: {
      g.save(); g.beginPath(); g.rect(0, 0, m, c.height); g.clip(); drawEmoji(g, base, m, m, S); g.restore();
      g.save(); g.beginPath(); g.rect(m, 0, m, c.height); g.clip(); drawEmoji(g, other, m, m, S); g.restore();
      // đường khâu zigzag giữa 2 nửa
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = S * 0.025; g.beginPath();
      for (let i = 0; i <= 10; i++) { const yy = m - S * 0.5 + (S / 10) * i; g.lineTo(m + (i % 2 ? S * 0.03 : -S * 0.03), yy); }
      g.stroke();
    }
  }
  if (fusionCache.size > 120) fusionCache.delete(fusionCache.keys().next().value);
  fusionCache.set(key, c);
  return c;
}
// ảnh Emoji Kitchen: tải trước, lỗi / chưa tải xong thì vẽ kiểu tự ghép
const imgs = new Map();
function loadImg(url) {
  if (!url || imgs.has(url)) return;
  const im = new Image();
  const rec = { im, ok: false };
  im.onload = () => { rec.ok = true; };
  im.onerror = () => { rec.ok = false; rec.failed = true; };
  im.src = url;
  imgs.set(url, rec);
  if (imgs.size > 200) imgs.delete(imgs.keys().next().value);
}
const imgReady = (url) => !!(url && imgs.get(url)?.ok);
/** Vẽ combo: ảnh ghép nếu có, không thì tự ghép 2 emoji. */
function drawCombo(g, cb, x, y, S, rot = 0, alpha = 1) {
  if (!(S >= 2)) return;
  if (imgReady(cb.img)) {
    const im = imgs.get(cb.img).im;
    g.save(); g.globalAlpha *= alpha; g.translate(x, y); if (rot) g.rotate(rot);
    g.drawImage(im, -S / 2, -S / 2, S, S);
    g.restore();
    return;
  }
  drawFusion(g, cb, x, y, S, rot, alpha);
}
function drawFusion(g, cb, x, y, S, rot = 0, alpha = 1) {
  if (!(S >= 2)) return;
  const bs = bucket(S, [128, 420]);
  const c = fusionCanvas(cb, bs);
  const k = S / bs;
  g.save(); g.globalAlpha *= alpha; g.translate(x, y); if (rot) g.rotate(rot); g.scale(k, k);
  g.drawImage(c, -c.width / 2, -c.height / 2);
  g.restore();
}

// ---------------- chữ ----------------
function wrapText(text, maxW, font) {
  ctx.font = font;
  const words = String(text || '').split(/\s+/);
  const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function fitFont(text, maxW, size, weight = 900) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (size > 30 && ctx.measureText(text).width > maxW) { size -= 4; ctx.font = `${weight} ${size}px ${FONT}`; }
  return size;
}
function pill(x, y, w, h, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
}

// ---------------- trạng thái ----------------
const jobs = new Map(); // id → job
const showQueue = []; // id chờ trình diễn
let cur = null; // { job, t0, boomAt }
let gallery = [];
let snap = { active: false, total: 0, minGiftDiamonds: 10 };
const feed = []; // bình luận combo gần đây
const toasts = [];
const sparks = [];
const bubbles = [];
const EXAMPLES = ['mèo + tên lửa', '🐶 + 🍕', 'khủng long + trà sữa', 'cá mập + 🌈', 'ma + bánh mì', 'gấu trúc + sét'];

function toast(text, color = '#f472b6', ms = 3500) {
  toasts.push({ text, color, t0: nowS(), dur: ms / 1000 });
  if (toasts.length > 4) toasts.splice(1, 1);
  if (toasts.length === 1) toasts[0].t0 = nowS();
}
function burst(x, y, n = 140, colors = ['#facc15', '#f472b6', '#4ade80', '#ffffff', '#60a5fa']) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 16;
    sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, life: 1, c: colors[i % colors.length], r: 5 + Math.random() * 10 });
  }
  if (sparks.length > 600) sparks.splice(0, sparks.length - 600);
}

function onEffect(e) {
  if (e.type === 'ghep_job') {
    ensureEmoji(e.ea); ensureEmoji(e.eb); loadImg(e.img);
    jobs.set(e.id, { ...e, typing: '', combo: null, fail: false, at: nowS() });
    feed.unshift({ name: e.by?.name || '?', text: `${e.a} + ${e.b}`, at: nowS() });
    feed.length = Math.min(feed.length, 5);
    showQueue.push(e.id);
    // hàng chờ quá dài: bỏ bớt combo đã có (vẫn hiện ở dải bộ sưu tập), giữ combo mới
    while (showQueue.length > 10) {
      const i = showQueue.findIndex((id) => jobs.get(id)?.known);
      const drop = showQueue.splice(i >= 0 ? i : 0, 1)[0];
      jobs.delete(drop);
    }
  } else if (e.type === 'ghep_typing') {
    const j = jobs.get(e.id); if (j) j.typing = e.name;
  } else if (e.type === 'ghep_done') {
    const j = jobs.get(e.id);
    ensureEmoji(e.combo.ea); ensureEmoji(e.combo.eb); loadImg(e.combo.img);
    if (j) { j.combo = e.combo; j.isNew = e.isNew; j.gift = e.gift || null; }
  } else if (e.type === 'ghep_fail') {
    const j = jobs.get(e.id); if (j) j.fail = true;
  } else if (e.type === 'ghep_thanks') {
    if (e.diamonds < snap.minGiftDiamonds) toast(`🎁 Cảm ơn ${e.by?.name} tặng ${e.giftName}!`, '#f472b6');
  } else if (e.type === 'ghep_hint') {
    toast(`✍️ ${e.by?.name} ơi, bình luận "A + B" để được trình diễn đặc biệt!`, '#22d3ee', 6000);
  } else if (e.type === 'ghep_spotlight') {
    // quà: trình diễn lại combo của người tặng, chen lên đầu hàng
    const c = e.combo;
    ensureEmoji(c.ea); ensureEmoji(c.eb); loadImg(c.img);
    jobs.set(e.id, { id: e.id, a: c.a, b: c.b, ea: c.ea, eb: c.eb, img: c.img, by: e.by, known: true, combo: c, isNew: false, gift: e.gift, at: nowS() });
    showQueue.unshift(e.id);
  }
}

// ---------------- WebSocket ----------------
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onmessage = (m) => {
    let d; try { d = JSON.parse(m.data); } catch { return; }
    if (d.type === 'hello' || d.type === 'ghep') {
      if (d.ghep) { snap = d.ghep; gallery = d.ghep.gallery || []; for (const g of gallery) { ensureEmoji(g.ea); ensureEmoji(g.eb); loadImg(g.img); } }
    } else if (d.type === 'ghepfx') for (const e of d.effects || []) onEffect(e);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();

// ---------------- 2D: vạc thí nghiệm ----------------
const CX = W / 2, CY = 880;
function drawCauldron(t, intensity = 1) {
  const glow = ctx.createRadialGradient(CX, CY + 40, 40, CX, CY + 40, 440);
  glow.addColorStop(0, `rgba(74,222,128,${(0.18 + 0.12 * Math.sin(t * 6)) * intensity})`); glow.addColorStop(1, 'rgba(74,222,128,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 300, W, 1100);
  ctx.fillStyle = '#1f2937'; ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.ellipse(CX, CY + 160, 260, 200, 0, 0, Math.PI); ctx.lineTo(CX - 260, CY + 160); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(CX, CY + 160, 270, 60, 0, 0, Math.PI * 2); ctx.fillStyle = '#22c55e'; ctx.fill(); ctx.strokeStyle = '#6b7280'; ctx.stroke();
  if (Math.random() < 0.25 + 0.5 * intensity) bubbles.push({ x: CX + (Math.random() - 0.5) * 420, y: CY + 160, r: 8 + Math.random() * 16, v: 2 + Math.random() * 3 });
  for (const b of bubbles) {
    b.y -= b.v; b.x += Math.sin(b.y / 30) * 1.5;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(134,239,172,.5)'; ctx.fill();
    ctx.strokeStyle = 'rgba(220,252,231,.8)'; ctx.lineWidth = 2; ctx.stroke();
  }
  while (bubbles.length && bubbles[0].y < CY - 260) bubbles.shift();
}

function revealDur() { return showQueue.length > 5 ? 2.6 : showQueue.length > 1 ? 3.8 : 6; }

function drawShow(t) {
  if (!cur && showQueue.length) {
    const job = jobs.get(showQueue.shift());
    if (job) cur = { job, t0: t, boomAt: null };
  }
  if (!cur) { drawIdle(t); return; }
  const { job } = cur;
  const el = t - cur.t0;
  const mixMin = job.gift && job.combo && job.known ? 0.9 : job.known ? 1.3 : 2.4;
  if (cur.boomAt === null && el > mixMin && (job.combo || job.fail || el > 18)) {
    cur.boomAt = t;
    if (job.combo) burst(CX, CY - 120, job.isNew || job.gift ? 200 : 110, job.gift || job.combo.rarity === 'huyền thoại' ? GOLD : undefined);
    else burst(CX, CY, 90, ['#9ca3af', '#4b5563', '#f97316']);
  }
  drawCauldron(t, cur.boomAt === null ? 1 : 0.4);
  if (cur.boomAt === null) {
    // 2 emoji bay vào, xoay quanh nhau rồi chìm vào vạc
    const fly = ease(el / 0.8);
    const orbit = Math.max(0, el - 0.8);
    const r = 240 * (1 - ease(orbit / Math.max(0.6, mixMin - 0.6)));
    const ang = orbit * 9;
    const sz = 190 * (1 - 0.45 * ease((el - mixMin + 0.6) / 0.6));
    drawEmoji(ctx, job.ea || '❓', -200 + (CX + Math.cos(ang) * r + 200) * fly, 520 + (CY - 40 + Math.sin(ang) * r * 0.4 - 520) * fly, sz);
    drawEmoji(ctx, job.eb || '❓', W + 200 + (CX - Math.cos(ang) * r - W - 200) * fly, 520 + (CY - 40 - Math.sin(ang) * r * 0.4 - 520) * fly, sz);
    if (!job.ea) txt(job.a, -200 + (CX + Math.cos(ang) * r + 200) * fly, 640 + (CY - 520) * fly, 36);
    if (!job.eb) txt(job.b, W + 200 + (CX - Math.cos(ang) * r - W - 200) * fly, 640 + (CY - 520) * fly, 36);
    const prog = Math.min(99, Math.round(ease(el / (job.combo ? mixMin : 6)) * 100));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 40px ${FONT}`; ctx.fillStyle = '#bbf7d0';
    ctx.fillText(`⚗️ Đang trộn… ${prog}%`, CX, 1250);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(CX - 300, 1290, 600, 18);
    ctx.fillStyle = '#4ade80'; ctx.fillRect(CX - 300, 1290, 6 * prog, 18);
    // tên đang được AI "gõ"
    if (job.typing) { const s = fitFont(job.typing.toUpperCase() + '▌', 960, 90); gradText(job.typing.toUpperCase() + '▌', CX, 1440, s); }
    ctx.font = `800 34px ${FONT}`; ctx.fillStyle = '#f9a8d4';
    ctx.fillText(`💬 ${job.by?.name || ''}: ${job.a} + ${job.b}`.slice(0, 48), CX, 1560);
    return;
  }
  const rt = t - cur.boomAt;
  const dur = job.combo ? (job.gift ? 8 : revealDur()) : 1.6;
  if (job.combo) drawReveal(job, rt, t);
  else {
    ctx.textAlign = 'center'; ctx.font = `900 80px ${FONT}`; ctx.fillStyle = '#fca5a5';
    ctx.fillText('💥 Nổ phòng lab!', CX, CY - 100);
    ctx.font = `700 36px ${FONT}`; ctx.fillStyle = '#e5e7eb'; ctx.fillText('Thí nghiệm này bị cấm, thử combo khác nha', CX, CY);
  }
  if (rt > dur) cur = null;
}

function gradText(text, x, y, size) {
  ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const gr = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  gr.addColorStop(0, '#fff7ad'); gr.addColorStop(0.55, '#facc15'); gr.addColorStop(1, '#f97316');
  ctx.lineWidth = 14; ctx.strokeStyle = '#2e1065'; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y);
  ctx.fillStyle = gr; ctx.fillText(text, x, y);
}
function txt(text, x, y, size, color = '#fff', weight = 800) {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, x, y);
}

const GOLD = ['#facc15', '#fde68a', '#ffffff', '#f59e0b', '#f472b6'];
function drawReveal(job, rt, t) {
  const cb = job.combo;
  const rar = job.gift ? { c: '#facc15', label: '🎁 TRÌNH DIỄN ĐẶC BIỆT' } : RARITY[cb.rarity] || RARITY['thường'];
  if (job.gift && Math.random() < 0.12) burst(150 + Math.random() * (W - 300), 400 + Math.random() * 500, 40, GOLD);
  const k = back(rt / 0.55);
  // vòng sáng + tia sáng xoay sau combo
  ctx.save(); ctx.translate(CX, CY - 160);
  ctx.save(); ctx.rotate(t * 0.5); ctx.globalAlpha = 0.18 * k;
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = rar.c; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-60, -520); ctx.lineTo(60, -520); ctx.fill(); }
  ctx.restore();
  const gl = ctx.createRadialGradient(0, 0, 40, 0, 0, 340); gl.addColorStop(0, rar.c + '88'); gl.addColorStop(1, rar.c + '00');
  ctx.fillStyle = gl; ctx.fillRect(-340, -340, 680, 680);
  ctx.restore();
  if (job.gift) { // khung vàng xoay quanh
    ctx.save(); ctx.translate(CX, CY - 160); ctx.rotate(-t * 0.8);
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 10; ctx.setLineDash([40, 22]);
    ctx.beginPath(); ctx.arc(0, 0, 300 * k, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  drawCombo(ctx, cb, CX, CY - 160 + Math.sin(t * 2.2) * 12, (job.gift ? 500 : 440) * Math.max(0.01, k), Math.sin(t * 3) * 0.06);
  // độ hiếm
  ctx.font = `900 34px ${FONT}`;
  const rw = ctx.measureText(rar.label).width + 60;
  pill(CX - rw / 2, 280, rw, 62, 'rgba(15,10,45,.85)', rar.c);
  txt(rar.label, CX, 312, 34, rar.c, 900);
  if (job.gift) txt(`${job.by?.name} tặng ${job.gift.giftName} 💛`, CX, 390, 38, '#fde68a', 900);
  else if (job.isNew) txt('✨ PHÁT MINH MỚI ✨', CX, 390, 38, '#4ade80', 900);
  // tên (gõ dần) + mô tả + chỉ số
  const name = cb.name.toUpperCase();
  const typed = name.slice(0, Math.floor(rt * 22) + 1);
  gradText(typed, CX, 1240, fitFont(name, 980, 104));
  const desc = cb.desc.slice(0, Math.floor(Math.max(0, rt - 0.4) * 45));
  const lines = wrapText(desc, 940, `600 38px ${FONT}`);
  lines.slice(0, 2).forEach((l, i) => txt(l, CX, 1340 + i * 50, 38, '#e0e7ff', 600));
  const st = cb.stats || [];
  if (rt > 0.7) {
    const cw = 300, gap = 20, x0 = CX - (st.length * cw + (st.length - 1) * gap) / 2;
    st.forEach((s, i) => {
      const x = x0 + i * (cw + gap), y = 1460;
      pill(x, y, cw, 70, 'rgba(255,255,255,.08)', 'rgba(255,255,255,.25)');
      const v = Math.round(s.value * ease((rt - 0.7 - i * 0.15) / 0.6));
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cw, 70, 35); ctx.clip();
      ctx.fillStyle = 'rgba(167,139,250,.35)'; ctx.fillRect(x, y, cw * v / 100, 70); ctx.restore();
      txt(`${s.label} ${v}`, x + cw / 2, y + 36, 28, '#fff', 800);
    });
  }
  const by = job.isNew ? `phát minh bởi ${cb.inventor?.name || job.by?.name}` : `${job.by?.name} ghép lại · ${cb.count || 1} lần · gốc: ${cb.inventor?.name || '?'}`;
  txt(`${job.a} + ${job.b}`, CX, 1560, 34, '#c4b5fd', 700);
  txt(by.slice(0, 56), CX, 1610, 32, '#f9a8d4', 800);
}

function drawIdle(t) {
  drawCauldron(t, 0.5);
  const ex = EXAMPLES[Math.floor(t / 3) % EXAMPLES.length];
  drawEmoji(ctx, '🧪', CX - 150, CY - 170 + Math.sin(t * 2) * 14, 150, -0.2);
  drawEmoji(ctx, '✨', CX + 150, CY - 200 + Math.cos(t * 2) * 14, 130, 0.2);
  txt('Bình luận để ghép:', CX, 1250, 44, '#bbf7d0', 800);
  gradText(ex.toUpperCase(), CX, 1350, fitFont(ex.toUpperCase(), 960, 88));
  txt(`Đã có ${snap.total || 0} phát minh trong phòng lab`, CX, 1450, 32, '#a5b4fc', 700);
}

function drawHeader() {
  txt('🧪 PHÒNG THÍ NGHIỆM', CX, 100, 60, '#c4b5fd', 900);
  const sub = `Bình luận "A + B" để ghép · quà ≥ ${snap.minGiftDiamonds || 10} xu: trình diễn đặc biệt`;
  txt(sub, CX, 168, fitFont(sub, 1020, 30, 700), '#a5b4fc', 700);
  if (!snap.active) { pill(CX - 250, 1180, 500, 50, 'rgba(239,68,68,.25)', '#ef4444'); txt('Game đang tắt — bật ở trang admin', CX, 1206, 26, '#fecaca', 800); }
}

function drawFeed(t) {
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  feed.forEach((f, i) => {
    const a = clamp01(1 - (t - f.at - 25) / 5) * (1 - i * 0.15);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.font = `700 24px ${FONT}`;
    let s = `💬 ${f.name}: ${f.text}`;
    while (ctx.measureText(s).width > 290 && s.length > 4) s = s.slice(0, -2);
    if (s !== `💬 ${f.name}: ${f.text}`) s += '…';
    const w = ctx.measureText(s).width + 32;
    pill(24, 300 + i * 52, w, 44, 'rgba(15,10,45,.7)');
    ctx.fillStyle = '#e0e7ff'; ctx.fillText(s, 40, 323 + i * 52);
    ctx.globalAlpha = 1;
  });
}

function drawGallery(t) {
  if (!gallery.length) return;
  const y = 1785, cell = 160;
  txt('📚 Bộ sưu tập mới nhất', CX, 1700, 28, '#a5b4fc', 800);
  const n = Math.min(gallery.length, 6);
  const x0 = CX - (n * cell) / 2 + cell / 2;
  for (let i = 0; i < n; i++) {
    const g = gallery[i];
    const x = x0 + i * cell;
    ctx.beginPath(); ctx.arc(x, y, 66, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
    ctx.strokeStyle = (RARITY[g.rarity] || RARITY['thường']).c; ctx.lineWidth = 3; ctx.stroke();
    drawCombo(ctx, g, x, y - 6 + Math.sin(t * 2 + i) * 4, 112);
    ctx.font = `700 20px ${FONT}`;
    let nm = g.name; while (ctx.measureText(nm).width > cell - 10 && nm.length > 3) nm = nm.slice(0, -2);
    txt(nm === g.name ? nm : nm + '…', x, y + 84, 20, '#e0e7ff', 700);
  }
}

function drawToasts(t) {
  // lần lượt từng thông báo, ngay dưới tiêu đề
  while (toasts.length && t - toasts[0].t0 > toasts[0].dur) { toasts.shift(); if (toasts[0]) toasts[0].t0 = t; }
  const s = toasts[0];
  if (!s) return;
  const el = t - s.t0;
  ctx.globalAlpha = Math.min(clamp01(el / 0.25), clamp01((s.dur - el) / 0.4));
  let size = 34;
  ctx.font = `900 ${size}px ${FONT}`;
  while (size > 24 && ctx.measureText(s.text).width > 960) { size -= 2; ctx.font = `900 ${size}px ${FONT}`; }
  const w = Math.min(1020, ctx.measureText(s.text).width + 60);
  const yy = 205 + (1 - ease(el / 0.3)) * -20;
  pill(CX - w / 2, yy, w, 62, s.color);
  txt(s.text, CX, yy + 32, size, '#1e0b3a', 900);
  ctx.globalAlpha = 1;
}

function drawSparks() {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx; s.y += s.vy; s.vy += 0.35; s.life -= 0.012;
    if (s.life <= 0) { sparks.splice(i, 1); continue; }
    ctx.globalAlpha = s.life; ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------- vòng vẽ ----------------
function frame() {
  const t = nowS();
  ctx.clearRect(0, 0, W, H);
  drawHeader();
  drawShow(t);
  drawSparks();
  drawFeed(t);
  drawGallery(t);
  drawToasts(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

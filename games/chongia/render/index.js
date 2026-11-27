// Renderer canvas của "Hãy chọn giá đúng" (khung dọc 1080×1920, chừa ~260px trên cho giao diện TikTok).
// Motif gameshow truyền hình: sân khấu tím than, đèn rọi quét, bảng tên chương trình viền bóng đèn chớp,
// thẻ sản phẩm trắng như kệ siêu thị, nhãn giá vàng có ô số lật khi công bố giá.
// Không đụng DOM khi import.
import { drawPanel } from '#sdk';

const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const C = {
  bg0: '#1b0f3b', bg1: '#3a1361', bg2: '#5b1a6e', beam: 'rgba(255,236,170,', floor: '#12082a',
  gold: '#ffd23f', gold2: '#f5a623', goldDark: '#a86a00', red: '#ff3b5c', green: '#22c55e', greenDark: '#15803d', blue: '#38bdf8',
  card: '#ffffff', cardEdge: '#f1e6ff', ink: '#2a1745', inkSoft: '#6b5a86', faint: 'rgba(42,23,69,.45)',
  text: '#ffffff', dim: 'rgba(255,255,255,.78)', mute: 'rgba(255,255,255,.5)',
  panel: 'rgba(22,10,48,.82)', panelEdge: 'rgba(255,210,63,.45)', tag: '#ffd23f', tagEdge: '#c98a00',
};
const LETTERS = ['A', 'B', 'C', 'D'];
const OPT_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#22c55e'];
const ACTION_TEXT = { hint: 'gợi ý khoảng giá', digit: 'lộ chữ số đầu', time: '+10 giây', double: '×2 điểm cho bạn', jackpot: 'SIÊU SALE ×3 cả phòng', skip: 'đổi món hàng' };
const fmtN = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtP = (n) => `${fmtN(n)}đ`;

export function mount(el, { canvas, options = {} } = {}) {
  let LAYOUT = {};
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let S = null, prev = null, recvAt = 0, raf = 0, stopped = false, last = performance.now(), t0 = performance.now();
  const anim = { roundAt: 0, revealAt: 0, banner: null, shake: 0, pulse: 0, lastTickSec: -1 };
  const floaters = [], confetti = [];
  const sound = makeSound(!!options.mute);
  const CARD = { x: 60, y: 400, w: W - 120, h: 600 };
  const TAG = { y: 1024, h: 150 };
  const PLAY = { y: 1238, h: 238 };
  const BOTTOM = 1492;

  // ---------------- tiện ích vẽ ----------------
  function rr(x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function text(s, x, y, size, color = C.text, weight = 800, align = 'center', maxW = 0) {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    let t = String(s ?? '');
    if (maxW && ctx.measureText(t).width > maxW) { while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; }
    ctx.fillText(t, x, y);
    return ctx.measureText(t).width;
  }
  const measure = (s, size, weight = 800) => { ctx.font = `${weight} ${size}px ${FONT}`; return ctx.measureText(String(s)).width; };
  /** Ngắt dòng theo bề rộng; tối đa maxLines dòng (dòng cuối thêm …). */
  function wrap(s, size, weight, maxW, maxLines) {
    const words = String(s ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (measure(t, size, weight) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); keep[maxLines - 1] += ' …'; return keep; }
    return lines;
  }
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3));
  const back = (k) => { if (k <= 0) return 0; if (k >= 1) return 1; const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const remaining = (now) => (S.paused ? S.remainingMs : Math.max(0, S.remainingMs - (now - recvAt)));

  const images = new Map();
  function img(src) {
    if (!src) return null;
    let a = images.get(src);
    if (!a) {
      a = { img: new Image(), ok: false, bad: false };
      a.img.referrerPolicy = 'no-referrer'; a.img.decoding = 'async';
      a.img.onload = () => { a.ok = a.img.naturalWidth > 0; }; a.img.onerror = () => { a.bad = true; };
      a.img.src = src; images.set(src, a);
      if (images.size > 60) images.delete(images.keys().next().value);
    }
    return a.ok ? a.img : null;
  }
  function avatar(user, x, y, r, ring = 'rgba(255,255,255,.85)') {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    const im = user?.avatar ? img(user.avatar) : null;
    if (im) { ctx.save(); ctx.clip(); ctx.drawImage(im, x - r, y - r, r * 2, r * 2); ctx.restore(); }
    else { const n = user?.name || '?'; let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; ctx.fillStyle = `hsl(${h},55%,45%)`; ctx.fill(); text([...n][0]?.toUpperCase() || '?', x, y + 1, Math.round(r * 1.05), '#fff', 800); }
    ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = ring; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  function ago(ms) {
    if (!ms) return '';
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return 'vừa xong'; if (m < 60) return `${m} phút trước`;
    const h = Math.round(m / 60); return h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
  }

  // ---------------- sân khấu ----------------
  function drawStage(now) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.bg0); g.addColorStop(0.45, C.bg1); g.addColorStop(1, C.bg0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // đèn rọi quét
    const t = (now - t0) / 1000;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const ox = i < 2 ? -40 : W + 40, oy = 230;
      const a = (i < 2 ? 1 : -1) * (0.55 + 0.28 * Math.sin(t * (reduced ? 0 : 0.5) + i * 1.7)) + (i < 2 ? 0 : Math.PI);
      const len = 1700, spread = 0.13;
      const gr = ctx.createRadialGradient(ox, oy, 0, ox, oy, len); gr.addColorStop(0, `${C.beam}.20)`); gr.addColorStop(1, `${C.beam}0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a - spread) * len * (i < 2 ? 1 : 1), oy + Math.abs(Math.sin(a - spread)) * len);
      ctx.lineTo(ox + Math.cos(a + spread) * len, oy + Math.abs(Math.sin(a + spread)) * len);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // chấm sáng nền
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let i = 0; i < 40; i++) { const x = (i * 263) % W, y = 260 + ((i * 397) % (H - 300)); ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
  }

  function drawHeader(now) {
    const x = 60, y = 262, w = W - 120, h = 118;
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#c2185b'); g.addColorStop(1, '#7b1fa2');
    rr(x, y, w, h, 30); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = C.gold; ctx.stroke();
    // bóng đèn chớp quanh viền
    const n = 30, per = 2 * (w + h);
    const blink = Math.floor((now - t0) / (reduced ? 1e9 : 260));
    for (let i = 0; i < n; i++) {
      let d = (i / n) * per, bx, by;
      if (d < w) { bx = x + d; by = y; } else if ((d -= w) < h) { bx = x + w; by = y + d; } else if ((d -= h) < w) { bx = x + w - d; by = y + h; } else { d -= w; bx = x; by = y + h - d; }
      const on = (i + blink) % 3 !== 0;
      ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2); ctx.fillStyle = on ? '#fff7c2' : '#8a6d1f'; ctx.fill();
    }
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowOffsetY = 4; ctx.shadowBlur = 6;
    text('HÃY CHỌN GIÁ ĐÚNG', W / 2, y + 50, 58, C.gold, 900);
    ctx.restore();
    const modeTxt = S.mode === 'choice' ? '🅰️ CHỌN GIÁ A · B · C · D' : S.rule === 'not-over' ? '💬 ĐOÁN GIÁ · không vượt quá' : '💬 ĐOÁN GIÁ · gần nhất thắng';
    text(`Vòng ${S.round}/${S.rounds}  ·  ${modeTxt}`, W / 2, y + 95, 25, '#ffe9f3', 800);
  }

  // ---------------- thẻ sản phẩm ----------------
  function drawCard(now) {
    const { x, y, w, h } = CARD;
    const it = S.item || {};
    const k = reduced ? 1 : back(Math.min(1, (now - anim.roundAt) / 650));
    const sc = 0.85 + 0.15 * k;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(sc, sc); ctx.globalAlpha = Math.min(1, k + 0.2); ctx.translate(-(x + w / 2), -(y + h / 2));
    if (S.jackpot) { // viền vàng chói khi SIÊU SALE
      ctx.save(); ctx.shadowColor = C.gold; ctx.shadowBlur = 40 + 20 * Math.sin((now - t0) / 200); rr(x - 6, y - 6, w + 12, h + 12, 40); ctx.fillStyle = C.gold; ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    rr(x, y, w, h, 34); ctx.fillStyle = C.card; ctx.fill(); ctx.restore();
    // vùng ảnh
    const lines = wrap(it.name, 44, 900, w - 80, 2);
    const ix = x + 30, iy = y + 70, iw = w - 60, ih = lines.length > 1 ? 290 : 340; // tên 2 dòng → ảnh thấp lại cho đủ chỗ
    const bgk = ctx.createRadialGradient(ix + iw / 2, iy + ih / 2, 20, ix + iw / 2, iy + ih / 2, iw / 2);
    bgk.addColorStop(0, '#fff8e1'); bgk.addColorStop(1, '#f6ecff');
    rr(ix, iy, iw, ih, 24); ctx.fillStyle = bgk; ctx.fill();
    const im = img(it.image);
    if (im) {
      const r = Math.min((iw - 40) / im.naturalWidth, (ih - 30) / im.naturalHeight);
      const dw = im.naturalWidth * r, dh = im.naturalHeight * r;
      ctx.save(); rr(ix, iy, iw, ih, 24); ctx.clip(); ctx.drawImage(im, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh); ctx.restore();
    } else {
      const bob = reduced ? 0 : Math.sin((now - t0) / 600) * 8;
      ctx.save(); ctx.fillStyle = 'rgba(91,26,110,.10)'; ctx.beginPath(); ctx.ellipse(ix + iw / 2, iy + ih - 40, 170, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      text(it.emoji || '🛒', ix + iw / 2, iy + ih / 2 - 10 + bob, 230, C.ink, 400);
    }
    // nhãn trên: cửa hàng · ngành hàng
    const store = it.live || it.store ? `🏪 ${it.store || 'Siêu thị'}` : '📋 Giá tham khảo';
    const sw = measure(store, 24, 800) + 36;
    rr(x + 30, y + 18, sw, 42, 21); ctx.fillStyle = it.store ? '#e0f2fe' : '#f3e8ff'; ctx.fill();
    text(store, x + 30 + sw / 2, y + 40, 24, it.store ? '#075985' : '#6b21a8', 800);
    if (it.categoryName) { const cw = measure(it.categoryName, 22, 700) + 32; rr(x + w - 120 - cw, y + 18, cw, 42, 21); ctx.fillStyle = "#fef3c7"; ctx.fill(); text(it.categoryName, x + w - 120 - cw / 2, y + 40, 22, '#92400e', 700); }
    if (it.onSale) { // tem khuyến mãi
      ctx.save(); ctx.translate(ix + iw - 70, iy + 70); ctx.rotate(-0.25);
      ctx.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = i % 2 ? 58 : 70; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath();
      ctx.fillStyle = C.red; ctx.fill(); text('ĐANG', 0, -14, 20, '#fff', 900); text('GIẢM GIÁ', 0, 12, 18, '#fff', 900); ctx.restore();
    }
    if (S.jackpot) { ctx.save(); ctx.translate(ix + 90, iy + 60); ctx.rotate(-0.12); rr(-80, -26, 160, 52, 14); ctx.fillStyle = C.gold; ctx.fill(); text('💰 ×3 ĐIỂM', 0, 2, 24, '#7c2d12', 900); ctx.restore(); }
    // tên + quy cách
    const ny = iy + ih + 22 + (lines.length === 1 ? 26 : 0);
    lines.forEach((l, i) => text(l, x + w / 2, ny + 24 + i * 52, 44, C.ink, 900));
    if (it.unit) { const uy = ny + 24 + lines.length * 52 - 4; const uw = measure(it.unit, 28, 700) + 40; rr(x + w / 2 - uw / 2, uy - 20, uw, 42, 21); ctx.fillStyle = '#ede9fe'; ctx.fill(); text(it.unit, x + w / 2, uy + 1, 28, '#5b21b6', 700); }
    const day = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
    const note = it.live ? `Giá thật lấy tự động · cập nhật ${ago(it.updatedAt || S.catalog?.updatedAt)}` : it.store && it.asOf ? `Giá ${it.store} ngày ${day(it.asOf)}` : 'Giá bán lẻ phổ biến tại siêu thị (đã làm tròn)';
    text(note, x + w / 2, y + h - 22, 19, C.faint, 600);
    ctx.restore();
    // đồng hồ tròn góc phải trên
    if (S.phase === 'ask') drawTimer(x + w - 34, y + 30, now);
  }

  function drawTimer(cx, cy, now) {
    const left = remaining(now), k = Math.max(0, Math.min(1, left / S.phaseMs));
    const sec = Math.ceil(left / 1000);
    const urgent = sec <= 5;
    const r = 58;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fillStyle = urgent ? C.red : '#7b1fa2'; ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = urgent ? '#fff' : C.gold; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    const s = urgent && !reduced ? 1 + 0.12 * Math.max(0, 1 - ((now - recvAt + (S.remainingMs % 1000)) % 1000) / 300) : 1;
    ctx.translate(cx, cy); ctx.scale(s, s);
    text(String(sec), 0, 3, 48, '#fff', 900);
    ctx.restore();
  }

  // ---------------- nhãn giá ----------------
  function drawTag(now) {
    const y = TAG.y, h = TAG.h;
    const mask = S.mask || [null, null, null];
    const open = S.phase !== 'ask' && S.price != null;
    const boxW = 74, dotW = 26, gap = 8;
    const chars = [...mask, 'đ'];
    const inner = chars.reduce((a, c) => a + (c === '.' ? dotW : c === 'đ' ? 56 : boxW) + gap, -gap);
    const tw = Math.max(560, inner + 170), tx = (W - tw) / 2;
    // thân nhãn giá (có lỗ xỏ dây bên trái)
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    ctx.beginPath(); ctx.moveTo(tx + 60, y); ctx.lineTo(tx + tw - 24, y); ctx.arcTo(tx + tw, y, tx + tw, y + 24, 24); ctx.lineTo(tx + tw, y + h - 24); ctx.arcTo(tx + tw, y + h, tx + tw - 24, y + h, 24); ctx.lineTo(tx + 60, y + h); ctx.lineTo(tx, y + h / 2); ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#ffe066'); g.addColorStop(1, C.gold2); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = C.tagEdge; ctx.stroke();
    ctx.beginPath(); ctx.arc(tx + 44, y + h / 2, 13, 0, Math.PI * 2); ctx.fillStyle = C.bg1; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.tagEdge; ctx.stroke();
    // ô số
    const re = open ? now - anim.revealAt : 0;
    let cx = tx + 90 + (tw - 90 - 20 - inner) / 2;
    const digitsIdx = []; mask.forEach((c, i) => { if (c !== '.') digitsIdx.push(i); });
    const by = y + 26, bh = h - 52;
    chars.forEach((c, i) => {
      if (c === '.') { text('.', cx + dotW / 2, by + bh - 18, 60, '#7c2d12', 900); cx += dotW + gap; return; }
      if (c === 'đ') { text('đ', cx + 28, by + bh / 2 + 4, 64, '#7c2d12', 900); cx += 56 + gap; return; }
      rr(cx, by, boxW, bh, 14); ctx.fillStyle = '#2a1745'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(cx + 4, by + bh / 2 - 1, boxW - 8, 2);
      let ch = c, col = '#fff';
      if (open) {
        const di = digitsIdx.indexOf(i);
        const settle = reduced ? 0 : 500 + di * 260;
        if (re < settle) { ch = String(Math.floor((now / 45 + di * 3) % 10)); col = 'rgba(255,255,255,.55)'; }
        else { col = C.gold; }
      } else if (c == null) { ch = '?'; col = 'rgba(255,255,255,.35)'; }
      else col = C.gold;
      text(ch, cx + boxW / 2, by + bh / 2 + 4, 76, col, 900);
      cx += boxW + gap;
    });
    // gợi ý dưới nhãn
    const hy = y + h + 26;
    if (open && S.listPrice) text(`Giá gốc ${fmtP(S.listPrice)} → đang giảm còn ${fmtP(S.price)}`, W / 2, hy, 24, C.gold, 800);
    else if (S.range && !open) text(`🎯 Gợi ý: giá nằm trong khoảng ${fmtP(S.range[0])} – ${fmtP(S.range[1])}`, W / 2, hy, 26, '#fde68a', 800);
    else if (!open && S.mode === 'guess') text('Gõ giá vào bình luận:  35k  ·  35.000  ·  1tr2', W / 2, hy, 25, C.dim, 700);
    else if (!open && S.mode === 'choice') text('Gõ  A  B  C  hoặc  D  vào bình luận — chọn nhanh ăn nhiều điểm', W / 2, hy, 25, C.dim, 700);
  }

  // ---------------- khu chơi ----------------
  function drawGuessPlay(now) {
    const x = 60, y = PLAY.y, w = W - 120, h = PLAY.h;
    rr(x, y, w, h, 26); ctx.fillStyle = C.panel; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.panelEdge; ctx.stroke();
    const vals = S.values || [];
    if (S.phase === 'ask') text(`📝 ${fmtN(S.guesses)} người đã đoán${S.allowChange ? ' · được đổi giá' : ''}`, x + 26, y + 32, 26, C.gold, 900, 'left');
    if (S.doubles && S.phase === 'ask') text(`✖️2 · ${S.doubles} người`, x + w - 26, y + 32, 22, '#fda4af', 800, 'right');
    // thước giá
    const rx = x + 40, rw = w - 80, ry = y + 118;
    const pts = vals.slice();
    if (S.range) pts.push(S.range[0], S.range[1]);
    if (S.price != null && S.phase !== 'ask') pts.push(S.price);
    if (!pts.length) {
      text('Chưa ai đoán — chốt giá đầu tiên đi!', W / 2, ry - 4, 28, C.mute, 700);
    } else {
      let lo = Math.min(...pts), hi = Math.max(...pts);
      if (hi - lo < lo * 0.2) { lo *= 0.85; hi *= 1.15; }
      const useLog = hi / Math.max(1, lo) > 4;
      const f = (v) => (useLog ? Math.log(v) : v);
      const a = f(lo), b = f(hi), pad = (b - a) * 0.06 || 1;
      const X = (v) => rx + ((f(v) - (a - pad)) / (b - a + 2 * pad)) * rw;
      if (S.range) { const x0 = X(S.range[0]), x1 = X(S.range[1]); rr(x0, ry - 46, Math.max(6, x1 - x0), 60, 10); ctx.fillStyle = 'rgba(253,230,138,.16)'; ctx.fill(); ctx.strokeStyle = 'rgba(253,230,138,.6)'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(rx, ry + 18); ctx.lineTo(rx + rw, ry + 18); ctx.stroke();
      // chấm phiếu đoán: xếp chồng theo cột
      const cols = new Map();
      vals.forEach((v) => {
        const px = X(v), col = Math.round(px / 14);
        const n = cols.get(col) || 0; cols.set(col, n + 1);
        if (n > 5) return;
        ctx.beginPath(); ctx.arc(px, ry + 4 - n * 13, 6, 0, Math.PI * 2); ctx.fillStyle = `hsl(${(v * 7) % 360},80%,68%)`; ctx.fill();
      });
      text(fmtP(lo), rx, ry + 38, 19, C.mute, 700, 'left');
      text(fmtP(hi), rx + rw, ry + 38, 19, C.mute, 700, 'right');
      if (S.price != null && S.phase !== 'ask') {
        const k = reduced ? 1 : ease((now - anim.revealAt - 1400) / 500);
        if (k > 0) {
          const px = X(S.price);
          ctx.save(); ctx.globalAlpha = k;
          const lx = Math.max(x + 110, Math.min(x + w - 110, px));
          ctx.strokeStyle = C.green; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(px, ry - 54); ctx.lineTo(px, ry + 24); ctx.stroke();
          rr(lx - 100, ry - 96, 200, 42, 21); ctx.fillStyle = C.green; ctx.fill(); text(`GIÁ ${fmtP(S.price)}`, lx, ry - 74, 22, '#fff', 900);
          ctx.restore();
        }
      }
    }
    // phiếu mới nhất
    const rec = (S.recent || []).slice(0, 4);
    let cx = x + 26;
    rec.forEach((g) => {
      const label = `${g.name}: ${g.label}`;
      const cw = Math.min(250, measure(label, 20, 700) + 54);
      if (cx + cw > x + w - 20) return;
      rr(cx, y + h - 54, cw, 38, 19); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
      avatar(g, cx + 19, y + h - 35, 14);
      text(label, cx + 40, y + h - 34, 20, '#fff', 700, 'left', cw - 50);
      cx += cw + 10;
    });
  }

  function drawChoicePlay(now) {
    const x = 60, y = PLAY.y, w = W - 120, h = PLAY.h;
    const opts = S.options || [];
    const votes = S.votes || [0, 0, 0, 0];
    const total = Math.max(1, votes.reduce((a, b) => a + b, 0));
    const open = S.phase !== 'ask' && S.price != null;
    const showRight = open && (reduced || now - anim.revealAt > 1600);
    const gw = (w - 20) / 2, gh = (h - 20) / 2;
    opts.forEach((v, i) => {
      const bx = x + (i % 2) * (gw + 20), by = y + Math.floor(i / 2) * (gh + 20);
      const isOut = (S.out || []).includes(i);
      const right = v === S.price;
      ctx.save();
      if (isOut || (showRight && !right)) ctx.globalAlpha = 0.35;
      rr(bx, by, gw, gh, 22); ctx.fillStyle = showRight && right ? C.green : 'rgba(22,10,48,.86)'; ctx.fill();
      ctx.lineWidth = showRight && right ? 6 : 3; ctx.strokeStyle = showRight && right ? '#bbf7d0' : OPT_COLORS[i]; ctx.stroke();
      // thanh phiếu
      const k = votes[i] / total;
      if (k > 0) { ctx.save(); rr(bx, by, gw, gh, 22); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(bx, by, gw * k, gh); ctx.restore(); }
      ctx.beginPath(); ctx.arc(bx + 50, by + gh / 2, 32, 0, Math.PI * 2); ctx.fillStyle = OPT_COLORS[i]; ctx.fill();
      text(LETTERS[i], bx + 50, by + gh / 2 + 2, 38, '#fff', 900);
      text(fmtP(v), bx + 98, by + gh / 2 - 8, 40, '#fff', 900, 'left', gw - 120);
      text(`${votes[i]} phiếu`, bx + 98, by + gh / 2 + 30, 20, C.dim, 700, 'left');
      if (isOut) { ctx.strokeStyle = C.red; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(bx + 20, by + 20); ctx.lineTo(bx + gw - 20, by + gh - 20); ctx.stroke(); }
      ctx.restore();
    });
  }

  function drawResults(now) {
    const x = 60, y = PLAY.y, w = W - 120, h = PLAY.h;
    const R = S.results;
    const k = reduced ? 1 : ease((now - anim.revealAt - (R?.mode === 'guess' && R.total ? 3400 : 2200)) / 500);
    if (!R || k <= 0) return false;
    ctx.save(); ctx.globalAlpha = k;
    rr(x, y, w, h, 26); ctx.fillStyle = 'rgba(22,10,48,.94)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.gold; ctx.stroke();
    const head = !R.hit ? (R.total ? (R.over ? `😵 Không ai trúng — ${R.over} người đoán vượt giá!` : '😵 Không ai trúng vòng này') : '🤫 Không ai đoán vòng này')
      : R.exact ? `🎯 ĐÚNG GIÁ! ${R.count} người đoán chính xác` : R.mode === 'choice' ? `✅ ${R.count}/${R.total} người chọn đúng` : '🏆 Người đoán gần nhất';
    text(head, x + 26, y + 34, 28, R.exact ? C.gold : '#fff', 900, 'left', w - 52);
    if (R.mode === 'guess' && R.avg) text(`Cả phòng trung bình: ${fmtP(R.avg)}`, x + w - 26, y + 34, 20, C.mute, 700, 'right');
    (R.winners || []).slice(0, 3).forEach((r, i) => {
      const yy = y + 86 + i * 54;
      text(['🥇', '🥈', '🥉'][i], x + 44, yy, 34);
      avatar(r, x + 96, yy, 21);
      text(r.name, x + 128, yy + 1, 28, '#fff', 800, 'left', 330);
      const detail = R.mode === 'choice' ? `chọn ${r.label}` : `${r.label}  ${r.exact ? '🎯' : `(${r.pct > 0 ? '+' : ''}${String(r.pct).replace('.', ',')}%)`}`;
      text(detail, x + 480, yy + 1, 26, r.exact ? C.gold : C.dim, 800, 'left', 300);
      text(`+${fmtN(r.points)}${r.x2 ? ' ×2' : ''}`, x + w - 26, yy + 1, 30, C.gold, 900, 'right');
    });
    ctx.restore();
    return true;
  }

  // ---------------- bảng dưới ----------------
  function drawBottom() {
    const y = BOTTOM, h = Math.min(330, H - 100 - y);
    if (h < 120) return;
    drawPanel(ctx, LAYOUT, 'board', { x: 40, y }, () => {
      const bw = 560;
      rr(40, y, bw, h, 26); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.panelEdge; ctx.lineWidth = 2; ctx.stroke();
      text('🏆 BẢNG VÀNG ĐI CHỢ', 66, y + 36, 24, C.gold, 900, 'left');
      const rows = (S.board || []).slice(0, 5);
      if (!rows.length) text('Đoán trúng giá để lên bảng!', 40 + bw / 2, y + h / 2 + 10, 24, C.mute, 700);
      const rh = Math.min(52, (h - 66) / 5);
      rows.forEach((r, i) => {
        const yy = y + 66 + i * rh + rh / 2;
        text(String(i + 1), 70, yy, 22, i === 0 ? C.gold : C.dim, 900);
        avatar(r, 112, yy, 18);
        text(r.name, 142, yy + 1, 24, '#fff', 800, 'left', bw - 300);
        if (r.exact) text(`🎯${r.exact}`, 40 + bw - 140, yy + 1, 20, C.dim, 700, 'right');
        text(fmtN(r.points), 40 + bw - 24, yy + 1, 26, C.gold, 900, 'right');
      });
    });
    drawPanel(ctx, LAYOUT, 'gifts', { x: 620, y }, () => {
      const px = 620, pw = W - 40 - px;
      rr(px, y, pw, h, 26); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.panelEdge; ctx.lineWidth = 2; ctx.stroke();
      text('🎁 TẶNG QUÀ ĐỂ…', px + 24, y + 36, 22, '#f9a8d4', 900, 'left');
      const list = (S.powerups || []).slice(0, Math.max(1, Math.floor((h - 62) / 40)));
      const two = (h - 62) / Math.max(1, list.length) >= 52, ph = two ? 52 : 38;
      list.forEach((p, i) => {
        const yy = y + 66 + i * ph + ph / 2;
        text(p.icon, px + 36, yy, two ? 26 : 22);
        const what = p.action === 'hint' && S.mode === 'choice' ? 'loại 1 đáp án sai' : ACTION_TEXT[p.action] || p.action;
        const prog = p.every ? ` (${p.count}/${p.every})` : '';
        if (two) { text(p.text + prog, px + 62, yy - 10, 19, '#fff', 800, 'left', pw - 76); text(`→ ${what}`, px + 62, yy + 13, 17, C.dim, 600, 'left', pw - 76); }
        else text(`${p.text}${prog} → ${what}`, px + 60, yy + 1, 17, '#fff', 700, 'left', pw - 72);
      });
    });
  }

  // ---------------- tổng kết chương trình ----------------
  function drawSummary(now) {
    const F = S.final;
    ctx.fillStyle = 'rgba(12,5,30,.95)'; ctx.fillRect(0, 0, W, H);
    const k = reduced ? 1 : back(Math.min(1, (now - anim.roundAt) / 700));
    ctx.save(); ctx.translate(W / 2, 900); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); ctx.translate(-W / 2, -900);
    text(`🎬 TỔNG KẾT CHƯƠNG TRÌNH #${F?.show || S.show}`, W / 2, 330, 46, C.gold, 900);
    const top = F?.top || [];
    const pos = [[W / 2, 540, 230, 0], [W / 2 - 300, 600, 170, 1], [W / 2 + 300, 630, 140, 2]];
    if (!top.length) text('Chưa ai ghi điểm — chương trình sau nhé!', W / 2, 620, 32, C.dim, 700);
    pos.forEach(([cx, cy, ph, i]) => {
      const p = top[i]; if (!p) return;
      rr(cx - 120, cy + 90, 240, ph, 18); ctx.fillStyle = ['#f5c518', '#cbd5e1', '#d97706'][i]; ctx.fill();
      text(String(i + 1), cx, cy + 90 + ph / 2, 70, 'rgba(0,0,0,.35)', 900);
      avatar(p, cx, cy, i === 0 ? 62 : 50, ['#fde047', '#e2e8f0', '#fbbf24'][i]);
      text(p.name, cx, cy + 74 - (i === 0 ? 0 : 6), 28, '#fff', 800, 'center', 230);
      text(`${fmtN(p.showPoints)} điểm`, cx, cy - 84, 26, C.gold, 900);
    });
    // các món đã chơi
    const rounds = (F?.rounds || []).slice(-8);
    const ly = 960;
    rr(80, ly, W - 160, 70 + rounds.length * 58, 24); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.panelEdge; ctx.lineWidth = 2; ctx.stroke();
    text('🛒 Giỏ hàng hôm nay', 110, ly + 38, 26, C.gold, 900, 'left');
    rounds.forEach((r, i) => {
      const yy = ly + 92 + i * 58;
      text(r.emoji || '🛒', 120, yy, 30);
      text(r.name, 160, yy, 24, '#fff', 700, 'left', 470);
      text(fmtP(r.price), W - 330, yy, 26, C.gold, 900, 'right');
      text(r.winner ? `${r.exact ? '🎯' : '🏆'} ${r.winner}` : '—', W - 110, yy, 22, C.dim, 700, 'right', 200);
    });
    ctx.restore();
    text(`Chương trình mới sau ${Math.ceil(remaining(now) / 1000)} giây…`, W / 2, 1820, 26, C.dim, 700);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(12,5,30,.6)'; ctx.fillRect(0, 0, W, H);
    rr(W / 2 - 260, 860, 520, 140, 30); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.stroke();
    text('⏸️ TẠM DỪNG', W / 2, 930, 54, C.gold, 900);
  }

  // ---------------- hiệu ứng ----------------
  function burst(n = 160, y = 1100) {
    if (reduced) return;
    const cols = ['#ffd23f', '#ff3b5c', '#38bdf8', '#22c55e', '#f0abfc', '#fff'];
    for (let i = 0; i < n; i++) confetti.push({ x: W / 2 + (Math.random() - 0.5) * 300, y, vx: (Math.random() - 0.5) * 1400, vy: -600 - Math.random() * 1100, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, c: cols[i % cols.length], s: 8 + Math.random() * 10, life: 3 + Math.random() });
    if (confetti.length > 700) confetti.splice(0, confetti.length - 700);
  }
  function drawFx(dt) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.vy += 1500 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.life -= dt;
      if (p.life <= 0 || p.y > H + 40) { confetti.splice(i, 1); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.age += dt;
      if (f.age > f.life) { floaters.splice(i, 1); continue; }
      const a = Math.min(1, (f.life - f.age) / 0.4) * Math.min(1, f.age / 0.15);
      ctx.save(); ctx.globalAlpha = a;
      const yy = f.y - f.age * (f.rise ?? 50);
      const tw = measure(f.text, f.size, 900) + 40;
      rr(f.x - tw / 2, yy - f.size * 0.75, tw, f.size * 1.5, f.size * 0.75); ctx.fillStyle = 'rgba(20,8,44,.85)'; ctx.fill();
      text(f.text, f.x, yy + 2, f.size, f.color, 900, 'center', W - 80);
      ctx.restore();
    }
    if (anim.banner) {
      const b = anim.banner; b.age += dt;
      if (b.age > b.life) anim.banner = null;
      else {
        const k = reduced ? 1 : back(Math.min(1, b.age / 0.35)) * Math.min(1, (b.life - b.age) / 0.3);
        ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, k)); ctx.translate(W / 2, 830); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
        const tw = Math.min(W - 80, measure(b.text, 40, 900) + 80);
        rr(-tw / 2, -46, tw, 92, 46); ctx.fillStyle = b.color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
        text(b.text, 0, 3, 40, '#fff', 900, 'center', tw - 60);
        ctx.restore();
      }
    }
  }
  const float = (t, color = '#fde68a', y = 1180, size = 32) => { if (floaters.length > 14) floaters.shift(); floaters.push({ text: t, x: W / 2, y, color, size, life: 1.8, age: 0 }); };
  const banner = (t, color, life = 2.8) => { anim.banner = { text: t, color, age: 0, life }; };

  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    anim.shake = Math.max(0, anim.shake - dt * 2.5);
    drawStage(now);
    if (!S) { text('Đang mở cửa siêu thị…', W / 2, H / 2, 42, C.dim, 800); return; }
    ctx.save();
    if (anim.shake > 0 && !reduced) ctx.translate((Math.random() - 0.5) * 18 * anim.shake, (Math.random() - 0.5) * 18 * anim.shake);
    drawHeader(now);
    drawCard(now);
    drawTag(now);
    if (S.phase === 'reveal' && drawResults(now)) { /* bảng kết quả thay khu chơi */ }
    else if (S.mode === 'choice') drawChoicePlay(now);
    else drawGuessPlay(now);
    drawBottom();
    ctx.restore();
    // tiếng tích tắc 5 giây cuối
    if (S.phase === 'ask' && !S.paused) {
      const sec = Math.ceil(remaining(now) / 1000);
      if (sec !== anim.lastTickSec) { anim.lastTickSec = sec; if (sec <= 5 && sec > 0) sound.play('tick', sec); }
    }
    if (S.phase === 'reveal' && anim.revealSound && now - anim.revealAt > 1500) { const s = anim.revealSound; anim.revealSound = null; sound.play(s); if (s === 'fanfare') burst(220); else if (s === 'ding') burst(110); }
    drawFx(dt);
    if (S.phase === 'summary') drawSummary(now);
    if (S.paused) drawPaused();
  }
  (document.fonts?.ready || Promise.resolve()).finally(() => { if (!stopped) raf = requestAnimationFrame(frame); });

  return {
    update(s) {
      const now = performance.now();
      if (!prev || s.phase !== prev.phase || s.round !== prev.round || s.item?.id !== prev.item?.id || s.show !== prev.show) {
        if (s.phase === 'ask') anim.roundAt = now;
        if (s.phase === 'reveal') anim.revealAt = now;
        if (s.phase === 'summary') anim.roundAt = now;
      }
      if (s.item?.image) img(s.item.image);
      prev = s; S = s; recvAt = now;
    },
    effect(fx) {
      const by = fx.by?.name ? `${fx.by.name}: ` : '';
      switch (fx.type) {
        case 'cg_round': sound.play('round'); if (fx.jackpot) banner('💰 VÒNG SIÊU SALE — ×3 ĐIỂM!', '#d97706', 3); break;
        case 'cg_guess': if (!reduced) floaters.push({ text: `${fx.by.name}: ${fx.label}`, x: 200 + Math.random() * (W - 400), y: PLAY.y + 90, color: '#fff', size: 24, life: 1.4, age: 0, rise: 70 }); if (floaters.length > 14) floaters.shift(); sound.play('blip'); break;
        case 'cg_vote': sound.play('blip'); break;
        case 'cg_hint':
          if (fx.kind === 'range') banner(`🎯 ${by}khoảng giá ${fx.text}`, '#7c3aed', 3.2);
          else if (fx.kind === 'digit') banner(`🔢 ${by}lộ chữ số thứ ${fx.digits}!`, '#0284c7');
          else banner(`❌ ${by}loại đáp án ${fx.option}`, '#be123c');
          sound.play('pop'); break;
        case 'cg_time': float(`⏱️ ${by}+${fx.seconds} giây`, '#bae6fd'); sound.play('pop'); break;
        case 'cg_double': float(`✖️2 ${fx.by?.name || ''} nhân đôi điểm vòng này`, '#fda4af'); sound.play('pop'); break;
        case 'cg_jackpot': banner(fx.now ? `💰 ${by}SIÊU SALE ×3 ĐIỂM!` : `💰 ${by}vòng sau SIÊU SALE ×3!`, '#d97706', 3.2); sound.play('fanfare'); break;
        case 'cg_skip': banner(`🔄 ${by}đổi món khác`, '#7c3aed', 2.4); break;
        case 'cg_silent': banner('🤫 Phòng im quá — gõ giá thử đi!', '#7c3aed', 3); break;
        case 'cg_reveal': sound.play('drum'); anim.revealSound = fx.exact ? 'fanfare' : fx.hit ? 'ding' : 'buzz'; if (!fx.hit && fx.players) anim.shake = 0.8; break;
        case 'cg_summary': burst(260, 700); sound.play('fanfare'); break;
        case 'cg_refreshing': float('🔄 Đang cập nhật giá siêu thị…', '#bae6fd', 1000); break;
        case 'cg_catalog': if (fx.state === 'live') float(`🏪 Đã lấy ${fmtN(fx.live)} giá thật từ siêu thị`, '#bbf7d0', 1000, 26); break;
      }
    },
    resumeAudio() { sound.resume(); },
    resize() {},
    layout(m) { LAYOUT = m && typeof m === 'object' ? m : {}; },
    destroy() { stopped = true; cancelAnimationFrame(raf); sound.close(); },
  };
}

/** Âm thanh tổng hợp WebAudio (tạo lười, tắt khi mute). */
function makeSound(muted) {
  let ac = null;
  const get = () => { if (muted || typeof AudioContext === 'undefined') return null; if (!ac) { try { ac = new AudioContext(); } catch { muted = true; return null; } } return ac; };
  function tone(f, dur, { type = 'sine', vol = 0.18, at = 0, slide = 0 } = {}) {
    const a = get(); if (!a || a.state !== 'running') return;
    const s = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, s); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), s + dur);
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    o.connect(g).connect(a.destination); o.start(s); o.stop(s + dur + 0.02);
  }
  const P = {
    round: () => [523, 659, 784].forEach((f, i) => tone(f, 0.14, { type: 'triangle', at: i * 0.07 })),
    blip: () => tone(1100 + Math.random() * 300, 0.05, { type: 'square', vol: 0.03 }),
    tick: (sec) => tone(sec <= 2 ? 1400 : 1000, 0.06, { type: 'square', vol: 0.07 }),
    pop: () => tone(420, 0.1, { vol: 0.2, slide: 2.2 }),
    drum: () => { for (let i = 0; i < 18; i++) tone(110 + (i % 2) * 8, 0.06, { type: 'triangle', vol: 0.12 + i * 0.008, at: i * 0.075 }); },
    ding: () => { tone(1319, 0.4, { type: 'sine', vol: 0.2 }); tone(1760, 0.5, { type: 'sine', vol: 0.12, at: 0.08 }); },
    fanfare: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, { type: 'triangle', at: i * 0.1, vol: 0.2 })),
    buzz: () => { tone(160, 0.6, { type: 'sawtooth', vol: 0.09 }); tone(150, 0.6, { type: 'sawtooth', vol: 0.09, at: 0.02 }); },
  };
  return {
    play(n, arg) { try { P[n]?.(arg); } catch { /* bỏ qua */ } },
    resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } },
    close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; },
  };
}

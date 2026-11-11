// Renderer canvas của game Nhớ số — bố cục "bảng điều khiển trí nhớ" cho khung dọc 1080×1920.
// Không đụng DOM khi import; mọi thứ nằm trong mount(). Vùng an toàn của TikTok: chừa ~260px phía trên.
//
//  ┌ header: logo · CẤP · CHỮ SỐ · VÒNG ───────────────┐
//  │ nhãn pha: GHI NHỚ / GÕ LẠI / ĐÁP ÁN                │
//  │ ┌ màn số: ô chữ số lớn + thanh thời gian ────────┐ │
//  │ └────────────────────────────────────────────────┘ │
//  │ chip trạng thái: đã trả lời · đúng · sai · hiện lại · thêm giờ │
//  │ khu giữa: người nhanh nhất / bục vinh danh / vòng trước │
//  │ ┌ bảng điểm ─────────┐ ┌ tương tác (quà → tác dụng) ┐ │
//  └────────────────────────────────────────────────────┘
import { drawPanel } from '#sdk';
const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const C = {
  bg0: '#060a18', bg1: '#0b1430', bg2: '#101a3d',
  panel: 'rgba(14,22,50,.86)', panelHi: 'rgba(22,33,72,.92)', line: 'rgba(148,163,255,.20)',
  text: '#f1f5ff', dim: 'rgba(203,213,255,.70)', faint: 'rgba(203,213,255,.38)',
  amber: '#fbbf24', amberLo: '#f59e0b', sky: '#38bdf8', mint: '#34d399', mintLo: '#059669', rose: '#fb7185', violet: '#a78bfa', gold: '#fde047',
};
const ACTION_TEXT = { flash: 'hiện lại dãy số', time: 'thêm giờ trả lời', digit: 'lộ 1 chữ số', shield: 'khiên giữ cấp' };

/**
 * mount(el, { canvas, options }) → { update(snapshot), effect(fx), resumeAudio(), resize(), destroy() }
 * canvas: nền tảng tạo sẵn đúng kích thước manifest.canvas (1080×1920). options: { mute, debug } từ URL overlay.
 */
export function mount(el, { canvas, options = {} } = {}) {
  let LAYOUT = {}; // vị trí / cỡ / ẩn các bảng do streamer chỉnh trong Studio
  const studioPanel = (id, def, fn) => drawPanel(ctx, LAYOUT, id, def, fn);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let S = null, prev = null, recvAt = 0;
  let raf = 0, stopped = false, last = performance.now();
  const anim = { phaseAt: 0, flipAt: 0, ringAt: 0, ringColor: C.mint, wrongAt: 0, timeAt: 0, levelAt: 0, levelChange: 0, rowsAt: new Map() };
  const floaters = []; // { text, x, y, color, size, life, age }
  const confetti = []; // { x, y, vx, vy, r, rot, vr, color, life }
  const sound = makeSound(!!options.mute);

  // ---------------- tiện ích vẽ ----------------
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function panel(x, y, w, h, r = 28, { fill = C.panel, stroke = C.line, lw = 2, glow = null } = {}) {
    ctx.save();
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 36; }
    rr(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
    ctx.shadowBlur = 0;
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
    ctx.restore();
  }
  function text(s, x, y, size, color = C.text, weight = 800, align = 'center', maxW = 0) {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    let t = String(s ?? '');
    if (maxW && ctx.measureText(t).width > maxW) {
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      t += '…';
    }
    ctx.fillText(t, x, y);
    return ctx.measureText(t).width;
  }
  const measure = (s, size, weight = 800) => { ctx.font = `${weight} ${size}px ${FONT}`; return ctx.measureText(String(s)).width; };
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3));
  const back = (k) => { if (k <= 0) return 0; if (k >= 1) return 1; const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(n || 0);
  const secs = (ms) => (ms / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const avatars = new Map();
  function avatarImg(url) {
    if (!url) return null;
    let a = avatars.get(url);
    if (!a) {
      a = { img: new Image(), ok: false };
      a.img.referrerPolicy = 'no-referrer';
      a.img.onload = () => { a.ok = true; };
      a.img.src = url;
      avatars.set(url, a);
      if (avatars.size > 200) avatars.delete(avatars.keys().next().value);
    }
    return a.ok ? a.img : null;
  }
  function avatar(user, x, y, r, ring = 'rgba(255,255,255,.75)') {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    const img = avatarImg(user?.avatar);
    if (img) { ctx.save(); ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); ctx.restore(); }
    else {
      const n = user?.name || '?'; let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
      ctx.fillStyle = `hsl(${h},55%,42%)`; ctx.fill();
      text([...n][0]?.toUpperCase() || '?', x, y + 1, Math.round(r * 1.05), '#fff', 800);
    }
    ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = ring;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ---------------- dữ liệu suy ra từ snapshot ----------------
  const remaining = (now) => (S.paused ? S.remainingMs : Math.max(0, S.remainingMs - (now - recvAt)));
  const phaseColor = () => (S.flashing ? C.violet : S.phase === 'show' ? C.amber : S.phase === 'mask' ? C.rose : S.phase === 'answer' ? C.sky : C.mint);

  // ---------------- nền ----------------
  const bgDigits = Array.from({ length: 34 }, (_, i) => ({ d: String((i * 7) % 10), x: (i * 211) % W, y: (i * 389) % H, s: 50 + (i % 4) * 26, v: 8 + (i % 5) * 5 }));
  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, C.bg1); g.addColorStop(0.55, C.bg0); g.addColorStop(1, C.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // quầng màu theo pha
    const glow = ctx.createRadialGradient(W / 2, 660, 40, W / 2, 660, 760);
    glow.addColorStop(0, hexA(S ? phaseColor() : C.sky, 0.16)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    // lưới chấm
    ctx.fillStyle = 'rgba(148,163,255,.07)';
    for (let y = 30; y < H; y += 60) for (let x = 30; x < W; x += 60) ctx.fillRect(x, y, 3, 3);
    // chữ số trôi rất mờ
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of bgDigits) {
      const y = ((b.y - t * b.v) % (H + 200) + H + 200) % (H + 200) - 100;
      ctx.font = `900 ${b.s}px ${FONT}`; ctx.fillStyle = 'rgba(148,163,255,.045)';
      ctx.fillText(b.d, b.x, y);
    }
    ctx.restore();
  }

  // ---------------- header ----------------
  function drawHeader() {
    const x = 40, y = 268, w = W - 80, h = 108;
    panel(x, y, w, h, 30, { fill: C.panelHi });
    // logo
    const lx = x + 62, ly = y + h / 2;
    const lg = ctx.createLinearGradient(lx - 38, ly - 38, lx + 38, ly + 38);
    lg.addColorStop(0, C.amber); lg.addColorStop(1, C.rose);
    ctx.beginPath(); ctx.arc(lx, ly, 38, 0, Math.PI * 2); ctx.fillStyle = lg; ctx.fill();
    text('🧠', lx, ly + 2, 40);
    text('NHỚ SỐ', x + 118, ly - 15, 46, C.text, 900, 'left');
    text('Nhìn kỹ · gõ lại vào bình luận', x + 120, ly + 26, 21, C.dim, 600, 'left');
    // ô chỉ số
    const stats = [['CẤP', S.level, C.amber], ['CHỮ SỐ', S.digits, C.sky], ['VÒNG', S.round, C.violet]];
    const sw = 132, gap = 12;
    let sx = x + w - 18 - stats.length * sw - (stats.length - 1) * gap;
    const levelPop = anim.levelAt ? Math.max(0, 1 - (performance.now() - anim.levelAt) / 900) : 0;
    for (const [label, value, col] of stats) {
      const pop = label === 'CẤP' ? levelPop : 0;
      panel(sx, y + 14, sw, h - 28, 20, { fill: 'rgba(255,255,255,.05)', stroke: hexA(col, 0.45 + pop * 0.5), lw: 2 + pop * 3, glow: pop ? col : null });
      text(label, sx + sw / 2, y + 36, 17, hexA(col, 0.95), 800);
      text(String(value), sx + sw / 2, y + 70, 38 + pop * 10, C.text, 900);
      sx += sw + gap;
    }
  }

  // ---------------- nhãn pha ----------------
  function drawPhase(now) {
    const label = S.paused ? '⏸  TẠM DỪNG'
      : S.flashing ? '👀  NHÌN LẠI NHANH!'
      : S.phase === 'show' ? '👀  GHI NHỚ DÃY SỐ!'
      : S.phase === 'mask' ? '🌀  NHIỄU… GIỮ SỐ TRONG ĐẦU!'
      : S.phase === 'answer' ? '⌨️  GÕ LẠI VÀO BÌNH LUẬN'
      : S.correct.length ? '✅  ĐÁP ÁN' : '⏳  ĐÁP ÁN';
    const col = S.paused ? C.rose : phaseColor();
    const k = back((now - anim.phaseAt) / 450);
    const w = measure(label, 34, 900) + 90, h = 64, x = (W - w) / 2, y = 404;
    ctx.save();
    ctx.translate(W / 2, y + h / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-W / 2, -(y + h / 2));
    panel(x, y, w, h, 32, { fill: hexA(col, 0.18), stroke: col, lw: 3, glow: hexA(col, 0.6) });
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);
    ctx.beginPath(); ctx.arc(x + 30, y + h / 2, 7 + pulse * 2, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    text(label, W / 2 + 14, y + h / 2 + 1, 34, C.text, 900);
    ctx.restore();
  }

  // ---------------- màn số ----------------
  function digitRows(n) { return n <= 7 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)]; }
  function drawDisplay(now) {
    const x = 40, y = 490, w = W - 80;
    const rows = digitRows(S.digits);
    const maxPerRow = Math.max(...rows);
    const gap = 14, groupGap = 18;
    const grouped = (n) => (n >= 6 ? Math.ceil(n / 3) - 1 : 0); // chia nhóm 3 chỉ khi hàng dài (dễ nhớ hơn)
    const groups = grouped(maxPerRow);
    const size = Math.min(124, Math.floor((w - 80 - gap * (maxPerRow - 1) - groupGap * groups) / maxPerRow));
    const th = Math.round(size * 1.28);
    const rowGap = 22;
    const tilesH = rows.length * th + (rows.length - 1) * rowGap;
    const h = 64 + tilesH + 120;
    const col = phaseColor();
    const ring = anim.ringAt ? Math.max(0, 1 - (now - anim.ringAt) / 700) : 0;
    panel(x, y, w, h, 34, { fill: C.panel, stroke: ring ? hexA(anim.ringColor, 0.5 + ring / 2) : hexA(col, 0.55), lw: 3 + ring * 5, glow: hexA(ring ? anim.ringColor : col, 0.35 + ring * 0.4) });
    // nhãn nhỏ phía trên
    const speed = `${(S.perDigitMs / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} giây / chữ số`;
    const sub = S.phase === 'mask' ? 'Đừng nhìn số nhiễu, nhớ dãy vừa rồi!' : S.phase === 'answer' && !S.flashing ? `Dãy ${S.digits} chữ số đã ẩn — bạn còn nhớ không?` : S.phase === 'reveal' ? `Đáp án vòng ${S.round}` : S.style === 'flash' ? `${S.digits} chữ số · loé từng chữ · ${speed}` : `${S.digits} chữ số · ${speed}`;
    text(sub, W / 2, y + 38, 24, C.dim, 700);

    const visible = !!S.number;
    // từng chữ số: tự tính chữ số đang loé theo thời gian (mượt kể cả 0,1 giây / chữ)
    let flashIdx = -1;
    if (S.seq) {
      const el = S.seq.elapsedMs + (S.paused ? 0 : now - recvAt) - S.seq.lead;
      if (el >= 0) { const i = Math.floor(el / S.seq.per); if (i < S.seq.digits.length && el % S.seq.per < S.seq.per * 0.78) flashIdx = i; }
    }
    let idx = 0;
    rows.forEach((n, ri) => {
      const g = grouped(n);
      const total = n * size + (n - 1) * gap + g * groupGap;
      let tx = (W - total) / 2;
      const ty = y + 64 + ri * (th + rowGap);
      for (let i = 0; i < n; i++, idx++) {
        const peeked = !visible && S.partial && S.partial[idx] !== '?' ? S.partial[idx] : null;
        const ch = S.phase === 'mask' ? String((Math.floor(now / 70) * 7 + idx * 13 + Math.floor(now / 230) * 3) % 10)
          : S.seq ? (idx === flashIdx ? S.seq.digits[idx] : null)
          : visible ? S.number[idx] : peeked;
        drawTile(tx, ty, size, th, idx, ch, now, !!peeked, S.seq && idx === flashIdx);
        tx += size + gap + (g && (i + 1) % 3 === 0 && i < n - 1 ? groupGap : 0);
      }
    });
    drawTimer(x + 40, y + h - 76, w - 80, now);
    return y + h;
  }

  function drawTile(x, y, w, h, i, ch, now, peeked = false, lit = false) {
    // vào vòng mới: rơi xuống lần lượt; đổi hiện ↔ ẩn: lật dọc lần lượt
    const drop = S.phase === 'show' && !reduced ? back((now - anim.phaseAt - i * 55) / 420) : 1;
    const flipK = reduced || S.seq || S.phase === 'mask' ? 1 : Math.min(1, (now - anim.flipAt - i * 45) / 300);
    const sy = flipK < 1 ? Math.abs(Math.cos(flipK * Math.PI)) : 1;
    const showFace = flipK < 0.5 ? !ch : !!ch; // nửa đầu lật vẫn là mặt cũ
    const face = flipK < 1 ? showFace : !!ch;
    const cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, drop * 1.4));
    ctx.translate(cx, cy - (1 - drop) * 120); ctx.scale(1, Math.max(0.02, sy)); ctx.translate(-cx, -cy);
    if (face && ch != null) {
      const [a, b, ink] = S.phase === 'mask' ? ['#e5e7eb', '#6b7280', '#111827'] : peeked ? ['#e0f2fe', C.sky, '#082f49'] : S.flashing ? ['#ddd6fe', C.violet, '#2e1065'] : S.phase === 'reveal' ? ['#a7f3d0', C.mint, '#022c22'] : ['#fef3c7', C.amber, '#3b2300'];
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, a); g.addColorStop(1, b);
      ctx.shadowColor = hexA(b, 0.7); ctx.shadowBlur = 26;
      rr(x, y, w, h, Math.round(w * 0.2)); ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0;
      rr(x + 4, y + 4, w - 8, h * 0.42, Math.round(w * 0.16)); ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill();
      text(ch, cx, cy + h * 0.04, Math.round(w * 0.86), ink, 900);
    } else {
      rr(x, y, w, h, Math.round(w * 0.2)); ctx.fillStyle = 'rgba(255,255,255,.055)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = hexA(S.phase === 'answer' ? C.sky : C.line, S.phase === 'answer' ? 0.55 : 1); ctx.stroke();
      const wob = reduced ? 0 : Math.sin(now / 320 + i * 0.9) * 5;
      if (!S.seq) text('?', cx, cy + wob, Math.round(w * 0.62), 'rgba(186,230,253,.55)', 900); // đang loé từng chữ: ô trống, không gợi ý
      else text(String(i + 1), cx, cy, Math.round(w * 0.28), 'rgba(255,255,255,.18)', 800);
    }
    ctx.restore();
  }

  function drawTimer(x, y, w, now) {
    const rem = remaining(now);
    const frac = Math.max(0, Math.min(1, rem / S.phaseMs));
    const urgent = S.phase === 'answer' && rem < 5000 && !S.paused;
    const col = urgent ? C.rose : phaseColor();
    const bw = w - 150, h = 26;
    rr(x, y + 12, bw, h, h / 2); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
    if (frac > 0) {
      const g = ctx.createLinearGradient(x, 0, x + bw, 0);
      g.addColorStop(0, hexA(col, 0.75)); g.addColorStop(1, col);
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 18;
      rr(x, y + 12, Math.max(h, bw * frac), h, h / 2); ctx.fillStyle = g; ctx.fill();
      ctx.restore();
    }
    // vạch chia từng giây cho pha trả lời
    if (S.phase === 'answer') {
      const n = Math.round(S.phaseMs / 1000);
      ctx.fillStyle = 'rgba(6,10,24,.45)';
      for (let k = 1; k < n && n <= 60; k++) ctx.fillRect(x + (bw * k) / n - 1, y + 14, 2, h - 4);
    }
    const timePop = anim.timeAt ? Math.max(0, 1 - (now - anim.timeAt) / 800) : 0;
    const blink = urgent && Math.floor(now / 250) % 2 === 0;
    const label = S.phase === 'reveal' ? `${Math.ceil(rem / 1000)}s` : rem < 10000 && S.phase === 'show' ? `${secs(rem)}s` : `${Math.ceil(rem / 1000)}s`;
    text(label, x + w, y + 25, 46 + timePop * 14, blink ? '#fff' : timePop ? C.sky : col, 900, 'right');
  }

  // ---------------- chip trạng thái ----------------
  function chip(x, y, label, col, { active = true, shake = 0 } = {}) {
    const w = measure(label, 24, 800) + 40, h = 52;
    const dx = shake ? Math.sin(shake * 40) * 8 * shake : 0;
    panel(x + dx, y, w, h, 26, { fill: active ? hexA(col, 0.14) : 'rgba(255,255,255,.04)', stroke: active ? hexA(col, 0.7) : C.line, lw: 2 });
    text(label, x + dx + w / 2, y + h / 2 + 1, 24, active ? C.text : C.faint, 800);
    return w;
  }
  function drawStatus(y, now) {
    const wrongShake = anim.wrongAt ? Math.max(0, 1 - (now - anim.wrongAt) / 400) : 0;
    const left = [
      [`👥 ${fmtN(S.answered)} đã trả lời`, C.sky, true, 0],
      [`✅ ${fmtN(S.correct.length)}`, C.mint, S.correct.length > 0, 0],
      [`❌ ${fmtN(S.wrong)}`, C.rose, S.wrong > 0, wrongShake],
    ];
    const hasFlash = (S.powerups || []).some((p) => p.action === 'flash');
    const hasTime = (S.powerups || []).some((p) => p.action === 'time');
    const right = [];
    if (hasFlash) right.push([S.flashUsed ? '👀 đã hiện lại' : '👀 còn 1 lần xem', C.violet, !S.flashUsed && S.phase === 'answer']);
    if (hasTime && S.extra > 0) right.push([`⏱️ +${S.extra}s`, C.sky, true]);
    if (S.shields > 0) right.push([`🛡️ ×${S.shields}`, C.amber, true]);
    let x = 40;
    for (const [l, c, a, sh] of left) x += chip(x, y, l, c, { active: a, shake: sh }) + 10;
    let rx = W - 40;
    for (const [l, c, a] of right.reverse()) {
      const w = measure(l, 24, 800) + 40;
      if (rx - w < x + 10) break; // không đủ chỗ thì bỏ bớt
      rx -= w; chip(rx, y, l, c, { active: a }); rx -= 10;
    }
    return y + 52;
  }

  // ---------------- khu giữa (theo pha) ----------------
  function drawMiddle(y0, y1, now) {
    if (S.phase === 'reveal') return drawReveal(y0, y1, now);
    if (S.phase === 'answer' && S.correct.length) return drawFastest(y0, y1, now);
    if (S.phase === 'answer') return drawPrompt(y0, y1, now);
    return drawLastRound(y0, y1, now);
  }

  function drawFastest(y0, y1, now) {
    const x = 40, w = W - 80;
    const rows = S.correct.slice(0, 4);
    const rh = 60;
    const h = 64 + rows.length * rh + 14;
    panel(x, y0, w, h, 28, { stroke: hexA(C.mint, 0.45) });
    text('⚡ NHỚ ĐÚNG NHANH NHẤT', x + 30, y0 + 34, 26, C.mint, 900, 'left');
    if (S.correct.length > rows.length) text(`+${S.correct.length - rows.length} người khác`, x + w - 30, y0 + 34, 22, C.dim, 700, 'right');
    const medals = ['🥇', '🥈', '🥉'];
    rows.forEach((r, i) => {
      const born = anim.rowsAt.get(r.id) ?? 0;
      const k = reduced ? 1 : back((now - born) / 420);
      const yy = y0 + 64 + i * rh;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.3);
      ctx.translate((1 - k) * -80, 0);
      rr(x + 16, yy + 4, w - 32, rh - 8, 16); ctx.fillStyle = i === 0 ? 'rgba(52,211,153,.16)' : 'rgba(255,255,255,.045)'; ctx.fill();
      text(medals[i] || `${i + 1}`, x + 52, yy + rh / 2, i < 3 ? 30 : 24, C.dim, 900);
      avatar(r, x + 104, yy + rh / 2, 20, i === 0 ? C.gold : 'rgba(255,255,255,.7)');
      text(r.name, x + 138, yy + rh / 2 + 1, 28, C.text, 800, 'left', w - 420);
      text(`${r.streak >= 2 ? `🔥${r.streak}  ` : ''}${secs(r.ms)}s`, x + w - 170, yy + rh / 2 + 1, 24, r.streak >= 2 ? C.amber : C.dim, 700, 'right');
      text(`+${r.points}`, x + w - 36, yy + rh / 2 + 1, 32, C.mint, 900, 'right');
      ctx.restore();
    });
  }

  function drawPrompt(y0, y1, now) {
    const x = 40, w = W - 80, h = Math.min(250, y1 - y0);
    panel(x, y0, w, h, 28, { stroke: hexA(C.sky, 0.4) });
    const bob = reduced ? 0 : Math.sin(now / 400) * 6;
    text('💬', W / 2 - 330, y0 + 76 + bob, 64);
    text('Gõ lại dãy số vào bình luận!', W / 2 + 40, y0 + 60, 40, C.text, 900);
    text('Mỗi người 1 lần · nhanh hơn = nhiều điểm hơn', W / 2 + 40, y0 + 108, 24, C.dim, 600);
    // ai vừa trả lời (không lộ số, không lộ đúng / sai trước giờ đáp án)
    const recent = (S.recent || []).slice(0, 6);
    if (recent.length) {
      const r = 26, gap = 14;
      const label = 'Vừa trả lời:';
      const lw = measure(label, 22, 700);
      const total = lw + 16 + recent.length * (r * 2) + (recent.length - 1) * gap;
      let ax = (W - total) / 2;
      text(label, ax, y0 + h - 56, 22, C.faint, 700, 'left');
      ax += lw + 16 + r;
      for (const u of recent) { avatar(u, ax, y0 + h - 56, r, hexA(C.sky, 0.8)); ax += r * 2 + gap; }
    } else {
      text('Chưa có ai trả lời — bạn sẽ là người đầu tiên?', W / 2, y0 + h - 56, 24, C.faint, 600);
    }
  }

  function drawReveal(y0, y1, now) {
    const x = 40, w = W - 80;
    const winners = S.correct.slice(0, 3);
    const h = Math.min(330, y1 - y0);
    panel(x, y0, w, h, 28, { stroke: hexA(winners.length ? C.gold : C.rose, 0.5) });
    if (!winners.length) {
      text('😅 Chưa ai nhớ đúng vòng này', W / 2, y0 + 92, 40, C.text, 900);
      const left = (S.failsToLevelDown || 2) - (S.fails || 0);
      const sub = S.last?.levelChange < 0 ? `⬇ Giảm xuống cấp ${S.level} — dãy số ngắn lại` : `Sai thêm ${left} vòng nữa sẽ giảm cấp`;
      text(sub, W / 2, y0 + 150, 26, C.rose, 700);
      if (S.wrong) text(`${fmtN(S.wrong)} câu trả lời sai`, W / 2, y0 + 200, 22, C.faint, 600);
      return;
    }
    // bục vinh danh: 2 · 1 · 3
    // mỗi bục: khối (tên + điểm) · avatar phía trên · vương miện cho hạng 1; co lại khi khu giữa thấp
    const f = Math.max(0.6, Math.min(1, (h - 70) / 260));
    const order = [1, 0, 2].filter((i) => winners[i]);
    const slots = { 0: [W / 2, 110], 1: [W / 2 - 300, 92], 2: [W / 2 + 300, 80] };
    const baseY = y0 + h - 22;
    for (const i of order) {
      const wnr = winners[i];
      const [cx, bh0] = slots[i];
      const k = reduced ? 1 : back((now - anim.phaseAt - (2 - i) * 160) / 500);
      const ph = bh0 * f * k;
      const col = [C.gold, '#cbd5e1', '#f0a26b'][i];
      const g = ctx.createLinearGradient(0, baseY - ph, 0, baseY);
      g.addColorStop(0, hexA(col, 0.5)); g.addColorStop(1, hexA(col, 0.1));
      rr(cx - 130, baseY - ph, 260, ph, 18); ctx.fillStyle = g; ctx.fill();
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.5);
      text(wnr.name, cx, baseY - ph + 30 * f, Math.round(25 * f), C.text, 800, 'center', 240);
      text(`+${wnr.points} · ${secs(wnr.ms)}s`, cx, baseY - ph + 62 * f, Math.round(21 * f), C.mint, 800);
      const r = (i === 0 ? 46 : 38) * f;
      const ay = baseY - ph - r - 8;
      avatar(wnr, cx, ay, r, col);
      ctx.beginPath(); ctx.arc(cx + r * 0.75, ay + r * 0.75, 15 * f, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      text(String(i + 1), cx + r * 0.75, ay + r * 0.75 + 1, Math.round(18 * f), '#1e1b4b', 900);
      if (i === 0) text('👑', cx, ay - r - 18 * f, Math.round(38 * f));
      ctx.restore();
    }
    if (S.last?.levelChange > 0) text(`⬆ LÊN CẤP ${S.level}!`, x + 30, y0 + 36, 26, C.amber, 900, 'left');
    text(`${fmtN(S.correct.length)} người nhớ đúng`, x + w - 30, y0 + 36, 22, C.dim, 700, 'right');
  }

  function drawLastRound(y0, y1, now) {
    const x = 40, w = W - 80, h = Math.min(220, y1 - y0);
    panel(x, y0, w, h, 28);
    const L = S.last;
    if (!L) {
      text('Cách chơi', W / 2, y0 + 44, 24, C.dim, 800);
      text('1. Nhìn dãy số   2. Số biến mất   3. Gõ lại vào bình luận', W / 2, y0 + 100, 27, C.text, 800, 'center', w - 60);
      text(`Có người đúng → lên cấp, dãy số dài thêm · cao nhất hôm nay: cấp ${S.bestLevel || S.level}`, W / 2, y0 + 156, 22, C.faint, 600, 'center', w - 60);
      return;
    }
    text(`VÒNG TRƯỚC (#${L.round})`, x + 30, y0 + 38, 22, C.dim, 800, 'left');
    text(`Kỷ lục hôm nay: cấp ${S.bestLevel || S.level}`, x + w - 30, y0 + 38, 22, C.amber, 800, 'right');
    // dãy số vòng trước dạng ô nhỏ
    const n = L.number.length, size = Math.min(56, Math.floor((w - 80 - (n - 1) * 8) / n)), gap = 8;
    let tx = (W - (n * size + (n - 1) * gap)) / 2;
    for (const ch of L.number) {
      rr(tx, y0 + 68, size, size * 1.2, 10); ctx.fillStyle = 'rgba(52,211,153,.18)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = hexA(C.mint, 0.5); ctx.stroke();
      text(ch, tx + size / 2, y0 + 68 + size * 0.62, size * 0.8, '#a7f3d0', 900);
      tx += size + gap;
    }
    const res = L.correct ? `✅ ${fmtN(L.correct)} người nhớ đúng${L.levelChange > 0 ? ' · đã lên cấp' : ''}` : `😅 Không ai nhớ đúng${L.levelChange < 0 ? ' · đã giảm cấp' : ''}`;
    text(res, W / 2, y0 + h - 40, 25, L.correct ? C.mint : C.rose, 800);
  }

  // ---------------- hàng dưới: bảng điểm + tương tác ----------------
  function drawBoard(x, y, w, h) {
    panel(x, y, w, h, 28, { stroke: hexA(C.gold, 0.35) });
    text('🏆 BẢNG ĐIỂM', x + 28, y + 38, 26, C.gold, 900, 'left');
    const rows = (S.board || []).slice(0, 5);
    if (!rows.length) { text('Chưa ai ghi điểm', x + w / 2, y + h / 2 + 10, 24, C.faint, 700); return; }
    const rh = Math.min(58, (h - 72) / 5);
    rows.forEach((r, i) => {
      const yy = y + 70 + i * rh;
      rr(x + 14, yy + 3, w - 28, rh - 6, 14); ctx.fillStyle = i === 0 ? 'rgba(253,224,71,.14)' : 'rgba(255,255,255,.04)'; ctx.fill();
      const badge = ['#fde047', '#cbd5e1', '#f0a26b'][i];
      ctx.beginPath(); ctx.arc(x + 44, yy + rh / 2, 15, 0, Math.PI * 2); ctx.fillStyle = badge ? hexA(badge, 0.9) : 'rgba(255,255,255,.12)'; ctx.fill();
      text(String(i + 1), x + 44, yy + rh / 2 + 1, 18, badge ? '#1e1b4b' : C.dim, 900);
      avatar(r, x + 88, yy + rh / 2, 19);
      text(r.name, x + 118, yy + rh / 2 + 1, 25, C.text, 800, 'left', w - 300);
      text(r.streak >= 2 ? `🔥${r.streak}` : `✓${r.correct}`, x + w - 126, yy + rh / 2 + 1, 20, r.streak >= 2 ? C.amber : C.mint, 800, 'right');
      text(fmtN(r.points), x + w - 28, yy + rh / 2 + 1, 27, C.gold, 900, 'right');
    });
  }

  function drawPowerups(x, y, w, h) {
    panel(x, y, w, h, 28, { stroke: hexA(C.violet, 0.4) });
    text('🎁 TƯƠNG TÁC', x + 26, y + 38, 26, C.violet, 900, 'left');
    const items = [
      { icon: '💬', text: 'Gõ số vào bình luận', sub: 'mỗi người 1 lần / vòng' },
      ...(S.powerups || []).map((p) => ({ icon: p.icon, text: `${p.text}`, sub: `→ ${ACTION_TEXT[p.action] || p.action}`, every: p.every, count: p.count })),
    ].slice(0, 4);
    const rh = Math.min(70, (h - 70) / items.length);
    items.forEach((it, i) => {
      const yy = y + 66 + i * rh;
      text(it.icon, x + 46, yy + rh / 2, 32);
      text(it.text, x + 80, yy + rh / 2 - 13, 23, C.text, 800, 'left', w - 100);
      text(it.sub, x + 80, yy + rh / 2 + 15, 19, C.dim, 600, 'left', w - 100);
      if (it.every > 1) {
        const bw = w - 110, by = yy + rh - 6;
        rr(x + 80, by, bw, 6, 3); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
        rr(x + 80, by, Math.max(6, bw * (it.count / it.every)), 6, 3); ctx.fillStyle = C.violet; ctx.fill();
      }
    });
  }

  // ---------------- hiệu ứng ----------------
  function burst(n = 160) {
    if (reduced) return;
    const cols = [C.gold, C.mint, C.sky, C.rose, C.violet, '#fff'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 700 + Math.random() * 900;
      confetti.push({ x: W / 2 + (Math.random() - 0.5) * 200, y: 760, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 6 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, color: cols[i % cols.length], life: 2.6 });
    }
    if (confetti.length > 900) confetti.splice(0, confetti.length - 900);
  }
  function drawFx(dt) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.vy += 1400 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt;
      if (p.life <= 0 || p.y > H + 40) { confetti.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) { floaters.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
      ctx.lineJoin = 'round'; ctx.font = `900 ${f.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const yy = f.y - ease(k) * 110;
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(6,10,24,.85)'; ctx.strokeText(f.text, f.x, yy);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, yy);
      ctx.restore();
    }
  }
  function drawLevelBanner(now) {
    if (!anim.levelAt) return;
    const k = (now - anim.levelAt) / 2200;
    if (k >= 1) return;
    const up = anim.levelChange > 0;
    const record = anim.record, shield = anim.shieldBanner;
    const a = k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.75) / 0.25);
    const s = back(Math.min(1, k / 0.18));
    ctx.save(); ctx.globalAlpha = a;
    // đè lên nhãn pha (không che đáp án / bục vinh danh)
    const cy = 436;
    ctx.translate(W / 2, cy); ctx.scale(s, s); ctx.translate(-W / 2, -cy);
    const col = shield ? C.sky : record ? C.gold : up ? C.amber : C.rose;
    panel(W / 2 - 320, cy - 56, 640, 112, 36, { fill: 'rgba(10,14,34,.96)', stroke: col, lw: 4, glow: col });
    text(shield ? '🛡️ KHIÊN GIỮ CẤP!' : record ? `🏆 KỶ LỤC MỚI: CẤP ${S.level}` : up ? `⬆ LÊN CẤP ${S.level}` : `⬇ XUỐNG CẤP ${S.level}`, W / 2, cy - 14, 48, col, 900);
    text(shield ? `Không ai nhớ được nhưng vẫn giữ cấp ${S.level}` : record ? 'Cao nhất từ đầu buổi live — giữ vững nhé!' : up ? 'Cả phòng nhớ giỏi — dãy số sẽ khó dần!' : 'Chưa ai nhớ được — giảm độ khó một chút', W / 2, cy + 30, 22, C.dim, 700);
    ctx.restore();
  }
  function drawPaused() {
    ctx.save();
    ctx.fillStyle = 'rgba(4,7,18,.55)'; ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 360, H / 2 - 110, 720, 220, 40, { fill: 'rgba(14,22,50,.96)', stroke: C.amber, lw: 4 });
    text('⏸ TẠM DỪNG', W / 2, H / 2 - 30, 64, C.amber, 900);
    text('Quay lại ngay thôi!', W / 2, H / 2 + 48, 30, C.dim, 700);
    ctx.restore();
  }

  /** Chữ "+điểm" của người đúng: xếp thành cột (tối đa 4), không chồng lên nhau khi nhiều người đúng cùng lúc. */
  function addOk(label) {
    const live = floaters.filter((f) => f.ok);
    if (live.length >= 4) floaters.splice(floaters.indexOf(live[0]), 1);
    const used = new Set(floaters.filter((f) => f.ok).map((f) => f.slot));
    let slot = 0; while (used.has(slot)) slot++;
    floaters.push({ text: label, x: W / 2, y: 640 + slot * 62, slot, ok: true, color: '#a7f3d0', size: 42, life: 1.6, age: 0 });
  }

  // ---------------- khung hình ----------------
  function frame() {
    if (stopped) return;
    const now = performance.now(); // cùng mốc với recvAt / anim.* (timestamp của rAF có thể lệch mốc)
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    drawBackground(now / 1000);
    if (!S) { text('Đang chuẩn bị dãy số…', W / 2, H / 2, 44, C.dim, 800); return; }
    drawHeader();
    drawPhase(now);
    const dispBottom = drawDisplay(now);
    const statusBottom = drawStatus(dispBottom + 22, now);
    const bottomY = Math.max(statusBottom + 300, 1290);
    drawMiddle(statusBottom + 22, bottomY - 22, now);
    const bh = Math.min(380, H - 260 - bottomY);
    drawBoard(40, bottomY, 590, bh);
    studioPanel('gifts', { x: 650, y: bottomY }, () => drawPowerups(650, bottomY, W - 690, bh));
    drawFx(dt);
    drawLevelBanner(now);
    if (S.paused) drawPaused();
  }
  (document.fonts?.ready || Promise.resolve()).finally(() => { if (!stopped) raf = requestAnimationFrame(frame); });

  return {
    update(s) {
      const now = performance.now();
      if (!prev || s.round !== prev.round || s.phase !== prev.phase) {
        anim.phaseAt = now;
        if (prev && s.round === prev.round && s.phase === 'answer') anim.flipAt = now; // số lật úp khi ẩn
        if (prev && s.phase === 'reveal') anim.flipAt = now;
        if (s.round !== prev?.round) anim.rowsAt.clear();
      }
      if (prev && s.flashing !== prev.flashing) anim.flipAt = now;
      for (const c of s.correct || []) if (!anim.rowsAt.has(c.id)) anim.rowsAt.set(c.id, now);
      prev = s; S = s; recvAt = now;
    },
    effect(fx) {
      const now = performance.now();
      switch (fx.type) {
        case 'mm_show': sound.play('show'); break;
        case 'mm_hide': sound.play('hide'); break;
        case 'mm_correct':
          anim.ringAt = now; anim.ringColor = C.mint;
          addOk(`${fx.rank <= 3 ? ['🥇', '🥈', '🥉'][fx.rank - 1] + ' ' : ''}${fx.by.name} +${fx.points}`);
          sound.play('correct', fx.rank);
          break;
        case 'mm_wrong': anim.wrongAt = now; sound.play('wrong'); break;
        case 'mm_flash': anim.ringAt = now; anim.ringColor = C.violet; floaters.push({ text: '👀 Hiện lại!', x: W / 2, y: 720, color: '#ddd6fe', size: 52, life: 1.4, age: 0 }); sound.play('flash'); break;
        case 'mm_time': anim.timeAt = now; floaters.push({ text: `⏱️ +${fx.seconds} giây`, x: W - 220, y: 860, color: '#bae6fd', size: 44, life: 1.4, age: 0 }); sound.play('time'); break;
        case 'mm_reveal':
          if (fx.correct) { burst(fx.correct > 3 ? 220 : 140); sound.play('win'); } else sound.play('fail');
          anim.record = !!fx.record; anim.shieldBanner = !!fx.shielded;
          if (fx.levelChange || fx.shielded) { anim.levelAt = now; anim.levelChange = fx.levelChange; }
          break;
        case 'mm_digit': anim.ringAt = now; anim.ringColor = C.sky; floaters.push({ text: '🔍 Lộ 1 chữ số!', x: W / 2, y: 720, color: '#bae6fd', size: 48, life: 1.4, age: 0 }); sound.play('flash'); break;
        case 'mm_shield': floaters.push({ text: `🛡️ Khiên ×${fx.shields}`, x: W - 220, y: 860, color: '#fde68a', size: 44, life: 1.4, age: 0 }); sound.play('time'); break;
        case 'mm_board_cleared': floaters.push({ text: 'Đã xoá bảng điểm', x: W / 2, y: 1300, color: C.dim, size: 34, life: 1.4, age: 0 }); break;
      }
    },
    resumeAudio() { sound.resume(); },
    resize() {},
    layout(m) { LAYOUT = m && typeof m === 'object' ? m : {}; },
    destroy() { stopped = true; cancelAnimationFrame(raf); sound.close(); },
  };
}

/** '#rrggbb' + alpha → rgba(). */
function hexA(hex, a) {
  if (!hex.startsWith('#')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Âm thanh tổng hợp bằng WebAudio (không cần file): tạo lười, tắt hẳn khi mute. */
function makeSound(muted) {
  let ac = null;
  const get = () => {
    if (muted || typeof AudioContext === 'undefined') return null;
    if (!ac) { try { ac = new AudioContext(); } catch { muted = true; return null; } }
    return ac;
  };
  function tone(freq, dur, { type = 'sine', vol = 0.18, at = 0, slide = 0 } = {}) {
    const a = get();
    if (!a || a.state !== 'running') return;
    const t0 = a.currentTime + at;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const P = {
    show: () => { tone(660, 0.12, { type: 'triangle' }); tone(990, 0.16, { type: 'triangle', at: 0.09 }); },
    hide: () => tone(520, 0.22, { type: 'sine', slide: 0.5, vol: 0.12 }),
    correct: (rank = 1) => { const f = 880 * Math.pow(1.06, Math.max(0, 4 - rank)); tone(f, 0.12, { type: 'triangle' }); tone(f * 1.5, 0.18, { type: 'triangle', at: 0.07 }); },
    wrong: () => tone(180, 0.12, { type: 'square', vol: 0.05 }),
    flash: () => tone(740, 0.3, { type: 'sine', slide: 1.6, vol: 0.14 }),
    time: () => { tone(600, 0.08); tone(800, 0.08, { at: 0.08 }); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', at: i * 0.09 })),
    fail: () => { tone(330, 0.25, { type: 'sawtooth', vol: 0.06, slide: 0.7 }); tone(247, 0.35, { type: 'sawtooth', vol: 0.06, at: 0.2, slide: 0.7 }); },
  };
  return {
    play(name, arg) { try { P[name]?.(arg); } catch { /* bỏ qua */ } },
    resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } },
    close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; },
  };
}

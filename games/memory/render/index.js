// Renderer canvas của game Nhớ số. Không đụng DOM khi import; mọi thứ nằm trong mount().
const FONT = "'Be Vietnam Pro', system-ui, sans-serif";

/**
 * mount(el, { canvas, sound, i18n }) → { update(snapshot), effect(fx), resize(), destroy() }
 * canvas: nền tảng tạo sẵn đúng kích thước manifest.canvas (1080×1920).
 */
export function mount(el, { canvas, sound = null } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let S = null; // snapshot mới nhất
  let raf = 0;
  const pops = []; // hiệu ứng chữ bay: { text, color, t0 }
  let flashT = 0;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function text(s, x, y, size, color = '#fff', weight = 800, align = 'center') {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }

  function drawDigits(s, t) {
    const n = s.digits;
    const gap = 14;
    const size = Math.min(150, Math.floor((W - 120 - gap * (n - 1)) / n));
    const total = n * size + gap * (n - 1);
    let x = (W - total) / 2;
    const y = 700;
    for (let i = 0; i < n; i++) {
      roundRect(x, y, size, size * 1.3, 22);
      ctx.fillStyle = s.number ? '#fef3c7' : 'rgba(255,255,255,.08)'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = s.flashing ? '#f472b6' : '#fbbf24'; ctx.stroke();
      const ch = s.number ? s.number[i] : '?';
      const wob = s.number ? 0 : Math.sin(t / 300 + i) * 4;
      text(ch, x + size / 2, y + size * 0.65 + wob, size * 0.8, s.number ? '#1e1b4b' : 'rgba(255,255,255,.55)', 900);
      x += size + gap;
    }
  }

  function bar(s) {
    const frac = Math.max(0, Math.min(1, s.remainingMs / s.phaseMs));
    roundRect(90, 1010, W - 180, 34, 17); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
    roundRect(90, 1010, Math.max(34, (W - 180) * frac), 34, 17);
    ctx.fillStyle = s.phase === 'answer' ? (frac < 0.25 ? '#ef4444' : '#22c55e') : '#60a5fa'; ctx.fill();
    const label = s.phase === 'show' ? 'GHI NHỚ!' : s.phase === 'answer' ? `GÕ LẠI DÃY SỐ — còn ${Math.ceil(s.remainingMs / 1000)} giây` : 'ĐÁP ÁN';
    text(label, W / 2, 1090, 46, '#fde68a');
  }

  function list(title, rows, y, fmt) {
    text(title, W / 2, y, 44, '#93c5fd');
    rows.forEach((r, i) => {
      const yy = y + 70 + i * 72;
      roundRect(120, yy - 30, W - 240, 60, 16); ctx.fillStyle = i === 0 ? 'rgba(251,191,36,.25)' : 'rgba(255,255,255,.07)'; ctx.fill();
      text(`${i + 1}. ${r.name}`, 150, yy, 36, '#fff', 700, 'left');
      text(fmt(r), W - 150, yy, 36, '#fde68a', 800, 'right');
    });
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1e1b4b'); g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    text('🧠 NHỚ SỐ', W / 2, 200, 96, '#fff', 900);
    if (!S) { text('Đang chuẩn bị…', W / 2, H / 2, 48, '#cbd5e1'); return; }
    text(`Cấp ${S.level} · ${S.digits} chữ số`, W / 2, 320, 54, '#fbbf24');
    if (S.paused) text('⏸ Tạm dừng', W / 2, 430, 50, '#f87171');
    if (flashT && t - flashT < 400) { ctx.fillStyle = `rgba(244,114,182,${0.3 * (1 - (t - flashT) / 400)})`; ctx.fillRect(0, 0, W, H); }
    drawDigits(S, t);
    bar(S);
    if (S.phase !== 'show') {
      const rows = S.correct.slice(0, 5);
      if (rows.length) list(`✅ ${S.correct.length} người đúng`, rows, 1200, (r) => `+${r.points}`);
      else if (S.phase === 'reveal') text('Chưa ai nhớ đúng 😅', W / 2, 1220, 46, '#fca5a5');
      else text(`${S.answered} người đã trả lời`, W / 2, 1200, 40, '#cbd5e1');
    }
    if (S.board?.length && S.phase === 'show') list('🏆 BẢNG ĐIỂM', S.board, 1200, (r) => `${r.points}`);
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i], k = (t - p.t0) / 1500;
      if (k > 1 || !p.t0) { if (k > 1) pops.splice(i, 1); else p.t0 = t; continue; }
      ctx.globalAlpha = 1 - k; text(p.text, W / 2, 560 - k * 160, 52, p.color); ctx.globalAlpha = 1;
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    update(s) { S = s; },
    effect(fx) {
      if (fx.type === 'mm_correct') { pops.push({ text: `${fx.by.name} +${fx.points}`, color: '#86efac', t0: 0 }); sound?.play?.('correct'); }
      else if (fx.type === 'mm_show') sound?.play?.('tick');
      else if (fx.type === 'mm_flash') { flashT = performance.now(); sound?.play?.('pop'); }
      else if (fx.type === 'mm_time') pops.push({ text: `⏱️ +${fx.seconds} giây`, color: '#93c5fd', t0: 0 });
      else if (fx.type === 'mm_reveal') sound?.play?.(fx.correct ? 'win' : 'fail');
    },
    resize() {},
    destroy() { cancelAnimationFrame(raf); },
  };
}

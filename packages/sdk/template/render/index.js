// Renderer mẫu: không đụng DOM khi import; mọi thứ nằm trong mount().
export function mount(el, { canvas, sound = null } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let S = null, raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = "900 80px 'Be Vietnam Pro', sans-serif";
    ctx.fillText('__NAME__', W / 2, 220);
    if (!S) return;
    ctx.font = "800 56px 'Be Vietnam Pro', sans-serif";
    ctx.fillText(`Tổng: ${S.total}`, W / 2, 400);
    S.top.forEach((p, i) => ctx.fillText(`${i + 1}. ${p.name} — ${p.points}`, W / 2, 560 + i * 90));
  }
  raf = requestAnimationFrame(frame);
  return {
    update(s) { S = s; },
    effect(fx) { if (fx.type === 'boost') sound?.play?.('pop'); },
    resize() {},
    destroy() { cancelAnimationFrame(raf); },
  };
}

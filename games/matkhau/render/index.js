// Renderer canvas của Mật Khẩu Lầy (khung dọc 1080×1920, chừa ~150px trên cho giao diện TikTok).
// Phong cách "sticker": thẻ trắng viền mực đậm, bóng đổ cứng, nền tím đêm có ổ khoá / chìa khoá trôi.
// Robot "Bé Bảo Mật" đổi nét mặt theo tình huống và nói câu cà khịa trong bong bóng thoại.
// Không đụng DOM khi import. mount() nhận thêm input(ev) (cửa sổ chơi của host) — có thì bật ô gõ mật khẩu.
import { drawPanel } from '#sdk';

const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const TITLE = "'Baloo 2', 'Be Vietnam Pro', system-ui, sans-serif";
const C = {
  ink: '#1b1530', paper: '#fffdf7', paper2: '#f3efff', dim: 'rgba(27,21,48,.6)', faint: 'rgba(27,21,48,.35)',
  yellow: '#ffd43b', pink: '#ff5d8f', mint: '#33d69f', sky: '#4da3ff', red: '#ff4d4d', purple: '#8b5cf6', orange: '#ff9f43',
  okBg: '#e3fbf1', badBg: '#ffe7ea', hint: '#fff3bf',
};
export const ACT = {
  raluat: { icon: '📝', name: 'Ra luật', title: 'KHÁN GIẢ RA LUẬT!' },
  luatac: { icon: '😈', name: 'Luật siêu khó', title: 'LUẬT SIÊU KHÓ!' },
  hacker: { icon: '💻', name: 'Hacker xoá sạch', title: 'HACKER TẤN CÔNG!' },
  meo: { icon: '🐱', name: 'Mèo đạp phím', title: 'MÈO ĐẠP BÀN PHÍM!' },
  camchu: { icon: '🚫', name: 'Cấm 1 chữ', title: 'CẤM CHỮ!' },
  rutgio: { icon: '⏰', name: 'Rút giờ', title: 'RÚT BỚT GIỜ!' },
  capslock: { icon: '⇪', name: 'Caps Lock kẹt', title: 'CAPS LOCK KẸT!' },
  doiluat: { icon: '🔁', name: 'Đổi luật', title: 'ĐỔI LUẬT!' },
  goiy: { icon: '💡', name: 'Gợi ý', title: 'GỢI Ý NÈ!' },
  themgio: { icon: '⏳', name: 'Thêm giờ', title: 'THÊM GIỜ!' },
  xoaluat: { icon: '🧽', name: 'Xoá 1 luật', title: 'XOÁ 1 LUẬT!' },
  khien: { icon: '🛡️', name: 'Khiên', title: 'BẬT KHIÊN!' },
  qualuon: { icon: '🏆', name: 'Qua màn luôn', title: 'QUA MÀN LUÔN!' },
};
const HELP = new Set(['goiy', 'themgio', 'xoaluat', 'khien', 'qualuon']);
const HOST_ONLY = new Set(['hacker', 'meo', 'capslock']);
const TOP = 150;
const sameTry = (a, b) => !!a && !!b && a.text === b.text && a.by?.id === b.by?.id;
const MATRIX = 'アカサタナ01ハマヤラワ#$%&@ABCDEF0123456789';

export function mount(el, { canvas, options = {}, input = null } = {}) {
  let LAYOUT = {};
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let S = null, raf = 0, stopped = false, last = performance.now();
  const anim = { shake: 0, wrongAt: 0, wrong: new Set(), hackAt: -1e9, meoAt: -1e9, flashAt: -1e9, flashColor: C.red, title: null, phaseKey: '', phaseAt: 0, botId: -1, botAt: 0, hintAt: new Map(), lastSec: -1, winAt: -1e9 };
  const seen = new Map(); // uid luật → lúc xuất hiện (hoạt ảnh luật mới)
  const floaters = [], confetti = [], drift = [];
  const sound = makeSound(!!options.mute);
  const panel = (id, def, fn) => drawPanel(ctx, LAYOUT, id, def, fn);

  if (typeof document !== 'undefined' && !document.getElementById('mk-font')) {
    const l = document.createElement('link');
    l.id = 'mk-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Be+Vietnam+Pro:wght@600;700;800&display=swap';
    document.head.append(l);
  }
  for (let i = 0; i < 14; i++) drift.push({ x: Math.random() * W, y: Math.random() * H, s: 26 + Math.random() * 40, v: 8 + Math.random() * 18, r: Math.random() * 6, e: ['🔒', '🔑', '🔐', '*', '#', '🗝️'][i % 6] });

  // ---------------- vẽ cơ bản ----------------
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function sticker(x, y, w, h, r = 26, fill = C.paper, { shadow = 8, line = 5, stroke = C.ink } = {}) {
    if (shadow) { rr(x + shadow, y + shadow, w, h, r); ctx.fillStyle = stroke; ctx.fill(); }
    rr(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
    if (line) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function text(s, x, y, size, color = C.ink, weight = 800, align = 'center', maxW = 0, font = FONT) {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    let str = String(s ?? '');
    if (maxW > 0 && ctx.measureText(str).width > maxW) { while (str.length > 1 && ctx.measureText(`${str}…`).width > maxW) str = [...str].slice(0, -1).join(''); str += '…'; }
    ctx.fillText(str, x, y);
  }
  const measure = (s, size, weight = 800, font = FONT) => { ctx.font = `${weight} ${size}px ${font}`; return ctx.measureText(String(s)).width; };
  function wrap(s, size, maxW, weight = 700, font = FONT) {
    const words = String(s ?? '').split(/\s+/); const lines = []; let cur = '';
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (measure(t, size, weight, font) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }
  function outline(s, x, y, size, fill = '#fff', stroke = C.ink, shadow = C.pink, lw = 0) {
    ctx.font = `800 ${size}px ${TITLE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const w = lw || Math.max(6, size * 0.16);
    if (shadow) { ctx.lineWidth = w; ctx.strokeStyle = shadow; ctx.strokeText(s, x + size * 0.06, y + size * 0.08); ctx.fillStyle = shadow; ctx.fillText(s, x + size * 0.06, y + size * 0.08); }
    ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y);
    ctx.fillStyle = fill; ctx.fillText(s, x, y);
  }
  function chip(s, x, y, size, bg, fg = C.ink, align = 'left') {
    const w = measure(s, size, 800) + size * 1.1, h = size * 1.7;
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    sticker(x0, y - h / 2, w, h, h / 2, bg, { shadow: 3, line: 3 });
    text(s, x0 + w / 2, y + 1, size, fg, 800);
    return w;
  }
  const mmss = (ms) => { const s = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const ease = (k) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
  const pop = (k) => { k = Math.min(1, Math.max(0, k)); return 1 + Math.sin(k * Math.PI) * 0.18 * (1 - k); };

  // ---------------- nền ----------------
  function drawBg(now, dt) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a1b5c'); g.addColorStop(0.55, '#21164a'); g.addColorStop(1, '#140f33');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (let y = 40; y < H; y += 60) for (let x = (y / 60) % 2 ? 30 : 0; x < W; x += 60) ctx.fillRect(x, y, 4, 4);
    ctx.globalAlpha = 0.09;
    for (const d of drift) {
      if (!reduced) { d.y -= d.v * dt; if (d.y < -60) { d.y = H + 40; d.x = Math.random() * W; } }
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(Math.sin(now / 2000 + d.r) * 0.3);
      text(d.e, 0, 0, d.s, '#fff', 800); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- đầu trang ----------------
  function drawHeader(now) {
    ctx.save(); ctx.translate(130, 218); ctx.rotate(-0.06);
    sticker(-104, -46, 208, 92, 22, C.yellow);
    text('MÀN', 0, -18, 24, C.ink, 800, 'center', 0, TITLE);
    text(String(S.level), 0, 16, 50, C.ink, 800, 'center', 0, TITLE);
    ctx.restore();
    outline('MẬT KHẨU LẦY', 540, 206, 66);
    chip(S.mode === 'viewer' ? '💬 Người xem tự chơi' : '⌨️ Host đang gõ', 540, 272, 22, S.mode === 'viewer' ? C.sky : C.mint, C.ink, 'center');
    // đồng hồ
    const cx = 968, cy = 224, R = 66;
    const play = S.phase === 'play';
    const k = play ? Math.max(0, Math.min(1, S.remainingMs / Math.max(1, S.roundMs))) : 1;
    const urgent = play && S.remainingMs < 15000;
    const sc = urgent && !reduced ? 1 + Math.sin(now / 90) * 0.04 : 1;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
    ctx.beginPath(); ctx.arc(6, 6, R, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R - 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.strokeStyle = k > 0.5 ? C.mint : k > 0.2 ? C.yellow : C.red; ctx.stroke(); ctx.lineCap = 'butt';
    text(play ? mmss(S.remainingMs) : '⏱', 0, 4, play ? 34 : 40, urgent ? C.red : C.ink, 800, 'center', 0, TITLE);
    ctx.restore();
  }

  // ---------------- robot + bong bóng thoại ----------------
  function drawBot(now) {
    const b = S.bot || {};
    if (b.id !== anim.botId) { anim.botId = b.id; anim.botAt = now; }
    const mood = S.phase === 'result' ? (S.result?.win ? 'happy' : 'angry') : now - anim.botAt < 2600 ? b.mood || 'idle' : 'idle';
    const x = 116, y = 420;
    const bob = reduced ? 0 : Math.sin(now / 400) * 5;
    const shake = mood === 'angry' && now - anim.botAt < 600 && !reduced ? Math.sin(now / 25) * 4 : 0;
    ctx.save(); ctx.translate(x + shake, y + bob);
    // ăng-ten
    ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, -62); ctx.lineTo(0, -88); ctx.stroke();
    const blink = Math.floor(now / 500) % 2 ? C.pink : C.yellow;
    ctx.beginPath(); ctx.arc(0, -94, 12, 0, Math.PI * 2); ctx.fillStyle = mood === 'angry' || mood === 'evil' ? C.red : blink; ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
    // thân
    sticker(-44, 58, 88, 40, 14, C.purple, { shadow: 0, line: 5 });
    // đầu
    sticker(-82, -62, 164, 124, 34, C.sky, { shadow: 6, line: 6 });
    rr(-62, -42, 124, 84, 22); ctx.fillStyle = C.ink; ctx.fill();
    // mặt (màn hình)
    const eye = (ex) => {
      ctx.strokeStyle = C.mint; ctx.fillStyle = C.mint; ctx.lineWidth = 7; ctx.lineCap = 'round';
      const t = (now / 3200) % 1, closed = t > 0.96 && mood === 'idle';
      ctx.beginPath();
      if (closed) { ctx.moveTo(ex - 12, -6); ctx.lineTo(ex + 12, -6); }
      else if (mood === 'happy') { ctx.arc(ex, 0, 12, Math.PI * 1.1, Math.PI * 1.9); }
      else if (mood === 'angry' || mood === 'evil') { ctx.strokeStyle = C.red; ctx.moveTo(ex - 14, ex < 0 ? -16 : -4); ctx.lineTo(ex + 14, ex < 0 ? -4 : -16); }
      else if (mood === 'shock') { ctx.arc(ex, -6, 12, 0, Math.PI * 2); }
      else if (mood === 'smug') { ctx.moveTo(ex - 13, -6); ctx.lineTo(ex + 13, -6); }
      else { ctx.arc(ex, -6, 8, 0, Math.PI * 2); ctx.fill(); }
      ctx.stroke(); ctx.lineCap = 'butt';
    };
    eye(-26); eye(26);
    ctx.strokeStyle = mood === 'angry' || mood === 'evil' ? C.red : C.mint; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
    if (mood === 'happy' || mood === 'smug' || mood === 'evil') ctx.arc(0, 14, 16, Math.PI * 0.15, Math.PI * 0.85);
    else if (mood === 'angry') ctx.arc(0, 30, 14, Math.PI * 1.2, Math.PI * 1.8);
    else if (mood === 'shock') ctx.arc(0, 22, 8, 0, Math.PI * 2);
    else { ctx.moveTo(-12, 22); ctx.lineTo(12, 22); }
    ctx.stroke(); ctx.lineCap = 'butt';
    ctx.restore();
    text('BÉ BẢO MẬT', x, y + 128, 20, C.yellow, 800, 'center', 0, TITLE);
    // bong bóng
    const bx = 226, by = 330, bw = 830, bh = 170;
    sticker(bx, by, bw, bh, 28, C.paper);
    ctx.beginPath(); ctx.moveTo(bx + 3, by + 70); ctx.lineTo(bx - 30, by + 92); ctx.lineTo(bx + 3, by + 108); ctx.closePath(); ctx.fillStyle = C.paper; ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(bx, by + 70); ctx.lineTo(bx - 30, by + 92); ctx.lineTo(bx, by + 108); ctx.stroke();
    const full = String(b.text || '');
    const n = reduced ? full.length : Math.min(full.length, Math.floor((now - anim.botAt) / 22));
    const lines = wrap([...full].slice(0, n).join(''), 34, bw - 60, 800);
    const fit = lines.length > 3 ? 28 : 34;
    const ls = (lines.length > 3 ? wrap([...full].slice(0, n).join(''), 28, bw - 60, 800) : lines).slice(0, 4);
    ls.forEach((ln, i) => text(ln, bx + 30, by + bh / 2 + (i - (ls.length - 1) / 2) * fit * 1.25, fit, C.ink, 800, 'left'));
  }

  // ---------------- ô mật khẩu ----------------
  let field = null; // vùng ô gõ (cho input DOM)
  function drawPassword(now) {
    const x = 24, y = 528, w = 1032, h = 214;
    const hk = now - anim.wrongAt < 450 && !reduced ? Math.sin((now - anim.wrongAt) / 30) * 10 * (1 - (now - anim.wrongAt) / 450) : 0;
    ctx.save(); ctx.translate(hk, 0);
    const shieldOn = S.shield > 0;
    if (shieldOn) { ctx.save(); ctx.shadowColor = C.sky; ctx.shadowBlur = 30 + Math.sin(now / 200) * 10; sticker(x, y, w, h, 30, C.paper); ctx.restore(); }
    sticker(x, y, w, h, 30, C.paper);
    text('🔒 MẬT KHẨU MỚI', x + 30, y + 34, 26, C.ink, 800, 'left', 0, TITLE);
    const viewer = S.mode === 'viewer';
    const shown = viewer ? S.bestTry?.text || '' : S.typed || '';
    let rx = x + w - 24;
    rx -= chip(`${[...shown].length} ký tự`, rx, y + 34, 20, C.paper2, C.ink, 'right') + 10;
    if (S.shield) rx -= chip(`🛡️ ×${S.shield}`, rx, y + 34, 20, C.sky, C.ink, 'right') + 10;
    const caps = S.status?.find((s) => s.kind === 'capslock');
    if (caps) rx -= chip(`⇪ CAPS KẸT ${Math.ceil(caps.leftMs / 1000)}s`, rx, y + 34, 20, C.orange, C.ink, 'right') + 10;
    // ô gõ
    const fx0 = x + 24, fy = y + 64, fw = w - 48, fh = 96;
    rr(fx0, fy, fw, fh, 20); ctx.fillStyle = '#f1edff'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.stroke();
    field = S.phase === 'play' && !viewer ? { x: fx0, y: fy, w: fw, h: fh } : null;
    let size = 48;
    while (size > 22 && measure(shown, size, 800) > fw - 50) size -= 2;
    if (shown) {
      text(shown, fx0 + 24, fy + fh / 2 + 2, size, C.ink, 800, 'left', fw - 48);
      if (!viewer && S.phase === 'play' && Math.floor(now / 500) % 2) { const cw = Math.min(fw - 30, 24 + measure(shown, size, 800) + 4); ctx.fillStyle = C.pink; ctx.fillRect(fx0 + cw, fy + 22, 5, fh - 44); }
    } else {
      text(viewer ? 'Gõ mật khẩu vào bình luận để thử!' : S.phase === 'play' ? (input ? 'Gõ mật khẩu ở đây rồi Enter…' : 'Host đang nghĩ…') : '••••••••', fx0 + 24, fy + fh / 2 + 2, 32, C.faint, 700, 'left');
      if (!viewer && S.phase === 'play' && Math.floor(now / 500) % 2) { ctx.fillStyle = C.pink; ctx.fillRect(fx0 + 18, fy + 22, 5, fh - 44); }
    }
    if (viewer && S.bestTry?.by) chip(`👤 ${S.bestTry.by.name} · ${S.bestTry.passed}/${S.rules.length}`, fx0 + fw - 12, fy - 2, 18, C.yellow, C.ink, 'right');
    // độ mạnh
    const sy = y + 182, sw = 420;
    text('Độ mạnh:', x + 30, sy, 22, C.dim, 800, 'left');
    const bx = x + 140;
    rr(bx, sy - 11, sw, 22, 11); ctx.fillStyle = '#e9e4f7'; ctx.fill();
    const k = Math.max(0.04, S.strength?.k || 0);
    rr(bx, sy - 11, sw * k, 22, 11); ctx.fillStyle = k < 0.34 ? C.red : k < 0.7 ? C.yellow : C.mint; ctx.fill();
    rr(bx, sy - 11, sw, 22, 11); ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
    text(S.strength?.label || '', bx + sw + 18, sy, 24, C.ink, 800, 'left', 380, TITLE);
    ctx.restore();
    // mèo đạp phím: dấu chân chạy ngang
    const mk = (now - anim.meoAt) / 1400;
    if (mk >= 0 && mk < 1) for (let i = 0; i < 6; i++) { const px = x + 60 + i * 170, py = y + 110 + (i % 2 ? -26 : 26); if (mk * 7 > i) text('🐾', px, py, 52, C.ink, 800); }
    // lượt thử mới nhất (người xem)
    if (viewer && S.latest && !sameTry(S.latest, S.bestTry)) {
      const l = S.latest;
      const s = `Vừa thử: ${l.by?.name || ''} · “${l.text}” · ${l.passed}/${S.rules.length}`;
      chip(s.length > 60 ? `${[...s].slice(0, 58).join('')}…` : s, 540, y + h + 30, 20, C.paper2, C.ink, 'center');
    }
  }

  // ---------------- danh sách luật ----------------
  function drawRules(now, top, bottom) {
    const rules = S.rules || [];
    const total = S.total || rules.length;
    // tiến độ
    text(`LUẬT ${Math.min(rules.length, total)} / ${total}`, 40, top + 18, 30, '#fff', 800, 'left', 0, TITLE);
    const dw = Math.min(30, (700 - 20) / Math.max(1, total));
    if (S.waiting) chip('⏳ Chờ khán giả chọn luật…', 1040, top + 18, 22, C.yellow, C.ink, 'right');
    else for (let i = 0; i < total; i++) {
      const r = rules[i];
      const cx = 1040 - (total - i) * dw + dw / 2;
      ctx.beginPath(); ctx.arc(cx, top + 18, dw * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = !r ? 'rgba(255,255,255,.18)' : r.ok ? C.mint : C.red; ctx.fill();
    }
    // thẻ: luật sai lên trước (mới nhất trước), rồi luật đã đạt (mới nhất trước)
    const order = [...rules].reverse();
    const list = [...order.filter((r) => !r.ok), ...order.filter((r) => r.ok)];
    let y = top + 50;
    let hidden = 0;
    for (const r of list) {
      if (!seen.has(r.uid)) { seen.set(r.uid, now); if (seen.size > 200) seen.delete(seen.keys().next().value); }
      const lines = wrap(r.text, 30, 760, 800).slice(0, 2);
      const hasMeta = !!(r.hint || r.by);
      const h = 34 + lines.length * 38 + (hasMeta ? 34 : 0);
      if (y + h > bottom) { hidden++; continue; }
      const age = (now - seen.get(r.uid)) / 650;
      const wrongK = anim.wrong.has(r.no) && now - anim.wrongAt < 600 ? 1 - (now - anim.wrongAt) / 600 : 0;
      const dx = (age < 1 && !reduced ? (1 - ease(age)) * 300 : 0) + (wrongK && !reduced ? Math.sin(now / 22) * 12 * wrongK : 0);
      const sc = age < 1 && !reduced ? pop(age) : 1;
      ctx.save(); ctx.translate(540 + dx, y + h / 2); ctx.scale(sc, sc); ctx.translate(-540, -(y + h / 2));
      if (age < 1.8 && !reduced) { ctx.save(); ctx.shadowColor = C.yellow; ctx.shadowBlur = 40 * (1 - age / 1.8); sticker(40, y, 1000, h, 22, r.ok ? C.okBg : C.badBg, { shadow: 6, line: 4 }); ctx.restore(); }
      sticker(40, y, 1000, h, 22, r.ok ? C.okBg : C.badBg, { shadow: 6, line: 4 });
      // số thứ tự
      ctx.beginPath(); ctx.arc(88, y + 34, 26, 0, Math.PI * 2); ctx.fillStyle = r.ok ? C.mint : C.red; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.stroke();
      text(String(r.no), 88, y + 36, 26, r.ok ? C.ink : '#fff', 800, 'center', 0, TITLE);
      lines.forEach((ln, i) => text(ln, 132, y + 34 + i * 38, 30, C.ink, 800, 'left', 790));
      text(r.ok ? '✅' : '❌', 1000, y + 34, 38, C.ink, 800, 'center');
      // độ khó
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(1000 - 14 + i * 14, y + h - 20, 5, 0, Math.PI * 2); ctx.fillStyle = i < (r.tier || 3) ? C.ink : 'rgba(27,21,48,.15)'; ctx.fill(); }
      if (hasMeta) {
        let mx = 132;
        const my = y + 34 + lines.length * 38 + 2;
        if (r.by) mx += chip(`👤 ${r.by.name}`, mx, my, 18, C.sky, C.ink) + 10;
        if (r.hint) { const hk = anim.hintAt.get(r.no) ?? 0; const glow = now - hk < 1500; chip(`💡 ${r.hint}`.slice(0, 60), mx, my, 18, glow ? C.yellow : C.hint, C.ink); }
      }
      ctx.restore();
      y += h + 14;
    }
    if (hidden) chip(`+${hidden} luật nữa (${list.slice(-hidden).filter((r) => r.ok).length} đã đạt)`, 540, Math.min(bottom + 8, y + 18), 20, C.paper2, C.ink, 'center');
    if (!rules.length && S.phase === 'play') text('Đang soạn luật…', 540, top + 120, 32, 'rgba(255,255,255,.7)', 800);
  }

  // ---------------- bình chọn ----------------
  function drawVote(now) {
    const v = S.vote;
    const x = 60, y = 1220, w = 960, h = 250;
    const k = Math.min(1, (now - (anim.voteAt || 0)) / 400);
    ctx.save(); ctx.translate(540, y + h / 2); ctx.scale(reduced ? 1 : 0.85 + 0.15 * ease(k), reduced ? 1 : 0.85 + 0.15 * ease(k)); ctx.translate(-540, -(y + h / 2));
    sticker(x, y, w, h, 28, C.purple);
    text('🗳️ CHỌN LUẬT TIẾP — GÕ 1 HOẶC 2', x + 28, y + 36, 30, '#fff', 800, 'left', 720, TITLE);
    chip(`${Math.ceil(v.leftMs / 1000)}s`, x + w - 24, y + 36, 24, C.yellow, C.ink, 'right');
    const tot = Math.max(1, v.counts[0] + v.counts[1]);
    v.options.forEach((o, i) => {
      const oy = y + 72 + i * 86;
      sticker(x + 24, oy, w - 48, 74, 18, C.paper, { shadow: 4, line: 4 });
      rr(x + 24, oy, (w - 48) * (v.counts[i] / tot), 74, 18); ctx.fillStyle = i ? 'rgba(255,93,143,.28)' : 'rgba(77,163,255,.28)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + 66, oy + 37, 24, 0, Math.PI * 2); ctx.fillStyle = i ? C.pink : C.sky; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.stroke();
      text(String(i + 1), x + 66, oy + 39, 28, C.ink, 800, 'center', 0, TITLE);
      const ls = wrap(o, 24, w - 230, 800).slice(0, 2);
      ls.forEach((ln, j) => text(ln, x + 104, oy + 37 + (j - (ls.length - 1) / 2) * 28, 24, C.ink, 800, 'left', w - 230));
      text(String(v.counts[i]), x + w - 52, oy + 38, 30, C.ink, 800, 'right', 0, TITLE);
    });
    const bk = v.leftMs / Math.max(1, v.totalMs);
    rr(x + 24, y + h - 14, (w - 48) * bk, 6, 3); ctx.fillStyle = C.yellow; ctx.fill();
    ctx.restore();
  }

  // ---------------- bảng quà ----------------
  function drawGifts(now) {
    const x = 24, y = 1500, w = 1032;
    const viewer = S.mode === 'viewer';
    const ps = (S.powerups || []).filter((p) => ACT[p.action] && !(viewer && HOST_ONLY.has(p.action)));
    const seenAct = new Set();
    const items = [];
    for (const p of ps) { if (seenAct.has(`${p.action}|${p.text}`)) continue; seenAct.add(`${p.action}|${p.text}`); items.push(p); }
    const cols = 3, cw = (w - 16 * (cols - 1)) / cols, ch = 52;
    const shown = items.slice(0, 15);
    const rows = Math.ceil(shown.length / cols);
    const h = 52 + rows * (ch + 10);
    sticker(x, y, w, h, 26, 'rgba(255,253,247,.96)', { shadow: 6, line: 4 });
    text('😈 QUÀ PHÁ  ·  😇 QUÀ CỨU', x + 24, y + 28, 24, C.ink, 800, 'left', 0, TITLE);
    shown.forEach((p, i) => {
      const cx = x + 12 + (i % cols) * (cw + 8) - (i % cols ? 0 : 0), cy = y + 52 + Math.floor(i / cols) * (ch + 10);
      const a = ACT[p.action];
      const help = HELP.has(p.action);
      const hot = (anim.hot?.[p.action] || 0) > now;
      sticker(cx, cy, cw - 8, ch, 16, hot ? C.yellow : help ? C.okBg : C.badBg, { shadow: 3, line: 3 });
      text(`${p.icon} ${p.text}`, cx + 14, cy + 17, 17, C.dim, 800, 'left', cw - 36);
      text(`${a.icon} ${a.name}${p.every ? ` (${p.count}/${p.every})` : ''}`, cx + 14, cy + 37, 19, C.ink, 800, 'left', cw - 36);
    });
  }

  function drawBoard() {
    const top = S.top?.players || [];
    if (!top.length) return;
    const x = 24, y = 1384, w = 1032, h = 96;
    sticker(x, y, w, h, 24, 'rgba(255,253,247,.96)', { shadow: 5, line: 4 });
    text('🏅 TOP', x + 24, y + h / 2, 28, C.ink, 800, 'left', 0, TITLE);
    let cx = x + 130;
    top.slice(0, 4).forEach((p, i) => { cx += chip(`${['🥇', '🥈', '🥉', '4.'][i]} ${p.name} ${p.points}`, cx, y + h / 2, 20, i === 0 ? C.yellow : C.paper2) + 10; });
  }

  function drawPending(now, y) {
    const p = S.pending?.[0];
    if (!p) return;
    const s = `📝 ${p.by.name} đang ra luật… gõ 1 từ vào bình luận! (${Math.ceil(p.leftMs / 1000)}s)`;
    const sc = reduced ? 1 : 1 + Math.sin(now / 160) * 0.02;
    ctx.save(); ctx.translate(540, y); ctx.scale(sc, sc);
    chip(s, 0, 0, 22, C.yellow, C.ink, 'center');
    ctx.restore();
  }

  // ---------------- tiêu đề lớn (quà / sự kiện) ----------------
  function drawTitle(now) {
    const t = anim.title;
    if (!t) return;
    const k = (now - t.at) / (t.life * 1000);
    if (k >= 1) { anim.title = null; return; }
    const a = k < 0.12 ? k / 0.12 : k > 0.85 ? (1 - k) / 0.15 : 1;
    const sc = reduced ? 1 : k < 0.15 ? 0.6 + 0.4 * ease(k / 0.15) * 1.08 : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(540, 980); ctx.rotate(-0.04); ctx.scale(sc, sc);
    const sub = wrap(t.sub || '', 28, 820, 800).slice(0, 2);
    const h = 150 + (t.by ? 40 : 0) + sub.length * 36;
    sticker(-470, -h / 2, 940, h, 34, t.color || C.yellow, { shadow: 10, line: 6 });
    outline(t.text, 0, -h / 2 + 70, 64, '#fff', C.ink, null, 12);
    let yy = -h / 2 + 128;
    if (t.by) { text(`bởi ${t.by}`, 0, yy, 28, C.ink, 800); yy += 40; }
    sub.forEach((ln) => { text(ln, 0, yy, 28, C.ink, 800, 'center'); yy += 36; });
    ctx.restore();
  }

  // ---------------- giới thiệu / kết quả ----------------
  function dim(a = 0.6) { ctx.fillStyle = `rgba(16,10,40,${a})`; ctx.fillRect(0, 0, W, H); }
  function drawIntro(now) {
    dim(0.55);
    const k = ease((now - anim.phaseAt) / 500);
    ctx.save(); ctx.translate(540, 1060); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); ctx.rotate(-0.02);
    sticker(-440, -300, 880, 600, 40, C.paper, { shadow: 12, line: 6 });
    outline(`MÀN ${S.level}`, 0, -190, 120, C.yellow, C.ink, C.pink, 16);
    text(`Qua ${S.total} luật trong ${mmss(S.roundMs)}`, 0, -70, 44, C.ink, 800, 'center', 820, TITLE);
    text(S.mode === 'viewer' ? 'Người xem: gõ mật khẩu vào bình luận!' : 'Host gõ mật khẩu · khán giả phá hoặc cứu', 0, -14, 30, C.dim, 800, 'center', 820);
    const tips = S.mode === 'viewer' ? ['💬 Thoả hết luật đang hiện → mở luật mới, +điểm', '🗳️ Gõ 1 / 2 để chọn luật tiếp theo', '🎁 Tặng quà để thêm luật khó hoặc gợi ý'] : ['🗳️ Khán giả gõ 1 / 2 để chọn luật tiếp theo', '📝 Một từ bạn bình luận có thể thành luật!', '🎁 Quà phá: hacker, mèo, cấm chữ… Quà cứu: gợi ý, thêm giờ'];
    tips.forEach((s, i) => text(s, -380, 60 + i * 52, 28, C.ink, 800, 'left', 780));
    const sec = Math.ceil(S.remainingMs / 1000);
    chip(input && S.mode !== 'viewer' ? `Bắt đầu sau ${sec}s · bấm Enter để vào luôn` : `Bắt đầu sau ${sec}s`, 0, 238, 26, C.mint, C.ink, 'center');
    ctx.restore();
  }

  function drawResult(now) {
    const r = S.result;
    if (!r) return;
    dim(0.6);
    const k = ease((now - anim.phaseAt) / 500);
    ctx.save(); ctx.translate(540, 1040); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); ctx.rotate(r.win ? -0.02 : 0.02);
    const tor = S.top?.torment?.[0], hel = S.top?.helpers?.[0];
    const hh = 520 + (r.by ? 70 : 0) + (r.punishment ? 64 : 0) + (tor ? 40 : 0) + (hel ? 40 : 0);
    sticker(-460, -hh / 2, 920, hh, 40, r.win ? C.okBg : C.badBg, { shadow: 12, line: 6 });
    outline(r.win ? 'THÀNH CÔNG!' : 'BỊ KHOÁ! 🔒', 0, -hh / 2 + 90, 96, r.win ? C.mint : C.red, C.ink, C.yellow, 14);
    text(r.win ? `Đổi mật khẩu màn ${r.level} · ${r.rules} luật` : `Hết giờ ở màn ${r.level} · mới qua ${r.rules} luật`, 0, -hh / 2 + 170, 32, C.ink, 800, 'center', 860);
    // mật khẩu cuối
    sticker(-400, -hh / 2 + 210, 800, 100, 20, '#f1edff', { shadow: 0, line: 4 });
    let size = 40; const pw = r.password || '(trống)';
    while (size > 18 && measure(pw, size, 800) > 740) size -= 2;
    text(pw, 0, -hh / 2 + 262, size, C.ink, 800, 'center', 760);
    let y = -hh / 2 + 360;
    if (r.by) { chip(`🏆 ${r.by.name} phá đảo!`, 0, y, 30, C.yellow, C.ink, 'center'); y += 70; }
    const stats = r.win ? `⏱ Còn ${mmss(r.leftMs)} · 🔁 ${r.attempts} lần thử` : `🔁 ${r.attempts} lần thử`;
    text(stats, 0, y, 30, C.ink, 800); y += 56;
    if (r.punishment) { chip(`${r.punishmentKind === 'voice' ? '🎤 Phạt' : '⚖️ Án phạt'}: ${r.punishment}`, 0, y, 26, C.orange, C.ink, 'center'); y += 64; }
    if (tor) { text(`😈 Phá nhiều nhất: ${tor.name}`, 0, y, 26, C.dim, 800, 'center', 820); y += 40; }
    if (hel) { text(`😇 Cứu nhiều nhất: ${hel.name}`, 0, y, 26, C.dim, 800, 'center', 820); y += 40; }
    const sec = Math.ceil(S.remainingMs / 1000);
    chip(r.win ? `Màn ${S.level} sau ${sec}s` : `Chơi lại màn ${S.level} sau ${sec}s`, 0, hh / 2 - 50, 26, C.paper, C.ink, 'center');
    ctx.restore();
  }

  // ---------------- hiệu ứng ----------------
  function drawHack(now) {
    const k = (now - anim.hackAt) / 1600;
    if (k < 0 || k >= 1) return;
    ctx.save();
    ctx.globalAlpha = k < 0.8 ? 0.85 : (1 - k) / 0.2 * 0.85;
    ctx.fillStyle = '#031a0b'; ctx.fillRect(0, 0, W, H);
    ctx.font = `800 30px ui-monospace, monospace`; ctx.textAlign = 'center';
    for (let c = 0; c < 36; c++) {
      const sp = 300 + ((c * 97) % 260);
      for (let r = 0; r < 14; r++) {
        const yy = ((now / 1000) * sp + c * 131 + r * 34) % (H + 200) - 100;
        ctx.fillStyle = r === 13 ? '#c8ffd9' : `rgba(51,214,159,${0.15 + r / 18})`;
        ctx.fillText(MATRIX[(c * 7 + r * 3 + Math.floor(now / 90)) % MATRIX.length], 15 + c * 30, yy);
      }
    }
    ctx.globalAlpha = 1;
    const j = reduced ? 0 : (Math.random() - 0.5) * 16;
    outline('ĐÃ BỊ HACK!', 540 + j, 900, 110, C.mint, '#031a0b', C.red, 14);
    text('mật khẩu = “”', 540, 1010, 40, '#c8ffd9', 800, 'center', 0, 'ui-monospace, monospace');
    ctx.restore();
  }
  function burst(n, x = W / 2, y = 900) {
    if (reduced) return;
    const cols = [C.yellow, C.pink, C.mint, C.sky, C.purple, '#fff'];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 400 + Math.random() * 900; confetti.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 600, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: cols[i % cols.length], w: 12 + Math.random() * 12, h: 8 + Math.random() * 8, life: 2.6 + Math.random() }); }
  }
  function drawParticles(dt) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.vy += 1500 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.life -= dt;
      if (p.life <= 0 || p.y > H + 50) { confetti.splice(i, 1); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.age += dt;
      if (f.age > f.life) { floaters.splice(i, 1); continue; }
      const k = f.age / f.life;
      ctx.save(); ctx.globalAlpha = 1 - k * k;
      chip(f.text, f.x, f.y - k * 120, f.size, f.bg || C.yellow, C.ink, 'center');
      ctx.restore();
    }
  }
  function flash(now) {
    const k = (now - anim.flashAt) / 500;
    if (k < 0 || k >= 1) return;
    ctx.save(); ctx.globalAlpha = (1 - k) * 0.9; ctx.lineWidth = 26; ctx.strokeStyle = anim.flashColor; ctx.strokeRect(13, 13, W - 26, H - 26); ctx.restore();
  }

  // ---------------- đầu vào tại chỗ (cửa sổ chơi) ----------------
  let typing = null, composing = false, lastTypeAt = 0, lastRev = -1;
  if (input && typeof document !== 'undefined') {
    typing = document.createElement('input');
    typing.type = 'text'; typing.autocomplete = 'off'; typing.spellcheck = false; typing.setAttribute('aria-label', 'Ô gõ mật khẩu');
    Object.assign(typing.style, { position: 'absolute', zIndex: 5, opacity: '0', border: '0', padding: '0', fontSize: '16px', display: 'none' });
    el.append(typing);
    typing.addEventListener('compositionstart', () => { composing = true; });
    typing.addEventListener('compositionend', () => { composing = false; lastTypeAt = performance.now(); input({ type: 'text', value: typing.value }); });
    typing.addEventListener('input', (e) => {
      if (S?.status?.some((x) => x.kind === 'capslock') && e.data && /^insert/.test(e.inputType || '') && !composing) {
        const pos = typing.selectionStart ?? typing.value.length, n = e.data.length;
        const swap = [...e.data].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
        typing.value = typing.value.slice(0, pos - n) + swap + typing.value.slice(pos);
        typing.setSelectionRange(pos, pos);
      }
      lastTypeAt = performance.now(); input({ type: 'text', value: typing.value });
    });
    typing.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); input({ type: 'enter' }); } });
    canvas.style.cursor = 'text';
    canvas.addEventListener('pointerdown', () => { sound.resume(); if (S?.phase === 'intro') input({ type: 'start' }); setTimeout(() => typing.focus(), 0); });
    addEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (!S || e.target === typing) return;
    if (S.phase === 'intro' && e.key === 'Enter') { input({ type: 'start' }); return; }
    if (field && e.key.length === 1 && !e.ctrlKey && !e.metaKey) typing.focus();
  }
  function placeTyping() {
    if (!typing) return;
    if (!field || S?.mode === 'viewer' || S?.paused) { if (typing.style.display !== 'none') { typing.style.display = 'none'; typing.blur(); } return; }
    const s = canvas.clientWidth / W;
    Object.assign(typing.style, { display: 'block', left: `${canvas.offsetLeft + field.x * s}px`, top: `${canvas.offsetTop + field.y * s}px`, width: `${field.w * s}px`, height: `${field.h * s}px` });
    if (S.rev !== lastRev) { lastRev = S.rev; typing.value = S.typed || ''; }
    else if (!composing && performance.now() - lastTypeAt > 450 && typing.value !== (S.typed || '')) typing.value = S.typed || '';
  }

  // ---------------- vòng vẽ ----------------
  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    anim.shake = Math.max(0, anim.shake - dt * 2.5);
    field = null;
    drawBg(now, dt);
    if (!S) { placeTyping(); return; }
    ctx.save();
    if (anim.shake && !reduced) ctx.translate((Math.random() - 0.5) * 18 * anim.shake, (Math.random() - 0.5) * 18 * anim.shake);
    drawHeader(now);
    drawBot(now);
    drawPassword(now);
    const viewer = S.mode === 'viewer';
    const top = viewer && S.latest && !sameTry(S.latest, S.bestTry) ? 800 : 772;
    const bottom = S.vote ? 1196 : viewer && S.top?.players?.length ? 1360 : 1470;
    drawRules(now, top, bottom);
    if (S.vote) panel('vote', { x: 60, y: 1220 }, () => drawVote(now));
    else if (viewer) panel('board', { x: 24, y: 1384 }, () => drawBoard());
    drawPending(now, 1490);
    panel('gifts', { x: 24, y: 1500 }, () => drawGifts(now));
    ctx.restore();
    if (S.phase === 'intro') drawIntro(now);
    if (S.phase === 'result') drawResult(now);
    drawTitle(now);
    drawHack(now);
    flash(now);
    drawParticles(dt);
    if (S.paused) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H); outline('⏸ TẠM DỪNG', W / 2, H / 2, 100, '#fff', C.ink, null); }
    placeTyping();
    // tiếng tích tắc 10 giây cuối
    if (S.phase === 'play' && !S.paused) { const sec = Math.ceil(S.remainingMs / 1000 - (performance.now() - recvAt) / 1000); if (sec <= 10 && sec > 0 && sec !== anim.lastSec) { anim.lastSec = sec; sound.play('tick'); } }
  }
  let recvAt = 0;
  (document.fonts?.ready || Promise.resolve()).finally(() => { if (!stopped) raf = requestAnimationFrame(frame); });
  document.fonts?.load?.(`800 40px ${TITLE}`).catch?.(() => {});

  const title = (txt, by, sub, color, life = 1.9) => { anim.title = { text: txt, by, sub, color, at: performance.now(), life }; };
  return {
    update(s) {
      const now = performance.now();
      const key = `${s.phase}|${s.level}|${s.result?.win ?? ''}`;
      if (key !== anim.phaseKey) { anim.phaseKey = key; anim.phaseAt = now; if (s.phase !== 'play') anim.title = null; }
      if (s.vote && !S?.vote) anim.voteAt = now;
      S = s; recvAt = now;
    },
    effect(fx) {
      const now = performance.now();
      switch (fx.type) {
        case 'mk_rule': if (fx.no > 1 || fx.by) { sound.play('rule'); if (fx.sub) floaters.push({ text: `🔐 Luật ${fx.no}: ${fx.sub}`, x: W / 2, y: 1160, size: 24, life: 1.6, age: 0, bg: C.yellow }); } break;
        case 'mk_wrong': anim.wrongAt = now; anim.wrong = new Set(fx.failing || []); anim.flashAt = now; anim.flashColor = C.red; sound.play('wrong'); break;
        case 'mk_unlock': sound.play('unlock'); floaters.push({ text: `⭐ ${fx.by?.name || ''} mở luật ${fx.no + 1}!`, x: W / 2, y: 1160, size: 26, life: 1.8, age: 0, bg: C.mint }); break;
        case 'mk_close': floaters.push({ text: `🔥 ${fx.by?.name || ''} chỉ còn 1 luật!`, x: W / 2, y: 1160, size: 22, life: 1.4, age: 0, bg: C.orange }); break;
        case 'mk_vote_start': sound.play('vote'); break;
        case 'mk_vote': sound.play('tap'); break;
        case 'mk_vote_end': if (S?.phase === 'play') title(`KHÁN GIẢ CHỌN ${fx.i + 1}!`, null, fx.text, C.purple, 1.8); sound.play('rule'); break;
        case 'mk_hacked': anim.hackAt = now; sound.play('hack'); break;
        case 'mk_meo': anim.meoAt = now; sound.play('meo'); break;
        case 'mk_hint': anim.hintAt.set(fx.no, now); break;
        case 'mk_gift': {
          const a = ACT[fx.action];
          if (!a) break;
          (anim.hot ||= {})[fx.action] = now + 1200;
          if (fx.blocked) { title('🛡️ KHIÊN ĐÃ CHẶN!', fx.by?.name, `${a.icon} ${a.name} vô hiệu`, C.sky); sound.play('shield'); break; }
          if (fx.action !== 'hacker') title(`${a.icon} ${a.title}`, fx.by?.name, fx.sub, HELP.has(fx.action) ? C.mint : C.pink, fx.action === 'raluat' ? 2.4 : 1.9);
          if (!HELP.has(fx.action)) { anim.shake = Math.max(anim.shake, 0.35); anim.flashAt = now; anim.flashColor = C.pink; }
          sound.play(HELP.has(fx.action) ? 'help' : 'harm');
          break;
        }
        case 'mk_win': burst(260); setTimeout(() => burst(160, 260, 700), 300); setTimeout(() => burst(160, 820, 700), 550); sound.play('win'); break;
        case 'mk_fail': anim.shake = 1; anim.flashAt = now; anim.flashColor = C.red; sound.play('fail'); break;
        case 'mk_intro': sound.play('brief'); break;
        case 'mk_start': sound.play('start'); break;
        case 'mk_penalty': title('⚖️ ÁN PHẠT!', null, fx.kind === 'time' ? 'Bớt 20 giây vì thua màn trước' : fx.kind === 'forbid' ? 'Cấm sẵn 1 chữ cái' : 'Tặng kèm 1 luật siêu khó', C.orange, 2.2); sound.play('harm'); break;
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
  function tone(f, dur, { type = 'sine', vol = 0.16, at = 0, slide = 0 } = {}) {
    const a = get(); if (!a || a.state !== 'running') return;
    const t0 = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const P = {
    rule: () => { tone(660, 0.08, { type: 'square', vol: 0.06 }); tone(990, 0.14, { type: 'triangle', at: 0.08 }); },
    wrong: () => { tone(180, 0.12, { type: 'square', vol: 0.09 }); tone(140, 0.22, { type: 'square', vol: 0.09, at: 0.12 }); },
    unlock: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.12, { type: 'triangle', at: i * 0.06 })),
    vote: () => [523, 659].forEach((f, i) => tone(f, 0.14, { type: 'triangle', at: i * 0.1 })),
    tap: () => tone(1200, 0.04, { type: 'square', vol: 0.03 }),
    hack: () => { for (let i = 0; i < 10; i++) tone(200 + Math.random() * 1400, 0.05, { type: 'square', vol: 0.05, at: i * 0.06 }); tone(80, 0.8, { type: 'sawtooth', vol: 0.1, at: 0.6, slide: 0.5 }); },
    meo: () => { tone(700, 0.3, { vol: 0.14, slide: 1.4 }); tone(900, 0.35, { vol: 0.12, at: 0.28, slide: 0.7 }); },
    harm: () => tone(220, 0.35, { type: 'sawtooth', vol: 0.08, slide: 0.6 }),
    help: () => [659, 784, 1047].forEach((f, i) => tone(f, 0.14, { type: 'triangle', at: i * 0.07 })),
    shield: () => tone(400, 0.4, { type: 'sine', vol: 0.14, slide: 2.2 }),
    tick: () => tone(1500, 0.04, { type: 'square', vol: 0.04 }),
    win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { type: 'triangle', at: i * 0.11 })),
    fail: () => [392, 370, 349, 294].forEach((f, i) => tone(f, i === 3 ? 0.8 : 0.32, { type: 'sawtooth', vol: 0.07, at: i * 0.34, slide: i === 3 ? 0.85 : 0 })),
    brief: () => { tone(660, 0.1, { type: 'triangle' }); tone(990, 0.16, { type: 'triangle', at: 0.1 }); },
    start: () => [523, 784, 1047].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.05, at: i * 0.08 })),
  };
  return {
    play(n) { try { P[n]?.(); } catch { /* bỏ qua */ } },
    resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } },
    close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; },
  };
}

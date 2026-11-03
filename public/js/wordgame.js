// Game đoán từ theo nghĩa cho TikTok Live.
// ?mute=1  ?debug=1  ?phone=1|0
import { SoundBoard } from './sound.js';

const W = 1080, H = 1920;
const qs = new URLSearchParams(location.search);
const opt = {
  mute: qs.get('mute') === '1',
  debug: qs.get('debug') === '1',
  phone: qs.get('phone') === '1' || (qs.get('phone') !== '0' && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches),
};
if (opt.phone) document.body.classList.add('phone');

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = W * s + 'px';
  canvas.style.height = H * s + 'px';
}
addEventListener('resize', fit);
fit();

let G = null; // snapshot game
let cfg = {};
let wsOk = false;
let sound = new SoundBoard({ muted: opt.mute });
const fx = { confetti: [], floaters: [], flash: 0, hintFlash: 0, rowY: new Map(), highlight: new Map(), banner: null, letterAt: new Map(), unlockFlash: new Map() };

// ---------------- tiện ích ----------------
const font = (w, s, serif = false) => `${w} ${s}px ${serif ? "'Noto Serif', serif" : "'Be Vietnam Pro', system-ui, sans-serif"}`;
const clip = (t, n) => { const a = [...String(t || '')]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
function fitText(text, maxW) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function outlined(text, x, y, fill = '#fff', stroke = 'rgba(0,0,0,.8)', lw = 6) {
  ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3));
/** Màu theo điểm: đỏ (xa) → vàng → xanh lá (gần). */
function scoreColor(s) {
  const h = Math.max(0, Math.min(130, (s / 100) * 130));
  return `hsl(${h}, 80%, ${s >= 95 ? 45 : 52}%)`;
}
function scoreLabel(s) {
  if (s >= 100) return 'TRÚNG!';
  if (s >= 85) return 'Rất nóng 🔥';
  if (s >= 65) return 'Nóng';
  if (s >= 40) return 'Ấm';
  if (s >= 20) return 'Lạnh';
  return 'Băng giá ❄';
}

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
    if (avatars.size > 300) avatars.delete(avatars.keys().next().value);
  }
  return a.ok ? a.img : null;
}
function avatar(user, x, y, r, ring = '#fff') {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  const img = avatarImg(user?.avatar);
  if (img) { ctx.save(); ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); ctx.restore(); }
  else {
    const n = user?.name || '?'; let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
    ctx.fillStyle = `hsl(${h},50%,45%)`; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(800, Math.round(r * 1.1)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText([...n][0]?.toUpperCase() || '?', x, y + 1);
  }
  ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = ring;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function confetti(n = 220) {
  const colors = ['#ffd54a', '#4ade80', '#60a5fa', '#f472b6', '#fff'];
  for (let i = 0; i < n; i++) {
    fx.confetti.push({ x: Math.random() * W, y: -20 - Math.random() * 600, vx: (Math.random() - 0.5) * 80, vy: 160 + Math.random() * 160, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8, life: 1, color: colors[i % colors.length], s: 6 + Math.random() * 8 });
  }
}

// ---------------- sự kiện ----------------
function handle(e) {
  switch (e.type) {
    case 'wg_guess':
      if (e.dup && e.score != null) fx.highlight.set(e.word, performance.now());
      sound.play('mo');
      break;
    case 'wg_scored':
      fx.highlight.set(e.word, performance.now());
      if (e.score >= 85) { sound.play('chime', { pitch: 1.5 }); fx.floaters.push({ text: `🔥 ${e.word}: ${e.score}`, x: W / 2, y: L.rankTop + 24, life: 1, color: '#4ade80' }); }
      else if (e.score >= 60) sound.play('chime', { pitch: 1.1 });
      break;
    case 'wg_progress':
      fx.unlockFlash.set(e.rule, performance.now());
      sound.play('chime', { pitch: 1.3 });
      fx.floaters.push({ text: `${e.icon || '🎁'} ${e.count}/${e.every}`, x: W - 150, y: L.secretBottom - 70, life: 1, color: '#fbcfe8' });
      break;
    case 'wg_unlock': {
      const now = performance.now();
      fx.unlockFlash.set(G?.unlocks?.find((u) => u.label === e.label)?.id, now);
      for (const i of e.indexes || []) fx.letterAt.set(i, now);
      const who = e.by ? clip(e.by.name, 16) : 'Ai đó';
      const what = e.action === 'letter' ? 'lộ 1 chữ cái!' : e.action === 'syllable' ? 'lộ cả 1 tiếng!' : e.action === 'time' ? `+${e.seconds} giây!` : 'mở gợi ý!';
      fx.banner = { text: `${e.icon || '🎁'} ${who} tặng ${e.repeat > 1 ? e.repeat + ' ' : ''}${e.giftName || 'quà'}: ${what}`, sub: e.hint || e.label || '', t: 4, color: '#facc15' };
      fx.hintFlash = 1;
      sound.play(e.action === 'syllable' ? 'levelup' : 'bell');
      break;
    }
    case 'wg_hints_updated':
      fx.hintFlash = 1;
      fx.banner = { text: '✨ Gợi ý vừa được làm mới!', sub: '', t: 2.5, color: '#a5b4fc' };
      break;
    case 'wg_hint':
      if (e.by) break; // gợi ý do quà mở đã có thông báo wg_unlock
      fx.hintFlash = 1;
      sound.play('bell');
      fx.banner = { text: e.by ? `💡 ${clip(e.by.name, 18)} tặng quà mở gợi ý!` : '💡 Gợi ý mới!', sub: e.hint, t: 4, color: '#facc15' };
      break;
    case 'wg_win':
      fx.flash = 1;
      confetti();
      sound.play('levelup');
      break;
    case 'wg_timeout':
      sound.play('bell');
      break;
    case 'wg_start':
      fx.rowY.clear(); fx.highlight.clear(); fx.letterAt.clear();
      sound.play('chime');
      fx.banner = { text: `VÒNG ${e.round} BẮT ĐẦU!`, sub: 'Bình luận một từ để đoán', t: 3, color: '#60a5fa' };
      break;
  }
}

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { wsOk = true; };
  ws.onclose = () => { wsOk = false; setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (m) => {
    let msg; try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.type === 'hello') {
      const first = !G;
      cfg = msg.config; G = msg.wg;
      if (first) {
        sound = new SoundBoard({ muted: opt.mute, files: cfg.sounds, ambientVolume: cfg.ambientVolume });
        sound.init();
        if (started) sound.resume();
        setTimeout(() => { if (!opt.mute && !opt.phone && sound.suspended) soundBtn.style.display = 'block'; }, 800);
      }
    } else if (msg.type === 'wg') {
      G = msg.wg;
    } else if (msg.type === 'wgfx') {
      for (const e of msg.effects) handle(e);
    }
  };
}
const soundBtn = document.getElementById('sound');
soundBtn.onclick = () => { sound.resume(); soundBtn.style.display = 'none'; };

let started = false;
async function keepAwake() { try { await navigator.wakeLock?.request('screen'); } catch { /* cần HTTPS */ } }
const startEl = document.getElementById('start');
if (opt.phone) startEl.hidden = false;
startEl.querySelector('button').onclick = async () => {
  started = true;
  sound.resume();
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { /* bỏ qua */ }
  keepAwake();
  startEl.hidden = true;
};
document.addEventListener('visibilitychange', () => { if (started && document.visibilityState === 'visible') { keepAwake(); sound.resume(); } });

// ---------------- vẽ ----------------
function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1030'); g.addColorStop(0.5, '#1a1550'); g.addColorStop(1, '#0d0b2a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // chữ cái bay mờ làm nền
  ctx.save();
  ctx.font = font(900, 80); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const letters = 'AĂÂBCDĐEÊGHIKLMNOÔƠPQRSTUƯVXY';
  for (let i = 0; i < 26; i++) {
    const x = (i * 197) % W, y = ((i * 331 + t * (12 + (i % 5) * 6)) % (H + 200)) - 100;
    ctx.fillStyle = `rgba(255,255,255,${0.03 + (i % 3) * 0.015})`;
    ctx.fillText(letters[i % letters.length], x, H - y);
  }
  ctx.restore();
}

function drawHeader() {
  const y = 300;
  ctx.save();
  rr(40, y, W - 80, 72, 36);
  ctx.fillStyle = 'rgba(15,18,60,.88)'; ctx.fill();
  ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 3; ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.font = font(900, 32); ctx.fillStyle = '#c7d2fe';
  ctx.fillText(fitText(`🔤 ${(G.title || 'Đoán từ').toUpperCase()} · VÒNG ${G.round}`, W - 400), 76, y + 37);
  const m = Math.floor(G.remaining / 60), s = String(G.remaining % 60).padStart(2, '0');
  const label = G.phase === 'playing' ? `⏱ ${m}:${s}` : `Vòng mới sau ${G.remaining}s`;
  ctx.font = font(800, 30);
  const urgent = G.phase === 'playing' && G.remaining <= 20;
  ctx.fillStyle = urgent ? (Math.floor(performance.now() / 300) % 2 ? '#f87171' : '#fff') : '#fff';
  ctx.textAlign = 'right'; ctx.fillText(label, W - 76, y + 37);
  ctx.restore();
}

// Bố cục tính lại mỗi khung hình: khung "Từ bí mật" cao theo số gợi ý + hàng chip quà,
// các khối bên dưới dịch theo để không bị che.
const L = { secretBottom: 692, rankTop: 714, rankBottom: 1264, guideBottom: 1332, feedY: 1410 };

/** Đo và xếp chip "quà mở khoá" thành các hàng vừa chiều ngang. */
function chipLayout() {
  const list = G.unlocks || [];
  ctx.save();
  ctx.font = font(700, 18);
  const items = list.map((u) => ({
    text: `${u.icon || '🎁'} ${u.label}${u.every ? ` (${u.count}/${u.every})` : ''}`,
    active: !!(u.every && u.count > 0), id: u.id,
  }));
  const pad = 12, gap = 8;
  const ws = items.map((it) => ctx.measureText(it.text).width + pad * 2);
  ctx.restore();
  const rows = items.length ? [[]] : [];
  let rowW = 0;
  items.forEach((it, i) => {
    if (rowW + ws[i] > W - 120 && rows[rows.length - 1].length) { rows.push([]); rowW = 0; }
    rows[rows.length - 1].push(i); rowW += ws[i] + gap;
  });
  return { items, ws, rows, gap };
}

function drawSecret(t) {
  const y = 392;
  const groups = G.pattern;
  const total = groups.reduce((a, b) => a + b, 0) + (groups.length - 1) * 0.8;
  const cell = Math.min(62, (W - 160) / total);
  const topicH = G.topic ? 34 : 0; // dòng "Chủ đề" của bộ từ (nếu có)
  const boxTop = y + 62 + topicH, boxBottom = boxTop + cell * 1.05;
  // vị trí các dòng gợi ý, dòng "gợi ý tiếp", hàng chip — xếp nối tiếp nhau
  const hints = G.hints || [];
  const hintFont = hints.length > 3 ? 23 : 25; // bộ có 4-5 gợi ý thì chữ nhỏ hơn chút
  // khoảng cách rộng rãi để chữ không chạm nhau trên mọi máy
  let cy = boxBottom + 40;
  const hintGap = hints.length > 3 ? 36 : 42;
  const hintYs = hints.map((_, i) => cy + i * hintGap);
  cy += hints.length * hintGap;
  const showNext = G.nextHintIn != null && hints.length < (G.maxHints || 3) && G.phase === 'playing';
  const nextY = cy;
  if (showNext) cy += 36;
  const chips = chipLayout();
  const chipY0 = cy + (hints.length || showNext ? 18 : 4); // tâm hàng chip đầu
  const h = Math.max(230, chipY0 + Math.max(0, chips.rows.length - 1) * 46 + 40 - y);
  L.secretBottom = y + h;

  ctx.save();
  rr(40, y, W - 80, h, 26);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(49,46,129,.92)'); g.addColorStop(1, 'rgba(30,27,75,.92)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = fx.hintFlash > 0 ? `rgba(250,204,21,${0.5 + fx.hintFlash / 2})` : '#6366f1'; ctx.lineWidth = 3 + fx.hintFlash * 4; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(800, 22); ctx.fillStyle = '#a5b4fc';
  ctx.fillText(G.secretLabel || 'TỪ BÍ MẬT', W / 2, y + 30);
  if (G.topic) {
    ctx.font = font(700, 22); ctx.fillStyle = '#c7d2fe';
    ctx.fillText(fitText(`📚 Chủ đề: ${G.topic}`, W - 160), W / 2, y + 62);
  }
  // ô chữ: mỗi tiếng một nhóm ô
  const revealed = G.secret ? G.secret.split(' ') : null;
  let x = W / 2 - (total * cell) / 2;
  const now = performance.now();
  let flat = 0;
  groups.forEach((n, gi) => {
    for (let i = 0; i < n; i++, flat++) {
      const cx = x + cell / 2;
      const opened = !revealed ? G.letters?.[gi]?.[i] : null; // chữ lộ nhờ quà
      const born = fx.letterAt.get(flat);
      const pop = born ? Math.max(0, 1 - (now - born) / 600) : 0;
      ctx.save();
      ctx.translate(cx, boxTop + cell * 0.52); ctx.scale(1 + pop * 0.35, 1 + pop * 0.35); ctx.translate(-cx, -(boxTop + cell * 0.52));
      rr(cx - cell * 0.42, boxTop, cell * 0.84, cell * 1.05, 10);
      ctx.fillStyle = revealed ? '#4ade80' : opened ? '#facc15' : 'rgba(255,255,255,.12)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
      const ch = revealed ? [...revealed[gi]][i] : opened;
      if (ch) {
        ctx.font = font(900, Math.round(cell * 0.7)); ctx.fillStyle = revealed ? '#052e16' : '#3b2500';
        ctx.fillText(ch.toUpperCase(), cx, boxTop + cell * 0.55);
      }
      ctx.restore();
      x += cell;
    }
    x += cell * 0.8;
  });
  // gợi ý
  ctx.font = font(700, hintFont);
  hints.forEach((hnt, i) => {
    ctx.fillStyle = '#fde68a';
    ctx.fillText(fitText('💡 ' + hnt, W - 140), W / 2, hintYs[i]);
  });
  if (showNext) {
    ctx.font = font(500, 19); ctx.fillStyle = 'rgba(199,210,254,.8)';
    ctx.fillText(`Gợi ý tiếp sau ${G.nextHintIn}s`, W / 2, nextY);
  }
  drawUnlockMenu(chips, chipY0);
  ctx.restore();
}

/** Dòng "quà mở khoá" dưới ô chữ, kèm tiến độ gom quà (vd 🌹 3/5). */
function drawUnlockMenu({ items, ws, rows, gap }, y0) {
  if (!items.length) return;
  ctx.save();
  ctx.font = font(700, 18); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const now = performance.now();
  rows.forEach((row, ri) => {
    const total = row.reduce((a, i) => a + ws[i], 0) + gap * (row.length - 1);
    let x = (W - total) / 2;
    const y = y0 + ri * 46;
    row.forEach((i) => {
      const it = items[i];
      const flash = fx.unlockFlash.get(it.id);
      const k = flash ? Math.max(0, 1 - (now - flash) / 1200) : 0;
      rr(x, y - 17, ws[i], 34, 17);
      ctx.fillStyle = k > 0 ? `rgba(250,204,21,${0.3 + k * 0.5})` : it.active ? 'rgba(244,114,182,.3)' : 'rgba(255,255,255,.08)'; ctx.fill();
      ctx.strokeStyle = it.active || k > 0 ? '#fbcfe8' : 'rgba(165,180,252,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(it.text, x + ws[i] / 2, y + 1);
      x += ws[i] + gap;
    });
  });
  ctx.restore();
}

function drawRanking(t) {
  const top = L.secretBottom + 26, rowH = 60, x = 40, w = W - 80;
  const list = (G.ranked || []).slice(0, L.secretBottom > 800 ? 6 : L.secretBottom > 740 ? 7 : 8);
  L.rankTop = top;
  L.rankBottom = top + 56 + Math.max(1, list.length) * rowH + 14;
  ctx.save();
  rr(x, top, w, 56 + Math.max(1, list.length) * rowH + 14, 24);
  ctx.fillStyle = 'rgba(15,18,60,.86)'; ctx.fill();
  ctx.strokeStyle = 'rgba(129,140,248,.6)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.font = font(800, 24); ctx.fillStyle = '#c7d2fe';
  ctx.fillText('🎯 GẦN NGHĨA NHẤT', x + 26, top + 30);
  ctx.textAlign = 'right'; ctx.font = font(600, 19); ctx.fillStyle = 'rgba(199,210,254,.8)';
  ctx.fillText(`${G.totalGuesses || 0} từ đã đoán`, x + w - 26, top + 30);
  if (!list.length) {
    ctx.textAlign = 'center'; ctx.font = font(600, 24); ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText('Chưa có ai đoán — bình luận một từ bất kỳ!', W / 2, top + 56 + rowH / 2);
  }
  const now = performance.now();
  list.forEach((r, i) => {
    const target = top + 56 + i * rowH;
    const cur = fx.rowY.has(r.word) ? lerp(fx.rowY.get(r.word), target, 0.18) : target + 30;
    fx.rowY.set(r.word, cur);
    const hl = fx.highlight.get(r.word);
    const hk = hl ? Math.max(0, 1 - (now - hl) / 1500) : 0;
    const y = cur;
    // nền dòng + thanh điểm
    rr(x + 16, y + 4, w - 32, rowH - 8, 14);
    ctx.fillStyle = hk > 0 ? `rgba(250,204,21,${0.15 + hk * 0.25})` : 'rgba(255,255,255,.05)'; ctx.fill();
    const barW = (w - 32) * Math.max(0.03, r.score / 100);
    rr(x + 16, y + 4, barW, rowH - 8, 14);
    ctx.fillStyle = scoreColor(r.score); ctx.globalAlpha = 0.28; ctx.fill(); ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.font = font(800, 20); ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText(String(i + 1), x + 44, y + rowH / 2);
    ctx.textAlign = 'left'; ctx.font = font(800, 30); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(r.word, 360), x + 74, y + rowH / 2 + 1);
    avatar(r.by, x + 470, y + rowH / 2, 15, 'rgba(255,255,255,.7)');
    ctx.font = font(600, 18); ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText(fitText(r.by?.name, 190) + (r.count > 1 ? ` +${r.count - 1}` : ''), x + 492, y + rowH / 2 + 1);
    ctx.textAlign = 'right'; ctx.font = font(900, 34); ctx.fillStyle = scoreColor(r.score);
    outlined(String(r.score), x + w - 30, y + rowH / 2 + 1, scoreColor(r.score), 'rgba(0,0,0,.6)', 4);
  });
  ctx.restore();
}

function drawFeed() {
  const list = (G.feed || []).slice(0, 4);
  const y0 = L.feedY;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = font(700, 20); ctx.fillStyle = 'rgba(199,210,254,.8)'; ctx.textAlign = 'left';
  if (list.length) ctx.fillText('VỪA ĐOÁN', 60, y0 - 44);
  list.forEach((f, i) => {
    const y = y0 + i * 58;
    ctx.globalAlpha = 1 - i * 0.18;
    ctx.font = font(700, 24);
    const label = `${clip(f.by?.name, 14)}: ${clip(f.word, 18)}`;
    const sc = f.pending ? '…' : String(f.score);
    const tw = ctx.measureText(label).width;
    const w = tw + 150;
    rr(40, y - 24, w, 48, 24);
    ctx.fillStyle = 'rgba(15,18,60,.85)'; ctx.fill();
    ctx.strokeStyle = f.pending ? 'rgba(255,255,255,.3)' : scoreColor(f.score); ctx.lineWidth = 2; ctx.stroke();
    avatar(f.by, 66, y, 16, 'rgba(255,255,255,.7)');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.fillText(label, 92, y + 1);
    ctx.textAlign = 'right'; ctx.font = font(900, 26);
    ctx.fillStyle = f.pending ? 'rgba(255,255,255,.6)' : scoreColor(f.score);
    ctx.fillText(sc, 40 + w - 18, y + 1);
  });
  ctx.restore();
}

function drawGuide() {
  const items = ['💬 Bình luận 1 từ để đoán', '🎯 100 điểm = trúng'];
  ctx.save();
  ctx.font = font(800, 24); ctx.textBaseline = 'middle';
  const pad = 18, gap = 12;
  const ws = items.map((s) => ctx.measureText(s).width + pad * 2);
  let x = (W - ws.reduce((a, b) => a + b, 0) - gap * (items.length - 1)) / 2;
  const y = L.rankBottom + 18;
  L.guideBottom = y + 50;
  L.feedY = y + 128;
  items.forEach((s, i) => {
    rr(x, y, ws[i], 50, 25);
    ctx.fillStyle = 'rgba(15,18,60,.85)'; ctx.fill();
    ctx.strokeStyle = 'rgba(129,140,248,.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(s, x + ws[i] / 2, y + 26);
    x += ws[i] + gap;
  });
  ctx.restore();
}

function drawChampions() {
  const list = G.champions || [];
  if (!list.length) return;
  ctx.save();
  ctx.font = font(700, 20); ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  const medals = ['🥇', '🥈', '🥉'];
  list.forEach((c, i) => {
    const y = L.feedY + i * 44;
    const label = `${medals[i]} ${clip(c.name, 12)} · ${c.wins} lần`;
    const w = ctx.measureText(label).width + 30;
    rr(W - 40 - w, y - 19, w, 38, 19);
    ctx.fillStyle = 'rgba(15,18,60,.8)'; ctx.fill();
    ctx.fillStyle = '#fde68a'; ctx.fillText(label, W - 55, y + 1);
  });
  ctx.restore();
}

function drawEnd(t) {
  if (G.phase !== 'ended') return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, L.rankTop - 6, W, 640);
  const y = L.rankTop + 54;
  rr(80, y, W - 160, 470, 34);
  const win = G.winner;
  ctx.fillStyle = win ? '#166534' : '#3730a3'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(800, 34); ctx.fillStyle = '#fff';
  ctx.fillText(win ? '🎉 ĐOÁN TRÚNG! 🎉' : '⏰ HẾT GIỜ!', W / 2, y + 56);
  ctx.font = font(600, 26); ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText('Đáp án là', W / 2, y + 108);
  const s = 1 + 0.04 * Math.sin(t * 6);
  ctx.save();
  ctx.translate(W / 2, y + 180); ctx.scale(s, s);
  ctx.font = font(900, 78);
  outlined(fitText((G.answer || G.secret || '').toUpperCase(), W - 240), 0, 0, '#fde68a', 'rgba(0,0,0,.5)', 10);
  ctx.restore();
  if (win) {
    avatar(win, W / 2, y + 300, 56, '#fde68a');
    ctx.font = font(800, 32); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(win.name, 600), W / 2, y + 392);
  } else {
    const best = (G.ranked || [])[0];
    ctx.font = font(700, 28); ctx.fillStyle = '#fff';
    if (best) ctx.fillText(fitText(`Gần nhất: ${best.word} (${best.score}) — ${best.by?.name || ''}`, W - 220), W / 2, y + 300);
  }
  ctx.font = font(600, 22); ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText(`Vòng mới sau ${G.remaining}s`, W / 2, y + 440);
  ctx.restore();
}

function drawBanner(dt) {
  const b = fx.banner;
  if (!b) return;
  b.t -= dt;
  if (b.t <= 0) { fx.banner = null; return; }
  const k = Math.min(1, b.t * 3, (3.5 - Math.min(3.5, b.t)) * 4 + 0.001);
  ctx.save();
  ctx.globalAlpha = Math.min(1, k);
  const by = L.guideBottom + 14;
  rr(90, by, W - 180, 96, 26);
  ctx.fillStyle = 'rgba(15,18,60,.95)'; ctx.fill();
  ctx.strokeStyle = b.color; ctx.lineWidth = 4; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(800, 28); ctx.fillStyle = b.color;
  ctx.fillText(fitText(b.text, W - 240), W / 2, by + 30);
  ctx.font = font(600, 22); ctx.fillStyle = '#fff';
  ctx.fillText(fitText(b.sub || '', W - 240), W / 2, by + 68);
  ctx.restore();
}

function drawFloaters(dt) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of fx.floaters) {
    f.life -= dt * 0.7; f.y -= dt * 60;
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
    ctx.font = font(900, 36);
    outlined(f.text, f.x, f.y, f.color, 'rgba(0,0,0,.85)', 6);
  }
  ctx.restore();
  fx.floaters = fx.floaters.filter((f) => f.life > 0);
}

function drawConfetti(dt) {
  for (const c of fx.confetti) {
    c.life -= dt * 0.2; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
    ctx.fillStyle = c.color; ctx.globalAlpha = Math.min(1, c.life * 3);
    ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2);
    ctx.restore();
  }
  fx.confetti = fx.confetti.filter((c) => c.life > 0 && c.y < H + 40);
}

let last = performance.now();
let fps = 60;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = lerp(fps, 1 / Math.max(dt, 0.001), 0.05);
  const t = now / 1000;
  ctx.clearRect(0, 0, W, H);
  if (!G) {
    ctx.fillStyle = '#0b1030'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c7d2fe'; ctx.font = font(800, 36); ctx.textAlign = 'center';
    ctx.fillText('Đang chuẩn bị từ bí mật…', W / 2, H / 2);
    requestAnimationFrame(frame); return;
  }
  fx.flash = Math.max(0, fx.flash - dt);
  fx.hintFlash = Math.max(0, fx.hintFlash - dt * 0.5);

  drawBackground(t);
  drawHeader();
  drawSecret(t);
  drawRanking(t);
  drawGuide();
  drawFeed();
  drawChampions();
  drawFloaters(dt);
  drawEnd(t);
  drawBanner(dt);
  drawConfetti(dt);
  if (fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (opt.debug) {
    ctx.font = font(700, 20); ctx.textAlign = 'left';
    outlined(`${Math.round(fps)} fps · ws ${wsOk ? 'OK' : 'mất'}`, 20, 40, wsOk ? '#9f9' : '#f88', '#000', 4);
  }
  requestAnimationFrame(frame);
}

connect();
(document.fonts?.ready || Promise.resolve()).finally(() => requestAnimationFrame(frame));

// Game đua thú cho TikTok Live: comment OK để nhận một con vật, tối đa 6 con / vòng.
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
const fmt = new Intl.NumberFormat('vi-VN');
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = W * s + 'px';
  canvas.style.height = H * s + 'px';
}
addEventListener('resize', fit);
fit();

let R = null; // snapshot đua thú
let cfg = {};
let wsOk = false;
let sound = new SoundBoard({ muted: opt.mute });
const fx = { floaters: [], confetti: [], alerts: [], alert: null, shake: 0, flash: 0, countdownAt: 0, goAt: 0, endAt: 0 };

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
function avatar(user, x, y, r, ring = '#f5c542') {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  const img = avatarImg(user?.avatar);
  if (img) { ctx.save(); ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); ctx.restore(); }
  else {
    const n = user?.name || '?'; let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
    ctx.fillStyle = `hsl(${h},50%,42%)`; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(800, Math.round(r * 1.1)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText([...n][0]?.toUpperCase() || '?', x, y + 1);
  }
  ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = ring;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ---------------- hiệu ứng ----------------
function floater(text, x, y, color = '#fff', size = 30) {
  if (fx.floaters.length > 40) fx.floaters.shift();
  fx.floaters.push({ text, x, y, life: 1, color, size });
}
function confetti(color, n = 160) {
  for (let i = 0; i < n; i++) {
    fx.confetti.push({
      x: Math.random() * W, y: -20 - Math.random() * 600, vx: (Math.random() - 0.5) * 80, vy: 160 + Math.random() * 160,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8, life: 1, color: Math.random() < 0.6 ? color : '#ffd54a', s: 6 + Math.random() * 8,
    });
  }
}
function queueAlert(a) {
  fx.alerts.push(a);
  while (fx.alerts.length > 10) {
    let idx = 0;
    for (let i = 1; i < fx.alerts.length; i++) if ((fx.alerts[i].prio || 0) < (fx.alerts[idx].prio || 0)) idx = i;
    fx.alerts.splice(idx, 1);
  }
}

// ---------------- trạng thái riêng ----------------
// Đường đua phối cảnh 3D: mép xa (u = 0) ở trên, nhỏ và hẹp; mép gần (u = 1) ở dưới, to và rộng.
const TRACK_TOP = 588, TRACK_BOT = 1240;
const ZF = 1.45; // độ sâu mép xa so với mép gần
const FOCAL = (TRACK_BOT - TRACK_TOP) / (1 - 1 / ZF);
const HORIZON = TRACK_BOT - FOCAL;
const HALF_W = 575; // nửa bề rộng đường đua ở mép gần (tràn nhẹ ra ngoài khung)
const P0 = -0.64, P1 = 0.8; // vạch xuất phát / vạch đích (tính theo nửa bề rộng); mũi con vật chạm vạch
const shown = new Map(); // id -> vị trí hiển thị 0..1 (nội suy mượt)
const trail = new Map(); // id -> độ mạnh vệt tăng tốc
const hits = new Map(); // id -> { kind, t0, dur } hiệu ứng trúng chướng ngại vật
fx.parts = []; fx.projectiles = []; fx.decals = [];

const laneCount = () => R?.maxRacers || 6;
const laneU = (lane) => (lane - 0.5) / laneCount();
/** Chiếu điểm trên mặt đường: xw ∈ [-1, 1] theo bề ngang, u ∈ [0, 1] từ xa tới gần. */
function proj(xw, u) {
  const z = ZF + (1 - ZF) * u;
  const s = 1 / z;
  return { x: W / 2 + xw * HALF_W * s, y: HORIZON + FOCAL / z, s };
}
const progX = (p) => P0 + (P1 - P0) * Math.max(0, Math.min(1.02, p));
const racerById = (id) => R?.racers.find((r) => r.id === id);
function racerXY(r) {
  const q = proj(progX(shown.get(r.id) ?? r.pos), laneU(r.lane));
  return { x: q.x - 46 * q.s, y: q.y - 30 * q.s, s: q.s };
}
const nowS = () => performance.now() / 1000;

function burst(x, y, n, opts) {
  for (let i = 0; i < n; i++) {
    const a = (opts.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (opts.spread ?? Math.PI * 2);
    const v = (opts.speed ?? 300) * (0.4 + Math.random() * 0.8);
    fx.parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: opts.g ?? 600, life: 1, decay: opts.decay ?? (0.8 + Math.random() * 0.8),
      size: (opts.size ?? 10) * (0.6 + Math.random() * 0.8), color: Array.isArray(opts.color) ? opts.color[i % opts.color.length] : opts.color,
      kind: opts.kind || 'spark', grow: opts.grow || 0, text: opts.text || null, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
    });
  }
  if (fx.parts.length > 600) fx.parts.splice(0, fx.parts.length - 600);
}

/** Chướng ngại vật bay tới mục tiêu rồi nổ / làm trượt chân. */
function impact(pr) {
  const r = racerById(pr.targetId);
  if (!r) return;
  const { x, y, s } = racerXY(r);
  hits.set(r.id, { kind: pr.kind, t0: nowS(), dur: Math.max(1.2, pr.seconds) });
  if (pr.kind === 'bomb') {
    fx.shake = 1.6; fx.flash = Math.max(fx.flash, 0.45);
    fx.rings = (fx.rings || []).concat({ x, y: y + 30 * s, s, t0: nowS() });
    burst(x, y, 70, { speed: 620 * s, color: ['#fff3b0', '#facc15', '#fb923c', '#ef4444'], size: 14 * s, g: 500, decay: 1.4 });
    burst(x, y, 16, { speed: 120 * s, color: 'rgba(60,60,60,.55)', size: 46 * s, g: -60, decay: 0.45, kind: 'smoke', grow: 60 });
    burst(x, y, 10, { speed: 420 * s, color: '#3f2a1a', size: 12 * s, g: 900, decay: 0.9, kind: 'rock' });
    fx.decals.push({ lane: r.lane, p: shown.get(r.id) ?? r.pos, kind: 'crater', life: 6 });
    floater('💥 BÙM!', x, y - 110 * s, '#fb923c', 64);
    sound.play('bell', { pitch: 0.5 }); sound.play('mo', { pitch: 0.4 });
  } else {
    fx.shake = Math.max(fx.shake, 0.7);
    burst(x, y + 30 * s, 18, { speed: 260 * s, color: ['#fde047', '#facc15', '#fff'], size: 9 * s, g: 700, angle: -Math.PI / 2, spread: Math.PI });
    fx.decals.push({ lane: r.lane, p: (shown.get(r.id) ?? r.pos) + 0.01, kind: 'peel', life: 5 });
    floater('🍌 TRƯỢT CHÂN!', x, y - 110 * s, '#facc15', 44);
    sound.play('mo', { pitch: 1.6 }); sound.play('chime', { pitch: 0.6 });
  }
}

function handle(e) {
  switch (e.type) {
    case 'race_lobby':
      fx.alerts.length = 0; fx.alert = null; shown.clear(); hits.clear(); fx.decals.length = 0;
      sound.play('bell');
      queueAlert({ title: `VÒNG ${e.round} — MỞ ĐĂNG KÝ`, sub: `Comment ${R?.joinWord || 'OK'} để nhận một con vật (tối đa ${R?.maxRacers || 6} con)`, prio: 9, dur: 3.5, color: '#facc15' });
      break;
    case 'race_join': {
      sound.play('chime', { pitch: 0.9 + e.racer.lane * 0.08 });
      const q = proj(-0.2, laneU(e.racer.lane));
      floater(`${e.racer.animal.emoji} ${clip(e.racer.name, 14)} vào làn ${e.racer.lane}`, q.x, q.y - 40 * q.s, e.racer.animal.color, 30);
      break;
    }
    case 'race_full':
      queueAlert({ title: 'ĐỦ NGƯỜI ĐUA!', sub: `Xuất phát sau ${e.startsIn} giây · comment OK để đăng ký vòng sau`, prio: 8, dur: 3, color: '#4ade80' });
      break;
    case 'race_queue':
      floater(`📝 ${clip(e.by?.name, 14)} đăng ký vòng sau (#${e.position})`, W / 2, TRACK_BOT - 30, '#c7d2fe', 26);
      break;
    case 'race_countdown':
      fx.countdownAt = performance.now();
      sound.play('bell');
      break;
    case 'race_go':
      fx.goAt = performance.now();
      fx.flash = 0.6;
      sound.play('levelup');
      break;
    case 'race_boost': {
      const r = racerById(e.racer.id) || e.racer;
      trail.set(r.id, Math.min(1, (trail.get(r.id) || 0) + (e.source === 'gift' ? 1 : 0.35)));
      if (e.silent) break;
      const { x, y, s } = racerXY(r);
      if (e.source === 'gift') {
        sound.play(e.diamonds >= 30 ? 'bell' : 'chime');
        floater(`🚀 +${fmt.format(e.amount)}`, x, y - 90 * s, '#ffe28a', 40);
        burst(x - 50 * s, y + 20 * s, 14, { speed: 260 * s, color: ['#fde68a', '#fff'], size: 8 * s, g: 0, angle: Math.PI, spread: 0.8, decay: 1.6 });
        queueAlert({
          user: e.by, color: r.animal?.color, prio: Math.min(6, 2 + Math.log10(Math.max(1, e.diamonds))),
          title: `${clip(e.by?.name, 18)} tiếp sức ${r.animal?.emoji || ''} ${clip(r.name, 14)}`,
          sub: `${e.repeatCount > 1 ? e.repeatCount + ' × ' : ''}${e.giftName || 'Quà'} · phóng +${fmt.format(e.amount)}`,
          giftImage: e.giftImage, dur: e.diamonds >= 100 ? 5 : 3,
        });
      } else if (e.source === 'like') {
        if (Math.random() < 0.5) floater('❤️', x - 20 + Math.random() * 40, y - 70 * s, '#ff6b8a', 30);
        sound.play('mo');
      } else if (e.source === 'comment') {
        floater('💨', x - 70 * s, y, '#fff', 34);
        sound.play('mo');
      } else {
        floater(e.source === 'share' ? '🔁 +' + e.amount : '➕ +' + e.amount, x, y - 80 * s, '#93c5fd', 32);
        sound.play('chime');
      }
      break;
    }
    case 'race_cheer': {
      const r = racerById(e.racer.id) || e.racer;
      const { x, y, s } = racerXY(r);
      floater(`📣 ${clip(e.by?.name, 10)}`, x, y - 90 * s, r.animal?.color || '#fff', 24);
      break;
    }
    case 'race_obstacle': {
      const from = racerById(e.from?.id) || e.from;
      const a = from?.lane ? racerXY(from) : { x: W / 2, y: TRACK_BOT + 100, s: 1 };
      fx.projectiles.push({ kind: e.kind, x0: a.x, y0: a.y - 40 * a.s, targetId: e.target.id, t0: nowS(), dur: e.kind === 'bomb' ? 0.9 : 0.7, seconds: e.seconds });
      sound.play('chime', { pitch: e.kind === 'bomb' ? 0.7 : 1.4 });
      const bomb = e.kind === 'bomb';
      queueAlert({
        user: e.by, color: bomb ? '#fb923c' : '#facc15', prio: bomb ? 8 : 7, dur: 3.5,
        title: bomb ? `💣 ${clip(e.by?.name, 16)} ném BOM!` : `🍌 ${clip(e.by?.name, 16)} ném chuối!`,
        sub: bomb ? `${e.target.animal.emoji} ${clip(e.target.name, 16)} nổ tung, bị hất lùi · choáng ${e.seconds}s` : `${e.target.animal.emoji} ${clip(e.target.name, 16)} trượt ngã ${e.seconds}s`,
      });
      break;
    }
    case 'race_arrive':
      sound.play('levelup');
      break;
    case 'race_finish': {
      const w = e.podium?.[0];
      fx.flash = 1;
      fx.endAt = performance.now();
      confetti(w?.animal?.color || '#facc15', 240);
      sound.play('levelup');
      break;
    }
  }
}

// ---------------- mạng ----------------
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { wsOk = true; };
  ws.onclose = () => { wsOk = false; setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (m) => {
    let msg; try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.type === 'hello') {
      const first = !R;
      cfg = msg.config; R = msg.race;
      if (first) {
        sound = new SoundBoard({ muted: opt.mute, files: cfg.sounds, ambientVolume: cfg.ambientVolume });
        sound.init();
        if (started) sound.resume();
        setTimeout(() => { if (!opt.mute && !opt.phone && sound.suspended) soundBtn.style.display = 'block'; }, 800);
      }
    } else if (msg.type === 'race') {
      R = msg.race;
    } else if (msg.type === 'racefx') {
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
  g.addColorStop(0, '#0b1533'); g.addColorStop(0.2, '#24407a'); g.addColorStop(0.27, '#3b5f9c');
  g.addColorStop(0.275, '#2f6b2a'); g.addColorStop(1, '#173d16');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // khán đài phía xa: các bậc + khán giả nhún nhảy
  const st = 300, sb = TRACK_TOP - 34;
  for (let row = 0; row < 7; row++) {
    const y = st + row * ((sb - st) / 7);
    ctx.fillStyle = row % 2 ? '#1e2b52' : '#25345f';
    ctx.fillRect(0, y, W, (sb - st) / 7 + 1);
    for (let i = 0; i < 34; i++) {
      const x = (i + 0.5) * (W / 34) + (row % 2) * 12;
      const hop = Math.max(0, Math.sin(t * 5 + i * 1.7 + row)) * 5;
      ctx.fillStyle = ['#f87171', '#facc15', '#60a5fa', '#f472b6', '#4ade80', '#e5e7eb'][(i * 7 + row * 3) % 6];
      ctx.beginPath(); ctx.arc(x, y + 9 - hop, 6, 0, Math.PI * 2); ctx.fill();
    }
  }
  // đèn sân vận động
  for (const lx of [90, W - 90]) {
    const grd = ctx.createRadialGradient(lx, 140, 0, lx, 140, 260);
    grd.addColorStop(0, `rgba(255,255,220,${0.35 + 0.05 * Math.sin(t * 3)})`); grd.addColorStop(1, 'rgba(255,255,220,0)');
    ctx.fillStyle = grd; ctx.fillRect(lx - 260, 0, 520, 420);
  }
}

/** Vẽ một tứ giác trên mặt đường (xw: bề ngang, u: chiều sâu). */
function quad(xa, xb, ua, ub, fill) {
  const a = proj(xa, ua), b = proj(xb, ua), c = proj(xb, ub), d = proj(xa, ub);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}

function drawTrackSurface(t) {
  const n = laneCount();
  // tường bảng quảng cáo ở mép xa
  const fl = proj(-1.12, 0), fr = proj(1.12, 0);
  ctx.fillStyle = '#0f172a'; ctx.fillRect(fl.x, fl.y - 34, fr.x - fl.x, 34);
  const ads = ['🏁 ĐUA THÚ', '💬 COMMENT OK', '🎁 QUÀ = PHÓNG', '🍌 CHUỐI · 💣 BOM'];
  const aw = (fr.x - fl.x) / ads.length;
  ctx.font = font(900, 18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ads.forEach((a, i) => {
    ctx.fillStyle = ['#b91c1c', '#1d4ed8', '#a16207', '#15803d'][i];
    ctx.fillRect(fl.x + i * aw + 3, fl.y - 31, aw - 6, 28);
    ctx.fillStyle = '#fff'; ctx.fillText(a, fl.x + i * aw + aw / 2, fl.y - 17);
  });
  // nền cỏ hai bên + mặt đường
  quad(-1.12, 1.12, 0, 1, '#2f7a2a');
  const g = ctx.createLinearGradient(0, TRACK_TOP, 0, TRACK_BOT);
  g.addColorStop(0, '#8f3f1f'); g.addColorStop(1, '#cf6c33');
  quad(-1, 1, 0, 1, g);
  for (let i = 0; i < n; i++) if (i % 2) quad(-1, 1, i / n, (i + 1) / n, 'rgba(255,255,255,.05)');
  // vân đất chạy theo phối cảnh
  ctx.strokeStyle = 'rgba(80,30,10,.18)'; ctx.lineWidth = 2;
  for (let k = -9; k <= 9; k++) {
    const a = proj(k / 9, 0), b = proj(k / 9, 1);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // vạch chia làn (đứt khúc, dày dần về phía gần)
  for (let i = 1; i < n; i++) {
    const u = i / n, a = proj(-1, u), b = proj(1, u);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 4 * a.s;
    ctx.setLineDash([26 * a.s, 18 * a.s]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  // mốc 1/4, 1/2, 3/4 đường
  for (const p of [0.25, 0.5, 0.75]) {
    const a = proj(progX(p), 0), b = proj(progX(p), 1);
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // vạch xuất phát
  quad(progX(0) - 0.012, progX(0), 0, 1, 'rgba(255,255,255,.9)');
  // vạch đích ca-rô
  const cols = 3, rows = n * 4, x0 = progX(1) + 0.004, cw = 0.016;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    quad(x0 + c * cw, x0 + (c + 1) * cw, r / rows, (r + 1) / rows, (c + r) % 2 ? '#111' : '#f8fafc');
  }
  // số làn
  for (let lane = 1; lane <= n; lane++) {
    const q = proj(-0.9, laneU(lane));
    ctx.beginPath(); ctx.ellipse(q.x, q.y, 30 * q.s, 24 * q.s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.font = font(900, Math.round(34 * q.s)); ctx.fillStyle = '#7c2d12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(lane), q.x, q.y + 1);
  }
  // vết chướng ngại vật còn trên đường
  for (const d of fx.decals) {
    const q = proj(progX(d.p), laneU(d.lane));
    ctx.save(); ctx.globalAlpha = Math.min(1, d.life);
    if (d.kind === 'crater') {
      ctx.beginPath(); ctx.ellipse(q.x, q.y + 4 * q.s, 70 * q.s, 20 * q.s, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,15,5,.75)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(q.x, q.y + 4 * q.s, 46 * q.s, 12 * q.s, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fill();
    } else {
      ctx.font = `${Math.round(44 * q.s)}px 'Noto Color Emoji', 'Apple Color Emoji', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000'; // emoji màu vẫn nhận độ trong suốt của fillStyle
      ctx.translate(q.x, q.y); ctx.scale(1, 0.6); ctx.fillText('🍌', 0, 0);
    }
    ctx.restore();
  }
}

/** Mép trước đường đua: bó vỉa đỏ trắng + thành dày → cảm giác khối 3D. */
function drawTrackFront() {
  const a = proj(-1.12, 1), b = proj(1.12, 1);
  const depth = 30;
  ctx.fillStyle = '#5b2a12'; ctx.fillRect(a.x, a.y, b.x - a.x, depth + 14);
  const seg = 60;
  for (let x = a.x, i = 0; x < b.x; x += seg, i++) {
    ctx.fillStyle = i % 2 ? '#dc2626' : '#f8fafc';
    ctx.fillRect(x, a.y, seg, depth * 0.55);
  }
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(a.x, a.y + depth * 0.55, b.x - a.x, 6);
}

/** Cột cờ đích ở hai mép đường; cột gần vẽ đè lên con vật. */
function drawFinishGate(t, part) {
  const xw = progX(1) + 0.03;
  const q = part === 'back' ? proj(xw, -0.02) : proj(xw, 1.02);
  const h = 150 * q.s;
  ctx.fillStyle = '#e5e7eb'; ctx.fillRect(q.x - 6 * q.s, q.y - h, 12 * q.s, h);
  ctx.fillStyle = '#94a3b8'; ctx.fillRect(q.x + 2 * q.s, q.y - h, 4 * q.s, h);
  // cờ ca-rô bay phấp phới
  const fw = 70 * q.s, fh = 46 * q.s, cells = 5, rows = 3;
  for (let c = 0; c < cells; c++) for (let r = 0; r < rows; r++) {
    const wave = Math.sin(t * 6 + c * 0.9) * 5 * q.s * (c / cells);
    ctx.fillStyle = (c + r) % 2 ? '#111' : '#f8fafc';
    ctx.fillRect(q.x + 6 * q.s + (c * fw) / cells, q.y - h + (r * fh) / rows + wave, fw / cells + 0.5, fh / rows + 0.5);
  }
}

function drawRacer(r, t, dt) {
  const u = laneU(r.lane);
  const target = r.pos;
  const cur = shown.get(r.id) ?? target;
  const p = cur + (target - cur) * (1 - Math.exp(-dt * 6));
  shown.set(r.id, p);
  const speed = Math.abs(target - cur);
  const tr = Math.max(0, (trail.get(r.id) || 0) - dt * 0.8);
  trail.set(r.id, tr);
  const g = proj(progX(p), u); // mũi con vật ở vị trí p
  g.x -= 46 * g.s; // tâm thân lùi về sau vạch
  const s = g.s;
  const running = R.phase === 'racing' && !r.stunned && !r.finished;
  const hit = hits.get(r.id);
  const ht = hit ? nowS() - hit.t0 : 99;
  if (hit && ht > hit.dur + 0.3 && !r.stunned) hits.delete(r.id);
  const kind = hit?.kind || r.stunKind;
  const stunned = r.stunned || (hit && ht < hit.dur);

  // bụi tung sau chân khi chạy
  if (running && Math.random() < 0.25 + speed * 40) {
    burst(g.x - 40 * s, g.y - 6 * s, 1, { speed: 80 * s, color: 'rgba(214,170,120,.55)', size: 16 * s, g: -20, angle: Math.PI, spread: 0.9, decay: 1.6, kind: 'smoke', grow: 26 * s });
  }
  // vệt tăng tốc
  if (tr > 0.05 && running) {
    ctx.strokeStyle = `rgba(255,255,255,${tr * 0.8})`; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
    for (let j = 0; j < 3; j++) {
      const yy = g.y - 60 * s + j * 18 * s;
      ctx.beginPath(); ctx.moveTo(g.x - 60 * s, yy); ctx.lineTo(g.x - (70 + 70 * tr + j * 20) * s, yy); ctx.stroke();
    }
  }
  // bóng đổ
  let lift = 0;
  if (kind === 'bomb' && ht < 0.8) lift = Math.sin((ht / 0.8) * Math.PI) * 150 * s; // bị hất tung lên
  const bob = running ? Math.abs(Math.sin(t * (10 + speed * 400) + r.lane)) * 12 * s : 0;
  ctx.beginPath(); ctx.ellipse(g.x, g.y, 48 * s * (1 - lift / (400 * s)), 12 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fill();

  // con vật
  ctx.save();
  ctx.translate(g.x, g.y - 44 * s - bob - lift);
  let rot = running ? Math.sin(t * 14 + r.lane) * 0.06 : 0;
  if (stunned && kind === 'banana') rot = ht < 0.8 ? (ht / 0.8) * Math.PI * 4 : Math.sin(t * 10) * 0.3; // xoay vòng rồi lảo đảo
  if (stunned && kind === 'bomb') rot = ht < 0.8 ? (ht / 0.8) * Math.PI * 3 : Math.sin(t * 8) * 0.2;
  ctx.rotate(rot);
  ctx.scale(-1, 1);
  if (stunned && kind === 'bomb') ctx.filter = 'brightness(0.45) saturate(0.5)'; // cháy đen
  ctx.font = `${Math.round(100 * s)}px 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000'; // emoji màu vẫn nhận độ trong suốt của fillStyle
  ctx.fillText(r.animal.emoji, 0, 0);
  ctx.restore();

  if (stunned) {
    // sao xoay quanh đầu
    const cx = g.x, cy = g.y - 108 * s - lift;
    for (let k = 0; k < 4; k++) {
      const a = t * 5 + (k * Math.PI) / 2;
      const sx = cx + Math.cos(a) * 42 * s, sy = cy + Math.sin(a) * 12 * s;
      ctx.font = font(900, Math.round((Math.sin(a) > 0 ? 28 : 20) * s));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000'; // emoji màu vẫn nhận độ trong suốt của fillStyle
      ctx.fillText(kind === 'bomb' ? '💫' : '⭐', sx, sy);
    }
    if (kind === 'bomb' && Math.random() < 0.3) burst(g.x, g.y - 70 * s, 1, { speed: 30, color: 'rgba(70,70,70,.5)', size: 18 * s, g: -80, decay: 0.8, kind: 'smoke', grow: 30 * s });
    if (kind === 'banana' && ht < 1) { // vệt trượt
      ctx.strokeStyle = 'rgba(60,25,8,.55)'; ctx.lineWidth = 4 * s;
      for (const dy of [-6, 6]) { ctx.beginPath(); ctx.moveTo(g.x - 90 * s, g.y + dy * s); ctx.lineTo(g.x - 10 * s, g.y + dy * s); ctx.stroke(); }
    }
  }
  ctx.fillStyle = '#000'; // emoji màu vẫn nhận độ trong suốt của fillStyle
  if (r.finished) { ctx.font = font(900, Math.round(46 * s)); ctx.textAlign = 'center'; ctx.fillText('👑', g.x, g.y - 120 * s); }

  // thẻ tên phía trên đầu
  const ty = g.y - (stunned ? 150 : 128) * s - lift;
  ctx.font = font(800, Math.round(22 * s));
  const label = clip(r.name, 12);
  const tw = Math.min(240 * s, ctx.measureText(label).width + 60 * s);
  ctx.globalAlpha = 0.93;
  rr(g.x - tw / 2, ty - 19 * s, tw, 38 * s, 19 * s); ctx.fillStyle = 'rgba(10,14,40,.85)'; ctx.fill();
  ctx.strokeStyle = r.animal.color; ctx.lineWidth = 3 * s; ctx.stroke();
  ctx.globalAlpha = 1;
  avatar(r, g.x - tw / 2 + 19 * s, ty, 15 * s, r.animal.color);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(fitText(label, tw - 48 * s), g.x - tw / 2 + 40 * s, ty + 1);
  if (r.supporters || r.diamonds) {
    ctx.font = font(800, Math.round(17 * s)); ctx.textAlign = 'center';
    outlined(`${r.supporters ? '📣' + r.supporters : ''}${r.supporters && r.diamonds ? ' · ' : ''}${r.diamonds ? '💎' + r.diamonds : ''}`, g.x, ty - 30 * s, '#fde68a', 'rgba(0,0,0,.85)', 4);
  }
}

function drawTrack(t, dt) {
  drawTrackSurface(t);
  drawFinishGate(t, 'back');
  const byLane = new Map(R.racers.map((r) => [r.lane, r]));
  // vẽ từ làn xa tới làn gần để con gần đè lên con xa
  for (let lane = 1; lane <= laneCount(); lane++) {
    const r = byLane.get(lane);
    if (r) { drawRacer(r, t, dt); continue; }
    if (R.phase === 'lobby') {
      const q = proj(-0.3, laneU(lane));
      ctx.font = font(700, Math.round(30 * q.s)); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`Trống — comment "${R.joinWord}"`, q.x, q.y);
    }
  }
  drawFinishGate(t, 'front');
  drawTrackFront();
}

/** Chướng ngại vật đang bay + hạt nổ / khói / bụi + sóng xung kích. */
function drawEffects(dt) {
  const tn = nowS();
  for (const pr of fx.projectiles) {
    const r = racerById(pr.targetId);
    if (!r) { pr.done = true; continue; }
    const k = Math.min(1, (tn - pr.t0) / pr.dur);
    const to = racerXY(r);
    const x = lerp(pr.x0, to.x, k), y = lerp(pr.y0, to.y - 30 * to.s, k) - Math.sin(k * Math.PI) * 260;
    const sz = lerp(1, to.s, k) * (pr.kind === 'bomb' ? 74 : 58);
    ctx.save(); ctx.translate(x, y); ctx.rotate(k * Math.PI * 5);
    ctx.font = `${Math.round(sz)}px 'Noto Color Emoji', 'Apple Color Emoji', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; // emoji màu vẫn nhận độ trong suốt của fillStyle
    ctx.fillText(pr.kind === 'bomb' ? '💣' : '🍌', 0, 0);
    ctx.restore();
    if (pr.kind === 'bomb') burst(x + 20, y - 26, 1, { speed: 60, color: ['#fde047', '#fb923c'], size: 7, g: 200, decay: 3 }); // tia lửa ngòi nổ
    if (k >= 1) { pr.done = true; impact(pr); }
  }
  fx.projectiles = fx.projectiles.filter((p) => !p.done);
  for (const d of fx.decals) d.life -= dt * 0.25;
  fx.decals = fx.decals.filter((d) => d.life > 0);

  ctx.save();
  for (const q of fx.parts) {
    q.life -= dt * q.decay;
    q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
    q.size += q.grow * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, q.life * (q.kind === 'smoke' ? 0.9 : 1.6)));
    ctx.fillStyle = q.color;
    if (q.kind === 'rock') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.5, q.size / 2), 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
  fx.parts = fx.parts.filter((q) => q.life > 0);

  for (const ring of fx.rings || []) {
    const k = (tn - ring.t0) / 0.6;
    if (k > 1) continue;
    ctx.save(); ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#fff7d6'; ctx.lineWidth = 10 * (1 - k) + 2;
    ctx.beginPath(); ctx.ellipse(ring.x, ring.y, 40 + 260 * k * ring.s, (40 + 260 * k * ring.s) * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  fx.rings = (fx.rings || []).filter((ring) => tn - ring.t0 < 0.6);
}


function drawHeader() {
  const y = 300;
  ctx.save();
  rr(40, y, W - 80, 72, 36);
  ctx.fillStyle = 'rgba(10,14,40,.88)'; ctx.fill();
  ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.font = font(900, 32); ctx.fillStyle = '#fde68a';
  ctx.fillText(`🏁 ĐUA THÚ · VÒNG ${R.round}`, 76, y + 37);
  const m = Math.floor(R.remaining / 60), s = String(R.remaining % 60).padStart(2, '0');
  const label = R.paused ? `⏸ ${m}:${s}`
    : R.phase === 'lobby' ? (R.racers.length >= R.minRacers ? `⏳ Xuất phát sau ${R.remaining}s` : `⏳ Chờ người đua…`)
    : R.phase === 'countdown' ? '🚦 Chuẩn bị!'
    : R.phase === 'racing' ? `⏱ ${m}:${s}`
    : `Vòng mới sau ${R.remaining}s`;
  ctx.font = font(800, 30);
  const urgent = !R.paused && R.phase === 'racing' && R.remaining <= 10;
  ctx.fillStyle = urgent ? (Math.floor(performance.now() / 300) % 2 ? '#f87171' : '#fff') : '#fff';
  ctx.textAlign = 'right'; ctx.fillText(label, W - 76, y + 37);
  ctx.restore();
}

function drawBanner(t) {
  const y = 392, h = 104;
  ctx.save();
  rr(40, y, W - 80, h, 26);
  const lobby = R.phase === 'lobby';
  ctx.fillStyle = lobby ? 'rgba(250,204,21,.95)' : 'rgba(10,14,40,.82)'; ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (lobby) {
    const left = R.maxRacers - R.racers.length;
    const pulse = 1 + 0.04 * Math.sin(t * 6);
    ctx.save(); ctx.translate(W / 2, y + 38); ctx.scale(pulse, pulse);
    ctx.font = font(900, 44); ctx.fillStyle = '#3a1a00';
    ctx.fillText(left > 0 ? `💬 COMMENT "${R.joinWord}" ĐỂ VÀO ĐUA` : '✅ ĐÃ ĐỦ NGƯỜI ĐUA', 0, 0);
    ctx.restore();
    ctx.font = font(700, 26); ctx.fillStyle = '#5b3a00';
    ctx.fillText(left > 0 ? `Còn ${left}/${R.maxRacers} chỗ · cần tối thiểu ${R.minRacers} người để xuất phát` : `Comment "${R.joinWord}" để đăng ký vòng sau${R.queueCount ? ` · đã có ${R.queueCount} người chờ` : ''}`, W / 2, y + 80);
  } else {
    ctx.font = font(800, 30); ctx.fillStyle = '#fff';
    ctx.fillText('🏇 Người đua: bình luận / thả tim / tặng quà để chạy', W / 2, y + 34);
    ctx.font = font(700, 26); ctx.fillStyle = '#fde68a';
    ctx.fillText(fitText(`📣 Khán giả: gõ số làn (1–${R.maxRacers}) để cổ vũ${R.queueCount ? ` · ${R.queueCount} người chờ vòng sau` : ` · "${R.joinWord}" = đăng ký vòng sau`}`, W - 120), W / 2, y + 76);
  }
  ctx.restore();
}


function drawCountdown() {
  if (R.phase === 'countdown' && !R.paused) {
    const n = Math.max(1, R.remaining);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const k = (performance.now() % 1000) / 1000;
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.font = font(900, 260 + k * 60);
    outlined(String(n), W / 2, (TRACK_TOP + TRACK_BOT) / 2, '#facc15', 'rgba(0,0,0,.85)', 14);
    ctx.restore();
  }
  if (fx.goAt && performance.now() - fx.goAt < 1100) {
    const k = (performance.now() - fx.goAt) / 1100;
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(900, 220 + k * 80);
    outlined('CHẠY!', W / 2, (TRACK_TOP + TRACK_BOT) / 2, '#4ade80', 'rgba(0,0,0,.85)', 14);
    ctx.restore();
  }
}

function drawGuide() {
  const chips = [
    `💬 "${R.joinWord}" = vào đua (tối đa ${R.maxRacers})`, '💬 Bình luận = chạy', '❤️ Tim = tăng tốc',
    '🔢 Gõ số làn = cổ vũ', '🎁 Quà = phóng nhanh', `🍌 ${R.bananaMin} xu chuối · 💣 ${R.bombMin} xu bom`,
  ];
  ctx.save();
  ctx.font = font(700, 23); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  let y = TRACK_BOT + 82, x = 40;
  const rows = [[]];
  for (const c of chips) {
    const w = ctx.measureText(c).width + 30;
    if (x + w > W - 40) { rows.push([]); x = 40; }
    rows.at(-1).push({ c, w }); x += w + 10;
  }
  for (const row of rows) {
    const total = row.reduce((s, i) => s + i.w, 0) + (row.length - 1) * 10;
    let cx = (W - total) / 2;
    for (const { c, w } of row) {
      rr(cx, y - 22, w, 44, 22); ctx.fillStyle = 'rgba(10,14,40,.8)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(c, cx + w / 2, y + 1);
      cx += w + 10;
    }
    y += 54;
  }
  // vua tốc độ (lưu qua các vòng)
  const champs = (R.champions || []).filter((c) => c.wins > 0);
  if (champs.length && R.phase !== 'racing') {
    ctx.font = font(800, 24); ctx.fillStyle = '#fde68a';
    const txt = '🏆 Vua tốc độ: ' + champs.slice(0, 3).map((c) => `${clip(c.name, 12)} ${c.wins}🥇`).join(' · ');
    outlined(fitText(txt, W - 100), W / 2, y + 6, '#fde68a', 'rgba(0,0,0,.8)', 5);
  }
  ctx.restore();
}

function drawEnd(t) {
  if (R.phase !== 'ended' || !R.podium?.length) return;
  const age = fx.endAt ? (performance.now() - fx.endAt) / 1000 : 1;
  const k = ease(age / 0.5);
  ctx.save();
  ctx.globalAlpha = k;
  const w = 880, h = 560, x = (W - w) / 2, y = TRACK_TOP + 40;
  rr(x, y, w, h, 36);
  ctx.fillStyle = 'rgba(10,14,40,.95)'; ctx.fill();
  ctx.strokeStyle = '#facc15'; ctx.lineWidth = 5; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(900, 46); ctx.fillStyle = '#facc15';
  ctx.fillText('🏆 VỀ ĐÍCH 🏆', W / 2, y + 60);
  const slots = [[2, -280, 150], [1, 0, 200], [3, 280, 115]]; // hạng, lệch x, cao bục
  const base = y + h - 50;
  for (const [place, dx, ph] of slots) {
    const r = R.podium.find((p) => p.place === place);
    const cx = W / 2 + dx;
    rr(cx - 110, base - ph, 220, ph, 12);
    ctx.fillStyle = place === 1 ? '#facc15' : place === 2 ? '#cbd5e1' : '#d97706'; ctx.fill();
    ctx.font = font(900, 56); ctx.fillStyle = '#1f2937';
    ctx.fillText(String(place), cx, base - ph / 2);
    if (!r) continue;
    const top = base - ph;
    ctx.font = `${place === 1 ? 92 : 72}px 'Noto Color Emoji', 'Apple Color Emoji', sans-serif`;
    ctx.save(); ctx.translate(cx, top - 50 - (place === 1 ? Math.abs(Math.sin(t * 4)) * 10 : 0)); ctx.scale(-1, 1); ctx.fillText(r.animal.emoji, 0, 0); ctx.restore();
    avatar(r, cx, top - 140, place === 1 ? 44 : 36, r.animal.color);
    ctx.font = font(800, place === 1 ? 30 : 25); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(r.name, 230), cx, top - (place === 1 ? 205 : 195));
  }
  ctx.restore();
}

function drawAlert(dt) {
  if (!fx.alert && fx.alerts.length) {
    fx.alerts.sort((a, b) => (b.prio || 0) - (a.prio || 0));
    fx.alert = { ...fx.alerts.shift(), age: 0 };
  }
  const a = fx.alert;
  if (!a) return;
  a.age += dt;
  if (a.age > a.dur) { fx.alert = null; return; }
  const k = Math.min(ease(a.age / 0.35), ease((a.dur - a.age) / 0.35));
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(W / 2, 1540);
  ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
  const bw = 900, bh = a.user ? 130 : 110;
  rr(-bw / 2, -bh / 2, bw, bh, 26);
  ctx.fillStyle = 'rgba(10,14,40,.94)'; ctx.fill();
  ctx.strokeStyle = a.color || '#f5c542'; ctx.lineWidth = 6; ctx.stroke();
  ctx.textBaseline = 'middle';
  if (a.user) {
    avatar(a.user, -bw / 2 + 70, 0, 46, a.color);
    const gi = avatarImg(a.giftImage);
    if (gi) ctx.drawImage(gi, bw / 2 - 110, -45, 90, 90);
    ctx.textAlign = 'left';
    ctx.font = font(800, 32); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(a.title, bw - 260), -bw / 2 + 135, -20);
    ctx.font = font(700, 25); ctx.fillStyle = '#ffd96a';
    ctx.fillText(fitText(a.sub, bw - 260), -bw / 2 + 135, 24);
  } else {
    ctx.textAlign = 'center';
    ctx.font = font(900, 40); ctx.fillStyle = '#ffd96a';
    ctx.fillText(a.title, 0, -16);
    ctx.font = font(700, 24); ctx.fillStyle = '#fff';
    ctx.fillText(a.sub, 0, 26);
  }
  ctx.restore();
}

function drawFloaters(dt) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of fx.floaters) {
    f.life -= dt * 0.8; f.y -= dt * 70;
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
    ctx.font = font(900, f.size);
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

// Game tạm dừng (chưa live / admin bấm dừng): phủ mờ + thẻ thông báo, đồng hồ đứng yên
function drawPaused(t) {
  if (!R?.paused) return;
  ctx.save();
  ctx.fillStyle = 'rgba(5,8,25,.55)'; ctx.fillRect(0, 0, W, H);
  const w = 760, h = 230, x = (W - w) / 2, y = H / 2 - h / 2;
  rr(x, y, w, h, 40);
  ctx.fillStyle = 'rgba(15,18,60,.95)'; ctx.fill();
  ctx.strokeStyle = '#facc15'; ctx.lineWidth = 4; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 3);
  ctx.font = font(900, 64); ctx.fillStyle = '#facc15';
  ctx.fillText('⏸ TẠM DỪNG', W / 2, y + 85);
  ctx.globalAlpha = 1;
  ctx.font = font(700, 32); ctx.fillStyle = '#e0e7ff';
  ctx.fillText(R.pauseReason === 'offline' ? 'Chờ kênh lên live…' : 'Tạm nghỉ một chút, quay lại ngay!', W / 2, y + 165);
  ctx.restore();
}

let last = performance.now();
let fps = 60;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = lerp(fps, 1 / Math.max(dt, 0.001), 0.05);
  const t = now / 1000;
  ctx.clearRect(0, 0, W, H);
  if (!R) {
    ctx.fillStyle = '#0f1b3d'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fde68a'; ctx.font = font(800, 36); ctx.textAlign = 'center';
    ctx.fillText('Đang chuẩn bị đường đua…', W / 2, H / 2);
    requestAnimationFrame(frame); return;
  }
  fx.flash = Math.max(0, fx.flash - dt);
  fx.shake = Math.max(0, fx.shake - dt * 2);
  ctx.save();
  if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * 14 * fx.shake, (Math.random() - 0.5) * 10 * fx.shake);
  drawBackground(t);
  drawHeader();
  drawBanner(t);
  drawTrack(t, dt);
  drawEffects(dt);
  drawGuide();
  drawCountdown();
  drawEnd(t);
  drawFloaters(dt);
  ctx.restore();
  drawAlert(dt);
  drawConfetti(dt);
  drawPaused(t);
  if (fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (opt.debug) {
    ctx.font = font(700, 20); ctx.textAlign = 'left';
    outlined(`${Math.round(fps)} fps · ws ${wsOk ? 'OK' : 'mất'}`, 20, 40, wsOk ? '#9f9' : '#f88', '#000', 4);
  }
  requestAnimationFrame(frame);
}

connect();
(document.fonts?.ready || Promise.resolve()).finally(() => requestAnimationFrame(frame));

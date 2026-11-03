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
const TRACK_TOP = 520, LANE_H = 116, X0 = 150, X1 = 960;
const shown = new Map(); // id -> vị trí hiển thị 0..1 (nội suy mượt)
const trail = new Map(); // id -> độ mạnh vệt tăng tốc
const laneOf = (lane) => TRACK_TOP + (lane - 1) * LANE_H;
const xOf = (p) => X0 + (X1 - X0) * Math.max(0, Math.min(1, p));
const racerById = (id) => R?.racers.find((r) => r.id === id);

function racerXY(r) {
  return { x: xOf(shown.get(r.id) ?? r.pos), y: laneOf(r.lane) + LANE_H / 2 + 10 };
}

function handle(e) {
  switch (e.type) {
    case 'race_lobby':
      fx.alerts.length = 0; fx.alert = null; shown.clear();
      sound.play('bell');
      queueAlert({ title: `VÒNG ${e.round} — MỞ ĐĂNG KÝ`, sub: `Comment ${R?.joinWord || 'OK'} để nhận một con vật (tối đa ${R?.maxRacers || 6} con)`, prio: 9, dur: 3.5, color: '#facc15' });
      break;
    case 'race_join': {
      sound.play('chime', { pitch: 0.9 + e.racer.lane * 0.08 });
      const { x, y } = { x: X0 + 120, y: laneOf(e.racer.lane) + 40 };
      floater(`${e.racer.animal.emoji} ${clip(e.racer.name, 14)} vào làn ${e.racer.lane}`, x + 160, y, e.racer.animal.color, 30);
      break;
    }
    case 'race_full':
      queueAlert({ title: 'ĐỦ NGƯỜI ĐUA!', sub: `Xuất phát sau ${e.startsIn} giây · comment OK để đăng ký vòng sau`, prio: 8, dur: 3, color: '#4ade80' });
      break;
    case 'race_queue':
      floater(`📝 ${clip(e.by?.name, 14)} đăng ký vòng sau (#${e.position})`, W / 2, TRACK_TOP + 6 * LANE_H - 20, '#c7d2fe', 26);
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
      const { x, y } = racerXY(r);
      if (e.source === 'gift') {
        sound.play(e.diamonds >= 30 ? 'bell' : 'chime');
        floater(`🚀 +${fmt.format(e.amount)}`, x, y - 70, '#ffe28a', 40);
        queueAlert({
          user: e.by, color: r.animal?.color, prio: Math.min(6, 2 + Math.log10(Math.max(1, e.diamonds))),
          title: `${clip(e.by?.name, 18)} tiếp sức ${r.animal?.emoji || ''} ${clip(r.name, 14)}`,
          sub: `${e.repeatCount > 1 ? e.repeatCount + ' × ' : ''}${e.giftName || 'Quà'} · phóng +${fmt.format(e.amount)}`,
          giftImage: e.giftImage, dur: e.diamonds >= 100 ? 5 : 3,
        });
      } else if (e.source === 'like') {
        if (Math.random() < 0.5) floater('❤️', x - 20 + Math.random() * 40, y - 50, '#ff6b8a', 30);
        sound.play('mo');
      } else if (e.source === 'comment') {
        floater('💨', x - 60, y, '#fff', 34);
        sound.play('mo');
      } else {
        floater(e.source === 'share' ? '🔁 +' + e.amount : '➕ +' + e.amount, x, y - 60, '#93c5fd', 32);
        sound.play('chime');
      }
      break;
    }
    case 'race_cheer': {
      const r = racerById(e.racer.id) || e.racer;
      const { x, y } = racerXY(r);
      floater(`📣 ${clip(e.by?.name, 10)}`, x, y - 64, r.animal?.color || '#fff', 24);
      break;
    }
    case 'race_banana': {
      const r = racerById(e.target.id) || e.target;
      const { x, y } = racerXY(r);
      fx.shake = 1;
      sound.play('mo');
      floater('🍌 TRƯỢT CHÂN!', x, y - 80, '#facc15', 40);
      queueAlert({ user: e.by, color: '#facc15', prio: 7, dur: 3.5, title: `🍌 ${clip(e.by?.name, 16)} ném chuối!`, sub: `${e.target.animal.emoji} ${clip(e.target.name, 16)} trượt ngã ${e.seconds}s` });
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
  g.addColorStop(0, '#0f1b3d'); g.addColorStop(0.22, '#2b4c8c'); g.addColorStop(0.25, '#3f8f3a'); g.addColorStop(1, '#1d4a1c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // khán đài nhấp nháy đèn
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % W, y = 120 + ((i * 53) % 140);
    ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 2 + i);
    ctx.fillStyle = ['#facc15', '#f472b6', '#60a5fa', '#fff'][i % 4];
    ctx.beginPath(); ctx.arc(x, y, 3 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
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

function drawTrack(t, dt) {
  const n = R.maxRacers;
  const top = TRACK_TOP, bottom = laneOf(n + 1);
  ctx.save();
  // nền đường đua
  rr(30, top - 14, W - 60, bottom - top + 28, 24);
  ctx.fillStyle = '#b4532a'; ctx.fill();
  ctx.strokeStyle = '#fff7'; ctx.lineWidth = 4; ctx.stroke();
  for (let i = 1; i <= n; i++) {
    const y = laneOf(i);
    ctx.fillStyle = i % 2 ? '#c2622f' : '#b4532a';
    ctx.fillRect(34, y, W - 68, LANE_H);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.setLineDash([22, 16]);
    if (i > 1) { ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke(); }
    ctx.setLineDash([]);
    // số làn
    ctx.beginPath(); ctx.arc(80, y + LANE_H / 2, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.font = font(900, 34); ctx.fillStyle = '#7c2d12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i), 80, y + LANE_H / 2 + 1);
  }
  // vạch xuất phát và vạch đích ca-rô
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(X0 - 6, top, 6, bottom - top);
  const sq = 16;
  for (let yy = top, row = 0; yy < bottom; yy += sq, row++) for (let c = 0; c < 3; c++) {
    ctx.fillStyle = (row + c) % 2 ? '#111' : '#fff';
    ctx.fillRect(X1 + 30 + c * sq, yy, sq, Math.min(sq, bottom - yy));
  }

  // người đua
  const byLane = new Map(R.racers.map((r) => [r.lane, r]));
  for (let lane = 1; lane <= n; lane++) {
    const r = byLane.get(lane);
    const cy = laneOf(lane) + LANE_H / 2;
    if (!r) {
      if (R.phase === 'lobby') {
        ctx.font = font(700, 28); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`Trống — comment "${R.joinWord}"`, X0 + 30, cy);
      }
      continue;
    }
    const target = r.pos;
    const cur = shown.get(r.id) ?? target;
    const k = 1 - Math.exp(-dt * 6);
    const p = cur + (target - cur) * k;
    shown.set(r.id, p);
    const speed = Math.abs(target - cur);
    const tr = Math.max(0, (trail.get(r.id) || 0) - dt * 0.8);
    trail.set(r.id, tr);
    const x = xOf(p);
    const running = R.phase === 'racing' && !r.stunned && !r.finished;
    const bob = running ? Math.abs(Math.sin(t * (10 + speed * 400) + lane)) * 10 : 0;
    // vệt tăng tốc
    if (tr > 0.05 && running) {
      ctx.strokeStyle = `rgba(255,255,255,${tr * 0.8})`; ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (let j = 0; j < 3; j++) {
        const yy = cy - 18 + j * 16;
        ctx.beginPath(); ctx.moveTo(x - 60 - j * 6, yy); ctx.lineTo(x - 60 - 50 * tr - j * 18, yy); ctx.stroke();
      }
    }
    // con vật (emoji quay mặt về phía đích → lật ngang)
    ctx.save();
    ctx.translate(x, cy + 12 - bob);
    if (r.stunned) ctx.rotate(Math.sin(t * 12) * 0.35);
    ctx.scale(-1, 1);
    ctx.font = `86px 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(r.animal.emoji, 0, 0);
    ctx.restore();
    if (r.stunned) { ctx.font = font(900, 34); ctx.textAlign = 'center'; ctx.fillText('💫', x, cy - 44); ctx.fillText('🍌', x - 50, cy + 30); }
    if (r.finished) { ctx.font = font(900, 40); ctx.textAlign = 'center'; ctx.fillText('👑', x, cy - 52); }
    // thẻ tên: avatar + tên, đặt phía sau con vật
    const tagX = Math.max(X0 + 4, x - 250);
    const tagW = Math.min(220, x - 60 - tagX);
    if (tagW > 70) {
      ctx.globalAlpha = 0.92;
      rr(tagX, cy - 26, tagW, 52, 26); ctx.fillStyle = 'rgba(10,14,40,.85)'; ctx.fill();
      ctx.strokeStyle = r.animal.color; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 1;
      avatar(r, tagX + 26, cy, 21, r.animal.color);
      ctx.font = font(800, 22); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(fitText(r.name, tagW - 62), tagX + 54, cy - 7);
      ctx.font = font(700, 17); ctx.fillStyle = '#fde68a';
      ctx.fillText(fitText(`${r.animal.name}${r.supporters ? ` · 📣${r.supporters}` : ''}${r.diamonds ? ` · 💎${r.diamonds}` : ''}`, tagW - 62), tagX + 54, cy + 14);
    } else {
      // mới xuất phát: tên nằm trên đầu
      avatar(r, x - 54, cy - 30, 18, r.animal.color);
      ctx.font = font(800, 22); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      outlined(clip(r.name, 12), x - 30, cy - 34, '#fff', 'rgba(0,0,0,.85)', 5);
    }
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
    outlined(String(n), W / 2, TRACK_TOP + 3 * LANE_H, '#facc15', 'rgba(0,0,0,.85)', 14);
    ctx.restore();
  }
  if (fx.goAt && performance.now() - fx.goAt < 1100) {
    const k = (performance.now() - fx.goAt) / 1100;
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(900, 220 + k * 80);
    outlined('CHẠY!', W / 2, TRACK_TOP + 3 * LANE_H, '#4ade80', 'rgba(0,0,0,.85)', 14);
    ctx.restore();
  }
}

function drawGuide() {
  const chips = [
    `💬 "${R.joinWord}" = vào đua (tối đa ${R.maxRacers})`, '💬 Bình luận = chạy', '❤️ Tim = tăng tốc',
    '🔢 Gõ số làn = cổ vũ', '🎁 Quà = phóng nhanh', `🍌 Quà ≥ ${R.bananaMin} xu = ném chuối`,
  ];
  ctx.save();
  ctx.font = font(700, 23); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  let y = laneOf(R.maxRacers + 1) + 40, x = 40;
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
  ctx.translate(W / 2, 1490);
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

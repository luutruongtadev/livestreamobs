// Game kéo co 2 đội cho TikTok Live.
// ?mute=1  ?debug=1  ?phone=1|0
import { SoundBoard } from './sound.js';

const W = 1080, H = 1920;
const ROPE_Y = 1090;
const HALF = 380; // khoảng cách từ giữa tới vạch thắng
const MAX_SHOWN = 6; // số người kéo hiện mỗi bên
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

let T = null; // snapshot kéo co
let cfg = {};
let wsOk = false;
let sound = new SoundBoard({ muted: opt.mute });
let shownPos = 0;
const fx = { floaters: [], confetti: [], alerts: [], alert: null, strain: [0, 0], shake: 0, flash: 0, throneHit: 0 };

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
const teamOf = (id) => T?.teams.find((t) => t.id === id) || { color: '#888', name: '?' };
const sideOf = (id) => (T?.teams[0].id === id ? 0 : 1);

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
function pullerPos(teamId, rank) {
  const side = sideOf(teamId);
  const center = W / 2 + (shownPos / (T?.winDistance || 100)) * HALF;
  const dir = side === 0 ? -1 : 1;
  return { x: center + dir * (95 + rank * 66), y: ROPE_Y + 70 };
}

function handle(e) {
  const team = teamOf(e.team);
  const side = sideOf(e.team);
  switch (e.type) {
    case 'tug_join':
      sound.play('chime', { pitch: side ? 1.3 : 1.1 });
      floater(`${clip(e.user?.name, 14)} vào ${team.name}`, side ? W - 270 : 270, ROPE_Y - 230, team.color, 26);
      break;
    case 'tug_pull': {
      fx.strain[side] = 1;
      fx.shake = Math.min(1, fx.shake + (e.source === 'gift' ? 0.6 : 0.15));
      const rank = Math.max(0, T?.teams[side]?.top.findIndex((p) => p.id === e.user?.id) ?? 0);
      const p = pullerPos(e.team, Math.min(rank, 5));
      if (e.source === 'gift') {
        sound.play(e.power >= 500 ? 'bell' : 'chime');
        floater(`💪 +${fmt.format(e.power)}`, p.x, p.y - 190, '#ffe28a', 40);
        queueAlert({
          kind: 'gift', user: e.user, color: team.color, prio: Math.min(5, 2 + Math.log10(Math.max(1, e.diamonds))),
          title: `${clip(e.user?.name, 18)} tiếp sức ${team.name}`,
          sub: `${e.repeatCount > 1 ? e.repeatCount + ' × ' : ''}${e.giftName} · +${fmt.format(e.power)} lực`,
          giftImage: e.giftImage, dur: e.diamonds >= 100 ? 5 : 3.2,
        });
      } else {
        sound.play('mo');
        floater(`+${e.power}`, p.x + (Math.random() - 0.5) * 40, p.y - 170, '#fff', 28);
      }
      break;
    }
    case 'tug_throne':
      fx.throneHit = 1;
      sound.play('levelup');
      queueAlert({
        kind: 'throne', user: e.user, color: teamOf(e.team).color, prio: 8, dur: 4.5,
        title: `👑 ${clip(e.user?.name, 18)} lên ngai vàng!`,
        sub: e.prev ? `Hất ${clip(e.prev.name, 16)} khỏi ngai · ${fmt.format(e.diamonds)} xu` : `${fmt.format(e.diamonds)} xu`,
      });
      break;
    case 'tug_end': {
      const w = e.winner ? teamOf(e.winner) : null;
      fx.flash = 1;
      confetti(w?.color || '#ffffff', 220);
      sound.play('levelup');
      break;
    }
    case 'tug_start':
      fx.alerts.length = 0; fx.alert = null;
      sound.play('bell');
      queueAlert({ kind: 'start', title: `VÁN ${e.round} BẮT ĐẦU!`, sub: 'Bình luận ĐỎ hoặc XANH để vào đội', prio: 9, dur: 3, color: '#f5c542' });
      break;
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
      const first = !T;
      cfg = msg.config; T = msg.tug;
      if (first) {
        shownPos = T.pos;
        sound = new SoundBoard({ muted: opt.mute, files: cfg.sounds, ambientVolume: cfg.ambientVolume });
        sound.init();
        if (started) sound.resume();
        setTimeout(() => { if (!opt.mute && !opt.phone && sound.suspended) soundBtn.style.display = 'block'; }, 800);
      }
    } else if (msg.type === 'tug') {
      T = msg.tug;
    } else if (msg.type === 'tugfx') {
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
  // trời + sân lễ hội
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#13204a'); g.addColorStop(0.35, '#2f4f8f'); g.addColorStop(0.55, '#7fb2e5'); g.addColorStop(0.56, '#5f9a3e'); g.addColorStop(1, '#2f5a22');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // cờ đuôi nheo
  for (const [y, sway] of [[790, 0], [830, 1]]) {
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(W / 2, y + 40, W, y); ctx.stroke();
    for (let i = 0; i < 18; i++) {
      const k = (i + 0.5) / 18, x = k * W, yy = y + 40 * 4 * k * (1 - k) * 0.5;
      ctx.fillStyle = ['#e0392b', '#f5c542', '#2b7de0', '#ffffff'][(i + sway) % 4];
      ctx.beginPath(); ctx.moveTo(x - 16, yy); ctx.lineTo(x + 16, yy); ctx.lineTo(x + Math.sin(t * 3 + i) * 3, yy + 34); ctx.closePath(); ctx.fill();
    }
  }
  // sân đất kéo co
  ctx.fillStyle = '#b98a52';
  ctx.beginPath(); ctx.ellipse(W / 2, ROPE_Y + 80, 560, 150, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.08)';
  for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc((i * 137) % W, ROPE_Y + 20 + ((i * 53) % 130), 3, 0, Math.PI * 2); ctx.fill(); }
  // vạch giữa + vạch thắng hai bên
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 5; ctx.setLineDash([16, 12]);
  ctx.beginPath(); ctx.moveTo(W / 2, ROPE_Y - 40); ctx.lineTo(W / 2, ROPE_Y + 200); ctx.stroke();
  ctx.setLineDash([]);
  T.teams.forEach((tm, i) => {
    const x = W / 2 + (i === 0 ? -HALF : HALF);
    ctx.strokeStyle = tm.color; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x, ROPE_Y - 40); ctx.lineTo(x, ROPE_Y + 210); ctx.stroke();
    // cờ đích
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x - 3, ROPE_Y - 150, 6, 120);
    ctx.fillStyle = tm.color;
    ctx.beginPath(); ctx.moveTo(x + 3, ROPE_Y - 150); ctx.lineTo(x + (i ? -60 : 60), ROPE_Y - 128 + Math.sin(t * 4) * 4); ctx.lineTo(x + 3, ROPE_Y - 106); ctx.closePath(); ctx.fill();
  });
}

function drawPuller(x, y, side, color, user, strain, t, idx, tagUp = 0) {
  // nhân vật nhìn nghiêng, ngả người ra sau về phía đội mình
  const dir = side === 0 ? -1 : 1; // hướng lùi
  const lean = 0.35 + strain * 0.25 + Math.sin(t * 6 + idx) * 0.03 * (1 + strain * 3);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(0, 4, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
  // chân
  ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(dir * -18, 0); ctx.lineTo(dir * 4, -46); ctx.moveTo(dir * 14, 0); ctx.lineTo(dir * 8, -46); ctx.stroke();
  ctx.rotate(dir * lean);
  // thân
  ctx.fillStyle = color;
  rr(-17, -112, 34, 70, 12); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)'; rr(-17, -112, 10, 70, 6); ctx.fill();
  // tay vươn về dây (về phía giữa)
  ctx.strokeStyle = '#f0c9a0'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(0, -96); ctx.lineTo(-dir * 46, -70); ctx.stroke();
  // đầu
  ctx.fillStyle = '#f0c9a0';
  ctx.beginPath(); ctx.arc(0, -134, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b1410';
  ctx.beginPath(); ctx.arc(dir * 4, -140, 22, Math.PI * 1.05, Math.PI * 2.05); ctx.fill();
  // băng đô màu đội
  ctx.fillStyle = color; ctx.fillRect(-22, -146, 44, 7);
  // mặt gắng sức
  ctx.fillStyle = '#3a1a0a';
  ctx.beginPath(); ctx.arc(-dir * 10, -132, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (user) {
    ctx.save();
    ctx.font = font(700, 18);
    const label = clip(user.name, 10);
    const w = Math.min(ctx.measureText(label).width, 120) + 40;
    const ty = y - 222 - tagUp;
    const tx = Math.max(4, Math.min(W - w - 4, x - w / 2));
    rr(tx, ty, w, 30, 15);
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    avatar(user, tx + 15, ty + 15, 11, '#fff');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(fitText(label, 120), tx + 31, ty + 16);
    ctx.restore();
  }
}

function drawRopeAndTeams(t) {
  const center = W / 2 + (shownPos / T.winDistance) * HALF;
  const shake = fx.shake * 4 * Math.sin(t * 40);
  // dây thừng
  const ry = ROPE_Y + shake;
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 14; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(20, ry + 6); ctx.lineTo(W - 20, ry + 6); ctx.stroke();
  ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(20, ry + 4); ctx.lineTo(W - 20, ry + 4); ctx.stroke();
  ctx.strokeStyle = 'rgba(90,60,20,.6)'; ctx.lineWidth = 2;
  for (let x = 30; x < W - 20; x += 16) { ctx.beginPath(); ctx.moveTo(x, ry - 1); ctx.lineTo(x + 8, ry + 9); ctx.stroke(); }
  // người kéo
  T.teams.forEach((tm, side) => {
    const n = Math.min(MAX_SHOWN, Math.max(tm.top.length, 2));
    for (let i = n - 1; i >= 0; i--) {
      const p = pullerPos(tm.id, i);
      const user = tm.top[i];
      ctx.globalAlpha = user ? 1 : 0.35;
      drawPuller(p.x, p.y, side, tm.color, user, fx.strain[side], t, i, i % 2 ? 34 : 0);
      ctx.globalAlpha = 1;
    }
    if (tm.count > MAX_SHOWN) {
      const p = pullerPos(tm.id, MAX_SHOWN - 0.4);
      ctx.font = font(800, 26); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      outlined(`+${tm.count - MAX_SHOWN}`, p.x + (side ? -20 : 20), p.y - 80, '#fff', 'rgba(0,0,0,.7)', 5);
    }
  });
  // nơ đỏ giữa dây
  ctx.save();
  ctx.translate(center, ry + 5);
  ctx.fillStyle = '#ffd54a';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-22, -24); ctx.lineTo(-22, 24); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(22, -24); ctx.lineTo(22, 24); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e0392b'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd54a'; ctx.fillRect(-4, 0, 8, 60);
  ctx.restore();
}

function drawHeader() {
  const y = 300;
  ctx.save();
  rr(40, y, W - 80, 72, 36);
  ctx.fillStyle = 'rgba(10,14,40,.82)'; ctx.fill();
  ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 3; ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.font = font(900, 32, true); ctx.fillStyle = '#ffd96a';
  ctx.fillText(`🪢 KÉO CO · VÁN ${T.round}`, 76, y + 37);
  const m = Math.floor(T.remaining / 60), s = String(T.remaining % 60).padStart(2, '0');
  const label = T.paused ? `⏸ ${m}:${s}` : T.phase === 'playing' ? `⏱ ${m}:${s}` : `Ván mới sau ${T.remaining}s`;
  ctx.font = font(800, 30);
  const urgent = !T.paused && T.phase === 'playing' && T.remaining <= 15;
  ctx.fillStyle = urgent ? (Math.floor(performance.now() / 300) % 2 ? '#ff6b5b' : '#fff') : '#fff';
  ctx.textAlign = 'right'; ctx.fillText(label, W - 76, y + 37);
  ctx.restore();
}

function drawThrone(t) {
  const y = 392, h = 200;
  ctx.save();
  rr(160, y, W - 320, h, 26);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(90,50,0,.88)'); g.addColorStop(1, 'rgba(40,20,0,.88)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 3; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(900, 24, true); ctx.fillStyle = '#ffd96a';
  ctx.fillText('👑 NGAI VÀNG VÁN NÀY 👑', W / 2, y + 30);
  const th = T.throne;
  if (!th) {
    ctx.font = font(700, 26); ctx.fillStyle = '#ffeec2';
    ctx.fillText('Ngai đang trống', W / 2, y + 95);
    ctx.font = font(500, 21); ctx.fillStyle = 'rgba(255,238,194,.85)';
    ctx.fillText('Tặng quà nhiều nhất ván để lên ngai', W / 2, y + 135);
  } else {
    const pulse = 1 + fx.throneHit * 0.15 * Math.sin(t * 20);
    const glow = ctx.createRadialGradient(W / 2 - 150, y + 112, 10, W / 2 - 150, y + 112, 110);
    glow.addColorStop(0, 'rgba(255,215,90,.6)'); glow.addColorStop(1, 'rgba(255,215,90,0)');
    ctx.fillStyle = glow; ctx.fillRect(W / 2 - 260, y + 2, 220, 196);
    avatar(th, W / 2 - 150, y + 116, 54 * pulse, '#ffd54a');
    // vương miện
    ctx.fillStyle = '#ffd54a';
    const cx = W / 2 - 150, cy = y + 52;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy + 16); ctx.lineTo(cx - 34, cy - 8); ctx.lineTo(cx - 17, cy + 4); ctx.lineTo(cx, cy - 14);
    ctx.lineTo(cx + 17, cy + 4); ctx.lineTo(cx + 34, cy - 8); ctx.lineTo(cx + 34, cy + 16); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = font(800, 34); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(th.name, 330), W / 2 - 75, y + 96);
    ctx.font = font(700, 24); ctx.fillStyle = teamOf(th.team).color === '#2b7de0' ? '#8cc0ff' : '#ff9a8c';
    ctx.fillText(`${teamOf(th.team).name} · ${fmt.format(th.diamonds)} xu`, W / 2 - 75, y + 138);
  }
  ctx.restore();
}

function drawScore() {
  const y = 610, h = 130;
  ctx.save();
  T.teams.forEach((tm, i) => {
    const x = i === 0 ? 40 : W / 2 + 60, w = W / 2 - 100;
    rr(x, y, w, h, 22);
    ctx.fillStyle = tm.color; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = i === 0 ? 'left' : 'right'; ctx.textBaseline = 'middle';
    const tx = i === 0 ? x + 24 : x + w - 24;
    ctx.font = font(900, 32); ctx.fillStyle = '#fff';
    ctx.fillText(tm.name.toUpperCase(), tx, y + 36);
    ctx.font = font(600, 21); ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillText(`👥 ${tm.count} người · 💪 ${fmt.format(tm.power)}`, tx, y + 76);
    ctx.font = font(600, 19);
    ctx.fillText(`Bình luận “${tm.keyword === 'do' ? 'đỏ' : tm.keyword}” để vào đội`, tx, y + 106);
    // số ván thắng
    ctx.textAlign = 'center'; ctx.font = font(900, 54);
    outlined(String(tm.wins), i === 0 ? x + w + 30 : x - 30, y + 66, '#fff', 'rgba(0,0,0,.6)', 6);
  });
  ctx.textAlign = 'center'; ctx.font = font(800, 18); ctx.fillStyle = '#fff';
  ctx.fillText('THẮNG', W / 2, y + 112);
  ctx.restore();
}

function drawGuide() {
  const items = ['❤️ Tim = kéo', `🎁 1 xu = ${T.power.perDiamond} lực`, '👑 Tặng nhiều nhất = ngai vàng'];
  ctx.save();
  ctx.font = font(800, 24); ctx.textBaseline = 'middle';
  const pad = 18, gap = 12;
  const ws = items.map((s) => ctx.measureText(s).width + pad * 2);
  let x = (W - ws.reduce((a, b) => a + b, 0) - gap * (items.length - 1)) / 2;
  const y = 1400;
  items.forEach((s, i) => {
    rr(x, y, ws[i], 50, 25);
    ctx.fillStyle = 'rgba(10,14,40,.8)'; ctx.fill();
    ctx.strokeStyle = 'rgba(245,197,66,.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(s, x + ws[i] / 2, y + 26);
    x += ws[i] + gap;
  });
  ctx.restore();
}

function drawEnd(t) {
  if (T.phase !== 'ended' || !T.result) return;
  const r = T.result;
  const w = r.winner ? teamOf(r.winner) : null;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 760, W, 560);
  const y = 840;
  rr(80, y, W - 160, 380, 34);
  ctx.fillStyle = w?.color || '#555'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const s = 1 + 0.04 * Math.sin(t * 6);
  ctx.translate(W / 2, y + 80); ctx.scale(s, s);
  ctx.font = font(900, 70, true);
  outlined(w ? `${w.name.toUpperCase()} THẮNG!` : 'HOÀ!', 0, 0, '#fff', 'rgba(0,0,0,.5)', 10);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (r.mvp) {
    avatar(r.mvp, W / 2, y + 205, 56, '#ffd54a');
    ctx.font = font(800, 32); ctx.fillStyle = '#fff';
    ctx.fillText(`⭐ MVP: ${fitText(r.mvp.name, 520)}`, W / 2, y + 296);
    ctx.font = font(600, 24);
    ctx.fillText(`${fmt.format(r.mvp.power)} lực kéo`, W / 2, y + 336);
  } else {
    ctx.font = font(700, 30); ctx.fillStyle = '#fff';
    ctx.fillText('Chưa ai kéo ván này', W / 2, y + 230);
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
  ctx.translate(W / 2, 1300);
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

let last = performance.now();
let fps = 60;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = lerp(fps, 1 / Math.max(dt, 0.001), 0.05);
  const t = now / 1000;
  ctx.clearRect(0, 0, W, H);
  if (!T) {
    ctx.fillStyle = '#10142a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f5c542'; ctx.font = font(800, 36); ctx.textAlign = 'center';
    ctx.fillText('Đang dọn sân kéo co…', W / 2, H / 2);
    requestAnimationFrame(frame); return;
  }
  shownPos = lerp(shownPos, T.pos, Math.min(1, dt * 5));
  fx.strain = fx.strain.map((s) => Math.max(0, s - dt * 1.5));
  fx.shake = Math.max(0, fx.shake - dt * 2);
  fx.flash = Math.max(0, fx.flash - dt);
  fx.throneHit = Math.max(0, fx.throneHit - dt * 0.8);

  drawBackground(t);
  drawRopeAndTeams(t);
  drawHeader();
  drawThrone(t);
  drawScore();
  drawGuide();
  drawFloaters(dt);
  drawEnd(t);
  drawAlert(dt);
  drawConfetti(dt);
  drawPaused(t);
  if (fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (opt.debug) {
    ctx.font = font(700, 20); ctx.textAlign = 'left';
    outlined(`${Math.round(fps)} fps · ws ${wsOk ? 'OK' : 'mất'} · pos ${T.pos.toFixed(1)}`, 20, 40, wsOk ? '#9f9' : '#f88', '#000', 4);
  }
  requestAnimationFrame(frame);
}

// Game tạm dừng (chưa live / admin bấm dừng): phủ mờ + thẻ thông báo, đồng hồ đứng yên
function drawPaused(t) {
  if (!T?.paused) return;
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
  ctx.fillText(T.pauseReason === 'offline' ? 'Chờ kênh lên live…' : 'Tạm nghỉ một chút, quay lại ngay!', W / 2, y + 165);
  ctx.restore();
}

connect();
(document.fonts?.ready || Promise.resolve()).finally(() => requestAnimationFrame(frame));

import {
  W, H, GROUND, PROP_Y, PALETTES, ease, lerp,
  drawBackground, drawTemple, drawIncenseBurner, drawMo, drawBell, drawBuddha, lantern, lotusFlower,
} from './scene.js';
import { SoundBoard } from './sound.js';

// ---------- tuỳ chọn qua URL ----------
// ?sky=day|dusk|night|auto  ?transparent=1 (bỏ trời/núi)  ?scene=0 (chỉ HUD + hiệu ứng)
// ?mute=1  ?debug=1  ?hints=0
const qs = new URLSearchParams(location.search);
const opt = {
  sky: qs.get('sky') || 'auto',
  transparent: qs.get('transparent') === '1',
  scene: qs.get('scene') !== '0',
  mute: qs.get('mute') === '1',
  debug: qs.get('debug') === '1',
  hints: qs.get('hints') !== '0',
};

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

// ---------- trạng thái ----------
let cfg = { templeName: 'Chùa Online', commands: [], levels: [] };
let S = null; // snapshot từ server
let shownTotal = 0;
let wsOk = false;
let tiktokStatus = null;
let sound = new SoundBoard({ muted: opt.mute });

const fx = {
  particles: [],
  floaters: [],
  skyLanterns: [],
  followers: [], // đèn lồng người theo dõi
  sticks: [0, 1, 2].map((i) => ({ dx: (i - 1) * 40, tilt: (i - 1) * 0.05, life: 0.7, decay: 0, base: true })),
  alerts: [],
  alert: null,
  moHit: 0,
  bellSwing: 0,
  flash: 0,
  golden: 0,
  buddha: 0,
  build: 1,
  prevLevel: null,
};

function skyMode() {
  if (opt.sky !== 'auto' && PALETTES[opt.sky]) return opt.sky;
  const h = new Date().getHours();
  if (h >= 6 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'dusk';
  return 'night';
}

// ---------- avatar ----------
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

function drawAvatar(user, x, y, r, ring = '#f5c542') {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  const img = avatarImg(user?.avatar);
  if (img) {
    ctx.save(); ctx.clip();
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  } else {
    const name = user?.name || '?';
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    ctx.fillStyle = `hsl(${h},55%,45%)`; ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.round(r)}px 'Be Vietnam Pro', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText([...name][0]?.toUpperCase() || '?', x, y + 1);
  }
  ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = ring;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ---------- tiện ích chữ ----------
function font(weight, size, serif = false) {
  return `${weight} ${size}px ${serif ? "'Noto Serif', serif" : "'Be Vietnam Pro', system-ui, sans-serif"}`;
}
function clip(text, max) {
  const arr = [...String(text || '')];
  return arr.length > max ? arr.slice(0, max - 1).join('') + '…' : arr.join('');
}
function fitText(text, maxW) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function wrap(text, maxW, maxLines = 3) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = fitText(lines[maxLines - 1] + '…', maxW); }
  return lines;
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}
function outlinedText(text, x, y, fill = '#fff', stroke = 'rgba(0,0,0,0.75)', lw = 6) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

// ---------- tạo hiệu ứng ----------
function floater(text, x, y, color = '#ffe28a', size = 34) {
  if (fx.floaters.length > 40) fx.floaters.shift();
  fx.floaters.push({ text, x: x + (Math.random() - 0.5) * 60, y, vy: -70, life: 1, decay: 0.55, color, size });
}

function petals(n, kind = 'petal') {
  for (let i = 0; i < n; i++) {
    fx.particles.push({
      kind, x: Math.random() * W, y: -40 - Math.random() * 400,
      vx: (Math.random() - 0.5) * 40, vy: 90 + Math.random() * 90,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 3,
      life: 1, decay: 0.09 + Math.random() * 0.04, ph: Math.random() * 6,
      s: kind === 'lotus' ? 0.7 + Math.random() * 0.5 : 0.6 + Math.random() * 0.8,
      hue: Math.random() < 0.5 ? '#f7b9c8' : '#ffd1dc',
    });
  }
}

function sparks(n, x, y, color = '#ffd76a') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 500;
    fx.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, life: 1, decay: 0.6 + Math.random() * 0.5, color });
  }
}

function addStick() {
  const live = fx.sticks.filter((s) => !s.base);
  if (live.length >= 24) fx.sticks.splice(fx.sticks.indexOf(live[0]), 1);
  fx.sticks.push({ dx: (Math.random() - 0.5) * 180, tilt: (Math.random() - 0.5) * 0.18, life: 1, decay: 1 / 120 });
}

function queueAlert(a) {
  fx.alerts.push(a);
  // giữ hàng đợi gọn: bỏ thông báo ưu tiên thấp nhất cũ nhất
  while (fx.alerts.length > 12) {
    let idx = 0;
    for (let i = 1; i < fx.alerts.length; i++) if ((fx.alerts[i].prio || 0) < (fx.alerts[idx].prio || 0)) idx = i;
    fx.alerts.splice(idx, 1);
  }
}

const name = (u) => clip(u?.name || 'Thí chủ', 22);

function handleEffect(e) {
  switch (e.type) {
    case 'mo':
      fx.moHit = 1;
      sound.play('mo');
      floater(`${e.count > 1 ? e.count + '× ' : ''}+${e.merit} công đức`, 875, PROP_Y - 170);
      if (e.source === 'comment') floater(`🪵 ${name(e.user)}`, 875, PROP_Y - 215, '#fff', 28);
      break;
    case 'incense':
      addStick();
      sound.play('chime', { pitch: 1.2 });
      floater(`🕯️ ${name(e.user)} thắp nhang +${e.merit}`, W / 2, PROP_Y - 240, '#ffd8a8', 30);
      break;
    case 'bell':
      fx.bellSwing = 1;
      sound.play('bell');
      floater(`🔔 ${name(e.user)} ${e.source === 'share' ? 'chia sẻ · ' : ''}thỉnh chuông +${e.merit}`, 260, PROP_Y - 300, '#ffe9b0', 30);
      break;
    case 'fortune':
      sound.play('chime');
      queueAlert({ kind: 'fortune', user: e.user, title: `${name(e.user)} xin quẻ`, body: e.fortune, dur: 6.5, prio: 1 });
      break;
    case 'prayer':
      sound.play('chime', { pitch: 0.9 });
      if (fx.skyLanterns.length > 8) fx.skyLanterns.shift();
      fx.skyLanterns.push({ x: 160 + Math.random() * (W - 320), y: GROUND - 40, life: 1, ph: Math.random() * 6, name: name(e.user), text: clip(e.text, 40) });
      break;
    case 'chat':
      if (e.merit) floater(`🙏 ${clip(e.user?.name, 14)} +${e.merit}`, W / 2 + (Math.random() - 0.5) * 300, GROUND - 40, '#fff', 24);
      break;
    case 'follow': {
      sound.play('chime', { pitch: 1.5 });
      if (fx.followers.length >= 7) fx.followers.shift();
      fx.followers.push({ user: e.user, born: performance.now() / 1000 });
      floater(`🏮 ${name(e.user)} theo dõi +${e.merit}`, W / 2, 720, '#ffb38a', 30);
      break;
    }
    case 'gift': {
      if (e.diamonds >= 10) addStick();
      const bigness = e.effect;
      const title = `${name(e.user)} ${e.verb}`;
      const sub = `${e.repeatCount > 1 ? e.repeatCount + ' × ' : ''}${e.giftName}`;
      if (bigness === 'petals') { petals(18 + Math.min(40, e.repeatCount * 3)); sound.play('chime'); }
      if (bigness === 'lotus') { petals(24); petals(10, 'lotus'); sound.play('chime', { pitch: 0.8 }); }
      if (bigness === 'golden') { fx.golden = 4.5; petals(30); petals(12, 'lotus'); sparks(80, W / 2, 900); sound.play('bell'); fx.bellSwing = 1; }
      if (bigness === 'buddha') { fx.buddha = 9; fx.golden = 9; petals(60); petals(24, 'lotus'); sparks(140, W / 2, 900); sound.play('levelup'); fx.bellSwing = 1; }
      const prio = { petals: 2, lotus: 3, golden: 4, buddha: 5 }[bigness] || 2;
      queueAlert({ kind: 'gift', user: e.user, title, sub, merit: e.merit, giftImage: e.giftImage, dur: prio >= 4 ? 6 : 3.8, prio, big: prio >= 4 });
      break;
    }
    case 'manual':
      sound.play('chime');
      queueAlert({ kind: 'gift', user: e.user, title: `${name(e.user)} hùn phước`, sub: e.text || 'Công đức', merit: e.merit, dur: 4, prio: 3 });
      break;
    case 'levelup':
      fx.prevLevel = Math.max(0, e.level - 1);
      fx.build = 0;
      fx.flash = 1;
      sparks(160, W / 2, 950, '#fff1a8');
      petals(50);
      sound.play('levelup');
      queueAlert({ kind: 'levelup', title: 'CHÙA ĐÃ NÂNG CẤP', sub: e.levelName, dur: 6, prio: 9 });
      break;
  }
}

// ---------- mạng ----------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { wsOk = true; };
  ws.onclose = () => { wsOk = false; setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (m) => {
    let msg; try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.type === 'hello') {
      const first = !S;
      cfg = msg.config;
      S = msg.state;
      tiktokStatus = msg.status;
      if (first) {
        shownTotal = S.total;
        sound = new SoundBoard({ muted: opt.mute, files: cfg.sounds, ambientVolume: cfg.ambientVolume });
        sound.init();
        setTimeout(checkSound, 800);
      }
    } else if (msg.type === 'state') {
      S = msg.state;
    } else if (msg.type === 'status') {
      tiktokStatus = msg.status;
    } else if (msg.type === 'fx') {
      for (const e of msg.effects) handleEffect(e);
    } else if (msg.type === 'reset') {
      shownTotal = 0;
      fx.followers.length = 0;
      fx.alerts.length = 0;
      fx.alert = null;
    }
  };
}

const soundBtn = document.getElementById('sound');
function checkSound() {
  if (!opt.mute && sound.suspended) soundBtn.style.display = 'block';
}
soundBtn.onclick = () => { sound.resume(); soundBtn.style.display = 'none'; };

// ---------- vẽ HUD ----------
function drawHeader() {
  const x = 40, y = 160, w = W - 80, h = 140;
  ctx.save();
  roundRect(x, y, w, h, 26);
  ctx.fillStyle = 'rgba(70,12,6,0.82)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#f5c542'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = font(900, 46, true);
  const g = ctx.createLinearGradient(0, y + 10, 0, y + 60);
  g.addColorStop(0, '#fff3b0'); g.addColorStop(1, '#f0b43a');
  ctx.fillStyle = g;
  ctx.fillText(fitText(`☸ ${S.templeName} ☸`, w - 40), W / 2, y + 56);
  ctx.font = font(700, 24);
  ctx.fillStyle = '#ffe9c2';
  ctx.fillText(`Cấp ${S.level}/${S.maxLevel} · ${S.levelName}`, W / 2, y + 88);
  // thanh tiến độ
  const bx = x + 30, by = y + 102, bw = w - 60, bh = 26;
  roundRect(bx, by, bw, bh, 13);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  const p = S.levelTo ? Math.min(1, (shownTotal - S.levelFrom) / (S.levelTo - S.levelFrom)) : 1;
  if (p > 0) {
    roundRect(bx, by, Math.max(bh, bw * p), bh, 13);
    const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    pg.addColorStop(0, '#f0a020'); pg.addColorStop(1, '#ffe27a');
    ctx.fillStyle = pg; ctx.fill();
    // ánh chạy
    const shine = (performance.now() / 1500 % 1) * bw * p;
    ctx.save(); ctx.clip();
    const sg = ctx.createLinearGradient(bx + shine - 60, 0, bx + shine + 60, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
  }
  ctx.font = font(800, 18);
  ctx.textBaseline = 'middle';
  const label = S.levelTo
    ? `${fmt.format(Math.round(shownTotal))} / ${fmt.format(S.levelTo)} công đức → ${S.nextLevelName}`
    : `${fmt.format(Math.round(shownTotal))} công đức · Viên mãn`;
  outlinedText(fitText(label, bw - 20), W / 2, by + bh / 2 + 1, '#fff', 'rgba(60,20,0,0.8)', 4);
  ctx.restore();
}

function drawLeaderboard() {
  const x = 40, y = 312, w = W - 80, h = 250;
  ctx.save();
  roundRect(x, y, w, h, 22);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(120,24,12,0.86)'); g.addColorStop(1, 'rgba(70,12,6,0.86)');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#f5c542'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(900, 28, true);
  ctx.fillStyle = '#ffd96a';
  ctx.fillText('— BẢNG VÀNG CÔNG ĐỨC —', W / 2, y + 30);
  const list = S.leaderboard.slice(0, 6);
  if (!list.length) {
    ctx.font = font(700, 26);
    ctx.fillStyle = '#ffe9c2';
    ctx.fillText('Hãy là người đầu tiên phát tâm 🙏', W / 2, y + 140);
    ctx.font = font(500, 20);
    ctx.fillStyle = 'rgba(255,233,194,0.8)';
    ctx.fillText('Thả tim · bình luận · tặng quà để tích công đức', W / 2, y + 180);
    ctx.restore();
    return;
  }
  const medals = ['#ffd700', '#d9d9d9', '#d38b4a'];
  const colW = (w - 40) / 2;
  list.forEach((d, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const cx = x + 20 + col * colW;
    const cy = y + 82 + row * 60;
    ctx.textAlign = 'center';
    ctx.fillStyle = medals[i] || 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(cx + 22, cy, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = i < 3 ? '#4a1a00' : '#fff';
    ctx.font = font(800, 20);
    ctx.fillText(String(i + 1), cx + 22, cy + 1);
    drawAvatar(d, cx + 72, cy, 23, medals[i] || '#f5c542');
    ctx.textAlign = 'left';
    ctx.font = font(700, 23);
    ctx.fillStyle = '#fff';
    ctx.fillText(fitText(d.name, colW - 230), cx + 104, cy + 1);
    ctx.textAlign = 'right';
    ctx.font = font(800, 22);
    ctx.fillStyle = '#ffd96a';
    ctx.fillText(fmt.format(d.merit), cx + colW - 14, cy + 1);
  });
  ctx.restore();
}

function drawStats() {
  const c = S.counts;
  const items = [`🪵 Mõ ${fmt.format(c.mo)}`, `🕯️ Nhang ${fmt.format(c.incense)}`, `🔔 Chuông ${fmt.format(c.bell)}`, `🎁 Quà ${fmt.format(c.gifts)}`];
  ctx.save();
  ctx.font = font(800, 24);
  ctx.textBaseline = 'middle';
  const pad = 18, gap = 14;
  const widths = items.map((t) => ctx.measureText(t).width + pad * 2);
  let x = (W - widths.reduce((a, b) => a + b, 0) - gap * (items.length - 1)) / 2;
  const y = PROP_Y + 24;
  items.forEach((t, i) => {
    roundRect(x, y, widths[i], 46, 23);
    ctx.fillStyle = 'rgba(70,12,6,0.8)'; ctx.fill();
    ctx.strokeStyle = 'rgba(245,197,66,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(t, x + widths[i] / 2, y + 24);
    x += widths[i] + gap;
  });
  if (opt.hints && cfg.commands?.length) {
    ctx.font = font(700, 22);
    const hint = 'Bình luận: ' + cfg.commands.map((c) => `“${c.label.toLowerCase()}”`).join(' · ');
    outlinedText(fitText(hint, W - 60), W / 2, y + 82, '#fff4d6', 'rgba(0,0,0,0.7)', 5);
  }
  ctx.restore();
}

function drawFollowers(t) {
  const n = fx.followers.length;
  if (!n) return;
  const now = performance.now() / 1000;
  fx.followers = fx.followers.filter((f) => now - f.born < 120);
  ctx.save();
  ctx.strokeStyle = 'rgba(60,20,10,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(30, 580); ctx.quadraticCurveTo(W / 2, 640, W - 30, 580); ctx.stroke();
  fx.followers.forEach((f, i) => {
    const k = (i + 0.5) / 7;
    const x = lerp(80, W - 80, k);
    const y = 584 + 60 * 4 * k * (1 - k) * 0.45;
    const age = now - f.born;
    const drop = ease(Math.min(1, age / 0.8));
    ctx.globalAlpha = Math.min(1, (120 - age) / 5);
    lantern(ctx, x, y - 40 * (1 - drop), 0.9, t + i, true);
    ctx.font = font(800, 18);
    ctx.textAlign = 'center';
    outlinedText(fitText(f.user?.name || '', 130), x, y + 90, '#fff', 'rgba(0,0,0,0.8)', 4);
  });
  ctx.restore();
}

function drawSkyLanterns(dt, t) {
  for (const l of fx.skyLanterns) {
    l.life -= dt / 16;
    l.y -= dt * 42;
    l.x += Math.sin(t * 0.8 + l.ph) * dt * 14;
    const a = Math.min(1, l.life * 4, (1 - l.life) * 6);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    const g = ctx.createRadialGradient(l.x, l.y, 6, l.x, l.y, 90);
    g.addColorStop(0, 'rgba(255,190,90,0.7)'); g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g; ctx.fillRect(l.x - 90, l.y - 90, 180, 180);
    ctx.fillStyle = '#ffcf7a';
    ctx.beginPath();
    ctx.moveTo(l.x - 30, l.y - 44); ctx.lineTo(l.x + 30, l.y - 44);
    ctx.lineTo(l.x + 22, l.y + 34); ctx.lineTo(l.x - 22, l.y + 34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff4c8';
    ctx.beginPath(); ctx.ellipse(l.x, l.y + 30, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(800, 20);
    outlinedText(l.name, l.x, l.y + 64, '#ffe9a8', 'rgba(0,0,0,0.8)', 4);
    ctx.font = font(600, 20);
    outlinedText(l.text, l.x, l.y + 90, '#fff', 'rgba(0,0,0,0.8)', 4);
    ctx.restore();
  }
  fx.skyLanterns = fx.skyLanterns.filter((l) => l.life > 0);
}

function drawParticles(dt, t) {
  const keep = [];
  for (const p of fx.particles) {
    p.life -= p.decay * dt;
    if (p.life <= 0) continue;
    keep.push(p);
    if (p.kind === 'smoke') {
      p.x += (p.vx + Math.sin(t * 2 + p.ph + p.y / 40) * 14) * dt;
      p.y += p.vy * dt;
      p.r += dt * 9;
      ctx.fillStyle = `rgba(230,230,235,${0.22 * p.life})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'spark') {
      p.vy += 500 * dt;
      p.vx *= 1 - dt * 1.2;
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 + 3 * p.life, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      p.x += (p.vx + Math.sin(t * 1.6 + p.ph) * 40) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.globalAlpha = Math.min(1, p.life * 3);
      if (p.kind === 'lotus') {
        lotusFlower(ctx, p.x, p.y, p.s, p.rot * 0.3);
      } else {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(p.s, p.s);
        ctx.fillStyle = p.hue;
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }
  fx.particles = keep.length > 900 ? keep.slice(-900) : keep;
}

function drawFloaters(dt) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of fx.floaters) {
    f.life -= f.decay * dt;
    f.y += f.vy * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
    ctx.font = font(800, f.size);
    outlinedText(f.text, f.x, f.y, f.color, 'rgba(40,10,0,0.85)', 6);
  }
  ctx.restore();
  fx.floaters = fx.floaters.filter((f) => f.life > 0);
}

function drawRays(t, strength) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(W / 2, 900);
  ctx.rotate(t * 0.15);
  for (let i = 0; i < 16; i++) {
    ctx.rotate((Math.PI * 2) / 16);
    const g = ctx.createLinearGradient(0, 0, 0, -900);
    g.addColorStop(0, `rgba(255,220,120,${0.32 * strength})`);
    g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-90, -900); ctx.lineTo(90, -900); ctx.lineTo(14, 0); ctx.closePath(); ctx.fill();
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
  const inT = ease(a.age / 0.45);
  const outT = ease((a.dur - a.age) / 0.4);
  const k = Math.min(inT, outT);
  const cy = 790;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(W / 2, cy);
  ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  if (a.kind === 'levelup') {
    roundRect(-470, -110, 940, 220, 30);
    const g = ctx.createLinearGradient(0, -110, 0, 110);
    g.addColorStop(0, 'rgba(255,214,90,0.95)'); g.addColorStop(1, 'rgba(200,120,20,0.95)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#fff6c8'; ctx.stroke();
    ctx.font = font(900, 40, true);
    outlinedText('✨ ' + a.title + ' ✨', 0, -40, '#5a1209', 'rgba(255,250,220,0.9)', 6);
    ctx.font = font(900, 58, true);
    outlinedText(a.sub, 0, 32, '#fff', 'rgba(90,18,9,0.9)', 10);
  } else if (a.kind === 'fortune') {
    ctx.font = font(600, 30);
    const lines = wrap(a.body, 760, 4);
    const h = 150 + lines.length * 42;
    roundRect(-430, -h / 2, 860, h, 26);
    ctx.fillStyle = 'rgba(250,236,200,0.97)'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#a3241a'; ctx.stroke();
    drawAvatar(a.user, -350, -h / 2 + 56, 34);
    ctx.font = font(800, 30);
    ctx.fillStyle = '#7a1a0e';
    ctx.textAlign = 'left';
    ctx.fillText(fitText('🎋 ' + a.title, 640), -300, -h / 2 + 56);
    ctx.textAlign = 'center';
    ctx.font = font(600, 30);
    ctx.fillStyle = '#3a1a0a';
    lines.forEach((l, i) => ctx.fillText(l, 0, -h / 2 + 120 + i * 42));
  } else {
    const big = a.big;
    const bw = big ? 960 : 860, bh = big ? 200 : 150;
    roundRect(-bw / 2, -bh / 2, bw, bh, 28);
    const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    g.addColorStop(0, big ? 'rgba(160,30,14,0.96)' : 'rgba(110,20,10,0.92)');
    g.addColorStop(1, big ? 'rgba(90,10,4,0.96)' : 'rgba(60,10,4,0.92)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = big ? 7 : 4; ctx.strokeStyle = '#f5c542'; ctx.stroke();
    const r = big ? 62 : 48;
    drawAvatar(a.user, -bw / 2 + r + 26, 0, r);
    const giftImg = avatarImg(a.giftImage);
    if (giftImg) ctx.drawImage(giftImg, bw / 2 - r * 2 - 20, -r, r * 2, r * 2);
    const tx = -bw / 2 + r * 2 + 50;
    const tw = bw - r * 4 - 90;
    ctx.textAlign = 'left';
    ctx.font = font(800, big ? 40 : 32);
    ctx.fillStyle = '#fff';
    ctx.fillText(fitText(a.title, tw), tx, big ? -50 : -36);
    ctx.font = font(700, big ? 34 : 28);
    ctx.fillStyle = '#ffd96a';
    ctx.fillText(fitText(a.sub, tw), tx, big ? 4 : 4);
    ctx.font = font(800, big ? 32 : 26);
    ctx.fillStyle = '#ffeec2';
    ctx.fillText(`+${fmt.format(a.merit || 0)} công đức 🙏`, tx, big ? 54 : 42);
  }
  ctx.restore();
}

function drawWaiting() {
  ctx.fillStyle = '#1a0c06';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f5c542';
  ctx.font = font(800, 36);
  ctx.textAlign = 'center';
  ctx.fillText('Đang kết nối máy chủ chùa…', W / 2, H / 2);
}

// ---------- vòng lặp ----------
let last = performance.now();
let fps = 60;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = lerp(fps, 1 / Math.max(dt, 0.001), 0.05);
  const t = now / 1000;
  ctx.clearRect(0, 0, W, H);

  if (!S) { drawWaiting(); requestAnimationFrame(frame); return; }

  shownTotal = lerp(shownTotal, S.total, Math.min(1, dt * 4));
  if (Math.abs(shownTotal - S.total) < 0.5) shownTotal = S.total;

  fx.moHit = Math.max(0, fx.moHit - dt * 6);
  fx.bellSwing = Math.max(0, fx.bellSwing - dt * 0.3);
  fx.flash = Math.max(0, fx.flash - dt * 0.8);
  fx.golden = Math.max(0, fx.golden - dt);
  fx.buddha = Math.max(0, fx.buddha - dt);
  fx.build = Math.min(1, fx.build + dt / 2.5);
  for (const s of fx.sticks) if (!s.base) s.life -= s.decay * dt;
  fx.sticks = fx.sticks.filter((s) => s.life > 0);

  const P = PALETTES[skyMode()];

  if (opt.scene) {
    if (!opt.transparent) drawBackground(ctx, P, t);
    if (fx.golden > 0) drawRays(t, Math.min(1, fx.golden / 1.5));

    // chùa + hiệu ứng xây dựng khi lên cấp
    if (fx.build < 1 && fx.prevLevel !== null) {
      ctx.save();
      ctx.globalAlpha = 1 - ease(fx.build);
      drawTemple(ctx, fx.prevLevel, t, P);
      ctx.restore();
      ctx.save();
      const top = lerp(GROUND, 300, ease(fx.build));
      ctx.beginPath(); ctx.rect(0, top, W, H - top); ctx.clip();
      drawTemple(ctx, S.level, t, P);
      ctx.restore();
      // bụi công trình
      if (Math.random() < 0.5) fx.particles.push({ kind: 'smoke', x: 240 + Math.random() * 600, y: GROUND, vx: (Math.random() - 0.5) * 30, vy: -40, life: 1, decay: 0.5, r: 12, ph: 0 });
    } else {
      drawTemple(ctx, S.level, t, P);
    }

    if (fx.buddha > 0) {
      const k = Math.min(1, fx.buddha / 1.2, (9 - fx.buddha) / 1.2);
      drawBuddha(ctx, W / 2, 980, 1.25, t, ease(k));
    }

    drawBell(ctx, fx.bellSwing, t);
    drawIncenseBurner(ctx, fx.sticks, t, fx.particles);
    drawMo(ctx, fx.moHit, t);
    drawStats();
  }

  drawParticles(dt, t);
  drawSkyLanterns(dt, t);
  drawFollowers(t);
  drawHeader();
  drawLeaderboard();
  drawFloaters(dt);
  drawAlert(dt);

  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(255,240,190,${fx.flash * 0.7})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (opt.debug) {
    ctx.font = font(700, 20);
    ctx.textAlign = 'left';
    outlinedText(`${Math.round(fps)} fps · ws ${wsOk ? 'OK' : 'mất'} · tiktok ${tiktokStatus?.state || '?'} · p ${fx.particles.length}`, 20, 40, wsOk ? '#9f9' : '#f88', '#000', 4);
  }
  requestAnimationFrame(frame);
}

connect();
document.fonts?.ready.finally(() => requestAnimationFrame(frame)) ?? requestAnimationFrame(frame);

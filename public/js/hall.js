import {
  W, H, FLOOR_Y, BUDDHA, BURNER, lerp, ease,
  drawInterior, drawGreatBuddha, drawAltar, drawSticks, drawFloor, drawSideDecor,
  drawMoSmall, drawBowlBell, drawWorshipper, personLook, drawGoldenLotusSeat, lotusFlower, LOTUS_SLOTS,
} from './hall-scene.js';
import { SoundBoard } from './sound.js';

// ?buddha=draw (dùng tượng vẽ bằng code)  ?phone=1|0 (bật/tắt chế độ điện thoại)  ?mute=1  ?debug=1  ?tts=1 (đọc tên người dâng quà)  ?bg=assets/anh.jpg (ảnh nền riêng)  ?guide=0  ?board=0
const qs = new URLSearchParams(location.search);
const opt = {
  mute: qs.get('mute') === '1',
  debug: qs.get('debug') === '1',
  tts: qs.get('tts') === '1',
  bg: qs.get('bg') || '',
  guide: qs.get('guide') !== '0',
  board: qs.get('board') !== '0',
  // Điện thoại: ?phone=1 hoặc mở từ biểu tượng ngoài màn hình chính
  // ?phone=0 tắt hẳn (Chrome --kiosk trên VPS cũng khớp display-mode: fullscreen)
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

let cfg = { hall: {} };
let S = null;
let wsOk = false;
let sound = new SoundBoard({ muted: opt.mute });
let bgImg = null;
let buddhaImg = null; // ảnh tượng Phật (config hall.buddhaImage), thay cho tượng vẽ bằng code

const fx = {
  particles: [], floaters: [], lanterns: [], projectiles: [], alerts: [], alert: null,
  sticks: [-24, 0, 24].map((dx) => ({ dx, tilt: dx / 400, life: 0.7, decay: 0, base: true })),
  lotus: [], moHit: 0, bell: 0, glow: 0, rays: 0, flash: 0,
};
const people = new Map(); // id -> phật tử đang hiển thị

// ---------------- chỗ ngồi ----------------
const SLOTS = (() => {
  // 7 hàng, hàng gần bàn thờ hẹp và nhỏ hơn (phối cảnh), xếp từ giữa ra
  const out = [];
  for (let r = 0; r < 7; r++) {
    const y = 1160 + 98 * r + 2 * r * r;
    const s = 0.62 + 0.08 * r;
    const n = 6 + r;
    const half = lerp(300, 470, r / 6);
    const row = [];
    for (let i = 0; i < n; i++) row.push({ x: W / 2 - half + (2 * half * (i + 0.5)) / n, y, s });
    row.sort((a, b) => Math.abs(a.x - W / 2) - Math.abs(b.x - W / 2));
    out.push(...row);
  }
  return out;
})();
const GOLD_SEAT = { x: W / 2, y: 1094, s: 0.72 };

// ---------------- tiện ích ----------------
const font = (w, size, serif = false) => `${w} ${size}px ${serif ? "'Noto Serif', serif" : "'Be Vietnam Pro', system-ui, sans-serif"}`;
const clip = (text, max) => { const a = [...String(text || '')]; return a.length > max ? a.slice(0, max - 1).join('') + '…' : a.join(''); };
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
  return lines.map((l) => fitText(l, maxW));
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function outlined(text, x, y, fill = '#fff', stroke = 'rgba(0,0,0,0.75)', lw = 5) {
  ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
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
    if (avatars.size > 400) avatars.delete(avatars.keys().next().value);
  }
  return a.ok ? a.img : null;
}
function drawAvatar(user, x, y, r, ring = '#f5c542') {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  const img = avatarImg(user?.avatar);
  if (img) { ctx.save(); ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); ctx.restore(); }
  else {
    const name = user?.name || '?';
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    ctx.fillStyle = `hsl(${h},50%,42%)`; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(800, Math.round(r * 1.1));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText([...name][0]?.toUpperCase() || '?', x, y + 1);
  }
  ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.strokeStyle = ring;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  return `${Math.floor(s / 3600)} giờ trước`;
}

function announce(text) {
  if (!opt.tts || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'vi-VN';
  const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('vi'));
  if (v) u.voice = v;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

// ---------------- phật tử ----------------
function ensurePerson(user) {
  if (!user?.id) return null;
  let p = people.get(user.id);
  if (!p) {
    const look = personLook(user.id);
    p = { id: user.id, name: user.name, avatar: user.avatar, look, x: W / 2 + (Math.random() - 0.5) * 300, y: H + 80, s: 1.2, tx: W / 2, ty: H - 120, ts: 1.1, alpha: 1, bowT: 0, bubble: null, leaving: false, gold: false, rank: 999 };
    people.set(user.id, p);
  }
  if (user.name) p.name = user.name;
  if (user.avatar) p.avatar = user.avatar;
  p.leaving = false;
  return p;
}

function assignSlots() {
  const list = S?.worshippers || [];
  const seen = new Set();
  let si = 0;
  list.forEach((w, i) => {
    const p = ensurePerson(w);
    seen.add(w.id);
    p.rank = i;
    p.merit = w.merit;
    if (i === 0 && w.merit > 0) {
      p.gold = true;
      Object.assign(p, { tx: GOLD_SEAT.x, ty: GOLD_SEAT.y, ts: GOLD_SEAT.s });
    } else {
      p.gold = false;
      const slot = SLOTS[si++];
      if (!slot) { p.leaving = true; return; }
      Object.assign(p, { tx: slot.x, ty: slot.y, ts: slot.s });
    }
  });
  for (const p of people.values()) if (!seen.has(p.id)) p.leaving = true;
}

function bow(p, dur = 1.2) { if (p) { p.bowT = dur; p.bowDur = dur; } }
function headOf(p) { return { x: p.x, y: p.y - 110 * p.s }; }

function say(p, text) {
  if (!p || !text) return;
  p.bubble = { text: clip(text, 60), t: 6 };
}

// ---------------- hiệu ứng ----------------
function floater(text, x, y, color = '#ffe28a', size = 30) {
  if (fx.floaters.length > 40) fx.floaters.shift();
  fx.floaters.push({ text, x, y, life: 1, color, size });
}
function petals(n, kind = 'petal') {
  for (let i = 0; i < n; i++) {
    fx.particles.push({
      kind, x: Math.random() * W, y: -40 - Math.random() * 500, vx: (Math.random() - 0.5) * 40, vy: 90 + Math.random() * 90,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 3, life: 1, decay: 0.08 + Math.random() * 0.03, ph: Math.random() * 6,
      s: kind === 'lotus' ? 0.6 + Math.random() * 0.5 : 0.6 + Math.random() * 0.8, hue: Math.random() < 0.5 ? '#f7b9c8' : '#ffd1dc',
    });
  }
}
function sparks(n, x, y, color = '#ffd76a') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 450;
    fx.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, life: 1, decay: 0.6 + Math.random() * 0.5, color });
  }
}
function addStick() {
  const live = fx.sticks.filter((s) => !s.base);
  if (live.length >= 26) fx.sticks.splice(fx.sticks.indexOf(live[0]), 1);
  fx.sticks.push({ dx: (Math.random() - 0.5) * 100, tilt: (Math.random() - 0.5) * 0.25, life: 1, decay: 1 / 150 });
}
function addLotus(gold) {
  fx.lotus.push({ gold });
  if (fx.lotus.length > LOTUS_SLOTS.length) fx.lotus.shift();
}
function throwTo(kind, p, x1, y1, done, opts = {}) {
  const from = p ? headOf(p) : { x: W / 2, y: H - 200 };
  fx.projectiles.push({ kind, x0: from.x, y0: from.y, x1, y1, t: 0, dur: opts.dur || 1.1, done, gold: opts.gold });
}
function queueAlert(a) {
  fx.alerts.push(a);
  while (fx.alerts.length > 12) {
    let idx = 0;
    for (let i = 1; i < fx.alerts.length; i++) if ((fx.alerts[i].prio || 0) < (fx.alerts[idx].prio || 0)) idx = i;
    fx.alerts.splice(idx, 1);
  }
}

const nm = (u) => clip(u?.name || 'Thí chủ', 20);

function handleEffect(e) {
  const p = e.user ? ensurePerson(e.user) : null;
  switch (e.type) {
    case 'join':
      sound.play('chime', { pitch: 1.4 });
      break;
    case 'mo': {
      bow(p);
      fx.moHit = 1;
      sound.play('mo');
      const h = p ? headOf(p) : { x: 200, y: 980 };
      floater(e.source === 'like' ? `+${e.count} tim` : `+${e.merit}`, h.x, h.y - 40, '#ffb3c6', 28);
      if (e.source === 'comment') say(p, e.text);
      break;
    }
    case 'incense':
      bow(p, 1.6);
      say(p, e.text);
      throwTo('stick', p, BURNER.x, BURNER.y - 20, () => { addStick(); sound.play('chime', { pitch: 1.2 }); });
      break;
    case 'bell':
      bow(p);
      if (e.source !== 'share') say(p, e.text);
      fx.bell = 1;
      sound.play('bell');
      if (p) floater(e.source === 'share' ? '↗ chia sẻ · thỉnh chuông' : '🔔 thỉnh chuông', headOf(p).x, headOf(p).y - 40, '#ffe9b0', 24);
      break;
    case 'fortune':
      bow(p, 1.6);
      say(p, e.text);
      sound.play('chime');
      queueAlert({ kind: 'fortune', user: e.user, title: `${nm(e.user)} rút quẻ`, body: e.fortune, dur: 7, prio: 1 });
      announce(e.fortune);
      break;
    case 'prayer': {
      bow(p, 1.6);
      sound.play('chime', { pitch: 0.9 });
      const h = p ? headOf(p) : { x: W / 2, y: 1500 };
      if (fx.lanterns.length > 8) fx.lanterns.shift();
      fx.lanterns.push({ x: Math.max(120, Math.min(W - 120, h.x + (Math.random() - 0.5) * 360)), y: h.y - 30 - Math.random() * 120, life: 1, ph: Math.random() * 6, name: nm(e.user), text: clip(e.text, 34) });
      break;
    }
    case 'chat':
      say(p, e.text);
      break;
    case 'follow':
      bow(p);
      fx.bell = 1;
      sound.play('bell');
      if (p) floater('➕ theo dõi', headOf(p).x, headOf(p).y - 40, '#ffb38a', 24);
      break;
    case 'gift': {
      bow(p, 1.8);
      const big = e.effect === 'golden' || e.effect === 'buddha';
      throwTo('stick', p, BURNER.x, BURNER.y - 20, () => addStick());
      if (e.effect === 'lotus' || big) {
        const n = Math.min(3, e.repeatCount || 1);
        for (let i = 0; i < n; i++) {
          const slot = LOTUS_SLOTS[(fx.lotus.length + i) % LOTUS_SLOTS.length];
          setTimeout(() => throwTo('lotus', p, slot[0], slot[1], () => addLotus(big), { dur: 1.4, gold: big }), i * 250);
        }
        sound.play('chime', { pitch: 0.8 });
      }
      if (e.effect === 'petals') { petals(30 + Math.min(60, e.repeatCount * 4)); sound.play('chime'); }
      if (e.effect === 'golden') { fx.rays = 5; fx.glow = 1; petals(30); sparks(80, BUDDHA.x, 600); sound.play('bell'); fx.bell = 1; }
      if (e.effect === 'buddha') { fx.rays = 10; fx.glow = 1.6; petals(70); petals(20, 'lotus'); sparks(160, BUDDHA.x, 600); sound.play('levelup'); fx.bell = 1; }
      const prio = { petals: 2, lotus: 3, golden: 4, buddha: 5 }[e.effect] || 2;
      queueAlert({
        kind: 'gift', user: e.user, title: `${nm(e.user)} ${e.verb}`,
        sub: `${e.repeatCount > 1 ? e.repeatCount + ' × ' : ''}${e.giftName}`, merit: e.merit, giftImage: e.giftImage,
        dur: prio >= 4 ? 6 : 4, prio, big: prio >= 4,
      });
      announce(`Xin tán thán công đức thí chủ ${e.user?.name || ''} ${e.verb} ${e.repeatCount > 1 ? e.repeatCount + ' ' : ''}${e.giftName}`);
      break;
    }
    case 'manual':
      sound.play('chime');
      queueAlert({ kind: 'gift', user: e.user, title: `${nm(e.user)} hùn phước`, sub: e.text || 'Công đức', merit: e.merit, dur: 4, prio: 3 });
      break;
    case 'levelup':
      fx.flash = 1; fx.rays = 6; fx.glow = 1.2;
      sparks(160, BUDDHA.x, 600, '#fff1a8');
      petals(50);
      sound.play('levelup');
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
      const first = !S;
      cfg = msg.config;
      S = msg.state;
      if (first) {
        sound = new SoundBoard({ muted: opt.mute, files: cfg.sounds, ambientVolume: cfg.ambientVolume });
        sound.init();
        if (started) sound.resume();
        setTimeout(() => { if (!opt.mute && !opt.phone && sound.suspended) soundBtn.style.display = 'block'; }, 800);
        const bg = opt.bg || cfg.hall?.background;
        if (bg) { const img = new Image(); img.onload = () => { bgImg = img; }; img.src = bg; }
        const bi = cfg.hall?.buddhaImage;
        if (bi?.src && qs.get('buddha') !== 'draw') { const img = new Image(); img.onload = () => { buddhaImg = img; }; img.src = bi.src; }
        // người đã có mặt: đặt thẳng vào chỗ, không đi bộ vào
        assignSlots();
        for (const p of people.values()) { p.x = p.tx; p.y = p.ty; p.s = p.ts; }
      } else assignSlots();
    } else if (msg.type === 'state') {
      S = msg.state;
      assignSlots();
    } else if (msg.type === 'fx') {
      for (const e of msg.effects) handleEffect(e);
    } else if (msg.type === 'reset') {
      people.clear();
      fx.alerts.length = 0; fx.alert = null; fx.lotus.length = 0;
    }
  };
}
const soundBtn = document.getElementById('sound');
soundBtn.onclick = () => { sound.resume(); soundBtn.style.display = 'none'; };

// ---------------- chế độ điện thoại ----------------
let started = false;
let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* cần HTTPS */ }
}
const startEl = document.getElementById('start');
if (opt.phone) startEl.hidden = false;
startEl.querySelector('button').onclick = async () => {
  started = true;
  sound.resume();
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { /* bỏ qua */ }
  try { await screen.orientation?.lock?.('portrait'); } catch { /* bỏ qua */ }
  keepAwake();
  startEl.hidden = true;
  soundBtn.style.display = 'none';
};
document.addEventListener('visibilitychange', () => {
  if (started && document.visibilityState === 'visible') { keepAwake(); sound.resume(); }
});

// ---------------- HUD ----------------
function panelBg(x, y, w, h) {
  roundRect(x, y, w, h, 18);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(48,22,10,0.88)'); g.addColorStop(1, 'rgba(28,12,6,0.88)');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(232,176,74,0.9)'; ctx.stroke();
  roundRect(x + 6, y + 6, w - 12, h - 12, 14);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(232,176,74,0.35)'; ctx.stroke();
}

function drawBanner() {
  const text = `🪷 ${fmt.format(S.present || 0)} phật tử đang lễ Phật trong chánh điện`;
  ctx.save();
  ctx.font = font(700, 30);
  const w = ctx.measureText(text).width + 70, h = 62, x = (W - w) / 2, y = 312;
  roundRect(x, y, w, h, 32);
  ctx.fillStyle = 'rgba(30,12,5,0.72)'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(232,176,74,0.9)'; ctx.stroke();
  ctx.fillStyle = '#fff4dc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, y + h / 2 + 1);
  ctx.restore();
}

function drawBoard() {
  const x = 14, y = 410, w = 334;
  const list = S.leaderboard.slice(0, 5);
  const h = 112 + Math.max(1, list.length) * 52 + 44;
  ctx.save();
  panelBg(x, y, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(900, 30, true); ctx.fillStyle = '#f5c95a';
  ctx.fillText(cfg.hall?.leaderboardTitle || 'BẢNG CÔNG ĐỨC', x + w / 2, y + 42);
  ctx.font = font(500, 19); ctx.fillStyle = '#f0dcc0';
  ctx.fillText(cfg.hall?.leaderboardSubtitle || 'Tặng quà để ghi danh', x + w / 2, y + 74);
  const medals = ['#f5c542', '#d9d9d9', '#d38b4a'];
  if (!list.length) {
    ctx.font = font(600, 19); ctx.fillStyle = '#f0dcc0';
    ctx.fillText('Chưa có ai ghi danh 🙏', x + w / 2, y + 138);
  }
  list.forEach((d, i) => {
    const cy = y + 128 + i * 52;
    ctx.textAlign = 'center';
    ctx.fillStyle = medals[i] || 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.arc(x + 32, cy, 15, 0, Math.PI * 2); ctx.fill();
    ctx.font = font(800, 17); ctx.fillStyle = i < 3 ? '#3a1a00' : '#fff';
    ctx.fillText(String(i + 1), x + 32, cy + 1);
    drawAvatar(d, x + 70, cy, 17, medals[i] || 'rgba(232,176,74,0.7)');
    ctx.textAlign = 'left'; ctx.font = font(600, 21); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(d.name, w - 160), x + 96, cy + 1);
    ctx.textAlign = 'right'; ctx.font = font(700, 20); ctx.fillStyle = '#f5d78a';
    ctx.fillText(compact(d.merit), x + w - 18, cy + 1);
  });
  ctx.textAlign = 'center'; ctx.font = font(500, 17); ctx.fillStyle = '#e8d6b8';
  ctx.fillText(`Tổng công đức: ${compact(S.total)} · ${fmt.format(S.donorCount || 0)} người`, x + w / 2, y + h - 24);
  ctx.restore();
}

function compact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + 'tr';
  if (n >= 1e4) return Math.round(n / 1e3) + 'k';
  return fmt.format(n);
}

function drawGuide() {
  const x = 718, y = 410, w = 348;
  const guide = cfg.hall?.guide || [];
  const gifts = cfg.hall?.giftGuide || [];
  const top = S.worshippers?.[0]?.merit > 0 ? S.worshippers[0] : null;
  const last = S.lastGift;
  const h = 76 + guide.length * 50 + (gifts.length ? 46 + gifts.length * 50 : 0) + (top ? 40 : 0) + (last ? 58 : 0) + 14;
  ctx.save();
  panelBg(x, y, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(900, 30, true); ctx.fillStyle = '#f5c95a';
  ctx.fillText('CÁCH THAM GIA', x + w / 2, y + 42);
  let cy = y + 86;
  const item = (it) => {
    ctx.textAlign = 'left';
    ctx.font = font(400, 22); ctx.fillStyle = '#fff';
    ctx.fillText(it.icon || '•', x + 18, cy);
    ctx.font = font(700, 20); ctx.fillStyle = '#ffd98a';
    ctx.fillText(fitText(it.title, w - 70), x + 54, cy);
    ctx.font = font(500, 17); ctx.fillStyle = '#f6ead6';
    ctx.fillText(fitText('→ ' + it.desc, w - 76), x + 60, cy + 23);
    cy += 50;
  };
  guide.forEach(item);
  if (gifts.length) {
    ctx.strokeStyle = 'rgba(232,176,74,0.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 16, cy - 10); ctx.lineTo(x + w - 16, cy - 10); ctx.stroke();
    ctx.textAlign = 'left'; ctx.font = font(800, 20); ctx.fillStyle = '#f5c95a';
    ctx.fillText('DÂNG QUÀ', x + 18, cy + 12);
    cy += 46;
    gifts.forEach(item);
  }
  if (top) {
    ctx.textAlign = 'left'; ctx.font = font(600, 19); ctx.fillStyle = '#ffd98a';
    ctx.fillText(fitText(`🪷 Đài sen vàng: ${top.name}`, w - 40), x + 18, cy);
    cy += 40;
  }
  if (last) {
    ctx.font = font(700, 19); ctx.fillStyle = '#ffd98a'; ctx.textAlign = 'left';
    ctx.fillText(fitText(`🙏 ${last.name}`, w - 40), x + 18, cy);
    ctx.font = font(500, 18); ctx.fillStyle = '#f6ead6';
    ctx.fillText(fitText(`→ dâng ${last.repeatCount > 1 ? last.repeatCount + '× ' : ''}${last.giftName} · ${timeAgo(last.at)}`, w - 70), x + 54, cy + 24);
  }
  ctx.restore();
}

// ---------------- vẽ phật tử ----------------
function updatePeople(dt) {
  for (const [id, p] of people) {
    if (p.leaving) {
      p.alpha -= dt * 0.8;
      p.ty += dt * 40;
      if (p.alpha <= 0) { people.delete(id); continue; }
    } else p.alpha = Math.min(1, p.alpha + dt * 2);
    const k = Math.min(1, dt * 2.2);
    const dist = Math.hypot(p.tx - p.x, p.ty - p.y);
    p.walking = dist > 6;
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;
    p.s += (p.ts - p.s) * k;
    if (p.bowT > 0) p.bowT = Math.max(0, p.bowT - dt);
    if (p.bubble) { p.bubble.t -= dt; if (p.bubble.t <= 0) p.bubble = null; }
  }
}

function drawPeople(t) {
  const list = [...people.values()].sort((a, b) => a.y - b.y);
  const gold = list.find((p) => p.gold && !p.leaving);
  if (gold) drawGoldenLotusSeat(ctx, gold.x, gold.y + 6, gold.s * 1.2, t);
  // "Đệ nhất công đức"
  if (gold) {
    ctx.save();
    ctx.font = font(800, 15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = 190;
    roundRect(gold.x - w / 2, FLOOR_Y + 52, w, 24, 6);
    ctx.fillStyle = 'rgba(90,20,8,0.9)'; ctx.fill();
    ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#f5d78a';
    ctx.fillText('ĐỆ NHẤT CÔNG ĐỨC', gold.x, FLOOR_Y + 65);
    ctx.restore();
  }
  for (const p of list) {
    const b = p.bowT > 0 ? Math.sin(Math.PI * (1 - p.bowT / p.bowDur)) : 0;
    ctx.globalAlpha = Math.max(0, p.alpha);
    drawWorshipper(ctx, p.x, p.y, p.s, p.look, b, p.walking ? t : 0);
    ctx.globalAlpha = 1;
  }
  // thẻ tên
  for (const p of list) {
    const fs = Math.round(11 + 7 * p.s);
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.font = font(700, fs);
    const label = clip(p.name, p.s < 0.8 ? 9 : 12);
    const tw = Math.min(ctx.measureText(label).width, 150);
    const h = fs + 10, r = h / 2 - 2;
    const w = tw + r * 2 + 18;
    const x = p.x - w / 2, y = p.y - 124 * p.s - h;
    roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = p.gold ? 'rgba(160,100,20,0.95)' : p.rank < 3 ? 'rgba(110,40,10,0.9)' : 'rgba(40,18,8,0.78)';
    ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = p.gold || p.rank < 3 ? '#f5c542' : 'rgba(232,176,74,0.55)'; ctx.stroke();
    drawAvatar(p, x + r + 3, y + h / 2, r, 'rgba(255,255,255,0.6)');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(fitText(label, 150), x + r * 2 + 10, y + h / 2 + 1);
    p.tagTop = y;
    ctx.restore();
  }
  // bong bóng lời nói
  for (const p of list) {
    if (!p.bubble) continue;
    const a = Math.min(1, p.bubble.t * 2, (6 - p.bubble.t) * 4);
    ctx.save();
    ctx.globalAlpha = a * p.alpha;
    ctx.font = font(600, 20);
    const lines = wrap(p.bubble.text, 250, 2);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28;
    const h = lines.length * 26 + 16;
    const x = Math.max(8, Math.min(W - w - 8, p.x - w / 2));
    const y = (p.tagTop ?? p.y - 140 * p.s) - h - 12;
    roundRect(x, y, w, h, 14);
    ctx.fillStyle = 'rgba(255,250,240,0.96)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(p.x - 8, y + h); ctx.lineTo(p.x, y + h + 10); ctx.lineTo(p.x + 8, y + h); ctx.fill();
    ctx.fillStyle = '#3a1a0a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + 8 + 13 + i * 26));
    ctx.restore();
  }
}

// ---------------- vẽ hiệu ứng ----------------
function drawProjectiles(dt) {
  for (const pr of fx.projectiles) {
    pr.t += dt / pr.dur;
    const k = ease(Math.min(1, pr.t));
    const x = lerp(pr.x0, pr.x1, k);
    const y = lerp(pr.y0, pr.y1, k) - Math.sin(Math.PI * Math.min(1, pr.t)) * 220;
    if (pr.kind === 'lotus') {
      lotusFlower(ctx, x, y, 0.8, 0, pr.gold);
    } else {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(0.3);
      ctx.strokeStyle = '#b4472a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -40); ctx.stroke();
      ctx.fillStyle = '#ffb04a'; ctx.beginPath(); ctx.arc(0, -40, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (Math.random() < 0.5) fx.particles.push({ kind: 'smoke', x, y: y - 40, vx: 0, vy: -10, life: 0.6, decay: 0.8, r: 3, ph: 0 });
    }
    if (pr.t >= 1 && !pr.fired) { pr.fired = true; pr.done?.(); }
  }
  fx.projectiles = fx.projectiles.filter((p) => p.t < 1);
}

function drawParticles(dt, t) {
  const keep = [];
  for (const p of fx.particles) {
    p.life -= p.decay * dt;
    if (p.life <= 0) continue;
    keep.push(p);
    if (p.kind === 'smoke') {
      p.x += (p.vx + Math.sin(t * 2 + p.ph + p.y / 40) * 16) * dt;
      p.y += p.vy * dt;
      p.r += dt * 10;
      ctx.fillStyle = `rgba(240,236,230,${0.12 * p.life})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'spark') {
      p.vy += 500 * dt; p.vx *= 1 - dt * 1.2;
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 + 3 * p.life, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } else {
      p.x += (p.vx + Math.sin(t * 1.6 + p.ph) * 40) * dt;
      p.y += p.vy * dt; p.rot += p.vr * dt;
      ctx.globalAlpha = Math.min(1, p.life * 3);
      if (p.kind === 'lotus') lotusFlower(ctx, p.x, p.y, p.s, p.rot * 0.3);
      else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(p.s, p.s);
        ctx.fillStyle = p.hue; ctx.beginPath(); ctx.ellipse(0, 0, 9, 15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }
  fx.particles = keep.length > 1000 ? keep.slice(-1000) : keep;
}

function drawLanterns(dt, t) {
  for (const l of fx.lanterns) {
    l.life -= dt / 14;
    l.y -= dt * 60;
    l.x += Math.sin(t * 0.8 + l.ph) * dt * 16;
    const a = Math.max(0, Math.min(1, l.life * 4, (1 - l.life) * 6));
    ctx.save();
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(l.x, l.y, 6, l.x, l.y, 80);
    g.addColorStop(0, 'rgba(255,170,70,0.65)'); g.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = g; ctx.fillRect(l.x - 80, l.y - 80, 160, 160);
    ctx.fillStyle = '#e8402a';
    ctx.beginPath(); ctx.ellipse(l.x, l.y, 26, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b04a'; ctx.fillRect(l.x - 12, l.y - 34, 24, 6); ctx.fillRect(l.x - 12, l.y + 28, 24, 6);
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath(); ctx.ellipse(l.x, l.y + 2, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(800, 19); outlined(l.name, l.x, l.y + 56, '#ffe9a8', 'rgba(0,0,0,0.85)', 4);
    ctx.font = font(600, 19); outlined(l.text, l.x, l.y + 80, '#fff', 'rgba(0,0,0,0.85)', 4);
    ctx.restore();
  }
  fx.lanterns = fx.lanterns.filter((l) => l.life > 0);
}

function drawFloaters(dt) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of fx.floaters) {
    f.life -= dt * 0.6; f.y -= dt * 60;
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
    ctx.font = font(800, f.size);
    outlined(f.text, f.x, f.y, f.color, 'rgba(40,10,0,0.85)', 5);
  }
  ctx.restore();
  fx.floaters = fx.floaters.filter((f) => f.life > 0);
}

function drawRays(t, strength) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(BUDDHA.x, BUDDHA.y - 262 * BUDDHA.s);
  ctx.rotate(t * 0.12);
  for (let i = 0; i < 18; i++) {
    ctx.rotate((Math.PI * 2) / 18);
    const g = ctx.createLinearGradient(0, 0, 0, -1000);
    g.addColorStop(0, `rgba(255,220,120,${0.35 * strength})`); g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-80, -1000); ctx.lineTo(80, -1000); ctx.lineTo(12, 0); ctx.closePath(); ctx.fill();
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
  const k = Math.min(ease(a.age / 0.45), ease((a.dur - a.age) / 0.4));
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(W / 2, a.kind === 'fortune' ? 700 : 1000);
  ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (a.kind === 'levelup') {
    roundRect(-450, -100, 900, 200, 28);
    const g = ctx.createLinearGradient(0, -100, 0, 100);
    g.addColorStop(0, 'rgba(255,214,90,0.96)'); g.addColorStop(1, 'rgba(200,120,20,0.96)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#fff6c8'; ctx.stroke();
    ctx.font = font(900, 36, true); outlined('✨ ' + a.title + ' ✨', 0, -36, '#5a1209', 'rgba(255,250,220,0.9)', 6);
    ctx.font = font(900, 52, true); outlined(a.sub, 0, 30, '#fff', 'rgba(90,18,9,0.9)', 9);
  } else if (a.kind === 'fortune') {
    ctx.font = font(600, 28);
    const lines = wrap(a.body, 640, 4);
    const h = 140 + lines.length * 40;
    roundRect(-380, -h / 2, 760, h, 22);
    ctx.fillStyle = 'rgba(250,236,200,0.97)'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#a3241a'; ctx.stroke();
    drawAvatar(a.user, -310, -h / 2 + 52, 30);
    ctx.font = font(800, 28); ctx.fillStyle = '#7a1a0e'; ctx.textAlign = 'left';
    ctx.fillText(fitText('🎋 ' + a.title, 560), -266, -h / 2 + 52);
    ctx.textAlign = 'center'; ctx.font = font(600, 28); ctx.fillStyle = '#3a1a0a';
    lines.forEach((l, i) => ctx.fillText(l, 0, -h / 2 + 112 + i * 40));
  } else {
    const big = a.big;
    const bw = big ? 880 : 780, bh = big ? 170 : 130;
    roundRect(-bw / 2, -bh / 2, bw, bh, 26);
    const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    g.addColorStop(0, big ? 'rgba(160,30,14,0.96)' : 'rgba(80,28,10,0.94)');
    g.addColorStop(1, big ? 'rgba(90,10,4,0.96)' : 'rgba(40,14,6,0.94)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = big ? 6 : 3.5; ctx.strokeStyle = '#f5c542'; ctx.stroke();
    const r = big ? 56 : 44;
    drawAvatar(a.user, -bw / 2 + r + 24, 0, r);
    const gi = avatarImg(a.giftImage);
    if (gi) ctx.drawImage(gi, bw / 2 - r * 2 - 18, -r, r * 2, r * 2);
    const tx = -bw / 2 + r * 2 + 46, tw = bw - r * 4 - 84;
    ctx.textAlign = 'left';
    ctx.font = font(600, big ? 22 : 20); ctx.fillStyle = '#f5d78a';
    ctx.fillText('📣 Xướng danh công đức', tx, big ? -52 : -40);
    ctx.font = font(800, big ? 36 : 30); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(a.title, tw), tx, big ? -12 : -6);
    ctx.font = font(700, big ? 28 : 24); ctx.fillStyle = '#ffd96a';
    ctx.fillText(fitText(`${a.sub} · +${fmt.format(a.merit || 0)} công đức`, tw), tx, big ? 40 : 34);
  }
  ctx.restore();
}

// ---------------- vòng lặp ----------------
let last = performance.now();
let fps = 60;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = lerp(fps, 1 / Math.max(dt, 0.001), 0.05);
  const t = now / 1000;
  ctx.clearRect(0, 0, W, H);
  if (!S) {
    ctx.fillStyle = '#1a0c06'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f5c542'; ctx.font = font(800, 36); ctx.textAlign = 'center';
    ctx.fillText('Đang mở cửa chánh điện…', W / 2, H / 2);
    requestAnimationFrame(frame); return;
  }

  fx.moHit = Math.max(0, fx.moHit - dt * 6);
  fx.bell = Math.max(0, fx.bell - dt * 0.35);
  fx.glow = Math.max(0, fx.glow - dt * 0.15);
  fx.rays = Math.max(0, fx.rays - dt);
  fx.flash = Math.max(0, fx.flash - dt * 0.8);
  for (const s of fx.sticks) if (!s.base) s.life -= s.decay * dt;
  fx.sticks = fx.sticks.filter((s) => s.life > 0);
  updatePeople(dt);

  if (bgImg) {
    const sc = Math.max(W / bgImg.width, H / bgImg.height);
    ctx.drawImage(bgImg, (W - bgImg.width * sc) / 2, (H - bgImg.height * sc) / 2, bgImg.width * sc, bgImg.height * sc);
    if (fx.rays > 0) drawRays(t, Math.min(1, fx.rays / 1.5));
  } else {
    // ảnh tượng vốn đã sáng: giảm hào quang cộng thêm để không bị trắng xoá
    const glowK = buddhaImg ? 0.3 : 1;
    drawInterior(ctx, t, Math.min(1, fx.glow) * glowK, buddhaImg, cfg.hall?.buddhaImage);
    if (fx.rays > 0) drawRays(t, Math.min(1, fx.rays / 1.5) * (buddhaImg ? 0.45 : 1));
    if (!buddhaImg) drawGreatBuddha(ctx, t, Math.min(1, fx.glow));
    drawFloor(ctx, t);
    drawAltar(ctx, t, fx.lotus);
    drawSideDecor(ctx, t);
  }
  drawSticks(ctx, fx.sticks, fx.particles);
  if (bgImg) fx.lotus.forEach((o, i) => { const sl = LOTUS_SLOTS[i % LOTUS_SLOTS.length]; lotusFlower(ctx, sl[0], sl[1], 0.8, 0, o.gold); });
  drawMoSmall(ctx, 200, FLOOR_Y + 60, fx.moHit);
  drawBowlBell(ctx, W - 200, FLOOR_Y + 60, fx.bell, t);

  drawPeople(t);
  drawProjectiles(dt);
  drawParticles(dt, t);
  drawLanterns(dt, t);
  drawBanner();
  if (opt.board) drawBoard();
  if (opt.guide) drawGuide();
  drawFloaters(dt);
  drawAlert(dt);

  if (fx.flash > 0) { ctx.fillStyle = `rgba(255,240,190,${fx.flash * 0.6})`; ctx.fillRect(0, 0, W, H); }
  if (opt.debug) {
    ctx.font = font(700, 20); ctx.textAlign = 'left';
    outlined(`${Math.round(fps)} fps · ws ${wsOk ? 'OK' : 'mất'} · người ${people.size} · p ${fx.particles.length}`, 20, 40, wsOk ? '#9f9' : '#f88', '#000', 4);
  }
  requestAnimationFrame(frame);
}

connect();
(document.fonts?.ready || Promise.resolve()).finally(() => requestAnimationFrame(frame));

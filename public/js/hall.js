import {
  W, H, FLOOR_Y, BUDDHA, BURNER, PLATFORMS, lerp, ease, scaleAt,
  drawInterior, drawGreatBuddha, drawAltar, drawSticks, drawFloor, drawSideDecor, drawPlatforms,
  drawMoSmall, drawBowlBell, drawPerson, personLook, lotusFlower, LOTUS_SLOTS,
} from './hall-scene.js';
import { SoundBoard } from './sound.js';

// ?phone=1|0 (bật/tắt chế độ điện thoại)  ?buddha=draw (tượng vẽ bằng code)  ?mute=1  ?debug=1
// ?tts=1 (đọc lời nguyện)  ?bg=assets/anh.jpg (ảnh nền riêng)  ?board=0 (ẩn bảng top)  ?guide=0 (ẩn bảng giá)
const qs = new URLSearchParams(location.search);
const opt = {
  mute: qs.get('mute') === '1',
  debug: qs.get('debug') === '1',
  tts: qs.get('tts') === '1',
  bg: qs.get('bg') || '',
  guide: qs.get('guide') !== '0',
  board: qs.get('board') !== '0',
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
let buddhaImg = null;

const fx = {
  particles: [], floaters: [], lanterns: [], projectiles: [], banners: [], banner: null,
  sticks: [-22, 0, 22].map((dx) => ({ dx, tilt: dx / 400, life: 0.7, decay: 0, base: true })),
  lotus: [], moHit: 0, bell: 0, glow: 0, rays: 0, flash: 0, tickerAt: new Map(),
};
const people = new Map(); // id -> phật tử đang hiển thị

// ---------------- chỗ đứng hai bên thảm ----------------
const CROWD = (() => {
  const out = [];
  for (let r = 0; r < 7; r++) {
    const y = 1180 + 92 * r;
    const row = [];
    for (let i = 0; i < 4; i++) {
      row.push({ x: lerp(78, 400, i / 3) - r * 6, y }); // bên trái
      row.push({ x: lerp(W - 78, W - 400, i / 3) + r * 6, y }); // bên phải
    }
    // gần thảm (giữa) trước, rồi ra mép
    row.sort((a, b) => Math.abs(a.x - W / 2) - Math.abs(b.x - W / 2));
    out.push(...row);
  }
  return out;
})();

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
    ctx.fillStyle = `hsl(${h},45%,40%)`; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(800, Math.round(r * 1.1));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText([...name][0]?.toUpperCase() || '?', x, y + 1);
  }
  ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = ring;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
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

// ---------------- phật tử + đường đi ----------------
const WALK_SPEED = 260; // px/giây ở tỉ lệ 1

function ensurePerson(user) {
  if (!user?.id) return null;
  let p = people.get(user.id);
  if (!p) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = W / 2 + side * (120 + Math.random() * 60);
    p = { id: user.id, name: user.name, avatar: user.avatar, look: personLook(user.id), x, y: H + 60, path: [], alpha: 1, bowT: 0, bubble: null, leaving: false, rank: 999, platform: -1, phase: Math.random() * 6 };
    people.set(user.id, p);
  }
  if (user.name) p.name = user.name;
  if (user.avatar) p.avatar = user.avatar;
  p.leaving = false;
  return p;
}

/** Đặt đích mới. viaCarpet: đi ra thảm đỏ rồi mới đi dọc lên / xuống. */
function goTo(p, tx, ty, viaCarpet = false) {
  const last = p.path.length ? p.path[p.path.length - 1] : { x: p.x, y: p.y };
  if (Math.abs(last.x - tx) < 1 && Math.abs(last.y - ty) < 1) return;
  if (viaCarpet) {
    const cx = W / 2 + (tx < W / 2 ? -22 : 22);
    p.path = [{ x: cx, y: p.y }, { x: cx, y: ty + (ty < 1100 ? 40 : 0) }, { x: tx, y: ty }];
  } else {
    p.path = [{ x: tx, y: ty }];
  }
}

function assignSlots() {
  const list = S?.worshippers || [];
  const plat = S?.platforms || [];
  const onPlat = new Map();
  plat.forEach((pl, i) => { if (pl) onPlat.set(pl.id, i); });
  const seen = new Set();
  let si = 0;
  const place = (w, i) => {
    const p = ensurePerson(w);
    seen.add(w.id);
    p.rank = i;
    const slot = onPlat.get(w.id);
    if (slot !== undefined) {
      const was = p.platform;
      p.platform = slot;
      const pp = PLATFORMS[slot];
      if (was !== slot) goTo(p, pp.x, pp.y + 6, true);
      return;
    }
    const wasOnPlatform = p.platform >= 0;
    p.platform = -1;
    const c = CROWD[si++];
    if (!c) { p.leaving = true; return; }
    goTo(p, c.x, c.y, wasOnPlatform || p.y > H);
  };
  list.forEach(place);
  // người trên bục nhưng không còn trong danh sách worshippers (vượt giới hạn) vẫn hiện trên bục
  plat.forEach((pl) => { if (pl && !seen.has(pl.id)) place(pl, 999); });
  for (const p of people.values()) {
    if (!seen.has(p.id) && !p.leaving) {
      p.leaving = true;
      goTo(p, p.x < W / 2 ? W / 2 - 60 : W / 2 + 60, H + 120, true);
    }
  }
}

function bow(p, dur = 1.2) { if (p) { p.bowT = dur; p.bowDur = dur; } }
const KNEEL_SCALE = 0.78;
const scaleOf = (p) => (p.platform >= 0 && !p.path.length ? KNEEL_SCALE : scaleAt(p.y));
function headOf(p) { const s = scaleOf(p); return { x: p.x, y: p.y - (p.platform >= 0 && !p.path.length ? 100 : 160) * s }; }
function say(p, text, kind = 'chat') {
  if (!p || !text) return;
  p.bubble = { text: clip(text, 60), t: 6, kind };
}

// ---------------- hiệu ứng ----------------
function floater(text, x, y, color = '#ffe28a', size = 28) {
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
  fx.sticks.push({ dx: (Math.random() - 0.5) * 96, tilt: (Math.random() - 0.5) * 0.25, life: 1, decay: 1 / 150 });
}
function addLotus(gold) {
  fx.lotus.push({ gold });
  if (fx.lotus.length > LOTUS_SLOTS.length) fx.lotus.shift();
}
function throwTo(kind, p, x1, y1, done, opts = {}) {
  const from = p ? headOf(p) : { x: W / 2, y: H - 300 };
  fx.projectiles.push({ kind, x0: from.x, y0: from.y, x1, y1, t: 0, dur: opts.dur || 1.1, done, gold: opts.gold });
}
/** Băng rôn lời nguyện giữa màn hình (hàng đợi, ưu tiên cao trước). */
function queueBanner(b) {
  fx.banners.push(b);
  while (fx.banners.length > 8) {
    let idx = 0;
    for (let i = 1; i < fx.banners.length; i++) if ((fx.banners[i].prio || 0) < (fx.banners[idx].prio || 0)) idx = i;
    fx.banners.splice(idx, 1);
  }
}

const nm = (u) => clip(u?.name || 'Thí chủ', 22);

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
      if (p) { const h = headOf(p); floater(e.source === 'like' ? `+${e.count} ❤` : `+${e.merit}`, h.x, h.y - 30, '#ffb3c6', 24); }
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
      else queueBanner({ text: `${nm(e.user)} đã chia sẻ buổi lễ, công đức vô lượng.`, prio: 1, dur: 5 });
      fx.bell = 1;
      sound.play('bell');
      break;
    case 'fortune':
      bow(p, 1.6);
      say(p, e.text);
      sound.play('chime');
      queueBanner({ text: `🎋 ${nm(e.user)} rút quẻ: ${e.fortune}`, prio: 2, dur: 7 });
      announce(e.fortune);
      break;
    case 'prayer': {
      bow(p, 1.6);
      say(p, e.text);
      sound.play('chime', { pitch: 0.9 });
      const h = p ? headOf(p) : { x: W / 2, y: 1500 };
      if (fx.lanterns.length > 8) fx.lanterns.shift();
      fx.lanterns.push({ x: Math.max(120, Math.min(W - 120, h.x)), y: h.y - 40, life: 1, ph: Math.random() * 6 });
      break;
    }
    case 'chat':
      say(p, e.text);
      break;
    case 'follow':
      bow(p);
      fx.bell = 1;
      sound.play('bell');
      if (p) floater('➕ theo dõi', headOf(p).x, headOf(p).y - 30, '#ffb38a', 24);
      break;
    case 'gift': {
      bow(p, 1.8);
      say(p, `🙏 dâng ${e.giftName} x${e.repeatCount || 1}`, 'gift');
      fx.tickerAt.set(`${e.user?.name}|${e.giftName}`, performance.now());
      throwTo('stick', p, BURNER.x, BURNER.y - 20, () => addStick());
      const big = e.effect === 'golden' || e.effect === 'buddha';
      if (e.effect === 'lotus' || big) {
        const n = Math.min(3, e.repeatCount || 1);
        for (let i = 0; i < n; i++) {
          const slot = LOTUS_SLOTS[(fx.lotus.length + i) % LOTUS_SLOTS.length];
          setTimeout(() => throwTo('lotus', p, slot[0], slot[1], () => addLotus(big), { dur: 1.4, gold: big }), i * 250);
        }
        sound.play('chime', { pitch: 0.8 });
      }
      if (e.effect === 'petals') { petals(30 + Math.min(60, e.repeatCount * 4)); sound.play('chime'); }
      if (e.effect === 'golden') { fx.rays = 5; fx.glow = 1; petals(30); sparks(80, BUDDHA.x, 420); sound.play('bell'); fx.bell = 1; }
      if (e.effect === 'buddha') {
        fx.rays = 10; fx.glow = 1.6; petals(70); petals(20, 'lotus'); sparks(160, BUDDHA.x, 420); sound.play('levelup'); fx.bell = 1;
        queueBanner({ text: `✨ ${nm(e.user)} đại cúng dường ${e.repeatCount > 1 ? e.repeatCount + ' ' : ''}${e.giftName}. Công đức vô lượng, phước báu trang nghiêm.`, prio: 4, dur: 7 });
      }
      break;
    }
    case 'platform': {
      const pre = e.offerings > 1
        ? `${nm(e.user)} đã dâng lễ ${e.offerings} lần, mời lên bục lễ Phật.`
        : `${nm(e.user)} thành tâm dâng ${e.giftName}, lên bục quỳ trước Tam Bảo.`;
      const text = `${pre} Nguyện ${e.wish}`;
      queueBanner({ text, prio: 3, dur: 7 });
      sound.play('bell');
      announce(text);
      break;
    }
    case 'platform_leave':
      break;
    case 'manual':
      sound.play('chime');
      queueBanner({ text: `${nm(e.user)} hùn phước ${fmt.format(e.merit)} công đức. ${e.text || ''}`, prio: 2, dur: 5 });
      break;
    case 'levelup':
      fx.flash = 1; fx.rays = 6; fx.glow = 1.2;
      sparks(160, BUDDHA.x, 420, '#fff1a8');
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
        for (const p of people.values()) { const d = p.path[p.path.length - 1]; if (d) { p.x = d.x; p.y = d.y; p.path = []; } }
      } else assignSlots();
    } else if (msg.type === 'state') {
      S = msg.state;
      assignSlots();
    } else if (msg.type === 'fx') {
      for (const e of msg.effects) handleEffect(e);
    } else if (msg.type === 'reset') {
      people.clear();
      fx.banners.length = 0; fx.banner = null; fx.lotus.length = 0;
    }
  };
}
const soundBtn = document.getElementById('sound');
soundBtn.onclick = () => { sound.resume(); soundBtn.style.display = 'none'; };

// ---------------- chế độ điện thoại ----------------
let started = false;
async function keepAwake() {
  try { await navigator.wakeLock?.request('screen'); } catch { /* cần HTTPS */ }
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
function compact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + 'tr';
  if (n >= 1e4) return Math.round(n / 1e3) + 'k';
  return fmt.format(n);
}

/** Quà gần đây: thanh dọc góc trên bên trái. */
function drawGiftTicker() {
  const list = (S.recentGifts || []).slice(0, 3);
  const now = performance.now();
  list.forEach((g, i) => {
    const y = 214 + i * 66;
    const born = fx.tickerAt.get(`${g.name}|${g.giftName}`) || 0;
    const slide = i === 0 ? ease(Math.min(1, (now - born) / 400)) : 1;
    const x = -300 * (1 - slide);
    ctx.save();
    roundRect(x - 30, y, 330, 56, 28);
    const grd = ctx.createLinearGradient(0, y, 0, y + 56);
    grd.addColorStop(0, 'rgba(120,18,10,0.9)'); grd.addColorStop(1, 'rgba(70,8,4,0.9)');
    ctx.fillStyle = grd; ctx.fill();
    ctx.strokeStyle = 'rgba(245,197,66,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    drawAvatar(g, x + 26, y + 28, 20, '#f5c542');
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = font(700, 20); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(g.name, 170), x + 54, y + 19);
    ctx.font = font(500, 16); ctx.fillStyle = '#ffd98a';
    ctx.fillText(fitText(g.giftName, 170), x + 54, y + 41);
    ctx.textAlign = 'right'; ctx.font = font(900, 26, true); ctx.fillStyle = '#ffe9a8';
    ctx.fillText(`x${g.repeatCount || 1}`, x + 286, y + 30);
    ctx.restore();
  });
}

/** Top 3 người tặng nhiều nhất: góc trên bên phải. */
function drawBoard() {
  const x = 736, y = 206, w = 330, h = 206;
  const list = S.leaderboard.slice(0, 3);
  ctx.save();
  roundRect(x, y, w, h, 18);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(110,16,10,0.92)'); g.addColorStop(1, 'rgba(60,8,4,0.92)');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#e8b04a'; ctx.stroke();
  lotusFlower(ctx, x + w / 2, y + 6, 0.55, 0, true);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(900, 27, true); ctx.fillStyle = '#ffd96a';
  ctx.fillText(fitText(cfg.hall?.leaderboardTitle || 'TÂM LÒNG THÀNH', w - 30), x + w / 2, y + 40);
  const medals = ['#f5c542', '#d9d9d9', '#d38b4a'];
  if (!list.length) {
    ctx.font = font(600, 19); ctx.fillStyle = '#f0dcc0';
    ctx.fillText('Tặng quà để ghi danh 🙏', x + w / 2, y + 130);
  }
  list.forEach((d, i) => {
    const cy = y + 84 + i * 44;
    ctx.fillStyle = medals[i];
    ctx.beginPath(); ctx.arc(x + 30, cy, 15, 0, Math.PI * 2); ctx.fill();
    ctx.font = font(800, 17); ctx.fillStyle = '#3a1a00'; ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + 30, cy + 1);
    drawAvatar(d, x + 68, cy, 18, medals[i]);
    ctx.textAlign = 'left'; ctx.font = font(700, 21); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(d.name, w - 170) + (i === 0 ? ' ⭐' : ''), x + 96, cy + 1);
    ctx.textAlign = 'right'; ctx.font = font(700, 18); ctx.fillStyle = '#f5d78a';
    ctx.fillText(compact(d.merit), x + w - 14, cy + 1);
  });
  ctx.restore();
}

/** Băng rôn lời nguyện giữa màn hình. */
function drawBanner(dt) {
  if (!fx.banner && fx.banners.length) {
    fx.banners.sort((a, b) => (b.prio || 0) - (a.prio || 0));
    fx.banner = { ...fx.banners.shift(), age: 0 };
  }
  const b = fx.banner;
  if (!b) return;
  b.age += dt;
  if (b.age > b.dur) { fx.banner = null; return; }
  const k = Math.min(ease(b.age / 0.4), ease((b.dur - b.age) / 0.4));
  ctx.save();
  ctx.globalAlpha = k;
  ctx.font = font(600, 29);
  const lines = wrap(b.text, 860, 3);
  const h = 34 + lines.length * 40;
  const y = 548 - h / 2 + (1 - k) * 20;
  roundRect(50, y, W - 100, h, 16);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(110,16,10,0.93)'); g.addColorStop(1, 'rgba(66,8,4,0.93)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 3; ctx.stroke();
  roundRect(58, y + 8, W - 116, h - 16, 12);
  ctx.strokeStyle = 'rgba(232,176,74,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff6e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 17 + 20 + i * 40));
  ctx.restore();
}

/** Bảng giá ở đáy màn hình. */
function drawPriceTags() {
  const tags = cfg.hall?.priceTags || [];
  if (!tags.length) return;
  const w = 290, h = 84, gap = 22;
  let x = (W - (tags.length * w + (tags.length - 1) * gap)) / 2;
  const y = 1790;
  ctx.save();
  for (const t of tags) {
    roundRect(x, y, w, h, 12);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(100,14,8,0.9)'); g.addColorStop(1, 'rgba(56,6,2,0.9)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(900, 28, true); ctx.fillStyle = '#ffd96a';
    ctx.fillText(t.price, x + w / 2, y + 28);
    ctx.font = font(600, 22); ctx.fillStyle = '#fff1d6';
    ctx.fillText(t.label, x + w / 2, y + 60);
    x += w + gap;
  }
  ctx.restore();
}

// ---------------- người ----------------
function updatePeople(dt) {
  for (const [id, p] of people) {
    if (p.path.length) {
      const to = p.path[0];
      const dx = to.x - p.x, dy = to.y - p.y;
      const d = Math.hypot(dx, dy);
      const step = WALK_SPEED * Math.max(0.55, scaleAt(p.y)) * dt;
      if (d <= step) { p.x = to.x; p.y = to.y; p.path.shift(); }
      else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
      p.phase += dt;
    } else if (p.leaving) {
      p.alpha -= dt * 1.2;
    }
    if (p.leaving && (p.y > H + 80 || p.alpha <= 0)) { people.delete(id); continue; }
    if (p.bowT > 0) p.bowT = Math.max(0, p.bowT - dt);
    // trên bục: lạy định kỳ
    if (p.platform >= 0 && !p.path.length && p.bowT === 0 && Math.random() < dt / 3) bow(p, 2.2);
    if (p.bubble) { p.bubble.t -= dt; if (p.bubble.t <= 0) p.bubble = null; }
  }
}

function drawPeople() {
  const list = [...people.values()].sort((a, b) => a.y - b.y);
  for (const p of list) {
    const s = scaleOf(p);
    const b = p.bowT > 0 ? Math.sin(Math.PI * (1 - p.bowT / p.bowDur)) : 0;
    const pose = p.path.length ? 'walk' : p.platform >= 0 ? 'kneel' : 'stand';
    ctx.globalAlpha = Math.max(0, p.alpha);
    drawPerson(ctx, p.x, p.y, s, p.look, pose, b, p.phase);
    ctx.globalAlpha = 1;
  }
  // thẻ tên (avatar + tên) ở ngang vai
  for (const p of list) {
    const s = scaleOf(p);
    const kneel = p.platform >= 0 && !p.path.length;
    const fs = Math.round(12 + 7 * s);
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.font = font(700, fs);
    const label = clip(p.name, s < 0.75 ? 9 : 12);
    const tw = Math.min(ctx.measureText(label).width, 140);
    const h = fs + 8, r = h / 2 - 1;
    const w = tw + r * 2 + 14;
    const x = p.x - w / 2;
    const y = kneel ? p.y + 26 : p.y - 92 * s - h / 2;
    roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = kneel ? 'rgba(90,20,8,0.9)' : 'rgba(25,14,8,0.62)'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = kneel || p.rank < 3 ? '#f5c542' : 'rgba(255,255,255,0.35)'; ctx.stroke();
    drawAvatar(p, x + r + 2, y + h / 2, r, 'rgba(255,255,255,0.7)');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(fitText(label, 140), x + r * 2 + 8, y + h / 2 + 1);
    ctx.restore();
  }
  // số bục
  (S.platforms || []).forEach((pl, i) => {
    if (!pl) return;
    const pp = PLATFORMS[i];
    ctx.save();
    ctx.fillStyle = '#f5c542';
    ctx.beginPath(); ctx.arc(pp.x + 52, pp.y - 12, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a4a10'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#3a1a00'; ctx.font = font(800, 16); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), pp.x + 52, pp.y - 11);
    ctx.restore();
  });
  // bong bóng lời nói
  for (const p of list) {
    if (!p.bubble) continue;
    const s = scaleOf(p);
    const a = Math.min(1, p.bubble.t * 2, (6 - p.bubble.t) * 4);
    const gift = p.bubble.kind === 'gift';
    ctx.save();
    ctx.globalAlpha = a * p.alpha;
    ctx.font = font(600, 21);
    const lines = wrap(p.bubble.text, 260, 2);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 30;
    const h = lines.length * 27 + 16;
    const x = Math.max(8, Math.min(W - w - 8, p.x - w / 2));
    const kneel = p.platform >= 0 && !p.path.length;
    const y = p.y - (kneel ? 110 : 170) * s - h - 8;
    roundRect(x, y, w, h, h > 50 ? 16 : h / 2);
    ctx.fillStyle = gift ? 'rgba(255,244,214,0.97)' : 'rgba(255,255,255,0.96)'; ctx.fill();
    if (gift) { ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(p.x - 7, y + h); ctx.lineTo(p.x, y + h + 9); ctx.lineTo(p.x + 7, y + h); ctx.fill();
    ctx.fillStyle = '#2a1408'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + 8 + 14 + i * 27));
    ctx.restore();
  }
}

// ---------------- hiệu ứng vẽ ----------------
function drawProjectiles(dt) {
  for (const pr of fx.projectiles) {
    pr.t += dt / pr.dur;
    const k = ease(Math.min(1, pr.t));
    const x = lerp(pr.x0, pr.x1, k);
    const y = lerp(pr.y0, pr.y1, k) - Math.sin(Math.PI * Math.min(1, pr.t)) * 200;
    if (pr.kind === 'lotus') {
      lotusFlower(ctx, x, y, 0.75, 0, pr.gold);
    } else {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(0.3);
      ctx.strokeStyle = '#b4472a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -38); ctx.stroke();
      ctx.fillStyle = '#ffb04a'; ctx.beginPath(); ctx.arc(0, -38, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (Math.random() < 0.5) fx.particles.push({ kind: 'smoke', x, y: y - 38, vx: 0, vy: -10, life: 0.6, decay: 0.8, r: 3, ph: 0 });
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
    l.life -= dt / 12;
    l.y -= dt * 70;
    l.x += Math.sin(t * 0.8 + l.ph) * dt * 16;
    const a = Math.max(0, Math.min(1, l.life * 4, (1 - l.life) * 6));
    ctx.save();
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, 60);
    g.addColorStop(0, 'rgba(255,170,70,0.6)'); g.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = g; ctx.fillRect(l.x - 60, l.y - 60, 120, 120);
    ctx.fillStyle = '#e8402a';
    ctx.beginPath(); ctx.ellipse(l.x, l.y, 18, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b04a'; ctx.fillRect(l.x - 9, l.y - 25, 18, 5); ctx.fillRect(l.x - 9, l.y + 20, 18, 5);
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath(); ctx.ellipse(l.x, l.y + 2, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
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
  if (bgImg) fx.lotus.forEach((o, i) => { const sl = LOTUS_SLOTS[i % LOTUS_SLOTS.length]; lotusFlower(ctx, sl[0], sl[1], 0.75, 0, o.gold); });
  drawMoSmall(ctx, 190, FLOOR_Y + 40, fx.moHit);
  drawBowlBell(ctx, W - 190, FLOOR_Y + 40, fx.bell, t);
  drawPlatforms(ctx, S.platforms || []);

  drawPeople();
  drawProjectiles(dt);
  drawParticles(dt, t);
  drawLanterns(dt, t);
  drawGiftTicker();
  if (opt.board) drawBoard();
  drawBanner(dt);
  if (opt.guide) drawPriceTags();
  drawFloaters(dt);

  if (fx.flash > 0) { ctx.fillStyle = `rgba(255,240,190,${fx.flash * 0.6})`; ctx.fillRect(0, 0, W, H); }
  if (opt.debug) {
    ctx.font = font(700, 20); ctx.textAlign = 'left';
    outlined(`${Math.round(fps)} fps · ws ${wsOk ? 'OK' : 'mất'} · người ${people.size} · p ${fx.particles.length}`, 20, 40, wsOk ? '#9f9' : '#f88', '#000', 4);
  }
  requestAnimationFrame(frame);
}

connect();
(document.fonts?.ready || Promise.resolve()).finally(() => requestAnimationFrame(frame));

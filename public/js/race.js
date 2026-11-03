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

const TIER_FX = {
  rose: { icon: '🌹', color: '#fb7185', parts: ['#fb7185', '#fda4af', '#f43f5e'], verb: 'tăng tốc' },
  heart: { icon: '💖', color: '#f472b6', parts: ['#f9a8d4', '#ec4899', '#fff'], verb: 'tăng tốc + hồi phục' },
  shield: { icon: '🛡️', color: '#38bdf8', parts: ['#7dd3fc', '#e0f2fe', '#38bdf8'], verb: 'bật khiên' },
  banana: { icon: '🍌', color: '#facc15', parts: ['#fde68a', '#fff'], verb: 'ném chuối' },
  bomb: { icon: '💣', color: '#fb923c', parts: ['#fde68a', '#fb923c'], verb: 'ném bom' },
  rocket: { icon: '🚀', color: '#f97316', parts: ['#fde047', '#f97316', '#ef4444'], verb: 'SIÊU TỐC' },
};

/** Chướng ngại vật bay tới mục tiêu rồi nổ / làm trượt chân. */
function impact(pr) {
  const r = racerById(pr.targetId);
  if (!r) return;
  const { x, y, s } = racerXY(r);
  if (pr.blocked === 'shield') { // khiên vỡ tan, con vật không sao
    fx.shake = Math.max(fx.shake, 0.5);
    burst(x, y - 20 * s, 40, { speed: 420 * s, color: ['#7dd3fc', '#e0f2fe', '#38bdf8', '#fff'], size: 11 * s, g: 500, decay: 1.2, kind: 'rock' });
    fx.rings = (fx.rings || []).concat({ x, y: y + 10 * s, s, t0: nowS(), color: '#7dd3fc' });
    floater('🛡️ CHẶN ĐƯỢC!', x, y - 120 * s, '#7dd3fc', 44);
    sound.play('chime', { pitch: 2 }); sound.play('bell', { pitch: 1.5 });
    return;
  }
  if (pr.blocked === 'turbo') { // siêu tốc: vật bay trượt qua đầu
    floater('💨 NÉ ĐƯỢC!', x, y - 120 * s, '#fdba74', 44);
    burst(x + 60 * s, y - 40 * s, 10, { speed: 200 * s, color: '#fde68a', size: 8 * s, g: 600, decay: 1.4 });
    sound.play('chime', { pitch: 1.8 });
    return;
  }
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
      const q = proj(-0.2, laneU(e.racer.lane));
      if (e.bot) { floater(`🤖 ${e.racer.name} vào làn ${e.racer.lane}`, q.x, q.y - 40 * q.s, '#cbd5e1', 26); break; }
      sound.play('chime', { pitch: 0.9 + e.racer.lane * 0.08 });
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
      if (e.bots) queueAlert({ title: `🤖 THÊM ${e.bots} BOT CHO ĐỦ ${e.racers} CON`, sub: 'Thả tim, tặng quà cho con mình để vượt mặt bot!', prio: 8, dur: 3, color: '#cbd5e1' });
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
        const tf = TIER_FX[e.tier] || TIER_FX.rose;
        sound.play(e.diamonds >= 30 ? 'bell' : 'chime', { pitch: e.tier === 'rose' ? 1.4 : 1 });
        floater(`${tf.icon} +${fmt.format(e.amount)}`, x, y - 90 * s, tf.color, e.tier === 'rose' ? 34 : 40);
        // hạt theo mức quà: cánh hoa / tim / tia sáng
        const n = Math.min(40, 8 + (e.repeatCount || 1) * 3);
        burst(x, y - 30 * s, n, { speed: 240 * s, color: tf.parts, size: (e.tier === 'rose' ? 12 : 9) * s, g: e.tier === 'rose' ? 120 : 300, decay: 0.9, kind: e.tier === 'rose' ? 'petal' : 'spark' });
        if (e.tier === 'heart') burst(x, y - 40 * s, 6, { speed: 160 * s, color: '#ec4899', size: 30 * s, g: -120, decay: 0.8, kind: 'text', text: '💖' });
        // quà nhỏ (hoa / tim) chỉ hiện thông báo khi combo nhiều; quà lớn luôn hiện
        if (e.tier !== 'rose' || (e.repeatCount || 1) >= 5) queueAlert({
          user: e.by, color: tf.color, prio: Math.min(6, 2 + Math.log10(Math.max(1, e.diamonds))),
          title: `${clip(e.by?.name, 18)} ${tf.verb} cho ${r.animal?.emoji || ''} ${clip(r.name, 14)}`,
          sub: `${e.repeatCount > 1 ? e.repeatCount + ' × ' : ''}${e.giftName || 'Quà'} ${tf.icon} · phóng +${fmt.format(e.amount)}`,
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
    case 'race_aim': {
      const r = e.racer && (racerById(e.racer.id) || e.racer);
      fx.aims = (fx.aims || []).filter((a) => a.by !== e.by?.id).concat({ lane: e.lane, by: e.by?.id, t0: nowS() });
      if (r) { const { x, y, s } = racerXY(r); floater(`🎯 ${clip(e.by?.name, 12)} nhắm làn ${e.lane}`, x, y - 120 * s, '#f87171', 28); }
      sound.play('chime', { pitch: 1.9 });
      break;
    }
    case 'race_combo': {
      const r = racerById(e.racer.id) || e.racer;
      const { x, y, s } = racerXY(r);
      floater(`🌹 ×${e.roses} MƯA HOA!`, x, y - 150 * s, '#fb7185', 46);
      // mưa cánh hoa trên cả làn
      for (let i = 0; i < 60; i++) fx.parts.push({ x: x - 250 + Math.random() * 500, y: y - 300 - Math.random() * 200, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 120, g: 40, life: 1, decay: 0.5, size: 14 * s, color: ['#fb7185', '#fda4af', '#f43f5e'][i % 3], kind: 'petal', grow: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8 });
      sound.play('chime', { pitch: 1.6 }); sound.play('chime', { pitch: 2 });
      queueAlert({ user: e.by, color: '#fb7185', prio: 6, dur: 3.2, title: `🌹 MƯA HOA cho ${r.animal?.emoji || ''} ${clip(r.name, 14)}!`, sub: `Đủ ${e.roses} bông hồng · phóng thêm` });
      break;
    }
    case 'race_heal': {
      const r = racerById(e.racer.id) || e.racer;
      const { x, y, s } = racerXY(r);
      hits.delete(r.id);
      floater('💖 HỒI PHỤC!', x, y - 130 * s, '#f9a8d4', 44);
      burst(x, y - 30 * s, 30, { speed: 200 * s, color: ['#bbf7d0', '#f9a8d4', '#fff'], size: 10 * s, g: -200, decay: 1 });
      sound.play('levelup');
      break;
    }
    case 'race_shield': {
      const r = racerById(e.racer.id) || e.racer;
      const { x, y, s } = racerXY(r);
      floater(`🛡️ KHIÊN ${e.seconds}s`, x, y - 130 * s, '#7dd3fc', 40);
      fx.rings = (fx.rings || []).concat({ x, y: y - 20 * s, s, t0: nowS(), color: '#7dd3fc' });
      sound.play('bell', { pitch: 1.6 });
      break;
    }
    case 'race_turbo': {
      const r = racerById(e.racer.id) || e.racer;
      const { x, y, s } = racerXY(r);
      hits.delete(r.id);
      fx.flash = Math.max(fx.flash, 0.4); fx.shake = Math.max(fx.shake, 0.8);
      floater('🚀 SIÊU TỐC!', x, y - 140 * s, '#fdba74', 56);
      burst(x - 60 * s, y, 40, { speed: 500 * s, color: TIER_FX.rocket.parts, size: 12 * s, g: 0, angle: Math.PI, spread: 0.7, decay: 1.2 });
      sound.play('levelup'); sound.play('bell', { pitch: 0.8 });
      queueAlert({ user: e.by, color: '#f97316', prio: 9, dur: 5, title: `🚀 ${clip(e.by?.name, 16)} bật SIÊU TỐC!`, sub: `${r.animal?.emoji || ''} ${clip(r.name, 14)} phóng như tên lửa ${e.seconds}s · miễn nhiễm chướng ngại` });
      break;
    }
    case 'race_obstacle': {
      const from = racerById(e.from?.id) || e.from;
      const a = from?.lane ? racerXY(from) : { x: W / 2, y: TRACK_BOT + 100, s: 1 };
      fx.projectiles.push({ kind: e.kind, x0: a.x, y0: a.y - 40 * a.s, targetId: e.target.id, t0: nowS(), dur: e.kind === 'bomb' ? 0.9 : 0.7, seconds: e.seconds, blocked: e.blocked || null });
      sound.play('chime', { pitch: e.kind === 'bomb' ? 0.7 : 1.4 });
      const bomb = e.kind === 'bomb';
      queueAlert({
        user: e.byBot ? null : e.by, color: bomb ? '#fb923c' : '#facc15', prio: e.byBot ? (bomb ? 6 : 4) : bomb ? 8 : 7, dur: e.byBot ? 2.6 : 3.5,
        title: `${e.byBot ? '🤖 ' : ''}${bomb ? '💣' : '🍌'} ${clip(e.by?.name, 16)} ném ${bomb ? 'BOM' : 'chuối'}${e.aimed ? ` 🎯 làn ${e.target.lane}` : ''}!`,
        sub: e.blocked === 'shield' ? `${e.target.animal.emoji} ${clip(e.target.name, 16)} có khiên 🛡️ — chặn được!`
          : e.blocked === 'turbo' ? `${e.target.animal.emoji} ${clip(e.target.name, 16)} đang siêu tốc 🚀 — né được!`
          : bomb ? `${e.target.animal.emoji} ${clip(e.target.name, 16)} nổ tung, bị hất lùi · choáng ${e.seconds}s` : `${e.target.animal.emoji} ${clip(e.target.name, 16)} trượt ngã ${e.seconds}s`,
      });
      break;
    }
    case 'race_sprint':
      fx.flash = Math.max(fx.flash, 0.5); fx.shake = Math.max(fx.shake, 0.6);
      sound.play('bell'); sound.play('levelup');
      queueAlert({ title: '⚡ NƯỚC RÚT! ⚡', sub: `Chưa ai về đích — tất cả chạy nhanh gấp ${e.multiplier}, thả tim dồn dập nào!`, prio: 10, dur: 4, color: '#facc15' });
      break;
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
  // siêu tốc: lửa phụt sau đuôi
  if (r.turbo && running) {
    burst(g.x - 55 * s, g.y - 40 * s, 2, { speed: 260 * s, color: TIER_FX.rocket.parts, size: 16 * s, g: -40, angle: Math.PI, spread: 0.5, decay: 2.2, grow: -10 });
    trail.set(r.id, 1);
  }
  if (R.sprint && running) trail.set(r.id, Math.max(trail.get(r.id) || 0, 0.6));
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
  if (r.shielded) { // bong bóng khiên lung linh
    const cy2 = g.y - 50 * s - lift;
    ctx.save();
    const grd = ctx.createRadialGradient(g.x, cy2, 20 * s, g.x, cy2, 78 * s);
    grd.addColorStop(0, 'rgba(125,211,252,0)'); grd.addColorStop(0.8, 'rgba(125,211,252,.18)'); grd.addColorStop(1, 'rgba(186,230,253,.55)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(g.x, cy2, 78 * s, 70 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(224,242,254,${0.6 + 0.3 * Math.sin(t * 6)})`; ctx.lineWidth = 3 * s; ctx.stroke();
    ctx.beginPath(); ctx.arc(g.x - 30 * s, cy2 - 34 * s, 10 * s, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill();
    ctx.restore();
  }
  if (r.finished) { ctx.font = font(900, Math.round(46 * s)); ctx.textAlign = 'center'; ctx.fillText('👑', g.x, g.y - 120 * s); }

  // thẻ tên phía trên đầu
  const ty = g.y - (stunned ? 150 : 128) * s - lift;
  ctx.font = font(800, Math.round(22 * s));
  const label = (r.bot ? '🤖 ' : '') + clip(r.name, 12);
  const tw = Math.min(240 * s, ctx.measureText(label).width + 60 * s);
  ctx.globalAlpha = 0.93;
  rr(g.x - tw / 2, ty - 19 * s, tw, 38 * s, 19 * s); ctx.fillStyle = 'rgba(10,14,40,.85)'; ctx.fill();
  ctx.strokeStyle = r.animal.color; ctx.lineWidth = 3 * s; ctx.stroke();
  ctx.globalAlpha = 1;
  if (!r.bot) avatar(r, g.x - tw / 2 + 19 * s, ty, 15 * s, r.animal.color);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(fitText(label, tw - 48 * s), g.x - tw / 2 + 40 * s, ty + 1);
  if (r.supporters || r.diamonds || r.roses) {
    ctx.font = font(800, Math.round(17 * s)); ctx.textAlign = 'center';
    outlined([r.supporters && '📣' + r.supporters, r.roses && '🌹' + r.roses, r.diamonds && '💎' + r.diamonds].filter(Boolean).join(' · '), g.x, ty - 30 * s, '#fde68a', 'rgba(0,0,0,.85)', 4);
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
      ctx.fillText(`Trống — comment "${R.joinWord}" (hết giờ: bot)`, q.x, q.y);
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
    if (q.kind === 'petal') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.beginPath(); ctx.ellipse(0, 0, q.size / 2, q.size / 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    else if (q.kind === 'text') { ctx.font = `${Math.round(q.size)}px 'Noto Color Emoji', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(q.text, q.x, q.y); }
    else if (q.kind === 'rock') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.5, q.size / 2), 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
  fx.parts = fx.parts.filter((q) => q.life > 0);

  // tâm ngắm 🎯 trên con bị nhắm (3 giây sau khi comment "ném N")
  fx.aims = (fx.aims || []).filter((a) => tn - a.t0 < 3);
  for (const a of fx.aims) {
    const r = R.racers.find((x) => x.lane === a.lane);
    if (!r) continue;
    const { x, y, s } = racerXY(r);
    const k = tn - a.t0, rad = (70 - Math.min(1, k * 3) * 20) * s;
    ctx.save(); ctx.globalAlpha = Math.min(1, (3 - k) * 2);
    ctx.translate(x, y - 20 * s); ctx.rotate(k * 2);
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 5 * s;
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(rad - 16 * s, 0); ctx.lineTo(rad + 16 * s, 0); ctx.stroke(); }
    ctx.restore();
  }
  for (const ring of fx.rings || []) {
    const k = (tn - ring.t0) / 0.6;
    if (k > 1) continue;
    ctx.save(); ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = ring.color || '#fff7d6'; ctx.lineWidth = 10 * (1 - k) + 2;
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
    : R.phase === 'lobby' ? `⏳ Xuất phát sau ${R.remaining}s`
    : R.phase === 'countdown' ? '🚦 Chuẩn bị!'
    : R.phase === 'racing' ? (R.sprint ? '⚡ NƯỚC RÚT!' : `⏱ ${m}:${s} tới nước rút`)
    : `Vòng mới sau ${R.remaining}s`;
  ctx.font = font(800, 30);
  const urgent = !R.paused && R.phase === 'racing' && (R.sprint || R.remaining <= 10);
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
    ctx.fillText(left > 0 ? `Còn ${left}/${R.maxRacers} chỗ · hết giờ sẽ thêm bot cho đủ ${R.maxRacers} con` : `Comment "${R.joinWord}" để đăng ký vòng sau${R.queueCount ? ` · đã có ${R.queueCount} người chờ` : ''}`, W / 2, y + 80);
  } else {
    ctx.font = font(800, 30); ctx.fillStyle = '#fff';
    ctx.fillText('🏇 Người đua: THẢ TIM / TẶNG QUÀ để con mình chạy', W / 2, y + 34);
    ctx.font = font(700, 26); ctx.fillStyle = '#fde68a';
    ctx.fillText(fitText(`📣 Khán giả: gõ số làn (1–${R.maxRacers}) chọn con cổ vũ — tim, quà tính cho con đó${R.queueCount ? ` · ${R.queueCount} người chờ` : ''}`, W - 120), W / 2, y + 76);
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

// ---------------- mẹo xoay vòng ----------------
const TIP_SECONDS = 6;
const tipState = { idx: 0, at: 0, key: '' };

function tipList() {
  const tier = Object.fromEntries((R.giftTiers || []).map((t) => [t.id, t.min]));
  const ok = R.joinWord || 'OK';
  const join = [
    { icon: '💬', text: `Comment "${ok}" để nhận một con vật và một làn đua — mỗi vòng tối đa ${R.maxRacers} người`, color: '#facc15' },
    { icon: '📝', text: `Hết chỗ hoặc đang đua? Comment "${ok}" để GIỮ CHỖ vòng sau, vòng mới được vào trước`, color: '#a5b4fc' },
    { icon: '📣', text: `Không đua? Gõ SỐ LÀN (1–${R.maxRacers}) hoặc tên con vật để cổ vũ — tim và quà của bạn tính cho con đó`, color: '#93c5fd' },
  ];
  const play = [
    { icon: '❤️', text: 'THẢ TIM liên tục để con mình chạy — thả càng nhiều, chạy càng nhanh!', color: '#fb7185' },
    { icon: '🤖', text: `Thiếu người thì BOT vào đua cho đủ ${R.maxRacers} con — comment "${R.joinWord}" để giành chỗ của bot!`, color: '#cbd5e1' },
    { icon: '🌹', text: `1 bông hồng = tăng tốc · đủ ${R.roseCombo || 10} bông cho cùng con = MƯA HOA phóng xa`, color: '#fb7185' },
    tier.heart && { icon: '💖', text: `Bị chuối / bom làm choáng? Tặng quà ${tier.heart} xu để HỒI PHỤC ngay`, color: '#f9a8d4' },
    tier.shield && { icon: '🛡️', text: `Đang dẫn đầu? Tặng ${tier.shield} xu bật KHIÊN 20 giây, chặn được chuối và bom`, color: '#7dd3fc' },
    tier.banana && { icon: '🍌', text: `Tặng ${tier.banana} xu NÉM CHUỐI vào con đang dẫn đầu (không bao giờ trúng con mình)`, color: '#facc15' },
    tier.banana && { icon: '🎯', text: `CHỌN MỤC TIÊU: comment "ném 3" (hoặc "chuối 3", "bom 3") rồi tặng chuối / bom → bay vào con làn 3`, color: '#f87171' },
    tier.bomb && { icon: '💣', text: `Tặng ${tier.bomb} xu NÉM BOM: con dẫn đầu nổ tung, bị đẩy lùi và choáng`, color: '#fb923c' },
    tier.rocket && { icon: '🚀', text: `Tặng ${tier.rocket} xu SIÊU TỐC: nhanh gấp đôi và né mọi chuối, bom`, color: '#fdba74' },
    { icon: '🏆', text: `Chạm vạch đích đầu tiên là thắng · sau ${R.raceSeconds} giây chưa ai về thì ⚡ NƯỚC RÚT: tất cả chạy gấp 3`, color: '#fde68a' },
    { icon: '🔁', text: 'Chia sẻ live hoặc theo dõi kênh cũng đẩy con của bạn lên một đoạn dài!', color: '#86efac' },
  ].filter(Boolean);
  const custom = (R.tips || []).map((t) => ({ icon: '💡', text: String(t), color: '#fff' }));
  if (R.phase === 'lobby' || R.phase === 'ended') {
    // lúc chờ: xen kẽ mẹo tham gia với mẹo chơi
    const out = [];
    play.concat(custom).forEach((t, i) => { out.push(join[i % join.length], t); });
    return out;
  }
  return [...play, join[1], join[2], ...custom];
}

/** Chia chữ thành tối đa 2 dòng vừa bề ngang. */
function wrap2(text, maxW) {
  const words = text.split(' ');
  let a = '';
  for (let i = 0; i < words.length; i++) {
    const t = a ? a + ' ' + words[i] : words[i];
    if (ctx.measureText(t).width > maxW && a) return [a, fitText(words.slice(i).join(' '), maxW)];
    a = t;
  }
  return [a];
}

function drawTip(y) {
  const list = tipList();
  if (!list.length) return y;
  const now = performance.now() / 1000;
  const key = R.phase === 'racing' || R.phase === 'countdown' ? 'play' : 'join';
  if (key !== tipState.key) { tipState.key = key; tipState.idx = 0; tipState.at = now; } // đổi pha: bắt đầu lại từ đầu
  if (now - tipState.at > TIP_SECONDS) { tipState.idx = (tipState.idx + 1) % list.length; tipState.at = now; }
  const tip = list[tipState.idx % list.length];
  const age = now - tipState.at;
  const k = Math.min(ease(age / 0.4), ease((TIP_SECONDS - age) / 0.4)); // trượt vào / mờ ra
  const h = 104, x = 40, w = W - 80;
  ctx.save();
  rr(x, y, w, h, 26); ctx.fillStyle = 'rgba(10,14,40,.86)'; ctx.fill();
  ctx.strokeStyle = tip.color; ctx.lineWidth = 3; ctx.stroke();
  // nhãn MẸO + thanh thời gian
  ctx.font = font(900, 18); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  rr(x + 18, y - 14, 92, 28, 14); ctx.fillStyle = tip.color; ctx.fill();
  ctx.fillStyle = '#111827'; ctx.fillText('💡 MẸO', x + 30, y + 1);
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 26, y + h - 10, w - 52, 4);
  ctx.fillStyle = tip.color; ctx.fillRect(x + 26, y + h - 10, (w - 52) * Math.min(1, age / TIP_SECONDS), 4);
  // nội dung
  ctx.globalAlpha = k;
  ctx.translate((1 - k) * 40, 0);
  ctx.fillStyle = '#000';
  ctx.font = `52px 'Noto Color Emoji', 'Apple Color Emoji', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(tip.icon, x + 56, y + h / 2 - 2);
  ctx.font = font(800, 27); ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
  const lines = wrap2(tip.text, w - 130);
  lines.forEach((ln, i) => ctx.fillText(ln, x + 100, y + h / 2 - 2 + (i - (lines.length - 1) / 2) * 34));
  // chấm vị trí
  ctx.restore();
  ctx.save();
  const n = Math.min(list.length, 14), dx = 14;
  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.arc(x + w - 30 - (n - 1 - i) * dx, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = i === tipState.idx % n ? tip.color : 'rgba(255,255,255,.35)'; ctx.fill();
  }
  ctx.restore();
  return y + h + 26;
}

function drawGuide() {
  ctx.save();
  let y = drawTip(TRACK_BOT + 66) + 18;
  // bảng mức quà: mỗi mức một tác dụng
  const tiers = R.giftTiers || [];
  if (tiers.length) {
    const pw = W - 80, ph = 44 + Math.ceil(tiers.length / 2) * 50, px = 40, py = y - 18;
    rr(px, py, pw, ph, 24); ctx.fillStyle = 'rgba(10,14,40,.82)'; ctx.fill();
    ctx.strokeStyle = 'rgba(250,204,21,.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = font(900, 24); ctx.fillStyle = '#fde68a'; ctx.textAlign = 'center';
    ctx.fillText('🎁 TẶNG QUÀ — MỖI MỨC MỘT TÁC DỤNG', W / 2, py + 24);
    tiers.forEach((tr, i) => {
      const cx = px + 16 + (i % 2) * (pw / 2), cy = py + 70 + Math.floor(i / 2) * 50;
      const tf = TIER_FX[tr.id] || {};
      rr(cx, cy - 20, pw / 2 - 24, 42, 21); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill();
      ctx.font = font(900, 22); ctx.textAlign = 'left'; ctx.fillStyle = tf.color || '#fff';
      const head = `${tr.icon} ${tr.min} xu`;
      ctx.fillText(head, cx + 12, cy + 1);
      const hw = ctx.measureText(head).width;
      ctx.font = font(700, 19); ctx.fillStyle = '#e5e7eb';
      ctx.fillText(fitText(tr.label, pw / 2 - 60 - hw), cx + 22 + hw, cy + 1);
    });
    y = py + ph + 30;
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
  ctx.translate(W / 2, 1700);
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

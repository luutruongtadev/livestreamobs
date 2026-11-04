// Đấu Trường Thần Thú cho TikTok Live (canvas 1080×1920).
// Server mô phỏng trận (server/arena.js), gửi vị trí 10 lần / giây; trang này chỉ vẽ + hiệu ứng.
// ?mute=1  ?debug=1  ?phone=1|0
import { SoundBoard } from './sound.js';
import { RARITIES, RARITY_ORDER, CARD_BY_ID, SKILLS, stars } from './cards-data.js';
import { drawCard, CARD_W, CARD_H } from './cardart.js';

const W = 1080, H = 1920;
const qs = new URLSearchParams(location.search);
const opt = {
  mute: qs.get('mute') === '1',
  debug: qs.get('debug') === '1',
  phone: qs.get('phone') === '1' || (qs.get('phone') !== '0' && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches),
};
if (opt.phone) document.body.classList.add('phone');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = W * s + 'px';
  canvas.style.height = H * s + 'px';
}
addEventListener('resize', fit);
fit();

let A = null; // snapshot
let wsOk = false;
let sound = new SoundBoard({ muted: opt.mute, theme: 'game' });
const roster = new Map(); // i -> con trên sân (vị trí hiển thị nội suy)
let roundSeen = 0;
let zoneDisp = 470, zoneTarget = 470;
let tornados = [];
const cam = { s: 1, x: 540, y: 1010 };

// ---------------- tiện ích ----------------
const DISPLAY = "'Bungee', 'Be Vietnam Pro', system-ui, sans-serif";
const font = (w, s, display = false) => display ? `400 ${s}px ${DISPLAY}` : `${w} ${s}px 'Be Vietnam Pro', system-ui, sans-serif`;
const EMOJI_FONT = "'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif";
const clip = (t, n) => { const a = [...String(t || '')]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
function fitText(text, maxW) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function outlined(text, x, y, fill = '#fff', stroke = 'rgba(0,0,0,.85)', lw = 6) {
  ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeBack = (t) => { t = clamp01(t); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rarOf = (card) => RARITIES[card?.rar || CARD_BY_ID[card?.card || card?.id]?.rar || 'C'];
const defOf = (card) => CARD_BY_ID[card?.id || card?.card];

// emoji vẽ sẵn ra canvas phụ (100 con × 60 khung hình / giây mà fillText emoji thì rất nặng)
const sprites = new Map();
function sprite(e) {
  let c = sprites.get(e);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.font = `104px ${EMOJI_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000';
    x.fillText(e, 64, 70);
    sprites.set(e, c);
  }
  return c;
}
function emoji(e, x, y, size, flip = false) {
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sprite(e), -size / 2, -size / 2, size, size);
  ctx.restore();
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
const fx = {
  parts: [], rings: [], floats: [], trails: [], bolts: [], bombs: [], ghosts: [], hearts: [], auras: [],
  feed: [], toasts: [], alerts: [], shake: 0, flash: 0, flashColor: '255,255,255',
  win: null, final: null, shows: [], banner: null, joinsRecent: [],
  s: { parts: [], rings: [], bolts: [] }, // lớp màn hình (mở rương, pháo giấy) — không theo camera
};
const MAX_PARTS = reduced ? 200 : 700;
function burst(x, y, n, colors, spd = 420, size = 10, g = 500, life = 1, L = fx) {
  n = reduced ? Math.ceil(n / 3) : n;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = spd * (0.25 + Math.random() * 0.85);
    L.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g, life, max: life, size: size * (0.5 + Math.random() * 0.9), color: pick(colors) });
  }
  if (L.parts.length > MAX_PARTS) L.parts.splice(0, L.parts.length - MAX_PARTS);
}
function ring(x, y, color, r0 = 30, r1 = 260, dur = 0.6, lw = 12, L = fx) { L.rings.push({ x, y, color, r0, r1, dur, lw, t: 0 }); }
function float(text, x, y, color = '#fff', size = 32, dur = 1.1) { if (fx.floats.length > 40) fx.floats.shift(); fx.floats.push({ text, x, y, color, size, t: 0, dur }); }
function shake(v) { if (!reduced) fx.shake = Math.max(fx.shake, v); }
function flash(v, color = '255,255,255') { fx.flash = Math.max(fx.flash, reduced ? v * 0.3 : v); fx.flashColor = color; }
function alert(title, sub, color = '#f5c542', dur = 2.6, icon = '') { fx.alerts.push({ title, sub, color, dur, icon, t: 0 }); if (fx.alerts.length > 4) fx.alerts.shift(); }
function feed(text, color = '#efe9f7') { fx.feed.unshift({ text, color, t: 0 }); fx.feed.length = Math.min(fx.feed.length, 6); }
function toast(text, color = '#fde68a', icon = '') { fx.toasts.unshift({ text, color, icon, t: 0 }); fx.toasts.length = Math.min(fx.toasts.length, 5); }
function bolt(x0, y0, x1, y1, color = '#e0f2ff', dur = 0.35, L = fx) {
  const pts = [[x0, y0]]; const n = 9;
  for (let i = 1; i < n; i++) { const k = i / n; pts.push([lerp(x0, x1, k) + (Math.random() - 0.5) * 70, lerp(y0, y1, k) + (Math.random() - 0.5) * 30]); }
  pts.push([x1, y1]);
  L.bolts.push({ pts, color, t: 0, dur });
}

const F = (i) => roster.get(i);
const posOf = (i) => { const f = F(i); return f && f.x != null ? { x: f.x, y: f.y } : null; };
const nameOf = (i) => F(i)?.name || '?';
const sizeOf = (f) => RARITIES[f.card?.rar || 'C'].size * (A?.scale || 1) * (f.flags & 2 ? 1.6 : 1);

// ---------------- màn mở rương ----------------
const reveals = []; // toàn màn hình (Sử thi trở lên, rương vô địch)
let rv = null;
const minis = []; // thẻ Thường / Hiếm: hiện góc phải, không che trận
let miniWait = [];
function queueChest(e) {
  const rar = e.card.rar || CARD_BY_ID[e.card.card].rar;
  const rank = RARITIES[rar].rank;
  const full = rank >= 2 || e.reason === 'win' || e.reason === 'admin';
  if (full) reveals.push({ ...e, rar, rank, t: e.reason === 'win' ? -3.2 : 0 });
  else miniWait.push({ ...e, rar, rank, t: 0 });
}
function revealTimes(r) {
  // Sử thi ~5 giây, Huyền thoại ~7,5 giây, Thần thoại ~9 giây; nhiều rương chờ thì rút ngắn
  const charge = 1.0 + 0.5 * r.rank;
  const rise = 1.3;
  const hold = [1.8, 1.8, 2.0, 3.6, 4.4][r.rank] * (reveals.length > 2 ? 0.6 : 1);
  return { charge, burst: charge, riseEnd: charge + rise, end: charge + rise + hold, fade: 0.5 };
}

// ---------------- sự kiện ----------------
const SKILL_SHOUT = { fire: 'LONG HỎA!', stomp: 'DẬM ĐẤT!', roar: 'GẦM!' };
function killText(e) {
  const v = nameOf(e.v);
  const k = e.k != null ? nameOf(e.k) : null;
  if (e.cause === 'zone') return [`☠️ ${clip(v, 12)} bị vòng độc nuốt`, '#c084fc'];
  if (e.cause === 'ghost') return [`👻 ${clip(v, 12)} bị hồn ma báo thù`, '#c4b5fd'];
  if (e.cause === 'bomb') return [`💣 ${k ? clip(k, 10) + ' nổ tung' : 'Bom nổ tung'} ${clip(v, 10)}`, '#fb923c'];
  if (e.cause === 'tornado') return [`🌪️ ${clip(k, 10)} cuốn bay ${clip(v, 10)}`, '#5eead4'];
  if (e.cause === 'skill') { const sk = SKILLS[F(e.k)?.skill]; return [`${sk?.icon || '✨'} ${clip(k, 10)} ${sk ? sk.name.toLowerCase() : ''} hạ ${clip(v, 10)}`, '#fde68a']; }
  return [`💀 ${clip(k || '?', 11)} hạ gục ${clip(v, 11)}`, '#efe9f7'];
}

function handle(e) {
  switch (e.type) {
    case 'arena_lobby':
      roster.clear(); roundSeen = e.round; fx.win = null; fx.final = null; fx.joinsRecent = [];
      cam.s = 1; cam.x = 540; cam.y = 1010;
      sound.play('bell');
      break;
    case 'arena_join': {
      const f = e.f;
      const r = roster.get(f.i) || { x: null, y: null, hp: 100, flags: 0, alive: true, kills: 0 };
      Object.assign(r, f, { joinedAt: performance.now() / 1000 });
      roster.set(f.i, r);
      if (e.swap) { toast(`${clip(f.name, 14)} đổi sang ${defOf(f.card).emoji} ${defOf(f.card).name}`, rarOf(f.card).color, '🎴'); break; }
      if (!e.bot) {
        fx.joinsRecent.unshift({ f, t: 0 }); fx.joinsRecent.length = Math.min(fx.joinsRecent.length, 6);
        sound.play('mo');
        const R = rarOf(f.card);
        if (R.rank >= 3) {
          const d = defOf(f.card);
          alert(`${d.emoji} ${clip(f.name, 14).toUpperCase()} THẢ ${d.name.toUpperCase()}`, `${R.name} ${'★'.repeat(f.card.stars)} · ${SKILLS[d.skill].icon} ${SKILLS[d.skill].name}`, R.color, 3.2);
          r.entrance = 1.6; sound.play('gong'); shake(0.5);
        } else if (R.rank === 2) r.entrance = 1;
        if (e.starter) toast(`${clip(f.name, 14)} nhận thẻ khởi đầu ${defOf(f.card).emoji} ${defOf(f.card).name}`, '#cfd6e4', '🎁');
      }
      break;
    }
    case 'arena_full': alert('🔥 ĐẤU TRƯỜNG ĐÃ ĐẦY!', `Xuất phát sau ${e.startsIn} giây · người đến sau hẹn trận sau`, '#fb923c', 3); break;
    case 'arena_queue': if (e.position <= 3 || e.position % 10 === 0) toast(`${clip(e.by.name, 14)} hẹn trận sau (#${e.position})`, '#a5b4fc', '⏳'); break;
    case 'arena_go':
      alert('⚔️ CHIẾN!', `${e.count} thần thú · con cuối cùng sống sót thắng RƯƠNG VÀNG`, '#f5c542', 3);
      flash(0.5); shake(0.6); sound.play('roar'); sound.play('levelup');
      ring(540, 1010, '#f5c542', 50, 520, 0.9, 16);
      break;
    case 'arena_kill': {
      const v = F(e.v);
      if (v) { v.alive = false; v.deadAt = performance.now() / 1000; v.deathX = e.x; v.deathY = e.y; }
      const col = v ? rarOf(v.card).color : '#fff';
      burst(e.x, e.y, 22, [col, '#fff', '#9ca3af'], 360, 11, 400, 0.9);
      float('💀', e.x, e.y - 20, '#fff', 40, 1);
      const [text, c] = killText(e);
      feed(text, c);
      sound.play('hit');
      if (e.k != null) {
        const k = F(e.k);
        if (k) { k.kills = e.kills; }
        const nm = clip(nameOf(e.k), 14).toUpperCase();
        if (e.kills === 3) alert(`🔥 ${nm}: 3 MẠNG!`, 'Đang nóng tay', '#ff6a3d', 2);
        else if (e.kills === 5) alert(`⚡ ${nm}: 5 MẠNG!`, 'Không ai cản nổi?', '#facc15', 2.2);
        else if (e.kills === 8) alert(`👑 ${nm}: 8 MẠNG — BÁ CHỦ!`, 'Ném bom vào nó đi!', '#f5c542', 2.6);
        else if (e.kills >= 12 && e.kills % 4 === 0) alert(`☠️ ${nm}: ${e.kills} MẠNG — HỦY DIỆT!`, 'Cả đấu trường run sợ', '#ef4444', 2.6);
      }
      break;
    }
    case 'arena_left':
      alert(`CÒN ${e.left} CON!`, e.left <= 5 ? 'Vòng an toàn sắp khép lại' : 'Vòng an toàn đang thu hẹp', e.left <= 5 ? '#ff6a3d' : '#efe9f7', 2);
      sound.play('bell');
      break;
    case 'arena_sudden': alert('☠️ VÒNG ĐỘC CUỐI — TỬ CHIẾN!', 'Vòng an toàn khép hẳn, không còn chỗ trốn', '#ef4444', 3); flash(0.4, '160,40,200'); sound.play('thunder'); break;
    case 'arena_final': fx.final = { a: e.a, b: e.b, t: 0 }; sound.play('roar'); shake(0.4); break;
    case 'arena_skill': skillFx(e); break;
    case 'arena_bomb': {
      const from = e.from != null ? posOf(e.from) : null;
      fx.bombs.push({ from: from ? { ...from } : { x: 540 + (Math.random() - 0.5) * 600, y: 380 }, v: e.v, t: 0, dur: e.delay / 1000 });
      sound.play('whoosh');
      break;
    }
    case 'arena_boom':
      flash(0.45, '255,236,170'); shake(1.1);
      burst(e.x, e.y, 70, ['#fff3b0', '#facc15', '#fb923c', '#ef4444', '#57534e'], 680, 15, 300, 1.1);
      ring(e.x, e.y, '#fde68a', 30, e.r * 1.4, 0.55, 18); ring(e.x, e.y, '#fb923c', 20, e.r, 0.4, 10);
      float('💥 BÙM!', e.x, e.y - 80, '#fb923c', 60, 1.2);
      sound.play('boom');
      break;
    case 'arena_ghost': {
      const from = F(e.from), to = posOf(e.to);
      if (from && to) fx.ghosts.push({ x0: from.deathX ?? from.x, y0: from.deathY ?? from.y, to: e.to, t: 0, name: from.name });
      feed(`👻 ${clip(e.by.name, 12)} hiện hồn báo thù!`, '#c4b5fd');
      break;
    }
    case 'arena_revenge': {
      const p = posOf(e.to);
      if (p) { burst(p.x, p.y, 30, ['#c4b5fd', '#a78bfa', '#fff'], 320, 10); float('👻 BÁO THÙ!', p.x, p.y - 70, '#c4b5fd', 40); }
      sound.play('hit');
      break;
    }
    case 'arena_like': {
      const p = posOf(e.i);
      if (p && fx.hearts.length < 40) for (let k = 0; k < Math.min(3, Math.ceil(e.n / 5)); k++) fx.hearts.push({ x: p.x + (Math.random() - 0.5) * 40, y: p.y - 20, t: 0, dur: 1 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 40 });
      break;
    }
    case 'arena_gift': giftFx(e); break;
    case 'arena_chest': queueChest(e); break;
    case 'arena_win':
      fx.win = { ...e, t: 0 };
      if (e.winner) {
        const p = posOf(e.winner.i) || { x: 540, y: 1010 };
        burst(p.x, p.y, 160, ['#f5c542', '#fff', '#fde68a', '#ff6a3d'], 720, 13, 300, 1.4);
        ring(p.x, p.y, '#f5c542', 40, 600, 1.2, 20);
      }
      flash(0.6); shake(0.8); sound.play('levelup'); sound.play('roar');
      break;
    case 'arena_show': fx.shows.push({ ...e, t: 0 }); if (fx.shows.length > 3) fx.shows.splice(1, 1); break;
    case 'arena_pick':
      if (e.missing) toast(`${clip(e.by.name, 14)} chưa có thẻ ${CARD_BY_ID[e.missing].emoji} ${CARD_BY_ID[e.missing].name}`, '#fca5a5', '🎴');
      else if (e.missingIndex) toast(`${clip(e.by.name, 14)} chỉ có ${e.total} thẻ · comment "thẻ" để xem số`, '#fca5a5', '🎴');
      else toast(`${clip(e.by.name, 14)} chọn lá số ${e.card.n}: ${CARD_BY_ID[e.card.card].emoji} ${CARD_BY_ID[e.card.card].name} ${'★'.repeat(stars(e.card.q))}${e.nextRound ? ' (trận sau)' : ''}`, RARITIES[e.card.rar].color, '🎴');
      break;
  }
}

function skillFx(e) {
  const f = F(e.i);
  const sk = SKILLS[e.skill];
  const R = f ? rarOf(f.card) : RARITIES.C;
  const nm = f ? clip(f.name, 12) : '';
  // kỹ năng của thẻ Huyền thoại / Thần thoại: hô to trên màn hình
  if (R.rank >= 3 && (!fx.banner || fx.banner.t > 1.6)) fx.banner = { text: `${sk.icon} ${nm.toUpperCase()} · ${sk.name.toUpperCase()}!`, color: R.color, t: 0 };
  if (e.kind === 'dash') {
    fx.trails.push({ x0: e.x0, y0: e.y0, x1: e.x, y1: e.y, color: R.color, w: 26, t: 0, dur: 0.45 });
    burst(e.x, e.y, 16, [R.color, '#fff'], 320, 9, 200, 0.6);
    if (f) { f.x = e.x; f.y = e.y; }
    sound.play('whoosh');
  } else if (e.kind === 'aoe') {
    if (e.fx === 'fire') {
      ring(e.x, e.y, '#ff7a1a', 30, e.r, 0.5, 26); ring(e.x, e.y, '#fde047', 10, e.r * 0.8, 0.4, 14);
      for (let k = 0; k < (reduced ? 10 : 36); k++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * e.r;
        fx.parts.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, vx: (Math.random() - 0.5) * 60, vy: -120 - Math.random() * 160, g: -60, life: 0.8, max: 0.8, size: 14 + Math.random() * 16, color: pick(['#ff4d00', '#ff9a1f', '#ffd23f', '#fff1a8']) });
      }
      float('🔥 ' + (SKILL_SHOUT.fire), e.x, e.y - e.r * 0.5, '#ff9a1f', 40);
      shake(0.6); sound.play('boom');
    } else if (e.fx === 'stomp') {
      ring(e.x, e.y, '#d6b98c', 20, e.r * 1.2, 0.5, 20);
      burst(e.x, e.y, 26, ['#a8865a', '#d6b98c', '#6b5537'], 300, 12, 700, 0.8);
      float('🦶 ' + SKILL_SHOUT.stomp, e.x, e.y - 60, '#e7cfa2', 34);
      shake(0.5); sound.play('boom');
    } else if (e.fx === 'roar') {
      for (let k = 0; k < 3; k++) fx.rings.push({ x: e.x, y: e.y, color: '#fbbf24', r0: 20, r1: e.r * 1.1, dur: 0.6, lw: 8, t: -k * 0.12 });
      float('🦁 ' + SKILL_SHOUT.roar, e.x, e.y - 70, '#fbbf24', 40);
      sound.play('roar');
    }
  } else if (e.kind === 'frenzy') {
    fx.auras.push({ i: e.i, kind: 'storm', t: 0, dur: e.sec });
    float('⚡ CUỒNG PHONG!', e.x, e.y - 70, '#fef08a', 36);
    sound.play('whoosh');
  } else if (e.kind === 'thunder') {
    for (const [, x, y] of e.targets) { bolt(x + (Math.random() - 0.5) * 200, 380, x, y, '#dbeafe', 0.4); burst(x, y, 14, ['#bfdbfe', '#fff', '#60a5fa'], 300, 9, 200, 0.6); ring(x, y, '#93c5fd', 10, 90, 0.35, 8); }
    flash(0.35, '200,225,255'); shake(0.7); sound.play('thunder');
    float('🌩️ LÔI LONG!', e.x, e.y - 80, '#bfdbfe', 40);
  } else if (e.kind === 'charge') {
    fx.trails.push({ x0: e.x0, y0: e.y0, x1: e.x, y1: e.y, color: '#ff7a1a', w: 90, t: 0, dur: 0.8, fire: true });
    for (let k = 0; k < (reduced ? 10 : 40); k++) {
      const s = Math.random();
      fx.parts.push({ x: lerp(e.x0, e.x, s) + (Math.random() - 0.5) * 50, y: lerp(e.y0, e.y, s) + (Math.random() - 0.5) * 50, vx: (Math.random() - 0.5) * 80, vy: -100 - Math.random() * 120, g: -40, life: 0.9, max: 0.9, size: 12 + Math.random() * 14, color: pick(['#ff4d00', '#ff9a1f', '#ffd23f']) });
    }
    if (f) { f.x = e.x; f.y = e.y; }
    float('🐎 PHI NGỰA SẮT!', e.x, e.y - 80, '#ffb347', 40);
    shake(0.8); sound.play('whoosh'); sound.play('boom');
  } else if (e.kind === 'shell') {
    ring(e.x, e.y, '#fde047', 20, 140, 0.5, 14);
    float('🛡️ MAI THẦN!', e.x, e.y - 70, '#fde047', 38);
    sound.play('gong');
  } else if (e.kind === 'rebirth') {
    const fire = e.skill === 'phoenix';
    fx.auras.push({ i: e.i, kind: fire ? 'phoenix' : 'nine', t: 0, dur: 1.4, x: e.x, y: e.y });
    burst(e.x, e.y, 40, fire ? ['#ff4d00', '#ffd23f', '#fff'] : ['#fde68a', '#fff', '#f9a8d4'], 360, 12, -100, 1);
    float(fire ? '🔥 TÁI SINH!' : '🐾 CHÍN MẠNG!', e.x, e.y - 80, fire ? '#ff9a1f' : '#fde68a', 40);
    sound.play('chime');
  }
}

const GIFT_LABEL = { rose: 'hồi máu', shield: 'KHIÊN', revive: 'HỒI SINH', bomb: 'NÉM BOM', giant: 'KHỔNG LỒ', tornado: 'LỐC XOÁY' };
function giftFx(e) {
  const p = e.i != null ? posOf(e.i) : null;
  const who = clip(e.by.name, 14);
  const icon = { rose: '🌹', shield: '🛡️', revive: '💖', bomb: '💣', giant: '⚡', tornado: '🌪️' }[e.tier];
  toast(`${who}${e.count > 1 ? ' ×' + e.count : ''} → ${icon} ${GIFT_LABEL[e.tier]}${e.diamonds >= 10 ? ` · +${e.diamonds}🧩` : ''}`, '#fde68a', '🎁');
  if (e.revived && p) {
    burst(p.x, p.y, 40, ['#f9a8d4', '#fff', '#fb7185'], 300, 11, -80);
    fx.auras.push({ i: e.i, kind: 'revive', t: 0, dur: 1.2 });
    alert(`💖 ${who.toUpperCase()} HỒI SINH!`, 'Quay lại đấu trường', '#f472b6', 2.4);
    sound.play('chime');
  }
  if (!p) return;
  if (e.tier === 'rose') { float(`🌹 +${e.heal || 12}`, p.x, p.y - 50, '#fda4af', 28); }
  if (e.tier === 'shield') { ring(p.x, p.y, '#7dd3fc', 20, 110, 0.4, 10); float(`🛡️ KHIÊN ${e.seconds || 5}s`, p.x, p.y - 60, '#7dd3fc', 32); sound.play('chime'); }
  if (e.tier === 'revive' && e.healFull) { float('💖 ĐẦY MÁU', p.x, p.y - 60, '#f9a8d4', 32); sound.play('chime'); }
  if (e.tier === 'giant') {
    for (let k = 0; k < 3; k++) bolt(p.x + (Math.random() - 0.5) * 160, p.y - 400, p.x, p.y, '#fde047', 0.4);
    burst(p.x, p.y, 60, ['#fde047', '#f59e0b', '#fff'], 520, 13);
    alert(`⚡ ${who.toUpperCase()} HÓA KHỔNG LỒ!`, `To gấp 1,6 · đánh x2 trong ${e.seconds || 8} giây`, '#facc15', 2.6);
    flash(0.3, '255,240,160'); shake(0.8); sound.play('thunder');
  }
  if (e.tier === 'tornado') {
    alert(`🌪️ LỐC XOÁY CỦA ${who.toUpperCase()}!`, 'Cuốn bay mọi thứ xung quanh', '#5eead4', 3);
    shake(1); sound.play('whoosh'); sound.play('roar');
  }
}

// ---------------- mạng ----------------
function syncRoster(s) {
  if (s.round !== roundSeen) { roster.clear(); roundSeen = s.round; }
  const ids = new Set();
  for (const f of s.fighters) {
    ids.add(f.i);
    let r = roster.get(f.i);
    if (!r) { r = { x: null, y: null, hp: 100, flags: 0, alive: f.alive }; roster.set(f.i, r); }
    Object.assign(r, { i: f.i, id: f.id, name: f.name, avatar: f.avatar, bot: f.bot, card: f.card, skill: f.skill, max: f.max, kills: f.kills });
    if (!f.alive) r.alive = false;
  }
  for (const i of [...roster.keys()]) if (!ids.has(i)) roster.delete(i);
}

function onPositions(p) {
  zoneTarget = p.z;
  tornados = p.tw || [];
  const seen = new Set();
  const a = p.f;
  for (let k = 0; k < a.length; k += 5) {
    const f = roster.get(a[k]);
    if (!f) continue;
    seen.add(f.i);
    f.tx = a[k + 1]; f.ty = a[k + 2];
    const hp = a[k + 3];
    if (hp < (f.hp ?? 100) - 0.5) f.hitT = 0.14;
    f.hp = hp; f.flags = a[k + 4];
    if (f.x == null || !f.alive) { f.x = f.tx; f.y = f.ty; f.alive = true; }
    if (Math.abs(f.tx - f.x) > 1) f.face = f.tx > f.x;
  }
  if (A?.phase === 'fight') for (const f of roster.values()) if (f.alive && !seen.has(f.i)) f.alive = false;
}

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { wsOk = true; };
  ws.onclose = () => { wsOk = false; setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (m) => {
    let msg; try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.type === 'hello') {
      const first = !A;
      A = msg.arena; syncRoster(A); zoneTarget = zoneDisp = A.zone;
      if (first) { sound.init(); if (started) sound.resume(); setTimeout(() => { if (!opt.mute && !opt.phone && sound.suspended) soundBtn.style.display = 'block'; }, 800); }
    } else if (msg.type === 'arena') { A = msg.arena; syncRoster(A); }
    else if (msg.type === 'ap') onPositions(msg.p);
    else if (msg.type === 'arenafx') for (const e of msg.effects) { try { handle(e); } catch (err) { console.warn(err); } }
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

// ---------------- vẽ: sân đấu ----------------
let floorCv = null;
function floor() {
  if (floorCv) return floorCv;
  floorCv = document.createElement('canvas'); floorCv.width = W; floorCv.height = H;
  const c = floorCv.getContext('2d');
  const g = c.createRadialGradient(540, 1010, 60, 540, 1010, 1200);
  g.addColorStop(0, '#2b2236'); g.addColorStop(0.45, '#17121f'); g.addColorStop(1, '#07060b');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // nền đá sân tròn
  c.save(); c.beginPath(); c.arc(540, 1010, 480, 0, Math.PI * 2); c.clip();
  const sg = c.createRadialGradient(540, 1010, 20, 540, 1010, 480);
  sg.addColorStop(0, '#4a3b55'); sg.addColorStop(1, '#241c2c');
  c.fillStyle = sg; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3;
  for (let r = 80; r < 500; r += 78) { c.beginPath(); c.arc(540, 1010, r, 0, Math.PI * 2); c.stroke(); }
  for (let ring = 0; ring < 6; ring++) {
    const n = 8 + ring * 6, r0 = ring * 78 + 2, r1 = r0 + 78;
    for (let i = 0; i < n; i++) { const a = (i + (ring % 2) * 0.5) / n * Math.PI * 2; c.beginPath(); c.moveTo(540 + Math.cos(a) * r0, 1010 + Math.sin(a) * r0); c.lineTo(540 + Math.cos(a) * r1, 1010 + Math.sin(a) * r1); c.stroke(); }
  }
  // hoa văn vàng giữa sân
  c.strokeStyle = 'rgba(245,197,66,.16)'; c.lineWidth = 4;
  c.beginPath(); c.arc(540, 1010, 150, 0, Math.PI * 2); c.stroke();
  c.beginPath(); for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI * 2; const x = 540 + Math.cos(a) * 150, y = 1010 + Math.sin(a) * 150; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  c.restore();
  // tường sân + 8 cột đuốc
  c.lineWidth = 22; c.strokeStyle = '#3a2d44'; c.beginPath(); c.arc(540, 1010, 492, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 4; c.strokeStyle = 'rgba(245,197,66,.45)'; c.beginPath(); c.arc(540, 1010, 503, 0, Math.PI * 2); c.stroke();
  return floorCv;
}
function drawArena(t) {
  ctx.drawImage(floor(), 0, 0);
  // đuốc quanh sân
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = 540 + Math.cos(a) * 512, y = 1010 + Math.sin(a) * 512;
    const fl = 0.75 + 0.25 * Math.sin(t * 9 + i * 2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 90 * fl);
    g.addColorStop(0, 'rgba(255,170,60,.55)'); g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 100, y - 100, 200, 200);
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(x, y - 6, 7 * fl, 14 * fl, 0, 0, Math.PI * 2); ctx.fill();
  }
  // vùng độc ngoài vòng an toàn
  zoneDisp = lerp(zoneDisp, zoneTarget, 0.15);
  if (A?.phase === 'fight' && zoneDisp < 469) {
    ctx.save();
    ctx.beginPath(); ctx.rect(-600, -600, W + 1200, H + 1200); ctx.arc(540, 1010, Math.max(1, zoneDisp), 0, Math.PI * 2, true);
    ctx.fillStyle = A.sudden ? `rgba(170,20,60,${0.38 + 0.08 * Math.sin(t * 6)})` : `rgba(120,40,170,${0.3 + 0.06 * Math.sin(t * 3)})`;
    ctx.fill('evenodd');
    ctx.beginPath(); ctx.arc(540, 1010, Math.max(1, zoneDisp), 0, Math.PI * 2);
    ctx.strokeStyle = A.sudden ? '#f43f5e' : '#c084fc'; ctx.lineWidth = 7; ctx.setLineDash([26, 14]); ctx.lineDashOffset = -t * 50; ctx.stroke();
    ctx.restore();
  }
}

function drawFighter(f, t, opts) {
  if (!f.alive || f.x == null) return;
  const R = rarOf(f.card);
  const d = defOf(f.card);
  if (!d) return;
  const now = performance.now() / 1000;
  const spawnK = clamp01((now - (f.joinedAt || 0)) / 0.45);
  const size = sizeOf(f) * (0.4 + 0.6 * easeBack(spawnK));
  const x = f.x, y = f.y;
  const bob = Math.sin(t * 9 + f.i) * size * 0.04;
  // ra sân hoành tráng (Sử thi trở lên)
  if (f.entrance > 0) {
    const k = f.entrance;
    const g = ctx.createLinearGradient(x - size, 0, x + size, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, R.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = Math.min(1, k); ctx.fillStyle = g; ctx.fillRect(x - size, y - 900, size * 2, 900); ctx.globalAlpha = 1;
  }
  // bóng
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(x, y + size * 0.42, size * 0.42, size * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  // vòng độ hiếm dưới chân
  ctx.lineWidth = R.rank >= 2 ? 5 : 3; ctx.strokeStyle = R.color;
  ctx.beginPath(); ctx.ellipse(x, y + size * 0.38, size * 0.5, size * 0.17, 0, 0, Math.PI * 2); ctx.stroke();
  if (R.rank >= 3) {
    ctx.save(); ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 5 + f.i);
    const g = ctx.createRadialGradient(x, y, size * 0.2, x, y, size * 0.85);
    g.addColorStop(0, R.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, size * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (R.id === 'M') { ctx.save(); ctx.strokeStyle = `hsl(${(t * 160) % 360},100%,70%)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, size * 0.66, t * 3, t * 3 + Math.PI * 1.3); ctx.stroke(); ctx.restore(); }
  }
  // cuồng phong / độc
  if (f.flags & 16) { ctx.save(); ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 3; for (let k = 0; k < 3; k++) { const a = t * 14 + k * 2.1; ctx.beginPath(); ctx.arc(x, y, size * 0.62, a, a + 0.8); ctx.stroke(); } ctx.restore(); }
  const flip = f.face ?? false;
  emoji(d.emoji, x, y + bob, size, flip);
  if (f.hitT > 0) { ctx.fillStyle = `rgba(255,60,60,${f.hitT * 2.5})`; ctx.beginPath(); ctx.arc(x, y, size * 0.42, 0, Math.PI * 2); ctx.fill(); }
  if (f.flags & 32) { ctx.fillStyle = 'rgba(74,222,128,.25)'; ctx.beginPath(); ctx.arc(x, y, size * 0.45, 0, Math.PI * 2); ctx.fill(); }
  // khiên / mai thần
  if (f.flags & 1) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, size * 0.72, 0, Math.PI * 2); ctx.fillStyle = 'rgba(125,211,252,.16)'; ctx.fill(); ctx.strokeStyle = `rgba(224,242,254,${0.6 + 0.3 * Math.sin(t * 8)})`; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
  if (f.flags & 8) {
    ctx.save(); ctx.strokeStyle = '#fde047'; ctx.lineWidth = 4; ctx.fillStyle = 'rgba(253,224,71,.18)';
    ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + t; const px = x + Math.cos(a) * size * 0.75, py = y + Math.sin(a) * size * 0.75; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // choáng: sao quay
  if (f.flags & 4) { ctx.save(); ctx.font = `${Math.round(size * 0.28)}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; for (let k = 0; k < 3; k++) { const a = t * 6 + k * 2.1; ctx.fillText('⭐', x + Math.cos(a) * size * 0.35, y - size * 0.55 + Math.sin(a) * size * 0.1); } ctx.restore(); }
  // thanh máu + tên
  const bw = Math.max(44, size * 0.95), by = y - size * 0.62 - 10;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 9);
  const k = clamp01(f.hp / 100);
  ctx.fillStyle = k > 0.5 ? '#3ddc97' : k > 0.25 ? '#facc15' : '#ef4444'; ctx.fillRect(x - bw / 2, by, bw * k, 7);
  if (opts.label) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = font(800, opts.fontSize);
    outlined(clip(f.name, 11) + (f.kills ? ` · ${f.kills}💀` : ''), x, by - 3, R.rank >= 3 ? R.color : '#fff', 'rgba(0,0,0,.9)', 5);
  }
  if (opts.crown) { ctx.font = `${Math.round(size * 0.4)}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#000'; ctx.fillText('👑', x, by - (opts.label ? opts.fontSize + 2 : 2)); }
}

function drawFighters(t, dt) {
  const list = [];
  let alive = 0;
  for (const f of roster.values()) {
    if (f.tx != null) { const k = Math.min(1, dt * 12); f.x = lerp(f.x, f.tx, k); f.y = lerp(f.y, f.ty, k); }
    if (f.hitT > 0) f.hitT -= dt;
    if (f.entrance > 0) f.entrance -= dt;
    if (f.alive && f.x != null) { list.push(f); alive++; }
  }
  list.sort((a, b) => a.y - b.y);
  const now = performance.now() / 1000;
  let top = null;
  for (const f of list) if (f.kills > 0 && (!top || f.kills > top.kills)) top = f;
  const crowd = alive > 24;
  const fs = Math.round(Math.max(15, 22 * (A?.scale || 1)));
  // đông người: chỉ hiện tên 8 người vừa vào, thẻ Sử thi trở lên, người nhiều mạng
  const recent = new Set(crowd ? list.filter((f) => now - (f.joinedAt || 0) < 4).sort((a, b) => b.joinedAt - a.joinedAt).slice(0, 8) : []);
  for (const f of list) {
    const R = rarOf(f.card);
    const label = !crowd || f.kills >= 2 || R.rank >= 2 || recent.has(f) || f === top;
    drawFighter(f, t, { label, fontSize: fs, crown: f === top && f.kills >= 2 });
  }
}

function drawWorldFx(t, dt) {
  // vệt lao / phi ngựa
  for (const tr of fx.trails) {
    tr.t += dt; const a = 1 - tr.t / tr.dur; if (a <= 0) continue;
    ctx.save(); ctx.globalAlpha = a; ctx.lineCap = 'round';
    const g = ctx.createLinearGradient(tr.x0, tr.y0, tr.x1, tr.y1); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, tr.color);
    ctx.strokeStyle = g; ctx.lineWidth = tr.w * a; ctx.beginPath(); ctx.moveTo(tr.x0, tr.y0); ctx.lineTo(tr.x1, tr.y1); ctx.stroke();
    if (tr.fire) { ctx.strokeStyle = 'rgba(255,240,180,.8)'; ctx.lineWidth = tr.w * 0.3 * a; ctx.stroke(); }
    ctx.restore();
  }
  fx.trails = fx.trails.filter((tr) => tr.t < tr.dur);
  drawRings(fx, dt);
  // lốc xoáy (vị trí từ server)
  for (const [x, y] of tornados) {
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < 5; i++) { ctx.globalAlpha = 0.4 - i * 0.06; ctx.rotate(t * 7 + i); ctx.strokeStyle = i % 2 ? '#99f6e4' : '#5eead4'; ctx.lineWidth = 12 - i * 2; ctx.beginPath(); ctx.ellipse(0, 0, 250 - i * 40, 110 - i * 16, 0, 0, Math.PI * 1.6); ctx.stroke(); }
    ctx.restore();
    if (Math.random() < 0.5) fx.parts.push({ x: x + (Math.random() - 0.5) * 300, y: y + (Math.random() - 0.5) * 150, vx: (Math.random() - 0.5) * 300, vy: -100, g: 0, life: 0.6, max: 0.6, size: 6, color: '#ccfbf1' });
  }
  // bom bay
  for (const b of fx.bombs) {
    b.t += dt; const k = clamp01(b.t / b.dur);
    const to = posOf(b.v) || b.from;
    const x = lerp(b.from.x, to.x, k), y = lerp(b.from.y, to.y, k) - Math.sin(k * Math.PI) * 320;
    emoji('💣', x, y, 70 * (1 + Math.sin(k * Math.PI) * 0.3), false);
    if (k < 1 && Math.random() < 0.6) fx.parts.push({ x, y: y - 30, vx: (Math.random() - 0.5) * 40, vy: -40, g: 0, life: 0.4, max: 0.4, size: 7, color: '#fde68a' });
    if (to) { ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 20); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(to.x, to.y, 60 + 20 * (1 - k), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  }
  fx.bombs = fx.bombs.filter((b) => b.t < b.dur);
  // hồn ma
  for (const g of fx.ghosts) {
    g.t += dt; const k = clamp01(g.t / 0.8);
    const to = posOf(g.to) || { x: g.x0, y: g.y0 };
    ctx.save(); ctx.globalAlpha = 0.85;
    emoji('👻', lerp(g.x0, to.x, ease(k)), lerp(g.y0, to.y, ease(k)) - Math.sin(k * Math.PI) * 140, 70);
    ctx.restore();
  }
  fx.ghosts = fx.ghosts.filter((g) => g.t < 0.85);
  // hào quang tạm (hồi sinh, cuồng phong…)
  for (const au of fx.auras) {
    au.t += dt; const p = posOf(au.i) || au; if (!p) continue;
    const k = au.t / au.dur;
    if (au.kind === 'phoenix' || au.kind === 'revive' || au.kind === 'nine') {
      const col = au.kind === 'phoenix' ? '255,120,30' : au.kind === 'revive' ? '249,168,212' : '253,230,138';
      const g = ctx.createLinearGradient(p.x - 70, 0, p.x + 70, 0);
      g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},${0.6 * (1 - k)})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(p.x - 70, p.y - 600, 140, 640);
    }
  }
  fx.auras = fx.auras.filter((a) => a.t < a.dur);
  drawBolts(fx, dt);
  // tim bay
  for (const h of fx.hearts) { h.t += dt; ctx.globalAlpha = clamp01(1 - h.t / h.dur); emoji('❤️', h.x + h.vx * h.t, h.y - h.t * 90, 26); }
  ctx.globalAlpha = 1;
  fx.hearts = fx.hearts.filter((h) => h.t < h.dur);
}

function drawRings(L, dt) {
  for (const r of L.rings) {
    r.t += dt; if (r.t < 0) continue;
    const k = r.t / r.dur; if (k >= 1) continue;
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = r.lw * (1 - k) + 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r1, ease(k)), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  L.rings = L.rings.filter((r) => r.t < r.dur);
}
function drawBolts(L, dt) {
  for (const b of L.bolts) {
    b.t += dt; const a = 1 - b.t / b.dur; if (a <= 0) continue;
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = b.color; ctx.lineWidth = 7; ctx.shadowColor = '#93c5fd'; ctx.shadowBlur = 20; ctx.lineJoin = 'round';
    ctx.beginPath(); b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
  }
  L.bolts = L.bolts.filter((b) => b.t < b.dur);
}
function drawParticles(L, dt) {
  for (const p of L.parts) {
    p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985;
    ctx.globalAlpha = clamp01(p.life / p.max); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  L.parts = L.parts.filter((p) => p.life > 0);
}

function drawFloats(dt) {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of fx.floats) {
    f.t += dt; const k = f.t / f.dur;
    ctx.globalAlpha = clamp01((1 - k) * 2.5);
    const s = f.size * (k < 0.15 ? 0.6 + k / 0.15 * 0.4 : 1);
    ctx.font = font(900, Math.round(s));
    outlined(f.text, f.x, f.y - k * 70, f.color, 'rgba(0,0,0,.9)', 6);
  }
  ctx.restore();
  fx.floats = fx.floats.filter((f) => f.t < f.dur);
}

// ---------------- vẽ: HUD ----------------
function chip(text, x, y, h, bg = 'rgba(13,11,20,.8)', color = '#efe9f7', size = 24, center = true) {
  ctx.font = font(800, size);
  const w = ctx.measureText(text).width + 30;
  const x0 = center ? x - w / 2 : x;
  rr(x0, y - h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + w / 2, y + 1);
  return w;
}
function drawHeader(t) {
  rr(28, 232, W - 56, 90, 45);
  const g = ctx.createLinearGradient(0, 232, 0, 322); g.addColorStop(0, 'rgba(40,26,58,.92)'); g.addColorStop(1, 'rgba(15,11,22,.92)');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(245,197,66,.7)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = font(400, 34, true); ctx.fillStyle = '#f5c542';
  ctx.fillText('⚔ ĐẤU TRƯỜNG', 62, 270);
  ctx.font = font(700, 20); ctx.fillStyle = '#a69cb8'; ctx.fillText(`THẦN THÚ · TRẬN #${A.round}`, 64, 302);
  ctx.textAlign = 'right';
  if (A.phase === 'fight') {
    ctx.font = font(900, 42); ctx.fillStyle = '#fff';
    ctx.fillText(`🐾 ${A.alive}/${A.total}`, W - 64, 266);
    ctx.font = font(700, 20); ctx.fillStyle = A.sudden ? '#f87171' : '#a69cb8';
    const m = Math.floor(A.elapsed / 60), s = String(A.elapsed % 60).padStart(2, '0');
    ctx.fillText(A.sudden ? `☠️ TỬ CHIẾN · ${m}:${s}` : `còn sống · ${m}:${s}`, W - 66, 302);
  } else {
    const rem = A.remaining;
    const urgent = A.phase === 'lobby' && rem <= 10;
    ctx.font = font(900, 46); ctx.fillStyle = urgent ? `rgba(255,${120 + 100 * Math.sin(t * 8)},80,1)` : '#fff';
    ctx.fillText(`⏳ 0:${String(rem).padStart(2, '0')}`, W - 64, 268);
    ctx.font = font(700, 20); ctx.fillStyle = '#a69cb8';
    ctx.fillText(A.phase === 'lobby' ? 'bắt đầu sau' : 'trận mới sau', W - 66, 304);
  }
}

function drawLobbyPanel(t) {
  if (A.phase !== 'lobby') return;
  const y = 350;
  rr(60, y, W - 120, 178, 32);
  ctx.fillStyle = 'rgba(13,11,20,.86)'; ctx.fill();
  ctx.strokeStyle = `rgba(61,220,151,${0.6 + 0.4 * Math.sin(t * 4)})`; ctx.lineWidth = 4; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(900, 40); ctx.fillStyle = '#fff';
  const pre = '💬 Comment ', word = ` ${A.joinWord} `, post = ' để thả thần thú';
  const w1 = ctx.measureText(pre).width, w3 = ctx.measureText(post).width;
  ctx.font = font(400, 44, true); const w2 = ctx.measureText(word).width + 16;
  const x0 = W / 2 - (w1 + w2 + w3) / 2;
  ctx.font = font(900, 40); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(pre, x0, y + 52);
  rr(x0 + w1, y + 24, w2, 58, 16); ctx.fillStyle = '#3ddc97'; ctx.fill();
  ctx.font = font(400, 44, true); ctx.fillStyle = '#062b1c'; ctx.textAlign = 'center'; ctx.fillText(word.trim(), x0 + w1 + w2 / 2, y + 55);
  ctx.font = font(900, 40); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(post, x0 + w1 + w2, y + 52);
  // thanh số người
  const k = clamp01(A.humans / A.maxFighters);
  rr(110, y + 104, W - 220, 26, 13); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
  rr(110, y + 104, Math.max(26, (W - 220) * k), 26, 13);
  const g = ctx.createLinearGradient(110, 0, W - 110, 0); g.addColorStop(0, '#3ddc97'); g.addColorStop(1, '#f5c542'); ctx.fillStyle = g; ctx.fill();
  ctx.font = font(800, 24); ctx.fillStyle = '#e9e3f5'; ctx.textAlign = 'center';
  ctx.fillText(`${A.humans}/${A.maxFighters} người đã vào · người mới được tặng thẻ khởi đầu`, W / 2, y + 156);
}

function drawFeed() {
  if (A.phase !== 'fight' && A.phase !== 'ended') return;
  ctx.save(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  fx.feed.slice(0, 5).forEach((f, i) => {
    ctx.globalAlpha = clamp01((7 - f.t) / 1.5) * (1 - i * 0.1);
    ctx.font = font(800, 23);
    const text = fitText(f.text, 500);
    const w = ctx.measureText(text).width + 30;
    rr(W - 30 - w, 350 + i * 46, w, 40, 20); ctx.fillStyle = 'rgba(13,11,20,.82)'; ctx.fill();
    ctx.fillStyle = f.color; ctx.fillText(text, W - 45, 371 + i * 46);
  });
  ctx.restore();
}

function drawToasts() {
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const y0 = A.phase === 'lobby' ? 1500 : 350;
  const maxW = A.phase === 'lobby' ? W - 60 : 470;
  fx.toasts.slice(0, A.phase === 'lobby' ? 3 : 4).forEach((tt, i) => {
    ctx.globalAlpha = clamp01((5 - tt.t) / 1) * clamp01(tt.t * 5);
    ctx.font = font(800, 22);
    const text = fitText(`${tt.icon} ${tt.text}`, maxW - 30);
    const w = ctx.measureText(text).width + 28;
    rr(30, y0 + i * 44, w, 38, 19); ctx.fillStyle = 'rgba(13,11,20,.82)'; ctx.fill();
    ctx.strokeStyle = tt.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = tt.color; ctx.fillText(text, 44, y0 + 20 + i * 44);
  });
  ctx.restore();
}

function drawAlert() {
  const a = fx.alerts[fx.alerts.length - 1];
  if (!a || rv) return;
  const k = Math.min(1, a.t / 0.22, (a.dur - a.t) / 0.3);
  ctx.save(); ctx.globalAlpha = clamp01(k);
  ctx.translate(W / 2, 1545); const s = 0.85 + 0.15 * easeBack(a.t / 0.3); ctx.scale(s, s);
  rr(-490, -66, 980, 132, 30); ctx.fillStyle = 'rgba(13,11,20,.93)'; ctx.fill(); ctx.strokeStyle = a.color; ctx.lineWidth = 5; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(900, 40); ctx.fillStyle = a.color; ctx.fillText(fitText(a.title, 930), 0, -18);
  ctx.font = font(700, 25); ctx.fillStyle = '#efe9f7'; ctx.fillText(fitText(a.sub, 930), 0, 30);
  ctx.restore();
}

function drawBanner(dt) {
  const b = fx.banner; if (!b) return;
  b.t += dt; if (b.t > 2) { fx.banner = null; return; }
  const k = Math.min(1, b.t / 0.2, (2 - b.t) / 0.3);
  ctx.save(); ctx.globalAlpha = clamp01(k); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(400, 40, true);
  const text = fitText(b.text, 1000);
  outlined(text, W / 2 + (1 - clamp01(b.t / 0.2)) * 200, 640, b.color, '#000', 9);
  ctx.restore();
}

function drawBottom(t) {
  if (rv) return;
  // dưới sân: người nhiều mạng / nhà vô địch
  const showAlert = fx.alerts.length > 0;
  if (!showAlert) {
    ctx.save(); ctx.textBaseline = 'middle';
    if (A.phase === 'fight') {
      const top = [...roster.values()].filter((f) => f.kills > 0).sort((a, b) => b.kills - a.kills).slice(0, 3);
      if (top.length) {
        ctx.textAlign = 'center'; ctx.font = font(800, 21); ctx.fillStyle = '#a69cb8'; ctx.fillText('NHIỀU MẠNG NHẤT', W / 2, 1508);
        const cw = 320;
        top.forEach((f, i) => {
          const x = W / 2 + (i - (top.length - 1) / 2) * (cw + 10);
          rr(x - cw / 2, 1528, cw, 56, 28); ctx.fillStyle = 'rgba(13,11,20,.82)'; ctx.fill();
          ctx.font = font(800, 24); ctx.fillStyle = f.alive ? '#fff' : '#8b8398'; ctx.textAlign = 'center';
          ctx.fillText(fitText(`${['🥇', '🥈', '🥉'][i]} ${defOf(f.card).emoji} ${f.name} · ${f.kills}💀`, cw - 24), x, 1557);
        });
      }
    } else if (A.phase === 'lobby' && !fx.toasts.length && A.champions?.length) {
      ctx.textAlign = 'center'; ctx.font = font(800, 21); ctx.fillStyle = '#a69cb8'; ctx.fillText('🏆 VUA ĐẤU TRƯỜNG', W / 2, 1508);
      const list = A.champions.slice(0, 3); const cw = 320;
      list.forEach((c, i) => {
        const x = W / 2 + (i - (list.length - 1) / 2) * (cw + 10);
        rr(x - cw / 2, 1528, cw, 56, 28); ctx.fillStyle = 'rgba(13,11,20,.82)'; ctx.fill();
        const e = c.best ? CARD_BY_ID[c.best.card]?.emoji : '';
        ctx.font = font(800, 23); ctx.fillStyle = i === 0 ? '#f5c542' : '#efe9f7';
        ctx.fillText(fitText(`${['👑', '🥈', '🥉'][i]} ${c.name} ${e} · ${c.wins} thắng`, cw - 24), x, 1557);
      });
    }
    ctx.restore();
  }
  // mẹo xoay vòng
  const tips = [
    '❤️ Thả tim = hồi máu cho thần thú của bạn',
    `🧩 Mỗi xu = 1 mảnh · đủ ${A.chestEvery} mảnh tự MỞ RƯƠNG THẺ`,
    '🏆 Sống sót cuối cùng = RƯƠNG VÀNG (không ra thẻ Thường)',
    '💬 Comment "thẻ" để khoe bộ sưu tập của bạn',
    '💬 "thẻ" xem kho đánh số · "vào 2" thả lá số 2 ra trận',
    '💬 "vào rồng", "vào rùa", "dùng hổ" = chọn loài ra trận',
    '👻 Bị hạ? Comment "báo thù" — hồn ma cắn kẻ hạ bạn',
    '💖 Bị hạ rồi? Tặng 10 xu là HỒI SINH ngay',
    '⭐ Thẻ hiếm + phẩm chất cao = mạnh hơn · có kỹ năng riêng',
    `🌐 Xem kho thẻ của bạn: ${location.host}/thebai`,
  ];
  const i = Math.floor(t / 5) % tips.length;
  const ph = (t % 5) / 5;
  ctx.save(); ctx.globalAlpha = Math.min(1, ph * 8, (1 - ph) * 8);
  chip('💡 ' + tips[i], W / 2, 1626, 50, 'rgba(40,26,58,.88)', '#fde68a', 24);
  ctx.restore();
  // các mức quà
  ctx.save();
  const tiers = A.tiers || [];
  const rows = [tiers.slice(0, 4), tiers.slice(4)];
  rows.forEach((row, ri) => {
    ctx.font = font(800, 22);
    const items = row.map((tt) => `${tt.icon} ${tt.min ? tt.min + ' xu ' : ''}${tt.label}`);
    const ws = items.map((s) => ctx.measureText(s).width + 26);
    const tot = ws.reduce((a, b) => a + b, 0) + 8 * (ws.length - 1);
    let x = (W - tot) / 2;
    items.forEach((s, k) => { chip(s, x, 1690 + ri * 50, 42, 'rgba(13,11,20,.78)', '#efe9f7', 22, false); x += ws[k] + 8; });
  });
  ctx.restore();
}

function drawJoinsList() {
  if (A.phase !== 'lobby' || !fx.joinsRecent.length) return;
  ctx.save();
  const list = fx.joinsRecent.slice(0, 4);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const cw = 240, y = 1440;
  list.forEach((j, i) => {
    const x = W / 2 + (i - (list.length - 1) / 2) * (cw + 10);
    ctx.globalAlpha = clamp01(j.t * 4) * clamp01((8 - j.t) / 1);
    const R = rarOf(j.f.card);
    rr(x - cw / 2, y - 24, cw, 48, 24); ctx.fillStyle = 'rgba(13,11,20,.85)'; ctx.fill(); ctx.strokeStyle = R.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = font(800, 21); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(`${defOf(j.f.card).emoji} ${j.f.name} vào sân`, cw - 20), x, y + 1);
  });
  ctx.restore();
}

function drawFinal(dt) {
  const f = fx.final; if (!f) return;
  f.t += dt; if (f.t > 3.2) { fx.final = null; return; }
  const k = Math.min(1, f.t / 0.25, (3.2 - f.t) / 0.4);
  ctx.save(); ctx.globalAlpha = clamp01(k);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(400, 62, true); outlined('⚔ CHUNG KẾT ⚔', W / 2, 470, '#f5c542', '#000', 10);
  const side = (p, x, dir) => {
    const R = rarOf(p.card), d = defOf(p.card);
    const off = (1 - ease(f.t / 0.4)) * 500 * dir;
    rr(x - 220 + off, 520, 440, 110, 26); ctx.fillStyle = 'rgba(13,11,20,.9)'; ctx.fill(); ctx.strokeStyle = R.color; ctx.lineWidth = 4; ctx.stroke();
    emoji(d.emoji, x - 160 + off, 575, 80, dir > 0);
    ctx.textAlign = 'left'; ctx.font = font(900, 30); ctx.fillStyle = '#fff'; ctx.fillText(fitText(p.name, 290), x - 105 + off, 556);
    ctx.font = font(700, 22); ctx.fillStyle = R.color; ctx.fillText(fitText(`${d.name} ${'★'.repeat(p.card.stars)}`, 290), x - 105 + off, 596);
  };
  side(f.a, 290, -1); side(f.b, W - 290, 1);
  ctx.textAlign = 'center'; ctx.font = font(400, 54, true); outlined('VS', W / 2, 575, '#ff6a3d', '#000', 9);
  ctx.restore();
}

// Nhà vô địch: đèn rọi + băng rôn
function drawWin(t, dt) {
  const w = fx.win; if (!w || A.phase !== 'ended') return;
  w.t += dt;
  const k = clamp01(w.t / 0.5);
  if (w.winner) {
    const p = posOf(w.winner.i);
    if (p) {
      ctx.save();
      // toạ độ đèn rọi theo camera
      const sx = (p.x - cam.x) * cam.s + W / 2, sy = (p.y - cam.y) * cam.s + 1010;
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(sx, sy, 170 * cam.s, 0, Math.PI * 2, true);
      ctx.fillStyle = `rgba(0,0,0,${0.55 * k})`; ctx.fill('evenodd');
      ctx.restore();
    }
  }
  ctx.save(); ctx.globalAlpha = k; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const y = 450;
  rr(70, y - 85, W - 140, 200, 36);
  const g = ctx.createLinearGradient(0, y - 85, 0, y + 115); g.addColorStop(0, 'rgba(80,55,6,.95)'); g.addColorStop(1, 'rgba(20,13,2,.95)');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 5; ctx.stroke();
  ctx.font = font(400, 40, true); outlined('🏆 NHÀ VÔ ĐỊCH', W / 2, y - 38, '#f5c542', '#000', 8);
  if (w.winner) {
    const d = defOf(w.winner.card);
    ctx.font = font(900, 48); ctx.fillStyle = '#fff'; ctx.fillText(fitText(`${d.emoji} ${w.winner.name}`, W - 200), W / 2, y + 20);
    ctx.font = font(700, 26); ctx.fillStyle = '#fde68a';
    ctx.fillText(w.winner.bot ? '🤖 Bot thắng — comment VÀO trận sau để đòi lại!' : `${w.winner.kills} mạng · sống sót trong ${w.total} thần thú · mở RƯƠNG VÀNG`, W / 2, y + 74);
  } else { ctx.font = font(900, 40); ctx.fillStyle = '#fff'; ctx.fillText('Hòa — không ai sống sót!', W / 2, y + 30); }
  ctx.restore();
  if (w.t < 6 && Math.random() < 0.5) fx.s.parts.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 80, vy: 250 + Math.random() * 200, g: 120, life: 3, max: 3, size: 10 + Math.random() * 8, color: pick(['#f5c542', '#fff', '#ff6a3d', '#3ddc97', '#4aa3ff']) });
}

// Khoe bộ sưu tập ("thẻ")
function drawShows(t, dt) {
  const s = fx.shows[0]; if (!s || rv) return;
  s.t += dt; if (s.t > 5.5) { fx.shows.shift(); return; }
  const k = Math.min(1, s.t / 0.3, (5.5 - s.t) / 0.4);
  const y = 640, h = (s.summary?.top?.length || 0) > 3 ? 470 : 560;
  ctx.save(); ctx.globalAlpha = clamp01(k);
  ctx.translate((1 - ease(s.t / 0.35)) * -700, 0);
  rr(40, y, W - 80, h, 34); ctx.fillStyle = 'rgba(13,11,20,.94)'; ctx.fill(); ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 4; ctx.stroke();
  avatar(s.by, 110, y + 70, 42);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = font(900, 34); ctx.fillStyle = '#fff'; ctx.fillText(fitText(s.by.name, 560), 170, y + 52);
  const S = s.summary;
  ctx.font = font(700, 23); ctx.fillStyle = '#c9c1d8';
  if (!S || !S.total) {
    ctx.fillText('Chưa có thẻ nào', 170, y + 92);
    ctx.textAlign = 'center'; ctx.font = font(800, 32); ctx.fillStyle = '#3ddc97';
    ctx.fillText(`💬 Comment "${A.joinWord.toLowerCase()}" để nhận thẻ khởi đầu!`, W / 2, y + h / 2 + 30);
    ctx.restore(); return;
  }
  ctx.fillText(`🎴 ${S.total} thẻ · ${S.species}/${S.ofSpecies} loài · 🏆 ${S.wins} thắng · 💀 ${S.kills} mạng`, 170, y + 92);
  // mảnh
  const pk = clamp01(S.shards / S.chestEvery);
  rr(W - 330, y + 40, 250, 22, 11); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill();
  rr(W - 330, y + 40, Math.max(22, 250 * pk), 22, 11); ctx.fillStyle = '#a78bfa'; ctx.fill();
  ctx.textAlign = 'right'; ctx.font = font(800, 19); ctx.fillStyle = '#ddd6fe'; ctx.fillText(`🧩 ${S.shards}/${S.chestEvery} mảnh`, W - 80, y + 82);
  // tối đa 5 lá mạnh nhất, đánh số để comment "vào 2" / "dùng 2"
  const cw = S.top.length > 3 ? 176 : 250, chh = cw * CARD_H / CARD_W;
  const cy = y + 128 + chh / 2;
  S.top.forEach((c, i) => {
    const cx = W / 2 + (i - (S.top.length - 1) / 2) * (cw + 16);
    drawCard(ctx, c, cx, cy, cw, { t: t + i, owner: '' });
    // số thứ tự
    ctx.beginPath(); ctx.arc(cx - cw / 2 + 6, cy - chh / 2 + 6, 26, 0, Math.PI * 2);
    ctx.fillStyle = c.picked ? '#3ddc97' : '#f5c542'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#0d0b14'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font(900, 30); ctx.fillStyle = '#0d0b14';
    ctx.fillText(String(c.n), cx - cw / 2 + 6, cy - chh / 2 + 8);
    if (c.picked) chip('⚔️ ĐANG DÙNG', cx, cy + chh / 2 + 4, 30, '#3ddc97', '#062b1c', 17);
  });
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font(800, 25); ctx.fillStyle = '#fde68a';
  ctx.fillText(fitText(`💬 "vào 2" thả lá số 2 · "dùng 3" đổi lá${S.total > S.top.length ? ` · còn ${S.total - S.top.length} lá ở ${location.host}/thebai` : ''}`, W - 120), W / 2, y + h - 30);
  ctx.restore();
}

// ---------------- màn mở rương ----------------
function drawChest(x, y, s, t, color, shakeK, lidOpen, gold) {
  ctx.save();
  ctx.translate(x + (Math.random() - 0.5) * shakeK * 18, y + (Math.random() - 0.5) * shakeK * 10);
  ctx.scale(s, s);
  const wood = gold ? ['#8a5a12', '#5c3a08'] : ['#7a4a26', '#4a2a14'];
  const trim = gold ? '#ffd75e' : '#c9a24a';
  // ánh sáng rỉ ra khe nắp
  if (!lidOpen) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.22 + Math.sin(t * 3 + i) * 0.04;
      const len = 260 + 120 * shakeK;
      ctx.fillStyle = color; ctx.globalAlpha = 0.18 + 0.25 * shakeK;
      ctx.beginPath(); ctx.moveTo(-120 + i * 30, -20); ctx.lineTo(-120 + i * 30 + Math.cos(a - 0.05) * len, -20 + Math.sin(a - 0.05) * len); ctx.lineTo(-120 + i * 30 + Math.cos(a + 0.05) * len, -20 + Math.sin(a + 0.05) * len); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // thân rương
  const bg = ctx.createLinearGradient(0, -20, 0, 120); bg.addColorStop(0, wood[0]); bg.addColorStop(1, wood[1]);
  rr(-160, -20, 320, 140, 14); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = trim; ctx.stroke();
  ctx.fillStyle = trim; ctx.fillRect(-160, 20, 320, 12); ctx.fillRect(-100, -20, 14, 140); ctx.fillRect(86, -20, 14, 140);
  // khe sáng
  if (!lidOpen) { ctx.fillStyle = color; ctx.globalAlpha = 0.6 + 0.4 * shakeK; ctx.fillRect(-156, -26, 312, 8); ctx.globalAlpha = 1; }
  // nắp
  if (!lidOpen) {
    const lg = ctx.createLinearGradient(0, -110, 0, -20); lg.addColorStop(0, wood[0]); lg.addColorStop(1, wood[1]);
    ctx.beginPath(); ctx.moveTo(-160, -24); ctx.lineTo(-160, -70); ctx.quadraticCurveTo(0, -150, 160, -70); ctx.lineTo(160, -24); ctx.closePath();
    ctx.fillStyle = lg; ctx.fill(); ctx.strokeStyle = trim; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = trim; ctx.fillRect(-100, -110, 14, 86); ctx.fillRect(86, -110, 14, 86);
  }
  // ổ khoá
  rr(-26, -40, 52, 60, 10); ctx.fillStyle = trim; ctx.fill();
  ctx.fillStyle = '#2a1a05'; ctx.beginPath(); ctx.arc(0, -16, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-3, -14, 6, 20);
  ctx.restore();
}

function drawReveal(t, dt) {
  if (!rv && reveals.length) { rv = reveals.shift(); rv.times = revealTimes(rv); rv.stage = -1; }
  if (!rv) return;
  rv.t += dt;
  if (rv.t < 0) return; // chờ băng rôn vô địch
  const T = rv.times;
  const R = RARITIES[rv.rar];
  const k = rv.t;
  const gold = rv.reason === 'win';
  const fadeK = clamp01((T.end + T.fade - k) / T.fade);
  if (k > T.end + T.fade) { rv = null; return; }
  ctx.save();
  ctx.globalAlpha = fadeK;
  // nền tối
  ctx.fillStyle = `rgba(4,3,8,${Math.min(0.9, k * 1.5)})`; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, chestY = 1180;
  // tiêu đề rương
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const title = gold ? '🏆 RƯƠNG VÀNG NHÀ VÔ ĐỊCH' : rv.reason === 'shards' ? '🧩 ĐỦ MẢNH · MỞ RƯƠNG' : rv.reason === 'gift' ? '🎁 RƯƠNG QUÀ TẶNG' : rv.reason === 'share' ? '📤 RƯƠNG CHIA SẺ' : '🎴 MỞ RƯƠNG THẺ';
  ctx.font = font(800, 30); ctx.fillStyle = '#c9c1d8'; ctx.fillText(title, cx, 300);
  ctx.font = font(900, 46); outlined(fitText(rv.by.name, 900), cx, 352, '#fff', '#000', 7);
  if (k < T.burst) {
    // nạp năng lượng: ánh sáng leo dần qua từng độ hiếm (Thường → Hiếm → Sử thi → Huyền thoại → Thần thoại)
    const step = (T.burst - 0.6) / Math.max(1, rv.rank + 1);
    const stage = Math.min(rv.rank, Math.floor(k / step));
    if (stage !== rv.stage) {
      rv.stage = stage;
      if (stage > 0) { sound.play('chime', { pitch: 0.8 + stage * 0.25 }); shake(0.15 + stage * 0.1); flash(0.12, '255,255,255'); }
      if (stage === 0) sound.play('riser', { dur: T.burst, pitch: 0.8 + rv.rank * 0.1 });
    }
    const S = RARITIES[RARITY_ORDER[stage]];
    const col = S.id === 'M' ? `hsl(${(t * 300) % 360},100%,65%)` : S.color;
    const sk = clamp01(k / T.burst);
    // quầng sáng sau rương
    const g = ctx.createRadialGradient(cx, chestY - 60, 10, cx, chestY - 60, 420 + 200 * sk);
    g.addColorStop(0, S.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, chestY - 700, W, 1200);
    drawChest(cx, chestY, 1.5 + 0.12 * sk, t, col, sk * (0.4 + stage * 0.15), false, gold);
    if (stage > 0) { ctx.font = font(400, 54 + stage * 6, true); outlined(`${S.name.toUpperCase()}…?`, cx, chestY - 360, col, '#000', 9); }
    // hạt bị hút vào rương
    if (Math.random() < 0.7) { const a = Math.random() * Math.PI * 2, d = 400 + Math.random() * 200; fx.s.parts.push({ x: cx + Math.cos(a) * d, y: chestY - 60 + Math.sin(a) * d, vx: -Math.cos(a) * d * 1.6, vy: -Math.sin(a) * d * 1.6, g: 0, life: 0.6, max: 0.6, size: 8, color: S.color }); }
  } else {
    const p = k - T.burst;
    if (!rv.boom) {
      rv.boom = true;
      flash(1, '255,255,255'); shake(R.rank >= 3 ? 2 : 1.2);
      sound.play('boom', { big: R.rank >= 3 });
      if (R.id === 'L') sound.play('gong');
      if (R.id === 'M') { sound.play('thunder'); sound.play('gong'); }
      const cols = R.id === 'M' ? ['#ff4fa3', '#ffd36e', '#7dffb2', '#6ec8ff', '#c78bff', '#fff'] : [R.color, '#fff', R.glow];
      for (let i = 0; i < (R.rank >= 3 ? 4 : 2); i++) burst(cx, chestY - 60, 90, cols, 900, 14, 300, 1.4, fx.s);
      ring(cx, chestY - 60, R.color, 40, 900, 0.8, 30, fx.s);
      rv.lid = { x: cx, y: chestY - 120, vx: (Math.random() - 0.5) * 600, vy: -1400, rot: 0 };
    }
    // cột sáng + tia quay
    const beam = clamp01(p * 2);
    const bg = ctx.createLinearGradient(cx - 230, 0, cx + 230, 0);
    const col = R.id === 'M' ? `hsla(${(t * 120) % 360},100%,70%,` : null;
    bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(0.5, col ? col + (0.7 * beam) + ')' : R.glow); bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = fadeK * beam; ctx.fillStyle = bg; ctx.fillRect(cx - 230, 0, 460, H); ctx.globalAlpha = fadeK;
    ctx.save(); ctx.translate(cx, 900); ctx.rotate(t * 0.5);
    const nr = R.rank >= 3 ? 18 : 12;
    for (let i = 0; i < nr; i++) {
      ctx.rotate(Math.PI * 2 / nr);
      ctx.fillStyle = R.id === 'M' ? `hsla(${(i * 40 + t * 90) % 360},100%,70%,${0.16 * beam})` : R.glow.replace(/[\d.]+\)$/, `${0.16 * beam})`);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1500, -80); ctx.lineTo(1500, 80); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // rương mở + nắp bay
    ctx.globalAlpha = fadeK * clamp01(1 - (p - 0.8) / 0.6); // rương mờ dần để chữ dưới lá bài dễ đọc
    if (ctx.globalAlpha > 0) drawChest(cx, chestY, 1.62, t, R.color, 0, true, gold);
    ctx.globalAlpha = fadeK;
    if (rv.lid) {
      const l = rv.lid; l.vy += 2600 * dt; l.x += l.vx * dt; l.y += l.vy * dt; l.rot += dt * 6;
      if (l.y < H + 200) { ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot); ctx.fillStyle = gold ? '#8a5a12' : '#7a4a26'; ctx.strokeStyle = gold ? '#ffd75e' : '#c9a24a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-240, 50); ctx.lineTo(-240, -20); ctx.quadraticCurveTo(0, -140, 240, -20); ctx.lineTo(240, 50); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }
    // mưa: xu vàng (Huyền thoại) / cầu vồng + sét (Thần thoại) / lấp lánh
    if (Math.random() < (R.rank >= 3 ? 0.9 : 0.5)) {
      const c = R.id === 'M' ? `hsl(${Math.random() * 360},100%,70%)` : R.id === 'L' ? pick(['#f5c542', '#ffd75e', '#fff1b8']) : pick([R.color, '#fff']);
      fx.s.parts.push({ x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 80, vy: 260 + Math.random() * 240, g: 100, life: 3, max: 3, size: R.rank >= 3 ? 14 + Math.random() * 10 : 9, color: c });
    }
    if (R.id === 'M' && Math.random() < dt * 1.6) { const x = Math.random() * W; bolt(x, 0, x + (Math.random() - 0.5) * 300, 300 + Math.random() * 900, pick(['#fbcfe8', '#bae6fd', '#fef08a']), 0.3, fx.s); flash(0.15, '255,200,240'); if (Math.random() < 0.4) sound.play('thunder'); }
    // lá bài bay lên, xoay 2 vòng rồi dừng mặt trước
    const rise = clamp01(p / 1.3), e = ease(rise);
    const cardW = 520 * (0.3 + 0.7 * e);
    const cy = lerp(chestY - 80, 880, e) + (rise >= 1 ? Math.sin(t * 2) * 8 : 0);
    const flipV = rise < 1 ? 3 * (1 - e) : 0;
    if (rise >= 1 && !rv.landed) { rv.landed = true; shake(R.rank >= 3 ? 0.9 : 0.4); ring(cx, 880, R.color, 200, 700, 0.6, 16, fx.s); if (R.rank >= 3) sound.play('roar'); else sound.play('levelup'); }
    drawCard(ctx, { card: rv.card.card, q: rv.card.q, serial: rv.card.serial }, cx, cy, cardW, { t, flip: flipV, owner: rv.by.name, tilt: rise < 1 ? (1 - e) * 0.3 : Math.sin(t * 1.3) * 0.02 });
    // tên độ hiếm đóng dấu từng chữ
    if (p > 1.1) {
      const label = R.name.toUpperCase() + '!';
      const letters = [...label];
      ctx.font = font(400, R.rank >= 3 ? 84 : 70, true);
      const widths = letters.map((ch) => ctx.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0);
      let x = cx - total / 2;
      letters.forEach((ch, i) => {
        const lk = clamp01((p - 1.1 - i * 0.05) / 0.18);
        if (lk > 0) {
          const s = lerp(2.6, 1, easeBack(lk));
          ctx.save(); ctx.translate(x + widths[i] / 2, 440); ctx.scale(s, s); ctx.globalAlpha = fadeK * lk;
          const fill = R.id === 'M' ? `hsl(${(t * 200 + i * 25) % 360},100%,68%)` : R.color;
          ctx.textAlign = 'center'; outlined(ch, 0, 0, fill, '#000', 11);
          ctx.restore();
        }
        x += widths[i];
      });
    }
    // thông tin dưới lá bài
    if (p > 1.4) {
      const a = clamp01((p - 1.4) * 2.5);
      ctx.globalAlpha = fadeK * a;
      const def = CARD_BY_ID[rv.card.card];
      ctx.textAlign = 'center';
      ctx.font = font(900, 42); outlined(fitText(`${rv.by.name} nhận ${def.name}`, W - 80), cx, 1290, '#fff', '#000', 8);
      ctx.font = font(800, 30); ctx.fillStyle = '#ffd84a';
      ctx.fillText(`${'★'.repeat(stars(rv.card.q))}${'☆'.repeat(5 - stars(rv.card.q))}  Phẩm chất ${rv.card.q}%  ·  #${String(rv.card.serial).padStart(4, '0')}`, cx, 1342);
      const badges = [];
      if (rv.card.firstEver) badges.push(['🥇 BẢN ĐẦU TIÊN CỦA KÊNH', '#f5c542']);
      if (rv.card.isNew) badges.push(['✨ LOÀI MỚI TRONG BỘ SƯU TẬP', '#3ddc97']);
      if (rv.card.q >= 96) badges.push(['💎 PHẨM CHẤT HOÀN HẢO', '#7dd3fc']);
      badges.forEach(([b, c], i) => chip(b, cx, 1400 + i * 54, 46, 'rgba(13,11,20,.9)', c, 24));
    }
  }
  ctx.restore();
}

// Thẻ Thường / Hiếm: hiện nhỏ bên phải, không che trận đấu
function drawMinis(t, dt) {
  while (minis.length < 2 && miniWait.length) minis.push(miniWait.shift());
  if (miniWait.length > 6) miniWait.splice(0, miniWait.length - 6);
  minis.forEach((m, i) => {
    m.t += dt;
    const dur = 3.6;
    const k = Math.min(ease(m.t / 0.4), clamp01((dur - m.t) / 0.35));
    const R = RARITIES[m.rar];
    const cw = 210, ch = cw * CARD_H / CARD_W;
    const x = lerp(W + 150, W - 150, k), y = 760 + i * (ch + 70);
    if (m.t < 0.05 && !m.snd) { m.snd = true; sound.play('chime', { pitch: R.rank ? 1.3 : 1 }); }
    ctx.save(); ctx.globalAlpha = clamp01(k * 1.5);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    chip(`🎁 ${clip(m.by.name, 12)}`, x, y - ch / 2 - 26, 38, 'rgba(13,11,20,.9)', '#fff', 20);
    drawCard(ctx, { card: m.card.card, q: m.card.q, serial: m.card.serial }, x, y, cw, { t, flip: clamp01(1 - m.t / 0.6) });
    ctx.restore();
  });
  for (let i = minis.length - 1; i >= 0; i--) if (minis[i].t > 3.6) minis.splice(i, 1);
}

// Game tạm dừng
function drawPaused(t) {
  if (!A?.paused) return;
  ctx.save();
  ctx.fillStyle = 'rgba(5,4,12,.6)'; ctx.fillRect(0, 0, W, H);
  const w = 760, h = 230, x = (W - w) / 2, y = H / 2 - h / 2;
  rr(x, y, w, h, 40); ctx.fillStyle = 'rgba(22,16,34,.96)'; ctx.fill();
  ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 4; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 3);
  ctx.font = font(900, 64); ctx.fillStyle = '#f5c542'; ctx.fillText('⏸ TẠM DỪNG', W / 2, y + 85);
  ctx.globalAlpha = 1;
  ctx.font = font(700, 32); ctx.fillStyle = '#e0e7ff';
  ctx.fillText(A.pauseReason === 'offline' ? 'Chờ kênh lên live…' : 'Tạm nghỉ một chút, quay lại ngay!', W / 2, y + 165);
  ctx.restore();
}

function updateCamera(dt) {
  let s = 1, x = 540, y = 1010;
  if (A.phase === 'fight') {
    const L = [...roster.values()].filter((f) => f.alive && f.x != null);
    if (L.length && L.length <= 3) {
      const cx = L.reduce((a, f) => a + f.x, 0) / L.length, cy = L.reduce((a, f) => a + f.y, 0) / L.length;
      const span = Math.max(300, ...L.map((f) => Math.hypot(f.x - cx, f.y - cy) * 2 + 300));
      s = Math.min(1.9, 940 / span); x = cx; y = cy;
    }
  } else if (A.phase === 'ended' && fx.win?.winner) {
    const p = posOf(fx.win.winner.i);
    if (p) { s = 1.8; x = p.x; y = p.y; }
  }
  const k = Math.min(1, dt * 2);
  cam.s = lerp(cam.s, s, k); cam.x = lerp(cam.x, x, k); cam.y = lerp(cam.y, y, k);
}

let last = performance.now();
let fps = 60;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps = lerp(fps, 1 / Math.max(dt, 0.001), 0.05);
  const t = now / 1000;
  ctx.clearRect(0, 0, W, H);
  if (!A) {
    ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f5c542'; ctx.font = font(800, 36); ctx.textAlign = 'center';
    ctx.fillText('Đang mở đấu trường…', W / 2, H / 2);
    requestAnimationFrame(frame); return;
  }
  for (const a of fx.alerts) a.t += dt;
  fx.alerts = fx.alerts.filter((a) => a.t < a.dur);
  for (const f of fx.feed) f.t += dt;
  fx.feed = fx.feed.filter((f) => f.t < 7);
  for (const tt of fx.toasts) tt.t += dt;
  fx.toasts = fx.toasts.filter((tt) => tt.t < 5);
  for (const j of fx.joinsRecent) j.t += dt;
  fx.joinsRecent = fx.joinsRecent.filter((j) => j.t < 8);
  fx.flash = Math.max(0, fx.flash - dt * 1.5);
  fx.shake = Math.max(0, fx.shake - dt * 2);
  updateCamera(dt);

  ctx.save();
  if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * 20 * fx.shake, (Math.random() - 0.5) * 14 * fx.shake);
  // thế giới (theo camera)
  ctx.save();
  ctx.translate(W / 2, 1010); ctx.scale(cam.s, cam.s); ctx.translate(-cam.x, -cam.y);
  drawArena(t);
  drawFighters(t, dt);
  drawWorldFx(t, dt);
  drawParticles(fx, dt);
  drawFloats(dt);
  ctx.restore();
  // HUD
  drawHeader(t);
  drawLobbyPanel(t);
  drawFeed();
  drawToasts();
  drawJoinsList();
  drawBanner(dt);
  drawFinal(dt);
  drawWin(t, dt);
  drawShows(t, dt);
  drawBottom(t);
  drawAlert();
  drawMinis(t, dt);
  ctx.restore();
  drawReveal(t, dt);
  drawRings(fx.s, dt); drawBolts(fx.s, dt); drawParticles(fx.s, dt);
  drawPaused(t);
  if (fx.flash > 0) { ctx.fillStyle = `rgba(${fx.flashColor},${fx.flash * 0.7})`; ctx.fillRect(0, 0, W, H); }
  if (opt.debug) {
    ctx.font = font(700, 20); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    outlined(`${Math.round(fps)} fps · ws ${wsOk ? 'OK' : 'mất'} · ${roster.size} con · ${fx.parts.length} hạt`, 20, 40, wsOk ? '#9f9' : '#f88', '#000', 4);
  }
  requestAnimationFrame(frame);
}

connect();
(document.fonts?.ready || Promise.resolve()).finally(() => requestAnimationFrame(frame));

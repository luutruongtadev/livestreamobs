// Game đoán từ theo nghĩa cho TikTok Live.
// ?mute=1  ?debug=1  ?phone=1|0  ?tts=0 (tắt giọng đọc tên người tặng quà)
import { SoundBoard } from './sound.js';

const W = 1080, H = 1920;
const qs = new URLSearchParams(location.search);
const opt = {
  mute: qs.get('mute') === '1',
  debug: qs.get('debug') === '1',
  tts: qs.get('tts') !== '0' && qs.get('mute') !== '1',
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
let sound = new SoundBoard({ muted: opt.mute, theme: 'game' });
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
const CONFETTI_COLORS = ['#ffd54a', '#4ade80', '#60a5fa', '#f472b6', '#fff', '#fb923c', '#a78bfa', '#f43f5e'];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function piece(x, y, vx, vy, g, life) {
  const r = Math.random();
  return {
    x, y, vx, vy, g, life, max: life, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, flip: Math.random() * 6, vf: 6 + Math.random() * 10,
    shape: r < 0.2 ? 'ribbon' : r < 0.32 ? 'dot' : 'rect', s: 8 + Math.random() * 10, color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  };
}
function trimConfetti() { if (fx.confetti.length > 1500) fx.confetti.splice(0, fx.confetti.length - 1500); }
/** Mưa pháo giấy từ trên xuống. */
function confetti(n = 220) {
  if (reducedMotion) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) fx.confetti.push(piece(Math.random() * W, -20 - Math.random() * 700, (Math.random() - 0.5) * 120, 150 + Math.random() * 200, 40, 5));
  trimConfetti();
}
/** Pháo giấy bắn từ góc dưới màn hình chéo lên giữa. */
function cannon(side, n = 90, power = 1) {
  if (reducedMotion) n = Math.ceil(n / 3);
  const left = side === 'left';
  for (let i = 0; i < n; i++) {
    const a = (left ? -1 : -Math.PI + 1) + (Math.random() - 0.5) * 0.55 - (left ? 0.15 : -0.15);
    const v = (1500 + Math.random() * 1100) * power;
    fx.confetti.push(piece(left ? -10 : W + 10, H * 0.86 + Math.random() * 60, Math.cos(a) * v, Math.sin(a) * v, 1100, 4.5));
  }
  trimConfetti();
}

// ---------------- sự kiện ----------------
// ---------------- cảm ơn người tặng quà ----------------
const GIFT_VI = {
  rose: 'bông hồng', 'finger heart': 'trái tim', tiktok: 'quà TikTok', perfume: 'nước hoa', doughnut: 'bánh donut',
  'hand hearts': 'trái tim', 'heart me': 'trái tim', 'ice cream cone': 'cây kem', gg: 'GG', corgi: 'chú chó Corgi',
  galaxy: 'dải ngân hà', 'love bang': 'trái tim tình yêu', 'sunglasses': 'kính râm', 'cap': 'chiếc mũ', 'lion': 'sư tử',
  'universe': 'vũ trụ', 'confetti': 'pháo giấy', 'money gun': 'súng tiền', 'hat and mustache': 'mũ và ria',
};
const giftVi = (n) => GIFT_VI[String(n || '').toLowerCase()] || n || 'quà';
const thanks = { queue: [], cur: null, hearts: [] };
const THANKS_Y = 965; // tâm thẻ cảm ơn: đè tạm lên bảng xếp hạng, không che ô chữ / gợi ý / thông báo
const tierOf = (d) => (d >= 99 ? 3 : d >= 30 ? 2 : d >= 5 ? 1 : 0);

let viVoice = null;
function pickVoice() {
  const vs = window.speechSynthesis?.getVoices?.() || [];
  viVoice = vs.find((v) => /^vi/i.test(v.lang)) || null;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
/** Đọc tên người tặng (giọng tiếng Việt của máy; không có giọng Việt thì bỏ qua). */
function speak(text) {
  if (!opt.tts || !window.speechSynthesis || !viVoice) return;
  if (speechSynthesis.pending && speechSynthesis.speaking && thanks.queue.length > 3) return; // quá nhiều thì bỏ bớt
  const u = new SpeechSynthesisUtterance(text);
  u.voice = viVoice; u.lang = viVoice.lang; u.rate = 1.05; u.volume = 1;
  speechSynthesis.speak(u);
}
const speakName = (n) => String(n || 'bạn').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'bạn';

function thank(e) {
  const tier = tierOf(e.diamonds);
  // quà nhỏ dồn dập: gộp vào thẻ đang chờ của cùng người
  const same = thanks.queue.find((q) => q.by?.id === e.by?.id && q.giftName === e.giftName);
  if (same) { same.repeat += e.repeat; same.diamonds += e.diamonds; same.bonusTotal = e.bonusTotal; same.tier = Math.max(same.tier, tierOf(same.diamonds)); return; }
  if (thanks.queue.length >= 6) { const i = thanks.queue.findIndex((q) => q.tier < tier); if (i < 0) return; thanks.queue.splice(i, 1); }
  thanks.queue.push({ ...e, tier });
}

function handle(e) {
  switch (e.type) {
    case 'wg_team_mode':
      fx.banner = { text: e.on ? '👥 BẬT CHẾ ĐỘ ĐẤU ĐỘI!' : 'Đã tắt chế độ đấu đội', sub: e.on ? 'Comment "đội đỏ" hoặc "đội xanh" để vào đội' : '', t: 4, color: '#facc15' };
      sound.play('bell');
      break;
    case 'wg_team_join': {
      const tm = G?.team?.teams?.find((x) => x.id === e.team);
      if (!tm) break;
      if (e.locked) { fx.floaters.push({ text: `🔒 ${clip(e.by?.name, 12)} đang ở ${tm.name} — hết trận mới đổi`, x: W / 2, y: 330, life: 1, color: tm.color }); break; }
      fx.floaters.push({ text: `${tm.icon} ${clip(e.by?.name, 12)} ${e.auto ? '→' : 'vào'} ${tm.name}`, x: e.team === G.team.teams[0].id ? 300 : W - 300, y: 330, life: 1, color: tm.color });
      if (!e.auto) sound.play('chime', { pitch: e.team === G.team.teams[0].id ? 1.1 : 1.3 });
      break;
    }
    case 'wg_team_points': {
      const tm = G?.team?.teams?.find((x) => x.id === e.team);
      if (!tm) break;
      fx.floaters.push({ text: `${tm.icon} +${fmtN(e.points)}`, x: e.team === G.team.teams[0].id ? 220 : W - 220, y: 300, life: 1.2, color: tm.color });
      break;
    }
    case 'wg_team_match': {
      const tm = G?.team?.teams?.find((x) => x.id === e.winner);
      fx.matchAt = performance.now();
      fx.flash = 1;
      confetti(320);
      sound.play('levelup');
      break;
    }
    case 'wg_like_bonus':
      fx.banner = { text: `❤️ ${clip(e.by?.name, 16)} thả đủ ${fmtN(e.likes)} tim!`, sub: `Đoán trúng vòng này được thêm +${e.points} điểm`, t: 3.5, color: '#f472b6' };
      sound.play('chime', { pitch: 1.8 }); confetti(60);
      break;
    case 'wg_bonus':
      if (e.add > 0) {
        fx.banner = { text: `🔁 ${clip(e.by?.name, 16)} chia sẻ live: +${e.add} điểm thưởng`, sub: `Đang giữ ${e.total} điểm thưởng — cộng vào lần đoán đúng tiếp theo`, t: 3.5, color: '#4ade80' };
        sound.play('chime', { pitch: 1.6 });
      }
      break;
    case 'wg_thanks':
      thank(e);
      break;
    case 'wg_guess':
      if (e.dup && e.score != null) fx.highlight.set(e.word, performance.now());
      sound.play('mo');
      break;
    case 'wg_scored':
      fx.highlight.set(e.word, performance.now());
      if (e.mode === 'attr') {
        if (e.hits >= 4) { sound.play('chime', { pitch: 1.5 }); fx.floaters.push({ text: `🔥 ${e.word}: ${e.hits}/6 ô xanh`, x: W / 2, y: L.rankTop + 24, life: 1, color: '#4ade80' }); }
        else if (e.hits >= 2) sound.play('chime', { pitch: 1.1 });
        break;
      }
      if (e.score >= 85) { sound.play('chime', { pitch: 1.5 }); fx.floaters.push({ text: `🔥 ${e.word}: ${e.score}`, x: W / 2, y: L.rankTop + 24, life: 1, color: '#4ade80' }); }
      else if (e.score >= 60) sound.play('chime', { pitch: 1.1 });
      break;
    case 'wg_known': {
      const k = e.learned.map((x) => `${x.icon} ${x.name}: ${Array.isArray(x.v) ? x.v.join(' + ') : x.v}`).join(' · ');
      fx.banner = { text: `✅ ĐÃ BIẾT THÊM: ${k}`, sub: `nhờ ${clip(e.by?.name, 16)} đoán “${e.word}”`, t: 3, color: '#4ade80' };
      sound.play('chime', { pitch: 1.3 });
      break;
    }
    case 'wg_attr_unlock':
      fx.banner = { text: `🔓 MỞ KHOÁ CỘT ${e.icon} ${String(e.name).toUpperCase()}!`, sub: `Đã có ${e.after} từ được đoán · ↑ đáp án đứng sau, ↓ đứng trước trong bảng chữ cái`, t: 4, color: '#facc15' };
      sound.play('levelup'); confetti(80);
      break;
    case 'wg_mode':
      if (e.fallback) fx.banner = { text: '🎯 Vòng này chơi kiểu gần nghĩa', sub: 'Bình luận một từ để đoán', t: 3, color: '#60a5fa' };
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
      if (e.likes) {
        for (const i of e.indexes || []) fx.letterAt.set(i, now);
        fx.unlockFlash.set('likes', now);
        fx.banner = e.action === 'hint'
          ? { text: '❤️ CẢ PHÒNG THẢ ĐỦ TIM: THÊM 1 TỪ TIẾNG ANH!', sub: e.hint || 'Thả tim tiếp để mở thêm từ', t: 4, color: '#f472b6' }
          : { text: '❤️ CẢ PHÒNG THẢ ĐỦ TIM: LỘ 1 CHỮ CÁI!', sub: 'Thả tim tiếp để mở thêm chữ', t: 3.5, color: '#f472b6' };
        fx.hintFlash = 1; sound.play('bell'); confetti(120);
        break;
      }
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
      if (e.by || e.likes) break; // gợi ý do quà / tim mở đã có thông báo wg_unlock
      fx.hintFlash = 1;
      sound.play('bell');
      fx.banner = { text: e.by ? `💡 ${clip(e.by.name, 18)} tặng quà mở gợi ý!` : '💡 Gợi ý mới!', sub: e.hint, t: 4, color: '#facc15' };
      break;
    case 'wg_win':
      startWinFx(e);
      if (e.combo) startCombo(e.combo, e.by);
      break;
    case 'wg_timeout':
      sound.play('bell');
      break;
    case 'wg_start':
      fx.rowY.clear(); fx.highlight.clear(); fx.letterAt.clear();
      sound.play('chime');
      fx.banner = e.mode === 'attr'
        ? { text: `🧩 VÒNG ${e.round}: ĐOÁN THUỘC TÍNH`, sub: 'Từ đoán có thuộc tính giống từ bí mật → ô xanh', t: 4, color: '#4ade80' }
        : e.mode === 'english'
          ? { text: `🔤 VÒNG ${e.round}: GỢI Ý TIẾNG ANH`, sub: 'Gợi ý bằng tiếng Anh — đoán bằng tiếng Việt', t: 4, color: '#f472b6' }
          : { text: `🎯 VÒNG ${e.round}: GẦN NGHĨA`, sub: 'Bình luận một từ để đoán', t: 3, color: '#60a5fa' };
      if (e.streak) fx.banner = { ...fx.banner, sub: `🔥 ${clip(e.streak.name, 16)} đang chuỗi ${e.streak.n} — trúng tiếp là COMBO x${e.streak.nextMult}!`, t: 4.5 };
      break;
  }
}

// ---------------- hiệu ứng đoán trúng theo mức ----------------
// lightning ⚡ 10 giây đầu · nohint 🔥 chưa gợi ý · hint1 💡 1 gợi ý · clutch ⏱️ phút chót · hint2 👍 · hint3 🎉
const WIN_TIERS = {
  lightning: { title: '⚡ THẦN ĐỒNG!', sub: (e) => `Trúng phóc sau ${e.seconds} giây!`, color: '#facc15', dur: 4.6, card: ['#a16207', '#422006'] },
  nohint: { title: '🔥 KHÔNG CẦN GỢI Ý!', sub: (e) => `${e.seconds} giây · chưa mở gợi ý nào`, color: '#fb923c', dur: 3.8, card: ['#c2410c', '#431407'] },
  hint1: { title: '💡 CHỈ CẦN 1 GỢI Ý!', sub: (e) => `Đoán trúng sau ${e.seconds} giây`, color: '#7dd3fc', dur: 3.2, card: ['#1d4ed8', '#172554'] },
  clutch: { title: '⏱️ PHÚT CHÓT!', sub: (e) => `Còn ${e.left} giây nữa là hết giờ!`, color: '#f87171', dur: 3.2, card: ['#b91c1c', '#450a0a'] },
  hint2: { title: '👍 ĐOÁN HAY!', sub: (e) => `Sau 2 gợi ý · ${e.seconds} giây`, color: '#86efac', dur: 2.4, card: ['#166534', '#052e16'] },
  hint3: { title: '🎉 ĐOÁN TRÚNG!', sub: (e) => `Sau ${e.hintLevel} gợi ý · ${e.seconds} giây`, color: '#bbf7d0', dur: 2.2, card: ['#166534', '#052e16'] },
};
const wfx = { combo: null, win: null, sparks: [], rings: [], bolts: [], rockets: [], shake: 0, punch: 0 };
const pickC = (a) => a[Math.floor(Math.random() * a.length)];
function spark(x, y, n, colors, spd = 500, size = 10, g = 400, life = 1.2) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random() * 0.8);
    wfx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g, life, max: life, size: size * (0.5 + Math.random()), color: pickC(colors), star: Math.random() < 0.3 });
  }
  if (wfx.sparks.length > 900) wfx.sparks.splice(0, wfx.sparks.length - 900);
}
function wring(x, y, color, r1 = 400, dur = 0.7, lw = 16, delay = 0) { wfx.rings.push({ x, y, color, r1, dur, lw, t: -delay }); }
function wbolt(x0, y0, x1, y1, color = '#fef9c3') {
  const pts = [[x0, y0]];
  for (let i = 1; i < 10; i++) pts.push([lerp(x0, x1, i / 10) + (Math.random() - 0.5) * 90, lerp(y0, y1, i / 10)]);
  pts.push([x1, y1]);
  wfx.bolts.push({ pts, color, t: 0, dur: 0.35 });
}
const WIN_CX = W / 2, WIN_CY = 760;
/** Pháo hoa: bắn từ dưới lên, nổ tung trên trời. */
function rocket(x, colors) {
  wfx.rockets.push({ x, y: H + 20, ty: 260 + Math.random() * 520, vx: (Math.random() - 0.5) * 120, colors, trail: 0 });
  sound.play('whoosh');
}
// 6 mức hiệu ứng → 3 cấp ăn mừng (giống giọng đọc)
const WIN_GROUP = { lightning: 'early', nohint: 'early', hint1: 'hint', hint2: 'hint', hint3: 'late', clutch: 'late' };
const CELEBRATE = {
  early: { waves: 3, n: 110, power: 1.15, rockets: 9, punch: 1, shake: 2.4, rain: 320 },
  hint: { waves: 2, n: 80, power: 1, rockets: 4, punch: 0.6, shake: 1.4, rain: 200 },
  late: { waves: 2, n: 90, power: 1.05, rockets: 5, punch: 0.8, shake: 1.7, rain: 220 },
};
const ROCKET_COLORS = [['#facc15', '#fde68a', '#fff'], ['#f472b6', '#fbcfe8', '#fff'], ['#60a5fa', '#bfdbfe', '#fff'], ['#4ade80', '#bbf7d0', '#fff'], ['#fb923c', '#fed7aa', '#fff'], ['#a78bfa', '#ddd6fe', '#fff']];
function celebrate(group, delay = 0) {
  const P = CELEBRATE[group] || CELEBRATE.hint;
  setTimeout(() => {
    wfx.punch = P.punch;
    wfx.shake = Math.max(wfx.shake, P.shake);
    for (let i = 0; i < P.waves; i++) setTimeout(() => {
      cannon('left', P.n, P.power); cannon('right', P.n, P.power);
      sound.play('boom');
      wfx.shake = Math.max(wfx.shake, P.shake * 0.55);
      wfx.punch = Math.max(wfx.punch, P.punch * 0.4);
    }, i * 550);
    for (let i = 0; i < P.rockets; i++) setTimeout(() => rocket(120 + Math.random() * (W - 240), ROCKET_COLORS[i % ROCKET_COLORS.length]), 250 + i * (2800 / P.rockets) + Math.random() * 200);
    confetti(P.rain);
  }, delay);
}
function startWinFx(e) {
  const tier = WIN_TIERS[e.tier] ? e.tier : 'hint3';
  wfx.win = { ...e, tier, t: 0, cfg: WIN_TIERS[tier], beats: 0 };
  if (tier === 'lightning') {
    sound.play('thunder'); setTimeout(() => sound.play('gong'), 250); setTimeout(() => sound.play('levelup'), 700);
    fx.flash = 1; wfx.shake = 1.6;
    for (let i = 0; i < 6; i++) setTimeout(() => { wbolt(Math.random() * W, 0, WIN_CX + (Math.random() - 0.5) * 160, WIN_CY); fx.flash = Math.max(fx.flash, 0.5); }, i * 110);
    spark(WIN_CX, WIN_CY, 220, ['#facc15', '#fde68a', '#fff', '#f59e0b'], 1000, 14, 350, 1.6);
    for (let i = 0; i < 3; i++) wring(WIN_CX, WIN_CY, i % 2 ? '#fff' : '#facc15', 900, 0.9, 26, i * 0.15);
  } else if (tier === 'nohint') {
    sound.play('boom', { big: true }); setTimeout(() => sound.play('levelup'), 300);
    fx.flash = 0.8; wfx.shake = 1.1;
    spark(WIN_CX, WIN_CY, 160, ['#ff4d00', '#fb923c', '#facc15', '#fff1a8'], 850, 13, 200, 1.4);
    wring(WIN_CX, WIN_CY, '#fb923c', 750, 0.8, 24); wring(WIN_CX, WIN_CY, '#facc15', 520, 0.6, 14, 0.12);
  } else if (tier === 'hint1') {
    [1, 1.25, 1.5, 2].forEach((p, i) => setTimeout(() => sound.play('chime', { pitch: p }), i * 110)); setTimeout(() => sound.play('levelup'), 450);
    fx.flash = 0.6; wfx.shake = 0.5;
    spark(WIN_CX, WIN_CY, 120, ['#7dd3fc', '#a5b4fc', '#fff', '#c4b5fd'], 650, 11, 120, 1.4);
    wring(WIN_CX, WIN_CY, '#7dd3fc', 600, 0.7, 18);
  } else if (tier === 'clutch') {
    sound.play('boom'); setTimeout(() => sound.play('levelup'), 350);
    fx.flash = 0.7; wfx.shake = 1;
    spark(WIN_CX, WIN_CY, 110, ['#f87171', '#fecaca', '#fff', '#facc15'], 700, 12, 300, 1.2);
    wring(WIN_CX, WIN_CY, '#f87171', 650, 0.7, 20);
  } else {
    fx.flash = 0.8; sound.play('levelup');
    spark(WIN_CX, WIN_CY, 60, ['#86efac', '#fff', '#fde68a'], 500, 10, 300, 1.1);
  }
  celebrate(WIN_GROUP[tier], tier === 'clutch' ? 150 : 0);
}

/** Đoán trúng nhiều vòng liên tiếp: nổ combo xN. */
function startCombo(c, by) {
  wfx.combo = { ...c, name: by?.name || '', t: -0.9 };
  setTimeout(() => {
    sound.play('boom', { big: true }); setTimeout(() => sound.play('levelup'), 200);
    wfx.shake = Math.max(wfx.shake, 1 + c.mult * 0.15); fx.flash = 0.8;
    confetti(120 + c.mult * 60);
    spark(W / 2, 300, 80 + c.mult * 30, ['#ff4d00', '#facc15', '#fff', '#f472b6'], 900, 13, 250, 1.5);
    wring(W / 2, 300, '#f97316', 700, 0.8, 22);
  }, 900);
}

function drawCombo(dt) {
  const c = wfx.combo;
  if (!c) return;
  c.t += dt;
  if (c.t < 0) return;
  if (c.t > 3.6) { wfx.combo = null; return; }
  const pop = Math.min(1, c.t / 0.3);
  const s = pop < 1 ? 2.6 - 1.6 * ease(pop) : 1 + 0.06 * Math.sin(c.t * 14);
  const a = Math.min(1, (3.6 - c.t) / 0.4);
  ctx.save();
  ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.translate(W / 2, 300); ctx.rotate(-0.06); ctx.scale(s, s);
  ctx.font = font(900, 120);
  outlined(`🔥 COMBO x${c.mult}!`, 0, 0, c.mult >= 4 ? '#fde047' : '#fb923c', 'rgba(127,29,29,.95)', 14);
  ctx.font = font(800, 34); ctx.fillStyle = '#fff';
  ctx.fillText(fitText(`${c.name} · ${c.n} từ liên tiếp · điểm thưởng x${c.mult}`, W - 120), 0, 92);
  ctx.restore();
}

function drawWinFx(t, dt) {
  // hạt, vòng sóng, tia sét
  for (const r of wfx.rings) {
    r.t += dt; if (r.t < 0) continue;
    const k = r.t / r.dur; if (k >= 1) continue;
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = r.lw * (1 - k) + 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, 40 + (r.r1 - 40) * ease(k), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  wfx.rings = wfx.rings.filter((r) => r.t < r.dur);
  for (const b of wfx.bolts) {
    b.t += dt; const a = 1 - b.t / b.dur; if (a <= 0) continue;
    ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = 'round'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 24;
    ctx.strokeStyle = b.color; ctx.lineWidth = 9; ctx.beginPath(); b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
  }
  wfx.bolts = wfx.bolts.filter((b) => b.t < b.dur);
  const w = wfx.win;
  if (w) {
    w.t += dt;
    const C = w.cfg, k = w.t, dur = C.dur;
    if (k > dur) wfx.win = null;
    else {
      const fade = Math.min(1, k / 0.25, (dur - k) / 0.45);
      const epic = w.tier === 'lightning' || w.tier === 'nohint' || w.tier === 'hint1' || w.tier === 'clutch';
      ctx.save();
      // nền: tối lại + hiệu ứng riêng từng mức
      if (epic) { ctx.globalAlpha = fade * (w.tier === 'lightning' ? 0.78 : 0.6); ctx.fillStyle = '#05030d'; ctx.fillRect(0, 0, W, H); }
      else { // mức thường: dải nền tối sau chữ cho dễ đọc
        ctx.globalAlpha = fade * 0.82;
        const g = ctx.createLinearGradient(0, 380, 0, 650);
        g.addColorStop(0, 'rgba(5,3,13,0)'); g.addColorStop(0.2, 'rgba(5,3,13,1)'); g.addColorStop(0.8, 'rgba(5,3,13,1)'); g.addColorStop(1, 'rgba(5,3,13,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 380, W, 270);
      }
      ctx.globalAlpha = fade;
      if (w.tier === 'lightning' || w.tier === 'nohint' || w.tier === 'hint1') {
        // tia sáng quay sau avatar
        ctx.save(); ctx.translate(WIN_CX, WIN_CY); ctx.rotate(t * (w.tier === 'lightning' ? 0.9 : 0.5));
        const n = w.tier === 'lightning' ? 20 : 14;
        for (let i = 0; i < n; i++) {
          ctx.rotate(Math.PI * 2 / n);
          ctx.fillStyle = w.tier === 'lightning' ? `hsla(${45 + (i % 2) * 10},100%,60%,.22)` : w.tier === 'nohint' ? 'rgba(251,146,60,.18)' : 'rgba(125,211,252,.16)';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1400, -70); ctx.lineTo(1400, 70); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      if (w.tier === 'lightning') {
        // sét đánh liên tục + mưa xu vàng
        if (Math.random() < dt * 3) { wbolt(Math.random() * W, 0, Math.random() * W, 300 + Math.random() * 600); if (Math.random() < 0.4) sound.play('thunder'); }
        if (Math.random() < 0.8) wfx.sparks.push({ x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 60, vy: 300 + Math.random() * 250, g: 120, life: 3, max: 3, size: 14 + Math.random() * 10, color: pickC(['#facc15', '#fde68a', '#f59e0b']), coin: true });
      }
      if (w.tier === 'nohint' && Math.random() < 0.9) {
        // tàn lửa bốc lên
        wfx.sparks.push({ x: Math.random() * W, y: H + 10, vx: (Math.random() - 0.5) * 50, vy: -300 - Math.random() * 300, g: -40, life: 2.4, max: 2.4, size: 8 + Math.random() * 12, color: pickC(['#ff4d00', '#fb923c', '#facc15']) });
      }
      if (w.tier === 'hint1' && Math.random() < 0.6) wfx.sparks.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: -30, g: 0, life: 1, max: 1, size: 18, color: pickC(['#e0f2fe', '#c4b5fd', '#fff']), star: true });
      if (w.tier === 'clutch') {
        // nhịp tim đỏ ở viền màn hình
        const beat = Math.pow(Math.max(0, Math.sin(k * Math.PI * 2.4)), 6);
        if (beat > 0.9 && w.beats < Math.floor(k * 1.2) + 1) { w.beats++; sound.play('boom'); wfx.shake = 0.5; }
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
        g.addColorStop(0, 'rgba(220,38,38,0)'); g.addColorStop(1, `rgba(220,38,38,${0.35 + 0.4 * beat})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      // avatar to giữa màn hình
      const pop = Math.min(1, k / 0.35);
      const s = pop < 1 ? 0.3 + 0.9 * ease(pop) : 1 + 0.03 * Math.sin(t * 6);
      const r = (epic ? 120 : 84) * Math.min(1.15, s);
      if (epic) { const g = ctx.createRadialGradient(WIN_CX, WIN_CY, r * 0.8, WIN_CX, WIN_CY, r * 2); g.addColorStop(0, C.color); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = fade * 0.55; ctx.fillStyle = g; ctx.fillRect(WIN_CX - r * 2, WIN_CY - r * 2, r * 4, r * 4); ctx.globalAlpha = fade; }
      if (epic) avatar(w.by, WIN_CX, WIN_CY, r, C.color);
      // tiêu đề đóng dấu từng chữ
      const ty = epic ? WIN_CY - r - 110 : 470;
      const letters = [...C.title];
      const size = w.tier === 'lightning' ? 96 : epic ? 80 : 64;
      ctx.font = font(900, size);
      let widths = letters.map((ch) => ctx.measureText(ch).width);
      let total = widths.reduce((a, b) => a + b, 0);
      const fitK = Math.min(1, (W - 60) / total);
      let x = WIN_CX - (total * fitK) / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      letters.forEach((ch, i) => {
        const lk = Math.min(1, Math.max(0, (k - 0.15 - i * 0.045) / 0.18));
        if (lk > 0) {
          const sc = (lk < 1 ? 2.4 - 1.4 * ease(lk) : 1) * fitK;
          const wob = w.tier === 'clutch' ? Math.sin(t * 30 + i) * 3 : 0;
          ctx.save(); ctx.translate(x + widths[i] * fitK / 2 + wob, ty); ctx.scale(sc, sc); ctx.globalAlpha = fade * lk;
          const fill = w.tier === 'lightning' ? `hsl(${45 + 12 * Math.sin(t * 8 + i)},100%,${62 + 10 * Math.sin(t * 6 + i)}%)` : C.color;
          outlined(ch, 0, 0, fill, '#000', 12);
          ctx.restore();
        }
        x += widths[i] * fitK;
      });
      if (k > 0.6) {
        ctx.globalAlpha = fade * Math.min(1, (k - 0.6) * 3);
        ctx.font = font(900, epic ? 50 : 42);
        outlined(fitText(w.by?.name || '', W - 120), WIN_CX, epic ? WIN_CY + r + 64 : 548, '#fff', '#000', 9);
        ctx.font = font(800, epic ? 32 : 28);
        outlined(C.sub(w), WIN_CX, epic ? WIN_CY + r + 120 : 600, C.color, '#000', 7);
      }
      ctx.restore();
    }
  }
  for (const r of wfx.rockets) {
    r.y += (r.ty - r.y) * Math.min(1, dt * 3.2) - 260 * dt; r.x += r.vx * dt;
    if (Math.random() < 0.9) wfx.sparks.push({ x: r.x + (Math.random() - 0.5) * 6, y: r.y + 10, vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 60, g: 200, life: 0.5, max: 0.5, size: 5, color: '#fde68a' });
    ctx.save(); ctx.fillStyle = '#fff'; ctx.shadowColor = r.colors[0]; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(r.x, r.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (r.y <= r.ty + 8) {
      r.done = true;
      spark(r.x, r.y, reducedMotion ? 30 : 90, r.colors, 620, 9, 240, 1.4);
      wring(r.x, r.y, r.colors[0], 220, 0.5, 8);
      fx.flash = Math.max(fx.flash, 0.12);
      sound.play('boom');
    }
  }
  wfx.rockets = wfx.rockets.filter((r) => !r.done);
  for (const p of wfx.sparks) {
    p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5)); ctx.fillStyle = p.color;
    if (p.coin) { ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size / 2 * Math.abs(Math.sin(p.life * 8)) + 1, p.size / 2, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (p.star) { const z = p.size / 2; ctx.beginPath(); ctx.moveTo(p.x, p.y - z * 2); ctx.lineTo(p.x + z * 0.4, p.y - z * 0.4); ctx.lineTo(p.x + z * 2, p.y); ctx.lineTo(p.x + z * 0.4, p.y + z * 0.4); ctx.lineTo(p.x, p.y + z * 2); ctx.lineTo(p.x - z * 0.4, p.y + z * 0.4); ctx.lineTo(p.x - z * 2, p.y); ctx.lineTo(p.x - z * 0.4, p.y - z * 0.4); ctx.closePath(); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  wfx.sparks = wfx.sparks.filter((p) => p.life > 0 && p.y < H + 60);
}

// ---------------- giọng MC (ElevenLabs) ----------------
// Server gửi file mp3 câu chúc mừng / cảm ơn; phát lần lượt, không chồng tiếng. Có giọng MC thì tắt giọng đọc của trình duyệt.
let voiceOn = false; // giọng MC còn hoạt động (bật + còn ngân sách credit)
let voiceMinGift = 1; // quà nhỏ hơn: trình duyệt tự đọc
const voiceQueue = [];
let voicePlaying = null;
function playNextVoice() {
  if (voicePlaying || !voiceQueue.length) return;
  const v = voiceQueue.shift();
  const a = new Audio(v.url);
  a.volume = 1;
  voicePlaying = a;
  const done = () => { if (voicePlaying === a) { voicePlaying = null; setTimeout(playNextVoice, 250); } };
  a.onended = done; a.onerror = done;
  a.play().catch(done);
}
function onVoice(v) {
  if (opt.mute || !opt.tts) return;
  if (voiceQueue.length >= 4) voiceQueue.shift();
  voiceQueue.push(v);
  playNextVoice();
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
      cfg = msg.config; G = msg.wg; voiceOn = !!msg.voice?.enabled; voiceMinGift = msg.voice?.minGiftDiamonds ?? 1;
      if (first) {
        sound = new SoundBoard({ muted: opt.mute, theme: 'game' }); // không mõ, không chuông chùa, không nhạc nền tụng kinh
        sound.init();
        if (started) sound.resume();
        setTimeout(() => { if (!opt.mute && !opt.phone && sound.suspended) soundBtn.style.display = 'block'; }, 800);
      }
    } else if (msg.type === 'wg') {
      G = msg.wg;
    } else if (msg.type === 'wgfx') {
      for (const e of msg.effects) handle(e);
    } else if (msg.type === 'voice_state') {
      voiceOn = !!msg.voice?.enabled; voiceMinGift = msg.voice?.minGiftDiamonds ?? 1;
    } else if (msg.type === 'voice' && msg.game === 'wg') {
      onVoice(msg.voice);
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
  const label = G.paused ? `⏸ ${m}:${s}` : G.phase === 'playing' ? `⏱ ${m}:${s}` : `Vòng mới sau ${G.remaining}s`;
  ctx.font = font(800, 30);
  const urgent = !G.paused && G.phase === 'playing' && G.remaining <= 20;
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
  const isEmoji = (t) => /^[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f\s]+$/u.test(t);
  const hintYs = [];
  for (const hnt of hints) { const big = isEmoji(hnt); hintYs.push(cy + (big ? 28 : 0)); cy += hintGap + (big ? 58 : 0); }
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
    if (isEmoji(hnt)) { // gợi ý bằng emoji: hiện to
      // emoji to (84px), cách nhau rộng, luôn 1 hàng: quá rộng thì tự thu nhỏ
      const ems = hnt.trim().split(/\s+/);
      let size = 84;
      const efont = (z) => `${z}px 'Noto Color Emoji', 'Apple Color Emoji', sans-serif`;
      ctx.save(); ctx.font = efont(size); ctx.fillStyle = '#000'; ctx.textAlign = 'left';
      let ws = ems.map((e) => ctx.measureText(e).width);
      let gap = size * 0.4, total = ws.reduce((a, b) => a + b, 0) + gap * (ems.length - 1);
      if (total > W - 140) { const k = (W - 140) / total; size = Math.floor(size * k); ctx.font = efont(size); ws = ems.map((e) => ctx.measureText(e).width); gap *= k; total = ws.reduce((a, b) => a + b, 0) + gap * (ems.length - 1); }
      let ex = W / 2 - total / 2;
      ems.forEach((e, k) => { ctx.fillText(e, ex, hintYs[i]); ex += ws[k] + gap; });
      ctx.restore(); ctx.font = font(700, hintFont);
      return;
    }
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

const CELL = { hit: '#16a34a', near: '#ca8a04', part: '#ca8a04', miss: 'rgba(255,255,255,.08)', na: 'rgba(255,255,255,.04)' };
const attrVal = (v) => (Array.isArray(v) ? v.join(' + ') : v || '—');
const ARROW = { up: '↑', down: '↓' };
/** Chế độ thuộc tính: hàng tiêu đề 6 thuộc tính · dòng ĐÃ BIẾT · các từ đoán (6 ô xanh / vàng / xám). */
function drawAttrBoard(t) {
  const top = L.secretBottom + 26, rowH = 58, x = 40, w = W - 80;
  const attrs = G.attrs || [];
  const list = (G.ranked || []).slice(0, L.secretBottom > 800 ? 4 : L.secretBottom > 740 ? 5 : 6);
  const headH = 150; // tiêu đề + tên thuộc tính + dòng ĐÃ BIẾT
  const h = headH + Math.max(1, list.length) * rowH + 14;
  L.rankTop = top; L.rankBottom = top + h;
  ctx.save();
  rr(x, top, w, h, 24); ctx.fillStyle = 'rgba(15,18,60,.86)'; ctx.fill();
  ctx.strokeStyle = 'rgba(74,222,128,.6)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.font = font(800, 24); ctx.fillStyle = '#bbf7d0';
  ctx.fillText('🧩 GIỐNG TỪ BÍ MẬT NHẤT', x + 26, top + 30);
  ctx.textAlign = 'right'; ctx.font = font(600, 17); ctx.fillStyle = 'rgba(199,210,254,.85)';
  ctx.fillText(`🟩 trúng · 🟨 gần / một phần · ↑↓ đáp án cao/thấp hơn · ${G.totalGuesses || 0} từ`, x + w - 26, top + 30);
  const cw = (w - 250 - 20) / Math.max(6, attrs.length), cx0 = x + w - 20 - cw * attrs.length;
  if (!attrs.length) {
    ctx.textAlign = 'center'; ctx.font = font(600, 24); ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText('Đang chuẩn bị thuộc tính… bình luận một từ bất kỳ!', W / 2, top + 100);
    ctx.restore(); return;
  }
  // tên 6 thuộc tính
  attrs.forEach((a, i) => {
    const cx = cx0 + i * cw + cw / 2;
    ctx.textAlign = 'center'; ctx.font = font(700, 30); ctx.fillStyle = '#000';
    ctx.fillText(a.locked ? '🔒' : a.icon, cx, top + 66);
    ctx.font = font(800, 17); ctx.fillStyle = a.locked ? '#fde68a' : '#fff';
    ctx.fillText(fitText(a.locked ? `${a.name}: mở sau ${a.unlockIn} từ` : a.name, cw - 6), cx, top + 92);
  });
  // dòng ĐÃ BIẾT
  const ky = top + 106;
  (G.known || []).forEach((v, i) => {
    const bx = cx0 + i * cw + 3;
    rr(bx, ky, cw - 6, 40, 10);
    ctx.fillStyle = v ? 'rgba(22,163,74,.85)' : 'rgba(255,255,255,.06)'; ctx.fill();
    ctx.strokeStyle = v ? '#86efac' : 'rgba(255,255,255,.2)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = font(800, v ? 15 : 22); ctx.fillStyle = '#fff';
    ctx.fillText(v ? fitText(attrVal(v), cw - 12) : attrs[i]?.locked ? '🔒' : '?', bx + (cw - 6) / 2, ky + 21);
  });
  if (!list.length) {
    ctx.textAlign = 'center'; ctx.font = font(600, 22); ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText('Bình luận một từ — ô xanh là giống từ bí mật!', W / 2, top + headH + rowH / 2);
  }
  const now = performance.now();
  list.forEach((r, i) => {
    const target = top + headH + i * rowH;
    const cur = fx.rowY.has(r.word) ? lerp(fx.rowY.get(r.word), target, 0.18) : target + 30;
    fx.rowY.set(r.word, cur);
    const hl = fx.highlight.get(r.word);
    const hk = hl ? Math.max(0, 1 - (now - hl) / 1500) : 0;
    const y = cur;
    rr(x + 16, y + 4, w - 32, rowH - 8, 14);
    ctx.fillStyle = hk > 0 ? `rgba(250,204,21,${0.15 + hk * 0.25})` : 'rgba(255,255,255,.04)'; ctx.fill();
    ctx.textAlign = 'center'; ctx.font = font(800, 18); ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText(String(i + 1), x + 40, y + rowH / 2);
    ctx.textAlign = 'left'; ctx.font = font(800, 25); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(r.word, 165), x + 62, y + rowH / 2 - 8);
    ctx.font = font(600, 14); ctx.fillStyle = 'rgba(255,255,255,.65)';
    const open = (r.cells || []).filter((c, k) => !attrs[k]?.locked);
    ctx.fillText(fitText(`${r.by?.name || ''}${r.count > 1 ? ` +${r.count - 1}` : ''} · ${open.filter((c) => c.s === 'hit').length}/${open.length || attrs.length}`, 170), x + 62, y + rowH / 2 + 14);
    (r.cells || []).forEach((c, k) => {
      const bx = cx0 + k * cw + 3;
      rr(bx, y + 8, cw - 6, rowH - 16, 8);
      if (attrs[k]?.locked) { // cột khoá: chưa cho xem
        ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();
        ctx.textAlign = 'center'; ctx.font = font(700, 18); ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.fillText('🔒', bx + (cw - 6) / 2, y + rowH / 2);
        return;
      }
      ctx.fillStyle = CELL[c.s] || CELL.miss; ctx.fill();
      ctx.textAlign = 'center'; ctx.font = font(700, 14); ctx.fillStyle = c.s === 'miss' || c.s === 'na' ? 'rgba(255,255,255,.6)' : '#fff';
      const arrow = c.dir && c.s !== 'hit' ? ARROW[c.dir] : '';
      if (arrow) {
        ctx.fillText(fitText(attrVal(c.v), cw - 34), bx + (cw - 6) / 2 - 9, y + rowH / 2);
        ctx.font = font(900, 22); ctx.fillStyle = c.dir === 'up' ? '#fca5a5' : '#93c5fd';
        ctx.fillText(arrow, bx + cw - 20, y + rowH / 2);
      } else ctx.fillText(fitText(attrVal(c.v), cw - 12), bx + (cw - 6) / 2, y + rowH / 2);
    });
  });
  ctx.restore();
}

function drawRanking(t) {
  if (G.mode === 'attr') return drawAttrBoard(t);
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
    const attrMode = !!f.cells;
    const sc = f.pending ? '…' : attrMode ? `${f.score}/6` : String(f.score);
    const tw = ctx.measureText(label).width;
    const w = tw + 150;
    rr(40, y - 24, w, 48, 24);
    ctx.fillStyle = 'rgba(15,18,60,.85)'; ctx.fill();
    const col = attrMode ? scoreColor(Math.round((f.score / 6) * 100)) : scoreColor(f.score);
    ctx.strokeStyle = f.pending ? 'rgba(255,255,255,.3)' : col; ctx.lineWidth = 2; ctx.stroke();
    avatar(f.by, 66, y, 16, teamColor(teamOfUser(f.by?.id)) || 'rgba(255,255,255,.7)');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.fillText(label, 92, y + 1);
    ctx.textAlign = 'right'; ctx.font = font(900, 26);
    ctx.fillStyle = f.pending ? 'rgba(255,255,255,.6)' : col;
    ctx.fillText(sc, 40 + w - 18, y + 1);
  });
  ctx.restore();
}

function drawGuide() {
  const items = G.team?.on
    ? ['💬 Bình luận 1 từ để đoán', `👥 "${G.team.teams[0].keyword}" / "${G.team.teams[1].keyword}" để vào đội`, '⚡ Đoán sớm = nhiều điểm']
    : ['💬 Bình luận 1 từ để đoán', '⚡ Đoán sớm = nhiều điểm', '🔁 Share / 🎁 quà = điểm thưởng'];
  ctx.save();
  ctx.font = font(800, 21); ctx.textBaseline = 'middle';
  const pad = 14, gap = 10;
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

const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(n || 0);
/** Bảng xếp hạng tuần (góc phải, ngang hàng "Vừa đoán"). */
function drawChampions() {
  const wk = G.weekly;
  const list = wk?.top || [];
  ctx.save();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  ctx.font = font(800, 20); ctx.fillStyle = '#fde68a';
  ctx.fillText('🏆 ĐIỂM TUẦN NÀY', W - 50, L.feedY - 44);
  if (!list.length) {
    ctx.font = font(700, 20); ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText('Chưa ai ghi điểm — đoán ngay!', W - 50, L.feedY);
  }
  const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
  list.slice(0, 4).forEach((c, i) => {
    const y = L.feedY + i * 50;
    ctx.font = font(800, 22);
    const label = `${medals[i]} ${clip(c.name, 10)} · ${fmtN(c.points)}đ`;
    const w = ctx.measureText(label).width + 30;
    rr(W - 40 - w, y - 21, w, 42, 21);
    ctx.fillStyle = i === 0 ? 'rgba(120,80,0,.9)' : 'rgba(15,18,60,.85)'; ctx.fill();
    ctx.strokeStyle = i === 0 ? '#facc15' : 'rgba(250,204,21,.4)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = i === 0 ? '#fde68a' : '#fff'; ctx.fillText(label, W - 55, y + 1);
  });
  ctx.restore();
}

/** Banner trên cùng: Vua tuần trước (được chủ kênh trao quà) hoặc lời mời đua top tuần. */
const teamColor = (id) => G?.team?.teams?.find((t) => t.id === id)?.color || null;
const teamOfUser = (uid) => G?.team?.members?.[uid] || null;

/** Đấu đội: thanh tỉ số 2 đội + trận / vòng. */
function drawTeamBar(t) {
  const tm = G.team;
  const [a, b] = tm.teams;
  const y = 230, h = 62, x0 = 40, w = W - 80;
  ctx.save();
  rr(x0, y, w, h, 31); ctx.fillStyle = 'rgba(10,14,40,.9)'; ctx.fill();
  const total = Math.max(1, a.score + b.score);
  const split = x0 + w * (a.score + b.score ? a.score / total : 0.5);
  ctx.save(); rr(x0, y, w, h, 31); ctx.clip();
  ctx.fillStyle = a.color; ctx.globalAlpha = 0.55; ctx.fillRect(x0, y, split - x0, h);
  ctx.fillStyle = b.color; ctx.fillRect(split, y, x0 + w - split, h);
  ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillRect(split - 2, y, 4, h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; rr(x0, y, w, h, 31); ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.font = font(900, 26); ctx.fillStyle = '#fff';
  ctx.textAlign = 'left'; ctx.fillText(`${a.icon} ${a.name} · ${fmtN(a.score)}`, x0 + 22, y + h / 2 + 1);
  ctx.textAlign = 'right'; ctx.fillText(`${fmtN(b.score)} · ${b.name} ${b.icon}`, x0 + w - 22, y + h / 2 + 1);
  // giữa: trận / vòng
  const label = `TRẬN ${tm.matchNo} · ${Math.min(tm.round, tm.rounds)}/${tm.rounds}`;
  ctx.font = font(900, 18); const lw = ctx.measureText(label).width + 26;
  rr(W / 2 - lw / 2, y + h - 14, lw, 28, 14); ctx.fillStyle = '#facc15'; ctx.fill();
  ctx.fillStyle = '#1f2937'; ctx.textAlign = 'center'; ctx.fillText(label, W / 2, y + h);
  ctx.restore();
}

function drawKing(t) {
  if (G.team?.on) return drawTeamBar(t);
  const wk = G.weekly;
  if (!wk) return;
  const y = 236, h = 54;
  ctx.save();
  const g = ctx.createLinearGradient(40, y, W - 40, y);
  g.addColorStop(0, 'rgba(120,70,0,.92)'); g.addColorStop(0.5, 'rgba(180,120,10,.92)'); g.addColorStop(1, 'rgba(120,70,0,.92)');
  rr(40, y, W - 80, h, 27); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.stroke();
  // ánh sáng chạy qua banner
  const sx = ((t * 260) % (W + 400)) - 200;
  const sh = ctx.createLinearGradient(sx - 80, 0, sx + 80, 0);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.25)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save(); rr(40, y, W - 80, h, 27); ctx.clip(); ctx.fillStyle = sh; ctx.fillRect(40, y, W - 80, h); ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (wk.king) {
    avatar(wk.king, 82, y + h / 2, 20, '#fde68a');
    ctx.font = font(900, 25); ctx.fillStyle = '#fff7d6';
    ctx.fillText(fitText(`👑 VUA TUẦN TRƯỚC: ${wk.king.name} · ${fmtN(wk.king.points)} điểm`, W - 200), W / 2 + 16, y + h / 2 + 1);
  } else {
    ctx.font = font(800, 23); ctx.fillStyle = '#fff7d6';
    ctx.fillText(fitText('👑 Top 1 điểm tuần được ghim tên + nhận quà từ chủ kênh!', W - 140), W / 2, y + h / 2 + 1);
  }
  ctx.restore();
}

function drawEnd(t) {
  if (G.phase !== 'ended') return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, L.rankTop - 6, W, 640);
  const y = L.rankTop + 54;
  const win = G.winner;
  const WT = win ? WIN_TIERS[win.tier] || WIN_TIERS.hint3 : null;
  rr(80, y, W - 160, win?.points ? 505 : 470, 34);
  if (WT) { const g = ctx.createLinearGradient(0, y, 0, y + 505); g.addColorStop(0, WT.card[0]); g.addColorStop(1, WT.card[1]); ctx.fillStyle = g; } else ctx.fillStyle = '#3730a3';
  ctx.fill();
  ctx.strokeStyle = WT && win.tier === 'lightning' ? `hsl(45,100%,${60 + 15 * Math.sin(t * 5)}%)` : WT ? WT.color : '#fff'; ctx.lineWidth = 6; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(900, 36); ctx.fillStyle = WT ? WT.color : '#fff';
  ctx.fillText(WT ? `${WT.title} · ${win.seconds ?? ''}s` : '⏰ HẾT GIỜ!', W / 2, y + 56);
  ctx.font = font(600, 26); ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText('Đáp án là', W / 2, y + 108);
  const s = 1 + 0.04 * Math.sin(t * 6);
  ctx.save();
  ctx.translate(W / 2, y + 180); ctx.scale(s, s);
  ctx.font = font(900, 78);
  outlined(fitText((G.answer || G.secret || '').toUpperCase(), W - 240), 0, 0, '#fde68a', 'rgba(0,0,0,.5)', 10);
  ctx.restore();
  if (win) {
    avatar(win, W / 2, y + 290, 52, '#fde68a');
    ctx.font = font(800, 32); ctx.fillStyle = '#fff';
    ctx.fillText(fitText(win.name, 600), W / 2, y + 372);
    const p = win.points;
    if (p) {
      ctx.font = font(900, 34); ctx.fillStyle = '#fde68a';
      ctx.fillText(`+${fmtN(p.total)} điểm tuần${p.rank ? ` · hạng #${p.rank}` : ''}`, W / 2, y + 412);
      const tmw = win.team && G.team?.teams?.find((x) => x.id === win.team);
      const parts = [tmw && `${tmw.icon} ${tmw.name} +${fmtN(win.teamPoints)}`, `gốc ${p.base}`, `⚡ nhanh +${p.speed}`, p.likeBonus && `❤️ tim +${p.likeBonus}`, p.comboBonus && `🔥 combo x${p.mult} +${fmtN(p.comboBonus)}`, p.shareBonus && `🔁 share +${p.shareBonus}`, p.giftBonus && `🎁 quà +${fmtN(p.giftBonus)}`].filter(Boolean);
      ctx.font = font(700, 21); ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillText(fitText(parts.join(' · '), W - 220), W / 2, y + 446);
    }
  } else {
    const best = (G.ranked || [])[0];
    ctx.font = font(700, 28); ctx.fillStyle = '#fff';
    if (best) ctx.fillText(fitText(`Gần nhất: ${best.word} (${best.score}) — ${best.by?.name || ''}`, W - 220), W / 2, y + 300);
  }
  ctx.font = font(600, 22); ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText(`Vòng mới sau ${G.remaining}s`, W / 2, y + (win?.points ? 478 : 440));
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

function drawThanks(dt) {
  if (!thanks.cur && thanks.queue.length) {
    const c = thanks.queue.shift();
    c.age = 0; c.dur = [2.6, 3.2, 4.2, 5.5][c.tier];
    thanks.cur = c;
    sound.play(['chime', 'bell', 'levelup', 'levelup'][c.tier], { pitch: 1.4 });
    if (c.tier >= 2) confetti(c.tier === 3 ? 260 : 140);
    if (c.tier === 3) fx.flash = Math.max(fx.flash, 0.6);
    const gift = `${c.repeat > 1 ? c.repeat + ' ' : ''}${giftVi(c.giftName)}`;
    if (!(voiceOn && (c.diamonds || 0) >= voiceMinGift)) speak(c.tier >= 2 ? `Cảm ơn ${speakName(c.by?.name)} đã tặng ${gift}! Yêu bạn nhiều lắm!` : `Cảm ơn ${speakName(c.by?.name)} đã tặng ${gift}`);
    for (let i = 0; i < 10 + c.tier * 10; i++) {
      thanks.hearts.push({ x: W / 2 + (Math.random() - 0.5) * 500, y: THANKS_Y + Math.random() * 60, vx: (Math.random() - 0.5) * 160, vy: -180 - Math.random() * 260, life: 1, s: 26 + Math.random() * 22, e: ['❤️', '💖', '💕', '🌹', '✨'][i % 5] });
    }
  }
  // tim bay
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
  for (const h of thanks.hearts) {
    h.life -= dt * 0.6; h.x += h.vx * dt; h.y += h.vy * dt; h.vy += 40 * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, h.life * 1.5));
    ctx.font = `${Math.round(h.s)}px 'Noto Color Emoji', 'Apple Color Emoji', sans-serif`;
    ctx.fillText(h.e, h.x, h.y);
  }
  ctx.restore();
  thanks.hearts = thanks.hearts.filter((h) => h.life > 0);
  const c = thanks.cur;
  if (!c) return;
  c.age += dt;
  if (c.age > c.dur) { thanks.cur = null; return; }
  const k = Math.min(ease(c.age / 0.35), ease((c.dur - c.age) / 0.35));
  const colors = ['#f472b6', '#facc15', '#fb923c', '#f43f5e'];
  const col = colors[c.tier];
  const big = c.tier >= 2;
  const w = big ? 940 : 820, h = big ? 230 : 150, x = (W - w) / 2, y = THANKS_Y - h / 2;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(W / 2, y + h / 2); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); ctx.translate(-W / 2, -(y + h / 2));
  rr(x, y, w, h, 34);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(30,10,50,.96)'); g.addColorStop(1, 'rgba(80,10,60,.96)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = big ? 7 : 5; ctx.stroke();
  // ánh sáng chạy viền cho quà lớn
  if (big) { ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(c.age * 8)})`; ctx.lineWidth = 2; ctx.stroke(); }
  const ar = big ? 72 : 52;
  avatar(c.by, x + 30 + ar, y + h / 2, ar, col);
  const gi = avatarImg(c.giftImage);
  if (gi) ctx.drawImage(gi, x + w - (big ? 150 : 110), y + h / 2 - (big ? 60 : 45), big ? 120 : 90, big ? 120 : 90);
  const tx = x + 60 + ar * 2, tw = w - (tx - x) - (gi ? (big ? 160 : 120) : 30);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = font(900, big ? 30 : 24); ctx.fillStyle = col;
  ctx.fillText(c.tier === 3 ? '💎 CẢM ƠN ĐẠI GIA!' : c.tier === 2 ? '🎉 CẢM ƠN NHIỀU LẮM!' : '💖 CẢM ƠN', tx, y + h * 0.27);
  ctx.font = font(900, big ? 50 : 38); ctx.fillStyle = '#fff';
  ctx.fillText(fitText(c.by?.name || 'bạn', tw), tx, y + h * 0.55);
  ctx.font = font(700, big ? 28 : 23); ctx.fillStyle = '#fde68a';
  ctx.fillText(fitText(`đã tặng ${c.repeat > 1 ? c.repeat + ' × ' : ''}${c.giftName}${c.bonusTotal ? ` · 🎯 +${c.bonusTotal} điểm khi đoán đúng` : c.diamonds ? ` · ${c.diamonds} xu` : ''}`, tw), tx, y + h * 0.81);
  ctx.restore();
}

/** Hết trận đấu đội: công bố đội thắng, tỉ số, MVP (trong lúc nghỉ giữa hai vòng). */
function drawMatchOver(t) {
  const mo = G.team?.on && G.team.matchOver;
  if (!mo || G.phase !== 'ended') return;
  const tms = G.team.teams;
  const win = tms.find((x) => x.id === mo.winner);
  const k = Math.min(1, (performance.now() - (fx.matchAt || 0)) / 400);
  ctx.save();
  ctx.globalAlpha = fx.matchAt ? k : 1;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 300, W, 1000);
  const x = 70, y = 520, w = W - 140, h = 560;
  rr(x, y, w, h, 40);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, win ? win.color : '#6366f1'); g.addColorStop(1, 'rgba(15,18,60,.98)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#facc15'; ctx.lineWidth = 6; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(800, 30); ctx.fillStyle = '#fde68a';
  ctx.fillText(`KẾT THÚC TRẬN ${mo.matchNo}`, W / 2, y + 60);
  const s = 1 + 0.05 * Math.sin(t * 5);
  ctx.save(); ctx.translate(W / 2, y + 140); ctx.scale(s, s);
  ctx.font = font(900, 64);
  outlined(win ? `🏆 ${win.name.toUpperCase()} THẮNG!` : '🤝 HOÀ!', 0, 0, '#fff', 'rgba(0,0,0,.5)', 10);
  ctx.restore();
  ctx.font = font(900, 56);
  ctx.fillStyle = tms[0].color; ctx.fillText(fmtN(mo.score[tms[0].id]), W / 2 - 170, y + 250);
  ctx.fillStyle = '#fff'; ctx.font = font(800, 40); ctx.fillText('–', W / 2, y + 250);
  ctx.font = font(900, 56); ctx.fillStyle = tms[1].color; ctx.fillText(fmtN(mo.score[tms[1].id]), W / 2 + 170, y + 250);
  ctx.font = font(700, 24); ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(`${tms[0].icon} ${tms[0].name}`, W / 2 - 170, y + 296); ctx.fillText(`${tms[1].name} ${tms[1].icon}`, W / 2 + 170, y + 296);
  if (mo.mvp) {
    avatar(mo.mvp, W / 2 - 150, y + 390, 40, teamColor(mo.mvp.team) || '#fde68a');
    ctx.textAlign = 'left';
    ctx.font = font(800, 22); ctx.fillStyle = '#fde68a'; ctx.fillText('⭐ MVP CỦA TRẬN', W / 2 - 96, y + 372);
    ctx.font = font(900, 30); ctx.fillStyle = '#fff'; ctx.fillText(`${clip(mo.mvp.name, 14)} · ${fmtN(mo.mvp.points)}đ`, W / 2 - 96, y + 410);
    ctx.textAlign = 'center';
  }
  ctx.font = font(600, 22); ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.font = font(800, 24); ctx.fillStyle = '#fde68a';
  ctx.fillText(`👥 Chọn đội cho trận mới: comment "${tms[0].keyword}" / "${tms[1].keyword}"`, W / 2, y + h - 74);
  ctx.font = font(600, 22); ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText(`Trận mới sau ${G.remaining}s · đã chọn: ${tms.map((x) => `${x.icon} ${x.count}`).join('  ')}`, W / 2, y + h - 38);
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
    c.life -= dt; c.vy += c.g * dt;
    // sức cản không khí: bay chậm dần, rơi lả tả
    const drag = Math.pow(0.12, dt); c.vx *= drag; c.vy = c.vy > 260 ? c.vy * drag + 260 * (1 - drag) : c.vy;
    c.x += c.vx * dt + Math.sin(c.flip) * 20 * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.flip += c.vf * dt;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
    ctx.globalAlpha = Math.min(1, c.life * 1.5);
    ctx.fillStyle = c.color;
    const sy = Math.cos(c.flip); // lật 3D
    if (c.shape === 'dot') { ctx.beginPath(); ctx.arc(0, 0, c.s * 0.35, 0, Math.PI * 2); ctx.fill(); }
    else if (c.shape === 'ribbon') { ctx.scale(1, sy); ctx.fillRect(-c.s * 0.15, -c.s * 1.4, c.s * 0.3, c.s * 2.8); }
    else { ctx.scale(1, sy); ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2); if (sy < 0) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2); } }
    ctx.restore();
  }
  fx.confetti = fx.confetti.filter((c) => c.life > 0 && c.y < H + 60);
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

  wfx.shake = Math.max(0, wfx.shake - dt * 1.4);
  wfx.punch = Math.max(0, wfx.punch - dt * 2.2);
  ctx.save();
  if (!reducedMotion) {
    // giật zoom lúc trúng + rung lắc (có nghiêng nhẹ)
    if (wfx.punch > 0) { const z = 1 + 0.07 * Math.sin(Math.min(1, wfx.punch) * Math.PI / 2); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
    if (wfx.shake > 0) { const k = Math.min(2.4, wfx.shake); ctx.translate((Math.random() - 0.5) * 30 * k, (Math.random() - 0.5) * 24 * k); ctx.translate(W / 2, H / 2); ctx.rotate((Math.random() - 0.5) * 0.012 * k); ctx.translate(-W / 2, -H / 2); }
  }
  drawBackground(t);
  drawKing(t);
  drawHeader();
  drawSecret(t);
  drawRanking(t);
  drawGuide();
  drawFeed();
  drawChampions();
  drawFloaters(dt);
  drawEnd(t);
  drawBanner(dt);
  drawMatchOver(t);
  drawThanks(dt);
  drawWinFx(t, dt);
  drawCombo(dt);
  drawConfetti(dt);
  ctx.restore();
  drawPaused(t);
  if (fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (opt.debug) {
    ctx.font = font(700, 20); ctx.textAlign = 'left';
    outlined(`${Math.round(fps)} fps · ws ${wsOk ? 'OK' : 'mất'}`, 20, 40, wsOk ? '#9f9' : '#f88', '#000', 4);
  }
  requestAnimationFrame(frame);
}

// Game tạm dừng (chưa live / admin bấm dừng): phủ mờ + thẻ thông báo, đồng hồ đứng yên
function drawPaused(t) {
  if (!G?.paused) return;
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
  ctx.fillText(G.pauseReason === 'offline' ? 'Chờ kênh lên live…' : 'Tạm nghỉ một chút, quay lại ngay!', W / 2, y + 165);
  ctx.restore();
}

connect();
(document.fonts?.ready || Promise.resolve()).finally(() => requestAnimationFrame(frame));

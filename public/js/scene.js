// Vẽ cảnh chùa bằng Canvas 2D (thủ tục, không cần ảnh).
export const W = 1080;
export const H = 1920;
export const GROUND = 1150; // mặt sân chùa
export const PROP_Y = 1440; // chân đồ vật tiền cảnh (lư hương, mõ, chuông)
export const PROP_SCALE = 0.8;
const TEMPLE_SCALE = 1.1;

export const PALETTES = {
  day: {
    sky: ['#5fb3f0', '#a9dcf7', '#fbe7c6'],
    mountains: ['#8fb6c9', '#6f9aa8', '#4f7a72'],
    mist: 'rgba(255,255,255,0.35)',
    ground: ['#6f8f4a', '#4e6b34'],
    court: ['#cbb995', '#a8946d'],
    sun: '#fff4c2',
    night: false,
  },
  dusk: {
    sky: ['#2b2457', '#c4607a', '#ffc27a'],
    mountains: ['#6b4f78', '#4c3a62', '#2f2a48'],
    mist: 'rgba(255,190,150,0.25)',
    ground: ['#4c5a35', '#2f3a22'],
    court: ['#a88d6d', '#7a6550'],
    sun: '#ffd27a',
    night: false,
  },
  night: {
    sky: ['#050816', '#12204a', '#2e3b6e'],
    mountains: ['#24305a', '#1a2447', '#111832'],
    mist: 'rgba(160,180,255,0.12)',
    ground: ['#22301f', '#141d13'],
    court: ['#5b5246', '#3e382f'],
    sun: '#f4f1d9',
    night: true,
  },
};

const C = {
  tile: '#8c2f1c', tileDark: '#5c1c10', tileLight: '#b5482b',
  wood: '#6b3a1f', woodDark: '#43230f', pillar: '#a3241a', pillarDark: '#6e150f',
  wall: '#f1dcab', wallDark: '#cdb27a', stone: '#a59d8f', stoneDark: '#7b7468',
  gold: '#f5c542', goldDark: '#b8862a', door: '#ffcd6b', thatch: '#c9a35a', thatchDark: '#8a6a30',
  bronze: '#9a6a2f', bronzeDark: '#5e3f17',
};

// ---------- tiện ích ----------
function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export function lerp(a, b, t) { return a + (b - a) * t; }
export const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3));

function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

// ---------- nền ----------
const stars = (() => { const r = rand(7); return Array.from({ length: 140 }, () => [r() * W, r() * 1000, r() * 1.8 + 0.4, r() * 6]); })();
const clouds = (() => { const r = rand(11); return Array.from({ length: 6 }, () => [r() * W, 640 + r() * 260, 0.6 + r() * 0.8, 6 + r() * 10]); })();

function mountainPath(ctx, seed, baseY, amp, step) {
  const r = rand(seed);
  const phases = [r() * 6, r() * 6, r() * 6];
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W + step; x += step) {
    const y = baseY
      - amp * (0.55 + 0.45 * Math.sin(x / 190 + phases[0]))
      - amp * 0.35 * Math.sin(x / 73 + phases[1])
      - amp * 0.12 * Math.sin(x / 23 + phases[2]);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
}

export function drawBackground(ctx, P, t) {
  ctx.fillStyle = vgrad(ctx, 0, GROUND, P.sky);
  ctx.fillRect(0, 0, W, GROUND + 2);

  if (P.night) {
    for (const [x, y, s, ph] of stars) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 1.5 + ph);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // mặt trời / trăng
  const sx = 820, sy = P.night ? 700 : 760;
  const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 260);
  glow.addColorStop(0, P.sun);
  glow.addColorStop(0.25, P.sun + '88');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 260, sy - 260, 520, 520);
  ctx.fillStyle = P.sun;
  ctx.beginPath(); ctx.arc(sx, sy, 58, 0, Math.PI * 2); ctx.fill();

  // mây trôi
  for (const [x0, y, s, sp] of clouds) {
    const x = ((x0 + t * sp) % (W + 400)) - 200;
    ctx.fillStyle = P.night ? 'rgba(180,190,230,0.10)' : 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, 110 * s, 26 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 60 * s, y - 14 * s, 70 * s, 26 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 50 * s, y - 8 * s, 60 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // núi ba lớp
  const layers = [[3, GROUND - 190, 260, 8], [5, GROUND - 110, 200, 6], [9, GROUND - 30, 120, 5]];
  layers.forEach(([seed, base, amp, step], i) => {
    mountainPath(ctx, seed, base, amp, step);
    ctx.fillStyle = P.mountains[i];
    ctx.fill();
    ctx.fillStyle = P.mist;
    ctx.fillRect(0, base - 30, W, 60);
  });

  // mặt đất
  ctx.fillStyle = vgrad(ctx, GROUND, H, P.ground);
  ctx.fillRect(0, GROUND, W, H - GROUND);
  // sân lát đá hình thang
  ctx.fillStyle = vgrad(ctx, GROUND, H, P.court);
  ctx.beginPath();
  ctx.moveTo(150, GROUND); ctx.lineTo(930, GROUND);
  ctx.lineTo(W + 200, H); ctx.lineTo(-200, H);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 12; i++) {
    const y = GROUND + Math.pow(i / 12, 1.6) * (H - GROUND);
    const k = (y - GROUND) / (H - GROUND);
    ctx.beginPath(); ctx.moveTo(lerp(150, -200, k), y); ctx.lineTo(lerp(930, W + 200, k), y); ctx.stroke();
  }
}

// ---------- cấu kiện kiến trúc ----------
/** Mái cong kiểu Việt với đầu đao vểnh. baseY = mép dưới mái. */
function roof(ctx, cx, baseY, w, h, opts = {}) {
  const hw = w / 2;
  const topW = hw * (opts.topRatio ?? 0.5);
  const flare = opts.flare ?? 34;
  const top = baseY - h;
  const fill = opts.fill || C.tile;
  ctx.beginPath();
  ctx.moveTo(cx - hw - flare * 0.6, baseY - flare);
  ctx.quadraticCurveTo(cx - hw + 10, baseY + 6, cx - hw + flare * 1.6, baseY + 2);
  ctx.lineTo(cx + hw - flare * 1.6, baseY + 2);
  ctx.quadraticCurveTo(cx + hw - 10, baseY + 6, cx + hw + flare * 0.6, baseY - flare);
  ctx.quadraticCurveTo(cx + hw - 10, baseY - h * 0.45, cx + topW, top);
  ctx.lineTo(cx - topW, top);
  ctx.quadraticCurveTo(cx - hw + 10, baseY - h * 0.45, cx - hw - flare * 0.6, baseY - flare);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, top, 0, baseY);
  g.addColorStop(0, opts.light || C.tileLight);
  g.addColorStop(1, fill);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = opts.edge || C.tileDark;
  ctx.lineWidth = 4;
  ctx.stroke();

  // vân ngói
  if (opts.tiles !== false) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    for (let x = cx - hw - 40; x < cx + hw + 40; x += 18) {
      ctx.beginPath();
      const k = (x - cx) / hw;
      ctx.moveTo(cx + k * topW, top);
      ctx.lineTo(x, baseY + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // bờ nóc
  const ridgeH = opts.ridgeH ?? 12;
  ctx.fillStyle = opts.edge || C.tileDark;
  ctx.fillRect(cx - topW - 8, top - ridgeH, topW * 2 + 16, ridgeH + 2);
  // đầu đao hai bên nóc
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * (topW + 8), top - ridgeH);
    ctx.quadraticCurveTo(cx + s * (topW + 30), top - ridgeH, cx + s * (topW + 34), top - ridgeH - 22);
    ctx.lineTo(cx + s * (topW + 22), top - ridgeH - 4);
    ctx.lineTo(cx + s * (topW + 8), top + 2);
    ctx.closePath();
    ctx.fill();
  }
  // đầu đao góc mái
  ctx.strokeStyle = opts.gold ? C.gold : (opts.edge || C.tileDark);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * (hw + flare * 0.6), baseY - flare);
    ctx.quadraticCurveTo(cx + s * (hw + flare * 0.9), baseY - flare - 14, cx + s * (hw + flare * 0.5), baseY - flare - 26);
    ctx.stroke();
  }
  if (opts.gold) {
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - hw + flare * 1.6, baseY + 2);
    ctx.lineTo(cx + hw - flare * 1.6, baseY + 2);
    ctx.stroke();
  }
  return top - ridgeH;
}

/** "Lưỡng long chầu nguyệt" trên nóc mái. */
function ridgeOrnament(ctx, cx, y, w, t) {
  ctx.save();
  ctx.fillStyle = C.gold;
  ctx.strokeStyle = C.goldDark;
  ctx.lineWidth = 3;
  // mặt trăng / ngọc
  const glow = ctx.createRadialGradient(cx, y - 26, 2, cx, y - 26, 40);
  glow.addColorStop(0, 'rgba(255,230,140,0.9)');
  glow.addColorStop(1, 'rgba(255,230,140,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 40, y - 66, 80, 80);
  ctx.fillStyle = C.gold;
  ctx.beginPath(); ctx.arc(cx, y - 26, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // lửa quanh ngọc
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.45;
    const fl = 8 + 4 * Math.sin(t * 6 + i);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 14, y - 26 + Math.sin(a) * 14);
    ctx.lineTo(cx + Math.cos(a) * (20 + fl), y - 26 + Math.sin(a) * (20 + fl));
    ctx.stroke();
  }
  // hai rồng uốn lượn
  for (const s of [-1, 1]) {
    ctx.lineWidth = 9;
    ctx.strokeStyle = C.gold;
    ctx.beginPath();
    const x0 = cx + s * w * 0.48, x1 = cx + s * 26;
    ctx.moveTo(x0, y - 4);
    ctx.bezierCurveTo(lerp(x0, x1, 0.3), y - 40, lerp(x0, x1, 0.6), y + 20, x1, y - 24);
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.beginPath(); ctx.arc(x1, y - 24, 8, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.goldDark;
    ctx.beginPath(); ctx.moveTo(x0, y - 4); ctx.lineTo(x0 - s * 14, y - 26); ctx.stroke();
  }
  ctx.restore();
}

/** Nền đá + thân nhà có cột và cửa. Trả về y đỉnh tường. */
function hallBody(ctx, cx, baseY, w, h, opts = {}) {
  const hw = w / 2;
  const plat = opts.platform ?? 26;
  // nền bậc
  ctx.fillStyle = C.stone;
  ctx.fillRect(cx - hw - 30, baseY - plat, w + 60, plat);
  ctx.fillStyle = C.stoneDark;
  ctx.fillRect(cx - hw - 30, baseY - 6, w + 60, 6);
  // bậc thềm
  if (opts.steps) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? C.stone : '#b8b0a2';
      ctx.fillRect(cx - 70 - i * 12, baseY - plat + 8 * i, 140 + i * 24, 9);
    }
  }
  const y0 = baseY - plat - h;
  // tường
  ctx.fillStyle = vgrad(ctx, y0, baseY - plat, [C.wall, C.wallDark]);
  ctx.fillRect(cx - hw, y0, w, h);
  // cột
  const n = opts.pillars ?? 6;
  const pw = Math.max(12, w / 30);
  const gap = w / (n - 1);
  // cửa giữa các cột
  for (let i = 0; i < n - 1; i++) {
    const x = cx - hw + gap * i + pw;
    const dw = gap - pw * 2;
    const isCenter = Math.abs(i - (n - 2) / 2) < 1;
    const dh = h * (isCenter ? 0.72 : 0.55);
    const dy = baseY - plat - dh;
    const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
    g.addColorStop(0, opts.glow ? '#ffe9a8' : '#3a1d0e');
    g.addColorStop(1, opts.glow ? '#e88b2c' : '#1f0f07');
    ctx.fillStyle = g;
    ctx.fillRect(x + 4, dy, dw - 8, dh);
    // song cửa
    ctx.strokeStyle = 'rgba(80,30,10,0.65)';
    ctx.lineWidth = 2;
    for (let k = 1; k < 4; k++) {
      const xx = x + 4 + ((dw - 8) * k) / 4;
      ctx.beginPath(); ctx.moveTo(xx, dy); ctx.lineTo(xx, dy + dh); ctx.stroke();
    }
  }
  for (let i = 0; i < n; i++) {
    const x = cx - hw + gap * i;
    ctx.fillStyle = vgrad(ctx, y0, baseY, [C.pillar, C.pillarDark]);
    ctx.fillRect(x - pw / 2, y0, pw, h);
  }
  // xà ngang
  ctx.fillStyle = C.wood;
  ctx.fillRect(cx - hw - 6, y0 - 4, w + 12, 16);
  if (opts.plaque) {
    ctx.fillStyle = '#5a1209';
    ctx.fillRect(cx - 70, y0 + 16, 140, 36);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
    ctx.strokeRect(cx - 70, y0 + 16, 140, 36);
    ctx.fillStyle = C.gold;
    ctx.font = "900 22px 'Noto Serif', serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(opts.plaque, cx, y0 + 35);
  }
  return y0;
}

function upperWall(ctx, cx, y, w, h) {
  ctx.fillStyle = vgrad(ctx, y - h, y, [C.wall, C.wallDark]);
  ctx.fillRect(cx - w / 2, y - h, w, h);
  ctx.fillStyle = C.wood;
  ctx.fillRect(cx - w / 2, y - h, w, 8);
  // ô cửa sổ tròn
  ctx.fillStyle = '#5a2a10';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.arc(cx + i * w * 0.28, y - h / 2 + 2, h * 0.24, 0, Math.PI * 2); ctx.fill();
  }
  return y - h;
}

/** Tháp nhiều tầng. */
function tower(ctx, cx, baseY, tiers, baseW, tierH, opts = {}) {
  let w = baseW;
  let y = baseY;
  ctx.fillStyle = C.stone;
  ctx.fillRect(cx - w / 2 - 14, y - 18, w + 28, 18);
  y -= 18;
  for (let i = 0; i < tiers; i++) {
    const bw = w * 0.62;
    const bh = tierH * 0.55;
    ctx.fillStyle = vgrad(ctx, y - bh, y, [C.wall, C.wallDark]);
    ctx.fillRect(cx - bw / 2, y - bh, bw, bh);
    ctx.fillStyle = opts.glow ? '#ffd47a' : '#4a230e';
    ctx.fillRect(cx - bw * 0.14, y - bh * 0.85, bw * 0.28, bh * 0.7);
    y -= bh;
    y = roof(ctx, cx, y, w, tierH * 0.45, { flare: w * 0.1, topRatio: 0.42, ridgeH: 4, tiles: false, gold: opts.gold }) + 4;
    w *= 0.86;
  }
  // chóp
  ctx.fillStyle = opts.gold ? C.gold : C.bronze;
  ctx.beginPath();
  ctx.moveTo(cx - 8, y); ctx.lineTo(cx, y - tierH * 1.1); ctx.lineTo(cx + 8, y);
  ctx.closePath(); ctx.fill();
  for (let k = 1; k <= 3; k++) {
    ctx.beginPath(); ctx.ellipse(cx, y - k * tierH * 0.22, 12 - k * 2, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  return y - tierH * 1.1;
}

function bellPavilion(ctx, cx, baseY, t) {
  const w = 170;
  ctx.fillStyle = C.stone;
  ctx.fillRect(cx - w / 2 - 12, baseY - 20, w + 24, 20);
  const top = baseY - 20 - 150;
  ctx.fillStyle = C.pillar;
  for (const x of [-w / 2 + 8, w / 2 - 22]) ctx.fillRect(cx + x, top, 14, 150);
  // chuông treo
  const sw = Math.sin(t * 1.2) * 0.03;
  ctx.save();
  ctx.translate(cx, top + 10);
  ctx.rotate(sw);
  ctx.fillStyle = C.bronze;
  ctx.beginPath();
  ctx.moveTo(-26, 90); ctx.quadraticCurveTo(-30, 10, 0, 6); ctx.quadraticCurveTo(30, 10, 26, 90);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.bronzeDark;
  ctx.fillRect(-30, 86, 60, 8);
  ctx.restore();
  let y = roof(ctx, cx, top, w + 40, 60, { flare: 22, topRatio: 0.45, ridgeH: 6 });
  y = upperWall(ctx, cx, y + 4, w * 0.6, 34);
  roof(ctx, cx, y, w + 10, 54, { flare: 20, topRatio: 0.4, ridgeH: 6 });
}

function hut(ctx, cx, baseY) {
  const w = 280, h = 110;
  ctx.fillStyle = '#9b7a52';
  ctx.fillRect(cx - w / 2, baseY - h, w, h);
  ctx.fillStyle = '#3a2412';
  ctx.fillRect(cx - 34, baseY - 82, 68, 82);
  ctx.fillStyle = '#ffd47a';
  ctx.globalAlpha = 0.6;
  ctx.fillRect(cx - 26, baseY - 74, 52, 74);
  ctx.globalAlpha = 1;
  // mái tranh
  ctx.fillStyle = C.thatch;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 - 50, baseY - h + 10);
  ctx.quadraticCurveTo(cx, baseY - h - 150, cx + w / 2 + 50, baseY - h + 10);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.thatchDark;
  ctx.lineWidth = 2;
  for (let x = -w / 2 - 40; x < w / 2 + 50; x += 14) {
    ctx.beginPath(); ctx.moveTo(cx + x, baseY - h + 8); ctx.lineTo(cx + x * 0.3, baseY - h - 60); ctx.stroke();
  }
}

function foundation(ctx, cx, baseY, t) {
  ctx.fillStyle = '#8a6a48';
  ctx.beginPath(); ctx.ellipse(cx, baseY, 300, 30, 0, Math.PI, 0); ctx.fill();
  // cọc + dây căng
  ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 240, baseY - 40); ctx.lineTo(cx + 240, baseY - 40); ctx.stroke();
  ctx.fillStyle = '#5a3a1e';
  for (const x of [-240, -80, 80, 240]) ctx.fillRect(cx + x - 4, baseY - 50, 8, 50);
  // đống gạch
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4 - i; j++) {
    ctx.fillStyle = (i + j) % 2 ? '#b5482b' : '#9c3a22';
    ctx.fillRect(cx + 120 + j * 34 + i * 17, baseY - 18 - i * 16, 32, 15);
  }
  // biển gỗ
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(cx - 160, baseY - 120, 10, 120);
  ctx.fillStyle = '#c99a5b';
  ctx.fillRect(cx - 260, baseY - 170, 210, 64);
  ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 4;
  ctx.strokeRect(cx - 260, baseY - 170, 210, 64);
  ctx.fillStyle = '#3a1d0e';
  ctx.font = "800 22px 'Be Vietnam Pro', sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Nơi phát tâm', cx - 155, baseY - 150);
  ctx.fillText('xây chùa 🙏', cx - 155, baseY - 124);
  // tượng Phật nhỏ lộ thiên
  drawBuddha(ctx, cx, baseY - 8, 0.45, t, 0.9);
}

function tree(ctx, x, baseY, s, kind, t) {
  if (kind === 'areca') {
    ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = 8 * s;
    ctx.beginPath(); ctx.moveTo(x, baseY); ctx.quadraticCurveTo(x + 10 * s, baseY - 160 * s, x + 4 * s, baseY - 300 * s); ctx.stroke();
    ctx.strokeStyle = '#3f7a3a'; ctx.lineWidth = 6 * s;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.5 + Math.sin(t + i) * 0.04;
      ctx.beginPath();
      ctx.moveTo(x + 4 * s, baseY - 300 * s);
      ctx.quadraticCurveTo(x + Math.cos(a) * 60 * s, baseY - 300 * s + Math.sin(a) * 60 * s - 10 * s, x + Math.cos(a) * 100 * s, baseY - 300 * s + Math.sin(a) * 40 * s + 50 * s);
      ctx.stroke();
    }
    return;
  }
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(x - 10 * s, baseY - 110 * s, 20 * s, 110 * s);
  const r = rand(Math.round(x));
  const greens = ['#2f5d2c', '#3d7336', '#4c8a3f'];
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = greens[i % 3];
    ctx.beginPath();
    ctx.arc(x + (r() - 0.5) * 150 * s, baseY - 140 * s - r() * 100 * s, (40 + r() * 30) * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Tượng Phật ngồi toà sen (cách điệu). */
export function drawBuddha(ctx, cx, baseY, s, t, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, baseY);
  ctx.scale(s, s);
  // hào quang
  const halo = ctx.createRadialGradient(0, -230, 10, 0, -230, 170);
  halo.addColorStop(0, 'rgba(255,240,170,0.95)');
  halo.addColorStop(0.5, 'rgba(255,200,90,0.45)');
  halo.addColorStop(1, 'rgba(255,200,90,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, -230, 170, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,120,0.8)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, -250, 70 + Math.sin(t * 2) * 3, 0, Math.PI * 2); ctx.stroke();
  const gold = ctx.createLinearGradient(0, -330, 0, 0);
  gold.addColorStop(0, '#ffe08a'); gold.addColorStop(1, '#c48a26');
  ctx.fillStyle = gold;
  // toà sen
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(i * 28, -24, 22, 34, i * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#f29bb0' : '#f7b9c8';
    ctx.fill();
  }
  ctx.fillStyle = gold;
  // chân xếp bằng
  ctx.beginPath(); ctx.ellipse(0, -62, 110, 34, 0, 0, Math.PI * 2); ctx.fill();
  // thân
  ctx.beginPath();
  ctx.moveTo(-70, -70);
  ctx.quadraticCurveTo(-82, -170, -40, -200);
  ctx.lineTo(40, -200);
  ctx.quadraticCurveTo(82, -170, 70, -70);
  ctx.closePath(); ctx.fill();
  // tay kết ấn
  ctx.beginPath(); ctx.ellipse(0, -90, 40, 16, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e8b445'; ctx.fill();
  ctx.fillStyle = gold;
  // cổ + đầu
  ctx.fillRect(-14, -215, 28, 20);
  ctx.beginPath(); ctx.ellipse(0, -250, 34, 40, 0, 0, Math.PI * 2); ctx.fill();
  // tai
  ctx.beginPath(); ctx.ellipse(-34, -245, 8, 20, 0, 0, Math.PI * 2); ctx.ellipse(34, -245, 8, 20, 0, 0, Math.PI * 2); ctx.fill();
  // nhục kế
  ctx.beginPath(); ctx.arc(0, -292, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9a6a1a';
  ctx.beginPath(); ctx.arc(0, -258, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#9a6a1a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-14, -252); ctx.quadraticCurveTo(-8, -248, -4, -252);
  ctx.moveTo(14, -252); ctx.quadraticCurveTo(8, -248, 4, -252); ctx.stroke();
  ctx.restore();
}

function lanternString(ctx, y, count, t, P) {
  ctx.strokeStyle = 'rgba(60,20,10,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(250, y); ctx.quadraticCurveTo(540, y + 40, 830, y); ctx.stroke();
  for (let i = 0; i < count; i++) {
    const k = (i + 0.5) / count;
    const x = lerp(250, 830, k);
    const yy = y + 40 * 4 * k * (1 - k) * 0.5 + 6;
    lantern(ctx, x, yy, 0.6, t + i, P.night);
  }
}

export function lantern(ctx, x, y, s, t, lit = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 1.5) * 0.06);
  ctx.scale(s, s);
  if (lit) {
    const g = ctx.createRadialGradient(0, 30, 4, 0, 30, 70);
    g.addColorStop(0, 'rgba(255,120,60,0.55)'); g.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = g; ctx.fillRect(-70, -40, 140, 140);
  }
  ctx.strokeStyle = '#3a1a0a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 8); ctx.stroke();
  ctx.fillStyle = C.gold; ctx.fillRect(-12, 6, 24, 6);
  ctx.fillStyle = '#d62a1f';
  ctx.beginPath(); ctx.ellipse(0, 32, 24, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,10,5,0.6)';
  ctx.beginPath(); ctx.ellipse(0, 32, 10, 22, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = C.gold; ctx.fillRect(-12, 52, 24, 6);
  ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 5, 58); ctx.lineTo(i * 5, 78); ctx.stroke(); }
  ctx.restore();
}

function lotusPond(ctx, t) {
  const y = 1680;
  ctx.fillStyle = 'rgba(40,90,110,0.85)';
  ctx.beginPath(); ctx.ellipse(540, y, 360, 60, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const r = ((t * 20 + i * 60) % 180);
    ctx.beginPath(); ctx.ellipse(540, y, r * 2, r * 0.33, 0, 0, Math.PI * 2); ctx.stroke();
  }
  const r = rand(5);
  for (let i = 0; i < 9; i++) {
    const x = 540 + (r() - 0.5) * 600, yy = y + (r() - 0.5) * 70;
    ctx.fillStyle = '#3f7a3a';
    ctx.beginPath(); ctx.ellipse(x, yy, 30, 10, 0, 0, Math.PI * 2); ctx.fill();
    if (i % 2 === 0) lotusFlower(ctx, x + 6, yy - 6, 0.55);
  }
}

export function lotusFlower(ctx, x, y, s, rot = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  for (let i = -2; i <= 2; i++) {
    ctx.save();
    ctx.rotate(i * 0.38);
    ctx.fillStyle = Math.abs(i) === 2 ? '#f29bb0' : '#f7c3d0';
    ctx.beginPath(); ctx.ellipse(0, -18, 10, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ffd36b';
  ctx.beginPath(); ctx.arc(0, -6, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---------- lắp ráp chùa theo cấp ----------
export function drawTemple(ctx, level, t, P) {
  const cx = W / 2;
  const night = P.night;
  ctx.save();
  ctx.translate(cx, GROUND); ctx.scale(TEMPLE_SCALE, TEMPLE_SCALE); ctx.translate(-cx, -GROUND);
  if (level >= 7) {
    // bảo tháp lớn phía sau
    const g = ctx.createRadialGradient(cx, 760, 20, cx, 760, 420);
    g.addColorStop(0, 'rgba(255,220,130,0.35)'); g.addColorStop(1, 'rgba(255,220,130,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - 420, 340, 840, 840);
    tower(ctx, cx, GROUND - 120, 9, 210, 58, { gold: true, glow: night });
  }
  if (level >= 2) {
    tree(ctx, 70, GROUND + 10, 1.1, 'banyan', t);
    tree(ctx, 1010, GROUND + 10, 1.0, 'banyan', t);
  }
  if (level >= 5) tower(ctx, 150, GROUND, 5, 150, 66, { gold: level >= 6, glow: night });
  if (level >= 4) bellPavilion(ctx, 920, GROUND, t);
  if (level >= 3) {
    tree(ctx, 250, GROUND + 4, 0.75, 'areca', t);
    tree(ctx, 830, GROUND + 4, 0.75, 'areca', t);
  }

  switch (Math.min(level, 7)) {
    case 0:
      foundation(ctx, cx, GROUND, t);
      break;
    case 1:
      hut(ctx, cx, GROUND);
      break;
    case 2: {
      const y = hallBody(ctx, cx, GROUND, 440, 140, { pillars: 5, glow: true });
      roof(ctx, cx, y + 4, 540, 110, { fill: '#5a3a22', light: '#7a5434', edge: '#3a2412', flare: 30 });
      break;
    }
    case 3:
    case 4:
    case 5: {
      let y = hallBody(ctx, cx, GROUND, 540, 160, { pillars: 6, glow: true, steps: true, plaque: 'CHÙA' });
      y = roof(ctx, cx, y + 4, 660, 80, { flare: 36, topRatio: 0.62, ridgeH: 4, tiles: true });
      y = upperWall(ctx, cx, y + 6, 360, 46);
      y = roof(ctx, cx, y, 480, 100, { flare: 32, topRatio: 0.45 });
      break;
    }
    default: {
      // cấp 6-7: ba tầng mái, trang trí vàng
      let y = hallBody(ctx, cx, GROUND, 620, 170, { pillars: 7, glow: true, steps: true, plaque: 'ĐẠI HÙNG' });
      y = roof(ctx, cx, y + 4, 740, 84, { flare: 40, topRatio: 0.64, ridgeH: 4, gold: true });
      y = upperWall(ctx, cx, y + 6, 420, 46);
      y = roof(ctx, cx, y, 560, 78, { flare: 34, topRatio: 0.58, ridgeH: 4, gold: true });
      y = upperWall(ctx, cx, y + 6, 280, 38);
      y = roof(ctx, cx, y, 420, 92, { flare: 30, topRatio: 0.42, gold: true });
      ridgeOrnament(ctx, cx, y + 2, 200, t);
      break;
    }
  }

  if (level >= 6) lanternString(ctx, GROUND - 230, 6, t, P);
  ctx.restore();
  if (level >= 7) lotusPond(ctx, t);
}

// ---------- tiền cảnh ----------
function propBegin(ctx, cx, by) {
  ctx.save();
  ctx.translate(cx, by); ctx.scale(PROP_SCALE, PROP_SCALE); ctx.translate(-cx, -by);
}

export function drawIncenseBurner(ctx, sticks, t, particles) {
  const cx = W / 2, by = PROP_Y;
  propBegin(ctx, cx, by);
  // chân + thân lư
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx, by, 140, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.bronzeDark;
  for (const x of [-70, 0, 70]) ctx.fillRect(cx + x - 9, by - 40, 18, 40);
  const g = ctx.createLinearGradient(cx - 120, 0, cx + 120, 0);
  g.addColorStop(0, '#5e3f17'); g.addColorStop(0.45, '#d8a64a'); g.addColorStop(1, '#5e3f17');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - 120, by - 110);
  ctx.quadraticCurveTo(cx - 130, by - 30, cx - 60, by - 30);
  ctx.lineTo(cx + 60, by - 30);
  ctx.quadraticCurveTo(cx + 130, by - 30, cx + 120, by - 110);
  ctx.closePath(); ctx.fill();
  // quai
  ctx.strokeStyle = C.bronze; ctx.lineWidth = 10;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.arc(cx + s * 128, by - 100, 18, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke();
  }
  // miệng lư (tro)
  ctx.fillStyle = '#d9cfc0';
  ctx.beginPath(); ctx.ellipse(cx, by - 110, 120, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a5d22'; ctx.lineWidth = 6; ctx.stroke();
  // chữ Phúc
  ctx.fillStyle = '#5e3f17';
  ctx.font = "900 34px 'Noto Serif', serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('福', cx, by - 66);

  // nén nhang
  for (const s of sticks) {
    const x = cx + s.dx;
    const life = s.life; // 1 → 0
    const len = 40 + 90 * life;
    const top = by - 112 - len;
    ctx.strokeStyle = '#b4472a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, by - 108); ctx.lineTo(x + s.tilt * len, top); ctx.stroke();
    const tx = x + s.tilt * len;
    const glow = ctx.createRadialGradient(tx, top, 0, tx, top, 10);
    glow.addColorStop(0, '#fff2b0'); glow.addColorStop(0.4, '#ff6a2a'); glow.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(tx, top, 10, 0, Math.PI * 2); ctx.fill();
    if (Math.random() < 0.18) particles.push({ kind: 'smoke', x: cx + (tx - cx) * PROP_SCALE, y: by + (top - by) * PROP_SCALE, vx: (Math.random() - 0.5) * 6, vy: -28 - Math.random() * 16, life: 1, decay: 0.16 + Math.random() * 0.1, r: 4, ph: Math.random() * 6 });
  }
  ctx.restore();
}

export function drawMo(ctx, hit, t) {
  const cx = 875, by = PROP_Y;
  propBegin(ctx, cx, by);
  // đệm
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx, by, 120, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b3241a';
  ctx.beginPath(); ctx.ellipse(cx, by - 18, 112, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.gold;
  ctx.fillRect(cx - 110, by - 22, 220, 4);
  // thân mõ (nảy khi gõ): khối gỗ tròn, khe miệng phía trước, vân vảy cá
  const sq = 1 - hit * 0.08;
  ctx.save();
  ctx.translate(cx, by - 40);
  ctx.scale(1 + hit * 0.06, sq);
  const g = ctx.createRadialGradient(-34, -86, 8, 0, -55, 120);
  g.addColorStop(0, '#d9893f'); g.addColorStop(0.55, '#8f3f16'); g.addColorStop(1, '#4a1d08');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -58, 96, 66, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a1606'; ctx.lineWidth = 3; ctx.stroke();
  // vân vảy cá khắc nổi
  ctx.strokeStyle = 'rgba(60,20,4,0.55)'; ctx.lineWidth = 2.5;
  for (let r = 0; r < 2; r++) for (let k = -2; k <= 2; k++) {
    const x = k * 30 + (r ? 15 : 0), y = -98 + r * 22;
    if (Math.abs(x) > 70) continue;
    ctx.beginPath(); ctx.arc(x, y, 14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  // khe miệng mõ (rãnh tối nằm ngang ở nửa dưới)
  ctx.fillStyle = '#1e0802';
  ctx.beginPath();
  ctx.moveTo(-74, -30);
  ctx.quadraticCurveTo(0, -4, 74, -30);
  ctx.quadraticCurveTo(0, -18, -74, -30);
  ctx.closePath(); ctx.fill();
  // hai lỗ tròn đầu khe
  ctx.beginPath(); ctx.arc(-74, -31, 7, 0, Math.PI * 2); ctx.arc(74, -31, 7, 0, Math.PI * 2); ctx.fill();
  // bóng sáng
  ctx.fillStyle = 'rgba(255,220,170,0.18)';
  ctx.beginPath(); ctx.ellipse(-30, -92, 36, 14, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // dùi mõ
  const ang = -0.9 + hit * 0.9;
  ctx.save();
  ctx.translate(cx + 120, by - 160);
  ctx.rotate(ang);
  ctx.fillStyle = '#7a4a22';
  ctx.fillRect(-6, 0, 12, 110);
  ctx.fillStyle = '#c23a28';
  ctx.beginPath(); ctx.ellipse(0, 0, 20, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

export function drawBell(ctx, swing, t) {
  const cx = 200, by = PROP_Y;
  propBegin(ctx, cx, by);
  // giá chuông
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx, by, 130, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b3a1f';
  ctx.fillRect(cx - 110, by - 290, 18, 290);
  ctx.fillRect(cx + 92, by - 290, 18, 290);
  ctx.fillStyle = '#4a240f';
  ctx.fillRect(cx - 132, by - 306, 264, 22);
  ctx.fillStyle = C.tile;
  ctx.beginPath();
  ctx.moveTo(cx - 150, by - 300); ctx.quadraticCurveTo(cx, by - 350, cx + 150, by - 300);
  ctx.lineTo(cx + 130, by - 296); ctx.lineTo(cx - 130, by - 296); ctx.closePath(); ctx.fill();
  // chuông
  const a = Math.sin(t * 7) * 0.22 * swing;
  ctx.save();
  ctx.translate(cx, by - 284);
  ctx.rotate(a);
  ctx.fillStyle = '#3a2412';
  ctx.fillRect(-4, 0, 8, 16);
  const g = ctx.createLinearGradient(-70, 0, 70, 0);
  g.addColorStop(0, '#4d3312'); g.addColorStop(0.4, '#c9973f'); g.addColorStop(1, '#4d3312');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-62, 200);
  ctx.quadraticCurveTo(-70, 30, 0, 16);
  ctx.quadraticCurveTo(70, 30, 62, 200);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5e3f17';
  ctx.fillRect(-70, 192, 140, 14);
  ctx.strokeStyle = 'rgba(60,35,10,0.7)'; ctx.lineWidth = 3;
  for (const y of [70, 110, 150]) { ctx.beginPath(); ctx.moveTo(-58, y); ctx.lineTo(58, y); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, 70); ctx.lineTo(0, 150); ctx.stroke();
  ctx.restore();
  // sóng âm
  if (swing > 0.05) {
    ctx.strokeStyle = `rgba(255,220,140,${swing * 0.6})`; ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const r = 90 + ((t * 120 + i * 40) % 120);
      ctx.beginPath(); ctx.arc(cx, by - 180, r, -0.6, 0.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, by - 180, r, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke();
    }
  }
  ctx.restore();
}

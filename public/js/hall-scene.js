// Vẽ nội thất chánh điện (thủ tục, không cần ảnh). Bố cục dọc 1080x1920:
// tượng Phật trên cùng → bàn thờ → hàng bục lễ → sàn + thảm đỏ, phật tử đứng hai bên.
export const W = 1080;
export const H = 1920;
export const FLOOR_Y = 860; // mép sàn phía bàn thờ
export const BUDDHA = { x: 540, y: 722, s: 1.45 }; // chân toà sen (tượng vẽ bằng code)
export const BURNER = { x: 540, y: 768 }; // miệng lư hương trên bàn thờ
export const VP = { x: 540, y: 470 }; // điểm tụ phối cảnh
export const ALTAR = { x0: 250, x1: 830, top: 772, bottom: FLOOR_Y + 36 };
// 6 bục lễ trước bàn thờ (chừa lối thảm đỏ ở giữa)
export const PLATFORMS = [125, 268, 411, 669, 812, 955].map((x) => ({ x, y: 1046 }));
export const CARPET = { topHalf: 70, bottomHalf: 250 };

export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3));
/** Tỉ lệ người theo độ sâu (y chân). */
export const scaleAt = (y) => Math.max(0.45, Math.min(1.12, 0.5 + (y - 1000) * 0.00074));

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

// ---------------- tường, trần, cột ----------------
const ARCH = { half: 320, top: 96, spring: 400 };
/** Khung vòm khám thờ phía sau tượng. */
function archPath(ctx, bottom = FLOOR_Y) {
  const ax = BUDDHA.x, hw = ARCH.half;
  ctx.beginPath();
  ctx.moveTo(ax - hw, bottom);
  ctx.lineTo(ax - hw, ARCH.spring);
  ctx.bezierCurveTo(ax - hw, ARCH.top + 120, ax - 140, ARCH.top + 10, ax, ARCH.top);
  ctx.bezierCurveTo(ax + 140, ARCH.top + 10, ax + hw, ARCH.top + 120, ax + hw, ARCH.spring);
  ctx.lineTo(ax + hw, bottom);
}

// Vị trí trên canvas mà ảnh tượng được căn vào: đỉnh đầu và chân toà sen
export const BUDDHA_IMG_TARGET = { headTop: 172, base: 745 };

/**
 * Vẽ ảnh tượng Phật vào trong khung vòm.
 * a = { headTop, base, centerX }: vị trí (tỉ lệ 0..1 theo chiều cao/rộng ảnh) của đỉnh đầu, chân toà sen, tâm tượng.
 */
function drawBuddhaImage(ctx, img, a = {}) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const headTop = a.headTop ?? 0.26, base = a.base ?? 0.77, cx = a.centerX ?? 0.5;
  const s = (BUDDHA_IMG_TARGET.base - BUDDHA_IMG_TARGET.headTop) / ((base - headTop) * ih);
  const w = iw * s, h = ih * s;
  ctx.drawImage(img, BUDDHA.x - cx * w, BUDDHA_IMG_TARGET.headTop - headTop * ih * s, w, h);
  const v = ctx.createRadialGradient(BUDDHA.x, 430, 260, BUDDHA.x, 430, 560);
  v.addColorStop(0, 'rgba(40,10,2,0)');
  v.addColorStop(1, 'rgba(40,10,2,0.5)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, FLOOR_Y);
}

export function drawInterior(ctx, t, glow = 0, buddhaImg = null, buddhaAnchors = null) {
  // tường sau
  ctx.fillStyle = vgrad(ctx, 0, FLOOR_Y, ['#2a0903', '#5a1808', '#7a2c0c', '#4a1a07']);
  ctx.fillRect(0, 0, W, FLOOR_Y + 2);

  // vách gỗ chạm vàng hai bên khám thờ
  for (const side of [-1, 1]) {
    for (let r = 0; r < 4; r++) {
      const x = side < 0 ? 96 : W - 96 - 104;
      const y = 150 + r * 172;
      ctx.fillStyle = 'rgba(120,50,12,0.6)';
      ctx.fillRect(x, y, 104, 160);
      ctx.strokeStyle = 'rgba(232,176,74,0.6)'; ctx.lineWidth = 3;
      ctx.strokeRect(x + 6, y + 6, 92, 148);
      ctx.strokeStyle = 'rgba(232,176,74,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 52, y + 80, 28, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 52, y + 80, 14, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // khám thờ vòm vàng
  const ax = BUDDHA.x;
  ctx.save();
  archPath(ctx);
  ctx.closePath();
  const ng = ctx.createRadialGradient(ax, 400, 40, ax, 400, 460);
  ng.addColorStop(0, '#ffe7a0'); ng.addColorStop(0.35, '#f0b34a'); ng.addColorStop(0.75, '#b8661c'); ng.addColorStop(1, '#6a2a08');
  ctx.fillStyle = ng;
  ctx.fill();
  ctx.clip();
  if (buddhaImg) {
    drawBuddhaImage(ctx, buddhaImg, buddhaAnchors || {});
  } else {
    ctx.strokeStyle = 'rgba(140,70,10,0.35)'; ctx.lineWidth = 2;
    for (let r = 60; r < 520; r += 26) { ctx.beginPath(); ctx.arc(ax, 380, r, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(ax + Math.cos(a) * 120, 380 + Math.sin(a) * 120); ctx.lineTo(ax + Math.cos(a) * 520, 380 + Math.sin(a) * 520); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 9;
  archPath(ctx); ctx.stroke();
  ctx.fillStyle = '#ffcf5a';
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI + (i / 14) * Math.PI;
    flame(ctx, ax + Math.cos(a) * 338, 400 + Math.sin(a) * 318, 12, a + Math.PI / 2, t + i);
  }

  // trần + diềm
  ctx.fillStyle = vgrad(ctx, 0, 70, ['#1e0702', '#4a1606']);
  ctx.fillRect(0, 0, W, 70);
  ctx.fillStyle = vgrad(ctx, 62, 86, ['#8a2a10', '#4a1206']);
  ctx.fillRect(0, 62, W, 24);
  ctx.fillStyle = '#e8b04a';
  ctx.fillRect(0, 62, W, 3); ctx.fillRect(0, 83, W, 3);
  ctx.fillStyle = 'rgba(232,176,74,0.85)';
  for (let x = 0; x < W; x += 36) { ctx.beginPath(); ctx.moveTo(x, 86); ctx.lineTo(x + 18, 106); ctx.lineTo(x + 36, 86); ctx.closePath(); ctx.fill(); }

  // cột đỏ cuốn rồng vàng (sau lưng người)
  for (const x of [40, W - 40]) {
    const g = ctx.createLinearGradient(x - 32, 0, x + 32, 0);
    g.addColorStop(0, '#4a0c06'); g.addColorStop(0.45, '#b52a18'); g.addColorStop(1, '#3a0804');
    ctx.fillStyle = g;
    ctx.fillRect(x - 32, 86, 64, FLOOR_Y + 40 - 86);
    ctx.strokeStyle = 'rgba(245,197,66,0.85)'; ctx.lineWidth = 6;
    ctx.beginPath();
    for (let y = 120; y < FLOOR_Y + 40; y += 4) { const xx = x + Math.sin(y / 44) * 26; y === 120 ? ctx.moveTo(xx, y) : ctx.lineTo(xx, y); }
    ctx.stroke();
  }

  // đèn lồng
  palaceLantern(ctx, 175, 104, 0.95, t);
  palaceLantern(ctx, W - 175, 104, 0.95, t + 1);
  redLantern(ctx, 300, 100, 0.8, t + 2);
  redLantern(ctx, W - 300, 100, 0.8, t + 3);

  if (glow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(ax, 420, 30, ax, 420, 640);
    gg.addColorStop(0, `rgba(255,225,140,${0.55 * glow})`);
    gg.addColorStop(1, 'rgba(255,225,140,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function flame(ctx, x, y, r, rot, t) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  const k = 1 + Math.sin(t * 5) * 0.08;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.8 * k);
  ctx.quadraticCurveTo(r, -r * 0.3, 0, r * 0.6);
  ctx.quadraticCurveTo(-r, -r * 0.3, 0, -r * 1.8 * k);
  ctx.fill();
  ctx.restore();
}

function palaceLantern(ctx, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 1.2) * 0.03);
  ctx.scale(s, s);
  ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 30); ctx.stroke();
  const glow = ctx.createRadialGradient(0, 100, 10, 0, 100, 150);
  glow.addColorStop(0, 'rgba(255,170,60,0.5)'); glow.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = glow; ctx.fillRect(-150, -50, 300, 300);
  // mái lồng đèn
  ctx.fillStyle = '#c9902e';
  ctx.beginPath(); ctx.moveTo(-60, 54); ctx.quadraticCurveTo(0, 20, 60, 54); ctx.lineTo(48, 62); ctx.lineTo(-48, 62); ctx.closePath(); ctx.fill();
  for (const s2 of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s2 * 60, 54); ctx.quadraticCurveTo(s2 * 72, 50, s2 * 70, 36); ctx.lineWidth = 4; ctx.strokeStyle = '#e8b04a'; ctx.stroke(); }
  // thân lục giác
  const g = ctx.createLinearGradient(-44, 0, 44, 0);
  g.addColorStop(0, '#b0300f'); g.addColorStop(0.5, '#ffcc6a'); g.addColorStop(1, '#b0300f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-44, 62); ctx.lineTo(44, 62); ctx.lineTo(38, 150); ctx.lineTo(-38, 150); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#7a4a10'; ctx.lineWidth = 3;
  for (const xx of [-22, 0, 22]) { ctx.beginPath(); ctx.moveTo(xx, 62); ctx.lineTo(xx * 0.86, 150); ctx.stroke(); }
  ctx.fillStyle = '#c9902e';
  ctx.fillRect(-46, 148, 92, 12);
  // tua đỏ
  ctx.strokeStyle = '#d0201a'; ctx.lineWidth = 3;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 12, 160); ctx.lineTo(i * 12 + Math.sin(t * 2 + i) * 2, 200); ctx.stroke(); }
  ctx.restore();
}

export function redLantern(ctx, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 1.4) * 0.05);
  ctx.scale(s, s);
  ctx.strokeStyle = '#3a1a0a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 40); ctx.stroke();
  const glow = ctx.createRadialGradient(0, 80, 6, 0, 80, 90);
  glow.addColorStop(0, 'rgba(255,90,40,0.45)'); glow.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = glow; ctx.fillRect(-90, -10, 180, 180);
  ctx.fillStyle = '#e8b04a'; ctx.fillRect(-16, 38, 32, 8);
  ctx.fillStyle = '#d62a1f';
  ctx.beginPath(); ctx.ellipse(0, 78, 34, 32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,10,5,0.6)';
  ctx.beginPath(); ctx.ellipse(0, 78, 14, 32, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#e8b04a'; ctx.fillRect(-16, 108, 32, 8);
  ctx.strokeStyle = '#e8b04a';
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 6, 116); ctx.lineTo(i * 6, 142); ctx.stroke(); }
  ctx.restore();
}

// ---------------- tượng Phật ----------------
export function drawGreatBuddha(ctx, t, glow = 0) {
  const { x: cx, y: by, s } = BUDDHA;
  ctx.save();
  ctx.translate(cx, by);
  ctx.scale(s, s);
  const headY = -262;

  // hào quang toàn thân + hào quang đầu
  const aura = ctx.createRadialGradient(0, -170, 20, 0, -170, 260);
  aura.addColorStop(0, `rgba(255,226,150,${0.35 + 0.35 * glow})`);
  aura.addColorStop(0.6, `rgba(240,170,60,${0.18 + 0.3 * glow})`);
  aura.addColorStop(1, 'rgba(255,200,90,0)');
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.ellipse(0, -170, 230, 260, 0, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(255,225,140,0.9)';
  ctx.lineWidth = 3;
  for (const r of [62, 74]) { ctx.beginPath(); ctx.arc(0, headY, r + Math.sin(t * 1.5) * 1.5, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,214,110,0.9)';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + t * 0.1;
    flame(ctx, Math.cos(a) * 86, headY + Math.sin(a) * 86, 7, a + Math.PI / 2, t + i);
  }

  const gold = ctx.createLinearGradient(-120, -330, 120, 0);
  gold.addColorStop(0, '#ffe6a0');
  gold.addColorStop(0.3, '#e9b347');
  gold.addColorStop(0.65, '#b97618');
  gold.addColorStop(1, '#7a4508');
  const goldDark = '#8a5412';

  // toà sen 3 lớp cánh
  const petalRow = (n, y, rx, ry, w, h, c1, c2) => {
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1) - 0.5;
      const x = k * rx * 2;
      const pg = ctx.createLinearGradient(0, y - h, 0, y);
      pg.addColorStop(0, c1); pg.addColorStop(1, c2);
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(x, y - h - Math.abs(k) * ry);
      ctx.quadraticCurveTo(x + w, y - h * 0.4, x, y);
      ctx.quadraticCurveTo(x - w, y - h * 0.4, x, y - h - Math.abs(k) * ry);
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,80,20,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  };
  petalRow(11, 6, 150, -20, 22, 52, '#ffe7a8', '#d9962e');
  petalRow(9, -12, 128, -18, 22, 50, '#fff2c4', '#e3a640');
  ctx.fillStyle = gold;
  ctx.beginPath(); ctx.ellipse(0, -40, 132, 16, 0, 0, Math.PI * 2); ctx.fill();

  // chân xếp bằng + nếp áo
  ctx.fillStyle = gold;
  ctx.beginPath(); ctx.ellipse(0, -70, 128, 40, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,70,10,0.55)'; ctx.lineWidth = 2.5;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(i * 30, -100); ctx.quadraticCurveTo(i * 34 + 10, -70, i * 36, -38); ctx.stroke();
  }

  // thân
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(-58, -212);
  ctx.quadraticCurveTo(-96, -196, -100, -150);
  ctx.quadraticCurveTo(-104, -100, -88, -78);
  ctx.lineTo(88, -78);
  ctx.quadraticCurveTo(104, -100, 100, -150);
  ctx.quadraticCurveTo(96, -196, 58, -212);
  ctx.closePath(); ctx.fill();
  // cà sa vắt chéo
  ctx.fillStyle = 'rgba(160,90,20,0.35)';
  ctx.beginPath();
  ctx.moveTo(-58, -212); ctx.quadraticCurveTo(10, -150, 80, -84); ctx.lineTo(96, -100);
  ctx.quadraticCurveTo(40, -170, -20, -214); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(120,70,10,0.5)'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(-50 + i * 16, -200 + i * 6); ctx.quadraticCurveTo(0 + i * 10, -150, 40 + i * 12, -96); ctx.stroke();
  }
  // tay kết ấn thiền định
  ctx.fillStyle = '#e4ad44';
  ctx.beginPath(); ctx.ellipse(0, -96, 50, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = goldDark; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -100, 30, 8, 0, Math.PI, 0); ctx.stroke();

  // cổ ba ngấn
  ctx.fillStyle = gold;
  ctx.fillRect(-18, -232, 36, 26);
  ctx.strokeStyle = 'rgba(120,70,10,0.6)';
  for (const y of [-224, -216]) { ctx.beginPath(); ctx.moveTo(-16, y); ctx.quadraticCurveTo(0, y + 4, 16, y); ctx.stroke(); }
  // tai dài
  ctx.fillStyle = gold;
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 37, headY + 6, 9, 26, sx * 0.08, 0, Math.PI * 2); ctx.fill(); }
  // mặt
  ctx.beginPath(); ctx.ellipse(0, headY, 36, 43, 0, 0, Math.PI * 2); ctx.fill();
  // tóc xoắn ốc
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, headY - 4, 38, 44, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(36, headY - 14); ctx.quadraticCurveTo(0, headY - 24, -36, headY - 14); ctx.closePath();
  ctx.fillStyle = '#b07a22'; ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#e7b24a';
  for (let y = headY - 50; y < headY - 10; y += 8) for (let x = -40; x < 40; x += 8) {
    ctx.beginPath(); ctx.arc(x + ((y / 8) % 2) * 4, y, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // nhục kế
  ctx.fillStyle = '#b07a22';
  ctx.beginPath(); ctx.ellipse(0, headY - 50, 20, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e7b24a';
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-12 + (i % 4) * 8, headY - 56 + Math.floor(i / 4) * 7, 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ffe9a0';
  flame(ctx, 0, headY - 70, 6, 0, t);
  // nét mặt
  ctx.strokeStyle = '#7a4a10'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(-14, headY - 4, 10, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.beginPath(); ctx.arc(14, headY - 4, 10, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-20, headY + 4); ctx.quadraticCurveTo(-14, headY + 8, -8, headY + 4);
  ctx.moveTo(8, headY + 4); ctx.quadraticCurveTo(14, headY + 8, 20, headY + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, headY + 4); ctx.quadraticCurveTo(-4, headY + 16, 0, headY + 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-7, headY + 27); ctx.quadraticCurveTo(0, headY + 31, 7, headY + 27); ctx.stroke();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath(); ctx.arc(0, headY - 12, 2.6, 0, Math.PI * 2); ctx.fill();
  // highlight
  ctx.fillStyle = 'rgba(255,255,230,0.25)';
  ctx.beginPath(); ctx.ellipse(-14, headY - 18, 10, 16, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-50, -170, 14, 40, 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---------------- bàn thờ ----------------
export function lotusFlower(ctx, x, y, s, rot = 0, gold = false) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  for (let i = -2; i <= 2; i++) {
    ctx.save();
    ctx.rotate(i * 0.38);
    ctx.fillStyle = gold ? (Math.abs(i) === 2 ? '#e0a83a' : '#ffd36b') : (Math.abs(i) === 2 ? '#f08aa6' : '#f8bfd0');
    ctx.beginPath(); ctx.ellipse(0, -18, 10, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ffd36b';
  ctx.beginPath(); ctx.arc(0, -6, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function flowerVase(ctx, x, y, t) {
  // bình
  const g = ctx.createLinearGradient(x - 26, 0, x + 26, 0);
  g.addColorStop(0, '#6a4410'); g.addColorStop(0.45, '#f2cf7a'); g.addColorStop(1, '#6a4410');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 14, y - 96); ctx.lineTo(x + 14, y - 96);
  ctx.quadraticCurveTo(x + 8, y - 70, x + 30, y - 40);
  ctx.quadraticCurveTo(x + 34, y - 6, x + 16, y);
  ctx.lineTo(x - 16, y);
  ctx.quadraticCurveTo(x - 34, y - 6, x - 30, y - 40);
  ctx.quadraticCurveTo(x - 8, y - 70, x - 14, y - 96);
  ctx.fill();
  // bó hoa
  const r = rand(Math.round(x));
  ctx.strokeStyle = '#3f6a2a'; ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const fx = x + (r() - 0.5) * 120, fy = y - 150 - r() * 90;
    ctx.beginPath(); ctx.moveTo(x, y - 96); ctx.quadraticCurveTo(x, fy + 40, fx, fy); ctx.stroke();
  }
  const leaf = ['#2f5a24', '#3f7a32'];
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = leaf[i % 2];
    ctx.beginPath(); ctx.ellipse(x + (r() - 0.5) * 110, y - 120 - r() * 60, 18, 8, r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 14; i++) {
    const fx = x + (r() - 0.5) * 130, fy = y - 140 - r() * 110;
    ctx.fillStyle = i % 3 ? '#f7a8c0' : '#ffe0ea';
    ctx.beginPath(); ctx.arc(fx, fy + Math.sin(t + i) * 1.5, 13 + r() * 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(200,60,100,0.35)';
    ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill();
  }
}

function fruitPlate(ctx, x, y) {
  ctx.fillStyle = '#c9902e';
  ctx.fillRect(x - 6, y - 26, 12, 26);
  ctx.beginPath(); ctx.ellipse(x, y - 28, 50, 10, 0, 0, Math.PI * 2); ctx.fill();
  const rows = [5, 4, 3, 2, 1];
  rows.forEach((n, ri) => {
    for (let i = 0; i < n; i++) {
      const fx = x + (i - (n - 1) / 2) * 20;
      const fy = y - 40 - ri * 16;
      const g = ctx.createRadialGradient(fx - 4, fy - 4, 1, fx, fy, 11);
      g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#e08a1a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx, fy, 10.5, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function candle(ctx, x, y, t) {
  ctx.fillStyle = '#c9902e';
  ctx.fillRect(x - 14, y - 10, 28, 10);
  ctx.fillRect(x - 4, y - 50, 8, 40);
  ctx.fillStyle = '#d62a1f';
  ctx.fillRect(x - 9, y - 110, 18, 62);
  const fl = 1 + Math.sin(t * 9 + x) * 0.12;
  const g = ctx.createRadialGradient(x, y - 124, 1, x, y - 124, 40);
  g.addColorStop(0, 'rgba(255,220,120,0.8)'); g.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = g; ctx.fillRect(x - 40, y - 164, 80, 80);
  ctx.fillStyle = '#fff3c0';
  ctx.beginPath();
  ctx.moveTo(x, y - 112 - 22 * fl);
  ctx.quadraticCurveTo(x + 7, y - 116, x, y - 110);
  ctx.quadraticCurveTo(x - 7, y - 116, x, y - 112 - 22 * fl);
  ctx.fill();
}

/** Bàn thờ: trả về toạ độ đặt hoa sen dâng. */
/** Bàn thờ sơn son thếp vàng + đồ thờ + hoa sen đã dâng. */
export function drawAltar(ctx, t, lotusOfferings) {
  const { x0, x1, top, bottom } = ALTAR;
  flowerVase(ctx, 300, top, t);
  flowerVase(ctx, 780, top, t + 1);
  fruitPlate(ctx, 382, top);
  fruitPlate(ctx, 698, top);
  candle(ctx, 452, top, t);
  candle(ctx, 628, top, t + 2);

  lotusOfferings.forEach((o, i) => {
    const slot = LOTUS_SLOTS[i % LOTUS_SLOTS.length];
    lotusFlower(ctx, slot[0], slot[1] + Math.sin(t * 1.5 + i) * 1.5, 0.75, 0, o.gold);
  });

  // lư hương đồng
  const bx = BURNER.x, by = BURNER.y;
  ctx.fillStyle = '#5e3f17';
  for (const dx of [-36, 0, 36]) ctx.fillRect(bx + dx - 5, by + 16, 10, top - by - 4);
  const g = ctx.createLinearGradient(bx - 64, 0, bx + 64, 0);
  g.addColorStop(0, '#5e3f17'); g.addColorStop(0.45, '#f0c060'); g.addColorStop(1, '#5e3f17');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(bx - 64, by);
  ctx.quadraticCurveTo(bx - 70, by + 36, bx - 30, by + 38);
  ctx.lineTo(bx + 30, by + 38);
  ctx.quadraticCurveTo(bx + 70, by + 36, bx + 64, by);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d9cfc0';
  ctx.beginPath(); ctx.ellipse(bx, by, 64, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a5d22'; ctx.lineWidth = 4; ctx.stroke();

  // thân bàn thờ
  ctx.fillStyle = vgrad(ctx, top, bottom, ['#8a1a0e', '#5a0e06']);
  ctx.beginPath();
  ctx.moveTo(x0 - 20, top); ctx.lineTo(x1 + 20, top); ctx.lineTo(x1 + 10, bottom); ctx.lineTo(x0 - 10, bottom); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8b04a';
  ctx.fillRect(x0 - 24, top - 6, x1 - x0 + 48, 9);
  ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 3;
  ctx.strokeRect(x0 + 10, top + 16, x1 - x0 - 20, bottom - top - 30);
  ctx.fillStyle = '#e8b04a';
  ctx.font = "900 40px 'Noto Serif', serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('卍', BUDDHA.x, (top + bottom) / 2 + 2);
  ctx.strokeStyle = 'rgba(232,176,74,0.7)'; ctx.lineWidth = 2.5;
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const cx = BUDDHA.x + sx * (85 + i * 68), cy = (top + bottom) / 2;
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + sx * 16, cy + 5, 8, Math.PI, Math.PI * 2.6); ctx.stroke();
  }
}

export const LOTUS_SLOTS = [
  [478, 752], [602, 752], [430, 758], [650, 758], [505, 744], [575, 744],
  [372, 762], [708, 762], [455, 738], [625, 738], [540, 734], [338, 752],
];

// ---------------- sàn bóng + thảm đỏ ----------------
function carpetAt(y) {
  const k = (y - FLOOR_Y) / (H - FLOOR_Y);
  return lerp(CARPET.topHalf, CARPET.bottomHalf, k);
}

export function drawFloor(ctx, t) {
  ctx.fillStyle = vgrad(ctx, FLOOR_Y, H, ['#8a4e1a', '#d39a48', '#b4762c', '#7a4416']);
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  const rg = ctx.createRadialGradient(BUDDHA.x, FLOOR_Y + 60, 20, BUDDHA.x, FLOOR_Y + 60, 760);
  rg.addColorStop(0, 'rgba(255,225,150,0.5)'); rg.addColorStop(1, 'rgba(255,225,150,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  // phản chiếu đèn
  for (const x of [175, W - 175, 300, W - 300]) {
    const g = ctx.createRadialGradient(x, FLOOR_Y + 140, 4, x, FLOOR_Y + 140, 120);
    g.addColorStop(0, 'rgba(255,200,120,0.35)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 120, FLOOR_Y + 20, 240, 240);
  }
  // gạch phối cảnh
  ctx.strokeStyle = 'rgba(90,45,10,0.3)'; ctx.lineWidth = 2;
  for (let i = -14; i <= 14; i++) {
    const xb = W / 2 + i * 120;
    const k = (FLOOR_Y - VP.y) / (H - VP.y);
    ctx.beginPath(); ctx.moveTo(lerp(VP.x, xb, k), FLOOR_Y); ctx.lineTo(xb, H); ctx.stroke();
  }
  for (let i = 1; i < 16; i++) {
    const y = FLOOR_Y + Math.pow(i / 16, 1.5) * (H - FLOOR_Y);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // bậc thềm trước bàn thờ
  ctx.fillStyle = '#9a6a30'; ctx.fillRect(200, FLOOR_Y + 30, 680, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(200, FLOOR_Y + 44, 680, 5);

  // thảm đỏ chạy từ cuối điện tới bàn thờ
  const y0 = FLOOR_Y + 48;
  ctx.fillStyle = vgrad(ctx, y0, H, ['#7a0c10', '#b3161c', '#9a1014']);
  ctx.beginPath();
  ctx.moveTo(W / 2 - carpetAt(y0), y0); ctx.lineTo(W / 2 + carpetAt(y0), y0);
  ctx.lineTo(W / 2 + carpetAt(H), H); ctx.lineTo(W / 2 - carpetAt(H), H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 4;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(W / 2 + s * (carpetAt(y0) - 10), y0); ctx.lineTo(W / 2 + s * (carpetAt(H) - 24), H); ctx.stroke();
  }
  // hoa văn trên thảm
  ctx.strokeStyle = 'rgba(232,176,74,0.55)'; ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const y = y0 + 50 + Math.pow(i / 9, 1.3) * (H - y0 - 50);
    const r = carpetAt(y) * 0.55;
    ctx.beginPath(); ctx.ellipse(W / 2, y, r, r * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2 - r * 0.6, y); ctx.lineTo(W / 2, y - r * 0.24); ctx.lineTo(W / 2 + r * 0.6, y); ctx.lineTo(W / 2, y + r * 0.24); ctx.closePath(); ctx.stroke();
  }
}

/** Hàng 6 bục lễ (đệm quỳ) trước bàn thờ. */
export function drawPlatforms(ctx, occupied = []) {
  PLATFORMS.forEach((p, i) => {
    const w = 124, h = 40, x = p.x - w / 2, y = p.y - h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 24, w * 0.55, 10, 0, 0, Math.PI * 2); ctx.fill();
    // mặt trên + thành đệm
    ctx.fillStyle = '#2c2350';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y + 10, w, h, 8) : ctx.rect(x, y + 10, w, h); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + 26);
    g.addColorStop(0, occupied[i] ? '#6a58b8' : '#5a4a9a'); g.addColorStop(1, '#3d3274');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 4, y, w - 8, 28, 10) : ctx.rect(x + 4, y, w - 8, 28); ctx.fill();
    ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y + 10, w, h, 8) : ctx.rect(x, y + 10, w, h); ctx.stroke();
    // hoa văn vàng trên thành đệm
    ctx.fillStyle = 'rgba(232,176,74,0.8)';
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + 18 + k * 22, y + 38, 3, 0, Math.PI * 2); ctx.fill(); }
  });
}

/** Khóm sen hai góc dưới. */
export function drawSideDecor(ctx, t) {
  for (const [x, y, sc] of [[30, 1690, 2.1], [110, 1760, 1.5], [W - 30, 1690, 2.1], [W - 110, 1760, 1.5]]) {
    ctx.fillStyle = '#2f6a2a';
    ctx.beginPath(); ctx.ellipse(x, y + 18 * sc, 34 * sc, 10 * sc, 0, 0, Math.PI * 2); ctx.fill();
    lotusFlower(ctx, x, y + Math.sin(t + x) * 2, sc);
  }
}

// ---------------- mõ + chuông trên bàn thờ ----------------
export function drawMoSmall(ctx, x, y, hit) {
  ctx.fillStyle = '#b3241a';
  ctx.beginPath(); ctx.ellipse(x, y, 52, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(x, y - 6);
  ctx.scale(1 + hit * 0.08, 1 - hit * 0.1);
  const g = ctx.createRadialGradient(-14, -40, 4, 0, -28, 60);
  g.addColorStop(0, '#d9893f'); g.addColorStop(0.6, '#8f3f16'); g.addColorStop(1, '#4a1d08');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -28, 46, 32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1e0802';
  ctx.beginPath(); ctx.moveTo(-36, -14); ctx.quadraticCurveTo(0, -2, 36, -14); ctx.quadraticCurveTo(0, -8, -36, -14); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x + 56, y - 74);
  ctx.rotate(-0.8 + hit * 0.8);
  ctx.fillStyle = '#7a4a22'; ctx.fillRect(-4, 0, 8, 60);
  ctx.fillStyle = '#c23a28'; ctx.beginPath(); ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawBowlBell(ctx, x, y, ring, t) {
  ctx.fillStyle = '#b3241a';
  ctx.beginPath(); ctx.ellipse(x, y, 56, 14, 0, 0, Math.PI * 2); ctx.fill();
  const wob = Math.sin(t * 30) * ring * 1.5;
  const g = ctx.createLinearGradient(x - 50, 0, x + 50, 0);
  g.addColorStop(0, '#5e3f17'); g.addColorStop(0.4, '#f0c060'); g.addColorStop(1, '#5e3f17');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 48 - wob, y - 58);
  ctx.quadraticCurveTo(x - 50, y - 4, x, y - 6);
  ctx.quadraticCurveTo(x + 50, y - 4, x + 48 + wob, y - 58);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2410';
  ctx.beginPath(); ctx.ellipse(x, y - 58, 48 + wob, 9, 0, 0, Math.PI * 2); ctx.fill();
  if (ring > 0.03) {
    ctx.strokeStyle = `rgba(255,225,150,${ring * 0.8})`; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const r = 50 + ((t * 90 + i * 30) % 90);
      ctx.beginPath(); ctx.ellipse(x, y - 40, r, r * 0.6, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
  }
}

// ---------------- phật tử mặc áo tràng (nhìn từ phía sau) ----------------
const ROBES = ['#7f9cc4', '#8fa9cf', '#6b4630', '#7a5238', '#e9e6de', '#9aa4b2', '#5f4a3a', '#7d93b8'];
const HAIRS = ['#1b1410', '#241a12', '#2e2218', '#14100c', '#8f8f8f'];

export function personLook(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h >>>= 0;
  return {
    robe: ROBES[h % ROBES.length],
    hair: HAIRS[(h >> 4) % HAIRS.length],
    style: (h >> 8) % 4, // 0 tóc ngắn, 1 búi, 2 tóc dài, 3 khăn / tóc bạc búi thấp
  };
}

/**
 * Vẽ một người tại chân (x, y), tỉ lệ s.
 * pose: 'stand' | 'walk' | 'kneel'; bow 0..1 (lạy); phase: nhịp bước khi đi.
 */
export function drawPerson(ctx, x, y, s, look, pose = 'stand', bow = 0, phase = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(40,15,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 2, 34, 9, 0, 0, Math.PI * 2); ctx.fill();
  const robe = look.robe, dark = shade(robe, -38), light = shade(robe, 22);

  if (pose === 'kneel') {
    // lòng bàn chân lộ ra phía sau
    ctx.fillStyle = '#f0c9a0';
    ctx.beginPath(); ctx.ellipse(-13, -3, 8, 5, 0, 0, Math.PI * 2); ctx.ellipse(13, -3, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    // phần áo phủ chân
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(0, -16, 34, 18, 0, Math.PI, 0); ctx.fill();
    // thân trên, cúi xuống khi lạy
    const th = 62 * (1 - bow * 0.62);
    const g = ctx.createLinearGradient(-26, 0, 26, 0);
    g.addColorStop(0, dark); g.addColorStop(0.45, robe); g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-30, -16);
    ctx.quadraticCurveTo(-30, -16 - th * 0.7, -19, -16 - th);
    ctx.quadraticCurveTo(0, -22 - th, 19, -16 - th);
    ctx.quadraticCurveTo(30, -16 - th * 0.7, 30, -16);
    ctx.closePath(); ctx.fill();
    drawHead(ctx, 0, -16 - th - 16 + bow * 8, look, 1 - bow * 0.15);
    ctx.restore();
    return;
  }

  const walk = pose === 'walk';
  const sw = walk ? Math.sin(phase * 9) : 0;
  const bob = walk ? Math.abs(Math.sin(phase * 9)) * -4 : 0;
  ctx.translate(0, bob);
  // chân / giày khi đi
  if (walk) {
    ctx.fillStyle = '#2a1d14';
    ctx.beginPath(); ctx.ellipse(-9 + sw * 6, -2, 7, 4, 0, 0, Math.PI * 2); ctx.ellipse(9 - sw * 6, -2, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  // áo tràng dài
  const g = ctx.createLinearGradient(-30, 0, 30, 0);
  g.addColorStop(0, dark); g.addColorStop(0.4, light); g.addColorStop(0.6, robe); g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-17, -122);
  ctx.quadraticCurveTo(-26, -118, -27, -100);
  ctx.lineTo(-30 - sw * 3, -6);
  ctx.quadraticCurveTo(0, 0, 30 + sw * 3, -6);
  ctx.lineTo(27, -100);
  ctx.quadraticCurveTo(26, -118, 17, -122);
  ctx.closePath(); ctx.fill();
  // tay áo rộng
  ctx.fillStyle = shade(robe, -20);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * 22, -112);
    ctx.quadraticCurveTo(sx * 36, -90, sx * 33, -62);
    ctx.lineTo(sx * 22, -60);
    ctx.closePath(); ctx.fill();
  }
  // đường may giữa lưng + nếp áo
  ctx.strokeStyle = shade(robe, -55); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -118); ctx.lineTo(0, -8); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  for (const fx of [-14, 14]) { ctx.beginPath(); ctx.moveTo(fx, -90); ctx.lineTo(fx * 1.3 + sw * 2, -8); ctx.stroke(); }
  // cổ áo
  ctx.fillStyle = shade(robe, -30);
  ctx.fillRect(-8, -126, 16, 6);
  drawHead(ctx, 0, -142, look, 1);
  ctx.restore();
}

function drawHead(ctx, x, y, look, k) {
  const r = 17 * k;
  ctx.fillStyle = '#f0c9a0';
  ctx.beginPath(); ctx.ellipse(x - r + 1, y + 3, 4, 6, 0, 0, Math.PI * 2); ctx.ellipse(x + r - 1, y + 3, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (look.style === 2) {
    ctx.fillStyle = look.hair;
    ctx.beginPath(); ctx.ellipse(x, y + 16, 15, 20, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = look.hair;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (look.style === 1) { ctx.beginPath(); ctx.arc(x, y - r + 1, 7 * k, 0, Math.PI * 2); ctx.fill(); }
  if (look.style === 3) { ctx.beginPath(); ctx.ellipse(x, y + r - 2, 9 * k, 6 * k, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.ellipse(x - 6, y - 7, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Đài sen vàng cho người đứng đầu bảng công đức. */
export function drawSticks(ctx, incenseSticks, particles) {
  const bx = BURNER.x, by = BURNER.y;
  for (const s of incenseSticks) {
    const len = 30 + 70 * s.life;
    const x = bx + s.dx, tx = x + s.tilt * len, ty = by - len;
    ctx.strokeStyle = '#b4472a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(tx, ty); ctx.stroke();
    const gl = ctx.createRadialGradient(tx, ty, 0, tx, ty, 8);
    gl.addColorStop(0, '#fff2b0'); gl.addColorStop(0.4, '#ff6a2a'); gl.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(tx, ty, 8, 0, Math.PI * 2); ctx.fill();
    if (Math.random() < 0.22) particles.push({ kind: 'smoke', x: tx, y: ty, vx: (Math.random() - 0.5) * 6, vy: -34 - Math.random() * 18, life: 1, decay: 0.12 + Math.random() * 0.08, r: 4, ph: Math.random() * 6 });
  }

}


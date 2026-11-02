// Vẽ nội thất chánh điện (thủ tục, không cần ảnh).
export const W = 1080;
export const H = 1920;
export const FLOOR_Y = 1010; // mép sàn phía bàn thờ
export const BUDDHA = { x: 540, y: 884, s: 1.5 }; // chân toà sen
export const BURNER = { x: 540, y: 905 }; // miệng lư hương trên bàn thờ
export const VP = { x: 540, y: 640 }; // điểm tụ phối cảnh

export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3));

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
/** Khung vòm khám thờ phía sau tượng (dùng cho nền, ảnh tượng và viền). */
function archPath(ctx, bottom = FLOOR_Y - 105) {
  const ax = BUDDHA.x;
  ctx.beginPath();
  ctx.moveTo(ax - 270, bottom);
  ctx.lineTo(ax - 270, 520);
  ctx.bezierCurveTo(ax - 270, 330, ax - 120, 250, ax, 230);
  ctx.bezierCurveTo(ax + 120, 250, ax + 270, 330, ax + 270, 520);
  ctx.lineTo(ax + 270, bottom);
}

// Vị trí trên canvas mà ảnh tượng được căn vào: đỉnh đầu và chân toà sen
export const BUDDHA_IMG_TARGET = { headTop: 400, base: 915 };

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
  // viền tối nhẹ bên trong khung cho ảnh hoà vào tường
  const v = ctx.createRadialGradient(BUDDHA.x, 600, 220, BUDDHA.x, 600, 480);
  v.addColorStop(0, 'rgba(40,10,2,0)');
  v.addColorStop(1, 'rgba(40,10,2,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, FLOOR_Y);
}

export function drawInterior(ctx, t, glow = 0, buddhaImg = null, buddhaAnchors = null) {
  // tường sau
  ctx.fillStyle = vgrad(ctx, 0, FLOOR_Y, ['#1f0703', '#4a1407', '#6e2a0c', '#4a1a07']);
  ctx.fillRect(0, 0, W, FLOOR_Y + 2);

  // ô vách gỗ chạm vàng hai bên
  for (const side of [-1, 1]) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        const x = side < 0 ? 110 + c * 92 : W - 110 - 92 - c * 92;
        const y = 300 + r * 170;
        ctx.fillStyle = 'rgba(120,50,12,0.55)';
        ctx.fillRect(x, y, 84, 156);
        ctx.strokeStyle = 'rgba(230,170,70,0.55)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 5, y + 5, 74, 146);
        ctx.strokeStyle = 'rgba(230,170,70,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x + 42, y + 78, 24, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + 42, y + 78, 12, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  // khám thờ vòm vàng phía sau tượng
  const ax = BUDDHA.x;
  ctx.save();
  archPath(ctx);
  ctx.closePath();
  const ng = ctx.createRadialGradient(ax, 560, 40, ax, 560, 420);
  ng.addColorStop(0, '#ffe7a0');
  ng.addColorStop(0.35, '#f0b34a');
  ng.addColorStop(0.75, '#b8661c');
  ng.addColorStop(1, '#6a2a08');
  ctx.fillStyle = ng;
  ctx.fill();
  ctx.clip();
  if (buddhaImg) {
    drawBuddhaImage(ctx, buddhaImg, buddhaAnchors || {});
  } else {
    // hoa văn chạm khắc: vòng tròn đồng tâm và tia
    ctx.strokeStyle = 'rgba(140,70,10,0.35)';
    ctx.lineWidth = 2;
    for (let r = 60; r < 460; r += 26) { ctx.beginPath(); ctx.arc(ax, 520, r, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(ax + Math.cos(a) * 120, 520 + Math.sin(a) * 120); ctx.lineTo(ax + Math.cos(a) * 480, 520 + Math.sin(a) * 480); ctx.stroke();
    }
  }
  ctx.restore();
  // viền khám
  ctx.strokeStyle = '#ffd36b';
  ctx.lineWidth = 8;
  archPath(ctx);
  ctx.stroke();
  // ngọn lửa trang trí viền vòm
  ctx.fillStyle = '#ffcf5a';
  for (let i = 0; i <= 16; i++) {
    const k = i / 16;
    const a = Math.PI + k * Math.PI;
    const x = ax + Math.cos(a) * 285;
    const y = 520 + Math.sin(a) * 290 * (k > 0.2 && k < 0.8 ? 1 : 0.95);
    flame(ctx, x, y, 12, a + Math.PI / 2, t + i);
  }

  // trần + xà chạm
  ctx.fillStyle = vgrad(ctx, 0, 120, ['#2a0a03', '#5a1d08']);
  ctx.fillRect(0, 0, W, 120);
  for (const [y, h] of [[112, 26], [168, 18]]) {
    ctx.fillStyle = vgrad(ctx, y, y + h, ['#8a2a10', '#4a1206']);
    ctx.fillRect(0, y, W, h);
    ctx.fillStyle = '#e8b04a';
    ctx.fillRect(0, y, W, 3);
    ctx.fillRect(0, y + h - 3, W, 3);
    for (let x = 20; x < W; x += 60) { ctx.beginPath(); ctx.arc(x, y + h / 2, 4, 0, Math.PI * 2); ctx.fill(); }
  }
  // diềm treo
  ctx.fillStyle = 'rgba(232,176,74,0.85)';
  for (let x = 0; x < W; x += 36) {
    ctx.beginPath(); ctx.moveTo(x, 186); ctx.lineTo(x + 18, 210); ctx.lineTo(x + 36, 186); ctx.closePath(); ctx.fill();
  }

  // cột đỏ cuốn rồng vàng
  for (const x of [48, W - 48]) {
    ctx.fillStyle = vgrad(ctx, 0, 0, ['#000', '#000']);
    const g = ctx.createLinearGradient(x - 34, 0, x + 34, 0);
    g.addColorStop(0, '#4a0c06'); g.addColorStop(0.45, '#b52a18'); g.addColorStop(1, '#3a0804');
    ctx.fillStyle = g;
    ctx.fillRect(x - 34, 186, 68, H);
    ctx.strokeStyle = 'rgba(245,197,66,0.85)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let y = 230; y < H; y += 4) {
      const xx = x + Math.sin(y / 46) * 28;
      y === 230 ? ctx.moveTo(xx, y) : ctx.lineTo(xx, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#e8b04a';
    ctx.fillRect(x - 40, 186, 80, 14);
  }

  // đèn lồng cung đình
  palaceLantern(ctx, 170, 214, 1.0, t);
  palaceLantern(ctx, W - 170, 214, 1.0, t + 1);
  redLantern(ctx, 300, 214, 0.85, t + 2);
  redLantern(ctx, W - 300, 214, 0.85, t + 3);

  // ánh hào quang bổ sung khi có quà lớn
  if (glow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(ax, 600, 30, ax, 600, 620);
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
export function drawAltar(ctx, t, lotusOfferings) {
  const x0 = 250, x1 = 830, top = 900, bottom = FLOOR_Y + 30;
  // đồ trên bàn
  flowerVase(ctx, 300, top, t);
  flowerVase(ctx, 780, top, t + 1);
  fruitPlate(ctx, 385, top);
  fruitPlate(ctx, 695, top);
  candle(ctx, 450, top, t);
  candle(ctx, 630, top, t + 2);

  // hoa sen đã dâng (xếp quanh chân toà sen)
  lotusOfferings.forEach((o, i) => {
    const slot = LOTUS_SLOTS[i % LOTUS_SLOTS.length];
    lotusFlower(ctx, slot[0], slot[1] + Math.sin(t * 1.5 + i) * 1.5, 0.8, 0, o.gold);
  });

  // lư hương đồng
  const bx = BURNER.x, by = BURNER.y;
  ctx.fillStyle = '#5e3f17';
  for (const dx of [-40, 0, 40]) ctx.fillRect(bx + dx - 6, by + 18, 12, top - by - 6);
  const g = ctx.createLinearGradient(bx - 70, 0, bx + 70, 0);
  g.addColorStop(0, '#5e3f17'); g.addColorStop(0.45, '#f0c060'); g.addColorStop(1, '#5e3f17');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(bx - 70, by);
  ctx.quadraticCurveTo(bx - 76, by + 40, bx - 34, by + 42);
  ctx.lineTo(bx + 34, by + 42);
  ctx.quadraticCurveTo(bx + 76, by + 40, bx + 70, by);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a07020'; ctx.lineWidth = 7;
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(bx + sx * 74, by + 8, 11, sx > 0 ? -Math.PI / 2 : Math.PI / 2, sx > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke(); }
  ctx.fillStyle = '#d9cfc0';
  ctx.beginPath(); ctx.ellipse(bx, by, 70, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a5d22'; ctx.lineWidth = 4; ctx.stroke();
  // thân bàn thờ sơn son thếp vàng
  ctx.fillStyle = vgrad(ctx, top, bottom, ['#8a1a0e', '#5a0e06']);
  ctx.beginPath();
  ctx.moveTo(x0 - 20, top); ctx.lineTo(x1 + 20, top);
  ctx.lineTo(x1 + 10, bottom); ctx.lineTo(x0 - 10, bottom); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8b04a';
  ctx.fillRect(x0 - 24, top - 6, x1 - x0 + 48, 10);
  ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 3;
  ctx.strokeRect(x0 + 10, top + 20, x1 - x0 - 20, bottom - top - 40);
  // hoa văn chữ Vạn và mây
  ctx.fillStyle = '#e8b04a';
  ctx.font = "900 46px 'Noto Serif', serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('卍', BUDDHA.x, (top + bottom) / 2 + 2);
  ctx.strokeStyle = 'rgba(232,176,74,0.7)'; ctx.lineWidth = 2.5;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const cx = BUDDHA.x + sx * (90 + i * 70), cy = (top + bottom) / 2;
      ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 1.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + sx * 18, cy + 6, 9, Math.PI, Math.PI * 2.6); ctx.stroke();
    }
  }
}

export const LOTUS_SLOTS = [
  [470, 885], [610, 885], [415, 892], [665, 892], [500, 878], [580, 878],
  [360, 896], [720, 896], [440, 870], [640, 870], [540, 862], [330, 880],
];

// ---------------- sàn + thảm ----------------
export function drawFloor(ctx, t) {
  ctx.fillStyle = vgrad(ctx, FLOOR_Y, H, ['#7a4416', '#c98a3a', '#a86a24', '#6a3a12']);
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  // phản chiếu ánh vàng từ tượng
  const rg = ctx.createRadialGradient(BUDDHA.x, FLOOR_Y + 40, 20, BUDDHA.x, FLOOR_Y + 40, 700);
  rg.addColorStop(0, 'rgba(255,220,140,0.45)'); rg.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  // gạch phối cảnh
  ctx.strokeStyle = 'rgba(80,40,10,0.35)'; ctx.lineWidth = 2;
  for (let i = -12; i <= 12; i++) {
    const xb = W / 2 + i * 130;
    const k = (FLOOR_Y - VP.y) / (H - VP.y);
    ctx.beginPath(); ctx.moveTo(lerp(VP.x, xb, k), FLOOR_Y); ctx.lineTo(xb, H); ctx.stroke();
  }
  for (let i = 1; i < 14; i++) {
    const y = FLOOR_Y + Math.pow(i / 14, 1.5) * (H - FLOOR_Y);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // thảm đỏ chạy tới bàn thờ
  const cl = (y) => { const k = (y - VP.y) / (H - VP.y); return [lerp(VP.x, 300, k * 1.0), lerp(VP.x, 780, k * 1.0)]; };
  const [a0, a1] = cl(FLOOR_Y), [b0, b1] = cl(H);
  ctx.fillStyle = vgrad(ctx, FLOOR_Y, H, ['#8a0e10', '#b5161a', '#9a1014']);
  ctx.beginPath(); ctx.moveTo(a0 - 60, FLOOR_Y); ctx.lineTo(a1 + 60, FLOOR_Y); ctx.lineTo(b1 + 60, H); ctx.lineTo(b0 - 60, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(a0 - 44, FLOOR_Y); ctx.lineTo(b0 - 40, H); ctx.moveTo(a1 + 44, FLOOR_Y); ctx.lineTo(b1 + 40, H); ctx.stroke();
  // hoa văn trên thảm
  ctx.strokeStyle = 'rgba(232,176,74,0.55)'; ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const y = FLOOR_Y + 60 + Math.pow(i / 7, 1.4) * (H - FLOOR_Y - 60);
    const k = (y - VP.y) / (H - VP.y);
    const r = 26 + 50 * k;
    ctx.beginPath(); ctx.ellipse(W / 2, y, r * 1.4, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(W / 2, y, r * 0.7, r * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // bậc thềm trước bàn thờ
  ctx.fillStyle = '#b07a3a';
  ctx.fillRect(220, FLOOR_Y + 26, 640, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(220, FLOOR_Y + 42, 640, 6);
}

/** Đèn đá + chậu sen hai bên (vẽ sau sàn, trước người). */
export function drawSideDecor(ctx, t) {
  for (const [x, s] of [[110, 1], [W - 110, 1]]) {
    // đèn đá
    ctx.fillStyle = '#b8ad98';
    ctx.fillRect(x - 12, 1060, 24, 70);
    ctx.fillRect(x - 30, 1126, 60, 14);
    ctx.fillRect(x - 26, 1010, 52, 50);
    ctx.fillStyle = '#ffd77a';
    ctx.globalAlpha = 0.7 + 0.2 * Math.sin(t * 3 + x);
    ctx.fillRect(x - 16, 1020, 32, 30);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#9a8f7a';
    ctx.beginPath(); ctx.moveTo(x - 44, 1012); ctx.lineTo(x, 980); ctx.lineTo(x + 44, 1012); ctx.closePath(); ctx.fill();
  }
  // khóm sen góc dưới
  for (const [x, y, sc] of [[40, 1640, 2.2], [120, 1700, 1.6], [W - 40, 1640, 2.2], [W - 120, 1700, 1.6], [30, 1340, 1.5], [W - 30, 1340, 1.5]]) {
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

// ---------------- phật tử chibi (nhìn từ phía sau, quỳ lạy) ----------------
const ROBES = ['#6f86a8', '#8a8f98', '#5f7d6a', '#8b6aa0', '#e6e1d6', '#7a5a44', '#4f6a8f', '#a07a5a', '#5a6f86'];
const HAIRS = ['#1b1410', '#2a1d14', '#3a2a1e', '#14100c', '#4a3020'];

export function personLook(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h >>>= 0;
  return {
    robe: ROBES[h % ROBES.length],
    hair: HAIRS[(h >> 4) % HAIRS.length],
    style: (h >> 8) % 4, // 0 ngắn, 1 búi, 2 tóc dài, 3 đầu cạo
  };
}

/** Vẽ phật tử tại chân (x, y), tỉ lệ s, mức cúi lạy bow 0..1. */
export function drawWorshipper(ctx, x, y, s, look, bow, walk = 0) {
  ctx.save();
  ctx.translate(x, y + Math.abs(Math.sin(walk * 10)) * -6 * (walk > 0 ? 1 : 0));
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(40,15,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 2, 36, 9, 0, 0, Math.PI * 2); ctx.fill();
  // bàn chân (lòng bàn chân lộ ra khi quỳ)
  ctx.fillStyle = '#f0c9a0';
  ctx.beginPath(); ctx.ellipse(-12, -2, 8, 5, 0, 0, Math.PI * 2); ctx.ellipse(12, -2, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  // thân áo
  const bodyH = 56 * (1 - bow * 0.28);
  const g = ctx.createLinearGradient(-30, 0, 30, 0);
  g.addColorStop(0, shade(look.robe, -30)); g.addColorStop(0.45, look.robe); g.addColorStop(1, shade(look.robe, -40));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-31, -4);
  ctx.quadraticCurveTo(-34, -bodyH * 0.6, -20, -bodyH);
  ctx.quadraticCurveTo(0, -bodyH - 8, 20, -bodyH);
  ctx.quadraticCurveTo(34, -bodyH * 0.6, 31, -4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = shade(look.robe, -50); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -bodyH + 4); ctx.lineTo(0, -6); ctx.stroke();
  // đầu
  const hy = -bodyH - 20 + bow * 10;
  const hr = 23;
  if (look.style === 2) {
    ctx.fillStyle = look.hair;
    ctx.beginPath(); ctx.ellipse(0, hy + 18, 22, 26, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#f0c9a0';
  ctx.beginPath(); ctx.ellipse(-hr + 1, hy + 2, 5, 7, 0, 0, Math.PI * 2); ctx.ellipse(hr - 1, hy + 2, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = look.style === 3 ? '#e2b48a' : look.hair;
  ctx.beginPath(); ctx.arc(0, hy, hr, 0, Math.PI * 2); ctx.fill();
  if (look.style === 1) { ctx.beginPath(); ctx.arc(0, hy - hr + 2, 9, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.ellipse(-7, hy - 9, 8, 5, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  return y - (56 + 20 + 23 + 10) * s; // đỉnh đầu
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Đài sen vàng cho người đứng đầu bảng công đức. */
export function drawGoldenLotusSeat(ctx, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  const g = ctx.createRadialGradient(0, -10, 4, 0, -10, 90);
  g.addColorStop(0, `rgba(255,220,120,${0.5 + 0.15 * Math.sin(t * 3)})`); g.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = g; ctx.fillRect(-90, -100, 180, 140);
  for (let i = -4; i <= 4; i++) {
    ctx.save();
    ctx.rotate(i * 0.32);
    const pg = ctx.createLinearGradient(0, -40, 0, 0);
    pg.addColorStop(0, '#fff0b0'); pg.addColorStop(1, '#d9962e');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(0, -20, 12, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#e8b04a';
  ctx.beginPath(); ctx.ellipse(0, 4, 46, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Nén hương cắm trên lư (vẽ sau bàn thờ) + sinh khói. */
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

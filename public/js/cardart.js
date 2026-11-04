// Vẽ lá bài Thần thú bằng canvas: mặt trước (khung kim loại theo độ hiếm, tranh, chỉ số, kỹ năng, seri) + mặt sau.
// Phần tĩnh được vẽ sẵn vào canvas phụ (cache), mỗi khung hình chỉ vẽ thêm ánh hologram / lấp lánh.
import { RARITIES, CARD_BY_ID, SKILLS, statsOf, stars } from './cards-data.js';

export const CARD_W = 500, CARD_H = 700;
const DISPLAY = "'Bungee', 'Be Vietnam Pro', system-ui, sans-serif";
const BODY = "'Be Vietnam Pro', system-ui, sans-serif";
const EMOJI = "'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif";

// Font tải chậm (Google Fonts) → chưa có thì vẽ tạm, không lưu cache, lần sau vẽ lại
const FONT_SPECS = ["400 20px 'Bungee'", "900 20px 'Be Vietnam Pro'", "800 20px 'Be Vietnam Pro'"];
for (const f of FONT_SPECS) document.fonts?.load?.(f).catch(() => {});
const fontsReady = () => !document.fonts?.check || FONT_SPECS.every((f) => document.fonts.check(f));

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }

/** Gradient kim loại của khung theo độ hiếm. */
function frameFill(c, rar, x, y, w, h) {
  const g = c.createLinearGradient(x, y, x + w, y + h);
  const stops = {
    C: ['#f4f6fa', '#9aa3b2', '#e9edf3', '#6f7887', '#dfe4ec'],
    R: ['#c9e6ff', '#2f7de0', '#9fd0ff', '#0f3f8f', '#7cc0ff'],
    E: ['#f0dcff', '#8b3fe0', '#d9b3ff', '#4a1491', '#c58cff'],
    L: ['#fff6c9', '#d4a017', '#fff0a8', '#8a6200', '#ffd75e'],
    M: ['#ff7ab8', '#ffd36e', '#7dffb2', '#6ec8ff', '#c78bff'],
  }[rar] || [];
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

/** Hoa văn nền ô tranh theo độ hiếm. */
function artPattern(c, rar, x, y, w, h) {
  const R = RARITIES[rar];
  const cx = x + w / 2, cy = y + h * 0.55;
  const g = c.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.75);
  g.addColorStop(0, R.color);
  g.addColorStop(0.35, R.deep);
  g.addColorStop(1, '#07060c');
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.save();
  c.globalAlpha = rar === 'C' ? 0.08 : 0.16;
  c.strokeStyle = '#fff'; c.fillStyle = '#fff';
  if (rar === 'R') { c.lineWidth = 3; for (let i = -h; i < w; i += 26) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + h, y); c.stroke(); } }
  if (rar === 'E') { // hoa văn quả trám
    c.lineWidth = 2;
    for (let yy = y; yy < y + h + 40; yy += 40) for (let xx = x - 40; xx < x + w + 40; xx += 46) {
      const ox = ((yy - y) / 40) % 2 ? 23 : 0;
      c.beginPath(); c.moveTo(xx + ox, yy - 20); c.lineTo(xx + ox + 18, yy); c.lineTo(xx + ox, yy + 20); c.lineTo(xx + ox - 18, yy); c.closePath(); c.stroke();
    }
  }
  if (rar === 'L' || rar === 'M') { // tia sáng toả từ tâm
    c.globalAlpha = rar === 'M' ? 0.22 : 0.2;
    c.translate(cx, cy);
    for (let i = 0; i < 24; i++) { c.rotate(Math.PI / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(w, -26); c.lineTo(w, 26); c.closePath(); c.fill(); }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (rar === 'C') { c.lineWidth = 2; for (let r = 40; r < w; r += 40) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); } }
  c.restore();
  // mây / sương dưới chân
  const fog = c.createLinearGradient(0, y + h * 0.7, 0, y + h);
  fog.addColorStop(0, 'rgba(0,0,0,0)'); fog.addColorStop(1, 'rgba(0,0,0,.65)');
  c.fillStyle = fog; c.fillRect(x, y + h * 0.7, w, h * 0.3);
}

function wrap(c, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

const faceCache = new Map();

/** Mặt trước lá bài (500×700) vẽ sẵn. inst = { card, q, serial }, owner = tên chủ thẻ (tuỳ chọn). */
export function cardFace(inst, owner = '') {
  const key = `${inst.card}|${inst.q}|${inst.serial}|${owner}`;
  let cv = faceCache.get(key);
  if (cv) return cv;
  const def = CARD_BY_ID[inst.card];
  const R = RARITIES[def.rar];
  const sk = SKILLS[def.skill];
  const st = statsOf(def.id, inst.q);
  cv = document.createElement('canvas');
  cv.width = CARD_W; cv.height = CARD_H;
  const c = cv.getContext('2d');
  const W = CARD_W, H = CARD_H;
  // khung ngoài kim loại
  rr(c, 0, 0, W, H, 34); c.fillStyle = frameFill(c, def.rar, 0, 0, W, H); c.fill();
  // viền khắc
  c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.35)'; rr(c, 8, 8, W - 16, H - 16, 28); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.5)'; rr(c, 11, 11, W - 22, H - 22, 26); c.stroke();
  // ruột thẻ tối
  rr(c, 18, 18, W - 36, H - 36, 22);
  const inner = c.createLinearGradient(0, 18, 0, H - 18);
  inner.addColorStop(0, R.deep); inner.addColorStop(0.55, '#0c0a14'); inner.addColorStop(1, R.deep);
  c.fillStyle = inner; c.fill();
  // ô tranh
  const ax = 34, ay = 74, aw = W - 68, ah = 330;
  c.save(); rr(c, ax, ay, aw, ah, 18); c.clip(); artPattern(c, def.rar, ax, ay, aw, ah);
  // bóng dưới chân
  c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.ellipse(ax + aw / 2, ay + ah - 46, 120, 24, 0, 0, Math.PI * 2); c.fill();
  // con vật: quầng sáng + emoji
  c.shadowColor = R.color; c.shadowBlur = def.rar === 'C' ? 18 : 40;
  c.font = `230px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000';
  c.fillText(def.emoji, ax + aw / 2, ay + ah / 2 + 6);
  c.shadowBlur = 0;
  c.restore();
  c.lineWidth = 4; c.strokeStyle = R.color; rr(c, ax, ay, aw, ah, 18); c.stroke();
  // dải độ hiếm + sao
  c.textBaseline = 'middle';
  c.font = `400 20px ${DISPLAY}`;
  const label = R.name.toUpperCase();
  const lw = c.measureText(label).width + 30;
  rr(c, 30, 30, lw, 34, 17); c.fillStyle = R.color; c.fill();
  c.fillStyle = def.rar === 'C' ? '#1f2430' : '#140c02'; c.textAlign = 'left'; c.fillText(label, 45, 48);
  const s = stars(inst.q);
  c.textAlign = 'right'; c.font = `900 26px ${BODY}`;
  for (let i = 0; i < 5; i++) { c.fillStyle = i < s ? '#ffd84a' : 'rgba(255,255,255,.18)'; c.fillText('★', W - 32 - (4 - i) * 25, 48); }
  // bảng tên
  const ny = 418;
  c.save();
  c.beginPath(); c.moveTo(40, ny); c.lineTo(W - 40, ny); c.lineTo(W - 24, ny + 30); c.lineTo(W - 40, ny + 60); c.lineTo(40, ny + 60); c.lineTo(24, ny + 30); c.closePath();
  const ng = c.createLinearGradient(0, ny, 0, ny + 60); ng.addColorStop(0, R.color); ng.addColorStop(1, R.deep);
  c.fillStyle = ng; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke();
  c.restore();
  c.textAlign = 'center'; c.fillStyle = '#fff';
  let nameSize = 34; const nm = def.name.toUpperCase();
  do { c.font = `400 ${nameSize}px ${DISPLAY}`; nameSize -= 2; } while (c.measureText(nm).width > W - 110 && nameSize > 16);
  c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineJoin = 'round'; c.strokeText(nm, W / 2, ny + 32); c.fillText(nm, W / 2, ny + 32);
  // chỉ số
  const rows = [['❤️', 'Máu', st.hp, st.hp / 175, '#ff5d73'], ['⚔️', 'Công', st.atk, st.atk / 17.5, '#ffb547'], ['💨', 'Tốc', st.spd, (st.spd - 0.75) / 0.6, '#5ee0ff']];
  rows.forEach(([icon, name, val, k, col], i) => {
    const y = 504 + i * 30;
    c.font = `20px ${EMOJI}`; c.textAlign = 'left'; c.fillStyle = '#000'; c.fillText(icon, 40, y);
    c.font = `800 19px ${BODY}`; c.fillStyle = '#e9e3f5'; c.fillText(name, 70, y);
    rr(c, 128, y - 8, 270, 16, 8); c.fillStyle = 'rgba(255,255,255,.12)'; c.fill();
    const bw = Math.max(16, Math.min(1, k) * 270);
    const bg = c.createLinearGradient(128, 0, 128 + bw, 0); bg.addColorStop(0, col); bg.addColorStop(1, '#fff');
    rr(c, 128, y - 8, bw, 16, 8); c.fillStyle = bg; c.fill();
    c.textAlign = 'right'; c.font = `900 20px ${BODY}`; c.fillStyle = '#fff';
    c.fillText(String(val).replace('.', ','), W - 38, y);
  });
  // ô kỹ năng
  const ky = 594;
  rr(c, 34, ky, W - 68, 70, 14); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill();
  c.lineWidth = 2; c.strokeStyle = R.color; c.stroke();
  c.font = `34px ${EMOJI}`; c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText(sk.icon, 72, ky + 35);
  c.textAlign = 'left'; c.font = `900 20px ${BODY}`; c.fillStyle = R.color; c.fillText(sk.name.toUpperCase() + (sk.active ? '' : ' · nội tại'), 100, ky + 20);
  c.font = `600 15px ${BODY}`; c.fillStyle = '#e9e3f5';
  wrap(c, sk.desc, W - 150).slice(0, 2).forEach((ln, i) => c.fillText(ln, 100, ky + 42 + i * 18));
  // chân thẻ: seri · chủ · phẩm chất
  c.font = `800 15px ${BODY}`; c.fillStyle = 'rgba(255,255,255,.75)';
  c.textAlign = 'left'; c.fillText(inst.serial ? `#${String(inst.serial).padStart(4, '0')}` : '#—', 36, H - 24);
  c.textAlign = 'right'; c.fillText(`Phẩm chất ${inst.q}%`, W - 36, H - 24);
  if (owner) { c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = `800 15px ${BODY}`; c.fillText(owner.length > 18 ? owner.slice(0, 17) + '…' : owner, W / 2, H - 24); }
  if (!fontsReady()) return cv;
  faceCache.set(key, cv);
  if (faceCache.size > 80) faceCache.delete(faceCache.keys().next().value);
  return cv;
}

let backCv = null;
/** Mặt sau lá bài. */
export function cardBack() {
  if (backCv) return backCv;
  const ready = fontsReady();
  backCv = document.createElement('canvas');
  backCv.width = CARD_W; backCv.height = CARD_H;
  const c = backCv.getContext('2d');
  const W = CARD_W, H = CARD_H;
  rr(c, 0, 0, W, H, 34); c.fillStyle = frameFill(c, 'L', 0, 0, W, H); c.fill();
  rr(c, 18, 18, W - 36, H - 36, 22);
  const g = c.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.6);
  g.addColorStop(0, '#2a1b52'); g.addColorStop(1, '#0a0614'); c.fillStyle = g; c.fill();
  c.save(); c.clip();
  c.strokeStyle = 'rgba(245,197,66,.18)'; c.lineWidth = 2;
  for (let r = 40; r < 420; r += 34) { c.beginPath(); c.arc(W / 2, H / 2, r, 0, Math.PI * 2); c.stroke(); }
  c.translate(W / 2, H / 2);
  for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.beginPath(); c.moveTo(0, 60); c.lineTo(0, 420); c.stroke(); }
  c.restore();
  c.beginPath(); c.arc(W / 2, H / 2, 110, 0, Math.PI * 2); c.fillStyle = '#120a24'; c.fill(); c.lineWidth = 6; c.strokeStyle = '#f5c542'; c.stroke();
  c.font = `120px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText('⚔️', W / 2, H / 2 + 6);
  c.font = `400 34px ${DISPLAY}`; c.fillStyle = '#f5c542'; c.fillText('THẦN THÚ', W / 2, H - 110);
  c.font = `400 20px ${DISPLAY}`; c.fillStyle = 'rgba(245,197,66,.7)'; c.fillText('ĐẤU TRƯỜNG', W / 2, 110);
  const out = backCv;
  if (!ready) backCv = null;
  return out;
}

/**
 * Vẽ lá bài tại tâm (cx, cy) rộng w. flip: 0 = mặt trước, 1 = mặt sau (lật quanh trục dọc).
 * t: thời gian (giây) cho ánh hologram; tilt: nghiêng nhẹ (radian).
 */
export function drawCard(ctx, inst, cx, cy, w, { t = 0, flip = 0, owner = '', tilt = 0, glow = true } = {}) {
  const def = CARD_BY_ID[inst.card];
  if (!def) return;
  const R = RARITIES[def.rar];
  const h = w * CARD_H / CARD_W;
  const sx = Math.cos(flip * Math.PI);
  const front = sx >= 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.scale(Math.max(0.02, Math.abs(sx)), 1);
  // quầng sáng sau lá bài (gradient thay cho shadowBlur — nhẹ hơn nhiều khi vẽ 60 khung / giây)
  if (glow && front && def.rar !== 'C') {
    const gr = ctx.createRadialGradient(0, 0, w * 0.3, 0, 0, w * (R.rank >= 3 ? 0.95 : 0.75));
    gr.addColorStop(0, R.glow); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(-w, -h * 0.85, w * 2, h * 1.7);
  } else if (glow) { ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, -w / 2 + w * 0.02, -h / 2 + w * 0.03, w, h, w * 0.068); ctx.fill(); }
  ctx.drawImage(front ? cardFace(inst, owner) : cardBack(), -w / 2, -h / 2, w, h);
  if (front && R.rank >= 2) {
    // ánh hologram quét chéo
    ctx.save();
    rr(ctx, -w / 2, -h / 2, w, h, w * 0.068); ctx.clip();
    const p = ((t * 0.45) % 1.6) - 0.3;
    const x0 = -w / 2 + p * w * 1.6;
    const g = ctx.createLinearGradient(x0 - w * 0.3, -h / 2, x0 + w * 0.3, h / 2);
    if (def.rar === 'M') {
      const hue = (t * 120) % 360;
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.35, `hsla(${hue},100%,70%,.16)`);
      g.addColorStop(0.5, `hsla(${(hue + 120) % 360},100%,75%,.26)`);
      g.addColorStop(0.65, `hsla(${(hue + 240) % 360},100%,70%,.16)`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${R.rank >= 3 ? 0.35 : 0.22})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
    // lấp lánh
    if (R.rank >= 3) {
      ctx.save();
      for (let i = 0; i < 7; i++) {
        const ph = (t * 1.3 + i * 0.37) % 1;
        const a = Math.sin(ph * Math.PI);
        const px = (Math.sin(i * 12.9898) * 0.5) * w * 0.85, py = (Math.cos(i * 78.233) * 0.5) * h * 0.85;
        const s = w * 0.035 * a;
        ctx.globalAlpha = a; ctx.fillStyle = def.rar === 'M' ? `hsl(${(t * 200 + i * 50) % 360},100%,80%)` : '#fff8d0';
        ctx.beginPath(); ctx.moveTo(px, py - s * 2); ctx.lineTo(px + s * 0.4, py - s * 0.4); ctx.lineTo(px + s * 2, py); ctx.lineTo(px + s * 0.4, py + s * 0.4);
        ctx.lineTo(px, py + s * 2); ctx.lineTo(px - s * 0.4, py + s * 0.4); ctx.lineTo(px - s * 2, py); ctx.lineTo(px - s * 0.4, py - s * 0.4); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

// Cảnh low poly 3D khi máy bay tới thủ đô (game Đoán cờ): máy quay lao từ trên cao xuống mặt đất, công trình biểu tượng của nước đó
// đứng giữa khung cảnh sát với thực tế — nhà cao tầng, phố cổ, ruộng lúa, đồng lúa mì, sa mạc, thảo nguyên, rừng nhiệt đới, núi tuyết, bãi biển.
// Không viền đen: mọi khối tự định hình bằng mặt sáng / mặt tối (nắng từ bên trái), bóng đổ elip mờ dưới chân vật thể.
// Không đụng DOM khi import; canvas phụ tạo qua makeCanvas() do renderer cấp.

/** Công trình biểu tượng theo nước (iso2). Nước không có trong bảng → chọn theo vùng (landmarkOf). */
export const LANDMARK = {
  fr: 'eiffel', gb: 'clocktower', it: 'colosseum', gr: 'temple', de: 'gate', es: 'cathedral', pt: 'castle', nl: 'windmill', be: 'cathedral',
  ch: 'mountain', at: 'capitol', ru: 'onion', ua: 'onion', by: 'castle', pl: 'castle', cz: 'castle', sk: 'castle', hu: 'cathedral', dk: 'windmill',
  se: 'castle', no: 'lighthouse', fi: 'lighthouse', is: 'mountain', ie: 'castle', ro: 'castle', bg: 'onion', rs: 'onion', hr: 'castle', si: 'castle',
  va: 'capitol', mt: 'castle', cy: 'temple', ee: 'castle', lv: 'cathedral', lt: 'castle', md: 'onion', me: 'mountain', mk: 'castle', al: 'castle', ba: 'mosque',
  lu: 'castle', li: 'castle', mc: 'capitol', sm: 'castle', ad: 'mountain', ge: 'onion', am: 'mountain', az: 'burj',
  us: 'liberty', ca: 'needle', mx: 'steppyramid', gt: 'steppyramid', bz: 'steppyramid', hn: 'steppyramid', cu: 'capitol', pa: 'burj',
  br: 'christ', ar: 'obelisk', pe: 'mountain', cl: 'moai', co: 'church', ve: 'mountain', ec: 'mountain', bo: 'mountain', py: 'church', uy: 'church',
  eg: 'pyramids', sd: 'pyramids', ma: 'mosque', dz: 'mosque', tn: 'mosque', ly: 'mosque', ke: 'baobab', tz: 'mountain', za: 'mountain', ng: 'baobab',
  et: 'church', mg: 'baobab', sn: 'baobab',
  cn: 'greatwall', jp: 'fuji', kr: 'pagoda', kp: 'obelisk', vn: 'onepillar', th: 'stupa', kh: 'prang', la: 'stupa', mm: 'stupa', my: 'twin', sg: 'mbs',
  id: 'stupa', ph: 'church', in: 'taj', pk: 'mosque', bd: 'mosque', np: 'mountain', lk: 'stupa', mn: 'yurt', kz: 'needle', uz: 'mosque', tm: 'mosque',
  kg: 'yurt', tj: 'mountain', bt: 'pagoda', ir: 'mosque', iq: 'mosque', il: 'capitol', ps: 'mosque', jo: 'temple', lb: 'temple', sy: 'mosque', ae: 'burj',
  qa: 'burj', kw: 'needle', sa: 'mosque', om: 'mosque', ye: 'mosque', af: 'mosque', bh: 'twin', tr: 'mosque', mv: 'island', tl: 'church', bn: 'mosque',
  au: 'sails', nz: 'mountain',
};
/** Tên công trình đang vẽ (để băng rôn ghi đúng cái người xem thấy). */
export const LANDMARK_NAME = {
  fr: 'Tháp Eiffel', gb: 'Tháp Big Ben', it: 'Đấu trường Colosseum', gr: 'Đền Parthenon', de: 'Cổng Brandenburg', es: 'Nhà thờ Sagrada Família',
  nl: 'Cối xay gió', dk: 'Cối xay gió', ru: 'Nhà thờ Thánh Basil', cz: 'Lâu đài Praha', ch: 'Dãy Alps', no: 'Ngọn hải đăng', fi: 'Ngọn hải đăng',
  us: 'Tượng Nữ thần Tự do', ca: 'Tháp CN', mx: 'Kim tự tháp Maya', gt: 'Kim tự tháp Maya', br: 'Tượng Chúa Cứu Thế', ar: 'Đài Obelisco', pe: 'Dãy Andes',
  cl: 'Tượng Moai', eg: 'Kim tự tháp Giza', cn: 'Vạn Lý Trường Thành', jp: 'Núi Phú Sĩ', kr: 'Chùa cổ', vn: 'Chùa Một Cột', th: 'Chùa vàng',
  kh: 'Angkor Wat', mm: 'Chùa Shwedagon', id: 'Đền Borobudur', my: 'Tháp đôi Petronas', sg: 'Marina Bay Sands', in: 'Lăng Taj Mahal', ae: 'Tháp Burj Khalifa',
  au: 'Nhà hát Opera Sydney', kz: 'Tháp Baiterek', mn: 'Lều du mục', kg: 'Lều du mục', mg: 'Đại lộ Bao báp', ke: 'Thảo nguyên bao báp', tz: 'Núi Kilimanjaro',
  np: 'Dãy Himalaya', za: 'Núi Bàn', nz: 'Núi Cook', is: 'Núi lửa', tr: 'Thánh đường Hồi giáo', sa: 'Thánh đường Hồi giáo', kp: 'Tháp Chủ thể', kw: 'Tháp Kuwait',
};
const WATER = new Set(['sails', 'island', 'onepillar', 'lighthouse', 'moai', 'liberty', 'mbs']);

function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngOf(s) { let h = hash(s) || 1; return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return (h % 1_000_003) / 1_000_003; }; }

export function landmarkOf(iso, region, lat = 0, lon = 0) {
  if (LANDMARK[iso]) return LANDMARK[iso];
  if (region === 'chau-dai-duong') return 'island';
  if (region === 'chau-phi') return lat > 12 ? 'mosque' : 'baobab';
  if (region === 'chau-a') return lon < 63 && lat < 43 ? 'mosque' : lat < 25 ? 'stupa' : 'pagoda';
  if (region === 'bac-my') return lon > -85 && lon < -59 && lat > 10 && lat < 27 ? 'island' : 'church';
  if (region === 'nam-my') return 'church';
  return ['castle', 'cathedral', 'capitol'][hash(iso) % 3];
}
function climateOf(type, region, lat, lon) {
  const a = Math.abs(lat);
  if (type === 'pyramids' || (region === 'chau-a' && lon < 63 && lat > 12 && lat < 43) || (region === 'chau-phi' && lat > 12)) return 'desert';
  if (region === 'chau-phi') return 'savanna';
  if (type === 'mountain' && a > 40) return 'snow';
  if (a > 56) return 'snow';
  if (a < 20) return 'tropical';
  return 'temperate';
}
function cityOf(iso, region, lat, lon) {
  if (region === 'chau-au') return 'europe';
  if (region === 'chau-a') return lon < 63 && lat < 43 ? 'mideast' : 'eastasia';
  if (region === 'chau-phi') return lat > 12 ? 'mideast' : 'africa';
  if (iso === 'us' || iso === 'ca') return 'americas';
  if (region === 'bac-my' || region === 'nam-my') return 'latin';
  return 'oceania';
}

// ---------------- màu ----------------
const toRgb = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (a) => `#${a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
/** k > 0: sáng lên (về trắng), k < 0: tối đi (về đen). */
export const shade = (c, k) => toHex(toRgb(c).map((v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k))));
export const mix = (a, b, k) => { const A = toRgb(a), B = toRgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * k)); };

// bảng màu trầm, sương khói: trời xanh xô thơm, cỏ ô liu, đá nâu đất, điểm nhấn đỏ gạch (terracotta)
const SKY = { day: ['#86a9ae', '#b3c9c2', '#e6e6d4'], sunset: ['#66708c', '#b98578', '#e2a676', '#f2d6a8'], night: ['#1f2a46', '#37476a', '#6b7a8e'] };
const GROUND = { temperate: '#8a9a5b', tropical: '#6d9a62', desert: '#d2b583', savanna: '#b9a66a', snow: '#e1e6e8' };
const TERRA = '#b8654a';
const CITY = {
  europe: { walls: ['#efe2c8', '#e3c9a0', '#f5efe4', '#d9b892', '#e8d5b5'], roofs: ['#b4553d', '#9a4a36', '#5d6d7c'], pitched: true },
  latin: { walls: ['#f2d59c', '#e9a8a0', '#a9d6c8', '#f3efe6', '#b9cde8'], roofs: ['#b4553d', '#a24c35'], pitched: true },
  eastasia: { walls: ['#d6dde6', '#b8c6d6', '#e9e3d8', '#9fb1c4', '#c9d3cf'], roofs: ['#7d2f2a', '#41505e'], pitched: false },
  mideast: { walls: ['#ecd8b0', '#dec48f', '#f3e8d0', '#e6cfa0'], roofs: ['#c9ab76'], pitched: false },
  africa: { walls: ['#d9a46b', '#c98d5a', '#e9c79a', '#efe0c4'], roofs: ['#8a5a2e'], pitched: false },
  americas: { walls: ['#c3d6e6', '#9ebad1', '#e8edf2', '#d8c6aa', '#aebfcc'], roofs: ['#55606b'], pitched: false },
  oceania: { walls: ['#f3efe6', '#d5ebe8', '#f6e2c8'], roofs: ['#c25b45', '#4f7d8a'], pitched: true },
};

// ---------------- bộ vẽ ----------------
function kit(c) {
  const P = (pts, col) => {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = col; c.lineWidth = 0.7; c.stroke(); // viền cùng màu: không hở khe giữa các mảng
  };
  /** Thân tròn xoay: prof = [[bán kính, độ cao]…] từ dưới lên; 3 mặt (trái sáng, giữa, phải tối). cols: màu xen kẽ theo đoạn (sọc). */
  const lathe = (cx, yb, prof, col, cols = null) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, h0] = prof[i], [r1, h1] = prof[i + 1];
      if (h1 === h0 && r1 === r0) continue;
      const y0 = yb - h0, y1 = yb - h1;
      const up = Math.max(-1, Math.min(1, (r0 - r1) / Math.max(2, Math.abs(h1 - h0)))) * 0.08;
      const base = cols ? cols[i % cols.length] : col;
      const L = [-1, -0.35, 0.35, 1], K = [0.16, 0.02, -0.18];
      for (let f = 0; f < 3; f++) P([cx + r0 * L[f], y0, cx + r0 * L[f + 1], y0, cx + r1 * L[f + 1], y1, cx + r1 * L[f], y1], shade(base, K[f] + up));
    }
  };
  /** Khối hộp nhìn chéo: mặt trái sáng (58%), mặt phải tối. */
  const box = (x, y, w, h, col) => {
    const m = x + w * 0.58;
    P([x, y, m, y, m, y + h, x, y + h], shade(col, 0.1));
    P([m, y, x + w, y, x + w, y + h, m, y + h], shade(col, -0.16));
  };
  /** Chóp / kim tự tháp: 2 mặt. */
  const spire = (cx, yb, hw, h, col, lean = 0) => {
    P([cx - hw, yb, cx + lean, yb - h, cx + lean, yb], shade(col, 0.12));
    P([cx + lean, yb - h, cx + hw, yb, cx + lean, yb], shade(col, -0.16));
  };
  /** Mái chùa cong vút hai đầu. */
  const roof = (cx, y, hw, h, col) => {
    P([cx - hw, y - h * 0.32, cx - hw * 0.86, y + h * 0.06, cx, y + h * 0.06, cx, y - h, cx - hw * 0.42, y - h], shade(col, 0.1));
    P([cx + hw, y - h * 0.32, cx + hw * 0.86, y + h * 0.06, cx, y + h * 0.06, cx, y - h, cx + hw * 0.42, y - h], shade(col, -0.14));
    P([cx - hw * 0.86, y + h * 0.06, cx + hw * 0.86, y + h * 0.06, cx + hw * 0.66, y + h * 0.2, cx - hw * 0.66, y + h * 0.2], shade(col, -0.35));
  };
  /** Ô cửa vòm (tròn / nhọn). */
  const arch = (x, yb, w, h, col, pointed = false) => {
    c.beginPath(); c.moveTo(x, yb); c.lineTo(x, yb - h + w / 2);
    if (pointed) { c.quadraticCurveTo(x, yb - h, x + w / 2, yb - h - w * 0.15); c.quadraticCurveTo(x + w, yb - h, x + w, yb - h + w / 2); }
    else c.arc(x + w / 2, yb - h + w / 2, w / 2, Math.PI, 0);
    c.lineTo(x + w, yb); c.closePath(); c.fillStyle = col; c.fill();
  };
  /** Đa giác đều mặt cắt (mặt trời, tán cây, hồ nước) — quạt tam giác, sáng dần về bên trái. */
  const disc = (cx, cy, rx, ry, n, col, rot = 0) => {
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2;
      const lit = -Math.cos((a0 + a1) / 2) * 0.12 - Math.sin((a0 + a1) / 2) * 0.06;
      P([cx, cy, cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry], shade(col, lit));
    }
  };
  const cut = (path) => { c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); path(c); c.fill(); c.restore(); };
  /** Mái vòm: bán cầu / củ hành (onion) / nón. */
  const domeProf = (r, h, kind = 'round', n = 6) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (kind === 'onion') out.push([r * Math.max(0, (1 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.6))) * Math.pow(1 - t, 0.9)), h * t]);
      else out.push([r * Math.cos((t * Math.PI) / 2), h * Math.sin((t * Math.PI) / 2)]);
    }
    return out;
  };
  return { c, P, lathe, box, spire, roof, arch, disc, cut, domeProf };
}

// ---------------- công trình biểu tượng ----------------
// mỗi hàm: (g, cx, yb, H, pal, rng) — cx: tâm, yb: chân đế, H: chiều cao tối đa. Trả meta (vd tâm cánh quạt cối xay gió).
const LM = {
  eiffel(g, cx, yb, H) {
    const col = '#8b5e3c', dk = '#5f3d27';
    g.lathe(cx, yb, [[0.3 * H, 0], [0.2 * H, 0.12 * H], [0.15 * H, 0.2 * H], [0.085 * H, 0.42 * H], [0.05 * H, 0.6 * H], [0.028 * H, 0.8 * H], [0.014 * H, 0.9 * H], [0.003 * H, H]], col);
    g.cut((c) => { c.moveTo(cx - 0.215 * H, yb + 1); c.quadraticCurveTo(cx, yb - 0.25 * H, cx + 0.215 * H, yb + 1); c.closePath(); });
    g.cut((c) => { c.moveTo(cx - 0.12 * H, yb - 0.2 * H); c.quadraticCurveTo(cx, yb - 0.37 * H, cx + 0.12 * H, yb - 0.2 * H); c.closePath(); });
    g.box(cx - 0.175 * H, yb - 0.215 * H, 0.35 * H, 0.03 * H, dk);
    g.box(cx - 0.1 * H, yb - 0.435 * H, 0.2 * H, 0.022 * H, dk);
    g.box(cx - 0.036 * H, yb - 0.815 * H, 0.072 * H, 0.016 * H, dk);
    g.c.strokeStyle = 'rgba(40,24,14,.28)'; g.c.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { const y0 = yb - 0.44 * H - i * 0.04 * H, w0 = 0.085 * H - i * 0.006 * H; g.c.beginPath(); g.c.moveTo(cx - w0, y0); g.c.lineTo(cx + w0 * 0.8, y0 - 0.04 * H); g.c.stroke(); }
  },
  clocktower(g, cx, yb, H) {
    const st = '#d8bf8a', rf = '#3d4b57';
    g.box(cx + 0.02 * H, yb - 0.22 * H, 0.66 * H, 0.22 * H, st);
    for (let i = 0; i < 9; i++) g.spire(cx + 0.06 * H + i * 0.075 * H, yb - 0.22 * H, 0.012 * H, 0.06 * H, st);
    for (let i = 0; i < 8; i++) g.box(cx + 0.07 * H + i * 0.075 * H, yb - 0.17 * H, 0.025 * H, 0.1 * H, shade(st, -0.35));
    g.box(cx - 0.08 * H, yb - 0.66 * H, 0.16 * H, 0.66 * H, st);
    for (let i = 0; i < 6; i++) g.box(cx - 0.05 * H, yb - 0.12 * H - i * 0.075 * H, 0.03 * H, 0.05 * H, shade(st, -0.38)), g.box(cx + 0.02 * H, yb - 0.12 * H - i * 0.075 * H, 0.03 * H, 0.05 * H, shade(st, -0.45));
    g.box(cx - 0.095 * H, yb - 0.74 * H, 0.19 * H, 0.08 * H, shade(st, -0.06));
    g.disc(cx - 0.005 * H, yb - 0.6 * H, 0.058 * H, 0.058 * H, 10, '#f6efd9');
    g.c.strokeStyle = '#2c2a26'; g.c.lineWidth = 2.5; g.c.beginPath(); g.c.moveTo(cx - 0.005 * H, yb - 0.6 * H); g.c.lineTo(cx - 0.005 * H, yb - 0.645 * H); g.c.moveTo(cx - 0.005 * H, yb - 0.6 * H); g.c.lineTo(cx + 0.025 * H, yb - 0.6 * H); g.c.stroke();
    g.spire(cx, yb - 0.74 * H, 0.095 * H, 0.2 * H, rf);
    for (const s of [-1, 1]) g.spire(cx + s * 0.085 * H, yb - 0.74 * H, 0.015 * H, 0.08 * H, rf);
    g.spire(cx, yb - 0.93 * H, 0.012 * H, 0.07 * H, '#d6a93a');
  },
  pagoda(g, cx, yb, H, pal = {}) {
    const body = pal.body || '#f2e6cf', rf = pal.roof || '#3b4148', tiers = pal.tiers || 5;
    let y = yb;
    g.box(cx - 0.26 * H, y - 0.05 * H, 0.52 * H, 0.05 * H, '#9c9384'); y -= 0.05 * H;
    const seg = (0.8 * H) / tiers;
    for (let i = 0; i < tiers; i++) {
      const bw = 0.16 * H * (1 - i * 0.1);
      g.box(cx - bw, y - seg * 0.55, bw * 2, seg * 0.55, body);
      g.box(cx - bw * 0.3, y - seg * 0.45, bw * 0.6, seg * 0.45, shade(body, -0.45));
      y -= seg * 0.55;
      g.roof(cx, y, bw * 1.8, seg * 0.45, rf);
      y -= seg * 0.45;
    }
    const rem = y - (yb - H);
    g.lathe(cx, y, [[0.02 * H, 0], [0.02 * H, rem * 0.15], [0.032 * H, rem * 0.18], [0.012 * H, rem * 0.28], [0.026 * H, rem * 0.32], [0.01 * H, rem * 0.45], [0.022 * H, rem * 0.5], [0.008 * H, rem * 0.62], [0, rem]], '#c9a13b');
  },
  onepillar(g, cx, yb, H) {
    for (let i = 0; i < 14; i++) { const a0 = (i / 14) * Math.PI * 2, a1 = ((i + 1) / 14) * Math.PI * 2; g.P([cx, yb, cx + Math.cos(a0) * 0.55 * H, yb + Math.sin(a0) * 0.08 * H, cx + Math.cos(a1) * 0.55 * H, yb + Math.sin(a1) * 0.08 * H], shade('#4f9fb8', (i % 3) * 0.06 - 0.04)); }
    for (const [dx, dy] of [[-0.38, 0.02], [-0.26, 0.05], [0.3, 0.03], [0.42, 0.01], [-0.1, 0.06]]) { g.disc(cx + dx * H, yb + dy * H, 0.05 * H, 0.016 * H, 6, '#4f8f3a'); g.spire(cx + dx * H + 0.02 * H, yb + dy * H - 0.004 * H, 0.012 * H, 0.03 * H, '#f08bb0'); }
    g.lathe(cx, yb, [[0.04 * H, 0], [0.036 * H, 0.32 * H]], '#a49a8a');
    for (const s of [-1, 1]) g.P([cx + s * 0.03 * H, yb - 0.27 * H, cx + s * 0.17 * H, yb - 0.335 * H, cx + s * 0.17 * H, yb - 0.32 * H, cx + s * 0.035 * H, yb - 0.25 * H], '#6f3a2a');
    g.box(cx - 0.2 * H, yb - 0.37 * H, 0.4 * H, 0.045 * H, '#7a3d2b');
    g.box(cx - 0.15 * H, yb - 0.56 * H, 0.3 * H, 0.19 * H, '#a8432f');
    for (let i = 0; i < 5; i++) g.box(cx - 0.12 * H + i * 0.055 * H, yb - 0.53 * H, 0.03 * H, 0.13 * H, '#5e2418');
    g.roof(cx, yb - 0.56 * H, 0.3 * H, 0.22 * H, '#5b4636');
    for (const s of [-1, 1]) g.spire(cx + s * 0.13 * H, yb - 0.78 * H, 0.03 * H, 0.06 * H, '#5b4636', s * 0.02 * H);
    g.disc(cx, yb - 0.8 * H, 0.025 * H, 0.025 * H, 8, '#d6a93a');
  },
  stupa(g, cx, yb, H, pal = {}) {
    const col = pal.gold || '#d6a93a';
    const one = (x, h, k) => {
      g.box(x - 0.36 * h, yb - 0.07 * h, 0.72 * h, 0.07 * h, shade(col, -0.1));
      g.box(x - 0.28 * h, yb - 0.13 * h, 0.56 * h, 0.06 * h, shade(col, -0.05));
      g.box(x - 0.21 * h, yb - 0.18 * h, 0.42 * h, 0.05 * h, col);
      g.lathe(x, yb - 0.18 * h, [[0.17 * h, 0], [0.18 * h, 0.05 * h], [0.165 * h, 0.12 * h], [0.13 * h, 0.19 * h], [0.08 * h, 0.24 * h], [0.06 * h, 0.26 * h]], col);
      g.lathe(x, yb - 0.44 * h, [[0.055 * h, 0], [0.05 * h, 0.03 * h], [0.045 * h, 0.03 * h], [0.04 * h, 0.06 * h], [0.035 * h, 0.06 * h], [0.03 * h, 0.09 * h], [0.026 * h, 0.09 * h], [0.022 * h, 0.12 * h]], col);
      g.lathe(x, yb - 0.56 * h, [[0.022 * h, 0], [0.012 * h, 0.2 * h], [0.006 * h, 0.38 * h], [0, 0.44 * h * k]], col);
    };
    one(cx - 0.42 * H, 0.42 * H, 1); one(cx + 0.42 * H, 0.42 * H, 1);
    one(cx, H, 1);
  },
  prang(g, cx, yb, H) {
    const st = '#8f8b78';
    g.box(cx - 0.5 * H, yb - 0.08 * H, H, 0.08 * H, shade(st, -0.1));
    g.box(cx - 0.38 * H, yb - 0.15 * H, 0.76 * H, 0.07 * H, st);
    const corn = (x, b, s) => g.lathe(x, b, [[0.09, 0], [0.09, 0.1], [0.075, 0.13], [0.08, 0.17], [0.062, 0.23], [0.066, 0.27], [0.046, 0.33], [0.05, 0.36], [0.032, 0.42], [0.034, 0.45], [0, 0.55]].map(([r, h]) => [r * s, h * s]), st);
    corn(cx - 0.34 * H, yb - 0.15 * H, 0.95 * H); corn(cx + 0.34 * H, yb - 0.15 * H, 0.95 * H);
    corn(cx - 0.18 * H, yb - 0.15 * H, 1.15 * H); corn(cx + 0.18 * H, yb - 0.15 * H, 1.15 * H);
    g.box(cx - 0.14 * H, yb - 0.22 * H, 0.28 * H, 0.07 * H, st);
    corn(cx, yb - 0.22 * H, 1.42 * H);
  },
  taj(g, cx, yb, H) {
    const w = '#f4efe6', a = '#d9cfbf';
    for (const [x, s] of [[-0.3, 0.9], [0.3, 0.9], [-0.44, 1], [0.44, 1]]) g.lathe(cx + x * H, yb - 0.05 * H, [[0.024 * H * s, 0], [0.02 * H * s, 0.42 * H * s], [0.03 * H * s, 0.43 * H * s], [0.02 * H * s, 0.45 * H * s], ...g.domeProf(0.024 * H * s, 0.05 * H * s).map(([r, h]) => [r, 0.45 * H * s + h]), [0, 0.53 * H * s]], w);
    g.box(cx - 0.46 * H, yb - 0.05 * H, 0.92 * H, 0.05 * H, a);
    g.box(cx - 0.22 * H, yb - 0.36 * H, 0.44 * H, 0.31 * H, w);
    g.arch(cx - 0.07 * H, yb - 0.08 * H, 0.14 * H, 0.22 * H, '#b9ab93', true);
    for (const s of [-1, 1]) { g.arch(cx + s * 0.15 * H - 0.035 * H, yb - 0.08 * H, 0.07 * H, 0.1 * H, '#c7bba6', true); g.arch(cx + s * 0.15 * H - 0.035 * H, yb - 0.21 * H, 0.07 * H, 0.1 * H, '#c7bba6', true); }
    for (const s of [-1, 1]) g.lathe(cx + s * 0.16 * H, yb - 0.36 * H, [[0.04 * H, 0], [0.04 * H, 0.03 * H], ...g.domeProf(0.045 * H, 0.06 * H).map(([r, h]) => [r, 0.03 * H + h])], w);
    g.lathe(cx, yb - 0.36 * H, [[0.1 * H, 0], [0.1 * H, 0.07 * H], ...g.domeProf(0.13 * H, 0.33 * H, 'onion', 8).map(([r, h]) => [r, 0.07 * H + h])], w);
    g.lathe(cx, yb - 0.76 * H, [[0.01 * H, 0], [0.004 * H, 0.1 * H]], '#c9a13b');
  },
  mosque(g, cx, yb, H, pal = {}) {
    const wall = '#e8dcc4', dome = pal.dome || '#3f8f8a', mn = '#f2ece0';
    for (const s of [-1, 1]) {
      const x = cx + s * 0.34 * H;
      g.lathe(x, yb, [[0.03 * H, 0], [0.026 * H, 0.55 * H], [0.04 * H, 0.56 * H], [0.04 * H, 0.58 * H], [0.024 * H, 0.59 * H], [0.022 * H, 0.75 * H], [0.034 * H, 0.76 * H], [0.034 * H, 0.775 * H], [0.02 * H, 0.78 * H]], mn);
      g.spire(x, yb - 0.78 * H, 0.022 * H, 0.14 * H, dome);
    }
    g.box(cx - 0.24 * H, yb - 0.26 * H, 0.48 * H, 0.26 * H, wall);
    g.arch(cx - 0.06 * H, yb, 0.12 * H, 0.17 * H, shade(wall, -0.4), true);
    for (const s of [-1, 1]) g.arch(cx + s * 0.15 * H - 0.03 * H, yb - 0.08 * H, 0.06 * H, 0.09 * H, shade(wall, -0.3), true);
    for (const s of [-1, 1]) g.lathe(cx + s * 0.17 * H, yb - 0.26 * H, g.domeProf(0.06 * H, 0.06 * H), dome);
    g.lathe(cx, yb - 0.26 * H, [[0.17 * H, 0], [0.17 * H, 0.05 * H], ...g.domeProf(0.19 * H, 0.2 * H, 'round', 7).map(([r, h]) => [r, 0.05 * H + h])], dome);
    g.lathe(cx, yb - 0.51 * H, [[0.008 * H, 0], [0.004 * H, 0.07 * H]], '#d6a93a');
    g.c.strokeStyle = '#d6a93a'; g.c.lineWidth = 3; g.c.beginPath(); g.c.arc(cx, yb - 0.6 * H, 0.025 * H, -0.4 * Math.PI, 0.7 * Math.PI); g.c.stroke();
  },
  pyramids(g, cx, yb, H) {
    const s = '#dcb46c';
    const pyr = (x, hw, h) => { g.spire(x, yb, hw, h, s); for (let i = 1; i < 6; i++) { const yy = yb - (h * i) / 6, ww = hw * (1 - i / 6); g.c.strokeStyle = 'rgba(120,80,30,.18)'; g.c.lineWidth = 1; g.c.beginPath(); g.c.moveTo(x - ww, yy); g.c.lineTo(x + ww, yy); g.c.stroke(); } };
    pyr(cx + 0.55 * H, 0.22 * H, 0.32 * H);
    pyr(cx + 0.24 * H, 0.32 * H, 0.5 * H);
    pyr(cx - 0.2 * H, 0.46 * H, 0.72 * H);
    g.P([cx - 0.75 * H, yb + 2, cx - 0.5 * H, yb - 0.05 * H, cx - 0.2 * H, yb + 2], shade(s, 0.08));
    g.P([cx + 0.3 * H, yb + 2, cx + 0.62 * H, yb - 0.04 * H, cx + 0.85 * H, yb + 2], shade(s, -0.05));
  },
  steppyramid(g, cx, yb, H) {
    const st = '#a39a83';
    let y = yb;
    for (let i = 0; i < 7; i++) { const hw = 0.44 * H * (1 - i * 0.11), hh = 0.075 * H; g.P([cx - hw, y, cx - hw + hh * 0.5, y - hh, cx, y - hh, cx, y], shade(st, 0.1 + (i % 2) * 0.03)); g.P([cx, y, cx, y - hh, cx + hw - hh * 0.5, y - hh, cx + hw, y], shade(st, -0.15 + (i % 2) * 0.03)); y -= hh; }
    g.P([cx - 0.07 * H, yb, cx + 0.07 * H, yb, cx + 0.04 * H, y, cx - 0.04 * H, y], shade(st, -0.28));
    for (let i = 0; i < 14; i++) { const yy = yb - i * 0.0375 * H; g.c.fillStyle = 'rgba(60,50,40,.25)'; g.c.fillRect(cx - 0.065 * H + i * 0.002 * H, yy - 2, 0.13 * H - i * 0.004 * H, 2); }
    g.box(cx - 0.09 * H, y - 0.16 * H, 0.18 * H, 0.16 * H, shade(st, 0.05));
    g.arch(cx - 0.03 * H, y, 0.06 * H, 0.09 * H, shade(st, -0.5));
    g.box(cx - 0.11 * H, y - 0.2 * H, 0.22 * H, 0.04 * H, shade(st, -0.1));
  },
  temple(g, cx, yb, H) {
    const m = '#efe6d2';
    for (let i = 0; i < 3; i++) g.box(cx - (0.5 - i * 0.02) * H, yb - (i + 1) * 0.03 * H, (1 - i * 0.04) * H, 0.03 * H, shade(m, -0.05 * i));
    const top = yb - 0.09 * H - 0.36 * H;
    for (let i = 0; i < 8; i++) g.lathe(cx - 0.42 * H + i * 0.12 * H, yb - 0.09 * H, [[0.03 * H, 0], [0.024 * H, 0.36 * H]], m);
    g.box(cx - 0.47 * H, top - 0.07 * H, 0.94 * H, 0.07 * H, m);
    g.P([cx - 0.49 * H, top - 0.07 * H, cx, top - 0.22 * H, cx, top - 0.07 * H], shade(m, 0.08));
    g.P([cx, top - 0.22 * H, cx + 0.49 * H, top - 0.07 * H, cx, top - 0.07 * H], shade(m, -0.12));
  },
  colosseum(g, cx, yb, H) {
    const st = '#c9a46c', w = 1.05 * H, x0 = cx - w / 2, n = 12, sw = w / n;
    const topAt = (i) => yb - (i < 8 ? 0.56 : 0.56 - (i - 7) * 0.07) * H;
    for (let i = 0; i < n; i++) {
      const lit = 0.12 - Math.abs(i - 3.5) * 0.035;
      g.P([x0 + i * sw, yb, x0 + (i + 1) * sw, yb, x0 + (i + 1) * sw, topAt(i + 1 > 7 ? i + 1 : i), x0 + i * sw, topAt(i)], shade(st, lit));
    }
    for (let r = 0; r < 4; r++) {
      const yr = yb - r * 0.135 * H;
      for (let i = 0; i < n; i++) {
        const ax = x0 + i * sw + sw * 0.22;
        if (yr - 0.11 * H < topAt(i) + 4) continue;
        if (r < 3) g.arch(ax, yr - 0.015 * H, sw * 0.56, 0.1 * H, 'rgba(70,45,25,.55)');
        else g.c.fillStyle = 'rgba(70,45,25,.4)', g.c.fillRect(ax + sw * 0.1, yr - 0.08 * H, sw * 0.3, 0.04 * H);
      }
      g.c.fillStyle = 'rgba(255,240,210,.35)'; g.c.fillRect(x0, yr - 0.005 * H, w * (r < 2 ? 1 : 0.7), 3);
    }
  },
  gate(g, cx, yb, H) {
    const st = '#d7c7a1';
    g.box(cx - 0.42 * H, yb - 0.04 * H, 0.84 * H, 0.04 * H, shade(st, -0.1));
    for (let i = 0; i < 6; i++) g.lathe(cx - 0.35 * H + i * 0.14 * H, yb - 0.04 * H, [[0.03 * H, 0], [0.026 * H, 0.4 * H]], st);
    g.box(cx - 0.42 * H, yb - 0.52 * H, 0.84 * H, 0.08 * H, st);
    g.box(cx - 0.3 * H, yb - 0.62 * H, 0.6 * H, 0.1 * H, shade(st, 0.04));
    const q = '#4e7a64';
    g.box(cx - 0.1 * H, yb - 0.66 * H, 0.2 * H, 0.04 * H, q);
    for (let i = 0; i < 4; i++) g.P([cx - 0.09 * H + i * 0.05 * H, yb - 0.66 * H, cx - 0.07 * H + i * 0.05 * H, yb - 0.75 * H, cx - 0.05 * H + i * 0.05 * H, yb - 0.72 * H, cx - 0.05 * H + i * 0.05 * H, yb - 0.66 * H], shade(q, (i % 2) * 0.1));
    g.spire(cx, yb - 0.74 * H, 0.025 * H, 0.12 * H, q);
  },
  liberty(g, cx, yb, H) {
    const gr = '#9a8f7a', cu = '#5fa58c';
    g.P([cx - 0.5 * H, yb, cx - 0.32 * H, yb - 0.08 * H, cx + 0.32 * H, yb - 0.08 * H, cx + 0.5 * H, yb], shade(gr, 0.05));
    g.box(cx - 0.17 * H, yb - 0.2 * H, 0.34 * H, 0.12 * H, gr);
    g.lathe(cx, yb - 0.2 * H, [[0.12 * H, 0], [0.09 * H, 0.2 * H], [0.11 * H, 0.21 * H], [0.11 * H, 0.24 * H]], gr);
    g.lathe(cx, yb - 0.44 * H, [[0.07 * H, 0], [0.06 * H, 0.15 * H], [0.045 * H, 0.27 * H], [0.03 * H, 0.31 * H]], cu);
    g.disc(cx, yb - 0.79 * H, 0.03 * H, 0.035 * H, 8, cu);
    for (let i = 0; i < 7; i++) { const a = -Math.PI + (i / 6) * Math.PI; g.spire(cx + Math.cos(a) * 0.035 * H, yb - 0.81 * H + Math.sin(a) * 0.035 * H, 0.008 * H, 0.04 * H, cu, Math.cos(a) * 0.02 * H); }
    g.P([cx + 0.03 * H, yb - 0.7 * H, cx + 0.05 * H, yb - 0.71 * H, cx + 0.1 * H, yb - 0.93 * H, cx + 0.08 * H, yb - 0.94 * H], shade(cu, -0.1));
    g.lathe(cx + 0.095 * H, yb - 0.93 * H, [[0.02 * H, 0], [0.012 * H, 0.03 * H]], cu);
    g.spire(cx + 0.095 * H, yb - 0.96 * H, 0.018 * H, 0.06 * H, '#f2b83b');
    g.box(cx - 0.09 * H, yb - 0.66 * H, 0.04 * H, 0.06 * H, shade(cu, 0.1));
  },
  christ(g, cx, yb, H) {
    const rock = '#5f7a55';
    g.P([cx - 0.6 * H, yb, cx - 0.12 * H, yb - 0.5 * H, cx, yb], shade(rock, 0.1));
    g.P([cx, yb, cx - 0.12 * H, yb - 0.5 * H, cx + 0.08 * H, yb - 0.48 * H, cx + 0.62 * H, yb], shade(rock, -0.12));
    g.P([cx - 0.12 * H, yb - 0.5 * H, cx - 0.3 * H, yb - 0.25 * H, cx - 0.05 * H, yb - 0.3 * H], shade('#7d8c86', 0.05));
    const s = '#ebe6da', b = yb - 0.5 * H;
    g.box(cx - 0.03 * H, b - 0.05 * H, 0.06 * H, 0.05 * H, shade(s, -0.1));
    g.lathe(cx, b - 0.05 * H, [[0.04 * H, 0], [0.03 * H, 0.26 * H], [0.025 * H, 0.3 * H]], s);
    g.box(cx - 0.17 * H, b - 0.3 * H, 0.34 * H, 0.035 * H, s);
    g.disc(cx, b - 0.34 * H, 0.022 * H, 0.026 * H, 8, s);
  },
  sails(g, cx, yb, H) {
    g.c.strokeStyle = '#59636b'; g.c.lineWidth = 5;
    g.c.beginPath(); g.c.moveTo(cx - 1.1 * H, yb - 0.1 * H); g.c.quadraticCurveTo(cx - 0.75 * H, yb - 0.75 * H, cx - 0.4 * H, yb - 0.1 * H); g.c.stroke();
    g.c.lineWidth = 2; for (let i = 0; i < 9; i++) { const t = i / 8, x = cx - 1.1 * H + t * 0.7 * H, y = yb - 0.1 * H - 4 * t * (1 - t) * 0.325 * H; g.c.beginPath(); g.c.moveTo(x, y); g.c.lineTo(x, yb - 0.1 * H); g.c.stroke(); }
    g.box(cx - 0.6 * H, yb - 0.08 * H, 1.2 * H, 0.08 * H, '#c9b38f');
    const shell = (x, w, h, k) => {
      g.P([x, yb - 0.08 * H, x + w * 0.5, yb - 0.08 * H, x + w * 0.42, yb - 0.08 * H - h * 0.7, x + w * 0.2, yb - 0.08 * H - h], shade('#f7f5ef', 0.02 + k));
      g.P([x + w * 0.5, yb - 0.08 * H, x + w, yb - 0.08 * H, x + w * 0.42, yb - 0.08 * H - h * 0.7], shade('#dcd8cc', k));
      g.P([x + w * 0.42, yb - 0.08 * H - h * 0.7, x + w * 0.2, yb - 0.08 * H - h, x + w * 0.5, yb - 0.08 * H - h * 0.55], shade('#e9e6dc', k));
    };
    shell(cx - 0.5 * H, 0.42 * H, 0.42 * H, -0.02); shell(cx - 0.28 * H, 0.42 * H, 0.52 * H, 0); shell(cx - 0.05 * H, 0.38 * H, 0.42 * H, 0.02);
    shell(cx + 0.15 * H, 0.3 * H, 0.3 * H, -0.03); shell(cx + 0.3 * H, 0.26 * H, 0.22 * H, 0);
  },
  needle(g, cx, yb, H) {
    const cc = '#cfcac0', gl = '#4a5560';
    g.lathe(cx, yb, [[0.06 * H, 0], [0.03 * H, 0.2 * H], [0.022 * H, 0.6 * H]], cc);
    g.lathe(cx, yb - 0.6 * H, [[0.03 * H, 0], [0.09 * H, 0.02 * H], [0.095 * H, 0.05 * H], [0.06 * H, 0.08 * H], [0.02 * H, 0.09 * H]], gl);
    g.lathe(cx, yb - 0.69 * H, [[0.02 * H, 0], [0.018 * H, 0.06 * H], [0.035 * H, 0.07 * H], [0.03 * H, 0.09 * H], [0.012 * H, 0.1 * H]], cc);
    g.lathe(cx, yb - 0.79 * H, [[0.01 * H, 0], [0.003 * H, 0.21 * H]], '#c43b3b');
  },
  obelisk(g, cx, yb, H) {
    const st = '#e6e0d2';
    g.box(cx - 0.2 * H, yb - 0.05 * H, 0.4 * H, 0.05 * H, shade(st, -0.1));
    g.P([cx - 0.07 * H, yb - 0.05 * H, cx, yb - 0.05 * H, cx, yb - 0.9 * H, cx - 0.045 * H, yb - 0.88 * H], shade(st, 0.08));
    g.P([cx, yb - 0.05 * H, cx + 0.07 * H, yb - 0.05 * H, cx + 0.045 * H, yb - 0.88 * H, cx, yb - 0.9 * H], shade(st, -0.14));
    g.spire(cx, yb - 0.885 * H, 0.045 * H, 0.11 * H, st);
  },
  burj(g, cx, yb, H) {
    const gl = '#9fc3d9';
    for (const [x, h] of [[-0.42, 0.38], [0.36, 0.46], [-0.26, 0.28], [0.5, 0.3]]) g.box(cx + x * H - 0.05 * H, yb - h * H, 0.1 * H, h * H, shade(gl, -0.08));
    const steps = [[0.11, 0], [0.11, 0.18], [0.09, 0.18], [0.09, 0.34], [0.07, 0.34], [0.07, 0.5], [0.052, 0.5], [0.052, 0.63], [0.036, 0.63], [0.036, 0.74], [0.022, 0.74], [0.012, 0.86], [0, 1]];
    g.lathe(cx, yb, steps.map(([r, h]) => [r * H, h * H]), gl);
  },
  twin(g, cx, yb, H) {
    const s = '#c7ced6';
    const tower = (x) => g.lathe(x, yb, [[0.09, 0], [0.09, 0.42], [0.078, 0.44], [0.078, 0.58], [0.064, 0.6], [0.064, 0.7], [0.048, 0.72], [0.048, 0.8], [0.03, 0.82], [0.012, 0.88], [0.004, 1]].map(([r, h]) => [r * H, h * H]), s);
    tower(cx - 0.17 * H); tower(cx + 0.17 * H);
    g.box(cx - 0.09 * H, yb - 0.47 * H, 0.18 * H, 0.03 * H, shade(s, -0.2));
    g.c.strokeStyle = 'rgba(60,70,80,.35)'; g.c.lineWidth = 1;
    for (let i = 1; i < 18; i++) for (const x of [cx - 0.17 * H, cx + 0.17 * H]) { const y = yb - i * 0.035 * H; g.c.beginPath(); g.c.moveTo(x - 0.08 * H, y); g.c.lineTo(x + 0.08 * H, y); g.c.stroke(); }
  },
  mbs(g, cx, yb, H) {
    const gl = '#b9cbd8';
    for (const x of [-0.28, 0, 0.28]) g.P([cx + (x - 0.07) * H, yb, cx + (x + 0.07) * H, yb, cx + (x + 0.06) * H, yb - 0.55 * H, cx + (x - 0.05) * H, yb - 0.55 * H], shade(gl, x * 0.2)), g.box(cx + (x - 0.045) * H, yb - 0.55 * H, 0.09 * H, 0.55 * H, gl);
    g.P([cx - 0.42 * H, yb - 0.56 * H, cx + 0.62 * H, yb - 0.6 * H, cx + 0.56 * H, yb - 0.66 * H, cx - 0.38 * H, yb - 0.62 * H], '#e3e8ec');
    g.P([cx - 0.42 * H, yb - 0.56 * H, cx + 0.62 * H, yb - 0.6 * H, cx + 0.6 * H, yb - 0.57 * H, cx - 0.4 * H, yb - 0.545 * H], '#8a98a3');
    for (let i = 0; i < 6; i++) g.disc(cx - 0.3 * H + i * 0.15 * H, yb - 0.65 * H, 0.02 * H, 0.015 * H, 6, '#3f9a52');
  },
  onion(g, cx, yb, H) {
    const br = '#b5452f';
    const tw = (x, h, r, cols) => { g.lathe(x, yb, [[r, 0], [r * 0.9, h]], br); g.lathe(x, yb - h, g.domeProf(r * 1.25, r * 2.3, 'onion', 8), cols[0], cols); g.lathe(x, yb - h - r * 2.3, [[r * 0.12, 0], [0.004 * H, r * 0.9]], '#d6a93a'); };
    tw(cx - 0.36 * H, 0.32 * H, 0.06 * H, ['#3a7d44', '#e6c34a']);
    tw(cx + 0.36 * H, 0.3 * H, 0.06 * H, ['#2f5fa3', '#f2f2f2']);
    g.box(cx - 0.4 * H, yb - 0.2 * H, 0.8 * H, 0.2 * H, br);
    g.lathe(cx, yb, [[0.09 * H, 0], [0.085 * H, 0.42 * H], [0.07 * H, 0.44 * H], [0.03 * H, 0.82 * H], [0.03 * H, 0.86 * H]], '#c96b3c');
    g.lathe(cx, yb - 0.86 * H, g.domeProf(0.04 * H, 0.08 * H, 'onion'), '#d6a93a');
    tw(cx - 0.18 * H, 0.4 * H, 0.07 * H, ['#c0392b', '#f4f1e8']);
    tw(cx + 0.19 * H, 0.38 * H, 0.07 * H, ['#e6a23a', '#3a7d44']);
  },
  windmill(g, cx, yb, H) {
    g.lathe(cx, yb, [[0.13 * H, 0], [0.12 * H, 0.08 * H], [0.08 * H, 0.55 * H]], '#7b5a45');
    g.box(cx - 0.17 * H, yb - 0.24 * H, 0.34 * H, 0.025 * H, '#4b3528');
    g.arch(cx - 0.03 * H, yb, 0.06 * H, 0.1 * H, '#3a2a20');
    g.lathe(cx, yb - 0.55 * H, g.domeProf(0.09 * H, 0.08 * H), '#3f4a4f');
    return { hub: [cx, yb - 0.58 * H], r: 0.42 * H };
  },
  castle(g, cx, yb, H) {
    const st = '#cfc6b4', rf = '#3d5a80';
    const cren = (x, y, w) => { for (let i = 0; i < w / (0.04 * H); i++) g.box(x + i * 0.04 * H, y - 0.025 * H, 0.022 * H, 0.025 * H, st); };
    g.box(cx - 0.42 * H, yb - 0.24 * H, 0.84 * H, 0.24 * H, st); cren(cx - 0.42 * H, yb - 0.24 * H, 0.84 * H);
    g.arch(cx - 0.05 * H, yb, 0.1 * H, 0.13 * H, '#4a3f33');
    const tower = (x, h, r) => { g.lathe(x, yb, [[r, 0], [r, h]], st); g.spire(x, yb - h, r * 1.25, r * 2.6, rf); for (let i = 1; i < 4; i++) g.box(x - r * 0.15, yb - h * i / 4, r * 0.3, r * 0.5, '#4a4237'); };
    tower(cx - 0.42 * H, 0.42 * H, 0.06 * H); tower(cx + 0.42 * H, 0.4 * H, 0.06 * H);
    g.box(cx - 0.12 * H, yb - 0.6 * H, 0.24 * H, 0.36 * H, shade(st, 0.03));
    tower(cx - 0.12 * H, 0.7 * H, 0.045 * H); tower(cx + 0.12 * H, 0.66 * H, 0.045 * H);
    g.spire(cx, yb - 0.6 * H, 0.14 * H, 0.18 * H, rf);
  },
  cathedral(g, cx, yb, H) {
    const st = '#c8b28d';
    g.box(cx - 0.3 * H, yb - 0.4 * H, 0.6 * H, 0.4 * H, st);
    g.disc(cx, yb - 0.27 * H, 0.07 * H, 0.07 * H, 12, '#6d86b8');
    g.arch(cx - 0.05 * H, yb, 0.1 * H, 0.16 * H, shade(st, -0.5), true);
    g.spire(cx, yb - 0.4 * H, 0.3 * H, 0.16 * H, shade(st, -0.05));
    for (const [x, h] of [[-0.38, 0.82], [-0.22, 0.95], [0.22, 0.92], [0.38, 0.8]]) {
      g.lathe(cx + x * H, yb, [[0.06 * H, 0], [0.05 * H, h * 0.55 * H], [0.034 * H, h * 0.8 * H], [0.008 * H, h * H]], st);
      for (let i = 1; i < 6; i++) g.box(cx + x * H - 0.008 * H, yb - i * h * 0.12 * H, 0.016 * H, 0.04 * H, shade(st, -0.45));
      g.disc(cx + x * H, yb - h * H, 0.012 * H, 0.012 * H, 6, '#d6a93a');
    }
  },
  fuji(g, cx, yb, H) {
    const m = '#5a6d8c';
    g.P([cx - 1.0 * H, yb, cx + 0.05 * H, yb - 0.82 * H, cx + 0.05 * H, yb], shade(m, 0.08));
    g.P([cx + 0.05 * H, yb - 0.82 * H, cx + 0.15 * H, yb - 0.82 * H, cx + 1.05 * H, yb, cx + 0.05 * H, yb], shade(m, -0.12));
    g.P([cx - 0.18 * H, yb - 0.66 * H, cx + 0.05 * H, yb - 0.82 * H, cx + 0.15 * H, yb - 0.82 * H, cx + 0.38 * H, yb - 0.62 * H, cx + 0.22 * H, yb - 0.6 * H, cx + 0.12 * H, yb - 0.68 * H, cx + 0.02 * H, yb - 0.58 * H, cx - 0.06 * H, yb - 0.64 * H], '#f4f7fb');
    LM.pagoda(g, cx - 0.55 * H, yb, 0.55 * H, { body: '#c0392b', roof: '#2c2f33', tiers: 5 });
  },
  mountain(g, cx, yb, H, pal = {}) {
    const m = pal.rock || '#6b6f78', snow = pal.snow !== false;
    const peak = (x, hw, h, k) => {
      g.P([x - hw, yb, x - hw * 0.1, yb - h, x, yb - h * 0.6, x, yb], shade(m, 0.1 + k));
      g.P([x, yb, x, yb - h * 0.6, x - hw * 0.1, yb - h, x + hw, yb], shade(m, -0.14 + k));
      if (snow) g.P([x - hw * 0.1, yb - h, x - hw * 0.3, yb - h * 0.72, x - hw * 0.12, yb - h * 0.78, x, yb - h * 0.66, x + hw * 0.2, yb - h * 0.74, x + hw * 0.08, yb - h * 0.86], '#f3f6fa');
    };
    peak(cx + 0.55 * H, 0.45 * H, 0.6 * H, -0.06); peak(cx - 0.6 * H, 0.5 * H, 0.68 * H, -0.04);
    peak(cx, 0.6 * H, 0.95 * H, 0);
  },
  moai(g, cx, yb, H) {
    const s = '#5d5a55';
    for (let i = 0; i < 5; i++) {
      const x = cx - 0.6 * H + i * 0.3 * H, h = (0.5 + (i % 2) * 0.08) * H, w = 0.09 * H;
      g.P([x - w, yb, x + w, yb, x + w * 0.9, yb - h, x - w * 0.8, yb - h], shade(s, 0.06));
      g.P([x + w * 0.1, yb - h * 0.45, x + w * 1.2, yb - h * 0.5, x + w * 0.3, yb - h * 0.75], shade(s, -0.1));
      g.box(x - w * 0.8, yb - h * 0.8, w * 1.7, h * 0.07, shade(s, -0.35));
      g.box(x - w * 0.8, yb - h * 0.32, w * 1.6, h * 0.04, shade(s, -0.3));
      if (i % 2 === 0) g.box(x - w * 0.7, yb - h - 0.06 * H, w * 1.5, 0.06 * H, '#a0503a');
    }
  },
  greatwall(g, cx, yb, H) {
    const hill = '#4f8a3c', st = '#b9a88a';
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([cx - 1.1 * H + t * 2.2 * H, yb - (0.25 + 0.25 * Math.sin(t * 5.2) + 0.15 * Math.sin(t * 11)) * H]); }
    for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; g.P([x0, yb, x0, y0, x1, y1, x1, yb], shade(hill, y1 < y0 ? 0.08 : -0.08)); }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      g.P([x0, y0 - 0.02 * H, x1, y1 - 0.02 * H, x1, y1 - 0.09 * H, x0, y0 - 0.09 * H], shade(st, y1 < y0 ? 0.06 : -0.12));
      for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; g.box(x - 0.012 * H, y - 0.12 * H, 0.024 * H, 0.03 * H, st); }
    }
    for (const i of [2, 5, 8]) { const [x, y] = pts[i]; g.box(x - 0.06 * H, y - 0.22 * H, 0.12 * H, 0.18 * H, st); g.arch(x - 0.02 * H, y - 0.09 * H, 0.04 * H, 0.07 * H, '#5e5444'); g.spire(x, y - 0.22 * H, 0.07 * H, 0.05 * H, '#7b3a2c'); }
  },
  baobab(g, cx, yb, H) {
    const tr = '#8a6a4f', lf = '#5f8a3a';
    const bao = (x, s) => { g.lathe(x, yb, [[0.09, 0], [0.11, 0.1], [0.1, 0.3], [0.07, 0.48], [0.05, 0.55]].map(([r, h]) => [r * s, h * s]), tr); for (let k = -2; k <= 2; k++) { g.P([x + k * 0.02 * s, yb - 0.54 * s, x + k * 0.09 * s, yb - 0.66 * s, x + k * 0.1 * s + 0.02 * s, yb - 0.65 * s], tr); g.disc(x + k * 0.1 * s, yb - 0.68 * s, 0.08 * s, 0.035 * s, 7, lf); } };
    bao(cx - 0.5 * H, 0.8 * H); bao(cx + 0.05 * H, 1.05 * H); bao(cx + 0.6 * H, 0.7 * H);
    for (const x of [-0.25, 0.32]) { g.lathe(cx + x * H, yb, [[0.08 * H, 0], [0.08 * H, 0.1 * H]], '#c69a62'); g.spire(cx + x * H, yb - 0.1 * H, 0.11 * H, 0.12 * H, '#a8783a'); g.arch(cx + x * H - 0.02 * H, yb, 0.04 * H, 0.06 * H, '#4a3420'); }
  },
  island(g, cx, yb, H) {
    g.P([cx - 0.75 * H, yb, cx - 0.5 * H, yb - 0.06 * H, cx + 0.45 * H, yb - 0.07 * H, cx + 0.8 * H, yb], '#f0d9a4');
    g.P([cx - 0.5 * H, yb - 0.06 * H, cx + 0.45 * H, yb - 0.07 * H, cx + 0.2 * H, yb - 0.13 * H, cx - 0.25 * H, yb - 0.12 * H], '#4fa356');
    const palm = (x, h, lean) => {
      const n = 6; let px = x, py = yb - 0.08 * H;
      for (let i = 0; i < n; i++) { const nx = x + lean * ((i + 1) / n) ** 1.6, ny = yb - 0.08 * H - (h * (i + 1)) / n; g.P([px - 5, py, px + 5, py, nx + 4, ny, nx - 4, ny], i % 2 ? '#8a6a4f' : '#7a5c43'); px = nx; py = ny; }
      for (let k = 0; k < 7; k++) { const a = -Math.PI + (k / 6) * Math.PI + (k > 3 ? 0.2 : -0.2); g.P([px, py, px + Math.cos(a) * 0.16 * H, py + Math.sin(a) * 0.05 * H + 0.05 * H, px + Math.cos(a) * 0.08 * H, py + Math.sin(a) * 0.06 * H], shade('#3f9a52', (k % 2) * 0.12 - 0.05)); }
    };
    palm(cx - 0.25 * H, 0.55 * H, -0.12 * H); palm(cx, 0.68 * H, 0.08 * H); palm(cx + 0.28 * H, 0.48 * H, 0.14 * H);
    for (const x of [0.55, 0.72]) { const bx = cx + x * H; for (const s of [-1, 1]) g.box(bx + s * 0.04 * H - 2, yb - 0.06 * H, 4, 0.08 * H, '#6b4f3a'); g.box(bx - 0.06 * H, yb - 0.13 * H, 0.12 * H, 0.07 * H, '#d9b98a'); g.spire(bx, yb - 0.13 * H, 0.08 * H, 0.08 * H, '#9c7a4a'); }
  },
  lighthouse(g, cx, yb, H) {
    const rk = '#6f6a63';
    g.P([cx - 0.6 * H, yb, cx - 0.35 * H, yb - 0.18 * H, cx + 0.1 * H, yb - 0.22 * H, cx + 0.3 * H, yb - 0.14 * H, cx + 0.6 * H, yb], shade(rk, 0.05));
    g.P([cx - 0.35 * H, yb - 0.18 * H, cx + 0.1 * H, yb - 0.22 * H, cx - 0.05 * H, yb - 0.06 * H], shade(rk, 0.15));
    const b = yb - 0.2 * H, prof = []; for (let i = 0; i <= 6; i++) prof.push([(0.08 - i * 0.006) * H, i * 0.09 * H]);
    g.lathe(cx, b, prof, '#f3f0ea', ['#f3f0ea', '#c43b3b']);
    g.box(cx - 0.06 * H, b - 0.57 * H, 0.12 * H, 0.03 * H, '#2f3438');
    g.box(cx - 0.035 * H, b - 0.66 * H, 0.07 * H, 0.09 * H, '#ffe28a');
    g.lathe(cx, b - 0.66 * H, g.domeProf(0.05 * H, 0.06 * H), '#2f3438');
    return { beam: [cx, b - 0.615 * H] };
  },
  church(g, cx, yb, H) {
    const w = '#f3eee4', a = '#e2b44a';
    g.box(cx - 0.24 * H, yb - 0.4 * H, 0.48 * H, 0.4 * H, w);
    g.P([cx - 0.24 * H, yb - 0.4 * H, cx, yb - 0.56 * H, cx + 0.24 * H, yb - 0.4 * H], shade(a, 0.05));
    g.arch(cx - 0.06 * H, yb, 0.12 * H, 0.2 * H, '#6b4a32');
    g.disc(cx, yb - 0.3 * H, 0.04 * H, 0.04 * H, 10, '#7aa6c9');
    for (const s of [-1, 1]) {
      const x = cx + s * 0.3 * H;
      g.box(x - 0.08 * H, yb - 0.62 * H, 0.16 * H, 0.62 * H, w);
      g.arch(x - 0.03 * H, yb - 0.46 * H, 0.06 * H, 0.1 * H, '#5a4a3a');
      g.box(x - 0.09 * H, yb - 0.64 * H, 0.18 * H, 0.03 * H, a);
      g.lathe(x, yb - 0.64 * H, g.domeProf(0.07 * H, 0.1 * H), a);
      g.c.fillStyle = '#4a4036'; g.c.fillRect(x - 2, yb - 0.82 * H, 4, 0.08 * H); g.c.fillRect(x - 0.02 * H, yb - 0.79 * H, 0.04 * H, 4);
    }
  },
  capitol(g, cx, yb, H) {
    const w = '#f1ede4';
    g.box(cx - 0.5 * H, yb - 0.26 * H, H, 0.26 * H, w);
    for (let i = 0; i < 14; i++) g.box(cx - 0.46 * H + i * 0.068 * H, yb - 0.2 * H, 0.02 * H, 0.12 * H, shade(w, -0.3));
    for (let i = 0; i < 6; i++) g.lathe(cx - 0.15 * H + i * 0.06 * H, yb - 0.26 * H, [[0.016 * H, 0], [0.014 * H, 0.16 * H]], w);
    g.P([cx - 0.19 * H, yb - 0.42 * H, cx, yb - 0.5 * H, cx + 0.19 * H, yb - 0.42 * H], shade(w, -0.02));
    g.lathe(cx, yb - 0.42 * H, [[0.14 * H, 0], [0.14 * H, 0.1 * H], [0.12 * H, 0.11 * H], ...g.domeProf(0.13 * H, 0.22 * H, 'round', 7).map(([r, h]) => [r, 0.11 * H + h])], w);
    g.lathe(cx, yb - 0.75 * H, [[0.03 * H, 0], [0.03 * H, 0.06 * H], [0.01 * H, 0.12 * H]], w);
  },
  yurt(g, cx, yb, H) {
    LM.mountain(g, cx + 0.3 * H, yb - 0.05 * H, 0.7 * H, { rock: '#7d8a7a', snow: true });
    for (const [x, s] of [[-0.45, 0.8], [-0.05, 1], [0.4, 0.75]]) { const r = 0.14 * H * s; g.lathe(cx + x * H, yb, [[r, 0], [r, 0.1 * H * s]], '#f2efe8'); g.lathe(cx + x * H, yb - 0.1 * H * s, [[r * 1.05, 0], [r * 0.2, 0.09 * H * s], [0, 0.1 * H * s]], '#e6e0d4'); g.box(cx + x * H - 0.02 * H * s, yb - 0.07 * H * s, 0.04 * H * s, 0.07 * H * s, '#c0392b'); g.c.strokeStyle = '#3d6fb0'; g.c.lineWidth = 3; g.c.beginPath(); g.c.moveTo(cx + x * H - r, yb - 0.06 * H * s); g.c.lineTo(cx + x * H + r, yb - 0.06 * H * s); g.c.stroke(); }
  },
};
const PAL = {
  kr: { body: '#e9dfcf', roof: '#3a5a40' }, bt: { body: '#f4ecdc', roof: '#8a3b2a', tiers: 3 }, lk: { gold: '#efe9dc' }, id: { gold: '#8f8a7c' }, np: {},
  tr: { dome: '#7d8a99' }, sa: { dome: '#3f8f8a' }, ir: { dome: '#2f7fa8' }, uz: { dome: '#2f9ab0' }, pk: { dome: '#f1ede4' }, ae: {}, ma: { dome: '#3e8a5a' },
};

// ---------------- cây ----------------
function tree(g, kind, x, yb, s) {
  if (kind === 'palm') {
    g.P([x - 3, yb, x + 3, yb, x + s * 0.12 + 2, yb - s, x + s * 0.12 - 2, yb - s], '#7a5c43');
    for (let k = 0; k < 6; k++) { const a = -Math.PI + (k / 5) * Math.PI; g.P([x + s * 0.12, yb - s, x + s * 0.12 + Math.cos(a) * s * 0.4, yb - s + Math.sin(a) * s * 0.12 + s * 0.12, x + s * 0.12 + Math.cos(a) * s * 0.2, yb - s + Math.sin(a) * s * 0.15], shade('#3f9a52', (k % 2) * 0.12)); }
  } else if (kind === 'pine') {
    for (let i = 0; i < 3; i++) g.spire(x, yb - s * 0.12 - i * s * 0.25, s * (0.32 - i * 0.07), s * 0.45, i % 2 ? '#2f6b45' : '#357a4d');
  } else if (kind === 'acacia') {
    g.P([x - 2, yb, x + 2, yb, x + 3, yb - s * 0.7, x - 1, yb - s * 0.7], '#6b4f3a');
    g.disc(x + 1, yb - s * 0.75, s * 0.45, s * 0.12, 7, '#7a9a3a');
  } else if (kind === 'cherry') {
    g.P([x - 3, yb, x + 3, yb, x + 2, yb - s * 0.5, x - 2, yb - s * 0.5], '#6b4f3a');
    g.disc(x, yb - s * 0.7, s * 0.34, s * 0.3, 7, '#f2a7c3');
  } else {
    g.P([x - 3, yb, x + 3, yb, x + 2, yb - s * 0.45, x - 2, yb - s * 0.45], '#6b4f3a');
    g.disc(x, yb - s * 0.68, s * 0.3, s * 0.32, 7, kind === 'autumn' ? '#d98c3a' : '#4f9a45');
  }
}

/** Nhà phố low poly (mặt trước 2 mảng + mặt bên + mái). Trả danh sách ô cửa để thắp đèn ban đêm. */
function building(g, x, yb, w, h, col, roofCol, pitched, rng, lights) {
  const d = w * 0.32;
  g.P([x + w, yb, x + w + d, yb - d * 0.5, x + w + d, yb - h - d * 0.5, x + w, yb - h], shade(col, -0.24));
  g.box(x, yb - h, w, h, col);
  if (pitched) {
    g.P([x - 2, yb - h, x + w / 2, yb - h - w * 0.42, x + w + 2, yb - h], shade(roofCol, 0.06));
    g.P([x + w / 2, yb - h - w * 0.42, x + w + 2, yb - h, x + w + d, yb - h - d * 0.5, x + w / 2 + d, yb - h - w * 0.42 - d * 0.5], shade(roofCol, -0.15));
  } else g.P([x, yb - h, x + w, yb - h, x + w + d, yb - h - d * 0.5, x + d, yb - h - d * 0.5], shade(col, 0.2));
  const cols = Math.max(1, Math.floor(w / 13)), rows = Math.max(1, Math.floor((h - 10) / 16));
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const wx = x + 5 + k * ((w - 10) / cols), wy = yb - h + 8 + r * 16;
    g.c.fillStyle = shade(col, -0.32); g.c.fillRect(wx, wy, Math.max(3, (w - 10) / cols - 5), 8);
    if (rng() < 0.55) lights.push([wx, wy, Math.max(3, (w - 10) / cols - 5), 8]);
  }
}

/** Bóng đổ elip mờ dưới chân vật thể. */
function softShadow(c, x, y, rx, ry, a) {
  if (rx <= 0 || ry <= 0 || a <= 0) return;
  c.save(); c.translate(x, y); c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(34,38,32,${a})`); g.addColorStop(0.6, `rgba(34,38,32,${a * 0.55})`); g.addColorStop(1, 'rgba(34,38,32,0)');
  c.fillStyle = g; c.fillRect(-rx, -rx, rx * 2, rx * 2); c.restore();
}

/** Núi đá bàn (mesa) nhiều mặt cắt: mỗi trụ đá có mặt đón nắng, mặt khuất, nắp sáng và hai vỉa đá sẫm. */
function mesa(g, x0, base, wd, ht, col, rng) {
  g.P([x0 - wd * 0.74, base, x0 - wd * 0.22, base - ht * 0.3, x0, base], shade(col, 0.05));
  g.P([x0, base, x0 + wd * 0.24, base - ht * 0.27, x0 + wd * 0.76, base], shade(col, -0.2));
  const n = 5 + Math.floor(rng() * 3);
  let x = x0 - wd / 2;
  for (let i = 0; i < n; i++) {
    const sw = (wd / n) * (0.85 + rng() * 0.5), t = 1 - Math.abs((i + 0.5) / n - 0.5) * 1.1, hh = ht * (0.5 + 0.5 * t) * (0.8 + rng() * 0.25);
    const m = x + sw * (0.4 + rng() * 0.25), top = base - hh, tl = top + rng() * 14, tr = top + rng() * 18;
    g.P([x, base, x, tl, m, top, m, base], shade(col, 0.14 - i * 0.012));
    g.P([m, base, m, top, x + sw, tr, x + sw, base], shade(col, -0.2 - rng() * 0.06));
    for (const k of [0.34, 0.62]) {
      const yy = base - hh * k;
      g.P([x, yy, m, yy - 3, m, yy + 5, x, yy + 7], shade(col, -0.06));
      g.P([m, yy - 3, x + sw, yy, x + sw, yy + 7, m, yy + 5], shade(col, -0.34));
    }
    g.P([x, tl, m, top, x + sw, tr, m + sw * 0.08, top + 9], shade(col, 0.3));
    x += sw * 0.86;
  }
}

/** Bối cảnh quanh công trình theo nước (iso2); nước không có trong bảng → suy theo vùng + khí hậu (settingOf). */
const SETTING = {};
for (const [k, list] of Object.entries({
  metro: 'us ca jp kr cn sg ae qa kw bh my au br pa th id ph ar mx co cl za ng il sa tr gb ru kz az',
  paddy: 'vn la kh mm bd lk tl in',
  farm: 'ua pl hu ro bg rs md by lt lv ee sk uy py ie dk nl be hr ba mk al',
  alpine: 'ch at np bt no is nz pe bo ec kg tj ge am ad li me si fi se',
  steppe: 'mn',
  jungle: 'cd cg ga gq cm cf gh ci lr sl ve gy sr cr ni hn gt bz sv pg bn',
  coast: 'mv sc mu km cv st mt cy',
})) for (const iso of list.split(' ')) SETTING[iso] = k;
export function settingOf(iso, region, lat, lon, clim) {
  if (SETTING[iso]) return SETTING[iso];
  if (clim === 'desert') return 'desert';
  if (region === 'chau-dai-duong') return 'coast';
  if (region === 'chau-phi') return 'savanna';
  if (region === 'bac-my') return lon > -85 && lon < -59 && lat > 10 && lat < 27 ? 'coast' : 'oldtown';
  if (region === 'chau-a') return lat < 28 ? 'paddy' : 'steppe';
  if (clim === 'snow') return 'alpine';
  return region === 'nam-my' ? 'farm' : 'oldtown';
}
const FIELD = {
  metro: (g) => [g, shade(g, -0.06), shade(g, 0.05), '#b7b3a4'], oldtown: (g) => [g, shade(g, 0.05), mix(g, '#c9b26a', 0.35), shade(g, -0.06)],
  paddy: () => ['#8fae6a', '#a4b866', '#7fa57a', '#9fbba6', '#c2b866', '#86a85f'], farm: () => ['#a9a85a', '#d2b85e', '#8a9a5b', '#9a7b55', '#c7c074', '#b5a04e'],
  desert: (g) => [g, shade(g, 0.06), shade(g, -0.06), mix(g, '#c98f5e', 0.25)], savanna: () => ['#c2a862', '#b89c58', '#cdb673', '#a9a45e'],
  jungle: () => ['#5f8f58', '#55844f', '#6d9a62', '#4c7a55'], alpine: (g) => [g, shade(g, -0.06), mix(g, '#cfd6d6', 0.3), shade(g, 0.05)],
  steppe: () => ['#a8ab6c', '#9ba062', '#b5b47a', '#a39d63'], coast: () => ['#e2d2a6', '#d9c798', '#ead9b2'],
};
const GLASS = ['#9fb6c2', '#8aa3b4', '#b9c6c9', '#c9bfae', '#7f97a8', '#d6d2c4', '#a7b3ae'];

/**
 * Tạo cảnh cho một nước: info = { iso2, region, lat, lon, capital, country, sight }.
 * Trả { type, tod, setting, draw(ctx, x, y, t, alpha, view) } — t: giây kể từ lúc cảnh hiện;
 * view = { viewH, grow }: khung đang mở cao tới đâu (grow 0 → 1), cảnh tự canh công trình vào giữa phần đang thấy.
 */
export function createScene(info, { w = 1000, h = 1010, makeCanvas, font = 'sans-serif', reduced = false } = {}) {
  const rng = rngOf(`${info.iso2}|${info.capital}`);
  const type = landmarkOf(info.iso2, info.region, info.lat, info.lon);
  const clim = climateOf(type, info.region, info.lat, info.lon);
  const setting = settingOf(info.iso2, info.region, info.lat, info.lon, clim);
  const cityKey = cityOf(info.iso2, info.region, info.lat, info.lon), city = CITY[cityKey];
  const r0 = rng();
  const tod = r0 < 0.5 ? 'day' : r0 < 0.82 ? 'sunset' : 'night';
  const sky = SKY[tod], haze = sky[sky.length - 1];
  const water = WATER.has(type);
  const cx = w / 2, horizon = Math.round(h * 0.46), yb = Math.round(h * 0.575), LH = Math.round(Math.min(h * 0.35, w * 0.36));
  // lớp "mặt đất" vẽ rộng hơn khung: lúc đầu máy quay ở xa (thu nhỏ quanh điểm tụ ở chân trời) nên thấy cả vùng xung quanh
  const S0 = 0.62, OX = Math.ceil((w / S0 - w) / 2), W2 = w + OX * 2, H2 = Math.ceil(horizon + (h - horizon) / S0);
  const treeKind = setting === 'jungle' || setting === 'coast' || clim === 'tropical' ? 'palm' : clim === 'snow' || setting === 'alpine' ? 'pine' : setting === 'savanna' ? 'acacia' : clim === 'desert' ? 'palm' : info.iso2 === 'jp' ? 'cherry' : rng() < 0.3 ? 'pine' : 'round';
  const ground = setting === 'coast' ? '#e2d2a6' : setting === 'savanna' ? '#c2a862' : setting === 'steppe' ? '#a8ab6c' : GROUND[clim];
  const fields = FIELD[setting](ground);
  const tint = tod === 'night' ? 'rgba(18,28,62,.36)' : tod === 'sunset' ? 'rgba(236,128,84,.15)' : null;
  const layer = () => { const cv = makeCanvas(W2, H2), c = cv.getContext('2d'); c.translate(OX, 0); return [cv, c, kit(c)]; };
  const tintLayer = (c) => {
    c.save(); c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(226,220,204,.08)'; c.fillRect(-OX, 0, W2, H2); // phủ nhẹ một lớp sương cho màu trầm xuống
    if (tint) { c.fillStyle = tint; c.fillRect(-OX, 0, W2, H2); }
    c.restore();
  };
  const toA = (c, a) => { const [r, g2, b] = toRgb(c); return `rgba(${r},${g2},${b},${a})`; };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // --- trời: mặt trời / trăng nhiều mặt, sao
  const skyCv = makeCanvas(w, h), sc = skyCv.getContext('2d'), gs = kit(sc);
  const grad = sc.createLinearGradient(0, 0, 0, horizon + 40);
  sky.forEach((col, i) => grad.addColorStop(i / (sky.length - 1), col));
  sc.fillStyle = grad; sc.fillRect(0, 0, w, h);
  const stars = [];
  if (tod === 'night') for (let i = 0; i < 90; i++) stars.push([rng() * w, rng() * horizon * 0.85, rng() * 1.8 + 0.8, rng() * 6]);
  const sunX = w * (0.72 + rng() * 0.14), sunY = tod === 'sunset' ? horizon - 110 : h * 0.13, sunR = tod === 'night' ? 34 : 50;
  const sunCol = tod === 'night' ? '#e9e6d2' : tod === 'sunset' ? '#f6cf94' : '#f7edc8';
  sc.save(); sc.globalAlpha = 0.22; gs.disc(sunX, sunY, sunR * 1.9, sunR * 1.9, 9, sunCol, 0.1); sc.restore();
  gs.disc(sunX, sunY, sunR, sunR, 9, sunCol, 0.3);

  // --- lớp sau: núi xa, đường chân trời theo bối cảnh, mặt đất chia ô phối cảnh, cụm nhà / cây hai bên
  const [back, bc, gb] = layer();
  const lightsB = [], lightsF = [];
  const ridge = (base, amp, col, n, seed, snowCap) => {
    const pts = []; for (let i = 0; i <= n; i++) pts.push([-OX + (i / n) * W2, base - amp * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + seed)) * (0.6 + 0.4 * rng()))]);
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - amp * 0.22 * rng();
      gb.P([x0, base + 2, x0, y0, mx, my, mx, base + 2], shade(col, 0.06)); gb.P([mx, base + 2, mx, my, x1, y1, x1, base + 2], shade(col, -0.1));
      if (snowCap && base - my > amp * 0.55) { const k = 0.3; gb.P([mx, my, mx + (x0 - mx) * k, my + (y0 - my) * k, mx, my + (base - my) * 0.16], '#f1f3f1'); gb.P([mx, my, mx + (x1 - mx) * k, my + (y1 - my) * k, mx, my + (base - my) * 0.16], '#d5dbde'); }
    }
  };
  const farCol = clim === 'desert' ? '#c2a077' : clim === 'snow' || setting === 'alpine' ? '#8fa0b2' : '#6f8a90';
  const amp = setting === 'alpine' ? 2.3 : setting === 'desert' || setting === 'steppe' || setting === 'farm' ? 0.45 : setting === 'coast' ? 0 : 1;
  if (amp) { ridge(horizon, 150 * amp, mix(farCol, haze, 0.62), 11, rng() * 6, setting === 'alpine'); ridge(horizon, 85 * amp, mix(shade(farCol, -0.1), haze, 0.42), 14, rng() * 6, setting === 'alpine'); }
  if (setting === 'desert' && rng() < 0.6) mesa(gb, w * (rng() < 0.5 ? 0.12 : 0.86), horizon + 6, w * 0.2, h * 0.11, mix(TERRA, haze, 0.45), rng);
  if (setting === 'paddy' && cityKey === 'eastasia') for (let i = 0; i < 9; i++) { // núi đá vôi kiểu Hạ Long / Ninh Bình
    const kx = -OX + rng() * W2, kh = 70 + rng() * 120, kw = 26 + rng() * 34, col = mix('#6d8a72', haze, 0.38 + rng() * 0.2);
    gb.lathe(kx, horizon + 4, [[kw, 0], [kw * 0.92, kh * 0.45], [kw * 0.7, kh * 0.78], [kw * 0.3, kh * 0.96], [0, kh]], col);
  }
  if (setting === 'metro') { // đường chân trời cao ốc mờ xa
    let x = -OX; while (x < w + OX) { const bw = 22 + rng() * 30, bh = 40 + rng() * 150 * (0.4 + 0.6 * Math.abs(Math.sin(x * 0.006 + r0 * 6))); gb.box(x, horizon + 4 - bh, bw, bh, mix(pick(GLASS), haze, 0.55)); if (rng() < 0.25) gb.box(x + bw * 0.4, horizon + 4 - bh - 16, 3, 16, mix('#7f8c94', haze, 0.5)); x += bw + rng() * 8; }
  }
  // mặt đất: lưới ô theo phối cảnh, tụ về (cx, horizon); ruộng có luống
  const sea = setting === 'coast' ? yb - 34 : 0, ROWS = 11, furrow = setting === 'paddy' || setting === 'farm';
  const rowY = (r) => horizon + Math.pow(r / ROWS, 1.7) * (H2 - horizon), unit = (y) => 86 + (y - horizon) * 1.05;
  for (let r = 0; r < ROWS; r++) {
    const y0 = rowY(r), y1 = rowY(r + 1) + 1, u0 = unit(y0), u1 = unit(y1), off = (rng() - 0.5) * 0.8;
    for (let k = -10; k < 10; k++) {
      const a0 = cx + (k + off) * u0, a1 = cx + (k + 1 + off) * u0, b0 = cx + (k + off) * u1, b1 = cx + (k + 1 + off) * u1;
      if (Math.max(a1, b1) < -OX || Math.min(a0, b0) > w + OX) { rng(); continue; }
      const wet = sea && y1 <= sea + 30, col = wet ? mix('#7fa9ae', haze, 0.5 - r * 0.1) : mix(pick(fields), haze, Math.max(0, 0.46 - r * 0.075)), j = (rng() - 0.5) * 0.06;
      gb.P([a0, y0, a1, y0, b0, y1], shade(col, j + 0.02)); gb.P([a1, y0, b1, y1, b0, y1], shade(col, j - 0.03));
      if (furrow && !wet && r > 1 && rng() < 0.7) for (let f = 1; f < 5; f++) { const t0 = f / 5, t1 = t0 + 0.05; gb.P([a0 + (a1 - a0) * t0, y0, a0 + (a1 - a0) * t1, y0, b0 + (b1 - b0) * t1, y1, b0 + (b1 - b0) * t0, y1], shade(col, -0.1)); }
    }
  }
  if (sea) for (let i = 0; i < 5; i++) { // thuyền buồm ngoài khơi
    const bx = -OX + rng() * W2, by = horizon + 14 + rng() * (sea - horizon - 30), s = 0.5 + (by - horizon) / 90;
    gb.P([bx - 16 * s, by, bx + 16 * s, by, bx + 11 * s, by + 6 * s, bx - 11 * s, by + 6 * s], '#7a5c43'); gb.P([bx, by - 2, bx, by - 30 * s, bx - 13 * s, by - 2], '#f4f1e6'); gb.P([bx + 2, by - 2, bx + 2, by - 24 * s, bx + 11 * s, by - 2], '#d9d4c4');
  }
  // sương chân trời
  const fog = bc.createLinearGradient(0, horizon - 80, 0, horizon + 70);
  fog.addColorStop(0, toA(haze, 0)); fog.addColorStop(0.5, toA(haze, 0.7)); fog.addColorStop(1, toA(haze, 0));
  bc.fillStyle = fog; bc.fillRect(-OX, horizon - 80, W2, 150);
  // đường / quảng trường / mặt nước dưới chân công trình
  if (setting === 'metro' || setting === 'oldtown') {
    const rd = setting === 'metro' ? '#8f8f88' : '#b9ad92';
    gb.P([cx - 26, yb + 6, cx + 26, yb + 6, cx + 330, H2, cx - 330, H2], rd); gb.P([cx, yb + 6, cx + 26, yb + 6, cx + 330, H2, cx, H2], shade(rd, -0.08));
    for (let i = 0; i < 7; i++) { const t0 = i / 7, t1 = t0 + 0.07, yy0 = yb + 20 + (H2 - yb) * t0 * t0, yy1 = yb + 20 + (H2 - yb) * t1 * t1; gb.P([cx - 2 - t0 * 14, yy0, cx + 2 + t0 * 14, yy0, cx + 2 + t1 * 14, yy1, cx - 2 - t1 * 14, yy1], '#ece6d2'); }
    gb.P([-OX, yb - 4, w + OX, yb - 4, w + OX, yb + 12, -OX, yb + 12], shade(rd, 0.04));
    if (!water) gb.disc(cx, yb + 6, LH * 0.62, 30, 12, setting === 'metro' ? '#bdb9aa' : '#d2c7a8', 0.2);
  } else if (setting !== 'coast') { const pth = mix(ground, '#d9c7a0', 0.55); gb.P([cx - 14, yb + 6, cx + 14, yb + 6, cx + 150, H2, cx - 110, H2], pth); }
  if (water && type !== 'onepillar' && type !== 'island') gb.disc(cx, yb + 8, LH * 1.15, 44, 14, '#7fa9ae', 0.2);
  else if (type !== 'onepillar') softShadow(bc, cx + LH * 0.12, yb + 8, LH * 0.6, 26, 0.3);

  // vật thể theo bối cảnh
  const sh = (g, x, y, r) => softShadow(g.c, x + r * 0.35, y + 2, r, r * 0.22, 0.26);
  const tower = (g, x, y, bw, bh, hz, lights) => {
    const col = mix(pick(GLASS), haze, hz), d = bw * 0.3, m = x + bw * 0.58;
    sh(g, x + bw * 0.6, y, bw);
    g.P([x + bw, y, x + bw + d, y - d * 0.4, x + bw + d, y - bh - d * 0.4, x + bw, y - bh], shade(col, -0.3));
    g.box(x, y - bh, bw, bh, col);
    g.P([x, y - bh, x + bw, y - bh, x + bw + d, y - bh - d * 0.4, x + d, y - bh - d * 0.4], shade(col, 0.24));
    const fl = Math.max(3, Math.floor(bh / 15));
    for (let i = 1; i < fl; i++) { const yy = y - bh + (i * bh) / fl; g.c.fillStyle = shade(col, -0.2); g.c.fillRect(x + 3, yy, m - x - 5, 5); g.c.fillStyle = shade(col, -0.4); g.c.fillRect(m + 2, yy, x + bw - m - 5, 5); if (rng() < 0.45) lights.push([x + 3 + rng() * (bw * 0.3), yy, bw * 0.22, 5]); }
    const top = rng();
    if (top < 0.3) g.box(x + bw * 0.25, y - bh - bw * 0.35, bw * 0.5, bw * 0.35, shade(col, 0.05));
    else if (top < 0.5) g.spire(x + bw * 0.5, y - bh, bw * 0.4, bw * 0.9, shade(col, -0.05));
    if (top > 0.72) g.box(x + bw * 0.48, y - bh - 26, 3, 26, '#7f8c94');
  };
  const house = (g, x, y, bw, bh, hz, lights, wall, roofC, pitched = city.pitched) => { sh(g, x + bw * 0.6, y, bw * 0.9); building(g, x, y, bw, bh, mix(wall || pick(city.walls), haze, hz), mix(roofC || pick(city.roofs), haze, hz), pitched, rng, lights); };
  const hut = (g, x, y, s, hz) => { sh(g, x, y, s * 0.5); g.lathe(x, y, [[s * 0.36, 0], [s * 0.34, s * 0.34]], mix('#c69a62', haze, hz)); g.spire(x, y - s * 0.34, s * 0.5, s * 0.46, mix('#8a6a3a', haze, hz)); g.arch(x - s * 0.07, y, s * 0.14, s * 0.2, '#4a3420'); };
  const yurt = (g, x, y, s) => { sh(g, x, y, s * 0.5); g.lathe(x, y, [[s * 0.42, 0], [s * 0.42, s * 0.26]], '#f0ece2'); g.lathe(x, y - s * 0.26, [[s * 0.44, 0], [s * 0.1, s * 0.24], [0, s * 0.27]], '#dfd8c8'); g.box(x - s * 0.06, y - s * 0.2, s * 0.12, s * 0.2, '#b5593c'); };
  const hay = (g, x, y, s) => { sh(g, x, y, s * 0.3); g.lathe(x, y, [[s * 0.24, 0], [s * 0.26, s * 0.16], [s * 0.16, s * 0.34], [0, s * 0.42]], '#d6b45a'); };
  const dune = (g, x, y, s, hz) => { const c = mix(ground, haze, hz); g.P([x - s * 1.5, y, x + s * 0.2, y - s * 0.5, x + s * 0.45, y], shade(c, 0.12)); g.P([x + s * 0.2, y - s * 0.5, x + s * 1.4, y, x + s * 0.45, y], shade(c, -0.14)); };
  const cactus = (g, x, y, s) => { sh(g, x, y, s * 0.2); const c = '#6f8f5a'; g.box(x - s * 0.06, y - s, s * 0.12, s, c); g.box(x - s * 0.3, y - s * 0.62, s * 0.24, s * 0.08, c); g.box(x - s * 0.3, y - s * 0.86, s * 0.09, s * 0.3, c); g.box(x + s * 0.06, y - s * 0.44, s * 0.22, s * 0.08, c); g.box(x + s * 0.2, y - s * 0.74, s * 0.09, s * 0.36, c); };
  const rockP = (g, x, y, s, hz) => { const c = mix('#8d8478', haze, hz); g.P([x - s * 0.5, y, x - s * 0.2, y - s * 0.4, x + s * 0.05, y - s * 0.3, x, y], shade(c, 0.1)); g.P([x, y, x + s * 0.05, y - s * 0.3, x + s * 0.3, y - s * 0.34, x + s * 0.55, y], shade(c, -0.15)); };
  const tr = (g, x, y, s, kind = treeKind) => { sh(g, x, y, s * 0.3); tree(g, kind, x, y, s); };
  const stilt = (g, x, y, bw, bh, hz) => { for (const k of [0.1, 0.5, 0.9]) g.box(x + bw * k - 2, y - bh * 0.4, 4, bh * 0.4, '#6b4f3a'); house(g, x, y - bh * 0.35, bw, bh * 0.6, hz, lightsB, '#b98f62', '#7a5a3a', true); };
  /** Rải một dãy vật thể theo bối cảnh từ x0 → x1, chân ở y; s: cỡ, hz: độ mờ sương (dãy xa mờ hơn). */
  function row(g, x0, x1, y, s, hz, lights, dens = 1) {
    let x = x0;
    while (x < x1) {
      const r = rng(), jy = y + (rng() - 0.5) * 8 * s; let adv = 40 * s;
      if (rng() > dens) { x += (30 + rng() * 60) * s; continue; }
      switch (setting) {
        case 'metro': if (r < 0.82) { const bw = (44 + rng() * 40) * s; tower(g, x, jy, bw, (130 + rng() * 230) * s, hz, lights); adv = bw * 1.2; } else { tr(g, x + 16 * s, jy, 54 * s, treeKind === 'palm' ? 'palm' : 'round'); adv = 34 * s; } break;
        case 'oldtown': if (r < 0.62) { const bw = (40 + rng() * 34) * s; house(g, x, jy, bw, (52 + rng() * 70) * s, hz, lights); adv = bw * 1.32; } else if (r < 0.72) { const bw = 30 * s; house(g, x, jy, bw, 110 * s, hz, lights, null, null, false); g.spire(x + bw * 0.6, jy - 110 * s - bw * 0.16, bw * 0.6, 70 * s, mix(city.roofs[0], haze, hz)); adv = bw * 1.7; } else { tr(g, x + 18 * s, jy, (56 + rng() * 26) * s); adv = 38 * s; } break;
        case 'paddy': if (r < 0.2) { const bw = (44 + rng() * 16) * s; stilt(g, x, jy, bw, 70 * s, hz); adv = bw * 1.5; } else if (r < 0.3) { hay(g, x + 16 * s, jy, 70 * s); adv = 44 * s; } else if (r < 0.48) { tr(g, x + 16 * s, jy, (60 + rng() * 30) * s, 'round'); adv = 44 * s; } else if (r < 0.8) { tr(g, x + 16 * s, jy, (80 + rng() * 40) * s, 'palm'); adv = 50 * s; } else adv = 70 * s; break;
        case 'farm': if (r < 0.16) { const bw = (46 + rng() * 20) * s; house(g, x, jy, bw, 44 * s, hz, lights, '#efe6d2', '#8f4a36', true); adv = bw * 1.5; } else if (r < 0.26) { const bw = 60 * s; house(g, x, jy, bw, 50 * s, hz, lights, '#a5503c', '#5d4a3e', true); g.lathe(x + bw * 1.5, jy, [[12 * s, 0], [12 * s, 70 * s], [0, 84 * s]], '#cfd2cc'); adv = bw * 2; } else if (r < 0.42) { hay(g, x + 14 * s, jy, 60 * s); adv = 40 * s; } else if (r < 0.8) { tr(g, x + 16 * s, jy, (60 + rng() * 30) * s); adv = 42 * s; } else adv = 80 * s; break;
        case 'desert': if (r < 0.28) { const bw = (40 + rng() * 30) * s; house(g, x, jy, bw, (34 + rng() * 34) * s, hz, lights, null, null, false); adv = bw * 1.3; } else if (r < 0.5) { cityKey === 'americas' || cityKey === 'latin' ? cactus(g, x + 16 * s, jy, (50 + rng() * 30) * s) : tr(g, x + 16 * s, jy, (76 + rng() * 34) * s, 'palm'); adv = 46 * s; } else if (r < 0.78) { dune(g, x + 50 * s, jy, (46 + rng() * 40) * s, hz); adv = 90 * s; } else { rockP(g, x + 20 * s, jy, 50 * s, hz); adv = 70 * s; } break;
        case 'savanna': if (r < 0.2) { hut(g, x + 26 * s, jy, 74 * s, hz); adv = 60 * s; } else if (r < 0.6) { tr(g, x + 20 * s, jy, (84 + rng() * 40) * s, 'acacia'); adv = 74 * s; } else if (r < 0.72) { rockP(g, x + 20 * s, jy, 50 * s, hz); adv = 60 * s; } else adv = 80 * s; break;
        case 'jungle': if (r < 0.1) { hut(g, x + 26 * s, jy, 70 * s, hz); adv = 54 * s; } else { tr(g, x + 14 * s, jy, (76 + rng() * 60) * s, r < 0.55 ? 'palm' : 'round'); adv = 24 * s; } break;
        case 'alpine': if (r < 0.22) { const bw = (42 + rng() * 18) * s; house(g, x, jy, bw, 38 * s, hz, lights, '#8a6a4f', clim === 'snow' ? '#eef1f1' : '#5d4a3e', true); adv = bw * 1.5; } else if (r < 0.82) { tr(g, x + 14 * s, jy, (70 + rng() * 50) * s, 'pine'); adv = 30 * s; } else { rockP(g, x + 20 * s, jy, 60 * s, hz); adv = 60 * s; } break;
        case 'steppe': if (r < 0.2) { yurt(g, x + 30 * s, jy, 80 * s); adv = 80 * s; } else if (r < 0.3) { rockP(g, x + 20 * s, jy, 44 * s, hz); adv = 70 * s; } else if (r < 0.42) { tr(g, x + 14 * s, jy, 50 * s, 'round'); adv = 60 * s; } else adv = 90 * s; break;
        default: if (r < 0.2) { const bw = 44 * s; stilt(g, x, jy, bw, 64 * s, hz); adv = bw * 1.6; } else if (r < 0.75) { tr(g, x + 16 * s, jy, (80 + rng() * 50) * s, 'palm'); adv = 44 * s; } else adv = 70 * s;
      }
      x += adv + rng() * 10 * s;
    }
  }
  const gap = Math.min(LH * 0.5, 190), dense = setting === 'metro' || setting === 'oldtown' || setting === 'jungle';
  row(gb, -OX, w + OX, yb - 58, 0.6, 0.34, lightsB, dense ? 1 : 0.7);
  row(gb, -OX, cx - gap * 0.7, yb - 26, 0.82, 0.14, lightsB); row(gb, cx + gap * 0.7, w + OX, yb - 26, 0.82, 0.14, lightsB);
  row(gb, -OX, cx - gap, yb + 4, 1, 0, lightsB); row(gb, cx + gap, w + OX, yb + 4, 1, 0, lightsB);
  tintLayer(bc);
  if (tod !== 'day') for (const [lx, ly, lw, lh] of lightsB) { bc.fillStyle = '#ffd98a'; bc.fillRect(lx, ly, lw, lh); }

  // --- lớp công trình biểu tượng
  const [lm, lmc, gl] = layer();
  const meta = LM[type](gl, cx, yb, LH, PAL[info.iso2] || {}, rng) || {};
  tintLayer(lmc);
  if (tod === 'night') { lmc.save(); lmc.globalCompositeOperation = 'source-atop'; const lg = lmc.createLinearGradient(0, yb, 0, yb - LH); lg.addColorStop(0, 'rgba(255,205,125,.36)'); lg.addColorStop(1, 'rgba(255,205,125,0)'); lmc.fillStyle = lg; lmc.fillRect(-OX, 0, W2, H2); lmc.restore(); }

  // --- lớp gần: vài vật thể to ở hai mép, trước công trình
  const [front, fc, gf] = layer();
  const fgap = Math.max(300, LH * 0.9);
  row(gf, -OX, cx - fgap, yb + 78, 1.4, 0, lightsF, 0.75); row(gf, cx + fgap, w + OX, yb + 78, 1.4, 0, lightsF, 0.75);
  row(gf, -OX, cx - fgap - 120, yb + 190, 1.9, 0, lightsF, 0.6); row(gf, cx + fgap + 120, w + OX, yb + 190, 1.9, 0, lightsF, 0.6);
  tintLayer(fc);
  if (tod !== 'day') for (const [lx, ly, lw, lh] of lightsF) { fc.fillStyle = '#ffe2a6'; fc.fillRect(lx, ly, lw, lh); }

  // --- phần động: mây khối, chim, máy bay, pháo hoa, băng rôn
  const P2 = (c, pts, col) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = col; c.fill(); };
  const cloudCol = tod === 'sunset' ? '#f6ddc6' : tod === 'night' ? '#5d6c86' : '#f4f1e6';
  const clouds = Array.from({ length: tod === 'night' ? 3 : 5 }, (_, i) => ({ x: rng() * w, y: i < 3 ? 60 + rng() * 150 : horizon - 150 - rng() * 60, s: i < 3 ? 0.9 + rng() * 0.9 : 1.3 + rng() * 0.7, v: 5 + rng() * 9 + i * 2, a: i < 3 ? 0.95 : 0.7 }));
  const birds = tod === 'day' ? Array.from({ length: 5 }, () => ({ x: rng() * w, y: 150 + rng() * 120, v: 20 + rng() * 15, p: rng() * 6 })) : [];
  const parts = [], trail = [];
  let lastT = 0;
  const burstAt = tod === 'day' ? [2.8, 3.7, 4.9, 6.3] : [2.7, 3.3, 4, 4.8, 5.8, 7, 8.1];
  function plane(c, x, y, ang, s) {
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
    P2(c, [-34, -3, 26, -5, 38, 0, 26, 5, -34, 4], '#eef0ee');
    P2(c, [-34, 4, 26, 5, 38, 0, 26, 1, -34, 0], '#aeb7ba'); // bụng tối hơn lưng
    P2(c, [-4, -3, 6, -3, -10, -30, -18, -30], '#d9dedd');
    P2(c, [-4, 4, 6, 4, -10, 26, -18, 26], '#98a3a8');
    P2(c, [-30, -3, -22, -3, -34, -16, -40, -16], TERRA);
    P2(c, [12, -4, 22, -4, 24, -1, 12, -1], '#4d6672');
    c.restore();
  }
  const FW = ['#f0c36a', '#d9705a', '#f6efe0', '#8fbfa6', '#9cc4cf'];
  function burst(x, y) { const col = FW[Math.floor(Math.random() * FW.length)]; for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2, sp = 110 + Math.random() * 120; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.5, age: 0, col, s: 5 + Math.random() * 6, rot: Math.random() * 6 }); } }
  const out3 = (k) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
  const backOut = (k) => { if (k <= 0) return 0; if (k >= 1) return 1; const c1 = 1.4; return 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  const focusY = yb - LH * 0.42;

  return {
    type, tod, setting,
    draw(ctx, x, y, t, alpha = 1, view = {}) {
      const dt = Math.max(0, Math.min(0.1, t - lastT)); lastT = t;
      const viewH = view.viewH ?? h, grow = view.grow ?? 1;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.translate(x, y + (1 - grow) * (viewH / 2 - focusY));
      ctx.drawImage(skyCv, 0, 0);
      for (const [sx, sy, sr, ph] of stars) { ctx.globalAlpha = alpha * (0.45 + 0.55 * Math.sin(t * 3 + ph)); ctx.fillStyle = '#f4f1e2'; ctx.fillRect(sx, sy, sr, sr); }
      for (const cl of clouds) { // mây khối góc cạnh: mặt trên sáng, mặt phải khuất, đáy tối
        const px = ((cl.x + t * cl.v) % (w + 260)) - 130, k = cl.s;
        ctx.globalAlpha = alpha * cl.a;
        P2(ctx, [px - 60 * k, cl.y, px - 34 * k, cl.y - 20 * k, px - 8 * k, cl.y - 36 * k, px + 22 * k, cl.y - 26 * k, px + 22 * k, cl.y], shade(cloudCol, 0.04));
        P2(ctx, [px + 22 * k, cl.y - 26 * k, px + 46 * k, cl.y - 16 * k, px + 70 * k, cl.y, px + 22 * k, cl.y], shade(cloudCol, -0.08));
        P2(ctx, [px - 60 * k, cl.y, px + 70 * k, cl.y, px + 40 * k, cl.y + 10 * k, px - 36 * k, cl.y + 10 * k], shade(cloudCol, -0.2));
      }
      ctx.globalAlpha = alpha;
      // máy quay hạ độ cao: mặt đất lớn dần quanh điểm tụ ở chân trời (xa → gần), rồi đẩy chậm vào công trình
      const dolly = reduced ? 1 : (S0 + (1 - S0) * out3(t / 2.3)) * (1 + 0.04 * Math.min(1, Math.max(0, t - 2.3) / 7));
      ctx.save(); ctx.translate(cx, horizon); ctx.scale(dolly, dolly); ctx.translate(-cx - OX, -horizon);
      ctx.drawImage(back, 0, 0);
      ctx.translate(OX, 0);
      // công trình dựng dần từ chân lên, có vạch sáng chạy theo
      const k = reduced ? 1 : out3((t - 1.0) / 1.3);
      if (!reduced && k > 0 && t < 7.5) { // tia sáng sau công trình
        ctx.save(); ctx.globalAlpha = alpha * 0.12 * k * Math.max(0, Math.min(1, (7.5 - t) / 1.5));
        ctx.beginPath(); ctx.rect(-OX, 0, W2, yb - 20); ctx.clip(); ctx.translate(cx, yb - LH * 0.55); ctx.rotate(t * 0.2);
        for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI / 5); P2(ctx, [0, 0, -26, -LH * 1.5, 26, -LH * 1.5], '#fbf1cf'); }
        ctx.restore();
      }
      const top = yb - LH - 12, base = yb + 60, cy = base - (base - top) * k;
      if (k > 0) {
        ctx.save(); ctx.beginPath(); ctx.rect(-OX, cy, W2, H2 - cy); ctx.clip();
        if (k < 1) { const sq = 1 + 0.06 * Math.sin(k * Math.PI); ctx.translate(cx, yb); ctx.scale(2 - sq, sq); ctx.translate(-cx, -yb); }
        ctx.drawImage(lm, -OX, 0); ctx.restore();
        if (k < 1) { ctx.save(); ctx.globalAlpha = alpha * (1 - k) * 0.9; P2(ctx, [cx - LH * 0.6, cy, cx, cy - 5, cx + LH * 0.6, cy, cx, cy + 3], '#fff6d8'); ctx.restore(); }
      }
      if (meta.hub && k >= 1) { // cánh quạt cối xay gió
        const [hx, hy] = meta.hub; ctx.save(); ctx.translate(hx, hy); ctx.rotate(t * 0.8);
        for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); P2(ctx, [-3, 0, 3, 0, 3, -meta.r, -3, -meta.r], '#5b4636'); P2(ctx, [3, -meta.r * 0.2, 3 + meta.r * 0.16, -meta.r * 0.22, 3 + meta.r * 0.16, -meta.r, 3, -meta.r], tod === 'night' ? '#b8b2a6' : '#efe8da'); }
        ctx.restore();
      }
      if (meta.beam && tod !== 'day' && k >= 1) { const [bx, by] = meta.beam; ctx.save(); ctx.globalAlpha = alpha * 0.26; const a = Math.sin(t * 0.9) * 0.5; P2(ctx, [bx, by, bx + Math.cos(a) * w, by + Math.sin(a) * 60 - 40, bx + Math.cos(a) * w, by + Math.sin(a) * 60 + 40], '#fff3b0'); ctx.restore(); }
      ctx.drawImage(front, -OX, 0);
      ctx.restore();
      for (const b of birds) { const bx = (b.x + t * b.v) % (w + 40) - 20, f = Math.sin(t * 8 + b.p) * 4; ctx.strokeStyle = 'rgba(52,48,44,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - 7, b.y - f); ctx.lineTo(bx, b.y); ctx.lineTo(bx + 7, b.y - f); ctx.stroke(); }
      // máy bay bay ngang, kéo vệt khói khối đa giác
      const pt = (t - 0.9) / 3.6;
      if (pt > 0 && pt < 1.2 && !reduced) {
        const px = -90 + (w + 180) * pt, py = h * 0.2 - Math.sin(pt * Math.PI) * h * 0.06;
        if (!trail.length || px - trail[trail.length - 1][0] > 26) { trail.push([px - 44, py + 2, 0, Math.random() * 6]); if (trail.length > 16) trail.shift(); }
        for (const p of trail) { p[2] += dt; const a = Math.max(0, 0.6 - p[2] * 0.42), r = 7 + p[2] * 9; if (a <= 0) continue; ctx.save(); ctx.globalAlpha = alpha * a; ctx.translate(p[0], p[1]); ctx.rotate(p[3]); P2(ctx, [-r, 0, -r * 0.4, -r * 0.8, r * 0.6, -r * 0.6, r, 0.1 * r, r * 0.3, r * 0.7, -r * 0.6, r * 0.6], '#f4f1e6'); P2(ctx, [-r, 0, r, 0.1 * r, r * 0.3, r * 0.7, -r * 0.6, r * 0.6], '#d2d2c6'); ctx.restore(); }
        plane(ctx, px, py, -Math.cos(pt * Math.PI) * 0.16, 1.5);
      }
      // pháo hoa: chùm tam giác
      if (!reduced) { while (burstAt.length && t >= burstAt[0]) { burstAt.shift(); burst(cx + (Math.random() - 0.5) * w * 0.7, h * (0.08 + Math.random() * 0.2)); } }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age += dt; if (p.age > p.life) { parts.splice(i, 1); continue; }
        p.vy += 90 * dt; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 4;
        ctx.save(); ctx.globalAlpha = alpha * (1 - p.age / p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        P2(ctx, [0, -p.s, p.s * 0.8, p.s * 0.6, 0, p.s * 0.2], p.col); P2(ctx, [0, -p.s, 0, p.s * 0.2, -p.s * 0.8, p.s * 0.6], shade(p.col, -0.22));
        ctx.restore();
      }
      // màn mây loé lên lúc xuyên từ bản đồ vào cảnh
      if (!reduced && t < 0.8) { ctx.globalAlpha = alpha * (1 - t / 0.8) * 0.8; ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h); }
      ctx.restore();
      // băng rôn tên thủ đô góc trên trái: dải ruy băng gấp nếp, mặt trên sáng, mép dưới và hai đuôi sẫm
      const bk = reduced ? 1 : backOut((t - 1.9) / 0.5);
      if (bk > 0 && grow > 0.6) {
        const name = String(info.capital || '').toUpperCase();
        const sub = [LANDMARK_NAME[info.iso2], info.country].filter(Boolean).join(' · ');
        ctx.font = `900 40px ${font}`; const w1 = ctx.measureText(`📍 ${name}`).width;
        ctx.font = `700 22px ${font}`; const w2 = ctx.measureText(sub).width;
        const bw = Math.min(w * 0.6, Math.max(w1, w2) + 64);
        ctx.save(); ctx.globalAlpha = alpha * Math.min(1, bk); ctx.translate(x + 50 + bw / 2 - (1 - bk) * 70, y + 70);
        softShadow(ctx, 8, 52, bw * 0.56, 12, 0.3);
        P2(ctx, [-bw / 2 - 26, -30, -bw / 2, -30, -bw / 2, 44, -bw / 2 - 26, 44, -bw / 2 - 12, 7], '#8a4530');
        P2(ctx, [bw / 2 + 26, -30, bw / 2, -30, bw / 2, 44, bw / 2 + 26, 44, bw / 2 + 12, 7], '#7c3d2a');
        P2(ctx, [-bw / 2, -40, bw / 2, -40, bw / 2, 36, -bw / 2, 36], '#b5593c');
        P2(ctx, [-bw / 2, -40, bw / 2, -40, bw / 2 - 40, -4, -bw / 2, 4], '#c26a4b');
        P2(ctx, [-bw / 2, 36, bw / 2, 36, bw / 2, 26, -bw / 2, 26], '#96472f');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fbf3e2';
        ctx.font = `900 40px ${font}`; ctx.fillText(`📍 ${name}`, 0, -10, bw - 28);
        ctx.font = `700 22px ${font}`; ctx.fillStyle = 'rgba(251,243,226,.9)'; ctx.fillText(sub, 0, 20, bw - 28);
        ctx.restore();
      }
    },
  };
}

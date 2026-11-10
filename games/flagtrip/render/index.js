// Renderer canvas của game Đoán cờ vòng quanh thế giới (khung dọc 1080×1920, chừa ~260px trên cho giao diện TikTok).
// Motif hàng không: bản đồ đêm + đường bay, dải chặng có điểm mốc, "thẻ lên máy bay" giấy kem cho lá cờ, tem hộ chiếu khi tới nơi.
// Không đụng DOM khi import; ảnh cờ / bản đồ nạp theo đường dẫn tương đối với file này.
const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
const C = {
  sea0: '#071a26', sea1: '#0c2a3b', grid: 'rgba(160,210,220,.06)', land: '#1d4b5c', landEdge: '#0a2230', lit: '#f2b83b', litEdge: '#a8761a',
  paper: '#f5eedf', paperEdge: '#e2d6bd', ink: '#1c1a17', inkSoft: '#6b6355', stamp: '#c8402a', teal: '#17a398', tealDark: '#0e6f68',
  text: '#eef6f7', dim: 'rgba(214,234,238,.72)', faint: 'rgba(214,234,238,.4)', gold: '#f2b83b', red: '#e5533d', sky: '#7dd3e8',
};
const REGION_BOX = { // khung gần đúng (kinh độ, vĩ độ) để chỉ châu lục trên bản đồ
  'chau-a': [25, -11, 150, 55], 'chau-au': [-25, 35, 45, 71], 'chau-phi': [-18, -35, 52, 37],
  'bac-my': [-168, 7, -52, 72], 'nam-my': [-82, -56, -34, 13], 'chau-dai-duong': [110, -48, 180, 0],
};
const ACTION_TEXT = { zoom: 'thu nhỏ cờ', letter: 'lộ 1 chữ cái', time: '+10 giây', region: 'chỉ châu lục', skip: 'đổi cờ khác', shield: 'khiên / cứu máy bay', tailwind: 'tiến 1 chặng', storm: 'lùi 1 chặng', jet: 'tiến 5 chặng' };
const LAT_TOP = 83, LAT_BOT = -58;

/** TopoJSON (world-atlas) → [{ id, polys: [[ring[[lon,lat]…]]…] }]. */
export function decodeTopo(topo) {
  const tf = topo?.transform;
  const obj = topo?.objects?.countries;
  if (!tf || !obj) return [];
  const [sx, sy] = tf.scale, [tx, ty] = tf.translate;
  const arcs = topo.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
  const ring = (idxs) => { const pts = []; for (const i of idxs) { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; pts.push(...(pts.length ? a.slice(1) : a)); } return pts; };
  return obj.geometries.map((g) => ({ id: String(g.id ?? ''), polys: g.type === 'Polygon' ? [g.arcs.map(ring)] : g.type === 'MultiPolygon' ? g.arcs.map((p) => p.map(ring)) : [] }));
}

export function mount(el, { canvas, options = {} } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAP = { x: 40, y: 384, w: W - 80, h: Math.round((W - 80) * (LAT_TOP - LAT_BOT) / 360) };
  let S = null, prev = null, recvAt = 0, raf = 0, stopped = false, last = performance.now();
  const anim = { phaseAt: 0, flyAt: 0, correctAt: 0, wrongAt: 0, banner: null, shake: 0 };
  const floaters = [], confetti = [];
  const sound = makeSound(!!options.mute);
  let world = null, baseMap = null, litKey = '';
  const litLayer = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(MAP.w, MAP.h) : Object.assign(document.createElement('canvas'), { width: MAP.w, height: MAP.h });

  fetch(new URL('../data/world-110m.json', import.meta.url)).then((r) => r.json()).then((t) => { world = decodeTopo(t); baseMap = drawBase(); litKey = ''; }).catch(() => {});

  // ---------------- tiện ích ----------------
  function rr(x, y, w, h, r, c = ctx) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function text(s, x, y, size, color = C.text, weight = 800, align = 'center', maxW = 0) {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    let t = String(s ?? '');
    if (maxW && ctx.measureText(t).width > maxW) { while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; }
    ctx.fillText(t, x, y);
    return ctx.measureText(t).width;
  }
  const measure = (s, size, weight = 800) => { ctx.font = `${weight} ${size}px ${FONT}`; return ctx.measureText(String(s)).width; };
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3));
  const back = (k) => { if (k <= 0) return 0; if (k >= 1) return 1; const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(n || 0);
  const proj = (lon, lat) => [((lon + 180) / 360) * MAP.w, ((LAT_TOP - lat) / (LAT_TOP - LAT_BOT)) * MAP.h];
  const remaining = (now) => (S.paused ? S.remainingMs : Math.max(0, S.remainingMs - (now - recvAt)));

  const images = new Map();
  function img(src) {
    let a = images.get(src);
    if (!a) { a = { img: new Image(), ok: false }; a.img.referrerPolicy = 'no-referrer'; a.img.onload = () => { a.ok = true; }; a.img.src = src; images.set(src, a); if (images.size > 80) images.delete(images.keys().next().value); }
    return a.ok ? a.img : null;
  }
  const flagImg = (iso) => img(new URL(`../assets/flags/${iso}.svg`, import.meta.url).href);
  function avatar(user, x, y, r, ring = 'rgba(255,255,255,.85)') {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    const im = user?.avatar ? img(user.avatar) : null;
    if (im) { ctx.save(); ctx.clip(); ctx.drawImage(im, x - r, y - r, r * 2, r * 2); ctx.restore(); }
    else { const n = user?.name || '?'; let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; ctx.fillStyle = `hsl(${h},45%,40%)`; ctx.fill(); text([...n][0]?.toUpperCase() || '?', x, y + 1, Math.round(r * 1.05), '#fff', 800); }
    ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = ring; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  // ---------------- bản đồ ----------------
  function pathCountry(c, polys) {
    for (const poly of polys) for (const ring of poly) {
      let px = null;
      ring.forEach(([lon, lat], i) => {
        const [x, y] = proj(lon, lat);
        if (i === 0 || Math.abs(x - px) > MAP.w / 2) c.moveTo(x, y); else c.lineTo(x, y); // không kéo vệt qua kinh tuyến 180
        px = x;
      });
    }
  }
  function drawBase() {
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(MAP.w, MAP.h) : Object.assign(document.createElement('canvas'), { width: MAP.w, height: MAP.h });
    const c = cv.getContext('2d');
    c.strokeStyle = C.grid; c.lineWidth = 1;
    for (let lon = -150; lon <= 180; lon += 30) { const [x] = proj(lon, 0); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, MAP.h); c.stroke(); }
    for (let lat = -30; lat <= 60; lat += 30) { const [, y] = proj(0, lat); c.beginPath(); c.moveTo(0, y); c.lineTo(MAP.w, y); c.stroke(); }
    c.fillStyle = C.land; c.strokeStyle = C.landEdge; c.lineWidth = 1.2;
    for (const g of world) { c.beginPath(); pathCountry(c, g.polys); c.fill('evenodd'); c.stroke(); }
    return cv;
  }
  function drawLit() {
    const key = (S.visited || []).join(',');
    if (key === litKey || !world) return;
    litKey = key;
    const c = litLayer.getContext('2d');
    c.clearRect(0, 0, MAP.w, MAP.h);
    const on = new Set(S.visited || []);
    c.fillStyle = C.lit; c.strokeStyle = C.litEdge; c.lineWidth = 1.2;
    for (const g of world) if (on.has(g.id)) { c.beginPath(); pathCountry(c, g.polys); c.fill('evenodd'); c.stroke(); }
  }
  function drawMap(now) {
    const { x, y, w, h } = MAP;
    ctx.save();
    rr(x - 2, y - 2, w + 4, h + 4, 26); ctx.fillStyle = 'rgba(4,14,22,.6)'; ctx.fill();
    rr(x, y, w, h, 24); ctx.clip();
    const sea = ctx.createLinearGradient(0, y, 0, y + h); sea.addColorStop(0, '#0d3245'); sea.addColorStop(1, '#09202e');
    ctx.fillStyle = sea; ctx.fillRect(x, y, w, h);
    if (baseMap) ctx.drawImage(baseMap, x, y);
    else text('Đang tải bản đồ…', x + w / 2, y + h / 2, 26, C.faint, 700);
    drawLit();
    ctx.drawImage(litLayer, x, y);
    // chỉ châu lục (quà) — khung nhấp nháy
    if (S.region && S.phase !== 'reveal' && S.phase !== 'landed') {
      const b = REGION_BOX[S.region];
      if (b) {
        const [x0, y0] = proj(b[0], b[3]), [x1, y1] = proj(b[2], b[1]);
        const pulse = 0.5 + 0.5 * Math.sin(now / 300);
        ctx.fillStyle = `rgba(125,211,232,${0.1 + pulse * 0.1})`; ctx.strokeStyle = C.sky; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
        rr(x + x0, y + y0, x1 - x0, y1 - y0, 18); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        text(`🧭 ${S.regionName}`, x + (x0 + x1) / 2, y + y0 + 26, 28, C.sky, 900);
      }
    }
    // đường bay của chuyến (nối các thủ đô đã tới)
    const t = S.trip;
    const flyK = S.phase === 'reveal' && S.answer?.solved && t.from ? (reduced ? 1 : ease((now - anim.flyAt) / 1800)) : S.phase === 'landed' && t.from ? ease((now - anim.flyAt) / 2400) : 1;
    let px, py;
    if (t.from && flyK < 1) {
      const [ax, ay] = proj(t.from.lon, t.from.lat), [bx, by] = proj(t.at.lon, t.at.lat);
      const cx = (ax + bx) / 2, cy = Math.min(ay, by) - Math.max(40, Math.abs(bx - ax) * 0.18);
      ctx.strokeStyle = 'rgba(242,184,59,.85)'; ctx.lineWidth = 3; ctx.setLineDash([2, 10]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + ax, y + ay); ctx.quadraticCurveTo(x + cx, y + cy, x + bx, y + by); ctx.stroke(); ctx.setLineDash([]);
      const q = (k) => [(1 - k) ** 2 * ax + 2 * (1 - k) * k * cx + k * k * bx, (1 - k) ** 2 * ay + 2 * (1 - k) * k * cy + k * k * by];
      [px, py] = q(flyK);
      const [nx, ny] = q(Math.min(1, flyK + 0.02));
      drawPlane(x + px, y + py, Math.atan2(ny - py, nx - px));
    } else {
      [px, py] = proj(t.at.lon, t.at.lat);
      const pulse = 0.5 + 0.5 * Math.sin(now / 400);
      ctx.beginPath(); ctx.arc(x + px, y + py, 14 + pulse * 10, 0, Math.PI * 2); ctx.fillStyle = `rgba(242,184,59,${0.25 - pulse * 0.15})`; ctx.fill();
      drawPlane(x + px, y + py, -Math.PI / 4);
    }
    ctx.restore();
    // nhãn vị trí
    const label = S.phase === 'landed' ? '🏠 Về nhà: Hà Nội' : `📍 ${t.at.name}`;
    const lw = measure(label, 24, 800) + 36;
    rr(x + 18, y + h - 58, lw, 42, 21); ctx.fillStyle = 'rgba(4,14,22,.82)'; ctx.fill();
    text(label, x + 18 + lw / 2, y + h - 37, 24, C.text, 800);
    const vc = `🗺️ ${fmtN(S.visitedCount)} nước đã ghé`;
    const vw = measure(vc, 22, 700) + 32;
    rr(x + w - 18 - vw, y + h - 56, vw, 38, 19); ctx.fillStyle = 'rgba(4,14,22,.82)'; ctx.fill();
    text(vc, x + w - 18 - vw / 2, y + h - 37, 22, C.gold, 700);
    return y + h;
  }
  function drawPlane(x, y, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 4);
    ctx.font = `44px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 10;
    ctx.fillText('✈️', 0, 0);
    ctx.restore();
  }

  // ---------------- phóng to lá cờ ----------------
  const ANCHOR = { tl: [0, 0], tr: [1, 0], bl: [0, 1], br: [1, 1], c: [0.5, 0.5] };
  /** Độ phóng hiện tại: nội suy mượt giữa các snapshot; hết pha hỏi thì thu về ×1 trong 0,6 giây. */
  function zoomScale(now) {
    const z = S.zoom;
    if (!z || z.scale0 <= 1) return 1;
    const k = z.running ? Math.min(1, z.k + (now - recvAt) / z.dur) : z.k;
    const target = Math.pow(z.scale0, 1 - k); // giảm đều theo thang log: cảm giác thu nhỏ đều tay
    if (S.phase === 'ask') { anim.zoomShown = target; return target; }
    const from = anim.zoomShown || 1;
    const t = reduced ? 1 : ease((now - anim.phaseAt) / 600);
    return from + (1 - from) * t;
  }

  // ---------------- header + dải chặng ----------------
  function drawHeader() {
    const t = S.trip, y = 268;
    text(`CHUYẾN BAY #${t.no}`, 48, y + 22, 24, C.gold, 900, 'left');
    text('Đoán cờ vòng quanh thế giới', 48, y + 62, 40, C.text, 900, 'left');
    text(`${t.pos}`, W - 150, y + 44, 72, C.text, 900, 'right');
    text(`/${t.length}`, W - 48, y + 54, 34, C.dim, 800, 'right');
    text('CHẶNG', W - 150, y + 6, 18, C.dim, 800, 'right');
  }
  function drawLegs(y) {
    const t = S.trip, n = t.length, x0 = 60, x1 = W - 60;
    const step = (x1 - x0) / n;
    ctx.strokeStyle = 'rgba(214,234,238,.18)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + step * t.pos, y); ctx.stroke();
    for (let i = 1; i <= n; i++) {
      const cx = x0 + step * i, cp = i % t.every === 0, done = i <= t.pos;
      if (cp) {
        ctx.save(); ctx.translate(cx, y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = done ? C.gold : C.sea1; ctx.strokeStyle = done ? C.gold : 'rgba(214,234,238,.5)'; ctx.lineWidth = 3;
        ctx.fillRect(-11, -11, 22, 22); ctx.strokeRect(-11, -11, 22, 22); ctx.restore();
      } else if (n <= 40) {
        ctx.beginPath(); ctx.arc(cx, y, done ? 7 : 5, 0, Math.PI * 2); ctx.fillStyle = done ? C.gold : 'rgba(214,234,238,.35)'; ctx.fill();
      }
    }
    text('🏠', x1 + 2, y - 2, 28);
    // máy bay trên dải
    const px = x0 + step * t.pos;
    ctx.save(); ctx.translate(px, y - 2); ctx.font = `38px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✈️', 0, 0); ctx.restore();
    const nextCp = Math.min(n, (Math.floor(t.pos / t.every) + 1) * t.every);
    text(`🛟 Điểm mốc an toàn: chặng ${t.checkpoint}${nextCp > t.pos ? ` · mốc tiếp: ${nextCp}` : ''}`, x0, y + 40, 22, C.dim, 700, 'left');
    if (t.shields) text(`🛡️ ×${t.shields}`, x1, y + 40, 24, C.sky, 900, 'right');
    return y + 64;
  }

  // ---------------- thẻ lên máy bay (lá cờ) ----------------
  function drawPass(y0, now) {
    const x = 40, w = W - 80, h = 470;
    const shake = anim.shake > 0 ? Math.sin(now / 30) * 10 * anim.shake : 0;
    ctx.save(); ctx.translate(shake, 0);
    // giấy + lỗ bấm vé
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    rr(x, y0, w, h, 28); ctx.fillStyle = C.paper; ctx.fill();
    ctx.shadowColor = 'transparent';
    const cut = x + 560;
    ctx.fillStyle = C.sea0;
    ctx.beginPath(); ctx.arc(cut, y0, 22, 0, Math.PI * 2); ctx.arc(cut, y0 + h, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.paperEdge; ctx.lineWidth = 3; ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(cut, y0 + 30); ctx.lineTo(cut, y0 + h - 30); ctx.stroke(); ctx.setLineDash([]);
    // nhãn trên
    const open = S.phase === 'reveal' || S.phase === 'landed';
    text(open ? 'THẺ DU LỊCH' : 'THẺ LÊN MÁY BAY', x + 36, y0 + 40, 20, C.inkSoft, 900, 'left');
    text(`CHẶNG ${Math.min(S.trip.length, S.trip.pos + (open && S.answer?.solved ? 0 : 1))}`, cut - 30, y0 + 40, 20, C.inkSoft, 900, 'right');
    // lá cờ 4:3
    const fw = 480, fh = 360, fx = x + 40, fy = y0 + 70;
    const k = reduced ? 1 : back((now - anim.phaseAt) / 500);
    ctx.save();
    if (S.phase === 'ask' && now - anim.phaseAt < 600) { ctx.translate(fx + fw / 2, fy + fh / 2); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); ctx.translate(-(fx + fw / 2), -(fy + fh / 2)); }
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
    rr(fx, fy, fw, fh, 14); ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent';
    const im = flagImg(S.flag);
    const zs = zoomScale(now);
    if (im) {
      // phóng to bám vào 1 góc / chính giữa: phần cờ lộ ra luôn chứa điểm neo đó
      const [ax, ay] = ANCHOR[S.zoom?.focus] || ANCHOR.c;
      const dw = fw * zs, dh = fh * zs;
      ctx.save(); rr(fx, fy, fw, fh, 14); ctx.clip();
      ctx.drawImage(im, fx - ax * (dw - fw), fy - ay * (dh - fh), dw, dh);
      ctx.restore();
    } else text('🏳️', fx + fw / 2, fy + fh / 2, 120);
    if (zs > 1.05) {
      const label = `🔍 ×${zs.toFixed(1).replace('.', ',')}`;
      const lw = measure(label, 22, 900) + 28;
      rr(fx + 12, fy + fh - 50, lw, 38, 19); ctx.fillStyle = 'rgba(28,26,23,.82)'; ctx.fill();
      text(label, fx + 12 + lw / 2, fy + fh - 30, 22, C.paper, 900);
    }
    rr(fx, fy, fw, fh, 14); ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    // cột phải
    const rx = cut + 36, rw = x + w - 36 - rx;
    if (open) drawTravelCard(rx, y0, rw, h);
    else drawQuestion(rx, y0, rw, h, now);
    // thanh thời gian dưới đáy thẻ
    const rem = remaining(now), frac = Math.max(0, Math.min(1, rem / S.phaseMs));
    const urgent = (S.phase === 'ask' && rem < 6000) || S.phase === 'lastcall' || S.phase === 'rescue';
    rr(x + 40, y0 + h - 30, w - 80, 12, 6); ctx.fillStyle = 'rgba(28,26,23,.1)'; ctx.fill();
    rr(x + 40, y0 + h - 30, Math.max(12, (w - 80) * frac), 12, 6); ctx.fillStyle = urgent ? C.stamp : C.teal; ctx.fill();
    ctx.restore();
    return y0 + h;
  }
  function drawQuestion(rx, y0, rw, h, now) {
    const rem = remaining(now);
    const last = S.phase === 'lastcall';
    text(last ? 'CHỐT SỔ!' : 'Cờ nước nào?', rx, y0 + 96, last ? 46 : 40, last ? C.stamp : C.ink, 900, 'left');
    text(`${Math.ceil(rem / 1000)}`, rx + rw, y0 + 96, 64, last || rem < 6000 ? C.stamp : C.ink, 900, 'right');
    text(S.silent ? 'Phòng im quá… gõ thử một nước đi!' : 'Gõ tên nước vào bình luận', rx, y0 + 146, 22, C.inkSoft, 700, 'left', rw);
    // ô chữ tên nước
    const words = []; let cur = [];
    for (const ch of S.mask) { if (ch === ' ') { if (cur.length) words.push(cur); cur = []; } else cur.push(ch); }
    if (cur.length) words.push(cur);
    const total = S.mask.length;
    const size = Math.max(22, Math.min(46, Math.floor((rw * 2) / Math.max(8, total + 2))));
    let lx = rx, ly = y0 + 196;
    for (const wd of words) {
      const ww = wd.length * (size + 6);
      if (lx + ww > rx + rw && lx > rx) { lx = rx; ly += size + 22; }
      for (const ch of wd) {
        rr(lx, ly, size, size + 8, 7); ctx.fillStyle = ch ? C.ink : 'rgba(28,26,23,.08)'; ctx.fill();
        if (ch) text(ch.toUpperCase(), lx + size / 2, ly + (size + 8) / 2 + 1, Math.round(size * 0.66), C.paper, 900);
        else { ctx.fillStyle = 'rgba(28,26,23,.25)'; ctx.fillRect(lx + size * 0.25, ly + size + 1, size * 0.5, 3); }
        lx += size + 6;
      }
      lx += size * 0.6;
    }
    // người đã đúng (khuôn mặt) / châu lục
    const by = y0 + h - 82;
    if (S.solvers.length) {
      S.solvers.slice(0, 5).forEach((u, i) => avatar(u, rx + 24 + i * 40, by, 22, C.teal));
      text(`${S.solvedCount} người đã đúng`, rx + 24 + Math.min(5, S.solvers.length) * 40 + 4, by, 22, C.tealDark, 800, 'left');
    } else if (S.regionName) text(`🧭 ${S.regionName}`, rx, by, 26, C.tealDark, 900, 'left');
  }
  function drawTravelCard(rx, y0, rw, h) {
    const a = S.answer;
    text(a.name, rx, y0 + 98, a.name.length > 14 ? 38 : 50, C.ink, 900, 'left', rw);
    text(`🏛️ Thủ đô: ${a.capital}`, rx, y0 + 150, 25, C.ink, 800, 'left', rw);
    text(`📍 ${a.sights.join(' · ')}`, rx, y0 + 194, 22, C.inkSoft, 700, 'left', rw);
    text(`🍜 ${a.food.join(', ')}`, rx, y0 + 232, 22, C.inkSoft, 700, 'left', rw);
    // điều thú vị: xuống dòng tối đa 3 dòng
    ctx.font = `600 21px ${FONT}`;
    const words = String(a.fact || '').split(' ');
    let line = '', ly = y0 + 280, n = 0;
    for (const wd of words) {
      const test = line ? `${line} ${wd}` : `💡 ${wd}`;
      if (ctx.measureText(test).width > rw && line) { text(line, rx, ly, 21, C.ink, 600, 'left'); ly += 30; line = wd; if (++n >= 3) break; } else line = test;
    }
    if (line && n < 3) text(line, rx, ly, 21, C.ink, 600, 'left');
    // tem hộ chiếu
    const sx = rx + rw - 90, sy = y0 + h - 100;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.22);
    const col = a.solved ? C.stamp : '#8a8172';
    ctx.globalAlpha = 0.85; ctx.strokeStyle = col; ctx.lineWidth = 5;
    rr(-92, -40, 184, 80, 12); ctx.stroke(); ctx.lineWidth = 2; rr(-84, -32, 168, 64, 8); ctx.stroke();
    text(a.solved ? 'ĐÃ ĐẾN' : 'TRƯỢT', 0, -8, 30, col, 900);
    text(a.solved ? `${S.solvedCount} người đúng` : 'không ai đúng', 0, 20, 16, col, 800);
    ctx.restore();
  }

  // ---------------- hàng dưới ----------------
  function drawBottom(y) {
    const h = Math.min(330, H - 250 - y);
    if (h < 120) return;
    // phi hành đoàn
    const bw = 600;
    rr(40, y, bw, h, 26); ctx.fillStyle = 'rgba(4,14,22,.72)'; ctx.fill(); ctx.strokeStyle = 'rgba(242,184,59,.35)'; ctx.lineWidth = 2; ctx.stroke();
    text('🧑‍✈️ PHI HÀNH ĐOÀN', 68, y + 36, 24, C.gold, 900, 'left');
    const rows = (S.board || []).slice(0, 5);
    if (!rows.length) text('Đoán đúng để vào phi hành đoàn!', 40 + bw / 2, y + h / 2 + 10, 24, C.faint, 700);
    const rh = Math.min(52, (h - 66) / 5);
    rows.forEach((r, i) => {
      const yy = y + 66 + i * rh + rh / 2;
      text(String(i + 1), 72, yy, 22, i === 0 ? C.gold : C.dim, 900);
      avatar(r, 114, yy, 18);
      text(r.name, 144, yy + 1, 24, C.text, 800, 'left', bw - 300);
      text(`🏳️ ${r.flags}`, 40 + bw - 130, yy + 1, 20, C.dim, 700, 'right');
      text(fmtN(r.points), 40 + bw - 26, yy + 1, 26, C.gold, 900, 'right');
    });
    // quà → tác dụng
    const px = 660, pw = W - 40 - px;
    rr(px, y, pw, h, 26); ctx.fillStyle = 'rgba(4,14,22,.72)'; ctx.fill(); ctx.strokeStyle = 'rgba(125,211,232,.3)'; ctx.lineWidth = 2; ctx.stroke();
    text('🎁 TẶNG QUÀ ĐỂ…', px + 24, y + 36, 22, C.sky, 900, 'left');
    // mỗi quà một dòng (2 dòng nếu đủ chỗ) — không bao giờ chồng chữ
    const prow = Math.max(1, Math.floor((h - 62) / 34));
    const list = (S.powerups || []).slice(0, prow);
    const two = (h - 62) / Math.max(1, list.length) >= 52;
    const ph = two ? 52 : 34;
    list.forEach((p, i) => {
      const yy = y + 64 + i * ph + ph / 2;
      text(p.icon, px + 38, yy, two ? 26 : 22);
      if (two) {
        text(p.text, px + 64, yy - 10, 19, C.text, 800, 'left', pw - 80);
        text(`→ ${ACTION_TEXT[p.action] || p.action}`, px + 64, yy + 12, 16, C.dim, 600, 'left', pw - 80);
      } else text(`${p.text} → ${ACTION_TEXT[p.action] || p.action}`, px + 62, yy + 1, 17, C.text, 700, 'left', pw - 76);
    });
  }

  // ---------------- lớp phủ: cứu máy bay / hạ cánh ----------------
  function drawRescue(now) {
    const rem = remaining(now);
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    ctx.fillStyle = `rgba(200,64,42,${0.12 + pulse * 0.1})`; ctx.fillRect(0, MAP.y, W, MAP.h);
    const y = MAP.y + MAP.h / 2 - 90;
    rr(80, y, W - 160, 180, 30); ctx.fillStyle = 'rgba(28,10,8,.93)'; ctx.fill(); ctx.strokeStyle = C.red; ctx.lineWidth = 4; ctx.stroke();
    text('⚠️ MÁY BAY GẶP NẠN!', W / 2, y + 52, 48, C.red, 900);
    const shield = (S.powerups || []).find((p) => p.action === 'shield');
    text(shield ? `Tặng ${shield.icon} ${shield.text} để cứu — còn ${Math.ceil(rem / 1000)}s` : `Còn ${Math.ceil(rem / 1000)}s trước khi rơi về điểm mốc`, W / 2, y + 108, 28, C.text, 800, 'center', W - 220);
    text(`Không ai cứu → rơi về chặng ${S.trip.checkpoint}`, W / 2, y + 148, 22, C.dim, 700);
  }
  function drawLanded(now) {
    const sm = S.summary || { stamps: 0, crew: [] };
    ctx.fillStyle = 'rgba(4,10,16,.6)'; ctx.fillRect(0, 0, W, H);
    const k = reduced ? 1 : back((now - anim.phaseAt) / 600);
    const y = 560;
    ctx.save(); ctx.translate(W / 2, y + 300); ctx.scale(k, k); ctx.translate(-W / 2, -(y + 300));
    rr(70, y, W - 140, 620, 36); ctx.fillStyle = C.paper; ctx.fill();
    text('HẠ CÁNH VỀ NHÀ', W / 2, y + 80, 64, C.ink, 900);
    text(`Chuyến bay #${sm.trip} · ${sm.stamps} con dấu hộ chiếu`, W / 2, y + 140, 28, C.inkSoft, 800);
    const slots = [[W / 2, y + 300, 64, '#c9a227'], [W / 2 - 290, y + 330, 52, '#9aa3ad'], [W / 2 + 290, y + 340, 48, '#b0703c']];
    (sm.crew || []).forEach((u, i) => {
      const [cx, cy, r, col] = slots[i];
      avatar(u, cx, cy, r, col);
      text(['🥇', '🥈', '🥉'][i], cx + r * 0.8, cy - r * 0.8, 36);
      text(u.name, cx, cy + r + 36, 26, C.ink, 900, 'center', 260);
      text(`${fmtN(u.tripPoints)} điểm`, cx, cy + r + 70, 22, C.tealDark, 800);
    });
    if (!(sm.crew || []).length) text('Chuyến bay tự động — lần sau cả phòng cùng lái nhé!', W / 2, y + 330, 26, C.inkSoft, 700);
    text('Chuyến bay mới sắp cất cánh…', W / 2, y + 570, 24, C.inkSoft, 700);
    ctx.restore();
  }
  function drawPaused() {
    ctx.fillStyle = 'rgba(4,10,16,.6)'; ctx.fillRect(0, 0, W, H);
    rr(W / 2 - 340, H / 2 - 100, 680, 200, 34); ctx.fillStyle = C.paper; ctx.fill();
    text('⏸ TẠM DỪNG', W / 2, H / 2 - 24, 60, C.ink, 900);
    text('Máy bay đang chờ ở sân bay', W / 2, H / 2 + 46, 28, C.inkSoft, 700);
  }

  // ---------------- hiệu ứng ----------------
  function burst(n = 160, y = 900) {
    if (reduced) return;
    const cols = [C.gold, C.teal, C.stamp, '#fff', C.sky];
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8, sp = 700 + Math.random() * 900; confetti.push({ x: W / 2 + (Math.random() - 0.5) * 300, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 6 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, color: cols[i % cols.length], life: 2.6 }); }
    if (confetti.length > 900) confetti.splice(0, confetti.length - 900);
  }
  function drawFx(dt) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i]; p.vy += 1400 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt;
      if (p.life <= 0 || p.y > H + 40) { confetti.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.age += dt; const k = f.age / f.life;
      if (k >= 1) { floaters.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
      ctx.lineJoin = 'round'; ctx.font = `900 ${f.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const yy = f.y - ease(k) * 100;
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(4,10,16,.85)'; ctx.strokeText(f.text, f.x, yy); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, yy);
      ctx.restore();
    }
    if (anim.banner) {
      const b = anim.banner; b.age += dt;
      if (b.age > b.life) anim.banner = null;
      else {
        const a = b.age < 0.2 ? b.age / 0.2 : 1 - Math.max(0, (b.age - b.life + 0.4) / 0.4);
        ctx.save(); ctx.globalAlpha = a;
        const bw = Math.min(W - 120, measure(b.text, 36, 900) + 80);
        rr((W - bw) / 2, MAP.y + 24, bw, 70, 35); ctx.fillStyle = 'rgba(4,14,22,.92)'; ctx.fill(); ctx.strokeStyle = b.color; ctx.lineWidth = 3; ctx.stroke();
        text(b.text, W / 2, MAP.y + 60, 36, b.color, 900, 'center', bw - 40);
        ctx.restore();
      }
    }
  }
  const okSlots = [];
  function addOk(label) {
    const live = floaters.filter((f) => f.ok);
    if (live.length >= 4) floaters.splice(floaters.indexOf(live[0]), 1);
    const used = new Set(floaters.filter((f) => f.ok).map((f) => f.slot)); let slot = 0; while (used.has(slot)) slot++;
    floaters.push({ text: label, x: W / 2, y: MAP.y + MAP.h - 40 - slot * 58, slot, ok: true, color: '#9ff0e6', size: 40, life: 1.8, age: 0 });
  }
  void okSlots;

  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    anim.shake = Math.max(0, anim.shake - dt * 2);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.sea1); g.addColorStop(1, C.sea0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!S) { text('Đang chuẩn bị chuyến bay…', W / 2, H / 2, 42, C.dim, 800); return; }
    drawHeader();
    const mapBottom = drawMap(now);
    const legsBottom = drawLegs(mapBottom + 48);
    const passBottom = drawPass(legsBottom + 24, now);
    drawBottom(passBottom + 28);
    if (S.phase === 'rescue') drawRescue(now);
    drawFx(dt);
    if (S.phase === 'landed') drawLanded(now);
    if (S.paused) drawPaused();
  }
  (document.fonts?.ready || Promise.resolve()).finally(() => { if (!stopped) raf = requestAnimationFrame(frame); });

  return {
    update(s) {
      const now = performance.now();
      if (!prev || s.phase !== prev.phase || s.flag !== prev.flag) {
        anim.phaseAt = now;
        if ((s.phase === 'reveal' && s.answer?.solved) || s.phase === 'landed') anim.flyAt = now;
      }
      if (s.flag) flagImg(s.flag); // nạp sẵn ảnh cờ
      prev = s; S = s; recvAt = now;
    },
    effect(fx) {
      const by = fx.by?.name ? `${fx.by.name}: ` : '';
      switch (fx.type) {
        case 'ft_flag': sound.play('flag'); break;
        case 'ft_correct': addOk(`${fx.rank <= 3 ? ['🥇', '🥈', '🥉'][fx.rank - 1] + ' ' : ''}${fx.by.name} +${fx.points}${fx.zoomBonus > 1.05 ? ` (🔍×${String(fx.zoomBonus).replace('.', ',')})` : ''}`); sound.play('correct', fx.rank); break;
        case 'ft_zoom': floaters.push({ text: `🔍 ${by}thu nhỏ cờ`, x: W - 300, y: 1180, color: '#fde68a', size: 34, life: 1.6, age: 0 }); sound.play('whoosh'); break;
        case 'ft_lastcall': sound.play('tick'); break;
        case 'ft_reveal': if (fx.solved) { burst(fx.solvers?.length > 2 ? 180 : 110); sound.play('stamp'); } break;
        case 'ft_silent': anim.banner = { text: '🤫 Phòng im quá — đoán thử một nước đi!', color: C.sky, age: 0, life: 3 }; break;
        case 'ft_rescue': anim.shake = 1; sound.play('alarm'); break;
        case 'ft_rescued': anim.banner = { text: `🛡️ ${by}CỨU MÁY BAY THÀNH CÔNG!`, color: C.gold, age: 0, life: 3.5 }; burst(140); sound.play('rescued'); break;
        case 'ft_fall': anim.banner = { text: `📉 Rơi về chặng ${fx.to}`, color: C.red, age: 0, life: 3 }; anim.shake = 1.2; sound.play('fall'); break;
        case 'ft_miss': if (fx.shielded) { anim.banner = { text: '🛡️ Khiên đỡ cho máy bay!', color: C.sky, age: 0, life: 3 }; sound.play('rescued'); } else if (fx.safe) anim.banner = { text: '🛟 Đang ở điểm mốc — không mất chặng', color: C.sky, age: 0, life: 3 }; break;
        case 'ft_letter': floaters.push({ text: `🔤 ${by}lộ 1 chữ`, x: W - 300, y: 1180, color: '#fde68a', size: 34, life: 1.6, age: 0 }); sound.play('pop'); break;
        case 'ft_time': floaters.push({ text: `⏱️ ${by}+${fx.seconds} giây`, x: W - 300, y: 1180, color: '#bae6fd', size: 34, life: 1.6, age: 0 }); sound.play('pop'); break;
        case 'ft_region': anim.banner = { text: `🧭 ${by}chỉ châu lục!`, color: C.sky, age: 0, life: 3 }; sound.play('pop'); break;
        case 'ft_skip': anim.banner = { text: `🔄 ${by}đổi cờ khác`, color: C.sky, age: 0, life: 2.5 }; break;
        case 'ft_shield': floaters.push({ text: `🛡️ ${by}khiên ×${fx.shields}`, x: W - 260, y: MAP.y + MAP.h + 90, color: '#bae6fd', size: 32, life: 1.6, age: 0 }); sound.play('pop'); break;
        case 'ft_move': {
          const t = { tailwind: [`🌬️ ${by}gió xuôi +1 chặng`, C.sky], storm: [`⛈️ ${by}bão! lùi 1 chặng`, C.red], jet: [`🚀 ${by}phản lực +5 chặng`, C.gold] }[fx.kind];
          if (t) anim.banner = { text: t[0], color: t[1], age: 0, life: 3 };
          if (fx.kind === 'storm') anim.shake = 1;
          sound.play(fx.kind === 'storm' ? 'fall' : 'whoosh');
          break;
        }
        case 'ft_landed': burst(260, 700); sound.play('landed'); break;
      }
    },
    resumeAudio() { sound.resume(); },
    resize() {},
    destroy() { stopped = true; cancelAnimationFrame(raf); sound.close(); },
  };
}

/** Âm thanh tổng hợp WebAudio của game (tạo lười, tắt khi mute). */
function makeSound(muted) {
  let ac = null;
  const get = () => { if (muted || typeof AudioContext === 'undefined') return null; if (!ac) { try { ac = new AudioContext(); } catch { muted = true; return null; } } return ac; };
  function tone(f, dur, { type = 'sine', vol = 0.18, at = 0, slide = 0 } = {}) {
    const a = get(); if (!a || a.state !== 'running') return;
    const t0 = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const P = {
    flag: () => { tone(523, 0.1, { type: 'triangle' }); tone(784, 0.16, { type: 'triangle', at: 0.08 }); },
    correct: (rank = 1) => { const f = 880 * Math.pow(1.06, Math.max(0, 4 - rank)); tone(f, 0.12, { type: 'triangle' }); tone(f * 1.5, 0.2, { type: 'triangle', at: 0.07 }); },
    tick: () => [0, 0.25, 0.5].forEach((at) => tone(1200, 0.05, { type: 'square', vol: 0.05, at })),
    stamp: () => { tone(90, 0.18, { vol: 0.35, slide: 0.6 }); [659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', at: 0.15 + i * 0.08 })); },
    alarm: () => [0, 0.35, 0.7].forEach((at) => tone(880, 0.25, { type: 'sawtooth', vol: 0.06, at, slide: 0.7 })),
    rescued: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, { type: 'triangle', at: i * 0.06 })),
    fall: () => tone(700, 0.8, { type: 'sawtooth', vol: 0.06, slide: 0.2 }),
    pop: () => tone(420, 0.1, { vol: 0.2, slide: 2.2 }),
    whoosh: () => tone(300, 0.4, { type: 'sine', vol: 0.15, slide: 3 }),
    landed: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', at: i * 0.12 })),
  };
  return {
    play(n, arg) { try { P[n]?.(arg); } catch { /* bỏ qua */ } },
    resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } },
    close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; },
  };
}

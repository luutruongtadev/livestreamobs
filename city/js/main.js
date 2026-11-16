// Phố Mới — khởi động, vòng lặp, chuột / bàn phím, giao diện.
import * as S from './sim.js';
import { View } from './render.js';

const SAVE_KEY = 'phomoi.save.v1';
const DAY_SEC = 0.6; // một ngày trong game ở tốc độ 1
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
const money = (n) => `${fmt(n)} ₫`;

const TOOLS = [
  { id: 'info', icon: '🖐️', label: 'Xem', desc: 'Kéo để di chuyển bản đồ, bấm vào một ô để xem thông tin' },
  { id: 'road', icon: '🛣️', label: 'Đường', desc: `Kéo chuột để xây đường · ${S.ROAD_COST} ₫ / ô, cầu ${S.BRIDGE_COST} ₫ / ô` },
  { sep: true },
  { id: 'zoneR', icon: '🏠', label: 'Dân cư', zone: 1, dot: '#46c85a', desc: 'Kéo để quy hoạch khu dân cư (miễn phí, cách đường tối đa 2 ô)' },
  { id: 'zoneC', icon: '🏬', label: 'Thương mại', zone: 2, dot: '#468cec', desc: 'Kéo để quy hoạch khu thương mại: cửa hàng, văn phòng' },
  { id: 'zoneI', icon: '🏭', label: 'Công nghiệp', zone: 3, dot: '#f0be32', desc: 'Kéo để quy hoạch khu công nghiệp: nhiều việc làm, gây ô nhiễm quanh đó' },
  { id: 'dezone', icon: '🧽', label: 'Bỏ q.hoạch', zone: 0, desc: 'Kéo để bỏ quy hoạch (dỡ luôn nhà trong vùng)' },
  { sep: true },
  ...['wind', 'solar', 'coal', 'tower', 'pump'].map((t) => ({ id: t, svc: t })),
  { sep: true },
  ...['park', 'plaza', 'clinic', 'school', 'police', 'fire', 'university', 'stadium'].map((t) => ({ id: t, svc: t })),
  { sep: true },
  { id: 'bulldoze', icon: '🚜', label: 'San ủi', desc: 'Kéo để phá đường, nhà, cây và công trình' },
];
const LAYERS = [['zones', 'Lớp xem: quy hoạch'], ['value', 'Lớp xem: giá trị đất (xanh = cao)'], ['pollution', 'Lớp xem: ô nhiễm'], ['service', 'Lớp xem: vùng phủ dịch vụ công']];

let city, view, tool = 'info', speed = 1, layer = 0, acc = 0, hover = null, drag = null, lastSave = 0, hintOverride = null;
const keys = new Set();

function load() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) return S.deserialize(JSON.parse(raw)); } catch (e) { console.warn('Không đọc được bản lưu', e); }
  return null;
}
function save(manual) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S.serialize(city))); if (manual) toast('Đã lưu thành phố'); } catch (e) { if (manual) toast('Không lưu được: ' + e.message); }
  lastSave = performance.now();
}

function toast(text, title) {
  const el = document.createElement('div');
  el.className = 'panel toast';
  if (title) { const h = document.createElement('h3'); h.textContent = title; el.append(h); }
  el.append(text);
  $('toasts').append(el);
  setTimeout(() => el.remove(), title ? 6500 : 2200);
}

function buildToolbar() {
  const box = $('tools');
  box.textContent = '';
  for (const t of TOOLS) {
    if (t.sep) { const s = document.createElement('div'); s.className = 'sep'; box.append(s); continue; }
    const def = t.svc ? S.SERVICES[t.svc] : null;
    const b = document.createElement('button');
    b.className = 'tool'; b.dataset.tool = t.id;
    const ic = document.createElement('span'); ic.textContent = def ? def.icon : t.icon;
    const lb = document.createElement('small'); lb.textContent = def ? def.name : t.label;
    b.append(ic, lb);
    if (t.dot) { const d = document.createElement('i'); d.className = 'dot'; d.style.background = t.dot; b.append(d); }
    b.addEventListener('click', () => setTool(t.id));
    b.addEventListener('mouseenter', () => { hintOverride = toolDesc(t.id); renderHint(); });
    b.addEventListener('mouseleave', () => { hintOverride = null; renderHint(); });
    box.append(b);
  }
  refreshToolbar();
}

function toolDesc(id) {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) return '';
  if (!t.svc) return t.desc;
  const d = S.SERVICES[t.svc];
  const extra = d.power ? ` · ⚡ ${d.power}` : d.water ? ` · 💧 ${d.water}` : '';
  const lock = S.isUnlocked(city, t.svc) ? '' : ` · 🔒 mở khi đạt ${fmt(d.unlock)} dân`;
  return `<b>${d.name}</b> (${d.size}×${d.size}) · ${money(d.cost)} · phí ${fmt(d.upkeep)} ₫/tháng${extra} · ${d.desc}${lock}`;
}

function refreshToolbar() {
  for (const b of $('tools').querySelectorAll('.tool')) {
    const id = b.dataset.tool;
    b.classList.toggle('on', id === tool);
    if (S.SERVICES[id]) b.classList.toggle('locked', !S.isUnlocked(city, id));
  }
}

function setTool(id) {
  tool = id; drag = null;
  view.setPreview(null); view.setGhost(null);
  refreshToolbar(); applyOverlay(); renderHint();
  view.canvas.style.cursor = id === 'info' ? 'grab' : 'crosshair';
}

function applyOverlay() {
  const zoning = tool.startsWith('zone') || tool === 'dezone';
  view.setOverlay(zoning ? 'zones' : LAYERS[layer][0], zoning, tool !== 'info');
}

function renderHint(text) {
  $('hint').innerHTML = text || hintOverride || toolDesc(tool);
}

function rectTiles(a, b) {
  const out = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push([x, y]);
  return out;
}

/** Cập nhật ô xem trước theo công cụ đang cầm. */
function updatePreview() {
  if (tool === 'info') return;
  const t = TOOLS.find((x) => x.id === tool);
  if (t.svc) {
    if (!hover) { view.setGhost(null); view.setPreview(null); return; }
    const r = S.canPlace(city, t.svc, hover.x, hover.y), fp = r.fp || S.footprint(t.svc, hover.x, hover.y);
    view.setGhost(t.svc, fp, r.ok);
    view.setPreview(rectTiles({ x: fp.x, y: fp.y }, { x: fp.x + fp.size - 1, y: fp.y + fp.size - 1 }), r.ok ? 0x62d98b : 0xff5b4a);
    renderHint(r.ok ? null : `<b>${r.reason}</b>`);
    return;
  }
  if (!hover && !drag) { view.setPreview(null); return; }
  const a = drag ? drag.from : hover, b = hover || drag.to || a;
  if (drag) drag.to = b;
  if (tool === 'road') {
    const tiles = S.linePath(a.x, a.y, b.x, b.y), cost = S.roadCost(city, tiles);
    view.setPreview(tiles, cost > city.money ? 0xff5b4a : 0xffffff);
    if (drag) renderHint(`Đường: <b>${tiles.length} ô</b> · ${money(cost)}${cost > city.money ? ' · <b>không đủ tiền</b>' : ''}`);
  } else {
    const tiles = rectTiles(a, b);
    view.setPreview(tiles, tool === 'bulldoze' ? 0xff5b4a : ['#cfd6dc', '#46c85a', '#468cec', '#f0be32'][t.zone]);
    if (drag) renderHint(`${t.label}: <b>${Math.abs(a.x - b.x) + 1} × ${Math.abs(a.y - b.y) + 1} ô</b>`);
  }
}

function commitDrag() {
  if (!drag) return;
  const a = drag.from, b = drag.to || a, t = TOOLS.find((x) => x.id === tool);
  drag = null;
  let r = null;
  if (tool === 'road') r = S.buildRoad(city, S.linePath(a.x, a.y, b.x, b.y));
  else if (tool === 'bulldoze') r = S.bulldozeRect(city, a.x, a.y, b.x, b.y);
  else if (t && t.zone !== undefined) r = S.zoneRect(city, a.x, a.y, b.x, b.y, t.zone);
  if (r && !r.ok && r.reason) toast(r.reason);
  S.recalc(city);
  renderHint(); updatePreview(); updateHud(true);
}

function showInfo(tile) {
  const i = tile.y * S.N + tile.x, c = city, rows = [];
  let title = 'Ô đất';
  const add = (k, v) => rows.push(`<div class="row"><span>${k}</span><span>${v}</span></div>`);
  if (c.occ[i]) {
    const sv = c.services[c.occ[i] - 1], d = S.SERVICES[sv.type];
    title = `${d.icon} ${d.name}`;
    add('Phí duy trì', `${fmt(d.upkeep)} ₫/tháng`);
    if (d.power) add('Công suất điện', d.power);
    if (d.water) add('Công suất nước', d.water);
    if (d.radius) add('Bán kính phục vụ', `${d.radius} ô`);
  } else if (c.road[i]) title = c.water[i] ? '🌉 Cầu' : '🛣️ Đường';
  else if (c.water[i]) title = '🌊 Mặt nước';
  else {
    const z = c.zone[i], L = c.level[i];
    title = L ? `${['', '🏠', '🏬', '🏭'][z]} ${S.ZONE_NAME[z]} cấp ${L}` : S.ZONE_NAME[z];
    if (L) add(z === 1 ? 'Cư dân' : 'Chỗ làm', S.CAP[z][L - 1]);
    else if (z) add('Tình trạng', S.roadDir(c, tile.x, tile.y) < 0 ? 'Chưa có đường trong 2 ô' : 'Chờ xây dựng');
    if (c.tree[i]) add('Cây xanh', 'Có');
  }
  if (!c.water[i]) {
    add('Giá trị đất', `${Math.round(c.landValue[i])} / 100`);
    add('Ô nhiễm', `${Math.round(c.pollution[i] * 100)}%`);
    const cv = c.cover, tag = (v) => (v > 0.02 ? '✔' : '–');
    add('Công viên · Y tế · Trường', `${tag(cv.park[i])} · ${tag(cv.health[i])} · ${tag(cv.edu[i])}`);
    add('Công an · Cứu hoả', `${tag(cv.police[i])} · ${tag(cv.fire[i])}`);
  }
  $('iTitle').textContent = title; $('iBody').innerHTML = rows.join('');
  $('info').classList.add('show');
}

let hudAt = 0;
function updateHud(force) {
  const now = performance.now();
  if (!force && now - hudAt < 250) return;
  hudAt = now;
  const c = city, s = c.stats, net = s.income - s.expense;
  $('pop').textContent = fmt(s.pop);
  $('jobs').textContent = `${fmt(s.jobs)} việc làm`;
  $('money').textContent = money(c.money); $('money').className = c.money < 0 ? 'neg' : '';
  $('net').textContent = `${net >= 0 ? '+' : ''}${fmt(net)} / tháng`; $('net').className = `sub ${net >= 0 ? 'pos' : 'neg'}`;
  $('happy').textContent = s.pop ? `${s.happy >= 65 ? '😊' : s.happy >= 45 ? '😐' : '😟'} ${Math.round(s.happy)}%` : '–';
  const d = c.day, y = Math.floor(d / 360) + 1, m = Math.floor((d % 360) / 30) + 1, dd = (d % 30) + 1;
  $('date').textContent = `${dd}/${m} · năm ${y}`;
  $('rank').textContent = c.milestone ? S.MILESTONES[c.milestone - 1].name : 'Vùng đất mới';
  for (const [id, v] of [['dr', c.demand.r], ['dc', c.demand.c], ['di', c.demand.i]]) $(id).style.height = `${Math.max(3, Math.max(0, v) * 100)}%`;
  for (const b of $('speed').children) b.classList.toggle('on', +b.dataset.s === speed);
  // ngân sách
  $('taxv').textContent = `${c.tax}%`;
  $('bInc').textContent = `+${fmt(s.income)}`;
  $('eRoad').textContent = `−${fmt(s.exp.roads)}`; $('ePower').textContent = `−${fmt(s.exp.power)}`; $('eWater').textContent = `−${fmt(s.exp.water)}`;
  $('ePark').textContent = `−${fmt(s.exp.park)}`; $('eCivic').textContent = `−${fmt(s.exp.civic)}`;
  $('bNet').textContent = `${net >= 0 ? '+' : ''}${fmt(net)} ₫`; $('bNet').className = net >= 0 ? 'pos' : 'neg';
  const meter = (bar, txt, use, cap) => { $(txt).textContent = `${fmt(use)} / ${fmt(cap)}`; $(bar).style.width = `${cap ? Math.min(100, (use / cap) * 100) : use ? 100 : 0}%`; $(bar).classList.toggle('over', use >= cap && use > 0); };
  meter('pBar', 'pTxt', s.powerUse, s.powerCap); meter('wBar', 'wTxt', s.waterUse, s.waterCap);
  $('jTxt').textContent = `${fmt(s.jobs)} / ${fmt(s.workers)}`;
  // cảnh báo / gợi ý
  const al = [];
  let zoned = 0, reach = 0;
  for (let i = 0; i < S.N * S.N; i++) if (c.zone[i]) { zoned++; if (!c.level[i] && S.roadDir(c, i % S.N, (i / S.N) | 0) >= 0) reach++; }
  if (s.roads <= 8 && !zoned) al.push(['Chọn 🛣️ Đường rồi kéo từ đoạn đường có sẵn để mở phố']);
  else if (!zoned) al.push(['Quy hoạch khu 🏠 dân cư dọc hai bên đường']);
  if (zoned && !s.powerCap) al.push(['⚡ Chưa có điện: đặt một tua-bin gió', 1]);
  else if (s.powerUse >= s.powerCap && s.powerCap) al.push(['⚡ Thiếu điện: nhà ngừng mọc, xây thêm nguồn điện', 1]);
  if (zoned && !s.waterCap) al.push(['💧 Chưa có nước: đặt một tháp nước', 1]);
  else if (s.waterUse >= s.waterCap && s.waterCap) al.push(['💧 Thiếu nước: xây thêm tháp nước hoặc trạm bơm', 1]);
  if (s.pop > 60 && c.demand.r < 0 && s.workers > s.jobs) al.push(['Thiếu việc làm: quy hoạch thêm 🏬 thương mại, 🏭 công nghiệp']);
  if (s.pop > 60 && c.demand.c > 0.5) al.push(['Nhu cầu thương mại đang cao']);
  if (s.pop > 60 && c.demand.i > 0.5) al.push(['Nhu cầu công nghiệp đang cao']);
  if (s.pop > 0 && c.demand.r > 0.3 && !reach && s.powerUse < s.powerCap) al.push(['Hết đất dân cư trống cạnh đường: quy hoạch thêm']);
  if (c.money < 0) al.push(['Ngân sách âm: tăng thuế hoặc bớt công trình', 1]);
  if (!speed) al.push(['⏸ Đang tạm dừng']);
  const key = al.map((a) => a[0]).join('|');
  if (key !== updateHud.key) {
    updateHud.key = key;
    const box = $('alerts'); box.textContent = '';
    for (const [text, bad] of al.slice(0, 5)) { const e = document.createElement('div'); e.className = `panel alert${bad ? ' bad' : ''}`; e.textContent = text; box.append(e); }
  }
}

function setSpeed(v) { speed = v; updateHud(true); }

function bindInput() {
  const cv = view.canvas;
  let rot = null, grab = null, downAt = null;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    downAt = { x: e.clientX, y: e.clientY, moved: false };
    if (e.button === 2 || e.button === 1) { rot = { x: e.clientX, y: e.clientY }; return; }
    if (e.button !== 0) return;
    hover = view.pick(e.clientX, e.clientY);
    if (tool === 'info') { grab = view.groundPoint(e.clientX, e.clientY); cv.style.cursor = 'grabbing'; return; }
    if (!hover) return;
    if (S.SERVICES[tool]) {
      const r = S.placeService(city, tool, hover.x, hover.y);
      if (!r.ok) toast(r.reason);
      updatePreview(); updateHud(true);
      return;
    }
    drag = { from: hover, to: hover };
    updatePreview();
  });
  cv.addEventListener('pointermove', (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) downAt.moved = true;
    if (rot) { view.rotate(-(e.clientX - rot.x) * 0.006, (e.clientY - rot.y) * 0.004); rot = { x: e.clientX, y: e.clientY }; return; }
    if (grab) {
      const p = view.groundPoint(e.clientX, e.clientY);
      if (p) { view.panWorld(grab.x - p.x, grab.z - p.z); view._camera(); view.camera.updateMatrixWorld(); }
      return;
    }
    const h = view.pick(e.clientX, e.clientY);
    if (h && hover && h.x === hover.x && h.y === hover.y) return;
    hover = h;
    if (!S.SERVICES[tool] || !hintOverride) updatePreview();
  });
  const up = (e) => {
    if (rot) { rot = null; if (e.button === 2 && downAt && !downAt.moved && tool !== 'info') setTool('info'); }
    if (grab) { grab = null; cv.style.cursor = 'grab'; if (downAt && !downAt.moved) { const t = view.pick(e.clientX, e.clientY); if (t) showInfo(t); } }
    if (drag) commitDrag();
    downAt = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', () => { rot = grab = drag = null; view.setPreview(null); });
  cv.addEventListener('pointerleave', () => { if (!drag) { hover = null; view.setPreview(null); view.setGhost(null); } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom(Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0014)); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === ' ') { e.preventDefault(); setSpeed(speed ? 0 : updateHud.lastSpeed || 1); }
    else if (k === '1' || k === '2' || k === '3') setSpeed([1, 2, 4][+k - 1]);
    else if (k === 'escape') { if (drag) { drag = null; view.setPreview(null); renderHint(); } else setTool('info'); $('modal').classList.remove('show'); }
    else if (k === 'r') setTool('road');
    else if (k === 'b') setTool('bulldoze');
    if (speed) updateHud.lastSpeed = speed;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', () => view.resize());
}

function bindUi() {
  for (const b of $('speed').children) b.addEventListener('click', () => { setSpeed(+b.dataset.s); if (speed) updateHud.lastSpeed = speed; });
  $('bBudget').addEventListener('click', () => $('budget').classList.toggle('show'));
  $('bLayer').addEventListener('click', () => { layer = (layer + 1) % LAYERS.length; applyOverlay(); toast(LAYERS[layer][1]); $('bLayer').classList.toggle('on', layer > 0); });
  $('bSave').addEventListener('click', () => save(true));
  $('bHelp').addEventListener('click', () => $('modal').classList.add('show'));
  $('mStart').addEventListener('click', () => { $('modal').classList.remove('show'); try { localStorage.setItem('phomoi.seen', '1'); } catch { /* bỏ qua */ } });
  $('bNew').addEventListener('click', () => {
    if (!confirm('Bỏ thành phố hiện tại và bắt đầu vùng đất mới?')) return;
    startCity(S.newCity()); save();
  });
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('.side').classList.remove('show'));
  $('tax').addEventListener('input', (e) => { city.tax = +e.target.value; S.recalc(city); updateHud(true); });
  $('cityname').addEventListener('change', (e) => { city.name = e.target.value.trim() || 'Phố Mới'; e.target.value = city.name; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', () => save());
}

function startCity(c) {
  city = c; window.__city = c;
  view.setCity(c);
  $('cityname').value = c.name; $('tax').value = c.tax;
  acc = 0;
  setTool('info'); buildToolbar(); updateHud(true);
}

function frame(now) {
  const dt = Math.min(0.1, (now - (frame.last || now)) / 1000);
  frame.last = now;
  // di chuyển bằng bàn phím
  const mv = view.cam.dist * dt * 0.9;
  let dx = 0, dz = 0;
  if (keys.has('a') || keys.has('arrowleft')) dx -= mv;
  if (keys.has('d') || keys.has('arrowright')) dx += mv;
  if (keys.has('w') || keys.has('arrowup')) dz -= mv;
  if (keys.has('s') || keys.has('arrowdown')) dz += mv;
  if (dx || dz) view.pan(dx, dz);
  if (keys.has('q')) view.rotate(dt * 1.4, 0);
  if (keys.has('e')) view.rotate(-dt * 1.4, 0);

  acc += dt * speed;
  let n = 0;
  while (acc >= DAY_SEC && n++ < 8) { acc -= DAY_SEC; S.tick(city); }
  if (n >= 8) acc = 0;
  for (const ev of city.events.splice(0)) {
    if (ev.type === 'milestone') {
      toast(`Thưởng ${money(ev.reward)}${ev.unlocked.length ? ` · mở khoá: ${ev.unlocked.join(', ')}` : ''}`, `🎉 ${city.name} trở thành ${ev.name}!`);
      refreshToolbar();
    }
  }
  if (n && LAYERS[layer][0] !== 'zones' && city.day % 5 === 0) city.dirty.zones = true;
  view.update(dt, dt * speed);
  updateHud(false);
  if (now - lastSave > 20000) save();
  requestAnimationFrame(frame);
}

view = new View($('view'));
window.__view = view;
bindUi();
startCity(load() || S.newCity());
bindInput();
let seen = false;
try { seen = !!localStorage.getItem('phomoi.seen'); } catch { /* bỏ qua */ }
if (!seen) $('modal').classList.add('show');
requestAnimationFrame(frame);

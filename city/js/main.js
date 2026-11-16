// Phố Mới — khởi động, vòng lặp, chuột / bàn phím, giao diện.
import * as S from './sim.js';
import { View } from './render.js';

const KEY = 'phomoi.v2.';
const DAY_SEC = 0.6; // một ngày trong game ở tốc độ 1
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
const money = (n) => `${fmt(n)} ₫`;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// nhóm công cụ ở thanh dưới; nhóm có `tool` thì bấm là cầm luôn
const GROUPS = [
  { id: 'info', icon: '🖐️', label: 'Xem', tool: 'info' },
  { id: 'road', icon: '🛣️', label: 'Đường', items: ['road:small', 'road:large', 'road:oneway'] },
  { id: 'zone', icon: '🎨', label: 'Quy hoạch', items: ['zone:1', 'zone:2', 'zone:3', 'zone:0'] },
  { id: 'power', icon: '⚡', label: 'Điện', items: ['wind', 'solar', 'coal', 'line:power'] },
  { id: 'water', icon: '💧', label: 'Nước', items: ['tower', 'pump', 'outlet', 'treat', 'line:pipe'] },
  { id: 'trash', icon: '🗑️', label: 'Rác', items: ['landfill', 'incinerator'] },
  { id: 'civic', icon: '🏛️', label: 'Dịch vụ', items: ['clinic', 'school', 'police', 'fire', 'university'] },
  { id: 'park', icon: '🌳', label: 'Công viên', items: ['park', 'plaza', 'stadium'] },
  { id: 'bulldoze', icon: '🚜', label: 'San ủi', tool: 'bulldoze' },
];
const ZONES = [
  { icon: '🧽', label: 'Bỏ q.hoạch', color: '#cfd6dc', desc: 'Kéo để bỏ quy hoạch (dỡ luôn nhà trong vùng)' },
  { icon: '🏠', label: 'Dân cư', color: '#46c85a', desc: 'Kéo để tô khu dân cư lên các ô đất hai bên đường (miễn phí)' },
  { icon: '🏬', label: 'Thương mại', color: '#468cec', desc: 'Kéo để tô khu thương mại: cửa hàng, văn phòng' },
  { icon: '🏭', label: 'Công nghiệp', color: '#f0be32', desc: 'Kéo để tô khu công nghiệp: nhiều việc làm, gây ô nhiễm quanh đó' },
];
const ROAD_MODES = [['line', '📏', 'Thẳng'], ['curve', '↪️', 'Cong'], ['upgrade', '⬆️', 'Nâng cấp']];
const LAYERS = [['zones', 'Lớp xem: quy hoạch'], ['value', 'Lớp xem: giá trị đất (xanh = cao)'], ['pollution', 'Lớp xem: ô nhiễm'], ['service', 'Lớp xem: vùng phủ dịch vụ công và thu gom rác'], ['power', 'Lớp xem: điện (xanh = đủ, cam = thiếu, đỏ = không có)'], ['water', 'Lớp xem: nước và thoát nước, hiện cả ống ngầm']];

let city, view, tool = 'info', group = 'info', speed = 1, layer = 0, acc = 0, hover = null, drag = null, lastSave = 0, hintOverride = null;
let roadMode = 'line', gridSnap = true, draw = null; // draw: { a, ctrl } khi đang vẽ đường / dây
const keys = new Set();

/** Mô tả một công cụ theo id. */
function toolInfo(id) {
  const [kind, arg] = id.split(':');
  if (id === 'info') return { kind: 'info', icon: '🖐️', label: 'Xem', desc: 'Kéo để di chuyển bản đồ, bấm vào nhà hoặc ô đất để xem thông tin' };
  if (id === 'bulldoze') return { kind: 'bulldoze', icon: '🚜', label: 'San ủi', desc: 'Kéo để phá đường, nhà, cây, dây điện, ống nước và công trình' };
  if (kind === 'road') { const d = S.ROADS[arg]; return { kind, type: arg, icon: d.icon, label: d.name.replace(/ \d làn/, ''), desc: `<b>${d.name}</b> · ${fmt(d.cost * S.T)} ₫ / ô, qua nước đắt gấp ${S.BRIDGE_MULT} · ${d.desc}` }; }
  if (kind === 'zone') { const z = ZONES[+arg]; return { kind, zone: +arg, icon: z.icon, label: z.label, dot: +arg ? z.color : null, desc: z.desc }; }
  if (kind === 'line') { const d = S.LINES[arg]; return { kind, line: arg, icon: d.icon, label: d.name, desc: `<b>${d.name}</b> · ${fmt(d.cost * S.T)} ₫ / ô · bấm điểm đầu rồi điểm cuối · ${d.desc}` }; }
  const d = S.SERVICES[id];
  const extra = [d.power && `⚡ ${d.power}`, d.water && `💧 ${d.water}`, d.sewage && `🕳️ ${d.sewage}`, d.trash && `🗑️ ${d.trash}`, d.radius && `bán kính ${d.radius} ô`].filter(Boolean).join(' · ');
  const lock = S.isUnlocked(city, id) ? '' : ` · 🔒 mở khi đạt ${fmt(d.unlock)} dân`;
  return { kind: 'svc', svc: id, icon: d.icon, label: d.name, desc: `<b>${d.name}</b> (${d.size}×${d.size}) · ${money(d.cost)} · phí ${fmt(d.upkeep)} ₫/tháng${extra ? ' · ' + extra : ''} · ${d.desc}${lock}` };
}

// ───────────────────────── lưu / tải ─────────────────────────

function readSlot(name) {
  try { const raw = localStorage.getItem(KEY + name); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeSlot(name) {
  const data = { name: city.name, pop: city.stats.pop, day: city.day, at: Date.now(), city: S.serialize(city) };
  try { localStorage.setItem(KEY + name, JSON.stringify(data)); return true; } catch (e) { toast('Không lưu được: ' + e.message); return false; }
}
function autosave() { if (city && !city.over) writeSlot('auto'); lastSave = performance.now(); }
function loadSlot(name) {
  const d = readSlot(name);
  if (!d) return false;
  try { startCity(S.deserialize(d.city)); return true; } catch (e) { toast('Không đọc được bản lưu: ' + e.message); return false; }
}
function dateText(day) { return `${(day % 30) + 1}/${Math.floor((day % 360) / 30) + 1} · năm ${Math.floor(day / 360) + 1}`; }

function renderSlots() {
  const box = $('slots'); box.textContent = '';
  for (const [name, label] of [['auto', 'Tự lưu'], ['slot1', 'Ô lưu 1'], ['slot2', 'Ô lưu 2'], ['slot3', 'Ô lưu 3']]) {
    const d = readSlot(name), row = el('div', 'slot'), info = el('div');
    info.append(el('b', null, label), el('small', null, d ? `${d.name} · ${fmt(d.pop)} dân · ${dateText(d.day)}` : 'Trống'));
    row.append(info);
    if (name !== 'auto') { const b = el('button', 'mini acc', 'Lưu'); b.addEventListener('click', () => { if (writeSlot(name)) { toast(`Đã lưu vào ${label.toLowerCase()}`); renderSlots(); } }); row.append(b); }
    const b = el('button', 'mini', 'Tải'); b.disabled = !d;
    b.addEventListener('click', () => { if (loadSlot(name)) { toast(`Đã tải ${label.toLowerCase()}`); $('over').classList.remove('show'); } });
    row.append(b); box.append(row);
  }
}

function toast(text, title) {
  const e = el('div', 'panel toast');
  if (title) e.append(el('h3', null, title));
  e.append(text);
  $('toasts').append(e);
  setTimeout(() => e.remove(), title ? 6500 : 2600);
}

// ───────────────────────── thanh công cụ ─────────────────────────

function toolButton(id, cls = 'tool') {
  const t = toolInfo(id), b = el('button', cls);
  b.dataset.tool = id;
  b.append(el('span', null, t.icon), el('small', null, t.label));
  if (t.dot) { const d = el('i', 'dot'); d.style.background = t.dot; b.append(d); }
  b.addEventListener('click', () => setTool(id));
  b.addEventListener('mouseenter', () => { hintOverride = toolInfo(id).desc; renderHint(); });
  b.addEventListener('mouseleave', () => { hintOverride = null; renderHint(); });
  return b;
}

function buildToolbar() {
  const box = $('tools'); box.textContent = '';
  for (const g of GROUPS) {
    const b = el('button', 'tool'); b.dataset.group = g.id;
    b.append(el('span', null, g.icon), el('small', null, g.label));
    b.addEventListener('click', () => { if (g.tool) setTool(g.tool); else if (group === g.id && tool !== 'info') setTool('info'); else setTool(g.items.includes(g.last) ? g.last : g.items[0]); });
    box.append(b);
  }
  buildSub();
}

function buildSub() {
  const box = $('sub'); box.textContent = '';
  const g = GROUPS.find((x) => x.id === group);
  if (!g || !g.items) { refreshToolbar(); return; }
  for (const id of g.items) box.append(toolButton(id));
  if (g.id === 'road') {
    box.append(el('div', 'sep'));
    for (const [m, icon, label] of ROAD_MODES) {
      const b = el('button', 'tool mode'); b.dataset.mode = m; b.append(el('span', null, icon), el('small', null, label));
      b.addEventListener('click', () => { roadMode = m; cancelDraw(); refreshToolbar(); renderHint(); });
      box.append(b);
    }
    const gb = el('button', 'tool mode'); gb.dataset.mode = 'grid'; gb.append(el('span', null, '#️⃣'), el('small', null, 'Bám lưới'));
    gb.addEventListener('click', () => { gridSnap = !gridSnap; refreshToolbar(); });
    box.append(gb);
  }
  refreshToolbar();
}

function refreshToolbar() {
  for (const b of $('tools').children) { const g = GROUPS.find((x) => x.id === b.dataset.group); b.classList.toggle('on', !!g.tool && g.tool === tool); b.classList.toggle('open', !g.tool && g.id === group); }
  for (const b of $('sub').children) {
    if (b.dataset.tool) { b.classList.toggle('on', b.dataset.tool === tool); if (S.SERVICES[b.dataset.tool]) b.classList.toggle('locked', !S.isUnlocked(city, b.dataset.tool)); }
    if (b.dataset.mode) b.classList.toggle('on', b.dataset.mode === 'grid' ? gridSnap : b.dataset.mode === roadMode);
  }
}

function setTool(id) {
  tool = id; drag = null; draw = null;
  const g = GROUPS.find((x) => x.tool === id || (x.items && x.items.includes(id)));
  if (g.items) g.last = id;
  const changed = group !== g.id;
  group = g.id;
  view.setPreview(null); view.setGhost(null); view.setRibbon(null); view.setMarker(null);
  if (changed) buildSub(); else refreshToolbar();
  applyOverlay(); renderHint();
  view.canvas.style.cursor = id === 'info' ? 'grab' : 'crosshair';
}

function applyOverlay() {
  const t = toolInfo(tool), zoning = t.kind === 'zone';
  const mode = zoning ? 'zones' : t.line === 'pipe' || group === 'water' ? 'water' : t.line === 'power' || group === 'power' ? 'power' : LAYERS[layer][0];
  view.setOverlay(mode, zoning, tool !== 'info' && t.kind !== 'road' && t.kind !== 'line');
}

function renderHint(text) {
  let base = toolInfo(tool).desc;
  if (toolInfo(tool).kind === 'road') base += roadMode === 'line' ? ' · <b>Thẳng</b>: bấm điểm đầu, bấm điểm cuối' : roadMode === 'curve' ? ' · <b>Cong</b>: bấm điểm đầu, điểm uốn, điểm cuối' : ' · <b>Nâng cấp</b>: bấm vào đoạn đường để đổi sang loại này';
  $('hint').innerHTML = text || hintOverride || base;
}

// ───────────────────────── vẽ đường, dây, quy hoạch ─────────────────────────

function rectTiles(a, b) {
  const out = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push([x, y]);
  return out;
}

function cancelDraw() { draw = null; view.setRibbon(null); view.setMarker(null); }

/** Điểm bắt cho công cụ đường tại vị trí con trỏ. */
function roadSnap(type, free) {
  if (!hover) return null;
  return S.snapPoint(city, hover.wx, hover.wz, { grid: gridSnap && !free, type });
}

function linePoint() {
  if (!hover) return null;
  const i = hover.y * S.N + hover.x;
  if (city.occ[i]) { const s = city.services[city.occ[i] - 1], sz = S.SERVICES[s.type].size * S.T; return { x: s.x * S.T - S.HALF + sz / 2, z: s.y * S.T - S.HALF + sz / 2, snapped: true }; }
  const e = S.edgeAt(city, hover.wx, hover.wz, 5);
  return { x: hover.wx, z: hover.wz, snapped: !!e };
}

/** Cập nhật phần xem trước theo công cụ đang cầm. */
function updatePreview() {
  const t = toolInfo(tool);
  if (t.kind === 'info') return;
  if (t.kind === 'svc') {
    if (!hover) { view.setGhost(null); view.setPreview(null); return; }
    const r = S.canPlace(city, t.svc, hover.x, hover.y), fp = r.fp || S.footprint(t.svc, hover.x, hover.y);
    view.setGhost(t.svc, fp, r.ok);
    view.setPreview(rectTiles({ x: fp.x, y: fp.y }, { x: fp.x + fp.size - 1, y: fp.y + fp.size - 1 }), r.ok ? 0x62d98b : 0xff5b4a);
    renderHint(r.ok ? null : `<b>${r.reason}</b>`);
    return;
  }
  if (t.kind === 'road') {
    if (roadMode === 'upgrade') {
      const e = hover && S.edgeAt(city, hover.wx, hover.wz, 2);
      view.setMarker(null);
      if (!e) { view.setRibbon(null); renderHint(); return; }
      const same = e.type === t.type, cost = S.upgradeCost(e, t.type), ok = same ? t.type === 'oneway' : cost <= city.money;
      view.setRibbon(e.pts, S.ROADS[t.type].w / 2, ok ? 0xffc24a : 0xff5b4a);
      renderHint(same ? (t.type === 'oneway' ? 'Bấm để <b>đảo chiều</b> đoạn đường một chiều này' : 'Đoạn này đã là loại đường đang chọn') : `Đổi thành <b>${S.ROADS[t.type].name}</b> · ${money(cost)}${ok ? '' : ' · <b>không đủ tiền</b>'}`);
      return;
    }
    const needCtrl = roadMode === 'curve' && draw && !draw.ctrl;
    const sp = roadSnap(t.type, needCtrl);
    if (!sp) { view.setMarker(null); return; }
    view.setMarker(sp, sp.node != null || sp.edge != null);
    if (!draw) { view.setRibbon(null); renderHint(); return; }
    if (needCtrl) { // đang chọn điểm uốn: xem trước đường thẳng tới con trỏ
      view.setRibbon(new Float32Array([draw.a.x, draw.a.z, sp.x, sp.z]), 0.6, 0xffffff);
      renderHint('Bấm để đặt <b>điểm uốn</b>, rồi bấm điểm cuối');
      return;
    }
    const plan = S.planRoad(city, { a: draw.a, b: sp, ctrl: draw.ctrl, type: t.type });
    draw.plan = plan; draw.b = sp;
    view.setRibbon(plan.pts, S.ROADS[t.type].w / 2, plan.ok ? 0xffffff : 0xff5b4a);
    renderHint(`${S.ROADS[t.type].name}: <b>${(plan.len / S.T).toFixed(1)} ô</b> · ${money(plan.cost)}${plan.ok ? '' : ` · <b>${plan.reason}</b>`}`);
    return;
  }
  if (t.kind === 'line') {
    const p = linePoint();
    if (!p) { view.setMarker(null); return; }
    view.setMarker(p, p.snapped);
    if (!draw) { view.setRibbon(null); renderHint(); return; }
    const plan = S.planLine(city, t.line, draw.a, p);
    draw.b = p;
    view.setRibbon(new Float32Array([draw.a.x, draw.a.z, p.x, p.z]), 0.9, plan.ok ? (t.line === 'pipe' ? 0x35b6ff : 0xffe680) : 0xff5b4a);
    renderHint(`${S.LINES[t.line].name}: <b>${(plan.len / S.T).toFixed(1)} ô</b> · ${money(plan.cost)}${plan.ok ? '' : ` · <b>${plan.reason}</b>`}`);
    return;
  }
  // quy hoạch, san ủi: kéo hình chữ nhật
  if (!hover && !drag) { view.setPreview(null); return; }
  const a = drag ? drag.from : hover, b = hover || drag.to || a;
  if (drag) drag.to = b;
  const tiles = rectTiles(a, b);
  if (t.kind === 'bulldoze') view.setPreview(tiles, 0xff5b4a);
  else view.setPreview(t.zone ? tiles.filter(([x, y]) => city.acc[y * S.N + x]) : tiles, ZONES[t.zone].color);
  if (drag) renderHint(`${t.label}: <b>${Math.abs(a.x - b.x) + 1} × ${Math.abs(a.y - b.y) + 1} ô</b>`);
}

/** Một lần bấm (hoặc thả sau khi kéo) của công cụ đường / dây. */
function drawClick(fromDrag) {
  const t = toolInfo(tool);
  if (t.kind === 'road') {
    if (roadMode === 'upgrade') {
      if (fromDrag) return;
      const e = hover && S.edgeAt(city, hover.wx, hover.wz, 2);
      if (!e) return;
      const r = S.upgradeRoad(city, e.id, t.type);
      if (!r.ok) toast(r.reason);
      updatePreview(); updateHud(true);
      return;
    }
    const needCtrl = roadMode === 'curve' && draw && !draw.ctrl;
    const sp = roadSnap(t.type, needCtrl);
    if (!sp) return;
    if (!draw) { if (!fromDrag) draw = { a: sp }; updatePreview(); return; }
    if (needCtrl) { if (!fromDrag) draw.ctrl = { x: sp.x, z: sp.z }; updatePreview(); return; }
    const r = S.buildRoad(city, { a: draw.a, b: sp, ctrl: draw.ctrl, type: t.type });
    if (!r.ok) { if (!fromDrag || r.reason !== 'Đoạn quá ngắn') toast(r.reason); if (fromDrag) return; }
    else draw = { a: { x: sp.x, z: sp.z, node: r.endNode } }; // vẽ nối tiếp từ điểm cuối
    updatePreview(); updateHud(true);
    return;
  }
  if (t.kind === 'line') {
    const p = linePoint();
    if (!p) return;
    if (!draw) { if (!fromDrag) draw = { a: p }; updatePreview(); return; }
    const r = S.buildLine(city, t.line, draw.a, p);
    if (!r.ok) { if (!fromDrag || r.reason !== 'Đoạn quá ngắn') toast(r.reason); if (fromDrag) return; }
    else draw = null;
    updatePreview(); updateHud(true);
  }
}

function commitDrag() {
  if (!drag) return;
  const a = drag.from, b = drag.to || a, t = toolInfo(tool);
  drag = null;
  const r = t.kind === 'bulldoze' ? S.bulldozeRect(city, a.x, a.y, b.x, b.y) : S.zoneRect(city, a.x, a.y, b.x, b.y, t.zone);
  if (r && !r.ok && r.reason) toast(r.reason);
  renderHint(); updatePreview(); updateHud(true);
}

// ───────────────────────── bảng thông tin ─────────────────────────

function showInfo(tile) {
  const i = tile.y * S.N + tile.x, c = city, rows = [];
  let title = 'Ô đất', needs = null;
  const add = (k, v) => rows.push(`<div class="row"><span>${k}</span><span>${v}</span></div>`);
  const state = (v) => ['✖ không có', '✔ đủ', '⚠ thiếu'][v];
  const edge = S.edgeAt(c, tile.wx, tile.wz, 0);
  if (c.occ[i]) {
    const sv = c.services[c.occ[i] - 1], d = S.SERVICES[sv.type];
    title = `${d.icon} ${d.name}`;
    add('Phí duy trì', `${fmt(d.upkeep)} ₫/tháng`);
    if (d.power) add('Công suất điện', d.power);
    if (d.water) add('Công suất nước', d.water);
    if (d.sewage) add('Nhận nước thải', d.sewage);
    if (d.trash) add('Xử lý rác', d.trash);
    if (d.radius) add('Bán kính phục vụ', `${d.radius} ô`);
    if (d.power || d.water || d.sewage) add('Nối mạng', sv.linked ? '✔ đã nối' : '✖ chưa, kéo dây / ống tới đường');
  } else if (edge) {
    const d = S.ROADS[edge.type];
    title = `${d.icon} ${d.name}`;
    add('Chiều dài', `${(edge.len / S.T).toFixed(1)} ô`);
    add('Bảo trì', `${fmt(edge.len * d.upkeep)} ₫/tháng`);
    add('Nút giao hai đầu', `${c.adj.get(edge.a).length} và ${c.adj.get(edge.b).length} nhánh`);
  } else if (c.water[i]) title = '🌊 Mặt nước';
  else {
    const z = c.zone[i], L = c.level[i];
    title = L ? `${['', '🏠', '🏬', '🏭'][z]} ${S.ZONE_NAME[z]} cấp ${L}` : z ? S.ZONE_NAME[z] : c.acc[i] ? 'Ô đất cạnh đường' : 'Đất trống';
    if (L) {
      const h = S.cellHappy(c, i);
      add(z === 1 ? 'Cư dân' : 'Chỗ làm', S.CAP[z][L - 1]);
      add('Hài lòng', `${h.happy >= 65 ? '😊' : h.happy >= 45 ? '😐' : '😟'} ${Math.round(h.happy)}%`);
      const hint = S.levelHint(c, i);
      if (hint) add('Lên cấp khi', hint);
      needs = h.needs;
    } else if (z) add('Tình trạng', !c.acc[i] ? 'Không còn cạnh đường' : c.pOk[i] !== 1 ? 'Chờ có điện' : c.wOk[i] !== 1 ? 'Chờ có nước' : c.sOk[i] !== 1 ? 'Chờ có chỗ xả nước thải' : 'Chờ có nhu cầu');
    else if (!c.acc[i]) add('Quy hoạch', 'Phải nằm trong 2 ô cạnh đường');
    if (c.tree[i]) add('Cây xanh', 'Có');
  }
  if (!c.water[i] && !edge) {
    if (c.acc[i]) { add('Điện', state(c.pOk[i])); add('Nước sạch', state(c.wOk[i])); add('Thoát nước', state(c.sOk[i])); }
    add('Giá trị đất', `${Math.round(c.landValue[i])} / 100`);
    add('Ô nhiễm', `${Math.round(c.pollution[i] * 100)}%`);
    add('Độ cao', `${c.cellH[i].toFixed(1)} m`);
    const cv = c.cover, tag = (v) => (v > 0.05 ? '✔' : '–');
    add('Công viên · Y tế · Trường', `${tag(cv.park[i])} · ${tag(cv.health[i])} · ${tag(cv.edu[i])}`);
    add('Công an · Cứu hoả · Rác', `${tag(cv.police[i])} · ${tag(cv.fire[i])} · ${tag(cv.trash[i])}`);
  }
  $('iTitle').textContent = title; $('iBody').innerHTML = rows.join('');
  if (needs) {
    const ul = el('ul', 'needs');
    if (!needs.length) ul.append(el('li', 'ok', '✔ Không thiếu gì'));
    for (const n of needs) ul.append(el('li', null, `✖ ${n}`));
    $('iBody').append(ul);
  }
  $('info').classList.add('show');
}

// ───────────────────────── HUD ─────────────────────────

function renderLoans() {
  const box = $('loans'), c = city, sig = c.loans.map((l) => Math.ceil(l.left)).join(',') + '|' + c.loans.length;
  if (renderLoans.sig === sig && box.childElementCount) return;
  renderLoans.sig = sig; box.textContent = '';
  c.loans.forEach((l) => { const r = el('div', 'row'); r.append(el('span', null, `Đang nợ ${money(l.amount)}`), el('span', null, `−${fmt(l.monthly)} × ${Math.ceil(l.left)} tháng`)); box.append(r); });
  S.LOANS.forEach((l, k) => {
    const r = el('div', 'row'), b = el('button', 'mini', 'Vay');
    b.disabled = c.loans.length >= S.MAX_LOANS;
    b.addEventListener('click', () => { const res = S.takeLoan(city, k); if (res.ok) toast(`Đã vay ${money(l.amount)}`); else toast(res.reason); renderLoans.sig = ''; updateHud(true); });
    r.append(el('span', null, `${money(l.amount)} · ${l.months} tháng · lãi ${Math.round(l.rate * 100)}%`), b); box.append(r);
  });
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
  $('date').textContent = dateText(c.day);
  $('rank').textContent = c.milestone ? S.MILESTONES[c.milestone - 1].name : 'Vùng đất mới';
  for (const [id, v] of [['dr', c.demand.r], ['dc', c.demand.c], ['di', c.demand.i]]) $(id).style.height = `${Math.max(3, Math.max(0, v) * 100)}%`;
  for (const b of $('speed').children) b.classList.toggle('on', +b.dataset.s === speed);
  // ngân sách
  $('taxRv').textContent = `${c.tax.r}% · +${fmt(s.inc.r)}`; $('taxCv').textContent = `${c.tax.c}% · +${fmt(s.inc.c)}`; $('taxIv').textContent = `${c.tax.i}% · +${fmt(s.inc.i)}`;
  $('bInc').textContent = `+${fmt(s.income)}`;
  for (const [id, k] of [['eRoad', 'roads'], ['ePower', 'power'], ['eWater', 'water'], ['eTrash', 'trash'], ['ePark', 'park'], ['eCivic', 'civic'], ['eLoan', 'loans']]) $(id).textContent = `−${fmt(s.exp[k])}`;
  $('bNet').textContent = `${net >= 0 ? '+' : ''}${fmt(net)} ₫`; $('bNet').className = net >= 0 ? 'pos' : 'neg';
  const meter = (bar, txt, use, cap) => { $(txt).textContent = `${fmt(use)} / ${fmt(cap)}`; $(bar).style.width = `${cap ? Math.min(100, (use / cap) * 100) : use ? 100 : 0}%`; $(bar).classList.toggle('over', use >= cap && use > 0); };
  meter('pBar', 'pTxt', s.powerUse, s.powerCap); meter('wBar', 'wTxt', s.waterUse, s.waterCap); meter('sBar', 'sTxt', s.waterUse, s.sewCap); meter('tBar', 'tTxt', s.trashUse, s.trashCap);
  $('jTxt').textContent = `${fmt(s.jobs)} / ${fmt(s.workers)}`;
  if ($('budget').classList.contains('show')) renderLoans();
  // cảnh báo / gợi ý
  const al = [], none = s.none || {}, tight = s.tight || {};
  let zoned = 0, free = 0;
  for (let i = 0; i < S.N * S.N; i++) if (c.zone[i]) { zoned++; if (c.zone[i] === 1 && !c.level[i] && c.acc[i]) free++; }
  if (c.edges.size <= 1 && !zoned) al.push(['Chọn 🛣️ Đường, bấm vào cuối đoạn đường có sẵn rồi bấm điểm tiếp theo để mở phố']);
  else if (!zoned) al.push(['Chọn 🎨 Quy hoạch rồi tô khu 🏠 dân cư lên các ô hai bên đường']);
  if (none.p) al.push(['⚡ Khu đã quy hoạch chưa có điện: đặt tua-bin gió gần đường', 1]);
  else if (tight.p) al.push(['⚡ Hết điện dư: nhà ngừng mọc, xây thêm nguồn điện', 1]);
  if (none.w) al.push(['💧 Chưa có nước sạch: đặt một tháp nước gần đường', 1]);
  else if (tight.w) al.push(['💧 Hết nước dư: xây thêm tháp nước hoặc trạm bơm', 1]);
  if (!none.w && none.s) al.push(['🕳️ Chưa có chỗ xả nước thải: đặt cống xả sát bờ nước rồi nối ống tới đường', 1]);
  else if (tight.s) al.push(['🕳️ Cống xả quá tải: xây thêm cống hoặc nhà máy xử lý', 1]);
  const loose = c.services.filter((sv) => { const d = S.SERVICES[sv.type]; return (d.power || d.water || d.sewage) && !sv.linked; });
  if (loose.length) al.push([`${S.SERVICES[loose[0].type].icon} ${S.SERVICES[loose[0].type].name} chưa nối mạng: kéo ${S.SERVICES[loose[0].type].power ? 'dây điện' : 'ống nước'} từ nó tới đường`, 1]);
  if (s.noPower + s.noWater > 0) al.push([`${s.noPower + s.noWater} nhà đang thiếu điện nước, sắp bị bỏ hoang`, 1]);
  if (s.pop >= 150 && s.trashUse > s.trashCap) al.push([s.trashCap ? '🗑️ Rác quá tải: xây thêm bãi rác' : '🗑️ Rác chất đống: xây một bãi rác', 1]);
  if (s.pop > 60 && c.demand.r < 0 && s.workers > s.jobs) al.push(['Thiếu việc làm: quy hoạch thêm 🏬 thương mại, 🏭 công nghiệp']);
  if (s.pop > 60 && c.demand.c > 0.5) al.push(['Nhu cầu thương mại đang cao']);
  if (s.pop > 60 && c.demand.i > 0.5) al.push(['Nhu cầu công nghiệp đang cao']);
  if (s.pop > 0 && c.demand.r > 0.3 && !free && !tight.p && !tight.w && !tight.s) al.push(['Hết đất dân cư trống cạnh đường: quy hoạch thêm']);
  if (c.money < 0) al.push([`Ngân sách âm: tăng thuế, bớt chi hoặc vay nợ ở 📊 (phá sản khi nợ quá ${fmt(-S.BANKRUPT_AT)} ₫ hoặc âm ${S.BANKRUPT_DAYS} ngày)`, 1]);
  if (!speed) al.push(['⏸ Đang tạm dừng']);
  const key = al.map((a) => a[0]).join('|');
  if (key !== updateHud.key) {
    updateHud.key = key;
    const box = $('alerts'); box.textContent = '';
    for (const [text, bad] of al.slice(0, 5)) box.append(el('div', `panel alert${bad ? ' bad' : ''}`, text));
  }
}

function setSpeed(v) { speed = v; if (v) updateHud.lastSpeed = v; updateHud(true); }

// ───────────────────────── chuột, bàn phím ─────────────────────────

function bindInput() {
  const cv = view.canvas;
  let rot = null, grab = null, downAt = null;
  const isDrawTool = () => { const k = toolInfo(tool).kind; return k === 'road' || k === 'line'; };
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    downAt = { x: e.clientX, y: e.clientY, moved: false };
    if (e.button === 2 || e.button === 1) { rot = { x: e.clientX, y: e.clientY }; return; }
    if (e.button !== 0) return;
    hover = view.pick(e.clientX, e.clientY);
    if (tool === 'info') { grab = view.groundPoint(e.clientX, e.clientY); cv.style.cursor = 'grabbing'; return; }
    if (!hover) return;
    if (isDrawTool()) { downAt.started = !draw; drawClick(false); return; }
    if (S.SERVICES[tool]) {
      const r = S.placeService(city, tool, hover.x, hover.y);
      if (!r.ok) toast(r.reason);
      else { const d = S.SERVICES[tool]; if ((d.power || d.water || d.sewage) && !r.linked) toast(`${d.name} đang ở xa đường: kéo ${d.power ? 'dây điện' : 'ống nước'} từ nó tới đường`); }
      updatePreview(); updateHud(true);
      return;
    }
    drag = { from: hover, to: hover };
    updatePreview();
  });
  cv.addEventListener('pointermove', (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) downAt.moved = true;
    if (rot) { view.rotate(-(e.clientX - rot.x) * 0.006, (e.clientY - rot.y) * 0.004); rot = { x: e.clientX, y: e.clientY }; return; }
    if (grab) {
      const p = view.groundPoint(e.clientX, e.clientY);
      if (p) { view.panWorld(grab.x - p.x, grab.z - p.z); view._camera(); view.camera.updateMatrixWorld(); }
      return;
    }
    const h = view.pick(e.clientX, e.clientY);
    if (!isDrawTool() && h && hover && h.x === hover.x && h.y === hover.y) { hover = h; return; }
    hover = h;
    updatePreview();
  });
  cv.addEventListener('pointerup', (e) => {
    if (rot) {
      rot = null;
      if (e.button === 2 && downAt && !downAt.moved) { if (draw) { cancelDraw(); renderHint(); } else if (tool !== 'info') setTool('info'); }
    }
    if (grab) { grab = null; cv.style.cursor = 'grab'; if (downAt && !downAt.moved) { const t = view.pick(e.clientX, e.clientY); if (t) showInfo(t); } }
    if (drag) commitDrag();
    else if (e.button === 0 && isDrawTool() && downAt && downAt.moved && downAt.started && draw) { hover = view.pick(e.clientX, e.clientY); drawClick(true); } // kéo-thả = điểm đầu + điểm cuối
    downAt = null;
  });
  cv.addEventListener('pointercancel', () => { rot = grab = drag = null; view.setPreview(null); });
  cv.addEventListener('pointerleave', () => { if (!drag && !draw) { hover = null; view.setPreview(null); view.setGhost(null); view.setMarker(null); } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom(Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0014)); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === ' ') { e.preventDefault(); setSpeed(speed ? 0 : updateHud.lastSpeed || 1); }
    else if (k === '1' || k === '2' || k === '3') setSpeed([1, 2, 4][+k - 1]);
    else if (k === 'escape') { if (drag) { drag = null; view.setPreview(null); renderHint(); } else if (draw) { cancelDraw(); renderHint(); } else setTool('info'); $('modal').classList.remove('show'); }
    else if (k === 'r') setTool(GROUPS[1].last || 'road:small');
    else if (k === 'b') setTool('bulldoze');
    else if (k === 'c' && group === 'road') { roadMode = roadMode === 'curve' ? 'line' : 'curve'; cancelDraw(); refreshToolbar(); renderHint(); }
    else if (k === 'g') { gridSnap = !gridSnap; refreshToolbar(); toast(gridSnap ? 'Bám lưới: bật' : 'Bám lưới: tắt (vẽ tự do)'); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', () => view.resize());
}

function openSide(id) {
  for (const p of ['budget', 'saves']) $(p).classList.toggle('show', p === id && !$(p).classList.contains('show'));
  if (id === 'saves') renderSlots();
  if (id === 'budget') { renderLoans.sig = ''; updateHud(true); }
}

function bindUi() {
  for (const b of $('speed').children) b.addEventListener('click', () => setSpeed(+b.dataset.s));
  $('bBudget').addEventListener('click', () => openSide('budget'));
  $('bSave').addEventListener('click', () => openSide('saves'));
  $('bLayer').addEventListener('click', () => { layer = (layer + 1) % LAYERS.length; applyOverlay(); toast(LAYERS[layer][1]); $('bLayer').classList.toggle('on', layer > 0); });
  $('bHelp').addEventListener('click', () => $('modal').classList.add('show'));
  $('mStart').addEventListener('click', () => { $('modal').classList.remove('show'); try { localStorage.setItem(KEY + 'seen', '1'); } catch { /* bỏ qua */ } });
  const fresh = () => { startCity(S.newCity()); autosave(); $('over').classList.remove('show'); };
  $('bNew').addEventListener('click', () => { if (confirm('Bỏ thành phố hiện tại và bắt đầu vùng đất mới? (Các ô lưu vẫn giữ nguyên)')) fresh(); });
  $('oNew').addEventListener('click', fresh);
  $('oLoad').addEventListener('click', () => { $('saves').classList.add('show'); renderSlots(); });
  $('bExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.serialize(city))], { type: 'application/json' }), a = el('a');
    a.href = URL.createObjectURL(blob); a.download = `${city.name.replace(/[^\p{L}\p{N}]+/gu, '-') || 'pho-moi'}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('bImport').addEventListener('click', () => $('fImport').click());
  $('fImport').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { startCity(S.deserialize(JSON.parse(await f.text()))); toast('Đã nhập thành phố từ file'); $('over').classList.remove('show'); } catch (err) { toast('File không hợp lệ: ' + err.message); }
  });
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('.side').classList.remove('show'));
  for (const [id, k] of [['taxR', 'r'], ['taxC', 'c'], ['taxI', 'i']]) $(id).addEventListener('input', (e) => { city.tax[k] = +e.target.value; S.recalc(city); updateHud(true); });
  $('cityname').addEventListener('change', (e) => { city.name = e.target.value.trim() || 'Phố Mới'; e.target.value = city.name; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });
  window.addEventListener('pagehide', () => autosave());
}

function startCity(c) {
  city = c; window.__city = c;
  view.setCity(c);
  $('cityname').value = c.name; $('taxR').value = c.tax.r; $('taxC').value = c.tax.c; $('taxI').value = c.tax.i;
  acc = 0; updateHud.key = null; renderLoans.sig = '';
  tool = 'info'; group = 'info';
  buildToolbar(); setTool('info'); updateHud(true);
  $('over').classList.toggle('show', !!c.over);
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
    } else if (ev.type === 'fire') toast(`🔥 Một ${['', 'căn nhà', 'cửa hàng', 'nhà xưởng'][ev.zone]} cháy rụi vì nằm ngoài vùng cứu hoả`);
    else if (ev.type === 'loanPaid') toast('Đã trả xong một khoản vay');
    else if (ev.type === 'bankrupt') { $('over').classList.add('show'); setSpeed(0); }
  }
  if (n && city.day % 5 === 0) city.dirty.zones = true;
  view.update(dt, dt * speed);
  updateHud(false);
  if (now - lastSave > 20000) autosave();
  requestAnimationFrame(frame);
}

view = new View($('view'));
window.__view = view;
window.__newCity = (seed) => startCity(S.newCity(seed)); // tiện thử nghiệm: bản đồ theo seed cố định
bindUi();
if (!loadSlot('auto')) startCity(S.newCity());
bindInput();
let seen = false;
try { seen = !!localStorage.getItem(KEY + 'seen'); } catch { /* bỏ qua */ }
if (!seen) $('modal').classList.add('show');
requestAnimationFrame(frame);

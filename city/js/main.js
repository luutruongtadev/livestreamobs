// Phố Mới — khởi động, vòng lặp, chuột / bàn phím, giao diện.
import * as S from './sim.js';
import { View } from './render.js';

const KEY = 'phomoi.v2.';
const WEEK = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
const money = (n) => `${fmt(n)} ₫`;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// nhóm công cụ ở thanh dưới; nhóm có `tool` thì bấm là cầm luôn
const GROUPS = [
  { id: 'info', icon: '🖐️', label: 'Xem', tool: 'info' },
  { id: 'road', icon: '🛣️', label: 'Đường', items: ['road:small', 'road:large', 'road:oneway'] },
  { id: 'zone', icon: '🎨', label: 'Quy hoạch', items: ['zone:1', 'zone:4', 'zone:7', 'zone:2', 'zone:5', 'zone:6', 'zone:3', 'zone:0'] },
  { id: 'extract', icon: '⛏️', label: 'Khai thác', items: ['zone:8', 'zone:9', 'zone:12', 'zone:10', 'zone:11', 'silo', 'sawmill', 'fishmarket', 'smelter', 'refinery'] },
  { id: 'power', icon: '⚡', label: 'Điện', items: ['wind', 'solar', 'coal', 'nuclear', 'line:power'] },
  { id: 'water', icon: '💧', label: 'Nước', items: ['tower', 'pump', 'outlet', 'treat', 'line:pipe'] },
  { id: 'trash', icon: '🗑️', label: 'Rác', items: ['landfill', 'incinerator'] },
  { id: 'civic', icon: '🏛️', label: 'Dịch vụ', items: ['clinic', 'school', 'highschool', 'university', 'police', 'fire'] },
  { id: 'transit', icon: '🚌', label: 'Vận tải', items: ['transit:bus', 'transit:metro', 'parking', 'port'] },
  { id: 'park', icon: '🌳', label: 'Công viên', items: ['park', 'plaza', 'stadium', 'nightmarket', 'monument', 'museum', 'tvtower'] },
  { id: 'land', icon: '🧭', label: 'Đất, quận', items: ['buy', 'district:1', 'district:2', 'district:3', 'district:4', 'district:5', 'district:6', 'district:0'] },
  { id: 'tools', icon: '🛠️', label: 'Công cụ', items: ['move', 'bulldoze'] },
];
const ROAD_MODES = [['line', '📏', 'Thẳng'], ['curve', '↪️', 'Cong'], ['upgrade', '⬆️', 'Nâng cấp']];
const LAYERS = [['zones', 'Lớp xem: quy hoạch'], ['resource', 'Lớp xem: tài nguyên (xanh nhạt = đất màu mỡ, nâu = quặng, tím = dầu, xanh đậm = rừng)'], ['district', 'Lớp xem: các quận'], ['traffic', 'Lớp xem: giao thông (xanh = thoáng, đỏ = kẹt) và các tuyến xe buýt / metro'], ['value', 'Lớp xem: giá trị đất (xanh = cao)'], ['air', 'Lớp xem: ô nhiễm không khí'], ['ground', 'Lớp xem: ô nhiễm đất'], ['noise', 'Lớp xem: tiếng ồn'], ['waterpol', 'Lớp xem: ô nhiễm nước'], ['garbage', 'Lớp xem: rác tồn ở từng nhà (đỏ = chất đống)'], ['service', 'Lớp xem: vùng phủ dịch vụ công'], ['power', 'Lớp xem: điện (xanh = đủ, cam = thiếu, đỏ = không có)'], ['water', 'Lớp xem: nước và thoát nước, hiện cả ống ngầm']];

let city, view, tool = 'info', group = 'info', speed = 1, layer = 0, hover = null, drag = null, lastSave = 0, hintOverride = null;
let roadMode = 'line', gridSnap = true, elevMode = false, moving = null, draw = null; // draw: { a, ctrl } khi đang vẽ đường / dây, { stops } khi vẽ tuyến
const keys = new Set();

/** Mô tả một công cụ theo id. */
function toolInfo(id) {
  const [kind, arg] = id.split(':');
  if (id === 'info') return { kind: 'info', icon: '🖐️', label: 'Xem', desc: 'Kéo để di chuyển bản đồ, bấm vào nhà hoặc ô đất để xem thông tin' };
  if (id === 'move') return { kind: 'move', icon: '✋', label: 'Di chuyển', desc: 'Bấm vào công trình hoặc nút đường (ngã ba, ngã tư, đầu đường) để nhấc lên, bấm chỗ mới để đặt · dời công trình mất 10% giá xây, dời nút đường miễn phí · chuột phải để huỷ' };
  if (id === 'bulldoze') return { kind: 'bulldoze', icon: '🚜', label: 'San ủi', desc: 'Kéo để phá đường, nhà, cây, dây điện, ống nước và công trình' };
  if (id === 'buy') return { kind: 'buy', icon: '🏞️', label: 'Mua đất', desc: `Bấm vào một lô đất tối màu liền kề để mua · lô kế tiếp giá <b>${money(S.tileCost(city))}</b> · đang có ${[...city.owned].reduce((a, b) => a + b, 0)} / ${S.maxTiles(city)} lô được phép` };
  if (kind === 'district') {
    const d = +arg;
    return d ? { kind, district: d, icon: '🗂️', label: city.distName[d], dot: S.DISTRICTS[d][1], desc: `Kéo để gán ô đất vào <b>${city.distName[d]}</b> · đặt chính sách cho quận ở bảng 🗂️` } : { kind, district: 0, icon: '🧽', label: 'Bỏ quận', desc: 'Kéo để đưa ô đất ra khỏi quận' };
  }
  if (kind === 'road') { const d = S.ROADS[arg]; return { kind, type: arg, icon: d.icon, label: d.name.replace(/ \d làn/, ''), desc: `<b>${d.name}</b> · ${fmt(d.cost * S.T)} ₫ / ô, qua nước đắt gấp ${S.BRIDGE_MULT} · ${d.desc}` }; }
  if (kind === 'zone') {
    const z = S.ZDEF[+arg];
    if (!+arg) return { kind, zone: 0, icon: z.icon, label: 'Bỏ q.hoạch', desc: 'Kéo để bỏ quy hoạch (dỡ luôn nhà trong vùng)' };
    const cap = [z.res && `${z.res[0]}–${z.res[4]} dân`, z.jobs && `${z.jobs[0]}–${z.jobs[4]} chỗ làm`].filter(Boolean).join(', ');
    return { kind, zone: +arg, icon: z.icon, label: z.short, dot: z.color, locked: !S.zoneUnlocked(city, +arg), desc: `<b>${z.name}</b> · ${cap} mỗi ô · ${z.desc}${S.zoneUnlocked(city, +arg) ? '' : ` · 🔒 mở khi đạt ${fmt(z.unlock)} dân`}` };
  }
  if (kind === 'transit') { const d = S.TRANSIT[arg]; return { kind, mode: arg, icon: d.icon, label: d.name.replace('Tuyến ', ''), locked: arg === 'metro' && !S.metroUnlocked(city), desc: `<b>${d.name}</b> · trạm ${money(d.stopCost)}, xe ${money(d.vehCost)}${d.trackCost ? `, ray ${fmt(d.trackCost * S.T)} ₫ / ô` : ''} · chở ${d.cap} khách · ${d.desc}${arg === 'metro' && !S.metroUnlocked(city) ? ` · 🔒 mở khi đạt ${fmt(d.unlock)} dân` : ''}` }; }
  if (kind === 'line') { const d = S.LINES[arg]; return { kind, line: arg, icon: d.icon, label: d.name, desc: `<b>${d.name}</b> · ${fmt(d.cost * S.T)} ₫ / ô · bấm điểm đầu rồi điểm cuối · ${d.desc}` }; }
  const d = S.SERVICES[id];
  const extra = [d.students && `${d.students} chỗ học`, d.trucks && `${d.trucks} xe`, d.ambulances && `${d.ambulances} xe cứu thương`, d.spots && `${d.spots} chỗ đỗ`, d.power && `⚡ ${d.power}`, d.water && `💧 ${d.water}`, d.sewage && `🕳️ ${d.sewage}`, d.trash && `🗑️ ${d.trash}`, d.radius && `bán kính ${d.radius} ô`].filter(Boolean).join(' · ');
  const lock = S.isUnlocked(city, id) ? '' : d.tech ? ` · 🔒 cần công nghệ "${S.TECH[d.tech].name}" (bảng 🔬)` : d.landmark ? ` · 🔒 ${d.landmark}` : ` · 🔒 mở khi đạt ${fmt(d.unlock)} dân`;
  return { kind: 'svc', svc: id, icon: d.icon, label: d.name, desc: `<b>${d.name}</b> (${d.size}×${d.size}) · ${money(d.cost)} · phí ${fmt(d.upkeep * S.RATE)} ₫/ngày${extra ? ' · ' + extra : ''} · ${d.desc}${lock}` };
}

// ───────────────────────── lưu / tải ─────────────────────────

function readSlot(name) {
  try { const raw = localStorage.getItem(KEY + name); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeSlot(name) {
  const data = { name: city.name, pop: city.stats.pop, day: city.day, at: Date.now(), city: S.serialize(city) };
  void 0;
  try { localStorage.setItem(KEY + name, JSON.stringify(data)); return true; } catch (e) { toast('Không lưu được: ' + e.message); return false; }
}
function autosave() { if (city && !city.over) writeSlot('auto'); lastSave = performance.now(); }
function loadSlot(name) {
  const d = readSlot(name);
  if (!d) return false;
  try { startCity(S.deserialize(d.city)); return true; } catch (e) { toast('Không đọc được bản lưu: ' + e.message); return false; }
}
function dateText(hour) { const day = Math.floor(hour / 24); return `Ngày ${day + 1} · ${WEEK[day % 7]} · ${String(hour % 24).padStart(2, '0')}:00`; }

function renderSlots() {
  const box = $('slots'); box.textContent = '';
  for (const [name, label] of [['auto', 'Tự lưu'], ['slot1', 'Ô lưu 1'], ['slot2', 'Ô lưu 2'], ['slot3', 'Ô lưu 3']]) {
    const d = readSlot(name), row = el('div', 'slot'), info = el('div');
    info.append(el('b', null, label), el('small', null, d ? `${d.name} · ${fmt(d.pop)} dân · ngày ${d.day + 1}` : 'Trống'));
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
  if (t.locked) b.classList.add('locked');
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
    const eb = el('button', 'tool mode'); eb.dataset.mode = 'elev'; eb.append(el('span', null, '🌉'), el('small', null, 'Cầu vượt'));
    eb.addEventListener('click', () => { elevMode = !elevMode; cancelDraw(); refreshToolbar(); renderHint(); });
    box.append(gb, eb);
  }
  refreshToolbar();
}

function refreshToolbar() {
  for (const b of $('tools').children) { const g = GROUPS.find((x) => x.id === b.dataset.group); b.classList.toggle('on', !!g.tool && g.tool === tool); b.classList.toggle('open', !g.tool && g.id === group); }
  for (const b of $('sub').children) {
    if (b.dataset.tool) { b.classList.toggle('on', b.dataset.tool === tool); b.classList.toggle('locked', S.SERVICES[b.dataset.tool] ? !S.isUnlocked(city, b.dataset.tool) : !!toolInfo(b.dataset.tool).locked); }
    if (b.dataset.mode) b.classList.toggle('on', b.dataset.mode === 'grid' ? gridSnap : b.dataset.mode === 'elev' ? elevMode : b.dataset.mode === roadMode);
  }
}

function setTool(id) {
  tool = id; drag = null; draw = null; moving = null;
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
  const t = toolInfo(tool), zoning = t.kind === 'zone' && !(t.zone && S.ZDEF[t.zone].need);
  const mode = t.kind === 'zone' && !zoning ? 'resource' : t.kind === 'district' ? 'district' : zoning ? 'zones' : t.line === 'pipe' || group === 'water' ? 'water' : t.line === 'power' || group === 'power' ? 'power' : LAYERS[layer][0];
  view.setOverlay(mode, zoning, tool !== 'info' && t.kind !== 'road' && t.kind !== 'line' && t.kind !== 'transit');
  view.setRoutesVisible(t.kind === 'transit' || group === 'transit' || mode === 'traffic');
}

function renderHint(text) {
  let base = toolInfo(tool).desc;
  if (toolInfo(tool).kind === 'transit' && draw) base = `Đã đặt <b>${draw.stops.length} trạm</b> · bấm tiếp để thêm trạm, <b>chuột phải</b> hoặc <b>Enter</b> để chốt tuyến, Esc để bỏ`;
  if (toolInfo(tool).kind === 'road' && elevMode && roadMode !== 'upgrade') base += ` · <b>🌉 Cầu vượt</b>: đường lên cao giữa hai đầu, đi qua trên đường khác, sông, thung lũng mà không tạo nút giao; dài từ ${S.MIN_ELEV_LEN / S.T} ô, giá gấp ${S.ELEV_MULT}`;
  if (toolInfo(tool).kind === 'road') base += roadMode === 'line' ? ' · <b>Thẳng</b>: bấm điểm đầu, bấm điểm cuối' : roadMode === 'curve' ? ' · <b>Cong</b>: bấm điểm đầu, điểm uốn, điểm cuối' : ' · <b>Nâng cấp</b>: bấm vào đoạn đường để đổi sang loại này';
  $('hint').innerHTML = text || hintOverride || base;
}

// ───────────────────────── vẽ đường, dây, quy hoạch ─────────────────────────

function rectTiles(a, b) {
  const out = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push([x, y]);
  return out;
}

function cancelDraw() { draw = null; moving = null; view.setRibbon(null); view.setMarker(null); view.setGhost(null); view.setPreview(null); }

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

/** Vị trí trạm tại con trỏ: xe buýt bám vào đường gần nhất, metro đặt tự do. */
function transitPoint(mode) {
  if (!hover) return null;
  if (mode === 'metro') return { x: S.cellCenter(hover.x), z: S.cellCenter(hover.y), ok: true };
  const e = S.edgeAt(city, hover.wx, hover.wz, 7);
  if (!e) return { x: hover.wx, z: hover.wz, ok: false };
  const r = S.nearestOnEdge(e, hover.wx, hover.wz);
  return { x: r.x, z: r.z, ok: true };
}

function finishTransit() {
  const t = toolInfo(tool);
  if (t.kind !== 'transit' || !draw) return false;
  const r = S.addTransit(city, t.mode, draw.stops);
  if (!r.ok) { toast(r.reason); return true; }
  toast(`Đã mở ${S.TRANSIT[t.mode].name.toLowerCase()} ${draw.stops.length} trạm · thêm xe, chỉnh giá vé ở bảng 👥`);
  draw = null; view.setRibbon(null); renderHint(); updateHud(true); renderCity(true);
  return true;
}

/** Cập nhật phần xem trước theo công cụ đang cầm. */
/** Ô / điểm đặt mới khi đang dời nút đường: bám tâm ô nếu bật bám lưới. */
const movePoint = () => (gridSnap ? { x: S.cellCenter(hover.x), z: S.cellCenter(hover.y) } : { x: hover.wx, z: hover.wz });

function updatePreview() {
  const t = toolInfo(tool);
  if (t.kind === 'info') return;
  if (t.kind === 'move') {
    view.setRibbon(null);
    if (!hover) { view.setMarker(null); view.setGhost(null); view.setPreview(null); return; }
    if (!moving) {
      const i = hover.y * S.N + hover.x, nd = S.nodeAt(city, hover.wx, hover.wz, 8);
      view.setGhost(null);
      if (nd) { view.setPreview(null); view.setMarker(nd, true); renderHint('Bấm để nhấc <b>nút đường</b> này lên'); return; }
      view.setMarker(null);
      if (city.occ[i]) {
        const sv = city.services[city.occ[i] - 1], d = S.SERVICES[sv.type];
        view.setPreview(rectTiles({ x: sv.x, y: sv.y }, { x: sv.x + d.size - 1, y: sv.y + d.size - 1 }), 0xffc24a);
        renderHint(`Bấm để nhấc <b>${d.name}</b> lên · phí dời ${money(S.moveFee(sv.type))}`);
        return;
      }
      view.setPreview(null); renderHint();
      return;
    }
    if (moving.kind === 'svc') {
      const sv = city.services[moving.k], r = S.moveService(city, moving.k, hover.x, hover.y, true), fp = r.fp || S.footprint(sv.type, hover.x, hover.y);
      view.setGhost(sv.type, fp, r.ok);
      view.setPreview(rectTiles({ x: fp.x, y: fp.y }, { x: fp.x + fp.size - 1, y: fp.y + fp.size - 1 }), r.ok ? 0x62d98b : 0xff5b4a);
      renderHint(r.ok ? `Bấm để đặt <b>${S.SERVICES[sv.type].name}</b> ở đây · ${money(r.fee)} · chuột phải để huỷ` : `<b>${r.reason}</b>`);
    } else {
      const pt = movePoint(), r = S.moveNode(city, moving.id, pt.x, pt.z, true), n = city.nodes.get(moving.id);
      view.setMarker(pt, r.ok);
      view.setRibbon(n ? new Float32Array([n.x, n.z, pt.x, pt.z]) : null, 0.5, r.ok ? 0x62d98b : 0xff5b4a);
      renderHint(r.ok ? 'Bấm để đặt nút đường ở đây · các đoạn nối vào sẽ uốn theo · chuột phải để huỷ' : `<b>${r.reason}</b>`);
    }
    return;
  }
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
    const plan = S.planRoad(city, { a: draw.a, b: sp, ctrl: draw.ctrl, type: t.type, elev: elevMode });
    draw.plan = plan; draw.b = sp;
    view.setRibbon(plan.pts, S.ROADS[t.type].w / 2, plan.ok ? 0xffffff : 0xff5b4a, elevMode);
    renderHint(`${elevMode ? '🌉 Cầu vượt · ' : ''}${S.ROADS[t.type].name}: <b>${(plan.len / S.T).toFixed(1)} ô</b> · ${money(plan.cost)}${plan.ok ? '' : ` · <b>${plan.reason}</b>`}`);
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
  if (t.kind === 'transit') {
    const p = transitPoint(t.mode);
    if (!p) { view.setMarker(null); return; }
    view.setMarker(p, p.ok);
    const pts = [...(draw ? draw.stops : []), p], flat = new Float32Array(pts.length * 2);
    pts.forEach((q, k) => { flat[k * 2] = q.x; flat[k * 2 + 1] = q.z; });
    view.setRibbon(pts.length > 1 ? flat : null, 1.1, p.ok ? 0xffe680 : 0xff5b4a);
    if (draw) { const plan = S.planTransit(city, t.mode, pts); renderHint(`${S.TRANSIT[t.mode].name}: <b>${pts.length} trạm</b> · ${money(plan.cost)}${plan.ok ? ' · chuột phải / Enter để chốt' : ` · <b>${plan.reason}</b>`}`); } else renderHint(p.ok ? null : '<b>Trạm xe buýt phải nằm trên đường</b>');
    return;
  }
  // quy hoạch, san ủi: kéo hình chữ nhật
  if (!hover && !drag) { view.setPreview(null); return; }
  const a = drag ? drag.from : hover, b = hover || drag.to || a;
  if (drag) drag.to = b;
  const tiles = rectTiles(a, b);
  if (t.kind === 'buy') {
    if (!hover) { view.setPreview(null); return; }
    const tx = (hover.x / S.TILE) | 0, ty = (hover.y / S.TILE) | 0, r = S.canBuyTile(city, ty * S.TILES + tx);
    view.setPreview(rectTiles({ x: tx * S.TILE, y: ty * S.TILE }, { x: tx * S.TILE + S.TILE - 1, y: ty * S.TILE + S.TILE - 1 }), r.ok ? 0x62d98b : 0xff5b4a);
    renderHint(r.ok ? `Mua lô đất này: <b>${money(r.cost)}</b>` : `<b>${r.reason}</b>`);
    return;
  }
  if (t.kind === 'district') { view.setPreview(tiles, t.district ? S.DISTRICTS[t.district][1] : '#cfd6dc'); if (drag) renderHint(`${t.label}: <b>${Math.abs(a.x - b.x) + 1} × ${Math.abs(a.y - b.y) + 1} ô</b>`); return; }
  if (t.kind === 'bulldoze') view.setPreview(tiles, 0xff5b4a);
  else view.setPreview(t.zone ? tiles.filter(([x, y]) => city.acc[y * S.N + x] && S.zoneFits(city, t.zone, y * S.N + x)) : tiles, S.ZDEF[t.zone].color);
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
    const r = S.buildRoad(city, { a: draw.a, b: sp, ctrl: draw.ctrl, type: t.type, elev: elevMode });
    if (!r.ok) { if (!fromDrag || r.reason !== 'Đoạn quá ngắn') toast(r.reason); if (fromDrag) return; }
    else draw = { a: { x: sp.x, z: sp.z, node: r.endNode } }; // vẽ nối tiếp từ điểm cuối
    updatePreview(); updateHud(true);
    return;
  }
  if (t.kind === 'transit') {
    if (fromDrag) return;
    const p = transitPoint(t.mode);
    if (!p || !p.ok) return;
    if (t.locked) { toast(`Metro mở khoá khi đạt ${fmt(S.TRANSIT.metro.unlock)} dân`); return; }
    if (!draw) draw = { stops: [] };
    const last = draw.stops[draw.stops.length - 1];
    if (last && Math.hypot(last.x - p.x, last.z - p.z) < 25) { toast('Hai trạm quá gần nhau'); return; }
    draw.stops.push({ x: p.x, z: p.z });
    updatePreview();
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

/** Công cụ di chuyển: lần bấm đầu nhấc công trình / nút đường lên, lần sau đặt xuống. */
function moveClick() {
  if (!hover) return;
  if (!moving) {
    const nd = S.nodeAt(city, hover.wx, hover.wz, 8), i = hover.y * S.N + hover.x;
    if (nd) moving = { kind: 'node', id: nd.id };
    else if (city.occ[i]) moving = { kind: 'svc', k: city.occ[i] - 1 };
    updatePreview();
    return;
  }
  let r;
  if (moving.kind === 'svc') { r = S.moveService(city, moving.k, hover.x, hover.y); if (r.ok) toast(`Đã dời công trình · ${money(r.fee)}`); }
  else { const pt = movePoint(); r = S.moveNode(city, moving.id, pt.x, pt.z); if (r.ok) toast('Đã dời nút đường'); }
  if (!r.ok) { toast(r.reason); return; }
  moving = null; view.setGhost(null); view.setPreview(null); view.setMarker(null); view.setRibbon(null);
  updatePreview(); updateHud(true);
}

function commitDrag() {
  if (!drag) return;
  const a = drag.from, b = drag.to || a, t = toolInfo(tool);
  drag = null;
  const r = t.kind === 'bulldoze' ? S.bulldozeRect(city, a.x, a.y, b.x, b.y) : t.kind === 'district' ? S.districtRect(city, a.x, a.y, b.x, b.y, t.district) : S.zoneRect(city, a.x, a.y, b.x, b.y, t.zone);
  if (r && !r.ok && r.reason) toast(r.reason);
  renderHint(); updatePreview(); updateHud(true);
}

// ───────────────────────── bảng thông tin ─────────────────────────

const face = (h) => (h >= 65 ? '😊' : h >= 45 ? '😐' : '😟');

function showInfo(tile) {
  const i = tile.y * S.N + tile.x, c = city, rows = [];
  let title = 'Ô đất', needs = null, mods = null;
  const add = (k, v) => rows.push(`<div class="row"><span>${k}</span><span>${v}</span></div>`);
  const state = (v) => ['✖ không có', '✔ đủ', '⚠ thiếu'][v];
  const edge = S.edgeAt(c, tile.wx, tile.wz, 0);
  if (c.occ[i]) {
    const sv = c.services[c.occ[i] - 1], d = S.SERVICES[sv.type];
    title = `${d.icon} ${d.name}`;
    add('Phí duy trì', `${fmt(d.upkeep * S.RATE)} ₫/ngày`);
    const val = (k) => S.svcVal(c, sv, k);
    if (d.power) add('Công suất điện', val('power'));
    if (d.water) add('Công suất nước', val('water'));
    if (d.sewage) add('Nhận nước thải', val('sewage'));
    if (d.trash) add('Rác xử lý hôm nay', `${fmt(sv.processed || 0)} / ${val('trash')}`);
    if (d.students) add('Học sinh', `${sv.used || 0} / ${val('students')}`);
    if (d.trucks || d.ambulances) add('Xe đang đi làm nhiệm vụ', `${sv.out || 0} / ${val('trucks') || val('ambulances')}`);
    if (d.spots) add('Xe đang đỗ', `${sv.cell >= 0 ? c.parked[sv.cell] : 0} / ${val('spots')}`);
    if (d.radius) add('Bán kính phục vụ', `${val('radius')} ô`);
    if (d.boost) add('Tăng sản lượng cho', S.RAW[d.boost].name.toLowerCase());
    mods = { k: c.occ[i] - 1, sv };
    if (d.power || d.water || d.sewage) add('Nối mạng', sv.linked ? '✔ đã nối' : '✖ chưa, kéo dây / ống tới đường');
  } else if (edge) {
    const d = S.ROADS[edge.type], load = S.edgeLoad(c, edge);
    title = `${d.icon} ${d.name}`;
    add('Chiều dài', `${(edge.len / S.T).toFixed(1)} ô`);
    add('Bảo trì', `${fmt(edge.len * d.upkeep * S.RATE)} ₫/ngày`);
    add('Mức đông xe', load > 0.7 ? '🔴 kẹt' : load > 0.35 ? '🟡 đông' : '🟢 thoáng');
    add('Nút giao hai đầu', [edge.a, edge.b].map((n) => `${c.adj.get(n).length} nhánh${c.traffic.signals.has(n) ? ' 🚦' : ''}`).join(' · '));
  } else if (c.water[i]) { title = '🌊 Mặt nước'; add('Ô nhiễm nước', `${Math.round(c.waterPol[i] * 100)}%`); }
  else {
    const z = c.zone[i], L = c.level[i], zd = S.ZDEF[z];
    const kind = S.bizKind(c, i);
    title = L ? `${zd.icon} ${{ raw: 'Cơ sở khai thác nguyên liệu', factory: 'Nhà máy chế biến' }[kind] || zd.name} cấp ${L}` : z ? zd.name : c.acc[i] ? 'Ô đất cạnh đường' : 'Đất trống';
    if (L) {
      const h = S.cellHappy(c, i), rc = S.resCap(z, L), jb = S.jobCap(z, L);
      if (rc) {
        add('Cư dân', `${c.resCount[i]} / ${rc}`);
        let hs = 0, n = 0, edu = 0, kids = 0;
        for (let id = 0; id < c.pp.n; id++) if (c.pp.alive[id] && c.pp.home[id] === i) { hs += c.pp.happy[id]; n++; if (c.pp.age[id] < 18) kids++; else edu += c.pp.edu[id]; }
        if (n) { add('Hài lòng', `${face(hs / n)} ${Math.round(hs / n)}%`); add('Trẻ em · học vấn TB', `${kids} · ${n - kids ? S.EDU_NAME[Math.round(edu / (n - kids))] : '–'}`); }
        add('Tiền thuê', `${S.rentAt(c, i).toFixed(1)} ₫/ngày mỗi người lớn`);
      }
      if (jb) {
        const b = c.biz;
        add('Nhân viên', `${c.staff[i]} / ${jb} (đang có mặt ${c.present[i]})`);
        add('Lương · yêu cầu', `${S.wageAt(c, i).toFixed(2)} ₫/giờ · ${S.EDU_NAME[S.reqEdu(z, L)].toLowerCase()}`);
        add('Tiền của doanh nghiệp', `<span class="${b.money[i] < 0 ? 'neg' : ''}">${fmt(b.money[i])} ₫</span>`);
        if (kind === 'factory' || kind === 'shop') add(kind === 'shop' ? 'Hàng trong kho' : 'Nguyên liệu trong kho', `${b.sin[i].toFixed(1)}${b.incoming[i] ? ' · 🚚 xe hàng đang tới' : ''}`);
        if (kind === 'factory' || kind === 'raw') add('Thành phẩm chờ xuất', b.sout[i].toFixed(1));
        add('Hiệu quả', `${Math.round(b.eff[i] * 100)}%`);
        add('Chỗ đỗ xe', `${c.parked[i]} xe`);
      }
      const hint = S.levelHint(c, i);
      if (hint) add('Lên cấp cần', hint);
      needs = h.needs;
      if (jb && c.staff[i] < jb * 0.5) needs = [...needs, 'Thiếu người làm'];
      if (c.fire[i]) needs = ['🔥 Đang cháy!', ...needs];
    } else if (z) add('Tình trạng', !c.acc[i] ? 'Không còn cạnh đường' : c.pOk[i] !== 1 ? 'Chờ có điện' : c.wOk[i] !== 1 ? 'Chờ có nước' : c.sOk[i] !== 1 ? 'Chờ có chỗ xả nước thải' : 'Chờ có nhu cầu');
    else if (!c.acc[i]) add('Quy hoạch', 'Phải nằm trong 2 ô cạnh đường');
    if (c.tree[i]) add('Cây xanh', 'Có');
    if (c.res[i]) add('Tài nguyên', S.RES_NAME[c.res[i]]);
    if (c.steep[i]) add('Địa hình', 'Quá dốc, không xây được');
    if (c.district[i]) add('Quận', c.distName[c.district[i]]);
    if (!S.ownedCell(c, i)) add('Đất', 'Chưa thuộc thành phố');
  }
  if (!c.water[i] && !edge) {
    if (c.acc[i]) { add('Điện · nước · thoát nước', [c.pOk[i], c.wOk[i], c.sOk[i]].map((v) => state(v).slice(0, 1)).join(' · ')); }
    add('Giá trị đất', `${Math.round(c.landValue[i])} / 100`);
    add('Ô nhiễm khí · đất · ồn', `${Math.round(c.air[i] * 100)}% · ${Math.round(c.ground[i] * 100)}% · ${Math.round(c.noise[i] * 100)}%`);
    if (c.level[i]) add('Rác tồn', c.garbage[i].toFixed(0));
    const cv = c.cover, tag = (v) => (v > 0.05 ? '✔' : '–');
    add('Công viên · Y tế · Trường', `${tag(cv.park[i])} · ${tag(cv.health[i])} · ${tag(cv.edu[i])}`);
    add('Công an · Cứu hoả', `${tag(cv.police[i])} · ${tag(cv.fire[i])}`);
  }
  $('iTitle').textContent = title; $('iBody').innerHTML = rows.join('');
  if (needs) {
    const ul = el('ul', 'needs');
    if (!needs.length) ul.append(el('li', 'ok', '✔ Không thiếu gì'));
    for (const n of needs) ul.append(el('li', null, `✖ ${n}`));
    $('iBody').append(ul);
  }
  if (mods) for (const m of S.MODS[mods.sv.type] || []) {
    const have = (mods.sv.mods && mods.sv.mods[m.id]) || 0, r = el('div', 'slot'), info = el('div'), b = el('button', 'mini acc', 'Xây');
    info.append(el('b', null, `${m.name} (${have}/${m.max})`), el('small', null, `${money(m.cost)} · phí ${fmt(m.upkeep * S.RATE)} ₫/ngày · ${Object.entries(m.add).map(([k, v]) => `+${v} ${{ students: 'chỗ học', trucks: 'xe', ambulances: 'xe cứu thương', radius: 'ô bán kính', power: 'điện', water: 'nước', sewage: 'nước thải', spots: 'chỗ đỗ', trash: 'rác' }[k] || k}`).join(', ')}`));
    b.disabled = have >= m.max;
    b.addEventListener('click', () => { const res = S.addModule(city, mods.k, m.id); if (!res.ok) toast(res.reason); else toast(`Đã xây ${m.name.toLowerCase()}`); showInfo(tile); updateHud(true); });
    r.append(info, b); $('iBody').append(r);
  }
  $('info').classList.add('show');
}

/** Bảng 🔬 cây công nghệ. */
function renderTech() {
  if (!$('tech').classList.contains('show')) return;
  const box = $('tBody'); box.textContent = '';
  $('tPoints').textContent = `${city.points} điểm phát triển`;
  let branch = '';
  for (const [id, t] of Object.entries(S.TECH)) {
    if (t.branch !== branch) { branch = t.branch; box.append(el('h4', null, branch)); }
    const have = !!city.tech[id], can = S.canResearch(city, id), r = el('div', 'slot'), info = el('div'), b = el('button', `mini${can.ok ? ' acc' : ''}`, have ? '✔' : `${t.cost} đ`);
    info.append(el('b', null, t.name), el('small', null, `${t.desc}${t.req && !city.tech[t.req] ? ` · cần "${S.TECH[t.req].name}"` : ''}`));
    info.querySelector('small').style.whiteSpace = 'normal';
    b.disabled = !can.ok;
    b.addEventListener('click', () => { const res = S.research(city, id); if (!res.ok) toast(res.reason); else toast(`Đã có công nghệ: ${t.name}`); renderTech(); refreshToolbar(); updateHud(true); });
    r.append(info, b); box.append(r);
  }
}

/** Bảng 🗂️ quận và chính sách. */
function renderGov() {
  if (!$('gov').classList.contains('show')) return;
  const box = $('gBody'); box.textContent = '';
  const count = new Array(S.DISTRICTS.length).fill(0);
  for (let i = 0; i < S.N * S.N; i++) if (city.district[i] && city.level[i]) count[city.district[i]]++;
  for (let d = 1; d < S.DISTRICTS.length; d++) {
    const head = el('h4'), name = el('input'), dot = el('i', 'dot');
    dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:${S.DISTRICTS[d][1]}`;
    name.value = city.distName[d]; name.maxLength = 20; name.style.cssText = 'background:none;border:0;color:inherit;font:inherit;width:120px;outline:none;user-select:text;-webkit-user-select:text';
    name.addEventListener('change', () => { city.distName[d] = name.value.trim() || S.DISTRICTS[d][0]; buildSub(); });
    head.append(dot, name, el('span', null, ` · ${count[d]} toà nhà`)); box.append(head);
    for (const [k, pl] of Object.entries(S.POLICIES)) {
      const row = el('label', 'row'), cb = el('input');
      cb.type = 'checkbox'; cb.checked = !!city.policy[d][k];
      cb.addEventListener('change', () => { S.setPolicy(city, d, k, cb.checked); renderGov(); updateHud(true); });
      const txt = el('span', null, `${pl.name}${pl.cost ? ` · ${fmt(pl.cost * S.RATE)} ₫/nhà/ngày` : pl.flat ? ` · ${fmt(pl.flat * S.RATE)} ₫/ngày` : ''}`);
      txt.title = pl.desc; row.title = pl.desc;
      row.append(txt, cb); box.append(row);
    }
  }
}

// ───────────────────────── HUD ─────────────────────────

function renderLoans() {
  const box = $('loans'), c = city, sig = c.loans.map((l) => Math.ceil(l.left)).join(',') + '|' + c.loans.length;
  if (renderLoans.sig === sig && box.childElementCount) return;
  renderLoans.sig = sig; box.textContent = '';
  c.loans.forEach((l) => { const r = el('div', 'row'); r.append(el('span', null, `Đang nợ ${money(l.amount)}`), el('span', null, `−${fmt(l.daily)} × ${Math.ceil(l.left)} ngày`)); box.append(r); });
  S.LOANS.forEach((l, k) => {
    const r = el('div', 'row'), b = el('button', 'mini', 'Vay');
    b.disabled = c.loans.length >= S.MAX_LOANS;
    b.addEventListener('click', () => { const res = S.takeLoan(city, k); if (res.ok) toast(`Đã vay ${money(l.amount)}`); else toast(res.reason); renderLoans.sig = ''; updateHud(true); });
    r.append(el('span', null, `${money(l.amount)} · ${l.days} ngày · lãi ${Math.round(l.rate * 100)}%`), b); box.append(r);
  });
}

/** Bảng 👥: dân cư, việc làm, đi lại, doanh nghiệp, tuyến giao thông công cộng. */
function renderCity(force) {
  if (!$('people').classList.contains('show')) return;
  const c = city, ps = c.pstats, s = c.stats, last = c.econ.last || {}, mode = last.mode || ps.mode, box = $('pBody');
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  const adults = ps.edu.reduce((a, b) => a + b, 0), trips = mode.car + mode.bus + mode.metro + mode.walk;
  const row = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
  box.innerHTML = [
    row('Trẻ em · lao động · người già', `${fmt(ps.kids)} · ${fmt(ps.adults)} · ${fmt(ps.seniors)}`),
    row('Có việc / trong tuổi lao động', `${fmt(ps.employed)} / ${fmt(ps.workers)}`),
    row('Việc còn trống · thất nghiệp', `${fmt(s.vacJobs)} · ${fmt(s.unemployed)}`),
    row('Nhà ở: đang ở / sức chứa', `${fmt(ps.pop - ps.homeless)} / ${fmt(s.housing)}`),
    row('Vô gia cư · đang ốm', `${fmt(ps.homeless)} · ${fmt(ps.sick)}`),
    row('Hôm qua: sinh · mất · bỏ đi', `${last.born || 0} · ${last.died || 0} · ${last.movedOut || 0}`),
    '<h4>Học vấn người lớn</h4>',
    row('Chưa học · tiểu học', `${pct(ps.edu[0], adults)} · ${pct(ps.edu[1], adults)}`),
    row('Trung học · đại học', `${pct(ps.edu[2], adults)} · ${pct(ps.edu[3], adults)}`),
    row('Đang đi học', fmt(ps.students || 0)),
    '<h4>Đi lại (hôm qua)</h4>',
    row('Xe riêng · xe buýt · metro · đi bộ', `${pct(mode.car, trips)} · ${pct(mode.bus, trips)} · ${pct(mode.metro, trips)} · ${pct(mode.walk, trips)}`),
    row('Thời gian đi làm trung bình', ps.commute ? `${ps.commute.toFixed(1)} giờ` : '–'),
    row('Tốc độ xe so với đường thoáng', `${Math.round(c.traffic.speedEma * 100)}%`),
    row('Xe đang chạy · xe phải tìm chỗ đỗ', `${c.traffic.vehicles.length} · ${last.parkSearch || 0}`),
    '<h4>Doanh nghiệp</h4>',
    row('Số doanh nghiệp · hiệu quả TB', `${fmt(s.companies)} · ${Math.round(ps.eff * 100)}%`),
    row('Việc: thương mại · công nghiệp · văn phòng', `${fmt(s.jobsBy.c)} · ${fmt(s.jobsBy.i)} · ${fmt(s.jobsBy.o)}`),
    row('Hôm qua: nhập · xuất (đơn vị hàng)', `${fmt(last.imports || 0)} · ${fmt(last.exports || 0)}`),
    row('Phá sản hôm qua · tổng cộng', `${last.bankrupt || 0} · ${c.econ.bankrupt}`),
    row('Cửa ngõ ra ngoài', S.outsidePositions(c).length ? `${S.outsidePositions(c).length} (cao tốc / cảng)` : '<span class="neg">✖ mất kết nối</span>'),
  ].join('');
  // tuyến giao thông công cộng: chỉ dựng lại khi danh sách đổi để nút bấm không bị giật
  const tr = c.transit, sig = tr.lines.map((l) => `${l.id}:${l.count}:${l.broken ? 1 : 0}:${l.ridersDay}`).join('|');
  if (!force && sig === renderCity.sig) return;
  renderCity.sig = sig;
  const lb = $('pLines'); lb.textContent = '';
  if (!tr.lines.length) lb.append(el('div', 'row', 'Chưa có tuyến nào. Mở nhóm 🚌 Vận tải để vẽ tuyến.'));
  for (const l of tr.lines) {
    const d = S.TRANSIT[l.mode], r = el('div', 'slot'), info = el('div');
    info.append(el('b', null, `${d.icon} Tuyến ${l.id}${l.broken ? ' ⚠ đứt tuyến' : ''}`), el('small', null, `${l.stops.length} trạm · ${l.count} xe · ${fmt(l.ridersDay || 0)} khách hôm qua`));
    const minus = el('button', 'mini', '−'), plus = el('button', 'mini', '+'), del = el('button', 'mini', '🗑');
    minus.addEventListener('click', () => { S.setVehicles(city, l.id, l.count - 1); renderCity(true); updateHud(true); });
    plus.addEventListener('click', () => { const res = S.setVehicles(city, l.id, l.count + 1); if (!res.ok && res.reason) toast(res.reason); renderCity(true); updateHud(true); });
    del.addEventListener('click', () => { S.removeTransit(city, l.id); renderCity(true); updateHud(true); });
    r.append(info, minus, plus, del); lb.append(r);
  }
  $('fareV').textContent = `${tr.fare} ₫ · ${fmt(tr.ridersDay || 0)} khách hôm qua`;
}

let hudAt = 0;
function updateHud(force) {
  const now = performance.now();
  if (!force && now - hudAt < 250) return;
  hudAt = now;
  const c = city, s = c.stats, ps = c.pstats, net = s.income - s.expense;
  $('pop').textContent = fmt(s.pop);
  $('jobs').textContent = `${fmt(s.employed)} / ${fmt(s.jobs)} việc làm`;
  $('money').textContent = money(c.money); $('money').className = c.money < 0 ? 'neg' : '';
  $('net').textContent = `${net >= 0 ? '+' : ''}${fmt(net)} / ngày`; $('net').className = `sub ${net >= 0 ? 'pos' : 'neg'}`;
  $('happy').textContent = s.pop ? `${face(s.happy)} ${Math.round(s.happy)}%` : '–';
  $('date').textContent = dateText(c.hour);
  $('rank').textContent = c.milestone ? S.MILESTONES[c.milestone - 1].name : 'Vùng đất mới';
  $('bTech').textContent = c.points ? `🔬 ${c.points}` : '🔬';
  for (const [id, v] of [['dr', c.demand.r], ['dc', c.demand.c], ['di', c.demand.i], ['do', c.demand.o]]) $(id).style.height = `${Math.max(3, Math.max(0, v) * 100)}%`;
  for (const b of $('speed').children) b.classList.toggle('on', +b.dataset.s === speed);
  // ngân sách
  $('taxRv').textContent = `${c.tax.r}% · +${fmt(s.inc.r)}`; $('taxCv').textContent = `${c.tax.c}% · +${fmt(s.inc.c)}`; $('taxIv').textContent = `${c.tax.i}% · +${fmt(s.inc.i)}`;
  $('bInc').textContent = `+${fmt(s.income)}`; $('bFare').textContent = `+${fmt(s.inc.t)}`;
  for (const [id, k] of [['eRoad', 'roads'], ['ePower', 'power'], ['eWater', 'water'], ['eTrash', 'trash'], ['ePark', 'park'], ['eCivic', 'civic'], ['eTransit', 'transit'], ['eExtract', 'extract'], ['ePolicy', 'policy'], ['eLoan', 'loans']]) $(id).textContent = `−${fmt(s.exp[k])}`;
  $('bNet').textContent = `${net >= 0 ? '+' : ''}${fmt(net)} ₫`; $('bNet').className = net >= 0 ? 'pos' : 'neg';
  const meter = (bar, txt, use, cap) => { $(txt).textContent = `${fmt(use)} / ${fmt(cap)}`; $(bar).style.width = `${cap ? Math.min(100, (use / cap) * 100) : use ? 100 : 0}%`; $(bar).classList.toggle('over', use >= cap && use > 0); };
  meter('pBar', 'pTxt', s.powerUse, s.powerCap); meter('wBar', 'wTxt', s.waterUse, s.waterCap); meter('sBar', 'sTxt', s.waterUse, s.sewCap); meter('tBar', 'tTxt', s.trashUse, s.trashCap);
  if ($('budget').classList.contains('show')) renderLoans();
  // cảnh báo / gợi ý
  const al = [], none = s.none || {}, tight = s.tight || {};
  let zoned = 0, free = 0, dirty = 0, burning = 0;
  for (let i = 0; i < S.N * S.N; i++) { if (c.zone[i]) { zoned++; if (S.ZDEF[c.zone[i]].res && !c.level[i] && c.acc[i]) free++; } if (c.level[i] && c.garbage[i] > S.garbageLimit(c.zone[i], c.level[i])) dirty++; if (c.fire[i]) burning++; }
  if (c.edges.size <= 1 && !zoned) al.push(['Chọn 🛣️ Đường, bấm vào cuối đoạn đường có sẵn rồi bấm điểm tiếp theo để mở phố']);
  else if (!zoned) al.push(['Chọn 🎨 Quy hoạch rồi tô khu 🏠 nhà ở lên các ô hai bên đường']);
  if (burning) al.push([`🔥 ${burning} toà nhà đang cháy`, 1]);
  if (none.p) al.push(['⚡ Khu đã quy hoạch chưa có điện: đặt tua-bin gió gần đường', 1]);
  else if (tight.p) al.push(['⚡ Hết điện dư: nhà ngừng mọc, xây thêm nguồn điện', 1]);
  if (none.w) al.push(['💧 Chưa có nước sạch: đặt một tháp nước gần đường', 1]);
  else if (tight.w) al.push(['💧 Hết nước dư: xây thêm tháp nước hoặc trạm bơm', 1]);
  if (!none.w && none.s) al.push(['🕳️ Chưa có chỗ xả nước thải: đặt cống xả sát bờ nước rồi nối ống tới đường', 1]);
  else if (tight.s) al.push(['🕳️ Cống xả quá tải: xây thêm cống hoặc nhà máy xử lý', 1]);
  const loose = c.services.filter((sv) => { const d = S.SERVICES[sv.type]; return (d.power || d.water || d.sewage) && !sv.linked; });
  if (loose.length) al.push([`${S.SERVICES[loose[0].type].icon} ${S.SERVICES[loose[0].type].name} chưa nối mạng: kéo ${S.SERVICES[loose[0].type].power ? 'dây điện' : 'ống nước'} từ nó tới đường`, 1]);
  if (s.noPower + s.noWater > 0) al.push([`${s.noPower + s.noWater} nhà đang thiếu điện nước, sắp bị bỏ hoang`, 1]);
  if (c.dirtyWater) al.push(['💧 Trạm bơm đang hút nước bẩn gần cống xả: dân dễ ốm', 1]);
  if (dirty > 3) al.push([`🗑️ ${dirty} nhà ngập rác: ${s.trashCap ? 'xe rác không kịp, xây thêm bãi rác hoặc gỡ kẹt xe' : 'xây một bãi rác'}`, 1]);
  if (!S.outsidePositions(c).length && s.companies) al.push(['🚚 Mất đường nối ra ngoài: không nhập, xuất được hàng', 1]);
  if (c.traffic.speedEma < 0.3 && c.traffic.vehicles.length > 60) al.push(['🚗 Kẹt xe nặng: mở thêm đường, nâng lên đại lộ hoặc mở tuyến xe buýt (lớp xem 🗺️ giao thông)', 1]);
  if (ps.homeless > 5) al.push([`${ps.homeless} người vô gia cư: quy hoạch thêm nhà ở`, 1]);
  if (ps.sick > Math.max(8, s.pop * 0.05)) al.push([`🏥 ${ps.sick} người đang ốm: thêm trạm y tế, giảm ô nhiễm`, 1]);
  if (s.pop > 60 && s.unemployed > s.workers * 0.15) al.push(['Thiếu việc làm: quy hoạch thêm 🏬 thương mại, 🏭 công nghiệp']);
  if (s.pop > 60 && s.vacJobs > s.workers * 0.25 + 20) al.push(['Doanh nghiệp thiếu người: quy hoạch thêm nhà ở, mở trường để có lao động trình độ']);
  if (s.pop > 60 && c.demand.c > 0.5) al.push(['Nhu cầu thương mại đang cao']);
  if (s.pop > 60 && c.demand.i > 0.5) al.push(['Nhu cầu công nghiệp đang cao']);
  if (c.demand.o > 0.5) al.push(['Nhu cầu văn phòng đang cao']);
  if (s.pop > 0 && c.demand.r > 0.3 && !free && !tight.p && !tight.w && !tight.s) al.push(['Hết đất ở trống cạnh đường: quy hoạch thêm']);
  if (c.money < 0) al.push([`Ngân sách âm: tăng thuế, bớt chi hoặc vay nợ ở 📊 (phá sản khi nợ quá ${fmt(-S.BANKRUPT_AT)} ₫ hoặc âm ${S.BANKRUPT_DAYS} ngày)`, 1]);
  if (!speed) al.push(['⏸ Đang tạm dừng']);
  const key = al.map((a) => a[0]).join('|');
  if (key !== updateHud.key) {
    updateHud.key = key;
    const box = $('alerts'); box.textContent = '';
    for (const [text, bad] of al.slice(0, 6)) box.append(el('div', `panel alert${bad ? ' bad' : ''}`, text));
  }
}

function setSpeed(v) { speed = v; if (v) updateHud.lastSpeed = v; updateHud(true); }

// ───────────────────────── chuột, bàn phím ─────────────────────────

function bindInput() {
  const cv = view.canvas;
  let rot = null, grab = null, downAt = null;
  const isDrawTool = () => { const k = toolInfo(tool).kind; return k === 'road' || k === 'line' || k === 'transit'; };
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    downAt = { x: e.clientX, y: e.clientY, moved: false };
    if (e.button === 2 || e.button === 1) { rot = { x: e.clientX, y: e.clientY }; return; }
    if (e.button !== 0) return;
    hover = view.pick(e.clientX, e.clientY);
    if (tool === 'info') { grab = view.groundPoint(e.clientX, e.clientY); cv.style.cursor = 'grabbing'; return; }
    if (!hover) return;
    if (tool === 'buy') {
      const r = S.buyTile(city, ((hover.y / S.TILE) | 0) * S.TILES + ((hover.x / S.TILE) | 0));
      if (r.ok) toast(`Đã mua thêm một lô đất · ${money(r.cost)}`); else toast(r.reason);
      hintOverride = null; updatePreview(); updateHud(true);
      return;
    }
    if (tool === 'move') { moveClick(); return; }
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
      if (e.button === 2 && downAt && !downAt.moved) { if (moving) { cancelDraw(); renderHint(); } else if (draw && draw.stops && draw.stops.length >= 2) finishTransit(); else if (draw) { cancelDraw(); renderHint(); } else if (tool !== 'info') setTool('info'); }
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
    else if (k === 'escape') { if (drag) { drag = null; view.setPreview(null); renderHint(); } else if (draw || moving) { cancelDraw(); renderHint(); } else setTool('info'); $('modal').classList.remove('show'); }
    else if (k === 'enter') finishTransit();
    else if (k === 'r') setTool(GROUPS[1].last || 'road:small');
    else if (k === 'b') setTool('bulldoze');
    else if (k === 'c' && group === 'road') { roadMode = roadMode === 'curve' ? 'line' : 'curve'; cancelDraw(); refreshToolbar(); renderHint(); }
    else if (k === 'm') setTool('move');
    else if (k === 'v' && group === 'road') { elevMode = !elevMode; cancelDraw(); refreshToolbar(); renderHint(); toast(elevMode ? 'Cầu vượt: bật' : 'Cầu vượt: tắt'); }
    else if (k === 'g') { gridSnap = !gridSnap; refreshToolbar(); toast(gridSnap ? 'Bám lưới: bật' : 'Bám lưới: tắt (vẽ tự do)'); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', () => view.resize());
}

function openSide(id) {
  for (const p of ['budget', 'saves', 'people', 'tech', 'gov']) $(p).classList.toggle('show', p === id && !$(p).classList.contains('show'));
  if (id === 'tech') renderTech();
  if (id === 'gov') renderGov();
  if (id === 'saves') renderSlots();
  if (id === 'people') renderCity(true);
  if (id === 'budget') { renderLoans.sig = ''; updateHud(true); }
}

function bindUi() {
  for (const b of $('speed').children) b.addEventListener('click', () => setSpeed(+b.dataset.s));
  $('bBudget').addEventListener('click', () => openSide('budget'));
  $('bSave').addEventListener('click', () => openSide('saves'));
  $('bCity').addEventListener('click', () => openSide('people'));
  $('bTech').addEventListener('click', () => openSide('tech'));
  $('bGov').addEventListener('click', () => openSide('gov'));
  $('fare').addEventListener('input', (e) => { city.transit.fare = +e.target.value; renderCity(true); });
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
  $('cityname').value = c.name; $('fare').value = c.transit.fare; $('taxR').value = c.tax.r; $('taxC').value = c.tax.c; $('taxI').value = c.tax.i;
  updateHud.key = null; renderLoans.sig = '';
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

  const hourBefore = city.hour;
  S.advance(city, dt * speed);
  const n = city.hour - hourBefore;
  for (const ev of city.events.splice(0)) {
    if (ev.type === 'milestone') {
      renderTech();
      toast(`Thưởng ${money(ev.reward)} và ${ev.points} điểm phát triển${ev.unlocked.length ? ` · mở khoá: ${ev.unlocked.join(', ')}` : ''}`, `🎉 ${city.name} trở thành ${ev.name}!`);
      refreshToolbar();
    } else if (ev.type === 'fireStart') toast('🔥 Có đám cháy! Xe cứu hoả gần nhất đang chạy tới');
    else if (ev.type === 'fireOut') toast('🚒 Đã dập xong đám cháy');
    else if (ev.type === 'fire') toast('🔥 Một toà nhà cháy rụi vì xe cứu hoả không tới kịp');
    else if (ev.type === 'bankruptBiz') { if (performance.now() - (frame.bizToast || 0) > 8000) { frame.bizToast = performance.now(); toast(`💸 Một ${{ shop: 'cửa hàng', factory: 'nhà máy', raw: 'cơ sở khai thác', office: 'văn phòng' }[ev.kind] || 'doanh nghiệp'} vừa phá sản (xem 👥 để biết vì sao)`); } }
    else if (ev.type === 'loanPaid') toast('Đã trả xong một khoản vay');
    else if (ev.type === 'point') { toast('Thành phố sống tốt: +1 điểm phát triển (bảng 🔬)'); renderTech(); }
    else if (ev.type === 'bankrupt') { $('over').classList.add('show'); setSpeed(0); }
  }
  if (n && city.hour % 3 === 0) city.dirty.zones = true;
  if (n) renderCity(false);
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

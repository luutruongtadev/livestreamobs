// Phố Mới — khởi động, vòng lặp, chuột / bàn phím, giao diện.
import * as S from './sim.js';
import { ledgerSummary, worldReserve, worldK } from './ledger.js';
import * as Cloud from './cloud.js';
import * as Lg from './league.js';
import { View, DCOL, corpRGB } from './render.js';
import * as Deeds from './deeds.js';
import { createGta } from './mayhem.js';
import * as Quests from './quests.js';
import { aiCall, aiOnline, aiEnabled, setAiEnabled, citySummary } from './ai.js';

const KEY = 'phomoi.v2.';
const WEEK = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
const money = (n) => `${fmt(n)} ₫`;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// nhóm công cụ ở thanh dưới; nhóm có `tool` thì bấm là cầm luôn; `tabs` chia bảng công trình thành các thẻ; `key` là phím tắt; `end` tách nhóm ra cuối thanh
const GROUPS = [
  { id: 'info', icon: '🖐️', label: 'Xem', tool: 'info' },
  { id: 'road', icon: '🛣️', label: 'Đường', key: 'R', items: ['road:small', 'road:large', 'road:oneway', 'road:overpass', 'road:overpass2', 'road:overpass3', 'road:tunnel', 'road:highway', 'roundabout', 'junction', 'sign', 'turn', 'bump'],
    tabs: [['Đường', ['road:small', 'road:large', 'road:oneway', 'road:highway']], ['Cầu, hầm', ['road:overpass', 'road:overpass2', 'road:overpass3', 'road:tunnel']], ['Nút giao, biển', ['roundabout', 'junction', 'sign', 'turn', 'bump']]] },
  { id: 'zone', icon: '🎨', label: 'Quy hoạch', items: ['zone:1', 'zone:14', 'zone:13', 'zone:4', 'zone:7', 'zone:15', 'zone:16', 'zone:2', 'zone:5', 'zone:20', 'zone:17', 'zone:6', 'zone:18', 'zone:19', 'zone:3', 'zone:21', 'zone:0'],
    tabs: [['Nhà ở', ['zone:1', 'zone:14', 'zone:13', 'zone:4', 'zone:7', 'zone:15', 'zone:16', 'zone:0']], ['Thương mại', ['zone:2', 'zone:5', 'zone:20', 'zone:17', 'zone:0']], ['Văn phòng', ['zone:6', 'zone:18', 'zone:19', 'zone:0']], ['Công nghiệp', ['zone:3', 'zone:21', 'zone:0']]] },
  { id: 'res', icon: '⛏️', label: 'Tài nguyên', items: ['zone:8', 'zone:12', 'zone:9', 'zone:10', 'zone:11'] },
  { id: 'power', icon: '⚡', label: 'Điện', items: ['wind', 'solar', 'hydro', 'coal', 'nuclear', 'line:power'] },
  { id: 'water', icon: '💧', label: 'Nước', items: ['tower', 'pump', 'outlet', 'treat', 'line:pipe', 'floodpump', 'levee'] },
  { id: 'trash', icon: '🗑️', label: 'Rác', items: ['landfill', 'recycle', 'incinerator'] },
  { id: 'health', icon: '🏥', label: 'Y tế', items: ['clinic', 'hospital', 'cemetery', 'crematorium'] },
  { id: 'civic', icon: '🏛️', label: 'Dịch vụ', items: ['school', 'highschool', 'university', 'research', 'police', 'prison', 'fire'],
    tabs: [['Giáo dục', ['school', 'highschool', 'university', 'research']], ['An ninh, cứu hoả', ['police', 'prison', 'fire']]] },
  { id: 'transit', icon: '🚌', label: 'Vận tải', items: ['transit:bus', 'transit:tram', 'transit:metro', 'depot', 'parking', 'ferry', 'train', 'rail', 'port', 'airport'],
    tabs: [['Xe buýt, tàu điện, metro', ['transit:bus', 'transit:tram', 'transit:metro', 'depot', 'parking']], ['Tàu thuỷ, tàu hoả, máy bay', ['ferry', 'train', 'rail', 'port', 'airport']]] },
  { id: 'park', icon: '🌳', label: 'Công viên', items: ['decor:tree', 'decor:grass', 'decor:path', 'decor:flower', 'decor:erase', 'park', 'plaza', 'stadium'],
    tabs: [['Trang trí', ['decor:tree', 'decor:grass', 'decor:path', 'decor:flower', 'decor:erase']], ['Công viên', ['park', 'plaza', 'stadium']]] },
  { id: 'tour', icon: '🧳', label: 'Du lịch', items: ['beach:paint', 'beach:erase', 'falls:paint', 'falls:erase', 'hotel', 'resort', 'pagoda', 'museum'],
    tabs: [['Cảnh quan', ['beach:paint', 'beach:erase', 'falls:paint', 'falls:erase']], ['Công trình', ['hotel', 'resort', 'pagoda', 'museum']]] },
  { id: 'landmark', icon: '🗽', label: 'Biểu tượng', items: ['monument', 'market', 'theater', 'tvtower', 'skytower'] },
  { id: 'safety', icon: '🚨', label: 'Khẩn cấp', items: ['roadmaint', 'firewatch', 'shelter', 'ews'] },
  { id: 'terra', icon: '⛰️', label: 'Địa hình', key: 'T', items: ['terra:dig', 'terra:raise', 'terra:level', 'terra:canal'] },
  { id: 'move', icon: '✋', label: 'Di chuyển', tool: 'move', key: 'M', end: true },
  { id: 'bulldoze', icon: '🚜', label: 'San ủi', tool: 'bulldoze', key: 'B' },
];
for (const g of GROUPS) if (g.tabs) console.assert(g.items.every((id) => g.tabs.some(([, l]) => l.includes(id))), 'GROUPS: thẻ thiếu công cụ', g.id);
const ROAD_MODES = [['line', '📏', 'Thẳng'], ['curve', '↪️', 'Cong'], ['smooth', '🌀', 'Cong liền'], ['upgrade', '⬆️', 'Nâng cấp'], ['raise', '⏫', 'Nâng tầng'], ['lower', '⏬', 'Hạ tầng'], ['bridge', '🌉', 'Đổi cầu']];
const LAYERS = [['zones', 'Lớp xem: quy hoạch', '🎨', 'Quy hoạch'], ['traffic', 'Lớp xem: giao thông (xanh = thoáng, đỏ = kẹt) và các tuyến xe buýt / metro', '🚗', 'Giao thông'], ['value', 'Lớp xem: giá trị đất (xanh = cao)', '💰', 'Giá đất'], ['air', 'Lớp xem: ô nhiễm không khí', '🌫️', 'Ô nhiễm khí'], ['ground', 'Lớp xem: ô nhiễm đất', '🟤', 'Ô nhiễm đất'], ['noise', 'Lớp xem: tiếng ồn', '🔊', 'Tiếng ồn'], ['waterpol', 'Lớp xem: ô nhiễm nước', '🚱', 'Ô nhiễm nước'], ['garbage', 'Lớp xem: rác tồn ở từng nhà (đỏ = chất đống)', '🗑️', 'Rác'], ['service', 'Lớp xem: vùng phủ dịch vụ công', '🏛️', 'Dịch vụ'], ['crime', 'Lớp xem: tội phạm (tím đậm = nhiều); công an phủ tới và trại giam còn chỗ thì giảm', '🚨', 'Tội phạm'], ['resource', 'Lớp xem: tài nguyên (vàng = đất màu mỡ, lục = rừng, xám = khoáng sản, tím = dầu, lam = vùng nước có cá)', '⛏️', 'Tài nguyên'], ['power', 'Lớp xem: điện (xanh = đủ, cam = thiếu, đỏ = không có)', '⚡', 'Điện'], ['water', 'Lớp xem: nước và thoát nước, hiện cả ống ngầm', '💧', 'Nước'], ['district', 'Lớp xem: các quận (mỗi quận một màu, viền đậm là ranh giới; 🏛️ toà UBND là trụ sở quận)', '🏙️', 'Quận'], ['corp', 'Lớp xem: tập đoàn (mỗi công ty một màu; nhạt = đất đã xin, đang xây)', '🏢', 'Tập đoàn']];

let city, view, tool = 'info', group = 'info', speed = 1, layer = 0, hover = null, drag = null, lastSave = 0, hintOverride = null;
let seatPick = null, distSel = 0; // đang chọn chỗ đặt trụ sở cho quận nào; quận đang xem trong bảng 🏙️
let roadMode = 'line', gridSnap = true, moving = null, draw = null; // draw: { a, ctrl } khi đang vẽ đường / dây, { stops } khi vẽ tuyến
let elevH = 0, keepElev = false; // độ cao tuỳ chỉnh đang vẽ (m), chỉnh bằng PageUp / PageDown
let hideBld = (() => { try { return localStorage.getItem('phomoi.v2.hideBld') !== '0'; } catch { return true; } })(); // vẽ đường: tạm ẩn nhà, công trình
let bridgeStyle = (() => { try { return S.BRIDGES[localStorage.getItem('phomoi.v2.bridge')] ? localStorage.getItem('phomoi.v2.bridge') : 'auto'; } catch { return 'auto'; } })(); // kiểu cầu cho đường mới qua sông
let brush = 2, stroke = null; // cỡ cọ đào đắp (ô); stroke: { target, at, spent } khi đang giữ chuột đào đắp
const keys = new Set();

/** Mô tả một công cụ theo id. */
function toolInfo(id) {
  const [kind, arg] = id.split(':');
  if (id === 'info') return { kind: 'info', icon: '🖐️', label: 'Xem', desc: 'Kéo để di chuyển bản đồ, bấm vào nhà hoặc ô đất để xem thông tin' };
  if (id === 'move') return { kind: 'move', icon: '✋', label: 'Di chuyển', desc: 'Bấm vào công trình hoặc nút đường (ngã ba, ngã tư, đầu đường) để nhấc lên, bấm chỗ mới để đặt · dời công trình mất 10% giá xây, dời nút đường miễn phí · chuột phải để huỷ' };
  if (id === 'bulldoze') return { kind: 'bulldoze', icon: '🚜', label: 'San ủi', desc: 'Kéo để phá đường, nhà, cây, dây điện, ống nước và công trình' };
  if (kind === 'terra') { const d = S.TERRA[arg]; return { kind, mode: arg, icon: d.icon, label: d.name, desc: `<b>${d.name}</b> · khoảng ${fmt(S.TERRA_COST * S.TERRA_STEP * 4)} ₫ cho mỗi ô hạ / nâng một nấc · ${d.desc} · không đào đắp được dưới đường, nhà, công trình · phím <b>[</b> <b>]</b> đổi cỡ cọ` }; }
  if (id === 'land') return { kind: 'land', icon: '🧭', label: 'Mua đất', desc: `Bấm vào một ô đất ${S.LAND}×${S.LAND} kề phần đất của thành phố để mua · càng có nhiều đất, ô sau càng đắt` };
  if (kind === 'road') { const d = S.ROADS[arg], lock = !S.roadUnlocked(city, arg); return { kind, type: arg, icon: d.icon, label: d.name.replace(/ \d làn/, ''), locked: lock, desc: `<b>${d.name}</b> · ${fmt(d.cost * S.T)} ₫ / ô${d.elevated ? '' : `, qua nước đắt gấp ${S.BRIDGE_MULT}`} · ${d.desc}${lock ? ` · 🔒 mở khi đạt ${fmt(d.unlock)} dân` : ''}` }; }
  if (id === 'roundabout') return { kind: 'node', icon: '⭕', label: 'Vòng xuyến', desc: `<b>Vòng xuyến</b> · ${money(S.roundaboutCost())} · bấm vào ngã ba, ngã tư để đổi thành vòng xuyến một chiều: không đèn, xe trong vòng được đi trước, xe vào vòng nhường` };
  if (id === 'junction') return { kind: 'node', icon: '🚦', label: 'Đèn / biển', desc: '<b>Điều khiển nút giao</b> · miễn phí · bấm vào ngã ba, ngã tư để đổi lần lượt: tự động → luôn có đèn → biển dừng (xe dừng hẳn rồi lần lượt đi)' };
  if (id === 'sign') return { kind: 'sign', icon: '🚫', label: 'Biển cấm', desc: `<b>Biển cấm theo đoạn đường</b> · miễn phí · bấm vào một đoạn đường để đổi lần lượt: ${S.BANS.map((b) => `${b.icon} ${b.name.toLowerCase()}`).join(' → ')} · xe bị cấm phải đi đường khác, nhưng vẫn được vào nhà, cửa hàng nằm ngay trên đoạn đó · xe buýt, xe công vụ không bị cấm` };
  if (id === 'turn') return { kind: 'turn', icon: '↰', label: 'Cấm rẽ', desc: `<b>Biển cấm rẽ ở nút</b> · miễn phí · bấm vào nút giao (hoặc một nút giữa đường) để đổi lần lượt: ${S.TURNS.map((t) => `${t.icon} ${t.name.toLowerCase()}`).join(' → ')} · áp cho mọi hướng xe đi vào nút; xe ưu tiên không bị cấm` };
  if (id === 'bump') return { kind: 'bump', icon: '〰️', label: 'Gờ g.tốc', desc: `<b>Gờ giảm tốc</b> · ${money(S.BUMP_COST)} mỗi đoạn · bấm vào đoạn đường để làm / gỡ · xe chạy còn ${Math.round(S.BUMP_SLOW * 100)}% tốc độ, ít tai nạn hơn hẳn; xe đi xuyên sẽ chọn đường khác nhanh hơn · không làm trên cao tốc, cầu vượt` };
  if (kind === 'zone') {
    const z = S.ZDEF[+arg];
    if (!+arg) return { kind, zone: 0, icon: z.icon, label: 'Bỏ q.hoạch', desc: 'Kéo để bỏ quy hoạch (dỡ luôn nhà trong vùng)' };
    const cap = [z.res && `${z.res[0]}–${z.res[4]} dân`, z.jobs && `${z.jobs[0]}–${z.jobs[4]} chỗ làm`].filter(Boolean).join(', ');
    const raw = z.raw ? ` · chỉ mọc trên ô có ${S.RAW[z.raw].icon} ${S.RAW[z.raw].name.toLowerCase()}, bán cho ${S.PRODUCT_KINDS.filter((k) => S.PRODUCTS[k].in.some((a) => a.includes(z.raw))).map((k) => `${S.PRODUCTS[k].icon} ${S.PRODUCTS[k].name.toLowerCase()}`).join(', ')} hoặc xuất khẩu` : '';
    return { kind, zone: +arg, icon: z.icon, label: z.short, dot: z.color, locked: !S.zoneUnlocked(city, +arg), desc: `<b>${z.name}</b> · ${cap} mỗi ô · ${z.desc}${raw}${S.zoneUnlocked(city, +arg) ? '' : ` · 🔒 ${S.lockText(z)}`}` };
  }
  if (kind === 'transit') { const d = S.TRANSIT[arg], lock = !S.modeUnlocked(city, arg); return { kind, mode: arg, icon: d.icon, label: d.name.replace('Tuyến ', ''), locked: lock, desc: `<b>${d.name}</b> · trạm ${money(d.stopCost)}, xe ${money(d.vehCost)}${d.trackCost ? `, ray ${fmt(d.trackCost * S.T)} ₫ / ô` : ''} · chở ${d.cap} khách · ${d.desc}${lock ? ` · 🔒 mở khi đạt ${fmt(d.unlock)} dân` : ''}` }; }
  if (id === 'rail') { const R = S.RAIL, lock = !city.sandbox && !S.isUnlocked(city, 'train'); return { kind: 'rail', icon: '🛤️', label: 'Đường ray', locked: lock, desc: `<b>Đường sắt</b> · ray ${fmt(R.ground * S.T)} ₫ / ô, cầu ${fmt(R.bridge * S.T)} ₫ / ô, hầm ${fmt(R.tunnel * S.T)} ₫ / ô · bấm vào <b>đầu ga tàu hoả</b> (hoặc cửa khẩu, đầu ray có sẵn), bấm thêm các điểm uốn, bấm vào <b>cửa khẩu</b> ở mép bản đồ để nối; chuột phải / Enter để dừng ở đó · ray tự giữ dốc thoải: gặp núi khoét hầm, gặp sông bắc cầu · ga thông ra cửa khẩu đón tàu liên vận (du khách, người tới định cư, tiền vé), hàng xuất qua biên giá +8%, hút dân hơn · san ủi để dỡ ray${lock ? ` · 🔒 ${S.lockText(S.SERVICES.train, city)}` : ''}` }; }
  if (kind === 'decor') {
    if (arg === 'erase') return { kind, erase: true, icon: '🧹', label: 'Xoá t.trí', desc: '<b>Xoá trang trí</b> · kéo để bỏ cây xanh, thảm cỏ, lối đi bộ, bồn hoa đã tô (miễn phí)' };
    const d = S.DECOR[arg];
    return { kind, decor: arg, erase: false, icon: d.icon, label: d.name, desc: `<b>${d.name}</b> · ${fmt(d.cost)} ₫ / ô, phí ${d.upkeep} ₫ / ô / ngày · kéo chuột tô trên đất trống (ô đã tô không mọc nhà) · ${d.desc} · tăng giá đất trong 3 ô quanh đó, dân cả thành phố vui hơn` };
  }
  if (kind === 'falls') return arg === 'erase'
    ? { kind, erase: true, icon: '🧽', label: 'Xoá thác', desc: '<b>Xoá thác nước</b> · kéo để bỏ các ô thác (địa hình giữ nguyên)' }
    : { kind, erase: false, icon: '💦', label: 'Thác nước', locked: !city.sandbox && !S.MILESTONES.some((m, k) => k < city.milestone && m.pop >= S.FALLS.unlock), desc: `<b>Thác nước</b> · ${fmt(S.FALLS.cost)} ₫ / ô, phí ${S.FALLS.upkeep} ₫ / ô / ngày · kéo chuột tô một dải ô <b>từ đỉnh dốc xuống chân dốc</b> (vùng tô chênh cao từ ${S.FALLS.minDrop} m) · nước chảy từ ô cao nhất xuống ô thấp hơn trong vùng tô: chỗ thoải thành suối, chỗ hụt độ cao thành thác đổ trắng xoá, ô thấp nhất thành hồ dưới chân · thác càng cao, càng nhiều bậc càng hút du khách (tối đa +16), giá đất quanh đó tăng · tô nối thêm vào thác có sẵn được${!city.sandbox && !S.MILESTONES.some((m, k) => k < city.milestone && m.pop >= S.FALLS.unlock) ? ` · 🔒 mở khi đạt ${S.FALLS.unlock} dân` : ''}` };
  if (kind === 'beach') return arg === 'erase'
    ? { kind, erase: true, icon: '🧽', label: 'Xoá bãi', desc: '<b>Xoá bãi biển</b> · kéo để bỏ các ô bãi biển (địa hình giữ nguyên)' }
    : { kind, erase: false, icon: '🏖️', label: 'Bãi biển', desc: `<b>Bãi biển</b> · ${fmt(S.BEACH.cost)} ₫ / ô, phí ${S.BEACH.upkeep} ₫ / ô / ngày · kéo chuột tô vùng bãi tuỳ ý, chỉ trên đất trống cách <b>biển</b> tối đa ${S.BEACH.reach} ô (sông, hồ không được) · đất tự hạ thoải dần xuống mép nước, nước sát bờ thành nước nông · càng rộng càng hút du khách (tối đa +18 sức hút), dân cả thành phố vui hơn` };
  if (kind === 'line') { const d = S.LINES[arg]; return { kind, line: arg, icon: d.icon, label: d.name, desc: `<b>${d.name}</b> · ${fmt(d.cost * S.T)} ₫ / ô · bấm điểm đầu rồi điểm cuối · ${d.desc}` }; }
  const d = S.SERVICES[id];
  const extra = [d.students && `${d.students} chỗ học`, d.trucks && `${d.trucks} xe`, d.ambulances && `${d.ambulances} xe cứu thương`, d.hearses && `${d.hearses} xe tang`, d.graves && `${d.graves} phần mộ`, d.cremate && `${d.cremate} người / ngày`, d.cells && `${d.cells} chỗ giam`, d.depot && `+${d.depot} xe buýt / tàu điện`, d.spots && `${d.spots} chỗ đỗ`, d.power && `⚡ ${d.power}`, d.water && `💧 ${d.water}`, d.sewage && `🕳️ ${d.sewage}`, d.trash && `🗑️ ${d.trash}`, d.radius && `bán kính ${d.radius} ô`].filter(Boolean).join(' · ');
  const lock = S.isUnlocked(city, id) ? '' : ` · 🔒 ${S.lockText(d, city)}`;
  return { kind: 'svc', svc: id, icon: d.icon, label: d.name, desc: `<b>${d.name}</b> (${d.size}×${d.size}) · ${money(d.cost)} · phí ${fmt(d.upkeep * S.upkeepRate(city))} ₫/ngày${extra ? ' · ' + extra : ''} · ${d.desc}${d.unique ? ' · chỉ xây một cái' : ''}${lock}` };
}

/** Giá ngắn gọn cho thẻ công cụ trong bảng công trình. */
function toolCost(id) {
  if (city.sandbox) return '';
  const [kind, arg] = id.split(':');
  if (kind === 'road') return `${fmt(S.ROADS[arg].cost * S.T)} ₫/ô`;
  if (kind === 'zone' || id === 'junction' || id === 'sign' || id === 'turn' || arg === 'erase') return 'Miễn phí';
  if (kind === 'transit') return `trạm ${money(S.TRANSIT[arg].stopCost)}`;
  if (kind === 'line') return `${fmt(S.LINES[arg].cost * S.T)} ₫/ô`;
  if (kind === 'decor') return `${fmt(S.DECOR[arg].cost)} ₫/ô`;
  if (kind === 'beach') return `${fmt(S.BEACH.cost)} ₫/ô`;
  if (kind === 'falls') return `${fmt(S.FALLS.cost)} ₫/ô`;
  if (kind === 'terra') return `~${fmt(S.TERRA_COST * S.TERRA_STEP * 4)} ₫/ô`;
  if (id === 'rail') return `${fmt(S.RAIL.ground * S.T)} ₫/ô`;
  if (id === 'roundabout') return money(S.roundaboutCost());
  if (id === 'bump') return money(S.BUMP_COST);
  return S.SERVICES[id] ? money(S.SERVICES[id].cost) : '';
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

// ───────────────────────── nhóm cạnh tranh (league.js) ─────────────────────────
const lgNet = { at: 0, busy: false, err: '' };
/** Gửi bản tóm tắt mới (nếu có) hoặc hỏi trạng thái nhóm; 30 giây một lần, ép = ngay. */
async function leagueSync(force) {
  if (!city || !city.league || lgNet.busy) return;
  const now = performance.now();
  if (!force && !city.league.outbox && now - lgNet.at < 30000) return;
  lgNet.busy = true; lgNet.at = now;
  const c = city, rep = c.league.outbox, token = await Cloud.getToken();
  const ack = [...(c.league.ackOut || [])];
  const r = rep ? await Lg.leagueReport(token, c.name, rep, Lg.pendingUsed(c), ack) : await Lg.leagueStatus(token);
  lgNet.busy = false;
  if (c !== city || !c.league) return;
  if (r.ok && r.league && r.league.id === c.league.id) { if (rep && c.league.outbox === rep) { c.league.outbox = null; c.league.ackOut = (c.league.ackOut || []).filter((d) => !ack.includes(d)); for (const d of ack) if (c.league.used) delete c.league.used[d]; } Lg.applyServer(c, r); lgNet.err = ''; }
  else if ((r.ok && !r.league) || r.status === 404) { Lg.detachLeague(c); toast('🏆 Thành phố không còn trong nhóm (đã rời hoặc sang mùa mới): chơi tự do như trước'); }
  else lgNet.err = r.error || 'Không đồng bộ được với máy chủ';
  if ($('league').classList.contains('show')) renderLeague();
}
async function leagueJoin() {
  if (city.sandbox) { toast('Thành phố chế độ Open không vào nhóm cạnh tranh được'); return; }
  const r = await Lg.leagueJoin(await Cloud.getToken(), city.name);
  if (!r.ok || !r.league) { toast(r.error || 'Không vào nhóm được'); return; }
  Lg.attachLeague(city, r);
  autosave(); toast(`🏆 Đã vào nhóm (${r.league.members} thành phố). Từ giờ 1 ngày game = 1 giờ thật`);
  renderLeague();
}
async function leagueLeave() {
  await Lg.leagueLeave(await Cloud.getToken());
  Lg.detachLeague(city); autosave(); toast('Đã rời nhóm: thành phố chơi tự do như trước'); renderLeague();
}
/** Cửa sổ 💸 Dòng tiền: ví (ngân sách, dân, doanh nghiệp, thế giới bên ngoài), tiền vào / ra hôm qua, vòng tiền bên trong, 14 ngày gần đây. */
function renderFlows() {
  const box = $('flowsBody');
  if (!box || !city) return;
  box.textContent = '';
  const c = city, pp = c.pp, sum = ledgerSummary(c);
  let hh = 0, bz = 0, rich = 0;
  for (let id = 0; id < pp.n; id++) if (pp.alive[id]) { hh += pp.money[id]; if (pp.money[id] > 0) rich++; }
  for (let i = 0; i < c.biz.money.length; i++) bz += c.biz.money[i];
  const cols = el('div', 'dcols'), c1 = el('div'), c2 = el('div'), c3 = el('div');
  const wallet = (icon, name, v, note) => { const d = el('div'); d.append(el('small', null, `${icon} ${name}`), el('b', v < 0 ? 'neg' : '', `${fmt(Math.round(v))} ₫`), ...(note ? [el('small', null, note)] : [])); return d; };
  // cột 1: các ví
  const w = el('div', 'wallets');
  w.append(wallet('🏛️', 'Ngân sách', c.money), wallet('👥', 'Ví của dân', hh, `${fmt(pp.count)} người · TB ${fmt(Math.round(hh / Math.max(1, pp.count)))} ₫`), wallet('🏢', 'Ví doanh nghiệp, chủ nhà', bz));
  if (c.ledger && !c.sandbox) w.append(wallet('🌏', 'Thế giới bên ngoài', worldReserve(c), worldK(c) < 1 ? `sức mua ×${worldK(c).toFixed(2)}` : `phát hành thêm hôm qua ${fmt(Math.round(c.ledger.lastIssue || 0))} ₫`));
  c1.append(el('h4', null, 'Tiền đang nằm ở đâu'), w, el('small', null, 'Kinh tế khép kín: tiền chỉ chuyển giữa các ví, không tự sinh ra hay mất đi. Thế giới bên ngoài có hạn, mỗi ngày phát hành thêm khoảng 2% mỗi mùa.'));
  // cột 2: vào / ra thành phố hôm qua
  const bars = (rows, total) => rows.map((r) => { const d = el('div', 'fbar'), b = el('div', 'b'), f = el('i'); f.style.width = `${Math.min(100, (Math.abs(r.v) / Math.max(1, total)) * 100)}%`; f.style.background = r.v >= 0 ? 'var(--good)' : 'var(--bad)'; b.append(f); d.append(el('span', null, r.name), el('span', `v ${r.v > 0 ? 'pos' : r.v < 0 ? 'neg' : ''}`, r.v ? `${r.v > 0 ? '+' : '−'}${fmt(Math.abs(r.v))}` : '0'), b); return d; });
  c2.append(el('h4', null, 'Vào / ra thành phố hôm qua'));
  if (!sum.rows.length) c2.append(el('div', 'row', 'Chưa đủ một ngày để chốt sổ'));
  else {
    const big = Math.max(...sum.rows.map((r) => Math.abs(r.v)));
    c2.append(el('div', 'row', ''), ...bars([{ name: 'Tổng vào', v: sum.inflow }, { name: 'Tổng ra', v: sum.outflow }], Math.max(sum.inflow, -sum.outflow)));
    c2.append(el('h4', null, 'Từng khoản'), ...bars(sum.rows.map((r) => ({ name: `${r.group === 'city' ? '🏛️' : '👥'} ${r.name}`, v: r.v })), big));
  }
  // cột 3: vòng tiền bên trong + 14 ngày
  c3.append(el('h4', null, 'Vòng tiền bên trong (hôm qua)'));
  if (sum.inner.length) { const big = Math.max(...sum.inner.map((r) => r.v)); c3.append(...bars(sum.inner.map((r) => ({ name: `🔄 ${r.name}`, v: r.v })), big)); }
  else c3.append(el('div', 'row', 'Chưa có'));
  const hist = (c.reports || []).slice(-14);
  if (hist.length > 1) {
    c3.append(el('h4', null, `${hist.length} ngày gần đây: vào / ra, ngân sách`));
    const cv = el('canvas'); cv.width = 320; cv.height = 130; cv.style.width = '100%';
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, n = hist.length, bw = W / n;
    const top = Math.max(1, ...hist.map((r) => Math.max(r.flows?.inflow || 0, -(r.flows?.outflow || 0))));
    hist.forEach((r, k) => {
      const inH = ((r.flows?.inflow || 0) / top) * (H / 2 - 8), outH = (-(r.flows?.outflow || 0) / top) * (H / 2 - 8);
      g.fillStyle = 'rgba(98,217,139,.8)'; g.fillRect(k * bw + 2, H / 2 - inH, bw - 4, inH);
      g.fillStyle = 'rgba(255,107,91,.8)'; g.fillRect(k * bw + 2, H / 2, bw - 4, outH);
    });
    const ms = hist.map((r) => r.money), lo = Math.min(...ms), hi = Math.max(...ms);
    g.strokeStyle = '#f2b33d'; g.lineWidth = 2; g.beginPath();
    ms.forEach((m, k) => { const x = k * bw + bw / 2, y = H - 6 - ((m - lo) / Math.max(1, hi - lo)) * (H - 12); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    c3.append(cv, el('small', null, 'Xanh: tiền vào từ bên ngoài · đỏ: tiền ra · vàng: ngân sách'));
  }
  cols.append(c1, c2, c3); box.append(cols);
}

function renderLeague() {
  const box = $('leagueBody');
  if (!box) return;
  box.textContent = '';
  const row = (k, v) => { const r = el('div', 'row'); r.append(el('span', null, k), el('span', null, v)); return r; };
  if (!Cloud.cloudMode()) { box.append(el('div', 'row', 'Mở game qua máy chủ của nền tảng để vào nhóm cạnh tranh')); return; }
  const L = city.league;
  if (!L) {
    box.append(el('p', 'small', 'Thi với thành phố của người chơi khác. Không ai đụng được vào thành phố của bạn: dân chuyển đến, du khách, đầu tư mới và giá chợ được máy chủ chia chung cho cả nhóm theo sức hút (việc làm, hài lòng, thuế, giá đất, du lịch). Các thành phố mua bán với nhau theo hợp đồng giá mỗi ngày, mỗi nơi tự đặt giá chào và thuế nhập khẩu. Từ lúc vào nhóm, 1 ngày game = 1 giờ thật, không tua nhanh được; vắng mặt thì mở lại sẽ chạy bù tối đa 7 ngày.'));
    if (!cloud.user) { box.append(el('div', 'row', 'Đăng nhập ở 💾 Lưu và tải → ☁️ Đám mây trước')); return; }
    const b = el('button', 'mini acc', '🏆 Vào nhóm'); b.addEventListener('click', leagueJoin); box.append(b);
    return;
  }
  const dayNow = Lg.leagueDayNow(L), ms = Math.max(0, L.start + (dayNow + 1) * L.dayMs - Date.now()), a = L.alloc;
  if (lgNet.err) box.append(el('div', 'row neg', lgNet.err));
  const cols = el('div', 'dcols'), c1 = el('div'), c2 = el('div'), c3 = el('div');
  // cột 1: hôm nay
  c1.append(el('h4', null, 'Hôm nay'), row('Ngày giải · mùa', `${dayNow + 1} · ${L.season}`), row('Ngày mới sau', `${Math.ceil(ms / 60000)} phút`), row('Thành phố trong nhóm', fmt(L.members || L.standings.length)), row('Nông thôn chung còn', L.rural != null ? `${fmt(L.rural)} người` : '–'));
  c1.append(el('h4', null, 'Phần được chia'));
  if (a) c1.append(row('Dân chuyển đến (tối đa bằng nhà trống)', fmt(a.migrants)), row('Du khách', fmt(a.tourists)), row('Đầu tư mới', `×${a.invest}`), el('h4', null, 'Giá chợ chung'), ...Object.entries(a.prices || {}).map(([k, v]) => row(S.MKT_NAME[k], `${Math.round(v * 100)}%`)));
  else c1.append(el('div', 'row', 'Chưa có: gửi bản tóm tắt ngày đầu tiên lúc 0 giờ'));
  const out = el('button', 'mini', 'Rời nhóm'); out.addEventListener('click', leagueLeave); out.style.marginTop = '10px'; c1.append(out);
  // cột 2: buôn bán với thành phố khác
  c2.append(el('h4', null, 'Hợp đồng hôm nay'));
  const tr = a && a.trade, deals = [];
  if (tr) for (const [side, verb, who] of [['buy', 'Mua', 'from'], ['sell', 'Bán', 'to']]) for (const [k, d] of Object.entries(tr[side] || {})) deals.push(row(`${verb} ${S.MKT_NAME[k]} ${side === 'buy' ? 'của' : 'cho'} ${(d[who] || []).slice(0, 3).join(', ')}`, `${fmt(d.qty)} · giá ${Math.round(d.price * 100)}%${side === 'buy' && d.tariff ? ` + thuế ${Math.round(d.tariff * 100)}%` : ''}${d.left != null && d.left < d.qty ? ` · còn ${fmt(Math.round(d.left))}` : ''}`));
  if (deals.length) c2.append(...deals); else c2.append(el('div', 'row', 'Chưa có hợp đồng (cần nhập / xuất khẩu hôm qua và giá rẻ hơn thế giới máy)'));
  const P = Lg.policyOf(city), tbl = el('table', 'lgtab policy');
  c2.append(el('h4', null, 'Giá chào bán · thuế nhập khẩu'));
  const step = (field, k, d) => { const r = Lg.setPolicy(city, field, k, P[field][k] + d); if (!r.ok) toast(r.reason); renderLeague(); };
  const hd = el('tr'); for (const t of ['', 'Hàng', 'Giá chào', 'Thuế NK']) hd.append(el('th', null, t)); tbl.append(hd);
  for (const k of S.MKT_KINDS) {
    const tr2 = el('tr'), ctl = (field) => { const td = el('td'), m = el('button', 'mini', '−'), p = el('button', 'mini', '+'); m.addEventListener('click', () => step(field, k, -0.05)); p.addEventListener('click', () => step(field, k, 0.05)); td.append(m, el('b', null, ` ${Math.round(P[field][k] * 100)}% `), p); return td; };
    tr2.append(el('td', null, S.MKT_NAME[k].split(' ')[0]), el('td', null, S.MKT_NAME[k].split(' ').slice(1).join(' ')), ctl('ask'), ctl('tariff'));
    tbl.append(tr2);
  }
  c2.append(tbl, el('small', null, 'Giá chào: phần của giá chợ chung khi bán cho thành phố khác. Thuế nhập khẩu đánh vào hàng mua của thành phố khác, tiền vào ngân sách; thuế cao thì doanh nghiệp mua của thế giới máy. Mỗi loại đổi được một lần mỗi ngày, áp từ ngày giải sau.'));
  // cột 3: bảng xếp hạng
  c3.append(el('h4', null, 'Bảng xếp hạng (điểm thịnh vượng)'));
  const rank = el('table', 'lgtab'), h3 = el('tr');
  for (const t of ['#', 'Thành phố', 'Điểm', 'Dân', 'Vui']) h3.append(el('th', null, t));
  rank.append(h3);
  L.standings.slice(0, 30).forEach((s, k) => {
    const r = el('tr', s.owner === cloud.user?.id ? 'me' : '');
    for (const v of [k + 1, `${s.name}${s.owner === cloud.user?.id ? ' (bạn)' : ''}${s.abandoned ? ' 🏚️' : s.online ? '' : ' 💤'}`, fmt(s.score), fmt(s.pop), `${s.happy ?? '–'}%`]) r.append(el('td', null, String(v)));
    rank.append(r);
  });
  c3.append(rank, el('small', null, '💤 lâu không vào · 🏚️ bỏ quá 7 ngày (dân dần chuyển đi)'));
  cols.append(c1, c2, c3); box.append(cols);
}

// ───────────────────────── lưu đám mây (cloud.js) ─────────────────────────
const cloud = { user: null, slots: [], busy: false, at: 0, err: '' };
const cloudData = () => ({ name: city.name, pop: city.stats.pop, day: city.day, city: S.serialize(city) });
async function cloudRefresh() {
  if (!Cloud.cloudMode()) return;
  const r = await Cloud.listSaves();
  cloud.user = r.ok ? r.user : null; cloud.slots = r.ok ? r.slots : []; cloud.err = r.ok || r.status === 401 ? '' : r.error;
  renderCloud();
}
async function cloudSave(slot, quiet) {
  if (!city || city.over || cloud.busy) return;
  cloud.busy = true;
  const r = await Cloud.putSave(slot, cloudData());
  cloud.busy = false; cloud.at = performance.now();
  if (!quiet) toast(r.ok ? `☁️ Đã lưu lên mây (${(r.size / 1024).toFixed(1)} KB)` : `Không lưu lên mây được: ${r.error}`);
  if (r.ok) cloudRefresh(); else if (r.status === 401) { cloud.user = null; renderCloud(); }
}
async function cloudLoad(slot) {
  const r = await Cloud.getSave(slot);
  if (!r.ok) { toast(`Không tải được: ${r.error}`); return; }
  try { startCity(S.deserialize(r.city)); toast(`☁️ Đã tải "${r.name}" từ mây`); $('over').classList.remove('show'); } catch (e) { toast('Bản lưu trên mây không đọc được: ' + e.message); }
}
function renderCloud() {
  const box = $('cloud');
  if (!box) return;
  box.textContent = '';
  const mode = Cloud.cloudMode();
  if (!mode) { box.append(el('div', 'row', 'Mở game qua máy chủ của nền tảng để lưu lên mây')); return; }
  if (cloud.err) box.append(el('div', 'row neg', cloud.err));
  if (!cloud.user) {
    const f = el('form', 'cloudLogin'), u = el('input'), p = el('input'), go = el('button', 'mini acc', 'Đăng nhập'), reg = el('button', 'mini', 'Đăng ký');
    u.placeholder = mode === 'dev' ? 'DEV token của máy chủ chạy thử' : 'Tên đăng nhập'; u.autocomplete = 'username'; u.type = mode === 'dev' ? 'password' : 'text';
    p.placeholder = 'Mật khẩu'; p.type = 'password'; p.autocomplete = 'current-password';
    reg.type = 'button';
    const run = async (signup) => { const r = await Cloud.login(u.value, p.value, signup); if (!r.ok) toast(r.error); else { toast('Đã đăng nhập'); cloudRefresh(); } };
    f.addEventListener('submit', (e) => { e.preventDefault(); run(false); });
    reg.addEventListener('click', () => run(true));
    f.append(u, ...(mode === 'dev' ? [] : [p]), go, ...(mode === 'dev' ? [] : [reg]));
    box.append(f, el('small', null, mode === 'dev' ? 'Máy chủ chạy thử: dùng DEV token như dashboard.' : 'Dùng chung tài khoản với dashboard của nền tảng.'));
    return;
  }
  const head = el('div', 'row'), out = el('button', 'mini', 'Đăng xuất');
  out.addEventListener('click', async () => { await Cloud.logout(); cloud.user = null; renderCloud(); });
  head.append(el('span', null, `👤 ${Cloud.displayName(cloud.user.email)} · tự lưu 5 phút một lần`), out);
  box.append(head);
  for (const [slot, label] of Cloud.CLOUD_SLOTS) {
    const d = cloud.slots.find((s) => s.slot === slot), row = el('div', 'slot'), info = el('div');
    info.append(el('b', null, label), el('small', null, d ? `${d.name} · ${fmt(d.pop)} dân · ngày ${d.day + 1} · ${new Date(d.updated_at).toLocaleString('vi-VN')}` : 'Trống'));
    row.append(info);
    if (slot !== 'auto') { const b = el('button', 'mini acc', 'Lưu'); b.addEventListener('click', () => cloudSave(slot)); row.append(b); }
    const b = el('button', 'mini', 'Tải'); b.disabled = !d; b.addEventListener('click', () => cloudLoad(slot)); row.append(b);
    box.append(row);
  }
}
function loadSlot(name) {
  const d = readSlot(name);
  if (!d) return false;
  try { startCity(S.deserialize(d.city)); return true; } catch (e) { toast('Không đọc được bản lưu: ' + e.message); return false; }
}
function dateText(hour) {
  const day = Math.floor(hour / 24), h = hour % 24, w = city && S.WEATHER[city.inc.weather], L = S.lunar(day), fe = city && S.festivalNow(city, day);
  return `${h >= 6 && h < 19 ? '☀️' : '🌙'} ${String(h).padStart(2, '0')}:00 · ${WEEK[day % 7]} · ${L.day}/${L.month} âm${fe ? ` ${fe.f.icon}` : ''}${w && city.inc.weather !== 'clear' ? ` · ${w.icon} ${w.name}` : ''}`;
}

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

// công cụ người chơi đã bấm thử: công cụ mới mở khoá mà chưa thử thì có chấm xanh ngọc
const seenTools = new Set((() => { try { return JSON.parse(localStorage.getItem(KEY + 'seenTools') || '[]'); } catch { return []; } })());
const saveSeen = () => { try { localStorage.setItem(KEY + 'seenTools', JSON.stringify([...seenTools])); } catch { /* bỏ qua */ } };
const toolLocked = (id) => (S.SERVICES[id] ? !S.isUnlocked(city, id) : !!toolInfo(id).locked);
const toolNew = (id) => !city.sandbox && !seenTools.has(id) && !toolLocked(id); // chế độ Open mở hết từ đầu: không đánh dấu
/** Lần đầu chạy: coi mọi công cụ đang mở là đã biết, để chấm "mới" chỉ hiện cho thứ mở khoá về sau. */
function seedSeen() {
  if (seenTools.size) return;
  for (const g of GROUPS) for (const id of g.items || []) if (!toolLocked(id)) seenTools.add(id);
  saveSeen();
}

function toolButton(id, cls = 'tool') {
  const t = toolInfo(id), b = el('button', cls);
  b.dataset.tool = id;
  b.append(el('span', null, t.icon), el('small', null, t.label));
  b.setAttribute('aria-label', t.label);
  if (cls.includes('asset')) { const k = toolCost(id); if (k) b.append(el('em', 'cost', k)); }
  if (t.dot) { const d = el('i', 'dot'); d.style.background = t.dot; b.append(d); }
  if (t.locked) b.classList.add('locked');
  b.addEventListener('click', () => { if (!seenTools.has(id)) { seenTools.add(id); saveSeen(); } setTool(id); });
  b.addEventListener('mouseenter', () => { hintOverride = toolInfo(id).desc; renderHint(); });
  b.addEventListener('mouseleave', () => { hintOverride = null; renderHint(); });
  return b;
}

/** Nút tuỳ chọn trong dải phía trên bảng công trình (kiểu vẽ, bật tắt, kiểu cầu, cỡ cọ). */
function modeButton(mode, icon, label, key) {
  const b = el('button', 'tool mode'); b.dataset.mode = mode; b.append(el('span', null, icon), el('small', null, label));
  if (key) b.append(el('kbd', null, key));
  return b;
}

function buildToolbar() {
  const box = $('tools'); box.textContent = '';
  for (const g of GROUPS) {
    const b = el('button', `tool cat${g.end ? ' end' : ''}`); b.dataset.group = g.id;
    b.title = `${g.label}${g.key ? ` (phím ${g.key})` : ''}`; b.setAttribute('aria-label', g.label);
    b.append(el('span', null, g.icon), el('small', null, g.label));
    if (g.key) b.append(el('kbd', null, g.key));
    // bấm lại nhóm đang mở (hoặc công cụ ✋ 🚜 đang cầm) thì về 🖐️ Xem, như đóng bảng công trình
    b.addEventListener('click', () => { if (g.tool) setTool(tool === g.tool && g.tool !== 'info' ? 'info' : g.tool); else if (group === g.id && tool !== 'info') setTool('info'); else setTool(g.items.includes(g.last) ? g.last : g.items[0]); });
    box.append(b);
  }
  buildSub();
}

/** Bảng công trình của nhóm đang mở: tiêu đề, các thẻ, thẻ công trình có giá; dải tuỳ chọn cho đường và địa hình. */
function buildSub() {
  const box = $('sub'), opts = $('opts'); box.textContent = ''; opts.textContent = ''; $('elev').textContent = '';
  const g = GROUPS.find((x) => x.id === group);
  buildSub.tab = g ? g.tab || 0 : 0;
  if (!g || !g.items) { refreshToolbar(); return; }
  const head = el('div', 'ahead'), cards = el('div', 'acards');
  head.append(el('b', null, `${g.icon} ${g.label}`));
  if (g.tabs) {
    const tabs = el('nav', 'atabs');
    g.tabs.forEach(([label, ids], k) => {
      const t = el('button', `atab${k === (g.tab || 0) ? ' on' : ''}`, label);
      t.addEventListener('click', () => { g.tab = k; setTool((g.tabLast && g.tabLast[k]) || ids[0]); }); // mỗi thẻ nhớ công cụ chọn gần nhất
      tabs.append(t);
    });
    head.append(tabs);
  } else head.append(el('span', 'spacer'));
  const x = el('button', 'aclose', '✕'); x.title = 'Đóng (Esc, chuột phải)'; x.setAttribute('aria-label', 'Đóng');
  x.addEventListener('click', () => setTool('info')); head.append(x);
  for (const id of g.tabs ? g.tabs[g.tab || 0][1] : g.items) cards.append(toolButton(id, 'tool asset'));
  box.append(head, cards);
  if (g.id === 'road') {
    opts.append(el('span', 'olab', 'Vẽ'));
    for (const [m, icon, label] of ROAD_MODES) {
      const b = modeButton(m, icon, label, m === 'curve' ? 'C' : '');
      if (m === 'curve') b.title = 'Cong (phím C)';
      b.addEventListener('click', () => { roadMode = m; cancelDraw(); refreshToolbar(); renderHint(); });
      opts.append(b);
    }
    opts.append(el('span', 'olab', 'Bật'));
    const gb = modeButton('grid', '#️⃣', 'Bám lưới', 'G'); gb.title = 'Bám lưới (phím G)';
    gb.addEventListener('click', () => { gridSnap = !gridSnap; refreshToolbar(); });
    const hb = modeButton('hide', '🏚️', 'Ẩn nhà', 'H');
    hb.title = 'Tạm ẩn nhà và công trình khi vẽ đường, chỉ còn lưới ô xây nhà (phím H)';
    hb.addEventListener('click', toggleHideBld);
    opts.append(gb, hb);
    for (const [d, icon, label] of [[-1, "🔽", `−${String(S.ELEV.step).replace(".", ",")} m`], [0, "⬍", ""], [1, "🔼", `+${String(S.ELEV.step).replace(".", ",")} m`]]) { // độ cao điểm cuối đang vẽ (PageUp / PageDown) mà không bỏ điểm đầu
      const b = el('button', 'tool mode'); b.dataset.act = d ? `lvl${d}` : 'elev'; b.append(el('span', null, icon), el('small', null, label));
      b.title = d ? `${label} cho điểm cuối đoạn đang vẽ, từng nhịp một (phím ${d > 0 ? 'PageUp' : 'PageDown'}); dưới mặt đất là hầm chui` : 'Độ cao đang vẽ (bấm để về mặt đất)';
      b.addEventListener('click', () => (d ? shiftLevel(d) : setElev(0)));
      $('elev').append(b); // ô độ cao: khung riêng bên phải dải tuỳ chọn
    }
    opts.append(el('span', 'olab', 'Cầu'));
    for (const [k, d] of Object.entries(S.BRIDGES)) { // kiểu cầu: áp cho đường mới vẽ qua sông, hoặc bấm cầu có sẵn ở chế độ Đổi cầu
      const b = modeButton(`bridge:${k}`, d.icon, d.name);
      b.addEventListener('click', () => { bridgeStyle = k; try { localStorage.setItem('phomoi.v2.bridge', k); } catch {} refreshToolbar(); renderHint(); updatePreview(); });
      b.addEventListener('mouseenter', () => { hintOverride = `<b>${d.full}</b>${d.mult > 1 ? ` · phần qua sông đắt gấp ${d.mult} cầu thường` : ''} · ${d.desc}`; renderHint(); });
      b.addEventListener('mouseleave', () => { hintOverride = null; renderHint(); });
      opts.append(b);
    }
  }
  if (g.id === 'terra') {
    opts.append(el('span', 'olab', 'Cọ'));
    for (const n of S.BRUSHES) {
      const b = el('button', 'tool mode'); b.dataset.mode = `brush:${n}`; b.append(el('span', 'brush', '⬛'), el('small', null, `Cọ ${n} ô`));
      b.firstChild.style.fontSize = `${10 + n * 3}px`; b.title = 'Cỡ cọ (phím [ ])';
      b.addEventListener('click', () => { brush = n; refreshToolbar(); });
      opts.append(b);
    }
  }
  refreshToolbar();
}

function refreshToolbar() {
  for (const b of $('tools').children) { const g = GROUPS.find((x) => x.id === b.dataset.group); if (!g) continue; b.classList.toggle('on', !!g.tool && g.tool === tool); b.classList.toggle('open', !g.tool && g.id === group); b.classList.toggle('new', !!g.items && g.items.some(toolNew)); }
  for (const b of [...$('sub').querySelectorAll('.asset'), ...$('opts').children, ...$('elev').children]) {
    if (b.dataset.tool) { b.classList.toggle('on', b.dataset.tool === tool); b.classList.toggle('locked', toolLocked(b.dataset.tool)); b.classList.toggle('new', toolNew(b.dataset.tool)); }
    if (b.dataset.act === 'elev') { const t = toolInfo(tool); b.lastChild.textContent = elevText(t.kind === 'road' ? curElev(t) : 0); b.classList.toggle('on', t.kind === 'road' && curElev(t) !== 0); }
    if (b.dataset.mode) b.classList.toggle('on', b.dataset.mode === 'grid' ? gridSnap : b.dataset.mode === 'hide' ? hideBld : b.dataset.mode.startsWith('brush:') ? +b.dataset.mode.slice(6) === brush : b.dataset.mode.startsWith('bridge:') ? b.dataset.mode.slice(7) === bridgeStyle : b.dataset.mode === roadMode);
  }
}

function setTool(id) {
  endStroke();
  if (!keepElev) elevH = 0;
  tool = id; drag = null; draw = null; moving = null;
  const g = GROUPS.find((x) => x.tool === id || (x.items && x.items.includes(id)));
  if (g.items) g.last = id;
  if (g.tabs && !g.tabs[g.tab || 0][1].includes(id)) g.tab = Math.max(0, g.tabs.findIndex(([, ids]) => ids.includes(id)));
  if (g.tabs) (g.tabLast ||= {})[g.tab || 0] = id;
  const changed = group !== g.id || buildSub.tab !== (g.tab || 0);
  group = g.id;
  view.setPreview(null); view.setGhost(null); view.setRibbon(null); view.setMarker(null);
  if (changed) buildSub(); else refreshToolbar();
  if (id !== 'info') $('info').classList.remove('show'); // cầm công cụ xây thì đóng bảng ô đang xem
  applyOverlay(); renderHint();
  view.canvas.style.cursor = id === 'info' ? 'grab' : 'crosshair';
}

function applyOverlay() {
  const t = toolInfo(tool), zoning = t.kind === 'zone', resZone = zoning && S.ZDEF[t.zone].raw ? t.zone : 0;
  const mode = resZone ? 'resource' : zoning ? 'zones' : t.line === 'pipe' || group === 'water' ? 'water' : t.line === 'power' || group === 'power' ? 'power' : t.kind === 'land' && !layer ? 'resource' : LAYERS[layer][0];
  const roadDraw = t.kind === 'road';
  view.setOverlay(roadDraw ? 'roadgrid' : mode, zoning, roadDraw || (tool !== 'info' && t.kind !== 'line' && t.kind !== 'transit' && t.kind !== 'rail' && t.kind !== 'land'), resZone);
  view.setBuildingsHidden(roadDraw && hideBld);
  view.setNodeMarks(roadDraw);
  view.setLandGrid(t.kind === 'land');
  view.setRoutesVisible(t.kind === 'transit' || group === 'transit' || mode === 'traffic');
}

function renderHint(text) {
  let base = toolInfo(tool).desc;
  if (toolInfo(tool).kind === 'rail') base = draw ? `Đang vẽ ray · bấm thêm điểm uốn, bấm vào <b>cửa khẩu</b> / đầu ga / đầu ray để nối, <b>chuột phải</b> hoặc <b>Enter</b> để dừng ở điểm cuối, Esc để bỏ` : base;
  if (toolInfo(tool).kind === 'transit' && draw) base = `Đã đặt <b>${draw.stops.length} trạm</b> · bấm tiếp để thêm trạm, <b>chuột phải</b> hoặc <b>Enter</b> để chốt tuyến, Esc để bỏ`;
  if (toolInfo(tool).kind === 'road' && (roadMode === 'line' || roadMode === 'curve' || roadMode === 'smooth')) base += ' · <b>PgUp/PgDn</b> nâng / hạ độ cao từng nhịp · <b>H</b> ẩn/hiện nhà · ô <span style="color:#ff5aa0">hồng</span>: dải đất hẹp bị bỏ sót giữa các dãy mặt tiền';
  if (toolInfo(tool).kind === 'road') base += roadMode === 'line' ? ' · <b>Thẳng</b>: bấm điểm đầu, bấm điểm cuối' : roadMode === 'curve' ? ' · <b>Cong</b>: bấm điểm đầu, điểm uốn, điểm cuối' : roadMode === 'smooth' ? ' · <b>Cong liền</b>: bấm liên tiếp các điểm, mỗi nhịp cong tiếp đúng hướng nhịp trước (không gãy góc) — kết hợp PgUp/PgDn từng nhịp để làm cầu xoắn ốc' : roadMode === 'bridge' ? ` · <b>Đổi cầu</b>: bấm vào cây cầu để đổi thành ${S.BRIDGES[bridgeStyle].full.toLowerCase()}` : ' · <b>Nâng cấp</b>: bấm vào đoạn đường để đổi sang loại này';
  if (toolInfo(tool).kind === 'road' && roadMode !== 'upgrade' && roadMode !== 'bridge' && !S.ROADS[toolInfo(tool).type].elevated) base += ` · cầu qua sông: <b>${S.BRIDGES[bridgeStyle].icon} ${S.BRIDGES[bridgeStyle].name}</b>`;
  $('hint').innerHTML = text || hintOverride || base;
}

// ───────────────────────── vẽ đường, dây, quy hoạch ─────────────────────────

function rectTiles(a, b) {
  const out = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push([x, y]);
  return out;
}

function cancelDraw() { draw = null; moving = null; view.setRibbon(null); view.setMarker(null); view.setGhost(null); view.setPreview(null); }

/** Điểm bắt cho công cụ đường tại vị trí con trỏ: bắt nút, thân đường, góc so với điểm đầu (nối thẳng, vuông góc, 45°), lưới ô. */
function roadSnap(type, free) {
  if (!hover) return null;
  return S.snapPoint(city, hover.wx, hover.wz, { grid: gridSnap && !free, type, h: type === 'small' ? elevH : null, from: draw && !draw.rail && !draw.stops && roadMode !== 'smooth' ? (draw.ctrl ? { x: draw.ctrl.x, z: draw.ctrl.z } : draw.a) : null });
}

/** Đoạn đường sắp vẽ từ điểm đầu tới điểm bắt sp: chế độ Cong liền tự đặt điểm uốn theo hướng đường đang đi; đường 2 làn có độ cao tuỳ chỉnh. */
function roadSpec(t, sp) {
  const spec = { a: draw.a, b: sp, ctrl: draw.ctrl, type: t.type, bridge: bridgeStyle };
  if (roadMode === 'smooth') { const sc = S.smoothCtrl(city, draw.a, sp); if (sc && sc.reason) spec.bad = sc.reason; else if (sc) spec.ctrl = sc; }
  if (t.type === 'small') spec.elev = { a: draw.a.h ?? elevH, b: elevH };
  return spec;
}

const elevText = (h) => (h < 0 ? 'Hầm' : h ? `${String(h).replace('.', ',')} m` : 'Mặt đất');
/** Độ cao đang vẽ của công cụ đường: tuỳ chỉnh (đường 2 làn), theo tầng (cầu vượt các tầng, hầm). */
const curElev = (t) => (t.type === 'small' ? elevH : t.type === 'tunnel' ? -1 : S.LEVEL_CHAIN.includes(t.type) ? S.lvlH(S.roadLvl(t.type)) : 0);

function setElev(h) {
  const t = toolInfo(tool), keep = draw, mode = roadMode;
  keepElev = true;
  setTool(h < 0 ? 'road:tunnel' : 'road:small');
  keepElev = false;
  elevH = Math.max(0, h); roadMode = mode === 'upgrade' || mode === 'bridge' || mode === 'raise' || mode === 'lower' ? 'line' : mode; draw = keep;
  void t;
  refreshToolbar(); updatePreview(); renderHint();
}

function toggleHideBld() {
  hideBld = !hideBld;
  try { localStorage.setItem('phomoi.v2.hideBld', hideBld ? '1' : '0'); } catch { /* bỏ qua */ }
  applyOverlay(); refreshToolbar();
  toast(hideBld ? '🏚️ Vẽ đường: tạm ẩn nhà, công trình — chỉ còn lưới ô xây nhà' : '🏠 Vẽ đường: hiện nhà, công trình');
}

const LVL_NAME = { '-1': 'Hầm chui (−6,5 m)', 0: 'Mặt đất', 1: 'Cầu tầng 1 (7 m)', 2: 'Cầu tầng 2 (14 m)', 3: 'Cầu tầng 3 (21 m)' };

/**
 * PageUp / PageDown: nâng / hạ độ cao điểm cuối đoạn đang vẽ từng bậc ELEV.step m (như Cities: Skylines), giữ nguyên điểm đầu.
 * Mỗi nhịp một độ cao riêng, mặt cầu nối liền mạch qua các nhịp. Dưới mặt đất là hầm chui.
 */
function shiftLevel(d) {
  const t = toolInfo(tool), st = S.ELEV.step;
  if (t.kind === 'road' && !S.LEVEL_CHAIN.includes(t.type)) { toast(`${S.ROADS[t.type].name}: chỉ đường 2 làn chỉnh độ cao được`); return; }
  const cur = t.kind === 'road' ? curElev(t) : 0;
  let nh = cur < 0 ? (d > 0 ? 0 : -1) : d > 0 ? Math.floor(cur / st + 1e-6) * st + st : Math.ceil(cur / st - 1e-6) * st - st;
  if (nh > S.ELEV.max) { toast(`Cao nhất ${S.ELEV.max} m`); return; }
  if (nh < 0) nh = -1;
  const nt = nh < 0 ? 'tunnel' : S.elevType(nh);
  if (!S.roadUnlocked(city, nt)) { toast(`${S.ROADS[nt].name}: mở khi đạt ${fmt(S.ROADS[nt].unlock)} dân`); return; }
  if (nh === cur) return;
  setElev(nh);
  toast(`${nh < 0 ? "🕳️" : nh ? "🌉" : "🛣️"} Độ cao: ${elevText(nh)}${nh > 0 ? ` · ${S.ROADS[nt].name.toLowerCase()}` : ''}`);
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
  if (!S.TRANSIT[mode].road) return { x: S.cellCenter(hover.x), z: S.cellCenter(hover.y), ok: true };
  const e = S.edgeAt(city, hover.wx, hover.wz, 7);
  if (!e || S.ROADS[e.type].elevated) return { x: hover.wx, z: hover.wz, ok: false };
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

/** Kế hoạch ray đang vẽ tới điểm con trỏ (hoặc điểm bắt dính b). */
function railPlanTo(p, b) {
  const pts = [...draw.pts, p.x, p.z];
  return S.buildRail(city, pts, { a: draw.a, b, dry: true });
}
const railText = (pl) => `${(pl.len / 1000).toFixed(2).replace('.', ',')} km${pl.lenBridge > 1 ? ` · 🌉 cầu ${Math.round(pl.lenBridge)} m` : ''}${pl.lenTunnel > 1 ? ` · 🚇 hầm ${Math.round(pl.lenTunnel)} m` : ''} · ${money(pl.cost)}`;
/** Chốt đường ray đang vẽ: b = điểm bắt dính ở cuối (null: dừng ở điểm cuối đã bấm). */
function finishRail(b) {
  if (!draw || !draw.rail) return false;
  if (!b && draw.pts.length < 4) { cancelDraw(); renderHint(); return true; }
  const pts = b ? [...draw.pts, b.x, b.z] : draw.pts;
  const r = S.buildRail(city, pts, { a: draw.a, b });
  if (!r.ok) { toast(r.reason); return true; }
  const lk = S.railNet(city).stations.filter((x) => x.route);
  toast(`🛤️ Đã làm ${railText(r)}${lk.length ? ` · 🚆 ga đã thông ra ${[...new Set(lk.map((x) => x.gate.name))].join(', ')}` : ' · chưa thông ra cửa khẩu'}`);
  draw = null; view.setRibbon(null); view.setMarker(null); renderHint(); updateHud(true);
  return true;
}

/** Cập nhật phần xem trước theo công cụ đang cầm. */
/** Điểm đặt mới khi đang dời nút đường: bám tâm ô nếu bật bám lưới. */
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
      if (nd) { view.setPreview(null); view.setMarker(nd, true); renderHint(nd.rb ? '<b>Nút thuộc vòng xuyến, không dời được</b>' : 'Bấm để nhấc <b>nút đường</b> này lên'); return; }
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
  if (t.kind === 'terra') {
    if (!hover) { view.setPreview(null); return; }
    const x0 = hover.x - ((brush - 1) >> 1), y0 = hover.y - ((brush - 1) >> 1);
    const tiles = rectTiles({ x: x0, y: y0 }, { x: x0 + brush - 1, y: y0 + brush - 1 }).filter(([x, y]) => x >= 0 && y >= 0 && x < S.N && y < S.N);
    const r = S.terraform(city, t.mode, hover.x, hover.y, { size: brush, target: stroke ? stroke.target : S.heightAt(city, hover.wx, hover.wz), dry: true });
    view.setPreview(tiles, !r.ok ? 0xff5b4a : t.mode === 'canal' ? 0x35b6ff : t.mode === 'dig' ? 0xc98a4a : t.mode === 'raise' ? 0x9bd86a : 0xffe680);
    if (stroke) renderHint(`${t.label}: đã chi <b>${money(stroke.spent)}</b>${t.mode === 'level' ? ` · san về cao độ ${stroke.target.toFixed(1)}` : ''} · nhả chuột để xong`);
    else renderHint(r.ok ? `${t.label} · cọ ${brush} × ${brush} ô · <b>${money(r.cost)}</b> mỗi lần áp · cao độ ${S.heightAt(city, hover.wx, hover.wz).toFixed(1)} (mặt nước ${S.WATER_LEVEL})` : `<b>${r.reason}</b>`);
    return;
  }
  if (t.kind === 'land') {
    if (!hover) { view.setPreview(null); renderHint(); return; }
    const lt = S.landOf(hover.x, hover.y), r = S.canBuyLand(city, lt), x0 = (lt % S.LT) * S.LAND, y0 = ((lt / S.LT) | 0) * S.LAND, n = [0, 0, 0, 0, 0, 0];
    const tiles = rectTiles({ x: x0, y: y0 }, { x: x0 + S.LAND - 1, y: y0 + S.LAND - 1 });
    for (const [x, y] of tiles) n[city.res[y * S.N + x]]++;
    const has = Object.values(S.RAW).filter((d) => n[d.id] > 3).map((d) => `${d.icon} ${d.name.toLowerCase()}`).join(', ');
    view.setPreview(tiles, city.owned[lt] ? 0xffffff : r.ok ? 0x62d98b : 0xff5b4a);
    renderHint(city.owned[lt] ? 'Ô đất này đã là của thành phố' : `Ô đất: <b>${money(r.price)}</b> · ${has ? `có ${has}` : 'không có tài nguyên'}${r.ok ? ' · bấm để mua' : ` · <b>${r.reason}</b>`}`);
    return;
  }
  if (t.kind === 'turn') {
    const n = hover && S.nodeAt(city, hover.wx, hover.wz, 14);
    view.setRibbon(null); view.setMarker(n ? { x: n.x, z: n.z } : null, !!n);
    if (!n) { renderHint('Bấm vào một nút giao để cắm hoặc đổi biển cấm rẽ'); return; }
    const arms = (city.adj.get(n.id) || []).length, cur = S.TURNS[n.turn | 0], nx = S.TURNS[((n.turn | 0) + 1) % S.TURNS.length];
    renderHint(arms < 2 ? '<b>Đầu đường cụt: xe phải quay đầu ở đây</b>' : n.rb ? '<b>Nút thuộc vòng xuyến</b>' : `Nút ${arms} nhánh · đang: <b>${cur.icon} ${cur.name}</b> · bấm để đổi sang <b>${nx.icon} ${nx.name}</b> (${nx.desc})`);
    return;
  }
  if (t.kind === 'bump') {
    const e = hover && S.edgeAt(city, hover.wx, hover.wz, 2);
    view.setMarker(null);
    if (!e) { view.setRibbon(null); renderHint('Bấm vào một đoạn đường để làm hoặc gỡ gờ giảm tốc'); return; }
    const bad = e.type === 'highway' || S.ROADS[e.type].elevated;
    view.setRibbon(e.pts, S.ROADS[e.type].w / 2, bad ? 0xff5b4a : 0xffc24a);
    renderHint(bad ? '<b>Không làm gờ giảm tốc trên cao tốc, cầu vượt</b>' : e.bump ? 'Đoạn này có gờ giảm tốc · bấm để <b>gỡ</b>' : `Bấm để làm <b>gờ giảm tốc</b> · ${money(S.BUMP_COST)} · xe chạy chậm lại, ít tai nạn`);
    return;
  }
  if (t.kind === 'sign') {
    const e = hover && S.edgeAt(city, hover.wx, hover.wz, 2);
    view.setMarker(null);
    if (!e) { view.setRibbon(null); renderHint('Bấm vào một đoạn đường để cắm hoặc đổi biển cấm'); return; }
    const cur = S.BANS[e.ban || 0], nx = S.BANS[((e.ban || 0) + 1) % S.BANS.length];
    view.setRibbon(e.pts, S.ROADS[e.type].w / 2, e.ban ? 0xff5b4a : 0xffc24a);
    renderHint(`${S.ROADS[e.type].name} · đang: <b>${cur.icon} ${cur.name}</b> · bấm để đổi sang <b>${nx.icon} ${nx.name}</b> (${nx.desc})`);
    return;
  }
  if (t.kind === 'node') {
    const n = hover && S.nodeAt(city, hover.wx, hover.wz, 14);
    view.setMarker(n ? { x: n.x, z: n.z } : null, !!n);
    if (!n) { renderHint(); return; }
    const arms = (city.adj.get(n.id) || []).length;
    if (tool === 'roundabout') { const r = S.canRoundabout(city, n.id); renderHint(r.ok ? `Làm vòng xuyến ở nút ${arms} nhánh · <b>${money(r.cost)}</b> · bấm để xây` : `<b>${r.reason}</b>`); }
    else renderHint(arms < 3 ? '<b>Chỉ đặt được ở ngã ba, ngã tư</b>' : n.rb ? '<b>Nút thuộc vòng xuyến</b>' : `Nút ${arms} nhánh · đang: <b>${S.JUNCTION_CTL[n.ctl | 0]}</b>${city.traffic.signals.has(n.id) ? ' 🚦' : ''} · bấm để đổi sang <b>${S.JUNCTION_CTL[((n.ctl | 0) + 1) % 3]}</b>`);
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
    if (roadMode === 'bridge') {
      const e = hover && S.edgeAt(city, hover.wx, hover.wz, 2);
      view.setMarker(null);
      if (!e) { view.setRibbon(null); renderHint(); return; }
      const wl = S.bridgeLen(city, e), same = S.bridgeOf(e) === bridgeStyle, cost = wl >= 4 && !same ? S.bridgeCost(city, e, bridgeStyle) : 0, ok = wl >= 4 && !same && cost <= city.money;
      view.setRibbon(e.pts, S.ROADS[e.type].w / 2, ok ? 0xffc24a : 0xff5b4a);
      renderHint(wl < 4 ? '<b>Đoạn đường này không bắc qua sông</b>' : same ? 'Cầu đã là kiểu đang chọn' : `Đổi ${S.BRIDGES[S.bridgeOf(e)].full.toLowerCase()} (${Math.round(wl)} m qua sông) thành <b>${S.BRIDGES[bridgeStyle].full.toLowerCase()}</b> · ${money(cost)}${ok ? '' : ' · <b>không đủ tiền</b>'}`);
      return;
    }
    if (roadMode === 'raise' || roadMode === 'lower') { // nâng / hạ một tầng: hầm ← mặt đất → cầu 1 → 2 → 3
      const e = hover && S.edgeAt(city, hover.wx, hover.wz, 2);
      view.setMarker(null);
      if (!e) { view.setRibbon(null); renderHint(roadMode === 'raise' ? 'Bấm vào một đoạn đường 2 làn, cầu vượt hoặc hầm để <b>nâng lên một tầng</b> (mỗi tầng 7 m)' : 'Bấm vào một đoạn cầu vượt, đường hoặc hầm để <b>hạ xuống một tầng</b>'); return; }
      const pl = S.planLevel(city, e.id, roadMode === 'raise' ? 1 : -1);
      view.setRibbon(e.pts, S.ROADS[e.type].w / 2, pl.ok ? 0xffc24a : 0xff5b4a);
      renderHint(pl.ok ? `${S.ROADS[e.type].name} → <b>${S.ROADS[pl.type].name}</b> · ${money(pl.cost)}${S.roadLvl(e.type) === 0 ? ' · nhà hai bên mất lối vào' : ''}` : `<b>${pl.reason}</b>`);
      return;
    }
    if (roadMode === 'upgrade') {
      const e = hover && S.edgeAt(city, hover.wx, hover.wz, 2);
      view.setMarker(null);
      if (!e) { view.setRibbon(null); renderHint(); return; }
      const same = e.type === t.type, cost = S.upgradeCost(e, t.type, city), ok = same ? t.type === 'oneway' : cost <= city.money;
      view.setRibbon(e.pts, S.ROADS[t.type].w / 2, ok ? 0xffc24a : 0xff5b4a);
      renderHint(same ? (t.type === 'oneway' ? 'Bấm để <b>đảo chiều</b> đoạn đường một chiều này' : 'Đoạn này đã là loại đường đang chọn') : `Đổi thành <b>${S.ROADS[t.type].name}</b> · ${money(cost)}${ok ? '' : ' · <b>không đủ tiền</b>'}`);
      return;
    }
    const needCtrl = roadMode === 'curve' && draw && !draw.ctrl;
    const sp = roadSnap(t.type, needCtrl);
    if (!sp) { view.setMarker(null); return; }
    const spH = S.snapHeight(city, sp) ?? (t.type === 'small' ? elevH : 0);
    view.setMarker(sp, sp.node != null || sp.edge != null || !!sp.guide, spH);
    if (!draw) { view.setRibbon(null); view.setPreview(null); renderHint(); return; }
    if (needCtrl) { // đang chọn điểm uốn: xem trước đường thẳng tới con trỏ
      view.setPreview(null);
      view.setRibbon(new Float32Array([draw.a.x, draw.a.z, sp.x, sp.z]), 0.6, 0xffffff);
      renderHint('Bấm để đặt <b>điểm uốn</b>, rồi bấm điểm cuối');
      return;
    }
    const spec = roadSpec(t, sp), plan = S.planRoad(city, spec);
    if (spec.bad) Object.assign(plan, { ok: false, reason: spec.bad });
    draw.plan = plan; draw.b = sp;
    view.setRibbon(plan.pts, S.ROADS[plan.type || t.type].w / 2, plan.ok ? 0xffffff : 0xff5b4a, plan.lift);
    const fx = S.roadPreview(city, plan), tiles = [];
    for (const i of fx.gain) tiles.push([i % S.N, (i / S.N) | 0, 0x5be38a]);
    for (const i of fx.lose) tiles.push([i % S.N, (i / S.N) | 0, 0xff5b4a]);
    view.setPreview(tiles);
    const pt = plan.type || t.type, lv = S.roadLvl(pt), guide = sp.guide ? ` · 📐 ${S.GUIDE_NAMES[sp.guide]}` : '';
    const hTxt = plan.custom ? ` <b>(${elevText(+plan.hA.toFixed(1))} → ${elevText(+plan.hB.toFixed(1))}, dốc ${Math.round((Math.abs(plan.hB - plan.hA) / Math.max(1, plan.len)) * 100)}%)</b>` : lv ? ` <b>(${LVL_NAME[lv]})</b>` : '';
    renderHint(`${S.ROADS[pt].name}${hTxt}: <b>${(plan.len / S.T).toFixed(1)} ô</b> · ${money(plan.cost)}${guide}${fx.gain.length ? ` · <span style="color:#5be38a">+${fx.gain.length} ô xây nhà</span>` : ''}${fx.lose.length ? ` · <span style="color:#ff7b6a">giải toả ${fx.lose.length} ô</span>` : ''}${S.LEVEL_CHAIN.includes(t.type) ? ` · PgUp/PgDn độ cao (đang ${elevText(curElev(t))})` : ''}${plan.ok && plan.fix ? ` · tự ${plan.fix.fill ? `đắp cửa hầm ${plan.fix.fill} ô ven sông` : ''}${plan.fix.fill && plan.fix.dredge ? ', ' : ''}${plan.fix.dredge ? 'nạo vét lòng sông' : ''}` : ''}${plan.ok ? '' : ` · <b>${plan.reason}</b>`}`);
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
  if (t.kind === 'rail') {
    if (!hover) { view.setMarker(null); return; }
    const sn = S.railSnap(city, hover.wx, hover.wz), p = sn || { x: hover.wx, z: hover.wz };
    if (!draw) { view.setMarker(p, !!sn); view.setRibbon(null); renderHint(sn ? `Bắt vào <b>${sn.ref.type === 'st' ? 'đầu ga tàu hoả' : sn.ref.type === 'gate' ? S.railGates(city)[sn.ref.k].name : 'đầu đường ray'}</b> · bấm để bắt đầu vẽ ray` : '<b>Bấm vào đầu ga tàu hoả, cửa khẩu hoặc đầu đường ray có sẵn để bắt đầu</b>'); return; }
    const b = sn && Math.hypot(sn.x - draw.a.x, sn.z - draw.a.z) > 10 ? sn : null, pl = railPlanTo(p, b);
    view.setMarker(p, pl.ok);
    view.setRibbon(pl.pts || new Float32Array([...draw.pts, p.x, p.z]), 1.8, pl.ok ? 0xffe680 : 0xff5b4a);
    renderHint(`🛤️ ${pl.len ? railText(pl) : ''}${b ? ` · nối vào <b>${b.ref.type === 'gate' ? S.railGates(city)[b.ref.k].name : b.ref.type === 'st' ? 'ga' : 'đầu ray'}</b>` : ''}${pl.ok ? '' : ` · <b>${pl.reason}</b>`}`);
    return;
  }
  if (t.kind === 'transit') {
    const p = transitPoint(t.mode);
    if (!p) { view.setMarker(null); return; }
    view.setMarker(p, p.ok);
    const pts = [...(draw ? draw.stops : []), p], flat = new Float32Array(pts.length * 2);
    pts.forEach((q, k) => { flat[k * 2] = q.x; flat[k * 2 + 1] = q.z; });
    view.setRibbon(pts.length > 1 ? flat : null, 1.1, p.ok ? 0xffe680 : 0xff5b4a);
    if (draw) { const plan = S.planTransit(city, t.mode, pts); renderHint(`${S.TRANSIT[t.mode].name}: <b>${pts.length} trạm</b> · ${money(plan.cost)}${plan.ok ? ' · chuột phải / Enter để chốt' : ` · <b>${plan.reason}</b>`}`); } else renderHint(p.ok ? null : '<b>Trạm phải nằm trên đường mặt đất</b>');
    return;
  }
  // quy hoạch, san ủi: kéo hình chữ nhật
  if (!hover && !drag) { view.setPreview(null); return; }
  const a = drag ? drag.from : hover, b = hover || drag.to || a;
  if (drag) drag.to = b;
  const tiles = rectTiles(a, b);
  if (t.kind === 'bulldoze') view.setPreview(tiles, 0xff5b4a);
  else if (t.kind === 'decor') {
    const ok = t.erase ? tiles.filter(([x, y]) => city.decor[y * S.N + x]) : tiles.filter(([x, y]) => S.decorOk(city, y * S.N + x) && city.decor[y * S.N + x] !== S.DECOR[t.decor].id);
    view.setPreview(ok, t.erase ? 0xff5b4a : { tree: 0x3f8f3a, grass: 0x7fd35a, path: 0xd9cdb4, flower: 0xef6f9a }[t.decor]);
    if (drag || hover) renderHint(ok.length ? `${t.label}: <b>${ok.length} ô</b>${t.erase ? '' : ` · ${money(ok.length * S.DECOR[t.decor].cost)}`}` : t.erase ? 'Không có ô trang trí nào ở đây' : '<b>Chỉ trang trí được trên đất trống</b> (không đường, nhà, công trình, nước, đất quá dốc)');
    return;
  }
  else if (t.kind === 'falls') {
    const ok = t.erase ? tiles.filter(([x, y]) => city.falls[y * S.N + x]) : tiles.filter(([x, y]) => S.fallsOk(city, y * S.N + x) && !city.falls[y * S.N + x]);
    view.setPreview(ok, t.erase ? 0xff5b4a : 0x7fd0f0);
    if (drag || hover) {
      const r = !t.erase && drag && ok.length ? S.paintFalls(city, drag.from.x, drag.from.y, (drag.to || hover).x, (drag.to || hover).y, { dry: true }) : null;
      renderHint(ok.length ? `${t.label}: <b>${ok.length} ô</b>${t.erase ? '' : ` · ${money(ok.length * S.FALLS.cost)}${r && r.drop != null ? ` · chênh cao ${r.drop.toFixed(1)} m` : ''}${r && !r.ok ? ` · <b>${r.reason}</b>` : ''}`}` : t.erase ? 'Không có ô thác nào ở đây' : '<b>Tô thác trên đất trống từ đỉnh dốc xuống chân dốc</b>');
    }
    return;
  }
  else if (t.kind === 'beach') {
    const ok = t.erase ? tiles.filter(([x, y]) => city.beach[y * S.N + x]) : tiles.filter(([x, y]) => S.beachOk(city, y * S.N + x));
    view.setPreview(ok, t.erase ? 0xff5b4a : 0xf2d98a);
    if (drag || hover) renderHint(ok.length ? `${t.label}: <b>${ok.length} ô</b>${t.erase ? '' : ` · ${money(ok.length * S.BEACH.cost)}`}` : t.erase ? 'Không có ô bãi biển nào ở đây' : `<b>Chỉ tô được trên đất trống cách biển tối đa ${S.BEACH.reach} ô</b> (sông, hồ không được)`);
    return;
  }
  else view.setPreview(t.zone ? tiles.filter(([x, y]) => (city.acc[y * S.N + x] && city.own[y * S.N + x] && S.hasResource(city, y * S.N + x, t.zone)) || (t.zone === 12 && S.fisheryOk(city, y * S.N + x))) : tiles, S.ZDEF[t.zone].color); // ngư nghiệp: cả mặt nước có cá
  if (drag) renderHint(`${t.label}: <b>${Math.abs(a.x - b.x) + 1} × ${Math.abs(a.y - b.y) + 1} ô</b>`);
}

/** Một lần bấm (hoặc thả sau khi kéo) của công cụ đường / dây. */
function drawClick(fromDrag) {
  const t = toolInfo(tool);
  if (t.kind === 'road') {
    if (roadMode === 'bridge') {
      if (fromDrag) return;
      const e = hover && S.edgeAt(city, hover.wx, hover.wz, 2);
      if (!e) return;
      const r = S.setBridge(city, e.id, bridgeStyle);
      if (!r.ok) toast(r.reason); else toast(`${S.BRIDGES[bridgeStyle].icon} Đã đổi thành ${S.BRIDGES[bridgeStyle].full.toLowerCase()} · ${money(r.cost)}`);
      updatePreview(); updateHud(true);
      return;
    }
    if (roadMode === 'raise' || roadMode === 'lower') {
      if (fromDrag) return;
      const e = hover && S.edgeAt(city, hover.wx, hover.wz, 2);
      if (!e) return;
      const r = S.changeLevel(city, e.id, roadMode === 'raise' ? 1 : -1);
      toast(r.ok ? `${roadMode === 'raise' ? '⏫ Đã nâng' : '⏬ Đã hạ'} thành ${S.ROADS[r.type].name.toLowerCase()} · ${money(r.cost)}` : r.reason);
      updatePreview(); updateHud(true);
      return;
    }
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
    if (!draw) { if (!fromDrag) draw = { a: { ...sp, h: S.snapHeight(city, sp) ?? (t.type === 'small' ? elevH : 0) } }; updatePreview(); return; }
    if (needCtrl) { if (!fromDrag) draw.ctrl = { x: sp.x, z: sp.z }; updatePreview(); return; }
    const spec = roadSpec(t, sp);
    if (spec.bad) { toast(spec.bad); return; }
    const r = S.buildRoad(city, spec);
    if (r.ok && r.fix) toast(`🕳️ Hầm qua sông: ${r.fix.fill ? `đắp cửa hầm ${r.fix.fill} ô ven sông` : ''}${r.fix.fill && r.fix.dredge ? ', ' : ''}${r.fix.dredge ? 'nạo vét lòng sông cho đủ sâu' : ''}`);
    if (!r.ok) { if (!fromDrag || r.reason !== 'Đoạn quá ngắn') toast(r.reason); if (fromDrag) return; }
    else draw = { a: { x: sp.x, z: sp.z, node: r.endNode, h: S.nodeH(city, r.endNode) } }; // vẽ nối tiếp từ điểm cuối
    updatePreview(); updateHud(true);
    return;
  }
  if (t.kind === 'rail') {
    if (fromDrag || !hover) return;
    if (t.locked) { toast(`Đường ray mở cùng ga tàu hoả: ${S.lockText(S.SERVICES.train, city)}`); return; }
    const sn = S.railSnap(city, hover.wx, hover.wz);
    if (!draw) { if (!sn) { toast('Bắt đầu từ đầu ga tàu hoả, cửa khẩu hoặc đầu một đường ray'); return; } draw = { rail: true, a: sn, pts: [sn.x, sn.z] }; updatePreview(); renderHint(); return; }
    if (sn && Math.hypot(sn.x - draw.a.x, sn.z - draw.a.z) > 10) { finishRail(sn); return; }
    const lx = draw.pts[draw.pts.length - 2], lz = draw.pts[draw.pts.length - 1];
    if (Math.hypot(hover.wx - lx, hover.wz - lz) < 12) return;
    draw.pts.push(hover.wx, hover.wz);
    updatePreview();
    return;
  }
  if (t.kind === 'transit') {
    if (fromDrag) return;
    const p = transitPoint(t.mode);
    if (!p || !p.ok) return;
    if (t.locked) { toast(`${S.TRANSIT[t.mode].name} mở khoá khi đạt ${fmt(S.TRANSIT[t.mode].unlock)} dân`); return; }
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
    if (nd) { if (nd.rb) { toast('Nút thuộc vòng xuyến, không dời được'); return; } moving = { kind: 'node', id: nd.id }; }
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

/** Áp cọ đào đắp một lần tại ô đang trỏ (gọi lặp lại trong lúc giữ chuột). */
function strokeStep(first) {
  if (!stroke || !hover) return;
  const t = toolInfo(tool), key = hover.y * S.N + hover.x;
  if (t.mode === 'canal' && key === stroke.last) return; // kênh: mỗi ô một lần là đủ
  stroke.last = key;
  const r = S.terraform(city, t.mode, hover.x, hover.y, { size: brush, target: stroke.target });
  if (r.ok) { stroke.spent += r.cost; stroke.did = true; } else if (first || r.reason === 'Không đủ tiền') { if (stroke.said !== r.reason) toast(r.reason); stroke.said = r.reason; }
  updatePreview();
}

/** Nhả chuột: chốt lượt đào đắp, tính lại tài nguyên và bờ nước. */
function endStroke() {
  if (!stroke) return;
  const did = stroke.did;
  stroke = null;
  if (did) { S.terraformDone(city); updateHud(true); }
  if (view) updatePreview();
}

function commitDrag() {
  if (!drag) return;
  const a = drag.from, b = drag.to || a, t = toolInfo(tool);
  drag = null;
  const r = t.kind === 'bulldoze' ? S.bulldozeRect(city, a.x, a.y, b.x, b.y) : t.kind === 'decor' ? S.paintDecor(city, a.x, a.y, b.x, b.y, t.decor, { erase: t.erase }) : t.kind === 'falls' ? S.paintFalls(city, a.x, a.y, b.x, b.y, { erase: t.erase }) : t.kind === 'beach' ? S.paintBeach(city, a.x, a.y, b.x, b.y, { erase: t.erase }) : S.zoneRect(city, a.x, a.y, b.x, b.y, t.zone);
  if (r && r.ok && t.kind === 'falls') toast(t.erase ? `Đã xoá ${r.count} ô thác` : `💦 Thác nước ${r.count} ô · chênh cao ${r.drop.toFixed(1)} m · ${money(r.cost)}`);
  if (r && r.ok && t.kind === 'decor') toast(t.erase ? `Đã xoá trang trí ${r.count} ô` : `${t.icon} ${t.label}: ${r.count} ô · ${money(r.cost)}`);
  if (r && r.ok && t.kind === 'beach') toast(t.erase ? `Đã xoá ${r.count} ô bãi biển` : `🏖️ Đã làm ${r.count} ô bãi biển · ${money(r.cost)}`);
  if (r && !r.ok && r.reason) toast(r.reason);
  renderHint(); updatePreview(); updateHud(true);
}

// ───────────────────────── bảng thông tin ─────────────────────────

const face = (h) => (h >= 65 ? '😊' : h >= 45 ? '😐' : '😟');

function showInfo(tile) {
  $('info').dataset.wx = tile.wx; $('info').dataset.wz = tile.wz; // cho nút 🎯
  const i = tile.y * S.N + tile.x, c = city, rows = [];
  let title = 'Ô đất', needs = null, mods = null, canal = null, seaRun = null;
  const add = (k, v) => rows.push(`<div class="row"><span>${k}</span><span>${v}</span></div>`);
  const state = (v) => ['✖ không có', '✔ đủ', '⚠ thiếu'][v];
  const edge = S.edgeAt(c, tile.wx, tile.wz, 0);
  if (c.occ[i]) {
    const sv = c.services[c.occ[i] - 1], d = S.SERVICES[sv.type];
    const val = (k) => S.svcVal(sv, k), up = d.upkeep + (sv.mods || []).reduce((n, m) => n + S.moduleUpkeep(sv.type, m), 0);
    title = `${d.icon} ${d.name}`;
    add('Phí duy trì', `${fmt(up * S.upkeepRate(city))} ₫/ngày`);
    if (d.power) add('Công suất điện', val('power'));
    if (sv.type === 'hydro') add('Thân đập', sv.dam ? `dài ${sv.dam.cells.length} ô · cột nước ${sv.dam.head} m · lưu lượng ${sv.dam.q.toFixed(1)} · ${S.seasonFlow(c) > 1 ? 'mùa nước lớn ↑' : S.seasonFlow(c) < 1 ? 'mùa khô ↓' : 'nước bình thường'}` : '✖ không chắn được sông ở chỗ này');
    if (d.water) add('Công suất nước', val('water'));
    if (d.sewage) add('Nhận nước thải', val('sewage'));
    if (d.trash) add('Rác xử lý hôm nay', `${fmt(sv.processed || 0)} / ${val('trash')}`);
    if (d.students) add('Học sinh', `${sv.used || 0} / ${val('students')}`);
    if (d.trucks || d.ambulances || d.hearses) add('Xe đang đi làm nhiệm vụ', `${sv.out || 0} / ${val('trucks') || val('ambulances') || d.hearses}`);
    if (d.graves) add('Phần mộ đã dùng', `${fmt(sv.fill || 0)} / ${d.graves}${(sv.fill || 0) >= d.graves ? ' · <span class="neg">đã đầy</span>' : ''}`);
    if (d.cremate) add('Hoả táng hôm nay', `${sv.burned || 0} / ${d.cremate}`);
    if (d.cells) add('Người đang bị giam (cả thành phố)', `${fmt(c.stats.prisoners)} / ${fmt(c.stats.prisonCap)}`);
    if (d.research) add('Tiến độ điểm phát triển kế tiếp', `${Math.floor(c.research)}% · ${fmt(c.pstats.edu[3])} người học đại học`);
    if (d.depot) { const f = S.roadFleet(c); add('Xe buýt + tàu điện đang chạy', `${f.used} / ${f.cap}`); }
    if (d.tows) add('Xe cứu hộ đang đi', `${sv.out || 0} / ${val('trucks')}`);
    if (d.cars) add('Xe công an đang đi', `${sv.out || 0} / ${val('cars')}`);
    if (d.recycle) add('Bán phế liệu', `≈ ${fmt((sv.processed || 0) * d.recycle)} ₫ hôm nay`);
    if (d.spots) add('Xe đang đỗ', `${sv.cell >= 0 ? c.parked[sv.cell] : 0} / ${val('spots')}`);
    if (d.radius) add('Bán kính phục vụ', `${val('radius')} ô`);
    if (d.bonus) add('Cả thành phố', [d.bonus.happy && `hài lòng +${d.bonus.happy}`, d.bonus.comm && `thuế thương mại +${Math.round(d.bonus.comm * 100)}%`, d.bonus.pull && 'hút dân tới ở'].filter(Boolean).join(', '));
    if ((sv.type === 'airport' || sv.type === 'airportIntl' || sv.type === 'port' || sv.type === 'ferry') && c.intl) {
      const inc = c.intl.sched.filter((e) => e.uid === sv.uid && !e.landed);
      if (sv.type === 'airport' || sv.type === 'airportIntl') { const o = S.intlOutlook(c); add('Loại', S.isIntlAirport(sv) ? '🌏 Sân bay quốc tế: chuyến nội địa và quốc tế' : '🛫 Sân bay nội địa · gắn module 🌏 Nhà ga quốc tế bên dưới để đón chuyến quốc tế'); add('Bay nội địa', `~${o.dom.toFixed(1)} chuyến/ngày (cả thành phố) · ~${fmt(o.flyPer)} dân bay đi mỗi chuyến`); }
      add('Chuyến đang tới', inc.length ? inc.map((e) => `${e.dom ? '🛫' : e.kind === 'plane' ? '✈️' : '🚢'} ${e.code} (${e.tourists} khách)`).join(', ') : 'chưa có');
    }
    if (sv.type === 'airport' && S.isIntlAirport(sv)) title = `${d.icon} Sân bay quốc tế`;
    if (sv.type === 'dhall') { const dq = c.dist.list.findIndex((q) => q.hall === sv.uid), q = c.dist.list[dq]; if (q) { title = `🏛️ Trụ sở UBND ${q.name}`; add('Chủ tịch', `${esc(q.chair)} · ${S.PERSONAS[q.persona].name} · ${S.MODES[q.mode]}`); add('Chương trình', `${S.PKEYS.filter((k) => q.prog[k]).map((k) => S.PROGRAMS[k].icon + q.prog[k]).join(' ') || 'chưa có'} · ${money(S.planCost(q, q.prog))}/ngày`); } }
    if (sv.dq) add('Công trình quận', esc(`🏗️ ${sv.dq} xây (chủ tịch ${sv.dby || '?'})`));
    if (d.beds) { const sc = c.tour.score || S.tourismScore(c); add('Phòng (cả thành phố)', `${fmt(c.tour.guests)} khách / ${fmt(sc.beds)} giường · ${c.tour.roomFee} ₫/đêm`); }
    if (d.attract) add('Sức hút du lịch', `+${d.attract}`);
    if (sv.type === 'ferry') {
      const st = (c.ferryState || {})[sv.uid], fl = (c.ferries || []).find((l) => l.stops.some((s) => s.uid === sv.uid));
      add('Tuyến tàu', st === 'line' ? `✔ nối ${fl ? fl.stops.filter((t) => t.uid != null).length - 1 : '?'} bến khác · ${fmt(fl ? fl.ridersDay : 0)} vé hôm qua${fl && fl.isle ? ` · 🏝️ ${fmt(fl.islandersDay || 0)} du khách ra đảo` : ''}${fl && fl.out ? ` · 🌊 có chuyến ra biển, ${fmt(fl.guestsDay || 0)} du khách tới` : ''}` : st === 'sea' ? `✔ chạy ra cửa biển · ${fmt(fl ? fl.guestsDay : 0)} du khách tới hôm qua` : st === 'cruise' ? `✔ du ngoạn quanh hồ · ${fmt(fl ? fl.ridersDay : 0)} vé hôm qua (thêm bến cùng hồ để thành tuyến, hoặc bấm ⛏️ Đào kênh ra biển bên dưới để đón du khách)` : st === 'pond' ? '⚠ mặt nước quá nhỏ cho tàu chạy' : st === 'close' ? '⚠ quá sát bến khác (chung chỗ cập tàu): dời bến ra xa hơn' : st === 'dry' ? '✖ không sát mặt nước' : 'đang dựng tuyến…');
      add('Giá vé', `${c.transit.ferryFare ?? 4} ₫ (chỉnh ở bảng 👥)`);
      const stop = fl && fl.stops.find((t) => t.uid === sv.uid);
      if (stop && stop.isl >= 0) add('🏝️ Bến trên đảo', `sức hút ${(fl.isles.find((x) => x.id === stop.isl) || { att: 0 }).att} · ${fmt(stop.stay || 0)} du khách đang chơi trên đảo`);
      if (st === 'line') seaRun = { k: c.occ[i] - 1, on: !!(fl && (fl.out || fl.seaFail)), fail: !!(fl && fl.seaFail) };
      if (st === 'cruise' || st === 'pond') canal = { k: c.occ[i] - 1, plan: S.planSeaCanal(c, c.occ[i] - 1) };
    }
    if (d.outside) add('Cửa ngõ xuất nhập khẩu', sv.cell >= 0 ? '✔ xe tải ra vào được' : '✖ chưa sát đường');
    if (sv.type === 'train') {
      const st = S.railNet(c).stations.find((x) => x.s === sv), last = c.rail.last;
      add('Đường ray ra cửa khẩu', st && st.route ? `✔ thông ra ${st.gate.name} (${(st.route.len / 1000).toFixed(2).replace('.', ',')} km)` : '✖ chưa có · dùng 🛤️ Đường ray vẽ từ đầu ga ra cửa khẩu ở mép bản đồ');
      if (st && st.route) add('Tàu liên vận', `${S.TRAIN_HOURS.map((h) => `${h}h`).join(', ')} mỗi ngày${last ? ` · hôm qua ${last.trains} chuyến, ${fmt(last.tourists)} du khách, ${fmt(last.immig)} người tới ở, ${fmt(last.out)} người đi, vé ${money(last.fees)}` : ''}`);
    }
    if (d.power || d.water || d.sewage) add('Nối mạng', sv.linked ? '✔ đã nối' : '✖ chưa, kéo dây / ống tới đường');
    mods = { k: c.occ[i] - 1, list: S.moduleList(c, sv) };
  } else if (edge) {
    const d = S.ROADS[edge.type], load = S.edgeLoad(c, edge);
    title = `${d.icon} ${d.name}`;
    add('Chiều dài', `${(edge.len / S.T).toFixed(1)} ô`);
    add('Bảo trì', `${fmt(edge.len * d.upkeep * S.upkeepRate(city))} ₫/ngày`);
    add('Mức đông xe', load > 0.7 ? '🔴 kẹt' : load > 0.35 ? '🟡 đông' : '🟢 thoáng');
    const wear = edge.wear || 0;
    add('Mặt đường', `${wear > 0.6 ? '🔴 hư hỏng nặng' : wear > 0.3 ? '🟡 xuống cấp' : '🟢 tốt'} (${Math.round(wear * 100)}% mòn) · dễ tai nạn hơn khi mòn, trạm 🚧 bảo trì sửa dần`);
    const acc = c.inc.accidents.filter((a) => a.edge === edge).length;
    if (acc) add('Tai nạn trên đoạn này', `💥 ${acc} vụ, đang chờ công an / cứu hộ`);
    if (edge.ban) add('Biển cấm', `${S.BANS[edge.ban].icon} ${S.BANS[edge.ban].name}`);
    if (edge.dban) add('Quận', `🚚 cấm xe tải nặng (Quận ${edge.dban})`);
    if (edge.bump) add('Gờ giảm tốc', `〰️ có · xe chạy còn ${Math.round(S.BUMP_SLOW * 100)}% tốc độ`);
    add('Nút giao hai đầu', [edge.a, edge.b].map((n) => { const nd = c.nodes.get(n); return `${c.adj.get(n).length} nhánh${c.traffic.signals.has(n) ? ' 🚦' : ''}${nd.ctl === 2 ? ' 🛑' : ''}${nd.rb ? ' ⭕' : ''}`; }).join(' · '));
    { const wl = S.bridgeLen(city, edge); if (wl >= 4) { const B = S.BRIDGES[S.bridgeOf(edge)]; add('Cầu', `${B.icon} ${B.name} · ${Math.round(wl)} m qua sông · phí ${fmt(Math.round(wl * B.upkeep * S.upkeepRate(city)))} ₫/ngày (đổi kiểu: công cụ Đường → 🌉 Đổi cầu)`); } }
    if (d.elevated) { const lv = S.roadLvl(edge.type); add('Tầng', lv < 0 ? 'Hầm chui: chìm dưới mặt đất, đường bên trên bắc qua' : lv > 1 ? 'Cầu tầng 2: bắc qua cả cầu tầng 1 lẫn đường dưới đất' : 'Trên cao: bắc qua đường dưới, không có nhà hai bên'); }
  } else if (c.water[i]) { title = c.fishery && c.fishery[i] ? '🎣 Ngư trường' : '🌊 Mặt nước'; if (c.fishery && c.fishery[i]) add('Ngư trường', 'Tàu cá của các bến cá trong ' + S.FISHERY.reach + ' ô ra đây đánh bắt; nước càng sạch càng nhiều cá'); add('Ô nhiễm nước', `${Math.round(c.waterPol[i] * 100)}%`); const fv = S.flowAt(c, i); add('Dòng chảy', `${S.flowName(fv)} (${Math.round(fv * 100)}%)${S.seasonFlow(c) > 1 ? ' · mùa nước lớn' : S.seasonFlow(c) < 1 ? ' · mùa khô, nước cạn' : ''}${c.damCell && c.damCell[i] ? ' · 🏞️ thân đập thuỷ điện' : ''}`); }
  else {
    const z = c.zone[i], L = c.level[i], zd = S.ZDEF[z];
    const kind = c.ware && c.ware[i] ? 'ware' : S.bizKind(c, i); // kho bãi của công ty: không sản xuất
    const need = kind === 'market' ? S.RAW[S.needOf(c, i)] : null;
    const prod = kind === 'factory' ? S.PRODUCTS[S.productOf(c, i)] : null, rec = kind === 'factory' ? S.recipeOf(c, i) : null; // chuỗi sản xuất nhiều tầng
    const mname = (k) => S.MKT_NAME[k] || k;
    const dq = S.districtOf(c, i); if (dq >= 0) add('Quận', `${c.dist.list[dq].name} · chủ tịch ${c.dist.list[dq].chair}`);
    title = L && kind === 'ware' ? `🏗️ Kho bãi, logistics cấp ${L}` : L ? `${zd.icon} ${prod ? `${z === 21 ? 'Xưởng' : 'Nhà máy'} ${prod.icon} ${prod.name.toLowerCase()}` : zd.name} cấp ${L}` : z ? zd.name : !c.own[i] ? 'Đất chưa mua' : c.acc[i] ? 'Ô đất cạnh đường' : 'Đất trống';
    if (L) {
      const h = S.cellHappy(c, i), rc = S.resCap(z, L), jb = S.jobCap(z, L);
      if (rc) {
        add('Cư dân', `${c.resCount[i]} / ${rc}`);
        let hs = 0, n = 0, edu = 0, kids = 0;
        for (let id = 0; id < c.pp.n; id++) if (c.pp.alive[id] && c.pp.home[id] === i) { hs += c.pp.happy[id]; n++; if (c.pp.age[id] < 18) kids++; else edu += c.pp.edu[id]; }
        if (n) { add('Hài lòng', `${face(hs / n)} ${Math.round(hs / n)}%`); add('Trẻ em · học vấn TB', `${kids} · ${n - kids ? S.EDU_NAME[Math.round(edu / (n - kids))] : '–'}`); }
        add('Tiền thuê', `${(S.rentAt(c, i) * (zd.who === 'student' ? 0.4 : 1)).toFixed(1)} ₫/ngày mỗi người lớn`);
        if (zd.who) add('Dành cho', zd.who === 'senior' ? 'Người từ 65 tuổi' : 'Sinh viên đại học 18–24 tuổi');
        if (c.dead[i]) add('Người mất chờ xe tang', `${c.dead[i]}${c.hearseTo[i] ? ' · 🚐 xe đang tới' : ''}`);
      }
      if (jb) {
        const b = c.biz;
        add('Nhân viên', `${c.staff[i]} / ${jb} (đang có mặt ${c.present[i]})`);
        add('Lương · yêu cầu', `${S.wageAt(c, i).toFixed(2)} ₫/giờ · ${S.EDU_NAME[S.reqEdu(z, L)].toLowerCase()}`);
        { // chủ sở hữu: công ty nào, thuộc tập đoàn nào (công ty là lớp sở hữu phủ lên ô, corp.js)
          const q = c.owner && c.owner[i] ? S.corpById(c, c.owner[i]) : null, root = q && S.corpById(c, S.rootOf(c, q.id));
          if (q) add('Thuộc', `🏢 ${S.corpTitle(q)}${root && root !== q ? ` · nhóm ${S.corpTitle(root)}` : ''}${c.ware && c.ware[i] ? ' · kho bãi' : ''}`);
          else if (kind === 'factory' || kind === 'raw' || kind === 'shop' || kind === 'market') add('Thuộc', 'Doanh nghiệp độc lập');
        }
        add('Tiền của doanh nghiệp', `<span class="${b.money[i] < 0 ? 'neg' : ''}">${fmt(b.money[i])} ₫</span>`);
        if (kind === 'market') add(`${need.icon} ${need.name} trên sạp`, `${b.sin[i].toFixed(1)}${b.incoming[i] ? ' · 🚚 xe hàng đang tới' : ''}`);
        if (kind === 'factory') {
          add('Làm ra', `${prod.icon} ${prod.name} từ ${rec.map(mname).join(' + ')}${prod.tier ? ' (tầng 2: cần đủ cả hai)' : ''} · giá gốc ${fmt(S.priceOf(S.productOf(c, i)))} ₫`);
          rec.forEach((k, j) => add(`${mname(k)} trong kho`, `${(j ? b.sin2[i] : b.sin[i]).toFixed(1)}${b.incoming[i] ? ' · 🚚 xe hàng đang tới' : ''}`));
        }
        if (kind === 'ware') { const own = c.owner[i], st = (c.corpStore && c.corpStore[own]) || 0; add('Kho bãi', `Thêm ${st} chỗ chứa cho mỗi cơ sở sản xuất của cả nhóm (theo cấp kho và số người làm) · hàng trong nhóm giao nhanh hơn · xuất khẩu theo lô 24`); add('Thu phí lưu kho', 'Công ty trả theo lương, chi phí cố định, có lãi một phần'); }
        if (kind === 'shop' || kind === 'market') add('Giá bán lẻ', `<span class="${(b.rp[i] || 1) > 1.1 ? 'neg' : ''}">×${(b.rp[i] || 1).toFixed(2)}</span> so với giá gốc · ${b.sin[i] < 6 ? 'kệ gần cạn, giá đang lên' : b.sin[i] > 25 ? 'hàng ứ, đang hạ giá' : 'cung cầu cân bằng'}`);
        if (kind === 'shop') add('Hàng trong kho', `${b.sin[i].toFixed(1)} · giá trị TB ×${(b.sinK[i] || 1).toFixed(2)}${b.incoming[i] ? ' · 🚚 xe hàng đang tới' : ''}`);
        if (kind === 'raw') { const left = S.reserveLeft(c, i, zd.raw), R = S.RESERVE[zd.raw]; add('Trữ lượng còn', `${Math.round(left * 100)}%${R.regen ? ` · tự hồi ${Math.round(R.regen * 100)}% mỗi ngày` : ' · không tái tạo'}`); }
        if (kind === 'factory' || kind === 'raw') add(kind === 'raw' ? `${S.RAW[zd.raw].icon} ${S.RAW[zd.raw].name} chờ xe tới chở` : 'Thành phẩm chờ xuất', b.sout[i].toFixed(1));
        add('Hiệu quả', `${Math.round(b.eff[i] * 100)}%`);
        add('Chỗ đỗ xe', `${c.parked[i]} xe`);
      }
      if (z === 12) add('Ngư trường quanh bến', `sản lượng ×${S.fisheryMul(c, i).toFixed(2)}${S.fisheryMul(c, i) <= 1 ? ' · tô Ngư nghiệp lên mặt nước có cá gần bến để tàu ra đánh bắt' : ''}`);
      const hint = S.levelHint(c, i);
      if (hint) add('Lên cấp cần', hint);
      needs = h.needs;
      if (jb && c.staff[i] < jb * 0.5) needs = [...needs, 'Thiếu người làm'];
      if (c.fire[i]) needs = ['🔥 Đang cháy!', ...needs];
    } else if (z) add('Tình trạng', !c.acc[i] ? 'Không còn cạnh đường' : c.pOk[i] !== 1 ? 'Chờ có điện' : c.wOk[i] !== 1 ? 'Chờ có nước' : c.sOk[i] !== 1 ? 'Chờ có chỗ xả nước thải' : 'Chờ có nhu cầu');
    else if (c.steep[i]) add('Quy hoạch', 'Đất quá dốc, chỉ làm đường được');
    else if (!c.acc[i]) add('Quy hoạch', 'Phải nằm trong 2 ô cạnh đường');
    if (c.tree[i]) add('Cây xanh', 'Có');
    if (c.railCell && c.railCell[i]) { title = '🛤️ Đường ray'; add('Đường sắt', 'Không quy hoạch, xây nhà trên ô có ray · san ủi để dỡ cả đoạn ray'); }
    if (c.falls && c.falls[i]) { const fi = S.fallsInfo(c), f = fi.list[fi.comp[i]]; title = '💦 Thác nước'; if (f) add('Thác', `${f.cells.length} ô · cao ${f.drop.toFixed(1)} m · ${f.steps} bậc thác đổ · ${fi.to[i] < 0 ? 'hồ dưới chân' : 'nước chảy xuống ô thấp hơn'}`); add('Sức hút du lịch (mọi thác)', `+${S.fallsAttract(c).toFixed(1)}`); }
    { const dd = S.decorById(c.decor[i]); if (dd) { title = `${dd.icon} ${dd.name}`; add('Trang trí', `${dd.desc} · phí ${dd.upkeep} ₫/ngày`); } }
  }
  const rs = Object.values(S.RAW).find((d) => d.id === c.res[i]);
  if (rs && !edge) add('Tài nguyên', `${rs.icon} ${rs.id === 5 ? 'Vùng nước có cá' : rs.id === 1 ? 'Đất màu mỡ' : rs.id === 2 ? 'Rừng' : rs.name}`);
  else if (c.fishShore[i] && !edge && !c.water[i]) add('Tài nguyên', '🐟 Bờ sát vùng nước có cá');
  if (!c.water[i] && !edge) {
    if (c.acc[i]) { add('Điện · nước · thoát nước', [c.pOk[i], c.wOk[i], c.sOk[i]].map((v) => state(v).slice(0, 1)).join(' · ')); }
    add('Giá trị đất', `${Math.round(c.landValue[i])} / 100`);
    add('Ô nhiễm khí · đất · ồn', `${Math.round(c.air[i] * 100)}% · ${Math.round(c.ground[i] * 100)}% · ${Math.round(c.noise[i] * 100)}%`);
    if (c.level[i]) add('Rác tồn', c.garbage[i].toFixed(0));
    const cv = c.cover, tag = (v) => (v > 0.05 ? '✔' : '–');
    add('Công viên · Y tế · Trường', `${tag(cv.park[i])} · ${tag(cv.health[i])} · ${tag(cv.edu[i])}`);
    add('Công an · Cứu hoả · Tang lễ', `${tag(cv.police[i])} · ${tag(cv.fire[i])} · ${tag(cv.death[i])}`);
    if (c.level[i] && c.crime[i] > 0.02) add('Tội phạm', `${Math.round(c.crime[i] * 100)}%`);
  }
  $('iTitle').textContent = title; $('iBody').innerHTML = rows.join('');
  if (needs) {
    const ul = el('ul', 'needs');
    if (!needs.length) ul.append(el('li', 'ok', '✔ Không thiếu gì'));
    for (const n of needs) ul.append(el('li', null, `✖ ${n}`));
    $('iBody').append(ul);
  }
  if (seaRun) { // tuyến nhiều bến: bật / tắt chuyến ra biển
    const row = el('div', 'slot'), info = el('div'), b = el('button', seaRun.on ? 'mini' : 'mini acc', seaRun.on ? 'Tắt' : 'Bật');
    info.append(el('b', null, '🌊 Chuyến ra biển'), el('small', seaRun.fail ? 'neg' : null, seaRun.fail ? 'Đang bật nhưng mặt nước này không thông ra biển: đào kênh hoặc dời bến' : seaRun.on ? 'Tàu chạy hết tuyến rồi ra cửa biển: đón du khách từ ngoài vào, chở dân đi chơi xa (thêm 1 tàu)' : 'Nối thêm chặng từ đầu tuyến gần biển nhất ra cửa biển: đón du khách, chở dân đi chơi xa'));
    b.addEventListener('click', () => { const r = S.setFerrySea(city, seaRun.k, !seaRun.on); toast(!r.ok ? r.reason : r.out ? '🌊 Tuyến tàu có thêm chuyến ra biển' : r.fail ? '⚠ Mặt nước không thông ra biển' : 'Đã tắt chuyến ra biển'); showInfo(tile); updateHud(true); });
    row.append(info, b); $('iBody').append(row);
  }
  if (canal) { // hồ kín: game tự tìm đường kênh ra biển, bấm là đào
    const p = canal.plan, row = el('div', 'slot'), info = el('div');
    info.append(el('b', null, '⛏️ Đào kênh ra biển'), el('small', null, p.ok ? `Tự tìm được lối: đào ${p.cells.length} ô đất nối hồ ra biển, tàu sẽ chạy ra ngoài đón du khách (rê chuột lên nút để xem tuyến kênh)` : p.reason));
    const b = el('button', p.ok && p.cost <= c.money ? 'mini acc' : 'mini', p.ok ? `≈ ${fmt(p.cost)}` : '✖');
    b.disabled = !p.ok;
    const tiles = p.ok ? p.cells.map((j) => [j % S.N, (j / S.N) | 0]) : [];
    b.addEventListener('mouseenter', () => view.setPreview(tiles, 0x35b6ff));
    b.addEventListener('mouseleave', () => view.setPreview(null));
    b.addEventListener('click', () => {
      const r = S.digSeaCanal(city, canal.k);
      view.setPreview(null);
      toast(r.ok ? `Đã đào kênh ${r.cells} ô · ${money(r.cost)}${r.open ? ' · tàu bắt đầu chạy ra biển' : ''}` : r.reason);
      showInfo(tile); updateHud(true);
    });
    row.append(info, b); $('iBody').append(row);
  }
  if (mods && mods.list.length) { // module gắn thêm cho công trình
    $('iBody').append(el('h4', null, 'Module'));
    for (const m of mods.list) {
      const d = S.MODULES[m.id], row = el('div', 'slot'), info = el('div'), b = el('button', m.state === 'ok' ? 'mini acc' : 'mini', m.state === 'done' ? '✔' : m.state === 'lock' ? '🔒' : fmt(m.cost));
      info.append(el('b', null, `${d.icon} ${d.name}`), el('small', null, m.state === 'lock' ? `${d.desc} · ${S.lockText(d)}` : d.desc));
      b.disabled = m.state !== 'ok';
      b.addEventListener('click', () => { const r = S.addModule(city, mods.k, m.id); toast(r.ok ? r.expanded ? `🛫 Đã mở rộng thành sân bay quốc tế 8×8 · ${money(r.cost)}${r.houses ? ` · giải toả ${r.houses} nhà` : ''}${r.roads ? ` · dỡ ${r.roads} đoạn đường` : ''}` : `Đã gắn ${d.name.toLowerCase()} · ${money(r.cost)}` : r.reason); showInfo(tile); updateHud(true); });
      row.append(info, b); $('iBody').append(row);
    }
  }
  $('info').classList.add('show');
}

/** Bảng 🔬: điểm phát triển và cây công nghệ. */
function renderDev() {
  if (!$('dev').classList.contains('show')) return;
  const c = city, box = $('devBody');
  box.textContent = '';
  const head = el('div', 'row'); head.append(el('span', null, 'Điểm phát triển còn lại'), el('b', null, String(c.points)));
  box.append(head, el('small', 'note', 'Mỗi mốc dân số thưởng thêm điểm. Điểm không đủ để mở hết: hãy chọn hướng đi cho thành phố.'));
  if (c.devTree) { // cây công trình kiểu Cities: Skylines 2: mỗi nhóm dịch vụ một cây, nút nối nhau, nút sau cần nút trước
    box.append(el('h4', null, '🏗️ Cây công trình'), el('small', 'note', 'Công trình dịch vụ mở bằng điểm phát triển. Nút xanh lá: đã mở · xanh dương: mở được · xám: chưa đủ điểm, chưa tới mốc dân số hoặc cần mở nút trước.'));
    for (const [bid, bname] of S.SVC_BRANCH) {
      const nodes = Object.entries(S.TECH).filter(([, t]) => t.branch === bid), wrap = el('div', 'tree');
      wrap.append(el('div', 'treeH', bname));
      const walk = (pid, depth) => {
        for (const [id, t] of nodes.filter(([, x]) => (x.req || null) === pid)) {
          const st = S.techState(c, id), n = el('div', `tnode ${st}`);
          n.style.marginLeft = `${depth * 22}px`;
          const why = st === 'req' ? `cần ${S.TECH[t.req].name}` : st === 'rank' ? `từ mốc ${S.MILESTONES[t.rank - 1].name}` : st === 'poor' ? 'thiếu điểm' : st === 'done' ? 'đã mở' : 'bấm để mở';
          n.title = `${t.name}: ${t.desc}`;
          const inf = el('div', 'tinfo'); inf.append(el('span', 'tname', t.name), el('small', null, why));
          n.append(el('span', 'tdot', t.icon), inf);
          const b = el('button', st === 'ok' ? 'mini acc' : 'mini', st === 'done' ? '✔' : `${t.cost} ⬢`);
          b.disabled = st !== 'ok';
          b.addEventListener('click', () => { const r = S.unlockTech(city, id); toast(r.ok ? `🏗️ Đã mở: ${t.name}` : r.reason); renderDev(); buildSub(); updateHud(true); });
          n.append(b); wrap.append(n);
          walk(id, depth + 1);
        }
      };
      walk(null, 0);
      box.append(wrap);
    }
  }
  for (const [bid, bname] of S.TECH_BRANCH) {
    box.append(el('h4', null, bname));
    for (const [id, t] of Object.entries(S.TECH)) {
      if (t.branch !== bid) continue;
      const st = S.techState(c, id), row = el('div', 'slot'), info = el('div');
      const why = st === 'req' ? ` · cần mở ${S.TECH[t.req].name} trước` : st === 'rank' ? ` · cần đạt mốc ${S.MILESTONES[t.rank - 1].name}` : '';
      info.append(el('b', null, `${t.icon} ${t.name}`), el('small', null, t.desc + why));
      const b = el('button', st === 'ok' ? 'mini acc' : 'mini', st === 'done' ? '✔' : `${t.cost} điểm`);
      b.disabled = st !== 'ok';
      b.addEventListener('click', () => { const r = S.unlockTech(city, id); toast(r.ok ? `🔬 Đã mở: ${t.name}` : r.reason); renderDev(); buildSub(); updateHud(true); });
      row.append(info, b); box.append(row);
    }
  }
}

// ───────────────────────── HUD ─────────────────────────

/** Bảng 📊: mức chi theo ngành, du lịch, biểu đồ giá thị trường. */
function renderEcon() {
  const c = city;
  const box = $('sectors');
  if (box.dataset.city !== String(c.seed) + c.hour || !box.childElementCount) { // thanh trượt dựng một lần mỗi giờ để kéo không bị giật
    if (!renderEcon.drag) {
      box.dataset.city = String(c.seed) + c.hour; box.textContent = '';
      for (const [k, d] of Object.entries(S.SECTORS)) {
        const head = el('div', 'row'), v = el('b', null, `${c.budget[k]}%`), inp = el('input');
        head.title = d.desc; head.append(el('span', null, `${d.icon} ${d.name}`), v);
        Object.assign(inp, { type: 'range', min: 50, max: 150, step: 5, value: c.budget[k] }); inp.setAttribute('aria-label', `Mức chi ${d.name}`);
        inp.addEventListener('input', () => { c.budget[k] = +inp.value; v.textContent = `${inp.value}%`; renderEcon.drag = true; });
        inp.addEventListener('change', () => { renderEcon.drag = false; S.recalc(city); S.computeMaps(city); city.dirty.zones = true; updateHud(true); });
        box.append(head, inp);
      }
    }
  }
  // du lịch
  const t = c.tour, sc = t.score || S.tourismScore(c), last = t.last;
  $('tourBox').innerHTML = [
    ['Sức hút (điểm tham quan, quán xá)', `${sc.attract}`],
    ['🍜 Phố ẩm thực', sc.food && sc.food.streets ? `${sc.food.streets} phố, ${sc.food.cells} ô quán (sức hút +${sc.foodA || 0})` : 'chưa có: 4 ô 🍜 ăn uống, giải trí liền nhau cùng một mặt đường'],
    ['Cửa ngõ đón khách', sc.gates ? `${sc.gates} (đường vào, ga, sân bay, tàu ra biển)` : '<span class="neg">✖ chưa có</span>'],
    ['Du khách mỗi ngày (ước)', fmt(sc.perDay)],
    ['Đang lưu trú / giường', `${fmt(t.guests)} / ${fmt(sc.beds)}${sc.beds ? '' : ' · xây 🛎️ khách sạn'}`],
    ['Hôm qua: khách tới · ở lại · đi tàu', last ? `${fmt(last.visitors)} · ${fmt(last.stayed)} · ${fmt(last.ferry)}` : '–'],
  ].map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join('');
  $('roomFeeV').textContent = `${t.roomFee} ₫`;
  if (document.activeElement !== $('roomFee')) $('roomFee').value = t.roomFee;
  // khách quốc tế
  const it = c.intl, o = S.intlOutlook(c), il = it.last;
  $('intlBox').innerHTML = [
    ['Sân bay nội địa', o.domAirports ? `🛫 ~${o.dom.toFixed(1)} chuyến/ngày · ~${fmt(o.domTourPer)} khách tới, ~${fmt(o.flyPer)} dân bay đi mỗi chuyến${il ? ` · hôm qua ${il.dom || 0} chuyến, ${fmt(il.out || 0)} dân bay đi (${fmt(il.abroad || 0)} ra nước ngoài)` : ''}` : 'chưa có ✈️ sân bay'],
    ['Cửa ngõ quốc tế', o.domAirports > o.airports && !o.airports && !o.sea ? '<span class="neg">✖ sân bay mới là nội địa: gắn module 🌏 Nhà ga quốc tế (từ 12.000 dân), hoặc xây ⚓ cảng / ⛴️ bến tàu ra biển</span>' : o.airports || o.sea ? `${o.airports ? `✈️ ${o.airports} sân bay` : ''}${o.airports && o.sea ? ' · ' : ''}${o.sea ? `🚢 ${o.sea} cảng / bến ra biển` : ''}` : '<span class="neg">✖ xây ✈️ sân bay, ⚓ cảng hoặc ⛴️ bến tàu ra biển</span>'],
    ['Chuyến mỗi ngày (ước)', `✈️ ${o.flights.toFixed(1)} · 🚢 ${o.ships.toFixed(1)}`],
    ['Mỗi chuyến bay', `~${fmt(o.tourPer)} du khách · ${o.immigPer ? `~${fmt(o.immigPer)} người tới định cư` : 'không ai tới định cư (thành phố chưa hút dân)'}`],
    ['Yếu tố', `sức hút ×${o.lure.toFixed(2)} · dân vui ×${o.mood.toFixed(2)} · phí ×${o.feeK.toFixed(2)}`],
    ['Hôm qua', il ? `${il.flights} chuyến bay, ${il.ships} tàu · ${fmt(il.tourists)} khách · ${fmt(il.immig)} định cư${il.turned ? ` · <span class="neg">${fmt(il.turned)} quay về (hết nhà)</span>` : ''} · phí +${fmt(il.fees)} ₫` : '–'],
  ].map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join('');
  const vb = $('visaBtns'), pb = $('promoBtns');
  if (vb.dataset.v !== it.visa) {
    vb.dataset.v = it.visa; vb.textContent = '';
    for (const [k, v] of Object.entries(S.VISA)) { const btn = el('button', 'mini' + (k === it.visa ? ' acc' : ''), `${v.icon} ${v.name}`); btn.title = v.desc; btn.onclick = () => { it.visa = k; renderEcon(); }; vb.append(btn); }
  }
  $('visaV').textContent = S.VISA[it.visa].desc;
  if (pb.dataset.v !== String(it.promo)) {
    pb.dataset.v = String(it.promo); pb.textContent = '';
    S.PROMO.forEach((p, k) => { const btn = el('button', 'mini' + (k === it.promo ? ' acc' : ''), p.name); btn.title = p.cost ? `${fmt(p.cost)} ₫/ngày, khách ×${p.k}` : 'Không chi'; btn.onclick = () => { it.promo = k; S.recalc(city); updateHud(true); renderEcon(); }; pb.append(btn); });
  }
  $('promoV').textContent = S.PROMO[it.promo].cost ? `${fmt(S.PROMO[it.promo].cost)} ₫/ngày · khách ×${S.PROMO[it.promo].k}` : 'không chi';
  $('intlFeeV').textContent = `${it.fee} ₫`;
  if (document.activeElement !== $('intlFee')) $('intlFee').value = it.fee;
  const now = S.simTime(c), up = it.sched.filter((e) => !e.landed);
  $('intlNext').innerHTML = up.length ? up.map((e) => `<div class="row"><span>${e.dom ? '🛫' : e.kind === 'plane' ? '✈️' : '🚢'} ${e.code} từ ${e.from}</span><span>${fmt(e.tourists)} khách${e.immig ? `, ${fmt(e.immig)} định cư` : ''} · tới sau ${Math.max(1, Math.ceil((e.t1 - now) / S.HOUR_SEC))} giờ</span></div>`).join('') : '<div class="row"><span>Chưa có chuyến nào đang tới</span></div>';
  // giá thị trường
  const m = c.market;
  $('mktNews').innerHTML = m.news ? `<span>${m.news.up ? '📈' : '📉'} ${m.news.text}</span><span>ngày ${m.news.day + 1}</span>` : '<span>Chưa có biến động lớn</span>';
  const cv = $('mktChart'), g = cv.getContext('2d'), W = cv.width, H = cv.height, hist = m.hist;
  const COLS = ['#9bd84a', '#2fa36a', '#9aa0b8', '#b45fe0', '#3fb6dc', '#f2a03c', '#e8634a', '#d6c9a3', '#7a8fb8', '#c94fa0', '#f2d24a', '#4ad6c3'];
  g.clearRect(0, 0, W, H);
  let lo = 0.85, hi = 1.15; for (const row of hist) for (const v of row) { lo = Math.min(lo, v); hi = Math.max(hi, v); } // trục tự co giãn theo dữ liệu
  lo -= 0.03; hi += 0.03;
  const y = (v) => H - 14 - ((v - lo) / (hi - lo)) * (H - 22);
  g.fillStyle = 'rgba(160,170,180,.8)'; g.font = '10px sans-serif'; g.fillText(`${Math.round(hi * 100)}%`, W - 34, 10); g.fillText(`${Math.round(lo * 100)}%`, W - 34, H - 16);
  g.strokeStyle = 'rgba(160,170,180,.35)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, y(1)); g.lineTo(W, y(1)); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(160,170,180,.8)'; g.font = '10px sans-serif'; g.fillText('giá gốc', 2, y(1) - 3); g.fillText(`${hist.length} ngày gần nhất`, W - 92, H - 2);
  S.MKT_KINDS.forEach((k, j) => {
    g.strokeStyle = COLS[j]; g.lineWidth = 1.6; g.beginPath();
    hist.forEach((row, n) => { const x = hist.length < 2 ? W / 2 : (n / (hist.length - 1)) * (W - 4) + 2; if (n) g.lineTo(x, y(row[j])); else g.moveTo(x, y(row[j])); });
    g.stroke();
  });
  $('mktLegend').innerHTML = S.MKT_KINDS.map((k, j) => `<div class="row"><span><i style="display:inline-block;width:10px;height:3px;background:${COLS[j]};vertical-align:middle;margin-right:6px"></i>${S.MKT_NAME[k]}</span><span class="${m.p[k] >= 1 ? 'pos' : 'neg'}">${Math.round(m.p[k] * 100)}%</span></div>`).join('');
  $('loanH').style.display = $('loans').style.display = c.sandbox ? 'none' : '';
  $('tabLoans').hidden = !!c.sandbox; // chế độ Open: tiền không giới hạn, không có thẻ vay nợ
  if (c.sandbox && $('tabLoans').classList.contains('on')) $('tabLoans').parentElement.firstElementChild.click();
}

const expOpen = new Set(); // nhóm chi đang mở trong bảng ngân sách
/** Camera bay tới một mục (công trình, cầu, tuyến) trong bảng chi. */
function flyTo(x, z) { view.cam.x = x; view.cam.z = z; view.cam.dist = Math.min(view.cam.dist, 220); view.panWorld(0, 0); }
function expRow(it, extra) {
  const r = el('div', `exi${it.x != null ? ' go' : ''}`), nm = el('div', 'nm');
  nm.append(el('span', null, it.name));
  if (it.note) nm.append(el('small', null, it.note));
  r.append(el('span', null, it.icon), nm);
  if (extra) r.append(extra);
  r.append(el('span', 'v', it.cost ? `−${fmt(it.cost)}` : '0'));
  if (it.x != null) { r.title = 'Bấm để tới chỗ này'; r.addEventListener('click', () => flyTo(it.x, it.z)); }
  return r;
}
/** Chi tiết khoản chi: từng nhóm mở ra danh sách công trình, cầu, tuyến xe; top tốn kém; công trường đang xây. */
function renderExpenses(force) {
  const now = performance.now();
  if (!force && now - (renderExpenses.at || 0) < 1500) return; // đỡ dựng lại DOM liên tục
  renderExpenses.at = now;
  const groups = S.expenseItems(city), total = Math.max(1, city.stats.expense), box = $('expList');
  box.textContent = '';
  for (const g of groups) {
    if (!g.total && !g.items.length) continue;
    const wrap = el('div', `exg${expOpen.has(g.key) ? ' open' : ''}`), head = el('button', 'eh');
    head.append(el('span', 'ar', '▶'), el('span', null, g.icon), el('span', 'nm', `${g.name}${g.items.length ? ` (${g.items.length})` : ''}`), el('span', 'neg', `−${fmt(g.total)}`));
    head.addEventListener('click', () => { if (expOpen.has(g.key)) expOpen.delete(g.key); else expOpen.add(g.key); wrap.classList.toggle('open'); });
    const bar = el('div', 'bar'), fill = el('i'); fill.style.width = `${Math.min(100, (g.total / total) * 100)}%`; bar.append(fill);
    const its = el('div', 'its');
    if (!g.items.length) its.append(el('div', 'exi', 'Chưa có khoản nào'));
    for (const it of g.items.slice(0, 40)) its.append(expRow(it));
    if (g.items.length > 40) its.append(el('div', 'exi', `… và ${g.items.length - 40} mục nhỏ hơn`));
    wrap.append(head, bar, its); box.append(wrap);
  }
  const all = groups.flatMap((g) => g.items.filter((it) => it.x != null)).sort((a, b) => b.cost - a.cost).slice(0, 6), top = $('expTop');
  top.textContent = '';
  if (!all.length) top.append(el('div', 'exi', 'Chưa có công trình nào tốn phí'));
  for (const it of all) top.append(expRow(it));
  // công trường đang xây
  const bb = $('buildBox'); bb.textContent = '';
  const sites = city.services.filter((sv) => sv.build > 0);
  if (sites.length) {
    bb.append(el('h4', null, `🚧 Đang xây dựng (${sites.length})`));
    for (const sv of sites) {
      const d = S.SERVICES[sv.type], done = 1 - sv.build / sv.buildTot, pg = el('span', 'pg'), f = el('i'); f.style.width = `${Math.round(done * 100)}%`; pg.append(f);
      bb.append(expRow({ icon: d.icon, name: d.name, note: `${Math.round(done * 100)}% · xong sau ${sv.build} giờ · đã chi ${money(d.cost)}`, cost: d.upkeep * S.upkeepRate(city), x: (sv.x + d.size / 2) * S.T - S.HALF, z: (sv.y + d.size / 2) * S.T - S.HALF }, pg));
    }
  }
  // dòng tiền: tóm tắt ngắn, chi tiết ở cửa sổ 💸
  const fb = $('flowBox'), sum = ledgerSummary(city); fb.textContent = '';
  const line = (name, v, cls) => { const r = el('div', 'row'); r.append(el('span', null, name), el('span', cls ?? (v >= 0 ? 'pos' : 'neg'), `${v >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(v)))}`)); return r; };
  if (sum.rows.length) fb.append(line('Hôm qua vào từ bên ngoài', sum.inflow), line('Hôm qua ra bên ngoài', sum.outflow));
  if (city.ledger && !city.sandbox) fb.append(line('🌏 Thế giới bên ngoài còn', worldReserve(city), worldK(city) < 1 ? 'neg' : ''));
  if ($('flows').classList.contains('show') && !$('flows').classList.contains('peek')) renderFlows();
}

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

/** Mục 🛵 trong bảng 👥: chính sách vỉa hè, hẻm, cấm xe máy, phí ô tô, làn buýt; tỷ lệ phương tiện, bụi mịn. */
function renderStreet(force) {
  const c = city, st = c.street, last = st.last || {}, m = (c.econ.last || {}).mode || c.pstats.mode;
  const key = `${c.day}|${st.sidewalk}|${st.motoBan}|${st.busLane}|${st.alley}|${st.centerFee}|${st.aqi}`;
  if (!force && renderStreet.key === key) return;
  renderStreet.key = key;
  const box = $('streetBox'); box.textContent = '';
  const row = (a, b) => { const r = el('div', 'row'); r.innerHTML = `<span>${a}</span><span>${b}</span>`; return r; };
  const [lv, col] = S.aqiLevel(st.aqi), priv = (m.cars || 0) + (m.moto || 0), all = m.car + m.bus + (m.tram || 0) + m.metro + (m.ferry || 0) + m.walk;
  const pc = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  box.append(
    row('🌫️ Bụi mịn AQI', `<b style="color:${col}">${st.aqi} · ${lv}</b>${st.aqi > 100 ? ' · dân ốm nhiều, kém vui' : ''}${st.aqi > 150 ? ', du khách chê' : ''}`),
    row('Hôm qua: 🛵 xe máy · 🚗 ô tô · 🚌 công cộng · 🚶 đi bộ', `${pc(m.moto || 0, all)} · ${pc(m.cars || 0, all)} · ${pc(m.bus + (m.tram || 0) + m.metro + (m.ferry || 0), all)} · ${pc(m.walk, all)}`),
    row('Nội đô', st.center ? `bán kính ${Math.round(st.center.r)} ô quanh khu thương mại, văn phòng` : 'chưa hình thành (cần khu thương mại, văn phòng)'),
  );
  if (st.motoBan || st.centerFee) box.append(row('Hôm qua vì chính sách', `${fmt(last.shift || 0)} chuyến chuyển sang công cộng / đi bộ · ${fmt(last.taxi || 0)} chuyến phải gọi taxi · thu phí ${fmt(last.fee || 0)} ₫`));
  const sub = (t) => { const h = el('b', null, t); h.style.cssText = 'display:block;margin:10px 0 2px'; return h; };
  box.append(sub('Vỉa hè'));
  const sw = el('div'); sw.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:4px 0';
  for (const [k, d] of Object.entries(S.SIDEWALK)) { const b = el('button', 'mini' + (st.sidewalk === k ? ' acc' : ''), `${d.icon} ${d.name}`); b.title = `${d.desc}${d.cost ? ` · ${fmt(d.cost)} ₫/ngày` : ''}`; b.onclick = () => { S.setSidewalk(c, k); S.recalc(c); updateHud(true); renderStreet(true); }; sw.append(b); }
  box.append(sw, el('small', null, S.SIDEWALK[st.sidewalk].desc));
  box.append(sub('Chính sách'));
  for (const [k, d] of Object.entries(S.STREET_POLICY)) {
    const lab = el('label', 'row'), cb = el('input');
    cb.type = 'checkbox'; cb.checked = !!st[k];
    cb.onchange = () => { S.setPolicy(c, k, cb.checked); if (k === 'alley') S.roadsChanged(c); S.recalc(c); updateHud(true); renderStreet(true); toast(`${d.icon} ${cb.checked ? 'Bật' : 'Tắt'}: ${d.name}`); };
    const t = el('span'); t.innerHTML = `${d.icon} ${d.name}${d.cost ? ` <small>(${fmt(d.cost)} ₫/ngày)</small>` : ''}<br><small>${d.desc}</small>`;
    lab.append(t, cb); lab.style.alignItems = 'flex-start'; box.append(lab);
  }
  const fr = row('💳 Phí ô tô vào nội đô', `<b id="feeV">${st.centerFee ? `${st.centerFee} ₫ / lượt` : 'không thu'}</b>`), inp = el('input');
  Object.assign(inp, { type: 'range', min: 0, max: S.FEE_MAX, step: 1, value: st.centerFee }); inp.setAttribute('aria-label', 'Phí ô tô vào nội đô');
  inp.oninput = () => { st.centerFee = +inp.value; $('feeV').textContent = st.centerFee ? `${st.centerFee} ₫ / lượt` : 'không thu'; };
  box.append(fr, inp, el('small', null, 'Phí từ 6 ₫ trở lên: người có ô tô chuyển sang công cộng nếu có tuyến; còn lại trả phí vào ngân sách.'));
}

/** Bảng 👥: dân cư, việc làm, đi lại, doanh nghiệp, tuyến giao thông công cộng. */
function renderCity(force) {
  if (!$('people').classList.contains('show')) return;
  renderStreet(force);
  const c = city, ps = c.pstats, s = c.stats, last = c.econ.last || {}, mode = last.mode || ps.mode, box = $('pBody');
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  const adults = ps.edu.reduce((a, b) => a + b, 0), trips = mode.car + mode.bus + (mode.tram || 0) + mode.metro + (mode.ferry || 0) + mode.walk;
  const row = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
  box.innerHTML = [
    row('Trẻ em · lao động · người già', `${fmt(ps.kids)} · ${fmt(ps.adults)} · ${fmt(ps.seniors)}`),
    row('Có việc / trong tuổi lao động', `${fmt(ps.employed)} / ${fmt(ps.workers)}`),
    row('Việc còn trống · thất nghiệp', `${fmt(s.vacJobs)} · ${fmt(s.unemployed)}`),
    row('Nhà ở: đang ở / sức chứa', `${fmt(ps.pop - ps.homeless)} / ${fmt(s.housing)}`),
    row('Vô gia cư · đang ốm', `${fmt(ps.homeless)} · ${fmt(ps.sick)}`),
    row('Hôm qua: sinh · mất · bỏ đi', `${last.born || 0} · ${last.died || 0} · ${last.movedOut || 0}`),
    ...(() => { // sổ dân: dân đến từ đâu, đi đâu (ledger.js); báo cáo ngày (world.js)
      const P = c.popl, pl = (P && P.last) || {}, rep = c.reports && c.reports[c.reports.length - 1];
      if (!P) return [];
      return [
        '<h4>Dân đến, đi (hôm qua)</h4>',
        row('Từ nông thôn · nước ngoài · trẻ sinh ra', `${pl.rural || 0} · ${pl.abroad || 0} · ${pl.born || 0}`),
        row('Về nông thôn · ra nước ngoài · mất', `${pl.toRural || 0} · ${pl.toAbroad || 0} · ${pl.died || 0}`),
        row('Nông thôn còn (nguồn dân chuyển đến)', `${fmt(P.rural)} người${P.rural < 500 ? ' <span class="neg">· sắp cạn</span>' : ''}`),
        ...(rep ? [row('Muốn rời đi: thất nghiệp · vô gia cư · bất mãn · nợ', `${rep.want.unemployed} · ${rep.want.homeless} · ${rep.want.unhappy} · ${rep.want.broke}`), row('Điểm thịnh vượng', `${S.prosperity(rep)}`)] : []),
      ];
    })(),
    '<h4>Tầng lớp dân cư (người lớn)</h4>',
    ...(() => {
      const T = ps.tier || [0, 0, 0], tot = T[0] + T[1] + T[2], H = ps.homeTier || { cap: [0, 0, 0], free: [0, 0, 0] }, hp = ps.tierHappy || [0, 0, 0];
      return [
        ...S.TIERS.map((t, k) => row(`${t.icon} ${t.name}`, `${pct(T[k], tot)} · vui ${Math.round(hp[k])} · nhà ${t.key === 'low' ? 'rẻ' : t.key === 'mid' ? 'vừa' : 'cao cấp'} trống ${fmt(H.free[k])}/${fmt(H.cap[k])}`)),
        row('Hộ bị tiền nhà đè nặng (trên 50% thu nhập)', `${fmt(ps.burdenN || 0)} (${Math.round((ps.burdenShare || 0) * 100)}%)${(ps.burdenShare || 0) > 0.2 ? ' <span class="neg">· cao</span>' : ''}`),
        row('Hôm qua: dọn xuống nhà rẻ · dọn lên nhà tốt', `${last.downsized || 0} · ${last.upsized || 0}`),
      ];
    })(),
    '<h4>Học vấn người lớn</h4>',
    row('Chưa học · tiểu học', `${pct(ps.edu[0], adults)} · ${pct(ps.edu[1], adults)}`),
    row('Trung học · đại học', `${pct(ps.edu[2], adults)} · ${pct(ps.edu[3], adults)}`),
    row('Đang đi học', fmt(ps.students || 0)),
    '<h4>Đi lại (hôm qua)</h4>',
    row('Xe riêng · buýt · tàu điện · metro · tàu thuỷ · đi bộ', `${pct(mode.car, trips)} · ${pct(mode.bus, trips)} · ${pct(mode.tram || 0, trips)} · ${pct(mode.metro, trips)} · ${pct(mode.ferry || 0, trips)} · ${pct(mode.walk, trips)}`),
    row('Thời gian đi làm trung bình', ps.commute ? `${ps.commute.toFixed(1)} giờ` : '–'),
    row('Tốc độ xe so với đường thoáng', `${Math.round(c.traffic.speedEma * 100)}%`),
    row('Xe đang chạy · xe phải tìm chỗ đỗ', `${c.traffic.vehicles.length} · ${last.parkSearch || 0}`),
    '<h4>Doanh nghiệp</h4>',
    row('Số doanh nghiệp · hiệu quả TB', `${fmt(s.companies)} · ${Math.round(ps.eff * 100)}%`),
    row('Việc: thương mại · công nghiệp · văn phòng', `${fmt(s.jobsBy.c)} · ${fmt(s.jobsBy.i)} · ${fmt(s.jobsBy.o)}`),
    row('Hôm qua: nhập · xuất (đơn vị hàng)', `${fmt(last.imports || 0)} · ${fmt(last.exports || 0)}`),
    row('Phá sản hôm qua · tổng cộng', `${last.bankrupt || 0} · ${c.econ.bankrupt}`),
    row('Cửa ngõ ra ngoài', S.outsidePositions(c).length ? `${S.outsidePositions(c).length} (cao tốc / cảng / ga / sân bay)` : '<span class="neg">✖ mất kết nối</span>'),
    '<h4>An ninh, tang lễ, nghiên cứu</h4>',
    row('Tội phạm trung bình', ps.pop >= 400 ? `${Math.round((ps.crime || 0) * 100)}%` : 'chưa có (dưới 400 dân)'),
    row('Đang bị giam / chỗ giam', `${fmt(s.prisoners || 0)} / ${fmt(s.prisonCap || 0)}`),
    row('Phần mộ đã dùng · hoả táng mỗi ngày', `${fmt(s.gravesUsed || 0)} / ${fmt(s.graves || 0)} · ${fmt(s.cremate || 0)}`),
    row('Điểm phát triển kế tiếp từ viện nghiên cứu', c.services.some((sv) => S.SERVICES[sv.type].research) ? `${Math.floor(c.research)}%` : '–'),
    row('Xe buýt + tàu điện / chỗ ở bến xe', `${S.roadFleet(c).used} / ${S.roadFleet(c).cap}`),
    '<h4>Sự cố, thiên tai</h4>',
    row('Thời tiết', `${S.WEATHER[c.inc.weather].icon} ${S.WEATHER[c.inc.weather].name} · nguy cơ tai nạn ×${S.crashFactor(c).toFixed(1)}`),
    row('Hôm qua: tai nạn · cướp (bắt được)', `${c.inc.last.accidents || 0} · ${c.inc.last.robberies || 0} (${c.inc.last.caught || 0})`),
    row('Tổng: tai nạn · cây cháy · lốc xoáy', `${c.inc.total.accidents} · ${c.inc.total.burned} · ${c.inc.total.tornadoes}`),
    row('Thiệt mạng vì lốc xoáy', fmt(c.inc.total.killed)),
  ].join('');
  // tuyến giao thông công cộng: chỉ dựng lại khi danh sách đổi để nút bấm không bị giật
  const tr = c.transit, sig = tr.lines.map((l) => `${l.id}:${l.count}:${l.broken ? 1 : 0}:${l.ridersDay}`).join('|') + '#' + (c.ferries || []).map((l) => `${l.key}:${l.ridersDay}:${l.guestsDay}`).join('|') + '#' + tr.ferryFare;
  if (!force && sig === renderCity.sig) return;
  renderCity.sig = sig;
  const lb = $('pLines'); lb.textContent = '';
  if (!tr.lines.length && !(c.ferries || []).length) lb.append(el('div', 'row', 'Chưa có tuyến nào. Mở nhóm 🚌 Vận tải để vẽ tuyến.'));
  for (const l of tr.lines) {
    const d = S.TRANSIT[l.mode], r = el('div', 'slot'), info = el('div');
    info.append(el('b', null, `${d.icon} Tuyến ${l.id}${l.broken ? ' ⚠ đứt tuyến' : ''}`), el('small', null, `${l.stops.length} trạm · ${l.count} xe · ${fmt(l.ridersDay || 0)} khách hôm qua`));
    const minus = el('button', 'mini', '−'), plus = el('button', 'mini', '+'), del = el('button', 'mini', '🗑');
    minus.addEventListener('click', () => { S.setVehicles(city, l.id, l.count - 1); renderCity(true); updateHud(true); });
    plus.addEventListener('click', () => { const res = S.setVehicles(city, l.id, l.count + 1); if (!res.ok && res.reason) toast(res.reason); renderCity(true); updateHud(true); });
    del.addEventListener('click', () => { S.removeTransit(city, l.id); renderCity(true); updateHud(true); });
    r.append(info, minus, plus, del); lb.append(r);
  }
  for (const l of c.ferries || []) { // tuyến tàu khách tự mở theo các bến, không thêm bớt tay
    const r = el('div', 'slot'), info = el('div');
    info.append(el('b', null, l.single && l.out ? '⛴️ Tàu ra cửa biển' : l.cruise ? '⛴️ Tàu du ngoạn hồ' : `${l.isle ? '🏝️' : '⛴️'} Tuyến tàu ${l.stops.filter((t) => t.uid != null).length} bến${l.isle ? ' ra đảo' : ''}${l.out ? ' + ra biển' : ''}`),
      el('small', null, l.cruise ? `${l.count} tàu · ${fmt(l.ridersDay || 0)} vé hôm qua (dân đi ngắm cảnh)` : !l.single ? `${l.count} tàu · ${fmt(l.ridersDay || 0)} vé hôm qua${l.isle ? ` · ${fmt(l.islandersDay || 0)} du khách ra đảo` : ''}${l.out ? ` · ${fmt(l.guestsDay || 0)} du khách từ biển vào` : ''}` : l.out ? `${l.count} tàu · ${fmt(l.ridersDay || 0)} vé hôm qua · ${fmt(l.guestsDay || 0)} du khách tới, ${fmt(l.travellersDay || 0)} dân đi chơi xa` : `${l.count} tàu · ${fmt(l.ridersDay || 0)} khách hôm qua`));
    r.append(info); lb.append(r);
  }
  $('fareV').textContent = `${tr.fare} ₫ · ${fmt(tr.ridersDay || 0)} khách hôm qua`;
  $('ferryFareV').textContent = `${tr.ferryFare ?? 4} ₫ · khách ×${S.fareK(c).toFixed(2)}`;
}

let hudAt = 0;
function updateHud(force) {
  const now = performance.now();
  if (!force && now - hudAt < 250) return;
  hudAt = now;
  const c = city, s = c.stats, ps = c.pstats, net = s.income - s.expense;
  $('pop').textContent = fmt(s.pop);
  $('jobs').textContent = `${fmt(s.employed)} / ${fmt(s.jobs)} việc làm`;
  $('money').textContent = c.sandbox ? '∞ Open' : money(c.money); $('money').className = c.money < 0 ? 'neg' : '';
  $('net').textContent = `${net >= 0 ? '+' : ''}${fmt(net)} / ngày`; $('net').className = `sub ${net >= 0 ? 'pos' : 'neg'}`;
  $('happy').textContent = s.pop ? `${face(s.happy)} ${Math.round(s.happy)}%` : '–';
  $('date').textContent = dateText(c.hour);
  $('rank').textContent = c.milestone ? S.MILESTONES[c.milestone - 1].name : 'Vùng đất mới';
  $('devPts').textContent = c.points || '';
  { const M = S.MILESTONES, k = c.milestone || 0, base = k ? M[k - 1].pop : 0, nx = M[k]; // thanh tiến độ tới mốc dân số kế tiếp
    $('xpBar').style.width = nx ? `${Math.max(0, Math.min(100, ((s.pop - base) / (nx.pop - base)) * 100))}%` : '100%';
    $('xpTxt').textContent = nx ? `${fmt(s.pop)} / ${fmt(nx.pop)}` : 'Mốc cao nhất';
    $('progBox').title = nx ? `Mốc kế tiếp: ${nx.name} (${fmt(nx.pop)} dân) · thưởng ${money(nx.reward)} và ${nx.points} điểm phát triển · bấm để mở 🔬 Phát triển` : 'Đã đạt mốc cao nhất · bấm để mở 🔬 Phát triển'; }
  $('dateBox').title = `${$('date').textContent} · bấm để mở 🎎 lễ hội và mùa mưa bão`;
  for (const [id, v] of [['dr', c.demand.r], ['dc', c.demand.c], ['di', c.demand.i], ['do', c.demand.o]]) $(id).style.height = `${Math.max(3, Math.max(0, v) * 100)}%`;
  for (const b of $('speed').children) b.classList.toggle('on', +b.dataset.s === speed);
  // ngân sách
  $('taxRv').textContent = `${c.tax.r}% · +${fmt(s.inc.r)}`; $('taxCv').textContent = `${c.tax.c}% · +${fmt(s.inc.c)}`; $('taxIv').textContent = `${c.tax.i}% · +${fmt(s.inc.i)}`;
  $('bInc').textContent = `+${fmt(s.income)}`; $('bFare').textContent = `+${fmt(s.inc.t)}`; $('bRoom').textContent = `+${fmt(s.inc.u || 0)}`;
  $('bExp').textContent = `−${fmt(s.expense)}`;
  $('bNet').textContent = `${net >= 0 ? '+' : ''}${fmt(net)} ₫`; $('bNet').className = net >= 0 ? 'pos' : 'neg';
  const meter = (bar, txt, use, cap) => { $(txt).textContent = `${fmt(use)} / ${fmt(cap)}`; $(bar).style.width = `${cap ? Math.min(100, (use / cap) * 100) : use ? 100 : 0}%`; $(bar).classList.toggle('over', use >= cap && use > 0); };
  meter('pBar', 'pTxt', s.powerUse, s.powerCap); meter('wBar', 'wTxt', s.waterUse, s.waterCap); meter('sBar', 'sTxt', s.waterUse, s.sewCap); meter('tBar', 'tTxt', s.trashUse, s.trashCap);
  if ($('budget').classList.contains('show')) { renderLoans(); renderEcon(); renderExpenses(force); }
  if ($('fest').classList.contains('show')) renderFest(force);
  if ($('inbox').classList.contains('show')) renderInbox(force);
  if ($('dist').classList.contains('show')) renderDist(force);
  if ($('corp').classList.contains('show')) renderCorp(force);
  if ($('chron').classList.contains('show')) renderChron(force);
  { const L = c.chain ? c.chain.log : [], n = L.filter((e) => e.day >= c.day - 1).length; $('chronN').textContent = n ? String(n) : ''; }
  { const n = c.corp ? c.corp.asks.length : 0; $('corpN').textContent = n ? `✋${n}` : c.corp && c.corp.list.length ? String(c.corp.list.length) : ''; }
  aiPump(); distPump(); corpPump();
  const asks = c.dist.on ? c.dist.list.filter((q) => q.prop && q.prop.status === 'ask').length : 0;
  $('distN').textContent = c.dist.on ? (asks ? `✋${asks}` : String(c.dist.list.length)) : '';
  { const n = c.council.inbox.filter((i) => i.status === 'pending').length; $('inboxN').textContent = n ? String(n) : ''; }
  { const u = S.upcomingFestivals(c, 1)[0]; $('festN').textContent = u ? (u.inDays ? `${u.f.icon} ${u.inDays} ngày` : `${u.f.icon} hôm nay`) : ''; } // lễ gần nhất
  // cảnh báo / gợi ý
  const al = [], none = s.none || {}, tight = s.tight || {};
  let zoned = 0, free = 0, dirty = 0, burning = 0;
  for (let i = 0; i < S.N * S.N; i++) { if (c.zone[i]) { zoned++; if (S.ZDEF[c.zone[i]].res && !c.level[i] && c.acc[i]) free++; } if (c.level[i] && c.garbage[i] > S.garbageLimit(c.zone[i], c.level[i])) dirty++; if (c.fire[i]) burning++; }
  if (c.edges.size <= 1 && !zoned) al.push(['Chọn 🛣️ Đường, bấm vào cuối đoạn đường có sẵn rồi bấm điểm tiếp theo để mở phố']);
  else if (!zoned) al.push(['Chọn 🎨 Quy hoạch rồi tô khu 🏠 nhà ở lên các ô hai bên đường']);
  if (zoned && c.points && Object.keys(S.TECH).some((id) => S.techState(c, id) === 'ok')) al.push([`🔬 Còn ${c.points} điểm phát triển chưa dùng: ${c.devTree ? "mở công trình dịch vụ (cây công trình), " : ""}khu tài nguyên, module, công trình biểu tượng`]);
  if (burning) al.push([`🔥 ${burning} toà nhà đang cháy`, 1]);
  if (none.p) al.push(['⚡ Khu đã quy hoạch chưa có điện: đặt tua-bin gió gần đường', 1]);
  else if (tight.p) al.push(['⚡ Hết điện dư: nhà ngừng mọc, xây thêm nguồn điện', 1]);
  if (none.w) al.push(['💧 Chưa có nước sạch: đặt một tháp nước gần đường', 1]);
  else if (tight.w) al.push(['💧 Hết nước dư: xây thêm tháp nước hoặc trạm bơm', 1]);
  if (!none.w && none.s) al.push(['🕳️ Chưa có chỗ xả nước thải: đặt cống xả sát bờ nước rồi nối ống tới đường', 1]);
  else if (tight.s) al.push(['🕳️ Cống xả quá tải: xây thêm cống hoặc nhà máy xử lý', 1]);
  const loose = c.services.filter((sv) => { const d = S.SERVICES[sv.type]; return (d.power || d.water || d.sewage) && !sv.linked; });
  if (loose.length) al.push([`${S.SERVICES[loose[0].type].icon} ${S.SERVICES[loose[0].type].name} chưa nối mạng: kéo ${S.SERVICES[loose[0].type].power ? 'dây điện' : 'ống nước'} từ nó tới đường`, 1]);
  if (s.noUtil > 0) al.push([`${s.noUtil} nhà đang thiếu điện nước, sắp bị bỏ hoang`, 1]);
  if (c.dirtyWater) al.push(['💧 Trạm bơm đang hút nước bẩn gần cống xả: dân dễ ốm', 1]);
  if (dirty > 3) al.push([`🗑️ ${dirty} nhà ngập rác: ${s.trashCap ? 'xe rác không kịp, xây thêm bãi rác hoặc gỡ kẹt xe' : 'xây một bãi rác'}`, 1]);
  if (!S.outsidePositions(c).length && c.edges.size) al.push(['🚚 Mất đường nối ra ngoài: không nhập, xuất được hàng. Bấm vào đây để tới cổng ra vào ở mép bắc, rồi vẽ đường từ cổng vào thành phố (hoặc xây cảng, ga tàu, sân bay)', 1, 'entry']);
  if (c.traffic.speedEma < 0.3 && c.traffic.vehicles.length > 60) al.push(['🚗 Kẹt xe nặng: mở thêm đường, nâng lên đại lộ hoặc mở tuyến xe buýt (lớp xem 🗺️ giao thông)', 1]);
  if (ps.homeless > 5) al.push([`${ps.homeless} người vô gia cư: quy hoạch thêm nhà ở`, 1]);
  if (ps.sick > Math.max(8, s.pop * 0.05)) al.push([`🏥 ${ps.sick} người đang ốm: thêm trạm y tế, giảm ô nhiễm`, 1]);
  if (c.inc.warn) al.push(['📡 Cảnh báo: lốc xoáy sắp tới trong 1 giờ, dân đang xuống hầm trú ẩn', 1]);
  if (c.inc.tornado) al.push([`🌪️ Lốc xoáy đang càn qua thành phố!${c.services.some((sv) => sv.type === 'shelter') ? '' : ' Xây 🛖 hầm trú ẩn để giảm thương vong'}`, 1]);
  if (c.inc.accidents.length) al.push([`💥 ${c.inc.accidents.length} vụ tai nạn đang chắn đường${c.services.some((sv) => S.SERVICES[sv.type].tows) ? '' : ': xây 🚧 trạm cứu hộ để kéo xe đi nhanh'}`, 1]);
  const wild = S.wildCount(c);
  if (wild) al.push([`🔥 Cháy rừng: ${wild} ô đang cháy${c.services.some((sv) => sv.type === 'firewatch') ? '' : ' · xây 🗼 tháp canh lửa gần rừng'}`, 1]);
  if (c.inc.robberies.length) al.push([`🚨 ${c.inc.robberies.length} vụ cướp đang xảy ra, chờ công an tới`, 1]);
  let deadWait = 0;
  for (let i = 0; i < S.N * S.N; i++) deadWait += c.dead[i];
  if (deadWait > 4) al.push([`⚱️ ${deadWait} người mất chưa được đưa đi: ${s.graves + s.cremate ? (s.graves && s.gravesUsed >= s.graves && !s.cremate ? 'nghĩa trang đã đầy, xây thêm hoặc làm đài hoá thân' : 'thêm xe tang (nghĩa trang, đài hoá thân) hoặc gỡ kẹt xe') : 'xây một nghĩa trang (nhóm 🏥 Y tế)'}`, 1]);
  if (ps.crime > 0.35) al.push([`🚨 Tội phạm cao (${Math.round(ps.crime * 100)}%): thêm đồn công an, tạo việc làm${s.prisonCap ? '' : ', xây trại giam'}`, 1]);
  else if (s.prisonCap && s.prisoners >= s.prisonCap - 1) al.push(['⛓️ Trại giam đã đầy: công an trấn áp kém hẳn, xây thêm trại giam', 1]);
  { const H = ps.homeTier, T = ps.tier;
    if (s.pop > 120 && H && T) {
      const lowTot = T[0] || 0;
      if ((ps.burdenShare || 0) > 0.2 && H.free[0] < Math.max(4, lowTot * 0.03)) al.push([`🏚️ ${Math.round(ps.burdenShare * 100)}% hộ bị tiền nhà đè nặng, nhà giá rẻ gần hết chỗ: quy hoạch thêm nhà trọ, nhà liền kề cấp thấp`, 1]);
      if (T[2] > 10 && H.cap[2] < T[2] * 0.3) al.push(['🏡 Người khá giả ở nhà vừa, thiếu nhà cao cấp: nâng giá đất, trồng cây xanh, mở công viên để lên cấp']);
      if (H.cap[2] > 20 && H.free[2] > H.cap[2] * 0.6 && (T[2] || 0) < H.cap[2] * 0.25) al.push(['Nhà cao cấp ế (ít người khá giả): tạo việc làm lương cao, mở trường đại học']);
    } }
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
    $('alertN').textContent = al.length ? String(al.length) : ''; $('alertN').className = `badge${al.some((a) => a[1]) ? ' red' : ''}`;
    for (const [text, bad, act] of al.slice(0, 4)) {
      const a = el('div', `panel alert${bad ? ' bad' : ''}`, text);
      if (act === 'entry') { a.style.pointerEvents = 'auto'; a.style.cursor = 'pointer'; a.addEventListener('click', goEntry); }
      box.append(a);
    }
  }
}

/** Đưa camera tới cổng ra vào ở mép bản đồ và cầm sẵn công cụ đường. */
function goEntry() {
  const e = city.entry;
  if (!e) return;
  view.cam.x = e.x; view.cam.z = e.z + 90; view.cam.dist = 220; view.cam.pitch = 0.9;
  setTool('road:small');
  toast('Bấm vào cổng ra vào (vòng sáng) rồi bấm một điểm trên đường của thành phố để nối lại');
}

function setSpeed(v) { speed = v; if (v) updateHud.lastSpeed = v; updateHud(true); }

// ───────────────────────── chuột, bàn phím ─────────────────────────

// ── đi bộ: thả một nhân vật xuống phố, điều khiển bằng WASD / cần điều khiển, camera bám sau lưng ──
let gta = null; // cướp xe, truy nã, chở khách (mayhem.js): tạo khi đã có view
const walk = { on: false, joy: { x: 0, y: 0, run: false }, opts: [], sig: '', scanAt: 0, chan: null, knock: 0 };
function walkStart() {
  if (walk.on) return;
  const r = view.canvas.getBoundingClientRect(), p = view.groundPoint(r.left + r.width / 2, r.top + r.height / 2) || { x: view.cam.x, z: view.cam.z };
  let spot = null; // chỗ đứng được gần tâm màn hình nhất: dò vòng xoắn ra ngoài, lượt đầu tránh ô có cây (tán cây che camera)
  const treeAt = (x, z) => { const i = S.cellOf(x), j = S.cellOf(z); return i >= 0 && j >= 0 && i < S.N && j < S.N && city.tree[j * S.N + i]; };
  for (const avoidTree of [true, false]) {
    for (let rad = 0; rad <= 120 && !spot; rad += 2) {
      const n = Math.max(1, Math.round(rad * 1.5));
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, x = p.x + Math.cos(a) * rad, z = p.z + Math.sin(a) * rad; if ((!avoidTree || !treeAt(x, z)) && view.avatarGround(x, z) !== null) { spot = { x, z }; break; } }
    }
    if (spot) break;
  }
  if (!spot || !view.avatarDrop(spot.x, spot.z)) { toast('Không có chỗ đứng quanh đây: kéo bản đồ tới chỗ có đường hoặc đất trống rồi thử lại'); return; }
  setTool('info'); $('info').classList.remove('show');
  if (!gta) { gta = createGta({ view, getCity: () => city, toast, money }); window.__gta = gta; } // window: tiện thử nghiệm
  gta.reset();
  { // xe máy của thị trưởng đỗ ngay cạnh chỗ thả
    const a = view.avatar;
    for (const [dx, dz] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) { const x = a.x + dx, z = a.z + dz, y = view.avatarGround(x, z); if (y !== null) { view.parkedVeh.push({ x, z, y, yaw: a.yaw, veh: { id: -1, kind: 'moto', look: 'scooter', color: 0.58, mine: true, hp: 100 } }); break; } }
  }
  walk.on = true; document.body.classList.add('walking'); $('bWalk').classList.add('on');
  renderQuests();
  toast(matchMedia('(pointer: coarse)').matches ? 'Kéo cần bên trái để đi (đẩy hết cỡ để chạy) · vuốt màn hình để xoay · chụm hai ngón để xa gần' : 'WASD hoặc phím mũi tên để đi · giữ Shift để chạy · kéo chuột để xoay · lăn chuột để xa gần · Esc để thôi', '🚶 Đang đi bộ');
}
function walkStop() {
  if (!walk.on) return;
  walk.on = false; walk.joy.x = walk.joy.y = 0; walk.chan = null; walk.opts = []; walk.sig = ''; $('walkNav').hidden = true; $('gtaHud').hidden = true;
  if (gta) gta.reset();
  $('walkAct').innerHTML = ''; $('walkCard').hidden = true; $('info').classList.remove('show'); $('questLog').hidden = true;
  { const n = Quests.questState(city).length; if (n) setTimeout(() => toast(`Còn ${n} việc dân nhờ: ${Quests.questState(city).map((q) => q.title.toLowerCase()).join('; ')}`, '📋 Nhớ nhé'), 600); }
  view.avatarLeave();
  document.body.classList.remove('walking'); $('bWalk').classList.remove('on');
  $('joyKnob').style.transform = '';
}
/**
 * Việc làm được quanh nhân vật (quét 4 lần mỗi giây): việc tốt (dập lửa, bắt cướp, dọn rác), hỏi chuyện người đi bộ
 * gần nhất, gõ cửa nhà phía trước, xem công trình phía trước. Nút đầu tiên bấm bằng phím E.
 */
function walkScan() {
  const a = view.avatar, c = city, T = S.T, opts = [];
  if (a.veh) { walkOpts(gta.driveOpts()); return; } // đang lái: chỉ có nút xe
  opts.push(...gta.vehicleOpts());
  for (const d of Deeds.deedsNear(c, a.x, a.z).slice(0, 2)) { const D = Deeds.DEED[d.kind]; opts.push({ id: `d${d.kind}${d.cell}`, icon: D.icon, label: D.verb, deed: d, secs: D.secs, hot: true }); }
  let best = null, bd = 4.5; // người đi bộ trong 4,5 m
  for (const w of c.traffic.peds) { if (w.rx == null || !w.cb || w.cb.t !== 'cit') continue; const d = Math.hypot(w.rx - a.x, w.rz - a.z); if (d < bd && c.pp.alive[w.cb.id] && c.pp.gen[w.cb.id] === w.cb.gen) { bd = d; best = w; } }
  if (best) opts.push({ id: `p${best.cb.id}`, icon: '💬', label: 'Hỏi chuyện', person: best.cb.id, purpose: best.cb.purpose });
  for (const r of [0.6, 1.1]) { // ô phía trước mặt (nhân vật đứng sát nhà thì ô đó bị chặn, nhìn thẳng vào nó)
    const fx = a.x + Math.sin(a.yaw) * T * r, fz = a.z + Math.cos(a.yaw) * T * r, x = S.cellOf(fx), y = S.cellOf(fz);
    if (!S.inMap(x, y)) continue;
    const i = y * S.N + x, name = Deeds.placeLabel(c, i);
    if (!name) continue;
    if (c.level[i] && c.resCount[i] > 0) opts.push({ id: `k${i}`, icon: '👋', label: 'Gõ cửa', knock: i });
    opts.push({ id: `v${i}`, icon: '🔍', label: `Xem ${name.replace(/^\S+\s/, '')}`, view: { x, y, wx: S.cellCenter(x), wz: S.cellCenter(y) } });
    break;
  }
  walkOpts(opts.slice(0, 4));
}
/** Vẽ lại các nút việc (chỉ khi danh sách đổi) và dòng chỉ hướng. */
function walkOpts(list) {
  const a = view.avatar, c = city, T = S.T;
  let firstE = true;
  for (const o of list) { if (o.key === 'F') continue; if (firstE) { o.key = 'E'; firstE = false; } }
  { // việc gần nhất ngoài tầm tay: chỉ hướng và khoảng cách (mũi tên theo hướng camera)
    let tgt = null, td = Infinity;
    const consider = (i, icon, what) => { const d = Math.hypot(S.cellX(i) - a.x, S.cellZ(i) - a.z); if (d < td) { td = d; tgt = { i, icon, what }; } };
    for (let i = 0; i < S.N * S.N; i++) if (c.fire[i]) consider(i, '🔥', 'Đám cháy');
    if (!tgt) for (const r of c.inc.robberies) consider(r.cell, '🚨', 'Vụ cướp');
    const nav = $('walkNav'), tx = gta.navTarget() || questNav();
    if (!gta.g.taxi) { const qn = questNav(); if (qn) view.setBeacon(qn.x, qn.z, qn.ride ? 0x4ad07a : 0xffc83a); else view.setBeacon(null); }
    if (tx) { td = Math.hypot(tx.x - a.x, tx.z - a.z); tgt = { x: tx.x, z: tx.z, icon: tx.icon, what: tx.text }; }
    else if (tgt) { tgt.x = S.cellX(tgt.i); tgt.z = S.cellZ(tgt.i); }
    if (!tgt || (!tx && td < T * 1.7)) nav.hidden = true;
    else {
      const vx = tgt.x - a.x, vz = tgt.z - a.z, yw = view.cam.yaw;
      const ang = Math.atan2(vx * Math.cos(yw) - vz * Math.sin(yw), -vx * Math.sin(yw) - vz * Math.cos(yw));
      nav.textContent = `${tgt.icon} ${tgt.what}${tx ? ' ·' : ''} cách ${fmt(td)} m ${['⬆', '↗', '➡', '↘', '⬇', '↙', '⬅', '↖'][((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8]}`;
      nav.hidden = false;
    }
  }
  const sig = list.map((o) => o.id).join('|');
  if (sig === walk.sig) return; // giữ nguyên nút cũ (nút đang chạy thanh tiến độ)
  walk.sig = sig; walk.opts = list;
  const box = $('walkAct'); box.innerHTML = '';
  walk.opts.forEach((o) => {
    const b = document.createElement('button');
    b.className = 'panel wact' + (o.hot ? ' hot' : '');
    b.innerHTML = `<span>${o.icon}</span> ${esc(o.label)}${o.key ? ` <kbd>${o.key}</kbd>` : ''}<i></i>`;
    b.addEventListener('click', () => walkDo(o));
    o.el = b; box.append(b);
  });
}
function walkDo(o) {
  if (!o || walk.chan) return;
  const c = city;
  if (gta.act(o)) { walk.sig = ''; walkScan(); return; }
  if (o.deed) { walk.chan = { o, t: 0, x: view.avatar.x, z: view.avatar.z }; return; } // giữ yên vài giây
  if (o.view) { $('walkCard').hidden = true; showInfo(o.view); return; }
  let id = o.person, purpose = o.purpose;
  if (o.knock != null) { const ids = Deeds.residentsOf(c, o.knock); if (!ids.length) { toast('Không có ai ở nhà'); return; } id = ids[walk.knock++ % ids.length]; purpose = null; }
  openPerson(id, purpose);
}

/**
 * Thẻ người dân khi gặp ngoài phố: thông tin, lời than, lời nhờ (nhiệm vụ, quests.js) và ô trò chuyện.
 * Trò chuyện: Claude đóng vai người dân (/api/city/ai, kind 'npc'); không có AI thì trả lời theo mẫu từ lời than thật.
 */
function openPerson(id, purpose) {
  const c = city, p = Deeds.personCard(c, id, purpose), offer = Quests.questOffer(c, id), mine = Quests.questState(c).find((q) => q.pid === id && q.gen === c.pp.gen[id]);
  $('info').classList.remove('show');
  const card = $('walkCard'), chat = [];
  card.innerHTML = `<button class="wclose" title="Đóng (Esc)">✕</button><h3>${p.mood} ${esc(p.name)}</h3>
    <blockquote>${p.says.map((t) => `<p>“${esc(t)}”</p>`).join('')}</blockquote>
    ${offer ? `<div class="qoffer"><b>${Quests.QUESTS[offer.kind].icon} Nhờ thị trưởng: ${esc(offer.title)}</b><p>“${esc(offer.plea)}”</p>
      <small>Hạn ${Quests.QUESTS[offer.kind].days} ngày${Quests.QUESTS[offer.kind].needVeh ? ' · cần xe' : ''} · xong thì uy tín +${Quests.QUESTS[offer.kind].rep}</small>
      <div class="qbtn"><button class="qyes">✅ Nhận việc</button><button class="qno">Để sau</button></div></div>` : ''}
    ${mine ? `<div class="qoffer"><b>📋 Đang làm giúp: ${esc(mine.title)}</b><p>“Trông cả vào thị trưởng đấy!”</p></div>` : ''}
    ${p.rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
    <div class="row"><span>Mức vui</span><span><b>${p.happy}</b>/100</span></div>
    <div class="npcChat"></div>
    <form class="npcSay"><input maxlength="200" placeholder="Nói với ${esc(p.name.split(' ').pop())}…" aria-label="Nói với người dân"><button>Gửi</button></form>`;
  card.querySelector('.wclose').onclick = () => { card.hidden = true; };
  if (offer) {
    card.querySelector('.qyes').onclick = () => {
      const r = Quests.acceptQuest(c, id, offer);
      toast(r.ok ? `${Quests.QUESTS[offer.kind].icon} ${offer.title}${Quests.QUESTS[offer.kind].needVeh ? ' · lấy xe rồi tới đón' : ''}` : r.reason, r.ok ? '📋 Đã nhận việc' : undefined);
      if (r.ok) { renderQuests(); openPerson(id, purpose); }
    };
    card.querySelector('.qno').onclick = () => card.querySelector('.qoffer').remove();
  }
  const box = card.querySelector('.npcChat'), form = card.querySelector('.npcSay'), inp = form.querySelector('input');
  const line = (who, text) => { const d = document.createElement('p'); d.className = who; d.textContent = text; box.append(d); box.scrollTop = box.scrollHeight; card.scrollTop = card.scrollHeight; return d; };
  inp.addEventListener('keydown', (e) => e.stopPropagation()); // gõ chữ không điều khiển nhân vật
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = inp.value.trim(); if (!text) return;
    inp.value = ''; line('me', text); chat.push({ from: 'us', text });
    const wait = line('npc', '…');
    const quest = offer && !Quests.questState(c).some((q) => q.pid === id) ? { title: offer.title, plea: offer.plea } : mine ? { title: mine.title, accepted: true } : null;
    const r = await aiCall('npc', { city: citySummary(c, S), person: { name: p.name, female: p.female, age: p.age, happy: p.happy, says: p.says, facts: p.rows.map(([k, v]) => `${k}: ${v}`), quest }, chat });
    const reply = (r && r.reply) || npcFallback(p, offer, text);
    wait.textContent = reply; chat.push({ from: 'npc', text: reply });
  };
  card.hidden = false;
}
/** Trả lời soạn sẵn khi không có AI: chào, cảm ơn, hoặc nhắc lại điều đang lo. */
function npcFallback(p, offer, text) {
  const t = text.toLowerCase(), me = p.age < 18 ? 'cháu' : 'tôi';
  if (/chào|xin chào|hello|hi\b/.test(t)) return `Chào thị trưởng! Hiếm khi thấy thị trưởng đi bộ ngoài phố thế này.`;
  if (/cảm ơn|cám ơn/.test(t)) return 'Có gì đâu, thị trưởng nhớ tới dân là quý rồi.';
  if (/khoẻ|khỏe|thế nào|ra sao|ổn không/.test(t)) return p.happy >= 60 ? `Dạo này ${me} ổn, cảm ơn thị trưởng hỏi thăm.` : `Cũng không ổn lắm. ${p.says[0] || ''}`;
  if (offer) return `${offer.plea} Thị trưởng giúp ${me} nhé?`;
  return p.says[Math.floor(Math.random() * p.says.length)] || 'Vâng, thị trưởng cứ làm tốt là dân ủng hộ.';
}

/** Sổ nhiệm vụ khi đi bộ (góc trái); bấm một dòng để chọn việc chỉ hướng. */
function renderQuests() {
  const el = $('questLog'), list = Quests.questState(city);
  el.hidden = !walk.on || !list.length;
  if (el.hidden) return;
  if (!list.some((q) => q.uid === walk.qSel)) walk.qSel = list[0] && list[0].uid;
  el.innerHTML = `<b>📋 Việc dân nhờ</b>${list.map((q) => `<button data-q="${esc(q.uid)}" class="${q.uid === walk.qSel ? 'on' : ''}">${esc(Quests.questLine(city, q))}</button>`).join('')}`;
  el.querySelectorAll('button').forEach((b) => { b.onclick = () => { walk.qSel = b.dataset.q; renderQuests(); }; });
}
/** Chấm nhiệm vụ mỗi giây (cả lúc xây dựng): báo xong / trễ hạn / đón khách. */
function questsTick(now) {
  if (now - (questsTick.at || 0) < 1000 || !city.quests || !city.quests.length) return;
  questsTick.at = now;
  const a = walk.on ? view.avatar : null;
  for (const ev of Quests.questTick(city, { avatar: a })) {
    const q = ev.q, Q = Quests.QUESTS[q.kind];
    if (ev.type === 'done') toast(`${q.name} cảm ơn thị trưởng · uy tín +${Q.rep}${ev.tip ? ` · boa ${money(ev.tip)} vào ngân sách` : ''}`, `✅ Xong việc: ${q.title}`);
    else if (ev.type === 'fail') toast(`${q.name} thất vọng vì quá hạn · uy tín −0,5`, `⌛ Trễ hạn: ${q.title}`);
    else if (ev.type === 'pick') toast(`${q.name} đã lên xe: chở tới cột sáng xanh`);
    else if (ev.type === 'drop') toast(`${q.name} xuống xe đứng chờ: quay lại đón`);
    else if (ev.type === 'gone') toast(`${q.name} đã chuyển đi nơi khác, việc nhờ bị huỷ`);
    updateHud(true);
  }
  renderQuests();
}
/** Điểm chỉ hướng của việc đang chọn (đón / trả người ốm, đống rác). */
function questNav() {
  const list = Quests.questState(city), q = list.find((o) => o.uid === walk.qSel) || list[0];
  const t = q && Quests.questTarget(city, q);
  return t ? { x: t.x, z: t.z, icon: Quests.QUESTS[q.kind].icon, text: t.text, ride: q.kind === 'ride' && q.stage } : null;
}
function walkTick(dt, now) {
  gta.tick(dt);
  if (now - walk.scanAt > 250) { walk.scanAt = now; walkScan(); const h = gta.hud(), el = $('gtaHud'); el.textContent = h; el.hidden = !h; }
  const ch = walk.chan;
  if (!ch) return;
  const a = view.avatar, o = ch.o, bar = o.el && o.el.querySelector('i');
  if (Math.hypot(a.x - ch.x, a.z - ch.z) > 1.5 || !Deeds.deedValid(city, o.deed)) { walk.chan = null; if (bar) bar.style.width = '0'; return; } // đi chỗ khác hay việc đã xong thì thôi
  ch.t += dt;
  if (bar) bar.style.width = `${Math.min(100, (ch.t / o.secs) * 100)}%`;
  if (ch.t < o.secs) return;
  walk.chan = null; walk.sig = '';
  const r = Deeds.doDeed(city, o.deed);
  toast(r.ok ? `${r.text}${r.reward ? ` · thưởng ${money(r.reward)}` : ' · hôm nay đã nhận đủ thưởng'}` : r.text, r.ok ? `${Deeds.DEED[o.deed.kind].icon} Việc tốt` : undefined);
  if (r.ok) { city.dirty.zones = true; updateHud(true); }
}

function bindWalk() {
  $('bWalk').addEventListener('click', () => (walk.on ? walkStop() : walkStart()));
  $('walkExit').addEventListener('click', walkStop);
  const cv = view.canvas, pts = new Map();
  let pinch = 0;
  // khi đang đi bộ, chặn mọi thao tác xây dựng trên canvas: kéo một ngón / chuột = xoay camera, chụm hai ngón = xa gần
  const stop = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
  const spread = () => { const [a, b] = [...pts.values()]; return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); };
  cv.addEventListener('pointerdown', (e) => {
    if (!walk.on) return; stop(e);
    try { cv.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) pinch = spread();
  }, true);
  cv.addEventListener('pointermove', (e) => {
    if (!walk.on) return; stop(e);
    const t = pts.get(e.pointerId); if (!t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y; t.x = e.clientX; t.y = e.clientY;
    if (pts.size >= 2) { const d = spread(); view.zoom(pinch / d); pinch = d; return; }
    view.rotate(-dx * 0.006, dy * 0.004);
  }, true);
  const up = (e) => { if (!walk.on) return; stop(e); pts.delete(e.pointerId); if (pts.size === 2) pinch = spread(); };
  cv.addEventListener('pointerup', up, true); cv.addEventListener('pointercancel', up, true);
  cv.addEventListener('contextmenu', (e) => { if (walk.on) e.preventDefault(); });
  // cần điều khiển ảo (màn hình cảm ứng)
  const joy = $('joy'), knob = $('joyKnob');
  let jid = null;
  const jset = (e) => {
    const r = joy.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    walk.joy.x = x; walk.joy.y = y; walk.joy.run = l > 0.92;
    knob.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
    joy.classList.toggle('run', walk.joy.run);
  };
  joy.addEventListener('pointerdown', (e) => { e.preventDefault(); jid = e.pointerId; try { joy.setPointerCapture(jid); } catch { /* bỏ qua */ } jset(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) jset(e); });
  const jend = (e) => { if (e.pointerId !== jid) return; jid = null; walk.joy.x = walk.joy.y = 0; walk.joy.run = false; knob.style.transform = ''; joy.classList.remove('run'); };
  joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);
}

function bindInput() {
  const cv = view.canvas;
  bindWalk();
  let rot = null, grab = null, downAt = null;
  const isDrawTool = () => { const k = toolInfo(tool).kind; return k === 'road' || k === 'line' || k === 'transit' || k === 'rail'; };
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  const downH = (e) => {
    try { cv.setPointerCapture(e.pointerId); } catch { /* ngón đã nhấc (chạm nhanh) */ }
    downAt = { x: e.clientX, y: e.clientY, moved: false };
    if (e.button === 2 || e.button === 1) { rot = { x: e.clientX, y: e.clientY }; return; }
    if (e.button !== 0) return;
    hover = view.pick(e.clientX, e.clientY);
    if (seatPick != null && hover) { const r = S.moveSeat(city, seatPick, hover.x, hover.y); toast(r.ok ? `📍 Đã dời trụ sở ${city.dist.list[seatPick].name}: ranh giới các quận vẽ lại` : r.reason); if (r.ok) { seatPick = null; city.dirty.zones = true; $('dist').classList.remove('peek'); renderDist(true); } return; }
    if (tool === 'info') { grab = view.groundPoint(e.clientX, e.clientY); cv.style.cursor = 'grabbing'; return; }
    if (!hover) return;
    if (tool === 'move') { moveClick(); return; }
    if (isDrawTool()) { downAt.started = !draw; drawClick(false); return; }
    if (S.SERVICES[tool]) {
      const r = S.placeService(city, tool, hover.x, hover.y);
      if (!r.ok) toast(r.reason);
      else { const d = S.SERVICES[tool]; if ((d.power || d.water || d.sewage) && !r.linked) toast(`${d.name} đang ở xa đường: kéo ${d.power ? 'dây điện' : 'ống nước'} từ nó tới đường`); }
      updatePreview(); updateHud(true);
      return;
    }
    if (tool === 'turn') {
      const n = S.nodeAt(city, hover.wx, hover.wz, 14);
      if (!n) { toast('Bấm vào một nút giao'); return; }
      const r = S.setTurnBan(city, n.id, ((n.turn | 0) + 1) % S.TURNS.length);
      toast(r.ok ? (r.turn ? `Đã cắm biển ${S.TURNS[r.turn].icon} ${S.TURNS[r.turn].name.toLowerCase()}` : 'Đã gỡ biển cấm rẽ') : r.reason);
      updatePreview(); updateHud(true);
      return;
    }
    if (tool === 'bump') {
      const e = S.edgeAt(city, hover.wx, hover.wz, 2);
      if (!e) { toast('Bấm vào một đoạn đường'); return; }
      const r = S.setBump(city, e.id, !e.bump);
      toast(r.ok ? (r.bump ? `Đã làm gờ giảm tốc · ${money(S.BUMP_COST)}` : 'Đã gỡ gờ giảm tốc') : r.reason);
      updatePreview(); updateHud(true);
      return;
    }
    if (tool === 'sign') {
      const e = S.edgeAt(city, hover.wx, hover.wz, 2);
      if (!e) { toast('Bấm vào một đoạn đường'); return; }
      const r = S.setRoadSign(city, e.id, ((e.ban || 0) + 1) % S.BANS.length);
      toast(r.ok ? (r.ban ? `Đã cắm biển ${S.BANS[r.ban].icon} ${S.BANS[r.ban].name.toLowerCase()}` : 'Đã gỡ biển cấm') : r.reason);
      updatePreview(); updateHud(true);
      return;
    }
    if (tool === 'roundabout' || tool === 'junction') {
      const n = S.nodeAt(city, hover.wx, hover.wz, 14);
      if (!n) { toast('Bấm vào một nút giao'); return; }
      const r = tool === 'roundabout' ? S.makeRoundabout(city, n.id) : S.setJunction(city, n.id, ((n.ctl | 0) + 1) % 3);
      toast(r.ok ? (tool === 'roundabout' ? `Đã làm vòng xuyến · ${money(r.cost)}` : `Nút giao: ${S.JUNCTION_CTL[r.ctl]}`) : r.reason);
      updatePreview(); updateHud(true);
      return;
    }
    if (toolInfo(tool).kind === 'terra') {
      stroke = { target: Math.round(S.heightAt(city, hover.wx, hover.wz) * 10) / 10, at: performance.now(), spent: 0, last: -1 };
      strokeStep(true);
      return;
    }
    if (tool === 'land') {
      const r = S.buyLand(city, S.landOf(hover.x, hover.y));
      toast(r.ok ? `Đã mua ô đất · ${money(r.price)}` : r.reason);
      updatePreview(); updateHud(true);
      return;
    }
    drag = { from: hover, to: hover };
    updatePreview();
  };
  const moveH = (e) => {
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
  };
  const upH = (e) => {
    if (rot) {
      rot = null;
      if (e.button === 2 && downAt && !downAt.moved) { if (moving) { cancelDraw(); renderHint(); } else if (draw && draw.stops && draw.stops.length >= 2) finishTransit(); else if (draw && draw.rail) finishRail(null); else if (draw) { cancelDraw(); renderHint(); } else if (tool !== 'info') setTool('info'); }
    }
    if (grab) { grab = null; cv.style.cursor = 'grab'; if (downAt && !downAt.moved) { const t = view.pick(e.clientX, e.clientY); if (t) showInfo(t); } }
    if (stroke && e.button === 0) endStroke();
    if (drag) commitDrag();
    else if (e.button === 0 && isDrawTool() && downAt && downAt.moved && downAt.started && draw) { hover = view.pick(e.clientX, e.clientY); drawClick(true); } // kéo-thả = điểm đầu + điểm cuối
    downAt = null;
  };

  // ── cảm ứng: một ngón như chuột trái; hai ngón kéo / chụm / xoay; ba ngón kéo dọc để nghiêng ──
  // Ngón đầu tiên chờ một chút (TAP_WAIT) trước khi hành động: nếu ngón thứ hai chạm theo thì đó là cử chỉ camera, không xây nhầm.
  const TAP_WAIT = 110, touches = new Map();
  let pend = null, gest = null, armed = null, armTipped = false;
  const plain = (e) => ({ clientX: e.clientX, clientY: e.clientY, button: 0, pointerId: e.pointerId });
  const flush = () => { if (!pend) return; const p = pend; pend = null; clearTimeout(p.t); downH(p.e); };
  // công trình đặt một lần (dịch vụ, mua đất): chạm lần đầu chỉ hiện bóng xem trước, chạm lại đúng ô đó mới đặt
  const confirmTool = () => !!S.SERVICES[tool] || tool === 'land';
  /** Ngón thứ hai chạm khi ngón đầu đã bắt đầu thao tác: bỏ thao tác đó (kéo quy hoạch, nét địa hình, nét đường vừa bắt đầu). */
  const abortSingle = () => {
    grab = null; rot = null;
    if (drag) { drag = null; view.setPreview(null); }
    endStroke();
    if (downAt && downAt.started && draw) { cancelDraw(); renderHint(); }
    downAt = null;
  };
  const gState = () => {
    const [a, b, c] = [...touches.values()];
    const s = { n: touches.size, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), ang: Math.atan2(b.y - a.y, b.x - a.x) };
    if (c) s.my3 = (a.y + b.y + c.y) / 3;
    return s;
  };
  const syncCam = () => { view._camera(); view.camera.updateMatrixWorld(); };
  const gStart = () => { const s = gState(); syncCam(); s.anchor = view.groundPoint(s.mx, s.my); gest = s; };
  const gMove = () => {
    const s = gState();
    if (s.n >= 3) { // ba ngón: nghiêng
      if (gest.my3 != null) view.rotate(0, (s.my3 - gest.my3) * 0.005);
      gest.my3 = s.my3; return;
    }
    let da = s.ang - gest.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    view.zoom(gest.d / s.d);
    view.rotate(da, 0);
    gest.d = s.d; gest.ang = s.ang;
    if (gest.anchor) { // giữ điểm đất dưới tâm hai ngón đứng yên dưới tay
      syncCam();
      const p = view.groundPoint(s.mx, s.my);
      if (p) { view.panWorld(gest.anchor.x - p.x, gest.anchor.z - p.z); syncCam(); }
    }
  };
  const tapConfirm = (e) => { // chạm (không kéo) khi đang cầm công trình đặt một lần
    const h = view.pick(e.clientX, e.clientY);
    if (!h) return;
    if (armed && armed.x === h.x && armed.y === h.y) { armed = null; downH(plain(e)); upH(plain(e)); return; }
    armed = h; hover = h; updatePreview();
    if (!armTipped) { armTipped = true; toast('Chạm lần nữa vào chỗ đó để đặt · kéo bóng công trình để dời'); }
  };

  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') { downH(e); return; }
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (touches.size >= 2) {
      if (pend) { clearTimeout(pend.t); pend = null; } else if (!gest) abortSingle();
      if (touches.size === 2 || !gest) gStart(); else { gest.n = touches.size; gest.my3 = gState().my3; }
      return;
    }
    if (gest) return;
    if (confirmTool()) { pend = { e: plain(e), t: 0, confirm: true }; return; }
    pend = { e: plain(e), t: setTimeout(flush, TAP_WAIT) };
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') { moveH(e); return; }
    const t = touches.get(e.pointerId); if (!t) return;
    t.x = e.clientX; t.y = e.clientY;
    if (gest) { if (touches.size >= 2) gMove(); return; }
    const far = Math.hypot(t.x - t.x0, t.y - t.y0) > 10;
    if (pend && pend.confirm) { if (far) { pend.moved = true; armed = null; moveH(e); } return; } // kéo bóng công trình đi chỗ khác
    if (pend) { if (!far) return; flush(); }
    moveH(e);
  });
  const touchEnd = (e, cancel) => {
    if (!touches.delete(e.pointerId)) return;
    if (gest) { // nhấc ngón trong cử chỉ: còn hai ngón thì đo lại, hết ngón thì xong
      if (touches.size >= 2) gStart(); else if (!touches.size) gest = null; else { gest = null; touches.clear(); }
      return;
    }
    if (pend && pend.confirm) { const p = pend; pend = null; if (cancel) return; if (p.moved) { armed = hover; if (!armTipped) { armTipped = true; toast('Chạm vào bóng công trình để đặt'); } } else tapConfirm(e); return; }
    if (cancel) { pend && clearTimeout(pend.t); pend = null; rot = grab = drag = null; endStroke(); view.setPreview(null); downAt = null; return; }
    flush();
    upH(plain(e));
  };
  cv.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') touchEnd(e, false); else upH(e); });
  cv.addEventListener('pointercancel', (e) => { if (e.pointerType === 'touch') { touchEnd(e, true); return; } rot = grab = drag = null; endStroke(); view.setPreview(null); });
  cv.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false }); // chặn phóng to trang, kéo làm mới của trình duyệt
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'touch') return; if (!drag && !draw && !stroke) { hover = null; view.setPreview(null); view.setGhost(null); view.setMarker(null); } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom(Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0014)); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (walk.on) { // đang đi bộ: phím di chuyển dành cho nhân vật, không đổi công cụ xây dựng
      if (k === 'escape' && ($('modal').classList.contains('show') || $('menu').classList.contains('open') || $('sys').classList.contains('open'))) { $('modal').classList.remove('show'); $('menu').classList.remove('open'); $('sys').classList.remove('open'); return; }
      if (k === 'escape' && !$('walkCard').hidden) { $('walkCard').hidden = true; return; }
      if (k === 'escape' && $('info').classList.contains('show')) { $('info').classList.remove('show'); return; }
      if (k === 'escape' || k === 'k') { walkStop(); return; }
      if (k === 'e' || k === 'f') { walkDo(walk.opts.find((o) => o.key === k.toUpperCase())); return; }
      if (k === ' ') { e.preventDefault(); setSpeed(speed ? 0 : updateHud.lastSpeed || 1); }
      else if (k === '1' || k === '2' || k === '3') setSpeed([1, 2, 4][+k - 1]);
      else if (k === 'n') toggleNight();
      else if (k === 'u') document.body.classList.toggle('noui');
      else if (k.startsWith('arrow')) e.preventDefault();
      return;
    }
    if (k === 'k') { walkStart(); return; }
    if (k === ' ') { e.preventDefault(); setSpeed(speed ? 0 : updateHud.lastSpeed || 1); }
    else if (k === '1' || k === '2' || k === '3') setSpeed([1, 2, 4][+k - 1]);
    else if (k === 'escape') { // lần lượt: hộp hướng dẫn → menu ☰ → nét đang vẽ → công cụ đang cầm → bảng đang mở
      if ($('modal').classList.contains('show')) { $('modal').classList.remove('show'); return; }
      if ($('menu').classList.contains('open') || $('sys').classList.contains('open')) { $('menu').classList.remove('open'); $('sys').classList.remove('open'); return; }
      if (seatPick != null) { seatPick = null; renderDist(true); }
      else if (drag) { drag = null; view.setPreview(null); renderHint(); }
      else if (draw || moving) { cancelDraw(); renderHint(); }
      else if (tool !== 'info') setTool('info');
      else { const open = [...document.querySelectorAll('.side.show:not(.peek)')].pop(); if (open) open.querySelector('[data-close]')?.click(); }
    }
    else if (k === 'enter') { if (!finishTransit()) finishRail(null); }
    else if (k === 'r') setTool(GROUPS.find((x) => x.id === 'road').last || 'road:small');
    else if (k === 'b') setTool(tool === 'bulldoze' ? 'info' : 'bulldoze');
    else if (k === 'm') setTool(tool === 'move' ? 'info' : 'move');
    else if (k === 't') setTool(GROUPS.find((g) => g.id === 'terra').last || 'terra:dig');
    else if (k === '[' || k === ']') { const i = S.BRUSHES.indexOf(brush) + (k === ']' ? 1 : -1); brush = S.BRUSHES[Math.max(0, Math.min(S.BRUSHES.length - 1, i))]; refreshToolbar(); updatePreview(); }
    else if (k === 'n') toggleNight();
    else if (k === 'l' || k === 'i') $('bLayer').click();
    else if (k === 'p') $('bDev').click();
    else if (k === 'z') $('bBudget').click();
    else if (k === 'v') $('bCity').click();
    else if (k === 'u') { document.body.classList.toggle('noui'); if (document.body.classList.contains('noui')) toast('Ẩn giao diện · bấm U để hiện lại'); }
    else if (k === 'c' && group === 'road') { roadMode = roadMode === 'curve' ? 'line' : 'curve'; cancelDraw(); refreshToolbar(); renderHint(); }
    else if (k === 'pageup' || k === 'pagedown' || (group === 'road' && (k === '=' || k === '+' || k === '-'))) { e.preventDefault(); shiftLevel(k === 'pageup' || k === '=' || k === '+' ? 1 : -1); }
    else if (k === 'h' && group === 'road') toggleHideBld();
    else if (k === 'g') { gridSnap = !gridSnap; refreshToolbar(); toast(gridSnap ? 'Bám lưới: bật' : 'Bám lưới: tắt (vẽ tự do)'); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); endStroke(); });
  window.addEventListener('resize', () => { view.resize(); layout(); });
}

/** Đo các khối giao diện để bảng bên, thông báo, bảng ô đang xem không đè lên nhau:
 * --barH đáy thanh trên, --topH đáy vùng trên (thêm thẻ thành phố khi nó nằm trên), --dockH đỉnh thanh công cụ, --leftH đỉnh cột trái. */
function layout() {
  const r = document.documentElement.style, H = innerHeight, top = $('top').getBoundingClientRect().bottom;
  const st = $('status').getBoundingClientRect(), dock = $('dockbar').getBoundingClientRect(), left = $('left').getBoundingClientRect(), stTop = st.top < H / 2;
  r.setProperty('--barH', `${Math.round(top + 8)}px`);
  r.setProperty('--topH', `${Math.round((stTop ? Math.max(top, st.bottom) : top) + 8)}px`);
  r.setProperty('--dockH', `${Math.round(H - dock.top + 8)}px`);
  r.setProperty('--leftH', `${Math.round(stTop ? H - dock.top + 8 : H - left.top + 8)}px`);
}

function toggleNight() {
  view.dayNight = !view.dayNight;
  $('bNight').classList.toggle('on', view.dayNight);
  try { localStorage.setItem(KEY + 'night', view.dayNight ? '1' : '0'); } catch { /* bỏ qua */ }
  toast(view.dayNight ? '🌙 Ngày đêm: bật — trời tối dần theo giờ, phố lên đèn' : '☀️ Ngày đêm: tắt — luôn là ban ngày');
}

/** Bảng chọn lớp xem. */
function buildLayers() {
  const box = $('layerList'); box.textContent = '';
  LAYERS.forEach(([, tip, icon, name], k) => {
    const b = el('button', 'lay'); b.title = tip.replace('Lớp xem: ', ''); b.dataset.k = k;
    b.append(el('span', null, icon), el('small', null, name));
    b.addEventListener('click', () => { layer = k; applyOverlay(); refreshLayers(); renderHint(k ? tip : null); });
    box.append(b);
  });
  refreshLayers();
}
function refreshLayers() {
  for (const b of $('layerList').children) b.classList.toggle('on', +b.dataset.k === layer);
  $('bLayer').classList.toggle('on', layer > 0 || $('layers').classList.contains('show'));
  const chip = $('layerChip'); chip.hidden = !layer; // nhãn lớp xem đang bật, bấm để tắt
  if (layer) { const [, , icon, name] = LAYERS[layer]; chip.textContent = ''; chip.append(`${icon} Lớp: `, el('b', null, name), ' ✕'); }
}

// ───────────────────────── bản đồ nhỏ ─────────────────────────

const mini = { img: null, cv: null, at: 0 };
function drawMinimap(now) {
  if (now - mini.at < 700 || !$('mini').offsetParent) return; // đang ẩn (nút 🧭, màn hẹp) thì khỏi vẽ
  mini.at = now;
  const cv = $('minimap'), g = cv.getContext('2d'), n = S.N, c = city;
  if (!mini.cv) { mini.cv = document.createElement('canvas'); mini.cv.width = mini.cv.height = n; mini.img = mini.cv.getContext('2d').createImageData(n, n); }
  const d = mini.img.data;
  for (let i = 0; i < n * n; i++) {
    let r, gg, b;
    if (c.water[i]) { r = 52; gg = 118; b = 172; }
    else if (c.road[i]) { r = 226; gg = 226; b = 220; }
    else if (c.occ[i]) { r = 236; gg = 236; b = 240; }
    else if (c.zone[i]) { [r, gg, b] = S.ZDEF[c.zone[i]].rgb; if (!c.level[i]) { r = r * 0.55 + 40; gg = gg * 0.55 + 55; b = b * 0.55 + 35; } }
    else { const h = Math.min(1, c.cellH[i] / 40); r = 74 + h * 90 - (c.tree[i] ? 26 : 0); gg = 128 + h * 40 - (c.tree[i] ? 22 : 0); b = 62 + h * 80 - (c.tree[i] ? 20 : 0); }
    if (!c.own[i]) { r *= 0.5; gg *= 0.5; b *= 0.55; }
    d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  mini.cv.getContext('2d').putImageData(mini.img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(mini.cv, 0, 0, cv.width, cv.height);
  // khung nhìn: chấm tại tâm camera + hướng nhìn
  const k = cv.width / (S.HALF * 2), cx = (view.cam.x + S.HALF) * k, cz = (view.cam.z + S.HALF) * k, yaw = view.cam.yaw, rr = Math.max(7, Math.min(46, view.cam.dist * 0.42 * k));
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.fillStyle = 'rgba(255,255,255,.16)';
  g.beginPath(); g.moveTo(cx + Math.sin(yaw) * rr * 0.5, cz + Math.cos(yaw) * rr * 0.5);
  g.lineTo(cx - Math.sin(yaw - 0.55) * rr, cz - Math.cos(yaw - 0.55) * rr); g.lineTo(cx - Math.sin(yaw + 0.55) * rr, cz - Math.cos(yaw + 0.55) * rr); g.closePath(); g.fill(); g.stroke();
}
function bindMinimap() {
  const cv = $('minimap');
  let down = false;
  const go = (e) => { const r = cv.getBoundingClientRect(); view.cam.x = ((e.clientX - r.left) / r.width - 0.5) * S.HALF * 2; view.cam.z = ((e.clientY - r.top) / r.height - 0.5) * S.HALF * 2; view.panWorld(0, 0); mini.at = 0; };
  cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId); go(e); });
  cv.addEventListener('pointermove', (e) => { if (down) go(e); });
  cv.addEventListener('pointerup', () => { down = false; });
  cv.addEventListener('pointercancel', () => { down = false; });
}

/** Thu cửa sổ quận lại để nhìn bản đồ; bấm 🏙️ để mở lại. */
function peekDist() { $('dist').classList.add('peek'); toast('Bấm 🏙️ để mở lại bảng điều hành quận'); }

function openSide(id) {
  if ((id === 'league' || id === 'flows') && $(id).classList.contains('peek') && $(id).classList.contains('show')) { $(id).classList.remove('peek'); if (id === 'league') renderLeague(); else renderFlows(); return; }
  if (id === 'flows') renderFlows();
  if (id === 'dist' && $('dist').classList.contains('peek') && $('dist').classList.contains('show')) { $('dist').classList.remove('peek'); renderDist(true); return; }
  if (id === 'league') { renderLeague(); leagueSync(true); }
  for (const p of ['budget', 'saves', 'people', 'dev', 'layers', 'fest', 'inbox', 'dist', 'corp', 'chron', 'league', 'flows']) $(p).classList.toggle('show', p === id && !$(p).classList.contains('show'));
  if (!$('dist').classList.contains('show')) { $('dist').classList.remove('peek'); seatPick = null; } // đóng bảng quận thì bỏ chọn chỗ trụ sở
  if (id === 'fest') renderFest(true);
  if (id === 'inbox') renderInbox(true);
  if (id === 'chron') renderChron(true);
  if (id === 'corp' && $('corp').classList.contains('show')) { layer = LAYERS.findIndex((l) => l[0] === 'corp'); applyOverlay(); refreshLayers(); renderCorp(true); } // mở bảng 🏢: bật lớp tập đoàn để thấy công ty đang chọn
  corpFocus();
  if (id === 'dist' && $('dist').classList.contains('show')) { if (city.dist.on) { layer = LAYERS.findIndex((l) => l[0] === 'district'); applyOverlay(); refreshLayers(); } renderDist(true); }
  if (id === 'saves') { renderSlots(); renderCloud(); cloudRefresh(); }
  if (id === 'dev') renderDev();
  if (id === 'people') renderCity(true);
  if (id === 'budget') { renderLoans.sig = ''; renderExpenses.at = 0; updateHud(true); }
}

function bindUi() {
  $('distPeek').addEventListener('click', () => peekDist());
  for (const b of $('speed').children) b.addEventListener('click', () => setSpeed(+b.dataset.s));
  $('bBudget').addEventListener('click', () => openSide('budget'));
  $('bLeague').addEventListener('click', () => openSide('league'));
  $('bFlows').addEventListener('click', () => openSide('flows'));
  $('bFlowsOpen').addEventListener('click', () => openSide('flows'));
  for (const b of document.querySelectorAll('[data-peek]')) b.addEventListener('click', () => { const p = b.closest('.side'); p.classList.add('peek'); toast(`Bấm ${p.id === 'league' ? '🏆' : '💸'} để mở lại cửa sổ`); });
  $('moneyStat').addEventListener('click', () => openSide('budget')); // bấm ô 💰 tiền cũng mở bảng ngân sách
  $('moneyStat').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSide('budget'); } });
  $('bStyle').addEventListener('click', () => { city.style = city.style === 'vn' ? 'classic' : 'vn'; view.restyle(); $('bStyle').classList.toggle('on', city.style === 'vn'); toast(city.style === 'vn' ? '🇻🇳 Phong cách Việt Nam: nhà ống, biển hiệu, cột điện, xe đẩy, cây dừa, xe máy' : 'Phong cách cổ điển'); });
  $('bSave').addEventListener('click', () => openSide('saves'));
  $('bCity').addEventListener('click', () => openSide('people'));
  $('bDev').addEventListener('click', () => openSide('dev'));
  $('fare').addEventListener('input', (e) => { city.transit.fare = +e.target.value; renderCity(true); });
  $('ferryFare').addEventListener('input', (e) => { city.transit.ferryFare = +e.target.value; renderCity(true); });
  for (const b of document.querySelectorAll('[data-dis]')) b.addEventListener('click', () => { const r = S.triggerDisaster(city, b.dataset.dis); if (!r.ok) toast(r.reason); });
  $('bLayer').addEventListener('click', () => { openSide('layers'); refreshLayers(); });
  $('dateBox').addEventListener('click', () => openSide('fest'));
  $('bInbox').addEventListener('click', () => openSide('inbox'));
  $('bDist').addEventListener('click', () => openSide('dist'));
  $('bCorp').addEventListener('click', () => openSide('corp'));
  $('bChron').addEventListener('click', () => openSide('chron'));
  $('bFest').addEventListener('click', () => openSide('fest'));
  $('bNight').addEventListener('click', toggleNight);
  // thanh trên: menu ☰ (màn hẹp), bật tắt cảnh báo và bản đồ nhỏ (nhớ qua lần mở sau), nhãn lớp xem
  $('bMenu').addEventListener('click', () => { $('sys').classList.remove('open'); $('menu').classList.toggle('open'); });
  $('menuItems').addEventListener('click', (e) => { if (e.target.closest('button')) $('menu').classList.remove('open'); });
  // điện thoại nằm ngang: ⚙️ gom ngày đêm, kiểu Việt, toàn màn hình, hướng dẫn; 💾 hiện riêng
  $('bMore').addEventListener('click', () => { $('menu').classList.remove('open'); $('sys').classList.toggle('open'); });
  $('sysMore').addEventListener('click', (e) => { if (e.target.closest('button')) $('sys').classList.remove('open'); });
  $('bSave2').addEventListener('click', () => $('bSave').click());
  document.addEventListener('pointerdown', (e) => { // chạm ra ngoài thì đóng ô thả xuống
    if (!e.target.closest('#menu')) $('menu').classList.remove('open');
    if (!e.target.closest('#sys')) $('sys').classList.remove('open');
  }, true);
  const goFull = async () => {
    const d = document.documentElement;
    try { if (!document.fullscreenElement) await (d.requestFullscreen || d.webkitRequestFullscreen).call(d, { navigationUI: 'hide' }); } catch { /* iPhone Safari: không có toàn màn hình cho trang */ }
    try { await screen.orientation.lock('landscape'); } catch { /* trình duyệt không cho khoá hướng */ }
  };
  $('bFull').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen?.(); else goFull(); });
  document.addEventListener('fullscreenchange', () => $('bFull').classList.toggle('on', !!document.fullscreenElement));
  $('rotFull').addEventListener('click', goFull);
  $('rotSkip').addEventListener('click', () => document.body.classList.add('portrait-ok'));
  const pref = (k, def) => { try { const v = localStorage.getItem(KEY + k); return v ? v === '1' : def; } catch { return def; } };
  const savePref = (k, on) => { try { localStorage.setItem(KEY + k, on ? '1' : '0'); } catch { /* bỏ qua */ } };
  const setAlerts = (on, save) => { $('alerts').classList.toggle('off', !on); $('bAlerts').classList.toggle('on', on); if (save) savePref('alerts', on); };
  setAlerts(pref('alerts', innerWidth > 640 && innerHeight > 520)); // điện thoại: thu gọn sẵn
  $('bAlerts').addEventListener('click', () => setAlerts($('alerts').classList.contains('off'), true));
  const setMini = (on, save) => { $('mini').classList.toggle('off', !on); $('bMini').classList.toggle('on', on); if (save) savePref('mini', on); mini.at = 0; layout(); };
  setMini(pref('mini', true));
  $('bMini').addEventListener('click', () => setMini($('mini').classList.contains('off'), true));
  $('layerChip').addEventListener('click', () => { layer = 0; applyOverlay(); refreshLayers(); renderHint(); });
  // thẻ thành phố: thanh tiến độ mở 🔬, ô ngày giờ mở 🎎 (cả bằng bàn phím)
  $('progBox').addEventListener('click', () => openSide('dev'));
  $('dateBox').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSide('fest'); } });
  $('iFocus').addEventListener('click', () => { const d = $('info').dataset; if (d.wx) flyTo(+d.wx, +d.wz); });
  // các thẻ trong bảng dài (ngân sách, dân cư): nhớ thẻ đang xem
  for (const bar of document.querySelectorAll('.ptabs')) {
    const panel = bar.closest('.side'), pick = (k) => {
      for (const b of bar.children) b.classList.toggle('on', b.dataset.pane === k);
      for (const p of panel.querySelectorAll('.pane')) p.classList.toggle('on', p.dataset.pane === k);
      try { localStorage.setItem(`${KEY}tab.${panel.id}`, k); } catch { /* bỏ qua */ }
    };
    for (const b of bar.children) b.addEventListener('click', () => pick(b.dataset.pane));
    let k0 = null; try { k0 = localStorage.getItem(`${KEY}tab.${panel.id}`); } catch { /* bỏ qua */ }
    pick(k0 && bar.querySelector(`[data-pane="${k0}"]`) ? k0 : bar.firstElementChild.dataset.pane);
  }
  { const ro = new ResizeObserver(() => layout()); for (const id of ['top', 'left', 'dockbar']) ro.observe($(id)); }
  buildLayers(); bindMinimap();
  $('bHelp').addEventListener('click', () => $('modal').classList.add('show'));
  $('mStart').addEventListener('click', () => { $('modal').classList.remove('show'); try { localStorage.setItem(KEY + 'seen', '1'); } catch { /* bỏ qua */ } });
  const seenModal = () => { $('modal').classList.remove('show'); try { localStorage.setItem(KEY + 'seen', '1'); } catch { /* bỏ qua */ } };
  $('bNew').addEventListener('click', () => openMaps('normal'));
  $('oNew').addEventListener('click', () => openMaps('normal'));
  $('mMaps').addEventListener('click', () => { seenModal(); openMaps('normal'); });
  $('mOpen').addEventListener('click', () => { seenModal(); openMaps('open'); });
  $('bNewOpen').addEventListener('click', () => openMaps('open'));
  bindMaps();
  $('bOpen').addEventListener('click', () => {
    if (city.sandbox) { toast('Thành phố này đã ở chế độ Open'); return; }
    if (!confirm('Bật chế độ Open cho thành phố này? Mọi thứ mở khoá, có cả bản đồ, tiền không giới hạn, không phá sản. Không tắt lại được.')) return;
    S.enableSandbox(city); Object.assign(city.dirty, { land: true, zones: true, services: true }); autosave(); updateHud(true); refreshToolbar(); toast('🎨 Đã bật chế độ Open');
  });
  $('roomFee').addEventListener('input', (e) => { city.tour.roomFee = +e.target.value; renderEcon(); });
  $('intlFee').addEventListener('input', (e) => { city.intl.fee = +e.target.value; renderEcon(); });
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
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => { const p = b.closest('.side'); p.classList.remove('show', 'peek'); if (p.id === 'dist') seatPick = null; });
  for (const [id, k] of [['taxR', 'r'], ['taxC', 'c'], ['taxI', 'i']]) $(id).addEventListener('input', (e) => { city.tax[k] = +e.target.value; S.recalc(city); updateHud(true); });
  $('cityname').addEventListener('change', (e) => { city.name = e.target.value.trim() || 'Phố Mới'; e.target.value = city.name; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });
  window.addEventListener('pagehide', () => autosave());
}

// ───────────────────────── hộp thư thị trưởng (Claude viết lời, game tính số) ─────────────────────────

/** Gửi các mục mới (tình huống, đánh giá) cho AI viết lại lời; không có AI thì giữ mẫu câu sẵn có. */
function aiPump() {
  const c = city, q = c.aiQueue;
  if (!q || !q.length || aiPump.busy) return;
  const ids = q.splice(0), items = ids.map((id) => c.council.inbox.find((i) => i.id === id) || c.council.reviews.find((r) => r.id === id)).filter(Boolean);
  const reviews = items.filter((i) => i.kind === 'review'), dilemmas = items.filter((i) => i.kind === 'dilemma');
  const sum = citySummary(c, S), jobs = [];
  if (reviews.length) jobs.push(aiCall('reviews', { city: sum, reviews }).then((d) => { for (const r of d?.reviews || []) { const it = reviews.find((x) => x.id === r.id); if (it && r.text) { it.text = r.text; it.ai = true; } } }));
  for (const it of dilemmas) jobs.push(aiCall('dilemma', { city: sum, topic: it.topic, title: it.title, story: it.story, options: it.options, actor: it.actor ? it.actor.name : '' }).then((d) => {
    if (!d || it.status !== 'pending') return;
    if (d.title) it.title = d.title; if (d.story) it.story = d.story;
    for (const o of d.options || []) { const t = it.options.find((x) => x.id === o.id); if (t) { t.label = o.label || t.label; t.note = o.note; } }
    it.ai = true;
  }));
  aiPump.busy = true;
  Promise.allSettled(jobs).then(() => { aiPump.busy = false; if (city === c) renderInbox(true); });
}

const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const starsOf = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

// ô đang gõ giữ nguyên chữ và con trỏ khi bảng dựng lại theo giờ game
const drafts = {};
function draft(inp, key) { inp.value = drafts[key] || ''; inp.dataset.draft = key; inp.addEventListener('input', () => { drafts[key] = inp.value; }); }
function keepFocus(fn) {
  const a = document.activeElement, k = a && a.dataset ? a.dataset.draft : null, pos = k ? a.selectionStart : 0;
  fn();
  if (!k || document.activeElement === a) return;
  const n = document.querySelector(`[data-draft="${k}"]`);
  if (n) { n.focus(); n.setSelectionRange(pos, pos); }
}

/** Bảng 🏢 Tập đoàn: đề xuất đang chờ thị trưởng, danh sách công ty, chi tiết + lịch sử của công ty đang chọn. */
let corpSel = 0;
/** Tô sáng các cơ sở của công ty đang chọn trong bảng 🏢 (lớp xem tập đoàn); đóng bảng thì bỏ. Chỉ để xem, không lưu. */
function corpFocus() {
  const c = city; if (!c || !c.corp) return;
  const q = $('corp').classList.contains('show') ? c.corp.list[corpSel] : null, id = q ? q.id : 0;
  if ((c.corpFocus || 0) !== id) { c.corpFocus = id; c.dirty.zones = c.dirty.buildings = true; if (q) corpLook(q); }
}
/** Đưa máy quay tới vùng của công ty: tâm các ô của nó, xa vừa đủ thấy cả vùng, lệch xuống dưới bảng 🏢 đang che phía trên. */
function corpLook(q) {
  const l = q.cells.map(([i]) => i); if (!l.length) return;
  const xs = l.map((i) => ((i % S.N) + 0.5) * S.T - S.HALF), zs = l.map((i) => (((i / S.N) | 0) + 0.5) * S.T - S.HALF);
  const cx = xs.reduce((a, b) => a + b, 0) / l.length, cz = zs.reduce((a, b) => a + b, 0) / l.length;
  const span = Math.max(...xs.map((x) => Math.abs(x - cx)), ...zs.map((z) => Math.abs(z - cz)));
  const cam = view.cam; cam.dist = Math.max(170, Math.min(520, span * 3.2 + 120)); cam.pitch = Math.max(cam.pitch, 1.2);
  const off = cam.dist * 0.22; cam.x = cx - Math.sin(cam.yaw) * off; cam.z = cz - Math.cos(cam.yaw) * off; view.panWorld(0, 0);
}
const CORP_LOG = {
  founded: (e) => `Thành lập, lấy ${e.n} nhà máy làm nền, vốn ${money(e.cash)}`, build: (e) => `Xây thêm ${e.n} nhà máy, chi ${money(e.cost)}`, release: () => 'Bán một cơ sở yếu (thành doanh nghiệp độc lập)',
  ask: (e) => `Xin dự án ${e.n} ô đất, cam kết ${e.jobs} việc làm`, approved: (e) => `Được duyệt dự án ${e.n} ô, cam kết ${e.jobs} việc làm${e.brk ? `, miễn ${e.brk}% thuế` : ''}`, rejected: () => 'Đề xuất bị từ chối', askExpired: () => 'Đề xuất quá hạn không ai trả lời',
  askFailed: (e) => `Dự án không thực hiện được: ${e.text}`, counterOk: (e) => `Nhượng bộ: nâng cam kết lên ${e.jobs} việc làm`, counterNo: () => 'Không nhượng bộ thêm việc làm',
  subsidiary: (e) => `Lập công ty con ${e.name} (${e.n} nhà máy, vốn ${money(e.cash)})`, exportOn: (e) => `Đẩy xuất khẩu: tồn kho thành phẩm ${e.stock}`, exportOff: (e) => `Dừng đẩy xuất khẩu (tồn kho ${e.stock})`,
  decision: (e) => `${e.ai ? '🤖 ' : ''}Quyết: ${S.OPTS[e.id] || e.id}${e.ok ? '' : ' (không thực hiện được)'}${e.text ? ` — “${e.text}”` : ''}`,
  acquire: (e) => (e.kind === 'rival' ? `Mua lại ${e.name} (${e.n} nhà máy) giá ${money(e.cost)}` : e.kind === 'shop' ? `Mua một cửa hàng cho chuỗi bán lẻ giá ${money(e.cost)}` : `Mua một xưởng độc lập giá ${money(e.cost)}`), acquired: (e) => `Bị ${e.by} mua lại giá ${money(e.cost)}`,
  jv: (e) => `Liên doanh ${e.name} với ${e.partner}, góp ${money(e.cash)}`, loan: (e) => `Vay ngân hàng ${money(e.amount)}`, loanPaid: () => 'Trả hết nợ vay', default: (e) => `Vỡ nợ ${money(e.debt)}, ngân hàng xoá nợ`,
  crisis: (e) => `Khủng hoảng: quỹ ${money(e.cash)}, nhà máy chạy ${e.eff}% công suất`, payUp: (e) => `Thiếu người (${e.fill}% chỗ làm có người): tăng lương 15% để giành lao động`, payDown: (e) => `Hạ lương về mức cũ (${e.fill}% chỗ có người)`,
  monopoly: (e) => `Nắm quá 60% ${S.PRODUCTS[e.product] ? S.PRODUCTS[e.product].name.toLowerCase() : ''} của thành phố: độc quyền`, monopolyEnd: () => 'Hết độc quyền', dependence: (e) => `Giữ ${e.share}% việc làm của thành phố`, shock: (e) => `Sụp đổ, thành phố mất ${e.share}% việc làm`,
  warehouse: (e) => `Xây kho bãi / logistics, chi ${money(e.cost)}`, rezoned: (e) => `Thành phố chuyển ${e.n} ô đất sang khu của công ty (đã duyệt)`,
  houseAsk: (e) => `Xin tài trợ ${money(e.cost)} xây nhà ở công nhân trên ${e.n} ô`, houseOk: (e) => `Được duyệt: tài trợ ${money(e.cost)} xây nhà ở công nhân trên ${e.n} ô`,
  downsize: (e) => `Thu hẹp sản xuất: ${e.cut} người nghỉ việc, cơ sở còn ${e.jobs} chỗ làm`, close: () => 'Đóng cửa một cơ sở lỗ kéo dài', relocate: (e) => `Dời một cơ sở sang tỉnh khác${e.moved ? `, mang theo ${money(e.moved)}` : ''}`,
  tech: (e) => `Đầu tư máy móc nấc ${e.lv}, chi ${money(e.cost)}`, taxReact: (e) => `Thuế đổi ${e.from}% → ${e.to}%: điều chỉnh kế hoạch`, walkaway: () => 'Rút đề xuất sau khi mặc cả không thành',
  nego: (e) => `Mặc cả: ${e.jobs} việc làm${e.brk ? `, xin miễn ${e.brk}% thuế` : ''}`, withdraw: () => 'Nhà đầu tư rút vốn vì không có đất', dump: (e) => `Được cho xả thải ra sông ${e.days} ngày`, fined: () => 'Bị phạt vì xả thải, phải xử lý nước thải',
  halted: (e) => `Bị đình chỉ ${e.days} ngày`, tetBonus: (e) => `Trả lương, thưởng Tết ${money(e.paid)}`,
  dealMet: (e) => `Đạt cam kết: thêm ${e.jobs}/${e.want} việc làm`, dealBreach: (e) => `Chưa đạt cam kết: ${e.jobs}/${e.want} việc làm`, stage: (e) => `Đổi bậc: ${S.STAGES[e.from]} → ${S.STAGES[e.to]}`, season: (e) => `Kỳ báo cáo: ${e.jobs} việc làm, ${e.cells} nhà máy${e.intern ? `, giao nội bộ ${e.intern}` : ''}${e.xunits ? `, xuất ${e.xunits}` : ''}`, goal: (e) => `Đạt mục tiêu ${e.jobs} việc làm`,
};
/** AI (Claude) đóng vai CEO: chọn một trong các hành động game đã kiểm tra; quá hạn game tự dùng lựa chọn của luật. */
function corpPump() {
  const c = city;
  if (!c.corp) return;
  c.corp.ai = aiOnline();
  const qu = c.corpQueue;
  if (!qu || !qu.length || corpPump.busy) return;
  const q = S.corpById(c, qu.shift());
  if (!q || !q.pend) return;
  corpPump.busy = true;
  const opts = q.pend.opts.map((id) => ({ id, label: S.OPTS[id] }));
  aiCall('corp', { city: citySummary(c, S), q: S.corpBrief(c, q), options: opts }).then((d) => {
    if (city === c && d && d.id && q.pend) S.corpResolve(c, q, d.id, d.why);
  }).finally(() => { corpPump.busy = false; if (city === c && $('corp').classList.contains('show')) renderCorp(true); });
}
function renderCorp(force) { keepFocus(() => renderCorp0(force)); }
function renderCorp0(force) {
  const c = city, C = c.corp;
  const key = `${c.day}|${(c.hour / 6) | 0}|${corpSel}|${C.list.map((q) => q.id + ':' + q.cells.length + ':' + q.log.length).join(',')}|${C.asks.map((a) => `${a.id}:${a.jobs}:${a.brk}:${a.chat ? a.chat.length : 0}:${a.wait ? 1 : 0}`).join(',')}`;
  if (!force && renderCorp.key === key) return;
  renderCorp.key = key;
  const root = $('corpBody'); root.textContent = '';
  root.append(el('small', null, 'Công ty hình thành từ nhà máy có sẵn. CEO tự quyết kinh doanh (mở rộng, thu hẹp, đầu tư máy móc, dời đi khi thuế cao) nhưng chỉ tự xây trên đất bạn đã quy hoạch đúng loại; đất chưa quy hoạch, dự án nhiều ô, ưu đãi thuế phải qua bạn duyệt. Lịch sử chỉ ghi việc thật.'));
  { // đất công nghiệp: tranh đất làm phí đất lên
    const free = S.freeIndustrial(c), want = C.list.filter((q) => !q.parent && q.kind !== 'trade' && c.day - (q.landWant ?? -99) <= 3), k = S.landK(c);
    root.append(el('br'), el('small', want.length >= 2 ? 'neg' : null, `🏭 Đất khu công nghiệp đã quy hoạch còn trống: ${free} ô${want.length ? ` · ${want.length} công ty đang chờ đất (${want.map(S.corpTitle).join(', ')})` : ''} · phí đất ${money(S.landFeeOf(c))}/ô${k > 1.01 ? ` (×${k.toFixed(2)} vì tranh đất)` : ''}`));
  }
  for (const a of C.asks) {
    const q = S.corpById(c, a.corp); if (!q) continue;
    const card = el('div', 'card'), opts = el('div', 'opts');
    if (a.kind === 'housing') {
      card.append(el('b', null, `🏘️ ${S.corpTitle(q)} xin tài trợ xây nhà ở công nhân`), el('p', null, `Công ty chi ${money(a.cost)} xây ${a.sites.length} ô nhà ở bạn đã quy hoạch gần cụm nhà máy (xây ngay khi đủ điện nước, không chờ nhu cầu). Còn ${Math.max(0, a.expires - c.day)} ngày để trả lời.`));
    } else {
      const rz = a.rezone ? ` ⚠️ ${a.rezone}/${a.sites.length} ô chưa quy hoạch: duyệt nghĩa là thành phố chuyển ${a.rezone} ô đó sang ${q.kind === 'trade' ? 'khu thương mại' : 'khu công nghiệp'}.` : ' Đất đã nằm trong quy hoạch của bạn.';
      card.append(el('b', null, `🏭 ${S.corpTitle(q)} xin ${a.sites.length} ô đất`), el('p', null, `Cam kết thêm ${a.jobs} việc làm${a.terms && a.terms.length ? `, ${a.terms.map(S.termLine).join(', ')}` : ''} trong ${a.days} ngày, nộp phí đất ${money(S.landFeeOf(c) * a.sites.length)}${a.brk ? `; đổi lại xin miễn ${a.brk}% thuế cho công ty trong ${a.brkDays} ngày` : ''}.${rz} Còn ${Math.max(0, a.expires - c.day)} ngày để trả lời.`));
      const chat = el('div', 'chat');
      for (const m of a.chat || []) chat.append(el('div', m.from === 'us' ? 'us' : 'them', m.text));
      if (a.wait) chat.append(el('div', 'them', '… CEO đang soạn trả lời'));
      if ((a.chat && a.chat.length) || a.wait) card.append(chat);
      const B = S.askBounds(a), row = el('div'), inp = el('input'), send = el('button', 'mini', 'Gửi');
      row.style.cssText = 'display:flex;gap:6px;margin-top:6px'; inp.style.flex = '1'; inp.maxLength = 300;
      inp.placeholder = a.final ? 'CEO đã đưa ra mức cuối' : `Mặc cả với CEO: việc làm ${B.jobs[0]}–${B.jobs[1]}${a.brk0 ? `, ưu đãi thuế 0–${a.brk0}%` : ''}…`;
      inp.disabled = !!a.final || !!a.wait; send.disabled = inp.disabled;
      draft(inp, `ask${a.id}`);
      const go = () => { const t = inp.value.trim(); if (t && !a.wait) { delete drafts[`ask${a.id}`]; corpNegotiate(a, t); } };
      send.onclick = go; inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
      row.append(inp, send); card.append(row);
      requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
    }
    const yes = el('button', 'mini acc', '✅ Chấp nhận'), more = el('button', 'mini', '🗣️ Đòi thêm việc làm'), no = el('button', 'mini', '❌ Từ chối'), look = el('button', 'mini', '📍 Xem chỗ');
    yes.onclick = () => { const r = S.approveAsk(c, a.id); toast(r.ok ? `🏭 Đã duyệt cho ${S.corpTitle(q)}` : r.reason); S.recalc(c); renderCorp(true); };
    more.disabled = !!a.countered || !!a.wait; more.onclick = () => { const r = S.counterAsk(c, a.id); toast(r.reply || r.reason); renderCorp(true); };
    no.onclick = () => { S.rejectAsk(c, a.id); renderCorp(true); };
    look.onclick = () => lookCell(a.sites[0]);
    opts.style.cssText = 'flex-direction:row;flex-wrap:wrap'; opts.append(yes, ...(a.kind === 'housing' ? [] : [more]), no, look); card.append(opts); root.append(card);
  }
  if (!C.list.length) { root.append(el('p', null, `Chưa có công ty nào: cần ${S.CORP.foundMin} dân và nhà máy đang chạy có lãi để hình thành công ty.`)); return; }
  if (corpSel >= C.list.length) corpSel = 0;
  corpFocus(); // công ty đang chọn có thể vừa giải thể
  { // công cụ của thị trưởng: chống độc quyền, hỗ trợ doanh nghiệp nhỏ
    const row = el('div', 'opts'), sme = el('button', 'mini', '🛡️ Bảo hộ DN nhỏ 30 ngày'), riv = el('button', 'mini', '🎯 Mời đối thủ mới');
    sme.title = 'Tốn 150 MK ngân sách, chia vốn cho các xưởng độc lập; 30 ngày không bị tập đoàn mua lại'; riv.title = 'Lập ngay một công ty mới từ xưởng độc lập, khác sản phẩm của bên đang áp đảo';
    sme.onclick = () => { const r = S.protectSme(c); toast(r.ok ? `🛡️ Đã bảo hộ ${r.n} doanh nghiệp nhỏ` : r.reason); renderCorp(true); };
    riv.onclick = () => { const r = S.inviteRival(c); toast(r.ok ? `🎯 ${S.corpTitle(r.corp)} thành lập` : r.reason); renderCorp(true); };
    sme.disabled = (C.sme ?? -1) >= c.day; row.append(sme, riv); root.append(row);
  }
  { // thị trường và cụm kinh tế: vốn đi theo giá thế giới
    const box = el('div', 'card'), sg = S.signals(c).filter((x) => x.plants > 0 || x.price >= 1.15), hubs = C.hubs || [];
    box.append(el('b', null, '🌐 Thị trường và cụm kinh tế'));
    const t = el('p'); t.style.cssText = 'margin:4px 0;font-size:12px';
    t.textContent = sg.length ? 'Giá thế giới (nhà máy trong thành phố): ' + sg.map((x) => `${S.PRODUCTS[x.p].icon} ${S.PRODUCTS[x.p].name} ${x.price.toFixed(2)}${x.price >= 1.2 ? '↑' : x.price <= 0.8 ? '↓' : ''} (${x.plants}) · nội địa ×${x.dp.toFixed(2)}`).join(' · ') : 'Chưa có số liệu.';
    box.append(t, el('small', null, `🏷️ Giá bán lẻ cho dân: ×${(c.retailIdx || 1).toFixed(2)} so với giá gốc (kệ cạn thì giá lên, hàng ứ thì hạ; trên ×${S.RETAIL.hi} dân thấy đắt đỏ, kém vui). `), el('small', null, hubs.length ? `Cụm kinh tế: ${hubs.map((h) => `${h.sector ? S.PRODUCTS[h.sector].name : 'hỗn hợp'} ${h.n} cơ sở, ${h.jobs} việc`).join('; ')} (chạy nhanh hơn 10%)` : 'Chưa có cụm kinh tế: cần từ 6 cơ sở của công ty nằm sát nhau.'));
    root.append(box);
  }
  const tb = el('table', 'dover');
  tb.innerHTML = '<tr><th>Công ty</th><th>Bậc</th><th>🏭</th><th>👷 Việc</th><th>🌐 Ảnh hưởng</th><th>💰 Quỹ</th></tr>';
  const order = [...C.list].sort((x, y) => S.rootOf(c, x.id) - S.rootOf(c, y.id) || (x.parent ? 1 : 0) - (y.parent ? 1 : 0) || x.id - y.id);
  order.forEach((q) => {
    const k = C.list.indexOf(q), st = S.corpStats(c, q), [r, g, b] = corpRGB(c, q.id), tr = el('tr', 'row1' + (k === corpSel ? ' on' : ''));
    [(q.parent ? '↳ ' : '') + S.corpTitle(q), S.STAGES[st.stage], st.cells + (st.pending ? `+${st.pending}` : ''), st.jobs, `${st.influence}%`, money(q.cash)].forEach((v, j) => { const td = el('td', null, String(v)); if (!j) td.style.borderLeft = `4px solid rgb(${r},${g},${b})`; tr.append(td); });
    tr.onclick = () => { corpSel = k; renderCorp(true); corpFocus(); };
    tb.append(tr);
  });
  root.append(tb);
  const q = C.list[corpSel], st = S.corpStats(c, q), ceo = S.CEOS[q.ceo], card = el('div', 'card'), pr = S.PRODUCTS[st.sector];
  card.append(el('b', null, `${S.corpTitle(q)}${pr ? ` · ${pr.icon} ${pr.name}` : ''}${q.kind === 'trade' ? ' · 🛒 Thương mại, bán lẻ' : ''}`));
  const p = el('p'); p.style.cssText = 'margin:4px 0;font-size:12px';
  p.textContent = `CEO ${ceo.name}: "${ceo.philosophy}". Đầu tư: ${ceo.invest}. Đàm phán: ${ceo.nego}. Mức liều ${Math.round(ceo.risk * 100)}%, chia cổ tức ${Math.round(ceo.payout * 100)}%. Hiệu suất nhà máy ${Math.round(st.eff * 100)}%. Mục tiêu: ${q.goal.jobs} việc làm. ${q.parent ? `Công ty con của ${S.corpTitle(S.corpById(c, q.parent))}.` : st.group.subs ? `Cả nhóm: ${st.group.n} nhà máy, ${st.group.jobs} việc làm, ${st.group.subs} công ty con.` : ''}`;
  card.append(p);
  const tr2 = el('small', null, `🔁 Hàng giao trong nhóm: ${st.intern} · 🌐 Xuất ra ngoài: ${st.xunits}${st.export ? ' (đang đẩy xuất khẩu)' : ''}${st.retail ? ` · 🏬 Chuỗi bán lẻ: ${st.retail} cửa hàng` : ''}${st.wares ? ` · 🏗️ ${st.wares} kho (chứa thêm ${st.store} mỗi nhà máy)` : ''} · 💱 Giá thế giới ${st.signal} · 🏷️ Hệ số bán ${st.markup}${q.pend ? ' · ⏳ CEO đang cân nhắc' : ''}`);
  card.append(tr2, el('br'));
  { const x = [], tax = S.taxOf(c, q), brk = S.brkOf(c, q); // phản ứng chính sách, công nghệ, nhà đầu tư nước ngoài
    x.push(`🧾 Thuế đang chịu ${tax}%${brk ? ` (được miễn ${Math.round(brk * 100)}% đến ngày ${q.brk.until + 1})` : ''}${tax * (1 - brk) >= S.CORP.taxHigh ? ' · thuế cao: CEO có thể dời cơ sở đi' : ''}`);
    if (q.tech) x.push(`⚙️ Máy móc nấc ${q.tech}/${S.CORP.techMax} (+${Math.round(q.tech * S.CORP.techK * 100)}% sản lượng, ít khói hơn)`);
    if (q.foreign) x.push(`🌏 Vốn của ${q.foreign}${q.inv ? ` · còn chờ đất cho ${q.inv.n} nhà máy (rút vốn sau ngày ${q.inv.until + 1})` : ''}`);
    if (q.low >= 3) x.push(`📉 Chạy ế ${q.low} ngày liền`);
    if (c.day - (q.house ?? -99) <= 20) x.push('🏚️ Thiếu nhà ở công nhân quanh cụm');
    if (c.day - (q.landWant ?? -99) <= 3) x.push('⏳ Đang chờ đất khu công nghiệp đã quy hoạch');
    card.append(el('small', null, x.join(' · ')), el('br')); }
  { const w = []; if (st.mono) w.push(`🧱 Độc quyền ${S.PRODUCTS[st.mono] ? S.PRODUCTS[st.mono].name.toLowerCase() : 'bán lẻ'}`); if (q.dep) w.push(`⚠️ Phụ thuộc: giữ ${st.share}% việc làm`); if (st.debt > 0) w.push(`🏦 Nợ ${money(st.debt)}`); if (q.pay > 1) w.push('💵 Đang trả lương cao hơn'); if (q.partners) w.push('🤝 Liên doanh'); if (w.length) card.append(el('small', 'neg', w.join(' · ')), el('br')); }
  for (const d of q.deals) card.append(el('small', null, `${{ open: '⏳', met: '✅', breach: '⚠️' }[d.status]} Cam kết +${d.jobs} việc làm (hạn ngày ${d.due + 1})${d.status === 'open' ? `, đã thêm ${Math.max(0, S.jobsOf(c, q) - d.base)}` : ''}${d.terms && d.terms.length ? ` · đã nộp: ${d.terms.map((k) => S.TERMS[k]).join(', ')}` : ''}`), el('br'));
  card.append(el('h4', null, 'Lịch sử'));
  const ul = el('div'); ul.style.cssText = 'max-height:220px;overflow:auto;font-size:12px';
  for (const e of q.log.slice(-40).reverse()) ul.append(el('div', null, `Ngày ${e.day + 1}: ${CORP_LOG[e.type] ? CORP_LOG[e.type](e) : e.type}`));
  card.append(ul); root.append(card);
}

/** Bảng 📜 Biên niên: bản sắc kinh tế (việc làm theo ngành), lịch sử đổi bản sắc, các sự kiện có nguyên nhân (lần ngược "vì sao"). */
let chronKind = 'all';
const CHRON_KINDS = { all: ['Tất cả', null], econ: ['Kinh tế', ['corp', 'close', 'supply', 'land', 'identity', 'policy', 'deal', 'housing']], life: ['Đời sống', ['jobless', 'demand', 'rent', 'rebound', 'housing', 'pollution', 'bonus']], gov: ['Chính quyền', ['policy', 'decision', 'dilemma', 'deal', 'halt']] };
function renderChron(force) {
  const c = city, C = c.chain;
  if (!C) return;
  const key = `${c.day}|${C.next}|${chronKind}`;
  if (!force && renderChron.key === key) return;
  renderChron.key = key;
  const root = $('chronBody'); root.textContent = '';
  { // bản sắc kinh tế
    const m = c.econMix || S.economyMix(c), box = el('div', 'card');
    box.append(el('b', null, `🧭 Bản sắc kinh tế: ${C.id ? C.id.name : m.name}`), el('br'), el('small', null, `Việc làm theo ngành: ${S.mixLine(m) || 'chưa có'} · ${fmt(m.jobs)} chỗ làm${C.id ? ` · giữ từ ngày ${C.id.since + 1}` : ''}${C.id && C.id.cand !== C.id.key ? ' · đang chuyển dịch' : ''}`));
    if (C.idHist.length > 1) box.append(el('br'), el('small', null, 'Đã qua: ' + C.idHist.slice(-6).map((h) => `ngày ${h.day + 1} ${h.name}`).join(' → ')));
    root.append(box);
  }
  { const row = el('div', 'opts'); for (const [k, [name]] of Object.entries(CHRON_KINDS)) { const b = el('button', 'mini' + (k === chronKind ? ' acc' : ''), name); b.onclick = () => { chronKind = k; renderChron(true); }; row.append(b); } root.append(row); }
  root.append(el('small', null, 'Mỗi dòng là việc thật trong thành phố; "↳ vì" là sự kiện gây ra nó (game tự lần theo số liệu: mất việc → thất nghiệp quanh đó → hàng quán vắng → nhà trống, giá thuê hạ → doanh nghiệp mới mở; nhà cung cấp đóng cửa → nơi mua hàng phải nhập ngoài…).'));
  const want = CHRON_KINDS[chronKind][1], list = C.log.filter((e) => !want || want.includes(e.kind)).slice(-80).reverse();
  if (!list.length) root.append(el('p', null, 'Chưa có sự kiện nào.'));
  for (const e of list) {
    const d = el('div', 'chronEv');
    d.append(el('span', null, `Ngày ${e.day + 1}: ${e.text}`));
    if (e.cell >= 0) { const b = el('button', 'mini', '📍'); b.title = 'Xem chỗ trên bản đồ'; b.onclick = () => lookCell(e.cell); d.append(b); }
    for (const w of S.causeChain(c, e.id, 3)) d.append(el('span', 'why', `↳ vì (ngày ${w.day + 1}): ${w.text}`));
    const fx = S.effectsOf(c, e.id).length;
    if (fx) d.append(el('span', 'why', `→ kéo theo ${fx} sự kiện sau`));
    root.append(d);
  }
}

function renderInbox(force) { keepFocus(() => renderInbox0(force)); }
function renderInbox0(force) {
  const c = city, K = c.council, key = `${c.day}|${c.hour}|${K.nextId}|${K.inbox.map((i) => i.status + (i.chat ? i.chat.length : '') + (i.ai ? 1 : 0) + (i.wait ? 1 : 0)).join('')}|${K.reviews.length}`;
  if (!force && renderInbox.key === key) return;
  renderInbox.key = key;
  { // bật / tắt AI
    const box = $('inboxAi'), lab = el('label', 'row'), cb = el('input'), on = aiEnabled();
    cb.type = 'checkbox'; cb.checked = on;
    cb.onchange = () => { setAiEnabled(cb.checked); toast(cb.checked ? '✍️ Đã bật AI viết lời cho hộp thư' : '✍️ Đã tắt AI: dùng lời soạn sẵn, không gọi server'); renderInbox(true); };
    const t = el('span'); t.innerHTML = `<b>✍️ AI viết lời (Claude)</b><br><small>${!on ? 'Đang tắt: dùng lời soạn sẵn, không gọi server, không tốn lượt.' : aiOnline() ? 'Lời văn do AI viết từ số liệu thật; mọi con số và hậu quả do game tính.' : 'AI chưa sẵn sàng (server chưa có khoá API hoặc mất mạng): tạm dùng lời soạn sẵn.'}</small>`;
    lab.style.alignItems = 'flex-start'; lab.append(t, cb); box.textContent = ''; box.append(lab);
  }
  // tình huống
  const box = $('inboxDecide'); box.textContent = '';
  const pend = K.inbox.filter((i) => i.kind === 'dilemma' && i.status === 'pending');
  if (!pend.length) box.append(el('small', null, 'Chưa có việc gì cần quyết.'));
  for (const it of pend) {
    const card = el('div', 'card'), opts = el('div', 'opts');
    card.append(el('b', null, `⚖️ ${it.title}`), el('p', null, it.story), el('small', null, `Còn ${Math.max(0, it.expires - c.day)} ngày; quá hạn thì thành phố tự chọn phương án cuối.`));
    if (it.actor) { const lk = el('button', 'mini', '📍'); lk.title = 'Xem doanh nghiệp này trên bản đồ'; lk.onclick = () => lookCell(it.actor.cell); card.append(el('br'), el('small', null, `🏭 Doanh nghiệp liên quan: ${it.actor.name} `), lk); }
    const dq = it.chairAt != null && c.dist.on ? c.dist.list[it.district] : null;
    if (dq) card.append(el('small', 'pos', ` 🏙️ Việc của ${dq.name}: chủ tịch ${dq.chair} sẽ tự quyết sau ~${Math.max(0, it.chairAt - c.hour)} giờ${it.pick ? ' (đã chọn hướng)' : ''}; bạn vẫn quyết thay được.`));
    for (const o of it.options) {
      const b = el('button', 'mini'), D = S.DILEMMAS[it.type].options.find((x) => x.id === o.id);
      b.append(el('b', null, o.label)); if (o.note) b.append(el('small', null, o.note));
      b.title = effectText(D);
      b.onclick = () => { const r = S.decide(c, it.id, o.id); if (!r.ok) toast(r.reason); S.recalc(c); updateHud(true); renderInbox(true); };
      opts.append(b);
    }
    card.append(opts); box.append(card);
  }
  // đàm phán
  const dbox = $('inboxDeals'); dbox.textContent = '';
  const deals = K.inbox.filter((i) => i.kind === 'deal' && i.status === 'pending');
  if (!deals.length) dbox.append(el('small', null, 'Chưa có đối tác nào gửi đề nghị.'));
  for (const it of deals) {
    const D = S.DEALS[it.type], card = el('div', 'card'), chat = el('div', 'chat'), offer = el('div', 'offer'), o = S.clampOffer(it.type, it.offer);
    card.append(el('b', null, `🤝 ${it.who}`), el('small', null, ` · còn ${Math.max(0, it.expires - c.day)} ngày`));
    for (const m of it.chat) chat.append(el('div', m.from === 'us' ? 'us' : 'them', m.text));
    if (it.wait) chat.append(el('div', 'them', '… đang soạn trả lời'));
    for (const [k, [lo, hi, unit]] of Object.entries(D.params)) { const v = el('b', null, fmt(o[k])); v.title = `khung ${fmt(lo)}–${fmt(hi)}`; offer.append(el('span', null, unit), v); }
    const w = D.worth(o), row = el('div'), inp = el('input'), send = el('button', 'mini', 'Gửi'), sign = el('button', 'mini acc', '✍️ Ký theo đề nghị này'), no = el('button', 'mini', 'Từ chối');
    row.style.cssText = 'display:flex;gap:6px;margin-top:6px'; inp.style.flex = '1'; inp.placeholder = 'Mặc cả: đưa lý lẽ, đề nghị con số…'; inp.maxLength = 400;
    draft(inp, `deal${it.id}`);
    const go = () => { const t = inp.value.trim(); if (t && !it.wait) { delete drafts[`deal${it.id}`]; negotiate(it, t); } };
    send.onclick = go; inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    sign.onclick = () => { const r = S.signDeal(c, it.id); toast(r.ok ? '🤝 Đã ký hợp đồng' : r.reason); S.recalc(c); updateHud(true); renderInbox(true); };
    no.onclick = () => { S.rejectDeal(c, it.id); renderInbox(true); };
    row.append(inp, send);
    const btns = el('div'); btns.style.cssText = 'display:flex;gap:6px;margin-top:6px'; btns.append(sign, no);
    card.append(chat, offer, el('small', w >= 0 ? 'pos' : 'neg', `${D.summary(o)} · ước tính ${w >= 0 ? 'có lợi' : 'thiệt'} ~${fmt(Math.abs(w))} ₫ cho thành phố`), row, btns);
    dbox.append(card);
    chat.scrollTop = chat.scrollHeight; // tin mới nhất
  }
  const act = K.deals.filter((d) => d.until >= c.day);
  if (act.length) dbox.append(el('small', null, 'Hợp đồng đang chạy: ' + act.map((d) => { const q = d.corp ? S.corpById(c, d.corp) : null; return `${d.who} (tới ngày ${d.until + 1}${d.type === 'grant' ? `, cam kết ${d.target} công trình chống ngập` : ''}${q ? `, công ty ${S.corpTitle(q)}: ${S.cellsBuilt(c, q).length} nhà máy${q.inv ? `, chờ đất cho ${q.inv.n}` : ''}` : ''})`; }).join(' · ')));
  // đánh giá
  const rbox = $('inboxReviews'), avg = S.ratingAvg(c); rbox.textContent = '';
  rbox.append(el('div', 'row', null));
  rbox.lastChild.innerHTML = `<span>Điểm trung bình (30 bài gần nhất)</span><span>${avg == null ? 'chưa có' : `<span class="stars">${starsOf(avg)}</span> ${avg.toFixed(1)} · du khách, khách quốc tế ×${S.ratingK(c).toFixed(2)}`}</span>`;
  for (const r of K.reviews.slice(-8).reverse()) {
    const card = el('div', 'card');
    card.innerHTML = `<span class="stars">${starsOf(r.stars)}</span> <b>${esc(r.name)}</b> <small>(${esc(r.country)}) · ngày ${r.day + 1}</small><p></p>`;
    card.querySelector('p').textContent = r.text;
    rbox.append(card);
  }
  if (!K.reviews.length) rbox.append(el('small', null, 'Chưa có du khách nào viết đánh giá: xây điểm tham quan, khách sạn, đón khách qua cửa ngõ.'));
  // đã xử lý
  const done = K.inbox.filter((i) => i.status !== 'pending').slice(-6).reverse();
  $('inboxDone').innerHTML = done.length ? done.map((i) => `<div class="row"><span>${esc(i.kind === 'deal' ? '🤝 ' + i.who : '⚖️ ' + i.title)}</span><span>${i.kind === 'deal' ? { signed: 'đã ký', rejected: i.walked ? 'đối tác rút lui' : 'từ chối', expired: 'hết hạn' }[i.status] : (i.auto ? '⌛ ' : i.by ? '🏙️ ' : '') + esc((i.options.find((o) => o.id === i.chose) || {}).label || '')}</span></div>${i.by && i.why ? `<small>${esc(i.by)}: ${esc(i.why)}</small>` : ''}`).join('') : '<small>Chưa có</small>';
}

function effectText(o) {
  if (!o) return '';
  const N = { happy: 'dân vui', pull: 'sức hút dân', comm: 'thuế thương mại', tour: 'du khách', intl: 'khách quốc tế' };
  const p = [];
  if (o.money) p.push(`${o.money > 0 ? '+' : ''}${fmt(o.money)} ₫`);
  for (const [k, v, d] of o.mods) p.push(`${N[k]} ${k === 'tour' || k === 'intl' ? '×' + v : (v > 0 ? '+' : '') + (k === 'happy' ? v : Math.round(v * 100) + '%')} trong ${d} ngày`);
  if (o.rating) p.push(`đánh giá du khách ${o.rating > 0 ? 'tốt lên' : 'xấu đi'}`);
  if (o.fire) p.push('⚠️ có thể cháy nhà');
  return p.join(' · ');
}

/** Mặc cả đề xuất của công ty: AI đóng vai CEO (không có AI thì luật), game ép số vào khung và giới hạn nhượng bộ mỗi lượt. */
async function corpNegotiate(a, text) {
  const c = city;
  a.chat.push({ from: 'us', text: text.replace(/[<>]/g, '').slice(0, 300) }); a.wait = true; renderCorp(true);
  let d = await aiCall('corpNego', { city: citySummary(c, S), q: S.askBrief(c, a), chat: a.chat });
  if (!d) d = S.corpCounterFallback(c, a);
  a.wait = false;
  if (city !== c || !c.corp.asks.includes(a)) return;
  S.corpCounter(c, a.id, d.reply, d.offer, d.status);
  renderCorp(true);
}
/** Đưa máy quay tới một ô (xem chỗ của đề xuất, sự kiện trong biên niên). */
function lookCell(i) {
  if (!(i >= 0)) return;
  const cam = view.cam, x = ((i % S.N) + 0.5) * S.T - S.HALF, z = (((i / S.N) | 0) + 0.5) * S.T - S.HALF;
  cam.dist = Math.max(140, Math.min(cam.dist, 280)); cam.pitch = Math.max(cam.pitch, 1.1);
  const off = cam.dist * 0.22; cam.x = x - Math.sin(cam.yaw) * off; cam.z = z - Math.cos(cam.yaw) * off; view.panWorld(0, 0);
}

async function negotiate(it, text) {
  const c = city;
  it.chat.push({ from: 'us', text }); it.wait = true; renderInbox(true);
  let d = await aiCall('negotiate', { type: it.type, who: it.who, offer: it.offer, chat: it.chat, city: citySummary(c, S) });
  if (!d) d = S.counterFallback(it);
  it.wait = false;
  if (city !== c) return;
  S.applyCounter(c, it.id, d.reply, d.offer, d.status);
  if (d.status === 'walkaway') toast(`🚪 ${it.who} rút khỏi đàm phán`);
  renderInbox(true);
}

// ───────────────────────── quận và chủ tịch quận (Claude đóng vai chủ tịch, game tính số) ─────────────────────────

/** Gửi các việc của chủ tịch quận cho AI: lập kế hoạch tự chủ, viết báo cáo, chọn phương án tình huống. */
function distPump() {
  const c = city, q = c.distQueue;
  if (!q || !q.length || distPump.busy || !c.dist.on) return;
  const jobs = q.splice(0, 3), sum = citySummary(c, S);
  distPump.busy = true;
  Promise.allSettled(jobs.map((j) => distJob(c, j, sum))).then(() => { distPump.busy = false; if (city === c) renderDist(true); });
}
async function distJob(c, j, sum) {
  const q = c.dist.list[j.d];
  if (!q) return;
  const base = { city: sum, q: S.distSummary(c, j.d) };
  if (j.task === 'plan') {
    const d = await aiCall('district', { ...base, task: 'plan' });
    if (d && city === c && q.mode === 'auto') S.applyPlan(c, j.d, { ...d, ai: true });
  } else if (j.task === 'report') {
    const r = q.reports.find((x) => x.id === j.id);
    if (!r) return;
    const d = await aiCall('district', { ...base, task: 'report', delta: r.delta, result: r.result && { ...r.result, order: q.order ? q.order.text : '' } });
    if (d && d.text) { r.text = d.text; r.ai = true; }
  } else if (j.task === 'pick') {
    const it = c.council.inbox.find((i) => i.id === j.id);
    if (!it || it.status !== 'pending') return;
    const effects = Object.fromEntries(S.DILEMMAS[it.type].options.map((o) => [o.id, effectText(o)]));
    const d = await aiCall('district', { ...base, task: 'pick', type: it.type, title: it.title, story: it.story, effects });
    if (d && d.id && it.status === 'pending') it.pick = { id: d.id, why: d.why };
  } else if (j.task === 'build') {
    const p = q.prop;
    if (!p || p.status !== 'think') return;
    const d = await aiCall('district', { ...base, task: 'build', cands: p.cands });
    if (d && d.type && q.prop === p) p.ai = { type: d.type, why: d.why };
  }
}

/** Thị trưởng giao việc: AI biến lệnh thành kế hoạch; không có AI thì tìm từ khoá. */
async function sendOrder(d, text) {
  const c = city, q = c.dist.list[d];
  if (!q || q.wait) return;
  q.wait = text; renderDist(true);
  let p = await aiCall('district', { city: citySummary(c, S), q: S.distSummary(c, d), task: 'order', text });
  if (p) p.ai = true; else p = S.orderFallback(q, text);
  q.wait = null;
  if (city !== c) return;
  const r = S.applyOrder(c, d, text, p);
  if (r.ok) { const b = r.order.build; toast(`📋 ${q.name} nhận việc: ${S.KPIS[r.order.goal].name} được chấm sau ${r.order.until - c.day} ngày${b ? (b.ok ? ` · 🏗️ đã xây ${S.SERVICES[b.type].name}` : ` · ⚠️ chưa xây được ${S.SERVICES[b.type].name}: ${b.reason}`) : ''}`); }
  S.recalc(c); updateHud(true); renderDist(true);
}

const ASK_CHIPS = [['👥 Dân cư', 'Dân cư trong quận thế nào: bao nhiêu người, già trẻ, nhà còn trống không?'], ['💼 Việc làm', 'Việc làm và doanh nghiệp trong quận ra sao, có ai thất nghiệp, ai làm ăn lỗ không?'], ['📦 Tồn hàng', 'Hàng tồn, sản xuất trong quận thế nào, nhà máy có thiếu nguyên liệu không?'], ['🚢 Xuất khẩu', 'Tuần qua quận xuất khẩu được những gì, bao nhiêu tiền?'], ['🎭 Văn hoá', 'Đời sống văn hoá, vui chơi, du lịch của quận thế nào?'], ['🏫 Trường, y tế', 'Trường học, y tế, công an trong quận phủ tới dân được bao nhiêu?']];

/** Thị trưởng hỏi chủ tịch quận: AI trả lời từ hồ sơ quận (số do game tính); không có AI thì trả lời theo chủ đề. */
async function sendAsk(d, text) {
  const c = city, q = c.dist.list[d];
  if (!q || q.askWait) return;
  q.askWait = text; renderDist(true);
  const B = S.districtBrief(c, d), r = await aiCall('district', { city: citySummary(c, S), q: S.distSummary(c, d), task: 'ask', text, brief: B });
  q.askWait = null;
  if (city !== c) return;
  S.noteAsk(c, d, text, r && r.text ? r.text : S.askFallback(c, d, text, B), !!(r && r.text));
  renderDist(true);
}

/** Hồ sơ quận gọn: các con số chủ tịch dùng để trả lời. */
function distBriefCard(c, d) {
  const B = S.districtBrief(c, d), p = B.people, j = B.jobs, x = B.exports, cu = B.culture, sv = B.services, s = B.stock;
  const kinds = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${(S.RAW[k] || S.PRODUCTS[k] || { icon: k }).icon} ${fmt(v)}`).join(' ') || '—';
  const box = el('details', 'card'), sum = el('summary', null, '📊 Hồ sơ quận');
  box.append(sum);
  for (const [ic, t] of [
    ['👥', `${fmt(p.pop)} dân · ${fmt(p.kids)} trẻ, ${fmt(p.adults)} lao động tuổi, ${fmt(p.seniors)} già · nhà trống ${fmt(B.housing.vacant)}/${fmt(B.housing.homes)}`],
    ['💼', `${fmt(p.employed)}/${fmt(p.workers)} có việc (thất nghiệp ${p.joblessPct}%) · ${fmt(j.vacant)} chỗ trống · ${j.losing} doanh nghiệp lỗ`],
    ['📦', `chờ chở: ${kinds(s.waiting)} · kệ hàng ${fmt(s.shopShelf)}${s.emptyShops ? ` · ${s.emptyShops} cửa hàng hết hàng` : ''}${s.factoriesNoInput ? ` · ${s.factoriesNoInput} nhà máy thiếu nguyên liệu` : ''}`],
    ['🚢', x.days ? `xuất ${x.days} ngày: ${kinds(x.k)} · ${money(x.value)} (hôm qua ${money(x.yesterday)})` : 'chưa có sổ xuất khẩu (ghi từ hôm nay)'],
    ['🎭', `văn hoá mức ${cu.program} · ${cu.parks} công viên (${cu.parkCoverPct}% dân gần) · ${cu.attractions} điểm tham quan · ${cu.hotels} khách sạn · ${cu.leisure} quán xá`],
    ['🏫', `${sv.schools} trường (${sv.eduCoverPct}% dân) · ${sv.clinics} y tế (${sv.healthCoverPct}%) · công an ${sv.policeCoverPct}%`],
  ]) { const r = el('div', 'row'); r.append(el('span', null, ic), el('span', null, t)); r.style.justifyContent = 'flex-start'; r.style.gap = '6px'; box.append(r); }
  box.open = !!distBriefCard.open; box.addEventListener('toggle', () => { distBriefCard.open = box.open; });
  return box;
}

function renderDist(force) { keepFocus(() => renderDist0(force)); }
function renderDist0(force) {
  const c = city, D = c.dist;
  const key = `${c.day}|${(c.hour / 6) | 0}|${D.on}|${distSel}|${seatPick}|${D.list.map((q) => q.mode + q.cap + JSON.stringify(q.prog) + (q.order ? q.order.status + q.order.until : '') + q.reports.length + (q.reports.at(-1)?.ai ? 1 : 0) + (q.wait ? 1 : 0) + (q.askWait ? 1 : 0) + (q.asks || []).length + q.chair + (q.note || '').length + q.build + q.bcap + (q.prop ? q.prop.status + q.prop.type : '') + (q.builds || []).length).join('|')}|${Math.round(c.money / 5000)}`;
  if (!force && renderDist.key === key) return;
  renderDist.key = key;
  $('distAi').textContent = aiOnline() ? '🤖 Chủ tịch quận do AI (Claude) đóng vai: nhận lệnh, lập kế hoạch, chọn công trình để xây, báo cáo, tự quyết tình huống. Mọi con số và hậu quả do game tính.' : `🤖 ${aiEnabled() ? 'AI chưa sẵn sàng' : 'AI đang tắt (bật lại trong 📨 Hộp thư)'}: chủ tịch quận làm theo kế hoạch soạn sẵn, lệnh được hiểu theo từ khoá.`;
  const setup = $('distSetup'), tabs = $('distTabs'), root = $('distBody');
  let body = root;
  setup.textContent = ''; tabs.textContent = ''; root.textContent = '';
  const can = S.canSplit(c), maxK = S.maxDistricts(c);
  const sel = el('select'); for (let k = 2; k <= maxK; k++) { const o = el('option', null, `${k} quận`); o.value = k; if (k === (D.on ? D.list.length : Math.min(4, maxK))) o.selected = true; sel.append(o); }
  const split = el('button', 'mini acc', D.on ? 'Chia lại' : '🏙️ Chia quận');
  split.disabled = !can.ok; split.title = can.ok ? 'Game tự chia theo nơi dân ở, việc làm; sau đó dời trụ sở để chỉnh ranh giới' : can.reason;
  split.onclick = () => { const r = S.splitDistricts(c, +sel.value); if (!r.ok) { toast(r.reason); return; } distSel = 0; c.dirty.zones = true; layer = LAYERS.findIndex((l) => l[0] === 'district'); applyOverlay(); refreshLayers(); S.recalc(c); updateHud(true); renderDist(true); };
  const row = el('div'); row.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
  row.append(sel, split);
  if (D.on) {
    const off = el('button', 'mini', 'Giải thể');
    off.onclick = () => { if (!confirm('Giải thể các quận? Mọi chương trình quận dừng, chủ tịch quận nghỉ việc.')) return; S.dissolve(c); c.dirty.zones = true; S.recalc(c); updateHud(true); renderDist(true); };
    row.append(off);
  } else {
    setup.append(el('p', null, 'Chia thành phố thành nhiều quận, mỗi quận có một chủ tịch với tính cách, năng lực riêng. Với từng quận bạn chọn: 🖐️ tự làm (tự chỉnh chương trình quận), 📋 giao việc (gõ lệnh, chủ tịch lập kế hoạch và bị chấm đạt / chưa đạt), hoặc 🤖 để chủ tịch tự chủ trong ngân sách bạn cấp (tự lập kế hoạch, tự quyết tình huống khó xử của quận).'));
    if (!can.ok) setup.append(el('small', 'neg', can.reason));
  }
  setup.append(row);
  if (!D.on) return;
  if (distSel >= D.list.length) distSel = 0;
  // bảng tổng quan: so sánh các quận, bấm một dòng để xem chi tiết
  const tb = el('table', 'dover');
  tb.innerHTML = '<tr><th>Quận</th><th>Chủ tịch</th><th>Điều hành</th><th>👥 Dân</th><th>🙂 Vui</th><th class="wide">🚨 Tội phạm</th><th class="wide">🌫️ Ô nhiễm</th><th class="wide">🌊 Ngập</th><th>Chi/ngày</th><th class="wide">🏗️ Xây</th><th class="wide">Việc giao</th></tr>';
  D.list.forEach((q, d) => {
    const [r, g, bb] = DCOL[d % DCOL.length], s0 = q.stat || {}, tr = el('tr', 'row1' + (d === distSel ? ' on' : ''));
    const cells = [q.name, q.chair, S.MODES[q.mode], fmt(s0.pop || 0), s0.happy || 0, s0.crime || 0, s0.pollution || 0, s0.flood || 0, money(S.planCost(q, q.prog)),
      q.prop && q.prop.status === 'ask' ? `✋ ${S.SERVICES[q.prop.type].icon}` : `${S.BUILD_MODES[q.build].split(' ')[0]} ${(q.builds || []).length || ''}`,
      q.order ? { active: '⏳', done: '✅', failed: '❌', cancelled: '—' }[q.order.status] + ` ${q.done}/${q.done + q.failed}` : `${q.done}/${q.done + q.failed}`];
    cells.forEach((v, k) => { const td = el('td', [5, 6, 7, 9, 10].includes(k) ? 'wide' : null, String(v)); if (!k) td.style.borderLeft = `4px solid rgb(${r},${g},${bb})`; tr.append(td); });
    tr.onclick = () => { distSel = d; renderDist(true); };
    tb.append(tr);
  });
  tabs.append(tb);
  const cols = el('div', 'dcols'), col1 = el('div'), col2 = el('div'), col3 = el('div');
  cols.append(col1, col2, col3); root.append(cols); body = col1;
  const d = distSel, q = D.list[d], P = S.PERSONAS[q.persona], st = q.stat || {};
  const head = el('div', 'card');
  head.innerHTML = `<b>${q.name}</b> · chủ tịch <b></b><br><small></small>`;
  head.querySelectorAll('b')[1].textContent = q.chair;
  head.querySelector('small').textContent = `${P.name}: ${P.desc} · năng lực ${starsOf(1 + q.skill * 4)} · việc giao: ${q.done} đạt, ${q.failed} chưa đạt`;
  const kp = el('div', 'kpis');
  for (const [ic, v, nm] of [['👥', fmt(st.pop || 0), 'dân'], ['💼', fmt(st.jobs || 0), 'việc làm'], ['🙂', st.happy || 0, 'mức vui'], ['💰', st.value || 0, 'giá đất'], ['🚨', st.crime || 0, 'tội phạm'], ['🌫️', st.pollution || 0, 'ô nhiễm'], ['🌊', st.flood || 0, 'nhà ngập'], ['🏠', st.built || 0, 'công trình']]) { const s = el('span', null, `${ic} ${v}`); s.append(el('small', null, nm)); kp.append(s); }
  head.append(kp);
  const nav = el('div'); nav.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
  const look = el('button', 'mini', '👁️ Tới trụ sở'); look.onclick = () => peekDist() || flyTo((q.x + 0.5) * S.T - S.HALF, (q.y + 0.5) * S.T - S.HALF);
  const mv = el('button', 'mini' + (seatPick === d ? ' acc' : ''), seatPick === d ? '📍 Bấm lên bản đồ…' : '📍 Dời trụ sở');
  mv.title = 'Bấm rồi chọn ô trên bản đồ: ranh giới các quận vẽ lại theo trụ sở gần nhất';
  mv.onclick = () => { seatPick = seatPick === d ? null : d; if (seatPick != null) { setTool('info'); peekDist(); toast(`Bấm lên bản đồ để đặt trụ sở mới cho ${q.name}`); } renderDist(true); };
  const swap = el('button', 'mini', '🔄 Thay chủ tịch'); swap.onclick = () => { const r = S.replaceChair(c, d); if (!r.ok) toast(r.reason); renderDist(true); };
  nav.append(look, mv, swap); head.append(nav);
  body.append(head);
  body.append(distBriefCard(c, d));
  // chế độ
  body.append(el('h4', null, 'Cách điều hành'));
  const seg = el('div', 'seg');
  for (const [m, label] of Object.entries(S.MODES)) { const b = el('button', 'mini' + (q.mode === m ? ' on' : ''), label); b.onclick = () => { S.setMode(c, d, m); S.recalc(c); updateHud(true); renderDist(true); }; seg.append(b); }
  body.append(seg, el('small', null, { self: 'Bạn tự chỉnh từng chương trình, hiệu quả đủ 100%.', order: 'Chủ tịch làm theo lệnh gần nhất của bạn; tới hạn thì chấm theo số liệu thật.', auto: 'Chủ tịch tự lập kế hoạch 4 ngày một lần trong trần ngân sách, và tự quyết tình huống khó xử của quận.' }[q.mode]));
  const cost = S.planCost(q, q.prog);
  if (q.mode !== 'self') {
    const cap = el('input'); cap.type = 'range'; cap.min = 0; cap.max = 8000; cap.step = 100; cap.value = q.cap; cap.style.width = '100%';
    const lab = el('div', 'row'); lab.innerHTML = `<span>Trần ngân sách</span><span><b>${money(q.cap)}</b>/ngày · đang chi ${money(cost)}</span>`;
    cap.addEventListener('input', () => { lab.lastChild.innerHTML = `<b>${money(+cap.value)}</b>/ngày`; });
    cap.addEventListener('change', () => { S.setCap(c, d, +cap.value); S.recalc(c); updateHud(true); renderDist(true); });
    body.append(lab, cap);
  } else { const lab = el('div', 'row'); lab.innerHTML = `<span>Đang chi</span><span><b>${money(cost)}</b>/ngày</span>`; body.append(lab); }
  // chính sách giao thông của quận
  const tbBtn = el('button', 'mini' + (q.truckBan ? ' on' : ''), q.truckBan ? '🚚 Đang cấm xe tải nặng · bấm để bỏ' : '🚚 Cấm xe tải nặng');
  tbBtn.onclick = () => { S.setTruckBan(c, d, !q.truckBan); renderDist(true); renderCity(true); };
  body.append(tbBtn, el('small', null, 'Xe tải không được đi xuyên quận; xe chở hàng tới hoặc từ chính quận này vẫn vào được, cao tốc không bị cấm. Bớt xe tải trong phố nhưng đường vành đai sẽ đông hơn.'));
  // chương trình
  body.append(el('h4', null, `Chương trình quận · hiệu quả ${Math.round(S.efficiency(q) * 100)}%`));
  for (const k of S.PKEYS) {
    const D0 = S.PROGRAMS[k], lv = q.prog[k] | 0, r = el('div', 'prog');
    r.title = `${D0.desc} · ${money(S.progCost(q, k, 1))}/ngày mỗi mức`;
    r.append(el('span', null, D0.icon), el('span', 'nm', D0.name), el('span', 'lv', '●'.repeat(lv) + '○'.repeat(S.MAX_LV - lv)));
    if (q.mode === 'self') for (const dv of [-1, 1]) { const b = el('button', 'mini', dv < 0 ? '−' : '+'); b.disabled = lv + dv < 0 || lv + dv > S.MAX_LV; b.onclick = () => { S.setProgram(c, d, k, lv + dv); S.recalc(c); updateHud(true); renderDist(true); }; r.append(b); }
    body.append(r);
  }
  if (q.mode === 'auto' && q.note) { const ch = el('div', 'chat'); ch.append(el('div', 'them', `${q.chair}: ${q.note}`)); body.append(ch); }
  body = col2;
  renderDistBuild(c, d, q, body);
  body = col3;
  // hỏi chủ tịch
  body.append(el('h4', null, '❓ Hỏi chủ tịch'));
  const chips = el('div'); chips.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px';
  for (const [lb, t] of ASK_CHIPS) { const b = el('button', 'mini', lb); b.title = t; b.disabled = !!q.askWait; b.onclick = () => sendAsk(d, t); chips.append(b); }
  body.append(chips);
  if ((q.asks || []).length || q.askWait) {
    const ch = el('div', 'chat');
    for (const a of (q.asks || []).slice(q.askWait ? -1 : -2)) ch.append(el('div', 'us', a.q), el('div', 'them', `${q.chair}: ${a.a}`));
    if (q.askWait) ch.append(el('div', 'us', q.askWait), el('div', 'them', '… chủ tịch đang xem sổ sách'));
    body.append(ch);
  }
  const ain = el('input'), asend = el('button', 'mini acc', 'Hỏi'), arow = el('div');
  arow.style.cssText = 'display:flex;gap:6px'; ain.style.flex = '1'; ain.maxLength = 300; ain.placeholder = 'VD: quận mình tồn hàng gì nhiều nhất?';
  draft(ain, `ask${d}`);
  const ask = () => { const t = ain.value.trim(); if (t) { delete drafts[`ask${d}`]; sendAsk(d, t); } };
  asend.onclick = ask; ain.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ask(); });
  asend.disabled = !!q.askWait;
  arow.append(ain, asend); body.append(arow, el('small', null, 'Chủ tịch trả lời bằng số liệu thật của quận: dân cư, việc làm, tồn hàng, xuất khẩu, văn hoá, trường, y tế, môi trường, ngân sách.'));
  // giao việc
  body.append(el('h4', null, '📋 Giao việc'));
  const o = q.order;
  if (o || q.wait) {
    const ch = el('div', 'chat');
    ch.append(el('div', 'us', q.wait || o.text));
    if (q.wait) ch.append(el('div', 'them', '… chủ tịch đang lên kế hoạch'));
    else {
      if (o.reply) ch.append(el('div', 'them', o.reply));
      const K = S.KPIS[o.goal];
      ch.append(el('div', o.status === 'done' ? 'them pos' : o.status === 'failed' ? 'them neg' : 'them', o.status === 'active' ? `Chỉ tiêu: ${K.name} ${K.down ? 'giảm' : 'tăng'} so với ${o.start} · chấm vào ngày ${o.until + 1} (còn ${Math.max(0, o.until - c.day)} ngày)` : o.status === 'cancelled' ? 'Đã huỷ vì đổi cách điều hành' : `${o.status === 'done' ? '✅ Đạt' : '❌ Chưa đạt'}: ${K.name} ${o.start} → ${o.end}`));
    }
    body.append(ch);
  }
  const inp = el('input'), send = el('button', 'mini acc', 'Giao'), irow = el('div');
  irow.style.cssText = 'display:flex;gap:6px'; inp.style.flex = '1'; inp.maxLength = 300; inp.placeholder = 'VD: giảm trộm cắp quanh chợ trong 10 ngày';
  draft(inp, `order${d}`);
  const go = () => { const t = inp.value.trim(); if (t) { delete drafts[`order${d}`]; sendOrder(d, t); } };
  send.onclick = go; inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
  send.disabled = !!q.wait;
  irow.append(inp, send); body.append(irow, el('small', null, 'Quận làm các chương trình trên, và xây công trình quận khi bạn lệnh (VD: "xây trạm y tế"); đường, nhà máy, thuế vẫn là việc của thị trưởng.'));
  // báo cáo
  body.append(el('h4', null, 'Báo cáo của chủ tịch'));
  if (!q.reports.length) body.append(el('small', null, 'Chưa có báo cáo: 6 ngày chủ tịch gửi một lần, và khi tới hạn việc được giao.'));
  for (const r of q.reports.slice(-3).reverse()) { const card = el('div', 'card'); card.append(el('small', null, `Ngày ${r.day + 1}${r.result ? (r.result.ok ? ' · ✅ việc giao đạt' : ' · ❌ việc giao chưa đạt') : ''}`), el('p', null, r.text)); body.append(card); }
}

/** Phần 🏗️ Xây công trình của một quận: quyền xây, quỹ, đề xuất chờ duyệt, sổ đã xây. */
function renderDistBuild(c, d, q, body) {
  body.append(el('h4', null, '🏗️ Xây công trình'));
  const seg = el('div', 'seg');
  for (const [m, label] of Object.entries(S.BUILD_MODES)) { const b = el('button', 'mini' + (q.build === m ? ' on' : ''), label); b.onclick = () => { S.setBuildMode(c, d, m); renderDist(true); }; seg.append(b); }
  body.append(seg, el('small', null, `${q.mode === 'auto' ? 'Khi tự chủ, 3 ngày một lần chủ tịch xem quận thiếu gì' : 'Chỉ khi 🤖 Tự chủ chủ tịch mới tự đề xuất; lúc khác bạn lệnh xây trong 📋 Giao việc'}. Chủ tịch chọn loại (${S.BUILDS.map((t) => S.SERVICES[t].icon).join(' ')}), game chọn chỗ phủ nhiều dân thiếu nhất, không phá nhà. Quỹ 7 ngày phải đủ tiền xây và phí vận hành; thành phố đang lỗ thì chủ tịch không xây thêm.`));
  const spent = S.buildSpent(c, q), cap = el('input'); cap.type = 'range'; cap.min = 0; cap.max = 100000; cap.step = 2500; cap.value = q.bcap; cap.style.width = '100%';
  const lab = el('div', 'row'); lab.innerHTML = `<span>Quỹ xây dựng 7 ngày</span><span><b>${money(q.bcap)}</b> · đã dùng ${money(spent)}</span>`;
  cap.addEventListener('input', () => { lab.lastChild.innerHTML = `<b>${money(+cap.value)}</b>`; });
  cap.addEventListener('change', () => { S.setBuildCap(c, d, +cap.value); renderDist(true); });
  body.append(lab, cap);
  const p = q.prop;
  if (p) {
    const ch = el('div', 'chat'), D0 = S.SERVICES[p.type];
    if (p.status === 'think') ch.append(el('div', 'them', `… ${q.chair} đang cân nhắc xây gì cho quận`));
    else {
      ch.append(el('div', 'them', `✋ Xin xây ${D0.icon} ${D0.name} (${money(p.cost)}, vận hành ${money(p.upkeep || S.buildUpkeep(p.type, city))}/ngày): ${p.why}`));
      const row = el('div'); row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
      const yes = el('button', 'mini acc', '✅ Duyệt'), no = el('button', 'mini', '❌ Bác'), look = el('button', 'mini', '👁️ Xem chỗ');
      yes.disabled = p.cost > c.money;
      yes.onclick = () => { const r = S.approveBuild(c, d, true); toast(r.ok ? `🏗️ ${q.name} khởi công ${D0.name}` : r.reason); S.recalc(c); updateHud(true); renderDist(true); };
      no.onclick = () => { S.approveBuild(c, d, false); renderDist(true); };
      look.onclick = () => peekDist() || flyTo((p.x + 0.5) * S.T - S.HALF, (p.y + 0.5) * S.T - S.HALF);
      row.append(yes, no, look); ch.append(row, el('small', null, `Hết hạn ngày ${p.until + 1}`));
    }
    body.append(ch);
  }
  const done = (q.builds || []).slice(-4).reverse();
  if (done.length) {
    const list = el('div');
    for (const b of done) {
      const D0 = S.SERVICES[b.type], r = el('div', 'row');
      r.innerHTML = '<span></span><span></span>';
      r.firstChild.textContent = `${D0.icon} ${D0.name}`;
      r.lastChild.textContent = `ngày ${b.day + 1} · ${money(b.cost)} · ${{ auto: 'tự xây', ask: 'đã duyệt', order: 'theo lệnh' }[b.how] || ''}`;
      r.style.cursor = 'pointer'; r.onclick = () => peekDist() || flyTo((b.x + 0.5) * S.T - S.HALF, (b.y + 0.5) * S.T - S.HALF);
      list.append(r);
    }
    body.append(list);
  }
}

// ───────────────────────── lễ hội và mùa mưa bão ─────────────────────────

function renderFest(force) {
  const c = city, key = `${c.day}|${c.hour}|${c.fest.org ? c.fest.org.id + c.fest.org.start : ''}|${Math.round(c.money / 1000)}`;
  if (!force && renderFest.key === key) return;
  renderFest.key = key;
  const L = S.lunar(c.day), now = S.festivalNow(c), org = c.fest.org;
  const row = (a, b) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;
  $('festNow').innerHTML = [
    row('Hôm nay', `ngày ${L.day} tháng ${L.month} âm · năm thứ ${L.year}`),
    row('Mùa', S.stormSeason(c) ? '🌧️ Mùa mưa bão' : L.month === 12 || L.month <= 2 ? '🌸 Mùa xuân, Tết' : '☀️ Mùa khô'),
    now ? row(`${now.f.icon} ${now.f.name}`, `${now.f.desc}${org && org.id === now.f.id && org.start === now.start ? ` · <b>thành phố tổ chức quy mô ${S.FEST_SCALE[org.scale].name.toLowerCase()}</b>${org.safe ? '' : ' · <span class="neg">nơi tổ chức không có công an: chen lấn, dân chỉ vui một nửa</span>'}` : ''}`) : row('Lễ hôm nay', 'không có'),
    row('Tác động hôm nay', `du khách ×${S.festMul(c, 'tour').toFixed(2)} · khách quốc tế ×${S.festMul(c, 'intl').toFixed(2)} · dân vui +${S.festHappy(c).toFixed(1)}${S.festMul(c, 'ind') < 1 ? ` · nhà máy ×${S.festMul(c, 'ind')}` : ''}`),
  ].join('');
  const list = $('festList'); list.textContent = '';
  for (const u of S.upcomingFestivals(c, 6)) {
    const box = el('div', 'festItem'), planned = org && org.id === u.f.id && org.start === u.start;
    box.innerHTML = `${row(`${u.f.icon} <b>${u.f.name}</b>`, u.inDays ? `còn ${u.inDays} ngày` : 'đang diễn ra')}<small>${u.f.desc}${u.f.venue ? ` · hợp tổ chức ở ${S.SERVICES[u.f.venue].icon} ${S.SERVICES[u.f.venue].name.toLowerCase()}` : ''}</small>`;
    if (planned) box.append(el('div', 'pos', `✔ Đã lên kế hoạch tổ chức quy mô ${S.FEST_SCALE[org.scale].name.toLowerCase()} tại ${S.SERVICES[org.venueType].icon} ${S.SERVICES[org.venueType].name}`));
    else {
      const btns = el('div'); btns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 10px';
      for (let k = 1; k <= 3; k++) {
        const r = S.canOrganize(c, u.f.id, u.start, k), b = el('button', 'mini', `Tổ chức ${S.FEST_SCALE[k].name.toLowerCase()} · ${money(S.FEST_SCALE[k].cost)}`);
        b.disabled = !r.ok; b.title = r.ok ? `Du khách ×${(1 + 0.35 * k).toFixed(2)}, khách quốc tế ×${(1 + 0.3 * k).toFixed(1)}, dân vui +${k * 2}, thuế thương mại +${k * 4}%${k >= 2 ? ', bắn pháo hoa' : ''} · tại ${S.SERVICES[r.venue.type].name}` : r.reason;
        b.onclick = () => { const q = S.organize(c, u.f.id, u.start, k); toast(q.ok ? `🎎 Đã chi ${money(q.cost)} chuẩn bị ${u.f.name}${q.safe ? '' : ' · nơi tổ chức chưa có công an phủ tới: dễ chen lấn'}` : q.reason); updateHud(true); renderFest(true); };
        btns.append(b);
      }
      box.append(btns);
      const r1 = S.canOrganize(c, u.f.id, u.start, 1); if (!r1.ok && r1.reason !== 'Không đủ tiền') box.append(el('small', 'neg', r1.reason));
    }
    list.append(box);
  }
  const s = c.season, st = s.storm;
  $('stormBox').innerHTML = [
    row('Bão', st ? (st.hit ? `🌀 ${st.name} đang đổ bộ` : `⚠️ ${st.name} sẽ tới sau ${Math.max(0, st.at - c.hour)} giờ`) : S.stormSeason(c) ? 'chưa có bão' : 'ngoài mùa bão'),
    row('Ngập', s.wet ? `<span class="neg">${s.wet} ô ngập, ${s.houses} nhà ngập${s.tide ? ' (triều cường)' : ''}</span>` : 'không có'),
    row('Chống ngập', `${c.services.filter((v) => v.type === 'floodpump').length} trạm bơm · ${c.services.filter((v) => v.type === 'levee').length} kè · ${c.services.some((v) => S.SERVICES[v.type].ews) ? 'có' : 'chưa có'} trạm cảnh báo sớm`),
    '<small>Mưa to, bão, triều cường (chiều tối rằm tháng 9–11) làm ngập vùng đất thấp sát sông, hồ, biển: nhà ngập không làm việc, dân khó chịu, ngập lâu thì nhà xuống cấp, đường ngập xe chạy chậm. Đặt 🌀 trạm bơm (vùng quanh trạm ít ngập, rút nhanh) và 🧱 kè ven bờ (chặn nước dâng). Trạm cảnh báo sớm báo bão trước 30 giờ thay vì 12 giờ và giảm thiệt hại.</small>',
  ].join('');
}

// ───────────────────────── chọn bản đồ ─────────────────────────

const mapPick = { kind: 'river', size: 128, seed: 0, mode: 'normal' };
function openMaps(mode) {
  mapPick.mode = mode; mapPick.seed = (Math.random() * 1e9) | 0;
  for (const r of document.querySelectorAll('[name=mapMode]')) r.checked = r.value === mode;
  $('maps').classList.add('show'); renderMaps(true);
}
function renderMaps(previews) {
  $('mapSeed').value = mapPick.seed;
  const grid = $('mapGrid');
  if (previews || !grid.childElementCount) {
    grid.textContent = '';
    for (const [k, m] of Object.entries(S.MAPS)) {
      const card = el('button', 'mapcard' + (k === mapPick.kind ? ' on' : '')), cv = el('canvas');
      const pv = S.mapPreview(mapPick.seed, k, mapPick.size);
      cv.width = cv.height = pv.n; cv.getContext('2d').putImageData(new ImageData(pv.px, pv.n, pv.n), 0, 0);
      card.append(cv, el('b', null, `${m.icon} ${m.name}`)); card.title = m.desc; card.dataset.kind = k;
      card.onclick = () => { mapPick.kind = k; renderMaps(false); };
      grid.append(card);
    }
  }
  for (const card of grid.children) card.classList.toggle('on', card.dataset.kind === mapPick.kind);
  const sz = $('mapSizes'); sz.textContent = '';
  for (const [n, d] of Object.entries(S.MAP_SIZES)) { const b = el('button', 'mini' + (+n === mapPick.size ? ' acc' : ''), d.name); b.title = d.desc; b.onclick = () => { mapPick.size = +n; renderMaps(true); }; sz.append(b); }
  const m = S.MAPS[mapPick.kind];
  const K = S.CLIMATES[m.climate] || S.CLIMATES.default;
  $('mapDesc').innerHTML = `<b>${m.icon} ${m.name}</b>${m.region ? ` · 📍 ${m.region}` : ''} · ${S.MAP_SIZES[mapPick.size].desc}<br>${m.desc}<br>🌦️ <b>Khí hậu ${K.name}:</b> ${K.desc}`;
}
function bindMaps() {
  $('mapReroll').addEventListener('click', () => { mapPick.seed = (Math.random() * 1e9) | 0; renderMaps(true); });
  $('mapSeed').addEventListener('change', (e) => { mapPick.seed = Math.max(0, +e.target.value | 0); renderMaps(true); });
  for (const r of document.querySelectorAll('[name=mapMode]')) r.addEventListener('change', () => { mapPick.mode = r.value; });
  $('mapCancel').addEventListener('click', () => $('maps').classList.remove('show'));
  $('mapGo').addEventListener('click', () => {
    if (city && city.edges.size > 1 && !confirm('Bỏ thành phố hiện tại và bắt đầu vùng đất mới? (Các ô lưu vẫn giữ nguyên)')) return;
    const opts = { size: mapPick.size, map: mapPick.kind, cell: S.CELL_NEW }, c = mapPick.mode === 'open' ? S.newSandbox(mapPick.seed, opts) : S.newCity(mapPick.seed, { ...opts, devTree: true });
    $('maps').classList.remove('show'); $('over').classList.remove('show');
    if (startCity(c)) { autosave(); if (mapPick.mode === 'open') toast('🎨 Chế độ Open: mọi thứ đã mở, tiền không giới hạn, không phá sản'); }
  });
}

/** Đổi sang thành phố c. Cảnh 3D dựng theo cỡ bản đồ: khác cỡ thì cất thành phố vào phiên rồi tải lại trang (trả về false). */
function startCity(c) {
  if (view.mapN !== S.N || view.cellT !== S.T) { // cảnh 3D dựng theo cỡ bản đồ và cỡ ô
    try { sessionStorage.setItem(KEY + 'pending', JSON.stringify(S.serialize(c))); } catch { city = c; writeSlot('auto'); }
    location.reload();
    return false;
  }
  city = c; window.__city = c;
  if (c.league) { // nhóm cạnh tranh: chạy bù thời gian vắng mặt theo đồng hồ thật rồi đồng bộ máy chủ
    const r = Lg.syncClock(c, S.catchUp);
    if (r.ran || r.skipped) setTimeout(() => toast(`🏆 Đã chạy bù ${Math.round(r.ran / 24)} ngày vắng mặt${r.skipped ? `, bỏ qua ${Math.round(r.skipped / 24)} ngày (vắng quá ${Lg.CATCHUP_MAX_DAYS} ngày)` : ''}`), 400);
    setTimeout(() => leagueSync(true), 0);
  }
  walkStop();
  Quests.unpackQuests(c, c.quests); // kiểm lại nhiệm vụ trong bản lưu
  view.setCity(c);
  $('bStyle').classList.toggle('on', c.style === 'vn');
  $('cityname').value = c.name; $('fare').value = c.transit.fare; $('ferryFare').value = c.transit.ferryFare ?? 4; $('taxR').value = c.tax.r; $('taxC').value = c.tax.c; $('taxI').value = c.tax.i;
  updateHud.key = null; renderLoans.sig = '';
  seatPick = null; distSel = 0; $('info').classList.remove('show'); $('dist').classList.remove('peek'); // bảng của thành phố cũ
  stroke = null; tool = 'info'; group = 'info'; mini.at = 0;
  seedSeen(); buildToolbar(); setTool('info'); updateHud(true); renderDev();
  $('over').classList.toggle('show', !!c.over);
  layout();
  return true;
}

function frame(now) {
  const dt = Math.min(0.1, (now - (frame.last || now)) / 1000);
  frame.last = now;
  // di chuyển bằng bàn phím (đang đi bộ thì phím điều khiển nhân vật)
  const mv = walk.on ? 1 : view.cam.dist * dt * 0.9;
  let dx = 0, dz = 0;
  if (keys.has('a') || keys.has('arrowleft')) dx -= mv;
  if (keys.has('d') || keys.has('arrowright')) dx += mv;
  if (keys.has('w') || keys.has('arrowup')) dz -= mv;
  if (keys.has('s') || keys.has('arrowdown')) dz += mv;
  if (walk.on) {
    if (!view.avatar) walkStop(); // thành phố khác vừa nạp
    else {
      const j = walk.joy;
      if (view.avatar.veh) gta.onHit(view.avatarDrive(dt, S.clamp(-dz - j.y, -1, 1), S.clamp(-dx - j.x, -1, 1)));
      else if (!walk.chan) view.avatarMove(dt, dx + j.x, -dz - j.y, keys.has('shift') || j.run); else view.avatarMove(dt, 0, 0, false);
      walkTick(dt, now);
    }
  } else if (dx || dz) view.pan(dx, dz);
  if (keys.has('q')) view.rotate(dt * 1.4, 0);
  if (keys.has('e')) view.rotate(-dt * 1.4, 0);

  if (stroke && now - stroke.at > 110) { stroke.at = now; strokeStep(false); }

  const hourBefore = city.hour;
  if (city.league && city.hour >= Lg.allowedHour(city.league)) { // đồng hồ thật của nhóm: chờ ngày giải mới
    if (!frame.waitHint || now - frame.waitHint > 15000) { frame.waitHint = now; const ms = Math.max(0, (city.league.start + (Lg.leagueDayNow(city.league) + 1) * city.league.dayMs) - Date.now()); hintOverride = `🏆 Đã hết ngày giải hôm nay: thành phố chờ ngày mới sau <b>${Math.ceil(ms / 60000)} phút</b> (nhóm cạnh tranh chạy theo đồng hồ thật)`; renderHint(); }
  } else { if (frame.waitHint) { frame.waitHint = 0; hintOverride = null; renderHint(); } S.advance(city, dt * speed); }
  leagueSync(false);
  const n = city.hour - hourBefore;
  for (const ev of city.events.splice(0)) {
    if (ev.type === 'milestone') {
      toast(`Thưởng ${money(ev.reward)} và ${ev.points} điểm phát triển 🔬${ev.unlocked.length ? ` · mở khoá: ${ev.unlocked.join(', ')}` : ''}`, `🎉 ${city.name} trở thành ${ev.name}!`);
      refreshToolbar(); renderDev();
    } else if (ev.type === 'fireStart') toast(`🔥 Có đám cháy${ev.cause ? ` (${ev.cause})` : ''}! Xe cứu hoả gần nhất đang chạy tới`);
    else if (ev.type === 'built') toast(`🏗️ Đã xây xong ${ev.icon} ${ev.name}`);
    else if (ev.type === 'depleted') toast(ev.text);
    else if (ev.type === 'league') toast(ev.text);
    else if (ev.type === 'leagueClear' && (ev.receive || ev.refund)) toast(`🏆 Thanh toán hợp đồng ngày giải ${ev.day + 1}: nhận ${fmt(Math.round(ev.receive))} ₫${ev.refund ? `, hoàn lại ${fmt(Math.round(ev.refund))} ₫` : ''}`);
    else if (ev.type === 'leagueDay') { const a = ev.alloc; toast(`🏆 Ngày giải mới: ${fmt(a.migrants)} người được chia về thành phố, ${fmt(a.tourists)} du khách, đầu tư ×${a.invest}`); }
    else if (ev.type === 'fireOut') toast('🚒 Đã dập xong đám cháy');
    else if (ev.type === 'fire') toast('🔥 Một toà nhà cháy rụi vì xe cứu hoả không tới kịp');
    else if (ev.type === 'bankruptBiz') { if (performance.now() - (frame.bizToast || 0) > 8000) { frame.bizToast = performance.now(); toast(`💸 Một ${{ shop: 'cửa hàng', factory: 'nhà máy', raw: 'cơ sở khai thác', office: 'văn phòng', leisure: 'quán ăn, chỗ vui chơi' }[ev.kind] || 'doanh nghiệp'} vừa phá sản (xem 👥 để biết vì sao)`); } }
    else if (ev.type === 'loanPaid') toast('Đã trả xong một khoản vay');
    else if (ev.type === 'arrival') toast(ev.text);
    else if (ev.type === 'market') toast(`${ev.up ? '📈' : '📉'} Thị trường: ${ev.text} (xem 📊)`);
    else if (ev.type === 'accident') { if (performance.now() - (frame.accToast || 0) > 6000) { frame.accToast = performance.now(); toast(`💥 Tai nạn${ev.n > 1 ? ` liên hoàn ${ev.n} xe` : ''}${ev.fire ? ', xe bốc cháy' : ''}: công an và xe cứu hộ đang tới, đường bị chắn`); } }
    else if (ev.type === 'robbery') toast('🚨 Có vụ cướp! Xe công an gần nhất đang tới');
    else if (ev.type === 'robberyCaught') toast('🚓 Công an đã bắt được kẻ cướp');
    else if (ev.type === 'robberyEscaped') toast('🏃 Kẻ cướp đã tẩu thoát: công an tới không kịp');
    else if (ev.type === 'wildfire') toast('🔥 Cháy rừng! Lửa có thể lan vào nhà dân');
    else if (ev.type === 'hail') toast('🌨️ Bão đá: nhà cửa hư hại, đường trơn dễ tai nạn');
    else if (ev.type === 'tornadoWarn') toast('📡 Cảnh báo sớm: lốc xoáy sẽ tới trong 1 giờ, dân xuống hầm trú ẩn', '⚠️ Cảnh báo thiên tai');
    else if (['stormWarn', 'stormHit', 'flood'].includes(ev.type)) toast(ev.text, '⚠️ Mùa mưa bão');
    else if (ev.type === 'stormEnd' || ev.type === 'fest' || ev.type === 'council') toast(ev.text);
    else if (ev.type === 'tornado') toast('🌪️ Lốc xoáy xuất hiện! Nhà trên đường đi của nó sẽ bị phá huỷ', '⚠️ Thiên tai');
    else if (ev.type === 'tornadoEnd') toast(`🌪️ Lốc xoáy đã tan · ${city.inc.day.killed || 0} người thiệt mạng hôm nay`);
    else if (ev.type === 'research') { toast('🔬 Viện nghiên cứu vừa làm ra 1 điểm phát triển'); renderDev(); }
    else if (ev.type === 'bankrupt') { $('over').classList.add('show'); setSpeed(0); }
  }
  if (n && city.hour % 3 === 0) city.dirty.zones = true;
  if (n) renderCity(false);
  questsTick(now);
  view.update(dt, dt * speed);
  updateHud(false);
  drawMinimap(now);
  if (now - lastSave > 20000) autosave();
  if (cloud.user && !cloud.busy && now - cloud.at > Cloud.CLOUD_EVERY_MS) cloudSave('auto', true); // tự lưu lên mây
  requestAnimationFrame(frame);
}

// thành phố lúc mở trang: thành phố vừa chọn (đổi cỡ bản đồ phải tải lại trang) hoặc ô tự lưu; nạp trước để biết cỡ bản đồ rồi mới dựng cảnh 3D
let first = null, bootErr = null;
try {
  const pend = sessionStorage.getItem(KEY + 'pending');
  if (pend) { sessionStorage.removeItem(KEY + 'pending'); first = S.deserialize(JSON.parse(pend)); }
} catch (e) { bootErr = e; }
if (!first) { const d = readSlot('auto'); if (d) try { first = S.deserialize(d.city); } catch (e) { bootErr = e; } }
if (!first) first = S.newCity(undefined, { size: 128, devTree: true, cell: S.CELL_NEW });
view = new View($('view'));
view.mapN = S.N; view.cellT = S.T;
window.__view = view;
try { view.dayNight = localStorage.getItem(KEY + 'night') !== '0'; } catch { /* bỏ qua */ }
$('bNight').classList.toggle('on', view.dayNight);
window.__newCity = (seed, opts) => startCity(S.newCity(seed, opts || { size: view.mapN })); // tiện thử nghiệm: bản đồ theo seed cố định
window.__loadCity = (o) => startCity(S.deserialize(o)); // tiện thử nghiệm: nạp bản lưu (JSON)
bindUi();
startCity(first);
cloudRefresh(); // đã đăng nhập (dashboard cùng tên miền) thì tự lưu lên mây ngay
if (bootErr) toast('Không đọc được bản lưu: ' + bootErr.message);
bindInput();
let seen = false;
try { seen = !!localStorage.getItem(KEY + 'seen'); } catch { /* bỏ qua */ }
if (!seen) $('modal').classList.add('show');
requestAnimationFrame(frame);

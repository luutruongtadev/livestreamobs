// Phố Mới — việc làm được khi đi bộ (chế độ 🚶): dập lửa, bắt kẻ cướp, dọn rác ngay tại chỗ; hỏi chuyện người dân.
// Chỉ đọc / sửa trạng thái mô phỏng có sẵn (c.fire, c.inc.robberies, c.garbage, c.pp); tiền thưởng đi qua sổ cái (dòng 'deed').
import { N, T, ZDEF, SERVICES, EDU_NAME, garbageLimit, cellX, cellZ } from './base.js';
import { cityGet } from './ledger.js';
import { incomeOf, rentDay, ST } from './people.js';
import { bizName, placeName } from './chain.js';
import { TIER_CFG, burden } from './tiers.js';

/** reach: bán kính tính theo ô (từ tâm ô); secs: giây thật phải giữ; reward: ₫ vào ngân sách. */
export const DEED = {
  fire: { icon: '🧯', verb: 'Dập lửa', secs: 3, reward: 500, reach: 1.7, prio: 0 },
  rob: { icon: '🚨', verb: 'Bắt kẻ cướp', secs: 2, reward: 300, reach: 1.7, prio: 1 },
  trash: { icon: '🧹', verb: 'Dọn rác', secs: 2.5, reward: 60, reach: 1.7, prio: 2 },
};
export const DEED_DAY_CAP = 2500; // thưởng tối đa mỗi ngày trong game: không "cày" tiền bằng dọn rác

/** Thống kê việc tốt (không lưu vào bản lưu: chỉ trong phiên chơi). */
export function deedStats(c) {
  if (!c.deeds || c.deeds.day !== c.day) c.deeds = { day: c.day, got: 0, n: (c.deeds && c.deeds.n) || { fire: 0, rob: 0, trash: 0, talk: 0 } };
  return c.deeds;
}

/** Tên thường gọi của toà nhà ở ô i: nhà ở gọi theo loại khu (bizName chỉ đặt tên cho doanh nghiệp). */
const bldName = (c, i) => { const z = ZDEF[c.zone[i]]; return z && z.cat === 'r' ? (z.short || z.name).toLowerCase() : bizName(c, i); };

const near = (i, x, z, reach) => Math.hypot(cellX(i) - x, cellZ(i) - z) <= reach * T;

/** Việc làm được quanh (x, z), xếp theo độ gấp rồi độ gần: [{ kind, cell, rob?, d }]. */
export function deedsNear(c, x, z) {
  const out = [], cx = Math.floor((x + (N * T) / 2) / T), cy = Math.floor((z + (N * T) / 2) / T);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const gx = cx + dx, gy = cy + dy;
    if (gx < 0 || gy < 0 || gx >= N || gy >= N) continue;
    const i = gy * N + gx, d = Math.hypot(cellX(i) - x, cellZ(i) - z);
    if (c.fire[i] && near(i, x, z, DEED.fire.reach)) out.push({ kind: 'fire', cell: i, d });
    if (c.level[i] && c.garbage[i] > garbageLimit(c.zone[i], c.level[i]) && near(i, x, z, DEED.trash.reach)) out.push({ kind: 'trash', cell: i, d });
  }
  for (const r of (c.inc && c.inc.robberies) || []) if (near(r.cell, x, z, DEED.rob.reach)) out.push({ kind: 'rob', cell: r.cell, rob: r.id, d: Math.hypot(cellX(r.cell) - x, cellZ(r.cell) - z) });
  return out.sort((a, b) => DEED[a.kind].prio - DEED[b.kind].prio || a.d - b.d);
}

/** Việc còn làm được không (lửa đã tắt, cướp đã bị bắt, rác đã được thu thì thôi). */
export function deedValid(c, d) {
  if (d.kind === 'fire') return !!c.fire[d.cell];
  if (d.kind === 'rob') return c.inc.robberies.some((r) => r.id === d.rob);
  if (d.kind === 'trash') return !!c.level[d.cell] && c.garbage[d.cell] > garbageLimit(c.zone[d.cell], c.level[d.cell]);
  return false;
}

/** Làm xong việc: sửa trạng thái mô phỏng, trả thưởng. Trả { ok, text, reward }. */
export function doDeed(c, d) {
  if (!deedValid(c, d)) return { ok: false, text: 'Việc này đã xong rồi' };
  const st = deedStats(c), D = DEED[d.kind];
  if (d.kind === 'fire') { c.fire[d.cell] = 0; c.dirty.fx = true; } // xe cứu hoả đang tới thì tới nơi thấy hết lửa, quay về
  else if (d.kind === 'rob') {
    const inc = c.inc;
    inc.robberies = inc.robberies.filter((o) => o.id !== d.rob);
    let cells = 0; for (const o of c.services) cells += SERVICES[o.type].cells || 0;
    if (c.prisoners + 1 <= cells) c.prisoners++;
    inc.total.caught++; inc.day.caught++;
  } else if (d.kind === 'trash') c.garbage[d.cell] = 0;
  st.n[d.kind]++;
  const reward = Math.max(0, Math.min(D.reward, DEED_DAY_CAP - st.got));
  if (reward) { cityGet(c, 'deed', reward); st.got += reward; }
  const where = bldName(c, d.cell);
  const text = d.kind === 'fire' ? `Đã dập tắt đám cháy (${where})` : d.kind === 'rob' ? 'Đã tóm được kẻ cướp, giao cho công an' : `Đã dọn sạch đống rác (${where})`;
  return { ok: true, text, reward };
}

// ───────────────────────── người dân ─────────────────────────

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Phan', 'Trịnh', 'Đinh', 'Mai', 'Cao'];
const DEM = [['Văn', 'Đức', 'Minh', 'Quang', 'Hữu', 'Công', 'Thành', 'Gia'], ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Kim', 'Bích', 'Mỹ', 'Diệu']];
const TEN = [['An', 'Bình', 'Cường', 'Dũng', 'Đạt', 'Hải', 'Hùng', 'Khoa', 'Long', 'Nam', 'Phúc', 'Quân', 'Sơn', 'Tài', 'Tuấn', 'Việt', 'Vinh', 'Huy'],
  ['Anh', 'Chi', 'Dung', 'Hà', 'Hằng', 'Hương', 'Lan', 'Linh', 'Mai', 'Ngân', 'Nhung', 'Oanh', 'Phương', 'Thảo', 'Trang', 'Vy', 'Yến', 'Hoa']];

const mix = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 2654435761) ^ Math.imul(b + 0x7f4a7c15, 1597334677); h = Math.imul(h ^ (h >>> 15), 2246822519); return (h ^ (h >>> 13)) >>> 0; };

/** Tên cố định theo người (id + đời của ô id: người mới dọn vào cùng id có tên khác). */
export function personName(c, id) {
  const h = mix(id, c.pp.gen[id]), g = h & 1;
  return { name: `${HO[(h >>> 1) % HO.length]} ${DEM[g][(h >>> 6) % DEM[g].length]} ${TEN[g][(h >>> 10) % TEN[g].length]}`, female: !!g };
}

/** Người đang sống ở ô i (để gõ cửa hỏi chuyện): luân phiên theo lượt hỏi. */
export function residentsOf(c, i) {
  const pp = c.pp, out = [];
  for (let id = 0; id < pp.n; id++) if (pp.alive[id] && pp.home[id] === i) out.push(id);
  return out;
}

/**
 * Thẻ người dân: tên, tuổi, học vấn, việc làm, thu nhập, tiền nhà, mức vui và câu than phiền / khen
 * lấy từ đúng các lý do mô phỏng đang tính vào hài lòng (people.js, sim.js cellHappy).
 */
export function personCard(c, id, purpose) {
  const pp = c.pp, st = deedStats(c);
  st.n.talk++;
  const { name, female } = personName(c, id), age = Math.floor(pp.age[id]), home = pp.home[id], work = pp.work[id];
  const me = age < 18 ? 'Em' : age >= 60 ? (female ? 'Bà' : 'Ông') : female ? 'Chị' : 'Anh';
  const rows = [];
  rows.push(['Tuổi', `${age}`]);
  rows.push(['Học vấn', EDU_NAME[pp.edu[id]] + (pp.enrolled[id] ? ' · đang đi học' : '')]);
  rows.push(['Nhà', home >= 0 ? `${bldName(c, home)} · ${placeName(c, home)}` : 'chưa có nhà']);
  const job = work >= 0 && c.level[work] ? `${bizName(c, work)} · ${placeName(c, work)}` : work >= 0 ? 'công trình công cộng' : null;
  rows.push(['Việc làm', job || (age >= 65 ? 'nghỉ hưu' : age < 18 ? 'chưa đi làm' : pp.enrolled[id] ? 'sinh viên' : 'thất nghiệp')]);
  let bd = 0;
  if (job && age >= 18) {
    const inc = incomeOf(c, id), rent = home >= 0 ? rentDay(c, home) : 0;
    bd = rent ? burden(rent, inc) : 0;
    if (rent) rows.push(['Tiền nhà', `${Math.round(bd * 100)}% thu nhập`]);
  }
  rows.push(['Tiền để dành', `${Math.round(pp.money[id]).toLocaleString('vi-VN')} ₫`]);
  if (purpose) rows.push(['Đang', { work: 'đi làm', home: 'về nhà', out: 'đi chơi, mua sắm' }[purpose] || 'đi dạo']);
  else if (pp.state[id] === ST.WORK) rows.push(['Đang', 'ở chỗ làm']);
  // câu nói: lý do nặng nhất trước
  const needs = home >= 0 && c.fn && c.fn.cellHappy ? c.fn.cellHappy(c, home).needs : [];
  const happy = pp.happy[id], says = [];
  if (pp.sick[id]) says.push(`${me} đang ốm${c.services.some((s) => s.type === 'clinic' || s.type === 'hospital') ? ', chờ xe cấp cứu' : ', mà quanh đây chẳng có bệnh viện nào'}.`);
  if (home < 0) says.push(`${me} chưa có chỗ ở, thành phố xây thêm nhà đi.`);
  if (age >= 18 && age < 65 && work < 0 && !pp.enrolled[id]) says.push(`${me} đang thất nghiệp, mong có thêm chỗ làm ${pp.edu[id] >= 2 ? 'đúng trình độ' : 'gần nhà'}.`);
  if (age >= 6 && age < 18 && !pp.enrolled[id]) says.push(`${me} không có trường để học.`);
  if (bd > TIER_CFG.strain) says.push('Tiền nhà nặng quá, lương không đủ.');
  if (pp.commute[id] > 5) says.push(`Đi làm mất gần ${Math.round(pp.commute[id])} tiếng, kẹt xe quá.`);
  for (const n of needs.slice(0, 2)) says.push(`${n.replace(/^[^\p{L}]+/u, '')}.`);
  if (!says.length) says.push(happy >= 70 ? `${me} sống ở đây vui lắm, cảm ơn thị trưởng!` : happy >= 45 ? 'Cuộc sống cũng tạm ổn.' : 'Dạo này chán quá, chẳng có gì vui.');
  const mood = happy >= 70 ? '😄' : happy >= 50 ? '🙂' : happy >= 30 ? '😐' : '😠';
  return { name, female, age, mood, happy, rows, says: says.slice(0, 3) };
}

/** Tên hiển thị của công trình / toà nhà ở ô i (cho nút "Xem"). */
export function placeLabel(c, i) {
  if (c.occ[i]) { const s = c.services[c.occ[i] - 1], d = s && SERVICES[s.type]; if (d) return `${d.icon} ${d.name}`; }
  if (c.level[i]) { const z = ZDEF[c.zone[i]]; return `${z.icon} ${bldName(c, i)}`; }
  return null;
}

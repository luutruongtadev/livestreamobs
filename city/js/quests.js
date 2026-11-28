// Phố Mới — nhiệm vụ người dân nhờ thị trưởng (chế độ đi bộ: hỏi chuyện / gõ cửa → "Nhận việc").
// Mỗi người có tối đa một lời nhờ, rút ra từ đúng vấn đề mô phỏng đang làm họ kém vui. Nhiều việc chỉ xong bằng cách
// xây dựng (kéo điện, nước, xây trường, trạm y tế, quy hoạch chỗ làm); game tự chấm theo số liệu thật, có hạn chót.
// Nhiệm vụ lưu trong c.quests (bản lưu); thưởng: uy tín thị trưởng, người nhờ vui hơn, tiền boa từ ví họ (qua sổ cái).
import { N, SERVICES, cellX, cellZ, clamp, garbageLimit, MAYOR_REP, cellPos, bizName, placeName } from './sim.js';
import { cityTake } from './ledger.js';
import { personName } from './deeds.js';

export const MAX_QUESTS = 3;
const near = (c, i, kind) => c.services.reduce((b, s) => { if (s.cell < 0 || !kind(s)) return b; const d = Math.hypot(cellX(s.cell) - cellX(i), cellZ(s.cell) - cellZ(i)); return !b || d < b.d ? { s, d } : b; }, null);
const isHealth = (s) => SERVICES[s.type].cover === 'health';

/**
 * Các loại việc: ask(c, id) trả về bản nháp { title, plea, ...dữ liệu } nếu người id đang gặp đúng vấn đề đó, không thì null.
 * done(c, q) → true khi xong; days: hạn (ngày trong game); rep: uy tín khi xong; tip: tiền boa tối đa.
 */
export const QUESTS = {
  ride: { // người ốm nhờ chở tới trạm y tế / bệnh viện (cần xe)
    icon: '🏥', days: 1, rep: 0.6, tip: 120, needVeh: true,
    ask(c, id) {
      const pp = c.pp, h = pp.home[id];
      if (!pp.sick[id] || h < 0) return null;
      const n = near(c, h, isHealth);
      if (!n) return null;
      return { title: `Chở người ốm tới ${SERVICES[n.s.type].name.toLowerCase()}`, plea: 'Tôi ốm mấy hôm nay, gọi xe cấp cứu mãi chưa thấy. Thị trưởng chở tôi đi khám được không?', pick: h, drop: n.s.cell };
    },
  },
  power: {
    icon: '⚡', days: 5, rep: 1, tip: 60,
    ask(c, id) { const h = c.pp.home[id]; return h >= 0 && c.level[h] && c.pOk[h] !== 1 ? { title: 'Kéo điện cho nhà dân', plea: c.pOk[h] ? 'Điện nhà tôi cứ chập chờn, tối nào cũng mất.' : 'Nhà tôi chưa có điện, tối phải thắp nến.', at: h } : null; },
    done: (c, q) => c.pOk[q.at] === 1,
  },
  water: {
    icon: '🚰', days: 5, rep: 1, tip: 60,
    ask(c, id) { const h = c.pp.home[id]; return h >= 0 && c.level[h] && c.wOk[h] !== 1 ? { title: 'Đưa nước sạch về nhà dân', plea: c.wOk[h] ? 'Nước máy nhà tôi yếu lắm, chỉ nhỏ giọt.' : 'Nhà tôi không có nước máy, phải đi xin từng xô.', at: h } : null; },
    done: (c, q) => c.wOk[q.at] === 1,
  },
  sewer: {
    icon: '🚽', days: 6, rep: 0.8, tip: 40,
    ask(c, id) { const h = c.pp.home[id]; return h >= 0 && c.level[h] && c.pOk[h] === 1 && c.wOk[h] === 1 && c.sOk[h] !== 1 ? { title: 'Làm cống thoát nước thải', plea: 'Cống nhà tôi tắc, nước thải tràn ra ngõ, hôi lắm.', at: h } : null; },
    done: (c, q) => c.sOk[q.at] === 1,
  },
  job: { // người thất nghiệp: thành phố phải có chỗ làm cho họ (quy hoạch thương mại, công nghiệp...)
    icon: '💼', days: 7, rep: 1, tip: 150,
    ask(c, id) { const pp = c.pp, a = pp.age[id]; return a >= 18 && a < 65 && pp.work[id] < 0 && !pp.enrolled[id] && pp.home[id] >= 0 ? { title: 'Tìm việc làm cho người thất nghiệp', plea: 'Tôi mất việc mấy tuần rồi. Thành phố mở thêm cửa hàng, nhà máy gần đây thì tốt quá.', at: pp.home[id] } : null; },
    done: (c, q) => c.pp.work[q.pid] >= 0,
  },
  school: {
    icon: '🏫', days: 8, rep: 1.2, tip: 80,
    ask(c, id) { const pp = c.pp, a = pp.age[id], h = pp.home[id]; return a >= 6 && a < 18 && !pp.enrolled[id] && h >= 0 ? { title: 'Cho trẻ được đi học', plea: 'Cháu muốn đi học mà quanh đây không có trường, hoặc trường hết chỗ rồi.', at: h } : null; },
    done: (c, q) => !!c.pp.enrolled[q.pid] || c.pp.age[q.pid] >= 18,
  },
  clinic: {
    icon: '🩺', days: 8, rep: 1, tip: 80,
    ask(c, id) { const h = c.pp.home[id]; return h >= 0 && c.pp.count >= 120 && c.cover.health[h] < 0.05 ? { title: 'Xây trạm y tế gần khu dân cư', plea: 'Ốm đau phải đi xa lắm mới có chỗ khám, người già khổ lắm.', at: h } : null; },
    done: (c, q) => c.cover.health[q.at] >= 0.05,
  },
  police: {
    icon: '👮', days: 8, rep: 1, tip: 80,
    ask(c, id) { const h = c.pp.home[id]; return h >= 0 && c.crime[h] > 0.2 && c.cover.police[h] < 0.05 ? { title: 'Đưa công an về khu phố', plea: 'Khu này trộm cướp nhiều mà chẳng thấy công an đâu.', at: h } : null; },
    done: (c, q) => c.cover.police[q.at] >= 0.05,
  },
  trash: { // rác ngập quanh nhà: thị trưởng tự dọn (việc tốt 🧹) hoặc thành phố có xe thu gom
    icon: '🧹', days: 3, rep: 0.6, tip: 40,
    ask(c, id) {
      const h = c.pp.home[id]; if (h < 0) return null;
      const cells = [], hx = h % N, hy = (h / N) | 0;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const x = hx + dx, y = hy + dy, i = y * N + x; if (x >= 0 && y >= 0 && x < N && y < N && c.level[i] && c.garbage[i] > garbageLimit(c.zone[i], c.level[i])) cells.push(i); }
      return cells.length ? { title: 'Dọn rác quanh khu phố', plea: 'Rác chất đống mấy ngày không ai thu, ruồi muỗi bay đầy.', cells: cells.slice(0, 3), at: h } : null;
    },
    done: (c, q) => q.cells.every((i) => !c.level[i] || c.garbage[i] <= garbageLimit(c.zone[i], c.level[i])),
  },
};
const ORDER = ['ride', 'power', 'water', 'job', 'school', 'sewer', 'clinic', 'police', 'trash'];

export function questState(c) { if (!Array.isArray(c.quests)) c.quests = []; return c.quests; }

/** Lời nhờ của người id (nếu có và chưa nhận): { kind, title, plea, ... }. */
export function questOffer(c, id) {
  const list = questState(c);
  if (list.some((q) => q.pid === id && q.gen === c.pp.gen[id])) return null;
  for (const k of ORDER) { const d = QUESTS[k].ask(c, id); if (d) return { kind: k, ...d }; }
  return null;
}

/** Nhận việc: trả { ok, reason?, q }. */
export function acceptQuest(c, id, offer) {
  const list = questState(c);
  if (list.length >= MAX_QUESTS) return { ok: false, reason: `Thị trưởng đang ôm ${MAX_QUESTS} việc rồi, làm xong bớt đã` };
  const Q = QUESTS[offer.kind];
  const q = { uid: `${c.day}-${id}-${offer.kind}`, kind: offer.kind, pid: id, gen: c.pp.gen[id], name: personName(c, id).name, title: offer.title, at: offer.at ?? offer.pick, until: c.hour + Q.days * 24, stage: 0 };
  if (offer.cells) q.cells = offer.cells;
  if (offer.kind === 'ride') { q.pick = offer.pick; q.drop = offer.drop; }
  list.push(q);
  return { ok: true, q };
}

export function dropQuest(c, uid) { c.quests = questState(c).filter((q) => q.uid !== uid); }

/** Điểm cần tới của nhiệm vụ (cho cột sáng / chỉ hướng), hoặc null nếu là việc xây dựng thuần. */
export function questTarget(c, q) {
  if (q.kind === 'ride') { const i = q.stage ? q.drop : q.pick; return { x: cellX(i), z: cellZ(i), text: q.stage ? `Chở ${q.name} tới nơi` : `Đón ${q.name}` }; }
  if (q.kind === 'trash') { const i = q.cells.find((k) => c.level[k] && c.garbage[k] > garbageLimit(c.zone[k], c.level[k])); return i == null ? null : { x: cellX(i), z: cellZ(i), text: 'Đống rác cần dọn' }; }
  return null;
}

/** Mô tả tiến độ một dòng. */
export function questLine(c, q) {
  const left = Math.max(0, q.until - c.hour), t = left >= 24 ? `${Math.ceil(left / 24)} ngày` : `${left} giờ`;
  let p = '';
  if (q.kind === 'ride') p = q.stage ? `đang chở tới ${bizName(c, q.drop) === 'cơ sở' ? placeName(c, q.drop) : 'nơi khám'}` : `đón ở ${placeName(c, q.pick)}`;
  else if (q.kind === 'trash') p = `${q.cells.filter((i) => !c.level[i] || c.garbage[i] <= garbageLimit(c.zone[i], c.level[i])).length}/${q.cells.length} đống`;
  else p = `nhà ở ${placeName(c, q.at)}`;
  return `${QUESTS[q.kind].icon} ${q.title} · ${p} · còn ${t}`;
}

/**
 * Chấm nhiệm vụ (gọi khoảng mỗi giây, cả khi đang xây dựng). ctx: { avatar, speed } của nhân vật (null nếu không đi bộ).
 * Trả về danh sách sự kiện { type: 'done' | 'fail' | 'pick' | 'gone', q, tip? } để giao diện báo.
 */
export function questTick(c, ctx) {
  const list = questState(c), out = [], pp = c.pp;
  for (const q of [...list]) {
    const Q = QUESTS[q.kind];
    if (!pp.alive[q.pid] || pp.gen[q.pid] !== q.gen) { dropQuest(c, q.uid); out.push({ type: 'gone', q }); continue; }
    let ok = false;
    if (q.kind === 'ride') {
      const a = ctx && ctx.avatar;
      if (a && a.veh && Math.abs(a.speed || 0) < 3) {
        const i = q.stage ? q.drop : q.pick;
        if (Math.hypot(cellX(i) - a.x, cellZ(i) - a.z) < 18) {
          if (!q.stage) { q.stage = 1; out.push({ type: 'pick', q }); }
          else { ok = true; pp.sick[q.pid] = 0; pp.amb[q.pid] = 0; } // tới nơi khám: khỏi bệnh
        }
      } else if (q.stage && a && !a.veh) { q.stage = 0; out.push({ type: 'drop', q }); } // xuống xe giữa đường: khách đứng chờ
    } else ok = Q.done(c, q);
    if (ok) {
      dropQuest(c, q.uid);
      c.mayorRep = clamp((c.mayorRep || 0) + Q.rep, -MAYOR_REP.min, MAYOR_REP.max);
      pp.happy[q.pid] = Math.min(100, pp.happy[q.pid] + 15);
      const tip = Math.round(Math.max(0, Math.min(Q.tip, pp.money[q.pid] * 0.2)));
      if (tip) { pp.money[q.pid] -= tip; cityTake(c, 'fare', tip); }
      out.push({ type: 'done', q, tip });
    } else if (c.hour > q.until) {
      dropQuest(c, q.uid);
      c.mayorRep = clamp((c.mayorRep || 0) - 0.5, -MAYOR_REP.min, MAYOR_REP.max);
      out.push({ type: 'fail', q });
    }
  }
  return out;
}

/** Gói nhiệm vụ để lưu (chỉ số và chuỗi ngắn). */
export function packQuests(c) { return questState(c).map((q) => ({ ...q })); }
export function unpackQuests(c, arr) {
  c.quests = (Array.isArray(arr) ? arr : []).filter((q) => q && QUESTS[q.kind] && Number.isInteger(q.pid) && q.pid >= 0 && q.pid < c.pp.n).slice(0, MAX_QUESTS)
    .map((q) => ({ uid: String(q.uid), kind: q.kind, pid: q.pid, gen: q.gen | 0, name: String(q.name || '').slice(0, 60), title: String(q.title || '').slice(0, 120), at: q.at | 0, until: q.until | 0, stage: q.stage ? 1 : 0, ...(q.cells ? { cells: q.cells.slice(0, 3).map((i) => i | 0) } : {}), ...(q.kind === 'ride' ? { pick: q.pick | 0, drop: q.drop | 0 } : {}) }));
}

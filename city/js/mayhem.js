// Phố Mới — chế độ đi bộ kiểu thế giới mở: cướp xe dân, lái xe, gây tai nạn, bị truy nã (⭐), công an rượt bắt,
// chạy xe ôm / taxi chở khách. Mọi hậu quả đi vào mô phỏng thật: tai nạn qua incidents.crash, xe công an là chuyến xe thật
// (trip / reroute), uy tín thị trưởng (c.mayorRep) cộng thẳng vào hài lòng của dân, tiền phạt và tiền cước qua sổ cái.
import { N, T, SERVICES, svcVal, cellOf, cellX, cellZ, inMap, clamp, MAYOR_REP, crash, cellPos, bizName, placeName } from './sim.js';
import { trip, reroute } from './traffic.js';
import { cityPay, cityTake } from './ledger.js';
import { personName } from './deeds.js';

export const GTA = {
  maxStars: 5,
  crime: { // rep: đổi uy tín; star: sao truy nã nếu bị thấy (gần công an hoặc đang bị truy)
    carjack: { rep: -0.5, star: 1, text: 'Cướp xe giữa phố' },
    crash: { rep: -1, star: 1, text: 'Gây tai nạn' },
    hitcop: { rep: -1.5, star: 2, text: 'Đâm xe công an' },
  },
  lose: 12, // giây không có xe công an nào trong LOSE_R mét thì giảm 1 sao
  loseR: 75,
  bust: { r: 7, secs: 1.5, fine: 1500, rep: -2 },
  crashMin: 8, // m/s: đâm nhanh hơn mới thành tai nạn
  hp: { wall: 2.2, veh: 1.2 }, // máu xe mất mỗi m/s khi đâm
  taxi: { near: 14, min: 120, max: 650, perM: 0.12, base: 30, speed: 12, spare: 25 },
};

const STEAL = new Set(['car', 'moto', 'truck']);
const rep = (c, d) => { c.mayorRep = clamp((c.mayorRep || 0) + d, -MAYOR_REP.min, MAYOR_REP.max); };

/** Ô có đường gần (x, z) nhất (dò vòng ra 3 ô) để xe công an / tìm đường tới. */
function roadNear(c, x, z) {
  const cx = cellOf(x), cy = cellOf(z);
  for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !inMap(cx + dx, cy + dy)) continue;
    const p = cellPos(c, (cy + dy) * N + cx + dx);
    if (p) return p;
  }
  return null;
}

export function createGta({ view, getCity, toast, money }) {
  const g = { stars: 0, calm: 0, bustT: 0, cops: new Set(), tick: 0, taxi: null, hint: '' };
  const city = () => getCity();
  const av = () => view.avatar;

  function reset() {
    recall();
    g.stars = 0; g.calm = 0; g.bustT = 0; g.taxi = null; view.setBeacon(null);
  }

  /** Xe cướp được / xe đỗ quanh nhân vật (khi đi bộ). */
  function vehicleOpts() {
    const a = av(), out = [];
    if (!a || a.veh) return out;
    let pk = null, pd = 3.8;
    for (const p of view.parkedVeh) { const d = Math.hypot(p.x - a.x, p.z - a.z); if (d < pd) { pd = d; pk = p; } }
    if (pk) out.push({ id: `pk${pk.veh.id}`, key: 'F', icon: '🔑', label: pk.veh.mine ? 'Lên xe của mình' : 'Lên xe', mount: pk });
    else {
      let best = null, bd = 4.5;
      for (const v of view.vehiclesNear(a.x, a.z, 4.5)) { if (!STEAL.has(v.kind) || v.wreck || v.emergency) continue; const d = Math.hypot(v.rx - a.x, v.rz - a.z); if (d < bd) { bd = d; best = v; } }
      if (best) out.push({ id: `cj${best.id}`, key: 'F', icon: best.kind === 'moto' ? '🛵' : best.kind === 'truck' ? '🚚' : '🚗', label: 'Cướp xe', steal: best, hot: true });
    }
    return out;
  }

  /** Nút khi đang lái. */
  function driveOpts() {
    const a = av(), out = [];
    if (!a || !a.veh) return out;
    out.push({ id: 'out', key: 'F', icon: '🚪', label: 'Xuống xe', dismount: true });
    if (g.taxi) out.push({ id: 'taxiOff', icon: '✖', label: 'Thôi chở khách', taxi: false });
    else if (!g.stars && a.veh.kind !== 'truck') out.push({ id: 'taxiOn', icon: a.veh.kind === 'moto' ? '🛵' : '🚕', label: a.veh.kind === 'moto' ? 'Chạy xe ôm' : 'Chạy taxi', taxi: true });
    return out;
  }

  function act(o) {
    const c = city(), a = av();
    if (o.mount) {
      view.parkedVeh = view.parkedVeh.filter((p) => p !== o.mount);
      Object.assign(a, { x: o.mount.x, z: o.mount.z, y: o.mount.y, yaw: o.mount.yaw });
      view.avatarMount(o.mount.veh);
      return true;
    }
    if (o.steal) {
      const v = o.steal, tr = c.traffic;
      if (!tr.vehicles.includes(v)) return true;
      tr.vehicles = tr.vehicles.filter((x) => x !== v);
      if (v.cb) c.onArrive(c, v.cb, null); // chuyến của người lái coi như tới nơi muộn (bỏ xe đi bộ)
      Object.assign(a, { x: v.rx, z: v.rz, yaw: v.ryaw ?? a.yaw });
      const y = view.avatarGround(a.x, a.z); if (y !== null) a.y = y;
      view.avatarMount({ kind: v.kind, look: v.look, color: v.color, id: v.id, hp: 100 });
      const who = v.cb && v.cb.t === 'cit' && c.pp.alive[v.cb.id] ? personName(c, v.cb.id).name : 'Người lái';
      crime('carjack', `${who} bị lôi khỏi xe, chạy đi báo công an`);
      return true;
    }
    if (o.dismount) {
      if (g.taxi) { toast(g.taxi.pax != null ? 'Khách xuống xe giữa đường, không trả tiền' : 'Thôi chở khách'); stopTaxi(); }
      view.avatarDismount();
      return true;
    }
    if (o.taxi === true) { startTaxi(); return true; }
    if (o.taxi === false) { toast('Thôi chở khách'); stopTaxi(); return true; }
    return false;
  }

  /** Phạm luật: trừ uy tín, thêm sao nếu bị thấy (trong vùng công an, hoặc đang bị truy). */
  function crime(kind, why) {
    const c = city(), a = av(), C = GTA.crime[kind], i = cellOf(a.z) * N + cellOf(a.x);
    rep(c, C.rep);
    const seen = g.stars > 0 || (inMap(cellOf(a.x), cellOf(a.z)) && c.cover.police[i] > 0.05) || [...g.cops].some((v) => v.rx != null && Math.hypot(v.rx - a.x, v.rz - a.z) < 120);
    const before = g.stars;
    if (seen) { g.stars = Math.min(GTA.maxStars, g.stars + C.star); g.calm = 0; }
    toast(`${why || C.text}${g.stars > before ? ` · bị truy nã ${'⭐'.repeat(g.stars)}` : seen ? '' : ' · không có công an quanh đây'} · uy tín ${C.rep}`, '🚨 Phạm luật');
    if (g.taxi) { toast('Khách hoảng sợ, xuống xe bỏ đi'); stopTaxi(); }
  }

  /** Va chạm khi lái (từ view.avatarDrive). */
  function onHit(h) {
    const c = city(), a = av();
    if (!h || !a.veh) return;
    a.veh.hp = (a.veh.hp ?? 100) - h.impact * (h.hit === 'wall' ? GTA.hp.wall : GTA.hp.veh) * (h.impact > 4 ? 1 : 0);
    if (h.hit === 'veh' && h.impact >= GTA.crashMin && !h.v.wreck) {
      const cop = h.v.kind === 'police';
      if (h.v.kind !== 'bus' && h.v.kind !== 'tram') crash(c, h.v);
      crime(cop ? 'hitcop' : 'crash', cop ? 'Đâm vào xe công an' : `Đâm vào ${h.v.kind === 'moto' ? 'xe máy' : h.v.kind === 'truck' ? 'xe tải' : 'xe'} của dân`);
    }
    if (a.veh.hp <= 0) {
      toast('Xe hỏng nát, phải bỏ lại', '💥');
      view.avatarDismount();
      view.parkedVeh.pop(); // xe hỏng không lên lại được
      if (g.taxi) stopTaxi();
    }
  }

  // ── công an truy đuổi ──
  function playerTo() { const a = av(); return roadNear(city(), a.x, a.z); }
  function dispatch() {
    const c = city(), tr = c.traffic, to = playerTo();
    for (const v of [...g.cops]) if (!tr.vehicles.includes(v)) g.cops.delete(v);
    if (!to) return;
    if (g.cops.size < g.stars) {
      const a = av();
      let best = null, bd = Infinity;
      for (const s of c.services) {
        if (s.cell < 0 || !SERVICES[s.type].cars || (s.out || 0) >= svcVal(s, 'cars')) continue;
        const d = Math.hypot(cellX(s.cell) - a.x, cellZ(s.cell) - a.z); if (d < bd) { bd = d; best = s; }
      }
      const from = best && cellPos(c, best.cell);
      const r = from && trip(c, 'police', from, to, { t: 'police', svc: best.uid, chase: 1 }, true);
      if (r && r.vehicle) { best.out = (best.out || 0) + 1; g.cops.add(r.vehicle); }
    }
    for (const v of g.cops) if (!v.wreck && reroute(c, v, to)) v.cb = { t: 'police', svc: v.cb.svc, chase: 1 };
  }
  function recall() {
    const c = city(); if (!c) return;
    for (const v of g.cops) {
      if (!c.traffic.vehicles.includes(v) || v.wreck) continue;
      const s = c.services.find((o) => o.uid === v.cb.svc), home = s && cellPos(c, s.cell);
      if (home && reroute(c, v, home)) v.cb = { t: 'svcBack', svc: s.uid };
    }
    g.cops.clear();
  }
  function busted() {
    const c = city(), fine = Math.max(0, Math.min(GTA.bust.fine, c.money));
    if (fine) cityPay(c, 'mayorFine', fine);
    rep(c, GTA.bust.rep);
    const a = av();
    if (a.veh) { const mine = a.veh.mine; view.avatarDismount(); if (!mine) view.parkedVeh.pop(); } // xe cướp bị tịch thu
    toast(`Thị trưởng bị công an bắt, nộp phạt ${money(fine)} · uy tín ${GTA.bust.rep}`, '🚓 Bị bắt');
    g.stars = 0; g.calm = 0; g.bustT = 0; recall(); if (g.taxi) stopTaxi();
  }

  // ── chở khách ──
  function startTaxi() {
    const c = city(), a = av(), pp = c.pp, cand = [];
    for (let k = 0; k < 400 && cand.length < 40; k++) {
      const id = (Math.random() * pp.n) | 0;
      if (!pp.alive[id] || pp.age[id] < 16 || pp.home[id] < 0 || !cellPos(c, pp.home[id])) continue;
      const d = Math.hypot(cellX(pp.home[id]) - a.x, cellZ(pp.home[id]) - a.z);
      if (d >= GTA.taxi.min && d <= GTA.taxi.max) cand.push(id);
    }
    if (!cand.length) { toast('Chưa có ai cần đi xe quanh đây (thành phố cần thêm dân, đường)'); g.taxi = null; return; }
    const id = cand[(Math.random() * cand.length) | 0];
    g.taxi = { id, gen: pp.gen[id], pax: null, at: pp.home[id], t: 0, lim: 0 };
    toast(`${personName(c, id).name} đặt xe ở ${placeName(c, pp.home[id])}: tới đón ở cột sáng vàng`, a.veh.kind === 'moto' ? '🛵 Có khách' : '🚕 Có khách');
  }
  function stopTaxi() { g.taxi = null; view.setBeacon(null); }
  function taxiTick(dt) {
    const c = city(), a = av(), t = g.taxi;
    if (!t) return;
    if (!c.pp.alive[t.id] || c.pp.gen[t.id] !== t.gen) { toast('Khách đã huỷ chuyến'); startTaxi(); return; }
    const tx = cellX(t.at), tz = cellZ(t.at), d = Math.hypot(tx - a.x, tz - a.z), slow = Math.abs(a.speed || 0) < 3;
    view.setBeacon(tx, tz, t.pax == null ? 0xffc83a : 0x4ad07a);
    if (t.pax != null) t.t += dt;
    if (d > GTA.taxi.near || !slow) return;
    const pp = c.pp;
    if (t.pax == null) { // đón khách: chở tới chỗ làm, không có việc thì tới một toà nhà bất kỳ cách xa
      let dest = pp.work[t.id] >= 0 && c.level[pp.work[t.id]] ? pp.work[t.id] : -1;
      if (dest < 0 || Math.hypot(cellX(dest) - a.x, cellZ(dest) - a.z) < 150) {
        dest = -1;
        for (let pass = 0; pass < 2 && dest < 0; pass++) for (let k = 0; k < 600; k++) { // lượt 1: toà nhà; lượt 2: chỗ bất kỳ ven đường
          const i = (Math.random() * N * N) | 0, dd = Math.hypot(cellX(i) - a.x, cellZ(i) - a.z);
          if ((pass || c.level[i]) && dd > 180 && dd < 900 && cellPos(c, i)) { dest = i; break; }
        }
      }
      if (dest < 0) { toast('Khách đổi ý, không đi nữa'); stopTaxi(); return; }
      const dist = Math.hypot(cellX(dest) - a.x, cellZ(dest) - a.z);
      Object.assign(t, { pax: t.id, at: dest, dist, t: 0, lim: Math.round(dist / GTA.taxi.speed + GTA.taxi.spare) });
      toast(`Đón ${personName(c, t.id).name}: tới ${c.level[dest] ? `${bizName(c, dest)} ở ` : ''}${placeName(c, dest)} trong ${t.lim} giây`);
      return;
    }
    const late = t.t > t.lim, fare = Math.round((GTA.taxi.base + t.dist * GTA.taxi.perM) * (late ? 0.5 : 1));
    const paid = Math.max(0, Math.min(fare, pp.money[t.id]));
    if (paid) { pp.money[t.id] -= paid; cityTake(c, 'fare', paid); }
    if (!late) rep(c, 0.2);
    toast(`${late ? 'Tới muộn, khách chỉ trả nửa tiền' : 'Đúng giờ, khách vui'}: nhận ${money(paid)} vào ngân sách`, '🏁 Trả khách');
    startTaxi(); // cuốc tiếp theo
  }

  /** Gọi mỗi khung hình khi đang đi bộ / lái. */
  function tick(dt) {
    const a = av(), c = city();
    if (!a) return;
    taxiTick(dt);
    if (!g.stars) return;
    g.tick += dt;
    if (g.tick > 2) { g.tick = 0; dispatch(); }
    let near = Infinity;
    for (const v of g.cops) if (v.rx != null && !v.wreck) near = Math.min(near, Math.hypot(v.rx - a.x, v.rz - a.z));
    if (near < GTA.bust.r && (!a.veh || Math.abs(a.speed) < 3)) { g.bustT += dt; if (g.bustT > GTA.bust.secs) { busted(); return; } } else g.bustT = Math.max(0, g.bustT - dt);
    const hasCops = c.services.some((s) => SERVICES[s.type].cars);
    if (near > GTA.loseR) { g.calm += dt * (hasCops ? 1 : 2); if (g.calm > GTA.lose) { g.calm = 0; g.stars--; if (!g.stars) { recall(); toast('Đã cắt đuôi công an', '😮‍💨'); } } } else g.calm = 0;
  }

  /** Dòng trạng thái: sao, tốc độ, máu xe, cuốc xe đang chạy. */
  function hud() {
    const a = av(), c = city(), parts = [];
    if (g.stars) parts.push(`${'⭐'.repeat(g.stars)}${'☆'.repeat(GTA.maxStars - g.stars)}`);
    if (a && a.veh) parts.push(`${Math.round(Math.abs(a.speed) * 3.6)} km/h`, `🔧 ${Math.max(0, Math.round(a.veh.hp ?? 100))}%`);
    const r = c.mayorRep || 0;
    if (Math.abs(r) >= 0.1) parts.push(`${r > 0 ? '👍' : '👎'} uy tín ${r > 0 ? '+' : ''}${r.toFixed(1)}`);
    return parts.join(' · ');
  }
  /** Chỉ hướng cho cuốc xe: { x, z, text } hoặc null. */
  function navTarget() {
    const t = g.taxi, c = city();
    if (!t) return null;
    if (t.pax == null) return { x: cellX(t.at), z: cellZ(t.at), icon: '🙋', text: `Đón ${personName(c, t.id).name}` };
    const left = t.lim - t.t;
    return { x: cellX(t.at), z: cellZ(t.at), icon: '🏁', text: `Chở tới ${c.level[t.at] ? bizName(c, t.at) : placeName(c, t.at)} · ${left >= 0 ? `còn ${Math.ceil(left)} s` : 'trễ giờ'}` };
  }

  return { g, reset, vehicleOpts, driveOpts, act, onHit, tick, hud, navTarget };
}

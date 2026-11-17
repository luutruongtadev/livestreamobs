// Phố Mới (city/): mô phỏng thành phố + đường dẫn /city của gateway
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../city/js/sim.js';
import { resolveStatic } from '../gateway/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = S.cellCenter;
const road = (c, x0, y0, x1, y1, type = 'small', ctrl = null) => S.buildRoad(c, {
  a: S.snapPoint(c, W(x0), W(y0), { type }), b: S.snapPoint(c, W(x1), W(y1), { type }), type, ctrl: ctrl && { x: W(ctrl[0]), z: W(ctrl[1]) },
});
const degrees = (c) => { const d = {}; for (const l of c.adj.values()) d[l.length] = (d[l.length] || 0) + 1; return d; };
const run = (c, hours) => { for (let h = 0; h < hours; h++) S.tick(c); };
const cell = (x, y) => y * S.N + x;
const { newCity } = S;
/** Thành phố mới với cả bản đồ đã là đất của mình (các test cũ không bàn chuyện mua đất). */
const openCity = (seed) => { const c = newCity(seed); c.owned.fill(1); c.own.fill(1); return c; };
const shore = (c) => { for (let y = 5; y < 60; y++) for (let x = 5; x < 90; x++) if (S.canPlace(c, 'outlet', x, y).ok) return [x, y]; return null; };

/** Lưới đường nhỏ: trục dọc + trục ngang cắt nhau, chưa có gì khác. */
function cross(seed = 12345) {
  const c = openCity(seed), sx = c.start.x;
  road(c, sx, 7, sx, 30);
  road(c, sx - 12, 20, sx + 12, 20);
  return c;
}

/** Thị trấn đủ dùng: lưới ô bàn cờ, ba loại khu, điện, nước, cống xả đã nối mạng. */
function town(seed = 12345) {
  const c = openCity(seed), sx = c.start.x;
  c.money = 500000;
  road(c, sx, 7, sx, 34); road(c, sx - 14, 14, sx + 14, 14); road(c, sx - 14, 24, sx + 14, 24);
  road(c, sx - 14, 14, sx - 14, 34); road(c, sx + 14, 14, sx + 14, 34); road(c, sx - 14, 34, sx + 14, 34);
  S.zoneRect(c, sx - 13, 12, sx + 13, 13, 1); S.zoneRect(c, sx - 13, 15, sx + 13, 16, 1); S.zoneRect(c, sx - 13, 22, sx - 1, 23, 1);
  S.zoneRect(c, sx + 1, 22, sx + 13, 23, 2); S.zoneRect(c, sx - 13, 25, sx - 1, 26, 2);
  S.zoneRect(c, sx + 1, 32, sx + 13, 33, 3); S.zoneRect(c, sx - 13, 32, sx - 1, 33, 3); S.zoneRect(c, sx + 1, 35, sx + 13, 36, 3);
  for (let k = 0; k < 6; k++) assert.ok(S.placeService(c, 'wind', sx + (k % 2 ? 2 : -2), 17 + k).linked);
  assert.ok(S.placeService(c, 'tower', sx - 2, 9).linked);
  assert.ok(S.placeService(c, 'tower', sx + 2, 9).linked);
  const sh = shore(c);
  assert.equal(S.placeService(c, 'outlet', ...sh).linked, false, 'cống ở xa đường chưa nối mạng');
  assert.ok(S.buildLine(c, 'pipe', { x: W(sh[0]), z: W(sh[1]) }, { x: W(sx - 14), z: W(14) }).ok);
  assert.ok(c.services.every((s) => s.linked));
  return c;
}

test('city: bản đồ mới có nước, cây, địa hình cao thấp và một đoạn đường dẫn vào', () => {
  const c = openCity(42);
  const sum = (a) => a.reduce((n, v) => n + v, 0);
  assert.ok(sum(c.water) > 300 && sum(c.water) < S.N * S.N / 2);
  assert.ok(sum(c.tree) > 200);
  assert.deepEqual([c.nodes.size, c.edges.size], [2, 1]);
  assert.ok(Math.max(...c.hv) > 3, 'có đồi');
  assert.equal(Math.min(...c.hv), Math.fround(-3.2));
  assert.equal(S.heightAt(c, -S.HALF + 30, -S.HALF + 50), c.hv[5 * (S.N + 1) + 3]);
  assert.ok(Math.abs(S.heightAt(c, 4.99, 5.01) - S.heightAt(c, 5.01, 4.99)) < 0.05);
  assert.equal(S.outsidePositions(c).length, 1, 'đường dẫn vào là cửa ngõ ra ngoài');
});

test('city: đường là graph — cắt nhau tự sinh nút giao, đường cong, từ chối đường trùng', () => {
  const c = openCity(12345), sx = c.start.x, before = c.money;
  const r1 = road(c, sx, 7, sx, 30);
  assert.ok(r1.ok);
  assert.equal(c.money, before - r1.cost);
  assert.equal(r1.cost, 23 * S.T * S.ROADS.small.cost);
  assert.deepEqual([c.nodes.size, c.edges.size], [3, 2], 'nối tiếp vào nút cuối của đường có sẵn');
  assert.ok(road(c, sx - 12, 20, sx + 12, 20).ok);
  assert.deepEqual([c.nodes.size, c.edges.size], [6, 5], 'cắt nhau: thêm nút giao, đường cũ bị tách đôi');
  assert.equal(degrees(c)[4], 1);
  assert.ok(road(c, sx, 30, sx + 14, 36, 'small', [sx + 12, 30]).ok);
  assert.ok([...c.edges.values()].pop().len > Math.hypot(140, 60), 'đường cong dài hơn dây cung');
  const mid = S.snapPoint(c, W(sx + 6) + 2, W(20) + 3);
  assert.ok(mid.edge != null);
  assert.ok(S.buildRoad(c, { a: mid, b: S.snapPoint(c, W(sx + 6), W(12)), type: 'small' }).ok);
  assert.equal(degrees(c)[3], 1);
  assert.equal(road(c, sx - 12, 20, sx + 12, 20).ok, false, 'vẽ đè lên đường cũ');
  assert.equal(road(c, sx, 30, sx, 30.5).reason, 'Đoạn quá ngắn');
  c.money = 10;
  assert.equal(road(c, sx + 12, 20, sx + 20, 20).reason, 'Không đủ tiền');
});

test('city: ô quy hoạch tự sinh hai bên đường; khu mật độ cao và văn phòng khoá theo mốc dân số', () => {
  const c = openCity(12345), sx = c.start.x;
  road(c, sx - 12, 20, sx + 12, 20);
  assert.equal(c.road[cell(sx, 20)], 1);
  assert.deepEqual([c.acc[cell(sx, 21)], c.acc[cell(sx, 22)], c.acc[cell(sx, 23)]], [1, 2, 0]);
  assert.equal(S.roadDir(c, sx, 21), 3, 'quay mặt lên phía đường');
  assert.equal(S.zoneRect(c, sx - 5, 21, sx + 5, 25, S.ZONE.R).count, 22, 'chỉ 2 hàng sát đường nhận quy hoạch');
  assert.equal(S.zoneRect(c, 2, 2, 4, 4, S.ZONE.R).ok, false);
  assert.equal(S.zoneRect(c, sx - 5, 18, sx + 5, 19, S.ZONE.RH).ok, false, 'chung cư chưa mở khoá');
  c.milestone = 2;
  assert.ok(S.zoneRect(c, sx - 5, 18, sx + 5, 19, S.ZONE.RH).ok);
  assert.equal(S.zoneRect(c, sx - 12, 18, sx - 6, 19, S.ZONE.O).ok, false, 'văn phòng cần mốc 1.000 dân');
  assert.ok(road(c, sx - 12, 30, sx + 12, 30, 'large').ok);
  assert.deepEqual([c.road[cell(sx, 30)], c.road[cell(sx, 31)], c.acc[cell(sx, 32)], c.acc[cell(sx, 29)]], [1, 1, 1, 1], 'đại lộ rộng 2 ô');
});

test('city: nâng cấp, đảo chiều và san ủi đường', () => {
  const c = cross(), sx = c.start.x;
  const e = S.edgeAt(c, W(sx), W(25));
  const m = c.money, cost = S.upgradeCost(e, 'large');
  assert.ok(S.upgradeRoad(c, e.id, 'large').ok);
  assert.equal(c.money, m - cost);
  assert.equal(c.road[cell(sx + 1, 25)] + c.road[cell(sx - 1, 25)], 2, 'đường rộng hơn đè thêm ô hai bên');
  assert.ok(S.upgradeRoad(c, e.id, 'oneway').ok);
  const [a, b] = [e.a, e.b];
  assert.ok(S.upgradeRoad(c, e.id, 'oneway').flipped);
  assert.deepEqual([e.a, e.b], [b, a]);
  const edges = c.edges.size;
  assert.ok(S.bulldozeRect(c, sx, 25, sx, 25).ok);
  assert.equal(c.edges.size, edges - 1);
});

test('city: tìm đường theo graph, tôn trọng đường một chiều; ngã tư có đèn', () => {
  const c = cross(), sx = c.start.x;
  const from = S.cellPos(c, cell(sx - 8, 21)), to = S.cellPos(c, cell(sx + 1, 12));
  assert.ok(from && to);
  assert.equal(S.cellPos(c, cell(3, 3)), null, 'ô không cạnh đường thì không có lối ra');
  const p = S.findPath(c, from, to);
  assert.equal(p.steps.length, 2, 'đi dọc trục ngang rồi rẽ lên trục dọc');
  assert.ok(p.cost > 0);
  // biến đoạn trục dọc phía bắc thành một chiều hướng xuống nam: không còn đi ngược lên được
  const north = to.edge;
  S.upgradeRoad(c, north.id, 'oneway');
  const nodeN = [...c.adj.entries()].find(([, l]) => l.length === 4)[0];
  if (north.b !== nodeN) S.upgradeRoad(c, north.id, 'oneway'); // đảo cho chiều a→b chạy về phía ngã tư
  assert.equal(north.b, nodeN);
  assert.equal(S.findPath(c, S.cellPos(c, cell(sx - 8, 21)), S.cellPos(c, cell(sx + 1, 12))), null);
  assert.ok(S.findPath(c, S.cellPos(c, cell(sx + 1, 12)), S.cellPos(c, cell(sx - 8, 21))), 'chiều thuận vẫn đi được');
  assert.ok(c.traffic.signals.has(nodeN), 'ngã tư có đèn tín hiệu');
  assert.ok(['g', 'y', 'r'].includes(S.signalState(c, nodeN, north.id)));
});

test('city: nhà chỉ mọc khi mạng điện, nước và thoát nước nối tới', () => {
  const c = cross(), sx = c.start.x;
  S.zoneRect(c, sx + 1, 9, sx + 2, 19, S.ZONE.R);
  run(c, 30);
  assert.equal(c.level.reduce((n, v) => n + v, 0), 0, 'chưa có điện nước');
  assert.ok(c.stats.none.p && c.stats.none.w);
  assert.equal(S.placeService(c, 'wind', sx + 20, 5).linked, false);
  assert.equal(c.stats.powerCap, 0);
  assert.ok(S.buildLine(c, 'power', { x: W(sx + 20), z: W(5) }, { x: W(sx + 12), z: W(19) }).ok);
  assert.equal(c.stats.powerCap, 60);
  S.placeService(c, 'tower', sx - 2, 10);
  const sh = shore(c);
  S.placeService(c, 'outlet', ...sh);
  S.buildLine(c, 'pipe', { x: W(sh[0]), z: W(sh[1]) }, { x: W(sx - 12), z: W(20) });
  assert.deepEqual(c.stats.none, { p: false, w: false, s: false });
  run(c, 30);
  assert.ok(c.level.reduce((n, v) => n + v, 0) > 5, 'nhà đã mọc');
});

test('city: người dân dọn tới, có việc, đi làm bằng xe thật trên đường; thuế thu theo hoạt động', () => {
  const c = town();
  run(c, 24 * 4);
  const ps = c.pstats;
  assert.ok(c.stats.pop > 120, `dân ${c.stats.pop}`);
  assert.equal(c.stats.pop, c.pp.count);
  assert.ok(ps.kids > 0 && ps.adults > 0);
  assert.ok(ps.employed > ps.workers * 0.6, `có việc ${ps.employed}/${ps.workers}`);
  assert.ok(c.milestone >= 1 && c.events.some((e) => e.type === 'milestone'));
  assert.ok(c.stats.inc.r > 0 && c.stats.inc.c > 0, 'thuế thu nhập và thuế thương mại');
  // sáng thứ hai (ngày 7): xe đi làm xuất hiện, có người đã tới chỗ làm
  run(c, 24 * 3 + 9);
  assert.equal(c.day % 7, 0);
  assert.ok(c.traffic.stats.spawned > 20, 'đã có xe chạy thật');
  assert.ok(c.traffic.stats.arrived > 10);
  assert.ok(c.present.reduce((n, v) => n + v, 0) > 10, 'có nhân viên đang ở chỗ làm');
  assert.ok(c.traffic.stats.stuck === 0 || c.inc.total.accidents > 0, 'thị trấn nhỏ không kẹt cứng (trừ khi có tai nạn chắn đường)');
  const mode = c.pstats.mode;
  assert.ok(mode.car + mode.walk > 0);
  // thuế riêng từng khu
  const before = c.demand.c;
  c.tax.c = 18; S.recalc(c);
  assert.ok(c.demand.c < before);
});

test('city: chuỗi hàng hoá — xe tải nhập hàng qua cửa ngõ, mất cửa ngõ thì cửa hàng cạn kho', () => {
  const c = town();
  run(c, 24 * 6);
  assert.ok(c.econ.imports > 0, 'thiếu nhà cung cấp trong thành phố thì nhập từ ngoài');
  const kinds = new Set();
  for (let i = 0; i < S.N * S.N; i++) if (c.level[i]) kinds.add(S.bizKind(c, i));
  assert.ok(kinds.has('shop') && (kinds.has('raw') || kinds.has('factory')));
  // cắt đường cao tốc dẫn vào
  S.bulldozeRect(c, c.start.x, 3, c.start.x, 3);
  assert.equal(S.outsidePositions(c).length, 0);
  const imp = c.econ.imports, onWay = [...c.traffic.vehicles, ...c.traffic.pending].filter((v) => v.cb && v.cb.t === 'cargo' && v.cb.imp).length; // xe nhập đã vào trong thành phố vẫn giao nốt
  run(c, 24 * 2);
  assert.ok(c.econ.imports <= imp + onWay * S.PRICE.load, 'không còn đường nhập hàng');
  const imp2 = c.econ.imports;
  run(c, 24);
  assert.equal(c.econ.imports, imp2, 'hết xe chạy dở thì không còn hàng nhập');
});

test('city: xe cứu hoả chạy tới dập lửa; không có trạm thì nhà cháy rụi', () => {
  const c = town(), sx = c.start.x;
  run(c, 48);
  const pick = () => { for (let i = 0; i < S.N * S.N; i++) if (c.level[i] && !c.fire[i]) return i; return -1; };
  const a = pick();
  c.fire[a] = 7; run(c, 8);
  assert.equal(c.level[a], 0, 'không có trạm cứu hoả: cháy rụi');
  assert.ok(c.events.some((e) => e.type === 'fire'));
  c.milestone = 2;
  assert.ok(S.placeService(c, 'fire', sx - 16, 18).ok);
  const b = pick();
  c.fire[b] = 7; run(c, 8);
  assert.ok(c.level[b] > 0, 'xe cứu hoả tới kịp');
  assert.equal(c.fire[b], 0);
  assert.ok(c.events.some((e) => e.type === 'fireOut'));
});

test('city: trường học nâng học vấn; bãi rác cho xe đi thu gom', () => {
  const c = town(), sx = c.start.x;
  c.milestone = 2;
  assert.ok(S.placeService(c, 'school', sx - 16, 21).ok);
  assert.ok(S.placeService(c, 'landfill', sx + 16, 29).ok);
  run(c, 24 * 14);
  assert.ok(c.pstats.students > 0, 'có học sinh');
  const school = c.services.find((s) => s.type === 'school');
  assert.ok(school.used > 0);
  // trẻ nhập cư lúc 6-11 tuổi, sau ~2 tuần đã có đứa qua tuổi 12 với bằng tiểu học
  let grads = 0;
  for (let id = 0; id < c.pp.n; id++) if (c.pp.alive[id] && c.pp.age[id] >= 12 && c.pp.age[id] < 18 && c.pp.edu[id] >= 1) grads++;
  assert.ok(grads > 0, 'có trẻ học xong tiểu học');
  const landfill = c.services.find((s) => s.type === 'landfill');
  assert.ok(c.traffic.stats.spawned > 0);
  let worst = 0;
  for (let i = 0; i < S.N * S.N; i++) if (c.level[i]) worst = Math.max(worst, c.garbage[i] / S.garbageLimit(c.zone[i], c.level[i]));
  assert.ok(worst < 3, `rác tồn nhiều nhất gấp ${worst.toFixed(1)} lần ngưỡng`);
  assert.ok(landfill.out >= 0);
});

test('city: xe buýt và metro — vẽ tuyến, dân chọn đi khi có lợi, thu tiền vé', () => {
  const c = town(), sx = c.start.x;
  assert.equal(S.planTransit(c, 'bus', [{ x: W(3), z: W(3) }, { x: W(sx), z: W(20) }]).reason, 'Trạm xe buýt phải nằm trên đường');
  assert.equal(S.planTransit(c, 'metro', [{ x: W(sx - 20), z: W(12) }, { x: W(sx + 18), z: W(36) }]).ok, false, 'metro chưa mở khoá');
  const bus = S.addTransit(c, 'bus', [{ x: W(sx - 14), z: W(16) }, { x: W(sx), z: W(14) }, { x: W(sx + 14), z: W(26) }, { x: W(sx), z: W(34) }]);
  assert.ok(bus.ok);
  assert.equal(bus.line.broken, false);
  assert.ok(bus.line.loop > 300);
  assert.equal(c.traffic.vehicles.filter((v) => v.kind === 'bus').length, 1);
  assert.ok(S.setVehicles(c, bus.line.id, 3).ok);
  assert.equal(c.traffic.vehicles.filter((v) => v.kind === 'bus').length, 3);
  c.milestone = 4;
  const metro = S.addTransit(c, 'metro', [{ x: W(sx - 13), z: W(12) }, { x: W(sx), z: W(24) }, { x: W(sx + 13), z: W(35) }]);
  assert.ok(metro.ok);
  const ride = S.planRide(c, cell(sx - 13, 13), cell(sx + 12, 35));
  assert.ok(ride && ride.eta > 0, 'có tuyến nối hai đầu thành phố');
  const money0 = c.transit.income;
  run(c, 24 * 9);
  assert.ok(c.transit.income > money0, 'đã có khách trả tiền vé');
  assert.ok(c.stats.exp.transit > 0);
  assert.ok(S.removeTransit(c, bus.line.id).ok);
  assert.equal(c.traffic.vehicles.filter((v) => v.kind === 'bus').length, 0);
});

test('city: ô nhiễm bốn loại; cây xanh lọc bớt; trạm bơm gần cống xả thì nước bẩn', () => {
  const c = town(), sx = c.start.x;
  run(c, 72);
  S.computeMaps(c);
  const ind = [];
  for (let i = 0; i < S.N * S.N; i++) if (c.level[i] && c.zone[i] === 3) ind.push(i);
  assert.ok(ind.length > 0);
  assert.ok(c.air[ind[0]] > 0.1 && c.ground[ind[0]] > 0.1 && c.noise[ind[0]] > 0.1);
  assert.ok(c.noise[cell(sx + 1, 20)] > 0.05, 'đường có tiếng ồn');
  assert.equal(c.air[cell(sx - 10, 12)], 0, 'khu nhà ở xa công nghiệp không bị khói');
  const outlet = c.services.find((x) => x.type === 'outlet'), sh = [outlet.x, outlet.y];
  assert.ok(c.waterPol[cell(sh[0], sh[1])] > 0.5, 'nước quanh cống xả bị bẩn');
  assert.equal(c.dirtyWater, false);
  let spot = null;
  for (let d = 1; d < 6 && !spot; d++) for (const [dx, dy] of [[0, d], [0, -d], [d, 0], [-d, 0]]) if (S.canPlace(c, 'pump', sh[0] + dx, sh[1] + dy).ok) { spot = [sh[0] + dx, sh[1] + dy]; break; }
  assert.ok(spot);
  S.placeService(c, 'pump', ...spot);
  assert.equal(c.dirtyWater, true);
});

test('city: vay nợ và phá sản', () => {
  const c = town();
  const m = c.money;
  assert.ok(S.takeLoan(c, 0).ok);
  assert.equal(c.money, m + S.LOANS[0].amount);
  assert.equal(c.stats.exp.loans, Math.round(S.LOANS[0].amount * (1 + S.LOANS[0].rate) / S.LOANS[0].days));
  S.takeLoan(c, 1); S.takeLoan(c, 2);
  assert.equal(S.takeLoan(c, 0).ok, false, 'tối đa 3 khoản');
  run(c, 24 * S.LOANS[0].days + 2);
  assert.equal(c.loans.length, 2, 'trả xong khoản ngắn nhất');
  c.money = S.BANKRUPT_AT - 1;
  S.tick(c);
  assert.ok(c.over && c.events.some((e) => e.type === 'bankrupt'));
  const hour = c.hour; S.tick(c);
  assert.equal(c.hour, hour, 'phá sản thì thời gian dừng');
});

test('city: lưu rồi nạp lại giữ nguyên thành phố và người dân; đọc được bản lưu đời trước', () => {
  const c = town(), sx = c.start.x;
  road(c, sx, 34, sx + 10, 40, 'oneway', [sx + 8, 34]);
  S.addTransit(c, 'bus', [{ x: W(sx - 14), z: W(16) }, { x: W(sx), z: W(14) }, { x: W(sx + 14), z: W(26) }]);
  S.takeLoan(c, 2); c.tax.i = 12;
  run(c, 24 * 5);
  const o = JSON.parse(JSON.stringify(S.serialize(c)));
  const c2 = S.deserialize(o);
  assert.equal(c2.pp.count, c.pp.count);
  assert.equal(c2.stats.pop, c.stats.pop);
  assert.equal(c2.hour, c.hour);
  assert.deepEqual([c2.nodes.size, c2.edges.size, c2.lines.length, c2.transit.lines.length], [c.nodes.size, c.edges.size, c.lines.length, 1]);
  assert.deepEqual([...c2.road], [...c.road]);
  assert.deepEqual([...c2.level], [...c.level]);
  assert.deepEqual(c2.tax, c.tax);
  assert.equal(c2.loans.length, 1);
  assert.equal(c2.pstats.employed, c.pstats.employed);
  assert.equal(c2.resCount.reduce((n, v) => n + v, 0), c.resCount.reduce((n, v) => n + v, 0));
  run(c2, 30);
  assert.ok(c2.pp.count > 0);
  // bản lưu v2 (trước khi có người dân): giữ đường và nhà, dân tự dọn về
  const v2 = { ...o, v: 2, day: 50 };
  delete v2.people; delete v2.transit; delete v2.hour;
  const c3 = S.deserialize(v2);
  assert.equal(c3.edges.size, c.edges.size);
  assert.equal(c3.pp.count, 0);
  run(c3, 24);
  assert.ok(c3.pp.count > 0, 'dân dọn về lại');
  assert.throws(() => S.deserialize({ v: 1, n: S.N }));
  assert.throws(() => S.deserialize(null));
});

test('city: khu chuyên biệt chỉ mọc trên ô có tài nguyên, mở bằng điểm phát triển; nhà máy cần đúng loại nguyên liệu', () => {
  const c = town(), sx = c.start.x, farm = S.ZONE.FARM;
  for (let y = 16; y <= 22; y++) for (const x of [sx + 15, sx + 16]) c.res[cell(x, y)] = S.RAW.agri.id;
  for (let y = 26; y <= 30; y++) for (const x of [sx + 15, sx + 16]) c.res[cell(x, y)] = 0;
  assert.match(S.zoneRect(c, sx + 15, 16, sx + 16, 22, farm).reason, /Phát triển/, 'chưa mở trong cây công nghệ');
  assert.equal(S.unlockTech(c, 'fish').ok, false, 'ngư nghiệp cần nông nghiệp trước');
  assert.ok(S.unlockTech(c, 'farm').ok);
  assert.equal(c.points, S.START_POINTS - 1);
  assert.match(S.zoneRect(c, sx + 15, 26, sx + 16, 30, farm).reason, /nông sản/, 'ô không có đất màu mỡ');
  assert.ok(S.zoneRect(c, sx + 15, 16, sx + 16, 22, farm).count > 6);
  run(c, 24 * 6);
  const farms = [];
  for (let i = 0; i < S.N * S.N; i++) if (c.level[i]) { if (c.zone[i] === farm) farms.push(i); else if (c.zone[i] === 3) assert.equal(S.bizKind(c, i), 'factory'); }
  assert.ok(farms.length > 0, 'nông trại đã mọc');
  assert.equal(S.bizKind(c, farms[0]), 'raw');
  assert.ok(c.econ.exports > 0 || farms.some((i) => c.biz.sout[i] > 0), 'nông trại có sản lượng');
  assert.ok(S.RAW[S.factoryNeed(farms[0])], 'mỗi nhà máy gắn với một loại nguyên liệu');
});

test('city: module nâng công suất công trình; công trình biểu tượng mỗi thành phố một cái; lưu lại đủ', () => {
  const c = town(), sx = c.start.x;
  const tower = c.services.findIndex((s) => s.type === 'tower'), cap = c.stats.waterCap, exp = c.stats.expense;
  assert.equal(S.addModule(c, tower, 'tank').ok, false, 'chưa mở module');
  assert.ok(S.unlockTech(c, 'm_water').ok);
  assert.ok(S.addModule(c, tower, 'tank').ok);
  assert.equal(c.stats.waterCap, cap + 125);
  assert.ok(c.stats.expense > exp);
  assert.equal(S.addModule(c, tower, 'tank').ok, false, 'mỗi loại module chỉ gắn một lần');
  assert.equal(S.addModule(c, tower, 'wing').ok, false, 'module của trường không gắn vào tháp nước');
  assert.equal(S.techState(c, 'lm1'), 'rank', 'tượng đài cần mốc dân số đầu tiên');
  c.milestone = 1;
  assert.ok(S.unlockTech(c, 'lm1').ok);
  assert.equal(c.points, 0);
  assert.equal(S.unlockTech(c, 'forest').reason, 'Không đủ điểm phát triển');
  assert.ok(S.placeService(c, 'monument', sx + 18, 20).ok);
  assert.equal(c.bonus.happy, 2);
  assert.match(S.canPlace(c, 'monument', sx + 22, 20).reason, /chỉ có một/);
  const c2 = S.deserialize(JSON.parse(JSON.stringify(S.serialize(c))));
  assert.deepEqual([[...c2.tech].sort(), c2.points, c2.services[tower].mods, c2.stats.waterCap, c2.bonus.happy], [['lm1', 'm_water'], 0, ['tank'], cap + 125, 2]);
});

test('city: đất khoá lúc đầu, mua ô kề bên để mở rộng; bản đồ mới có núi; bản lưu cũ mở sẵn cả bản đồ', () => {
  const c = newCity(12345), sx = c.start.x, owned = () => c.owned.reduce((n, v) => n + v, 0);
  assert.equal(owned(), 9);
  assert.ok(c.steep.some((v) => v) && Math.max(...c.hv) > 25, 'có núi dốc');
  for (const d of Object.values(S.RAW)) assert.ok(c.res.includes(d.id), `bản đồ có ${d.name}`);
  assert.ok(road(c, sx, 7, sx, 30).ok);
  assert.match(road(c, sx, 30, sx, 40).reason, /chưa mua/);
  assert.match(S.canPlace(c, 'wind', 3, 80).reason, /chưa mua/);
  assert.equal(S.zoneRect(c, 0, 0, S.N - 1, S.N - 1, S.ZONE.R).count, S.zoneRect(c, 0, 0, S.N - 1, S.N - 1, 0).count, 'quy hoạch không lọt ra ngoài đất của mình');
  const below = S.landOf(sx, 40), far = S.landOf(3, 90), money = c.money, price = S.landPrice(c, below), farPrice = S.landPrice(c, far);
  assert.match(S.buyLand(c, far).reason, /kề/);
  assert.ok(S.buyLand(c, below).ok);
  assert.deepEqual([owned(), c.money], [10, money - price]);
  assert.ok(S.landPrice(c, far) > farPrice, 'càng có nhiều đất càng đắt');
  assert.ok(road(c, sx, 30, sx, 40).ok);
  const o = JSON.parse(JSON.stringify(S.serialize(c)));
  assert.equal(S.deserialize(o).owned.reduce((n, v) => n + v, 0), 10);
  // bản lưu v3: chưa có mua đất, cây công nghệ, núi
  const v3 = { ...o, v: 3, milestone: 2 };
  for (const k of ['owned', 'tech', 'points', 'tgen']) delete v3[k];
  const c3 = S.deserialize(v3);
  assert.ok(c3.owned.every((v) => v === 1) && c3.own.every((v) => v === 1));
  assert.deepEqual([c3.tgen, c3.steep.some((v) => v), c3.points], [1, false, S.START_POINTS + 7]);
  assert.equal(c3.edges.size, c.edges.size);
});

/** Đặt công trình t vào chỗ hợp lệ đầu tiên quanh trung tâm thị trấn. */
const put = (c, t) => { const sx = c.start.x; for (let y = 8; y < 45; y++) for (let x = sx - 25; x < sx + 25; x++) if (S.canPlace(c, t, x, y).ok) return S.placeService(c, t, x, y); return null; };

test('city: cao tốc và cầu vượt bắc qua đường dưới không tạo nút giao; vòng xuyến, biển dừng; lưu lại đủ', () => {
  const c = openCity(12345), sx = c.start.x;
  c.money = 1e7;
  road(c, sx, 7, sx, 40); road(c, sx - 15, 25, sx + 15, 25);
  assert.equal(road(c, sx - 20, 15, sx + 20, 15, 'highway').ok, false, 'cao tốc khoá theo mốc dân số');
  c.milestone = 3;
  const nodes = c.nodes.size;
  assert.ok(road(c, sx - 20, 15, sx + 20, 15, 'highway').ok);
  assert.equal(c.nodes.size - nodes, 2, 'chỉ thêm hai đầu, không cắt ngang đường dưới');
  const hw = [...c.edges.values()].find((e) => e.type === 'highway');
  assert.equal(S.liftAt(c, hw, hw.len / 2), S.LIFT, 'giữa cao tốc nằm trên cao');
  assert.ok(S.liftAt(c, hw, 1) < 1, 'đầu cụt dốc xuống mặt đất');
  assert.ok(!S.upgradeRoad(c, hw.id, 'small').ok, 'không đổi đường trên cao thành đường đất');
  assert.equal(c.acc[S.cellOf(hw.pts[hw.pts.length >> 1]) + S.cellOf(hw.pts[(hw.pts.length >> 1) + 1] + S.T) * S.N], 0, 'không có ô quy hoạch hai bên cao tốc');
  // vòng xuyến ở ngã tư
  const center = S.nodeAt(c, W(sx), W(25));
  assert.ok(S.makeRoundabout(c, center.id).ok);
  assert.ok(!c.nodes.has(center.id));
  const ring = [...c.nodes.values()].filter((n) => n.rb);
  assert.equal(ring.length, 4);
  assert.ok(ring.every((n) => !c.traffic.signals.has(n.id)), 'vòng xuyến không có đèn');
  assert.equal(c.road[S.cellOf(W(sx)) + S.cellOf(W(25)) * S.N], 1, 'đảo giữa không mọc nhà');
  const a = S.cellPos(c, cell(sx, 20)), b = S.cellPos(c, cell(sx + 8, 26));
  assert.ok(S.findPath(c, a, b), 'đi xuyên vòng xuyến được');
  // biển dừng ở ngã ba
  road(c, sx - 15, 33, sx, 33);
  const t3 = S.nodeAt(c, W(sx), W(33));
  assert.equal(c.adj.get(t3.id).length, 3);
  assert.equal(S.setJunction(c, t3.id, 1).ok, true);
  assert.ok(c.traffic.signals.has(t3.id), 'ép có đèn ở ngã ba đường nhỏ');
  S.setJunction(c, t3.id, 2);
  assert.ok(!c.traffic.signals.has(t3.id));
  const c2 = S.deserialize(JSON.parse(JSON.stringify(S.serialize(c))));
  assert.equal(c2.rings.length, 1);
  assert.equal([...c2.nodes.values()].filter((n) => n.rb).length, 4);
  assert.equal(c2.nodes.get(t3.id).ctl, 2);
  assert.equal([...c2.edges.values()].filter((e) => e.type === 'highway').length, 1);
});

test('city: khu mới — nhà phố, liền kề, dưỡng lão, ký túc xá, giải trí, văn phòng; nghĩa trang, bệnh viện, viện nghiên cứu', () => {
  const c = town(), sx = c.start.x;
  c.money = 5e6; c.milestone = 4;
  S.zoneRect(c, sx - 13, 12, sx + 13, 13, 14); S.zoneRect(c, sx - 13, 15, sx + 13, 16, 13);
  S.zoneRect(c, sx - 13, 22, sx - 1, 23, 15); S.zoneRect(c, sx + 1, 22, sx + 13, 23, 17); S.zoneRect(c, sx + 1, 35, sx + 13, 36, 16);
  for (let k = 0; k < 3; k++) S.placeService(c, 'solar', sx + (k % 2 ? 3 : -3), 27 + k * 2);
  for (const t of ['university', 'cemetery', 'hospital', 'research', 'tower']) assert.ok(put(c, t), t);
  run(c, 24 * 25);
  const built = new Set();
  for (let i = 0; i < S.N * S.N; i++) if (c.level[i]) built.add(c.zone[i]);
  for (const z of [13, 14, 15, 16, 17]) assert.ok(built.has(z), `khu ${S.ZDEF[z].name} đã mọc nhà`);
  let seniors = 0, students = 0;
  for (let id = 0; id < c.pp.n; id++) {
    if (!c.pp.alive[id] || c.pp.home[id] < 0) continue;
    const who = S.ZDEF[c.zone[c.pp.home[id]]].who;
    if (who === 'senior') { seniors++; assert.ok(c.pp.age[id] >= 65, 'nhà dưỡng lão chỉ có người già'); }
    if (who === 'student') { students++; assert.ok(c.pp.age[id] < 26, 'ký túc xá chỉ có sinh viên'); }
  }
  assert.ok(seniors > 0 && students > 0);
  assert.ok(c.econ.died > 0);
  assert.ok(c.services.find((s) => s.type === 'cemetery').fill > 0, 'xe tang đã đưa người mất về nghĩa trang');
  assert.ok(c.points > 3 || c.research > 0, 'viện nghiên cứu làm ra điểm phát triển');
  let fun = 0;
  for (let i = 0; i < S.N * S.N; i++) if (c.level[i] && c.zone[i] === 17) fun += c.biz.money[i];
  assert.ok(fun > 0, 'quán ăn, chỗ vui chơi có khách');
  const c2 = S.deserialize(JSON.parse(JSON.stringify(S.serialize(c))));
  assert.equal(c2.services.find((s) => s.type === 'cemetery').fill, c.services.find((s) => s.type === 'cemetery').fill);
});

test('city: tàu điện chạy trên đường; số xe buýt + tàu điện giới hạn theo bến xe', () => {
  const c = town(), sx = c.start.x;
  const stops = [{ x: W(sx - 14), z: W(16) }, { x: W(sx), z: W(14) }, { x: W(sx + 14), z: W(26) }];
  assert.equal(S.planTransit(c, 'tram', stops).ok, false, 'tàu điện khoá theo mốc dân số');
  c.milestone = 3;
  const tram = S.addTransit(c, 'tram', stops);
  assert.ok(tram.ok && !tram.line.broken);
  assert.equal(c.traffic.vehicles.filter((v) => v.kind === 'tram').length, 1);
  assert.ok(S.setVehicles(c, tram.line.id, 4).ok);
  assert.equal(S.setVehicles(c, tram.line.id, 5).ok, false, 'chưa có bến xe thì tối đa 4 xe');
  assert.ok(put(c, 'depot'));
  assert.ok(S.setVehicles(c, tram.line.id, 8).ok);
  run(c, 24 * 4);
  assert.ok(c.transit.income > 0);
});

test('city: tai nạn chắn đường tới khi công an và xe cứu hộ tới dọn; mặt đường mòn; thời tiết lưu lại', () => {
  const c = town();
  c.money = 5e6; c.milestone = 3;
  run(c, 24 * 3);
  const worn = () => [...c.edges.values()].reduce((n, e) => n + (e.wear || 0), 0), w0 = worn();
  assert.ok(w0 > 0, 'đường mòn dần theo lượng xe');
  assert.ok(put(c, 'police')); assert.ok(put(c, 'roadmaint'));
  run(c, 3);
  assert.ok(worn() < w0, 'trạm bảo trì sửa đường trong bán kính');
  const v = c.traffic.vehicles.find((o) => (o.kind === 'car' || o.kind === 'moto' || o.kind === 'truck') && o.v > 2);
  assert.ok(v, 'có xe đang chạy');
  const acc = S.crash(c, v);
  assert.ok(v.wreck && c.traffic.vehicles.includes(v), 'xác xe nằm lại trên đường');
  // xe công an có thể đang bận việc khác (vụ cướp, tuần tra): khi đó hiện trường chờ, lượt sau gửi lại
  let t = 0;
  while (!(acc.sentCops && acc.sentClean) && t < 120) { S.advance(c, 0.5); t += 0.5; }
  assert.ok(acc.sentCops && acc.sentClean, 'gửi xe công an và xe cứu hộ');
  t = 0;
  while (c.inc.accidents.includes(acc) && t < 120) { S.advance(c, 0.5); t += 0.5; }
  assert.ok(!c.inc.accidents.includes(acc), 'hiện trường đã được dọn');
  assert.ok(acc.cops && acc.clean);
  assert.ok(!c.traffic.vehicles.includes(v));
  c.inc.weather = 'rain'; c.inc.wUntil = c.hour + 10;
  assert.ok(S.crashFactor(c) > 2, 'trời mưa dễ tai nạn hơn');
  const c2 = S.deserialize(JSON.parse(JSON.stringify(S.serialize(c))));
  assert.equal(c2.inc.weather, 'rain');
});

test('city: thiên tai — lốc xoáy phá nhà, hầm trú ẩn giảm thương vong; cháy rừng lan, tháp canh lửa kìm lại; cướp bị công an bắt', () => {
  const c = town();
  c.money = 5e6; c.milestone = 4;
  run(c, 24 * 4);
  c.events.length = 0;
  assert.ok(S.triggerDisaster(c, 'tornado').ok);
  assert.ok(c.inc.tornado, 'không có trạm cảnh báo thì lốc tới ngay');
  const t = c.inc.tornado; t.x = W(c.start.x - 30); t.z = W(24); t.dx = 1; t.dz = 0;
  for (let k = 0; k < 400 && c.inc.tornado; k++) S.advance(c, 0.25);
  assert.equal(c.inc.tornado, null, 'lốc đã đi qua');
  assert.ok(c.events.some((e) => e.type === 'tornadoHit'), 'nhà trên đường lốc bị phá');
  // có trạm cảnh báo: báo trước một giờ
  assert.ok(put(c, 'ews'));
  assert.ok(S.triggerDisaster(c, 'tornado').ok);
  assert.ok(c.inc.warn && !c.inc.tornado);
  run(c, 2);
  assert.ok(c.inc.tornado && c.inc.tornado.warned);
  c.inc.tornado = null;
  // cháy rừng: khô hạn thì lan, tháp canh lửa làm lửa tắt nhanh
  const burn = (watch) => {
    const d = openCity(777);
    d.inc.weather = 'dry'; d.inc.wUntil = 1e9;
    let seed = -1;
    for (let i = 0; i < S.N * S.N && seed < 0; i++) { const x = i % S.N, y = (i / S.N) | 0; if (x > 3 && y > 3 && x < S.N - 4 && y < S.N - 4 && [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => d.tree[S.idx(x + dx, y + dy)]))) seed = i; }
    if (watch) d.cover.watch.fill(1);
    for (const j of [seed, seed + 1, seed - 1, seed + S.N]) d.inc.wild[j] = 6;
    run(d, 24);
    return d.inc.total.burned + S.wildCount(d);
  };
  assert.ok(burn(false) > burn(true), 'tháp canh lửa kìm đám cháy rừng');
  // cướp: có công an thì bị bắt
  assert.ok(put(c, 'police'));
  for (let k = 0; k < 24 * 3 && !c.inc.total.caught; k++) { c.crime.fill(0.6); S.tick(c); }
  assert.ok(c.inc.total.robberies > 0 && c.inc.total.caught > 0, 'xe công an tới bắt được kẻ cướp');
});

test('city: xe đủ kiểu — xe con, xe máy, xe đạp; xe tải chọn hình theo hàng chở; container chạy chậm, dài hơn', () => {
  assert.equal(S.pickLook('truck', { t: 'cargo', kind: 'oil' }, 0.5), 'tanker');
  assert.equal(S.pickLook('truck', { t: 'cargo', kind: 'wood' }, 0.5), 'logtruck');
  assert.equal(S.pickLook('truck', { t: 'cargo', kind: 'goods', imp: true }, 0.1), 'container');
  assert.equal(S.pickLook('truck', { t: 'export', kind: 'goods' }, 0.1), 'container');
  assert.equal(S.pickLook('ambulance', null, 0.3), 'ambulance');
  const cars = new Set(), motos = new Set();
  for (let k = 0; k < 200; k++) { cars.add(S.pickLook('car', null, k / 200)); motos.add(S.pickLook('moto', null, k / 200)); }
  assert.ok(cars.size >= 5 && motos.size >= 4, 'nhiều kiểu xe con, xe máy');
  assert.ok(S.LOOKS.container.len > S.LOOKS.boxtruck.len && S.LOOKS.container.vmul < 1 && S.LOOKS.bicycle.vmul < 0.7);
  const c = town();
  run(c, 24 * 3);
  const looks = new Set(c.traffic.vehicles.map((v) => v.look));
  assert.ok(looks.size >= 4, `trên đường có nhiều kiểu xe: ${[...looks].join(', ')}`);
  for (const v of c.traffic.vehicles) if (S.LOOKS[v.look]) assert.equal(v.len, S.LOOKS[v.look].len);
});

test('city: di chuyển công trình và nút đường', () => {
  const c = town(), sx = c.start.x;
  assert.ok(S.placeService(c, 'park', sx + 6, 18).ok);
  const k = c.services.length - 1, uid = c.services[k].uid, m = c.money;
  assert.equal(S.moveService(c, k, sx + 6, 18).reason, 'Vẫn ở chỗ cũ');
  assert.equal(S.moveService(c, k, sx, 20).ok, false, 'không đặt lên đường');
  assert.ok(S.moveService(c, k, sx + 8, 19, true).ok, 'xem trước');
  assert.equal(c.money, m, 'xem trước không mất tiền');
  const r = S.moveService(c, k, sx + 8, 19);
  assert.ok(r.ok, r.reason);
  assert.equal(c.money, m - S.moveFee('park'));
  assert.equal(c.services[k].uid, uid);
  assert.equal(c.occ[cell(sx + 8, 19)], k + 1);
  assert.equal(c.occ[cell(sx + 6, 18)], 0, 'chỗ cũ trống');
  // nút đường
  const entry = [...c.nodes.values()].find((o) => o.z < -S.HALF + 5);
  assert.equal(S.moveNode(c, entry.id, entry.x + 20, entry.z).reason, 'Không dời được cửa ngõ ra ngoài thành phố');
  const corner = S.nodeAt(c, W(sx + 14), W(34), 2);
  assert.ok(corner);
  assert.equal(S.moveNode(c, corner.id, W(sx - 20), W(30)).ok, false, 'kéo cắt ngang đường khác thì từ chối');
  const edges = c.edges.size, len = [...c.adj.get(corner.id)].map((id) => c.edges.get(id).len).reduce((a, b) => a + b, 0);
  const ok = S.moveNode(c, corner.id, W(sx + 16), W(36));
  assert.ok(ok.ok, ok.reason);
  assert.equal(c.edges.size, edges);
  assert.ok([...c.adj.get(corner.id)].map((id) => c.edges.get(id).len).reduce((a, b) => a + b, 0) > len, 'đường nối vào dài ra');
  assert.ok(S.findPath(c, S.cellPos(c, cell(sx + 5, 33)), S.cellPos(c, cell(sx + 13, 25))), 'vẫn đi được qua nút đã dời');
});

test('city: gateway phục vụ /city và không cho thoát khỏi thư mục', () => {
  assert.equal(resolveStatic('/city', ROOT), path.join(ROOT, 'city', 'index.html'));
  assert.equal(resolveStatic('/city/js/sim.js', ROOT), path.join(ROOT, 'city', 'js', 'sim.js'));
  assert.equal(resolveStatic('/city/../.env', ROOT), null);
  assert.equal(resolveStatic('/city/%2e%2e/config.json', ROOT), null);
});

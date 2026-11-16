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
  assert.equal(c.traffic.stats.stuck, 0, 'thị trấn nhỏ không được kẹt cứng');
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
  const imp = c.econ.imports;
  run(c, 24 * 2);
  assert.equal(c.econ.imports, imp, 'không còn đường nhập hàng');
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

test('city: gateway phục vụ /city và không cho thoát khỏi thư mục', () => {
  assert.equal(resolveStatic('/city', ROOT), path.join(ROOT, 'city', 'index.html'));
  assert.equal(resolveStatic('/city/js/sim.js', ROOT), path.join(ROOT, 'city', 'js', 'sim.js'));
  assert.equal(resolveStatic('/city/../.env', ROOT), null);
  assert.equal(resolveStatic('/city/%2e%2e/config.json', ROOT), null);
});

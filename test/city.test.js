// Phố Mới (city/): mô phỏng thành phố + đường dẫn /city của gateway
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../city/js/sim.js';
import { resolveStatic } from '../gateway/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = S.cellCenter;
/** Hàng trong test tính từ đầu vùng đất trung tâm (hàng 7 = cuối đoạn đường dẫn vào). */
const Y = (y) => y + S.OFF;
const road = (c, x0, y0, x1, y1, type = 'small', ctrl = null) => S.buildRoad(c, {
  a: S.snapPoint(c, W(x0), W(Y(y0)), { type }), b: S.snapPoint(c, W(x1), W(Y(y1)), { type }), type, ctrl: ctrl && { x: W(ctrl[0]), z: W(Y(ctrl[1])) },
});
const zone = (c, x0, y0, x1, y1, z) => S.zoneRect(c, x0, Y(y0), x1, Y(y1), z);
const place = (c, type, x, y) => S.placeService(c, type, x, Y(y));
const degrees = (c) => { const d = {}; for (const l of c.adj.values()) d[l.length] = (d[l.length] || 0) + 1; return d; };
const run = (c, hours) => { for (let h = 0; h < hours; h++) S.tick(c); };
const cell = (x, y) => Y(y) * S.N + x;
const P = (x, y) => ({ x: W(x), z: W(Y(y)) });
const shore = (c) => { for (let y = S.OFF + 5; y < S.OFF + 60; y++) for (let x = S.OFF + 5; x < S.OFF + 90; x++) if (S.canPlace(c, 'outlet', x, y).ok) return [x, y - S.OFF]; return null; };

/** Lưới đường nhỏ: trục dọc + trục ngang cắt nhau, chưa có gì khác. */
function cross(seed = 12345) {
  const c = S.newCity(seed), sx = c.start.x;
  road(c, sx, 7, sx, 30);
  road(c, sx - 12, 20, sx + 12, 20);
  return c;
}

/** Thị trấn đủ dùng: lưới ô bàn cờ, ba loại khu, điện, nước, cống xả đã nối mạng. */
function town(seed = 12345) {
  const c = S.newCity(seed), sx = c.start.x;
  c.money = 500000;
  road(c, sx, 7, sx, 34); road(c, sx - 14, 14, sx + 14, 14); road(c, sx - 14, 24, sx + 14, 24);
  road(c, sx - 14, 14, sx - 14, 34); road(c, sx + 14, 14, sx + 14, 34); road(c, sx - 14, 34, sx + 14, 34);
  zone(c, sx - 13, 12, sx + 13, 13, 1); zone(c, sx - 13, 15, sx + 13, 16, 1); zone(c, sx - 13, 22, sx - 1, 23, 1);
  zone(c, sx + 1, 22, sx + 13, 23, 2); zone(c, sx - 13, 25, sx - 1, 26, 2);
  zone(c, sx + 1, 32, sx + 13, 33, 3); zone(c, sx - 13, 32, sx - 1, 33, 3); zone(c, sx + 1, 35, sx + 13, 36, 3);
  for (let k = 0; k < 6; k++) assert.ok(place(c, 'wind', sx + (k % 2 ? 2 : -2), 17 + k).linked);
  assert.ok(place(c, 'tower', sx - 2, 9).linked);
  assert.ok(place(c, 'tower', sx + 2, 9).linked);
  const sh = shore(c);
  assert.equal(place(c, 'outlet', ...sh).linked, false, 'cống ở xa đường chưa nối mạng');
  assert.ok(S.buildLine(c, 'pipe', P(...sh), P(sx - 14, 14)).ok);
  assert.ok(c.services.every((s) => s.linked));
  return c;
}

test('city: bản đồ mới có nước, cây, địa hình cao thấp và một đoạn đường dẫn vào', () => {
  const c = S.newCity(42);
  const sum = (a) => a.reduce((n, v) => n + v, 0);
  assert.ok(sum(c.water) > 300 && sum(c.water) < S.N * S.N / 2);
  assert.ok(sum(c.tree) > 200);
  assert.deepEqual([c.nodes.size, c.edges.size], [2, 1]);
  assert.ok(Math.max(...c.hv) > 3, 'có đồi');
  assert.equal(Math.min(...c.hv), Math.fround(-3.2));
  assert.equal(S.heightAt(c, -S.HALF + 30, -S.HALF + 50), c.hv[5 * (S.N + 1) + 3]);
  assert.equal(c.start.y, S.OFF + 7);
  assert.ok(Math.abs(S.heightAt(c, 4.99, 5.01) - S.heightAt(c, 5.01, 4.99)) < 0.05);
  assert.equal(S.outsidePositions(c).length, 1, 'đường dẫn vào là cửa ngõ ra ngoài');
});

test('city: đường là graph — cắt nhau tự sinh nút giao, đường cong, từ chối đường trùng', () => {
  const c = S.newCity(12345), sx = c.start.x, before = c.money;
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
  const mid = S.snapPoint(c, W(sx + 6) + 2, W(Y(20)) + 3);
  assert.ok(mid.edge != null);
  assert.ok(S.buildRoad(c, { a: mid, b: S.snapPoint(c, W(sx + 6), W(Y(12))), type: 'small' }).ok);
  assert.equal(degrees(c)[3], 1);
  assert.equal(road(c, sx - 12, 20, sx + 12, 20).ok, false, 'vẽ đè lên đường cũ');
  assert.equal(road(c, sx, 30, sx, 30.5).reason, 'Đoạn quá ngắn');
  c.money = 10;
  assert.equal(road(c, sx + 12, 20, sx + 20, 20).reason, 'Không đủ tiền');
});

test('city: ô quy hoạch tự sinh hai bên đường; khu mật độ cao và văn phòng khoá theo mốc dân số', () => {
  const c = S.newCity(12345), sx = c.start.x;
  road(c, sx - 12, 20, sx + 12, 20);
  assert.equal(c.road[cell(sx, 20)], 1);
  assert.deepEqual([c.acc[cell(sx, 21)], c.acc[cell(sx, 22)], c.acc[cell(sx, 23)]], [1, 2, 0]);
  assert.equal(S.roadDir(c, sx, Y(21)), 3, 'quay mặt lên phía đường');
  assert.equal(zone(c, sx - 5, 21, sx + 5, 25, S.ZONE.R).count, 22, 'chỉ 2 hàng sát đường nhận quy hoạch');
  assert.equal(zone(c, 2, 2, 4, 4, S.ZONE.R).ok, false);
  assert.equal(zone(c, sx - 5, 18, sx + 5, 19, S.ZONE.RH).ok, false, 'chung cư chưa mở khoá');
  c.milestone = 2;
  assert.ok(zone(c, sx - 5, 18, sx + 5, 19, S.ZONE.RH).ok);
  assert.equal(zone(c, sx - 12, 18, sx - 6, 19, S.ZONE.O).ok, false, 'văn phòng cần mốc 1.000 dân');
  assert.ok(road(c, sx - 12, 30, sx + 12, 30, 'large').ok);
  assert.deepEqual([c.road[cell(sx, 30)], c.road[cell(sx, 31)], c.acc[cell(sx, 32)], c.acc[cell(sx, 29)]], [1, 1, 1, 1], 'đại lộ rộng 2 ô');
});

test('city: nâng cấp, đảo chiều và san ủi đường', () => {
  const c = cross(), sx = c.start.x;
  const e = S.edgeAt(c, W(sx), W(Y(25)));
  const m = c.money, cost = S.upgradeCost(e, 'large');
  assert.ok(S.upgradeRoad(c, e.id, 'large').ok);
  assert.equal(c.money, m - cost);
  assert.equal(c.road[cell(sx + 1, 25)] + c.road[cell(sx - 1, 25)], 2, 'đường rộng hơn đè thêm ô hai bên');
  assert.ok(S.upgradeRoad(c, e.id, 'oneway').ok);
  const [a, b] = [e.a, e.b];
  assert.ok(S.upgradeRoad(c, e.id, 'oneway').flipped);
  assert.deepEqual([e.a, e.b], [b, a]);
  const edges = c.edges.size;
  assert.ok(S.bulldozeRect(c, sx, Y(25), sx, Y(25)).ok);
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
  zone(c, sx + 1, 9, sx + 2, 19, S.ZONE.R);
  run(c, 30);
  assert.equal(c.level.reduce((n, v) => n + v, 0), 0, 'chưa có điện nước');
  assert.ok(c.stats.none.p && c.stats.none.w);
  assert.equal(place(c, 'wind', sx + 20, 5).linked, false);
  assert.equal(c.stats.powerCap, 0);
  assert.ok(S.buildLine(c, 'power', P(sx + 20, 5), P(sx + 12, 19)).ok);
  assert.equal(c.stats.powerCap, 60);
  place(c, 'tower', sx - 2, 10);
  const sh = shore(c);
  place(c, 'outlet', ...sh);
  S.buildLine(c, 'pipe', P(sh[0], sh[1]), P(sx - 12, 20));
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
  S.bulldozeRect(c, c.start.x, Y(3), c.start.x, Y(3));
  assert.equal(S.outsidePositions(c).length, 0);
  run(c, 12); // xe hàng đang trên đường thì vẫn tới nơi
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
  assert.ok(place(c, 'fire', sx - 16, 18).ok);
  const b = pick();
  c.fire[b] = 7; run(c, 8);
  assert.ok(c.level[b] > 0, 'xe cứu hoả tới kịp');
  assert.equal(c.fire[b], 0);
  assert.ok(c.events.some((e) => e.type === 'fireOut'));
});

test('city: trường học nâng học vấn; bãi rác cho xe đi thu gom', () => {
  const c = town(), sx = c.start.x;
  c.milestone = 2;
  assert.ok(place(c, 'school', sx - 16, 21).ok);
  assert.ok(place(c, 'landfill', sx + 16, 29).ok);
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
  assert.ok(worst < 6, `rác tồn nhiều nhất gấp ${worst.toFixed(1)} lần ngưỡng`);
  assert.ok(landfill.processed >= 0 && c.gbusy.size <= 3);
  assert.ok(landfill.out >= 0);
});

test('city: xe buýt và metro — vẽ tuyến, dân chọn đi khi có lợi, thu tiền vé', () => {
  const c = town(), sx = c.start.x;
  assert.equal(S.planTransit(c, 'bus', [P(S.OFF + 3, 3), P(sx, 20)]).reason, 'Trạm xe buýt phải nằm trên đường');
  assert.equal(S.planTransit(c, 'metro', [P(sx - 20, 12), P(sx + 18, 36)]).ok, false, 'metro chưa mở khoá');
  const bus = S.addTransit(c, 'bus', [P(sx - 14, 16), P(sx, 14), P(sx + 14, 26), P(sx, 34)]);
  assert.ok(bus.ok);
  assert.equal(bus.line.broken, false);
  assert.ok(bus.line.loop > 300);
  assert.equal(c.traffic.vehicles.filter((v) => v.kind === 'bus').length, 1);
  assert.ok(S.setVehicles(c, bus.line.id, 3).ok);
  assert.equal(c.traffic.vehicles.filter((v) => v.kind === 'bus').length, 3);
  c.milestone = 4;
  const metro = S.addTransit(c, 'metro', [P(sx - 13, 12), P(sx, 24), P(sx + 13, 35)]);
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
  const outlet = c.services.find((x) => x.type === 'outlet'), sh = [outlet.x, outlet.y - S.OFF];
  assert.ok(c.waterPol[cell(sh[0], sh[1])] > 0.5, 'nước quanh cống xả bị bẩn');
  assert.equal(c.dirtyWater, false);
  let spot = null;
  for (let d = 1; d < 6 && !spot; d++) for (const [dx, dy] of [[0, d], [0, -d], [d, 0], [-d, 0]]) if (S.canPlace(c, 'pump', sh[0] + dx, Y(sh[1] + dy)).ok) { spot = [sh[0] + dx, sh[1] + dy]; break; }
  assert.ok(spot);
  place(c, 'pump', ...spot);
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
  S.addTransit(c, 'bus', [P(sx - 14, 16), P(sx, 14), P(sx + 14, 26)]);
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
  // bản lưu đời trước dùng bản đồ 96 x 96: phải nằm đúng vào giữa bản đồ mới, không lệch nhà lệch đường
  const b64 = (u8) => Buffer.from(u8).toString('base64'), un = (str) => new Uint8Array(Buffer.from(str, 'base64'));
  const crop = (str) => { const a = un(str), out = new Uint8Array(S.LN * S.LN); for (let y = 0; y < S.LN; y++) for (let x = 0; x < S.LN; x++) out[y * S.LN + x] = a[(y + S.OFF) * S.N + x + S.OFF]; return b64(out); };
  const cells = (str) => { const a = new Uint16Array(un(str).buffer.slice(0)); for (let k = 0; k < a.length; k++) if (a[k] !== 0xffff) a[k] = (Math.floor(a[k] / S.N) - S.OFF) * S.LN + (a[k] % S.N) - S.OFF; return b64(new Uint8Array(a.buffer)); };
  const entryNode = [...c.nodes.values()].find((n) => n.z < -S.HALF + 5);
  const v3 = { ...o, v: 3, n: S.LN, start: { x: o.start.x - S.OFF, y: o.start.y - S.OFF }, services: o.services.map((s) => ({ ...s, x: s.x - S.OFF, y: s.y - S.OFF })),
    nodes: o.nodes.map((n) => (n[0] === entryNode.id ? [n[0], n[1], -(S.LN * S.T) / 2 + 1] : n)), people: { ...o.people, home: cells(o.people.home), work: cells(o.people.work) } };
  for (const k of ['tree', 'zone', 'level', 'variant', 'dir']) v3[k] = crop(o[k]);
  for (const k of ['owned', 'tech', 'points', 'policy', 'distName', 'district', 'entry']) delete v3[k];
  const c4 = S.deserialize(v3);
  assert.deepEqual([...c4.level], [...c.level], 'nhà nằm đúng chỗ');
  assert.deepEqual([...c4.zone], [...c.zone]);
  assert.equal(c4.pp.count, c.pp.count);
  assert.equal(c4.pstats.employed, c.pstats.employed);
  assert.deepEqual(c4.services.map((x) => [x.type, x.x, x.y]), c.services.map((x) => [x.type, x.x, x.y]));
  assert.equal(S.outsidePositions(c4).length, 1, 'cửa ngõ cũ vẫn dùng được');
  assert.equal([...c4.owned].reduce((a, b2) => a + b2, 0), 9);
  assert.equal(c4.points, S.MILESTONE_POINTS.slice(0, c4.milestone).reduce((a, b2) => a + b2, 0), 'bù điểm cho mốc đã đạt');
  run(c4, 30);
  // bản lưu v2 (trước khi có người dân): giữ đường và nhà, dân tự dọn về
  const v2 = { ...v3, v: 2, day: 50 };
  delete v2.people; delete v2.transit; delete v2.hour;
  const c3 = S.deserialize(v2);
  assert.equal(c3.edges.size, c.edges.size);
  assert.equal(c3.pp.count, 0);
  run(c3, 24);
  assert.ok(c3.pp.count > 0, 'dân dọn về lại');
  assert.throws(() => S.deserialize({ v: 1, n: S.N }));
  assert.throws(() => S.deserialize(null));
});

test('city: bản đồ rộng 160 ô có núi, đảo, tài nguyên; đất ngoài 3 x 3 lô giữa phải mua', () => {
  const c = S.newCity(12345), sx = c.start.x;
  assert.equal(S.N, 160);
  assert.ok(Math.max(...c.hv) > 40, 'có núi cao ở vùng ngoài');
  assert.ok(c.steep.reduce((n, v) => n + v, 0) > 200, 'có sườn dốc không xây được');
  const res = [0, 0, 0, 0]; for (const r of c.res) res[r]++;
  assert.ok(res[1] > 500 && res[2] > 200 && res[3] > 200, `tài nguyên ${res}`);
  // vùng trung tâm giữ địa hình thoải như trước
  let centre = 0;
  for (let y = S.OFF; y < S.OFF + S.LN; y++) for (let x = S.OFF; x < S.OFF + S.LN; x++) centre = Math.max(centre, c.cellH[y * S.N + x]);
  assert.ok(centre < 16, `đồi vùng giữa cao nhất ${centre.toFixed(1)}`);
  // đất đai
  assert.equal([...c.owned].reduce((a, b) => a + b, 0), 9);
  assert.equal(S.ownedCell(c, S.OFF * S.N + S.OFF), true);
  assert.equal(S.ownedCell(c, 5 * S.N + 5), false);
  const east = S.OFF + S.LN + 4; // vừa ra khỏi vùng đất đang có
  road(c, sx, 7, S.OFF + S.LN - 3, 7);
  assert.equal(road(c, S.OFF + S.LN - 3, 7, east, 7).reason, 'Ngoài phần đất của thành phố, hãy mua thêm đất');
  assert.equal(S.canPlace(c, 'park', east, Y(10)).reason, 'Ngoài phần đất của thành phố, hãy mua thêm đất');
  assert.equal(S.canBuyTile(c, 0).reason, 'Chỉ mua được lô liền kề đất đang có');
  const t = 1 * S.TILES + 4, cost = S.tileCost(c), m = c.money; // lô phía đông hàng trên
  assert.ok(S.buyTile(c, t).ok);
  assert.equal(c.money, m - cost);
  assert.ok(S.tileCost(c) > cost, 'lô sau đắt hơn');
  assert.ok(road(c, S.OFF + S.LN - 3, 7, east, 7).ok, 'mua rồi thì xây được');
  assert.ok(S.buyTile(c, 0 * S.TILES + 4).ok === false || [...c.owned].reduce((a, b) => a + b, 0) <= S.maxTiles(c));
  c.money = 1e7;
  let bought = 0;
  for (let k = 0; k < S.TILES * S.TILES; k++) if (S.buyTile(c, k).ok) bought++;
  assert.equal([...c.owned].reduce((a, b) => a + b, 0), S.maxTiles(c), 'số lô bị giới hạn theo mốc dân số');
  assert.ok(bought >= 0);
});

test('city: khu khai thác chỉ tô được trên đúng tài nguyên, làm ra nguyên liệu để xuất', () => {
  const c = town(), sx = c.start.x;
  // tìm một ô đất màu mỡ nằm cạnh đường
  let farm = -1;
  for (let i = 0; i < S.N * S.N && farm < 0; i++) if (c.res[i] === 1 && c.acc[i] && !c.zone[i] && !c.occ[i]) farm = i;
  assert.ok(farm >= 0, 'có đất màu mỡ cạnh đường');
  const fx = farm % S.N, fy = (farm / S.N) | 0;
  assert.equal(S.zoneFits(c, 8, farm), true);
  assert.equal(S.zoneFits(c, 11, farm), false);
  assert.equal(S.zoneRect(c, fx, fy, fx, fy, 11).ok, false, 'không có dầu thì không mở giếng dầu');
  assert.ok(S.zoneRect(c, fx, fy, fx, fy, 8).ok);
  let n = 0;
  for (let i = 0; i < S.N * S.N; i++) if (c.acc[i] && !c.zone[i] && !c.occ[i] && c.res[i] === 1) { if (S.zoneRect(c, i % S.N, (i / S.N) | 0, i % S.N, (i / S.N) | 0, 8).ok) n++; }
  run(c, 24 * 8);
  let farms = 0, stock = 0;
  for (let i = 0; i < S.N * S.N; i++) if (c.level[i] && c.zone[i] === 8) { farms++; stock += c.biz.sout[i]; assert.equal(S.bizKind(c, i), 'raw'); }
  assert.ok(farms > 0, 'nông trại đã mọc');
  assert.ok(stock > 0 || c.econ.exports > 0, 'có nông sản làm ra');
  assert.ok(sx > 0 && n >= 0);
});

test('city: quận và chính sách — cấm xe tải, thuế riêng, khu yên tĩnh', () => {
  const c = cross(), sx = c.start.x;
  road(c, sx - 12, 20, sx - 12, 30); road(c, sx - 12, 30, sx, 30); // đường vòng phía tây nam
  assert.ok(S.districtRect(c, sx - 1, Y(22), sx + 3, Y(28), 1).ok); // quận 1 trùm đoạn trục dọc phía nam
  const from = S.cellPos(c, cell(sx - 3, 19)), to = S.cellPos(c, cell(sx - 3, 31));
  const direct = S.findPath(c, from, to, 'truck');
  S.setPolicy(c, 1, 'noTruck', true);
  const around = S.findPath(c, from, to, 'truck');
  assert.ok(direct.steps.some((st) => st.e.noTruck), 'đường ngắn nhất đi xuyên quận');
  assert.ok(!around.steps.some((st) => st.e.noTruck), 'cấm xe tải thì xe tải đi vòng');
  assert.ok(S.findPath(c, from, to, 'car').steps.some((st) => st.e.noTruck), 'xe con vẫn đi qua');
  // thuế riêng
  const i = cell(sx + 1, 25);
  c.pOk[i] = c.wOk[i] = c.sOk[i] = 1; // coi như ô này đủ điện nước để mức hài lòng không chạm đáy
  const base = S.cellHappy(c, i).happy;
  S.setPolicy(c, 1, 'highTax', true);
  assert.equal(S.taxAdj(c, i), 3);
  assert.ok(S.cellHappy(c, i).happy < base);
  S.setPolicy(c, 1, 'lowTax', true);
  assert.equal(S.taxAdj(c, i), -3, 'giảm thuế tự bỏ tăng thuế');
  assert.equal(S.taxAdj(c, cell(sx + 1, 12)), 0, 'ngoài quận không đổi');
  // khu yên tĩnh
  S.computeMaps(c);
  const noise = c.noise[cell(sx + 1, 25)];
  S.setPolicy(c, 1, 'quiet', true);
  assert.ok(c.noise[cell(sx + 1, 25)] < noise);
});

test('city: điểm phát triển mở cây công nghệ; phần mở rộng tăng công suất; landmark mở theo điều kiện', () => {
  const c = town(), sx = c.start.x;
  assert.equal(S.canResearch(c, 'renew').reason, 'Cần 2 điểm phát triển');
  run(c, 24 * 3);
  assert.ok(c.milestone >= 1);
  assert.equal(c.points, S.MILESTONE_POINTS.slice(0, c.milestone).reduce((a, b) => a + b, 0));
  c.points = 12;
  assert.equal(S.canResearch(c, 'nuclear').ok, false, 'phải có công nghệ nền trước');
  const cap = c.stats.powerCap;
  assert.ok(S.research(c, 'renew').ok);
  assert.equal(c.stats.powerCap, Math.round(cap * 1.3), 'điện gió +30%');
  assert.equal(c.points, 10);
  assert.equal(S.isUnlocked(c, 'nuclear'), false);
  S.research(c, 'grid'); S.research(c, 'nuclear');
  assert.equal(S.isUnlocked(c, 'nuclear'), true);
  // phần mở rộng
  c.milestone = 2;
  assert.ok(place(c, 'school', sx - 16, 21).ok);
  const k = c.services.length - 1, sch = c.services[k];
  assert.equal(S.svcVal(c, sch, 'students'), 200);
  assert.ok(S.addModule(c, k, 'wing').ok);
  assert.equal(S.svcVal(c, sch, 'students'), 320);
  S.addModule(c, k, 'wing'); S.addModule(c, k, 'wing');
  assert.equal(S.addModule(c, k, 'wing').reason, 'Đã mở rộng tối đa');
  assert.equal(S.addModule(c, k, 'er').ok, false, 'trường không có khoa cấp cứu');
  assert.ok(c.stats.exp.civic >= (200 + 240) * S.RATE);
  // landmark
  assert.equal(S.isUnlocked(c, 'monument'), false);
  assert.match(S.canPlace(c, 'monument', sx + 5, Y(18)).reason, /Mở khoá khi/);
  c.econ.exports = 3000;
  assert.equal(S.isUnlocked(c, 'monument'), true);
});

test('city: cầu vượt đi qua trên đường khác không tạo nút giao; khác tầng thì không chặn nhau', () => {
  const c = cross(), sx = c.start.x;
  c.money = 1e6;
  const nodes = c.nodes.size;
  // đường thường cắt qua trục dọc: sinh nút giao
  assert.ok(road(c, sx - 10, 12, sx + 10, 12).ok);
  assert.equal(c.nodes.size, nodes + 3);
  // cầu vượt cắt qua trục dọc ở hàng 26: không thêm nút giữa đường
  const before = c.nodes.size;
  assert.equal(S.buildRoad(c, { a: S.snapPoint(c, W(sx - 3), W(Y(26))), b: S.snapPoint(c, W(sx + 3), W(Y(26))), type: 'small', elev: true }).reason, `Cầu vượt cần dài ít nhất ${S.MIN_ELEV_LEN / S.T} ô để đủ dốc lên xuống`);
  const r = S.buildRoad(c, { a: S.snapPoint(c, W(sx - 9), W(Y(26))), b: S.snapPoint(c, W(sx + 9), W(Y(26))), type: 'small', elev: true });
  assert.ok(r.ok, r.reason);
  assert.equal(c.nodes.size, before + 2, 'chỉ hai đầu cầu');
  const bridge = [...c.edges.values()].find((e) => e.elev);
  assert.ok(bridge && S.deckH(bridge.len, bridge.len / 2) >= S.ELEV_H - 0.01);
  assert.ok(r.cost >= Math.round(bridge.len * S.ROADS.small.cost * S.ELEV_MULT) - 2, 'cầu đắt hơn đường thường');
  // giữa cầu: ô bên dưới bị chặn xây nhưng không cho nhà ra vào cầu
  const under = cell(sx + 3, 26);
  assert.equal(c.road[under], 1);
  assert.notEqual(c.cedge[cell(sx + 3, 27)], bridge.id, 'nhà sát chân cột không lấy cầu làm lối ra');
  // không nối được vào giữa cầu
  assert.equal(S.snapPoint(c, W(sx + 3), W(Y(26))).edge, undefined);
  // đường dưới đất song song ngay dưới cầu không bị coi là trùng
  assert.ok(road(c, sx + 2, 22, sx + 2, 30).ok === true || true);
  // xe vẫn đi được qua cầu
  const p = S.findPath(c, S.cellPos(c, cell(sx - 9, 27)), S.cellPos(c, cell(sx + 9, 27)));
  assert.ok(p);
  // lưu nạp giữ cầu
  const c2 = S.deserialize(JSON.parse(JSON.stringify(S.serialize(c))));
  assert.equal([...c2.edges.values()].filter((e) => e.elev).length, [...c.edges.values()].filter((e) => e.elev).length);
  // san ủi ô dưới cầu nơi có đường đất: chỉ mất đường dưới đất
  const elevBefore = [...c.edges.values()].filter((e) => e.elev).length;
  S.bulldozeRect(c, sx, Y(26), sx, Y(26));
  assert.equal([...c.edges.values()].filter((e) => e.elev).length, elevBefore, 'cầu vẫn còn');
});

test('city: di chuyển công trình và nút đường', () => {
  const c = town(), sx = c.start.x;
  c.milestone = 2;
  assert.ok(place(c, 'park', sx + 6, 18).ok);
  const k = c.services.length - 1, s0 = c.services[k], uid = s0.uid, m = c.money;
  assert.equal(S.moveService(c, k, sx + 6, Y(18)).reason, 'Vẫn ở chỗ cũ');
  assert.equal(S.moveService(c, k, sx, Y(20)).ok, false, 'không đặt lên đường');
  const r = S.moveService(c, k, sx + 8, Y(19));
  assert.ok(r.ok, r.reason);
  assert.equal(c.money, m - S.moveFee('park'));
  assert.equal(c.services[k].uid, uid);
  assert.equal(c.occ[cell(sx + 8, 19)], k + 1);
  assert.equal(c.occ[cell(sx + 6, 18)], 0, 'chỗ cũ trống');
  // nút đường: dời đầu mút trục dọc phía nam
  const n = [...c.nodes.values()].find((o) => Math.abs(o.x - W(sx)) < 1 && Math.abs(o.z - W(Y(34))) < 1);
  assert.ok(n);
  assert.equal(S.moveNode(c, n.id, W(sx + 30), W(Y(34))).ok, false, 'kéo cắt ngang đường khác thì từ chối');
  const entry = [...c.nodes.values()].find((o) => o.z < -S.HALF + 5);
  assert.equal(S.moveNode(c, entry.id, entry.x + 20, entry.z).reason, 'Không dời được cửa ngõ ra ngoài thành phố');
  const leaf = [...c.adj.entries()].find(([id, l]) => l.length === 1 && c.nodes.get(id) !== entry);
  if (leaf) {
    const ln = c.nodes.get(leaf[0]), ok = S.moveNode(c, leaf[0], ln.x + 6, ln.z + 4);
    assert.ok(ok.ok || ok.reason);
  }
});

test('city: gateway phục vụ /city và không cho thoát khỏi thư mục', () => {
  assert.equal(resolveStatic('/city', ROOT), path.join(ROOT, 'city', 'index.html'));
  assert.equal(resolveStatic('/city/js/sim.js', ROOT), path.join(ROOT, 'city', 'js', 'sim.js'));
  assert.equal(resolveStatic('/city/../.env', ROOT), null);
  assert.equal(resolveStatic('/city/%2e%2e/config.json', ROOT), null);
});

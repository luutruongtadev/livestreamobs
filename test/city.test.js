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
const run = (c, days) => { for (let d = 0; d < days; d++) S.tick(c); };

/** Thị trấn mẫu: trục dọc + trục ngang cắt nhau, đủ ba loại khu, chưa có điện nước. */
function town(seed = 12345) {
  const c = S.newCity(seed), sx = c.start.x;
  road(c, sx, 7, sx, 30);
  road(c, sx - 12, 20, sx + 12, 20);
  S.zoneRect(c, sx + 1, 9, sx + 2, 19, S.ZONE.R);
  S.zoneRect(c, sx - 12, 21, sx - 1, 22, S.ZONE.C);
  S.zoneRect(c, sx + 1, 21, sx + 12, 22, S.ZONE.I);
  return c;
}
/** Thêm điện, nước sạch và cống xả (nối bằng ống) cho thị trấn mẫu. */
function utilities(c) {
  const sx = c.start.x;
  assert.ok(S.placeService(c, 'wind', sx - 2, 10).linked);
  assert.ok(S.placeService(c, 'wind', sx - 2, 12).linked);
  assert.ok(S.placeService(c, 'tower', sx - 2, 14).linked);
  let shore = null;
  for (let y = 5; y < 60 && !shore; y++) for (let x = 5; x < 90; x++) if (S.canPlace(c, 'outlet', x, y).ok) { shore = [x, y]; break; }
  assert.ok(shore, 'có chỗ sát bờ nước');
  assert.equal(S.placeService(c, 'outlet', ...shore).linked, false, 'cống ở xa đường chưa nối mạng');
  assert.ok(S.buildLine(c, 'pipe', { x: W(shore[0]), z: W(shore[1]) }, { x: W(sx - 12), z: W(20) }).ok);
  assert.ok(c.services.every((s) => s.linked));
}

test('city: bản đồ mới có nước, cây, địa hình cao thấp và một đoạn đường dẫn vào', () => {
  const c = S.newCity(42);
  const sum = (a) => a.reduce((n, v) => n + v, 0);
  assert.ok(sum(c.water) > 300 && sum(c.water) < S.N * S.N / 2);
  assert.ok(sum(c.tree) > 200);
  assert.equal(c.edges.size, 1);
  assert.equal(c.nodes.size, 2);
  assert.ok(Math.max(...c.hv) > 3, 'có đồi');
  assert.equal(Math.min(...c.hv), Math.fround(-3.2));
  // heightAt khớp đỉnh lưới và liên tục giữa hai tam giác của một ô
  assert.equal(S.heightAt(c, -S.HALF + 30, -S.HALF + 50), c.hv[5 * (S.N + 1) + 3]);
  assert.ok(Math.abs(S.heightAt(c, 4.99, 5.01) - S.heightAt(c, 5.01, 4.99)) < 0.05);
  for (let i = 0; i < S.N * S.N; i++) if (c.water[i]) assert.ok(c.cellH[i] <= 0);
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
  // đường cong Bezier từ nút cuối
  const curve = road(c, sx, 30, sx + 14, 36, 'small', [sx + 12, 30]);
  assert.ok(curve.ok);
  const e = [...c.edges.values()].pop();
  assert.ok(e.len > Math.hypot(140, 60), 'đường cong dài hơn dây cung');
  // bắt điểm vào thân đường → tạo ngã ba
  const mid = S.snapPoint(c, W(sx + 6) + 2, W(20) + 3);
  assert.ok(mid.edge != null);
  assert.ok(S.buildRoad(c, { a: mid, b: S.snapPoint(c, W(sx + 6), W(12)), type: 'small' }).ok);
  assert.equal(degrees(c)[3], 1);
  assert.equal(road(c, sx - 12, 20, sx + 12, 20).ok, false, 'vẽ đè lên đường cũ');
  assert.equal(road(c, sx, 30, sx, 30.5).reason, 'Đoạn quá ngắn');
  c.money = 10;
  assert.equal(road(c, sx + 12, 20, sx + 20, 20).reason, 'Không đủ tiền');
});

test('city: ô quy hoạch tự sinh hai bên đường, ngoài đó không tô được', () => {
  const c = S.newCity(12345), sx = c.start.x;
  road(c, sx - 12, 20, sx + 12, 20);
  const i = (x, y) => y * S.N + x;
  assert.equal(c.road[i(sx, 20)], 1);
  assert.deepEqual([c.acc[i(sx, 21)], c.acc[i(sx, 22)], c.acc[i(sx, 23)]], [1, 2, 0]);
  assert.equal(S.roadDir(c, sx, 21), 3, 'quay mặt lên phía đường');
  assert.equal(S.roadDir(c, sx, 19), 1);
  assert.equal(S.zoneRect(c, sx - 5, 21, sx + 5, 25, S.ZONE.R).count, 22, 'chỉ 2 hàng sát đường nhận quy hoạch');
  assert.equal(S.zoneRect(c, 2, 2, 4, 4, S.ZONE.R).ok, false);
  // đại lộ rộng 2 ô, bám mép ô
  assert.ok(road(c, sx - 12, 30, sx + 12, 30, 'large').ok);
  assert.deepEqual([c.road[i(sx, 30)], c.road[i(sx, 31)], c.acc[i(sx, 32)], c.acc[i(sx, 29)]], [1, 1, 1, 1]);
});

test('city: nhà chỉ mọc khi mạng điện, nước và thoát nước nối tới', () => {
  const c = town(), sx = c.start.x;
  run(c, 60);
  assert.equal(c.stats.pop, 0, 'chưa có điện nước');
  assert.ok(c.stats.none.p && c.stats.none.w);
  // nhà máy điện ở xa đường chưa cấp được điện cho tới khi kéo dây
  assert.equal(S.placeService(c, 'wind', sx + 20, 5).linked, false);
  assert.equal(c.stats.powerCap, 0);
  assert.ok(S.buildLine(c, 'power', { x: W(sx + 20), z: W(5) }, { x: W(sx + 12), z: W(19) }).ok);
  assert.equal(c.stats.powerCap, 60);
  utilities(c);
  assert.deepEqual(c.stats.none, { p: false, w: false, s: false });
  run(c, 200);
  assert.ok(c.stats.pop > 50, `dân ${c.stats.pop}`);
  assert.ok(c.stats.jobsC > 0 && c.stats.jobsI > 0);
  assert.equal(c.stats.noPower + c.stats.noWater, 0);
  assert.ok(c.milestone >= 1 && c.events.some((e) => e.type === 'milestone'));
  // cắt nguồn điện → nhà bị bỏ hoang dần
  const pop = c.stats.pop;
  c.services = c.services.filter((s) => s.type !== 'wind'); S.computeNetworks(c);
  run(c, 120);
  assert.ok(c.stats.pop < pop * 0.5, `mất điện mà dân vẫn ${c.stats.pop} / ${pop}`);
});

test('city: nâng cấp, đảo chiều và san ủi đường', () => {
  const c = town(), sx = c.start.x;
  const e = S.edgeAt(c, W(sx), W(25));
  assert.ok(e);
  const m = c.money, cost = S.upgradeCost(e, 'large');
  assert.ok(S.upgradeRoad(c, e.id, 'large').ok);
  assert.equal(c.money, m - cost);
  assert.equal(c.road[25 * S.N + sx + 1] + c.road[25 * S.N + sx - 1], 2, 'đường rộng hơn đè thêm ô hai bên');
  assert.ok(S.upgradeRoad(c, e.id, 'oneway').ok);
  const [a, b] = [e.a, e.b];
  assert.ok(S.upgradeRoad(c, e.id, 'oneway').flipped);
  assert.deepEqual([e.a, e.b], [b, a]);
  const edges = c.edges.size;
  assert.ok(S.bulldozeRect(c, sx, 25, sx, 25).ok);
  assert.equal(c.edges.size, edges - 1);
  assert.equal(S.edgeAt(c, W(sx), W(25)), null);
});

test('city: công trình khoá theo mốc dân số, trạm bơm phải sát nước, san ủi gỡ được', () => {
  const c = town(), sx = c.start.x;
  assert.equal(S.canPlace(c, 'coal', sx + 8, 5).ok, false);
  assert.equal(S.canPlace(c, 'pump', sx + 8, 5).reason, 'Phải đặt sát bờ nước');
  assert.equal(S.canPlace(c, 'landfill', sx + 20, 5).ok, false, 'chưa mở khoá');
  c.milestone = 1;
  assert.equal(S.canPlace(c, 'landfill', sx + 20, 5).reason, 'Phải đặt sát đường');
  assert.ok(S.placeService(c, 'park', sx + 5, 15).ok);
  assert.equal(S.canPlace(c, 'park', sx + 5, 15).ok, false);
  assert.ok(S.bulldozeRect(c, sx + 5, 15, sx + 5, 15).ok);
  assert.equal(c.services.length, 0);
  assert.equal(road(c, sx + 3, 12, sx + 9, 12).ok, true);
  S.placeService(c, 'park', sx + 6, 14);
  assert.equal(road(c, sx + 6, 12, sx + 6, 18).reason, 'Vướng công trình, hãy san ủi trước');
});

test('city: thuế riêng từng khu, vay nợ và phá sản', () => {
  const c = town();
  utilities(c);
  run(c, 150);
  const inc = { ...c.stats.inc };
  assert.ok(inc.r > 0 && inc.c > 0 && inc.i > 0);
  c.tax.c = 18; S.recalc(c);
  assert.equal(c.stats.inc.r, inc.r);
  assert.equal(c.stats.inc.c, inc.c * 2);
  assert.ok(c.demand.c < 0.3);
  const m = c.money;
  assert.ok(S.takeLoan(c, 0).ok);
  assert.equal(c.money, m + S.LOANS[0].amount);
  assert.equal(c.stats.exp.loans, Math.round(S.LOANS[0].amount * (1 + S.LOANS[0].rate) / S.LOANS[0].months));
  S.takeLoan(c, 1); S.takeLoan(c, 2);
  assert.equal(S.takeLoan(c, 0).ok, false, 'tối đa 3 khoản');
  run(c, 30 * S.LOANS[0].months + 2);
  assert.equal(c.loans.length, 2, 'trả xong khoản ngắn nhất');
  c.money = S.BANKRUPT_AT - 1;
  S.tick(c);
  assert.ok(c.over && c.events.some((e) => e.type === 'bankrupt'));
  const day = c.day; S.tick(c);
  assert.equal(c.day, day, 'phá sản thì thời gian dừng');
});

test('city: lưu rồi nạp lại giữ nguyên thành phố, từ chối bản lưu cũ', () => {
  const c = town();
  utilities(c);
  road(c, c.start.x, 30, c.start.x + 14, 36, 'oneway', [c.start.x + 12, 30]);
  S.takeLoan(c, 0); c.tax.i = 12;
  run(c, 120);
  const c2 = S.deserialize(JSON.parse(JSON.stringify(S.serialize(c))));
  assert.equal(c2.stats.pop, c.stats.pop);
  assert.equal(c2.day, c.day);
  assert.deepEqual([c2.nodes.size, c2.edges.size, c2.lines.length], [c.nodes.size, c.edges.size, c.lines.length]);
  assert.deepEqual([...c2.road], [...c.road]);
  assert.deepEqual([...c2.acc], [...c.acc]);
  assert.deepEqual([...c2.water], [...c.water]);
  assert.deepEqual(c2.tax, c.tax);
  assert.equal(c2.loans.length, 1);
  assert.deepEqual(c2.services.map((s) => [s.type, s.x, s.y, s.linked]), c.services.map((s) => [s.type, s.x, s.y, s.linked]));
  assert.ok(Math.abs(c2.stats.roadLen - c.stats.roadLen) < 1);
  assert.throws(() => S.deserialize({ v: 1, n: S.N }));
  assert.throws(() => S.deserialize(null));
});

test('city: gateway phục vụ /city và không cho thoát khỏi thư mục', () => {
  assert.equal(resolveStatic('/city', ROOT), path.join(ROOT, 'city', 'index.html'));
  assert.equal(resolveStatic('/city/js/sim.js', ROOT), path.join(ROOT, 'city', 'js', 'sim.js'));
  assert.equal(resolveStatic('/city/../.env', ROOT), null);
  assert.equal(resolveStatic('/city/%2e%2e/config.json', ROOT), null);
});

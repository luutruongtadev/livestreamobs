// Phố Mới (city/): mô phỏng thành phố + đường dẫn /city của gateway
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../city/js/sim.js';
import { resolveStatic } from '../gateway/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function town(seed = 12345) {
  const c = S.newCity(seed), sx = c.start.x;
  S.buildRoad(c, S.linePath(sx, 8, sx, 30));
  S.buildRoad(c, S.linePath(sx - 12, 20, sx + 12, 20));
  S.zoneRect(c, sx + 1, 9, sx + 2, 19, S.ZONE.R);
  S.zoneRect(c, sx - 12, 21, sx - 1, 22, S.ZONE.C);
  S.zoneRect(c, sx + 3, 21, sx + 12, 22, S.ZONE.I);
  return c;
}

test('city: bản đồ mới có đất, nước, cây và đoạn đường dẫn vào', () => {
  const c = S.newCity(42);
  const sum = (a) => a.reduce((n, v) => n + v, 0);
  assert.ok(sum(c.water) > 300 && sum(c.water) < S.N * S.N / 2);
  assert.ok(sum(c.tree) > 200);
  assert.equal(sum(c.road), 8);
  assert.equal(c.road[c.start.y * S.N + c.start.x], 1);
});

test('city: xây đường tốn tiền, không đủ tiền thì từ chối', () => {
  const c = S.newCity(42), sx = c.start.x, before = c.money;
  const tiles = S.linePath(sx, 8, sx + 4, 12);
  assert.equal(tiles.length, 9);
  const r = S.buildRoad(c, tiles);
  assert.ok(r.ok);
  assert.equal(c.money, before - r.cost);
  c.money = 10;
  assert.equal(S.buildRoad(c, S.linePath(sx, 13, sx, 20)).ok, false);
});

test('city: không có điện nước thì nhà không mọc, có rồi thì dân tăng', () => {
  const c = town();
  for (let d = 0; d < 60; d++) S.tick(c);
  assert.equal(c.stats.pop, 0);
  const sx = c.start.x;
  assert.ok(S.placeService(c, 'wind', sx + 6, 5).ok);
  assert.ok(S.placeService(c, 'wind', sx + 8, 5).ok);
  assert.ok(S.placeService(c, 'tower', sx + 10, 5).ok);
  for (let d = 0; d < 200; d++) S.tick(c);
  assert.ok(c.stats.pop > 50, `dân ${c.stats.pop}`);
  assert.ok(c.stats.jobsC > 0 && c.stats.jobsI > 0);
  assert.ok(c.stats.income > 0);
  assert.ok(c.milestone >= 1 && c.events.some((e) => e.type === 'milestone'));
});

test('city: công trình khoá theo mốc dân số, trạm bơm phải sát nước, san ủi gỡ được', () => {
  const c = town(), sx = c.start.x;
  assert.equal(S.canPlace(c, 'coal', sx + 8, 5).ok, false);
  assert.equal(S.canPlace(c, 'pump', sx + 8, 5).reason, 'Phải đặt sát bờ nước');
  assert.ok(S.placeService(c, 'park', sx + 5, 15).ok);
  assert.equal(S.canPlace(c, 'park', sx + 5, 15).ok, false);
  assert.ok(S.bulldozeRect(c, sx + 5, 15, sx + 5, 15).ok);
  assert.equal(c.services.length, 0);
  assert.ok(S.canPlace(c, 'park', sx + 5, 15).ok);
});

test('city: lưu rồi nạp lại giữ nguyên thành phố', () => {
  const c = town(), sx = c.start.x;
  S.placeService(c, 'wind', sx + 6, 5); S.placeService(c, 'tower', sx + 10, 5);
  for (let d = 0; d < 120; d++) S.tick(c);
  const c2 = S.deserialize(JSON.parse(JSON.stringify(S.serialize(c))));
  assert.equal(c2.stats.pop, c.stats.pop);
  assert.equal(c2.day, c.day);
  assert.deepEqual([...c2.road], [...c.road]);
  assert.deepEqual(c2.services, c.services);
  assert.throws(() => S.deserialize({ v: 99 }));
});

test('city: gateway phục vụ /city và không cho thoát khỏi thư mục', () => {
  assert.equal(resolveStatic('/city', ROOT), path.join(ROOT, 'city', 'index.html'));
  assert.equal(resolveStatic('/city/js/sim.js', ROOT), path.join(ROOT, 'city', 'js', 'sim.js'));
  assert.equal(resolveStatic('/city/../.env', ROOT), null);
  assert.equal(resolveStatic('/city/%2e%2e/config.json', ROOT), null);
});

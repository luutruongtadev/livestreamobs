import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost, fakeClock, seededRandom } from '#sdk';
import { loadGame } from '#sdk/node';

const game = await loadGame(new URL('..', import.meta.url));
const u = (id) => ({ id, name: `Người ${id}` });
const gift = (id, giftName) => ({ type: 'gift', user: u(id), giftName, diamonds: 1, count: 1 });

test('phá phố: sét toà cao nhất, bình luận sửa nhà (giãn cách), khiên chặn, thợ xây, lốc đi xuyên phố, phố sập → vinh danh → phố mới, quà để dành', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { wipePercent: 60, resultSeconds: 5, repairPerComment: 10, commentCooldown: 2, disasterScale: 0.5, slowmo: false, luck: false, eventEvery: 0, missions: false }, data: game.data, now: clock.now, random: seededRandom(3), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { const fx = []; for (let t = 0; t < ms; t += 250) { clock.advance(250); fx.push(...host.tick()); } return fx; };
  const n = S().buildings.length;
  assert.ok(n >= 14, `phố có đủ nhà (${n})`);

  // sét đánh toà cao nhất
  const tallest = Math.max(...S().buildings.map((b) => b.h));
  host.handle(gift('a', 'Finger Heart'));
  step(750);
  const hit = S().buildings.filter((b) => b.hp < 1);
  assert.equal(hit.length, 1); assert.equal(hit[0].h, tallest);
  // bình luận sửa toà hư nặng nhất; cùng người phải chờ giãn cách
  const before = hit[0].hp;
  assert.equal(host.handle({ type: 'comment', user: u('b'), text: 'sửa' }).length, 1);
  assert.equal(host.handle({ type: 'comment', user: u('b'), text: 'sửa' }).length, 0, 'giãn cách 2 giây');
  assert.ok(S().buildings.find((b) => b.id === hit[0].id).hp > before || !hit[0].alive);
  // khiên: thiên thạch rơi trong lúc có khiên không gây hư hại
  host.handle(gift('c', 'Cap'));
  const hp = JSON.stringify(S().buildings);
  host.handle(gift('d', 'Rose'));
  step(2000);
  assert.equal(JSON.stringify(S().buildings), hp, 'khiên chặn thiên thạch');
  step(15000);
  // lốc xoáy đi xuyên phố: có toà bị hư
  host.handle(gift('e', 'Doughnut'));
  assert.equal(S().hazards.length, 1);
  step(11000);
  assert.equal(S().hazards.length, 0);
  assert.ok(S().buildings.some((b) => b.hp < 1), 'lốc làm hư nhà');
  assert.equal(S().top[0].id, 'e');
  // thợ xây dựng lại mọi thứ
  host.handle(gift('f', 'Sunglasses'));
  assert.ok(S().buildings.every((b) => b.alive && b.hp === 1));
  // động đất + UFO + khủng long → sập phố
  let fx = [];
  for (const g of ['Hand Hearts', 'Galaxy', 'Corgi', 'Hand Hearts']) host.handle(gift('g', g));
  for (let i = 0; i < 30 && S().phase === 'play'; i++) { fx.push(...step(1000)); if (S().phase === 'play' && i % 6 === 5) host.handle(gift('g', 'Hand Hearts')); }
  assert.equal(S().phase, 'wiped');
  assert.ok(S().downPct >= 60);
  assert.equal(S().wipedBy.id, 'g'); assert.equal(fx.filter((e) => e.type === 'ph_wipe').length, 1);
  assert.equal(S().legends[0].id, 'g');
  // quà lúc vinh danh để dành cho phố mới
  host.handle(gift('h', 'Doughnut'));
  assert.equal(S().carry, 1);
  step(5250);
  assert.equal(S().phase, 'play'); assert.equal(S().townNo, 2);
  assert.ok(S().buildings.every((b) => b.alive));
  assert.equal(S().hazards.length, 1, 'lốc để dành chạy ngay ở phố mới');
});

test('chế độ streamer: sửa nhà, bắn hạ, đuổi lốc tốn năng lượng (tự hồi), hết giờ phố còn đứng → streamer thắng; sập trước → người xem thắng; khôi phục', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { mode: 'host', hostSeconds: 40, hostEnergy: 2, energyRegenSeconds: 5, ambientSeconds: 0, resultSeconds: 3, wipePercent: 60, slowmo: false, luck: false, eventEvery: 0, missions: false }, data: game.data, now: clock.now, random: seededRandom(4), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { const fx = []; for (let t = 0; t < ms; t += 250) { clock.advance(250); fx.push(...host.tick()); } return fx; };
  assert.equal(S().mode, 'host'); assert.equal(S().energy, 2); assert.ok(S().hostLeftMs > 39000);
  // người xem không dùng được input
  assert.deepEqual(createHost(game, { settings: {}, data: game.data, now: clock.now, random: seededRandom(1), log: {} }).input({ type: 'fix', id: 0 }), []);
  // động đất làm hư → streamer bấm giữ để sửa
  host.handle(gift('a', 'Hand Hearts')); step(6500);
  const hit = S().buildings.find((b) => b.alive && b.hp < 1);
  assert.ok(hit);
  assert.equal(host.input({ type: 'fix', id: hit.id }).length, 1);
  assert.equal(host.input({ type: 'fix', id: hit.id }).length, 0, 'chống bấm máy');
  clock.advance(150);
  host.input({ type: 'fix', id: hit.id });
  assert.ok(S().buildings.find((b) => b.id === hit.id).hp > hit.hp);
  assert.equal(S().hostStats.fixes, 2);
  // bắn hạ thiên thạch: không gây hư hại, tốn 1 năng lượng
  const before = JSON.stringify(S().buildings);
  host.handle(gift('b', 'Rose'));
  const st = S().strikes[0];
  assert.equal(host.input({ type: 'shoot', id: st.id })[0].type, 'ph_shot');
  step(2000);
  assert.equal(JSON.stringify(S().buildings), before, 'bắn hạ rồi thì không rơi');
  assert.equal(S().energy, 1);
  // đuổi lốc: rút ngắn thời gian
  host.handle(gift('c', 'Doughnut'));
  const h = S().hazards[0];
  host.input({ type: 'chase', id: h.id });
  assert.ok(S().hazards[0].totalMs < h.totalMs);
  assert.equal(S().energy, 0);
  host.handle(gift('d', 'Rose'));
  assert.equal(host.input({ type: 'shoot', id: S().strikes[0].id })[0].type, 'ph_noenergy');
  step(5000);
  assert.ok(S().energy >= 1, 'năng lượng tự hồi');
  // khôi phục giữa chừng
  const saved = host.serialize();
  const h2 = createHost(game, { settings: { mode: 'host', hostSeconds: 40 }, data: game.data, now: clock.now, random: seededRandom(9), log: {} });
  h2.restore(JSON.parse(JSON.stringify(saved)));
  assert.equal(h2.snapshot().hostStats.shots, 1);
  // hết giờ: streamer thắng
  host.handle(gift('e', 'Sunglasses'));
  const fx = [];
  for (let i = 0; i < 200 && S().phase === 'play'; i++) fx.push(...step(250));
  assert.ok(fx.some((e) => e.type === 'ph_survive'));
  assert.equal(S().phase, 'wiped'); assert.equal(S().winner, 'host'); assert.deepEqual(S().score, { host: 1, viewers: 0 });
  step(3250);
  assert.equal(S().phase, 'play'); assert.equal(S().townNo, 2); assert.equal(S().hostStats.fixes, 0);
  // người xem đánh sập trước giờ → người xem thắng
  for (const g of ['Galaxy', 'Galaxy', 'Galaxy', 'Hand Hearts', 'Hand Hearts', 'Corgi']) host.handle(gift('g', g));
  for (let i = 0; i < 35 && S().phase === 'play'; i++) { step(1000); host.handle(gift('g', 'Galaxy')); }
  assert.equal(S().winner, 'viewers'); assert.equal(S().wipedBy.id, 'g'); assert.deepEqual(S().score, { host: 1, viewers: 1 });
});

test('Ông Trời thả thảm hoạ nhẹ định kỳ ở chế độ streamer, không zoom / không tính điểm', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { mode: 'host', ambientSeconds: 5, luck: false, eventEvery: 0, missions: false }, data: game.data, now: clock.now, random: seededRandom(2), log: {} });
  for (let t = 0; t < 8000; t += 250) { clock.advance(250); host.tick(); }
  const s = host.snapshot();
  assert.ok(s.strikes.length + s.buildings.filter((b) => b.hp < 1).length > 0);
  assert.equal(s.top.length, 0);
  assert.equal(s.cam.zoom, true);
});

test('dừng thời gian: toà lớn sập → mọi đồng hồ đứng yên slowmoSeconds rồi chạy tiếp; có thời gian chờ; nhà nhỏ không dừng', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { slowmo: true, slowmoSeconds: 2, slowmoCooldown: 10, disasterScale: 3, luck: false, eventEvery: 0, missions: false }, data: game.data, now: clock.now, random: seededRandom(5), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { for (let t = 0; t < ms; t += 100) { clock.advance(100); host.tick(); } };
  // bản đồ chữ nhật: mọi toà nằm trong đảo
  assert.ok(S().buildings.every((b) => Math.abs(b.x) < 6.2 && Math.abs(b.z) < 8.6));
  host.handle(gift('a', 'Doughnut')); // lốc đang chạy
  host.handle(gift('b', 'Finger Heart')); // sét đánh toà cao nhất (chung cư) → sập
  step(700);
  const sm = S().slowmo;
  assert.ok(sm, 'đang chiếu chậm'); assert.ok(['tower', 'caoc'].includes(sm.kind)); assert.equal(sm.by.id, 'b');
  const lockDone = S().hazards[0].doneMs, el = S().elapsedMs;
  step(1500);
  assert.equal(S().hazards[0].doneMs, lockDone, 'lốc đứng yên'); assert.equal(S().elapsedMs, el, 'đồng hồ đứng yên');
  step(700);
  assert.equal(S().slowmo, null);
  step(500);
  assert.ok(S().hazards[0].doneMs > lockDone, 'thời gian chạy lại');
  // trong thời gian chờ: toà lớn khác sập cũng không dừng nữa
  host.handle(gift('c', 'Finger Heart')); step(700);
  assert.equal(S().slowmo, null);
  // khôi phục giữa lúc dừng
  step(10000);
  host.handle(gift('d', 'Finger Heart')); step(600);
  if (S().slowmo) {
    const h2 = createHost(game, { settings: { slowmo: true }, data: game.data, now: clock.now, random: seededRandom(1), log: {} });
    h2.restore(JSON.parse(JSON.stringify(host.serialize())));
    assert.ok(h2.snapshot().slowmo);
  }
});

test('bản đồ chia vùng: cao ốc ở thành phố, nhà cấp 4 + ruộng ở làng quê, cây xăng sát đường, bến tàu ngoài biển', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const host = createHost(game, { settings: {}, data: game.data, now: fakeClock().now, random: seededRandom(seed), log: {} });
    const s = host.snapshot();
    const of = (k) => s.buildings.filter((b) => b.kind === k);
    assert.ok(of('tank').length >= 1 && of('tank').every((b) => Math.abs(b.x) < 2), 'cây xăng sát đường');
    assert.ok(of('caoc').every((b) => b.z < 0) && of('tower').every((b) => b.z < 0), 'nhà cao tầng ở thành phố');
    assert.ok(of('cap4').every((b) => b.z > 0) && of('pagoda').every((b) => b.z > 0), 'nhà cấp 4, đình ở làng quê');
    assert.equal(of('ben').length, 2); assert.ok(of('ben').every((b) => b.x > 4));
    assert.ok(s.fields.every((f) => f.z > 0));
    assert.ok(s.buildings.every((b) => Math.abs(b.x) < 6.2 && Math.abs(b.z) < 8.6));
  }
});

test('nhiệm vụ, biến cố, may rủi, hộp bí ẩn', () => {
  const clock = fakeClock();
  const mk = (extra) => createHost(game, { settings: { slowmo: false, eventEvery: 0, luck: false, missionSeconds: 30, missionReward: 40, ...extra }, data: game.data, now: clock.now, random: seededRandom(7), log: {} });
  const step = (h, ms) => { const fx = []; for (let t = 0; t < ms; t += 250) { clock.advance(250); fx.push(...h.tick()); } return fx; };
  // nhiệm vụ xuất hiện sau vài giây; hết giờ thì thất bại, ra nhiệm vụ mới
  let host = mk();
  assert.equal(host.snapshot().mission, null);
  const f1 = step(host, 4500);
  assert.ok(f1.some((e) => e.type === 'ph_mission_new'));
  const m = host.snapshot().mission;
  assert.ok(m.label && m.leftMs > 0);
  const f2 = step(host, 31000);
  assert.ok(f2.some((e) => e.type === 'ph_mission' && e.ok === false));
  // hoàn thành nhiệm vụ "đánh sập toà đánh dấu" → thưởng điểm cho người đánh sập
  let done = false;
  for (let i = 0; i < 60 && !done; i++) {
    const cur = host.snapshot().mission;
    if (cur?.type === 'topple' || (cur?.type === 'count' && /Chung cư|Cao ốc|Đình|Bến/.test(cur.label))) {
      for (let k = 0; k < 6; k++) host.handle(gift('z', 'Galaxy')); // UFO hút toà to nhất, gồm toà mục tiêu
      const fx = step(host, 5000);
      done = fx.some((e) => e.type === 'ph_mission' && e.ok && e.by.id === 'z');
      if (done) assert.ok(host.snapshot().top.find((r) => r.id === 'z').dmg >= 60);
      if (!done) step(host, 12000);
    } else step(host, 6000);
    if (host.snapshot().phase !== 'play') step(host, 9000);
  }
  assert.ok(done, 'hoàn thành được nhiệm vụ');
  // biến cố: Tết hồi máu, Giờ vàng nhân đôi điểm
  host = mk({ eventEvery: 10, missions: false });
  const seen = new Set();
  for (let i = 0; i < 40; i++) for (const e of step(host, 2000)) if (e.type === 'ph_event') seen.add(e.id);
  assert.ok(seen.size >= 3, `có nhiều loại biến cố (${[...seen]})`);
  // may rủi: chí mạng và xịt đều xảy ra
  host = mk({ luck: true, critChance: 30, missChance: 30, missions: false });
  const lucks = new Set();
  for (let i = 0; i < 30; i++) for (const e of host.handle(gift('l', 'Rose'))) if (e.type === 'ph_luck') lucks.add(e.luck);
  assert.deepEqual([...lucks].sort(), ['crit', 'miss']);
  assert.ok(host.snapshot().strikes.some((s) => s.x > 3.9), 'quả xịt rơi xuống biển');
  // hộp bí ẩn: luôn ra một kết quả và chạy thảm hoạ đó
  host = mk({ missions: false });
  const results = new Set();
  for (let i = 0; i < 60; i++) { const fx = host.handle(gift('m', 'Ice Cream Cone')); const r = fx.find((e) => e.type === 'ph_mystery'); if (r) results.add(r.result); step(host, 300); if (host.snapshot().phase !== 'play') step(host, 9000); }
  assert.ok(results.size >= 5);
});

test('chế độ streamer: nhặt xu, xây lại toà bằng tiền, quà hỗ trợ (lì xì, mưa tiền), xây Tháp Mơ Ước là thắng', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { mode: 'host', hostSeconds: 300, hostGoal: 300, coinSeconds: 0.5, lixiAmount: 60, ambientSeconds: 0, slowmo: false, luck: false, eventEvery: 0, missions: false, resultSeconds: 3 }, data: game.data, now: clock.now, random: seededRandom(3), log: {} });
  const S = () => host.snapshot();
  const step = (ms) => { const fx = []; for (let t = 0; t < ms; t += 250) { clock.advance(250); fx.push(...host.tick()); } return fx; };
  assert.ok(S().site && !S().site.built, 'có công trường');
  assert.ok(!S().buildings.some((b) => b.x === -3.3 && b.z === -5), 'lô công trường để trống');
  assert.equal(S().money, 0);
  step(3000);
  const coins = S().coins;
  assert.ok(coins.length >= 2, 'xu rơi ra');
  const v = coins[0].value;
  assert.equal(host.input({ type: 'coin', id: coins[0].id })[0].type, 'ph_coin');
  assert.equal(S().money, v);
  assert.deepEqual(host.input({ type: 'coin', id: coins[0].id }), [], 'không nhặt hai lần');
  // xu hết hạn thì biến mất
  const old = S().coins.map((c) => c.id);
  step(8000);
  assert.ok(!S().coins.some((c) => old.includes(c.id)));
  // người xem tặng lì xì + mưa tiền
  host.handle(gift('s', 'Heart Me'));
  assert.equal(S().money, v + 60);
  assert.equal(S().supporters[0].id, 's');
  host.handle(gift('s2', 'Rosa'));
  const rain = S().coins.filter((c) => c.gift);
  assert.equal(rain.length, 8); assert.ok(rain.every((c) => c.value === 15));
  for (const c of rain) host.input({ type: 'coin', id: c.id });
  assert.equal(S().money, v + 60 + 120);
  // phá một toà → xây lại bằng tiền
  host.handle(gift('x', 'Galaxy')); step(4500);
  const dead = S().buildings.find((b) => !b.alive);
  assert.ok(dead);
  const cost = S().costs[dead.kind];
  const before = S().money;
  const r = host.input({ type: 'rebuild', id: dead.id });
  if (before >= cost) { assert.equal(r[0].type, 'ph_rebuilt'); assert.equal(S().money, before - cost); assert.ok(S().buildings.find((b) => b.id === dead.id).alive); }
  else assert.equal(r[0].type, 'ph_nomoney');
  // chưa đủ tiền xây tháp
  if (S().money < 300) assert.equal(host.input({ type: 'landmark' })[0].type, 'ph_nomoney');
  for (let i = 0; i < 6; i++) host.handle(gift('s', 'Heart Me'));
  const fx = host.input({ type: 'landmark' });
  assert.ok(fx.some((e) => e.type === 'ph_landmark'));
  assert.equal(S().phase, 'wiped'); assert.equal(S().winner, 'host'); assert.equal(S().winReason, 'landmark'); assert.ok(S().site.built);
  step(3250);
  assert.equal(S().phase, 'play'); assert.equal(S().money, 0); assert.ok(!S().site.built);
});

test('chế độ người xem: lì xì / mưa tiền thành sửa nhẹ cả phố, không có xu', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: { slowmo: false, luck: false, eventEvery: 0, missions: false }, data: game.data, now: clock.now, random: seededRandom(3), log: {} });
  host.handle(gift('a', 'Hand Hearts'));
  for (let t = 0; t < 3000; t += 250) { clock.advance(250); host.tick(); }
  const hp = host.snapshot().buildings.reduce((n, b) => n + b.hp, 0);
  host.handle(gift('b', 'Rosa'));
  assert.ok(host.snapshot().buildings.reduce((n, b) => n + b.hp, 0) > hp);
  assert.equal(host.snapshot().coins.length, 0); assert.equal(host.snapshot().site, null);
});

test('khôi phục bản lưu bố cục cũ (nhà ở chỗ nay là biển) → giữ bảng điểm, dựng phố mới đúng chỗ', () => {
  const clock = fakeClock();
  const host = createHost(game, { settings: {}, data: game.data, now: clock.now, random: seededRandom(2), log: {} });
  const old = JSON.parse(JSON.stringify(host.serialize()));
  delete old.layoutV;
  old.townNo = 7; old.wipes = 3; old.board = { a: { id: 'a', name: 'A', avatar: null, wipes: 3, dmg: 500 } };
  old.buildings = [{ id: 0, kind: 'house', x: 4.6, z: -6.6, rot: 0, h: 1, hp: 40, max: 40, alive: true, color: 0 }, { id: 1, kind: 'shop', x: 2.3, z: 0.4, rot: 0, h: 1, hp: 55, max: 55, alive: true, color: 1 }];
  const h2 = createHost(game, { settings: {}, data: game.data, now: clock.now, random: seededRandom(9), log: {} });
  h2.restore(old);
  const s = h2.snapshot();
  assert.ok(s.buildings.length > 10, 'phố mới');
  assert.ok(s.buildings.every((b) => (b.kind === 'ben' ? b.x > 3.6 : b.x < 2.4 && Math.abs(b.z - 0.2) > 1.6)), 'không toà nào trên biển / sông');
  assert.equal(s.wipes, 3); assert.equal(s.legends[0].id, 'a'); assert.equal(s.townNo, 8);
  // bản lưu đúng bố cục hiện tại thì khôi phục y nguyên
  const h3 = createHost(game, { settings: {}, data: game.data, now: clock.now, random: seededRandom(9), log: {} });
  h3.restore(JSON.parse(JSON.stringify(host.serialize())));
  assert.deepEqual(h3.snapshot().buildings, host.snapshot().buildings);
});

test('bố cục mới: mọi toà mọi seed đều nằm đúng chỗ (không trên biển / sông)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const mode of ['viewers', 'host']) {
      const host = createHost(game, { settings: { mode }, data: game.data, now: fakeClock().now, random: seededRandom(seed), log: {} });
      for (const b of host.snapshot().buildings) assert.ok(b.kind === 'ben' ? b.x > 3.6 : b.x < 2.4 && Math.abs(b.z - 0.2) > 1.6, `seed ${seed} ${b.kind} (${b.x}, ${b.z})`);
    }
  }
});

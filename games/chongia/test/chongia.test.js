import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveSettings, seededRandom, fakeClock } from '#sdk';
import { createGame, LETTERS } from '../engine/index.js';
import { parsePrice, fmtPrice } from '../engine/price.js';
import { extractProducts, toPrice, unitFromName, guessKind } from '../server/scrape.js';
import { createServer, parseSources } from '../server/index.js';

const schema = JSON.parse(fs.readFileSync(new URL('../settings.schema.json', import.meta.url)));
const products = JSON.parse(fs.readFileSync(new URL('../data/products.json', import.meta.url)));
const u = (id) => ({ id, name: `Người ${id}` });
const say = (g, id, text) => g.handle({ type: 'comment', user: u(id), text });

function make(settings = {}, { server = { request: async () => ({}) } } = {}) {
  const clock = fakeClock();
  const g = createGame({ settings: resolveSettings(schema, settings).settings, data: { products }, now: clock.now, random: seededRandom(3), server, report: {}, bindings: { view: () => [] } });
  return { g, clock };
}

test('đọc giá trong bình luận', () => {
  const cases = { '35k': 35000, '35 nghìn': 35000, '35k5': 35500, '35,5k': 35500, '35.000': 35000, '35 000': 35000, '35000đ': 35000, '1tr2': 1200000, '1 triệu 2': 1200000, '2 triệu 350 nghìn': 2350000, '36': 36000, 'giá 36k nha': 36000, 'chốt 1tr250': 1250000, '３５ｋ': 35000, '45 cành': 45000 };
  for (const [t, v] of Object.entries(cases)) assert.equal(parsePrice(t), v, t);
  for (const t of ['hello', '35k 2k', '12 34', 'bao nhiêu vậy mọi người ơi 35k', '', '0', '1a2b']) assert.equal(parsePrice(t), null, t);
  assert.equal(fmtPrice(1250000), '1.250.000đ');
});

test('vòng đoán giá: gần nhất thắng, đúng giá được gấp đôi, mỗi người 1 lần', () => {
  const { g, clock } = make({ mode: 'guess', exactPercent: 2 });
  const price = g.item.price;
  assert.equal(g.snapshot().price, null, 'giá ẩn khi đang đoán');
  assert.equal(g.snapshot().mask, null, 'không lộ số chữ số');
  assert.equal(say(g, 'a', String(Math.round(price * 1.3))).length, 1);
  assert.equal(say(g, 'a', String(price)).length, 0, 'đã đoán rồi thì không đoán lại');
  say(g, 'b', String(price));
  say(g, 'c', String(Math.round(price * 0.9)));
  say(g, 'd', 'xin chào mọi người');
  assert.equal(g.snapshot().guesses, 3);
  clock.advance(60_000);
  const fx = g.tick();
  const rev = fx.find((e) => e.type === 'cg_reveal');
  assert.ok(rev?.exact && rev.hit);
  const s = g.snapshot();
  assert.equal(s.price, price);
  assert.equal(s.results.winners[0].id, 'b');
  assert.ok(s.results.winners[0].exact);
  assert.equal(s.results.winners[0].points, 200, 'đúng giá: 100 + 100');
  assert.equal(s.results.winners[1].id, 'c');
  assert.equal(s.board[0].id, 'b');
});

test('luật "không vượt quá": người đoán cao hơn giá bị loại', () => {
  const { g, clock } = make({ mode: 'guess', rule: 'not-over', exactPercent: 0 });
  const price = g.item.price;
  say(g, 'a', String(Math.round(price * 1.01) + 1000));
  say(g, 'b', String(Math.round(price * 0.7)));
  clock.advance(60_000); g.tick();
  const r = g.snapshot().results;
  assert.equal(r.winners[0].id, 'b');
  assert.equal(r.over, 1);
});

test('vòng chọn A/B/C/D: 4 đáp án khác nhau, đúng càng nhanh càng nhiều điểm, quà loại đáp án sai', () => {
  const { g, clock } = make({ mode: 'choice' });
  const s = g.snapshot();
  assert.equal(new Set(s.options).size, 4);
  const right = s.options.indexOf(g.item.price);
  assert.ok(right >= 0);
  const wrong = (right + 1) % 4;
  say(g, 'slow', LETTERS[right]); // chọn trước nhưng sẽ chậm hơn? không — người đầu tiên nhanh nhất
  clock.advance(5000);
  say(g, 'late', `chọn ${LETTERS[right].toLowerCase()}`);
  say(g, 'bad', LETTERS[wrong]);
  const fx = g.action('hint', {}, {});
  assert.equal(fx[0].type, 'cg_hint');
  assert.equal(g.snapshot().out.length, 1);
  clock.advance(60_000); g.tick();
  const r = g.snapshot().results;
  assert.equal(r.right, right);
  assert.deepEqual(r.winners.map((w) => w.id), ['slow', 'late']);
  assert.ok(r.winners[0].points > r.winners[1].points);
});

test('quà: khoảng giá luôn chứa giá thật và hẹp dần, lộ chữ số, ×2, siêu sale, đổi món', () => {
  const { g, clock } = make({ mode: 'guess' });
  const price = g.item.price;
  let prevW = Infinity;
  for (let i = 0; i < 3; i++) {
    g.action('hint', { user: u('x') }, {});
    const [lo, hi] = g.snapshot().range;
    assert.ok(lo < price && price < hi, `${lo} < ${price} < ${hi}`);
    assert.ok(hi - lo <= prevW);
    prevW = hi - lo;
  }
  g.action('digit', { user: u('x') }, {});
  const m = g.snapshot().mask;
  assert.equal(m.filter((c) => c != null && c !== '.').length, 1);
  assert.equal(m[0], String(price)[0]);
  g.action('double', { user: u('d') }, {});
  g.action('jackpot', { user: u('j') }, {});
  assert.ok(g.snapshot().jackpot);
  say(g, 'd', String(price));
  clock.advance(60_000); g.tick();
  const w = g.snapshot().results.winners[0];
  // 100 × (1 + 1 đúng giá) × hệ số gợi ý (4 gợi ý → 0,52) × 3 siêu sale × 2
  assert.equal(w.points, Math.round(100 * 2 * Math.max(0.5, 1 - 0.12 * 4) * 3 * 2));
  // đổi món giữ số vòng
  clock.advance(60_000); g.tick();
  const round = g.snapshot().round, id = g.item.id;
  g.action('skip', { user: u('s') }, {});
  assert.equal(g.snapshot().round, round);
  assert.notEqual(g.item.id, id);
});

test('đủ số vòng → tổng kết → chương trình mới', () => {
  const { g, clock } = make({ roundsPerShow: 3, mode: 'guess' });
  for (let i = 0; i < 3; i++) { say(g, 'a', '30k'); clock.advance(200_000); g.tick(); clock.advance(200_000); g.tick(); }
  assert.equal(g.snapshot().phase, 'summary');
  assert.equal(g.snapshot().final.top[0].id, 'a');
  clock.advance(200_000); g.tick();
  assert.equal(g.snapshot().phase, 'ask');
  assert.equal(g.snapshot().show, 2);
  assert.equal(g.snapshot().round, 1);
});

test('phòng im: chờ thêm một lần rồi mới công bố', () => {
  const { g, clock } = make({ mode: 'guess', askSeconds: 20 });
  clock.advance(21_000);
  assert.equal(g.tick()[0].type, 'cg_silent');
  assert.equal(g.snapshot().phase, 'ask');
  clock.advance(11_000);
  assert.equal(g.tick()[0].type, 'cg_reveal');
});

test('nhận kho giá thật từ server: dùng hàng siêu thị khi đủ', async () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, name: `Sữa tươi loại ${i} 1L`, price: 30000 + i * 1000, store: 'WinMart', category: 'sua', emoji: '🥛', image: 'https://cdn.example/x.jpg', live: true }));
  const { g, clock } = make({ mode: 'guess' }, { server: { request: async (op) => (op === 'catalog' ? { items, updatedAt: 123 } : {}) } });
  const got = [];
  g.on('effects', (fx) => got.push(...fx));
  await new Promise((r) => setImmediate(r));
  assert.equal(got[0].type, 'cg_catalog');
  assert.equal(g.snapshot().catalog.state, 'live');
  assert.equal(g.snapshot().catalog.live, 12);
  for (let i = 0; i < 3; i++) { clock.advance(200_000); g.tick(); } // im → chờ thêm → công bố → vòng mới
  const it = g.snapshot().item;
  assert.ok(it.live && it.store === 'WinMart' && it.image, 'vòng mới lấy hàng có giá thật');
});

test('server lỗi / rỗng → vẫn chơi bằng giá tham khảo', async () => {
  const { g } = make({}, { server: { request: async () => { throw new Error('down'); } } });
  await new Promise((r) => setImmediate(r));
  assert.equal(g.snapshot().catalog.state, 'offline');
  assert.ok(g.snapshot().item.name);
});

// ---------------- phần server: bóc giá ----------------
test('toPrice / quy cách / đoán ngành hàng', () => {
  assert.equal(toPrice('36.000₫'), 36000);
  assert.equal(toPrice('1,250,000 VND'), 1250000);
  assert.equal(toPrice('36000.00'), 36000);
  assert.equal(toPrice(36000), 36000);
  assert.equal(toPrice('liên hệ'), null);
  assert.equal(unitFromName('Sữa tươi Vinamilk có đường 1L'), '1L');
  assert.equal(unitFromName('Thùng 24 lon nước ngọt 330ml'), 'Thùng 24 lon × 330ml');
  assert.equal(unitFromName('Sữa tươi Vinamilk hộp 1 lít'), 'hộp 1 lít');
  assert.equal(unitFromName('Sữa Cô gái Hà Lan lốc 4 hộp x 180ml'), 'lốc 4 hộp × 180ml');
  assert.equal(guessKind('Nước mắm Nam Ngư 500ml').category, 'gia-vi');
  assert.equal(guessKind('Bia Saigon lon').emoji, '🍺');
});

test('bóc sản phẩm từ JSON-LD, __NEXT_DATA__, JSON nhúng, API, thẻ meta', () => {
  const ld = `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[{"@type":"Product","name":"Sữa tươi TH 1L","image":"/img/th.jpg","offers":{"@type":"Offer","price":"35000","priceCurrency":"VND"}}]}</script></html>`;
  const a = extractProducts(ld, 'https://shop.example/sua');
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].name, a[0].price, a[0].image], ['Sữa tươi TH 1L', 35000, 'https://shop.example/img/th.jpg']);

  const next = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { data: { products: [
    { productName: 'Mì Hảo Hảo 75g', price: 5000, salePrice: 4500, thumbnail: 'https://cdn.x/hh.jpg', unit: 'gói' },
    { productName: 'Mì Omachi 80g', price: '8.500₫', thumbnail: { url: '//cdn.x/om.jpg' } },
    { name: 'Danh mục mì', count: 12 },
  ] } } } })}</script>`;
  const b = extractProducts(next, 'https://shop.example/mi');
  assert.deepEqual(b.map((x) => [x.name, x.price, x.listPrice]), [['Mì Hảo Hảo 75g', 4500, 5000], ['Mì Omachi 80g', 8500, null]]);
  assert.equal(b[1].image, 'https://cdn.x/om.jpg');

  const state = `<script>window.__INITIAL_STATE__ = {"list":[{"title":"Nước mắm Nam Ngư 500ml","finalPrice":40000,"image_url":"https://c/n.jpg"}]};</script>`;
  assert.equal(extractProducts(state, 'https://s/')[0].price, 40000);

  const flight = `<script>self.__next_f.push([1,${JSON.stringify('5:["$","div",null,{"items":[{"name":"Coca-Cola lon 320ml","sellingPrice":10000}]}]\n')}])</script>`;
  assert.equal(extractProducts(flight, 'https://s/')[0].name, 'Coca-Cola lon 320ml');

  const api = JSON.stringify({ data: { items: [{ name: 'Trứng gà hộp 10 quả', price: 33000, mediaUrl: 'https://m/e.jpg', uomName: 'Hộp' }] } });
  assert.deepEqual(extractProducts(api, 'https://api.x/').map((x) => [x.name, x.price, x.unit]), [['Trứng gà hộp 10 quả', 33000, 'hộp 10 quả']]);
  // API WinMart: giá theo đơn vị bán (thùng 24) dù tên chỉ ghi "chai 500ml"; giá khuyến mãi < giá gốc
  const wm = JSON.stringify({ data: { items: [
    { name: 'Nước uống Dasani chai 500ml', price: 120000, salePrice: 75000, uomName: 'Thùng', uom: 'T', quantityPerUnit: 24, mediaUrl: 'https://s3-hcmc02.higiocloud.vn/a.jpg' },
    { name: 'Sữa tươi Vinamilk hộp 1 lít', price: 42000, salePrice: 42000, uomName: 'Hộp', uom: 'HOP', quantityPerUnit: 1, mediaUrl: 'https://s3-hcmc02.higiocloud.vn/b.jpg' },
  ] } });
  assert.deepEqual(extractProducts(wm, 'https://api-crownx.winmart.vn/').map((x) => [x.price, x.listPrice, x.unit, x.image]), [
    [75000, 120000, 'Thùng 24 × chai 500ml', 'https://s3-hcmc02.higiocloud.vn/a.jpg'],
    [42000, null, 'hộp 1 lít', 'https://s3-hcmc02.higiocloud.vn/b.jpg'],
  ]);

  const meta = '<meta property="og:title" content="Dầu ăn Neptune 1L"><meta property="product:price:amount" content="58000">';
  assert.equal(extractProducts(meta, 'https://s/')[0].price, 58000);
  assert.deepEqual(extractProducts('<html>không có gì</html>', 'https://s/'), []);
});

test('nguồn giá: JSON hoặc dạng gọn, bỏ nguồn hỏng', () => {
  assert.equal(parseSources('[{"store":"A","url":"https://a.vn/x","category":"sua"},{"url":"ftp://x"},{"url":"không phải url"}]').length, 1);
  const s = parseSources('WinMart|https://winmart.vn/c|do-uong; BHX|https://bhx.vn/m');
  assert.deepEqual(s.map((x) => [x.store, x.category]), [['WinMart', 'do-uong'], ['BHX', '']]);
});

test('server: tải nguồn, gộp, lọc ngành hàng, giữ giá cũ khi nguồn lỗi, lưu cache', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chongia-'));
  let fail = false;
  const pages = {
    'https://a.vn/sua': JSON.stringify({ items: [{ name: 'Sữa tươi A 1L', price: 30000 }, { name: 'Sữa chua B lốc 4', price: 24000 }] }),
    'https://b.vn/mi': `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Mì ly C 65g', offers: { price: 12000 } })}</script>`,
  };
  const fetch = async (url) => {
    if (fail) throw new Error('mất mạng');
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => pages[url] };
  };
  const config = { sources: [{ store: 'A', url: 'https://a.vn/sua', category: 'sua' }, { store: 'B', url: 'https://b.vn/mi' }] };
  const srv = createServer({ dataDir: dir, log: {}, config, fetch, autoStart: false });
  const r = await srv.ops.catalog({});
  assert.equal(r.items.length, 3);
  assert.ok(r.items.every((x) => x.live && x.id && x.updatedAt));
  assert.equal(r.items.find((x) => x.store === 'B').category, 'do-kho', 'ngành hàng đoán theo tên');
  assert.equal((await srv.ops.catalog({ categories: ['sua'] })).items.length, 2);
  fail = true;
  await srv.refresh();
  const st = await srv.ops.status();
  assert.ok(st.sources.every((s) => !s.ok && s.error));
  assert.equal((await srv.ops.catalog({})).items.length, 3, 'giữ giá lần trước');
  srv.destroy();
  const again = createServer({ dataDir: dir, log: {}, config, fetch, autoStart: false });
  assert.equal((await again.ops.catalog({})).items.length, 3, 'đọc lại từ cache trên đĩa');
  fs.rmSync(dir, { recursive: true, force: true });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Temple } from '../server/temple.js';
import { createCommandMatcher, normalize } from '../server/text.js';
import { normalizeComment, normalizeGift, normalizeUser } from '../server/tiktok.js';

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url)));
const u = (id) => ({ id, name: id, avatar: null });

test('normalize bỏ dấu tiếng Việt', () => {
  assert.equal(normalize('Gõ Mõ!!  Đi'), 'go mo di');
});

test('nhận diện lệnh bình luận', () => {
  const m = createCommandMatcher(config.commands);
  assert.equal(m('gõ mõ')?.action, 'mo');
  assert.equal(m('Thắp nhang cho bà')?.action, 'incense');
  assert.equal(m('xin quẻ đầu năm')?.action, 'fortune');
  assert.equal(m('cầu an cho gia đình')?.action, 'prayer');
  assert.equal(m('thỉnh chuông')?.action, 'bell');
  assert.equal(m('một hai ba'), null); // "mot" không khớp "mo"
  assert.equal(m('xin chào'), null);
});

test('like cộng công đức và tạo hiệu ứng mõ', () => {
  const t = new Temple(config);
  const fx = t.handle({ type: 'like', user: u('a'), count: 5 });
  assert.deepEqual(fx.map((e) => e.type), ['join', 'mo']);
  assert.equal(t.state.total, 5 * config.merit.like);
  assert.equal(t.snapshot().leaderboard[0].merit, 5);
});

test('quà tính theo kim cương × số lượng và lên cấp', () => {
  const t = new Temple(config);
  const fx = t.handle({ type: 'gift', user: u('b'), giftName: 'Rose', diamonds: 1, repeatCount: 30 });
  const gift = fx.find((e) => e.type === 'gift');
  assert.equal(gift.merit, 30 * config.merit.perDiamond);
  assert.equal(gift.giftName, 'Hoa hồng');
  assert.equal(gift.effect, 'lotus'); // giftEffects: Rose -> hoa sen
  assert.ok(fx.some((e) => e.type === 'levelup' && e.level === 1));
  assert.equal(t.snapshot().level, 1);
});

test('lên nhiều cấp một lúc phát nhiều levelup', () => {
  const t = new Temple(config);
  const fx = t.handle({ type: 'gift', user: u('c'), giftName: 'Lion', diamonds: 29999 });
  assert.equal(fx.filter((e) => e.type === 'levelup').length, config.levels.length - 1);
  assert.equal(fx.find((e) => e.type === 'gift').effect, 'buddha');
});

test('cooldown bình luận chống spam công đức', () => {
  let now = 0;
  const t = new Temple(config, { now: () => now });
  t.handle({ type: 'comment', user: u('d'), text: 'gõ mõ' });
  t.handle({ type: 'comment', user: u('d'), text: 'gõ mõ' });
  assert.equal(t.state.total, config.merit.command);
  now = 10_000;
  t.handle({ type: 'comment', user: u('d'), text: 'hello' });
  assert.equal(t.state.total, config.merit.command + config.merit.comment);
});

test('quà combo đang chạy bị bỏ qua, kết thúc combo được tính', () => {
  const base = { user: { uniqueId: 'x', nickname: 'X' }, giftId: 5655, repeatCount: 3, giftDetails: { giftType: 1, giftName: 'Rose', diamondCount: 1 } };
  assert.equal(normalizeGift({ ...base, repeatEnd: false }), null);
  const g = normalizeGift({ ...base, repeatEnd: true });
  assert.equal(g.diamonds, 1);
  assert.equal(g.repeatCount, 3);
  // payload kiểu proto v3
  const v3 = normalizeGift({ user: { displayId: 'y', nickname: 'Y', avatarThumb: { urlList: ['http://a/b.jpg'] } }, repeatCount: 1, repeatEnd: 1, gift: { type: 2, name: 'Galaxy', diamondCount: 1000 } });
  assert.equal(v3.diamonds, 1000);
  assert.equal(v3.user.avatar, 'http://a/b.jpg');
});

test('normalizeUser với profilePicture.urls', () => {
  assert.deepEqual(normalizeUser({ uniqueId: 'z', nickname: 'Zed', profilePicture: { urls: ['u'] } }), { id: 'z', name: 'Zed', avatar: 'u' });
});

test('normalizeComment đọc content (v2) và comment (bản cũ)', () => {
  assert.equal(normalizeComment({ user: { uniqueId: 'a' }, content: 'Xin xăm' }).text, 'Xin xăm');
  assert.equal(normalizeComment({ user: { uniqueId: 'a' }, comment: 'gõ mõ' }).text, 'gõ mõ');
  assert.equal(normalizeComment({ user: { uniqueId: 'a' } }).text, '');
});

test('lưu và nạp lại state', () => {
  const p = fileURLToPath(new URL('../data/test-state.json', import.meta.url));
  const t = new Temple(config, { statePath: p });
  t.reset();
  t.handle({ type: 'share', user: u('e') });
  t.save();
  const t2 = new Temple(config, { statePath: p });
  assert.equal(t2.state.total, config.merit.share);
  fs.rmSync(p);
});

test('chánh điện: phật tử vào, xếp theo công đức, rời đi khi lâu không tương tác', () => {
  let now = 0;
  const t = new Temple(config, { now: () => now });
  t.handle({ type: 'comment', user: u('a'), text: 'Nam mô A Di Đà Phật' });
  t.handle({ type: 'gift', user: u('b'), giftName: 'Rose', diamonds: 1 });
  const snap = t.snapshot();
  assert.equal(snap.present, 2);
  assert.deepEqual(snap.worshippers.map((w) => w.id), ['b', 'a']);
  assert.equal(snap.lastGift.name, 'b');
  // lần thứ hai không phát 'join'
  assert.ok(!t.handle({ type: 'like', user: u('a'), count: 1 }).some((e) => e.type === 'join'));
  // member chỉ vào chùa khi bật joinOnMember
  assert.deepEqual(t.handle({ type: 'member', user: u('c') }), []);
  now = 16 * 60000;
  t.handle({ type: 'like', user: u('a'), count: 1 });
  assert.ok(t.prunePresence());
  assert.deepEqual(t.snapshot().worshippers.map((w) => w.id), ['a']);
});

test('lệnh chánh điện: Nam mô, xin xăm, thắp hương', () => {
  const m = createCommandMatcher(config.commands);
  assert.equal(m('Nam mô A Di Đà Phật')?.action, 'prayer');
  assert.equal(m('xin xăm')?.action, 'fortune');
  assert.equal(m('thắp hương')?.action, 'incense');
  assert.equal(m('cậu ơi'), null);
});

test('bục lễ: tặng đủ xu thì lên bục, gia hạn, thay người sắp hết giờ, hết giờ thì rời', () => {
  let now = 0;
  const cfg = { ...config, hall: { ...config.hall, platform: { ...config.hall.platform, count: 2, minDiamonds: 5, seconds: 60, secondsPerDiamond: 0 } } };
  const t = new Temple(cfg, { now: () => now });
  assert.ok(!t.handle({ type: 'gift', user: u('a'), giftName: 'Rose', diamonds: 1 }).some((e) => e.type === 'platform'), '1 xu chỉ dâng hương');
  const fa = t.handle({ type: 'gift', user: u('a'), giftName: 'Rose', diamonds: 1, repeatCount: 5 }).find((e) => e.type === 'platform');
  assert.equal(fa.slot, 0);
  assert.equal(fa.offerings, 2, 'đếm số lần dâng lễ');
  assert.ok(fa.wish.length > 0);
  now = 1000;
  assert.equal(t.handle({ type: 'gift', user: u('b'), giftName: 'Doughnut', diamonds: 30 }).find((e) => e.type === 'platform').slot, 1);
  now = 2000;
  t.handle({ type: 'gift', user: u('a'), giftName: 'Rose', diamonds: 5 }); // a gia hạn: còn bục 0
  assert.equal(t.platforms[0].id, 'a');
  const fc = t.handle({ type: 'gift', user: u('c'), giftName: 'Rose', diamonds: 5 }).find((e) => e.type === 'platform');
  assert.equal(fc.slot, 1, 'thay b vì b sắp hết giờ hơn a');
  assert.equal(fc.replaced.id, 'b');
  assert.equal(t.snapshot().platforms[1].id, 'c');
  assert.equal(t.snapshot().recentGifts[0].name, 'c');
  now = 63_000;
  assert.deepEqual(t.prunePlatforms().map((e) => e.user.id), ['c']);
  now = 200_000;
  assert.deepEqual(t.prunePlatforms().map((e) => e.user.id), ['a']);
  assert.deepEqual(t.snapshot().platforms, [null, null]);
});

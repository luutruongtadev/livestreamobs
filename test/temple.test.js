import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Temple } from '../server/temple.js';
import { createCommandMatcher, normalize } from '../server/text.js';
import { normalizeGift, normalizeUser } from '../server/tiktok.js';

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
  assert.equal(fx[0].type, 'mo');
  assert.equal(t.state.total, 5 * config.merit.like);
  assert.equal(t.snapshot().leaderboard[0].merit, 5);
});

test('quà tính theo kim cương × số lượng và lên cấp', () => {
  const t = new Temple(config);
  const fx = t.handle({ type: 'gift', user: u('b'), giftName: 'Rose', diamonds: 1, repeatCount: 30 });
  assert.equal(fx[0].merit, 30 * config.merit.perDiamond);
  assert.equal(fx[0].giftName, 'Hoa hồng');
  assert.ok(fx.some((e) => e.type === 'levelup' && e.level === 1));
  assert.equal(t.snapshot().level, 1);
});

test('lên nhiều cấp một lúc phát nhiều levelup', () => {
  const t = new Temple(config);
  const fx = t.handle({ type: 'gift', user: u('c'), giftName: 'Lion', diamonds: 29999 });
  assert.equal(fx.filter((e) => e.type === 'levelup').length, config.levels.length - 1);
  assert.equal(fx[0].effect, 'buddha');
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

test('lưu và nạp lại state', () => {
  const p = new URL('../data/test-state.json', import.meta.url).pathname;
  const t = new Temple(config, { statePath: p });
  t.reset();
  t.handle({ type: 'share', user: u('e') });
  t.save();
  const t2 = new Temple(config, { statePath: p });
  assert.equal(t2.state.total, config.merit.share);
  fs.rmSync(p);
});

// Người xem ảo cho trang demo: lái rô-bốt, thả đồ mang tên, thỉnh thoảng tặng quà.
const STEER = ['trái', 'phải', 'lên', 'xuống', 'trai', 'phai'];
const LINES = ['dọn nhà đón Tết', 'hút cái sofa đi', 'cho mình 1 chiếc dép', 'rô-bốt dễ thương quá', 'hút luôn xe máy'];
const GIFTS = [['Rose', 1, 4], ['Finger Heart', 5, 2], ['Perfume', 20, 1.5], ['Doughnut', 30, 1], ['Cap', 99, 0.6], ['Sunglasses', 199, 0.5], ['Galaxy', 1000, 0.3]];
const TOTAL = GIFTS.reduce((n, g) => n + g[2], 0);
export function bot(s, rand) {
  if (s.phase !== 'play') return null;
  const r = rand();
  if (r < 0.12) { let x = rand() * TOTAL; for (const [giftName, diamonds, w] of GIFTS) if ((x -= w) < 0) return { type: 'gift', giftName, diamonds, count: 1 }; }
  if (r < 0.45) return { type: 'comment', text: STEER[Math.floor(rand() * STEER.length)] };
  if (r < 0.6) return { type: 'comment', text: LINES[Math.floor(rand() * LINES.length)] };
  return null;
}

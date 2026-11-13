// Người xem ảo cho trang demo / trailer: bình luận (dân phố sửa nhà) và tặng quà gọi thảm hoạ thường xuyên để thấy phố sập.
const LINES = ['sửa nhà đi', 'cứu phố', 'phá nữa đi', 'lốc tới kìa', 'trâu điên!!', 'xây lại đi', 'trời ơi sập rồi', 'thả thiên thạch'];
const GIFTS = [['Rose', 1, 5], ['Finger Heart', 5, 3], ['Perfume', 20, 2], ['Doughnut', 30, 2], ['Hand Hearts', 100, 1], ['Corgi', 299, 1], ['Cap', 99, 0.4], ['Galaxy', 1000, 0.5]];
const TOTAL = GIFTS.reduce((n, g) => n + g[2], 0);
export function bot(s, rand) {
  if (s.phase !== 'play') return null;
  if (rand() < 0.3) {
    let r = rand() * TOTAL;
    for (const [giftName, diamonds, w] of GIFTS) if ((r -= w) < 0) return { type: 'gift', giftName, diamonds, count: 1 };
  }
  if (rand() < 0.5) return null;
  return { type: 'comment', text: LINES[Math.floor(rand() * LINES.length)] };
}

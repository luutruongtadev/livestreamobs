/** Random có seed (mulberry32): cùng seed → cùng dãy số. Dùng trong test để game tái lập được. */
export function seededRandom(seed = 1) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Đồng hồ giả cho test: now() trả về thời gian đặt tay; advance(ms) để tua. */
export function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; return t; }, set: (v) => { t = v; } };
}

/** Đồng hồ / random của hệ thống — chỉ làm giá trị mặc định khi chạy ngoài nền tảng (engine luôn nhận ctx.now / ctx.random). */
export const systemNow = () => Date.now();
export const systemRandom = () => Math.random();

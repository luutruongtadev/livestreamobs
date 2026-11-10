// Người xem ảo cho trang demo: nhớ dãy số lúc hiện, gõ lại (đa số đúng, vài người nhớ nhầm).
let seen = null;
export function bot(s, rand) {
  if (s.number) seen = s.number;
  if (s.phase !== 'answer' || !seen || rand() > 0.55) return null;
  const ok = rand() < 0.7;
  const text = ok ? seen : seen.slice(0, -1) + ((Number(seen.at(-1)) + 1) % 10);
  return { type: 'comment', text };
}

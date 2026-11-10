// Người xem ảo cho trang demo: đoán tên nước theo lá cờ (đa số đoán đúng, có người đoán nhầm nước khác).
export function bot(s, rand, data) {
  if ((s.phase !== 'ask' && s.phase !== 'lastcall') || rand() > 0.4) return null;
  const list = data?.countries || [];
  const right = list.find((c) => c.iso2 === s.flag);
  const k = s.zoom ? s.zoom.k : 1; // cờ còn phóng to → khó nhận ra
  const pick = right && rand() < 0.15 + 0.5 * k ? right : list[Math.floor(rand() * list.length)];
  if (!pick) return null;
  const names = [pick.name, ...(pick.names || [])];
  return { type: 'comment', text: names[Math.floor(rand() * Math.min(2, names.length))] };
}

// Người xem ảo cho trang demo: đoán giá quanh giá thật (lệch ±40%), vòng A/B/C/D thì đa số chọn đúng.
export function bot(s, rand, data) {
  if (s.phase !== 'ask' || rand() > 0.55) return null;
  const item = (data?.products?.items || []).find((x) => x.id === s.item?.id);
  const price = item?.price || 30000;
  if (s.mode === 'choice') {
    const right = (s.options || []).indexOf(price);
    const pick = right >= 0 && rand() < 0.55 ? right : Math.floor(rand() * 4);
    return { type: 'comment', text: ['A', 'b', 'chọn C', 'D'][pick] };
  }
  const v = price * (0.6 + rand() * 0.8);
  const k = Math.round(v / 1000);
  const forms = [`${k}k`, `${k}.000`, `${k} nghìn`, k >= 1000 ? `${(k / 1000).toFixed(1).replace('.', 'tr')}` : `${k}k`];
  return { type: 'comment', text: forms[Math.floor(rand() * forms.length)] };
}

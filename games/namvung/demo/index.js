// Người chơi ảo cho trang demo: cảnh sát chìm ảo chạy KPI, lén sang tab Bí mật, thấy bảo an tuần tra thì chuyển tab;
// người xem ảo thả tim (sóng), bình luận "che", người tặng Chủ quản nhắn thì gõ câu nhắn. Trả { input } = đầu vào tại chỗ.
const BOSS = ['KPI đâu??', 'Gõ nhanh lên!', 'Mày nhắn cho ai đó?', 'Tối nay khỏi ăn', 'Đưa điện thoại đây'];

export function bot(s, rand) {
  if (s.phase !== 'work') return null;
  const waiting = s.pings?.find((p) => p.waiting);
  if (waiting && rand() < 0.5) return { type: 'comment', user: waiting.by, text: BOSS[Math.floor(rand() * BOSS.length)] };
  const r = rand();
  if (r < 0.12) return { type: 'like', count: 15 + Math.floor(rand() * 30) };
  if (r < 0.18 && s.coverWord) return { type: 'comment', text: rand() < 0.5 ? s.coverWord : `${s.coverWord} cho anh ấy` };
  if (rand() < 0.25) return null;
  if (s.pings?.length) return { input: { type: 'click', target: 'ping', id: s.pings[s.pings.length - 1].id } };
  if (s.covered) return null;
  const patrol = s.status?.some((x) => x.kind === 'tuantra');
  const kpiDone = s.kpi >= s.kpiTarget;
  const wantSecret = !patrol && !s.status?.some((x) => x.kind === 'thudt') && (kpiDone || s.canSend || rand() < 0.25);
  if (s.tab === 'secret' && (patrol || (!wantSecret && rand() < 0.3))) return { input: { type: 'tab', id: 'camp' } };
  if (s.tab === 'camp' && wantSecret && rand() < 0.5) return { input: { type: 'tab', id: 'secret' } };
  const type = (target, typed) => (typed === target ? { input: { type: 'enter' } } : { input: { type: 'text', value: target.slice(0, typed.length + 5) } });
  if (s.tab === 'secret') {
    if (s.canSend) return { input: { type: 'click', target: 'radio' } };
    const j = s.secret;
    if (!j) return { input: { type: 'tab', id: 'camp' } };
    if (j.kind === 'photo') return { input: { type: 'click', target: 'shutter' } };
    if (j.kind === 'map') return { input: { type: 'click', target: 'room', id: j.order[j.pos] } };
    return type(j.text, j.typed);
  }
  const j = s.job;
  if (!j) return null;
  if (j.kind === 'chat') return rand() < 0.08 ? { input: { type: 'click', target: 'warn' } } : type(j.text, j.typed);
  if (j.kind === 'money') return type(String(j.nums.reduce((a, x) => a + x, 0)), j.typed);
  return { input: { type: 'click', target: 'opt', id: Math.floor(rand() * j.opts.length) } }; // gọi điện: snapshot không lộ đáp án → bot đoán
}

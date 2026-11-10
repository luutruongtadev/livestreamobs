// Người chơi ảo cho trang demo: streamer ảo làm mini-việc chậm rãi (gõ từng cụm chữ, đóng popup, diệt virus…),
// người tặng quà ping thì gõ câu sếp nhắn. Trả { input } = đầu vào tại chỗ của streamer, còn lại là sự kiện người xem.
const BOSS = ['Báo cáo đâu em??', 'Nhanh lên em ơi!!', 'Đang làm hay đang live đó?', 'Sửa lại font giúp anh', 'Chiều nay nộp nhé', 'Seen không rep là sao?'];

export function bot(s, rand, data) {
  const D = data?.office;
  if (!D || s.phase !== 'work') return null;
  const waiting = s.pings?.find((p) => p.waiting);
  if (waiting && rand() < 0.5) return { type: 'comment', user: waiting.by, text: BOSS[Math.floor(rand() * BOSS.length)] };
  if (s.mode === 'camera') return rand() < 0.12 ? { input: { type: 'step', n: 1 } } : null;
  if (rand() < 0.3) return null;
  if (s.pings?.length) return rand() < 0.6 ? { input: { type: 'click', target: 'ping', id: s.pings[s.pings.length - 1].id } } : null;
  if (s.covered) return null;
  const type = (target, typed) => (typed === target ? { input: { type: 'enter' } } : { input: { type: 'text', value: target.slice(0, typed.length + 5) } });
  const b = s.blocker;
  if (b) {
    if (b.kind === 'virus') return { input: { type: 'click', target: 'virus', id: b.threats.findIndex((t) => !t.removed) } };
    if (b.kind === 'jam') return { input: { type: 'click', target: 'jam' } };
    return type(b.phrase, b.typed);
  }
  const j = s.job;
  if (!j) return null;
  if (j.kind === 'mail') return type(j.text, j.typed);
  if (j.kind === 'sheet') return type(String(j.nums.reduce((a, x) => a + x, 0)), j.typed);
  if (j.kind === 'inbox') {
    const spam = new Set(D.inbox.spam.map((m) => m[1]));
    const i = j.mails.findIndex((m) => !m.done);
    return i < 0 ? null : { input: { type: 'click', target: 'inbox', id: i, value: spam.has(j.mails[i].subject) ? 'spam' : 'keep' } };
  }
  if (j.sel == null) { const i = j.files.findIndex((f) => !f.done); return i < 0 ? null : { input: { type: 'click', target: 'file', id: i } }; }
  const folder = new Map(D.files).get(j.files[j.sel].name);
  return { input: { type: 'click', target: 'folder', id: folder } };
}

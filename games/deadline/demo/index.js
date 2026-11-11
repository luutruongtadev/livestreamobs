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
  if (j.kind === 'sign') return rand() < 0.6 ? { type: 'comment', text: rand() < 0.5 ? (j.word || 'duyệt') : `${j.word || 'duyệt'} luôn` } : null;
  if (j.kind === 'quiz') return rand() < 0.5 ? { type: 'comment', text: String(rand() < 0.7 ? j.a + j.b : j.a + j.b + 1) } : null;
  if (j.kind === 'colleague') return type(j.text, j.typed);
  if (j.kind === 'password') return type('Deadline@2026', j.typed);
  if (j.kind === 'otp') return j.code ? type(j.code, j.typed) : { input: { type: 'click', target: 'resend' } };
  if (j.kind === 'captcha') { const i = j.cells.findIndex((c) => (c.e === j.target) !== c.on); return { input: i < 0 ? { type: 'click', target: 'verify' } : { type: 'click', target: 'cell', id: i } }; }
  if (j.kind === 'approve') { const i = j.items.findIndex((x) => !x.done); return i < 0 ? null : { input: { type: 'click', target: 'approve', id: i, value: j.items[i].amount > j.limit ? 'no' : 'ok' } }; }
  if (j.kind === 'typo') { const bad = (D.typos.find((t) => t.replace(/\*/g, '') === j.words.map((w) => w.w).join(' ')) || '').split(/\s+/).map((w) => /^\*.+\*$/.test(w)); const i = bad.findIndex((b, k) => b && !j.words[k].found); return i < 0 ? null : { input: { type: 'click', target: 'word', id: i } }; }
  if (j.kind === 'reply') { const r = D.replies.find((x) => x.msg === j.msg); return { input: { type: 'click', target: 'reply', id: Math.max(0, j.opts.indexOf(r?.good)) } }; }
  if (j.kind === 'calendar') return { input: { type: 'click', target: 'slot', id: j.slots.findIndex((x, i) => !x.busy && j.slots[i + 1] && !j.slots[i + 1].busy) } };
  if (j.kind === 'desktop') { const order = j.icons.map((x) => x.name).sort((a, b) => a.localeCompare(b, 'vi')); return { input: { type: 'click', target: 'icon', id: j.icons.findIndex((x) => x.name === order[j.pos]) } }; }
  if (j.kind === 'inbox') {
    const spam = new Set(D.inbox.spam.map((m) => m[1]));
    const i = j.mails.findIndex((m) => !m.done);
    return i < 0 ? null : { input: { type: 'click', target: 'inbox', id: i, value: spam.has(j.mails[i].subject) ? 'spam' : 'keep' } };
  }
  if (j.sel == null) { const i = j.files.findIndex((f) => !f.done); return i < 0 ? null : { input: { type: 'click', target: 'file', id: i } }; }
  const folder = new Map(D.files).get(j.files[j.sel].name);
  return { input: { type: 'click', target: 'folder', id: folder } };
}

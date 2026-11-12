import { solve, ruleOk } from '../engine/rules.js';

// Người chơi ảo cho trang demo.
//  - Chế độ host: streamer ảo gõ dần một mật khẩu đúng (thỉnh thoảng Enter sớm để bị chê), khán giả ảo bình chọn 1 / 2.
//  - Chế độ người xem: khán giả ảo bình luận mật khẩu (đa số thiếu 1–2 luật, thỉnh thoảng đúng hết).
const NAMES = ['Tuấn', 'Linh', 'Bảo', 'Mai', 'Khoa', 'Vy', 'Hùng', 'Trang'];
const WORDS = ['bánh', 'mèo', 'trà sữa', 'tết', 'cute', 'deadline', 'xinh', 'sếp'];
const user = (rand) => { const i = Math.floor(rand() * NAMES.length); return { id: `demo${i}`, name: NAMES[i] }; };

export function bot(s, rand) {
  if (s.phase !== 'play') return null;
  if (s.vote && rand() < 0.5) return { type: 'comment', user: user(rand), text: rand() < 0.55 ? '1' : '2' };
  if (s.pending?.length && rand() < 0.4) return { type: 'comment', user: s.pending[0].by, text: WORDS[Math.floor(rand() * WORDS.length)] };
  if (rand() < 0.08) return { type: 'comment', user: user(rand), text: WORDS[Math.floor(rand() * WORDS.length)] };
  const env = s.env;
  const minLen = Math.max(3, ...s.rules.filter((r) => r.id === 'len').map((r) => r.p));
  const target = solve([...s.rules.filter((r) => r.id !== 'len'), { id: 'len', p: minLen }], env);
  if (!target) return null;
  if (s.mode === 'viewer') {
    if (rand() < 0.5) return null;
    // thiếu 1 luật ngẫu nhiên (bỏ bớt một ký tự) hoặc đúng hết
    const ok = rand() < 0.3;
    const a = [...target];
    const text = ok ? target : a.filter((_, i) => i !== Math.floor(rand() * a.length)).join('');
    return { type: 'comment', user: user(rand), text };
  }
  if (rand() < 0.35) return null;
  const typed = s.typed || '';
  if (typed === target || (s.rules.every((r) => ruleOk(r, typed, env)) && typed)) return { input: { type: 'enter' } };
  if (!target.startsWith(typed)) return { input: { type: 'text', value: [...target].slice(0, 3).join('') } };
  if (rand() < 0.06) return { input: { type: 'enter' } }; // Enter sớm → bị máy chê
  return { input: { type: 'text', value: [...target].slice(0, [...typed].length + 2 + Math.floor(rand() * 3)).join('') } };
}

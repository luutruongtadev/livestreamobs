import { normalize } from './text.js';
import { compact } from './scorer.js';

/**
 * Kiểu chơi "Giải mã" (một kiểu trong vòng luân phiên của Đoán từ, cùng hàng Gần nghĩa / Thuộc tính / Tiếng Anh).
 * Câu bí ẩn tiếng Việt (tục ngữ, ca dao, câu nói hay…) — mỗi chữ cái là một ô có số; cùng số = cùng chữ cả vòng.
 * Mã hoá theo chữ gốc bỏ dấu: Ă / Â / Á… = A, Đ = D (để đáp án tiếng Anh ghép được với câu tiếng Việt).
 * Gợi ý: câu hỏi luôn tiếng Việt, đáp án tiếng Việt hoặc tiếng Anh. Kho: modewords/giaima.json. Không gọi Claude.
 */

/** Chữ cái gốc (A–Z, viết hoa) của 1 ký tự tiếng Việt / tiếng Anh; không phải chữ cái → null. */
export function letterKey(ch) {
  const n = normalize(ch);
  return /^[a-z]$/.test(n) ? n.toUpperCase() : null;
}

/** Tập chữ cái gốc của một chuỗi. */
export const letterSet = (s) => new Set([...String(s).normalize('NFC')].map(letterKey).filter(Boolean));

/** Tách câu thành các từ, mỗi từ là danh sách ký tự (giữ dấu, bỏ dấu câu). */
export function splitWords(s) {
  return String(s).normalize('NFC').split(/\s+/).map((w) => [...w].filter((c) => letterKey(c))).filter((w) => w.length);
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Chọn gợi ý cho một câu: chữ cái của gợi ý phải nằm trong câu, mỗi gợi ý mở thêm chữ mới,
 * che gần hết câu (chừa leaveHidden chữ), ưu tiên trộn cả tiếng Việt lẫn tiếng Anh, tránh gợi ý vừa dùng.
 * Trả về { clues, hidden } hoặc null nếu kho không đủ gợi ý cho câu này.
 */
export function pickClues(phrase, bank, { rng = Math.random, recent = new Set(), minClues = 4, maxClues = 6, leaveHidden = [1, 2], trials = 160 } = {}) {
  const L = letterSet(phrase);
  const words = new Set(normalize(phrase).split(' '));
  const seen = new Set();
  const cands = [];
  for (const c of bank) {
    const key = compact(c.a);
    if (!key || seen.has(key)) continue;
    const ls = letterSet(c.a);
    if (![...ls].every((x) => L.has(x))) continue;
    if (normalize(c.a) === normalize(phrase)) continue;
    seen.add(key);
    cands.push({ ...c, letters: ls, key, inPhrase: words.has(normalize(c.a)) });
  }
  const [hMin, hMax] = Array.isArray(leaveHidden) ? leaveHidden : [leaveHidden, leaveHidden];
  let best = null;
  for (let t = 0; t < trials; t++) {
    const pool = shuffle(cands, rng);
    const chosen = [];
    const covered = new Set();
    const want = hMin + Math.floor(rng() * (hMax - hMin + 1)); // số chữ để trống lần thử này
    while (chosen.length < maxClues && L.size - covered.size > want) {
      let pick = null, pickScore = -Infinity;
      for (const c of pool) {
        if (chosen.includes(c)) continue;
        const gain = [...c.letters].filter((x) => !covered.has(x)).length;
        if (!gain || L.size - covered.size - gain < want) continue; // không mở quá số chữ cần chừa
        const langs = new Set(chosen.map((x) => x.lang));
        // mỗi gợi ý mở vừa phải (2–3 chữ mới) để có 4–5 gợi ý như ô chữ thật, không để 1 từ dài mở gần hết câu
        let s = Math.min(gain, 3) * 10 - Math.max(0, gain - 4) * 6;
        if (!langs.has(c.lang)) s += 6; // trộn tiếng Việt + tiếng Anh
        if (recent.has(c.key)) s -= 25;
        if (c.inPhrase) s -= 8; // gợi ý trùng hẳn 1 từ trong câu: dễ quá
        if (c.key.length < 3) s -= 6;
        s += rng() * 6;
        if (s > pickScore) { pickScore = s; pick = c; }
      }
      if (!pick) break;
      chosen.push(pick);
      for (const x of pick.letters) covered.add(x);
    }
    const hidden = [...L].filter((x) => !covered.has(x));
    let score = 0;
    if (hidden.length < hMin || hidden.length > hMax) score -= 40 * Math.min(Math.abs(hidden.length - hMin), Math.abs(hidden.length - hMax));
    if (chosen.length < minClues) score -= 15 * (minClues - chosen.length);
    if (new Set(chosen.map((x) => x.lang)).size > 1) score += 8;
    score -= chosen.filter((x) => recent.has(x.key)).length * 12;
    score -= Math.abs(chosen.length - 5) * 6;
    score += rng();
    if (!best || score > best.score) best = { score, chosen, hidden };
  }
  if (!best || best.chosen.length < Math.min(minClues, 2) || best.hidden.length > hMax + 2) return null;
  // xếp gợi ý: đáp án ngắn trước cho dễ vào game
  const clues = best.chosen.sort((a, b) => a.key.length - b.key.length).map(({ q, a, e, lang, alt }) => ({ q, a, e: e || '❓', lang: lang === 'en' ? 'en' : 'vi', alt: alt || [] }));
  return { clues, hidden: best.hidden };
}

/**
 * Dựng một câu đố: chọn gợi ý + gán số ngẫu nhiên 1..n cho các chữ cái của câu.
 * phrase: { text, kind?, meaning? }. Trả về null nếu kho gợi ý không đủ cho câu này.
 */
export function buildPuzzle(phrase, clues, { rng = Math.random, recent = new Set(), minClues = 4, maxClues = 6, leaveHidden = [1, 2] } = {}) {
  const text = String(phrase.text || '').trim().replace(/\s+/g, ' ');
  if (letterSet(text).size < 3) return null;
  const built = pickClues(text, clues, { rng, recent, minClues, maxClues, leaveHidden });
  if (!built) return null;
  const letters = shuffle([...letterSet(text)], rng);
  const code = Object.fromEntries(letters.map((l, i) => [l, i + 1]));
  return { phrase: text, kind: phrase.kind || 'Câu bí ẩn', meaning: phrase.meaning || '', code, hidden: built.hidden, clues: built.clues };
}

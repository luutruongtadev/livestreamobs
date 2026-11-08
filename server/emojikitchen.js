import fs from 'node:fs';

const strip = (e) => String(e || '').replace(/️/g, '');

/**
 * Tra ảnh ghép emoji (Emoji Kitchen) cho 1 cặp emoji: ~620 emoji, ~147.000 cặp.
 * Dữ liệu nén trong modewords/emoji-kitchen.json: emoji[i] = [codepoint, ký tự, tên], pairs[i] = "j.d j.d …" (base36, d = chỉ số ngày phát hành).
 * Ảnh do trình duyệt / OBS tải thẳng từ gstatic.com — server không tốn gì.
 */
export class EmojiKitchen {
  constructor(data) {
    this.emoji = data?.emoji || [];
    this.dates = data?.dates || [];
    this.byChar = new Map(this.emoji.map(([, ch], i) => [strip(ch), i]));
    this.pairs = new Map();
    (data?.pairs || []).forEach((row, L) => {
      if (!row) return;
      for (const tok of row.split(' ')) {
        const [r, d] = tok.split('.');
        this.pairs.set(L * 1000 + parseInt(r, 36), parseInt(d, 36));
      }
    });
  }

  static load(file) {
    try { return new EmojiKitchen(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return new EmojiKitchen(null); }
  }

  get size() { return this.pairs.size; }
  has(e) { return this.byChar.has(strip(e)); }
  /** Ký tự chuẩn (đúng dạng trong bộ dữ liệu) của 1 emoji được hỗ trợ, không có thì null. */
  canonical(e) { const i = this.byChar.get(strip(e)); return i === undefined ? null : this.emoji[i][1]; }
  /** Toàn bộ emoji ghép được, nối liền (đưa vào prompt cho Claude chọn). */
  list() { return this.emoji.map((x) => x[1]).join(' '); }

  url(a, b) {
    const i = this.byChar.get(strip(a)), j = this.byChar.get(strip(b));
    if (i === undefined || j === undefined) return null;
    let L = i, R = j, d = this.pairs.get(i * 1000 + j);
    if (d === undefined) { L = j; R = i; d = this.pairs.get(j * 1000 + i); }
    if (d === undefined) return null;
    const u = (k) => 'u' + this.emoji[k][0].split('-').join('-u');
    return `https://www.gstatic.com/android/keyboard/emojikitchen/${this.dates[d]}/${u(L)}/${u(L)}_${u(R)}.png`;
  }
}

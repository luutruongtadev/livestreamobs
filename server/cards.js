import fs from 'node:fs';
import path from 'node:path';
import { normalize } from './text.js';
import { CARDS, CARD_BY_ID, RARITIES, CHEST_ODDS, cardScore, stars } from '../public/js/cards-data.js';

const pub = (u) => ({ id: u.id, name: u.name, avatar: u.avatar || null });

/**
 * Kho thẻ của người xem (lưu data/cards.json, không mất khi deploy).
 * - Người mới vào đấu trường lần đầu được 1 thẻ khởi đầu (Thường).
 * - Rương: thắng trận (rương vàng), tích đủ mảnh (rương thường).
 * - Mỗi lá có phẩm chất 60–100% và số seri riêng theo loài (#0001 là bản đầu tiên cả kênh).
 */
export class CardStore {
  constructor({ filePath, random = Math.random, now = () => Date.now(), maxCards = 40, chestEvery = 100 } = {}) {
    this.filePath = filePath;
    this.random = random;
    this.now = now;
    this.maxCards = maxCards;
    this.chestEvery = chestEvery;
    this.players = {};
    this.serials = {};
    this.dirty = false;
    this.load();
  }

  load() {
    if (!this.filePath) return;
    try {
      const s = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.players = s.players || {};
      this.serials = s.serials || {};
    } catch { /* chưa có */ }
  }

  save() {
    if (!this.filePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ players: this.players, serials: this.serials }));
    fs.renameSync(tmp, this.filePath);
    this.dirty = false;
  }

  get(id) { return this.players[id] || null; }

  player(user) {
    let p = this.players[user.id];
    if (!p) p = this.players[user.id] = { ...pub(user), cards: [], pick: null, shards: 0, wins: 0, kills: 0, games: 0, chests: 0 };
    if (user.name) p.name = user.name;
    if (user.avatar) p.avatar = user.avatar;
    return p;
  }

  rollRarity(chest = 'normal') {
    const odds = CHEST_ODDS[chest] || CHEST_ODDS.normal;
    const total = Object.values(odds).reduce((a, b) => a + b, 0);
    let r = this.random() * total;
    for (const [rar, w] of Object.entries(odds)) { if ((r -= w) < 0) return rar; }
    return Object.keys(odds)[0];
  }

  /** Phẩm chất 60–100, nghiêng về thấp: 95%+ rất hiếm. */
  rollQuality() { return 60 + Math.floor(Math.pow(this.random(), 1.7) * 41); }

  rollCard(rar) {
    const pool = CARDS.filter((c) => c.rar === rar);
    return pool[Math.floor(this.random() * pool.length)] || CARDS[0];
  }

  /** Mở một rương cho người chơi → lá bài mới (đã lưu vào kho). */
  open(user, chest = 'normal', { rar, cardId } = {}) {
    const p = this.player(user);
    const def = cardId ? CARD_BY_ID[cardId] : this.rollCard(rar || this.rollRarity(chest));
    const serial = (this.serials[def.id] = (this.serials[def.id] || 0) + 1);
    const inst = { uid: `${def.id}-${serial}`, card: def.id, q: this.rollQuality(), serial, at: this.now() };
    const isNew = !p.cards.some((c) => c.card === def.id);
    p.cards.push(inst);
    p.chests++;
    let dropped = null;
    if (p.cards.length > this.maxCards) {
      // kho đầy: bỏ lá yếu nhất (không bỏ lá đang chọn ra trận / lá vừa mở) → đổi thành mảnh
      const victims = p.cards.filter((c) => c.uid !== p.pick && c !== inst).sort((a, b) => cardScore(a) - cardScore(b));
      dropped = victims[0];
      p.cards = p.cards.filter((c) => c !== dropped);
      p.shards += 10;
    }
    this.dirty = true;
    return { ...inst, rar: def.rar, chest, isNew, firstEver: serial === 1, total: p.cards.length, dropped: dropped ? dropped.card : null };
  }

  /** Lá ra trận: lá đã chọn ("dùng rồng"), không thì lá mạnh nhất. */
  main(id) {
    const p = this.players[id];
    if (!p?.cards.length) return null;
    return p.cards.find((c) => c.uid === p.pick) || [...p.cards].sort((a, b) => cardScore(b) - cardScore(a))[0];
  }

  /** Comment "dùng rồng" / "chọn gà chọi" → chọn lá mạnh nhất của loài đó. */
  pickByText(id, text) {
    const p = this.players[id];
    if (!p?.cards.length) return null;
    const n = normalize(text);
    const def = CARDS.find((c) => normalize(c.name) === n || normalize(c.short || '') === n)
      || CARDS.find((c) => normalize(c.name).split(' ').some((w) => w.length >= 3 && w === n))
      || CARDS.find((c) => n.length >= 3 && normalize(c.name).includes(n));
    if (!def) return null;
    const best = p.cards.filter((c) => c.card === def.id).sort((a, b) => b.q - a.q)[0];
    if (!best) return { missing: def.id };
    p.pick = best.uid;
    this.dirty = true;
    return best;
  }

  /** Cộng mảnh; đủ chestEvery mảnh thì trả về số rương được mở (tối đa `max` lần một lúc, dư để dành). */
  addShards(user, n, max = 3) {
    const p = this.player(user);
    p.shards += Math.max(0, n);
    this.dirty = true;
    let chests = 0;
    while (p.shards >= this.chestEvery && chests < max) { p.shards -= this.chestEvery; chests++; }
    return chests;
  }

  record(user, { win = false, kills = 0 } = {}) {
    const p = this.player(user);
    p.games++;
    p.kills += kills;
    if (win) p.wins++;
    this.dirty = true;
  }

  summary(id, n = 3) {
    const p = this.players[id];
    if (!p) return null;
    const top = [...p.cards].sort((a, b) => cardScore(b) - cardScore(a)).slice(0, n);
    const byRar = {};
    for (const c of p.cards) { const r = CARD_BY_ID[c.card]?.rar; byRar[r] = (byRar[r] || 0) + 1; }
    const species = new Set(p.cards.map((c) => c.card)).size;
    return { ...pub(p), total: p.cards.length, species, ofSpecies: CARDS.length, byRar, top, shards: p.shards, chestEvery: this.chestEvery, wins: p.wins, kills: p.kills, games: p.games };
  }

  /** Bảng xếp hạng: thắng nhiều nhất, rồi bộ sưu tập giá trị nhất. */
  top(n = 5, by = 'wins') {
    const list = Object.values(this.players).filter((p) => !String(p.id).startsWith('bot:'));
    const value = (p) => p.cards.reduce((s, c) => s + 10 ** (RARITIES[CARD_BY_ID[c.card]?.rar]?.rank ?? 0), 0);
    const sorted = by === 'collection'
      ? list.sort((a, b) => value(b) - value(a) || b.cards.length - a.cards.length)
      : list.sort((a, b) => b.wins - a.wins || b.kills - a.kills);
    return sorted.slice(0, n).map((p) => {
      const best = [...p.cards].sort((a, b) => cardScore(b) - cardScore(a))[0] || null;
      return { ...pub(p), wins: p.wins, kills: p.kills, games: p.games, total: p.cards.length, best };
    });
  }

  /** Tra kho thẻ công khai theo tên hiển thị / id (trang /thebai). */
  find(query) {
    const n = normalize(query);
    if (!n) return [];
    const list = Object.values(this.players).filter((p) => !String(p.id).startsWith('bot:'));
    const exact = list.filter((p) => normalize(p.name) === n || normalize(p.id) === n);
    const res = exact.length ? exact : list.filter((p) => normalize(p.name).includes(n) || normalize(p.id).includes(n));
    return res.slice(0, 10).map((p) => ({ ...pub(p), wins: p.wins, kills: p.kills, games: p.games, shards: p.shards, chestEvery: this.chestEvery, pick: p.pick, cards: [...p.cards].sort((a, b) => cardScore(b) - cardScore(a)) }));
  }

  stats() {
    const players = Object.keys(this.players).length;
    let cards = 0;
    for (const p of Object.values(this.players)) cards += p.cards.length;
    return { players, cards, serials: { ...this.serials } };
  }

  resetWins() {
    for (const p of Object.values(this.players)) { p.wins = 0; p.kills = 0; p.games = 0; }
    this.dirty = true;
  }
}

export { stars };

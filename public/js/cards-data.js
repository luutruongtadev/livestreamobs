// Dữ liệu thẻ Thần thú — dùng chung cho server (luật, rương, kho thẻ) và trình duyệt (vẽ thẻ).

export const RARITIES = {
  C: { id: 'C', rank: 0, name: 'Thường', color: '#cfd6e4', deep: '#5b6474', glow: 'rgba(207,214,228,.55)', power: 1.0, size: 54 },
  R: { id: 'R', rank: 1, name: 'Hiếm', color: '#4aa3ff', deep: '#123a73', glow: 'rgba(74,163,255,.6)', power: 1.08, size: 58 },
  E: { id: 'E', rank: 2, name: 'Sử thi', color: '#b26bff', deep: '#3b1470', glow: 'rgba(178,107,255,.65)', power: 1.16, size: 64 },
  L: { id: 'L', rank: 3, name: 'Huyền thoại', color: '#f5c542', deep: '#6b4a05', glow: 'rgba(245,197,66,.75)', power: 1.25, size: 72 },
  M: { id: 'M', rank: 4, name: 'Thần thoại', color: '#ff4fa3', deep: '#5a0a3a', glow: 'rgba(255,79,163,.8)', power: 1.32, size: 80 },
};
export const RARITY_ORDER = ['C', 'R', 'E', 'L', 'M'];

// Tỉ lệ ra thẻ theo loại rương (%)
export const CHEST_ODDS = {
  starter: { C: 100 },
  normal: { C: 52, R: 30, E: 13, L: 4.5, M: 0.5 },
  gold: { R: 45, E: 38, L: 14, M: 3 },
};

/**
 * Kỹ năng: passive (luôn có) hoặc active (tự tung theo chu kỳ, giây).
 * Các trường được server/arena.js đọc trực tiếp.
 */
export const SKILLS = {
  crit: { icon: '💥', name: 'Cựa sắt', desc: '25% ra đòn chí mạng x2', crit: { chance: 0.25, mult: 2 } },
  armor: { icon: '🪨', name: 'Da trâu', desc: 'Giảm 25% sát thương phải nhận', armor: 0.25 },
  lifesteal: { icon: '🩸', name: 'Cắn hút máu', desc: 'Hồi lại 35% sát thương gây ra', lifesteal: 0.35 },
  ninelives: { icon: '🐾', name: 'Chín mạng', desc: 'Bị hạ lần đầu bật dậy với 35% máu', rebirth: 0.35 },
  dive: { icon: '💦', name: 'Lặn né', desc: '30% né hẳn đòn đánh', dodge: 0.3 },
  ram: { icon: '🐏', name: 'Húc văng', desc: 'Mỗi đòn hất đối thủ văng xa', knock: 2.4 },
  charge: { icon: '🐗', name: 'Lao húc', desc: 'Mỗi 6 giây lao tới đối thủ, đòn x1,8', active: { every: 6, type: 'dash', range: 320, mult: 1.8 } },
  rage: { icon: '😤', name: 'Cuồng nộ', desc: 'Càng ít máu đánh càng đau (tới x2)', rage: 1 },
  pounce: { icon: '🦅', name: 'Bổ nhào', desc: 'Mỗi 5 giây vồ con ở xa, đòn x2', active: { every: 5, type: 'dash', range: 440, mult: 2 } },
  stomp: { icon: '🦶', name: 'Dậm đất', desc: 'Mỗi 7 giây dậm đất hất văng cả vùng', active: { every: 7, type: 'aoe', radius: 150, mult: 1.3, knock: 700, fx: 'stomp' } },
  bearhug: { icon: '🐻', name: 'Gồng mình', desc: 'Giảm 35% sát thương phải nhận', armor: 0.35 },
  howl: { icon: '🌕', name: 'Tru trăng', desc: '30% chí mạng x1,8 · hạ gục hồi 30 máu', crit: { chance: 0.3, mult: 1.8 }, killHeal: 30 },
  roar: { icon: '🦁', name: 'Múa lân', desc: 'Mỗi 7 giây gầm làm choáng cả vùng 1,5 giây', active: { every: 7, type: 'aoe', radius: 180, mult: 0.7, stun: 1.5, fx: 'roar' } },
  holy: { icon: '✨', name: 'Thánh quang', desc: 'Mỗi giây hồi 3% máu', regen: 0.03 },
  phoenix: { icon: '🔥', name: 'Tái sinh', desc: 'Bị hạ lần đầu hồi sinh trong lửa với 60% máu', rebirth: 0.6 },
  venom: { icon: '☠️', name: 'Nọc độc', desc: 'Đòn đánh gây độc, mất máu 4 giây', poison: { dps: 0.6, sec: 4 } },
  dragonfire: { icon: '🔥', name: 'Long hỏa', desc: 'Mỗi 6 giây phun lửa thiêu cả vùng', active: { every: 6, type: 'aoe', radius: 200, mult: 2.2, knock: 320, fx: 'fire' } },
  shell: { icon: '🛡️', name: 'Mai thần', desc: 'Dưới 30% máu bật mai bất tử 5 giây + hồi 40% máu', shell: { at: 0.3, sec: 5, heal: 0.4 } },
  storm: { icon: '⚡', name: 'Cuồng phong', desc: 'Mỗi 8 giây đánh nhanh gấp 3 trong 3 giây', active: { every: 8, type: 'frenzy', sec: 3, rate: 3 } },
  thunder: { icon: '🌩️', name: 'Lôi long', desc: 'Mỗi 6 giây giáng 4 tia sét · hồi 1,5% máu/giây', active: { every: 6, type: 'thunder', n: 4, mult: 2.4 }, regen: 0.015 },
  giong: { icon: '🐎', name: 'Phi ngựa sắt', desc: 'Mỗi 6 giây phi ngựa lửa xuyên đội hình · giảm 20% sát thương', active: { every: 6, type: 'charge', len: 560, width: 100, mult: 2.4 }, armor: 0.2 },
};

// hp / atk / spd: hệ số so với chuẩn (100 máu, 10 công, tốc 1) · alias: tên gọi ngắn khi comment "vào rùa", "dùng hổ"
export const CARDS = [
  { id: 'ga', name: 'Gà Chọi', emoji: '🐓', rar: 'C', hp: 0.9, atk: 1.15, spd: 1.05, skill: 'crit', alias: ['gà', 'gà trống'] },
  { id: 'trau', name: 'Trâu Nước', emoji: '🐃', rar: 'C', hp: 1.2, atk: 0.95, spd: 0.88, skill: 'armor', alias: ['trâu'] },
  { id: 'cho', name: 'Chó Mực', emoji: '🐕', rar: 'C', hp: 1.0, atk: 1.0, spd: 1.05, skill: 'lifesteal', alias: ['chó', 'chó mực'] },
  { id: 'meo', name: 'Mèo Mướp', emoji: '🐈', rar: 'C', hp: 0.88, atk: 1.0, spd: 1.12, skill: 'ninelives', alias: ['mèo'] },
  { id: 'vit', name: 'Vịt Cỏ', emoji: '🦆', rar: 'C', hp: 0.9, atk: 0.95, spd: 1.08, skill: 'dive', alias: ['vịt'] },
  { id: 'de', name: 'Dê Núi', emoji: '🐐', rar: 'C', hp: 1.0, atk: 1.0, spd: 1.0, skill: 'ram', alias: ['dê'] },
  { id: 'heo', name: 'Heo Rừng', emoji: '🐗', rar: 'C', hp: 1.1, atk: 1.05, spd: 0.95, skill: 'charge', alias: ['heo', 'lợn', 'lợn rừng'] },
  { id: 'ho', name: 'Hổ Xám', emoji: '🐅', rar: 'R', hp: 1.0, atk: 1.15, spd: 1.05, skill: 'rage', alias: ['hổ', 'cọp'] },
  { id: 'daibang', name: 'Đại Bàng', emoji: '🦅', rar: 'R', hp: 0.85, atk: 1.1, spd: 1.2, skill: 'pounce', alias: ['đại bàng', 'chim ưng'] },
  { id: 'voi', name: 'Voi Chiến', emoji: '🐘', rar: 'R', hp: 1.3, atk: 1.0, spd: 0.85, skill: 'stomp', alias: ['voi'] },
  { id: 'gau', name: 'Gấu Ngựa', emoji: '🐻', rar: 'R', hp: 1.15, atk: 1.05, spd: 0.92, skill: 'bearhug', alias: ['gấu'] },
  { id: 'soi', name: 'Sói Núi', emoji: '🐺', rar: 'R', hp: 0.95, atk: 1.1, spd: 1.1, skill: 'howl', alias: ['sói', 'chó sói'] },
  { id: 'lan', name: 'Lân Vàng', emoji: '🦁', rar: 'E', hp: 1.1, atk: 1.05, spd: 1.0, skill: 'roar', alias: ['lân', 'sư tử'] },
  { id: 'kylan', name: 'Kỳ Lân', emoji: '🦄', rar: 'E', hp: 1.0, atk: 1.0, spd: 1.1, skill: 'holy', alias: ['kỳ lân', 'unicorn'] },
  { id: 'phuong', name: 'Phượng Lửa', emoji: '🦚', rar: 'E', hp: 0.9, atk: 1.1, spd: 1.12, skill: 'phoenix', alias: ['phượng', 'phượng hoàng', 'chim công'] },
  { id: 'ran', name: 'Rắn Thần', emoji: '🐍', rar: 'E', hp: 0.95, atk: 1.1, spd: 1.08, skill: 'venom', alias: ['rắn'] },
  { id: 'rong', name: 'Rồng Thiêng', emoji: '🐉', rar: 'L', hp: 1.1, atk: 1.1, spd: 1.0, skill: 'dragonfire', alias: ['rồng'] },
  { id: 'kimquy', name: 'Thần Kim Quy', emoji: '🐢', rar: 'L', hp: 1.3, atk: 0.95, spd: 0.85, skill: 'shell', alias: ['rùa', 'kim quy', 'rùa thần'] },
  { id: 'bachho', name: 'Bạch Hổ', emoji: '🐯', rar: 'L', hp: 1.0, atk: 1.15, spd: 1.12, skill: 'storm', alias: ['bạch hổ', 'hổ trắng'] },
  { id: 'longvuong', name: 'Long Vương', emoji: '🐲', rar: 'M', hp: 1.15, atk: 1.1, spd: 1.05, skill: 'thunder', alias: ['long vương', 'rồng thần'] },
  { id: 'giong', name: 'Ngựa Sắt Thánh Gióng', short: 'Thánh Gióng', emoji: '🐎', rar: 'M', hp: 1.2, atk: 1.1, spd: 1.1, skill: 'giong', alias: ['gióng', 'thánh gióng', 'ngựa', 'ngựa sắt'] },
];
export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** Phẩm chất 60–100% → số sao 1–5. */
export function stars(q) {
  return q >= 96 ? 5 : q >= 88 ? 4 : q >= 78 ? 3 : q >= 68 ? 2 : 1;
}

/** Chỉ số thật của một lá theo độ hiếm + phẩm chất. Phẩm chất 60% = 90% sức mạnh, 100% = 100%. */
export function statsOf(cardId, q = 80) {
  const c = CARD_BY_ID[cardId] || CARDS[0];
  const m = RARITIES[c.rar].power * (0.9 + 0.1 * Math.max(0, Math.min(40, q - 60)) / 40);
  return {
    hp: Math.round(100 * c.hp * m),
    atk: Math.round(10 * c.atk * m * 10) / 10,
    spd: Math.round(c.spd * (1 + (m - 1) * 0.35) * 100) / 100,
  };
}

/** Điểm để xếp hạng lá bài (độ hiếm trước, phẩm chất sau). */
export const cardScore = (inst) => (RARITIES[CARD_BY_ID[inst.card]?.rar]?.rank ?? 0) * 100 + (inst.q || 0);

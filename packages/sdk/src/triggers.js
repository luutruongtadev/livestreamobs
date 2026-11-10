import { normalize } from './text.js';

/**
 * Ánh xạ TRIGGER → ACTION, viết một lần cho mọi game (game không tự đọc quà / tim).
 *
 * binding = { id, action, trigger, label?, icon?, params? }
 * trigger:
 *   { type: 'gift', giftName? | gifts?: [], minDiamonds?, every? }
 *       Một món quà khớp tối đa MỘT binding: theo tên trước, không khớp tên thì theo số xu (ngưỡng cao nhất đạt được).
 *       Quà combo: ngưỡng xu tính trên cả chuỗi, chỉ kích hoạt khi tổng vừa vượt ngưỡng (không lặp mỗi lần chuỗi cộng thêm).
 *       Khớp theo tên: mỗi món kích hoạt 1 lần (tối đa 10 / sự kiện); khớp theo xu: 1 lần.
 *   { type: 'like', every }                       cả phòng thả đủ N tim → 1 lần
 *   { type: 'follow' | 'share' | 'member', every? }
 *   { type: 'keyword', text, cooldownSec? }       bình luận chứa cụm từ (không phân biệt dấu, nguyên từ)
 * every: gom đủ N (cộng dồn cả phòng) mới kích hoạt 1 lần; đếm lại khi game gọi reset() (vd đầu vòng).
 */
export function createTriggers(bindings = [], { now = () => Date.now() } = {}) {
  const list = (bindings || []).filter((b) => b && b.action && b.trigger?.type);
  const counters = new Map(); // binding.id → số đã gom (khi có every)
  const cooldown = new Map(); // `${binding.id}|${userId}` → lần kích hoạt gần nhất
  const names = (t) => [t.giftName, ...(t.gifts || [])].filter(Boolean).map((g) => String(g).toLowerCase());
  const keywordRe = new Map(list.filter((b) => b.trigger.type === 'keyword').map((b) => [b.id, new RegExp(`(^| )${normalize(b.trigger.text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`)]));

  function giftBinding(giftName, total) {
    const gifts = list.filter((b) => b.trigger.type === 'gift');
    const name = String(giftName || '').toLowerCase();
    const byName = name && gifts.find((b) => names(b.trigger).includes(name));
    if (byName) return byName;
    let best = null;
    for (const b of gifts) {
      const min = b.trigger.minDiamonds;
      if (min == null || names(b.trigger).length) continue;
      if (total >= min && (!best || min > best.trigger.minDiamonds)) best = b;
    }
    return best;
  }

  /** Cộng n vào bộ đếm của binding (nếu có every) → số lần kích hoạt. */
  function count(b, n, out) {
    const every = b.trigger.every;
    if (!every) return n;
    const c = (counters.get(b.id) || 0) + n;
    const times = Math.floor(c / every);
    counters.set(b.id, c % every);
    out.progress.push({ binding: b, count: c % every, every });
    return times;
  }

  function fire(b, times, out) { if (times > 0) out.fires.push({ binding: b, times: Math.min(10, times) }); }

  /** Một sự kiện → { fires: [{ binding, times }], progress: [{ binding, count, every }] }. */
  function feed(ev) {
    const out = { fires: [], progress: [] };
    if (!ev?.type) return out;
    const n = Math.max(1, Number(ev.count ?? ev.repeatCount) | 0 || 1);
    if (ev.type === 'gift') {
      const unit = Math.max(0, Number(ev.diamonds) || 0);
      const streak = ev.streakTotal != null ? Number(ev.streakTotal) : null;
      const b = giftBinding(ev.giftName, unit * (streak ?? n));
      if (!b) return out;
      const byName = names(b.trigger).length > 0;
      if (!byName && streak != null) {
        const before = unit * (streak - n);
        if (before > 0 && giftBinding(ev.giftName, before) === b) return out; // chuỗi đã vượt ngưỡng này từ trước
      }
      fire(b, b.trigger.every ? count(b, n, out) : byName ? n : 1, out);
      return out;
    }
    for (const b of list) {
      const t = b.trigger;
      if (t.type === 'like' && ev.type === 'like') fire(b, count(b, n, out), out);
      else if ((t.type === 'follow' || t.type === 'share' || t.type === 'member') && ev.type === t.type) fire(b, count(b, 1, out), out);
      else if (t.type === 'keyword' && ev.type === 'comment' && keywordRe.get(b.id).test(normalize(ev.text))) {
        const key = `${b.id}|${ev.user?.id ?? ''}`;
        const at = now();
        if (t.cooldownSec && at - (cooldown.get(key) ?? -Infinity) < t.cooldownSec * 1000) continue;
        cooldown.set(key, at);
        fire(b, count(b, 1, out), out);
      }
    }
    return out;
  }

  /** Game không áp dụng được hành động (vd hết chữ để lộ) → trả lại lượt: bộ đếm về every - 1 để lần sau kích hoạt ngay. */
  function refund(b) { if (b.trigger.every) counters.set(b.id, b.trigger.every - 1); }

  /** Đếm lại từ đầu (game gọi khi sang vòng mới). */
  function reset() { counters.clear(); }

  /** Trạng thái cho lớp UI chung / snapshot: mỗi binding kèm tiến độ gom. */
  function view() {
    return list.map((b) => ({ id: b.id, action: b.action, type: b.trigger.type, label: b.label || b.action, icon: b.icon || null, every: b.trigger.every || null, count: counters.get(b.id) || 0, trigger: b.trigger }));
  }

  /** Tiến độ gom (để nền tảng lưu kèm trạng thái game, reload overlay không mất). */
  function dump() { return Object.fromEntries([...counters].filter(([, v]) => v > 0)); }
  function load(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const b of list) {
      const v = Number(obj[b.id]);
      if (b.trigger.every && Number.isFinite(v) && v > 0) counters.set(b.id, Math.min(Math.floor(v), b.trigger.every - 1));
    }
  }

  return { feed, refund, reset, view, dump, load, bindings: list };
}

// ---- mô tả trigger cho màn hình (vd bảng "quà → tác dụng" của game) ----
const GIFT_VI = { rose: 'Hoa hồng', 'finger heart': 'Tim tay', tiktok: 'TikTok', 'heart me': 'Heart Me', 'ice cream cone': 'Kem ốc quế', doughnut: 'Bánh donut', galaxy: 'Thiên hà', lion: 'Sư tử', perfume: 'Nước hoa', 'hand hearts': 'Tim tay đôi', 'love you': 'Love you', gg: 'GG', 'money gun': 'Súng tiền', corgi: 'Chó Corgi', sunglasses: 'Kính râm', cap: 'Mũ lưỡi trai', 'hat and mustache': 'Mũ và ria' };
const GIFT_ICON = { rose: '🌹', 'finger heart': '🫰', 'ice cream cone': '🍦', doughnut: '🍩', galaxy: '🌌', lion: '🦁', perfume: '🧴', 'hand hearts': '🫶', 'heart me': '💗', 'love you': '💕', gg: '🎮', tiktok: '🎵', 'money gun': '💸', corgi: '🐕', sunglasses: '🕶️', cap: '🧢', 'hat and mustache': '🥸' };
const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0);

/** Tên quà tiếng Việt (nếu biết), không thì giữ tên gốc. */
export function giftLabel(name) { return GIFT_VI[String(name || '').toLowerCase()] || String(name || ''); }

/** Biểu tượng cho trigger: emoji quà quen thuộc, ❤️ tim, ➕ follow… (fallback 🎁). */
export function triggerIcon(trigger = {}) {
  const t = trigger || {};
  if (t.type === 'like') return '❤️';
  if (t.type === 'follow') return '➕';
  if (t.type === 'share') return '↗️';
  if (t.type === 'member') return '👋';
  if (t.type === 'keyword') return '💬';
  const first = [t.giftName, ...(t.gifts || [])].find(Boolean);
  return (first && GIFT_ICON[String(first).toLowerCase()]) || '🎁';
}

/** Mô tả ngắn của trigger: "Hoa hồng", "5 Hoa hồng", "300 tim", "quà ≥ 10 xu", "Follow", '"vào đội"'. */
export function triggerText(trigger = {}) {
  const t = trigger || {};
  const n = t.every && t.every > 1 ? `${fmtN(t.every)} ` : '';
  if (t.type === 'like') return `${fmtN(t.every || 1)} tim`;
  if (t.type === 'gift') {
    const names = [t.giftName, ...(t.gifts || [])].filter(Boolean);
    if (names.length) return `${n}${giftLabel(names[0])}${names.length > 1 ? '…' : ''}`;
    return `${n}${n ? 'quà ≥ ' : 'Quà ≥ '}${fmtN(t.minDiamonds ?? 1)} xu`;
  }
  if (t.type === 'follow') return n ? `${n}follow` : 'Follow';
  if (t.type === 'share') return n ? `${n}share` : 'Share';
  if (t.type === 'member') return `${n || ''}người vào live`.trim();
  if (t.type === 'keyword') return `"${t.text || ''}"`;
  return '';
}

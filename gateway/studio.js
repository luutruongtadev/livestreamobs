// Studio của kênh (dùng chung mọi game): bố cục widget trên khung 9:16 + luật âm thanh, và số liệu phiên live
// (xu, tim, follow… + người tặng nhiều nhất) mà gateway đếm từ mọi sự kiện rồi phát cho mọi overlay.
import { resolveSettings, triggerErrors, TRIGGER_TYPES, cleanPanels } from '#sdk';
import { SOUNDS } from '../web/js/sounds.js';

export const CANVAS = { w: 1080, h: 1920 };
// giới hạn gói miễn phí (sau này đổi theo profiles.plan)
export const STUDIO_LIMITS = { widgets: 12, sounds: 20 };
export const SOUND_WHEN = [...TRIGGER_TYPES, 'goal'];

const str = (v, max) => String(v ?? '').slice(0, max);
const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const ID = /^[A-Za-z0-9_.-]{1,40}$/;

/** Trigger do streamer gửi lên → dạng sạch (ném lỗi nếu sai). Dùng chung cho bindings của game và luật âm thanh. */
export function cleanTrigger(t = {}, where = 'trigger') {
  const trigger = { type: t.type };
  if (t.giftName) trigger.giftName = str(t.giftName, 40);
  if (Array.isArray(t.gifts)) trigger.gifts = t.gifts.slice(0, 20).map((g) => str(g, 40)).filter(Boolean);
  if (t.minDiamonds != null) trigger.minDiamonds = num(t.minDiamonds, 0, 100000);
  if (t.every != null) trigger.every = Math.round(num(t.every, 1, 1_000_000, 1));
  if (t.text) trigger.text = str(t.text, 40);
  if (t.cooldownSec != null) trigger.cooldownSec = num(t.cooldownSec, 0, 3600);
  const errs = TRIGGER_TYPES.includes(trigger.type) ? triggerErrors(trigger, where) : [`${where}: loại kích hoạt không hợp lệ`];
  if (errs.length) throw new Error(errs[0]);
  return trigger;
}

/**
 * Kiểm tra studio streamer gửi lên. widgets: catalog widget (widget.json) theo id.
 * Trả về bản sạch: toạ độ nằm trong khung, config theo schema của widget (sai → default), âm thanh có trong thư viện.
 */
export function checkStudio(input, widgets = [], games = []) {
  const byType = new Map(widgets.map((w) => [w.id, w]));
  const s = input && typeof input === 'object' ? input : {};
  const list = Array.isArray(s.widgets) ? s.widgets : [];
  const rules = Array.isArray(s.sounds) ? s.sounds : [];
  if (list.length > STUDIO_LIMITS.widgets) throw new Error(`Tối đa ${STUDIO_LIMITS.widgets} widget trên một khung`);
  if (rules.length > STUDIO_LIMITS.sounds) throw new Error(`Tối đa ${STUDIO_LIMITS.sounds} luật âm thanh`);
  const seen = new Set();
  const out = { widgets: [], sounds: [], panels: {}, scenes: cleanScenes(s.scenes) };
  list.forEach((w, i) => {
    const meta = byType.get(w?.type);
    if (!meta) throw new Error(`widget[${i}]: không có loại "${w?.type}"`);
    let id = ID.test(String(w.id || '')) ? String(w.id) : `${meta.id}-${i}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const min = meta.minSize || { w: 120, h: 60 };
    const ww = Math.round(num(w.w, min.w, CANVAS.w, meta.size?.w || 400));
    const hh = Math.round(num(w.h, min.h, CANVAS.h, meta.size?.h || 200));
    out.widgets.push({
      id, type: meta.id,
      x: Math.round(num(w.x, 0, CANVAS.w - ww, 0)), y: Math.round(num(w.y, 0, CANVAS.h - hh, 0)), w: ww, h: hh,
      config: resolveSettings(meta.schema || { type: 'object', properties: {} }, w.config || {}).settings,
    });
  });
  const ids = new Set(SOUNDS.map((x) => x.id));
  rules.forEach((r, i) => {
    const where = `âm thanh[${i}]`;
    const t = r?.when || {};
    const when = t.type === 'goal' ? { type: 'goal', ...(t.goal ? { goal: str(t.goal, 40) } : {}) } : cleanTrigger(t, where);
    let url = null;
    if (r.sound === 'url') {
      url = str(r.url, 500).trim();
      if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) throw new Error(`${where}: link âm thanh phải bắt đầu bằng https://`);
    } else if (!ids.has(r.sound)) throw new Error(`${where}: không có âm thanh "${r.sound}"`);
    out.sounds.push({ id: ID.test(String(r.id || '')) ? String(r.id) : `s${i}`, when, sound: r.sound, ...(url ? { url } : {}), volume: num(r.volume, 0, 1, 0.8) });
  });
  // bảng của từng game (vị trí / cỡ / ẩn) — chỉ game có manifest.panels, bảng lạ bị bỏ
  const panels = s.panels && typeof s.panels === 'object' ? s.panels : {};
  for (const g of games) {
    if (!g?.panels?.length || !panels[g.id]) continue;
    const clean = cleanPanels(g, panels[g.id]);
    if (Object.keys(clean).length) out.panels[g.id] = clean;
  }
  return out;
}

export const SCENE_THEMES = ['tim', 'dem', 'cam', 'xanh', 'hong'];
export const SCENE_DEFAULTS = {
  intro: { title: 'LIVE SẮP BẮT ĐẦU', subtitle: 'Chờ chút nhé, mình đang chuẩn bị 💖', countdownMin: 5, autoLive: false, theme: 'tim', image: '', showChat: true },
  outro: { title: 'CẢM ƠN MỌI NGƯỜI!', subtitle: 'Hẹn gặp lại ở buổi live sau nha 👋', warnMin: 5, pauseGame: true, theme: 'dem', image: '', showTop: true },
};
const httpsUrl = (v) => { const u = str(v, 500).trim(); return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; };

/** Cấu hình màn chuẩn bị / màn kết thúc live (làm sạch, thiếu → mặc định). */
export function cleanScenes(input) {
  const i = input && typeof input === 'object' ? input : {};
  const a = { ...SCENE_DEFAULTS.intro, ...(i.intro || {}) }, b = { ...SCENE_DEFAULTS.outro, ...(i.outro || {}) };
  return {
    intro: {
      title: str(a.title, 60), subtitle: str(a.subtitle, 160), countdownMin: Math.round(num(a.countdownMin, 0, 180, 5)), autoLive: a.autoLive === true,
      theme: SCENE_THEMES.includes(a.theme) ? a.theme : 'tim', image: httpsUrl(a.image), showChat: a.showChat !== false,
    },
    outro: {
      title: str(b.title, 60), subtitle: str(b.subtitle, 160), warnMin: Math.round(num(b.warnMin, 0, 60, 5)), pauseGame: b.pauseGame !== false,
      theme: SCENE_THEMES.includes(b.theme) ? b.theme : 'dem', image: httpsUrl(b.image), showTop: b.showTop !== false,
    },
  };
}

/** Trạng thái màn hiện tại do streamer bấm: live / intro (chuẩn bị) / outro (kết thúc) + hẹn giờ tắt (endAt, ms). */
export function checkScene(p = {}, now = Date.now()) {
  const mode = ['live', 'intro', 'outro'].includes(p.mode) ? p.mode : null;
  if (!mode) throw new Error('Màn hình không hợp lệ');
  let endAt = null;
  if (p.endAt != null) {
    endAt = Math.round(Number(p.endAt));
    if (!Number.isFinite(endAt) || endAt < now - 60_000 || endAt > now + 24 * 3600_000) throw new Error('Giờ tắt live phải trong vòng 24 giờ tới');
  }
  return { mode, at: now, endAt };
}

/** Âm thanh bấm tay từ soundboard của dashboard → lệnh sạch cho overlay (ném lỗi nếu sai). */
export function checkSfx(p = {}) {
  const sound = String(p.sound || '');
  if (sound === 'url') {
    const url = str(p.url, 500).trim();
    if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) throw new Error('Link âm thanh phải bắt đầu bằng https://');
    return { sound, url, volume: num(p.volume, 0, 1, 0.8) };
  }
  if (!SOUNDS.some((x) => x.id === sound)) throw new Error(`Không có âm thanh "${sound}"`);
  return { sound, volume: num(p.volume, 0, 1, 0.8) };
}

/** Số liệu phiên live của kênh: đếm từ lúc bắt đầu (hoặc lúc streamer bấm "đặt lại"). */
export class SessionStats {
  constructor(now = () => Date.now()) { this.now = now; this.reset(); }
  reset() {
    this.since = this.now();
    this.t = { diamonds: 0, gifts: 0, likes: 0, follows: 0, shares: 0, comments: 0, members: 0 };
    this.gifters = new Map(); // user id → { id, name, avatar, diamonds }
    this.dirty = true;
  }
  add(e) {
    const t = this.t;
    switch (e?.type) {
      case 'gift': {
        const n = Math.max(1, Number(e.count ?? e.repeatCount) || 1);
        const d = Math.max(0, Number(e.diamonds) || 0) * n;
        t.gifts += n; t.diamonds += d;
        const id = String(e.user?.id ?? '');
        if (id && d > 0) {
          const g = this.gifters.get(id) || { id, name: str(e.user?.name || 'Ẩn danh', 40), avatar: e.user?.avatar || null, diamonds: 0 };
          g.diamonds += d; g.name = str(e.user?.name || g.name, 40); g.avatar = e.user?.avatar || g.avatar;
          this.gifters.set(id, g);
          if (this.gifters.size > 5000) this.gifters.delete(this.gifters.keys().next().value);
        }
        break;
      }
      case 'like': t.likes += Math.max(1, Number(e.count) || 1); break;
      case 'follow': t.follows++; break;
      case 'share': t.shares++; break;
      case 'comment': t.comments++; break;
      case 'member': t.members++; break;
      default: return;
    }
    this.dirty = true;
  }
  view() {
    return { since: this.since, ...this.t, gifters: [...this.gifters.values()].sort((a, b) => b.diamonds - a.diamonds).slice(0, 10) };
  }
}

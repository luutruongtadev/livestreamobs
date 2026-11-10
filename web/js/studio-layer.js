// Lớp Studio của overlay: widget (DOM) xếp trên khung 1080×1920 đè lên canvas game + luật âm thanh.
// Dữ liệu widget: số liệu phiên do gateway đếm ('st'), sự kiện ('ev' ở overlay chính / 'sx' ở overlay khác),
// bảng quà của game đang chơi (overlay tính từ bindings). Widget lỗi chỉ hỏng ô của nó.
import { createTriggers } from '#sdk';
import { createSoundPlayer } from './sounds.js';

const W = 1080, H = 1920;
let catalogP = null;
const catalog = () => (catalogP ||= fetch('/api/widgets').then((r) => (r.ok ? r.json() : [])).catch(() => []));
const modules = new Map(); // type → Promise<module>
const load = (type) => { if (!modules.has(type)) modules.set(type, import(`/widgets/${type}/index.js`)); return modules.get(type); };

/**
 * createStudioLayer({ canSound: () => bool, muted }) → { el, setStudio, setStats, setLegend, event, fit, resumeAudio, destroy }
 */
export function createStudioLayer({ canSound = () => false, muted = false, editing = false } = {}) {
  const el = document.createElement('div');
  el.className = 'studio-layer';
  Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px`, transformOrigin: '0 0', pointerEvents: 'none', zIndex: '2' });
  const player = createSoundPlayer({ muted });
  let studio = { widgets: [], sounds: [] };
  let items = []; // { id, w, box, inst }
  let data = { stats: null, lb: null, legend: [] };
  let triggers = createTriggers([]);
  let token = 0;
  const recent = []; // thời điểm phát gần đây — chặn spam âm thanh

  function play(rule) {
    if (!canSound()) return;
    const now = performance.now();
    while (recent.length && now - recent[0] > 1000) recent.shift();
    if (recent.length >= 4) return; // tối đa 4 âm / giây
    recent.push(now);
    player.play(rule.sound, { volume: rule.volume ?? 0.8, url: rule.url });
  }

  function onSignal(widgetId, name) {
    if (name !== 'goal') return;
    for (const r of studio.sounds || []) if (r.when?.type === 'goal' && (!r.when.goal || r.when.goal === widgetId)) play(r);
  }

  async function setStudio(next) {
    studio = { widgets: [], sounds: [], ...(next || {}) };
    triggers = createTriggers((studio.sounds || []).filter((r) => r.when?.type !== 'goal').map((r) => ({ id: r.id, action: 'sound', trigger: r.when, rule: r })));
    const my = ++token;
    const metas = await catalog();
    if (my !== token) return;
    for (const it of items) { try { it.inst?.destroy(); } catch { /* bỏ qua */ } it.box.remove(); }
    items = [];
    for (const w of studio.widgets || []) {
      const box = document.createElement('div');
      Object.assign(box.style, { position: 'absolute', left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px` });
      el.append(box);
      const it = { id: w.id, w, box, inst: null };
      items.push(it);
      const meta = metas.find((m) => m.id === w.type);
      if (!meta) continue;
      load(w.type).then((mod) => {
        if (my !== token) return;
        it.inst = mod.mount(box, { config: w.config || {}, editing, signal: (name, p) => onSignal(w.id, name, p) });
        it.inst.update?.(data);
      }).catch((e) => console.warn(`[studio] widget ${w.type} lỗi:`, e));
    }
  }

  function each(fn) { for (const it of items) { if (!it.inst) continue; try { fn(it.inst); } catch (e) { console.warn('[studio]', e); } } }
  function push() { each((i) => i.update?.(data)); }

  return {
    el,
    setStudio,
    setStats(st) { data = { ...data, stats: st, lb: st?.lb ?? data.lb }; push(); },
    setLegend(list) { data = { ...data, legend: list || [] }; push(); },
    /** Sự kiện chuẩn hoá: widget thông báo / bình luận + luật âm thanh. */
    event(e) {
      if (!e?.type) return;
      if (e.type !== 'like') each((i) => i.event?.(e));
      const out = triggers.feed(e);
      for (const f of out.fires) play(f.binding.rule);
    },
    /** Đặt lớp khớp với vùng vẽ: left/top (px) + tỉ lệ so với 1080×1920. */
    fit(scale) { el.style.transform = `scale(${scale})`; },
    /** Soundboard: phát ngay (vẫn qua giới hạn 4 âm / giây và chỉ ở overlay được phép phát). */
    playNow(s) { play(s); },
    resumeAudio() { player.resume(); },
    destroy() { token++; for (const it of items) { try { it.inst?.destroy(); } catch { /* bỏ qua */ } } items = []; player.close(); el.remove(); },
  };
}

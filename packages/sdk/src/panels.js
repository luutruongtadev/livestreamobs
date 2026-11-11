/**
 * Bảng của game mà streamer chỉnh vị trí / cỡ / ẩn trong Studio (tránh bị bình luận TikTok che).
 * manifest.panels: [{ id, label, icon?, rect: { x, y, w, h }, when?: { <setting>: <giá trị> } }]  — rect = vị trí mặc định trên canvas.
 * Studio lưu theo kênh: studio.panels[gameId][panelId] = { x, y, s, hidden }  (s = tỉ lệ phóng, giữ nguyên tỉ lệ khung).
 * Renderer nhận bản lưu qua view.layout(map) rồi vẽ bảng trong toạ độ gốc (0, 0) của nó bằng withPanel().
 */
const fin = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

/** Vị trí đang dùng của một bảng: bản lưu (nếu có) đè lên mặc định def = { x, y }. */
export function panelOf(layout, id, def) {
  const o = layout && typeof layout === 'object' ? layout[id] || {} : {};
  const s = fin(o.s, 1);
  return { x: fin(o.x, def.x), y: fin(o.y, def.y), s: s > 0 ? s : 1, hidden: o.hidden === true };
}

/** Vẽ fn() trong khung của bảng (dịch tới x, y và phóng s). Bảng bị ẩn thì bỏ qua. */
export function withPanel(ctx, p, fn) {
  if (!p || p.hidden) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.s !== 1) ctx.scale(p.s, p.s);
  try { fn(); } finally { ctx.restore(); }
}

/** Các bảng của manifest đang áp dụng với cài đặt hiện tại (lọc theo when). */
export function activePanels(manifest, settings = {}) {
  return (manifest?.panels || []).filter((p) => !p.when || Object.entries(p.when).every(([k, v]) => (settings?.[k] ?? null) === v || (Array.isArray(v) && v.includes(settings?.[k]))));
}

export const PANEL_SCALE = { min: 0.4, max: 2 };

/** Làm sạch bản lưu của một game theo manifest.panels (bỏ bảng lạ, kẹp toạ độ / tỉ lệ). */
export function cleanPanels(manifest, input, canvas = manifest?.canvas || { width: 1080, height: 1920 }) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const p of manifest?.panels || []) {
    const o = input[p.id];
    if (!o || typeof o !== 'object') continue;
    const s = Math.round(Math.max(PANEL_SCALE.min, Math.min(PANEL_SCALE.max, fin(o.s, 1))) * 100) / 100;
    const w = p.rect.w * s, h = p.rect.h * s;
    out[p.id] = {
      x: Math.round(Math.max(-w / 2, Math.min(canvas.width - w / 2, fin(o.x, p.rect.x)))),
      y: Math.round(Math.max(-h / 2, Math.min(canvas.height - h / 2, fin(o.y, p.rect.y)))),
      s, hidden: o.hidden === true,
    };
  }
  return out;
}

/**
 * Cách dùng gọn cho renderer có sẵn: fn() vẫn vẽ ở toạ độ mặc định (tuyệt đối) def = { x, y } (góc trên trái của bảng);
 * nếu streamer đã kéo / phóng / ẩn bảng trong Studio thì nội dung được dời theo.
 */
export function drawPanel(ctx, layout, id, def, fn) {
  const p = panelOf(layout, id, def);
  withPanel(ctx, p, () => { ctx.translate(-def.x, -def.y); fn(); });
}

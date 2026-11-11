/** Phiên bản hợp đồng game ↔ nền tảng. Đổi phá vỡ tương thích → tăng major (game khai báo "sdk": "^1.0.0" vẫn chạy qua adapter). */
export const SDK_VERSION = '1.0.0';

export const EVENT_TYPES = ['comment', 'gift', 'like', 'follow', 'share', 'member'];
export const TRIGGER_TYPES = ['gift', 'like', 'follow', 'share', 'member', 'keyword'];
export const GAME_STATUS = ['dev', 'beta', 'live', 'retired'];
/** Lệnh nền tảng tự xử lý cho mọi game (game không cần khai báo). */
export const PLATFORM_COMMANDS = ['pause', 'resume'];

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.]+)?$/;
const ID = /^[a-z][a-z0-9-]{1,31}$/;

export const parseSemver = (v) => { const m = SEMVER.exec(String(v || '')); return m ? m.slice(1, 4).map(Number) : null; };

/** Kiểm tra version có thoả range dạng "^x.y.z" / "x.y.z" (đủ cho hợp đồng SDK). */
export function satisfies(version, range) {
  const v = parseSemver(version);
  const r = String(range || '').trim();
  if (!v) return false;
  if (r.startsWith('^')) {
    const b = parseSemver(r.slice(1));
    if (!b) return false;
    if (v[0] !== b[0]) return false;
    if (b[0] === 0 && v[1] !== b[1]) return false;
    return v[1] > b[1] || (v[1] === b[1] && v[2] >= b[2]);
  }
  const b = parseSemver(r);
  return !!b && b.every((x, i) => x === v[i]);
}

/** Kiểm tra một trigger. */
export function triggerErrors(t, at) {
  const errs = [];
  if (!t || !TRIGGER_TYPES.includes(t.type)) return [`${at}: type phải là ${TRIGGER_TYPES.join(' | ')}`];
  if (t.every != null && !(Number.isInteger(t.every) && t.every >= 1)) errs.push(`${at}: every phải là số nguyên ≥ 1`);
  if (t.type === 'gift' && !t.giftName && !(Array.isArray(t.gifts) && t.gifts.length) && t.minDiamonds == null) errs.push(`${at}: quà cần giftName, gifts hoặc minDiamonds`);
  if (t.type === 'like' && !(t.every >= 1)) errs.push(`${at}: tim cần every`);
  if (t.type === 'keyword' && !String(t.text || '').trim()) errs.push(`${at}: từ khoá cần text`);
  return errs;
}

/** Kiểm tra manifest.json của game → danh sách lỗi (rỗng = hợp lệ). */
export function validateManifest(m) {
  const errs = [];
  if (!m || typeof m !== 'object') return ['manifest không phải object'];
  if (!ID.test(m.id || '')) errs.push('id: chữ thường a-z, số, gạch ngang; 2–32 ký tự, bắt đầu bằng chữ');
  if (!String(m.name || '').trim()) errs.push('name: bắt buộc');
  if (!parseSemver(m.version)) errs.push('version: phải là semver (vd 1.0.0)');
  if (!m.sdk || !satisfies(SDK_VERSION, m.sdk)) errs.push(`sdk: "${m.sdk}" không tương thích SDK ${SDK_VERSION}`);
  if (!GAME_STATUS.includes(m.status)) errs.push(`status: ${GAME_STATUS.join(' | ')}`);
  if (!Array.isArray(m.inputs) || m.inputs.some((t) => !EVENT_TYPES.includes(t))) errs.push(`inputs: mảng con của ${EVENT_TYPES.join(', ')}`);
  const c = m.canvas;
  if (!c || !(c.width > 0) || !(c.height > 0)) errs.push('canvas: { width, height } bắt buộc');
  const ids = (list, what) => {
    if (list == null) return;
    if (!Array.isArray(list)) { errs.push(`${what}: phải là mảng`); return; }
    const seen = new Set();
    list.forEach((x, i) => {
      if (!/^[a-z][a-z0-9_-]{0,31}$/.test(x?.id || '')) errs.push(`${what}[${i}].id không hợp lệ`);
      if (seen.has(x?.id)) errs.push(`${what}: trùng id "${x.id}"`);
      seen.add(x?.id);
      if (!String(x?.label || '').trim()) errs.push(`${what}[${i}].label bắt buộc`);
    });
  };
  ids(m.actions, 'actions');
  ids(m.commands, 'commands');
  for (const [i, a] of (m.actions || []).entries()) for (const [j, t] of (a.defaultTriggers || []).entries()) errs.push(...triggerErrors(t, `actions[${i}].defaultTriggers[${j}]`));
  for (const c2 of m.commands || []) if (PLATFORM_COMMANDS.includes(c2.id)) errs.push(`commands: "${c2.id}" là lệnh của nền tảng, không khai báo lại`);
  if (m.data != null && (typeof m.data !== 'object' || Object.values(m.data).some((p) => typeof p !== 'string' || p.includes('..') || p.startsWith('/')))) errs.push('data: { tên: "đường-dẫn-trong-thư-mục-game" }');
  if (m.server != null && typeof m.server !== 'boolean') errs.push('server: true | false');
  if (m.secrets != null && !(Array.isArray(m.secrets) && m.secrets.every((x) => /^[A-Z][A-Z0-9_]*$/.test(x)))) errs.push('secrets: mảng tên biến môi trường (CHỮ_HOA)');
  if (m.panels != null) {
    if (!Array.isArray(m.panels)) errs.push('panels: phải là mảng');
    else {
      const seen = new Set();
      m.panels.forEach((p, i) => {
        if (!/^[a-z][a-zA-Z0-9_-]{0,31}$/.test(p?.id || '') || seen.has(p.id)) errs.push(`panels[${i}].id không hợp lệ hoặc trùng`);
        seen.add(p?.id);
        if (!String(p?.label || '').trim()) errs.push(`panels[${i}].label bắt buộc`);
        const r = p?.rect;
        if (!r || ![r.x, r.y, r.w, r.h].every(Number.isFinite) || !(r.w > 0 && r.h > 0)) errs.push(`panels[${i}].rect: { x, y, w, h } (số)`);
        if (p?.when != null && (typeof p.when !== 'object' || Array.isArray(p.when))) errs.push(`panels[${i}].when: { tênCàiĐặt: giá trị }`);
      });
    }
  }
  if (m.restore != null && !['full', 'partial'].includes(m.restore)) errs.push('restore: "full" (khôi phục nguyên ván) | "partial" (chỉ giữ dữ liệu bền, ván mới bắt đầu lại)');
  return errs;
}

/** Bindings mặc định (trigger → action) sinh từ manifest, dùng khi streamer chưa tự gán. */
export function defaultBindings(manifest) {
  const out = [];
  for (const a of manifest.actions || []) {
    (a.defaultTriggers || []).forEach((trigger, i) => out.push({ id: `${a.id}.${i}`, action: a.id, trigger, label: a.label, icon: a.icon || null, params: a.params || {} }));
  }
  return out;
}

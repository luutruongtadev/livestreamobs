/**
 * JSON Schema tối giản cho cài đặt game (không cần thư viện ngoài).
 * Hỗ trợ: type (object | array | string | number | integer | boolean), properties, default, enum,
 * minimum, maximum, minLength, maxLength, items, minItems, maxItems, uniqueItems. title / description dùng cho form dashboard.
 */

const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v);
const isType = (v, t) => (t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t);

/** Kiểm tra value theo schema → danh sách lỗi (rỗng = hợp lệ). */
export function validate(schema, value, at = '') {
  const errs = [];
  const where = at || '(gốc)';
  if (!schema || typeof schema !== 'object') return errs;
  if (schema.type && !isType(value, schema.type)) return [`${where}: cần kiểu ${schema.type}, nhận ${typeOf(value)}`];
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errs.push(`${where}: phải là một trong ${JSON.stringify(schema.enum)}`);
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${where}: nhỏ nhất ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${where}: lớn nhất ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${where}: tối thiểu ${schema.minLength} ký tự`);
    if (schema.maxLength != null && value.length > schema.maxLength) errs.push(`${where}: tối đa ${schema.maxLength} ký tự`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${where}: tối thiểu ${schema.minItems} phần tử`);
    if (schema.maxItems != null && value.length > schema.maxItems) errs.push(`${where}: tối đa ${schema.maxItems} phần tử`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errs.push(`${where}: phần tử bị trùng`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${at}[${i}]`)));
  }
  if (schema.type === 'object' && value && typeof value === 'object') {
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (value[k] !== undefined) errs.push(...validate(sub, value[k], at ? `${at}.${k}` : k));
    }
  }
  return errs;
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Điền default cho mọi trường còn thiếu (đệ quy với object). Không sửa input. */
export function withDefaults(schema, value) {
  if (!schema || typeof schema !== 'object') return clone(value);
  if (schema.type === 'object') {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : (clone(schema.default) || {});
    const out = { ...clone(src) };
    for (const [k, sub] of Object.entries(schema.properties || {})) out[k] = withDefaults(sub, out[k]);
    return out;
  }
  return value === undefined ? clone(schema.default) : clone(value);
}

/**
 * Cài đặt người dùng gửi lên → cài đặt dùng được: điền default, trường sai kiểu / ngoài khoảng thì quay về default
 * (không để một trường sai làm hỏng cả game). Trả về { settings, errors }.
 */
export function resolveSettings(schema, input = {}) {
  const errors = [];
  const fix = (sch, val, at) => {
    if (sch?.type === 'object') {
      const out = {};
      const src = val && typeof val === 'object' && !Array.isArray(val) ? val : {};
      for (const [k, sub] of Object.entries(sch.properties || {})) out[k] = fix(sub, src[k], at ? `${at}.${k}` : k);
      return out;
    }
    if (val === undefined) return clone(sch?.default);
    const e = validate(sch, val, at);
    if (e.length) { errors.push(...e); return clone(sch?.default); }
    return clone(val);
  };
  return { settings: fix(schema, input, ''), errors };
}

/** Các trường lá (không phải object) thiếu default — chuẩn module bắt buộc mọi trường có default. */
export function missingDefaults(schema, at = '') {
  if (schema?.type === 'object') return Object.entries(schema.properties || {}).flatMap(([k, s]) => missingDefaults(s, at ? `${at}.${k}` : k));
  return schema && schema.default === undefined ? [at || '(gốc)'] : [];
}

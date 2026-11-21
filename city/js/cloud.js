// Phố Mới — lưu đám mây (giai đoạn B, city/MULTIPLAYER.md): đăng nhập bằng tài khoản của nền tảng
// (Supabase Auth giống dashboard: tên đăng nhập + mật khẩu; máy chủ chạy thử thì dùng DEV token) rồi gọi /api/city/saves.
// Không có window.PLATFORM (mở file tĩnh không qua gateway) thì đám mây tắt, game vẫn lưu trong trình duyệt như cũ.

const P = (typeof window !== 'undefined' && window.PLATFORM) || null;
export const CLOUD_SLOTS = [['auto', 'Tự lưu'], ['slot1', 'Ô mây 1'], ['slot2', 'Ô mây 2'], ['slot3', 'Ô mây 3']];
export const CLOUD_EVERY_MS = 5 * 60 * 1000;

let supa = null;
const USERNAME = /^[a-z0-9._-]{3,30}$/;
const domain = () => String((P && P.usernameDomain) || location.hostname).toLowerCase();
function toEmail(login) {
  const v = String(login || '').trim().toLowerCase();
  if (v.includes('@')) return v;
  if (!USERNAME.test(v)) throw new Error('Tên đăng nhập 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang');
  return `${v}@${domain()}`;
}
export const displayName = (email) => (email && email.endsWith(`@${domain()}`) ? email.slice(0, -domain().length - 1) : email || 'bạn');
const AUTH_ERR = { 'Invalid login credentials': 'Sai tên đăng nhập hoặc mật khẩu', 'User already registered': 'Tên đăng nhập này đã có người dùng', 'Signups not allowed for this instance': 'Máy chủ đang tắt đăng ký mới' };

/** Đám mây có bật không: Supabase (đăng nhập thật) / dev (DEV token) / null (không có gateway). */
export const cloudMode = () => (!P ? null : P.supabaseUrl && P.supabaseKey ? 'supabase' : P.store === 'file' ? 'dev' : null);

async function client() {
  if (supa) return supa;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  supa = createClient(P.supabaseUrl, P.supabaseKey); // phiên dùng chung với dashboard (cùng tên miền)
  return supa;
}

export async function getToken() {
  const mode = cloudMode();
  if (mode === 'supabase') { const { data } = await (await client()).auth.getSession(); return data.session?.access_token || null; }
  if (mode === 'dev') { try { return localStorage.getItem('devToken'); } catch { return null; } }
  return null;
}

/** Đăng nhập (signup = true thì đăng ký tài khoản mới). Chạy thử: login là DEV token. */
export async function login(user, pass, signup = false) {
  const mode = cloudMode();
  if (mode === 'dev') { try { localStorage.setItem('devToken', String(user || '').trim()); } catch { /* bỏ qua */ } return { ok: true }; }
  if (mode !== 'supabase') return { ok: false, error: 'Máy chủ chưa bật tài khoản' };
  try {
    const sb = await client(), email = toEmail(user);
    const r = signup ? await sb.auth.signUp({ email, password: pass, options: { data: { full_name: String(user).trim() } } }) : await sb.auth.signInWithPassword({ email, password: pass });
    if (r.error) return { ok: false, error: AUTH_ERR[r.error.message] || r.error.message };
    if (signup && !r.data.session) return { ok: false, error: 'Đã tạo tài khoản; máy chủ cần xác nhận email trước khi đăng nhập' };
    return { ok: true };
  } catch (e) { return { ok: false, error: AUTH_ERR[e?.message] || e?.message || String(e) }; }
}

export async function logout() {
  if (cloudMode() === 'supabase') await (await client()).auth.signOut();
  else { try { localStorage.removeItem('devToken'); } catch { /* bỏ qua */ } }
}

async function api(method, slot = '', body) {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, error: 'Chưa đăng nhập' };
  try {
    const res = await fetch(`/api/city/saves${slot ? `/${encodeURIComponent(slot)}` : ''}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({ ok: false, error: `Lỗi ${res.status}` }));
    return { ...j, status: res.status };
  } catch (e) { return { ok: false, status: 0, error: 'Không kết nối được máy chủ' }; }
}

/** Danh sách ô lưu: { ok, user, slots }. */
export const listSaves = () => api('GET');
/** Lưu lên mây: data = { name, pop, day, city } (city: sim.serialize). */
export const putSave = (slot, data) => api('PUT', slot, data);
export const getSave = (slot) => api('GET', slot);
export const deleteSave = (slot) => api('DELETE', slot);

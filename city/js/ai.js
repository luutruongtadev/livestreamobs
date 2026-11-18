// Phố Mới — gọi /api/city/ai (Claude viết lời cho hộp thư thị trưởng). Lỗi, hết lượt, server chưa có API key:
// trả null để game dùng mẫu câu soạn sẵn; tạm nghỉ gọi một lúc rồi thử lại.
let offlineUntil = 0;
const KEY = 'phomoi.ai';
/** Người chơi bật / tắt AI (lưu trong trình duyệt; mặc định bật). Tắt thì game dùng lời soạn sẵn, không gọi server. */
export function aiEnabled() { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export function setAiEnabled(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* bỏ qua */ } if (on) offlineUntil = 0; }

export async function aiCall(kind, payload) {
  if (!aiEnabled() || Date.now() < offlineUntil) return null;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 50_000);
  try {
    const r = await fetch('/api/city/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ...payload }), signal: ctl.signal });
    if (!r.ok) { offlineUntil = Date.now() + (r.status === 429 ? 60_000 : 120_000); return null; }
    const j = await r.json();
    if (!j.ok) { if (j.offline) offlineUntil = Date.now() + 5 * 60_000; return null; }
    return j.data;
  } catch { offlineUntil = Date.now() + 60_000; return null; } finally { clearTimeout(timer); }
}
/** AI đang dùng được (chưa bị tạm nghỉ vì lỗi / không có key). */
export const aiOnline = () => aiEnabled() && Date.now() >= offlineUntil;

/** Tóm tắt thành phố gửi kèm mỗi lần gọi (số liệu thật, ngắn). */
export function citySummary(c, S) {
  const L = S.lunar(c.day), fe = S.festivalNow(c), avg = S.ratingAvg(c);
  return {
    name: c.name, map: S.MAPS[c.map] ? S.MAPS[c.map].name : '', pop: c.pp.count, happy: c.stats.happy, money: Math.round(c.money), day: c.day + 1,
    lunar: `${L.day}/${L.month} âm`, season: S.stormSeason(c) ? 'mùa mưa bão' : 'mùa khô', weather: S.WEATHER[c.inc.weather] ? S.WEATHER[c.inc.weather].name : '',
    festival: fe ? fe.f.name : '', flooded: c.season ? c.season.houses : 0, congestion: Math.round((1 - (c.traffic.speedEma ?? 1)) * 100), rating: avg == null ? '' : avg.toFixed(1), services: S.svcNames(c),
  };
}

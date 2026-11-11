// Lớp "màn hình" của overlay (đè lên game + widget): màn chuẩn bị live, băng cảnh báo sắp tắt live, màn kết thúc live.
// Cấu hình: studio.scenes { intro, outro }; trạng thái: studio.scene { mode: live | intro | outro, at, endAt } do dashboard bấm.
// Mọi overlay tự tính cùng một kết quả theo giờ máy chủ (đếm ngược, tự vào live, tự chuyển màn kết thúc khi tới giờ tắt).
const W = 1080, H = 1920;
export const THEMES = {
  tim: ['#3b0764', '#7c3aed', '#db2777'],
  dem: ['#020617', '#0f172a', '#1e3a8a'],
  cam: ['#431407', '#c2410c', '#f59e0b'],
  xanh: ['#042f2e', '#0f766e', '#22d3ee'],
  hong: ['#500724', '#be185d', '#f9a8d4'],
};
// giống mặc định ở gateway (studio.js → SCENE_DEFAULTS): kênh chưa lưu cấu hình vẫn hiện đủ
const DEFAULTS = {
  intro: { title: 'LIVE SẮP BẮT ĐẦU', subtitle: 'Chờ chút nhé, mình đang chuẩn bị 💖', countdownMin: 5, autoLive: false, theme: 'tim', image: '', showChat: true, trailer: true },
  outro: { title: 'CẢM ƠN MỌI NGƯỜI!', subtitle: 'Hẹn gặp lại ở buổi live sau nha 👋', warnMin: 5, pauseGame: true, theme: 'dem', image: '', showTop: true },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(x).padStart(2, '0')}`; };

const CSS = `
.sc-root { position:absolute; inset:0; width:${W}px; height:${H}px; pointer-events:none; z-index:3; font-family:'Be Vietnam Pro',system-ui,sans-serif; color:#fff; }
.sc-full { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; overflow:hidden; opacity:0; transition:opacity .6s; }
.sc-full.on { opacity:1; }
.sc-bg { position:absolute; inset:0; background-size:cover; background-position:center; }
.sc-bg::after { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(0,0,0,.15), rgba(0,0,0,.55)); }
.sc-orb { position:absolute; border-radius:50%; filter:blur(60px); opacity:.55; animation:sc-float 9s ease-in-out infinite alternate; }
@keyframes sc-float { from { transform:translate(-40px,-30px) scale(1); } to { transform:translate(40px,30px) scale(1.15); } }
.sc-body { position:relative; z-index:1; width:900px; display:flex; flex-direction:column; align-items:center; gap:26px; margin-top:-80px; }
.sc-kicker { font-weight:800; font-size:30px; letter-spacing:4px; padding:10px 28px; border-radius:40px; background:rgba(255,255,255,.14); border:2px solid rgba(255,255,255,.3); }
.sc-title { font-weight:900; font-size:96px; line-height:1.05; text-shadow:0 8px 30px rgba(0,0,0,.45); }
.sc-sub { font-weight:700; font-size:40px; line-height:1.35; opacity:.92; white-space:pre-line; }
.sc-count { font-weight:900; font-size:150px; font-variant-numeric:tabular-nums; letter-spacing:4px; text-shadow:0 0 40px rgba(255,255,255,.35); }
.sc-label { font-weight:800; font-size:30px; opacity:.8; margin-bottom:-18px; }
.sc-chips { display:flex; gap:18px; flex-wrap:wrap; justify-content:center; }
.sc-chip { font-weight:800; font-size:32px; padding:12px 26px; border-radius:40px; background:rgba(0,0,0,.35); border:2px solid rgba(255,255,255,.18); }
.sc-chat { position:absolute; left:60px; right:60px; bottom:300px; z-index:1; display:flex; flex-direction:column; gap:12px; align-items:flex-start; }
.sc-msg { font-weight:700; font-size:30px; padding:12px 22px; border-radius:26px; background:rgba(0,0,0,.42); max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; animation:sc-in .35s ease-out; }
.sc-msg b { color:#fde68a; margin-right:10px; }
@keyframes sc-in { from { transform:translateY(20px); opacity:0; } to { transform:none; opacity:1; } }
.sc-top { width:820px; display:flex; flex-direction:column; gap:12px; }
.sc-row { display:flex; align-items:center; gap:18px; padding:14px 24px; border-radius:24px; background:rgba(0,0,0,.35); font-weight:800; font-size:34px; }
.sc-row img, .sc-row .sc-av { width:64px; height:64px; border-radius:50%; object-fit:cover; background:#334155; display:flex; align-items:center; justify-content:center; font-size:30px; flex:none; }
.sc-row .sc-n { flex:1; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sc-row .sc-x { color:#fde68a; }
.sc-rank { width:48px; font-size:40px; }
.sc-warn { position:absolute; left:50%; top:170px; transform:translateX(-50%); z-index:2; display:none; font-weight:900; font-size:40px; padding:16px 40px; border-radius:50px; background:rgba(127,29,29,.92); border:3px solid #fca5a5; box-shadow:0 10px 40px rgba(0,0,0,.45); white-space:nowrap; }
.sc-warn.on { display:block; animation:sc-pulse 1s ease-in-out infinite; }
@keyframes sc-pulse { 50% { transform:translateX(-50%) scale(1.05); } }
/* có trailer: tiêu đề gọn ở trên, hàng dưới = khung điện thoại chạy demo game (trái) + đếm ngược, chip, bình luận (phải) */
.sc-tr .sc-body { width:980px; gap:20px; margin-top:0; }
.sc-tr .sc-title { font-size:76px; }
.sc-tr .sc-sub { font-size:34px; }
.sc-row2 { display:flex; gap:36px; align-items:center; width:100%; margin-top:14px; }
.sc-phone { position:relative; flex:none; box-sizing:border-box; width:450px; height:775px; border-radius:46px; padding:12px; background:#0b0b10; border:4px solid rgba(255,255,255,.35); box-shadow:0 30px 70px rgba(0,0,0,.55); }
.sc-screen { position:relative; width:100%; height:100%; border-radius:34px; overflow:hidden; background:#000; }
.sc-screen iframe { position:absolute; left:0; top:0; width:1080px; height:1920px; border:0; transform-origin:0 0; pointer-events:none; }
.sc-tag { position:absolute; left:50%; top:-22px; transform:translateX(-50%); z-index:1; white-space:nowrap; font-weight:900; font-size:26px; letter-spacing:2px; padding:8px 22px; border-radius:30px; background:#ef4444; box-shadow:0 6px 20px rgba(0,0,0,.4); }
.sc-side { flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:20px; }
.sc-tr .sc-count { font-size:116px; }
.sc-tr .sc-label { margin-bottom:-14px; }
.sc-game { font-weight:900; font-size:46px; line-height:1.15; text-shadow:0 6px 20px rgba(0,0,0,.4); }
.sc-tr .sc-chat { position:static; width:100%; margin-top:10px; }
.sc-tr .sc-msg { font-size:26px; }
`;

/** createSceneLayer({ now }) → { el, set(studio), setStats(st), setGame(name, id), event(e), preview(mode|null), modeNow(), fit(scale), destroy() } */
export function createSceneLayer({ now = () => Date.now(), onMode = null } = {}) {
  const el = document.createElement('div');
  el.className = 'sc-root';
  Object.assign(el.style, { transformOrigin: '0 0' });
  if (!document.getElementById('sc-css')) { const st = document.createElement('style'); st.id = 'sc-css'; st.textContent = CSS; document.head.append(st); }
  const full = document.createElement('div'); full.className = 'sc-full';
  const warn = document.createElement('div'); warn.className = 'sc-warn';
  el.append(full, warn);
  let cfg = { intro: { ...DEFAULTS.intro }, outro: { ...DEFAULTS.outro } }, scene = { mode: 'live' }, stats = null, gameName = '', gameId = '', forced = null, shown = '', lastMode = 'live';
  const chat = []; // { name, text, join }

  function bg(c) {
    const t = THEMES[c.theme] || THEMES.tim;
    const img = c.image ? `background-image:url("${esc(c.image)}");` : `background:linear-gradient(160deg, ${t[0]}, ${t[1]} 55%, ${t[2]});`;
    return `<div class="sc-bg" style='${img}'></div>
      <div class="sc-orb" style="width:520px;height:520px;left:-120px;top:180px;background:${t[2]}"></div>
      <div class="sc-orb" style="width:620px;height:620px;right:-160px;bottom:220px;background:${t[1]};animation-delay:-4s"></div>`;
  }
  /** Màn đang áp dụng lúc này (tính theo giờ máy chủ). */
  function modeNow() {
    if (forced) return forced;
    const t = now();
    if (scene.mode === 'intro' && cfg.intro.autoLive && cfg.intro.countdownMin > 0 && t >= (scene.at || 0) + cfg.intro.countdownMin * 60_000) return 'live';
    if (scene.mode !== 'outro' && scene.endAt && t >= scene.endAt) return 'outro';
    return scene.mode || 'live';
  }
  function renderIntro() {
    const c = cfg.intro;
    const startAt = (forced ? now() : scene.at || now()) + (c.countdownMin || 0) * 60_000;
    const trailer = c.trailer !== false && /^[a-z][a-z0-9-]{1,31}$/.test(gameId);
    full.classList.toggle('sc-tr', trailer);
    if (trailer) {
      full.innerHTML = `${bg(c)}<div class="sc-body">
      <div class="sc-kicker">🔴 LIVE</div>
      <div class="sc-title">${esc(c.title || 'LIVE SẮP BẮT ĐẦU')}</div>
      ${c.subtitle ? `<div class="sc-sub">${esc(c.subtitle)}</div>` : ''}
      <div class="sc-row2">
        <div class="sc-phone"><span class="sc-tag">▶ TRAILER</span><div class="sc-screen"><iframe src="/demo?game=${encodeURIComponent(gameId)}" title="Trailer" tabindex="-1" style="transform:scale(${418 / 1080})"></iframe></div></div>
        <div class="sc-side">
          <div class="sc-label" style="margin-bottom:-10px">🎮 Hôm nay chơi</div>
          <div class="sc-game">${esc(gameName || gameId)}</div>
          ${c.countdownMin > 0 ? `<div class="sc-label">Bắt đầu sau</div><div class="sc-count" data-to="${startAt}">${clock(startAt - now())}</div>` : ''}
          <div class="sc-chips"><div class="sc-chip" data-k="likes">❤️ ${fmtN(stats?.likes)}</div></div>
          ${c.showChat !== false ? '<div class="sc-chat"></div>' : ''}
        </div>
      </div>
    </div>`;
      paintChat();
      return;
    }
    full.innerHTML = `${bg(c)}<div class="sc-body">
      <div class="sc-kicker">🔴 LIVE</div>
      <div class="sc-title">${esc(c.title || 'LIVE SẮP BẮT ĐẦU')}</div>
      <div class="sc-sub">${esc(c.subtitle || '')}</div>
      ${c.countdownMin > 0 ? `<div class="sc-label">Bắt đầu sau</div><div class="sc-count" data-to="${startAt}">${clock(startAt - now())}</div>` : ''}
      <div class="sc-chips">${gameName ? `<div class="sc-chip">🎮 Hôm nay chơi: ${esc(gameName)}</div>` : ''}<div class="sc-chip" data-k="likes">❤️ ${fmtN(stats?.likes)}</div></div>
    </div>${c.showChat !== false ? '<div class="sc-chat"></div>' : ''}`;
    paintChat();
  }
  function renderOutro() {
    const c = cfg.outro;
    const top = (stats?.gifters || []).slice(0, 5);
    full.innerHTML = `${bg(c)}<div class="sc-body" style="margin-top:-40px">
      <div class="sc-kicker">⏹ LIVE ĐÃ KẾT THÚC</div>
      <div class="sc-title">${esc(c.title || 'CẢM ƠN MỌI NGƯỜI!')}</div>
      <div class="sc-sub">${esc(c.subtitle || '')}</div>
      <div class="sc-chips"><div class="sc-chip">❤️ ${fmtN(stats?.likes)} tim</div><div class="sc-chip">🎁 ${fmtN(stats?.diamonds)} xu</div><div class="sc-chip">👥 ${fmtN(stats?.follows)} follow</div></div>
      ${c.showTop !== false && top.length ? `<div class="sc-label" style="margin:10px 0 -10px">🏆 Cảm ơn những người tặng quà nhiều nhất</div><div class="sc-top">${top.map((g, i) => `<div class="sc-row"><span class="sc-rank">${['🥇', '🥈', '🥉', '4', '5'][i]}</span>${g.avatar ? `<img src="${esc(g.avatar)}" referrerpolicy="no-referrer">` : `<span class="sc-av">${esc([...(g.name || '?')][0])}</span>`}<span class="sc-n">${esc(g.name)}</span><span class="sc-x">${fmtN(g.diamonds)} xu</span></div>`).join('')}</div>` : ''}
    </div>`;
  }
  function paintChat() {
    const box = full.querySelector('.sc-chat');
    if (!box) return;
    box.innerHTML = chat.slice(full.classList.contains('sc-tr') ? -4 : -5).map((m) => `<div class="sc-msg">${m.join ? `👋 <b>${esc(m.name)}</b>vừa vào live` : `<b>${esc(m.name)}</b>${esc(m.text)}`}</div>`).join('');
  }
  function paint() {
    const m = modeNow();
    if (m !== lastMode) { lastMode = m; onMode?.(m); }
    const key = m === 'live' ? 'live' : `${m}|${JSON.stringify(cfg[m === 'intro' ? 'intro' : 'outro'])}|${scene.at}|${forced}|${gameName}|${gameId}|${m === 'outro' ? JSON.stringify(stats?.gifters?.slice(0, 5)) : ''}`;
    if (key !== shown) {
      shown = key;
      full.classList.remove('sc-tr');
      if (m === 'intro') renderIntro(); else if (m === 'outro') renderOutro(); else full.innerHTML = '';
      full.classList.toggle('on', m !== 'live');
    }
    const cd = full.querySelector('.sc-count');
    if (cd) { const left = Number(cd.dataset.to) - now(); cd.textContent = left > 0 ? clock(left) : 'Sắp vào rồi!'; }
    const lk = full.querySelector('[data-k="likes"]');
    if (lk) lk.textContent = `❤️ ${fmtN(stats?.likes)}`;
    // băng cảnh báo sắp tắt live (khi đang live và đã hẹn giờ)
    const warnMs = (cfg.outro.warnMin || 0) * 60_000;
    const left = scene.endAt ? scene.endAt - now() : Infinity;
    const showWarn = m === 'live' && !forced && warnMs > 0 && left > 0 && left <= warnMs;
    warn.classList.toggle('on', showWarn);
    if (showWarn) warn.textContent = `⏰ Live kết thúc sau ${clock(left)}`;
  }
  const timer = setInterval(paint, 250);

  return {
    el,
    set(studio) {
      const s = studio?.scenes || {};
      cfg = { intro: { ...DEFAULTS.intro, ...(s.intro || {}) }, outro: { ...DEFAULTS.outro, ...(s.outro || {}) } };
      scene = studio?.scene && typeof studio.scene === 'object' ? studio.scene : { mode: 'live' };
      paint();
    },
    setStats(st) { stats = st; },
    setGame(name, id) { gameName = String(name || ''); gameId = String(id || ''); },
    event(e) {
      if (e?.type === 'comment' && e.text) chat.push({ name: e.user?.name || 'Ẩn danh', text: String(e.text).slice(0, 80) });
      else if (e?.type === 'member') chat.push({ name: e.user?.name || 'Ai đó', join: true });
      else return;
      if (chat.length > 20) chat.splice(0, chat.length - 20);
      if (lastMode === 'intro') paintChat();
    },
    /** Xem thử trong dashboard (không đổi live): 'intro' | 'outro' | null. */
    preview(mode) { forced = mode === 'intro' || mode === 'outro' ? mode : null; shown = ''; paint(); },
    modeNow,
    fit(scale) { el.style.transform = `scale(${scale})`; },
    destroy() { clearInterval(timer); el.remove(); },
  };
}

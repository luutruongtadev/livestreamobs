import { activePanels, PANEL_SCALE } from '#sdk';

// Dashboard của streamer. Không có code riêng cho từng game: form cài đặt sinh từ settings.schema.json,
// trình gán quà / tim sinh từ manifest.actions, nút lệnh từ manifest.commands.
const P = window.PLATFORM || {};
document.querySelectorAll('[data-brand]').forEach((el) => { el.textContent = P.brand || 'Game Live'; });
const root = document.getElementById('root');
const who = document.getElementById('who');
const logoutBtn = document.getElementById('logout');

// ---------------- tiện ích DOM ----------------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
function toast(text, err = false) {
  const t = h('div', { class: `toast${err ? ' err' : ''}` }, text);
  document.body.append(t); setTimeout(() => t.remove(), err ? 6000 : 2500);
}

// ---------------- đăng nhập ----------------
let supabase = null;
async function getToken() {
  if (P.supabaseUrl && P.supabaseKey) {
    if (!supabase) {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
      supabase = createClient(P.supabaseUrl, P.supabaseKey);
      supabase.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); });
    }
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }
  try { return localStorage.getItem('devToken'); } catch { return null; }
}

// Đăng nhập bằng TÊN ĐĂNG NHẬP + MẬT KHẨU. Supabase Auth cần email → tên đăng nhập đổi thành email nội bộ
// <tên>@<usernameDomain> (không gửi thư; cần tắt "Confirm email" trong Supabase). Gõ email thật thì dùng luôn email đó.
const USERNAME = /^[a-z0-9._-]{3,30}$/;
const domain = () => String(P.usernameDomain || location.hostname).toLowerCase();
function toEmail(login) {
  const v = String(login || '').trim().toLowerCase();
  if (v.includes('@')) return v;
  if (!USERNAME.test(v)) throw new Error('Tên đăng nhập 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang');
  return `${v}@${domain()}`;
}
const displayName = (email) => (email && email.endsWith(`@${domain()}`) ? email.slice(0, -domain().length - 1) : email);
const AUTH_ERR = { 'Invalid login credentials': 'Sai tên đăng nhập hoặc mật khẩu', 'User already registered': 'Tên đăng nhập này đã có người dùng', 'Signups not allowed for this instance': 'Máy chủ đang tắt đăng ký tài khoản mới' };
const authErr = (e) => AUTH_ERR[e?.message] || e?.message || String(e);

/** Provider đăng nhập ngoài đang bật trên Supabase (endpoint công khai) — chỉ hiện nút Google khi đã cấu hình. */
let providers = null;
async function authProviders() {
  if (providers) return providers;
  try {
    const r = await fetch(`${P.supabaseUrl}/auth/v1/settings`, { headers: { apikey: P.supabaseKey } });
    providers = r.ok ? (await r.json()).external || {} : {};
  } catch { providers = {}; }
  return providers;
}

// quay về từ Google mà có lỗi (vd chưa khai báo redirect) → báo rõ thay vì màn hình trắng
const oauthError = (() => {
  const q = new URLSearchParams(location.search + '&' + location.hash.slice(1));
  const e = q.get('error_description') || q.get('error');
  if (e) history.replaceState(null, '', location.pathname);
  return e;
})();

function renderLogin(msg = '') {
  const box = h('div', { class: 'card login' }, msg && h('p', { class: 'muted' }, msg));
  if (P.supabaseUrl && P.supabaseKey) {
    let mode = 'login';
    const user = h('input', { placeholder: 'Tên đăng nhập', autocomplete: 'username', required: true, autocapitalize: 'none', spellcheck: false });
    const pass = h('input', { type: 'password', placeholder: 'Mật khẩu (tối thiểu 8 ký tự)', autocomplete: 'current-password', required: true, minLength: 8 });
    const pass2 = h('input', { type: 'password', placeholder: 'Nhập lại mật khẩu', autocomplete: 'new-password', minLength: 8 });
    const title = h('h2', {});
    const submit = h('button', { type: 'submit' });
    const switcher = h('button', { type: 'button', class: 'ghost' });
    const paint = () => {
      title.textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
      submit.textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
      switcher.textContent = mode === 'login' ? 'Chưa có tài khoản? Tạo mới' : 'Đã có tài khoản? Đăng nhập';
      pass2.hidden = mode === 'login'; pass2.required = mode !== 'login';
      pass.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    };
    switcher.onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; paint(); };
    const form = h('form', { style: 'display:grid; gap:10px', onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        const email = toEmail(user.value);
        if (mode === 'signup') {
          if (pass.value.length < 8) throw new Error('Mật khẩu tối thiểu 8 ký tự');
          if (pass.value !== pass2.value) throw new Error('Hai mật khẩu không khớp');
          const { data, error } = await supabase.auth.signUp({ email, password: pass.value, options: { data: { full_name: user.value.trim() } } });
          if (error) throw error;
          if (!data.session) throw new Error('Máy chủ đang bật xác nhận email: quản trị cần tắt "Confirm email" trong Supabase → Authentication.');
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email, password: pass.value });
          if (error) throw error;
        }
        start();
      } catch (err) { toast(authErr(err), true); } finally { submit.disabled = false; }
    } }, user, pass, pass2, submit);
    paint();
    box.prepend(title);
    box.append(form, h('div', { style: 'margin-top:10px' }, switcher), h('p', { class: 'small muted' }, 'Quên mật khẩu: liên hệ quản trị để đặt lại.'));
    const google = h('div', {});
    box.append(google);
    authProviders().then((pv) => {
      if (!pv.google) return;
      google.append(h('h3', { class: 'center' }, 'hoặc'), h('button', { type: 'button', class: 'ghost', style: 'width:100%', onclick: async () => {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/app` } });
        if (error) toast(authErr(error), true);
      } }, 'Đăng nhập bằng Google'));
    });
    if (oauthError) toast(`Đăng nhập Google lỗi: ${oauthError}`, true);
  } else {
    box.prepend(h('h2', {}, 'Đăng nhập'));
    const tok = h('input', { type: 'password', placeholder: 'GATEWAY_DEV_TOKEN / ADMIN_TOKEN', class: 'grow' });
    box.append(
      h('p', { class: 'small muted' }, 'Máy chủ chưa cấu hình Supabase → chế độ chạy thử, đăng nhập bằng DEV token.'),
      h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); try { localStorage.setItem('devToken', tok.value); } catch { /* bỏ qua */ } start(); } }, tok, h('button', { type: 'submit' }, 'Vào')),
    );
  }
  root.replaceChildren(box);
}

logoutBtn.onclick = async () => { if (supabase) await supabase.auth.signOut(); else { try { localStorage.removeItem('devToken'); } catch { /* bỏ qua */ } location.reload(); } };

// ---------------- WebSocket tới gateway ----------------
let ws = null, reqId = 0;
const waits = new Map();
const S = { user: null, games: [], channels: [], cur: null, tk: null, counts: {}, lat: null, feed: [], tab: (() => { try { return localStorage.getItem('tab') || 'live'; } catch { return 'live'; } })() };

function req(op, p = {}) {
  return new Promise((resolve, reject) => {
    if (ws?.readyState !== 1) return reject(new Error('Chưa kết nối máy chủ'));
    const id = ++reqId;
    waits.set(id, { resolve, reject });
    ws.send(JSON.stringify({ t: 'req', id, op, p }));
    setTimeout(() => { if (waits.delete(id)) reject(new Error('Quá thời gian')); }, 20_000);
  });
}

async function start() {
  const token = await getToken();
  if (!token) return renderLogin();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?role=dashboard`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token }));
  ws.onclose = (e) => {
    if (e.code === 4001) { try { localStorage.removeItem('devToken'); } catch { /* bỏ qua */ } return renderLogin(e.reason || 'Phiên đăng nhập hết hạn.'); }
    toast('Mất kết nối máy chủ, đang nối lại…', true); setTimeout(start, 2000);
  };
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.t === 'authed') { S.user = msg.user; S.games = msg.games; S.widgets = msg.widgets || []; S.storeKind = msg.store; onAuthed(); return; }
    if (msg.t === 'res') { const w = waits.get(msg.id); if (w) { waits.delete(msg.id); msg.err ? w.reject(new Error(msg.err)) : w.resolve(msg.r); } return; }
    if (msg.channel && msg.channel !== S.cur?.id) return;
    if (msg.t === 'tk') { S.tk = msg.tk; paintStatus(); }
    else if (msg.t === 'overlays') { S.counts = msg; paintStatus(); }
    else if (msg.t === 'lat') { S.lat = msg.lat; paintStatus(); }
    else if (msg.t === 'ev') pushFeed(msg.e);
    else if (msg.t === 'st') S.st = msg.st;
    else if (msg.t === 'err') { pushFeed({ type: 'error', text: `${msg.err.where}: ${msg.err.message}${msg.err.crashed ? ' (game đã dừng, đang chạy lại)' : ''}` }); }
  };
}

async function onAuthed() {
  who.textContent = displayName(S.user.email) || S.user.id; logoutBtn.hidden = false;
  S.channels = await req('channels');
  const saved = (() => { try { return localStorage.getItem('curChannel'); } catch { return null; } })();
  const pick = S.channels.find((c) => c.id === saved) || S.channels[0];
  if (pick) await select(pick.id); else render();
}

async function select(id) {
  if (S.cur) req('unwatch', { channel: S.cur.id }).catch(() => {});
  const { channel } = await req('get', { channel: id });
  S.cur = channel; S.feed = []; S.lat = null;
  try { localStorage.setItem('curChannel', id); } catch { /* bỏ qua */ }
  const w = await req('watch', { channel: id });
  S.tk = w.tk; S.counts = w; S.lat = w.lat; S.st = w.st;
  render();
}

const gameOf = (id) => S.games.find((g) => g.id === id);
const overlayUrl = (c) => `${location.origin}/o/${c.overlay_key}`;

// ---------------- giao diện ----------------
function render() {
  const list = h('div', { class: 'card list' }, h('h2', {}, 'Kênh của bạn'),
    S.channels.map((c) => h('button', { class: S.cur?.id === c.id ? 'on' : '', onclick: () => select(c.id) }, `@${c.username}`, h('div', { class: 'small muted' }, gameOf(c.active_game)?.name || c.active_game))),
    addChannelForm());
  root.replaceChildren(h('div', { class: 'grid' }, h('div', {}, list, storeNote()), S.cur ? channelView() : h('div', { class: 'card' }, h('h2', {}, 'Bắt đầu'), h('p', {}, 'Thêm kênh TikTok của bạn (nhập @username) để nhận link overlay.'))));
  paintStatus();
}

function storeNote() {
  return S.storeKind === 'file' ? h('p', { class: 'small muted' }, '⚠️ Chạy thử: dữ liệu lưu trong file trên máy chủ (chưa có Supabase).') : null;
}

function addChannelForm() {
  const u = h('input', { placeholder: '@username TikTok', class: 'grow' });
  return h('form', { class: 'row', onsubmit: async (e) => {
    e.preventDefault();
    try { const c = await req('create', { username: u.value }); S.channels.push(c); await select(c.id); toast('Đã thêm kênh'); } catch (err) { toast(err.message, true); }
  } }, u, h('button', { type: 'submit' }, '+ Thêm'));
}

function channelView() {
  const c = S.cur;
  const g = gameOf(c.active_game);
  const tabs = [['live', '🎛 Điều khiển'], ['studio', '🎬 Studio'], ['sounds', '🔊 Âm thanh'], ['settings', '⚙️ Cài đặt game'], ['bindings', '🎁 Quà & tương tác'], ['board', '🏆 Bảng xếp hạng'], ['channel', '🔗 Kênh']];
  if (!tabs.some(([k]) => k === S.tab)) S.tab = 'live';
  const body = { live: liveTab, studio: studioTab, sounds: soundsTab, settings: settingsTab, bindings: bindingsTab, board: boardTab, channel: channelTab }[S.tab](c, g);
  return h('div', {},
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, `@${c.username} · ${g?.name || c.active_game}`), h('span', { id: 'status' })),
      h('div', { class: 'row small', id: 'latency' }),
      h('div', { class: 'row', style: 'margin-top:10px' }, tabs.map(([k, label]) => h('button', { class: S.tab === k ? '' : 'ghost', onclick: () => { S.tab = k; try { localStorage.setItem('tab', k); } catch { /* bỏ qua */ } render(); } }, label)))),
    body);
}

function paintStatus() {
  const el = document.getElementById('status'); const lat = document.getElementById('latency');
  if (!el) return;
  const tk = S.tk || {};
  const cls = tk.state === 'connected' ? 'ok' : tk.state === 'error' ? 'err' : 'warn';
  el.replaceChildren(h('span', { class: `pill ${cls}` }, tk.state === 'connected' ? `TikTok: đã kết nối${tk.viewers ? ` · ${tk.viewers} người xem` : ''}` : `TikTok: ${tk.message || tk.state || 'chưa kết nối'}`), ' ',
    h('span', { class: `pill ${S.counts?.overlays ? 'ok' : 'warn'}` }, S.counts?.overlays ? `Overlay đang mở: ${S.counts.overlays}` : 'Chưa mở overlay'));
  const L = S.lat;
  lat?.replaceChildren(L ? `Độ trễ — gateway → màn hình: p50 ${L.p50} ms · p95 ${L.p95} ms${L.rtt != null ? ` · RTT ${L.rtt} ms` : ''}${L.tiktok ? ` · TikTok → gateway: p50 ${L.tiktok.p50} ms · p95 ${L.tiktok.p95} ms` : ''}` : h('span', { class: 'muted' }, 'Độ trễ: chưa có số liệu (mở overlay và có bình luận)'));
}

function pushFeed(e) {
  S.feed.unshift(e); S.feed = S.feed.slice(0, 40);
  const f = document.getElementById('feed'); if (!f) return;
  f.prepend(feedRow(e)); while (f.children.length > 40) f.lastChild.remove();
}
function feedRow(e) {
  const who2 = e.user?.name ? `${e.user.name}: ` : '';
  const text = e.type === 'comment' ? `💬 ${who2}${e.text}` : e.type === 'gift' ? `🎁 ${who2}${e.giftName} x${e.count || e.repeatCount || 1} (${e.diamonds} xu)` : e.type === 'error' ? `❗ ${e.text}` : `• ${who2}${e.type}${e.count ? ` x${e.count}` : ''}`;
  return h('div', { class: e.type === 'error' ? 'pill err' : '' }, `${e.sim ? '[giả lập] ' : ''}${text}`);
}

// giá xu của quà TikTok phổ biến (ô Giả lập tự điền)
const GIFT_COINS = { rose: 1, tiktok: 1, 'ice cream cone': 1, 'heart me': 1, gg: 1, 'finger heart': 5, perfume: 20, doughnut: 30, cap: 99, 'hat and mustache': 99, 'hand hearts': 100, sunglasses: 199, corgi: 299, 'money gun': 500, galaxy: 1000, lion: 29999 };

// ---- tab Điều khiển: xem trước, lệnh, giả lập, nhật ký ----
function liveTab(c, g) {
  const cmd = async (id, args) => { try { await req('cmd', { channel: c.id, id, args }); } catch (e) { toast(e.message, true); } };
  const sim = async (e, repeat = 1) => { try { await req('sim', { channel: c.id, e, repeat }); } catch (err) { toast(err.message, true); } };
  const text = h('input', { placeholder: 'Bình luận thử…', class: 'grow' });
  const diamonds = h('input', { type: 'number', value: 1, min: 0, style: 'width:90px' });
  // gõ tên quà quen thuộc → tự điền đúng số xu (để thử hiệu ứng theo xu, vd meme quà lớn)
  const giftName = h('input', { value: 'Rose', style: 'width:130px', list: 'gift-names', oninput: (e) => { const v = GIFT_COINS[e.target.value.trim().toLowerCase()]; if (v) diamonds.value = v; } });
  const count = h('input', { type: 'number', value: 1, min: 1, style: 'width:80px' });
  const likes = h('input', { type: 'number', value: 100, min: 1, style: 'width:100px' });
  let n = 0; const user = () => ({ id: `sim${++n % 7}`, name: `Khán giả ${n % 7 + 1}` });
  return h('div', { class: 'cols' },
    h('div', {},
      g?.play ? h('div', { class: 'card' }, h('h2', {}, '🎮 Cửa sổ chơi'),
        h('p', { class: 'small muted' }, 'Game này cần streamer gõ phím / bấm chuột. Mở cửa sổ chơi, rồi trong OBS / LIVE Studio thêm Window Capture cửa sổ đó (hoặc cứ giữ Browser Source: nó tự hiện theo). Cửa sổ chơi tự nhận làm overlay chính, giữ nguyên ván đang chơi.'),
        h('button', { onclick: () => window.open(`/o/${c.overlay_key}?play=1`, `play-${c.id}`, 'width=540,height=960') }, 'Mở cửa sổ chơi')) : null,
      h('div', { class: 'card' }, h('h2', {}, 'Lệnh'), h('div', { class: 'row' },
        h('button', { class: 'ghost', onclick: () => cmd('pause') }, '⏸ Tạm dừng'), h('button', { class: 'ghost', onclick: () => cmd('resume') }, '▶ Tiếp tục'),
        (g?.commands || []).map((x) => h('button', { onclick: () => cmd(x.id) }, x.label)),
        h('button', { class: 'ghost', onclick: async () => { S.tk = (await req('tiktok', { channel: c.id, op: 'connect' })).tk; paintStatus(); } }, '🔌 Kết nối lại TikTok'))),
      soundboard(c),
      h('div', { class: 'card' }, h('h2', {}, 'Giả lập người xem'), h('p', { class: 'small muted' }, 'Thử game mà không cần live: sự kiện đi đúng đường như bình luận / quà thật.'),
        h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); if (text.value.trim()) { sim({ type: 'comment', user: user(), text: text.value }); text.value = ''; } } }, text, h('button', { type: 'submit' }, 'Gửi')),
        h('datalist', { id: 'gift-names' }, Object.keys(GIFT_COINS).map((n) => h('option', { value: n.replace(/(^| )\w/g, (ch) => ch.toUpperCase()) }))),
        h('div', { class: 'row', style: 'margin-top:8px' }, '🎁', giftName, 'xu', diamonds, 'x', count, h('button', { onclick: () => sim({ type: 'gift', user: user(), giftName: giftName.value, diamonds: Number(diamonds.value), count: Number(count.value) }) }, 'Tặng quà')),
        h('div', { class: 'row', style: 'margin-top:8px' }, '❤️', likes, h('button', { onclick: () => sim({ type: 'like', user: user(), count: Number(likes.value) }) }, 'Thả tim'),
          h('button', { class: 'ghost', onclick: () => sim({ type: 'follow', user: user() }) }, '➕ Follow'), h('button', { class: 'ghost', onclick: () => sim({ type: 'share', user: user() }) }, '↗ Share'),
          h('button', { class: 'ghost', onclick: () => text.value.trim() && sim({ type: 'comment', user: { id: 'crowd', name: 'Khán giả' }, text: text.value }, 20) }, '×20 người cùng bình luận'))),
      h('div', { class: 'card' }, h('h2', {}, 'Nhật ký trực tiếp'), h('div', { class: 'feed', id: 'feed' }, S.feed.map(feedRow)))),
    h('div', {}, h('div', { class: 'card' }, h('h2', {}, 'Xem trước 9:16'), h('iframe', { class: 'preview', src: `/o/${c.overlay_key}?preview=1`, title: 'Xem trước overlay' }),
      h('p', { class: 'small muted' }, 'Xem trước chỉ hiển thị lại trạng thái của overlay chính (OBS / LIVE Studio). Chưa mở overlay chính thì xem trước sẽ trống.'))));
}

// ---- tab Cài đặt: form sinh từ JSON Schema ----
function fieldFor(key, sch, value, onChange) {
  let input;
  const nameOf = (list, names, o) => names?.[list.indexOf(o)] ?? o; // enumNames: nhãn hiển thị cho từng giá trị
  if (sch.type === 'boolean') input = h('input', { type: 'checkbox', checked: !!value, onchange: (e) => onChange(e.target.checked) });
  else if (sch.type === 'integer' || sch.type === 'number') input = h('input', { type: 'number', value: value ?? '', min: sch.minimum, max: sch.maximum, step: sch.type === 'integer' ? 1 : 'any', onchange: (e) => onChange(e.target.value === '' ? undefined : Number(e.target.value)) });
  else if (sch.type === 'string' && sch.enum) input = h('select', { onchange: (e) => onChange(e.target.value) }, sch.enum.map((o) => h('option', { value: o, selected: o === value }, nameOf(sch.enum, sch.enumNames, o))));
  else if (sch.type === 'string' && sch.format === 'color') input = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ffffff', oninput: (e) => onChange(e.target.value) });
  else if (sch.type === 'array' && sch.items?.enum) {
    const cur = new Set(value || []);
    const names = sch.enumNames || sch.items.enumNames;
    input = h('div', { class: 'checks' }, sch.items.enum.map((o) => h('label', {}, h('input', { type: 'checkbox', checked: cur.has(o), onchange: (e) => { e.target.checked ? cur.add(o) : cur.delete(o); onChange(sch.items.enum.filter((x) => cur.has(x))); } }), ` ${nameOf(sch.items.enum, names, o)}`)));
  } else if (sch.type === 'array') input = h('input', { value: (value || []).join(', '), onchange: (e) => onChange(e.target.value.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (sch.items?.type === 'integer' || sch.items?.type === 'number' ? Number(x) : x))) });
  else if (sch.type === 'string' && sch.format === 'textarea') input = h('textarea', { value: value ?? '', rows: 5, maxLength: sch.maxLength, onchange: (e) => onChange(e.target.value) });
  else input = h('input', { value: value ?? '', maxLength: sch.maxLength, onchange: (e) => onChange(e.target.value) });
  return h('div', { class: 'field' }, h('label', {}, sch.title || key, sch.minimum != null || sch.maximum != null ? h('span', { class: 'small muted' }, ` (${sch.minimum ?? ''}–${sch.maximum ?? ''})`) : ''), input);
}

function settingsTab(c, g) {
  if (!g) return h('div', { class: 'card' }, 'Game không còn trong danh mục.');
  const props = g.schema?.properties || {};
  const cur = c.games?.[g.id]?.settings || {};
  const draft = Object.fromEntries(Object.entries(props).map(([k, s]) => [k, cur[k] ?? s.default]));
  return h('div', { class: 'card' }, h('h2', {}, `Cài đặt: ${g.name}`), h('p', { class: 'small muted' }, 'Lưu là áp dụng ngay cho overlay đang chạy.'),
    Object.entries(props).map(([k, s]) => fieldFor(k, s, draft[k], (v) => { draft[k] = v; })),
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { onclick: async () => { try { S.cur = await req('config', { channel: c.id, game: g.id, settings: draft }); toast('Đã lưu cài đặt'); render(); } catch (e) { toast(e.message, true); } } }, 'Lưu cài đặt'),
      h('button', { class: 'ghost', onclick: async () => { try { S.cur = await req('config', { channel: c.id, game: g.id, settings: {} }); toast('Đã về mặc định'); render(); } catch (e) { toast(e.message, true); } } }, 'Về mặc định')));
}

// ---- tab Quà & tương tác: trigger → action ----
const TRIG_LABEL = { gift: '🎁 Quà', like: '❤️ Tim', follow: '➕ Follow', share: '↗ Share', member: '👋 Vào live', keyword: '💬 Từ khoá' };
function defaultBindingsOf(g) { return (g.actions || []).flatMap((a) => (a.defaultTriggers || []).map((t, i) => ({ id: `${a.id}.${i}`, action: a.id, trigger: { ...t } }))); }

function bindingsTab(c, g) {
  if (!g?.actions?.length) return h('div', { class: 'card' }, 'Game này không có hành động gán quà.');
  const saved = c.games?.[g.id]?.bindings;
  const list = JSON.parse(JSON.stringify(saved || defaultBindingsOf(g)));
  const box = h('div', {});
  const paint = () => box.replaceChildren(...g.actions.map((a) => h('div', {},
    h('h3', {}, `${a.icon || ''} ${a.label}`),
    list.filter((b) => b.action === a.id).map((b) => trigRow(b, () => { list.splice(list.indexOf(b), 1); paint(); }, c)),
    h('button', { class: 'ghost small', onclick: () => { list.push({ id: `${a.id}.${Date.now() % 100000}`, action: a.id, trigger: { type: 'gift', minDiamonds: 1 } }); paint(); } }, '+ Thêm cách kích hoạt'))));
  paint();
  return h('div', { class: 'card' }, h('h2', {}, 'Quà & tương tác → hành động trong game'),
    h('p', { class: 'small muted' }, 'Một món quà khớp tối đa một dòng: theo tên quà trước, không khớp tên thì theo số xu (ngưỡng cao nhất đạt được). "Gom" = cả phòng cộng dồn đủ N mới kích hoạt.'),
    box,
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { onclick: async () => { try { S.cur = await req('config', { channel: c.id, game: g.id, bindings: list }); toast('Đã lưu'); render(); } catch (e) { toast(e.message, true); } } }, 'Lưu'),
      h('button', { class: 'ghost', onclick: async () => { try { S.cur = await req('config', { channel: c.id, game: g.id, bindings: null }); toast('Đã về mặc định của game'); render(); } catch (e) { toast(e.message, true); } } }, 'Về mặc định')));
}

/** Trigger mới khi đổi loại (giá trị mặc định hợp lý). */
const freshTrigger = (type) => ({ type, ...(type === 'like' ? { every: 100 } : type === 'gift' ? { minDiamonds: 1 } : type === 'keyword' ? { text: '' } : {}) });
/** Các ô nhập của một trigger (sửa trực tiếp object t). Dùng cho gán quà của game và luật âm thanh Studio. */
function trigFields(t) {
  const num = (k, ph) => h('input', { type: 'number', min: k === 'every' ? 1 : 0, placeholder: ph, value: t[k] ?? '', onchange: (e) => { if (e.target.value === '') delete t[k]; else t[k] = Number(e.target.value); } });
  const names = h('input', { class: 'wide', placeholder: 'Tên quà (cách nhau dấu phẩy) — bỏ trống = theo xu', value: [t.giftName, ...(t.gifts || [])].filter(Boolean).join(', '), onchange: (e) => { const v = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); delete t.giftName; delete t.gifts; if (v.length === 1) t.giftName = v[0]; else if (v.length) t.gifts = v; } });
  return t.type === 'gift' ? [names, 'hoặc ≥', num('minDiamonds', 'xu'), 'gom', num('every', 'N món')]
    : t.type === 'like' ? ['mỗi', num('every', 'N tim'), 'tim']
    : t.type === 'keyword' ? [h('input', { placeholder: 'cụm từ', value: t.text || '', onchange: (e) => { t.text = e.target.value; } }), 'chờ', num('cooldownSec', 'giây'), 'giây / người']
    : ['gom', num('every', 'N lần')];
}

function trigRow(b, remove, c) {
  const t = b.trigger;
  const type = h('select', { onchange: (e) => { b.trigger = freshTrigger(e.target.value); row.replaceWith(trigRow(b, remove, c)); } },
    Object.entries(TRIG_LABEL).map(([k, v]) => h('option', { value: k, selected: k === t.type }, v)));
  const fields = trigFields(t);
  const test = h('button', { class: 'ghost small', title: 'Bắn một sự kiện giả khớp dòng này', onclick: () => {
    const user = { id: 'test', name: 'Người thử' };
    const e = t.type === 'gift' ? { type: 'gift', user, giftName: t.giftName || t.gifts?.[0] || 'Quà thử', diamonds: t.minDiamonds ?? 1, count: t.every || 1 }
      : t.type === 'like' ? { type: 'like', user, count: t.every || 1 } : t.type === 'keyword' ? { type: 'comment', user, text: t.text } : { type: t.type, user };
    req('sim', { channel: c.id, e, repeat: t.type !== 'gift' && t.type !== 'like' && t.every ? Math.min(t.every, 50) : 1 }).catch((err) => toast(err.message, true));
  } }, 'Thử');
  const row = h('div', { class: 'trig' }, type, fields, test, h('button', { class: 'ghost small', onclick: remove }, '✕'));
  return row;
}

// ---- tab Bảng xếp hạng ----
function boardTab(c) {
  const box = h('div', { class: 'card' }, h('h2', {}, 'Bảng xếp hạng tuần (giờ VN)'), h('p', { class: 'muted' }, 'Đang tải…'));
  req('leaderboard', { channel: c.id }).then((rows) => {
    box.replaceChildren(h('h2', {}, 'Bảng xếp hạng tuần (giờ VN)'), rows.length ? h('table', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Người xem'), h('th', {}, 'Game'), h('th', {}, 'Điểm'), h('th', {}, 'Thắng')),
      rows.map((r, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, r.name || r.viewer || r.viewer_id), h('td', {}, gameOf(r.game_id || r.gameId)?.name || r.game_id || r.gameId), h('td', {}, r.points), h('td', {}, r.wins)))) : h('p', { class: 'muted' }, 'Chưa có điểm tuần này.'));
  }).catch((e) => toast(e.message, true));
  return box;
}

// ---- tab Kênh: link overlay, đổi game, username ----
function channelTab(c) {
  const url = overlayUrl(c);
  const gameSel = h('select', {}, S.games.map((g) => h('option', { value: g.id, selected: g.id === c.active_game }, `${g.name}${g.status !== 'live' ? ` (${g.status})` : ''}`)));
  const user = h('input', { value: c.username, class: 'grow' });
  return h('div', {},
    h('div', { class: 'card' }, h('h2', {}, 'Link overlay (dán vào OBS / TikTok LIVE Studio → Browser source, 1080×1920)'),
      h('div', { class: 'row' }, h('input', { value: url, readOnly: true, class: 'grow', onclick: (e) => e.target.select() }),
        h('button', { onclick: () => navigator.clipboard.writeText(url).then(() => toast('Đã copy')) }, 'Copy'),
        h('button', { class: 'ghost', onclick: () => window.open(url, '_blank') }, 'Mở')),
      h('p', { class: 'small muted' }, 'Link là bí mật của kênh: ai có link đều mở được overlay. Lộ link thì bấm "Đổi link" (link cũ ngừng hoạt động).'),
      h('button', { class: 'ghost', onclick: async () => { if (!confirm('Đổi link overlay? Link cũ trong OBS sẽ ngừng hoạt động.')) return; S.cur = await req('rotate', { channel: c.id }); render(); toast('Đã đổi link — cập nhật lại trong OBS'); } }, 'Đổi link')),
    h('div', { class: 'card' }, h('h2', {}, 'Game đang chơi'), h('div', { class: 'row' }, gameSel,
      h('button', { onclick: async () => { try { S.cur = await req('update', { channel: c.id, game: gameSel.value }); refreshList(); toast('Đã đổi game — overlay tự nạp lại'); } catch (e) { toast(e.message, true); } } }, 'Đổi game'))),
    h('div', { class: 'card' }, h('h2', {}, 'Username TikTok'), h('div', { class: 'row' }, user,
      h('button', { onclick: async () => { try { S.cur = await req('update', { channel: c.id, username: user.value }); refreshList(); toast('Đã lưu'); } catch (e) { toast(e.message, true); } } }, 'Lưu')),
      h('h3', {}, 'Xoá kênh'), h('button', { class: 'danger', onclick: async () => { if (!confirm(`Xoá kênh @${c.username}? Không hoàn tác được.`)) return; await req('delete', { channel: c.id }); S.channels = S.channels.filter((x) => x.id !== c.id); S.cur = null; render(); } }, 'Xoá kênh')));
}

// ---- tab Studio: kéo thả widget lên khung 9:16 (dùng chung mọi game) ----
const STAGE_W = 405, SCALE = STAGE_W / 1080, SNAP = 10;
const widgetMod = new Map();
const loadWidget = (type) => { if (!widgetMod.has(type)) widgetMod.set(type, import(`/widgets/${type}/index.js`)); return widgetMod.get(type); };
const metaOf = (type) => (S.widgets || []).find((w) => w.id === type);
const defaultsOf = (meta) => Object.fromEntries(Object.entries(meta?.schema?.properties || {}).map(([k, s]) => [k, s.default]));
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const studioOf = (c) => JSON.parse(JSON.stringify({ widgets: [], sounds: [], panels: {}, ...(c.studio || {}) }));
// màn chuẩn bị / kết thúc live (cấu hình Studio, dùng chung mọi game)
const THEME_SCH = { type: 'string', title: 'Màu nền', enum: ['tim', 'dem', 'cam', 'xanh', 'hong'], enumNames: ['Tím hồng', 'Đêm xanh', 'Hoàng hôn cam', 'Biển xanh', 'Hồng'] };
const IMG_SCH = { type: 'string', title: 'Ảnh nền (link https, để trống = dùng màu)', maxLength: 500 };
const SCENE_SCH = {
  intro: {
    title: { type: 'string', title: 'Tiêu đề', maxLength: 60, default: 'LIVE SẮP BẮT ĐẦU' },
    subtitle: { type: 'string', title: 'Lời nhắn', maxLength: 160, default: 'Chờ chút nhé, mình đang chuẩn bị 💖' },
    countdownMin: { type: 'integer', title: 'Đếm ngược (phút, 0 = không đếm)', minimum: 0, maximum: 180, default: 5 },
    autoLive: { type: 'boolean', title: 'Hết đếm ngược thì tự vào live', default: false },
    showChat: { type: 'boolean', title: 'Hiện bình luận / người vừa vào', default: true },
    theme: { ...THEME_SCH, default: 'tim' }, image: { ...IMG_SCH, default: '' },
  },
  outro: {
    title: { type: 'string', title: 'Tiêu đề', maxLength: 60, default: 'CẢM ƠN MỌI NGƯỜI!' },
    subtitle: { type: 'string', title: 'Lời chào / lịch live sau', maxLength: 160, default: 'Hẹn gặp lại ở buổi live sau nha 👋' },
    warnMin: { type: 'integer', title: 'Báo trước khi tắt (phút, 0 = không báo)', minimum: 0, maximum: 60, default: 5 },
    pauseGame: { type: 'boolean', title: 'Tạm dừng game khi kết thúc', default: true },
    showTop: { type: 'boolean', title: 'Hiện top người tặng quà', default: true },
    theme: { ...THEME_SCH, default: 'dem' }, image: { ...IMG_SCH, default: '' },
  },
};
const sceneDefaults = (k) => Object.fromEntries(Object.entries(SCENE_SCH[k]).map(([f, sc]) => [f, sc.default]));
const hhmm = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const dur = (ms) => { const x = Math.max(0, Math.ceil(ms / 1000)); const hh = Math.floor(x / 3600), mm = Math.floor((x % 3600) / 60), ss = x % 60; return `${hh ? `${hh}:` : ''}${String(mm).padStart(hh ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`; };

/** Thẻ "Màn chuẩn bị & hẹn giờ tắt live" trong tab Studio. Nội dung lưu cùng nút Lưu của Studio; nút bật màn / hẹn giờ áp dụng ngay. */
function scenesCard(c, draft, markDirty, frame) {
  draft.scenes = { intro: { ...sceneDefaults('intro'), ...(draft.scenes?.intro || {}) }, outro: { ...sceneDefaults('outro'), ...(draft.scenes?.outro || {}) } };
  let scene = c.studio?.scene || { mode: 'live' };
  let previewing = null;
  const status = h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap' });
  const paintStatus = () => {
    const now = Date.now();
    const auto = scene.mode === 'intro' && draft.scenes.intro.autoLive && draft.scenes.intro.countdownMin > 0 && now >= (scene.at || 0) + draft.scenes.intro.countdownMin * 60_000;
    const ended = scene.mode !== 'outro' && scene.endAt && now >= scene.endAt;
    const m = ended ? 'outro' : auto ? 'live' : scene.mode;
    status.replaceChildren(...[
      h('span', { class: 'pill' }, m === 'intro' ? '🕒 Đang hiện màn chuẩn bị' : m === 'outro' ? '⏹ Đang hiện màn kết thúc' : '🔴 Đang live (không che)'),
      scene.endAt && !ended ? h('span', { class: 'pill' }, `⏰ Tắt live lúc ${hhmm(scene.endAt)} · còn ${dur(scene.endAt - now)}`) : null,
      m === 'intro' && draft.scenes.intro.countdownMin > 0 ? h('span', { class: 'pill' }, `Đếm ngược còn ${dur((scene.at || now) + draft.scenes.intro.countdownMin * 60_000 - now)}`) : null].filter(Boolean));
  };
  const tick = setInterval(() => { if (!status.isConnected) return clearInterval(tick); paintStatus(); }, 1000);
  const setScene = async (patch, msg) => {
    try {
      S.cur = await req('scene', { channel: c.id, scene: { mode: scene.mode, endAt: scene.endAt ?? null, ...patch } });
      scene = S.cur.studio?.scene || scene; paintStatus(); toast(msg);
    } catch (e) { toast(e.message, true); }
  };
  const preview = (m) => {
    previewing = previewing === m ? null : m;
    try { frame.contentWindow?.postMessage({ t: 'scene-preview', mode: previewing }, location.origin); } catch { /* bỏ qua */ }
    toast(previewing ? 'Đang xem thử trong khung bên trên (live không đổi). Bấm lại để tắt.' : 'Đã tắt xem thử');
  };
  const fields = (k) => Object.entries(SCENE_SCH[k]).map(([f, sc]) => fieldFor(f, sc, draft.scenes[k][f], (v) => { draft.scenes[k][f] = v; markDirty(); }));
  // hẹn giờ tắt: lúc HH:MM (hôm nay, qua giờ thì ngày mai) hoặc sau N phút
  const atTime = h('input', { type: 'time', value: scene.endAt ? new Date(scene.endAt).toTimeString().slice(0, 5) : '' });
  const afterMin = h('input', { type: 'number', min: 1, max: 1440, placeholder: 'phút', style: 'width:90px' });
  const schedule = () => {
    let endAt = null;
    if (afterMin.value) endAt = Date.now() + Number(afterMin.value) * 60_000;
    else if (atTime.value) {
      const [hh, mm] = atTime.value.split(':').map(Number);
      const d = new Date(); d.setHours(hh, mm, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      endAt = d.getTime();
    }
    if (!endAt) return toast('Chọn giờ tắt hoặc nhập số phút', true);
    setScene({ endAt, mode: scene.mode === 'outro' ? 'live' : scene.mode }, `Đã hẹn tắt live lúc ${hhmm(endAt)}`);
  };
  paintStatus();
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, '🎬 Màn chuẩn bị & hẹn giờ tắt live'), status),
    h('p', { class: 'small muted' }, 'Màn hình che toàn khung live (cả game và widget), dùng chung mọi game. Sửa nội dung xong bấm "Lưu & áp dụng" ở trên; các nút bật màn / hẹn giờ có tác dụng ngay. Khi đang ở màn chuẩn bị (và màn kết thúc nếu bật) game được tạm dừng.'),
    h('div', { class: 'st-scenes' },
      h('div', {},
        h('h3', {}, '🕒 Màn chuẩn bị live'), ...fields('intro'),
        h('div', { class: 'row', style: 'margin-top:10px;flex-wrap:wrap' },
          h('button', { onclick: () => setScene({ mode: 'intro' }, 'Đang hiện màn chuẩn bị') }, '▶ Bật màn chuẩn bị'),
          h('button', { class: 'ghost', onclick: () => setScene({ mode: 'live' }, 'Đã vào live') }, '✅ Vào live'),
          h('button', { class: 'ghost', onclick: () => preview('intro') }, '👁 Xem thử'))),
      h('div', {},
        h('h3', {}, '⏰ Hẹn giờ tắt live'),
        h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' }, 'Tắt lúc', atTime, 'hoặc sau', afterMin, 'phút',
          h('button', { onclick: schedule }, 'Đặt hẹn giờ'),
          h('button', { class: 'ghost', onclick: () => setScene({ endAt: null }, 'Đã huỷ hẹn giờ') }, 'Huỷ hẹn giờ')),
        ...fields('outro'),
        h('div', { class: 'row', style: 'margin-top:10px;flex-wrap:wrap' },
          h('button', { class: 'danger', onclick: () => { if (confirm('Hiện màn kết thúc live ngay?')) setScene({ mode: 'outro', endAt: null }, 'Đang hiện màn kết thúc'); } }, '⏹ Kết thúc ngay'),
          h('button', { class: 'ghost', onclick: () => setScene({ mode: 'live', endAt: null }, 'Đã quay lại live') }, '↩ Quay lại live'),
          h('button', { class: 'ghost', onclick: () => preview('outro') }, '👁 Xem thử')))));
}

// vùng giao diện TikTok LIVE thường che trên khung 1080×1920 (gần đúng, tuỳ máy)
const TIKTOK_ZONES = [
  { x: 0, y: 0, w: 1080, h: 150, label: 'Thanh trên TikTok' },
  { x: 0, y: 1250, w: 720, h: 520, label: '💬 Bình luận TikTok' },
  { x: 940, y: 860, w: 140, h: 780, label: 'Nút TikTok' },
  { x: 0, y: 1770, w: 1080, h: 150, label: 'Ô nhập bình luận / quà' },
];
const overlayLinks = (c) => [
  ['Đầy đủ (game + widget)', overlayUrl(c)],
  ['Chỉ game', `${overlayUrl(c)}?layer=game`],
  ['Chỉ widget (nền trong suốt, đặt chồng lên camera)', `${overlayUrl(c)}?layer=widgets`],
  ['Cửa sổ chơi (game cần gõ phím / bấm chuột, mở rồi Window Capture)', `${overlayUrl(c)}?play=1`],
];

function studioTab(c) {
  const draft = studioOf(c);
  // bảng của game đang chơi (bảng quà, dòng quà…): streamer kéo / phóng / ẩn để khỏi bị bình luận TikTok che
  const g = gameOf(c.active_game);
  const gSet = { ...Object.fromEntries(Object.entries(g?.schema?.properties || {}).map(([k, sc]) => [k, sc.default])), ...(c.games?.[g?.id]?.settings || {}) };
  const gPanels = g ? activePanels(g, gSet) : [];
  if (g && !draft.panels[g.id]) draft.panels[g.id] = {};
  const pmap = g ? draft.panels[g.id] : {};
  const pcur = (p) => ({ x: pmap[p.id]?.x ?? p.rect.x, y: pmap[p.id]?.y ?? p.rect.y, s: pmap[p.id]?.s ?? 1, hidden: !!pmap[p.id]?.hidden });
  const pviews = new Map(); // panel id → box
  let showZones = true;
  let sel = draft.widgets[0]?.id || (gPanels[0] ? `panel:${gPanels[0].id}` : null);
  let dirty = false;
  const views = new Map(); // id → { box, inst }
  const editLayer = h('div', { class: 'st-edit', style: `width:1080px;height:1920px;transform:scale(${SCALE})` });
  const inspector = h('div', {});
  const saveBtn = h('button', {}, 'Lưu & áp dụng');
  const markDirty = () => { dirty = true; saveBtn.textContent = '● Lưu & áp dụng'; };

  function place(w, box) { Object.assign(box.style, { left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px` }); }
  function mountView(w) {
    const old = views.get(w.id);
    try { old?.inst?.destroy(); } catch { /* bỏ qua */ }
    const box = old?.box || h('div', { class: 'st-box' });
    box.replaceChildren();
    const body = h('div', { class: 'st-body' });
    const handle = h('div', { class: 'st-handle', title: 'Kéo để đổi kích thước' });
    box.append(body, handle, h('div', { class: 'st-tag' }, `${metaOf(w.type)?.icon || ''} ${metaOf(w.type)?.name || w.type}`));
    place(w, box);
    box.classList.toggle('on', w.id === sel);
    const v = { box, inst: null };
    views.set(w.id, v);
    if (!box.isConnected) editLayer.append(box);
    loadWidget(w.type).then((mod) => { v.inst = mod.mount(body, { config: w.config, editing: true }); }).catch((e) => body.append(`Lỗi widget: ${e.message}`));
    // kéo để di chuyển / kéo góc để đổi kích thước (toạ độ theo khung 1080×1920)
    box.onpointerdown = (e) => {
      e.preventDefault();
      select(w.id);
      const resize = e.target === handle;
      const sx = e.clientX, sy = e.clientY, ox = w.x, oy = w.y, ow = w.w, oh = w.h;
      const min = metaOf(w.type)?.minSize || { w: 120, h: 60 };
      box.setPointerCapture(e.pointerId);
      box.onpointermove = (m) => {
        const dx = (m.clientX - sx) / SCALE, dy = (m.clientY - sy) / SCALE;
        const snap = (v) => Math.round(v / SNAP) * SNAP;
        if (resize) { w.w = clampN(snap(ow + dx), min.w, 1080 - w.x); w.h = clampN(snap(oh + dy), min.h, 1920 - w.y); }
        else { w.x = clampN(snap(ox + dx), 0, 1080 - w.w); w.y = clampN(snap(oy + dy), 0, 1920 - w.h); }
        place(w, box); markDirty();
      };
      box.onpointerup = () => { box.onpointermove = null; box.onpointerup = null; if (w.x !== ox || w.y !== oy || w.w !== ow || w.h !== oh) { if (resize) mountView(w); paintInspector(); } };
    };
  }
  const frame = h('iframe', { class: 'st-frame', src: `/o/${c.overlay_key}?preview=1&widgets=0`, title: 'Game (xem trước)', style: `transform:scale(${SCALE})` });
  function postPanels() { if (g) try { frame.contentWindow?.postMessage({ t: 'panels', game: g.id, panels: JSON.parse(JSON.stringify(pmap)) }, location.origin); } catch { /* bỏ qua */ } }
  frame.addEventListener('load', () => setTimeout(postPanels, 800));
  function placePanel(p, box) {
    const v = pcur(p);
    Object.assign(box.style, { left: `${v.x}px`, top: `${v.y}px`, width: `${p.rect.w * v.s}px`, height: `${p.rect.h * v.s}px` });
    box.classList.toggle('hidden', v.hidden);
  }
  function mountPanel(p) {
    const box = h('div', { class: 'st-box st-panel' });
    const handle = h('div', { class: 'st-handle', title: 'Kéo để phóng to / thu nhỏ' });
    box.append(handle, h('div', { class: 'st-tag' }, `${p.icon || '🎮'} ${p.label}`), h('div', { class: 'st-plabel' }, `${p.icon || '🎮'} ${p.label}`));
    placePanel(p, box);
    box.classList.toggle('on', sel === `panel:${p.id}`);
    pviews.set(p.id, box);
    editLayer.append(box);
    box.onpointerdown = (e) => {
      e.preventDefault();
      select(`panel:${p.id}`);
      const resize = e.target === handle;
      const v0 = pcur(p);
      const sx = e.clientX, sy = e.clientY;
      box.setPointerCapture(e.pointerId);
      box.onpointermove = (m) => {
        const dx = (m.clientX - sx) / SCALE, dy = (m.clientY - sy) / SCALE;
        const o = (pmap[p.id] ||= {});
        if (resize) o.s = Math.round(clampN((p.rect.w * v0.s + dx) / p.rect.w, PANEL_SCALE.min, PANEL_SCALE.max) * 100) / 100;
        else { o.x = Math.round((v0.x + dx) / SNAP) * SNAP; o.y = Math.round((v0.y + dy) / SNAP) * SNAP; }
        o.x ??= v0.x; o.y ??= v0.y; o.s ??= v0.s;
        placePanel(p, box); markDirty(); postPanels();
      };
      box.onpointerup = () => { box.onpointermove = null; box.onpointerup = null; paintInspector(); };
    };
  }
  function paintStage() {
    for (const v of views.values()) { try { v.inst?.destroy(); } catch { /* bỏ qua */ } v.box.remove(); }
    views.clear();
    for (const b of pviews.values()) b.remove();
    pviews.clear();
    editLayer.querySelectorAll('.st-zone').forEach((z) => z.remove());
    if (showZones) for (const z of TIKTOK_ZONES) editLayer.append(h('div', { class: 'st-zone', style: `left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px` }, z.label));
    gPanels.forEach(mountPanel); // bảng của game nằm dưới widget
    draft.widgets.forEach(mountView); // thứ tự trong mảng = thứ tự lớp (sau đè trước)
  }
  function select(id) {
    sel = id;
    for (const [k, v] of views) v.box.classList.toggle('on', k === id);
    for (const [k, b] of pviews) b.classList.toggle('on', `panel:${k}` === id);
    paintInspector();
  }
  function panelInspector(p) {
    const v = pcur(p);
    const set = (patch) => { pmap[p.id] = { x: v.x, y: v.y, s: v.s, hidden: v.hidden, ...pmap[p.id], ...patch }; markDirty(); placePanel(p, pviews.get(p.id)); postPanels(); paintInspector(); };
    const numIn = (k, max) => h('input', { type: 'number', value: v[k], min: 0, max, step: SNAP, style: 'width:80px', onchange: (e) => set({ [k]: clampN(Math.round(Number(e.target.value) || 0), 0, max) }) });
    inspector.replaceChildren(
      h('h3', {}, `${p.icon || '🎮'} ${p.label}`),
      h('p', { class: 'small muted' }, `Bảng có sẵn của game ${g.name}. Kéo ra khỏi vùng bình luận TikTok (ô đỏ) để người xem thấy rõ. Chỉ áp dụng cho game này.`),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: v.hidden, onchange: (e) => set({ hidden: e.target.checked }) }), 'Ẩn bảng này'),
      h('div', { class: 'row small', style: 'margin-top:8px' }, 'Cỡ', h('input', { type: 'range', min: PANEL_SCALE.min * 100, max: PANEL_SCALE.max * 100, step: 5, value: Math.round(v.s * 100), class: 'grow', onchange: (e) => set({ s: Number(e.target.value) / 100 }) }), `${Math.round(v.s * 100)}%`),
      h('div', { class: 'row small', style: 'margin-top:10px' }, 'x', numIn('x', 1080), 'y', numIn('y', 1920)),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'ghost small', onclick: () => { delete pmap[p.id]; markDirty(); placePanel(p, pviews.get(p.id)); postPanels(); paintInspector(); } }, '↺ Về vị trí mặc định')));
  }
  function add(meta) {
    const size = meta.size || { w: 500, h: 200 };
    const n = draft.widgets.length;
    const w = { id: `${meta.id}-${Date.now().toString(36)}`, type: meta.id, x: Math.round((1080 - size.w) / 2 / SNAP) * SNAP, y: clampN(320 + n * 60, 0, 1920 - size.h), w: size.w, h: size.h, config: defaultsOf(meta) };
    draft.widgets.push(w); markDirty(); mountView(w); select(w.id);
  }
  function paintInspector() {
    const gp = typeof sel === 'string' && sel.startsWith('panel:') ? gPanels.find((p) => `panel:${p.id}` === sel) : null;
    if (gp) return panelInspector(gp);
    const w = draft.widgets.find((x) => x.id === sel);
    if (!w) return inspector.replaceChildren(h('p', { class: 'muted small' }, 'Bấm vào một widget trên khung để chỉnh, hoặc thêm widget từ thư viện bên trái.'));
    const meta = metaOf(w.type);
    const props = meta?.schema?.properties || {};
    const numIn = (k, max) => h('input', { type: 'number', value: w[k], min: 0, max, step: SNAP, style: 'width:80px', onchange: (e) => { w[k] = clampN(Math.round(Number(e.target.value) || 0), 0, max); markDirty(); mountView(w); } });
    const i = draft.widgets.indexOf(w);
    inspector.replaceChildren(
      h('h3', {}, `${meta?.icon || ''} ${meta?.name || w.type}`), h('p', { class: 'small muted' }, meta?.description || ''),
      ...Object.entries(props).map(([k, s]) => fieldFor(k, s, w.config[k], (v) => { w.config[k] = v; markDirty(); mountView(w); })),
      h('div', { class: 'row small', style: 'margin-top:10px' }, 'x', numIn('x', 1080), 'y', numIn('y', 1920), 'rộng', numIn('w', 1080), 'cao', numIn('h', 1920)),
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'ghost small', disabled: i === draft.widgets.length - 1, onclick: () => { draft.widgets.splice(i, 1); draft.widgets.splice(i + 1, 0, w); markDirty(); paintStage(); select(w.id); } }, '⬆ Lên trên'),
        h('button', { class: 'ghost small', disabled: i === 0, onclick: () => { draft.widgets.splice(i, 1); draft.widgets.splice(i - 1, 0, w); markDirty(); paintStage(); select(w.id); } }, '⬇ Xuống dưới'),
        h('button', { class: 'ghost small', onclick: () => { const cp = { ...JSON.parse(JSON.stringify(w)), id: `${w.type}-${Date.now().toString(36)}`, y: clampN(w.y + 40, 0, 1920 - w.h) }; draft.widgets.push(cp); markDirty(); mountView(cp); select(cp.id); } }, '⧉ Nhân bản'),
        h('button', { class: 'danger small', onclick: () => { draft.widgets.splice(i, 1); const v = views.get(w.id); try { v?.inst?.destroy(); } catch { /* bỏ qua */ } v?.box.remove(); views.delete(w.id); markDirty(); select(draft.widgets.at(-1)?.id || null); } }, '✕ Xoá')));
  }
  saveBtn.onclick = async () => {
    try { S.cur = await req('studio', { channel: c.id, studio: draft }); dirty = false; toast('Đã lưu — overlay cập nhật ngay, không cần tải lại'); render(); } catch (e) { toast(e.message, true); }
  };
  window.onbeforeunload = (e) => { if (dirty && S.tab === 'studio') e.preventDefault(); };

  const stage = h('div', { class: 'st-stage', style: `width:${STAGE_W}px;height:${STAGE_W * 16 / 9}px` }, frame, editLayer);
  paintStage(); paintInspector();
  const lib = h('div', {},
    gPanels.length ? h('div', { class: 'st-lib', style: 'margin-bottom:14px' },
      h('p', { class: 'small muted', style: 'margin:0 0 6px' }, `Bảng của game ${g.name} (bấm để chỉnh)`),
      gPanels.map((p) => h('button', { class: 'ghost', onclick: () => select(`panel:${p.id}`) }, h('span', { class: 'st-ico' }, p.icon || '🎮'), h('span', {}, `${p.label}${pcur(p).hidden ? ' (đang ẩn)' : ''}`)))) : null,
    h('label', { class: 'row small', style: 'margin-bottom:10px' }, h('input', { type: 'checkbox', checked: showZones, onchange: (e) => { showZones = e.target.checked; paintStage(); } }), 'Hiện vùng TikTok hay che'),
    h('p', { class: 'small muted', style: 'margin:0 0 6px' }, 'Widget (dùng chung mọi game)'),
    h('div', { class: 'st-lib' }, (S.widgets || []).map((m) => h('button', { class: 'ghost', title: m.description, onclick: () => add(m) }, h('span', { class: 'st-ico' }, m.icon), h('span', {}, m.name)))));
  const scenes = scenesCard(c, draft, markDirty, frame);
  return h('div', {},
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, '🎬 Studio — bố cục widget trên khung 9:16'), saveBtn,
        h('button', { class: 'ghost', onclick: () => { if (!dirty || confirm('Bỏ các thay đổi chưa lưu?')) render(); } }, 'Hoàn tác'),
        h('button', { class: 'ghost', title: 'Đếm lại xu / tim / follow / top tặng quà từ 0', onclick: async () => { if (!confirm('Đặt lại số liệu phiên (xu, tim, follow, top tặng quà) về 0?')) return; try { await req('stats-reset', { channel: c.id }); toast('Đã đặt lại số liệu phiên'); } catch (e) { toast(e.message, true); } } }, '↺ Đặt lại số liệu')),
      h('p', { class: 'small muted' }, 'Kéo widget để di chuyển, kéo góc dưới phải để đổi kích thước (bước 10px). Widget dùng chung cho mọi game; đổi game không mất bố cục. Bảng của game (viền vàng: bảng quà, dòng quà…) kéo / phóng / ẩn được, riêng cho từng game. Ô đỏ là vùng TikTok hay che (bình luận, nút). Nền là game đang chạy (cần mở overlay chính).'),
      h('div', { class: 'st-grid' }, h('div', {}, h('h3', {}, 'Thư viện'), lib), stage, h('div', {}, h('h3', {}, 'Cài đặt widget'), inspector))),
    scenes,
    h('div', { class: 'card' }, h('h2', {}, 'Link overlay theo lớp'),
      overlayLinks(c).map(([label, url]) => h('div', { class: 'row', style: 'margin-bottom:6px' }, h('span', { style: 'min-width:260px' }, label), h('input', { value: url, readOnly: true, class: 'grow', onclick: (e) => e.target.select() }),
        h('button', { class: 'ghost', onclick: () => navigator.clipboard.writeText(url).then(() => toast('Đã copy')) }, 'Copy'))),
      h('p', { class: 'small muted' }, 'Dùng một link "Đầy đủ" là đủ. Muốn đặt widget chồng lên camera / game khác thì thêm link "Chỉ widget" thành một Browser source riêng (1080×1920) — âm thanh Studio phát ở overlay chính; overlay chỉ-widget thêm &sound=1 nếu muốn nó phát.')));
}

// ---- tab Âm thanh: luật "khi … thì phát …" (Studio, dùng chung mọi game) ----
let soundLib = null, soundPlayer = null;
async function sounds() {
  if (!soundLib) { soundLib = await import('/web/js/sounds.js'); soundPlayer = soundLib.createSoundPlayer(); }
  return soundLib;
}
const WHEN_LABEL = { ...TRIG_LABEL, goal: '🎯 Đạt mục tiêu' };

/** Thư viện âm thanh chia nhóm; onPick(id) khi bấm. */
function soundGroups(onPick) {
  const { SOUNDS, SOUND_GROUPS } = soundLib;
  return h('div', { class: 'sfx-groups' }, SOUND_GROUPS.map((g) => h('div', { class: 'sfx-group' }, h('div', { class: 'sfx-label' }, g),
    h('div', { class: 'row' }, SOUNDS.filter((x) => x.group === g).map((x) => h('button', { class: 'ghost small', onclick: () => onPick(x.id) }, x.name))))));
}

/** Soundboard: bấm là overlay đang mở phát ngay trên live. */
function soundboard(c) {
  const box = h('div', { class: 'card' }, h('h2', {}, 'Bảng âm thanh'), h('p', { class: 'muted small' }, 'Đang tải…'));
  sounds().then(() => box.replaceChildren(h('h2', {}, 'Bảng âm thanh'), h('p', { class: 'small muted' }, 'Bấm là phát ngay trên live (overlay chính). Dùng để chọc cười, hô hào, tạo kịch tính.'),
    soundGroups((id) => req('sfx', { channel: c.id, sound: id }).catch((e) => toast(e.message, true)))));
  return box;
}

function soundsTab(c) {
  const draft = studioOf(c);
  const box = h('div', {}, h('p', { class: 'muted' }, 'Đang tải thư viện âm thanh…'));
  sounds().then(({ SOUNDS }) => {
    const goals = draft.widgets.filter((w) => w.type === 'goal');
    const row = (r) => {
      const t = r.when;
      const type = h('select', { onchange: (e) => { r.when = e.target.value === 'goal' ? { type: 'goal' } : freshTrigger(e.target.value); el.replaceWith(row(r)); } },
        Object.entries(WHEN_LABEL).map(([k, v]) => h('option', { value: k, selected: k === t.type }, v)));
      const fields = t.type === 'goal'
        ? [h('select', { onchange: (e) => { if (e.target.value) t.goal = e.target.value; else delete t.goal; } }, h('option', { value: '' }, 'mục tiêu bất kỳ'), goals.map((g) => h('option', { value: g.id, selected: g.id === t.goal }, g.config?.title || g.id)))]
        : trigFields(t);
      const url = h('input', { class: 'wide', placeholder: 'https://…/am-thanh.mp3', value: r.url || '', hidden: r.sound !== 'url', onchange: (e) => { r.url = e.target.value.trim(); } });
      const snd = h('select', { onchange: (e) => { r.sound = e.target.value; url.hidden = r.sound !== 'url'; } },
        SOUNDS.map((x) => h('option', { value: x.id, selected: x.id === r.sound }, x.name)), h('option', { value: 'url', selected: r.sound === 'url' }, '🔗 Link riêng (https)'));
      const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: r.volume ?? 0.8, style: 'width:90px', title: 'Âm lượng', oninput: (e) => { r.volume = Number(e.target.value); } });
      const el = h('div', { class: 'trig' }, 'Khi', type, fields, '→ phát', snd, url, vol,
        h('button', { class: 'ghost small', title: 'Nghe thử', onclick: () => { soundPlayer.resume(); soundPlayer.play(r.sound, { volume: r.volume ?? 0.8, url: r.url }); } }, '▶'),
        h('button', { class: 'ghost small', onclick: () => { draft.sounds.splice(draft.sounds.indexOf(r), 1); el.remove(); } }, '✕'));
      return el;
    };
    const list = h('div', {}, draft.sounds.map(row));
    box.replaceChildren(list,
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'ghost', onclick: () => { const r = { id: `s${Date.now().toString(36)}`, when: { type: 'gift', minDiamonds: 1 }, sound: 'coin', volume: 0.8 }; draft.sounds.push(r); list.append(row(r)); } }, '+ Thêm luật'),
        h('button', { onclick: async () => { try { S.cur = await req('studio', { channel: c.id, studio: draft }); toast('Đã lưu luật âm thanh'); render(); } catch (e) { toast(e.message, true); } } }, 'Lưu')),
      h('h3', {}, `Thư viện ${SOUNDS.length} âm (bấm để nghe thử trên máy bạn)`),
      soundGroups((id) => { soundPlayer.resume(); soundPlayer.play(id); }));
  });
  return h('div', { class: 'card' }, h('h2', {}, '🔊 Âm thanh — khi … thì phát …'),
    h('p', { class: 'small muted' }, 'Âm thanh phát trên overlay chính (thứ OBS / LIVE Studio thu), không phát ở dashboard. Một món quà khớp tối đa một luật quà (theo tên trước, rồi theo xu). Tối đa 4 âm / giây để không ồn.'),
    box);
}

async function refreshList() { S.channels = await req('channels'); render(); }

start().catch((e) => { root.replaceChildren(h('div', { class: 'card' }, `Lỗi: ${e.message}`)); });

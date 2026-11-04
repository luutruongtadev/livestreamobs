// Màn "Chúc cả nhà ngủ ngon" khi tới giờ hẹn kết thúc live (dùng chung cho mọi trang game).
// Server gửi { type: 'goodbye', goodbye: { active: { message, remaining, done } } }. ?tts=0 tắt giọng đọc.
const qs = new URLSearchParams(location.search);
const tts = qs.get('tts') !== '0' && qs.get('mute') !== '1';

const css = `
#gbye { position: fixed; inset: 0; z-index: 50; display: none; align-items: center; justify-content: center; overflow: hidden;
  background: radial-gradient(ellipse at 50% 30%, #1e1b4b 0%, #0b0a1f 55%, #05040d 100%); color: #f5f3ff;
  font-family: 'Be Vietnam Pro', system-ui, sans-serif; text-align: center; opacity: 0; transition: opacity .8s ease; }
#gbye.on { display: flex; }
#gbye.show { opacity: 1; }
#gbye .star { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #fff; animation: gbTw 2.4s ease-in-out infinite; }
#gbye .card { position: relative; width: min(88vw, 52vh); padding: 4vh 3vh; }
#gbye .moon { font-size: min(22vw, 13vh); line-height: 1; filter: drop-shadow(0 0 4vh rgba(253,230,138,.55)); animation: gbFloat 4s ease-in-out infinite; }
#gbye h1 { margin: 2.5vh 0 1.5vh; font-size: min(9vw, 5.4vh); font-weight: 900; line-height: 1.15; color: #fde68a; text-wrap: balance; text-shadow: 0 0 3vh rgba(253,230,138,.35); }
#gbye p { margin: 0 auto; max-width: 30ch; font-size: min(5.2vw, 3vh); line-height: 1.45; color: #e0e7ff; text-wrap: pretty; }
#gbye .count { margin-top: 4vh; font-size: min(4.4vw, 2.6vh); color: #c4b5fd; font-weight: 700; }
#gbye .count b { display: block; margin-top: .6vh; font-size: min(14vw, 8.5vh); color: #fff; font-variant-numeric: tabular-nums; }
#gbye .heart { position: absolute; bottom: -6vh; font-size: min(7vw, 4vh); animation: gbUp 6s linear infinite; opacity: .85; }
@keyframes gbTw { 0%,100% { opacity: .15; } 50% { opacity: 1; } }
@keyframes gbFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.5vh); } }
@keyframes gbUp { to { transform: translateY(-115vh) rotate(25deg); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { #gbye .star, #gbye .moon, #gbye .heart { animation: none; } #gbye .heart { display: none; } }
`;
const style = document.createElement('style');
style.textContent = css;
document.head.append(style);

const el = document.createElement('div');
el.id = 'gbye';
el.setAttribute('role', 'status');
el.innerHTML = '<div class="card"><div class="moon">🌙</div><h1></h1><p></p><div class="count"></div></div>';
for (let i = 0; i < 70; i++) {
  const s = document.createElement('i');
  s.className = 'star';
  s.style.left = Math.random() * 100 + '%'; s.style.top = Math.random() * 100 + '%';
  s.style.animationDelay = (Math.random() * 2.4).toFixed(2) + 's';
  if (Math.random() < 0.2) { s.style.width = s.style.height = '4px'; }
  el.append(s);
}
for (let i = 0; i < 8; i++) {
  const h = document.createElement('span');
  h.className = 'heart'; h.textContent = ['💖', '💜', '✨', '🌟'][i % 4];
  h.style.left = (8 + i * 11) + '%'; h.style.animationDelay = (i * 0.75).toFixed(2) + 's';
  el.append(h);
}
document.body.append(el);
const $h1 = el.querySelector('h1'), $p = el.querySelector('p'), $count = el.querySelector('.count');

let state = null;
let endsAt = 0;
let spoken = false;

function speak(text) {
  if (!tts || !window.speechSynthesis) return;
  const vi = speechSynthesis.getVoices().find((v) => /^vi/i.test(v.lang));
  if (!vi) return;
  const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s.,!?]/gu, ' '));
  u.voice = vi; u.lang = vi.lang; u.rate = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function render() {
  const a = state?.active;
  if (!a) {
    el.classList.remove('show');
    setTimeout(() => { if (!state?.active) el.classList.remove('on'); }, 800);
    spoken = false;
    return;
  }
  el.classList.add('on');
  requestAnimationFrame(() => el.classList.add('show'));
  if (a.done) {
    $h1.textContent = 'Live đã kết thúc';
    $p.textContent = a.message;
    $count.innerHTML = 'Hẹn gặp lại cả nhà nha! 💖';
  } else {
    $h1.textContent = 'Chúc cả nhà ngủ ngon!';
    $p.textContent = a.message;
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    $count.innerHTML = `Live kết thúc sau<b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b>`;
    if (!spoken) { spoken = true; speak(`Chúc cả nhà ngủ ngon! ${a.message}`); }
  }
}

function onState(g) {
  state = g;
  if (g?.active && !g.active.done) endsAt = Date.now() + g.active.remaining * 1000;
  render();
}
setInterval(() => { if (state?.active && !state.active.done) render(); }, 250);

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onclose = () => setTimeout(connect, 3000);
  ws.onerror = () => ws.close();
  ws.onmessage = (m) => {
    // chỉ đọc tin chào tạm biệt; bỏ qua nhanh các tin khác
    if (!m.data.includes('"goodbye"')) return;
    let msg; try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.type === 'hello' || msg.type === 'goodbye') onState(msg.goodbye);
  };
}
connect();

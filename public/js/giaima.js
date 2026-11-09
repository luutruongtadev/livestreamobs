// Màn hình game "Giải mã" (/giaima) — 1080×1920 cho OBS / điện thoại.
// Câu bí ẩn tiếng Việt: mỗi ô lục giác là 1 chữ cái, số bên dưới; cùng số = cùng chữ (cả câu lẫn gợi ý).
// Người xem bình luận đáp án gợi ý (câu hỏi tiếng Việt, đáp án Việt / Anh) → lộ chữ; đoán cả câu → thắng.
// ?mute=1 tắt tiếng · ?tts=0 tắt giọng đọc · ?bg=green | none (nền xanh / trong suốt cho OBS)
import { SoundBoard } from './sound.js';

const W = 1080, H = 1920;
const qs = new URLSearchParams(location.search);
const opt = { mute: qs.get('mute') === '1', tts: qs.get('tts') !== '0' && qs.get('mute') !== '1' };
const stage = document.getElementById('stage');
if (qs.get('bg') === 'green' || qs.get('bg') === 'none') stage.classList.add(qs.get('bg'));
function fit() {
  const k = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * k) / 2}px, 0) scale(${k})`;
}
addEventListener('resize', fit); fit();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (t, n) => { const a = [...String(t || '')]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function avatar(url, name, cls = 'av') {
  const ch = esc([...String(name || '?').trim()][0] || '?');
  if (!url) return `<div class="${cls}">${ch}</div>`;
  return `<img class="${cls}" src="${esc(url)}" referrerpolicy="no-referrer" alt="" onerror="this.outerHTML='<div class=&quot;${cls}&quot;>${ch}</div>'">`;
}

let S = null; // snapshot từ server
let sound = new SoundBoard({ muted: opt.mute, theme: 'game' });
const play = (name, o) => { try { sound.play(name, o); } catch { /* chưa bật tiếng */ } };
const flash = new Map(); // số vừa lộ → hết hạn lúc
const rowPop = new Map(); // gợi ý vừa giải → hết hạn lúc
let prevOpen = new Set();
let lastSig = '';

// ---------------- vẽ câu bí ẩn + gợi ý ----------------
/** Chọn cỡ ô lục giác lớn nhất mà câu vẫn vừa khung (ngắt dòng theo từ). */
function layoutPhrase(words) {
  for (let w = 100; w >= 40; w -= 4) {
    const cg = Math.round(w * 0.08), wg = Math.round(w * 0.42), lg = Math.round(w * 0.16);
    const maxW = 950;
    const lines = [];
    let cur = [], curW = 0, ok = true;
    for (const word of words) {
      const ww = word.length * w + (word.length - 1) * cg;
      if (ww > maxW) { ok = false; break; }
      if (cur.length && curW + wg + ww > maxW) { lines.push(cur); cur = []; curW = 0; }
      curW += (cur.length ? wg : 0) + ww;
      cur.push(word);
    }
    if (!ok) continue;
    if (cur.length) lines.push(cur);
    const cellH = w * 1.1 + w * 0.34 + 4;
    if (lines.length * cellH + (lines.length - 1) * lg <= 420) return { w, cg, wg, lg, lines };
  }
  return { w: 40, cg: 3, wg: 16, lg: 6, lines: [words] };
}

function cellHtml(c, key) {
  const now = performance.now();
  const isNew = c.ch && !prevOpen.has(key);
  const fl = (flash.get(c.n) || 0) > now;
  return `<div class="cell${c.ch ? ' open' : ''}${isNew ? ' pop' : ''}${fl ? ' flash' : ''}"><div class="hex"><b>${c.ch ? esc(c.ch) : ''}</b></div><div class="num">${c.n || ''}</div></div>`;
}

function renderBoard() {
  if (!S?.words) { $('lines').innerHTML = '<div style="font-size:34px;color:#a5b4fc;font-weight:800">Đang chuẩn bị câu bí ẩn…</div>'; $('clueList').innerHTML = ''; return; }
  const now = performance.now();
  const sig = JSON.stringify([S.words, S.clues, [...flash].filter(([, t]) => t > now).map(([n]) => n), [...rowPop].filter(([, t]) => t > now).map(([i]) => i)]);
  if (sig === lastSig) return;
  lastSig = sig;
  const open = new Set();
  // câu bí ẩn
  const L = layoutPhrase(S.words);
  const lines = $('lines');
  lines.style.setProperty('--w', L.w + 'px'); lines.style.setProperty('--cg', L.cg + 'px'); lines.style.setProperty('--wg', L.wg + 'px'); lines.style.setProperty('--lg', L.lg + 'px');
  let wi = 0;
  lines.innerHTML = L.lines.map((line) => `<div class="line">${line.map((word) => {
    const i = wi++;
    return `<div class="word">${word.map((c, ci) => { const k = `p${i}.${ci}`; if (c.ch) open.add(k); return cellHtml(c, k); }).join('')}</div>`;
  }).join('')}</div>`).join('');
  // gợi ý
  const n = S.clues.length;
  const box = $('clues');
  const hexW = n <= 3 ? 58 : n === 4 ? 52 : n === 5 ? 46 : 42;
  box.style.setProperty('--ew', (n <= 3 ? 100 : n === 4 ? 90 : n === 5 ? 80 : 72) + 'px');
  box.style.setProperty('--qs', (n <= 4 ? 29 : n === 5 ? 27 : 25) + 'px');
  $('clueList').innerHTML = S.clues.map((c, idx) => {
    const cls = c.solvedBy ? ' solved' : c.auto ? ' auto' : '';
    const pop = (rowPop.get(idx) || 0) > now ? ' pop' : '';
    const ans = c.cells.map((word, wj) => `<div class="word">${word.map((cell, ci) => { const k = `c${idx}.${wj}.${ci}`; if (cell.ch) open.add(k); return cellHtml(cell, k); }).join('')}</div>`).join('');
    const who = c.solvedBy ? `<div class="who">${avatar(c.solvedBy.avatar, c.solvedBy.name)}<span>${c.via === 'gift' ? '🎁 ' : '✔ '}${esc(clip(c.solvedBy.name, 18))}</span></div>`
      : c.auto ? '<div class="who"><span>🔓 tự lộ</span></div>' : '';
    return `<div class="clue${cls}${pop}"><div class="emo">${esc(c.e)}</div><div class="body">
      <div class="q"><span class="tag ${c.lang}">${c.lang === 'en' ? '🇬🇧 TIẾNG ANH' : '🇻🇳 TIẾNG VIỆT'}</span><span class="t">${esc(c.q)}</span></div>
      <div class="row2"><div class="ans" style="--w:${hexW}px;--cg:4px">${ans}</div>${who}</div></div></div>`;
  }).join('');
  prevOpen = open;
}

function renderTop() {
  if (!S) return;
  $('kind').textContent = S.kind || 'Câu bí ẩn';
  $('round').textContent = S.round ? `Vòng ${S.round}` : '';
  const left = S.phase === 'playing' ? S.remaining : 0;
  $('time').textContent = S.phase === 'playing' ? mmss(left) : S.phase === 'break' ? 'Nghỉ' : '--:--';
  $('timer').classList.toggle('low', S.phase === 'playing' && left <= 30);
  // tim
  const every = S.likeEvery || 0;
  $('likes').style.display = every ? '' : 'none';
  if (every) {
    $('likes').querySelector('i').style.width = Math.min(100, (S.likeCount / every) * 100) + '%';
    $('likes').querySelector('span').textContent = `❤️ Thả tim: ${S.likeCount.toLocaleString('vi-VN')}/${every.toLocaleString('vi-VN')} → lộ 1 chữ`;
  }
  $('chips').innerHTML = (S.gifts || []).map((g) => `<div class="chip"><span class="e">${esc(g.icon)}</span>${esc(g.label)}${g.every ? `<small>${g.count}/${g.every}</small>` : ''}</div>`).join('');
  $('board').innerHTML = S.board?.length
    ? `<span class="h">🏆 Cao thủ hôm nay</span>${S.board.map((b, i) => `<div class="p">${avatar(b.avatar, b.name)}<span>${['🥇', '🥈', '🥉', '4.', '5.'][i]} ${esc(clip(b.name, 12))}</span><em>${b.points}</em></div>`).join('')}`
    : '<span class="h">🏆 Giải gợi ý +10 · giải cả câu +100</span>';
}

function renderOverlays() {
  const p = $('pause');
  if (S?.paused) {
    const why = { offline: ['⏸ TẠM DỪNG', 'Chờ kênh lên live…'], off: ['🔐 Giải mã đang tắt', 'Bật game trong trang admin'], goodnight: ['🌙 Live đã kết thúc', 'Hẹn gặp lại cả nhà!'] }[S.pauseReason] || ['⏸ TẠM DỪNG', 'Chờ một chút nhé…'];
    p.querySelector('.card').innerHTML = `<h1>${why[0]}</h1><div class="sub" style="margin-top:18px">${why[1]}</div>`;
    p.classList.add('on');
  } else p.classList.remove('on');
  if (S?.phase === 'playing') $('win').classList.remove('on');
  // mở trang / kết nối lại giữa giờ nghỉ: vẫn hiện thẻ đáp án
  if (S?.phase === 'break' && S.answer && !$('win').classList.contains('on')) {
    const w = S.winner;
    endCard(w ? `<h1>🎉 GIẢI MÃ THÀNH CÔNG!</h1>${avatar(w.avatar, w.name, 'av bigav')}<div class="name">${esc(w.name)}</div><div class="sub">sau ${w.seconds} giây</div>`
      : '<h1>⏰ HẾT GIỜ!</h1><div class="sub" style="margin-top:14px">Câu bí ẩn là</div>', S.answer);
  }
}
function endCard(head, a, extra = '') {
  $('win').querySelector('.card').innerHTML = `${head}<div class="ph">${esc(a.phrase)}</div><div class="mean">${esc(a.kind)}${a.meaning ? ' · ' + esc(a.meaning) : ''}</div>${extra}<div class="next"></div>`;
  $('win').classList.add('on');
}

// đồng hồ / đếm ngược chạy mượt giữa 2 lần server gửi
let nextAt = 0;
setInterval(() => {
  renderBoard(); // hết hiệu ứng nháy → vẽ lại
  const nx = $('win').querySelector('.next');
  if (nx && nextAt) nx.textContent = `Câu tiếp theo sau ${Math.max(0, Math.ceil((nextAt - Date.now()) / 1000))} giây…`;
}, 500);

function render() { renderTop(); renderBoard(); renderOverlays(); }

// ---------------- thông báo ----------------
function toast(html, cls = '', ms = 3800) {
  const box = $('toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.innerHTML = html;
  box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
}
const flashNums = (nums) => { const t = performance.now() + 1600; for (const n of nums || []) flash.set(n, t); lastSig = ''; };
const numList = (nums) => nums.map((n) => `số ${n}`).join(', ');

// ---------------- giọng đọc ----------------
let viVoice = null;
function pickVoice() { viVoice = (window.speechSynthesis?.getVoices?.() || []).find((v) => /^vi/i.test(v.lang)) || null; }
if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!opt.tts || !window.speechSynthesis || !viVoice) return;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = viVoice; u.lang = viVoice.lang; u.rate = 1.05;
  speechSynthesis.speak(u);
}
const speakName = (n) => String(n || 'bạn').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'bạn';
// giọng MC ElevenLabs (server gửi mp3) — phát lần lượt
let voiceOn = false, voiceMinGift = 1;
const voiceQueue = [];
let voicePlaying = null;
function playNextVoice() {
  if (voicePlaying || !voiceQueue.length) return;
  const a = new Audio(voiceQueue.shift().url);
  voicePlaying = a;
  const done = () => { if (voicePlaying === a) { voicePlaying = null; setTimeout(playNextVoice, 250); } };
  a.onended = done; a.onerror = done;
  a.play().catch(done);
}

// ---------------- cảm ơn quà ----------------
const GIFT_VI = { rose: 'bông hồng', 'finger heart': 'tim tay', tiktok: 'quà TikTok', 'heart me': 'trái tim', 'ice cream cone': 'cây kem', doughnut: 'bánh donut', perfume: 'nước hoa', galaxy: 'dải ngân hà', 'money gun': 'súng tiền', corgi: 'chú chó Corgi' };
const giftVi = (n) => GIFT_VI[String(n || '').toLowerCase()] || n || 'quà';
const thanksQ = [];
let thanksBusy = false;
function thank(e) {
  const same = thanksQ.find((q) => q.by?.id === e.by?.id && q.giftName === e.giftName);
  if (same) { same.repeat += e.repeat; same.diamonds += e.diamonds; return; }
  if (thanksQ.length >= 5) thanksQ.shift();
  thanksQ.push({ ...e });
  nextThanks();
}
function nextThanks() {
  if (thanksBusy || !thanksQ.length) return;
  const e = thanksQ.shift();
  thanksBusy = true;
  const el = $('thanks');
  el.querySelector('.av').outerHTML = avatar(e.by?.avatar, e.by?.name);
  el.querySelector('.t2').textContent = clip(e.by?.name || 'Bạn', 22);
  el.querySelector('.t3').textContent = `đã tặng ${e.repeat > 1 ? e.repeat + ' ' : ''}${giftVi(e.giftName)} 💖`;
  el.classList.add('show');
  play(e.diamonds >= 30 ? 'levelup' : 'chime', { pitch: 1.2 });
  if (!(voiceOn && e.diamonds >= voiceMinGift)) speak(`Cảm ơn ${speakName(e.by?.name)} đã tặng ${e.repeat > 1 ? e.repeat + ' ' : ''}${giftVi(e.giftName)}`);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => { thanksBusy = false; nextThanks(); }, 600); }, 3600);
}

// ---------------- pháo giấy ----------------
const cf = $('confetti').getContext('2d');
let parts = [];
function confetti(n = 220) {
  const colors = ['#fbbf24', '#f472b6', '#4ade80', '#60a5fa', '#a78bfa', '#fff'];
  for (let i = 0; i < n; i++) parts.push({ x: W / 2 + (Math.random() - 0.5) * 300, y: 700, vx: (Math.random() - 0.5) * 26, vy: -12 - Math.random() * 22, r: 6 + Math.random() * 9, c: colors[i % colors.length], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4 });
  if (parts.length === n) requestAnimationFrame(stepConfetti);
}
function stepConfetti() {
  cf.clearRect(0, 0, W, H);
  for (const p of parts) {
    p.vy += 0.6; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
    cf.save(); cf.translate(p.x, p.y); cf.rotate(p.a); cf.fillStyle = p.c; cf.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); cf.restore();
  }
  parts = parts.filter((p) => p.y < H + 40);
  if (parts.length) requestAnimationFrame(stepConfetti); else cf.clearRect(0, 0, W, H);
}

// ---------------- sự kiện từ server ----------------
function onEffect(e) {
  const name = (b) => `<b>${esc(clip(b?.name || 'Cả phòng', 18))}</b>`;
  switch (e.type) {
    case 'gm_round':
      $('win').classList.remove('on');
      prevOpen = new Set();
      lastSig = '';
      play('bell');
      toast(`🔐 Câu bí ẩn mới · ${esc(e.kind)} · ${e.clues} gợi ý`, 'blue');
      break;
    case 'gm_clue': {
      flashNums(e.nums);
      rowPop.set(e.idx, performance.now() + 1200);
      const ans = esc(String(e.answer).toUpperCase());
      if (e.via === 'gift') toast(`${avatar(e.by?.avatar, e.by?.name)}<span>🎁 ${name(e.by)} mở gợi ý “${ans}”</span>`, 'gold');
      else toast(`${avatar(e.by?.avatar, e.by?.name)}<span>🔑 ${name(e.by)} giải được “${ans}”${e.nums.length ? ` · lộ ${e.nums.length} chữ` : ''}</span>`);
      play('chime', { pitch: 1 + Math.random() * 0.3 });
      break;
    }
    case 'gm_clue_auto':
      rowPop.set(e.idx, performance.now() + 1200);
      lastSig = '';
      break;
    case 'gm_letter': {
      flashNums(e.nums);
      const what = `lộ ${numList(e.nums)}`;
      if (e.reason === 'like') toast(`❤️ Cả phòng thả đủ tim · ${what}`, 'pink');
      else if (e.reason === 'gift') toast(`${avatar(e.by?.avatar, e.by?.name)}<span>${esc(e.icon || '🎁')} ${name(e.by)} ${what}</span>`, 'gold');
      else toast(`${esc(e.icon || '💡')} Gợi ý thêm · ${what}`, 'blue');
      play('whoosh');
      break;
    }
    case 'gm_guess': {
      const feed = $('feed');
      const el = document.createElement('div');
      el.className = 'g';
      el.innerHTML = `<i>${esc(clip(e.by?.name, 12))}:</i> ${esc(e.text)}`;
      feed.prepend(el);
      while (feed.children.length > 6) feed.lastChild.remove();
      play('mo');
      break;
    }
    case 'gm_win': {
      const a = e.award;
      endCard(`<h1>🎉 GIẢI MÃ THÀNH CÔNG!</h1>${avatar(e.by?.avatar, e.by?.name, 'av bigav')}
        <div class="name">${esc(e.by?.name)}</div><div class="sub">sau ${e.seconds} giây · khi mới lộ ${e.shown}/${e.total} chữ</div>`, e,
        a ? `<div class="pts">+${a.total} điểm tuần${a.rank ? ` · hạng ${a.rank}` : ''}</div>` : '');
      confetti();
      play('levelup');
      speak(`Chúc mừng ${speakName(e.by?.name)} đã giải mã thành công! ${e.phrase}`);
      break;
    }
    case 'gm_end':
      if (e.reason === 'timeout') {
        endCard('<h1>⏰ HẾT GIỜ!</h1><div class="sub" style="margin-top:14px">Câu bí ẩn là</div>', e);
        play('gong');
      }
      break;
    case 'gm_thanks': thank(e); break;
    case 'gm_progress': toast(`${esc(e.icon)} ${name(e.by)} · ${e.count}/${e.every} — đủ ${e.every} lộ 1 chữ`, 'pink', 2600); break;
    case 'gm_time': toast(`${esc(e.icon || '⏱️')} ${name(e.by)} tặng thêm ${e.seconds} giây!`, 'gold'); play('levelup'); break;
  }
}

function onSnapshot(g) {
  S = g;
  if (g?.phase === 'break') nextAt = Date.now() + (g.nextIn || 0) * 1000;
  render();
}

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onclose = () => setTimeout(connect, 2000);
  ws.onerror = () => ws.close();
  ws.onmessage = (m) => {
    let d; try { d = JSON.parse(m.data); } catch { return; }
    if (d.type === 'hello') {
      voiceOn = !!d.voice?.enabled; voiceMinGift = d.voice?.minGiftDiamonds ?? 1;
      sound.init();
      setTimeout(() => { if (!opt.mute && sound.suspended) $('soundBtn').style.display = 'block'; }, 800);
      onSnapshot(d.giaima);
    } else if (d.type === 'giaima') onSnapshot(d.giaima);
    else if (d.type === 'giaimafx') for (const e of d.effects || []) onEffect(e);
    else if (d.type === 'voice_state') { voiceOn = !!d.voice?.enabled; voiceMinGift = d.voice?.minGiftDiamonds ?? 1; }
    else if (d.type === 'voice' && d.game === 'giaima' && opt.tts) { if (voiceQueue.length >= 4) voiceQueue.shift(); voiceQueue.push(d.voice); playNextVoice(); }
  };
}
$('soundBtn').onclick = () => { sound.resume(); $('soundBtn').style.display = 'none'; };
document.addEventListener('click', () => sound.resume(), { once: true });
connect();

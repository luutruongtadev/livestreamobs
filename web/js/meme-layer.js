// Lớp meme của overlay — dùng chung mọi game (luật trong Studio → "memes").
// Khi <quà / tim / follow / share / từ khoá / sự kiện của game> → hiện GIF (tự tìm GIPHY / link) + câu chữ + phát âm
// (thư viện / link / tự tìm Freesound). Overlay chính quyết định meme nào (kèm số ngẫu nhiên r) rồi gửi cho mọi overlay
// khác qua gateway → ai cũng thấy cùng một clip. Lỗi tải ảnh / âm không làm hỏng overlay.
import { createTriggers } from '#sdk';
import { createSoundPlayer } from './sounds.js';

const W = 1080, H = 1920;
const CSS = `
.meme-layer { position:absolute; left:0; top:0; width:${W}px; height:${H}px; transform-origin:0 0; pointer-events:none; z-index:6; }
.meme-layer .mm { position:absolute; inset:0; opacity:0; transition:opacity .2s; }
.meme-layer .mm.on { opacity:1; }
.meme-layer .dim { position:absolute; inset:0; background:rgba(0,0,0,.45); }
.meme-layer .box { position:absolute; left:90px; top:470px; width:900px; height:640px; display:flex; align-items:center; justify-content:center; transform:scale(.85); transition:transform .25s cubic-bezier(.2,1.6,.4,1); }
.meme-layer .mm.on .box { transform:scale(1); }
.meme-layer .box img { max-width:100%; max-height:100%; border-radius:20px; box-shadow:0 18px 60px rgba(0,0,0,.5); background:rgba(0,0,0,.4); }
.meme-layer .cap { position:absolute; left:40px; right:40px; top:1150px; text-align:center; font:800 76px/1.1 'Baloo 2','Be Vietnam Pro',system-ui,sans-serif; color:#fff;
  -webkit-text-stroke:14px #111; paint-order:stroke fill; letter-spacing:.5px; }
.meme-layer .cap.solo { top:820px; font-size:96px; }
.meme-layer .by { position:absolute; left:0; right:0; top:1255px; text-align:center; font:700 28px 'Be Vietnam Pro',system-ui,sans-serif; color:rgba(255,255,255,.85); text-shadow:0 2px 6px #000; }
.meme-layer .attr { position:absolute; right:96px; top:1118px; font:800 20px 'Be Vietnam Pro',system-ui,sans-serif; color:rgba(255,255,255,.8); text-shadow:0 1px 4px #000; }
`;

/**
 * createMemeLayer({ search(kind, q) → Promise<items>, canSound() → bool, muted })
 * → { el, setRules, setGame, onEvent(ev) → shots, onGame(key, by) → shots, play(shot), covers(game, key), fit, resumeAudio, destroy }
 */
export function createMemeLayer({ search = async () => [], canSound = () => false, muted = false } = {}) {
  if (typeof document !== 'undefined' && !document.getElementById('meme-layer-css')) {
    const st = document.createElement('style'); st.id = 'meme-layer-css'; st.textContent = CSS; document.head.append(st);
    if (!document.getElementById('dd-font')) { const l = document.createElement('link'); l.id = 'dd-font'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap'; document.head.append(l); }
  }
  const el = document.createElement('div');
  el.className = 'meme-layer';
  const player = createSoundPlayer({ muted });
  let rules = [], game = null, triggers = createTriggers([]);
  const queue = []; let busy = false;
  const recent = []; // chặn spam: tối đa 6 meme / 10 giây

  const pick = (list, r) => (list?.length ? list[Math.floor((Number(r) || 0) * list.length) % list.length] : null);
  const shotOf = (rule, by) => ({ id: rule.id, r: Math.random(), by: by?.name ? { name: String(by.name).slice(0, 40) } : null });

  function allowed() {
    const now = Date.now();
    while (recent.length && now - recent[0] > 10_000) recent.shift();
    if (recent.length >= 6) return false;
    recent.push(now);
    return true;
  }

  async function show(shot) {
    const rule = shot.rule || rules.find((x) => x.id === shot.id);
    if (!rule) return;
    const r = Number(shot.r) || 0;
    const lines = String(rule.text || '').split('|').map((x) => x.trim()).filter(Boolean);
    const text = pick(lines, r) || '';
    // tải song song: GIF + âm (tối đa 1,6 giây; quá thì hiện chữ trước)
    const gifP = rule.gif?.mode === 'url' ? Promise.resolve({ url: rule.gif.url, giphy: false })
      : rule.gif?.mode === 'search' && rule.gif.q ? search('gif', rule.gif.q).then((items) => { const it = pick(items, r); return it ? { url: it.gif || it.mp4, giphy: true } : null; }).catch(() => null)
        : Promise.resolve(null);
    const soundP = rule.sound?.mode === 'search' && rule.sound.q ? search('sound', rule.sound.q).then((items) => pick(items, (r * 7.13) % 1)?.mp3 || null).catch(() => null) : Promise.resolve(null);
    const timeout = new Promise((res) => setTimeout(() => res(null), 1600));
    const g = await Promise.race([gifP, timeout]);
    let img = null;
    if (g?.url) {
      img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = g.url;
      await Promise.race([new Promise((res) => { img.onload = res; img.onerror = () => { img = null; res(); }; }), new Promise((res) => setTimeout(res, 1500))]);
      if (img?.naturalWidth) { const k = Math.min(900 / img.naturalWidth, 640 / img.naturalHeight); img.style.width = `${Math.round(img.naturalWidth * k)}px`; img.style.height = `${Math.round(img.naturalHeight * k)}px`; } // phóng vừa khung 900×640
    }
    const box = document.createElement('div');
    box.className = 'mm';
    box.append(Object.assign(document.createElement('div'), { className: 'dim' }));
    if (img) { const b = document.createElement('div'); b.className = 'box'; b.append(img); box.append(b); if (g.giphy) box.append(Object.assign(document.createElement('div'), { className: 'attr', textContent: 'Powered by GIPHY' })); }
    if (text) box.append(Object.assign(document.createElement('div'), { className: `cap${img ? '' : ' solo'}`, textContent: text }));
    if (shot.by?.name) box.append(Object.assign(document.createElement('div'), { className: 'by', textContent: `meme của ${shot.by.name}` }));
    if (!img && !text) return; // không có gì để hiện (vẫn phát âm bên dưới nếu có)
    el.append(box);
    requestAnimationFrame(() => box.classList.add('on'));
    await new Promise((res) => setTimeout(res, (Number(rule.seconds) || 4) * 1000));
    box.classList.remove('on');
    setTimeout(() => box.remove(), 300);
    void soundP;
  }

  function playSound(rule, shot) {
    if (!canSound() || !rule.sound || rule.sound.mode === 'none') return;
    const vol = rule.sound.volume ?? 0.8;
    if (rule.sound.mode === 'lib') player.play(rule.sound.id, { volume: vol });
    else if (rule.sound.mode === 'url') player.play('url', { volume: vol, url: rule.sound.url });
    else if (rule.sound.mode === 'search' && rule.sound.q) search('sound', rule.sound.q).then((items) => { const it = pick(items, ((Number(shot.r) || 0) * 7.13) % 1); if (it?.mp3) player.play('url', { volume: vol, url: it.mp3 }); }).catch(() => {});
  }

  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const shot = queue.shift();
      const rule = shot.rule || rules.find((x) => x.id === shot.id);
      if (rule) playSound(rule, shot);
      try { await show(shot); } catch (e) { console.warn('[meme]', e); }
    }
    busy = false;
  }

  return {
    el,
    setRules(list) {
      rules = (Array.isArray(list) ? list : []).filter((x) => x && x.on !== false);
      triggers = createTriggers(rules.filter((x) => x.when && x.when.type !== 'game' && x.when.type !== 'goal').map((x) => ({ id: x.id, action: 'meme', trigger: x.when, rule: x })));
    },
    setGame(id) { game = id || null; },
    /** Sự kiện TikTok (chỉ overlay chính gọi) → các meme cần phát. */
    onEvent(ev) {
      if (!ev?.type || !rules.length) return [];
      return triggers.feed(ev).fires.filter(() => allowed()).map((f) => shotOf(f.binding.rule, ev.user));
    },
    /** Sự kiện của game: "action:<id>" hoặc id trong manifest.events (chỉ overlay chính gọi). */
    onGame(key, by) {
      return rules.filter((x) => x.when?.type === 'game' && x.when.game === game && x.when.event === key).filter(() => allowed()).map((x) => shotOf(x, by));
    },
    /** Có luật meme nào cho sự kiện này của game không (game có meme riêng thì nhường). */
    covers(g, key) { return rules.some((x) => x.when?.type === 'game' && x.when.game === g && x.when.event === key); },
    play(shot) { if (!shot) return; queue.push(shot); while (queue.length > 3) queue.shift(); pump(); },
    fit(scale) { el.style.transform = `scale(${scale})`; },
    resumeAudio() { player.resume(); },
    destroy() { queue.length = 0; player.close(); el.remove(); },
  };
}

// Thư viện âm thanh của Studio: tổng hợp bằng WebAudio (không cần file, không vướng bản quyền).
// Dùng ở overlay (phát theo luật âm thanh) và dashboard (nghe thử). Gateway import SOUNDS để kiểm tra luật.
// Không đụng DOM / AudioContext khi import.

export const SOUNDS = [
  { id: 'coin', name: '🪙 Xu rơi' },
  { id: 'chime', name: '🔔 Chuông nhỏ' },
  { id: 'bell', name: '🛎️ Chuông lớn' },
  { id: 'pop', name: '🫧 Bụp' },
  { id: 'whoosh', name: '💨 Vút' },
  { id: 'levelup', name: '⬆️ Lên cấp' },
  { id: 'fanfare', name: '🎺 Kèn chiến thắng' },
  { id: 'tada', name: '🎉 Ta-da' },
  { id: 'applause', name: '👏 Vỗ tay' },
  { id: 'drumroll', name: '🥁 Trống dồn' },
  { id: 'airhorn', name: '📯 Còi hơi' },
  { id: 'laser', name: '🔫 Tia laser' },
  { id: 'boing', name: '🪀 Boing' },
  { id: 'heartbeat', name: '💓 Nhịp tim' },
  { id: 'magic', name: '✨ Phép thuật' },
  { id: 'doorbell', name: '🚪 Chuông cửa' },
  { id: 'buzzer', name: '❌ Còi sai' },
  { id: 'sparkle', name: '🌟 Lấp lánh' },
];

/** Bộ phát âm thanh: tạo AudioContext lười (lần phát đầu / resume()). */
export function createSoundPlayer({ muted = false } = {}) {
  let ac = null, master = null, noiseBuf = null;
  const get = () => {
    if (muted || typeof AudioContext === 'undefined') return null;
    if (!ac) {
      try { ac = new AudioContext(); master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination); } catch { muted = true; return null; }
    }
    return ac;
  };
  const noise = (a) => {
    if (noiseBuf) return noiseBuf;
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  };
  function tone(out, f, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, attack = 0.008 } = {}) {
    const a = ac, t0 = a.currentTime + at;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function hiss(out, dur, { at = 0, vol = 0.3, freq = 3000, q = 0.8, sweep = 0 } = {}) {
    const a = ac, t0 = a.currentTime + at;
    const src = a.createBufferSource(); src.buffer = noise(a);
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t0 + dur);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(out); src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }
  const P = {
    coin: (o) => { tone(o, 988, 0.08, { type: 'square', vol: 0.12 }); tone(o, 1319, 0.35, { type: 'square', vol: 0.12, at: 0.07 }); },
    chime: (o) => { tone(o, 1047, 0.6, { vol: 0.25 }); tone(o, 1568, 0.5, { vol: 0.12, at: 0.02 }); },
    bell: (o) => { [523, 1046, 1569, 2093].forEach((f, i) => tone(o, f, 1.4 - i * 0.2, { vol: 0.25 / (i + 1) })); },
    pop: (o) => tone(o, 420, 0.12, { vol: 0.35, slide: 2.4 }),
    whoosh: (o) => hiss(o, 0.5, { freq: 600, sweep: 6, vol: 0.35 }),
    levelup: (o) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(o, f, 0.16, { type: 'triangle', vol: 0.22, at: i * 0.07 })),
    fanfare: (o) => { [[523, 0], [523, 0.12], [523, 0.24], [659, 0.36], [784, 0.6]].forEach(([f, at], i) => tone(o, f, i === 4 ? 0.7 : 0.11, { type: 'sawtooth', vol: 0.12, at })); tone(o, 392, 0.7, { type: 'sawtooth', vol: 0.08, at: 0.6 }); },
    tada: (o) => { tone(o, 523, 0.12, { type: 'triangle', vol: 0.2 }); [523, 659, 784, 1047].forEach((f) => tone(o, f, 0.9, { type: 'triangle', vol: 0.12, at: 0.14 })); },
    applause: (o) => { for (let i = 0; i < 40; i++) hiss(o, 0.06, { at: Math.random() * 1.6, freq: 1500 + Math.random() * 2500, q: 1.5, vol: 0.25 * Math.random() + 0.08 }); },
    drumroll: (o) => { for (let i = 0; i < 22; i++) hiss(o, 0.07, { at: i * 0.05, freq: 900, q: 0.7, vol: 0.12 + i * 0.012 }); hiss(o, 0.4, { at: 1.12, freq: 4000, vol: 0.35 }); tone(o, 80, 0.4, { at: 1.12, vol: 0.4, slide: 0.5 }); },
    airhorn: (o) => { [233, 277, 349].forEach((f) => { tone(o, f, 0.35, { type: 'sawtooth', vol: 0.1 }); tone(o, f, 0.7, { type: 'sawtooth', vol: 0.1, at: 0.42 }); }); },
    laser: (o) => tone(o, 1800, 0.3, { type: 'sawtooth', vol: 0.12, slide: 0.08 }),
    boing: (o) => { const a = ac, t0 = a.currentTime; const os = a.createOscillator(), g = a.createGain(); os.type = 'sine'; os.frequency.setValueAtTime(180, t0); for (let i = 0; i < 6; i++) os.frequency.linearRampToValueAtTime(i % 2 ? 160 : 420 - i * 30, t0 + 0.06 * (i + 1)); g.gain.setValueAtTime(0.35, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5); os.connect(g).connect(o); os.start(t0); os.stop(t0 + 0.55); },
    heartbeat: (o) => { [0, 0.18, 0.8, 0.98].forEach((at, i) => tone(o, 60, 0.18, { vol: i % 2 ? 0.35 : 0.5, at, slide: 0.6 })); },
    magic: (o) => { for (let i = 0; i < 10; i++) tone(o, 1200 + i * 180 + Math.random() * 80, 0.25, { vol: 0.08, at: i * 0.045 }); hiss(o, 0.6, { freq: 6000, vol: 0.06 }); },
    doorbell: (o) => { tone(o, 659, 0.7, { vol: 0.25 }); tone(o, 523, 0.9, { vol: 0.25, at: 0.45 }); },
    buzzer: (o) => tone(o, 150, 0.5, { type: 'square', vol: 0.12, slide: 0.8 }),
    sparkle: (o) => { [2093, 2637, 3136, 2637, 3520].forEach((f, i) => tone(o, f, 0.18, { vol: 0.08, at: i * 0.06 })); },
  };
  const audios = new Map(); // url → HTMLAudioElement đã nạp
  return {
    /** Phát âm thanh trong thư viện, hoặc file ngoài (sound = 'url' + url https). */
    play(sound, { volume = 0.8, url = null } = {}) {
      if (muted) return;
      try {
        if (sound === 'url' && url) {
          if (typeof Audio === 'undefined') return;
          let base = audios.get(url);
          if (!base) { base = new Audio(url); base.preload = 'auto'; audios.set(url, base); if (audios.size > 30) audios.delete(audios.keys().next().value); }
          const a = base.cloneNode(); a.volume = Math.max(0, Math.min(1, volume)); a.play().catch(() => {});
          return;
        }
        const a = get();
        if (!a || !P[sound]) return;
        if (a.state !== 'running') a.resume().catch(() => {});
        const g = a.createGain(); g.gain.value = Math.max(0, Math.min(1, volume)); g.connect(master);
        P[sound](g);
      } catch { /* âm thanh lỗi không được làm hỏng overlay */ }
    },
    resume() { try { get()?.resume?.(); } catch { /* bỏ qua */ } },
    setMuted(v) { muted = !!v; },
    close() { try { ac?.close?.(); } catch { /* bỏ qua */ } ac = null; },
  };
}

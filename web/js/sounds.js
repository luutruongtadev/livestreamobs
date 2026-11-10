// Thư viện âm thanh của Studio: tổng hợp bằng WebAudio (không cần file, không vướng bản quyền).
// Dùng ở overlay (phát theo luật âm thanh) và dashboard (nghe thử). Gateway import SOUNDS để kiểm tra luật.
// Không đụng DOM / AudioContext khi import.

export const SOUND_GROUPS = ['Chiến thắng', 'Thông báo', 'Vui nhộn', 'Hồi hộp', 'Thất bại', 'Hiệu ứng'];
export const SOUNDS = [
  // Chiến thắng
  { id: 'fanfare', name: '🎺 Kèn chiến thắng', group: 'Chiến thắng' },
  { id: 'tada', name: '🎉 Ta-da', group: 'Chiến thắng' },
  { id: 'levelup', name: '⬆️ Lên cấp', group: 'Chiến thắng' },
  { id: 'powerup', name: '🍄 Tăng sức mạnh', group: 'Chiến thắng' },
  { id: 'oneup', name: '💚 Thêm mạng', group: 'Chiến thắng' },
  { id: 'applause', name: '👏 Vỗ tay', group: 'Chiến thắng' },
  { id: 'cheer', name: '🙌 Cả phòng hò reo', group: 'Chiến thắng' },
  { id: 'cash', name: '💰 Cha-ching', group: 'Chiến thắng' },
  { id: 'xylophone', name: '🎼 Mộc cầm đi lên', group: 'Chiến thắng' },
  // Thông báo
  { id: 'coin', name: '🪙 Xu rơi', group: 'Thông báo' },
  { id: 'chime', name: '🔔 Chuông nhỏ', group: 'Thông báo' },
  { id: 'bell', name: '🛎️ Chuông lớn', group: 'Thông báo' },
  { id: 'doorbell', name: '🚪 Chuông cửa', group: 'Thông báo' },
  { id: 'notify', name: '📱 Tin nhắn mới', group: 'Thông báo' },
  { id: 'sparkle', name: '🌟 Lấp lánh', group: 'Thông báo' },
  { id: 'magic', name: '✨ Phép thuật', group: 'Thông báo' },
  { id: 'gong', name: '🥇 Cồng', group: 'Thông báo' },
  { id: 'camera', name: '📸 Chụp ảnh', group: 'Thông báo' },
  // Vui nhộn
  { id: 'boing', name: '🪀 Boing', group: 'Vui nhộn' },
  { id: 'pop', name: '🫧 Bụp', group: 'Vui nhộn' },
  { id: 'bubbles', name: '🫧 Bong bóng', group: 'Vui nhộn' },
  { id: 'quack', name: '🦆 Vịt kêu', group: 'Vui nhộn' },
  { id: 'squeak', name: '🐭 Chít chít', group: 'Vui nhộn' },
  { id: 'slideup', name: '📈 Huýt sáo đi lên', group: 'Vui nhộn' },
  { id: 'slidedown', name: '📉 Huýt sáo trượt xuống', group: 'Vui nhộn' },
  { id: 'rimshot', name: '🥁 Ba-dum-tss', group: 'Vui nhộn' },
  { id: 'jump', name: '🕹️ Nhảy (game cổ)', group: 'Vui nhộn' },
  { id: 'airhorn', name: '📯 Còi hơi', group: 'Vui nhộn' },
  // Hồi hộp
  { id: 'drumroll', name: '🥁 Trống dồn', group: 'Hồi hộp' },
  { id: 'heartbeat', name: '💓 Nhịp tim', group: 'Hồi hộp' },
  { id: 'tick', name: '⏱️ Tích tắc', group: 'Hồi hộp' },
  { id: 'countdown', name: '3️⃣ Đếm ngược 3-2-1', group: 'Hồi hộp' },
  { id: 'suspense', name: '🎻 Rùng rợn', group: 'Hồi hộp' },
  { id: 'riser', name: '🚀 Dâng trào', group: 'Hồi hộp' },
  { id: 'crickets', name: '🦗 Dế kêu (im lặng…)', group: 'Hồi hộp' },
  // Thất bại
  { id: 'buzzer', name: '❌ Còi sai', group: 'Thất bại' },
  { id: 'sadtrombone', name: '🎷 Kèn buồn wah-wah', group: 'Thất bại' },
  { id: 'gameover', name: '👾 Game over', group: 'Thất bại' },
  { id: 'powerdown', name: '🔋 Hết pin', group: 'Thất bại' },
  { id: 'whistle', name: '🟨 Còi trọng tài', group: 'Thất bại' },
  // Hiệu ứng
  { id: 'whoosh', name: '💨 Vút', group: 'Hiệu ứng' },
  { id: 'laser', name: '🔫 Tia laser', group: 'Hiệu ứng' },
  { id: 'bassdrop', name: '🔊 Bass drop', group: 'Hiệu ứng' },
  { id: 'thunder', name: '⛈️ Sấm', group: 'Hiệu ứng' },
  { id: 'siren', name: '🚨 Còi báo động', group: 'Hiệu ứng' },
  { id: 'typing', name: '⌨️ Gõ phím', group: 'Hiệu ứng' },
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
    powerup: (o) => { const a = ac, t0 = a.currentTime; const os = a.createOscillator(), g = a.createGain(); os.type = 'square'; os.frequency.setValueAtTime(200, t0); for (let i = 1; i <= 8; i++) os.frequency.setValueAtTime(200 * Math.pow(1.19, i) * (i % 2 ? 1.5 : 1), t0 + i * 0.05); g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5); os.connect(g).connect(o); os.start(t0); os.stop(t0 + 0.55); },
    oneup: (o) => [1319, 1568, 2637, 2093, 2349, 3136].forEach((f, i) => tone(o, f, 0.1, { type: 'square', vol: 0.08, at: i * 0.08 })),
    cheer: (o) => { hiss(o, 1.8, { freq: 1200, q: 0.4, vol: 0.25 }); for (let i = 0; i < 30; i++) hiss(o, 0.05, { at: 0.2 + Math.random() * 1.4, freq: 2000 + Math.random() * 2000, q: 1.5, vol: 0.12 }); tone(o, 2400, 0.25, { type: 'sine', vol: 0.12, at: 0.3, slide: 1.2 }); tone(o, 2600, 0.35, { type: 'sine', vol: 0.12, at: 0.65, slide: 0.9 }); },
    cash: (o) => { hiss(o, 0.08, { freq: 5000, vol: 0.3 }); tone(o, 2093, 0.5, { vol: 0.2, at: 0.08 }); tone(o, 2637, 0.6, { vol: 0.15, at: 0.12 }); hiss(o, 0.4, { at: 0.08, freq: 8000, q: 2, vol: 0.08 }); },
    xylophone: (o) => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(o, f, 0.35, { vol: 0.2, at: i * 0.07, attack: 0.002 })),
    notify: (o) => { tone(o, 880, 0.12, { vol: 0.2 }); tone(o, 1320, 0.25, { vol: 0.2, at: 0.12 }); },
    gong: (o) => { [110, 220, 331, 467].forEach((f, i) => tone(o, f, 2.6 - i * 0.4, { vol: 0.25 / (i + 1), attack: 0.01 })); hiss(o, 0.3, { freq: 900, vol: 0.1 }); },
    camera: (o) => { hiss(o, 0.04, { freq: 3000, vol: 0.4 }); hiss(o, 0.06, { at: 0.09, freq: 2000, vol: 0.35 }); },
    bubbles: (o) => { for (let i = 0; i < 7; i++) tone(o, 300 + Math.random() * 500, 0.08, { vol: 0.2, at: i * 0.07 + Math.random() * 0.03, slide: 2.5 }); },
    quack: (o) => { [0, 0.22].forEach((at) => { tone(o, 520, 0.16, { type: 'sawtooth', vol: 0.12, at, slide: 0.7 }); tone(o, 780, 0.16, { type: 'square', vol: 0.05, at, slide: 0.7 }); }); },
    squeak: (o) => { tone(o, 1800, 0.08, { vol: 0.15, slide: 1.6 }); tone(o, 2200, 0.08, { vol: 0.15, at: 0.11, slide: 1.4 }); },
    slideup: (o) => tone(o, 400, 0.6, { vol: 0.22, slide: 4 }),
    slidedown: (o) => tone(o, 1600, 0.8, { vol: 0.22, slide: 0.2 }),
    rimshot: (o) => { tone(o, 180, 0.12, { vol: 0.4, slide: 0.6 }); hiss(o, 0.08, { at: 0.18, freq: 1800, vol: 0.3 }); tone(o, 160, 0.12, { vol: 0.35, at: 0.3, slide: 0.6 }); hiss(o, 0.9, { at: 0.48, freq: 7000, q: 0.6, vol: 0.25 }); },
    jump: (o) => tone(o, 300, 0.22, { type: 'square', vol: 0.1, slide: 3 }),
    tick: (o) => { for (let i = 0; i < 6; i++) hiss(o, 0.03, { at: i * 0.5, freq: i % 2 ? 2500 : 3500, q: 4, vol: 0.4 }); },
    countdown: (o) => { [0, 0.8, 1.6].forEach((at) => tone(o, 660, 0.18, { type: 'square', vol: 0.12, at })); tone(o, 1320, 0.7, { type: 'square', vol: 0.12, at: 2.4 }); },
    suspense: (o) => { for (let i = 0; i < 24; i++) tone(o, 110 + (i % 2) * 6, 0.09, { type: 'sawtooth', vol: 0.06 + i * 0.002, at: i * 0.08 }); tone(o, 55, 2, { vol: 0.2 }); },
    riser: (o) => { tone(o, 200, 1.6, { type: 'sawtooth', vol: 0.08, slide: 6 }); hiss(o, 1.6, { freq: 500, sweep: 12, vol: 0.2 }); },
    crickets: (o) => { for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) tone(o, 4500, 0.025, { vol: 0.08, at: r * 0.7 + i * 0.05 }); },
    sadtrombone: (o) => { [[392, 0], [370, 0.45], [349, 0.9]].forEach(([f, at]) => tone(o, f, 0.4, { type: 'sawtooth', vol: 0.1, at })); tone(o, 330, 1.2, { type: 'sawtooth', vol: 0.1, at: 1.35, slide: 0.9 }); },
    gameover: (o) => [494, 466, 440, 415, 392, 370].forEach((f, i) => tone(o, f, 0.22, { type: 'square', vol: 0.09, at: i * 0.18 })),
    powerdown: (o) => tone(o, 900, 1, { type: 'square', vol: 0.08, slide: 0.1 }),
    whistle: (o) => { const a = ac, t0 = a.currentTime; const os = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), g = a.createGain(); os.frequency.value = 2800; lfo.frequency.value = 30; lg.gain.value = 120; lfo.connect(lg).connect(os.frequency); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02); g.gain.setValueAtTime(0.15, t0 + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6); os.connect(g).connect(o); os.start(t0); lfo.start(t0); os.stop(t0 + 0.65); lfo.stop(t0 + 0.65); },
    bassdrop: (o) => { tone(o, 140, 1.4, { vol: 0.5, slide: 0.25, attack: 0.005 }); hiss(o, 0.2, { freq: 200, vol: 0.3 }); },
    thunder: (o) => { hiss(o, 0.25, { freq: 900, q: 0.3, vol: 0.5 }); hiss(o, 2.2, { at: 0.15, freq: 160, q: 0.5, vol: 0.6, sweep: 0.5 }); },
    siren: (o) => { const a = ac, t0 = a.currentTime; const os = a.createOscillator(), g = a.createGain(); os.type = 'triangle'; for (let i = 0; i < 4; i++) { os.frequency.setValueAtTime(700, t0 + i * 0.5); os.frequency.linearRampToValueAtTime(1200, t0 + i * 0.5 + 0.25); os.frequency.linearRampToValueAtTime(700, t0 + i * 0.5 + 0.5); } g.gain.setValueAtTime(0.15, t0); g.gain.setValueAtTime(0.15, t0 + 1.9); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2); os.connect(g).connect(o); os.start(t0); os.stop(t0 + 2.05); },
    typing: (o) => { for (let i = 0; i < 14; i++) hiss(o, 0.02, { at: i * 0.09 + Math.random() * 0.05, freq: 3000 + Math.random() * 2000, q: 3, vol: 0.3 }); },
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

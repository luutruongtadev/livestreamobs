// Âm thanh tổng hợp bằng WebAudio (không cần file). Có thể thay bằng file
// riêng qua config.json -> "sounds": { "mo": "assets/mo.mp3", ... }
export class SoundBoard {
  constructor({ files = {}, muted = false, ambientVolume = 0.25 } = {}) {
    this.files = files;
    this.muted = muted;
    this.ambientVolume = ambientVolume;
    this.ctx = null;
    this.master = null;
    this.buffers = {};
    this.last = {};
  }

  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    // Reverb nhẹ cho cảm giác không gian chùa
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.#impulse(3.2, 2.5);
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.35;
    this.reverb.connect(this.wet).connect(this.master);
    this.master.connect(this.ctx.destination);
    for (const [k, url] of Object.entries(this.files)) if (url) this.#loadFile(k, url);
    if (this.files.ambient) this.#startAmbient(this.files.ambient);
    return this.ctx;
  }

  get suspended() {
    return !this.ctx || this.ctx.state === 'suspended';
  }

  resume() {
    this.init();
    return this.ctx?.resume();
  }

  #impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  async #loadFile(key, url) {
    try {
      const res = await fetch(url);
      this.buffers[key] = await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      console.warn('Không tải được âm thanh', key, url, e);
    }
  }

  #startAmbient(url) {
    const el = new Audio(url);
    el.loop = true;
    el.volume = this.ambientVolume;
    const play = () => el.play().catch(() => {});
    play();
    this.ambientEl = el;
    document.addEventListener('click', play, { once: true });
  }

  #playBuffer(key, gain = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[key];
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    src.start();
  }

  #throttle(key, ms) {
    const now = performance.now();
    if (now - (this.last[key] || 0) < ms) return true;
    this.last[key] = now;
    return false;
  }

  #partial(freq, start, dur, gain, type = 'sine', wet = true) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(this.master);
    if (wet) g.connect(this.reverb);
    o.start(start);
    o.stop(start + dur + 0.05);
    return o;
  }

  play(name, opts = {}) {
    if (this.muted || !this.init() || this.ctx.state !== 'running') return;
    if (this.buffers[name]) {
      if (name === 'mo' && this.#throttle('mo', 90)) return;
      return this.#playBuffer(name, opts.gain ?? 1);
    }
    const fn = this['_' + name];
    if (fn) fn.call(this, opts);
  }

  // Tiếng mõ gỗ: hai thành phần tần số, tắt rất nhanh
  _mo() {
    if (this.#throttle('mo', 90)) return;
    const t = this.ctx.currentTime;
    const base = 480 + Math.random() * 30;
    const o = this.#partial(base, t, 0.18, 0.55, 'triangle');
    o.frequency.exponentialRampToValueAtTime(base * 0.82, t + 0.15);
    this.#partial(base * 2.47, t, 0.06, 0.18, 'sine');
    this.#partial(base * 4.1, t, 0.025, 0.08, 'sine', false);
  }

  // Đại hồng chung: các partial không điều hoà, ngân dài
  _bell({ big = false } = {}) {
    if (this.#throttle('bell', 600)) return;
    const t = this.ctx.currentTime;
    const f = big ? 82 : 110;
    const parts = [
      [0.5, 7, 0.25], [1, 6, 0.4], [1.19, 5, 0.16], [1.56, 4, 0.12],
      [2.0, 3.5, 0.14], [2.74, 2.5, 0.08], [3.76, 1.6, 0.05], [5.4, 0.9, 0.03],
    ];
    for (const [m, d, g] of parts) {
      this.#partial(f * m, t, d * (big ? 1.4 : 1), g, 'sine');
      this.#partial(f * m * 1.003, t, d * (big ? 1.4 : 1), g * 0.5, 'sine');
    }
  }

  // Chuông nhỏ / khánh
  _chime({ pitch = 1 } = {}) {
    if (this.#throttle('chime', 120)) return;
    const t = this.ctx.currentTime;
    const f = 880 * pitch;
    this.#partial(f, t, 2.4, 0.16);
    this.#partial(f * 2.76, t, 1.2, 0.06);
    this.#partial(f * 5.4, t, 0.5, 0.03);
  }

  // Lên cấp: chuông lớn + chuỗi chuông ngũ cung
  _levelup() {
    this._bell({ big: true });
    const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];
    scale.forEach((p, i) => setTimeout(() => {
      this.last.chime = 0;
      this._chime({ pitch: p * 0.75 });
    }, 400 + i * 180));
  }
}

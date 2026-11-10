/** EventEmitter tối giản chạy được trên trình duyệt (thay cho node:events trong engine của game). */
export class Emitter {
  constructor() { this._ev = new Map(); }

  on(name, fn) {
    if (!this._ev.has(name)) this._ev.set(name, new Set());
    this._ev.get(name).add(fn);
    return this;
  }

  off(name, fn) { this._ev.get(name)?.delete(fn); return this; }
  removeListener(name, fn) { return this.off(name, fn); }

  once(name, fn) {
    const w = (...a) => { this.off(name, w); fn(...a); };
    return this.on(name, w);
  }

  emit(name, ...args) {
    const set = this._ev.get(name);
    if (!set?.size) return false;
    for (const fn of [...set]) fn(...args);
    return true;
  }

  listenerCount(name) { return this._ev.get(name)?.size || 0; }
  removeAllListeners(name) { if (name) this._ev.delete(name); else this._ev.clear(); return this; }
}

// Engine Đoán từ đã chuyển vào games/doantu/engine (chuẩn module của nền tảng).
// File này giữ giao diện cũ cho server đơn: statePath (file JSON) → adapter persist.
import fs from 'node:fs';
import path from 'node:path';
import { WordGame as Engine } from '../games/doantu/engine/wordgame.js';

export * from '../games/doantu/engine/wordgame.js';

/** Lưu dữ liệu bền của game vào một file JSON. */
export function filePersist(file) {
  return {
    read() { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } },
    write(obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj)); },
  };
}

export class WordGame extends Engine {
  constructor(config = {}, { statePath = null, persist = null, ...opts } = {}) {
    super(config, { ...opts, persist: persist || (statePath ? filePersist(statePath) : null) });
  }
}

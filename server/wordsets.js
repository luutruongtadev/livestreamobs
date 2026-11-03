import fs from 'node:fs';
import path from 'node:path';
import { normalize } from './text.js';

/**
 * Kho bộ từ:
 *   - repoDir (wordsets/): bộ có sẵn trong repo (vd lmht.json), chỉ đọc
 *   - dataDir (data/wordsets/): bộ tạo bằng Claude hoặc bản đã sửa gợi ý — ghi đè bộ cùng tên trong repo,
 *     nằm trong volume dữ liệu nên không mất khi deploy.
 * `sets` là một object dùng chung với WordGame (sửa tại chỗ, không thay object).
 */
export class WordSetStore {
  constructor({ repoDir, dataDir, log = console } = {}) {
    this.repoDir = repoDir;
    this.dataDir = dataDir;
    this.log = log;
    this.sets = {};
    this.origin = {}; // id -> 'repo' | 'data' | 'repo+data'
    this.load();
  }

  readDir(dir) {
    const out = {};
    if (!dir || !fs.existsSync(dir)) return out;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try { out[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch (e) { this.log.warn?.(`[wordsets] Bỏ qua ${f}: ${e.message}`); }
    }
    return out;
  }

  load() {
    const repo = this.readDir(this.repoDir);
    const data = this.readDir(this.dataDir);
    for (const k of Object.keys(this.sets)) delete this.sets[k];
    for (const [id, s] of Object.entries(repo)) { this.sets[id] = s; this.origin[id] = 'repo'; }
    for (const [id, s] of Object.entries(data)) { this.sets[id] = s; this.origin[id] = repo[id] ? 'repo+data' : 'data'; }
  }

  save(id, set) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const file = path.join(this.dataDir, `${id}.json`);
    fs.writeFileSync(file + '.tmp', JSON.stringify(set, null, 1));
    fs.renameSync(file + '.tmp', file);
    this.sets[id] = set;
    this.origin[id] = this.origin[id] === 'repo' || this.origin[id] === 'repo+data' ? 'repo+data' : 'data';
  }

  /** Xoá bản trong data/: bộ tạo mới thì mất hẳn, bộ có sẵn thì trở về bản gốc trong repo. */
  remove(id) {
    const file = path.join(this.dataDir, `${id}.json`);
    if (!fs.existsSync(file)) throw new Error('Bộ từ này không có bản đã tạo / đã sửa để xoá');
    fs.rmSync(file);
    this.load();
    return this.sets[id] ? 'restored' : 'deleted';
  }

  /** Tạo id không trùng từ chủ đề, vd "Cầu thủ bóng đá" → "cau-thu-bong-da". */
  newId(topic) {
    const base = normalize(topic).replace(/ /g, '-').slice(0, 40) || 'bo-tu';
    let id = base, i = 2;
    while (this.sets[id] || id === 'tu-vung') id = `${base}-${i++}`;
    return id;
  }

  list() {
    return Object.entries(this.sets).map(([id, s]) => ({ id, title: s.title || id, count: s.words?.length || 0, origin: this.origin[id] }));
  }
}

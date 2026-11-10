// Nạp game từ thư mục (CHỈ dùng phía Node: gateway, test, script). Trình duyệt dùng loader của apps/web.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { validateManifest } from '../manifest.js';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const toDir = (d) => (d instanceof URL ? fileURLToPath(d) : String(d));

/** Đọc manifest + schema + dữ liệu khai báo trong manifest.data (đường dẫn tính trong thư mục game). */
export function readGame(gameDir) {
  const dir = toDir(gameDir);
  const manifest = readJson(path.join(dir, 'manifest.json'));
  const schemaFile = path.join(dir, 'settings.schema.json');
  const schema = fs.existsSync(schemaFile) ? readJson(schemaFile) : { type: 'object', properties: {} };
  const data = {};
  for (const [k, rel] of Object.entries(manifest.data || {})) {
    const file = path.resolve(dir, rel);
    if (!file.startsWith(path.resolve(dir) + path.sep)) throw new Error(`data.${k} nằm ngoài thư mục game`);
    data[k] = readJson(file);
  }
  return { dir, manifest, schema, data };
}

/** readGame + import engine (createGame). */
export async function loadGame(gameDir) {
  const g = readGame(gameDir);
  const engine = await import(pathToFileURL(path.join(g.dir, 'engine', 'index.js')).href);
  return { ...g, createGame: engine.createGame, engine };
}

/** Phần server của game (chạy trong gateway), null nếu game không có. */
export async function loadGameServer(gameDir) {
  const file = path.join(toDir(gameDir), 'server', 'index.js');
  if (!fs.existsSync(file)) return null;
  return import(pathToFileURL(file).href);
}

/** Tất cả game trong thư mục games/: [{ id, dir, manifest, errors }]. */
export function listGames(gamesDir) {
  if (!fs.existsSync(gamesDir)) return [];
  return fs.readdirSync(gamesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(gamesDir, d.name, 'manifest.json')))
    .map((d) => {
      const dir = path.join(gamesDir, d.name);
      const manifest = readJson(path.join(dir, 'manifest.json'));
      const errors = validateManifest(manifest);
      if (manifest.id !== d.name) errors.push(`id "${manifest.id}" phải trùng tên thư mục "${d.name}"`);
      return { id: manifest.id, dir, manifest, errors };
    });
}

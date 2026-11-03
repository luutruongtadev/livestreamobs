// Sinh một lô từ bí mật bằng Claude vào data/wordbank.json.
//   npm run gen-words                 # 100 từ, trộn chủ đề
//   npm run gen-words -- "Tết" 50     # 50 từ chủ đề Tết
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WordBank, claudeClientFromEnv } from '../server/wordbank.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile?.(envFile);
const client = claudeClientFromEnv();
if (!client) { console.error('Thiếu ANTHROPIC_API_KEY (đặt trong .env hoặc biến môi trường).'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).wordgame || {};
const bank = new WordBank({
  filePath: path.join(ROOT, 'data', 'wordbank.json'),
  fallbackWords: cfg.words || [],
  client,
  model: process.env.WORDGAME_GEN_MODEL || cfg.generatorModel || 'claude-opus-5-5',
});
const [theme = '', count = '100'] = process.argv.slice(2);
console.log(`Đang tạo ${count} từ${theme ? ` chủ đề "${theme}"` : ''} bằng ${bank.model}…`);
const { added, batch } = await bank.generate({ theme, count: Number(count) });
console.log(`Đã thêm ${added} từ. Ví dụ: ${batch.words.slice(0, 10).map((w) => `${w.word} (${w.hint})`).join(', ')}`);
console.log(bank.stats());

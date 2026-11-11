// Phần server của game Đoán từ — chạy trong gateway, giữ API key, cache DÙNG CHUNG mọi kênh.
// Overlay gọi qua ctx.server.request(op, payload); gateway định tuyến { t:'g', game:'doantu', op } tới đây.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { LayeredScorer } from './scoring.js';
import { Embedder } from './embeddings.js';
import { AttrStore } from './attrstore.js';
import { EnglishHintStore } from './englishhints.js';

const GAME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const str = (v, max = 60) => String(v ?? '').slice(0, max);

/**
 * createServer({ secrets, dataDir, log, config }) → { ops, save(), destroy() }
 * secrets: chỉ secret khai báo cho game này (ANTHROPIC_API_KEY, VOYAGE_API_KEY / OPENAI_API_KEY…)
 * dataDir: thư mục lưu cache của game (gateway cấp, tách theo game). Sau này thay bằng bảng g_doantu_* trên Supabase.
 */
export function createServer({ secrets = {}, dataDir = null, log = console, config = {}, client = undefined } = {}) {
  const hasClaude = !!(secrets.ANTHROPIC_API_KEY || secrets.ANTHROPIC_AUTH_TOKEN);
  const claude = client !== undefined ? client : hasClaude ? new Anthropic({ apiKey: secrets.ANTHROPIC_API_KEY, authToken: secrets.ANTHROPIC_AUTH_TOKEN }) : false;
  const file = (name) => (dataDir ? path.join(dataDir, name) : null);
  const scorer = new LayeredScorer({
    model: config.model || 'claude-opus-5-5',
    packModel: config.packModel || null,
    judgeModel: config.judgeModel || 'claude-haiku-5-5', // Lớp 4 chấm từ đoán: Haiku, không suy nghĩ (đường đi nóng)
    bands: config.scoreBands || {},
    batchMs: config.batchMs ?? 50, // đường đi nóng: gom lô ngắn
    cachePath: file('wordscore-cache.json'),
    packPath: file('knowledge-packs.json'),
    seedPackPath: path.join(GAME_DIR, 'data', 'knowledge-packs.json'),
    client: claude,
    // Lớp 3 (embedding) thêm 1 lượt gọi API trước Claude → mặc định tắt, chỉ chạy khi bật rõ embedding.enabled: true
    embedder: config.embedding?.enabled === true ? Embedder.fromEnv(secrets, config.embedding) : null,
    embed: config.embedding || {},
    log,
  });
  const attrs = new AttrStore({ client: claude || null, model: config.attrModel || 'claude-haiku-5-5', filePath: file('attributes.json'), log });
  const english = new EnglishHintStore({ client: claude || null, model: config.model || 'claude-opus-5-5', filePath: file('english-hints.json'), log });

  const ops = {
    /** Chấm một từ đoán (chỉ theo nghĩa). payload: { secret, word, ctx? } */
    async score({ secret, word, ctx = null } = {}) {
      const r = await scorer.score(str(secret), str(word), ctx && { id: str(ctx.id, 40), prompt: str(ctx.prompt, 400) });
      return { score: r.score, source: r.source, category: r.category ?? null };
    },
    /** Knowledge Pack của từ bí mật (đầu vòng) — overlay giữ để tra tại chỗ. payload: { secret, ctx? } */
    async pack({ secret, ctx = null } = {}) {
      const p = await scorer.prepare(str(secret), ctx && { id: str(ctx.id, 40), prompt: str(ctx.prompt, 400) });
      return { pack: p || null };
    },
    /** Thuộc tính nghĩa của một từ (kiểu "Đoán thuộc tính"). payload: { word } */
    async attr({ word } = {}) { return { attrs: (await attrs.get(str(word))) || null }; },
    /** 5 gợi ý tiếng Anh (kiểu "Gợi ý tiếng Anh"). payload: { secret, aliases? } */
    async english({ secret, aliases = [] } = {}) { return { hints: (await english.get(str(secret), (aliases || []).slice(0, 5).map((a) => str(a)))) || null }; },
    /** Khả năng hiện có (overlay quyết định bật kiểu chơi nào). */
    async caps() { return { claude: !!claude, attr: attrs.available, english: english.available, embedding: !!scorer.embedder }; },
  };

  return {
    ops,
    stats: () => scorer.stats(),
    save() { scorer.saveCache(); attrs.save(); english.save(); },
    destroy() { this.save(); },
  };
}

// Trang demo /demo?game=<id>: chạy game thật trong trình duyệt với "người xem ảo" (không cần gateway / TikTok).
// Dùng để nhúng vào trang chủ. Mỗi game có thể kèm games/<id>/demo/index.js: export function bot(snapshot, rand, data) → sự kiện | null.
import { createHost, memoryStorage, defaultBindings } from '#sdk';

const qs = new URLSearchParams(location.search);
const id = /^[a-z][a-z0-9-]{1,31}$/.test(qs.get('game') || '') ? qs.get('game') : 'memory';
const stage = document.getElementById('stage');
const NAMES = ['Minh Anh', 'Tuấn Kiệt', 'Hồng Nhung', 'Bảo Long', 'Thu Trang', 'Quốc Huy', 'Lan Chi', 'Gia Bảo', 'Ngọc Hân', 'Hải Đăng', 'Phương Vy', 'Đức Thịnh', 'Khánh Linh', 'Hoàng Nam'];
const SETTINGS = { doantu: { modes: ['meaning'], roundSeconds: 120, hintAtSeconds: [20, 45, 75] }, flagtrip: { tripLength: 12, flagSeconds: 18, revealSeconds: 6 }, memory: { answerSeconds: 8, revealSeconds: 4 } };
const rand = Math.random;
const user = () => { const i = Math.floor(rand() * NAMES.length); return { id: `demo${i}`, name: NAMES[i], avatar: null }; };
const fetchJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); };

async function main() {
  const base = `/games/${id}/`;
  const [manifest, schema] = await Promise.all([fetchJson(`${base}manifest.json`), fetchJson(`${base}settings.schema.json`)]);
  const data = {};
  await Promise.all(Object.entries(manifest.data || {}).map(async ([k, p]) => { data[k] = await fetchJson(base + p); }));
  const [engine, render, demo] = await Promise.all([import(`${base}engine/index.js`), import(`${base}render/index.js`), import(`${base}demo/index.js`).catch(() => null)]);
  const canvas = document.createElement('canvas');
  canvas.width = manifest.canvas.width; canvas.height = manifest.canvas.height;
  stage.append(canvas);
  const fit = () => { const s = Math.min(innerWidth / canvas.width, innerHeight / canvas.height); canvas.style.width = `${canvas.width * s}px`; canvas.style.height = `${canvas.height * s}px`; };
  addEventListener('resize', fit); fit();
  const view = render.mount(stage, { canvas, options: { mute: qs.get('sound') !== '1' }, sound: null });
  // phần server giả: điểm ngẫu nhiên cho game cần chấm (đủ để thấy bảng xếp hạng chạy)
  const server = { request: async (op) => (op === 'score' ? { score: Math.round(5 + rand() * 85), source: 'demo' } : {}) };
  const host = createHost({ manifest, schema, createGame: engine.createGame }, {
    settings: SETTINGS[id] || {}, data, now: () => Date.now(), random: rand, log: { log() {}, warn() {}, error() {} }, server, storage: memoryStorage(),
    onEffects: (fx) => { for (const e of fx) view.effect(e); view.update(host.snapshot()); },
  });
  const apply = (fx) => { for (const e of fx || []) view.effect(e); view.update(host.snapshot()); };
  const fire = (e) => apply(host.handle({ ...e, user: e.user || user() }));
  apply([]);
  setInterval(() => apply(host.tick()), 250);
  // người xem ảo: bình luận theo luật của game; thỉnh thoảng tặng quà theo trigger mặc định
  setInterval(() => { const e = demo?.bot?.(host.snapshot(), rand, data); if (e) fire(e); }, 700);
  const gifts = defaultBindings(manifest).map((b) => b.trigger).filter((t) => t.type === 'gift' && t.giftName);
  setInterval(() => { if (gifts.length && rand() < 0.5) { const t = gifts[Math.floor(rand() * gifts.length)]; fire({ type: 'gift', giftName: t.giftName, diamonds: 1, count: 1 }); } }, 6500);
  setInterval(() => fire({ type: 'like', count: 20 + Math.floor(rand() * 80) }), 3000);
}

main().catch((e) => { stage.textContent = `Không chạy được demo: ${e.message}`; });

// Trang demo /demo?game=<id>: chạy game thật trong trình duyệt với "người xem ảo" (không cần gateway / TikTok).
// Dùng để nhúng vào trang chủ. Mỗi game có thể kèm games/<id>/demo/index.js: export function bot(snapshot, rand, data) → sự kiện | null.
import { createHost, memoryStorage, defaultBindings } from '#sdk';

const qs = new URLSearchParams(location.search);
const id = /^[a-z][a-z0-9-]{1,31}$/.test(qs.get('game') || '') ? qs.get('game') : 'memory';
const stage = document.getElementById('stage');
const NAMES = ['Minh Anh', 'Tuấn Kiệt', 'Hồng Nhung', 'Bảo Long', 'Thu Trang', 'Quốc Huy', 'Lan Chi', 'Gia Bảo', 'Ngọc Hân', 'Hải Đăng', 'Phương Vy', 'Đức Thịnh', 'Khánh Linh', 'Hoàng Nam'];
const SETTINGS = { deadline: { mode: qs.get('mode') === 'camera' ? 'camera' : 'desktop', shiftSeconds: 150, steps: 8, briefSeconds: 3, resultSeconds: 8 }, doantu: { modes: ['meaning'], roundSeconds: 120, hintAtSeconds: [20, 45, 75] }, flagtrip: { tripLength: 12, flagSeconds: 18, revealSeconds: 9 }, memory: { answerSeconds: 8, revealSeconds: 4 }, namvung: { daySeconds: 120, nightSeconds: 100, briefSeconds: 6, storyBriefSeconds: 8, voteSeconds: 10, resultSeconds: 6, evidence: 4 } };
const rand = Math.random;
// giá xu của quà phổ biến (để thấy hiệu ứng theo số xu, vd meme quà lớn)
const COINS = { rose: 1, 'finger heart': 5, doughnut: 30, perfume: 20, 'hat and mustache': 99, 'money gun': 500, galaxy: 1000, corgi: 299, cap: 99, 'heart me': 1, 'hand hearts': 100, sunglasses: 199, lion: 29999 };
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
  let host = null;
  const view = render.mount(stage, { canvas, options: { mute: qs.get('sound') !== '1' }, sound: null, input: (ev) => host && apply(host.input(ev)) });
  // phần server giả: điểm ngẫu nhiên cho game cần chấm (đủ để thấy bảng xếp hạng chạy)
  const server = { request: async (op) => (op === 'score' ? { score: Math.round(5 + rand() * 85), source: 'demo' } : {}) };
  host = createHost({ manifest, schema, createGame: engine.createGame }, {
    settings: SETTINGS[id] || {}, data, now: () => Date.now(), random: rand, log: { log() {}, warn() {}, error() {} }, server, storage: memoryStorage(),
    onEffects: (fx) => { for (const e of fx) view.effect(e); view.update(host.snapshot()); },
  });
  const apply = (fx) => { for (const e of fx || []) view.effect(e); view.update(host.snapshot()); };
  const fire = (e) => apply(host.handle({ ...e, user: e.user || user() }));
  apply([]);
  setInterval(() => apply(host.tick()), 250);
  // người xem ảo: bình luận theo luật của game; thỉnh thoảng tặng quà theo trigger mặc định
  setInterval(() => { const e = demo?.bot?.(host.snapshot(), rand, data); if (e?.input) apply(host.input(e.input)); else if (e) fire(e); }, 700);
  const gifts = defaultBindings(manifest).map((b) => b.trigger).filter((t) => t.type === 'gift' && t.giftName);
  setInterval(() => { if (gifts.length && rand() < 0.5) { const t = gifts[Math.floor(rand() * gifts.length)]; fire({ type: 'gift', giftName: t.giftName, diamonds: COINS[t.giftName.toLowerCase()] || 1, count: 1 }); } }, 6500);
  setInterval(() => fire({ type: 'like', count: 20 + Math.floor(rand() * 80) }), 3000);
}

main().catch((e) => { stage.textContent = `Không chạy được demo: ${e.message}`; });

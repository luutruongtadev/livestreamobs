#!/usr/bin/env node
// Tạo mô hình 3D bằng Meshy Text-to-3D API (preview → refine có texture) rồi tải .glb về và nén texture.
//
//   node .claude/skills/meshy-3d/meshy.mjs <jobs.json> <thư-mục-ra> [--model meshy-t2.5] [--concurrency 4] [--size 1024]
//
// jobs.json: [{ "name": "sofa", "prompt": "...hình dáng...", "texture_prompt": "...màu sắc / chất liệu..." }]
// - Gọi API bằng curl (đi qua proxy của môi trường; key Meshy do proxy tự gắn — KHÔNG để key trong file / biến môi trường).
//   Chạy ngoài môi trường có proxy thì đặt MESHY_API_KEY.
// - Lưu tiến độ vào <thư-mục-ra>/.meshy-state.json: chạy lại không tạo lại món đã có task (không tốn credit hai lần).
// - Mỗi món tốn ~15 credit với meshy-t2.5 / t2 (preview 5 + refine 10), ~30 với meshy-6 trở lên.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const [jobsFile, outDir] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!jobsFile || !outDir) { console.error('Dùng: node meshy.mjs <jobs.json> <thư-mục-ra> [--model meshy-t2.5] [--concurrency 4] [--size 1024]'); process.exit(1); }
const MODEL = opt('model', 'meshy-t2.5'), CONC = Number(opt('concurrency', 4)), SIZE = Number(opt('size', 1024));
const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const KEY = process.env.MESHY_API_KEY || 'proxy-injected';
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const stateFile = path.join(outDir, '.meshy-state.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} lỗi ${code}: ${err.slice(0, 300)}`))));
  });
}
async function api(method, url, body) {
  const argv = ['-sS', '--max-time', '60', '-X', method, url, '-H', `Authorization: Bearer ${KEY}`, '-H', 'Content-Type: application/json'];
  if (body) argv.push('-d', JSON.stringify(body));
  const out = await run('curl', argv);
  const j = JSON.parse(out);
  if (j.message && !j.id && !j.result) throw new Error(`Meshy: ${j.message}`);
  return j;
}
async function wait(id, label) {
  for (let i = 0; i < 240; i++) {
    const t = await api('GET', `${API}/${id}`);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED' || t.status === 'EXPIRED') throw new Error(`${label}: ${t.status} ${t.task_error?.message || ''}`);
    if (i % 6 === 0) console.log(`  ${label} ${t.status} ${t.progress ?? 0}%`);
    await sleep(5000);
  }
  throw new Error(`${label}: quá lâu`);
}

async function one(job) {
  const st = (state[job.name] ||= {});
  const out = path.join(outDir, `${job.name}.glb`);
  if (st.done && fs.existsSync(out)) { console.log(`✓ ${job.name} (đã có)`); return; }
  if (!st.preview) {
    const r = await api('POST', API, { mode: 'preview', prompt: job.prompt.slice(0, 600), ai_model: job.model || MODEL, ...(job.preview || {}) });
    st.preview = r.result; save();
    console.log(`→ ${job.name}: preview ${st.preview}`);
  }
  await wait(st.preview, `${job.name}/preview`);
  if (!st.refine) {
    const r = await api('POST', API, { mode: 'refine', preview_task_id: st.preview, ...(job.texture_prompt ? { texture_prompt: job.texture_prompt.slice(0, 600) } : {}), ...(job.refine || {}) });
    st.refine = r.result; save();
    console.log(`→ ${job.name}: refine ${st.refine}`);
  }
  const t = await wait(st.refine, `${job.name}/refine`);
  const raw = path.join(outDir, `.${job.name}.raw.glb`);
  if (!fs.existsSync(raw)) await run('curl', ['-sS', '--max-time', '180', '-o', raw, t.model_urls.glb]);
  if (t.thumbnail_url) await run('curl', ['-sS', '--max-time', '60', '-o', path.join(outDir, `.${job.name}.png`), t.thumbnail_url]).catch(() => {});
  // nén: texture về JPEG ≤ SIZE px, giữ nguyên lưới (không draco để GLTFLoader thường đọc được) — Python + Pillow, không cần tải gói ngoài
  await run('python3', ['-I', new URL('./glb_textures.py', import.meta.url).pathname, raw, out, String(SIZE), '80']);
  fs.rmSync(raw, { force: true });
  st.done = true; st.bytes = fs.statSync(out).size; st.credits = t.consumed_credits; save();
  console.log(`✓ ${job.name}.glb ${(st.bytes / 1024).toFixed(0)} KB`);
}

const queue = [...jobs];
const fails = [];
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, async () => {
  while (queue.length) { const j = queue.shift(); try { await one(j); } catch (e) { fails.push(j.name); console.error(`✗ ${j.name}: ${e.message}`); } }
}));
const bal = await api('GET', 'https://api.meshy.ai/openapi/v1/balance').catch(() => null);
console.log(`Xong ${jobs.length - fails.length}/${jobs.length}${fails.length ? ` · lỗi: ${fails.join(', ')}` : ''}${bal ? ` · còn ${bal.balance} credit` : ''}`);
process.exit(fails.length ? 2 : 0);

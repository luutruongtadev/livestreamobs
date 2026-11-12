// Phần server của Mật Khẩu Lầy — chạy trong gateway, giữ API key, cache DÙNG CHUNG mọi kênh.
// Hai việc: dịch luật người xem tự đặt bằng lời thành spec kiểm tra tại chỗ (compile, cache theo nội dung luật),
// và chấm mật khẩu cho luật không kiểm tra bằng máy được (judge, cache theo luật + mật khẩu).
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { normalize } from '#sdk';
import { cleanSpec, evalSpec, CHECK_TYPES, CLASSES, OPS } from '../engine/custom.js';

const nul = (t) => ({ anyOf: [t, { type: 'null' }] });
const COMPILE_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    reason: { type: 'string' },
    label: { type: 'string' },
    judge: { type: 'boolean' },
    example: { type: 'string' },
    mode: { type: 'string', enum: ['all', 'any'] },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: CHECK_TYPES },
          text: nul({ type: 'string' }),
          list: nul({ type: 'array', items: { type: 'string' } }),
          cls: nul({ type: 'string', enum: CLASSES }),
          chars: nul({ type: 'string' }),
          op: nul({ type: 'string', enum: OPS }),
          n: nul({ type: 'integer' }),
          pattern: nul({ type: 'string' }),
          caseSensitive: { type: 'boolean' },
          accentSensitive: { type: 'boolean' },
        },
        required: ['type', 'text', 'list', 'cls', 'chars', 'op', 'n', 'pattern', 'caseSensitive', 'accentSensitive'],
        additionalProperties: false,
      },
    },
  },
  required: ['ok', 'reason', 'label', 'judge', 'example', 'mode', 'checks'],
  additionalProperties: false,
};

const COMPILE_SYSTEM = `Bạn là bộ duyệt luật cho trò chơi livestream "Mật Khẩu Lầy": streamer (hoặc người xem) phải đặt một mật khẩu thoả nhiều luật vui. Người xem gõ một luật bằng tiếng Việt (có thể không dấu, viết tắt, sai chính tả). Bạn dịch luật đó thành các phép kiểm tra máy chạy được.

TỪ CHỐI (ok=false, reason ngắn gọn, vui vẻ, tiếng Việt) khi luật:
- tục tĩu, xúc phạm, phân biệt, bạo lực, tình dục, chính trị, nhắm vào một người cụ thể;
- đòi thông tin thật / riêng tư: số điện thoại, địa chỉ, số tài khoản, CCCD, mật khẩu thật, email…;
- không nói về nội dung mật khẩu (vd "host phải nhảy", "tặng quà đi");
- tự mâu thuẫn, không thể làm được, hoặc cần mật khẩu dài hơn 60 ký tự.
Còn lại thì CHẤP NHẬN và làm cho chơi được.

Khi chấp nhận:
- label: luật viết lại gọn, rõ, tiếng Việt có dấu, ≤ 80 ký tự, giữ tinh thần vui của người xem (vd "Có tên một cầu thủ Việt Nam").
- checks: 1–4 phép kiểm tra, mode "all" (thoả tất cả) hoặc "any" (thoả một). Các loại:
  contains / not_contains / starts_with / ends_with (text) · contains_any (list: danh sách cách viết chấp nhận, ≤ 40 mục, viết KHÔNG DẤU liền nhau khi là tên riêng, vd ["quanghai","congphuong"]) · count (cls: digit, upper, lower, letter, vowel, consonant, emoji, special, space, hoặc char + chars; op eq|gte|lte; n) · length (op, n) · digit_sum (op, n) · regex (pattern JavaScript ngắn, KHÔNG lượng từ lồng nhau, không tham chiếu ngược — chỉ dùng khi các loại kia không diễn tả được).
  Mặc định caseSensitive=false, accentSensitive=false (so không dấu, không phân biệt hoa thường) — chỉ bật khi luật nói rõ về hoa / thường hay dấu. Trường không dùng thì null.
  Luật về "một thứ thuộc nhóm" (con vật, cầu thủ, món ăn, bài hát…) → contains_any với danh sách phổ biến nhất mà người Việt hay nghĩ tới.
- judge=true CHỈ khi không thể kiểm tra bằng máy (cảm nhận, ý nghĩa: "nghe phải dễ thương", "phải là một câu tỏ tình") — khi đó checks để [] và AI sẽ chấm từng mật khẩu.
- example: một đoạn ngắn (≤ 25 ký tự) tự nó thoả luật này, dùng để gợi ý (vd "quanghai"). Với luật đếm / độ dài có thể để "".`;

const JUDGE_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, why: { type: 'string' } }, required: ['ok', 'why'], additionalProperties: false };
const JUDGE_SYSTEM = `Bạn là trọng tài vui tính của trò chơi "Mật Khẩu Lầy". Cho một LUẬT và một MẬT KHẨU, trả lời mật khẩu có thoả luật không. Chấm hợp lý, hơi dễ dãi với cách viết không dấu / viết liền / sai chính tả nhẹ, nhưng không chấp nhận nếu rõ ràng không liên quan. why: một câu ngắn tiếng Việt (≤ 60 ký tự).`;

export function createServer({ secrets = {}, dataDir = null, log = console, config = {}, client = undefined } = {}) {
  const hasClaude = !!(secrets.ANTHROPIC_API_KEY || secrets.ANTHROPIC_AUTH_TOKEN);
  const claude = client !== undefined ? client : hasClaude ? new Anthropic({ apiKey: secrets.ANTHROPIC_API_KEY, authToken: secrets.ANTHROPIC_AUTH_TOKEN }) : null;
  const model = config.model || 'claude-haiku-5-5';
  const file = dataDir ? path.join(dataDir, 'rule-cache.json') : null;
  const compiled = new Map(); // nội dung luật (không dấu) → kết quả đã làm sạch
  const judged = new Map(); // luật|mật khẩu → { ok, why }
  const inflight = new Map();
  let dirty = false;
  try { if (file && fs.existsSync(file)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) compiled.set(k, v); } catch (e) { log.warn?.(`[matkhau] đọc cache luật lỗi: ${e?.message || e}`); }

  async function call(system, user, schema, maxTokens) {
    const res = await claude.beta.messages.create({
      model, max_tokens: maxTokens,
      // Haiku: không có server-side fallback; tắt suy nghĩ cho nhanh (phân loại ngắn)
      ...(/haiku/.test(model) ? { thinking: { type: 'disabled' } } : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    }, { timeout: 15_000 });
    if (res.stop_reason === 'refusal') return null;
    return JSON.parse(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  }

  /** Làm sạch kết quả dịch luật: spec hợp lệ, ví dụ phải tự thoả luật. */
  function tidy(raw) {
    if (!raw || raw.ok !== true) return { ok: false, reason: String(raw?.reason || 'Máy không hiểu luật này').slice(0, 80) };
    const label = String(raw.label || '').trim().slice(0, 90);
    if (!label) return { ok: false, reason: 'Luật trống' };
    const judge = raw.judge === true;
    const spec = judge ? null : cleanSpec({ mode: raw.mode, checks: raw.checks });
    if (!judge && !spec) return { ok: false, reason: 'Máy không biết kiểm tra luật này' };
    let example = String(raw.example || '').slice(0, 25);
    if (spec && example && !evalSpec(spec, example)) example = '';
    return { ok: true, label, judge, spec, example };
  }

  const once = (key, fn) => {
    if (inflight.has(key)) return inflight.get(key);
    const p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };

  const ops = {
    /** Dịch luật người xem đặt. payload: { text } → { ok, reason? , label, judge, spec, example } */
    async compile({ text } = {}) {
      const t = String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 140);
      const key = normalize(t);
      if (key.length < 2) return { ok: false, reason: 'Luật ngắn quá' };
      if (compiled.has(key)) return { ...compiled.get(key), cached: true };
      if (!claude) return { ok: false, reason: 'Chưa bật AI duyệt luật', offline: true };
      return once(`c|${key}`, async () => {
        let out;
        try { out = tidy(await call(COMPILE_SYSTEM, `LUẬT CỦA NGƯỜI XEM: ${JSON.stringify(t)}`, COMPILE_SCHEMA, 1500)); }
        catch (e) { log.warn?.(`[matkhau] dịch luật lỗi: ${e?.status || ''} ${e?.message || e}`); return { ok: false, reason: 'Máy đang bận, thử lại sau', offline: true }; }
        compiled.set(key, out); dirty = true;
        while (compiled.size > 20_000) compiled.delete(compiled.keys().next().value);
        return out;
      });
    },
    /** AI chấm một mật khẩu theo luật không kiểm tra bằng máy được. payload: { rule, password } → { ok, why } */
    async judge({ rule, password } = {}) {
      const r = String(rule ?? '').slice(0, 90), pw = String(password ?? '').slice(0, 120);
      const key = `${normalize(r)}|${pw}`;
      if (judged.has(key)) return judged.get(key);
      if (!claude) return { ok: false, why: 'Chưa bật AI chấm', offline: true };
      return once(`j|${key}`, async () => {
        let out;
        try { const v = await call(JUDGE_SYSTEM, `LUẬT: ${JSON.stringify(r)}\nMẬT KHẨU: ${JSON.stringify(pw)}`, JUDGE_SCHEMA, 300); out = { ok: v?.ok === true, why: String(v?.why || '').slice(0, 80) }; }
        catch (e) { log.warn?.(`[matkhau] AI chấm lỗi: ${e?.status || ''} ${e?.message || e}`); return { ok: false, why: 'Máy đang bận', offline: true }; }
        judged.set(key, out);
        while (judged.size > 5000) judged.delete(judged.keys().next().value);
        return out;
      });
    },
    async caps() { return { llm: !!claude }; },
  };

  return {
    ops,
    save() {
      if (!file || !dirty) return;
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(Object.fromEntries(compiled))); dirty = false; } catch (e) { log.warn?.(`[matkhau] lưu cache luật lỗi: ${e?.message || e}`); }
    },
    destroy() { this.save(); },
  };
}

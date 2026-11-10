import { createTriggers } from './triggers.js';
import { defaultBindings, PLATFORM_COMMANDS } from './manifest.js';
import { resolveSettings } from './schema.js';

/** Kho khoá–giá trị trong RAM (mặc định khi nền tảng không cấp storage). */
export function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { get: (k) => m.get(k), set: (k, v) => { m.set(k, v); }, toJSON: () => Object.fromEntries(m) };
}

/**
 * Chạy một game theo chuẩn module, dùng chung cho overlay (trình duyệt), dashboard (xem trước) và test.
 * - Kiểm tra cài đặt theo schema (trường sai → về default).
 * - Ánh xạ trigger (quà / tim / follow / share / từ khoá) → game.action().
 * - CÁCH LY LỖI: mọi lời gọi vào game bọc try/catch; lỗi lặp lại (maxErrors trong errorWindowMs) → dừng game
 *   ("crashed"), nền tảng vẫn chạy và có thể recover() hoặc nạp game khác.
 *
 * module: { manifest, schema, createGame }
 */
export function createHost(module, {
  settings: input = {}, bindings = null, data = {}, now = () => Date.now(), random = Math.random,
  server = null, storage = null, report = null, log = console,
  onEffects = null, onError = null, maxErrors = 5, errorWindowMs = 10_000,
} = {}) {
  const { manifest, schema, createGame } = module;
  const { settings, errors: settingErrors } = resolveSettings(schema || { type: 'object', properties: {} }, input);
  const triggers = createTriggers(bindings ?? defaultBindings(manifest), { now });
  const inputs = new Set(manifest.inputs || []);
  const commands = new Set((manifest.commands || []).map((c) => c.id));
  let state = 'running';
  let errTimes = [];
  let lastError = null;
  let game = null;

  const ctx = {
    manifest, settings, data, now, random, log,
    server: { request: (op, payload) => (server ? server.request(op, payload) : Promise.reject(new Error(`Game "${manifest.id}" không có phần server`))) },
    storage: storage || memoryStorage(),
    report: report || { round() {}, points() {} },
    bindings: { view: () => triggers.view(), reset: () => triggers.reset() },
  };

  function fail(where, e) {
    const t = now();
    errTimes = errTimes.filter((x) => t - x < errorWindowMs);
    errTimes.push(t);
    lastError = { where, message: String(e?.message || e), at: t };
    if (errTimes.length >= maxErrors) state = 'crashed';
    log?.error?.(`[game ${manifest.id}] lỗi ở ${where}: ${lastError.message}${state === 'crashed' ? ' — dừng game' : ''}`);
    try { onError?.({ ...lastError, crashed: state === 'crashed' }); } catch { /* bỏ qua */ }
  }

  function guard(where, fn, fallback) {
    if (state !== 'running' || !game && where !== 'create') return fallback;
    try { return fn(); } catch (e) { fail(where, e); return fallback; }
  }

  const list = (x) => (Array.isArray(x) ? x : []);

  function create() {
    state = 'running';
    errTimes = [];
    game = null;
    game = guard('create', () => createGame(ctx), null);
    if (!game) { state = 'crashed'; return; }
    game.on?.('effects', (fx) => { if (state === 'running' && list(fx).length) { try { onEffects?.(fx); } catch (e) { fail('effects', e); } } });
  }
  create();

  return {
    manifest, settings, settingErrors,

    /** Sự kiện chuẩn hoá → hiệu ứng (đồng bộ, để vẽ ngay ở frame kế tiếp). */
    handle(ev) {
      const fx = [];
      if (state !== 'running' || !ev?.type) return fx;
      if (inputs.has(ev.type)) fx.push(...list(guard('handle', () => game.handle(ev), [])));
      const r = triggers.feed(ev);
      if (game.progress) for (const p of r.progress) fx.push(...list(guard('progress', () => game.progress(p.binding.action, { count: p.count, every: p.every, binding: p.binding, event: ev }), [])));
      for (const { binding, times } of r.fires) {
        for (let i = 0; i < times; i++) {
          const res = guard('action', () => game.action(binding.action, ev, binding), []);
          if (res === false) { triggers.refund(binding); break; } // game không áp dụng được → trả lượt
          fx.push(...list(res));
        }
      }
      return fx;
    },

    /** Lệnh từ dashboard. pause / resume do nền tảng xử lý (game có pause() / resume()). */
    command(id, args = {}) {
      if (PLATFORM_COMMANDS.includes(id)) return guard(id, () => (typeof game[id] === 'function' ? (game[id](args.reason), []) : []), []);
      if (!commands.has(id)) return [];
      return list(guard('command', () => game.command(id, args), []));
    },

    tick() { return state === 'running' ? list(guard('tick', () => game.tick(now()), [])) : []; },
    /** Trạng thái để renderer vẽ (có thể ẩn bí mật, vd đáp án). */
    snapshot() { return guard('snapshot', () => game.snapshot(), null); },
    /** Trạng thái đầy đủ để lưu (ctx.storage / game_state) và khôi phục khi reload overlay. */
    // tiến độ gom quà / tim do nền tảng giữ → lưu kèm dưới khoá dành riêng $triggers (game không thấy khoá này)
    serialize() {
      return guard('serialize', () => {
        const s = game.serialize ? game.serialize() : null;
        const tr = triggers.dump();
        return s && typeof s === 'object' && !Array.isArray(s) && Object.keys(tr).length ? { ...s, $triggers: tr } : s;
      }, null);
    },
    restore(s) {
      return guard('restore', () => {
        if (s && typeof s === 'object' && !Array.isArray(s) && '$triggers' in s) {
          const { $triggers, ...rest } = s;
          triggers.load($triggers);
          s = rest;
        }
        return game.restore?.(s);
      }, undefined);
    },
    /** Chạy lại game sau khi bị dừng vì lỗi (giữ cài đặt, bindings). */
    recover() { try { game?.destroy?.(); } catch { /* bỏ qua */ } create(); return state; },
    destroy() { try { game?.destroy?.(); } catch { /* bỏ qua */ } state = 'destroyed'; game = null; },
    status() { return { state, errors: errTimes.length, lastError, settingErrors, bindings: triggers.view() }; },
  };
}

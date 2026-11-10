// Game Đoán từ theo chuẩn module: bọc WordGame (engine có sẵn) vào hợp đồng createGame(ctx).
import { canon } from '#sdk';
import { WordGame } from './wordgame.js';
import { packIndex, dictLookup, scoreOf } from './pack.js';

const MODES = ['meaning', 'attr', 'english', 'giaima'];

// ---- nhãn chip quà trên màn hình (sinh từ trigger mà streamer gán) ----
const GIFT_VI = { rose: 'Hoa hồng', 'finger heart': 'Tim tay', tiktok: 'TikTok', 'heart me': 'Heart Me', 'ice cream cone': 'Kem', doughnut: 'Bánh donut', galaxy: 'Thiên hà', lion: 'Sư tử' };
const GIFT_ICON = { rose: '🌹', 'finger heart': '🫰', doughnut: '🍩', galaxy: '🌌', lion: '🦁' };
const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(n);
const giftNames = (t) => [t.giftName, ...(t.gifts || [])].filter(Boolean);

function chipIcon(b) {
  const t = b.trigger || {};
  if (t.type === 'like') return '❤️';
  if (t.type === 'follow') return '➕';
  if (t.type === 'share') return '↗️';
  if (t.type === 'keyword') return '💬';
  const first = giftNames(t)[0];
  return (first && GIFT_ICON[first.toLowerCase()]) || b.icon || '🎁';
}

/** "5 Hoa hồng = 1 chữ", "1.000 tim = 1 chữ", "30 xu = +60 giây"… (vòng Giải mã đổi nghĩa như luật cũ). */
export function chipLabel(b, wg) {
  const t = b.trigger || {};
  const gm = wg?.mode === 'giaima' && wg?.gm;
  const secs = b.params?.seconds || 60;
  const what = { letter: '1 chữ', hint: gm ? 'giải 1 gợi ý' : 'gợi ý', time: `+${secs} giây`, syllable: gm ? 'lộ 3 chữ' : 'lộ 1 tiếng' }[b.action] || b.label;
  const n = t.every && t.every > 1 ? `${fmtN(t.every)} ` : '';
  let who;
  if (t.type === 'like') who = `${fmtN(t.every || 1)} tim`;
  else if (t.type === 'gift') {
    const names = giftNames(t);
    who = names.length ? `${n}${GIFT_VI[names[0].toLowerCase()] || names[0]}${names.length > 1 ? '…' : ''}` : `${n}${n ? 'quà ≥ ' : ''}${fmtN(t.minDiamonds ?? 1)} xu`;
  } else if (t.type === 'follow') who = `${n}follow`;
  else if (t.type === 'share') who = `${n}share`;
  else if (t.type === 'member') who = `${n}người vào`;
  else if (t.type === 'keyword') who = `"${t.text}"`;
  else return b.label;
  return `${who} = ${what}`;
}

/**
 * Chấm điểm phía overlay: tra Knowledge Pack tại chỗ (0 ms); từ ngoài pack mới hỏi phần server qua WebSocket.
 * Không có server / lỗi → "chưa rõ nghĩa" (điểm không liên quan) — không bao giờ chấm theo mặt chữ.
 */
function makeScorer(ctx) {
  let packFor = null, idx = null;
  const unknown = () => ({ score: scoreOf('UNRELATED', 0.5), source: 'none', category: null });
  return {
    prepare(secret, sctx) {
      packFor = secret; idx = null;
      return ctx.server.request('pack', { secret, ctx: sctx })
        .then((r) => { if (packFor === secret && r?.pack) idx = packIndex(r.pack); })
        .catch(() => {});
    },
    score(secret, word, sctx) {
      const hit = packFor === secret && idx ? dictLookup(idx, word) : null;
      if (hit) return Promise.resolve({ score: scoreOf(hit.category, hit.strength), source: 'dict', category: hit.category });
      return ctx.server.request('score', { secret, word, ctx: sctx })
        .then((r) => (r && Number.isFinite(r.score) ? r : unknown()))
        .catch(unknown);
    },
  };
}

/** Kho từ của kênh: danh sách soạn sẵn (data/meaning.json), từ đã chơi lưu trong ctx.storage để không lặp. */
function makeWordBank(ctx, words) {
  const used = new Set(ctx.storage.get('used') || []);
  const save = () => ctx.storage.set('used', [...used].slice(-5000));
  const pool = words.filter((w) => w?.word);
  return {
    isUsed: (w) => used.has(canon(w)),
    markUsed: (w) => { used.add(canon(w)); save(); },
    remaining: () => pool.filter((w) => !used.has(canon(w.word))).length,
    next(recent = []) {
      let fresh = pool.filter((w) => !used.has(canon(w.word)) && !recent.includes(canon(w.word)));
      if (!fresh.length) { for (const w of pool) used.delete(canon(w.word)); fresh = pool.filter((w) => !recent.includes(canon(w.word))); }
      const list = fresh.length ? fresh : pool;
      const w = list[Math.floor(ctx.random() * list.length)] || { word: 'mặt trời', hint: 'Thiên nhiên' };
      used.add(canon(w.word)); save();
      return w;
    },
  };
}

/** Thuộc tính của từ: soạn sẵn (data/attr.json + attr-cache.json), thiếu thì hỏi server. */
function makeAttrStore(ctx, data, serverOk) {
  const cache = new Map();
  for (const w of data.attr?.words || []) if (w?.word && w.attrs) cache.set(canon(w.word), w.attrs);
  for (const [word, a] of Object.entries(data.attrCache?.words || {})) if (!cache.has(canon(word))) cache.set(canon(word), a);
  return {
    get available() { return cache.size > 0 || serverOk(); },
    has: (w) => cache.has(canon(w)),
    get(w) {
      const k = canon(w);
      if (cache.has(k)) return Promise.resolve(cache.get(k));
      return ctx.server.request('attr', { word: k }).then((r) => { if (r?.attrs) cache.set(k, r.attrs); return r?.attrs || null; }).catch(() => null);
    },
  };
}

/** Gợi ý tiếng Anh: soạn sẵn (data/english.json), thiếu thì hỏi server. */
function makeEnglishStore(ctx, data, serverOk) {
  const cache = new Map();
  for (const w of data.english?.words || []) if (w?.word && Array.isArray(w.en) && w.en.length) cache.set(canon(w.word), w.en.slice(0, 5));
  return {
    get available() { return cache.size > 0 || serverOk(); },
    get(secret, aliases = []) {
      const k = canon(secret);
      if (cache.has(k)) return Promise.resolve(cache.get(k));
      return ctx.server.request('english', { secret: k, aliases }).then((r) => { if (r?.hints) cache.set(k, r.hints); return r?.hints || null; }).catch(() => null);
    },
  };
}

export function createGame(ctx) {
  const s = ctx.settings;
  const data = ctx.data || {};
  let serverCaps = { attr: false, english: false };
  const serverOk = () => !!(serverCaps.attr || serverCaps.english);
  const modeWords = {
    meaning: data.meaning?.words || [],
    attr: data.attr?.words || [],
    english: data.english?.words || [],
    ...(data.giaima ? { giaima: { phrases: data.giaima.phrases || [], clues: data.giaima.clues || [] } } : {}),
  };
  const config = {
    roundSeconds: s.roundSeconds,
    breakSeconds: s.breakSeconds,
    hintAtSeconds: s.hintAtSeconds,
    cooldownSec: s.cooldownSec,
    maxScoredPerRound: s.maxScoredPerRound,
    modes: s.modes.filter((m) => MODES.includes(m)),
    alternateEvery: s.alternateEvery,
    comboMax: s.comboMax,
    curatedRatio: 1, // nền tảng: kho từ = danh sách soạn sẵn
    likeBonus: { every: s.likeBonusEvery, points: s.likeBonusPoints },
    team: { rounds: s.teamRounds },
    externalUnlocks: true, // quà / tim do nền tảng ánh xạ (trigger → action)
    words: modeWords.meaning.length ? modeWords.meaning.slice(0, 50) : [{ word: 'mặt trời', hint: 'Thiên nhiên' }],
  };
  const wg = new WordGame(config, {
    scorer: makeScorer(ctx),
    now: ctx.now,
    random: ctx.random,
    persist: { read: () => ctx.storage.get('state') || null, write: (v) => ctx.storage.set('state', v) },
    wordBank: makeWordBank(ctx, modeWords.meaning),
    attrStore: makeAttrStore(ctx, data, serverOk),
    englishStore: makeEnglishStore(ctx, data, serverOk),
    modeWords,
    log: ctx.log,
  });
  if (s.teams) wg.teams.setOn(true);
  // chip quà / tiến độ gom trên màn hình lấy từ bindings của nền tảng, nhãn ngắn kiểu cũ ("5 Hoa hồng = 1 chữ")
  wg.externalUnlocks = () => ctx.bindings.view().map((b) => ({ id: b.id, icon: chipIcon(b), label: chipLabel(b, wg), every: b.every, count: Math.min(b.count, b.every || 0) }));
  ctx.server.request('caps', {}).then((c) => { if (c) serverCaps = c; }).catch(() => {});

  // sang vòng mới → bộ đếm gom quà / tim của nền tảng đếm lại từ đầu (như bản cũ)
  const out = (fx) => {
    const list = Array.isArray(fx) ? fx : [];
    if (list.some((e) => e?.type === 'wg_start')) ctx.bindings.reset();
    wg.save();
    return list;
  };
  wg.on('effects', (fx) => { wg.save(); });

  const byOf = (ev) => (ev?.user?.id ? { id: ev.user.id, name: ev.user.name ?? 'Ẩn danh', avatar: ev.user.avatar ?? null } : null);

  return {
    // người xem chuẩn hoá { id, name, avatar: null nếu không có } để snapshot luôn tuần tự hoá JSON được
    handle: (ev) => out(wg.handle({ ...ev, user: ev.user ? byOf(ev) : ev.user, repeatCount: ev.repeatCount ?? ev.count })),

    /** Trigger đã gán khớp → mở khoá. Không áp dụng được (vd chỉ còn 1 chữ) → false để nền tảng trả lượt. */
    action(id, ev, binding = {}) {
      if (wg.paused || wg.phase !== 'playing') return false;
      let action = id;
      // vòng tiếng Anh: tim mở thêm từ tiếng Anh trước (như luật cũ), hết thì mới lộ chữ
      if (id === 'letter' && binding?.trigger?.type === 'like' && wg.mode === 'english' && wg.englishHints && wg.hintLevel < wg.maxHints) action = 'hint';
      const rule = { id: binding.id || id, action, icon: binding.icon || null, label: binding.label || id, seconds: binding.params?.seconds || s.timeBonusSeconds };
      const fx = wg.applyUnlock(rule, byOf(ev), ev?.giftName || (binding?.trigger?.type === 'like' ? 'tim' : null), Math.max(1, Number(ev?.count) || 1));
      if (!fx.length) return false;
      return out(binding?.trigger?.type === 'like' ? fx.map((e) => ({ ...e, likes: true })) : fx);
    },

    /** Tiến độ gom (vd 3/5 hoa hồng) → hiệu ứng như bản cũ. */
    progress(id, { count, every, binding, event }) {
      if (binding?.trigger?.type !== 'gift' || !count) return [];
      return [{ type: 'wg_progress', rule: binding.id, icon: binding.icon || '🎁', count, every, by: byOf(event), giftName: event?.giftName }];
    },

    command(id, args = {}) {
      if (id === 'next') return out(wg.skip());
      if (id === 'hint') return out(wg.revealHint(null));
      if (id === 'reset') return out(wg.resetAll());
      if (id === 'team') {
        if (args.rounds) wg.teams.setRounds(Number(args.rounds));
        if (args.op === 'on' || args.op === 'off') wg.teams.setOn(args.op === 'on');
        else if (args.op === 'reset') wg.teams.reset();
        else wg.teams.setOn(!wg.teams.on);
        wg.dirty = true;
        return out([{ type: 'wg_team_mode', on: wg.teams.on }]);
      }
      return [];
    },

    tick: () => out(wg.tick()),
    pause: (reason) => wg.pause(reason || 'manual'),
    resume: () => wg.resume(),
    snapshot: () => wg.snapshot(),
    // Ván đang chơi không lưu (restore "partial"): reload overlay thì giữ người thắng, từ đã chơi, chuỗi, đội — vòng mới bắt đầu lại.
    serialize: () => ({ state: wg.state(), used: ctx.storage.get('used') || [] }),
    restore(saved) {
      if (!saved || typeof saved !== 'object' || !saved.state || typeof saved.state !== 'object') return;
      ctx.storage.set('state', saved.state);
      if (Array.isArray(saved.used)) ctx.storage.set('used', saved.used);
      wg.load();
    },
    on: (name, fn) => wg.on(name, fn),
    destroy: () => { wg.save(); wg.removeAllListeners(); },
  };
}

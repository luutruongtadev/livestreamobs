import { Emitter } from '#sdk';

/**
 * Game mẫu: mỗi bình luận +điểm cho người gửi, quà (action "boost") cộng thêm.
 * Hợp đồng: handle / action / command / tick / snapshot / serialize / restore / destroy (+ on('effects') cho hiệu ứng đến sau).
 * Chỉ dùng ctx.now() / ctx.random() / ctx.server — KHÔNG Date.now, Math.random, fetch, DOM.
 */
export function createGame(ctx) {
  const s = ctx.settings;
  const em = new Emitter();
  let state = { players: {}, total: 0 };
  const add = (user, n) => {
    const id = String(user.id);
    const p = (state.players[id] ||= { id, name: String(user.name || 'Ẩn danh').slice(0, 40), avatar: user.avatar ?? null, points: 0 });
    p.points += n;
    state.total += n;
    return p;
  };
  return {
    handle(ev) {
      if (ev?.type !== 'comment' || !ev.user?.id) return [];
      const p = add(ev.user, s.pointsPerComment);
      return [{ type: 'point', id: p.id, points: p.points }];
    },
    action(id, ev) {
      if (id !== 'boost' || !ev?.user?.id) return false; // false = không áp dụng được, nền tảng trả lượt
      const p = add(ev.user, s.boostPoints);
      return [{ type: 'boost', id: p.id, name: p.name, points: s.boostPoints }];
    },
    command(id) {
      if (id === 'reset') { state = { players: {}, total: 0 }; return [{ type: 'reset' }]; }
      return [];
    },
    tick() { return []; },
    snapshot() {
      return { total: state.total, top: Object.values(state.players).sort((a, b) => b.points - a.points || (a.id < b.id ? -1 : 1)).slice(0, 5) };
    },
    serialize() { return JSON.parse(JSON.stringify(state)); },
    restore(saved) {
      if (saved && typeof saved === 'object' && saved.players && typeof saved.players === 'object') state = JSON.parse(JSON.stringify({ players: saved.players, total: Number(saved.total) || 0 }));
    },
    on: (name, fn) => em.on(name, fn),
    destroy() { em.removeAllListeners(); },
  };
}

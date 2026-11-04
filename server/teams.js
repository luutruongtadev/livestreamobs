import { normalize } from './text.js';

export const TEAM_DEFAULTS = {
  rounds: 10, // số vòng mỗi trận
  perDiamond: 1, // quà của thành viên: +1 điểm đội mỗi xu
  perShare: 5, // chia sẻ live của thành viên: +5 điểm đội
  teams: [
    { id: 'red', name: 'Đội Đỏ', icon: '🔴', color: '#ef4444', keywords: ['đội đỏ', 'team đỏ', 'phe đỏ', 'doi do'] },
    { id: 'blue', name: 'Đội Xanh', icon: '🔵', color: '#3b82f6', keywords: ['đội xanh', 'team xanh', 'phe xanh', 'doi xanh'] },
  ],
};

const pub = (u) => ({ id: u.id, name: u.name, avatar: u.avatar || null });

/**
 * Chế độ đấu đội cho Đoán từ (admin bật / tắt).
 * - Comment "đội đỏ" / "đội xanh" để vào đội; chưa có đội mà đoán thì tự vào đội ít người hơn.
 * - Đoán trúng: đội được điểm của vòng; quà / chia sẻ của thành viên cộng thêm điểm đội.
 * - Mỗi trận N vòng; hết trận công bố đội thắng + MVP rồi sang trận mới (giữ nguyên đội).
 */
export class TeamMatch {
  constructor(config = {}) {
    this.cfg = { ...TEAM_DEFAULTS, ...config, teams: config.teams?.length >= 2 ? config.teams : TEAM_DEFAULTS.teams };
    this.keywordMap = new Map();
    for (const t of this.cfg.teams) for (const k of t.keywords || []) this.keywordMap.set(normalize(k), t.id);
    this.on = false;
    this.rounds = this.cfg.rounds;
    this.members = {}; // id người chơi -> { id, name, avatar, team }
    this.newMatch(1);
  }

  newMatch(no = (this.matchNo || 0) + 1) {
    this.matchNo = no;
    this.round = 0;
    this.score = Object.fromEntries(this.cfg.teams.map((t) => [t.id, 0]));
    this.mvp = {}; // id -> điểm đóng góp trong trận
    this.matchOver = null;
  }

  team(id) { return this.cfg.teams.find((t) => t.id === id); }
  count(teamId) { return Object.values(this.members).filter((m) => m.team === teamId).length; }

  setOn(on) { if (on && !this.on) this.newMatch(1); this.on = !!on; return this.on; }
  setRounds(n) { this.rounds = Math.max(1, Math.min(50, n | 0 || this.cfg.rounds)); }
  reset() { this.members = {}; this.newMatch(1); }

  /** Comment đúng từ khoá vào đội → hiệu ứng, không thì null (để xử lý như lượt đoán). */
  joinFromText(user, text) {
    if (!this.on || !user?.id) return null;
    const teamId = this.keywordMap.get(normalize(text || ''));
    if (!teamId) return null;
    const cur = this.members[user.id];
    if (cur?.team === teamId) return [];
    // đã ghi điểm cho đội trong trận này thì không được đổi phe
    if (cur && this.mvp[user.id]) return [{ type: 'wg_team_join', by: pub(user), team: cur.team, locked: true }];
    this.members[user.id] = { ...pub(user), team: teamId };
    return [{ type: 'wg_team_join', by: pub(user), team: teamId, switched: !!cur }];
  }

  /** Người chưa có đội mà chơi → xếp vào đội ít người hơn. */
  ensureMember(user) {
    if (!this.on || !user?.id || this.members[user.id]) return [];
    const teamId = [...this.cfg.teams].sort((a, b) => this.count(a.id) - this.count(b.id))[0].id;
    this.members[user.id] = { ...pub(user), team: teamId };
    return [{ type: 'wg_team_join', by: pub(user), team: teamId, auto: true }];
  }

  teamOf(id) { return this.on ? this.members[id]?.team || null : null; }

  /** Cộng điểm cho đội của người chơi (nếu có đội). */
  addPoints(user, points, source) {
    const teamId = this.teamOf(user?.id);
    if (!teamId || points <= 0 || this.matchOver) return null;
    this.score[teamId] += points;
    this.mvp[user.id] = (this.mvp[user.id] || 0) + points;
    const m = this.members[user.id];
    if (user.name) m.name = user.name;
    return { type: 'wg_team_points', by: pub(user), team: teamId, points, source, score: { ...this.score } };
  }

  /** Gọi khi bắt đầu vòng mới. */
  onRoundStart() {
    if (!this.on) return;
    if (this.matchOver) this.newMatch();
    this.round++;
  }

  /** Gọi khi vòng kết thúc (trúng / hết giờ). Hết số vòng thì chốt trận. */
  onRoundEnd() {
    if (!this.on || this.round < this.rounds || this.matchOver) return [];
    const ranked = [...this.cfg.teams].sort((a, b) => this.score[b.id] - this.score[a.id]);
    const draw = ranked.length > 1 && this.score[ranked[0].id] === this.score[ranked[1].id];
    const mvpId = Object.entries(this.mvp).sort((a, b) => b[1] - a[1])[0]?.[0];
    const mvp = mvpId ? { ...pub(this.members[mvpId]), team: this.members[mvpId].team, points: this.mvp[mvpId] } : null;
    this.matchOver = { winner: draw ? null : ranked[0].id, score: { ...this.score }, mvp, matchNo: this.matchNo };
    return [{ type: 'wg_team_match', ...this.matchOver }];
  }

  snapshot() {
    if (!this.on) return { on: false };
    return {
      on: true,
      matchNo: this.matchNo,
      round: this.round,
      rounds: this.rounds,
      teams: this.cfg.teams.map((t) => ({ id: t.id, name: t.name, icon: t.icon, color: t.color, keyword: t.keywords[0], score: this.score[t.id], count: this.count(t.id) })),
      matchOver: this.matchOver,
      members: Object.fromEntries(Object.entries(this.members).map(([id, m]) => [id, m.team])),
    };
  }

  toJSON() {
    return { on: this.on, rounds: this.rounds, members: this.members, matchNo: this.matchNo, round: this.round, score: this.score, mvp: this.mvp, matchOver: this.matchOver };
  }

  load(s) {
    if (!s) return;
    this.on = !!s.on; this.rounds = s.rounds || this.rounds; this.members = s.members || {};
    this.matchNo = s.matchNo || 1; this.round = s.round || 0; this.mvp = s.mvp || {}; this.matchOver = s.matchOver || null;
    this.score = { ...Object.fromEntries(this.cfg.teams.map((t) => [t.id, 0])), ...(s.score || {}) };
  }
}

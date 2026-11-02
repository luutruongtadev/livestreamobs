import fs from 'node:fs';
import path from 'node:path';
import { createCommandMatcher } from './text.js';

/**
 * Logic game "Xây chùa": cộng công đức, lên cấp, bảng vàng.
 * Không phụ thuộc TikTok — nhận sự kiện đã chuẩn hoá, trả về danh sách
 * hiệu ứng để overlay hiển thị.
 */
export class Temple {
  constructor(config, { statePath, now = () => Date.now() } = {}) {
    this.config = config;
    this.statePath = statePath;
    this.now = now;
    this.matchCommand = createCommandMatcher(config.commands);
    this.levels = [...config.levels].sort((a, b) => a.merit - b.merit);
    this.giftTiers = [...config.giftTiers].sort((a, b) => a.minDiamonds - b.minDiamonds);
    this.lastComment = new Map(); // userId -> timestamp, chống spam công đức
    this.dirty = false;
    this.reset();
    if (statePath) this.load();
  }

  reset() {
    this.state = {
      total: 0,
      donors: {}, // id -> { id, name, avatar, merit, diamonds }
      counts: { likes: 0, comments: 0, shares: 0, follows: 0, gifts: 0, diamonds: 0, incense: 0, mo: 0, bell: 0 },
      startedAt: this.now(),
    };
    this.lastComment.clear();
    this.dirty = true;
  }

  // Dọn map cooldown để không phình bộ nhớ khi live dài
  pruneCooldowns() {
    const limit = this.now() - (this.config.commentCooldownSec ?? 0) * 1000;
    for (const [k, v] of this.lastComment) if (v < limit) this.lastComment.delete(k);
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      this.state = { ...this.state, ...raw, counts: { ...this.state.counts, ...(raw.counts || {}) } };
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[temple] Không đọc được state:', e.message);
    }
  }

  save() {
    if (!this.statePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const tmp = this.statePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, this.statePath);
    this.dirty = false;
  }

  levelIndexFor(total) {
    let idx = 0;
    for (let i = 0; i < this.levels.length; i++) if (total >= this.levels[i].merit) idx = i;
    return idx;
  }

  snapshot() {
    const { total, counts } = this.state;
    const level = this.levelIndexFor(total);
    const cur = this.levels[level];
    const next = this.levels[level + 1];
    const leaderboard = Object.values(this.state.donors)
      .sort((a, b) => b.merit - a.merit)
      .slice(0, 10);
    return {
      templeName: this.config.templeName,
      total,
      level,
      levelName: cur.name,
      maxLevel: this.levels.length - 1,
      levelFrom: cur.merit,
      levelTo: next ? next.merit : null,
      nextLevelName: next ? next.name : null,
      leaderboard,
      counts,
    };
  }

  addMerit(user, amount) {
    if (!amount) return [];
    const before = this.levelIndexFor(this.state.total);
    this.state.total += amount;
    if (user?.id) {
      const d = (this.state.donors[user.id] ||= { id: user.id, name: user.name, avatar: user.avatar, merit: 0, diamonds: 0 });
      d.merit += amount;
      if (user.name) d.name = user.name;
      if (user.avatar) d.avatar = user.avatar;
    }
    this.dirty = true;
    const after = this.levelIndexFor(this.state.total);
    const out = [];
    for (let l = before + 1; l <= after; l++) {
      out.push({ type: 'levelup', level: l, levelName: this.levels[l].name });
    }
    return out;
  }

  tierFor(diamonds) {
    let tier = this.giftTiers[0];
    for (const t of this.giftTiers) if (diamonds >= t.minDiamonds) tier = t;
    return tier;
  }

  /**
   * Xử lý một sự kiện chuẩn hoá. Trả về mảng hiệu ứng để broadcast.
   * ev: { type: 'like'|'comment'|'share'|'follow'|'gift'|'manual', user, ... }
   */
  handle(ev) {
    const m = this.config.merit;
    const user = ev.user || null;
    const c = this.state.counts;
    const effects = [];

    switch (ev.type) {
      case 'like': {
        const n = Math.max(1, Math.min(ev.count | 0 || 1, 1000));
        c.likes += n;
        c.mo += n;
        const merit = n * m.like;
        effects.push({ type: 'mo', user, count: n, merit, source: 'like' });
        effects.push(...this.addMerit(user, merit));
        break;
      }
      case 'comment': {
        c.comments++;
        const text = String(ev.text || '').slice(0, 200);
        const cmd = this.matchCommand(text);
        const t = this.now();
        const last = user?.id ? this.lastComment.get(user.id) : undefined;
        const onCooldown = last !== undefined && t - last < (this.config.commentCooldownSec ?? 0) * 1000;
        if (user?.id && !onCooldown) this.lastComment.set(user.id, t);
        const merit = onCooldown ? 0 : cmd ? m.command : m.comment;

        if (cmd) {
          const fx = { type: cmd.action, user, text, merit, source: 'comment' };
          if (cmd.action === 'mo') c.mo++;
          if (cmd.action === 'incense') c.incense++;
          if (cmd.action === 'bell') c.bell++;
          if (cmd.action === 'fortune') {
            const list = this.config.fortunes || [];
            fx.fortune = list[Math.floor(Math.random() * list.length)] || 'Tâm an vạn sự an.';
          }
          effects.push(fx);
        } else {
          effects.push({ type: 'chat', user, text, merit });
        }
        effects.push(...this.addMerit(user, merit));
        break;
      }
      case 'share': {
        c.shares++;
        c.bell++;
        effects.push({ type: 'bell', user, merit: m.share, source: 'share' });
        effects.push(...this.addMerit(user, m.share));
        break;
      }
      case 'follow': {
        c.follows++;
        effects.push({ type: 'follow', user, merit: m.follow });
        effects.push(...this.addMerit(user, m.follow));
        break;
      }
      case 'gift': {
        const repeat = Math.max(1, ev.repeatCount | 0 || 1);
        const unit = Math.max(0, Number(ev.diamonds) || 0);
        const diamonds = unit * repeat;
        const merit = Math.max(1, diamonds) * m.perDiamond;
        c.gifts += repeat;
        c.diamonds += diamonds;
        if (diamonds >= 10) c.incense++;
        const tier = this.tierFor(diamonds);
        if (user?.id) {
          const d = (this.state.donors[user.id] ||= { id: user.id, name: user.name, avatar: user.avatar, merit: 0, diamonds: 0 });
          d.diamonds += diamonds;
        }
        const giftName = this.config.giftNames?.[ev.giftName] || ev.giftName || 'Quà';
        effects.push({
          type: 'gift',
          user,
          giftName,
          giftImage: ev.giftImage || null,
          repeatCount: repeat,
          diamonds,
          merit,
          effect: tier?.effect || 'petals',
          verb: tier?.verb || 'cúng dường',
        });
        effects.push(...this.addMerit(user, merit));
        break;
      }
      case 'manual': {
        const merit = Number(ev.merit) || 0;
        effects.push({ type: 'manual', user, merit, text: ev.text || '' });
        effects.push(...this.addMerit(user, merit));
        break;
      }
      default:
        return [];
    }
    this.dirty = true;
    return effects;
  }
}

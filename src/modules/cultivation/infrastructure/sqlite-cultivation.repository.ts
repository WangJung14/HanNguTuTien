import type Database from 'better-sqlite3';
import type {
  BreakthroughAttempt, CultivationProfile, CultivationRepository, XpAward, XpLedgerEntry,
} from '../domain/cultivation.types.js';

type ProfileRow = Omit<CultivationProfile, 'roleSyncPending'> & { roleSyncPending: number };
type AttemptRow = Omit<BreakthroughAttempt, 'questions'> & { questionsJson: string };

const PROFILE_SELECT = `SELECT guild_id AS guildId, user_id AS userId, total_xp AS totalXp,
  major_index AS majorIndex, role_sync_pending AS roleSyncPending,
  created_at AS createdAt, updated_at AS updatedAt FROM cultivation_profiles`;
const ATTEMPT_SELECT = `SELECT id, guild_id AS guildId, user_id AS userId,
  from_major AS fromMajor, to_major AS toMajor, deck_id AS deckId, status,
  current_index AS currentIndex, correct_count AS correctCount, questions_json AS questionsJson,
  cooldown_until AS cooldownUntil, message_id AS messageId, created_at AS createdAt,
  updated_at AS updatedAt, completed_at AS completedAt FROM breakthrough_attempts`;

function profile(row: ProfileRow): CultivationProfile {
  return { ...row, roleSyncPending: row.roleSyncPending === 1 };
}
function attempt(row: AttemptRow): BreakthroughAttempt {
  const { questionsJson, ...rest } = row;
  return { ...rest, questions: JSON.parse(questionsJson) as BreakthroughAttempt['questions'] };
}

export class SqliteCultivationRepository implements CultivationRepository {
  constructor(private readonly sqlite: Database.Database) {}

  getOrCreateProfile(guildId: string, userId: string, now: string): CultivationProfile {
    this.sqlite.prepare(`INSERT OR IGNORE INTO cultivation_profiles
      (guild_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run(guildId, userId, now, now);
    const row = this.sqlite.prepare(`${PROFILE_SELECT} WHERE guild_id = ? AND user_id = ?`)
      .get(guildId, userId) as ProfileRow;
    return profile(row);
  }

  addXp(guildId: string, userId: string, amount: number, source: string, rewardKey: string,
    sessionId: string | null, earnedDate: string, now: string, dailyCap: number,
    limits?: { scopedDailyCap?: number; scopedSources?: string[]; maxTotalXp?: number }): XpAward {
    return this.sqlite.transaction(() => {
      const current = this.getOrCreateProfile(guildId, userId, now);
      const existing = this.sqlite.prepare('SELECT amount FROM xp_ledger WHERE reward_key = ?')
        .get(rewardKey) as { amount: number } | undefined;
      if (existing) return { awarded: 0, duplicate: true, capped: false, totalXp: current.totalXp };
      const earned = this.sqlite.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM xp_ledger
        WHERE guild_id = ? AND user_id = ? AND earned_date = ?`)
        .get(guildId, userId, earnedDate) as { total: number };
      let available = dailyCap - earned.total;
      if (limits?.scopedDailyCap !== undefined && limits.scopedSources?.length) {
        const placeholders = limits.scopedSources.map(() => '?').join(', ');
        const scoped = this.sqlite.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM xp_ledger
          WHERE guild_id = ? AND user_id = ? AND earned_date = ? AND source IN (${placeholders})`)
          .get(guildId, userId, earnedDate, ...limits.scopedSources) as { total: number };
        available = Math.min(available, limits.scopedDailyCap - scoped.total);
      }
      if (limits?.maxTotalXp !== undefined) available = Math.min(available, limits.maxTotalXp - current.totalXp);
      const awarded = Math.max(0, Math.min(amount, available));
      this.sqlite.prepare(`INSERT INTO xp_ledger
        (guild_id, user_id, amount, source, reward_key, session_id, earned_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(guildId, userId, awarded, source, rewardKey, sessionId, earnedDate, now);
      if (awarded === 0) return { awarded: 0, duplicate: false, capped: true, totalXp: current.totalXp };
      this.sqlite.prepare(`UPDATE cultivation_profiles SET total_xp = total_xp + ?, updated_at = ?
        WHERE guild_id = ? AND user_id = ?`).run(awarded, now, guildId, userId);
      return { awarded, duplicate: false, capped: awarded < amount, totalXp: current.totalXp + awarded };
    })();
  }

  listLedger(guildId: string, userId: string, limit: number): XpLedgerEntry[] {
    return this.sqlite.prepare(`SELECT id, guild_id AS guildId, user_id AS userId, amount,
      source, reward_key AS rewardKey, session_id AS sessionId, earned_date AS earnedDate,
      created_at AS createdAt FROM xp_ledger WHERE guild_id = ? AND user_id = ?
      ORDER BY id DESC LIMIT ?`).all(guildId, userId, limit) as XpLedgerEntry[];
  }
  getAttempt(id: string): BreakthroughAttempt | null {
    const row = this.sqlite.prepare(`${ATTEMPT_SELECT} WHERE id = ?`).get(id) as AttemptRow | undefined;
    return row ? attempt(row) : null;
  }
  findActiveAttempt(guildId: string, userId: string): BreakthroughAttempt | null {
    const row = this.sqlite.prepare(`${ATTEMPT_SELECT} WHERE guild_id = ? AND user_id = ? AND status = 'active'`)
      .get(guildId, userId) as AttemptRow | undefined;
    return row ? attempt(row) : null;
  }
  latestFailedAttempt(guildId: string, userId: string): BreakthroughAttempt | null {
    const row = this.sqlite.prepare(`${ATTEMPT_SELECT} WHERE guild_id = ? AND user_id = ? AND status = 'failed'
      ORDER BY completed_at DESC LIMIT 1`).get(guildId, userId) as AttemptRow | undefined;
    return row ? attempt(row) : null;
  }
  createAttempt(value: BreakthroughAttempt): void {
    this.sqlite.prepare(`INSERT INTO breakthrough_attempts
      (id, guild_id, user_id, from_major, to_major, deck_id, status, current_index,
       correct_count, questions_json, cooldown_until, message_id, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(value.id, value.guildId, value.userId, value.fromMajor, value.toMajor, value.deckId,
        value.status, value.currentIndex, value.correctCount, JSON.stringify(value.questions),
        value.cooldownUntil, value.messageId, value.createdAt, value.updatedAt, value.completedAt);
  }
  bindAttemptMessage(id: string, messageId: string, now: string): boolean {
    return this.sqlite.prepare(`UPDATE breakthrough_attempts SET message_id = ?, updated_at = ?
      WHERE id = ? AND status = 'active'`).run(messageId, now, id).changes === 1;
  }
  answerAttempt(id: string, index: number, answerText: string, correct: boolean, now: string): BreakthroughAttempt | null {
    return this.sqlite.transaction(() => {
      const current = this.getAttempt(id);
      if (!current || current.status !== 'active' || current.currentIndex !== index || current.questions[index]?.answer !== null) return null;
      current.questions[index] = { ...current.questions[index]!, answer: answerText, correct };
      const changed = this.sqlite.prepare(`UPDATE breakthrough_attempts SET questions_json = ?,
        correct_count = correct_count + ?, updated_at = ? WHERE id = ? AND status = 'active' AND current_index = ?`)
        .run(JSON.stringify(current.questions), correct ? 1 : 0, now, id, index).changes;
      return changed === 1 ? this.getAttempt(id) : null;
    })();
  }
  advanceAttempt(id: string, index: number, now: string, cooldownUntil: string): BreakthroughAttempt | null {
    return this.sqlite.transaction(() => {
      const current = this.getAttempt(id);
      if (!current || current.status !== 'active' || current.currentIndex !== index || current.questions[index]?.answer === null) return null;
      const last = index + 1 >= current.questions.length;
      const passed = last && current.correctCount >= 8;
      const status = last ? (passed ? 'passed' : 'failed') : 'active';
      if (passed) {
        const promoted = this.sqlite.prepare(`UPDATE cultivation_profiles
          SET major_index = ?, role_sync_pending = 1, updated_at = ?
          WHERE guild_id = ? AND user_id = ? AND major_index = ?`)
          .run(current.toMajor, now, current.guildId, current.userId, current.fromMajor).changes;
        if (promoted !== 1) return null;
      }
      const changed = this.sqlite.prepare(`UPDATE breakthrough_attempts SET current_index = ?, status = ?,
        cooldown_until = ?, updated_at = ?, completed_at = ?
        WHERE id = ? AND status = 'active' AND current_index = ?`)
        .run(index + 1, status, last && !passed ? cooldownUntil : null, now, last ? now : null, id, index).changes;
      return changed === 1 ? this.getAttempt(id) : null;
    })();
  }
  promote(guildId: string, userId: string, expectedMajor: number, newMajor: number, now: string): boolean {
    return this.sqlite.prepare(`UPDATE cultivation_profiles SET major_index = ?, role_sync_pending = 1, updated_at = ?
      WHERE guild_id = ? AND user_id = ? AND major_index = ?`)
      .run(newMajor, now, guildId, userId, expectedMajor).changes === 1;
  }
  setRoleSyncPending(guildId: string, userId: string, pending: boolean, now: string): void {
    this.getOrCreateProfile(guildId, userId, now);
    this.sqlite.prepare(`UPDATE cultivation_profiles SET role_sync_pending = ?, updated_at = ?
      WHERE guild_id = ? AND user_id = ?`).run(pending ? 1 : 0, now, guildId, userId);
  }
  setRealmRole(guildId: string, majorIndex: number, roleId: string, now: string): void {
    this.sqlite.prepare(`INSERT INTO guild_realm_roles(guild_id, major_index, role_id, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, major_index) DO UPDATE SET role_id = excluded.role_id, updated_at = excluded.updated_at`)
      .run(guildId, majorIndex, roleId, now);
  }
  removeRealmRole(guildId: string, majorIndex: number): void {
    this.sqlite.prepare('DELETE FROM guild_realm_roles WHERE guild_id = ? AND major_index = ?').run(guildId, majorIndex);
  }
  getRealmRoles(guildId: string): Map<number, string> {
    const rows = this.sqlite.prepare('SELECT major_index AS majorIndex, role_id AS roleId FROM guild_realm_roles WHERE guild_id = ?')
      .all(guildId) as { majorIndex: number; roleId: string }[];
    return new Map(rows.map((row) => [row.majorIndex, row.roleId]));
  }

  getXpAnnouncementChannel(guildId: string): string | null {
    const row = this.sqlite.prepare('SELECT channel_id AS channelId FROM xp_announcement_channels WHERE guild_id = ?')
      .get(guildId) as { channelId: string } | undefined;
    return row?.channelId ?? null;
  }

  setXpAnnouncementChannel(guildId: string, channelId: string | null, now: string): void {
    if (channelId === null) {
      this.sqlite.prepare('DELETE FROM xp_announcement_channels WHERE guild_id = ?').run(guildId);
      return;
    }
    this.sqlite.prepare(`INSERT INTO xp_announcement_channels (guild_id,channel_id,updated_at)
      VALUES (?,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,updated_at=excluded.updated_at`)
      .run(guildId, channelId, now);
  }

  listAttempts(guildId: string, userId: string, limit: number): BreakthroughAttempt[] {
    return (this.sqlite.prepare(`${ATTEMPT_SELECT} WHERE guild_id = ? AND user_id = ?
      ORDER BY created_at DESC LIMIT ?`).all(guildId, userId, limit) as AttemptRow[]).map(attempt);
  }
}

import type { Sql } from 'postgres';
import { scoreAnswer } from '../domain/score-rules.js';
import type {
  MountainAnswer, MountainMatch, MountainPlayer, MountainQuestion, MountainRepository, MountainRound,
} from '../domain/mountain.types.js';

type RoundRow = Omit<MountainRound, 'question'> & { questionJson: string };
const MATCH_COLUMNS = `id,guild_id AS "guildId",channel_id AS "channelId",owner_id AS "ownerId",
  kind,deck_id::text AS "deckId",deck_name AS "deckName",status,current_round AS "currentRound",
  message_id AS "messageId",round_started_at AS "roundStartedAt",round_deadline AS "roundDeadline",
  created_at AS "createdAt",updated_at AS "updatedAt"`;
const PLAYER_COLUMNS = `match_id AS "matchId",user_id AS "userId",display_name AS "displayName",
  score,correct_count AS "correctCount",total_time_ms AS "totalTimeMs",
  completed_rounds AS "completedRounds",xp_awarded AS "xpAwarded",reward_date AS "rewardDate",
  joined_at AS "joinedAt"`;
function mapRound(row: RoundRow | undefined): MountainRound | null {
  if (!row) return null;
  const { questionJson, ...rest } = row;
  return { ...rest, question: JSON.parse(questionJson) as MountainQuestion };
}
function mapMatch(row: MountainMatch | undefined): MountainMatch | null {
  if (!row) return null;
  const deckId = Number(row.deckId);
  if (!Number.isSafeInteger(deckId)) throw new Error('PostgreSQL deck ID exceeds the supported safe integer range.');
  return { ...row, deckId };
}

export class PostgresMountainRepository implements MountainRepository {
  constructor(private readonly sql: Sql) {}

  async create(match: MountainMatch, questions: MountainQuestion[], displayName: string): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`${match.guildId}:${match.ownerId}`},0))`;
      if (await this.findPlayerActiveWith(transaction, match.guildId, match.ownerId)) {
        throw new Error('UNIQUE constraint failed: active mountain player');
      }
      await transaction`
        INSERT INTO mountain_matches (
          id,guild_id,channel_id,owner_id,kind,deck_id,deck_name,status,current_round,created_at,updated_at
        ) VALUES (
          ${match.id},${match.guildId},${match.channelId},${match.ownerId},${match.kind},
          ${match.deckId},${match.deckName},${match.status},0,${match.createdAt},${match.updatedAt}
        )
      `;
      await transaction`
        INSERT INTO mountain_players (match_id,user_id,display_name,joined_at)
        VALUES (${match.id},${match.ownerId},${displayName},${match.createdAt})
      `;
      for (const [index, question] of questions.entries()) {
        await transaction`
          INSERT INTO mountain_rounds (match_id,round_index,question_json)
          VALUES (${match.id},${index},${JSON.stringify(question)})
        `;
      }
    });
  }

  async get(id: string): Promise<MountainMatch | null> {
    const rows = await this.sql<MountainMatch[]>`
      SELECT ${this.sql.unsafe(MATCH_COLUMNS)} FROM mountain_matches WHERE id=${id}
    `;
    return mapMatch(rows[0]);
  }

  async findChannel(guildId: string, channelId: string): Promise<MountainMatch | null> {
    const rows = await this.sql<MountainMatch[]>`
      SELECT ${this.sql.unsafe(MATCH_COLUMNS)} FROM mountain_matches
      WHERE guild_id=${guildId} AND channel_id=${channelId} AND kind='multi' AND status IN ('WAITING','ACTIVE')
    `;
    return mapMatch(rows[0]);
  }

  async findPlayerActive(guildId: string, userId: string): Promise<MountainMatch | null> {
    return this.findPlayerActiveWith(this.sql, guildId, userId);
  }

  private async findPlayerActiveWith(sql: Sql, guildId: string, userId: string): Promise<MountainMatch | null> {
    const rows = await sql<MountainMatch[]>`
      SELECT ${sql.unsafe(MATCH_COLUMNS)} FROM mountain_matches
      WHERE guild_id=${guildId} AND status IN ('WAITING','ACTIVE')
        AND id IN (SELECT match_id FROM mountain_players WHERE user_id=${userId}) LIMIT 1
    `;
    return mapMatch(rows[0]);
  }

  async players(id: string): Promise<MountainPlayer[]> {
    return this.sql<MountainPlayer[]>`
      SELECT ${this.sql.unsafe(PLAYER_COLUMNS)} FROM mountain_players
      WHERE match_id=${id} ORDER BY score DESC,correct_count DESC,total_time_ms ASC,joined_at ASC
    `;
  }

  async getRound(id: string, index: number): Promise<MountainRound | null> {
    const rows = await this.sql<RoundRow[]>`
      SELECT match_id AS "matchId",round_index AS "roundIndex",question_json AS "questionJson",
        opened_at AS "openedAt",deadline,closed_at AS "closedAt"
      FROM mountain_rounds WHERE match_id=${id} AND round_index=${index}
    `;
    return mapRound(rows[0]);
  }

  async join(id: string, guildId: string, userId: string, name: string, now: string, max: number): Promise<boolean> {
    return this.sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`${guildId}:${userId}`},0))`;
      const matchRows = await transaction`SELECT guild_id,status FROM mountain_matches WHERE id=${id} FOR UPDATE`;
      if (!matchRows[0] || matchRows[0].guild_id !== guildId || matchRows[0].status !== 'WAITING') return false;
      const active = await this.findPlayerActiveWith(transaction, guildId, userId);
      if (active) return false;
      const counts = await transaction<{ count: number }[]>`
        SELECT count(*)::int AS count FROM mountain_players WHERE match_id=${id}
      `;
      if ((counts[0]?.count ?? 0) >= max) return false;
      const inserted = await transaction`
        INSERT INTO mountain_players (match_id,user_id,display_name,joined_at)
        VALUES (${id},${userId},${name},${now}) ON CONFLICT DO NOTHING RETURNING user_id
      `;
      return inserted.length === 1;
    });
  }

  async bind(id: string, messageId: string, now: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE mountain_matches SET message_id=${messageId},updated_at=${now}
      WHERE id=${id} AND status IN ('WAITING','ACTIVE') RETURNING id
    `;
    return rows.length === 1;
  }

  async activate(id: string, now: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE mountain_matches SET status='ACTIVE',updated_at=${now}
      WHERE id=${id} AND status='WAITING' RETURNING id
    `;
    return rows.length === 1;
  }

  async openRound(id: string, index: number, opened: string, deadline: string): Promise<boolean> {
    return this.sql.begin(async (transaction) => {
      const matches = await transaction`
        UPDATE mountain_matches SET current_round=${index},round_started_at=${opened},
          round_deadline=${deadline},updated_at=${opened}
        WHERE id=${id} AND status='ACTIVE' AND current_round=${index}
          AND round_deadline IS NULL RETURNING id
      `;
      if (matches.length !== 1) return false;
      const rounds = await transaction`
        UPDATE mountain_rounds SET opened_at=${opened},deadline=${deadline}
        WHERE match_id=${id} AND round_index=${index} AND opened_at IS NULL RETURNING match_id
      `;
      if (rounds.length !== 1) throw new Error('Mountain round and match state are inconsistent.');
      return true;
    });
  }

  async answer(id: string, index: number, userId: string, option: number, received: Date): Promise<MountainAnswer | null> {
    return this.sql.begin(async (transaction) => {
      const rows = await transaction<MountainMatch[]>`
        SELECT ${transaction.unsafe(MATCH_COLUMNS)} FROM mountain_matches
        WHERE id=${id} AND status='ACTIVE' AND current_round=${index} FOR UPDATE
      `;
      const match = mapMatch(rows[0]);
      const round = mapRound((await transaction<RoundRow[]>`
        SELECT match_id AS "matchId",round_index AS "roundIndex",question_json AS "questionJson",
          opened_at AS "openedAt",deadline,closed_at AS "closedAt"
        FROM mountain_rounds WHERE match_id=${id} AND round_index=${index}
      `)[0]);
      if (!match || !round?.openedAt || !round.deadline || received.toISOString() > round.deadline ||
          option < 0 || option >= round.question.options.length) return null;
      const players = await transaction`SELECT 1 FROM mountain_players WHERE match_id=${id} AND user_id=${userId}`;
      if (!players.length) return null;
      const elapsedMs = Math.max(0, received.getTime() - Date.parse(round.openedAt));
      const correct = option === round.question.correctIndex;
      const score = scoreAnswer(elapsedMs, correct);
      const answeredAt = received.toISOString();
      const inserted = await transaction`
        INSERT INTO mountain_answers (
          match_id,round_index,user_id,option_index,correct,elapsed_ms,score,answered_at
        ) VALUES (${id},${index},${userId},${option},${correct ? 1 : 0},${elapsedMs},${score},${answeredAt})
        ON CONFLICT DO NOTHING RETURNING user_id
      `;
      if (!inserted.length) return null;
      await transaction`
        UPDATE mountain_players SET score=score+${score},correct_count=correct_count+${correct ? 1 : 0},
          total_time_ms=total_time_ms+${elapsedMs},completed_rounds=completed_rounds+1
        WHERE match_id=${id} AND user_id=${userId}
      `;
      return { matchId: id, roundIndex: index, userId, optionIndex: option, correct, elapsedMs, score, answeredAt };
    });
  }

  async closeAndAdvance(id: string, index: number, now: string): Promise<MountainMatch | null> {
    const changed = await this.sql.begin(async (transaction) => {
      const matches = await transaction`
        SELECT id FROM mountain_matches
        WHERE id=${id} AND status='ACTIVE' AND current_round=${index} FOR UPDATE
      `;
      if (!matches.length) return false;
      await transaction`
        UPDATE mountain_rounds SET closed_at=${now}
        WHERE match_id=${id} AND round_index=${index} AND closed_at IS NULL
      `;
      await transaction`
        UPDATE mountain_players p SET completed_rounds=completed_rounds+1
        WHERE p.match_id=${id} AND NOT EXISTS (
          SELECT 1 FROM mountain_answers a
          WHERE a.match_id=${id} AND a.round_index=${index} AND a.user_id=p.user_id
        )
      `;
      const last = index >= 9;
      const updated = await transaction`
        UPDATE mountain_matches SET status=${last ? 'COMPLETED' : 'ACTIVE'},
          current_round=${last ? index : index + 1},round_started_at=NULL,round_deadline=NULL,updated_at=${now}
        WHERE id=${id} AND status='ACTIVE' AND current_round=${index} RETURNING id
      `;
      return updated.length === 1;
    });
    return changed ? this.get(id) : null;
  }

  async cancel(id: string, status: 'CANCELLED' | 'EXPIRED', now: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE mountain_matches SET status=${status},round_deadline=NULL,updated_at=${now}
      WHERE id=${id} AND status IN ('WAITING','ACTIVE') RETURNING id
    `;
    return rows.length === 1;
  }

  async due(now: string): Promise<MountainMatch[]> {
    const rows = await this.sql<MountainMatch[]>`
      SELECT ${this.sql.unsafe(MATCH_COLUMNS)} FROM mountain_matches
      WHERE status='ACTIVE' AND round_deadline IS NOT NULL AND round_deadline<=${now}
    `;
    return rows.map((row) => mapMatch(row)!);
  }

  async expiredWaiting(cutoff: string): Promise<MountainMatch[]> {
    const rows = await this.sql<MountainMatch[]>`
      SELECT ${this.sql.unsafe(MATCH_COLUMNS)} FROM mountain_matches
      WHERE status='WAITING' AND created_at<=${cutoff}
    `;
    return rows.map((row) => mapMatch(row)!);
  }

  async cancelActiveOnRestart(now: string): Promise<number> {
    const rows = await this.sql`
      UPDATE mountain_matches SET status='CANCELLED',round_deadline=NULL,updated_at=${now}
      WHERE status='ACTIVE' RETURNING id
    `;
    return rows.length;
  }

  async markXp(id: string, userId: string, amount: number, date: string): Promise<void> {
    await this.sql`
      UPDATE mountain_players SET xp_awarded=${amount},reward_date=${date}
      WHERE match_id=${id} AND user_id=${userId} AND xp_awarded=0
    `;
  }

  async rewardedCount(guildId: string, userId: string, date: string): Promise<number> {
    const rows = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM mountain_players p
      JOIN mountain_matches m ON m.id=p.match_id
      WHERE m.guild_id=${guildId} AND p.user_id=${userId} AND p.reward_date=${date} AND p.xp_awarded>0
    `;
    return rows[0]?.count ?? 0;
  }

  async leaderboard(guildId: string) {
    return this.sql<{userId:string;displayName:string;score:number;correctCount:number;totalTimeMs:number;matches:number}[]>`
      SELECT p.user_id AS "userId",MAX(p.display_name) AS "displayName",SUM(p.score)::int AS score,
        SUM(p.correct_count)::int AS "correctCount",SUM(p.total_time_ms)::int AS "totalTimeMs",
        count(*)::int AS matches
      FROM mountain_players p JOIN mountain_matches m ON m.id=p.match_id
      WHERE m.guild_id=${guildId} AND m.status='COMPLETED'
      GROUP BY p.user_id ORDER BY score DESC,"correctCount" DESC,"totalTimeMs" ASC LIMIT 20
    `;
  }

  async history(guildId: string, userId: string) {
    return this.sql<{id:string;kind:string;status:string;deckName:string;score:number;correctCount:number;totalTimeMs:number;xpAwarded:number;createdAt:string}[]>`
      SELECT m.id,m.kind,m.status,m.deck_name AS "deckName",p.score,
        p.correct_count AS "correctCount",p.total_time_ms AS "totalTimeMs",
        p.xp_awarded AS "xpAwarded",m.created_at AS "createdAt"
      FROM mountain_players p JOIN mountain_matches m ON m.id=p.match_id
      WHERE m.guild_id=${guildId} AND p.user_id=${userId}
      ORDER BY m.created_at DESC LIMIT 10
    `;
  }
}

import type { Sql } from 'postgres';
import type {
  PackQuestion, PveHistoryRow, PveLeaderboardRow, PvePlayer, PveRepository, PveRound, PveRun,
} from '../domain/pve.types.js';

type RoundRow = Omit<PveRound, 'question'> & { questionJson: string };
const RUN_COLUMNS = `id,kind,guild_id AS "guildId",channel_id AS "channelId",owner_id AS "ownerId",
  level,status,current_round AS "currentRound",correct_count AS "correctCount",score,
  boss_hp AS "bossHp",boss_max_hp AS "bossMaxHp",message_id AS "messageId",
  round_started_at AS "roundStartedAt",round_deadline AS "roundDeadline",week_key AS "weekKey",
  created_at AS "createdAt",updated_at AS "updatedAt",completed_at AS "completedAt"`;
const PLAYER_COLUMNS = `run_id AS "runId",user_id AS "userId",display_name AS "displayName",
  correct_count AS "correctCount",answered_count AS "answeredCount",damage,
  completed_rounds AS "completedRounds",xp_awarded AS "xpAwarded",joined_at AS "joinedAt"`;
function mapRound(row: RoundRow | undefined): PveRound | null {
  if (!row) return null;
  const { questionJson, ...rest } = row;
  return { ...rest, question: JSON.parse(questionJson) as PackQuestion };
}

export class PostgresPveRepository implements PveRepository {
  constructor(private readonly sql: Sql) {}

  async get(id: string): Promise<PveRun | null> {
    const rows = await this.sql<PveRun[]>`SELECT ${this.sql.unsafe(RUN_COLUMNS)} FROM pve_runs WHERE id=${id}`;
    return rows[0] ?? null;
  }

  async players(id: string): Promise<PvePlayer[]> {
    return this.sql<PvePlayer[]>`
      SELECT ${this.sql.unsafe(PLAYER_COLUMNS)} FROM pve_players WHERE run_id=${id}
      ORDER BY damage DESC,correct_count DESC,answered_count DESC,joined_at ASC
    `;
  }

  async round(id: string, index: number): Promise<PveRound | null> {
    const rows = await this.sql<RoundRow[]>`
      SELECT run_id AS "runId",round_index AS "roundIndex",question_json AS "questionJson",
        opened_at AS "openedAt",deadline,closed_at AS "closedAt"
      FROM pve_rounds WHERE run_id=${id} AND round_index=${index}
    `;
    return mapRound(rows[0]);
  }

  async activeFor(guild: string, user: string): Promise<PveRun | null> {
    const rows = await this.sql<PveRun[]>`
      SELECT r.id,r.kind,r.guild_id AS "guildId",r.channel_id AS "channelId",r.owner_id AS "ownerId",
        r.level,r.status,r.current_round AS "currentRound",r.correct_count AS "correctCount",r.score,
        r.boss_hp AS "bossHp",r.boss_max_hp AS "bossMaxHp",r.message_id AS "messageId",
        r.round_started_at AS "roundStartedAt",r.round_deadline AS "roundDeadline",r.week_key AS "weekKey",
        r.created_at AS "createdAt",r.updated_at AS "updatedAt",r.completed_at AS "completedAt"
      FROM pve_runs r JOIN pve_players p ON p.run_id=r.id
      WHERE r.guild_id=${guild} AND p.user_id=${user} AND r.status IN ('WAITING','ACTIVE') LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async bossChannel(guild: string, channel: string): Promise<PveRun | null> {
    const rows = await this.sql<PveRun[]>`
      SELECT ${this.sql.unsafe(RUN_COLUMNS)} FROM pve_runs
      WHERE guild_id=${guild} AND channel_id=${channel} AND kind='boss' AND status IN ('WAITING','ACTIVE')
    `;
    return rows[0] ?? null;
  }

  async bossWeek(guild: string, week: string): Promise<PveRun | null> {
    const rows = await this.sql<PveRun[]>`
      SELECT ${this.sql.unsafe(RUN_COLUMNS)} FROM pve_runs WHERE guild_id=${guild} AND week_key=${week} AND kind='boss'
    `;
    return rows[0] ?? null;
  }

  async create(run: PveRun, questions: PackQuestion[], name: string): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`${run.guildId}:${run.ownerId}`},0))`;
      if (await this.activeForWith(transaction, run.guildId, run.ownerId)) throw new Error('UNIQUE active pve player');
      await transaction`
        INSERT INTO pve_runs (
          id,kind,guild_id,channel_id,owner_id,level,status,current_round,week_key,created_at,updated_at
        ) VALUES (
          ${run.id},${run.kind},${run.guildId},${run.channelId},${run.ownerId},${run.level},
          ${run.status},0,${run.weekKey},${run.createdAt},${run.updatedAt}
        )
      `;
      await transaction`
        INSERT INTO pve_players (run_id,user_id,display_name,joined_at)
        VALUES (${run.id},${run.ownerId},${name},${run.createdAt})
      `;
      for (const [index, question] of questions.entries()) {
        await transaction`
          INSERT INTO pve_rounds (run_id,round_index,question_json)
          VALUES (${run.id},${index},${JSON.stringify(question)})
        `;
      }
    });
  }

  private async activeForWith(sql: Sql, guild: string, user: string): Promise<PveRun | null> {
    const rows = await sql<PveRun[]>`
      SELECT r.id,r.kind,r.guild_id AS "guildId",r.channel_id AS "channelId",r.owner_id AS "ownerId",
        r.level,r.status,r.current_round AS "currentRound",r.correct_count AS "correctCount",r.score,
        r.boss_hp AS "bossHp",r.boss_max_hp AS "bossMaxHp",r.message_id AS "messageId",
        r.round_started_at AS "roundStartedAt",r.round_deadline AS "roundDeadline",r.week_key AS "weekKey",
        r.created_at AS "createdAt",r.updated_at AS "updatedAt",r.completed_at AS "completedAt"
      FROM pve_runs r JOIN pve_players p ON p.run_id=r.id
      WHERE r.guild_id=${guild} AND p.user_id=${user} AND r.status IN ('WAITING','ACTIVE') LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async join(id: string, guild: string, user: string, name: string, max: number, now: string): Promise<boolean> {
    return this.sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`${guild}:${user}`},0))`;
      const runs = await transaction`SELECT guild_id,status,kind FROM pve_runs WHERE id=${id} FOR UPDATE`;
      if (!runs[0] || runs[0].guild_id !== guild || runs[0].status !== 'WAITING') return false;
      if (await this.activeForWith(transaction, guild, user)) return false;
      const counts = await transaction<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pve_players WHERE run_id=${id}
      `;
      if ((counts[0]?.count ?? 0) >= max) return false;
      const inserted = await transaction`
        INSERT INTO pve_players (run_id,user_id,display_name,joined_at)
        VALUES (${id},${user},${name},${now}) ON CONFLICT DO NOTHING RETURNING user_id
      `;
      return inserted.length === 1;
    });
  }

  async bind(id: string, messageId: string, now: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE pve_runs SET message_id=${messageId},updated_at=${now}
      WHERE id=${id} AND status IN ('WAITING','ACTIVE') RETURNING id
    `;
    return rows.length === 1;
  }

  async activateBoss(id: string, hp: number, now: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE pve_runs SET status='ACTIVE',boss_hp=${hp},boss_max_hp=${hp},updated_at=${now}
      WHERE id=${id} AND status='WAITING' RETURNING id
    `;
    return rows.length === 1;
  }

  async open(id: string, index: number, start: string, deadline: string): Promise<boolean> {
    return this.sql.begin(async (transaction) => {
      const runs = await transaction`
        UPDATE pve_runs SET current_round=${index},round_started_at=${start},
          round_deadline=${deadline},updated_at=${start}
        WHERE id=${id} AND status='ACTIVE' AND round_deadline IS NULL RETURNING id
      `;
      if (!runs.length) return false;
      const rounds = await transaction`
        UPDATE pve_rounds SET opened_at=${start},deadline=${deadline}
        WHERE run_id=${id} AND round_index=${index} AND opened_at IS NULL RETURNING run_id
      `;
      if (!rounds.length) throw new Error('PvE round and run state are inconsistent.');
      return true;
    });
  }

  async answer(id: string, index: number, user: string, option: number, received: Date) {
    return this.sql.begin(async (transaction) => {
      const runs = await transaction<PveRun[]>`
        SELECT ${transaction.unsafe(RUN_COLUMNS)} FROM pve_runs
        WHERE id=${id} AND status='ACTIVE' AND current_round=${index} FOR UPDATE
      `;
      const run = runs[0];
      const round = mapRound((await transaction<RoundRow[]>`
        SELECT run_id AS "runId",round_index AS "roundIndex",question_json AS "questionJson",
          opened_at AS "openedAt",deadline,closed_at AS "closedAt"
        FROM pve_rounds WHERE run_id=${id} AND round_index=${index}
      `)[0]);
      if (!run || !round?.openedAt || !round.deadline || received.toISOString() > round.deadline ||
          option < 0 || option >= round.question.options.length) return null;
      const players = await transaction`SELECT 1 FROM pve_players WHERE run_id=${id} AND user_id=${user}`;
      if (!players.length) return null;
      const correct = option === round.question.correctIndex;
      const inserted = await transaction`
        INSERT INTO pve_answers (run_id,round_index,user_id,option_index,correct,answered_at)
        VALUES (${id},${index},${user},${option},${correct ? 1 : 0},${received.toISOString()})
        ON CONFLICT DO NOTHING RETURNING user_id
      `;
      if (!inserted.length) return null;
      const damage = run.kind === 'boss' && correct ? 10 : 0;
      await transaction`
        UPDATE pve_players SET answered_count=answered_count+1,completed_rounds=completed_rounds+1,
          correct_count=correct_count+${correct ? 1 : 0},damage=damage+${damage}
        WHERE run_id=${id} AND user_id=${user}
      `;
      if (run.kind === 'secret') {
        await transaction`
          UPDATE pve_runs SET correct_count=correct_count+${correct ? 1 : 0},
            score=score+${correct ? 100 : 0} WHERE id=${id}
        `;
      } else if (damage) {
        await transaction`UPDATE pve_runs SET boss_hp=GREATEST(0,boss_hp-${damage}) WHERE id=${id}`;
      }
      return { correct, damage, question: round.question };
    });
  }

  async close(id: string, index: number, now: string, total: number): Promise<PveRun | null> {
    const updated = await this.sql.begin(async (transaction) => {
      const rows = await transaction<PveRun[]>`
        SELECT ${transaction.unsafe(RUN_COLUMNS)} FROM pve_runs
        WHERE id=${id} AND status='ACTIVE' AND current_round=${index} FOR UPDATE
      `;
      const run = rows[0];
      if (!run) return false;
      await transaction`
        UPDATE pve_rounds SET closed_at=${now}
        WHERE run_id=${id} AND round_index=${index} AND closed_at IS NULL
      `;
      await transaction`
        UPDATE pve_players p SET completed_rounds=completed_rounds+1
        WHERE p.run_id=${id} AND NOT EXISTS (
          SELECT 1 FROM pve_answers a
          WHERE a.run_id=${id} AND a.round_index=${index} AND a.user_id=p.user_id
        )
      `;
      const last = index + 1 >= total;
      if (last) {
        const status = run.kind === 'secret'
          ? (run.correctCount >= 12 ? 'COMPLETED' : 'FAILED')
          : (run.bossHp === 0 ? 'COMPLETED' : 'FAILED');
        await transaction`
          UPDATE pve_runs SET status=${status},round_started_at=NULL,round_deadline=NULL,
            completed_at=${now},updated_at=${now} WHERE id=${id}
        `;
      } else {
        await transaction`
          UPDATE pve_runs SET current_round=${index + 1},round_started_at=NULL,
            round_deadline=NULL,updated_at=${now} WHERE id=${id}
        `;
      }
      return true;
    });
    return updated ? this.get(id) : null;
  }

  async cancel(id: string, now: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE pve_runs SET status='CANCELLED',round_deadline=NULL,updated_at=${now},completed_at=${now}
      WHERE id=${id} AND status IN ('WAITING','ACTIVE') RETURNING id
    `;
    return rows.length === 1;
  }

  async due(now: string): Promise<PveRun[]> {
    return this.sql<PveRun[]>`
      SELECT ${this.sql.unsafe(RUN_COLUMNS)} FROM pve_runs
      WHERE status='ACTIVE' AND round_deadline IS NOT NULL AND round_deadline<=${now}
    `;
  }

  async cancelActive(now: string): Promise<number> {
    const rows = await this.sql`
      UPDATE pve_runs SET status='CANCELLED',round_deadline=NULL,updated_at=${now},completed_at=${now}
      WHERE status='ACTIVE' RETURNING id
    `;
    return rows.length;
  }

  async markXp(id: string, user: string, xp: number): Promise<void> {
    await this.sql`
      UPDATE pve_players SET xp_awarded=${xp} WHERE run_id=${id} AND user_id=${user} AND xp_awarded=0
    `;
  }

  async mistakes(id: string, user: string): Promise<PackQuestion[]> {
    const rows = await this.sql<{ json: string }[]>`
      SELECT q.question_json AS json FROM pve_rounds q
      LEFT JOIN pve_answers a ON a.run_id=q.run_id AND a.round_index=q.round_index AND a.user_id=${user}
      WHERE q.run_id=${id} AND (a.correct=0 OR a.correct IS NULL) ORDER BY q.round_index
    `;
    return rows.map(({ json }) => JSON.parse(json) as PackQuestion);
  }

  async stageCorrect(id: string, user: string, endExclusive: number): Promise<number> {
    const rows = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM pve_answers
      WHERE run_id=${id} AND user_id=${user} AND correct=1
        AND round_index>=${endExclusive - 5} AND round_index<${endExclusive}
    `;
    return rows[0]?.count ?? 0;
  }

  async history(guild: string, user: string, kind: 'secret' | 'boss'): Promise<PveHistoryRow[]> {
    return this.sql<PveHistoryRow[]>`
      SELECT r.id,r.level,r.status,r.correct_count AS "runCorrect",r.score,r.boss_hp AS "bossHp",
        r.boss_max_hp AS "bossMaxHp",r.created_at AS "createdAt",p.correct_count AS "correctCount",
        p.damage,p.xp_awarded AS "xpAwarded"
      FROM pve_players p JOIN pve_runs r ON r.id=p.run_id
      WHERE r.guild_id=${guild} AND p.user_id=${user} AND r.kind=${kind}
      ORDER BY r.created_at DESC LIMIT 10
    `;
  }

  async bossLeaderboard(guild: string): Promise<PveLeaderboardRow[]> {
    return this.sql<PveLeaderboardRow[]>`
      SELECT p.user_id AS "userId",MAX(p.display_name) AS "displayName",
        SUM(p.damage)::int AS damage,SUM(p.correct_count)::int AS "correctCount",count(*)::int AS matches
      FROM pve_players p JOIN pve_runs r ON r.id=p.run_id
      WHERE r.guild_id=${guild} AND r.kind='boss' AND r.status IN ('COMPLETED','FAILED')
      GROUP BY p.user_id ORDER BY damage DESC,"correctCount" DESC LIMIT 20
    `;
  }
}

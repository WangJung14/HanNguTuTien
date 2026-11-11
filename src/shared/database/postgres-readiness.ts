import type { Sql } from 'postgres';

export const REQUIRED_POSTGRES_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, 6] as const;
export const REQUIRED_RUNTIME_TABLES = [
  'saved_words', 'decks', 'deck_words', 'dictation_sessions', 'dictation_results',
  'cultivation_profiles', 'xp_ledger', 'breakthrough_attempts', 'guild_realm_roles',
  'xp_announcement_channels', 'xp_admin_adjustments', 'meditation_config',
  'meditation_sessions', 'meditation_rewards', 'daily_quest_progress',
  'daily_quest_entries', 'learning_streaks', 'learning_activity_days',
  'mountain_matches', 'mountain_players', 'mountain_rounds', 'mountain_answers',
  'pve_runs', 'pve_players', 'pve_rounds', 'pve_answers',
  'sects', 'sect_members', 'sect_join_requests', 'sect_contribution_ledger',
  'sect_contribution_claims', 'sect_quests', 'sect_quest_progress', 'sect_quest_events',
  'guild_cultivation_leaderboard_config',
  'adventure_progress', 'adventure_answers', 'adventure_chapter_completions',
  'srs_cards', 'srs_sessions', 'srs_review_logs', 'srs_settings',
] as const;

export function missingSchemaVersions(applied: readonly number[]): number[] {
  const values = new Set(applied);
  return REQUIRED_POSTGRES_SCHEMA_VERSIONS.filter((version) => !values.has(version));
}

export async function assertPostgresReady(sql: Sql): Promise<void> {
  const migrations = await sql<{ version: number }[]>`
    SELECT version FROM app_schema_migrations ORDER BY version
  `.catch((error: unknown) => {
    throw new Error('PostgreSQL schema is unavailable. Run npm run db:pg:migrate before starting the bot.', { cause: error });
  });
  const missingVersions = missingSchemaVersions(migrations.map((row) => Number(row.version)));
  if (missingVersions.length) {
    throw new Error(`PostgreSQL schema is missing migration version(s): ${missingVersions.join(', ')}. Run npm run db:pg:migrate.`);
  }
  const rows = await sql<{ tableName: string }[]>`
    SELECT table_name AS "tableName" FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ${sql([...REQUIRED_RUNTIME_TABLES])}
  `;
  const existing = new Set(rows.map((row) => row.tableName));
  const missingTables = REQUIRED_RUNTIME_TABLES.filter((table) => !existing.has(table));
  if (missingTables.length) {
    throw new Error(`PostgreSQL runtime tables are missing: ${missingTables.join(', ')}. Run npm run db:pg:migrate.`);
  }
  await sql`SELECT 1 FROM cultivation_profiles LIMIT 1`;
}

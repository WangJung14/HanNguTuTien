import 'dotenv/config';
import postgres from 'postgres';

export function postgresUrl(kind: 'runtime' | 'migration' = 'migration'): string {
  const name = kind === 'runtime' ? 'SUPABASE_DATABASE_URL' : 'SUPABASE_MIGRATION_URL';
  const value = process.env[name]?.trim();
  if (!value?.startsWith('postgres')) throw new Error(`${name} must be a PostgreSQL connection URI.`);
  return value;
}

export function openPostgres(kind: 'runtime' | 'migration' = 'migration') {
  return postgres(postgresUrl(kind), {
    max: kind === 'runtime' ? 2 : 1,
    ssl: 'require',
    connect_timeout: 15,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    onnotice: () => {},
  });
}

export const progressTables = [
  'saved_words','decks','deck_words','dictation_sessions','dictation_results','cultivation_profiles','xp_ledger',
  'breakthrough_attempts','guild_realm_roles','xp_announcement_channels','xp_admin_adjustments','meditation_config','meditation_sessions','meditation_rewards',
  'daily_quest_progress','daily_quest_entries','learning_streaks','learning_activity_days','mountain_matches',
  'mountain_players','mountain_rounds','mountain_answers','pve_runs','pve_players','pve_rounds','pve_answers',
  'sects','sect_members','sect_join_requests','sect_contribution_ledger','sect_contribution_claims','sect_quests',
  'sect_quest_progress','sect_quest_events','guild_cultivation_leaderboard_config',
  'adventure_progress','adventure_answers','adventure_chapter_completions',
] as const;

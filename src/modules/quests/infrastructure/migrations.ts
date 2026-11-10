import type Database from 'better-sqlite3';

export function applyPhase41Migrations(sqlite: Database.Database): void {
  const version = sqlite.pragma('user_version', { simple: true }) as number;
  if (version > 8) throw new Error(`Progress DB version ${version} is newer than this bot.`);
  if (version < 5) throw new Error('Run Phase 4 migration before Phase 4.1 migration.');
  if (version === 5) {
    sqlite.transaction(() => {
      sqlite.exec(`
        CREATE TABLE meditation_config (
          guild_id TEXT PRIMARY KEY, channel_id TEXT, updated_at TEXT NOT NULL
        );
        CREATE TABLE meditation_sessions (
          id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('active','ended')), started_at TEXT NOT NULL,
          next_reward_at TEXT NOT NULL, tick_index INTEGER NOT NULL DEFAULT 0,
          ended_at TEXT, updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX idx_meditation_active ON meditation_sessions(guild_id,user_id) WHERE status='active';
        CREATE TABLE meditation_rewards (
          session_id TEXT NOT NULL REFERENCES meditation_sessions(id), tick_index INTEGER NOT NULL,
          guild_id TEXT NOT NULL, user_id TEXT NOT NULL, activity_date TEXT NOT NULL,
          minutes INTEGER NOT NULL, xp_awarded INTEGER NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY(session_id,tick_index)
        );
        CREATE INDEX idx_meditation_daily ON meditation_rewards(guild_id,user_id,activity_date);
        CREATE TABLE daily_quest_progress (
          guild_id TEXT NOT NULL, user_id TEXT NOT NULL, activity_date TEXT NOT NULL,
          quest_key TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT, rewarded_at TEXT, xp_awarded INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL, PRIMARY KEY(guild_id,user_id,activity_date,quest_key)
        );
        CREATE TABLE daily_quest_entries (
          guild_id TEXT NOT NULL, user_id TEXT NOT NULL, activity_date TEXT NOT NULL,
          entry_id INTEGER NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY(guild_id,user_id,activity_date,entry_id)
        );
        CREATE TABLE learning_streaks (
          guild_id TEXT NOT NULL, user_id TEXT NOT NULL, current_streak INTEGER NOT NULL DEFAULT 0,
          longest_streak INTEGER NOT NULL DEFAULT 0, last_active_date TEXT, updated_at TEXT NOT NULL,
          PRIMARY KEY(guild_id,user_id)
        );
        CREATE TABLE learning_activity_days (
          guild_id TEXT NOT NULL, user_id TEXT NOT NULL, activity_date TEXT NOT NULL,
          session_id TEXT NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY(guild_id,user_id,activity_date), UNIQUE(session_id)
        );
      `);
      sqlite.pragma('user_version = 6');
    })();
  }
}

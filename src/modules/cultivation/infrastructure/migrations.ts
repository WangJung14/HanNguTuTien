import type Database from 'better-sqlite3';

export function applyCultivationMigrations(sqlite: Database.Database): void {
  const version = sqlite.pragma('user_version', { simple: true }) as number;
  if (version > 9) throw new Error(`Progress DB version ${version} is newer than this bot.`);
  if (version < 4) throw new Error('Run Phase 3 migration before Phase 4 migration.');
  if (version === 4) {
    sqlite.transaction(() => {
      sqlite.exec(`
        CREATE TABLE cultivation_profiles (
          guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
          total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
          major_index INTEGER NOT NULL DEFAULT 0 CHECK (major_index >= 0),
          role_sync_pending INTEGER NOT NULL DEFAULT 0 CHECK (role_sync_pending IN (0, 1)),
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY (guild_id, user_id)
        );
        CREATE TABLE xp_ledger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
          amount INTEGER NOT NULL CHECK (amount >= 0), source TEXT NOT NULL,
          reward_key TEXT NOT NULL UNIQUE, session_id TEXT,
          earned_date TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX idx_xp_ledger_owner_date ON xp_ledger(guild_id, user_id, created_at DESC);
        CREATE INDEX idx_xp_ledger_daily ON xp_ledger(guild_id, user_id, earned_date);
        CREATE TABLE breakthrough_attempts (
          id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
          from_major INTEGER NOT NULL, to_major INTEGER NOT NULL, deck_id INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active', 'passed', 'failed')),
          current_index INTEGER NOT NULL DEFAULT 0, correct_count INTEGER NOT NULL DEFAULT 0,
          questions_json TEXT NOT NULL, cooldown_until TEXT, message_id TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
        );
        CREATE UNIQUE INDEX idx_breakthrough_one_active
          ON breakthrough_attempts(guild_id, user_id) WHERE status = 'active';
        CREATE INDEX idx_breakthrough_history ON breakthrough_attempts(guild_id, user_id, created_at DESC);
        CREATE TABLE guild_realm_roles (
          guild_id TEXT NOT NULL, major_index INTEGER NOT NULL, role_id TEXT NOT NULL,
          updated_at TEXT NOT NULL, PRIMARY KEY (guild_id, major_index),
          UNIQUE (guild_id, role_id)
        );
      `);
      sqlite.pragma('user_version = 5');
    })();
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS xp_announcement_channels (
      guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS xp_admin_adjustments (
      id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('reward','penalty')), amount INTEGER NOT NULL CHECK(amount >= 0),
      reason TEXT NOT NULL, previous_total_xp INTEGER NOT NULL, new_total_xp INTEGER NOT NULL,
      previous_major_index INTEGER NOT NULL, new_major_index INTEGER NOT NULL, created_at TEXT NOT NULL
    )
  `);
}

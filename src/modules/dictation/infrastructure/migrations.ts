import type Database from 'better-sqlite3';

export function applyDictationMigrations(sqlite: Database.Database): void {
  const version = sqlite.pragma('user_version', { simple: true }) as number;
  if (version > 9) throw new Error(`Progress DB version ${version} is newer than this bot.`);
  if (version < 2) throw new Error('Run Phase 2.1 migration before Phase 3 migration.');
  if (version === 2) {
    sqlite.transaction(() => {
      sqlite.exec(`
        CREATE TABLE dictation_sessions (
          id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          deck_id INTEGER NOT NULL,
          deck_name TEXT NOT NULL,
          question_count INTEGER NOT NULL CHECK (question_count IN (5, 10, 20)),
          current_index INTEGER NOT NULL DEFAULT 0 CHECK (current_index >= 0),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          message_id TEXT,
          mode TEXT NOT NULL DEFAULT 'discord' CHECK (mode IN ('discord', 'paper'))
        );
        CREATE UNIQUE INDEX idx_dictation_one_active_per_owner
          ON dictation_sessions(guild_id, user_id) WHERE status = 'active';
        CREATE INDEX idx_dictation_session_expiry
          ON dictation_sessions(status, expires_at);
        CREATE TABLE dictation_results (
          session_id TEXT NOT NULL REFERENCES dictation_sessions(id) ON DELETE CASCADE,
          question_index INTEGER NOT NULL CHECK (question_index >= 0),
          entry_id INTEGER NOT NULL,
          simplified TEXT NOT NULL,
          traditional TEXT NOT NULL,
          pinyin TEXT NOT NULL,
          meaning_vi TEXT NOT NULL,
          answer TEXT,
          is_correct INTEGER CHECK (is_correct IN (0, 1)),
          used_hint INTEGER NOT NULL DEFAULT 0 CHECK (used_hint IN (0, 1)),
          replay_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
          answered_at TEXT,
          PRIMARY KEY (session_id, question_index)
        );
        CREATE INDEX idx_dictation_results_entry ON dictation_results(entry_id);
      `);
      sqlite.pragma('user_version = 3');
    })();
  }
  if ((sqlite.pragma('user_version', { simple: true }) as number) === 3) {
    sqlite.transaction(() => {
      const columns = sqlite.prepare('PRAGMA table_info(dictation_sessions)').all() as { name: string }[];
      if (!columns.some((column) => column.name === 'mode')) {
        sqlite.exec("ALTER TABLE dictation_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'discord' CHECK (mode IN ('discord', 'paper'))");
      }
      sqlite.pragma('user_version = 4');
    })();
  }
}

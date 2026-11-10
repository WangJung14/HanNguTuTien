import type Database from 'better-sqlite3';

/** Migration v1 chỉ tác động tới progress.sqlite, KHÔNG bao giờ tới CVDICT. */
export function applyProgressMigrations(sqlite: Database.Database): void {
  const version = sqlite.pragma('user_version', { simple: true }) as number;
  if (version > 10) throw new Error(`Progress DB version ${version} is newer than this bot.`);
  if (version === 0) {
    sqlite.transaction(() => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS saved_words (
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          entry_id INTEGER NOT NULL,
          saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          PRIMARY KEY (guild_id, user_id, entry_id)
        );
        CREATE INDEX IF NOT EXISTS idx_saved_words_owner_date
          ON saved_words (guild_id, user_id, saved_at DESC, entry_id DESC);
      `);
      sqlite.pragma('user_version = 1');
    })();
  }
}

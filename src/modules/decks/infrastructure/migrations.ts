import type Database from 'better-sqlite3';

/** Migration v2: chỉ dùng trên progress.sqlite; không thay đổi CVDICT. */
export function applyDeckMigrations(sqlite: Database.Database): void {
  const version = sqlite.pragma('user_version', { simple: true }) as number;
  if (version > 9) throw new Error(`Progress DB version ${version} is newer than this bot.`);
  if (version < 1) throw new Error('Run Phase 2 migration before Phase 2.1 migration.');
  if (version === 1) {
    sqlite.transaction(() => {
      sqlite.exec(`
        CREATE TABLE decks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL,
          name_key TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE UNIQUE INDEX idx_decks_owner_name
          ON decks(guild_id, owner_id, name_key);
        CREATE INDEX idx_decks_public
          ON decks(guild_id, is_public, id DESC);
        CREATE TABLE deck_words (
          deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
          entry_id INTEGER NOT NULL,
          added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          PRIMARY KEY (deck_id, entry_id)
        );
        CREATE INDEX idx_deck_words_latest ON deck_words(deck_id, added_at DESC, entry_id DESC);
      `);
      sqlite.pragma('user_version = 2');
    })();
  }
}

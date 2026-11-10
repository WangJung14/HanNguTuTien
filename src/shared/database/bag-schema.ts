import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Dữ liệu người dùng KHÔNG nằm trong file CVDICT (read-only).
export const savedWords = sqliteTable('saved_words', {
  guildId: text('guild_id').notNull(),
  userId: text('user_id').notNull(),
  entryId: integer('entry_id').notNull(),
  savedAt: text('saved_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => [
  primaryKey({ columns: [table.guildId, table.userId, table.entryId] }),
]);

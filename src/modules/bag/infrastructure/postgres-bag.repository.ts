import type { Sql } from 'postgres';
import type { BagRepository, BagWord } from '../domain/bag.types.js';

export class PostgresBagRepository implements BagRepository {
  constructor(private readonly sql: Sql) {}

  async add(guildId: string, userId: string, entryId: number): Promise<boolean> {
    const rows = await this.sql`INSERT INTO saved_words (guild_id,user_id,entry_id)
      VALUES (${guildId},${userId},${entryId}) ON CONFLICT DO NOTHING RETURNING entry_id`;
    return rows.length === 1;
  }
  async remove(guildId: string, userId: string, entryId: number): Promise<boolean> {
    const rows = await this.sql`DELETE FROM saved_words WHERE guild_id=${guildId} AND user_id=${userId}
      AND entry_id=${entryId} RETURNING entry_id`;
    return rows.length === 1;
  }
  async list(guildId: string, userId: string, limit: number, offset: number): Promise<BagWord[]> {
    const rows = await this.sql<{ entryId: string; savedAt: string }[]>`
      SELECT entry_id::text AS "entryId", saved_at::text AS "savedAt" FROM saved_words
      WHERE guild_id=${guildId} AND user_id=${userId}
      ORDER BY saved_at DESC,entry_id DESC LIMIT ${limit} OFFSET ${offset}`;
    return rows.map((row) => {
      const entryId = Number(row.entryId);
      if (!Number.isSafeInteger(entryId)) {
        throw new Error('PostgreSQL dictionary entry ID exceeds the supported safe integer range.');
      }
      return { entryId, savedAt: row.savedAt };
    });
  }
  async count(guildId: string, userId: string): Promise<number> {
    const [row] = await this.sql<{ amount:number }[]>`SELECT count(*)::int AS amount FROM saved_words
      WHERE guild_id=${guildId} AND user_id=${userId}`;
    return row?.amount ?? 0;
  }
}

import { and, count, desc, eq } from 'drizzle-orm';
import type { ProgressDb } from '../../../shared/database/open-progress.js';
import { savedWords } from '../../../shared/database/bag-schema.js';
import type { BagRepository, BagWord } from '../domain/bag.types.js';

export class SqliteBagRepository implements BagRepository {
  constructor(private readonly db: ProgressDb) {}

  add(guildId: string, userId: string, entryId: number): boolean {
    const outcome = this.db.insert(savedWords)
      .values({ guildId, userId, entryId })
      .onConflictDoNothing()
      .run();
    return outcome.changes === 1;
  }

  remove(guildId: string, userId: string, entryId: number): boolean {
    const outcome = this.db.delete(savedWords).where(and(
      eq(savedWords.guildId, guildId),
      eq(savedWords.userId, userId),
      eq(savedWords.entryId, entryId),
    )).run();
    return outcome.changes === 1;
  }

  list(guildId: string, userId: string, limit: number, offset: number): BagWord[] {
    return this.db.select({ entryId: savedWords.entryId, savedAt: savedWords.savedAt })
      .from(savedWords)
      .where(and(eq(savedWords.guildId, guildId), eq(savedWords.userId, userId)))
      .orderBy(desc(savedWords.savedAt), desc(savedWords.entryId))
      .limit(limit).offset(offset).all();
  }

  count(guildId: string, userId: string): number {
    const record = this.db.select({ amount: count() }).from(savedWords)
      .where(and(eq(savedWords.guildId, guildId), eq(savedWords.userId, userId)))
      .get();
    return record?.amount ?? 0;
  }
}

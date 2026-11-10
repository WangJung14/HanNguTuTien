import type Database from 'better-sqlite3';
import { asc, eq, inArray, like, or } from 'drizzle-orm';
import type { DictionaryDb } from '../../../shared/database/open-dictionary.js';
import { entries, meanings } from '../../../shared/database/dictionary-schema.js';
import type { DictionaryEntry, DictionaryRepository } from '../domain/dictionary.types.js';

export class SqliteDictionaryRepository implements DictionaryRepository {
  constructor(private readonly db: DictionaryDb, private readonly sqlite: Database.Database) {}

  private withMeanings(rows: (typeof entries.$inferSelect)[]): DictionaryEntry[] {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const allMeanings = this.db.select().from(meanings)
      .where(inArray(meanings.entryId, ids)).orderBy(asc(meanings.id)).all();
    const byId = new Map<number, string[]>();
    for (const meaning of allMeanings) {
      const list = byId.get(meaning.entryId) || [];
      list.push(meaning.meaningVi);
      byId.set(meaning.entryId, list);
    }
    return rows.map((row) => ({
      id: row.id,
      simplified: row.simplified,
      traditional: row.traditional,
      pinyinRaw: row.pinyinRaw,
      source: row.source,
      meanings: byId.get(row.id) || [],
    }));
  }

  findById(id: number): DictionaryEntry | null {
    const row = this.db.select().from(entries).where(eq(entries.id, id)).get();
    return row ? this.withMeanings([row])[0] ?? null : null;
  }

  findHanzi(query: string, limit: number): DictionaryEntry[] {
    const exact = this.db.select().from(entries)
      .where(or(eq(entries.simplified, query), eq(entries.traditional, query)))
      .orderBy(asc(entries.id)).limit(limit).all();
    if (exact.length) return this.withMeanings(exact);
    // Prefix search only for simple, safe Han characters (no SQL wildcards).
    if (!/^[\p{Script=Han}]{1,20}$/u.test(query)) return [];
    const prefix = this.db.select().from(entries)
      .where(or(like(entries.simplified, `${query}%`), like(entries.traditional, `${query}%`)))
      .orderBy(asc(entries.id)).limit(limit).all();
    return this.withMeanings(prefix);
  }

  findPinyin(normalized: string, limit: number): DictionaryEntry[] {
    if (!normalized) return [];
    const exact = this.db.select().from(entries)
      .where(eq(entries.pinyinPlain, normalized))
      .orderBy(asc(entries.id)).limit(limit).all();
    if (exact.length) return this.withMeanings(exact);
    const prefix = this.db.select().from(entries)
      .where(like(entries.pinyinPlain, `${normalized}%`))
      .orderBy(asc(entries.id)).limit(limit).all();
    return this.withMeanings(prefix);
  }

  findVietnamese(query: string, limit: number): DictionaryEntry[] {
    // FTS search of the prepared, read-only dictionary copy.
    // Quoted tokens prevent MATCH injection and retain accent-insensitive matching.
    const tokens = query.normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
    const safeTokens = tokens.slice(0, 8).map((term) => `"${term.replace(/"/g, '')}"*`);
    if (!safeTokens.length) return [];
    const matchExpression = safeTokens.join(' AND ');
    const results = this.sqlite.prepare(`
      SELECT m.entry_id AS entryId,
             MIN(CASE
               WHEN m.meaning_vi = ? THEN 0
               WHEN m.meaning_vi LIKE ? THEN 1
               ELSE 2
             END) AS relevance,
             MIN(length(m.meaning_vi)) AS shortestMeaning
      FROM meanings_fts
      JOIN meanings m ON m.id = meanings_fts.rowid
      WHERE meanings_fts MATCH ?
      GROUP BY m.entry_id
      ORDER BY relevance, shortestMeaning, m.entry_id
      LIMIT ?
    `).all(query, `${query}%`, matchExpression, limit) as { entryId: number }[];
    const ids = results.map((r) => r.entryId);
    if (!ids.length) return [];
    const found = this.db.select().from(entries).where(inArray(entries.id, ids)).all();
    const order = new Map(ids.map((id, i) => [id, i]));
    found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return this.withMeanings(found);
  }
}

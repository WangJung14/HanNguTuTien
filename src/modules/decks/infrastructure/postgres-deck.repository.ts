import type { Sql } from 'postgres';
import type { Deck, DeckRepository, DeckWord, NewDeck } from '../domain/deck.types.js';
import { DeckError } from '../domain/deck.types.js';

type DeckRow = Omit<Deck, 'id' | 'isPublic' | 'wordCount'> & {
  id: string;
  isPublic: number;
  wordCount: number;
};

type DbDeckWord = { entryId: string; addedAt: string };

function mapDeck(row: DeckRow | undefined): Deck | null {
  if (!row) return null;
  const id = Number(row.id);
  if (!Number.isSafeInteger(id)) throw new Error('PostgreSQL deck ID exceeds the supported safe integer range.');
  return {
    ...row,
    id,
    isPublic: row.isPublic === 1,
    wordCount: Number(row.wordCount),
  };
}

export class PostgresDeckRepository implements DeckRepository {
  constructor(private readonly sql: Sql) {}

  async get(guildId: string, deckId: number): Promise<Deck | null> {
    const rows = await this.sql<DeckRow[]>`
      SELECT d.id::text AS id, d.guild_id AS "guildId", d.owner_id AS "ownerId",
             d.name, d.description, d.is_public AS "isPublic",
             d.created_at AS "createdAt",
             count(dw.entry_id)::int AS "wordCount"
      FROM decks d
      LEFT JOIN deck_words dw ON dw.deck_id = d.id
      WHERE d.guild_id = ${guildId} AND d.id = ${deckId}
      GROUP BY d.id
    `;
    return mapDeck(rows[0]);
  }

  async listOwned(guildId: string, ownerId: string): Promise<Deck[]> {
    const rows = await this.sql<DeckRow[]>`
      SELECT d.id::text AS id, d.guild_id AS "guildId", d.owner_id AS "ownerId",
             d.name, d.description, d.is_public AS "isPublic",
             d.created_at AS "createdAt",
             count(dw.entry_id)::int AS "wordCount"
      FROM decks d
      LEFT JOIN deck_words dw ON dw.deck_id = d.id
      WHERE d.guild_id = ${guildId} AND d.owner_id = ${ownerId}
      GROUP BY d.id
      ORDER BY d.id DESC
      LIMIT 25
    `;
    return rows.map((row) => mapDeck(row)!);
  }

  async listPublic(guildId: string, limit: number): Promise<Deck[]> {
    const rows = await this.sql<DeckRow[]>`
      SELECT d.id::text AS id, d.guild_id AS "guildId", d.owner_id AS "ownerId",
             d.name, d.description, d.is_public AS "isPublic",
             d.created_at AS "createdAt",
             count(dw.entry_id)::int AS "wordCount"
      FROM decks d
      LEFT JOIN deck_words dw ON dw.deck_id = d.id
      WHERE d.guild_id = ${guildId} AND d.is_public = 1
      GROUP BY d.id
      ORDER BY d.id DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => mapDeck(row)!);
  }

  async create(data: NewDeck): Promise<Deck> {
    const now = new Date().toISOString();
    const rows = await this.sql<{ id: string }[]>`
      INSERT INTO decks (guild_id, owner_id, name, name_key, description, created_at, updated_at)
      VALUES (
        ${data.guildId}, ${data.ownerId}, ${data.name}, ${data.nameKey},
        ${data.description}, ${now}, ${now}
      )
      RETURNING id::text AS id
    `;
    const id = Number(rows[0]?.id);
    if (!Number.isSafeInteger(id)) throw new Error('Created PostgreSQL deck ID is missing or invalid.');
    const deck = await this.get(data.guildId, id);
    if (!deck) throw new Error('Created deck could not be found.');
    return deck;
  }

  async delete(guildId: string, ownerId: string, deckId: number): Promise<boolean> {
    const rows = await this.sql`
      DELETE FROM decks
      WHERE id = ${deckId} AND guild_id = ${guildId} AND owner_id = ${ownerId}
      RETURNING id
    `;
    return rows.length === 1;
  }

  async setPublic(guildId: string, ownerId: string, deckId: number, enabled: boolean): Promise<Deck> {
    await this.sql`
      UPDATE decks
      SET is_public = ${enabled ? 1 : 0},
          updated_at = ${new Date().toISOString()}
      WHERE id = ${deckId} AND guild_id = ${guildId} AND owner_id = ${ownerId}
    `;
    const deck = await this.get(guildId, deckId);
    if (!deck || deck.ownerId !== ownerId) {
      throw new DeckError('Không tìm thấy bộ từ thuộc quyền sở hữu của bạn.');
    }
    return deck;
  }

  async addWord(guildId: string, userId: string, deckId: number, entryId: number): Promise<boolean> {
    return this.sql.begin(async (transaction) => {
      const owner = await transaction`
        SELECT 1 FROM decks
        WHERE id = ${deckId} AND guild_id = ${guildId} AND owner_id = ${userId}
        FOR UPDATE
      `;
      if (!owner.length) throw new DeckError('Bạn không có quyền sửa bộ từ này.');

      const existing = await transaction`
        SELECT 1 FROM deck_words WHERE deck_id = ${deckId} AND entry_id = ${entryId}
      `;
      if (existing.length) return false;

      const counts = await transaction<{ count: number }[]>`
        SELECT count(*)::int AS count FROM deck_words WHERE deck_id = ${deckId}
      `;
      if ((counts[0]?.count ?? 0) >= 500) {
        throw new DeckError('Mỗi bộ chỉ chứa tối đa 500 mục từ trong phiên bản này.');
      }

      const addedAt = new Date().toISOString();
      await transaction`
        INSERT INTO deck_words (deck_id, entry_id, added_at)
        VALUES (${deckId}, ${entryId}, ${addedAt})
      `;
      await transaction`
        INSERT INTO saved_words (guild_id, user_id, entry_id)
        VALUES (${guildId}, ${userId}, ${entryId})
        ON CONFLICT DO NOTHING
      `;
      return true;
    });
  }

  async removeWord(deckId: number, entryId: number): Promise<boolean> {
    const rows = await this.sql`
      DELETE FROM deck_words WHERE deck_id = ${deckId} AND entry_id = ${entryId}
      RETURNING entry_id
    `;
    return rows.length === 1;
  }

  async moveWord(sourceDeckId: number, destinationDeckId: number, entryId: number): Promise<boolean> {
    return this.sql.begin(async (transaction) => {
      const deckIds = [sourceDeckId, destinationDeckId].sort((a, b) => a - b);
      const lockedDecks = await transaction<{ id: string }[]>`
        SELECT id::text AS id FROM decks
        WHERE id IN (${transaction.array(deckIds)})
        ORDER BY id
        FOR UPDATE
      `;
      if (lockedDecks.length !== 2) throw new DeckError('Không tìm thấy bộ từ nguồn hoặc đích.');

      const sourceRows = await transaction`
        DELETE FROM deck_words WHERE deck_id = ${sourceDeckId} AND entry_id = ${entryId}
        RETURNING entry_id
      `;
      if (!sourceRows.length) return false;

      const destinationRows = await transaction`
        SELECT 1 FROM deck_words WHERE deck_id = ${destinationDeckId} AND entry_id = ${entryId}
      `;
      if (!destinationRows.length) {
        const counts = await transaction<{ count: number }[]>`
          SELECT count(*)::int AS count FROM deck_words WHERE deck_id = ${destinationDeckId}
        `;
        if ((counts[0]?.count ?? 0) >= 500) {
          throw new DeckError('Bộ từ đích đã đạt tối đa 500 mục từ.');
        }
        const addedAt = new Date().toISOString();
        await transaction`
          INSERT INTO deck_words (deck_id, entry_id, added_at)
          VALUES (${destinationDeckId}, ${entryId}, ${addedAt})
        `;
      }
      return true;
    });
  }

  async hasWord(deckId: number, entryId: number): Promise<boolean> {
    const rows = await this.sql`
      SELECT 1 FROM deck_words WHERE deck_id = ${deckId} AND entry_id = ${entryId}
    `;
    return rows.length === 1;
  }

  async listWords(deckId: number, limit: number, offset: number): Promise<DeckWord[]> {
    const rows = await this.sql<DbDeckWord[]>`
      SELECT entry_id::text AS "entryId", added_at AS "addedAt"
      FROM deck_words
      WHERE deck_id = ${deckId}
      ORDER BY added_at DESC, entry_id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows.map((row) => {
      const entryId = Number(row.entryId);
      if (!Number.isSafeInteger(entryId)) {
        throw new Error('PostgreSQL dictionary entry ID exceeds the supported safe integer range.');
      }
      return { entryId, addedAt: row.addedAt };
    });
  }

  async copy(
    guildId: string,
    ownerId: string,
    sourceDeckId: number,
    name: string,
    nameKey: string,
  ): Promise<Deck> {
    const createdId = await this.sql.begin(async (transaction) => {
      const sourceRows = await transaction<{ ownerId: string; isPublic: number; description: string }[]>`
        SELECT owner_id AS "ownerId", is_public AS "isPublic", description
        FROM decks
        WHERE guild_id = ${guildId} AND id = ${sourceDeckId}
        FOR SHARE
      `;
      const source = sourceRows[0];
      if (!source || (source.isPublic !== 1 && source.ownerId !== ownerId)) {
        throw new DeckError('Bộ từ này không được chia sẻ hoặc không tồn tại trong server.');
      }

      const counts = await transaction<{ count: number }[]>`
        SELECT count(*)::int AS count FROM decks
        WHERE guild_id = ${guildId} AND owner_id = ${ownerId}
      `;
      if ((counts[0]?.count ?? 0) >= 25) throw new DeckError('Bạn đã có 25 bộ từ. Hãy xóa bớt trước khi sao chép.');

      const createdRows = await transaction<{ id: string }[]>`
        INSERT INTO decks (
          guild_id, owner_id, name, name_key, description, created_at, updated_at
        )
        VALUES (
          ${guildId}, ${ownerId}, ${name}, ${nameKey}, ${source.description},
          ${new Date().toISOString()}, ${new Date().toISOString()}
        )
        RETURNING id::text AS id
      `;
      const id = Number(createdRows[0]?.id);
      if (!Number.isSafeInteger(id)) throw new Error('Copied PostgreSQL deck ID is missing or invalid.');

      await transaction`
        INSERT INTO deck_words (deck_id, entry_id, added_at)
        SELECT ${id}, entry_id, added_at FROM deck_words WHERE deck_id = ${sourceDeckId}
      `;
      await transaction`
        INSERT INTO saved_words (guild_id, user_id, entry_id)
        SELECT ${guildId}, ${ownerId}, entry_id
        FROM deck_words
        WHERE deck_id = ${id}
        ON CONFLICT DO NOTHING
      `;
      return id;
    });

    const deck = await this.get(guildId, createdId);
    if (!deck) throw new Error('Copied deck could not be found.');
    return deck;
  }
}

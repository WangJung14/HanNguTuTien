import type Database from 'better-sqlite3';
import type { Deck, DeckRepository, DeckWord, NewDeck } from '../domain/deck.types.js';
import { DeckError } from '../domain/deck.types.js';

type DbDeck = {
  id: number;
  guildId: string;
  ownerId: string;
  name: string;
  description: string;
  isPublic: number;
  createdAt: string;
  wordCount: number;
};

const SELECT_DECK = `
  SELECT d.id, d.guild_id AS guildId, d.owner_id AS ownerId,
         d.name, d.description, d.is_public AS isPublic,
         d.created_at AS createdAt,
         (SELECT count(*) FROM deck_words dw WHERE dw.deck_id = d.id) AS wordCount
  FROM decks d
`;

function mapDeck(row: DbDeck): Deck {
  return { ...row, isPublic: row.isPublic === 1 };
}

export class SqliteDeckRepository implements DeckRepository {
  constructor(private readonly sqlite: Database.Database) {}

  get(guildId: string, deckId: number): Deck | null {
    const row = this.sqlite.prepare(`${SELECT_DECK} WHERE d.guild_id = ? AND d.id = ?`)
      .get(guildId, deckId) as DbDeck | undefined;
    return row ? mapDeck(row) : null;
  }

  listOwned(guildId: string, ownerId: string): Deck[] {
    const rows = this.sqlite.prepare(`${SELECT_DECK}
      WHERE d.guild_id = ? AND d.owner_id = ? ORDER BY d.id DESC LIMIT 25`)
      .all(guildId, ownerId) as DbDeck[];
    return rows.map(mapDeck);
  }

  listPublic(guildId: string, limit: number): Deck[] {
    const rows = this.sqlite.prepare(`${SELECT_DECK}
      WHERE d.guild_id = ? AND d.is_public = 1 ORDER BY d.id DESC LIMIT ?`)
      .all(guildId, limit) as DbDeck[];
    return rows.map(mapDeck);
  }

  create(data: NewDeck): Deck {
    const inserted = this.sqlite.prepare(`
      INSERT INTO decks (guild_id, owner_id, name, name_key, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.guildId, data.ownerId, data.name, data.nameKey, data.description);
    const deck = this.get(data.guildId, Number(inserted.lastInsertRowid));
    if (!deck) throw new Error('Created deck could not be found.');
    return deck;
  }

  delete(guildId: string, ownerId: string, deckId: number): boolean {
    const result = this.sqlite.prepare(`
      DELETE FROM decks WHERE id = ? AND guild_id = ? AND owner_id = ?
    `).run(deckId, guildId, ownerId);
    return result.changes === 1;
  }

  setPublic(guildId: string, ownerId: string, deckId: number, enabled: boolean): Deck {
    this.sqlite.prepare(`
      UPDATE decks SET is_public = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND guild_id = ? AND owner_id = ?
    `).run(enabled ? 1 : 0, deckId, guildId, ownerId);
    const deck = this.get(guildId, deckId);
    if (!deck || deck.ownerId !== ownerId) throw new DeckError('Không tìm thấy bộ từ thuộc quyền sở hữu của bạn.');
    return deck;
  }

  addWord(guildId: string, userId: string, deckId: number, entryId: number): boolean {
    return this.sqlite.transaction(() => {
      const owner = this.sqlite.prepare(`
        SELECT 1 FROM decks WHERE id = ? AND guild_id = ? AND owner_id = ?
      `).get(deckId, guildId, userId);
      if (!owner) throw new DeckError('Bạn không có quyền sửa bộ từ này.');
      const exists = this.hasWord(deckId, entryId);
      if (exists) return false;
      const num = this.sqlite.prepare('SELECT count(*) AS n FROM deck_words WHERE deck_id = ?')
        .get(deckId) as { n: number };
      if (num.n >= 500) throw new DeckError('Mỗi bộ chỉ chứa tối đa 500 mục từ trong phiên bản này.');
      this.sqlite.prepare('INSERT INTO deck_words (deck_id, entry_id) VALUES (?, ?)')
        .run(deckId, entryId);
      // Từ trong bộ cũng nằm trong Túi Càn Khôn. Đây là một transaction.
      this.sqlite.prepare(`
        INSERT OR IGNORE INTO saved_words (guild_id, user_id, entry_id) VALUES (?, ?, ?)
      `).run(guildId, userId, entryId);
      return true;
    })();
  }

  removeWord(deckId: number, entryId: number): boolean {
    // Cố ý không xóa saved_words: bỏ khỏi bộ không đồng nghĩa bỏ khỏi Túi Càn Khôn.
    return this.sqlite.prepare('DELETE FROM deck_words WHERE deck_id = ? AND entry_id = ?')
      .run(deckId, entryId).changes === 1;
  }

  hasWord(deckId: number, entryId: number): boolean {
    return !!this.sqlite.prepare('SELECT 1 FROM deck_words WHERE deck_id = ? AND entry_id = ?')
      .get(deckId, entryId);
  }

  moveWord(sourceDeckId: number, destinationDeckId: number, entryId: number): boolean {
    return this.sqlite.transaction(() => {
      if (!this.hasWord(sourceDeckId, entryId)) return false;
      if (!this.hasWord(destinationDeckId, entryId)) {
        const count = this.sqlite.prepare('SELECT count(*) AS n FROM deck_words WHERE deck_id = ?')
          .get(destinationDeckId) as { n: number };
        if (count.n >= 500) throw new DeckError('Bộ từ đích đã đạt tối đa 500 mục từ.');
        this.sqlite.prepare('INSERT INTO deck_words (deck_id, entry_id) VALUES (?, ?)')
          .run(destinationDeckId, entryId);
      }
      this.removeWord(sourceDeckId, entryId);
      return true;
    })();
  }

  listWords(deckId: number, limit: number, offset: number): DeckWord[] {
    return this.sqlite.prepare(`
      SELECT entry_id AS entryId, added_at AS addedAt FROM deck_words
      WHERE deck_id = ? ORDER BY added_at DESC, entry_id DESC LIMIT ? OFFSET ?
    `).all(deckId, limit, offset) as DeckWord[];
  }

  copy(guildId: string, ownerId: string, sourceDeckId: number, name: string, nameKey: string): Deck {
    return this.sqlite.transaction(() => {
      const source = this.get(guildId, sourceDeckId);
      if (!source || (!source.isPublic && source.ownerId !== ownerId)) {
        throw new DeckError('Bộ từ này không được chia sẻ hoặc không tồn tại trong server.');
      }
      const count = this.sqlite.prepare('SELECT count(*) AS n FROM decks WHERE guild_id = ? AND owner_id = ?')
        .get(guildId, ownerId) as { n: number };
      if (count.n >= 25) throw new DeckError('Bạn đã có 25 bộ từ. Hãy xóa bớt trước khi sao chép.');
      const created = this.sqlite.prepare(`
        INSERT INTO decks (guild_id, owner_id, name, name_key, description)
        VALUES (?, ?, ?, ?, ?)
      `).run(guildId, ownerId, name, nameKey, source.description);
      const newId = Number(created.lastInsertRowid);
      this.sqlite.prepare(`
        INSERT INTO deck_words (deck_id, entry_id)
          SELECT ?, entry_id FROM deck_words WHERE deck_id = ?
      `).run(newId, sourceDeckId);
      this.sqlite.prepare(`
        INSERT OR IGNORE INTO saved_words (guild_id, user_id, entry_id)
          SELECT ?, ?, entry_id FROM deck_words WHERE deck_id = ?
      `).run(guildId, ownerId, newId);
      const deck = this.get(guildId, newId);
      if (!deck) throw new Error('Copied deck could not be found.');
      return deck;
    })();
  }
}

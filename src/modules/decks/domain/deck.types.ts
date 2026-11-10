export type Deck = {
  id: number;
  guildId: string;
  ownerId: string;
  name: string;
  description: string;
  isPublic: boolean;
  createdAt: string;
  wordCount: number;
};

export type DeckWord = { entryId: number; addedAt: string };

export type DeckPage = {
  deck: Deck;
  words: DeckWord[];
  page: number;
  totalPages: number;
};

export type NewDeck = {
  guildId: string;
  ownerId: string;
  name: string;
  nameKey: string;
  description: string;
};

export class DeckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeckError';
  }
}

export interface DeckRepository {
  get(guildId: string, deckId: number): Deck | null;
  listOwned(guildId: string, ownerId: string): Deck[];
  listPublic(guildId: string, limit: number): Deck[];
  create(data: NewDeck): Deck;
  delete(guildId: string, ownerId: string, deckId: number): boolean;
  setPublic(guildId: string, ownerId: string, deckId: number, enabled: boolean): Deck;
  addWord(guildId: string, userId: string, deckId: number, entryId: number): boolean;
  removeWord(deckId: number, entryId: number): boolean;
  moveWord(sourceDeckId: number, destinationDeckId: number, entryId: number): boolean;
  hasWord(deckId: number, entryId: number): boolean;
  listWords(deckId: number, limit: number, offset: number): DeckWord[];
  copy(guildId: string, ownerId: string, sourceDeckId: number, name: string, nameKey: string): Deck;
}

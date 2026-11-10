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
  get(guildId: string, deckId: number): Deck | null | Promise<Deck | null>;
  listOwned(guildId: string, ownerId: string): Deck[] | Promise<Deck[]>;
  listPublic(guildId: string, limit: number): Deck[] | Promise<Deck[]>;
  create(data: NewDeck): Deck | Promise<Deck>;
  delete(guildId: string, ownerId: string, deckId: number): boolean | Promise<boolean>;
  setPublic(guildId: string, ownerId: string, deckId: number, enabled: boolean): Deck | Promise<Deck>;
  addWord(guildId: string, userId: string, deckId: number, entryId: number): boolean | Promise<boolean>;
  removeWord(deckId: number, entryId: number): boolean | Promise<boolean>;
  moveWord(sourceDeckId: number, destinationDeckId: number, entryId: number): boolean | Promise<boolean>;
  hasWord(deckId: number, entryId: number): boolean | Promise<boolean>;
  listWords(deckId: number, limit: number, offset: number): DeckWord[] | Promise<DeckWord[]>;
  copy(guildId: string, ownerId: string, sourceDeckId: number, name: string, nameKey: string): Deck | Promise<Deck>;
}

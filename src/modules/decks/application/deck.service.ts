import type { DictionaryService } from '../../dictionary/application/dictionary.service.js';
import type { DictionaryEntry } from '../../dictionary/domain/dictionary.types.js';
import type { Deck, DeckRepository } from '../domain/deck.types.js';
import { DeckError } from '../domain/deck.types.js';

export type DeckView = {
  deck: Deck;
  items: { entry: DictionaryEntry; addedAt: string }[];
  page: number;
  totalPages: number;
};

function validName(input: string): { name: string; key: string } {
  const name = input.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const length = [...name].length;
  if (length < 1 || length > 40) throw new DeckError('Tên bộ từ phải từ 1 đến 40 ký tự.');
  return { name, key: name.toLocaleLowerCase('vi-VN') };
}

function validDescription(input: string): string {
  const description = input.normalize('NFC').trim();
  if ([...description].length > 160) throw new DeckError('Mô tả bộ từ tối đa 160 ký tự.');
  return description;
}

function validId(input: number): number {
  if (!Number.isSafeInteger(input) || input <= 0) throw new DeckError('Mã bộ từ hoặc mã mục từ không hợp lệ.');
  return input;
}

export class DeckService {
  static readonly PAGE_SIZE = 10;

  constructor(
    private readonly repository: DeckRepository,
    private readonly dictionary: DictionaryService,
  ) {}

  async listOwned(guildId: string, userId: string): Promise<Deck[]> {
    return this.repository.listOwned(guildId, userId);
  }

  async listPublic(guildId: string): Promise<Deck[]> {
    return this.repository.listPublic(guildId, 15);
  }

  async create(guildId: string, userId: string, rawName: string, rawDescription = ''): Promise<Deck> {
    if ((await this.listOwned(guildId, userId)).length >= 25) {
      throw new DeckError('Bạn đã có tối đa 25 bộ từ trong server này.');
    }
    const { name, key } = validName(rawName);
    const description = validDescription(rawDescription);
    try {
      return await this.repository.create({ guildId, ownerId: userId, name, nameKey: key, description });
    } catch (error) {
      if (isUniqueError(error)) throw new DeckError('Bạn đã có một bộ từ cùng tên trong server này.');
      throw error;
    }
  }

  async getVisible(guildId: string, userId: string, deckId: number): Promise<Deck> {
    const deck = await this.repository.get(guildId, validId(deckId));
    if (!deck || (!deck.isPublic && deck.ownerId !== userId)) {
      throw new DeckError('Không tìm thấy bộ từ hoặc bộ này đang ở chế độ riêng tư.');
    }
    return deck;
  }

  private async getOwned(guildId: string, userId: string, deckId: number): Promise<Deck> {
    const deck = await this.repository.get(guildId, validId(deckId));
    if (!deck || deck.ownerId !== userId) {
      throw new DeckError('Không tìm thấy bộ từ thuộc quyền sở hữu của bạn.');
    }
    return deck;
  }

  async view(guildId: string, userId: string, deckId: number, requestedPage = 1): Promise<DeckView> {
    const deck = await this.getVisible(guildId, userId, deckId);
    const totalPages = Math.max(1, Math.ceil(deck.wordCount / DeckService.PAGE_SIZE));
    const page = Number.isSafeInteger(requestedPage)
      ? Math.max(1, Math.min(requestedPage, totalPages)) : 1;
    const words = await this.repository.listWords(deck.id, DeckService.PAGE_SIZE, (page - 1) * DeckService.PAGE_SIZE);
    const items = words.flatMap((w) => {
      const entry = this.dictionary.getById(w.entryId);
      return entry ? [{ entry, addedAt: w.addedAt }] : [];
    });
    return { deck, items, page, totalPages };
  }

  async add(guildId: string, userId: string, deckId: number, entryId: number): Promise<boolean> {
    await this.getOwned(guildId, userId, deckId);
    if (!this.dictionary.getById(validId(entryId))) {
      throw new DeckError('Không tìm thấy mã từ trong CVDICT. Hãy dùng /tudien để tra lại.');
    }
    return this.repository.addWord(guildId, userId, deckId, entryId);
  }

  async remove(guildId: string, userId: string, deckId: number, entryId: number): Promise<boolean> {
    await this.getOwned(guildId, userId, deckId);
    return this.repository.removeWord(deckId, validId(entryId));
  }

  async move(guildId: string, userId: string, from: number, to: number, entryId: number): Promise<boolean> {
    await this.getOwned(guildId, userId, from);
    await this.getOwned(guildId, userId, to);
    if (from === to) throw new DeckError('Bộ nguồn và bộ đích phải khác nhau.');
    return this.repository.moveWord(from, to, validId(entryId));
  }

  async visibility(guildId: string, userId: string, deckId: number, enabled: boolean): Promise<Deck> {
    await this.getOwned(guildId, userId, deckId);
    return this.repository.setPublic(guildId, userId, deckId, enabled);
  }

  async copy(guildId: string, userId: string, sourceDeckId: number, targetName?: string): Promise<Deck> {
    const source = await this.getVisible(guildId, userId, sourceDeckId);
    const defaultName = `${[...source.name].slice(0, 29).join('')} (bản sao)`;
    const { name, key } = validName(targetName || defaultName);
    try {
      return await this.repository.copy(guildId, userId, source.id, name, key);
    } catch (error) {
      if (isUniqueError(error)) throw new DeckError('Tên bộ từ đã tồn tại. Hãy nhập tên khác khi sao chép.');
      throw error;
    }
  }

  async delete(guildId: string, userId: string, deckId: number): Promise<boolean> {
    await this.getOwned(guildId, userId, deckId);
    return this.repository.delete(guildId, userId, deckId);
  }
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Error && /(UNIQUE constraint failed|duplicate key value)/u.test(error.message);
}

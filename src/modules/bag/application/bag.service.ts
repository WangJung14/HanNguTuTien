import type { DictionaryEntry } from '../../dictionary/domain/dictionary.types.js';
import type { DictionaryService } from '../../dictionary/application/dictionary.service.js';
import type { BagRepository } from '../domain/bag.types.js';

export type BagItem = { entry: DictionaryEntry; savedAt: string };
export type BagPage = { items: BagItem[]; total: number; page: number; totalPages: number };

export class BagService {
  static readonly PAGE_SIZE = 10;
  constructor(
    private readonly repository: BagRepository,
    private readonly dictionary: DictionaryService,
  ) {}

  save(guildId: string, userId: string, entryId: number) {
    const entry = this.dictionary.getById(entryId);
    if (!entry) throw new Error('Không tìm thấy mục từ trong CVDICT.');
    return { created: this.repository.add(guildId, userId, entryId), entry };
  }

  remove(guildId: string, userId: string, entryId: number): boolean {
    return this.repository.remove(guildId, userId, entryId);
  }

  list(guildId: string, userId: string, requestedPage = 1): BagPage {
    const total = this.repository.count(guildId, userId);
    const totalPages = Math.max(1, Math.ceil(total / BagService.PAGE_SIZE));
    const page = Math.max(1, Math.min(Math.floor(requestedPage), totalPages));
    const saved = this.repository.list(
      guildId, userId, BagService.PAGE_SIZE, (page - 1) * BagService.PAGE_SIZE,
    );
    const items = saved.flatMap(({ entryId, savedAt }) => {
      const entry = this.dictionary.getById(entryId);
      return entry ? [{ entry, savedAt }] : [];
    });
    return { items, total, page, totalPages };
  }
}

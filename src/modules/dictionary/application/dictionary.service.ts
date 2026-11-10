import type { DictionaryEntry, DictionaryRepository, SearchMode } from '../domain/dictionary.types.js';
import { normalizePinyin } from '../domain/pinyin.js';

export type DictionarySearchResult = {
  query: string;
  mode: Exclude<SearchMode, 'auto'>;
  entries: DictionaryEntry[];
};

export class DictionaryService {
  constructor(private readonly repository: DictionaryRepository) {}

  getById(id: number): DictionaryEntry | null {
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return this.repository.findById(id);
  }

  search(rawQuery: string, mode: SearchMode = 'auto'): DictionarySearchResult {
    const query = rawQuery.trim().normalize('NFC');
    if (!query) throw new Error('Bạn cần nhập từ muốn tra.');
    if ([...query].length > 64) throw new Error('Từ khóa tối đa 64 ký tự.');
    const limit = 5;
    if (mode === 'hanzi' || (mode === 'auto' && /\p{Script=Han}/u.test(query))) {
      return { query, mode: 'hanzi', entries: this.repository.findHanzi(query, limit) };
    }
    if (mode === 'pinyin') {
      return { query, mode, entries: this.repository.findPinyin(normalizePinyin(query), limit) };
    }
    if (mode === 'vi') {
      return { query, mode, entries: this.repository.findVietnamese(query, limit) };
    }
    // Auto mode: try Pinyin first for Latin input, then Vietnamese meaning.
    // Ambiguous cases ('ban', 'ma') can be forced using the "Kiểu tìm kiếm" option.
    const pinyin = this.repository.findPinyin(normalizePinyin(query), limit);
    if (pinyin.length) return { query, mode: 'pinyin', entries: pinyin };
    return { query, mode: 'vi', entries: this.repository.findVietnamese(query, limit) };
  }
}

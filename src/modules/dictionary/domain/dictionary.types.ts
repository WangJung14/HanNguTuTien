export type DictionaryEntry = {
  id: number;
  simplified: string;
  traditional: string;
  pinyinRaw: string;
  source: string;
  meanings: string[];
};

export type SearchMode = 'auto' | 'hanzi' | 'pinyin' | 'vi';

export interface DictionaryRepository {
  findById(id: number): DictionaryEntry | null;
  findHanzi(query: string, limit: number): DictionaryEntry[];
  findPinyin(normalized: string, limit: number): DictionaryEntry[];
  findVietnamese(query: string, limit: number): DictionaryEntry[];
}

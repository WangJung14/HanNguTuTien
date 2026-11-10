import { describe, expect, it } from 'vitest';
import { DictionaryService } from '../src/modules/dictionary/application/dictionary.service.js';
import type { DictionaryEntry, DictionaryRepository } from '../src/modules/dictionary/domain/dictionary.types.js';

const sample: DictionaryEntry = {
  id: 1, simplified: '学习', traditional: '學習',
  pinyinRaw: 'xue2 xi2', source: 'CVDICT', meanings: ['học', 'tìm hiểu'],
};
const repository: DictionaryRepository = {
  findById: (id) => id === 1 ? sample : null,
  findHanzi: (q) => q === '学习' ? [sample] : [],
  findPinyin: (q) => q === 'xuexi' ? [sample] : [],
  findVietnamese: (q) => q === 'học' ? [sample] : [],
};
const service = new DictionaryService(repository);

describe('DictionaryService', () => {
  it('searches Hanzi in auto mode', () => {
    expect(service.search('学习').entries[0]?.simplified).toBe('学习');
  });
  it('normalizes pinyin for query', () => {
    expect(service.search('xuéxí', 'pinyin').entries[0]?.id).toBe(1);
  });
  it('looks up Vietnamese definitions', () => {
    expect(service.search('học', 'vi').entries[0]?.id).toBe(1);
  });
  it('rejects empty queries', () => {
    expect(() => service.search(' ')).toThrow();
  });
});

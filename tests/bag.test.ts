import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import { DictionaryService } from '../src/modules/dictionary/application/dictionary.service.js';
import type { DictionaryEntry, DictionaryRepository } from '../src/modules/dictionary/domain/dictionary.types.js';
import { applyProgressMigrations } from '../src/modules/bag/infrastructure/migrations.js';
import { SqliteBagRepository } from '../src/modules/bag/infrastructure/sqlite-bag.repository.js';
import { BagService } from '../src/modules/bag/application/bag.service.js';

const sample: DictionaryEntry = {
  id: 42, simplified: '学习', traditional: '學習', pinyinRaw: 'xue2 xi2',
  source: 'CVDICT', meanings: ['học tập'],
};
const dictionaryRepository: DictionaryRepository = {
  findById: (id) => id === 42 ? sample : null,
  findHanzi: () => [], findPinyin: () => [], findVietnamese: () => [],
};

function createService() {
  const sqlite = new Database(':memory:');
  applyProgressMigrations(sqlite);
  const repository = new SqliteBagRepository(drizzle(sqlite));
  return { service: new BagService(repository, new DictionaryService(dictionaryRepository)), sqlite };
}

describe('Túi Càn Khôn', () => {
  it('migrates progress database and saves a word once', async () => {
    const { service, sqlite } = createService();
    expect((await service.save('guild1', 'user1', 42)).created).toBe(true);
    expect((await service.save('guild1', 'user1', 42)).created).toBe(false);
    expect((await service.list('guild1', 'user1')).total).toBe(1);
    sqlite.close();
  });

  it('isolates words by user and guild', async () => {
    const { service, sqlite } = createService();
    await service.save('guild1', 'user1', 42);
    expect((await service.list('guild1', 'user2')).total).toBe(0);
    expect((await service.list('guild2', 'user1')).total).toBe(0);
    sqlite.close();
  });

  it('removes own word without touching others', async () => {
    const { service, sqlite } = createService();
    await service.save('guild1', 'user1', 42);
    await service.save('guild1', 'user2', 42);
    expect(await service.remove('guild1', 'user1', 42)).toBe(true);
    expect(await service.remove('guild1', 'user1', 42)).toBe(false);
    expect((await service.list('guild1', 'user1')).total).toBe(0);
    expect((await service.list('guild1', 'user2')).total).toBe(1);
    sqlite.close();
  });

  it('rejects invalid dictionary entry IDs', async () => {
    const { service, sqlite } = createService();
    await expect(service.save('guild1', 'user1', 999)).rejects.toThrow();
    sqlite.close();
  });
});

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyProgressMigrations } from '../src/modules/bag/infrastructure/migrations.js';
import { applyDeckMigrations } from '../src/modules/decks/infrastructure/migrations.js';
import { SqliteDeckRepository } from '../src/modules/decks/infrastructure/sqlite-deck.repository.js';
import { DeckService } from '../src/modules/decks/application/deck.service.js';
import { DictionaryService } from '../src/modules/dictionary/application/dictionary.service.js';
import type { DictionaryEntry, DictionaryRepository } from '../src/modules/dictionary/domain/dictionary.types.js';

const samples: DictionaryEntry[] = [
  { id: 42, traditional: '學習', simplified: '学习', pinyinRaw: 'xue2 xi2', meanings: ['học tập'], source: 'CVDICT' },
  { id: 99, traditional: '朋友', simplified: '朋友', pinyinRaw: 'peng2 you3', meanings: ['bạn bè'], source: 'CVDICT' },
];
const dictionaryRepo: DictionaryRepository = {
  findById: (id) => samples.find((w) => w.id === id) ?? null,
  findHanzi: () => [],
  findPinyin: () => [],
  findVietnamese: () => [],
};

function setup() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyProgressMigrations(sqlite);
  applyDeckMigrations(sqlite);
  const repository = new SqliteDeckRepository(sqlite);
  const service = new DeckService(repository, new DictionaryService(dictionaryRepo));
  return { sqlite, repository, service };
}

describe('Phase 2.1 - Bộ Từ Vựng', () => {
  it('upgrades existing Phase 2 database from version 1 without losing saved_words', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    applyProgressMigrations(sqlite);
    sqlite.prepare('INSERT INTO saved_words(guild_id,user_id,entry_id) VALUES(?,?,?)').run('guild1', 'alice', 42);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(1);
    applyDeckMigrations(sqlite);
    applyProgressMigrations(sqlite);
    applyDeckMigrations(sqlite);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(2);
    const count = sqlite.prepare('SELECT count(*) AS n FROM saved_words').get() as { n: number };
    expect(count.n).toBe(1);
    sqlite.close();
  });

  it('creates a private deck, normalizes its name, and prevents duplicates per owner', () => {
    const { service, sqlite } = setup();
    const deck = service.create('guild1', 'alice', '  Gia    Đình  ', '10 từ đầu tiên');
    expect(deck.name).toBe('Gia Đình');
    expect(deck.isPublic).toBe(false);
    expect(service.listOwned('guild1', 'alice')).toHaveLength(1);
    expect(() => service.create('guild1', 'alice', 'gia đình')).toThrow('cùng tên');
    expect(service.create('guild1', 'bob', 'gia đình').ownerId).toBe('bob');
    sqlite.close();
  });

  it('adds a dictionary entry to a deck AND its owner bag without duplicates', () => {
    const { service, sqlite } = setup();
    const id = service.create('guild1', 'alice', 'HSK1').id;
    expect(service.add('guild1', 'alice', id, 42)).toBe(true);
    expect(service.add('guild1', 'alice', id, 42)).toBe(false);
    expect(service.view('guild1', 'alice', id).items[0]?.entry.simplified).toBe('学习');
    const saved = sqlite.prepare('SELECT count(*) AS n FROM saved_words WHERE guild_id=? AND user_id=?').get('guild1', 'alice') as { n: number };
    expect(saved.n).toBe(1);
    sqlite.close();
  });

  it('disallows adding a missing dictionary ID', () => {
    const { service, sqlite } = setup();
    const id = service.create('guild1', 'alice', 'HSK1').id;
    expect(() => service.add('guild1', 'alice', id, 1000000)).toThrow('CVDICT');
    expect(service.view('guild1', 'alice', id).deck.wordCount).toBe(0);
    sqlite.close();
  });

  it('refuses to edit other users decks or other guild decks', () => {
    const { service, sqlite } = setup();
    const id = service.create('guild1', 'alice', 'Gia đình').id;
    expect(() => service.add('guild1', 'bob', id, 42)).toThrow('quyền sở hữu');
    expect(() => service.add('guild2', 'alice', id, 42)).toThrow('quyền sở hữu');
    expect(() => service.visibility('guild1', 'bob', id, true)).toThrow('quyền sở hữu');
    sqlite.close();
  });

  it('keeps a private deck invisible to other users', () => {
    const { service, sqlite } = setup();
    const id = service.create('guild1', 'alice', 'Bí kíp').id;
    expect(() => service.view('guild1', 'bob', id)).toThrow('riêng tư');
    expect(() => service.copy('guild1', 'bob', id)).toThrow('riêng tư');
    sqlite.close();
  });

  it('shares a public deck within guild and copies it as an independent private deck', () => {
    const { service, sqlite } = setup();
    const id = service.create('guild1', 'alice', 'HSK1').id;
    service.add('guild1', 'alice', id, 42);
    service.add('guild1', 'alice', id, 99);
    service.visibility('guild1', 'alice', id, true);
    expect(service.listPublic('guild1').map((d) => d.id)).toContain(id);
    expect(service.view('guild1', 'bob', id).deck.wordCount).toBe(2);
    const clone = service.copy('guild1', 'bob', id);
    expect(clone.id).not.toBe(id);
    expect(clone.isPublic).toBe(false);
    expect(clone.wordCount).toBe(2);
    service.remove('guild1', 'bob', clone.id, 42);
    expect(service.view('guild1', 'alice', id).deck.wordCount).toBe(2);
    expect(service.view('guild1', 'bob', clone.id).deck.wordCount).toBe(1);
    const savedBob = sqlite.prepare('SELECT count(*) AS n FROM saved_words WHERE guild_id=? AND user_id=?')
      .get('guild1', 'bob') as { n: number };
    expect(savedBob.n).toBe(2);
    sqlite.close();
  });

  it('forbids sharing across guilds even if a deck is public', () => {
    const { service, sqlite } = setup();
    const id = service.create('guild1', 'alice', 'HSK1').id;
    service.visibility('guild1', 'alice', id, true);
    expect(() => service.view('guild2', 'bob', id)).toThrow();
    expect(() => service.copy('guild2', 'bob', id)).toThrow();
    sqlite.close();
  });

  it('moves a word between owned decks and keeps it in personal bag', () => {
    const { service, sqlite } = setup();
    const from = service.create('guild1', 'alice', 'Nguồn').id;
    const to = service.create('guild1', 'alice', 'Đích').id;
    service.add('guild1', 'alice', from, 42);
    expect(service.move('guild1', 'alice', from, to, 42)).toBe(true);
    expect(service.view('guild1', 'alice', from).deck.wordCount).toBe(0);
    expect(service.view('guild1', 'alice', to).deck.wordCount).toBe(1);
    expect(service.move('guild1', 'alice', from, to, 42)).toBe(false);
    const saved = sqlite.prepare('SELECT count(*) AS n FROM saved_words').get() as { n: number };
    expect(saved.n).toBe(1);
    sqlite.close();
  });

  it('deletes only owner deck (cascade words) but does not delete bag entries', () => {
    const { service, sqlite } = setup();
    const id = service.create('guild1', 'alice', 'Bộ xóa').id;
    service.add('guild1', 'alice', id, 42);
    expect(() => service.delete('guild1', 'bob', id)).toThrow();
    expect(service.delete('guild1', 'alice', id)).toBe(true);
    expect(service.listOwned('guild1', 'alice')).toHaveLength(0);
    const deckWords = sqlite.prepare('SELECT count(*) AS n FROM deck_words').get() as { n: number };
    const bagWords = sqlite.prepare('SELECT count(*) AS n FROM saved_words').get() as { n: number };
    expect(deckWords.n).toBe(0);
    expect(bagWords.n).toBe(1);
    sqlite.close();
  });
});

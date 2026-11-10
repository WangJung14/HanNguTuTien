import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyProgressMigrations } from '../src/modules/bag/infrastructure/migrations.js';
import { SqliteDeckRepository } from '../src/modules/decks/infrastructure/sqlite-deck.repository.js';
import { DeckService } from '../src/modules/decks/application/deck.service.js';
import { DictionaryService } from '../src/modules/dictionary/application/dictionary.service.js';
import type { DictionaryEntry, DictionaryRepository } from '../src/modules/dictionary/domain/dictionary.types.js';
import { applyDeckMigrations } from '../src/modules/decks/infrastructure/migrations.js';
import { applyDictationMigrations } from '../src/modules/dictation/infrastructure/migrations.js';
import { gradeAnswer } from '../src/modules/dictation/domain/answer-grader.js';
import { chooseQuestions, eligibleQuestions } from '../src/modules/dictation/domain/question-selection.js';
import { DictationService } from '../src/modules/dictation/application/dictation.service.js';
import { SqliteDictationRepository } from '../src/modules/dictation/infrastructure/sqlite-dictation.repository.js';
import { DictationAudioError } from '../src/modules/dictation/domain/dictation.types.js';

const words: DictionaryEntry[] = [
  { id: 1, simplified: '学习', traditional: '學習', pinyinRaw: 'xue2 xi2', meanings: ['học tập'], source: 'CVDICT' },
  { id: 2, simplified: '朋友', traditional: '朋友', pinyinRaw: 'peng2 you3', meanings: ['bạn bè'], source: 'CVDICT' },
  { id: 3, simplified: '谢谢', traditional: '謝謝', pinyinRaw: 'xie4 xie5', meanings: ['cảm ơn'], source: 'CVDICT' },
  { id: 4, simplified: '老师', traditional: '老師', pinyinRaw: 'lao3 shi1', meanings: ['giáo viên'], source: 'CVDICT' },
  { id: 5, simplified: '中国', traditional: '中國', pinyinRaw: 'zhong1 guo2', meanings: ['Trung Quốc'], source: 'CVDICT' },
  { id: 6, simplified: '你好', traditional: '你好', pinyinRaw: 'ni3 hao3', meanings: ['xin chào'], source: 'CVDICT' },
  { id: 7, simplified: '行', traditional: '行', pinyinRaw: 'xing2', meanings: ['được'], source: 'CVDICT' },
  { id: 8, simplified: '行', traditional: '行', pinyinRaw: 'hang2', meanings: ['hàng'], source: 'CVDICT' },
  ...[...'一二三四五六七八九十天地玄黄'].map((hanzi, index) => ({
    id: index + 9,
    simplified: `词${hanzi}`,
    traditional: `詞${hanzi}`,
    pinyinRaw: `ci2 ${index % 2 ? 'yi1' : 'er4'}`,
    meanings: [`nghĩa kiểm thử ${index + 1}`],
    source: 'CVDICT' as const,
  })),
];

const dictionaryRepository: DictionaryRepository = {
  findById: (id) => words.find((word) => word.id === id) ?? null,
  findHanzi: () => [],
  findPinyin: () => [],
  findVietnamese: () => [],
};

async function setup(wordCount = 6) {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyProgressMigrations(sqlite);
  applyDeckMigrations(sqlite);
  applyDictationMigrations(sqlite);
  const dictionary = new DictionaryService(dictionaryRepository);
  const deckRepository = new SqliteDeckRepository(sqlite);
  const decks = new DeckService(deckRepository, dictionary);
  const dictationRepository = new SqliteDictationRepository(sqlite);
  const audio = { synthesize: async () => ({ data: Buffer.from('wav'), format: 'wav' as const }) };
  const service = new DictationService(dictationRepository, decks, dictionary, audio);
  const deck = await decks.create('guild-1', 'user-1', 'Từ căn bản');
  for (const word of eligibleQuestions(words).slice(0, wordCount)) await decks.add('guild-1', 'user-1', deck.id, word.entryId);
  return { sqlite, dictionary, decks, deck, dictationRepository, service };
}

describe('Dictation answer grading', () => {
  it('ignores whitespace and punctuation and accepts simplified or traditional forms', () => {
    const question = { simplified: '学习', traditional: '學習' };
    expect(gradeAnswer(' 学习。 ', question)).toBe(true);
    expect(gradeAnswer('學 習！', question)).toBe(true);
    expect(gradeAnswer('学学习', question)).toBe(false);
    expect(gradeAnswer('   ', question)).toBe(false);
  });
});

describe('Dictation question selection', () => {
  it('excludes ambiguous readings and selects unique words without replacement', () => {
    const eligible = eligibleQuestions(words);
    expect(eligible.map((question) => question.simplified)).not.toContain('行');
    const selected = chooseQuestions(eligible, 5, () => 0);
    expect(selected).toHaveLength(5);
    expect(new Set(selected.map((question) => question.simplified)).size).toBe(5);
  });

  it('rejects a count larger than the eligible word pool', () => {
    expect(() => chooseQuestions(eligibleQuestions(words).slice(0, 19), 20)).toThrow('Chỉ có');
  });
});

describe('Dictation sessions and persisted results', () => {
  it('scopes sessions to their owner and guild and saves the answer across repository instances', async () => {
    const { sqlite, deck, service } = await setup();
    const { session } = await service.start('guild-1', 'user-1', deck.id, 5, 'channel-1', () => 0);
    await expect(service.getOwnedSession(session.id, 'guild-1', 'user-2')).rejects.toThrow('Không tìm thấy');
    await expect(service.getOwnedSession(session.id, 'guild-2', 'user-1')).rejects.toThrow('Không tìm thấy');

    const storedSession = await service.getOwnedSession(session.id, 'guild-1', 'user-1');
    const question = await service.getCurrentQuestion(storedSession);
    const saved = await service.submitAnswer(storedSession, 0, question.simplified);
    expect(saved.isCorrect).toBe(true);

    const restartedRepository = new SqliteDictationRepository(sqlite);
    expect((await restartedRepository.findQuestions(session.id))[0]?.answer).toBe(question.simplified);
    expect((await restartedRepository.findQuestions(session.id))[0]?.isCorrect).toBe(true);
    sqlite.close();
  });

  it('rejects duplicate submissions for the same question', async () => {
    const { sqlite, deck, service, dictationRepository } = await setup();
    const { session } = await service.start('guild-1', 'user-1', deck.id, 5, 'channel-1', () => 0);
    const current = await service.getOwnedSession(session.id, 'guild-1', 'user-1');
    const answer = (await service.getCurrentQuestion(current)).simplified;
    await service.submitAnswer(current, 0, answer);
    await expect(service.submitAnswer(current, 0, answer)).rejects.toThrow('đã được chấm');
    const now = new Date().toISOString();
    expect(await dictationRepository.submitAnswer(
      session.id, 0, answer, true, now, new Date(Date.now() + 60_000).toISOString(),
    )).toBe(false);
    sqlite.close();
  });

  it('expires stale sessions and releases the one-active-session constraint', async () => {
    const { sqlite, deck, service, dictationRepository } = await setup();
    const { session } = await service.start('guild-1', 'user-1', deck.id, 5, 'channel-1', () => 0);
    sqlite.prepare(`UPDATE dictation_sessions SET expires_at = ? WHERE id = ?`)
      .run('2000-01-01T00:00:00.000Z', session.id);
    expect(await service.getActiveSession('guild-1', 'user-1')).toBeNull();
    expect((await dictationRepository.findSession(session.id))?.status).toBe('expired');
    await expect(service.getOwnedSession(session.id, 'guild-1', 'user-1')).rejects.toThrow('hết hạn');
    const replacement = await service.start('guild-1', 'user-1', deck.id, 5, 'channel-1', () => 0);
    expect(replacement.session.status).toBe('active');
    sqlite.close();
  });

  it('does not create a session when first-question audio generation fails', async () => {
    const { sqlite, dictionary, decks, deck } = await setup();
    const repository = new SqliteDictationRepository(sqlite);
    const audio = {
      synthesize: async () => {
        throw new DictationAudioError('Audio is unavailable.');
      },
    };
    const service = new DictationService(repository, decks, dictionary, audio);
    await expect(service.start('guild-1', 'user-1', deck.id, 5, 'channel-1')).rejects
      .toThrow('Audio is unavailable.');
    expect(await service.getActiveSession('guild-1', 'user-1')).toBeNull();
    sqlite.close();
  });

  it('advances paper mode without a Discord answer and reveals only words reached so far', async () => {
    const { sqlite, deck, service, dictationRepository } = await setup();
    const { session } = await service.start(
      'guild-1', 'user-1', deck.id, 5, 'channel-1', () => 0, 'paper',
    );
    expect(session.mode).toBe('paper');
    expect(await service.getReadQuestions(session)).toHaveLength(1);

    const advanced = await service.advance(session, 0);
    expect(advanced.session.currentIndex).toBe(1);
    expect(await service.getReadQuestions(advanced.session)).toHaveLength(2);
    expect((await dictationRepository.findQuestions(session.id))[0]?.answer).toBeNull();
    sqlite.close();
  });

  it('shows and submits a 20-question Discord worksheet in groups of ten', async () => {
    const { sqlite, deck, service } = await setup(20);
    const started = await service.start('guild-1', 'user-1', deck.id, 20, 'channel-1', () => 0);
    expect(started.worksheet).toMatchObject({ batchStart: 0, batchEnd: 10 });
    expect(started.worksheet?.audios).toHaveLength(10);

    let current = started.session;
    for (const formStart of [0, 5, 10, 15]) {
      const all = await service.getResults(current.id);
      const answers = all.slice(formStart, formStart + 5).map((question) => question.simplified);
      const submitted = await service.submitWorksheetBatch(current, formStart, answers);
      current = submitted.session;
      expect(submitted.answered).toHaveLength(5);
      if (formStart === 5) {
        const next = await service.prepareWorksheet(current);
        expect(next).toMatchObject({ batchStart: 10, batchEnd: 20 });
        expect(next.audios).toHaveLength(10);
      }
    }
    expect(current).toMatchObject({ status: 'completed', currentIndex: 20 });
    expect((await service.getResults(current.id)).every((question) => question.isCorrect)).toBe(true);
    sqlite.close();
  });

  it('upgrades progress schema to v4 without losing existing bag data', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    applyProgressMigrations(sqlite);
    applyDeckMigrations(sqlite);
    sqlite.prepare('INSERT INTO saved_words(guild_id, user_id, entry_id) VALUES (?, ?, ?)')
      .run('guild-1', 'user-1', 1);
    applyDictationMigrations(sqlite);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(4);
    expect(sqlite.prepare('SELECT count(*) AS count FROM saved_words').get()).toEqual({ count: 1 });
    sqlite.close();
  });
});

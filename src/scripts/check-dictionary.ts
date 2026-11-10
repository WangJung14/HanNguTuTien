import { openDictionary } from '../shared/database/open-dictionary.js';
import { DictionaryService, SqliteDictionaryRepository } from '../modules/dictionary/index.js';

const connection = openDictionary();
try {
  const service = new DictionaryService(new SqliteDictionaryRepository(connection.db, connection.sqlite));
  for (const [query, mode] of [
    ['学习', 'hanzi'], ['學習', 'hanzi'], ['xuexi', 'pinyin'], ['học', 'vi'],
  ] as const) {
    const result = service.search(query, mode);
    console.log(`${query} (${mode}): ${result.entries.length} results`);
    for (const e of result.entries.slice(0, 2)) {
      console.log(`  ${e.simplified} [${e.pinyinRaw}] → ${e.meanings.slice(0, 3).join('; ')}`);
    }
  }
} finally {
  connection.close();
}

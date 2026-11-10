import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Maps the REAL tables in the user's cvdict.sqlite copy. Do not run schema push
// on the source database. "pinyin_plain" is added by prepare_dictionary.py.
export const entries = sqliteTable('entries', {
  id: integer('id').primaryKey(),
  traditional: text('traditional').notNull(),
  simplified: text('simplified').notNull(),
  pinyinRaw: text('pinyin_raw').notNull(),
  pinyinPlain: text('pinyin_plain'),
  source: text('source').notNull(),
});

export const meanings = sqliteTable('meanings', {
  id: integer('id').primaryKey(),
  entryId: integer('entry_id').notNull(),
  meaningVi: text('meaning_vi').notNull(),
});

import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getDictionaryPath } from '../../config/env.js';

export function openDictionary() {
  const path = getDictionaryPath();
  if (!existsSync(path)) {
    throw new Error(`Dictionary not found: ${path}. Run scripts/prepare_dictionary.py first.`);
  }
  const sqlite = new Database(path, { readonly: true, fileMustExist: true });
  sqlite.pragma('query_only = ON');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  return { sqlite, db, close: () => sqlite.close() };
}

export type DictionaryDb = ReturnType<typeof openDictionary>['db'];

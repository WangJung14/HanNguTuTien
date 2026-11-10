import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getProgressPath } from '../../config/env.js';
import { applyProgressMigrations } from '../../modules/bag/infrastructure/migrations.js';
import { applyDeckMigrations } from '../../modules/decks/infrastructure/migrations.js';
import { applyDictationMigrations } from '../../modules/dictation/infrastructure/migrations.js';
import { applyCultivationMigrations } from '../../modules/cultivation/infrastructure/migrations.js';
import { applyPhase41Migrations } from '../../modules/quests/infrastructure/migrations.js';
import { applyMountainMigrations } from '../../modules/mountain/infrastructure/migrations.js';
import { applyPveMigrations } from '../../modules/pve/infrastructure/migrations.js';

export function openProgress() {
  const path = getProgressPath();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  applyProgressMigrations(sqlite);
  applyDeckMigrations(sqlite);
  applyDictationMigrations(sqlite);
  applyCultivationMigrations(sqlite);
  applyPhase41Migrations(sqlite);
  applyMountainMigrations(sqlite);
  applyPveMigrations(sqlite);
  return { db: drizzle(sqlite), sqlite, close: () => sqlite.close() };
}

export type ProgressDb = ReturnType<typeof openProgress>['db'];

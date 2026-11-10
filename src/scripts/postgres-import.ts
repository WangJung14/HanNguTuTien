import 'dotenv/config';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { openPostgres, progressTables } from './postgres-common.js';

const sourcePath = resolve(process.env.PROGRESS_DB_PATH || './data/progress.sqlite');
const sqlite = new Database(sourcePath, { readonly: true });
const pg = openPostgres();
try {
  const existingTables = new Set((sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map(x => x.name));
  const countRows = await pg<{ count: string }[]>`SELECT count(*)::text AS count FROM xp_ledger`;
  const resetTarget = process.env.RESET_TARGET_BEFORE_IMPORT === 'true';
  if (Number(countRows[0]?.count ?? 0) > 0 && process.env.ALLOW_NONEMPTY_IMPORT !== 'true' && !resetTarget) {
    throw new Error('Target contains progress data. Refusing import; set ALLOW_NONEMPTY_IMPORT=true only for an intentional idempotent retry.');
  }
  await pg.begin(async tx => {
    if (resetTarget) {
      const quoted = progressTables.map(table => `"${table}"`).join(',');
      await tx.unsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
      console.log('Target progress tables truncated for an explicit full cutover import.');
    }
    for (const table of progressTables) {
      if (!existingTables.has(table)) continue;
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
      if (!rows.length) { console.log(`${table}: 0`); continue; }
      const columns = Object.keys(rows[0]!);
      for (let offset = 0; offset < rows.length; offset += 250) {
        const batch = rows.slice(offset, offset + 250);
        const identifier = (tx as unknown as (value: string) => unknown)(table);
        const values = (tx as unknown as (rows: Record<string, unknown>[], ...columns: string[]) => unknown)(batch, ...columns);
        await tx`INSERT INTO ${identifier as never} ${values as never} ON CONFLICT DO NOTHING`;
      }
      console.log(`${table}: ${rows.length}`);
    }
    // Active timers cannot be trusted across migration/deploy boundaries.
    await tx`UPDATE dictation_sessions SET status='expired', updated_at=${new Date().toISOString()} WHERE status='active'`;
    await tx`UPDATE meditation_sessions SET status='ended', ended_at=${new Date().toISOString()}, updated_at=${new Date().toISOString()} WHERE status='active'`;
    await tx`UPDATE mountain_matches SET status='CANCELLED', round_deadline=NULL, updated_at=${new Date().toISOString()} WHERE status='ACTIVE'`;
    await tx`UPDATE pve_runs SET status='CANCELLED', round_deadline=NULL, completed_at=${new Date().toISOString()}, updated_at=${new Date().toISOString()} WHERE status='ACTIVE'`;
  });
  await pg.unsafe(`SELECT setval(pg_get_serial_sequence('decks','id'), GREATEST(COALESCE((SELECT max(id) FROM decks),1),1), true)`);
  await pg.unsafe(`SELECT setval(pg_get_serial_sequence('xp_ledger','id'), GREATEST(COALESCE((SELECT max(id) FROM xp_ledger),1),1), true)`);
  console.log('Import completed. SQLite source was not modified. Run npm run db:pg:verify next.');
} finally {
  sqlite.close();
  await pg.end({ timeout: 5 });
}


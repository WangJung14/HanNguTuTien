import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openPostgres } from './postgres-common.js';

const sql = openPostgres();
try {
  const migration = await readFile(resolve('scripts/postgres/001_schema.sql'), 'utf8');
  await sql.unsafe(migration);
  const [row] = await sql<{ version: number }[]>`SELECT max(version)::int AS version FROM app_schema_migrations`;
  console.log(`PostgreSQL schema is ready at version ${row?.version ?? 0}.`);
} finally {
  await sql.end({ timeout: 5 });
}


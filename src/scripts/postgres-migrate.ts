import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openPostgres } from './postgres-common.js';

const sql = openPostgres();
try {
  const directory = resolve('scripts/postgres');
  const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
  for (const file of files) {
    const migration = await readFile(resolve(directory, file), 'utf8');
    await sql.unsafe(migration);
    console.log(`Applied ${file}`);
  }
  const [row] = await sql<{ version: number }[]>`SELECT max(version)::int AS version FROM app_schema_migrations`;
  console.log(`PostgreSQL schema is ready at version ${row?.version ?? 0}.`);
} finally {
  await sql.end({ timeout: 5 });
}


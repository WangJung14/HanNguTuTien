import { createGzip } from 'node:zlib';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { openPostgres, progressTables } from './postgres-common.js';

await mkdir('backups', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
const path = `backups/supabase-${stamp}.json.gz`;
const pg = openPostgres();
try {
  const data: Record<string, unknown[]> = {};
  const existingRows = await pg<{ tableName: string }[]>`
    SELECT table_name AS "tableName" FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ${pg([...progressTables])}
  `;
  const existing = new Set(existingRows.map((row) => row.tableName));
  for (const table of progressTables) {
    if (existing.has(table)) data[table] = await pg.unsafe(`SELECT * FROM "${table}"`);
  }
  const [migration] = await pg<{ version: number }[]>`
    SELECT COALESCE(MAX(version), 0)::int AS version FROM app_schema_migrations
  `;
  await pipeline(Readable.from([JSON.stringify({ createdAt: new Date().toISOString(), schemaVersion: migration?.version ?? 0, tables: data })]), createGzip({ level: 9 }), createWriteStream(path));
  console.log(`Backup written to ${path}. Store it outside this machine and outside Supabase.`);
} finally { await pg.end({ timeout: 5 }); }


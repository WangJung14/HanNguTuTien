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
  for (const table of progressTables) data[table] = await pg.unsafe(`SELECT * FROM "${table}"`);
  await pipeline(Readable.from([JSON.stringify({ createdAt: new Date().toISOString(), schemaVersion: 1, tables: data })]), createGzip({ level: 9 }), createWriteStream(path));
  console.log(`Backup written to ${path}. Store it outside this machine and outside Supabase.`);
} finally { await pg.end({ timeout: 5 }); }


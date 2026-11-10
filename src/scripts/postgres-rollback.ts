import { openPostgres, progressTables } from './postgres-common.js';
if (process.env.CONFIRM_POSTGRES_ROLLBACK !== 'DELETE_BOT_SCHEMA') throw new Error('Refusing rollback. Set CONFIRM_POSTGRES_ROLLBACK=DELETE_BOT_SCHEMA for this command only.');
const pg = openPostgres();
try {
  await pg.begin(async tx => {
    for (const table of [...progressTables].reverse()) await tx.unsafe(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    await tx`DROP TABLE IF EXISTS app_schema_migrations`;
  });
  console.log('Bot tables removed from PostgreSQL. SQLite source remains untouched.');
} finally { await pg.end({ timeout: 5 }); }
